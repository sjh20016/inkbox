import * as THREE from 'three';
import { decorationFootprintOwned } from '../environment/RealmDecorationLayer.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

export const COMBAT_3D_CAP = 32;
export const COMBAT_STYLES = Object.freeze(['blade', 'fire', 'thunder']);
const COLORS = { blade: 0x303531, fire: 0xa34d35, thunder: 0x718caa };
export const isCombatFxItem = item => item?.kind === 'combat';
export const isLightningFxItem = item => item?.kind === 'lightning';

function brushGeometry(style) {
  const positions=[], parts=[], indices=[];
  const triangle=(a,b,c,detail=0)=>{
    const i=positions.length/3;positions.push(...a,...b,...c);
    parts.push(detail,detail,detail);indices.push(i,i+1,i+2);
  };
  const ribbon=(points,width,detail=0)=>{
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],n=positions.length/3;
      positions.push(a[0],a[1]-width,0,b[0],b[1]-width,0,b[0],b[1]+width,0,a[0],a[1]+width,0);
      parts.push(detail,detail,detail,detail);indices.push(n,n+1,n+2,n,n+2,n+3);
    }
  };
  if(style==='blade'){
    // Broken ink stroke, a restrained slash arc, and two tiny impact flecks.
    ribbon([[-.5,0],[-.12,.08]],.16);
    ribbon([[-.06,.06],[.37,0],[.5,-.08]],.10);
    ribbon([[-.37,-.4],[-.12,-.75],[.18,-.55],[.36,-.2]],.06,1);
    triangle([.42,.15,0],[.49,.68,0],[.5,.28,0],1);
    triangle([.35,-.15,0],[.43,-.65,0],[.48,-.2,0],1);
  }else if(style==='fire'){
    // Three pointed vermilion licks. They do not ignite terrain.
    triangle([-.5,-.18,0],[.5,0,0],[-.12,.58,0]);
    triangle([-.25,-.25,0],[.42,-.8,0],[.28,.1,0],1);
    triangle([-.16,.15,0],[.36,.86,0],[.47,.06,0],1);
  }else{
    // The same short, jagged stroke language as the Canvas tribulation FX.
    ribbon([[-.5,0],[-.27,.62],[-.10,-.58],[.14,.38],[.29,-.40],[.5,0]],.09);
    ribbon([[.04,.15],[.25,.92],[.39,.58]],.04,1);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('detailPart',new THREE.Float32BufferAttribute(parts,1));
  geometry.setIndex(indices);
  geometry.setAttribute('inkOpacity',new THREE.InstancedBufferAttribute(new Float32Array(COMBAT_3D_CAP),1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('inkDetail',new THREE.InstancedBufferAttribute(new Float32Array(COMBAT_3D_CAP),1).setUsage(THREE.DynamicDrawUsage));
  return geometry;
}

function brushMaterial(style){
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,
    uniforms:{inkColor:{value:new THREE.Color(COLORS[style])}},
    vertexShader: `attribute float inkOpacity; attribute float inkDetail; attribute float detailPart;
      varying float vOpacity; varying float vDetail; varying float vPart;
      void main(){
        vOpacity=inkOpacity; vDetail=inkDetail; vPart=detailPart;
        vec4 p=vec4(position,1.0);
        #ifdef USE_INSTANCING
        p=instanceMatrix*p;
        #endif
        gl_Position=projectionMatrix*modelViewMatrix*p;
      }`,
    fragmentShader: `uniform vec3 inkColor; varying float vOpacity; varying float vDetail; varying float vPart;
      void main(){
        if(vOpacity<.002 || (vPart>.5 && vDetail<.5))discard;
        gl_FragColor=vec4(inkColor,vOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** Fixed snapshot brushes: three batches, no hit-time Three object allocation. */
export class ThreeCombatFx{
  constructor({plane,coordinates,elevation}){
    this.plane=plane;this.coordinates=coordinates;this.elevation=elevation;
    this.root=new THREE.Group();this.root.name='CombatFx:'+plane;
    this.batches={};
    for(const style of COMBAT_STYLES){
      const geometry=brushGeometry(style),material=brushMaterial(style);
      const mesh=new THREE.InstancedMesh(geometry,material,COMBAT_3D_CAP);
      mesh.name='CombatFx:'+plane+':'+style;mesh.count=0;mesh.visible=false;
      mesh.frustumCulled=false;mesh.renderOrder=RENDER_ORDER.fx;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.presentationOnly=true;mesh.raycast=()=>{};
      this.batches[style]={mesh,geometry,material,opacity:geometry.getAttribute('inkOpacity'),detail:geometry.getAttribute('inkDetail')};
      this.root.add(mesh);
    }
    this.matrix=new THREE.Matrix4();this.axis=new THREE.Vector3();
    this.widthAxis=new THREE.Vector3();this.normal=new THREE.Vector3();
    this.footprint={x:0,y:0,width:0,depth:0,rotationY:0};
    this.stats={active:0,combatActive:0,lightningActive:0,capacity:COMBAT_3D_CAP,drawCalls:0,
      triangles:0,overflow:0,regionRejected:0,styleCounts:{blade:0,fire:0,thunder:0}};
  }
  clear(){
    for(const b of Object.values(this.batches)){b.mesh.count=0;b.mesh.visible=false;}
    Object.assign(this.stats,{active:0,combatActive:0,lightningActive:0,drawCalls:0,triangles:0,overflow:0,regionRejected:0});
    for(const style of COMBAT_STYLES)this.stats.styleCounts[style]=0;
  }
  update(items,world,region=null,inside=true,{combatEnabled=true}={}){
    this.clear();
    if(this.disposed||!world||!this.coordinates||!this.elevation||!Array.isArray(items))return;
    // Important tribulation strokes reserve slots before any high-frequency combat.
    for(const lightning of [true,false])for(const item of items){
      if(item.plane!==this.plane||!(item.ttl>0)||!Number.isFinite(item.age)||item.age<0||item.age>=item.ttl)continue;
      if(lightning?!isLightningFxItem(item):!isCombatFxItem(item)||!combatEnabled)continue;
      const data=item.data,style=lightning?'thunder':data?.style;
      if(!COMBAT_STYLES.includes(style)||![item.x,item.y].every(Number.isFinite))continue;
      let ax=lightning?item.x:data.fromX,ay=lightning?item.y:data.fromY;
      const bx=item.x,by=item.y;
      if(![ax,ay].every(Number.isFinite))continue;
      if(this.stats.active>=COMBAT_3D_CAP){this.stats.overflow++;continue;}
      const tier=lightning?'high':data.tier,progress=item.age/item.ttl;
      const width=(lightning?.13:tier==='high'?.55:tier==='mid'?.4:.25)*(1-.3*progress);
      const dx=bx-ax,dy=by-ay,distance=Math.hypot(dx,dy),f=this.footprint;
      // The entire submitted brush footprint uses PlaneStage's access/window geometry.
      f.x=(ax+bx)/2;f.y=(ay+by)/2;
      f.width=Math.abs(dx)+width*2;f.depth=Math.abs(dy)+width*2;
      if(!lightning && distance<=.35)f.width=f.depth=width*3;
      if(!decorationFootprintOwned(world,region,inside,f)){this.stats.regionRejected++;continue;}
      const az=this.elevation.at(ax,ay)+.17,bz=this.elevation.at(bx,by)+.17;
      if(![az,bz].every(Number.isFinite))continue;
      if(lightning){
        this.axis.set(0,.8,0);
        const angle=(Number.isFinite(item.seed)?item.seed:0)*Math.PI*2;
        this.widthAxis.set(Math.cos(angle)*width,0,Math.sin(angle)*width);
      }else if(distance>.35){
        this.axis.set(dx,bz-az,dy);
        this.widthAxis.set(-dy/distance*width,0,dx/distance*width);
      }else{
        // Near-contact hits spread a local impact around their true midpoint.
        // A sub-pixel ground segment would be entirely hidden below overlapping feet.
        const angle=distance>1e-6?Math.atan2(dy,dx):(Number.isFinite(item.seed)?item.seed:0)*Math.PI*2;
        this.axis.set(Math.cos(angle)*width,0,Math.sin(angle)*width);
        this.widthAxis.set(-Math.sin(angle)*width,0,Math.cos(angle)*width);
      }
      this.normal.crossVectors(this.axis,this.widthAxis).normalize();
      this.matrix.makeBasis(this.axis,this.widthAxis,this.normal);
      const p=this.coordinates.worldToRender(f.x,f.y,lightning?az+.4:(az+bz)/2);
      this.matrix.setPosition(p.x,p.y,p.z);
      const b=this.batches[style],index=b.mesh.count++;
      b.mesh.setMatrixAt(index,this.matrix);
      b.opacity.setX(index,(1-progress)*(style==='blade'?.9:.8));
      b.detail.setX(index,tier==='low'?0:1);
      this.stats.active++;this.stats[lightning?'lightningActive':'combatActive']++;
      this.stats.styleCounts[style]++;
    }
    for(const style of COMBAT_STYLES){
      const b=this.batches[style],n=b.mesh.count;b.mesh.visible=n>0;
      if(n){
        b.mesh.instanceMatrix.needsUpdate=true;b.opacity.needsUpdate=true;b.detail.needsUpdate=true;
        this.stats.drawCalls++;this.stats.triangles+=n*b.geometry.index.count/3;
      }
    }
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.clear();
    for(const b of Object.values(this.batches)){b.mesh.removeFromParent();b.mesh.dispose();b.geometry.dispose();b.material.dispose();}
    this.root.removeFromParent();
  }
}
