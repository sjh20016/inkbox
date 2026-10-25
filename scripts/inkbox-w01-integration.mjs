import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { Life } from '../src/inkbox/sim/life.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { cultivationRate } from '../src/inkbox/sim/cultivation.js';
import { requestWanling } from '../src/inkbox/sim/wanling.js';
import { addWanlingEffect, wanlingState } from '../src/inkbox/world/wanlingState.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { encodeSave, decodeSave, isCompressed } from '../src/inkbox/io/codec.js';
import { LEGACY_BEAST_FORMS } from '../src/inkbox/core/wanlingCatalog.js';
import { DAO_BY_KEY } from '../src/inkbox/core/cultivation.js';

const failures = [];
const checks = [];
async function check(name, fn) {
  try { await fn(); checks.push({ name, result: 'pass' }); console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, error: error?.stack || String(error) }); checks.push({ name, result: 'fail', error: String(error) }); console.error(`FAIL ${name}: ${error.message}`); }
}
function makeWorld(seed=9101) {
  return generateWorld({ preset: { w: 200, h: 128 }, seed, scatter: false });
}
function advance(world, life, state, days) {
  return advanceWorld(world, days, { life, state, riftActive: false, nether: false, wraith: false });
}
function findDry(world, predicate=()=>true) {
  for (let y=4; y<world.h-4; y++) for (let x=4; x<world.w-4; x++) {
    const i=world.idx(x,y);
    if (world.water[i] <= 0.0015 && world.fire[i] < 0.3 && world.isWalkable(i) && predicate(x,y,i)) return {x,y,i};
  }
  return null;
}
function findFormSpot(world, form) {
  for (let y=4; y<world.h-4; y++) for (let x=4; x<world.w-4; x++) {
    const i=world.idx(x,y);
    if (form==='wood' && world.water[i]<=0.0015 && world.veg[i]>=0.42 && world.fire[i]<0.3) return {x,y,i};
    if (form==='dijiang' && world.water[i]<=0.0015 && world.qi[i]>=0.55
      && world.leylines.some(l=>(l.x-x)**2+(l.y-y)**2<=8**2)) return {x,y,i};
  }
  return null;
}
function actorAt(world, life, x, y, name='集成修士') {
  const before=world.entities.length;
  const created=life.spawn(x,y,'human',1,0);
  const entity=created ? world.entities[before] : null;
  assert(entity, 'Life.spawn must return a real entity id');
  entity.name=name; entity.age=80; entity.lifespan=100000; entity.hp=entity.maxHp=1000;
  entity.level=1; entity.root={bonus:0,quality:0}; entity.dao={stage:0,path:{key:'spirit'}};
  entity.mind=70; entity.pollution=0; entity.madUntil=-1;
  return entity;
}

const report = {
  createdAt: new Date().toISOString(),
  head: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  dirtyBefore: execFileSync('git',['status','--short'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean),
  checks,
  observations: [],
};

await check('formal 200x128 Life.spawn, foundVillage and advanceWorld age/motion/save loop', () => {
  const world=makeWorld(9101), life=new Life(world,mulberry32(world.seed ^ 0xa5a5a5a5)), state=createAdvanceState();
  const spot=findDry(world,(x,y,i)=>world.type[i]===TERRAIN.FOREST&&world.veg[i]>0.45) || findDry(world);
  assert(spot, 'worldgen has a dry walkable placement');
  const village=life.foundVillage(spot.x+0.5,spot.y+0.5,0); assert(village);
  const id=life.spawn(spot.x,spot.y,'human',1,0,{village:village.id});
  const actor=world.entities.find(e=>e.id===id); assert(actor);
  actor.age=80; actor.lifespan=100000; actor.hp=actor.maxHp=1000;
  const formSpot=findFormSpot(world,'wood'); assert(formSpot,'worldgen forest habitat exists');
  const placed=requestWanling(world,'wood',formSpot.x,formSpot.y); assert.equal(placed.ok,true);
  const unit=placed.unit;
  unit.tx=Math.min(world.w-1,unit.x+8); unit.ty=unit.y;
  const oldAge=actor.age, oldX=unit.x;
  advance(world,life,state,30);
  assert.equal(world.day,30);
  assert.equal(actor.age,oldAge+30);
  assert(Math.abs(unit.x-oldX)<=1.650001,'formal monthly ecology and Life do not double-move independent units');
  assert(!world.entities.includes(unit),'wanling remains outside Life human/entity slots');
  assert.notEqual(unit.state,'dissipated');
});

await check('v11 wanling block survives gzip encode/decode and synchronous world serde exactly', async () => {
  const world=makeWorld(9102), life=new Life(world,mulberry32(world.seed ^ 0xa5a5a5a5));
  const spot=findFormSpot(world,'wood'); assert(spot);
  const {unit}=requestWanling(world,'wood',spot.x,spot.y); assert(unit);
  const actor=actorAt(world,life,spot.x+0.5,spot.y+0.5);
  world.wanling.effects=[
    {kind:'calm',sourceId:unit.id,targetId:unit.id,x:unit.x,y:unit.y,radius:6,value:.5,untilDay:180},
    {kind:'bond',sourceId:unit.id,targetId:actor.id,x:actor.x,y:actor.y,radius:0,value:1,untilDay:120},
  ];
  world.wanling.jobs=[{actorId:actor.id,path:'spirit',targetKind:'wanling-or-entity',targetId:unit.id,x:unit.x,y:unit.y,stage:'travel',startedDay:0,nextDay:120,summary:'保存任务'}];
  world.wanling.cooldowns={actorId:actor.id,path:'spirit',untilDay:120};
  world.wanling.lastEcoDay=0; world.wanling.lastSpawnDay=0; world.wanling.lastPathDay=0;
  const expected=structuredClone(world.wanling), payload=serializeWorld(world);
  assert.deepEqual(payload.wanling,expected);
  const encoded=await encodeSave(JSON.stringify(payload));
  assert(isCompressed(encoded),'node supports and uses the production compressed-save boundary');
  const decoded=JSON.parse(await decodeSave(encoded));
  const restored=deserializeWorld(decoded);
  assert.deepEqual(restored.wanling,expected);
});

await check('old save without wanling block loads and malformed block is explicitly rejected', () => {
  const world=makeWorld(9103), old=serializeWorld(world); delete old.wanling;
  assert.doesNotThrow(()=>deserializeWorld(old));
  assert.equal(deserializeWorld(old).wanling,undefined);
  const corrupt=serializeWorld(world);
  corrupt.wanling={v:1,enabled:true,nextId:1,lastEcoDay:0,lastSpawnDay:0,lastPathDay:0,units:[{id:0}],effects:[],jobs:[],events:[],stats:{}};
  assert.throws(()=>deserializeWorld(corrupt),/万灵存档区块损坏/);
});

await check('row[71] concrete beast forms and pre-W0.1 four-form fallback remain readable', () => {
  const world=makeWorld(9104), life=new Life(world,mulberry32(world.seed ^ 0xa5a5a5a5));
  const spot=findDry(world); assert(spot);
  for (const form of LEGACY_BEAST_FORMS) {
    const before=world.entities.length; const created=life.spawn(spot.x,spot.y,'beast',1,0); const e=created ? world.entities[before] : null; assert(e);
    e.form=form;
  }
  const payload=serializeWorld(world);
  const beasts=payload.entities.filter(row=>row[1]==='beast');
  assert.equal(beasts.length,LEGACY_BEAST_FORMS.length);
  assert.deepEqual(beasts.map(row=>row[71]),LEGACY_BEAST_FORMS);
  assert.deepEqual(deserializeWorld(payload).entities.filter(e=>e.sp==='beast').map(e=>e.form),LEGACY_BEAST_FORMS);
  const legacy=structuredClone(payload); for (const row of legacy.entities) if(row[1]==='beast') row.length=71;
  const migrated=deserializeWorld(legacy).entities.filter(e=>e.sp==='beast');
  assert.equal(migrated.length,LEGACY_BEAST_FORMS.length);
  assert(migrated.every(e=>LEGACY_BEAST_FORMS.includes(e.form)),'old rows derive a stable supported legacy shape');
});

await check('Life main RNG draw count matches the wanling-disabled path and direct Life baseline', () => {
  const seed=9105, a=makeWorld(seed), b=makeWorld(seed);
  a.wanling={v:1,enabled:false,nextId:1,lastEcoDay:0,lastSpawnDay:0,lastPathDay:0,units:[],effects:[],jobs:[],events:[],stats:{}};
  let drawsA=0,drawsB=0;
  const lifeA=new Life(a,()=>{drawsA++;return .5;}), lifeB=new Life(b,()=>{drawsB++;return .5;});
  const state=createAdvanceState();
  for(let n=0;n<3;n++) { advance(a,lifeA,state,30); lifeB.step(30); }
  assert.equal(drawsA,drawsB,'advance with wanling disabled adds no Life.rng calls beyond Life.step');
});

await check('dijiang resonance and active bond affect cultivation formula; movement, expiry and death remove bonus', () => {
  const world=makeWorld(9106), life=new Life(world,mulberry32(world.seed ^ 0xa5a5a5a5));
  const p=findFormSpot(world,'dijiang'); assert(p,'worldgen qi/leyline habitat exists');
  const actor=actorAt(world,life,p.x+0.5,p.y+0.5);
  actor.x=p.x+0.5; actor.y=p.y+0.5;
  const base=cultivationRate(world,actor);
  const placed=requestWanling(world,'dijiang',p.x,p.y); assert.equal(placed.ok,true);
  const unit=placed.unit;
  const resonant=cultivationRate(world,actor); assert(resonant>base);
  unit.bondedBy=actor.id; unit.bondUntilDay=world.day+30;
  const bonded=cultivationRate(world,actor); assert(bonded>resonant);
  unit.x=actor.x+20; assert.equal(cultivationRate(world,actor),base);
  unit.x=actor.x; world.day=30; assert.equal(cultivationRate(world,actor),resonant,'bond expiry leaves only the active local dijiang resonance');
  unit.hp=0; world.day=0; assert.equal(cultivationRate(world,actor),base,'dead source contributes no resonance/bond');
});

await check('actor death does not leave an active DAO travel job after real advanceWorld', () => {
  const world=makeWorld(9107), life=new Life(world,mulberry32(world.seed ^ 0xa5a5a5a5)), state=createAdvanceState();
  const spot=findDry(world); assert(spot); const actor=actorAt(world,life,spot.x+0.5,spot.y+0.5);
  actor.dao=null;
  const wood=findFormSpot(world,'wood'); assert(wood,'worldgen forest habitat exists for job target');
  const {unit}=requestWanling(world,'wood',wood.x,wood.y);
  world.wanling.lastPathDay=-30;
  advance(world,life,state,1);
  const job={actorId:actor.id,path:'spirit',targetKind:'wanling-or-entity',targetId:unit.id,x:unit.x,y:unit.y,stage:'travel',startedDay:world.day,nextDay:world.day+120,summary:'死亡清理探针'};
  world.wanling.jobs.push(job); actor.hp=0;
  advance(world,life,state,30);
  assert(!world.wanling.jobs.some(j=>j.actorId===actor.id&&j.stage!=='done'),'dead actor job should be retired by the formal path');
});

await check('completed DAO action is not replayed after serialize/deserialize sampling', () => {
  const world=makeWorld(9108), life=new Life(world,mulberry32(world.seed ^ 0xa5a5a5a5)), state=createAdvanceState();
  wanlingState(world);
  const spot=findDry(world); assert(spot); const village=life.foundVillage(spot.x+0.5,spot.y+0.5,0); assert(village);
  const actor=actorAt(world,life,spot.x+0.5,spot.y+0.5); actor.village=village.id; actor.dao={stage:0,path:DAO_BY_KEY.talisman};
  actor.x=village.x; actor.y=village.y;
  world.wanling.lastPathDay=-30;
  advance(world,life,state,30);
  assert(world.wanling.jobs.some(j=>j.actorId===actor.id&&j.stage==='travel'),'monthly formal path assigns the live task');
  actor.x=village.x; actor.y=village.y;
  const baselinePayload=serializeWorld(world); baselinePayload.wanling.jobs=[];
  const baseline=deserializeWorld(baselinePayload), baselineLife=new Life(baseline,mulberry32(baseline.seed ^ 0xa5a5a5a5));
  advance(baseline,baselineLife,createAdvanceState(),1);
  advance(world,life,state,1);
  const job=world.wanling.jobs.find(j=>j.actorId===actor.id); assert.equal(job.stage,'done');
  const food=village.food, effects=world.wanling.effects.length, actions=world.wanling.stats.daoActions||0;
  assert.equal(baseline.villages[0].food-food,1,'the formal action spends exactly one provision above ordinary village changes');
  assert.equal(effects,1); assert.equal(actions,1);
  const restored=deserializeWorld(serializeWorld(world)), restoredLife=new Life(restored,mulberry32(restored.seed ^ 0xa5a5a5a5));
  advance(restored,restoredLife,createAdvanceState(),1);
  assert(food-restored.villages[0].food<1,'the sampled action must not consume a second provision after reload');
  assert.equal(restored.wanling.effects.length,effects);
  assert.equal(restored.wanling.stats.daoActions,actions);
});

// Three ordinary worldgen seeds, capped at three years each. This records actual
// natural appearance only; it never inserts a test unit into an observation run.
for (const seed of [673231, 20261025, 314159]) {
  const world=generateWorld({preset:{w:200,h:128},seed,scatter:true});
  const life=new Life(world,mulberry32(world.seed ^ 0xa5a5a5a5)), state=createAdvanceState();
  const observation={seed,years:3,ticks:36,samples:[],natural:{spawned:0,forms:{},maxUnits:0,maxEntities:world.entities.length,maxVillages:world.villages.length,maxDao:0,maxEvents:0}};
  const sample=()=>{
    const units=world.wanling?.units||[];
    observation.samples.push({day:world.day,entities:world.entities.length,villages:world.villages.length,
      units:units.length,liveUnits:units.filter(u=>u.hp>0).length,forms:Object.fromEntries(Object.entries(units.reduce((m,u)=>(m[u.form]=(m[u.form]||0)+1,m),{}))),
      effects:world.wanling?.effects?.length||0,jobs:world.wanling?.jobs?.length||0,
      daoActions:world.wanling?.stats?.daoActions||0,disasters:world.villages.reduce((n,v)=>n+(v.damageEpisode?1:0),0),
      events:world.wanling?.events?.length||0});
  };
  sample();
  const seenIds=new Set();
  for(let tick=1;tick<=36;tick++) {
    advance(world,life,state,30);
    const units=world.wanling?.units||[];
    for(const u of units) if(!seenIds.has(u.id)) {
      seenIds.add(u.id); observation.natural.spawned++;
      observation.natural.forms[u.form]=(observation.natural.forms[u.form]||0)+1;
    }
    observation.natural.maxUnits=Math.max(observation.natural.maxUnits,units.length);
    observation.natural.maxEntities=Math.max(observation.natural.maxEntities,world.entities.length);
    observation.natural.maxVillages=Math.max(observation.natural.maxVillages,world.villages.length);
    observation.natural.maxDao=Math.max(observation.natural.maxDao,world.wanling?.stats?.daoActions||0);
    observation.natural.maxEvents=Math.max(observation.natural.maxEvents,world.wanling?.events?.length||0);
    if(tick%3===0) sample();
  }
  report.observations.push(observation);
  console.log(`OBS ${JSON.stringify({seed,finalDay:world.day,finalEntities:world.entities.length,finalVillages:world.villages.length,wanling:world.wanling?.units?.length||0,natural:observation.natural})}`);
}

report.finishedAt=new Date().toISOString();
report.checks=checks; report.failures=failures;
report.headAfter=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
report.dirtyAfter=execFileSync('git',['status','--short'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
mkdirSync('reports/local/w01/verify',{recursive:true});
writeFileSync('reports/local/w01/verify/integration.json',`${JSON.stringify(report,null,2)}\n`);
console.log(`W0.1 integration checks: ${checks.filter(x=>x.result==='pass').length} passed, ${failures.length} failed; observations=3 seeds x 3 years`);
if(failures.length) process.exitCode=1;
