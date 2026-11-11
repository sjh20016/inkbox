import assert from 'node:assert/strict';
import {beginEntityReadPass,endEntityReadPass} from '../src/inkbox/sim/entityReadView.js';
import {readEffects} from '../src/inkbox/wanxiang/effects.js';
import {initializeProfile} from '../src/inkbox/wanxiang/profile.js';
import {enableWorkMetrics,workMetricsSnapshot,countWorkMetric} from '../src/inkbox/sim/workMetrics.js';

const keys=new Set(['effects.calls','effects.actors','effects.alloc.result','effects.alloc.entryArrays','conditions.calls','conditions.peer.calls','conditions.peer.entitiesVisited','conditions.peer.maxScan','conditions.peer.nearHits','conditions.peer.mentorHits','experience.calls','experience.active.queries','experience.active.sets','experience.active.arrays','experience.active.copied','experience.active.visited','experience.shared.bonds','experience.shared.calls','experience.shared.entitiesVisited','experience.shared.hits','entityIndex.passes','entityIndex.builds','entityIndex.buildEntitiesVisited','entityIndex.invalidations','entityIndex.invalidBuilds','entityIndex.mapLookups','shared.lookupCalls','shared.lookupHits','shared.lookupMisses','shared.lookupFallbacks','shared.fallbackEntitiesVisited','shared.candidateEntitiesVisited']);
export function indexedBudget(work,n,calls=5){
 const errors=[],get=k=>Number(work[k]||0);
 for(const [k,v] of Object.entries(work)){if(!keys.has(k)&&!k.startsWith('effects.source.'))errors.push('unknown metric '+k);if(typeof v!=='number'||!Number.isFinite(v)||v<0)errors.push('invalid counter '+k);}
 if(get('effects.calls')!==calls)errors.push('formal query frequency changed');
 if(get('entityIndex.builds')!==1||get('entityIndex.buildEntitiesVisited')!==n)errors.push('construction must be exactly one visible N pass');
 if(get('shared.lookupHits')!==calls||get('shared.candidateEntitiesVisited')!==calls||get('entityIndex.mapLookups')!==calls)errors.push('direct target candidate work exceeds fixed budget');
 if(get('shared.lookupFallbacks')||get('shared.fallbackEntitiesVisited')||get('experience.shared.entitiesVisited'))errors.push('fallback full scan exceeds indexed fixture zero budget');
 if(get('experience.active.arrays')||get('experience.active.copied'))errors.push('active temporary array regression');
 // This shared-only ratchet admits the separately visible legacy peer scan.
 // Later local-query admission must tighten this bound, never require N work.
 if(get('conditions.peer.entitiesVisited')>n*calls)errors.push('peer work exceeds inherited ceiling');
 return errors;
}
function fixture(n,{owned=true,dense=false,unknown=false}={}){
 const list=Array.from({length:n},(_,i)=>({id:i+1,x:dense?0:i>0&&i<n-1?1000:0,y:0,hp:100,maxHp:100,level:1,state:'fight',faction:1,techniques:[],relations:new Map()}));
 const actor=list[0];initializeProfile(actor);actor.wanxiang.hexagram={id:'hex_45'};actor.wanxiang.bonds=[{id:'shared_insight',targetKey:'mortal:'+n,expiresDay:10}];
 const world={day:0,plane:'mortal',entities:list};enableWorkMetrics(world,true,{timing:false});if(owned)beginEntityReadPass(world,true);
 try{for(let i=0;i<5;i++)readEffects(actor,{world,day:0},'wx-e1c-fixture');if(unknown)countWorkMetric(world,'shared.hiddenFullScan',n);}finally{endEntityReadPass(world);}
 return workMetricsSnapshot(world);
}
for(const n of [500,1000,1500,2500])for(const dense of [false,true])assert.deepEqual(indexedBudget(fixture(n,{dense}),n),[],`actual indexed production fixture N=${n} dense=${dense}`);
assert(indexedBudget(fixture(500,{owned:false}),500).some(e=>e.includes('fallback full scan')),'real production fallback path, not a fabricated counter, fails indexed budget');
assert(indexedBudget(fixture(500,{unknown:true}),500).some(e=>e.includes('unknown metric')),'real unregistered counted work fails');
console.log('E1C cost ratchet: actual N=500/1000/1500/2500 far+dense queries; visible one-pass builds; actual fallback/unknown-work red paths rejected');
