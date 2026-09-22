// 水墨沙盒 · 水文与侵蚀
//
// 水面用「浅水松弛」模型：每格水面 = 高程 + 水深，水从水面高的格子流向低的，
// 直到趋于水平。海洋由海平面自动补水，所以不会蒸发干。
// 侵蚀分两种：流水侵蚀（带走泥沙、在下游堆积成洲）与热力侵蚀（陡坡崩塌）。

import { SEA_LEVEL } from '../core/config.js';
import { clamp } from '../core/noise.js';
import {
  recomputeRect, markDirty, markDirtyWithNeighbors, flushDirty,
} from '../world/terrain.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 海洋补水：高程低于海平面的格子始终保持至少海平面水深 */
export function refillSea(world) {
  const { height, water } = world;
  for (let i = 0; i < world.size; i += 1) {
    if (height[i] < SEA_LEVEL) {
      const need = SEA_LEVEL - height[i];
      if (water[i] < need) {
        water[i] = need;
        markDirty(world, i);
      }
    }
  }
}

/** 河道基流：水系不会因为蒸发而断流，玩家的水库也会被河流慢慢灌满 */
export function maintainRivers(world) {
  const { riverBase, water } = world;
  let fed = 0;
  for (let i = 0; i < world.size; i += 1) {
    const base = riverBase[i];
    if (base <= 0) continue;
    if (water[i] < base) {
      water[i] = base;
      markDirty(world, i);
      fed += 1;
    }
  }
  return fed;
}

export function stepWater(world, dtDays, opts = {}) {
  const flowRate = opts.flowRate ?? 0.34;
  const evapRate = opts.evapRate ?? 0.00042;
  const { w, h, height, water, temp } = world;
  const delta = world._waterDelta && world._waterDelta.length === world.size
    ? world._waterDelta
    : (world._waterDelta = new Float32Array(world.size));
  delta.fill(0);

  let moved = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const depth = water[i];
      if (depth <= 0.0008) continue;
      const surface = height[i] + depth;
      for (let d = 0; d < 4; d += 1) {
        const nx = x + DIRS[d][0];
        const ny = y + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        const other = height[ni] + water[ni];
        if (other >= surface) continue;
        const head = surface - other;
        const amount = Math.min(depth * flowRate * 0.25, head * flowRate * 0.5);
        if (amount <= 0) continue;
        delta[i] -= amount;
        delta[ni] += amount;
        moved += amount;
      }
    }
  }

  if (moved > 0) {
    for (let i = 0; i < world.size; i += 1) {
      const d = delta[i];
      if (d === 0) continue;
      const next = water[i] + d;
      water[i] = next > 0 ? next : 0;
      // 水位只要动了就登记：哪怕是 1e-5 的变化也可能跨过「算不算水」的阈值
      markDirty(world, i);
    }
  }

  // 蒸发：越热越快；海洋由 refillSea 兜底，河道由基流兜底
  for (let i = 0; i < world.size; i += 1) {
    const depth = water[i];
    if (depth <= 0.0006) continue;
    if (height[i] < SEA_LEVEL) continue;
    if (world.riverBase[i] > 0) continue;
    water[i] = Math.max(0, depth - evapRate * dtDays * (0.35 + temp[i]));
  }

  if (moved > 0.0001) world.touch();
  return moved;
}

/** 流水侵蚀：水多坡陡处冲刷，下游平缓处沉积 */
export function stepErosion(world, dtDays, opts = {}) {
  const strength = opts.strength ?? 0.9;
  const { w, h, height, water } = world;
  const delta = world._erosionDelta && world._erosionDelta.length === world.size
    ? world._erosionDelta
    : (world._erosionDelta = new Float32Array(world.size));
  delta.fill(0);

  const rate = clamp(dtDays * 0.02 * strength, 0, 0.02);
  let touched = 0;

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const depth = water[i];
      if (depth < 0.002) continue;
      const hi = height[i];
      let lowest = -1;
      let lowestHeight = hi;
      let steepest = 0;
      for (let d = 0; d < 4; d += 1) {
        const ni = (y + DIRS[d][1]) * w + (x + DIRS[d][0]);
        const nh = height[ni];
        if (nh < lowestHeight) {
          lowestHeight = nh;
          lowest = ni;
        }
        const diff = hi - nh;
        if (diff > steepest) steepest = diff;
      }
      if (lowest < 0 || steepest <= 0.0015) continue;

      const flux = Math.min(1, depth * 14);
      const amount = Math.min(rate * flux * steepest * 6, steepest * 0.35, 0.0022);
      if (amount <= 1e-6) continue;

      // 陡坡冲刷更强，水下冲刷被抑制（保护海床）
      const submerged = height[i] < SEA_LEVEL - 0.02 ? 0.18 : 1;
      const take = amount * submerged;
      delta[i] -= take;
      // 泥沙落点：优先堆在最低邻格；若邻格有水，就地形成沙洲
      const deposit = take * 0.72;
      delta[lowest] += deposit;
      touched += 1;
    }
  }

  if (touched > 0) {
    for (let i = 0; i < world.size; i += 1) {
      const d = delta[i];
      if (d === 0) continue;
      height[i] = clamp(height[i] + d, 0, 1);
      markDirtyWithNeighbors(world, i);
    }
    world.touch();
  }
  return touched;
}

/** 热力侵蚀：陡坡崩塌，让玩家堆出的悬崖自然塌成山坡 */
export function stepThermal(world, dtDays, opts = {}) {
  const threshold = opts.threshold ?? 0.085;
  const rate = clamp(dtDays * 0.03, 0, 0.08);
  const { w, h, height } = world;
  const delta = world._thermalDelta && world._thermalDelta.length === world.size
    ? world._thermalDelta
    : (world._thermalDelta = new Float32Array(world.size));
  delta.fill(0);
  let touched = 0;

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const hi = height[i];
      for (let d = 0; d < 4; d += 1) {
        const ni = (y + DIRS[d][1]) * w + (x + DIRS[d][0]);
        if (ni < i) continue;
        const diff = hi - height[ni];
        if (Math.abs(diff) <= threshold) continue;
        const move = Math.min((Math.abs(diff) - threshold) * rate * 0.5, 0.0015);
        if (move <= 1e-6) continue;
        const dir = diff > 0 ? -1 : 1;
        delta[i] += dir * move;
        delta[ni] -= dir * move;
        touched += 1;
      }
    }
  }

  if (touched > 0) {
    for (let i = 0; i < world.size; i += 1) {
      const d = delta[i];
      if (d === 0) continue;
      height[i] = clamp(height[i] + d, 0, 1);
      markDirtyWithNeighbors(world, i);
    }
    world.touch();
  }
  return touched;
}

/** 组合推进：一次调用完成 补水 → 流动 → 蒸发 → 侵蚀 → 类型重算 */
export function stepHydrology(world, dtDays) {
  refillSea(world);
  maintainRivers(world);
  const moved = stepWater(world, dtDays);
  const eroded = stepErosion(world, dtDays);
  if (eroded > 0) stepThermal(world, dtDays);
  flushDirty(world);
  return { moved, eroded };
}

export { recomputeRect };
