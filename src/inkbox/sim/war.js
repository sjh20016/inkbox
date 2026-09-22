// 水墨沙盒 · 大战（L1）与战败灭门
//
// 沙盒此前只有「宗门摩擦」——sects.js 的 stepConflicts / resolveConflict：
// 接壤够长、又抢同一道灵脉，两家就互相宣战，一战定胜负，败方元气大伤则散伙。
// 那是主线 L2（strategicRegionSystem）的骨架。这一块补的是**主线 L1**
// （greatBattleSystem + 战略层里那一层「大战」的规模感）：
//   · 规模门槛——只有两家都算得上「大门派」才配叫大战；
//   · 参与方数量——不再是固定两家，盟友可以助拳（主线 L1 没有第三方插手）；
//   · 持续时间——不是一 tick 定胜负，而是分「阵」交锋、跨数年；
//   · 特殊结局——两败俱伤 / 天降干预（主线 L1 只有「一胜一伤」）。
//
// ── 考古来源（详见 reports/migration/war.md）────────────────
//   src/systems/greatBattleSystem.js:4-9      四种大战类型（dao_dispute…）
//   src/systems/greatBattleSystem.js:63-65    level >= 35 才够格（沙盒降级，见下）
//   src/systems/greatBattleSystem.js:76-77    单人冷却 50 年
//   src/systems/greatBattleSystem.js:176      每轮 8% 触发
//   src/systems/greatBattleSystem.js:182      每轮上限 2 次
//   src/systems/greatBattleSystem.js:110-116  L1 胜负是抛硬币、败者 hp 保底 1（**不移植**）
//   src/systems/strategicRegionSystem.js:133-144  sectPower（战力公式原型）
//   src/systems/strategicRegionSystem.js:204-265  紧张度累积 / 开战阈值 48
//   src/systems/strategicRegionSystem.js:267-292  woundParticipants（每场 6 人、保底 1）
//   src/systems/strategicRegionSystem.js:294-318  胜负 = 影响力 + 天命 + 助拳 + rand*12
//   src/systems/strategicRegionSystem.js:356-376  交锋间隔 0.8 年、2 阵即止、紧张度 ≥108 提前结
//   src/systems/strategicRegionSystem.js:153-172  affinity（五行 / 宗旨亲和）
//   src/systems/strategicRegionSystem.js:79-88    barrierFor 的四档地形 penalty
//   src/systems/reincarnationSystem.js:123-140    元婴脱壳（大战不死人的缓冲）
//   src/systems/sectSystem.js:263-294             dissolveSect（灭门的全部善后）
//   src/data/narrativeMissingKeysV371.js:86-93    大战文案（市井幽默腔）
//   沙盒已有：src/inkbox/sim/sects.js:531-659    L2 摩擦 / 战败灭门
//             src/inkbox/sim/territory.js:429-598 接壤表 / 接壤代表格 / 争夺灵脉集
//
// ── 需要接线方加什么（本文件只新建，不改任何既有文件）──────
//
// 1) 世界容器。本文件导出 `ensureWarState(world)`，它会按需建出
//      world.wars      : 大战记录数组（**真实状态，必须进存档**）
//      world.warLog    : 累计账本 { declared, resolved, destroyed, casualties }
//      world.nextWarId : 递增 id
//    接线方要做两件事：① 在 World 构造器里给出初值（或依赖 ensureWarState 懒建）；
//    ② 在 `src/inkbox/io/save.js` 的 serializeWorld 里加这三列、
//       在 deserializeWorld 里还原（照 world.clans / clanLog 的写法）。
//    ⚠️ 不存的话：读档后所有进行中的大战凭空消失、账本归零，
//       长测的 `warStats` 读数与「接着玩」的那条线对不上。
//
// 2) 实体列。元婴脱壳一生只能触发一次，本文件用 `entity.nascentEscapeUsed`
//    记账（与主线 reincarnationSystem.js:129 同名）。**这是一列新状态**：
//    接线方要在 save.js 的实体列（约 :142 的 e.hp/e.maxHp 一带）与
//    restoreEntity（约 :461 / :535）里把它存下来、读回来。
//    ⚠️ 不存的话：读档后同一个人可以反复「元婴脱壳」，重伤永远死不了。
//
// 3) 调用点。`stepWar` 每 tick 调一次，**必须在 `stepSects` 之后**——
//    它读的接壤表（world._terrBorder / _terrBorderAt / _terrContested）由
//    stepSects → stepTerritory 每 30 日重算一次。位置：
//      src/inkbox/sim/life.js:302  `stepSects(world, this, dtDays, this.rng);` 之后
//      `stepWar(world, warRng, dtDays);`
//    ⚠️ **强烈建议传一条独立随机流**，不要传 `this.rng`：本文件只在跨年的那一个
//       tick 抽签，但一次可能抽好几下（每个够格的对子 1 下、每场新宣战 2 下、
//       每阵每个参战者 1 下、结算时每个参战者 1 下）。塞进 Life.rng 会把
//       整个世界线往后挪（family.js 头注释里那条铁律）。
//
// 4) 面板（可选）。`warStats(world)` 是纯读数，不抽签、不改状态，可直接给 UI。
//
// ── 降级了什么（逐条：主线原机制 → 沙盒降级成什么）──────────
//
// · 多世界 / `world.type ∈ ['mortal','blessed','upper','lower']` 分支
//     → 沙盒只有一张图。不移植这些分支；battle 里不带 worldId 语义。
// · `EcologyRegion` 5×5 生态区域网格（site 的取值源）
//     → 不建网格。用 territory.js 的 `_terrBorder` / `_terrBorderAt` 当「区域」，
//       起兵处 = 接壤代表格（sects.js:557-559 已是这个思路）。
// · `routeCost` 四邻接 Dijkstra（地形路费）
//     → 降级为「接壤即够得着」+ 直线距离兜底。barrierFor 的四档 penalty
//       （5.4 / 3.3 / 2.35 / 1.65）原样留在 GREAT_BATTLE_BARRIER_PENALTY 里备查，
//       但当前**没有接轴**（沙盒没有 passability / danger 区域字段）。
// · `site` 三级（洞天 72~100 / 灵脉 38~82 / 异象源 45~78）
//     → 沙盒灵脉没有 kind。按灵脉 strength 分两档映射，clamp 边界照抄：
//       strength ≥ 0.62 视为洞天 clamp(72 + s*20, 72, 100)，否则灵脉 clamp(38 + s*40, 38, 82)。
// · `sectPower` 的 `Σ max(1, level)^0.72 × 1.4`
//     → 保留（这是「人海 vs 精英」的分水岭）。`pop` **不**再乘 1.4 叠加
//       （war.md §10.2(D) 的警告：两者叠加会让战力尺度失控），
//       只在「pop 与实体数对不上」时按炼气一层补齐。
// · `affinity` 的 vitality / danger / anomaly / population 四个生态字段
//     → 只取山门半径 12 格的地形比例（warPower 是准热路径，不扫全图）；
//       依赖 danger / anomaly / population 的三条宗旨亲和**删除**，
//       只留「争渡尚武 + site.value×.1」与「清修避世 − max(0, 村数−8)×.4」。
// · 天命授旗（strategyCommandSystem，消耗功德 65）
//     → 沙盒没有功德货币。保留**可选**字段 `sect.mandate = { untilDay, bonus }`，
//       没有就是 0。STRATEGY_MANDATE_POWER / _YEARS 照抄备用。
// · L4 战争命途（sectWarDestinySystem，门人个人抉择）
//     → 不移植（沙盒无 lineageId / merit / fateTask / 事件线程）。
//       助拳降级到**宗门级**：盟友按关系分加入，出力按 GREAT_BATTLE_ALLY_WEIGHT 折算。
// · L3 逐人战区（conflictZoneSystem + combatSystem）
//     → 不移植（沙盒无碰撞网格）。伤亡只在年度结算里掷一次，不逐人实时结算。
// · 元婴脱壳（reincarnationSystem.js:123-140）
//     → 移植。公式与上下限照抄；灵兽护主映射到 `entity.beast`（沙盒目前恒 null，
//       所以这一项实际恒为 0——留着是为了灵兽接轴后自动生效）。
// · 编年史 `chronicleText` → `world.record(text, 'war', actors)`（war.md §10.2(I)）。
//   本文件是**注释**、不是调用点；真实调用一律经 `warActors` 把「双方宗主」带上，
//   见文件末尾那个 helper 的注释。
// · 文案 → 采用市井幽默腔（narrativeMissingKeysV371.js:86-93）。因为不许改
//   lore.js，所以池子放在本文件里，**没有**扩 lore.js 的 `NARRATIVE.war`。
//
// ── 三条刻意的设计约束（每条都是这个项目咬过的地方）────────
//
// **一、不碰主随机流。** 所有随机性都从 `rng` 形参进来；本文件不 new 任何随机源。
// 抽签只发生在**跨年那一个 tick** 与进行中的交锋里，次数有上界：
// 每个够格的对子 1 次（宣战判定）+ 每场新宣战 2 次（类型、开场文案）+
// 每阵每个参战者 1 次（伤害）+ 结算 2 次（胜负）+ 每名参战者 1 次（致命）+ 元婴脱壳。
// 无战事的年份只有「够格对子数」次抽签（实测多为 0~2 次）。函数是 rng 的纯函数，
// 同一个 rng 序列、同一个 world 会得到同一个结果。
//
// **二、不拥有别人的状态。** 灭门一律走 sects.js 的 `dissolveSect`
// （门人 faction=0、村落失归属、灵脉 owner=0、sect.war.clear，见 sects.js:632-659），
// 本文件**不** splice `world.factions`、不手写门人去向——守恒只有一处实现，
// 两处各写一份迟早会漂。同理不写 `world._terr*`（那是 territory.js 的推导量）。
//
// **三、只把「真实状态」写进存档。** world.wars / world.warLog / sect.lastConflictDay
// （后者 save.js:238 已经存了，本文件第一次让它真的有人读）/ entity.nascentEscapeUsed。
// 接壤表、战力、参与方名单全是**现算**——存下来迟早会和世界对不上
// （territory.js 头注释里那条「推导量不进存档」的规矩）。

import { clamp } from '../core/noise.js';
import { pickFrom, fillTemplate } from '../core/lore.js';
import { equipBonus } from './artifacts.js';
import { dissolveSect, placeOf, ALLIED_THRESHOLD } from './sects.js';
import { sectSeat } from './territory.js';
import { speak } from './busanzi.js';

// ── 常量：全部照抄 war.md §8，出处行号标在右边 ───────────────
export const YEAR_DAYS = 360;                                    // config.js:14
export const EXP_PER_LEVEL = 32;                                 // config.js:17
export const SECT_DECLINE_YEARS = 30;                            // config.js:24（灭门倒计时，沙盒不直接用，留作口径）
export const STRATEGY_CONFLICT_START = 48;                       // config.js:33（开战紧张度阈值）
export const STRATEGY_CONTROL_YEARS = 12;                        // config.js:33（战后控制年限）
export const STRATEGY_TRUCE_YEARS = 16;                          // config.js:33（天道止戈年限）
export const STRATEGY_MANDATE_POWER = 42;                        // config.js:33（天命战力加成）
export const STRATEGY_MANDATE_YEARS = 20;                        // config.js:33（天命年限）
export const STRATEGY_CHARACTER_TRUCE = 20;                      // config.js:33（门人斡旋停战阈值）
export const STRATEGY_CHARACTER_TRUCE_YEARS = 8;                 // config.js:33（门人斡旋年限）
export const WAR_DESTINY_PEACE_COST = 18;                        // config.js:33（沙盒无功德货币，仅留口径）
export const WAR_DESTINY_DEFECT_COST = 12;                       // config.js:33（同上）

/** 大战类型池。来源 greatBattleSystem.js:4-9 */
export const GREAT_BATTLE_TYPES = Object.freeze([
  { id: 'dao_dispute', label: '道争', desc: '大道之争，不死不休', minLevel: 35 },
  { id: 'blood_feud', label: '仇杀', desc: '血海深仇，一朝清算', minLevel: 35 },
  { id: 'treasure_seize', label: '夺宝', desc: '重宝出世，双双争夺', minLevel: 35 },
  { id: 'heaven_mandate', label: '天命令', desc: '天命对决，胜者得天命', minLevel: 40 },
]);

/** 「大能」门槛。来源 greatBattleSystem.js:63-65（level >= 35，即元婴）。
 *
 * ⚠️ 降级：主线 L1 拿它当**参战资格**（双方都必须有 level ≥ 35 的人）。
 * 沙盒境界爬得慢、元婴稀少，照搬会让大战永远不发生。所以这里只拿它
 * 筛「打哪一类大战」，不拿它当资格线；资格线改用宗门战力门槛。
 * 见 pickBattleType 与文件头的降级清单。 */
export const GREAT_BATTLE_MIN_LEVEL = 35;
/** 每个候选对每年 8% 触发。来源 greatBattleSystem.js:176 */
export const GREAT_BATTLE_CHANCE = 0.08;
/** 每轮最多触发 2 次。来源 greatBattleSystem.js:182 */
export const GREAT_BATTLE_PER_ROUND = 2;
/** 战后双方各冷却 50 年。来源 greatBattleSystem.js:76-77（50 × YEAR_DAYS） */
export const GREAT_BATTLE_COOLDOWN_YEARS = 50;
/** 交锋 2 阵即止。来源 strategicRegionSystem.js:376 */
export const GREAT_BATTLE_CLASHES = 2;
/** 交锋最小间隔 0.8 年。来源 strategicRegionSystem.js:356（updateDays × .8） */
export const GREAT_BATTLE_CLASH_INTERVAL_DAYS = Math.round(YEAR_DAYS * 0.8);
/** 每阵紧张度 +18。来源 strategicRegionSystem.js:360 */
export const GREAT_BATTLE_TENSION_STEP = 18;
/** 紧张度上限 140。来源 strategicRegionSystem.js:235 */
export const GREAT_BATTLE_TENSION_CAP = 140;
/** 紧张度 ≥108 提前结。来源 strategicRegionSystem.js:376 */
export const GREAT_BATTLE_RESOLVE_TENSION = 108;
/** 每场每方参战人数。来源 strategicRegionSystem.js:269（topActors 取 6；主线是双方合计，沙盒改为每方 6） */
export const GREAT_BATTLE_FIGHTERS = 6;
/** 每阵伤害比例区间 [0.04, 0.12)。来源 strategicRegionSystem.js:275 */
export const GREAT_BATTLE_WOUND_MIN = 0.04;
export const GREAT_BATTLE_WOUND_MAX = 0.12;
/** 风险倍率。来源 strategicRegionSystem.js:272（guardian 1.25 / 其他 1）；member 档是沙盒新增 */
export const GREAT_BATTLE_RISK_LEADER = 1.25;
export const GREAT_BATTLE_RISK_ELDER = 1.0;
export const GREAT_BATTLE_RISK_MEMBER = 0.85;
/** 元婴脱壳。来源 reincarnationSystem.js:123-140 */
export const GREAT_BATTLE_NASCENT_MIN_LEVEL = 30;
export const GREAT_BATTLE_NASCENT_BASE = 0.48;
export const GREAT_BATTLE_NASCENT_PER_LEVEL = 0.012;
export const GREAT_BATTLE_NASCENT_FORTUNE_DIV = 500;
export const GREAT_BATTLE_COMPANION_GUARD = 0.07;
export const GREAT_BATTLE_NASCENT_MIN = 0.48;
export const GREAT_BATTLE_NASCENT_MAX = 0.88;
/** 宗旨好战度。来源 strategicRegionSystem.js:174-179 */
export const GREAT_BATTLE_DOCTRINE_AGGRESSION = Object.freeze({
  争渡尚武: 1.45,
  守序护道: 0.82,
  清修避世: 0.58,
});
export const GREAT_BATTLE_AGGRESSION_DEFAULT = 1;
/** 地形阻隔 penalty 四档。来源 strategicRegionSystem.js:79-88。当前未接轴，留作口径 */
export const GREAT_BATTLE_BARRIER_PENALTY = Object.freeze({
  deadzone: 5.4, water: 3.3, mountain: 2.35, rough: 1.65,
});

// ── 以下为沙盒自拟（主线 L1 没有这些机制，见 war.md §5 / §10.3）──
//
// 主线的 L1 是「两个人抛硬币」，压根没有规模、参与方、持续时间的说法。
// 沙盒要把 L1 做成「一场大战」，就必须自己定这几个数。标定目标是：
// 一个中等门派（warPower 约 60~200）能打，小门派不能；一场大战跨 2 阵、约 2 年；
// 两败俱伤与天降干预合计约占一成。
/** 规模门槛：双方战力都要过这条线。实测中堂 200 年，门派 warPower 多在 60~250 */
export const GREAT_BATTLE_MIN_POWER = 60;
/** 接壤长度封顶。来源 sects.js:555（/30 封顶 1） */
export const GREAT_BATTLE_BORDER_CAP = 30;
/** 洪泛图还没算出来时，用山门直线距离兜底判「够得着」 */
export const GREAT_BATTLE_FALLBACK_GAP = 40;
/** 每方最多拉几个盟友助拳（「第三方插手」） */
export const GREAT_BATTLE_MAX_ALLIES = 2;
/** 盟友出力折算：盟友战力的多少算进本方 */
export const GREAT_BATTLE_ALLY_WEIGHT = 0.5;
/** 双方分差小于这个值 → 两败俱伤 */
export const GREAT_BATTLE_STALEMATE_MARGIN = 6;
/** 天降干预（天道止戈）的年概率 */
export const GREAT_BATTLE_TRUCE_CHANCE = 0.10;
/** 结算时每名参战者的战殁概率：败方基准 / 胜方基准 / 败得越惨加得越多（上限） */
export const GREAT_BATTLE_FATAL_BASE = 0.12;
export const GREAT_BATTLE_FATAL_WINNER = 0.03;
export const GREAT_BATTLE_FATAL_MARGIN_CAP = 0.30;
export const GREAT_BATTLE_FATAL_MAX = 0.55;
export const GREAT_BATTLE_MARGIN_DIV = 200;
/** 灭门判据：存活门人 ≤ N 且稳定度 < S */
export const GREAT_BATTLE_DESTROY_MEMBERS = 3;
export const GREAT_BATTLE_DESTROY_STABILITY = 18;
/** 灭门 reason。主线枚举名是 `war_destroyed`（sectSystem.js:25/280），
 *  但 sects.js 的 dissolveSect 会把 reason 原样写进中文编年史
 *  （`${name} 因${reason}而散`），所以这里必须给中文，否则编年史里会出现英文词
 *  （war.md §9.10 就是被这种字面量坑过的地方）。 */
export const GREAT_BATTLE_DESTROY_REASON = '战败覆灭';
/** 战力公式的系数（量纲写在 warPower 的注释里） */
export const GREAT_BATTLE_POWER_BASE = 10;
export const GREAT_BATTLE_CULTIVATION_W = 1.4;
export const GREAT_BATTLE_CULTIVATION_EXP = 0.72;
export const GREAT_BATTLE_LEADER_W = 1.15;
export const GREAT_BATTLE_REPUTATION_W = 0.36;
export const GREAT_BATTLE_STABILITY_W = 0.18;
export const GREAT_BATTLE_LEYLINE_W = 8;
export const GREAT_BATTLE_EQUIP_W = 1.0;
export const GREAT_BATTLE_EQUIP_CAP = 0.5;
export const GREAT_BATTLE_AFFINITY_RADIUS = 12;
/** 战报保留上限（编年史 400 条同源思路）。累计读数看 warLog */
export const GREAT_BATTLE_LOG_CAP = 400;

/** 大战文案：市井幽默腔。来源 narrativeMissingKeysV371.js:86-93 */
const GREAT_BATTLE_PRELUDE = Object.freeze([
  '【{a}】与【{b}】在{place}摆开阵势，{type}一触即发。围观的人群自觉退开三十丈，卖瓜子的挤到了最前排。',
  '{place}上空灵气翻涌，【{a}】与【{b}】的{type}即将开场。有人在树上挂了块牌子：「高处观战，位置收费。」',
  '【{a}】与【{b}】的旧账翻到了{place}。两家旗子隔着一道山梁对望，谁也没先动——都在等对方先动。',
]);
const GREAT_BATTLE_AFTERMATH = Object.freeze([
  '【{a}】与【{b}】的{type}在{place}收场。地上坑坑洼洼，围观者一边感慨一边捡散落的灵材，像赶集。',
  '{place}的{type}余波散尽。胜负已定，输家把碎掉的道袍补好，赢家把剑擦干净——两人谁也没提下次。',
  '【{a}】与【{b}】一战之后，{place}的山形改了三分。后来的人只当是地势如此。',
]);

// ── 世界容器 ───────────────────────────────────────────────
/**
 * 按需建出大战容器。**新世界与读档后各调一次**（接线方负责；
 * 本文件里所有入口也都会先调一遍，所以漏掉也不会崩）。
 *
 * 为什么不放在 World 构造器里由本文件「顺手」建：World.js 不归本文件管，
 * 而且 ensureClanState（family.js:394）已经定下了这个写法——容器由模块自己补，
 * 存档列由接线方加。
 */
export function ensureWarState(world) {
  if (!world) return [];
  if (!Array.isArray(world.wars)) world.wars = [];
  if (!world.warLog || typeof world.warLog !== 'object') {
    world.warLog = { declared: 0, resolved: 0, destroyed: 0, casualties: 0 };
  }
  const log = world.warLog;
  if (typeof log.declared !== 'number') log.declared = 0;
  if (typeof log.resolved !== 'number') log.resolved = 0;
  if (typeof log.destroyed !== 'number') log.destroyed = 0;
  if (typeof log.casualties !== 'number') log.casualties = 0;
  if (!world.nextWarId) world.nextWarId = 1;
  return world.wars;
}

// ── 小工具 ─────────────────────────────────────────────────
/**
 * 宗旨名。⚠️ 这里有个坑：`sect.doctrine` 存的是 `SECT_DOCTRINES` 的**对象**
 * （`{key, name, note}`，见 sects.js:51），不是字符串；而全仓除了存档没有第二个读者。
 * 直接写 `sect.doctrine === '争渡尚武'` 会**恒为假**，而且不会有任何报错——
 * 典型的「字段存在但没人读」。所以统一从这里取。
 */
export function doctrineName(sect) {
  const d = sect && sect.doctrine;
  if (!d) return null;
  return typeof d === 'string' ? d : (d.name || null);
}

function doctrineAggression(sect) {
  const name = doctrineName(sect);
  return GREAT_BATTLE_DOCTRINE_AGGRESSION[name] || GREAT_BATTLE_AGGRESSION_DEFAULT;
}

/** 天命加成。沙盒没有天命授旗（无功德货币），字段可缺省 → 0 */
function mandateBonus(sect, day) {
  const m = sect && sect.mandate;
  if (!m || !(m.untilDay > day)) return 0;
  return m.bonus || STRATEGY_MANDATE_POWER;
}

/** 这一 tick 是否跨过了「年」的边界。
 *
 * 与 territory.js:46 的 crossedBoundary 同一个写法：dtDays 不固定，
 * `day % 360 === 0` 在快进时会被整个跳过；「记住上次是哪年」又要进存档，
 * 否则读档后立刻多跑一次年度结算，两条分叉就对不上了。只看 day 落在哪个年，纯函数。
 */
export function crossedYear(day, dtDays) {
  if (!(dtDays > 0)) return false;
  return Math.floor(day / YEAR_DAYS) !== Math.floor((day - dtDays) / YEAR_DAYS);
}

function borderKey(a, b) {
  return a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
}

/** 两家接壤格数。洪泛图还没算出来时返回 0 */
export function borderLength(world, a, b) {
  const border = world && world._terrBorder;
  if (!border) return 0;
  return border.get(borderKey(a, b)) || 0;
}

/** 起兵处：接壤代表格。两家还没挨上就退回山门中点（sects.js:557-559 同款兜底） */
export function borderPoint(world, a, b) {
  const at = world && world._terrBorderAt ? world._terrBorderAt.get(borderKey(a, b)) : undefined;
  if (at === undefined || at === null) {
    return { x: (a.capitalX + b.capitalX) / 2, y: (a.capitalY + b.capitalY) / 2 };
  }
  return { x: (at % world.w) + 0.5, y: Math.floor(at / world.w) + 0.5 };
}

/** 两家山门直线距离（洪泛图缺位时的兜底判据） */
export function seatGap(a, b) {
  return Math.hypot((a.capitalX || 0) - (b.capitalX || 0), (a.capitalY || 0) - (b.capitalY || 0));
}

/**
 * 两家的紧张度。**与 sects.js:564 逐项同式**：
 *   overlap × 40 + contested × 40 + max(0, −关系分) × 0.6
 * 只有一条公式，L1 与 L2 共用——两处各写一份，迟早会漂成两个阈值。
 */
export function warTension(world, a, b) {
  const overlap = Math.min(1, borderLength(world, a, b) / GREAT_BATTLE_BORDER_CAP);
  // 「两家都伸得着」的灵脉。判据是**够得着**不是**持有**（territory.js:521-534）。
  const contestedSet = (world && world._terrContested) || null;
  const contested = contestedSet && a.leylines.some((id) => contestedSet.has(id)) ? 0.5 : 0;
  const score = a.relations.get(b.id) || 0;
  return overlap * 40 + contested * 40 + Math.max(0, -score) * 0.6;
}

// ── 战力 ───────────────────────────────────────────────────
/**
 * 一家的战力。**没有照抄主线的 sectPower**，用的是沙盒真有的字段：
 *
 *   量纲：以「人」为单位的合成分。中堂 200 年实测，中等门派 60~250。
 *
 *   10                                             基数
 * + Σ max(1, level)^0.72 × 1.4                     成员修为（次线性：人海有边际递减）
 * + 门中最高境界 × 1.15                            掌门等级。sects.js:397-410 的
 *                                                  refreshLeadership 让掌门恒为最高境界者，
 *                                                  所以这里直接用最高境界，不必再查 leaderId
 * + reputation × 0.36                              声望（0~100）
 * + stability × 0.18                               稳定度（0~100）
 * + 灵脉数 × 8                                     地盘纵深（沙盒独有）
 * × (1 + min(0.5, 平均法宝 combat 加成))            法宝（artifacts.js 的 equipBonus）
 * + affinity                                       地利：五行 + 宗旨（见 affinityPower）
 * + mandate.bonus                                  天命（沙盒可缺省 → 0）
 *
 * ⚠️ 为什么 `pop` 只用来**兜底**、不再乘 1.4：sects.js:598 的原式是
 * `pop × 1.4`（线性），主线是 `Σ level^0.72 × 1.4`（次线性）。war.md §10.2(D)
 * 明确警告「二者只能选一，不要叠加，否则战力尺度会失控」——同一批人被算了
 * 两遍，人数越多偏得越离谱。所以主项走次线性，`pop` 只在「实体表里找不到
 * 那么多修士」（被裁剪 / 口径不一致）时，把差额按炼气一层补齐（1^0.72 = 1）。
 *
 * ⚠️ 为什么剔除 `hp <= 0`：本 tick 刚战殁的人还留在 world.entities 里
 * （清理在 life.step 的实体循环之后，而 stepWar 排在 stepSects 之后），
 * 不剔除的话「刚被打死的人还在替宗门出力」。
 */
export function warPower(world, sect) {
  if (!world || !sect) return 0;
  const ents = world.entities;
  let cultivation = 0;
  let members = 0;
  let topLevel = 0;
  let equipSum = 0;
  for (let i = 0; i < ents.length; i += 1) {
    const e = ents[i];
    if (e.faction !== sect.id) continue;
    if (e.hp <= 0) continue;
    const lv = e.level || 0;
    if (lv <= 0) continue;                       // 凡人弟子不算（与 sects.js:176 的 pop 口径一致）
    members += 1;
    cultivation += Math.max(1, lv) ** GREAT_BATTLE_CULTIVATION_EXP;
    if (lv > topLevel) topLevel = lv;
    equipSum += equipBonus(e).combat;
  }
  const missing = Math.max(0, (sect.pop || 0) - members);
  cultivation += missing;

  let power = GREAT_BATTLE_POWER_BASE;
  power += cultivation * GREAT_BATTLE_CULTIVATION_W;
  power += topLevel * GREAT_BATTLE_LEADER_W;
  power += (sect.reputation || 0) * GREAT_BATTLE_REPUTATION_W;
  power += (sect.stability || 0) * GREAT_BATTLE_STABILITY_W;
  power += (sect.leylines ? sect.leylines.length : 0) * GREAT_BATTLE_LEYLINE_W;
  const equipAvg = members > 0 ? equipSum / members : 0;
  power *= 1 + Math.min(GREAT_BATTLE_EQUIP_CAP, equipAvg * GREAT_BATTLE_EQUIP_W);
  power += affinityPower(world, sect);
  power += mandateBonus(sect, world.day);
  return Math.max(0, power);
}

/** 门中最高境界。用来筛大战类型（GREAT_BATTLE_MIN_LEVEL） */
export function topLevelOf(world, sect) {
  let top = 0;
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.faction !== sect.id || e.hp <= 0) continue;
    if ((e.level || 0) > top) top = e.level || 0;
  }
  return top;
}

/**
 * 门中持有灵脉里「最值钱」的那道，换算成主线的 site.value。
 *
 * 降级：沙盒灵脉没有 kind（worldgen.js:400-406 只给了 x/y/radius/strength/element），
 * 于是按 strength 分两档映射，**clamp 边界照抄 strategicRegionSystem.js:56-77**：
 *   洞天福地 72~100  /  灵脉 38~82
 * 不这么定的话，「争渡尚武」的 `+ site.value × .1` 就没有取值源，那条亲和会恒为 0。
 */
export function siteValueOf(world, sect) {
  let best = 0;
  const ids = sect.leylines || [];
  for (let i = 0; i < ids.length; i += 1) {
    const l = world.leylineById(ids[i]);
    if (!l) continue;
    const s = clamp(l.strength || 0.35, 0, 1);
    const value = s >= 0.62
      ? clamp(Math.round(72 + s * 20), 72, 100)          // 洞天福地档
      : clamp(Math.round(38 + s * 40), 38, 82);          // 灵脉档
    if (value > best) best = value;
  }
  return best;
}

/**
 * 地利：山门半径 12 格的地形比例，套主线的五行亲和（strategicRegionSystem.js:153-172）。
 *
 * ⚠️ 为什么不扫全图地盘：warPower 一年要被调上百次（45 对候选 × 双方），
 * 每次扫 5 万格 × 10 家会把长测拖慢一个量级。山门周边 25×25 足够代表
 * 「这家立在什么地上」，而宗门本来也是依山门选址的。
 *
 * 降级：依赖 region.danger / anomaly / population 的三条宗旨亲和**删除**
 * （沙盒没有这三个区域字段）；`清修避世` 的 population 换成 `villages.length`
 * （war.md §10.2(E) 的指定替代）。
 */
function affinityPower(world, sect) {
  const seat = sectSeat(world, sect);
  const cx = Math.floor(seat[0]);
  const cy = Math.floor(seat[1]);
  const R = GREAT_BATTLE_AFFINITY_RADIUS;
  let mountain = 0;
  let water = 0;
  let scorch = 0;
  let green = 0;
  let n = 0;
  for (let dy = -R; dy <= R; dy += 1) {
    const y = cy + dy;
    if (y < 0 || y >= world.h) continue;
    for (let dx = -R; dx <= R; dx += 1) {
      const x = cx + dx;
      if (x < 0 || x >= world.w) continue;
      const i = y * world.w + x;
      n += 1;
      if (world.isWater(i)) { water += 1; continue; }
      const t = world.type[i];
      if (t === 14 || t === 15 || t === 16) mountain += 1;   // 山 / 峻岭 / 雪峰
      if (t === 18) scorch += 1;                             // 焦土
      if (world.veg[i] > 0.6) green += 1;
    }
  }
  let v = 0;
  const el = sect.element;
  if (el === '金' && mountain > 0) v += 9;
  if (el === '木') v += (green / Math.max(1, n)) * 100 * 0.09;
  if (el === '水' && water > 0) v += 11;
  if (el === '火' && scorch > 0) v += 7;
  if (el === '土' && mountain > 0) v += 9;
  const site = siteValueOf(world, sect);
  if (doctrineName(sect) === '争渡尚武' && site > 0) v += site * 0.1;
  if (doctrineName(sect) === '清修避世') v -= Math.max(0, (sect.villages || []).length - 8) * 0.4;
  return v;
}

// ── 触发判据 ───────────────────────────────────────────────
/**
 * 这两家能不能打起来。**纯判据，不抽签、不改状态**，拆出来就是为了能单测。
 *
 * 六道门，全过才为真：
 *   1. 都还活着、都还在 world.factions 里、彼此没在打；
 *   2. 地理前置：必须接壤（洪泛图缺位时退回山门直线距离 ≤ 40）；
 *   3. 规模门槛：双方 warPower 都 ≥ GREAT_BATTLE_MIN_POWER；
 *   4. 战后冷却：双方都过了 50 年（主线 L1，greatBattleSystem.js:76-77）；
 *   5. 紧张度：warTension ≥ 48（与 sects.js 的 L2 同一条公式、同一个阈值）。
 *
 * 主线 L1 的 `level >= 35` 资格线**不在这里**——见 GREAT_BATTLE_MIN_LEVEL 的注释。
 * 主线 L2 的「有 site 才开战」（strategicRegionSystem.js:512）在沙盒由
 * `contested`（抢同一道灵脉）项承担，见 warTension。
 */
export function canDeclareWar(world, a, b) {
  if (!world || !a || !b || a === b) return false;
  if (a.destroyedDay >= 0 || b.destroyedDay >= 0) return false;
  if (!world.factionById(a.id) || !world.factionById(b.id)) return false;
  if (a.war.has(b.id)) return false;

  const border = borderLength(world, a, b);
  if (border <= 0) {
    // 洪泛图已经算过（world._terrBorder 存在）却还是 0 格接壤 → 隔山隔水，打不起来。
    // 只在图还没算出来的头 30 天，才退回山门距离兜底。
    if (world._terrBorder) return false;
    if (seatGap(a, b) > GREAT_BATTLE_FALLBACK_GAP) return false;
  }

  if (warPower(world, a) < GREAT_BATTLE_MIN_POWER) return false;
  if (warPower(world, b) < GREAT_BATTLE_MIN_POWER) return false;

  const cd = GREAT_BATTLE_COOLDOWN_YEARS * YEAR_DAYS;
  // ⚠️ 这条冷却只记**大战**（本文件写 lastConflictDay）。sects.js 的 L2 摩擦
  // 不设这个字段（它不归本文件管），所以「刚打完一场摩擦立刻又打一场大战」
  // 是可能的。要收紧的话得在 stepConflicts 里补一句，那属于接线方的取舍。
  if (world.day - (a.lastConflictDay ?? -1e9) < cd) return false;
  if (world.day - (b.lastConflictDay ?? -1e9) < cd) return false;

  return warTension(world, a, b) >= STRATEGY_CONFLICT_START;
}

/** 所有够格打大战的对子，按紧张度降序（同分按 id，保证确定性） */
function eligiblePairs(world) {
  const out = [];
  const list = world.factions;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      if (!canDeclareWar(world, a, b)) continue;
      out.push({ a, b, tension: warTension(world, a, b) });
    }
  }
  out.sort((x, y) => (y.tension - x.tension) || (x.a.id - y.a.id) || (x.b.id - y.b.id));
  return out;
}

/**
 * 挑大战类型。来源 greatBattleSystem.js:179：
 *   只在 `a.level >= bt.minLevel && b.level >= bt.minLevel` 的类型里挑。
 * 沙盒降级：拿「双方最高境界里较低的那个」去筛；筛不出任何类型时退回全集
 * （元婴在沙盒里太少，硬筛会让 `treasure_seize` 这类常见类型永远出不来）。
 */
function pickBattleType(rng, a, b, world) {
  const best = Math.min(topLevelOf(world, a), topLevelOf(world, b));
  const pool = GREAT_BATTLE_TYPES.filter((t) => best >= t.minLevel);
  return pickFrom(rng, pool.length ? pool : GREAT_BATTLE_TYPES);
}

// ── 推进 ───────────────────────────────────────────────────
/**
 * 每 tick 调一次。**只在跨年的那一个 tick 真正干活**——主线 L1 的调度是
 * `cadence:'yearly'`（createGameKernel.js:731），沙盒照此办理，
 * 顺带把「每年最多抽 3 次签」钉死（见文件头约束一）。
 *
 * 返回本 tick 发生的事件数组（没有则空数组）：
 *   { kind: 'declared' | 'clash' | 'resolved' | 'abandoned', battle }
 *
 * ⚠️ 调用顺序：必须在 `stepSects` 之后（接壤表由它每 30 日重算）。
 */
export function stepWar(world, rng, dtDays) {
  const out = [];
  if (!world || typeof rng !== 'function') return out;
  ensureWarState(world);

  // ── 0) 每 tick 的卫生检查：参与方已散的大战立刻收场 ──
  // 这一段**不抽签**（endBattle / clearWarFlags 都不碰 rng），所以可以每 tick 跑。
  // 放进年度循环里的话，一场「对手已经不存在」的战争会挂着一整年，
  // 期间 warStats 的 ongoing 是假读数，长测那条「进行中的大战都有人」会红。
  sweepAbandoned(world, rng, out);

  if (!crossedYear(world.day, dtDays)) return out;

  // ── 1) 推进进行中的大战 ──
  const wars = world.wars;
  for (let i = 0; i < wars.length; i += 1) {
    const battle = wars[i];
    if (battle.phase === 'ended') continue;
    if (world.day - battle.lastClashDay < GREAT_BATTLE_CLASH_INTERVAL_DAYS) continue;

    clash(world, rng, battle);
    out.push({ kind: 'clash', battle });

    if (battle.clashCount >= GREAT_BATTLE_CLASHES
      || battle.tension >= GREAT_BATTLE_RESOLVE_TENSION) {
      resolveGreatBattle(world, rng, battle);
      out.push({ kind: 'resolved', battle });
    }
  }

  // ── 2) 新的宣战 ──
  const pairs = eligiblePairs(world);
  let declared = 0;
  for (let i = 0; i < pairs.length; i += 1) {
    if (declared >= GREAT_BATTLE_PER_ROUND) break;
    const { a, b } = pairs[i];
    // 前面刚宣过战，这一对可能已经不成立了（同一年里一家只能打一场）
    if (!canDeclareWar(world, a, b)) continue;
    // 宗旨好战度：主线拿它加速紧张度累积（strategicRegionSystem.js:231-234），
    // 沙盒的紧张度是瞬时算的、没有累积过程，于是等价地折进触发概率——
    // 争渡尚武更容易打，清修避世更难。方向一致，量纲清楚。
    const aggression = (doctrineAggression(a) + doctrineAggression(b)) / 2;
    if (rng() >= GREAT_BATTLE_CHANCE * aggression) continue;
    const battle = declareWar(world, rng, a, b);
    if (!battle) continue;
    declared += 1;
    out.push({ kind: 'declared', battle });
  }

  trimWars(world);
  return out;
}

/** 参与方散了（被 L2 战败灭门、被本文件的灭门、或后继无人散伙）→ 大战收场。
 *  不处理的话，编年史里会留下一场「永远打不完、对手已经不存在」的战争。 */
function sweepAbandoned(world, rng, out) {
  for (let i = 0; i < world.wars.length; i += 1) {
    const battle = world.wars[i];
    if (battle.phase === 'ended') continue;
    let gone = false;
    const all = battle.sideA.concat(battle.sideB);
    for (let k = 0; k < all.length; k += 1) {
      const s = world.factionById(all[k]);
      if (!s || s.destroyedDay >= 0) { gone = true; break; }
    }
    if (!gone) continue;
    endBattle(world, battle, 'abandoned', rng);
    world.record(
      `【${battle.aName}】与【${battle.bName}】在${battle.place}的对峙不了了之。`,
      'war',
      warActors(world, battle),
    );
    if (out) out.push({ kind: 'abandoned', battle });
  }
}

function trimWars(world) {
  const wars = world.wars;
  while (wars.length > GREAT_BATTLE_LOG_CAP) {
    let idx = -1;
    for (let i = 0; i < wars.length; i += 1) {
      if (wars[i].phase === 'ended') { idx = i; break; }
    }
    if (idx < 0) break;
    wars.splice(idx, 1);
  }
}

/**
 * 宣战。开一场「大战」。
 *
 * 与 sects.js 的 L2 宣战（stepConflicts 里那一段）的分工：
 *   · L2 是**摩擦**：无门槛、一 tick 定胜负、战败才灭门；
 *   · L1 是**大战**：有规模门槛、分阵交锋、跨数年、有特殊结局。
 * 两者共用 `warTension` 与 `sect.war` 标记，所以不会同时打两场。
 */
function declareWar(world, rng, a, b) {
  if (!world || !a || !b || a === b) return null;
  if (a.war.has(b.id)) return null;                 // 已经在打，不重复开一场
  const at = borderPoint(world, a, b);
  const place = placeOf(world, at.x, at.y);
  const type = pickBattleType(rng, a, b, world);

  const battle = {
    id: world.nextWarId,
    aId: a.id,
    bId: b.id,
    aName: a.name,
    bName: b.name,
    typeId: type.id,
    typeLabel: type.label,
    place,
    x: at.x,
    y: at.y,
    // 参与方数量：两个主战 + 至多两名盟友（「第三方插手」，主线 L1 没有）
    sideA: [a.id],
    sideB: [b.id],
    tension: warTension(world, a, b),
    clashCount: 0,
    startedDay: world.day,
    lastClashDay: world.day,
    phase: 'mobilizing',
    outcome: null,
    winnerId: 0,
    loserId: 0,
    wounded: 0,
    casualties: [],       // 战殁者名单（真实状态，随 battle 进存档）
    result: null,
  };
  world.nextWarId += 1;

  addAllies(world, battle, a, b, 'A');
  addAllies(world, battle, b, a, 'B');

  a.war.add(b.id);
  b.war.add(a.id);
  // lastConflictDay 早就躺在 sect 对象上（sects.js:89）并且 save.js:238 存了它，
  // 但此前**没有任何读者**——这里第一次让它真的生效：50 年冷却。
  a.lastConflictDay = world.day;
  b.lastConflictDay = world.day;
  a.relations.set(b.id, clamp((a.relations.get(b.id) || 0) - 25, -100, 100));
  b.relations.set(a.id, clamp((b.relations.get(a.id) || 0) - 25, -100, 100));

  world.warLog.declared += 1;
  world.wars.push(battle);
  // 宣战：一次门派大战的**起点**。进大事账本（`record` 那条留给编年史滚动窗口）。
  world.milestone(fillTemplate(pickFrom(rng, GREAT_BATTLE_PRELUDE), {
    a: a.name, b: b.name, place, type: type.label,
  }), 'war', warActors(world, battle));
  return battle;
}

/**
 * 拉盟友助拳。
 *
 * 降级说明：主线 L4 的「门人助拳」是逐人的（sectWarDestinySystem，按 relations
 * 图与 lineage 挑人，`characterSupport` clamp 到 [-40, 80]）。沙盒没有
 * lineage / merit / fateTask，于是降到**宗门级**：关系分 ≥ ALLIED_THRESHOLD(26)
 * 的盟友整家加入，出力按 GREAT_BATTLE_ALLY_WEIGHT 折算。
 *
 * ⚠️ 盟友**不写 war 标记**（不参与 life.js 的 findEnemy 逐人厮杀），
 * 只出战力、吃伤亡。写进去的话，一场大战会把半个天下拖进逐人混战——
 * 那是 L3 的事，不是这里。
 */
function addAllies(world, battle, patron, foe, tag) {
  const cands = [];
  for (let i = 0; i < world.factions.length; i += 1) {
    const s = world.factions[i];
    if (s.id === patron.id || s.id === foe.id) continue;
    if (s.destroyedDay >= 0) continue;
    if (battle.sideA.includes(s.id) || battle.sideB.includes(s.id)) continue;
    if (s.war.has(foe.id)) continue;
    const score = patron.relations.get(s.id) || 0;
    if (score < ALLIED_THRESHOLD) continue;
    cands.push({ s, score });
  }
  cands.sort((x, y) => (y.score - x.score) || (x.s.id - y.s.id));
  const n = Math.min(GREAT_BATTLE_MAX_ALLIES, cands.length);
  for (let i = 0; i < n; i += 1) {
    const side = tag === 'A' ? battle.sideA : battle.sideB;
    side.push(cands[i].s.id);
  }
}

/** 一方战力：主战全算，盟友按权重折算 */
function sidePower(world, battle, tag) {
  const ids = tag === 'A' ? battle.sideA : battle.sideB;
  let p = 0;
  for (let i = 0; i < ids.length; i += 1) {
    const s = world.factionById(ids[i]);
    if (!s) continue;
    p += warPower(world, s) * (i === 0 ? 1 : GREAT_BATTLE_ALLY_WEIGHT);
  }
  return p;
}

/**
 * 一阵交锋。来源 strategicRegionSystem.js:354-377。
 *
 * 与主线一致的三件事：间隔 ≥ 0.8 年（调度层保证）、紧张度 +18、
 * 双方参战者按人吃伤害。**但伤害一律 `Math.max(1, ...)` 保底**——
 * 主线 L2 就是这样（`Math.max(1, ...)`，strategicRegionSystem.js:276），
 * 所以「交锋」阶段不死人，死人只发生在最终结算。这条分界是有意的：
 * 中途死人的话，参战名单与战力会在两阵之间悄悄变化，复盘困难。
 */
function clash(world, rng, battle) {
  battle.lastClashDay = world.day;
  battle.clashCount += 1;
  battle.tension = clamp(battle.tension + GREAT_BATTLE_TENSION_STEP, 0, GREAT_BATTLE_TENSION_CAP);

  woundSide(world, rng, battle, battle.sideA);
  woundSide(world, rng, battle, battle.sideB);

  const a = world.factionById(battle.aId);
  const b = world.factionById(battle.bId);
  if (a && b) {
    a.relations.set(b.id, clamp((a.relations.get(b.id) || 0) - 8, -100, 100));
    b.relations.set(a.id, clamp((b.relations.get(a.id) || 0) - 8, -100, 100));
  }
  world.record(
    `【${battle.aName}】与【${battle.bName}】在${battle.place}交锋第 ${battle.clashCount} 阵。`,
    'war',
    warActors(world, battle),
  );
}

/** 一方的参战者：按境界取前 N。来源 strategicRegionSystem.js:192-197 / :269 */
function fightersOf(world, ids) {
  const set = new Set(ids);
  const out = [];
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.hp <= 0) continue;
    if ((e.level || 0) <= 0) continue;
    if (!set.has(e.faction)) continue;
    out.push(e);
  }
  out.sort((x, y) => ((y.level || 0) - (x.level || 0)) || (x.id - y.id));
  return out.slice(0, GREAT_BATTLE_FIGHTERS);
}

function fighterRisk(world, e) {
  const sect = world.factionById(e.faction);
  if (sect) {
    if (e.id === sect.leaderId) return GREAT_BATTLE_RISK_LEADER;
    if ((sect.elders || []).includes(e.id)) return GREAT_BATTLE_RISK_ELDER;
  }
  return GREAT_BATTLE_RISK_MEMBER;
}

/** 一阵的伤害结算。来源 strategicRegionSystem.js:267-292（destinyRisk 换成 fighterRisk） */
function woundSide(world, rng, battle, ids) {
  const fighters = fightersOf(world, ids);
  for (let i = 0; i < fighters.length; i += 1) {
    const e = fighters[i];
    const risk = fighterRisk(world, e);
    const ratio = (GREAT_BATTLE_WOUND_MIN
      + rng() * (GREAT_BATTLE_WOUND_MAX - GREAT_BATTLE_WOUND_MIN)) * risk;
    e.hp = Math.max(1, e.hp - e.maxHp * ratio);
    // 战功经验。来源 strategicRegionSystem.js:277-278（seizer 1.35 倍）
    e.exp = (e.exp || 0)
      + Math.max(8, (e.level || 1) * EXP_PER_LEVEL * 0.04 * (risk >= GREAT_BATTLE_RISK_LEADER ? 1.35 : 1));
    battle.wounded += 1;
  }
}

// ── 结算 ───────────────────────────────────────────────────
/**
 * 结算一场大战。返回结算结果对象（同时写回 battle.result）。
 *
 * 判定顺序（**顺序有讲究，不能换**）：
 *   1. 天降干预（天道止戈）—— 先掷。它是「外力压过一切」，压过胜负与灭门。
 *      主线 L2 的 forceTruce（strategicRegionSystem.js:626-659）就是这个语义，
 *      只是沙盒没有玩家干预入口，所以降级成一条年度小概率。
 *   2. 两败俱伤 —— 双方分差 < 6 时，谁也不夺谁的灵脉，两家一起伤。
 *      主线**没有**这个结局（war.md §5：L1 只有「一胜一伤」），是沙盒补的。
 *   3. 一胜一负 —— 主线原式：`影响力 + 天命 + 助拳 + rand × 12`。
 *      沙盒把「影响力」换成 warPower（见 warPower 注释），助拳换成盟友折算，
 *      天命取自可选的 sect.mandate。
 *   4. 战殁结算（含元婴脱壳）。
 *   5. 战败灭门（走 dissolveSect）。
 *
 * 幂等：phase 已是 ended 时直接返回上一次的 result，不会重复结算、
 * 不会重复扣稳定度（stepWar 的年度循环里可能被多次触达）。
 */
export function resolveGreatBattle(world, rng, battle) {
  ensureWarState(world);
  if (!battle) return null;
  if (battle.phase === 'ended') return battle.result || null;

  const a = world.factionById(battle.aId);
  const b = world.factionById(battle.bId);

  // 兜底：主战一方已经不在（正常路径由 sweepAbandoned 每 tick 收掉，
  // 但直接调本函数做测试时可能撞上）→ 当场中止，不要往下算胜负。
  // 不兜这一下的话，`winner.reputation` 会在 null 上抛，而且是**偶发**的。
  if (!a || !b) {
    endBattle(world, battle, 'abandoned', rng);
    battle.result = null;
    return null;
  }

  const result = {
    id: battle.id,
    place: battle.place,
    type: battle.typeLabel,
    aName: battle.aName,
    bName: battle.bName,
    clashCount: battle.clashCount,
    tension: battle.tension,
    outcome: 'decisive',
    winnerId: 0,
    loserId: 0,
    margin: 0,
    stalemate: false,
    truce: false,
    destroyed: 0,
    destroyedName: null,
    leylineTaken: null,
    deadCount: 0,
    escaped: 0,
    woundedCount: battle.wounded,
    casualties: [],
  };

  const pA = sidePower(world, battle, 'A') + mandateBonus(a, world.day);
  const pB = sidePower(world, battle, 'B') + mandateBonus(b, world.day);
  const scoreA = pA + rng() * 12;
  const scoreB = pB + rng() * 12;
  const margin = Math.abs(scoreA - scoreB);
  result.margin = margin;

  // ── 1) 天降干预 ──
  if (rng() < GREAT_BATTLE_TRUCE_CHANCE) {
    result.outcome = 'truce';
    result.truce = true;
    applyTruce(world, rng, battle, a, b, result);
    finish(world, rng, battle, result);
    return result;
  }

  // ── 2) 两败俱伤 ──
  if (margin < GREAT_BATTLE_STALEMATE_MARGIN) {
    result.outcome = 'stalemate';
    result.stalemate = true;
    applyStalemate(world, battle, a, b, result);
    applyFatalities(world, rng, battle, result, null);
    finish(world, rng, battle, result);
    return result;
  }

  // ── 3) 一胜一负 ──
  const winner = scoreA >= scoreB ? a : b;      // 平局判给 A（strategicRegionSystem.js:339 同款）
  const loser = winner === a ? b : a;
  result.winnerId = winner.id;
  result.loserId = loser.id;

  winner.reputation = clamp((winner.reputation || 0) + 8, 0, 100);
  winner.stability = clamp((winner.stability || 0) + 4, 0, 100);
  loser.reputation = clamp((loser.reputation || 0) - 6, 0, 100);
  // ⚠️ 比 L2 的 −8 重：这是「大战」，不是摩擦。调大的理由见文件头标定说明。
  loser.stability = clamp((loser.stability || 0) - 16, 0, 100);

  // 夺一道灵脉。取 loser 手里第一道，**同时改双方清单与 l.owner**——
  // 只改一边的话，「谁的清单里有它」和「它认谁当主」会分叉，
  // 而 territory.js 的 applyLeylineClaims 读的是 l.owner，下一轮就会把清单再改回来。
  if (loser.leylines && loser.leylines.length) {
    const taken = loser.leylines[0];
    loser.leylines.shift();
    winner.leylines.push(taken);
    const l = world.leylineById(taken);
    if (l) l.owner = winner.id;
    result.leylineTaken = taken;
  }

  winner.relations.set(loser.id, clamp((winner.relations.get(loser.id) || 0) - 10, -100, 100));
  loser.relations.set(winner.id, clamp((loser.relations.get(winner.id) || 0) - 30, -100, 100));

  // 败方侧别：只有在 loser 确实是某一侧的主战时才有意义（助拳的那一方不算）
  const loserSide = loser.id === battle.aId ? 'A' : (loser.id === battle.bId ? 'B' : null);
  result.fatalSide = loserSide;

  applyFatalities(world, rng, battle, result, loserSide);
  maybeDestroyLoser(world, rng, battle, loser, result);

  finish(world, rng, battle, result);
  return result;
}

/** 天道止戈。来源 strategicRegionSystem.js:626-659（关系 +38、止戈 16 年） */
function applyTruce(world, rng, battle, a, b, result) {
  if (a) a.stability = clamp((a.stability || 0) + 2, 0, 100);
  if (b) b.stability = clamp((b.stability || 0) + 2, 0, 100);
  if (a && b) {
    a.relations.set(b.id, clamp((a.relations.get(b.id) || 0) + 38, -100, 100));
    b.relations.set(a.id, clamp((b.relations.get(a.id) || 0) + 38, -100, 100));
  }
  // 冷却起点留在本日：50 年的大战冷却本就把 16 年的止戈期盖住了，
  // 不必再单独记一个 truceUntil（多一样能对不上的东西）。
  if (a) a.lastConflictDay = world.day;
  if (b) b.lastConflictDay = world.day;
  world.record(
    `天道降临${battle.place}，【${battle.aName}】与【${battle.bName}】暂止兵戈，`
    + `共治此地 ${STRATEGY_TRUCE_YEARS} 年。`,
    'war',
    warActors(world, battle),
  );
  speak(world, rng, 'watch');
}

/** 两败俱伤：谁也不夺地，两家一起伤 */
function applyStalemate(world, battle, a, b, result) {
  if (a) {
    a.stability = clamp((a.stability || 0) - 12, 0, 100);
    a.reputation = clamp((a.reputation || 0) - 4, 0, 100);
  }
  if (b) {
    b.stability = clamp((b.stability || 0) - 12, 0, 100);
    b.reputation = clamp((b.reputation || 0) - 4, 0, 100);
  }
  if (a && b) {
    a.relations.set(b.id, clamp((a.relations.get(b.id) || 0) - 6, -100, 100));
    b.relations.set(a.id, clamp((b.relations.get(a.id) || 0) - 6, -100, 100));
  }
  world.record(
    `【${battle.aName}】与【${battle.bName}】在${battle.place}杀到两败俱伤，`
    + '谁也没能夺下对方的地。',
    'war',
    warActors(world, battle),
  );
}

/**
 * 战殁结算 + 元婴脱壳。
 *
 * `loserSide` 为 null 表示「两败俱伤」——两边都按败方基准掷，
 * 因为两败俱伤的语义就是「谁都没赢」。
 */
function applyFatalities(world, rng, battle, result, loserSide) {
  for (let k = 0; k < 2; k += 1) {
    const tag = k === 0 ? 'A' : 'B';
    const ids = tag === 'A' ? battle.sideA : battle.sideB;
    const isLoser = loserSide === null || loserSide === tag;
    let p = isLoser ? GREAT_BATTLE_FATAL_BASE : GREAT_BATTLE_FATAL_WINNER;
    if (isLoser) p += Math.min(GREAT_BATTLE_FATAL_MARGIN_CAP, result.margin / GREAT_BATTLE_MARGIN_DIV);
    p = clamp(p, 0, GREAT_BATTLE_FATAL_MAX);

    const fighters = fightersOf(world, ids);
    for (let i = 0; i < fighters.length; i += 1) {
      const e = fighters[i];
      if (e.hp <= 0) continue;
      if (rng() >= p) continue;
      if (tryNascentEscape(world, rng, e, battle.place)) {
        result.escaped += 1;
        continue;
      }
      // 死因标记：战殁 ⇒ `deathOther`（不是寿终）。大战不盖 `killedBy` 快照
      // （死者是「哪一场仗」的，不是「谁杀的」），所以走不了战斗池。
      e.diedOf = 'war';
      e.hp = 0;
      const dead = { id: e.id, name: e.name, level: e.level || 0, faction: e.faction, day: world.day };
      battle.casualties.push(dead);
      result.casualties.push(dead);
      result.deadCount += 1;
      world.warLog.casualties += 1;
    }
  }
}

/**
 * 元婴脱壳。来源 reincarnationSystem.js:123-140，公式与上下限照抄：
 *   clamp(0.48 + (level−30)×0.012 + fortune/500 + 灵兽护主 0.07, 0.48, 0.88)
 * 触发后 hp = maxHp × 0.18、心魔 +12，**一生只此一次**。
 *
 * ⚠️ `entity.beast` 是 initEntity 给的字段（cultivation.js:114），但全仓
 * 没有任何地方写过它——所以灵兽护主那一项**目前恒为 0**。留着它，是为了
 * 灵兽接轴之后这里自动生效，不必再改一次。
 *
 * ⚠️ `nascentEscapeUsed` 是一列**新状态**，必须进存档（见文件头第 2 条）。
 * 不存的话读档后同一个人可以反复脱壳。
 */
function tryNascentEscape(world, rng, e, place) {
  if ((e.level || 0) < GREAT_BATTLE_NASCENT_MIN_LEVEL) return false;
  if (e.nascentEscapeUsed) return false;
  const guard = e.beast ? GREAT_BATTLE_COMPANION_GUARD : 0;
  const chance = clamp(
    GREAT_BATTLE_NASCENT_BASE
    + ((e.level || 0) - GREAT_BATTLE_NASCENT_MIN_LEVEL) * GREAT_BATTLE_NASCENT_PER_LEVEL
    + (e.fortune || 0) / GREAT_BATTLE_NASCENT_FORTUNE_DIV
    + guard,
    GREAT_BATTLE_NASCENT_MIN,
    GREAT_BATTLE_NASCENT_MAX,
  );
  if (rng() >= chance) return false;
  e.nascentEscapeUsed = true;
  e.hp = Math.max(1, e.maxHp * 0.18);
  e.heartDemon = clamp((e.heartDemon || 0) + 12, 0, 100);
  // 这条是**脱壳者本人**的事（不是宗门的事），当事人就是 `e`。
  world.record(`【${e.name}】于${place}战殁之际元婴脱壳，重伤遁走。`, 'war', e);
  return true;
}

/**
 * 战败灭门。
 *
 * ⚠️ 这里**只调 dissolveSect**，不自己写门人去向。sects.js:632-659 已经把
 * 三样善后做全了：门人 `faction = 0`、村落 `faction = 0`、灵脉 `owner = 0`，
 * 外加 `sect.war.clear()` 与一条 'sect' 编年史。两处各写一份迟早会漂，
 * 而漂的那一半不会报错——只会让某些门人「凭空消失」。
 *
 * ⚠️ 本文件额外写一条 `kind = 'war'` 的编年史（要求如此），**排在
 * dissolveSect 之前**：dissolveSect 内部那条是 'sect' 口径（宗门兴衰线），
 * 这一条是战争口径（战报线），两条都要有。
 */
function maybeDestroyLoser(world, rng, battle, loser, result) {
  if (!loser || loser.destroyedDay >= 0) return false;
  const living = livingMembers(world, loser);
  if (living > GREAT_BATTLE_DESTROY_MEMBERS) return false;
  if ((loser.stability || 0) >= GREAT_BATTLE_DESTROY_STABILITY) return false;

  // 当事人是**败方的宗主**。必须在 dissolveSect 之前取出来存成局部变量：
  // dissolveSect 会把全体门人的 `faction` 清成 0（sects.js:638-644），
  // 之后再按 faction 反查就查不到了（这里虽按 id 查，但先取仍是对的写法）。
  // 取不到（无宗主 / 已被死亡管线移出数组）才退回双方宗主。
  const loserLeader = world.entities.find((e) => e.id === loser.leaderId);
  world.record(
    `【${loser.name}】在${battle.place}一战后门中凋零，山门为他人所夺，就此除名。`,
    'war',
    loserLeader || warActors(world, battle),
  );
  dissolveSect(world, loser, GREAT_BATTLE_DESTROY_REASON, rng);
  world.warLog.destroyed += 1;
  result.destroyed += 1;
  result.destroyedName = loser.name;
  abortWarsWith(world, rng, loser.id, battle);
  return true;
}

/** 存活门人（只数**修士**，不含凡人。与 sects.js:176 的 pop 口径一致）。
 *
 * ⚠️ 这里踩过一次概念坑，值得写下来：一开始数的是「所有 faction === sect.id
 * 且 hp > 0 的实体」，结果一家宗门动辄四五十人——因为**村落被收编时，
 * 村里的凡人也被写上了 faction**（sects.js:524）。于是灭门判据 `living <= 3`
 * 永远够不着，大战灭门这条路一次都没通过，而函数返回得干干净净。
 * 门派的「人」在沙盒里从来只指修士（sects.js:162-164 那段注释就是这么说的）。
 *
 * 用现算而不是 sect.pop：pop 要到下一次 stepSects 才刷新，而战殁就发生在
 * 本 tick 的 applyFatalities 里——拿 pop 判灭门会慢一整年。
 */
function livingMembers(world, sect) {
  let n = 0;
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.faction !== sect.id || e.hp <= 0) continue;
    if ((e.level || 0) <= 0) continue;
    n += 1;
  }
  return n;
}

/**
 * 一场大战的「当事人」：双方的宗主。
 *
 * 大战是**宗门级**的，但传记是**个人级**的——中间这一层映射由这里负责。
 * 只取双方宗主，不取全体门人：一场大战能卷进几十上百人，
 * 若逐个写进个人日志，LOG_CAP=32 的重要性淘汰会把这些人真正的一生
 * （觉醒、突破、结侣）全挤出去，传记反而更空。
 * 宗主是唯一在编年史里被点名的人，也就只有他当得起「亲历」二字。
 *
 * 返回过滤掉查不到实体（已死/已解散）的那一半，可能是 [a]、[b]、[a,b] 或 []。
 * 死者的实体由 powers.js 的死亡管线从 `world.entities` 里 splice 掉，
 * 所以「查不到」天然覆盖「已死」；本 tick 刚战殁的宗主仍留在数组里，
 * 而那正是**应当**记下这一战的人（他亲历了），故不再额外按 hp 过滤。
 *
 * 纯读：不抽签、不改任何状态——主随机流的次数与顺序必须原样不变。
 */
function warActors(world, battle) {
  if (!world || !battle) return [];
  const out = [];
  const ids = [battle.aId, battle.bId];
  for (let i = 0; i < ids.length; i += 1) {
    const sect = world.factionById(ids[i]);
    if (!sect || !sect.leaderId) continue;
    const leader = world.entities.find((e) => e.id === sect.leaderId);
    if (leader && out.indexOf(leader) < 0) out.push(leader);
  }
  return out;
}

/** 一家散了之后，它在别处进行中的大战也要收场（否则 ongoing 永远不清零） */
function abortWarsWith(world, rng, sectId, except) {
  for (let i = 0; i < world.wars.length; i += 1) {
    const w = world.wars[i];
    if (w === except || w.phase === 'ended') continue;
    if (!w.sideA.includes(sectId) && !w.sideB.includes(sectId)) continue;
    endBattle(world, w, 'abandoned', rng);
    world.record(`【${w.aName}】与【${w.bName}】的战事因一方覆灭而中止。`, 'war', warActors(world, w));
  }
}

/** 收场：清标记、记账、写战报 */
function finish(world, rng, battle, result) {
  const winnerName = result.winnerId && world.factionById(result.winnerId)
    ? world.factionById(result.winnerId).name
    : (result.stalemate ? '两败俱伤' : (result.truce ? '天道止戈' : '无人'));
  world.record(fillTemplate(pickFrom(rng, GREAT_BATTLE_AFTERMATH), {
    a: battle.aName, b: battle.bName, place: battle.place, type: battle.typeLabel,
  }), 'war', warActors(world, battle));
  world.record(
    `【${battle.aName}】与【${battle.bName}】的${battle.typeLabel}在${battle.place}落定，`
    + `共 ${battle.clashCount} 阵，${winnerName}。`,
    'war',
    warActors(world, battle),
  );
  endBattle(world, battle, result.outcome, rng);
  battle.result = result;
}

/** 收场：phase/endedDay/outcome + 清双方 war 标记 + 账本 */
function endBattle(world, battle, outcome, rng) {
  battle.phase = 'ended';
  battle.endedDay = world.day;
  battle.outcome = outcome;
  clearWarFlags(world, battle);
  world.warLog.resolved += 1;
  return battle;
}

/** 只清「主战双方」之间的标记。sect.war 里可能还压着 L2 的摩擦标记，不能一把 clear */
function clearWarFlags(world, battle) {
  const ids = [battle.aId, battle.bId];
  for (let i = 0; i < ids.length; i += 1) {
    const s = world.factionById(ids[i]);
    if (!s) continue;
    for (let k = 0; k < ids.length; k += 1) {
      if (ids[k] !== ids[i]) s.war.delete(ids[k]);
    }
  }
}

// ── 读数 ───────────────────────────────────────────────────
/**
 * 给长测与面板用的统计。**纯读数**：不抽签、不改状态、不调 warPower。
 * 累计量看 warLog（world.wars 有 400 条上限，会被裁剪）。
 */
export function warStats(world) {
  const wars = (world && world.wars) || [];
  const log = (world && world.warLog) || {};
  let ongoing = 0;
  let ended = 0;
  let decisive = 0;
  let stalemate = 0;
  let truce = 0;
  let abandoned = 0;
  let casualties = 0;
  let maxClash = 0;
  for (let i = 0; i < wars.length; i += 1) {
    const w = wars[i];
    if (w.phase === 'ended') ended += 1; else ongoing += 1;
    if (w.outcome === 'decisive') decisive += 1;
    else if (w.outcome === 'stalemate') stalemate += 1;
    else if (w.outcome === 'truce') truce += 1;
    else if (w.outcome === 'abandoned') abandoned += 1;
    if (w.casualties && w.casualties.length) casualties += w.casualties.length;
    if ((w.clashCount || 0) > maxClash) maxClash = w.clashCount;
  }
  return {
    total: wars.length,
    ongoing,
    ended,
    decisive,
    stalemate,
    truce,
    abandoned,
    destroyed: log.destroyed || 0,
    casualties: log.casualties || 0,
    declared: log.declared || 0,
    resolved: log.resolved || 0,
    great: log.declared || 0,
    maxClash,
    recentCasualties: casualties,
  };
}

// ── 测试出口 ───────────────────────────────────────────────
export const warInternals = Object.freeze({
  borderKey,
  borderPoint,
  seatGap,
  doctrineAggression,
  mandateBonus,
  eligiblePairs,
  declareWar,
  clash,
  fightersOf,
  fighterRisk,
  woundSide,
  sidePower,
  applyFatalities,
  tryNascentEscape,
  maybeDestroyLoser,
  livingMembers,
  abortWarsWith,
  finish,
  endBattle,
  clearWarFlags,
  trimWars,
  pickBattleType,
  affinityPower,
  topLevelOf,
  siteValueOf,
  GREAT_BATTLE_PRELUDE,
  GREAT_BATTLE_AFTERMATH,
});
