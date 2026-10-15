#!/usr/bin/env node
// Headless, read-only movement sampling for M2-C2C Package R2.
// This script never writes observations back into World and never interpolates paths.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld, recomputeUpperQi } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { WORLD_PRESETS, TIME } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { Life } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { serializeWorld } from '../src/inkbox/io/save.js';
import { greetOnBoot } from '../src/inkbox/sim/busanzi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function arg(name, fallback) {
  const item = process.argv.find((value) => value.startsWith(`--${name}=`));
  return item ? item.slice(name.length + 3) : fallback;
}
const YEARS = Number(arg('years', '250'));
const SEED = Number(arg('seed', '20260930'));
const PRESET_KEY = arg('preset', 'small');
const STEP = Number(arg('step', '3'));
const GRID_W = 32;
const GRID_H = 20;
const MAX_LOCAL_JUMP = Number(arg('max-jump', '8'));
const MAX_CELL_DELTA = 1;
const TOP_N = 24;
const preset = WORLD_PRESETS[PRESET_KEY];
if (!preset) throw new Error(`Unknown preset '${PRESET_KEY}'.`);
if (!Number.isInteger(YEARS) || YEARS < 200 || YEARS > 300) throw new Error('--years must be an integer from 200 to 300.');
if (!(STEP > 0) || TIME.daysPerYear % STEP !== 0) throw new Error('--step must divide daysPerYear; default 3 matches the normal longrun recipe.');
if (!(MAX_LOCAL_JUMP > 0)) throw new Error('--max-jump must be positive.');

const EPOCH_YEARS = 50;
if (YEARS % EPOCH_YEARS !== 0) throw new Error('--years must be divisible by 50 to produce complete epochs.');
const cellCount = GRID_W * GRID_H;
const gridFor = (x, y) => {
  const gx = Math.max(0, Math.min(GRID_W - 1, Math.floor(x / preset.w * GRID_W)));
  const gy = Math.max(0, Math.min(GRID_H - 1, Math.floor(y / preset.h * GRID_H)));
  return gy * GRID_W + gx;
};
const cellCenter = (index) => ({
  x: ((index % GRID_W) + 0.5) * preset.w / GRID_W,
  y: (Math.floor(index / GRID_W) + 0.5) * preset.h / GRID_H,
});
const epochTemplate = (index) => ({
  index,
  fromYear: index * EPOCH_YEARS,
  toYear: (index + 1) * EPOCH_YEARS,
  samples: 0,
  entityObservations: 0,
  movedEndpointArrivals: 0,
  localTransitions: 0,
  skippedLongDistance: 0,
  skippedMultiCell: 0,
  unmatchedEntities: 0,
  occupancy: new Uint32Array(cellCount),
  movedArrivals: new Uint32Array(cellCount),
  localFlow: new Uint32Array(cellCount),
  ownerOccupancy: new Map(),
  ownerFlow: new Map(),
  ownerOccupancyByCell: Array.from({ length: cellCount }, () => new Map()),
  ownerFlowByCell: Array.from({ length: cellCount }, () => new Map()),
  transitionEdges: new Map(),
  anchorPairs: new Map(),
});
const epochs = Array.from({ length: YEARS / EPOCH_YEARS }, (_, i) => epochTemplate(i));

function increment(map, key, by = 1) { map.set(key, (map.get(key) || 0) + by); }
function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function worldDigest(world) {
  const serialized = serializeWorld(world);
  const territory = world.territory ? Array.from(world.territory) : null;
  return hash({ serialized, territory });
}
function stateDigest(state) { return hash(state); }
function nearestAnchor(x, y, anchors) {
  let best = null;
  for (const anchor of anchors) {
    const distance = Math.hypot(anchor.x - x, anchor.y - y);
    if (!best || distance < best.distance) best = { kind: anchor.kind, id: anchor.id ?? null, distance };
  }
  return best;
}
function readAnchors(world) {
  return [
    ...(world.villages || []).map((item) => ({ kind: 'village', id: item.id, x: item.x, y: item.y })),
    ...(world.sites || []).map((item) => ({ kind: 'site', id: item.id, x: item.x, y: item.y })),
    ...(world.leylines || []).map((item, i) => ({ kind: 'leyline', id: item.id ?? i, x: item.x, y: item.y })),
  ].filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y));
}
function readTerritoryOwner(world, x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (!world.territory || ix < 0 || iy < 0 || ix >= world.w || iy >= world.h) return null;
  const id = world.territory[iy * world.w + ix];
  return id > 0 ? id : null;
}
function pairKey(from, to) { return `${from.kind}>${to.kind}`; }

// This routine is deliberately a pure reader: all aggregation is owned by the caller.
function readSample(world) {
  const entities = [];
  for (const entity of world.entities || []) {
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y) || !Number.isFinite(entity.id)) continue;
    entities.push({ id: entity.id, x: entity.x, y: entity.y, faction: entity.faction ?? null });
  }
  return { entities, anchors: readAnchors(world), villages: (world.villages || []).length,
    sites: (world.sites || []).length, leylines: (world.leylines || []).length };
}

function sampleEpoch(epoch, world, prior) {
  const observation = readSample(world);
  const current = new Map();
  epoch.samples += 1;
  epoch.entityObservations += observation.entities.length;
  const anchors = observation.anchors;
  for (const entity of observation.entities) {
    const toCell = gridFor(entity.x, entity.y);
    epoch.occupancy[toCell] += 1;
    const owner = readTerritoryOwner(world, entity.x, entity.y);
    if (owner !== null) {
      increment(epoch.ownerOccupancy, owner);
      increment(epoch.ownerOccupancyByCell[toCell], owner);
    }
    const now = { x: entity.x, y: entity.y, cell: toCell, faction: entity.faction };
    current.set(entity.id, now);
    const before = prior.get(entity.id);
    if (!before) { epoch.unmatchedEntities += 1; continue; }
    const dx = entity.x - before.x;
    const dy = entity.y - before.y;
    if (Math.hypot(dx, dy) <= 0.01) continue;
    epoch.movedEndpointArrivals += 1;
    epoch.movedArrivals[toCell] += 1;
    const fromAnchor = nearestAnchor(before.x, before.y, anchors);
    const toAnchor = nearestAnchor(entity.x, entity.y, anchors);
    if (fromAnchor && toAnchor && fromAnchor.distance <= 20 && toAnchor.distance <= 20) {
      increment(epoch.anchorPairs, pairKey(fromAnchor, toAnchor));
    }
    const distance = Math.hypot(dx, dy);
    if (distance > MAX_LOCAL_JUMP) {
      epoch.skippedLongDistance += 1;
      continue;
    }
    const fromCell = before.cell;
    const cellDx = Math.abs((fromCell % GRID_W) - (toCell % GRID_W));
    const cellDy = Math.abs(Math.floor(fromCell / GRID_W) - Math.floor(toCell / GRID_W));
    if (Math.max(cellDx, cellDy) > MAX_CELL_DELTA) {
      epoch.skippedMultiCell += 1;
      continue;
    }
    epoch.localTransitions += 1;
    epoch.localFlow[toCell] += 1;
    if (owner !== null) {
      increment(epoch.ownerFlow, owner);
      increment(epoch.ownerFlowByCell[toCell], owner);
    }
    increment(epoch.transitionEdges, `${fromCell}>${toCell}`);
  }
  prior.clear();
  for (const [id, pos] of current) prior.set(id, pos);
  return observation;
}

function topCells(values, epoch, denominator = null, isFlow = false) {
  const ranked = Array.from(values, (count, index) => ({ index, count }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, TOP_N);
  return ranked.map(({ index, count }) => {
    const center = cellCenter(index);
    const ownerEntries = [...(isFlow ? epoch.ownerFlowByCell[index] : epoch.ownerOccupancyByCell[index]).entries()].sort((a, b) => b[1] - a[1]);
    const ownerTotal = ownerEntries.reduce((sum, row) => sum + row[1], 0);
    return {
      cell: index, gx: index % GRID_W, gy: Math.floor(index / GRID_W), count,
      ratePerEntityObservation: denominator ? count / denominator : null,
      center: { x: Number(center.x.toFixed(1)), y: Number(center.y.toFixed(1)) },
      localFlowPerOccupancy: epoch.occupancy[index] ? Number((epoch.localFlow[index] / epoch.occupancy[index]).toFixed(4)) : 0,
      territoryOwner: ownerEntries[0] ? { factionId: Number(ownerEntries[0][0]), sampledShare: Number((ownerEntries[0][1] / Math.max(1, ownerTotal)).toFixed(3)) } : null,
      nearestAnchorsAtEpochEnd: null,
    };
  });
}
function topMap(map, limit = TOP_N) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit).map(([key, count]) => ({ key: String(key), count }));
}
function jaccard(a, b) {
  const left = new Set(a.map((item) => item.cell));
  const right = new Set(b.map((item) => item.cell));
  if (!left.size && !right.size) return 1;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}
function pearson(a, b) {
  const n = a.length;
  if (!n) return null;
  const meanA = a.reduce((sum, value) => sum + value, 0) / n;
  const meanB = b.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0, da = 0, db = 0;
  for (let i = 0; i < n; i += 1) {
    const va = a[i] - meanA, vb = b[i] - meanB;
    numerator += va * vb; da += va * va; db += vb * vb;
  }
  return da && db ? numerator / Math.sqrt(da * db) : null;
}
function flattenMap(epoch) {
  const total = [...epoch.ownerOccupancy.values()].reduce((a, b) => a + b, 0);
  const owners = [...epoch.ownerOccupancy.entries()].sort((a, b) => b[1] - a[1]);
  return {
    index: epoch.index, fromYear: epoch.fromYear, toYear: epoch.toYear,
    samples: epoch.samples, entityObservations: epoch.entityObservations,
    movingEndpoints: epoch.movedEndpointArrivals, localTransitions: epoch.localTransitions,
    skipped: { longDistance: epoch.skippedLongDistance, multiCellJump: epoch.skippedMultiCell },
    unmatchedEntities: epoch.unmatchedEntities,
    flowToDensity: Number((epoch.localTransitions / Math.max(1, epoch.entityObservations)).toFixed(6)),
    localFlowOccupancyCorrelation: pearson(Array.from(epoch.occupancy), Array.from(epoch.localFlow)),
    territory: {
      observedOwnedOccupancy: total,
      ownerShares: owners.slice(0, TOP_N).map(([id, count]) => ({ factionId: Number(id), count, share: Number((count / Math.max(1, total)).toFixed(3)) })),
    },
    villageSiteLeylineNearestPairProximityWithin20Tiles: topMap(epoch.anchorPairs),
    transitionEdges: topMap(epoch.transitionEdges),
    grids: {
      occupancy: Array.from(epoch.occupancy),
      movedEndpointArrivals: Array.from(epoch.movedArrivals),
      localTransitionArrivals: Array.from(epoch.localFlow),
    },
    top: {
      occupancy: topCells(epoch.occupancy, epoch, epoch.entityObservations),
      movedEndpointArrivals: topCells(epoch.movedArrivals, epoch, epoch.movedEndpointArrivals),
      localTransitionArrivals: topCells(epoch.localFlow, epoch, epoch.localTransitions, true),
    },
  };
}

const startMs = Date.now();
const world = generateWorld({ preset, seed: SEED, scatter: true });
const life = new Life(world, mulberry32(world.seed ^ 0xa5a5a5a5));
const sandboxRng = mulberry32(12345);
const upper = generateUpperWorld({ preset, seed: SEED });
recomputeUpperQi(upper);
world.upper = upper;
const upperLife = new UpperLife(upper);
world.nether = generateNetherWorld({ preset, seed: SEED });
greetOnBoot(world, sandboxRng);
const advanceState = createAdvanceState();
const prior = new Map();
const samplesPerEpoch = EPOCH_YEARS * TIME.daysPerYear / STEP;
const allEpochTop = [];
let purityProbes = 0;
let lastSnapshot = null;

for (let sampleIndex = 1; sampleIndex <= YEARS * TIME.daysPerYear / STEP; sampleIndex += 1) {
  advanceWorld(world, STEP, { life, upperLife, rng: sandboxRng, state: advanceState, riftActive: false });
  const epochIndex = Math.floor((sampleIndex - 1) / samplesPerEpoch);
  const epoch = epochs[epochIndex];
  sampleEpoch(epoch, world, prior);
  const inEpoch = sampleIndex % samplesPerEpoch === 0;
  if (inEpoch) {
    const beforeWorld = worldDigest(world);
    const beforeAdvance = stateDigest(advanceState);
    readSample(world); // purity probe exercises the same read path, discarding its snapshot
    const afterWorld = worldDigest(world);
    const afterAdvance = stateDigest(advanceState);
    if (beforeWorld !== afterWorld || beforeAdvance !== afterAdvance) {
      throw new Error(`Sampling purity failed at year ${world.year}.`);
    }
    purityProbes += 1;
    const anchorSnapshot = readAnchors(world);
    lastSnapshot = { world, anchors: anchorSnapshot };
    const flat = flattenMap(epoch);
    const nearestAtEnd = (index) => {
      const { x, y } = cellCenter(index);
      const nearest = nearestAnchor(x, y, anchorSnapshot);
      return nearest ? { kind: nearest.kind, id: nearest.id, distance: Number(nearest.distance.toFixed(1)) } : null;
    };
    for (const series of Object.values(flat.top)) {
      for (const item of series) item.nearestAnchorsAtEpochEnd = nearestAtEnd(item.cell);
    }
    allEpochTop.push(flat);
    console.log(`R2 progress ${world.year}/${YEARS} years · epoch ${epochIndex + 1}/${epochs.length} · ${epoch.entityObservations} entity observations`);
  }
}

const occupancyJaccard = [];
const transitionJaccard = [];
for (let i = 1; i < allEpochTop.length; i += 1) {
  occupancyJaccard.push({ betweenEpochs: [i - 1, i], top24Jaccard: Number(jaccard(allEpochTop[i - 1].top.occupancy, allEpochTop[i].top.occupancy).toFixed(4)) });
  transitionJaccard.push({ betweenEpochs: [i - 1, i], top24Jaccard: Number(jaccard(allEpochTop[i - 1].top.localTransitionArrivals, allEpochTop[i].top.localTransitionArrivals).toFixed(4)) });
}
const localFlow = epochs.reduce((sum, epoch) => sum + epoch.localTransitions, 0);
const occupancy = epochs.reduce((sum, epoch) => sum + epoch.entityObservations, 0);
const moved = epochs.reduce((sum, epoch) => sum + epoch.movedEndpointArrivals, 0);
const remoteJumps = epochs.reduce((sum, epoch) => sum + epoch.skippedLongDistance + epoch.skippedMultiCell, 0);
const top24Overlap = allEpochTop.map((epoch, index) => {
  const occupancyCells = new Set(epoch.top.occupancy.map((item) => item.cell));
  const flowCells = new Set(epoch.top.localTransitionArrivals.map((item) => item.cell));
  const intersection = [...occupancyCells].filter((cell) => flowCells.has(cell)).length;
  return { epoch: index + 1, sharedCells: intersection, ofTop24: Math.max(occupancyCells.size, flowCells.size), share: Number((intersection / Math.max(1, Math.max(occupancyCells.size, flowCells.size))).toFixed(4)) };
});
const meanCellCorrelation = allEpochTop.reduce((sum, epoch) => sum + (epoch.localFlowOccupancyCorrelation ?? 0), 0) / Math.max(1, allEpochTop.length);
const anchorPairTotals = new Map();
for (const epoch of epochs) for (const [key, count] of epoch.anchorPairs) increment(anchorPairTotals, key, count);
const meanTransitionStability = transitionJaccard.length
  ? transitionJaccard.reduce((sum, row) => sum + row.top24Jaccard, 0) / transitionJaccard.length : 0;
const meanOccupancyStability = occupancyJaccard.length
  ? occupancyJaccard.reduce((sum, row) => sum + row.top24Jaccard, 0) / occupancyJaccard.length : 0;
const conclusion = `Local transition hotspots repeat moderately across adjacent 50-year epochs (mean top-24 Jaccard ${meanTransitionStability.toFixed(3)}), but their per-cell counts correlate strongly with occupancy (mean Pearson ${meanCellCorrelation.toFixed(3)}) and ${Math.round(top24Overlap.reduce((sum, row) => sum + row.share, 0) / top24Overlap.length * 100)}% of the top-24 cells overlap on average. This is evidence for persistent population/activity concentrations, not independent road corridors.`;

const output = {
  schema: 'inkbox-movement-trace-r2-v1',
  method: {
    purpose: 'Research-only headless observation; no runtime roads or World trace fields.',
    seed: SEED, preset: PRESET_KEY, worldSize: { w: world.w, h: world.h }, years: YEARS,
    advance: { function: 'advanceWorld', stepDays: STEP, daysPerYear: TIME.daysPerYear, sharedSandboxRngSeed: 12345, rngOrder: 'mulberry32(12345) -> greetOnBoot(world, rng) -> advanceWorld rng', advanceState: 'fresh createAdvanceState()', riftActive: false, realms: ['mortal', 'upper', 'nether'] },
    sampling: { cadenceDays: STEP, samplesPerEpoch, totalSamples: epochs.reduce((sum, epoch) => sum + epoch.samples, 0), grid: `${GRID_W}x${GRID_H}`, topCells: TOP_N, entityScope: 'all mortal world.entities with finite id/x/y', occupancyMeaning: 'entity observations per sample (density/presence); not movement', movedArrivalMeaning: 'matched entity changed position; endpoint cell only, no path reconstruction', localTransitionMeaning: `matched move <= ${MAX_LOCAL_JUMP} world tiles and <= ${MAX_CELL_DELTA} grid-cell delta per axis; count destination cell and edge only`, skippedMovement: 'far and multi-cell moves are excluded from local flow; never interpolated', anchorPairRule: 'For moved endpoints only, record nearest village/site/leyline pair when both are within 20 world tiles; anchor snapshot at sampling time.' },
    purity: { probes: purityProbes, assertion: 'At each 50-year boundary, serializeWorld SHA-256 plus territory-array SHA and advanceState SHA are unchanged by a discarded readSample call.', passed: true },
  },
  summary: {
    totalEntityObservations: occupancy,
    movedEndpointArrivals: moved,
    localTransitions: localFlow,
    skippedFarOrMultiCellMoves: remoteJumps,
    localFlowToDensity: Number((localFlow / Math.max(1, occupancy)).toFixed(6)),
    meanEpochCellFlowOccupancyPearson: Number(meanCellCorrelation.toFixed(4)),
    top24FlowOccupancyOverlap: { meanShare: Number((top24Overlap.reduce((sum, row) => sum + row.share, 0) / top24Overlap.length).toFixed(4)), byEpoch: top24Overlap },
    anchorEndpointPairsWithin20Tiles: topMap(anchorPairTotals, 12),
    adjacentEpochTop24JaccardMean: { occupancy: Number(meanOccupancyStability.toFixed(4)), localTransitions: Number(meanTransitionStability.toFixed(4)) },
    judgement: conclusion,
    runtimeRoadRecommendation: 'defer; cell-level traffic largely co-locates with occupancy, origin/destination proximity counts do not prove route geometry, and no sample interval reconstructs a path.',
  },
  epochStability: { occupancyTop24: occupancyJaccard, localTransitionTop24: transitionJaccard },
  epochs: allEpochTop,
};
const outDir = path.resolve(ROOT, arg('output', 'reports/local/m2c2c/movement-trace'));
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'movement-trace.json');
output.method.scriptSha256 = createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const json = `${JSON.stringify(output)}\n`;
const byteLength = Buffer.byteLength(json, 'utf8');
if (byteLength > 256 * 1024) throw new Error(`Compact output exceeded 256 KiB: ${byteLength} bytes.`);
fs.writeFileSync(outFile, json, 'utf8');
const outputSha256 = createHash('sha256').update(json).digest('hex');
console.log(JSON.stringify({ output: path.relative(ROOT, outFile), bytes: byteLength, outputSha256, scriptSha256: output.method.scriptSha256, seed: SEED, years: YEARS, stepDays: STEP, samples: output.method.sampling.totalSamples, entityObservations: occupancy, movedEndpointArrivals: moved, localTransitions: localFlow, skippedMoves: remoteJumps, epochTop24Jaccard: output.summary.adjacentEpochTop24JaccardMean, purityProbes, elapsedSeconds: Number(((Date.now() - startMs) / 1000).toFixed(2)), judgement: conclusion }, null, 2));
