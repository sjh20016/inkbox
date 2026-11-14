import { buildReadFrame, worldGeneration, allocateReadViewGeneration } from './index.js';
import { TerrainReadView } from './terrain.js';
import { activateTerrainChanges } from '../../world/terrainChanges.js';
import { committedEntry, committedFrameOf, registerCommittedWorld, unregisterCommittedWorld, assertCommittedLegacyReadAllowed } from './committedRegistry.js';
import { beginBreakdown, endBreakdown, markBreakdown, frameBreakdownEnabled } from '../../dev/frameBreakdown.js';

const summary = s => Object.freeze({ worldGeneration: s.worldGeneration, commitSequence: s.sequence,
  committedDay: s.committedDay, inProgress: s.inProgress, fault: s.fault });
function queryForFrame(frame) {
  return Object.freeze({ worldGeneration: frame.worldGeneration, commitSequence: frame.commitSequence,
    committedDay: frame.committedDay, plane: frame.plane,
    status: Object.freeze({ schemaVersion: 1, worldGeneration: frame.worldGeneration, plane: frame.plane,
      observedDay: frame.committedDay, entityCount: frame.entityCount, seed: frame.seed, commitSequence: frame.commitSequence }),
    entities: Object.freeze(frame.entities.map(e => Object.freeze({ worldGeneration: frame.worldGeneration,
      commitSequence: frame.commitSequence, plane: frame.plane, observedDay: frame.committedDay,
      entityId: e.id, name: e.name, x: e.x, y: e.y, species: e.sp, state: e.state, level: e.level, hpRatio: e.hpRatio }))) });
}
function sessionFor(world) {
  const s = committedEntry(world)?.session;
  if (!s || s.disposed) throw new Error('World has no live committed session');
  return s;
}
function validateTopology(s) {
  let changed = false;
  for (const plane of ['upper','nether']) {
    const actual = s.root[plane] || undefined;
    if (actual === s.worlds[plane]) continue;
    changed = true;
    // A newly exposed draft child must not escape through unmanaged fallback.
    // Never take a live World away from another committed session.
    if (actual && typeof actual === 'object' && (!committedEntry(actual) || committedEntry(actual).session.disposed)) {
      const tombstone = { frames: Object.freeze({}), queries: Object.freeze({}), worldGeneration: s.worldGeneration,
        inProgress: false, fault: true, disposed: true };
      registerCommittedWorld(actual, tombstone, plane);
    }
  }
  if (changed) throw new Error('Child World topology changed; explicitly dispose and rebuild committed session');
}
function geometryFor(world, terrain, previous, cost) {
  const change = previous ? terrain.changes() : terrain.initial();
  let layers = previous?.layers;
  if (change?.full) {
    layers = change.layers;
    if (cost) for (const data of Object.values(layers)) { cost.terrainCopiedElements += data.length; cost.terrainCopiedLayers++; }
  }
  else if (change) {
    const next = { ...layers }, mutable = {};
    for (const block of change.blocks) {
      if (!mutable[block.layer]) {
        mutable[block.layer] = layers[block.layer].slice();
        if (cost) { cost.terrainCopiedElements += mutable[block.layer].length; cost.terrainCopiedLayers++; }
      }
      const data = mutable[block.layer], width = block.x1 - block.x0 + 1;
      for (let y = block.y0; y <= block.y1; y++) for (let x = block.x0; x <= block.x1; x++)
        data[y * world.w + x] = block.data[(y - block.y0) * width + x - block.x0];
    }
    for (const [layer, data] of Object.entries(mutable)) next[layer] = Object.freeze(data);
    layers = Object.freeze(next);
  }
  // An inactive journal cannot prove an unchanged layer. Take the explicit full fallback.
  if (!terrain.subscription && previous) {
    layers = terrain.initial().layers;
    if (cost) for (const data of Object.values(layers)) { cost.terrainCopiedElements += data.length; cost.terrainCopiedLayers++; }
  }
  const terrainRevision = (previous?.terrainRevision || 0) + (change || !terrain.subscription ? 1 : 0);
  return Object.freeze({ committedGeometry: true, w: world.w, h: world.h, seed: world.seed >>> 0,
    reliefScale: world.reliefScale, plane: world.plane || 'mortal', terrainRevision,
    mapProgress: world.mapProgress ? Object.freeze({ stage: world.mapProgress.stage }) : undefined,
    layers, ...layers });
}
function publish(s) {
  if (s.disposed || s.fault) throw new Error('Committed session requires explicit recovery');
  const publishSpan = beginBreakdown('readView.publishComplete');
  const cost = frameBreakdownEnabled() ? { commitSequence: s.sequence + 1, planes: 0, entityCopies: 0,
    terrainCopiedElements: 0, terrainCopiedLayers: 0, estimatedPrimitiveBytes: 0, estimatedObjects: 0 } : null;
  const sequence = s.sequence + 1, frames = {};
  try {
    validateTopology(s);
    for (const [plane, world] of Object.entries(s.worlds)) {
      const geometry = geometryFor(world, s.terrain[plane], s.frames[plane]?.geometry, cost);
      frames[plane] = buildReadFrame(world, plane, { geometry, metadata: {
        worldGeneration: s.worldGeneration, sessionId: s.worldGeneration, commitSequence: sequence,
        committedDay: world.day, renderGeneration: sequence, frameGeneration: sequence,
        terrainRevision: geometry.terrainRevision,
      } });
      if (cost) {
        const frame = frames[plane], auxiliary = frame.wanling.units.length + frame.wraiths.length + frame.biyiPairs.length + frame.factions.length;
        cost.planes++; cost.entityCopies += frame.entityCount * 2;
        // Slot estimates, not heap measurements: 8 bytes per primitive slot;
        // excludes string backing, allocator overhead and retained shared arrays.
        cost.estimatedPrimitiveBytes += frame.entityCount * (25 + 12) * 8 + auxiliary * 12 * 8;
        cost.estimatedObjects += frame.entityCount * 2 + auxiliary + 12;
      }
    }
    // Only this assignment publishes. Earlier producer work is private on every failure.
    const queries = Object.freeze(Object.fromEntries(Object.entries(frames).map(([plane,frame]) => [plane,queryForFrame(frame)])));
    if (cost) {
      cost.estimatedPrimitiveBytes += cost.terrainCopiedElements * 8;
      cost.estimatedObjects += cost.terrainCopiedLayers;
      markBreakdown('readView.publishCost', cost);
    }
    s.frames = Object.freeze(frames); s.queries = queries; s.sequence = sequence; s.committedDay = frames.mortal.committedDay; s.inProgress = false;
    return summary(s);
  } catch (error) { s.fault = true; s.inProgress = false; throw error; }
  finally { endBreakdown(publishSpan); }
}
export function manageCommittedWorlds(root) {
  const existing = committedEntry(root);
  if (existing && !existing.session.disposed) return summary(existing.session);
  const s = { root, worldGeneration: existing ? allocateReadViewGeneration() : worldGeneration(root), sequence: -1, committedDay: root.day,
    worlds: { mortal: root, ...(root.upper ? { upper: root.upper } : {}), ...(root.nether ? { nether: root.nether } : {}) },
    terrain: {}, frames: Object.freeze({}), queries: Object.freeze({}), inProgress: false, fault: false, disposed: false };
  try {
    const seen = new Set();
    for (const [plane, world] of Object.entries(s.worlds)) {
      const owner = committedEntry(world);
      if (seen.has(world) || (owner && !owner.session.disposed)) throw new Error('World already belongs to another live committed session');
      seen.add(world);
      activateTerrainChanges(world); s.terrain[plane] = new TerrainReadView(world);
    }
    publish(s);
    for (const [plane, world] of Object.entries(s.worlds)) registerCommittedWorld(world, s, plane);
    return summary(s);
  } catch (error) { for (const terrain of Object.values(s.terrain)) terrain.dispose(); throw error; }
}
export function beginCompleteStep(world) {
  const s = sessionFor(world);
  if (s.inProgress || s.fault) throw new Error('Cannot begin an incomplete or faulted committed session');
  try { validateTopology(s); }
  catch (error) { s.fault = true; s.inProgress = false; throw error; }
  s.inProgress = true;
}
export function publishCompleteStep(world) {
  const s = sessionFor(world);
  if (!s.inProgress) throw new Error('No complete step is awaiting publication');
  return publish(s);
}
export function abortCompleteStep(world) {
  const s = sessionFor(world); s.inProgress = false; s.fault = true; return summary(s);
}
export function publishAfterCommand(world) {
  const s = sessionFor(world);
  if (s.inProgress) throw new Error('Command cannot publish during simulation');
  return publish(s);
}
export function getCommittedFrame(world, plane) {
  const entry = committedEntry(world);
  if (entry?.plane === 'mortal' && plane) return entry.session.frames[plane] ?? null;
  return committedFrameOf(world, plane) ?? null;
}
export function getCommittedQuery(world, plane) {
  const entry = committedEntry(world);
  if (!entry || (plane && entry.plane !== 'mortal' && plane !== entry.plane)) return null;
  return entry.session.queries[plane || entry.plane] ?? null;
}
export function isStepInProgress(world) { return !!committedEntry(world)?.session.inProgress; }
export const assertLegacyReadAllowed = assertCommittedLegacyReadAllowed;
export function disposeCommittedWorlds(world) {
  const s = sessionFor(world); s.disposed = true;
  for (const terrain of Object.values(s.terrain)) terrain.dispose();
  // Keep identity tombstones so disposed references can never fall back to reading draft facts.
  s.frames = Object.freeze({}); s.queries = Object.freeze({}); s.worlds = {}; s.terrain = {}; s.root = null;
}
