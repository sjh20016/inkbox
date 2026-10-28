import assert from 'node:assert/strict';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherLandscape } from '../src/inkbox/world/netherLandscape.js';
import { NETHER_REGIONS, sampleNetherGeography } from '../src/inkbox/world/netherGeography.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { PlaneStage } from '../src/inkbox/render3d/stage/PlaneStage.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';
import { deriveScenery } from '../src/inkbox/render3d/shanhai/ShanhaiSceneryLayer.js';

const root = generateWorld({ preset: WORLD_PRESETS.small, seed: 20260914, scatter: false });
root.upper = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: root.seed });
root.nether = generateNetherWorld({ preset: WORLD_PRESETS.small, seed: root.seed });
const before = JSON.stringify(serializeWorld(root));
const old = deserializeWorld(JSON.parse(before));
for (const key of ['temp', 'moist', 'riverBase']) assert.deepEqual(old.nether[key], root.nether[key], 'legacy generated field ' + key);
for (const key of ['height', 'water', 'veg']) assert(old.nether[key].every((n, i) => Math.abs(n - root.nether[key][i]) <= 1 / 65535 + 1e-7), 'existing six-layer quantization ' + key);
for (const key of ['type', 'over', 'struct']) assert.deepEqual(old.nether[key], root.nether[key]);

for (const candidate of [false, true]) {
  const world = candidate ? generateNetherLandscape({ preset: WORLD_PRESETS.small, seed: root.seed }) : root.nether;
  const pristine = JSON.stringify(serializeWorld(world));
  const stage = new PlaneStage({ plane: 'nether', world });
  assert.equal(stage.netherRiver, null, 'legacy art does not allocate the new layers');
  stage.setNetherLandscapeStyle(true); stage.scenery.setEnabled(true); stage.update(.016);
  const river = stage.netherRiver, mist = stage.netherEcology;
  assert(river.stats.quads > 0 && river.stats.quads < world.size / 4, 'only actual wet quads submitted');
  assert(mist.stats.instances <= 24);
  const mask = new RegionGeometry(world, { x0: 20, y0: 20, x1: 120, y1: 90, contains: (x, y) => x >= 20 && x <= 120 && y >= 20 && y <= 90 });
  stage.setRegionMask(mask.region, true); stage.update(.016);
  const builds = mist.stats.rebuilds, samples = river.stats.sampledCells, uploads = river.surface.texture.version;
  for (let n = 0; n < 60; n++) { stage.setRegionMask(mask.region, true); stage.update(.01); }
  assert.equal(mist.stats.rebuilds, builds, 'unchanged region does not rewrite mist per frame');
  assert.equal(river.stats.sampledCells, samples, 'idle water does not scan shore');
  assert.equal(river.surface.texture.version, uploads, 'idle river does not upload textures');
  const index = river.geometry.index.array;
  for (let n = 0; n < river.geometry.drawRange.count; n += 6) {
    const i = index[n]; if (i >= world.size) continue;
    assert(stage.contentGeometry.isInsideQuad(i % world.w, Math.floor(i / world.w)), 'river uses production region ownership');
  }
  stage.setRegionMask(null); stage.setNetherLandscapeStyle(true, false);
  assert(river.mesh.visible && !mist.group.visible, 'scenery switch hides mist while retaining river');
  stage.setNetherLandscapeEnabled(false); assert(!river.mesh.visible && !mist.group.visible);
  stage.setNetherLandscapeEnabled(true); assert(river.mesh.visible && !mist.group.visible);
  stage.setNetherLandscapeStyle(true, true); assert(mist.group.visible);
  assert.equal(JSON.stringify(serializeWorld(world)), pristine, 'rendering, regions and controls do not change saved facts');
  const cell = world.water.findIndex((v, i) => v === 0 && i > world.w * 6 && i % world.w > 6 && i % world.w < world.w - 6);
  world.water[cell] = .05; stage.update(.016);
  assert(Math.abs(river.surface.values[cell * 4 + 2] - (.05 - .0015)) < 1e-7, 'actual edited water reaches shader snapshot');
  const wetSize = river.active.size;
  world.water[cell] = 0; stage.update(.016); assert(river.active.size <= wetSize);
  for (const r of deriveScenery(world, undefined, { netherRegional: true })) {
    const g = sampleNetherGeography(world, r.x, r.y);
    assert(g.water <= .0015 && NETHER_REGIONS[g.kind].sceneryKinds.includes(r.kind), 'scenery has traceable geographical eligibility');
  }
  let disposed = 0;
  river.geometry.addEventListener('dispose', () => disposed++); river.material.addEventListener('dispose', () => disposed++);
  mist.geometry.addEventListener('dispose', () => disposed++); mist.material.addEventListener('dispose', () => disposed++);
  stage.dispose(); assert.equal(disposed, 4, 'owned geometry and material are released');
}
assert.equal(JSON.stringify(serializeWorld(old)), before, 'legacy payload roundtrip is unchanged');
console.log('D-N1 rendering: old-save generated fields, 6 layers, purity, masks, idle work, real water, switches and disposal passed.');
