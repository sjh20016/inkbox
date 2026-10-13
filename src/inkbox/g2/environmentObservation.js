import { TERRAIN_INFO } from '../core/config.js';
import { accessBounds } from '../core/mapAccess.js';
import { OVER } from '../world/terrain.js';

export const DEFAULT_OBSERVATION_RADIUS = 3;
export const MAX_OBSERVATION_RADIUS = 8;
export const MAX_FIRE_RESULTS = 12;

const PLANES = new Set(['mortal', 'upper', 'nether']);
const MAX_WIDTH = 512;
const MAX_HEIGHT = 320;
const MAX_CELLS = MAX_WIDTH * MAX_HEIGHT;
const ARRAY_FIELDS = ['height', 'water', 'temp', 'moist', 'veg', 'type', 'over'];
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const fail = (reason, plane = null) => freeze({ schemaVersion: 1, ok: false, reason, plane });
const finiteArray = (array, size) => ArrayBuffer.isView(array) && array.length === size;

function sourceFor(root, plane) {
  if (!root || typeof root !== 'object' || !PLANES.has(plane)) return null;
  return plane === 'mortal' ? root : root[plane] || null;
}

function validWorld(world) {
  if (!world || typeof world !== 'object') return false;
  const { w, h, size } = world;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX_WIDTH || h > MAX_HEIGHT
    || size !== w * h || size > MAX_CELLS || !Number.isFinite(world.day) || world.day < 0) return false;
  if (!ARRAY_FIELDS.every(key => finiteArray(world[key], size))) return false;
  return world.fire == null || finiteArray(world.fire, size);
}

function cellAllowed(bounds, plane, x, y, isVisible) {
  if (x < bounds.x0 || y < bounds.y0 || x > bounds.x1 || y > bounds.y1) return false;
  try { return isVisible(plane, x, y) === true; } catch { return false; }
}

function terrainName(value) {
  return Number.isInteger(value) && TERRAIN_INFO[value]?.key ? TERRAIN_INFO[value].key : 'unknown';
}

function emptyStats(fireSupported) {
  return {
    activeFireCells: fireSupported ? 0 : null,
    maxFireIntensity: fireSupported ? 0 : null,
    scorchedCells: 0,
    ashCells: 0,
    vegetationMean: null,
    yinMean: null,
    terrainSummary: {},
  };
}

/** Read a small square of the current World. Access is checked before any cell value is read. */
export function observeEnvironment(root, { plane = 'mortal', x, y, radius = DEFAULT_OBSERVATION_RADIUS, isVisible = () => true } = {}) {
  const source = sourceFor(root, plane);
  if (!source) return fail(PLANES.has(plane) ? 'missing-world' : 'invalid-plane', plane);
  if (!validWorld(root) || !validWorld(source)) return fail('invalid-world', plane);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fail('invalid-location', plane);
  if (!Number.isFinite(radius) || !Number.isInteger(radius) || radius < 0 || radius > MAX_OBSERVATION_RADIUS) return fail('invalid-radius', plane);
  if (typeof isVisible !== 'function') return fail('invalid-visibility-mask', plane);
  if (x < 0 || y < 0 || x >= source.w || y >= source.h) return fail('outside-world', plane);

  const cx = Math.round(x), cy = Math.round(y);
  const bounds = accessBounds(root);
  if (cx < 0 || cy < 0 || cx >= source.w || cy >= source.h) return fail('outside-world', plane);
  if (!cellAllowed(bounds, plane, cx, cy, isVisible)) return fail('center-inaccessible', plane);

  const x0 = Math.max(0, cx - radius), x1 = Math.min(source.w - 1, cx + radius);
  const y0 = Math.max(0, cy - radius), y1 = Math.min(source.h - 1, cy + radius);
  const requestedCells = (radius * 2 + 1) ** 2;
  const inBoundsCells = (x1 - x0 + 1) * (y1 - y0 + 1);
  const fireSupported = plane === 'mortal' && !!source.fire;
  const stats = emptyStats(fireSupported);
  const terrainCounts = new Map();
  let sampledCells = 0, restrictedCells = 0, cellsVisited = 0;
  let vegetationSum = 0, vegetationCount = 0, vegetationValid = true;
  let fireValid = fireSupported, overValid = true, typeValid = true;
  let coverageKey = 2166136261;
  for (let py = y0; py <= y1; py += 1) {
    for (let px = x0; px <= x1; px += 1) {
      cellsVisited += 1;
      if (!cellAllowed(bounds, plane, px, py, isVisible)) { restrictedCells += 1; continue; }
      const i = py * source.w + px;
      sampledCells += 1;
      coverageKey = Math.imul(coverageKey ^ (i + 1), 16777619) >>> 0;
      const veg = source.veg[i];
      if (Number.isFinite(veg)) { vegetationSum += veg; vegetationCount += 1; } else vegetationValid = false;
      const over = source.over[i];
      if (!Number.isInteger(over) || over < OVER.NONE || over > OVER.SNOW) overValid = false;
      else if (over === OVER.SCORCHED) stats.scorchedCells += 1;
      else if (over === OVER.ASH) stats.ashCells += 1;
      const type = source.type[i];
      if (!Number.isInteger(type) || !TERRAIN_INFO[type]) typeValid = false;
      else terrainCounts.set(terrainName(type), (terrainCounts.get(terrainName(type)) || 0) + 1);
      if (fireSupported) {
        const intensity = source.fire[i];
        if (!Number.isFinite(intensity)) fireValid = false;
        else if (intensity > 0.01) {
          stats.activeFireCells += 1;
          stats.maxFireIntensity = Math.max(stats.maxFireIntensity, intensity);
        }
      }
    }
  }

  if (!vegetationValid || !vegetationCount) {
    stats.vegetationMean = null;
    stats.yinMean = null;
  } else if (plane === 'nether') {
    stats.vegetationMean = null;
    stats.yinMean = vegetationSum / vegetationCount;
  } else {
    stats.vegetationMean = vegetationSum / vegetationCount;
    stats.yinMean = null;
  }
  if (!overValid) { stats.scorchedCells = null; stats.ashCells = null; }
  if (!typeValid) stats.terrainSummary = null;
  else stats.terrainSummary = Object.fromEntries([...terrainCounts.entries()].sort(([a], [b]) => a.localeCompare(b)));
  if (fireSupported && !fireValid) { stats.activeFireCells = null; stats.maxFireIntensity = null; }

  const complete = sampledCells === inBoundsCells;
  const states = [];
  if (fireSupported && stats.activeFireCells > 0) states.push('has-fire');
  if (stats.scorchedCells > 0) states.push('scorched');
  if (stats.ashCells > 0) states.push('ash');
  const fireKnown = fireSupported && stats.activeFireCells !== null;
  const overlaysKnown = stats.scorchedCells !== null && stats.ashCells !== null;
  if (!fireKnown || !overlaysKnown || !complete) states.push('unknown');
  else if (stats.activeFireCells === 0 && stats.scorchedCells === 0 && stats.ashCells === 0) states.push('clear');
  const outOfBoundsCells = requestedCells - inBoundsCells;

  return freeze({
    schemaVersion: 1, ok: true, reason: null, plane,
    location: { x: cx, y: cy }, day: root.day, radius,
    coverage: { requestedCells, inBoundsCells, sampledCells, restrictedCells, outOfBoundsCells, key: coverageKey },
    environment: { ...stats, vegetationKind: plane === 'mortal' ? 'vegetation' : plane === 'upper' ? 'spiritual-vegetation' : 'yin', fireSupported },
    states,
    evidence: { source: 'world-state', cause: 'unknown', historyComplete: false },
    metrics: { cellsVisited },
  });
}

/** On-demand bounded full-world scan for current mortal fires. */
export function findCurrentFires(root, { plane = 'mortal', isVisible = () => true, limit = MAX_FIRE_RESULTS } = {}) {
  const source = sourceFor(root, plane);
  if (!source) return freeze({ ok: false, reason: PLANES.has(plane) ? 'missing-world' : 'invalid-plane', items: [], metrics: { cellsVisited: 0 }, truncated: false });
  if (!validWorld(root) || !validWorld(source)) return freeze({ ok: false, reason: 'invalid-world', items: [], metrics: { cellsVisited: 0 }, truncated: false });
  if (typeof isVisible !== 'function' || !Number.isInteger(limit) || limit < 1 || limit > MAX_FIRE_RESULTS) {
    return freeze({ ok: false, reason: 'invalid-options', items: [], metrics: { cellsVisited: 0 }, truncated: false });
  }
  if (plane !== 'mortal' || !source.fire) return freeze({ ok: true, reason: null, items: [], fireSupported: false, metrics: { cellsVisited: 0 }, truncated: false });

  const items = [];
  const bounds = accessBounds(root);
  let cellsVisited = 0, truncated = false;
  const scanLimit = Math.min(source.size, MAX_CELLS);
  for (let i = 0; i < scanLimit; i += 1) {
    cellsVisited += 1;
    const x = i % source.w, y = Math.floor(i / source.w);
    if (x < bounds.x0 || y < bounds.y0 || x > bounds.x1 || y > bounds.y1) continue;
    const intensity = source.fire[i];
    if (!Number.isFinite(intensity) || intensity <= 0.01) continue;
    // The host can read its accessible fire array. Test the potentially costly
    // Realm polygon only for actual fire candidates, before exposing any data.
    if (!cellAllowed(bounds, plane, x, y, isVisible)) continue;
    if (items.length < limit) items.push({ plane, location: { x, y }, intensity });
    else truncated = true;
  }
  return freeze({ ok: true, reason: null, items, fireSupported: true, metrics: { cellsVisited }, truncated });
}

/** Compare two compatible scalar summaries; this never reads or retains a World. */
export function compareEnvironment(before, after) {
  const invalid = reason => freeze({ ok: false, reason, deltaDays: null,
    changes: { activeFireCells: null, scorchedCells: null, ashCells: null, vegetationMean: null }, recovering: false,
    evidence: { cause: 'unknown', historyComplete: false } });
  if (!before?.ok || !after?.ok || before.schemaVersion !== 1 || after.schemaVersion !== 1) return invalid('invalid-observation');
  if (before.plane !== after.plane || before.location?.x !== after.location?.x || before.location?.y !== after.location?.y
    || before.radius !== after.radius) return invalid('context-mismatch');
  const coverageKeys = ['requestedCells', 'inBoundsCells', 'sampledCells', 'restrictedCells', 'outOfBoundsCells', 'key'];
  if (coverageKeys.some(key => before.coverage?.[key] !== after.coverage?.[key])) return invalid('coverage-mismatch');
  if (!Number.isFinite(before.day) || !Number.isFinite(after.day) || after.day < before.day) return invalid('invalid-day-order');
  const delta = (a, b) => Number.isFinite(a) && Number.isFinite(b) ? b - a : null;
  const changes = {
    activeFireCells: delta(before.environment?.activeFireCells, after.environment?.activeFireCells),
    scorchedCells: delta(before.environment?.scorchedCells, after.environment?.scorchedCells),
    ashCells: delta(before.environment?.ashCells, after.environment?.ashCells),
    vegetationMean: delta(before.environment?.vegetationMean, after.environment?.vegetationMean),
  };
  const deltaDays = after.day - before.day;
  const hadDisaster = ['activeFireCells', 'scorchedCells', 'ashCells']
    .some(key => Number.isFinite(before.environment?.[key]) && before.environment[key] > 0);
  return freeze({ ok: true, reason: null, deltaDays, changes,
    recovering: before.plane === 'mortal' && hadDisaster && deltaDays > 0
      && changes.vegetationMean !== null && changes.vegetationMean > 0,
    evidence: { cause: 'unknown', historyComplete: false } });
}
