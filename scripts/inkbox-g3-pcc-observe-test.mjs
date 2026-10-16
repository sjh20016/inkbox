import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { WorldRenderBridge } from '../src/inkbox/render3d/WorldRenderBridge.js';
import { PresentationChangeLayer } from '../src/inkbox/render3d/change/PresentationChangeLayer.js';
import { PlaneStage } from '../src/inkbox/render3d/stage/PlaneStage.js';

const ROOT = (process.env.INKBOX_ROOT || pathToFileURL(`${process.cwd()}${path.sep}`).href).replace(/\/?$/, '/');
const moduleAtRoot = relative => new URL(relative, ROOT).href;
const { generateWorld } = await import(moduleAtRoot('src/inkbox/world/worldgen.js'));
const { WORLD_PRESETS, SEA_LEVEL } = await import(moduleAtRoot('src/inkbox/core/config.js'));
const { stepHydrology } = await import(moduleAtRoot('src/inkbox/sim/hydrology.js'));
const { diagonalAD } = await import(moduleAtRoot('src/inkbox/render3d/terrain/topology.js'));
const { serializeWorld } = await import(moduleAtRoot('src/inkbox/io/save.js'));
const { mulberry32 } = await import(moduleAtRoot('src/inkbox/core/noise.js'));
const { applyArchipelagoFixture } = await import(moduleAtRoot('scripts/inkbox-g2-h3-archipelago-world.mjs'));

const SEED = 673231, WARM = +(process.env.WARM || 30), QUICK_STEPS = +(process.env.STEPS || 60);
const OUTPUT = process.env.OUT || 'reports/analysis/g3/a1-1/pcc-observe-test.json';
const hashes = array => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const hashText = value => createHash('sha256').update(value).digest('hex');
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

function makeWorld(w = 16, h = 16) {
  const size = w * h;
  return { w, h, size, seed: 29, revision: 1, generation: { version: 2 },
    height: new Float32Array(size).fill(0.4), water: new Float32Array(size),
    type: new Uint8Array(size), veg: new Float32Array(size).fill(0.5), fire: new Float32Array(size) };
}

function cloneMock(world) {
  return { ...world, height: world.height.slice(), water: world.water.slice(), type: world.type.slice(),
    veg: world.veg.slice(), fire: world.fire.slice() };
}

function refs(before, after) {
  const out = {};
  for (const key of ['height', 'water', 'type', 'veg', 'fire']) {
    const indices = [];
    for (let i = 0; i < before[key].length; i++) if (before[key][i] !== after[key][i]) indices.push(i);
    out[key] = indices;
  }
  return out;
}

function captureStageBuffers(stage) {
  const output = [];
  let objectIndex = 0;
  stage.root.traverse(object => {
    const row = { objectIndex: objectIndex++, type: object.type, name: object.name || '' };
    if (object.geometry) {
      row.attributes = {};
      for (const key of Object.keys(object.geometry.attributes).sort()) row.attributes[key] = hashes(object.geometry.attributes[key].array);
      const index = object.geometry.index;
      if (index) row.index = hashes(index.array);
      const range = object.geometry.drawRange;
      row.drawRange = [range.start, Number.isFinite(range.count) ? range.count : 'Infinity'];
    }
    if (object.instanceMatrix?.array) row.instanceMatrix = hashes(object.instanceMatrix.array);
    if (object.instanceColor?.array) row.instanceColor = hashes(object.instanceColor.array);
    output.push(row);
  });
  return output;
}

function directBridgeAndLifecycleCases() {
  const offWorld = makeWorld(), onWorld = cloneMock(offWorld);
  const offBridge = new WorldRenderBridge(offWorld), onBridge = new WorldRenderBridge(onWorld);
  const layer = new PresentationChangeLayer(onWorld, { waterStepId: 100 });
  const cases = [];
  const event = (label, mutate) => {
    const beforeOff = Object.fromEntries(['height', 'water', 'type', 'veg', 'fire'].map(k => [k, offWorld[k].slice()]));
    const beforeOn = Object.fromEntries(['height', 'water', 'type', 'veg', 'fire'].map(k => [k, onWorld[k].slice()]));
    mutate(offWorld); mutate(onWorld);
    const expected = refs(beforeOff, offWorld), listed = {};
    const off = offBridge.changes();
    let oldSnapshotSeen = true;
    const observed = onBridge.changes(frame => {
      for (const key of Object.keys(expected)) {
        const list = frame.lists[key];
        listed[key] = Array.from(list.indices.subarray(0, list.length));
        assert.deepEqual(listed[key], expected[key], `${label}: exact ${key} indices`);
      }
      for (let i = 0; i < onWorld.size; i++) for (const key of Object.keys(expected)) {
        const snapshot = key === 'fire' ? frame.fireSnapshot : frame.old[key];
        if (beforeOn[key][i] !== onWorld[key][i] && snapshot[i] !== beforeOn[key][i]) oldSnapshotSeen = false;
      }
      layer.observeFrame(frame);
    });
    assert.deepEqual(observed, off, `${label}: original dirty region API`);
    assert.equal(oldSnapshotSeen, true, `${label}: callback sees old values before snapshot commit`);
    for (const key of Object.keys(expected)) assert.equal(layer.stats[`exact${key[0].toUpperCase()}${key.slice(1)}Cells`], expected[key].length);
    for (const key of Object.keys(expected)) assert.deepEqual(key === 'fire' ? onBridge.fireSnapshot : onBridge.snapshots[key], onWorld[key]);
    assert.deepEqual(offWorld.height, onWorld.height);
    assert.deepEqual(offWorld.water, onWorld.water);
    assert.deepEqual(offWorld.type, onWorld.type);
    assert.deepEqual(offWorld.veg, onWorld.veg);
    assert.deepEqual(offWorld.fire, onWorld.fire);
    cases.push({ label, dirty: off, counts: layer.stats });
  };

  event('micro-height-exact-only', world => { world.height[4] += 0.000001; });
  assert.equal(cases.at(-1).counts.exactHeightCells, 1);
  assert.equal(cases.at(-1).counts.terrainGeoCandidateCells, 0);
  event('multi-channel-single-cell-plus-water-wet-crossing', world => {
    world.height[37] += 0.003; world.water[37] = 0.0016; world.type[37] = 3; world.veg[37] = 0.6; world.fire[37] = 0.07;
  });
  assert.equal(cases.at(-1).counts.unionChangedCells, 1);
  assert.equal(cases.at(-1).counts.wetDryCrossings, 1);
  assert.equal(cases.at(-1).counts.typeCrossings, 1);
  event('water-only-depth-band-crossing', world => { world.water[38] = 0.017; });
  assert.equal(cases.at(-1).counts.depthBandCrossings, 1);
  event('type-only', world => { world.type[39] = 5; });
  assert.equal(cases.at(-1).counts.exactHeightCells, 0);
  assert.equal(cases.at(-1).counts.exactTypeCells, 1);
  event('veg-only-untouched-eligibility', world => { world.veg[40] = 0.1; });
  assert.equal(cases.at(-1).counts.exactVegCells, 1);
  event('diagonal-change', world => { world.height[1] = 0.8; });
  assert.ok(cases.at(-1).counts.diagonalFlips >= 1);

  // Repeated RAF events do not age a stale cell; the same authoritative water step is held.
  const forceWorld = makeWorld(12, 12), forceBridge = new WorldRenderBridge(forceWorld);
  const forceLayer = new PresentationChangeLayer(forceWorld, { waterStepId: 100 });
  for (let k = 0; k < 12; k++) {
    forceWorld.height[5] += 0.000001;
    forceLayer.setWaterStepId(100);
    forceBridge.changes(frame => forceLayer.observeFrame(frame));
    assert.equal(forceLayer.stats.forcedSyncCells, 0, 'RAF updates at the same water step must not force sync');
  }
  forceLayer.setWaterStepId(111); forceBridge.changes(frame => forceLayer.observeFrame(frame));
  assert.equal(forceLayer.stats.forcedSyncCells, 0, '11 water steps do not reach T_max');
  forceLayer.setWaterStepId(112); forceBridge.changes(frame => forceLayer.observeFrame(frame));
  assert.ok(forceLayer.stats.forcedSyncCells > 0, '12 water steps force a stale shadow cell');
  const forced = { afterSameStepRaf: 12, beforeTmax: 0, atTmax: forceLayer.stats.forcedSyncCells,
    queue: forceLayer.memoryStats() };

  // Stage-level visibility, setWorld and repeated flag transitions own/dispose their shadows.
  const profile = { terrain: true, water: true, vegetation: false, entities: false, settlements: false, markers: false, selection: false };
  const stageOff = new PlaneStage({ plane: 'mortal', world: makeWorld(), profile });
  const stageOn = new PlaneStage({ plane: 'mortal', world: makeWorld(), profile });
  assert.equal(stageOff.pcc.observe, false);
  assert.equal(stageOff.bridge.changeListMemoryStats().enabled, false);
  stageOn.pcc.observe = true;
  assert.ok(stageOn._pccLayer);
  const initialLayer = stageOn._pccLayer;
  for (let i = 0; i < 4; i++) { stageOn.pcc.observe = false; stageOn.pcc.observe = true; }
  assert.notEqual(stageOn._pccLayer, initialLayer);
  stageOff.world.height[52] += 0.02; stageOn.world.height[52] += 0.02;
  stageOff.world.water[53] = 0.03; stageOn.world.water[53] = 0.03;
  stageOff.update(1 / 60); stageOn.update(1 / 60);
  assert.deepEqual(captureStageBuffers(stageOn), captureStageBuffers(stageOff), 'PCC on/off renderer arrays and draw ranges');
  stageOn.setVisible(false);
  const hiddenSequence = stageOn.pcc.stats.eventSequence;
  stageOn.world.height[80] += 0.03; stageOff.world.height[80] += 0.03;
  stageOn.update(1 / 60); stageOff.update(1 / 60);
  assert.equal(stageOn.pcc.stats.eventSequence, hiddenSequence, 'hidden stage does not classify');
  stageOn.setVisible(true); stageOn.update(1 / 60);
  assert.deepEqual(captureStageBuffers(stageOn), captureStageBuffers(stageOff), 'visibility restore consumes accumulated Bridge dirties');
  const replacement = makeWorld(); stageOn.setWorld(replacement);
  assert.equal(stageOn.pcc.observe, true); assert.equal(stageOn._pccLayer.world, replacement);
  assert.equal(stageOn._pccLayer.eventSequence, 0, 'setWorld creates a fresh shadow sequence');
  stageOn.dispose(); stageOff.dispose();

  return { assertions: 22, cases, forced, stageLifecycle: 'pass' };
}

function runMap(label, archipelago, steps, observe) {
  const world = generateWorld({ preset: WORLD_PRESETS.expanse, seed: SEED, scatter: true,
    generationVersion: 2, terrainPreset: 'standard' });
  if (archipelago) applyArchipelagoFixture(world);
  for (let k = 0; k < WARM; k++) stepHydrology(world, 4, null);
  const bridge = new WorldRenderBridge(world);
  const layer = observe ? new PresentationChangeLayer(world, { waterStepId: WARM - 1 }) : null;
  const rows = [], bridgeTimes = [], classifyTimes = [], combinedTimes = [], stateHashes = [];
  let maxListAllocationBytes = 0;
  const gc = global.gc;
  if (gc) gc();
  const heapStart = process.memoryUsage().heapUsed;
  for (let k = 0; k < steps; k++) {
    const before = Object.fromEntries(['height', 'water', 'type', 'veg', 'fire'].map(key => [key, world[key].slice()]));
    stepHydrology(world, 4, null);
    const refsNow = refs(before, world);
    const t0 = performance.now();
    let dirty;
    if (layer) {
      layer.setWaterStepId(WARM + k);
      dirty = bridge.changes(frame => {
        for (const key of Object.keys(refsNow)) assert.deepEqual(Array.from(frame.lists[key].indices.subarray(0, frame.lists[key].length)), refsNow[key], `${label} step ${k}: independent exact-list oracle ${key}`);
        layer.observeFrame(frame);
      });
    } else dirty = bridge.changes();
    const combined = performance.now() - t0;
    const stateHash = Object.fromEntries(['height', 'water', 'type', 'veg', 'fire'].map(key => [key, hashes(world[key])]));
    stateHashes.push(stateHash);
    const exact = Object.fromEntries(Object.keys(refsNow).map(key => [key, refsNow[key].length]));
    const row = { step: k, exact, dirty, stateHash, stats: layer?.stats || null };
    rows.push(row);
    if (layer) {
      bridgeTimes.push(layer.stats.bridgeScanCpuMs); classifyTimes.push(layer.stats.classificationCpuMs); combinedTimes.push(combined);
      const mem = bridge.changeListMemoryStats(); maxListAllocationBytes = Math.max(maxListAllocationBytes, mem.allocatedBytes);
      assert.equal(layer.stats.exactHeightCells, exact.height);
      assert.equal(layer.stats.exactWaterCells, exact.water);
      assert.equal(layer.stats.exactTypeCells, exact.type);
      assert.equal(layer.stats.exactVegCells, exact.veg);
      assert.equal(layer.stats.exactFireCells, exact.fire);
    } else bridgeTimes.push(combined);
  }
  if (gc) gc();
  const heapEnd = process.memoryUsage().heapUsed;
  const saveHash = hashText(JSON.stringify(serializeWorld(world)));
  const summary = { label, archipelago, steps, warm: WARM, observe, rows, stateHashes, saveHash,
    bridgeMsP50: percentile(bridgeTimes, 0.5), bridgeMsP95: percentile(bridgeTimes, 0.95),
    classificationMsP50: layer ? percentile(classifyTimes, 0.5) : 0,
    classificationMsP95: layer ? percentile(classifyTimes, 0.95) : 0,
    bridgePlusClassificationMsP50: layer ? percentile(combinedTimes, 0.5) : percentile(bridgeTimes, 0.5),
    bridgePlusClassificationMsP95: layer ? percentile(combinedTimes, 0.95) : percentile(bridgeTimes, 0.95),
    retainedHeapDeltaBytesAfterGc: heapEnd - heapStart,
    changeListMemory: bridge.changeListMemoryStats(), pccMemory: layer?.memoryStats() || null,
    classificationMsSamples: classifyTimes, bridgeMsSamples: bridgeTimes };
  layer?.dispose();
  return summary;
}

function compareRuns(base, observed) {
  assert.deepEqual(observed.stateHashes, base.stateHashes, `${observed.label}: paired World state hashes`);
  assert.deepEqual(observed.saveHash, base.saveHash, `${observed.label}: save encoding input equivalence`);
  assert.equal(observed.rows.length, base.rows.length);
  for (let i = 0; i < base.rows.length; i++) {
    assert.deepEqual(observed.rows[i].dirty, base.rows[i].dirty, `${observed.label} step ${i}: dirty-region compatibility`);
    for (const key of ['height', 'water', 'type', 'veg', 'fire']) assert.equal(observed.rows[i].exact[key], base.rows[i].exact[key]);
  }
}

const direct = directBridgeAndLifecycleCases();
const benchmark = [];
let stopForCost = false;
const originalCensusPath = 'reports/analysis/g3/a1-0/original/census_original_A0.json';
const originalCensus = fs.existsSync(originalCensusPath) ? JSON.parse(fs.readFileSync(originalCensusPath, 'utf8')) : null;
for (const [label, archipelago] of [['standard', false], ['archipelago', true]]) {
  const baseline = runMap(label, archipelago, QUICK_STEPS, false);
  const observed = runMap(label, archipelago, QUICK_STEPS, true);
  compareRuns(baseline, observed);
  if (originalCensus) {
    const expected = originalCensus.find(row => row.label === label);
    assert.ok(expected, `A0R original census exists for ${label}`);
    assert.ok(expected.rows.length >= QUICK_STEPS, `A0R original census has ${QUICK_STEPS} rows for ${label}`);
    for (let k = 0; k < QUICK_STEPS; k++) {
      const row = expected.rows[k], actual = observed.rows[k].stats;
      assert.equal(actual.exactHeightCells, row.hc, `${label} step ${k} A0R height count`);
      assert.equal(actual.exactWaterCells, row.wc, `${label} step ${k} A0R water count`);
      assert.equal(actual.exactTypeCells, row.tc, `${label} step ${k} A0R type count`);
      assert.equal(actual.wetDryCrossings, row.wetdry, `${label} step ${k} A0R wet/dry count`);
      assert.equal(actual.a0DepthBandCrossings, row.bandX, `${label} step ${k} A0R depth-band count`);
      assert.equal(actual.diagonalFlips, row.diagFlip, `${label} step ${k} A0R diagonal count`);
      assert.equal(actual.vegetationEligibilityChanges, row.vegElig, `${label} step ${k} A0R eligibility count`);
    }
  }
  benchmark.push({ baseline, observed });
  if (observed.classificationMsP50 > 3) stopForCost = true;
}

let extended = null;
if (!stopForCost && process.env.EXTENDED !== '0') {
  extended = [];
  for (const [label, archipelago] of [['standard', false], ['archipelago', true]]) {
    const baseline = runMap(label, archipelago, 600, false);
    const observed = runMap(label, archipelago, 600, true);
    compareRuns(baseline, observed);
    extended.push({ baseline, observed });
    if (observed.classificationMsP50 > 3) stopForCost = true;
  }
}

const rngA = mulberry32(SEED), rngB = mulberry32(SEED);
const rngProbeA = Array.from({ length: 64 }, () => rngA()), rngProbeB = Array.from({ length: 64 }, () => rngB());
const rngProbeEqual = rngProbeA.every((value, i) => value === rngProbeB[i]);
const output = { meta: { task: 'G3-PERF-A1.0 A1-1', sourceCommit: 'bfabe00e3c0865721e5c426c4915a1f879498714', node: process.version,
  seed: SEED, mapSize: [512, 320], generationVersion: 2, warm: WARM, requestedQuickSteps: QUICK_STEPS,
  thresholdMs: 3, tMaxUnit: 'explicit hydrology step id', rngProbeEqual }, direct, benchmark, extended,
  verdict: stopForCost ? 'A1_1_BLOCKED_COST_STOP' : extended ? 'A1_1_OBSERVE_READY_CANDIDATE' : 'A1_1_QUICK_ONLY' };
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ verdict: output.verdict, directAssertions: direct.assertions,
  quick: benchmark.map(({ observed }) => ({ label: observed.label, p50: observed.classificationMsP50,
    p95: observed.classificationMsP95, bridgeP50: observed.bridgeMsP50, listBytes: observed.changeListMemory.capacityBytes,
    pccBytes: observed.pccMemory.allocatedBytes })),
  extended: extended?.map(({ observed }) => ({ label: observed.label, p50: observed.classificationMsP50, p95: observed.classificationMsP95 })), output: OUTPUT }, null, 2));
