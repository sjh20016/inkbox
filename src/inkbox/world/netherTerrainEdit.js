// Isolated D-N1 preview editor. The caller owns the session and pauses simulation.
import { classify, qiAt } from './terrain.js';
import { netherWalkable } from './planes.js';
import { noteTerrainRegion, noteTerrainFull } from './terrainChanges.js';
import { invalidateNetherBanks, netherSpatialTargetValid, netherActivityTileValid } from '../sim/netherLife.js';

const LAYERS = ['height', 'water', 'veg', 'riverBase', 'type', 'qi'];
// The original snapshot is retained for cancel; history shares a fixed 32 MiB budget.
const HISTORY_BUDGET = 32 * 1024 * 1024;
const clamp01 = n => Math.max(0, Math.min(1, n));

function snapshot(world) {
  return {
    layers: Object.fromEntries(LAYERS.map(k => [k, world[k].slice()])),
    objects: [...world.entities, ...world.artifacts].map(o => ({
      object: o, x: o.x, y: o.y, tx: o.tx, ty: o.ty,
    })),
  };
}

function bytes(state) {
  return LAYERS.reduce((n, k) => n + state.layers[k].byteLength, 0)
    + state.objects.length * 32;
}

function restore(world, state) {
  for (const k of LAYERS) world[k].set(state.layers[k]);
  for (const { object, x, y, tx, ty } of state.objects) {
    object.x = x; object.y = y;
    if ('tx' in object || tx !== undefined) object.tx = tx;
    if ('ty' in object || ty !== undefined) object.ty = ty;
  }
  invalidateNetherBanks(world);
  for (const layer of ['height', 'water', 'veg', 'type']) noteTerrainFull(world, layer);
  world.touch?.({ terrain: false });
}

function valid(world, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const ix = Math.floor(x), iy = Math.floor(y);
  return ix >= 0 && iy >= 0 && ix < world.w && iy < world.h
    && netherWalkable(world, iy * world.w + ix);
}

function nearest(world, x, y, accepts = (xx, yy) => netherWalkable(world, yy * world.w + xx)) {
  const cx = Math.max(0, Math.min(world.w - 1, Math.floor(Number.isFinite(x) ? x : world.w / 2)));
  const cy = Math.max(0, Math.min(world.h - 1, Math.floor(Number.isFinite(y) ? y : world.h / 2)));
  const legal = (xx, yy) => xx >= 0 && yy >= 0 && xx < world.w && yy < world.h
    && accepts(xx, yy);
  for (let r = 0; r < Math.max(world.w, world.h); r++) {
    const left = cx - r, right = cx + r, top = cy - r, bottom = cy + r;
    for (let xx = Math.max(0, left); xx <= Math.min(world.w - 1, right); xx++) {
      if (top >= 0 && top < world.h && legal(xx, top)) return [xx + 0.5, top + 0.5];
      if (bottom !== top && bottom >= 0 && bottom < world.h && legal(xx, bottom))
        return [xx + 0.5, bottom + 0.5];
    }
    for (let yy = Math.max(0, top + 1); yy <= Math.min(world.h - 1, bottom - 1); yy++) {
      if (left >= 0 && left < world.w && legal(left, yy)) return [left + 0.5, yy + 0.5];
      if (right !== left && right >= 0 && right < world.w && legal(right, yy))
        return [right + 0.5, yy + 0.5];
    }
  }
  return null;
}

function reconcile(world) {
  let moved = 0, clearedTargets = 0;
  for (const o of [...world.entities, ...world.artifacts]) {
    if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
    const ghost = o.soulKind === 'ghost' || o.soulKind === 'ghostCultivator';
    if (!(ghost ? netherActivityTileValid(world, o, o.x, o.y) : valid(world, o.x, o.y))) {
      const p = nearest(world, o.x, o.y, ghost
        ? (xx, yy) => netherActivityTileValid(world, o, xx, yy)
        : undefined);
      if (!p) return null;
      [o.x, o.y] = p;
      moved++;
    }
    if ('tx' in o && 'ty' in o && Number.isFinite(o.tx) && Number.isFinite(o.ty)
        && !netherSpatialTargetValid(world, o)) {
      o.tx = NaN; o.ty = NaN; // existing spatial step will select a new target
      clearedTargets++;
    }
  }
  return { moved, clearedTargets };
}

/** No clock, RNG, or product save format is owned by this adapter. */
export function createNetherTerrainEditor(world) {
  if (!world || world.plane !== 'nether' || !world.height || !world.water || !world.veg || !world.riverBase)
    throw new TypeError('A generated nether World is required');
  const initial = snapshot(world);
  const undoStack = [], redoStack = [];
  const trimHistory = () => {
    while (undoStack.length + redoStack.length > 0
      && bytes(initial) + [...undoStack, ...redoStack].reduce((n, s) => n + bytes(s), 0) > HISTORY_BUDGET) {
      if (undoStack.length) undoStack.shift();
      else redoStack.shift();
    }
  };
  let closed = false;
  const assertOpen = () => { if (closed) throw new Error('Nether edit session is closed'); };
  return {
    apply({ tool, x, y, radius = 1, strength = 0.04, value } = {}) {
      assertOpen();
      if (!['raise', 'lower', 'flatten', 'river', 'yin'].includes(tool)
          || !Number.isFinite(x) || !Number.isFinite(y)
          || !Number.isFinite(radius) || radius < 0 || !Number.isFinite(strength)
          || (value !== undefined && !Number.isFinite(value)))
        throw new TypeError('Invalid nether brush');
      const before = snapshot(world);
      const x0 = Math.max(0, Math.floor(x - radius));
      const x1 = Math.min(world.w - 1, Math.ceil(x + radius));
      const y0 = Math.max(0, Math.floor(y - radius));
      const y1 = Math.min(world.h - 1, Math.ceil(y + radius));
      let changed = 0;
      try {
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
          const d = Math.hypot(xx - x, yy - y);
          if (d > radius) continue;
          const weight = radius ? 1 - d / (radius + 1) : 1;
          const i = yy * world.w + xx;
          const old = tool === 'yin' ? world.veg[i] : tool === 'river' ? world.water[i] : world.height[i];
          let next;
          if (tool === 'raise') next = clamp01(old + strength * weight);
          else if (tool === 'lower') next = clamp01(old - strength * weight);
          else if (tool === 'flatten') next = clamp01(old + ((value ?? strength) - old) * weight);
          else if (tool === 'river') next = clamp01((value ?? strength) * weight);
          else next = clamp01(old + strength * weight);
          if (tool === 'yin') world.veg[i] = next;
          else if (tool === 'river') {
            world.water[i] = next;
            world.riverBase[i] = Math.min(0.05, next * 0.6);
          } else world.height[i] = next;
          if (next !== old) changed++;
        }
        const rect = { x: Math.max(0, x0 - 1), y: Math.max(0, y0 - 1),
          w: Math.min(world.w, x1 + 2) - Math.max(0, x0 - 1),
          h: Math.min(world.h, y1 + 2) - Math.max(0, y0 - 1) };
        if (!changed) return { changed: 0, rect, moved: 0, clearedTargets: 0 };
        for (let yy = rect.y; yy < rect.y + rect.h; yy++) for (let xx = rect.x; xx < rect.x + rect.w; xx++) {
          const i = yy * world.w + xx;
          world.type[i] = classify(world, xx, yy, i);
          world.qi[i] = qiAt(world, xx, yy, i);
        }
        invalidateNetherBanks(world);
        const entities = reconcile(world);
        if (!entities) throw new Error('No legal nether landing tile remains');
        if (changed) {
          undoStack.push(before); redoStack.length = 0; trimHistory();
          for (const layer of tool === 'river' ? ['water', 'type'] : tool === 'yin' ? ['veg'] : ['height', 'type'])
            noteTerrainRegion(world, layer, { x0: rect.x, y0: rect.y, x1: rect.x + rect.w - 1, y1: rect.y + rect.h - 1 });
          world.touch?.({ terrain: false });
        }
        return { changed, rect, ...entities };
      } catch (error) { restore(world, before); throw error; }
    },
    undo() { assertOpen(); if (!undoStack.length) return false; redoStack.push(snapshot(world)); restore(world, undoStack.pop()); trimHistory(); return true; },
    redo() { assertOpen(); if (!redoStack.length) return false; undoStack.push(snapshot(world)); restore(world, redoStack.pop()); trimHistory(); return true; },
    cancel() { assertOpen(); restore(world, initial); undoStack.length = redoStack.length = 0; closed = true; },
    commit() { assertOpen(); closed = true; return { changed: undoStack.length > 0 }; },
  };
}
