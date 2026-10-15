#!/usr/bin/env node
// Render3D · 墨界美术层（Art Pass / M2-B 界缘）不变量。无需浏览器与 WebGL。
//   npm run test:render3d:art
//
// 钉住的是"不能悄悄变坏"的几件事：关闭时与 M2-A 逐位一致；墙与两张网格逐位重合（不漏缝）；
// 方向恒正确；关窗后完全还原；美术层不碰世界；高程口径无第二来源。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { fileURLToPath } from 'node:url';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { getRealmViewState } from '../src/inkbox/ui/realmViewState.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { surfaceElevation, visualElevation } from '../src/inkbox/render3d/terrain/VisualElevation.js';
import { ElevationField } from '../src/inkbox/render3d/art/ElevationField.js';
import { buildRegionMask3D, getRegionMask3D } from '../src/inkbox/render3d/art/RegionMask3D.js';
import { computeRim } from '../src/inkbox/render3d/art/RimField.js';
import { ART_PLANES, SKIRT, artRequested } from '../src/inkbox/render3d/art/artConfig.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (label, run) => { run(); passed += 1; console.log(`PASS ${label}`); };

function makeWorld(seed = 616161, preset = { w: 64, h: 48 }) {
  const world = generateWorld({ preset, seed, scatter: true });
  world.upper = generateUpperWorld({ preset, seed: world.seed });
  world.nether = generateNetherWorld({ preset, seed: world.seed });
  return world;
}
function makeHost(world, art) {
  const gpu = { info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } },
    setPixelRatio() {}, setClearColor() {}, setSize() {}, render() {}, dispose() {} };
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500); camera.position.set(0, 60, 70); camera.lookAt(0, 0, 0);
  const cameraRig = { camera, update() {}, resize() {}, setDimensions() {}, focusOn() {}, dispose() {} };
  const host = new Render3DHost({ clientWidth: 900, clientHeight: 600 }, world, { gpu, cameraRig, art });
  host.resize(900, 600);
  return host;
}
const lasso = [[14, 10], [34, 12], [38, 26], [26, 34], [12, 28], [10, 18]];
const sel = (path) => ({ path, x0: Math.min(...path.map(p => p[0])), y0: Math.min(...path.map(p => p[1])), x1: Math.max(...path.map(p => p[0])), y1: Math.max(...path.map(p => p[1])), area: 400 });
const openState = (tool, p = lasso) => getRealmViewState({ selection: sel(p), toolId: tool });
const closedState = () => getRealmViewState({ selection: null, toolId: 'viewUpper' });
const digest = (world) => {
  let h = 2166136261 >>> 0;
  for (const w of [world, world.upper, world.nether]) for (const key of ['height', 'water', 'type', 'veg']) {
    const a = w[key]; for (let i = 0; i < a.length; i += 7) h = Math.imul(h ^ (Math.fround(a[i]) * 1e6 | 0), 16777619) >>> 0;
  }
  return `${h}:${world.rifts?.length ?? 0}`;
};
const Y = (stage, n) => stage.terrain.geometry.attributes.position.getY(n);

check('URL 开关：只认 art=ink / 1 / on；缺省关闭', () => {
  assert.equal(artRequested(''), false); assert.equal(artRequested('?renderer=3d'), false);
  for (const v of ['ink', '1', 'on']) assert.equal(artRequested(`?art=${v}`), true);
  assert.equal(artRequested('?art=off'), false);
});

check('ElevationField 默认参数与全局 surfaceElevation 逐位相同（M2-A 行为的恒等嵌入）', () => {
  const world = makeWorld(); const f = new ElevationField(world);
  for (let k = 0; k < 600; k++) {
    const x = (k * 7.31) % (world.w - 1), y = (k * 3.77) % (world.h - 1);
    assert.equal(f.at(x, y), surfaceElevation(world, x, y), `at(${x},${y})`);
  }
  for (let i = 0; i < world.size; i += 11) assert.equal(f.nodeY(i), visualElevation(world.height[i]));
});

check('美术层关闭：Stage 没有 ElevationField，地形 Y 与 M2-A 一致，场景无雾', () => {
  const host = makeHost(makeWorld(), false);
  assert.equal(host.art.enabled, false); assert.equal(host.scene.fog, null);
  for (const stage of host.stages.values()) {
    assert.equal(stage.elevation, null);
    for (let i = 0; i < stage.world.size; i += 13) assert.equal(Y(stage, i), Math.fround(visualElevation(stage.world.height[i])));
  }
  host.setRealmViewState(openState('viewUpper')); host.update(0.1);
  assert.equal(host.art.skirt, null, '关闭时不得创建界缘');
  host.dispose();
});

check('RegionMask3D：谓词、边界边、拓扑与暴力计算一致；同一 Region 身份命中缓存', () => {
  const world = makeWorld(); const region = new RegionMask(sel(lasso));
  const m = getRegionMask3D(region, world.w, world.h, SKIRT.shoulder);
  assert.equal(getRegionMask3D(region, world.w, world.h, SKIRT.shoulder), m, '同一 Region 身份必须命中缓存');
  let inside = 0;
  for (let y = 0; y < world.h - 1; y++) for (let x = 0; x < world.w - 1; x++) {
    const exp = region.contains(x + 0.5, y + 0.5) ? 1 : 0; inside += exp;
    assert.equal(m.inside[y * m.qw + x], exp);
  }
  assert.equal(m.insideCount, inside);
  let brute = 0; const at = (x, y) => x >= 0 && y >= 0 && x < m.qw && y < m.qh && m.inside[y * m.qw + x] === 1;
  for (let y = 0; y < m.qh; y++) for (let x = 0; x < m.qw; x++) if (at(x, y)) brute += !at(x, y - 1) + !at(x, y + 1) + !at(x - 1, y) + !at(x + 1, y);
  assert.equal(m.edgeCount, brute);
  const deg = new Map();
  for (let k = 0; k < m.edgeCount; k++) for (const e of [0, 2]) { const n = m.edges[k * 4 + e + 1] * world.w + m.edges[k * 4 + e]; deg.set(n, (deg.get(n) || 0) + 1); }
  for (const [n, d] of deg) { assert.ok(d === 2 || d === 4, `边界节点 ${n} 度数 ${d}`); assert.equal(m.dist[n], 0); }
  assert.equal(m.rimNodes.length, deg.size);
  for (const i of m.bandNodes) assert.ok(m.dist[i] > 0 && m.dist[i] <= m.K && m.near[i] >= 0);
});

check('RimField：墙高恒 ≥ hMin 且对落差单调；上界墙顶在凡间之上，幽冥在下；错边节点不留缺口', () => {
  const world = makeWorld(); const region = new RegionMask(sel(lasso)); const mask = buildRegionMask3D(region, world.w, world.h, SKIRT.shoulder);
  const mortal = new ElevationField(world, ART_PLANES.mortal);
  for (const plane of ['upper', 'nether']) {
    const target = new ElevationField(world[plane], ART_PLANES[plane]); const sign = Math.sign(ART_PLANES[plane].datum);
    const rim = computeRim({ mask, mortalField: mortal, targetField: target, sign });
    for (const n of mask.rimNodes) {
      assert.ok(rim.wallH[n] >= SKIRT.hMin - 1e-6 && rim.wallH[n] <= SKIRT.hMin + SKIRT.hCap + 1e-6);
      assert.ok(sign * (rim.rimY[n] - rim.wallBase[n]) >= SKIRT.hMin - 1e-4, `${plane} 方向`);
      assert.equal(rim.rimW[n], 0);
    }
    for (const i of mask.bandNodes) assert.ok(rim.rimW[i] > 0 && rim.rimW[i] <= 1, '肩部权重应在 (0,1]：dist=K 处回到自由（=1），保证与窗内地形连续');
  }
  const f = (g) => SKIRT.hMin + SKIRT.hCap * Math.tanh(Math.max(g, 0) / SKIRT.hCap);
  for (let g = -10; g < 80; g += 3) assert.ok(f(g + 3) >= f(g));
});

for (const [tool, plane] of [['viewUpper', 'upper'], ['viewNether', 'nether']]) {
  check(`开窗 ${plane}：墙与两张网格逐位重合（不漏缝）、方向正确、凡间不被改动；关窗完全还原`, () => {
    const world = makeWorld(); const host = makeHost(world, true);
    const mortal = host.stages.get('mortal'), stage = host.stages.get(plane);
    const before = digest(world);
    const baseY = (i) => Math.fround(stage.elevation.base(i));
    host.setRealmViewState(openState(tool)); host.update(0.1);
    const skirt = host.art.skirt, a = host.art.active;
    assert.ok(skirt?.root.visible && a, '应创建并显示界缘');
    assert.equal(skirt.edgeCount, a.mask.edgeCount);
    const pos = skirt.geometry.attributes.position, sign = Math.sign(ART_PLANES[plane].datum);
    for (let k = 0; k < skirt.edgeCount; k++) for (let end = 0; end < 2; end++) {
      const n = a.mask.edges[k * 4 + end * 2 + 1] * world.w + a.mask.edges[k * 4 + end * 2];
      assert.equal(pos.getY(k * 4 + end * 2), Y(stage, n), `墙顶 ${k}/${end} 必须等于目标界网格节点 Y`);
      assert.equal(pos.getY(k * 4 + end * 2 + 1), Y(mortal, n), `墙脚 ${k}/${end} 必须等于凡间网格节点 Y`);
      assert.ok(sign * (pos.getY(k * 4 + end * 2) - pos.getY(k * 4 + end * 2 + 1)) >= SKIRT.hMin - 1e-3);
      assert.equal(Y(mortal, n), Math.fround(visualElevation(world.height[n])), '窗外凡间保持真实，不为窗内让步');
    }
    for (const i of a.mask.bandNodes) { const expected = Math.fround(stage.elevation.nodeY(i)); assert.equal(Y(stage, i), expected); }
    // 窗内目标界未受肩部影响的节点：等于 datum 之后的 base
    let deep = 0; for (let i = 0; i < world.size; i++) if (a.mask.dist[i] === 255 && stage.elevation.rimW[i] === 1) { assert.equal(Y(stage, i), baseY(i)); deep++; }
    assert.ok(deep > 100);
    assert.equal(digest(world), before, '美术层不得改世界');
    // 关窗
    host.setRealmViewState(closedState()); host.update(0.1);
    assert.equal(host.art.active, null); assert.equal(skirt.root.visible, false); assert.equal(stage.elevation.hasShoulder, false);
    for (let i = 0; i < world.size; i++) assert.equal(Y(stage, i), baseY(i), `关窗后目标界节点 ${i} 必须回到 base`);
    assert.equal(digest(world), before);
    host.dispose();
  });
}

check('窗外凡间的水 / 植被 / 聚落在窗开着时仍可见，且不画进窗内', () => {
  const world = makeWorld(); const host = makeHost(world, true); const mortal = host.stages.get('mortal');
  host.update(0.2); const treesBefore = mortal.vegetation.trees.length;
  host.setRealmViewState(openState('viewUpper')); host.update(0.3);
  const mask = host.art.active.mask;
  assert.equal(mortal.vegetation.mesh.visible, true); assert.equal(mortal.water.mesh.visible, true);
  assert.ok(mortal.vegetation.trees.length <= treesBefore);
  for (const t of mortal.vegetation.trees) assert.equal(mask.cellInside(Math.floor(t.x), Math.floor(t.y)), false, '窗内不得有凡间的树');
  assert.equal(mortal.water.geometry.drawRange.count, (mask.qw * mask.qh - mask.insideCount) * 6);
  host.setRealmViewState(closedState()); host.update(0.3);
  assert.equal(mortal.water.geometry.drawRange.count, (mask.qw * mask.qh) * 6);
  assert.equal(mortal.vegetation.trees.length, treesBefore, '关窗后树恢复');
  host.dispose();
});

check('裂缝开口来自 riftViewModel：活跃缝附近的边界节点 breach>0，已闭合 / 他界的缝不开口', () => {
  const world = makeWorld(); const host = makeHost(world, true);
  host.setRealmViewState(openState('viewNether')); host.update(0.1);
  const a = host.art.active, n0 = a.mask.rimNodes[3], rx = n0 % world.w, ry = (n0 / world.w) | 0;
  world.rifts = [
    { id: 1, x: rx, y: ry, strength: 4, age: 900, closedDay: -1, targetPlane: 'nether' },
    { id: 2, x: rx, y: ry, strength: 4, age: 900, closedDay: 5, targetPlane: 'nether' },
    { id: 3, x: rx, y: ry, strength: 4, age: 900, closedDay: -1, targetPlane: 'upper' },
  ];
  host.update(0.1);
  const b = host.art.skirt.breach;
  assert.ok(b[n0] > 0.9, `裂缝中心处开口应近 1，实为 ${b[n0]}`);
  const far = [...a.mask.rimNodes].filter(n => Math.hypot(n % world.w - rx, ((n / world.w) | 0) - ry) > 6);
  assert.ok(far.length > 0 && far.every(n => b[n] === 0), '远处无开口');
  world.rifts = [{ ...world.rifts[2] }]; host.update(0.1);
  assert.equal(Math.max(...host.art.skirt.breach), 0, '他界的缝与已闭合的缝不得在本界墙上开口');
  host.dispose();
});

check('边缘高程漂移：未超阈值不重算；超过阈值并过最小间隔后墙跟随；凡间侵蚀不会每帧重算', () => {
  const world = makeWorld(); const host = makeHost(world, true);
  host.setRealmViewState(openState('viewUpper')); host.update(0.1);
  let rebuilds = 0; const orig = host.art.rebuildRim.bind(host.art); host.art.rebuildRim = () => { rebuilds++; orig(); };
  host.art.active.lastRim = 0;
  for (let k = 0; k < 20; k++) host.update(0.016);
  assert.equal(rebuilds, 0, '无变化时不应重算');
  const n = host.art.active.mask.rimNodes[0];
  world.height[n] = Math.min(1, world.height[n] + 0.0005); host.update(0.016);   // ≈0.02 视觉单位，低于阈值
  assert.equal(rebuilds, 0, '亚阈值漂移不应触发重算');
  world.height[n] = Math.min(1, world.height[n] + 0.05); host.art.active.lastRim = 0; host.update(0.016);
  assert.equal(rebuilds, 1, '超过阈值应重算一次');
  host.update(0.016); assert.equal(rebuilds, 1, '重算后快照已更新，不应连续重算');
  host.dispose();
});

check('美术层源码卫生：不 import sim / world，不写世界数组，不抽随机数', () => {
  const dir = path.join(root, 'src/inkbox/render3d/art');
  const allowed = [/^three$/, /^\.\/[A-Za-z0-9]+\.js$/, /^\.\.\/terrain\/VisualElevation\.js$/, /^\.\.\/readers\/riftViewModel\.js$/, /^\.\.\/shared\/RenderOrder\.js$/, /^\.\.\/\.\.\/core\/config\.js$/];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const m of src.matchAll(/^\s*import[^'"]*['"]([^'"]+)['"]/gm)) assert.ok(allowed.some(r => r.test(m[1])), `${file} 不应 import ${m[1]}`);
    assert.ok(!/Math\.random|crypto\.getRandomValues/.test(src), `${file} 不得使用随机数`);
    assert.ok(!/\b(?:world|w)\.(?:height|water|type|veg|qi)\[[^\]]+\]\s*[-+*/]?=[^=]/.test(src), `${file} 不得写世界数组`);
  }
});

check('setArt 运行时开关：关 → 无高程场 / 雾；再开 → 重建；dispose 幂等', () => {
  const host = makeHost(makeWorld(), true);
  assert.ok(host.scene.fog instanceof THREE.Fog);
  assert.equal(host.setArt(false), true); assert.equal(host.scene.fog, null);
  for (const stage of host.stages.values()) assert.equal(stage.elevation, null);
  assert.equal(host.setArt(false), false);
  assert.equal(host.setArt(true), true); assert.ok(host.stages.get('upper').elevation instanceof ElevationField);
  host.dispose(); host.dispose();
});

console.log(`\n${passed} art invariant groups passed`);
