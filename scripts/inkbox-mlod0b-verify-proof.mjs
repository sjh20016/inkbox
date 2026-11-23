import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { inputHashes } from './inkbox-mlod0b-inputs.mjs';

const directory = new URL('../reports/mlod0b/proof/', import.meta.url);
const proofCommit = '24f42c2d99a746154a731a392949dc428f0d3e50';
const summary = { proofCommit, run: 'https://github.com/sjh20016/inkbox/actions/runs/45027304889', seeds: [], windows: [] };
const hashed = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
function read(id) {
  const bytes = fs.readFileSync(new URL(id + '.json', directory));
  const data = JSON.parse(bytes);
  assert.equal(data.status, 'passed', id);
  assert.equal(data.exitCode, 0, id);
  assert.match(data.node, /^v24\./);
  assert(hashed(data.sourceFingerprint.sha256));
  assert.equal(data.cases.length, 1, id);
  assert.equal(data.cases[0].status, 'passed', id);
  return { data, row: data.cases[0], rawSha256: createHash('sha256').update(bytes).digest('hex') };
}
for (const seed of [20260914, 73101, 61003]) {
  const {data, row, rawSha256} = read('seed-' + seed);
  assert.deepEqual(data.seeds, [seed]);
  assert.equal(data.years, 200);
  assert.equal(data.daysPerYear, 360);
  assert.equal(row.seed, seed);
  assert.equal(data.dt, 3);
  assert.equal(row.completedSteps, 24000);
  assert.equal(row.annual.length, 200);
  for (const [index, entry] of row.annual.entries()) {
    assert.equal(entry.year, index + 1);
    assert.equal(entry.day, row.initialDay + 360 * (index + 1));
    assert(hashed(entry.allCommitHashesSha256));
    assert(hashed(entry.runtimeSha256));
    assert(hashed(entry.worldAndRuntimeSha256));
  }
  summary.seeds.push({ seed, years: 200, steps: 24000, elapsedMs: row.elapsedMs,
    finalWorldAndRuntime: row.annual.at(-1).worldAndRuntimeSha256,
    fingerprint: data.sourceFingerprint.sha256, rawSha256 });
}
for (const age of [100,400]) for (const dt of [0.1,1,3]) {
  const {data, row, rawSha256} = read('age-' + age + '-dt' + String(dt).replace('.', ''));
  assert.equal(data.sourceHead, proofCommit);
  assert.equal(data.protocol.days, 360);
  assert.equal(row.age, age);
  assert.equal(row.dt, dt);
  assert.equal(row.inputSha256, inputHashes[age]);
  assert.equal(row.steps.length, 360 / dt);
  for (const [i, step] of row.steps.entries()) {
    assert.equal(step.index, i + 1);
    assert(Math.abs(step.day - (age * 360 + dt * (i + 1))) < 0.0001);
    assert(step.byteEqual && step.census.available && step.census.selectiveReaderEqual);
    assert(hashed(step.worldAndRuntimeSha256) && hashed(step.runtimeSha256));
  }
  assert.equal(row.finalSha256, row.steps.at(-1).worldAndRuntimeSha256);
  assert.equal(row.finalRuntimeSha256, row.steps.at(-1).runtimeSha256);
  summary.windows.push({age, dt, days: 360, steps: row.steps.length,
    day30: row.steps[30 / dt - 1].worldAndRuntimeSha256, day360: row.finalSha256,
    fingerprint: data.sourceFingerprint.sha256, rawSha256});
}
for (const rows of [summary.seeds, summary.windows]) assert.equal(new Set(rows.map(r => r.fingerprint)).size, 1);
fs.writeFileSync(new URL('summary.json', directory), JSON.stringify(summary, null, 2)+'\n');
console.log('Verified 72,000 long-run and 8,160 natural checkpoint boundaries.');
