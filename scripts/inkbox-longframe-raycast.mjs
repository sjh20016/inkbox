// 长帧专项：规则格网地形射线求交必须与 three 逐三角形遍历逐项一致。
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { TerrainMesh } from '../src/inkbox/render3d/terrain/TerrainMesh.js';
import { resolveArtProfile } from '../src/inkbox/render3d/art/ArtPassProfile.js';
import { configureTerrainGpu } from '../src/inkbox/render3d/terrain/terrainGpuConfig.js';
import { stepHydrology } from '../src/inkbox/sim/hydrology.js';

configureTerrainGpu('');
const world = generateWorld({ preset: { w: 72, h: 44 }, seed: 20261018, scatter: false });
world.generation = { ...world.generation, version: 2 };
const terrain = new TerrainMesh(world, createCoordinates(world), undefined, true);
terrain.setArtProfile(resolveArtProfile('pilot'));
const full = { x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 };
for (let k = 0; k < 6; k++) { stepHydrology(world, 4); terrain.update(full, { height: true, type: true }); }
const flips = terrain.stats.topologyFlips;

let seed = 7; const rand = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
const raycaster = new THREE.Raycaster();
const keyOf = h => [h.distance.toFixed(6), h.point.x.toFixed(5), h.point.y.toFixed(5), h.point.z.toFixed(5), h.faceIndex, h.face.a, h.face.b, h.face.c,
  h.uv ? h.uv.x.toFixed(6) + ',' + h.uv.y.toFixed(6) : '-', h.barycoord.x.toFixed(6)].join('|');
function compare(label, rays = 400) {
  let hits = 0;
  for (let r = 0; r < rays; r++) {
    const origin = new THREE.Vector3((rand() - .5) * world.w * 1.6, 20 + rand() * 120, (rand() - .5) * world.h * 1.6);
    const target = new THREE.Vector3((rand() - .5) * world.w, rand() * 4, (rand() - .5) * world.h);
    if (r % 17 === 0) target.set(origin.x + (rand() - .5) * 1e-9, 0, origin.z); // 近乎竖直
    if (r % 23 === 0) target.set(origin.x + world.w, origin.y - 1e-3, origin.z); // 掠射
    if (r % 29 === 0) { const x = Math.floor(rand() * (world.w - 2)) + 1 - (world.w - 1) / 2; target.set(x, 0, origin.z * .2); origin.x = x; } // 沿格线
    raycaster.set(origin, target.sub(origin).normalize());
    raycaster.far = r % 5 === 0 ? 60 + rand() * 80 : Infinity;
    const fast = raycaster.intersectObject(terrain.mesh, false);
    const slow = []; THREE.Mesh.prototype.raycast.call(terrain.mesh, raycaster, slow); slow.sort((a, b) => a.distance - b.distance);
    assert.deepEqual(fast.map(keyOf), slow.map(keyOf), `${label} ray ${r}`);
    hits += fast.length;
  }
  return hits;
}
terrain.mesh.updateMatrixWorld(true);
assert.ok(compare('gpu-unmasked') > 100, 'fixture rays hit the terrain');
assert.ok(flips > 0, 'fixture exercised dynamic topology flips');
// 视界遮罩：压缩索引布局。
terrain.setRegionGeometry({ allInside: false, isInsideQuad: (x, y) => (x - 30) ** 2 + (y - 20) ** 2 < 160 }, true);
compare('masked-inside');
terrain.setRegionGeometry({ allInside: false, isInsideQuad: (x, y) => (x - 30) ** 2 + (y - 20) ** 2 < 160 }, false);
compare('masked-outside');
for (let k = 0; k < 3; k++) { stepHydrology(world, 4); terrain.update(full, { height: true, type: false }); }
compare('masked-after-flips');
terrain.setRegionGeometry(null);
// Lambert 回退材质 + Stage 平移缩放矩阵。
terrain.setArtProfile(null);
terrain.mesh.position.set(3, -2, 5); terrain.mesh.scale.set(1, 1.3, 1); terrain.mesh.updateMatrixWorld(true);
compare('legacy-transformed');
terrain.material.side = THREE.FrontSide; compare('front-side', 150);
terrain.material.side = THREE.BackSide; compare('back-side', 150);
terrain.material.side = THREE.DoubleSide;

// 性能下限：同一射线在 512×320 上明显快于逐三角形遍历。
const big = generateWorld({ preset: { w: 512, h: 320 }, seed: 20261018, scatter: false }); big.generation = { ...big.generation, version: 2 };
const bigTerrain = new TerrainMesh(big, createCoordinates(big), undefined, true);
bigTerrain.mesh.updateMatrixWorld(true);
raycaster.set(new THREE.Vector3(-200, 160, 210), new THREE.Vector3(.55, -.6, -.58).normalize()); raycaster.far = Infinity;
const fastQuery = () => raycaster.intersectObject(bigTerrain.mesh, false);
const slowQuery = () => {
  const hits = []; THREE.Mesh.prototype.raycast.call(bigTerrain.mesh, raycaster, hits);
  hits.sort((a, b) => a.distance - b.distance); return hits;
};
const fastBig = fastQuery(), slowBig = slowQuery();
assert.deepEqual(fastBig.map(keyOf), slowBig.map(keyOf), '512x320 parity');
console.log(`PASS terrain heightfield raycast parity (flips ${flips}); 512x320 ${fastBig.length} hit(s)`);

// Wall-clock ratios vary with scheduler and JIT load; keep timing informational,
// outside the Fast Gate. Run with --benchmark for warmed alternating samples.
if (process.argv.includes('--benchmark')) {
  const timed = fn => { const start = performance.now(); fn(); return performance.now() - start; };
  for (let i = 0; i < 3; i++) { fastQuery(); slowQuery(); }
  const fastSamples = [], slowSamples = [];
  for (let i = 0; i < 7; i++) {
    if (i % 2 === 0) { fastSamples.push(timed(fastQuery)); slowSamples.push(timed(slowQuery)); }
    else { slowSamples.push(timed(slowQuery)); fastSamples.push(timed(fastQuery)); }
  }
  const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const fastMs = median(fastSamples), slowMs = median(slowSamples);
  console.log(`BENCH non-gating 512x320 median: heightfield ${fastMs.toFixed(2)} ms; brute ${slowMs.toFixed(2)} ms; ${(slowMs / fastMs).toFixed(1)}x`);
}
