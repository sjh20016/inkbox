import { isPracticingHuman } from '../core/demographics.js';

export const MIN_FLIGHT_LEVEL = 20;
export const MIN_NAVIGABLE_DEPTH = 0.02;
export const MIN_NAVIGABLE_WATER_CELLS = 48;
export const MIN_NAVIGABLE_WATER_SPAN = 8;
export const MAX_PORT_ACCESS_STEPS = 16;
export const MAX_PORT_CANDIDATES = 8;
export const MAX_CACHED_ROUTE_POINTS = 16384;
const WATER_LANDINGS = 4;
const MAX_ROUTE_CACHE = 96;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const geographies = new WeakMap();

function stateFor(world) {
  let state = geographies.get(world);
  if (!state) {
    state = { dirty: true, topology: null, routes: new Map(), routePoints: 0, builds: 0, plans: 0, waterSearches: 0, version: 0 };
    geographies.set(world, state);
  }
  return state;
}

/** Invalidates derived connectivity; callers batch edits and invoke this once at settlement. */
export function invalidateTransitGeography(world) {
  if (!world || (typeof world !== 'object' && typeof world !== 'function')) return;
  const state = stateFor(world);
  if (!state.dirty) state.version++;
  state.dirty = true;
  state.routes.clear();
  state.routePoints = 0;
}

/** Monotonic edit epoch for journey owners that only replan when geography changes. */
export function transitGeographyVersion(world) {
  return world ? (geographies.get(world)?.version ?? 0) : 0;
}

/** Read-only counters. Reading stats never causes a topology build. */
export function transitGeographyStats(world) {
  const state = world && geographies.get(world);
  const topology = state?.topology;
  return Object.freeze({
    builds: state?.builds ?? 0,
    plans: state?.plans ?? 0,
    nodes: topology?.nodes ?? 0,
    bytes: topology?.bytes ?? 0,
    cachedRoutes: state?.routes.size ?? 0,
    cachedRoutePoints: state?.routePoints ?? 0,
    waterSearches: state?.waterSearches ?? 0,
    dirty: state?.dirty ?? true,
  });
}

export function canFly(entity) {
  return !!entity && isPracticingHuman(entity) && entity.hp > 0 && !entity._ascended
    && (!Number.isFinite(entity.age) || !Number.isFinite(entity.lifespan) || entity.age < entity.lifespan)
    && (entity.level || 0) >= MIN_FLIGHT_LEVEL;
}

function inside(world, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < world.w && y < world.h;
}

function indexAt(world, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return -1;
  const x = Math.floor(point.x), y = Math.floor(point.y);
  return inside(world, x, y) ? y * world.w + x : -1;
}

// Mirrors Life.canStep: interior cells, World.isWalkable, and no wall structure.
function walkable(world, i) {
  const x = i % world.w, y = Math.floor(i / world.w);
  return x >= 1 && y >= 1 && x <= world.w - 2 && y <= world.h - 2
    && world.isWalkable(i) && world.struct[i] !== 3;
}

function permanentDepth(world, i) {
  const flood = world.nature?.floods?.get(i);
  return flood ? (flood.base ?? 0) : (world.water[i] ?? 0);
}

function navigable(world, i) {
  return permanentDepth(world, i) >= MIN_NAVIGABLE_DEPTH;
}

function neighbors(world, i) {
  const x = i % world.w, y = Math.floor(i / world.w), out = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (inside(world, nx, ny)) out.push(ny * world.w + nx);
  }
  return out;
}

function buildTopology(world, state) {
  const land = new Int32Array(world.size); land.fill(-1);
  const water = new Int32Array(world.size); water.fill(-1);
  const queue = new Int32Array(world.size);
  let component = 0, nodes = 0;
  for (let start = 0; start < world.size; start++) {
    if (land[start] !== -1 || !walkable(world, start)) continue;
    let head = 0, tail = 0; queue[tail++] = start; land[start] = component;
    while (head < tail) {
      const i = queue[head++]; nodes++;
      for (const n of neighbors(world, i)) if (land[n] === -1 && walkable(world, n)) {
        land[n] = component; queue[tail++] = n;
      }
    }
    component++;
  }
  const waterSizes = new Uint32Array(world.size), waterSpans = new Uint32Array(world.size);
  component = 0;
  for (let start = 0; start < world.size; start++) {
    if (water[start] !== -1 || !navigable(world, start)) continue;
    let head = 0, tail = 0, minX = world.w, minY = world.h, maxX = 0, maxY = 0;
    queue[tail++] = start; water[start] = component;
    while (head < tail) {
      const i = queue[head++], x = i % world.w, y = Math.floor(i / world.w);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); nodes++;
      for (const n of neighbors(world, i)) if (water[n] === -1 && navigable(world, n)) {
        water[n] = component; queue[tail++] = n;
      }
    }
    waterSizes[component] = tail;
    waterSpans[component] = Math.max(maxX - minX + 1, maxY - minY + 1);
    component++;
  }
  const topology = { land, water, waterSizes, waterSpans, nodes,
    bytes: land.byteLength + water.byteLength + waterSizes.byteLength + waterSpans.byteLength };
  state.topology = topology; state.dirty = false; state.builds++;
  state.routes.clear();
  state.routePoints = 0;
  return topology;
}

function topologyFor(world, state) {
  return state.dirty || !state.topology ? buildTopology(world, state) : state.topology;
}

function pointsFor(world, indices) {
  return indices.map(i => ({ x: i % world.w, y: Math.floor(i / world.w) }));
}

function reconstruct(prev, end) {
  const out = [];
  for (let at = end; at !== -1; at = prev[at]) out.push(at);
  out.reverse(); return out;
}

function bfs(world, start, allowed, target) {
  const prev = new Int32Array(world.size); prev.fill(-2);
  const queue = new Int32Array(world.size); let head = 0, tail = 0;
  queue[tail++] = start; prev[start] = -1;
  while (head < tail) {
    const i = queue[head++];
    if (target(i)) return reconstruct(prev, i);
    for (const n of neighbors(world, i)) if (prev[n] === -2 && allowed(n)) {
      prev[n] = i; queue[tail++] = n;
    }
  }
  return null;
}

function landPath(world, start, end) {
  if (start === end) return [start];
  return bfs(world, start, i => walkable(world, i), i => i === end);
}

function landAccess(world, start, topology) {
  const dist = new Int16Array(world.size); dist.fill(-1);
  const prev = new Int32Array(world.size); prev.fill(-2);
  const queue = new Int32Array(world.size); let head = 0, tail = 0;
  if (!walkable(world, start)) return [];
  queue[tail++] = start; dist[start] = 0; prev[start] = -1;
  const byComponent = new Map();
  while (head < tail) {
    const i = queue[head++], depth = dist[i];
    const waterTiles = neighbors(world, i).filter(n => {
      const comp = topology.water[n];
      return comp >= 0 && topology.waterSizes[comp] >= MIN_NAVIGABLE_WATER_CELLS
        && topology.waterSpans[comp] >= MIN_NAVIGABLE_WATER_SPAN;
    });
    if (waterTiles.length) {
      const path = reconstruct(prev, i);
      for (const water of waterTiles) {
        const comp = topology.water[water], candidates = byComponent.get(comp) || [];
        candidates.push({ land: i, water, path, depth });
        byComponent.set(comp, candidates);
      }
    }
    if (depth >= MAX_PORT_ACCESS_STEPS) continue;
    for (const n of neighbors(world, i)) if (dist[n] < 0 && walkable(world, n)) {
      dist[n] = depth + 1; prev[n] = i; queue[tail++] = n;
    }
  }
  const groups = [...byComponent.values()].map(group => {
    group.sort((a, b) => a.depth - b.depth || a.water - b.water);
    return group.slice(0, 2);
  }).sort((a, b) => a[0].depth - b[0].depth || a[0].water - b[0].water);
  const candidates = [];
  // First retain one nearest port from each reachable water body, then use spare slots
  // for alternates. A nearby lake must not crowd the only useful harbor out of the list.
  for (const group of groups) if (candidates.length < MAX_PORT_CANDIDATES) candidates.push(group[0]);
  for (let alternate = 1; alternate < 2 && candidates.length < MAX_PORT_CANDIDATES; alternate++) {
    for (const group of groups) if (group[alternate] && candidates.length < MAX_PORT_CANDIDATES) candidates.push(group[alternate]);
  }
  return candidates;
}

function waterPathsToTargets(world, start, comp, targets, topology, state) {
  state.waterSearches++;
  const prev = new Int32Array(world.size); prev.fill(-2);
  const queue = new Int32Array(world.size); let head = 0, tail = 0, remaining = targets.size;
  const paths = new Map();
  queue[tail++] = start; prev[start] = -1;
  while (head < tail && remaining > 0) {
    const i = queue[head++];
    if (targets.has(i)) { paths.set(i, reconstruct(prev, i)); remaining--; }
    for (const n of neighbors(world, i)) if (prev[n] === -2 && topology.water[n] === comp) {
      prev[n] = i; queue[tail++] = n;
    }
  }
  return paths;
}

function routeResult(mode, legs, distance, extras = {}) {
  return { ok: true, mode, legs, distance, ...extras };
}
function failure(mode, reason) { return { ok: false, reason, mode, legs: [], distance: 0 }; }

function planLand(world, from, to, a, b, topology) {
  if (!walkable(world, a) || !walkable(world, b)) return failure('land', 'no_land_connection');
  if (topology.land[a] !== topology.land[b]) return failure('land', 'no_land_connection');
  const path = landPath(world, a, b);
  return path ? routeResult('land', [{ mode: 'land', points: pointsFor(world, path) }], path.length - 1) : failure('land', 'no_land_connection');
}

function planWater(world, from, to, a, b, topology, state) {
  const fromWater = topology.water[a], toWater = topology.water[b];
  if (fromWater >= 0 && topology.waterSizes[fromWater] < MIN_NAVIGABLE_WATER_CELLS) return failure('water', 'no_port');
  if (fromWater < 0 && from.atSea) return failure('water', 'blocked_water');
  if (toWater >= 0) return failure('water', 'no_port'); // Destination must be a safe landfall.
  if (!walkable(world, b)) return failure('water', 'no_port');
  const starts = fromWater >= 0 ? [{ land: a, water: a, path: [a], depth: 0 }] : landAccess(world, a, topology);
  const ends = landAccess(world, b, topology);
  const startCandidates = starts.filter(p => topology.water[p.water] >= 0);
  const endCandidates = ends.filter(p => topology.water[p.water] >= 0);
  const endTiles = new Map();
  for (const q of endCandidates) {
    const comp = topology.water[q.water];
    if (!endTiles.has(comp)) endTiles.set(comp, new Set());
    endTiles.get(comp).add(q.water);
  }
  let best = null;
  const groups = new Map();
  for (const p of startCandidates) {
    const comp = topology.water[p.water];
    if (!endTiles.has(comp)) continue;
    const group = groups.get(comp) || [];
    group.push(p); groups.set(comp, group);
  }
  for (const [comp, ports] of groups) {
    const targets = endTiles.get(comp);
    const startsByWater = new Map();
    for (const p of ports) {
      const candidates = startsByWater.get(p.water) || [];
      candidates.push(p); startsByWater.set(p.water, candidates);
    }
    for (const [startWater, sourcePorts] of startsByWater) {
      const seaPaths = waterPathsToTargets(world, startWater, comp, targets, topology, state);
      for (const q of endCandidates) {
        if (topology.water[q.water] !== comp) continue;
        const sea = seaPaths.get(q.water);
        if (!sea) continue;
        for (const p of sourcePorts) {
          const cost = p.path.length + sea.length + q.path.length;
          if (!best || cost < best.cost) best = { p, q, sea, cost };
        }
      }
    }
  }
  if (!best) {
    const validStart = startCandidates.length > 0, validEnd = endCandidates.length > 0;
    return failure('water', validStart && validEnd ? 'blocked_water' : 'no_port');
  }
  const legs = [];
  if (best.p.path.length > 1) legs.push({ mode: 'land', points: pointsFor(world, best.p.path) });
  legs.push({ mode: 'water', points: pointsFor(world, best.sea) });
  // Always end at the requested safe land destination. It may itself be the port tile,
  // in which case this is a valid one-point landfall leg rather than a water endpoint.
  legs.push({ mode: 'land', points: pointsFor(world, best.q.path.slice().reverse()) });
  return routeResult('water', legs, best.cost - 2, {
    fromPort: fromWater >= 0 ? null : { x: best.p.land % world.w, y: Math.floor(best.p.land / world.w) },
    toPort: { x: best.q.land % world.w, y: Math.floor(best.q.land / world.w) },
  });
}

export function planTransitRoute(world, from, to, { mode = 'land', actor = null } = {}) {
  const state = stateFor(world); state.plans++;
  if (!['land', 'water', 'air'].includes(mode)) return failure(mode, 'unknown_mode');
  const a = indexAt(world, from), b = indexAt(world, to);
  if (a < 0 || b < 0) return failure(mode, 'invalid_location');
  const actorKey = mode === 'air' ? (canFly(actor) ? 'fly' : 'no-fly') : '';
  const key = `${mode}:${a}:${b}:${from.atSea ? 1 : 0}:${actorKey}`;
  if (state.routes.has(key)) return state.routes.get(key);
  const topology = topologyFor(world, state);
  let result;
  if (mode === 'land') result = planLand(world, from, to, a, b, topology);
  else if (mode === 'water') result = planWater(world, from, to, a, b, topology, state);
  else if (!canFly(actor)) result = failure('air', 'no_flight_capability');
  else if (!walkable(world, b)) result = failure('air', 'unsafe_landing');
  else result = routeResult('air', [{ mode: 'air', points: [{ x: a % world.w, y: Math.floor(a / world.w) }, { x: b % world.w, y: Math.floor(b / world.w) }] }], Math.hypot(a % world.w - b % world.w, Math.floor(a / world.w) - Math.floor(b / world.w)));
  const points = result.legs.reduce((sum, leg) => sum + leg.points.length, 0);
  if (points <= MAX_CACHED_ROUTE_POINTS) {
    while (state.routes.size >= MAX_ROUTE_CACHE || state.routePoints + points > MAX_CACHED_ROUTE_POINTS) {
      const oldest = state.routes.keys().next().value;
      if (oldest === undefined) break;
      const evicted = state.routes.get(oldest);
      state.routePoints -= evicted.legs.reduce((sum, leg) => sum + leg.points.length, 0);
      state.routes.delete(oldest);
    }
    state.routes.set(key, result); state.routePoints += points;
  }
  return result;
}
