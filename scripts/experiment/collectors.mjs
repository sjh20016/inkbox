// World Laboratory · 采集器（委托书 §6 / §9 / §10）
//
// ───────────────────────────────────────────────────────────────────────
// 铁律：**只读**。不得抽 RNG、不得改 entity、不得改 world
// ───────────────────────────────────────────────────────────────────────
//
// 委托书 §6 给 collectors 的约束是三条「不得」，§15 把它升级成一条可验证的判据：
//
//   > 开启或关闭数据收集，**不应改变世界线**。
//
// 这条判据之所以必须存在，是因为「只读」这件事**靠读代码是看不出来的**：
//   · `netherEcoStats(nether)` 内部会调 `ensureNetherPopLog(nether)`，
//     而那个函数在 `popLog` 缺失时会**新建一个**——它是惰性初始化，会写 world；
//   · 任何一个 stats 函数只要顺手 `world.something ??= {}`，就会在
//     「采集器开着」的那条线上**多写一次 world**。
// 这两种写都**不会报错**，也不会当场改变任何读数——它们的代价在几百年后，
// 表现为「两条本该相同的世界线分叉了」。所以本文件不靠自律，靠
// `scripts/inkbox-experiment-selftest.mjs` 的 collector purity 测试反向证明。
//
// ⚠️ 本文件**不 import 任何会推进世界的模块**（`advance.js` / `life.js` /
//    `ecology.js` / `rifts.js` 的 `step*`）。只 import 纯读取的 stats 入口。
//
// ───────────────────────────────────────────────────────────────────────
// 关于「累计 flow」的诚实性（委托书 §10.A 明文要求）
// ───────────────────────────────────────────────────────────────────────
//
// §10.A 说：能安全读取则增加 `births cumulative` / `deaths cumulative` /
// `awakens cumulative`；**如果代码目前没有可靠累计 counter，不要通过两个
// snapshot 相减冒充精确 flow，记录为 unavailable。**
//
// 本文件核实的结果（这是审计结论，不是猜测）：
//   · `deaths cumulative` —— **有**：`world.deadLog.total`（`necrology.js` 维护，
//     单调递增，进存档，有「`deadLog.total - deadLog.evicted === world.dead.length`」
//     的不变量在守）。可直接读。
//   · `births cumulative` —— **没有**。全仓库检索 `bornLog` / `birthCount` /
//     `world.born` 均无写入点；凡间出生只在 `life.js` 里往 `world.entities`
//     里 push。⇒ 记 `unavailable`。
//   · `awakens cumulative` —— **没有**。旧长测里的 `mortalAwakened` 是**脚本自己**
//     逐年比对「去年是凡人、今年 level ≥ 1」算出来的（`inkbox-longrun.mjs:394-408`），
//     那是**测试夹具**，不是模拟里的 counter。⇒ 记 `unavailable`。
//
// 所以本文件**不产出** `birthsCumulative` / `awakensCumulative` 两个数，
// 而是把「它们不可得」这件事作为结构化字段放进 summary（见 `telemetryReport`）。
// 这不是偷懒：一个用 snapshot 相减冒充的假 flow 会让「每年出生 3.7 人」
// 这种读数出现在报告上，而它连方向都可能是错的（净变化 ≠ 出生数）。

import { REALMS, realmIndexFor, realmLabel } from '../../src/inkbox/core/cultivation.js';
import { reincarnationStats } from '../../src/inkbox/sim/reincarnation.js';
import { artifactStats } from '../../src/inkbox/sim/artifacts.js';
import { clanStats } from '../../src/inkbox/sim/family.js';
import { warStats } from '../../src/inkbox/sim/war.js';
import { possessionStats } from '../../src/inkbox/sim/possession.js';
import { riftStats } from '../../src/inkbox/sim/rifts.js';
import { wraithStats } from '../../src/inkbox/sim/wraiths.js';
import { netherEcoStats, netherItemStats, netherGhostStats } from '../../src/inkbox/sim/netherLife.js';
import { isUpperMortal } from '../../src/inkbox/sim/upperLife.js';
import { SPECIES } from '../../src/inkbox/core/config.js';
import { TIME } from '../../src/inkbox/core/config.js';
import { describe, gini, hhi, mean, min, max, percentile, sum } from './stats.mjs';

/** 采集器版本。改了任何一个读数的口径就 +1——报告要靠它判断「这份 CSV 可比吗」。 */
export const COLLECTOR_VERSION = '1.0.0';

// ───────────────────────────────────────────────────────────────────────
// 列清单：**唯一**一份（CSV 的列顺序与宽度都由它决定）
// ───────────────────────────────────────────────────────────────────────
//
// ⚠️ 委托书 §13：「列保持稳定。字段新增可以追加。不要随意改名。」
//    所以这份清单是**追加式**的：新增字段一律加在末尾，永不改名、永不删列。
//    改名会让所有历史报告与新报告**看起来都正常**，只是没法放在一起比——
//    那是最难发现的一类实验事故。

/** 年度快照的列（timeseries.csv）。 */
export const SNAPSHOT_COLUMNS = Object.freeze([
  // 身份与时间
  'seed', 'day', 'year',
  // A · 人口
  'popTotal', 'popMortals', 'popCultivators', 'popCultivatorShare', 'popWild',
  'popHighestLevel', 'popHighestRealm', 'popHighestRealmName',
  'popDeathsCum', 'popAscendedCum', 'popEvictedCum',
  // B · 聚落与粮食
  'villageCount', 'villagePopulation',
  'foodMin', 'foodMean', 'foodMax', 'foodP10', 'foodP90',
  // C · 修炼生态
  'cultivatorHighestLevel', 'qiMean', 'qiMin', 'qiMax',
  ...REALMS.map((_, i) => `realm${i}Count`),
  // D · 宗门
  'sectCount', 'sectPopulation', 'sectPopGini', 'sectPopHHI',
  'sectSpiritStoneTotal', 'sectSpiritStoneMax',
  'sectProvisionsTotal', 'sectProvisionsMax',
  'sectStabilityMean', 'sectReputationMean',
  // D · 灵脉
  'leylineTotal', 'leylineControlled', 'leylineUncontrolled',
  'leylineTopOwnerShare', 'leylineOwnerGini',
  // E · 魂与轮回
  'soulPool', 'soulReborn', 'soulRemembered', 'soulConflicted', 'soulDistinct',
  'soulCumulativeCreated',
  'soulRouteNatural', 'soulRouteLinger', 'soulRouteGhost', 'soulRouteWraith', 'soulRouteGone',
  // F · 上界
  'upperPopulation', 'upperMortals', 'upperCultivators',
  'upperHighestLevel', 'upperHighestRealm',
  ...REALMS.map((_, i) => `upperRealm${i}Count`),
  'upperArrivedCum', 'upperBornCum', 'upperDiedCum', 'upperThunderCum', 'upperSectCount',
  // G · 幽冥
  'netherGhosts', 'netherGhostCultivators', 'netherTopTier',
  'netherBornCum', 'netherDiedCum', 'netherEvictedCum',
  'netherClimbedOutCum', 'netherPossessedOutCum', 'netherConserved',
  'netherItemsAlive', 'netherItemsSpawnedCum', 'netherItemsFellInCum',
  'netherItemsLeakedOutCum', 'netherItemsDecayedCum', 'netherItemsConserved',
  // H · 三界跨界
  'riftActive', 'riftActiveUpper', 'riftActiveNether',
  'riftOpenedCum', 'riftClosedCum', 'riftLeakedCum', 'riftCrossedCum', 'riftLostCum',
  'wraithAlive', 'wraithDissolvedCum',
  'possessionSucceededCum', 'possessionFailedCum', 'possessionCrossPlaneCum',
  'possessionHauntedCum', 'possessionLiveCount',
  'ascendedTotal',
  // I · 战争 / 世家 / 法宝
  'warDeclaredCum', 'warResolvedCum', 'warDestroyedCum', 'warCasualtiesCum', 'warOngoing',
  'clanCount', 'clanMembers', 'clanFoundedCum', 'clanEndedCum', 'clanMaxGen',
  'artifactLive', 'artifactOnPeople', 'artifactGround',
  'artifactSpirits', 'artifactTravelled', 'artifactForgedCum',
]);

/**
 * 探针的列（probes.csv）。委托书 §9：探针只保存**少量轻量指标**，
 * 目的是防止年度快照漏掉短期饥荒 / 人口跌落 / 粮仓见底 / 突发污染 / 短期宗门危机。
 *
 * ⚠️ 「不要为了 probe 每 30 日序列化整个世界」——所以这里**没有** qi 层统计、
 *    没有 realm 分布、没有灵脉分布：那些要遍历整张地图或全部实体。
 *    探针的每一次遍历都是 O(实体数 + 聚落数 + 宗门数)，与快照的 O(地图格数) 差两个数量级。
 */
export const PROBE_COLUMNS = Object.freeze([
  'seed', 'day', 'year',
  'popTotal', 'popMortals', 'popCultivators', 'popWild',
  'villageCount', 'foodMin', 'foodMean', 'foodP10', 'foodEmptyCount',
  'sectCount', 'sectStabilityMin', 'riftActive',
]);

/** 布尔列（CSV 里写成 0 / 1，便于直接进分析工具）。 */
const BOOLEAN_COLUMNS = Object.freeze(new Set([
  'netherConserved', 'netherItemsConserved',
]));

/** 该列在 CSV 里的呈现形态。`null` 一律写成空串——**不写 0**。 */
export function columnKind(name) {
  if (BOOLEAN_COLUMNS.has(name)) return 'boolean';
  if (name === 'popHighestRealmName') return 'string';
  return 'number';
}

// ───────────────────────────────────────────────────────────────────────
// 内部小工具（全是纯读）
// ───────────────────────────────────────────────────────────────────────

/** 聚落粮食分布。**只读** `world.villages`。 */
function foodDistribution(world) {
  const foods = [];
  for (let i = 0; i < world.villages.length; i += 1) foods.push(world.villages[i].food);
  return {
    count: foods.length,
    min: min(foods),
    mean: mean(foods),
    max: max(foods),
    p10: percentile(foods, 0.1),
    p90: percentile(foods, 0.9),
    // 「粮仓见底」的判据用 **0**（`life.js:1494` 的 `clamp(food, 0, 400)` 的下界）。
    // ⚠️ 这是一个**从数据本身导出**的阈值，不是抄来的游戏常量：
    //    委托书 §12 明说「不要把 400 复制为隐藏常量」——0 是夹取下界，
    //    它由 `life.js` 的 clamp 定义，本文件不新增任何阈值。
    empty: foods.filter((f) => f <= 0).length,
  };
}

/** 灵脉归属分布。`leyline.owner === 0` 表示无主（`World.js:addLeyline` 的缺省）。 */
function leylineDistribution(world) {
  const total = world.leylines.length;
  let controlled = 0;
  const perSect = new Map();
  for (let i = 0; i < world.leylines.length; i += 1) {
    const owner = world.leylines[i].owner;
    if (!owner) continue;
    controlled += 1;
    perSect.set(owner, (perSect.get(owner) || 0) + 1);
  }
  // ⚠️ 份额的分母是 **controlled**，不是 total。
  //    用 total 会把「有主灵脉全都归一家」稀释成 0.3 之类的小数，
  //    于是「一宗独霸」看起来像「三分天下」——口径错误会让结论反向。
  let topShare = null;
  if (controlled > 0) {
    let top = 0;
    for (const n of perSect.values()) if (n > top) top = n;
    topShare = top / controlled;
  }
  // 基尼按**全部宗门**的持脉数算（含 0）——只算有脉的宗门会漏掉
  // 「一半宗门一条脉都没有」这个最重要的不平等来源。
  const owned = world.factions.map((s) => s.leylines.length);
  return {
    total,
    controlled,
    uncontrolled: total - controlled,
    topOwnerShare: topShare,
    ownerGini: gini(owned),
  };
}

/** 上界人口与境界分布。只读。 */
function upperDistribution(upper) {
  let mortals = 0;
  let cultivators = 0;
  let highest = 0;
  const byRealm = new Array(REALMS.length).fill(0);
  const list = upper.entities || [];
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (e.sp === SPECIES.BEAST || e.sp === SPECIES.SPIRIT) continue;
    if (isUpperMortal(e)) { mortals += 1; continue; }
    cultivators += 1;
    byRealm[realmIndexFor(e.level)] += 1;
    if ((e.level || 0) > highest) highest = e.level;
  }
  return { mortals, cultivators, highest, byRealm };
}

// ───────────────────────────────────────────────────────────────────────
// 快照（年度）
// ───────────────────────────────────────────────────────────────────────

/**
 * 采一次完整快照。**只读**。
 *
 * @param {object} lab `world-factory` 的产物
 * @returns {object} 键集合 == `SNAPSHOT_COLUMNS`
 */
export function collectSnapshot(lab) {
  const { world, upper, nether, seed } = lab;

  // ── A · 人口 ────────────────────────────────────────────────
  const cs = world.cultivationStats();
  const popTotal = world.entities.length;
  const deaths = world.deadLog || {};

  // ── B · 聚落与粮食 ──────────────────────────────────────────
  const food = foodDistribution(world);
  let villagePopulation = 0;
  for (let i = 0; i < world.villages.length; i += 1) villagePopulation += world.villages[i].pop;

  // ── C · 修炼生态（灵气层）───────────────────────────────────
  // ⚠️ 全层统计（含水面格）。这不是「灵气压力算法」，只是把已有的一层读出来
  //    （委托书 §10.C：「B0 暂时不添加新的灵气压力算法。只测当前系统。」）。
  const qiArr = world.qi;
  let qiSum = 0;
  let qiMin = Infinity;
  let qiMax = -Infinity;
  for (let i = 0; i < qiArr.length; i += 1) {
    const v = qiArr[i];
    qiSum += v;
    if (v < qiMin) qiMin = v;
    if (v > qiMax) qiMax = v;
  }
  const qiMean = qiArr.length ? qiSum / qiArr.length : null;
  const qiMinOut = Number.isFinite(qiMin) ? qiMin : null;
  const qiMaxOut = Number.isFinite(qiMax) ? qiMax : null;

  // ── D · 宗门 ────────────────────────────────────────────────
  const sects = world.factions;
  const sectPops = sects.map((s) => s.pop);
  const spiritStones = sects.map((s) => (s.resources && s.resources.spiritStone) || 0);
  const provisions = sects.map((s) => (s.resources && s.resources.provisions) || 0);
  const stabilities = sects.map((s) => s.stability);
  const reputations = sects.map((s) => s.reputation);
  const leylines = leylineDistribution(world);

  // ── E · 魂与轮回 ────────────────────────────────────────────
  const rein = reincarnationStats(world);
  const soulLog = world.soulLog || {};

  // ── F · 上界 ────────────────────────────────────────────────
  const up = upperDistribution(upper);
  const upLog = upper.popLog || {};

  // ── G · 幽冥 ────────────────────────────────────────────────
  const nEco = netherEcoStats(nether);
  const nItems = netherItemStats(nether);
  const nGhost = netherGhostStats(nether);

  // ── H · 三界跨界 ────────────────────────────────────────────
  const rifts = riftStats(world);
  let riftActiveUpper = 0;
  let riftActiveNether = 0;
  for (let i = 0; i < world.rifts.length; i += 1) {
    const r = world.rifts[i];
    if (r.closedDay >= 0) continue;
    if (r.targetPlane === 'nether') riftActiveNether += 1; else riftActiveUpper += 1;
  }
  const wraiths = wraithStats(world);
  const poss = possessionStats(world);

  // ── I · 战争 / 世家 / 法宝 ──────────────────────────────────
  const war = warStats(world);
  const clan = clanStats(world);
  const art = artifactStats(world);
  const artLog = art.log || {};

  const year = Math.floor(world.day / TIME.daysPerYear);

  return {
    seed,
    day: world.day,
    year,

    popTotal,
    popMortals: cs.mortals,
    popCultivators: cs.cultivators,
    // 份额用**全人口**作分母（含兽 / 灵），因为「修士占世界的比例」问的是
    // 「这个世界里有多少人在修仙」，分母应当是世界上所有的人。
    popCultivatorShare: popTotal ? cs.cultivators / popTotal : null,
    // ⚠️ 兽 / 灵单列，是为了让下面这条恒等式**在 CSV 里可核对**：
    //      `popTotal === popMortals + popCultivators + popWild`
    //    `world.cultivationStats()` 的 `mortals` / `cultivators` 把
    //    `beast` / `spirit` **排除在外**（`World.js:615`），所以若只印前三列，
    //    读报告的人会看到一个对不上的加法（例：total 80，而 48+2=50），
    //    然后合理地怀疑是采集器漏数了人。多一列，少一场无谓的排查。
    popWild: popTotal - cs.mortals - cs.cultivators,
    popHighestLevel: cs.highest,
    popHighestRealm: cs.highest ? realmIndexFor(cs.highest) : null,
    popHighestRealmName: cs.peakName || null,
    popDeathsCum: typeof deaths.total === 'number' ? deaths.total : null,
    popAscendedCum: typeof deaths.ascended === 'number' ? deaths.ascended : null,
    popEvictedCum: typeof deaths.evicted === 'number' ? deaths.evicted : null,

    villageCount: world.villages.length,
    villagePopulation,
    foodMin: food.min,
    foodMean: food.mean,
    foodMax: food.max,
    foodP10: food.p10,
    foodP90: food.p90,

    cultivatorHighestLevel: cs.highest,
    qiMean,
    qiMin: qiMinOut,
    qiMax: qiMaxOut,
    ...Object.fromEntries(cs.byRealm.map((n, i) => [`realm${i}Count`, n])),

    sectCount: sects.length,
    sectPopulation: sum(sectPops),
    sectPopGini: gini(sectPops),
    sectPopHHI: hhi(sectPops),
    sectSpiritStoneTotal: sum(spiritStones),
    sectSpiritStoneMax: max(spiritStones),
    sectProvisionsTotal: sum(provisions),
    sectProvisionsMax: max(provisions),
    sectStabilityMean: mean(stabilities),
    sectReputationMean: mean(reputations),

    leylineTotal: leylines.total,
    leylineControlled: leylines.controlled,
    leylineUncontrolled: leylines.uncontrolled,
    leylineTopOwnerShare: leylines.topOwnerShare,
    leylineOwnerGini: leylines.ownerGini,

    soulPool: rein.waiting,
    soulReborn: rein.reborn,
    soulRemembered: rein.remembered,
    soulConflicted: rein.conflicted,
    soulDistinct: rein.distinctSouls,
    soulCumulativeCreated: Math.max(0, (world.nextSoulId || 1) - 1),
    soulRouteNatural: soulLog.natural || 0,
    soulRouteLinger: soulLog.linger || 0,
    soulRouteGhost: soulLog.ghost || 0,
    soulRouteWraith: soulLog.wraith || 0,
    soulRouteGone: soulLog.gone || 0,

    upperPopulation: (upper.entities || []).length,
    upperMortals: up.mortals,
    upperCultivators: up.cultivators,
    upperHighestLevel: up.highest,
    upperHighestRealm: up.highest ? realmIndexFor(up.highest) : null,
    ...Object.fromEntries(up.byRealm.map((n, i) => [`upperRealm${i}Count`, n])),
    upperArrivedCum: upLog.arrived || 0,
    upperBornCum: upLog.born || 0,
    upperDiedCum: upLog.died || 0,
    upperThunderCum: upLog.arrivedThunder || 0,
    upperSectCount: (upper.factions || []).length,

    netherGhosts: nGhost.ghost,
    netherGhostCultivators: nGhost.cultivator,
    netherTopTier: nGhost.topTier,
    netherBornCum: nEco.born,
    netherDiedCum: nEco.died,
    netherEvictedCum: nEco.evicted,
    netherClimbedOutCum: nEco.climbedOut,
    netherPossessedOutCum: nEco.possessedOut,
    netherConserved: nEco.conserved,
    netherItemsAlive: nItems.alive,
    netherItemsSpawnedCum: nItems.spawned,
    netherItemsFellInCum: nItems.fellIn,
    netherItemsLeakedOutCum: nItems.leakedOut,
    netherItemsDecayedCum: nItems.decayed,
    netherItemsConserved: nItems.conserved,

    riftActive: rifts.active,
    riftActiveUpper,
    riftActiveNether,
    riftOpenedCum: rifts.opened,
    riftClosedCum: rifts.closed,
    riftLeakedCum: rifts.leaked,
    riftCrossedCum: rifts.crossed,
    riftLostCum: rifts.lost,
    wraithAlive: wraiths.alive,
    wraithDissolvedCum: wraiths.dissolved,
    possessionSucceededCum: poss.succeeded,
    possessionFailedCum: poss.failed,
    possessionCrossPlaneCum: poss.crossPlane,
    possessionHauntedCum: poss.haunted,
    possessionLiveCount: poss.total,
    ascendedTotal: world.ascended.length,

    warDeclaredCum: war.declared,
    warResolvedCum: war.resolved,
    warDestroyedCum: war.destroyed,
    warCasualtiesCum: war.casualties,
    warOngoing: war.ongoing,
    clanCount: clan.clans,
    clanMembers: clan.members,
    clanFoundedCum: clan.founded,
    clanEndedCum: clan.ended,
    clanMaxGen: clan.maxGen,
    artifactLive: art.live,
    artifactOnPeople: art.onPeople,
    artifactGround: art.ground,
    artifactSpirits: art.spirits,
    artifactTravelled: art.travelled,
    artifactForgedCum: artLog.forged || 0,
  };
}

// ───────────────────────────────────────────────────────────────────────
// 探针（30 日）
// ───────────────────────────────────────────────────────────────────────

/**
 * 采一次轻量探针。**只读**，且刻意只遍历「实体 / 聚落 / 宗门」三类数组，
 * 不碰地图层（委托书 §9：「不要为了 probe 每 30 日序列化整个世界」）。
 */
export function collectProbe(lab) {
  const { world, seed } = lab;
  let mortals = 0;
  let cultivators = 0;
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.sp === SPECIES.BEAST || e.sp === SPECIES.SPIRIT) continue;
    if (!e.level) mortals += 1; else cultivators += 1;
  }
  const popTotal = world.entities.length;
  const food = foodDistribution(world);
  let stabilityMin = null;
  for (let i = 0; i < world.factions.length; i += 1) {
    const s = world.factions[i].stability;
    if (stabilityMin === null || s < stabilityMin) stabilityMin = s;
  }
  let riftActive = 0;
  for (let i = 0; i < world.rifts.length; i += 1) if (world.rifts[i].closedDay < 0) riftActive += 1;

  return {
    seed,
    day: world.day,
    year: Math.floor(world.day / TIME.daysPerYear),
    popTotal,
    popMortals: mortals,
    popCultivators: cultivators,
    popWild: popTotal - mortals - cultivators,
    villageCount: world.villages.length,
    foodMin: food.min,
    foodMean: food.mean,
    foodP10: food.p10,
    foodEmptyCount: food.empty,
    sectCount: world.factions.length,
    sectStabilityMin: stabilityMin,
    riftActive,
  };
}

// ───────────────────────────────────────────────────────────────────────
// 遥测可得性（结构化地承认缺口，而不是用假数补上）
// ───────────────────────────────────────────────────────────────────────

/**
 * 委托书 §10.A 要求的「累计 flow 可得性」报告。
 * 进 summary.json 的 `telemetry` 字段。
 */
export function telemetryReport() {
  return {
    birthsCumulative: {
      available: false,
      reason: '凡间出生没有累计 counter：life.js 只往 world.entities 里 push，全仓库无 bornLog / birthCount 写入点。',
      policy: '不通过两个 snapshot 相减冒充精确 flow（委托书 §10.A）。',
    },
    awakensCumulative: {
      available: false,
      reason: '觉醒没有累计 counter：inkbox-longrun.mjs 里的 mortalAwakened 是脚本逐年比对算出的测试夹具，不是模拟里的 counter。',
      policy: '不通过两个 snapshot 相减冒充精确 flow（委托书 §10.A）。',
    },
    deathsCumulative: {
      available: true,
      source: 'world.deadLog.total',
      note: 'necrology.js 维护，单调递增，进存档；不变量 deadLog.total - deadLog.evicted === world.dead.length。',
    },
    soulPoolEviction: {
      available: false,
      reason: '魂池满（SOUL_CAP = 120）时的逐出**不记账**：reincarnation.js:569-575 直接 splice 掉一条，'
        + '没有任何计数器。于是「池子从没满过」与「池子一直在满、一直在丢魂」在 soulPool 这一个读数上同形。',
      workaround: '用 soulPool 是否长期贴着 SOUL_CAP（120）来间接判断——但那是**推断**，不是精确 flow。'
        + '要精确答案需要在模拟侧补一个计数器（属 B1，不在 B0 范围）。',
      policy: '不通过两个 snapshot 相减冒充精确 flow（委托书 §10.A）。',
    },
    ascensionsCumulative: {
      available: true,
      source: 'world.deadLog.ascended',
    },
    upperArrivalsCumulative: {
      available: true,
      source: 'upper.popLog.{arrived, born, died, arrivedThunder}',
    },
  };
}

/** 给报告用的境界名（把下标翻译成人话）。 */
export function realmNameAt(level) {
  return level ? realmLabel(level) : null;
}

export { describe };
