import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {beginEntityReadPass,endEntityReadPass,visitNearPeers} from '../src/inkbox/sim/entityReadView.js';
import {readEffects} from '../src/inkbox/wanxiang/effects.js';
import {initializeProfile} from '../src/inkbox/wanxiang/profile.js';
import {enableWorkMetrics,workMetricsSnapshot,countWorkMetric} from '../src/inkbox/sim/workMetrics.js';

const keys=new Set(['effects.calls','effects.actors','effects.alloc.result','effects.alloc.entryArrays','conditions.calls','conditions.peer.calls','conditions.peer.entitiesVisited','conditions.peer.maxScan','conditions.peer.nearHits','conditions.peer.mentorHits','experience.calls','experience.active.queries','experience.active.sets','experience.active.arrays','experience.active.copied','experience.active.visited','experience.shared.bonds','experience.shared.calls','experience.shared.entitiesVisited','experience.shared.hits','entityIndex.passes','entityIndex.builds','entityIndex.buildEntitiesVisited','entityIndex.invalidations','entityIndex.invalidBuilds','entityIndex.mapLookups','shared.lookupCalls','shared.lookupHits','shared.lookupMisses','shared.lookupFallbacks','shared.fallbackEntitiesVisited','shared.candidateEntitiesVisited']);
for(const key of ['mentor.lookupCalls','mentor.lookupHits','mentor.lookupMisses','mentor.lookupFallbacks','mentor.relationsVisited','mentor.candidateEntitiesVisited'])keys.add(key);
for(const key of ["spatial.builds","spatial.buildEntitiesVisited","spatial.invalidBuilds","spatial.bucketsBuilt","spatial.positionChecks","spatial.cellMoves","spatial.lookupCalls","spatial.cellQueries","spatial.cellCandidateVisits","spatial.lookupHits","spatial.lookupFallbacks","spatial.fallbackEntitiesVisited"])keys.add(key);
export function indexedBudget(work,n,calls=5,{dense=false}={}){
 const errors=[],get=k=>Number(work[k]||0);
 for(const [k,v] of Object.entries(work)){if(!keys.has(k)&&!k.startsWith('effects.source.'))errors.push('unknown metric '+k);if(typeof v!=='number'||!Number.isFinite(v)||v<0)errors.push('invalid counter '+k);}
 if(get('effects.calls')!==calls)errors.push('formal query frequency changed');
 if(get('entityIndex.builds')!==1||get('entityIndex.buildEntitiesVisited')!==n)errors.push('construction must be exactly one visible N pass');
 if(get('shared.lookupHits')!==calls||get('shared.candidateEntitiesVisited')!==calls||get('entityIndex.mapLookups')!==calls*2+(dense?n:2)*calls)errors.push('direct target candidate work exceeds fixed budget');
 if(get('mentor.lookupHits')!==calls||get('mentor.candidateEntitiesVisited')!==calls||get('mentor.relationsVisited')!==calls||get('mentor.lookupFallbacks'))errors.push('mentor work exceeds fixed relation budget');
 if(get('shared.lookupFallbacks')||get('shared.fallbackEntitiesVisited')||get('experience.shared.entitiesVisited'))errors.push('fallback full scan exceeds indexed fixture zero budget');
 if(get('experience.active.arrays')||get('experience.active.copied'))errors.push('active temporary array regression');
 // Far-query candidates stay fixed at2 (caller plus helper); dense queries
 // honestly visit N. Both separate one-time N construction passes are visible.
 if(get('spatial.builds')!==1||get('spatial.buildEntitiesVisited')!==n)errors.push('spatial construction must expose exactly one N pass');
 if(get('conditions.peer.entitiesVisited')!==(dense?n:2)*calls||get('spatial.cellCandidateVisits')!==(dense?n:2)*calls||get('spatial.cellQueries')>25*calls)errors.push('local candidate work exceeds fixed far/dense budget');
 if(get('spatial.lookupFallbacks')||get('spatial.fallbackEntitiesVisited'))errors.push('local query fallback scan exceeds zero budget');
 return errors;
}
function fixture(n,{owned=true,dense=false,unknown=false,relationHeavy=false,extraProbes=0}={}){
 const list=Array.from({length:n},(_,i)=>({id:i+1,x:dense?0:i>0&&i<n-1?1000:0,y:0,hp:100,maxHp:100,level:1,state:'fight',faction:1,techniques:[],relations:new Map()}));
 const actor=list[0];initializeProfile(actor);actor.relations.set(n,{type:'mentor'});actor.wanxiang.hexagram={id:'hex_45'};actor.wanxiang.bonds=[{id:'shared_insight',targetKey:'mortal:'+n,expiresDay:10}];
 if(relationHeavy)for(let i=0;i<5000;i++)actor.relations.set(n+1+i,{type:'comrade'});
 const world={day:0,plane:'mortal',entities:list};enableWorkMetrics(world,true,{timing:false});if(owned)beginEntityReadPass(world,true);
 try{for(let i=0;i<5;i++)readEffects(actor,{world,day:0},'wx-e1c-fixture');for(let i=0;i<extraProbes;i++)visitNearPeers(world,actor,()=>{});if(unknown)countWorkMetric(world,'shared.hiddenFullScan',n);}finally{endEntityReadPass(world);}
 return workMetricsSnapshot(world);
}
for(const n of [500,1000,1500,2500])for(const dense of [false,true])assert.deepEqual(indexedBudget(fixture(n,{dense}),n,5,{dense}),[],`actual indexed production fixture N=${n} dense=${dense}`);
assert(indexedBudget(fixture(500,{owned:false}),500).some(e=>e.includes('fallback full scan')),'real production fallback path, not a fabricated counter, fails indexed budget');
assert(indexedBudget(fixture(500,{unknown:true}),500).some(e=>e.includes('unknown metric')),'real unregistered counted work fails');
console.log('E1C cost ratchet: actual N=500/1000/1500/2500 far+dense queries; visible identity+spatial construction passes; actual fallback/unknown-work red paths rejected');

const naturalBudgets=JSON.parse(fs.readFileSync(new URL('../docs/development/WX_E1C_COST_BUDGETS.json',import.meta.url)));
export function naturalBudget(work,budget){
 const errors=[],get=k=>Number(work[k]||0);
 for(const [key,value]of Object.entries(work)){if(!naturalBudgets.registeredNaturalKeys.includes(key))errors.push('unknown natural metric '+key);if(typeof value==='number'&&(!Number.isFinite(value)||value<0))errors.push('invalid natural counter '+key);}
 for(const [key,cap]of [['conditions.peer.entitiesVisited',budget.maxima.peer],['shared.candidateEntitiesVisited',budget.maxima.targets],['entityIndex.buildEntitiesVisited',budget.maxima.build],['spatial.buildEntitiesVisited',budget.maxima.build],['spatial.positionChecks',budget.maxima.position],['mentor.relationsVisited',budget.maxima.relations],['spatial.cellQueries',budget.maxima.cellQueries],['entityIndex.mapLookups',budget.maxima.mapLookups]])if(get(key)>cap)errors.push(key+' exceeds reviewed natural cap');
 for(const key of ['conditions.peer.calls','mentor.lookupCalls','spatial.lookupCalls'])if(get(key)!==budget.expectedPeerCalls)errors.push(key+' query frequency changed');
 if(get('shared.lookupCalls')!==budget.expectedSharedCalls)errors.push('shared lookup frequency changed');
 for(const key of ['entityIndex.builds','spatial.builds'])if(get(key)!==budget.expectedBuilds)errors.push(key+' unexpected build frequency');
 for(const key of ['shared.lookupFallbacks','shared.fallbackEntitiesVisited','spatial.lookupFallbacks','spatial.fallbackEntitiesVisited','entityIndex.invalidations'])if(get(key)!==budget.expectedFallbacks)errors.push(key+' natural fallback/invalidation explosion');
 const actual=Object.fromEntries(Object.entries(work).filter(([k])=>k.startsWith('effects.source.')));try{assert.deepEqual(actual,budget.expectedSourceTags);}catch{errors.push('natural sourceTag frequencies changed');}
 return errors;
}
assert(naturalBudget(fixture(500,{owned:false}),naturalBudgets.cases[0]).some(e=>e.includes('fallback/invalidation explosion')),'actual fallback production path also fails natural fallback ratchet');
assert(naturalBudget(fixture(500,{relationHeavy:true}),naturalBudgets.cases[0]).some(e=>e.includes('mentor.relationsVisited exceeds')),'actual relation-heavy production queries trip relation cap');
assert(naturalBudget(fixture(500,{extraProbes:5000}),naturalBudgets.cases[0]).some(e=>e.includes('spatial.cellQueries exceeds')),'actual extra cell probes trip cell cap even when effect sourceTag count stays fixed');
const nativeFile=process.argv.find(a=>a.startsWith('--native-report='))?.slice(16);
if(nativeFile){const report=JSON.parse(fs.readFileSync(nativeFile));assert.equal(report.exitCode,0,'only completed native equivalence proof is admitted');for(const [path,hash]of Object.entries(report.source.hashes).filter(([p])=>p.startsWith('src/inkbox/'))){const actual=createHash('sha256').update(fs.readFileSync(new URL('../'+path,import.meta.url))).digest('hex');assert.equal(actual,hash,'native cost proof must match CURRENT production bytes: '+path);}for(const budget of naturalBudgets.cases){const row=report.native.find(w=>w.age===budget.age&&w.days===budget.days&&w.dt===budget.dt);assert(row,'all frozen natural workloads required');assert.equal(row.checkpoint.sha256,budget.checkpointSha256);assert(row.completeWorldAllRngAndTagsEqual);assert.deepEqual(naturalBudget(row.rows.find(r=>r.measured).work,budget),[],`native budget ${budget.age}y dt=${budget.dt}`);}console.log('E1C frozen natural cost budgets: all four actual oracle/world/RNG proof workloads pass');}
