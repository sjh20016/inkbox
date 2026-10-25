import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { History, lightning, meteor, plague } from '../src/inkbox/sim/powers.js';
import { requestWanling } from '../src/inkbox/sim/wanling.js';
import { deserializeWorld, serializeWorld } from '../src/inkbox/io/save.js';
import { TERRAIN } from '../src/inkbox/core/config.js';

function scene() {
  const w = new World(32, 32, 4242);
  w.height.fill(0.45); w.moist.fill(0.5); w.temp.fill(0.6); w.veg.fill(0.8);
  w.type.fill(TERRAIN.GRASS);
  return w;
}
function place(w, form, x, y) {
  const result = requestWanling(w, form, x, y);
  assert.equal(result.ok, true, `${form}: ${result.reason}`);
  return result.unit;
}
function cast(run) {
  const history = new History(); history.begin();
  const result = run(history);
  history.end('定向天灾测试');
  return result;
}
function mortalLedgers(world) {
  return JSON.stringify({ dead:world.dead, deadLog:world.deadLog, souls:world.souls,
    soulLog:world.soulLog, nextSoulId:world.nextSoulId });
}

// A direct lightning hit damages and removes an actual new unit, while a saved
// event describes the species. Ordinary entities and the human casualty count
// remain outside that ecology record.
{
  const w = scene(), deer = place(w, 'deer', 9, 9), far = place(w, 'wolf', 22, 22);
  w.addEntity({ sp:'human', x:26.5, y:26.5, hp:60, maxHp:60, state:'wander', name:'远村居民' });
  const lives = w.entities.length, dead = w.dead?.length || 0;
  const ledgers = mortalLedgers(w);
  const toast = cast(history => lightning(w, 10, 10, history));
  assert.equal(w.wanling.units.some(u => u.id === deer.id), false, 'lightning kills the struck nine-animal herd');
  assert.equal(far.hp, far.maxHp, 'outside units remain untouched');
  assert.equal(w.entities.length, lives, 'new-unit casualties do not create or remove people');
  assert.equal(w.dead?.length || 0, dead, 'new-unit casualties never enter the human necrology');
  assert.equal(mortalLedgers(w), ledgers, 'new-unit casualties do not alter human deaths or souls');
  assert.match(toast, /万灵受灾/);
  assert.ok(w.wanling.events.some(e => e.id === deer.id && e.text.includes('鹿群') && e.text.includes('覆灭')));
}

// Meteor uses its existing radius + 2; an individual disappears and its source
// effects and targeted path are invalidated. No mortal death pipeline is used.
{
  const w = scene(), hit = place(w, 'wood', 12, 12);
  w.height[w.idx(23,23)] = 0.7;
  const far = place(w, 'stone', 23, 23);
  w.wanling.effects.push({ kind:'bond', sourceId:hit.id, targetId:1, x:12, y:12, radius:0, value:1, untilDay:100 });
  w.wanling.jobs.push({ actorId:1, path:'spirit', targetKind:'wanling-or-entity', targetId:hit.id,
    x:12, y:12, stage:'travel', startedDay:0, nextDay:90, summary:'前往木魅' });
  const toast = cast(history => meteor(w, 12, 12, 2, history));
  assert.equal(w.wanling.units.some(u => u.id === hit.id), false, 'meteor removes its direct individual target');
  assert.equal(far.hp, far.maxHp, 'meteor does not reach beyond the existing radius + 2');
  assert.equal(w.wanling.effects.some(e => e.sourceId === hit.id || e.targetId === hit.id), false);
  assert.equal(w.wanling.jobs[0].stage, 'done', 'a path to the destroyed unit ends immediately');
  assert.ok(toast.includes('万灵受灾'));
  const restored = deserializeWorld(serializeWorld(w));
  assert.equal(restored.wanling.units.some(u => u.id === hit.id), false, 'death state remains valid through save/load');
  assert.equal(restored.wanling.jobs[0].stage, 'done');
}

// Plague applies the same coordinate-seeded 55% chance to each pack anchor,
// reduces herd quantity without expanding it into full person entities, and
// leaves a deterministic out-of-range/outcome pack alone.
{
  const w = scene(), deer = place(w, 'deer', 9, 9), wolf = place(w, 'wolf', 9, 14);
  const outside = place(w, 'deer', 25, 25), count = { deer: deer.count, wolf: wolf.count };
  const lives = w.entities.length, ledgers = mortalLedgers(w);
  const toast = plague(w, 10, 10, 8);
  assert.equal(deer.count, count.deer - Math.ceil(count.deer * 0.55));
  assert.equal(wolf.count, count.wolf - Math.ceil(count.wolf * 0.55));
  assert.equal(outside.count, 9, 'a stable roll above 55% preserves an outside pack');
  assert.equal(w.entities.length, lives, 'pack casualties never become people');
  assert.equal(wanlingDeathTally(w), 0, 'no human death ledger entry is attributed to a pack');
  assert.equal(mortalLedgers(w), ledgers, 'plague casualties never enter the human soul or death ledger');
  assert.ok(toast.includes('万灵受灾'));
  const saved = deserializeWorld(serializeWorld(w));
  assert.deepEqual(saved.wanling.units.map(u => [u.id,u.form,u.count,u.hp]),
    w.wanling.units.map(u => [u.id,u.form,u.count,u.hp]));
  assert.ok(saved.wanling.events.some(e => e.id === deer.id && e.text.includes('数量损失')));
}

// Disabled or absent ecology retains the original powers path and never creates
// an optional block merely because a divine strike occurred.
{
  const absent = scene(); cast(history => lightning(absent, 10, 10, history));
  assert.equal(absent.wanling, undefined);
  const disabled = scene(); disabled.wanling = { v:1, enabled:false, nextId:1, lastEcoDay:0,
    lastSpawnDay:0, lastPathDay:0, units:[], effects:[], jobs:[], events:[], stats:{} };
  cast(history => meteor(disabled, 10, 10, 2, history));
  assert.deepEqual(disabled.wanling.events, []);
  assert.equal(disabled.wanling.units.length, 0);
}

function wanlingDeathTally(world) { return world.dead?.length || 0; }
console.log('W0.1 disasters: 4 scenarios passed (lightning, meteor, plague, disabled/absent block).');
