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
import { RegionGeometry, DISTANCE_UNKNOWN } from '../src/inkbox/render3d/region/RegionGeometry.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';
import { VIEW_MAX_AREA_FRAC } from '../src/inkbox/ui/realmView.js';
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
// T1 · RegionGeometry（§10–§14 / §71）
// ══════════════════════════════════════════════════════════════════════════

/** 用生产规范化路径造一个 RegionMask（不是手搓 bbox）。 */
function regionOf(points, world) {
  const sel = normalizeRegion(points, world, VIEW_MAX_AREA_FRAC);
  assert(sel, `normalizeRegion 必须接受这条路径：${JSON.stringify(points)}`);
  return new RegionMask(sel);
}

/**
 * 对一份 RegionGeometry 做**全量**体检：
 *  ① 分类与暴力 `region.contains(quad 中心)` 逐格一致（这是最强判据，任何省算都必须过它）；
 *  ② inside + outside === 全部 quad，且两者不交；
 *  ③ 边界边无重复、无对角线、两端节点不越界；
 *  ④ 每条有向边的**左侧是窗内、右侧是窗外**（定向约定真的成立）。
 */
function auditGeometry(geometry, region, world) {
  const quadW = world.w - 1, quadH = world.h - 1;
  let inside = 0;
  for (let y = 0; y < quadH; y += 1) {
    for (let x = 0; x < quadW; x += 1) {
      const expected = region.contains(x + 0.5, y + 0.5) ? 1 : 0;
      assert.equal(geometry.quadInside[y * quadW + x], expected, `quad(${x},${y}) 分类`);
      assert.equal(geometry.isInsideQuad(x, y), expected === 1);
      inside += expected;
    }
  }
  assert.equal(geometry.insideQuadCount, inside);
  assert.equal(geometry.insideQuadCount + geometry.outsideQuadCount, quadW * quadH, 'inside + outside 必须等于全部 quad');
  assert.equal(inside + geometry.outsideQuadCount, quadW * quadH);
  assert(geometry.insideQuadCount >= 0 && geometry.outsideQuadCount >= 0, 'inside ∩ outside 必须为空');

  const undirected = new Set();
  const insideQuadAt = (x, y) => region.contains(x + 0.5, y + 0.5);
  for (const { ax, ay, bx, by } of geometry.boundaryEdges()) {
    for (const v of [ax, ay, bx, by]) assert(Number.isFinite(v), '边界边不得出现 NaN');
    assert(ax >= 0 && ay >= 0 && bx >= 0 && by >= 0, '边界不得越界');
    assert(ax < world.w && bx < world.w && ay < world.h && by < world.h, '边界节点必须在图内');
    // 正交边：不允许对角线（§14「不错误连接对角区域」）
    assert((ax === bx) !== (ay === by), `边界边必须是水平或垂直：(${ax},${ay})-(${bx},${by})`);
    const key = ax < bx || ay < by ? `${ax},${ay}-${bx},${by}` : `${bx},${by}-${ax},${ay}`;
    assert(!undirected.has(key), `边界边重复：${key}`);
    undirected.add(key);
    // 定向：左内右外。左右侧由**实际方向向量**决定（左 = 方向逆时针 90°），
    // 不能按「水平／垂直」写死——上边与下边方向相反，左侧落点也相反。
    const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
    const sideQuad = (sx, sy) => ({
      x: Math.floor((ax + bx) / 2 + sx * 0.5),
      y: Math.floor((ay + by) / 2 + sy * 0.5),
    });
    const left = sideQuad(-dy, dx);
    const right = sideQuad(dy, -dx);
    assert(insideQuadAt(left.x, left.y), `左内侧不成立：边 ${key}`);
    assert(!insideQuadAt(right.x, right.y), `右外侧不成立：边 ${key}`);
  }
  assert.equal(undirected.size, geometry.edgeCount, 'edgeCount 与实际边数一致');
  return { inside, edges: geometry.edgeCount };
}

const regionShapes = () => {
  const world = makeWorld();
  return {
    world,
    rectangular: regionOf([[10, 8], [30, 8], [30, 20], [10, 20]], world),
    lasso: regionOf([[12, 6], [24, 9], [33, 16], [28, 26], [17, 30], [9, 22], [7, 13]], world),
    concave: regionOf([[8, 8], [28, 8], [28, 14], [16, 14], [16, 26], [8, 26]], world),
    mapEdge: regionOf([[0, 0], [14, 0], [14, 11], [0, 11]], world),
    corridor: regionOf([[10, 12], [34, 12], [34, 14], [10, 14]], world),
  };
};

check('T1 矩形：分类、边界、定向全部正确', () => {
  const { world, rectangular } = regionShapes();
  const geometry = new RegionGeometry(world, rectangular);
  const result = auditGeometry(geometry, rectangular, world);
  // 矩形 20×12 ⇒ 边界周长 = 2*(20+12) 条格边
  assert.equal(result.edges, 2 * (20 + 12), `矩形边界边数应为周长 ${result.edges}`);
  assert.equal(result.inside, 20 * 12);
  assert(geometry.boundaryNodes.length > 0);
});

check('T1 自由套索：分类、边界、定向全部正确', () => {
  const { world, lasso } = regionShapes();
  const geometry = new RegionGeometry(world, lasso);
  const result = auditGeometry(geometry, lasso, world);
  assert(result.inside > 100, `套索面积不该退化：${result.inside}`);
  assert(result.edges > 0);
});

check('T1 凹形：凹进去的格必须判为窗外', () => {
  const { world, concave } = regionShapes();
  const geometry = new RegionGeometry(world, concave);
  auditGeometry(geometry, concave, world);
  // 凹口中心 (22, 20) 在包围盒内、却在形状外 —— 这一条专门防「用包围盒代替多边形」
  assert.equal(concave.contains(22.5, 20.5), false, '凹口必须真的在形状外');
  assert.equal(geometry.isInsideQuad(22, 20), false);
  assert.equal(geometry.isInsideQuad(12, 20), true, '左腿必须仍在窗内');
});

check('T1 贴地图边缘：边界不越界，图外一侧算窗外', () => {
  const { world, mapEdge } = regionShapes();
  const geometry = new RegionGeometry(world, mapEdge);
  const result = auditGeometry(geometry, mapEdge, world);
  assert.equal(geometry.isInsideQuad(0, 0), true, '(0,0) 在窗内');
  // 贴边那一侧没有 quad 邻居 ⇒ 必须照样发边（否则界缘会缺一条边）
  assert(result.edges > 0);
  for (const { ax, ay, bx, by } of geometry.boundaryEdges()) {
    assert(ax >= 0 && ay >= 0 && bx >= 0 && by >= 0);
  }
});

check('T1 狭窄走廊（2 格宽）：短边不被吞掉', () => {
  const { world, corridor } = regionShapes();
  const geometry = new RegionGeometry(world, corridor);
  const result = auditGeometry(geometry, corridor, world);
  // 24×2 的走廊：上下各 24 条 + 两端各 2 条
  assert.equal(result.edges, 24 * 2 + 2 * 2);
  assert.equal(result.inside, 24 * 2);
});

check('T1 单格颈：两片大区域只由一个 quad 相连，不崩且连通性如实', () => {
  const world = makeWorld();
  // 上下两片 10×8，用 (20,15) 一个 quad 连起来。
  const selection = {
    path: [[12, 4], [22, 4], [22, 15], [21, 15], [21, 17], [22, 17], [22, 26], [12, 26], [12, 17], [19, 17], [19, 15], [12, 15]],
    x0: 12, y0: 4, x1: 22, y1: 26, area: 0,
  };
  const region = new RegionMask(selection);
  const geometry = new RegionGeometry(world, region);
  auditGeometry(geometry, region, world);
  assert.equal(geometry.isInsideQuad(20, 15), true, '颈部那一个 quad 必须在窗内');
  assert.equal(geometry.isInsideQuad(20, 16), true, '颈宽 1 格，第二个 quad 也应在窗内');
  assert.equal(geometry.isInsideQuad(14, 16), false, '左腿外侧应在窗外');
  assert(geometry.edgeCount > 0);
});

check('T1 棋盘度 4 接触（□■ / ■□）：不崩、无 NaN、无对角边、无重复 quad', () => {
  const world = makeWorld();
  // 直接给一个棋盘谓词：(qx + qy) 偶数在窗内 ⇒ (0,0) 与 (1,1) 只在一个节点上斜角相触。
  // ⚠️ 谓词必须遵守 RegionGeometry 的输入契约：包围盒外恒 false。
  const region = {
    x0: 0, y0: 0, x1: 6, y1: 6,
    contains: (x, y) => {
      const qx = Math.floor(x), qy = Math.floor(y);
      return qx >= 0 && qy >= 0 && qx <= 6 && qy <= 6 && (qx + qy) % 2 === 0;
    },
  };
  const geometry = new RegionGeometry(world, region);
  auditGeometry(geometry, region, world);
  assert.equal(geometry.isInsideQuad(0, 0), true);
  assert.equal(geometry.isInsideQuad(1, 1), true);
  assert.equal(geometry.isInsideQuad(1, 0), false);
  assert.equal(geometry.isInsideQuad(0, 1), false);
  // 度 4 节点 (1,1)：四条边在这里交汇，但**不得**把两个对角区域连起来。
  const touching = [...geometry.boundaryEdges()].filter(({ ax, ay, bx, by }) =>
    (ax === 1 && ay === 1) || (bx === 1 && by === 1));
  assert(touching.length >= 4, `度 4 节点应有 ≥4 条边交汇，实际 ${touching.length}`);
  for (const { ax, ay, bx, by } of geometry.boundaryEdges()) {
    assert(!(Math.abs(ax - bx) === 1 && Math.abs(ay - by) === 1), '不得出现对角边');
  }
});

check('T1 距离场：边界 0、向外递增、超出带宽为 UNKNOWN，且只算一次', () => {
  const { world, rectangular } = regionShapes();
  // 矩形 = 20×12 个 quad（x 10..29 / y 8..19）⇒ 最深处到最近边界恰好 5 格。
  const geometry = new RegionGeometry(world, rectangular, { distanceBand: 4 });
  assert.equal(geometry.distanceToBoundary(10, 8), 0, '角上 quad 自己就贴着边界');
  assert.equal(geometry.distanceToBoundary(12, 10), 2, '离 x=10 / y=8 各 2 格');
  // 深度 5 > 带宽 4 ⇒ 未计算；有界版把它夹到 band。
  assert.equal(geometry.distanceToBoundary(15, 14), DISTANCE_UNKNOWN);
  assert.equal(geometry.distanceToBoundaryClamped(15, 14, 4), 4);
  // 窗外紧邻边界的那一圈也要有距离（B2 的界缘 / shoulder 都要用）
  assert.equal(geometry.distanceToBoundary(9, 8), 0);
  assert.equal(geometry.distanceToBoundary(30, 14), 0);
  // 完整带宽下的最深值应为 5（矩形半高）
  const full = new RegionGeometry(world, rectangular, { distanceBand: 8 });
  assert.equal(full.distanceToBoundary(15, 14), 5);
  // 距离场是构建期产物：重复查询不改变数组
  const before = geometry.distanceQuad.slice();
  geometry.distanceToBoundary(15, 14); geometry.distanceToBoundary(3, 3);
  assert.deepEqual(geometry.distanceQuad, before, '查询不得重算距离场（§38）');
});

check('T1 输入契约：真实 RegionMask 在包围盒外恒为 false（省算前提）', () => {
  const { world, lasso, concave } = regionShapes();
  for (const region of [lasso, concave]) {
    // 盒外采样：四周各取一圈、外扩 1~3 格
    for (let pad = 1; pad <= 3; pad += 1) {
      for (let x = region.x0 - pad; x <= region.x1 + pad; x += 1) {
        assert.equal(region.contains(x + 0.5, region.y0 - pad + 0.5), false, `盒外上方 (${x},${region.y0 - pad})`);
        assert.equal(region.contains(x + 0.5, region.y1 + pad + 0.5), false, `盒外下方 (${x},${region.y1 + pad})`);
      }
      for (let y = region.y0 - pad; y <= region.y1 + pad; y += 1) {
        assert.equal(region.contains(region.x0 - pad + 0.5, y + 0.5), false, `盒外左侧`);
        assert.equal(region.contains(region.x1 + pad + 0.5, y + 0.5), false, `盒外右侧`);
      }
    }
  }
  assert(world.w > 0);
});

check('T1 无窗（region = null）：全部 quad 视为窗内、零边界边', () => {
  const world = makeWorld();
  const geometry = new RegionGeometry(world, null);
  assert.equal(geometry.allInside, true);
  assert.equal(geometry.insideQuadCount, (world.w - 1) * (world.h - 1));
  assert.equal(geometry.outsideQuadCount, 0);
  assert.equal(geometry.edgeCount, 0);
  assert.equal(geometry.isInsideQuad(0, 0), true);
});

check('T1 省算不改变结果：只在包围盒外扩 1 格内分类，但全图判定与暴力一致', () => {
  const world = makeWorld();
  const region = regionOf([[20, 14], [26, 14], [26, 19], [20, 19]], world);
  const geometry = new RegionGeometry(world, region);
  // scanBounds 必须小于全图（证明省算真的发生了），同时分类已由 auditGeometry 全量比对过。
  const scan = geometry.scanBounds;
  assert((scan.x1 - scan.x0 + 1) < (world.w - 1), '应当只扫包围盒范围');
  assert((scan.y1 - scan.y0 + 1) < (world.h - 1));
  auditGeometry(geometry, region, world);
  assert.equal(geometry.insideQuadCount, 6 * 5);
});

check('T1 Region 未变时不重建：RegionMask 身份稳定 ⇒ 同一个 RegionGeometry', () => {
  const world = makeWorld(); const { host } = makeHost(world);
  const region = regionOf([[10, 10], [24, 10], [24, 20], [10, 20]], world);
  host.setRealmViewState({ open: true, targetPlane: 'upper', region });
  const stage = host.stages.get('mortal');
  const first = stage.regionGeometry;
  assert(first instanceof RegionGeometry);
  for (let i = 0; i < 5; i += 1) host.applyView();
  assert.equal(stage.regionGeometry, first, '同一 Region 不得每帧重建（§12/§85）');
  // 换 Region ⇒ 重建
  const other = regionOf([[12, 12], [26, 12], [26, 22], [12, 22]], world);
  host.setRealmViewState({ open: true, targetPlane: 'upper', region: other });
  assert.notEqual(stage.regionGeometry, first);
  assert.equal(stage.regionGeometry.region, other);
  host.dispose();
});

check('T1 地形索引与 RegionGeometry 同源：drawRange 等于保留 quad 数', () => {
  const world = makeWorld(); const { host } = makeHost(world);
  const region = regionOf([[10, 10], [24, 10], [24, 20], [10, 20]], world);
  host.setRealmViewState({ open: true, targetPlane: 'upper', region });
  const upper = host.stages.get('upper');
  const mortal = host.stages.get('mortal');
  assert.equal(upper.regionMask, region, 'M2-A 的 regionMask 读数必须保留');
  assert.equal(mortal.regionMask, region);
  assert.equal(upper.terrain.regionMask, region);
  assert.equal(upper.terrain.geometry.drawRange.count, upper.regionGeometry.insideQuadCount * 6);
  assert.equal(mortal.terrain.geometry.drawRange.count, mortal.regionGeometry.outsideQuadCount * 6);
  // 两个位面用**同一张**区域表，只是互补（§20）
  assert.equal(mortal.regionGeometry.insideQuadCount, upper.regionGeometry.insideQuadCount);
  host.dispose();
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
