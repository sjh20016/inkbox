import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { OVER, classify, qiAt, recomputeAll, decayOverlay } from '../src/inkbox/world/terrain.js';
import { stepVegetation, stepFire, ignite, extinguish } from '../src/inkbox/sim/ecology.js';
import { Life } from '../src/inkbox/sim/life.js';
import { initEntity } from '../src/inkbox/sim/cultivation.js';
import { observeEnvironment } from '../src/inkbox/g2/environmentObservation.js';
import { WorldRenderBridge } from '../src/inkbox/render3d/WorldRenderBridge.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
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

check('low coast vegetation removal touches World', () => {
  const world = fixture(), i = 0;
  world.height[i] = 0;
  world.veg[i] = 0.6;
  recomputeAll(world);
  const before = world.revision;
  assert(stepVegetation(world, 5, () => 0.5) >= 1);
  assert.equal(world.veg[i], 0);
  assert.equal(world.revision, before + 1);
  derived(world, i);
});

check('high elevation lake cannot retain or grow vegetation', () => {
  const world = fixture(), i = 4;
  world.water[i] = 0.03;
  world.veg[i] = 0.6;
  recomputeAll(world);
  assert.equal(world.type[i], TERRAIN.SEA);
  assert(stepVegetation(world, 5, () => 0.5) >= 1);
  assert.equal(world.veg[i], 0);
  derived(world, i);
});

check('rock vegetation decline touches World', () => {
  const world = fixture(), i = 4;
  world.height[i] = 0.68;
  world.veg[i] = 0.6;
  recomputeAll(world);
  assert.equal(world.type[i], TERRAIN.ROCK);
  const before = world.revision;
  assert(stepVegetation(world, 5, () => 0.5) >= 1);
  assert(world.veg[i] < 0.6);
  assert.equal(world.revision, before + 1);
  derived(world, i);
});

check('spent subthreshold fire is cleared from authoritative array', () => {
  const world = fixture(1, 1);
  world.fire[0] = 0.005;
  assert.equal(stepFire(world, 1, () => 0.5), 0);
  assert.equal(world.fire[0], 0);
});

check('newly spread fire survives subthreshold residue cleanup', () => {
  const world = fixture(2, 1);
  world.veg.fill(0.8);
  world.moist.fill(0);
  world.fire[0] = 0.85;
  world.fire[1] = 0.005;
  assert.equal(stepFire(world, 1, () => 0), 1);
  assert(world.fire[1] >= 0.25);
});

check('bulk scorch recovery flushes one derived batch', () => {
  const world = fixture();
  for (const i of [0, 1]) {
    world.over[i] = OVER.SCORCHED;
    world.veg[i] = 0.36;
  }
  recomputeAll(world);
  const before = world.revision;
  assert.equal(stepVegetation(world, 5, () => 0.5), 2);
  assert.equal(world.revision, before + 1);
  for (const i of [0, 1]) {
    assert.equal(world.over[i], OVER.NONE);
    derived(world, i);
  }
});

check('vegetation rate, fire pause, and original scorch threshold remain fixed', () => {
  const world = fixture(1, 1), i = 0;
  world.over[i] = OVER.SCORCHED;
  world.veg[i] = 0.34;
  recomputeAll(world);
  world.fire[i] = 0.06;
  assert.equal(stepVegetation(world, 5, () => 0.5), 0);
  assert.equal(world.veg[i], Math.fround(0.34));
  world.fire[i] = 0;
  const current = world.veg[i];
  const target = (0.7 - 0.12) * 1.6;
  assert.equal(stepVegetation(world, 5, () => 0.5), 1);
  assert(Math.abs(world.veg[i] - Math.fround(current + (target - current) * 0.011)) < 1e-7);
  assert.equal(world.over[i], OVER.SCORCHED);
  stepVegetation(world, 5, () => 0.5);
  assert.equal(world.over[i], OVER.NONE);
  derived(world, i);
});

check('four corners, four edges, and one-cell world burn exactly once per tick', () => {
  for (const [w, h, cells] of [
    [1, 1, [[0, 0]]],
    [3, 3, [[0, 0], [2, 0], [0, 2], [2, 2], [1, 0], [1, 2], [0, 1], [2, 1]]],
  ]) {
    for (const [x, y] of cells) {
      const world = fixture(w, h), i = world.idx(x, y);
      world.veg[i] = 0.8;
      assert.equal(ignite(world, x, y, 0), 1);
      const fuel = world.veg[i];
      assert.equal(stepFire(world, 1, () => 1), 1);
      assert(world.veg[i] < fuel);
      assert.equal(world.over[i], OVER.SCORCHED);
      derived(world, i);
      for (let k = 0; k < 20; k += 1) stepFire(world, 1, () => 1);
      assert.equal(world.fire[i], 0);
      extinguish(world, x, y, 0);
      assert.equal(world.fire[i], 0);
    }
  }
});

check('spread respects wetness, water, and depleted neighbour fuel', () => {
  const run = (moist, water, veg) => {
    const world = fixture(2, 1);
    world.moist.fill(moist);
    world.veg[0] = 0.8;
    world.veg[1] = veg;
    world.water[1] = water;
    recomputeAll(world);
    ignite(world, 0, 0, 0);
    stepFire(world, 5, () => 0.2);
    return world.fire[1];
  };
  assert(run(0, 0, 0.8) > 0);
  assert.equal(run(0.9, 0, 0.8), 0);
  assert.equal(run(0, 0.02, 0.8), 0);
  assert.equal(run(0, 0, 0.1), 0);
});

check('fire and overlay transitions keep type and qi synchronized', () => {
  const world = fixture(1, 1), i = 0;
  world.veg[i] = 0.8;
  ignite(world, 0, 0, 0);
  stepFire(world, 1, () => 1);
  assert.equal(world.over[i], OVER.SCORCHED);
  assert.equal(world.type[i], TERRAIN.SCORCHED);
  derived(world, i);
  extinguish(world, 0, 0, 0);
  world.veg[i] = 0;
  decayOverlay(world, 3600, () => 0);
  assert.equal(world.over[i], OVER.ASH);
  assert.equal(world.type[i], TERRAIN.ASH);
  derived(world, i);
  decayOverlay(world, 3600, () => 0);
  assert.equal(world.over[i], OVER.NONE);
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
  assert(Math.abs(village.hp - 99.942) < 1e-6);
});

check('observation and Three bridge reads preserve World and RNG', () => {
  const run = observe => {
    const world = fixture(), i = 4;
    world.veg[i] = 0.8;
    let draws = 0;
    const rng = () => { draws += 1; return 0.5; };
    const bridge = observe ? new WorldRenderBridge(world) : null;
    ignite(world, 1, 1, 0);
    for (let k = 0; k < 4; k += 1) {
      if (observe) {
        assert.equal(observeEnvironment(world, { x: 1, y: 1, radius: 1 }).ok, true);
        bridge.changes();
      }
      stepFire(world, 1, rng);
      stepVegetation(world, 5, rng);
    }
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
  ignite(mortal, 1, 1, 0);
  stepFire(mortal, 1, () => 0.5);
  stepVegetation(mortal, 5, () => 0.5);
  assert.deepEqual(snapshot(upper), upperBefore);
  assert.deepEqual(snapshot(nether), netherBefore);
  assert.equal(observeEnvironment(mortal, { plane: 'upper', x: 1, y: 1, radius: 0 }).ok, true);
});

check('current and legacy save payloads restore ecology and derived qi', () => {
  const world = fixture(64, 48), i = world.idx(10, 10);
  world.fire[i] = 0.5;
  world.veg[i] = 0.6;
  world.over[i] = OVER.SCORCHED;
  recomputeAll(world);
  const payload = serializeWorld(world);
  for (const version of [payload.v, 1]) {
    const restored = deserializeWorld({ ...payload, v: version });
    assert(Math.abs(restored.fire[i] - world.fire[i]) < 1e-4);
    assert(Math.abs(restored.veg[i] - world.veg[i]) < 1e-4);
    assert.equal(restored.over[i], world.over[i]);
    assert.equal(restored.type[i], world.type[i]);
    derived(restored, i);
    assert(restored.upper && restored.nether);
    stepFire(restored, 1, () => 0.5);
    derived(restored, i);
  }
});

if (process.argv.includes('--long')) check('fixed-seed populated forest burn and recovery through formal clocks', () => {
  const run = () => {
    const world = generateWorld({ preset: { w: 64, h: 48 }, seed: 673231, scatter: false });
    const life = new Life(world, mulberry32(world.seed ^ 0xa5a5a5a5));
    const rng = mulberry32(12345);
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
    ignite(world, x, y, 1);
    const nodes = [];
    let minVeg = initialVeg, maxActive = 0, seenScorch = false, seenAsh = false, minVillageHp = village.hp;
    const sample = () => {
      let active = 0, scorched = 0, ash = 0;
      for (let k = 0; k < world.size; k += 1) {
        if (world.fire[k] > 0.01) active += 1;
        if (world.over[k] === OVER.SCORCHED) scorched += 1;
        if (world.over[k] === OVER.ASH) ash += 1;
      }
      minVeg = Math.min(minVeg, world.veg[i]);
      maxActive = Math.max(maxActive, active);
      seenScorch ||= scorched > 0;
      seenAsh ||= ash > 0;
      minVillageHp = Math.min(minVillageHp, village.hp);
      nodes.push({ day: Number(world.day.toFixed(1)), active, scorched, ash, centerFire: Number(world.fire[i].toFixed(4)), centerVeg: Number(world.veg[i].toFixed(4)), centerOver: world.over[i], centerType: world.type[i], centerQi: Number(world.qi[i].toFixed(4)), villageHp: Number(village.hp.toFixed(3)), entities: world.entities.length, villages: world.villages.length });
    };
    sample();
    for (let tick = 1; tick <= 500; tick += 1) {
      advanceWorld(world, 0.8, { life, rng, state, riftActive: false });
      if (tick % 50 === 0) decayOverlay(world, 902.5, rng);
      if (tick % 50 === 0 || [7, 25, 63, 125].includes(tick)) sample();
    }
    derived(world, i);
    assert(seenScorch && seenAsh && maxActive > 1 && minVeg < initialVeg);
    assert(minVillageHp < 100);
    assert.equal(world.fire[i], 0);
    assert(world.veg[i] > minVeg);
    assert(world.entities.length > 0 && world.villages.length > 0);
    // Deliberately independent clocks: each synthetic host tick is 0.05 real
    // seconds and advances 0.8 game days. Every 50 host ticks gives the same
    // 2.5-second decay input shape as main.js; this is a CPU simulation, not RAF.
    return { seed: world.seed, source: { x, y, initialVeg }, ticks: 500, days: world.day, gameDaysPerTick: 0.8, hostSecondsPerTick: 0.05, hostDecayEveryTicks: 50, hostDecayDt: 902.5, maxActive, seenScorch, seenAsh, minVeg, minVillageHp, nodes };
  };
  const summary = run();
  assert.deepEqual(run(), summary);
  mkdirSync('reports/release/g2p0/summary', { recursive: true });
  writeFileSync('reports/release/g2p0/summary/ecology.json', `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`LONG ${JSON.stringify({ maxActive: summary.maxActive, seenScorch: summary.seenScorch, seenAsh: summary.seenAsh, minVeg: summary.minVeg, minVillageHp: summary.minVillageHp, final: summary.nodes.at(-1) })}`);
});

console.log(`G2-P0 ecology checks: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
