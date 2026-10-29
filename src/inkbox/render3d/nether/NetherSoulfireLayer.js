import * as THREE from 'three';
import { deriveInkflameField, normalizeInkflame, inkArtParameters, INKFLAME_GLSL } from './NetherInkflame.js';
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
      const width=10+(c.x*13+c.y*7)%9;
      this.anchors.push({...c,width,height:4+(c.x+c.y)%5,depth:width,rotationY:0});
      if(this.anchors.length===SOULFIRE_CAPACITY/2)break;
    }
    if(this.anchors.length){const a=this.anchors[0];this.field.foot={kind:'foot',x:a.x,y:a.y,label:'崖脚阴焰'};}
    this.writeInstances();
  }
  ensurePlumes() {
    const art=!!this.options.art;
    if(this.mesh&&this.plumeArt===art)return;
    if(this.mesh)this.releasePlumes();
    this.plumeArt=art;
    this.geometry=art?new THREE.PlaneGeometry(1,1,3,4):new THREE.PlaneGeometry(1,1);
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
      uniforms:{nfClock:{value:this.time},nfOptions:{value:new THREE.Vector4()},nfArt:{value:new THREE.Vector4()},nfMapSize:{value:new THREE.Vector2(this.world.w,this.world.h)},nfField:{value:this.texture},nfBand:{value:new THREE.Vector2(...this.field.band)}},
      vertexShader:`uniform vec4 nfArt;varying vec2 vUv;varying vec3 vWorld;void main(){vUv=uv;vec3 q=position;if(nfArt.x>.5)q.z+=sin(uv.y*3.14159)*.14;vec4 p=modelMatrix*instanceMatrix*vec4(q,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader:`varying vec2 vUv;varying vec3 vWorld;${INKFLAME_GLSL}
      void main(){vec4 m=nfMasks(vWorld);float t=nfOptions.z>1.5?nfClock*.035:0.;
      float n=nfNoise(vec2(vWorld.x*.20+vWorld.z*.13,vWorld.y*.24-t));
      float tongue=.40+.40*nfNoise(vec2(vWorld.x*.24+vWorld.z*.17,t*.12));
      float edge=1.-smoothstep(.06,.48,abs(vUv.x-.5));
      float rise=1.-smoothstep(tongue-.18,tongue+.12,vUv.y);
      float base=smoothstep(0.,.16,vUv.y);
      float a=edge*rise*base*(.065+.09*n)*m.b;
      if(nfArt.x>.5){float bend=(nfNoise(vec2(vWorld.x*.13+vWorld.z*.09,vUv.y*.9-t*.18))-.5)*.30*vUv.y;
        float width=mix(.44,.025,smoothstep(.12,.92,vUv.y));
        float silhouette=1.-smoothstep(width*.35,width,abs(vUv.x-.5-bend));
        float torn=.4+.6*smoothstep(.26,.67,nfArtFlame(vWorld));
        a=silhouette*(1.-smoothstep(.58,.98,vUv.y))*base*torn*m.b*.30*nfArt.y*(nfArt.x>2.5?1.35:1.);}
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
    else if(this.mesh)this.releasePlumes();
    if(this.mesh){this.material.uniforms.nfOptions.value.set(0,0,this.options.soulfire==='flow'?2:1,0);this.material.uniforms.nfArt.value.set(...inkArtParameters(this.options));}
  }
  releasePlumes(){
    this.mesh.removeFromParent();this.mesh.dispose();this.geometry.dispose();this.material.dispose();
    this.mesh=this.geometry=this.material=null;this.stats.instances=0;this.stats.triangles=0;
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
      const yaw=this.plumeArt?(a.x*.73+a.y*.31)%Math.PI:Math.PI*.25;
      for(const angle of [yaw,yaw+Math.PI*.5]){
        transform.position.set(p.x,this.elevation.at(a.x,a.y)+a.height*.5+.08,p.z);
        transform.rotation.set(0,angle,0);transform.scale.set(a.width*(this.plumeArt?.68:1),a.height,1);transform.updateMatrix();
        this.mesh.setMatrixAt(count++,transform.matrix);
      }
    }
    this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;
    this.stats.instances=count;this.stats.triangles=count*this.geometry.index.count/3;this.stats.instanceWrites++;
  }
  setTime(time) {
    if(this.options.soulfire!=='flow')return;
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
