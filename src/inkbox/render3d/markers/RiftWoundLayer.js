import * as THREE from 'three';
import { hashString } from '../../core/noise.js';
import { realmStyleFor } from '../art/RealmStyleProfile.js';
import { leylinePatchPose } from './LeylineGeographyLayer.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

export const RIFT_WOUND_CAPACITY=64;
export const RIFT_WOUND_STROKES=14;
const INSTANCE_CAPACITY=RIFT_WOUND_CAPACITY*RIFT_WOUND_STROKES;

/** Broken seams inside the authoritative radius, with no second radius formula. */
export function deriveRiftWoundStrokes(world,items=[]) {
  const strokes=[];
  for(const r of items){
    if(!['upper','nether'].includes(r.targetPlane)||!(r.radius>0))continue;
    const hash=hashString(`${world.seed}|rift:${r.id}:${r.x},${r.y}`),angle=hash/4294967296*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle);
    const old=Math.max(0,Math.min(1,(Number.isFinite(r.age)?r.age:0)/3600));
    for(let i=0;i<RIFT_WOUND_STROKES;i++){
      const side=i%2?1:-1,column=Math.floor(i/2),t=(column/6*2-1)*.84;
      const jitter=((hash>>>(column%5*5))&15)/15-.5;
      const cross=(side*(r.targetPlane==='upper'?.08:.12)+jitter*.06)*r.radius;
      const along=t*r.radius;
      strokes.push({x:r.x+c*along-s*cross,y:r.y+s*along+c*cross,
        width:Math.max(.12,Math.min(.55,r.radius*(r.targetPlane==='upper'?.19:.23))),
        depth:Math.max(.04,Math.min(.32,r.radius*(r.targetPlane==='upper'?.025:.04)*(1+old*.18))),
        h:r.targetPlane==='upper'?.14:.18,rotationY:-angle+side*jitter*(r.targetPlane==='upper'?.18:.40),
        accent:i===11?'red':i===3||i===8?'paper':i===6?'gold':'ink',source:{id:r.id,x:r.x,y:r.y,age:r.age,targetPlane:r.targetPlane,radius:r.radius}});
    }
  }
  return strokes;
}

/** Persistent World scars. Region never clips them; events belong to FX elsewhere. */
export class RiftWoundLayer {
  constructor(world,coordinates,elevation){
    this.world=world;this.coordinates=coordinates;this.elevation=elevation;this.enabled=false;this.productionEnabled=false;this.items=[];
    this.group=new THREE.Group();this.group.name='RiftWoundLayer';this.renderedIds=new Set();this.dummy=new THREE.Object3D();
    this.geometry=new THREE.BoxGeometry(1,1,1);this.geometry.translate(0,.5,0);
    this.material=new THREE.MeshBasicMaterial({color:'#ffffff',depthWrite:true});
    this.mesh=new THREE.InstancedMesh(this.geometry,this.material,INSTANCE_CAPACITY);this.mesh.name='RiftWound:broken-seams';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.frustumCulled=false;this.mesh.count=0;this.mesh.visible=false;this.mesh.renderOrder=RENDER_ORDER.markers;
    this.mesh.userData.renderRifts=[];this.group.add(this.mesh);this.colorCache=new Map();this.disposed=false;
    this.stats={instances:0,drawCalls:0,triangles:0,capacity:INSTANCE_CAPACITY,riftCapacity:RIFT_WOUND_CAPACITY,riftCount:0,fallback:0,overflow:0};
  }
  setEnabled(enabled){if(this.enabled===!!enabled)return;this.enabled=!!enabled;this.write();}
  setProductionEnabled(enabled){if(this.productionEnabled===!!enabled)return;this.productionEnabled=!!enabled;this.write();}
  update(items){if(this.items===items)return;this.items=items||[];this.write();}
  color(target,accent){
    const style=realmStyleFor(target),hex=accent==='paper'?target==='upper'?'#E8EDF0':style.pilotPalette.paper:
      accent==='red'?target==='nether'?style.pilotPalette.red:style.pilotPalette.blue:
      accent==='gold'?target==='upper'?style.vegetation.tints5[3]:style.pilotPalette.paper:
      target==='upper'?style.pilotPalette.blue:style.pilotPalette.ink;
    if(!this.colorCache.has(hex))this.colorCache.set(hex,new THREE.Color(hex));return this.colorCache.get(hex);
  }
  write(){
    if(this.disposed)return;
    this.renderedIds.clear();this.mesh.userData.renderRifts.length=0;let count=0,overflow=0,terrainRejected=0;
    if(this.enabled&&this.productionEnabled){
      const supported=this.items.filter(r=>['upper','nether'].includes(r.targetPlane));
      const accepted=supported.slice(0,RIFT_WOUND_CAPACITY);overflow=Math.max(0,supported.length-accepted.length);
      for(const p of deriveRiftWoundStrokes(this.world,accepted)){
        const pose=leylinePatchPose(this.elevation,p),point=this.coordinates.worldToRender(p.x,p.y,pose.ground);
        if(pose.center>=pose.ground+p.h*pose.normalY){terrainRejected++;continue;}
        this.dummy.position.set(point.x,pose.ground,point.z);this.dummy.quaternion.fromArray(pose.quaternion);this.dummy.scale.set(p.width,p.h,p.depth);this.dummy.updateMatrix();
        this.mesh.setMatrixAt(count,this.dummy.matrix);this.mesh.setColorAt(count,this.color(p.source.targetPlane,p.accent));
        this.mesh.userData.renderRifts.push(p.source);this.renderedIds.add(p.source.id);count++;
      }
    }
    this.mesh.count=count;this.mesh.visible=count>0;this.mesh.instanceMatrix.needsUpdate=true;
    if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;this.mesh.boundingBox=null;this.mesh.boundingSphere=null;
    this.stats={instances:count,drawCalls:count?1:0,triangles:count*12,capacity:INSTANCE_CAPACITY,riftCapacity:RIFT_WOUND_CAPACITY,
      riftCount:this.items.length,fallback:this.items.length-this.renderedIds.size,overflow,terrainRejected};
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.mesh.dispose();this.geometry.dispose();this.material.dispose();this.group.clear();this.items=[];this.renderedIds.clear();this.colorCache.clear();}
}
