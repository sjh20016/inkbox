// World Laboratory · 通用纯统计函数
//
// ───────────────────────────────────────────────────────────────────────
// 为什么单独成文件
// ───────────────────────────────────────────────────────────────────────
//
// 委托书 §11 要求实验工具内部实现一组通用纯函数，并给出四条硬约束：
//   ① **无随机性**；② 有单元测试；③ **对空数组有明确行为**；④ **不产生 NaN 传播**。
//
// 第 ③④ 条是本文件存在的全部理由，也是最容易写错的地方：
//   · `Math.min(...[])` 是 `Infinity`、`Math.max(...[])` 是 `-Infinity`——
//     它们**不报错**，只会让后面每一个用到它的读数变成荒谬值；
//   · 除以 0 得 `NaN`，而 `NaN` 参与任何比较都是 `false`
//     （`NaN > 100` 是 false、`NaN < 0` 也是 false），
//     ⇒ 一条「超过阈值就报警」的诊断会**静默永不触发**；
//   · `JSON.stringify(NaN)` 写成 `null`，于是同一份结果存一次盘就换了形状。
//
// 所以本文件的约定是：**任何无法定义的结果一律返回 `null`，绝不返回 `NaN`
// 或 `Infinity`**。调用方必须显式处理 `null`——这是有意的摩擦：
// 让「这里没有数据」变成一个必须被看见的分支，而不是一个能混过所有比较的幽灵。
//
// ⚠️ 本文件**不得 import 任何模拟模块**，也**不得抽签**。
//    它是纯粹的数学，所以可以在实验框架之外被单独测试。

/**
 * 把一个候选值收敛成「有限数或 null」。
 * 所有导出函数都走它收口，这是「不产生 NaN 传播」的**唯一**兑现处。
 */
function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 把输入过滤成有限数数组。非数字 / NaN / Infinity 一律剔除，不参与计算。 */
function clean(values) {
  if (!Array.isArray(values)) return [];
  const out = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** 样本数。空数组 ⇒ 0。 */
export function count(values) {
  return clean(values).length;
}

/** 和。空数组 ⇒ `null`（不是 0——「没有数据」与「和为零」是两件事）。 */
export function sum(values) {
  const xs = clean(values);
  if (!xs.length) return null;
  let acc = 0;
  for (let i = 0; i < xs.length; i += 1) acc += xs[i];
  return acc;
}

/** 算术平均。空数组 ⇒ `null`。 */
export function mean(values) {
  const xs = clean(values);
  if (!xs.length) return null;
  let acc = 0;
  for (let i = 0; i < xs.length; i += 1) acc += xs[i];
  return acc / xs.length;
}

/** 最小值。空数组 ⇒ `null`（**不是 `Infinity`**）。 */
export function min(values) {
  const xs = clean(values);
  if (!xs.length) return null;
  let best = xs[0];
  for (let i = 1; i < xs.length; i += 1) if (xs[i] < best) best = xs[i];
  return best;
}

/** 最大值。空数组 ⇒ `null`（**不是 `-Infinity`**）。 */
export function max(values) {
  const xs = clean(values);
  if (!xs.length) return null;
  let best = xs[0];
  for (let i = 1; i < xs.length; i += 1) if (xs[i] > best) best = xs[i];
  return best;
}

/**
 * 分位数（线性插值，与 `numpy.percentile` 的默认口径同形）。
 *
 * @param {number[]} values
 * @param {number} p `0..1`。超出范围会被夹住——夹住而不是抛错，
 *   因为「p=1.0000001」这种浮点误差不该让整批实验失败。
 *   空数组 ⇒ `null`。
 */
export function percentile(values, p) {
  const xs = clean(values);
  if (!xs.length) return null;
  const q = Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0));
  if (xs.length === 1) return xs[0];
  const sorted = xs.slice().sort((a, b) => a - b);
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** 中位数。等价于 `percentile(values, 0.5)`。 */
export function median(values) {
  return percentile(values, 0.5);
}

/**
 * 总体标准差（分母 `n`，不是 `n-1`）。
 * 选总体口径的理由：这里每一组数都是**全量观测**（某个 seed 跑完全程的全部年份），
 * 不是从更大总体里抽的样本——用样本口径会引入一个没有意义的 `n/(n-1)` 修正。
 * 空数组 ⇒ `null`；单元素 ⇒ 0。
 */
export function stddev(values) {
  const xs = clean(values);
  if (!xs.length) return null;
  const m = mean(xs);
  let acc = 0;
  for (let i = 0; i < xs.length; i += 1) acc += (xs[i] - m) ** 2;
  return Math.sqrt(acc / xs.length);
}

/**
 * 变异系数 `σ / μ`（无量纲离散度）。
 * `μ === 0` ⇒ `null`（**不是 `Infinity`**）：零均值下这个比值没有定义。
 */
export function coefficientOfVariation(values) {
  const xs = clean(values);
  if (!xs.length) return null;
  const m = mean(xs);
  if (m === 0) return null;
  const sd = stddev(xs);
  return finiteOrNull(sd / m);
}

/**
 * 基尼系数（0 = 完全平均，1 = 完全集中）。
 *
 * 用「平均绝对差」公式 `G = ΣΣ|xi−xj| / (2n²μ)`——它比「洛伦兹曲线面积」
 * 写法短，且对 `n` 小时数值稳定。全部为 0 ⇒ 0（完全平均，**不是 null**：
 * 「所有人都一样穷」是一个定义良好的观测）；和为 0 但存在负数 ⇒ `null`。
 * 空数组 ⇒ `null`。
 */
export function gini(values) {
  const xs = clean(values);
  if (!xs.length) return null;
  let total = 0;
  for (let i = 0; i < xs.length; i += 1) {
    // ⚠️ 负数检查必须**排在** `total === 0` 之前。
    //    否则 `[1, -1]`（总和恰好为 0）会掉进「全为 0 ⇒ 完全平均」那一支，
    //    返回 0 —— 一个「两个人财富完全相等」的结论，而真相是这份数据
    //    根本不满足基尼系数的定义域。这正是本文件要防的那类**静默错答案**。
    if (xs[i] < 0) return null;
    total += xs[i];
  }
  if (total === 0) return 0;   // 全为 0：所有人都一样（一样穷），定义良好
  let acc = 0;
  for (let i = 0; i < xs.length; i += 1) {
    for (let j = 0; j < xs.length; j += 1) acc += Math.abs(xs[i] - xs[j]);
  }
  return finiteOrNull(acc / (2 * xs.length * xs.length * (total / xs.length)));
}

/**
 * 赫芬达尔-赫希曼指数 `HHI = Σ share_i²`，落在 `[1/n, 1]`。
 * 用途：判断「一宗长期控制多数灵脉」是自然霸权还是结构锁死。
 * 全为 0 / 空数组 ⇒ `null`（份额无定义）。
 */
export function hhi(values) {
  const xs = clean(values);
  if (!xs.length) return null;
  let total = 0;
  for (let i = 0; i < xs.length; i += 1) total += xs[i];
  if (!(total > 0)) return null;
  let acc = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const share = xs[i] / total;
    acc += share * share;
  }
  return finiteOrNull(acc);
}

/**
 * 香农熵（自然对数），单位 nat。均匀分布时取最大值 `ln(n)`。
 * 用途：宗门数量分布的「散度」——HHI 看头部，熵看整体。
 * 空数组 / 全 0 ⇒ `null`。
 */
export function entropy(values) {
  const xs = clean(values);
  if (!xs.length) return null;
  let total = 0;
  for (let i = 0; i < xs.length; i += 1) total += xs[i];
  if (!(total > 0)) return null;
  let acc = 0;
  for (let i = 0; i < xs.length; i += 1) {
    if (xs[i] <= 0) continue;   // `0·ln0` 按极限取 0，显式跳过
    const share = xs[i] / total;
    acc -= share * Math.log(share);
  }
  return finiteOrNull(acc);
}

/**
 * 最小二乘斜率（对 `y` 关于「下标」回归，即每步增量）。
 *
 * ⚠️ 自变量是**下标**而不是 `x` 值：调用方若要「每游戏年的变化率」，
 *    必须自己保证序列是等间隔的。本函数不猜间隔——猜错会静默给出错斜率。
 * `n < 2` ⇒ `null`（两点才能定一条线）；所有 `x` 相同（不可能，下标互异）
 * 也在 `n < 2` 里被挡住。
 */
export function slope(values) {
  const xs = clean(values);
  const n = xs.length;
  if (n < 2) return null;
  const meanX = (n - 1) / 2;
  const meanY = mean(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - meanX;
    num += dx * (xs[i] - meanY);
    den += dx * dx;
  }
  if (den === 0) return null;
  return finiteOrNull(num / den);
}

/**
 * 一组序列是否「单调不减」（允许平台）。空数组 / 单元素 ⇒ `true`（平凡成立）。
 * 用途：`monotonic_resource` 诊断——判断 spiritStone / provisions 是不是只增不减。
 */
export function isNonDecreasing(values) {
  const xs = clean(values);
  for (let i = 1; i < xs.length; i += 1) if (xs[i] < xs[i - 1]) return false;
  return true;
}

/** 一组序列是否「单调不增」。 */
export function isNonIncreasing(values) {
  const xs = clean(values);
  for (let i = 1; i < xs.length; i += 1) if (xs[i] > xs[i - 1]) return false;
  return true;
}

/**
 * 取序列的「后段」——诊断里的 `final_third` 窗口。
 * `fraction` 默认 1/3；`n === 0` ⇒ `[]`；至少取 1 个点（否则短实验的诊断会全部空转）。
 */
export function tail(values, fraction = 1 / 3) {
  const xs = clean(values);
  if (!xs.length) return [];
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 1 / 3));
  const k = Math.max(1, Math.ceil(xs.length * f));
  return xs.slice(xs.length - k);
}

/**
 * 序列的「相对漂移」：后段均值相对整段均值的偏离比例。
 * 整段均值为 0 ⇒ `null`（比值无定义）。
 * 用途：`entity_plateau` / `civil_plateau` 用它把「长期几乎不变」变成一个**无量纲**判据，
 * 从而不必把 1400 或别的游戏常量抄进诊断里。
 */
export function relativeDrift(values, fraction = 1 / 3) {
  const xs = clean(values);
  if (!xs.length) return null;
  const whole = mean(xs);
  if (whole === 0) return null;
  const seg = tail(xs, fraction);
  const segMean = mean(seg);
  if (segMean === null) return null;
  return finiteOrNull((segMean - whole) / Math.abs(whole));
}

/** 一组数摊成 `{count, mean, min, max, p10, p50, p90, stddev}`，全字段可含 `null`。 */
export function describe(values) {
  const xs = clean(values);
  return {
    count: xs.length,
    mean: mean(xs),
    min: min(xs),
    max: max(xs),
    p10: percentile(xs, 0.1),
    p50: percentile(xs, 0.5),
    p90: percentile(xs, 0.9),
    stddev: stddev(xs),
  };
}

export const statsInternals = Object.freeze({ clean, finiteOrNull });
