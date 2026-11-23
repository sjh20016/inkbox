import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeApi, digest } from './inkbox-wx-e0-replay.mjs';
import { loadCheckpoint } from './inkbox-mlod0b-inputs.mjs';
import { buildPopulationCensus, compareCensusToLegacy } from '../src/inkbox/sim/demography/legacyCensus.js';
import { villageSocieties } from '../src/inkbox/sim/sectEconomy.js';
import { peekRuntimeEvents, drainRuntimeEvents, runtimeEventStats } from '../src/inkbox/core/runtimeEvents.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const option = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const age = Number(option('age', 100));
const seed = Number(option('seed', 0));
const dt = Number(option('dt', 3));
const duration = Number(option(seed ? 'years' : 'days', seed ? 200 : 360));
const count = Math.round(duration * (seed ? 360 : 1) / dt);
assert([0.1, 1, 3].includes(dt));
assert(Number.isSafeInteger(count) && count > 0 && count * dt === duration * (seed ? 360 : 1));
assert(seed ? [20260914, 73101, 61003].includes(seed) : [100, 400].includes(age));
const id = seed ? `seed-${seed}` : `age-${age}-dt${String(dt).replace('.', '')}`;
const proof = JSON.parse(fs.readFileSync(path.join(root, 'reports/mlod0b/proof', id + '.json')));
assert.equal(proof.status, 'passed');
const api = await nativeApi(root);
const input = seed ? null : loadCheckpoint(age);
const off = seed ? api.fresh(seed) : api.restore(input.saved);
const audit = seed ? api.fresh(seed) : api.restore(input.saved);
const report = { schema: 'mlod0b-event-matrix-v1', id, seed: seed || null, age: seed ? null : age,
  dt, duration, expectedSteps: count, inputSha256: input?.sha256 ?? null,
  protocol: 'Two independently advanced worlds; audit arm reads current census and, for natural saves, selective societies. Every committed boundary compares ordered complete runtime-event payloads and drop/eviction counters per available plane. Both arms then drain presentation queues. Full v11+G8 captures only at final boundary.',
  status: 'running', completedSteps: 0, totalEvents: 0, maxQueued: 0, reports: [] };
const output = path.resolve(option('out', `reports/mlod0b/event-matrix/${id}.json`));
fs.mkdirSync(path.dirname(output), { recursive: true });
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
let interval = 0;
let rolling = [];
try {
  for (let step = 1; step <= count; step++) {
    api.advance(off, dt);
    api.advance(audit, dt);
    const census = buildPopulationCensus(audit.world, 'after-advance');
    compareCensusToLegacy(audit.world, census, 'after-advance');
    if (!seed) assert.deepEqual([...villageSocieties(audit.world, 'census')], [...villageSocieties(audit.world, 'legacy')]);
    const worlds = [off.world, off.world.upper, off.world.nether];
    const observed = [audit.world, audit.world.upper, audit.world.nether];
    const stepEvents = [];
    for (let plane = 0; plane < worlds.length; plane++) {
      assert.equal(!!worlds[plane], !!observed[plane], `plane presence ${step}`);
      if (!worlds[plane]) continue;
      const left = peekRuntimeEvents(worlds[plane]);
      const right = peekRuntimeEvents(observed[plane]);
      const leftStats = runtimeEventStats(worlds[plane]);
      const rightStats = runtimeEventStats(observed[plane]);
      assert.deepEqual(right, left, `ordered events ${id} step ${step} plane ${plane}`);
      assert.deepEqual(rightStats, leftStats, `event counters ${id} step ${step} plane ${plane}`);
      assert.deepEqual(drainRuntimeEvents(worlds[plane]), left);
      assert.deepEqual(drainRuntimeEvents(observed[plane]), right);
      stepEvents.push({ plane: ['mortal', 'upper', 'nether'][plane], events: left, stats: leftStats });
      report.totalEvents += left.length;
      report.maxQueued = Math.max(report.maxQueued, leftStats.queued);
    }
    rolling.push(digest(stepEvents));
    interval++;
    report.completedSteps = step;
    const intervalLength = seed ? Math.round(360 / dt) : Math.round(30 / dt);
    if (step % intervalLength === 0 || step === count) {
      report.reports.push({ step, day: off.world.day, steps: interval,
        orderedEventsAndCountersSha256: digest(rolling.join('')),
        totalEvents: report.totalEvents, maxQueued: report.maxQueued });
      rolling = [];
      interval = 0;
      save();
    }
  }
  const left = api.capture(off);
  const right = api.capture(audit);
  assert.deepEqual(right, left, 'final v11+G8 differs');
  const actualHash = digest(JSON.stringify(left));
  const expectedHash = seed ? proof.cases[0].annual.at(-1).worldAndRuntimeSha256 : proof.cases[0].finalSha256;
  if (duration === (seed ? 200 : 360)) assert.equal(actualHash, expectedHash, 'final v11+G8 differs from fixed nine-job proof');
  report.finalWorldAndRuntimeSha256 = actualHash;
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  report.exitCode = process.exitCode ?? 0;
  save();
  console.log(JSON.stringify({ id, status: report.status, steps: report.completedSteps, events: report.totalEvents, error: report.error }));
}
