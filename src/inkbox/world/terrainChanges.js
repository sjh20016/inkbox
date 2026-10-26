// Neutral, bounded terrain-change journal. World arrays remain authoritative.
// This module neither observes nor imports any rendering or simulation code.
export const TERRAIN_LAYERS = Object.freeze(['height', 'water', 'type', 'veg', 'fire']);
const CAPACITY = 2048; // Bounded per World even when one observer stops reading.
const journals = new WeakMap();
const layerIds = Object.fromEntries(TERRAIN_LAYERS.map((name, i) => [name, i]));

function stateFor(world) { return journals.get(world) || null; }

/** Activate only after world generation / save decoding has established its arrays. */
export function activateTerrainChanges(world) {
  if (!world || !Number.isInteger(world.size) || world.size !== world.w * world.h) return false;
  if (!journals.has(world)) journals.set(world, {
    serial: 0, count: 0, layer: new Uint8Array(CAPACITY),
    bounds: new Int32Array(CAPACITY * 4),
  });
  return true;
}
export function terrainChangesActive(world) { return journals.has(world); }

function append(world, layer, x0, y0, x1, y1) {
  const j = stateFor(world), id = layerIds[layer];
  if (!j || id === undefined || x0 > x1 || y0 > y1) return;
  const seq = ++j.serial, slot = (seq - 1) % CAPACITY, offset = slot * 4;
  j.layer[slot] = id;
  j.bounds[offset] = Math.max(0, Math.min(world.w - 1, x0));
  j.bounds[offset + 1] = Math.max(0, Math.min(world.h - 1, y0));
  j.bounds[offset + 2] = Math.max(0, Math.min(world.w - 1, x1));
  j.bounds[offset + 3] = Math.max(0, Math.min(world.h - 1, y1));
  j.count = Math.min(CAPACITY, j.count + 1);
}
export function noteTerrainCell(world, layer, index) {
  if (!stateFor(world) || !Number.isInteger(index) || index < 0 || index >= world.size) return;
  const x = index % world.w, y = (index - x) / world.w;
  append(world, layer, x, y, x, y);
}
export function noteTerrainRegion(world, layer, rect) {
  if (!stateFor(world) || !rect) return;
  if (![rect.x0, rect.y0, rect.x1, rect.y1].every(Number.isFinite)) return;
  append(world, layer, Math.floor(rect.x0), Math.floor(rect.y0), Math.ceil(rect.x1), Math.ceil(rect.y1));
}
export function noteTerrainFull(world, layer) {
  if (stateFor(world)) append(world, layer, 0, 0, world.w - 1, world.h - 1);
}
export function noteAllTerrain(world) {
  if (!stateFor(world)) return;
  for (const layer of TERRAIN_LAYERS) noteTerrainFull(world, layer);
}
export function subscribeTerrainChanges(world) {
  const journal = stateFor(world);
  if (!journal) return null;
  return { world, journal, cursor: journal.serial, disposed: false };
}
export function readTerrainChanges(subscription) {
  if (!subscription || subscription.disposed) return null;
  const j = subscription.journal;
  if (subscription.cursor === j.serial) return null;
  if (j.serial - subscription.cursor > j.count) {
    subscription.cursor = j.serial;
    return { full: true, regions: null, overflow: true };
  }
  const regions = [null, null, null, null, null];
  for (let serial = subscription.cursor + 1; serial <= j.serial; serial++) {
    const slot = (serial - 1) % CAPACITY, at = slot * 4;
    const id = j.layer[slot], r = regions[id], x0 = j.bounds[at], y0 = j.bounds[at + 1],
      x1 = j.bounds[at + 2], y1 = j.bounds[at + 3];
    if (r) {
      r.x0 = Math.min(r.x0, x0); r.y0 = Math.min(r.y0, y0);
      r.x1 = Math.max(r.x1, x1); r.y1 = Math.max(r.y1, y1);
    } else regions[id] = { x0, y0, x1, y1 };
  }
  subscription.cursor = j.serial;
  return { full: false, regions };
}
export function disposeTerrainSubscription(subscription) {
  if (!subscription) return;
  subscription.disposed = true;
  subscription.world = null;
  subscription.journal = null;
}
export const TERRAIN_JOURNAL_CAPACITY = CAPACITY;
