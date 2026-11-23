import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { nativeApi, digest } from './inkbox-wx-e0-replay.mjs';
import { loadCheckpoint } from './inkbox-mlod0b-inputs.mjs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { villageSocieties } from '../src/inkbox/sim/sectEconomy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => process.argv.find(item => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const ages = arg('ages', '100,400').split(',').map(Number);
const dts = arg('dts', '0.1,1,3').split(',').map(Number);
const days = Number(arg('days', '30'));
const output = path.resolve(arg('out', 'reports/mlod0b/equiv.json'));
const censusPath = path.join(root, 'src/inkbox/sim/demography/legacyCensus.js');
const censusModule = fs.existsSync(censusPath) ? await import('../src/inkbox/sim/demography/legacyCensus.js') : null;
const api = await nativeApi(root);

assert(ages.every(age => age === 100 || age === 400));
assert(dts.every(dt => [0.1, 1, 3].includes(dt)));
assert(Number.isFinite(days) && days > 0 && days <= 360);
fs.mkdirSync(path.dirname(output), { recursive: true });

function firstDifference(left, right, location = '$') {
  if (Object.is(left, right)) return null;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') {
    return { path: location, left, right };
  }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const result = firstDifference(left[key], right[key], `${location}.${key}`);
    if (result) return result;
  }
  return null;
}

function sourceFingerprint() {
  const hash = createHash('sha256');
  const files = [
    'src/inkbox/sim/advance.js',
    'src/inkbox/sim/life.js',
    'src/inkbox/sim/sects.js',
    'src/inkbox/sim/sectEconomy.js',
    'src/inkbox/sim/demography/legacyCensus.js',
    'src/inkbox/sim/demography/populationReadPort.js',
    'scripts/inkbox-wx-e0-replay.mjs',
    'scripts/inkbox-mlod0b-inputs.mjs',
    'scripts/inkbox-mlod0b-equiv.mjs'
  ].filter(file => fs.existsSync(path.join(root, file))).sort();
  for (const file of files) if (fs.existsSync(path.join(root, file))) {
    hash.update(file).update('\0').update(fs.readFileSync(path.join(root, file)));
  }
  return { sha256: hash.digest('hex'), files: files.length };
}

function censusRead(context, phase) {
  if (!censusModule) return { available: false };
  const census = censusModule.buildPopulationCensus(context.world, phase);
  const differences = censusModule.compareCensusToLegacy(context.world, census, phase);
  const legacySocieties = villageSocieties(context.world, 'legacy');
  const selectiveSocieties = villageSocieties(context.world, 'census');
  assert.deepEqual([...selectiveSocieties], [...legacySocieties], 'selective reader changed village society facts');
  return { available: true, differences: differences.length, firstDifference: differences[0] ?? null,
    selectiveReaderEqual: true };
}

const report = {
  schema: 'mlod0b-equiv-v1', sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceFingerprint: sourceFingerprint(),
  node: process.version, protocol: { ages, dts, days, arms: ['off', 'post-step-audit'], exactCompare: 'JSON bytes of complete v11 world and runtime after each successful advanceWorld' },
  cases: [], status: 'running'
};
function persist() { fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`); }
try {
  for (const age of ages) for (const dt of dts) {
    const { saved, file: inputFile, sha256: inputSha256 } = loadCheckpoint(age);
    const off = api.restore(saved);
    const audit = api.restore(saved);
    const row = { age, dt, targetDays: days, inputFile, inputSha256, steps: [], status: 'running' };
    report.cases.push(row);
    persist();
    const count = Math.round(days / dt);
    assert(Math.abs(count * dt - days) < 1e-7, 'days must be a multiple of dt');
    for (let index = 0; index < count; index++) {
      const start = performance.now();
      api.advance(off, dt);
      const offMs = performance.now() - start;
      const auditStart = performance.now();
      api.advance(audit, dt);
      const auditAdvanceMs = performance.now() - auditStart;
      const beforeRead = JSON.stringify(api.capture(audit));
      const censusStart = performance.now();
      const auditResult = censusRead(audit, 'after-complete-advance');
      const censusMs = performance.now() - censusStart;
      const left = api.capture(off);
      const right = api.capture(audit);
      const leftBytes = JSON.stringify(left);
      const rightBytes = JSON.stringify(right);
      assert.equal(rightBytes, beforeRead, 'post-step population reads mutated world or runtime');
      const step = { index: index + 1, day: off.world.day, offMs, auditAdvanceMs, censusMs,
        worldAndRuntimeSha256: digest(leftBytes), runtimeSha256: digest(left.runtime), census: auditResult,
        byteEqual: leftBytes === rightBytes };
      row.steps.push(step);
      if (!step.byteEqual) {
        step.firstDifference = firstDifference(left, right);
        row.status = 'failed';
        throw Error(`L0 mismatch age ${age}, dt ${dt}, step ${index + 1}: ${JSON.stringify(step.firstDifference)}`);
      }
      if ((index + 1) % 30 === 0 || index + 1 === count) persist();
    }
    row.status = 'passed';
    row.finalSha256 = row.steps.at(-1)?.worldAndRuntimeSha256;
    row.finalRuntimeSha256 = row.steps.at(-1)?.runtimeSha256;
    row.censusAvailable = row.steps.every(step => step.census.available);
    persist();
    console.log(`${age}y dt=${dt}: ${count} exact commit boundaries passed, census=${row.censusAvailable}`);
  }
  assert.deepEqual(sourceFingerprint(), report.sourceFingerprint, 'source changed during proof');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  report.exitCode = process.exitCode ?? 0;
  persist();
  console.log(JSON.stringify({ status: report.status, completed: report.cases.filter(row => row.status === 'passed').length, out: output, error: report.error }));
}
