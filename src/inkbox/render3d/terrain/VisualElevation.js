import { diagonalAD } from './topology.js';
import { SEA_LEVEL } from '../../core/config.js';

// Pure presentation mapping; no simulation threshold changes.
//
// ⚠️ M2-B §P5：本阶段**冻结**这个数学形式（线性项 / 二次项 / 整体倍率一律不动），
//    否则 datum / relief / shoulder / boundary 会一起变化，出问题无法归因。
//    全局山体风格调整留给 Art Pass。
export function visualElevation(height) {
  const d = height - SEA_LEVEL;
  return d * 38 + Math.max(0, d) ** 2 * 38;
}

/**
 * 三角插值**本体**。
 *
 * ⚠️ 这里是整个工程里**唯一**的插值实现：`surfaceElevation` 与
 *    `ElevationField.at()` 都走它（M2-B §8「禁止复制插值公式」）。
 *
 * `nodeAt(i)` 必须返回**已经 `Math.fround`** 的格点高程——Float32 位置属性
 * 在被插值之前就是这个精度，silhouette（山脊边缘）才不会漂。
 *
 * 三角剖分与 `TerrainMesh.gridGeometry()` 的 `a,c,b / b,c,d` 逐字一致：
 * `u + v <= 1` 走 a-b-c 三角形，否则走 b-c-d。
 *
 * @param {object} world 世界（只需 `w` / `h` / `height`）
 * @param {number} x 世界格坐标（可为小数）
 * @param {number} y 世界格坐标（可为小数）
 * @param {(i:number)=>number} nodeAt 按**格索引**取已 fround 的格点高程
 * @returns {number} 该点的渲染高度
 */
export function interpolateElevation(world, x, y, nodeAt) {
  x = Math.max(0, Math.min(world.w - 1, x));
  y = Math.max(0, Math.min(world.h - 1, y));
  const ix = Math.min(world.w - 2, Math.floor(x)), iy = Math.min(world.h - 2, Math.floor(y));
  const u = x - ix, v = y - iy, i = iy * world.w + ix;
  // Match Float32 position attributes before interpolation, especially at silhouettes.
  const a = nodeAt(i), b = nodeAt(i + 1), c = nodeAt(i + world.w), d = nodeAt(i + world.w + 1);
  if (diagonalAD(world,ix,iy)) return v >= u
    ? a + v*(c-a) + u*(d-c) : a + u*(b-a) + v*(d-b);
  return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
}

/**
 * M2-A 原始高程：凡间地表在 Render3D 里的高度。
 *
 * 这是 `ElevationField` 的 **base** 口径（`datum = 0` / `relief = 1` / 无 shoulder），
 * 也是 M2-A 及以前所有贴地 / 对焦读数的唯一口径。M2-B 之后生产代码应改走
 * `stage.elevation.at(x, y)`（§8 / S10），本函数保留为对照与测试基准。
 */
export function surfaceElevation(world, x, y) {
  return interpolateElevation(world, x, y, i => Math.fround(visualElevation(world.height[i])));
}
