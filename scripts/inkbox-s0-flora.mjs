import assert from 'node:assert/strict';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';
import { WorldRenderBridge } from '../src/inkbox/render3d/WorldRenderBridge.js';
import { VegetationLayer } from '../src/inkbox/render3d/vegetation/VegetationLayer.js';
import { createShanhaiTreeLODs } from '../src/inkbox/render3d/shanhai/ShanhaiFlora.js';
import { shanhaiStyleFor } from '../src/inkbox/render3d/shanhai/ShanhaiStyle.js';

const geometries = createShanhaiTreeLODs();
const geometryStats = geometries.map(g => ({ vertices: g.attributes.position.count, triangles: g.attributes.position.count / 3 }));
assert.deepEqual(geometryStats.slice(0, 2), [
  { vertices: 1320, triangles: 440 },
  { vertices: 432, triangles: 144 },
], 'near and mid tree geometry keep their established detail');
assert.deepEqual(geometryStats[2], { vertices: 30, triangles: 10 }, 'far trees use compact, opaque block geometry');
assert.deepEqual([...new Set(geometries[2].getAttribute('aSpecies').array)], [0, 1],
  'far geometry retains separate broadleaf and pine silhouettes');

const world = generateWorld({ preset: { w: 96, h: 72 }, seed: 701, scatter: true });
world.height.fill(.8); world.water.fill(0); world.veg.fill(1);
world.generation = { ...world.generation, version: 2 };
const bridge = new WorldRenderBridge(world);
const layer = new VegetationLayer(world, bridge.coordinates, new ElevationField(world));
layer.setArtProfile({ realmStyle: shanhaiStyleFor('mortal') });
layer.setLODEnabled(true);
layer.setArtView({ pixelsPerUnit: 1 });
const farLodCounts = layer.lodMeshes.map(mesh => mesh.count);
assert.ok(farLodCounts[2] > 0, 'the overview fixture exercises the far geometry');
layer.setArtView({ pixelsPerUnit: 32 });

assert.ok(layer.lodMeshes[0].count > 0, 'the close forest retains an outline-capable batch');
assert.ok(layer.lodMeshes[1].count > 0, 'mid-distance trees remain assigned and rendered');
assert.equal(layer.shanhaiFlora.outlines.length, 1, 'only the close LOD allocates an outline batch');
const closeInk = layer.shanhaiFlora.outlines[0];
assert.equal(closeInk.instanceMatrix, layer.lodMeshes[0].instanceMatrix, 'outline shares the near instance matrices');
assert.equal(closeInk.count, layer.lodMeshes[0].count);
assert.equal(closeInk.visible, true);
assert.equal(layer.lodMeshes[1].children.some(child => child.userData.inkOutline), false,
  'mid-distance foliage has no outline draw pass');

const lodCounts = layer.lodMeshes.map(mesh => mesh.count);
const oldFarTriangles = 16, newFarTriangles = geometryStats[2].triangles;
const oldOutlineInstances = lodCounts[0] + lodCounts[1];
const newOutlineInstances = closeInk.count;
console.log(JSON.stringify({
  geometry: { baselineLOD2: { vertices: 48, triangles: oldFarTriangles }, current: geometryStats[2] },
  trees: layer.trees.length, farLodCounts, outlineFixtureLodCounts: lodCounts,
  outlineInstances: { baselineLOD0And1: oldOutlineInstances, currentLOD0Only: newOutlineInstances },
  lod2TrianglesSaved: farLodCounts[2] * (oldFarTriangles - newFarTriangles),
}, null, 2));

layer.setArtProfile(null);
assert.equal(closeInk.visible, false, 'switching away from Shanhai hides the retained near outline');
layer.dispose();
for (const geometry of geometries) geometry.dispose();
