// 水墨沙盒 · 修仙体系
//
// 数值全部移植自原作《坐天观井》（来源见每段注释），不是重新编的。
// 原作散落在 src/systems/cultivationSystem.js、cultivationTypeSystem.js、
// src/core/constants.js、src/data/spiritRoots.js 等处；这里把「一个修士身上
// 会发生什么」收敛到一个文件，好让沙盒的模拟循环只依赖这一处。
//
// 与原始的一处刻意差异：原作有「世界容量」「飞升目标世界」这类跨位面调度，
// 沙盒是单张地图，所以飞升被改成「离开此界 + 留下遗泽」，见 sim/cultivation.js。

import { clamp } from './noise.js';

// ── 境界 ─────────────────────────────────────────────────
// 来源：src/core/constants.js:4 REALMS；min/max 为等级区间。
// 凡间六阶 + 上界大乘，**并集表**（不按世界分表）：凡间实体永远到不了 60 以上
// （sim/cultivation.js 的天花板挡住突破、飞升闸门把人送走），所以
// `realmFor(level > 60)` 只可能被上界实体命中——显示 / 序号 / 寿元全部自动正确。
export const REALMS = Object.freeze([
  { key: 'lianqi', name: '炼气', min: 1, max: 9, lifespan: 110, color: '#6f7a63' },
  { key: 'zhuji', name: '筑基', min: 10, max: 19, lifespan: 240, color: '#5d7a72' },
  { key: 'jindan', name: '金丹', min: 20, max: 29, lifespan: 620, color: '#b08f3e' },
  { key: 'yuanying', name: '元婴', min: 30, max: 39, lifespan: 1500, color: '#6b4a6b' },
  { key: 'huashen', name: '化神', min: 40, max: 49, lifespan: 3600, color: '#3f5f7d' },
  // ⚠️ 合体上限**钉死字面量 60**，不许写 REALM_CAP：REALM_CAP 的语义是
  // 「表里最高的那一级」，加了上界大乘之后它是 69。若这里仍引用它，合体区间
  // 会一路涨到 69，realmLabel 的「大圆满」判据跟着上移，凡间所有人的境界显示
  // 整体漂掉。合体是「凡间之巅」，与上界天花板是两件事（INKBOX §九.14 第 1 条）。
  { key: 'heti', name: '合体', min: 50, max: 60, lifespan: 7600, color: '#a8493c' },
  // 上界境界（06 册：寿元万六千载，大乘大圆满为止）。跨度 max-min+1 = 9，
  // 正好走 realmLabel 的「X九层」分支（span <= 9），不会印出「大乘 65 重」
  // 这种绝对等级。跨度若 > 9 会掉进 `return \`${realm.name} ${level} 重\``。
  { key: 'dacheng', name: '大乘', min: 61, max: 69, lifespan: 16000, color: '#7d4fb8' },
]);

/**
 * 表里**最高的那一级**（= 上界大乘的大圆满 = 69）。语义已与「凡间天花板」解耦：
 * 凡间那档见 `MORTAL_CEILING` / `ceilingFor`。合体的 max 已钉死 60，不再引用它。
 * 原作 合体 max 为 999，沙盒里给一个可收敛的上限。
 */
export const REALM_CAP = REALMS[REALMS.length - 1].max;

/**
 * 凡间天花板 = 飞升门槛。**必须自己写 60 字面量，不许从 REALM_CAP 派生**——
 * 一旦派生，抬高 REALM_CAP 就会同时抬高凡间天花板，凡间再无人能飞升
 * （sim/cultivation.js 那段注释说的陷阱）。
 */
export const MORTAL_CEILING = 60;

/**
 * 按世界取修炼天花板。参数是 **plane 字符串**（`'mortal'` / `'upper'`），
 * 不是 world 对象：core/ 不能 import sim/，也不该 import world/。
 * 凡间 = 60（也是飞升门槛），上界 = 表里最高一级。
 */
export function ceilingFor(plane) {
  return plane === 'upper' ? REALM_CAP : MORTAL_CEILING;
}

// ── 跨界门槛（阶段四：三界并存）─────────────────────────────
/**
 * 天雷飞升的最低境界 = **化神期起点**（REALMS 里 huashen 的 min = 40）。
 *
 * 用户定的规矩：「高修为修士必须通过飞升来跨境，设定为化神期天雷事件」。
 * 所以化神期及以上（40 级起）不能再走空间裂缝，只能引天雷——
 * 一次**有风险**的渡劫，过了才跨界进上界（见 `sim/cultivation.js` 的
 * `stepThunderAscend`）。
 *
 * ⚠️ 与下面的 `RIFT_CROSS_MAX_LEVEL` **必须同值**，理由见那一条。
 */
export const THUNDER_ASCEND_MIN_LEVEL = 40;

/**
 * 空间裂缝不吸走此级及以上的生灵（必须走飞升）。
 *
 * ⚠️⚠️ **与 `THUNDER_ASCEND_MIN_LEVEL` 同值 40 是刻意的、承重的，不是巧合。**
 * 「裂隙通道无门槛」（任何生灵都有概率被缝吸走）与「高修为必须走飞升」
 * 这两条规则要在**同一个点上咬合**：裂隙的上界 = 飞升的下界。两种坏法都静默：
 *   · 若裂隙上界 **大于** 飞升下界（比如裂隙吸到 45、天雷从 40 起）——
 *     40~45 出现**重叠区**：高修为修士被裂隙吸走，绕过了本该有的天雷风险，
 *     「必须走飞升」这条规矩当场失效；
 *   · 若裂隙上界 **小于** 飞升下界（比如裂隙只吸到 35、天雷从 40 起）——
 *     35~40 出现**死区**：这些人既不能被裂缝吸走、又够不着天雷，
 *     卡在凡间什么也做不了（只能等修到 40）。
 * 两个常量**本该同源却各写各的**，正是本项目踩过的坑：见上面
 * `MORTAL_CEILING` 的注释（凡间天花板与飞升门槛一旦各写各的，就会出现
 * 「凡间再无人能飞升」这种不报错、不崩溃、断言全绿的坏死）。
 *
 * ⚠️ 本常量由 `sim/rifts.js` 从 `../core/cultivation.js` import，
 * **名字必须逐字一致**——这是与裂缝模块的接口。
 */
export const RIFT_CROSS_MAX_LEVEL = 40;

/**
 * 瓶颈：跨入这些等级的下一级时需要渡劫。来源 constants.js 的 BOTTLENECKS
 *
 * ⚠️ 追加了 `60`（跨入大乘 61 的那一步）。**故意用 60 而不是 59**：
 * 大乘 min = 61，所以「合体 → 大乘」这一步的起点是 60。加 60 **不污染凡间**——
 * 凡间修士在 60 就被天花板挡住、永远走不到「60 → 61」，而 59 → 60 不在表里、
 * 不触发天劫，凡间飞升的既有标定（INKBOX「800 年 33 位」）不变。
 * 若照某些旧稿加 59，凡间 59 → 60 会凭空多一道渡劫，推翻全部凡间基线。
 */
export const BOTTLENECKS = Object.freeze([9, 19, 29, 39, 49, 60]);

/** 每级所需修为 = level * EXP_PER_LEVEL。来源 src/core/config.js:17 */
export const EXP_PER_LEVEL = 32;

/** 突破基础成功率与灵根品质加成。来源 cultivationSystem.js:209 */
export const BREAKTHROUGH_BASE = 0.4;
export const BREAKTHROUGH_QUALITY_BONUS = 0.15;

export function realmIndexFor(level) {
  for (let i = REALMS.length - 1; i >= 0; i -= 1) {
    if (level >= REALMS[i].min) return i;
  }
  return 0;
}

export function realmFor(level) {
  return REALMS[realmIndexFor(level)];
}

/** 境界显示名。达到该阶上限时显示「大圆满」，来源 realmRules.js:10 */
export function realmLabel(level) {
  const realm = realmFor(level);
  if (level >= realm.max) return `${realm.name}大圆满`;
  // 刚好跨入该境界时说「金丹」而不是「金丹 20 重」，叙事里更顺
  if (level <= realm.min) return realm.name;
  const sub = level - realm.min + 1;
  const span = realm.max - realm.min + 1;
  if (span <= 9) return `${realm.name}${['一', '二', '三', '四', '五', '六', '七', '八', '九'][sub - 1] || sub}层`;
  return `${realm.name} ${level} 重`;
}

export function lifespanFor(level) {
  return realmFor(level).lifespan;
}

/** 突破成功额外获得的寿元（天）。来源 cultivationSystem.js:261 BREAKTHROUGH_LIFE_DAYS */
export const BREAKTHROUGH_LIFE_DAYS = 12000;

export function expToNext(level) {
  return Math.max(EXP_PER_LEVEL, level * EXP_PER_LEVEL);
}

export function isBottleneck(level) {
  return BOTTLENECKS.includes(level);
}

/**
 * 突破成功率。来源 cultivationSystem.js:204-244。
 *   chance = 0.4 + 品质*0.15 - min(0.2, 因果*0.025) + 气运加成 - 心魔惩罚 + 天劫修正
 * 注意因果这一项：正因果（作恶）扣分，负因果（积德）反而加分。
 *
 * ⚠️ 沙盒补充：原作还有「世界容量」「位面阶梯」在做上限，天灵根一路顺风
 * 也走不到头。沙盒是单张地图，没有这些闸门，所以补一项境界难度，
 * 否则天灵根（品质 4 → 0.4+0.6=1.0）会变成永不失败的永动机。
 */
export const REALM_DIFFICULTY_PER_LEVEL = 0.008;
export const REALM_DIFFICULTY_CAP = 0.35;

export function breakthroughChance({
  level = 1,
  quality = 2,
  karma = 0,
  fortune = 50,
  heartDemon = 0,
  omenBonus = 0,
  pollution = 0,
  equipBonus = 0,
} = {}) {
  const fortuneBonus = clamp((fortune - 50) / 500, -0.1, 0.1);
  const demonPenalty = Math.min(0.15, heartDemon * 0.005);
  const karmaTerm = Math.min(0.2, karma * 0.025);
  // 污染高的人道基已损，原作里 pollution>=70 直接禁止飞升，这里也给一点惩罚
  const pollutionPenalty = Math.min(0.2, Math.max(0, pollution - 40) * 0.005);
  // 前 10 级（炼气）不受影响，之后逐级加难
  const realmPenalty = Math.min(REALM_DIFFICULTY_CAP, Math.max(0, level - 10) * REALM_DIFFICULTY_PER_LEVEL);
  // 法宝的「渡劫」轴。**故意比灵气/灵根那些项小一号**：原作里装备对渡劫的
  // 修正量级就在 0.005~0.01 之间（equipmentSystem.js 的 tribulationBonus），
  // 这里沿用同一量级，只是换成直接读加成系数。夹到 ±0.06，
  // 免得一件绝品仙品法宝把渡劫变成必过。
  const equipTerm = clamp(equipBonus, -0.06, 0.06);
  const raw = BREAKTHROUGH_BASE
    + quality * BREAKTHROUGH_QUALITY_BONUS
    - karmaTerm
    + fortuneBonus
    - demonPenalty
    + omenBonus
    - pollutionPenalty
    - realmPenalty
    + equipTerm;
  return clamp(raw, 0.05, 1);
}

// ── 灵根 ─────────────────────────────────────────────────
// 来源：src/core/constants.js:2（五行）、createGameKernel.js:242（品质）
export const ELEMENTS = Object.freeze(['金', '木', '水', '火', '土']);
export const QUALITIES = Object.freeze(['劣', '中', '良', '优', '天']);

/**
 * 灵根数量分布。
 *
 * ⚠️ 诚实标注：原作 `spiritRootRules.js:5` 只留下 `ratiosFor` 的数组
 * `[4,3,2,1,1]`，没留下它与「元素个数」的对应关系（单元素→X灵根，
 * 多元素→X主杂灵根 这条命名规则是明确的）。这里按修仙常识定：
 * 元素越少越精纯、越稀有，元素越多越驳杂、越常见。
 * 另有一个旁证——bloodlineSystem 里「万象血脉」的触发条件是
 * `quality <= 1`（品质低），而它的描述是「包容万象，可容纳多种元素」，
 * 说明低品质 = 元素多。方向与这里一致。
 */
export const ELEMENT_COUNT_WEIGHTS = Object.freeze([2, 5, 9, 8, 6]);

/** 元素个数 → 品质分布。同样依据「元素越少品质越高」这条旁证。 */
const QUALITY_BY_ELEMENT_COUNT = Object.freeze([
  null,
  [0.15, 0.5, 0.35],       // 1 个元素 → 良 / 优 / 天
  [0.35, 0.5, 0.15],       // 2 个元素 → 中 / 良 / 优
  [0.5, 0.45, 0.05],       // 3 个元素 → 劣 / 中 / 良
  [0.75, 0.25],            // 4 个元素 → 劣 / 中
  [0.9, 0.1],              // 5 个元素 → 劣 / 中
]);
/** 上表每档品质映射回 QUALITIES 的下标起点 */
const QUALITY_FLOOR = Object.freeze([0, 2, 1, 0, 0, 0]);

/**
 * 变异灵根。来源 src/data/spiritRoots.js:5-46，共 23 种，
 * 稀有度只有 rare / legendary 两档。
 */
export const MUTATED_ROOTS = Object.freeze([
  { name: '雷灵根', rarity: 'rare', element: '金', bonus: 0.06, note: '雷霆入体，突破时更易引动天劫' },
  { name: '冰灵根', rarity: 'rare', element: '水', bonus: 0.06, note: '心性冷定，心魔难生' },
  { name: '毒灵根', rarity: 'rare', element: '木', bonus: 0.05, note: '所过之处草木枯败' },
  { name: '暗灵根', rarity: 'rare', element: '水', bonus: 0.05, note: '气息隐没，不易被仇家寻见' },
  { name: '光灵根', rarity: 'rare', element: '火', bonus: 0.06, note: '污秽难侵，污染积累减半' },
  { name: '风灵根', rarity: 'rare', element: '木', bonus: 0.06, note: '身法迅捷，行走如风' },
  { name: '剑灵根', rarity: 'rare', element: '金', bonus: 0.08, note: '天生剑修，杀伐果决' },
  { name: '丹灵根', rarity: 'rare', element: '火', bonus: 0.05, note: '亲近丹道，寿元绵长' },
  { name: '阵灵根', rarity: 'rare', element: '土', bonus: 0.05, note: '心眼自成经纬' },
  { name: '魂灵根', rarity: 'rare', element: '水', bonus: 0.05, note: '神识强横，却易生心魔' },
  { name: '九天雷灵根', rarity: 'legendary', element: '金', bonus: 0.14, note: '天劫为其助力而非劫数' },
  { name: '玄冰灵根', rarity: 'legendary', element: '水', bonus: 0.12, note: '心魔不生，寿元悠长' },
  { name: '幽冥灵根', rarity: 'legendary', element: '水', bonus: 0.12, note: '与幽冥相通，死后易成鬼修' },
  { name: '天光灵根', rarity: 'legendary', element: '火', bonus: 0.13, note: '万法不侵，污染难沾' },
  { name: '空间灵根', rarity: 'legendary', element: '土', bonus: 0.13, note: '可越山河而行' },
  { name: '时间灵根', rarity: 'legendary', element: '土', bonus: 0.15, note: '修行一日抵他人旬月' },
  { name: '天眷灵根', rarity: 'legendary', element: '木', bonus: 0.16, note: '天道偏爱，气运加身' },
  { name: '混沌灵根', rarity: 'legendary', element: '火', bonus: 0.15, note: '可吞万法，却也最易堕落' },
  { name: '噬灵根', rarity: 'legendary', element: '木', bonus: 0.14, note: '能夺他人修为，为正道所不容' },
  { name: '阴阳灵根', rarity: 'legendary', element: '水', bonus: 0.13, note: '可结道侣双修' },
  { name: '星辰灵根', rarity: 'legendary', element: '金', bonus: 0.13, note: '夜半修行事半功倍' },
  { name: '生命灵根', rarity: 'legendary', element: '木', bonus: 0.13, note: '草木随身而荣' },
  { name: '轮回灵根', rarity: 'legendary', element: '土', bonus: 0.15, note: '带着前世碎片降生' },
]);

const MUTATED_RARE = MUTATED_ROOTS.filter((r) => r.rarity === 'rare');
const MUTATED_LEGENDARY = MUTATED_ROOTS.filter((r) => r.rarity === 'legendary');

/** 变异灵根总出现率（rare 3%、legendary 0.6%） */
export const MUTATED_RATE = Object.freeze({ rare: 0.03, legendary: 0.006 });

function pickWeighted(rng, weights) {
  let total = 0;
  for (let i = 0; i < weights.length; i += 1) total += weights[i];
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * 掷一个灵根。
 * @returns {{elements:string[], quality:number, rootName:string, mutated:object|null, bonus:number}}
 *   quality 是 QUALITIES 的下标（0=劣 … 4=天）。
 */
export function rollSpiritRoot(rng) {
  const roll = rng();
  if (roll < MUTATED_RATE.legendary) {
    const mutated = MUTATED_LEGENDARY[Math.floor(rng() * MUTATED_LEGENDARY.length)];
    return {
      elements: [mutated.element],
      quality: 4,
      rootName: mutated.name,
      mutated,
      bonus: mutated.bonus,
    };
  }
  if (roll < MUTATED_RATE.legendary + MUTATED_RATE.rare) {
    const mutated = MUTATED_RARE[Math.floor(rng() * MUTATED_RARE.length)];
    return {
      elements: [mutated.element],
      quality: 3,
      rootName: mutated.name,
      mutated,
      bonus: mutated.bonus,
    };
  }

  const count = pickWeighted(rng, ELEMENT_COUNT_WEIGHTS) + 1;
  const pool = ELEMENTS.slice();
  const elements = [];
  for (let n = 0; n < count && pool.length; n += 1) {
    elements.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  const tier = QUALITY_BY_ELEMENT_COUNT[count];
  const quality = clamp(QUALITY_FLOOR[count] + pickWeighted(rng, tier), 0, 4);
  // 命名规则来源 spiritRootRules.js:7：单元素→「X灵根」，多元素→「X主杂灵根」
  const rootName = elements.length === 1
    ? `${elements[0]}灵根`
    : `${elements[0]}主杂灵根`;
  return { elements, quality, rootName, mutated: null, bonus: quality * 0.02 };
}

// ── 道途 ─────────────────────────────────────────────────
// 来源：src/systems/cultivationTypeSystem.js，9 支正途 + 3 支邪修。
// stageThresholds 为该支修为累积到多少时晋阶。
export const DAO_PATHS = Object.freeze([
  { key: 'sword', name: '剑修', evil: false, chance: 0.025, stages: ['剑意初悟', '剑心通明', '剑域自成'], thresholds: [0, 25, 50], note: '以剑入道，杀伐第一' },
  { key: 'body', name: '体修', evil: false, chance: 0.03, stages: ['铁骨铮铮', '铜皮玉骨', '金刚不坏'], thresholds: [0, 25, 55], note: '不修法宝，只炼肉身' },
  { key: 'alchemy', name: '丹修', evil: false, chance: 0.028, stages: ['丹师', '丹宗', '丹王'], thresholds: [0, 30, 60], note: '以丹入道，寿元绵长' },
  { key: 'talisman', name: '符修', evil: false, chance: 0.022, stages: ['符师', '符宗', '符圣'], thresholds: [0, 28, 58], note: '一纸符箓，可移山填海' },
  { key: 'formation', name: '阵修', evil: false, chance: 0.02, stages: ['阵师', '阵宗', '阵道宗师'], thresholds: [0, 30, 60], note: '布阵者，以天地为棋盘' },
  { key: 'artifact', name: '器修', evil: false, chance: 0.03, stages: ['养器', '融器', '器灵合一'], thresholds: [0, 28, 55], note: '人器两忘' },
  { key: 'sound', name: '音修', evil: false, chance: 0.02, stages: ['知音', '入律', '天音'], thresholds: [0, 25, 50], note: '琴音可乱人心神' },
  { key: 'buddha', name: '佛修', evil: false, chance: 0.02, stages: ['沙弥', '罗汉', '金刚'], thresholds: [0, 30, 60], note: '不杀生，却最难缠' },
  { key: 'spirit', name: '灵修', evil: false, chance: 0.025, stages: ['通灵', '御灵', '万灵之主'], thresholds: [0, 28, 55], note: '与万灵相通' },
  { key: 'blood', name: '血修', evil: true, chance: 0.04, stages: ['凝血', '化血', '血神'], thresholds: [0, 28, 55], note: '以血为引，速成而伤天和' },
  { key: 'corpse', name: '尸修', evil: true, chance: 0.035, stages: ['控尸', '炼尸', '尸王'], thresholds: [0, 28, 55], note: '驱尸为兵，人皆惧之' },
  { key: 'soul', name: '魂修', evil: true, chance: 0.035, stages: ['噬魂', '炼魂', '魂帝'], thresholds: [0, 30, 58], note: '噬人神魂以自壮，必遭反噬' },
]);

export const DAO_BY_KEY = Object.freeze(
  Object.fromEntries(DAO_PATHS.map((d) => [d.key, d])),
);

/** 世界每 30 天判定一次道途觉醒。来源 cultivationTypeSystem.js:398 */
export const DAO_AWAKEN_INTERVAL_DAYS = 30;

/** 按阶段阈值取当前阶名 */
export function daoStageName(path, progress) {
  if (!path) return null;
  let idx = 0;
  for (let i = 0; i < path.thresholds.length; i += 1) {
    if (progress >= path.thresholds[i]) idx = i;
  }
  return path.stages[idx];
}

// ── 天劫 ─────────────────────────────────────────────────
// 来源：src/systems/tribulationOmenSystem.js:4-45。五种异象各带成功率修正。
export const TRIBULATION_OMENS = Object.freeze([
  { key: 'purple', name: '紫气东来', weight: 0.25, bonus: 0.2, note: '紫气自东方来，此劫易渡' },
  { key: 'darkcloud', name: '黑云压城', weight: 0.25, bonus: -0.3, note: '黑云压顶，天地同悲' },
  { key: 'thunder', name: '五雷轰顶', weight: 0.15, bonus: -0.5, note: '五雷齐落，十死无生' },
  { key: 'skylight', name: '天光垂落', weight: 0.2, bonus: 0.4, note: '如有神助，此劫易渡' },
  { key: 'allworship', name: '万灵朝拜', weight: 0.15, bonus: 0.1, note: '万灵俯首，此乃天眷' },
]);

export function rollOmen(rng) {
  const total = TRIBULATION_OMENS.reduce((sum, o) => sum + o.weight, 0);
  let roll = rng() * total;
  for (const omen of TRIBULATION_OMENS) {
    roll -= omen.weight;
    if (roll <= 0) return omen;
  }
  return TRIBULATION_OMENS[0];
}

/** 天劫失败的三档后果阈值。来源 cultivationSystem.js:315-388 */
export const TRIBULATION_FAILURE_TIERS = Object.freeze([
  { below: 0.5, kind: 'regress', label: '境界倒退' },
  { below: 0.8, kind: 'drop', label: '跌落本阶' },
  { below: 1.0, kind: 'mad', label: '走火入魔' },
]);

/** 走火入魔持续的游戏秒数。来源 cultivationSystem.js MAD_SECONDS:30 */
export const MAD_SECONDS = 30;

/** 突破失败后的心魔增幅。来源 cultivationSystem.js:371 */
export const HEART_DEMON_ON_FAILURE = 15;

// ── 心魔 ─────────────────────────────────────────────────
// 来源：src/systems/heartDemonSystem.js。≥50 且距上次 ≥10 年才可能显现。
export const HEART_DEMON_THRESHOLD = 50;
export const HEART_DEMON_COOLDOWN_DAYS = 3600;

export const HEART_DEMON_FORMS = Object.freeze([
  { key: 'kin', name: '逝去亲人', note: '它用你最想见的那张脸说话' },
  { key: 'master', name: '师父幻影', note: '「你修的不是我教你的道。」' },
  { key: 'self', name: '曾经的自己', note: '「你答应过不变成这样。」' },
  { key: 'rival', name: '宿敌', note: '它笑着，像当年那样' },
  { key: 'lover', name: '道侣幻影', note: '「你连我什么时候走的都记不清了。」' },
]);

/** 心魔显现概率：min(0.03 + 超出量*0.02, 0.2)。来源 heartDemonSystem.js:220 */
export function heartDemonChance(heartDemon) {
  const excess = Math.max(0, heartDemon - HEART_DEMON_THRESHOLD);
  return Math.min(0.03 + excess * 0.02, 0.2);
}

/** 心魔判定：意志 vs 魔念。来源 heartDemonSystem.js:137-139 */
export function resolveHeartDemon(level, heartDemon, rng) {
  const demonPower = heartDemon * 0.6 + rng() * 20;
  const will = level * 2 + heartDemon * 0.1 + rng() * 25;
  return { win: will >= demonPower, demonPower, will };
}

// ── 道心试炼 ─────────────────────────────────────────────
// 来源：src/systems/daoHeartTrialSystem.js:4-9（触发）、150-159（判定）、
// 以及 5 类问道题目。
export const DAO_TRIALS = Object.freeze([
  { key: 'why', question: '你为何修道？' },
  { key: 'what', question: '何为道？' },
  { key: 'love', question: '道与情，孰重？' },
  { key: 'longevity', question: '长生是否值得？' },
  { key: 'power', question: '力量的意义是什么？' },
]);

export const DAO_TRIAL_TRIGGERS = Object.freeze([
  { key: 'breakthrough', label: '突破大境界', chance: 0.3 },
  { key: 'friendDeath', label: '挚友陨落', chance: 0.5 },
  { key: 'calamity', label: '天地大劫', chance: 0.2 },
  { key: 'century', label: '修行百年', chance: 0.25 },
]);

export const DAO_TRIAL_MIN_LEVEL = 15;
export const DAO_TRIAL_MAX_PER_LIFE = 3;
export const DAO_TRIAL_COOLDOWN_DAYS = 50 * 360;

export function resolveDaoTrial(level, heartDemon, rng) {
  const will = level * 2 + heartDemon * -0.5 + rng() * 30;
  const threshold = 40 + rng() * 30;
  if (will > threshold + 20) return { tier: 'firm', will, threshold };
  if (will > threshold) return { tier: 'shift', will, threshold };
  return { tier: 'shake', will, threshold };
}

// ── 因果 / 气运 / 污染 ───────────────────────────────────
export const KARMA_MIN = -100;
export const KARMA_MAX = 100;
/** |因果| ≥ 10 时每年可能触发报应或报恩。来源 karmaSystem.js:88-96 */
export const KARMA_EVENT_THRESHOLD = 10;

export const POLLUTION_ASCEND_LIMIT = 70;

export function pollutionLabel(pollution) {
  if (pollution >= 70) return '蚩影缠身';
  if (pollution >= 45) return '道基受损';
  if (pollution >= 20) return '沾染浊气';
  return '清净';
}

export { clamp };
