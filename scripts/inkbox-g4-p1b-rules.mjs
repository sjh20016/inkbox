#!/usr/bin/env node
// Bounded lifecycle gate. The update body below is the production method, not a replica.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createSandboxWorld, creationOptions } from '../src/inkbox/ui/worldCreation.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { World } from '../src/inkbox/world/World.js';
import { SEA_LEVEL, TIME, APP } from '../src/inkbox/core/config.js';
import { LEGACY_RULE, STATIC_SEA_RULE, parseHydrologyRule, prepareHydrologyWorld,
  hydrologyRuleForWorld, stepHydrologyForWorld, bindHydrologyWorld } from '../src/inkbox/sim/hydrologyRules.js';
import { stepHydrology } from '../src/inkbox/sim/hydrology.js';
import { serializeWorld, deserializeWorld, saveToStorage, loadFromStorage, exportFile, importFile } from '../src/inkbox/io/save.js';
import { isCompressed } from '../src/inkbox/io/codec.js';
import { History, sculpt, addWater, removeWater } from '../src/inkbox/sim/powers.js';
import { recomputeAll, flushDirty } from '../src/inkbox/world/terrain.js';
import { VARIANTS, enterStaticSea } from './fixtures/g4-p1a/variants-r2.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const BASE = '9801292581e6370ec88d0c600e6aa57fdade123a';
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const baseline = p => execFileSync('git', ['show', `${BASE}:${p}`], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 });
const hash = x => createHash('sha256').update(x).digest('hex');
const clone = x => JSON.parse(JSON.stringify(x));
const layerNames = ['height', 'water', 'temp', 'moist', 'veg', 'fire', 'riverBase', 'type', 'qi', 'over', 'struct', 'owner'];
const hashes = w => Object.fromEntries(layerNames.map(k => [k, hash(Buffer.from(w[k].buffer, w[k].byteOffset, w[k].byteLength))]));
function equalLayers(a, b, names = layerNames) {
  for (const k of names) {
    assert.equal(a[k].length, b[k].length, `${k} size`);
    for (let i = 0; i < a[k].length; i++) assert.ok(Object.is(a[k][i], b[k][i]), `first difference ${k}[${i}]: ${a[k][i]} != ${b[k][i]}`);
  }
}
function withoutRule(p) { const copy = clone(p); delete copy.hydrologyRules; return copy; }
function legacyPayload(p) { const x = withoutRule(p); delete x.upper?.hydrologyRules; delete x.nether?.hydrologyRules; return x; }
async function baselineSave() {
  const file = path.join(root, 'src/inkbox/io/save.js');
  const source = baseline('src/inkbox/io/save.js').replace(/from\s+(['"])(\.[^'"]+)\1/g,
    (_, q, spec) => `from ${q}${pathToFileURL(path.resolve(path.dirname(file), spec)).href}${q}`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const oldSave = await baselineSave();
const preset = { w: 24, h: 18 };
const make = (rule = LEGACY_RULE, seed = 226) => createSandboxWorld(preset, seed, { hydrologyRules: rule });
function attach(w) {
  w.upper = generateUpperWorld({ preset, seed: w.seed });
  w.nether = generateNetherWorld({ preset, seed: w.seed });
  return w;
}
function seaInvariant(w) {
  for (let i = 0; i < w.size; i++) if (w.height[i] < SEA_LEVEL) assert.equal(w.water[i], Math.fround(SEA_LEVEL - w.height[i]), `sea ${i}`);
}
const source = read('src/inkbox/main.js').replace(/\r\n/g, '\n');
const oldSource = baseline('src/inkbox/main.js').replace(/\r\n/g, '\n');
function updateFrom(text, step, original = false) {
  const body = text.match(/\n  update\(dt\) \{([\s\S]*?)\n  \}\n\n  defaultHint\(\)/)?.[1];
  assert.ok(body, 'production update method is extractable');
  return Function('TIME', 'updateFocusPulses', original ? 'stepHydrology' : 'stepHydrologyForWorld', 'decayOverlay', 'flushDirty',
    `return function update(dt) {${body}\n}`)(TIME, () => {}, step, () => {}, flushDirty);
}
function session(world) {
  const s = { world: null, hydroAccum: 0, decayAccum: 0, speedIndex: 0, clock: 0,
    camera: { update() {} }, focusPulses: [], tracePulses: [],
    stage: { ingestWorlds() { return this; }, update() {} }, pointer: { painting: false }, tool: {},
    autoSaveAccum: 0, uiAccum: 0, toastTimer: 0, updateHud() {},
    advanceDays(days) { this.world.day += days; } };
  bindHydrologyWorld(s, world); s.world = world; return s;
}
const summary = { base: BASE, groups: {}, normalization: null, editObservations: [] };
async function group(name, fn) {
  try { const result = await fn(); summary.groups[name] = { status: 'PASS', firstDifference: null, ...result }; console.log(JSON.stringify({ group: name, ...summary.groups[name] })); }
  catch (error) { summary.groups[name] = { status: 'FAIL', firstDifference: error.message }; console.error(JSON.stringify(summary)); throw error; }
}
assert.equal(hash(fs.readFileSync(path.join(root, 'scripts/fixtures/g4-p1a/variants-r2.mjs'))), '22aa5b602a7e151235afafa763eeab1221334eb2b4dbe8ffa0990ee82a36e44b');

await group('A_default_V0', () => {
  let final;
  for (const options of [{}, { generationVersion: 1 }, { terrainPreset: 'standard', progressive: false }]) {
    const w = createSandboxWorld(preset, 226, options);
    const { progressive, hydrologyRules, ...generation } = creationOptions(options);
    const ref = generateWorld({ preset, seed: 226, scatter: true, ...generation });
    equalLayers(w, ref); assert.equal(w.hydrologyRules, LEGACY_RULE);
    assert.equal(Object.keys(w).some(k => k.startsWith('_staticSea')), false);
    const a = session(w), b = session(ref); a.speedIndex = b.speedIndex = 1;
    const current = updateFrom(source, stepHydrologyForWorld), original = updateFrom(oldSource, stepHydrology, true);
    for (const dt of [0.08, 0.1, 0.16, 0.8]) { current.call(a, dt); original.call(b, dt); }
    equalLayers(w, ref); assert.equal(w.day, ref.day); assert.equal(a.hydroAccum, b.hydroAccum);
    assert.deepEqual(withoutRule(serializeWorld(w)), oldSave.serializeWorld(ref));
    final = w;
  }
  const restored = deserializeWorld(serializeWorld(final)), oldRestored = oldSave.deserializeWorld(oldSave.serializeWorld(final));
  stepHydrologyForWorld(restored, 4); stepHydrology(oldRestored, 4, null); equalLayers(restored, oldRestored);
  return { rule: final.hydrologyRules, layers: hashes(final), day: final.day };
});

await group('B_optin_production_update', () => {
  const w = make(STATIC_SEA_RULE), ref = generateWorld({ preset, seed: 226, scatter: true, generationVersion: 2, terrainPreset: 'standard' });
  enterStaticSea(ref); equalLayers(w, ref); seaInvariant(w);
  assert.throws(() => prepareHydrologyWorld(w, STATIC_SEA_RULE, 'create'), /already initialized/);
  const s = session(w); let calls = 0;
  const update = updateFrom(source, (world, days) => { calls++; assert.equal(world, w); assert.equal(days, 4); return stepHydrologyForWorld(world, days); });
  update.call(s, 0.5); assert.equal(calls, 0); equalLayers(w, ref);
  s.speedIndex = 1;
  for (const dt of [0.08, 0.1, 0.16, 0.8]) { const before = calls; update.call(s, dt); assert.ok(calls - before <= 3); for (let i = before; i < calls; i++) VARIANTS.V3_staticSeaStrict(ref); equalLayers(w, ref); }
  const before = calls; s.render3d = { stroke: {}, flushStroke() {} }; update.call(s, 0.8); assert.equal(calls, before);
  seaInvariant(w);
  return { rule: w.hydrologyRules, calls, layers: hashes(w), productionMethod: 'src/inkbox/main.js:Sandbox.update' };
});

await group('C_legacy_formats', () => {
  const payload = oldSave.serializeWorld(attach(make()));
  const formats = [payload, { ...clone(payload), v: 7 }]; delete formats[1].upper; delete formats[1].nether;
  let w;
  for (const p of formats) {
    w = deserializeWorld(clone(p)); const old = oldSave.deserializeWorld(clone(p));
    assert.equal(w.hydrologyRules, LEGACY_RULE); equalLayers(w, old);
    equalLayers(w.upper, old.upper); equalLayers(w.nether, old.nether);
    assert.deepEqual(withoutRule(serializeWorld(w)), oldSave.serializeWorld(old));
    assert.equal(Object.keys(w).some(k => k.startsWith('_staticSea')), false);
  }
  return { rule: w.hydrologyRules, versions: [11, 7], layers: hashes(w) };
});

const slots = new Map(), writes = [];
globalThis.localStorage = { setItem(k, v) { writes.push(k); slots.set(k, v); }, getItem(k) { return slots.get(k) ?? null; }, removeItem(k) { writes.push(k); slots.delete(k); }, get length() { return slots.size; }, key(i) { return [...slots.keys()][i]; } };
await group('D_V3_save_paths', async () => {
  const w = attach(make(STATIC_SEA_RULE)); const p = serializeWorld(w), raw = oldSave.deserializeWorld(legacyPayload(p));
  const start = performance.now(), restored = deserializeWorld(clone(p)), elapsedMs = performance.now() - start;
  let corrected = 0, maxWaterCorrection = 0, typeChanges = 0, qiChanges = 0;
  for (let i = 0; i < w.size; i++) { if (raw.water[i] !== restored.water[i]) { corrected++; maxWaterCorrection = Math.max(maxWaterCorrection, Math.abs(raw.water[i] - restored.water[i])); } if (raw.type[i] !== restored.type[i]) typeChanges++; if (raw.qi[i] !== restored.qi[i]) qiChanges++; }
  summary.normalization = { corrected, maxWaterCorrection, typeChanges, qiChanges, deserializeAndPreparationMs: elapsedMs, cells: w.size };
  seaInvariant(restored); assert.equal(restored.hydrologyRules, STATIC_SEA_RULE);
  const a = serializeWorld(raw), b = serializeWorld(restored); delete a.terrain; delete b.terrain; delete a.hydrologyRules; delete b.hydrologyRules; assert.deepEqual(a, b);
  enterStaticSea(raw); equalLayers(restored, raw);
  const again = deserializeWorld(serializeWorld(restored)); equalLayers(again, restored, ['height', 'water', 'type', 'qi']);
  for (let i = 0; i < 5; i++) { stepHydrologyForWorld(restored, 4); stepHydrologyForWorld(again, 4); VARIANTS.V3_staticSeaStrict(raw); equalLayers(restored, again); equalLayers(restored, raw); }
  assert.equal((await saveToStorage(w, 'g4-p1b')).ok, true);
  const compressed = slots.get(`${APP.saveKey}:g4-p1b`); assert.ok(isCompressed(compressed));
  const loaded = await loadFromStorage('g4-p1b'); assert.equal(loaded.hydrologyRules, STATIC_SEA_RULE); seaInvariant(loaded);
  slots.set(`${APP.saveKey}:plain`, JSON.stringify(p)); assert.equal((await loadFromStorage('plain')).hydrologyRules, STATIC_SEA_RULE);
  let exported; const savedCreate = URL.createObjectURL, savedRevoke = URL.revokeObjectURL, savedTimer = globalThis.setTimeout;
  globalThis.document = { createElement() { return { click() {} }; } };
  URL.createObjectURL = blob => { exported = blob; return 'blob:gate'; }; URL.revokeObjectURL = () => {}; globalThis.setTimeout = () => 0;
  try { exportFile(w); } finally { URL.createObjectURL = savedCreate; URL.revokeObjectURL = savedRevoke; globalThis.setTimeout = savedTimer; delete globalThis.document; }
  const imported = await importFile(exported); assert.equal(imported.hydrologyRules, STATIC_SEA_RULE); seaInvariant(imported);
  const gzipImported = await importFile({ text: async () => compressed }); equalLayers(gzipImported, imported);
  return { rule: imported.hydrologyRules, layers: hashes(imported), normalization: summary.normalization, slotCodecs: ['gzip', 'plain'], fileCodecs: ['plain-export', 'gzip'] };
});

await group('E_invalid_fail_closed', async () => {
  const p = serializeWorld(make()); const live = make(STATIC_SEA_RULE), s = session(live); const beforeWrites = writes.length;
  for (const invalid of [null, '', 'Legacy-v1', 'future-v9', 1, false, undefined, {}, []]) {
    assert.throws(() => parseHydrologyRule(invalid), /hydrologyRules/);
    assert.throws(() => createSandboxWorld(preset, 226, { hydrologyRules: invalid }), /hydrologyRules/);
    const bad = { ...p, hydrologyRules: invalid };
    assert.throws(() => deserializeWorld(bad), /hydrologyRules/);
    if (invalid === undefined) continue; // JSON cannot express an explicitly undefined field.
    await assert.rejects(importFile({ text: async () => JSON.stringify(bad) }), /hydrologyRules/);
    slots.set(`${APP.saveKey}:invalid`, JSON.stringify(bad)); const saved = slots.get(`${APP.saveKey}:invalid`);
    const loaded = await loadFromStorage('invalid'); assert.equal(loaded, null); assert.equal(slots.get(`${APP.saveKey}:invalid`), saved); assert.equal(s.world, live);
  }
  assert.equal(writes.length, beforeWrites);
  const direct = make(); direct.hydrologyRules = STATIC_SEA_RULE;
  assert.throws(() => stepHydrologyForWorld(direct, 4), /changed/); assert.throws(() => serializeWorld(direct), /changed/);
  const forged = new World(5, 5, 1); forged.hydrologyRules = STATIC_SEA_RULE;
  assert.throws(() => bindHydrologyWorld(s, forged), /preparation/); assert.equal(s.world, live);
  assert.equal(deserializeWorld(withoutRule(p)).hydrologyRules, LEGACY_RULE);
  return { rule: live.hydrologyRules, layers: hashes(live), invalidValues: 9, storageWrites: 0 };
});

await group('F_three_realms', () => {
  const w = attach(make(STATIC_SEA_RULE)), initialUpper = hashes(w.upper), initialNether = hashes(w.nether);
  for (let i = 0; i < 4; i++) stepHydrologyForWorld(w, 4);
  assert.deepEqual(hashes(w.upper), initialUpper); assert.deepEqual(hashes(w.nether), initialNether);
  for (const child of [w.upper, w.nether]) { assert.equal(Object.hasOwn(child, 'hydrologyRules'), false); assert.throws(() => stepHydrologyForWorld(child, 4), /mortal/); }
  const p = serializeWorld(w); assert.equal(Object.hasOwn(p.upper, 'hydrologyRules'), false); assert.equal(Object.hasOwn(p.nether, 'hydrologyRules'), false);
  p.upper.hydrologyRules = 'future-v9'; p.nether.hydrologyRules = STATIC_SEA_RULE;
  const restored = deserializeWorld(p), old = oldSave.deserializeWorld(legacyPayload(p));
  for (const plane of ['upper', 'nether']) { assert.equal(Object.hasOwn(restored[plane], 'hydrologyRules'), false); equalLayers(restored[plane], old[plane]); assert.equal(restored[plane].seed, old[plane].seed); assert.equal(restored[plane].nextEntityId, old[plane].nextEntityId); }
  return { rule: w.hydrologyRules, layers: hashes(w), upper: hashes(restored.upper), nether: hashes(restored.nether) };
});

function editWorld() {
  const w = new World(12, 10, 673231);
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) { const i = y * w.w + x; w.height[i] = x < 4 ? 0.22 : 0.55; w.temp[i] = 0.5; w.moist[i] = 0.5; }
  // Closed depression is deliberately treated as sea by the frozen rule.
  w.height[7 * w.w + 8] = 0.18; recomputeAll(w); prepareHydrologyWorld(w, STATIC_SEA_RULE, 'create'); return w;
}
await group('G_edits_pause_undo', () => {
  let final;
  for (const [name, operation, x, y, amount] of [['sea-add', addWater, 2, 4, 0.1], ['sea-remove', removeWater, 2, 4, 0.04], ['raise-seabed', sculpt, 2, 4, 0.2], ['lower-land', sculpt, 7, 4, -0.4]]) {
    const w = editWorld(), history = new History(), before = hashes(w), i = y * w.w + x, h0 = w.height[i], water0 = w.water[i];
    history.begin(); operation(w, x + 0.5, y + 0.5, 1.5, amount, history); assert.ok(history.end(name));
    assert.ok(w.height[i] !== h0 || w.water[i] !== water0, 'real brush event');
    const edited = hashes(w), s = session(w), update = updateFrom(source, stepHydrologyForWorld);
    update.call(s, 0.8); assert.deepEqual(hashes(w), edited, 'paused edits are not normalized');
    const observed = { name, before: { height: h0, water: water0 }, edited: { height: w.height[i], water: w.water[i] } };
    assert.equal(history.undo(w), name); assert.deepEqual(hashes(w), before, 'paused undo restores all layers');
    history.begin(); operation(w, x + 0.5, y + 0.5, 1.5, amount, history); assert.ok(history.end(name));
    const restored = deserializeWorld(serializeWorld(w)); observed.loaded = { height: restored.height[i], water: restored.water[i] };
    seaInvariant(restored); history.clear(); assert.equal(history.undo(restored), null);
    s.speedIndex = 1; update.call(s, 0.16); seaInvariant(w);
    const resumed = session(restored); resumed.speedIndex = 1; update.call(resumed, 0.16); seaInvariant(restored);
    observed.afterTick = { height: w.height[i], water: w.water[i] }; summary.editObservations.push(observed); final = restored;
  }
  assert.ok(final.water[7 * final.w + 8] > 0, 'closed basin receives static sea water');
  return { rule: final.hydrologyRules, layers: hashes(final), observations: summary.editObservations, closedBasinIsSea: true };
});

await group('H_world_lifecycle', async () => {
  const legacy = make(), sea = make(STATIC_SEA_RULE, 673231), s = session(legacy);
  for (const next of [make(), sea, legacy, deserializeWorld(serializeWorld(sea)), await importFile({ text: async () => JSON.stringify(serializeWorld(legacy)) }), sea]) {
    const previous = s.world; s.hydroAccum = 0.13; bindHydrologyWorld(s, next);
    assert.equal(s.hydroAccum, previous.hydrologyRules === STATIC_SEA_RULE || next.hydrologyRules === STATIC_SEA_RULE ? 0 : 0.13);
    s.world = next; assert.equal(hydrologyRuleForWorld(s.world), next.hydrologyRules);
  }
  const a = make(STATIC_SEA_RULE, 1), b = make(STATIC_SEA_RULE, 2), ar = make(STATIC_SEA_RULE, 1), br = make(STATIC_SEA_RULE, 2);
  for (let i = 0; i < 5; i++) { stepHydrologyForWorld(a, 4); stepHydrologyForWorld(b, 4); stepHydrologyForWorld(ar, 4); stepHydrologyForWorld(br, 4); }
  equalLayers(a, ar); equalLayers(b, br); assert.notEqual(a._staticSeaWaterDelta, b._staticSeaWaterDelta);
  assert.equal((source.match(/bindHydrologyWorld\(this, world\);/g) ?? []).length, 3, 'new/load/import each bind');
  assert.equal((source.match(/^\s*this\.world = world;$/gm) ?? []).length, 3);
  return { rule: s.world.hydrologyRules, layers: hashes(s.world), interleavedWorlds: [hashes(a), hashes(b)], replacementPaths: ['newWorld', 'slot', 'file'] };
});
console.log(JSON.stringify({ status: 'P1B_NODE_PASS', ...summary }));
