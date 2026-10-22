import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CloudBillboardBatch } from '../src/inkbox/render3d/shanhai/CloudBillboardBatch.js';
import { ShanhaiAtmosphere } from '../src/inkbox/render3d/shanhai/ShanhaiAtmosphere.js';

const texture = new THREE.Texture();
const batch = new CloudBillboardBatch({ texture });
batch.add({ x: 2, y: 1, z: -5, width: 8, height: 4, color: '#f2eadb', opacity: 0.7, phase: 0.2 });
batch.add({ x: -3, y: 2, z: -15, width: 10, height: 5, color: '#b9c8c4', opacity: 0.5, phase: 1.1 });
batch.add({ x: 0, y: -2, z: -9, width: 6, height: 3, color: '#ffffff', opacity: 0.9, phase: 2.4 });

const scene = new THREE.Scene();
scene.add(batch.mesh);
const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld(true);
batch.update(0, camera, 0.4);

assert.equal(scene.children.length, 1, 'all clouds share one scene object');
assert.equal(batch.mesh.isMesh, true);
assert.equal(batch.mesh.frustumCulled, false, 'the world-edge ring remains visible outside map bounds');
assert.equal(batch.mesh.raycast(), undefined, 'cloud batch is not pickable');
assert.equal(batch.material.transparent, true);
assert.equal(batch.material.depthWrite, false);
assert.equal(batch.material.side, THREE.FrontSide);
assert.equal(batch.geometry.getAttribute('position').count, 12);
assert.equal(batch.geometry.getAttribute('uv').count, 12);
assert.equal(batch.geometry.index.count, 18);
const fixedIndices = Array.from(batch.geometry.index.array);
assert.deepEqual(fixedIndices, [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11]);

const positions = batch.geometry.getAttribute('position');
const colors = batch.geometry.getAttribute('color');
const centerZ = quad => (positions.getZ(quad * 4) + positions.getZ(quad * 4 + 1) + positions.getZ(quad * 4 + 2) + positions.getZ(quad * 4 + 3)) / 4;
const sortedDepths = [0, 1, 2].map(centerZ);
assert.ok(sortedDepths[0] < sortedDepths[1] && sortedDepths[1] < sortedDepths[2], 'transparent quads are sorted far-to-near');
assert.ok(Math.abs(colors.getW(0) - 0.2) < 1e-6, 'per-cloud opacity is preserved and multiplied by fade');
assert.ok(Math.abs(colors.getW(4) - 0.36) < 1e-6);
assert.ok(Math.abs(colors.getW(8) - 0.28) < 1e-6);
assert.equal(batch.mesh.renderOrder, -2);

const firstFrame = Array.from(positions.array);
batch.update(0, camera, 0.4);
assert.deepEqual(Array.from(positions.array), firstFrame, 'identical camera and time produce stable geometry');
assert.deepEqual(Array.from(batch.geometry.index.array), fixedIndices, 'sorting moves whole quads without rewriting fixed indices');

batch.update(0, camera, 0);
for (let i = 0; i < colors.count; i++) assert.equal(colors.getW(i), 0, 'close-up fade reaches zero opacity');

batch.geometry.dispose();
batch.material.dispose();
texture.dispose();

// Representative slab whose perimeter yields about 130 independent legacy puffs.
const host = { world: { w: 256, h: 192, seed: 73 }, scene: new THREE.Scene(), cameraRig: { camera } };
const atmosphere = new ShanhaiAtmosphere(host);
atmosphere.buildBase('mortal');
atmosphere.enabled = true;
atmosphere.root.visible = true;
assert.equal(atmosphere.stats.puffs, 129, 'all generated perimeter puffs are retained');
assert.equal(atmosphere.root.children.filter(child => child.name === 'ShanhaiCloudBillboardBatch').length, 1);
assert.equal(atmosphere.root.children.filter(child => child.isSprite).length, 0, 'perimeter cloud sprites are batched');
assert.equal(atmosphere.root.children.length, 2, 'one cloud draw plus the existing under-sheet');
assert.equal(atmosphere.cloudBatch.records.length, atmosphere.stats.puffs);
atmosphere.update(1 / 60);
atmosphere.clearBase();
assert.equal(atmosphere.root.children.length, 0);
atmosphere.dispose();
console.log('S0-P0 atmosphere CPU contract passed: 129 clouds -> 1 mesh, far-to-near sort, billboard buffers, alpha fade, cleanup.');
