// Synchronous, transient facts. No simulation objects cross this boundary.
const states = new WeakMap();
let nextWorldGeneration = 1;
const primitive = value => value == null || ['string', 'number', 'boolean'].includes(typeof value) ? value : null;

function state(world) {
  let value = states.get(world);
  if (!value) {
    value = { worldGeneration: nextWorldGeneration++, frameGeneration: 0, frame: null, revision: null, dirty: true };
    states.set(world, value);
  }
  return value;
}

export function worldGeneration(world) { return state(world).worldGeneration; }
export function invalidateReadView(world) {
  if (world) { const s = state(world); s.dirty = true; s.frame = null; }
}
export function renderFrame(world, plane = world?.plane || 'mortal', { refresh = false } = {}) {
  if (!world || plane !== (world.plane || 'mortal')) return null;
  const s = state(world);
  if (!refresh && !s.dirty && s.frame && s.frame.committedDay === world.day && s.frame.plane === plane && s.revision === world.revision) return s.frame;
  const entities = [];
  for (const e of world.entities || []) {
    if (!e) continue;
    const daoPath = primitive(e.dao?.path?.key) || null;
    entities.push(Object.freeze({
      id: primitive(e.id), entityKey: `${plane}:${e.id}`, x: primitive(e.x), y: primitive(e.y), tx: primitive(e.tx), ty: primitive(e.ty), sp: primitive(e.sp),
      state: primitive(e.state), level: primitive(e.level), hp: primitive(e.hp), maxHp: primitive(e.maxHp),
      hpRatio: e.maxHp ? e.hp / e.maxHp : 0,
      faction: primitive(e.faction), face: primitive(e.face), soulKind: primitive(e.soulKind) || null,
      form: primitive(e.form) || null, daoPath,
      dao: daoPath ? Object.freeze({ path: Object.freeze({ key: daoPath }) }) : null,
    }));
  }
  const frame = Object.freeze({ schemaVersion: 1, worldGeneration: s.worldGeneration,
    plane, committedDay: world.day, frameGeneration: ++s.frameGeneration,
    entityCount: entities.length, entities: Object.freeze(entities) });
  s.frame = frame; s.revision = world.revision; s.dirty = false;
  return frame;
}
export function getWorldStatus(world, plane = world?.plane || 'mortal') {
  if (!world) return null;
  return Object.freeze({ schemaVersion: 1, worldGeneration: worldGeneration(world),
    plane, observedDay: world.day, seed: world.seed >>> 0,
    entityCount: world.entities?.length || 0 });
}
export function getEntityInspection(world, plane, id) {
  if (!world || !Number.isFinite(id) || plane !== (world.plane || 'mortal')) return null;
  const e = world.entities?.find(item => item?.id === id);
  if (!e) return null;
  return Object.freeze({ worldGeneration: worldGeneration(world), plane,
    observedDay: world.day, entityId: primitive(e.id), name: String(e.name || ''), x: primitive(e.x), y: primitive(e.y),
    species: primitive(e.sp), state: primitive(e.state), level: primitive(e.level), hpRatio: e.maxHp ? e.hp / e.maxHp : 0 });
}
