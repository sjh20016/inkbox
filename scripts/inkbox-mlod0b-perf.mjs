import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { nativeApi, digest } from './inkbox-wx-e0-replay.mjs';
import { buildPopulationCensus } from '../src/inkbox/sim/demography/legacyCensus.js';
import { readVillageSocieties, setPopulationUiReadMode } from '../src/inkbox/sim/demography/populationReadPort.js';
import { manageCommittedWorlds } from '../src/inkbox/presentation/readView/committedStore.js';
import { getSettlementInspection } from '../src/inkbox/presentation/readView/query.js';
import { villageSocieties } from '../src/inkbox/sim/sectEconomy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadCheckpoint } = await import('./inkbox-mlod0b-inputs.mjs');
const out = path.resolve(root, 'reports/mlod0b/perf.json');
const api = await nativeApi(root);
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const distribution = (values) => ({ p50: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99), samples: values });
const cases = [];
const sourceFingerprint = async directory => {
  const { execFileSync } = await import('node:child_process');
  const files = execFileSync('git', ['-C', directory, 'ls-tree', '-r', '-z', '--name-only', 'HEAD', 'src'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  return Object.fromEntries(files.filter(file => /\.(js|mjs)$/.test(file)).map(file => {
    const bytes = execFileSync('git', ['-C', directory, 'show', 'HEAD:' + file], { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 });
    return [file, digest(bytes)];
  }));
};
const report = {
  schema: 'mlod0b-perf-v1', baseline: '3772bea8fa7b7ef753770c3a47877e6b461dd3c8', candidateCommit: null,
  sourceHashes: {},
  environment: { node: process.version, cpu: os.cpus()[0]?.model, platform: process.platform },
  protocol: { sequence: 'ABBA', rounds: 5, days: 30, dt: 3, arms: ['default-off', 'shadow-each-step'], instrumentation: 'outer monotonic wall, process CPU, raw advance steps, explicit post-step census; source blob fingerprint recorded', caveat: 'Other local long-running jobs may contend for the CPU. Compare paired trials and raw samples.' },
  cases,
};
fs.mkdirSync(path.dirname(out), { recursive: true });

function trial(saved, arm, runner = api) {
  const state = runner.restore(saved);

  const steps = [];
  const stepRecords = [];
  const censusMs = [];
  const cpuStart = process.cpuUsage();
  const rssStart = process.memoryUsage().rss;
  const begin = performance.now();
  for (let index = 0; index < 10; index += 1) {
    const start = performance.now();
    const startDay = state.world.day;
    const beforeCounts = state.world.entities.length;
    runner.advance(state, 3);
    const durationMs = performance.now() - start;
    steps.push(durationMs);
    stepRecords.push({ startDay, endDay: state.world.day, durationMs, entityCount: beforeCounts, crossedMonth: Math.floor(startDay / 30) !== Math.floor(state.world.day / 30) });
    if (arm === 'shadow-each-step') {
      const scanStart = performance.now();
      const snapshot = buildPopulationCensus(state.world, 'post-complete-step');
      assert(snapshot.global.living >= 0);
      censusMs.push(performance.now() - scanStart);
    }
    if (arm === 'consumer-census') {
      const scanStart = performance.now();
      assert.equal(villageSocieties(state.world, 'census').size, state.world.villages.length);
      censusMs.push(performance.now() - scanStart);
    }
  }
  const wallMs = performance.now() - begin;
  const cpu = process.cpuUsage(cpuStart);
  const after = process.memoryUsage();
  const saveStart = performance.now();
  const serialized = JSON.stringify(runner.capture(state));
  const saveMs = performance.now() - saveStart;
  const query = {};
  const firstVillage = state.world.villages[0];
  for (const mode of runner === api ? ['legacy', 'audit', 'census'] : []) {
    const times = [];
    for (let i = 0; i < 15; i += 1) {
      const start = performance.now();
      const value = readVillageSocieties(state.world, villageSocieties, mode);
      assert(value.societies.size > 0 && firstVillage);
      assert.equal(value.differences.length, 0);
      times.push(performance.now() - start);
    }
    query[mode] = distribution(times);
  }
  if (runner === api) {
    const cardState = runner.restore(saved);
    setPopulationUiReadMode(cardState.world, 'audit');
    const session = manageCommittedWorlds(cardState.world);
    const times = [];
    for (let i = 0; i < 15; i += 1) {
      const start = performance.now();
      const card = getSettlementInspection(cardState.world, 'mortal', cardState.world.villages[0].id);
      assert(card && session.commitSequence >= 0);
      times.push(performance.now() - start);
    }
    query.committedCard = distribution(times);
  }
  return {
    arm, wallMs, cpuMs: (cpu.user + cpu.system) / 1000,
    stepMs: distribution(steps), stepRecords, censusMs: censusMs.length ? distribution(censusMs) : null,
    queryMs: query, saveMs, serializedBytes: Buffer.byteLength(serialized),
    stateHash: digest(serialized), rssStart, rssEnd: after.rss, heapUsedEnd: after.heapUsed,
  };
}

if (process.argv.includes('--extended')) {
  const existing = JSON.parse(fs.readFileSync(out));
  const baselineRoot = path.resolve(root, '../inkbox-mlod0');
  const { execFileSync } = await import('node:child_process');
  const baselineSource = execFileSync('git', ['-C', baselineRoot, 'rev-parse', '3772bea^{tree}'], { encoding: 'utf8' }).trim();
  const baseline = await nativeApi(baselineRoot);
  const pairs = [
    ['pinned-74', 'default-off'],
    ['default-off', 'consumer-census'],
  ];
  existing.extended = { baselineRoot, baselineTree: baselineSource, baselineSourceHashes: await sourceFingerprint(baselineRoot), candidateCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root,encoding:'utf8'}).trim(), candidateTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd:root,encoding:'utf8'}).trim(), candidateSourceHashes: await sourceFingerprint(root), protocol: 'Each pair ABBA times five; 30 game days, dt=3. Query after each run. Different pairs are separate comparisons.', cases: [] };
  for (const age of [100, 400]) {
    const input = existing.cases.find(row => row.age === age).input;
    const saved = JSON.parse(fs.readFileSync(input.file));
    for (const pair of pairs) {
      const item = { age, input, pair, samples: [] };
      existing.extended.cases.push(item);
      for (let round = 0; round < 5; round += 1) {
        for (const arm of [pair[0], pair[1], pair[1], pair[0]]) {
          const sample = trial(saved, arm, arm === 'pinned-74' ? baseline : api);
          item.samples.push({ round, ...sample });
          fs.writeFileSync(out, JSON.stringify(existing, null, 2));
          console.log(`${age}y ${pair.join('/')} ${round} ${arm} ${sample.wallMs.toFixed(1)}ms`);
        }
      }
      assert.equal(new Set(item.samples.map(row => row.stateHash)).size, 1, 'source or reader changed v11 bytes');
      item.summary = Object.fromEntries(pair.map(arm => {
        const rows = item.samples.filter(row => row.arm === arm);
        return [arm, { wallMs: distribution(rows.map(row => row.wallMs)), stepMs: distribution(rows.flatMap(row => row.stepRecords.map(step => step.durationMs))), cpuMs: distribution(rows.map(row => row.cpuMs)), saveBytes: rows[0].serializedBytes }];
      }));
    }
  }
  existing.extended.pass = true;
  existing.extended.finishedAt = new Date().toISOString();
  fs.writeFileSync(out, JSON.stringify(existing, null, 2));
  process.exit(0);
}

for (const age of [100, 400]) {
  const {saved,file,sha256,bytes:inputBytes}=loadCheckpoint(age);
  const bytes = JSON.stringify(saved);
  assert.equal(saved.v, 11);
  assert.equal(saved.runtime?.exact, true);
  const item = { age, input: { file, sha256, bytes: inputBytes }, samples: [] };
  cases.push(item);
  for (let round = 0; round < 5; round += 1) {
    for (const arm of ['default-off', 'shadow-each-step', 'shadow-each-step', 'default-off']) {
      const result = trial(saved, arm);
      item.samples.push({ round, ...result });
      fs.writeFileSync(out, JSON.stringify(report, null, 2));
      console.log(`${age}y ${round} ${arm} ${result.wallMs.toFixed(1)}ms`);
    }
  }
  assert.equal(new Set(item.samples.map(x => x.stateHash)).size, 1, 'shadow changed world or v11 runtime');
  item.phaseSummary = Object.fromEntries(['common-day','calendar-boundary'].map(group => {
    const rows = item.samples.flatMap(sample => sample.stepRecords).filter(step => (group === 'calendar-boundary') === step.crossedMonth);
    return [group, rows.length ? distribution(rows.map(step => step.durationMs)) : null];
  }));
  if (globalThis.gc) {
    const before = process.memoryUsage();
    const start = performance.now();
    globalThis.gc();
    item.explicitGcProbe = { wallMs: performance.now() - start, before, after: process.memoryUsage(), placement: 'after all timed samples' };
  }
  item.summary = Object.fromEntries(['default-off', 'shadow-each-step'].map(arm => {
    const rows = item.samples.filter(row => row.arm === arm);
    return [arm, { wallMs: distribution(rows.map(row => row.wallMs)), cpuMs: distribution(rows.map(row => row.cpuMs)), stepP95Ms: distribution(rows.map(row => row.stepMs.p95)), maxRssBytes: Math.max(...rows.map(row => row.rssEnd)), saveBytes: rows[0].serializedBytes }];
  }));
}
report.pass = true;
report.finishedAt = new Date().toISOString();
fs.writeFileSync(out, JSON.stringify(report, null, 2));
