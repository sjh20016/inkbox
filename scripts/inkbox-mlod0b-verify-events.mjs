import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { inputHashes } from './inkbox-mlod0b-inputs.mjs';

const directory = new URL('../reports/mlod0b/event-matrix/', import.meta.url);
const proof = new URL('../reports/mlod0b/proof/', import.meta.url);
const rows = [];
for (const seed of [20260914, 73101, 61003]) rows.push({ id: `seed-${seed}`, count: 24000, intervals: 200 });
for (const age of [100, 400]) for (const dt of [0.1, 1, 3]) {
  rows.push({ id: `age-${age}-dt${String(dt).replace('.', '')}`, age, dt, count: Math.round(360 / dt), intervals: 12 });
}
const summary = { sourceCommit: '6594ecaed27c82f5335015c623b2d6a2a0b4ac07',
  run: 'https://github.com/sjh20016/inkbox/actions/runs/45157310969', cases: [] };
for (const row of rows) {
  const bytes = fs.readFileSync(new URL(row.id + '.json', directory));
  const actual = JSON.parse(bytes);
  const prior = JSON.parse(fs.readFileSync(new URL(row.id + '.json', proof)));
  assert.equal(actual.id, row.id);
  assert.equal(actual.status, 'passed');
  assert.equal(actual.exitCode, 0);
  assert.equal(actual.expectedSteps, row.count);
  assert.equal(actual.completedSteps, row.count);
  assert.equal(actual.reports.length, row.intervals);
  assert.equal(actual.reports.at(-1).step, row.count);
  assert(actual.totalEvents > 0);
  for (const entry of actual.reports) assert.match(entry.orderedEventsAndCountersSha256, /^[0-9a-f]{64}$/);
  if (row.age) {
    assert.equal(actual.inputSha256, inputHashes[row.age]);
    assert.equal(actual.finalWorldAndRuntimeSha256, prior.cases[0].finalSha256);
  } else {
    assert.equal(actual.finalWorldAndRuntimeSha256, prior.cases[0].annual.at(-1).worldAndRuntimeSha256);
  }
  summary.cases.push({ id: row.id, steps: row.count, events: actual.totalEvents,
    maxQueued: actual.maxQueued, finalWorldAndRuntimeSha256: actual.finalWorldAndRuntimeSha256,
    rawSha256: createHash('sha256').update(bytes).digest('hex') });
}
assert.equal(summary.cases.reduce((sum, row) => sum + row.steps, 0), 80160);
fs.writeFileSync(new URL('summary.json', directory), JSON.stringify(summary, null, 2) + '\n');
console.log(`Verified ${summary.cases.length} event cases and 80,160 committed boundaries.`);
