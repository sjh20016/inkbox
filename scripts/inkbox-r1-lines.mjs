import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { TerrainLineArt, extractTerrainStructure, extractTerrainStructureSteps } from '../src/inkbox/render3d/shanhai/TerrainLineArt.js';
import { TerrainDataTextures } from '../src/inkbox/render3d/art/TerrainDataTextures.js';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';
import { interpolateElevation } from '../src/inkbox/render3d/terrain/VisualElevation.js';
import { quadIndices } from '../src/inkbox/render3d/terrain/topology.js';

// Exercise the authoritative CPU mesh and RG texture contract with non-planar
// quads. GLSL itself still needs the later browser/GPU check.
for (const [label, heights, generation, expectedIndices] of [
  ['legacy BC', [0, 0, 0, 20], null, [0, 2, 1, 1, 2, 3]],
  ['v2 AD', [0, 20, 0, 0], { version: 2 }, [0, 2, 3, 0, 3, 1]],
]) {
  const world = { w: 2, h: 2, size: 4, height: Float32Array.from(heights), type: new Uint8Array(4), generation };
  const elevation = new ElevationField(world);
  const packed = new TerrainDataTextures(world, elevation);
  const nodes = Array.from({ length: 4 }, (_, i) => packed.heights[i * 4 + 1]);
  for (let i = 0; i < 4; i++) {
    assert.equal(packed.heights[i * 4], world.height[i], `${label}: R carries topology height`);
    assert.equal(nodes[i], Math.fround(elevation.node(i % 2, Math.floor(i / 2))), `${label}: G carries mesh node height`);
  }
  const indices = quadIndices(world, 0, 0);
  assert.deepEqual(indices, expectedIndices, `${label}: production mesh split`);
  const center = new THREE.Vector3(0.5, 0.5, 0), bary = new THREE.Vector3();
  const point = i => new THREE.Vector3(i % 2, Math.floor(i / 2), 0);
  let meshHeight;
  for (let t = 0; t < 6; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    THREE.Triangle.getBarycoord(center, point(a), point(b), point(c), bary);
    if (Math.min(bary.x, bary.y, bary.z) >= -1e-6) { meshHeight = bary.x * nodes[a] + bary.y * nodes[b] + bary.z * nodes[c]; break; }
  }
  assert.ok(meshHeight !== undefined);
  const at = interpolateElevation(world, 0.5, 0.5, i => nodes[i]);
  assert.ok(Math.abs(at - meshHeight) < 1e-5, `${label}: authoritative interpolation meets actual triangle`);
  assert.ok(Math.abs(at - (nodes[0] + nodes[1] + nodes[2] + nodes[3]) / 4) > 1, `${label}: bilinear midpoint demonstrably diverges`);
  if (generation) {
    world.height[3] = 30;
    packed.update({ x0: 1, x1: 1, y0: 1, y1: 1 }, { height: true, type: false });
    assert.equal(packed.heights[3 * 4], 30, 'sculpt update refreshes the raw R source');
    assert.deepEqual(quadIndices(world, 0, 0), [0, 2, 1, 1, 2, 3], 'same V2 quad flips to BC after sculpting');
  }
  packed.dispose();
}

const w = 64, h = 64;
const terrainGeometry = new THREE.BufferGeometry();
const vertices = new Float32Array(w * h * 3);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 3;
  vertices[i] = x; vertices[i + 1] = 20 * Math.exp(-(((x - 31.5) / 4) ** 2)) * (0.85 + 0.15 * Math.cos(y / 8)); vertices[i + 2] = y;
}
terrainGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
let sharedDisposals = 0;
terrainGeometry.addEventListener('dispose', () => sharedDisposals++);
const uniforms = Object.fromEntries(['heightTexture', 'mapSize', 'gpuDisplacement', 'shViewXZ', 'shTarget', 'shSpan', 'shAir', 'shMist'].map(key => [key, { value: null }]));
const terrain = { world: { w, h, generation: { version: 2 } }, geometry: terrainGeometry, artData: {}, inkMaterial: { uniforms } };
const lines = new TerrainLineArt(terrain);
const base = { contour: { width: 2 }, ridge: 1, valley: 0, cliff: 0, hatch: 0, minLen: 3 };
lines.setStyle({ ...base, minLen: 999 });
assert.equal(lines.strokeGeometry.drawRange.count, 0, 'first render has no unbuilt structure strokes');
assert.equal(lines.strokes.visible, false, 'first render hides unbuilt structure strokes');
assert.equal(lines.strokeMaterial.uniforms.adaptiveDiagonal.value, 1, 'v2 line shader selects adaptive diagonals');
lines.rebuild();
assert.equal(lines.stats.segments, 0);
assert.equal(lines.strokeGeometry.drawRange.count, 0);

lines.setStyle(base);
lines.rebuild();
assert.ok(lines.stats.segments > 0, 'real ridge extraction should produce segments');
assert.equal(lines.strokes.visible, true, 'matching committed region becomes visible');
const geometry = lines.strokeGeometry;
let disposals = 0;
geometry.addEventListener('dispose', () => {
  assert.equal(geometry.getIndex() !== null, true, 'dispose fires while old buffers are still attached');
  disposals++;
});
const attrs = () => ['aPos', 'aOther', 'aSide', 'aInfo', 'position'].map(name => geometry.getAttribute(name)).concat(geometry.getIndex());
const sameAttrs = (expected, message) => {
  attrs().forEach((attribute, i) => {
    assert.strictEqual(attribute, expected[i], message);
    assert.strictEqual(attribute.array, expected[i].array, `${message}: typed array`);
  });
};
const original = attrs();
const check = () => {
  const segs = lines.stats.segments, index = geometry.getIndex();
  assert.equal(geometry.drawRange.count, segs * 6);
  assert.ok(index.array.length >= segs * 6);
  for (let i = 0; i < segs * 6; i++) assert.ok(index.array[i] < segs * 4, `index ${i} in active vertices`);
  for (const attribute of attrs().slice(0, 4)) {
    assert.ok(attribute.array.length >= segs * 4 * attribute.itemSize);
    for (let i = 0; i < segs * 4 * attribute.itemSize; i++) assert.ok(Number.isFinite(attribute.array[i]));
  }
};
check();
for (let n = 0; n < 4; n++) {
  lines.markDirty(); lines.rebuild(); check();
  sameAttrs(original, 'same capacity keeps attribute objects and arrays');
  for (const attribute of [...original.slice(0, 4), original[5]]) {
    assert.equal(attribute.updateRanges.length, 1);
    assert.equal(attribute.updateRanges[0].count, lines.stats.segments * (attribute === original[5] ? 6 : 4 * attribute.itemSize));
  }
}
assert.equal(disposals, 0, 'same capacity never disposes geometry');

lines.setRegionGeometry({ allInside: false, isInsideQuad: () => true }, false);
assert.equal(lines.strokes.visible, false, 'region identity change immediately hides old visible strokes');
assert.ok(lines.strokeGeometry.drawRange.count > 0, 'old geometry remains intact but cannot be drawn');
lines.rebuild();
assert.equal(lines.stats.segments, 0, 'region exclusion removes structure lines');
assert.equal(geometry.drawRange.count, 0);
sameAttrs(original, 'empty rebuild retains allocated arrays');
lines.setRegionGeometry(null, false);
lines.rebuild(); check();
sameAttrs(original, 'returning to region reuses allocation');

lines.setStyle(null);
assert.equal(lines.group.visible, false);
lines.setStyle({ ...base, valley: 1, cliff: 1, hatch: 1 });
lines.rebuild(); check();
assert.ok(lines.stats.segments > original[5].array.length / 6, 'more line kinds force capacity growth');
assert.equal(disposals, 1, 'growth releases old GPU buffers through geometry disposal');
assert.notEqual(geometry.getIndex(), original[5]);
assert.equal(lines.hull.geometry, terrainGeometry, 'contour borrows terrain geometry');
assert.equal(sharedDisposals, 0, 'line lifecycle never disposes borrowed terrain geometry');

const grown = attrs();
lines.setStyle(base);
lines.rebuild(); check();
sameAttrs(grown, 'shrink reuses grown arrays');
lines.dispose();
assert.equal(disposals, 2, 'final dispose frees active geometry');
assert.equal(sharedDisposals, 0);
assert.equal(lines.strokeGeometry, null);
assert.equal(lines.group.children.length, 0);
terrain.world.generation = null;
lines.setStyle(base);
assert.equal(lines.strokeMaterial.uniforms.adaptiveDiagonal.value, 0, 'legacy line shader keeps BC diagonals');
lines.rebuild();
assert.ok(lines.stats.segments > 0);
assert.equal(lines.strokeGeometry.drawRange.count, lines.stats.segments * 6);
assert.notStrictEqual(lines.strokeGeometry, geometry, 'reenabling after disposal creates owned geometry');
lines.dispose();
assert.equal(sharedDisposals, 0);
console.log(`R1 line lifecycle OK: ${lines.stats.builds} real rebuilds, ${disposals - 1} growth disposal + final disposal`);

// Golden outputs were recorded from the original V1.3 synchronous extractor at
// 77666692. Both the public synchronous API and its cooperative steps must agree.
for (const [size, opts, expected] of [
  [64, base, '00a5c053dae73e526fbb16512a86cf29ef072d14ac08b75d40df7769ff9113c2'],
  [64, { ...base, valley: 1, cliff: 1, hatch: 1 }, '169b60a72efaed28782bfbadf543b45360312f1454ec0b14f5947b7fcdb5590a'],
  [128, base, 'b3f88711f60c89feaa6eba1bc2acf34f2026a0c3cbf0e129a34ee40366e5eff7'],
  [128, { ...base, valley: 1, cliff: 1, hatch: 1 }, 'd1bd7022e784c59a59e43cc30a650b5ecaed63082d874b6288d8fa2d1601366e'],
]) {
  const E = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
    E[y * size + x] = 20 * Math.exp(-(((x - (size - 1) / 2) / 4) ** 2)) * (0.85 + 0.15 * Math.cos(y / 8));
  const sync = extractTerrainStructure(E, size, size, opts);
  const hash = createHash('sha256').update(JSON.stringify(sync)).digest('hex');
  assert.equal(hash, expected, `${size}: V1.3 structure and weights unchanged`);
  const steps = extractTerrainStructureSteps(E, size, size, opts);
  let next, yields = 0;
  do { next = steps.next(); if (!next.done) yields++; } while (!next.done);
  assert.ok(yields > size * 3, `${size}: numerical work yields through multiple phases`);
  assert.deepEqual(next.value, sync, `${size}: cooperative and synchronous paths use one extractor`);
}

const syncLines = new TerrainLineArt(terrain), asyncLines = new TerrainLineArt(terrain);
syncLines.setStyle(base); syncLines.rebuild();
asyncLines.setStyle(base); asyncLines.startBuild();
assert.equal(asyncLines.advanceBuild(0), false, 'one bounded slice does not commit a partial topology');
assert.equal(asyncLines.stats.builds, 0);
assert.equal(asyncLines.strokeGeometry.drawRange.count, 0, 'unbuilt geometry has no partial draw range before commit');
let frames = 0;
while (asyncLines.buildTask && frames++ < 10000) asyncLines.advanceBuild(0);
assert.ok(frames > 3 && frames < 10000, 'cooperative build completes over several slices');
assert.equal(asyncLines.stats.builds, 1);
assert.equal(asyncLines.stats.segments, syncLines.stats.segments);
for (const name of ['aPos', 'aOther', 'aSide', 'aInfo']) {
  const a = asyncLines.strokeGeometry.getAttribute(name), b = syncLines.strokeGeometry.getAttribute(name);
  assert.deepEqual(Array.from(a.array.slice(0, a.count * a.itemSize)),
    Array.from(b.array.slice(0, b.count * b.itemSize)), `${name}: packed geometry equals synchronous result`);
}
assert.deepEqual(Array.from(asyncLines.strokeGeometry.getIndex().array),
  Array.from(syncLines.strokeGeometry.getIndex().array), 'indices match synchronous result');

asyncLines.startBuild(); asyncLines.advanceBuild(0); asyncLines.markDirty();
assert.equal(asyncLines.buildTask, null, 'height dirty during snapshot cancels mixed-row input');
asyncLines.startBuild();
while (!asyncLines.buildTask.snapshotReady) asyncLines.advanceBuild(0);
const liveBefore = Array.from(asyncLines.strokeGeometry.getAttribute('aPos').array);
asyncLines.markDirty();
for (let i = 0; i < 20; i++) asyncLines.advanceBuild(0);
assert.deepEqual(Array.from(asyncLines.strokeGeometry.getAttribute('aPos').array), liveBefore,
  'partial geometry packing never alters a live GPU attribute');
while (asyncLines.buildTask) asyncLines.advanceBuild(0);
assert.equal(asyncLines.stats.builds, 2, 'a coalesced height dirty does not starve the active snapshot');
assert.equal(asyncLines.dirty, true, 'height change schedules a later topology refresh');
assert.ok(asyncLines.stats.lastBuildMs > 0 && asyncLines.stats.lastWallMs >= asyncLines.stats.lastBuildMs,
  'CPU and wall duration are reported separately');
assert.ok(asyncLines.stats.lastMaxSliceMs > 0, 'largest frame slice is reported');
asyncLines.startBuild(); asyncLines.advanceBuild(0);
asyncLines.setRegionGeometry({ allInside: false, isInsideQuad: () => true }, false);
assert.equal(asyncLines.buildTask, null, 'region replacement cancels old extraction immediately');
assert.equal(asyncLines.strokes.visible, false, 'old region is hidden before the replacement starts');
asyncLines.startBuild(); asyncLines.advanceBuild(0);
assert.equal(asyncLines.strokes.visible, false, 'old region stays hidden throughout unfinished replacement');
const prior = asyncLines.stats.builds;
asyncLines.rebuild();
assert.equal(asyncLines.stats.builds, prior + 1);
assert.equal(asyncLines.stats.segments, 0, 'excluded region cannot receive stale old lines');
assert.equal(asyncLines.strokes.visible, true, 'matching empty region commits with zero draw range');
asyncLines.setRegionGeometry(null, false);
assert.equal(asyncLines.strokes.visible, false, 'restoring full region hides excluded-region geometry until commit');
asyncLines.startBuild(); asyncLines.advanceBuild(0);
asyncLines.setStyle({ ...base, hatch: 1 });
assert.equal(asyncLines.buildTask, null, 'extraction style replacement cancels old task');
asyncLines.setStyle(base);
asyncLines.startBuild(); asyncLines.advanceBuild(0);
terrain.world.generation = { version: 3 };
asyncLines.frame({ width: 1280, height: 720 });
assert.equal(asyncLines.buildTask, null, 'world generation replacement cancels old extraction');
assert.equal(asyncLines.dirty, true);
asyncLines.startBuild(); asyncLines.advanceBuild(0);
asyncLines.dispose();
assert.equal(asyncLines.buildTask, null, 'dispose abandons an incomplete job');
assert.equal(asyncLines.strokeGeometry, null);
syncLines.dispose();
assert.equal(sharedDisposals, 0, 'cancel and dispose never free the borrowed terrain mesh');
console.log(`R1 cooperative line build OK: exact V1.3 output, ${frames} bounded slices, cancellation and borrowed-buffer ownership`);
