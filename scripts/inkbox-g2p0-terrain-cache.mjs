import assert from 'node:assert/strict';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { createMapProgress } from '../src/inkbox/world/mapProgress.js';
import { OVER, recomputeAll, recomputeRect } from '../src/inkbox/world/terrain.js';
import { ignite, stepFire, stepVegetation } from '../src/inkbox/sim/ecology.js';
import { INK_RGB, TERRAIN_RGB } from '../src/inkbox/render/palette.js';

// Cold renders are the invalidation oracle; the independent historical 324
// RGBA fixtures continue to guard the arithmetic of both cold and warm paths.
globalThis.document = { createElement() { return { getContext() { return {
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
  putImageData() {},
}; } }; } };
const { TerrainLayer } = await import('../src/inkbox/render/terrainLayer.js');
let checks = 0;
const worlds = [generateWorld, generateUpperWorld, generateNetherWorld]
  .map(generate => generate({ preset: { w: 64, h: 48 }, seed: 673231, scatter: false }));
for (const world of worlds) for (const relief of [true, false]) {
  const layer = new TerrainLayer(world, { relief });
  const compare = (name, time = 19.99) => {
    layer.render(time, true);
    const cold = new TerrainLayer(layer.world, { relief: layer.relief });
    cold.render(time, true);
    assert.deepEqual(layer.data, cold.data, name);
    assert.equal(layer.lastRender, time);
    checks++;
  };
  compare('initial');
  compare('warm');
  for (const time of [20, 39.99, 40, 59.99, 60, -1]) compare('animated mist/water', time);
  const i = world.idx(24, 24);
  for (const key of ['height', 'water', 'veg', 'temp', 'type', 'qi', 'fire']) {
    const saved = world[key][i];
    world[key][i] = key === 'type' ? 16 : .95;
    compare(`same-buffer ${key}`);
    world[key] = world[key].slice();
    world[key][i] = saved;
    compare(`replaced-buffer ${key}`);
  }
  for (const offset of [-world.w - 1, -world.w, -1, 1, world.w, world.w + 1]) {
    world.height[i + offset] = .92;
    world.water[i + offset] = .03;
    compare('neighbour slope/ridge/shoreline');
  }
  world.over[i] = OVER.SCORCHED;
  recomputeRect(world, 24, 24, 24, 24);
  compare('derived overlay and qi');
  if (world === worlds[0]) {
    world.height.fill(.5); world.water.fill(0); world.moist.fill(.9);
    world.veg.fill(.8); world.temp.fill(.6); world.over.fill(OVER.NONE);
    recomputeAll(world);
    ignite(world, 24, 24, 2);
    compare('formal ignition');
    stepFire(world, .8, () => 1);
    compare('formal burn and scorch');
    world.fire.fill(0);
    stepVegetation(world, 5, () => 1);
    compare('formal recovery');
  }
  createMapProgress(world, true);
  for (const stage of [0, 1, 2, 3, 0, 3]) {
    world.mapProgress.stage = stage;
    compare('access bounds grow and shrink');
  }
  delete world.mapProgress;
  for (const vector of [INK_RGB.paper, INK_RGB.shadow, INK_RGB.mist,
    INK_RGB.azurite, TERRAIN_RGB[7]]) {
    const saved = vector[0];
    try { vector[0] += 12; compare('palette mutation'); }
    finally { vector[0] = saved; }
    compare('palette restore');
  }
  const wash = layer.wash[i];
  layer.wash[i] = .99;
  layer.render(19.99, true);
  const changed = layer.data.slice();
  layer.landValid.fill(0);
  layer.render(19.99, true);
  assert.deepEqual(layer.data, changed, 'wash input must invalidate cached prefix'); checks++;
  layer.wash[i] = wash;
  layer.setRelief(!relief);
  compare('relief reallocates');
  layer.setWorld(worlds[(worlds.indexOf(world) + 1) % worlds.length]);
  compare('setWorld replaces all caches');
  assert(layer.landColor.length === layer.world.size * 3);
  assert.equal(Object.hasOwn(world, 'landColor'), false, 'cache belongs to renderer');
}
console.log(`G2-P0 terrain cache: ${checks} exact cold/warm comparisons passed`);
