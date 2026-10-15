import * as THREE from 'three';
import { hashString } from '../../core/noise.js';
import { TERRAIN_INFO } from '../../core/config.js';
import { EnvironmentBatch } from '../environment/EnvironmentBatch.js';
import { decorationFootprintOwned } from '../environment/RealmDecorationLayer.js';
import { chooseLOD, projectedPixels } from '../lod/PresentationBudget.js';

const ASSET='mortal.leyline.vein',CAPACITY=256;

/** Pure patches from the marker layer's single real leyline derivation. */
export function leylinePatches(world,items=[]) {
  const out=[];
  for(const item of items){
    const strength=Math.max(0,Math.min(1,Number.isFinite(item.strength)?item.strength:0));
    const radius=Math.max(0,Number.isFinite(item.radius)?item.radius:0);
    const hash=hashString(`${world.seed}|leyline:${item.id}:${item.x},${item.y}`),angle=(hash>>>0)/4294967296*Math.PI*2;
    const count=5+Math.round(strength*15),c=Math.cos(angle),s=Math.sin(angle),range=Math.max(.4,Math.min(5,radius*.55));
    for(let i=0;i<count;i++){
      const t=count>1?(i/(count-1)*2-1):0,bend=Math.sin(t*Math.PI)*range*.1;
      const x=item.x+c*t*range-s*bend,y=item.y+s*t*range+c*bend;
      out.push({x,y,width:.3+strength*.3,depth:.10+strength*.05,h:.12+strength*.10,rotationY:-angle,
        key:`${item.id}:${i}`,source:{id:item.id,x:item.x,y:item.y,strength:item.strength,radius:item.radius},strength});
    }
  }
  return out;
}

/** Local terrain tangent, with a buried base instead of an upward floating offset. */
export function leylinePatchPose(elevation,p) {
  const c=Math.cos(p.rotationY),s=Math.sin(p.rotationY),center=elevation.at(p.x,p.y);
  const alongX=(elevation.at(p.x+c*p.width/2,p.y-s*p.width/2)-elevation.at(p.x-c*p.width/2,p.y+s*p.width/2))/p.width;
  const alongZ=(elevation.at(p.x+s*p.depth/2,p.y+c*p.depth/2)-elevation.at(p.x-s*p.depth/2,p.y-c*p.depth/2))/p.depth;
  const xAxis=new THREE.Vector3(c,alongX,-s).normalize(),zGuide=new THREE.Vector3(s,alongZ,c);
  const yAxis=new THREE.Vector3().crossVectors(zGuide,xAxis).normalize(),zAxis=new THREE.Vector3().crossVectors(xAxis,yAxis).normalize();
  const quaternion=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis,yAxis,zAxis));
  let residual=0;
  for(const x of [-p.width/2,p.width/2])for(const z of [-p.depth/2,p.depth/2]){
    const wx=p.x+xAxis.x*x+zAxis.x*z,wy=p.y+xAxis.z*x+zAxis.z*z;
    residual=Math.min(residual,elevation.at(wx,wy)-center-xAxis.y*x-zAxis.y*z);
  }
  return {ground:center+residual,quaternion:quaternion.toArray(),center,normalY:yAxis.y,
    footprint:{...p,width:p.width+2*p.h,depth:p.depth+2*p.h}};
}

/** Owns only fixed instance buffers; one patch is never a new World object. */
export class LeylineGeographyLayer {
  constructor(world,coordinates,elevation){
    this.world=world;this.coordinates=coordinates;this.elevation=elevation;this.group=new THREE.Group();this.group.name='LeylineGeographyLayer';
    this.batch=null;this.enabled=false;this.productionEnabled=false;this.items=[];this.patches=[];this.regionGeometry=null;this.regionInside=true;
    this.renderedIds=new Set();this.lods=new Map();this.view={};this.lodEnabled=true;
    this.stats={instances:0,triangles:0,drawCalls:0,lod:[0,0,0],capacity:CAPACITY,leylineCount:0,fallback:0,overflow:0,maskRejected:0};
  }
  setEnvironmentAssets(library,material,enabled){
    if(this.batch&&(!library||this.batch.library!==library||this.batch.material!==material)){this.batch.group.removeFromParent();this.batch.dispose();this.batch=null;}
    if(enabled&&this.world.plane==='mortal'&&library?.assets?.[ASSET]&&material&&!this.batch){this.batch=new EnvironmentBatch(library,{material,capacity:CAPACITY,assetIds:[ASSET],pickField:'renderLeylines'});this.group.add(this.batch.group);}
    this.productionEnabled=!!enabled;this.write();
  }
  setEnabled(enabled){this.enabled=!!enabled;this.write();}
  setRegionGeometry(region,inside=true){this.regionGeometry=region;this.regionInside=!!inside;this.write();}
  setLODEnabled(enabled){this.lodEnabled=!!enabled;this.write();}
  setArtView(view){const changed=this.view.pixelsPerUnit!==view?.pixelsPerUnit||this.view.verticalPixelsPerUnit!==view?.verticalPixelsPerUnit;this.view=view||{};if(changed)this.write();}
  update(items){this.items=items||[];this.patches=leylinePatches(this.world,this.items);this.write();}
  write(){
    this.renderedIds.clear();const records=[],active=new Set();let maskRejected=0,terrainRejected=0,overflow=0;
    const owned=item=>!this.regionGeometry||this.regionGeometry.allInside||this.regionGeometry.isInsideCell(item.x,item.y)===this.regionInside;
    const current=this.items.filter(owned),currentIds=new Set(current.map(item=>item.id));
    if(this.enabled&&this.productionEnabled&&this.batch)for(const p of this.patches){
      if(!currentIds.has(p.source.id))continue;active.add(p.key);
      const pose=leylinePatchPose(this.elevation,p),footprint=pose.footprint;
      if(!decorationFootprintOwned(this.world,this.regionGeometry,this.regionInside,footprint)){maskRejected++;continue;}
      const c=Math.abs(Math.cos(p.rotationY)),s=Math.abs(Math.sin(p.rotationY)),rx=(c*footprint.width+s*footprint.depth)/2,ry=(s*footprint.width+c*footprint.depth)/2;
      let suitable=true;
      for(let y=Math.floor(p.y-ry);y<=Math.ceil(p.y+ry)&&suitable;y++)for(let x=Math.floor(p.x-rx);x<=Math.ceil(p.x+rx);x++){
        const type=this.world.type[y*this.world.w+x];if(!TERRAIN_INFO[type]||TERRAIN_INFO[type].water){suitable=false;break;}
      }
      if(!suitable){terrainRejected++;continue;}
      if(records.length>=CAPACITY){overflow++;continue;}
      const ground=pose.ground,pos=this.coordinates.worldToRender(p.x,p.y,ground);
      if(pose.center>=ground+p.h*pose.normalY){terrainRejected++;continue;}
      const lod=chooseLOD('decoration',projectedPixels(p.h,this.view,p.width),this.lods.get(p.key),this.lodEnabled);this.lods.set(p.key,lod);
      records.push({assetId:ASSET,lod,position:{x:pos.x,y:ground,z:pos.z},scale:{x:p.width,y:p.h,z:p.depth},rotationY:p.rotationY,quaternion:pose.quaternion,source:p.source});
      this.renderedIds.add(p.source.id);
    }
    for(const key of this.lods.keys())if(!active.has(key))this.lods.delete(key);
    this.batch?.write(records);
    this.stats={...(this.batch?.stats||{instances:0,triangles:0,drawCalls:0,lod:[0,0,0],overflow:0}),capacity:CAPACITY,
      leylineCount:current.length,fallback:current.length-this.renderedIds.size,maskRejected,terrainRejected,overflow:overflow+(this.batch?.stats.overflow||0)};
  }
  dispose(){this.batch?.dispose();this.batch=null;this.group.clear();this.items=[];this.patches=[];this.lods.clear();this.renderedIds.clear();}
}
