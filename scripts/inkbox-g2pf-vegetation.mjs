// CPU equivalence and real Three 0.186.1 WebGLAttributes upload protocol.
// --candidate-preview exercises the pending patch in memory, without editing production.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import * as THREE from 'three';
import { WebGLAttributes } from 'three/src/renderers/webgl/WebGLAttributes.js';
import { VegetationLayer } from '../src/inkbox/render3d/vegetation/VegetationLayer.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { deriveVegetation } from '../src/inkbox/render3d/vegetation/deriveVegetation.js';
import { TREE_VARIANT_SCALES, treeVariantIndex } from '../src/inkbox/render3d/vegetation/treeVariation.js';
import { ART_PROFILES } from '../src/inkbox/render3d/art/ArtPassProfile.js';
import { REALM_STYLES } from '../src/inkbox/render3d/art/RealmStyleProfile.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';

assert.equal(THREE.REVISION, '186', 'Test requires shipped Three 0.186.1');
assert.equal(JSON.parse(fs.readFileSync(new URL('../node_modules/three/package.json', import.meta.url))).version, '0.186.1');
const file = 'src/inkbox/render3d/vegetation/VegetationLayer.js';
// Frozen minimal writer oracle; release bundles and shallow CI need no Git history.
const baselineSourceHash='42e1fe322e023f749a0e27ee21c93981d5159d2de31a990c987accf66a8e9ee8';
const body = `const dummy = this._dummy, counts = this._batchCounts;
    const varied = this.artProfile?.realmStyle?.plane === 'mortal';
    this._variantCounts.fill(0);
    let matrixInstancesWritten = 0;
    counts.fill(0);
    for (const mesh of this.lodMeshes) mesh.userData.renderTrees = [];
    for (const tree of this.trees) {
      const lod = this._lodByTree.get(tree.cell) ?? 0;
      const p = this.coordinates.worldToRender(tree.x, tree.y, this.elevation.at(tree.x, tree.y));
      dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(tree.size);
      const variant = varied ? treeVariantIndex(this.world.seed, tree.cell) : 0;
      this._variantCounts[variant]++;
      if (varied) {
        const scale = TREE_VARIANT_SCALES[variant];
        dummy.scale.set(tree.size * scale[0], tree.size * scale[1], tree.size * scale[2]);
      }
      const tint = varied ? this._variantTints[variant] : this._whiteTint;
      const target = this.lodMeshes[lod];
      if (lod === 0 && !this.artProfile) {
        for (let side = 0; side < 2; side++) {
          dummy.rotation.y = tree.rotation + side * Math.PI / 2;
          dummy.updateMatrix(); target.setColorAt(counts[lod], tint); target.setMatrixAt(counts[lod]++, dummy.matrix); matrixInstancesWritten++;
          target.userData.renderTrees.push(tree);
        }
      } else {
        dummy.rotation.y = tree.rotation;
        dummy.updateMatrix(); target.setColorAt(counts[lod], tint); target.setMatrixAt(counts[lod]++, dummy.matrix); matrixInstancesWritten++;
        target.userData.renderTrees.push(tree);
      }
    }
    for (let lod = 0; lod < 3; lod++) {
      const mesh = this.lodMeshes[lod];
      mesh.count = counts[lod]; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.boundingBox = null; mesh.boundingSphere = null;
      mesh.visible = counts[lod] > 0;
    }
    return matrixInstancesWritten;`;
if(process.argv.includes('--historical')){const historical=execFileSync('git',['show',`7c244a7:${file}`],{encoding:'utf8',windowsHide:true});assert.equal(createHash('sha256').update(historical).digest('hex'),baselineSourceHash,'Historical BASE source hash mismatch');}
const oldTail = `mesh.count = counts[lod]; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;`;
const newTail = `mesh.count = counts[lod];
      if (counts[lod] > 0) {
        mesh.instanceMatrix.addUpdateRange(0, counts[lod] * 16);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
          mesh.instanceColor.addUpdateRange(0, counts[lod] * 3);
          mesh.instanceColor.needsUpdate = true;
        }
      }`;
assert(body.includes(oldTail), 'Frozen BASE writer terminal loop differs; review oracle before changing it');
const compile = source => new Function('TREE_VARIANT_SCALES', 'treeVariantIndex', `return function(){${source}}`)(TREE_VARIANT_SCALES, treeVariantIndex);
const legacyWriter = compile(body), previewWriter = compile(body.replace(oldTail, newTail));
const preview = process.argv.includes('--candidate-preview');
const candidateWriter = preview ? previewWriter : VegetationLayer.prototype._writeMatrices;
const world = generateWorld({ preset: { w: 64, h: 48 }, seed: 673231, scatter: true });
const coordinates = createCoordinates(world), realTrees = deriveVegetation(world);
assert(realTrees.length >= 12, 'Formal generated World must supply real trees');
const initialWorldHash = createHash('sha256').update(JSON.stringify(world)).digest('hex');
const report = { preview, threeVersion: '0.186.1', baseline: '7c244a7', baselineSourceHash, baselineWriterHash: createHash('sha256').update(body).digest('hex'), worldSeed: world.seed, formalTrees: realTrees.length, checks: [], uploadLedger: [] };
function check(name, fn) { fn(); report.checks.push(name); console.log('PASS ' + name); }
function make(writer) { const layer = new VegetationLayer(world, coordinates); layer._writeMatrices = writer; layer.update(); return layer; }
const candidate = make(candidateWriter), baseline = make(legacyWriter);
const profile = { ...ART_PROFILES.pilot, realmStyle: REALM_STYLES.mortal };
const bytePrefix = (attribute, count, width) => attribute ? Buffer.from(attribute.array.buffer, attribute.array.byteOffset, count * width * attribute.array.BYTES_PER_ELEMENT) : null;
function compare(label) {
  assert.deepEqual(candidate.stats, baseline.stats, label + ' stats');
  assert.deepEqual(candidate.trees, baseline.trees, label + ' derived facts');
  assert.deepEqual([...candidate._lodByTree], [...baseline._lodByTree], label + ' LOD states');
  for (let lod = 0; lod < 3; lod++) {
    const a = candidate.lodMeshes[lod], b = baseline.lodMeshes[lod];
    assert.equal(a.count, b.count); assert.equal(a.visible, b.visible);
    assert.deepEqual(bytePrefix(a.instanceMatrix, a.count, 16), bytePrefix(b.instanceMatrix, b.count, 16), label + ' matrix prefix');
    assert.deepEqual(bytePrefix(a.instanceColor, a.count, 3), bytePrefix(b.instanceColor, b.count, 3), label + ' color prefix');
    assert.deepEqual(a.userData.renderTrees, b.userData.renderTrees);
    assert.equal(a.boundingBox, null); assert.equal(a.boundingSphere, null);
    a.computeBoundingBox(); b.computeBoundingBox(); a.computeBoundingSphere(); b.computeBoundingSphere();
    assert.deepEqual(a.boundingBox, b.boundingBox); assert.deepEqual(a.boundingSphere, b.boundingSphere);
    // The writer must invalidate previously computed bounds on every rewrite.
    candidate._writeMatrices(); baseline._writeMatrices();
  }
}
const identity = layer => layer.lodMeshes.map(mesh => ({ mesh, matrix: mesh.instanceMatrix, matrixArray: mesh.instanceMatrix.array, capacity: mesh.instanceMatrix.count }));
const fixedIdentity = identity(candidate);
check('BASE legacy crossed-plane effective matrix/color bytes, counts, stats and bounds', () => { compare('legacy'); assert.equal(candidate.mesh.count, candidate.trees.length * 2); });
for (const [label, ppu, expectedLod] of [['near', 100, 0], ['middle', 5, 1], ['far', .5, 2]]) check(`pilot ${label} LOD${expectedLod} equivalence`, () => {
  for (const layer of [candidate, baseline]) { layer.setArtProfile(profile); layer.setLODEnabled(true); layer.setArtView({ pixelsPerUnit: ppu, verticalPixelsPerUnit: ppu }); layer.update(); }
  const versions=candidate.lodMeshes.map(mesh=>{mesh.instanceMatrix.clearUpdateRanges();mesh.instanceColor?.clearUpdateRanges();return [mesh.instanceMatrix.version,mesh.instanceColor?.version];});
  candidate.update();baseline.update();
  for(let lod=0;lod<3;lod++){const mesh=candidate.lodMeshes[lod],count=mesh.count;assert.deepEqual(mesh.instanceMatrix.updateRanges,count?[{start:0,count:count*16}]:[],'LOD'+lod+' exact matrix prefix');assert.equal(mesh.instanceMatrix.version,versions[lod][0]+(count?1:0),'LOD'+lod+' empty matrix dirty');if(mesh.instanceColor){assert.deepEqual(mesh.instanceColor.updateRanges,count?[{start:0,count:count*3}]:[],'LOD'+lod+' exact color prefix');assert.equal(mesh.instanceColor.version,versions[lod][1]+(count?1:0),'LOD'+lod+' empty color dirty');}}
  compare(label); assert(candidate.lodMeshes[expectedLod].count > 0, 'Expected LOD not exercised');
});
const region = new RegionGeometry(world, new RegionMask(normalizeRegion([[12,10],[38,10],[38,31],[12,31]], world, .45)));
for (const inside of [true, false]) check(`real RegionGeometry ${inside ? 'inside' : 'outside'} equivalence`, () => {
  for (const layer of [candidate, baseline]) { layer.setRegionGeometry(region, inside); layer.update(); }
  compare('region/' + inside); assert.equal(candidate.regionGeometry, region);
});
check('fixed mesh/attribute/array identities and capacities survive all transitions', () => assert.deepEqual(identity(candidate), fixedIdentity));

// fakeGL records actual real-engine upload calls, including element offsets/lengths.
const uploads = [];
const gl = { FLOAT: 0x1406, ARRAY_BUFFER: 0x8892, createBuffer: () => ({}), bindBuffer() {}, deleteBuffer() {},
  bufferData(target, array, usage) { uploads.push({ kind: 'bufferData', bytes: array.byteLength, usage }); },
  bufferSubData(target, offsetBytes, array, start = 0, count = array.length) { uploads.push({ kind: 'bufferSubData', offsetBytes, start, count, bytes: count * array.BYTES_PER_ELEMENT }); } };
const attributes = WebGLAttributes(gl), uploadLayer = make(candidateWriter);
uploadLayer.setArtProfile(profile); uploadLayer.setLODEnabled(false);
const mesh = uploadLayer.mesh, matrix = mesh.instanceMatrix, color = mesh.instanceColor;
const write = count => { uploadLayer.trees = realTrees.slice(0, count); uploadLayer._reassignAndUpload(true); };
const submit = () => { attributes.update(matrix, gl.ARRAY_BUFFER); attributes.update(color, gl.ARRAY_BUFFER); };
check('real WebGLAttributes initial createBuffer uploads full fixed capacity, retains queued ranges', () => {
  write(8); const beforeMatrix = structuredClone(matrix.updateRanges), beforeColor = structuredClone(color.updateRanges); submit();
  assert.deepEqual(uploads.map(row => row.bytes), [matrix.array.byteLength, color.array.byteLength]);
  assert.deepEqual(matrix.updateRanges, beforeMatrix); assert.deepEqual(color.updateRanges, beforeColor);
  // The next version update consumes these pending ranges. createBuffer alone does not.
  write(8); submit(); assert.equal(matrix.updateRanges.length, 0); assert.equal(color.updateRanges.length, 0); uploads.length = 0;
});
check('pending expand→shrink→empty→restore preserves union until real engine submission', () => {
  write(12); write(3); const matrixVersion = matrix.version, colorVersion = color.version;
  const beforeEmptyMatrix = structuredClone(matrix.updateRanges), beforeEmptyColor = structuredClone(color.updateRanges);
  write(0); assert.equal(matrix.version, matrixVersion, 'Empty batch must not create matrix dirty version'); assert.equal(color.version, colorVersion, 'Empty batch must not create color dirty version');
  assert.deepEqual(matrix.updateRanges, beforeEmptyMatrix); assert.deepEqual(color.updateRanges, beforeEmptyColor);
  write(5); assert(matrix.updateRanges.every(range => range.count > 0)); assert(color.updateRanges.every(range => range.count > 0));
  assert.deepEqual(matrix.updateRanges, [{ start: 0, count: 12 * 16 }, { start: 0, count: 3 * 16 }, { start: 0, count: 5 * 16 }]);
  assert.deepEqual(color.updateRanges, [{ start: 0, count: 12 * 3 }, { start: 0, count: 3 * 3 }, { start: 0, count: 5 * 3 }]);
  submit(); assert.deepEqual(uploads.map(row => row.bytes), [12 * 16 * 4, 12 * 3 * 4]);
  assert.equal(matrix.updateRanges.length, 0); assert.equal(color.updateRanges.length, 0); report.uploadLedger.push(...uploads); uploads.length = 0;
});
check('after consumed union, later write submits only the new effective prefix', () => {
  write(2); assert.deepEqual(matrix.updateRanges, [{ start: 0, count: 2 * 16 }]); assert.deepEqual(color.updateRanges, [{ start: 0, count: 2 * 3 }]); submit();
  assert.deepEqual(uploads.map(row => row.bytes), [2 * 16 * 4, 2 * 3 * 4]); report.uploadLedger.push(...uploads); uploads.length = 0;
  write(0); submit(); assert.deepEqual(uploads, [], 'Consumed empty batch must produce no new GPU upload');
  const probe=uploadLayer.setLODProbeEnabled(),beforeVersions=uploadLayer.lodMeshes.map(mesh=>mesh.instanceMatrix.version);write(7);const actualMarks=uploadLayer.lodMeshes.reduce((n,mesh,lod)=>n+mesh.instanceMatrix.version-beforeVersions[lod],0);assert.equal(probe.last.matrixNeedsUpdateMarks,actualMarks,'Probe must match actual dirty version increments');assert.equal(probe.matrixNeedsUpdateMarks,actualMarks);write(0);assert.equal(probe.last.matrixNeedsUpdateMarks,0,'Empty rewrite probe must report no marks');assert.equal(probe.matrixNeedsUpdateMarks,actualMarks,'Empty rewrite must not increase cumulative probe marks');
});
check('World and simulation facts remain unchanged', () => assert.equal(createHash('sha256').update(JSON.stringify(world)).digest('hex'), initialWorldHash));
for (const layer of [candidate, baseline, uploadLayer]) layer.dispose();
console.log(JSON.stringify(report));
