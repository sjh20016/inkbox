import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { nativeApi, digest } from './inkbox-wx-e0-replay.mjs';
import { buildPopulationCensus, compareCensusToLegacy } from '../src/inkbox/sim/demography/legacyCensus.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const seeds = option('seeds', '20260914,73101,61003').split(',').map(Number);
const years = Number(option('years', '200'));
const dt = Number(option('dt', '3'));
const out = path.resolve(option('out', 'reports/mlod0b/longrun.json'));
assert(seeds.every(Number.isSafeInteger));
assert(Number.isInteger(years) && years > 0 && years <= 200);
assert([0.1, 1, 3].includes(dt));
fs.mkdirSync(path.dirname(out), { recursive: true });
const api = await nativeApi(root);
function sourceFingerprint() {
  const hash = createHash('sha256');
  const files = [
    'src/inkbox/sim/advance.js',
    'src/inkbox/sim/life.js',
    'src/inkbox/sim/sects.js',
    'src/inkbox/sim/sectEconomy.js',
    'src/inkbox/sim/demography/legacyCensus.js',
    'scripts/inkbox-wx-e0-replay.mjs',
    'scripts/inkbox-mlod0b-inputs.mjs',
    'scripts/inkbox-mlod0b-longrun.mjs'
  ].sort();
  for (const file of files) if (fs.existsSync(path.join(root, file))) {
    hash.update(file).update('\0').update(fs.readFileSync(path.join(root, file)));
  }
  return { sha256: hash.digest('hex'), files: files.length };
}
const report = { schema: 'mlod0b-longrun-v1', status: 'running', seeds, years, dt, daysPerYear: 360,
  method: 'Fresh legacy sandbox from fixed seed, two independent contexts, post-step census on audit arm. Full v11 world+runtime JSON is compared after every legal commit; annual records retain a rolling digest of all commit hashes.',
  node: process.version, sourceFingerprint: sourceFingerprint(), cases: [] };
const write = () => fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
try {
  for (const seed of seeds) {
    const off = api.fresh(seed);
    const audit = api.fresh(seed);
    const row = { seed, initialDay: off.world.day, status: 'running', completedSteps: 0, annual: [] };
    report.cases.push(row);
    let rolling = createHash('sha256');
    const stepsPerYear = Math.round(360 / dt);
    const start = performance.now();
    for (let step = 1; step <= years * stepsPerYear; step++) {
      api.advance(off, dt);
      api.advance(audit, dt);
      const beforeState = api.capture(audit);
      const before = JSON.stringify(beforeState);
      const census = buildPopulationCensus(audit.world, 'after-advance');
      const differences = compareCensusToLegacy(audit.world, census, 'after-advance');
      const auditState = api.capture(audit);
      const right = JSON.stringify(auditState);
      assert.equal(right, before, 'audit mutated world or runtime');
      const leftState = api.capture(off);
      const left = JSON.stringify(leftState);
      if (left !== right) {
        row.status = 'failed';
        row.firstMismatch = { step, day: off.world.day, offSha256: digest(left), auditSha256: digest(right) };
        throw Error(`L0 mismatch seed ${seed}, step ${step}`);
      }
      rolling.update(digest(left));
      row.completedSteps = step;
      if (step % stepsPerYear === 0) {
        row.annual.push({ year: step / stepsPerYear, day: off.world.day, worldAndRuntimeSha256: digest(left),
          runtimeSha256: digest(leftState.runtime), observedCacheDifferences: differences.length,
          allCommitHashesSha256: rolling.digest('hex'), elapsedMs: performance.now() - start });
        rolling = createHash('sha256');
        write();
        console.log(`seed=${seed} year=${step / stepsPerYear}/${years} complete`);
      }
    }
    row.status = 'passed';
    row.elapsedMs = performance.now() - start;
    write();
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
  write();
  console.log(JSON.stringify({ status: report.status, cases: report.cases.map(row => ({ seed: row.seed, status: row.status, steps: row.completedSteps })), error: report.error }));
}
