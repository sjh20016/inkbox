import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { stepHydrology } from '../src/inkbox/sim/hydrology.js';
import { WorldRenderBridge } from '../src/inkbox/render3d/WorldRenderBridge.js';
import { PresentationChangeLayer as Candidate } from '../src/inkbox/render3d/change/PresentationChangeLayer.js';
import { PresentationChangeLayer as Reference } from './fixtures/pcc-a11-reference.mjs';
import { applyArchipelagoFixture } from './inkbox-g2-h3-archipelago-world.mjs';
import { serializeWorld } from '../src/inkbox/io/save.js';
import { PlaneStage } from '../src/inkbox/render3d/stage/PlaneStage.js';
import { visualElevation } from '../src/inkbox/render3d/terrain/VisualElevation.js';
import { PCC_THRESHOLDS } from '../src/inkbox/render3d/change/PresentationChangeLayer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_ROOT = path.join(ROOT, 'reports', 'analysis', 'g3', 'a1-1r');
const RAW_ROOT = path.join(ROOT, 'reports', 'local', 'g3-a11r');
const FRAMES = 60, WARM = 8, ROUNDS = 3, SEED = 673231;
const MODES = ['off', 'reference', 'exact', 'rules', 'shadow'];
const PHASES = ['elevation', 'topology', 'shadeDependencies', 'shadeAt', 'tmax', 'other'];
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
};
const sample = values => ({ n: values.length, mean: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
  p50: percentile(values, .5), p95: percentile(values, .95), max: values.length ? Math.max(...values) : null });
const hash = value => createHash('sha256').update(value).digest('hex');
const requireThat = (condition, message) => assert.ok(condition, message);

function makeWorld(size = 'expanse', terrainPreset = 'standard', seed = SEED) {
  const world = generateWorld({ preset: WORLD_PRESETS[size], seed, scatter: true, generationVersion: 2, terrainPreset: 'standard' });
  if (terrainPreset === 'archipelago') applyArchipelagoFixture(world);
  return world;
}
function warmWorld(world, count = 30) {
  for (let i = 0; i < count; i++) stepHydrology(world, 4);
}
function dataHash(world) {
  const h = createHash('sha256');
  for (const k of ['height', 'water', 'type', 'veg', 'fire']) h.update(Buffer.from(world[k].buffer, world[k].byteOffset, world[k].byteLength));
  return h.digest('hex');
}
function sortedUnique(values) { return [...new Set(values)].sort((a, b) => a - b); }
function snapshotLists(frame) {
  const out = {};
  for (const key of ['height', 'water', 'type', 'veg', 'fire']) out[key] = Array.from(frame.lists[key].indices.subarray(0, frame.lists[key].length));
  out.cells = Array.from(frame.lists.cells.subarray(0, frame.lists.cellLength));
  out.masks = Array.from(frame.lists.masks.subarray(0, frame.lists.cellLength));
  return out;
}
function dirtySummary(dirty) { return dirty ? Object.fromEntries(['height', 'water', 'type', 'veg', 'fire'].map(k => [k, dirty[k]])) : null; }
function channelOracle(world, prior) {
  const keys = ['height', 'water', 'type', 'veg', 'fire'], bits = [1, 2, 4, 8, 16];
  const lists = Object.fromEntries(keys.map(k => [k, []])), masksByCell = new Map();
  for (let i = 0; i < world.size; i++) for (let c = 0; c < keys.length; c++) {
    const key = keys[c]; if (prior[key][i] === world[key][i]) continue;
    lists[key].push(i); masksByCell.set(i, (masksByCell.get(i) ?? 0) | bits[c]);
  }
  const cells = [...masksByCell.keys()]; lists.cells = cells; lists.masks = cells.map(i => masksByCell.get(i));
  const dirty = {};
  for (const key of keys) {
    const ids = lists[key];
    if (!ids.length) { dirty[key] = null; continue; }
    let x0 = world.w, y0 = world.h, x1 = -1, y1 = -1;
    for (const i of ids) { const x = i % world.w, y = (i / world.w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    dirty[key] = { x0, y0, x1, y1 };
  }
  return { lists, dirty: Object.values(lists).some(v => Array.isArray(v) && v.length) ? dirty : null };
}
function ownBytes(layer) { return layer?.memoryStats?.().capacityBytes ?? 0; }
function retainedTypedBytes(layer) {
  let n = 0;
  for (const key of ['exactGeo', 'presentedGeo', 'exactWaterGeo', 'presentedWaterGeo', 'exactDepth', 'presentedDepth',
    'depthTexelStamp', 'exactShade', 'presentedShade', 'forceAt', 'forceMask', 'diagonalStamp', 'shadeStamp',
    'forcedStamp', 'forcedShadeStamp', 'shadeCandidates']) n += layer?.[key]?.byteLength ?? 0;
  for (const bucket of layer?.forceBuckets ?? []) n += bucket.items?.byteLength ?? 0;
  return n;
}
function saveHash(world) { return hash(JSON.stringify(serializeWorld(world))); }

// Deterministic field edits are deliberately outside each timed bridge.changes() call.
function mutate(world, frame, kind = 'trace') {
  const n = world.size, center = (Math.floor(world.h / 2) * world.w + Math.floor(world.w / 2));
  const i = frame % 2 ? center + world.w + 2 : center;
  const edge = frame % 4 === 0 ? 0 : frame % 4 === 1 ? world.w - 1 : frame % 4 === 2 ? (world.h - 1) * world.w : n - 1;
  if (kind === 'trace') {
    switch (frame % 6) {
      case 0: world.height[i] += frame % 12 === 0 ? .00008 : .004; break;
      case 1: world.water[i] = world.water[i] > .0015 ? .0007 : .01; break;
      case 2: world.type[i] = (world.type[i] + 1) % 8; break;
      case 3: world.veg[i] = world.veg[i] > .5 ? .1 : .9; break;
      case 4: world.fire[i] = world.fire[i] > .5 ? 0 : .9; break;
      default: world.height[edge] += .025; world.water[edge] += .002;
    }
    if (frame % 10 === 0) world.height[center + 1] += .00015;
  } else {
    const x = Math.max(1, Math.floor(world.w / 2)), y = Math.max(1, Math.floor(world.h / 2)), c = y * world.w + x;
    if (frame === 0) world.height[c] += .005; // micro/geometry
    if (frame === 1) world.height[c + world.w + 1] += .2; // diagonal flip pressure
    if (frame === 2) world.type[c] = (world.type[c] + 1) % 8;
    if (frame === 3) { world.height[c] += .01; world.veg[c] = world.veg[c] > .5 ? .1 : .9; }
    if (frame === 4) { world.water[c] = world.water[c] > .0015 ? .0005 : .02; world.fire[c] = world.fire[c] ? 0 : .8; }
    if (frame === 5) world.water[c] += .00003;
    if (frame === 6) world.height[0] += .03;
    if (frame === 7) world.height[n - 1] += .03;
  }
  world.touch?.();
}

function equalStatsShadow(expected, actual) {
  const ignore = new Set(['mode', 'dependencyIndices', 'dependencyCount', 'bridgeScanCpuMs', 'classificationCpuMs', 'phaseMs', '_shadeChangedIndices']);
  const a = Object.fromEntries(Object.entries(expected).filter(([k]) => !ignore.has(k)));
  const b = Object.fromEntries(Object.entries(actual).filter(([k]) => !ignore.has(k)));
  assert.deepEqual(b, a, 'shadow semantic statistics match frozen reference');
}
function semanticRules(ref, rules, frame = '?') {
  for (const key of ['exactHeightCells', 'exactWaterCells', 'exactTypeCells', 'exactVegCells', 'exactFireCells', 'unionChangedCells',
    'wetDryCrossings', 'depthBandCrossings', 'a0DepthBandCrossings', 'typeCrossings', 'diagonalFlips',
    'vegetationEligibilityChanges', 'treeEligibilityChanges']) assert.equal(rules[key], ref[key], `rules ${key} matches reference`);
  // Rules intentionally reports conservative dependency invalidations. Compare against
  // exact CPU shade changes for current inputs, not delayed T_max presentation updates.
  const actual = rules.dependencyIndices ? new Set(rules.dependencyIndices) : new Set();
  const refChanged = ref._shadeChangedIndices || [];
  for (const i of refChanged) assert.ok(actual.has(i), `rules dependency set contains changed shade cell ${i} at frame ${frame} (count=${actual.size}, first=${[...actual].slice(0, 24).join(',')}, height=${rules.exactHeightCells}, dep=${rules.dependencyCount}, shade=${ref.terrainShadeCandidateCells})`);
}

function captureReferenceShade(layer) {
  if (!layer.exactShade) return [];
  const a = layer.exactShade, prior = layer.__priorExactShade || null, changed = [];
  if (prior) for (let i = 0; i < a.length / 4; i++) {
    const o = i * 4; if (a[o] !== prior[o] || a[o + 1] !== prior[o + 1] || a[o + 2] !== prior[o + 2] || a[o + 3] !== prior[o + 3]) changed.push(i);
  }
  layer.__priorExactShade = a.slice();
  return changed;
}

function runCorrectness() {
  const world = makeWorld('small', 'standard', 90117); warmWorld(world, 3);
  const refBridge = new WorldRenderBridge(world);
  const reference = new Reference(world, { waterStepId: 10 });
  captureReferenceShade(reference); // establish the pre-observation exact CPU shade snapshot
  const modes = ['exact', 'rules', 'shadow'].map(mode => ({ layer: new Candidate(world, { mode, profile: false, waterStepId: 10 }), bridge: new WorldRenderBridge(world) }));
  const profileModes = ['exact', 'rules', 'shadow'].map(mode => ({ layer: new Candidate(world, { mode, profile: true, waterStepId: 10 }), bridge: new WorldRenderBridge(world) }));
  let oraclePrior = Object.fromEntries(['height', 'water', 'type', 'veg', 'fire'].map(k => [k, world[k].slice()]));
  const counts = { frames: 0, oracleChannelFrames: 0, profileParityFrames: 0, scenarios: [], temporalGeometryDifferences: [] };
  for (let frame = 0; frame < 13; frame++) {
    if (frame === 8) { reference.setWaterStepId(11); for (const m of [...modes, ...profileModes]) m.layer.setWaterStepId(11); }
    if (frame === 9) { reference.setWaterStepId(35); for (const m of [...modes, ...profileModes]) m.layer.setWaterStepId(35); }
    mutate(world, frame, 'checks');
    const oracle = channelOracle(world, oraclePrior);
    const worldBeforeObservers = saveHash(world);
    let refLists;
    const refDirty = refBridge.changes(f => { refLists = snapshotLists(f); reference.observeFrame(f); });
    assert.equal(refBridge.observerError, null, 'reference bridge observer completed without error');
    const refStats = structuredClone(reference.stats);
    assert.deepEqual(refLists, oracle.lists, 'frozen reference lists match independent five-channel cell oracle');
    assert.deepEqual(dirtySummary(refDirty), oracle.dirty, 'legacy dirty regions match independent five-channel oracle');
    refStats._shadeChangedIndices = captureReferenceShade(reference);
    const candidateResults = [];
    for (const entry of modes) {
      const layer = entry.layer;
      if (layer.mode === 'rules' && frame === 0) assert.notEqual(entry.bridge.snapshots.height[Math.floor(world.h / 2) * world.w + Math.floor(world.w / 2)], world.height[Math.floor(world.h / 2) * world.w + Math.floor(world.w / 2)], 'rules bridge retains pre-mutation snapshot');
      let lists; const dirty = entry.bridge.changes(f => { lists = snapshotLists(f); layer.observeFrame(f); });
      assert.equal(entry.bridge.observerError, null, `${layer.mode} bridge observer completed without error`);
      const stats = structuredClone(layer.stats);
      if (layer.mode === 'rules' && frame === 0) assert.equal(stats.exactHeightCells, oracle.lists.height.length,
        `rules first frame channel list diverged; bridge old=${entry.bridge.snapshots.height[Math.floor(world.h / 2) * world.w + Math.floor(world.w / 2)]}; current=${world.height[Math.floor(world.h / 2) * world.w + Math.floor(world.w / 2)]}`);
      if (layer.mode === 'exact') {
        assert.deepEqual(lists, oracle.lists, 'exact emits independent five-channel and union lists');
        assert.deepEqual(dirtySummary(dirty), oracle.dirty, 'exact legacy dirty bounds equal independent oracle');
        counts.oracleChannelFrames++;
      } else if (layer.mode === 'shadow') {
        equalStatsShadow(refStats, stats);
        assert.deepEqual(Array.from(layer.exactShade), Array.from(reference.exactShade), 'shadow exact shade array matches reference');
        assert.deepEqual(Array.from(layer.presentedShade), Array.from(reference.presentedShade), 'shadow presented shade array matches reference');
      }
      else semanticRules(refStats, stats, frame);
      candidateResults.push({ mode: layer.mode, lists, dirty, stats, layer });
      assert.equal(saveHash(world), worldBeforeObservers, `${layer.mode} observer leaves serialized World unchanged`);
    }
    const rulesStats = candidateResults.find(x => x.mode === 'rules')?.stats;
    const shadowStats = candidateResults.find(x => x.mode === 'shadow')?.stats;
    if (rulesStats && shadowStats && (rulesStats.terrainGeoCandidateCells !== shadowStats.terrainGeoCandidateCells
      || rulesStats.waterGeoCandidateCells !== shadowStats.waterGeoCandidateCells)) {
      counts.temporalGeometryDifferences.push({ frame, rulesGeo: rulesStats.terrainGeoCandidateCells,
        shadowGeo: shadowStats.terrainGeoCandidateCells, rulesWaterGeo: rulesStats.waterGeoCandidateCells,
        shadowWaterGeo: shadowStats.waterGeoCandidateCells });
    }
    for (const entry of profileModes) {
      const layer = entry.layer; let lists; profileBridgeChanges(entry.bridge, f => { lists = snapshotLists(f); layer.observeFrame(f); });
      assert.equal(entry.bridge.observerError, null, `${layer.mode} profiled bridge observer completed without error`);
      assert.deepEqual(lists, refLists, 'profile on/off channel list parity');
      const same = candidateResults.find(x => x.mode === layer.mode);
      assert.deepEqual(semanticWithoutTiming(layer.stats), semanticWithoutTiming(same.stats), `${layer.mode} profile on/off parity`);
      if (layer.mode === 'shadow') {
        assert.deepEqual(Array.from(layer.exactShade), Array.from(reference.exactShade), 'profiled exact shade array matches reference');
        assert.deepEqual(Array.from(layer.presentedShade), Array.from(reference.presentedShade), 'profiled presented shade array matches reference');
        assert.deepEqual(Array.from(layer.exactShade), Array.from(same.layer.exactShade), 'profile on/off exact shade array parity');
        assert.deepEqual(Array.from(layer.presentedShade), Array.from(same.layer.presentedShade), 'profile on/off presented shade array parity');
      }
      counts.profileParityFrames++;
      assert.equal(saveHash(world), worldBeforeObservers, `${layer.mode} profiled observer leaves serialized World unchanged`);
    }
    counts.frames++; counts.scenarios.push(frame === 1 ? 'diagonal-flip' : frame === 2 ? 'field-only' : frame === 3 ? 'multiple-fields'
      : frame === 6 ? 'edge-a' : frame === 7 ? 'edge-b' : frame === 8 ? 'tmax-same-step' : frame === 9 ? 'tmax-skip' : 'trace');
    oraclePrior = Object.fromEntries(['height', 'water', 'type', 'veg', 'fire'].map(k => [k, world[k].slice()]));
  }
  const checkBridges = [refBridge, ...modes.map(x => x.bridge), ...profileModes.map(x => x.bridge)];
  for (const b of checkBridges) b.releaseChangeLists();
  for (const x of [...modes, ...profileModes]) x.layer.dispose();
  assert.ok(checkBridges.every(b => b.changeListMemoryStats().capacityBytes === 0), 'released bridge list buffers');
  assert.ok([...modes, ...profileModes].every(x => ownBytes(x.layer) === 0), 'disposed PCC buffers are released');
  counts.rulesTmaxBounded = runRulesTmaxChecks();
  return counts;
}

function runRulesTmaxChecks() {
  const w = 12, h = 12, size = w * h;
  const world = { w, h, size, seed: 77, generation: { version: 2 }, revision: 0,
    height: new Float32Array(size).fill(.62), water: new Float32Array(size).fill(.035),
    type: new Uint8Array(size), veg: new Float32Array(size).fill(.4), fire: new Float32Array(size), touch() { this.revision++; } };
  const bridge = new WorldRenderBridge(world), layer = new Candidate(world, { mode: 'rules', waterStepId: 0 });
  const heightCell = 5 * w + 5, waterCell = heightCell + 1, firstUnsynced = new Map();
  const currentStep = [0];
  const observe = () => {
    bridge.changes(frame => layer.observeFrame(frame));
    assert.ok(bridge.observerError == null, 'rules Tmax harness observer succeeds');
    for (let i = 0; i < size; i++) {
      const expectedGeo = Math.fround(visualElevation(world.height[i]));
      const expectedWaterGeo = Math.fround(Math.fround(visualElevation(world.height[i] + world.water[i])) + .04);
      assert.equal(layer.exactGeo[i], expectedGeo, `exactGeo oracle cell ${i} at step ${currentStep[0]}`);
      assert.equal(layer.exactWaterGeo[i], expectedWaterGeo, `exactWaterGeo oracle cell ${i} at step ${currentStep[0]}`);
      for (const [key, exact, presented] of [['height', layer.exactGeo[i], layer.presentedGeo[i]],
        ['water', layer.exactWaterGeo[i], layer.presentedWaterGeo[i]]]) {
        const mark = `${key}:${i}`;
        if (exact === presented) { firstUnsynced.delete(mark); continue; }
        if (!firstUnsynced.has(mark)) firstUnsynced.set(mark, currentStep[0]);
        assert.ok(currentStep[0] - firstUnsynced.get(mark) <= PCC_THRESHOLDS.tMaxWaterSteps,
          `${key} cell ${i} remains unsynced beyond T_max`);
      }
    }
  };
  const setStep = step => { currentStep[0] = step; layer.setWaterStepId(step); };
  const mutateMicro = () => { world.height[heightCell] += .00001; world.water[waterCell] += .00001; world.touch(); };
  for (let f = 0; f < 4; f++) { mutateMicro(); observe(); assert.equal(layer.stats.forcedSyncCells, 0, 'same-step RAF does not age T_max queue'); }
  for (let step = 1; step <= PCC_THRESHOLDS.tMaxWaterSteps; step++) { setStep(step); observe(); }
  assert.equal(layer.presentedGeo[heightCell], layer.exactGeo[heightCell], 'height channel syncs by T_max on normal steps');
  assert.equal(layer.presentedWaterGeo[waterCell], layer.exactWaterGeo[waterCell], 'water channel syncs by T_max on normal steps');

  mutateMicro(); observe(); setStep(24); observe();
  assert.equal(layer.presentedGeo[heightCell], layer.exactGeo[heightCell], 'height channel syncs on skipped water-step advance');
  assert.equal(layer.presentedWaterGeo[waterCell], layer.exactWaterGeo[waterCell], 'water channel syncs on skipped water-step advance');

  world.height[heightCell] += .02; world.water[waterCell] += .02; world.touch(); observe();
  assert.equal(layer.presentedGeo[heightCell], layer.exactGeo[heightCell], 'height above EPS synchronizes immediately');
  assert.equal(layer.presentedWaterGeo[waterCell], layer.exactWaterGeo[waterCell], 'water geometry above EPS synchronizes immediately');
  layer.dispose(); bridge.releaseChangeLists();
  assert.equal(retainedTypedBytes(layer), 0, 'T_max rules fixture disposes PCC buffers');
  assert.equal(bridge.changeListMemoryStats().capacityBytes, 0, 'T_max rules fixture releases bridge buffers');
  return { waterStepFrames: 12, sameStepRafFrames: 4, normalAdvanceSyncBy: PCC_THRESHOLDS.tMaxWaterSteps,
    skippedAdvanceSync: true, epsImmediateSync: true, exactGeoAndWaterGeoOracle: true };
}
function profileBridgeChanges(bridge, observer) { return bridge.changes(observer); }
function semanticWithoutTiming(s) {
  return Object.fromEntries(Object.entries(s).filter(([k]) => !['bridgeScanCpuMs', 'classificationCpuMs', 'phaseMs'].includes(k)));
}

function stageBufferHashes(stage) {
  const rows = [];
  stage.root.traverse(object => {
    const row = { type: object.type, name: object.name || '' };
    if (object.geometry) {
      row.attributes = Object.fromEntries(Object.entries(object.geometry.attributes).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, attribute]) => [key, hash(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength))]));
      if (object.geometry.index) row.index = hash(Buffer.from(object.geometry.index.array.buffer,
        object.geometry.index.array.byteOffset, object.geometry.index.array.byteLength));
      const range = object.geometry.drawRange; row.drawRange = [range.start, Number.isFinite(range.count) ? range.count : 'Infinity'];
    }
    if (object.instanceMatrix?.array) row.instanceMatrix = hash(Buffer.from(object.instanceMatrix.array.buffer));
    if (object.instanceColor?.array) row.instanceColor = hash(Buffer.from(object.instanceColor.array.buffer));
    rows.push(row);
  });
  return rows;
}

function runStageLifecycleChecks() {
  const profile = { terrain: true, water: true, vegetation: false, entities: false, settlements: false, markers: false, selection: false };
  const onWorld = makeWorld('small', 'standard', 481), offWorld = makeWorld('small', 'standard', 481);
  const on = new PlaneStage({ plane: 'mortal', world: onWorld, profile }), off = new PlaneStage({ plane: 'mortal', world: offWorld, profile });
  on.pcc.observe = true; on.pcc.profile = true;
  const oldBridge = on.bridge;
  for (const mode of ['rules', 'exact', 'shadow', 'rules']) {
    const previous = on._pccLayer; on.pcc.mode = mode;
    assert.equal(previous?.memoryStats?.().capacityBytes ?? 0, 0, `old stage layer freed on ${mode} transition`);
    assert.equal(on._pccLayer.mode, mode, `stage selected ${mode} mode`);
  }
  const failedLayer = on._pccLayer;
  failedLayer.observeFrame = () => { throw new Error('stage-observer-fixture'); };
  onWorld.height[120] += .018; offWorld.height[120] += .018;
  onWorld.water[130] += .012; offWorld.water[130] += .012;
  on.update(1 / 60); off.update(1 / 60);
  assert.match(on.pcc.error?.message || '', /stage-observer-fixture/, 'stage exposes observer error');
  assert.equal(on.pcc.failureCount, 1, 'stage increments observer failure count');
  assert.equal(on.pcc.stats, null, 'failed stage observer drops invalid stats');
  assert.equal(on.bridge.observerError?.message, 'stage-observer-fixture', 'bridge retains stage observer exception');
  assert.equal(failedLayer.memoryStats().capacityBytes, 0, 'failed classifier drops its typed buffers');
  assert.deepEqual(stageBufferHashes(on), stageBufferHashes(off), 'failed observer frame still applies legacy terrain and water dirties');
  on.update(1 / 60); off.update(1 / 60);
  assert.ok(on.pcc.stats, 'stage observer is recreated and recovers next frame');
  assert.equal(on.pcc.error, null, 'recovered stage clears observer error');
  assert.deepEqual(stageBufferHashes(on), stageBufferHashes(off), 'recovered stage outputs match PCC-off renderer buffers');

  on.setVisible(false); const hiddenSequence = on.pcc.stats.eventSequence;
  onWorld.height[140] += .021; offWorld.height[140] += .021;
  on.update(1 / 60); off.update(1 / 60);
  assert.equal(on.pcc.stats.eventSequence, hiddenSequence, 'hidden stage does not classify');
  on.setVisible(true); on.update(1 / 60); off.update(1 / 60);
  assert.deepEqual(stageBufferHashes(on), stageBufferHashes(off), 'visible restore consumes accumulated bridge dirties');

  const replacement = makeWorld('small', 'standard', 482), offReplacement = makeWorld('small', 'standard', 482);
  on.setWorld(replacement); off.setWorld(offReplacement);
  assert.equal(oldBridge.changeListMemoryStats().capacityBytes, 0, 'setWorld releases previous bridge buffers');
  assert.equal(on._pccLayer.world, replacement, 'replacement World receives fresh classifier');
  on.update(1 / 60); off.update(1 / 60);
  assert.deepEqual(stageBufferHashes(on), stageBufferHashes(off), 'replacement World renderer buffers match with PCC off');
  on.pcc.observe = false;
  assert.equal(on._pccLayer, null, 'disabling stage observation disposes its classifier');
  assert.equal(on.bridge.changeListMemoryStats().capacityBytes, 0, 'disabling stage observation releases bridge buffers');
  on.pcc.observe = true;
  assert.ok(on._pccLayer, 'stage observation can be re-enabled');
  const currentBridge = on.bridge;
  on.dispose(); off.dispose();
  assert.equal(currentBridge.changeListMemoryStats().capacityBytes, 0, 'dispose releases current bridge buffers');
  assert.equal(on._pccLayer, null, 'dispose releases stage classifier');
  return { failureVisible: true, failureFrameDirtyConsumed: true, recovery: true, modeTransitions: 4,
    hiddenRestore: true, setWorldOldBridgeCapacity: 0, disposeCapacity: 0 };
}

function runLifecycleChecks() {
  const world = makeWorld('small', 'standard', 774); const bridge = new WorldRenderBridge(world);
  const layer = new Candidate(world, { mode: 'shadow', waterStepId: 1 });
  const before = world.height[10]; world.height[10] = before + .02;
  bridge.changes(frame => { throw new Error('observer-fixture'); });
  assert.match(bridge.observerError?.message || '', /observer-fixture/, 'observer failure is retained and visible');
  let cleanFrameCounts = null;
  bridge.changes(frame => { cleanFrameCounts = frame.counts.height; layer.observeFrame(frame); });
  assert.equal(cleanFrameCounts, 0, 'finally commits observer snapshots after the callback throws');
  world.height[10] = before;
  let called = 0; bridge.changes(frame => { called++; layer.observeFrame(frame); });
  assert.equal(called, 1, 'observer recovers after a thrown observer');
  const sequenceBeforeDisable = layer.eventSequence; layer.observe = false; world.water[11] += .01;
  bridge.changes(frame => layer.observeFrame(frame));
  assert.equal(layer.eventSequence, sequenceBeforeDisable, 'disabled observer does not accumulate events');
  layer.dispose(); bridge.releaseChangeLists();
  assert.equal(ownBytes(layer), 0, 'PCC disposal owns no typed capacity');
  assert.equal(bridge.changeListMemoryStats().capacityBytes, 0, 'bridge release leaves zero retained change-list capacity');

  const w2 = makeWorld('small', 'standard', 775), b2 = new WorldRenderBridge(w2), l2 = new Candidate(w2, { mode: 'rules' });
  w2.height[20] += .01; b2.changes(f => l2.observeFrame(f));
  const replacement = makeWorld('small', 'standard', 776); l2.reset(replacement, 'setWorld'); b2.releaseChangeLists();
  l2.dispose(); assert.equal(ownBytes(l2), 0, 'setWorld then dispose releases all PCC arrays');
  return { bridge: { observerErrorsVisible: true, finallyCommitRecovered: true, disabledNoEvents: true, setWorldDisposeCapacity: 0 },
    stage: runStageLifecycleChecks() };
}

function childRun({ scene, mode, profile, round, measuredFrames = FRAMES }) {
  if (global.gc) global.gc();
  const beforeInit = process.memoryUsage();
  // JIT activity is isolated on a throwaway world, then the measured realm starts
  // from the same formal WARM30 state as the original PCC observation fixture.
  {
    const jitWorld = makeWorld('expanse', scene, SEED); warmWorld(jitWorld, 30);
    const jitBridge = new WorldRenderBridge(jitWorld);
    const jitLayer = mode === 'off' ? null : mode === 'reference'
      ? new Reference(jitWorld, { waterStepId: 29 }) : new Candidate(jitWorld, { mode, profile, waterStepId: 29 });
    for (let f = 0; f < WARM; f++) {
      stepHydrology(jitWorld, 4, null);
      if (jitLayer) jitLayer.setWaterStepId?.(30 + f);
      jitBridge.changes(mode === 'off' ? null : frame => jitLayer.observeFrame(frame));
      assert.ok(jitBridge.observerError == null, `${mode} throwaway observer prewarm frame ${f}`);
    }
    jitLayer?.dispose?.(); jitBridge.releaseChangeLists();
  }
  if (global.gc) global.gc();
  const world = makeWorld('expanse', scene, SEED); warmWorld(world, 30);
  const afterInit = process.memoryUsage();
  const bridge = new WorldRenderBridge(world);
  const layerInitStart = performance.now();
  const layer = mode === 'off' ? null : mode === 'reference'
    ? new Reference(world, { waterStepId: 29 }) : new Candidate(world, { mode, profile, waterStepId: 29 });
  const layerInitMs = performance.now() - layerInitStart;
  const afterLayer = process.memoryUsage();
  if (global.gc) global.gc();
  const observerBaseline = process.memoryUsage();
  const measurements = { bridgeScanMs: [], classificationMs: [], combinedMs: [], phaseMs: Object.fromEntries(PHASES.map(k => [k, []])) };
  const retainedRows = [];
  const stateHashes = [];
  for (let f = 0; f < measuredFrames; f++) {
    stepHydrology(world, 4, null);
    if (layer) layer.setWaterStepId(30 + f);
    const t = performance.now();
    let frameStats;
    const dirty = bridge.changes(mode === 'off' ? null : frame => {
      if (layer instanceof Candidate) layer.observeFrame(frame); else layer.observeFrame(frame);
      frameStats = layer.stats;
    });
    const elapsed = performance.now() - t;
    assert.ok(bridge.observerError == null, `${mode} benchmark observer completed without error at frame ${f}`);
    // State and save fingerprints intentionally stay outside the measured bridge
    // call. No World snapshots or serialized payloads are retained in reports.
    stateHashes.push(Object.fromEntries(['height', 'water', 'type', 'veg', 'fire'].map(k => [k,
      hash(Buffer.from(world[k].buffer, world[k].byteOffset, world[k].byteLength))])));
    const stats = frameStats;
    const presentationHashes = layer && (mode === 'reference' || mode === 'shadow') ? Object.fromEntries(
      ['exactGeo', 'presentedGeo', 'exactWaterGeo', 'presentedWaterGeo', 'exactDepth', 'presentedDepth', 'exactShade', 'presentedShade']
        .map(key => [key, layer[key] ? hash(Buffer.from(layer[key].buffer, layer[key].byteOffset, layer[key].byteLength)) : null])) : null;
    if (mode !== 'off') {
      measurements.bridgeScanMs.push(stats.bridgeScanCpuMs);
      measurements.classificationMs.push(stats.classificationCpuMs);
      measurements.combinedMs.push(elapsed);
      for (const key of PHASES) measurements.phaseMs[key].push(stats.phaseMs?.[key] ?? 0);
      retainedRows.push({ dirty: dirtySummary(dirty), unionChangedCells: stats.unionChangedCells, geo: stats.terrainGeoCandidateCells,
        waterGeo: stats.waterGeoCandidateCells, shade: stats.terrainShadeCandidateCells, dependencies: stats.dependencyCount,
        staticEvents: { wetDry: stats.wetDryCrossings, depthBands: stats.depthBandCrossings, a0DepthBands: stats.a0DepthBandCrossings,
          typeCrossings: stats.typeCrossings, topology: stats.diagonalFlips, vegetationEligibility: stats.vegetationEligibilityChanges,
          treeEligibility: stats.treeEligibilityChanges },
        crossings: stats.wetDryCrossings, depthBands: stats.depthBandCrossings, topology: stats.diagonalFlips, forced: stats.forcedSyncCells,
        presentationHashes });
    } else { measurements.combinedMs.push(elapsed); retainedRows.push({ dirty: dirtySummary(dirty), presentationHashes: null }); }
  }
  if (global.gc) global.gc();
  const afterFrames = process.memoryUsage();
  const pccMemory = layer?.memoryStats?.() ?? { allocatedBytes: 0, capacityBytes: 0 };
  const bridgeMemory = bridge.changeListMemoryStats();
  const finalSaveHash = saveHash(world);
  layer?.dispose?.();
  bridge.releaseChangeLists();
  if (global.gc) global.gc();
  const afterDispose = process.memoryUsage();
  assert.equal(retainedTypedBytes(layer), 0, 'classifier dispose retained typed capacity');
  assert.equal(bridge.changeListMemoryStats().capacityBytes, 0, 'bridge release retained typed capacity');
  process.stdout.write(JSON.stringify({ schema: 'inkbox.g3.pcc-cost.child.v1', scene, mode, profile, round,
    frames: measuredFrames, worldWarmHydrologySteps: 30, jitWarmWorldSteps: WARM, timings: { bridgeScan: sample(measurements.bridgeScanMs), classification: sample(measurements.classificationMs),
      combined: sample(measurements.combinedMs), phase: Object.fromEntries(PHASES.map(k => [k, sample(measurements.phaseMs[k])])) },
    memory: { beforeInit, afterInit, afterLayer, observerBaseline, afterFramesAfterGc: afterFrames, afterDispose,
      pcc: pccMemory, bridge: bridgeMemory, pccRetainedAfterDisposeBytes: retainedTypedBytes(layer),
      bridgeRetainedAfterDisposeBytes: bridge.changeListMemoryStats().capacityBytes },
    allocation: { pccBytes: pccMemory.allocatedBytes, bridgeBytes: bridgeMemory.allocatedBytes },
    initializationMs: { layerConstructor: layerInitMs }, perStepFieldHashes: stateHashes, finalSaveHash, trace: retainedRows, gcAvailable: !!global.gc }) + '\n');
}

function runBenchmark() {
  const order = [];
  for (let r = 0; r < ROUNDS; r++) {
    const rotated = [...MODES.slice(r % MODES.length), ...MODES.slice(0, r % MODES.length)];
    for (const mode of rotated) order.push({ round: r, mode });
  }
  const runs = [];
  for (const scene of ['standard', 'archipelago']) {
    for (const { round, mode } of order) {
      const result = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), '--child', `--scene=${scene}`, `--mode=${mode}`, `--round=${round}`],
        { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      if (result.status !== 0) throw new Error(`Child failed ${scene}/${mode}/round${round}: ${result.stderr || result.stdout}`);
      const child = JSON.parse(result.stdout);
      assert.equal(child.round, round, 'child round uses numeric identity');
      fs.mkdirSync(RAW_ROOT, { recursive: true });
      fs.writeFileSync(path.join(RAW_ROOT, `${scene}-${mode}-round${round}.json`), JSON.stringify(child, null, 2));
      process.stderr.write(`Completed ${scene}/${mode}/round${round}\n`);
      runs.push(child);
    }
  }
  const equivalence = [];
  for (const scene of ['standard', 'archipelago']) for (let round = 0; round < ROUNDS; round++) {
    const base = runs.find(r => r.scene === scene && r.round === round && r.mode === 'off');
    assert.ok(base, `missing off baseline ${scene}/${round}`);
    for (const mode of MODES.filter(x => x !== 'off')) {
      const current = runs.find(r => r.scene === scene && r.round === round && r.mode === mode);
      assert.ok(current, `missing mode ${scene}/${round}/${mode}`);
      assert.deepEqual(current.perStepFieldHashes, base.perStepFieldHashes, `${scene}/${round}/${mode} per-step five-field hashes match off`);
      assert.equal(current.finalSaveHash, base.finalSaveHash, `${scene}/${round}/${mode} final serializeWorld hash matches off`);
      assert.deepEqual(current.trace.map(x => x.dirty), base.trace.map(x => x.dirty), `${scene}/${round}/${mode} legacy dirty results match off`);
      if (mode === 'reference' || mode === 'shadow') {
        assert.deepEqual(current.trace.map(x => x.presentationHashes), baseClassifierHashes(runs, scene, round, 'shadow'),
          `${scene}/${round}/${mode} shadow presentation fields follow current shadow`);
        assert.deepEqual(current.trace.map(x => [x.geo, x.waterGeo, x.shade, x.staticEvents, x.forced]),
          baseClassifierTrace(runs, scene, round, 'shadow'), `${scene}/${round}/${mode} classifier count trace matches shadow`);
      } else if (mode === 'rules') {
        const shadow = runs.find(r => r.scene === scene && r.round === round && r.mode === 'shadow');
        assert.ok(shadow, `missing shadow trace ${scene}/${round}`);
        assert.deepEqual(current.trace.map(x => x.staticEvents), shadow.trace.map(x => x.staticEvents),
          `${scene}/${round}/rules static threshold/topology/eligibility events match shadow`);
        current.temporalGeometryDifferences = [];
        for (let frame = 0; frame < current.trace.length; frame++) {
          const r = current.trace[frame], s = shadow.trace[frame];
          if (r.geo !== s.geo || r.waterGeo !== s.waterGeo) current.temporalGeometryDifferences.push({ frame,
            rulesGeo: r.geo, shadowGeo: s.geo, rulesWaterGeo: r.waterGeo, shadowWaterGeo: s.waterGeo });
        }
      }
    }
    const rules = runs.find(r => r.scene === scene && r.round === round && r.mode === 'rules');
    equivalence.push({ scene, round, modesCompared: [...MODES], perStepFiveChannelHashes: 'equal', finalSaveHash: base.finalSaveHash,
      legacyDirty: 'equal', rulesGeometryTiming: { differingFrames: rules.temporalGeometryDifferences.length,
        samples: rules.temporalGeometryDifferences.slice(0, 12),
        reason: 'Omitting the shadow shade queue changes shared geometry/water force deadlines; this records candidate timing differences without claiming per-frame geometry-count equivalence.' } });
  }
  const profiles = [];
  for (const scene of ['standard', 'archipelago']) for (const mode of ['exact', 'rules', 'shadow']) {
    const result = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), '--child', `--scene=${scene}`, `--mode=${mode}`, '--profile', '--round=profile'],
      { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Profile child failed ${scene}/${mode}: ${result.stderr || result.stdout}`);
    const child = JSON.parse(result.stdout);
    fs.writeFileSync(path.join(RAW_ROOT, `${scene}-${mode}-profile.json`), JSON.stringify(child, null, 2));
    process.stderr.write(`Completed ${scene}/${mode}/profile\n`);
    profiles.push(child);
  }
  const report = { schema: 'inkbox.g3.pcc-cost.v1', generatedAt: new Date().toISOString(), source: sourceInfo(),
    host: hostInfo(), method: { scenes: ['standard', 'archipelago'], dimensions: [512, 320], seed: SEED, worldWarmHydrologySteps: 30,
      hydrologyStepDays: 4, measuredFrames: FRAMES, warmFrames: WARM, rounds: ROUNDS, order, profileRuns: 'independent profile-on runs; paired with profile-off modes',
      timedScope: 'Only bridge.changes(callback) wall interval; no assertions, array copies, hashing or output serialization inside timing',
      modeMeaning: { off: 'Bridge legacy scan; no observer/change-list classification', reference: 'Frozen original classifier correctness/performance reference', exact: 'Exact five-channel lists only', rules: 'Lightweight rule classification plus conservative shade dependency invalidations', shadow: 'Complete shadow shade classification' } },
    equivalence, runs, profileOverhead: profiles.map(p => ({ scene: p.scene, mode: p.mode,
      profileOffMedian: percentile(runs.filter(r => r.scene === p.scene && r.mode === p.mode).map(r => r.timings.combined.p50), .5),
      profileOn: p.timings })), profiles };
  fs.mkdirSync(RAW_ROOT, { recursive: true }); fs.mkdirSync(REPORT_ROOT, { recursive: true });
  const rawPath = path.join(RAW_ROOT, `pcc-cost-results-${Date.now()}.json`), rawText = JSON.stringify(report, null, 2);
  fs.writeFileSync(rawPath, rawText);
  const compactRun = run => {
    const out = { ...run, perStepFieldHashesSha256: hash(JSON.stringify(run.perStepFieldHashes)),
      traceSha256: hash(JSON.stringify(run.trace)) };
    delete out.perStepFieldHashes; delete out.trace;
    return out;
  };
  const summary = { schema: 'inkbox.g3.pcc-cost.summary.v1', generatedAt: report.generatedAt, source: report.source,
    host: report.host, method: report.method, equivalence: report.equivalence, profileOverhead: report.profileOverhead,
    rawEvidence: { path: path.relative(ROOT, rawPath).replaceAll('\\', '/'), sha256: hash(rawText),
      benchmarkRunCount: runs.length, profileRunCount: profiles.length },
    runs: runs.map(compactRun), profiles: profiles.map(compactRun) };
  const summaryPath = path.join(REPORT_ROOT, 'pcc-cost-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ report: summaryPath, rawReport: rawPath, runs: runs.length, profiles: profiles.length }));
}

function sourceInfo() {
  let gitSha = null; try { gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim(); } catch {}
  let workingTreeDirty = null; try { workingTreeDirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim(); } catch {}
  const files = ['scripts/inkbox-g3-pcc-cost.mjs', 'src/inkbox/render3d/WorldRenderBridge.js',
    'src/inkbox/render3d/change/PresentationChangeLayer.js', 'src/inkbox/render3d/stage/PlaneStage.js',
    'scripts/fixtures/pcc-a11-reference.mjs'];
  return { gitSha, workingTreeDirty, sha256: Object.fromEntries(files.map(f => [f, fs.existsSync(path.join(ROOT, f)) ? hash(fs.readFileSync(path.join(ROOT, f))) : null])) };
}
function hostInfo() { return { platform: process.platform, arch: process.arch, osRelease: os.release(), node: process.version,
  cpu: os.cpus()[0]?.model ?? null, logicalCpuCount: os.cpus().length, totalMemoryBytes: os.totalmem() }; }
function baseClassifierTrace(runs, scene, round, mode) {
  const run = runs.find(r => r.scene === scene && r.round === round && r.mode === mode);
  assert.ok(run, `missing classifier trace ${scene}/${round}/${mode}`);
  return run.trace.map(x => [x.geo, x.waterGeo, x.shade, x.staticEvents, x.forced]);
}
function baseClassifierHashes(runs, scene, round, mode) {
  const run = runs.find(r => r.scene === scene && r.round === round && r.mode === mode);
  assert.ok(run, `missing classifier presentation ${scene}/${round}/${mode}`);
  return run.trace.map(x => x.presentationHashes);
}

function main() {
  if (process.argv.includes('--child')) {
    const value = name => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3);
    childRun({ scene: value('scene') || 'standard', mode: value('mode') || 'shadow', profile: process.argv.includes('--profile'),
      round: value('round') === 'profile' ? 'profile' : Number(value('round') ?? 0), measuredFrames: Number(value('frames') || FRAMES) }); return;
  }
  if (process.argv.includes('--checks-only')) {
    const report = { schema: 'inkbox.g3.pcc-cost.checks.v1', source: sourceInfo(), checks: runCorrectness(), lifecycle: runLifecycleChecks(), pass: true };
    fs.mkdirSync(REPORT_ROOT, { recursive: true }); fs.writeFileSync(path.join(REPORT_ROOT, 'pcc-cost-checks.json'), JSON.stringify(report, null, 2));
    console.log(`PCC checks pass: ${report.checks.frames} frames; ${report.checks.profileParityFrames} profile parity frames`); return;
  }
  if (process.argv.includes('--benchmark')) { runBenchmark(); return; }
  console.log('Usage: node scripts/inkbox-g3-pcc-cost.mjs --checks-only | --benchmark');
}
main();
