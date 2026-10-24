import assert from 'node:assert/strict';
import * as THREE from '../../../vendor/three/build/three.module.js';
import { ASSETS, createRuinsLibrary } from '../src/ruinsLibrary.js';
import { SEMANTIC_SLOTS, REALMS, STYLES } from '../src/materials.js';
import { checkManifest } from './generate-manifest.mjs';

const library = createRuinsLibrary(), summary = [];
assert.equal(SEMANTIC_SLOTS.length, 28);
for (const asset of ASSETS) {
  for (const state of asset.states) {
    const counts = [], shapes = [];
    for (let lod = 0; lod < 3; lod++) {
      const g = library.geometryFor(asset.id, lod, state.id), stats = library.statsFor(asset.id, lod, state.id);
      assert.equal(library.geometryFor(asset.id, lod, state.id), g, 'geometry cache must share');
      const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
      assert.equal(n.count, p.count); assert.equal(uv.count, p.count);
      assert.equal(stats.triangles, p.count / 3); assert.equal(g.groups.length, 0);
      const budget = [[120, 240], [40, 96], [6, 20]][lod];
      assert.ok(stats.triangles >= budget[0] && stats.triangles <= budget[1], `${asset.id}:${state.id}:${lod} ${stats.triangles} exceeds target ${budget}`);
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cross = new THREE.Vector3();
      let signedVolume = 0;
      for (let i = 0; i < p.count; i++) {
        assert.ok([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite));
        assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-5, 'finite unit normal');
        const x = uv.getX(i) * 8 - .5, y = uv.getY(i) * 8 - .5;
        assert.ok(Math.abs(x - Math.round(x)) < 1e-6 && Math.abs(y - Math.round(y)) < 1e-6);
        assert.ok(x >= 0 && x < 8 && y >= 0 && y * 8 + x < 28, 'UV semantic cell');
        if (i % 3 === 0) {
          a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
          signedVolume += a.dot(cross.crossVectors(b, c)) / 6;
          cross.crossVectors(b.sub(a), c.sub(a)); assert.ok(cross.length() > 1e-8, 'nondegenerate triangle');
          assert.ok(cross.normalize().dot(new THREE.Vector3().fromBufferAttribute(n, i)) > .9999, 'normal agrees with winding');
        }
      }
      assert.ok(signedVolume > 0, 'closed components must have outward winding');
      assert.equal(stats.bounds.min[1], 0, 'ground pivot');
      assert.ok(stats.bounds.min[0] < 0 && stats.bounds.max[0] > 0);
      assert.ok(stats.bounds.max[2] - stats.bounds.min[2] > .1, 'LOD must retain actual depth');
      assert.ok(stats.geometryBytes > 0); counts.push(stats.triangles); shapes.push(Array.from(p.array).join(','));
    }
    assert.ok(counts[0] > counts[1] && counts[1] > counts[2], 'real descending LOD');
    assert.equal(new Set(shapes).size, 3, 'different geometry at every LOD');
    summary.push({ asset: asset.id, state: state.id, triangles: counts.join('/') });
  }
  if (asset.states.length > 1) {
    const a = library.geometryFor(asset.id, 0, asset.states[0].id), b = library.geometryFor(asset.id, 0, asset.states[1].id);
    assert.notDeepEqual(Array.from(a.attributes.position.array), Array.from(b.attributes.position.array), 'states must change real structure');
  }
}
// Altar LOD1 retains all three real standing-stone landmarks rather than
// collapsing to the platform; LOD2 retains the same state-dependent height.
for (const state of ['dormant', 'depleted']) {
  const id = 'shanhai.leyline.altar';
  const near = library.geometryFor(id, 0, state).attributes.position;
  const middle = library.geometryFor(id, 1, state).attributes.position;
  let standingVertices = 0;
  for (let i = 0; i < middle.count; i++) {
    if (middle.getY(i) <= .46) continue;
    standingVertices++;
    assert.ok(Array.from({ length: near.count }, (_, j) => j).some(j =>
      Math.abs(near.getX(j) - middle.getX(i)) < 1e-6 &&
      Math.abs(near.getY(j) - middle.getY(i)) < 1e-6 &&
      Math.abs(near.getZ(j) - middle.getZ(i)) < 1e-6), 'middle altar stone must preserve an authored near landmark');
  }
  assert.ok(standingVertices >= 9, 'three standing-stone landmarks survive at middle distance');
  const height = library.statsFor(id, 0, state).bounds.max[1];
  for (const lod of [1, 2]) assert.ok(Math.abs(library.statsFor(id, lod, state).bounds.max[1] - height) < 1e-5, 'altar height must survive LOD changes');
}
assert.ok(library.statsFor('shanhai.leyline.altar', 2, 'depleted').bounds.max[1] < library.statsFor('shanhai.leyline.altar', 2, 'dormant').bounds.max[1], 'far depleted altar keeps its collapsed state');
for (const realm of REALMS) for (const style of STYLES) for (const light of [0,1,2]) {
  const m = library.materialFor(realm, style, light); assert.equal(library.materialFor(realm, style, light), m);
}
assert.throws(() => library.geometryFor('invalid')); assert.throws(() => library.geometryFor(ASSETS[0].id, 3));
assert.throws(() => library.geometryFor(ASSETS[0].id, 0, 'invalid')); assert.throws(() => library.materialFor('invalid'));
assert.throws(() => library.createBatch({ id: ASSETS[0].id, matrices: [new THREE.Matrix4().makeScale(0,1,1)] }));
const geometry = library.geometryFor(ASSETS[0].id), material = library.materialFor();
let geometryDisposals = 0, materialDisposals = 0;
geometry.addEventListener('dispose', () => geometryDisposals++); material.addEventListener('dispose', () => materialDisposals++);
for (const count of [1,32,128]) {
  const matrices = Array.from({length:count}, (_, i) => new THREE.Matrix4().makeTranslation(i * 4, 0, 0));
  const batch = library.createBatch({ id: ASSETS[0].id, matrices, outline: true });
  assert.equal(batch.children.length, 2, 'outline must remain one extra merged draw');
  assert.equal(batch.children[0].count, count); assert.equal(batch.children[0].geometry, geometry); assert.equal(batch.children[0].material, material);
  const edge = batch.children[1].geometry; let edgeDisposals = 0, instanceDisposals = 0;
  const buffers = library.stats();
  assert.equal(buffers.instanceMatrixBytes, count * 16 * 4, 'all instance matrix bytes counted');
  assert.equal(buffers.batchGeometryBytes, edge.attributes.position.array.byteLength, 'expanded outline bytes counted');
  assert.equal(buffers.geometryBytes, buffers.cacheGeometryBytes + buffers.batchGeometryBytes + buffers.instanceMatrixBytes);
  edge.addEventListener('dispose', () => edgeDisposals++); batch.children[0].addEventListener('dispose', () => instanceDisposals++);
  batch.userData.dispose(); batch.userData.dispose(); assert.equal(edgeDisposals, 1); assert.equal(instanceDisposals, 1);
  assert.equal(batch.children.length, 0); assert.equal(geometryDisposals, 0); assert.equal(materialDisposals, 0);
}
const retained = library.createBatch({ id: ASSETS[0].id });
library.dispose(); library.dispose();
assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1); assert.equal(retained.children.length, 0);
assert.deepEqual(library.stats(), { geometries: 0, materials: 0, textures: 0, geometryBytes: 0, cacheGeometryBytes: 0, batchGeometryBytes: 0, instanceMatrixBytes: 0, batches: 0, disposed: true });
assert.throws(() => library.geometryFor(ASSETS[0].id)); assert.throws(() => library.materialFor());
await checkManifest(); console.table(summary); console.log('PASS: geometry, budgets, UV, states, LOD, shared material, 1/32/128 instancing, batched outlines, lifecycle and manifest.');
