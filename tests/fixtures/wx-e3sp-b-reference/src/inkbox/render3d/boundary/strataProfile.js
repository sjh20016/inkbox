/**
 * M2-B B2 · Raw / Strata 垂直表现（§34–§39 / §47）。
 *
 * 本文件只做**表现层**的事：把「凡间边界高程 M」与「目标界该处高程 T」换算成
 * 界缘的表现高度。它不写世界、不抽 RNG、不碰任何概率（P1 / P3 / S5）。
 *
 * ⚠️⚠️ 命名纪律（P2 / §47）：本文件里的 `datum` / `relief` / `hMin` / `hCap` /
 *    `rawGap` / `visualDepth` 全是**表现量**。它们**不是**镇压强度、不是封印强度、
 *    不是泄漏概率、不是鬼爬出难度。正式玩家 UI 里也**不得**出现「镇压厚度」这类
 *    机制性文案——那些机制目前根本不存在（未来 Gameplay 包另立独立派生量）。
 *
 * ⚠️ S4：本阶段**冻结**全局 `visualElevation()`（线性项 / 二次项 / 倍率一律不动）。
 *    这里只在其之上叠加 datum / relief / shoulder，出问题才能归因到单个变量。
 */

/** 本阶段保留的两种垂直语言（§34）。`abstract` 只在需要时临时比较（§40）。 */
export const BOUNDARY_MODES = Object.freeze(['raw', 'strata']);

/**
 * Mode R · Raw —— 工程基线：`datum = 0 / relief = 1 / shoulder = none`。
 * 此时目标界高程**就是** M2-A 的原始高程，界缘墙暴露的就是真实高差。
 */
export const RAW_BOUNDARY = Object.freeze({ mode: 'raw', datum: 0, relief: 1, hMin: 0, hCap: 0, shoulderK: 0 });

/**
 * Mode S · Strata 的**实验初值**（§35）。
 *
 * ⚠️ 这些数字**不是正式常量**，是起手式：必须通过真实浏览器截图调整（§35 / §41）。
 *    改它们只影响表现，不影响模拟。
 */
export const STRATA_BOUNDARY = Object.freeze({
  mode: 'strata',
  datum: 30,        // D ≈ 30：上界整体抬起
  relief: 0.6,      // relief ≈ 0.6：目标界自身起伏被压平一些
  hMin: 8,          // Hmin ≈ 8：最小净空，避免贴在一起看不出断层
  hCap: 26,         // Hcap ≈ 26：净空上限（tanh 饱和）
  shoulderK: 5,     // shoulder K ≈ 5 格：边界之外多远回到 T
});

export function boundarySpec(mode, sign) {
  const spec = mode === 'strata' ? STRATA_BOUNDARY : RAW_BOUNDARY;
  return Object.freeze({ ...spec, sign });
}

/**
 * 边界净空 H 与边界高程 R（§36）。
 *
 * ```text
 * g = sign * (T - M)
 * H = Hmin + Hcap * tanh(max(g, 0) / Hcap)
 * R = M + sign * H
 * ```
 *
 * `sign = +1` 上界（天柱：边界比凡间**高**）、`sign = -1` 幽冥（地井：边界比凡间**低**）。
 * `max(g, 0)` 保证「目标界本来就比凡间低（对上方而言）」时不倒挂——
 * 净空至少是 `Hmin`，方向永远由 `sign` 决定。
 *
 * @param {{M:number, T:number, sign:number, hMin:number, hCap:number}} input
 * @returns {number} 净空 H
 */
export function boundaryClearance({ M, T, sign, hMin, hCap }) {
  const g = sign * (T - M);
  // hCap = 0 的退化情形（Raw 不用它）不要除零。
  const saturated = hCap > 0 ? hCap * Math.tanh(Math.max(g, 0) / hCap) : 0;
  return hMin + saturated;
}

/** 边界高程 R = M + sign * H（§36）。 */
export function boundaryElevation({ M, T, sign, hMin, hCap }) {
  return M + sign * boundaryClearance({ M, T, sign, hMin, hCap });
}

/** 目标界在边界处「本该」是多少（§36 的 T）。 */
export function targetBoundaryBase({ datum, relief, baseElevation }) {
  return datum + relief * baseElevation;
}

function smoothstep(edge0, edge1, value) {
  if (edge1 <= edge0) return value <= edge0 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * 构造目标位面的 **shoulder 场**（§37 / §38）。
 *
 * 语义：Region **边缘**上目标高度 = `R`；离边缘达到 `K` 格后恢复 `T`；
 * 中间用 smoothstep 过渡。它**只改目标位面的表现高度**——凡间地形保持真实。
 *
 * 实现：从边界边的两个端点节点出发，把该节点的 `R` 沿 4 邻域**向内**传播，
 * 同时记录节点距离；权重 `1 - smoothstep(0, K, d)`。
 *
 * ⚠️ 只在 **Region identity / 预设 / 地图尺寸**变化时构建一次（§38）。
 *    绝不每帧重算——这也是 `RealmBoundaryLayer` 与 `PlaneStage` 缓存键的依据。
 *
 * @param {object} options
 * @param {object} options.world 目标界 world
 * @param {object} options.regionGeometry `RegionGeometry`（区域派生真相）
 * @param {object} options.mortalElevation 凡间 `ElevationField`（题面里的 M 来源）
 * @param {object} options.targetElevation 目标界 `ElevationField`（只读它的 `baseNode`）
 * @param {object} options.spec `boundarySpec()` 的产物
 * @returns {{band:number, weight:Float32Array, edge:Float32Array, distance:Uint8Array, shoulder:Function, stats:object}}
 */
export function buildRealmBoundaryField({ world, regionGeometry, mortalElevation, targetElevation, spec }) {
  if (!world || !regionGeometry || !mortalElevation || !targetElevation) {
    throw new Error('buildRealmBoundaryField: world / regionGeometry / 两侧 ElevationField 都是必需的');
  }
  const w = world.w, size = world.size;
  const UNKNOWN = 255;
  const weight = new Float32Array(size);
  const edge = new Float32Array(size).fill(NaN);
  const distance = new Uint8Array(size).fill(UNKNOWN);
  const band = Math.max(1, spec.shoulderK | 0);
  const queue = [];

  const seed = (x, y, d, value) => {
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return;
    const i = y * w + x;
    if (distance[i] !== UNKNOWN) return;
    distance[i] = d;
    if (Number.isFinite(value)) edge[i] = value;
    queue.push(i);
  };

  // ── 种子：每条边界边的两个端点节点 ──
  let seeded = 0;
  for (const { ax, ay, bx, by } of regionGeometry.boundaryEdges()) {
    for (const [x, y] of [[ax, ay], [bx, by]]) {
      const i = y * w + x;
      if (distance[i] !== UNKNOWN) continue;         // 该节点已经种过
      const M = mortalElevation.node(x, y);
      const T = targetBoundaryBase({ datum: spec.datum, relief: spec.relief, baseElevation: targetElevation.baseNode(x, y) });
      const R = boundaryElevation({ M, T, sign: spec.sign, hMin: spec.hMin, hCap: spec.hCap });
      seed(x, y, 0, R);
      seeded += 1;
    }
  }

  // ── 向内传播 R（4 邻域，只到 band 步）──
  let head = 0;
  while (head < queue.length) {
    const i = queue[head];
    head += 1;
    const d = distance[i];
    if (d >= band) continue;
    const x = i % w, y = (i - x) / w;
    const value = edge[i];
    seed(x + 1, y, d + 1, value);
    seed(x - 1, y, d + 1, value);
    seed(x, y + 1, d + 1, value);
    seed(x, y - 1, d + 1, value);
  }

  // ── 权重：边缘 1，band 之外 0（smoothstep 过渡，§37）──
  let covered = 0;
  for (let i = 0; i < size; i += 1) {
    const d = distance[i];
    if (d === UNKNOWN) continue;
    weight[i] = 1 - smoothstep(0, band, d);
    if (weight[i] > 0) covered += 1;
  }

  const indexOf = (x, y) => {
    const cx = Math.max(0, Math.min(world.w - 1, Math.trunc(x)));
    const cy = Math.max(0, Math.min(world.h - 1, Math.trunc(y)));
    return cy * w + cx;
  };

  return {
    band, weight, edge, distance,
    mode: spec.mode, sign: spec.sign,
    /** 该节点的 shoulder 权重（1 = 完全用 R，0 = 完全用 T）。 */
    weightAt(x, y) { return weight[indexOf(x, y)]; },
    /** 该节点处传播过来的边界高程 R（可能为 NaN = 未被覆盖）。 */
    edgeAt(x, y) { return edge[indexOf(x, y)]; },
    /**
     * 直接挂到 `ElevationField` 的 profile 上用的 shoulder 函数：
     * 入参是**已经过 datum / relief 映射**的高度。
     */
    shoulder(value, x, y) {
      const i = indexOf(x, y);
      const t = weight[i];
      if (!(t > 0)) return value;
      const e = edge[i];
      if (!Number.isFinite(e)) return value;
      return value * (1 - t) + e * t;
    },
    stats: { band, seededNodes: seeded, coveredNodes: covered },
  };
}
