import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { Life } from '../src/inkbox/sim/life.js';
import { DAO_BY_KEY } from '../src/inkbox/core/cultivation.js';
import { stepDaoActivities, stepDaoTravel, daoActivityFor } from '../src/inkbox/sim/daoActivities.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';

function scene(path) {
  const world = new World(40, 32, 711);
  world.day = 30;
  const life = new Life(world, () => .5);
  const actor = world.addEntity({ sp: 'cultivator', name: '复行修士', x: 10.5, y: 10.5,
    tx: 10.5, ty: 10.5, hp: 100, maxHp: 100, level: 8, age: 1200, lifespan: 50000,
    state: 'wander', artifacts: [], karma: 0, dao: { path: DAO_BY_KEY[path], stage: 0, progress: 0 } });
  return { world, life, actor };
}
function assignAndAct(s) {
  assert.equal(stepDaoActivities(s.world, s.life), 1, 'one real job assigned');
  assert.equal(stepDaoTravel(s.world, s.life, s.actor, 1), true, 'new active job executes');
  assert.equal(daoActivityFor(s.world, s.actor.id).stage, 'done');
}
{
  const s = scene('alchemy');
  const target = s.world.addEntity({ sp: 'human', name: '伤者', x: 10.7, y: 10.5,
    hp: 40, maxHp: 100, level: 0, state: 'wander', age: 8000, lifespan: 40000 });
  assignAndAct(s);
  assert.equal(target.hp, 52);
  s.world.day = 90;
  assert.equal(stepDaoActivities(s.world, s.life), 0, 'cooldown prevents an early second action');
  s.world.day = 120;
  assignAndAct(s);
  assert.equal(target.hp, 64, 'same alchemist really heals a second time');
  assert.equal(s.world.wanling.stats.daoActions, 2);
  assert.equal(s.world.wanling.jobs.filter(j => j.stage === 'done').length, 2, 'history remains visible');
  assert.equal(s.actor.hp, 98, 'each completed treatment pays its actual cost');
  console.log('WT-I1: same alchemist completes two paid treatments after cooldown');
}
{
  const s = scene('talisman');
  const target = { id: 1, name: '符村', x: 10.7, y: 10.5, hp: 100, food: 20 };
  s.world.villages.push(target);
  assignAndAct(s);
  s.world.day = 120;
  assert.equal(stepDaoActivities(s.world, s.life), 0, 'talisman uses its longer cooldown');
  s.world.day = 210;
  assignAndAct(s);
  assert.equal(target.food, 18, 'same talisman actor actually pays for the second ward');
  const payload = serializeWorld(s.world);
  const restored = deserializeWorld(JSON.parse(JSON.stringify(payload)));
  const actor = restored.entities.find(e => e.id === s.actor.id);
  restored.day = 390;
  assignAndAct({ world: restored, life: new Life(restored, () => .5), actor });
  assert.equal(restored.villages[0].food, 17, 'completed history and cooldown continue through v11 reload');
  console.log('WT-I1: second talisman and third post-load action retain their real food costs');
}
{
  for (const end of ['target', 'death', 'ascent']) {
    const s = scene('alchemy');
    const target = s.world.addEntity({ sp: 'human', x: 24, y: 10.5, hp: 40, maxHp: 100 });
    assert.equal(stepDaoActivities(s.world, s.life), 1);
    if (end === 'target') s.world.entities.splice(s.world.entities.indexOf(target), 1);
    if (end === 'death') s.actor.hp = 0;
    if (end === 'ascent') s.actor._ascended = true;
    assert.equal(stepDaoTravel(s.world, s.life, s.actor, 1), false);
    const job = daoActivityFor(s.world, s.actor.id);
    assert.equal(job.stage, 'done');
    assert(Number.isFinite(job.completedDay));
    assert.equal(s.world.wanling.stats.daoActions || 0, 0, 'cancelled work is not a completed treatment');
  }
  console.log('WT-I1: lost target, death and ascent terminate active work without fake success');
}
