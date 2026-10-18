import assert from 'node:assert/strict';
import { TERRAIN, SPECIES } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { Life } from '../src/inkbox/sim/life.js';
import { paintPlayerHumans } from '../src/inkbox/sim/powers.js';
import { World } from '../src/inkbox/world/World.js';
import { TOOLS } from '../src/inkbox/ui/tools.js';

function makeWorld({ type = TERRAIN.MOUNTAIN, seed = 20261018, mapProgress = null } = {}) {
  const world = new World(50, 40, seed);
  world.type.fill(type);
  world.height.fill(0.68);
  if (mapProgress) world.mapProgress = mapProgress;
  return world;
}
function setTile(world, x, y, type) { world.type[world.idx(x, y)] = type; }
function setPlatform(world, x, y) {
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    const i = world.idx(x + dx, y + dy);
    world.type[i] = TERRAIN.ROCK; world.height[i] = 0.70;
  }
}
function lifeFor(world, seed = world.seed) { return new Life(world, mulberry32(seed)); }

// Default search retains the historical 40 random probes and consumes the same RNG sequence.
const defaultWorld = makeWorld();
setTile(defaultWorld, 17, 19, TERRAIN.GRASS);
const defaultSeed = 91, expectedRng = mulberry32(defaultSeed);
let expectedSpot = null;
for (let attempt = 0; attempt < 40; attempt += 1) {
  const x = 20 + Math.floor((expectedRng() * 2 - 1) * 7);
  const y = 20 + Math.floor((expectedRng() * 2 - 1) * 7);
  if (!defaultWorld.inside(x, y)) continue;
  const i = defaultWorld.idx(x, y);
  if (!defaultWorld.isWalkable(i) || defaultWorld.struct[i] !== 0) continue;
  expectedSpot = [x, y]; break;
}
const defaultLife = lifeFor(defaultWorld, defaultSeed), actualRng = mulberry32(defaultSeed);
defaultLife.rng = actualRng;
assert.deepEqual(defaultLife.findSpawnSpot(20.5, 20.5, 6), expectedSpot, 'default spawn spot stays on the original random path');
assert.equal(actualRng(), expectedRng(), 'default spawn RNG consumption remains unchanged');

const baselineWorld = makeWorld({ type: TERRAIN.GRASS }), currentWorld = makeWorld({ type: TERRAIN.GRASS });
const baselineLife = lifeFor(baselineWorld, 731), currentLife = lifeFor(currentWorld, 731);
baselineLife.findSpawnSpot = function (cx, cy, radius) {
  const baseX = Math.floor(cx), baseY = Math.floor(cy), r = Math.floor(radius);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const x = baseX + Math.floor((this.rng() * 2 - 1) * (r + 1));
    const y = baseY + Math.floor((this.rng() * 2 - 1) * (r + 1));
    if (!this.world.inside(x, y)) continue;
    const i = this.world.idx(x, y);
    if (!this.world.isWalkable(i) || this.world.struct[i] !== 0) continue;
    return [x, y];
  }
  return null;
};
assert.equal(currentLife.spawn(20.5, 20.5, SPECIES.HUMAN, 1), baselineLife.spawn(20.5, 20.5, SPECIES.HUMAN, 1));
assert.deepEqual(currentWorld.entities, baselineWorld.entities, 'ordinary Life.spawn entities remain byte-equivalent at creation');
assert.equal(currentLife.rng(), baselineLife.rng(), 'ordinary Life.spawn consumes the same subsequent RNG value');

// A single high ROCK tile outside the old radius is found deterministically and remains walkable next tick.
const rockWorld = makeWorld();
setPlatform(rockWorld, 30, 20);
const rockLife = lifeFor(rockWorld);
const player = paintPlayerHumans(rockLife, 20.5, 20.5, 1);
assert.equal(player.placed, 1, 'narrow ROCK platform receives the player human');
assert(player.points.every(({ x, y }) => x >= 29 && x <= 31 && y >= 19 && y <= 21), 'fallback lands on the flat platform');
assert.deepEqual(player.points.map(({ x, y }) => [x, y]), [rockWorld.entities.map(e => [Math.floor(e.x), Math.floor(e.y)])[0]], 'helper reports the real entity coordinates');
const placedEntity = rockWorld.entities[0];
rockLife.stepEntity(placedEntity, 1);
assert(placedEntity.hp > 0 && placedEntity.diedOf !== 'lost', 'first normal entity tick does not treat the platform as unsafe');

// Tool feedback uses those same actual coordinates and explains offsets from the clicked tile.
const humanTool = TOOLS.find(tool => tool.id === 'human');
const feedbackWorld = makeWorld();
setPlatform(feedbackWorld, 29, 20);
const feedbackLife = lifeFor(feedbackWorld);
const feedback = humanTool.apply({ life: feedbackLife, x: 20.5, y: 20.5 });
assert.match(feedback, /实际格坐标 28,20 \(Δ\+8,\+0\)/);
assert.match(feedback, /相对点选格的偏移/);

const ridgeWorld = makeWorld();
setTile(ridgeWorld, 24, 20, TERRAIN.ROCK);
ridgeWorld.height[ridgeWorld.idx(24, 20)] = 0.83;
setPlatform(ridgeWorld, 29, 20);
const ridgeResult = paintPlayerHumans(lifeFor(ridgeWorld), 20.5, 20.5, 1);
assert.equal(ridgeResult.placed, 1);
assert(ridgeResult.points.every(({ x, y }) => x >= 28 && x <= 30 && y >= 19 && y <= 21),
  'near steep isolated ROCK is rejected in favor of the farther flat platform');

for (const setup of [
  { name: 'all mountain peaks', tile: [30, 20], mutate: () => {} },
  { name: 'built tile', tile: [30, 20], mutate: world => { world.struct[world.idx(30, 20)] = 1; } },
  { name: 'water', tile: [30, 20], mutate: world => { world.water[world.idx(30, 20)] = 1; } },
  { name: 'fire', tile: [30, 20], mutate: world => { world.fire[world.idx(30, 20)] = 0.02; } },
  { name: 'locked map area', tile: [35, 20], anchor: [34, 20], mapProgress: { version: 1, stage: 0 }, mutate: () => {} },
]) {
  const world = makeWorld({ mapProgress: setup.mapProgress });
  if (setup.name === 'water') setTile(world, ...setup.tile, TERRAIN.ROCK);
  else if (setup.name === 'locked map area') setTile(world, ...setup.tile, TERRAIN.ROCK);
  setup.mutate(world);
  const [ax, ay] = setup.anchor || [20, 20];
  const result = paintPlayerHumans(lifeFor(world), ax + 0.5, ay + 0.5, 1);
  assert.equal(result.placed, 0, `${setup.name} must be rejected`);
  assert.equal(world.entities.length, 0, `${setup.name} creates no entity`);
}
assert.equal(humanTool.apply({ life: lifeFor(makeWorld()), x: 20.5, y: 20.5 }), '附近没有可行走台地 · 未放置凡人');

console.log('G26 human placement checks passed: unchanged default RNG, flat-platform fallback, steep-rock rejection, safe next tick, peak-water-lock rejection, and actual-coordinate feedback.');
