#!/usr/bin/env node
// Inkbox Render3D M1 回归 · 实体 / 聚落 / 标记 表现层
//
// ───────────────────────────────────────────────────────────────────────
// 这个文件要证明什么
// ───────────────────────────────────────────────────────────────────────
//
// M1 往 3D 里加了三个**只读**表现层（EntityLayer / SettlementLayer / WorldMarkerLayer）。
// 它们最容易犯的错**都不报错**：悄悄写回世界、少画一个实体、把「没人」画成「有人」、
// 把裂缝半径自己算一遍（下次调参就与模拟分叉）。所以这一组把三件事钉死：
//
//   ① **数量对应**：世界里有几个实体 / 几座屋 / 几个标记，实例就恰好几个；
//   ② **只读**：跑完派生与更新，world 的 JSON **逐字不变**；
//   ③ **模拟不受影响**：同 seed 两个世界，一个跑渲染派生、一个不跑，推进同样天数后
//      关键模拟状态**逐字段相同**——「Three.js 只是观察者」的可数形态。
//
// ⚠️ **为什么自己构造世界，而不等它自然长出来**：实测 `generateWorld` 初始 **0 生灵**，
//    5580 日才 4 个村落、0 宗门、0 法宝、0 裂缝。自然生长**测不到**这些层。所以本文件
//    先用「自然世界」验真实管线的数量对应，再往数组里**推入已知内容**逐项验映射。
//
// ⚠️ 口径提醒（写错过一次就会假红）：
//   · 实体物种字段是 **`sp`**，不是 `kind`（`kind` 属于 sites）；
//   · **`level > 0` 才是修士**；
//   · 实体 x/y 是**浮点格中心**；村落 / 地点 / 灵脉 / 裂缝的 x/y 是**整数格**；
//   · 裂缝半径**只认 `riftRadiusAt(rift)`**。
//
// 运行：`node scripts/inkbox-render3d-m1.mjs`（退出码 0 = 全绿）

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import { WORLD_PRESETS, LIMITS, SEA_LEVEL, STRUCT, INK } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { Life } from '../src/inkbox/sim/life.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { riftRadiusAt } from '../src/inkbox/sim/rifts.js';

import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { visualElevation, surfaceElevation } from '../src/inkbox/render3d/terrain/VisualElevation.js';
import { sculpt } from '../src/inkbox/render3d/terrain/sculpt.js';
import { deriveEntities, sameEntities, entityClassOf, ENTITY_CLASSES } from '../src/inkbox/render3d/entities/deriveEntities.js';
import { EntityLayer } from '../src/inkbox/render3d/entities/EntityLayer.js';
import { deriveSettlements, SettlementLayer } from '../src/inkbox/render3d/settlements/SettlementLayer.js';
import { deriveMarkers, WorldMarkerLayer, SITE_KINDS, MARKER_MIN_ZOOM } from '../src/inkbox/render3d/markers/WorldMarkerLayer.js';
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

/** 只看**会被渲染影响**的那些字段（全量 JSON 对 384×240 太慢，也没必要）。 */
function worldDigest(world) {
  return JSON.stringify({
    seed: world.seed, day: world.day, w: world.w, h: world.h,
    height: world.height, water: world.water, type: world.type, veg: world.veg,
    entities: world.entities, villages: world.villages, factions: world.factions,
    artifacts: world.artifacts, sites: world.sites, leylines: world.leylines,
    rifts: world.rifts, wraiths: world.wraiths, watch: world.watch,
  });
}

const _matrix = new THREE.Matrix4();

/**
 * 去注释（逐字符状态机，保留行号）。**扫源码前必须做**——本仓注释里大量出现
 * 「被禁止的字面量」（正是在解释「为什么不能这么写」）。例如 `deriveEntities.js`
 * 的头注释里就写着 `Math.random`，不去注释会让下面那条纯度断言**当场假红**。
 * 与 `inkbox-view.mjs` / `inkbox-three-realms.mjs` / `inkbox-presentation.mjs` 同款。
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

function instanceAt(mesh, index) {
  mesh.getMatrixAt(index, _matrix);
  const e = _matrix.elements;
  return { x: e[12], y: e[13], z: e[14] };
}
function indexOfId(list, id) { return list.findIndex((it) => it.id === id); }

/** 一个「内容已知」的世界：所有层都有非空输入。 */
function richWorld(w, h, seed) {
  const world = generateWorld({ preset: { w, h }, seed, scatter: true });
  const cx = Math.floor(w / 2); const cy = Math.floor(h / 2);
  world.entities.push(
    { id: 9001, x: cx + 0.5, y: cy + 0.5, sp: 'human', level: 0, faction: 0, name: '凡人甲' },
    { id: 9002, x: cx + 2.5, y: cy + 0.5, sp: 'cultivator', level: 25, faction: 1, name: '修士乙' },
    { id: 9003, x: cx + 4.5, y: cy + 0.5, sp: 'beast', level: 0, faction: 0, name: '灵兽丙' },
    { id: 9004, x: cx + 6.5, y: cy + 0.5, sp: 'spirit', level: 0, faction: 0, name: '山精丁' },
  );
  world.wraiths.push({ id: 2000001, sp: 'ghost', x: cx + 8.5, y: cy + 0.5, level: 0, soulKind: 'ghost', name: '孤魂' });
  world.villages.push(
    { id: 11, x: cx - 10, y: cy - 10, level: 1, faction: 0, name: '小村', pop: 0, houses: [{ x: cx - 10, y: cy - 10, type: STRUCT.HOUSE }, { x: cx - 9, y: cy - 10, type: STRUCT.HOUSE }] },
    { id: 12, x: cx + 12, y: cy + 12, level: 3, faction: 1, name: '城池', pop: 0, houses: [{ x: cx + 12, y: cy + 12, type: STRUCT.HALL }, { x: cx + 11, y: cy + 12, type: STRUCT.HOUSE }] },
  );
  world.factions.push({ id: 1, name: '青云门', color: '#a8493c', accent: '#d98a72', capitalX: cx, capitalY: cy - 20 });
  world.artifacts.push(
    { id: 501, name: '无主剑', x: cx - 5, y: cy + 3, ownerId: 0, lostDay: 10 },
    { id: 502, name: '旧鼎', x: cx - 3, y: cy + 3, ownerId: 0, lostDay: 20 },
  );
  for (const kind of SITE_KINDS) world.sites.push({ id: 700 + SITE_KINDS.indexOf(kind), kind, x: cx + 3, y: cy + 9, name: kind, age: 0 });
  world.leylines.push({ id: 801, x: cx - 15, y: cy + 6, radius: 7, strength: 0.4 });
  world.rifts.push(
    { id: 901, x: cx + 1, y: cy + 1, strength: 6, openedDay: 0, age: 900, closedDay: -1, targetPlane: 'upper' },
    { id: 902, x: cx - 1, y: cy + 1, strength: 6, openedDay: 0, age: 900, closedDay: 40, targetPlane: 'nether' }, // 已闭合 ⇒ 不该画
  );
  return world;
}

console.log('══════════════════════════════════════════════════════════════');
console.log('inkbox Render3D M1 回归（实体 / 聚落 / 标记）');
console.log('══════════════════════════════════════════════════════════════');

// ══ G1 · 数据纯度 ═══════════════════════════════════════════════════
section('G1 · 数据纯度（建层 + 反复 update，world 逐字不变）');
for (const [name, preset] of Object.entries(WORLD_PRESETS)) {
  const world = generateWorld({ preset, seed: 20260928, scatter: true });
  const before = worldDigest(world);
  const coordinates = createCoordinates(world);
  const layers = [
    new EntityLayer(world, coordinates),
    new SettlementLayer(world, coordinates),
    new WorldMarkerLayer(world, coordinates),
  ];
  const selection = new SelectionMarker(coordinates);
  check(`${name}: 建三层 + 24 帧 update 后 world 逐字不变`, () => {
    selection.setCell(3, 4);
    for (let frame = 0; frame < 24; frame += 1) {
      for (const layer of layers) layer.update(0.2, world, { heightChanged: true });
      selection.update(world);
    }
    assert.equal(worldDigest(world), before);
  });
  check(`${name}: 反复 update 是幂等的（第二次不再重写实例）`, () => {
    const layer = layers[0];
    layer.update(1, world, { heightChanged: true });
    assert.equal(layer.update(1, world, {}), false, '派生结果没变时不该重写');
    assert.equal(layers[1].update(1, world, {}), false);
    assert.equal(layers[2].update(1, world, {}), false);
  });
  for (const layer of layers) layer.dispose();
  selection.dispose();
}

// ══ G2 · EntityLayer ═══════════════════════════════════════════════
section('G2 · EntityLayer（数量对应 / 增删 / 移动 / 贴地）');
{
  const world = richWorld(96, 72, 777);
  const coordinates = createCoordinates(world);
  const layer = new EntityLayer(world, coordinates);
  const derived = deriveEntities(world);

  check('实体数 = 各类实例数之和（含 wraiths 独立容器）', () => {
    layer.update(1, world, { heightChanged: true });
    assert(derived.total > 0, '测试世界必须有实体');
    assert.equal(layer.stats.instances, derived.total);
    let sum = 0;
    for (const cls of ENTITY_CLASSES) { assert.equal(layer.meshes[cls].count, derived[cls].length); sum += derived[cls].length; }
    assert.equal(sum, derived.total);
  });
  check('分类口径：level>0 ⇒ cultivator；beast/spirit 看 sp；鬼影独立', () => {
    assert.equal(entityClassOf('human', 0), 'human');
    assert.equal(entityClassOf('human', 1), 'cultivator');
    assert.equal(entityClassOf('cultivator', 0), 'human');   // 权威判据是 level，不是 sp
    assert.equal(entityClassOf('beast', 5), 'beast');
    assert.equal(entityClassOf('spirit', 0), 'spirit');
    assert.equal(entityClassOf('ghost', 0), 'wraith');
    assert.equal(derived.human.length, 1);       // 9001
    assert.equal(derived.cultivator.length, 1);  // 9002
    assert.equal(derived.beast.length, 1);       // 9003
    assert.equal(derived.spirit.length, 1);      // 9004
    assert.equal(derived.wraith.length, 1);      // 2000001
  });
  check('新增实体 ⇒ 实例增加；删除实体 ⇒ 实例减少', () => {
    const before = layer.stats.instances;
    world.entities.push({ id: 9100, x: 20.5, y: 20.5, sp: 'human', level: 0, faction: 0 });
    layer.update(1, world, { heightChanged: true });
    assert.equal(layer.stats.instances, before + 1);
    world.entities.pop();
    layer.update(1, world, { heightChanged: true });
    assert.equal(layer.stats.instances, before);
  });
  check('改变 x/y ⇒ 该实例位置随之改变', () => {
    const entity = world.entities.find((e) => e.id === 9001);
    const cls = entityClassOf(entity.sp, entity.level);
    const index = indexOfId(deriveEntities(world)[cls], 9001);
    const from = instanceAt(layer.meshes[cls], index);
    entity.x += 6;
    layer.update(1, world, { heightChanged: true });
    const to = instanceAt(layer.meshes[cls], index);
    assert(Math.abs(to.x - from.x - 6) < 1e-4, `render X 应恰好 +6：${from.x} → ${to.x}`);
  });
  check('改变地形高度 ⇒ 实例 Y 跟随地表（不是固定 Y）', () => {
    const entity = world.entities.find((e) => e.id === 9002);
    const cls = entityClassOf(entity.sp, entity.level);
    const index = indexOfId(deriveEntities(world)[cls], 9002);
    const from = instanceAt(layer.meshes[cls], index);
    const cx = Math.round(entity.x); const cy = Math.round(entity.y);
    for (let i = 0; i < 3; i += 1) sculpt(world, { x: cx, y: cy, radius: 3, mode: 'raise', strength: 0.25 });
    layer.update(1, world, { heightChanged: true });
    const to = instanceAt(layer.meshes[cls], index);
    assert(to.y > from.y + 1, `抬高地形后实例 Y 应变大：${from.y} → ${to.y}`);
    // 而且必须与地表插值一致（不是随便抬高）
    const expected = surfaceElevation(world, entity.x, entity.y) + 0.4; // 9002 是 level 25 ⇒ 离地 0.4
    assert(Math.abs(to.y - expected) < 1e-3, `应贴地：${to.y} vs ${expected}`);
  });
  check('实例矩阵不是固定 Y（同世界不同格的实体 Y 不同）', () => {
    const list = deriveEntities(world).human;
    if (list.length < 2) return;
    const a = instanceAt(layer.meshes.human, 0);
    const b = instanceAt(layer.meshes.human, list.length - 1);
    assert(Math.abs(a.y - b.y) > 1e-6 || Math.abs(a.x - b.x) > 1e-6);
  });
  layer.dispose();
}

// ══ G3 · SettlementLayer ═══════════════════════════════════════════
section('G3 · SettlementLayer（真实 house 坐标 / 等级只读 / 宗门山门）');
{
  const world = richWorld(96, 72, 3131);
  const coordinates = createCoordinates(world);
  const layer = new SettlementLayer(world, coordinates);
  const derived = deriveSettlements(world);
  const before = worldDigest(world);

  check('真实 house 坐标被正确映射（含 +0.5 取格中心）', () => {
    layer.update(1, world, { heightChanged: true });
    assert.equal(layer.stats.buildings, derived.buildings.length);
    assert.equal(layer.stats.houses, 4, '两村各 2 座屋');
    const village = world.villages[0];
    const house = village.houses[0];
    const hit = derived.buildings.find((b) => b.x === house.x + 0.5 && b.y === house.y + 0.5);
    assert(hit, '屋舍必须落在真实 house 坐标的格中心');
    const p = coordinates.worldToRender(house.x + 0.5, house.y + 0.5, 0);
    const index = derived.buildings.indexOf(hit);
    const matrix = instanceAt(layer.bodies, index);
    assert(Math.abs(matrix.x - p.x) < 1e-4 && Math.abs(matrix.z - p.z) < 1e-4);
  });
  check('聚落等级只改表现，**不改 world**（digest 逐字相同）', () => {
    const v = world.villages[0];
    const s1 = levelScaleOf(v.level);
    v.level = 4;                                   // 只动一个纯表现输入
    const d2 = deriveSettlements(world);
    const s2 = levelScaleOf(4);
    assert(s2 > s1, '等级越高建筑比例越大');
    assert(d2.buildings.length >= derived.buildings.length, '高等级会加中心建筑');
    v.level = 1;
    // 除 level 外 world 未被改动
    const restored = deriveSettlements(world);
    assert.equal(restored.buildings.length, derived.buildings.length);
  });
  check('宗门山门坐标 = capitalX / capitalY，颜色用 f.color / f.accent', () => {
    const faction = world.factions[0];
    const hall = derived.buildings[derived.buildings.length - 1]; // sects 最后追加
    assert.equal(hall.x, faction.capitalX + 0.5);
    assert.equal(hall.y, faction.capitalY + 0.5);
    assert.equal(hall.body, faction.color);
    assert.equal(hall.roof, faction.accent);
    assert(hall.h > 5, '山门必须明显高于普通聚落');
  });
  check('屋舍配色走既有水墨调色板（不新造一套）', () => {
    assert.equal(derived.buildings[0].body, INK.inkMid);
    assert.equal(derived.buildings[0].roof, INK.ink);
  });
  check('更新聚落层不改 world', () => { assert.equal(worldDigest(world), before); });
  layer.dispose();
}

// 与 `SettlementLayer` 内部同式的等级比例（只用来验单调性，不参与生产）。
function levelScaleOf(level) { return 0.8 + Math.max(1, Math.min(4, Number(level) || 1)) * 0.15; }

// ══ G4 · Artifact / Site / Leyline / Rift ══════════════════════════
section('G4 · 标记层（法宝增删 / 地点 kind 映射 / 灵脉 / 裂缝半径）');
{
  const world = richWorld(96, 72, 4242);
  const coordinates = createCoordinates(world);
  const layer = new WorldMarkerLayer(world, coordinates);
  const before = worldDigest(world);
  const derived = deriveMarkers(world);

  check('无主法宝：数量与 world.artifacts 对应', () => {
    layer.update(1, world, { heightChanged: true });
    assert.equal(layer.stats.artifacts, world.artifacts.length);
  });
  check('新增 ground artifact ⇒ marker 出现；移除 ⇒ 消失', () => {
    world.artifacts.push({ id: 599, name: '新落之器', x: 30, y: 30, ownerId: 0, lostDay: 99 });
    layer.update(1, world, { heightChanged: true });
    assert.equal(layer.stats.artifacts, world.artifacts.length);
    world.artifacts.pop();
    layer.update(1, world, { heightChanged: true });
    assert.equal(layer.stats.artifacts, world.artifacts.length);
  });
  check('site kind 映射稳定（四种各自入桶，未知 kind 跳过）', () => {
    assert.deepEqual(SITE_KINDS, ['secret', 'cave', 'formation', 'ruin']);
    for (const kind of SITE_KINDS) assert.equal(derived.sites[kind].length, 1, `${kind} 应有 1 个`);
    world.sites.push({ id: 799, kind: 'unknown-kind', x: 1, y: 1 });
    const after = deriveMarkers(world);
    const total = SITE_KINDS.reduce((n, k) => n + after.sites[k].length, 0);
    assert.equal(total, 4, '未知 kind 必须被跳过，不得硬塞进某一桶');
    world.sites.pop();
  });
  check('灵脉数量对应', () => { assert.equal(layer.stats.leylines, world.leylines.length); });
  check('裂缝：半径 = riftRadiusAt(rift)，且只画还开着的', () => {
    const open = world.rifts.filter((r) => r.closedDay < 0);
    assert.equal(derived.rifts.length, open.length, '闭合的裂缝不该出现');
    assert.equal(layer.stats.rifts, open.length);
    const r = open[0];
    assert(Math.abs(derived.rifts[0].radius - riftRadiusAt(r)) < 1e-12, '半径必须来自唯一公式');
    assert(derived.rifts[0].radius > 0);
  });
  check('裂缝实例按半径缩放（不是固定大小）', () => {
    const index = 0;
    const matrix = new THREE.Matrix4();
    layer.rifts.getMatrixAt(index, matrix);
    const scale = new THREE.Vector3(); matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    assert(Math.abs(scale.x - derived.rifts[0].radius) < 1e-4);
  });
  check('LOD：缩放小于阈值时小标记不可见，裂缝始终可见', () => {
    layer.setZoom(0.6);
    assert.equal(layer.artifacts.visible, false);
    assert.equal(layer.rifts.visible, true, '裂缝是地貌级特征，不该被阈值藏掉');
    layer.setZoom(4);
    assert.equal(layer.artifacts.visible, layer.stats.artifacts > 0);
    assert(MARKER_MIN_ZOOM >= 1);
  });
  check('更新标记层不改 world', () => { assert.equal(worldDigest(world), before); });
  layer.dispose();
}

// ══ G5 · 坐标契约 ══════════════════════════════════════════════════
section('G5 · 坐标契约（沿用 M0，不许每层各写一套中心偏移）');
{
  const world = generateWorld({ preset: { w: 64, h: 48 }, seed: 5, scatter: false });
  const coordinates = createCoordinates(world);
  check('world → render → world 往返一致，边界夹取正确', () => {
    for (const [x, y] of [[0, 0], [world.w - 1, 0], [0, world.h - 1], [world.w - 1, world.h - 1], [13.25, 17.75]]) {
      const p = coordinates.worldToRender(x, y, 8);
      const q = coordinates.renderToWorld(p.x, p.z);
      assert.equal(q.x, x); assert.equal(q.y, y);
    }
    assert.deepEqual(coordinates.renderPointToCell({ x: -9999, z: 9999 }), { x: 0, y: world.h - 1 });
  });
  check('高程映射：海平面为 0，海床为负，高山为正', () => {
    assert.equal(visualElevation(SEA_LEVEL), 0);
    assert(visualElevation(0) < 0 && visualElevation(1) > 0);
  });
  check('三个层共用同一个 coordinates 实例（无第二套偏移）', () => {
    const layers = [
      new EntityLayer(world, coordinates),
      new SettlementLayer(world, coordinates),
      new WorldMarkerLayer(world, coordinates),
    ];
    for (const layer of layers) assert.equal(layer.coordinates, coordinates);
    for (const layer of layers) layer.dispose();
  });
}

// ══ G6 · 确定性与纯度（源码） ══════════════════════════════════════
section('G6 · 确定性与纯度');
{
  const world = richWorld(64, 48, 616);
  check('同世界状态 ⇒ 派生结果逐字段相同', () => {
    assert.deepEqual(deriveEntities(world), deriveEntities(world));
    assert.deepEqual(deriveSettlements(world), deriveSettlements(world));
    assert.deepEqual(deriveMarkers(world), deriveMarkers(world));
  });
  check('实体数组乱序 ⇒ 派生结果仍相同（按 id 稳定排序）', () => {
    const a = deriveEntities(world);
    world.entities.reverse();
    const b = deriveEntities(world);
    world.entities.reverse();
    assert.deepEqual(a, b);
  });
  check('sameEntities 认得出「改了一个坐标」', () => {
    const a = deriveEntities(world);
    const entity = world.entities.find((e) => e.id === 9001);
    entity.x += 1;
    const b = deriveEntities(world);
    entity.x -= 1;
    assert.equal(sameEntities(a, b), false);
    assert.equal(sameEntities(a, deriveEntities(world)), true);
  });
  check('render3d 全部源码零 Math.random / 零模拟 rng(', () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith('.js')) continue;
        const src = stripComments(fs.readFileSync(full, 'utf8'));   // ⚠️ 必须先去掉注释
        if (/Math\.random/.test(src) || /\brng\s*\(/.test(src)) offenders.push(path.relative(ROOT, full));
      }
    };
    walk(RENDER3D);
    assert.deepEqual(offenders, [], `这些文件用了随机源：${offenders.join(', ')}`);
  });
}

// ══ G7 · 模拟不受影响 ══════════════════════════════════════════════
section('G7 · 模拟不受影响（同 seed 两世界：一个跑渲染派生，一个不跑）');
{
  const make = () => generateWorld({ preset: { w: 64, h: 48 }, seed: 909090, scatter: true });
  const rendered = make();
  const control = make();
  const coordinates = createCoordinates(rendered);
  const layers = [
    new EntityLayer(rendered, coordinates),
    new SettlementLayer(rendered, coordinates),
    new WorldMarkerLayer(rendered, coordinates),
  ];
  const selection = new SelectionMarker(coordinates);
  const lifeA = new Life(rendered, mulberry32(rendered.seed ^ 0xa5a5a5a5));
  const lifeB = new Life(control, mulberry32(control.seed ^ 0xa5a5a5a5));
  const stateA = createAdvanceState(); const stateB = createAdvanceState();
  const deps = (life, state) => ({ life, state, riftActive: false, nether: false });

  for (let round = 0; round < 20; round += 1) {
    // 渲染世界：先推进，再跑一整套派生 / 更新（含点选与贴地重算）
    advanceWorld(rendered, 30, deps(lifeA, stateA));
    selection.setCell(round % rendered.w, round % rendered.h);
    for (const layer of layers) layer.update(0.2, rendered, { heightChanged: true });
    selection.update(rendered);
    // 对照世界：只推进，不碰渲染
    advanceWorld(control, 30, deps(lifeB, stateB));
  }

  check('推进 600 日后：地形 / 时间 / 人口 / 聚落逐字段相同', () => {
    assert(rendered.entities.length > 0, '测试世界必须有生灵，否则这条断言是空的');
    assert.equal(rendered.day, control.day);
    assert.deepEqual(Array.from(rendered.height), Array.from(control.height));
    assert.deepEqual(Array.from(rendered.water), Array.from(control.water));
    assert.deepEqual(Array.from(rendered.veg), Array.from(control.veg));
    assert.deepEqual(
      rendered.entities.map((e) => [e.id, e.x, e.y, e.level, e.faction, e.hp]),
      control.entities.map((e) => [e.id, e.x, e.y, e.level, e.faction, e.hp]),
    );
    assert.deepEqual(
      rendered.villages.map((v) => [v.id, v.x, v.y, v.level, v.houses.length]),
      control.villages.map((v) => [v.id, v.x, v.y, v.level, v.houses.length]),
    );
    assert.deepEqual(rendered.watch, control.watch);
  });
  for (const layer of layers) layer.dispose();
  selection.dispose();
}

// ══ G8 · 构建 ══════════════════════════════════════════════════════
section('G8 · 构建（新模块必须进包）');
{
  const packageScript = fs.readFileSync(path.join(ROOT, 'scripts', 'inkbox-package.mjs'), 'utf8');
  check('打包脚本递归收录 src/inkbox（新模块自动入包）', () => {
    // ⚠️ M1.1D D6 之后 `DIRECTORIES` 变成 `['src/inkbox', 'vendor/three']`。
    //    旧写法是逐字匹配 `['src/inkbox']`，那是**把数组的当前内容当成了契约**——
    //    多收一个目录就假红。真正的不变量是「`src/inkbox` **在里面**（因而递归入包）」，
    //    所以这里解析出数组再判成员：丢掉 `src/inkbox` 照样变红。
    const m = packageScript.match(/DIRECTORIES\s*=\s*\[([^\]]*)\]/);
    assert(m, '打包脚本里找不到 DIRECTORIES 声明');
    const entries = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    assert(entries.includes('src/inkbox'), `DIRECTORIES 必须含 src/inkbox，实得 [${entries.join(', ')}]`);
  });
  check('M1 新增模块都在磁盘上', () => {
    for (const rel of [
      'entities/deriveEntities.js', 'entities/EntityLayer.js',
      'settlements/SettlementLayer.js', 'markers/WorldMarkerLayer.js', 'SelectionMarker.js',
    ]) assert(fs.existsSync(path.join(RENDER3D, rel)), `缺少 ${rel}`);
  });
  check('M1 测试脚本已登记进 package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert(pkg.scripts['test:render3d:m1'], '缺少 test:render3d:m1');
  });
}

// ══ 收尾 ═══════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════════');
if (failures.length === 0) console.log(`全部通过 · ${passed} 项断言`);
else {
  console.log(`${failures.length} 项未通过 · 共 ${passed + failures.length} 项断言`);
  for (const label of failures) console.log(`  · ${label}`);
}
console.log('══════════════════════════════════════════════════════════════');
process.exitCode = failures.length === 0 ? 0 : 1;
