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
