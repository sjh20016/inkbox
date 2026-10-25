import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { recomputeRect } from '../src/inkbox/world/terrain.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { MAX_CACHED_ROUTE_POINTS, canFly, invalidateTransitGeography, planTransitRoute, transitGeographyStats, transitGeographyVersion } from '../src/inkbox/world/transitGeography.js';

const world = new World(40, 24, 3025);
world.height.fill(0.55); world.type.fill(TERRAIN.GRASS); world.water.fill(0);
recomputeRect(world, 0, 0, world.w - 1, world.h - 1);
const edit = (x0, y0, x1, y1, height, water) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * world.w + x; world.height[i] = height; world.water[i] = water;
  }
  recomputeRect(world, x0, y0, x1, y1); invalidateTransitGeography(world);
};
const left = { x: 8, y: 12, villageId: 1 }, right = { x: 31, y: 12, villageId: 2 };

assert.equal(planTransitRoute(world, left, right).ok, true, 'open grassland connects');
edit(18, 1, 21, 22, 0.2, 0.1);
assert.equal(planTransitRoute(world, left, right).reason, 'no_land_connection', 'water barrier splits land');
const crossing = planTransitRoute(world, left, right, { mode: 'water' });
assert.equal(crossing.ok, true, 'large permanent water supports ports and crossing');
assert(crossing.legs.some(leg => leg.mode === 'land') && crossing.legs.some(leg => leg.mode === 'water'));
const builds = transitGeographyStats(world).builds;
planTransitRoute(world, left, right, { mode: 'water' });
assert.equal(transitGeographyStats(world).builds, builds, 'cached topology reused');
assert.equal(transitGeographyStats(world).plans >= 4, true);
for (let n = 0; n < 120; n++) {
  planTransitRoute(world, { x: 1 + (n % 35), y: 1 + (n % 20) }, { x: 38, y: 22 - (n % 20) });
}
assert(transitGeographyStats(world).cachedRoutes <= 96, 'route entry count stays bounded');
assert(transitGeographyStats(world).cachedRoutePoints <= MAX_CACHED_ROUTE_POINTS, 'cached route waypoint memory stays bounded');
const version = transitGeographyVersion(world);
invalidateTransitGeography(world); invalidateTransitGeography(world);
assert.equal(transitGeographyVersion(world), version + 1, 'repeated invalidations coalesce in one dirty batch');
planTransitRoute(world, left, right, { mode: 'water' });
assert.equal(transitGeographyStats(world).builds, builds + 1, 'dirty topology builds once on next plan');

// Breaking the channel removes the water route; reopening it restores the route after one invalidation.
edit(18, 1, 21, 22, 0.55, 0);
assert.equal(planTransitRoute(world, left, right, { mode: 'water' }).ok, false, 'blocked channel has no water route');
edit(18, 1, 21, 22, 0.2, 0.1);
assert.equal(planTransitRoute(world, left, right, { mode: 'water' }).ok, true, 'reopened channel routes again');

// A near, disconnected lake must not consume every port candidate and hide the farther useful harbor.
const harborWorld = new World(80, 48, 3026);
harborWorld.height.fill(0.55); harborWorld.type.fill(TERRAIN.GRASS); harborWorld.water.fill(0);
recomputeRect(harborWorld, 0, 0, harborWorld.w - 1, harborWorld.h - 1);
const harborEdit = (x0, y0, x1, y1, height, depth) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * harborWorld.w + x; harborWorld.height[i] = height; harborWorld.water[i] = depth;
  }
  recomputeRect(harborWorld, x0, y0, x1, y1); invalidateTransitGeography(harborWorld);
};
harborEdit(41, 26, 49, 34, 0.2, 0.1); // closer dead-end water
harborEdit(20, 24, 30, 36, 0.2, 0.1); // farther harbor beside the destination
const harborFrom = { x: 40, y: 30 }, harborTo = { x: 19, y: 30 };
const cpuStart = performance.now();
const waterSearchesBefore = transitGeographyStats(harborWorld).waterSearches;
const harborRoute = planTransitRoute(harborWorld, harborFrom, harborTo, { mode: 'water' });
const harborCpuMs = performance.now() - cpuStart;
assert.equal(harborRoute.ok, true, 'farther connected harbor survives nearby-lake candidate selection');
assert(transitGeographyStats(harborWorld).waterSearches - waterSearchesBefore <= 2,
  'port pair search runs at most one water BFS per retained departure port, not per pair');
harborEdit(35, 1, 35, 46, 0.99, 0); // separate source side from the only useful harbor
assert.equal(harborWorld.isWalkable(35 * harborWorld.w + 30), false, 'mountain barrier is real terrain');
assert.equal(planTransitRoute(harborWorld, harborFrom, harborTo, { mode: 'water' }).reason, 'blocked_water',
  'valid ports on disconnected waters explain the blockage');

// Flood-owned surface water and tiny isolated basins cannot create seaports.
world.nature = { floods: new Map() };
for (let y = 8; y < 16; y++) for (let x = 18; x <= 21; x++) {
  const i = y * world.w + x; world.nature.floods.set(i, { base: 0, levels: new Map([[1, 0.1]]) });
}
invalidateTransitGeography(world);
assert.notEqual(planTransitRoute(world, left, right, { mode: 'water' }).ok, true, 'temporary flood layer is excluded');
world.nature = null;
edit(18, 1, 21, 22, 0.55, 0);
edit(18, 11, 19, 12, 0.2, 0.1);
assert.equal(planTransitRoute(world, left, right, { mode: 'water' }).ok, false, 'small isolated pool is not a port');

const adept = { sp: 'cultivator', hp: 100, level: 20 };
assert.equal(canFly(adept), true);
assert.equal(canFly({ ...adept, level: 19 }), false);
assert.equal(planTransitRoute(world, left, right, { mode: 'air' }).reason, 'no_flight_capability');
assert.equal(planTransitRoute(world, left, { x: 19, y: 12 }, { mode: 'air', actor: adept }).reason, 'unsafe_landing');
assert.equal(planTransitRoute(world, left, right, { mode: 'air', actor: adept }).ok, true);
edit(18, 12, 18, 12, 0.55, 0);
assert.equal(planTransitRoute(world, { x: 18, y: 12, atSea: true }, right, { mode: 'water' }).reason, 'blocked_water');
assert.equal(planTransitRoute(world, left, right, { mode: 'teleport' }).reason, 'unknown_mode');
console.log(`T0 geography: route cache, water/port boundaries, flight, and recovery passed; harbor search ${harborCpuMs.toFixed(2)} ms`);
