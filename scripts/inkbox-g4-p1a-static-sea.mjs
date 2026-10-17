import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { World } from '../src/inkbox/world/World.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { SEA_LEVEL, WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { recomputeAll } from '../src/inkbox/world/terrain.js';
import { History, addWater, removeWater, sculpt } from '../src/inkbox/sim/powers.js';
import { VARIANTS, enterStaticSea } from './fixtures/g4-p1a/variants-r2.mjs';
import { prepareStaticSea, stepHydrologyStaticSea } from '../src/inkbox/sim/hydrologyStaticSea.js';

const FROZEN_SHA256 = '22aa5b602a7e151235afafa763eeab1221334eb2b4dbe8ffa0990ee82a36e44b';
const BASE = 'e1e55039bb56efda7a307513ede07a9fab3bf534';
const layers = ['height', 'water', 'type', 'qi'];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const bytes = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const results = [];
const protectedFiles = [
  'src/inkbox/main.js', 'src/inkbox/sim/hydrology.js', 'src/inkbox/world/terrain.js',
  'src/inkbox/world/World.js', 'src/inkbox/io/save.js', 'src/inkbox/sim/powers.js',
  'src/inkbox/world/worldgen.js', 'src/inkbox/core/config.js', 'src/inkbox/core/noise.js',
];
function immutable(world) {
  const value = {};
  for (const key of Object.keys(world).sort()) {
    if (key.startsWith('_') || layers.includes(key) || key === 'revision' || key === 'terrainDirty') continue;
    const v = world[key];
    value[key] = ArrayBuffer.isView(v) ? hash(bytes(v)) : v;
  }
  return JSON.stringify(value);
}
function exact(a, b, label) {
  const differences = {};
  for (const key of layers) {
    let count = 0, first = null;
    for (let i = 0; i < a.size; i++) {
      if (!Object.is(a[key][i], b[key][i])) {
        count++;
        first ??= { index: i, expected: a[key][i], actual: b[key][i] };
      }
    }
    differences[key] = { count, first };
  }
  assert.ok(Object.values(differences).every((d) => d.count === 0), `${label}: ${JSON.stringify(differences)}`);
  assert.equal(a.revision, b.revision, `${label}: revision`);
  assert.equal(a.terrainDirty, b.terrainDirty, `${label}: terrainDirty`);
  assert.deepEqual(a._typeDirtyList, b._typeDirtyList, `${label}: dirty list`);
  if (a._typeDirtyFlags) assert.equal(hash(bytes(a._typeDirtyFlags)), hash(bytes(b._typeDirtyFlags)), `${label}: dirty flags`);
  return differences;
}
function valid(world, label) {
  let sea = 0;
  for (let i = 0; i < world.size; i++) {
    for (const key of layers) assert.ok(Number.isFinite(world[key][i]), `${label}: nonfinite ${key}[${i}]`);
    assert.ok(world.water[i] >= 0, `${label}: negative water[${i}]`);
    if (world.height[i] < SEA_LEVEL) {
      sea++;
      assert.ok(Object.is(world.water[i], Math.fround(SEA_LEVEL - world.height[i])), `${label}: sea[${i}]`);
    }
  }
  return sea;
}
function pair(factory) {
  const a = factory(), b = factory();
  assert.notEqual(a, b);
  for (const key of [...layers, 'riverBase']) assert.notEqual(a[key].buffer, b[key].buffer);
  exact(a, b, 'independent initial worlds');
  assert.equal(immutable(a), immutable(b));
  return { a, b, stable: immutable(a), steps: 0, checkpoints: [], events: [] };
}
function checkpoint(p, label) {
  const diff = exact(p.a, p.b, label);
  assert.equal(immutable(p.a), p.stable, `${label}: oracle immutable world state`);
  assert.equal(immutable(p.b), p.stable, `${label}: candidate immutable world state`);
  const sea = valid(p.a, `${label}: oracle`);
  assert.equal(valid(p.b, `${label}: candidate`), sea);
  return { label, differences: diff, seaCells: sea, finite: true, nonnegative: true };
}
function prepare(p) {
  const expected = enterStaticSea(p.a), actual = prepareStaticSea(p.b);
  assert.equal(actual, expected);
  p.checkpoints.push({ ...checkpoint(p, 'prepare'), corrected: actual });
  return actual;
}
function step(p, n, keep = []) {
  for (let k = 0; k < n; k++) {
    const seaBed = p.b.height.slice();
    VARIANTS.V3_staticSeaStrict(p.a);
    const counters = stepHydrologyStaticSea(p.b, 4);
    assert.deepEqual(Object.keys(counters), ['moved', 'eroded']);
    assert.ok(Number.isFinite(counters.moved) && counters.moved >= 0);
    assert.ok(Number.isInteger(counters.eroded) && counters.eroded >= 0);
    for (let i = 0; i < p.b.size; i++) if (seaBed[i] < SEA_LEVEL) assert.ok(Object.is(seaBed[i], p.b.height[i]), `sea bed changed at ${i}`);
    p.steps++;
    const summary = checkpoint(p, `step ${p.steps}`);
    if (keep.includes(p.steps)) p.checkpoints.push(summary);
  }
}
function generated(preset, seed) {
  return () => generateWorld({ preset: WORLD_PRESETS[preset], seed, generationVersion: 2 });
}
// Explicit fixture setup, not player actions: coast, narrow strait, or isolated below-sea basin.
function local(kind = 'coast', w = 15, h = 13) {
  const world = new World(w, h, 4242);
  world.temp.fill(0.55); world.moist.fill(0.5);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = world.idx(x, y);
    const sea = kind === 'coast' ? x < 4 : kind === 'strait' ? x === 7 || x < 2 : x === 7 && y === 6;
    world.height[i] = sea ? SEA_LEVEL - 0.08 : SEA_LEVEL + 0.08 + x * 0.012 + y * 0.002;
    world.water[i] = sea ? 0.01 : x > 5 && y > 3 && y < 9 ? 0.06 : 0;
  }
  // A cell exactly on the representable threshold is land only if the stored height is >= SEA_LEVEL.
  world.height[world.idx(w - 2, h - 2)] = SEA_LEVEL;
  recomputeAll(world);
  return world;
}
function event(p, fn, x, y, radius, amount, field, name) {
  const i = p.a.idx(x, y), before = p.a[field][i];
  for (const world of [p.a, p.b]) {
    const history = new History(); history.begin();
    const count = fn(world, x + 0.5, y + 0.5, radius, amount, history);
    assert.ok(count > 0); assert.equal(history.end(name), true);
    assert.ok(history.stack[0].changes.size > 0);
  }
  exact(p.a, p.b, `event ${name}`);
  const after = p.a[field][i];
  assert.notEqual(after, before, `${name}: event must change center ${field}`);
  p.events.push({ name, field, index: i, before, after, realHistory: true });
}
function record(group, p, detail = {}) {
  results.push({ group, status: 'PASS', steps: p.steps, checkpoints: p.checkpoints, events: p.events, ...detail });
  console.log(`PASS ${group}: ${JSON.stringify(results.at(-1))}`);
}
try {
  assert.equal(hash(readFileSync(new URL('./fixtures/g4-p1a/variants-r2.mjs', import.meta.url))), FROZEN_SHA256);
  for (const file of protectedFiles) {
    const baseline = spawnSync('git', ['show', `${BASE}:${file}`], { encoding: null, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(baseline.status, 0, `${file}: baseline available`);
    // Git checkout may convert line endings; compare normalized source bytes.
    assert.equal(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n'), baseline.stdout.toString('utf8').replaceAll('\r\n', '\n'), `${file}: protected baseline changed`);
  }
  for (const file of ['src/inkbox/main.js', 'src/inkbox/sim/hydrology.js']) {
    assert.ok(!readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').includes('hydrologyStaticSea'), `${file}: candidate connected`);
  }
  const a = pair(generated('expanse', 673231)); prepare(a); step(a, 30, [1, 5, 10, 30]); record('A', a, { preset: 'expanse', seed: 673231, generationVersion: 2 });
  const b = pair(generated('small', 226)); prepare(b); step(b, 60, [1, 10, 30, 60]); record('B', b, { preset: 'small', seed: 226, generationVersion: 2 });
  for (const kind of ['coast', 'strait', 'basin']) {
    const c = pair(() => local(kind)); prepare(c); step(c, 12, [1, 12]);
    if (kind === 'basin') assert.ok(c.b.water[c.b.idx(7, 6)] > 0, 'isolated below-sea basin is sea under R2');
    record(`C/${kind}`, c, { fixture: 'programmatic real World, before simulation' });
  }
  for (const route of ['prepare', 'step']) {
    const d = pair(() => local()); prepare(d);
    const restore = () => route === 'prepare' ? prepare(d) : step(d, 1, [d.steps + 1]);
    event(d, addWater, 2, 6, 1.5, 0.2, 'water', 'sea addWater'); restore();
    event(d, removeWater, 2, 6, 1.5, 0.2, 'water', 'sea removeWater'); restore();
    event(d, sculpt, 2, 6, 1.5, 0.3, 'height', 'sea bed raised above SEA_LEVEL');
    assert.ok(d.b.height[d.b.idx(2, 6)] >= SEA_LEVEL); restore();
    event(d, sculpt, 10, 6, 1.5, -0.5, 'height', 'land lowered below SEA_LEVEL');
    assert.ok(d.b.height[d.b.idx(10, 6)] < SEA_LEVEL); restore();
    record(`D/${route}`, d);
  }
  const e = pair(generated('small', 226)); prepare(e); step(e, 10, [10]);
  const target = e.b.height.findIndex((v, i) => v > SEA_LEVEL + 0.12 && i % e.b.w > 5 && i % e.b.w < e.b.w - 6 && i > 5 * e.b.w && i < e.b.size - 6 * e.b.w);
  assert.ok(target >= 0); const x = target % e.b.w, y = Math.floor(target / e.b.w);
  event(e, addWater, x, y, 4, 0.3, 'water', 'inland injection');
  event(e, sculpt, x + 2, y, 2, 0.08, 'height', 'inland sculpt');
  const injected = e.b.water.slice(); step(e, 10, [11, 15, 20]);
  assert.notEqual(hash(bytes(injected)), hash(bytes(e.b.water)), 'injected water must evolve'); record('E', e);
  const f = pair(() => local()); prepare(f);
  const revision = f.b.revision, dirtyLength = f.b._typeDirtyList?.length ?? 0;
  assert.equal(enterStaticSea(f.a), 0); assert.equal(prepareStaticSea(f.b), 0);
  assert.equal(f.b.revision, revision); assert.equal(f.b._typeDirtyList?.length ?? 0, dirtyLength);
  for (const bad of [undefined, null, NaN, Infinity, -Infinity, 0, -4, 1, 4.01, '4']) {
    const before = hash(bytes(f.b.water)), rev = f.b.revision;
    assert.throws(() => stepHydrologyStaticSea(f.b, bad), { name: 'RangeError', message: /dtDays === 4/ });
    assert.equal(hash(bytes(f.b.water)), before); assert.equal(f.b.revision, rev);
  }
  const f2 = pair(() => local('basin', 19, 17)), repeat = pair(() => local()); prepare(f2); prepare(repeat);
  for (let i = 0; i < 8; i++) { step(f, 1); step(f2, 1); step(repeat, 1); }
  exact(f.b, repeat.b, 'reproducible repeated inputs');
  const scratch = f.b._staticSeaWaterDelta; step(f, 1); assert.equal(f.b._staticSeaWaterDelta, scratch, 'scratch reused');
  // Exercise a changed-size World while retaining old scratch arrays on that same object.
  Object.assign(f.a, local('strait', 21, 19)); Object.assign(f.b, local('strait', 21, 19));
  for (const key of ['_g4wd', '_g4ed', '_g4td', '_typeDirtyFlags', '_typeDirtyList']) delete f.a[key];
  for (const key of ['_typeDirtyFlags', '_typeDirtyList']) delete f.b[key];
  f.stable = immutable(f.a); prepare(f); step(f, 2, [10, 11]);
  assert.equal(f.b._staticSeaWaterDelta.length, f.b.size); assert.notEqual(f.b._staticSeaWaterDelta, scratch);
  record('F', f, { rejectedDtValues: 10, idempotent: true, interleavedWorlds: true, repeatable: true, resizedScratch: true });
  // Independent process never imports the candidate: V0 still runs on baseline-protected modules.
  const v0 = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { generateWorld } from './src/inkbox/world/worldgen.js';
    import { WORLD_PRESETS } from './src/inkbox/core/config.js';
    import { stepHydrology } from './src/inkbox/sim/hydrology.js';
    import { createHash } from 'node:crypto';
    const w = generateWorld({ preset: WORLD_PRESETS.small, seed: 226, generationVersion: 2 });
    for (let i=0;i<5;i++) stepHydrology(w,4);
    const h=createHash('sha256'); for(const k of ['height','water','type','qi','riverBase']) h.update(Buffer.from(w[k].buffer));
    console.log(h.digest('hex'));
  `], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(v0.status, 0, v0.stderr);
  console.log(`PASS V0 reverse check: protected baseline source, independent 5-step digest ${v0.stdout.trim()}`);
  console.log(JSON.stringify({ verdict: 'PASS', groups: ['A', 'B', 'C', 'D', 'E', 'F'], exactTolerance: 0, frozenSHA256: FROZEN_SHA256, ruleStatus: 'RULE_CHANGE_REVIEW_REQUIRED' }));
} catch (error) {
  console.error('FAIL G4-P1A:', error.stack); process.exitCode = 1;
}
