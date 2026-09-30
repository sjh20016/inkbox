#!/usr/bin/env node
// Inkbox Render3D M1.1D 回归 · WorldRenderBridge dirty 分类
//
// ───────────────────────────────────────────────────────────────────────
// 这个文件要证明什么
// ───────────────────────────────────────────────────────────────────────
//
// M1 时 `WorldRenderBridge.changes()` 把 `height` / `water` / `type` / `veg` **四层揉成
// 一个 dirty region** ⇒ 只要 `water` / `veg` / `type` 动一下，也会被当成「地形变了」，
// 于是实体 / 建筑 / marker **全部重新贴地**。M1 人少还能糊过去，M2 三界之后就是纯浪费。
//
// M1.1D D4 把它拆成**每层各报一条脏区**。这一组要钉死三件事：
//
//   ① **分类正确**：只改一层 ⇒ 只有那一层报脏，别的层必须 `null`；
//   ② **各层只吃自己真正依赖的那几层**：`water` / `type` / `veg` 单独变化
//      **不得**让实体 / 建筑 / marker 重新贴地；
//   ③ **height 变化仍然保证所有贴地物正确更新**（这是「优化」不能弄丢的东西）。
//
// 另外 G7 把「省掉了什么」写成**可数形态**（同一世界线两种口径对比），
// G8 把 §十九 的「模拟确定性不退化」钉死：**三界全开**（凡间 + 上界 + 幽冥 + 鬼影 + 裂缝）
// 推进 600 日，Render3D 开 / 关两条世界线**逐字段相同**。
//
// ⚠️ 这一组**刻意不构造 Renderer3D**：`new THREE.WebGLRenderer({canvas})` 要 DOM，
//    node 里起不来。所以照本仓既有做法走**两条腿**：
//      · **运行时腿**（G1–G4）：桥 / 地形 / 水 / 各 Layer 都是纯模块，直接 import 断言；
//      · **源码结构腿**（G5）：`PlaneStage.update()` 的**分派**住在 Stage 中，
//        只能去注释后按结构断言「它确实只把 height 脏传给贴地物」。
//
// 运行：`node scripts/inkbox-render3d-bridge.mjs`（退出码 0 = 全绿）

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import { WORLD_PRESETS, TERRAIN_INFO, STRUCT } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { Life } from '../src/inkbox/sim/life.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { spawnNetherGhost } from '../src/inkbox/sim/netherLife.js';

import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { visualElevation, surfaceElevation } from '../src/inkbox/render3d/terrain/VisualElevation.js';
import { WorldRenderBridge, mergeRegion, BRIDGE_LAYERS } from '../src/inkbox/render3d/WorldRenderBridge.js';
import { TerrainMesh } from '../src/inkbox/render3d/terrain/TerrainMesh.js';
import { WaterLayer } from '../src/inkbox/render3d/water/WaterLayer.js';
import { VegetationLayer } from '../src/inkbox/render3d/vegetation/VegetationLayer.js';
import { EntityLayer } from '../src/inkbox/render3d/entities/EntityLayer.js';
import { deriveEntities } from '../src/inkbox/render3d/entities/deriveEntities.js';
import { SettlementLayer, deriveSettlements } from '../src/inkbox/render3d/settlements/SettlementLayer.js';
import { WorldMarkerLayer, deriveMarkers, SITE_KINDS } from '../src/inkbox/render3d/markers/WorldMarkerLayer.js';
import { SelectionMarker } from '../src/inkbox/render3d/SelectionMarker.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const RENDER3D = path.join(ROOT, 'src', 'inkbox', 'render3d');

let passed = 0;
const failures = [];
function check(label, fn) {
  try { fn(); passed += 1; console.log(`  ✓ ${label}`); }
  catch (error) { failures.push(label); console.log(`  ✗ ${label}\n      ${error.message}`); }
}
function section(title) { console.log(`\n${title}`); }

/**
 * 去注释（逐字符状态机，保留行号）。**扫源码前必须做**——本仓注释里大量出现
 * 「被禁止的字面量」，正是在解释「为什么不能这么写」。例如 `WorldRenderBridge.js`
 * 的头注释里就写着 `heightDirty`，不去注释会让 G6 的纯度断言**当场假红**。
 * 与 `inkbox-render3d-m1.mjs` / `inkbox-view.mjs` / `inkbox-three-realms.mjs` 同款。
 */
function stripComments(src) {
  let out = ''; let i = 0; let mode = 0; let quote = '';
  while (i < src.length) {
    const c = src[i]; const c2 = src[i + 1];
    if (mode === 0 && !quote && c === '/' && c2 === '/') { mode = 1; out += '  '; i += 2; continue; }
    if (mode === 0 && !quote && c === '/' && c2 === '*') { mode = 2; out += '  '; i += 2; continue; }
    if (mode === 1) { if (c === '\n') { mode = 0; out += c; } else out += ' '; i += 1; continue; }
    if (mode === 2) { if (c === '*' && c2 === '/') { mode = 0; out += '  '; i += 2; continue; } out += c === '\n' ? '\n' : ' '; i += 1; continue; }
    if (!quote && (c === "'" || c === '"' || c === '`')) { quote = c; out += c; i += 1; continue; }
    if (quote) { if (c === '\\') { out += c + (c2 || ''); i += 2; continue; } if (c === quote) quote = ''; out += c; i += 1; continue; }
    out += c; i += 1;
  }
  return out;
}

function readSource(relative) { return stripComments(fs.readFileSync(path.join(ROOT, relative), 'utf8')); }

// ── 世界与单元格工具 ──────────────────────────────────────────────────

const W = 48, H = 36;
const at = (world, x, y) => y * world.w + x;
const M = new THREE.Matrix4();          // 复用同一个矩阵读实例，别在循环里 new

function flatWorld(seed = 4242) {
  return generateWorld({ preset: { w: W, h: H }, seed, scatter: true });
}

/** 把某一层在某一格改成**确定不同**的值（并断言真的变了，防「改了等于没改」）。 */
function mutate(world, key, x, y, next) {
  const i = at(world, x, y);
  const before = world[key][i];
  world[key][i] = next(before);
  assert.notEqual(world[key][i], before, `mutate(${key}) 没真的改掉 (${x},${y})`);
  return i;
}
const bump = (delta) => (v) => v + delta;
const nextType = () => (v) => (v + 1) % TERRAIN_INFO.length;

/** 一个「每层都有非空内容」的世界——用来验贴地物在 height 变化后是否真的重贴。 */
function richWorld(seed = 20260928) {
  const world = flatWorld(seed);
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  world.entities.push(
    { id: 9001, x: cx + 0.5, y: cy + 0.5, sp: 'human', level: 0, faction: 0, name: '凡人甲' },
    { id: 9002, x: cx + 2.5, y: cy + 0.5, sp: 'cultivator', level: 25, faction: 1, name: '修士乙' },
    { id: 9003, x: cx + 4.5, y: cy + 0.5, sp: 'beast', level: 0, faction: 0, name: '灵兽丙' },
  );
  world.villages.push(
    { id: 11, x: cx - 6, y: cy - 6, level: 1, faction: 0, name: '小村', pop: 0, houses: [{ x: cx - 6, y: cy - 6, type: STRUCT.HOUSE }] },
    { id: 12, x: cx + 6, y: cy + 6, level: 3, faction: 1, name: '城池', pop: 0, houses: [{ x: cx + 6, y: cy + 6, type: STRUCT.HALL }] },
  );
  world.factions.push({ id: 1, name: '青云门', color: '#a8493c', accent: '#d98a72', capitalX: cx, capitalY: cy - 12 });
  world.artifacts.push({ id: 501, name: '无主剑', x: cx - 5, y: cy + 3, ownerId: 0, lostDay: 10 });
  for (const kind of SITE_KINDS) world.sites.push({ id: 700 + SITE_KINDS.indexOf(kind), kind, x: cx + 3, y: cy + 9, name: kind, age: 0 });
  world.leylines.push({ id: 801, x: cx - 9, y: cy + 6, radius: 7, strength: 0.4 });
  world.rifts.push({ id: 901, x: cx + 1, y: cy + 1, strength: 6, openedDay: 0, age: 900, closedDay: -1, targetPlane: 'upper' });
  return world;
}

console.log('══════════════════════════════════════════════════════════════');
console.log('inkbox Render3D M1.1D 回归（WorldRenderBridge dirty 分类）');
console.log('══════════════════════════════════════════════════════════════');

// ══ G1 · mergeRegion 是纯函数 ═════════════════════════════════════════
section('G1 · mergeRegion 纯函数（不许改入参、不许漏方向）');

check('两块都脏 ⇒ 取并集', () => {
  assert.deepEqual(mergeRegion({ x0: 10, y0: 20, x1: 15, y1: 24 }, { x0: 3, y0: 30, x1: 40, y1: 31 }),
    { x0: 3, y0: 20, x1: 40, y1: 31 });
});

check('一侧为 null ⇒ 返回另一侧', () => {
  assert.deepEqual(mergeRegion(null, { x0: 1, y0: 2, x1: 3, y1: 4 }), { x0: 1, y0: 2, x1: 3, y1: 4 });
  assert.deepEqual(mergeRegion({ x0: 1, y0: 2, x1: 3, y1: 4 }, null), { x0: 1, y0: 2, x1: 3, y1: 4 });
});

check('两侧都 null ⇒ null（不是「整图」）', () => {
  assert.equal(mergeRegion(null, null), null);
});

check('不改入参，且返回值不是入参本身（防共享引用被下游改写）', () => {
  const a = { x0: 5, y0: 5, x1: 6, y1: 6 };
  const b = { x0: 1, y0: 1, x1: 9, y1: 2 };
  const snapshotA = { ...a }, snapshotB = { ...b };
  const merged = mergeRegion(a, b);
  assert.deepEqual(a, snapshotA); assert.deepEqual(b, snapshotB);
  assert.notEqual(merged, a); assert.notEqual(merged, b);
  const onlyA = mergeRegion(a, null);
  assert.notEqual(onlyA, a, '单侧也要返回新对象');
  onlyA.x0 = 999;
  assert.equal(a.x0, 5, '改返回值不该污染入参');
});

// ══ G2 · changes() 分类（D4.5 Case 1–6）═══════════════════════════════
section('G2 · changes() 分类（Case 1–6）');

check('Case 6：什么都没改 ⇒ changes() === null（三种预设尺寸都成立）', () => {
  for (const [name, preset] of Object.entries(WORLD_PRESETS)) {
    const world = generateWorld({ preset, seed: 4242, scatter: true });
    const bridge = new WorldRenderBridge(world);
    assert.equal(bridge.changes(), null, `${name} 首帧不该报脏`);
    assert.equal(bridge.changes(), null, `${name} 连调两次也必须都是 null（快照没被写坏）`);
  }
});

check('Case 1：只改 water ⇒ height === null 且 water !== null', () => {
  const world = flatWorld();
  const bridge = new WorldRenderBridge(world);
  mutate(world, 'water', 5, 10, bump(0.5));
  const d = bridge.changes();
  assert(d && d.any, 'changes() 必须报脏');
  assert.equal(d.height, null, '只改 water 时 height 必须是 null');
  assert.deepEqual(d.water, { x0: 5, y0: 10, x1: 5, y1: 10 });
  assert.equal(d.type, null); assert.equal(d.veg, null);
  assert.equal(bridge.changes(), null, '报过一次就该清账');
});

check('Case 2：只改 veg ⇒ 不得报 height dirty', () => {
  const world = flatWorld();
  const bridge = new WorldRenderBridge(world);
  mutate(world, 'veg', 7, 3, bump(0.25));
  const d = bridge.changes();
  assert(d && d.any);
  assert.equal(d.height, null, 'veg 变化不许伪装成 height 变化');
  assert.deepEqual(d.veg, { x0: 7, y0: 3, x1: 7, y1: 3 });
  assert.equal(d.water, null); assert.equal(d.type, null);
});

check('Case 3：只改 type ⇒ 不得报 height dirty（贴地物因此不会被强制重贴）', () => {
  const world = flatWorld();
  const bridge = new WorldRenderBridge(world);
  mutate(world, 'type', 11, 9, nextType());
  const d = bridge.changes();
  assert(d && d.any);
  assert.equal(d.height, null, 'type 变化不许伪装成 height 变化');
  assert.deepEqual(d.type, { x0: 11, y0: 9, x1: 11, y1: 9 });
  assert.equal(d.water, null); assert.equal(d.veg, null);
});

check('Case 4：只改 height ⇒ 只有 height 报脏', () => {
  const world = flatWorld();
  const bridge = new WorldRenderBridge(world);
  mutate(world, 'height', 20, 14, bump(0.08));
  const d = bridge.changes();
  assert(d && d.any);
  assert.deepEqual(d.height, { x0: 20, y0: 14, x1: 20, y1: 14 });
  assert.equal(d.water, null); assert.equal(d.type, null); assert.equal(d.veg, null);
});

check('Case 5：同时改 height + water ⇒ 两条 region 都对，且互不污染', () => {
  const world = flatWorld();
  const bridge = new WorldRenderBridge(world);
  mutate(world, 'height', 10, 20, bump(0.08));
  mutate(world, 'water', 12, 22, bump(0.4));
  const d = bridge.changes();
  assert.deepEqual(d.height, { x0: 10, y0: 20, x1: 10, y1: 20 });
  assert.deepEqual(d.water, { x0: 12, y0: 22, x1: 12, y1: 22 });
  assert.equal(d.type, null); assert.equal(d.veg, null);
});

check('一块多格区域 ⇒ 包围盒取最小外接矩形（不是「每格一条」）', () => {
  const world = flatWorld();
  const bridge = new WorldRenderBridge(world);
  for (let y = 4; y <= 8; y += 1) for (let x = 20; x <= 25; x += 1) mutate(world, 'height', x, y, bump(0.05));
  const d = bridge.changes();
  assert.deepEqual(d.height, { x0: 20, y0: 4, x1: 25, y1: 8 });
  assert.equal(d.water, null);
});

check('四层同时各改一处 ⇒ 四条 region 各自独立', () => {
  const world = flatWorld();
  const bridge = new WorldRenderBridge(world);
  mutate(world, 'height', 1, 1, bump(0.05));
  mutate(world, 'water', 2, 2, bump(0.3));
  mutate(world, 'type', 3, 3, nextType());
  mutate(world, 'veg', 4, 4, bump(0.2));
  const d = bridge.changes();
  assert.deepEqual(d.height, { x0: 1, y0: 1, x1: 1, y1: 1 });
  assert.deepEqual(d.water, { x0: 2, y0: 2, x1: 2, y1: 2 });
  assert.deepEqual(d.type, { x0: 3, y0: 3, x1: 3, y1: 3 });
  assert.deepEqual(d.veg, { x0: 4, y0: 4, x1: 4, y1: 4 });
});

// ══ G3 · 快照独立性 ═══════════════════════════════════════════════════
section('G3 · 四层快照各记各的（漏更一层 ⇒ 那层永久沉默）');

check('第一帧四层各脏一次，第二帧只改 water ⇒ height 必须仍是 null', () => {
  const world = flatWorld();
  const bridge = new WorldRenderBridge(world);
  mutate(world, 'height', 1, 1, bump(0.05));
  mutate(world, 'water', 2, 2, bump(0.3));
  mutate(world, 'type', 3, 3, nextType());
  mutate(world, 'veg', 4, 4, bump(0.2));
  const first = bridge.changes();
  assert(first.height && first.water && first.type && first.veg, '第一帧四层都该报脏');

  // ⚠️ 这条是**核心**：若 `changes()` 只更新了「变过的那几层」的快照而漏掉别的层，
  //    height 的快照会停在旧值 ⇒ 第二帧会**再次**谎报 height 脏，而且**不报错**。
  mutate(world, 'water', 30, 30, bump(0.3));
  const second = bridge.changes();
  assert(second, '第二帧必须有脏（water 改了）');
  assert.equal(second.height, null, 'height 快照没被正确更新 ⇒ 会永久谎报脏');
  assert.equal(second.type, null, 'type 快照没被正确更新');
  assert.equal(second.veg, null, 'veg 快照没被正确更新');
  assert.deepEqual(second.water, { x0: 30, y0: 30, x1: 30, y1: 30 });
});

check('改了又改回原值 ⇒ 相对**上一帧**判定，仍算脏（不做「净变化」优化）', () => {
  const world = flatWorld();
  const bridge = new WorldRenderBridge(world);
  const i = at(world, 6, 6);
  const original = world.height[i];
  world.height[i] = original + 0.1;
  assert(bridge.changes()?.height, '改一下必须报脏');
  world.height[i] = original;
  const back = bridge.changes();
  assert(back && back.height, '改回去也是一次真实变化，必须再报一次脏');
  assert.equal(bridge.changes(), null);
});

check('BRIDGE_LAYERS 就是那四层，且每层都能被单独认出来', () => {
  assert.deepEqual([...BRIDGE_LAYERS], ['height', 'water', 'type', 'veg']);
  const world = flatWorld();
  const bridge = new WorldRenderBridge(world);
  for (const key of BRIDGE_LAYERS) {
    mutate(world, key, 9, 9, key === 'type' ? nextType() : bump(key === 'water' ? 0.3 : 0.05));
    const d = bridge.changes();
    assert(d && d[key], `单独改 ${key} 必须让 d.${key} 报脏`);
    for (const other of BRIDGE_LAYERS) if (other !== key) assert.equal(d[other], null, `改 ${key} 时 ${other} 必须是 null`);
  }
});

// ══ G4 · 各 Layer 只吃自己真正依赖的那几层 ═══════════════════════════
section('G4 · 各 Layer 只响应自己依赖的层（运行时真值表）');

check('TerrainMesh：只给 height ⇒ 重写 Y、**不碰**顶点色', () => {
  const world = flatWorld();
  const c = createCoordinates(world);
  const terrain = new TerrainMesh(world, c);
  const region = { x0: 12, y0: 8, x1: 14, y1: 10 };
  const i = at(world, 13, 9);
  const yBefore = terrain.geometry.attributes.position.getY(i);
  const colorBefore = [...terrain.geometry.attributes.color.array.slice(i * 3, i * 3 + 3)];
  world.height[i] += 0.12;
  terrain.update(region, { height: true, type: false });
  assert.notEqual(terrain.geometry.attributes.position.getY(i), yBefore, 'height 变化必须重写 Y');
  assert.deepEqual([...terrain.geometry.attributes.color.array.slice(i * 3, i * 3 + 3)], colorBefore, '只给 height 时不该碰颜色');
  terrain.dispose();
});

check('TerrainMesh：只给 type ⇒ 重写顶点色、**不碰** Y', () => {
  const world = flatWorld();
  const c = createCoordinates(world);
  const terrain = new TerrainMesh(world, c);
  const region = { x0: 12, y0: 8, x1: 14, y1: 10 };
  const i = at(world, 13, 9);
  const yBefore = terrain.geometry.attributes.position.getY(i);
  const colorBefore = [...terrain.geometry.attributes.color.array.slice(i * 3, i * 3 + 3)];
  world.type[i] = (world.type[i] + 1) % TERRAIN_INFO.length;
  terrain.update(region, { height: false, type: true });
  assert.equal(terrain.geometry.attributes.position.getY(i), yBefore, '只给 type 时不该碰 Y');
  assert.notDeepEqual([...terrain.geometry.attributes.color.array.slice(i * 3, i * 3 + 3)], colorBefore, 'type 变化必须重写颜色');
  terrain.dispose();
});

check('TerrainMesh：默认参数（不传 flags）仍是两项都写', () => {
  const world = flatWorld();
  const c = createCoordinates(world);
  const terrain = new TerrainMesh(world, c);
  const region = { x0: 4, y0: 4, x1: 6, y1: 6 };
  const i = at(world, 5, 5);
  const yBefore = terrain.geometry.attributes.position.getY(i);
  const colorBefore = [...terrain.geometry.attributes.color.array.slice(i * 3, i * 3 + 3)];
  world.height[i] += 0.1; world.type[i] = (world.type[i] + 1) % TERRAIN_INFO.length;
  terrain.update(region);
  assert.notEqual(terrain.geometry.attributes.position.getY(i), yBefore);
  assert.notDeepEqual([...terrain.geometry.attributes.color.array.slice(i * 3, i * 3 + 3)], colorBefore);
  terrain.dispose();
});

check('TerrainMesh：region 为 null ⇒ 直接返回，不抛错', () => {
  const world = flatWorld();
  const terrain = new TerrainMesh(world, createCoordinates(world));
  terrain.update(null, { height: true, type: true });
  terrain.dispose();
});

check('WaterLayer：高度 = height + water（两层任一变都要重算）', () => {
  const world = flatWorld();
  const c = createCoordinates(world);
  const water = new WaterLayer(world, c);
  const region = { x0: 2, y0: 2, x1: 4, y1: 4 };
  const i = at(world, 3, 3);
  world.water[i] = 0.5;                 // 制造湿格
  water.update(region);
  const wetY = water.geometry.attributes.position.getY(i);
  world.height[i] += 0.15;              // 只改 height
  water.update(region);
  assert.notEqual(water.geometry.attributes.position.getY(i), wetY, 'height 变了水面也得跟着变');
  water.dispose();
});

check('EntityLayer：heightChanged:false 时 water/type/veg 变化**不得**强制重写', () => {
  const world = richWorld();
  const layer = new EntityLayer(world, createCoordinates(world));
  assert.equal(layer.update(1, world, { heightChanged: true }), true, '首刷必须写一次');
  mutate(world, 'water', 20, 15, bump(0.4));
  mutate(world, 'type', 21, 15, nextType());
  mutate(world, 'veg', 22, 15, bump(0.2));
  // dt=1 秒 > 15 Hz 周期 ⇒ 若返回 false，只可能是因为「没被强制」。
  assert.equal(layer.update(1, world, { heightChanged: false }), false, 'water/type/veg 变化不该强制实体重写');
  assert.equal(layer.update(1, world, { heightChanged: true }), true, 'heightChanged:true 必须强制重写');
  layer.dispose();
});

check('SettlementLayer：heightChanged:false 时 water/type/veg 变化不得强制重写', () => {
  const world = richWorld();
  const layer = new SettlementLayer(world, createCoordinates(world));
  assert.equal(layer.update(1, world, { heightChanged: true }), true);
  mutate(world, 'water', 20, 15, bump(0.4));
  mutate(world, 'type', 21, 15, nextType());
  mutate(world, 'veg', 22, 15, bump(0.2));
  assert.equal(layer.update(1, world, { heightChanged: false }), false, '建筑不该因为水面/地貌/植被变化而重贴地');
  assert.equal(layer.update(1, world, { heightChanged: true }), true);
  layer.dispose();
});

check('WorldMarkerLayer：heightChanged:false 时 water/type/veg 变化不得强制重写', () => {
  const world = richWorld();
  const layer = new WorldMarkerLayer(world, createCoordinates(world));
  assert.equal(layer.update(1, world, { heightChanged: true }), true);
  mutate(world, 'water', 20, 15, bump(0.4));
  mutate(world, 'type', 21, 15, nextType());
  mutate(world, 'veg', 22, 15, bump(0.2));
  assert.equal(layer.update(1, world, { heightChanged: false }), false, '标记不该因为水面/地貌/植被变化而重贴地');
  assert.equal(layer.update(1, world, { heightChanged: true }), true);
  layer.dispose();
});

check('SelectionMarker：只在「选中变了」或 heightChanged 时重摆', () => {
  const world = flatWorld();
  const c = createCoordinates(world);
  const marker = new SelectionMarker(c);
  const x = 10, y = 10;
  marker.setCell(x, y);
  marker.update(world, false);
  const first = marker.mesh.position.y;
  assert(Number.isFinite(first), 'setCell 之后必须摆过一次');
  // 水面 / 地貌 / 植被变化：不重摆。
  marker.update(world, false);
  assert.equal(marker.mesh.position.y, first);
  // 高度变化：重摆，而且落在新地表上。
  world.height[at(world, x, y)] += 0.25;
  marker.update(world, true);
  assert.notEqual(marker.mesh.position.y, first, 'heightChanged 必须让环重摆');
  assert(Math.abs(marker.mesh.position.y - (surfaceElevation(world, x, y) + 0.18)) < 1e-6, '环必须落在新地表上');
  marker.dispose();
});

check('Case 4 端到端：只改 height ⇒ 地形 / 水 / 实体 / 建筑 / 标记的 Y 全部跟上', () => {
  const world = richWorld();
  const c = createCoordinates(world);
  const terrain = new TerrainMesh(world, c);
  const water = new WaterLayer(world, c);
  const entities = new EntityLayer(world, c);
  const settlements = new SettlementLayer(world, c);
  const markers = new WorldMarkerLayer(world, c);
  // 首刷
  entities.update(1, world, { heightChanged: true });
  settlements.update(1, world, { heightChanged: true });
  markers.update(1, world, { heightChanged: true });

  // 收集「有内容压着的格子」，把它们整体抬高——这样每一层都必须动。
  const derivedEntities = deriveEntities(world);
  const entityItems = ['human', 'cultivator', 'beast'].flatMap((cls) => derivedEntities[cls]);
  const buildings = deriveSettlements(world).buildings;
  const markerItems = deriveMarkers(world).artifacts;
  const cells = [
    ...entityItems.map((e) => [Math.floor(e.x), Math.floor(e.y)]),
    ...buildings.map((b) => [Math.floor(b.x), Math.floor(b.y)]),
    ...markerItems.map((m) => [Math.floor(m.x), Math.floor(m.y)]),
  ];
  assert(entityItems.length > 0 && buildings.length > 0 && markerItems.length > 0, '非空性守卫：贴地内容不能是空的');
  for (const [x, y] of cells) world.height[at(world, x, y)] += 0.3;
  const region = { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };

  terrain.update(region, { height: true, type: false });
  water.update(region);
  entities.update(1, world, { heightChanged: true });
  settlements.update(1, world, { heightChanged: true });
  markers.update(1, world, { heightChanged: true });

  // ① 地形：每个被动过的格子，顶点 Y 必须等于 visualElevation(新高度)。
  for (const [x, y] of cells) {
    const i = at(world, x, y);
    assert(Math.abs(terrain.geometry.attributes.position.getY(i) - visualElevation(world.height[i])) < 1e-5, `地形 Y 没跟上 (${x},${y})`);
  }
  // ② 实体：实例 Y = 地表 + 该实体的 lift（lift 是派生量，不写死）。
  const e0 = derivedEntities.human[0];
  entities.meshes.human.getMatrixAt(0, M);
  assert(Math.abs(M.elements[13] - (surfaceElevation(world, e0.x, e0.y) + e0.lift)) < 1e-5, '实体没落在新地表上');
  // ③ 建筑：实例 Y = 地表（墙体的底面在 y=0）。
  settlements.bodies.getMatrixAt(0, M);
  assert(Math.abs(M.elements[13] - surfaceElevation(world, buildings[0].x, buildings[0].y)) < 1e-5, '建筑没落在新地表上');
  // ④ 标记：法宝 lift = 0.55。
  markers.artifacts.getMatrixAt(0, M);
  assert(Math.abs(M.elements[13] - (surfaceElevation(world, markerItems[0].x, markerItems[0].y) + 0.55)) < 1e-5, '标记没落在新地表上');
  // ⑤ 水面：湿格 Y = visualElevation(height + water) + 0.04（只抽湿格断言，干格是另一条公式）。
  const wet = cells.find(([x, y]) => world.water[at(world, x, y)] > 0.0015);
  if (wet) {
    const i = at(world, wet[0], wet[1]);
    assert(Math.abs(water.geometry.attributes.position.getY(i) - (visualElevation(world.height[i] + world.water[i]) + 0.04)) < 1e-5, '水面没跟上');
  }

  terrain.dispose(); water.dispose(); entities.dispose(); settlements.dispose(); markers.dispose();
});

// ══ G5 · PlaneStage 的分派（源码结构腿）════════════════════════════════
section('G5 · PlaneStage 分派（按 Stage 源码结构钉）');

check('贴地三兄弟只吃 `heightChanged`，不再有 `terrainChanged` 这个过粗的名字', () => {
  const src = readSource('src/inkbox/render3d/stage/PlaneStage.js');
  assert(!/terrainChanged/.test(src), 'M1.1D 起不许再出现 terrainChanged（那是四层揉一起的旧契约）');
  assert(/const heightChanged = heightRegion !== null;/.test(src), 'heightChanged 必须**只**由 height 脏区推出');
  assert(/const options = \{ heightChanged \};/.test(src), '三个贴地层必须收到同一个 heightChanged');
  for (const layer of ['entities', 'settlements', 'markers']) {
    assert(new RegExp(`this\\.${layer}\\?\\.update\\(dt, this\\.world, options\\)`).test(src), `${layer} 必须收到同一个 options`);
  }
  for (const file of ['entities/EntityLayer.js', 'settlements/SettlementLayer.js', 'markers/WorldMarkerLayer.js']) {
    assert(/options\.heightChanged/.test(readSource(`src/inkbox/render3d/${file}`)), `${file} 必须读 options.heightChanged`);
  }
});

check('TerrainMesh 分两次调：height 只写 Y、type 只写色', () => {
  const src = readSource('src/inkbox/render3d/stage/PlaneStage.js');
  assert(/terrain\?\.update\(heightRegion, \{ height: true, type: false \}\)/.test(src), 'height 脏区必须显式关掉颜色');
  assert(/terrain\?\.update\(typeRegion, \{ height: false, type: true \}\)/.test(src), 'type 脏区必须显式关掉 Y');
});

check('水面吃 height ∨ water；植被吃 height ∨ type ∨ veg', () => {
  const src = readSource('src/inkbox/render3d/stage/PlaneStage.js');
  assert(/if \(\(heightChanged \|\| waterRegion\) && this\.water\) this\.water\.update/.test(src), '水面高度依赖 height + water');
  assert(/if \(this\.vegetation && \(heightChanged \|\| typeRegion \|\| vegRegion\)\) this\.vegetationPending = true;/.test(src), '植被派生依赖 height + type + veg');
});

check('区域合并只走 `mergeRegion`，不在 Renderer3D 里手抄一遍 min/max', () => {
  const src = readSource('src/inkbox/render3d/stage/PlaneStage.js');
  assert(/import \{ WorldRenderBridge, mergeRegion \}/.test(src), '必须从桥里 import mergeRegion');
  const uses = src.match(/mergeRegion\(/g) || [];
  assert(uses.length >= 2, `mergeRegion 至少用于 pending∪height 与水面脏区，实得 ${uses.length}`);
  assert(!/Math\.min\(\s*[rp]\.x0/.test(src), '不许再手抄 Math.min(x0) 那套合并逻辑');
});

check('选中环收到 heightChanged（不是每帧无脑重摆）', () => {
  const src = readSource('src/inkbox/render3d/stage/PlaneStage.js');
  assert(/this\.selectionMarker\?\.update\(this\.world, heightChanged\)/.test(src));
  const markerSrc = readSource('src/inkbox/render3d/SelectionMarker.js');
  assert(/if \(!this\.needsPlace && !heightChanged\) return;/.test(markerSrc), '选中环必须自己判断要不要重摆');
});

// ══ G6 · 边界：不给 World 加 renderer dirty 字段 ══════════════════════
section('G6 · 边界（dirty 状态只属于 Render3D）');

function walkJs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

check('全仓源码不出现 heightDirty / waterDirty / typeDirty / vegDirty / renderDirty / threeDirty', () => {
  // ⚠️ `world.touch()` 里的 `terrainDirty` **不在此列**：那是 Canvas 地形位图的既有机制
  //    （`world/terrain.js` 的 markDirty/flushDirty），不是 Render3D 塞给 World 的脏标记。
  const forbidden = /\b(heightDirty|waterDirty|typeDirty|vegDirty|renderDirty|threeDirty)\b/;
  const hits = [];
  for (const file of walkJs(path.join(ROOT, 'src', 'inkbox'))) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    if (forbidden.test(src)) hits.push(path.relative(ROOT, file).replaceAll('\\', '/'));
  }
  assert.deepEqual(hits, [], `这些文件把 renderer dirty 写进了模拟层：${hits.join(', ')}`);
});

check('桥自己持有快照，且每层各一份（不是共享同一个数组）', () => {
  const src = readSource('src/inkbox/render3d/WorldRenderBridge.js');
  assert(/this\.snapshots = Object\.fromEntries\(BRIDGE_LAYERS\.map\(key => \[key, world\[key\]\.slice\(\)\]\)\)/.test(src), '四层必须各自 slice 一份');
  const world = flatWorld();
  const bridge = new WorldRenderBridge(world);
  const arrays = BRIDGE_LAYERS.map((key) => bridge.snapshots[key]);
  assert.equal(new Set(arrays).size, BRIDGE_LAYERS.length, '四份快照不能是同一个引用');
  for (const key of BRIDGE_LAYERS) assert.notEqual(bridge.snapshots[key], world[key], `${key} 快照不能直接引用世界数组`);
});

check('跑完整轮分类 + 全部层更新后，world 的关键字段逐字不变', () => {
  const world = richWorld();
  const digest = (w) => JSON.stringify({
    day: w.day, entities: w.entities, villages: w.villages, factions: w.factions,
    artifacts: w.artifacts, sites: w.sites, leylines: w.leylines, rifts: w.rifts,
    watch: w.watch,
  });
  const before = digest(world);
  const c = createCoordinates(world);
  const bridge = new WorldRenderBridge(world);
  const entities = new EntityLayer(world, c), settlements = new SettlementLayer(world, c), markers = new WorldMarkerLayer(world, c);
  const terrain = new TerrainMesh(world, c), water = new WaterLayer(world, c), vegetation = new VegetationLayer(world, c);
  const selection = new SelectionMarker(c);
  for (let frame = 0; frame < 6; frame += 1) {
    const d = bridge.changes();
    if (d?.height) terrain.update(d.height, { height: true, type: false });
    if (d?.type) terrain.update(d.type, { height: false, type: true });
    if (d?.height || d?.water) water.update(mergeRegion(d.height, d.water));
    if (d?.height || d?.type || d?.veg) vegetation.update();
    const layers = { heightChanged: !!d?.height };
    entities.update(0.2, world, layers); settlements.update(0.2, world, layers); markers.update(0.2, world, layers);
    selection.update(world, layers.heightChanged);
  }
  assert.equal(digest(world), before, '渲染侧不许写回任何模拟字段');
  for (const layer of [terrain, water, vegetation, entities, settlements, markers, selection]) layer.dispose();
});

// ══ G7 · 分类到底省掉了什么（可数形态）═══════════════════════════════
section('G7 · 分类省掉了什么（同一条世界线，两种派发口径对比）');

check('「只有水面在变」的 60 帧：贴地物重写次数 60 → 0', () => {
  const world = richWorld();
  const c = createCoordinates(world);

  /** 跑 60 帧「只有 water 在动」，返回三个贴地层一共被强制重写了多少次。 */
  const run = (dispatch) => {
    const entities = new EntityLayer(world, c), settlements = new SettlementLayer(world, c), markers = new WorldMarkerLayer(world, c);
    const bridge = new WorldRenderBridge(world);
    entities.update(1, world, { heightChanged: true });       // 首刷
    settlements.update(1, world, { heightChanged: true });
    markers.update(1, world, { heightChanged: true });
    let rewrites = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      mutate(world, 'water', 4 + (frame % 20), 6, bump(0.03));  // 只碰 water
      const d = bridge.changes();
      const layers = dispatch(d);
      if (entities.update(0.2, world, layers)) rewrites += 1;
      if (settlements.update(0.2, world, layers)) rewrites += 1;
      if (markers.update(0.2, world, layers)) rewrites += 1;
    }
    entities.dispose(); settlements.dispose(); markers.dispose();
    return rewrites;
  };

  // ① M1 的旧口径：四层揉一起 ⇒ 「有脏」就等于「地形变了」。
  const coarse = run((d) => ({ heightChanged: !!d }));
  // ② M1.1D 的新口径：只认 height 脏。
  const classified = run((d) => ({ heightChanged: !!d?.height }));

  assert.equal(coarse, 180, `旧口径应每帧强制重写三层（60×3=180），实得 ${coarse}`);
  assert.equal(classified, 0, `新口径下水面变化不该强制任何一层重写，实得 ${classified}`);
});

// ══ G8 · 模拟确定性不退化（Render3D 开 vs 关 · 三界全开）══════════════
section('G8 · 模拟确定性不退化（Render3D 开 / 关 · 三界全开 · 推进同天数）');

// §十九 点名要比的字段，一个不漏。**整段 nether / upper 直接进 digest**——
// 这样「人口账本」`nether.popLog`、「法宝账本」`artifactLog` / `nether.artifactLog`
// 都被覆盖，不用逐字段手抄（手抄就会漏）。
const REALM_DIGEST = (w) => JSON.stringify({
  day: w.day,
  entities: w.entities, villages: w.villages, factions: w.factions,
  artifacts: w.artifacts, artifactLog: w.artifactLog,
  sites: w.sites, leylines: w.leylines,
  rifts: w.rifts, riftLog: w.riftLog,
  wraiths: w.wraiths, wraithLog: w.wraithLog,
  watch: w.watch,
  upper: w.upper,
  nether: w.nether,
});

/** 造一个「三界齐全 + 幽冥不是空的」世界。两个世界必须走**同一个工厂、同一顺序**。 */
function realmWorld(seed) {
  const w = generateWorld({ preset: { w: 64, h: 48 }, seed, scatter: true });
  w.upper = generateUpperWorld({ preset: { w: 64, h: 48 }, seed: w.seed });
  w.nether = generateNetherWorld({ preset: { w: 64, h: 48 }, seed: w.seed });
  // 幽冥世界**默认是空的**（没裂缝穿越时本来就没人）⇒ 不塞鬼魂的话
  // 「比对了 nether」就是空断言。用真工厂 `spawnNetherGhost` 塞 30 只，两边同序。
  for (let i = 0; i < 30; i += 1) spawnNetherGhost(w.nether, { kind: 'ghost', decayYears: 10 });
  return w;
}

/** 同 seed 的两个世界：A 每轮跑一整套渲染派生，B 完全不碰渲染。 */
function runRealmPair() {
  const rendered = realmWorld(616161);
  const control = realmWorld(616161);

  const c = createCoordinates(rendered);
  const bridge = new WorldRenderBridge(rendered);
  const terrain = new TerrainMesh(rendered, c);
  const water = new WaterLayer(rendered, c);
  const vegetation = new VegetationLayer(rendered, c);
  const entities = new EntityLayer(rendered, c);
  const settlements = new SettlementLayer(rendered, c);
  const markers = new WorldMarkerLayer(rendered, c);
  const selection = new SelectionMarker(c);

  const depsFor = (w) => ({
    life: new Life(w, mulberry32(w.seed ^ 0xa5a5a5a5)),
    upperLife: new Life(w.upper, mulberry32(w.seed ^ 0x55505052)),
    state: createAdvanceState(),
    rng: mulberry32(w.seed ^ 0x1a2b3c4d),
    nether: true, wraith: true, riftActive: true,
  });
  const depsA = depsFor(rendered);
  const depsB = depsFor(control);

  for (let round = 0; round < 20; round += 1) {
    // A：先推进，再跑「桥扫描 → 分类派发 → 全部层更新 → 点选」这一整套
    advanceWorld(rendered, 30, depsA);
    const dirty = bridge.changes();
    const heightRegion = mergeRegion(null, dirty?.height ?? null);
    const heightChanged = heightRegion !== null;
    if (heightRegion) terrain.update(heightRegion, { height: true, type: false });
    if (dirty?.type) terrain.update(dirty.type, { height: false, type: true });
    if (heightRegion || dirty?.water) water.update(mergeRegion(heightRegion, dirty?.water ?? null));
    if (heightRegion || dirty?.type || dirty?.veg) vegetation.update();
    entities.update(0.2, rendered, { heightChanged });
    settlements.update(0.2, rendered, { heightChanged });
    markers.update(0.2, rendered, { heightChanged });
    selection.setCell(round % rendered.w, round % rendered.h);
    selection.update(rendered, heightChanged);

    // B：只推进，一行渲染代码都不碰
    advanceWorld(control, 30, depsB);
  }

  for (const layer of [terrain, water, vegetation, entities, settlements, markers, selection]) layer.dispose();
  return { rendered, control };
}

check('对照组确实在动（否则「两边相同」可能只是「两边都空」）', () => {
  const { rendered, control } = runRealmPair();
  // 这条守卫本身不是判据，是**判据的非空性前提**：任一条为 0，下面那条就等于没测。
  assert.equal(rendered.day, 600, `应推进 600 日，实得 ${rendered.day}`);
  assert(rendered.entities.length > 0, `凡间必须有生灵，实得 ${rendered.entities.length}`);
  assert(rendered.upper.entities.length > 0, `上界必须有人，实得 ${rendered.upper.entities.length}`);
  assert(rendered.nether.entities.length > 0, `幽冥必须有鬼魂，实得 ${rendered.nether.entities.length}`);
  assert(rendered.villages.length > 0, `必须有聚落，实得 ${rendered.villages.length}`);
  assert(rendered.leylines.length > 0, `必须有灵脉，实得 ${rendered.leylines.length}`);
  // 两个账本各取一条**真的在动的**读数，否则「账本也逐字比了」是空话：
  //   · 人口账本 → `nether.popLog.ghostBorn`（我们手推的 30 只鬼魂都记了账）
  //   · 法宝账本 → `nether.artifacts` + `popLog.itemsSpawned`（幽冥自生的法宝）
  assert(rendered.nether.popLog.ghostBorn > 0, '人口账本必须动过（ghostBorn > 0）');
  assert(rendered.nether.artifacts.length > 0 && rendered.nether.popLog.itemsSpawned > 0,
    `法宝账本必须动过，实得 artifacts=${rendered.nether.artifacts.length} itemsSpawned=${rendered.nether.popLog.itemsSpawned}`);
  // ⚠️ 刻意**不**给 `factions` / `rifts` / `sites` / 凡间 `artifacts` 加非空守卫：
  //    在 64×48 / 600 日 这个窗口里它们**本来就可能是 0**（宗门成立、裂缝生成、法宝锻造
  //    都要更长时段或更高人口）。硬加非空守卫会变成「拿一条与本题无关的生态假设去卡
  //    一条确定性断言」——那种红是**假红**。它们照常进 digest 参与逐字比对。
  assert(control.day === rendered.day, '两个世界必须推进同样天数');
});

check('同 seed · 推进 600 日：Render3D 开 / 关 ⇒ 三界状态逐字段相同', () => {
  const { rendered, control } = runRealmPair();
  // 故障形态：渲染层偷偷反写了 world（比如某层 update 里改了 height，或点选改了 watch）
  // ⇒ 两条世界线分叉。这条断言就是「Three.js 只是观察者」在三界尺度上的可数形态。
  const a = REALM_DIGEST(rendered);
  const b = REALM_DIGEST(control);
  if (a !== b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
    assert.fail(`两条世界线在第 ${i} 个字符处分叉：\n  渲染侧 …${a.slice(Math.max(0, i - 80), i + 120)}\n  对照侧 …${b.slice(Math.max(0, i - 80), i + 120)}`);
  }
  assert.equal(a, b);
});

// ══ 汇总 ═════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════════');
if (failures.length) {
  console.log(`✗ ${failures.length} 项失败 / 共 ${passed + failures.length} 项`);
  for (const label of failures) console.log(`   · ${label}`);
  process.exitCode = 1;
} else {
  console.log(`全部通过 · ${passed} 项断言`);
}
console.log('══════════════════════════════════════════════════════════════');
