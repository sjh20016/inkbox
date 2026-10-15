import { visualElevation, interpolateElevation, surfaceElevation } from './VisualElevation.js';

/**
 * M2-B 表现基础：Render3D 的**高程单源**。
 *
 * 职责只有一件：把「世界格高程」映射成「渲染高度」，并且对外**只留这一个入口**。
 * 以前 `surfaceElevation(world, x, y)` 散落在 11 个 Layer 里（Terrain / Water /
 * Vegetation / Entity / Settlement / Marker / SelectionMarker / BrushOverlay /
 * ThreeFx / Host.focusOn / Slab），每个 Layer 都得自己拿 world、自己知道该贴哪张图。
 * M2-B 之后它们只问 `stage.elevation`。
 *
 * 三组口径，务必分清：
 *
 *   · `node` / `nodeForHeight` —— **格点**高程，顶点直写用（TerrainMesh、WaterLayer）。
 *   · `at`                    —— **三角插值**高程，贴地 / 拾取 / 相机对焦用。
 *   · `base*`                 —— **M2-A 原始数学**（datum=0 / relief=1 / 无 shoulder），
 *                                只作对照与测试基准；生产路径不再直接用它。
 *
 * ⚠️ 全是**表现量**（P2）：`datum` / `relief` / `shoulder` 不是镇压强度、不是封印强度、
 *    不是泄漏概率、不是鬼爬出难度。正式玩家 UI 也不得出现「镇压厚度」这类机制文案。
 * ⚠️ **禁止反写模拟**（P4 / §39）：任何情况下都不许 `world.height[i] = 本文件的产物`。
 *    这里是只读映射；唯一允许写 world.height 的地方是 `terrain/sculpt.js` 那个边界。
 *
 * ⚠️ 身份保证（§7 / T0）：默认 profile 下 `at()` 必须与 M2-A 的 `surfaceElevation()`
 *    **逐位一致**，`node()` 必须与 `visualElevation()` 逐位一致。所以 RAW 路径
 *    直接短路到原函数，绝不经过 `datum + relief * base` 这类算术——`relief = 1`
 *    的乘法虽然数学上恒等，但对 `-0` 的符号位不保证逐位一致，而 silhouette 就吃这个。
 */

/** M2-A 原始口径：不做任何垂直表现映射。 */
export const RAW_ELEVATION_PROFILE = Object.freeze({ datum: 0, relief: 1, shoulder: null });

/** 把外部传入的 profile 收敛成冻结对象；等价于原始口径时归一到同一个单例。 */
export function normalizeElevationProfile(profile) {
  if (!profile) return RAW_ELEVATION_PROFILE;
  const datum = Number.isFinite(profile.datum) ? profile.datum : 0;
  const relief = Number.isFinite(profile.relief) ? profile.relief : 1;
  const shoulder = profile.shoulder || null;
  if (datum === 0 && relief === 1 && !shoulder) return RAW_ELEVATION_PROFILE;
  return Object.freeze({ datum, relief, shoulder });
}

export class ElevationField {
  constructor(world, profile = RAW_ELEVATION_PROFILE) {
    if (!world) throw new Error('ElevationField: world is required');
    this.world = world;
    this.setProfile(profile);
  }

  /** @returns {object} 归一化后的 profile（便于 Stage 判断是否需要重建几何）。 */
  setProfile(profile) {
    this.profile = normalizeElevationProfile(profile);
    // RAW 是**唯一**允许短路的模式：它必须与 M2-A 逐位一致。
    this.raw = this.profile === RAW_ELEVATION_PROFILE;
    return this.profile;
  }

  // ── base：M2-A 原始数学 ────────────────────────────────────────────────

  /** 按**高程值**取原始格点高度（WaterLayer 要对 `height + water` 求值）。 */
  baseNodeForHeight(height) { return visualElevation(height); }

  /** 按**格坐标**取原始格点高度。 */
  baseNode(x, y) {
    const w = this.world;
    const cx = Math.max(0, Math.min(w.w - 1, x | 0)), cy = Math.max(0, Math.min(w.h - 1, y | 0));
    return visualElevation(w.height[cy * w.w + cx]);
  }

  /** M2-A 原始三角插值。 */
  baseAt(x, y) { return surfaceElevation(this.world, x, y); }

  // ── 表现映射 ──────────────────────────────────────────────────────────

  /**
   * 把一个格点高程映射成渲染高度（**未 fround**，顶点直写由 Float32Array 截断）。
   *
   * `datum` / `relief` 是纯线性垂直表现量；`shoulder` 由 B2 在**目标界边缘**叠加，
   * B0 阶段恒为 null（§7 初始模式）。
   */
  nodeForHeight(height, x = 0, y = 0) {
    const base = visualElevation(height);
    if (this.raw) return base;
    const p = this.profile;
    let value = p.datum + p.relief * base;
    if (p.shoulder) value = p.shoulder(value, x, y);
    return value;
  }

  /** 按格坐标取映射后的格点高度（TerrainMesh 顶点直写用）。 */
  node(x, y) {
    const w = this.world;
    const cx = Math.max(0, Math.min(w.w - 1, x | 0)), cy = Math.max(0, Math.min(w.h - 1, y | 0));
    return this.nodeForHeight(w.height[cy * w.w + cx], cx, cy);
  }

  /**
   * 映射后的三角插值（贴地 / 拾取 / 相机对焦唯一入口）。
   *
   * RAW 模式直接走 M2-A 实现，保证逐位一致；否则用**同一个**插值本体，
   * 只把 `nodeAt` 换成映射版本——公式仍然只有一份。
   */
  at(x, y) {
    if (this.raw) return this.baseAt(x, y);
    return interpolateElevation(this.world, x, y, i => {
      const w = this.world, cx = i % w.w, cy = (i - cx) / w.w;
      return Math.fround(this.nodeForHeight(w.height[i], cx, cy));
    });
  }
}
