import { recomputeRect } from '../../world/terrain.js';

// The only render3d world write boundary. A stamp reads a stable neighbourhood.
//
// ⚠️⚠️ B0.3（§15 / §16）：高程写完之后**必须**走 canonical 重算（`recomputeRect`）。
//    否则 `world.type` / `world.qi` 会留在**旧**高度上，而这在玩家眼里是看得见的：
//    `Render3DAdapter.render()` 的读数面板直接显示 `viewedWorld.type[...]`，
//    所以削平一座山之后，面板会继续说那里是「山峰」。
//
//    审计实测（`scripts/_m2b-sculpt-audit.mjs`，96×72 seed 616161、笔刷 r=8）：
//      · 单笔 raise（190 格）⇒ canonical 重算翻出 **16 格 type / 13 格 qi** 差异
//        （最大 |Δqi| 1.6e-1）；
//      · 一整笔拖动（18 次落笔 / 3260 格次）⇒ **173 格 / 166 格**；
//      · 对照组 `sim/powers.js` 的 canonical sculpt 再重算 ⇒ **0 格**差异
//        （证明重算幂等、差异确实来自「漏调」）。
//
//    ⚠️ 修复纪律（§16）：复用 `world/terrain.js` 的 canonical API（`recomputeRect`，
//    它自己会带 1 格外扩修正坡度并 `world.touch()`）；**不复制**地形分类公式、
//    **不新增 RNG**、**不改 Canvas 规则**、**不改三界概率**、**不改 save schema**。
//
// ⚠️ 表现层纪律（P4）：这里写 `world.height` 是**玩家主动雕刻**这一个动作本身，
//    不是把视觉参数反写模拟。Render3D 的任何 datum / relief / shoulder / wallHeight
//    都**不得**经由此处回流（那属于 S5 的停止条件）。
export function sculpt(world, { x, y, radius = 6, strength = 0.035, mode = 'raise', targetHeight }) {
  if (![x, y, radius, strength].every(Number.isFinite) || radius <= 0 || strength < 0) throw new Error('Invalid brush');
  if (!['raise', 'lower', 'flatten', 'smooth'].includes(mode)) throw new Error('Unknown sculpt mode');
  if (mode === 'flatten' && !Number.isFinite(targetHeight)) throw new Error('Flatten requires a stroke target');
  const x0 = Math.max(0, Math.ceil(x - radius)), x1 = Math.min(world.w - 1, Math.floor(x + radius));
  const y0 = Math.max(0, Math.ceil(y - radius)), y1 = Math.min(world.h - 1, Math.floor(y + radius));
  const changes = [];
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const distance = Math.hypot(cx - x, cy - y);
    if (distance >= radius) continue;
    const i = cy * world.w + cx, old = world.height[i];
    const falloff = (1 - (distance / radius) ** 2) ** 2;
    let next;
    if (mode === 'raise' || mode === 'lower') next = old + (mode === 'raise' ? 1 : -1) * strength * falloff;
    else {
      let target = targetHeight;
      if (mode === 'smooth') {
        let sum = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && nx < world.w && ny >= 0 && ny < world.h) { sum += world.height[ny * world.w + nx]; count++; }
        }
        target = sum / count;
      }
      next = old + (target - old) * Math.min(1, strength * 8 * falloff);
    }
    next = Math.fround(Math.max(0, Math.min(1, next)));
    if (next !== old) changes.push([i, next, old]);
  }
  for (const [i, value] of changes) world.height[i] = value;
  if (!changes.length) return null;
  // canonical 派生量重算：type / qi 必须跟着新高度走（含 world.touch()）。
  recomputeRect(world, x0, y0, x1, y1);
  return { x0, y0, x1, y1, count: changes.length, changes };
}

/**
 * Undo 的高度还原。
 *
 * ⚠️ 它同样住在「唯一的 render3d 世界写边界」里，理由与 `sculpt` 相同（§16 明确要求
 *    「undo 后派生量也正确恢复」）。实测：只还原高度而不重算，会留下 23 格 type /
 *    20 格 qi 的失真；补一次 canonical 重算即可完全复原——所以这不是玩法问题，
 *    就是漏调 canonical API。
 *
 * @param {object} world
 * @param {Array<[number, number]>} changes `[格索引, 原高度]`（`Render3DAdapter` 的撤销栈）
 * @returns {{x0:number,y0:number,x1:number,y1:number,count:number}|null} 受影响矩形
 */
export function restoreHeights(world, changes) {
  if (!Array.isArray(changes) || changes.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [i, value] of changes) {
    world.height[i] = value;
    const x = i % world.w, y = (i - x) / world.w;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  recomputeRect(world, x0, y0, x1, y1);
  return { x0, y0, x1, y1, count: changes.length };
}

export function strokeSamples(from, to, radius) {
  const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / Math.max(0.5, radius * 0.25)));
  return Array.from({ length: count }, (_, i) => ({ x: from.x + (to.x - from.x) * (i + 1) / count, y: from.y + (to.y - from.y) * (i + 1) / count }));
}
