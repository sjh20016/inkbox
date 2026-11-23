import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCheckpoint} from './inkbox-mlod0b-inputs.mjs';
import {nativeApi} from './inkbox-wx-e0-replay.mjs';
import {stepSects} from '../src/inkbox/sim/sects.js';
import {buildPopulationCensus,compareCensusToLegacy} from '../src/inkbox/sim/demography/legacyCensus.js';
import {setPopulationPhaseObserver} from '../src/inkbox/sim/demography/phaseProbe.js';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const cp=loadCheckpoint(400),api=await nativeApi(root),ctx=api.restore(cp.saved),world=ctx.world;
const source=world.factions.find(s=>s.id===2);
assert(source,'Archived source sect missing');
const roster=world.entities.filter(e=>e.faction===source.id && api.demographics.isPracticingHuman(e)
  && e.hp>0 && e.age<e.lifespan && !e._ascended).sort((a,b)=>b.level-a.level);
assert(roster.length>=25,'Need 25 real living practitioners');
// Use existing identity objects and the actual sect's stepSects path.
const leader=roster[0];source.leaderId=leader.id;source.stability=0;source.reputation=0;
source.pop=roster.length;source.followers=roster.length;
for(let i=0;i<25;i++){const e=roster[i];e.x=leader.x;e.y=leader.y;e.village=0;e.faction=source.id;}
for(let i=25;i<roster.length;i++)roster[i].faction=0;
const noOps={};const phases=[];
let censusBoundaryDifferences=null;
setPopulationPhaseObserver(world,(phase,detail)=>{
  if(phase==='after-sect-census') censusBoundaryDifferences=compareCensusToLegacy(world,
    buildPopulationCensus(world,phase),phase);
  phases.push({phase,detail,
    factions:world.factions.map(s=>({id:s.id,name:s.name,followers:s.followers,pop:s.pop})),
    moved:detail?.memberIds?.map(id=>({id,before:source.id,after:world.entities.find(e=>e.id===id)?.faction}))
  });
});
const values=Array(128).fill(0.0001);let draws=0;const rng=()=>values[draws++]??0.0001;
const before={id:source.id,name:source.name,leaderId:source.leaderId,capacity:Math.floor(10+source.reputation/4),
  pop:source.pop,followers:source.followers,stability:source.stability,provisions:source.resources.provisions,
  roster:world.entities.filter(e=>e.faction===source.id).map(e=>e.id)};
stepSects(world,ctx.life,3,rng);
setPopulationPhaseObserver(world,null);
const preCensus=phases.find(p=>p.phase==='after-sect-census');
const split=phases.find(p=>p.phase==='after-schism-membership');
assert(split,'Public stepSects path did not perform a split');
const childId=split.detail.childId;
const child=world.factionById(childId);
assert(child,'Schism sect was not retained');
assert(world.entities.find(e=>e.id===child.founderId)?.faction===childId,'Schism founder must be independently assigned to child sect');
const phaseIds=split.detail.memberIds;
const idsNow=phaseIds.map(id=>world.entities.find(e=>e.id===id)).filter(Boolean);
assert(idsNow.length>=3 && idsNow.every(e=>e.faction===childId));
assert(!phaseIds.includes(child.founderId),'Founder is not one of the transferred follower IDs');
const census=buildPopulationCensus(world,'after-stepSects-return');
const diffs=compareCensusToLegacy(world,census,'after-sects');
const sectDiffs=diffs.filter(d=>d.kind==='sect');
const firstStepSummary={parent:{followers:source.followers,pop:source.pop},
  child:{followers:child.followers,pop:child.pop},entityDerived:{parentFollowers:census.sects.get(source.id).followers,
    parentPop:census.sects.get(source.id).pop,childFollowers:census.sects.get(childId).followers,
    childPop:census.sects.get(childId).pop}};
let nextCensusDifferences=null;
setPopulationPhaseObserver(world,(phase)=>{
  if(phase==='after-sect-census') nextCensusDifferences=compareCensusToLegacy(world,
    buildPopulationCensus(world,phase),phase).filter(d=>d.kind==='sect');
});
stepSects(world,ctx.life,3,()=>0.999);
setPopulationPhaseObserver(world,null);
assert.deepEqual(nextCensusDifferences,[],'next sect census must match all current sect memberships');
const evidence={baseline:'3772bea8fa7b7ef753770c3a47877e6b461dd3c8',input:{sha256:cp.sha256,day:world.day},
  method:'Real 400-year entities, controlled sect conditions, public stepSects with deterministic RNG, no production hooks or monkey-patching. This proves the public writer path, not a natural replay of the original day-144000 split.',
  setup:{sourceSect:before,eligibleRoster:roster.slice(0,25).map(e=>({id:e.id,level:e.level,x:e.x,y:e.y})),rngValue:0.0001,rngDraws:draws,dtDays:3},
  phases,firstWriter:split.detail.firstWriter,split:{parentId:source.id,childId,founderId:child.founderId,
    founderIsSeparatelyAssigned:true,memberIds:phaseIds,
    movedCount:phaseIds.length,movedPractitioners:idsNow.filter(e=>api.demographics.isPracticingHuman(e)).length,
    childMembershipCount:idsNow.length+1,
    afterFirstStep:firstStepSummary,
    afterNextCensus:{parent:{followers:source.followers,pop:source.pop},
      child:{followers:child.followers,pop:child.pop},differences:nextCensusDifferences},
    censusDifferences:diffs,sectCensusDifferences:sectDiffs},
  censusBoundary:{phase:preCensus.phase,differences:censusBoundaryDifferences},
  conclusion:'The split observer records the authoritative stepSects writer and the existing follower IDs it moved. maybeShed separately founds the child with its leader, so this run moves 23 members and adds one founder (24 child members total). Cached sect totals are from the pre-split census; entity-derived sect marginals immediately reflect the move. The next step census reconciles sect totals. The input also carries unrelated stale village.pop caches, which are recorded separately and are not asserted as sect-census failures.'};
assert.equal(split.detail.firstWriter,'sim/sects.js:maybeShed');
assert(phaseIds.length>=3 && phaseIds.length<=24);
assert(phaseIds.every(id=>world.entities.find(e=>e.id===id)?.faction===childId));
fs.mkdirSync(path.join(root,'reports/mlod0b'),{recursive:true});
fs.writeFileSync(path.join(root,'reports/mlod0b/schism.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({pass:true,childId,moved:phaseIds.length,practitioners:evidence.split.movedPractitioners,draws}));
