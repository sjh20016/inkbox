#!/usr/bin/env node
// Diagnostic only. Never imported by the product, never mutates an on-disk save.
// Compares uninterrupted #74 authority against v11 round-trip at a legal boundary.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nativeApi, digest } from './inkbox-wx-e0-replay.mjs';
import { loadCheckpoint } from './inkbox-mlod0b-inputs.mjs';

const SOURCE = '3772bea8fa7b7ef753770c3a47877e6b461dd3c8';
const root = fileURLToPath(new URL('../', import.meta.url));
const arg = (key, otherwise) => process.argv.find(x => x.startsWith(`--${key}=`))?.slice(key.length + 3) ?? otherwise;
const age = Number(arg('age', '400'));
const dt = Number(arg('dt', '3'));
const warmupSteps = Number(arg('warmup-steps', '1'));
const maxSteps = Number(arg('steps', '120'));
const out = path.resolve(arg('out', 'reports/wx-r1/restore-first-diff.json'));
assert([100, 400].includes(age), 'age must be 100 or 400');
assert([0.1, 1, 3].includes(dt), 'dt must be one of the tested native values');
assert(Number.isSafeInteger(warmupSteps) && warmupSteps >= 1 && warmupSteps <= 120);
assert(Number.isSafeInteger(maxSteps) && maxSteps >= 1 && maxSteps <= 7200);

function diff(a, b, location = '$') {
  if (Object.is(a, b)) return null;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return { path: location, a, b };
  }
  if (Array.isArray(a) !== Array.isArray(b)) return { path: location, aType: typeof a, bType: typeof b };
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const result = diff(a[key], b[key], `${location}.${key}`);
    if (result) return result;
  }
  return null;
}
const facts = snapshot => {
  const { terrain, ...nonTerrain } = snapshot;
  return nonTerrain;
};
function diffSummary(value) {
  if (value === null) return null;
  const text = JSON.stringify(value);
  return text.length <= 1500 ? value : { path: value.path, truncated: text.slice(0, 1500) };
}
function firstByteMismatch(a, b) {
  const limit = Math.min(a.length, b.length);
  let offset = 0;
  while (offset < limit && a[offset] === b[offset]) offset++;
  return {
    offset, lengthA: a.length, lengthB: b.length,
    excerptA: a.slice(Math.max(0, offset - 64), offset + 128),
    excerptB: b.slice(Math.max(0, offset - 64), offset + 128)
  };
}
function rawTerrainDelta(a, b) {
  const result = {};
  for (const key of ['height', 'water', 'temp', 'moist', 'veg', 'fire', 'riverBase']) {
    const x = a.world[key], y = b.world[key];
    if (!x && !y) continue;
    assert(x && y && x.length === y.length, `terrain shape mismatch: ${key}`);
    let changed = 0, maximum = 0, firstIndex = null, firstValues = null;
    for (let i = 0; i < x.length; i++) {
      const n = Math.abs(x[i] - y[i]);
      if (n > 0 || !Object.is(x[i], y[i])) {
        changed++;
        if (firstIndex === null) { firstIndex = i; firstValues = [x[i], y[i]]; }
        maximum = Math.max(maximum, n);
      }
    }
    result[key] = { changed, total: x.length, maxAbsDelta: maximum, firstIndex, firstValues };
  }
  return result;
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'inkbox-wx-r1-restore-'));
const report = {
  schema: 'wx-r1-first-divergence-v1', source: SOURCE, node: process.version,
  input: { age, dt, warmupSteps, maxSteps },
  contract: 'A continues #74; B round-trips v11+G8 after warmup. Report first encoded-terrain, nonterrain World/runtime and unsaved event difference separately. No product mutation.',
  status: 'running', completedSteps: 0, samples: [],
  firstEncodedTerrainDifference: null, firstNonTerrainDifference: null, firstEventDifference: null, firstByteOnlyDifference: null
};
function write() { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); }
try {
  const archive = path.join(temp, 'product.tar');
  execFileSync('git', ['archive', '--format=tar', '--output=' + archive, SOURCE, 'src', 'package.json'], { cwd: root });
  execFileSync('tar', ['-xf', archive, '-C', temp]);
  const api = await nativeApi(temp);
  const events = await import(pathToFileURL(path.join(temp, 'src/inkbox/core/runtimeEvents.js')).href);
  const planes = c => [c.world, c.world.upper, c.world.nether];
  const eventSnapshot = c => planes(c).map((world, index) => world ? {
    plane: ['mortal', 'upper', 'nether'][index],
    events: events.peekRuntimeEvents(world),
    stats: events.runtimeEventStats(world)
  } : null);
  const drain = c => { for (const world of planes(c)) if (world) events.drainRuntimeEvents(world); };
  const input = loadCheckpoint(age);
  report.input.sha256 = input.sha256;
  report.input.file = input.file;
  const continuous = api.restore(input.saved);
  for (let i = 0; i < warmupSteps; i++) { api.advance(continuous, dt); drain(continuous); }
  const atSplit = api.capture(continuous);
  report.split = { day: continuous.world.day, preRoundtripSha256: digest(JSON.stringify(atSplit)) };
  const restored = api.restore(atSplit);
  report.split.rawTerrainDelta = rawTerrainDelta(continuous, restored);
  const afterRoundtrip = api.capture(restored);
  const initialState = diff(facts(atSplit), facts(afterRoundtrip));
  report.split.initialNonTerrainDifference = diffSummary(initialState);
  const splitABytes = JSON.stringify(atSplit), splitBBytes = JSON.stringify(afterRoundtrip);
  report.split.initialBytesEqual = splitABytes === splitBBytes;
  if (!report.split.initialBytesEqual) report.split.initialByteMismatch = firstByteMismatch(splitABytes, splitBBytes);
  write();
  for (let step = 1; step <= maxSteps; step++) {
    api.advance(continuous, dt);
    api.advance(restored, dt);
    assert.equal(continuous.world.day, restored.world.day, 'different native day count');
    const a = api.capture(continuous), b = api.capture(restored);
    const encodedTerrain = diff(a.terrain, b.terrain, '$.terrain');
    const nonTerrain = diff(facts(a), facts(b));
    const transientEvents = diff(eventSnapshot(continuous), eventSnapshot(restored), '$.transientEvents');
    const locator = { step, day: continuous.world.day };
    const bytesA = JSON.stringify(a), bytesB = JSON.stringify(b);
    if (bytesA !== bytesB && !encodedTerrain && !nonTerrain && !report.firstByteOnlyDifference) {
      report.firstByteOnlyDifference = { ...locator, detail: firstByteMismatch(bytesA, bytesB),
        interpretation: 'JSON byte difference with equal parsed keys/values; verify insertion/key order, not semantic divergence' };
    }
    if (encodedTerrain && !report.firstEncodedTerrainDifference) report.firstEncodedTerrainDifference = { ...locator, detail: diffSummary(encodedTerrain) };
    if (nonTerrain && !report.firstNonTerrainDifference) report.firstNonTerrainDifference = { ...locator, detail: diffSummary(nonTerrain) };
    if (transientEvents && !report.firstEventDifference) report.firstEventDifference = { ...locator, detail: diffSummary(transientEvents) };
    if (step % 30 === 0 || step === maxSteps || nonTerrain || transientEvents) {
      report.samples.push({ ...locator, continuousWorldSha256: digest(JSON.stringify(a)), restoredWorldSha256: digest(JSON.stringify(b)),
        serializedEqual: bytesA === bytesB, nonTerrainEqual: !nonTerrain, eventsEqual: !transientEvents });
    }
    report.completedSteps = step;
    if (nonTerrain || transientEvents) { report.status = 'behavioral-difference-observed'; write(); break; }
    drain(continuous);
    drain(restored);
    if (step % 30 === 0) write();
  }
  if (report.status === 'running') report.status = 'no-behavioral-difference-in-window';
} catch (error) {
  report.status = 'error';
  report.error = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  report.exitCode = process.exitCode ?? 0;
  write();
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log(JSON.stringify({ status: report.status, source: SOURCE, splitDay: report.split?.day,
  completedSteps: report.completedSteps, firstEncodedTerrainDifference: report.firstEncodedTerrainDifference,
  firstNonTerrainDifference: report.firstNonTerrainDifference, firstEventDifference: report.firstEventDifference,
  firstByteOnlyDifference: report.firstByteOnlyDifference, out }));
