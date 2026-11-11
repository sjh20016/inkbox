// Synchronous, transient facts. No simulation objects cross this boundary.
const states = new WeakMap();
let nextWorldGeneration = 1;

function state(world) {
  let value = states.get(world);
  if (!value) {
    value = { worldGeneration: nextWorldGeneration++, frameGeneration: 0, frame: null, dirty: true };
    states.set(world, value);
  }
  return value;
}

export function worldGeneration(world) { return state(world).worldGeneration; }
export function invalidateReadView(world) {
  if (world) { const s = state(world); s.dirty = true; s.frame = null; }
}
export function renderFrame(world, plane = world?.plane || 'mortal') {
  if (!world) return null;
  const s = state(world);
  if (!s.dirty && s.frame && s.frame.committedDay === world.day && s.frame.plane === plane) return s.frame;
  const entities = [];
  for (const e of world.entities || []) {
    if (!e) continue;
    entities.push(Object.freeze({
      id: e.id, x: e.x, y: e.y, tx: e.tx, ty: e.ty, sp: e.sp,
      state: e.state, level: e.level, hpRatio: e.maxHp ? e.hp / e.maxHp : 0,
      faction: e.faction, face: e.face, soulKind: e.soulKind || null,
      form: e.form || null, daoPath: e.dao?.path?.key || null,
    }));
  }
  const frame = Object.freeze({ schemaVersion: 1, worldGeneration: s.worldGeneration,
    plane, committedDay: world.day, frameGeneration: ++s.frameGeneration,
    entityCount: entities.length, entities: Object.freeze(entities) });
  s.frame = frame; s.dirty = false;
  return frame;
}
export function getWorldStatus(world, plane = world?.plane || 'mortal') {
  if (!world) return null;
  return Object.freeze({ schemaVersion: 1, worldGeneration: worldGeneration(world),
    plane, observedDay: world.day, seed: world.seed >>> 0,
    entityCount: world.entities?.length || 0 });
}
export function getEntityInspection(world, plane, id) {
  if (!world || !Number.isFinite(id)) return null;
  const e = world.entities?.find(item => item?.id === id);
  if (!e) return null;
  return Object.freeze({ worldGeneration: worldGeneration(world), plane,
    observedDay: world.day, entityId: e.id, name: e.name || '', x: e.x, y: e.y,
    species: e.sp, state: e.state, level: e.level, hpRatio: e.maxHp ? e.hp / e.maxHp : 0 });
}
