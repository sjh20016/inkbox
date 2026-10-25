import { WANLING_BY_KEY } from '../core/wanlingCatalog.js';

export const WANLING_LIMITS = Object.freeze({ units: 96, rare: 36, perForm: 8, effects: 64, events: 64, jobs: 96 });
export function wanlingState(world) {
  return world.wanling ||= { v: 1, enabled: true, nextId: 1, lastEcoDay: world.day,
    lastSpawnDay: world.day, lastPathDay: world.day, units: [], effects: [], jobs: [], events: [], stats: {} };
}
export function liveWanling(world) { return (world?.wanling?.units || []).filter(u => u.hp > 0 && u.state !== 'dissipated'); }
export function wanlingById(world,id) { return (world?.wanling?.units || []).find(u => u.id === Number(id)) || null; }
export function wanlingEvent(world, unit, text, kind = 'wanling') {
  const s = wanlingState(world);
  const event = { day: world.day, id: unit?.id || 0, form: unit?.form || null, x: unit?.x ?? 0, y: unit?.y ?? 0, text: String(text).slice(0,240) };
  s.events.push(event); if (s.events.length > WANLING_LIMITS.events) s.events.shift();
  world.record?.(event.text,kind);
}
export function addWanlingEffect(world,effect) {
  const s = wanlingState(world);
  s.effects = s.effects.filter(e => e.untilDay > world.day && !(e.kind === effect.kind && e.sourceId === effect.sourceId && e.targetId === effect.targetId));
  if (s.effects.length >= WANLING_LIMITS.effects) s.effects.shift();
  s.effects.push({ ...effect }); return effect;
}
export function wanlingEffectAt(world,kind,x,y) {
  if (world?.wanling?.enabled === false) return 0;
  let value = 0;
  for (const e of world?.wanling?.effects || []) {
    if (e.kind !== kind || e.untilDay <= world.day) continue;
    const source = e.sourceId < 0 ? wanlingById(world,e.sourceId) : world.entities?.find(p => p.id === e.sourceId);
    if (e.sourceId && (!source || source.hp <= 0 || source._ascended)) continue;
    if (Math.hypot(x-e.x,y-e.y) <= (e.radius || 0)) value += e.value || 0;
  }
  return value;
}
// Independent objects use an explicit optional block, not human entity rows.
// Validate before assigning to World, so a damaged import cannot drop live cargo-like facts silently.
export function snapshotWanling(world) { return world?.wanling ? structuredClone(world.wanling) : null; }
export function restoreWanling(world,data) {
  if (data == null) return;
  const fail = () => { throw new Error('万灵存档区块损坏或版本不受支持'); };
  if (data.v !== 1 || typeof data.enabled !== 'boolean' || !Number.isSafeInteger(data.nextId) || data.nextId < 1) fail();
  for (const [key,cap] of [['units',96],['effects',64],['jobs',96],['events',64]])
    if (!Array.isArray(data[key]) || data[key].length > cap) fail();
  for (const key of ['lastEcoDay','lastSpawnDay','lastPathDay']) if (!Number.isFinite(data[key]) || data[key] > world.day + 1e-6) fail();
  const ids = new Set();
  for (const u of data.units) {
    if (!Number.isSafeInteger(u.id) || u.id >= 0 || -u.id >= data.nextId || ids.has(u.id)
      || !WANLING_BY_KEY.has(u.form) || WANLING_BY_KEY.get(u.form).derived
      || !['beast','spirit'].includes(u.sp) || !Number.isFinite(u.hp) || !Number.isFinite(u.maxHp) || u.maxHp <= 0
      || !Number.isFinite(u.x) || !Number.isFinite(u.y) || u.x < 0 || u.y < 0 || u.x >= world.w || u.y >= world.h
      || !Number.isFinite(u.count) || u.count < 0 || u.count > 100 || typeof u.state !== 'string') fail();
    ids.add(u.id);
  }
  for (const e of data.effects) if (typeof e.kind !== 'string' || !Number.isFinite(e.untilDay)
    || !Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.radius) || e.radius < 0 || e.radius > 32 || !Number.isFinite(e.value)) fail();
  // Only JSON data: no accidental World references, non-finite cooldowns or unbounded strings.
  function validate(value,depth=0) {
    if (depth > 12) fail();
    if (typeof value === 'number' && !Number.isFinite(value)) fail();
    if (typeof value === 'string' && value.length > 1200) fail();
    if (value && typeof value === 'object') for (const key of Object.keys(value)) {
      if (['__proto__','constructor','prototype'].includes(key)) fail(); validate(value[key],depth+1);
    }
  }
  validate(data); world.wanling = structuredClone(data);
}
