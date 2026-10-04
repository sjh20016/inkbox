import * as THREE from 'three';
import { hashString } from '../../core/noise.js';
import { EnvironmentBatch } from './EnvironmentBatch.js';
import { projectedPixels, chooseLOD } from '../lod/PresentationBudget.js';
import { TERRAIN_INFO } from '../../core/config.js';

export const DECORATION_BUDGETS=Object.freeze({
  upper:Object.freeze({capacity:256,screen:160,detail:64,stride:8,minHeight:.55,minPixels:4}),
  nether:Object.freeze({capacity:192,screen:96,detail:40,stride:10,minHeight:.29,minPixels:4}),
});
const COMMON=Object.freeze(['environment.rock','environment.cliff','environment.pillar']);
const UPPER=Object.freeze([...COMMON,'environment.terrace','environment.slab']);

/** Only raw terrain, plane and seed influence this persistent layout. */
export function deriveRealmDecorations(world) {
  const budget=DECORATION_BUDGETS[world?.plane];if(!budget)return [];
  const out=[];
  for(let by=1;by<world.h-2;by+=budget.stride)for(let bx=1;bx<world.w-2;bx+=budget.stride){
    const hash=hashString(`${world.seed>>>0}|${world.plane}|stone:${bx},${by}`);
    const x=bx+(hash%budget.stride)+.25,y=by+((hash>>>8)%budget.stride)+.25;
    if(x>=world.w-2||y>=world.h-2)continue;
    const ix=Math.floor(x),iy=Math.floor(y),cell=iy*world.w+ix,height=world.height[cell],type=world.type[cell];
    if(!Number.isFinite(height)||height<budget.minHeight||!TERRAIN_INFO[type]||TERRAIN_INFO[type].water)continue;
    const slope=Math.max(Math.abs(height-world.height[cell-1]),Math.abs(height-world.height[cell+1]),Math.abs(height-world.height[cell-world.w]),Math.abs(height-world.height[cell+world.w]));
    const kinds=world.plane==='upper'?UPPER:COMMON;
    const kind=slope>.08?'environment.cliff':height>.74&&(hash&3)===0?'environment.pillar':kinds[(hash>>>16)%kinds.length];
    const width=2.2+(hash>>>4)%25/10,depth=1.8+(hash>>>12)%20/10;
    const h=kind.endsWith('pillar')?4.5+(hash>>>20)%20/10:kind.endsWith('terrace')||kind.endsWith('slab')?.6+(hash>>>20)%8/10:2+(hash>>>20)%25/10;
    out.push({cell,x,y,type,height,slope,assetId:kind,width,depth,h,rotationY:(hash>>>24)/256*Math.PI*2,priority:hash});
  }
  out.sort((a,b)=>a.priority-b.priority||a.cell-b.cell);
  return out.slice(0,budget.capacity);
}

/** Conservative rotated AABB: every touched submitted terrain quad must belong. */
export function decorationFootprintOwned(world,region,inside,record) {
  const c=Math.abs(Math.cos(record.rotationY)),s=Math.abs(Math.sin(record.rotationY));
  const rx=(c*record.width+s*record.depth)/2,ry=(s*record.width+c*record.depth)/2;
  const x0=Math.floor(record.x-rx),x1=Math.ceil(record.x+rx)-1,y0=Math.floor(record.y-ry),y1=Math.ceil(record.y+ry)-1;
  if(x0<0||y0<0||x1>=world.w-1||y1>=world.h-1)return false;
  if(!region)return true;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if((region.quadInside[y*region.quadW+x]===1)!==inside)return false;
  return true;
}
export function decorationGround(elevation,record) {
  const c=Math.cos(record.rotationY),s=Math.sin(record.rotationY),ys=[elevation.at(record.x,record.y)];
  for(const x of [-record.width/2,record.width/2])for(const z of [-record.depth/2,record.depth/2])
    ys.push(elevation.at(record.x+c*x+s*z,record.y-s*x+c*z));
  return Math.min(...ys); // Bury the base on slopes, rather than floating a ledge.
}

/** No identity, picker, collision, simulation clock or saved state. */
export class RealmDecorationLayer {
  constructor(world,coordinates,elevation){
    this.world=world;this.coordinates=coordinates;this.elevation=elevation;this.budget=DECORATION_BUDGETS[world.plane];
    this.group=new THREE.Group();this.group.name='RealmDecorationLayer';this.batch=null;this.enabled=false;
    this.layout=deriveRealmDecorations(world);this.regionGeometry=null;this.regionInside=true;this.view={};this.lodEnabled=true;this.dirty=true;
    this._point=new THREE.Vector3();this._lod=new Map();this.stats={instances:0,triangles:0,lod:[0,0,0],drawCalls:0,layout:this.layout.length,capacity:this.budget.capacity};
    this._matrix=new Float64Array(16).fill(NaN);this._ppu=NaN;this._vppu=NaN;this._ground=new Map();
  }
  setEnvironmentAssets(library,material,enabled){
    if(this.batch&&(!library||this.batch.library!==library||this.batch.material!==material)){this.batch.group.removeFromParent();this.batch.dispose();this.batch=null;}
    if(library&&material&&!this.batch){this.batch=new EnvironmentBatch(library,{material,capacity:this.budget.capacity,pickField:'decorativeOnly',assetIds:this.world.plane==='upper'?UPPER:COMMON});this.group.add(this.batch.group);}
    this.enabled=!!enabled;this.dirty=true;
  }
  setRegionGeometry(region,inside=true){if(this.regionGeometry===region&&this.regionInside===!!inside)return;this.regionGeometry=region;this.regionInside=!!inside;this.dirty=true;}
  setLODEnabled(enabled){if(this.lodEnabled===!!enabled)return;this.lodEnabled=!!enabled;this.dirty=true;}
  invalidateGround(){this._ground.clear();this.dirty=true;}
  setArtView(view){
    this.view=view||{};let changed=this._ppu!==view?.pixelsPerUnit||this._vppu!==view?.verticalPixelsPerUnit;
    this._ppu=view?.pixelsPerUnit;this._vppu=view?.verticalPixelsPerUnit;
    const matrix=view?.camera?.matrixWorldInverse?.elements;
    if(matrix)for(let i=0;i<16;i++){if(!Number.isFinite(this._matrix[i])||Math.abs(this._matrix[i]-matrix[i])>1e-10)changed=true;this._matrix[i]=matrix[i];}
    if(changed||this.dirty)this.write();
  }
  update({terrainChanged=false}={}){if(terrainChanged){this.layout=deriveRealmDecorations(this.world);this.invalidateGround();}if(this.dirty)this.write();}
  write(){
    if(!this.batch)return;
    const records=[];let maskRejected=0,screenRejected=0,detail=0,demoted=0;
    if(this.enabled)for(const source of this.layout){
      if(!decorationFootprintOwned(this.world,this.regionGeometry,this.regionInside,source)){maskRejected++;continue;}
      let ground=this._ground.get(source.cell);if(ground==null){ground=decorationGround(this.elevation,source);this._ground.set(source.cell,ground);}
      const p=this.coordinates.worldToRender(source.x,source.y,ground);
      const pixels=projectedPixels(source.h,this.view,source.width);
      if(this.lodEnabled&&pixels<this.budget.minPixels){screenRejected++;continue;}
      if(this.view.camera){this._point.set(p.x,ground+source.h/2,p.z).project(this.view.camera);
        if(Math.abs(this._point.x)>1.15||Math.abs(this._point.y)>1.15||Math.abs(this._point.z)>1.1){screenRejected++;continue;}}
      if(records.length>=this.budget.screen){screenRejected++;continue;}
      let lod=chooseLOD('tree',pixels,this._lod.get(source.cell),this.lodEnabled);
      if(lod===0&&detail>=this.budget.detail){lod=1;demoted++;}else if(lod===0)detail++;
      this._lod.set(source.cell,lod);
      records.push({assetId:source.assetId,lod,position:{x:p.x,y:ground,z:p.z},scale:{x:source.width,y:source.h,z:source.depth},rotationY:source.rotationY,source});
    }
    this.batch.write(records);this.stats={...this.batch.stats,layout:this.layout.length,capacity:this.budget.capacity,screenBudget:this.budget.screen,maskRejected,screenRejected,demoted};this.dirty=false;
  }
  dispose(){this.batch?.dispose();this.batch=null;this.group.clear();this.layout=[];this._lod.clear();this._ground.clear();}
}
