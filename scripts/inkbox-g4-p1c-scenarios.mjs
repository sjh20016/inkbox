#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { World } from '../src/inkbox/world/World.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { SEA_LEVEL, TERRAIN } from '../src/inkbox/core/config.js';
import { History, sculpt, addWater, removeWater } from '../src/inkbox/sim/powers.js';
import { prepareStaticSea, stepHydrologyStaticSea } from '../src/inkbox/sim/hydrologyStaticSea.js';
import { stepHydrology } from '../src/inkbox/sim/hydrology.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { createMapProgress, expandMap } from '../src/inkbox/world/mapProgress.js';
import { recomputeAll, recomputeRect, flushDirty } from '../src/inkbox/world/terrain.js';
import {
  CONNECTED_OCEAN_RULE, notifyTerrainMutation, prepareConnectedOcean,
  stepHydrologyConnectedOcean, snapshotOceanMask, oceanCacheInfo,
} from '../research/g4-p1c/oceanHydrologyPrototype.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, 'reports/analysis/g4/g4-p1c/evidence/scenarios.json');
const LAYERS = ['height', 'water', 'temp', 'moist', 'veg', 'fire', 'riverBase', 'type', 'qi', 'over', 'struct', 'owner'];
const sha = value => createHash('sha256').update(value).digest('hex');
const layerHash = world => Object.fromEntries(LAYERS.map(name => [name,
  sha(Buffer.from(world[name].buffer, world[name].byteOffset, world[name].byteLength))]));
const idx = (world, x, y) => y * world.w + x;
const coord = (world, i) => ({ x: i % world.w, y: Math.floor(i / world.w) });
const seaCount = (world, mask) => {
  let n = 0;
  for (let i = 0; i < world.size; i += 1) if (mask[i]) n += 1;
  return n;
};
const inlandSubseaCount = (world, mask) => {
  let n = 0;
  for (let i = 0; i < world.size; i += 1) if (!mask[i] && world.height[i] < SEA_LEVEL) n += 1;
  return n;
};

function makeTerrain(w = 15, h = 13, fill = 0.66) {
  const world = new World(w, h, 917);
  world.height.fill(fill);
  world.water.fill(0);
  world.temp.fill(0.5);
  world.riverBase.fill(0);
  recomputeAll(world);
  flushDirty(world);
  return world;
}

function makeCanalWorld() {
  const world = makeTerrain();
  // One below-sea boundary source and a low corridor ending at a one-cell sill.
  world.height[idx(world, 0, 6)] = SEA_LEVEL - 0.08;
  for (let x = 1; x <= 6; x += 1) world.height[idx(world, x, 6)] = SEA_LEVEL - 0.06;
  world.height[idx(world, 7, 6)] = SEA_LEVEL + 0.01;
  world.height[idx(world, 8, 6)] = SEA_LEVEL - 0.12;
  recomputeAll(world);
  flushDirty(world);
  return world;
}

function diagnostic(world, mask, index, eventSequence) {
  const { x, y } = coord(world, index);
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]].flatMap(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) return [];
    const ni = idx(world, nx, ny);
    return [{ index: ni, x: nx, y: ny, height: world.height[ni], water: world.water[ni], ocean: !!mask[ni] }];
  });
  return { firstError: { index, x, y, height: world.height[index], water: world.water[index],
    ocean: !!mask[index], neighbors, eventSequence } };
}

function expectOcean(world, index, expected, eventSequence) {
  const mask = snapshotOceanMask(world);
  if (!!mask[index] !== expected) {
    const error = new Error(`ocean classification at ${index}: expected ${expected}, received ${!!mask[index]}`);
    error.firstDifference = diagnostic(world, mask, index, eventSequence);
    throw error;
  }
  return mask;
}

function mutateTerrain(world, cells, mutate, reason) {
  const before = new Map(cells.map(i => [i, world.height[i]]));
  mutate();
  const xs = cells.map(i => i % world.w), ys = cells.map(i => Math.floor(i / world.w));
  recomputeRect(world, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  flushDirty(world);
  return notifyTerrainMutation(world, before, reason);
}

function cloneWorld(source) {
  const target = new World(source.w, source.h, source.seed);
  for (const name of LAYERS) target[name].set(source[name]);
  for (const name of ['day', 'generation', 'hydrologyRules', 'mapProgress']) {
    if (Object.hasOwn(source, name)) target[name] = structuredClone(source[name]);
  }
  if (source.plane) target.plane = source.plane;
  return target;
}

const result = {
  schemaVersion: 1,
  task: 'Inkbox-G4-P1C-Luna-海陆连通性原型',
  status: 'RUNNING',
  fixedBaseline: 'f4c05d825467217a95b3c2f9f271e97e9f2b357d',
  rule: CONNECTED_OCEAN_RULE,
  seaLevel: SEA_LEVEL,
  runtime: { node: process.version, platform: process.platform, arch: process.arch, release: os.release() },
  groups: {},
};

async function group(name, run) {
  try {
    const detail = await run();
    result.groups[name] = { status: 'PASS', ...detail };
    console.log(JSON.stringify({ group: name, status: 'PASS' }));
  } catch (error) {
    result.groups[name] = { status: 'FAIL', error: error.message,
      firstDifference: error.firstDifference ?? null, stack: error.stack };
    result.status = 'FAIL';
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
    console.error(JSON.stringify({ group: name, status: 'FAIL', error: error.message,
      firstDifference: error.firstDifference ?? null }));
    throw error;
  }
}

await group('boundary-ocean-and-no-ocean', () => {
  const open = makeCanalWorld();
  const preparedOpen = prepareConnectedOcean(open);
  const openMask = snapshotOceanMask(open);
  assert.ok(preparedOpen.oceanCells > 0);
  assert.equal(openMask[idx(open, 0, 6)], 1);
  assert.equal(openMask[idx(open, 6, 6)], 1);
  assert.equal(openMask[idx(open, 8, 6)], 0);
  assert.equal(open.water[idx(open, 8, 6)], 0, 'closed basin receives no sea refill at prepare');

  const closed = makeTerrain(15, 13, 0.66);
  closed.height[idx(closed, 7, 6)] = SEA_LEVEL - 0.1;
  recomputeAll(closed);
  flushDirty(closed);
  const preparedClosed = prepareConnectedOcean(closed);
  const closedMask = snapshotOceanMask(closed);
  assert.equal(preparedClosed.oceanCells, 0, 'a map with no below-sea boundary has no ocean source');
  assert.equal(closedMask[idx(closed, 7, 6)], 0);
  for (let n = 0; n < 12; n += 1) stepHydrologyConnectedOcean(closed, 4);
  assert.equal(closed.water[idx(closed, 7, 6)], 0, 'dry closed low basin stays dry without inflow');

  const diagonal = makeTerrain(5, 5, 0.66);
  diagonal.height[idx(diagonal, 0, 0)] = SEA_LEVEL - 0.05;
  diagonal.height[idx(diagonal, 1, 1)] = SEA_LEVEL - 0.05;
  recomputeAll(diagonal);
  flushDirty(diagonal);
  prepareConnectedOcean(diagonal);
  const diagonalMask = snapshotOceanMask(diagonal);
  assert.equal(diagonalMask[idx(diagonal, 0, 0)], 1);
  assert.equal(diagonalMask[idx(diagonal, 1, 1)], 0, 'diagonal contact does not connect under four-neighbor semantics');
  return { openOceanCells: preparedOpen.oceanCells, noOceanCells: preparedClosed.oceanCells,
    closedBasinWaterAfter12Ticks: closed.water[idx(closed, 7, 6)], diagonalNeighborsConnect: false,
    connectivity: 'four-neighbor; boundary cells strictly below SEA_LEVEL seed the ocean' };
});

await group('canal-dam-pump-inject-and-river', () => {
  const world = makeCanalWorld();
  prepareConnectedOcean(world);
  const gate = idx(world, 7, 6), basin = idx(world, 8, 6);
  expectOcean(world, basin, false, ['create:closed-sill']);
  const openEvent = mutateTerrain(world, [gate], () => { world.height[gate] = SEA_LEVEL - 0.03; }, 'canal-open');
  assert.equal(openEvent.seaLevelCrossings, 1);
  assert.equal(expectOcean(world, basin, false, ['canal-open:awaiting-next-hydrology-tick'])[basin], 0,
    'event notification is cached until the next hydrology boundary');
  const opened = stepHydrologyConnectedOcean(world, 4);
  let mask = expectOcean(world, basin, true, ['canal-open', 'hydrology-tick']);
  assert.equal(world.water[basin], Math.fround(SEA_LEVEL - world.height[basin]));
  assert.ok(opened.normalizedCells > 0);

  const waterBeforeDam = world.water[basin];
  const closedEvent = mutateTerrain(world, [gate], () => { world.height[gate] = SEA_LEVEL + 0.01; }, 'dam-close');
  assert.equal(closedEvent.seaLevelCrossings, 1);
  const closedTick = stepHydrologyConnectedOcean(world, 4);
  mask = expectOcean(world, basin, false, ['dam-close', 'hydrology-tick']);
  assert.ok(world.water[basin] > 0, 'disconnecting a basin does not clear its stored water');
  assert.ok(world.water[basin] >= waterBeforeDam - 0.003, 'only normal flow/evaporation changes residual water on the first tick');

  const history = new History();
  const beforePump = world.water[basin];
  history.begin(); removeWater(world, 8.5, 6.5, 1, 0.05, history); history.end('P1C pump test');
  const afterPump = world.water[basin];
  history.begin(); addWater(world, 8.5, 6.5, 1, 0.08, history); history.end('P1C inject test');
  const afterInject = world.water[basin];
  assert.ok(afterPump < beforePump);
  assert.ok(afterInject > afterPump);
  const afterToolsMask = snapshotOceanMask(world);
  assert.equal(afterToolsMask[basin], 0, 'water-only tools do not invalidate ocean topology');

  const river = makeCanalWorld();
  const riverCell = idx(river, 8, 6);
  prepareConnectedOcean(river);
  river.riverBase[riverCell] = 0.06;
  stepHydrologyConnectedOcean(river, 4);
  assert.ok(river.water[riverCell] >= 0.059, 'existing riverBase naturally supplies an inland low basin');
  return { gate, basin, openEvent, openNormalized: opened.normalizedCells,
    damReclassification: { oceanAfter: false, waterBefore: waterBeforeDam, waterAfter: world.water[basin],
      topologyPending: closedTick.topologyPending },
    tools: { afterPump, afterInject, classificationUnchanged: afterToolsMask[basin] === 0 },
    riverBase: river.riverBase[riverCell], riverWaterAfterTick: river.water[riverCell] };
});

await group('real-brush-undo-and-event-cache', () => {
  const world = makeCanalWorld();
  prepareConnectedOcean(world);
  const gate = idx(world, 7, 6), basin = idx(world, 8, 6), history = new History();
  history.begin();
  sculpt(world, 7.5, 6.5, 1, -0.04, history);
  history.end('dig one-cell channel');
  const entry = history.stack.at(-1);
  const previousForDig = new Map([...entry.changes].map(([i, saved]) => [i, saved.h]));
  const dig = notifyTerrainMutation(world, previousForDig, 'brush-dig');
  assert.equal(dig.seaLevelCrossings, 1);
  const firstTick = stepHydrologyConnectedOcean(world, 4);
  expectOcean(world, basin, true, ['brush-dig', 'next-hydrology-tick']);
  assert.equal(firstTick.maskRebuildCount, 2);

  const previousForUndo = new Map([...entry.changes].map(([i]) => [i, world.height[i]]));
  assert.equal(history.undo(world), 'dig one-cell channel');
  const undo = notifyTerrainMutation(world, previousForUndo, 'brush-undo');
  assert.equal(undo.seaLevelCrossings, 1);
  stepHydrologyConnectedOcean(world, 4);
  expectOcean(world, basin, false, ['brush-undo', 'next-hydrology-tick']);
  const afterBrush = oceanCacheInfo(world);
  assert.equal(afterBrush.rebuildCount, 3);

  const noEdit = makeTerrain(40, 30, 0.66);
  noEdit.height[idx(noEdit, 20, 15)] = SEA_LEVEL - 0.1;
  prepareConnectedOcean(noEdit);
  const rebuildCount = oceanCacheInfo(noEdit).rebuildCount;
  for (let n = 0; n < 40; n += 1) stepHydrologyConnectedOcean(noEdit, 4);
  assert.equal(oceanCacheInfo(noEdit).rebuildCount, rebuildCount,
    'unchanged topology does not run another full flood fill on each tick');
  return { brush: { dig, undo, finalOceanBasin: false },
    cache: { rebuildsAfterEditAndUndo: afterBrush.rebuildCount, rebuildsAfter40UnchangedTicks: oceanCacheInfo(noEdit).rebuildCount,
      ticksWithoutEdit: 40 } };
});

await group('automatic-erosion-topology-transition', () => {
  const world = makeTerrain(15, 13, 0.66);
  world.height[idx(world, 0, 6)] = SEA_LEVEL - 0.08;
  for (let x = 1; x <= 4; x += 1) world.height[idx(world, x, 6)] = SEA_LEVEL - 0.06;
  const gate = idx(world, 5, 6), basin = idx(world, 6, 6);
  world.height[gate] = SEA_LEVEL + 0.0001;
  world.height[idx(world, 5, 5)] = SEA_LEVEL + 0.04;
  world.height[idx(world, 5, 7)] = SEA_LEVEL + 0.04;
  world.height[basin] = SEA_LEVEL - 0.1;
  world.water[gate] = 0.32;
  recomputeAll(world);
  flushDirty(world);
  prepareConnectedOcean(world);
  expectOcean(world, basin, false, ['created:erosion-sill-high']);
  const beforeHeight = world.height[gate];
  const first = stepHydrologyConnectedOcean(world, 4);
  const afterErosion = world.height[gate];
  assert.ok(afterErosion < SEA_LEVEL, `erosion should cut sill below sea level: ${beforeHeight} -> ${afterErosion}`);
  assert.equal(first.topologyPending, true, 'erosion crossing invalidates the mask after this tick');
  assert.equal(snapshotOceanMask(world)[basin], 0, 'the erosion change is not applied mid-tick');
  const second = stepHydrologyConnectedOcean(world, 4);
  expectOcean(world, basin, true, ['erosion-crossing-at-tick-1', 'rebuild-at-tick-2']);
  assert.ok(second.normalizedCells > 0);
  return { gate, basin, beforeHeight, afterFirstTick: afterErosion,
    firstTick: { topologyPending: first.topologyPending, rebuilds: first.maskRebuildCount },
    secondTick: { topologyPending: second.topologyPending, rebuilds: second.maskRebuildCount,
      normalizedCells: second.normalizedCells } };
});

await group('inland-evaporation-refreshes-terrain-type', () => {
  const world = makeTerrain(15, 13, 0.66), cell = idx(world, 7, 6);
  world.height[cell] = SEA_LEVEL - 0.08;
  world.water[cell] = 0.002;
  recomputeAll(world);
  flushDirty(world);
  const beforeType = world.type[cell], beforeWater = world.water[cell];
  assert.equal(beforeType, TERRAIN.SHALLOW);
  prepareConnectedOcean(world);
  const metrics = stepHydrologyConnectedOcean(world, 4);
  assert.ok(world.water[cell] < beforeWater, 'isolated basin water evaporates');
  assert.equal(world.type[cell], TERRAIN.SAND, 'drying below the water threshold refreshes the derived terrain type');
  return { cell, beforeWater, afterWater: world.water[cell],
    beforeType, afterType: world.type[cell], evaporationDirtyWasFlushed: true, metrics };
});

await group('natural-map-v3-comparison-determinism-and-rebuild', () => {
  const generated = generateWorld({ preset: { w: 128, h: 80 }, seed: 73519,
    scatter: false, generationVersion: 2, terrainPreset: 'standard' });
  const v3 = cloneWorld(generated), p1c = cloneWorld(generated);
  prepareStaticSea(v3);
  const preparedP1c = prepareConnectedOcean(p1c);
  const p1cInitialMask = snapshotOceanMask(p1c);
  const naturalInlandSubsea = inlandSubseaCount(p1c, p1cInitialMask);
  assert.ok(preparedP1c.oceanCells > 0, 'natural map has at least one below-sea boundary source');
  // Step equal-sized, same-seed Worlds; classify the P1B behavior and P1C behavior separately.
  const v3Step = stepHydrologyStaticSea(v3, 4);
  const p1cStep = stepHydrologyConnectedOcean(p1c, 4);
  const v3BelowSea = [];
  for (let i = 0; i < v3.size; i += 1) if (v3.height[i] < SEA_LEVEL) v3BelowSea.push(i);
  assert.ok(v3BelowSea.every(i => v3.water[i] === Math.fround(SEA_LEVEL - v3.height[i])),
    'V3 still normalizes all below-sea cells to the fixed sea plane');
  const p1cWaterChanges = [];
  for (let i = 0; i < p1c.size; i += 1) if (p1c.water[i] !== generated.water[i]) p1cWaterChanges.push(i);

  const repeatA = cloneWorld(generated), repeatB = cloneWorld(generated);
  prepareConnectedOcean(repeatA); prepareConnectedOcean(repeatB);
  for (let n = 0; n < 5; n += 1) {
    stepHydrologyConnectedOcean(repeatA, 4);
    stepHydrologyConnectedOcean(repeatB, 4);
  }
  assert.deepEqual(layerHash(repeatA), layerHash(repeatB), 'same-seed P1C run is deterministic');

  // Compare restored classification against a fresh rebuild from current saved heights.
  const expectedCurrent = cloneWorld(p1c);
  prepareConnectedOcean(expectedCurrent);
  const expectedCurrentMask = snapshotOceanMask(expectedCurrent);
  // A saved World contains no mask/cache data; restored dimensions/heights rebuild it.
  const payload = serializeWorld(p1c);
  const serialized = JSON.stringify(payload);
  assert.equal(/p1c|oceanMask|oceanQueue/i.test(serialized), false, 'runtime ocean cache is not serialized');
  const restored = deserializeWorld(payload);
  assert.equal(oceanCacheInfo(restored).initialized, false);
  prepareConnectedOcean(restored);
  const restoredMask = snapshotOceanMask(restored);
  const rebuiltCount = seaCount(restored, restoredMask);
  assert.deepEqual(restoredMask, expectedCurrentMask, 'restored World rebuilds the same classification');

  // Map progress only reveals already-existing cells; it does not resize or mutate terrain.
  createMapProgress(restored, true);
  const beforeExpansion = oceanCacheInfo(restored).rebuildCount;
  const beforeShape = [restored.w, restored.h, restored.height];
  assert.equal(expandMap(restored), true);
  const afterExpansionMask = snapshotOceanMask(restored);
  assert.equal(oceanCacheInfo(restored).rebuildCount, beforeExpansion);
  assert.deepEqual([restored.w, restored.h, restored.height], beforeShape);
  assert.equal(seaCount(restored, afterExpansionMask), rebuiltCount);

  const upper = generateUpperWorld({ preset: { w: 24, h: 18 }, seed: 73519 });
  const nether = generateNetherWorld({ preset: { w: 24, h: 18 }, seed: 73519 });
  assert.equal(upper.plane, 'upper');
  assert.equal(nether.plane, 'nether');
  assert.throws(() => prepareConnectedOcean(upper), /mortal World/);
  assert.throws(() => prepareConnectedOcean(nether), /mortal World/);
  assert.equal(Object.keys(p1c).some(key => /p1c|oceanMask|oceanQueue/i.test(key)), false,
    'runtime mask and scratch buffers are kept outside World properties');
  return { naturalMap: { w: generated.w, h: generated.h, seed: generated.seed,
      boundaryConnectedOceanCells: preparedP1c.oceanCells, disconnectedBelowSeaCells: naturalInlandSubsea,
      p1cWaterChangesFromGenerated: p1cWaterChanges.length },
    firstTickComparison: { v3: v3Step, p1c: p1cStep, layerHashesV3: layerHash(v3), layerHashesP1C: layerHash(p1c) },
    determinism: { fiveTicksSameLayers: true, hashes: layerHash(repeatA) },
    restore: { serializedBytes: Buffer.byteLength(serialized), cacheStored: false,
      rebuiltOceanCells: rebuiltCount, matchesPreSaveMask: true },
    mapExpansion: { changedAccessStage: true, dimensionsUnchanged: true, maskRebuilds: 0 },
    threePlaneIsolation: 'actual generated upper and nether Worlds rejected; no World property or save-format changes' };
});

await group('natural-seed-v3-versus-p1c-water-lifecycle', () => {
  const comparisons = [];
  for (const seed of [173, 73519, 912037]) {
    const generated = generateWorld({ preset: { w: 128, h: 80 }, seed,
      scatter: false, generationVersion: 2, terrainPreset: 'standard' });
    const v3 = cloneWorld(generated), p1c = cloneWorld(generated);
    prepareStaticSea(v3);
    const prep = prepareConnectedOcean(p1c);
    const initialMask = snapshotOceanMask(p1c);
    const initialInland = [];
    for (let i = 0; i < generated.size; i += 1) {
      if (!initialMask[i] && generated.height[i] < SEA_LEVEL) initialInland.push(i);
    }
    const initialInlandWater = initialInland.reduce((sum, i) => sum + p1c.water[i], 0);
    const v3Steps = [], p1cSteps = [];
    for (let tick = 0; tick < 16; tick += 1) {
      v3Steps.push(stepHydrologyStaticSea(v3, 4));
      p1cSteps.push(stepHydrologyConnectedOcean(p1c, 4));
    }
    for (let i = 0; i < v3.size; i += 1) {
      if (v3.height[i] < SEA_LEVEL) assert.equal(v3.water[i], Math.fround(SEA_LEVEL - v3.height[i]), `V3 sea ${i}`);
    }
    const current = cloneWorld(p1c);
    prepareConnectedOcean(current);
    const currentMask = snapshotOceanMask(current);
    const remainingInland = [];
    for (const i of initialInland) if (!currentMask[i] && current.height[i] < SEA_LEVEL) remainingInland.push(i);
    const finalInlandWater = remainingInland.reduce((sum, i) => sum + p1c.water[i], 0);
    const changedWaterCells = remainingInland.filter(i => p1c.water[i] !== generated.water[i]).length;
    let maxWaterDifferenceFromV3 = 0, firstDifferentCell = null;
    for (const i of remainingInland) {
      const difference = Math.abs(p1c.water[i] - v3.water[i]);
      if (difference > maxWaterDifferenceFromV3) {
        maxWaterDifferenceFromV3 = difference;
        firstDifferentCell = i;
      }
    }
    if (firstDifferentCell !== null) {
      const detail = diagnostic(p1c, currentMask, firstDifferentCell,
        ['create', ...Array.from({ length: 16 }, (_, tick) => `tick-${tick + 1}`), 'rebuild-for-observation']);
      assert.ok(detail.firstError, 'first differing basin cell has diagnostics');
    }
    comparisons.push({ seed, dimensions: [generated.w, generated.h],
      start: { boundaryOceanCells: prep.oceanCells, disconnectedSubseaCells: initialInland.length,
        disconnectedInlandWater: +initialInlandWater.toFixed(6) },
      after16Ticks: { remainingDisconnectedSubseaCells: remainingInland.length,
        disconnectedInlandWater: +finalInlandWater.toFixed(6), changedWaterCells,
        maxWaterDifferenceFromV3: +maxWaterDifferenceFromV3.toFixed(6),
        firstDifferingCell: firstDifferentCell === null ? null : diagnostic(p1c, currentMask, firstDifferentCell,
          ['create', '16 hydrology ticks', 'classification rebuilt from final heights']).firstError,
        topologyPendingAtTick16: p1cSteps.at(-1).topologyPending,
        staticV3Moved: +v3Steps.reduce((n, item) => n + item.moved, 0).toFixed(6),
        p1cMoved: +p1cSteps.reduce((n, item) => n + item.moved, 0).toFixed(6) } });
  }
  assert.ok(comparisons.some(item => item.start.disconnectedSubseaCells > 0),
    'seed matrix includes at least one natural disconnected low basin');
  return { sameWorlds: '128x80 generated Worlds, identical seed and generation inputs; V3 and P1C stepped independently',
    ticks: 16, comparisons };
});

result.status = Object.values(result.groups).every(groupResult => groupResult.status === 'PASS') ? 'PASS' : 'FAIL';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, evidence: path.relative(ROOT, OUT), groups: Object.keys(result.groups) }));
if (result.status !== 'PASS') process.exitCode = 1;
