import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WANLING_CATALOG, creatureFormOf, LEGACY_BEAST_FORMS } from '../src/inkbox/core/wanlingCatalog.js';
import { deriveEntities, deriveUpperEntities, deriveNetherEntities, sameEntities, ENTITY_CLASSES } from '../src/inkbox/render3d/entities/deriveEntities.js';
import { readBiyiPairs } from '../src/inkbox/render/wanlingLayer.js';
import { CreatureBatch } from '../src/inkbox/render3d/creatures/CreatureBatch.js';
import { EntityLayer } from '../src/inkbox/render3d/entities/EntityLayer.js';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';

const lover = { type: 'lover', score: 80 };
const a = { id: 1, sp: 'human', hp: 30, x: 4, y: 4, relations: new Map([[2, lover]]) };
const b = { id: 2, sp: 'human', hp: 30, x: 5, y: 4, relations: new Map([[1, lover]]) };
const legacy = { id: 3, sp: 'beast', hp: 10, x: 7, y: 7 };
const world = { w: 24, h: 18, seed: 22, plane: 'mortal', entities: [a, b, legacy], factions: [], wraiths: [],
  wanling: { units: [{ id: -1, sp: 'beast', form: 'jingwei', hp: 10, x: 8, y: 8, count: 1 },
    { id: -2, sp: 'beast', form: 'deer', hp: 10, x: 9, y: 8, count: 8 },
    { id: -3, sp: 'spirit', form: 'wood', hp: 10, x: 3, y: 7, count: 1 }] } };
assert.equal(WANLING_CATALOG.length, 18);
assert.deepEqual(ENTITY_CLASSES, ['human', 'cultivator', 'beast', 'spirit', 'wraith']);
assert.equal(creatureFormOf(world, world.wanling.units[0]), 'jingwei');
assert(LEGACY_BEAST_FORMS.includes(creatureFormOf(world, legacy)));
const snapshot = structuredClone(world);
const pairs = readBiyiPairs(world);
assert.deepEqual(pairs.map(p => p.partners), [[1, 2]]);
assert.equal(pairs[0].identityContainer, 'biyi');
const derived = deriveEntities(world);
assert.equal(derived.beast.find(e => e.id === -1).identityContainer, 'wanling');
assert.equal(derived.beast.find(e => e.id === -1).form, 'jingwei');
assert.equal(derived.beast.find(e => e.id === -2).count, 8);
assert.equal(derived.spirit.find(e => e.id === -3).identityContainer, 'wanling');
assert.equal(derived.beast.find(e => e.form === 'biyi').identityContainer, 'biyi');
assert(!deriveUpperEntities(world).beast.some(e => e.id < 0));
assert(!deriveNetherEntities(world).beast.some(e => e.id < 0));
assert(sameEntities(derived, deriveEntities(world)));
world.wanling.units[0].form = 'chiru';
assert(!sameEntities(derived, deriveEntities(world)));
world.wanling.units[0].form = 'jingwei';
assert.deepEqual(world, snapshot);
world.wanling.units.push({ id: -4, sp: 'beast', form: 'jiuweihu', mask: 'human',
  hp: 10, x: 6, y: 8, count: 1 });
const foxBefore = structuredClone(world);
const masked = deriveEntities(world);
const fox = masked.beast.find(e => e.id === -4);
assert.equal(fox.form, 'jiuweihu');
assert.equal(fox.identityContainer, 'wanling');
assert.equal(fox.visualMask, 'human');
world.wanling.units.at(-1).mask = 'fox';
assert(!sameEntities(masked, deriveEntities(world)));
world.wanling.units.at(-1).mask = 'human';
assert.deepEqual(world, foxBefore);

const layer = new EntityLayer(world, { worldToRender: (x, y) => ({ x, z: y }) }, { at: () => 0 });
layer.update(1, world);
assert.equal(layer.proceduralMeshes.get('deer').count, 1);
assert.equal(layer.proceduralMeshes.get('wood').count, 1);
assert.equal(layer.proceduralMeshes.get('fox-mask').count, 1);
assert.equal(layer.proceduralMeshes.get('fox-mask').userData.renderEntities[0].form, 'jiuweihu');
assert.equal(layer.proceduralMeshes.get('deer').userData.renderEntities[0].identityContainer, 'wanling');
assert.equal(layer.placeholderMeshes.beast.userData.renderEntities.length, 3); // legacy, GLB-pending, biyi
const woodMesh = layer.proceduralMeshes.get('wood');
const castAt = x => {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, 7), new THREE.Vector3(0, -1, 0));
  return ray.intersectObject(woodMesh, false);
};
assert.equal(castAt(3)[0]?.instanceId, 0);
world.wanling.units[2].x = 12;
layer.update(1, world);
assert.equal(castAt(3).length, 0);
assert.equal(castAt(12)[0]?.instanceId, 0);
world.water = new Float32Array(world.w * world.h).fill(.2);
world.height = new Float32Array(world.w * world.h).fill(.4);
layer.elevation = new ElevationField(world);
assert(layer.presentationY({ form: 'chiru', x: 5, y: 5, lift: 0 }) > 6);
assert(layer.presentationY({ form: 'water', x: 5, y: 5, lift: .9 }) > 6.9);
layer.dispose();

const material = new THREE.MeshBasicMaterial();
const first = new THREE.BoxGeometry();
const second = new THREE.ConeGeometry();
const library = { disposed: false, material, species: new Map([['jingwei', { geometry: first, triangles: 12 }]]) };
const batch = new CreatureBatch(library, { capacity: 4 });
library.species.set('chiru', { geometry: second, triangles: 8 });
assert(batch.addSpecies('chiru'));
const stats = batch.write([
  { species: 'jingwei', x: 1, y: 1, z: 1, source: derived.beast.find(e => e.id === -1) },
  { species: 'chiru', x: 2, y: 1, z: 1, source: derived.beast.find(e => e.id === -2) },
]);
assert.equal(stats.instances, 2);
assert.equal(stats.drawCalls, 2);
assert.equal(batch.meshes.get('jingwei').userData.renderEntities[0].identityContainer, 'wanling');
batch.dispose();
assert.equal(batch.meshes.size, 0);
assert.equal(first.getAttribute('position').count, 24); // Batch leaves library geometry owned by library.
first.dispose(); second.dispose(); material.dispose();
console.log('W0.1 render checks passed');
