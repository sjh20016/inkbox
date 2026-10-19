import assert from 'node:assert/strict';
import { WaterLayer } from '../src/inkbox/render3d/water/WaterLayer.js';
import { waterGpuConfig } from '../src/inkbox/render3d/water/WaterGpuSurface.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';
import { realmStyleFor } from '../src/inkbox/render3d/art/RealmStyleProfile.js';

const w = { w: 9, h: 7, size: 63, seed: 42, generation: { version: 2 }, height: new Float32Array(63), water: new Float32Array(63) };
const c = createCoordinates(w), e = new ElevationField(w, { datum: 2, relief: .73 });
const gpu = new WaterLayer(w, c, e), cpu = new WaterLayer(w, c, e);
const profile = { realmStyle: realmStyleFor('mortal') };
waterGpuConfig.enabled = true; gpu.setArtProfile(profile); cpu.setClipped(true);
assert.equal(gpu.gpuActive, true); assert.equal(gpu.clipGeometry, null);
assert.equal(gpu.inkMaterial.uniforms.waterNodeTexture.value, gpu.gpuSurface.texture);
const s = gpu.gpuSurface, pos = gpu.geometry.attributes.position, idx = gpu.geometry.index;
const positionVersion = pos.version;
let state = 17;
const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
const area = (ax, az, bx, bz, cx, cz) => Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
// Closed form wet area per source triangle: one wet corner yields the product
// of its two edge fractions; two wet corners remove the dry corner triangle.
function wetFraction(depths) {
  const wet = depths.filter(v => v > 0), dry = depths.filter(v => v <= 0);
  if (!wet.length) return 0; if (!dry.length) return 1;
  if (wet.length === 1) return wet[0] / (wet[0] - dry[0]) * wet[0] / (wet[0] - dry[1]);
  return 1 - dry[0] / (dry[0] - wet[0]) * dry[0] / (dry[0] - wet[1]);
}
for (let trial = 0; trial < 120; trial++) {
  for (let i = 0; i < w.size; i++) { w.height[i] = random(); w.water[i] = random() < .4 ? 0 : random() * .03; }
  const region = trial % 3 ? { allInside: false, isInsideQuad: (x, y) => (x + y + trial) % 3 !== 0 } : null;
  gpu.setRegionGeometry(region, true); cpu.setRegionGeometry(region, true);
  gpu.update({ x0: 0, y0: 0, x1: 8, y1: 6 }); cpu.update({ x0: 0, y0: 0, x1: 8, y1: 6 });
  let expected = 0;
  for (let j = 0; j < 8 * 6 * 6; j += 3) {
    const [a, b, d] = idx.array.subarray(j, j + 3);
    expected += area(pos.getX(a), pos.getZ(a), pos.getX(b), pos.getZ(b), pos.getX(d), pos.getZ(d)) * wetFraction([s.values[a * 4 + 2], s.values[b * 4 + 2], s.values[d * 4 + 2]]);
  }
  let actual = 0;
  const cp = cpu.geometry.attributes.position, ci = cpu.geometry.index.array;
  for (let j = 0; j < cpu.geometry.drawRange.count; j += 3) {
    const [a, b, d] = ci.subarray(j, j + 3);
    actual += area(cp.getX(a), cp.getZ(a), cp.getX(b), cp.getZ(b), cp.getX(d), cp.getZ(d));
  }
  assert.ok(Math.abs(expected - actual) < 2e-5, `wet triangle area trial ${trial}: ${expected} != ${actual}`);
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    const i = y * w.w + x;
    assert.equal(s.values[i * 4], Math.fround(Math.fround(e.nodeForHeight(w.height[i] + w.water[i], x, y)) + .04));
    assert.equal(s.values[i * 4 + 1], Math.fround(e.node(x, y)));
  }
}
console.log('PASS 120 changing topology/wet/Region matrices preserve CPU wet area and ElevationField surface/bottom values');
// Simulate the renderer consuming uploads before measuring a hydrology edit.
s.texture.onUpdate(); s.texture.clearUpdateRanges(); idx.onUploadCallback(); idx.clearUpdateRanges();
const iv = idx.version;
w.water[10] += .01;
gpu.update({ x0: 1, y0: 1, x1: 1, y1: 1 });
assert.equal(pos.version, positionVersion); assert.equal(idx.version, iv);
assert.deepEqual(s.texture.updateRanges, [{ start: 40, count: 4 }]);
console.log('PASS water-only edit uploads 16 float-snapshot bytes, zero position/index bytes');
gpu.setRegionGeometry(null, true);
w.height[0] = 0; w.height[1] = 1; w.height[w.w] = 2; w.height[w.w + 1] = 0;
gpu.update({ x0: 0, y0: 0, x1: 1, y1: 1 });
idx.onUploadCallback(); idx.clearUpdateRanges();
w.height[w.w + 1] = 4;
gpu.update({ x0: 1, y0: 1, x1: 1, y1: 1 });
assert.deepEqual(Array.from(idx.array.slice(0, 6)), [0, 9, 1, 1, 9, 10]);
// P1 长帧专项：间隙 < 4096 的翻转合并成一段。这里 quad 0 与 quad 8（下一行首格）都翻转，
// 合并后恰好一段 [0, 54) 覆盖两者的六个索引；比原“包含 {0,6}”断言更严格（段数与边界都钉死）。
assert.deepEqual(idx.updateRanges, [{ start: 0, count: 54 }]);
const sample = gpu.geometry.attributes.waterSample;
s.rimEdges.forEach(([ax, ay, bx, by], k) => {
  const v = w.size + k * 4;
  assert.equal(sample.getZ(v), 1); assert.equal(sample.getZ(v + 1), 0);
  assert.equal(sample.getZ(v + 2), 0); assert.equal(sample.getZ(v + 3), 1);
  assert.equal(pos.getX(v), pos.getX(ay * w.w + ax));
  assert.equal(pos.getZ(v + 2), pos.getZ(by * w.w + bx));
  assert.equal(sample.getX(v), sample.getX(v + 1));
  assert.equal(sample.getY(v + 2), sample.getY(v + 3));
  assert.ok(ax === 0 && bx === 0 || ay === 0 && by === 0 || ax === 8 && bx === 8 || ay === 6 && by === 6);
});
console.log('PASS actual diagonal flips upload their six indices; perimeter shares nodal depth and terrain/surface endpoints');
// A full pending mask upload must survive a subsequent diagonal partial edit.
gpu.setRegionGeometry({ allInside: true }, true);
assert.equal(idx.updateRanges.length, 0);
for (let i = 0; i < w.size; i++) w.height[i] = i % 2;
gpu.update({ x0: 0, y0: 0, x1: 8, y1: 6 });
assert.equal(idx.updateRanges.length, 0);
console.log('PASS pending full Region upload cannot be truncated by later partial topology updates');
const depths = w.water.slice();
waterGpuConfig.enabled = false; gpu.setArtProfile(profile);
assert.equal(gpu.geometry, gpu.clipGeometry); assert.equal(gpu.inkMaterial.uniforms.waterGpuMode.value, 0);
gpu.setArtProfile(profile); assert.equal(gpu.geometry, gpu.clipGeometry);
w.height[0] += .2;
gpu.update({ x0: 0, y0: 0, x1: 0, y1: 0 });
waterGpuConfig.enabled = true; gpu.setArtProfile(profile);
const finalMask = { allInside: false, isInsideQuad: (x, y) => x < 3 && y < 2 };
gpu.setRegionGeometry(finalMask, false);
gpu.setArtProfile(null); assert.equal(gpu.geometry, gpu.legacyGeometry);
const fresh = new WaterLayer(w, c, e); fresh.setRegionGeometry(finalMask, false);
assert.deepEqual(gpu.geometry.attributes.position.array, fresh.geometry.attributes.position.array);
assert.deepEqual(gpu.geometry.index.array, fresh.geometry.index.array);
assert.equal(gpu.geometry.drawRange.count, fresh.geometry.drawRange.count);
fresh.dispose();
assert.deepEqual(w.water, depths);
let disposed = 0; s.texture.addEventListener('dispose', () => disposed++); s.geometry.addEventListener('dispose', () => disposed++);
gpu.dispose(); cpu.dispose(); assert.equal(disposed, 2);
console.log('PASS GPU/CPU/legacy switches preserve world state, restore geometry/material, and dispose owned resources');
