import assert from 'node:assert/strict';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { SEA_LEVEL } from '../src/inkbox/core/config.js';
import { realmStyleFor } from '../src/inkbox/render3d/art/RealmStyleProfile.js';
import { WorldRenderBridge } from '../src/inkbox/render3d/WorldRenderBridge.js';
import { PlaneStage } from '../src/inkbox/render3d/stage/PlaneStage.js';
import { VegetationLayer } from '../src/inkbox/render3d/vegetation/VegetationLayer.js';
import { deriveVegetation, cellHash } from '../src/inkbox/render3d/vegetation/deriveVegetation.js';

const world = generateWorld({ preset: { w: 96, h: 72 }, seed: 701, scatter: true });
world.height.fill(.8); world.water.fill(0); world.veg.fill(1);
world.generation = { ...world.generation, version: 2 };
const stage = new PlaneStage({ plane: 'mortal', world, profile: { vegetation: true } });
const layer = stage.vegetation;
const cells = () => layer.trees.map(t => t.cell);
const expectedCells = () => deriveVegetation(world).map(t => t.cell);
const clearUploads = () => { for (const mesh of layer.lodMeshes) mesh.instanceMatrix.clearUpdateRanges(); };
const compareFresh = () => {
  const fresh = new VegetationLayer(world, stage.coordinates, stage.elevation);
  fresh.setArtProfile(layer.artProfile); fresh.setLODEnabled(layer.lodEnabled); fresh.setArtView(layer.artView);
  assert.deepEqual(cells(), fresh.trees.map(t => t.cell));
  for (let lod = 0; lod < 3; lod++) {
    assert.equal(layer.lodMeshes[lod].count, fresh.lodMeshes[lod].count);
    assert.deepEqual(layer.lodMeshes[lod].instanceMatrix.array.slice(0, layer.lodMeshes[lod].count * 16),
      fresh.lodMeshes[lod].instanceMatrix.array.slice(0, fresh.lodMeshes[lod].count * 16));
  }
  fresh.dispose();
};
assert.ok(layer.trees.length > 4000);
const initialTrees = layer.trees;
const derivations = layer.stats.derivations;
layer.setLODProbeEnabled(); clearUploads();
const colorVersion = layer.mesh.instanceColor.version;
const tree = layer.trees.find(t => t.x > 10 && t.y > 10 && t.x < 90 && t.y < 65);
const cell = tree.cell, x = cell % world.w, y = Math.floor(cell / world.w);
world.height[cell] += .00001;
stage.update(.01);
assert.equal(layer.trees, initialTrees);
assert.equal(layer.stats.derivations, derivations);
assert.equal(layer.lodProbe.calls, 0);
assert.equal(layer.mesh.instanceColor.version, colorVersion);
assert.ok(layer.stats.groundInstancesWritten > 0);
assert.ok(layer.stats.groundInstancesWritten < 40);
assert.ok(layer.mesh.instanceMatrix.updateRanges.every(r => r.count === 1));
compareFresh();

// Re-sampling unchanged Float32 translations does no uploads or bounds work.
clearUploads();
layer.mesh.computeBoundingSphere(); const bounds = layer.mesh.boundingSphere;
const version = layer.mesh.instanceMatrix.version;
world.height[cell] = world.height[cell];
layer.updateGround({ x0: x, y0: y, x1: x, y1: y });
assert.equal(layer.mesh.instanceMatrix.version, version);
assert.equal(layer.mesh.boundingSphere, bounds);

// Type and sub-threshold vegetation/water changes preserve members and LOD.
world.type[cell] = (world.type[cell] + 1) % 5;
world.veg[tree.cell] = .99999; world.water[tree.cell] = .0001;
stage.update(.2);
assert.equal(layer.stats.derivations, derivations);
assert.equal(layer.lodProbe.calls, 0);

// Flooding, drainage, sea-level crossings and hash eligibility all reach Stage's throttled path.
for (const [key, value] of [['water', .002], ['water', 0], ['height', SEA_LEVEL - .01], ['height', .8], ['veg', .1], ['veg', 1]]) {
  world[key][tree.cell] = value; stage.update(.2);
  assert.deepEqual(cells(), expectedCells()); compareFresh();
}
assert.ok(cellHash(world.seed, tree.cell) <= .7);
// The same partial path preserves pilot geometry, rotation, tints and LOD matrix placement.
layer.setArtProfile({ paperColor: '#f5f2ea', realmStyle: realmStyleFor('mortal') });
layer.setLODEnabled(true); layer.setArtView({ pixelsPerUnit: 4 });
clearUploads(); const calls = layer.lodProbe.calls;
world.height[cell] += .00002; stage.update(.01);
assert.equal(layer.lodProbe.calls, calls); compareFresh();

// Profile and Region changes keep their forced refresh contracts.
const beforeProfile = layer.stats.derivations;
stage.setElevationProfile({ datum: 3, relief: 2 });
assert.ok(layer.stats.derivations > beforeProfile); compareFresh();
layer.setRegionGeometry({ allInside: false, isInsideCell: x => x < 48 });
stage.update(.2);
assert.ok(layer.trees.every(t => t.x < 48));
assert.equal(layer.pendingRegionRebuild, false);

// Exact qualification boundaries are shared with derive, including the stable hash cutoff.
const boundaryTree = deriveVegetation(world).find(t => t.rank > .2 && t.rank < .6);
assert.ok(boundaryTree);
const boundaryBridge = new WorldRenderBridge(world);
const checkBoundary = (key, value) => {
  const before = new Set(deriveVegetation(world).map(t => t.cell));
  world[key][boundaryTree.cell] = value;
  const snapshot = JSON.stringify(world);
  const after = new Set(deriveVegetation(world).map(t => t.cell));
  const dirty = boundaryBridge.changes();
  assert.equal(!!dirty?.vegetationMembership, before.has(boundaryTree.cell) !== after.has(boundaryTree.cell));
  assert.equal(JSON.stringify(world), snapshot, 'classification and derivation are read-only');
};
for (const [key, value] of [['veg', boundaryTree.rank / .7 - .00001], ['veg', boundaryTree.rank / .7 + .00001],
  ['water', .0015], ['water', .00151], ['water', 0], ['height', SEA_LEVEL], ['height', SEA_LEVEL - .00001], ['height', .8]]) {
  checkBoundary(key, value);
}
console.log(JSON.stringify({ result: 'G5 vegetation passed', stats: layer.stats,
  avoidedFullDerivationsForLocalHeight: true, localGroundWritesBelow40: true }));
stage.dispose();
