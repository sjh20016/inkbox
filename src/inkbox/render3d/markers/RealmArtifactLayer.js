import * as THREE from 'three';
import { EnvironmentBatch } from '../environment/EnvironmentBatch.js';
import { projectedPixels,chooseLOD } from '../lod/PresentationBudget.js';

export function deriveRealmArtifacts(world) {
  if(world?.plane!=='nether')return [];
  return (world.artifacts||[]).filter(a=>a&&a.id!=null&&Number.isFinite(a.x)&&Number.isFinite(a.y))
    .map(a=>({id:a.id,x:a.x,y:a.y,slot:a.slot??null,tier:Number.isFinite(a.tier)?a.tier:null,
      quality:Number.isFinite(a.quality)?a.quality:null,name:a.name??null})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
}
const equal=(a,b)=>a?.length===b?.length&&a.every((p,i)=>['id','x','y','slot','tier','quality','name'].every(k=>p[k]===b[i][k]));
const bounded=(n,max)=>Math.max(0,Math.min(max,Number(n)||0));

/** Genuine ground artifacts, separate from site markers and terrain-only decor. */
export class RealmArtifactLayer {
  constructor(world,coordinates,elevation){
    this.world=world;this.coordinates=coordinates;this.elevation=elevation;this.group=new THREE.Group();this.group.name='RealmArtifactLayer';
    this.batch=null;this.enabled=false;this.regionGeometry=null;this.regionInside=true;this.clock=Infinity;this.lastDerived=null;this.view={};this.lodEnabled=true;
    this._ppu=NaN;this._vppu=NaN;this._lod=new Map();this.stats={instances:0,triangles:0,lod:[0,0,0],drawCalls:0,overflow:0};
  }
  setEnvironmentAssets(library,material,enabled){
    if(this.batch&&(!library||this.batch.library!==library||this.batch.material!==material)){this.batch.group.removeFromParent();this.batch.dispose();this.batch=null;}
    if(library&&material&&!this.batch){this.batch=new EnvironmentBatch(library,{material,capacity:256,pickField:'renderArtifacts',assetIds:['nether.artifact.ground']});this.group.add(this.batch.group);}
    this.enabled=!!enabled;this.clock=Infinity;this.lastDerived=null;
  }
  setLODEnabled(enabled){if(this.lodEnabled===!!enabled)return;this.lodEnabled=!!enabled;this.write();}
  setRegionGeometry(region,inside=true){if(this.regionGeometry===region&&this.regionInside===!!inside)return;this.regionGeometry=region;this.regionInside=!!inside;this.write();}
  setArtView(view){this.view=view||{};const ppu=view?.pixelsPerUnit,vppu=view?.verticalPixelsPerUnit;
    if(ppu===this._ppu&&vppu===this._vppu)return;this._ppu=ppu;this._vppu=vppu;this.write();}
  update(dt,{heightChanged=false}={}){
    this.clock+=Number.isFinite(dt)?dt:0;if(!heightChanged&&this.clock<.25)return;this.clock=0;
    const next=deriveRealmArtifacts(this.world);if(!heightChanged&&equal(next,this.lastDerived))return;this.lastDerived=next;this.write();
  }
  write(){
    if(!this.batch)return;const records=[];
    if(this.enabled)for(const source of this.lastDerived||[]){
      if(this.regionGeometry&&!this.regionGeometry.allInside&&this.regionGeometry.isInsideCell(source.x,source.y)!==this.regionInside)continue;
      const width=.8+bounded(source.tier,3)*.06,height=.9+bounded(source.quality,4)*.035;
      const lod=chooseLOD('tree',projectedPixels(height,this.view,width),this._lod.get(source.id),this.lodEnabled);this._lod.set(source.id,lod);
      const p=this.coordinates.worldToRender(source.x,source.y,this.elevation.at(source.x,source.y));
      records.push({assetId:'nether.artifact.ground',lod,source,position:p,scale:{x:width,y:height,z:width},rotationY:0});
    }
    this.batch.write(records);this.stats={...this.batch.stats,capacity:256};
    const current=new Set((this.lastDerived||[]).map(a=>a.id));for(const key of this._lod.keys())if(!current.has(key))this._lod.delete(key);
  }
  dispose(){this.batch?.dispose();this.batch=null;this.group.clear();this._lod.clear();this.lastDerived=null;}
}
