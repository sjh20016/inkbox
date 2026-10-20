import assert from 'node:assert/strict';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { recomputeRect } from '../src/inkbox/world/terrain.js';
import { accessBounds, createMapProgress } from '../src/inkbox/world/mapProgress.js';
import { TerrainStroke, sculpt, restoreTerrainStroke } from '../src/inkbox/render3d/terrain/sculpt.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';

const fixture = () => generateWorld({ preset: { w: 64, h: 48 }, seed: 20261020, scatter: false });
const channels = ['height', 'water', 'riverBase', 'type', 'qi'];
const snapshot = world => Object.fromEntries(channels.map(key => [key, world[key].slice()]));
const unchanged = (world, state) => { for (const key of channels) assert.deepEqual(world[key], state[key], key); };

for (const mode of ['raise', 'lower', 'ridge', 'basin']) {
  const world = fixture(), before = snapshot(world);
  const stroke = new TerrainStroke(world, { x: 30, y: 23 }, { mode, radius: 6, strength: .08, natural: true, syncWater: true });
  stroke.sample({ x: 34, y: 25 });
  stroke.flush();
  const entry = stroke.finish(), after = snapshot(world);
  assert.ok(entry?.records.length > 0, `${mode} records the actual changed cells`);
  assert.notDeepEqual(after.height, before.height, `${mode} changes the real height field`);
  assert.equal(stroke.finish(), entry, 'finishing does not apply a second stroke');
  assert.ok(restoreTerrainStroke(world, entry)); unchanged(world, before);
  assert.ok(restoreTerrainStroke(world, entry, 'after')); unchanged(world, after);
  recomputeRect(world, 0, 0, world.w - 1, world.h - 1); unchanged(world, after);
  const restored = deserializeWorld(serializeWorld(world));
  for (const key of ['height', 'water', 'riverBase']) for (let i = 0; i < world.size; i++)
    assert.ok(Math.abs(restored[key][i] - after[key][i]) < 2e-5, `${mode} ${key} survives the existing save quantization`);
}

const bounded = fixture(); createMapProgress(bounded, true);
const bounds = accessBounds(bounded), beforeBounded = snapshot(bounded);
const boundedStroke = new TerrainStroke(bounded, { x: bounds.x0, y: bounds.y0 }, {
  mode: 'ridge', radius: 9, strength: .08, natural: true, accessBounds: bounds,
});
boundedStroke.sample({ x: bounds.x0 + 2, y: bounds.y0 + 2 }); boundedStroke.finish();
for (let y = 0; y < bounded.h; y++) for (let x = 0; x < bounded.w; x++) {
  if (x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1) continue;
  const i = bounded.idx(x, y);
  // Slope-derived type/qi may change beside an edited edge; locked source fields may not.
  for (const key of ['height', 'water', 'riverBase']) assert.equal(bounded[key][i], beforeBounded[key][i], `${key} outside unlocked bounds`);
}
const boundedAfter = snapshot(bounded);
recomputeRect(bounded, 0, 0, bounded.w - 1, bounded.h - 1); unchanged(bounded, boundedAfter);

for (const mode of ['raise', 'flatten', 'smooth']) {
  const defaults = fixture(), classic = fixture(), requestedNatural = fixture();
  const options = { x: 30, y: 24, radius: 5, strength: .06, targetHeight: .7, mode };
  sculpt(defaults, options); sculpt(classic, { ...options, natural: false });
  unchanged(defaults, snapshot(classic));
  if (mode !== 'raise') {
    sculpt(requestedNatural, { ...options, natural: true });
    unchanged(requestedNatural, snapshot(classic));
  }
}
console.log('R1 natural sculpt: real height/water transactions, undo/redo, canonical state, save, access bounds and classic-mode compatibility passed.');
