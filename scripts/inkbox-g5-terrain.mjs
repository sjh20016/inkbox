import assert from 'node:assert/strict';
import * as THREE from 'three';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { TerrainMesh } from '../src/inkbox/render3d/terrain/TerrainMesh.js';
import { TerrainDataTextures } from '../src/inkbox/render3d/art/TerrainDataTextures.js';
import { SurfaceVisualFieldTexture } from '../src/inkbox/render3d/art/SurfaceVisualFieldTexture.js';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';
import { resolveArtProfile } from '../src/inkbox/render3d/art/ArtPassProfile.js';
import { configureTerrainGpu } from '../src/inkbox/render3d/terrain/terrainGpuConfig.js';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';

configureTerrainGpu('');
const world = generateWorld({ preset: { w: 32, h: 20 }, seed: 20261018, scatter: false });
const terrain = new TerrainMesh(world, createCoordinates(world), undefined, true);
terrain.setArtProfile(resolveArtProfile('pilot'));
const full = { x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 };
const cell = { x0: 10, y0: 8, x1: 10, y1: 8 }, i = 8 * world.w + 10;
const position = terrain.geometry.attributes.position, color = terrain.geometry.attributes.color;
const pv = position.version, cv = color.version, heightVersion = terrain.cpuHeightVersion;
world.height[i] += .1; world.type[i] = 7; world.fire[i] = .8;
const before = JSON.stringify(world);
terrain.update(cell, { height: true, type: true, fire: true });
assert.equal(position.version, pv, 'GPU displacement does not upload positions');
assert.equal(color.version, cv, 'GPU material does not upload vertex colors');
assert.ok(terrain.cpuHeightVersion > heightVersion, 'CPU picking tracks new elevations');
for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
  const j = y * world.w + x, expected = Math.fround(terrain.elevation.node(x, y));
  assert.equal(position.getY(j), expected);
  assert.equal(terrain.artData.heights[j * 4 + 1], expected);
  const uv = terrain.geometry.attributes.uv;
  assert.equal(Math.floor(uv.getX(j) * world.w), x);
  assert.equal(Math.floor(uv.getY(j) * world.h), y);
}
const stableVersion = terrain.cpuHeightVersion;
terrain.update(cell, { height: true, type: false });
assert.equal(terrain.cpuHeightVersion, stableVersion, 'identical Float32 elevations keep hover cache valid');
assert.equal(JSON.stringify(world), before, 'render snapshots never write World');

// Full resync followed by a local change before rendering must still upload all channels.
terrain.setArtProfile(null);
world.height[i + 1] += .04; world.type[i + 1] = 8;
terrain.update({ x0: 11, y0: 8, x1: 11, y1: 8 });
for (const attribute of [position, color]) assert.ok(attribute.updateRanges.some(r => r.start === 0 && r.count === attribute.array.length));
assert.equal(color.getX(i), Math.fround(terrain.palette[7].r * (1 - .8 * 1.15 * .86) + .8 * 1.15 * .86));
position.clearUpdateRanges();
terrain.update(cell, { height: true, type: false });
assert.equal(position.updateRanges.length, 0, 'unchanged CPU elevations cannot accumulate unsubmitted ranges');

// A mask replacement and a topology flip can happen in one frame.
terrain.setArtProfile(resolveArtProfile('pilot'));
terrain.setRegionGeometry({ allInside: false, isInsideQuad: x => x < 5 }, true);
terrain.geometry.index.clearUpdateRanges(); // previous frame consumed the masked layout
terrain.setRegionGeometry(null);
const a = world.w + 1, b = a + 1, c = a + world.w, d = c + 1;
world.height[a] = .1; world.height[b] = .9; world.height[c] = .2; world.height[d] = .1;
terrain.update({ x0: 1, y0: 1, x1: 2, y1: 2 }, { height: true, type: false });
world.height[d] = .8; world.height[b] = .2;
terrain.update({ x0: 1, y0: 1, x1: 2, y1: 2 }, { height: true, type: false });
assert.deepEqual(terrain.geometry.index.array, terrain.fullIndices);
assert.ok(terrain.geometry.index.updateRanges.some(r => r.start === 0 && r.count === terrain.geometry.index.array.length));
terrain.dispose();

const large = generateWorld({ preset: { w: 64, h: 64 }, seed: 19, scatter: false });
const data = new TerrainDataTextures(large, new ElevationField(large));
data.heightTexture.onUpdate(); data.heightTexture.clearUpdateRanges();
data.update({ x0: 0, y0: 0, x1: 63, y1: 63 }, { height: true, type: false });
data.update({ x0: 2, y0: 2, x1: 2, y1: 2 }, { height: true, type: false });
assert.equal(data.heightTexture.updateRanges.length, 0, 'small update cannot narrow pending full texture upload');
data.heightTexture.onUpdate();
data.update({ x0: 2, y0: 2, x1: 2, y1: 2 }, { height: true, type: false });
assert.ok(data.heightTexture.updateRanges.length > 0, 'local updates resume after upload');
data.dispose();

const field = new SurfaceVisualFieldTexture(large);
for (const [x, y] of [[0, 0], [63, 63], [20, 30]]) {
  large.water[y * large.w + x] = .17;
  field.update({ x0: x, y0: y, x1: x, y1: y });
  const oracle = new SurfaceVisualFieldTexture(large);
  assert.deepEqual(field.bytes, oracle.bytes, 'packed neighbours match full refresh after dirty halo update');
  oracle.dispose();
}
field.dispose();

// Historical comparison shaders have no GPU displacement contract.
const camera = new THREE.PerspectiveCamera(45, 1, .1, 500);
const gpu = { info: { memory: {}, render: {} }, setPixelRatio() {}, setClearColor() {}, setSize() {}, render() {}, dispose() {} };
const rig = { camera, update() {}, resize() {}, setDimensions() {}, dispose() {} };
const host = new Render3DHost({}, world, { gpu, cameraRig: rig, artProfile: 'realm-style-v1', artDevelopment: true, characters: false, creatures: false, environment: false });
try {
  const stage = host.stages.get('mortal');
  assert.equal(stage.terrain.gpuDisplacementActive(), true);
  assert.equal(stage.water.gpuActive, true);
  for (const style of ['main-style', 'c2d-style']) {
    await host.art.setComparisonStyle(style);
    assert.equal(stage.terrain.gpuDisplacementActive(), false);
    assert.equal(stage.water.gpuActive, false);
    const oldVersion = stage.terrain.geometry.attributes.position.version;
    world.height[i] += .01;
    stage.terrain.update(cell, { height: true, type: false });
    assert.ok(stage.terrain.geometry.attributes.position.version > oldVersion, 'historical shaders receive edited CPU heights');
  }
  await host.art.setComparisonStyle('c2d1-style');
  assert.equal(stage.terrain.gpuDisplacementActive(), true);
  assert.equal(stage.water.gpuActive, true);
} finally { host.dispose(); configureTerrainGpu('terrain=cpu'); }
console.log('G5 terrain: CPU/GPU heights, picking versions, fallback, queued uploads, packed field and historical shaders passed.');
