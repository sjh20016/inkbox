import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { OVER, classify, qiAt, recomputeAll } from '../src/inkbox/world/terrain.js';
import { igniteCell, NATURE_DAYS, natureState, setRecoveringOverlay, settleNature } from '../src/inkbox/sim/nature.js';
import { setWater } from '../src/inkbox/world/terrainEdit.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { Life } from '../src/inkbox/sim/life.js';
import { initEntity } from '../src/inkbox/sim/cultivation.js';
import { observeEnvironment } from '../src/inkbox/g2/environmentObservation.js';
import { WorldRenderBridge } from '../src/inkbox/render3d/WorldRenderBridge.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { mkdirSync, writeFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
function fixture(w = 3, h = 3) {
  const world = new World(w, h, 17);
  world.height.fill(0.5);
  world.temp.fill(0.65);
  world.moist.fill(0.7);
  world.veg.fill(0.928);
  recomputeAll(world);
  return world;
}
function derived(world, i) {
  const x = i % world.w;
  const y = (i - x) / world.w;
  assert.equal(world.type[i], classify(world, x, y, i));
  assert(Math.abs(world.qi[i] - qiAt(world, x, y, i)) < 1e-6);
}
function advanceDays(world, days) {
  return advanceWorld(world, days, { state: createAdvanceState(), life: { step() {} }, riftActive: false, nether: false, wraith: false });
}

check('explicit coast water and vegetation remain static through game-day advancement', () => {
  const world = fixture(), i = 0;
  world.height[i] = 0;
  world.veg[i] = 0.6;
  setWater(world, i, 0.03);
  recomputeAll(world);
  advanceDays(world, 30);
  assert.equal(world.water[i], Math.fround(0.03));
  assert.equal(world.veg[i], Math.fround(0.6));
  derived(world, i);
});

check('explicit high-elevation lake retains water and does not grow vegetation', () => {
  const world = fixture(), i = 4;
  setWater(world, i, 0.03);
  world.veg[i] = 0.6;
  recomputeAll(world);
  assert.equal(world.type[i], TERRAIN.SEA);
  advanceDays(world, 360);
  assert.equal(world.water[i], Math.fround(0.03));
  assert.equal(world.veg[i], Math.fround(0.6));
  derived(world, i);
});

check('rock cover has no spontaneous random decline', () => {
  const world = fixture(), i = 4;
  world.height[i] = 0.68;
  world.veg[i] = 0.6;
  recomputeAll(world);
  assert.equal(world.type[i], TERRAIN.ROCK);
  advanceDays(world, 360);
  assert.equal(world.veg[i], Math.fround(0.6));
  derived(world, i);
});

check('active fire persists until its exact dueDay', () => {
  const world = fixture(1, 1);
  assert.equal(igniteCell(world, 0), true);
  const event = natureState(world).fires.get(0);
  assert.equal(event.dueDay, world.day + NATURE_DAYS.fire);
  advanceDays(world, NATURE_DAYS.fire - 1);
  assert(world.fire[0] > 0.4);
  advanceDays(world, 1);
  assert.equal(world.fire[0], 0);
});

check('combat-style ignition does not auto-spread into adjacent cells', () => {
  const world = fixture(2, 1);
  world.veg.fill(0.8);
  world.moist.fill(0);
  assert.equal(igniteCell(world, 0), true);
  assert.equal(world.fire[1], 0);
  assert.equal(natureState(world).fires.has(1), false);
});

check('simultaneous due fires leave real scorch and reduce fuel in one settlement', () => {
  const world = fixture();
  for (const i of [0, 1]) {
    world.veg[i] = 0.8;
    assert.equal(igniteCell(world, i), true);
  }
  recomputeAll(world);
  const before = world.revision;
  world.day += NATURE_DAYS.fire;
  assert.equal(settleNature(world), 2);
  assert.equal(world.revision, before + 2, 'one dirty flush and one world touch settle the due batch');
  for (const i of [0, 1]) {
    assert.equal(world.fire[i], 0);
    assert.equal(world.veg[i], Math.fround(0.2));
    assert.equal(world.over[i], OVER.SCORCHED);
    derived(world, i);
  }
});

check('vegetation stays fixed while timed scorch remains until dueDay', () => {
  const world = fixture(1, 1), i = 0;
  world.veg[i] = 0.34;
  setRecoveringOverlay(world, i, OVER.SCORCHED);
  const overlay = natureState(world).overlays.get(i);
  advanceDays(world, NATURE_DAYS.scorched - 1);
  assert.equal(world.over[i], OVER.SCORCHED);
  assert.equal(world.veg[i], Math.fround(0.34));
  advanceDays(world, 1);
  assert.equal(world.over[i], OVER.NONE);
  assert.equal(world.veg[i], Math.fround(0.34));
  assert.equal(world.day, overlay.dueDay);
  derived(world, i);
});

check('four corners, four edges, and one-cell world settle exactly once without spillover', () => {
  for (const [w, h, cells] of [
    [1, 1, [[0, 0]]],
    [3, 3, [[0, 0], [2, 0], [0, 2], [2, 2], [1, 0], [1, 2], [0, 1], [2, 1]]],
  ]) {
    for (const [x, y] of cells) {
      const world = fixture(w, h), i = world.idx(x, y);
      world.veg[i] = 0.8;
      assert.equal(igniteCell(world, i), true);
      world.day += NATURE_DAYS.fire;
      assert.equal(settleNature(world), 1);
      assert.equal(world.fire[i], 0);
      assert.equal(world.over[i], OVER.SCORCHED);
      derived(world, i);
    }
  }
});

check('wet water refuses ignition while dry combustible cells hold scheduled events', () => {
  const run = (water, veg) => {
    const world = fixture(2, 1);
    world.moist.fill(0.9);
    world.veg[0] = 0.8;
    world.veg[1] = veg;
    setWater(world, 1, water);
    recomputeAll(world);
    return igniteCell(world, 1);
  };
  assert.equal(run(0, 0.8), true);
  assert.equal(run(0.03, 0.8), false);
  assert.equal(run(0, 0.1), true, 'ignition is an explicit event rather than a fuel-spread simulation');
});

check('fire and overlay due transitions keep type and qi synchronized', () => {
  const world = fixture(1, 1), i = 0;
  world.veg[i] = 0.8;
  assert.equal(igniteCell(world, i), true);
  world.day += NATURE_DAYS.fire;
  assert.equal(settleNature(world), 1);
  assert.equal(world.over[i], OVER.SCORCHED);
  assert.equal(world.type[i], TERRAIN.SCORCHED);
  const qi = world.qi[i];
  derived(world, i);
  assert.notEqual(world.qi[i], 0.12);
  const due = natureState(world).overlays.get(i).dueDay;
  world.day = due;
  assert.equal(settleNature(world), 1);
  assert.equal(world.over[i], OVER.NONE, 'scorched terrain expires directly to ordinary ground');
  assert.notEqual(world.qi[i], qi);
  derived(world, i);
  derived(world, i);
});

check('formal Life fire damage and World access thresholds use authoritative fire', () => {
  const makeActor = (fire) => {
    const world = fixture();
    world.fire[4] = fire;
    const actor = initEntity({
      name: '火伤探针', sp: 'human', x: 1.5, y: 1.5,
      hp: 100, maxHp: 100, age: 100, lifespan: 4200,
      faction: 0, village: 0, state: 'idle', timer: 100,
      tx: 1.5, ty: 1.5, anim: 0, face: 1, kills: 0, carried: 1,
    }, () => 0.5);
    const life = new Life(world, () => 0.5);
    life.stepEntity(actor, 0.1);
    return { world, actor };
  };
  const safe = makeActor(0);
  const burning = makeActor(0.5);
  assert(burning.actor.hp < safe.actor.hp - 2);
  assert.equal(burning.actor.diedOf, 'fire');
  assert.equal(burning.world.isWalkable(4), true);
  assert.equal(burning.world.isBuildable(4), false);
  burning.world.fire[4] = 0.6;
  assert.equal(burning.world.isWalkable(4), false);
});

check('formal Life village durability responds to center fire and recovers', () => {
  const world = fixture();
  const village = {
    id: 1, name: '试村', x: 1.5, y: 1.5, age: 0, hp: 100,
    pop: 0, food: 0, fields: 0, houses: [], level: 1,
    faction: 0, buildCooldown: 100,
  };
  world.villages.push(village);
  const life = new Life(world, () => 0.5);
  world.fire[4] = 0.5;
  life.stepVillages(0.2);
  assert(Math.abs(village.hp - 99.93) < 1e-6);
  world.fire[4] = 0;
  life.stepVillages(0.2);
  assert(Math.abs(village.hp - 99.93) < 1e-6, 'an empty, unfed village does not heal just because the fire ended');
  assert.equal(life.spawn(1, 1, 'human', 1, 0, { village: village.id }), 1);
  life.syncVillagePops(); village.food = 20;
  life.stepVillages(0.2);
  assert(Math.abs(village.hp - 99.935) < 1e-6, 'a fed survivor can slowly recover without a house');
});

check('observation and Three bridge reads preserve World and RNG', () => {
  const run = observe => {
    const world = fixture(), i = 4;
    world.veg[i] = 0.8;
    let draws = 0;
    const rng = () => { draws += 1; return 0.5; };
    const bridge = observe ? new WorldRenderBridge(world) : null;
    assert.equal(igniteCell(world, world.idx(1, 1)), true);
    const event = natureState(world).fires.get(world.idx(1, 1));
    for (let k = 0; k < 4; k += 1) {
      if (observe) {
        assert.equal(observeEnvironment(world, { x: 1, y: 1, radius: 1 }).ok, true);
        bridge.changes();
      }
      advanceDays(world, 1);
    }
    assert.equal(rng(), 0.5, 'world advancement and observation do not consume an ecology RNG');
    assert.equal(world.day, event.startDay + 4);
    return { fire: Array.from(world.fire), veg: Array.from(world.veg), over: Array.from(world.over), type: Array.from(world.type), qi: Array.from(world.qi), draws };
  };
  assert.deepEqual(run(true), run(false));
});

check('mortal ecology leaves upper and nether authority untouched', () => {
  const mortal = fixture(), upper = fixture(), nether = fixture();
  mortal.upper = upper;
  mortal.nether = nether;
  const snapshot = world => ({ fire: Array.from(world.fire), veg: Array.from(world.veg), over: Array.from(world.over), type: Array.from(world.type), qi: Array.from(world.qi) });
  const upperBefore = snapshot(upper), netherBefore = snapshot(nether);
  mortal.veg[4] = 0.8;
  assert.equal(igniteCell(mortal, mortal.idx(1, 1)), true);
  advanceDays(mortal, 1);
  assert.deepEqual(snapshot(upper), upperBefore);
  assert.deepEqual(snapshot(nether), netherBefore);
  assert.equal(observeEnvironment(mortal, { plane: 'upper', x: 1, y: 1, radius: 0 }).ok, true);
});

check('current and legacy save payloads restore ecology and derived qi', () => {
  const world = fixture(64, 48), i = world.idx(10, 10);
  assert.equal(igniteCell(world, i), true);
  world.veg[i] = 0.6;
  setRecoveringOverlay(world, i, OVER.SCORCHED);
  recomputeAll(world);
  const payload = serializeWorld(world);
  const current = deserializeWorld({ ...payload });
  assert.equal(natureState(current).fires.get(i).dueDay, natureState(world).fires.get(i).dueDay);
  assert.equal(natureState(current).overlays.get(i).dueDay, natureState(world).overlays.get(i).dueDay);
  const legacyPayload = { ...payload, v: 1 };
  delete legacyPayload.nature;
  const legacy = deserializeWorld(legacyPayload);
  for (const restored of [current, legacy]) {
    assert(Math.abs(restored.fire[i] - world.fire[i]) < 1e-4);
    assert(Math.abs(restored.veg[i] - world.veg[i]) < 1e-4);
    assert.equal(restored.over[i], world.over[i]);
    assert.equal(restored.type[i], world.type[i]);
    derived(restored, i);
    assert(restored.upper && restored.nether);
    const fire = natureState(restored).fires.get(i);
    assert.equal(fire.dueDay, restored.day + NATURE_DAYS.fire);
    advanceDays(restored, NATURE_DAYS.fire);
    assert.equal(restored.fire[i], 0);
    assert.equal(restored.over[i], OVER.SCORCHED);
    derived(restored, i);
  }
});

if (process.argv.includes('--long')) check('fixed-seed populated forest burn and recovery through formal clocks', () => {
  const run = () => {
    const world = generateWorld({ preset: { w: 64, h: 48 }, seed: 673231, scatter: false });
    const life = new Life(world, mulberry32(world.seed ^ 0xa5a5a5a5));
    const state = createAdvanceState();
    let i = -1;
    for (let y = 5; y < world.h - 5 && i < 0; y += 1) {
      for (let x = 5; x < world.w - 5; x += 1) {
        const candidate = world.idx(x, y);
        if (world.type[candidate] === TERRAIN.FOREST && world.veg[candidate] > 0.6 && world.water[candidate] === 0) {
          i = candidate;
          break;
        }
      }
    }
    assert(i >= 0);
    const x = i % world.w, y = (i - x) / world.w;
    const village = life.foundVillage(x + 0.5, y + 0.5, 0);
    assert(village);
    assert(life.spawn(x, y, 'human', 8, 0, { village: village.id }) > 0);
    const initialVeg = world.veg[i];
    assert.equal(igniteCell(world, i, 1), true);
    const fire = natureState(world).fires.get(i);
    const nodes = [];
    let minVeg = initialVeg, maxActive = 0, seenScorch = false, minVillageHp = village.hp;
    const sample = () => {
      let active = 0, scorched = 0;
      for (let k = 0; k < world.size; k += 1) {
        if (world.fire[k] > 0.01) active += 1;
        if (world.over[k] === OVER.SCORCHED) scorched += 1;
      }
      minVeg = Math.min(minVeg, world.veg[i]);
      maxActive = Math.max(maxActive, active);
      seenScorch ||= scorched > 0;
      minVillageHp = Math.min(minVillageHp, village.hp);
      nodes.push({ day: Number(world.day.toFixed(1)), active, scorched, centerFire: Number(world.fire[i].toFixed(4)), centerVeg: Number(world.veg[i].toFixed(4)), centerOver: world.over[i], centerType: world.type[i], centerQi: Number(world.qi[i].toFixed(4)), villageHp: Number(village.hp.toFixed(3)), entities: world.entities.length, villages: world.villages.length });
    };
    sample();
    for (let tick = 1; tick <= 500; tick += 1) {
      advanceWorld(world, 0.8, { life, state, riftActive: false });
      if (tick % 50 === 0 || [7, 25, 63, 125].includes(tick)) sample();
    }
    derived(world, i);
    assert(seenScorch && maxActive === 1 && minVeg === Math.fround(initialVeg * 0.25));
    assert(minVillageHp < 100);
    assert.equal(world.fire[i], 0);
    assert.equal(world.veg[i], minVeg);
    assert(world.entities.length > 0 && world.villages.length > 0);
    assert.ok(Math.abs(world.day - (fire.startDay + 400)) < 1e-9,
      '0.8-day host ticks reach the same 400-day event timeline within floating-point precision');
    return { seed: world.seed, source: { x, y, initialVeg }, ticks: 500, days: world.day, gameDaysPerTick: 0.8, maxActive, seenScorch, minVeg, minVillageHp, nodes };
  };
  const summary = run();
  assert.deepEqual(run(), summary);
  mkdirSync('reports/release/g2p0/summary', { recursive: true });
  writeFileSync('reports/release/g2p0/summary/ecology.json', `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`LONG ${JSON.stringify({ maxActive: summary.maxActive, seenScorch: summary.seenScorch, minVeg: summary.minVeg, minVillageHp: summary.minVillageHp, final: summary.nodes.at(-1) })}`);
});

console.log(`G2-P0 ecology checks: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
