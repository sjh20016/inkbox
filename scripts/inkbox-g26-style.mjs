// G2.6 B1/B2 CPU contract and browser comparison instructions.
// Browser: open inkbox.html?renderer=3d, then run
//   inkboxG26Style.set('candidate')  // cel bands, people .75, houses .76
//   inkboxG26Style.set('baseline')   // original appearance
// The switch is session-local and does not touch save data or random state.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CharacterLibrary, getG26Style, setG26Style, subscribeG26Style } from '../src/inkbox/render3d/characters/CharacterLibrary.js';
import { CharacterBatch } from '../src/inkbox/render3d/characters/CharacterBatch.js';
import { SettlementLayer, deriveSettlements } from '../src/inkbox/render3d/settlements/SettlementLayer.js';

const texture = new THREE.DataTexture(new Uint8Array(12 * 4).fill(255), 12, 1);
const sourceMaterial = new THREE.MeshLambertMaterial({ map: texture });
const scene = new THREE.Group();
for (const id of ['body', 'hair']) {
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  geometry.translate(0, 1, 0);
  const node = new THREE.Mesh(geometry, sourceMaterial);
  node.name = id;
  scene.add(node);
}
const library = new CharacterLibrary({ scene, animations: [] }, {
  phase: 'material', palette: { count: 12, factionSlot: 5 },
  modules: { body: { node: 'body', slot: 'body' }, hair: { node: 'hair', slot: 'hair' } },
  roles: { basic: { body: 'body', hair: 'hair', paletteIndex: 5 } },
});
const shader = {
  uniforms: {},
  vertexShader: '#include <common>\n#include <begin_vertex>',
  fragmentShader: '#include <common>\n#include <map_fragment>\nvec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
};
library.material.onBeforeCompile(shader);
assert.match(shader.fragmentShader, /celLight/);
assert.match(shader.fragmentShader, /vInstancePaletteIndex/);
assert.match(shader.fragmentShader, /realm|paletteUv/);
const batch = new CharacterBatch(library, 2);
batch.setArtProfile({ realmStyle: { entity: { atlas12: Array(12).fill('#445566') } } });
const realmShader = {
  uniforms: {}, vertexShader: shader.vertexShader,
  fragmentShader: '#include <common>\n#include <map_fragment>\nvec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
};
batch.realmMaterial.onBeforeCompile(realmShader);
assert.match(realmShader.fragmentShader, /celLight/);
assert.match(realmShader.fragmentShader, /realmSwatch/);
batch.setArtProfile(null);
let notifications = 0;
const unsubscribe = subscribeG26Style(() => notifications++);
setG26Style('candidate');
assert.equal(shader.uniforms.g26CelStyle.value, 1);
batch.write([{ role: 'basic', x: 2, y: 3, z: 4, scale: 0.75, paletteIndex: 8 }]);
const matrix = new THREE.Matrix4();
batch.meshes.body.getMatrixAt(0, matrix);
assert.equal(matrix.elements[0], 0.75);
assert.equal(matrix.elements[13], 3);
assert.equal(batch.meshes.body.userData.renderEntities.length, 1);

const world = {
  plane: 'mortal', w: 8, h: 8, seed: 7,
  villages: [{ id: 1, x: 2, y: 2, level: 2, houses: [{ x: 2, y: 2, type: 1 }] }],
  factions: [{ capitalX: 5, capitalY: 5 }],
  struct: new Uint8Array(64).fill(1), idx: (x, y) => y * 8 + x, inside: (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8,
};
const coordinates = { worldToRender: (x, y) => ({ x, z: y }) };
const elevation = { at: () => 1.25 };
const settlements = new SettlementLayer(world, coordinates, elevation);
const derived = deriveSettlements(world);
settlements.write(derived, world);
assert.equal(derived.buildings[0].type, 'house');
assert.equal(derived.buildings[1].type, 'center');
assert.equal(derived.buildings[2].type, 'sect');
settlements.bodies.getMatrixAt(0, matrix);
assert.ok(Math.abs(matrix.elements[0] - derived.buildings[0].w * 0.76) < 1e-6);
assert.equal(matrix.elements[13], 1.25); // grounded at either size
assert.equal(settlements.bodies.userData.renderBuildings[0], derived.buildings[0]);
settlements.bodies.getMatrixAt(1, matrix);
assert.ok(Math.abs(matrix.elements[0] - derived.buildings[1].w) < 1e-6); // landmark unchanged
settlements.bodies.getMatrixAt(2, matrix);
assert.ok(Math.abs(matrix.elements[0] - derived.buildings[2].w) < 1e-6);
setG26Style('baseline');
settlements.bodies.getMatrixAt(0, matrix);
assert.ok(Math.abs(matrix.elements[0] - derived.buildings[0].w) < 1e-6);
assert.equal(getG26Style(), 'baseline');
assert.equal(notifications, 2);
unsubscribe();
settlements.dispose();
batch.dispose();
library.dispose();
console.log('G2.6 style comparison CPU contract passed');
