// Research-only P1C prototype. This is deliberately not connected to the game loop
// or hydrologyRules: the P1B V0/V3 contracts remain untouched.
import { SEA_LEVEL } from '../../src/inkbox/core/config.js';
import { clamp } from '../../src/inkbox/core/noise.js';
import { maintainRivers } from '../../src/inkbox/sim/hydrology.js';
import { markDirty, markDirtyWithNeighbors, flushDirty } from '../../src/inkbox/world/terrain.js';

export const CONNECTED_OCEAN_RULE = 'ocean-connected-prototype-v1';
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const caches = new WeakMap();
const waterTerrainBand = depth => depth > 0.15 ? 4 : depth > 0.055 ? 3 : depth > 0.016 ? 2 : depth > 0.0015 ? 1 : 0;

function validateWorld(world) {
  if (!world || !Number.isInteger(world.w) || !Number.isInteger(world.h)
      || world.w < 1 || world.h < 1 || world.size !== world.w * world.h
      || !world.height || world.height.length !== world.size
      || !world.water || world.water.length !== world.size) {
    throw new TypeError('P1C connectivity requires a valid World with height and water layers');
  }
  if (world.plane && world.plane !== 'mortal') {
    throw new TypeError('P1C ocean connectivity is restricted to the mortal World');
  }
}

function clockNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function setTerrainChanged(world, reason) {
  const cache = caches.get(world);
  if (!cache) return;
  cache.dirty = true;
  cache.dirtyReason = reason;
  cache.terrainEvents += 1;
}

/**
 * Notify the prototype after an in-place terrain edit. `previousHeights` maps
 * changed cell indices to their values before the edit. Connectivity only changes
 * when a cell crosses the strict height < SEA_LEVEL passability threshold.
 */
export function notifyTerrainMutation(world, previousHeights, reason = 'terrain-edit') {
  validateWorld(world);
  if (!(previousHeights instanceof Map)) {
    throw new TypeError('P1C terrain notifications require a Map of previous cell heights');
  }
  let changedCells = 0, seaLevelCrossings = 0;
  for (const [index, before] of previousHeights) {
    if (!Number.isInteger(index) || index < 0 || index >= world.size) {
      throw new RangeError(`Invalid P1C changed cell index: ${index}`);
    }
    const after = world.height[index];
    if (after === before) continue;
    changedCells += 1;
    if ((before < SEA_LEVEL) !== (after < SEA_LEVEL)) seaLevelCrossings += 1;
  }
  if (seaLevelCrossings > 0) setTerrainChanged(world, reason);
  return { changedCells, seaLevelCrossings, invalidated: seaLevelCrossings > 0 };
}

function rebuildOceanMask(world, cache, reason) {
  const { w, h, size, height } = world;
  const started = clockNow();
  if (cache.mask.length !== size) cache.mask = new Uint8Array(size);
  if (cache.queue.length !== size) cache.queue = new Int32Array(size);
  if (cache.delta.length !== size) cache.delta = new Float32Array(size);
  cache.mask.fill(0);
  let head = 0, tail = 0;
  const seed = index => {
    if (cache.mask[index] || height[index] >= SEA_LEVEL) return;
    cache.mask[index] = 1;
    cache.queue[tail++] = index;
  };
  for (let x = 0; x < w; x += 1) {
    seed(x);
    if (h > 1) seed((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y += 1) {
    seed(y * w);
    if (w > 1) seed(y * w + w - 1);
  }
  while (head < tail) {
    const index = cache.queue[head++];
    const x = index % w, y = (index - x) / w;
    if (x > 0) seed(index - 1);
    if (x + 1 < w) seed(index + 1);
    if (y > 0) seed(index - w);
    if (y + 1 < h) seed(index + w);
  }
  cache.heightRef = height;
  cache.w = w;
  cache.h = h;
  cache.size = size;
  cache.dirty = false;
  cache.dirtyReason = null;
  cache.pendingNormalize = true;
  cache.oceanCells = tail;
  cache.rebuildCount += 1;
  cache.lastRebuildMs = clockNow() - started;
  cache.lastRebuildReason = reason;
  return cache;
}

function cacheFor(world) {
  validateWorld(world);
  let cache = caches.get(world);
  if (!cache) {
    cache = { mask: new Uint8Array(world.size), queue: new Int32Array(world.size),
      delta: new Float32Array(world.size), heightRef: null,
      w: 0, h: 0, size: 0, dirty: true, dirtyReason: 'initial', pendingNormalize: false,
      oceanCells: 0, rebuildCount: 0, terrainEvents: 0, lastRebuildMs: 0, lastRebuildReason: null };
    caches.set(world, cache);
  }
  const shapeChanged = cache.w !== world.w || cache.h !== world.h || cache.size !== world.size
    || cache.heightRef !== world.height;
  if (shapeChanged || cache.dirty) {
    const reason = shapeChanged ? 'world-shape-or-height-layer' : (cache.dirtyReason || 'terrain-event');
    rebuildOceanMask(world, cache, reason);
  }
  return cache;
}

function normalizeConnectedOcean(world, cache) {
  const { height, water } = world;
  let fixed = 0;
  for (let i = 0; i < world.size; i += 1) {
    if (!cache.mask[i] || height[i] >= SEA_LEVEL) continue;
    const target = Math.fround(SEA_LEVEL - height[i]);
    if (water[i] !== target) {
      water[i] = target;
      markDirty(world, i);
      fixed += 1;
    }
  }
  if (fixed) world.touch();
  return fixed;
}

/** Initialize/rebuild the non-persistent runtime mask and normalize connected sea cells. */
export function prepareConnectedOcean(world) {
  const cache = cacheFor(world);
  const normalizedCells = normalizeConnectedOcean(world, cache);
  cache.pendingNormalize = false;
  flushDirty(world);
  return { rule: CONNECTED_OCEAN_RULE, oceanCells: cache.oceanCells, normalizedCells,
    rebuildCount: cache.rebuildCount, rebuildMs: cache.lastRebuildMs };
}

function stepWaterLand(world, dtDays, cache) {
  const flowRate = 0.34, evapRate = 0.00042, { w, h, height, water, temp } = world;
  const delta = cache.delta;
  delta.fill(0);
  let moved = 0;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = y * w + x;
    if (cache.mask[i]) continue;
    const depth = water[i];
    if (depth <= 0.0008) continue;
    const surface = height[i] + depth;
    for (let d = 0; d < 4; d += 1) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx, other = height[ni] + water[ni];
      if (other >= surface) continue;
      const amount = Math.min(depth * flowRate * 0.25, (surface - other) * flowRate * 0.5);
      if (amount <= 0) continue;
      delta[i] -= amount;
      // Ocean is a fixed-level sink/reservoir; outflow is removed and never raises it.
      if (!cache.mask[ni]) delta[ni] += amount;
      moved += amount;
    }
  }
  if (moved > 0) for (let i = 0; i < world.size; i += 1) {
    const d = delta[i];
    if (d === 0) continue;
    const next = water[i] + d;
    water[i] = next > 0 ? next : 0;
    markDirty(world, i);
  }
  // Inland depressions now take part in evaporation; rivers retain P1B's base rule.
  let evaporated = false;
  for (let i = 0; i < world.size; i += 1) {
    const depth = water[i];
    if (depth <= 0.0006 || cache.mask[i] || world.riverBase[i] > 0) continue;
    const next = Math.max(0, depth - evapRate * dtDays * (0.35 + temp[i]));
    if (next !== depth) {
      water[i] = next;
      if (waterTerrainBand(depth) !== waterTerrainBand(next)) markDirty(world, i);
      evaporated = true;
    }
  }
  if (moved > 0.0001 || evaporated) world.touch();
  return moved;
}

function applyHeightDelta(world, delta, reason, range = null) {
  const { height } = world;
  let touched = 0, seaLevelCrossings = 0;
  const apply = i => {
    const d = delta[i];
    if (d === 0) return;
    const before = height[i], after = clamp(before + d, 0, 1);
    if (before === after) return;
    height[i] = after;
    if ((before < SEA_LEVEL) !== (after < SEA_LEVEL)) seaLevelCrossings += 1;
    markDirtyWithNeighbors(world, i);
    touched += 1;
  };
  if (range) {
    for (let y = range.y0; y <= range.y1; y += 1) {
      for (let x = range.x0; x <= range.x1; x += 1) apply(y * world.w + x);
    }
  } else {
    for (let i = 0; i < world.size; i += 1) apply(i);
  }
  if (touched) world.touch();
  if (seaLevelCrossings) setTerrainChanged(world, reason);
  return { touched, seaLevelCrossings };
}

function stepErosionLand(world, dtDays, cache) {
  const { w, h, height, water } = world;
  const delta = cache.delta;
  delta.fill(0);
  const rate = clamp(dtDays * 0.02 * 0.9, 0, 0.02);
  let touched = 0;
  const bb = [w, h, -1, -1];
  for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
    const i = y * w + x;
    if (cache.mask[i]) continue;
    const depth = water[i];
    if (depth < 0.002) continue;
    const hi = height[i];
    let lowest = -1, lowHeight = hi, steep = 0;
    for (let d = 0; d < 4; d += 1) {
      const ni = (y + DIRS[d][1]) * w + (x + DIRS[d][0]), nh = height[ni];
      if (nh < lowHeight) { lowHeight = nh; lowest = ni; }
      const difference = hi - nh;
      if (difference > steep) steep = difference;
    }
    if (lowest < 0 || steep <= 0.0015) continue;
    const amount = Math.min(rate * Math.min(1, depth * 14) * steep * 6, steep * 0.35, 0.0022);
    if (amount <= 1e-6) continue;
    delta[i] -= amount;
    if (!cache.mask[lowest]) delta[lowest] += amount * 0.72;
    touched += 1;
    if (x < bb[0]) bb[0] = x;
    if (y < bb[1]) bb[1] = y;
    if (x > bb[2]) bb[2] = x;
    if (y > bb[3]) bb[3] = y;
  }
  const applied = applyHeightDelta(world, delta, 'water-erosion');
  return { touched, bb, seaLevelCrossings: applied.seaLevelCrossings };
}

function stepThermalLandLocal(world, dtDays, bb, cache, pad = 3) {
  const threshold = 0.085, rate = clamp(dtDays * 0.03, 0, 0.08), { w, h, height } = world;
  const delta = cache.delta;
  delta.fill(0);
  const x0 = Math.max(1, bb[0] - pad), y0 = Math.max(1, bb[1] - pad);
  const x1 = Math.min(w - 2, bb[2] + pad), y1 = Math.min(h - 2, bb[3] + pad);
  let touched = 0;
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const i = y * w + x, hi = height[i];
    if (cache.mask[i]) continue;
    for (let d = 0; d < 4; d += 1) {
      const ni = (y + DIRS[d][1]) * w + (x + DIRS[d][0]);
      if (ni < i || cache.mask[ni]) continue;
      const difference = hi - height[ni];
      if (Math.abs(difference) <= threshold) continue;
      const move = Math.min((Math.abs(difference) - threshold) * rate * 0.5, 0.0015);
      if (move <= 1e-6) continue;
      const direction = difference > 0 ? -1 : 1;
      delta[i] += direction * move;
      delta[ni] -= direction * move;
      touched += 1;
    }
  }
  if (!touched) return 0;
  return applyHeightDelta(world, delta, 'thermal-erosion', {
    x0: x0 - 1, y0: y0 - 1, x1: x1 + 1, y1: y1 + 1,
  }).touched;
}

/** Four-neighbor connectivity from all below-sea boundary cells; no diagonal joins. */
export function stepHydrologyConnectedOcean(world, dtDays = 4) {
  if (dtDays !== 4) throw new RangeError('P1C prototype requires dtDays === 4');
  const cache = cacheFor(world);
  let normalizedCells = 0;
  // Reclassification takes effect at this tick boundary. Newly connected water is
  // filled to sea level; newly disconnected water is left in place.
  if (cache.pendingNormalize) {
    normalizedCells = normalizeConnectedOcean(world, cache);
    cache.pendingNormalize = false;
  }
  maintainRivers(world);
  const moved = stepWaterLand(world, dtDays, cache);
  const erosion = stepErosionLand(world, dtDays, cache);
  let thermalTouched = 0;
  if (erosion.touched > 0) thermalTouched = stepThermalLandLocal(world, dtDays, erosion.bb, cache);
  normalizedCells += normalizeConnectedOcean(world, cache);
  flushDirty(world);
  return { moved, eroded: erosion.touched, thermalTouched, normalizedCells,
    oceanCells: cache.oceanCells, maskRebuildCount: cache.rebuildCount,
    maskRebuiltMs: cache.lastRebuildMs, topologyPending: cache.dirty };
}

export function snapshotOceanMask(world) {
  const cache = caches.get(world);
  if (!cache) throw new TypeError('P1C ocean mask has not been prepared for this World');
  return cache.mask.slice();
}

export function oceanCacheInfo(world) {
  const cache = caches.get(world);
  if (!cache) return { initialized: false, maskBytes: 0, queueBytes: 0, topologyPending: false };
  return { initialized: true, dirty: cache.dirty, topologyPending: cache.dirty,
    dirtyReason: cache.dirtyReason, oceanCells: cache.oceanCells, rebuildCount: cache.rebuildCount,
    terrainEvents: cache.terrainEvents, lastRebuildMs: cache.lastRebuildMs,
    lastRebuildReason: cache.lastRebuildReason, maskBytes: cache.mask.byteLength,
    queueBytes: cache.queue.byteLength, deltaBytes: cache.delta.byteLength,
    cachedBytes: cache.mask.byteLength + cache.queue.byteLength + cache.delta.byteLength };
}
