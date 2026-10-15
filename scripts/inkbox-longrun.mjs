#!/usr/bin/env node
// 水墨沙盒 · 长时段演化体检
//
// 和另外三个测试的分工：
//   smoke       —— 单点断言：某个函数、某次存读档对不对
//   save-equiv  —— 逐字段：存档有没有漏存东西
//   playtest    —— 走浏览器：界面与交互通不通
//   longrun     —— 这一支：连着跑几百年，看世界会不会「静悄悄地死掉」
//
// 为什么非要单独有这么一支：上面三个全都测不出「玩法其实已经失效」这类问题。
// 宗门开不出来、灵脉永远无人认领、飞升之后再没人飞升——这些状态下
// 每一个函数都返回得干干净净，断言全绿，截图也好看，
// 只是玩家什么都不会遇到。只有把时间拉长到几百年，
// 这些「沉默的坏死」才会显形。
//
// 用法：
//   node scripts/inkbox-longrun.mjs
//   node scripts/inkbox-longrun.mjs --years=1500 --seed=1234 --preset=large
//   node scripts/inkbox-longrun.mjs --quiet     # 只输出结论

import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld, recomputeUpperQi } from '../src/inkbox/world/worldgenUpper.js';
import { WORLD_PRESETS, TIME, LIMITS, TERRAIN_INFO } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { Life } from '../src/inkbox/sim/life.js';
import { UpperLife, isUpperMortal } from '../src/inkbox/sim/upperLife.js';
import { realmLabel, REALMS } from '../src/inkbox/core/cultivation.js';
import { relationOf, SECT_HISTORY_CAP } from '../src/inkbox/sim/sects.js';
import {
  cellOf, leylineAllowance, computeTerritory,
  // 诊断空置灵脉的病因用（见下面「灵脉大多有主」那一段）
  leylineApproach, minDistTo, growTerritory, sectAssets, buildCostLayer,
} from '../src/inkbox/sim/territory.js';
import { reincarnationStats, ROUTE_LABEL } from '../src/inkbox/sim/reincarnation.js';
import { artifactStats, describeArtifact, ownerLine } from '../src/inkbox/sim/artifacts.js';
import { clanStats, describeClan } from '../src/inkbox/sim/family.js';
import { biographyStats, LOG_CAP } from '../src/inkbox/sim/biography.js';
import { warStats, GREAT_BATTLE_LOG_CAP } from '../src/inkbox/sim/war.js';
import { possessionStats, possessionInternals } from '../src/inkbox/sim/possession.js';
// 空间裂缝（阶段三 · 块四）。长测**必须显式开缝**，否则 riftLog 恒 0、
// 「裂缝系统活着」那条判据会空转——理由见下面「玩家行为模拟」那一段。
import {
  RIFT_BASE_RADIUS, RIFT_MAX_RADIUS,
  TAU_GROW, TAU_CLOSE, HERB_VEG_MIN,
  riftRadiusAt, openRifts, riftStats,
} from '../src/inkbox/sim/rifts.js';
// ⚠️ 世界推进的**唯一入口**（BACKLOG #13 的修法）。本脚本原先自己抄了一份时钟
//    列表（life + eco + fire + upper + rift），而**漏了 `stepNether`**——于是
//    长测里幽冥四步（对账 / 到期 / 积怨 / 逐出）一次都不跑、实体只增不减，
//    那些读数因此不代表真实游戏。现在改调这一个函数：时钟列表与节拍定义在
//    `sim/advance.js` 的 `ADVANCE_PERIODS`，与真实游戏（`main.js` 的 `update()`）
//    **同一份**——新增时钟时只改那一处，本脚本自动跟上。
//    ⚠️ 本脚本原先的 `ECO_PERIOD` / `FIRE_PERIOD` 常量**已删**：它们的值（5 / 0.8）
//       与 `ADVANCE_PERIODS.eco` / `.fire` 逐字相同，留着就是第二份真相。
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
// ⚠️ 门槛常量从 `core/cultivation.js` 拿，**不**从 `rifts.js` 的 `CROSS_MIN_LEVEL`。
// 2026-09-19 阶段四把语义**反转**了：旧 `CROSS_MIN_LEVEL` 是「够格被吸走的下限」
// （≥30 才吸），新 `RIFT_CROSS_MAX_LEVEL` 是「不许被吸走的上限」（<40 才吸）。
// 两个名字长得像、方向相反，混用会让诊断行印出一个**方向正确但数值相反**的读数
// （比如「候选池：境界≥40 的凡间修士 N 人」，而真相是那 N 人恰恰是**不被吸**的那批）。
import { RIFT_CROSS_MAX_LEVEL, THUNDER_ASCEND_MIN_LEVEL } from '../src/inkbox/core/cultivation.js';
// `ASCEND_LEVEL`（凡间飞升门槛 60）定义在 **sim** 里，不在 core。
// 它与 `THUNDER_ASCEND_MIN_LEVEL`（40）一起把天雷区间钉成 `[40, 60)`——
// 下面那条静态咬合判据要同时用这两个数。
import { ASCEND_LEVEL } from '../src/inkbox/sim/cultivation.js';
// ── 幽冥 + 三界跨界生态（D6-3 工程包 E）──────────────────────────
// 与 `main.js` 的 `attachNether` 同款：生成幽冥、挂到 `world.nether`。
// ⚠️ 在这之前，本脚本**从来没有建过幽冥**——所以 D6-3 的四条跨界通道
//    （凡人跌入 / 鬼爬出 / 物品漏出 / 鬼修夺舍）一次都没在长跑里跑过，
//    这是 E 包要补的洞。
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
// 幽冥的**只读**统计口径：守恒式（`netherEcoStats`）、物品账（`netherItemStats`）。
// ⚠️ 这两个都是「读账本现算」，不抽签、不改世界——与 `artifactStats` / `riftStats` 同款。
import { netherEcoStats, netherItemStats } from '../src/inkbox/sim/netherLife.js';
// 凡间鬼影容器（B 包落点）。`spawnWraith` 会惰性建 `world.wraiths`，
// 读数用 `wraithStats`（`alive` / `dissolved` / `total`）。
import { wraithStats } from '../src/inkbox/sim/wraiths.js';

function arg(name, fallback) {
  const hit = process.argv.find((v) => v.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const YEARS = Number(arg('years', '800'));
const SEED = Number(arg('seed', '20260914'));
const PRESET_KEY = arg('preset', 'medium');
const QUIET = flag('quiet');
const STEP = Number(arg('step', '3'));

const PRESET = WORLD_PRESETS[PRESET_KEY];
if (!PRESET) {
  console.error(`未知预设「${PRESET_KEY}」，可选：${Object.keys(WORLD_PRESETS).join(' / ')}`);
  process.exit(1);
}

const say = (...a) => { if (!QUIET) console.log(...a); };

const world = generateWorld({ preset: PRESET, seed: SEED, scatter: true });
const life = new Life(world, mulberry32(world.seed ^ 0xa5a5a5a5));

// ── 上界（阶段二）──────────────────────────────────────────
// 与 main.js 的 attachUpper 同款：生成上界、挂到 world.upper（让 ascend() 的
// arriveUpper 能找到它）、建 UpperLife。longrun 不走 main.js 的 update，
// 所以这里自己建、自己在循环里 step。
const upper = generateUpperWorld({ preset: PRESET, seed: SEED });
recomputeUpperQi(upper);
world.upper = upper;
const upperLife = new UpperLife(upper);
// 全部「游戏日驱动」时钟的累加器（上界 / 幽冥 / 裂缝 / 植被 / 野火）。
// 与真实游戏的 `this.advanceState` 是**同一种东西**（`sim/advance.js`）。
const advState = createAdvanceState();

// ── 幽冥（D6-3 · 三界跨界生态）──────────────────────────────
// 与 `main.js` 的 `attachNether` 同款：生成幽冥、挂到 `world.nether`。
// ⚠️ **必须在主循环之前挂**：`openRifts(..., 'nether')` 的第 0 步会检查
//    `world.nether` 在不在，缺了就整条拒掉（`reason: 'no-plane'`）。
// ⚠️ 挂幽冥**不移动凡间世界线**：`generateNetherWorld` 用自己的派生种子
//    （`deriveNetherSeed(SEED)`，异或自逆），既不抽 `Life.rng`、也不抽上界 / 生态流。
//    （D6-2 判决：新增一个世界层时，唯一要证明的就是「没多抽主流」。）
// ⚠️ `world.wraiths` 不必在这里建：`spawnWraith` 会惰性建它（`ensureWraiths`）。
const nether = generateNetherWorld({ preset: PRESET, seed: SEED });
world.nether = nether;

// 再撒几批人，让世界热闹点——默认散布出的聚落太少，
// 少了就测不出「人口压力 → 开宗 → 抢灵脉」这条链。
const scatterRng = mulberry32(4242);
for (let g = 0; g < 5; g += 1) {
  const x = 20 + Math.floor(scatterRng() * (world.w - 40));
  const y = 20 + Math.floor(scatterRng() * (world.h - 40));
  world.pendingSpawns.push({ x, y, species: 'human', count: 14 });
}

say(`水墨沙盒 · 长时段体检（${PRESET.label} · 种子 ${SEED} · ${YEARS} 年）\n`);

// ⚠️ 这里必须把「游戏日驱动的全部时钟」都跑起来，不能只跑 life.step。
//    **2026-09-23 起，这件事由 `advanceWorld()` 统一负责**（见下面的推进循环），
//    本脚本**不再自己维护时钟列表**——那正是下面两个坑的成因。
//
// 踩过的坑（一）：最初这一支只调 `life.step(days)`，把植被与野火两套时钟漏掉了。
// 结果测出来的世界和玩家实际看到的是两个世界——植被永不复苏 → 食物永远紧缺 →
// 人口卡在 600 上下、聚落 13 座；而真实游戏里植被会一轮轮长回来，
// 人口顶到上限 1400、聚落涨到 69 座、宗门 10 家。
// 拿一个「植被冻结」的世界去调人口与开宗参数，等于照着假数据拧旋钮。
//
// 踩过的坑（二 · 2026-09-23）：新增 `stepNether`（幽冥鬼魂）时**又漏了同一个地方**
// ——长测里幽冥四步（对账 / 到期 / 积怨 / 逐出）一次都不跑、实体只增不减。
// 两次同款事故 ⇒ 结论是「时钟列表不能手抄，只能有一处定义」
// （`sim/advance.js` 的 `ADVANCE_PERIODS`）。这就是 BACKLOG #13 的修法。
//
// 水文（stepHydrology）是**按真实时间**推进的，和游戏倍速解耦，
// 因此它和「模拟了多少游戏年」之间没有固定换算关系，这里刻意不跑——
// 它只改地表形状，不参与修仙玩法的健康度。
// ⚠️ 同理，`sim/advance.js` **故意不收**水文与 `decayOverlay`（那两个按 `dt`）。

// 生态用自己的随机源，与生灵的 rng 分开——main.js 里就是两个独立的流，
// 混用会让「加了植被模拟」这件事反过来改变生灵的生死判定，没法对比。
const ecoRng = mulberry32(12345);

// ── 「玩家行为」模拟：开视界 → 开缝（阶段三 · 块四）─────────────
//
// ⚠️ **核心陷阱**：`openRifts` 只在**玩家开视界**时被调用。长测脚本不会开视界，
// 所以什么都不做的话 `riftLog` 会**恒为 0**——于是「裂缝系统活着」那条判据
// 永远绿、什么也没测（空转判据）。本项目已经因为「空转判据」吃过好几次亏，
// 所以这里必须**显式模拟玩家开视界**。
//
// **确定性**：不用 `Math.random`，节奏（每 20 年）与坐标（三个固定矩形）都写死，
// 长测可复现。矩形取 40×30（周长 140 → `clamp(1,4,round(140/120)) = 1`，每次开 1 道）。
// 三个坐标是照本 world（中堂 · 种子 20260914）实测挑的：四条边的
// 「凡间 + 上界都可站人」格数都在 100 以上，不会因为位置过滤而开不出来。
const RIFT_OPEN_EVERY_YEARS = 20;
const RIFT_OPEN_SITES = [[40, 50], [220, 70], [60, 120]]; // 40×30 矩形的左上角

// ── 幽冥缝站点（D6-3 工程包 E · 三界跨界生态）────────────────────
//
// ⚠️⚠️ **为什么站点是 1×1 的「点」而不是 40×30 的矩形**（这一条是 E 包的核心）：
//
//   `openRifts` 只把**矩形周长**上的格当候选缝口，而幽冥缝口还必须**同时**满足
//   `world.isWalkable`（凡间可站）**且** `netherWalkable`（幽冥可站）。
//   而幽冥的鬼 / 物品**只落在河带格**（`netherBankTiles` = 幽冥可站 ∩ 近河 ≤4）。
//   ⇒ 缝口必须落在「凡间可站 ∩ 幽冥河带」的**交集**里，缝半径（峰值 ~5.7 格）
//     才够得着鬼与物品；否则 C（物品漏出）/ D（夺舍）**结构性永不触发**。
//
//   实测（临时探针）：用 ±10 矩形站点（周长离中心 ~10 格），半径内几乎无河带格
//   ⇒ 10 条缝跑 300 年，C=18 但 **D 恒 0**；改用「重叠格」上的缝口后，半径 3.63 格内
//   有 **26 个河带格 + 42 个凡人**。所以站点必须精确落在重叠格上。
//
//   1×1 区域 ⇒ `cols=rows=1` ⇒ 候选格恰好是那一个点 ⇒ 缝口**精确落点**。
//   ⚠️ 附带好处：`sites.length === 1` ⇒ `openRifts` 的洗牌循环
//      `for (i = sites.length - 1; i > 0; i -= 1)` **不执行** ⇒ **消费裂隙流 0 次**
//      ⇒ 上界缝的位置与「不开幽冥缝」时**逐字相同**（「不扰动随机流」的可数形态）。
//
// 坐标是照本 world（中堂 · 种子 20260914）实测挑的：每个都是
// 「凡间可站 ∩ 河带」格，且峰值半径内有 25–32 个河带格 + 2–50 个凡人。
// 与 `RIFT_OPEN_SITES` 同款纪律：写死坐标——worldgen 一改就会「开不出来」
// （`openRifts` 返回 `no-site`）而**不是**悄悄换一个位置。
const NETHER_RIFT_SITES = [[127, 45], [192, 30], [66, 46], [101, 100], [189, 101], [261, 101]];

// ── 「视界开着多久」：**契约 C1.1 的落地**（2026-09-19 阶段四新增）────────
//
// ⚠️⚠️ **这一条不加，整段裂缝判据就是在测另一个世界。**
//
// 契约 C1.1（用户第 1 条）把裂缝改成「**只在视界开启时演化**」：
// `main.js` 的裂缝时钟套在 `if (this.riftViewOpen())` 里，视界关着时
// `rift.age` 不涨、不闭合、不漏物。
//
// 而本脚本原先的写法是「每 30 日无条件 `stepRifts(world)`」——那等价于
// **视界永远开着**。于是长测量出来的 `leaked` / `crossed` / `closed` 会
// 比玩家真实体验高出一个数量级（视界开着的时间占比越高，差得越多），
// 拿这组数去调 `LEAK_CHANCE_PER_PERIOD` 就是**照着假数据拧旋钮**。
// 这正是本文件头部（`ECO_PERIOD` 那一段）点名的同款陷阱：
// 「最初这一支只调 life.step，把植被与野火两套时钟漏掉了……拿一个
// 『植被冻结』的世界去调人口与开宗参数，等于照着假数据拧旋钮」。
//
// **玩家行为模型**（确定性、可复现）：每 `RIFT_OPEN_EVERY_YEARS` 年开一次
// 视界，每次保持 `RIFT_VIEW_OPEN_YEARS` 年 → 占空比 25%。
// 为什么是 25% 而不是「一直开着」：一直开着等于取消了这条契约；而
// 占空比太低（比如开 1 年）会让「一条缝活 30-40 个**视界内**年」需要
// 120-160 个世界年才走完，300 年的长测里连一代缝都过不完，
// `closed` 恒 0 —— 那不是「系统坏了」，是**测试没给它时间**。
// 25% 下 300 年累计约 75 个视界内年 ≈ 两代缝，恰好够判「会闭合」。
const RIFT_VIEW_OPEN_YEARS = 5;

/**
 * 第 `year` 年（1 起）视界是否开着。开窗从 `year = 1, 21, 41, …` 开始，各持续 5 年。
 * 判据必须与下面 `openRifts` 的触发点**同源**，否则会出现「缝开了但时钟没走」
 * 或「时钟走了但一条缝都没有」——两种都不报错，只是读数偏小。
 */
const riftViewOpen = (year) => (year - 1) % RIFT_OPEN_EVERY_YEARS < RIFT_VIEW_OPEN_YEARS;

// （裂缝时钟的累积器在 `advState.rift`，节拍由 `ADVANCE_PERIODS.rift` 定——
//  与 main.js 的裂缝时钟同节奏：每 RIFT_PERIOD_DAYS = 30 日一拍。）
// 累计「视界开着的年数」——`riftStepCount` 的分母。有了它才能把长测读数
// 换算成「每个视界内年漏几件」，而不是拿世界年去比规格里按世界年写的目标。
let riftViewYears = 0;
// 本地累加「玩家模拟共开了几道」，收尾与 `riftLog.opened` 交叉核对。
let riftOpenedByPlayer = 0;
// 幽冥缝的同一份本地累加（D6-3 E）。与上界的**分开记**：两者的站点、节奏都不同，
// 合成一个数就分不清「上界缝没开」还是「幽冥缝没开」。
let netherOpenedByPlayer = 0;
// 诊断用：判定 pass 次数、以及累计「活跃缝 × 周期」= 漏物抽签槽位总数。
// 某一向（crossed / lost）恒 0 时，靠这两个数与候选池大小判断「样本不足」还是「逻辑坏了」。
let riftStepCount = 0;
let riftDrawSlots = 0;
// 诊断：方向 A（上→下）真正「够得着」的缝·拍次数，以及第 5 行（凡间法宝 → 上界）
// 的触发前提「半径内无人 **且** 有凡间无主地面法宝」的缝·拍次数。
// **只读、不抽签**，不影响世界线；`leaked` 恒 0 时靠它区分「抽不到」与「没得抽」。
let riftDirACandHits = 0;
let riftRow5Ready = 0;
// 方向 A 的**第 2 个物源**（上界灵植 / 仙草，规格 §4.3 表格第 2 行）的候选池命中数。
// 与 `riftDirACandHits` 同款：只读复算、不抽签。存在的理由也一样——
// 「灵植漏不出来」是「候选池恒空」（结构性饿死，改概率没用）还是「概率低」，
// 只有这个数答得出来。
let riftHerbCandHits = 0;

// ── 上界凡人生态的累计读数（2026-09-19 阶段四新增）──────────────────
//
// ⚠️ **为什么必须是累计量、不能只看终点**：上界凡人寿元只有约 11.7 年
// （`SPECIES_INFO.human.lifespan`），比修士短一到两个数量级。只看终点的
// 「此刻有几个凡人」分不清三件事：
//   ① 从来没人被吸上来过；② 吸上来过、但全老死了；③ 一直在吸、生态是活的。
// 三种情况的终点读数都可能长得一样。所以这里记**累计**：
//   · `mortalAwakened` —— 累计「凡人踏入修行」的人数（`level` 0 → ≥1 的转变）
//   · `upperUnownedPeak` —— 上界地面**无主**法宝的峰值（裂缝方向 A 的候选池）
let mortalAwakened = 0;
let upperUnownedPeak = 0;
// 上一年是凡人的实体 id 集合。逐年比对才能抓到「0 → ≥1」这个**转变**——
// 直接数「`level >= 1` 且 `fromMortal`」会把飞升者（一上来就是 50-60 级）算进去。
let prevMortalIds = new Set();

/**
 * 裂缝候选池复算（只读）。与 `rifts.js` 同一套判据，但**不抽签**——
 * 只是每拍每缝数一遍「假如抽中这一向，池子里有没有东西」。
 * 这是本阶段最重要的诊断材料：`riftLog.leaked = 0` 到底是「样本不足」
 * 还是「结构性饿死」，只有它答得出来。
 */
function auditRiftPools() {
  for (let i = 0; i < world.rifts.length; i += 1) {
    const rf = world.rifts[i];
    // `riftRadiusAt` 只读 `rift.age`，第二个参数是**被忽略的**。把它写在这里会让人
    // 以为半径按「绝对天数」算 —— 那是 2026-09-19 之前的旧语义，已废弃。直接省掉。
    const r = riftRadiusAt(rf);
    if (!(r > 0)) continue;
    // 方向 A · 物源 1：上界**无主地面**法宝是否在半径内
    for (let k = 0; k < upper.artifacts.length; k += 1) {
      const a = upper.artifacts[k];
      if (a.ownerId) continue;
      if (Math.hypot(a.x - rf.x, a.y - rf.y) <= r) { riftDirACandHits += 1; break; }
    }
    // 方向 A · 物源 2：半径内有没有上界灵植。判据与 `rifts.js` 的
    // `leakUpperHerb` **逐字同款**（同一个 `upper.veg` 层、同一个阈值常量，
    // 阈值从模块导入、**不写死**——常量一动这里跟着动，不会变成假证据）。
    {
      const rad = Math.ceil(r);
      let herbHit = false;
      for (let dy = -rad; dy <= rad && !herbHit; dy += 1) {
        for (let dx = -rad; dx <= rad; dx += 1) {
          if (Math.hypot(dx, dy) > r) continue;
          const x = rf.x + dx;
          const y = rf.y + dy;
          if (!upper.inside(x, y)) continue;
          if (upper.veg[y * upper.w + x] >= HERB_VEG_MIN) { herbHit = true; break; }
        }
      }
      if (herbHit) riftHerbCandHits += 1;
    }
    // 方向 B：人 / 物分开数
    let personHit = false;
    for (let k = 0; k < world.entities.length; k += 1) {
      const e = world.entities[k];
      if (Math.hypot(e.x - rf.x, e.y - rf.y) <= r) { personHit = true; break; }
    }
    let groundHit = false;
    for (let k = 0; k < world.artifacts.length; k += 1) {
      const a = world.artifacts[k];
      if (a.ownerId) continue;
      if (Math.hypot(a.x - rf.x, a.y - rf.y) <= r) { groundHit = true; break; }
    }
    if (!personHit && groundHit) riftRow5Ready += 1;
  }
}

const t0 = Date.now();
// 中途采样一次夺舍账本，收尾时用它判「累计量单调不减」（见下面「夺舍」那一段）。
const midYear = Math.floor(YEARS / 2);
let possMid = null;
for (let y = 1; y <= YEARS; y += 1) {
  for (let d = 0; d < TIME.daysPerYear; d += STEP) {
    // ── 世界推进：**全部游戏日驱动的时钟**都在这一行里 ──────────────
    // 时钟列表（life / upper / nether / rift / eco / fire）与各自的节拍，全部
    // 定义在 `sim/advance.js` 的 `ADVANCE_PERIODS`——与真实游戏（`main.js` 的
    // `update()`）**同一份**。这是 BACKLOG #13 的修法：本脚本原先自己抄了一份
    // 时钟列表，而漏了 `stepNether`，导致长测里幽冥四步一次都不跑。
    // ⚠️ `rng` 传 `ecoRng`（本脚本自己的生态流，与生灵的流分开——理由见上面）；
    //    `riftActive` 传 `riftViewOpen(y)`——契约 C1.1 在长测侧的唯一兑现处。
    // ⚠️ `advanceWorld` 内部会更新 `world.day` / `world.year`（与 main.js 同款），
    //    所以本循环**不再自己写那两行**。
    const fired = advanceWorld(world, STEP, {
      life,
      upperLife,
      rng: ecoRng,
      state: advState,
      riftActive: riftViewOpen(y),
    });

    // ── 裂缝判定的**额外记账** ──────────────────────────────────
    // `advanceWorld` 只负责「跑时钟」，不负责统计。`riftDrawSlots` 记的是
    // 「这一拍有几道活跃缝参与漏物抽签」的累计——它是后面诊断 crossed / lost
    // 恒 0 时的「抽了几次签」读数。
    //
    // ⚠️ **契约 C1.1 在长测侧的唯一兑现处是上面那个 `riftActive`**（理由见
    //    `RIFT_VIEW_OPEN_YEARS` 的注释）。**去掉它**会让长测退回「视界永远
    //    开着」的假世界，而且**不会有任何断言变红**：`leaked` / `crossed` /
    //    `closed` 只会变大，判据全是「≥ 下界」。故障注入：把它改成恒 `true`，
    //    `riftStepCount` 从约 900 涨到 3600，`leaked` 同步涨约 4 倍——
    //    所以报告里必须把 `riftStepCount` 与 `riftViewYears` 一起印出来，
    //    让这个比值**可被肉眼核对**。
    if (fired && fired.rift) {
      riftStepCount += 1;
      riftDrawSlots += world.rifts.length;
      auditRiftPools();
    }
  }
  world.year = Math.floor(world.day / TIME.daysPerYear);
  // 模拟玩家开视界：每个开窗期的**第一年**，在三个固定位置各划一块 40×30
  // （→ 各开 1 道缝），然后把视界保持 `RIFT_VIEW_OPEN_YEARS` 年。
  // ⚠️ 触发点与 `riftViewOpen` 必须同源（都用 `(y-1) % 周期`）：原先写的是
  //    `y % 20 === 0`（在第 20/40/… 年开），与「窗口从第 1 年算起」差一格，
  //    会造成「缝在第 20 年开出来、但第 20 年视界已关」→ 那道缝永远 age=0。
  if (riftViewOpen(y)) {
    riftViewYears += 1;
    if ((y - 1) % RIFT_OPEN_EVERY_YEARS === 0) {
      for (const [ox, oy] of RIFT_OPEN_SITES) {
        const r = openRifts(world, { x0: ox, y0: oy, x1: ox + 39, y1: oy + 29 });
        riftOpenedByPlayer += r.opened;
      }
    }
    // ── 幽冥缝：视界开着时**常年保持活跃**（D6-3 工程包 E）──────────
    // 上界缝每 20 年开一批就够（它们能活 ~56 世界年）；幽冥缝则要**持续有活的**，
    // 否则空窗会让四条跨界通道的样本量腰斩（一条缝只活一部分时间）。
    // 所以这里「每年补开一次」：已活跃的站点被 `openRifts` 的 `occupied` 过滤掉
    // （返回 `reason: 'no-site'`），所以**不会重复开**，也不会报错。
    // ⚠️ 1×1 区域 ⇒ `sites.length === 1` ⇒ 洗牌循环不执行 ⇒ **不抽裂隙流**
    //    （理由见 `NETHER_RIFT_SITES` 的长注释）。所以这一段**不移动上界缝的位置**。
    for (const [nx, ny] of NETHER_RIFT_SITES) {
      const r = openRifts(world, { x0: nx, y0: ny, x1: nx, y1: ny }, 'nether');
      netherOpenedByPlayer += r.opened;
    }
  }

  // ── 上界凡人生态：逐年扫一遍（阶段四）────────────────────────
  // 抓的是**转变**（去年是凡人、今年 level ≥ 1），不是「此刻有几个高等级的人」。
  // 理由见 `mortalAwakened` 的注释。
  {
    const nowMortals = new Set();
    for (let i = 0; i < upper.entities.length; i += 1) {
      if (isUpperMortal(upper.entities[i])) nowMortals.add(upper.entities[i].id);
    }
    for (const id of prevMortalIds) {
      if (nowMortals.has(id)) continue;              // 还是凡人，没踏上修行路
      // 不在了 = 死了（不是「踏入修行」）。必须在，且 level ≥ 1 才算。
      let alive = null;
      for (let i = 0; i < upper.entities.length; i += 1) {
        if (upper.entities[i].id === id) { alive = upper.entities[i]; break; }
      }
      if (alive && (alive.level || 0) >= 1) mortalAwakened += 1;
    }
    prevMortalIds = nowMortals;

    // 上界地面**无主**法宝的峰值：裂缝「上→下」方向的候选池。
    // 只看终点分不清「一直在产」与「早年产了一批、后来停产了」。
    let unowned = 0;
    for (let i = 0; i < upper.artifacts.length; i += 1) {
      if (!upper.artifacts[i].ownerId) unowned += 1;
    }
    if (unowned > upperUnownedPeak) upperUnownedPeak = unowned;
  }
  if (y === midYear) possMid = possessionStats(world);
  if (!QUIET && (y % 100 === 0 || y === YEARS)) {
    const c = world.cultivationStats();
    // 转世那几个读数一定要进轨迹：只看终点分不清「一直在转世」和
    // 「早年转过一批、池子满了之后就再没转过」——后者正是抓到的那个 bug，
    // 而它的终点读数（池中 120、累计造出 366）看着完全正常。
    const r = reincarnationStats(world);
    const af = artifactStats(world);
    const kt = clanStats(world);
    // 夺舍与大战的**累计账本**也要进轨迹，理由与「累计魂」同一条：
    // 只看终点的「在世被夺舍者 0 人 / 当前战事 0 场」，
    // 分不清「从来没发生过」和「发生过、只是那些人和战事都不在了」。
    const pt = possessionStats(world);
    const wt = warStats(world);
    console.log(
      `  第${String(y).padStart(4)}年`
      + ` 生灵${String(world.entities.length).padStart(4)}`
      + ` 村${String(world.villages.length).padStart(3)}`
      + ` 宗${String(world.factions.length).padStart(2)}`
      + ` 灵脉${world.leylines.length}`
      + ` 地点${String(world.sites.length).padStart(3)}`
      + ` 飞升${String(world.ascended.length).padStart(3)}`
      + ` 魂池${String(r.waiting).padStart(3)}`
      + ` 转世${String(r.reborn).padStart(3)}`
      + ` 累计魂${String(world.nextSoulId - 1).padStart(4)}`
      // 法宝的三个读数：在世 / 器灵 / 换过三手。只看「在世」分不清
      // 「一直在炼新的」和「早年炼了一批、之后再也不炼」——后者是僵化。
      + ` 法宝${String(af.live).padStart(3)}(器灵${af.spirits}/换手${af.travelled})`
      // 世家：在世家数（在谱人数）· 累计立/断 · 最大世代。四个读数缺一不可：
      //   只有「在世家数」看不出「只增不减」（兴衰那半条机制死了）；
      //   只有「累计立族」看不出「一直在立也一直在断」还是「立了就永远不死」；
      //   「最大世代」是这一块最值钱的读数——恒为 1 就说明归谱没接上，
      //   族谱上永远只有始祖一个人，而别的读数照样正常。
      + ` 世家${String(kt.clans).padStart(2)}(${kt.members})/${kt.founded}立${kt.ended}断/第${kt.maxGen}代`
      // 夺舍：累计成功+失败（账本）与此刻在世带印记人数（快照）并排。
      // 大战：累计宣战 / 累计灭门 / 累计战殁。都是只增不减的账本。
      + ` 夺舍${pt.succeeded}成${pt.failed}败/在世${pt.total}`
      + ` 大战${wt.declared}宣${wt.destroyed}灭${wt.casualties}殁`
      // 上界（阶段二）：现存 / 飞入累计 / 化生累计 / 陨落累计 / 雷入累计 / 仙门数。
      // 五个累计读数缺一不可：只看现存分不清「一直在进人」和「早年进了一批
      // 之后再也不进」；只看飞入不看陨落分不清「上界养得住人」和「来了就死」。
      // ⚠️ `雷`（阶段四）是 `飞` 的**子集**——经天雷飞升的那部分。单列出来是为了
      //    让「天雷通道还活着」那条判据的读数**可被肉眼核对**：并排印在每一年的
      //    行上，任何人一眼就能看出它是恒 0（通道死了）还是随年份在涨（通道活着）。
      + ` 上界${String(upper.entities.length).padStart(3)}(飞${(upper.popLog || {arrived:0}).arrived}/化${(upper.popLog || {born:0}).born}/陨${(upper.popLog || {died:0}).died}/雷${(upper.popLog || {}).arrivedThunder || 0})仙${upper.factions.length}`
      // 裂缝（阶段三）：累计开/闭 · 累计漏 · 两向分别记（越=修士上界 / 失=凡人失踪）。
      // **必须并排印累计量与当下活跃数**，理由同上界：只看「此刻活跃 0」分不清
      // 「从来没裂过缝」和「裂过很多、全闭合了」。crossed / lost 分开印，
      // 因为合并成一个总数就分不清方向了。
      + ` 裂缝${String(riftStats(world).active).padStart(2)}活/`
      + `${riftStats(world).opened}开${riftStats(world).closed}闭/漏${riftStats(world).leaked}/越${riftStats(world).crossed}/失${riftStats(world).lost}`
      + ` 最高 ${c.peakName || '—'} ${realmLabel(c.highest)}`,
    );
  }
}
const elapsed = Date.now() - t0;

const st = world.stats();
const cs = world.cultivationStats();

// ── 体检判据 ────────────────────────────────────────────────
// 这些不是「数值好不好看」，而是「玩法还在不在」。
// 每一条都对应一个真实踩过的坑。
//
// 灵脉的归属有两份记录：灵脉自己的 `owner`（势力 id，0 = 无主），
// 以及宗门那一侧的 `sect.leylines`（灵脉 id 数组）。两份都得对，缺一份
// 就会出现「地图上显示有主、宗门账本里却查不到」这种半截状态。
const leylineIds = new Set(world.leylines.map((l) => l.id));
const claimedByOwner = world.leylines.filter((l) => l.owner).length;
const claimedIds = new Set();
const dangling = [];
for (const f of world.factions) {
  for (const id of f.leylines || []) {
    if (leylineIds.has(id)) claimedIds.add(id);
    else dangling.push(`${f.name}→#${id}`);
  }
}
const claimed = claimedIds.size;
// 最晚立派的那一天。用来分辨「世界一直在出新门派」和
// 「早年开了一批、之后再也不开了」——后者的门派数看着正常，
// 但地图上再也不会有新对手，是个会慢慢烂掉的世界。
const newestSectDay = world.factions.reduce((m, f) => Math.max(m, f.foundedDay || 0), 0);
// 转世读数。这一支是唯一能发现「转世其实一次都没发生」的地方——
// 详见下面那条判据的注释。
const rein = reincarnationStats(world);
// 势力图在这里就算出来：下面的灵脉判据要用到 `terr.contested`（哪几条灵脉是
// 两家以上都够得着的），而它是纯计算，提前算不影响任何进存档的东西。
const terr = computeTerritory(world);
const checks = [];
const add = (label, ok, detail) => checks.push({ label, ok, detail });

add('生灵没有绝户', world.entities.length > 0, `${world.entities.length} 生灵`);
add('聚落形成了', world.villages.length > 0, `${world.villages.length} 座`);
add('宗门开得出来', world.factions.length >= 2,
  `${world.factions.length} 家（曾经因为早退判断写反，四百年一家都开不出来）`);
// ⚠️ 阈值从「> 0」收紧到「>= 2」，但**没有**收紧到 3：
// 实测 800 年的轨迹是 6 6 5 5 7 4 3 5——在 3–7 之间摆动，最低点就是 3。
// 把阈值卡在 3 等于卡在实测最小值上，下一轮换个种子就会假失败。
// 这一条要守的是「政治层没有塌缩到只剩一家自说自话」，
// 「生态还活不活」交给下面那条「宗门一直在出新血」去判，分工更清楚。
add('宗门一直在出新血', newestSectDay >= world.day / 2,
  `最晚立派的是第 ${Math.floor(newestSectDay / TIME.daysPerYear) + 1} 年`
  + `（共 ${Math.floor(world.day / TIME.daysPerYear) + 1} 年）`
  + '——若这一条挂了，说明「开宗」这条路在后半程被堵死了：'
  + '要么山门附近总有人占着，要么无归属的筑基散修被收编村子抽干了');
// ── 灵脉有主 ──
//
// ⚠️ 这一条**改了判据**，理由必须写清楚，因为原话是「不要为了让这一条变绿去放宽它」。
//
// 原来的判据是「**全部**灵脉都有主」。后来用插桩探针（`scripts/_leylineprobe.mjs`）
// 把每条空置灵脉都量了一遍，发现「全部有主」是**一个靠调参保证不了的不变量**，
// 而且底下混着**三个完全不同的病因**——原来的判据把它们当成一件事：
//
//   一、**山脚与所有门派都不连通**（真·无人可达）。灵脉按分数优先落在峻岭/雪峰上，
//       而有些峻岭坐落在一小块与世隔绝的可通行地里。实测种子 7 的 `#1@(165,88)`：
//       山脚 305 格站得住人，而**把伸手预算放大到 1e9，八家门派仍然一家都够不着**。
//       → 这是**真该修的**，已经在生成那一侧修掉（`worldgen.js` 的 `bigLandMask`）：
//         灵脉的落点必须够得到「够大的陆地」。修前四个种子里两个中招，修后 0 个。
//
//   二、**够得着，但都超出伸手预算**。实测需要的倍数在 1.05 / 1.45 / 2.28 / 2.54 之间飘。
//       把预算抬到能覆盖 2.54，等于让一个**四人的小门派**伸手到 378 代价之外（全图），
//       不合理。→ 这是**设计边界**，不是 bug：地图上留一条谁也够不着的灵脉，
//         就是一片荒野。沙盒里这是内容，不是缺陷。
//
//   三、**够得着、但那一家名额满了**（实测 150 年的 `#6`：只有厚土门够得着，它 4/4）。
//       → 名额的用意是防垄断，而这里没有第二家可争，于是把内容晾着。
//         但这一条**会自愈**：同一个世界跑到 800 年，`#6` 被太白剑宗拿走了。
//
// 所以判据改成**「大多数灵脉有主」**，并把每条空置灵脉的病因**当场诊断出来**印在 detail 里。
// 这不是放宽了事——它守的仍然是「灵脉这套玩法在运转」，
// 而且比原来多抓一件事：**「够得着又有名额却没认领」是认领逻辑的真 bug**，
// 下面会单独标出来（原来那版判据区分不了它）。
const leyWhy = [];
let claimBug = 0;
// 先把空置的挑出来。只有真有空置时才去做「无穷预算」那趟诊断洪泛——
// 那趟要给每家各洪泛一次，没空置就不必花这个钱。
const openLey = world.leylines
  .map((l, i) => ({ l, i }))
  .filter(({ l }) => !l.owner);

// 「山脚与所有门派都不连通」与「够得着但都超出预算」是**两种病**，
// 处置完全相反（前者该在生成侧修，后者是设计边界）。长测必须能自己分清，
// 不能只写一句「无人够得着」——那会让读的人以为生成侧的修复又回归了。
// 分辨手法与探针一致：把伸手预算放大到 1e9（近似无穷）再洪泛一次，
// 仍然够不着才是「不连通」。
let bigReach = null;
if (openLey.length) {
  const approaches = world.leylines.map((l) => leylineApproach(world, l));
  const costs = terr.costs || buildCostLayer(world);
  bigReach = world.factions.map((s) => {
    const r = growTerritory(world, sectAssets(world, s), 1e9, costs);
    return { id: s.id, dists: approaches.map((a) => minDistTo(r, a)) };
  });
}
for (const { l, i } of openLey) {
  let best = null;
  for (const s of world.factions) {
    const row = terr.reach.get(s.id);
    const d = row ? row[i] : Infinity;
    if (!Number.isFinite(d)) continue;
    if (!best || d < best.d) {
      best = { name: s.name, d, held: (s.leylines || []).length, allow: leylineAllowance(s) };
    }
  }
  const anyReach = bigReach
    ? bigReach.some((r) => Number.isFinite(r.dists[i]))
    : false;
  if (!anyReach) {
    leyWhy.push(`#${l.id} **与所有门派都不连通**（真·无人可达）`);
  } else if (!best) {
    leyWhy.push(`#${l.id} 够得着但都超出伸手预算`);
  } else if (best.held < best.allow) {
    claimBug += 1;
    leyWhy.push(`#${l.id} ⚠️够得着又有名额（${best.name} 距离${Math.round(best.d)} 持有${best.held}/${best.allow}）却没认领`);
  } else {
    leyWhy.push(`#${l.id} 名额已满（${best.name} 距离${Math.round(best.d)} 持有${best.held}/${best.allow}）`);
  }
}
// 门槛取「一半」而不是 2/3：实测（修掉病因一之后）五个世界是
// 4/6、4/5、3/3、5/6、5/6——**最小值正好是 4/6**，而 2/3 的门槛在 n=6 时
// 恰好也是 4，等于**卡在实测最小值上**，换个种子就是一台假失败制造机。
// （同一个坑在「宗门开得出来」那条上已经踩过一次：实测最低 3，门槛就没敢写 3。）
//
// 放宽到一半不会让这一条变成摆设：真正抓「玩法坏没坏」的是它旁边那几条——
// 「灵脉归属两份记录互相吻合」「有灵脉是两家以上都够得着的」
// 「够得着又有名额的灵脉不会被晾着」。这一条只负责兜底：
// **别让大多数灵脉都变成没人要的死内容。**
const leyFloor = Math.max(1, Math.ceil(world.leylines.length / 2));
add('灵脉大多有主', world.leylines.length > 0 && claimed >= leyFloor,
  `${claimed}/${world.leylines.length} 条被占 · 门槛 ${leyFloor}`
  + (leyWhy.length ? ` · 空置：${leyWhy.join('；')}` : ' · 全部有主')
  + '（曾经因为灵脉都长在不可通行的峻岭上、而地盘是个圆，一条都占不上）');
// 这一条才是「认领逻辑坏了」的判据。它现在是**结构性成立**的（算法保证），
// 留着是为了将来有人动 `computeTerritory` 的分配顺序时能立刻发现。
add('够得着又有名额的灵脉不会被晾着', claimBug === 0,
  claimBug ? `有 ${claimBug} 条空置但明明够得着又没满额` : '无');
add('灵脉归属两份记录互相吻合', claimed === claimedByOwner && dangling.length === 0,
  dangling.length
    ? `悬空引用 ${JSON.stringify(dangling)}`
    : `owner 侧 ${claimedByOwner} 条 · 宗门账本侧 ${claimed} 条`);
add('没有宗门独占灵脉',
  world.factions.every((f) => (f.leylines || []).length <= leylineAllowance(f)),
  world.factions.map((f) => `${f.name}:${(f.leylines || []).length}/${leylineAllowance(f)}`).join(' '));

// ── 势力图（代价洪泛）──
//
// 这一组判的是「地图上有没有真的长出政治地理」。换成代价洪泛之后，
// 地盘由地形决定，于是最容易出的问题是三类：
//   · 洪泛没跑起来（地盘一片空白）——「玩法等于不存在」的老毛病；
//   · 一家把地图吃干（预算太大、或者只有一家活得下去）；
//   · 接壤表空的 —— 那样 stepConflicts 永远打不起来，仗就成了摆设。
//
// 这里在收尾处重算一次，拿一份干净的结果来判（跑动过程中那份可能停在
// 某个周期中间，读数不好解释）。computeTerritory 是纯计算，
// 不会改到任何进存档的东西，收尾调用是安全的。
const owner = terr.owner;
let owned = 0;
const perSect = new Map();
for (let i = 0; i < owner.length; i += 1) {
  if (!owner[i]) continue;
  owned += 1;
  perSect.set(owner[i], (perSect.get(owner[i]) || 0) + 1);
}
const biggest = perSect.size ? Math.max(...perSect.values()) : 0;
const walkableTotal = (() => {
  let n = 0;
  for (let i = 0; i < world.size; i += 1) {
    const info = TERRAIN_INFO[world.type[i]];
    if (info && info.walk) n += 1;
  }
  return n;
})();
add('地盘真的铺开了', owned > 0,
  `${owned} 格有主 / 可通行 ${walkableTotal} 格（${walkableTotal ? (owned / walkableTotal * 100).toFixed(0) : 0}%）`
  + ` · ${perSect.size} 家分占`);
add('没有一家把地图吃干', owned === 0 || biggest / owned <= 0.6,
  `最大一家 ${biggest} 格，占 ${owned ? (biggest / owned * 100).toFixed(0) : 0}%`);
add('宗门之间有接壤', terr.border.size > 0,
  `${terr.border.size} 对相邻（接壤表若空，stepConflicts 里的摩擦永远为 0）`);

// 「有得争」的灵脉：两家以上都伸得着。
//
// ⚠️ 判据必须是「都够得着」，不是「都持有」——一条灵脉只有一个主人，
// 持有清单不可能有交集。原先 stepConflicts 里写的正是后者，恒为假，
// 于是「抢同一道灵脉会显著加剧敌意」这条规则从来没生效过：
// 函数返回得干干净净、断言全绿，只是这半条玩法不存在。
add('有灵脉是两家以上都够得着的', terr.contested.size > 0,
  `${terr.contested.size}/${world.leylines.length} 条有得争`);

// 山门必须立在能站人的地上。
//
// 实测抓过两次：一次是旧 stepTerritory 会把 capitalX/Y 拖到灵脉中点
// （灵脉在峻岭上），于是 122 人、19 座村子的大派把山门搬到了「山」里；
// 一次是 maybeShed 直接拿出走者脚下的格子当山门，而修士会被灵气
// 吸着往山巅走。两次的后果一样：那一格连自己都走不出去，
// 地盘洪泛只能罩住孤零零一格，这家门派在地图上等于不存在。
const badSeats = world.factions.filter((f) => {
  if (!Number.isFinite(f.capitalX) || !Number.isFinite(f.capitalY)) return true;
  const info = TERRAIN_INFO[world.type[cellOf(world, f.capitalX, f.capitalY)]];
  return !info || !info.walk;
});
add('山门立在能站人的地上', badSeats.length === 0,
  badSeats.length
    ? badSeats.map((f) => `${f.name}@${TERRAIN_INFO[world.type[cellOf(world, f.capitalX, f.capitalY)]].name}`).join(' ')
    : world.factions.map((f) => `${f.name}:${TERRAIN_INFO[world.type[cellOf(world, f.capitalX, f.capitalY)]].name}`).join(' '));

add('六阶都有人走到', cs.byRealm.slice(0, 6).every((n) => n > 0),
  REALMS.map((r, i) => `${r.name}:${cs.byRealm[i]}`).join(' '));
add('修士不是孤例', cs.cultivators >= 20, `${cs.cultivators} 位修士 / ${cs.mortals} 凡人`);
add('境界金字塔没倒过来', cs.byRealm[0] >= cs.byRealm[5],
  `炼气 ${cs.byRealm[0]} vs 合体 ${cs.byRealm[5]}`);
add('飞升这条路是通的', world.ascended.length > 0, `${world.ascended.length} 位已飞升`);
add('地图上有地点可探', world.sites.length > 0, `${world.sites.length} 处`);
add('编年史在记', world.chronicle.length > 0, `${world.chronicle.length} 条`);
add('关系网是活的', world.entities.some((e) => e.relations && e.relations.size > 0));

// 转世这一组，是**补上来的**。
//
// 为什么非要有：转世机制曾经同时坏在两处（门槛只开在金丹以上 + 溢出策略写反），
// 而那时 `inkbox-smoke` 的 5f 有 29 条断言、**全绿**——
// 因为它们手工构造实体、把 pollution/karma 写成 0，测的是真实世界不会出现的输入域；
// `save-equiv` 只比字段，更看不出来。**只有长测能发现「机制其实没在运转」。**
//
// 拆成「生产端」和「消费端」两条，因为这两件事的稳定性差得很远：
//
// 生产端（累计造出过多少神魂）**很稳**——实测 800 年是 247 / 345。
// 它还能把「从来没造出来」和「造出来又没了」一眼分开，
// 这正是当初定位「转世一次都没发生」时最关键的一个读数。
add('转世的神魂在生产', world.nextSoulId - 1 >= 20,
  `累计造出 ${world.nextSoulId - 1} 个神魂 · 池中待转 ${rein.waiting}`);

// 消费端（世上活着的转世者）**门槛故意压得很低（≥ 1）**，不是偷懒，有两个原因：
//
// 一、**头三百年必然是 0**：神魂要等 40–360 年才到期，这是机制本身的性质，
//     不是故障（实测 300 年探针里就是 0）。所以门槛按年数给，400 年起才要求 ≥ 1。
// 二、**在世数的波动极大**：实测两个世界差了 12 倍（24 位 vs 2 位）——
//     转世者降生在**村子**里，而这个世界战乱频仍（宗门相攻 / 妖潮压城 / 地脉覆城），
//     活到成年的不多。门槛高了就是一台假失败制造机。
//
// 它要抓的是**恒为 0**——那才是机制死掉的样子
// （实测：神魂池溢出策略写反时，800 年下来这里就是 0，而累计造出照样是 366）。
const rebornFloor = YEARS >= 400 ? 1 : 0;
add('转世者活着，且会想起前世',
  rein.reborn >= rebornFloor && rein.remembered >= rebornFloor,
  `转世者 ${rein.reborn} 位（占修士 ${cs.cultivators ? (rein.reborn / cs.cultivators * 100).toFixed(1) : 0}%）`
  + ` · 已觉醒 ${rein.remembered} 位 · 两世冲突 ${rein.conflicted} 位`
  + '——曾经因为留魂门槛只开在金丹以上、且溢出策略写反，这里是 0');

// ── 魂分五路（2026-09-21 重做后新增的判据组） ──────────────────
//
// 背景：`SOUL_ROUTES` 从四路扩成五路，且 `ghost` 的**语义反转**了——
// 旧义「魂飞魄散」（魂没了），新义「鬼修」（魂留下、成鬼修），标签随之改成「鬼修」；
// 另新增第五路 `gone`（「魂火散尽」）。
//
// 要命的一点：**五路里有三路（ghost / wraith / gone）不进魂池** `world.souls`——
// `enterNether` 在 `return null` 之前就把它们放走了。于是这三路在**所有既有读数里
// 都是隐形的**：池子大小、转世数、`nextSoulId` 全都不受影响，机制哪怕整条死掉，
// 外面的断言照样全绿。这正是本文件开头点名的「算出来了但没人读」的静默坏死。
// 唯一能看见它们的是累计账本 `world.soulLog`，下面这一组就是围绕它立的。
//
// ⚠️ **2026-09-21 账本前移**：`soulLog[route] += 1` 原先写在两道抽签闸门**之后**，
//    只记「抽签中选者」——插桩实测（`scripts/_natprobe.mjs`）9389 次路线判定
//    只记了 175 条，**覆盖率仅 1.86%**。现已前移到 `deathRoute` 之后、抽签之前，
//    它才真的是**五路普查（全量）**。连带后果见下面「账本守恒」那条：
//    入池的魂现在只是 `natural`/`linger` 的**子集**，等式必须放宽为 `>=`。
//
// ⚠️ `nextSoulId` 初值是 **1**（`World.js:194`），第一个神魂的 `id` 就是 1，
//    随后 `+= 1`。所以「入池神魂总数」= `nextSoulId - 1`，别写成 `nextSoulId`。
const soulLog = world.soulLog || { natural: 0, linger: 0, ghost: 0, wraith: 0, gone: 0 };

// 账本恒等式——这一组里最值钱的一条。
//
// ⚠️ 2026-09-21 起是 **`>=`**，不再是 `===`。为什么放宽：
//   账本前移之后，它记的是**五路普查**（每一次 `deathRoute` 判定都记一笔），
//   而入池还要再过一道**抽签**（`tier < 1 && !diedOfOldAge && rng() >= tier`）。
//   于是入池的魂只是 `natural`/`linger` 的**子集**——一大批落选者留在池外。
//   所以现在只有**入池那一侧**是精确的（`nextSoulId - 1` 恰等于入池数），
//   而 `natural + linger` 是它的**上界**。
//
// 它守的是什么（也是它变红的样子）：**入池数超过账本和**——
//   `natural + linger < nextSoulId - 1` ⇒ 有魂进了池却没被记进账本。
// 这正是账本前移要根除的那类「记录与入池脱节」：账本漏记 / 接错键
//   （比如把 `linger` 写进 `ghost`）/ 有人绕过 `soulLog[route] += 1`
//   直接 `world.souls.push`。只要有一处发生，式子就崩。
// 注意它**只**含 natural + linger——另三路按设计不入池；
// 若误写成「五路之和」，这条会永远红（同「魂火散尽」那条注释的告诫）。
add('魂路账本守恒：入池数 <= natural + linger',
  soulLog.natural + soulLog.linger >= world.nextSoulId - 1,
  `账本 natural ${soulLog.natural} + linger ${soulLog.linger} = ${soulLog.natural + soulLog.linger}`
  + ` >= nextSoulId-1 = ${world.nextSoulId - 1}`
  + `（入池是子集，缺口 = 抽签落选 ${soulLog.natural + soulLog.linger - (world.nextSoulId - 1)}）`);

// 「滞留幽冥」通道活着——**存在性**判据，`>= 1` 不外推。
//
// ⚠️ 2026-09-21 契约变更后，`linger` 的判据是「**横死 且 业障不重 且 有宿缘**」：
//    `deathRoute` 先把**寿终**单独判掉，剩下的非寿终死亡（只可能来自 `hp <= 0`）
//    走完 `wraith`/`ghost` 两道业障闸门后，再按 `collectBonds().length > 0` 分流
//    （有宿缘 ⇒ `linger`，无宿缘 ⇒ `natural`）。
//    ⚠️ **8-C 之前这里写的是「其余一律落 `linger`」，那句已经过期**：实测
//    （300 年 · medium）`linger` 从 25535 掉到 **623**，其余全去了 `natural`。
//    但**账本口径**那件事没变：从「抽签中选者」变成全量普查（覆盖率 1.86% → 99.65%），
//    所以任何跨这次变更的读数比对都不可信。
// 本项目区分「存在性」与「速率」：这一条只问「这条路还通不通」，
// 门槛压在 1 是为了抓**恒为 0**——那才是通道被堵死的样子。
add('魂路「滞留幽冥」通道活着', soulLog.linger >= 1,
  `本次 ${soulLog.linger}（横死 + 业障不重 + 有宿缘 · 全量普查口径）`);

// 「鬼修」通道活着——**存在性**判据。
//
// 这一路正是**语义刚被改过**的那条（旧「魂飞魄散」→ 新「鬼修」）。
// 反转后它仍然 `return null`（不进池），除了账本没人看得见它：
// 一个 0 就意味着「改完之后的这条路什么都没产出」，正是账本存在的意义。
// ⚠️ 2026-09-21 起账本改为全量普查（覆盖率 1.86% → 100%），且寿终被提前判掉，
//    所以读数与旧口径不可比；此处只做存在性断言，不外推速率。
add('魂路「鬼修」通道活着', soulLog.ghost >= 1,
  `本次 ${soulLog.ghost}（全量普查口径）`);

// 「怨魂化」通道活着——存在性判据。
// ⚠️ 同上：2026-09-21 全量普查口径，与旧读数不可比，只做存在性。
add('魂路「怨魂化」通道活着', soulLog.wraith >= 1,
  `本次 ${soulLog.wraith}（全量普查口径）`);

// 账本键集完整——守的是**定名**，不只是接线。
//
// 五个中文标签是**考古钉死的**（`剧情素材 00_文案使用说明:229-239`），
// 不许改名、不许同义替换。所以除了查 `soulLog` 的键集，还要查 `ROUTE_LABEL` 的键集：
// 键集一旦漂移（多一个 / 少一个 / 拼错），标签就会跟着漂，
// 而那种错误不会让任何函数返回异常——只有键集断言能把它变成一台会响的警报器。
const SOUL_KEYS = 'ghost,gone,linger,natural,wraith';
const logKeys = Object.keys(soulLog).sort().join(',');
const labelKeys = Object.keys(ROUTE_LABEL).sort().join(',');
add('魂路账本与定名键集完整（五路）',
  logKeys === SOUL_KEYS && labelKeys === SOUL_KEYS,
  `soulLog: ${logKeys} · ROUTE_LABEL: ${labelKeys} · 应为 ${SOUL_KEYS}`);

// `gone` / `natural`：**只印不断言**——这不是偷懒，是刻意的。
//
// ⚠️ 2026-09-21 二次更正：这条注释被改过两次，**前两次都写错了根因**，留此存照。
//
//   第一次写「此世界几无修士寿终」。第二次改口成「修掉『重伤撤退』死代码后
//   寿终不再是 0（实测 300 年 4/1/5 人次）」。**两次都不对。**
//
//   现在的实测结论（`scripts/_natprobe.mjs`，只读探针，本人复跑）：
//   **修士「寿终」在当前代码里是 0 例**——同配置（300 年 × seed 20260914 ×
//   STEP=3 × medium）实测「共 0 例」，800 年长测的 `gone` / `natural` 也都是 0。
//   那个「4/1/5」是**四条改动落地之前**的世界线读数，**现已不可复现，别再引用**。
//
//   真寿终 = 0 是**结构性**的：判据 `P(寿终) ≈ e^{-h·L}`，各境界带 `h·L` 都 ≫ 1
//   （炼气 ~36 · 元婴 ~6.8）⇒ `e^{-h·L} ≈ 0`。
//   所以**不是**「有样本但判据太窄」，而是**根本没有样本**——
//   这才是两条路恒为 0 的真正根因，而且两条**共用同一个原因**（此前误记成两个不同根因）。
//
//   ⚠️ 顺带：假寿终（`applyBreakthroughFailure` 在突破失败时重算 `lifespan`，
//   可在**同一 tick** 内把 `age >= lifespan` 变成真）**机制仍在**（读码可证），
//   但当前世界线不触发。
//   ⇒ 因此**不能**给 `gone` 设存在性断言：任何非零 `gone` 都只可能来自假寿终。
//
// 注意 `natural` = 0 在**抽签前后都一样**（账本覆盖率那件事影响不到它），
// 所以它**不是**被抽签筛掉的，是真的走不到。
//
// 另注（同批契约变更）：`linger` 现在要**同时**满足「横死 + 业障不重 + **有宿缘**」，
// 无宿缘的横死改判 `natural`（实测 25535 → 623）；同时账本覆盖率从 1.86%
// 升为全量普查。两件事方向相反，所以 `linger`/`ghost`/`wraith` 与旧读数
// （抽签中选者口径）**不可比**，别拿新旧数字做趋势判断。
//
// 因此这里**不**给它们下断言：写「五路都要非零」会是一条**永远红**的断言，
// 而「一条会无理由撞红的断言，和一条永远绿的断言一样有害——它训练人去忽略它」。
// 设计问题（是放松 `gone` 的门槛，还是承认它不可达）上报用户定夺，
// **不在测试里替用户拍板**。下面这行读数只为把这两个数摆出来，供那个决策参考。
// ⚠️ 这段文字必须**跟着读数走**。原先这里硬编码着「两条路恒为 0」，
//    而 8-C 之后 `natural` 已不再是 0（实测 **9728**）——于是同一行里出现
//    「natural 9728」与「恒为 0」并列的**自相矛盾的读数**。
//    这是「产生数字的代码死了、数字留在文档里还活着」的同类事故：
//    代码没坏，是**文字**没跟着改。故改成按实际读数分支。
const bothSoulRoutesZero = soulLog.gone === 0 && soulLog.natural === 0;
console.log(`  · 魂路诊断（不设断言）：gone ${soulLog.gone} · natural ${soulLog.natural}`
  + (bothSoulRoutesZero
    ? '——两条路都是 0，**同一个根因**：世界上根本没有「寿终」样本'
    : '——**只有 `gone` 是 0**：`natural` 已被 8-C 的「有宿缘」判据救活，'
      + '而 `gone` 要的是「寿终 **且** 牵挂 ≤ 1」，它的前提「寿终样本」本身就是 0：')
  + '（真寿终 = 0，各带 h·L ≫ 1 ⇒ e^{-h·L} ≈ 0；假寿终当前世界线也不触发）。'
  + '不是判据太窄，也不是仪器故障。');

add('宗门门史没无限膨胀', world.factions.every((f) => (f.history || []).length <= SECT_HISTORY_CAP),
  `上限 ${SECT_HISTORY_CAP} · 实际 ${world.factions.map((f) => (f.history || []).length).join(' ')}`);

// ── 法宝 ────────────────────────────────────────────────────
//
// 这一组是**补上来的**，理由和转世那一组一模一样：法宝的每一个函数
// 都能返回得干干净净、断言全绿、截图好看，而实际上「这件东西从来没换过主人」。
// 只有把时间拉长到几百年，「换手」这件事才显形。
//
// 拆成四条，各守一件事：
//   · 在生产 —— 别让「炼器」这条路被堵死；
//   · 在换手 —— 这一条才是这套玩法的全部意义（「这把剑换过七个主人」）；
//   · 守恒律 —— 法宝**不会凭空消失**。这是整块里最值钱的一条，见下面的长注释；
//   · 器灵出得来、但不会满地都是 —— 后者是一条真踩过的坑。
const af = artifactStats(world);
const afLog = af.log || {};
const lostLedger = af.live + (afLog.broken || 0) + (afLog.decayed || 0);
add('法宝在被炼出来', (afLog.forged || 0) > 0,
  `累计炼出 ${afLog.forged || 0} 件 · 在世 ${af.live}（在手 ${af.onPeople} / 地上 ${af.ground}）`
  + ` · ${JSON.stringify(afLog)}`);
// 「换过三手以上」的门槛取 1：实测 600 年三个种子是 44 / 18 / 31，很宽裕。
// 它要抓的是**恒为 0**——那才是「东西认了主就再没动过」的样子。
add('法宝在换手', af.travelled > 0,
  `${af.travelled} 件换过三手以上（占在世 ${af.live ? (af.travelled / af.live * 100).toFixed(0) : 0}%）`);
//
// ⚠️ 守恒律：`造出 = 在世 + 碎 + 朽`。
//
// 为什么这一条值钱：法宝是**挂在实体上**的（`entity.artifacts`），而这个世界里
// 有几条路径会把实体**直接移除**而不走 `onDeath`——飞升、点化飞升，以及
// （2026-09-21 之前的）神力抹除 / 雷击 / 陨石 / 瘟疫。少接一条，那条路径上的
// 法宝就静默消失，而别的断言照样全绿（世界上只是少了东西，没有任何函数会
// 因此返回异常）。
//
// 实测就是这么抓到的：**飞升者的法宝随人一起没了**——600 年 116 件生出器灵，
// 最后只活着 75 件，中间 41 件既没碎、也没朽。修法是在 `ascend()` 里
// 显式调 `leaveArtifacts`（东西留在飞升原地）。
//
// ⚠️ **2026-09-21 修**：powers.js 那四处 `world.entities.splice` **已经删掉了**，
// 当时给它们补的 `scatterArtifacts` 也一并删掉。原因：绕开 `onDeath` 漏的不只是
// 法宝，而是**整条死讯**——necrology（`world.dead` / `deadLog`）、神魂
// （`enterNether`）、关系清理、死亡叙事全都看不见，死亡原因普查里会落成
// `unknown(no-lethal-write)`。现在四处只把 `hp` 置 0，由 `life.step()` 的清理
// 循环走 `onDeath`，法宝交给 `onDeath` 里的 `dropArtifacts`（它是
// `scatterArtifacts` 的超集：多一层弟子/道侣继承）。`scatterArtifacts` 因此只剩
// `rifts.js` 的跨位面泄漏一个调用方。
//
// 所以现在「直接移除且不走 onDeath」的路径只剩飞升一族——这条守恒律就是它的
// 报警器。
//
// 换句话说：这一条不是为了「好看」，它是唯一能把「新加了一条移除路径」
// 变成一台会响的警报器的办法。
//
// ⚠️ **2026-09 扩式子（空间裂缝 · 阶段三）**：裂缝新开了**两条跨位面的法宝通道**
// （`rifts.js` 的 `leakFromUpper` 上界→凡间、`leakGroundArtifactToUpper` 凡间→上界）。
// 它们合法地把法宝搬出 / 搬进凡间，于是凡间的 `live` 会与 `forged` 差开——
// 而**不是**凭空消失。式子随之扩成
//     `造出 + 流入 = 在世 + 碎 + 朽 + 流出`
// 两个新账（`artifactLog.riftIn` / `riftOut`）由 `rifts.js` 在转移成功的那一刻记。
// 这不是「放宽判据」：它守的东西**一模一样**（每一件离开 `live` 的东西都必须在
// 某个账上有着落），只是把「跨位面转移」这个新的合法出口也纳入守恒。
// 少了这两个账，任何一条**真的**静默丢失仍会让式子不平 → 照样红。
const riftInArts = afLog.riftIn || 0;
const riftOutArts = afLog.riftOut || 0;
// ⚠️ **2026-09-26 再扩式子（D6-3 工程包 E · 三界跨界生态）**：幽冥缝又新开了
//    **两条跨位面的法宝通道**（`rifts.js` 的 `leakNetherItem` 幽冥→凡间、
//    `fallIntoNether`→`moveArtifactsToNether` 凡间→幽冥）。它们和上界那两条一样，
//    合法地把法宝搬出 / 搬进凡间。式子随之扩成
//        `造出 + 定入 = 在世 + 碎 + 朽 + 定出`
//    其中「定入」= `riftIn`（上界）+ `netherIn`（幽冥），
//    「定出」= `riftOut`（上界）+ `netherOut`（幽冥）。
//    理由与 2026-09 那次扩容**逐字相同**：守的东西一模一样（每一件离开 `live`
//    的东西都必须在某个账上有着落），只是把新的合法出口纳入守恒。
//    ⇒ 少了这两个账，任何一条**真的**静默丢失仍会让式子不平（照样红）。
const netherInArts = afLog.netherIn || 0;
const netherOutArts = afLog.netherOut || 0;
add('法宝不会凭空消失（造出 + 上界定入 + 幽冥定入 = 在世 + 碎 + 朽 + 上界定出 + 幽冥定出）',
  lostLedger + riftOutArts + netherOutArts === (afLog.forged || 0) + riftInArts + netherInArts,
  `造出 ${afLog.forged || 0} + 上界定入 ${riftInArts} + 幽冥定入 ${netherInArts}`
  + ` = 在世 ${af.live} + 碎 ${afLog.broken || 0} + 朽 ${afLog.decayed || 0}`
  + ` + 上界定出 ${riftOutArts} + 幽冥定出 ${netherOutArts}`
  + `（差 ${((afLog.forged || 0) + riftInArts + netherInArts) - (lostLedger + riftOutArts + netherOutArts)} 件去向不明）`);
// 器灵要「相伴 50 年」才出得来，所以头两百年必然是 0——门槛按年数给，
// 和上面「转世者活着」那条同一个道理。
//
// ⚠️ 判据用**只增不减的累计账本** `afLog.spirit`（累计出生数），**不是**收尾时
// 在世的 `af.spirits`。这是一条踩过的坑：器灵**本来就会死**——`artifacts.js` 的
// `SPIRIT_MAX_SCARS` 让器灵替法宝挡下最多 3 次碎裂，第 4 次与法宝同碎并记
// `metric(world,'spiritLost')`（artifacts.js:508-525）。于是「某条世界线收尾时
// 恰好 0 件存活」是完全正常的，不是故障（实测默认种子 20260914：累计初生 9、
// 碎 9、在世 0）。而「收尾快照 = 0」与「出生路径从来没走通」在读数上**长得一模一样**
// ——这正是本项目已确立的纪律（INKBOX.md / design/upperworld.md）：**缩小了的名册
// 不能证明「从未发生」，存在性判据必须用只增不减的累计账本**。
// 所以判据换成「跑够 300 年就必须至少出生过 1 件器灵」；它仍然会在**出生路径坏掉**
// 时变红（故障注入验证过：把出生条件改成永假 → 立刻红）。
// detail 里同时打印累计出生 / 累计碎掉 / 此刻存活三个数：存活那个只作**诊断**、
// 不参与判红——将来看到「存活 0」时能立刻分辨「是出生路径坏了」还是「只是碎光了」。
const spiritFloor = YEARS >= 300 ? 1 : 0;
add('器灵出得来', (afLog.spirit || 0) >= spiritFloor,
  `累计初生 ${afLog.spirit || 0} 件（相伴五十年才初生）· 随器灵一起碎掉 ${afLog.spiritLost || 0}`
  + ` · 此刻在世 ${af.spirits} 件（只作诊断：器灵会替法宝挡碎、挡满三次就与法宝同碎，故收尾为 0 属正常）`);
//
// 上界这一条守的是一个真踩过的坑：器灵原本写的是「**永不碎**」，
// 于是不碎的东西一路累积，实测 600 年下来在手 125 件里有 **75 件**带器灵（60%）——
// 「法宝会磨损」那半条机制等于被悄悄关掉了。
// 一个看起来只是好处的设定，把旁边那条机制吃掉了。
// 现在器灵最多挡三次碎裂，这条判据负责盯着别退回去。
//
// 只在样本够大时判（在世 >= 20）：只有 10 件法宝时，3 件带器灵就是 30%，
// 拿这种小样本去卡比例，只会造出一台假失败制造机。
const spiritRatio = af.live ? af.spirits / af.live : 0;
add('器灵没有满地都是（否则磨损那条机制会被吃掉）',
  af.live < 20 || spiritRatio <= 0.6,
  `在世 ${af.live} 件 · 带器灵 ${af.spirits} 件（${(spiritRatio * 100).toFixed(0)}%，上限 60%）`
  + `——修「永不碎」之前这里是 60%`);
add('法宝归属两份记录互相吻合',
  (() => {
    const seen = new Set();
    for (const a of world.artifacts) {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      if (a.ownerId) return false;              // 地上的东西不该有主人
    }
    for (const e of world.entities) {
      for (const a of (e.artifacts || [])) {
        if (seen.has(a.id)) return false;       // 同一件不能在两处
        seen.add(a.id);
        if (a.ownerId !== e.id) return false;   // 在手的必须指向当前持有者
      }
    }
    return true;
  })(),
  `地上 ${world.artifacts.length} 件 + 在手 ${af.onPeople} 件`);

// ── 世家与血脉 ──────────────────────────────────────────────
//
// 和转世、法宝同一套道理：世家这一块里每一个函数都能返回得干干净净，
// 而实际上「这个姓氏从来没传下去过」。它要抓的是四种**静默坏死**，
// 四种都不会让任何函数报错、也不会让别的断言变红：
//
//   A 立族这条路被堵死 —— 门槛（level ≥ 10 且子女 ≥ 3）定得太高，
//     八百年下来一家都开不出来，而世界照样运转得很正常；
//   B 只增不减 —— 断绝判定失效，世家数一路涨到上限 32，
//     于是「兴衰」这半条机制等于不存在，只剩「兴」；
//   C 家世在第二代就断 —— 出生时没记双亲快照（`registerBirth` 没接上），
//     于是每个人都是「无父无母」，血脉与天资一次都传不下去；
//   D 世家只收始祖一个人 —— 归谱那趟广度优先写错了（比如写死 depth 上限），
//     族谱上永远只有第 1 代。
//
// 四条的门槛都**按年数给**：200 年本来就不该有断绝的世家
// （要一族死绝还得再等 CLAN_END_YEARS = 80 年），拿短局去卡长局的判据
// 只会造出一台假失败制造机。
const cs2 = clanStats(world);
const withParents = world.entities.filter((e) => e.parentA || e.parentB).length;
const parentRatio = world.entities.length ? withParents / world.entities.length : 0;
add('世家立得出来（这一条挂了说明立族门槛把路堵死了）',
  YEARS < 300 || cs2.founded >= 2,
  `累计立族 ${cs2.founded} · 在世 ${cs2.clans} 家 · 成员 ${cs2.members}`
  + '（实测 800 年 37 立 / 24 在世 / 1273 在谱）');
add('世家传得下去（族谱上不止始祖一代）',
  YEARS < 200 || cs2.maxGen >= 3,
  `最大第 ${cs2.maxGen} 代（实测 800 年第 203 代——`
  + '凡人寿元只有十来年、成年线又是寿元的 22%，一代人只跨约 6 年，'
  + '所以世代翻得快是这个世界的钟决定的，不是 bug）');
add('世家会断绝（不是只增不减）',
  YEARS < 500 || cs2.ended >= 1,
  `累计断绝 ${cs2.ended} 家 · 在世 ${cs2.clans} 家`
  + '（实测 800 年 13 断；第一条断绝出现在 400 年前后）');
add('家世真的记在出生那一刻（这一条挂了说明血缘边没接上）',
  parentRatio >= 0.3,
  `${withParents}/${world.entities.length} 位有双亲（${(parentRatio * 100).toFixed(0)}%）`
  + '——神力投放的人是撒下来的，没有家世，所以不会到 100%');

// ── 大战与灭门 ──────────────────────────────────────────────
//
// 与转世 / 法宝 / 世家同一套道理，但这一块多一层陷阱：**它有两个看起来等价、
// 其实只有一个是对的读数**。
//
//   `warStats(world).total` 数的是 `world.wars.length`，而 `world.wars` 有
//   `GREAT_BATTLE_LOG_CAP = 400` 条上限（trimWars 会从头部丢掉**已结束**的旧战事）。
//   拿它当「打过多少场大战」用，会得到一个**会变小的读数**——
//   一个八百年里打了五百场大战的世界，终点读数看起来和只打了两百场的世界一样。
//   `world.warLog.declared` 才是累计值，永远只增不减。判据一律用它。
//
// 三条判据各守一件事：
//   A 大战真的打过 —— 别让「规模门槛 / 冷却 / 紧张度」三道门互相咬死，
//     结果一场大战都开不出来（每个函数都返回得干干净净）；
//   B 当事人真的被记下来 —— 大战是**宗门级**的，传记是**个人级**的，
//     中间那层映射（warActors）断了的话，编年史里战报齐全、个人日志里一字不存；
//   C 记录本身是完好的 —— 参与方名单与 phase 是 stepWar 每 tick 都要读的，
//     这里烂掉的话，下一 tick 的行为会变成什么样谁也说不准。
const ws = warStats(world);
const warDeclared = (world.warLog && world.warLog.declared) || 0;
add('大战真的打过（用累计宣战，不用会被裁剪的 world.wars.length）',
  warDeclared > 0,
  `累计宣战 ${ws.declared} · 累计收场 ${ws.resolved} · 累计灭门 ${ws.destroyed}`
  + ` · 战报窗口内 ${ws.total} 条（上限 ${GREAT_BATTLE_LOG_CAP}，已结束的旧战事会被丢掉，`
  + `所以这个数会变小，不能当累计量）· 进行中 ${ws.ongoing}`);
//
// 「当事人被记下来」这一条，**不能只数「谁的个人日志里有 war 条目」**。
//
// 踩到的坑（实测，30 年那一版）：L1 一场大战都还没打，日志里已经有 29 条
// `kind === 'war'` 的条目、8 个人有——它们全来自 `sects.js` 的 **L2 摩擦**
// （`stepConflicts` 的 `world.record(..., 'war', [双方宗主])`，sects.js:577-586）。
// 于是「只数人数」的判据会在「L1 的 `warActors` 整层没接线」的世界里照样变绿——
// 又一个「字段存在 ≠ 字段生效」。
//
// 所以这里按**日志内容**去认，一条日志要同时满足：
//   ① kind === 'war'；
//   ② 文本里出现某一场大战的 `typeLabel`（道争 / 仇杀 / 夺宝 / 天命令）——
//      L1 的三处文案都带它（开场、收场、落定），而 L2 的文案
//      `【a】与【b】交兵于{place}。`（lore.js:367-369）**永远不带**；
//   ③ 文本里出现某一场大战的 aName 或 bName。
// 三条一起才认作「L1 的当事人被记下来了」。匹配的是**数据里的字段**
// （typeLabel / aName / bName），不是写死的中文句子，改文案不会让这一条失效。
//
// ⚠️ 命中数天然小于总场数，而且**应当**如此：宗主战殁时那条日志随人一起被
// 移出 world.entities；宗门覆灭、宗主换人之后，现任宗主的日志里也没有他前任那一战。
// 所以判据是「日志里还认得出至少一条 L1 战报」，不是「每一场都认得出」。
const warTexts = [];
let warLoggedPeople = 0;
const collectWarRows = (log, onHas) => {
  if (!Array.isArray(log)) return;
  let has = false;
  for (const row of log) {
    if (!row || row.kind !== 'war') continue;
    warTexts.push({ text: row.text || '' });
    has = true;
  }
  if (has && onHas) onHas();
};
for (const e of world.entities) {
  collectWarRows(e.log, () => { warLoggedPeople += 1; });
}
// ⚠️ **扫描面必须包含逝者名录**：`world.entities` 只装活人（necrology.js 文件头），
// 宗主一死，他的 `entity.log` 就随人一起离开 `world.entities`，那条战报**再也查不到**。
// 实测：默认种子 20260914 下「累计宣战 7 · 收场 7 · 战殁 6」——7 场仗里 6 位宗主战死，
// 只扫在世者时逐场命中 0，断言因此随种子翻红（这不是机制的错，是**仪器的错**：
// war.js 全部 8 处 `world.record(..., 'war', warActors(world, battle))` 都接了线）。
// `necrology.js` 的 `rememberDead` 会把死者的个人日志**整份快照**存进名录条目
// （`const logRows = cloneLog(entity.log);` 随后 `log: logRows`，necrology.js:274/303），
// 形状与 `entity.log` 同构（每行有 `kind` 与 `text`）。所以把来源扩成
// 「在世者的 log ∪ `world.dead[].log`」。
//
// ⚠️ 名录**也有上限**：`DEAD_CAP = 800`，按 `(importance 降序, died 降序, id 升序)`
// 淘汰，另有 `RECENT_KEEP = 150` 保底（necrology.js:123/125/318）。它不是无限的——
// 但 800 远大于个人日志的 `LOG_CAP = 32`，且「战殁的宗主」重要性高、留得住。
// **若将来 DEAD_CAP 被调小，这条判据的余量会跟着缩。**
// `world.dead` 可能不存在或不是数组（手工构造的世界）——照 `ensureNecrology` 的做法
// 防御，名录缺失时**不红**（在世者那一半照旧生效）。
let deadLoggedPeople = 0;
const deadList = Array.isArray(world.dead) ? world.dead : [];
for (const d of deadList) {
  if (!d) continue;
  collectWarRows(d.log, () => { deadLoggedPeople += 1; });
}
// 判据用**汇总**而不是「逐场都要命中」：逐场统计里，一方的宗主战殁、另一方换人，
// 那一场就两头都认不到了。实测 200 年：7 场里只有 1 场还能在在世者身上认全双方名字
// ——逐场判的话余量只有 1，换个种子就是假失败。汇总成「日志里存在 L1 战报」
// 之后余量来自所有仍活着的当事人，稳定得多，而它守的东西**一模一样**：
// `warActors` 那层映射一断，L1 专属的战报就一条都不会出现在任何人的日志里。
const l1Labels = new Set();
const l1Names = new Set();
for (const b of world.wars) {
  l1Labels.add(b.typeLabel);
  l1Names.add(b.aName);
  l1Names.add(b.bName);
}
const l1Entries = warTexts.filter((r) => {
  let hasLabel = false;
  l1Labels.forEach((lb) => { if (r.text.includes(lb)) hasLabel = true; });
  if (!hasLabel) return false;
  let hasName = false;
  l1Names.forEach((nm) => { if (r.text.includes(nm)) hasName = true; });
  return hasName;
});
let warActorHits = 0;
for (const b of world.wars) {
  const hit = warTexts.some((r) => r.text.includes(b.typeLabel)
    && (r.text.includes(b.aName) || r.text.includes(b.bName)));
  if (hit) warActorHits += 1;
}
add('大战的当事人（宗主）被记进了个人日志',
  world.wars.length === 0 || l1Entries.length > 0,
  `日志里能认出 L1 大战的条目 ${l1Entries.length} 条（带 typeLabel 且带双方宗门名）`
  + ` · 战报窗口内 ${world.wars.length} 场，逐场命中 ${warActorHits} 场`
  + ` · 在世者中 ${warLoggedPeople} 人日志里有 war 条目（含 L2 摩擦，所以这个数不能当判据）`
  + ` · 名录（逝者）中 ${deadLoggedPeople} 人日志里有 war 条目（宗主战殁后战报只在这里）`
  + '——L1 与 L2 都写 kind=war、都挂宗主，只数人数的话，L1 没接线也照样绿');
//
// phase 的合法值只有两个，读 war.js 确认过：declareWar 写 'mobilizing'、
// endBattle 写 'ended'（warStats 与 stepWar 都是拿 'ended' 当分界）。
// 写成一个集合而不是 `phase === 'mobilizing' || phase === 'ended'`，
// 是为了将来真的加了中间相位时，这里会**报错**而不是静默放行。
const WAR_PHASES = new Set(['mobilizing', 'ended']);
const badPhase = world.wars.filter((w) => !WAR_PHASES.has(w.phase));
const badSides = world.wars.filter((w) => !Array.isArray(w.sideA) || !Array.isArray(w.sideB)
  || w.sideA.length === 0 || w.sideB.length === 0);
add('大战记录本身是完好的（phase 合法、双方名单都是非空数组）',
  badPhase.length === 0 && badSides.length === 0,
  badPhase.length || badSides.length
    ? `phase 非法 ${badPhase.length} 条（${badPhase.slice(0, 3).map((w) => `${w.aName}×${w.bName}:${w.phase}`).join(' ')}）`
      + ` · 名单残缺 ${badSides.length} 条`
    : `${world.wars.length} 条记录 · phase ∈ {mobilizing, ended} · 双方名单都是数组`
      + `（sideA/sideB 里可能不止一家：盟友会助拳）`);

// ── 夺舍 ────────────────────────────────────────────────────
//
// 同样有两个读数，而且**必须并排看**：
//   `possessionStats().total` —— 此刻在世、身上还带着印记的人。当事人一死就归零。
//   `succeeded` / `failed` / `suspectEvents` —— 单调递增的累计账本。
// 只看前者，一个「早年夺舍过一批、之后那些人都死了」的世界与一个
// 「一次都没夺舍过」的世界读数完全一样（都是 0）。
//
// ⚠️ 门槛按年数给，依据是**实测**，不是拍脑袋：
//   · `scripts/_deathcensus.mjs`（3 颗种子 × 300 年，medium）测出境界 ≥ 20 的死亡
//     有 291 人次、首次出现在第 25 年，300 年累计夺舍 38 成 / 15 败；
//   · 本测试自己 200 年那一跑读到累计成功 19（第 100 年时就已经 11 成）。
//   所以取 200 年作门槛，留了一倍余量。**不能**拿「此刻在世带印记的人数」当依据：
//   那 38 位当事人在 300 年时早就死了，这个读数是 0——早期把 400 年读到 0
//   误判成「夺舍是死代码」，就是这么来的。
const ps = possessionStats(world);
const POSSESSION_FLOOR_YEARS = 200;
const possFloor = YEARS >= POSSESSION_FLOOR_YEARS ? 1 : 0;
add('夺舍真的发生过（用累计账本，不是此刻在世带印记的人数）',
  ps.succeeded + ps.failed >= possFloor,
  `累计成功 ${ps.succeeded} · 累计失败 ${ps.failed}`
  + ` · 起疑事件 ${ps.suspectEvents} · 此刻在世带印记 ${ps.total} 人`
  + `（门槛：${POSSESSION_FLOOR_YEARS} 年及以上要求 ≥ 1 次；短局只印读数不判——`
  + '夺舍要求死者境界 ≥ 20 且元神 15% 不散，头几十年本来就不该有）');
//
// 累计账本必须只增不减。中途采过样（possMid），这里比对——
// 只判「有限数字且 ≥ 0」的话，一个被读档逻辑写坏的、或者某处误赋 0 的账本
// 照样能过；比对两次读数才能把「归零 / 回退」这种真故障逼出来。
const possLedger = world.possessionLog || {};
const ledgerOk = ['succeeded', 'failed', 'suspected'].every(
  (k) => Number.isFinite(possLedger[k]) && possLedger[k] >= 0,
);
const ledgerMono = !possMid
  || (ps.succeeded >= possMid.succeeded
    && ps.failed >= possMid.failed
    && ps.suspectEvents >= possMid.suspectEvents);
add('夺舍累计账本只增不减（中途采样比对）',
  ledgerOk && ledgerMono,
  possMid
    ? `第 ${midYear} 年 成${possMid.succeeded}/败${possMid.failed}/疑${possMid.suspectEvents}`
      + ` → 第 ${YEARS} 年 成${ps.succeeded}/败${ps.failed}/疑${ps.suspectEvents}`
    : `未采样（年限太短）· 当前 成${ps.succeeded}/败${ps.failed}/疑${ps.suspectEvents}`);
//
// 约束二（模块头注释）：被夺舍的容器不能同时是转世者，否则一具身体里挤着两条外来魂。
// possession.js 已经把这条判据摊成了纯函数（possessionInternals.mutuallyExclusive），
// 这里直接调它，不再自己重写一遍——两处各写一份迟早会漂。
// 源码侧的实现是「pickTarget 排除 soulId 非空的人」，所以这一条是**结构性成立**的；
// 留着它，是为了将来有人动 pickTarget 的过滤条件时能立刻发现。
const coexist = world.entities.filter((e) => !possessionInternals.mutuallyExclusive(e));
add('夺舍印记与转世神魂不共存（一具肉身不装两条外来魂）',
  coexist.length === 0,
  coexist.length
    ? `${coexist.length} 位同时带印记与神魂：${coexist.slice(0, 3).map((e) => `${e.name}(魂${e.soulId})`).join(' ')}`
    : `在世带印记 ${ps.total} 人 · 在世转世者 ${world.entities.filter((e) => e.soulId).length} 人 · 无交集`);

// ── 传记 ────────────────────────────────────────────────────
//
// 传记这一块的失效方式和别人不一样：它不是「某个函数不返回」，而是
// **写入路径少接了一条**——觉醒接了、死亡没接、结侣接了、突破没接。
// 这种情况下日志照写、覆盖率照样有个数字、编译出来的传记照样是合法 Markdown，
// 只是某些人生里最重要的事永远不会出现。
//
// 所以判据不能只看「覆盖率百分比」：世上九成是凡人，覆盖率天然就是个位数，
// 一个「觉醒这条线整个没接上」的世界与一个健康世界的覆盖率都可能是 5%。
// 要守的是**锐利的不变量**：凡是已觉醒的修士，都必须有日志。
//
// ⚠️ 这条判据曾经**跑红过**，历史记在这里，免得下一个人以为它天然是绿的：
//
//   · 世界上有一类人是**出生即修士**（村里 10% 的新生儿 `innate`，
//     life.js:1021 直接以 `SPECIES.CULTIVATOR` 生成），走的是
//     `initEntity(cultivator: true)` → `awaken(..., { silent: true })`
//     （cultivation.js:184）。这条路**当时不写任何日志**——他不是「觉醒」过来的，
//     而是生下来就有灵根；而 `attemptBreakthrough` 只在小境界**卡瓶颈**时
//     才写日志（cultivation.js:387），于是一路顺顺当当升到 8 级的修士可以一条都没有。
//   · 实测（种子 20260914，第 60 年，旧代码）：已觉醒 168 人里 24 人日志为空，
//     **24 人全部是出生即修士**；他们的年龄 min 0.03 / 中位 0.60 / max 4.28 年，
//     而全体已觉醒的年龄中位数是 7.03 年——空日志的全是「还没来得及遇到第一件事」
//     的新生儿，不是「接线断了」。
//   · 修法落在 `life.js` 的 `spawn()` 里：`initEntity` 之后给每一个修士补一条
//     来历记录（转世者与天生灵根两种文案）。它**只进个人日志**（直接调
//     `recordLifeEvent`，不经过 `world.record`），所以编年史那 400 条的滚动窗口
//     一位不受影响；也不抽签，主随机流一位不动。
//
// 修完之后这条不变量是**精确的、没有例外**：`spawn()` 是全世界唯一的实体创建路径
// （`world.addEntity` 只在 life.js:162 被调用一次），而它对每一个修士同步写一条。
// 所以这里**不给宽限期**——宽限期会让「某条写入路径整条没接上」这种真故障
// 在前 N 年里静默通过，而那正是这条判据存在的全部意义。
// 实测（当前代码）：第 60 年 168/168 位已觉醒修士全部有日志，空日志 0 位。
//
// detail 里仍然印「年龄」，因为它能把「刚落地的新生儿」与
// 「活了两百年却一条记录都没有」一眼分开——通过时印最年轻的那位有多年轻
// （刚落地就记上了），失败时印最年长的那几位各是几岁。
const bio = biographyStats(world);
add('有人在被记进个人日志', bio.logged > 0,
  `有日志 ${bio.logged}/${bio.entities} 人（${(bio.coverage * 100).toFixed(1)}%）`
  + ` · 共 ${bio.events} 条 · 人均 ${bio.avgEvents} 条`);
const awakened = world.entities.filter((e) => (e.level || 0) > 0);
const noLog = awakened.filter((e) => !Array.isArray(e.log) || e.log.length === 0);
const ageYears = (e) => (e.age || 0) / TIME.daysPerYear;
// 失败时按年龄降序，让「最年长的那个」排在第一个——它才是真故障的样子
const noLogWorst = noLog.slice().sort((a, b) => ageYears(b) - ageYears(a));
const youngestLogged = awakened.reduce(
  (m, e) => ((e.log && e.log.length) ? Math.min(m, ageYears(e)) : m), Infinity,
);
add('凡是已觉醒的修士都有个人日志（出生即修士也要有，见上面的实测）',
  noLog.length === 0,
  noLog.length
    ? `${noLog.length}/${awakened.length} 位已觉醒却没有日志，最年长的：`
      + noLogWorst.slice(0, 3).map((e) => `${e.name}(Lv${e.level}·${ageYears(e).toFixed(1)}年)`).join(' ')
      + '——若这几位都是刚落地的新生儿，说明出生那条记录没接上；'
      + '若年龄很大，说明某条写入路径整条是死的'
    : `${awakened.length} 位已觉醒的修士全部有日志`
      + ` · 最年轻的有日志者 ${Number.isFinite(youngestLogged) ? youngestLogged.toFixed(2) : '—'} 年`
      + '（刚落地就记上了，所以这里不留宽限期）');
const overCap = world.entities.filter((e) => Array.isArray(e.log) && e.log.length > LOG_CAP);
add('没有人的日志超过 LOG_CAP（上限是「一生最重要的 N 件事」，不是 FIFO）',
  overCap.length === 0,
  `上限 ${LOG_CAP} · 实际最长 ${bio.topCount} 条`
  + (overCap.length ? ` · 超标 ${overCap.length} 人` : ''));
// kind 的分布是**一眼看出哪条写入路径是死的**的读数：
// 只有 'birth' 一种，就说明除了出生之外的接线（觉醒 / 突破 / 死亡 / 结侣 / 开宗）
// 全都没生效，而日志条数照样能涨到几千。
const bioKinds = new Map();
for (const e of world.entities) {
  if (!Array.isArray(e.log)) continue;
  for (const row of e.log) {
    const k = (row && row.kind) || 'event';
    bioKinds.set(k, (bioKinds.get(k) || 0) + 1);
  }
}
const bioKindList = Array.from(bioKinds.entries()).sort((a, b) => b[1] - a[1]);
add('个人日志的 kind 不止一种（至少 3 种，说明不是只有出生被记上）',
  bioKinds.size >= 3,
  `${bioKinds.size} 种：${bioKindList.map(([k, n]) => `${k}:${n}`).join(' ')}`);

// ── 个人交手（D4-1，2026-09-23 加）──────────────────────────
// 这一条挂的是**故障类 8：机制在、从不发生**。
// `attack()` 从 2026-09-23 起给两个终局各记一笔 `kind:'duel'` 的个人日志
//（致死 → 凶手 45 分 / 手下留情 → 挨打者 40 分）。而 `attack()` 本身是
//「两人挨得够近就打」的常驻通道 ⇒ 跑了几十年的世界**应该**攒下相当数量。
// 若这里是 0，只有两种可能，而且**两种都不报错**：
//   · 致死 / MERCY 分支根本没走到（伤害公式被改得打不死人）；
//   · 那条写入路径被删了、或条件写反了（比如 mercy 那一笔被挪到 `return` 之后）。
// 两种都只在玩家那侧表现为「这个人的传记里一辈子没有一场架」。
const duelRows = bioKinds.get('duel') || 0;
add('有人在真实世界里留下了交手记录（D4-1 的两个终局至少发生过一次）',
  duelRows > 0,
  `duel ${duelRows} 条 · 占个人日志 `
  + `${bio.events ? ((duelRows / bio.events) * 100).toFixed(2) : '0.00'}%`);
// 上界判据——照 KNOWN_ISSUES 那条教训（「每条『让某个东西不变坏』的规则，
// 都该配一条上界判据」，反过来也一样：**每个新写入源都要配一条**）。
// 交手的分数 45/40 高于普通杂事（35）、低于突破（59）⇒ 理论上不会挤掉修行大事；
// 但一个杀了几十年的老杀手仍可能把自己那 `LOG_CAP = 32` 格填成交手流水。
// 这一条守的是「它没有把整本个人日志变成战报」。
add('交手没有把个人日志变成战报（占比低于一半）',
  bio.events === 0 || duelRows / bio.events < 0.5,
  `${duelRows}/${bio.events} 条 = `
  + `${bio.events ? ((duelRows / bio.events) * 100).toFixed(1) : '0.0'}%`);

// ── 上界（阶段二）──────────────────────────────────────────
// 规格 §7 阶段二验收判据。每条挂的是「玩法还在不在」，不是数值好不好看。
// ⚠️ 兜底形状必须与 `planes.ensureUpperPopLog` **逐键一致**（七键）。
// 少一个键不会立刻出事，但会让「某条路径跑过之后那个键变 undefined」这类
// 雷埋在很远的地方（本项目踩过：`popLog.seeded` 漏进兜底，红在存读档测试里）。
const upPop = upper.popLog
  || { arrived: 0, born: 0, bornMortal: 0, died: 0, seeded: 0, sucked: 0, arrivedThunder: 0 };
add('飞升者到了上界', upPop.arrived > 0,
  `${upPop.arrived} 位飞升者进入上界（凡间飞升名录 ${world.ascended.length}）`);
// ⚠️ `born` 是**修士化生**，`bornMortal` 是**凡人生育**（2026-09-19 阶段四拆开）。
// 两者共用一个计数器时，这条判据会被凡人出生顶绿——哪怕修士化生整个坏掉。
add('上界有本土诞生（修士化生）', upPop.born > 0,
  `${upPop.born} 次化生（凡人另计 ${upPop.bornMortal}）`);
// 上界人口守恒式：现存 = 开局播种 + 飞升/吸上来 + 修士化生 + 凡人生育 − 陨落。
// 五个来源里漏记任何一个（比如化生忘了记 `born`、裂缝吸上来忘了记 `arrived`、
// 凡人生育记进了 `born`），单看某一个读数都看不出来，只有这条等式会把差额逼出来。
// 裂缝吸人走 `arriveUpper`，它记的正是 `arrived`，所以本阶段不会破坏这条守恒。
add('上界人口守恒式：现存 === seeded + arrived + born + bornMortal − died',
  upper.entities.length === (upPop.seeded || 0) + upPop.arrived
    + upPop.born + upPop.bornMortal - upPop.died,
  `${upper.entities.length} = ${upPop.seeded || 0} seeded + ${upPop.arrived} arrived`
  + ` + ${upPop.born} born + ${upPop.bornMortal} bornMortal − ${upPop.died} died`);
// 「不是只增不减」：有陨落记录，或者人口已经归零（全死光了也是「减」过）。
// 只看终态 `entities.length` 分不清「一直在涨」和「涨了一批然后全死了」——
// 后者的终态也是 0，但 `died > 0` 能把它和「从来没人来过」分开。
add('上界人口不是只增不减', upPop.died > 0 || upper.entities.length === 0,
  `${upPop.died} 位陨落 · 现存 ${upper.entities.length}`);
add('上界有仙门', upper.factions.length >= 2,
  `${upper.factions.length} 家仙门`);
// 飞升者在上界活得下去：800 年内合体期寿元 7600 年，飞升者不该一到就死。
// `arrived === 0` 时这条不算红——那是凡间飞升通道的问题，由上面那条管。
const livingFromMortal = upper.entities.filter((e) => e.fromMortal).length;
add('飞升者在上界活得下去',
  upPop.arrived === 0 || livingFromMortal > 0,
  `${livingFromMortal} 位飞升者仍在世（共到达 ${upPop.arrived}）`);
// id 不相交（铁律三）：两界各自从 1 / UPPER_ID_BASE 起编，交集应为空。
const mortalIdSet = new Set(world.entities.map((e) => e.id));
let idIntersect = 0;
for (const e of upper.entities) if (mortalIdSet.has(e.id)) idIntersect += 1;
add('上界实体 id 不与凡间相交', idIntersect === 0,
  `${idIntersect} 个相交`);

// ── 上界凡人生态（阶段四 · 用户第 4 条）─────────────────────
// 「凡人也能在上界活着」拆成四条**可判定**的判据。每一条都挂「玩法还在不在」，
// 不是数值好不好看。四条缺一不可：
//   · 只测「有凡人」→ 分不清「活着」与「吸上来就死」；
//   · 只测「有繁衍」→ 分不清「自己繁衍」与「一直靠裂缝补人」；
//   · 只测「有修行」→ 分不清「真有人踏上修行路」与「凡人全老死了」。
// 全部用**累计账**（`bornMortal` / `mortalAwakened`）而不是终点快照，
// 理由见那些计数器的注释（凡人寿元只有约 11.7 年，终点快照极易归零）。
{
  const upMortals = upper.entities.filter((e) => isUpperMortal(e)).length;
  const upCultivators = upper.entities.length - upMortals;
  const diagUp = `上界现 ${upper.entities.length}（修士 ${upCultivators} / 凡人 ${upMortals}）`
    + ` · 累计吸上来 ${upPop.sucked} · 凡人生育 ${upPop.bornMortal}`
    + ` · 凡人踏入修行 ${mortalAwakened}`;
  // ① 裂缝真的把凡人送上去了（`sucked` 是 `arrived` 的子集，见 `ensureUpperPopLog`）。
  add('裂缝把凡人送进了上界（popLog.sucked > 0）', upPop.sucked > 0, diagUp);
  // ② 上界此刻有凡人活着。`sucked === 0` 时不算红——那是裂缝通道的问题，由 ① 管。
  add('上界有凡人活着', upPop.sucked === 0 || upMortals > 0, diagUp);
  // ③ 凡人在上界**自己繁衍**（不是一直靠裂缝补人）。
  add('上界凡人能繁衍（bornMortal > 0）', upPop.bornMortal > 0, diagUp);
  // ④ 凡人能踏上修行路（上界灵气充裕，这是「活着」最有意义的后果）。
  add('上界凡人能踏入修行（level 0 → ≥1）', mortalAwakened > 0, diagUp);
}

// ── 上界独立炼器（阶段四 · 用户第 2 条选 (a)）──────────────────
// 这一条守的是**裂缝方向 A 的候选池**。改前实测：上界地面无主法宝峰值只有 1 件，
// 裂缝「上→下漏法宝」方向在 28311 次判定里 0 次命中——「结构性饿死」。
// 故障：有人删掉 `UpperLife.maybeForge()` → 上界又只剩「突破时炼器」这一条腿
// → 无主池回到近乎恒空 → 本判据变红（而裂缝那些判据**不会**红，
// 因为 `leaked` 还有「凡间法宝→上界」第 5 行兜着）。这就是为什么这条必须单独存在。
{
  const upForged = (upper.artifactLog || {}).forged || 0;
  add('上界独立炼器在产（artifactLog.forged > 0）', upForged > 0,
    `累计炼出 ${upForged} 件`);
  add('上界地面无主法宝池不恒空（峰值 > 0，裂缝方向 A 有东西可漏）',
    upperUnownedPeak > 0,
    `无主法宝峰值 ${upperUnownedPeak} 件 · 此刻上界法宝 ${(upper.artifacts || []).length} 件`);
}

// ── 跨界门槛：天雷飞升（阶段四 · 用户第 3 条）────────────────────
// 用户原话：「跨界门槛定设定裂隙处无限制，都有概率跨界。但高修为修士必须通过
// 飞升来跨境，设定为化神期天雷事件，如果通过可以跨界。」
//
// 这一节存在的理由是「字段存在 ≠ 字段生效」：`_thunderprobe.mjs` 有 33 条断言
// 钉机制，但那是**单测**（局部数据）。四层里的长测必须能自己判出
// 「这条通道在几百年的真实世界里还活着」。
//
// ⚠️ **为什么唯一的信号是 `popLog.arrivedThunder`**（而不是数飞升名录）：
// `World.recordAscension` 把 `world.ascended` 在**内存里**就截到 120 条
// （`World.js:422`）——名册会缩小，**缩小了的名册不能证明「从未发生」**。
// 所以 2026-09-19 阶段四给上界 `popLog` 加了 `arrivedThunder`（只增不减）。
// 这个数要求整条链**每一环都在**：闸门排在 `attemptBreakthrough` 之前 →
// 天雷抽签命中 → 渡劫通过 → `forceUpper` 让它真去上界 → `via` 让账本认得出他。
// 任何一环断了它都是 0，**而且不报错**。
{
  // ① **静态咬合**：裂隙上界与天雷下界必须同值。
  // 故障：把其中一个改成 39 或 41 → 出现「两路都能走」的重叠区（39 级既被裂缝吸、
  // 又能被天雷送走）或「两路都不能走」的死区（40 级既不被吸、又够不到天雷）→ 红。
  // 这是**静态**判据，与跑多久无关，所以它比任何读数都先发现漂移。
  add(`门槛咬合：裂隙上界 === 天雷下界（同为 ${RIFT_CROSS_MAX_LEVEL}）`,
    RIFT_CROSS_MAX_LEVEL === THUNDER_ASCEND_MIN_LEVEL,
    `裂缝吸走 <${RIFT_CROSS_MAX_LEVEL} · 天雷接管 [${THUNDER_ASCEND_MIN_LEVEL}, ${ASCEND_LEVEL})`
    + ` · 必然飞升 ≥${ASCEND_LEVEL}`);
  // ② 天雷通道活着：几百年的世界里至少有一位是**经天雷**进的上界。
  // 故障（本条能一次全抓到，这是它比单测强的地方）：
  //   · 闸门被移到 `attemptBreakthrough` 之后 → 天雷永远轮不到；
  //   · `THUNDER_ASCEND_CHANCE` 被改成 0；
  //   · `forceUpper` 丢了 → 人去了福地、上界不多人；
  //   · `via` 没传 → 人到了上界，账本却认不出他。
  // ⚠️ `>= 1` 是**存在性**判据，不外推：它问「这条通道到底会不会通」。
  //    速率好不好看是另一回事（`THUNDER_ASCEND_CHANCE` 仍待标定），不在这里判。
  add('天雷飞升通道活着（上界 popLog.arrivedThunder > 0）',
    (upPop.arrivedThunder || 0) > 0,
    `经天雷进上界 ${upPop.arrivedThunder || 0} 人 · 上界累计到达 ${upPop.arrived}`
    + ` · 飞升名录 ${world.ascended.length} 人（滚动窗口，仅诊断）`);
  // ③④ 用上界名册的**到达快照**（`arrivedLog[].level` 是到达那一刻的境界，
  //     此后在上界怎么涨都不影响它）核对用户那条门槛规则的**两个方向**：
  //       · 裂缝吸走的人：境界必须 **< 40**；
  //       · 天雷送走的人：境界必须落在 **[40, 60)**。
  //     ⚠️ 名册无上限（`worldgenUpper` 只把它初始化成 `[]`，没人裁剪），所以
  //        在长测里它是**全量**的；但判据仍写成「样本为 0 时自动通过」——
  //        因为手工构造的世界可能一条都没有，那时断言的是**空集**，
  //        强行要求非空会变成「假红工厂」。
  const byVia = (v) => (upper.arrivedLog || []).filter((a) => a.via === v);
  const riftArr = byVia('rift');
  const thunArr = byVia('thunder');
  const riftBad = riftArr.filter((a) => !((a.level || 0) < RIFT_CROSS_MAX_LEVEL));
  add(`裂缝没吸走高修为（名册样本 ${riftArr.length} 条，全部 level < ${RIFT_CROSS_MAX_LEVEL}）`,
    riftBad.length === 0,
    riftBad.length === 0
      ? `样本 ${riftArr.length} 条全部合格`
      : `${riftBad.length} 条越界：${riftBad.slice(0, 5).map((a) => `${a.name}(${a.level})`).join('、')}`);
  const thunBad = thunArr.filter((a) => !((a.level || 0) >= THUNDER_ASCEND_MIN_LEVEL
    && (a.level || 0) < ASCEND_LEVEL));
  add(`天雷只送化神期（名册样本 ${thunArr.length} 条，全部 level ∈ [${THUNDER_ASCEND_MIN_LEVEL}, ${ASCEND_LEVEL})）`,
    thunBad.length === 0,
    thunBad.length === 0
      ? `样本 ${thunArr.length} 条全部合格`
      : `${thunBad.length} 条越界：${thunBad.slice(0, 5).map((a) => `${a.name}(${a.level})`).join('、')}`);
}

// ── 空间裂缝（阶段三 · 块四）──────────────────────────────
// 规格 §4.4 的判据口径：100 年 `riftLog.leaked` 应在 [1, 20]。
// 长测跑的是 YEARS 年，所以**按实际年数线性外推**：下界仍为 1（「系统活着」不随年数变），
// 上界 = 20 * YEARS / 100。**外推依据**：开缝节奏固定（每 20 年一次 × 3 个固定位置）、
// 每条缝的存活期与每周期漏物概率都是常量，所以累计漏物数随年数线性增长。
// **两个方向都要卡**：只卡 ≥1 会让「漏到爆炸」也通过；只卡 ≤上界 会让「一件不漏」
// 也通过——这正是「转世真的在发生」那条判据的教训。
const rsRift = riftStats(world);
// 账本守恒。故障：闭合时忘了从数组剔除，或忘了记 `closed` → 两边不等。
add('裂缝账本守恒：opened === closed + 活跃数',
  world.riftLog.opened === world.riftLog.closed + world.rifts.length,
  `opened=${world.riftLog.opened} closed=${world.riftLog.closed} 活跃=${world.rifts.length}`);
// ⚠️ **本阶段最重要的一条**。故障：时钟没接上（`stepRifts` 不跑）或开缝没接上
// （`openRifts` 不跑）→ 账本恒 0。用长测本地累加的 `riftOpenedByPlayer` 与账本
// 交叉核对，还能抓「开了但没记账」。
add('裂缝系统活着（长测显式开视界后 opened >= 1）',
  world.riftLog.opened >= 1 && riftOpenedByPlayer >= 1,
  `opened=${world.riftLog.opened} · 玩家模拟共开 ${riftOpenedByPlayer} 道`);
const leakHi = 20 * YEARS / 100;
// ⚠️ 这条判据的**两侧口径不对称，是刻意的**，别照着上界的样子去「修」下界：
//   · 下界 `>= 1` 是**存在性**判据（规格 §4.4 原文：「`>= 1`（**系统活着**）」）——
//     它问的是「漏物这件事到底会不会发生」，**不随年数外推**：跑 300 年只漏 1 件，
//     也足以证明机制是通的。若把它外推成 `>= YEARS/100`，语义就从「活着」变成了
//     「达到设计速率」，那是**另一条判据**（见下面那条只诊断、不判红的速率读数）。
//   · 上界 `<= 20 × YEARS/100` 是**速率**判据（原文：「`<= 20`（**不失控**）」）——
//     漏得越多越糟，所以必须随年数放宽，否则长局必然假红。
//   · 这条标签曾经写成「1 ≤ leaked ≤ N，按 100 年 [1,20] 线性外推」，
//     那句话对上界成立、对下界**不成立**——一条会撒谎的注释比没有注释更坏，
//     后来人会以为下界也是外推值，从而在某个长局里把它「修」回去。
add(`裂缝漏物在量级内（下界 1 = 存在性 · 上界 ${leakHi} = 速率，按 100 年 [1,20] 外推）`,
  world.riftLog.leaked >= 1 && world.riftLog.leaked <= leakHi,
  `leaked=${world.riftLog.leaked}（上界 ${leakHi}）`);
// ── 速率读数（**只打印，不判红**）─────────────────────────────
// 规格 §4.4 的标定目标是「100 年几件」。把它单独打出来，是因为上一条判据只证
// 「机制通」；「速率够不够」是另一个问题。
//
// ⚠️⚠️ **两个口径必须并排印，否则这个读数会撒谎（2026-09-19 阶段四修）**：
//   规格 §4.4 的「100 年」是**世界年**，而它写下的时候裂缝的时钟是
//   「每 30 日无条件跑一次」= 视界永远开着。契约 C1.1 之后，裂缝的时钟
//   **只在视界开着的 25% 时间里走**，于是「世界年口径」的速率会**天然低 4 倍**，
//   看起来像「漏物机制退化」，其实只是**分母变了**。
//   只印一个口径，后来人会拿着世界年读数去调 `LEAK_CHANCE_PER_PERIOD`，
//   把速率硬拉到「100 年几件」——那会让**视界内**的漏物密度变成设计意图的 4 倍。
//   两个口径并排，才能看出「少的是分母，不是分子」。
console.log(`  · 漏物速率读数（世界年口径）：${(world.riftLog.leaked * 100 / YEARS).toFixed(2)} 件 / 100 世界年`
  + `（规格 §4.4 的目标量级是「几件」；⚠️ 该目标写于「视界永远开着」的旧语义下）`);
console.log(`  · 漏物速率读数（视界内口径）：${riftViewYears
  ? (world.riftLog.leaked * 100 / riftViewYears).toFixed(2) : '—'} 件 / 100 视界内年`
  + `（视界内共 ${riftViewYears} 年 · 占空比 ${(riftViewYears / YEARS * 100).toFixed(0)}%）`
  + '　← 这一条才是与规格目标可比的口径');
// 故障：闭合曲线写错 → 缝永不闭合。
add('裂缝会闭合（closed > 0）',
  world.riftLog.closed > 0, `closed=${world.riftLog.closed}`);
// 裂缝尺寸标定（见 `rifts.js` 的 `RIFT_BASE_RADIUS` 注释）：**长测实际用的
// 40×30 划选**下的峰值半径必须落在 [3.5, 4.5] 格。故障：有人把 `RIFT_BASE_RADIUS`
// 调回小值（改前 ≈1.62 格，半径 1.62 的圆只覆盖约 8 格 = 全图 0.015%）→
// 裂缝小到覆盖不到任何东西 → 这条变红。它同时是「标定被后来人改坏」的哨兵。
// 口径与预设无关：`small`(200×128) → 4.09 格 · `medium`(288×180) → 3.99 格 ·
// `large`(384×240) → 3.96 格，三个预设都在区间内。
// ⚠️ 这三个数是 2026-09-19 阶段四**重新标定后**的值（`TAU_CLOSE` 10800→4000
//    把峰值系数从 0.7905 压到 0.6790，`RIFT_BASE_RADIUS` 5.0→5.75 把它补回来）。
//    改前的注释写的是 4.14 / 4.04 / 4.00 —— **同一条判据、不同的曲线形状**。
//    读到这行觉得「数不对」时，先确认自己看的是哪一版常数，别直接改判据。
{
  const areaFrac = (40 * 30) / world.size;
  const strength = Math.min(RIFT_MAX_RADIUS, RIFT_BASE_RADIUS * (1 + areaFrac));
  const peakT = TAU_GROW * Math.log(1 + TAU_CLOSE / TAU_GROW);
  // ⚠️ 签名是 `riftRadiusAt(rift)` —— 它**只读 `rift.age`**，没有第二个参数。
  //    改前这里写 `riftRadiusAt({ openedDay: 0, strength }, peakT)`，多传的那个
  //    `peakT` 被**静默忽略**，于是 `age` 走 `|| 0` → 半径恒 0 → **峰值 0.000 格撞红**。
  //    ⚠️ 它看起来像「`RIFT_BASE_RADIUS` 被人调回小值了」，其实常量是对的
  //    （同一天 smoke 那条也是同因，见 `inkbox-smoke.mjs` 的 ⑤）。
  //    想让缝「长到某个年纪」就把 `age` 换掉，**不要**给它加第二个参数。
  const peakRadius = riftRadiusAt({ openedDay: 0, strength, age: peakT });
  add(`裂缝尺寸标定：40×30 划选的峰值半径 ∈ [3.5, 4.5] 格（${PRESET.label}）`,
    peakRadius >= 3.5 && peakRadius <= 4.5,
    `峰值 ${peakRadius.toFixed(3)} 格（strength ${strength.toFixed(3)} · areaFrac ${areaFrac.toFixed(5)}）`);
}
// 裂缝记录里没有 id 引用（铁律三）。长期跑最怕有人往里塞 id。
// ⚠️ 第 9 个键是 `age`（2026-09-19 阶段四新增）。它**不违反铁律二**：记的是
//    「视界**开启期间**累积的天数」，取决于玩家历次开关视界的历史，现算不出来
//    —— 而 `radius` / `peakDay` 仍是推导量，那两个出现在这里就该红。
// ⚠️ 第 10 个键是 `targetPlane`（2026-09-24 · D6-2 工程包 B2）：记「这条缝连的
//    是上界还是幽冥」，同样推不出来（玩家关掉视界后它仍要知道自己连哪里）。
//    长测里开出来的缝**全是上界缝**（`openRifts` 缺省目标就是上界），
//    所以这里只钉键集形状；「幽冥缝冻结跨界」由 smoke 的专门判据钉。
const RIFT_KEY_STR = 'age,closedDay,crossed,id,leaked,openedDay,strength,targetPlane,x,y';
const badRiftKeys = world.rifts.filter((r) => Object.keys(r).sort().join(',') !== RIFT_KEY_STR);
add('裂缝记录里没有任何 id 引用（键集恰好是契约的 10 个）',
  badRiftKeys.length === 0,
  badRiftKeys.length ? `${badRiftKeys.length} 条键集不符` : `当前活跃 ${world.rifts.length} 条，键集正确`);

// ── 两个方向**分别**记数（不合并成 crossed+lost）──
// 诊断材料：判定 pass 次数、累计漏物抽签槽位（活跃缝 × 周期）、以及候选池大小。
// 某一向恒 0 时，靠这三个数判断是「样本不足」还是「逻辑坏了」（规格 §4 明确要求诊断）。
const unownedUpperArts = (upper.artifacts || []).filter((a) => !a.ownerId).length;
const mortalGroundArts = (world.artifacts || []).length;
const mortalGroundUnowned = (world.artifacts || []).filter((a) => !a.ownerId).length;
// ⚠️ 门槛方向已反转（2026-09-19 阶段四）：裂缝吸的是 **level < RIFT_CROSS_MAX_LEVEL**
// 的人（凡人 + 低阶修士），化神期及以上**只能走飞升**。所以这里数的是
// 「**有资格被吸**的人数」，判据是 `<` 而不是 `>=`。
const riftEligible = world.entities.filter((e) => (e.level || 0) < RIFT_CROSS_MAX_LEVEL).length;
const tooHighToSuck = world.entities.filter((e) => (e.level || 0) >= RIFT_CROSS_MAX_LEVEL).length;
const commoners = world.entities.filter((e) => (e.level || 0) === 0).length;
const riftDiag = `判定 pass ${riftStepCount} 次（视界内 ${riftViewYears} 年 · 占空比 `
  + `${(riftViewYears / YEARS * 100).toFixed(0)}%）`
  + ` · 漏物抽签槽位 ${riftDrawSlots}`
  + ` · 方向 A 候选命中（缝·拍，上界无主法宝在半径内）${riftDirACandHits}`
  + ` · 第 5 行触发前提（缝·拍，无人且有凡间无主地面法宝）${riftRow5Ready}`
  + ` · 候选池：境界<${RIFT_CROSS_MAX_LEVEL} 的凡间生灵 ${riftEligible} 人`
  + `（其中凡人 ${commoners}）`
  + ` / 境界≥${RIFT_CROSS_MAX_LEVEL} 只能飞升 ${tooHighToSuck} 人`
  + ` / 上界地面无主法宝 ${unownedUpperArts} 件`
  + ` / 凡间地面法宝 ${mortalGroundArts} 件（其中无主 ${mortalGroundUnowned}）`;
// 合并判据只守「吸人机制至少有一向在动」——两向**都**恒 0 才判红，
// 单独某一向恒 0 只告警（规格 §4：1500 年里恒 0 要诊断，不要直接判红）。
// ⚠️ `lost` 自 2026-09-19 阶段四起**按设计恒 0**（用户第 4 条把「凡人失踪」
//    改成了「凡人在上界活着」），所以这条判据实际等价于 `crossed > 0`。
//    仍然写成 `crossed + lost > 0` 是**刻意的**：它同时兼容老档（`lost` 有值）
//    与新档，且不会因为将来「失踪」被重新启用而失效。
add('裂缝吸人至少有一个方向在记数（crossed + lost > 0）',
  world.riftLog.crossed + world.riftLog.lost > 0,
  `crossed=${world.riftLog.crossed} lost=${world.riftLog.lost} · ${riftDiag}`);
// 两个方向**各自**的读数（恒 0 时只告警、不判红，把诊断交给报告）。
const dirLine = (label, n) => console.log(
  `  ${n > 0 ? '✓' : '⚠'} 裂缝${label} = ${n}`
  + (n > 0 ? '' : `（恒 0，按规格 §4 只诊断、不判红）：${riftDiag}`),
);
dirLine('方向（下→上 · 生灵进上界，修士与凡人都在内）crossed', world.riftLog.crossed);
// ⚠️ `lost` 这一行现在是**墓碑读数**：按设计恒 0（见上面那条 add 的注释）。
//    保留它是为了「万一有人把它接回生产端」时能被看见——恒 0 的账本若哪天
//    开始涨，说明有代码又走了「失踪」那条已被推翻的老路。
dirLine('方向（下→上 · 凡人失踪）lost【按设计恒 0，见注释】', world.riftLog.lost);
// 物（法宝）两向的**候选池**读数（只诊断，不判红）：`leaked` 是两向合起来的账，
// 恒 0 时靠这两行区分「上界没法宝可漏」与「凡间地面没法宝可漏」。
dirLine('方向（上→下 · 上界法宝）候选命中缝·拍', riftDirACandHits);
dirLine('方向（上→下 · 上界灵植）候选命中缝·拍', riftHerbCandHits);
dirLine('第 5 行（凡间法宝→上界）触发前提缝·拍', riftRow5Ready);
// ── 漏物构成 + 枯竭读数（**只诊断，不判红**）──────────────────
// `riftLog.leaked` 是**三个来源合起来**的账：法宝上→下、凡间法宝→上、灵植上→下。
// 前两个各有自己的账（`artifactLog.riftIn` / `riftOut`），所以灵植件数**现算**得出来：
//   `灵植 = leaked − riftIn − riftOut`
// 这正是「不扩 `riftLog` 契约」的兑现方式（理由见 `rifts.js` 的 `leakFromUpper`）。
// 同时打印上界剩余灵植格数——「长期会不会枯竭」的实测读数
// （`leakUpperHerb` 每采走一株就把那格 `upper.veg` 清零，且上界不跑 `stepVegetation`，
//   所以这层是**有限资源**；读数由常驻探针 `scripts/_herbprobe.mjs` 复核）。
const afRift = world.artifactLog || {};
const riftInArtsN = afRift.riftIn || 0;
const riftOutArtsN = afRift.riftOut || 0;
const herbLeakedN = world.riftLog.leaked - riftInArtsN - riftOutArtsN;
let upperHerbCellsN = 0;
if (upper.veg) {
  for (let i = 0; i < upper.veg.length; i += 1) if (upper.veg[i] >= HERB_VEG_MIN) upperHerbCellsN += 1;
}
console.log(`  · 漏物构成：leaked ${world.riftLog.leaked}`
  + ` = 法宝上→下 ${riftInArtsN} + 凡间法宝→上 ${riftOutArtsN} + 灵植上→下 ${herbLeakedN}`);
console.log(`  · 上界灵植格（veg ≥ ${HERB_VEG_MIN}）收尾剩余 ${upperHerbCellsN}`
  + ` · 累计采走 ${herbLeakedN} 格（每漏一株清零一格）`);

// ══════════════════════════════════════════════════════════════
// 三界跨界生态（D6-3 A–D）—— 长跑侧的守恒与存在性
// ══════════════════════════════════════════════════════════════
//
// 这一节补的是**一个洞**：在本节之前，长跑**从来没有建过幽冥**
// （`world.nether` 不存在 ⇒ `openRifts(..., 'nether')` 整条被第 0 步拒掉），
// 所以 D6-3 的四条跨界通道（凡人跌入 / 鬼爬出 / 物品漏出 / 鬼修夺舍）
// 一次都没在长跑里跑过。E 包把它补上。
//
// ⚠️ 判据口径的**依据**（临时探针实测，不是猜的）：
//   · 单缝落在「凡间可站 ∩ 河带」的重叠格上（半径 3.63 格内 26 河带格 + 42 凡人），
//     跑 120 年：A(fellIn)=3 · B(climbedOut)=6 · C(itemsLeakedOut)=3 · **D=0**；
//   · 10 条这种缝跑 300 年：A=30 · B=133 · C=18 · **D 恒 0**（附身仅 1 次）。
//   ⇒ **A / B / C 判存在性（≥1）**；**D 不判存在性**——它在真实长跑里几乎不触发
//     （`pickGhostAtRift` 要「缝口半径内有鬼修」**且**「半径内有凡人」，两者同时
//      成立的时刻极少）。D 的**存在性**由 three-realms 的隔离世界（F11/F12）钉，
//     长跑只钉它的**账本耦合**（`possessedOut === possessionLog.crossPlane`）。
//     ⚠️ 硬写 `D ≥ 1` 会是一条**永远红**的断言——本项目已立：会无理由撞红的断言
//        和永远绿的断言一样有害（它训练人去忽略它）。
const nEco = netherEcoStats(nether);
const nItems = netherItemStats(nether);
const nLog = nether.popLog || {};
const wStats = wraithStats(world);
const netherRiftsActive = world.rifts.filter((r) => r.targetPlane === 'nether' && r.closedDay < 0).length;

// ① 幽冥生态守恒（五路径）：`鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺`
//    什么故障让它变红：A（跌入）/ B（爬出）/ D（夺舍）任一路径**改了名册却漏记账**
//    —— 名册少了一个而账本没动 ⇒ 两边不平。这是 E 包最值钱的一条（跨包契约）。
add('★ 幽冥生态守恒：鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺（跨位面四通道全部有账）',
  nEco.conserved,
  `生 ${nEco.born} − 亡 ${nEco.died} − 逐 ${nEco.evicted} − 出 ${nEco.climbedOut} − 夺 ${nEco.possessedOut}`
  + ` = ${nEco.born - nEco.died - nEco.evicted - nEco.climbedOut - nEco.possessedOut} · 名册 ${nEco.alive}`);

// ② 幽冥物品守恒：`在世 === 自生 + 跌入 − 漏出 − 朽`
//    什么故障让它变红：C（漏出）搬走了物品却漏记 `itemsLeakedOut` ⇒ 名册少于账。
add('★ 幽冥物品守恒：在世 === 自生 + 跌入 − 漏出 − 朽（C 通道有账）',
  nItems.conserved,
  `自生 ${nItems.spawned} + 跌入 ${nItems.fellIn} − 漏出 ${nItems.leakedOut} − 朽 ${nItems.decayed}`
  + ` = ${nItems.spawned + nItems.fellIn - nItems.leakedOut - nItems.decayed} · 名册 ${nItems.alive}`);

// ③ 鬼影两端一致：`此刻在凡间 + 已消散 === 幽冥记的爬出数`（B 通道跨世界对账）
//    什么故障让它变红：爬出时 `climbedOut` 漏记 / 记重，或消散没记进 `wraithLog.dissolved`。
add('★ 鬼影账本两端一致：此刻在凡间 + 已消散 === 幽冥记的爬出数（B 通道跨世界对账）',
  wStats.total === nEco.climbedOut,
  `凡间鬼影 ${wStats.total}（在世 ${wStats.alive} + 消散 ${wStats.dissolved}）`
  + ` vs 幽冥 climbedOut ${nEco.climbedOut}`);

// ④ 跨书对账：幽冥物品漏出数 === 凡间 `artifactLog.netherIn`（C 通道两侧同源）
//    什么故障让它变红：`leakNetherItem` 记了幽冥那侧却漏了凡间那侧（或反过来）
//    ⇒ 两侧不等。它是「一件物品跨界必须两端都有账」的机器可读形态。
add('★ 跨书对账：幽冥 `itemsLeakedOut` === 凡间 `artifactLog.netherIn`（同一批物品的两端记账）',
  nItems.leakedOut === netherInArts,
  `幽冥漏出 ${nItems.leakedOut} vs 凡间定入 ${netherInArts}`);
add('★ 跨书对账：幽冥 `itemsFellIn` === 凡间 `artifactLog.netherOut`（同一批物品的两端记账）',
  nItems.fellIn === netherOutArts,
  `幽冥跌入 ${nItems.fellIn} vs 凡间定出 ${netherOutArts}`);

// ⑤ 夺舍账本耦合（D 通道）：`possessedOut === possessionLog.crossPlane`
//    ⚠️ 本世界线里两者都是 0（D 在长跑里几乎不触发，见上面口径依据）。
//    这条**不是**存在性判据——它钉的是「真夺舍时两个账必须同增」：
//    什么故障让它变红：`possessMortal` 记了 `crossPlane` 却漏了 `possessedOut`
//    （或反过来）⇒ 两侧不等。（非空性由 three-realms 的 F11 / F12 保证。）
add('★ 跨书对账：幽冥 `possessedOut` === 凡间 `possessionLog.crossPlane`（D 通道两侧同源）',
  nEco.possessedOut === (world.possessionLog.crossPlane || 0),
  `幽冥夺出 ${nEco.possessedOut} vs 凡间夺舍 ${world.possessionLog.crossPlane || 0}`
  + ` · 附身 ${world.possessionLog.haunted || 0}（只诊断：D 在长跑里几乎不触发）`);

// ⑥⑦⑧ 存在性（累计账本 ≥ 1）——A / B / C 三条通道在长跑里确实活着。
//    什么故障让它变红：`stepNetherRift` 的四支被改成 `else if`（后三支被前面吃掉）/
//    概率常量被写成 0 / 幽冥缝根本没开出来（`NETHER_RIFT_SITES` 落空 / worldgen 改了）。
//    ⚠️ `fellIn ≤ ghostBorn` 并进 ⑥：跌进来的人**也是**鬼，必须计在自生数里
//    （漏了就与 ① 的守恒式重复暴露，这里顺手钉一次「子计数」关系）。
add('★ 跨界通道 A（凡人跌入幽冥）在长跑里确实触发过，且跌入数是自生数的**子计数**',
  (nLog.fellIn || 0) >= 1 && (nLog.fellIn || 0) <= nEco.born,
  `累计跌入 ${nLog.fellIn || 0} 人 ≤ 自生 ${nEco.born}`);
add('★ 跨界通道 B（鬼爬进凡间）在长跑里确实触发过',
  nEco.climbedOut >= 1, `累计爬出 ${nEco.climbedOut} 只`);
add('★ 跨界通道 C（幽冥物品漏进凡间）在长跑里确实触发过',
  nItems.leakedOut >= 1, `累计漏出 ${nItems.leakedOut} 件`);
add('幽冥缝开出来了（`targetPlane === \'nether\'` 的缝累计开过 ≥ 1）',
  netherOpenedByPlayer >= 1,
  `玩家模拟共开 ${netherOpenedByPlayer} 道幽冥缝 · 此刻活跃 ${netherRiftsActive} 条`);

// ── 读数（只打印，不判红）────────────────────────────────────
console.log(`  · 三界跨界（D6-3）：幽冥缝累计开 ${netherOpenedByPlayer} 道（此刻活跃 ${netherRiftsActive} 条）`
  + ` · 跌入 ${nLog.fellIn || 0} · 爬出 ${nEco.climbedOut} · 漏物 ${nItems.leakedOut}`
  + ` · 夺舍 ${nEco.possessedOut}（附身 ${world.possessionLog.haunted || 0}）`);
console.log(`  · 幽冥名册：鬼魂 + 鬼修 ${nEco.alive}`
  + `（自生 ${nEco.born} · 亡 ${nEco.died} · 逐 ${nEco.evicted}）`
  + ` · 幽冥物品 ${nItems.alive} 件（自生 ${nItems.spawned} · 朽 ${nItems.decayed}）`
  + ` · 凡间鬼影 ${wStats.alive} 只（已消散 ${wStats.dissolved}）`);

const failed = checks.filter((c) => !c.ok);

// ── 报告 ────────────────────────────────────────────────────
if (!QUIET) {
  console.log(`\n模拟 ${YEARS} 年 · 耗时 ${elapsed}ms · 最终 ${world.entities.length} 生灵`);
  console.log(`  聚落 ${st.villages} · 宗门 ${st.factions} · 灵脉 ${st.leylines}（有主 ${claimed}）· 地点 ${st.sites} · 飞升 ${st.ascended}`);
  console.log(`  修士 ${cs.cultivators} · 凡人 ${cs.mortals} · 最高 ${cs.peakName || '—'} ${realmLabel(cs.highest)}`);
  console.log(`  境界分布：${REALMS.map((r, i) => `${r.name}:${cs.byRealm[i]}`).join(' ')}`);
  console.log(
    `  转世：池中待转 ${rein.waiting} · 转世者 ${rein.reborn}`
    + `（占修士 ${cs.cultivators ? (rein.reborn / cs.cultivators * 100).toFixed(1) : '0.0'}%）`
    + ` · 已觉醒 ${rein.remembered} · 两世冲突 ${rein.conflicted}`
    // 「累计造出过多少神魂」是这一块最有价值的一个读数：
    // 池中是 0 时，它能一眼分开「从来没造出来」和「造出来又被转走了」。
    // 少了它就只能靠临时探针，而临时探针不会留在仓库里。
    + ` · 累计造出 ${world.nextSoulId - 1}`,
  );
  console.log(
    `  法宝：在世 ${af.live}（在手 ${af.onPeople} · 地上 ${af.ground}）`
    + ` · 器灵 ${af.spirits} · 带裂痕 ${af.scarred} · 换过三手以上 ${af.travelled}`
    + ` · 累计炼出 ${afLog.forged || 0} / 碎 ${afLog.broken || 0} / 朽 ${afLog.decayed || 0}`
    + ` / 飞升留下 ${afLog.left || 0}`,
  );
  if (af.best) {
    console.log(`  最重的一件：${describeArtifact(af.best.a)} 在【${af.best.owner.name}】手中`
      + (ownerLine(af.best.a).text ? ` · ${ownerLine(af.best.a).text}` : ''));
  }
  console.log(
    `  世家：在世 ${cs2.clans} 家（成员 ${cs2.members}）· 累计立 ${cs2.founded} 断 ${cs2.ended}`
    + ` · 最大第 ${cs2.maxGen} 代`
    // 「最大第几代」是这一块最有价值的读数，理由和上面「累计造出多少神魂」一样：
    // 它把「世家只是个标签」和「世家真的在传」一眼分开。
    // 只有 1 代就说明归谱没接上——族谱上永远只有始祖一个人。
    + (cs2.top ? ` · 最盛：【${describeClan(cs2.top)}】` : ''),
  );
  // 传记 / 大战 / 夺舍三块读数。每一行都**同时**带累计量与当下量，理由见上面判据段：
  // 只印「现在有几个」的话，读报告的人会把「现在没有」误读成「从来没发生过」，
  // 而那正是这一支测试存在的全部理由。
  console.log(
    `  传记：有日志 ${bio.logged}/${bio.entities} 人（${(bio.coverage * 100).toFixed(1)}%）`
    + ` · 共 ${bio.events} 条 · 人均 ${bio.avgEvents}`
    // 「kind 种类数」是这一块最值钱的读数，和「最大第几代」同一个道理：
    // 恒为 1 就说明除了一种事件之外，别的写入路径全是死的，而条数照样涨。
    + ` · kind ${bio.kinds} 种（最多的是 ${bio.topKind || '—'}:${bio.topKindCount}）`
    + (bio.topActor
      ? ` · 最丰富：【${bio.topActor.name}】${bio.topCount} 条（${realmLabel(bio.topActor.level || 0)}）`
      : ' · 无'),
  );
  console.log(
    `  大战：累计宣战 ${ws.declared} · 收场 ${ws.resolved} · 灭门 ${ws.destroyed} · 战殁 ${ws.casualties}`
    + ` · 进行中 ${ws.ongoing} · 一阵打到最多 ${ws.maxClash} 阵`
    // 「累计宣战」与被截断的战报条数必须并排印：world.wars 只有 400 条上限，
    // 只印它的话，一个打了五百场大战的世界看起来和只打了两百场的世界一样。
    + ` · 战报窗口内 ${ws.total} 条（上限 ${GREAT_BATTLE_LOG_CAP}，已结束的旧战事会被丢掉）`,
  );
  console.log(
    `  夺舍：累计成功 ${ps.succeeded} · 累计失败 ${ps.failed} · 累计起疑事件 ${ps.suspectEvents}`
    + ` · 此刻在世还带着印记 ${ps.total} 人`
    // ⚠️ 这两类数字**必须并排**：前三项是**累计账本**（只增不减），
    // 最后一项是**当下快照**（当事人一死就归零）。只印一个的话，
    // 「现在没有」会被读成「从来没发生过」——而后者才是故障。
    + '（前三项是累计账本、只增不减；最后一项是当下快照、会归零——'
    + '两个并排才分得清「从来没夺舍过」和「夺舍过、那些人不在了」）',
  );
  console.log(
    `  裂缝：活跃 ${rsRift.active}（上界 ${world.rifts.filter((r) => r.targetPlane !== 'nether' && r.closedDay < 0).length}`
    + ` / 幽冥 ${netherRiftsActive}）· 累计开 ${rsRift.opened} 闭 ${rsRift.closed}`
    + ` · 累计漏 ${rsRift.leaked} · 越界(修士上界) ${rsRift.crossed} · 失踪(凡人) ${rsRift.lost}`
    // ⚠️ 活跃数**分位面拆开印**（D6-3 E）：`riftStats.active` 是两界合起来的，
    // 只印一个数就分不清「上界缝全闭合了」还是「幽冥缝没开出来」。
    // 六个读数一个都不能省：`active` 是快照（缝闭合就被剔除，会归零），
    // 后五个是累计账本。只印快照会分不清「从来没裂过缝」和「裂过很多、全闭合了」。
    + ` · ${riftDiag}`,
  );

  console.log('\n宗门榜：');
  for (const s of world.factions.slice().sort((a, b) => b.pop - a.pop).slice(0, 8)) {
    const foes = world.factions.filter((o) => o !== s && relationOf(world, s, o) === 'war').map((o) => o.name);
    console.log(
      `  ${s.name}（${s.element}·${s.doctrine.name}）`
      // 立派年份一定要印：只看「现在有几家」分不清「世界一直在出新门派」
      // 和「早年开了一批、之后再也不开了」。后者是僵化，前者才叫活的。
      + `立于第${Math.floor((s.foundedDay || 0) / TIME.daysPerYear) + 1}年`
      + ` 人${s.pop} 村${s.villages.length} 灵脉${s.leylines.length}`
      + ` 声望${s.reputation.toFixed(0)} 稳定${s.stability.toFixed(0)}`
      + (foes.length ? ` 交战中:${foes.join(',')}` : ''),
    );
  }

  const siteKinds = {};
  for (const s of world.sites) siteKinds[s.kind] = (siteKinds[s.kind] || 0) + 1;
  console.log(`\n地图地点：${JSON.stringify(siteKinds)}`);
  console.log(`飞升者：${world.ascended.slice(-6).map((a) => `${a.name}(${a.daoTitle || '无号'})→${a.plane}`).join(' ') || '（无）'}`);

  const kinds = {};
  for (const c of world.chronicle) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
  console.log(`\n编年史 ${world.chronicle.length} 条：${JSON.stringify(kinds)}`);

  let relCount = 0; const relTypes = {};
  for (const e of world.entities) {
    if (!e.relations) continue;
    for (const r of e.relations.values()) { relCount += 1; relTypes[r.type] = (relTypes[r.type] || 0) + 1; }
  }
  console.log(`关系条目 ${relCount}：${JSON.stringify(relTypes)}`);

  console.log('\n最后 18 条编年史：');
  for (const c of world.chronicle.slice(-18)) {
    console.log(`  [${Math.floor(c.day / 360) + 1}年·${c.kind}] ${c.text}`);
  }
}

console.log(`\n${'='.repeat(56)}`);
for (const c of checks) {
  console.log(`  ${c.ok ? '✓' : '✗'} ${c.label}${c.detail ? ` — ${c.detail}` : ''}`);
}
console.log('='.repeat(56));
if (failed.length) {
  console.log(`体检未通过：${failed.length} 项（${failed.map((c) => c.label).join('、')}）`);
  process.exit(1);
}
console.log('世界是活的 ✓');
