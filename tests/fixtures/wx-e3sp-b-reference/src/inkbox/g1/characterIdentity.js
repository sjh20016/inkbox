import { canAccess } from '../core/mapAccess.js';
import { upperArrivalOf, netherGhostOf } from '../sim/watch.js';
const selections = new WeakSet();
const transitions = new WeakMap();
const deaths = new WeakMap();
export function characterKey(plane, id) {
  return ['mortal','upper','nether'].includes(plane) && Number.isSafeInteger(id) && id > 0 ? `${plane}:${id}` : null;
}
export function parseCharacterKey(value) {
  if (typeof value !== 'string') return null;
  const m = /^(mortal|upper|nether):([1-9][0-9]*)$/.exec(value);
  if (!m) return null;
  const id = Number(m[2]);
  return characterKey(m[1], id) ? { key:value, plane:m[1], id } : null;
}
export function planeWorld(world, plane) { return plane === 'mortal' ? world : world?.[plane]; }
export function resolveCharacter(world, key, { token } = {}) {
  const identity = parseCharacterKey(key);
  if (!identity || !world) return {ok:false,reason:'invalid-target'};
  if (token && (!selections.has(token) || token.world !== world || token.key !== key)) return {ok:false,reason:'world-changed'};
  const sourceWorld = planeWorld(world,identity.plane);
  if (token && token.sourceWorld !== sourceWorld) return {ok:false,reason:'plane-world-changed'};
  if (!sourceWorld) return {ok:false,reason:'missing-plane'};
  const live = sourceWorld.entities?.find(e => e.id === identity.id);
  if (live && token && token.entity !== live) return {ok:false,reason:'identity-reused'};
  if (live && live.hp > 0 && !live._ascended) return {ok:true,...identity,status:'alive',entity:live,sourceWorld,accessible:canAccess(world,live.x,live.y)};
  const since = token?.initialStatus === 'alive' ? token.selectedDay : -Infinity;
  function transition(entity, proof, currentWorld) {
    if (!token) return true;
    if (deaths.has(token)) return false;
    const previous = transitions.get(token);
    if (previous && (previous.entity !== entity || previous.proof !== proof || previous.currentWorld !== currentWorld)) return false;
    transitions.set(token,{entity,proof,currentWorld});
    return true;
  }
  // The first live-to-dead transition binds its durable proof; later object swaps
  // cannot impersonate that life, even when the numeric ID is unchanged.
  function bindDeath(record, currentWorld, proof = null) {
    if (!token) return true;
    const previous = deaths.get(token);
    if (previous && (previous.record !== record || previous.currentWorld !== currentWorld)) return false;
    const migration = transitions.get(token);
    if (proof && migration && (migration.proof !== proof || migration.currentWorld !== currentWorld)) return false;
    deaths.set(token,{record,currentWorld});
    return true;
  }
  if (identity.plane === 'mortal') {
    const arrival = upperArrivalOf(world,key);
    if (arrival && arrival.day >= since && !(token?.initialStatus === 'alive' && arrival === token.previousArrival)) {
      const entity = world.upper.entities?.find(e => e.id === arrival.id && e.hp > 0);
      if (entity && !transition(entity,arrival,world.upper)) return {ok:false,reason:'identity-reused'};
      const upperDead = !entity && world.upper.dead?.find(e => e.id === arrival.id && e.died >= arrival.day);
      if (upperDead) {
        if (!bindDeath(upperDead,world.upper,arrival)) return {ok:false,reason:'identity-reused'};
        return {ok:true,...identity,status:'dead',entity:upperDead,sourceWorld:world.upper,currentPlane:'upper',accessible:false,arrival};
      }
      return {ok:true,...identity,status:'ascended',entity:entity || arrival,sourceWorld:world.upper,currentPlane:'upper',accessible:!!entity && canAccess(world,entity.x,entity.y),arrival};
    }
  }
  const dead = sourceWorld.dead?.find(e => e.id === identity.id && e.died >= since && !(token?.initialStatus === 'alive' && e === token.previousDead));
  if (dead) {
    if (!bindDeath(dead,sourceWorld)) return {ok:false,reason:'identity-reused'};
    if (token && token.initialStatus === 'dead' && token.entity !== dead) return {ok:false,reason:'identity-reused'};
    if (dead.fate === 'ascended') return {ok:true,...identity,status:'ascended',entity:dead,sourceWorld,currentPlane:'unknown',accessible:false,fateRecord:dead};
    return {ok:true,...identity,status:'dead',entity:dead,sourceWorld,accessible:false};
  }
  if (identity.plane === 'mortal') {
    const ghost = netherGhostOf(world,key);
    if (ghost && ghost.ghostOf.deathDay >= since && !(token?.initialStatus === 'alive' && ghost === token.previousGhost)) {
      if (!transition(ghost,ghost.ghostOf,world.nether)) return {ok:false,reason:'identity-reused'};
      return {ok:true,...identity,status:'nether',entity:ghost,sourceWorld:world.nether,currentPlane:'nether',accessible:ghost.hp > 0 && canAccess(world,ghost.x,ghost.y)};
    }
  }
  return {ok:true,...identity,status:'unknown',entity:null,sourceWorld,accessible:false};
}
export function createSelectionToken(world,key) {
  const r = resolveCharacter(world,key);
  if (!r.ok || !r.entity || (r.status === 'alive' && !r.accessible)) return null;
  const token = Object.freeze({world,key,entity:r.entity,sourceWorld:planeWorld(world,r.plane),selectedDay:world.day,initialStatus:r.status,previousArrival:upperArrivalOf(world,key),previousDead:r.sourceWorld.dead?.find(e => e.id === r.id),previousGhost:netherGhostOf(world,key)});
  selections.add(token);
  if (r.status === 'dead' || r.fateRecord) deaths.set(token,{record:r.entity,currentWorld:r.sourceWorld});
  if (r.status === 'ascended' && r.arrival) transitions.set(token,{entity:r.entity,proof:r.arrival,currentWorld:world.upper});
  if (r.status === 'nether') transitions.set(token,{entity:r.entity,proof:r.entity.ghostOf,currentWorld:world.nether});
  return token;
}
