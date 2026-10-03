import assert from 'node:assert/strict';
import * as THREE from 'three';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { EntityLayer } from '../src/inkbox/render3d/entities/EntityLayer.js';
import { VegetationLayer } from '../src/inkbox/render3d/vegetation/VegetationLayer.js';
import { SettlementLayer } from '../src/inkbox/render3d/settlements/SettlementLayer.js';
import { createCultivatorPilot, PILOT_PALETTE } from '../src/inkbox/render3d/art/PilotAssets.js';

const world = generateWorld({ preset: { w: 24, h: 18 }, seed: 701, scatter: true });
world.villages = [{ x: 3, y: 4, level: 1, houses: [{ x: 3, y: 4 }] }];
world.entities = [{ id: 1, sp: 'human', level: 1, x: 4, y: 5, faction: -1 }];
world.height.fill(0.8); world.water.fill(0); world.veg.fill(1);
const before = JSON.stringify(world);
const coordinates = createCoordinates(world);
const elevation = { at: () => 7 };
const people = new EntityLayer(world, coordinates, elevation);
const trees = new VegetationLayer(world, coordinates, elevation);
const houses = new SettlementLayer(world, coordinates, elevation);
people.update(1, world); houses.update(1, world);
assert.equal(people.meshes.cultivator.count, 1);
assert.ok(trees.mesh.count > 0);
const meshes = [people.meshes.cultivator, trees.mesh, houses.bodies, houses.roofs];
const originals = meshes.map(mesh => ({ geometry: mesh.geometry, material: mesh.material,
  count: mesh.count, matrices: mesh.instanceMatrix.array.slice(), buffer: mesh.instanceMatrix }));
// Geometry cost changes with the profile; world-derived counts and identity do
// not. C2A exposes actual triangle counts rather than silently caching baseline.
const factStats = () => [people.stats, houses.stats].map(({ triangles, ...facts }) => facts);
const stats = JSON.stringify(factStats());
const pilot = createCultivatorPilot();
assert.ok(pilot.userData.triangles >= 250 && pilot.userData.triangles <= 450);
assert.ok(pilot.boundingBox.min.y >= -0.001);
assert.equal(Object.keys(PILOT_PALETTE).length, 9);
pilot.dispose();
const profile = { paperColor: '#f5f2ea', silhouetteInkStrength: 0.3, distanceFade: 0.5 };
// Prime the legacy picking bounds, then verify newly widened sleeves are pickable.
people.meshes.cultivator.computeBoundingSphere();
for (const layer of [people, trees, houses]) { layer.setArtProfile(profile); layer.setArtView({ pixelsPerUnit: 4 }); }
const artGeometry = meshes.map(mesh => mesh.geometry);
const artMaterial = meshes.map(mesh => mesh.material);
for (let i = 0; i < meshes.length; i++) {
  assert.notEqual(meshes[i].geometry, originals[i].geometry);
  assert.equal(meshes[i].instanceMatrix, originals[i].buffer);
  assert.equal(meshes[i].count, i === 1 ? originals[i].count / 2 : originals[i].count);
  assert.ok(meshes[i].geometry.getAttribute('color'));
  assert.equal(meshes[i].material.uniforms.projectedPixels.value, 4);
  assert.equal(meshes[i].material.transparent, false);
}
assert.equal(houses.bodies.material, houses.roofs.material);
assert.equal(people.meshes.human.material, people.meshes.cultivator.material);
assert.equal(people.meshes.beast.material, people.meshes.cultivator.material);
assert.equal(people.meshes.wraith.material.transparent, true);
assert.equal(people.meshes.wraith.material.depthWrite, false);
assert.equal(people.meshes.wraith.material.uniforms.pilotOpacity.value, 0.55);
assert.equal(trees.stats.instances, trees.stats.trees);
assert.equal(trees.stats.triangles, trees.stats.trees * 80);
assert.deepEqual(people.meshes.cultivator.userData.renderEntities.map(e => e.id), [1]);
const matrix = new THREE.Matrix4();
people.meshes.cultivator.getMatrixAt(0, matrix);
const origin = new THREE.Vector3(matrix.elements[12] + 0.8, matrix.elements[13] + 1.6, matrix.elements[14] + 10);
people.group.updateMatrixWorld(true);
const hits = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, -1)).intersectObject(people.meshes.cultivator);
assert.ok(hits.some(hit => hit.instanceId === 0));
trees.mesh.getMatrixAt(0, matrix); assert.equal(matrix.elements[13], 7);
for (let round = 0; round < 5; round++) {
  for (const layer of [people, trees, houses]) layer.setArtProfile(null);
  for (let i = 0; i < meshes.length; i++) {
    assert.equal(meshes[i].geometry, originals[i].geometry);
    assert.equal(meshes[i].material, originals[i].material);
    assert.equal(meshes[i].count, originals[i].count);
    assert.deepEqual(meshes[i].instanceMatrix.array, originals[i].matrices);
  }
  for (const layer of [people, trees, houses]) layer.setArtProfile(profile);
  for (let i = 0; i < meshes.length; i++) {
    assert.equal(meshes[i].geometry, artGeometry[i]); assert.equal(meshes[i].material, artMaterial[i]);
  }
}
const mask = { allInside: false, isInsideCell: (x) => x < 12 };
for (const layer of [people, trees, houses]) layer.setRegionGeometry(mask);
people.update(1, world); houses.update(1, world); trees.update();
assert.ok(trees.trees.every(t => t.x < 12));
assert.equal(JSON.stringify(factStats()), stats);
assert.equal(people.stats.triangles, pilot.userData.triangles);
assert.equal(houses.stats.triangles, 80);
assert.equal(JSON.stringify(world), before);
for (const layer of [people, trees, houses]) layer.dispose();
console.log('Pilot contracts passed: finite palette, triangle budget, opaque instancing, toggles, height/mask/picking and world purity.');
