import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { stepOpportunitySupply } from '../src/inkbox/sim/sites.js';
import { stepEncounters,stepEncounterTravel } from '../src/inkbox/wanxiang/encounters.js';
import { encounterDecision,aidPreference,opportunitySnapshot } from '../src/inkbox/wanxiang/opportunities.js';
import { initializeProfile } from '../src/inkbox/wanxiang/profile.js';
import { MANUALS } from '../src/inkbox/core/lore.js';
const w=new World(40,40,73101);w.wanxiang={enabled:true};w.day=360;
w.type.fill(5);w.water.fill(0);w.qi.fill(1);w.height.fill(.5);w.sites=[];
const e={id:1,sp:'cultivator',hp:100,maxHp:100,level:5,x:20,y:20,techniques:[]};initializeProfile(e);w.entities=[e];w.villages=[{id:1,x:20,y:20,hp:100,food:100}];
stepOpportunitySupply(w);assert.equal(w.sites.length,1);assert.equal(opportunitySnapshot(w).counters.generated,1);assert.equal(opportunitySnapshot(w).counters.supplyChecks,1);
stepOpportunitySupply(w);assert.equal(w.sites.length,1,'one annual supply');assert.equal(opportunitySnapshot(w).counters.supplyChecks,1);w.day+=360;stepOpportunitySupply(w);assert.equal(w.sites.length,1,'finite stock prevents oversupply');assert.equal(opportunitySnapshot(w).counters.supplyChecks,2,'stock-full annual check still counted');
const disabled=new World(40,40,73101);disabled.wanxiang={enabled:true,wxCEnabled:false};disabled.day=360;stepOpportunitySupply(disabled);assert.equal(disabled.sites.length,0);
const site={id:9,kind:'cave',x:35,y:20,inheritanceManual:MANUALS.find(m=>m.kind==='sword').name};
e.x=20;e.y=20;e.hp=65;e.level=3;const p=e.wanxiang;p.personality=[{id:'personality_timid'}];const timid=encounterDecision(w,e,site);p.personality=[{id:'personality_sword_enthusiast'}];const sword=encounterDecision(w,e,site);assert(sword.score>timid.score);assert.equal(timid.willing,false);assert.equal(sword.willing,true);e.hp=100;assert(encounterDecision(w,e,site).willing,'healthy timid can retry');
p.traits=[{id:'risk_fear'}];const fear=encounterDecision(w,e,site);p.traits=[{id:'risk_resolve'}];assert(encounterDecision(w,e,site).score>fear.score);
p.bonds=[{id:'gratitude:mortal:2',targetKey:'mortal:2',expiresDay:w.day+360}];assert.equal(aidPreference(w,e,{id:2}).weight,1.25);p.bonds[0].dormant=true;assert.equal(aidPreference(w,e,{id:2}).weight,1);p.bonds[0].dormant=false;p.bonds[0].expiresDay=w.day;assert.equal(aidPreference(w,e,{id:2}).weight,1);
e.hp=100;w.sites=[{id:9,kind:'cave',x:20,y:20,inheritanceManual:'test'}];p.traits=[];p.personality=[];stepEncounters(w);assert(w.wanxiang.encounters.some(s=>s.stage==='open'));let calls=0;stepEncounterTravel(w,{},e,1,()=>{calls++;return {ok:true};});stepEncounterTravel(w,{},e,1,()=>{calls++;return {ok:true};});assert.equal(calls,1);assert.equal(opportunitySnapshot(w).counters.arrived,1);assert.equal(opportunitySnapshot(w).counters.success,1);
console.log('WX-C controlled production entries: annual finite supply, rollback, personality/fear choices, bounded arrivals, dormant gratitude passed');
import { stepDaoActivities,stepDaoTravel,daoActivityFor } from '../src/inkbox/sim/daoActivities.js';
import { DAO_BY_KEY } from '../src/inkbox/core/cultivation.js';
e.dao={path:DAO_BY_KEY.alchemy};e.hp=100;e.x=20;e.y=20;
p.bonds=[{id:'gratitude:mortal:2',targetKey:'mortal:2',expiresDay:w.day+360}];
const benefactor={id:2,name:'恩人',hp:30,maxHp:100,level:0,x:24,y:20};
const closer={id:3,name:'邻人',hp:30,maxHp:100,level:0,x:23.5,y:20};
w.entities=[e,benefactor,closer];w.sites=[];w.wanxiang.encounters=[];
assert(stepDaoActivities(w,{}));assert.equal(daoActivityFor(w,e.id).targetId,2,'gratitude changes actual target');
e.x=24;const costBefore=e.hp;assert(stepDaoTravel(w,{},e,1));assert(e.hp<costBefore);assert(benefactor.hp>30);assert.equal(opportunitySnapshot(w).counters.reciprocity,1);
const restored=structuredClone(w.wanxiang.opportunities);assert.deepEqual(restored,opportunitySnapshot(w));
assert.equal(stepDaoTravel(w,{},e,1),false,'completed assistance cannot repeat');
console.log('WX-C actual gratitude target choice and costly reciprocation passed');
// Controlled path E: identical lawful bodies, different personalities, production
// dispatch and locomotion, finite inheritance, and the official v11 roundtrip.
import { createSandboxWorld } from '../src/inkbox/ui/worldCreation.js';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { Life } from '../src/inkbox/sim/life.js';
import { rngStream } from '../src/inkbox/core/noise.js';
import { enableWanxiang } from '../src/inkbox/wanxiang/runtime.js';
import { enterSite } from '../src/inkbox/sim/sites.js';
import { serializeWorld,deserializeWorld } from '../src/inkbox/io/save.js';
const scene=createSandboxWorld(WORLD_PRESETS.small,71280,{terrainPreset:'standard'});
const life=new Life(scene,rngStream(71280));life.processPendingSpawns();enableWanxiang(scene,{fresh:true});
const origin=scene.entities.find(x=>x.sp==='human');assert(origin);
for(let i=0;i<3;i++)life.spawn(origin.x,origin.y,'cultivator',3,0,{genesis:true});
const [cautious,seeker,doctor]=scene.entities.filter(x=>x.sp==='cultivator').slice(-3);
scene.entities=[cautious,seeker,doctor];scene.sites=[];const {wanlingState}=await import('../src/inkbox/world/wanlingState.js');wanlingState(scene).jobs=[];
scene.type.fill(5);scene.water.fill(0);scene.fire.fill(0);scene.day=60;
for(const actor of [cautious,seeker]){actor.x=10;actor.y=10;actor.hp=65;actor.maxHp=100;actor.level=3;actor.techniques=[];actor.dao=null;initializeProfile(actor);}
cautious.wanxiang.personality=[{id:'personality_timid'}];seeker.wanxiang.personality=[{id:'personality_sword_enthusiast'}];
seeker.wanxiang.history=Array.from({length:128},(_,i)=>({kind:'natural-choice',day:i,type:'此前经历'}));
doctor.hp=100;doctor.maxHp=100;doctor.level=3;doctor.x=35;doctor.y=35;
const cave=scene.addSite({kind:'cave',x:25,y:10,inheritanceManual:MANUALS.find(m=>m.kind==='sword').name,inheritanceExhausted:false,age:0,visits:0});
stepEncounters(scene);const expedition=scene.wanxiang.encounters.find(s=>s.stage==='open');assert(expedition);
assert.deepEqual(expedition.participants.map(x=>x.actorId),[seeker.id]);assert(cautious.wanxiang.history.some(h=>h.type==='谨慎退避'));assert.equal(seeker.wanxiang.history.length,128);
assert.equal(cautious.x,10);assert(stepEncounterTravel(scene,life,seeker,3,(w,e,s)=>enterSite(w,e,s,()=>0)));assert(seeker.x>10,'production locomotion begins');
for(let i=0;i<900&&expedition.stage==='open';i++){scene.day+=.5;stepEncounterTravel(scene,life,seeker,.5,(w,e,s)=>enterSite(w,e,s,()=>0));}
assert.equal(cave.inheritanceClaimedBy,seeker.id,'real manual awarded only on actual arrival and study');assert.equal(cautious.techniques.length,0);
assert(seeker.wanxiang.history.at(-1).location.plane==='mortal');assert(opportunitySnapshot(scene).counters.claimed>0);
// A real paid aid/guard transaction then survives the same official save.
scene.day+=90;scene.wanxiang.encounters=[];scene.wanling.jobs=[];scene.wanling.lastPathDay=-1e6;
doctor.dao={path:DAO_BY_KEY.alchemy};doctor.x=seeker.x;doctor.y=seeker.y;seeker.hp=30;seeker.exp=1;cautious.hp=100;
initializeProfile(doctor).bonds=[{id:`gratitude:mortal:${seeker.id}`,targetKey:`mortal:${seeker.id}`,expiresDay:scene.day+360}];
assert(stepDaoActivities(scene,life));assert(stepDaoTravel(scene,life,doctor,1));
for(const counter of ['aid','guard','claimed','reciprocity'])assert(opportunitySnapshot(scene).counters[counter]>0,counter);
const loaded=deserializeWorld(serializeWorld(scene));assert.deepEqual(loaded.wanxiang.opportunities,scene.wanxiang.opportunities);
assert.equal(loaded.sites.find(s=>s.id===cave.id).inheritanceClaimedBy,seeker.id);assert.equal(loaded.entities.find(e=>e.id===seeker.id).techniques.length,1);
// Disabled WX-C uses B's fear health gate and writes no new choices.
const legacy={day:30,wanxiang:{enabled:true,wxCEnabled:false},sites:[{id:1,kind:'cave',x:1,y:1,inheritanceManual:'test'}],entities:[]};
const legacyActor={id:1,hp:80,maxHp:100,level:5,x:1,y:1,techniques:[]};initializeProfile(legacyActor).traits=[{id:'risk_fear'}];legacy.entities=[legacyActor];stepEncounters(legacy);assert.equal(legacy.wanxiang.encounters.length,0);assert.equal(legacyActor.wanxiang.history.length,0);
legacyActor.hp=100;legacy.day+=30;stepEncounters(legacy);assert.equal(legacy.wanxiang.encounters.length,1);assert.equal(legacyActor.wanxiang.history.length,0);
// Animals cannot enter the new cultivator opportunity funnel.
const animal={...legacyActor,id:2,sp:'beast',wanxiang:undefined};const animals={day:30,wanxiang:{enabled:true},sites:[{id:1,kind:'cave',x:1,y:1,inheritanceManual:'test'}],entities:[animal]};stepEncounters(animals);assert.equal(animals.wanxiang.encounters.length,0);
console.log('WX-C controlled path E: dispatch divergence, real movement/study/claim, paid aid+guard, official v11 restore, rollback and species gates passed');
