// 水墨沙盒 · 幽冥界的鬼魂与鬼修（模拟侧）
//
// 契约：`reports/d5/BATCH2-DESIGN.md`（**冻结**：字段名与语义不得自行改）。
//
// 本模块只做三件事：
//   1. `spawnNetherGhost(nether, spec)` —— 在幽冥里造一个鬼魂 / 鬼修实体。
//      **这是唯一的实体构造处**（别在别处再拼一份实体字面量）。
//   2. `stepNether(world, days)` —— 低频 tick，五步：
//      对账 / 到期 / 积怨升阶 / 上限逐出 / **空间行为**（D6-2 工程包 D）。
//   3. `ghostTierOf` / `GHOST_TIER_NAMES` —— 鬼修六级**由 `level` 现算**（不入档）。
//
// ───────────────────────────────────────────────────────────────────────
// 铁律一：本模块**一次 `rng()` 都不抽**（违反了就是 bug）
// ───────────────────────────────────────────────────────────────────────
//
// `enterNether`（`sim/reincarnation.js`）收到的 `rng` 是**凡间主随机流**
// （`life.js` 的 `this.rng`，全世界共用的一条种子流）。多抽一次签，整条世界线
// 就漂走，既有长测的全部标定当场作废。所以：
//   · 落点用**纯哈希**派生（`hash32`），不抽签——同 `world/planes.js:212-232`
//     的 `findLandingTile`（螺旋外扩、不抽签）的纪律；
//   · `stepNether` 的五步全是确定性算术，也不抽签。第五步「空间行为」
//     （D6-2 工程包 D）**同样零 rng**：目标采样走 `hashStep` 推进的哈希流，
//     重选间隔由 `hash32(`${id}:${day}`)` 派生——见 `stepNetherSpatial`。
// ⚠️ **不要**为了「加点随机性」在这里调 `rng`。鬼魂的行为本来就该是确定性的
//    （幽冥讲规矩、讲账目、讲排队），随机性没有位置。
// ⚠️ 与上界工程包 C 的关键差别：上界**另开了一条 `spatialRng` 流**（因为
//    `UpperLife` 是类、有地方挂它）；幽冥**没有第二条流可用**——`stepNether`
//    是纯函数，任何 `mulberry32(...)` 都是新状态、又没地方挂（挂上去就被
//    序列化器看见，违反铁律二）。所以幽冥的空间行为**一律走纯哈希**，
//    连「另开一条流」的选项都不存在。这不是省事，是结构决定的。
//
// ───────────────────────────────────────────────────────────────────────
// 铁律二：能现算的不入档
// ───────────────────────────────────────────────────────────────────────
//
// 鬼修六级**没有** `ghostTier` 这一列——它由 `ghostTierOf(level)` 现算。
// 存下来就是「与 `level` 一一对应的派生量入档」，正是铁律二要禁的东西。
// 顺带好处：鬼修靠 `level > 0` **自动**拿到 `unitsLayer.js` 的束带与灵光，
// **零渲染改动**（契约 §三）。
//
// ───────────────────────────────────────────────────────────────────────
// 铁律三：绝不存裸的凡间 id
// ───────────────────────────────────────────────────────────────────────
//
// `ghostOf` 是**身份快照**（全是值，零 id 引用），`ref` 用 `'mortal:<id>'` 字符串。
// 理由见契约 §三：凡间 id 与幽冥 / 上界 id **同段会撞号**（三个 `World` 的
// `nextEntityId` 各自从 1 / `UPPER_ID_BASE` / `NETHER_ID_BASE` 起编），
// 存裸数字就是指向别人的悬垂指针，而且**不报错**。
// ⚠️ 唯一保留的 id 是 `soulBind`——它指向**凡间魂池**（`world.souls`），
//    是「这只鬼在等的那条魂」，不是实体 id（契约 §三 row[67] 的语义）。
//    它与实体自带的 `soulId`（「这一世由哪个神魂转来」）**同名不同义**，
//    故 2026-09-23 拆成两个独立属性（见 `GHOST_TEMPLATE` 的注释）。

import { NEVER_DECAY_DAY, TIME, SPECIES, SPECIES_INFO } from '../core/config.js';
// ⚠️ 幽冥「能不能站人」的判据**只有一处**：`world/planes.js` 的 `netherWalkable`
// （2026-09-24 · D6-2 工程包 B 收敛）。本模块原先自己手写「先判水、再判
// `TERRAIN_INFO.walk`」那一对，与裂隙的位置过滤各有一份——两份判据迟早分叉，
// 而分叉的后果是「鬼魂落点能站、裂隙落点站不住」（或反过来），**不报错**。
// 依赖方向：`netherLife → planes → core/config`，planes 不回头引 sim，不成环
// （`scripts/inkbox-import-check.mjs` 会验）。
import { netherWalkable } from '../world/planes.js';
// 幽冥独有法宝 / 功法的**铭名池**（D6-3 工程包 C）。命名纪律见 `core/lore.js` 里
// 那两个池子的头注释（避开幽冥三物 / 鬼修六级 / 魂五路）。槽位 / 品阶 / 品质
// 沿用凡间那套常量——幽冥物品走的是**同一套** `artifacts.js` 形状，不另立一套。
import {
  NETHER_ARTIFACT_NAMES, NETHER_TECHNIQUES,
  EQUIP_SLOTS, EQUIP_TIERS, EQUIP_QUALITIES,
} from '../core/lore.js';
// 幽冥物品走的是**同一套**法宝形状与耐久上限（D6-3 工程包 C）——它迟早要经
// 幽冥缝漏进凡间、被凡人按 `artifacts.js` 的规则捡起来用。所以这里**不另立
// 一份耐久常量**，直接用凡间那一份（`MAX_DURABILITY`）。依赖方向：
// `netherLife → artifacts → lore / noise`，artifacts 不回头引 sim，不成环。
import { MAX_DURABILITY } from './artifacts.js';

/**
 * 鬼修六级的**考古定名**（`06册 §5.3`，`00_文案使用说明:229-239` 锁死）。
 * ⚠️ **不得擅改或新造同义词**。
 */
export const GHOST_TIER_NAMES = Object.freeze(['游魂', '怨灵', '厉鬼', '鬼将', '鬼王', '鬼帝']);

/**
 * 鬼修六级**由 `level` 分档派生**（契约 §三 的纯函数）。
 *
 *   level 1–10 → 0 游魂 · 11–20 → 1 怨灵 · 21–30 → 2 厉鬼
 *   31–40 → 3 鬼将 · 41–50 → 4 鬼王 · 51–60 → 5 鬼帝
 *
 * 普通鬼魂 `level = 0` ⇒ 返回 **-1**（拿不到束带 / 灵光，见契约 §三）。
 * 非法值（NaN / 负数）也归 -1——`!(level > 0)` 对 NaN 为真，这正是我们要的。
 */
export function ghostTierOf(level) {
  if (!(level > 0)) return -1;
  return Math.min(5, Math.floor((level - 1) / 10));
}

/** 鬼修 `level` 的上限（契约 §六 第 3 条） */
export const GHOST_LEVEL_CAP = 60;

/**
 * 普通鬼魂的消散年限（`world.day` 坐标下的相对寿命）。
 *
 * 为什么是 200 年：普通鬼魂的来源是 `linger`（滞留幽冥），而滞留者
 * **有牵挂、在等一个人**（`06册 G13-07/G13-12`）——它本来就是「暂时留下」。
 * 它有两重死法：
 *   · **对账消散**（契约 §六 第 1 条）：它绑的那条魂一旦转世离开魂池，
 *     这只鬼立刻散（「魂一离开魂池即散」，契约 §二）；
 *   · **到期消散**（第 2 条）：万一那条魂长期卡在池里（池满被逐、或寿元未到），
 *     鬼自己也会慢慢淡去。
 * 200 年与 `enterNether` 给滞留者的等待期（`waitYears = 120 + rng*240`，即
 * 120–360 年）同量级：**两者谁先到都合理**，不会出现「鬼等不到魂就先烂了」
 * 这种一边倒的失效。⚠️ **待标定**：等 8-F 的幽冥渲染层能出图后按视觉回标。
 */
export const GHOST_DECAY_YEARS = 200;

/**
 * 鬼修的消散年限。**远长于普通鬼魂**（契约要求）。
 *
 * 鬼修是「魂被留下，慢慢磨」（`G13-04`）——它的语义就是**长期存在**，
 * 所以给一个远超长测尺度（300–800 年）的值，让「鬼修能活到升阶」在结构上成立。
 * 3000 年足够它从游魂一路积怨到鬼帝（见 `TIER_THRESHOLDS`），
 * 又不至于让存档无限膨胀（上限另有 `NETHER_SOUL_CAP` 兜底）。
 */
export const CULTIVATOR_DECAY_YEARS = 3000;

/**
 * 鬼修每年积的怨（契约 §六 第 3 条：`ghostRancor += RANCOR_PER_YEAR * days / 360`）。
 *
 * 取 1：一个「每过一年积一分怨」的直观刻度，配合下面的阈值表，
 * 让「几百年里能看到阶位变化」而不是「几千年才动一次」。⚠️ **待标定**。
 */
export const RANCOR_PER_YEAR = 1;

/**
 * 升阶所需的**累计积怨**，下标 = 目标阶。`TIER_THRESHOLDS[0]` 恒 0（起点，不使用）。
 *
 * 判据（契约 §六 第 3 条）：`ghostRancor` 跨过 `TIER_THRESHOLDS[ghostTierOf(level)+1]`
 * ⇒ `level += 1`。由于 `level` 每次只 +1、而阶每 10 级才跳一档，这个循环会
 * **自动收敛在每一阶的起点**（1 / 11 / 21 / 31 / 41 / 51）：
 * 跨过阈值后 `level` 一路 +1 到该阶起点，下一档阈值更高，于是停住。
 *
 * 刻度：游魂→怨灵 10 年 · →厉鬼 30 年 · →鬼将 70 年 · →鬼王 150 年 · →鬼帝 300 年。
 * 与 `CULTIVATOR_DECAY_YEARS = 3000` 配合：300 年就能看到一位鬼帝。
 * ⚠️ **待标定**（数值「大概处理」即可，理由写在这里，不要凭感觉改）。
 */
export const TIER_THRESHOLDS = Object.freeze([0, 10, 30, 70, 150, 300]);

/**
 * 幽冥实体数上限（契约 §六 第 4 条）。
 *
 * 为什么取 400（比魂池 `SOUL_CAP = 120` 大、又不能让存档爆）：
 *   · 鬼魂来自两条通道——`linger`（**受魂池 120 上限约束**，因为绑魂、
 *     魂一离池就散）与 `ghost` / `wraith`（**无限累积**，不绑魂、不进池）。
 *     后者是唯一会无界增长的来源，所以上限必须显著大于 120，否则
 *     `linger` 一路就会把额度吃光、把 `ghost`/`wraith` 的鬼魂全逐出去；
 *   · 实体行是 68 列的定长数组，一行的 JSON 约数百字节 ⇒ 400 行约百余 KB，
 *     对存档是可接受的量级（`World.addEntity` 的 `LIMITS.maxEntities = 3000`
 *     是硬顶，400 远在其下，逐出逻辑不会撞上那个硬顶而静默丢人）。
 * ⚠️ **待标定**：等长测能给出 `ghost` / `wraith` 的真实到达率后回标。
 */
export const NETHER_SOUL_CAP = 400;

// ───────────────────────────────────────────────────────────────────────
// D6-2 工程包 D · 幽冥最低生态 —— 常量
// ───────────────────────────────────────────────────────────────────────
//
// 规格（`THREE_REALMS.md` NETHER 节）：普通鬼魂沿冥河窄带活动 · 鬼修分档活动范围 ·
// 阴气（`veg`）**影响**（不是决定）积怨成长 · 消散地点轻量留痕 · 高阶鬼修空间吸引。
// ⚠️ **不做**鬼城 / 鬼宗 / 幽冥战争 / 寻路（A*）。**零 rng**（见文件头铁律一）。

/** 鬼魂每游戏日的位移（格）。`SPECIES_INFO.ghost.speed = 0.5` ⇒ 实际 0.6 格/日。 */
const NETHER_TILES_PER_DAY = 1.2;

/** 单拍位移硬上限（格）。幽冥 tick = 10 游戏日 ⇒ 名义 12 格，被此值截平。 */
const NETHER_MAX_MOVE_TILES = 6;

/** 移动子步长度上限（格）。与凡间 `moveTowards` / 上界 `moveSpatially` 同款纪律。 */
const NETHER_MAX_SUBSTEP = 0.5;

/** 一次重选目标采样多少次。采样走哈希流（不抽签），次数固定 ⇒ 与人口解耦。 */
const NETHER_TARGET_TRIES = 20;

/** 重选间隔下界 / 上界（游戏日）。`timer` 落在 [MIN, MAX] 内，**不抽签**、走哈希派生。 */
const NETHER_RETARGET_MIN_DAYS = 25;
const NETHER_RETARGET_MAX_DAYS = 70;

/**
 * D2 · 鬼修**每升一阶**额外获得的活动半径（格）。
 *
 * 活动半径 = `BANK_RADIUS + ghostTierOf(level) * GHOST_TIER_REACH`：
 *   · 普通鬼魂（非鬼修）恒为 `BANK_RADIUS`（= 4）⇒ **只在窄带内**（D1）；
 *   · 游魂 4 · 怨灵 7 · 厉鬼 10 · 鬼将 13 · 鬼王 16 · 鬼帝 19（D2）。
 * 「活动半径」是**判据**：目标格必须满足「以它为中心、半径 = 活动半径的窗口内
 * 存在冥河」（`nearRiverAt`）——所以半径越大，越能远离冥河走到荒原。
 * ⚠️ **待标定**（数值「大概处理」即可；理由写在这里，不要凭感觉改）。
 */
const GHOST_TIER_REACH = 3;

/** 供测试 / 面板读的**只读**副本（= `GHOST_TIER_REACH`），避免测试写死 3。 */
export const NETHER_TIER_REACH = GHOST_TIER_REACH;

/**
 * D3 · 阴气（`veg`）对**积怨增速**的环境系数区间：`MIN + (MAX-MIN) * veg`。
 *
 * `veg = 0`（荒芜）⇒ 0.6；`veg = 1`（阴气浓厚）⇒ 1.4。
 * ⚠️⚠️ **「影响，不是决定」**（`THREE_REALMS.md` 写死的约束）：系数**下界 0.6 > 0**，
 *    所以「离开最佳格就永远不能升级」**结构上不成立**——基础积怨独立于环境存在。
 *    谁把这个下界调成 0，谁就把 D3 从「影响」改成了「决定」，当场违反规格。
 * ⚠️ 与 5u⑦ 的耦合：隔离世界 60 年后要求 5 只鬼修 `level > 1`（即积怨跨过 10）。
 *    最坏情况（全程 veg=0）系数 0.6 ⇒ 60 年积怨 36 ⇒ level 11 > 1，**有余量**。
 * ⚠️ **待标定**。
 */
const RANCOR_ENV_MIN = 0.6;
const RANCOR_ENV_MAX = 1.4;

/**
 * D4 · 消散地点在 `veg` 层留下的阴气增量（**轻量**）。
 *
 * 消散时把所在格的 `veg` 抬 `DECAY_TRACE_VEG`（加性、clamp 到 1）。取 0.03：
 *   · 远大于量化步长（1/65535 ≈ 1.5e-5）⇒ **存档往返存得住**（这是关键——
 *     若取 1e-5 量级，`encodeQuantized` 会把它抹平，留痕静默消失）；
 *   · 又足够小，单次消散不会把一格从荒芜变成浓厚（需要几十次才明显）。
 * ⚠️ **加性**（不衰减）：同一格反复消散会持续累积——这正是「鬼魂越聚越多的地方
 *    阴气越重」的几何表达。「可回涨」指的是它可以继续往上加，不是会自动回落。
 * ⚠️ **待标定**（等幽冥渲染层能出图后按视觉回标）。
 *
 * ⚠️ **导出**（D6-2 工程包 F）：不变量回归要断言「留痕的增量**远大于**量化步长」
 *    （否则 `encodeQuantized` 会把它抹平 ⇒ 「内存可见、存档消失」）。
 *    测试里写死 `0.03` 会在标定后**静默腐烂**（判据还绿，但已经不是那个数了）——
 *    与 `NETHER_BANK_RADIUS` / `NETHER_TIER_REACH` 同一条理由，一并导出。
 */
export const DECAY_TRACE_VEG = 0.03;

/**
 * D5 · 成为「空间吸引源」的最低阶。
 *
 * `ghostTierOf(level) >= GHOST_LURE_TIER`（鬼将及以上）的鬼修，会吸引**低阶**
 * （普通鬼魂 + 阶位低于此门槛的鬼修）朝它靠拢。
 * ⚠️ 这是**移动方向的偏好**（采样时给「离吸引源更近」的样本加分），**不是**
 *    「鬼城」——不建结构、不改实体、不产生新状态。规格明令禁止鬼城 / 鬼宗。
 */
const GHOST_LURE_TIER = 3;

/**
 * 冥河判据（与 `worldgenNether.js` 的刻河、`io/save.js` 的水层同源）：
 * `water[i] > 0.0015` 即河面，否则是可通行的陆格。
 * ⚠️ **不要另写一套阈值**——落点判定与生成侧一旦分叉，鬼魂会落进冥河里站不住，
 *    而且不报错（同 `planes.js:201` 的 `upperWalkable` 纪律）。
 */
const WATER_EPS = 0.0015;

/**
 * 窄带半径（格）：离冥河多远之内算「河边窄带」（`06册 §5` 的「魂出生在河边窄带」）。
 * 与 `worldgenNether.js` 的 `RIVER_HALF_WIDTH + BANK_BAND_TILES ≈ 5.4` 对齐，
 * 取 4 略收紧一点，让鬼魂确实落在**贴着河的那一圈**，而不是整个河谷。
 */
const BANK_RADIUS = 4;

/**
 * 供测试 / 面板读的**只读**窄带半径（= `BANK_RADIUS`）。
 * ⚠️ 导出它是为了让测试**不写死 4**——写死的阈值会跟着实现漂，
 *    而断言的语义是「普通鬼魂待在规范允许的范围内」。
 */
export const NETHER_BANK_RADIUS = BANK_RADIUS;

/**
 * 窄带候选格的缓存：`WeakMap<netherWorld, Int32Array>`。
 *
 * ⚠️ **必须是模块级 `WeakMap`，不能挂成 `world.netherBankCache` 属性**——
 *    序列化器拾取的是 world 自己的可枚举属性，挂上去就会被它看见并写进存档
 *    （铁律二：能现算的不入档）。同 `sim/rifts.js` 的 `RIFT_RNG` 做法。
 * ⚠️ 用 `WeakMap` 还有一层好处：幽冥 world 被替换（读档 / 换世界）时，
 *    旧 world 的缓存会被 GC 回收，不会泄漏到新一局。
 */
const BANK_CACHE = new WeakMap();

/**
 * 32 位字符串 / 数字哈希（FNV-1a 变体）。**纯函数、不抽签**。
 * 用来把「这条魂是谁」映射成一个稳定的落点，同种子逐次可复现。
 */
function hash32(seed) {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * 32 位哈希流的一次推进（murmur3 风格的 finalizer）。**纯函数、不抽签**。
 *
 * 用途：在 `pickNetherSpatialTarget` 里**代替 `rng()`** 生成采样坐标——
 * 幽冥不许有任何随机流（铁律一），所以「随机采样」必须落成「确定性哈希采样」。
 * 给定同一个种子，序列逐次可复现；不同实体的种子含 `id`，互不相同。
 *
 * ⚠️ 与 `hash32` 的分工：`hash32` 把「一个字符串 / 数字」映射成「一个值」；
 *    `hashStep` 把「一个值」推进到「下一个值」——后者才能当**流**用。
 */
function hashStep(h) {
  let x = h >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x >>> 0;
}

/**
 * 判「以 `(x, y)` 为中心、半径 `radius` 的窗口内是否有冥河」。**纯函数、不抽签**。
 *
 * 这是「离冥河多远」的**唯一判据**——`bankCandidates`（落点窄带）与空间行为的
 * 活动范围（D1 普通鬼魂 / D2 鬼修分档）**共用它**。
 * ⚠️ 抽出来的理由与 `netherWalkable` 同一条纪律：判据一旦有两份，迟早分叉，
 *    而分叉的后果是「鬼魂落点算在窄带内、活动范围却算在窄带外」这种**不报错**的错位。
 * ⚠️ 与 2026-09-24 之前的 `bankCandidates` 内联循环**逐字等价**（半径 / 判据 / 边界
 *    处理全同），只是把「有没有冥河」这一步收敛成一处。
 */
function nearRiverAt(nether, x, y, radius) {
  const { w, h, water } = nether;
  const y0 = Math.max(0, y - radius);
  const y1 = Math.min(h - 1, y + radius);
  const x0 = Math.max(0, x - radius);
  const x1 = Math.min(w - 1, x + radius);
  for (let yy = y0; yy <= y1; yy += 1) {
    const base = yy * w;
    for (let xx = x0; xx <= x1; xx += 1) {
      if (water[base + xx] > WATER_EPS) return true;
    }
  }
  return false;
}

/**
 * 算出幽冥里「河边窄带」的可通行陆格清单（缓存）。**纯函数、不抽签**。
 *
 * 候选 = 满足两条的格：
 *   ① `planes.netherWalkable(nether, i)` 为真（不是冥河水面 **且** 地表可通行）；
 *   ② 在以它为中心、半径 `BANK_RADIUS` 的窗口内**存在**冥河格（`nearRiverAt`）。
 * 第 ② 条把候选锁在「贴着河的那一圈」——这正是「魂出生在河边窄带」的几何对应。
 * ⚠️ 第 ① 条是**调函数**、不是本文件自己写判据：单源在 `world/planes.js`，
 *    与裂隙的位置过滤共用（理由见文件头的 import 注释）。
 */
function bankCandidates(nether) {
  const cached = BANK_CACHE.get(nether);
  if (cached) return cached;
  const { w, h } = nether;
  const out = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      // ① 不是水、且可通行——判据单源在 `planes.netherWalkable`（理由见文件头）。
      if (!netherWalkable(nether, i)) continue;
      // ② 附近有冥河——判据单源在 `nearRiverAt`（与活动范围共用）。
      if (nearRiverAt(nether, x, y, BANK_RADIUS)) out.push(i);
    }
  }
  const arr = Int32Array.from(out);
  BANK_CACHE.set(nether, arr);
  return arr;
}

/**
 * 供测试 / 面板读的**只读**「离冥河不超过 `radius` 的可通行格」清单（不写回）。
 *
 * 默认 `radius = BANK_RADIUS`（河边窄带，与 `bankCandidates` 同源）；
 * 传更大的 `radius` 可读鬼修的活动范围（D2）。
 * ⚠️ 这是**活动范围判据的只读暴露**——测试用它验「鬼魂待在规范允许的范围里」，
 *    是**规范 vs 实现**（与 5v 用 `upperWalkable` 验上界落点同款），不是循环论证：
 *    若空间行为把鬼魂送出规范范围，这条断言当场红。
 * ⚠️ 不缓存非默认半径的结果（只读工具，调用次数少）；默认半径直接复用 `bankCandidates`。
 */
export function netherBankTiles(nether, radius = BANK_RADIUS) {
  if (radius === BANK_RADIUS) return bankCandidates(nether);
  const out = [];
  for (let y = 0; y < nether.h; y += 1) {
    for (let x = 0; x < nether.w; x += 1) {
      const i = y * nether.w + x;
      if (!netherWalkable(nether, i)) continue;
      if (nearRiverAt(nether, x, y, radius)) out.push(i);
    }
  }
  return Int32Array.from(out);
}

/**
 * 给一只鬼魂找落点：**纯哈希**在窄带候选里取一格，找不到就退回地图中心。
 * 同 `planes.findLandingTile` 的兜底纪律（一张连窄带都没有的幽冥地图本身
 * 就是生成器的 bug，会在别处先红）。
 *
 * @param {object} nether  幽冥 world
 * @param {string} seedKey 纯哈希种子（`s<soulId>` 或 `ghostOf.ref`）
 */
function landingFor(nether, seedKey) {
  const cands = bankCandidates(nether);
  if (cands.length === 0) return { x: nether.w >> 1, y: nether.h >> 1 };
  const i = cands[hash32(seedKey) % cands.length];
  return { x: i % nether.w, y: Math.floor(i / nether.w) };
}

/**
 * 幽冥人口账本（`nether.popLog`）的**唯一形状定义与兜底**。
 *
 * 五键语义（契约 §四）：
 *   · `ghostBorn`          —— 累计生成鬼魂（**含**鬼修）；
 *   · `cultivatorBorn`     —— 累计成鬼修（`ghostBorn` 的**子集**）；
 *   · `ghostDied`          —— 累计消散（到期 / 魂离池 / 逐出，三条路径都记）；
 *   · `cultivatorAdvanced` —— 累计升阶次数；
 *   · `evicted`            —— `ghostDied` 的**子集**：其中因上限被逐出的那部分。
 *
 * ⚠️⚠️ **这是全仓唯一一处写这五个键名的地方**（与 `planes.ensureUpperPopLog`
 * 同款纪律）。`world/worldgenNether.js` 的 `resetNetherSystems` **调用本函数**
 * 来建初值，而不是再抄一份字面量——「形状只有一处定义」是结构上的保证，
 * 不是靠注释提醒。谁要加键，只改这里。
 *
 * ⚠️ 逐键兜底（不是整体兜底）：老档 / 手工拼的幽冥 world 可能缺键，
 * 而 `undefined + 1 = NaN`——NaN 不报错、`JSON.stringify` 还会把它变成 `null`，
 * 于是账本从此静默失效（同 `ensureSoulLog` 的处置）。
 *
 * ⚠️ 与上界的 `popLog` **不撞车**：两者是不同 `World` 实例上的不同对象。
 */
export function ensureNetherPopLog(nether) {
  if (!nether.popLog || typeof nether.popLog !== 'object') {
    nether.popLog = {
      ghostBorn: 0,
      cultivatorBorn: 0,
      ghostDied: 0,
      cultivatorAdvanced: 0,
      evicted: 0,
      fellIn: 0,
      climbedOut: 0,
      // ── 幽冥物品账（D6-3 工程包 C）───────────────────────────
      // 四条独立流水，构成幽冥物品池的守恒式
      //   `nether.artifacts.length === itemsSpawned + itemsFellIn
      //                                − itemsLeakedOut − itemsDecayed`
      // （`netherItemStats` 里同步读）。**放在 `popLog` 里**（而非
      // `nether.artifactLog`）的理由：`popLog` 是幽冥**唯一**的世界级账本，
      // 形状只有 `ensureNetherPopLog` 一处定义、且整对象序列化；而
      // `nether.artifactLog` 的形状来自凡间那套构造器（`forged/found/...`），
      // 往它上面加幽冥键会让「同一个 `artifactLog` 两种键集」——正是要避免的
      // 「两份真相」。名字带 `items` 前缀，与人口计数（`ghostBorn` 等）分开。
      itemsSpawned: 0,    // 幽冥自生（`stepNetherItems` 凝出）
      itemsFellIn: 0,     // 跌入者随身带下来的凡间法宝
      itemsLeakedOut: 0,  // 经幽冥缝漏回凡间的
      itemsDecayed: 0,    // 超上限朽掉的最旧一件
      // ── 跨位面夺舍（D6-3 工程包 D）──────────────────────────
      // 「鬼修的元神住进凡间活人身体、从幽冥消失」——**第四条离开路径**
      // （与 `climbedOut` 并列：那是鬼**自己爬**出去，这是元神**夺舍**过去）。
      // ⇒ 幽冥守恒式随之扩成 `鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺`。
      // ⚠️ 与 `climbedOut` 一样**不并进 `ghostDied`**：「走了」不是「死了」。
      possessedOut: 0,
    };
    return nether.popLog;
  }
  const log = nether.popLog;
  if (typeof log.ghostBorn !== 'number') log.ghostBorn = 0;
  if (typeof log.cultivatorBorn !== 'number') log.cultivatorBorn = 0;
  if (typeof log.ghostDied !== 'number') log.ghostDied = 0;
  if (typeof log.cultivatorAdvanced !== 'number') log.cultivatorAdvanced = 0;
  if (typeof log.evicted !== 'number') log.evicted = 0;
  // ── `fellIn`（D6-3 工程包 A）──────────────────────────────
  // 「从裂缝跌进幽冥的活人」——它是 `ghostBorn` 的**子计数**（不是并列项），
  // 与 `cultivatorBorn` 同一个性质：`ghostBorn` 已经在 `spawnNetherGhost` 里
  // 涨过一笔，所以**守恒式 `鬼魂+鬼修 === 生 − 亡 − 逐` 一个字都不用改**
  // （`netherEcoStats` 只读 `ghostBorn`）。把它并进 `ghostBorn` 之外单列，
  // 是为了让「跌进来的」与「死了归了魂路的」**可分辨**——否则面板上
  // 「幽冥来了新鬼」读不出是裂缝送来的还是寿终归来的。
  // ⚠️ 整个 `popLog` 是 `io/save.js` 的 `NETHER_ONLY_KEYS` **整对象**序列化的
  //    （「存在才写 / 存在才还原」），所以加键**不需要动 `save.js`**——
  //    这正是当初把幽冥账本做成整对象、而 `riftLog` 做成逐键显式的原因。
  if (typeof log.fellIn !== 'number') log.fellIn = 0;
  // ── `climbedOut`（D6-3 工程包 B）──────────────────────────
  // 「从裂缝爬进凡间的鬼」——它是**第三条离开路径**，与 `fellIn` 不同性质：
  //   · `ghostDied`（消散）与 `evicted`（上限逐出，`ghostDied` 的子集）是原有两条；
  //   · `climbedOut` 是新增的第三条，**独立于 `ghostDied`**。
  // ⚠️ **不并进 `ghostDied`**：那是「死了」，而它是「走了」。把「走了」记成
  //    「死了」与 E 包拒绝把「被逐出」并进「亡」是同一条理由（`逐` 独立成键）。
  // ⇒ 幽冥守恒式随之扩成 **`鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出`**
  //    （`netherEcoStats` 里同步改；这是**契约变更**，不是「多了一栏显示」）。
  if (typeof log.climbedOut !== 'number') log.climbedOut = 0;
  // ── 幽冥物品账四条（D6-3 工程包 C）────────────────────────
  // 兜底纪律同上：老档 / 手工构造的 `popLog` 缺这几键时补 0，
  // 否则 `undefined + 1 = NaN` 会让守恒式静默失效（`NaN !== number` 恒真）。
  if (typeof log.itemsSpawned !== 'number') log.itemsSpawned = 0;
  if (typeof log.itemsFellIn !== 'number') log.itemsFellIn = 0;
  if (typeof log.itemsLeakedOut !== 'number') log.itemsLeakedOut = 0;
  if (typeof log.itemsDecayed !== 'number') log.itemsDecayed = 0;
  // ── `possessedOut`（D6-3 工程包 D）────────────────────────
  // 「被鬼修夺舍、从幽冥消失的鬼修」——第四条离开路径（与 `climbedOut` 并列）。
  // 兜底纪律同上：老档 / 手工构造的 `popLog` 缺这一键时补 0。
  if (typeof log.possessedOut !== 'number') log.possessedOut = 0;
  return log;
}

/**
 * 鬼魂 / 鬼修实体的**静态完整模板**。
 *
 * ⚠️⚠️ **本模板的键集必须与 `sim/cultivation.js` 的 `initEntity()` 产物 +
 * `World.addEntity()` 的补键 + `io/save.js` 的 `restoreEntity()` 产物**完全一致**。
 * `scripts/inkbox-save-equiv.mjs:291` 的 `compareEntityFields` 取**键集并集**，
 * 「活对象缺键、读档后有键」与反向都会当场红——这条断言钉着「同一个世界两种形状」
 * 这类静默失效。所以新增任何实体字段时，**这里要同步加一行**。
 *
 * ⚠️ 为什么是**手写静态字面量 + `structuredClone`**，而不是调 `initEntity`：
 *    `initEntity` 内部会抽 `rng` 决定灵根 / 天资（`awaken` → `rollSpiritRoot`），
 *    而铁律一禁止在本模块抽签。所以照它的**产物**手写一份，绝不调用它。
 *    （`possession.js` 头注释记过同类教训：想复用「初始化实体」却会带进随机流。）
 *
 * 鬼魂的取值（契约 §三 / §七）：
 *   · `sp = 'ghost'`（`SPECIES.GHOST`）——必须显式注册，否则 `unitsLayer` 的
 *     `|| 凡人` 兜底会让鬼魂静默长成凡人；
 *   · `level`：`ghostCultivator` ⇒ 1（游魂，`G14-01`「新成的鬼修叫游魂」）；
 *     `ghost` ⇒ 0（`ghostTierOf(0) === -1`，拿不到束带 / 灵光）；
 *   · `lifespan` 取 `SPECIES_INFO.ghost.lifespan`（极大值）——鬼魂的消散由
 *     `ghostDecayDay` 控制，**不走**凡间那套 `age >= lifespan`；
 *   · `hp / maxHp` 取 `SPECIES_INFO.ghost.hp`（不走 `maxHpFor`：那个读 `sp` 只认
 *     `cultivator`，给幽灵算出来的是凡人血条）。
 *   · `root = null`：鬼修走「积怨」不走「灵根」（§8.3②），生前的灵根只在
 *     `ghostOf.root` 里作快照。
 */
const GHOST_TEMPLATE = Object.freeze({
  // ── 基础运动 / 身份（`World.addEntity` 的 `id` 由它自己赋）──────────
  id: 0,
  sp: SPECIES.GHOST || 'ghost',
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  hp: SPECIES_INFO.ghost.hp,
  maxHp: SPECIES_INFO.ghost.hp,
  age: 0,
  lifespan: SPECIES_INFO.ghost.lifespan,
  faction: 0,
  village: 0,
  state: 'wander',
  timer: 0,
  tx: 0,
  ty: 0,
  anim: 0,
  face: 1,
  name: '孤魂',
  kills: 0,
  carried: 0,
  // ── 修仙层（`initEntity` 的产物；鬼魂大多为默认值）──────────────
  level: 0,
  exp: 0,
  root: null,
  dao: null,
  karma: 0,
  fortune: 40,
  heartDemon: 0,
  mind: 70,
  pollution: 0,
  daoTitle: null,
  bloodline: null,
  techniques: [],
  beast: null,
  forbidden: null,
  madUntil: -1,
  artifacts: [],
  trialCount: 0,
  lastTrialDay: -1e9,
  lastDemonDay: -1e9,
  lastKarmaDay: -1e9,
  lastAwakenTry: 0,
  lastBeastDay: -1e9,
  foundedSect: 0,
  // ── 转世 / 家世 / 传记 / 夺舍 / 飞升来历 / 养伤（照 `initEntity` 的初值）──
  incarnation: 1,
  soulId: null,
  pastLife: null,
  surname: null,
  parentA: 0,
  parentB: 0,
  clan: 0,
  gen: 0,
  heritageQ: -1,
  heritageB: null,
  heritageM: null,
  log: [],
  possessedBy: null,
  // 不良状态印记（D6-3 工程包 D）。鬼魂本身不会被夺舍（它们没有肉身可夺），
  // 但模板必须与 `initEntity` 的键集**逐键一致**——否则「活对象缺键、读档后有键」
  // 会被 save-equiv 的键集并集判据当场抓住（同本模板头注释的纪律）。
  possessionScar: null,
  nascentEscapeUsed: false,
  fromMortal: false,
  fromSect: null,
  restUntil: -1e9,
  // ── 幽冥专属五列（契约 §三 row[63..67]）────────────────────────
  //   ⚠️ 列 67 的「魂池链接」用**独立属性 `soulBind`**，**不是**上面的 `soulId`：
  //      `soulId` 的语义是「这一世由哪个神魂**转来**」（来源），
  //      而鬼魂要记的是「它在等的那条魂」（绑定）——两者同名会互相冲掉
  //      （`io/save.js` 写侧 row[47] 与 row[67] 各写各的，读侧 row[67] 覆盖 row[47]
  //      会把「转世同源」静默冲成 null）。2026-09-23 由 save.js / cultivation.js
  //      两处收敛成 `soulBind`，**本模板必须与 `initEntity` 的键集一致**。
  soulKind: null,
  ghostOf: null,
  ghostRancor: 0,
  ghostDecayDay: NEVER_DECAY_DAY,
  soulBind: null,
  // 关系网：鬼魂不与凡间实体共享关系网（跨世界 id 会撞号），恒空 Map。
  relations: new Map(),
});

/**
 * 在幽冥里造一个鬼魂 / 鬼修实体。**这是唯一的实体构造处**。
 *
 * @param {object} nether 幽冥 world（`generateNetherWorld` / `deserializeNetherWorld` 的产物）
 * @param {object} spec
 *   · `kind`       `'ghost'`（普通鬼魂）| `'ghostCultivator'`（鬼修）；其它值按 `'ghost'` 处理
 *   · `ghostOf`    身份快照（契约 §三；见 `reincarnation.js` 的 `ghostSnapshot`）
 *   · `soulId`     魂池链接（仅 `linger` 普通鬼魂有；`null` = 不绑魂）
 *   · `decayYears` 消散年限（缺省按 kind 取 `GHOST_DECAY_YEARS` / `CULTIVATOR_DECAY_YEARS`）
 *   · `x` / `y`    死者的凡间坐标。**不直接用作落点**（坐标不对位，契约 §五），
 *                  只在没有 `soulId` 时作为哈希种子的一部分，保证确定性。
 * @returns {object|null} 新造的实体（`addEntity` 顶到硬顶时返回 null）
 *
 * ⚠️ **不抽任何 `rng`**（铁律一）。落点、id、数值全部确定性。
 */
export function spawnNetherGhost(nether, spec = {}) {
  if (!nether || !Array.isArray(nether.entities)) return null;
  const kind = spec.kind === 'ghostCultivator' ? 'ghostCultivator' : 'ghost';
  const isCultivator = kind === 'ghostCultivator';
  // 消散日的锚点是**死亡那一刻的 `world.day`**（契约 §三：`ghostDecayDay` 是
  // `world.day` 坐标下的绝对日）。优先取 `ghostOf.deathDay`——它正是 `enterNether`
  // 记下的 `world.day`；退回 `nether.day`（main.js 每 tick 同步，但同步发生在
  // `life.step` **之后**，所以它是上一 tick 的值，只作兜底）。
  // ⚠️ 用 `nether.day` 单独当锚会有一个静默的坑：探针 / 无头路径若不同步
  //    `nether.day`，它就恒为 0，于是所有鬼魂的消散日都落在「生成日 + N 年」，
  //    整批在同一 tick 一起消失——看起来像「到期机制正常」，其实是时间源错了。
  const day = (spec.ghostOf && typeof spec.ghostOf.deathDay === 'number')
    ? spec.ghostOf.deathDay
    : (typeof nether.day === 'number' ? nether.day : 0);

  const decayYears = Number.isFinite(spec.decayYears)
    ? spec.decayYears
    : (isCultivator ? CULTIVATOR_DECAY_YEARS : GHOST_DECAY_YEARS);
  // 负寿命表示永不消散。截止日必须在正向时间轴末端，否则 `day >= cutoff` 会立即成立。
  const ghostDecayDay = decayYears >= 0
    ? day + decayYears * TIME.daysPerYear
    : NEVER_DECAY_DAY;

  // 落点种子：优先绑定的魂 id（唯一），否则用身份快照的 `mortal:<id>`。
  // 两者都没有时退回 `nether.nextEntityId`（仍是确定性的）。
  const seedKey = spec.soulId !== null && spec.soulId !== undefined
    ? `s${spec.soulId}`
    : ((spec.ghostOf && spec.ghostOf.ref) || `e${nether.nextEntityId}`);
  const spot = landingFor(nether, seedKey);

  const entity = structuredClone(GHOST_TEMPLATE);
  entity.x = spot.x + 0.5;
  entity.y = spot.y + 0.5;
  entity.tx = spot.x + 0.5;
  entity.ty = spot.y + 0.5;
  entity.name = (spec.ghostOf && spec.ghostOf.name) || '孤魂';
  entity.level = isCultivator ? 1 : 0;   // 鬼修起步=游魂（G14-01）；鬼魂 level 0
  entity.soulKind = kind;
  entity.ghostOf = spec.ghostOf || null;
  entity.ghostRancor = 0;
  entity.ghostDecayDay = ghostDecayDay;
  // 列 67 的魂池链接用 `soulBind`（不是 `soulId`——见 `GHOST_TEMPLATE` 的注释）。
  entity.soulBind = spec.soulId === undefined ? null : spec.soulId;

  const added = nether.addEntity(entity);   // 赋 id（NETHER_ID_BASE 段）+ 入列
  if (!added) return null;                  // 撞 `LIMITS.maxEntities` 硬顶：不记账

  const log = ensureNetherPopLog(nether);
  log.ghostBorn += 1;
  if (isCultivator) log.cultivatorBorn += 1;
  return added;
}

/**
 * 幽冥低频 tick（契约 §六）。挂载点见 `main.js` 的 `netherAccum`（每 10 游戏日）。
 *
 * @param {object} world **凡间** world（挂 `.nether` 的那个）。
 *   ⚠️ 必须是凡间 world，不是幽冥 world：第 1 步的「对账」要读**凡间魂池**
 *   `world.souls`（`planes.createPlanes` 的 `nether.souls` 别名**在游戏里 0 调用点**，
 *   所以 `nether.souls` 恒空，拿它会对账成「所有绑魂鬼魂都该散」——静默的灾难）。
 * @param {number} days 距上次 tick 推进的游戏日数（≈10）
 *
 * 五步顺序**是承重的**（先对账、再到期、再积怨、再逐出、最后空间行为）：
 *   · 对账必须在积怨之前——一个该散的鬼不该先升一阶再散；
 *   · 到期与对账都在积怨之前——同上；
 *   · 逐出在空间行为之前——空间行为遍历的是「本拍还活着的」，先清干净再动，
 *     免得给一只刚被逐出的鬼白算一步位移（读数里多一个幽灵）；
 *   · 空间行为放最后还有一个理由：它读 `veg`（D3 的输入），而消散留痕（D4）
 *     在第 1 / 2 步已经写完 ⇒ 本拍的空间行为看到的是**最新的** veg。
 *
 * ⚠️ **全程零 `rng`**（铁律一）。⚠️ **时间源只有 `world.day`**（三界共享一条轴）。
 */
export function stepNether(world, days) {
  const nether = world && world.nether;
  if (!nether || !Array.isArray(nether.entities)) return;   // 无头测试路径：安静跳过
  const day = typeof world.day === 'number' ? world.day : (nether.day || 0);
  const souls = Array.isArray(world.souls) ? world.souls : [];
  const list = nether.entities;
  const log = ensureNetherPopLog(nether);

  // ── 1. 对账：绑魂的普通鬼魂，魂一离开魂池即散（自愈）────────────────
  // 魂池上限逐出（`reincarnation.js` 的 `world.souls.length > SOUL_CAP`）
  // 会悄悄弄丢对账对象，靠这一步兜住——否则「魂早转世了、鬼还在河边站着」。
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const e = list[i];
    if (e.soulKind !== 'ghost') continue;
    if (e.soulBind === null || e.soulBind === undefined) continue;
    let alive = false;
    for (let k = 0; k < souls.length; k += 1) {
      if (souls[k].id === e.soulBind) { alive = true; break; }
    }
    if (!alive) { leaveDecayTrace(nether, e); list.splice(i, 1); log.ghostDied += 1; }
  }

  // ── 2. 到期消散 ─────────────────────────────────────────────
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const e = list[i];
    if (typeof e.ghostDecayDay === 'number' && day >= e.ghostDecayDay) {
      leaveDecayTrace(nether, e);
      list.splice(i, 1);
      log.ghostDied += 1;
    }
  }

  // ── 3. 鬼修积怨升阶（**改的是 `level`**，阶由 `ghostTierOf(level)` 现算）──
  //
  // D3（工程包 D）：积怨增速**受所在格阴气 `veg` 影响**——系数 =
  // `RANCOR_ENV_MIN + (RANCOR_ENV_MAX - RANCOR_ENV_MIN) * veg`，即 [0.6, 1.4]。
  // ⚠️ **「影响，不是决定」**：下界 0.6 > 0 ⇒ 即使站在荒芜（veg = 0）也照样积怨，
  //    「离开最佳格就永远不能升级」结构上不成立。基础积怨独立于环境存在。
  // ⚠️ 取格用 `Math.floor(坐标)`：实体坐标是浮点中心（落点 + 0.5）。
  // ⚠️ 鬼修会移动（第五步），所以它读到的是**当前位置**的 veg——这正是
  //    「环境参与成长」的含义：挪到阴气重的地方，积怨更快。
  const baseGain = RANCOR_PER_YEAR * (Number.isFinite(days) ? days : 0) / TIME.daysPerYear;
  const envSpan = RANCOR_ENV_MAX - RANCOR_ENV_MIN;
  const vegAt = (e) => {
    if (!nether.veg) return 0;
    const x = Math.floor(e.x);
    const y = Math.floor(e.y);
    if (!(x >= 0 && y >= 0 && x < nether.w && y < nether.h)) return 0;
    return nether.veg[y * nether.w + x] || 0;
  };
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (e.soulKind !== 'ghostCultivator') continue;
    const envFactor = RANCOR_ENV_MIN + envSpan * vegAt(e);
    e.ghostRancor = (e.ghostRancor || 0) + baseGain * envFactor;
    const tier = ghostTierOf(e.level);
    if (tier < 0 || tier >= 5) continue;      // 非法 / 已到顶
    const need = TIER_THRESHOLDS[tier + 1];
    if (need === undefined) continue;
    if (e.ghostRancor >= need && e.level < GHOST_LEVEL_CAP) {
      e.level += 1;
      log.cultivatorAdvanced += 1;
    }
  }

  // ── 4. 上限：逐出**最老的普通鬼魂**（优先非鬼修）──────────────────
  // 「最老」= `id` 最小（id 单调递增、按创建顺序）。逐出优先打普通鬼魂，
  // 让鬼修（有升阶价值、数量少）尽量留住。
  while (list.length > NETHER_SOUL_CAP) {
    let victim = -1;
    for (let pass = 0; pass < 2 && victim < 0; pass += 1) {
      const wantGhost = pass === 0;           // pass 0 先挑普通鬼魂
      for (let i = 0; i < list.length; i += 1) {
        const e = list[i];
        const isGhost = e.soulKind !== 'ghostCultivator';
        if (wantGhost !== isGhost) continue;
        if (victim < 0 || e.id < list[victim].id) victim = i;
      }
    }
    if (victim < 0) break;                    // 理论上到不了（列表非空必有候选）
    list.splice(victim, 1);
    // ⚠️ 只记 `evicted`，**不**记 `ghostDied`（契约 §四 / §六 第 4 步）：
    //    `ghostDied` 的语义是「**消散**」（到期 / 魂离池，契约 §四明列这两种），
    //    逐出是**第三种移除路径**，单列一栏。于是守恒式是
    //        `entities === ghostBorn - ghostDied - evicted`。
    //    （契约只把 `cultivatorBorn` 标成 `ghostBorn` 的**子集**，没把 `evicted`
    //      标成 `ghostDied` 的子集——别自作主张合并，那会让守恒式少算一截。）
    log.evicted += 1;
  }

  // ── 5. 空间行为：让鬼魂 / 鬼修真的会动（D6-2 工程包 D）────────────
  // ⚠️ 放最后：遍历的是本拍「还活着的」实体（第 1–4 步已清掉该散的），
  //    且读的 `veg` 已含本拍新写的消散留痕（D4）——顺序不是随意的。
  stepNetherSpatial(nether, world, days);

  // ── 6. 幽冥物品：自生法宝（D6-3 工程包 C）──────────────────────
  // ⚠️ 零 rng（同第 1–5 步）。与「跌入者带下来的」共用同一个池 `nether.artifacts`；
  //    去向是经缝漏回凡间（`rifts.js` 的 `leakNetherItem`）。放在最后：
  //    它不读实体，只读 `world.day` 与 `nether.seed`，与第 1–5 步无耦合。
  stepNetherItems(nether, world, days);
}

// ───────────────────────────────────────────────────────────────────────
// D6-3 工程包 C · 幽冥物品（幽冥自生的法宝，携带一门幽冥功法）
// ───────────────────────────────────────────────────────────────────────
//
// 「幽冥有物品」这件事是 C 包才有的。来源两条、去向一条：
//   ① **跌入者带下来**的凡间法宝（`rifts.js` 的 `fallIntoNether` 写进
//      `nether.artifacts`）；
//   ② **幽冥自生**的法宝（本节的 `stepNetherItems` 凝出）；
//   去向：经幽冥缝**漏回凡间**（`rifts.js` 的 `leakNetherItem` 取走）。
//
// ⚠️⚠️ **零 rng**：与 `stepNether` 的五步同一条铁律（文件头铁律一）。
//    「自生」的判定走 `hash32` / `hashStep` 的**确定性哈希流**，不抽签——
//    幽冥没有第二条流可挂（`stepNether` 是纯函数），连「另开一条流」的选项
//    都不存在（与 D6-2 空间行为那一节同一个处境）。
//
// ⚠️ **为什么物品池放在 `nether.artifacts` 而不是新开一个 `nether.items`**：
//    `World` 构造器早就给了每个实例一个 `artifacts = []`，`io/save.js` 的
//    `serializeWorld` 又把它**整数组**写进存档（`upper.artifacts` 就是这么往返的）。
//    复用它 ⇒ **零存档改动**就自动往返；新开一个 `nether.items` 反而要额外接线。

/** 幽冥物品池上限。超了就朽掉**躺得最久**的一件（同凡间 `GROUND_CAP` 的做法） */
export const NETHER_ITEM_CAP = 120;

/** 幽冥自生的判定周期（游戏日）。每 30 天一个判定点，与 `stepNether` 的 10 天节拍错开 */
export const NETHER_ITEM_PERIOD_DAYS = 30;

/** 判定点真的凝出一件的概率（由哈希决定，**不是** `rng()`） */
export const NETHER_ITEM_CHANCE = 0.55;

/**
 * 幽冥自生法宝的品阶 / 品质**固定档**（宝品 / 精良）。
 * 不掷档的理由：幽冥的东西是「沉下来的、浸过阴气的」，不是按主人境界炼出来的；
 * 而且掷档要多消耗哈希流，读数反而更难复核。固定档让「幽冥漏出来的东西」
 * 一眼可辨（凡间的同类物件多半是粗制凡品）。
 */
export const NETHER_ITEM_TIER = 1;
export const NETHER_ITEM_QUALITY = 2;

/**
 * 在幽冥凝出一件**自生**法宝。**纯函数、零 rng**（一切由哈希 `h` 决定）。
 *
 * 形状与 `sim/artifacts.js` 的 `forgeArtifact` 产物**逐字段同形**——因为这件
 * 东西迟早要经缝漏进凡间，被凡人按 `artifacts.js` 的规则捡起来用。多一个字段、
 * 少一个字段都会在那条路上变成「捡起来的东西缺胳膊少腿」。
 *
 * ⚠️ **id 用 `nether.nextArtifactId`**（幽冥自己的计数器，从 1 起）。跨世界时
 *    `rifts.js` 会**重赋 id**（凡→幽、幽→凡两个方向都重赋），所以两边的 id 空间
 *    各自自洽、永不撞号（铁律三）。这里不需要世界限定符——**id 从不跨界**。
 *
 * @returns {object|null} 凝出的法宝；`bankCandidates` 为空（无冥河窄带）时返回 null
 */
function spawnNetherItem(nether, day, h) {
  let s = hashStep(h);
  const slot = EQUIP_SLOTS[s % EQUIP_SLOTS.length];
  s = hashStep(s);
  const pool = NETHER_ARTIFACT_NAMES.filter((n) => n.slots.includes(slot));
  s = hashStep(s);
  const tech = NETHER_TECHNIQUES[s % NETHER_TECHNIQUES.length];
  s = hashStep(s);

  // 落点：冥河窄带内。判据**单源**——直接复用 `bankCandidates`（与鬼魂落点、
  // 裂隙落点同一把尺子 `netherWalkable` + `nearRiverAt`）。窄带为空则这次不凝。
  const cands = bankCandidates(nether);
  if (!cands.length) return null;
  const i = cands[s % cands.length];
  const x = (i % nether.w) + 0.5;
  const y = Math.floor(i / nether.w) + 0.5;

  // 有幽冥铭名就用它；该槽位在池子里没名时退回**凡间那套拼装名**
  // （`artifacts.js` 的 `artifactName` 同款兜底）——不硬造新专名（§5.6）。
  const name = (pool.length ? pool[s % pool.length].name : null)
    || `${EQUIP_QUALITIES[NETHER_ITEM_QUALITY]}${(EQUIP_TIERS[NETHER_ITEM_TIER] || {}).name || ''}${slot}`;

  const a = {
    id: nether.nextArtifactId,
    slot,
    tier: NETHER_ITEM_TIER,
    quality: NETHER_ITEM_QUALITY,
    name,
    durability: MAX_DURABILITY,
    maxDurability: MAX_DURABILITY,
    scars: 0,
    forgedDay: day,
    forgedByName: null,        // 幽冥自生，没有铸造者
    ownerId: 0,                // 无主——它躺在地上等人（或等缝）
    ownerName: null,
    heldSince: day,
    spirit: null,
    history: [[day, 'forged', null]],
    lostDay: day,              // 「躺在地上」的起点（朽坏判据读它）
    x, y,
    // ── 幽冥功法（C 包独有字段）──────────────────────────────
    // 这件法宝**携带**的功法名。凡人捡到即习得（见 `artifacts.js` 的拾取路径
    // `claimNetherTechnique`）。凡间炼出的法宝没有这一字段——它是幽冥物品的
    // **身份标记**：一件带 `technique` 的法宝，来历一定是幽冥。
    technique: tech ? { name: tech.name, note: tech.note } : null,
  };
  nether.nextArtifactId += 1;
  return a;
}

/**
 * 幽冥物品的时钟（`stepNether` 的第 6 步）。**零 rng**。
 *
 * 判定点完全由 `world.day` 推出（`day % PERIOD < days`，同 `stepArtifacts`）——
 * 所以读档后两条世界线仍然同步，**不要**在这里放模块级累加器节流。
 *
 * ⚠️ 顺序：**先判上限、再抽哈希**。池子满了就不该动哈希流（同裂隙「候选空就
 *    不抽签」的纪律）——否则「池满」这件事会静默改变哈希序列，让读数漂移。
 */
export function stepNetherItems(nether, world, days) {
  const items = nether.artifacts;
  if (!Array.isArray(items)) return;                 // 无头测试路径：安静跳过
  const day = typeof world.day === 'number' ? world.day : (nether.day || 0);
  const log = ensureNetherPopLog(nether);

  // 判定点：每 `NETHER_ITEM_PERIOD_DAYS` 天一次。
  if (day % NETHER_ITEM_PERIOD_DAYS >= days) return;
  // 上限：满了不再凝（**在消耗哈希之前**返回）。
  if (items.length >= NETHER_ITEM_CAP) return;

  const slotDay = Math.floor(day / NETHER_ITEM_PERIOD_DAYS);
  let h = hash32(`nether-item:${nether.seed}:${slotDay}`);
  // ⚠️⚠️ **必须先过一遍 `hashStep` 再当均匀分布用**。`hash32`（FNV-1a）对
  //    「前缀相同、只差末尾一个数字」的短串有**极强的高位偏置**：实测
  //    `hash32('nether-item:<seed>:0..9') / 2^32` 全部落在 **0.70–0.74**，
  //    于是 `h/2^32 >= 0.55` **恒真**、`NETHER_ITEM_CHANCE` 形同不存在
  //    （实测 10 个判定点只出 1 件，而不是 ~5.5 件）——而且**不报错**。
  //    `hashStep` 是 murmur3 风格的 finalizer，混一次即可消掉偏置
  //    （实测同一批样本 < 0.55 的有 8/10）。凡间 `stepArtifacts` 用 `rng()`
  //    没有这个问题；幽冥没有 `rng`，所以这条纪律是幽冥专有的。
  h = hashStep(h);
  if (h / 4294967296 >= NETHER_ITEM_CHANCE) return;   // 这一拍不生

  const a = spawnNetherItem(nether, day, h);
  if (!a) return;                                     // 无窄带可落
  items.push(a);
  log.itemsSpawned += 1;

  // 超上限：朽掉躺得最久的一件（同 `artifacts.js` 的 `toGround` 逻辑）。
  // ⚠️ 记账进 `itemsDecayed`——它是一条**独立流水**，守恒式里要减掉，
  //    否则 `itemsSpawned + itemsFellIn` 会比实际存量多。
  trimNetherItems(nether, log);
}

/**
 * 把幽冥物品池压回 `NETHER_ITEM_CAP`：朽掉**躺得最久**（`lostDay` 最小）的一件。
 *
 * 抽出来单列，是因为有**两个**入池点都会把池子撑破：`stepNetherItems`（自生）
 * 与 `rifts.js` 的 `fallIntoNether`（跌入者带下来的法宝）。两处若各写一份裁剪
 * 逻辑，迟早分叉——而分叉的后果是「守恒式对不上，但每处看代码都对」。
 *
 * ⚠️ 每次裁掉都要 `itemsDecayed += 1`：它是守恒式
 *    `alive === spawned + fellIn − leakedOut − decayed` 里的独立一项。
 * @returns {number} 裁掉的件数
 */
export function trimNetherItems(nether, log) {
  const items = nether.artifacts;
  if (!Array.isArray(items)) return 0;
  const l = log || ensureNetherPopLog(nether);
  let n = 0;
  while (items.length > NETHER_ITEM_CAP) {
    let oldest = 0;
    for (let i = 1; i < items.length; i += 1) {
      if ((items[i].lostDay || 0) < (items[oldest].lostDay || 0)) oldest = i;
    }
    items.splice(oldest, 1);
    l.itemsDecayed += 1;
    n += 1;
  }
  return n;
}

/**
 * 幽冥物品的读数（面板 / 探针 / 回归用）。**现算，不入档**（铁律二）。
 *
 * 守恒式：`alive === spawned + fellIn − leakedOut − decayed`。
 * 四条流水全部来自 `nether.popLog`，与「凡间那一侧的 `artifactLog.netherIn/Out`」
 * 是同一批东西的**两端记账**（同 B 包 `wraithStats.total === climbedOut` 的判据形态）。
 */
export function netherItemStats(nether) {
  const items = Array.isArray(nether.artifacts) ? nether.artifacts : [];
  const log = ensureNetherPopLog(nether);
  const spawned = log.itemsSpawned || 0;
  const fellIn = log.itemsFellIn || 0;
  const leakedOut = log.itemsLeakedOut || 0;
  const decayed = log.itemsDecayed || 0;
  return {
    alive: items.length,
    spawned,
    fellIn,
    leakedOut,
    decayed,
    conserved: items.length === spawned + fellIn - leakedOut - decayed,
  };
}

// ───────────────────────────────────────────────────────────────────────
// D6-2 工程包 D · 空间行为（D1 窄带活动 / D2 分档范围 / D5 高阶吸引）
// ───────────────────────────────────────────────────────────────────────
//
// 这一组全是**模块级纯函数**，不是类方法——因为 `stepNether` 是函数、没有 `this`，
// 而幽冥**没有第二条随机流可挂**（见文件头铁律一的补充说明）。所以「随机采样」
// 全部落成 `hashStep` 推进的确定性哈希流。
//
// ⚠️ 与上界工程包 C 的对照：`UpperLife.stepSpatial` 是**方法**、另开 `spatialRng`；
//    幽冥这里是**函数**、零流。形状同源，实现路径不同——这不是不一致，是结构决定的。

/**
 * 一只幽冥实体的**活动半径**（格）：目标格必须落在「离冥河不超过这个距离」内。
 *
 *   · 普通鬼魂 ⇒ `BANK_RADIUS`（= 4）——**只在河边窄带活动**（D1）；
 *   · 鬼修     ⇒ `BANK_RADIUS + ghostTierOf(level) * GHOST_TIER_REACH`
 *                ——阶越高越能远离冥河（D2：游魂 4 → 鬼帝 19）。
 * `ghostTierOf` 对非法 `level` 返回 -1，`Math.max(0, ...)` 兜住 ⇒ 不会算出比
 * 普通鬼魂更小的半径（那种「鬼修活动范围比鬼魂还小」的错位**不报错**，只静默）。
 */
function activityRadiusOf(e) {
  if (e.soulKind !== 'ghostCultivator') return BANK_RADIUS;
  const tier = Math.max(0, ghostTierOf(e.level));
  return BANK_RADIUS + tier * GHOST_TIER_REACH;
}

/**
 * 这一格能不能落脚。**只判 `netherWalkable`**（与落点 / 裂隙过滤同一把尺子）。
 * 边界留一格（`1..w-2`），同凡间 `canStep` / 上界 `spatialCanStep`。
 * ⚠️ 幽冥没有建筑（`struct` 恒 0）与野火（不跑），所以不判那两条——多判一条
 *    不存在的规则只会多一个与凡间耦合的旋钮（同上界 `spatialCanStep` 的理由）。
 */
function netherCanStep(nether, x, y) {
  if (x < 1 || y < 1 || x > nether.w - 2 || y > nether.h - 2) return false;
  return netherWalkable(nether, Math.floor(y) * nether.w + Math.floor(x));
}

/**
 * 当前目标还能不能用（越界 / 非有限 / 站不住 / **跑出活动范围**）。
 * 判据与 `pickNetherSpatialTarget` 的入池条件**同源**（都走 `netherWalkable` + `nearRiverAt`）。
 * 故障：只判「在界内」不判「站得住」⇒ 鬼魂可能把目标钉在冥河中心，然后
 *   `moveNetherSpatially` 每拍都撞墙、原地不动——「鬼魂不会动」会以
 *   「偶尔有几个人不动」的形态藏起来（同上界 `spatialTargetValid` 的教训）。
 */
function netherSpatialTargetValid(nether, e) {
  if (!Number.isFinite(e.tx) || !Number.isFinite(e.ty)) return false;
  const x = Math.floor(e.tx);
  const y = Math.floor(e.ty);
  if (x < 0 || y < 0 || x >= nether.w || y >= nether.h) return false;
  if (!netherWalkable(nether, y * nether.w + x)) return false;
  return nearRiverAt(nether, x, y, activityRadiusOf(e));
}

/**
 * 选一个新目标：在当前位置周围采样 `NETHER_TARGET_TRIES` 次，取**最好**的一格。
 *
 * ⚠️⚠️ **零 rng**：采样坐标由 `hashStep` 推进的哈希流生成，种子是
 *    `hash32(`${e.id}:${day}`)`——同实体同一天逐次可复现，不同实体（含 id）
 *    互不相同，同一实体不同天（day 变）也不同。这就是「幽冥没有随机流」的兑现方式。
 *    ⚠️ 种子里**必须**带 `day`：否则同一实体每次重选都会挑到**同一格**（原地打转）。
 *    带 `day` 安全的前提是「两次重选的 `dayKey` 必不同」——由 `timer >= MIN_DAYS`
 *    保证（见 `stepNetherSpatial` 的重选间隔）。
 *
 * 「最好」的定义（D1 / D2 / D5）：
 *   · 入池条件：`netherWalkable` **且** `nearRiverAt(..., activityRadiusOf(e))`
 *     ⇒ 普通鬼魂只进窄带格、鬼修按阶放宽（D1 / D2）；
 *   · 评分：**低阶实体**（普通鬼魂 + 阶位 < `GHOST_LURE_TIER` 的鬼修）若场上
 *     存在高阶鬼修（`lures`），给「离最近吸引源更近」的样本加分（D5）；
 *     其余情况评分恒 0 + 一点确定性抖动（避免总挑同一格）。
 * ⚠️ 这是「**简单**移动」：一次采样 + 取最大值，**没有**任何路径搜索。
 * ⚠️ 抽签次数**与人口解耦**：每个需要重选目标的实体固定推进 `2 × tries` 次哈希，
 *    **与幽冥有多少实体无关**（同 `maybeForge` / `pickSpatialTarget` 的纪律）。
 *
 * @param {object} nether 幽冥 world
 * @param {object} e      实体
 * @param {number} day    `world.day` 取整（进种子）
 * @param {Array<{x:number,y:number}>} lures 高阶鬼修（吸引源）坐标，可为空数组
 * @returns {[number, number]|null} 目标格，或 `null`（采样全落空）
 */
export function pickNetherSpatialTarget(nether, e, day, lures) {
  const cx = Math.floor(e.x);
  const cy = Math.floor(e.y);
  const reach = activityRadiusOf(e);
  const isLow = e.soulKind !== 'ghostCultivator'
    || ghostTierOf(e.level) < GHOST_LURE_TIER;
  let h = hash32(`${e.id}:${day}`);
  let best = null;
  let bestScore = -Infinity;
  for (let k = 0; k < NETHER_TARGET_TRIES; k += 1) {
    h = hashStep(h);
    const rx = (h / 0x100000000) * 2 - 1;
    h = hashStep(h);
    const ry = (h / 0x100000000) * 2 - 1;
    const x = cx + Math.round(rx * reach);
    const y = cy + Math.round(ry * reach);
    if (x < 1 || y < 1 || x > nether.w - 2 || y > nether.h - 2) continue;
    const i = y * nether.w + x;
    if (!netherWalkable(nether, i)) continue;                  // 站不住
    if (!nearRiverAt(nether, x, y, reach)) continue;           // 跑出活动范围（D1 / D2）
    let score = 0;
    if (isLow && lures.length > 0) {
      let dmin = Infinity;
      for (let m = 0; m < lures.length; m += 1) {
        const dx = x - lures[m].x;
        const dy = y - lures[m].y;
        const d = dx * dx + dy * dy;
        if (d < dmin) dmin = d;
      }
      score = -Math.sqrt(dmin);                                // 越近分越高（D5）
    }
    score += ((h % 1024) / 1024) * 0.01;                       // 确定性抖动
    if (score > bestScore) {
      bestScore = score;
      best = [x, y];
    }
  }
  return best;
}

/**
 * 朝目标走一段。子步化的理由与凡间 `moveTowards` / 上界 `moveSpatially` **逐字同源**：
 * `days` 一大，位移就超过一格，会直接穿过冥河；拆成 ≤ `NETHER_MAX_SUBSTEP`
 * 的小段、逐段判可通行，就绕不过去（也**不抽任何签**）。
 *
 * 走不通时的退路（**不是寻路**）：先试「只走 x」、再试「只走 y」——最朴素的滑墙；
 * 两条单轴都不通就放弃本拍，把 `timer` 清零让下一拍重选目标。**没有**多步前瞻。
 */
function moveNetherSpatially(nether, e, days) {
  const dx = e.tx - e.x;
  const dy = e.ty - e.y;
  if (Math.hypot(dx, dy) < 0.35) return;

  const info = SPECIES_INFO[e.sp] || SPECIES_INFO.ghost;
  const speed = NETHER_TILES_PER_DAY * (info.speed || 1);
  const stepLen = Math.min(speed * days, NETHER_MAX_MOVE_TILES);
  if (!(stepLen > 0)) return;

  const n = Math.max(1, Math.ceil(stepLen / NETHER_MAX_SUBSTEP));
  const seg = stepLen / n;
  for (let k = 0; k < n; k += 1) {
    const ddx = e.tx - e.x;
    const ddy = e.ty - e.y;
    const d = Math.hypot(ddx, ddy);
    if (d < 0.35) return;
    const ux = ddx / d;
    const uy = ddy / d;
    const nx = e.x + ux * seg;
    const ny = e.y + uy * seg;
    if (netherCanStep(nether, nx, ny)) {
      e.x = nx;
      e.y = ny;
      if (Math.abs(ux) > 0.05) e.face = ux > 0 ? 1 : -1;
      continue;
    }
    // 滑墙：沿单轴试。⚠️ 只在**目标方向明显偏向某一轴**时才试，
    // 免得在冥河夹角里来回抖（两轴都试 = 原地对角线抖动）。
    if (Math.abs(ux) >= Math.abs(uy)) {
      if (netherCanStep(nether, nx, e.y)) { e.x = nx; continue; }
      if (netherCanStep(nether, e.x, ny)) { e.y = ny; continue; }
    } else {
      if (netherCanStep(nether, e.x, ny)) { e.y = ny; continue; }
      if (netherCanStep(nether, nx, e.y)) { e.x = nx; continue; }
    }
    // 走不通：本拍到此为止，下一拍重选目标。
    e.timer = 0;
    return;
  }
}

/**
 * D4 · 消散留痕：把消散地点所在格的阴气（`veg`）抬 `DECAY_TRACE_VEG`。
 *
 * ⚠️ 写的是 `nether.veg`——它**进档**（`serializeNetherWorld` 存 6 层含 `veg`），
 *    且 `deserializeNetherWorld` **不重算 veg**（只走 `recomputeQi`），所以留痕
 *    能被持久化、**零存档改动**。量化步长 1/65535 ≈ 1.5e-5 远细于 0.03，存得住。
 *    ⚠️ 这条「存得住」是承重的：若 `DECAY_TRACE_VEG` 取到 1e-5 量级，
 *    `encodeQuantized` 会把它抹平——留痕在内存里可见、存档往返后消失，
 *    而且**不报错**（本项目头号故障类）。
 * ⚠️ **加性 + clamp(0, 1)**，不衰减：同一格反复消散会累积（「阴气越聚越重」）。
 *    「可回涨」指的是它可以继续往上加，不是会自动回落。
 * ⚠️ 只给**消散**（对账 / 到期）留痕，**不给上限逐出**留痕——逐出的语义不是
 *    「这只鬼在这里散了」，而是「账满了被清出去」，位置没有意义。规格说的是「消散地点」。
 * ⚠️ 这是一处**刻意的生态耦合**（同工程包 C 的「位置 → 灵气 → 修炼」）：
 *    留痕抬高 `veg` ⇒ D3 的环境系数变大 ⇒ 后来者在同一格积怨更快。
 *    不是要规避的扰动，是「鬼魂聚集地阴气渐重」这一生态现象本身。
 */
function leaveDecayTrace(nether, e) {
  if (!nether.veg || !e) return;
  const w = nether.w;
  const x = Math.floor(e.x);
  const y = Math.floor(e.y);
  if (!(x >= 0 && y >= 0 && x < w && y < nether.h)) return;
  const i = y * w + x;
  const cur = nether.veg[i] || 0;
  nether.veg[i] = Math.min(1, cur + DECAY_TRACE_VEG);
}

/**
 * 幽冥空间行为（`stepNether` 的**第五步** · D6-2 工程包 D）：让鬼魂 / 鬼修真的会动。
 *
 * 与上界工程包 C 的 `UpperLife.stepSpatial` **形状同源**，但三处关键差别：
 *   ① **零 rng**（见文件头铁律一）：没有 `spatialRng` 可用，采样走 `hashStep`；
 *   ② **活动范围**受 `activityRadiusOf` 约束（D1 窄带 / D2 分档），上界没有这一层；
 *   ③ **高阶鬼修吸引**（D5）：低阶实体的目标评分偏向最近的吸引源。
 *
 * ⚠️ 吸引源 `lures` **每拍只扫一次**（不是每个实体扫一遍）：实体上限 400，
 *    逐实体两两比对是 O(N²)；先扫一遍收集坐标，实体侧只做 O(N × M)。
 * ⚠️ 本步**只改既有实体列**（`x/y/tx/ty/timer/state/anim/face`），**不新增存档字段**
 *    （与工程包 C 同一条结论，`save.js` 无需改动）。
 */
function stepNetherSpatial(nether, world, days) {
  const list = nether.entities;
  if (!Array.isArray(list) || list.length === 0) return;
  const dtDays = Number.isFinite(days) ? days : 0;
  if (!(dtDays > 0)) return;
  const day = typeof world.day === 'number' ? world.day : (nether.day || 0);
  const dayKey = Math.floor(day);

  // D5 吸引源：高阶鬼修（鬼将及以上）的坐标快照（每拍一次，不逐实体重扫）。
  let lures = null;
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (e.soulKind === 'ghostCultivator' && ghostTierOf(e.level) >= GHOST_LURE_TIER) {
      if (!lures) lures = [];
      lures.push({ x: e.x, y: e.y });
    }
  }
  const lureArr = lures || [];

  const span = NETHER_RETARGET_MAX_DAYS - NETHER_RETARGET_MIN_DAYS;
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (!e || !(e.hp > 0)) continue;

    // 动画相位：与凡间 `stepEntity` / 上界 `stepSpatial` 同款（实体列 row[14]）。
    e.anim = (e.anim || 0) + dtDays * 2.4;

    e.timer = (e.timer || 0) - dtDays;
    if (e.timer <= 0 || !netherSpatialTargetValid(nether, e)) {
      const target = pickNetherSpatialTarget(nether, e, dayKey, lureArr);
      if (!target) {
        // 周围没有落在活动范围里的可通行格（孤岛 / 全冥河）：本拍不动，
        // **不设 `timer`** ⇒ 下一拍立刻重试。这不是死循环，是「等一次机会」。
        e.timer = 0;
        continue;
      }
      e.tx = target[0] + 0.5;
      e.ty = target[1] + 0.5;
      e.state = 'wander';
      // 重选间隔：`[MIN, MAX]` 内由哈希派生（**不抽签**）。
      // ⚠️ 保证 `>= MIN_DAYS` 是承重的：种子含 `dayKey`，两次重选若落在同一天
      //    会挑到同一格（原地打转）。MIN_DAYS 远大于 1 日 ⇒ `dayKey` 必不同。
      const jitter = hash32(`${e.id}:${dayKey}:t`) % (span + 1);
      e.timer = NETHER_RETARGET_MIN_DAYS + jitter;
    }
    moveNetherSpatially(nether, e, dtDays);
  }
}

/** 供面板 / 探针读的一份读数（纯派生、不写回）。 */
export function netherGhostStats(nether) {
  const list = (nether && nether.entities) || [];
  let ghost = 0;
  let cultivator = 0;
  let topTier = -1;
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (e.soulKind === 'ghostCultivator') {
      cultivator += 1;
      const t = ghostTierOf(e.level);
      if (t > topTier) topTier = t;
    } else if (e.soulKind === 'ghost') {
      ghost += 1;
    }
  }
  return {
    total: ghost + cultivator,
    ghost,
    cultivator,
    topTier,
    topTierName: topTier >= 0 ? GHOST_TIER_NAMES[topTier] : null,
    popLog: (nether && nether.popLog) || null,
  };
}

/**
 * 幽冥**生态账本**的只读汇总（D6-2 工程包 E）：与上界的 `upperEcoStats`
 * **同款口径**（生 / 亡 / 现存），供三界面板与测试**共用同一口径**。
 *
 *   生   = `ghostBorn`
 *   亡   = `ghostDied`（消散：对账 / 到期两条路径）
 *   逐   = `evicted`（上限逐出——**不是消散**，所以单列一栏）
 *   现存 = `ghost + cultivator`
 *
 * 守恒式（**契约**）：`现存 === 生 − 亡 − 逐`。smoke 5x 直接断言它。
 *
 * ⚠️ 口径复用 `netherGhostStats`（本模块唯一的幽冥实体统计处），**不重新遍历一遍**
 *    `nether.entities`——那是第二份真相。
 * ⚠️ 与上界的差别：上界只有一条离开路径（`died`），幽冥有**两条**（消散 + 逐出）。
 *    所以这里多一栏 `evicted`，守恒式多一个减项。这是两个世界的规则差别，
 *    **不是口径不统一**——面板上两处都印「生 / 亡」，玩家照样能横向对照。
 * ⚠️ 纯读：不写世界、不抽 rng。
 */
export function netherEcoStats(nether) {
  const st = netherGhostStats(nether);
  const log = st.popLog || {};
  const born = log.ghostBorn || 0;
  const died = log.ghostDied || 0;
  const evicted = log.evicted || 0;
  // D6-3 工程包 B：**第三条离开路径**——爬进凡间的鬼。
  // ⚠️ 独立于 `died`（理由见 `ensureNetherPopLog` 的 `climbedOut` 注释）。
  // ⇒ 守恒式由 E 包的 `生 − 亡 − 逐` 扩成 **`生 − 亡 − 逐 − 出`**。
  //    这是**契约变更**：面板、playtest 10e 的算式、回归脚本 F5/F9 都要同步。
  const climbedOut = log.climbedOut || 0;
  // D6-3 工程包 D：**第四条离开路径**——被鬼修夺舍、元神搬进凡间活人身体的鬼修。
  // ⚠️ 与 `climbedOut` 一样独立于 `died`：那是「走了」，这是「夺舍过去了」。
  // ⇒ 守恒式由 B 包的 `生 − 亡 − 逐 − 出` 再扩成 **`生 − 亡 − 逐 − 出 − 夺`**。
  //    同样是**契约变更**：面板、playtest 10e 的算式、回归脚本 F5/F9/F11 都要同步。
  const possessedOut = log.possessedOut || 0;
  const alive = st.total;
  return {
    born,
    died,
    evicted,
    climbedOut,
    possessedOut,
    alive,
    conserved: alive === born - died - evicted - climbedOut - possessedOut,
  };
}
