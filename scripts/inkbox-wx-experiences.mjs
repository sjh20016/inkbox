import assert from 'node:assert/strict';
import {initializeProfile} from '../src/inkbox/wanxiang/profile.js';
import {processExperienceFact,experienceEffects,experienceRng,emitCommittedFact,addExperienceState} from '../src/inkbox/wanxiang/experiences.js';
import {stepEncounters,stepEncounterTravel} from '../src/inkbox/wanxiang/encounters.js';
import {borrowPage,returnPage,stepDaoSeeds,daoSeedCultivation} from '../src/inkbox/wanxiang/daoSeeds.js';
import {bindLegend,stepLegend,chooseLegend,artifactRestriction,LEGEND_STATES,stepLegendTravel} from '../src/inkbox/wanxiang/legend.js';
import {captureWorldStreams,restoreWorldStreams} from '../src/inkbox/sim/worldStreams.js';
import {resolveDragonBone,enterSite} from '../src/inkbox/sim/sites.js';
import {MANUALS} from '../src/inkbox/core/lore.js';
const actor=id=>({id,sp:'cultivator',name:'客'+id,hp:100,maxHp:100,level:10,x:id,y:1,exp:100,fortune:50,mind:50,heartDemon:0,techniques:[],dao:{path:{key:'sword'}},artifacts:[],age:10,lifespan:100});
const make=()=>({day:1,seed:42,wanxiang:{enabled:true},entities:[actor(1),actor(2),actor(3),actor(4)],sites:[],artifacts:[],record(){}});
{
 const w=make(),e=w.entities[0];w.wanxiang.enabled=false;assert.equal(processExperienceFact(w,e,{id:'off',type:'site-success'}),false);assert.equal(e.wanxiang,undefined);w.wanxiang.enabled=true;
 const p=initializeProfile(e);p.traits.push({id:'risk_fear'});p.experienceLedger={seen:[],cooldowns:{},siteFailures:{7:0},permanentGrants:0,lastPermanentDay:-10000,records:[]};
 const fact={id:'real-site-success',type:'site-success',siteId:7,arrived:true};assert(processExperienceFact(w,e,fact));assert.equal(e.wanxiang.traits[0].id,'risk_resolve');assert.equal(processExperienceFact(w,e,fact),false);
 e.wanxiang.physique={id:'yin_block',stage:0};e.wanxiang.states.push({id:'meridian_damage'});assert(experienceEffects(e,w.day).cultivation<0);processExperienceFact(w,e,{id:'heal',type:'healed',amount:10,paid:true,helperKey:'mortal:2'});w.day+=30;processExperienceFact(w,e,{id:'heal2',type:'healed',amount:10,paid:true,helperKey:'mortal:3'});assert(!e.wanxiang.states.some(s=>s.id==='meridian_damage'));assert.equal(e.wanxiang.physique.stage,1);
 const state=captureWorldStreams(w),w2=make();restoreWorldStreams(w2,state);assert.equal(experienceRng(w)(),experienceRng(w2)());
 e.wanxiang.experienceLedger.seen=Array.from({length:128},(_,i)=>'x'+i);assert.equal(processExperienceFact(w,e,{id:'overflow',type:'site-failure'}),false);
}
{
 const w=make();for(let i=0;i<5;i++)w.sites.push({id:i+1,kind:'cave',x:5+i,y:1,inheritanceManual:MANUALS[0].name,visits:0});
 stepEncounters(w);assert(w.wanxiang.encounters.length<=3);assert(w.wanxiang.encounters.every(s=>s.participants.length<=3));
 const scene=w.wanxiang.encounters[0],e=w.entities.find(e=>e.id===scene.participants[0].actorId),s=w.sites.find(s=>s.id===scene.siteId);
 e.x=0;assert.equal(enterSite(w,e,s,()=>0),null);let moves=0;const life={moveTowards(e){moves++;e.x+=.5;}};stepEncounterTravel(w,life,e,1,()=>assert.fail('remote claim'));assert.equal(moves,1);
 e.x=s.x;e.y=s.y;stepEncounterTravel(w,life,e,1,enterSite);assert(e.wanxiang.experienceLedger.records.some(r=>r.type.startsWith('site-')));if(s.inheritanceClaimedBy)assert.equal(e.techniques.length,1);assert.equal(enterSite(w,w.entities[3],s,()=>0),null);
}
{
 const w=make();w.wanxiang.experiments={daoSeeds:true};const [e,l]=w.entities;l.techniques=[MANUALS[0]];assert(borrowPage(w,e,l,MANUALS[0].name));assert.equal(e.exp,90);assert.equal(e.techniques.length,0);assert.equal(daoSeedCultivation(e,w),.05);assert(!borrowPage(w,w.entities[2],l,MANUALS[0].name));assert(returnPage(w,e));assert(!l.wanxiang.pageLoan);assert.equal(daoSeedCultivation(e,w),0);
 w.day+=360;assert(borrowPage(w,e,l,MANUALS[0].name));w.day+=180;stepDaoSeeds(w);assert.equal(e.wanxiang.daoSeed,null);
}
{
 const w=make(),e=w.entities[0],s={id:1,x:1,y:1},a={id:8,kind:'weapon',x:1,y:1,durability:100,ownerId:0};w.sites=[s];w.artifacts=[a];assert(!bindLegend(w,a,s,e));w.wanxiang.experiments={legend:true};assert(bindLegend(w,a,s,e));assert(artifactRestriction(w,a));stepLegend(w);stepLegend(w);assert.equal(w.wanxiang.legend.stage,'choice');assert(chooseLegend(w,e.id,'leave'));assert.equal(artifactRestriction(w,a),null);assert.equal(LEGEND_STATES.length,10);
 const w2=make();w2.wanxiang.experiments={legend:true};w2.sites=[s];w2.artifacts=[a];assert(bindLegend(w2,a,s,w2.entities[0]));w2.entities[0].hp=0;stepLegend(w2);assert.equal(w2.wanxiang.legend.stage,'interrupted');assert.equal(w2.artifacts.length,1);
}
console.log('wanxiang experiences: facts, dedup, RNG resume, arrival, finite inheritance, page return, legend interrupts passed');


// Legacy proximity rewards have no experience permission; committed arrivals do.
{
 const w=make(),e=w.entities[0],s={id:99,kind:'secret',x:10,y:10,visits:0};w.sites=[s];
 enterSite(w,e,s,()=>0);assert(!e.wanxiang?.experienceLedger);
 assert.equal(processExperienceFact(w,e,{id:'fake',type:'site-success',siteId:99}),false);
 for(let i=0;i<160;i++){w.day+=721;assert(emitCommittedFact(w,e,{id:'arrival:'+i,type:'site-success',siteId:99,arrived:true}));}
 assert.equal(e.wanxiang.experienceLedger.seen.length,128);
 const seq=e.wanxiang.experienceLedger.lastSequence;
 assert.equal(processExperienceFact(w,e,{id:'old-sequence',sequence:seq,type:'site-success',siteId:99,arrived:true}),false);
}
{
 const w=make(),e=w.entities[0],s={id:100,x:e.x,y:e.y,dragonBoneCharges:1};w.sites=[s];
 assert(resolveDragonBone(w,e,s));assert.equal(s.dragonBoneCharges,0);assert.equal(e.hp,85);
 assert.equal(e.wanxiang.bloodlines[0].inheritable,false);assert(!resolveDragonBone(w,e,s));
 s.dragonBoneCharges=1;assert(!resolveDragonBone(w,e,s));w.day+=180;
 assert(resolveDragonBone(w,e,s));assert.equal(e.wanxiang.bloodlines[0].stable,true);assert.equal(e.wanxiang.bloodlines[0].inheritable,true);assert.equal(s.dragonBoneCharges,0);
}
console.log('wanxiang permission, sequence watermark, dragon resource and stabilization regressions passed');

{
 const w=make(),e=w.entities[0],s={id:1,x:15,y:1},a={id:8,kind:'weapon',x:15,y:1,durability:100,ownerId:0};w.sites=[s];w.artifacts=[a];w.wanxiang.experiments={legend:true};
 stepLegend(w);assert.equal(w.wanxiang.legend.stage,'travel');let moves=0;
 assert(stepLegendTravel(w,{moveTowards(){moves++;}},e,1));assert.equal(moves,1);assert.equal(e.x,1);
 e.x=15;stepLegend(w);assert.equal(w.wanxiang.legend.stage,'choice');assert(chooseLegend(w,e.id,'draw'));
 let claims=0;for(let i=0;i<4;i++){w.day+=30;stepLegend(w,()=>{claims++;a.ownerId=e.id;e.artifacts.push(a);return a;});}
 assert(['drawn','failed'].includes(w.wanxiang.legend.stage));const hp=e.hp;stepLegend(w,()=>{claims++;});assert(claims<=1);assert.equal(e.hp,hp);
}
console.log('wanxiang experimental auto entry, real travel and single terminal settlement passed');

// Exercise the production Life -> arrival -> enterSite call with its real RNG.
{
 const {createSandboxWorld}=await import('../src/inkbox/ui/worldCreation.js');
 const {WORLD_PRESETS}=await import('../src/inkbox/core/config.js');
 const {Life}=await import('../src/inkbox/sim/life.js');
 const w=createSandboxWorld(WORLD_PRESETS.small,62039,{terrainPreset:'standard'});
 w.wanxiang={enabled:true};const life=new Life(w,()=>.5);
 const tile=Array.from({length:w.size},(_,i)=>i).find(i=>w.isWalkable(i));assert.notEqual(tile,undefined);const spot=[tile%w.w,Math.floor(tile/w.w)];
 const e={...actor(10001),sp:'cultivator',x:spot[0]+.5,y:spot[1]+.5,anim:0,timer:0,carried:0,dao:null,lastAwakenTry:w.day};
 w.entities=[e];w.sites=[{id:123,kind:'cave',name:'arrival regression',x:e.x,y:e.y,visits:0,inheritanceManual:MANUALS[0].name,encounterMode:true}];
 w.wanxiang.encounters=[{id:'life-arrival',siteId:123,stage:'open',untilDay:w.day+720,participants:[{actorId:e.id,stage:'travel'}]}];
 assert.doesNotThrow(()=>life.stepEntity(e,1));
 assert(w.sites[0].visits>0);const p=w.wanxiang.encounters[0].participants[0];
 assert(p.stage==='arrived'||p.lastStudyDay===w.day,'arrival settles or legitimately continues study');
}
{
 const p=initializeProfile(actor(1));p.states=Array.from({length:4},(_,i)=>({id:'positive:'+i}));
 assert(addExperienceState(p,{id:'site_wound',expiresDay:180}));assert.equal(p.states.length,5);
 assert(addExperienceState(p,{id:'site_wound',expiresDay:360}));assert.equal(p.states.length,5);assert.equal(p.states[4].expiresDay,360);
 p.states=Array.from({length:32},(_,i)=>({id:'positive:'+i}));assert(addExperienceState(p,{id:'meridian_damage',expiresDay:720}));assert.equal(p.states.length,32);
}
console.log('wanxiang production Life arrival and negative-state aggregation passed');

{const w=make();w.wanxiang.experiments={daoSeeds:true};const [e,l]=w.entities;l.techniques=[MANUALS[0]];assert(borrowPage(w,e,l,MANUALS[0].name));delete l.wanxiang.pageLoan;assert.equal(daoSeedCultivation(e,w),0);stepDaoSeeds(w);assert.equal(e.wanxiang.daoSeed,null);}

// Death/ascension removes the borrower before the loan maintenance pass.
for(const late of [false,true]){
 const w=make();w.wanxiang.experiments={daoSeeds:true};const [e,l]=w.entities;l.techniques=[MANUALS[0]];
 assert(borrowPage(w,e,l,MANUALS[0].name));const revision=l.wanxiang.revision;
 w.entities=w.entities.filter(x=>x!==e);if(late)w.day+=1000;
 // Isolate maintenance so automatic nearby borrowing cannot replace the lock.
 w.wanxiang.experiments.daoSeeds=false;stepDaoSeeds(w);
 assert.equal(l.wanxiang.pageLoan,undefined);assert.equal(l.wanxiang.revision,revision+1);
 w.wanxiang.experiments.daoSeeds=true;assert(borrowPage(w,w.entities[1],l,MANUALS[0].name));
}
console.log('wanxiang removed-borrower reservation cleanup passed');
