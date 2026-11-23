import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import { loadCheckpoint } from '../../scripts/inkbox-mlod0b-inputs.mjs';
import { nativeApi } from '../../scripts/inkbox-wx-e0-replay.mjs';
import { arriveUpper } from '../../src/inkbox/world/planes.js';
import { buildPopulationCensus, compareCensusToLegacy } from '../../src/inkbox/sim/demography/legacyCensus.js';
import { setPopulationPhaseObserver } from '../../src/inkbox/sim/demography/phaseProbe.js';
import { isMortalHuman,isPracticingHuman } from '../../src/inkbox/core/demographics.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const api=await nativeApi(root), results=[];
const result={baseline:'3772bea8fa7b7ef753770c3a47877e6b461dd3c8',cases:results};
async function record(name,fn){const row={name,status:'running'};results.push(row);try{row.result=await fn();row.status='passed';}catch(error){row.status='failed';row.error=error.stack;}}
await record('real-Life-maybeSplitVillage',()=>{
 const c=api.restore(loadCheckpoint(100).saved),w=c.world,v=w.villages.find(x=>x.id===1);
 c.life.rebuildGrid();
 const parentResidents=w.entities.filter(e=>e.village===v.id&&isMortalHuman(e)&&e.hp>0&&Number.isFinite(e.age)&&e.age>=18*360&&e.age<50*360&&Math.hypot(e.x-v.x,e.y-v.y)<=14).slice(0,4);
 assert(parentResidents.length>=2,'archived village needs two fertile adult residents inside real Life near-query radius');
 const before={villages:w.villages.length,sourcePop:v.pop,ids:parentResidents.map(e=>e.id),sourceById:new Map(w.entities.map(e=>[e.id,e.village]))};
 v.pop=100;v.food=1000;
 // Keep the real split, foundVillage, re-home, cache sync, and history writers.
 // Deterministic random hook only selects the branch and existing tile sampler.
 let rngCalls=0;c.life.rng=()=>rngCalls++===0?0:0.5;
 c.life.findSplitSpot=()=>[Math.floor(v.x+18),Math.floor(v.y)];
 const phaseSamples=[];
 setPopulationPhaseObserver(w,(phase,detail)=>{
  if(phase==='after-village-split-membership'){
   const census=buildPopulationCensus(w,phase);
   phaseSamples.push({phase,detail,cacheDifferences:compareCensusToLegacy(w,census,phase)});
  }
 });
 c.life.maybeSplitVillage(v,3);
 setPopulationPhaseObserver(w,null);
 const child=w.villages.find(x=>x.id!==v.id&&x.foundedDay===w.day);
 assert(child,'expected maybeSplitVillage to found the child settlement');
 const moved=w.entities.filter(e=>before.sourceById.get(e.id)===v.id&&e.village===child.id);
 assert(moved.length>=2&&moved.length<=4);
 assert(parentResidents.every(e=>before.sourceById.get(e.id)===v.id));
 const synced=buildPopulationCensus(w,'after-village-split-sync');
 assert.equal(v.pop,synced.villages.get(v.id).legacyVillage.pop);
 assert.equal(child.pop,moved.length);
 assert.equal(phaseSamples.length,1);
 const splitDifferences=phaseSamples[0].cacheDifferences.filter(row=>row.kind==='village'&&(row.id===v.id||row.id===child.id));
 assert.equal(splitDifferences.length,2,'parent and child caches must be stale immediately after membership changes');
 assert(splitDifferences.every(row=>row.classification==='expected-stale'));
 assert.equal(phaseSamples[0].cacheDifferences.filter(row=>row.kind==='village'&&row.classification==='unexpected-divergence').length,0);
 assert(w.entities.length>=540,'no entity was created or deleted');
 return {day:w.day,parentVillage:v.id,childVillage:child.id,movedIds:moved.map(e=>e.id),movedCount:moved.length,sourcePopulationBefore:v.pop+moved.length,sourcePopulationAfter:v.pop,childPopulation:child.pop,splitPhaseDifferences:splitDifferences,syncedParentPopulation:synced.villages.get(v.id).legacyVillage.pop,syncedChildPopulation:synced.villages.get(child.id).legacyVillage.pop,writer:'Life.maybeSplitVillage -> foundVillage -> resident village/faction writes -> phase probe -> syncVillagePops'};
});
await record('real-arriveUpper-transfer-projection',async()=>{
 const c=api.restore(loadCheckpoint(100).saved),w=c.world;
 const {generateUpperWorld}=await import('../../src/inkbox/world/worldgenUpper.js');
 const upper=generateUpperWorld({preset:{w:w.w,h:w.h},seed:w.seed});upper.plane='upper';w.upper=upper;
 const e=w.entities.find(x=>isPracticingHuman(x)&&x.hp>0&&!x._ascended&&x.age<x.lifespan);
 assert(e&&upper?.plane==='upper');
 const before={mortal:w.entities.length,upper:upper.entities.length,id:e.id};
 const arrived=arriveUpper(upper,e,w,{via:'thunder'});
 assert(arrived&&arrived.id>=1_000_000);
 assert.equal(upper.entities.includes(e),false);
 assert(w.entities.includes(e),'arriveUpper creates the upper copy; mortal cleanup belongs to caller');
 assert.equal(arrived.faction,0);assert.equal(arrived.village,0);
 assert.equal(upper.popLog.arrivedThunder,1);
 const mortalCensus=buildPopulationCensus(w,'arrival-before-caller-cleanup');
 const upperCensus=buildPopulationCensus(w,'arrival');
 assert.equal(mortalCensus.byPlane.get('mortal').total,before.mortal);
 assert.equal(upperCensus.byPlane.get('upper').total,before.upper+1);
 assert.notEqual(arrived.id,e.id);
 return {sourceId:e.id,upperId:arrived.id,mortalAliveUntilCallerCleanup:true,upperFaction:arrived.faction,upperVillage:arrived.village,channel:'thunder',caller:'cultivation.ascend'};
});
const out=path.join(root,'reports/mlod0b/lifecycle-writers.json');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,out}));
if(results.some(x=>x.status!=='passed'))process.exitCode=1;
