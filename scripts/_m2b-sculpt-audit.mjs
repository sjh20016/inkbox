#!/usr/bin/env node
// M2-B B0.3 一次性研究探针（§15）：3D sculpt 之后派生量还 canonical 吗？
//
// 判据：任何高程修改之后，`world.type` / `world.qi` 都必须等于「对新高度做一次
// canonical 重算」的结果。canonical 重算 = `world/terrain.js` 的 `recomputeRect`。
//
// 本探针**不改任何东西**，只报告差多少格。对照组是 Canvas canonical 编辑路径
// （`sim/powers.js` 的 sculpt，它自己会调 recomputeRect）。
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { sculpt as sculpt3D, strokeSamples, restoreHeights } from '../src/inkbox/render3d/terrain/sculpt.js';
import { recomputeRect } from '../src/inkbox/world/terrain.js';
import * as P from '../src/inkbox/sim/powers.js';

const SEED = 616161;
const PRESET = { w: 96, h: 72 };
const AT = { x: 48, y: 36 };
const RADIUS = 8;

function fresh() { return generateWorld({ preset: PRESET, seed: SEED, scatter: true }); }

function diffAfterCanonicalRecompute(world, rect) {
  const type = world.type.slice();
  const qi = world.qi.slice();
  recomputeRect(world, rect.x0, rect.y0, rect.x1, rect.y1);
  let typeDiff = 0, qiDiff = 0, qiMaxDelta = 0;
  for (let i = 0; i < world.size; i += 1) {
    if (world.type[i] !== type[i]) typeDiff += 1;
    const delta = Math.abs(world.qi[i] - qi[i]);
    if (delta !== 0) qiDiff += 1;
    if (delta > qiMaxDelta) qiMaxDelta = delta;
  }
  return { typeDiff, qiDiff, qiMaxDelta };
}

/** 覆盖全图比对（不只看笔刷矩形），用来确认「坏掉的范围」到底多大。 */
function globalDiff(world, typeSnapshot, qiSnapshot) {
  let typeDiff = 0, qiDiff = 0;
  for (let i = 0; i < world.size; i += 1) {
    if (world.type[i] !== typeSnapshot[i]) typeDiff += 1;
    if (world.qi[i] !== qiSnapshot[i]) qiDiff += 1;
  }
  return { typeDiff, qiDiff };
}

console.log('════ B0.3 · 3D sculpt 派生量审计 ════');
console.log(`world ${PRESET.w}×${PRESET.h} seed ${SEED} · 笔刷 (${AT.x},${AT.y}) r=${RADIUS}`);

// ── 对照组：Canvas canonical 编辑路径 ──────────────────────────────
{
  const world = fresh();
  const history = { records: [], record(w, i) { this.records.push([w, i]); } };
  const before = { type: world.type.slice(), qi: world.qi.slice() };
  const count = P.sculpt(world, AT.x, AT.y, RADIUS, 0.25, history);
  const touched = globalDiff(world, before.type, before.qi);
  console.log(`\n[对照组] Canvas powers.sculpt 改 ${count} 格`);
  console.log(`  修改后与修改前相比：type 差 ${touched.typeDiff} 格 · qi 差 ${touched.qiDiff} 格（这是**预期**的地形变化）`);
  const after = { type: world.type.slice(), qi: world.qi.slice() };
  const extra = diffAfterCanonicalRecompute(world, { x0: AT.x - RADIUS, y0: AT.y - RADIUS, x1: AT.x + RADIUS, y1: AT.y + RADIUS });
  console.log(`  再跑一次 canonical 重算 ⇒ 额外的 type 差 ${extra.typeDiff} 格 · qi 差 ${extra.qiDiff} 格`);
  console.log(`  ⇒ ${extra.typeDiff === 0 && extra.qiDiff === 0 ? '✅ canonical 路径自洽（重算是幂等的）' : '❌ 连 canonical 路径都不自洽'}`);
  void after;
}

// ── 实验组：render3d 的 sculpt ─────────────────────────────────────
{
  const world = fresh();
  const before = { type: world.type.slice(), qi: world.qi.slice() };
  const region = sculpt3D(world, { ...AT, radius: RADIUS, strength: 0.05, mode: 'raise' });
  const touched = globalDiff(world, before.type, before.qi);
  console.log(`\n[实验组] render3d sculpt（raise）改 ${region.count} 格`);
  console.log(`  修改后与修改前相比：type 差 ${touched.typeDiff} 格 · qi 差 ${touched.qiDiff} 格（这是**预期**的地形变化）`);
  const after3D = { type: world.type.slice(), qi: world.qi.slice() };
  const extra = diffAfterCanonicalRecompute(world, region);
  console.log(`  再跑一次 canonical 重算 ⇒ 额外的 type 差 ${extra.typeDiff} 格 · qi 差 ${extra.qiDiff} 格（最大 |Δqi| ${extra.qiMaxDelta.toExponential(3)}）`);
  console.log(`  ⇒ ${extra.typeDiff === 0 && extra.qiDiff === 0 ? '✅ 派生量已 canonical' : '❌ **派生量失真**：3D sculpt 没重算 type / qi'}`);
  void after3D;
}

// ── 实验组 2：连续笔画（真实拖动会连打很多笔）────────────────────────
{
  const world = fresh();
  const from = { x: AT.x - 14, y: AT.y - 10 }, to = { x: AT.x + 14, y: AT.y + 10 };
  let stamps = 0, cells = 0;
  let rect = null;
  for (const point of strokeSamples(from, to, RADIUS)) {
    const r = sculpt3D(world, { ...point, radius: RADIUS, strength: 0.03, mode: 'raise' });
    if (r) {
      stamps += 1; cells += r.count;
      rect = rect ? { x0: Math.min(rect.x0, r.x0), y0: Math.min(rect.y0, r.y0), x1: Math.max(rect.x1, r.x1), y1: Math.max(rect.y1, r.y1) } : r;
    }
  }
  const after = { type: world.type.slice(), qi: world.qi.slice() };
  recomputeRect(world, rect.x0, rect.y0, rect.x1, rect.y1);
  const extra = globalDiff(world, after.type, after.qi);
  console.log(`\n[实验组 2] 一整笔拖动 ${stamps} 次落笔 / ${cells} 格次`);
  console.log(`  canonical 重算后：type 差 ${extra.typeDiff} 格 · qi 差 ${extra.qiDiff} 格`);
  console.log(`  ⇒ ${extra.typeDiff === 0 && extra.qiDiff === 0 ? '✅ 派生量已 canonical' : '❌ **派生量失真**'}`);
}

// ── 实验组 3：undo 之后 ────────────────────────────────────────────
// ⚠️ 判据必须让「正确还原」和「从没更新过」**分开**：
//    先在中间做一次 canonical 重算（模拟修好之后的正常前进路径），再 undo。
//    否则派生量一直冻在原始值上，会比较出「差 0 格」的假绿。
{
  const world = fresh();
  const pristine = { height: world.height.slice(), type: world.type.slice(), qi: world.qi.slice() };
  const region = sculpt3D(world, { ...AT, radius: RADIUS, strength: 0.06, mode: 'lower' });
  recomputeRect(world, region.x0, region.y0, region.x1, region.y1);   // ← 中间这步是关键
  const sculpted = globalDiff(world, pristine.type, pristine.qi);
  console.log(`\n[实验组 3] sculpt 后 undo`);
  console.log(`  前进之后（派生量已 canonical）：与原始相比 type 差 ${sculpted.typeDiff} 格 · qi 差 ${sculpted.qiDiff} 格（预期非 0）`);

  // 走**真实**的 undo 路径（`Render3DAdapter.undo()` 现在调它）
  const restored = restoreHeights(world, region.changes.map(([i, , old]) => [i, old]));
  let heightSame = true;
  for (let i = 0; i < world.size; i += 1) if (world.height[i] !== pristine.height[i]) { heightSame = false; break; }
  const stale = globalDiff(world, pristine.type, pristine.qi);
  console.log(`  height 是否逐位还原：${heightSame ? '是' : '否'}（还原矩形 ${restored.x0},${restored.y0}–${restored.x1},${restored.y1}）`);
  console.log(`  ← 此时派生量：type 差 ${stale.typeDiff} 格 · qi 差 ${stale.qiDiff} 格`);

  // 反向对照：若把 undo 退回「只写高度、不重算」，差异必须重新出现——
  // 否则这组断言无判别力（它证明 red 确实来自漏重算）。
  const control = fresh();
  const controlRegion = sculpt3D(control, { ...AT, radius: RADIUS, strength: 0.06, mode: 'lower' });
  recomputeRect(control, controlRegion.x0, controlRegion.y0, controlRegion.x1, controlRegion.y1);
  for (const [i, , old] of controlRegion.changes) control.height[i] = old;
  control.touch();
  const naive = globalDiff(control, pristine.type, pristine.qi);
  console.log(`  [反向对照] 只写高度不重算 ⇒ type 差 ${naive.typeDiff} 格 · qi 差 ${naive.qiDiff} 格（这一条保证判据有判别力）`);
  console.log(`  ⇒ ${heightSame && stale.typeDiff === 0 && stale.qiDiff === 0
    ? '✅ undo 后派生量也正确'
    : '❌ **undo 后派生量仍失真**'}`);
}
