import assert from 'node:assert/strict';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';
import { NetherCliffLayer } from '../src/inkbox/render3d/nether/NetherCliffLayer.js';
import { generateNetherStrataCandidate } from '../src/inkbox/world/netherStrataCandidate.js';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { PlaneStage } from '../src/inkbox/render3d/stage/PlaneStage.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';

const w = 48, h = 32, size = w * h;
const height = new Float32Array(size);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  height[y * w + x] = x < 20 ? 0.28 : x < 26 ? 0.4 + (x - 20) * 0.12 : 1.12;
}
const world = { w, h, size, height, generation: { version: 2 } };
const coordinates = { cellToRender: (x, y) => ({ x: x - w / 2, z: y - h / 2 }) };
const before = height.slice();
const layer = new NetherCliffLayer(world, coordinates, new ElevationField(world));
assert(layer.stats.quads > 0, 'major scar should produce visible cliff faces');
assert(layer.stats.triangles <= 2 * Math.min(9500, Math.max(2500, Math.round((w - 1) * (h - 1) * 0.075))));
assert.deepEqual(height, before, 'render layer must not write the world');
const positions = layer.geometry.attributes.position.array;
for (const v of positions) assert(Number.isFinite(v), 'finite mesh positions');
for (let i = 0; i < positions.length; i += 9) {
  const ax = positions[i + 3] - positions[i], az = positions[i + 5] - positions[i + 2];
  const bx = positions[i + 6] - positions[i], bz = positions[i + 8] - positions[i + 2];
  assert(Math.abs(ax * bz - az * bx) > 0.1, 'no degenerate triangles');
}
const originalCount = layer.stats.quads;
const region = { allInside: false, isInsideQuad: (x) => x < 24 };
layer.setRegionGeometry(region, true);
assert(layer.stats.quads < originalCount && layer.stats.quads > 0, 'Region clips cliff overlay');
const insideCount = layer.stats.quads;
layer.setRegionGeometry(region, false);
assert(layer.stats.quads > 0 && insideCount + layer.stats.quads === originalCount,
  'inside and outside Region partitions cover the original cliff mesh');
layer.setRegionGeometry({ allInside: true }, false);
assert.equal(layer.stats.quads, 0, 'allInside Region has no outside quads');
layer.setRegionGeometry(null);
const builds = layer.stats.rebuilds;
layer.update(0.016);
assert.equal(layer.stats.rebuilds, builds, 'idle frame never scans or rebuilds');
layer.setEnabled(false);
assert.equal(layer.group.visible, false);
layer.setRegionGeometry(region, true);
assert.equal(layer.stats.rebuilds, builds, 'Region changes while disabled defer rebuild');
layer.setEnabled(true);
assert.equal(layer.stats.rebuilds, builds + 1, 'reenabling applies deferred Region');
assert.equal(layer.group.visible, true);
const geometry = layer.geometry, material = layer.material;
let geometryDisposed = false, materialDisposed = false;
geometry.addEventListener('dispose', () => { geometryDisposed = true; });
material.addEventListener('dispose', () => { materialDisposed = true; });
layer.dispose();
assert(geometryDisposed && materialDisposed, 'owned GPU resources are disposed');
layer.dispose();
assert.equal(layer.world, null, 'disposed layer releases world reference');

for (const preset of [WORLD_PRESETS.medium, WORLD_PRESETS.expanse]) {
  for (const seed of [1, 42, 20260914]) {
    const candidate = generateNetherStrataCandidate({ preset, seed });
    const candidateCopy = candidate.height.slice();
    const cliff = new NetherCliffLayer(candidate,
      { cellToRender: (x, y) => ({ x, z: y }) }, new ElevationField(candidate));
    const budget = preset === WORLD_PRESETS.medium ? 8000 : 20000;
    assert(cliff.stats.triangles > 0 && cliff.stats.triangles < budget,
      `${preset.key}/${seed} triangle budget`);
    assert.equal(Object.values(cliff.stats.families).reduce((a, b) => a + b), cliff.stats.quads);
    assert.deepEqual(candidate.height, candidateCopy, 'candidate renderer is read only');
    const pos = cliff.geometry.attributes.position.array;
    for (const n of pos) assert(Number.isFinite(n), 'candidate cliff mesh must be finite');
    for (let i = 0; i < pos.length; i += 9) {
      const ax = pos[i + 3] - pos[i], az = pos[i + 5] - pos[i + 2];
      const bx = pos[i + 6] - pos[i], bz = pos[i + 8] - pos[i + 2];
      assert(Math.abs(ax * bz - az * bx) > 0.1, 'candidate triangle has nonzero area');
    }
    console.log(`cliff ${preset.key}/${seed}: ${cliff.stats.triangles} triangles, ${JSON.stringify(cliff.stats.families)}`);
    cliff.dispose();
  }
}
console.log('D-N2A cliff mesh, Region, purity and idle lifecycle passed');

// Exercise the real Stage wiring as well as the isolated geometry class.
const candidate = generateNetherStrataCandidate({preset:WORLD_PRESETS.small,seed:42});
const facts = candidate.height.slice(), stage = new PlaneStage({plane:'nether',world:candidate});
assert.equal(stage.netherCliffs,null,'product Stage does not allocate candidate cliffs');
stage.setNetherStrataEnabled(true);
const owned = stage.netherCliffs;
assert.equal(owned.elevation,stage.elevation,'Stage owns the only elevation mapping');
const mask = {x0:40,y0:20,x1:140,y1:110,contains:(x,y)=>x>=40&&x<=140&&y>=20&&y<=110};
stage.setRegionMask(mask,true);
const buildCount = owned.stats.rebuilds;
for(let i=0;i<10;i++){stage.setRegionMask(mask,true);stage.update(.016);}
assert.equal(owned.stats.rebuilds,buildCount,'unchanged Stage Region does not rebuild');
stage.setElevationProfile({datum:-3,relief:1.2});
assert(owned.stats.rebuilds>buildCount,'elevation changes invalidate cliffs');
const coords = createCoordinates(candidate), vertices = owned.geometry.attributes.position.array;
for(let i=0;i<vertices.length;i+=9){
  const cell=coords.renderToWorld((vertices[i]+vertices[i+3]+vertices[i+6])/3,(vertices[i+2]+vertices[i+5]+vertices[i+8])/3);
  const average=(vertices[i+1]+vertices[i+4]+vertices[i+7])/3;
  assert(Math.abs(stage.elevation.at(cell.x,cell.y)-average)<1e-4,'cliff triangles and CPU picking share exact topology');
}
stage.setNetherStrataEnabled(false);
assert(!owned.group.visible);stage.setNetherStrataEnabled(true);assert(owned.group.visible);
assert.deepEqual(candidate.height,facts,'Stage operations preserve world heights');
let releases=0;
owned.geometry.addEventListener('dispose',()=>releases++);owned.material.addEventListener('dispose',()=>releases++);
stage.setWorld(generateNetherStrataCandidate({preset:WORLD_PRESETS.small,seed:1}));
assert.equal(releases,2,'replacing a Stage World releases cliff resources');
assert.equal(owned.world,null);assert.equal(stage.netherCliffs,null);
stage.dispose();assert.equal(stage.root.children.length,0);
console.log('D-N2A real Stage: opt-in, Region cache, elevation/picking, replacement and disposal passed');
