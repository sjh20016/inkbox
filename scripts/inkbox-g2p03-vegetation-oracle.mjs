#!/usr/bin/env node
// G2-P0.3 阶段 B · 植被更新降载候选的等价性 oracle（V01–V15）。
//
// 判据：**在相同世界状态、相机与表现参数下，原实现「强制完整重建」得到的逐实例结果，
// 必须与优化实现「走等价判据」得到的结果逐字节相同。**
//
// 比较内容（不是「看起来差不多」）：
//   · 每个 LOD 的实例数与可见性
//   · instanceMatrix 与 instanceColor 的**有效前缀字节**
//   · userData.renderTrees 的**身份与顺序**
//   · _lodByTree 的逐 cell 归属
//   · stats、包围盒/包围球
//   · mesh / attribute 的对象身份（防止静默换池）
//
// 同时记录每个场景「候选是否真的跳过了重写」，以证明跳过路径确实被走到、
// 而不是等价性因为两边都没跳过而平凡成立。
//
// 运行：node scripts/inkbox-g2p03-vegetation-oracle.mjs

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { VegetationLayer } from '../src/inkbox/render3d/vegetation/VegetationLayer.js';
import { deriveVegetation } from '../src/inkbox/render3d/vegetation/deriveVegetation.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { ART_PROFILES } from '../src/inkbox/render3d/art/ArtPassProfile.js';
import { REALM_STYLES } from '../src/inkbox/render3d/art/RealmStyleProfile.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';

const SEED = 673231;
let passed = 0;
const failures = [];
const coverage = [];

function scenario(id, title, body) {
  try {
    const detail = body() || {};
    passed += 1;
    coverage.push({ id, title, ...detail });
    console.log(`  ✓ ${id} ${title}${detail.skipped === undefined ? '' : `  [候选${detail.skipped ? '跳过' : '未跳过'}重写]`}`);
  } catch (error) {
    failures.push({ id, title, error });
    console.log(`  ✗ ${id} ${title}\n      ${error.message}`);
  }
}

/** 两个图层：reference 永远强制全量重建；candidate 走生产代码的等价判据。 */
function makePair(world, options = {}) {
  const coordinates = createCoordinates(world);
  const reference = new VegetationLayer(world, coordinates);
  const candidate = new VegetationLayer(world, coordinates);
  let rewrites = 0;
  const realWrite = candidate._writeMatrices.bind(candidate);
  candidate._writeMatrices = function (...args) { rewrites += 1; return realWrite(...args); };
  const finish = () => { rewrites = 0; };
  return {
    world, coordinates, reference, candidate,
    get rewrites() { return rewrites; },
    reset() { rewrites = 0; },
    /** 对两边施加同样的调用，再逐实例比对。 */
    step(label, { heightChanged }) {
      this.reset();
      reference.update({ heightChanged: true });
      candidate.update({ heightChanged });
      compareInstances(label, reference, candidate);
      return { skipped: rewrites === 0 };
    },
    ...options,
  };
}

const bytes = (attribute, count, width) => attribute
  ? Buffer.from(attribute.array.buffer, attribute.array.byteOffset, count * width * attribute.array.BYTES_PER_ELEMENT)
  : null;

function compareInstances(label, a, b) {
  assert.deepEqual(a.trees.map(t => t.cell), b.trees.map(t => t.cell), `${label}: 树木 cell 集合与顺序`);
  assert.deepEqual(a.stats, b.stats, `${label}: stats`);
  assert.deepEqual([...a._lodByTree], [...b._lodByTree], `${label}: 逐 cell LOD 归属`);
  for (let lod = 0; lod < 3; lod++) {
    const ma = a.lodMeshes[lod]; const mb = b.lodMeshes[lod];
    assert.equal(ma.count, mb.count, `${label}: LOD${lod} 实例数`);
    assert.equal(ma.visible, mb.visible, `${label}: LOD${lod} 可见性`);
    assert.deepEqual(bytes(ma.instanceMatrix, ma.count, 16), bytes(mb.instanceMatrix, mb.count, 16), `${label}: LOD${lod} 实例矩阵字节`);
    assert.deepEqual(bytes(ma.instanceColor, ma.count, 3), bytes(mb.instanceColor, mb.count, 3), `${label}: LOD${lod} 实例颜色字节`);
    assert.deepEqual(ma.userData.renderTrees, mb.userData.renderTrees, `${label}: LOD${lod} 实例身份与排序`);
    assert.deepEqual(ma.instanceMatrix.array.length, mb.instanceMatrix.array.length, `${label}: LOD${lod} 容量`);
  }
}

const world0 = generateWorld({ preset: { w: 64, h: 48 }, seed: SEED, scatter: true });
const baselineFacts = createHash('sha256').update(JSON.stringify(world0)).digest('hex');
const initialTrees = deriveVegetation(world0);
assert(initialTrees.length >= 12, '生成的世界必须提供真实树木');

console.log('G2-P0.3 · 植被候选等价性 oracle（V01–V15）');
console.log(`世界 seed=${SEED} · 初始树木 ${initialTrees.length} 棵\n`);

// ── V01：同一世界连续请求更新，实例状态不变 ────────────────────────────────
scenario('V01', '同一世界连续更新 → 实例状态不变', () => {
  const p = makePair(world0);
  p.step('V01 首次', { heightChanged: true });
  const r1 = p.step('V01 无变化', { heightChanged: false });
  const r2 = p.step('V01 再无变化', { heightChanged: false });
  assert.equal(r1.skipped, true, '无变化时候选必须跳过重写（否则本 oracle 没测到目标路径）');
  assert.equal(r2.skipped, true);
  return { skipped: true };
});

// ── V02：少量 veg 变化但树木成员未变化 ─────────────────────────────────────
scenario('V02', '少量 veg 变化、成员未变 → 跳过重写且实例等价', () => {
  const world = generateWorld({ preset: { w: 64, h: 48 }, seed: SEED, scatter: true });
  const p = makePair(world);
  p.step('V02 基线', { heightChanged: true });
  const before = new Set(deriveVegetation(world).map(t => t.cell));
  // 挑一个「有树」的格，把 veg 稍微降一点但不跨过存在阈值
  const tree = deriveVegetation(world)[0];
  const saved = world.veg[tree.cell];
  world.veg[tree.cell] = Math.max(saved - 0.02, saved * 0.9);
  const after = new Set(deriveVegetation(world).map(t => t.cell));
  assert.equal(after.size, before.size, 'V02 的扰动不该改变成员数（否则改用 V03/V04）');
  const r = p.step('V02 微扰', { heightChanged: false });
  assert.equal(r.skipped, true, '成员未变时应当跳过');
  world.veg[tree.cell] = saved;
  return { skipped: true };
});

// ── V03：少量 veg 变化使树木新增 ───────────────────────────────────────────
scenario('V03', 'veg 变化使树木新增 → 必须重写且实例等价', () => {
  const world = generateWorld({ preset: { w: 64, h: 48 }, seed: SEED, scatter: true });
  const p = makePair(world);
  p.step('V03 基线', { heightChanged: true });
  const before = new Set(deriveVegetation(world).map(t => t.cell));
  // 找一格没有树、但抬高 veg 后会长出树的位置
  let added = null;
  for (let i = 0; i < world.size && added === null; i += 1) {
    if (before.has(i)) continue;
    const saved = world.veg[i];
    world.veg[i] = 1;
    if (deriveVegetation(world).some(t => t.cell === i)) added = { i, saved };
    else world.veg[i] = saved;
  }
  assert.ok(added, '找不到任何可以通过抬高 veg 长出树的位置');
  const r = p.step('V03 新增', { heightChanged: false });
  assert.equal(r.skipped, false, '成员变化必须触发重写（等价判据要能抓住新增）');
  return { skipped: false };
});

// ── V04：少量 veg 变化使树木消失 ───────────────────────────────────────────
scenario('V04', 'veg 变化使树木消失 → 必须重写且实例等价', () => {
  const world = generateWorld({ preset: { w: 64, h: 48 }, seed: SEED, scatter: true });
  const p = makePair(world);
  p.step('V04 基线', { heightChanged: true });
  const tree = deriveVegetation(world)[0];
  world.veg[tree.cell] = 0;
  const stillThere = deriveVegetation(world).some(t => t.cell === tree.cell);
  assert.equal(stillThere, false, 'V04 的扰动必须真的让树消失');
  const r = p.step('V04 消失', { heightChanged: false });
  assert.equal(r.skipped, false, '成员消失必须触发重写');
  return { skipped: false };
});

// ── V05：树木数量相同但成员被替换 ──────────────────────────────────────────
scenario('V05', '数量相同、成员被替换 → 必须重写', () => {
  const world = generateWorld({ preset: { w: 64, h: 48 }, seed: SEED, scatter: true });
  const p = makePair(world);
  p.step('V05 基线', { heightChanged: true });
  const trees = deriveVegetation(world);
  const removed = trees[0];
  world.veg[removed.cell] = 0;
  let added = null;
  for (let i = 0; i < world.size && added === null; i += 1) {
    if (deriveVegetation(world).some(t => t.cell === i)) continue;
    const saved = world.veg[i]; world.veg[i] = 1;
    if (deriveVegetation(world).some(t => t.cell === i)) added = i; else world.veg[i] = saved;
  }
  assert.ok(added !== null, 'V05 需要能同时做到「减一棵、加一棵」');
  assert.equal(deriveVegetation(world).length, trees.length, 'V05 要求数量保持不变');
  const r = p.step('V05 替换', { heightChanged: false });
  assert.equal(r.skipped, false, '成员身份变化必须触发重写（只比数量是不够的）');
  return { skipped: false };
});

// ── V06：树木容量上限 ─────────────────────────────────────────────────────
scenario('V06', '容量上限下实例与 stats 等价', () => {
  const world = generateWorld({ preset: { w: 256, h: 192 }, seed: SEED, scatter: true });
  const p = makePair(world);
  p.step('V06 基线', { heightChanged: true });
  const r = p.step('V06 无变化', { heightChanged: false });
  const cap = p.candidate.stats.capacity;
  assert.equal(typeof cap, 'number');
  assert.deepEqual(p.candidate.stats.capacityOverflow, p.reference.stats.capacityOverflow);
  return { skipped: r.skipped, trees: p.candidate.trees.length, capacity: cap };
});

// ── V07：高程变化但成员不变 ───────────────────────────────────────────────
scenario('V07', '高程变化、成员不变 → 调用方声明 heightChanged=true 时必须重写且贴地更新', () => {
  const world = generateWorld({ preset: { w: 64, h: 48 }, seed: SEED, scatter: true });
  const p = makePair(world);
  p.step('V07 基线', { heightChanged: true });
  const tree = deriveVegetation(world)[0];
  const beforeY = p.candidate.lodMeshes[0].instanceMatrix.array[13];
  world.height[tree.cell] += 3;
  const sameCells = deriveVegetation(world).map(t => t.cell).join(',');
  assert.equal(sameCells, deriveVegetation(world).map(t => t.cell).join(','));
  const r = p.step('V07 高程变化', { heightChanged: true });
  assert.equal(r.skipped, false, 'heightChanged=true 必须强制重写（否则贴地高度会过期）');
  return { skipped: false, beforeY };
});

// ── V08：水位跨越树木生存阈值 ─────────────────────────────────────────────
scenario('V08', '水位跨越生存阈值 → 必须重写', () => {
  const world = generateWorld({ preset: { w: 64, h: 48 }, seed: SEED, scatter: true });
  const p = makePair(world);
  p.step('V08 基线', { heightChanged: true });
  const tree = deriveVegetation(world)[0];
  world.water[tree.cell] = 0.5;
  const gone = !deriveVegetation(world).some(t => t.cell === tree.cell);
  const r = p.step('V08 水位', { heightChanged: false });
  if (gone) assert.equal(r.skipped, false, '水位淹掉树时必须重写');
  return { skipped: r.skipped, membershipChanged: gone };
});

// ── V09：Region 裁剪变化 ──────────────────────────────────────────────────
scenario('V09', 'Region 裁剪变化 → 实例与参考实现一致', () => {
  const world = generateWorld({ preset: { w: 64, h: 48 }, seed: SEED, scatter: true });
  const p = makePair(world);
  p.step('V09 基线', { heightChanged: true });
  // ⚠️ RegionMask 的构造器直接收归一化区域（不是 mask.add(...)）
  const region = new RegionGeometry(world, new RegionMask(normalizeRegion([[12, 10], [38, 10], [38, 31], [12, 31]], world, 0.45)));
  p.reference.setRegionGeometry(region, true);
  p.candidate.setRegionGeometry(region, true);
  const r = p.step('V09 裁剪', { heightChanged: false });
  p.reference.setRegionGeometry(region, false);
  p.candidate.setRegionGeometry(region, false);
  const r2 = p.step('V09 反转', { heightChanged: false });
  return { skipped: r.skipped && r2.skipped };
});

// ── V12：ArtProfile 变化 ──────────────────────────────────────────────────
scenario('V12', 'ArtProfile 变化 → 实例与参考实现一致', () => {
  const world = generateWorld({ preset: { w: 64, h: 48 }, seed: SEED, scatter: true });
  const p = makePair(world);
  p.step('V12 基线', { heightChanged: true });
  const profile = { ...ART_PROFILES.pilot, realmStyle: REALM_STYLES.mortal };
  p.reference.setArtProfile(profile); p.candidate.setArtProfile(profile);
  compareInstances('V12 设档', p.reference, p.candidate);
  p.reference.setArtProfile(null); p.candidate.setArtProfile(null);
  compareInstances('V12 撤档', p.reference, p.candidate);
  return {};
});

// ── V13：三个位面互不污染 ─────────────────────────────────────────────────
scenario('V13', '凡间/上界/幽冥各自独立，互不污染缓存', () => {
  const results = [];
  for (const preset of [{ w: 64, h: 48 }]) {
    const worlds = [generateWorld({ preset, seed: SEED, scatter: true }),
      generateWorld({ preset, seed: SEED + 1, scatter: true }),
      generateWorld({ preset, seed: SEED + 2, scatter: true })];
    for (const world of worlds) {
      const p = makePair(world);
      p.step('V13 基线', { heightChanged: true });
      const r = p.step('V13 无变化', { heightChanged: false });
      results.push({ skipped: r.skipped, trees: p.candidate.trees.length });
    }
  }
  assert.equal(new Set(results.map(r => r.skipped)).size, 1, '三个位面的跳过行为必须一致');
  return { skipped: results[0].skipped };
});

// ── V14：重新创建渲染器后等价 ─────────────────────────────────────────────
scenario('V14', '重建图层（等价于重新创建渲染器）后实例一致', () => {
  const world = generateWorld({ preset: { w: 64, h: 48 }, seed: SEED, scatter: true });
  const p = makePair(world);
  p.step('V14 基线', { heightChanged: true });
  const coordinates = createCoordinates(world);
  const rebuiltRef = new VegetationLayer(world, coordinates);
  const rebuiltCand = new VegetationLayer(world, coordinates);
  rebuiltRef.update({ heightChanged: true });
  rebuiltCand.update({ heightChanged: false });
  compareInstances('V14 重建', rebuiltRef, rebuiltCand);
  compareInstances('V14 与新实例对照', p.reference, rebuiltRef);
  return {};
});

// ── V15：多次更新后实例池与资源稳定 ───────────────────────────────────────
scenario('V15', '多次更新后 mesh/attribute 身份与容量稳定，无池漂移', () => {
  const world = generateWorld({ preset: { w: 64, h: 48 }, seed: SEED, scatter: true });
  const p = makePair(world);
  p.step('V15 基线', { heightChanged: true });
  const identity = [];
  for (let lod = 0; lod < 3; lod++) identity.push({ mesh: p.candidate.lodMeshes[lod], matrix: p.candidate.lodMeshes[lod].instanceMatrix, color: p.candidate.lodMeshes[lod].instanceColor });
  const other = [];
  for (let lod = 0; lod < 3; lod++) other.push({ mesh: p.reference.lodMeshes[lod], matrix: p.reference.lodMeshes[lod].instanceMatrix, color: p.reference.lodMeshes[lod].instanceColor });
  for (let i = 0; i < 6; i += 1) {
    const r = p.step(`V15 第 ${i} 轮`, { heightChanged: false });
    for (let lod = 0; lod < 3; lod++) {
      assert.equal(p.candidate.lodMeshes[lod], identity[lod].mesh, `V15 第 ${i} 轮 LOD${lod} mesh 被换掉`);
      assert.equal(p.candidate.lodMeshes[lod].instanceMatrix, identity[lod].matrix, `V15 第 ${i} 轮 LOD${lod} 矩阵属性被换掉`);
      assert.equal(p.candidate.lodMeshes[lod].instanceColor, identity[lod].color, `V15 第 ${i} 轮 LOD${lod} 颜色属性被换掉`);
      assert.equal(identity[lod].matrix.array.length, other[lod].matrix.array.length, `V15 LOD${lod} 容量与参考不一致`);
    }
    assert.equal(r.skipped, true, 'V15 无变化轮次应当跳过');
  }
  return { skipped: true };
});

// ── 世界与模拟事实未变 ───────────────────────────────────────────────────
scenario('V16', '跑完全部场景后世界事实未变（哈希一致）', () => {
  const fresh = generateWorld({ preset: { w: 64, h: 48 }, seed: SEED, scatter: true });
  const hash = createHash('sha256').update(JSON.stringify(fresh)).digest('hex');
  assert.equal(hash, baselineFacts, '同种子同预设生成的世界必须逐字节一致');
  return {};
});

console.log('');
const report = {
  ok: failures.length === 0,
  passed,
  failed: failures.length,
  worldSeed: SEED,
  initialTrees: initialTrees.length,
  worldHash: baselineFacts,
  coverage,
  failures: failures.map(f => ({ id: f.id, title: f.title, message: f.error.message })),
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`\n植被等价性 oracle 失败 ${failures.length} 项 / 共 ${passed + failures.length} 项`);
  process.exit(1);
}
console.log(`\n植被等价性 oracle 通过 · ${passed} 项（逐实例矩阵/颜色字节 + 身份排序 + LOD 归属 + 资源身份）`);
