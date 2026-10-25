import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { Life } from '../src/inkbox/sim/life.js';
import { DAO_BY_KEY } from '../src/inkbox/core/cultivation.js';
import { stepDaoActivities, stepDaoTravel, daoActivityFor } from '../src/inkbox/sim/daoActivities.js';
import { forgeArtifact, toGround } from '../src/inkbox/sim/artifacts.js';
import { foundSect } from '../src/inkbox/sim/sects.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { wanlingVillageInfluence } from '../src/inkbox/world/wanlingInfluence.js';

function scene(path) {
  const world = new World(32, 32, 711); world.day = 30;
  const life = new Life(world, () => 0.5);
  const actor = world.addEntity({ sp: 'cultivator', x: 10.5, y: 10.5, hp: 100, maxHp: 100,
    level: 8, age: 1200, lifespan: 50000, state: 'wander', tx: 10.5, ty: 10.5,
    name: `${path}修士`, kills: 0, dao: { path: DAO_BY_KEY[path], stage: 0, progress: 0 }, artifacts: [], karma: 0, pollution: 0 });
  return { world, life, actor };
}
function targetEntity(world, sp='human', extra={}) {
  return world.addEntity({ sp, x: 10.7, y: 10.5, hp: 100, maxHp: 100, level: sp==='cultivator'?5:0,
    state:'wander',tx:10.7,ty:10.5,name:'目标',kills:0,karma:0,...extra });
}
function unit(world,id=-1,form='tian-gou') {
  const u={id,form,sp:'beast',x:10.6,y:10.5,hp:20,maxHp:20,count:1,state:'idle'};
  world.wanling={v:1,enabled:true,nextId:2,lastEcoDay:0,lastSpawnDay:0,lastPathDay:0,units:[u],effects:[],jobs:[],events:[],stats:{}};
  return u;
}
function run(path,prepare,verify) {
  const s=scene(path); const target=prepare(s);
  assert.ok(stepDaoActivities(s.world,s.life)>=1,`${path}: target should create a job`);
  const before=s.world.chronicle.length;
  const did=stepDaoTravel(s.world,s.life,s.actor,1);
  assert.equal(did,true,`${path}: job should own movement/action`);
  assert.ok(daoActivityFor(s.world,s.actor.id)?.stage==='done',`${path}: job should finish on contact`);
  assert.equal(s.world.wanling.stats.daoActions,1,`${path}: action should update the activity ledger`);
  verify(s,target,before);
}

run('alchemy',({world})=>{const t=targetEntity(world);t.hp=50;return t;},({actor},t)=>assert.ok(t.hp>50));
run('talisman',({world})=>{const v={id:41,x:10.7,y:10.5,hp:100,food:10,name:'山村'};world.villages.push(v);return v;},({world},v)=>assert.ok(world.wanling.effects.some(x=>x.kind==='ward'&&x.targetId===v.id)));
run('formation',({world})=>{const s={id:2,x:10.7,y:10.5,kind:'formation',age:80,name:'古阵'};world.sites.push(s);world.villages.push({id:22,x:12,y:10.5,hp:100,food:20,name:'阵旁村'});return s;},({world},s)=>{
  const village=world.villages[0]; assert.ok(world.wanling.effects.some(x=>x.kind==='formation'&&x.targetId===s.id));
  assert.ok(wanlingVillageInfluence(world,village).damageScale<1,'maintained formation reduces real village damage');
  world.sites.splice(world.sites.indexOf(s),1);
  assert.equal(wanlingVillageInfluence(world,village).damageScale,1,'removed site immediately stops the protection');
});
run('artifact',({world,actor})=>{const a=forgeArtifact(world,actor,()=>.5);toGround(world,a,a.x,a.y);return a;},({actor,world},a)=>{assert.equal(a.ownerId,actor.id);assert.ok(!world.artifacts.includes(a));assert.equal(a.history.at(-1)[1],'found');});
run('sword',({world})=>targetEntity(world,'cultivator',{dao:{path:DAO_BY_KEY.sword,stage:0,progress:0}}),(_,t)=>{assert.ok(t.hp<100&&t.hp>0,`formal nonlethal sparring damage: ${t.hp}`);});
run('body',({world})=>unit(world,-1,'wolf'),(_,u)=>{assert.equal(u.state,'flee');assert.notEqual(u.tx,u.x);});
run('sound',({world})=>unit(world,-1,'wolf'),({world},u)=>assert.ok(world.wanling.effects.some(x=>x.kind==='calm'&&x.targetId===u.id)));
run('buddha',({world})=>{world.wraiths=[{id:2000001,x:10.7,y:10.5,hp:10,name:'怨影'}];return world.wraiths[0];},({world})=>{assert.equal(world.wraiths.length,0);assert.equal(world.wraithLog.dissolved,1);});
run('spirit',({world})=>unit(world,-1,'wood'),(_,u)=>{assert.ok(u.bondedBy>0);assert.equal(u.bondDay,30);});
run('blood',({world,actor})=>{actor.karma=99;const v={id:51,x:10.7,y:10.5,hp:100,food:8,name:'村落'};world.villages.push(v);return v;},({actor},v)=>{assert.equal(v.food,7);assert.equal(actor.karma,100);});
run('corpse',({world})=>{const s={id:17,x:10.7,y:10.5,kind:'ruin',visits:2,name:'荒冢'};world.sites.push(s);return s;},(_,s)=>assert.equal(s.visits,3));
run('soul',({world})=>{const g={id:2000002,x:10.7,y:10.5,hp:20,soulKind:'ghostCultivator',rancor:8,name:'怨魂'};world.wraiths=[g];return g;},(_,g)=>assert.ok(g.rancor<8&&g.hp<20));

const paid=scene('alchemy'); const patient=targetEntity(paid.world);patient.hp=50;
stepDaoActivities(paid.world,paid.life); const hpBefore=paid.actor.hp;
stepDaoTravel(paid.world,paid.life,paid.actor,1);
assert.ok(paid.actor.hp<hpBefore,'alchemy uses persistent cultivator HP when no sect treasury exists');
const restored=deserializeWorld(serializeWorld(paid.world));
assert.ok(restored.entities.find(e=>e.id===paid.actor.id).hp<hpBefore,'activity cost survives world serialization');
const sectPaid=scene('alchemy'); const sect=foundSect(sectPaid.world,10,10,sectPaid.actor,()=>.5,{fixture:true});
const sectPatient=targetEntity(sectPaid.world);sectPatient.hp=50; const stonesBefore=sect.resources.spiritStone;
stepDaoActivities(sectPaid.world,sectPaid.life); stepDaoTravel(sectPaid.world,sectPaid.life,sectPaid.actor,1);
assert.ok(sect.resources.spiritStone<stonesBefore,'activity spends an existing sect treasury resource when available');
const sectRestored=deserializeWorld(serializeWorld(sectPaid.world));
assert.ok(sectRestored.factions[0].resources.spiritStone<stonesBefore,'sect treasury cost survives world serialization');
const bonded=scene('spirit'); const spirit=unit(bonded.world,-1,'wood');
stepDaoActivities(bonded.world,bonded.life); stepDaoTravel(bonded.world,bonded.life,bonded.actor,1);
bonded.world.day=151; stepDaoActivities(bonded.world,bonded.life);
assert.equal(spirit.bondedBy,undefined,'expired spirit bonds are cleared on the world-day cadence');

console.log('W0.1 dao paths: 12 grounded activities passed');
