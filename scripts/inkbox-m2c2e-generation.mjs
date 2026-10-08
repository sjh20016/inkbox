import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { WORLD_PRESETS, SEA_LEVEL } from '../src/inkbox/core/config.js';
import { TERRAIN_PRESETS } from '../src/inkbox/world/worldGeneration.js';
import { createMapProgress, accessBounds, canAccess, expandMap } from '../src/inkbox/world/mapProgress.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { Life } from '../src/inkbox/sim/life.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const heightHash = world => hash(new Uint8Array(world.height.buffer));
const initialHash = world => hash(JSON.stringify({ terrain: serializeWorld(world).terrain, leylines: world.leylines, spawns: world.pendingSpawns }));
const canonical = generateWorld({ preset: WORLD_PRESETS.small, seed: 20260914 });
assert.equal(heightHash(canonical), 'ea1155bfaa6ba1e4f6b0eb5bb3a385c659fb2cb9eda5d326e0be11e3f9622883');
assert.equal(hash(JSON.stringify(serializeWorld(canonical).terrain)), 'b51f443d323f1faf0c6df44adc5de76f05810d5eca4e2a8fc0236f32ab6c43af');
const legacyKeys = Object.keys(serializeWorld(canonical));
assert.ok(!legacyKeys.includes('generation') && !legacyKeys.includes('mapProgress'));
assert.equal(initialHash(canonical), initialHash(generateWorld({ preset: WORLD_PRESETS.small, seed: 20260914, generationVersion: 1, terrainPreset: 'wetlands' })));
console.log('PASS v1 canonical raw/quantized hashes and exact legacy key set');
const seeds = [0, 1, 7, 42, 1234, 65535, 20260914, 20261008, 2147483647, 2147483648, 4294967294, 4294967295];
const rows = [];
for (const preset of [WORLD_PRESETS.small, WORLD_PRESETS.large, WORLD_PRESETS.expanse]) {
  for (const terrainPreset of Object.keys(TERRAIN_PRESETS)) {
    const start = performance.now(); let wet = 0, high = 0;
    for (const seed of seeds) {
      const options = { preset, seed, generationVersion: 2, terrainPreset };
      const world = generateWorld(options), repeat = generateWorld(options);
      assert.equal(initialHash(world), initialHash(repeat));
      assert.deepEqual(world.generation, { version: 2, terrainPreset });
      for (const value of world.height) { assert.ok(Number.isFinite(value) && value >= 0 && value <= 1); wet += value < SEA_LEVEL; high += value > .6; }
      createMapProgress(world, true);
      const payload = serializeWorld(world), restored = deserializeWorld(JSON.parse(JSON.stringify(payload)));
      assert.deepEqual(restored.generation, world.generation); assert.deepEqual(restored.mapProgress, world.mapProgress);
      for (let i = 0; i < world.size; i += 1) assert.ok(Math.abs(restored.height[i] - world.height[i]) <= 1 / 65535 / 2 + 3e-8);
      const next = serializeWorld(restored);
      // height is read directly from saved quantized arrays, independent of preset metadata.
      assert.equal(next.terrain.height, payload.terrain.height);
      const before = heightHash(world), entities = world.entities, seedBefore = world.seed, array = world.height;
      let previous = accessBounds(world);
      assert.ok(canAccess(world, (world.w - 1) / 2, (world.h - 1) / 2));
      assert.ok(!canAccess(world, 0, 0));
      for (let stage = 1; stage <= 3; stage += 1) {
        assert.equal(expandMap(world), true); const bounds = accessBounds(world);
        assert.ok(bounds.x0 <= previous.x0 && bounds.y0 <= previous.y0 && bounds.x1 >= previous.x1 && bounds.y1 >= previous.y1);
        previous = bounds;
      }
      assert.deepEqual(previous, { x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 });
      assert.equal(expandMap(world), false); assert.equal(heightHash(world), before); assert.equal(world.height, array); assert.equal(world.entities, entities); assert.equal(world.seed, seedBefore);
      assert.equal(canAccess(world, NaN, 1), false);
    }
    const row = { size: preset.key, terrainPreset, seeds: seeds.length, milliseconds: Math.round(performance.now() - start), waterFraction: +(wet / (preset.w * preset.h * seeds.length)).toFixed(3), highFraction: +(high / (preset.w * preset.h * seeds.length)).toFixed(3) };
    rows.push(row); console.log(`PASS ${JSON.stringify(row)}`);
  }
}
for (const size of ['small', 'large', 'expanse']) {
  const group = rows.filter(row => row.size === size);
  const standard = group.find(row => row.terrainPreset === 'standard'), mountains = group.find(row => row.terrainPreset === 'mountains'), wetlands = group.find(row => row.terrainPreset === 'wetlands');
  assert.ok(mountains.highFraction > standard.highFraction && wetlands.waterFraction > standard.waterFraction);
}
const old = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(canonical))));
assert.ok(!Object.hasOwn(old, 'generation') && !Object.hasOwn(old, 'mapProgress'));
assert.deepEqual(accessBounds(old), { x0: 0, y0: 0, x1: old.w - 1, y1: old.h - 1 });
assert.equal(expandMap(old, true), false);
assert.deepEqual(Object.keys(serializeWorld(old)).filter(key => key !== 'upper' && key !== 'nether'), legacyKeys);
const generated = generateWorld({ preset: WORLD_PRESETS.small, seed: 42, generationVersion: 2, terrainPreset: 'mountains' });
createMapProgress(generated, true);
const life = new Life(generated, mulberry32(0x5eed)); life.step(1);
const payload = JSON.parse(JSON.stringify(serializeWorld(generated)));
const a = deserializeWorld(payload), b = deserializeWorld(payload);
const lifeA = new Life(a, mulberry32(0x5eed)), lifeB = new Life(b, mulberry32(0x5eed));
for (let day = 0; day < 12; day += 1) {
  a.day += 1; b.day += 1; lifeA.step(1); lifeB.step(1);
  if (day === 3) { expandMap(a); expandMap(b); }
}
assert.deepEqual(serializeWorld(a), serializeWorld(b));
console.log('PASS legacy full access, expansion identity, same saved payload + commands reproducible (existing RNG cursors are not persisted)');
console.log(`PASS ${seeds.length * 3 * 3} fixed-seed generation/save/progress matrix cases`);
