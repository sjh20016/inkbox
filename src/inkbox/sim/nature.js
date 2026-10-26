// Finite, game-day driven mortal environmental changes. No world-wide runtime scan.
import { OVER, markDirty, flushDirty } from '../world/terrain.js';
import { noteTerrainCell } from '../world/terrainChanges.js';
import { emitPresentation } from './presentation.js';
import { invalidateTransitGeography } from '../world/transitGeography.js';

export const NATURE_VERSION = 2;
export const NATURE_DAYS = Object.freeze({ fire: 7, scorched: 1080, ash: 720, lava: 180, flood: 30 });
const VEG_SAVE_STEPS = 65535;

function sameSavedVeg(a, b) {
  return Number.isFinite(a) && Number.isFinite(b)
    && Math.round(a * VEG_SAVE_STEPS) === Math.round(b * VEG_SAVE_STEPS);
}

export function natureState(world) {
  if (!world.nature || world.nature.version !== NATURE_VERSION) {
    world.nature = { version: NATURE_VERSION, nextId: 1, events: [], floods: new Map(), fires: new Map(), overlays: new Map() };
  }
  return world.nature;
}

function event(world, kind, dueDay, cell, extra = {}) {
  const state = natureState(world);
  const item = { id: state.nextId++, kind, dueDay, cell, ...extra };
  state.events.push(item);
  return item;
}

export function igniteCell(world, i, power = 1, { vegetationBurned = false } = {}) {
  if (world.water[i] > 0.02) return false;
  const state = natureState(world);
  const old = state.fires.get(i);
  const dueDay = Math.max(old?.dueDay || 0, world.day + NATURE_DAYS.fire);
  const strength = Math.min(1, 0.45 + power * 0.4);
  const blockedBefore = world.fire[i] >= 0.55;
  world.fire[i] = Math.max(world.fire[i], strength);
  noteTerrainCell(world, 'fire', i);
  if (blockedBefore !== (world.fire[i] >= 0.55)) invalidateTransitGeography(world);
  if (old) { old.dueDay = dueDay; old.vegetationBurned ||= vegetationBurned; }
  else state.fires.set(i, event(world, 'fire', dueDay, i, {
    startDay: world.day, overlayAtIgnition: world.over[i], vegetationBurned,
    recoverVeg: world.veg[i], expectedVeg: world.veg[i],
  }));
  world.touch({ terrain: false });
  return true;
}

export function extinguishCell(world, i) {
  if (!world.fire[i] && !world.nature?.fires?.has(i)) return;
  if (world.fire[i] >= 0.55) invalidateTransitGeography(world);
  world.fire[i] = 0;
  noteTerrainCell(world, 'fire', i);
  const state = natureState(world), item = state.fires.get(i);
  if (item) { state.fires.delete(i); state.events = state.events.filter((e) => e !== item); }
  world.touch({ terrain: false });
}

export function fireExposure(world, i, startDay, endDay) {
  const item = world.nature?.fires?.get(i);
  if (item) return Math.max(0, Math.min(endDay, item.dueDay) - Math.max(startDay, item.startDay));
  return world.fire[i] > 0.4 ? endDay - startDay : 0;
}

/** Consecutive wet time within one advance, including overlapping flood layers. */
export function floodExposure(world, i, startDay, endDay, threshold) {
  const entry = world.nature?.floods?.get(i);
  if (!entry) {
    const wet = world.water[i] >= threshold;
    return { days: wet ? endDay - startDay : 0, atEnd: wet };
  }
  const events = new Map(world.nature.events.filter((e) => e.kind === 'flood').map((e) => [e.id, e]));
  const levels = [...entry.levels].map(([id, depth]) => ({ depth, dueDay: events.get(id)?.dueDay ?? -Infinity }));
  const boundaries = [startDay, ...new Set(levels.map((e) => e.dueDay).filter((due) => due > startDay && due < endDay)), endDay].sort((a, b) => a - b);
  const depthAt = (day) => entry.base + levels.reduce((sum, level) => sum + (level.dueDay > day ? level.depth : 0), 0);
  let days = 0;
  for (let k = 1; k < boundaries.length; k++) {
    const a = boundaries[k - 1], b = boundaries[k];
    if (depthAt((a + b) / 2) >= threshold) days += b - a;
  }
  return { days, atEnd: depthAt(endDay) >= threshold };
}

export function setRecoveringOverlay(world, i, overlay, duration = null, startDay = world.day, recovery = null) {
  const state = natureState(world);
  const old = state.overlays.get(i);
  if (old) state.events = state.events.filter((e) => e !== old);
  state.overlays.delete(i);
  world.over[i] = overlay;
  const days = duration ?? (overlay === OVER.LAVA ? NATURE_DAYS.lava : overlay === OVER.ASH ? NATURE_DAYS.ash : overlay === OVER.SCORCHED ? NATURE_DAYS.scorched : 0);
  const next = days > 0 ? event(world, 'overlay', startDay + days, i, { overlay, ...(recovery || {}) }) : null;
  if (next) state.overlays.set(i, next);
  markDirty(world, i);
  return next;
}

export function floodCells(world, cells, duration = NATURE_DAYS.flood, { present = true } = {}) {
  const state = natureState(world);
  const id = state.nextId++;
  const item = { id, kind: 'flood', dueDay: world.day + duration, cells: [] };
  let changed = 0, fromDepth = 0, toDepth = 0, xSum = 0, ySum = 0;
  for (const [i, depth] of cells) {
    if (!(depth > 0)) continue;
    const oldWater = world.water[i];
    let entry = state.floods.get(i);
    if (!entry) { entry = { base: world.water[i], levels: new Map() }; state.floods.set(i, entry); }
    entry.levels.set(id, depth);
    item.cells.push(i);
    world.water[i] = Math.fround(entry.base + [...entry.levels.values()].reduce((a, b) => a + b, 0));
    if (world.water[i] !== oldWater) noteTerrainCell(world, 'water', i);
    if (world.water[i] !== oldWater) { changed++; fromDepth += oldWater; toDepth += world.water[i]; xSum += i % world.w; ySum += Math.floor(i / world.w); }
    extinguishCell(world, i);
    markDirty(world, i);
  }
  if (item.cells.length) state.events.push(item);
  flushDirty(world);
  if (present && changed) emitPresentation(world, 'tool-impact', { x: xSum / changed, y: ySum / changed,
    data: { tool: 'water-response', phase: 'rise', radius: Math.sqrt(changed / Math.PI), affectedCells: changed, source: 'flood', fromDepth, toDepth } });
  return item.cells.length ? id : null;
}

function removeFlood(world, item, present = true) {
  const state = natureState(world);
  let changed = 0, fromDepth = 0, toDepth = 0, xSum = 0, ySum = 0;
  for (const i of item.cells) {
    const entry = state.floods.get(i);
    if (!entry?.levels.has(item.id)) continue; // cell was edited after flooding
    const oldWater = world.water[i];
    entry.levels.delete(item.id);
    if (!entry.levels.size) state.floods.delete(i);
    world.water[i] = Math.fround(entry.base + [...entry.levels.values()].reduce((a, b) => a + b, 0));
    if (world.water[i] !== oldWater) noteTerrainCell(world, 'water', i);
    if (world.water[i] !== oldWater) { changed++; fromDepth += oldWater; toDepth += world.water[i]; xSum += i % world.w; ySum += Math.floor(i / world.w); }
    markDirty(world, i);
  }
  if (present && changed) emitPresentation(world, 'tool-impact', { x: xSum / changed, y: ySum / changed,
    data: { tool: 'water-response', phase: 'recede', radius: Math.sqrt(changed / Math.PI), affectedCells: changed, source: 'flood', fromDepth, toDepth } });
}

/** A player edit detaches only its cell from active floods, preserving the new state. */
export function playerEditedCell(world, i) {
  world.nature?.floods?.delete(i);
  const state = world.nature;
  if (!state) return;
  const fire = state.fires.get(i);
  if (fire) fire.recoveryCancelled = true;
  const overlay = state.overlays.get(i);
  if (overlay?.recoverVeg !== undefined) {
    // Keep the old cover's deadline; cancel only its claim over vegetation.
    delete overlay.recoverVeg;
    delete overlay.expectedVeg;
  }
}

/** Brush water edits keep temporary flood ownership until its real due day. */
export function editFloodWater(world, i, delta) {
  const entry = world.nature?.floods?.get(i);
  if (!entry || !Number.isFinite(delta) || delta === 0) return false;
  const old = world.water[i];
  if (Math.fround(Math.max(0, old + delta)) === old) return false;
  if (delta > 0) entry.base = Math.fround(entry.base + delta);
  else {
    let remaining = -delta;
    const layers = [...entry.levels].sort(([a], [b]) => a - b);
    for (const [id, depth] of layers) {
      const taken = Math.min(depth, remaining);
      if (taken <= 0) break;
      const next = Math.fround(depth - taken);
      if (next > 0) entry.levels.set(id, next);
      else entry.levels.delete(id);
      remaining -= taken;
    }
    if (remaining > 0) entry.base = Math.fround(Math.max(0, entry.base - remaining));
  }
  if (!entry.levels.size) world.nature.floods.delete(i);
  world.water[i] = Math.fround(entry.base + [...entry.levels.values()].reduce((sum, depth) => sum + depth, 0));
  if (world.water[i] !== old) noteTerrainCell(world, 'water', i);
  markDirty(world, i);
  return world.water[i] !== old;
}

export function snapshotFloodCell(world, i) {
  const entry = world.nature?.floods?.get(i);
  return entry ? [entry.base, [...entry.levels]] : null;
}

/** Resolve a stroke snapshot against floods which still exist at this day. */
export function restoredFloodWater(world, snapshot, recordedWater) {
  if (!snapshot) return recordedWater;
  const active = new Set(world.nature?.events?.filter((e) => e.kind === 'flood' && e.dueDay > world.day).map((e) => e.id) || []);
  const retained = snapshot[1].filter(([id]) => active.has(id));
  return retained.length === snapshot[1].length
    ? recordedWater
    : Math.fround(snapshot[0] + retained.reduce((sum, [, depth]) => sum + depth, 0));
}

export function snapshotNatureCell(world, i) {
  const state = world.nature;
  if (!state) return null;
  return {
    fire: state.fires.get(i) ? { ...state.fires.get(i) } : null,
    overlay: state.overlays.get(i) ? { ...state.overlays.get(i) } : null,
    flood: snapshotFloodCell(world, i),
  };
}

export function restoreNatureCell(world, i, snapshot) {
  const state = natureState(world);
  state.events = state.events.filter((e) => !((e.kind === 'fire' || e.kind === 'overlay') && e.cell === i));
  state.fires.delete(i); state.overlays.delete(i);
  if (snapshot?.fire) {
    const item = { ...snapshot.fire }; state.fires.set(i, item); state.events.push(item);
  }
  if (snapshot?.overlay) {
    const item = { ...snapshot.overlay }; state.overlays.set(i, item); state.events.push(item);
  }
  restoreFloodCell(world, i, snapshot?.flood || null);
}

export function restoreFloodCell(world, i, snapshot) {
  const state = natureState(world);
  if (!snapshot) { state.floods.delete(i); return; }
  // Undo may happen long after the flood was settled or cancelled. Never put
  // its former depth back without the live event which owns that depth.
  const active = new Set(state.events.filter((e) => e.kind === 'flood' && e.dueDay > world.day).map((e) => e.id));
  const levels = new Map(snapshot[1].filter(([id]) => active.has(id)));
  if (levels.size) state.floods.set(i, { base: snapshot[0], levels });
  else state.floods.delete(i);
  if (levels.size !== snapshot[1].length) {
    world.water[i] = restoredFloodWater(world, snapshot, world.water[i]);
    noteTerrainCell(world, 'water', i);
    markDirty(world, i);
  }
}

export function cancelNatureEvent(world, id) {
  const state = world.nature;
  if (!state) return false;
  const item = state.events.find((e) => e.id === id);
  if (!item) return false;
  if (item.kind === 'flood') removeFlood(world, item, false);
  else if (item.kind === 'fire' && state.fires.get(item.cell) === item) { state.fires.delete(item.cell); world.fire[item.cell] = 0; noteTerrainCell(world, 'fire', item.cell); }
  else if (item.kind === 'overlay' && state.overlays.get(item.cell) === item) state.overlays.delete(item.cell);
  state.events = state.events.filter((e) => e !== item);
  flushDirty(world);
  world.touch({ terrain: false });
  return true;
}

export function settleNature(world, day = world.day) {
  const state = world.nature;
  if (!state?.events.length) return 0;
  let changed = 0;
  // Only the active event list is inspected. Expired entries settle exactly once.
  const pending = state.events;
  state.events = [];
  for (let index = 0; index < pending.length; index++) {
    const item = pending[index];
    if (item.dueDay > day) {
      if (item.kind === 'flood' || (item.kind === 'fire' && state.fires.get(item.cell) === item)
        || (item.kind === 'overlay' && state.overlays.get(item.cell) === item)) state.events.push(item);
      continue;
    }
    if (item.kind === 'flood') removeFlood(world, item);
    else if (item.kind === 'fire' && state.fires.get(item.cell) === item) {
      state.fires.delete(item.cell);
      world.fire[item.cell] = 0;
      noteTerrainCell(world, 'fire', item.cell);
      let recovery = null;
      const priorRecovery = state.overlays.get(item.cell);
      if (item.vegetationBurned) {
        if (!item.recoveryCancelled && priorRecovery?.recoverVeg !== undefined) {
          recovery = { recoverVeg: priorRecovery.recoverVeg, expectedVeg: priorRecovery.expectedVeg };
        }
      } else if (item.expectedVeg === undefined || sameSavedVeg(world.veg[item.cell], item.expectedVeg)) {
        const recoverVeg = item.recoverVeg ?? world.veg[item.cell];
        world.veg[item.cell] = Math.max(0, world.veg[item.cell] * 0.25);
        noteTerrainCell(world, 'veg', item.cell);
        if (!item.recoveryCancelled) recovery = { recoverVeg, expectedVeg: world.veg[item.cell] };
      }
      markDirty(world, item.cell);
      // A later settlement or player action can put a permanent cover here.
      // Fire expiry cannot erase a later cover; direct ignition still applies its vegetation loss.
      const original = item.overlayAtIgnition ?? OVER.NONE;
      if (world.over[item.cell] === original && (original === OVER.NONE || original === OVER.FARMLAND || original === OVER.SCORCHED)) {
        const next = setRecoveringOverlay(world, item.cell, OVER.SCORCHED, null, item.dueDay, recovery);
        if (next?.dueDay <= day) { state.events.pop(); pending.push(next); }
      }
    } else if (item.kind === 'overlay' && state.overlays.get(item.cell) === item) {
      state.overlays.delete(item.cell);
      if (world.over[item.cell] === item.overlay) {
        if (item.recoverVeg !== undefined && sameSavedVeg(world.veg[item.cell], item.expectedVeg) && world.water[item.cell] <= 0.02) {
          world.veg[item.cell] = item.recoverVeg;
          noteTerrainCell(world, 'veg', item.cell);
          markDirty(world, item.cell);
        }
        const next = setRecoveringOverlay(world, item.cell, item.overlay === OVER.LAVA ? OVER.ASH : OVER.NONE, null, item.dueDay);
        if (next?.dueDay <= day) { state.events.pop(); pending.push(next); }
      }
    }
    changed++;
  }
  if (changed) { flushDirty(world); world.touch({ terrain: false }); }
  return changed;
}

export function snapshotNature(world) {
  const state = world.nature?.version === NATURE_VERSION ? world.nature : null;
  if (!state) return { version: NATURE_VERSION, nextId: 1, events: [], floods: [] };
  return { version: NATURE_VERSION, nextId: state.nextId, events: state.events.map((e) => ({ ...e, cells: e.cells?.slice() })), floods: [...state.floods].map(([i, e]) => [i, e.base, [...e.levels]] ) };
}

export function restoreNature(world, data) {
  const state = natureState(world);
  if (data?.version === NATURE_VERSION) {
    state.nextId = data.nextId || 1;
    state.events = Array.isArray(data.events) ? data.events.filter((e) => Number.isFinite(e.dueDay)) : [];
    state.floods = new Map((data.floods || []).filter(([i]) => i >= 0 && i < world.size).map(([i, base, levels]) => [i, { base, levels: new Map(levels) }]));
    state.fires = new Map(state.events.filter((e) => e.kind === 'fire').map((e) => [e.cell, e]));
    state.overlays = new Map(state.events.filter((e) => e.kind === 'overlay').map((e) => [e.cell, e]));
    // Damaged or delayed saves can contain already due events. Settle them
    // against the saved day instead of leaving visible fire or flood behind.
    settleNature(world);
    return;
  }
  // Old saves contain visible fire and overlay layers but no timers. Assign fresh
  // absolute deadlines once at migration; subsequent saves preserve these dates.
  for (let i = 0; i < world.size; i++) {
    if (world.fire[i] > 0.01) state.fires.set(i, event(world, 'fire', world.day + NATURE_DAYS.fire, i, { startDay: world.day, overlayAtIgnition: world.over[i] }));
    const over = world.over[i];
    if (over === OVER.SCORCHED || over === OVER.ASH || over === OVER.LAVA) {
      const days = over === OVER.LAVA ? NATURE_DAYS.lava : over === OVER.ASH ? NATURE_DAYS.ash : NATURE_DAYS.scorched;
      state.overlays.set(i, event(world, 'overlay', world.day + days, i, { overlay: over }));
    }
  }
}
