#!/usr/bin/env node
// Render3D M2-B invariants. Runs without a browser or WebGL context.
//
// 本脚本按委托书的测试编号组织（T0 / T1 / T2 …），一个包一层，可独立加组。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { visualElevation, surfaceElevation, interpolateElevation } from '../src/inkbox/render3d/terrain/VisualElevation.js';
import { ElevationField, RAW_ELEVATION_PROFILE, normalizeElevationProfile } from '../src/inkbox/render3d/terrain/ElevationField.js';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';

let passed = 0;
const checks = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const check = (label, run) => {
  run(); passed += 1; checks.push({ label, status: 'passed' }); console.log(`PASS ${label}`);
};

function makeWorld(seed = 616161, preset = { w: 64, h: 48 }) {
  const world = generateWorld({ preset, seed, scatter: true });
  world.upper = generateUpperWorld({ preset, seed: world.seed });
  world.nether = generateNetherWorld({ preset, seed: world.seed });
  return world;
}

/** 捕获 focusOn 参数，用来验证「相机对焦高度没变」。 */
function hostOptions() {
  const gpu = {
    info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } },
    setPixelRatio() {}, setClearColor() {}, setSize() {},
    render() {}, disposeCount: 0, dispose() { this.disposeCount += 1; },
  };
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(0, 60, 70); camera.lookAt(0, 0, 0);
  const focusCalls = [];
  const cameraRig = {
    camera, update() {}, resize() {}, setDimensions(dimensions) { this.dimensions = { ...dimensions }; },
    focusOn(x, y, height, options) { focusCalls.push({ x, y, height, options }); },
    disposeCount: 0, dispose() { this.disposeCount += 1; },
  };
  return { gpu, cameraRig, focusCalls };
}

function makeHost(world) {
  const options = hostOptions();
  return { host: new Render3DHost({ clientWidth: 900, clientHeight: 600 }, world, options), ...options };
}

/** 生产 Render3D 源码（不含测试脚本）里允许 import 高程实现的**唯一**文件。 */
const ELEVATION_ENTRY = 'src/inkbox/render3d/terrain/ElevationField.js';

// ══════════════════════════════════════════════════════════════════════════
// T0 · B0 identity —— ElevationField 默认模式必须与 M2-A 高程逐位一致
// ══════════════════════════════════════════════════════════════════════════

check('T0 ElevationField 默认 profile 就是 RAW，且 raw 短路生效', () => {
  const world = makeWorld(); const field = new ElevationField(world);
  assert.equal(field.profile, RAW_ELEVATION_PROFILE, '默认 profile 必须是 RAW 单例');
  assert.equal(field.raw, true);
  // 归一化：显式写等价数值也要收敛回同一个 RAW 单例（否则 raw 短路会失效）。
  assert.equal(normalizeElevationProfile({ datum: 0, relief: 1, shoulder: null }), RAW_ELEVATION_PROFILE);
  assert.equal(normalizeElevationProfile({}), RAW_ELEVATION_PROFILE);
  assert.equal(normalizeElevationProfile(null), RAW_ELEVATION_PROFILE);
  // 非 RAW 的必须冻结且如实保留。
  const strata = normalizeElevationProfile({ datum: 30, relief: 0.6 });
  assert.equal(strata.datum, 30); assert.equal(strata.relief, 0.6);
  assert.equal(Object.isFrozen(strata), true);
});

check('T0 每个格点 node() 与 M2-A visualElevation() 逐位一致（全图）', () => {
  const world = makeWorld(); const field = new ElevationField(world);
  let compared = 0;
  for (let y = 0; y < world.h; y += 1) {
    for (let x = 0; x < world.w; x += 1) {
      const expected = visualElevation(world.height[y * world.w + x]);
      assert.equal(field.node(x, y), expected, `node(${x},${y}) 必须逐位一致`);
      compared += 1;
    }
  }
  assert.equal(compared, world.size);
  // base 口径也一样
  assert.equal(field.baseNode(3, 4), visualElevation(world.height[4 * world.w + 3]));
});

check('T0 4000 个随机点 at() 与 M2-A surfaceElevation() 逐位一致（含整数格 / 边界 / 两个三角）', () => {
  const world = makeWorld(); const field = new ElevationField(world);
  const rng = mulberry32(20260930);
  let firstTriangle = 0, secondTriangle = 0;
  for (let i = 0; i < 4000; i += 1) {
    const x = rng() * (world.w - 1), y = rng() * (world.h - 1);
    const u = x - Math.floor(x), v = y - Math.floor(y);
    if (u + v <= 1) firstTriangle += 1; else secondTriangle += 1;
    assert.equal(field.at(x, y), surfaceElevation(world, x, y), `at(${x},${y}) 必须逐位一致`);
  }
  // 两个三角都必须被真的覆盖到，否则「一致」可能只是半个三角形一致。
  assert(firstTriangle > 1000, `a-b-c 三角覆盖不足：${firstTriangle}`);
  assert(secondTriangle > 1000, `b-c-d 三角覆盖不足：${secondTriangle}`);
  // 整数格、边界与四角
  for (const [x, y] of [[0, 0], [0, world.h - 1], [world.w - 1, 0], [world.w - 1, world.h - 1],
    [1, 1], [world.w - 2, world.h - 2], [Math.floor(world.w / 2), Math.floor(world.h / 2)]]) {
    assert.equal(field.at(x, y), surfaceElevation(world, x, y), `边界点 (${x},${y})`);
  }
});

check('T0 Math.fround 行为一致：at() 复现「先 fround 再插值」的 M2-A 顺序', () => {
  const world = makeWorld(); const field = new ElevationField(world);
  const manual = (x, y) => {
    const ix = Math.min(world.w - 2, Math.floor(x)), iy = Math.min(world.h - 2, Math.floor(y));
    const u = x - ix, v = y - iy, i = iy * world.w + ix;
    const a = Math.fround(visualElevation(world.height[i])), b = Math.fround(visualElevation(world.height[i + 1]));
    const c = Math.fround(visualElevation(world.height[i + world.w])), d = Math.fround(visualElevation(world.height[i + world.w + 1]));
    return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  };
  const rng = mulberry32(7);
  for (let i = 0; i < 1000; i += 1) {
    const x = rng() * (world.w - 1), y = rng() * (world.h - 1);
    assert.equal(field.at(x, y), manual(x, y));
  }
  // 插值本体本身也必须还是同一个函数（禁止第二份公式）
  assert.equal(interpolateElevation(world, 5.5, 6.25, i => Math.fround(visualElevation(world.height[i]))),
    surfaceElevation(world, 5.5, 6.25));
});

check('T0 斜面 silhouette 不漂：陡坡格点与插值都与 M2-A 相同', () => {
  const world = makeWorld();
  // 造一段陡坡，专测 silhouette 最敏感的地方。
  for (let y = 10; y < 26; y += 1) for (let x = 20; x < 34; x += 1) {
    const i = y * world.w + x;
    world.height[i] = Math.fround(Math.min(1, 0.1 + (x - 20) * 0.06 + (y - 10) * 0.01));
  }
  const field = new ElevationField(world);
  let compared = 0;
  for (let y = 9; y < 27; y += 1) for (let x = 19; x < 35; x += 1) {
    assert.equal(field.node(x, y), visualElevation(world.height[y * world.w + x]));
    compared += 1;
  }
  const rng = mulberry32(11);
  for (let i = 0; i < 1500; i += 1) {
    const x = 19 + rng() * 16, y = 9 + rng() * 18;
    assert.equal(field.at(x, y), surfaceElevation(world, x, y));
  }
  assert(compared >= 288, `陡坡范围覆盖不足：${compared}`);
});

check('T0 Stage / Layer 拿到的是**同一个** ElevationField 实例（高程单源接线）', () => {
  const world = makeWorld(); const { host } = makeHost(world);
  const stage = host.stages.get('mortal');
  assert(stage.elevation instanceof ElevationField);
  assert.equal(stage.terrain.elevation, stage.elevation);
  assert.equal(stage.water.elevation, stage.elevation);
  assert.equal(stage.vegetation.elevation, stage.elevation);
  assert.equal(stage.entities.elevation, stage.elevation);
  assert.equal(stage.settlements.elevation, stage.elevation);
  assert.equal(stage.markers.elevation, stage.elevation);
  assert.equal(stage.selectionMarker.elevation, stage.elevation);
  assert.equal(stage.fxProbe.elevation, stage.elevation);
  // 三个位面各自一份，互不串
  const upper = host.stages.get('upper');
  assert(upper.elevation instanceof ElevationField);
  assert.notEqual(upper.elevation, stage.elevation);
  assert.notEqual(upper.elevation.world, stage.elevation.world);
  host.dispose();
});

check('T0 贴地不变：地形顶点、实体/建筑/标记贴地高度与 M2-A 逐位相同', () => {
  const world = makeWorld(); const { host } = makeHost(world);
  const stage = host.stages.get('mortal');
  // 地形顶点 Y：几何属性里就是 ElevationField.node() 的 Float32 结果
  const position = stage.terrain.geometry.attributes.position;
  for (let y = 0; y < world.h; y += 5) for (let x = 0; x < world.w; x += 5) {
    const i = y * world.w + x;
    assert.equal(position.getY(i), Math.fround(visualElevation(world.height[i])), `地形顶点 (${x},${y})`);
  }
  // 实体 / 建筑 / 标记贴地：都问同一个 at()，与 M2-A 的 surfaceElevation 逐位相同
  const rng = mulberry32(99);
  for (let i = 0; i < 300; i += 1) {
    const x = rng() * (world.w - 1), y = rng() * (world.h - 1);
    assert.equal(stage.elevation.at(x, y), surfaceElevation(world, x, y));
  }
  host.dispose();
});

check('T0 Camera focus 高度不变：focusOn 传给相机的 Y 仍等于 M2-A surfaceElevation', () => {
  const world = makeWorld(); const { host, focusCalls } = makeHost(world);
  host.focusOn(12.5, 9.25);
  assert.equal(focusCalls.length, 1);
  assert.equal(focusCalls[0].height, surfaceElevation(world, 12.5, 9.25));
  host.focusOn(3, 4, {}, 'upper');
  assert.equal(focusCalls.length, 2);
  assert.equal(focusCalls[1].height, surfaceElevation(world.upper, 3, 4));
  host.dispose();
});

check('T0 非 RAW profile 也走同一个插值本体（不复制公式），且默认不影响 RAW', () => {
  const world = makeWorld();
  const raw = new ElevationField(world);
  const shifted = new ElevationField(world, { datum: 30, relief: 1 });
  // 纯平移：at() 的差必须是常数 30（浮点允许极小误差）
  const rng = mulberry32(5);
  for (let i = 0; i < 500; i += 1) {
    const x = rng() * (world.w - 1), y = rng() * (world.h - 1);
    assert(Math.abs((shifted.at(x, y) - raw.at(x, y)) - 30) < 1e-3);
  }
  assert.equal(shifted.node(4, 5), visualElevation(world.height[5 * world.w + 4]) + 30);
  // 默认 field 仍然是 RAW（前面构造的实例不受影响）
  assert.equal(raw.raw, true);
});

// ══════════════════════════════════════════════════════════════════════════
// §8 / §9 · 高程单源的结构边界（S10：不许第二套高程真相）
// ══════════════════════════════════════════════════════════════════════════

check('§9 结构：生产 Render3D 里只有 ElevationField.js 能 import 高程实现', () => {
  const dir = path.join(root, 'src', 'inkbox', 'render3d');
  const offenders = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const relative = path.relative(root, full).replace(/\\/g, '/');
      if (relative === ELEVATION_ENTRY) continue;
      const source = fs.readFileSync(full, 'utf8');
      if (/from\s+'[^']*VisualElevation\.js'/.test(source)) offenders.push(relative);
    }
  };
  walk(dir);
  assert.deepEqual(offenders, [], `这些文件绕过 ElevationField 直接 import 了高程实现：${offenders.join(', ')}`);
});

check('§9 结构：生产 Render3D 里没有任何 surfaceElevation / visualElevation 调用点', () => {
  const dir = path.join(root, 'src', 'inkbox', 'render3d');
  const offenders = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const relative = path.relative(root, full).replace(/\\/g, '/');
      if (relative === ELEVATION_ENTRY || relative === 'src/inkbox/render3d/terrain/VisualElevation.js') continue;
      const source = fs.readFileSync(full, 'utf8');
      if (/\b(surfaceElevation|visualElevation)\s*\(/.test(source)) offenders.push(relative);
    }
  };
  walk(dir);
  assert.deepEqual(offenders, [], `这些文件仍在直接调用高程函数：${offenders.join(', ')}`);
});

check('§9 结构：ElevationField 复用 VisualElevation，不复制插值公式', () => {
  const source = readSource(ELEVATION_ENTRY);
  assert.match(source, /import \{[^}]*interpolateElevation[^}]*\} from '\.\/VisualElevation\.js'/);
  assert.match(source, /import \{[^}]*visualElevation[^}]*\} from '\.\/VisualElevation\.js'/);
  // 禁止在 ElevationField 里重新实现插值（出现 a + u * (b - a) 这种算式就是抄了）
  assert.doesNotMatch(source, /u\s*\+\s*v\s*<=\s*1/, 'ElevationField 不得复制三角形插值本体');
  assert.doesNotMatch(source, /Math\.max\(0,\s*d\)\s*\*\*\s*2/, 'ElevationField 不得复制 visualElevation 数学');
});

check('§9 结构：PlaneStage 把 this.elevation 显式传给每一个 Layer', () => {
  const source = readSource('src/inkbox/render3d/stage/PlaneStage.js');
  for (const layer of ['TerrainMesh', 'WaterLayer', 'VegetationLayer', 'EntityLayer', 'SettlementLayer', 'WorldMarkerLayer']) {
    assert.match(source, new RegExp(`new ${layer}\\(world, this\\.coordinates, this\\.elevation`),
      `${layer} 必须收到 stage.elevation`);
  }
  assert.match(source, /new SelectionMarker\(this\.coordinates, this\.elevation\)/);
  assert.match(source, /new ElevationField\(world, p\.elevation\)/);
});

check('§9 结构：Slab 保留特殊研究路径但明确注明并走 ElevationField', () => {
  const source = readSource('src/inkbox/render3d/view/SlabPrototype.js');
  assert.match(source, /probe/i, 'Slab 的研究探针地位必须有明确注释');
  assert.match(source, /缺省只为历史研究调用保留/, '缺省高程必须注明只服务历史调用');
  assert.match(source, /targetElevation\.at\(/, 'Slab 必须走 ElevationField');
  assert.match(source, /mortalElevation\.at\(/);
  assert.doesNotMatch(source, /from '[^']*VisualElevation\.js'/);
});

check('§9 结构：Host 传给 Slab 的两侧高程都来自 stage.elevation，并注明 Slab 不扩建', () => {
  const source = readSource('src/inkbox/render3d/Render3DHost.js');
  assert.match(source, /mortalElevation:\s*this\.stages\.get\('mortal'\)\?\.elevation/);
  assert.match(source, /targetElevation:\s*this\.stages\.get\(targetPlane\)\.elevation/);
  assert.match(source, /Slab 是\*\*历史研究探针\*\*/, '§30：必须写明 Slab 不扩建');
  assert.match(source, /new ThreeFxProbe\(\{ plane, coordinates: this\.coordinates, elevation: stage\.elevation \}\)/);
});

// ══════════════════════════════════════════════════════════════════════════

const reportDir = path.join(root, 'reports', 'release', 'render3d-m2b');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'm2b-results.json'), JSON.stringify({
  suite: 'Render3D M2-B',
  status: 'passed',
  passed,
  failed: 0,
  checks,
}, null, 2) + '\n');
fs.writeFileSync(path.join(reportDir, 'm2b.log'), `${checks.map(({ label }) => `PASS ${label}`).join('\n')}\n\n${passed} M2-B invariant groups passed.\n`);
console.log(`\n${passed} M2-B invariant groups passed; report: reports/release/render3d-m2b/m2b-results.json`);
