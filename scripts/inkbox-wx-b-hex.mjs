import assert from 'node:assert/strict';
import {World} from '../src/inkbox/world/World.js';
import {initializeProfile} from '../src/inkbox/wanxiang/profile.js';
import {deriveConditions} from '../src/inkbox/wanxiang/conditions.js';
import {readEffects} from '../src/inkbox/wanxiang/effects.js';
import {emitCommittedFact,consumeGateAid,experienceEffects,chooseExperienceCandidate} from '../src/inkbox/wanxiang/experiences.js';
import {emptyProfile} from '../src/inkbox/wanxiang/profile.js';
import {serializeWorld,deserializeWorld} from '../src/inkbox/io/save.js';
import {Life} from '../src/inkbox/sim/life.js';
import {DAO_BY_KEY} from '../src/inkbox/core/cultivation.js';
import {stepDaoActivities,stepDaoTravel,daoActivityFor} from '../src/inkbox/sim/daoActivities.js';
const w=new World(40,32,712);w.day=30;w.wanxiang={enabled:true};
const add=(name,x=10)=>w.addEntity({sp:'cultivator',name,x,y:10,hp:40,maxHp:100,age:8000,lifespan:40000,level:8,exp:50,artifacts:[],techniques:[],dao:{path:DAO_BY_KEY.alchemy,stage:0,progress:0}});
const healer=add('helper');healer.hp=100;
const e=add('patient',10.2);const p=initializeProfile(e);
const other=add('nearer',10.18);other.hp=50;
initializeProfile(healer).bonds.push({id:'gratitude:mortal:'+e.id,targetKey:'mortal:'+e.id,expiresDay:1000});
const life=new Life(w,()=>.5);
stepDaoActivities(w,life);
assert.equal(daoActivityFor(w,healer.id).targetId,e.id,'gratitude can choose the slightly farther real wounded benefactor');
stepDaoTravel(w,life,healer,1);
assert(p!==e.wanxiang,'committed event replaces versioned profile');
assert(e.wanxiang.bonds.some(b=>b.id==='shared_insight'));
assert(e.wanxiang.states.some(s=>s.id==='alchemy_guard'));
assert(experienceEffects(e,w.day,w).cultivation>=.04);
assert(readEffects(e,{world:w,day:w.day,targetLevel:9}).breakthrough>=.02);
assert(consumeGateAid(e,w.day));assert(!consumeGateAid(e,w.day));
assert.equal(emitCommittedFact(w,e,{id:'fail1',type:'breakthrough-failure',fromLevel:8,targetLevel:9}),true);
assert.equal(deriveConditions(e,{world:w,day:w.day,targetLevel:9}).prior_failure_same_gate,true);
assert.equal(deriveConditions(e,{world:w,day:w.day,targetLevel:10}).prior_failure_same_gate,false);
const restored=deserializeWorld(serializeWorld(w));const re=restored.entities.find(x=>x.id===e.id);
assert(deriveConditions(re,{world:restored,day:w.day,targetLevel:9}).prior_failure_same_gate);
healer.x=30;assert.equal(experienceEffects(e,w.day,w).cultivation,.0);
e.wanxiang.hexagram={id:'hex_19'};
assert.equal(readEffects(e,{world:w,day:w.day,target:{level:1}}).healing,1.08);
assert.equal(readEffects(e,{world:w,day:w.day,target:{level:10}}).healing,1);
assert.equal(readEffects(e,{world:w,day:w.day}).healing,1);
console.log('WX-B hex/experience: native gratitude action, paid gate aid once, bounded failure target proof, same-realm insight range, save restore and healing positive/negative passed');

const candidates=[{id:'insight',weight:1,family:'因缘'},{id:'risk_fear',weight:1,family:'逆境'},{id:'illegal',weight:1000,eligible:false}];
const normal=emptyProfile(),causal=emptyProfile();causal.physique={id:'causal'};
let ordinaryRare=0,causalRare=0,ordinaryInsight=0,causalInsight=0;
for(let i=0;i<10000;i++){
 const roll=(i+.5)/10000,choice=((i*37)%10000+.5)/10000;
 const a=chooseExperienceCandidate(candidates,normal,roll,choice),b=chooseExperienceCandidate(candidates,causal,roll,choice);
 if(a){ordinaryRare++;ordinaryInsight+=a.id==='insight';assert.notEqual(a.id,'illegal');}
 if(b){causalRare++;causalInsight+=b.id==='insight';assert.notEqual(b.id,'illegal');}
}
assert.equal(ordinaryRare,900);assert.equal(causalRare,ordinaryRare);assert(causalInsight>ordinaryInsight);
assert.equal(chooseExperienceCandidate([],causal,.95,.1),null);
// A character with no proximity-sensitive effect must not scan the population.
const observer={hp:100,maxHp:100,wanxiang:emptyProfile()};
const guarded={get entities(){throw Error('unexpected population scan');},get sites(){throw Error('unexpected site scan');}};
assert.equal(readEffects(observer,{world:guarded,day:1}).cultivation,1);
console.log('WX-B rarity budget: causal relative choice, illegal/empty pool rejection and inactive proximity scan guards passed');

// Prior-incarnation ties remain visible but cannot lend current-body bonuses.
const insight=e.wanxiang.bonds.find(b=>b.id==='shared_insight');
healer.x=10;insight.dormant=true;
assert.equal(experienceEffects(e,w.day,w).cultivation,0);
insight.dormant=false;assert(experienceEffects(e,w.day,w).cultivation>.03);
// This loop selects a deterministic native stream state for a rare wound fixture.
const {experienceRng}=await import('../src/inkbox/wanxiang/experiences.js');
const woundRng=experienceRng(w);let rareState;
for(let i=0;i<10000;i++){const state=woundRng.getState(),roll=woundRng();woundRng();if(roll>=.9&&roll<.99){rareState=state;break;}}
assert(rareState);woundRng.setState(rareState);
e.wanxiang.physique={id:'causal'};e.hp=10;w.day=8000;
assert(emitCommittedFact(w,e,{id:'causal-wound-1',type:'combat-wound',hostile:true,amount:30,sourceId:healer.id}));
assert.equal(e.wanxiang.experienceLedger.lastCausalChoiceDay,8000);
assert(e.wanxiang.traits.some(t=>t.id==='wounded_insight'));
w.day=8400;woundRng.setState(rareState);
assert(emitCommittedFact(w,e,{id:'causal-wound-2',type:'combat-wound',hostile:true,amount:30,sourceId:healer.id}));
assert.equal(e.wanxiang.experienceLedger.lastCausalChoiceDay,8000,'twenty-year authority survives later rare events');
console.log('WX-B dormant soul ties and causal bounded twenty-year native fact choice passed');
e.wanxiang.hexagram={id:'hex_20'};
w.wanxiang.encounters=[{stage:'open',participants:[{actorId:e.id,stage:'travel'}]}];
assert.equal(readEffects(e,{world:w,day:w.day}).detectRadius,1);
w.wanxiang.encounters[0].participants[0].stage='withdrawn';
assert.equal(readEffects(e,{world:w,day:w.day}).detectRadius,0);
assert.equal(readEffects(observer,{world:guarded,day:1}).cultivation,1);
console.log('WX-B exploration perception uses actual active encounter travel and stops after withdrawal');
// Every wired hexagram gets its own state-based positive and negative case.
import design from '../src/inkbox/wanxiang/content/designCatalog.js';
import {MANUALS} from '../src/inkbox/core/lore.js';
import {techniqueId} from '../src/inkbox/wanxiang/practice.js';
import {addRelation,RELATION_TYPES} from '../src/inkbox/sim/relations.js';
const cases={
 hex_01:'cultivationRate',hex_02:'maxHpFor',hex_03:'attemptBreakthrough',hex_04:'learningEligibility',
 hex_07:'combatPower/Life.attack',hex_08:'alchemy actual heal',hex_09:'learningEligibility',hex_11:'cultivationRate',
 hex_13:'learningEligibility',hex_19:'alchemy actual heal',hex_20:'Life perception',hex_23:'Life retreat',
 hex_26:'learningEligibility',hex_27:'Life recovery / alchemy received',hex_33:'Life retreat',
 hex_35:'cultivationRate',hex_37:'alchemy actual heal',hex_38:'learningEligibility',hex_42:'alchemy actual heal',
 hex_45:'cultivationRate',hex_46:'learningEligibility',hex_48:'alchemy actual heal',hex_55:'Life perception',
 hex_56:'cultivationRate',hex_59:'Life recovery / alchemy received',
};
function hexCase(hex,positive){
 const world=new World(40,32,671);world.wanxiang={enabled:true};world.day=1000;
 const spawn=extra=>world.addEntity({sp:'cultivator',x:10,y:10,hp:100,maxHp:100,level:8,age:8000,lifespan:50000,exp:200,techniques:[],relations:new Map(),...extra});
 const actor=spawn(),peer=spawn({x:11,level:9}),profile=initializeProfile(actor);
 const context={world,day:world.day};
 const manual=MANUALS.find(t=>t.kind==='sword'),otherManual=MANUALS.find(t=>t.kind!=='sword');
 assert(manual&&otherManual);
 switch(hex.id){
 case 'hex_01':case 'hex_02':break;
 case 'hex_03':
  assert(emitCommittedFact(world,actor,{id:'actual-gate-failure',type:'breakthrough-failure',fromLevel:8,targetLevel:9}));
  context.targetLevel=positive?9:10;break;
 case 'hex_04':if(!positive)actor.techniques.push(manual);context.manualId=techniqueId(otherManual);break;
 case 'hex_07':actor.faction=3;peer.faction=3;peer.state=positive?'fight':'rest';break;
 case 'hex_08':context.target=peer;if(positive)addRelation(actor,peer,RELATION_TYPES.COMRADE,1);break;
 case 'hex_09':case 'hex_26':
  context.manualId=techniqueId(manual);profile.cultivation.learning={[context.manualId]:hex.id==='hex_09'?(positive?.2:.8):(positive?.8:.2)};break;
 case 'hex_11':actor.mind=positive?71:70;break;
 case 'hex_13':
  addRelation(actor,peer,RELATION_TYPES.MENTOR,1);peer.x=positive?11:30;context.manualId=techniqueId(manual);break;
 case 'hex_19':context.target=peer;peer.level=positive?1:9;break;
 case 'hex_20':world.wanxiang.encounters=[{stage:'open',participants:[{actorId:actor.id,stage:positive?'travel':'withdrawn'}]}];break;
 case 'hex_23':actor.hp=positive?29:30;break;
 case 'hex_27':actor.state='rest';actor.carried=positive?1:0;break;
 case 'hex_33':context.target=peer;peer.level=positive?9:8;break;
 case 'hex_35':
  assert(emitCommittedFact(world,actor,{id:'committed-breakthrough',type:'breakthrough-success',targetLevel:9}));
  context.day=positive?1359:1360;break;
 case 'hex_37':context.target=peer;if(positive)addRelation(actor,peer,RELATION_TYPES.KIN,1);break;
 case 'hex_38':
  actor.dao={path:DAO_BY_KEY.sword,stage:0,progress:0};peer.dao={path:positive?DAO_BY_KEY.alchemy:DAO_BY_KEY.sword,stage:0,progress:0};addRelation(actor,peer,RELATION_TYPES.MENTOR,1);context.manualId=techniqueId(manual);break;
 case 'hex_42':
  context.target=peer;context.paidAid=true;
  if(!positive)profile.bonds.push({id:'gratitude:mortal:'+peer.id,targetKey:'mortal:'+peer.id,expiresDay:2000});break;
 case 'hex_45':
  actor.faction=3;peer.faction=3;peer.state='fight';for(let i=0;i<2;i++)spawn({x:11+i,faction:3,state:positive?'fight':'rest'});break;
 case 'hex_46':
  actor.dao={path:DAO_BY_KEY.sword,stage:0,progress:0};context.manualId=techniqueId(positive?manual:otherManual);break;
 case 'hex_48':case 'hex_56':
  world.villages.push({id:1,x:10,y:10});actor.birthOrigin={villageId:1};actor.x=hex.id==='hex_48'?(positive?10:20):(positive?20:10);context.target=peer;break;
 case 'hex_55':world.sites.push({id:7,kind:'ruin',x:positive?10:20,y:10});break;
 case 'hex_59':
  assert(emitCommittedFact(world,actor,{id:'actual-escape',type:'escaped',hostile:true}));context.day=positive?1179:1180;break;
 default:assert.fail('unhandled hex '+hex.id);
 }
 const axis=({maxHp:'hp',detect_radius:'detectRadius',healing_received:'healingReceived'})[hex.effect.axis]||hex.effect.axis;
 const base=readEffects(actor,context)[axis];actor.wanxiang.hexagram={id:hex.id};
 const value=readEffects(actor,context)[axis];
 if(hex.effect.condition==='always'){
  if(!positive)actor.wanxiang.hexagram=null;
  assert(Math.abs(readEffects(actor,context)[axis]-base-(positive?hex.effect.value:0))<1e-9,hex.id+' always with/without');
 }else assert(Math.abs(value-base-(positive?hex.effect.value:0))<1e-9,`${hex.id} ${positive?'positive':'negative'} ${axis}: ${value} versus ${base}`);
}
for(const [id,consumer]of Object.entries(cases)){
 const hex=design.hexagrams.find(h=>h.id===id);hexCase(hex,true);hexCase(hex,false);
 console.log(`PASS ${id} positive / negative -> ${consumer}`);
}
assert.equal(Object.keys(cases).length,25);
// Exercise the real ground AI decision, not only its derived effect axis.
import {TERRAIN} from '../src/inkbox/core/config.js';
import {maxHpFor} from '../src/inkbox/sim/cultivation.js';
function retreatRun(hexId,enemyLevel){
 const world=new World(40,32,1091);world.type.fill(TERRAIN.GRASS);world.height.fill(.5);world.veg.fill(.8);world.day=100;world.wanxiang={enabled:true};
 const runtime=new Life(world,()=>.5);assert.equal(runtime.spawn(10,10,'cultivator',2),2);
 const [actor,enemy]=world.entities;actor.level=8;enemy.level=enemyLevel;actor.exp=0;actor.age=8000;actor.lifespan=50000;actor.pollution=0;actor.mind=80;actor.madUntil=0;actor.restUntil=0;actor.timer=10;
 initializeProfile(actor).hexagram=hexId?{id:hexId}:null;actor.maxHp=maxHpFor(actor,world.day,world);actor.hp=actor.maxHp*.35;
 // Control only enemy discovery to isolate the native fight/retreat decision.
 runtime.findEnemy=()=>enemy;
 runtime.stepEntity(actor,.01);
 return actor.state;
}
assert.equal(retreatRun(null,9),'fight','35% health permits normal combat');
assert.equal(retreatRun('hex_33',9),'flee','stronger real enemy activates cautious retreat');
assert.equal(retreatRun('hex_33',8),'fight','equal-level enemy cannot activate hex33');
console.log('WX-B hex33 native Life.stepEntity enemy decision: stronger flee / neutral fight / equal fight passed');
