// Event-driven, bounded water adjustment. This module never runs from the frame loop.
import { markDirty, flushDirty } from './terrain.js';
import { emitPresentation } from '../sim/presentation.js';
import { accessBounds as worldAccessBounds } from './mapProgress.js';

const MAX_RADIUS = 40;
const MAX_CELLS = 8192;
const PASSES = 32;
const EPS = 1e-6;
const stats = new WeakMap();

export function localWaterStats(world) { return Object.freeze({ ...(stats.get(world) || { candidates: 0, passes: 0, changed: 0, capped: false, milliseconds: 0 }) }); }

/** Balance permanent water, or one flood's owned layer, near a completed edit. */
export function respondLocalWater(world, bounds, { source = 'terrain', phase = 'flow', present = true, beforeChange = null, floodId = null, accessBounds = null, passes = PASSES } = {}) {
  if (!bounds) return null;
  const started = performance.now();
  const editBounds = accessBounds ?? worldAccessBounds(world);
  const passCount = Math.max(1, Math.min(PASSES, Math.floor(passes) || PASSES));
  const cx = Math.floor((bounds.x0 + bounds.x1) / 2), cy = Math.floor((bounds.y0 + bounds.y1) / 2);
  const x0 = Math.max(0, cx - MAX_RADIUS), x1 = Math.min(world.w - 1, cx + MAX_RADIUS);
  const y0 = Math.max(0, cy - MAX_RADIUS), y1 = Math.min(world.h - 1, cy + MAX_RADIUS);
  const width = x1 - x0 + 1, height = y1 - y0 + 1, count = width * height;
  if (count > MAX_CELLS) throw new Error('Local water budget exceeded');
  const indices = new Int32Array(count), ground = new Float32Array(count), depth = new Float64Array(count);
  const floor = new Float64Array(count);
  const allowed = new Uint8Array(count), floods = world.nature?.floods;
  for (let y = 0, k = 0; y < height; y++) for (let x = 0; x < width; x++, k++) {
    const i = (y0 + y) * world.w + x0 + x, entry = floods?.get(i);
    const base = entry?.base ?? world.water[i];
    indices[k] = i;
    if (floodId === null) {
      // Preserve only natural flow that is still physically present. An explicitly
      // drained river cell has base=0, so its floor is zero as well.
      floor[k] = Math.min(base, world.riverBase?.[i] ?? 0);
      const floodDepth = entry ? [...entry.levels.values()].reduce((sum, v) => sum + v, 0) : 0;
      ground[k] = world.height[i] + floor[k] + floodDepth;
      depth[k] = Math.max(0, base - floor[k]);
    } else {
      const otherFloods = entry ? [...entry.levels].reduce((sum, [id, v]) => sum + (id === floodId ? 0 : v), 0) : 0;
      ground[k] = world.height[i] + base + otherFloods;
      depth[k] = entry?.levels.get(floodId) ?? 0;
    }
    const gx = x0 + x, gy = y0 + y;
    allowed[k] = !editBounds || (typeof editBounds === 'function' ? editBounds(gx, gy)
      : gx >= editBounds.x0 && gx <= editBounds.x1 && gy >= editBounds.y0 && gy <= editBounds.y1) ? 1 : 0;
  }
  const movable = depth.some(v => v > EPS);
  if (!movable) {
    const result = { candidates: count, passes: 0, changed: 0, capped: false, milliseconds: performance.now() - started, bounds: null };
    stats.set(world, result);
    return result;
  }
  // All movable water is finite, including a local piece of sea. A water level
  // alone cannot prove ocean identity: a player-made pool can have that level.
  // Closed window boundaries trade a small local sea-level drop for conservation.
  const move = (a, b) => {
    if (!allowed[a] || !allowed[b]) return;
    const sa = ground[a] + depth[a], sb = ground[b] + depth[b];
    if (sa > sb + EPS && depth[a] > EPS) {
      const amount = Math.min(depth[a], (sa - sb) * .5);
      depth[a] -= amount; depth[b] += amount;
    } else if (sb > sa + EPS && depth[b] > EPS) {
      const amount = Math.min(depth[b], (sb - sa) * .5);
      depth[b] -= amount; depth[a] += amount;
    }
  };
  for (let pass = 0; pass < passCount; pass++) {
    const reverse = pass & 1;
    for (let step = 0; step < count; step++) {
      const k = reverse ? count - 1 - step : step, x = k % width, y = (k - x) / width;
      if (x + 1 < width) move(k, k + 1);
      if (y + 1 < height) move(k, k + width);
    }
  }
  let changed = 0, minX = world.w, minY = world.h, maxX = -1, maxY = -1, fromDepth = 0, toDepth = 0;
  let event = null;
  if (floodId !== null) event = world.nature?.events.find(e => e.kind === 'flood' && e.id === floodId);
  for (let k = 0; k < count; k++) {
    const i = indices[k], entry = floods?.get(i), old = world.water[i];
    const nextLayer = depth[k] < EPS ? 0 : Math.fround(depth[k]);
    const next = floodId === null
      ? Math.fround(Math.max(0, floor[k] + nextLayer + (entry ? [...entry.levels.values()].reduce((a, b) => a + b, 0) : 0)))
      : Math.fround((entry?.base ?? old) + (entry ? [...entry.levels].reduce((a, [id, v]) => a + (id === floodId ? nextLayer : v), 0) : nextLayer));
    if (next === old) continue;
    beforeChange?.(i, world.height[i], old, world.riverBase?.[i] ?? 0);
    if (floodId === null) { if (entry) entry.base = Math.fround(floor[k] + nextLayer); }
    else if (event) {
      let target = entry;
      if (!target && nextLayer > 0) { target = { base: old, levels: new Map() }; floods.set(i, target); }
      if (target) {
        if (nextLayer > 0) target.levels.set(floodId, nextLayer);
        else target.levels.delete(floodId);
        if (!target.levels.size) floods.delete(i);
      }
    }
    world.water[i] = next;
    markDirty(world, i);
    const x = i % world.w, y = (i - x) / world.w;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    fromDepth += old; toDepth += next; changed++;
  }
  if (event) {
    const owned = new Set(event.cells);
    for (let k = 0; k < count; k++) {
      if (floods.get(indices[k])?.levels.has(floodId)) owned.add(indices[k]);
      else owned.delete(indices[k]);
    }
    event.cells = [...owned];
  }
  if (changed) {
    flushDirty(world);
    if (present) emitPresentation(world, 'tool-impact', { x: cx, y: cy, data: { tool: 'water-response', phase, radius: Math.max(maxX - minX, maxY - minY) / 2, affectedCells: changed, source, fromDepth, toDepth } });
  }
  let boundaryReached = false;
  for (let x = 0; x < width && !boundaryReached; x++) boundaryReached = depth[x] > EPS || depth[(height - 1) * width + x] > EPS;
  for (let y = 0; y < height && !boundaryReached; y++) boundaryReached = depth[y * width] > EPS || depth[y * width + width - 1] > EPS;
  const result = { candidates: count, passes: passCount, changed, capped: passCount < PASSES || boundaryReached || bounds.x0 < x0 || bounds.x1 > x1 || bounds.y0 < y0 || bounds.y1 > y1, milliseconds: performance.now() - started,
    bounds: changed ? { x0: minX, y0: minY, x1: maxX, y1: maxY } : null };
  stats.set(world, result);
  return result;
}
