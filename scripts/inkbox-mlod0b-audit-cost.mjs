import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { nativeApi, digest } from './inkbox-wx-e0-replay.mjs';
import { loadCheckpoint } from './inkbox-mlod0b-inputs.mjs';
import { setPopulationUiReadMode } from '../src/inkbox/sim/demography/populationReadPort.js';
import { manageCommittedWorlds, beginCompleteStep, publishCompleteStep, disposeCommittedWorlds } from '../src/inkbox/presentation/readView/committedStore.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const self = fileURLToPath(import.meta.url);
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const summary = values => ({ p50: percentile(values, .5), p95: percentile(values, .95), max: Math.max(...values), samples: values });
const worker = arg('sample');

async function measure(age, arm, round, index) {
  const { saved, file, sha256, bytes } = loadCheckpoint(age);
  const api = await nativeApi(root);
  const c = api.restore(saved);
  const world = c.world;
  setPopulationUiReadMode(world, arm === 'audit-rebuild-per-publication' ? 'audit' : 'legacy');
  if (globalThis.gc) globalThis.gc();
  const before = process.memoryUsage();
  const cpuStart = process.cpuUsage();
  const started = performance.now();
  const initial = manageCommittedWorlds(world);
  const phaseSamples = [];
  for (let step = 0; step < 10; step += 1) {
    const pre = process.memoryUsage();
    const stepStart = performance.now();
    beginCompleteStep(world);
    api.advance(c, 3);
    const committed = publishCompleteStep(world);
    const post = process.memoryUsage();
    phaseSamples.push({ step, day: world.day, wallMs: performance.now() - stepStart,
      heapUsedBefore: pre.heapUsed, heapUsedAfter: post.heapUsed, rssBefore: pre.rss, rssAfter: post.rss,
      sequence: committed.commitSequence });
  }
  const elapsedMs = performance.now() - started;
  const cpu = process.cpuUsage(cpuStart);
  const after = process.memoryUsage();
  const maxRssKiB = process.resourceUsage().maxRSS;
  const captured = JSON.stringify(api.capture(c));
  const stateHash = digest(captured);
  assert.equal(initial.commitSequence, 0);
  assert.equal(phaseSamples.at(-1).sequence, 10);
  setPopulationUiReadMode(world, 'legacy');
  disposeCommittedWorlds(world);
  return { age, arm, round, index, input: { file, sha256, bytes }, wallMs: elapsedMs,
    cpuMs: (cpu.user + cpu.system) / 1000, heapUsedBefore: before.heapUsed,
    heapUsedAfter: after.heapUsed, heapUsedHighWaterSampled: Math.max(before.heapUsed, ...phaseSamples.map(row => row.heapUsedAfter)),
    rssBefore: before.rss, rssAfter: after.rss, rssHighWaterKiB: maxRssKiB,
    phaseSamples, stateHash, serializedBytes: Buffer.byteLength(captured),
    populationCensusRebuilds: arm === 'audit-rebuild-per-publication' ? 11 : 0,
    rebuildCountBasis: 'one capturePopulationCards census during initial commit plus one per each of ten complete-step publications; legacy mode does not capture population cards' };
}

if (worker) {
  const [ageText, arm, roundText, indexText] = worker.split(',');
  process.stdout.write(JSON.stringify(await measure(Number(ageText), arm, Number(roundText), Number(indexText))));
} else {
  assert.equal(process.versions.node.split('.')[0], '24', 'Run this diagnostic under Node 24');
  assert(globalThis.gc, 'Run with --expose-gc so each clean child can start after an explicit full GC');
  const out = path.resolve(root, arg('output') ?? 'reports/mlod0b/audit-cost-node24.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const report = { schema: 'mlod0b-audit-cost-v1', createdAt: new Date().toISOString(),
    environment: { node: process.version, cpu: os.cpus()[0]?.model, platform: process.platform, isolatedChildPerSample: true },
    protocol: { sequence: 'ABBA', rounds: 5, days: 30, dt: 3,
      arms: ['legacy-no-census', 'audit-rebuild-per-publication'],
      boundary: 'timing starts before initial committed-session publication and ends after ten 3-day committed publications; clean child per arm sample; output is independent of perf.json' }, cases: [] };
  for (const age of [100, 400]) {
    const item = { age, samples: [] };
    report.cases.push(item);
    for (let round = 0; round < 5; round += 1) {
      const arms = ['legacy-no-census', 'audit-rebuild-per-publication'];
      for (const [index, arm] of [arms[0], arms[1], arms[1], arms[0]].entries()) {
        const child = spawnSync(process.execPath, ['--expose-gc', self, `--sample=${age},${arm},${round},${index}`],
          { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
        if (child.status !== 0) throw new Error(`sample failed (${age}y ${arm} round ${round}): ${child.stderr || child.stdout}`);
        item.samples.push(JSON.parse(child.stdout));
        fs.writeFileSync(out, JSON.stringify(report, null, 2));
        console.log(`${age}y ${arm} r${round} ${JSON.parse(child.stdout).cpuMs.toFixed(1)} CPU ms`);
      }
    }
    assert.equal(new Set(item.samples.map(row => row.stateHash)).size, 1, 'audit publication changed the world or RNG state');
    item.summary = Object.fromEntries(['legacy-no-census', 'audit-rebuild-per-publication'].map(arm => {
      const rows = item.samples.filter(row => row.arm === arm);
      const deltas = rows.map(row => ({ cpuMs: row.cpuMs, heapUsedSampledDelta: row.heapUsedHighWaterSampled - row.heapUsedBefore,
        rssMaxDelta: row.rssHighWaterKiB * 1024 - row.rssBefore,
        publishCpuProxyMs: row.cpuMs / (arm === 'audit-rebuild-per-publication' ? 11 : 1) }));
      return [arm, { wallMs: summary(rows.map(row => row.wallMs)), cpuMs: summary(rows.map(row => row.cpuMs)),
        heapUsedSampledDeltaBytes: summary(deltas.map(row => row.heapUsedSampledDelta)),
        rssMaxDeltaBytes: summary(deltas.map(row => row.rssMaxDelta)),
        stepP95Ms: summary(rows.flatMap(row => row.phaseSamples.map(step => step.wallMs))),
        rebuildsPerTrial: rows[0].populationCensusRebuilds }];
    }));
    const legacy = item.summary['legacy-no-census'], audit = item.summary['audit-rebuild-per-publication'];
    item.auditOverLegacy = { cpuMsP50: audit.cpuMs.p50 - legacy.cpuMs.p50,
      heapUsedSampledDeltaBytesP50: audit.heapUsedSampledDeltaBytes.p50 - legacy.heapUsedSampledDeltaBytes.p50,
      rssMaxDeltaBytesP50: audit.rssMaxDeltaBytes.p50 - legacy.rssMaxDeltaBytes.p50 };
  }
  report.pass = true;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`wrote ${path.relative(root, out)}`);
}
