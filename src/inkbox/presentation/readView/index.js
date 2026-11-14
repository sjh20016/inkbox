// Synchronous, transient facts. No simulation objects cross this boundary.
import { beginBreakdown, endBreakdown, markBreakdown, frameBreakdownEnabled } from '../../dev/frameBreakdown.js';
import { committedEntry, committedFrameOf } from './committedRegistry.js';
import { creatureFormOf } from '../../core/wanlingCatalog.js';
import { readBiyiPairs } from '../../world/wanlingRelations.js';
const states = new WeakMap();
let nextWorldGeneration = 1;
export function allocateReadViewGeneration() { return nextWorldGeneration++; }
const primitive = value => value == null || ['string', 'number', 'boolean'].includes(typeof value) ? value : null;

function state(world) {
  let value = states.get(world);
  if (!value) {
    value = { worldGeneration: nextWorldGeneration++, frameGeneration: 0, frame: null, revision: null, dirty: true };
    states.set(world, value);
  }
  return value;
}

export function worldGeneration(world) { return committedEntry(world)?.session.worldGeneration ?? state(world).worldGeneration; }
export function invalidateReadView(world) {
  if (world) { const s = state(world); s.dirty = true; s.frame = null; }
}
export function renderFrame(world, plane, { refresh = false } = {}) {
  const committed = committedFrameOf(world, plane);
  if (committed !== undefined) {
    if (committed && frameBreakdownEnabled()) markBreakdown('readView.cache', { cacheHit: true, copiedEntities: 0, frameGeneration: committed.frameGeneration, plane: committed.plane });
    return committed;
  }
  plane ||= world?.plane || 'mortal';
  return buildReadFrame(world, plane, { refresh });
}
export function buildReadFrame(world, plane, { refresh = true, metadata = {}, geometry } = {}) {
  const frameSpan = beginBreakdown('readView.renderFrame');
  try {
  if (!world || plane !== (world.plane || 'mortal')) return null;
  const s = state(world);
  if (!refresh && !s.dirty && s.frame && s.frame.committedDay === world.day && s.frame.plane === plane && s.revision === world.revision) {
    if (frameBreakdownEnabled()) markBreakdown('readView.cache', { cacheHit: true, copiedEntities: 0, frameGeneration: s.frame.frameGeneration, plane });
    return s.frame;
  }
  const entities = [];
  for (const e of world.entities || []) {
    if (!e) continue;
    const daoPath = primitive(e.dao?.path?.key) || null;
    entities.push(Object.freeze({
      name: String(e.name || ''), creatureForm: creatureFormOf(world, e), id: primitive(e.id), entityKey: `${plane}:${e.id}`, x: primitive(e.x), y: primitive(e.y), tx: primitive(e.tx), ty: primitive(e.ty), sp: primitive(e.sp),
      state: primitive(e.state), level: primitive(e.level), hp: primitive(e.hp), maxHp: primitive(e.maxHp),
      hpRatio: e.maxHp ? e.hp / e.maxHp : 0,
      faction: primitive(e.faction), face: primitive(e.face), soulKind: primitive(e.soulKind) || null,
      form: primitive(e.form) || null, daoPath,
      dao: daoPath ? Object.freeze({ path: Object.freeze({ key: daoPath }) }) : null,
    }));
  }
  const frame = Object.freeze({ schemaVersion: 1, worldGeneration: s.worldGeneration,
    plane, committedDay: world.day, frameGeneration: ++s.frameGeneration,
    entityCount: entities.length, entities: Object.freeze(entities), seed: world.seed >>> 0,
    factions: Object.freeze((world.factions || []).map(f => Object.freeze({ id: primitive(f.id), color: primitive(f.color), accent: primitive(f.accent) }))),
    wanling: Object.freeze({ units: Object.freeze((world.wanling?.units || []).map(u => Object.freeze(Object.fromEntries(['id','x','y','hp','state','form','mask','count'].map(k => [k, primitive(u[k])]))))) }),
    biyiPairs: Object.freeze(readBiyiPairs(world).map(pair => Object.freeze({ ...pair, partners: Object.freeze([...pair.partners]) }))),
    wraiths: Object.freeze((world.wraiths || []).map(g => Object.freeze(Object.fromEntries(['id','x','y','level','soulKind'].map(k => [k, primitive(g[k])]))))),
    geometry, ...metadata });
  s.frame = frame; s.revision = world.revision; s.dirty = false;
  if (frameBreakdownEnabled()) markBreakdown('readView.cache', { cacheHit: false, copiedEntities: entities.length, frameGeneration: frame.frameGeneration, plane });
  return frame;
  } finally { endBreakdown(frameSpan); }
}
export function getWorldStatus(world, plane) {
  const committed = committedFrameOf(world, plane);
  if (committed !== undefined) return committed ? Object.freeze({ schemaVersion: 1, worldGeneration: committed.worldGeneration, plane: committed.plane, observedDay: committed.committedDay, seed: committed.seed, entityCount: committed.entityCount, commitSequence: committed.commitSequence }) : null;
  plane ||= world?.plane || 'mortal';
  if (!world) return null;
  return Object.freeze({ schemaVersion: 1, worldGeneration: worldGeneration(world),
    plane, observedDay: world.day, seed: world.seed >>> 0,
    entityCount: world.entities?.length || 0 });
}
export function getEntityInspection(world, plane, id) {
  const committed = committedFrameOf(world, plane);
  if (committed !== undefined) {
    const e = committed?.entities.find(e => e.id === id);
    return e ? Object.freeze({ worldGeneration: committed.worldGeneration, plane: committed.plane, observedDay: committed.committedDay, entityId: e.id, name: e.name, x: e.x, y: e.y, species: e.sp, state: e.state, level: e.level, hpRatio: e.hpRatio, commitSequence: committed.commitSequence }) : null;
  }
  if (!world || !Number.isFinite(id) || plane !== (world.plane || 'mortal')) return null;
  const e = world.entities?.find(item => item?.id === id);
  if (!e) return null;
  return Object.freeze({ worldGeneration: worldGeneration(world), plane,
    observedDay: world.day, entityId: primitive(e.id), name: String(e.name || ''), x: primitive(e.x), y: primitive(e.y),
    species: primitive(e.sp), state: primitive(e.state), level: primitive(e.level), hpRatio: e.maxHp ? e.hp / e.maxHp : 0 });
}
