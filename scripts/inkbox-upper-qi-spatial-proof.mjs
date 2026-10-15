#!/usr/bin/env node
// Read-only evidence for Upper-world qi and the existing local spatial sampler.
// All movement comes from the ordinary fixed NETHER_STYLE_A recipe; this script
// observes only annual endpoints and never selects targets or consumes RNG itself.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { serialize as v8Serialize } from 'node:v8';
import { createScenarioSandbox, applyC2CRecipe, C2C_RECIPES } from './inkbox-c2c-browser-fixtures.mjs';
import { isUpperMortal } from '../src/inkbox/sim/upperLife.js';
import { upperWalkable } from '../src/inkbox/world/planes.js';

// The fixed recipe yields to rAF every 100 normal simulation steps. In headless
// Node, preserve that scheduling seam with a zero-render cooperative yield.
globalThis.requestAnimationFrame ||= (callback) => setImmediate(() => callback(Date.now()));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'reports/local/m2c2c/upper-qi');
const YEARS = 60;
const DAYS_PER_YEAR = 360;
const STEP_DAYS = 3;
const CHUNK_STEPS = DAYS_PER_YEAR / STEP_DAYS;
const PROBE_DAYS = new Set([360, 4320, 8640, 12960, 17280, 21600]);
const scriptPath = fileURLToPath(import.meta.url);
const upperLifePath = path.join(ROOT, 'src/inkbox/sim/upperLife.js');
const planesPath = path.join(ROOT, 'src/inkbox/world/planes.js');
const visualScenariosPath = path.join(ROOT, 'src/inkbox/render3d/art/VisualScenarios.js');
const recipePath = path.join(ROOT, 'scripts/inkbox-c2c-browser-fixtures.mjs');
const advancePath = path.join(ROOT, 'src/inkbox/sim/advance.js');
const shaBuffer = (buffer) => createHash('sha256').update(buffer).digest('hex');
const objectSha = (value) => shaBuffer(v8Serialize(value));

function quantile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))];
}
function summarize(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, min: null, p10: null, p25: null, p50: null, p75: null, p90: null, max: null, mean: null, qiExactlyOne: 0, qiExactlyOneShare: null };
  const saturated = sorted.filter((value) => value === 1).length;
  return { count: sorted.length,
    min: sorted[0], p10: quantile(sorted, 0.1), p25: quantile(sorted, 0.25), p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75), p90: quantile(sorted, 0.9), max: sorted.at(-1),
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    qiExactlyOne: saturated, qiExactlyOneShare: saturated / sorted.length };
}
function rank(sorted, value) {
  if (!sorted.length || !Number.isFinite(value)) return null;
  let low = 0, high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (sorted[middle] <= value) low = middle + 1; else high = middle;
  }
  return low / sorted.length;
}
function upperEntityType(entity) {
  if (isUpperMortal(entity)) return 'mortal';
  if ((entity.level || 0) > 0) return 'cultivator';
  return 'otherNonMortal';
}
function cellQi(upper, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= upper.w || cy >= upper.h) return null;
  const index = cy * upper.w + cx;
  return { value: upper.qi[index], walkable: upperWalkable(upper, index), index, x: cx, y: cy };
}
function nearbyWalkableQi(upper, entity, type) {
  const radius = Math.round(14 * (type === 'mortal' ? 1 : 1.5));
  const cx = Math.floor(entity.x), cy = Math.floor(entity.y), values = [];
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    if (y < 0 || y >= upper.h) continue;
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (x < 0 || x >= upper.w) continue;
      const index = y * upper.w + x;
      if (upperWalkable(upper, index)) values.push(upper.qi[index]);
    }
  }
  return { radius, values };
}
function newGroup() { return { currentQi: [], currentWalkableQi: [], currentRank: [], targetQi: [], targetWalkableQi: [], targetRank: [],
  targetMinusCurrent: [], nearbyMaxMinusCurrent: [], targetDistance: [], invalidPositionCount: 0, invalidTargetCount: 0,
  validNearbyCellCount: 0, sampleEntities: 0, saturationCount: 0 }; }
function add(group, entity, current, target, nearby, globalWalkableQi) {
  group.sampleEntities += 1;
  if (!current) { group.invalidPositionCount += 1; return; }
  group.currentQi.push(current.value);
  if (current.walkable) group.currentWalkableQi.push(current.value);
  group.currentRank.push(rank(globalWalkableQi, current.value));
  if (current.value === 1) group.saturationCount += 1;
  if (!target) { group.invalidTargetCount += 1; return; }
  group.targetQi.push(target.value);
  if (target.walkable) group.targetWalkableQi.push(target.value);
  group.targetRank.push(rank(globalWalkableQi, target.value));
  group.targetMinusCurrent.push(target.value - current.value);
  group.targetDistance.push(Math.hypot(entity.tx - entity.x, entity.ty - entity.y));
  if (nearby.values.length) {
    group.validNearbyCellCount += nearby.values.length;
    const bestNearby = Math.max(...nearby.values);
    group.nearbyMaxMinusCurrent.push(bestNearby - current.value);
  }
}
function summarizeGroup(group) {
  return { sampleEntities: group.sampleEntities, invalidPositions: group.invalidPositionCount, invalidTargets: group.invalidTargetCount,
    currentQi: summarize(group.currentQi), currentWalkableQi: summarize(group.currentWalkableQi),
    currentPercentileInGlobalWalkableQi: summarize(group.currentRank),
    targetQi: summarize(group.targetQi), targetWalkableQi: summarize(group.targetWalkableQi),
    targetPercentileInGlobalWalkableQi: summarize(group.targetRank),
    targetMinusCurrentQi: summarize(group.targetMinusCurrent), targetDistance: summarize(group.targetDistance),
    nearbyWalkableCandidateCellsObserved: group.validNearbyCellCount,
    nearbyMaxMinusCurrentQi: summarize(group.nearbyMaxMinusCurrent),
    currentEntityQiExactlyOne: group.saturationCount,
    currentEntityQiExactlyOneShare: group.currentQi.length ? group.saturationCount / group.currentQi.length : null };
}
function compactQuantiles(row) {
  return { count: row.count, p10: row.p10, p25: row.p25, p50: row.p50, p75: row.p75, p90: row.p90,
    max: row.max, mean: row.mean, qiExactlyOne: row.qiExactlyOne, qiExactlyOneShare: row.qiExactlyOneShare };
}
function compactGroup(row) {
  return { sampleEntities: row.sampleEntities, invalidPositions: row.invalidPositions, invalidTargets: row.invalidTargets,
    currentQi: compactQuantiles(row.currentQi), currentWalkableQi: compactQuantiles(row.currentWalkableQi),
    currentPercentileInGlobalWalkableQi: { p50: row.currentPercentileInGlobalWalkableQi.p50, p90: row.currentPercentileInGlobalWalkableQi.p90 },
    targetQi: compactQuantiles(row.targetQi), targetWalkableQi: { count: row.targetWalkableQi.count, qiExactlyOneShare: row.targetWalkableQi.qiExactlyOneShare },
    targetPercentileInGlobalWalkableQi: { p50: row.targetPercentileInGlobalWalkableQi.p50, p90: row.targetPercentileInGlobalWalkableQi.p90 },
    targetMinusCurrentQi: { count: row.targetMinusCurrentQi.count, p50: row.targetMinusCurrentQi.p50, mean: row.targetMinusCurrentQi.mean },
    targetDistance: { p50: row.targetDistance.p50, p90: row.targetDistance.p90 },
    nearbyWalkableCandidateCellsObserved: row.nearbyWalkableCandidateCellsObserved,
    nearbyMaxMinusCurrentQi: { p50: row.nearbyMaxMinusCurrentQi.p50, mean: row.nearbyMaxMinusCurrentQi.mean },
    currentEntityQiExactlyOneShare: row.currentEntityQiExactlyOneShare };
}
function trendQuantiles(row) {
  return { count: row.count, p10: row.p10, p50: row.p50, p90: row.p90, max: row.max,
    mean: row.mean, qiExactlyOneShare: row.qiExactlyOneShare };
}
function trendGroup(row) {
  return { sampleEntities: row.sampleEntities,
    currentQi: trendQuantiles(row.currentQi), currentWalkableQi: trendQuantiles(row.currentWalkableQi),
    currentWalkableShare: row.currentWalkableQi.count / Math.max(1, row.currentQi.count),
    currentGlobalWalkableRankP50: row.currentPercentileInGlobalWalkableQi.p50,
    targetQi: trendQuantiles(row.targetQi), targetWalkableShare: row.targetWalkableQi.count / Math.max(1, row.targetQi.count),
    targetGlobalWalkableRankP50: row.targetPercentileInGlobalWalkableQi.p50,
    targetMinusCurrentQi: { p50: row.targetMinusCurrentQi.p50, mean: row.targetMinusCurrentQi.mean },
    nearbyMaxMinusCurrentQi: { p50: row.nearbyMaxMinusCurrentQi.p50, mean: row.nearbyMaxMinusCurrentQi.mean },
    targetDistanceP50: row.targetDistance.p50,
    currentQiExactlyOneShare: row.currentEntityQiExactlyOneShare };
}
function readSnapshot(world) {
  const upper = world.upper;
  const walkableIndices = [];
  const walkableQi = [];
  for (let index = 0; index < upper.size; index += 1) {
    if (!upperWalkable(upper, index)) continue;
    walkableIndices.push(index);
    walkableQi.push(upper.qi[index]);
  }
  const walkableQiSorted = walkableQi.slice().sort((a, b) => a - b);
  const groups = { all: newGroup(), cultivator: newGroup(), mortal: newGroup(), otherNonMortal: newGroup() };
  const entities = [];
  for (const entity of upper.entities || []) {
    if (!Number.isFinite(entity.id) || !Number.isFinite(entity.x) || !Number.isFinite(entity.y)) continue;
    const type = upperEntityType(entity);
    const current = cellQi(upper, entity.x, entity.y);
    const target = cellQi(upper, entity.tx, entity.ty);
    const nearby = nearbyWalkableQi(upper, entity, type);
    entities.push({ id: entity.id, type, x: entity.x, y: entity.y, tx: entity.tx, ty: entity.ty,
      currentQi: current?.value ?? null, currentWalkable: current?.walkable ?? false,
      targetQi: target?.value ?? null, targetWalkable: target?.walkable ?? false });
    add(groups.all, entity, current, target, nearby, walkableQiSorted);
    add(groups[type], entity, current, target, nearby, walkableQiSorted);
  }
  const qiOneWalkable = walkableQi.filter((value) => value === 1).length;
  return { day: world.day, year: world.year, upper: { w: upper.w, h: upper.h, seed: upper.seed },
    walkable: { cells: walkableIndices.length, shareOfGrid: walkableIndices.length / upper.size,
      qi: summarize(walkableQi), qiExactlyOne: qiOneWalkable, qiExactlyOneShare: qiOneWalkable / Math.max(1, walkableQi.length) },
    population: { entityCount: entities.length, mortalCount: groups.mortal.sampleEntities,
      cultivatorCount: groups.cultivator.sampleEntities, otherNonMortalCount: groups.otherNonMortal.sampleEntities,
      summaries: Object.fromEntries(Object.entries(groups).map(([key, group]) => [key, summarizeGroup(group)])) },
    entities };
}
function aggregateDistributionRows(rows) {
  const distributions = {};
  for (const row of rows) for (const [groupName, summary] of Object.entries(row.population.summaries)) {
    const out = distributions[groupName] ||= { observations: 0, currentQi: [], currentRank: [], targetQi: [],
      targetRank: [], targetMinusCurrent: [], nearbyMaxMinusCurrent: [], endpointDistance: [], currentAtOne: 0,
      currentWalkable: 0, targetWalkable: 0, sampledEntities: 0 };
    out.observations += summary.sampleEntities;
    out.sampledEntities += summary.sampleEntities;
    out.currentAtOne += summary.currentEntityQiExactlyOne;
    out.currentWalkable += summary.currentWalkableQi.count;
    out.targetWalkable += summary.targetWalkableQi.count;
    // Aggregate checkpoint quantiles separately; do not pretend their quantiles combine into entity-level raw values.
    out.targetMinusCurrent.push(summary.targetMinusCurrentQi.mean);
    out.nearbyMaxMinusCurrent.push(summary.nearbyMaxMinusCurrentQi.mean);
  }
  for (const group of Object.values(distributions)) {
    group.checkpointMeans = { targetMinusCurrentQi: summarize(group.targetMinusCurrent.filter(Number.isFinite)),
      nearbyMaxMinusCurrentQi: summarize(group.nearbyMaxMinusCurrent.filter(Number.isFinite)) };
    delete group.currentQi; delete group.currentRank; delete group.targetQi; delete group.targetRank;
    delete group.targetMinusCurrent; delete group.nearbyMaxMinusCurrent; delete group.endpointDistance;
  }
  return distributions;
}

const sandbox = createScenarioSandbox();
const recipe = C2C_RECIPES.find((item) => item.key === 'realms');
if (!recipe || recipe.scenario !== 'NETHER_STYLE_A') throw new Error('Expected the fixed NETHER_STYLE_A realm recipe.');
const snapshots = [];
const purity = [];
let chunks = 0;
const recipeInfo = await applyC2CRecipe(sandbox, { ...recipe, netherChunkSteps: CHUNK_STEPS }, {
  onChunk: ({ completedSteps, totalSteps, worldDay }) => {
    chunks += 1;
    if (worldDay !== snapshots.length * DAYS_PER_YEAR + DAYS_PER_YEAR) throw new Error(`Unexpected annual sample day ${worldDay}`);
    const probe = PROBE_DAYS.has(worldDay);
    const beforeWorld = probe ? objectSha(sandbox.world) : null;
    const beforeAdvance = probe ? objectSha(sandbox.advanceState) : null;
    const snapshot = readSnapshot(sandbox.world);
    const afterWorld = probe ? objectSha(sandbox.world) : null;
    const afterAdvance = probe ? objectSha(sandbox.advanceState) : null;
    if (probe) {
      const passed = beforeWorld === afterWorld && beforeAdvance === afterAdvance;
      purity.push({ day: worldDay, worldShaBefore: beforeWorld, worldShaAfter: afterWorld,
        advanceStateShaBefore: beforeAdvance, advanceStateShaAfter: afterAdvance, passed });
      if (!passed) throw new Error(`Read-only sampler changed World or advanceState at day ${worldDay}`);
    }
    snapshots.push(snapshot);
    if (completedSteps !== chunks * CHUNK_STEPS || worldDay !== chunks * DAYS_PER_YEAR) throw new Error('Unexpected recipe chunk cadence.');
    console.log(`Upper qi sample ${snapshot.year}/${YEARS} years · entities=${snapshot.population.entityCount} · walkable=${snapshot.walkable.cells}`);
  },
});
if (snapshots.length !== YEARS || sandbox.world.day !== YEARS * DAYS_PER_YEAR) throw new Error('Fixed 60-year recipe did not produce 60 annual samples.');

const trajectories = new Map();
for (const row of snapshots) for (const entity of row.entities) {
  let track = trajectories.get(entity.id);
  if (!track) {
    track = { id: entity.id, type: entity.type, samples: 0, first: { x: entity.x, y: entity.y, day: row.day },
      previous: { x: entity.x, y: entity.y, tx: entity.tx, ty: entity.ty, day: row.day },
      final: { x: entity.x, y: entity.y, tx: entity.tx, ty: entity.ty, day: row.day },
      endpointTravel: 0, targetChangeObservations: 0, targetDistanceSamples: [], currentQiSamples: [],
      targetQiSamples: [], targetMinusCurrentSamples: [], currentWalkableSamples: 0, targetWalkableSamples: 0 };
    trajectories.set(entity.id, track);
  }
  const previous = track.previous;
  if (track.samples > 0) {
    track.endpointTravel += Math.hypot(entity.x - previous.x, entity.y - previous.y);
    if (Number.isFinite(entity.tx) && Number.isFinite(entity.ty) && Number.isFinite(previous.tx) && Number.isFinite(previous.ty)
      && (Math.abs(entity.tx - previous.tx) > 0.01 || Math.abs(entity.ty - previous.ty) > 0.01)) track.targetChangeObservations += 1;
  }
  if (Number.isFinite(entity.currentQi)) track.currentQiSamples.push(entity.currentQi);
  if (Number.isFinite(entity.targetQi)) track.targetQiSamples.push(entity.targetQi);
  if (Number.isFinite(entity.currentQi) && Number.isFinite(entity.targetQi)) track.targetMinusCurrentSamples.push(entity.targetQi - entity.currentQi);
  if (entity.currentWalkable) track.currentWalkableSamples += 1;
  if (entity.targetWalkable) track.targetWalkableSamples += 1;
  if (Number.isFinite(entity.tx) && Number.isFinite(entity.ty)) track.targetDistanceSamples.push(Math.hypot(entity.tx - entity.x, entity.ty - entity.y));
  track.samples += 1;
  track.previous = { x: entity.x, y: entity.y, tx: entity.tx, ty: entity.ty, day: row.day };
  track.final = { x: entity.x, y: entity.y, tx: entity.tx, ty: entity.ty, day: row.day };
}
const perEntity = [...trajectories.values()].map((track) => ({
  id: track.id, type: track.type, sampledYearsPresent: track.samples,
  firstPosition: { x: track.first.x, y: track.first.y, day: track.first.day },
  finalPosition: { x: track.final.x, y: track.final.y, day: track.final.day },
  netDisplacement: Number(Math.hypot(track.final.x - track.first.x, track.final.y - track.first.y).toFixed(4)),
  sampledEndpointTravel: Number(track.endpointTravel.toFixed(4)),
  observedAnnualTargetChanges: track.targetChangeObservations,
  currentQi: summarize(track.currentQiSamples), targetQi: summarize(track.targetQiSamples),
  targetMinusCurrentQi: summarize(track.targetMinusCurrentSamples),
  currentWalkableShare: track.currentWalkableSamples / Math.max(1, track.samples),
  targetWalkableShare: track.targetWalkableSamples / Math.max(1, track.samples),
  targetDistance: summarize(track.targetDistanceSamples),
}));

const byYear = snapshots.map((snapshot) => ({ day: snapshot.day, year: snapshot.year,
  walkable: { cells: snapshot.walkable.cells, shareOfGrid: snapshot.walkable.shareOfGrid,
    qi: trendQuantiles(snapshot.walkable.qi), qiExactlyOne: snapshot.walkable.qiExactlyOne,
    qiExactlyOneShare: snapshot.walkable.qiExactlyOneShare },
  population: { entityCount: snapshot.population.entityCount, mortalCount: snapshot.population.mortalCount,
    cultivatorCount: snapshot.population.cultivatorCount, otherNonMortalCount: snapshot.population.otherNonMortalCount,
    summaries: Object.fromEntries(Object.entries(snapshot.population.summaries).map(([key, value]) => [key, trendGroup(value)])) } }));
const finalRow = byYear.at(-1);
const sourceHashes = Object.fromEntries([[scriptPath, 'script'], [upperLifePath, 'upperLife'], [planesPath, 'planes'],
  [visualScenariosPath, 'VisualScenarios'], [recipePath, 'C2C recipe helper'], [advancePath, 'advanceWorld']]
  .map(([file, name]) => [name, { path: path.relative(ROOT, file).replaceAll(path.sep, '/'), sha256: shaBuffer(fs.readFileSync(file)) }]));
const probePassed = purity.length >= 5 && purity.every((item) => item.passed);
const allTracks = perEntity;
const meanEntityMetric = (key) => allTracks.length ? allTracks.reduce((sum, item) => sum + item[key], 0) / allTracks.length : null;
const currentSaturation = finalRow.population.summaries.all.currentQiExactlyOneShare;
const targetSaturation = finalRow.population.summaries.all.targetQi.qiExactlyOneShare;
const localTargetDelta = finalRow.population.summaries.all.targetMinusCurrentQi;
const spatialInterpretation = `At year 60, ${(finalRow.walkable.qiExactlyOneShare * 100).toFixed(1)}% of walkable cells have qi exactly 1; all ${finalRow.population.cultivatorCount} observed Upper entities are cultivators and ${((currentSaturation || 0) * 100).toFixed(1)}% of their current cells and ${((targetSaturation || 0) * 100).toFixed(1)}% of stored targets also saturate at 1. Median target-minus-current qi is ${localTargetDelta.p50?.toFixed(4) ?? 'unavailable'} (mean ${localTargetDelta.mean?.toFixed(4) ?? 'unavailable'}); median movement from first to last annual sample is ${quantile(allTracks.map((row) => row.netDisplacement).sort((a, b) => a - b), 0.5)?.toFixed(2) ?? 'unavailable'} tiles. This is compatible with local qi-biased target choice, but saturation, local-only candidates, and one seed prevent a claim of global concentration or monotonic attraction.`;
const result = {
  schema: 'inkbox-upper-qi-spatial-proof-v1',
  method: {
    recipe: { scenario: recipeInfo.scenario, seed: recipeInfo.seed, preset: recipeInfo.preset,
      simulationDays: recipeInfo.days, stepDays: STEP_DAYS, completedSteps: recipeInfo.completedSteps,
      complete: recipeInfo.complete, worldDay: recipeInfo.worldDay, coverage: recipeInfo.coverage,
      rngRecipe: recipeInfo.rngRecipe, chunks: chunks, sampledEveryDays: DAYS_PER_YEAR, years: YEARS,
      source: 'createScenarioSandbox() + applyC2CRecipe(realms/NETHER_STYLE_A)',
      generation: 'normal generateWorld/generateUpperWorld/generateNetherWorld + greetOnBoot from shared fixed sandbox RNG',
      advancement: 'normal advanceWorld via recipe sandbox, stepDays=3, fresh createAdvanceState()',
      rng: 'simulation receives only normal recipe-owned RNG; sampler receives no RNG handle and does not call advanceWorld/UpperLife target selection' },
    sampling: { readOnly: true, checkpoints: snapshots.length, periodDays: DAYS_PER_YEAR,
      endpointMovement: 'Annual position endpoints only; summed chords between samples, not a reconstructed route. No interpolation or pathfinding.',
      localFeasibleNeighborhood: 'Read every upperWalkable cell in the square around current position using the source-defined mortal radius 14 / cultivator radius 21; this is not the 24 random candidate draw and is not a path search.',
      targetInterpretation: 'tx/ty is the currently stored local wander target, not a promise to reach it or evidence of global destination selection.',
      ownershipAndRendering: 'No rendering, World writes, or presentation toggles are used.' },
    purity: { probes: purity.length, passed: probePassed,
      assertion: 'At six selected annual checkpoints, V8 SHA-256 of the complete live World object and advanceState is byte-identical before/after readSnapshot.',
      hiddenRng: 'UpperLife spatialRng is an inaccessible closure-backed function state and is not serialized; purity follows structurally because readSnapshot has no RNG reference/call and probes occur synchronously between normal advance chunks.',
      checkpoints: purity },
    sourceHashes,
    sourceSymbols: [
      { symbol: 'UpperLife.spatialRng', source: 'sim/upperLife.js constructor; derived from upper.seed ^ UPPER_SPATIAL_SEED_KEY' },
      { symbol: 'UpperLife.stepSpatial', source: 'sim/upperLife.js; called during normal UpperLife.step after the other systems' },
      { symbol: 'UpperLife.pickSpatialTarget', source: 'sim/upperLife.js; 24 local candidate attempts; requires upperWalkable' },
      { symbol: 'upperWalkable', source: 'world/planes.js; height >= SEA_LEVEL && water <= 0.0015' },
      { symbol: 'UPPER_WANDER_RADIUS', source: 'sim/upperLife.js; 14 mortal tiles, 21 cultivator tiles via the 1.5 multiplier' },
    ],
  },
  summary: {
    seed: recipeInfo.seed, preset: recipeInfo.preset, finalDay: sandbox.world.day, stepDays: STEP_DAYS,
    annualSamples: snapshots.length, entityIdsObserved: perEntity.length,
    entityPersonYears: perEntity.reduce((sum, item) => sum + item.sampledYearsPresent, 0),
    firstYear: byYear[0] ? { day: byYear[0].day, walkableQi: byYear[0].walkable.qi, population: byYear[0].population } : null,
    finalYear: byYear.at(-1) ? { day: byYear.at(-1).day, walkableQi: byYear.at(-1).walkable.qi, population: byYear.at(-1).population } : null,
    purityProbes: purity.length, purityPassed: probePassed,
    movement: Object.fromEntries(['all', 'cultivator', 'mortal', 'otherNonMortal'].map((type) => {
      const rows = type === 'all' ? perEntity : perEntity.filter((entity) => entity.type === type);
      return [type, { uniqueEntityIds: rows.length,
        meanNetDisplacementFromFirst: rows.length ? rows.reduce((s, row) => s + row.netDisplacement, 0) / rows.length : null,
        meanSampledEndpointTravel: rows.length ? rows.reduce((s, row) => s + row.sampledEndpointTravel, 0) / rows.length : null,
        totalObservedAnnualTargetChanges: rows.reduce((s, row) => s + row.observedAnnualTargetChanges, 0) }];
    })),
    interpretation: spatialInterpretation,
    perEntityMeans: { meanNetDisplacement: meanEntityMetric('netDisplacement'), meanSampledEndpointTravel: meanEntityMetric('sampledEndpointTravel') },
    epochMeanTargetMinusCurrentQi: Object.fromEntries(['all', 'cultivator', 'mortal'].map((key) => {
      const values = byYear.map((row) => row.population.summaries[key].targetMinusCurrentQi.mean).filter(Number.isFinite);
      return [key, summarize(values)];
    })),
    evidenceLimits: [
      'Annual snapshots miss intermediate movement, retargeting, and within-year qi exposure; endpoint travel is a lower-bound chord sum, not route length.',
      'Current target and local feasible-neighborhood qi only support a claim about local target bias; they do not imply global attraction, monotonic convergence, or whole-map pathfinding.',
      'Exact qi==1 share is reported explicitly because saturation can hide variation among high qi cells.',
    ],
  },
  byYear,
  perEntity,
  distributionMeansByCheckpoint: aggregateDistributionRows(snapshots),
};
if (!probePassed) throw new Error('Fewer than five successful read-only purity probes.');
fs.mkdirSync(OUT, { recursive: true });
const outFile = path.join(OUT, 'upper-qi-spatial-proof.json');
const json = `${JSON.stringify(result)}\n`;
if (Buffer.byteLength(json, 'utf8') > 256 * 1024) throw new Error(`Output exceeds 256 KiB (${Buffer.byteLength(json)} bytes).`);
fs.writeFileSync(outFile, json, 'utf8');
console.log(JSON.stringify({ output: outFile, bytes: Buffer.byteLength(json), outputSha256: shaBuffer(Buffer.from(json)),
  scriptSha256: sourceHashes.script.sha256, seed: result.summary.seed, preset: recipeInfo.preset,
  finalDay: sandbox.world.day, years: sandbox.world.year, samples: snapshots.length,
  entityIdsObserved: perEntity.length, entityPersonYears: result.summary.entityPersonYears,
  walkableQi: byYear.at(-1).walkable.qi, groups: byYear.at(-1).population.summaries,
  movement: result.summary.movement, purityProbes: purity.length, purityPassed: probePassed }, null, 2));
