#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { World } from '../src/inkbox/world/World.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { SEA_LEVEL } from '../src/inkbox/core/config.js';
import { prepareStaticSea, stepHydrologyStaticSea } from '../src/inkbox/sim/hydrologyStaticSea.js';
import { recomputeRect, flushDirty } from '../src/inkbox/world/terrain.js';
import { notifyTerrainMutation, prepareConnectedOcean, stepHydrologyConnectedOcean, oceanCacheInfo } from '../research/g4-p1c/oceanHydrologyPrototype.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, 'reports/analysis/g4/g4-p1c/evidence/performance.json');
const SIZES = [{ w: 200, h: 128 }, { w: 288, h: 180 }, { w: 512, h: 320 }];
const SEEDS = [173, 73519, 912037];
const TICK_SAMPLES = 8, WARMUP_TICKS = 5, SOAK_TICKS = 16, EVENT_ROUNDS = 3;
const INDEX = (w, x, y) => y * w.w + x;
const now = () => performance.now();

function cloneWorld(source) {
  const target = new World(source.w, source.h, source.seed);
  for (const name of ['height', 'water', 'temp', 'moist', 'veg', 'fire', 'flow', 'riverBase', 'qi',
    'type', 'over', 'struct', 'owner']) target[name].set(source[name]);
  for (const name of ['generation', 'day']) if (Object.hasOwn(source, name)) target[name] = structuredClone(source[name]);
  return target;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return +sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)].toFixed(3);
}
function summarize(values, unit = 'Ms') {
  return { samples: values.map(x => +x.toFixed(3)), count: values.length,
    [`median${unit}`]: percentile(values, 0.5), [`p95${unit}`]: percentile(values, 0.95),
    [`max${unit}`]: percentile(values, 1) };
}

function prepare(engine, world) {
  if (engine === 'V3') return prepareStaticSea(world);
  return prepareConnectedOcean(world);
}
function step(engine, world) {
  if (engine === 'V3') return stepHydrologyStaticSea(world, 4);
  return stepHydrologyConnectedOcean(world, 4);
}

function profileEngine(base, engine) {
  const world = cloneWorld(base);
  const prepStart = now();
  const prepResult = prepare(engine, world);
  const prepareWallMs = now() - prepStart;
  for (let i = 0; i < WARMUP_TICKS; i += 1) step(engine, world);
  const singleTick = [];
  const soakStart = now();
  let rebuildEvents = 0;
  for (let i = 0; i < TICK_SAMPLES; i += 1) {
    const start = now(), metrics = step(engine, world), elapsed = now() - start;
    singleTick.push(elapsed);
    if (engine === 'P1C' && metrics.topologyPending) rebuildEvents += 1;
    if (engine === 'P1C' && metrics.maskRebuildCount > 1) {
      const info = oceanCacheInfo(world);
      rebuildEvents = Math.max(rebuildEvents, info.rebuildCount - 1);
    }
  }
  for (let i = 0; i < SOAK_TICKS - TICK_SAMPLES; i += 1) {
    const metrics = step(engine, world);
    if (engine === 'P1C' && metrics.maskRebuildCount > 1) rebuildEvents = Math.max(rebuildEvents, metrics.maskRebuildCount - 1);
  }
  const soakWallMs = now() - soakStart;
  const cache = engine === 'P1C' ? oceanCacheInfo(world) : null;
  const v3ScratchBytes = engine === 'V3' ? ['_staticSeaWaterDelta', '_staticSeaErosionDelta', '_staticSeaThermalDelta']
    .reduce((n, key) => n + (world[key]?.byteLength ?? 0), 0) : null;
  return { engine, prepareWallMs: +prepareWallMs.toFixed(3),
    initialMaskBuildMs: engine === 'P1C' ? +prepResult.rebuildMs.toFixed(3) : null,
    singleTick: summarize(singleTick), soakTicks: SOAK_TICKS, soakWallMs: +soakWallMs.toFixed(3),
    maskRebuildEventsDuringSimulation: engine === 'P1C' ? cache.rebuildCount - 1 : null,
    latestMaskRebuildMs: engine === 'P1C' ? +cache.lastRebuildMs.toFixed(3) : null,
    cachedMaskQueueDeltaBytes: engine === 'P1C' ? cache.cachedBytes : null,
    existingV3DeltaBufferBytes: v3ScratchBytes,
    seaCellsAtStart: engine === 'P1C' ? prepResult.oceanCells : null };
}

function profileTopologyEvent(base, seed, size) {
  const world = cloneWorld(base);
  const y = Math.floor(world.h / 2), gateX = Math.floor(world.w / 2), endX = gateX + 2;
  const line = [];
  for (let x = 0; x <= endX; x += 1) line.push(INDEX(world, x, y));
  for (const i of line) world.height[i] = SEA_LEVEL - 0.05;
  const gate = INDEX(world, gateX, y);
  world.height[gate] = SEA_LEVEL + 0.01;
  recomputeRect(world, 0, y, endX, y);
  flushDirty(world);
  prepareConnectedOcean(world);
  const gateBeforeOpen = world.height[gate];
  const openBefore = new Map([[gate, gateBeforeOpen]]);
  world.height[gate] = SEA_LEVEL - 0.05;
  recomputeRect(world, gateX, y, gateX, y);
  flushDirty(world);
  const openNotice = notifyTerrainMutation(world, openBefore, 'bench-open-gate');
  const openStart = now(), openMetrics = stepHydrologyConnectedOcean(world, 4), openWallMs = now() - openStart;

  const inlandCell = INDEX(world, gateX + 1, y), waterBeforeDam = world.water[inlandCell];
  const closeBefore = new Map([[gate, world.height[gate]]]);
  world.height[gate] = SEA_LEVEL + 0.01;
  recomputeRect(world, gateX, y, gateX, y);
  flushDirty(world);
  const closeNotice = notifyTerrainMutation(world, closeBefore, 'bench-close-gate');
  const closeStart = now(), closeMetrics = stepHydrologyConnectedOcean(world, 4), closeWallMs = now() - closeStart;
  return { size, seed, openedCells: line.length, gate, openNotice, closeNotice,
    open: { wallMs: +openWallMs.toFixed(3), floodFillMs: +openMetrics.maskRebuiltMs.toFixed(3),
      rebuildCount: openMetrics.maskRebuildCount, normalizedCells: openMetrics.normalizedCells },
    dam: { wallMs: +closeWallMs.toFixed(3), floodFillMs: +closeMetrics.maskRebuiltMs.toFixed(3),
      rebuildCount: closeMetrics.maskRebuildCount, retainedInlandWaterBefore: waterBeforeDam,
      retainedInlandWaterAfter: world.water[inlandCell] } };
}

const evidence = { schemaVersion: 1, task: 'Inkbox-G4-P1C-Luna-海陆连通性原型', status: 'RUNNING',
  fixedBaseline: 'f4c05d825467217a95b3c2f9f271e97e9f2b357d',
  machine: { node: process.version, platform: process.platform, arch: process.arch,
    osRelease: os.release(), cpu: os.cpus()[0]?.model ?? 'unknown', logicalCpus: os.cpus().length },
  method: { timer: 'node:perf_hooks performance.now', gpuPerformanceClaim: false,
    warmupTicks: WARMUP_TICKS, measuredSingleTicks: TICK_SAMPLES, sustainedTicks: SOAK_TICKS,
    topologyEventRoundsPerSize: EVENT_ROUNDS, seeds: SEEDS, sizes: SIZES,
    generation: 'src/inkbox/world/worldgen.js generateWorld, generationVersion=2, terrainPreset=standard, scatter=false' },
  byWorld: [], summaryBySize: [], topologyEvents: [] };

for (const size of SIZES) for (const seed of SEEDS) {
  const generationStart = now();
  const base = generateWorld({ preset: size, seed, scatter: false, generationVersion: 2, terrainPreset: 'standard' });
  const generationMs = now() - generationStart;
  const v3 = profileEngine(base, 'V3');
  const p1c = profileEngine(base, 'P1C');
  const record = { size, seed, generationMs: +generationMs.toFixed(3), cells: base.size, v3, p1c };
  evidence.byWorld.push(record);
  evidence.topologyEvents.push(profileTopologyEvent(base, seed, size));
  console.log(JSON.stringify({ size, seed, v3MedianTickMs: v3.singleTick.medianMs,
    p1cMedianTickMs: p1c.singleTick.medianMs, p1cBuildMs: p1c.initialMaskBuildMs,
    p1cRebuilds: p1c.maskRebuildEventsDuringSimulation }));
}

for (const size of SIZES) {
  const rows = evidence.byWorld.filter(item => item.size.w === size.w && item.size.h === size.h);
  evidence.summaryBySize.push({ size, seeds: rows.map(row => row.seed),
    v3SingleTickMs: summarize(rows.flatMap(row => row.v3.singleTick.samples)),
    p1cSingleTickMs: summarize(rows.flatMap(row => row.p1c.singleTick.samples)),
    v3SixteenTickSoakMs: summarize(rows.map(row => row.v3.soakWallMs)),
    p1cSixteenTickSoakMs: summarize(rows.map(row => row.p1c.soakWallMs)),
    p1cInitialMaskBuildMs: summarize(rows.map(row => row.p1c.initialMaskBuildMs)),
    p1cCachedBytes: summarize(rows.map(row => row.p1c.cachedMaskQueueDeltaBytes), 'Bytes'),
    v3ExistingDeltaBufferBytes: summarize(rows.map(row => row.v3.existingV3DeltaBufferBytes), 'Bytes'),
    p1cRebuildEventsAcrossRuns: rows.reduce((n, row) => n + row.p1c.maskRebuildEventsDuringSimulation, 0) });
}
evidence.status = 'PASS';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ status: evidence.status, evidence: path.relative(ROOT, OUT),
  worlds: evidence.byWorld.length, topologyEventRounds: evidence.topologyEvents.length }));
