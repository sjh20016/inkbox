import { settlementCondition } from '../world/settlementState.js';

export const OBSERVE_MARK_LIMIT = 32;
const copy = (value) => JSON.parse(JSON.stringify(value));
const number = (value) => Number.isFinite(value) ? value : null;
const empty = () => ({ focus: null, marks: [], nextMarkId: 1, discardedMarks: 0 });
const data = (world) => world.observeEcho || (world.observeEcho = empty());
const historyNode = (node) => ({ day: number(node.day), type: node.type || '', text: node.text || '',
  settlementId: number(node.settlementId), factionId: number(node.factionId), factionName: node.factionName || null });

function snapshot(world, place, ruin = false) {
  const condition = settlementCondition(world, place);
  const x = Math.floor(place.x), y = Math.floor(place.y);
  const index = world.inside(x, y) ? world.idx(x, y) : -1;
  const history = (place.history || []).slice(-16).map(historyNode);
  return { id: place.id, name: place.name, x: place.x, y: place.y, plane: world.plane || 'mortal',
    status: condition.status, pop: ruin ? null : number(place.pop), hp: ruin ? null : number(place.hp),
    food: ruin ? null : number(place.food), houses: condition.liveHouses, ruinedHouses: condition.ruinedHouses,
    factionName: ruin ? place.lastFactionName || null : world.factionById(place.faction)?.name || null,
    lastDamageDay: number(place.lastDamageDay), lastDamageReason: place.lastDamageReason || null,
    lastAidDay: number(place.lastAidDay), destroyedDay: number(place.destroyedDay), reason: place.reason || null,
    water: index < 0 ? null : number(world.water[index]), fire: index < 0 ? null : number(world.fire[index]),
    aidSpentProvisions: ruin ? number(place.aidSpentProvisions) : number(place.aidSpentProvisions ?? 0),
    aidSpentSpiritStone: ruin ? number(place.aidSpentSpiritStone) : number(place.aidSpentSpiritStone ?? 0),
    historyAnchor: { count: history.length, tail: history.length ? JSON.stringify(history.at(-1)) : null,
      entries: history.map((node) => JSON.stringify(node)) } };
}

export function readObserveEcho(world) { return copy(world.observeEcho || empty()); }
export function resolveObservedSettlement(world, id) {
  const living = world.villageById(id);
  if (living) return { kind: 'living', settlement: snapshot(world, living) };
  const ruin = (world.settlementRuins || []).find((place) => place.id === id);
  return ruin ? { kind: 'ruin', settlement: snapshot(world, ruin, true) } : { kind: 'missing', settlement: null };
}
export function focusSettlement(world, id) {
  const resolved = resolveObservedSettlement(world, id);
  if (!resolved.settlement) return null;
  const s = resolved.settlement;
  const focus = { settlementId: s.id, name: s.name, x: s.x, y: s.y, plane: s.plane, day: world.day, snapshot: s };
  data(world).focus = focus;
  return copy(focus);
}
export function clearSettlementFocus(world) { if (world.observeEcho) world.observeEcho.focus = null; }

function revisit(world, baseline, id, day) {
  const current = resolveObservedSettlement(world, id);
  const after = current.settlement;
  const delta = (key) => Number.isFinite(baseline?.[key]) && Number.isFinite(after?.[key])
    ? after[key] - baseline[key] : null;
  const place = current.kind === 'living' ? world.villageById(id)
    : (world.settlementRuins || []).find((ruin) => ruin.id === id);
  const nodes = (place?.history || []).slice(-16).map(historyNode);
  const anchor = baseline?.historyAnchor;
  let start = -1;
  if (anchor?.count === 0) start = 0;
  else if (anchor?.entries?.length) {
    const signatures = nodes.map((node) => JSON.stringify(node));
    // The retained baseline suffix must overlap the current prefix. This also
    // distinguishes repeated identical same-day entries while the window grows.
    for (let length = Math.min(anchor.entries.length, signatures.length); length > 0; length -= 1) {
      if (anchor.entries.slice(-length).every((value, i) => value === signatures[i])) { start = length; break; }
    }
  }
  const incomplete = !place || start < 0 || (anchor?.count === 0 && nodes.length >= 16);
  const entries = start >= 0 ? nodes.slice(start) : nodes.filter((node) => node.day > day);
  return { current, changes: Object.fromEntries(['pop', 'hp', 'food', 'houses', 'ruinedHouses', 'water', 'fire'].map((key) => [key, delta(key)])),
    aidDelta: { provisions: delta('aidSpentProvisions'), spiritStone: delta('aidSpentSpiritStone') },
    history: { entries, limit: 16, fromDay: day ?? null, toDay: world.day,
      windowMayBeIncomplete: incomplete,
      note: incomplete ? '地方史仅保留最近16条，期间详录可能未保留' : '地方史仅保留最近16条' } };
}
export function settlementRevisit(world, focus = world.observeEcho?.focus) {
  return { focus: focus ? copy(focus) : null, ...revisit(world, focus?.snapshot, focus?.settlementId, focus?.day) };
}
export function markRevisit(world, mark) {
  return { mark: mark ? copy(mark) : null, ...revisit(world, mark?.after, mark?.settlementId, mark?.day) };
}

// Called once on the first recorded cell of a confirmed drain transaction.
export function beginDrainEcho(world, meta) {
  if (meta?.toolId !== 'drain') return null;
  const radius = Math.max(0, Number(meta.radius) || 0);
  // Capture each bounded settlement once before any cell changes. A long
  // stroke can reach a settlement far from its starting point; association is
  // decided at commit from the cells whose water actually changed.
  const candidates = world.villages.map((village) => ({ id: village.id,
    before: snapshot(world, village),
    indices: [village, ...(village.houses || [])].filter((point) => world.inside(Math.floor(point.x), Math.floor(point.y)))
      .map((point) => world.idx(Math.floor(point.x), Math.floor(point.y))) }));
  return { toolId: 'drain', day: world.day, x: number(meta.x), y: number(meta.y), radius,
    focusId: world.observeEcho?.focus?.settlementId ?? null, candidates };
}
export function commitDrainEcho(world, pending, changes, after) {
  if (!pending) return null;
  let changedCells = 0, waterBefore = 0, waterAfter = 0;
  const changed = new Set();
  for (const [index, before] of changes) {
    const water = after.get(index).w;
    if (before.w === water) continue;
    changed.add(index);
    changedCells += 1; waterBefore += before.w; waterAfter += water;
  }
  if (!changedCells) return null;
  const candidates = pending.candidates.filter((village) => village.indices.some((index) => changed.has(index)));
  candidates.sort((a, b) => ((a.id === pending.focusId ? -1 : 0) - (b.id === pending.focusId ? -1 : 0))
    || Math.hypot(a.before.x - pending.x, a.before.y - pending.y)
      - Math.hypot(b.before.x - pending.x, b.before.y - pending.y) || a.id - b.id);
  const settlementId = candidates[0]?.id ?? null;
  const state = data(world);
  const mark = { toolId: pending.toolId, day: pending.day, x: pending.x, y: pending.y, radius: pending.radius,
    settlementId, before: candidates[0]?.before ?? null,
    id: state.nextMarkId++, changedCells, waterBefore, waterAfter,
    after: resolveObservedSettlement(world, settlementId).settlement,
    status: 'committed', undoAvailable: true, undoReason: null };
  state.marks.push(mark);
  if (state.marks.length > OBSERVE_MARK_LIMIT) { state.discardedMarks += state.marks.length - OBSERVE_MARK_LIMIT; state.marks.splice(0, state.marks.length - OBSERVE_MARK_LIMIT); }
  return mark.id;
}
export function updateDrainUndo(world, id, status, reason = null) {
  const mark = world.observeEcho?.marks.find((entry) => entry.id === id);
  if (!mark) return;
  if (status) { mark.status = status; mark.undoReason = reason; }
  mark.undoAvailable = status === 'undo-refused';
}
export function restoreObserveEcho(value) {
  if (!value || typeof value !== 'object') return null;
  const state = copy(value);
  state.focus ||= null;
  const discarded = Array.isArray(state.marks) ? Math.max(0, state.marks.length - OBSERVE_MARK_LIMIT) : 0;
  state.marks = Array.isArray(state.marks) ? state.marks.slice(-OBSERVE_MARK_LIMIT) : [];
  state.nextMarkId = Math.max(1, Number(state.nextMarkId) || 1, ...state.marks.map((mark) => (Number(mark.id) || 0) + 1));
  state.discardedMarks = Math.max(0, Number(state.discardedMarks) || 0) + discarded;
  for (const mark of state.marks) mark.undoAvailable = false;
  return state;
}
