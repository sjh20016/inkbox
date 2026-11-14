// Ephemeral, derived reads during the audited synchronous Life entity loop.
// Never a second population list, save field, persistent ID cache or RNG owner.
import {workMetricsEnabled,countWorkMetric} from './workMetrics.js';

const passes=new WeakMap();
const count=(world,key,n=1)=>{if(workMetricsEnabled(world))countWorkMetric(world,key,n);};

export function beginEntityReadPass(world,audited=false){
 // All unowned/manual/upper/nether reads use the original array algorithms.
 if(!audited||(world?.plane||'mortal')!=='mortal'||!Array.isArray(world.entities))return;
 passes.set(world,{list:world.entities,length:world.entities.length,plane:world.plane||'mortal',valid:true,byId:null});
 count(world,'entityIndex.passes');
}
export function endEntityReadPass(world){passes.delete(world);}
export function invalidateEntityReadView(world){
 const pass=passes.get(world);if(pass?.valid){pass.valid=false;count(world,'entityIndex.invalidations');}
}
function current(world){
 const pass=passes.get(world);if(!pass?.valid)return null;
 if(pass.list!==world.entities||pass.length!==world.entities.length||pass.plane!==(world.plane||'mortal')){invalidateEntityReadView(world);return null;}
 if(!pass.byId){
  const byId=new Map();count(world,'entityIndex.builds');
  for(let i=0;i<pass.list.length;i++){
   count(world,'entityIndex.buildEntitiesVisited');
   const e=pass.list[i];
   // Core save restoration does not establish ID uniqueness. Duplicate object
   // references, duplicate IDs, holes and malformed IDs all fail closed.
   if(!e||!Number.isSafeInteger(e.id)||e.id<=0||byId.has(e.id)){invalidateEntityReadView(world);count(world,'entityIndex.invalidBuilds');return null;}
   byId.set(e.id,{entity:e,index:i});
  }
  pass.byId=byId;
 }
 return pass;
}
function resolve(world,pass,id){
 count(world,'entityIndex.mapLookups');
 const row=pass.byId.get(id);
 if(row&&(pass.list[row.index]!==row.entity||row.entity.id!==id)){invalidateEntityReadView(world);return {valid:false};}
 return {valid:true,row};
}

/** null means use the original find; otherwise {helper} is an exact answer. */
export function sharedInsightLookup(world,actor,bonds){
 count(world,'shared.lookupCalls');
 const pass=current(world);if(!pass)return null;
 const ids=[],seen=new Set();
 for(const bond of bonds){
  const key=bond.targetKey,prefix=pass.plane+':';
  if(typeof key!=='string'||!key.startsWith(prefix))return null;
  const suffix=key.slice(prefix.length),id=Number(suffix);
  if(!Number.isSafeInteger(id)||id<=0||String(id)!==suffix||seen.has(id))return null;
  seen.add(id);ids.push(id);
 }
 let helper,index=Infinity;
 for(const id of ids){
  const result=resolve(world,pass,id);if(!result.valid)return null;
  const row=result.row;if(!row)continue;
  count(world,'shared.candidateEntitiesVisited');
  const other=row.entity;
  // HP, coordinates and bond eligibility are NOT cached across reads.
  if(other.hp>0&&Math.hypot(actor.x-other.x,actor.y-other.y)<=8&&row.index<index){helper=other;index=row.index;}
 }
 count(world,helper?'shared.lookupHits':'shared.lookupMisses');
 return {helper};
}

/** Resolve relation candidates, then choose the first in CURRENT array order. */
export function mentorLookup(world,actor){
 count(world,'mentor.lookupCalls');
 const pass=current(world);if(!pass)return null;
 const relations=actor.relations;
 if(relations!=null&&(!(relations instanceof Map)||relations.get!==Map.prototype.get||relations[Symbol.iterator]!==Map.prototype[Symbol.iterator]))return null;
 let mentor,index=Infinity;
 for(const [id,relation]of relations||[]){
  count(world,'mentor.relationsVisited');if(relation?.type!=='mentor')continue;
  if(!Number.isSafeInteger(id)||id<=0)return null;
  const result=resolve(world,pass,id);if(!result.valid)return null;
  const row=result.row;if(!row)continue;const other=row.entity;
  count(world,'mentor.candidateEntitiesVisited');
  if(other!==actor&&other.hp>0&&Math.hypot(actor.x-other.x,actor.y-other.y)<=8&&row.index<index){mentor=other;index=row.index;}
 }
 count(world,mentor?'mentor.lookupHits':'mentor.lookupMisses');return {mentor};
}

const CELL_SIZE=4;
const cellKey=(x,y)=>Math.floor(x/CELL_SIZE)+','+Math.floor(y/CELL_SIZE);
// Keep integer cell loops well inside exact Number increments. Malformed but
// finite astronomical coordinates retain the terminating legacy scan.
const safePosition=e=>Number.isFinite(e.x)&&Number.isFinite(e.y)&&Math.abs(e.x)<=Number.MAX_SAFE_INTEGER/4&&Math.abs(e.y)<=Number.MAX_SAFE_INTEGER/4;
function spatialView(world,pass){
 if(pass.spatialInvalid)return null;
 if(!pass.spatial){
  const cells=new Map();count(world,'spatial.builds');
  for(const row of pass.byId.values()){
   count(world,'spatial.buildEntitiesVisited');const e=row.entity;
   if(!safePosition(e)){pass.spatialInvalid=true;count(world,'spatial.invalidBuilds');return null;}
   const key=cellKey(e.x,e.y);let bucket=cells.get(key);
   if(!bucket){bucket=new Set();cells.set(key,bucket);count(world,'spatial.bucketsBuilt');}
   bucket.add(e);row.cell=key;
  }
  pass.spatial=cells;
 }
 return pass.spatial;
}

// Called after each audited native displacement, before another effect query.
// It NEVER changes the existing combat Life.grid or any authoritative position.
export function syncEntityReadPosition(world,entity){
 const active=passes.get(world);if(!active?.valid||!active.spatial)return;
 const pass=current(world);if(!pass)return;count(world,'spatial.positionChecks');
 const row=pass.byId.get(entity.id);count(world,'entityIndex.mapLookups');
 if(row?.entity!==entity||pass.list[row.index]!==entity||!safePosition(entity)){invalidateEntityReadView(world);return;}
 const key=cellKey(entity.x,entity.y);if(key===row.cell)return;
 const old=pass.spatial.get(row.cell);if(!old?.delete(entity)){invalidateEntityReadView(world);return;}
 if(!old.size)pass.spatial.delete(row.cell);
 let bucket=pass.spatial.get(key);if(!bucket){bucket=new Set();pass.spatial.set(key,bucket);count(world,'spatial.bucketsBuilt');}
 bucket.add(entity);row.cell=key;count(world,'spatial.cellMoves');
}

/** Candidate order is irrelevant ONLY after ordered mentor resolution succeeds. */
export function visitNearPeers(world,actor,visit){
 count(world,'spatial.lookupCalls');const pass=current(world);
 if(!pass||!safePosition(actor))return null;
 const cells=spatialView(world,pass);if(!cells)return null;
 let visited=0;
 for(let y=Math.floor((actor.y-8)/CELL_SIZE);y<=Math.floor((actor.y+8)/CELL_SIZE);y++)for(let x=Math.floor((actor.x-8)/CELL_SIZE);x<=Math.floor((actor.x+8)/CELL_SIZE);x++){
  count(world,'spatial.cellQueries');const bucket=cells.get(x+','+y);if(!bucket)continue;
  for(const other of bucket){
   visited++;count(world,'spatial.cellCandidateVisits');count(world,'conditions.peer.entitiesVisited');
   const found=resolve(world,pass,other.id);if(!found.valid||found.row?.entity!==other){invalidateEntityReadView(world);return {complete:false,visited};}
   visit(other);if(!pass.valid)return {complete:false,visited};
  }
 }
 count(world,'spatial.lookupHits');return {complete:true,visited};
}
