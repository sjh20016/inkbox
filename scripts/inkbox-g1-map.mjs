import assert from 'node:assert/strict';
import { createMapProgress, updateMapProgress, mapProgressSummary, expandMap, canAccess } from '../src/inkbox/world/mapProgress.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { createSandboxWorld, syncMapProgress } from '../src/inkbox/ui/worldCreation.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { TERRAIN_PRESETS } from '../src/inkbox/world/worldGeneration.js';
import { Life, mercyRngFor } from '../src/inkbox/sim/life.js';
import { riftRngFor, netherRiftRngFor, netherItemRngFor, netherPossessRngFor } from '../src/inkbox/sim/rifts.js';
import { mortalHauntRngFor } from '../src/inkbox/sim/wraiths.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
const check = (name, fn) => { fn(); console.log('PASS ' + name); };
const preset = { w: 32, h: 24 };
const save = world => JSON.parse(JSON.stringify(serializeWorld(world)));
const withoutProgress = world => { const data = save(world); delete data.mapProgress; return data; };

check('normal simulation clock opens at exactly 1/3/6 years and handles crossed milestones', () => {
  const world = createSandboxWorld(preset, 0, { progressive: true });
  const deps = { state: createAdvanceState(), riftActive: false };
  assert.equal(advanceWorld(world, 359, deps).mapProgress, false);
  assert.equal(world.mapProgress.stage, 0);
  const first = advanceWorld(world, 1, deps);
  assert.equal(first.mapProgress, true); assert.equal(world.mapProgress.stage, 1);
  advanceWorld(world, 719, deps); assert.equal(world.mapProgress.stage, 1);
  advanceWorld(world, 1, deps); assert.equal(world.mapProgress.stage, 2);
  advanceWorld(world, 1079, deps); assert.equal(world.mapProgress.stage, 2);
  advanceWorld(world, 1, deps); assert.equal(world.mapProgress.stage, 3);
  assert.equal(mapProgressSummary(world).percent, 100);
  assert.equal(advanceWorld(world, 1, deps).mapProgress, false);
  const leap = createSandboxWorld(preset, 0, { progressive: true });
  assert.equal(advanceWorld(leap, 2160, { state: createAdvanceState(), riftActive: false }).mapProgress, true);
  assert.equal(leap.mapProgress.stage, 3);
});
check('manual compatibility, rejected advances and read-only summaries preserve stages', () => {
  const world = createSandboxWorld(preset, 0, { progressive: true });
  expandMap(world); expandMap(world); world.day = 360;
  assert.equal(updateMapProgress(world), false); assert.equal(world.mapProgress.stage, 2);
  const snapshot = save(world), summary = mapProgressSummary(world);
  assert.equal(summary.nextUnlockDay, 2160); assert.equal(summary.daysRemaining, 1800);
  summary.bounds.x0 = -100; assert.deepEqual(save(world), snapshot);
  world.day = 2160;
  assert.equal(advanceWorld(world, 0, { state: createAdvanceState() }), null);
  assert.equal(advanceWorld(world, 1), null);
  assert.equal(world.mapProgress.stage, 2);
  assert.equal(expandMap(world, true), true); world.day = 0;
  assert.equal(updateMapProgress(world), false); assert.equal(expandMap(world), false);
  const throwing = createSandboxWorld(preset, 0, { progressive: true }); throwing.day = 359;
  assert.throws(() => advanceWorld(throwing, 1, { state: createAdvanceState(), life: { step() { throw Error('failed'); } } }));
  assert.equal(throwing.mapProgress.stage, 0);
});
check('new and legacy saves retain version1 stage without additional metadata', () => {
  const progressive = createSandboxWorld(preset, 0, { progressive: true });
  progressive.day = 1080; updateMapProgress(progressive);
  const loaded = deserializeWorld(save(progressive));
  assert.deepEqual(loaded.mapProgress, { version: 1, stage: 2 });
  assert.deepEqual(Object.keys(save(loaded).mapProgress), ['version', 'stage']);
  const stale = save(progressive); stale.mapProgress.stage = 0;
  const restored = deserializeWorld(stale);
  assert.equal(mapProgressSummary(restored).stage, 0);
  assert.equal(advanceWorld(restored, 1, { state: createAdvanceState(), riftActive: false }).mapProgress, true);
  assert.equal(restored.mapProgress.stage, 2);
  const legacy = generateWorld({ preset, seed: 0 }); legacy.day = 2160;
  const old = deserializeWorld(save(legacy));
  advanceWorld(old, 1, { state: createAdvanceState(), riftActive: false });
  assert.equal(old.mapProgress, undefined); assert.equal(canAccess(old, 0, 0), true);
  assert.equal(mapProgressSummary(old).enabled, false);
});
check('full World generation and seed zero match for every terrain preset and v1', () => {
  for (const generationVersion of [1, 2]) for (const terrainPreset of Object.keys(TERRAIN_PRESETS)) {
    const options = { generationVersion, terrainPreset };
    const full = createSandboxWorld(preset, 0, { ...options, progressive: false });
    const growing = createSandboxWorld(preset, 0, { ...options, progressive: true });
    assert.deepEqual(withoutProgress(growing), withoutProgress(full));
    const identity = growing.height, entities = growing.entities, before = withoutProgress(growing);
    growing.day = 2160; updateMapProgress(growing); growing.day = 0;
    assert.deepEqual(withoutProgress(growing), before);
    assert.equal(growing.height, identity); assert.equal(growing.entities, entities); assert.equal(growing.seed, 0);
  }
});
check('three realms and peripheral simulation match across automatic opening without RNG draws', () => {
  const source = generateWorld({ preset: { w: 64, h: 48 }, seed: 42, generationVersion: 2 });
  source.upper = generateUpperWorld({ preset: source, seed: source.seed });
  source.nether = generateNetherWorld({ preset: source, seed: source.seed });
  const bootLife = new Life(source, mulberry32(42));
  advanceWorld(source, 1, { state: createAdvanceState(), life: bootLife, riftActive: false });
  source.day = 359;
  const growing = deserializeWorld(save(source)), full = deserializeWorld(save(source));
  createMapProgress(growing, true);
  function dependencies(world) {
    const counts = {};
    const counted = (key, rng) => { counts[key] = 0; return () => { counts[key]++; return rng(); }; };
    const life = new Life(world, counted('life', mulberry32(42)));
    life.warRng = counted('war', life.warRng);
    const upperLife = new UpperLife(world.upper);
    upperLife.rng = counted('upper', upperLife.rng);
    upperLife.spatialRng = counted('spatial', upperLife.spatialRng);
    return { counts, life, upperLife, state: createAdvanceState(), rng: counted('ecology', mulberry32(91)) };
  }
  const a = dependencies(growing), b = dependencies(full);
  const outside = growing.entities.find(e => !canAccess(growing, e.x, e.y));
  assert.ok(outside, 'fixture must include a living entity beyond the opening');
  const lifeDays = outside.age;
  for (let i = 0; i < 12; i++) { advanceWorld(growing, 1, a); advanceWorld(full, 1, b); }
  assert.equal(growing.mapProgress.stage, 1);
  assert.notEqual(outside.age, lifeDays, 'the locked periphery must keep simulating');
  assert.deepEqual(withoutProgress(growing), withoutProgress(full));
  assert.deepEqual(a.state, b.state); assert.deepEqual(a.counts, b.counts);
  for (const get of [mercyRngFor, riftRngFor, netherRiftRngFor, netherItemRngFor, netherPossessRngFor, mortalHauntRngFor]) {
    assert.deepEqual(Array.from({ length: 8 }, () => get(growing)()), Array.from({ length: 8 }, () => get(full)()), 'hidden RNG continuation matches across automatic opening');
  }
  for (const [left, right] of [[a.life.rng, b.life.rng], [a.life.warRng, b.life.warRng], [a.upperLife.rng, b.upperLife.rng], [a.upperLife.spatialRng, b.upperLife.spatialRng], [a.rng, b.rng]]) {
    assert.deepEqual(Array.from({ length: 8 }, left), Array.from({ length: 8 }, right), 'direct RNG continuation matches');
  }
  const countsBefore = { ...a.counts };
  for (let i = 0; i < 10; i++) { mapProgressSummary(growing); updateMapProgress(growing); }
  assert.deepEqual(a.counts, countsBefore);
});
check('existing progress label shows opening percentage and clock countdown without mutation', () => {
  const world = createSandboxWorld(preset, 0, { progressive: true }); world.day = 359;
  const label = { textContent: '' }, button = {};
  const priorDocument = globalThis.document;
  globalThis.document = { getElementById(id) { return id === 'inkMapProgress' ? label : id === 'inkBtnExpand' ? button : null; } };
  try {
    syncMapProgress({ world });
    assert.match(label.textContent, /40%/); assert.match(label.textContent, /1 日/);
    assert.equal(world.mapProgress.stage, 0); assert.equal(button.disabled, false);
    world.day = 2160; updateMapProgress(world); syncMapProgress({ world });
    assert.match(label.textContent, /100%/); assert.match(label.textContent, /全境已开放/); assert.equal(button.disabled, true);
  } finally { if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument; }
});
console.log('G1-R C4 map growth contracts passed');
