import assert from 'node:assert/strict';
import {initializeProfile,validateProfile} from '../src/inkbox/wanxiang/profile.js';
import {emitCommittedFact,processExperienceFact,experienceEffects,maintainExperienceRelations} from '../src/inkbox/wanxiang/experiences.js';
import {captureWorldStreams} from '../src/inkbox/sim/worldStreams.js';
import {serializeWanxiang,restoreWanxiang} from '../src/inkbox/wanxiang/saveState.js';
const actor=id=>({id,hp:100,maxHp:100,level:3,x:id,y:1,exp:100,dao:{path:{key:'sword'}},artifacts:[]});
const make=()=>({day:100,plane:'mortal',seed:42,wanxiang:{enabled:true},entities:Array.from({length:20},(_,i)=>actor(i+1))});
{
 const w=make(),e=w.entities[0];initializeProfile(e).physique={id:'yin_block',stage:0};
 for(let i=2;i<=17;i++)assert(emitCommittedFact(w,e,{id:'aid:'+i,type:'healed',amount:10,paid:true,helperKey:'mortal:'+i}));
 assert.equal(e.wanxiang.history.filter(row=>row.type==='aid-bond').length,16);
 assert.equal(e.wanxiang.bonds.length,32);assert.equal(e.wanxiang.bonds.filter(r=>r.id==='shared_insight').length,16);
 // The first source is out of range; another real helper can supply insight.
 w.entities[1].x=100;assert(experienceEffects(e,w.day,w).cultivation>0);
 const saved=serializeWanxiang(w);restoreWanxiang(w,saved);assert.equal(e.wanxiang.bonds.length,32);
 w.day+=721;maintainExperienceRelations(e.wanxiang,w.day);assert.equal(e.wanxiang.bonds.length,16);assert.equal(e.wanxiang.experienceLedger.bondHistory.length,16);
 assert(emitCommittedFact(w,e,{id:'aid-new',type:'healed',amount:10,paid:true,helperKey:'mortal:18'}));assert.equal(e.wanxiang.bonds.length,18);
 w.day+=3601;maintainExperienceRelations(e.wanxiang,w.day);assert.equal(e.wanxiang.bonds.length,0);assert.equal(e.wanxiang.experienceLedger.bondHistory.length,32);
}
{
 const w=make(),e=w.entities[0];assert(emitCommittedFact(w,e,{id:'initial',type:'escaped'}));
 const l=e.wanxiang.experienceLedger;l.cooldowns=Object.fromEntries(Array.from({length:32},(_,i)=>['full:'+i,99999]));
 const rng=JSON.stringify(captureWorldStreams(w));
 assert(emitCommittedFact(w,e,{id:'gate',type:'breakthrough-success',targetLevel:4}));
 assert.equal(e.wanxiang.experienceLedger.highWater,4);assert.equal(e.wanxiang.experienceLedger.recentFacts['breakthrough-success'],100);
 assert.equal(e.wanxiang.experienceLedger.records.at(-1).rewardEligible,false);assert.equal(JSON.stringify(captureWorldStreams(w)),rng);
 assert.equal(processExperienceFact(w,e,{id:'gate',type:'breakthrough-success',targetLevel:4}),false);
 e.wanxiang.physique={id:'yin_block',stage:0};
 assert(emitCommittedFact(w,e,{id:'heal1',type:'healed',amount:10,paid:true,helperKey:'mortal:2'}));w.day+=30;
 assert(emitCommittedFact(w,e,{id:'heal2',type:'healed',amount:10,paid:true,helperKey:'mortal:2'}));assert.equal(e.wanxiang.physique.stage,1);assert(e.wanxiang.history.some(row=>row.type==='meridian-open'&&row.kind==='natural'&&row.source==='heal2')); 
 for(let i=0;i<150;i++)assert(emitCommittedFact(w,e,{id:'esc:'+i,type:'escaped'}));
 assert.equal(e.wanxiang.experienceLedger.seen.length,128);assert.equal(e.wanxiang.experienceLedger.records.length,24);
 const saved=serializeWanxiang(w);restoreWanxiang(w,saved);assert.equal(e.wanxiang.experienceLedger.recentFacts['breakthrough-success'],100);
 assert.equal(processExperienceFact(w,e,{id:'old',sequence:1,type:'escaped'}),false);
}
console.log('WX-C ledger: 32 multi-source bonds, active capacity/history, full cooldown facts, independent treatment, bounded receipts and save replay passed');

{
 const w=make(),e=w.entities[0],p=initializeProfile(e);
 p.bonds=[{id:'shared_insight',targetKey:'upper:2',dormant:true,previousLife:true,expiresDay:50},{id:'gratitude:mortal:3',targetKey:'mortal:3',permanent:true,expiresDay:50}];
 maintainExperienceRelations(p,w.day);assert.equal(p.bonds.length,1);assert.equal(p.experienceLedger.bondHistory[0].targetKey,'upper:2');assert.equal(p.experienceLedger.bondHistory[0].previousLife,true);assert.equal(experienceEffects(e,w.day,w).cultivation,0);
 p.traits=[{id:'risk_fear'}];p.experienceLedger.siteFailures[7]=50;
 assert(emitCommittedFact(w,e,{id:'resolve',type:'site-success',siteId:7,arrived:true}));
 assert(e.wanxiang.history.some(row=>row.type==='risk-resolved'&&row.source==='resolve'&&row.result.siteId===7));
 const saved=serializeWanxiang(w);restoreWanxiang(w,saved);assert.equal(e.wanxiang.experienceLedger.bondHistory[0].previousLife,true);
}
console.log('WX-C natural milestones and dormant past-life source preservation passed');

{
 const w=make(),e=w.entities[0],p=initializeProfile(e);
 p.traits=[{id:'risk_resolve',source:'prior-recovery'},{id:'risk_fear',source:'later-wound'}];
 validateProfile(p);
 assert(emitCommittedFact(w,e,{id:'new-failure',type:'site-failure',siteId:9,arrived:true}));
 w.day+=30;
 assert(emitCommittedFact(w,e,{id:'new-success',type:'site-success',siteId:9,arrived:true}));
 assert.equal(e.wanxiang.traits.filter(row=>row.id==='risk_resolve').length,1);
 assert(!e.wanxiang.traits.some(row=>row.id==='risk_fear'));
 assert.equal(e.wanxiang.traits.find(row=>row.id==='risk_resolve').source,'prior-recovery');
 assert(e.wanxiang.history.some(row=>row.type==='risk-resolved'&&row.source==='new-success'));
 validateProfile(e.wanxiang);const saved=serializeWanxiang(w);restoreWanxiang(w,saved);validateProfile(e.wanxiang);
}
console.log('WX-C recurring fear recovery preserves unique traits and original resolve source with new milestone');
