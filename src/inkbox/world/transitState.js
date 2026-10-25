// Durable transit facts. Route geometry belongs to transitGeography, never the save.
export const ACTIVE = Object.freeze(['active', 'blocked', 'landing']);
const active = status => ACTIVE.includes(status);
const point = (p, world) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
  && p.x >= 0 && p.y >= 0 && p.x < world.w && p.y < world.h;
const natural = n => Number.isSafeInteger(n) && n >= 0;
const finite = n => Number.isFinite(n) && n >= 0 && n <= 1e12;
const id = n => Number.isSafeInteger(n) && n > 0;

export function activeJourneyForEntity(world, entityId) {
  if (!id(entityId)) return null;
  return world?.transit?.journeys?.find(j => j.actorId === entityId && active(j.status)) || null;
}

export function readTransitJourneys(world) {
  return (world?.transit?.journeys || []).slice(0, 36).map(j => ({
    id:j.id, kind:j.kind, mode:j.mode, status:j.status, reason:j.reason,
    actorId:j.actorId, vehicleId:j.vehicleId, fromVillageId:j.fromVillageId,
    toVillageId:j.toVillageId, cargo:{food:j.cargo.food},
    position:{...j.position}, departDay:j.departDay, updatedDay:j.updatedDay,
    etaDay:j.etaDay, goal:{...j.goal}, progress:j.progress, distance:j.distance,
    legMode:j.legMode,
  }));
}

export function snapshotTransit(world) {
  const s = world?.transit;
  if (!s) return null;
  return {v:1,nextId:s.nextId,dispatchDay:s.dispatchDay,ledger:{...s.ledger},journeys:readTransitJourneys(world)};
}

/** Missing data is an older save; malformed or future data rejects the load. */
export function restoreTransitSnapshot(data, world) {
  if (data == null) return null;
  if (data.v !== 1 || !Array.isArray(data.journeys) || data.journeys.length > 36
    || !id(data.nextId) || !Number.isFinite(data.dispatchDay)) throw new Error('Invalid transit snapshot');
  const ledger = data.ledger;
  if (!ledger || !['loaded','delivered','lost','returned'].every(k => finite(ledger[k]))) throw new Error('Invalid transit ledger');
  const seen = new Set(), actors = new Set(), journeys = [];
  for (const j of data.journeys) {
    if (!id(j.id) || j.id >= data.nextId || seen.has(j.id) || !['cargo','person'].includes(j.kind)
      || !['water','air'].includes(j.mode)
      || !['active','blocked','landing','arrived','cancelled','lost'].includes(j.status)
      || (j.kind === 'cargo' && j.mode !== 'water') || (j.kind === 'person' && j.mode !== 'air')
      || !id(j.actorId) || !id(j.fromVillageId) || !id(j.toVillageId)
      || !point(j.position,world) || !finite(j.departDay) || !finite(j.updatedDay)
      || !finite(j.etaDay) || !finite(j.progress) || !finite(j.distance)
      || !['land','water','air'].includes(j.legMode)
      || !j.cargo || !natural(j.cargo.food) || j.cargo.food > 24
      || !j.goal || j.goal.villageId !== j.toVillageId
      || typeof j.goal.cancelRequested !== 'boolean'
      || typeof j.goal.sourceReached !== 'boolean'
      || (j.status === 'landing' && !j.goal.cancelRequested)
      || (j.vehicleId !== null && typeof j.vehicleId !== 'string')
      || (j.reason !== null && typeof j.reason !== 'string')
      || (active(j.status) && actors.has(j.actorId))) throw new Error('Invalid transit journey');
    seen.add(j.id); if (active(j.status)) actors.add(j.actorId);
    journeys.push({id:j.id,kind:j.kind,mode:j.mode,status:j.status,reason:j.reason,
      actorId:j.actorId,vehicleId:j.vehicleId,fromVillageId:j.fromVillageId,
      toVillageId:j.toVillageId,cargo:{food:j.cargo.food},position:{x:j.position.x,y:j.position.y},
      departDay:j.departDay,updatedDay:j.updatedDay,etaDay:j.etaDay,
      goal:{villageId:j.toVillageId,cancelRequested:j.goal.cancelRequested,
        sourceReached:j.goal.sourceReached},
      progress:j.progress,distance:j.distance,legMode:j.legMode});
  }
  if (actors.size > 12 || journeys.filter(j => !active(j.status)).length > 24) throw new Error('Transit capacity exceeded');
  return {v:1,nextId:data.nextId,dispatchDay:data.dispatchDay,
    ledger:{loaded:ledger.loaded,delivered:ledger.delivered,lost:ledger.lost,returned:ledger.returned},journeys};
}
