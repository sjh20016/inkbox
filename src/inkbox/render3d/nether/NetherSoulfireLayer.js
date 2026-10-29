import * as THREE from 'three';
import { deriveInkflameField, normalizeInkflame, INKFLAME_GLSL } from './NetherInkflame.js';
import { decorationFootprintOwned } from '../environment/RealmDecorationLayer.js';

export const SOULFIRE_CAPACITY=24;
/** One read-only mask texture and, only when requested, a fixed tiny plume
 * batch. Positions never follow the camera. The caller supplies render time. */
export class NetherSoulfireLayer {
  constructor(world,coordinates,elevation) {
    this.world=world;this.coordinates=coordinates;this.elevation=elevation;
    this.group=new THREE.Group();this.group.name='NetherInkflame';
    this.options=normalizeInkflame();this.region=null;this.inside=true;this.time=0;this.disposed=false;
    this.texture=new THREE.DataTexture(new Uint8Array(world.size*4),world.w,world.h,THREE.RGBAFormat,THREE.UnsignedByteType);
    this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;this.texture.generateMipmaps=false;
    this.texture.flipY=false;this.texture.unpackAlignment=1;this.texture.colorSpace=THREE.NoColorSpace;
    this.texture.name='NetherInkflame:upper-middle-lower-seep';
    this.stats={rebuilds:0,instanceWrites:0,instances:0,capacity:SOULFIRE_CAPACITY,triangles:0,textureBytes:world.size*4};
    this.rebuild();
  }
  rebuild() {
    if(this.disposed)return;
    this.field=deriveInkflameField(this.world,this.elevation);
    this.texture.image.data.set(this.field.bytes);this.texture.needsUpdate=true;this.stats.rebuilds++;
    if(this.material)this.material.uniforms.nfBand.value.set(...this.field.band);
    this.stats.field=this.field.stats;
    const {w,h}=this.world,stride=Math.max(4,Math.round(Math.min(w,h)/32)),candidates=[];
    for(let y=4;y<h-4;y+=stride)for(let x=4;x<w-4;x+=stride){
      const i=y*w+x,lo=this.field.bytes[i*4+2]/255,seep=this.field.bytes[i*4+3]/255;
      if(lo<.48||this.world.water[i]>.0015)continue;
      const score=seep*.75+lo*.20;
      if(score>.22)candidates.push({x,y,score});
    }
    candidates.sort((a,b)=>b.score-a.score||a.y-b.y||a.x-b.x);
    this.anchors=[];const spacing=Math.max(9,Math.min(w,h)*.075);
    for(const c of candidates){
      if(this.anchors.some(a=>Math.hypot(a.x-c.x,a.y-c.y)<spacing))continue;
      this.anchors.push({...c,width:10+(c.x*13+c.y*7)%9,height:4+(c.x+c.y)%5,depth:10,rotationY:0});
      if(this.anchors.length===SOULFIRE_CAPACITY/2)break;
    }
    if(this.anchors.length){const a=this.anchors[0];this.field.foot={kind:'foot',x:a.x,y:a.y,label:'崖脚阴焰'};}
    this.writeInstances();
  }
  ensurePlumes() {
    if(this.mesh)return;
    this.geometry=new THREE.PlaneGeometry(1,1);
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
      uniforms:{nfClock:{value:this.time},nfOptions:{value:new THREE.Vector4()},nfMapSize:{value:new THREE.Vector2(this.world.w,this.world.h)},nfField:{value:this.texture},nfBand:{value:new THREE.Vector2(...this.field.band)}},
      vertexShader:`varying vec2 vUv;varying vec3 vWorld;void main(){vUv=uv;vec4 p=modelMatrix*instanceMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader:`varying vec2 vUv;varying vec3 vWorld;${INKFLAME_GLSL}
      void main(){vec4 m=nfMasks(vWorld);float t=nfOptions.z>1.5?nfClock*.035:0.;
      float n=nfNoise(vec2(vWorld.x*.20+vWorld.z*.13,vWorld.y*.24-t));
      float tongue=.40+.40*nfNoise(vec2(vWorld.x*.24+vWorld.z*.17,t*.12));
      float edge=1.-smoothstep(.06,.48,abs(vUv.x-.5));
      float rise=1.-smoothstep(tongue-.18,tongue+.12,vUv.y);
      float base=smoothstep(0.,.16,vUv.y);
      float a=edge*rise*base*(.065+.09*n)*m.b;
      if(a<.004)discard;gl_FragColor=vec4(.94,.965,.96,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
    this.material.name='NetherSoulfire:quiet-white-breath';
    this.mesh=new THREE.InstancedMesh(this.geometry,this.material,SOULFIRE_CAPACITY);
    this.mesh.name='NetherSoulfire';this.mesh.raycast=()=>{};this.mesh.userData.presentationOnly=true;
    this.mesh.frustumCulled=false;this.group.add(this.mesh);
    this.writeInstances();
  }
  setOptions(options) {
    this.options=normalizeInkflame(options);
    if(this.options.soulfire!=='off')this.ensurePlumes();
    else if(this.mesh){
      this.mesh.removeFromParent();this.mesh.dispose();this.geometry.dispose();this.material.dispose();
      this.mesh=this.geometry=this.material=null;this.stats.instances=0;this.stats.triangles=0;
    }
    if(this.mesh)this.material.uniforms.nfOptions.value.set(0,0,this.options.soulfire==='flow'?2:1,0);
  }
  setRegionGeometry(region,inside=true) {
    if(this.region===region&&this.inside===!!inside)return;
    this.region=region;this.inside=!!inside;this.writeInstances();
  }
  writeInstances() {
    if(!this.mesh||this.disposed)return;
    let count=0;const transform=new THREE.Object3D();
    for(const a of this.anchors){
      if(!decorationFootprintOwned(this.world,this.region,this.inside,a))continue;
      const p=this.coordinates.cellToRender(a.x,a.y);
      for(const angle of [Math.PI*.25,Math.PI*.75]){
        transform.position.set(p.x,this.elevation.at(a.x,a.y)+a.height*.5+.08,p.z);
        transform.rotation.set(0,angle,0);transform.scale.set(a.width,a.height,1);transform.updateMatrix();
        this.mesh.setMatrixAt(count++,transform.matrix);
      }
    }
    this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;
    this.stats.instances=count;this.stats.triangles=count*2;this.stats.instanceWrites++;
  }
  setTime(time) {
    this.time=Number.isFinite(time)?time:0;
    if(this.material)this.material.uniforms.nfClock.value=this.time;
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    this.group.removeFromParent();this.mesh?.dispose();this.geometry?.dispose();this.material?.dispose();this.texture.dispose();
    this.group.clear();this.world=this.coordinates=this.elevation=this.region=this.field=null;
    this.anchors=[];this.mesh=this.geometry=this.material=this.texture=null;
  }
}
