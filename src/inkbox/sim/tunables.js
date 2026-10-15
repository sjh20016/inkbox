// 水墨沙盒 · 可调参数注册表（B1-5 参数敏感性实验的机制基础）
//
// ───────────────────────────────────────────────────────────────────────
// 这个文件要解决的核心问题：**参数敏感性实验需要改数值，但 B0/B1 边界禁止
// 「为了跑实验而改源码常量」**
// ───────────────────────────────────────────────────────────────────────
//
// 模拟里的平衡常量（`life.js` 的 `POP_SOFT_CAP = 1400`、`FIELD_YIELD_PER_DAY`、
// `BIRTH_PER_CAPITA_DAY`…，`reincarnation.js` 的 `SOUL_CAP`…）原本都是模块级
// `const`。要回答「世界对这些参数有多敏感」，必须能**在两次运行之间**改变它们，
// 但又**不能**：
//   · 改源码再跑（= 改了默认值，违反边界精神，且产物的 `sourceRevision`
//     与实际行为不一致，无法复现）；
//   · 改完忘记改回来（会**静默**污染后续所有实验）。
//
// 所以本文件提供一个**注册表**：
//   · 每个可调参数在这里登记 `name → default`（**default 就是原来的常量值**）；
//   · 模拟代码改成 `tunable('POP_SOFT_CAP')` 读取；
//   · 实验层用 `setTunables(overrides)` 在一个**作用域**内覆盖，
//     作用域结束（或显式 `resetTunables()`）后**必然**回到默认。
//
// ───────────────────────────────────────────────────────────────────────
// 三条不变量（自检会钉死，见 `scripts/inkbox-experiment-selftest.mjs`）
// ───────────────────────────────────────────────────────────────────────
//
//   §B1-5(A) **零覆盖 ≡ 默认**：`tunable(k)` 在无覆盖时**恒等于** `default`，
//            逐字节可证明（跑一遍 world digest 与 natural 基线比对）。
//   §B1-5(B) **未知键当场抛错**：`setTunables({ 拼错的键: 1 })` 必须抛，
//            不得静默忽略（静默忽略会让「跑的不是你要的」永远查不出来）。
//   §B1-5(C) **作用域隔离**：覆盖只在 `withTunables` 的同步回调里生效，
//            退出后全局读值必然复原（即使回调抛错）。
//
// ⚠️ 本注册表**不改任何默认值**。B1-5 的产物是「**候选改动建议**」，
//    不是改动本身——改默认值是 B1-5 之后、需人工拍板的事。
// ⚠️ 见 `docs/TUNABLES.md` 了解如何新增一个可调参数。

/**
 * 可调参数表：`name → { default, note, unit }`。
 *
 * ⚠️ `default` **必须**与该参数在重构前的常量值**逐位相同**。
 *    改动 `default` = 改动世界，必须在报告里显式声明并重跑全部基线。
 */
const REGISTRY = Object.freeze({
  // ── 凡间人口（life.js）──────────────────────────────────────────────
  POP_SOFT_CAP: {
    default: 1400,
    unit: '人',
    note: '全世界生灵总量软上限。B1-1/B1-3 已证明它表现得像硬约束（注入 900 人后仍精确回到 1400）。',
  },
  BIRTH_PER_CAPITA_DAY: {
    default: 0.00075,
    unit: 'births/person/day',
    note: '每名村民每天的生育期望。凡人寿元约 4200 天，维持人口需 1/4200 ≈ 2.4e-4，取 7.5e-4 留冗余。',
  },
  SPLIT_PER_DAY: {
    default: 0.00016,
    unit: 'prob/village/day',
    note: '满员的村子每天分家外迁的概率（约合每 30 年一次）。',
  },
  FIELD_YIELD_PER_DAY: {
    default: 0.03,
    unit: 'food/tile/day',
    note: '每一亩田每天的产出。B1-1 观测到粮食长期过剩（food_high_floor warning）。',
  },
  VILLAGE_CAPACITY_BASE: {
    default: 10,
    unit: '人/村',
    note: '村庄人口上限 = BASE + 等级 × 10。',
  },
  VILLAGE_ABSORB_RADIUS: {
    default: 9,
    unit: '格',
    note: '村庄吸纳流民与自愈的半径。',
  },
  WILDLIFE_TARGET: {
    default: 35,
    unit: '只',
    note: '荒野灵兽的目标存量。',
  },
  WILDLIFE_POP_CAP: {
    default: 2200,
    unit: '只',
    note: '灵兽总量上限。',
  },
  BEAST_AGGRO_RANGE: {
    default: 5,
    unit: '格',
    note: '灵兽的领地半径：超出这个距离就不再追杀。早先不限距离时九十头灵兽能在四十年内把人口吃干净。',
  },
  SECT_FOUND_MIN_LEVEL: {
    default: 10,
    unit: '级',
    note: '开山立派的最低境界（life.js 侧判定）。',
  },

  // ── 神魂池（reincarnation.js）──────────────────────────────────────
  SOUL_CAP: {
    default: 120,
    unit: '魂',
    note: '神魂池上限。B1-1/B1-2 观测到长期贴顶并持续逐出（soul_pool_saturation）。',
  },

  // ── 宗门经济（sects.js）────────────────────────────────────────────
  SECT_CAPACITY_BASE: {
    default: 10,
    unit: '人',
    note: '宗门容量基数。',
  },
  SECT_FOUNDER_MIN_LEVEL: {
    default: 10,
    unit: '级',
    note: '开宗立派的最低境界（sects.js 侧判定）。',
  },
  SECT_SPIRIT_STONE_RATE: {
    default: 0.02,
    unit: '1/day/收入点',
    note: '灵石入账系数：`spiritStone += 收入 × dtDays × 此值`。B1-2/B1-3 观测到后段仍单调增长（possible_missing_sink）。',
  },
  SECT_PROVISIONS_RATE: {
    default: 0.03,
    unit: '1/day/村',
    note: '粮草入账系数：`provisions += 村数 × dtDays × 此值`。**纯增长，无消耗**（唯一的「消耗」是 starving 的稳定度惩罚，并不扣粮草）⇒ 疑为「缺汇」。',
  },

  // ── 上界（upperLife.js）─────────────────────────────────────────────
  UPPER_POP_CAP: {
    default: 300,
    unit: '人',
    note: '上界（非凡人）人口上限。',
  },
  NETHER_SOUL_CAP: {
    default: 400,
    unit: '魂',
    note: '幽冥鬼魂总量上限。',
  },
});

/** 所有合法键（冻结，供校验用）。 */
export const TUNABLE_NAMES = Object.freeze(Object.keys(REGISTRY));

/** 当前作用域内的覆盖值。空对象 = 无覆盖（读值 = default）。 */
let overrides = Object.create(null);

/** 最近的 `withTunables` 调用是否在栈上（用于检测误用：裸 setTunables 后忘记 reset）。 */
let scopeDepth = 0;

/**
 * 读一个可调参数。无覆盖时返回 `default`（**逐位相同**）。
 *
 * ⚠️ 未知键**当场抛错**——静默返回 undefined 会让整个模拟悄悄用 NaN 跑完。
 */
export function tunable(name) {
  if (!(name in REGISTRY)) {
    throw new Error(`未知可调参数「${name}」；已登记：${TUNABLE_NAMES.join(', ')}`);
  }
  return name in overrides ? overrides[name] : REGISTRY[name].default;
}

/** 取某参数的默认值（不读覆盖）。报告用。 */
export function tunableDefault(name) {
  if (!(name in REGISTRY)) {
    throw new Error(`未知可调参数「${name}」；已登记：${TUNABLE_NAMES.join(', ')}`);
  }
  return REGISTRY[name].default;
}

/** 取某参数的元信息副本（default / unit / note）。报告用。 */
export function tunableMeta(name) {
  if (!(name in REGISTRY)) {
    throw new Error(`未知可调参数「${name}」；已登记：${TUNABLE_NAMES.join(', ')}`);
  }
  return { name, ...REGISTRY[name] };
}

/** 当前是否有活跃覆盖（报告 / 自检用）。 */
export function tunablesActive() {
  return Object.keys(overrides).length > 0;
}

/** 当前覆盖的只读快照（报告 / 自检用）。 */
export function currentOverrides() {
  return { ...overrides };
}

/**
 * 在一个**同步作用域**内施加覆盖，退出时（含抛错）必然复原。
 *
 * ⚠️ 只允许同步回调：模拟是同步的（`advanceWorld` 一次调用跑完一年），
 *    若允许 async 回调，异步任务会在覆盖已复原之后读到错值。
 *    这里**不**支持 async —— 传 async 函数会得到 Promise，值在 await 前就已复原，
 *    于是读到错误的值而不报错。调用方必须自己保证同步。
 *
 * @param {object} patch  覆盖表（键必须是 TUNABLE_NAMES 的子集）
 * @param {() => any} fn  同步回调
 * @returns {any} fn 的返回值
 */
export function withTunables(patch, fn) {
  assertPatch(patch);
  const saved = overrides;
  // 叠加到当前覆盖之上（支持嵌套），而不是替换——否则内层会悄悄丢掉外层。
  const next = Object.assign(Object.create(null), saved, patch);
  overrides = next;
  scopeDepth += 1;
  try {
    return fn();
  } finally {
    scopeDepth -= 1;
    overrides = saved;
  }
}

/**
 * 显式设置覆盖（**不推荐**，只给「一年一步、跨调用」的实验用）。
 *
 * ⚠️ 用 `withTunables` 优先。裸 `setTunables` 必须配 `resetTunables()`，
 *    否则覆盖会**泄漏**到后续所有实验，而产物看起来完全正常。
 */
export function setTunables(patch) {
  assertPatch(patch);
  overrides = Object.assign(Object.create(null), overrides, patch);
}

/** 清空所有覆盖，回到默认。 */
export function resetTunables() {
  overrides = Object.create(null);
  scopeDepth = 0;
}

/** 校验覆盖表：键必须合法，值必须是有限数。 */
function assertPatch(patch) {
  if (patch == null || typeof patch !== 'object') {
    throw new Error(`覆盖表必须是对象；收到 ${typeof patch}`);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in REGISTRY)) {
      throw new Error(`未知可调参数「${k}」；已登记：${TUNABLE_NAMES.join(', ')}`);
    }
    const def = REGISTRY[k].default;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`可调参数「${k}」的覆盖值必须是有限数；收到 ${JSON.stringify(v)}`);
    }
    // 人口类参数必须是正整数（取整语义）。其余只要求有限正数（=0 会让世界静止）。
    if (Number.isInteger(def) && !Number.isInteger(v)) {
      throw new Error(`可调参数「${k}」默认是整数（${def}），覆盖值也必须是整数；收到 ${v}`);
    }
    if (v <= 0) {
      throw new Error(`可调参数「${k}」的覆盖值必须 > 0；收到 ${v}（=0 会让相关机制静止，不是合法实验）`);
    }
  }
}
