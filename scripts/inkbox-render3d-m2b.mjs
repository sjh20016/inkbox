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
import { boundarySpec, boundaryElevation, buildRealmBoundaryField } from '../src/inkbox/render3d/boundary/strataProfile.js';
import { ENTITY_CLASSES, deriveEntities } from '../src/inkbox/render3d/entities/deriveEntities.js';
import { STRUCT } from '../src/inkbox/core/config.js';
import { deriveVegetation } from '../src/inkbox/render3d/vegetation/deriveVegetation.js';
import { deriveSettlements } from '../src/inkbox/render3d/settlements/SettlementLayer.js';
import { deriveMarkers, SITE_KINDS } from '../src/inkbox/render3d/markers/WorldMarkerLayer.js';
import { sculpt as sculpt3D, strokeSamples, restoreHeights } from '../src/inkbox/render3d/terrain/sculpt.js';
import { recomputeRect } from '../src/inkbox/world/terrain.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';
import { VIEW_MAX_AREA_FRAC } from '../src/inkbox/ui/realmView.js';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { Render3DAdapter } from '../src/inkbox/render3d/Render3DAdapter.js';

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

/**
 * 去注释（逐字符状态机）。
 *
 * ⚠️ 不能用朴素正则：行注释里出现 `` `sim/*` `` 这种字面量会把中间代码一并删掉
 *    ——D8-C 已经踩过一次（见 `STATUS.md`）。结构断言必须先去掉注释，
 *    否则**文档里提到某个函数名**就会被当成「代码里调了它」。
 */
function stripComments(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  let state = 'code';
  while (i < n) {
    const c = source[i], d = source[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { state = 'block'; i += 2; continue; }
      if (c === "'") state = 'single';
      else if (c === '"') state = 'double';
      else if (c === '`') state = 'template';
      out += c; i += 1; continue;
    }
    if (state === 'line') { if (c === '\n') { state = 'code'; out += c; } i += 1; continue; }
    if (state === 'block') { if (c === '*' && d === '/') { state = 'code'; i += 2; } else i += 1; continue; }
    out += c;
    if (c === '\\') { out += source[i + 1] ?? ''; i += 2; continue; }
    if ((state === 'single' && c === "'") || (state === 'double' && c === '"') || (state === 'template' && c === '`')) state = 'code';
    i += 1;
  }
  return out;
}

/** 读源码并去注释——结构断言统一用这个。 */
const readCode = relative => stripComments(readSource(relative));

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
      const source = stripComments(fs.readFileSync(full, 'utf8'));
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
      const source = stripComments(fs.readFileSync(full, 'utf8'));
      if (/\b(surfaceElevation|visualElevation)\s*\(/.test(source)) offenders.push(relative);
    }
  };
  walk(dir);
  assert.deepEqual(offenders, [], `这些文件仍在直接调用高程函数：${offenders.join(', ')}`);
});

check('§9 结构：ElevationField 复用 VisualElevation，不复制插值公式', () => {
  const source = readCode(ELEVATION_ENTRY);
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
  assert.match(source, /new SelectionMarker\(this\.coordinates, this\.elevation, \{ readonly: !!p\.selectionReadonly, tint: p\.selectionTint \}\)/);
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
// T9 · 3D Sculpt 派生量一致性（§15 / §16 / §79）
//
// B0.3 审计确认：3D sculpt 原先只写 height、不重算 type / qi。修复方式是把
// canonical 的 `recomputeRect()` 接进「唯一的 render3d 世界写边界」。
// 下面这些断言是那次修复的**回归钉**——它们必须能抓住「修回去」。
// ══════════════════════════════════════════════════════════════════════════

/** 统计两段数组有多少格不同（只看全图，避免「只查笔刷矩形」漏掉邻格）。 */
function countDiff(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) n += 1;
  return n;
}

check('T9 3D sculpt 之后 type / qi 必须已经是 canonical，且确实跟着高度变了', () => {
  const world = makeWorld();
  const before = { type: world.type.slice(), qi: world.qi.slice() };
  const region = sculpt3D(world, { x: 32, y: 24, radius: 8, strength: 0.05, mode: 'raise' });
  assert(region && region.count > 0, '笔刷必须真的改到格子');
  const typeAfter = world.type.slice(), qiAfter = world.qi.slice();
  // ① 派生量已是 canonical：再重算一遍不得有任何变化（重算是幂等的）
  recomputeRect(world, region.x0, region.y0, region.x1, region.y1);
  assert.equal(countDiff(world.type, typeAfter), 0, 'type 必须已 canonical（否则就是漏调 recomputeRect）');
  assert.equal(countDiff(world.qi, qiAfter), 0, 'qi 必须已 canonical');
  // ② 而且真的变了 —— 没有这一条，「压根没更新」也会通过 ①（审计期踩过的假绿）
  assert(countDiff(world.type, before.type) > 0, '地形真的变了 ⇒ 地表类型必须跟着变');
  assert(countDiff(world.qi, before.qi) > 0, '地形真的变了 ⇒ 灵气必须跟着变');
});

check('T9 一整笔拖动（多次落笔）之后派生量仍然 canonical', () => {
  const world = makeWorld();
  const before = { type: world.type.slice(), qi: world.qi.slice() };
  let rect = null; let stamps = 0; let cells = 0;
  for (const point of strokeSamples({ x: 24, y: 16 }, { x: 44, y: 34 }, 6)) {
    const r = sculpt3D(world, { ...point, radius: 6, strength: 0.03, mode: 'raise' });
    if (!r) continue;
    stamps += 1; cells += r.count;
    rect = rect
      ? { x0: Math.min(rect.x0, r.x0), y0: Math.min(rect.y0, r.y0), x1: Math.max(rect.x1, r.x1), y1: Math.max(rect.y1, r.y1) }
      : { ...r };
  }
  assert(stamps >= 2 && cells > 100, `一整笔应当有多次落笔与足够格次：${stamps} / ${cells}`);
  const typeAfter = world.type.slice(), qiAfter = world.qi.slice();
  recomputeRect(world, rect.x0, rect.y0, rect.x1, rect.y1);
  assert.equal(countDiff(world.type, typeAfter), 0);
  assert.equal(countDiff(world.qi, qiAfter), 0);
  assert(countDiff(world.type, before.type) > 0);
});

check('T9 undo 之后派生量必须回到 canonical，且有反向对照证明判据有判别力', () => {
  const world = makeWorld();
  const pristine = { height: world.height.slice(), type: world.type.slice(), qi: world.qi.slice() };
  const region = sculpt3D(world, { x: 32, y: 24, radius: 8, strength: 0.06, mode: 'lower' });
  const sculpted = { type: world.type.slice(), qi: world.qi.slice() };
  assert(countDiff(sculpted.type, pristine.type) > 0, '前进之后派生量必须已经变过（否则下面无从判别）');

  // 走真实 undo 路径
  restoreHeights(world, region.changes.map(([i, , old]) => [i, old]));
  assert.equal(countDiff(world.height, pristine.height), 0, '高度必须逐位还原');
  assert.equal(countDiff(world.type, pristine.type), 0, 'undo 后 type 必须回到 canonical');
  assert.equal(countDiff(world.qi, pristine.qi), 0, 'undo 后 qi 必须回到 canonical');

  // 反向对照：只还原高度、不重算 ⇒ 必须重新出现差异。没有这一条，
  // 上面的「差 0」可能只是「两边都没动过」（审计期真实踩到的假绿）。
  const control = makeWorld();
  const controlRegion = sculpt3D(control, { x: 32, y: 24, radius: 8, strength: 0.06, mode: 'lower' });
  for (const [i, , old] of controlRegion.changes) control.height[i] = old;
  control.touch();
  assert(countDiff(control.height, pristine.height) === 0, '对照组高度同样还原成功');
  assert(countDiff(control.type, pristine.type) > 0, '反向对照必须仍失真——否则本组断言无判别力');
});

check('T9 修复纪律：复用 canonical API、不复制分类公式、不新增 RNG、不碰概率', () => {
  const source = readSource('src/inkbox/render3d/terrain/sculpt.js');
  assert.match(source, /import \{ recomputeRect \} from '\.\.\/\.\.\/world\/terrain\.js'/, '必须复用 canonical 重算 API');
  assert.match(source, /recomputeRect\(world,/, 'sculpt 与 restoreHeights 都必须真的调用它');
  assert.match(source, /export function restoreHeights/, 'undo 的还原也要住在这个边界里');
  // 不复制地形分类：不得出现 TERRAIN_* 判定或 classify/qiAt 的自造版本
  assert.doesNotMatch(source, /TERRAIN_INFO|classify\s*\(|qiAt\s*\(/, '不得复制 terrain classification');
  // 不新增 RNG
  assert.doesNotMatch(source, /Math\.random|mulberry32|rng\s*\(/, '不得新增 RNG');
  // 不碰三界概率
  assert.doesNotMatch(source, /CHANCE|LEAK_|WRAITH_CLIMB|POSSESS_/, '不得触碰三界概率常量');
  // 不改 save schema
  assert.doesNotMatch(source, /serialize|SAVE_VERSION|payload/, '不得改 save schema');
});

check('T9 结构：Render3DAdapter.undo 走 restoreHeights，不再自己写 world.height', () => {
  const source = readSource('src/inkbox/render3d/Render3DAdapter.js');
  assert.match(source, /import \{ sculpt, strokeSamples, restoreHeights \}/);
  assert.match(source, /restoreHeights\(entry\.world, entry\.changes\)/);
  assert.doesNotMatch(source, /world\.height\[i\]\s*=/, '适配器不得绕过 sculpt.js 边界自己写高度');
});

// ══════════════════════════════════════════════════════════════════════════
// T2 · 完整 Region Mask（§18–§29 / §72）
//
// M2-A 的毛病：一开窗就把 Water / Vegetation / Settlement / Markers **整层关掉**
// ⇒ 窗外一片光秃。B1 改成「层一直画，由 RegionGeometry 决定画哪一半」。
// 下面每条都拿**独立派生出来的清单**对账，不用实现自证。
// ══════════════════════════════════════════════════════════════════════════

const WINDOW = [[20, 16], [30, 16], [30, 24], [20, 24]];
const LARGE_WINDOW = [[14, 10], [42, 10], [42, 32], [14, 32]];

function openWindow(host, region, targetPlane = 'upper') {
  host.setRealmViewState({ open: true, targetPlane, region });
  host.update(0.2);   // 让各层写一次
  host.update(0.2);   // 植被走 0.15 s 节流通道，需要第二拍
}

function outsideCount(list, geometry) {
  return list.filter(item => !geometry.isInsideCell(item.x, item.y)).length;
}

/**
 * 在窗口**两侧**都放上可控内容。
 *
 * 新生成的世界是空的（实体与村庄是模拟跑出来的），拿它验「窗内不泄漏」会是**空断言**：
 * 两边都是 0，怎么写都绿。所以这里手工摆放，并让窗内 / 窗外各自都有东西可查。
 * 摆放形状与 `scripts/inkbox-render3d-bridge.mjs` 的 `richWorld()` 一致。
 */
function populate(world) {
  const at = (x, y, id) => ({ id, x: x + 0.5, y: y + 0.5, sp: 'human', level: 0, faction: 0, name: `凡人${id}` });
  let id = 9000;
  for (let i = 0; i < 8; i += 1) {
    world.entities.push(at(21 + i, 17, (id += 1)));   // 窗内（窗口 x 20..29 / y 16..23）
    world.entities.push(at(3 + i, 4, (id += 1)));     // 窗外
  }
  world.villages.push(
    { id: 11, x: 24, y: 19, level: 1, faction: 0, name: '窗内村', pop: 0, houses: [{ x: 24, y: 19, type: STRUCT.HOUSE }] },
    { id: 12, x: 6, y: 5, level: 3, faction: 1, name: '窗外城', pop: 0, houses: [{ x: 6, y: 5, type: STRUCT.HALL }, { x: 7, y: 5, type: STRUCT.HOUSE }] },
  );
  world.factions.push({ id: 1, name: '青云门', color: '#a8493c', accent: '#d98a72', capitalX: 6, capitalY: 5 });
  world.artifacts.push({ id: 501, name: '窗内剑', x: 25, y: 18, ownerId: 0, lostDay: 10 });
  world.artifacts.push({ id: 502, name: '窗外刀', x: 5, y: 6, ownerId: 0, lostDay: 10 });
  for (const kind of SITE_KINDS) {
    world.sites.push({ id: 700 + SITE_KINDS.indexOf(kind), kind, x: 26, y: 20, name: `内${kind}`, age: 0 });
    world.sites.push({ id: 720 + SITE_KINDS.indexOf(kind), kind, x: 8, y: 8, name: `外${kind}`, age: 0 });
  }
  world.leylines.push({ id: 801, x: 23, y: 21, radius: 7, strength: 0.4 });
  world.leylines.push({ id: 802, x: 10, y: 10, radius: 7, strength: 0.4 });
  world.rifts.push({ id: 901, x: 27, y: 22, strength: 6, openedDay: 0, age: 900, closedDay: -1, targetPlane: 'upper' });
  return world;
}

check('T2 开窗后窗外不再变秃：水 / 植被 / 聚落 / 标记仍有内容，且不再整层隐藏', () => {
  const world = makeWorld(); const { host } = makeHost(world);
  const stage = host.stages.get('mortal');
  host.update(0.2); host.update(0.2);
  const closed = {
    waterQuads: stage.water.geometry.drawRange.count / 6,
    trees: stage.vegetation.mesh.count,
    buildings: stage.settlements.stats.buildings,
    markers: stage.markers.stats.total,
  };
  assert(closed.waterQuads > 0 && closed.trees > 0, `关窗时必须先有内容可谈：${JSON.stringify(closed)}`);

  const region = regionOf(WINDOW, world);
  openWindow(host, region);
  const rg = stage.regionGeometry;

  // ① §18 的核心：层不再因为开窗就整层关掉
  assert.equal(stage.water.mesh.visible, true, '水面层不得因开窗整体隐藏');
  assert.equal(stage.vegetation.mesh.visible, true, '植被层不得因开窗整体隐藏');
  assert.equal(stage.settlements.group.visible, true, '聚落层不得因开窗整体隐藏');
  assert.equal(stage.markers.group.visible, true, '标记层不得因开窗整体隐藏');

  // ② 窗外确实还有东西
  assert(stage.water.geometry.drawRange.count / 6 > 0, '窗外必须还有水');
  assert(stage.vegetation.mesh.count > 0, '窗外必须还有植被');

  // ③ 而且窗内那部分**真的被排除了**——与独立派生清单逐项对账
  const allTrees = deriveVegetation(world);
  assert.equal(stage.vegetation.mesh.count, outsideCount(allTrees, rg) * 2,
    '每棵树两个交叉面片；窗外的树数必须与独立派生一致');

  const allBuildings = deriveSettlements(world).buildings;
  assert.equal(stage.settlements.stats.buildings,
    Math.min(outsideCount(allBuildings, rg), stage.settlements.bodies.instanceMatrix.count),
    '建筑按中心格归属，窗外数量必须与独立派生一致');

  assert.equal(stage.water.geometry.drawRange.count / 6, rg.outsideQuadCount,
    '水面层保留的 quad 数必须正好等于窗外 quad 数（不多不少）');
  host.dispose();
});

check('T2 窗内不得泄漏凡间实体 / 建筑 / 标记（§29 验收硬项）', () => {
  const world = populate(makeWorld()); const { host } = makeHost(world);
  const stage = host.stages.get('mortal');
  const region = regionOf(WINDOW, world);
  openWindow(host, region);
  const rg = stage.regionGeometry;

  // 实体：直接读**实际提交**的实例清单（`userData.renderEntities` 是拾取用的真源）
  let insideKept = 0; let outsideKept = 0;
  for (const cls of ENTITY_CLASSES) {
    const mesh = stage.entities.meshes[cls];
    for (const item of mesh.userData.renderEntities || []) {
      if (rg.isInsideCell(item.x, item.y)) insideKept += 1;
      else outsideKept += 1;
    }
  }
  assert.equal(insideKept, 0, `窗内泄漏凡间实体 ${insideKept} 个`);
  assert(outsideKept > 0, '窗外实体必须照常提交（否则「没泄漏」可能只是「整层空了」）');
  const derivedMortal = deriveEntities(world);
  const allEntities = ENTITY_CLASSES.flatMap(cls => derivedMortal[cls] || []);
  assert.equal(outsideKept, outsideCount(allEntities, rg), '窗外实体数必须与独立派生一致');

  // 建筑：按中心格归属；实际提交的必须**正好**是窗外那一批
  const allBuildings = deriveSettlements(world).buildings;
  const outsideBuildings = outsideCount(allBuildings, rg);
  const insideBuildings = allBuildings.length - outsideBuildings;
  assert(outsideBuildings > 0 && insideBuildings > 0,
    `两侧都必须有建筑，否则断言空转：内 ${insideBuildings} / 外 ${outsideBuildings}`);
  assert.equal(stage.settlements.stats.buildings, outsideBuildings,
    '实际提交的建筑数必须正好等于窗外那一批（多一个就是泄漏，少一个就是变秃）');

  // 标记：数量必须正好等于「窗外的」派生条数
  const dm = deriveMarkers(world);
  const outsideArtifacts = outsideCount(dm.artifacts, rg);
  assert(outsideArtifacts > 0 && outsideArtifacts < dm.artifacts.length,
    `法宝必须两侧都有：外 ${outsideArtifacts} / 共 ${dm.artifacts.length}`);
  assert.equal(stage.markers.stats.artifacts, outsideArtifacts, '窗内法宝必须被排除、窗外留下');
  let siteOutside = 0; let siteAll = 0;
  for (const kind of SITE_KINDS) {
    siteOutside += outsideCount(dm.sites[kind], rg);
    siteAll += dm.sites[kind].length;
  }
  assert(siteOutside > 0 && siteOutside < siteAll, `地点必须两侧都有：外 ${siteOutside} / 共 ${siteAll}`);
  assert.equal(stage.markers.stats.sites, siteOutside);
  const outsideLey = outsideCount(dm.leylines, rg);
  assert(outsideLey > 0 && outsideLey < dm.leylines.length, '灵脉必须两侧都有');
  assert.equal(stage.markers.stats.leylines, outsideLey, '窗内灵脉必须被排除、窗外留下');

  // §24：裂缝是 World 的持久对象 ⇒ **不随窗口过滤**
  assert.equal(stage.markers.stats.rifts, Math.min(dm.rifts.length, stage.markers.rifts.instanceMatrix.count),
    '裂缝数量不得因开窗而变（§24 / S6）');
  assert(dm.rifts.length > 0, '本用例必须真的有一条裂缝，否则上面那条是空转');
  host.dispose();
});

check('T2 目标界只提交窗内内容；两位面互补且不重叠（§20 / V5）', () => {
  const world = populate(makeWorld()); const { host } = makeHost(world);
  const mortal = host.stages.get('mortal');
  const upper = host.stages.get('upper');
  const region = regionOf(WINDOW, world);
  openWindow(host, region, 'upper');
  const rgM = mortal.regionGeometry;
  const rgU = upper.regionGeometry;
  // 同一张区域表：分类数组必须逐格相同（只是保留的那一半相反）
  assert.equal(rgU.insideQuadCount, rgM.insideQuadCount);
  assert.deepEqual(rgU.quadInside, rgM.quadInside, '两个位面必须共用同一张区域表');
  // 互补：窗内 + 窗外 = 全部，且不相交
  assert.equal(rgM.insideQuadCount + rgM.outsideQuadCount, rgM.quadW * rgM.quadH);
  assert.equal(upper.terrain.geometry.drawRange.count, rgU.insideQuadCount * 6);
  assert.equal(mortal.terrain.geometry.drawRange.count, rgM.outsideQuadCount * 6);
  // 目标界的实体：凡间实体的同坐标内容**不得**泄漏进去（上界只有自己的人口）
  let insideU = 0; let leak = 0;
  for (const cls of ENTITY_CLASSES) {
    const mesh = upper.entities.meshes[cls];
    for (const item of mesh.userData.renderEntities || []) {
      if (rgU.isInsideCell(item.x, item.y)) insideU += 1; else leak += 1;
    }
  }
  assert.equal(leak, 0, '上界 Stage 不得提交窗内之外的内容');
  assert.equal(insideU, 0, '本用例里上界没有人口 ⇒ 窗内不该凭空出现凡间人物（V5）');
  // 凡间的实体一个都不许进上界 Stage
  const mortalIds = new Set(ENTITY_CLASSES.flatMap(cls => deriveEntities(world)[cls] || []).map(e => e.id));
  for (const cls of ENTITY_CLASSES) {
    for (const item of upper.entities.meshes[cls].userData.renderEntities || []) {
      assert.equal(mortalIds.has(item.id), false, '凡间实体泄漏进目标界 Stage');
    }
  }
  host.dispose();
});

check('T2 大窗 / 幽冥窗同样成立，且窗外规模随窗口单调下降', () => {
  const world = makeWorld(); const { host } = makeHost(world);
  const stage = host.stages.get('mortal');
  const small = regionOf(WINDOW, world);
  openWindow(host, small, 'nether');
  const smallOutside = stage.regionGeometry.outsideQuadCount;
  const smallTrees = stage.vegetation.mesh.count;
  const large = regionOf(LARGE_WINDOW, world);
  openWindow(host, large, 'nether');
  const largeOutside = stage.regionGeometry.outsideQuadCount;
  const largeTrees = stage.vegetation.mesh.count;
  assert(largeOutside < smallOutside, '大窗应当排除更多 quad');
  assert(largeTrees <= smallTrees, '大窗留下的树不该更多');
  assert(largeTrees > 0, '大窗之后窗外仍该有树（否则就是变秃）');
  // 目标界换成幽冥：同一个 Stage 机制，换的是 targetPlane
  const nether = host.stages.get('nether');
  assert.equal(nether.terrain.geometry.drawRange.count, nether.regionGeometry.insideQuadCount * 6);
  host.dispose();
});

check('T2 §25 选择环：凡间只画窗外、目标界画窗内且是只读样式', () => {
  const world = makeWorld(); const { host } = makeHost(world);
  const mortal = host.stages.get('mortal');
  const nether = host.stages.get('nether');
  const region = regionOf(WINDOW, world);
  openWindow(host, region, 'nether');

  // 选中一个**窗内**的凡间格 ⇒ 凡间环不得出现（那块地已被幽冥接管）
  host.setSelection(25, 20, 'mortal'); host.applyView();
  assert.equal(mortal.selectionMarker.cell.x, 25);
  assert.equal(mortal.selectionMarker.mesh.visible, false, '窗内的凡间格不得画凡间操作环');
  // 选中一个**窗外**的凡间格 ⇒ 正常显示
  host.setSelection(4, 4, 'mortal'); host.applyView();
  assert.equal(mortal.selectionMarker.mesh.visible, true, '窗外的凡间格照常显示');

  // 选中幽冥对象 ⇒ 由**目标位面**给只读反馈
  host.setSelection(25, 20, 'nether'); host.applyView();
  assert.equal(nether.selectionMarker.mesh.visible, true, '窗内的幽冥对象必须有反馈');
  assert.equal(nether.selectionMarker.readonly, true, '目标界的反馈必须是只读样式');
  assert.equal(nether.selectionMarker.mesh.name, 'RealmSelectionMarker');
  assert.equal(mortal.selectionMarker.mesh.visible, false, '此时凡间不该有环');
  // 只读反馈不得复用凡间那枚朱红操作环的颜色
  assert.notEqual(nether.selectionMarker.material.color.getHex(),
    mortal.selectionMarker.material.color.getHex(), '只读反馈必须与凡间操作环在视觉上分开');
  host.dispose();
});

check('T2 §19 结构：四个 Layer 都不再自己调 region.contains / 自己算包围盒', () => {
  for (const file of ['src/inkbox/render3d/water/WaterLayer.js',
    'src/inkbox/render3d/vegetation/VegetationLayer.js',
    'src/inkbox/render3d/settlements/SettlementLayer.js',
    'src/inkbox/render3d/markers/WorldMarkerLayer.js',
    'src/inkbox/render3d/entities/EntityLayer.js',
    'src/inkbox/render3d/terrain/TerrainMesh.js']) {
    const source = readCode(file);
    assert.doesNotMatch(source, /\.contains\(/, `${file} 不得自己调 region.contains（§19）`);
    assert.doesNotMatch(source, /getBoundingBox\(\)/, `${file} 不得自造包围盒判据`);
  }
  // 过滤只允许走 RegionGeometry 的封装
  const region = readCode('src/inkbox/render3d/region/RegionGeometry.js');
  assert.match(region, /isInsideQuad\(/, '唯一区域判据必须是 RegionGeometry.isInsideQuad');
});

check('T2 §22 结构：植被过滤只在重建路径里，不在每帧重写', () => {
  const source = readCode('src/inkbox/render3d/vegetation/VegetationLayer.js');
  const update = source.slice(source.indexOf('  update() {'), source.indexOf('  dispose()'));
  assert.match(update, /this\.regionGeometry\.isInsideCell/, '过滤发生在 update() 里');
  assert.match(source, /setRegionGeometry\([\s\S]{0,400}?pendingRegionRebuild = true/,
    'region 变化只登记「待重建」，重建交给节流通道');
  assert.match(update, /pendingRegionRebuild = false/, '重建后必须清标记');
});

check('T2 §27 目标位面内容纪律：不为了填满 Layer 而机械复制凡间 profile', () => {
  const profile = readCode('src/inkbox/render3d/stage/PlaneRenderProfile.js');
  for (const plane of ['upper', 'nether']) {
    const block = profile.slice(profile.indexOf(`${plane}: Object.freeze({`), profile.indexOf(`${plane}: Object.freeze({`) + 400);
    for (const layer of ['water', 'vegetation', 'settlements', 'markers']) {
      assert.match(block, new RegExp(`${layer}: false`), `${plane} 的 ${layer} 必须留空（§26/§27：没有可靠语义就先不画）`);
    }
    assert.match(block, /selection: true/, `${plane} 需要只读选择反馈（§25）`);
    assert.match(block, /selectionReadonly: true/);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// T3 · 同坐标与 Shoulder（§73）
// ══════════════════════════════════════════════════════════════════════════

check('T3 同一 (x,y) 的 XZ 完全一致，只有 Y 允许不同（§73）', () => {
  const world = makeWorld(); const { host } = makeHost(world);
  const region = regionOf(WINDOW, world);
  openWindow(host, region, 'upper');
  const mortal = host.stages.get('mortal'), upper = host.stages.get('upper');
  const mp = mortal.terrain.geometry.attributes.position;
  const up = upper.terrain.geometry.attributes.position;
  for (let i = 0; i < world.size; i += 3) {
    assert.equal(up.getX(i), mp.getX(i), `格 ${i} 的 X 必须一致`);
    assert.equal(up.getZ(i), mp.getZ(i), `格 ${i} 的 Z 必须一致`);
  }
  // 界缘的 XZ 也必须来自同一套格网节点
  const pos = host.boundary.position.array;
  let v = 0;
  for (const { ax, ay, bx, by } of upper.regionGeometry.boundaryEdges()) {
    for (const [x, y] of [[ax, ay], [ax, ay], [bx, by], [bx, by]]) {
      const expected = mortal.coordinates
        ? mortal.coordinates.cellToRender(x, y)
        : host.coordinates.cellToRender(x, y);
      assert.equal(pos[v * 3], expected.x);
      assert.equal(pos[v * 3 + 2], expected.z);
      v += 1;
    }
  }
  assert(v > 0, '必须真的走过边界顶点');
  host.dispose();
});

check('T3 相机 / 反复 applyView 不得让 Region 与界缘漂移（§73）', () => {
  const world = makeWorld(); const { host } = makeHost(world);
  const region = regionOf(WINDOW, world);
  openWindow(host, region, 'upper');
  const before = {
    key: host.boundary.key,
    region: host.stages.get('upper').regionGeometry.region,
    positions: host.boundary.position.array.slice(),
    edges: host.boundary.stats.edges,
  };
  for (let i = 0; i < 8; i += 1) { host.applyView(); host.update(0.016); }
  assert.equal(host.boundary.key, before.key, '缓存键不得变化 ⇒ 不重建');
  assert.equal(host.stages.get('upper').regionGeometry.region, before.region, 'Region 身份不得变化');
  assert.equal(host.boundary.stats.edges, before.edges);
  assert.deepEqual(host.boundary.position.array.slice(), before.positions, '界缘几何不得有任何漂移');
  host.dispose();
});

check('T3 Shoulder：边缘 = R、K 格之外恢复 T、中间 smoothstep 单调过渡（§37）', () => {
  const world = makeWorld(); const { host } = makeHost(world);
  const region = regionOf([[20, 16], [34, 16], [34, 28], [20, 28]], world);
  host.setBoundaryMode('strata');
  openWindow(host, region, 'upper');
  const upper = host.stages.get('upper');
  const field = host.boundaryField;
  assert(field, 'strata 模式必须构建 shoulder 场');
  const spec = boundarySpec('strata', 1);

  // ① 边界节点：权重 1 ⇒ 目标高度必须**正好**等于 R
  let onEdge = 0;
  for (const { ax, ay } of upper.regionGeometry.boundaryEdges()) {
    const M = host.stages.get('mortal').elevation.node(ax, ay);
    const T = spec.datum + spec.relief * upper.elevation.baseNode(ax, ay);
    const R = boundaryElevation({ M, T, sign: 1, hMin: spec.hMin, hCap: spec.hCap });
    assert.equal(field.weightAt(ax, ay), 1, '边界节点权重必须是 1');
    // ⚠️ shoulder 场是 Float32Array 缓存 ⇒ 与 Float64 重算比对要按 float32 精度。
    //    缝隙的**精确性**不靠这里：墙顶与目标地形顶点读的是同一个存储值（见 T4）。
    assert(Math.abs(field.edgeAt(ax, ay) - R) <= Math.abs(R) * 1e-6 + 1e-6,
      `边界 R 不符：${field.edgeAt(ax, ay)} vs ${R}`);
    assert.equal(upper.elevation.node(ax, ay), field.edgeAt(ax, ay), '边界节点的最终高度必须就是 R');
    onEdge += 1;
  }
  assert(onEdge > 0);

  // ② 距离 ≥ K：权重 0 ⇒ 回到 T（datum + relief * base）
  const band = spec.shoulderK;
  let farChecked = 0;
  for (const [x, y] of [[27, 22], [26, 21], [28, 23]]) {
    if (field.weightAt(x, y) !== 0) continue;
    const T = spec.datum + spec.relief * upper.elevation.baseNode(x, y);
    assert(Math.abs(upper.elevation.node(x, y) - T) < 1e-6, `K 之外必须回到 T：${x},${y}`);
    farChecked += 1;
  }
  assert(farChecked > 0, `窗口必须足够大，让中心和边界距离 ≥ K=${band}`);

  // ③ 权重随距离**单调不增**，且落在 [0,1]
  for (const { ax, ay } of upper.regionGeometry.boundaryEdges()) {
    let previous = 1;
    for (let step = 0; step <= band + 1; step += 1) {
      const x = ax + (ax < world.w / 2 ? step : -step);
      if (x < 0 || x >= world.w) break;
      const w = field.weightAt(x, ay);
      assert(w >= 0 && w <= 1, `权重越界：${w}`);
      assert(w <= previous + 1e-9, `权重必须随距离单调不增：${x},${ay} ⇒ ${w} > ${previous}`);
      previous = w;
    }
  }

  // ④ 凡间保持真实：mortal 的剖面永远是 RAW（§37）
  assert.equal(host.stages.get('mortal').elevation.raw, true, '凡间地形必须保持真实');
  assert.equal(upper.elevation.raw, false, 'strata 模式下目标界必须已套用剖面');
  host.dispose();
});

// ══════════════════════════════════════════════════════════════════════════
// T4 · 无缝界缘（§74）
// ══════════════════════════════════════════════════════════════════════════

/**
 * 界缘体检：逐边核对「墙下端 = 凡间边缘」「墙上端 = 目标界边缘」，
 * 并且**直接与地形网格的顶点取值比对**——那才是「零黑缝」的真正判据。
 */
function auditBoundarySeam(host, label, targetPlane = 'upper') {
  const mortal = host.stages.get('mortal');
  const target = host.stages.get(targetPlane);
  const layer = host.boundary;
  const world = target.world;
  const pos = layer.position.array;
  const mapos = mortal.terrain.geometry.attributes.position;
  const tappos = target.terrain.geometry.attributes.position;
  const indices = layer.geometry.index.array;
  const drawCount = layer.geometry.drawRange.count;
  assert.equal(drawCount, layer.stats.edges * 6, `${label}: 每边两个三角形（§86）`);
  assert.equal(layer.vertices, layer.stats.edges * 4);

  let v = 0;
  for (const { ax, ay, bx, by } of target.regionGeometry.boundaryEdges()) {
    const nodes = [[ax, ay], [ax, ay], [bx, by], [bx, by]];
    for (let k = 0; k < 4; k += 1) {
      const [x, y] = nodes[k];
      const y3 = pos[v * 3 + 1], x3 = pos[v * 3], z3 = pos[v * 3 + 2];
      assert(Number.isFinite(x3) && Number.isFinite(y3) && Number.isFinite(z3), `${label}: 顶点不得出现 NaN`);
      assert.equal(x3, host.coordinates.cellToRender(x, y).x, `${label}: XZ 必须来自共享格网`);
      assert.equal(z3, host.coordinates.cellToRender(x, y).z);
      const i = y * world.w + x;
      if (k % 2 === 0) {
        // 上端 = 目标界在该节点的**最终**高程。
        // ⚠️ 顶点缓冲是 Float32Array ⇒ 与 Float64 重算比对必须先 `Math.fround`；
        //    而**真正的零缝隙判据**是下面那条 float32 对 float32 的比较。
        assert.equal(y3, Math.fround(target.elevation.node(x, y)), `${label}: 墙顶必须等于目标界边缘高程`);
        assert.equal(y3, tappos.getY(i), `${label}: 墙顶与目标地形顶点必须逐位相同（§33 零缝隙）`);
      } else {
        // 下端 = 凡间在该节点的高程。
        assert.equal(y3, Math.fround(mortal.elevation.node(x, y)), `${label}: 墙底必须等于凡间边缘高程`);
        assert.equal(y3, mapos.getY(i), `${label}: 墙底与凡间地形顶点必须逐位相同（§33 零缝隙）`);
      }
      v += 1;
    }
  }
  for (let k = 0; k < drawCount; k += 1) {
    assert(indices[k] >= 0 && indices[k] < layer.vertices, `${label}: 索引越界`);
  }
  assert.deepEqual(host.boundary.stats, {
    ...host.boundary.stats, edges: host.boundary.stats.edges,
  });
  return { edges: layer.stats.edges, rawGapMax: layer.stats.rawGapMax, visualDepthMax: layer.stats.visualDepthMax };
}

const BOUNDARY_SHAPES = () => {
  const world = makeWorld();
  return {
    world,
    矩形: regionOf([[20, 16], [34, 16], [34, 28], [20, 28]], world),
    凹形: regionOf([[14, 12], [30, 12], [30, 20], [22, 20], [22, 30], [14, 30]], world),
    随机套索: regionOf([[16, 10], [28, 13], [36, 22], [30, 31], [18, 33], [11, 24], [10, 15]], world),
    贴图边缘: regionOf([[0, 0], [18, 0], [18, 14], [0, 14]], world),
  };
};

for (const mode of ['raw', 'strata']) {
  for (const label of ['矩形', '凹形', '随机套索', '贴图边缘']) {
    check(`T4 无缝界缘 · ${mode} · ${label}：墙底=凡间边缘、墙顶=目标界边缘、零 NaN`, () => {
      const { world, [label]: region } = BOUNDARY_SHAPES();
      const { host } = makeHost(world);
      host.setBoundaryMode(mode);
      openWindow(host, region, 'upper');
      const result = auditBoundarySeam(host, `${mode}/${label}`);
      assert(result.edges > 0, '必须有边界边');
      assert(Number.isFinite(result.rawGapMax) && result.rawGapMax >= 0);
      host.dispose();
    });
  }
}

check('T4 高山边缘 / 低谷边缘：极端高差下不 NaN、不翻折、仍然无缝', () => {
  for (const kind of ['high', 'low']) {
    const world = makeWorld();
    // 在窗口边缘造一段极端地形：抬到接近 1 或压到接近 0。
    const value = kind === 'high' ? 0.98 : 0.02;
    for (let y = 14; y <= 30; y += 1) {
      for (let x = 18; x <= 22; x += 1) world.height[y * world.w + x] = Math.fround(value);
    }
    const { host } = makeHost(world);
    host.setBoundaryMode('strata');
    const region = regionOf([[20, 16], [34, 16], [34, 28], [20, 28]], world);
    openWindow(host, region, 'upper');
    const result = auditBoundarySeam(host, kind);
    assert(result.edges > 0);
    assert(result.rawGapMax > 5, `极端高差用例必须真的有高差：${result.rawGapMax}`);
    assert(result.visualDepthMax <= 26 + 8 + 1e-6, `strata 净空必须被 Hcap 压住：${result.visualDepthMax}`);
    host.dispose();
  }
});

check('T4 Raw 与 Strata 的差别只体现在表现：真实高差读数一致、模拟世界一字未动', () => {
  const measure = mode => {
    const world = makeWorld();
    const heightSnapshot = world.height.slice();
    const { host } = makeHost(world);
    host.setBoundaryMode(mode);
    const region = regionOf([[20, 16], [34, 16], [34, 28], [20, 28]], world);
    openWindow(host, region, 'upper');
    const result = {
      rawGapMax: host.boundary.stats.rawGapMax,
      visualDepthMax: host.boundary.stats.visualDepthMax,
      heightIntact: world.height.every((v, i) => v === heightSnapshot[i]),
      targetProfile: host.stages.get('upper').elevation.profile,
      edges: host.boundary.stats.edges,
    };
    host.dispose();
    return result;
  };
  const raw = measure('raw');
  const strata = measure('strata');
  assert.equal(raw.heightIntact, true, 'Raw 模式不得写世界');
  assert.equal(strata.heightIntact, true, 'Strata 模式不得写世界（P4 / §39）');
  assert.equal(raw.edges, strata.edges, '两种模式的边界边数必须相同');
  assert(Math.abs(raw.rawGapMax - strata.rawGapMax) < 1e-6, '真实高差读数与模式无关（Raw 暴露它、Strata 塑形它）');
  assert(strata.visualDepthMax !== raw.visualDepthMax, 'Strata 必须真的改变了画出来的深度');
});

check('T2 §30 结构：界缘层不是 rift manager，也不持有 world.rifts（S6）', () => {
  const source = readCode('src/inkbox/render3d/boundary/RealmBoundaryLayer.js');
  assert.doesNotMatch(source, /world\.rifts/, '界缘层不得持有 world.rifts（S6）');
  assert.doesNotMatch(source, /riftRadiusAt|openRifts|LEAK_|CHANCE/, '界缘层不得碰裂缝逻辑或概率');
  assert.match(source, /RENDER_ORDER\.realmBoundary/, '必须用 M2-A 预留的渲染次序');
  // §44：不得引入重型管线
  for (const banned of ['EffectComposer', 'RenderTarget', 'WebGLRenderTarget', 'WebGPU', 'ShaderMaterial']) {
    assert.doesNotMatch(source, new RegExp(banned), `§44 禁止 ${banned}`);
  }
});

check('T2 §39/§47 结构：strataProfile 不写 world、不抽 RNG、不碰概率，且命名是表现量', () => {
  const source = readCode('src/inkbox/render3d/boundary/strataProfile.js');
  assert.doesNotMatch(source, /world\.height\[[^\]]*\]\s*=/, '禁止反写 world.height（P4 / §39）');
  assert.doesNotMatch(source, /Math\.random|mulberry32|rng\s*\(/, '不得抽 RNG');
  assert.doesNotMatch(source, /LEAK_|WRAITH_CLIMB|POSSESS_|CHANCE/, '不得碰三界概率（S7）');
  assert.doesNotMatch(source, /sealStrength|镇压/, '不得出现机制性命名（P2 / §47）');
  for (const name of ['datum', 'relief', 'shoulder']) {
    assert.match(source, new RegExp(name), `§47 允许的表现量命名应保留 ${name}`);
  }
  // §47 的其它两个表现量在界缘层（它才是画深度的那一层）
  const layer = readCode('src/inkbox/render3d/boundary/RealmBoundaryLayer.js');
  for (const name of ['rawGap', 'visualDepth', 'boundaryDirection']) {
    assert.match(layer, new RegExp(name), `§47 允许的表现量命名应保留 ${name}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// T6 · 正式 3D 划窗（§48–§52 / §76）
//
// ⚠️ 无浏览器环境：路径采样用**真实 raycast**（three 的 Raycaster 在 node 里可用），
//    提交点则直接调用 `Render3DAdapter.prototype` 上的**真实方法**（配最小 stub 宿主），
//    所以验的是产品代码本身，不是测试里重写一遍的逻辑。
//    真正的端到端指针事件留给浏览器证据脚本。
// ══════════════════════════════════════════════════════════════════════════

check('T6 真实 raycast：3D 划窗采出来的是世界坐标路径，不是屏幕多边形（§50/§51）', () => {
  const world = makeWorld(); const { host } = makeHost(world);
  host.resize(800, 600);
  const path = [];
  for (const [px, py] of [[220, 180], [400, 180], [580, 180], [580, 420], [220, 420], [400, 300]]) {
    const hit = host.pickPlane(px, py, 'mortal');
    if (!hit) continue;
    assert.equal(hit.plane, 'mortal', '划窗只能拾凡间');
    assert(Number.isFinite(hit.world.x) && Number.isFinite(hit.world.y));
    path.push([hit.world.x, hit.world.y]);
  }
  assert(path.length >= 3, `必须采到足够的世界坐标点：${path.length}`);
  const unique = new Set(path.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`));
  assert(unique.size >= 3, '采样点必须是不同的世界坐标（否则路径退化成一个点）');
  for (const [x, y] of path) {
    assert(x >= 0 && x < world.w && y >= 0 && y < world.h, `世界坐标越界：${x},${y}`);
  }
  // §52：同样一次拾取，限定凡间之外拿不到东西（目标界开着也一样）
  const netherHit = host.pickPlane(400, 300, 'nether');
  assert.equal(netherHit, null, '指定凡间时不该返回别的位面');
  host.dispose();
});

/** 最小 stub 宿主：只提供 `commitRealmDraw` 真正用到的三个字段。 */
function adapterStub(path) {
  const calls = { commits: [], drafts: [], dirty: 0 };
  return {
    calls,
    realmDraw: path ? { path, last: path[path.length - 1] } : null,
    renderer: { setDraftPath(p) { calls.drafts.push(p); } },
    sandbox: { commitSelection(p) { calls.commits.push(p); }, dirty: 0 },
  };
}

check('T6 pointerup 只调用一次 commitSelection，且路径原样交出去（§49/§76/S9）', () => {
  const path = [[10, 10], [26, 10], [26, 22], [10, 22]];
  const stub = adapterStub(path);
  const returned = Render3DAdapter.prototype.commitRealmDraw.call(stub);
  assert.deepEqual(returned, path);
  assert.equal(stub.calls.commits.length, 1, '一次拖动只能提交一次');
  assert.deepEqual(stub.calls.commits[0], path, '交出去的必须是世界坐标路径');
  assert.equal(stub.realmDraw, null, '提交后必须清掉拖拽状态');
  assert.equal(stub.calls.drafts.at(-1), null, '提交后必须清掉路径预览');
  // 幂等：再调一次不得产生第二次提交（一笔拖动 ≠ 几十次裂缝）
  Render3DAdapter.prototype.commitRealmDraw.call(stub);
  assert.equal(stub.calls.commits.length, 1, '重复调用不得再提交');
});

check('T6 退化路径也交给 commitSelection（不许静默），打断则取消（§49）', () => {
  // 只点一下（1 点）⇒ 照样交出去；由 commitSelection 决定「收起视界」还是「拒绝并发声」
  const single = adapterStub([[12, 12]]);
  Render3DAdapter.prototype.commitRealmDraw.call(single);
  assert.equal(single.calls.commits.length, 1);
  assert.deepEqual(single.calls.commits[0], [[12, 12]]);
  // 取消：不提交
  const cancelled = adapterStub([[12, 12], [18, 18]]);
  const path = Render3DAdapter.prototype.cancelRealmDraw.call(cancelled);
  assert.deepEqual(path, [[12, 12], [18, 18]]);
  assert.equal(cancelled.calls.commits.length, 0, '取消不得提交');
  assert.equal(cancelled.realmDraw, null);
});

check('T6 采样：世界坐标累积、过近的点被丢弃（§50/§51）', () => {
  // `sampleRealmDraw` 每次调用只做**一次**命中查询 ⇒ stub 按调用顺序逐个返回。
  const hits = [
    { world: { x: 10, y: 10 } },      // 与起点重合 ⇒ 丢
    { world: { x: 10.2, y: 10.1 } },  // 距离 0.22 < 0.6 ⇒ 丢
    { world: { x: 14, y: 10 } },      // 够远 ⇒ 追加
  ];
  let index = 0;
  const drafts = [];
  const stub = {
    realmDraw: { path: [[10, 10]], last: { x: 10, y: 10 } },
    renderer: { setDraftPath(p) { drafts.push(p); } },
    hitMortal() { return hits[index++] ?? null; },
  };
  const sample = Render3DAdapter.prototype.sampleRealmDraw;
  sample.call(stub);
  assert.deepEqual(stub.realmDraw.path, [[10, 10]], '重合的点必须被丢弃');
  sample.call(stub);
  assert.deepEqual(stub.realmDraw.path, [[10, 10]], '过近的点必须被丢弃');
  sample.call(stub);
  assert.deepEqual(stub.realmDraw.path, [[10, 10], [14, 10]], '够远的点要追加');
  assert.equal(drafts.at(-1).length, 2, '每次追加都要刷新预览');
  assert.equal(index, 3, '每次采样只查询一次命中');
  assert.equal(drafts.length, 1, '被丢弃的采样不该刷新预览');
});

check('T6 结构：唯一提交点、无第二套选择状态、不碰 openRifts（§49/S9）', () => {
  const source = readCode('src/inkbox/render3d/Render3DAdapter.js');
  const commits = source.match(/commitSelection\(/g) || [];
  assert.equal(commits.length, 1, `适配器只允许有**一个** commitSelection 调用点，实得 ${commits.length}`);
  assert.doesNotMatch(source, /openRifts/, '禁止绕过 commitSelection 自己开缝（S9）');
  assert.doesNotMatch(source, /commitSelection3D/, '不许新建 commitSelection3D（§49）');
  assert.match(source, /pickPlane\([^)]*'mortal'\)/, '划窗必须只拾凡间（§52）');
  // 打断路径必须取消而不是提交
  assert.match(source, /endStroke\(\)\s*\{[\s\S]{0,200}?cancelRealmDraw\(\)/, 'endStroke 必须先取消未完成的划窗');
  assert.match(source, /'pointerup', \(\) => \{ this\.commitRealmDraw\(\); this\.endStroke\(\); \}/);
});

check('T6 结构：视界工具并进正式工具表、共用同一个 toolId（§48/§54）', () => {
  const source = readCode('src/inkbox/render3d/Render3DAdapter.js');
  assert.match(source, /<option value="viewUpper">上界视界<\/option>/, '正式工具条必须有上界视界');
  assert.match(source, /<option value="viewNether">幽冥视界<\/option>/, '正式工具条必须有幽冥视界');
  assert.match(source, /isViewTool\(next\)\) this\.sandbox\.selectTool\(next\)/, '必须复用 Canvas 的工具表');
  // §54：调试探针折进 details，不与玩家功能并列（但仍在 DOM 里）
  assert.match(source, /createElement\('details'\)/, '调试探针必须折进 details');
  assert.match(source, /data-probe="upper"/, '调试探针仍须留在 DOM（M2-A 证据脚本按它选取）');
  const tools = readCode('src/inkbox/ui/tools.js');
  assert.match(tools, /T\('viewUpper'/, 'Canvas 工具表里必须有 viewUpper');
  assert.match(tools, /T\('viewNether'/, 'Canvas 工具表里必须有 viewNether');
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
