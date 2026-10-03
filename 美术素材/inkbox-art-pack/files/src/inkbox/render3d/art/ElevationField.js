import { visualElevation } from '../terrain/VisualElevation.js';

/**
 * 一个位面的"最终高程"唯一来源（M2-B D3）。
 *
 * 默认参数（datum 0 / relief 1 / 无肩部）下与 `VisualElevation.surfaceElevation` 逐位相同——
 * 这是 M2-A 行为的恒等嵌入，由 `scripts/inkbox-render3d-art.mjs` 钉死。
 *
 *   base(i)   节点 i 的"目标界自己的"高程：datum + relief · V(height)
 *   nodeY(i)  写进网格的最终 Y：base，若在界缘肩部内则向墙顶 R 混合
 *   at(x, y)  任意点的地表高程，三角化与 Float32 取整方式与 TerrainMesh 完全一致
 *
 * 肩部（shoulder）只存在于"窗开着的目标界"：rimY[i] 是墙顶高程，rimW[i] ∈ [0,1] 是自由度
 * （0 = 钉死在墙顶，1 = 不受影响）。关窗即清除，网格回到 base。
 */
export class ElevationField {
  constructor(world, { datum = 0, relief = 1 } = {}) {
    this.world = world;
    this.datum = datum;
    this.relief = relief;
    this.rimY = null;
    this.rimW = null;
  }

  base(i) { return this.datum + this.relief * visualElevation(this.world.height[i]); }

  nodeY(i) {
    const b = this.base(i);
    const w = this.rimW;
    if (!w) return b;
    const k = w[i];
    return k >= 1 ? b : this.rimY[i] * (1 - k) + b * k;
  }

  at(x, y) {
    const world = this.world;
    x = Math.max(0, Math.min(world.w - 1, x));
    y = Math.max(0, Math.min(world.h - 1, y));
    const ix = Math.min(world.w - 2, Math.floor(x)), iy = Math.min(world.h - 2, Math.floor(y));
    const u = x - ix, v = y - iy, i = iy * world.w + ix;
    // 与 surfaceElevation 一致：先取 Float32，再插值（silhouette 处差一个 ulp 都会被看见）。
    const a = Math.fround(this.nodeY(i)), b = Math.fround(this.nodeY(i + 1));
    const c = Math.fround(this.nodeY(i + world.w)), d = Math.fround(this.nodeY(i + world.w + 1));
    return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  }

  setShoulder(rimY, rimW) { this.rimY = rimY; this.rimW = rimW; }
  clearShoulder() { this.rimY = null; this.rimW = null; }
  get hasShoulder() { return this.rimW !== null; }
}
