// Controlled boundaries; these are not natural world performance samples.
import assert from 'node:assert/strict';
import {emptyProfile} from '../src/inkbox/wanxiang/profile.js';
import * as skills from '../src/inkbox/wanxiang/skills.js';
import {enableWorkMetrics,workMetricsSnapshot} from '../src/inkbox/sim/workMetrics.js';
import {World} from '../src/inkbox/world/World.js';
import {Life} from '../src/inkbox/sim/life.js';
import {serializeWorld,deserializeWorld} from '../src/inkbox/io/save.js';
import {TERRAIN,TIME} from '../src/inkbox/core/config.js';
import {enableWanxiang} from '../src/inkbox/wanxiang/runtime.js';

const actor=(level=5)=>({id:1,name:'受控人物',sp:level?'cultivator':'human',level,hp:100,maxHp:100,x:4,y:4,plane:0,techniques:[],wanxiang:emptyProfile()});
for(const physique of [null,{id:'devour'},{id:'devour',dormant:true}]){
  const e=actor();e.wanxiang.physique=physique;const w={};enableWorkMetrics(w);
  skills.stepSkillResources(e,1,w);
  assert.equal(workMetricsSnapshot(w)['skills.manaCapacity'],1,'C1: exactly one capacity evaluation per resource update, including first allocation');
  const cap=physique?.id==='devour'&&!physique.dormant?18:30;
  assert.equal(e.wanxiang.cultivation.combat.mana,cap);
  const state=e.wanxiang.cultivation.combat;state.mana=3;state.cooldowns.strike=22;state.lastActionDay=9;
  enableWorkMetrics(w);skills.stepSkillResources(e,2,w);
  assert.equal(workMetricsSnapshot(w)['skills.manaCapacity'],1);assert.equal(state.mana,7);
  assert.equal(state.cooldowns.strike,22);assert.equal(state.lastActionDay,9);
}
for(const dt of [0,-1,NaN,Infinity]){const e=actor(),before=JSON.stringify(e);skills.stepSkillResources(e,dt);assert.equal(JSON.stringify(e),before);}
const broken=actor();broken.wanxiang.cultivation.combat={mana:-3,cooldowns:{},lastActionDay:-1};skills.stepSkillResources(broken,1);assert.equal(broken.wanxiang.cultivation.combat.mana,2,'preserve the prior negative-mana repair order');
const equipped=actor();equipped.wanxiang.cultivation.skills=['renew'];skills.combatState(equipped);assert.deepEqual(equipped.wanxiang.cultivation.skills,['renew']);
if(!process.argv.includes('--capacity-only')){
  assert.equal(typeof skills.needsSkillResources,'function','C2 has a read-only lightweight eligibility predicate');
  for(const days of [30,360]){
    const e=actor(0),before=JSON.stringify(e.wanxiang);
    for(let i=0;i<days;i++)skills.stepSkillResources(e,1);
    assert.equal(JSON.stringify(e.wanxiang),before,'plain mortal keeps Profile without automatic skills/combat allocation');
  }
  const old=actor(0);old.wanxiang.cultivation.combat={mana:3,lastActionDay:1,cooldowns:{strike:100}};
  skills.stepSkillResources(old,2);assert.equal(old.wanxiang.cultivation.combat.mana,7,'legacy mortal combat keeps its old regeneration policy');
  assert.equal(old.wanxiang.cultivation.combat.cooldowns.strike,100);
  old.level=1;skills.stepSkillResources(old,1);assert.equal(old.wanxiang.cultivation.combat.mana,9,'awakening does not reset saved mana');
  for(const plane of [0,1,2,'mortal','upper','nether']){
    const e=actor();e.plane=plane;e.hp=.001;e.wanxiang.states=[{id:'poisoned',expiresDay:200}];
    e.possessedBy={day:3};assert(skills.needsSkillResources(e),'wounded/possessed/plane identity never drops a cultivator from maintenance');
    skills.stepSkillResources(e,1);e.level=0;assert(skills.needsSkillResources(e),'level loss with existing combat still maintains state');
  }
  const absent=actor(0);delete absent.wanxiang;skills.stepSkillResources(absent,1);assert.equal(absent.wanxiang,undefined,'disabled/no Profile mortal is not initialized by resource maintenance');

  // Formal Life/stepCultivation path, using an explicitly controlled adult fixture.
  // This is a boundary regression, not a natural-awakening frequency claim.
  const lifeWorld=new World(64,64,61001);lifeWorld.height.fill(.8);lifeWorld.water.fill(0);lifeWorld.moist.fill(.8);lifeWorld.veg.fill(1);lifeWorld.type.fill(TERRAIN.GRASS);lifeWorld.qi.fill(.9);enableWanxiang(lifeWorld,{fresh:true});
  const life=new Life(lifeWorld,()=>0);assert.equal(life.spawn(32,32,'human',1,0,{genesis:true}),1);
  const awakened=lifeWorld.entities[0];awakened.age=18*TIME.daysPerYear-1;awakened.lifespan=100*TIME.daysPerYear;
  assert(awakened.wanxiang,'controlled genesis actor has a real initialized Profile');
  assert.equal(awakened.level,0);assert.equal(awakened.wanxiang.cultivation.combat,undefined);
  life.stepEntity(awakened,1); // Formal Life.stepEntity -> stepCultivation consumer.
  assert.equal(awakened.level,1,'real stepCultivation awakens the adult on this controlled step');
  assert.equal(skills.needsSkillResources(awakened),true,'level gained through stepCultivation qualifies immediately');
  skills.stepSkillResources(awakened,1);
  assert.equal(awakened.wanxiang.cultivation.combat.mana,30,'first eligible resource maintenance grants legal capacity');
  const target={...actor(1),id:2,sp:'cultivator',plane:awakened.plane,x:awakened.x+1,y:awakened.y};
  assert.equal(skills.equipSkills(awakened,['spell']),true,'awakened actor can equip a formally legal skill');
  const cast=skills.chooseSkillAction(awakened,target,1,{power:1,defense:0});
  assert.equal(cast?.kind,'spell','newly awakened actor can cast through the formal skill consumer');
  assert.equal(awakened.wanxiang.cultivation.combat.mana,20,'first legal cast pays its normal mana cost');

  // A real v11 save/restore must retain an already-present combat payload exactly;
  // the resource guard must not reset its cooldown/action history.
  // Controlled level loss represents an old ordinary-mortal combat payload.
  awakened.level=0;awakened.sp='human';
  awakened.wanxiang.cultivation.combat={mana:7,lastActionDay:19,cooldowns:{spell:25}};
  const restored=deserializeWorld(serializeWorld(lifeWorld));const restoredActor=restored.entities.find(e=>e.id===awakened.id);
  assert.equal(restoredActor.level,0);assert(skills.needsSkillResources(restoredActor));
  assert.deepEqual(restoredActor.wanxiang.cultivation.combat,{mana:7,lastActionDay:19,cooldowns:{spell:25}},'v11 Profile combat payload round-trips');
  skills.stepSkillResources(restoredActor,2);
  assert.equal(restoredActor.wanxiang.cultivation.combat.mana,11,'legacy combat mana resumes rather than resetting');
  assert.equal(restoredActor.wanxiang.cultivation.combat.cooldowns.spell,25);
  assert.equal(restoredActor.wanxiang.cultivation.combat.lastActionDay,19);

  // Native Life.step duration boundaries with a plain mortal Profile. Fixed high RNG
  // prevents the controlled adult path from awakening; no natural-world claim is made.
  for(const days of [30,360]){
    const w=new World(64,64,61002+days);w.height.fill(.8);w.water.fill(0);w.moist.fill(.8);w.veg.fill(1);w.type.fill(TERRAIN.GRASS);enableWanxiang(w,{fresh:true});
    const nativeLife=new Life(w,()=>.999);assert.equal(nativeLife.spawn(32,32,'human',1),1);
    const mortal=w.entities[0];mortal.age=0;mortal.level=0;mortal.sp='human';
    assert(mortal.wanxiang,'controlled mortal has the ordinary initialized Profile');
    nativeLife.step(days);
    assert.equal(mortal.level,0,`controlled mortal remains unawakened during Life.step(${days})`);
    assert.equal(mortal.wanxiang.cultivation.combat,undefined,`Life.step(${days}) never initializes ineligible combat`);
    assert.deepEqual(mortal.wanxiang.cultivation.skills,[],`Life.step(${days}) leaves skills uninitialized`);
  }

  // Existing combat on a deceased profile is retained up to the formal Life death
  // sweep; dead entities are removed and never receive another resource tick.
  const deadWorld=new World(64,64,61003);deadWorld.height.fill(.8);deadWorld.water.fill(0);deadWorld.moist.fill(.8);deadWorld.veg.fill(1);deadWorld.type.fill(TERRAIN.GRASS);enableWanxiang(deadWorld,{fresh:true});
  const deadLife=new Life(deadWorld,()=>.999);assert.equal(deadLife.spawn(32,32,'human',1),1);
  const deceased=deadWorld.entities[0];deceased.hp=0;deceased.wanxiang.cultivation.combat={mana:5,lastActionDay:4,cooldowns:{strike:8}};
  deadLife.step(1);assert.equal(deadWorld.entities.includes(deceased),false,'formal Life cleanup removes a dead profile holder');
}
console.log(process.argv.includes('--capacity-only')
  ? 'WX-E0 skills: controlled capacity and S-class mana preservation passed'
  : 'WX-E0 skills: controlled capacity, formal Life awakening/casting, native mortal eligibility, v11 restore and death cleanup passed');
