import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createSandboxWorld} from '../src/inkbox/ui/worldCreation.js';
import {WORLD_PRESETS} from '../src/inkbox/core/config.js';
import {DAO_BY_KEY} from '../src/inkbox/core/cultivation.js';
import {Life} from '../src/inkbox/sim/life.js';
import {rngStream} from '../src/inkbox/core/noise.js';
import {enableWanxiang} from '../src/inkbox/wanxiang/runtime.js';
import {initializeProfile} from '../src/inkbox/wanxiang/profile.js';
import {cultivationRate} from '../src/inkbox/sim/cultivation.js';
import {stepDaoActivities,stepDaoTravel} from '../src/inkbox/sim/daoActivities.js';
import {serializeWorld,deserializeWorld} from '../src/inkbox/io/save.js';
import {World} from '../src/inkbox/world/World.js';
import {recomputeAll} from '../src/inkbox/world/terrain.js';
import {MANUALS} from '../src/inkbox/core/lore.js';
import {stepEncounters,stepEncounterTravel} from '../src/inkbox/wanxiang/encounters.js';
import {enterSite,resolveDragonBone} from '../src/inkbox/sim/sites.js';

// Controlled initial state, then production actions. This is not a natural-world observation.
let w=createSandboxWorld(WORLD_PRESETS.small,71280,{terrainPreset:'standard'});
let life=new Life(w,rngStream(71280));life.processPendingSpawns();enableWanxiang(w,{fresh:true});
const origin=w.entities.find(e=>e.sp==='human');assert(origin);
life.spawn(origin.x,origin.y,'cultivator',3,0,{genesis:true});
const actors=w.entities.filter(e=>e.sp==='cultivator').slice(-3);assert.equal(actors.length,3);
const [patient,healer1,healer2]=actors;
for(const e of actors){e.x=origin.x;e.y=origin.y;e.level=8;e.exp=0;e.hp=100;e.maxHp=100;}
for(const h of [healer1,healer2])h.dao={path:DAO_BY_KEY.alchemy,stage:0,progress:0};
patient.hp=40;patient.dao=null;initializeProfile(patient).physique={id:'yin_block',stage:0};
const ids=actors.map(e=>e.id),before=cultivationRate(w,patient);
w.day=30;assert(stepDaoActivities(w,life));assert(stepDaoTravel(w,life,healer1,1));
assert.equal(patient.wanxiang.physique.treatments,1);assert.equal(patient.wanxiang.physique.stage,0);
const saved=serializeWorld(w);w=deserializeWorld(saved);life=new Life(w,rngStream(71280));
const [p,h1,h2]=ids.map(id=>w.entities.find(e=>e.id===id));
assert.equal(p.wanxiang.physique.treatments,1,'first real treatment survives save');
// Too early and too small are negative controls through the native treatment gate.
w.day=31;const stage=p.wanxiang.physique.stage;
stepDaoActivities(w,life);stepDaoTravel(w,life,h2,1);
assert.equal(p.wanxiang.physique.stage,stage,'treatment before 30 days cannot open meridians');
// A new healer acts after both the physiology gap and normal DAO activity cooldown.
w.day=120;p.hp=40;h1.hp=100;h2.hp=100;
life.spawn(p.x,p.y,'cultivator',1,0,{genesis:true});
const last=w.entities.at(-1);last.level=8;last.dao={path:DAO_BY_KEY.alchemy,stage:0,progress:0};last.x=p.x;last.y=p.y;
stepDaoActivities(w,life);assert(stepDaoTravel(w,life,last,1));
assert.equal(p.wanxiang.physique.stage,1);
const after=cultivationRate(w,p);assert(after>before,`${after} should exceed blocked ${before}`);
const recovered=deserializeWorld(serializeWorld(w)).entities.find(e=>e.id===p.id);
assert.equal(recovered.wanxiang.physique.stage,1);
const evidence={kind:'controlled production-entry test',path:'A',seed:71280,patientId:p.id,healerIds:[h1.id,h2.id,last.id],firstTreatmentDay:30,rejectedEarlyStage:stage,openedDay:120,rateBefore:before,rateAfter:after,stageAfterSave:recovered.wanxiang.physique.stage};
mkdirSync('reports/local/wanxiang-b',{recursive:true});writeFileSync('reports/local/wanxiang-b/path-a.json',JSON.stringify(evidence,null,2));
console.log('WX-B path A native paid treatment, minimum interval, stage change, cultivation consumer and save restoration passed');

// B has controlled terrain and actors, while intent, movement and acquisition use production rules.
{
 let world=new World(40,32,771);world.height.fill(.5);world.moist.fill(.5);world.veg.fill(.5);recomputeAll(world);
 let controller=new Life(world,()=>.5);controller.spawn(10,10,'cultivator',2,0,{genesis:true});
 enableWanxiang(world,{fresh:true});
 const people=world.entities.filter(e=>e.sp==='cultivator');assert.equal(people.length,2);
 for(const e of people){e.level=10;e.hp=e.maxHp;e.techniques=[];e.wanxiang.bloodlines=[];e.wanxiang.physique=null;}
 const site={id:901,kind:'cave',name:'受控命途洞府',x:people[0].x+5,y:people[0].y,visits:0,inheritanceManual:MANUALS.find(m=>m.kind==='sword').name};
 world.sites=[site];world.day=30;stepEncounters(world);assert.equal(world.wanxiang.encounters.length,1);
 const actor=people[0],start={x:actor.x,y:actor.y};
 stepEncounterTravel(world,controller,actor,1,enterSite);assert.notDeepEqual({x:actor.x,y:actor.y},start);
 const mid=serializeWorld(world);world=deserializeWorld(mid);controller=new Life(world,()=>.5);
 for(let n=0;n<100&&!world.sites[0].inheritanceExhausted;n++){
  world.day++;for(const e of world.entities)stepEncounterTravel(world,controller,e,1,(...args)=>enterSite(...args.slice(0,3),()=>0));
 }
 assert(world.sites[0].inheritanceExhausted,'one actual successful arrival claims the manual');
 const owners=world.entities.filter(e=>e.techniques.some(t=>t.name===site.inheritanceManual));assert.equal(owners.length,1);
 const claim=world.sites[0].inheritanceClaimedBy;
 world.day+=1000;stepEncounters(world);assert.equal(world.sites[0].inheritanceClaimedBy,claim);
 const restored=deserializeWorld(serializeWorld(world));assert.equal(restored.sites[0].inheritanceClaimedBy,claim);
 // Controlled fear state follows an actual failed cave entry. Retry still uses
 // the public encounter selection and arrival, and the same retained failure.
 const retryActor=world.entities.find(e=>e.id===claim);
 const retrySite={id:903,kind:'cave',name:'受控再访洞府',x:retryActor.x+2,y:retryActor.y,visits:0,inheritanceManual:MANUALS.find(m=>m.name!==site.inheritanceManual).name};
 world.sites.push(retrySite);world.day+=31;stepEncounters(world);
 for(let n=0;n<100&&!retryActor.wanxiang.experienceLedger?.siteFailures?.[903];n++){
  world.day++;for(const e of world.entities)stepEncounterTravel(world,controller,e,1,(...args)=>enterSite(...args.slice(0,3),()=>.999));
 }
 assert(retryActor.wanxiang.experienceLedger.siteFailures[903]);
 for(let n=0;n<30;n++){world.day++;for(const e of world.entities)stepEncounterTravel(world,controller,e,1,(...args)=>enterSite(...args.slice(0,3),()=>.999));}
 retryActor.hp=retryActor.maxHp;
 retryActor.wanxiang.traits=retryActor.wanxiang.traits.filter(t=>!['risk_fear','risk_resolve'].includes(t.id));
 retryActor.wanxiang.traits.push({id:'risk_fear'});
 world.day+=181;stepEncounters(world);assert(world.wanxiang.encounters.some(s=>s.siteId===903&&s.stage==='open'&&s.participants.some(p=>p.actorId===claim)),'recovered fearful actor can select another attempt');
 for(let n=0;n<100&&!retrySite.inheritanceExhausted;n++){
  world.day++;stepEncounterTravel(world,controller,retryActor,1,(...args)=>enterSite(...args.slice(0,3),()=>0));
 }
 assert(retryActor.wanxiang.traits.some(t=>t.id==='risk_resolve'),'real successful retry transforms controlled fear');
 writeFileSync('reports/local/wanxiang-b/path-b.json',JSON.stringify({kind:'controlled production-entry test',manual:site.inheritanceManual,start,claimedBy:claim,owners:owners.length,restoredOwner:restored.sites[0].inheritanceClaimedBy,retryConverted:true,scope:'Controlled initial fear follows a native failure. Native recovered candidate selection and successful second arrival transform it to risk_resolve. Natural fear acquisition frequency is outside this test.'},null,2));
 console.log('WX-B path B intent, movement, mid-travel save and single manual owner passed');
}

{
 const world=new World(80,64,71281);world.height.fill(.48);world.veg.fill(.9);world.moist.fill(.6);recomputeAll(world);
 const controller=new Life(world,()=>.1),village=controller.foundVillage(30,30,0);assert(village);
 controller.spawn(30,30,'human',2,0,{village:village.id});enableWanxiang(world,{fresh:true});
 const parents=world.entities.filter(e=>e.village===village.id&&e.sp==='human').slice(0,2);
 for(const e of parents){e.age=20*360;e.lifespan=100*360;e.hp=e.maxHp;e.wanxiang.bloodlines=[];}
 const parent=parents[0];parent.level=5;
 const site={id:902,kind:'cave',x:parent.x,y:parent.y,dragonBoneCharges:2};world.sites.push(site);
 assert(resolveDragonBone(world,parent,site));assert(!parent.wanxiang.bloodlines[0].inheritable);
 assert(!resolveDragonBone(world,parent,site),'too early cannot stabilize');
 world.day+=180;parent.hp=parent.maxHp;assert(resolveDragonBone(world,parent,site));assert.equal(site.dragonBoneCharges,0);
 assert(!resolveDragonBone(world,parent,site),'empty resource cannot repeat');
 let child,blood;
 for(let n=0;n<20&&!blood;n++){
  const before=world.entities.length;assert.equal(controller.spawn(parent.x,parent.y,'human',1,0,{village:village.id,allowSouls:true,parents}),1);
  child=world.entities[before];blood=child.wanxiang.bloodlines.find(b=>b.id==='true_dragon');
 }
 assert(blood?.latent,'bounded real birth draws include a latent descendant');
 assert.equal(blood.source.parent,`mortal:${parent.id}`);
 const copy=deserializeWorld(serializeWorld(world)).entities.find(e=>e.id===child.id);
 assert.deepEqual(copy.wanxiang.dna,child.wanxiang.dna);assert(copy.wanxiang.bloodlines.find(b=>b.id==='true_dragon').latent);
 controller.stepEntity(child,1);assert(child.wanxiang.bloodlines.find(b=>b.id==='true_dragon').latent,'newborn remains latent');
 child.level=3;child.sp='cultivator';controller.stepEntity(child,1);
 assert.equal(child.wanxiang.bloodlines.find(b=>b.id==='true_dragon').latent,false,'qualified native step manifests inherited blood');
 assert.equal(deserializeWorld(serializeWorld(world)).entities.find(e=>e.id===child.id).wanxiang.bloodlines.find(b=>b.id==='true_dragon').latent,false);
 writeFileSync('reports/local/wanxiang-b/path-c.json',JSON.stringify({kind:'controlled production-entry test',parentId:parent.id,childId:child.id,source:copy.wanxiang.bloodlines[0].source,dragonBoneRemaining:site.dragonBoneCharges,latentAtBirth:true,manifestedAfterQualifiedLifeStep:true,scope:'Actual finite dragon-bone acquisition, interval stabilization, eligible native birth, inherited DNA restoration and native qualification consumer. Level three qualification is controlled setup.'},null,2));
 console.log('WX-B path C finite acquisition, stabilization, eligible native birth, manifestation and DNA restore passed');
}
