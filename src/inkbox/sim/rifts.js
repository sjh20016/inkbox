// 水墨沙盒 · 空间裂缝（阶段三：三界并存 · 块四）
//
// 规格：`reports/design/upperworld.md` §4（第 1172-1313 行）。
//
// 用户原话：「上界视界和下界的边缘会因此产生轻微的空间裂缝」。
// 所以裂缝**不是**自然发生的随机事件，而是**玩家开视界这个动作的副作用**——
// 划选视界时，在划选区域的**边缘**（两界的接缝）上裂开：
// 矩形时代是「四条边」，现在是自由形状的闭合折线（逐格光栅化）。
// 内部是「看到的上界」，边缘才是「两界的缝」，所以不开在内部。
//
// 本模块只做四件事，且只做这四件：
//   1. `openRifts`  划选 → 在边缘开缝（生成）
//   2. `riftRadiusAt`  扩张/闭合曲线（**纯函数**，不存 `radius` / `peakDay`）
//   3. `stepRifts`  一次判定 pass：闭合 + 漏物（由调用方按周期调，**不每帧跑**）
//   4. `riftStats`  读数（账本是唯一可靠来源）
//
// ⚠️ **随机流纪律（铁律一）**：本模块**绝不**碰 `Life.rng`。那是全世界共用的
// 一条主随机流——每一次觅食、求偶、突破、渡劫都在上面抽签。裂缝判定一次要抽
// 2-3 下，混进去会把整个世界线往后挪，于是「加了裂缝」与「没加裂缝」的长测读数
// 就没法对比，等于把既有标定全部作废。所以裂缝走**自己的独立流**
// `mulberry32((world.seed ^ 0x72696674) >>> 0)`（'rift'），照 `warRng`
// （`life.js:110-124`）同款做法：不进存档，按 seed 重建。
//
// ⚠️ **时间轴纪律**：本模块**不推进** `world.day`。`stepRifts` 只读 `world.day`，
// 「多久判一次」由调用方按 `RIFT_PERIOD_DAYS` 的节奏决定（同 `territory.js:34`
// 的 `TERRITORY_PERIOD_DAYS`）。理由是 `territory.js:36-51` 写过的那个坑：
// 内部记「上次判定日」需要进存档，否则读档后立刻多判一次，两条分叉对不上。
//
// ⚠️ **本模块不进存档的字段**：`riftRng`（见上）。进存档的是
// `world.rifts` / `world.nextRiftId` / `world.riftLog` 三样，由 `io/save.js`
// 负责序列化（不在本文件）。
//
// ───────────────────────────────────────────────────────────────────────
// 目标位面纪律（2026-09-24 · D6-2 工程包 B）
// ───────────────────────────────────────────────────────────────────────
//
// 裂缝**必须知道自己连接哪一界**。用户原话是「上界视界和**下界**的边缘会因此
// 产生轻微的空间裂缝」——「下界」就是幽冥，所以开幽冥视界同样会裂缝。
// 但裂缝开出来之后，**两条缝的行为完全不同**：
//
//   · `targetPlane === 'upper'`  —— 维持既有全部行为（上→下漏物、下→上吸人）；
//   · `targetPlane === 'nether'` —— **本阶段只允许创建 / 成长 / 闭合 / 显示 / 保存**，
//     不执行任何跨位面效果（用户裁决：幽冥跨界留给 D6-3）。
//
// ⚠️⚠️ **硬不变量：打开幽冥视界绝不会偷偷执行上界转移。**
//     `stepRifts` 对 nether 裂缝**在抽签之前就 `continue`**，所以
//     `arriveUpper` / `leakFromUpper` / `leakToUpper` 在结构上够不到它。
//     这不是「靠判据拦住」——是**根本走不到那一行**。
//     在它出现之前，`viewNether` 与 `viewUpper` 共用同一条 `openRifts`，
//     而 `rifts.js` 内部**只有上界逻辑**：玩家打开幽冥视界、划出裂缝，
//     那条缝会去执行凡间 ↔ **上界**的漏物 / 吸人——语义完全错位，且不报错。
//
// ⚠️ **`targetPlane` 是**世界状态，必须进存档**（`io/save.js` 写读两侧）：
//     一条缝能活 30–40 年，玩家关掉视界以后它仍然必须知道自己原本连接哪里。
//     老档没有这个键 → 兜底 `'upper'`（诚实缺省：本契约之前只有上界裂缝）。

import { mulberry32 } from '../core/noise.js';
import { SPECIES } from '../core/config.js';
// ⚠️ `RIFT_CROSS_MAX_LEVEL`（= 40，化神期起点）由**飞升代理**在
// `core/cultivation.js` 里创建，本模块只 import、**不自己定义**。
// 语义（用户第 3 条）：裂隙处无限制、谁都有概率跨界，但「高修为修士必须走飞升」——
// 所以能走裂缝的只有 `level < RIFT_CROSS_MAX_LEVEL` 的人（含凡人 level 0）。
// 这个 import 不存在时本模块会报 `SyntaxError`——那是**预期的**，
// 两个代理并行落地；飞升代理完成后即通（见交付报告）。
import { RIFT_CROSS_MAX_LEVEL } from '../core/cultivation.js';
import { arriveUpper, upperWalkable, netherWalkable } from '../world/planes.js';
import { toGround, scatterArtifacts } from './artifacts.js';
// 方向 A 的第二个物源（灵植 → 凡间 `site`）要落一个**凡间自己的** site。
// ⚠️ 照 `divine.js:79` 的用法调 `plantSite`，**不自己手搓 site 对象**：
// site 的形状（`kind` / `sub` / `omen` / `reward` / `note` / `age` / `visits`）
// 与 `SECRET_REALMS` 词池的对应关系全在 `sites.js` 里，抄一份必然漏字段。
// 依赖环已查：`rifts.js → sites.js → lore.js / artifacts.js / noise.js`，
// 三者都不（直接或间接）反向依赖本文件，**不成环**。
import { plantSite } from './sites.js';
// `placeOf` 只用来给开缝那条大事记配一个地名（「某某地界的天地裂开一道缝隙」）。
// ⚠️ sects.js 不反向引 rifts.js，所以这条边不成环（import-check 会验）。
import { placeOf } from './sects.js';
// ── 幽冥裂缝的跨界效果（D6-3 工程包 A）────────────────────────
// `spawnNetherGhost`：把跌进幽冥的人**落成幽冥实体**。必须复用它，
//   绝不自己 `structuredClone` + push——它负责 id 段（`NETHER_ID_BASE`）、
//   落点求解（`landingFor` 的纯哈希）、`ghostBorn` 记账三件事。
// `ensureNetherPopLog`：幽冥人口账本的**唯一形状定义**（加键只改那一处）。
// `ghostSnapshot`：身份快照的**唯一形状真源**（在 `reincarnation.js`）。
//   ⚠️ 依赖环已查：`reincarnation.js → {relations, cultivation, necrology,
//   netherLife, config, noise}`，`netherLife.js → {config, planes}`，
//   没有任何一条反向引 `rifts.js` ⇒ 不成环（import-check 会验）。
//   `ghostSnapshot` 是**纯读、零 rng**（`enterNether` 在凡间主流上，
//   任何抽签都会静默移动世界线，铁律一）——裂缝这边借用它同样安全。
import { spawnNetherGhost, ensureNetherPopLog, trimNetherItems } from './netherLife.js';
import { ghostSnapshot } from './reincarnation.js';
// 表现事件发射口（D7-D）：开缝那一下闪一下。只发事件，不改模拟、不抽 rng。
// D8-E 起另加 `emitRiftCross`：六类跨界**成功之后**各发一次「两边都在发生」的
// `rift-cross`（离开端 + 到达端）。形状只在 `presentation.js` 定义一次。
import { emitPresentation, emitRiftCross } from './presentation.js';
// D6-3 工程包 D：跨位面夺舍（鬼修 → 凡间活人）的效果函数。它**零 rng**，
// 只做「选谁 / 成不成（确定性哈希） / 落成 / 记账」；判定节奏的抽签在本模块
// （`stepNetherRift` 的第四支，走 `netherPossessRngFor`）。
import { crossPlanePossession } from './possession.js';
// D6-3 工程包 B：凡间的幽冥来客。**只取落成函数**——「鬼在凡间怎么活着」
// 那件事（游荡 / 消散 / 自己的流）全在 `wraiths.js` 里，本模块不参与。
// 依赖方向 `rifts.js → wraiths.js → core/*`，`wraiths.js` 不回头引本模块，
// 所以不成环（`scripts/inkbox-import-check.mjs` 会验）。
import { spawnWraith, mortalHauntRngFor } from './wraiths.js';

/** 漏物判定周期（游戏日）。与 `TERRITORY_PERIOD_DAYS` 同频（30 日）。 */
export const RIFT_PERIOD_DAYS = 30;

/**
 * 单条裂缝的基准半径（格）——**峰值尺度**（标定值）。
 *
 * ⚠️ **设计稿在这里自相矛盾**（`reports/design/upperworld.md` §4）：
 *   · §4.1 写「单条裂缝的初始强度（半径） = `RIFT_BASE_RADIUS` × (1 + 面积占比)」，
 *     把 `RIFT_BASE_RADIUS` 当作**峰值尺度**；
 *   · §4.4 写「radius(t) = `RIFT_MAX_RADIUS` × grow × decay」，
 *     把 `RIFT_MAX_RADIUS` 当作**峰值尺度**。
 * 两处用了**两个不同的峰值尺度**，且都没说另一个是什么。
 *
 * **本模块的选择：以 §4.4 为骨架、以 §4.1 定尺度。** 具体地：
 * `radius(t)` 的峰值尺度就是 `rift.strength`（见 `riftRadiusAt`），而 `strength`
 * 由 `openRifts` 按 §4.1 从 `RIFT_BASE_RADIUS × (1 + 面积占比)` 算出，
 * 并以 `RIFT_MAX_RADIUS` 为**上限**。于是 `RIFT_BASE_RADIUS` 是「小划选的峰值尺度」，
 * `RIFT_MAX_RADIUS` 是「峰值尺度能涨到的天花板」——两者不是重复定义。
 * **为什么选这一边**：§4.1 的公式带**面积占比**这个自变量，能兑现「划得越大、
 * 缝越大」的规格意图；§4.4 的 `RIFT_MAX_RADIUS × grow × decay` 没有自变量，
 * 若照它实现则「划多大都一个尺寸」，与 §4.1 直接冲突。
 *
 * ── 标定（上一轮）：2.0 → 5.0 ────────────────────────────
 * **改前的实测值：峰值半径 ≈ 1.62 格**（288×180 中堂 · 40×30 划选）。
 * 推导：`areaFrac = 1200 / 51840 = 0.02315` → `strength = 2.0 × 1.02315 = 2.046`；
 * 曲线峰值系数（在 `t* = TAU_GROW·ln(1 + TAU_CLOSE/TAU_GROW)` 处）
 * = `(1 - e^{-2.398})·e^{-1.398/10} = 0.7905`；故峰值 = 2.046 × 0.7905 ≈ **1.62 格**。
 *
 * **为什么 1.62 格不可接受**：半径 1.62 的圆只覆盖 π·1.62² ≈ **8 格**，
 * 占 51840 格的 **0.015%**。对照：玩家笔刷半径上限是 **8 格**、一座聚落是
 * 十几个格——一条比一次笔刷落点还小、默认缩放下根本看不见的裂缝，
 * 不是「轻微」，是「不存在」。规格 §4.1 自己把本常量标成
 * 「【待标定】常量（先占位 2.0 格）」，所以标定它是规格要求的动作，
 * **不是为了让某条判据变绿而拧旋钮**。
 *
 * **目标**：峰值半径落在 **3.5 – 4.5 格**（同中堂 + 40×30 划选）——
 * 一个「轻微但存在」的缝至少要**看得见**（≥ 玩家笔刷量级）且
 * **够得着**（半径内的格数不至于恒为 0）。
 *
 * ── 标定（本轮）：5.0 → 5.75（配合 `TAU_CLOSE` 10800 → 4000）──────
 * 本轮新增**寿命目标**（用户第 1 条）：一条缝从开到闭落在 **30–40 年**
 * （10800–14400 日）。上一轮只钉了峰值，`TAU_CLOSE = 10800` 时实测闭合
 * 在 **31740 日 ≈ 88.2 年**（数值解：`strength·f(t) < 0.3` 的首次跨越日，
 * 探针里按 30 日一拍取整）——远超目标。
 *
 * 闭合由**峰值系数**（在 `t* = TAU_GROW·ln(1 + TAU_CLOSE/TAU_GROW)` 处）与
 * `TAU_CLOSE` 共同决定，而峰值系数**随 `TAU_CLOSE` 变小而变小**：
 *   · `TAU_CLOSE = 10800` → 系数 0.7905 → 闭合约 88 年；
 *   · `TAU_CLOSE = 4000`  → 系数 0.6790 → 闭合 12990 日 ≈ **36.08 年** ✓；
 * 但系数掉下来会**同时压低峰值**：`strength = 5.0 × 1.02315 = 5.1157`，
 * 峰值 = 5.1157 × 0.6790 ≈ **3.474 格 < 3.5 下界**（探针 ⑤f 会红）。
 * 所以本轮**同时**抬高基准尺度：`RIFT_BASE_RADIUS = 5.75` →
 * `strength = 5.75 × 1.02315 = 5.8831` → 峰值 = 5.8831 × 0.6790 ≈ **3.995 格** ✓。
 *
 * **实测**（`node -e` 数值解 + `scripts/_riftprobe.mjs` 断言，见报告）：
 *   · 峰值半径 **3.995 格** @ `t* = 1672 日`（≈1.55×TAU_GROW，**不是** TAU_GROW，
 *     设计稿 §4.4 那句「TAU_GROW 处是峰值」是错的，探针只断言「有内部极大」）；
 *   · 闭合年龄 **12990 日 = 36.08 年**（30 日一拍，`age >= TAU_GROW` 且 `r < 0.3`）。
 * 两个数都落在目标区间中部（离上下界各留有余量），不是贴着边卡进去的。
 * `scripts/_riftprobe.mjs`、`scripts/inkbox-smoke.mjs`、`scripts/inkbox-longrun.mjs`
 * 各有一条断言钉峰值区间——标定被后来人改坏时会红。
 */
export const RIFT_BASE_RADIUS = 5.75;

/**
 * 峰值半径上限（`strength` 的上限）。
 *
 * 见 `RIFT_BASE_RADIUS` 的注释：这是「峰值尺度能涨到的天花板」。
 *
 * ── 标定（本轮）：6.0 → 7.0 ──────────────────────────────
 * **为什么跟着抬**：本轮把 `RIFT_BASE_RADIUS` 从 5.0 抬到 5.75（见上）。
 * 若上限仍是 6.0，则 `5.75 × (1 + areaFrac) > 6.0` 只需 `areaFrac > 0.0435`
 * （中堂约 **2,255 格**，比 40×30 的划选才大一点）就触顶——「划得越大、
 * 缝越大」这条规格意图（§4.1 的 `(1 + 面积占比)` 项）会被**大幅削弱**，
 * 大划选之间再也拉不开差距。抬到 **7.0** 后触顶条件是
 * `areaFrac > 7.0/5.75 - 1 = 0.2174`（中堂约 11,270 格，全图 21.7%），
 * 与上一轮 6.0 配 5.0 时的 0.2 基本同档——触顶的**门槛**没被这次标定挪动。
 *
 * 峰值尺度只由 `RIFT_BASE_RADIUS` 决定（本轮 3.995 格），
 * `RIFT_MAX_RADIUS` 是「划得很大时能涨到哪」的封顶，不参与中堂标定。
 */
export const RIFT_MAX_RADIUS = 7.0;

/** 扩张时间常数：360×3 = 1080 日（3 年）。 */
export const TAU_GROW = 1080;

/**
 * 衰减时间常数：**4000 日（≈11.1 年）**。本轮 10800 → 4000。
 *
 * ── 为什么改（寿命标定，用户第 1 条）──────────────────────
 * 用户要求一条缝「开到闭」落在 **30–40 年**。闭合日由 `strength · f(t) < 0.3`
 * 的首次跨越决定（`RIFT_CLOSE_RADIUS`），而 `f` 的**峰值系数**
 * `f(t*) = (1 - e^{-t* / A}) · e^{-(t* - A) / B}`（`A = TAU_GROW`、`B = TAU_CLOSE`）
 * 随 `B` 变小而变小，`B` 又直接是衰减尾巴的长度——两者共同决定闭合日。
 *
 * 实测（数值解 + 探针，见 `RIFT_BASE_RADIUS` 注释的同款推导）：
 *   · `B = 10800`（旧值）：峰值系数 0.7905，闭合 **31740 日 ≈ 88.2 年**——远超目标；
 *   · `B = 4000`（本轮）：峰值系数 0.6790，闭合 **12990 日 ≈ 36.08 年** ✓（30–40 年区间内）。
 * 取 4000 而非「凑到恰好 35.0 年」的 3855：4000 是整千的工程常数，
 * 且 36.08 年离区间两端各有 6.08 / 3.92 年余量，不会因为将来微调
 * `TAU_GROW` 就掉出区间。闭合日对 `B` 的敏感度约 `Δ闭合/ΔB ≈ 2.9 日/日`，
 * 所以 `B ∈ [~3600, ~4400]` 都能留在 30–40 年内——余量是够的。
 *
 * ⚠️ `B` 变小会**同时压低峰值**（系数 0.7905 → 0.6790），所以本轮的
 * `RIFT_BASE_RADIUS` 必须同步从 5.0 抬到 5.75，否则峰值掉出 [3.5,4.5]
 * （5.0 时峰值仅 3.474 格）。两个常数是**一起**定的，不要只改一个。
 */
export const TAU_CLOSE = 4000;

/** 闭合阈值：半径小于这个数就闭合。 */
export const RIFT_CLOSE_RADIUS = 0.3;

/** 每个判定周期、每条活跃裂缝的漏物概率。 */
export const LEAK_CHANCE_PER_PERIOD = 0.005;

/**
 * 每个判定周期、每条幽冥裂缝**爬出一只鬼**的概率（D6-3 工程包 B）。
 *
 * ⚠️ 与 `LEAK_CHANCE_PER_PERIOD` **无关、各抽各的流**（见 `stepNetherRift`
 *    的段头注释）。刻意取得比它大一个数量级：
 *   · 活人被吸进去是**罕见事故**（0.5% / 30 日 ⇒ 一条缝一生约 0.7 次）；
 *   · 幽冥里飘着几百只鬼，缝口天天有鬼蹭过去 ⇒ 「爬出来」该比「人被吸进去」
 *     常见得多，否则玩家开一次幽冥视界什么都看不到（B 包的全部意义就是
 *     「让玩家看见门后的东西真的会过来」）。
 *   0.05 ⇒ 期望每 600 日（≈1.7 年）一只；一条缝活 30–40 年 ⇒ 约 20–24 只。
 *
 * ⚠️ **刻意不随「幽冥里有多少鬼」浮动**：判定只抽一次签，与鬼数无关。
 *    做成「鬼越多越容易出来」要额外抽签或读状态，前者让流位置依赖世界状态
 *    （同种子不可复现），后者违反「一次判定一个签」的形态。简化成常数。
 */
export const WRAITH_CLIMB_CHANCE_PER_PERIOD = 0.05;

/**
 * 每个判定周期、每条幽冥裂缝**漏出一件幽冥物品**的概率（D6-3 工程包 C）。
 *
 * ⚠️ 与 `LEAK_CHANCE_PER_PERIOD` / `WRAITH_CLIMB_CHANCE_PER_PERIOD`
 *    **无关、各抽各的流**（见 `stepNetherRift` 的段头注释）。
 * 取 0.02 ⇒ 期望每 1500 日（≈4 年）一件；一条缝活 30–40 年 ⇒ 约 7–10 件。
 * 比「鬼爬出来」（0.05）小一档：物品是**死物**，不像鬼那样自己会往缝口蹭。
 * 与「人跌进去」（0.005）相比大四倍：幽冥物品池里常驻几十件躺着，
 * 而缝口附近的活人是偶发的。
 *
 * ⚠️ **一次判定只抽一次签**（不随「幽冥里有多少件」浮动）——同
 *    `WRAITH_CLIMB_CHANCE_PER_PERIOD` 的理由：让流位置不依赖世界状态。
 */
export const NETHER_ITEM_LEAK_CHANCE_PER_PERIOD = 0.02;

/**
 * 每个判定周期、每条幽冥裂缝发生一次**跨位面夺舍**（鬼修 → 凡间活人）的概率
 * （D6-3 工程包 D）。
 *
 * ⚠️ 与前三支**无关、各抽各的流**（见 `stepNetherRift` 的段头注释）。
 * 取 0.01 ⇒ 期望每 3000 日（≈8 年）一次；一条缝活 30–40 年 ⇒ 约 4–5 次尝试。
 * 比「物品漏出」（0.02）再小一档：夺舍要求**同时**满足
 * 「缝口附近有鬼修」+「缝口附近有凡人」+「成功率过线」，三重条件天然更稀。
 * 另外 `possession.js` 的 `CROSS_POSSESS_CAP`（在世被夺舍者上限）会再兜一层。
 *
 * ⚠️ **一次判定只抽一次签**（不随「幽冥里有多少鬼修」浮动）——同
 *    `WRAITH_CLIMB_CHANCE_PER_PERIOD` 的理由：让流位置不依赖世界状态。
 */
export const POSSESS_CHANCE_PER_PERIOD = 0.01;

/**
 * 上界**灵植 / 仙草**的候选阈值：`upper.veg[i] >= HERB_VEG_MIN` 的格才算灵植。
 *
 * ── 为什么用 `upper.veg` 当灵植源（规格 §4.3 表格第 2 行）────────────
 * 上界有一张现成的植被密度层 `upper.veg`（`World.js:29`，生成于
 * `worldgenUpper.js:436-450`），值域 0..1。而 `worldgenUpper.js:432` 的注释
 * 明确写着「上界**不跑** `stepVegetation`，所以 `veg` 在生成之后就不再变」——
 * 也就是说它是一张**静态**的灵植分布图，正好当物源，**不需要新建一套生长系统**。
 *
 * ⚠️ **它是「密度代理」，不是离散的植株清单。** 本项目没有独立的灵植层，
 * 所以这里把「密度足够高的植被格」当作「有灵植/仙草可漏」。这个近似是
 * **刻意且必须写明**的：读到 `HERB_VEG_MIN` 的人必须知道它量的是密度。
 *
 * ── 标定：0.6 ────────────────────────────────────────────
 * **实测扫描表**（`node scripts/_herbprobe.mjs --sweep --years=300`，
 * 中堂 288×180 · 种子 20260914 · 常驻探针随本文件入库，可随时复核）：
 *
 * ```
 * 阈值 | 候选非空缝·拍 | 灵植漏出件数 | 采走格数 | 剩余灵植格
 * 0.4  |        10422 |           12 |       12 |      16230
 * 0.5  |        10350 |           15 |       15 |      13381
 * 0.6  |         7462 |            5 |        5 |      10535   ← 本常量
 * 0.7  |         5157 |            5 |        5 |       7911
 * 0.8  |         3286 |            2 |        2 |       5307
 * ```
 *
 * **为什么是 0.6，而不是「漏得最多」的 0.5**：
 *   1. **语义**：0.6 与 `sites.js:153` 的 `placeLabel` 用同一档
 *      （`veg > 0.6` 记作「林间」），于是「灵植落在林间」这句叙事与候选判据
 *      **用的是同一个数**，不会互相矛盾。0.4/0.5 没有对应的语义锚点。
 *   2. **漏出件数是噪声大的那一列**：0.4 → 12 件、0.5 → 15 件，而两档的
 *      候选非空（10422 vs 10350）几乎一样——这 3 件的差是**抽签噪声**
 *      （300 年里方向 A 只被抽中几十次），不是阈值的效应。
 *      真正随阈值单调变的是**候选非空缝·拍**那一列，它才是标定信号。
 *   3. 0.6 档 7462 缝·拍非空（≈ 全部槽位的四成）说明这条通道**不是**结构性饿死；
 *      300 年漏 5 件 ≈ **1.7 件 / 100 年**，落在规格 §4.4「100 年几件」的量级里。
 *
 * ⚠️ **漏出件数明显低于「候选非空」数**（0.6 档 5 ≪ 7462）不是 bug，有两级稀释：
 *   1. **抽签稀释**：方向 A 每周期只有 `LEAK_CHANCE_PER_PERIOD × 0.5 = 0.25%`
 *      的机会被抽中，300 年 17568 个槽位里**期望只有 43.9 次**真正的尝试
 *      （探针第 1 层）；
 *   2. **落点稀释**：`plantSite` 自己还有两道比规格更严的门
 *      （灵气 `qi >= 0.35`、半径 6 格内无别的 site），实测把
 *      「灵植候选非空」的 7462 缝·拍筛到只剩 **3053** 可完成
 *      —— **落点可种率 40.9%**（探针第 3 层的 (d)/(e) 两行量这个）。
 *   两级相乘：`43.9 × 40.9% ≈ 18` 次「本可完成」，实测 5 件——
 *   剩下的是抽签噪声（300 年只有几十次尝试，泊松波动很大）。
 *   ⚠️ 落点那两道门**比规格 §4.3 严**（规格只要求「半径内找一块可站人的地」）。
 *   本模块**照用户指定**用 `plantSite`（`divine.js:79` 的用法），
 *   没有为了抬高漏出率而换 API —— 要不要放宽落点由用户拍板（见交付报告）。
 *
 * 故障：把这个阈值调到 1.0 以上 → 候选池恒空 → 灵植通道结构性饿死，
 * 而 `riftLog.leaked` 会退回「只有法宝」的老读数（探针第 3 层会显示候选非空 = 0）。
 */
export const HERB_VEG_MIN = 0.6;

/**
 * 一次「灵植漏出」判定里，最多试几个落点（`leakUpperHerb` 专用）。
 *
 * 为什么需要它：`plantSite` → `spawnSecretRealm` → `findSiteSpot`（`sites.js:160`）
 * 比「可站人」严得多（灵气 `qi >= 0.35`、半径 6 格内无别的 site、且 80 次拒绝
 * 采样要成功）。原先只拿 `findMortalSpot` 那**一格**去种，实测只有 40.9% 的
 * 「灵植候选非空」缝·拍能完成——剩下 59% 白抽一签、什么都不发生。
 *
 * ⚠️ **不能靠「重调 `findMortalSpot`」来重试**：它是确定性求解（双层循环返回
 * **第一个**可走格），同样参数永远返回同一格。所以要**先在半径内收集所有**
 * 可站人的格，再随机选起点、环形往后试，才真的换到了不同的落点。
 *
 * 值取 8：足以把「多试几格」的收益吃满（`spots` 通常只有个位数到十几格），
 * 又不至于让单次判定在 `findSiteSpot` 失败时无限烧 rng。
 */
export const HERB_LANDING_TRIES = 8;

/**
 * ⚠️ **已删除：`CROSS_MIN_LEVEL = 30`（2026-09-19 阶段四）。**
 *
 * 它原来是「修士被吸上界的**最低**境界（30 = 元婴）」，判据是 `level >= 它`。
 * 用户第 3 条把它推翻了：「跨界门槛定设定裂隙处无限制，都有概率跨界。
 * 但高修为修士必须通过飞升来跨境」——于是判据**反转**成
 * 「`level < RIFT_CROSS_MAX_LEVEL`（够低才吸）」，见 `leakToUpper`。
 *
 * **为什么是删而不是留**（与 `recordRiftLost` 的处理刻意不同，理由如下）：
 *   · `recordRiftLost` 留着的价值是「它是老编年史 kind `'rift-lost'` 这个
 *     **形状**的唯一文字说明」，删了之后老档里那些条目就没人解释得清了；
 *   · `CROSS_MIN_LEVEL` 没有任何这类价值——它只是一个**名字与新常量极像、
 *     语义却完全相反**的数值常量（`>= 30` vs `< 40`）。留着它的唯一后果是
 *     后来人 grep「跨界门槛」时同时命中两个，然后**用错那个**：
 *     用 `CROSS_MIN_LEVEL` 会得到「只吸元婴以上」，与规格**正好相反**，
 *     而且不报错——它会让 `crossed` 少掉全部凡人，看起来只像「凡人运气不好」。
 *     一个 0 读者、语义反转、名字相似的常量，是纯粹的负资产。
 * 删除前的读者清单（全仓 grep 核实，全部是注释/文档，无一处真读它）：
 *   `scripts/inkbox-longrun.mjs`（注释里点名「不要用它」）、
 *   `reports/design/upperworld.md:1254`、`INKBOX.md`、`.workbuddy-ai/memory/`。
 *
 * ⚠️ 判据方向对照表（读 `leakToUpper` 前先看这一行，免得记反）：
 *   · 旧（已废）：`level >= 30`（元婴及以上才吸）
 *   · 新（现行）：`level <  40`（化神以下才吸；凡人 `level 0` 在内）
 * 两个数一个 30 一个 40，方向相反——**不要靠记忆，去看 `leakToUpper` 的代码**。
 */

/**
 * 活跃裂缝上限。
 *
 * 为什么必须有：`openRifts` 是**玩家可反复触发**的（每次划选视界都会开缝）。
 * 没有上限时，一个玩家反复划选就能把活跃裂缝刷到无界增长，
 * 每帧的渲染与每周期的漏物判定都会跟着线性膨胀——
 * 这不是「玩法更丰富」，是「玩家能自己把游戏跑崩」。
 */
export const RIFT_MAX_ACTIVE = 64;

/**
 * 裂缝可以连接的目标位面（D6-2 工程包 B）。**只认这两个。**
 *
 * 本阶段不引入「第四界」：`openRifts` 收到任何别的值都归一到 `'upper'`
 * （契约之前只有一个隐含目标——上界，那是历史行为）。
 *
 * ⚠️ 这个数组是**校验用的唯一清单**：`io/save.js` 的读侧兜底与探针判据
 * 都照它写，不要在两处各列一份。
 */
export const RIFT_PLANES = Object.freeze(['upper', 'nether']);

/** 裂缝随机流的派生键：ASCII 'rift'（0x72 0x69 0x66 0x74）。 */
export const RIFT_SEED_KEY = 0x72696674;

/**
 * **幽冥**裂缝跨界随机流的派生键：ASCII 'NRFT'（0x4e 0x52 0x46 0x54）。
 *
 * ── 为什么是**第三条**流（D6-3 工程包 A）────────────────────────
 * D6-2 时幽冥缝被整体冻结（在抽签之前 `continue`），所以只需要一条流。
 * D6-3 让它产生跨界效果，就必须给它一条流——而**不能用** `riftRngFor`：
 * 两条缝共用一条流时，「玩家多开了一条幽冥缝」会**移动上界缝的抽签序列**
 * （同一拍里谁先抽、抽了几下都变了），于是既有标定与长测读数全部作废，
 * 且**不报错**。这正是铁律一要防的事（`Life.rng` 的翻版，只是规模小一号）。
 *
 * ⚠️ 与 `RIFT_SEED_KEY` **必须不同**：相同就等于共用一条流，
 * 上面那段理由就白写了。`scripts/inkbox-three-realms.mjs` 的 F7 钉着这一点
 * （它同时数「裂隙流被抽了几次」与「幽冥流被抽了几次」，两者互不影响）。
 *
 * ⚠️ 也不与 `UPPER_SEED_KEY`(0x55505052) / `NETHER_SEED_KEY`(0x4e455452) /
 * `UPPER_SPATIAL_SEED_KEY`(0x55505342) 相同——它们各自是别的子系统的流。
 */
export const NETHRIFT_SEED_KEY = 0x4e524654;

/**
 * 裂缝独立随机流的缓存。**模块级 `WeakMap`，不挂 `world.riftRng` 属性。**
 *
 * 为什么是 `WeakMap` 而不是 `world.riftRng`：
 * 序列化器（`io/save.js`）拾取的是 **world 自己的可枚举属性**。
 * 一条挂在 `world.riftRng` 上的函数会被序列化器看见——要么被写进存档
 * （那是一个永远无法正确反序列化的闭包），要么需要序列化器专门写一条
 * 「跳过它」的例外。两条路都是「靠人记得」。
 * 挂在模块级 `WeakMap` 上，序列化器**在结构上就看不见它**——
 * 这是「不进存档」的最强兑现方式：不是承诺，是做不到。
 *
 * 用 `WeakMap` 而不是普通 `Map`：键是 world 实例，普通 `Map` 会强引用它，
 * 于是「玩家反复新建/丢弃世界」会积压一批永不释放的旧 world（内存泄漏）。
 * `WeakMap` 的键是弱引用，world 被回收时这一项自动消失。
 */
const RIFT_RNG = new WeakMap();

/**
 * 裂缝独立随机流。**同一条 world 永远是同一条流。**
 *
 * ⚠️ 必须是**长活的同一条流**，不是每次调用重建：
 * 若每次调用都 `mulberry32(...)` 重建，每次抽签都会拿到同一串数的开头——
 * 于是「第一条裂缝的第一次判定」与「第一百条裂缝的第一次判定」拿到
 * 完全一样的签，「漏物是随机的」这件事在结构上就没了。
 *
 * ⚠️ 为什么不拿 `Life.rng`：那是全世界共用的一条主随机流（理由见文件头）。
 *
 * @param {object} world 凡间 world（只用它的 `seed`）
 * @returns {() => number} 该 world 专属、且持续演进的随机流
 */
export function riftRngFor(world) {
  let rng = RIFT_RNG.get(world);
  if (!rng) {
    rng = mulberry32(((world.seed || 0) ^ RIFT_SEED_KEY) >>> 0);
    RIFT_RNG.set(world, rng);
  }
  return rng;
}

/**
 * **幽冥**裂缝跨界随机流的缓存。理由与 `RIFT_RNG` 逐条相同
 * （模块级 `WeakMap` ⇒ 序列化器结构上看不见；弱引用 ⇒ 不泄漏旧 world）。
 */
const NETHRIFT_RNG = new WeakMap();

/**
 * 幽冥裂缝跨界随机流。**同一条 world 永远是同一条流**，且与 `riftRngFor`
 * **互不干扰**（理由见 `NETHRIFT_SEED_KEY` 的注释）。
 *
 * ⚠️ 同样是**长活的同一条流**，不是每次调用重建——否则每次判定都拿到
 * 同一串数的开头，「漏不漏、漏谁」就不再是随机的（同 `riftRngFor`）。
 *
 * @param {object} world 凡间 world（只用它的 `seed`）
 * @returns {() => number} 该 world 专属、且持续演进的幽冥裂缝流
 */
export function netherRiftRngFor(world) {
  let rng = NETHRIFT_RNG.get(world);
  if (!rng) {
    rng = mulberry32(((world.seed || 0) ^ NETHRIFT_SEED_KEY) >>> 0);
    NETHRIFT_RNG.set(world, rng);
  }
  return rng;
}

/**
 * **幽冥物品泄漏**随机流的派生键（D6-3 工程包 C）。
 *
 * 这是第 **七** 条独立流，与其余六条**两两不同**：
 *   `RIFT_SEED_KEY`(0x72696674 'rift') · `NETHRIFT_SEED_KEY`(0x4e524654 'NRFT') ·
 *   `MORTALHAUNT_SEED_KEY`(0x4841554e 'HAUN') · `UPPER_SEED_KEY`(0x55505052 'UPPR') ·
 *   `NETHER_SEED_KEY`(0x4e455452 'NETH') · `MERCY_SEED_KEY`(0x4d455243 'MERC') ·
 *   **本键 0x4e49544d（'NITM' = nether item）**。
 * `scripts/inkbox-three-realms.mjs` 的 F10 逐对钉这件事。
 *
 * ⚠️ 为什么要**再开一条**而不是复用 `netherRiftRngFor`：`stepNetherRift` 里
 *    三支效果（人跌入 / 鬼爬出 / 物品漏出）**各抽各的签**（见那里的判决）。
 *    共用一条流会让「物品漏没漏」取决于前两支抽了几次 ⇒ 三条流重新耦合，
 *    「互不干扰」当场失效（而且不报错）。
 */
export const NETHERITEM_SEED_KEY = 0x4e49544d;

/** **幽冥物品泄漏**随机流的缓存。理由与 `RIFT_RNG` / `NETHRIFT_RNG` 逐条相同。 */
const NETHERITEM_RNG = new WeakMap();

/**
 * 幽冥物品泄漏随机流。**同一条 world 永远是同一条流**，且与其余六条
 * **互不干扰**（理由见 `NETHERITEM_SEED_KEY` 的注释）。
 *
 * @param {object} world 凡间 world（只用它的 `seed`）
 * @returns {() => number} 该 world 专属、且持续演进的幽冥物品流
 */
export function netherItemRngFor(world) {
  let rng = NETHERITEM_RNG.get(world);
  if (!rng) {
    rng = mulberry32(((world.seed || 0) ^ NETHERITEM_SEED_KEY) >>> 0);
    NETHERITEM_RNG.set(world, rng);
  }
  return rng;
}

/**
 * **跨位面夺舍**随机流的派生键（D6-3 工程包 D）。
 *
 * 这是第 **八** 条独立流，与其余七条**两两不同**：
 *   `RIFT_SEED_KEY`(0x72696674 'rift') · `NETHRIFT_SEED_KEY`(0x4e524654 'NRFT') ·
 *   `MORTALHAUNT_SEED_KEY`(0x4841554e 'HAUN') · `NETHERITEM_SEED_KEY`(0x4e49544d 'NITM') ·
 *   `UPPER_SEED_KEY`(0x55505052 'UPPR') · `NETHER_SEED_KEY`(0x4e455452 'NETH') ·
 *   `MERCY_SEED_KEY`(0x4d455243 'MERC') · **本键 0x4e505358（'NPSX' = nether possess）**。
 * `scripts/inkbox-three-realms.mjs` 的 F11 逐对钉这件事。
 *
 * ⚠️ 为什么要**再开一条**而不是复用 `netherItemRngFor`：`stepNetherRift` 里
 *    四支效果（人跌入 / 鬼爬出 / 物品漏出 / 鬼修夺舍）**各抽各的签**（见那里的判决）。
 *    共用一条流会让「夺舍有没有发生」取决于前三支抽了几次 ⇒ 四条流重新耦合，
 *    「互不干扰」当场失效（而且不报错）。
 */
export const NETHER_POSSESS_SEED_KEY = 0x4e505358;

/** **跨位面夺舍**随机流的缓存。理由与其余六条逐条相同。 */
const NETHER_POSSESS_RNG = new WeakMap();

/**
 * 跨位面夺舍随机流。**同一条 world 永远是同一条流**，且与其余七条
 * **互不干扰**（理由见 `NETHER_POSSESS_SEED_KEY` 的注释）。
 *
 * @param {object} world 凡间 world（只用它的 `seed`）
 * @returns {() => number} 该 world 专属、且持续演进的跨位面夺舍流
 */
export function netherPossessRngFor(world) {
  let rng = NETHER_POSSESS_RNG.get(world);
  if (!rng) {
    rng = mulberry32(((world.seed || 0) ^ NETHER_POSSESS_SEED_KEY) >>> 0);
    NETHER_POSSESS_RNG.set(world, rng);
  }
  return rng;
}

/**
 * 裂缝的当前半径。**纯函数**，只读 `rift.age` / `rift.strength`，不读 `world`。
 *
 * ```
 * t     = rift.age                                  // 视界开启期间累积的日数
 * grow  = 1 - exp(-t / TAU_GROW)                    // 从 0 涨向 1
 * decay = exp(-max(0, t - TAU_GROW) / TAU_CLOSE)    // 过了峰值日才衰减
 * r     = rift.strength * grow * decay
 * ```
 *
 * ⚠️ **签名变更：`riftRadiusAt(rift, day)` → `riftRadiusAt(rift)`（契约 C1.1）。**
 * 旧版按 `t = day - rift.openedDay` 用**绝对时间**推进曲线。用户第 1 条要求
 * 「裂缝只在开启视界时有效」——若继续读绝对时间，玩家关掉视界的那段日子
 * 曲线照走，一条 30–40 年的缝会在关窗期间**照常过完它的一生**，
 * 玩家永远看不到它，与「只有开启视界时有效」直接矛盾。
 * 所以曲线改读 `rift.age`（**视界开启期间累积的天数**，由 `stepRifts` 累加、
 * `io/save.js` 进档）。`openedDay` 字段**保留**（叙事 / 溯源用），曲线不再读它。
 *
 * ⚠️ **`age` 进档不违反铁律二**：铁律二是「能现算的派生量不入档」。
 * `age` **现算不出来**——它取决于玩家历次开关视界的历史，那是存档之外的
 * 交互过程，`world.day` 与 `openedDay` 都推不出它。所以它不是派生量，必须存。
 * （对照：`radius` / `peakDay` 才是派生量，本模块仍然不存。）
 *
 * ⚠️ **`radius` / `peakDay` 不存档**（铁律二：能现算的一律现算）。设计稿 §4.2
 * 的裂缝记录里有这两个字段，本模块**两个都不存**：
 *   · `radius` 由本函数现算——存下来迟早会和公式对不上（改了 `TAU_GROW`
 *     而忘了改存量记录，裂缝的渲染大小与漏物判定半径就会分叉，且不报错）；
 *   · `peakDay = openedDay + TAU_GROW` 是纯推导量，存它没有任何信息增量。
 * 每条裂缝少存两个数，在 `RIFT_MAX_ACTIVE = 64` 条的量级下就是少一截存档体积。
 *
 * ⚠️ `decay` 里的 `Math.max(0, t - TAU_GROW)` **不是防御性写法，是承重的**：
 * 去掉它，扩张期（`t < TAU_GROW`）的指数会变成**正数**，`decay > 1`，
 * 于是曲线在 `t = TAU_GROW` 处不是峰而是拐点，峰值被推到 `t → 0` 附近——
 * 「先涨后缩」变成「一开就最大然后一直缩」。探针第 5 条就是钉这个的。
 *
 * ⚠️ **峰值不在 `TAU_GROW`**：设计稿 §4.4 说「扩张期从 0 涨到峰值」，
 * 暗示峰在 `TAU_GROW`；真峰在 `t* = TAU_GROW·ln(1 + TAU_CLOSE/TAU_GROW)`
 * （本轮 ≈ 1672 日 ≈ 1.55×TAU_GROW）。探针只断言「曲线有**内部极大**」，
 * 断言「在 TAU_GROW 处最大」是假红。
 *
 * @param {object} rift 裂缝记录（只读 `age` / `strength`）
 * @returns {number} 半径（格）
 */
export function riftRadiusAt(rift) {
  if (!rift) return 0;
  // `|| 0`：老记录 / 手工构造的测试记录可能没有 `age`，缺它时按 0 算
  // （半径 0 = 还没开始扩张），与 `rift.strength || 0` 同款兜底。
  const t = rift.age || 0;
  if (t <= 0) return 0;
  const grow = 1 - Math.exp(-t / TAU_GROW);
  const decay = Math.exp(-Math.max(0, t - TAU_GROW) / TAU_CLOSE);
  return (rift.strength || 0) * grow * decay;
}

/**
 * 这条裂缝是否还活着。
 *
 * `closedDay < 0` 是「还开着」的唯一判据——闭合时把 `closedDay` 置成当天，
 * 而**不是**把记录直接删掉：`closedDay` 是长测读数「开过几条 / 闭了几条」
 * 的一半（另一半在 `riftLog.closed`）。
 */
export function riftIsActive(rift) {
  return Boolean(rift) && rift.closedDay < 0;
}

/**
 * 账本容器兜底。形状与设计稿 §4.2 一致，外加 `lost`。
 *
 * ⚠️ `lost` 是**历史遗留键**：它数「被裂缝吞掉、不进上界的凡人」，而用户
 * 第 4 条已推翻该语义（凡人现在真的进上界，计 `crossed`）——见 `leakToUpper`。
 * 保留它只为存档兼容（`io/save.js` 把它钉成 5 键契约），**恒 0**。
 */
function ensureRiftState(world) {
  if (!Array.isArray(world.rifts)) world.rifts = [];
  if (!world.nextRiftId || world.nextRiftId < 1) world.nextRiftId = 1;
  if (!world.riftLog) world.riftLog = { opened: 0, closed: 0, leaked: 0, crossed: 0, lost: 0 };
  const log = world.riftLog;
  // 五键一个不能少：缺键会让 `riftStats` 读出 `undefined`，
  // 而 `undefined >= 1` 是 false、`undefined <= 20` 也是 false——
  // 长测判据会**静默地把「系统活着」判成不通过**，红的位置离真正的改动很远。
  if (typeof log.opened !== 'number') log.opened = 0;
  if (typeof log.closed !== 'number') log.closed = 0;
  if (typeof log.leaked !== 'number') log.leaked = 0;
  if (typeof log.crossed !== 'number') log.crossed = 0;
  if (typeof log.lost !== 'number') log.lost = 0;
}

/** `clamp(lo, hi, v)`。自己写而不是引第三方——这是本模块唯一需要的裁剪。 */
function clamp(lo, hi, v) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 把一条**格点到格点**的直线逐格光栅化（Bresenham），每落一格调一次 `push`。
 * 返回走过的格数（含两端）。
 *
 * 为什么不用「按参数 t 均匀采样」：采样步长与斜率的比值会漏格——一条 45° 的
 * 长边会在某些段上跳过中间格，于是「边缘」出现洞，裂缝就会开在洞外。
 * Bresenham 保证**首尾相接、每步只走一格**，边是连续的。
 *
 * 端点已由调用方 clamp 到地图内，Bresenham 全程留在两端点的包围盒里，
 * 所以中间格**必然**也在图内（不会写出越界索引）。
 */
function walkLine(ax, ay, bx, by, push) {
  let x = ax;
  let y = ay;
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx - dy;
  let steps = 0;
  for (;;) {
    push(x, y);
    steps += 1;
    if (x === bx && y === by) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if (steps > dx + dy + 2) break;      // 安全阀：Bresenham 最多走 max(dx,dy)+1 步
  }
  return steps;
}

/**
 * 在划选区域的**边缘**上开裂缝。
 *
 * 区域有两种形状，走两条候选格枚举：
 *   · **矩形**（`{x0,y0,x1,y1}`，无 `path`）：候选格 = 四条边上的所有格
 *     （**不含内部**），角格去重；周长 = `2 * (cols + rows)`。
 *   · **自由形状**（带 `path`，世界坐标格点序列、首尾不重复）：候选格 =
 *     相邻两点连线**逐格光栅化**后的格（含闭合边「最后一点 → 第一点」），
 *     `seen` 去重；周长 = 各段格数之和。
 *
 * 之后的规则两条路**完全共用**（规格 §4.1 + §4.3 判定规则）：
 *   · 裂缝数 = `clamp(1, 4, round(周长 / 120))`；
 *   · 位置过滤：凡间 `world.isWalkable` 为真 **且** 目标位面对应格可站人
 *     ——否则会开出「一条在雪山之巅、谁都够不着的裂缝」。目标位面的判据**单源**：
 *     上界 `upperWalkable`、幽冥 `netherWalkable`（都在 `world/planes.js`）。
 *     ⚠️ 不能继续统一调 `upperWalkable` 处理所有裂缝：拿上界那两条阈值
 *     （`height` / `water`）去判幽冥地图会得到一张「哪儿都站不住」的图，
 *     于是幽冥裂缝**一条都开不出来**，而且不报错（D6-2 工程包 B3 的根因）。
 *   · 去重：已有活跃裂缝的格不再开；
 *   · 选格走 `riftRngFor(world)`，Fisher-Yates 洗牌取前 N（**无偏、抽签数确定**）。
 *
 * ⚠️ **矩形分支必须与「自由形状」落地之前的旧行为逐格一致**——
 *    `scripts/_riftprobe.mjs` 的 ①–④ 直接数候选格，钉死在矩形上。
 *
 * ⚠️ **`world.upper` 可能不存在**（测试造的单世界、或阶段一之前的档）。
 * 那时**跳过位置过滤里的上界那一半**，只判凡间。这不是「放行」：
 * 上界不存在时，`stepRifts` 的整个方向 B 也会被跳过（见那里的注释），
 * 于是不会出现「只有一半世界能站人」的矛盾。
 * ⚠️ **幽冥那一侧刻意不对称**：`world.nether` 不存在时**直接拒**（`'no-plane'`），
 *    不跳过判据。理由见 `@param targetPlane`——上界那条宽容是**历史行为**
 *    （改它会动到既有夹具），幽冥这条是**新契约**，从第一天就按正确语义写。
 *
 * ⚠️ **为什么用洗牌而不是「反复重试直到命中」**：重试的抽签次数取决于
 * 候选格的随机命中率，是**不定量**的——同一个 world 上，一次 `openRifts`
 * 之后流的位置不可预测，于是「同一 seed 的两条世界线」在第二次开缝时
 * 就会分叉。洗牌的抽签数只取决于候选数组长度（确定的），流位置可预测。
 *
 * @param {object} world 凡间 world（需要 `w`/`h`/`size`/`isWalkable`；
 *        目标 `'upper'` 时可选 `upper`，目标 `'nether'` 时**必须**有 `nether`）
 * @param {{x0:number,y0:number,x1:number,y1:number,path?:Array<[number,number]>}} region
 *        划选区域：带 `path` 走自由形状，否则按矩形
 * @param {'upper'|'nether'} [targetPlane] 这条缝连接哪一界。缺省 `'upper'`
 *        （契约之前只有一个隐含目标——上界，所以缺省即历史行为）。
 *        非 `'upper'` / `'nether'` 的值**一律归一到 `'upper'`**（不抛错：
 *        调用方是 UI 与测试，传错一个字符串不该让整个视界动作炸掉）。
 *        ⚠️ `'nether'` 且 `world.nether` 不存在 → **如实报拒**（`reason: 'no-plane'`）：
 *        一条「连接幽冥」的缝而幽冥不存在，它连的是一个空位面——那是**假的**
 *        世界状态，还会进存档。宁可不开，也不要造一条永远连不通的缝。
 *        （上界那一侧刻意**不**这样做：老行为是「`upper` 缺省就跳过位置过滤里的
 *        上界那一半」，改它会动到既有测试的夹具，见下面位置过滤那一段。）
 * @returns {{opened:number, refused:boolean, reason:string|null}}
 */
export function openRifts(world, region, targetPlane = 'upper') {
  ensureRiftState(world);
  const { w, h } = world;

  // ── 0. 目标位面（D6-2 工程包 B1）──────────────────────────
  // 归一 + 「目标世界在不在」的显式检查。理由见上面 `@param` 那一段。
  const plane = targetPlane === 'nether' ? 'nether' : 'upper';
  if (plane === 'nether' && !world.nether) {
    return { opened: 0, refused: true, reason: 'no-plane' };
  }

  // 自由形状？`path` 至少要 3 点才构成一条闭合折线（与 normalizeRegion 同口径）。
  const path = (region && Array.isArray(region.path) && region.path.length >= 3)
    ? region.path
    : null;

  // ── 1. 上限：活跃裂缝够了就拒绝 ───────────────────────────
  // 数「活跃」（`closedDay < 0`）而不是 `world.rifts.length`：
  // `stepRifts` 会剔除闭合的，但**调用方不一定刚调过** `stepRifts`——
  // 若数组里还留着已闭合的记录，按 `.length` 数会提前触顶（少开缝，不报错）。
  // ⚠️ 这一条**排在枚举候选格之前**：到顶时直接返回，不去光栅化路径（省一次
  //    整圈走格）。顺序与旧版一致，`reason` 也仍是 'active-cap'。
  let activeCount = 0;
  for (let i = 0; i < world.rifts.length; i += 1) {
    if (world.rifts[i].closedDay < 0) activeCount += 1;
  }
  if (activeCount >= RIFT_MAX_ACTIVE) {
    return { opened: 0, refused: true, reason: 'active-cap' };
  }

  // ── 2. 候选格 + 周长 ──────────────────────────────────────
  const cells = [];
  const seen = new Set();
  const pushCell = (x, y) => {
    const i = y * w + x;
    if (seen.has(i)) return;              // 角格被上下边与左右边各算一次
    seen.add(i);
    cells.push({ x, y, i });
  };
  let cols;
  let rows;
  let perimeter;
  if (path) {
    // 自由形状：相邻两点连线逐格光栅化（含闭合边）。
    // 包围盒（cols/rows）只为 `strength` 的 `areaFrac` 服务，与矩形分支同口径。
    let minX = w - 1;
    let maxX = 0;
    let minY = h - 1;
    let maxY = 0;
    perimeter = 0;
    for (let k = 0; k < path.length; k += 1) {
      const a = path[k];
      const b = path[(k + 1) % path.length];
      const ax = clamp(0, w - 1, Math.round(a[0]));
      const ay = clamp(0, h - 1, Math.round(a[1]));
      const bx = clamp(0, w - 1, Math.round(b[0]));
      const by = clamp(0, h - 1, Math.round(b[1]));
      perimeter += walkLine(ax, ay, bx, by, pushCell);
      if (ax < minX) minX = ax;
      if (ax > maxX) maxX = ax;
      if (ay < minY) minY = ay;
      if (ay > maxY) maxY = ay;
      if (bx < minX) minX = bx;
      if (bx > maxX) maxX = bx;
      if (by < minY) minY = by;
      if (by > maxY) maxY = by;
    }
    cols = maxX - minX + 1;
    rows = maxY - minY + 1;
  } else {
    // 矩形（旧路径，逐格一致）。
    const rx0 = Math.min(region.x0, region.x1) | 0;
    const rx1 = Math.max(region.x0, region.x1) | 0;
    const ry0 = Math.min(region.y0, region.y1) | 0;
    const ry1 = Math.max(region.y0, region.y1) | 0;
    const x0 = clamp(0, w - 1, rx0);
    const x1 = clamp(0, w - 1, rx1);
    const y0 = clamp(0, h - 1, ry0);
    const y1 = clamp(0, h - 1, ry1);
    cols = x1 - x0 + 1;
    rows = y1 - y0 + 1;
    for (let x = x0; x <= x1; x += 1) { pushCell(x, y0); pushCell(x, y1); }
    for (let y = y0 + 1; y <= y1 - 1; y += 1) { pushCell(x0, y); pushCell(x1, y); }
    perimeter = 2 * (cols + rows);
  }

  // ── 4. 位置过滤 + 去重（已有活跃裂缝的格）─────────────────
  const upper = world.upper;
  const nether = world.nether;
  const occupied = new Set();
  for (let i = 0; i < world.rifts.length; i += 1) {
    const rf = world.rifts[i];
    if (rf.closedDay < 0) occupied.add(rf.y * w + rf.x);
  }
  const sites = [];
  for (let k = 0; k < cells.length; k += 1) {
    const c = cells[k];
    if (occupied.has(c.i)) continue;
    if (!world.isWalkable(c.i)) continue;
    // 目标位面对应格也必须可站人（判据**单源**，理由见函数头与 @param）：
    //   · 'upper'  —— 既有行为逐字不变：`upper` 缺省则只判凡间；
    //   · 'nether' —— `nether` 必然存在（第 0 步已拒掉缺省的情形），
    //                 判据走 `netherWalkable`，与鬼魂落点同源。
    if (plane === 'nether') {
      if (!netherWalkable(nether, c.i)) continue;
    } else if (upper && !upperWalkable(upper, c.i)) {
      continue;
    }
    sites.push(c);
  }

  // ── 5. 洗牌取前 N ────────────────────────────────────────
  // `perimeter` 在 ② 里按形状算好了（矩形 = 2(cols+rows)，自由形状 = 各段格数之和）。
  const want = clamp(1, 4, Math.round(perimeter / 120));
  const rng = riftRngFor(world);
  for (let i = sites.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = sites[i];
    sites[i] = sites[j];
    sites[j] = tmp;
  }
  const n = Math.min(want, sites.length);
  if (n <= 0) {
    // 候选格全被过滤/去重掉：**如实报拒**，不要「返回得干干净净但什么也没做」。
    return { opened: 0, refused: true, reason: 'no-site' };
  }

  // ── 6. 落地 ──────────────────────────────────────────────
  const areaFrac = (cols * rows) / world.size;
  const strength = Math.min(RIFT_MAX_RADIUS, RIFT_BASE_RADIUS * (1 + areaFrac));
  for (let k = 0; k < n; k += 1) {
    const c = sites[k];
    world.rifts.push({
      id: world.nextRiftId,
      x: c.x | 0,
      y: c.y | 0,
      strength,
      // `openedDay` 只作叙事 / 溯源（「这缝是哪天裂的」），**曲线不再读它**。
      openedDay: world.day,
      // `age` = 这条缝**在视界开启期间**累积的天数（契约 C1.1）。
      // 刚开出来时为 0，由 `stepRifts` 每次 +`RIFT_PERIOD_DAYS`。
      // 它是**玩家开关窗历史**的函数，现算不出来，所以必须进档（不违反铁律二）。
      age: 0,
      closedDay: -1,
      leaked: 0,
      crossed: 0,
      // ── 目标位面（D6-2 工程包 B2）──────────────────────────
      // 追加在**行尾**：实体行是定长数组、裂缝是对象，但两者的纪律同一条
      // ——中间插字段会顶歪按位置读的代码（`io/save.js` 是逐字段具名读写的，
      // 这里追加最省事也最安全）。
      // ⚠️ **必须进存档**（`io/save.js` 写读两侧）：一条缝能活 30–40 年，
      //    玩家关掉视界以后它仍然必须知道自己原本连接哪里。
      targetPlane: plane,
    });
    world.nextRiftId += 1;
    world.riftLog.opened += 1;
    // ── 开缝进大事账本 ────────────────────────────────────
    // 裂缝是**玩家亲手划出来的**、而且会持续漏物 / 吸人上界 / 自己闭合，
    // 所以它是「我刚才那一笔到底改了什么」最直接的回执。
    // ⚠️ 不调 `rng()`：这里用的是已经洗好的 `sites`，加一行不会移动随机流。
    // ⚠️ 文案按目标位面分流：幽冥渗的是**阴气**，不是灵气——把「灵气」印在
    //    一条连幽冥的缝上，是玩家可见层里那种「看着像、其实错」的话。
    //    上界那半句**逐字未改**（既有探针 / 报告里引过它）。
    world.milestone(
      plane === 'nether'
        ? `${placeOf(world, c.x, c.y)}的天地裂开一道缝隙，阴气自其中渗出。`
        : `${placeOf(world, c.x, c.y)}的天地裂开一道缝隙，灵气自其中泄出。`,
      'rift',
    );
    // 表现层：开缝那一下（FX 画一条短暂开裂的墨线）。只发事件，不改模拟、不抽 rng。
    emitPresentation(world, 'rift-open', { x: c.x | 0, y: c.y | 0 });
  }
  return { opened: n, refused: false, reason: null };
}

/**
 * 在裂缝半径内找一块**凡间可站人**的地。
 *
 * 复用 `world.isWalkable`，**不另写阈值**：落点判定与「人能不能站」一旦分叉，
 * 法宝会落进湖心，而且不报错（`territory.js:53-58` 的同款纪律）。
 * 找不到就返回 `null`——调用方必须**放弃这次漏物**，不许把东西丢进水里。
 *
 * 不抽随机流：落点是确定性求解（同 `planes.js` 的 `findLandingTile`）。
 */
function findMortalSpot(world, rift, r) {
  const rad = Math.ceil(r);
  for (let dy = -rad; dy <= rad; dy += 1) {
    for (let dx = -rad; dx <= rad; dx += 1) {
      if (Math.hypot(dx, dy) > r) continue;
      const x = rift.x + dx;
      const y = rift.y + dy;
      if (!world.inside(x, y)) continue;
      if (!world.isWalkable(y * world.w + x)) continue;
      return { x, y };
    }
  }
  return null;
}

/**
 * 在裂缝半径内找一块**上界可站人**的地（第 5 行「凡间法宝 → 上界」的落点）。
 *
 * 复用 `world/planes.js` 的 `upperWalkable`，**不另写水域阈值**：
 * 与 `openRifts` 的位置过滤、`planes.js` 的 `findLandingTile` 用的是同一套判据
 * （`territory.js:53-58` 的同款纪律：落点判定与「能不能站」一旦分叉，
 * 法宝会落进云海，而且不报错）。
 *
 * 与 `findMortalSpot` 同形：确定性求解，**不抽随机流**。
 * 找不到就返回 `null`——调用方必须**放弃这次漏物**，不许把法宝丢进云海、
 * 更不许凭空删掉。
 */
function findUpperSpot(world, rift, r) {
  const upper = world.upper;
  const rad = Math.ceil(r);
  for (let dy = -rad; dy <= rad; dy += 1) {
    for (let dx = -rad; dx <= rad; dx += 1) {
      if (Math.hypot(dx, dy) > r) continue;
      const x = rift.x + dx;
      const y = rift.y + dy;
      if (!upper.inside(x, y)) continue;
      if (!upperWalkable(upper, y * upper.w + x)) continue;
      return { x, y };
    }
  }
  return null;
}

/**
 * 方向 A 的**第 1 个物源**（规格 §4.3 表格第 1 行）：上界的**无主**法宝落到凡间。
 *
 * ⚠️ 本函数是**原有通道，行为必须逐字不变**：它被 `leakFromUpper` 原样调用，
 * 调用顺序与 `rng` 消耗次数都和「加灵植之前」完全一致（法宝优先、灵植兜底）。
 *
 * ⚠️ 字段名以代码为准：法宝的持有者字段是 **`ownerId`**（`artifacts.js:338`
 * `forgeArtifact` 写 `ownerId: owner.id`；`artifacts.js:389` `toGround` 写
 * `ownerId = 0`）。**无主 = `ownerId` 为假值**（`0` / `undefined`）。
 * 设计稿 §4.3 表格里写的是 `!a.owner`，那个字段名**不存在**——按代码写。
 *
 * 上界与凡间同尺寸、坐标对位，所以直接用 `Math.hypot(ax - rift.x, ay - rift.y)`。
 *
 * @returns {boolean} 是否真的漏了一件法宝
 */
function leakUpperArtifact(world, rift, r, rng) {
  const upper = world.upper;
  if (!upper || !Array.isArray(upper.artifacts) || !upper.artifacts.length) return false;

  const cands = [];
  for (let i = 0; i < upper.artifacts.length; i += 1) {
    const a = upper.artifacts[i];
    if (a.ownerId) continue;                       // 有主的不漏
    if (Math.hypot(a.x - rift.x, a.y - rift.y) > r) continue;
    cands.push(a);
  }
  if (!cands.length) return false;

  const pick = cands[Math.floor(rng() * cands.length)];
  // 先找落点、再动手：找不到落点就整次放弃，法宝**留在上界**
  // （不许先摘下来再丢进水里）。
  const spot = findMortalSpot(world, rift, r);
  if (!spot) return false;

  // D8-E：离开端坐标 / 身份要在**动手之前**捕获——`toGround` 会把 `pick.x/y`
  // 改写成落点、`pick.id` 也在别处被重赋，之后再读就只剩「到达端」了。
  const fromX = pick.x; const fromY = pick.y; const fromId = pick.id;
  const at = upper.artifacts.indexOf(pick);
  if (at >= 0) upper.artifacts.splice(at, 1);
  toGround(world, pick, spot.x, spot.y);
  // ── 跨位面流入的账 ────────────────────────────────────────
  // `toGround` 把一件**上界炼出**的法宝推进了 `world.artifacts`，于是凡间的
  // `liveArtifactCount` 涨了 1，而凡间的 `artifactLog.forged` **没有**涨
  // （它是在上界 `forgeArtifact` 里记的）。这会让长测的守恒律
  // `造出 = 在世 + 碎 + 朽` 变成「在世虚高」——一条真·静默坏法。
  // 所以这里补一笔**流入账**；长测的守恒式随之扩成
  // `造出 + 流入 = 在世 + 碎 + 朽 + 流出`（`inkbox-longrun.mjs` 那一处）。
  //
  // ⚠️ 为什么不挂 `world.riftLog`：`riftLog` 在 `io/save.js` 里是**逐键显式**
  // 序列化的（5 键），往里加键会读档丢失、且 save-equiv 的键集判据会红。
  // `artifactLog` 是**整对象**序列化的，加键能原样往返；它也本来就是
  // 「法宝流向」的账本（`forged` / `found` / `broken` / `decayed` / `left`）。
  if (world.artifactLog) world.artifactLog.riftIn = (world.artifactLog.riftIn || 0) + 1;
  rift.leaked += 1;
  world.riftLog.leaked += 1;
  // D8-E：**成功之后**发跨界事件（上界的法宝消失 ↔ 凡间地上多一件）。
  emitRiftCross(world, {
    kind: 'artifact', fromPlane: 'upper', toPlane: 'mortal',
    fromX, fromY, toX: spot.x, toY: spot.y,
    fromKey: `upper:artifact:${fromId}`, subjectId: fromId,
  });
  return true;
}

/**
 * 方向 A：上 → 下。**两个物源，法宝优先、灵植兜底。**
 *
 * 规格 §4.3 表格的「上 → 下」有两行：第 1 行法宝（`leakUpperArtifact`）、
 * 第 2 行灵植/仙草（`leakUpperHerb`）。本函数只做**优先级调度**：
 * 先试法宝，没漏成才试灵植。
 *
 * ⚠️ **为什么是优先级、不是「两样一起抽签」**：法宝是**原有通道**，
 * 它的候选池再稀，也不该因为「加了一条新通道」而改变自己的命中行为——
 * 一旦改成加权抽签，既有探针（`scripts/_riftprobe.mjs` ⑬A/⑬D）与长测读数
 * 都会跟着变，那是**没必要的**契约扰动。写成兜底，法宝分支的每一次
 * `rng` 消耗、每一个返回点都逐字未变。
 *
 * ⚠️ **为什么不给 `riftLog` 加键**：灵植在语义上也是「漏物」，计进**现有的**
 * `riftLog.leaked`（规格 §4.3 第 2 行的判定条件与第 1 行同构）。这样
 * `io/save.js` 的 `riftLog` **5 键契约**与 `rifts[]` 记录契约一个字都
 * 不用动，按旧契约写断言的脚本一条都不会红。两个来源的**分离读数**
 * 靠已有账本现算：
 * `灵植件数 = riftLog.leaked − artifactLog.riftIn − artifactLog.riftOut`
 * （`riftIn` 只在法宝「上→下」时自增、`riftOut` 只在凡间法宝「下→上」时自增）。
 * ⚠️ 当时 `rifts[]` 是 **9 字段**契约；**现在是 10 字段**（2026-09-24 · D6-2
 * 工程包 B2 加了 `targetPlane`）。本段纪律不变——**本条通道一个字段都没加**，
 * 加的那一个是裂隙「连哪一界」的身份，与漏物通道无关。
 *
 * @param {() => number} rng 裂缝独立流（与法宝分支**同一条**）
 * @returns {boolean} 是否真的漏了一件东西（法宝或灵植）
 */
function leakFromUpper(world, rift, r, rng) {
  if (leakUpperArtifact(world, rift, r, rng)) return true;
  return leakUpperHerb(world, rift, r, rng);
}

/**
 * 方向 A 的**第 2 个物源**（规格 §4.3 表格第 2 行）：上界的**灵植 / 仙草**
 * 落到凡间，变成一个 `kind: 'secret'` 的 `site`。
 *
 * ── 四条纪律（每条都对应一次真实的踩坑）────────────────────
 * ① **随机流**：走调用方递进来的 `rng`，也就是 `riftRngFor(world)` 那条
 *    裂缝独立流。**绝不碰 `Life.rng`**（见文件头「随机流纪律」）——那是全世界
 *    共用的主随机流，混进去会把整条世界线往后挪，既有标定全部作废。
 * ② **不扩契约**：不新增 `world.riftLog` 的键、不给 `world.rifts[]` 加字段，
 *    只 `leaked += 1`。理由见 `leakFromUpper` 的函数头。
 * ③ **派生量不入档**（铁律二）：灵植位置**现算**自 `upper.veg`，**不**新建
 *    `upper.herbs` 之类数组。`upper.veg` 本身就是存档层（`io/save.js:585` 写 /
 *    `:662` 还原），所以「采走」这件事**必须**写回 `veg` 才存得住（见下）。
 * ④ **跨世界不带裸 id**（铁律三）：落到凡间的是**凡间自己的** site
 *    （`world.addSite` 发 id），不搬运上界的任何 id。
 *
 * ── 「采走」= 把该格 `upper.veg[i]` 清零 ────────────────────
 * `upper.veg` 是**静态**层（上界不跑 `stepVegetation`），清零 = 这株灵植
 * 从此不再可漏。**代价（写明）**：灵植因此是**有限资源**，长期会枯竭；
 * 且 `veg` 同时被渲染（`terrainLayer.js`）与 `World.fertility()` 读，
 * 清零会让那一格在视觉与肥力上一起变秃。
 *
 * **为什么仍选清零，而不是「减半」或「不清零」**：
 *   · 「不清零」需要一个独立的「已采」集合，那是一份**新的存档状态**
 *     （违反铁律二：能从 `veg` 现算的东西不该再存一份）；
 *   · 「减半」的枯竭速度依赖一个没有依据的系数，读数不干净；
 *   · **清零是最保守（最坏情况）的枯竭模型**——若连「每漏一株就永久拿掉一格」
 *     都不枯竭，那么减半 / 不清零更不会。于是「会不会枯竭」这个问题由这条
 *     通道**自己**回答掉，不必先建一套再生系统。
 *   · 清零的存档往返**精确**：`encodeQuantized` 对 0 走 `v <= 0 ? 0` 分支
 *     （`io/save.js:161`），`decodeQuantized` 把 0 还原成 0（`:172`），
 *     不带其他值那种 1/65535 的量化误差。
 * **实测枯竭读数**（`node scripts/_herbprobe.mjs --sweep --years=300`，中堂 · 种子
 * 20260914）：上界 `veg >= HERB_VEG_MIN` 的格 **10540**，300 年采走 **5** 格，
 * 收尾剩 **10535** —— 枯竭比例 **0.047%**。也就是说按最保守的清零模型，
 * 300 年的漏出量相对于灵植总量是**万分之一量级**，**不会**枯竭。
 * 读数由常驻探针 `scripts/_herbprobe.mjs` 产生（探针随本文件入库，可随时复核）。
 *
 * ── 落点（本次修改：单一落点 → 半径内多试几个）──────────────
 * 旧写法只取 `findMortalSpot` 返回的**那一格**去 `plantSite`，落点太严：
 * `plantSite` → `spawnSecretRealm` → `findSiteSpot`（`sites.js:160`）还有两道
 * 比「可站人」严得多的门（灵气 `qi >= 0.35`、半径 6 格内没有别的 site，
 * 且 80 次拒绝采样要成功），实测 7462 个「候选非空」缝·拍里只有 3053 个能完成
 * （**40.9%**）——剩下 59% 白抽一签、什么都不发生。
 *
 * ⚠️ **为什么不能靠「重调 `findMortalSpot`」重试**：它是**确定性求解**
 * （双层循环返回**第一个**可走格），同样参数永远返回同一格，重调等于没重试。
 * 所以改成：先在半径内用**同源判据**收集**所有**可站人的格 `spots`，
 * 再抽一个起始下标、从它起**环形**最多试 `HERB_LANDING_TRIES` 个落点，
 * 第一个 `plantSite` 成功就停。全部失败 → `return false`，灵植留在上界。
 * ⚠️ **不改** `findMortalSpot` 本身——法宝分支（`:601`）还在用它。
 *
 * ⚠️ **本修改会改变 rng 消耗序列**：现在多抽一签（起始下标），且失败时会在
 * 同一判定里连抽多次 `plantSite`。既有 300 年标定读数（漏出件数、枯竭比例）
 * **因此全部作废，必须重跑** `scripts/_herbprobe.mjs` / `inkbox-longrun.mjs` 复核。
 * 纪律没变：候选空 / 落点空时**一签都不抽**；`plantSite` 全失败时整次放弃，
 * **灵植留在上界**（`veg` 不清零）——不许「先采下来再发现种不下去」。
 *
 * @returns {boolean} 是否真的漏了一株
 */
function leakUpperHerb(world, rift, r, rng) {
  const upper = world.upper;
  // `upper.veg` 缺省 → 没有灵植层可漏（手工构造的测试上界就是这种）。
  // 此时**在消耗任何 rng 之前**返回：不扰动裂缝自己的流。
  if (!upper || !upper.veg || !upper.veg.length) return false;

  // ── 1. 候选：半径内的灵植格（照 `findMortalSpot` 的双层循环写法）──
  const cands = [];
  const rad = Math.ceil(r);
  for (let dy = -rad; dy <= rad; dy += 1) {
    for (let dx = -rad; dx <= rad; dx += 1) {
      if (Math.hypot(dx, dy) > r) continue;
      const x = rift.x + dx;
      const y = rift.y + dy;
      if (!upper.inside(x, y)) continue;
      const i = y * upper.w + x;
      if (!(upper.veg[i] >= HERB_VEG_MIN)) continue;
      cands.push({ x, y, i });
    }
  }
  // 候选空 → 这次判定什么也不做，**不抽签**（与法宝分支同款：池子空就不该动流）。
  if (!cands.length) return false;

  // ── 2. 落点：半径内**所有**可站人的格（顺序稳定，判据与 `findMortalSpot` 同）──
  // 为什么是「收集全部」而不是「取第一个」：`findMortalSpot` 是**确定性求解**
  // （双层循环返回**第一个**可走格），同样参数重调永远拿到同一格——**重试它没有意义**。
  // 真正的问题在下一道门：`plantSite` → `spawnSecretRealm` → `findSiteSpot`
  // （`sites.js:160`）还有「灵气 qi >= 0.35」「半径 6 格内无别的 site」两道比
  // 「可站人」严得多的门，单一落点实测只有四成能种下。所以这里先把半径内**所有**
  // 可站人的格收成一个数组（双层循环顺序稳定 → 可复现），再从中多试几个。
  // ⚠️ 判据与 `findMortalSpot` **逐字同源**（`Math.hypot(dx,dy) <= r` / `world.inside`
  // / `world.isWalkable`），**不改** `findMortalSpot` 本身（法宝分支 `:601` 还在用它）。
  const spots = [];
  for (let dy = -rad; dy <= rad; dy += 1) {
    for (let dx = -rad; dx <= rad; dx += 1) {
      if (Math.hypot(dx, dy) > r) continue;
      const x = rift.x + dx;
      const y = rift.y + dy;
      if (!world.inside(x, y)) continue;
      if (!world.isWalkable(y * world.w + x)) continue;
      spots.push({ x, y });
    }
  }
  // 一格可站人的地都没有 → 整次放弃，**不抽签**（池子空就不该动流）。
  if (!spots.length) return false;

  const pick = cands[Math.floor(rng() * cands.length)];

  // ── 3. 落点重试：随机起点 + 环形遍历，第一个种下就停 ──────────
  // 先抽起始下标，再从它起**环形**试 `HERB_LANDING_TRIES` 个落点（不超过 spots 长度）。
  // 每个落点都调 `plantSite`（它自己抽 rng），**第一个成功就停**——
  // 不允许「先采下来再发现种不下去」：全部失败 → `return false`，灵植留在上界。
  const start = Math.floor(rng() * spots.length);
  const tries = Math.min(HERB_LANDING_TRIES, spots.length);
  let site = null;
  for (let k = 0; k < tries; k += 1) {
    const spot = spots[(start + k) % spots.length];
    site = plantSite(world, rng, 'secret', spot.x, spot.y);
    if (site) break;
  }
  if (!site) return false;                        // 种不下去 → 灵植留在上界

  // ── 4. 采走：清零（理由见函数头）─────────────────────────
  upper.veg[pick.i] = 0;

  // ── 5. 记账：与法宝共用 `leaked`（不扩契约）───────────────
  // ⚠️ **不**记 `artifactLog.riftIn`：那是法宝的跨位面流入账，灵植不是法宝，
  //    记了会让长测的法宝守恒律虚高。
  rift.leaked += 1;
  world.riftLog.leaked += 1;
  // D8-E：**成功之后**发跨界事件（上界那格灵植被采走 ↔ 凡间长出一个秘境）。
  // ⚠️ `pick` 是**上界** `veg` 的格坐标（`{x,y,i}`），`site` 是**凡间**新秘境；
  //    两侧坐标不同界、但同尺寸对位，直接照发（表现层按 plane 分流）。
  emitRiftCross(world, {
    kind: 'herb', fromPlane: 'upper', toPlane: 'mortal',
    fromX: pick.x, fromY: pick.y, toX: site.x, toY: site.y,
    fromKey: `upper:herb:${pick.x},${pick.y}`,
  });
  return true;
}

/** 凡间的人（凡人 / 修士）。灵兽与山精**不算人**，不被裂缝吸走。 */
function isPerson(e) {
  return e && (e.sp === SPECIES.HUMAN || e.sp === SPECIES.CULTIVATOR);
}

/**
 * 「失踪」：从凡间消失、**不进上界**，只在编年史上留一笔。
 *
 * ⚠️⚠️ **当前 0 调用点（本轮起）。** 旧语义里 `leakToUpper` 的「凡人」分支
 * 调它把人删掉；用户第 4 条要求凡人**真的进上界**，那一支已改成
 * `arriveUpper`，于是本函数不再被任何地方调用。
 *
 * **核实**（本轮全仓 grep `recordRiftLost`）：只有两处——本定义，
 * 以及 `leakToUpper` 里那一处调用（已删）。本函数**没有 export**，
 * 所以仓外 / 测试也拿不到它。即「0 读者」是查证过的，不是猜的。
 *
 * **为什么保留、不删**：①它是「`rift-lost` 编年史条目」这个**形状**的唯一
 * 文字说明，老档里还留着 kind = `'rift-lost'` 的条目（编年史是滚动窗口，
 * 可能还没被顶出去）；②删它是一次纯删除，但它与探针 ⑬C（凡人失踪组）
 * 是同一件事，删函数就得同时改探针——**留给主代理统一改测试判据时一并决定**。
 * 本轮只标注，不动。
 */
function recordRiftLost(world, entity, rift) {
  const name = entity.name || '一名凡人';
  const text = `${name}在裂缝（${rift.x},${rift.y}）处失踪，遍寻不见`;
  // 走 `world.record`：编年史条目的形状（`{day, year, text, kind}`）、
  // 400 条滚动窗口、以及「人物个人事件流」的分流都在这一个函数里，
  // **不自己 push**——自己 push 会绕过窗口裁剪，编年史会无界增长。
  if (typeof world.record === 'function') {
    world.record(text, 'rift-lost');
    return;
  }
  // 手工构造的测试 world 没有 `record`：照 `World.record` 的字段形状补一条。
  if (!Array.isArray(world.chronicle)) world.chronicle = [];
  world.chronicle.push({
    day: world.day || 0,
    year: Math.floor((world.day || 0) / 360),
    text,
    kind: 'rift-lost',
  });
}

/**
 * 方向 B：下 → 上。凡间的人 / 物被吸走。
 *
 * ── 语义（用户第 3 条，**已取代规格 §4.3 第 3/4 条的旧语义**）──────
 * 用户原话：「跨界门槛定设定裂隙处无限制，都有概率跨界。但高修为修士必须
 * 通过飞升来跨境，设定为化神期天雷事件，如果通过可以跨界。」
 * 于是本函数从「只吸够高境界的修士」**反转**成「裂隙处人人平等、高修为除外」：
 *   1. 候选 = 半径内所有 `isPerson` 且 `level < RIFT_CROSS_MAX_LEVEL` 的人。
 *      `RIFT_CROSS_MAX_LEVEL = 40`（化神期起点，来自 `core/cultivation.js`）——
 *      **≥ 40 的高修为修士不进候选**：他们只能走化神天雷飞升（另一代理的
 *      `cultivation.js` / `upperLife.js`，本模块不碰）。
 *      **凡人（level 0）现在在内**：旧语义里他们只会「失踪」，现在真的进上界。
 *   2. 取**境界最高的一个**（同 level 取先遇到的）→ `arriveUpper` 送上界，
 *      计 `crossed`。修士与凡人走的是**同一条** `arriveUpper` 通道。
 *   3. **半径内一个人都没有** → 兜底：凡间**地上的无主**法宝送进上界
 *      （规格 §4.3 表格第 5 行，见 `leakGroundArtifactToUpper`）。
 *
 * ⚠️ **凡人不再「失踪」，`world.riftLog.lost` 从此恒 0**：
 * 旧语义把人从 `world.entities` 里删掉、只写一条编年史（`recordRiftLost`），
 * 于是世界上少了一个人而**没有任何地方**记得他去哪了。用户第 4 条要求凡人
 * 也真的进上界（上界凡人怎么活由另一代理负责，本模块只负责送过去）。
 * `lost` 这个键**必须保留**：`io/save.js` 把它钉成 5 键契约，删键会让
 * save-equiv 的键集判据红。它是**历史遗留键**，语义已被用户第 4 条推翻，
 * 保留只为存档兼容，**恒 0**（`ensureRiftState` / `save.js` 的兜底都不动）。
 *
 * ⚠️ **第 3 支是兜底分支，不是「人 + 物一起抽签」**。语义仍是**优先级**
 * （有人 > 没人），不是加权抽签；把法宝塞进同一个池子均匀抽，会让
 * 「人站在缝里」变成**不一定**发生。兜底分支是**纯增量**：半径内有人时
 * 行为与以前一致（只是「谁」的规则变了），**只有一个人都没有时**才轮到法宝。
 *
 * ⚠️ **必须复用 `arriveUpper`，绝不自己 `structuredClone` + push**：
 * 那个函数里做着跨世界 id 切断（`faction`/`clan`/`gen`/`village` 清零、
 * `mortalId` 删除、id 改到 `UPPER_ID_BASE` 段）、账本记账（`popLog.arrived`
 * 与 `arrivedLog`）、以及落点求解。自己写一份必然漏掉 id 切断——
 * 这正是 `scripts/_snapprobe.mjs` 记录的那次真 bug（凡间 id 与上界同号，
 * 飞升者被静默过继进陌生人的始祖线，且永远开不了宗）。
 *
 * ⚠️ **`world.upper` 不存在时跳过整条方向 B**（规格原文）：
 * 上界不存在就没有「上」可去，此时把人 / 物删掉等于凭空蒸发——
 * 宁可这次判定什么也不做。
 *
 * @param {() => number} rng 裂缝独立流（第 3 支要从候选里抽一件）
 * @returns {boolean} 是否真的走了一个人 / 一件物
 */
function leakToUpper(world, rift, r, rng) {
  if (!world.upper) return false;                  // 整条方向 B 跳过

  // ── 1. 候选：半径内的人，**排除高修为**（他们只能走飞升）──────
  const cands = [];
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (!isPerson(e)) continue;
    // ⚠️ `>=` 而不是 `>`：`RIFT_CROSS_MAX_LEVEL = 40` 是**化神期起点**，
    // 化神及以上必须走飞升——裂缝的门槛是**开区间** `[0, 40)`。
    // 故障注入：把 `>=` 改成 `>`，化神修士（level 40）就会被裂缝吸走，
    // 与「高修为必须飞升」直接矛盾（探针 ⑬G 钉这个）。
    if ((e.level || 0) >= RIFT_CROSS_MAX_LEVEL) continue;
    if (Math.hypot(e.x - rift.x, e.y - rift.y) > r) continue;
    cands.push(e);
  }

  // ── 2. 取境界最高的一个（同 level 取先遇到的）─────────────────
  let best = null;
  for (let i = 0; i < cands.length; i += 1) {
    const e = cands[i];
    const lv = e.level || 0;
    // 用 `>` 而不是 `>=`：同 level 时保留**先遇到的**那个（顺序稳定、可复现）。
    if (!best || lv > (best.level || 0)) best = e;
  }
  if (best) {
    // D8-E：离开端坐标 / id 先捕获（`arriveUpper` 内部 `structuredClone`，
    // `best` 本身不被改写，但显式取一份让「离开端」语义不依赖实现细节）。
    const fromX = best.x; const fromY = best.y; const fromId = best.id;
    const at = world.entities.indexOf(best);
    if (at >= 0) world.entities.splice(at, 1);
    // ⚠️ **先把他身上的法宝放回凡间地上，再送人上去**——漏掉这一步就是
    // 「法宝随人一起凭空蒸发」：法宝挂在 `entity.artifacts` 上，实体被
    // `splice` 出 `world.entities` 之后，那些法宝既不在任何实体身上、
    // 也不在 `world.artifacts` 里，于是**永远不会有人发现**（函数返回得
    // 干干净净，只是世界上少了东西）。
    //
    // 这正是长测那条守恒律 `造出 + 流入 = 在世 + 碎 + 朽 + 流出`
    // （`inkbox-longrun.mjs`）存在的意义——它抓到的第一例就是飞升者的法宝
    // 随人消失（600 年 41 件），当时的修法是在 `ascend()` 里调 `leaveArtifacts`。
    // 本模块是**新增的第五条移除路径**（被裂缝吸走），必须照同一条纪律办。
    //
    // 用 `scatterArtifacts` 而不是 `leaveArtifacts`：后者会写一条
    // 「【某某】飞升，……留在原地」的编年史——被裂缝吸走**不是飞升**，
    // 那句文案是错的（会误导玩家与后来人）。`scatterArtifacts` 只把东西
    // 放在原地、不写编年史、也**不抽随机流**（不扰动裂缝自己的流）。
    //
    // 落点用实体自己的坐标：东西掉在他被吸走的那一格。
    //
    // ⚠️ 对**凡人**这一步恒为 no-op：`artifacts.js` 的 `canHold` 要求
    // `level >= 1`，而 `giveTo` 先判 `canHold`——level 0 的人身上恒空
    // （不是「大概没有」，是「收不下」）。**仍然无条件调用**它，是因为
    // `scatterArtifacts` 对空列表本来就早退（`artifacts.js:609`），一次空调用
    // 换掉「level 0 身上一定没法宝」这个**必须由别处维持**的假设：万一那个
    // 不变量哪天被破坏，这里会把东西**留在凡间**，而不是让它蒸发。
    scatterArtifacts(world, best);
    // ⚠️ **必须显式传 `via: 'rift'`**（本轮补的）。`arriveUpper` 的缺省判定
    // 只对**凡人**成立（`isMortal → 'rift'`），而本函数吸走的人可能是
    // `level 1~39` 的低阶修士——他们缺省会被记成 `'ascend'`，于是：
    //   · `popLog.sucked` **漏计全部被吸走的修士**（那一栏只剩凡人）；
    //   · `arrivedLog` 里那条的 `via` 标成「飞升」，而他是被裂缝吸走的——
    //     名册与后来的统计会把两条通道混成一条。
    // 两处都**不报错**：`sucked` 只是偏小，看起来像「裂缝主要吸凡人」，
    // 而且长测那条 `sucked > 0` 照样绿（凡人顶着）。所以只能靠显式声明修掉。
    // `scripts/_upperlife2probe.mjs:170-179` 早就把意图写成「低阶修士被裂缝
    // 吸上来也算 `sucked`（含凡人与低阶修士）」——**探针的意图对、接线没跟上**，
    // 所以修的是这里，不是改探针。
    const arrived = arriveUpper(world.upper, best, world, { via: 'rift' });
    // `crossed` 现在数「真的进了上界的人」，**修士与凡人都在内**
    // （旧语义里凡人是「失踪」、不计 crossed；用户第 4 条推翻了它）。
    rift.crossed += 1;
    world.riftLog.crossed += 1;
    // D8-E：**成功之后**发跨界事件（凡间那个人从裂缝边消失 ↔ 上界落点出现他）。
    // ⚠️ 到达端坐标取自 `arriveUpper` 的返回值（上界落点），不是凡间坐标——
    //    `arriveUpper` 用 `structuredClone` 另立一份，落点写在那份 copy 上。
    if (arrived) {
      emitRiftCross(world, {
        kind: 'person', fromPlane: 'mortal', toPlane: 'upper',
        fromX, fromY, toX: arrived.x, toY: arrived.y,
        fromKey: `mortal:${fromId}`, subjectId: fromId, targetId: arrived.id,
      });
    }
    return true;
  }

  // ── 3. 第 5 行兜底：半径内一个人都没有 → 凡间地上的无主法宝送进上界 ──
  // 走到这里等价于「`cands` 为空」：候选里凡人（level 0）与修士（level < 40）
  // 都有，`best` 为空即半径内一个人都没有。
  return leakGroundArtifactToUpper(world, rift, r, rng);
}

/**
 * 规格 §4.3 表格**第 5 行**：**凡间地上的法宝 → 上界**。
 *
 * 调用前提：调用方已确认裂缝半径内**没有任何人**（见 `leakToUpper` 第 3 支）。
 *
 * 三件事缺一不可：
 *   · 候选 = `world.artifacts` 里**无主**（`!a.ownerId`）且落在半径内的那些
 *     ——`!a.ownerId` 是承重的：地上的法宝 `ownerId` 恒为 0（`artifacts.js:389`
 *     `toGround` 写），但别处若把一件有主的法宝误推进 `world.artifacts`，
 *     漏它等于「把别人手里的东西搬走」；
 *   · 落点在上界用 `findUpperSpot`（复用 `upperWalkable`）；
 *   · 记账走 **`leaked`**（它是一件「东西」，不是 `crossed` 的「人」）。
 *
 * ⚠️ **找不到落点 / 没有候选 → 这次判定什么也不做**，绝不许把法宝凭空删掉：
 * 先找落点、再动手，顺序不能反（与 `leakFromUpper` 同一条纪律）。
 *
 * @returns {boolean} 是否真的把一件法宝送了上去
 */
function leakGroundArtifactToUpper(world, rift, r, rng) {
  const upper = world.upper;
  if (!upper || !Array.isArray(upper.artifacts)) return false;
  const ground = world.artifacts;
  if (!Array.isArray(ground) || !ground.length) return false;

  const cands = [];
  for (let i = 0; i < ground.length; i += 1) {
    const a = ground[i];
    if (a.ownerId) continue;                       // 有主的不漏
    if (Math.hypot(a.x - rift.x, a.y - rift.y) > r) continue;
    cands.push(a);
  }
  if (!cands.length) return false;

  const pick = cands[Math.floor(rng() * cands.length)];
  // D8-E：离开端坐标 / id 先捕获——下面会把 `pick.id` 重赋成上界号、`pick.x/y`
  // 改写成上界落点，之后再读就只剩「到达端」了。
  const fromX = pick.x; const fromY = pick.y; const fromId = pick.id;
  // 先找落点、再动手：找不到落点就整次放弃，法宝**留在凡间**
  // （不许先摘下来再丢进云海）。
  const spot = findUpperSpot(world, rift, r);
  if (!spot) return false;

  const at = ground.indexOf(pick);
  if (at >= 0) ground.splice(at, 1);

  // ── 跨世界 id：**重发**（不保留原 id、不用限定符）──────────
  // 凡间的 `world.nextArtifactId` 与上界的 `upper.nextArtifactId` **各自从 1 起**
  // （同 `nextEntityId`）。原样搬上去会与上界已有的法宝**撞号**——具体后果在
  // `artifacts.js:374` 的 `claimGroundArtifact(upper, entity, artifactId, ...)`：
  // 它**按 id 线性查找** `upper.artifacts`，撞号时命中**先出现的那一件**，
  // 于是上界修士「捡到的东西」与编年史里写的名字对不上（静默错物，不报错）。
  //
  // 方案：从 `upper.nextArtifactId` 取新 id 并自增——与 `arriveUpper` 把实体 id
  // 抬进 `UPPER_ID_BASE` 段是**同一思路**（跨世界转移必须在目标世界的 id 空间里
  // 重新登记，铁律三）。`upper.nextArtifactId` 由 `forgeArtifact` 维护、且**进存档**
  // （`io/save.js` 的 `serializeUpperWorld` 走 `serializeWorld`，含该键；
  // 读档 `restoreWorldState` 还会扫描现有法宝把游标抬到最大 id 之上），
  // 所以它恒大于上界现有法宝的最大 id。兜底一次以防手工构造的上界。
  //
  // 代价（写明）：原 id 丢失，跨界的「这是同一件东西」只能靠 `name` / `history`
  // 认（本项目铁律三本来就禁止跨世界存 id 引用，所以这不是新增损失）。
  if (!upper.nextArtifactId || upper.nextArtifactId < 1) upper.nextArtifactId = 1;
  pick.id = upper.nextArtifactId;
  upper.nextArtifactId += 1;

  pick.ownerId = 0;               // 保持「无主」（`toGround` 的同款语义）
  pick.ownerName = null;
  // `lostDay` 必须重设成**上界的今天**：上界也跑 `stepArtifacts`
  // （`upperLife.js:156`），地上朽坏判据是 `world.day - a.lostDay >= GROUND_DECAY_YEARS`。
  // 留着凡间那个（或 -1）会让它在上界「一落地就朽掉」或「永远不朽」——
  // 前者正是代理 D 在修的「法宝凭空蒸发」同一类静默坏法。
  pick.lostDay = upper.day || 0;
  pick.x = spot.x;
  pick.y = spot.y;
  upper.artifacts.push(pick);

  // ── 跨位面流出的账（与 `leakFromUpper` 的 `riftIn` 对称）────────
  // 这件法宝离开了凡间，于是凡间 `liveArtifactCount` 少了 1，而它**没有**
  // 碎、也**没有**朽。不记账的话长测的守恒律 `造出 = 在世 + 碎 + 朽` 会
  // 变成「在世虚低」——看起来像「法宝凭空消失」，而那正是本项目最怕的
  // 静默坏法（`inkbox-longrun.mjs` 那段注释写的就是它）。所以补一笔流出账。
  if (world.artifactLog) world.artifactLog.riftOut = (world.artifactLog.riftOut || 0) + 1;

  rift.leaked += 1;
  world.riftLog.leaked += 1;      // ⚠️ 是 `leaked`（一件「东西」），不是 `crossed`
  // D8-E：**成功之后**发跨界事件（凡间地上那件法宝被卷走 ↔ 上界落点出现它）。
  emitRiftCross(world, {
    kind: 'artifact', fromPlane: 'mortal', toPlane: 'upper',
    fromX, fromY, toX: spot.x, toY: spot.y,
    fromKey: `mortal:artifact:${fromId}`, subjectId: fromId, targetId: pick.id,
  });
  return true;
}

// ══════════════════════════════════════════════════════════════════
// 幽冥裂缝的跨界效果（D6-3 工程包 A）
// ══════════════════════════════════════════════════════════════════
//
// D6-2 把幽冥缝整体冻结（在抽签之前 `continue`）。D6-3 解冻它，但**不是**
// 把它接回上界那条链路——那正是 D6-2 要防的「语义错位」。做法是给它一条
// **自己的通道**（`stepNetherRift`）与**自己的流**（`netherRiftRngFor`）：
//
//   · 上界缝：`rng()` → 方向抽签 → `leakFromUpper` / `leakToUpper` → `arriveUpper`
//   · 幽冥缝：`nrng()` → 速率闸门 → `fallIntoNether`（B 包再加「鬼进入凡间」）
//
// 两条链路**在函数边界上分离**：`stepNetherRift` 及其下游够不到
// `arriveUpper` / `leakFromUpper` / `leakToUpper`。这比 D6-2 的
// 「靠一行 `continue` 拦住」更强——`continue` 是一行可以被顺手删掉的守卫，
// 函数边界不是。`scripts/inkbox-three-realms.mjs` 的 F7 用**源码结构**钉它。
//
// ⚠️ 两界的账**分开记**：上界的进出在 `world.riftLog` / `artifactLog`，
// 幽冥方向的在 `nether.popLog.fellIn`。**不扩 `riftLog` 契约**（它是
// `io/save.js` 里逐键显式序列化的 5 键，加键会读档丢失——见 `leakFromUpper`
// 那段注释与 `leakUpperHerb` 的先例）。`rift.crossed` / `riftLog.crossed`
// 的语义仍是「进了**上界**的人」，本包**不动它**。
//
// ⚠️ **C 包（幽冥物品泄漏）在这条通道上加了两处**，都不改上界那条链路：
//   · `fallIntoNether` 把跌入者的法宝**带进幽冥**（原先留在凡间地上）；
//   · 新增 `leakNetherItem`：幽冥物品经缝**漏回凡间**（第三个独立 `if`）。
//   物品的账走 `nether.popLog.items*` 与凡间 `artifactLog.netherIn/Out`，
//   仍然**不扩 `riftLog` 契约**。

/**
 * 把一个人身上的法宝**搬进幽冥物品池**（D6-3 工程包 C）。**零 rng**。
 *
 * 这是「幽冥物品从哪来」的第一条来源（第二条是幽冥自生，见 `netherLife.js`
 * 的 `stepNetherItems`）。东西跟着人落到幽冥的落点，之后可能经缝漏回凡间。
 *
 * ⚠️⚠️ **必须重赋 id**（铁律三）：法宝 id 是**世界内**编号，凡间与幽冥各自
 *    从 1 起。不重赋就会出现「凡间第 5 件」与「幽冥第 5 件」同号——而这些
 *    东西**迟早会漏回凡间**（`leakNetherItem`），那时 `claimGroundArtifact`
 *    按 id 线性查找会命中**先出现的那一件**，而且**不报错**。
 *    ⇒ 跨世界一律重赋（凡→幽、幽→凡两个方向都重赋），两边 id 空间各自自洽。
 *
 * ⚠️ 落点用**人的落点**（`ghost.x/ghost.y`），不是裂缝口——东西是跟人下去的。
 *
 * @returns {number} 搬过去的件数
 */
function moveArtifactsToNether(world, nether, entity, x, y) {
  const list = entity && entity.artifacts;
  if (!list || !list.length) return 0;
  const items = Array.isArray(nether.artifacts) ? nether.artifacts : (nether.artifacts = []);
  if (typeof nether.nextArtifactId !== 'number') nether.nextArtifactId = 1;
  const day = typeof world.day === 'number' ? world.day : 0;
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    a.id = nether.nextArtifactId;      // 重赋：幽冥自己的 id 空间
    nether.nextArtifactId += 1;
    a.ownerId = 0;                     // 无主——他已经是鬼，鬼不持法宝
    a.ownerName = null;
    a.heldSince = day;
    a.lostDay = day;                   // 「躺在地上」的起点（朽坏判据读它）
    a.x = x;
    a.y = y;
    items.push(a);
  }
  const n = list.length;
  entity.artifacts = [];
  return n;
}

/**
 * 幽冥裂缝的跨界效果：**凡 → 幽**。裂缝附近的活人跌入幽冥。
 *
 * 与 `leakToUpper`（凡 → 上）是同一条规格的两个方向，骨架逐条对应：
 * 候选 → 取境界最高 → 落成 → 转移 → 记账。
 *
 * ── 语义 ─────────────────────────────────────────────────
 * 活人从裂缝跌进幽冥，**随即在幽冥成为鬼魂**。为什么不让他「以活人身份
 * 在幽冥游荡」：
 *   1. 幽冥生态（`stepNether`）只处理鬼魂实体——活人在那里永远不会被
 *      任何一步碰到 ⇒ **永久定格**，与「让门后的世界活起来」正相反；
 *   2. 复用 `spawnNetherGhost` 就自动拿到 id 段切断（`NETHER_ID_BASE`）、
 *      落点求解（`landingFor` 的纯哈希）、`ghostBorn` 记账 ⇒
 *      **守恒式 `鬼魂+鬼修 === 生 − 亡 − 逐` 一个字都不用改**。
 *   3. 境界 ≥ 1 的落成**鬼修**、凡人是**鬼魂**——与 `enterNether` 的
 *      `ghost` 路 / `wraith` 路同款（起步 = 游魂，`level` 由 `spawnNetherGhost` 定）。
 *
 * ⚠️ **高修为不进候选**（`level >= RIFT_CROSS_MAX_LEVEL` 只能走飞升）：
 *    与 `leakToUpper` **同一个常量、同一个方向**（`>=` 而不是 `>`）。
 *    ⚠️ 这条判据在 `leakToUpper` 那边被探针 ⑬G 钉着；这边是**新的一条**，
 *    同样必须存在——否则化神修士会被幽冥缝吸走，与「高修为必须走飞升」矛盾。
 *
 * ⚠️ **`world.nether` 不存在时整条跳过**（同 `leakToUpper` 的 `world.upper`）：
 *    没有幽冥可去，把人删掉等于凭空蒸发——宁可这次什么都不做。
 *
 * ⚠️ **先落成、再移除**（顺序承重）：`spawnNetherGhost` 会撞
 *    `LIMITS.maxEntities` 硬顶并返回 `null`。若先把人 `splice` 出凡间、
 *    再发现落不成，这个人就**凭空蒸发**了——函数返回得干干净净，
 *    世界上少一个人，没有任何地方记得。
 *
 * ⚠️ **本函数零 `rng`**：候选是「半径内境界最高的人」，落点由
 *    `spawnNetherGhost` 的纯哈希决定（与 `leakToUpper` 的第 2 支同款）。
 *    判定节奏的抽签在 `stepNetherRift` 里（那是「这一拍有没有动静」，
 *    不是「选谁」）。所以本函数**不消费**幽冥流——`scripts/inkbox-three-realms.mjs`
 *    的 F8 数着这件事。
 *
 * @param {object} world 凡间 world（挂 `.nether` 的那个）
 * @param {object} rift 一条 `targetPlane === 'nether'` 的裂缝
 * @param {number} r 该裂缝当前的半径（格）
 * @returns {boolean} 是否真的送走了一个人
 */
export function fallIntoNether(world, rift, r) {
  const nether = world.nether;
  if (!nether || !Array.isArray(nether.entities)) return false;   // 整条跳过

  // ── 1. 候选：半径内的活人，排除高修为；取境界最高的一个 ──
  //    ⚠️ 用 `>` 而不是 `>=`：同 level 时保留**先遇到的**那个
  //    （顺序稳定、可复现——同 `leakToUpper`）。
  let best = null;
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (!isPerson(e)) continue;
    if ((e.level || 0) >= RIFT_CROSS_MAX_LEVEL) continue;
    if (Math.hypot(e.x - rift.x, e.y - rift.y) > r) continue;
    if (!best || (e.level || 0) > (best.level || 0)) best = e;
  }
  if (!best) return false;

  // ── 2. 落成幽冥实体（**先落成，再移除**，理由见函数头）──
  const ghost = spawnNetherGhost(nether, {
    kind: (best.level || 0) >= 1 ? 'ghostCultivator' : 'ghost',
    // 身份快照：形状的唯一真源 = `reincarnation.js` 的 `ghostSnapshot`。
    // ⚠️ `route` 传 `null`：五路是「**死后**去哪」的分类，而他是
    //    **从裂缝跌进去的**（没走魂路）。硬塞一个五路之一会让名册说谎。
    ghostOf: ghostSnapshot(world, best, null),
    soulId: null,
  });
  if (!ghost) return false;      // 撞实体硬顶：凡间毫发无伤

  // D8-E：离开端坐标 / id 先捕获（`best` 之后会被 `splice` 出凡间实体表）。
  const fromX = best.x; const fromY = best.y; const fromId = best.id;

  // ── 3. 把他身上的法宝**带进幽冥**（D6-3 工程包 C）──
  //    A 包时这里是 `scatterArtifacts`（法宝留在凡间地上）；C 包改成**随身带下去**
  //    ——这正是「幽冥物品从哪来」的第一条来源（第二条是幽冥自生，
  //    `netherLife.js` 的 `stepNetherItems`）。东西跟着人落到幽冥，
  //    之后可能经幽冥缝漏回凡间（`leakNetherItem`）。
  //
  //    ⚠️ **重赋 id**：法宝 id 是**世界内**编号，凡间与幽冥各自从 1 起。
  //    不重赋就会出现「凡间第 5 件」与「幽冥第 5 件」同号，漏回凡间时
  //    `claimGroundArtifact` 按 id 线性查找会命中**先出现的那一件**（铁律三）。
  //    ⇒ 跨世界一律重赋，两边 id 空间各自自洽、永不撞号。
  //    ⚠️ **落点用 `ghost` 的位置**（不是裂缝口）：东西是跟人一起下去的。
  //    ⚠️ 顺序：必须在 `splice` **之前**做完（`best.artifacts` 此刻还在身上）。
  //    ⚠️ 对凡人这一步恒为 no-op（`canHold` 要求 `level >= 1`）——空调用换掉
  //       「level 0 身上一定没法宝」这个必须由别处维持的假设（同 A 包）。
  const carried = moveArtifactsToNether(world, nether, best, ghost.x, ghost.y);
  const at = world.entities.indexOf(best);
  if (at >= 0) world.entities.splice(at, 1);

  // ── 4. 账：**幽冥侧** ──
  //    `fellIn` 是 `ghostBorn` 的子计数（`spawnNetherGhost` 已经涨过那一笔），
  //    所以这里只记「其中有多少是跌进来的」，守恒式不受影响。
  const log = ensureNetherPopLog(nether);
  log.fellIn += 1;
  if (carried > 0) {
    log.itemsFellIn += carried;
    // 池子可能被这一批撑破——走**与自生同一处**的裁剪（否则两处各写一份会分叉）。
    trimNetherItems(nether, log);
    // 凡间侧的对账：这批法宝**离开了凡间**。不记的话凡间的守恒律
    // `造出 + 流入 === 在世 + 碎 + 朽 + 流出` 会因「在世凭空少了几件」而静默失效
    // （同 `leakUpperArtifact` 记 `riftIn` 的理由，只是方向相反）。
    // ⚠️ 与 `riftOut`（凡→**上界**）分列两键：那是上界缝，这是幽冥缝。
    if (world.artifactLog) {
      world.artifactLog.netherOut = (world.artifactLog.netherOut || 0) + carried;
    }
  }

  // ── 5. 编年史 ──
  //    kind 用 `'rift-lost'`（`KIND_TAG` 已配，归 `person`）：它与 `death` /
  //    `ascend` 是**同一组对照事件**——「这个人从世界上消失的第三种方式」。
  //    走 `world.record`，**不自己 push**（自己 push 会绕过编年史滚动窗口）。
  const name = best.name || '一名凡人';
  if (typeof world.record === 'function') {
    world.record(`${name}跌入裂缝（${rift.x},${rift.y}），落入幽冥`, 'rift-lost');
  }
  // D8-E：**成功之后**发跨界事件（凡间那个人消失 ↔ 幽冥落点出现一团鬼影）。
  // 到达端坐标用 `ghost` 的落点（`spawnNetherGhost` 已解出）。
  emitRiftCross(world, {
    kind: 'person', fromPlane: 'mortal', toPlane: 'nether',
    fromX, fromY, toX: ghost.x, toY: ghost.y,
    fromKey: `mortal:${fromId}`, subjectId: fromId, targetId: ghost.id,
  });
  return true;
}

/**
 * 幽冥裂缝的跨界效果：**幽 → 凡**。缝口的鬼魂爬进凡间。
 *
 * 与 `fallIntoNether`（凡 → 幽）是同一条规格的反方向，骨架逐条对应：
 * 候选 → 取一个 → 落成 → 转移 → 记账 → 编年史。
 *
 * ── 语义 ─────────────────────────────────────────────────
 * 鬼**保留自己的身份**从缝口爬出来，在凡间飘荡一段日子再消散。
 * 它**不是**「活人」，也不进 `world.entities`——理由见 `sim/wraiths.js`
 * 的头注释（那里记着完整的事实链：`stepCultivation` 的豁免名单不含 `ghost`，
 * 所以鬼一旦进了凡间实体列表就会被掷觉醒骰、被修炼、被飞升）。
 *
 * ⚠️ **候选取「离缝口最近」的鬼**，而不是「境界最高」：
 *    `fallIntoNether` 那边取境界最高（活人是**被吸**进去的，取强的合理）；
 *    鬼是**自己爬**出来的，能爬到缝口的自然是最靠边的那只。取「境界最高」
 *    会让鬼帝永远第一个冒头（幽冥里鬼帝很稀少，却次次是它），读起来像 bug。
 *    ⚠️ 平手用 `<` 保留**先遇到的** ⇒ 顺序稳定、可复现（同 `leakToUpper`）。
 *
 * ⚠️ **先落成、再移除**（顺序承重，同 `fallIntoNether`）：`spawnWraith` 会撞
 *    凡间鬼影上限并返回 `null`。若先把鬼从幽冥 `splice` 掉、再发现落不成，
 *    这只鬼就**凭空蒸发**了——函数返回得干干净净，两个世界都少一只，
 *    没有任何地方记得。
 *
 * ⚠️ **本函数零 `rng`**：判定节奏的抽签在 `stepNetherRift` 里，
 *    「谁爬出来」由**空间距离**决定（纯算术）。所以本函数不消费任何流——
 *    回归脚本 F9 数着这件事。
 *
 * @param {object} world 凡间 world（挂 `.nether` 的那个）
 * @param {object} rift 一条 `targetPlane === 'nether'` 的裂缝
 * @param {number} r 该裂缝当前的半径（格）
 * @returns {boolean} 是否真的爬出来了一只
 */
export function climbOutToMortal(world, rift, r) {
  const nether = world.nether;
  if (!nether || !Array.isArray(nether.entities)) return false;   // 没幽冥可来

  // ── 1. 候选：幽冥里离缝口**最近**的鬼魂（且要在半径内）──
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < nether.entities.length; i += 1) {
    const e = nether.entities[i];
    if (e.sp !== SPECIES.GHOST) continue;
    const d = Math.hypot(e.x - rift.x, e.y - rift.y);
    if (d > r) continue;
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best) return false;

  // ── 2. 先落成凡间那一份 ──
  //    落点 = 缝口。缝本身就开在**凡间可站格**上（`openRifts` 的位置判定
  //    要求「凡间格可通行」），所以这里不需要另找落点——多一套落点判据
  //    就是多一个会与 `openRifts` 分叉的真相。
  const w = spawnWraith(world, {
    // ⚠️ **把幽冥侧的 id 带过去**（铁律三）：它是「从幽冥来的那一只」，
    //    重赋一个凡间段的号会抹掉这个来处，而且埋下「同一只鬼两个号」的隐患。
    id: best.id,
    x: rift.x + 0.5,
    y: rift.y + 0.5,
    level: best.level || 0,
    soulKind: best.soulKind,
    ghostOf: best.ghostOf || null,
    // 名字跟着走：没有 `ghostOf` 的普通鬼魂靠这一项保住自己的名字，
    // 否则 `spawnWraith` 会兜成「孤魂」，而编年史写的是它原来的名字——
    // 同一只鬼在两个地方叫两个名字（不报错，只是读起来像 bug）。
    name: best.name || null,
    fromRiftId: rift.id,
    climbedDay: world.day || 0,
  });
  if (!w) return false;      // 撞凡间鬼影上限：**幽冥那一份留着**（绝不凭空蒸发）

  // D8-E：离开端坐标 / id 先捕获（`best` 随后被 `splice` 出幽冥实体表）。
  const fromX = best.x; const fromY = best.y; const fromId = best.id;

  // ── 3. 再从幽冥移除 ──
  const at = nether.entities.indexOf(best);
  if (at >= 0) nether.entities.splice(at, 1);

  // ── 4. 幽冥侧的账：**第三条离开路径** ──
  //    `climbedOut` 独立于 `ghostDied`（消散）与 `evicted`（上限逐出）。
  //    ⚠️ 不并进 `ghostDied`：那是「死了」，而它是「走了」——把「走了」记成
  //    「死了」与 E 包拒绝把「被逐出」并进「亡」是同一条理由（`逐` 独立成键）。
  //    ⇒ 幽冥守恒式随之扩成 `鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出`。
  ensureNetherPopLog(nether).climbedOut += 1;

  // ── 5. 编年史 ──
  //    kind 用 `'rift-out'`（`KIND_TAG` 已配，归 `person`）：它与 `'rift-lost'`
  //    是**同一组对照事件**的两半——「一个人从裂缝里消失」与「一只鬼从裂缝里
  //    出来」。两者都落在**某一个具体的存在**身上，所以同归 `person`。
  //    走 `world.record`，**不自己 push**（自己 push 会绕过编年史滚动窗口）。
  const name = best.name || '一只孤魂';
  if (typeof world.record === 'function') {
    world.record(`${name}自裂缝（${rift.x},${rift.y}）爬入凡间`, 'rift-out');
  }
  // D8-E：**成功之后**发跨界事件（幽冥那团鬼影消失 ↔ 凡间缝口出现一只鬼）。
  // 到达端坐标用 `w`（`spawnWraith` 已把它放在缝口 `rift.x/y + 0.5`）。
  emitRiftCross(world, {
    kind: 'ghost', fromPlane: 'nether', toPlane: 'mortal',
    fromX, fromY, toX: w.x, toY: w.y,
    fromKey: `nether:${fromId}`, subjectId: fromId, targetId: w.id,
  });
  return true;
}

/**
 * 幽冥裂缝的跨界效果：**幽 → 凡**（物品）。幽冥物品经缝漏进凡间地上。
 *
 * 与 `climbOutToMortal`（幽 → 凡 的鬼）是同一条规格的**物品版**，骨架逐条对应；
 * 与 `leakUpperArtifact`（上 → 下的法宝）是**镜像**：那个把上界的无主法宝漏到
 * 凡间地上，这个把幽冥的物品漏到凡间地上。
 *
 * ── 与 `fallIntoNether` / `climbOutToMortal` **同一条纪律：本函数零 rng** ──
 * 「漏哪一件」不抽签，取**离缝口最近**的一件（平手保留先遇到的）——与
 * `climbOutToMortal` 取「最近的鬼」同款。判定节奏的抽签在 `stepNetherRift`
 * 里（「这一拍有没有动静」，不是「漏哪件」）。所以本函数**不消费**任何流，
 * `netherItemRngFor` 每拍恰好被抽一次（`scripts/inkbox-three-realms.mjs` 的
 * F10 数着这件事）。
 *
 * ── 顺序（承重）────────────────────────────────────────────
 * **先找落点、再动手**：找不到凡间可站格就整次放弃，物品**留在幽冥**
 * （同 `leakUpperArtifact` / `leakUpperHerb` 的纪律——不许「先摘下来再丢进水里」）。
 * 落点找到后**先落成凡间那一份、再从幽冥移除**（同 `climbOutToMortal`）。
 *
 * ── id 重赋（铁律三）──────────────────────────────────────
 * 幽冥物品的 id 是**幽冥自己的编号**。落到凡间时必须**重赋凡间 id**
 * （`world.nextArtifactId`），否则「幽冥第 5 件」与「凡间第 5 件」同号，
 * 日后 `claimGroundArtifact` 按 id 线性查找会命中**先出现的那一件**（不报错）。
 *
 * @param {object} world 凡间 world（挂 `.nether` 的那个）
 * @param {object} rift 一条 `targetPlane === 'nether'` 的裂缝
 * @param {number} r 该裂缝当前的半径（格）
 * @returns {boolean} 是否真的漏出了一件
 */
export function leakNetherItem(world, rift, r) {
  const nether = world.nether;
  if (!nether || !Array.isArray(nether.artifacts) || !nether.artifacts.length) return false;

  // ── 1. 候选：半径内**离缝口最近**的幽冥物品（三界同尺寸、坐标对位）──
  //    ⚠️ 用 `<` 而不是 `<=`：同距离时保留**先遇到的**（顺序稳定、可复现——
  //    同 `climbOutToMortal` / `fallIntoNether`）。
  let pick = null;
  let bestD = Infinity;
  for (let i = 0; i < nether.artifacts.length; i += 1) {
    const a = nether.artifacts[i];
    const d = Math.hypot((a.x || 0) - rift.x, (a.y || 0) - rift.y);
    if (d > r) continue;
    if (d < bestD) { bestD = d; pick = a; }
  }
  if (!pick) return false;

  // ── 2. 落点：先找凡间可站格（找不到就整次放弃，物品留在幽冥）──
  const spot = findMortalSpot(world, rift, r);
  if (!spot) return false;

  // ── 3. 先落成（重赋凡间 id）→ 再移除 ──
  //    重赋必须在 `toGround` **之前**：`toGround` 会把它推进 `world.artifacts`，
  //    那时 id 已经是凡间的了。
  // D8-E：离开端坐标 / id 先捕获——`toGround` 会把 `pick.x/y` 改写成落点、
  // `pick.id` 立刻被重赋成凡间号，之后再读就只剩「到达端」了。
  const fromX = pick.x; const fromY = pick.y; const fromId = pick.id;
  pick.id = world.nextArtifactId || 1;
  world.nextArtifactId = pick.id + 1;
  toGround(world, pick, spot.x, spot.y);
  const at = nether.artifacts.indexOf(pick);
  if (at >= 0) nether.artifacts.splice(at, 1);

  // ── 4. 账：**两端** ──
  //    · 幽冥侧：`itemsLeakedOut`（第四条物品流水，独立于自生 / 跌入 / 朽坏）；
  //    · 凡间侧：`artifactLog.netherIn`（幽冥→凡间的流入）。
  //      不记的话凡间的守恒律 `造出 + 流入 === 在世 + 碎 + 朽 + 流出` 会因
  //      「在世凭空多了一件」而静默失效（同 `leakUpperArtifact` 记 `riftIn`）。
  //      ⚠️ 与 `riftIn`（**上界**→凡间）分列两键。
  ensureNetherPopLog(nether).itemsLeakedOut += 1;
  if (world.artifactLog) {
    world.artifactLog.netherIn = (world.artifactLog.netherIn || 0) + 1;
  }

  // ── 5. 编年史 ──
  //    kind 用 `'rift-in'`（`KIND_TAG` 归 `cultivation`，与 `artifact` 同组）：
  //    它是**一件东西**跨界，不是某个人——所以不与 `rift-lost` / `rift-out`
  //    （那两个都落在具体的**存在**身上、归 `person`）混为一谈。
  if (typeof world.record === 'function') {
    world.record(`${pick.name}自裂缝（${rift.x},${rift.y}）落入凡间`, 'rift-in');
  }
  // D8-E：**成功之后**发跨界事件（幽冥那件物品消失 ↔ 凡间地上落出一个小光点）。
  emitRiftCross(world, {
    kind: 'artifact', fromPlane: 'nether', toPlane: 'mortal',
    fromX, fromY, toX: spot.x, toY: spot.y,
    fromKey: `nether:artifact:${fromId}`, subjectId: fromId, targetId: pick.id,
  });
  return true;
}

/**
 * 幽冥裂缝的一次判定（D6-3 工程包 A；工程包 B 加第二支；工程包 C 加第三支）。
 *
 * ⚠️ 与上界那条链路**物理分离**（见本节的段头注释）：本函数只碰
 *    「凡间 ↔ 幽冥」，**绝不**调用 `arriveUpper` / `leakFromUpper` / `leakToUpper`。
 *
 * ⚠️ 「有没有动静」抽的是 `netherRiftRngFor`（**第三条流**），不是 `riftRngFor`：
 *    否则「玩家多开一条幽冥缝」会移动**上界缝**的抽签序列
 *    （同一拍里谁先抽、抽了几下都变了）——既有标定与长测读数全部作废，
 *    且不报错。这正是铁律一要防的事，只是规模小一号。
 *
 * ── 两个效果**各抽各的签**（D6-3 B 的判决）────────────────────
 * A 包只有一支（人跌进去），B 包加了反方向那一支（鬼爬出来）。这里**刻意
 * 不**做成「先判方向、再判对象」（上界 `leakFromUpper` / `leakToUpper` 是
 * 那么写的），理由有两条：
 *
 *   1. **语义**：上界那两个方向是**同一次泄漏**的去向（互斥：要么上→下、
 *      要么下→上）；而「人跌进去」与「鬼爬出来」是**两个独立现象**，
 *      可以同一拍都发生（门两边同时有人进出）。做成互斥会凭空造出一条
 *      「这一拍只准发生一件事」的规则。
 *   2. **不扰动 A 包已标定的东西**：共用一条流去判方向，会让「人跌进去」的
 *      概率**减半**（`LEAK_CHANCE_PER_PERIOD` 被两个方向分掉），而那个概率
 *      是 A 包标定过、回归脚本 F8 端到端量过的。各抽各的签 ⇒ `nrng` 的
 *      消费次数与序列**逐字不变**，A 包的一切原封不动。
 *
 * ⚠️ 第二支走**第四条独立流** `mortalHauntRngFor`（`0x4841554e` = `'HAUN'`），
 *    与 `nrng` 无关 ⇒ 「鬼爬出来的时机」不受「人跌进去抽了几次」影响。
 *
 * ⚠️ 速率闸门与上界**同频**（`LEAK_CHANCE_PER_PERIOD`）但**各抽各的流**：
 *    两界的判定次数从此互不影响，所以「幽冥缝开了几条」不会改变
 *    「上界缝漏了几次」。
 *
 * ⚠️ **本函数共四支**（D6-3 A 加第一支 · B 加第二支 · C 加第三支 · D 加第四支）：
 *    人跌入 / 鬼爬出 / 物品漏出 / 鬼修夺舍（或附身）。四支**各抽各的流**
 *    （`nrng` / `hrng` / `irng` / `prng`），任一支的消费次数都不影响其余三支。
 *    第四支的效果函数 `crossPlanePossession`（`possession.js`）**零 rng**：
 *    「成不成」走确定性哈希（幽冥没有流可挂），所以本函数仍是唯一抽签处。
 *
 * @param {object} world 凡间 world
 * @param {object} rift 一条 `targetPlane === 'nether'` 的裂缝
 * @param {number} r 该裂缝当前的半径（格）
 * @param {() => number} nrng 幽冥裂缝独立流（判「这一拍有没有动静」）
 * @param {() => number} hrng 凡间鬼影独立流（判「这一拍有没有鬼爬出来」）
 * @param {() => number} irng 幽冥物品独立流（判「这一拍有没有物品漏出」，D6-3 C）
 * @param {() => number} prng 跨位面夺舍独立流（判「这一拍有没有鬼修夺舍 / 附身」，D6-3 D）
 * @returns {void}
 */
function stepNetherRift(world, rift, r, nrng, hrng, irng, prng) {
  // ⚠️ **四个 `if` 都要跑**，不能写成 `if (...) {...} else if (...) {...}`：
  //    那样后面判定的抽签会被前面条件吃掉，`hrng` / `irng` / `prng` 的消费次数
  //    取决于 `nrng` 的结果 ⇒ 四条流重新耦合，「互不干扰」当场失效（而且不报错）。
  //    A 包加第一支、B 包加第二支、C 包加第三支、D 包加第四支——每一支各抽各的签。
  if (nrng() < LEAK_CHANCE_PER_PERIOD) fallIntoNether(world, rift, r);
  if (hrng() < WRAITH_CLIMB_CHANCE_PER_PERIOD) climbOutToMortal(world, rift, r);
  if (irng() < NETHER_ITEM_LEAK_CHANCE_PER_PERIOD) leakNetherItem(world, rift, r);
  // D6-3 工程包 D：鬼修夺舍 / 附身凡间活人（效果函数零 rng，见 `possession.js`）。
  if (prng() < POSSESS_CHANCE_PER_PERIOD) crossPlanePossession(world, rift, r);
}

/**
 * 一次判定 pass：推进年龄 + 扩张 / 闭合 + 漏物。
 *
 * **由调用方按 `RIFT_PERIOD_DAYS` 的节奏调，不要每帧调。**
 * 60 FPS 下每帧抽签 = 每秒抽 60 次，漏物会爆炸（规格 §4.3 第 1 条）。
 *
 * ⚠️ **本函数现在承担「视界冻结」的一半（契约 C1.1）**：
 * 每次调用**先**给所有活跃裂缝 `age += RIFT_PERIOD_DAYS`，**再**判闭合与漏物。
 * 「视界关着时不演化」由**调用方**保证——`main.js` 只在视界开启时累加
 * `riftAccum`，关窗期间根本不会调到本函数。所以本模块**不需要**知道
 * 「视界开没开」：它的语义就是「被调一次 = 视界开着过了 30 天」。
 * 这样切开的好处是：`stepRifts` 仍是纯粹的「推进一个周期」，
 * 长测脚本可以按自己的节奏直接调它，不必伪造 UI 状态。
 *
 * ⚠️ 年龄按**常数** `RIFT_PERIOD_DAYS` 推进，不按 `world.day` 的差值——
 * 后者会让「一帧跑了 200 天」的极端倍速把 age 一次性推很多，
 * 而本模块的周期语义是「每次调用 = 一个 30 日周期」。常数推进也让
 * 曲线与帧率 / 倍速**完全无关**（同一条缝在快进与慢放下的寿命一样）。
 *
 * ⚠️⚠️ **闭合必须加 `age >= TAU_GROW` 前置条件，这是本模块最容易踩的陷阱**：
 * `grow = 1 - exp(-t / TAU_GROW)` 在 `t` 很小时接近 0，所以裂缝刚开的那几天
 * `radius` **天然小于 `RIFT_CLOSE_RADIUS`（0.3）**。若直接判 `r < 0.3`，
 * **每条裂缝都会在开启后的第一次判定时立刻闭合**——账本上
 * `opened` 与 `closed` 同步增长、`leaked`/`crossed` 永远是 0，
 * 系统看起来「跑过了但什么都没发生」。这个坏法不报错、不抛异常，
 * 只是把「扩张期」整个吃掉。探针第 6 条就是钉这个的。
 *
 * ⚠️ **幽冥裂缝走自己的通道**（D6-3 工程包 A 取代了 D6-2 工程包 B4 的冻结）：
 * nether 裂缝照常走第 0/1 步（推进年龄 + 扩张 / 闭合），第 3 步则分流到
 * `stepNetherRift`（消费**自己的**流 `nrng`），**不**走下面那条上界链路。
 * 于是本函数的行为差异**只按 `rift.targetPlane` 分流**，不再有第三种情形。
 *
 * @param {object} world 凡间 world
 * @returns {void}
 */
export function stepRifts(world) {
  ensureRiftState(world);
  const rifts = world.rifts;
  if (!rifts.length) return;
  const log = world.riftLog;
  const day = world.day || 0;
  const rng = riftRngFor(world);
  // 幽冥缝的**独立**流（D6-3 工程包 A）。⚠️ 与 `rng` 是两条流，互不影响——
  // 这正是「玩家多开一条幽冥缝，不会移动上界缝的抽签序列」的兑现方式。
  // 惰性建立（`netherRiftRngFor` 内部按需 `mulberry32`）；没有幽冥缝时
  // 一次都不抽，所以对纯上界世界零影响。
  const nrng = netherRiftRngFor(world);
  // D6-3 工程包 B：凡间鬼影的**第四条**独立流（`'HAUN'`）。与上面那条一样
  // **惰性建立、取实例不抽签** ⇒ 纯上界世界建了它也不改变任何世界线。
  // 只在「这一拍有幽冥缝」时才真的被抽（见第 3 步的分流点）。
  const hrng = mortalHauntRngFor(world);
  // D6-3 工程包 C：幽冥物品泄漏的**第七条**独立流（`'NITM'`）。同样
  // **惰性建立、取实例不抽签** ⇒ 纯上界世界建了它也不改变任何世界线。
  // 只在「这一拍有幽冥缝」时才真的被抽（见第 3 步的分流点）。
  const irng = netherItemRngFor(world);
  // D6-3 工程包 D：跨位面夺舍的**第八条**独立流（`'NPSX'`）。同样
  // **惰性建立、取实例不抽签** ⇒ 纯上界世界建了它也不改变任何世界线。
  // 只在「这一拍有幽冥缝」时才真的被抽（见第 3 步的分流点）。
  const prng = netherPossessRngFor(world);

  // ── 0. 推进年龄（契约 C1.1）──────────────────────────────
  // 每次调用 = 视界开着过了 RIFT_PERIOD_DAYS 天。**必须在判闭合之前**：
  // `age` 就是下面曲线的自变量。只推活跃的缝——已闭合的缝年龄不再有意义，
  // 推它只会让 `closedDay` 之后还继续涨（长测若打印会看着像 bug）。
  for (let i = 0; i < rifts.length; i += 1) {
    const rift = rifts[i];
    if (rift.closedDay >= 0) continue;
    rift.age = (rift.age || 0) + RIFT_PERIOD_DAYS;
  }

  // ── 1. 扩张 / 闭合 ───────────────────────────────────────
  for (let i = 0; i < rifts.length; i += 1) {
    const rift = rifts[i];
    if (rift.closedDay >= 0) continue;             // 已闭合的不再判
    const r = riftRadiusAt(rift);
    // 前置条件 `age >= TAU_GROW` 的理由见函数头（扩张期半径天然很小）。
    if (rift.age >= TAU_GROW && r < RIFT_CLOSE_RADIUS) {
      rift.closedDay = day;
      log.closed += 1;
    }
  }

  // ── 2. 剔除已闭合（`filter` 重建，不原地 splice 乱索引）──
  const kept = [];
  for (let i = 0; i < rifts.length; i += 1) {
    if (rifts[i].closedDay < 0) kept.push(rifts[i]);
  }
  world.rifts = kept;

  // ── 3. 跨界：每条仍活跃的裂缝独立判 ──────────────────────
  for (let i = 0; i < kept.length; i += 1) {
    const rift = kept[i];
    const r = riftRadiusAt(rift);
    // ⚠️⚠️ **分流，不是冻结**（D6-3 工程包 A 取代了 D6-2 的 B4）：
    //     幽冥缝走**自己的**通道 `stepNetherRift`，消费**自己的**流 `nrng`。
    //
    //     上界那条链路（`rng()` → 方向抽签 → `leakFromUpper` / `leakToUpper`
    //     → `arriveUpper`）对 nether 裂缝**仍然在结构上不可达**——但保证方式
    //     换了：D6-2 靠的是「在抽签之前 `continue`」（**一行可以被顺手删掉**的
    //     守卫），现在靠的是**函数边界**（`stepNetherRift` 及其下游够不到那些
    //     函数）。`scripts/inkbox-three-realms.mjs` 的 F7 用**源码结构**钉后者。
    //
    //     为什么不能让幽冥缝接回上界链路：`viewNether` 与 `viewUpper` 共用
    //     同一个 `openRifts`，而那条链路整体是**上界语义**。接回去的话，
    //     玩家打开幽冥视界、划出裂缝，那条缝会去执行凡间 ↔ **上界**的
    //     漏物 / 吸人——语义完全错位，而且**不报错**
    //     （`riftLog.leaked` 照涨，看起来像「幽冥也会漏东西」）。
    //
    //     ⚠️ 判据仍用 `=== 'nether'` 而不是 `!== 'upper'`：**老档 / 手工构造的
    //     裂缝没有 `targetPlane` 这个键**（`undefined`），它们的历史语义就是
    //     上界裂缝，必须继续走上界逻辑。`!== 'upper'` 会把它们全部静默改道到
    //     幽冥通道——一次「读旧档后上界缝不再漏物」的静默行为变更。
    //
    //     ⚠️ 第 0/1 步的「推进年龄 + 扩张 / 闭合」对 nether 裂缝**照常执行**
    //     （那两步在分流点之前）——一条缝该老还是会老、该闭还是会闭。
    if (rift.targetPlane === 'nether') {
      stepNetherRift(world, rift, r, nrng, hrng, irng, prng);
      continue;
    }
    if (!(rng() < LEAK_CHANCE_PER_PERIOD)) continue;
    // ⚠️ **先判方向，再判对象**（规格 §4.3 第 4 条）：一次判定要么上→下、
    // 要么下→上，**不是两次独立抽签**——否则一次会同时漏两样，量级翻倍。
    const upToDown = rng() < 0.5;
    if (upToDown) leakFromUpper(world, rift, r, rng);
    else leakToUpper(world, rift, r, rng);
  }
}

/**
 * 读数。
 *
 * ⚠️ **账本是唯一可靠来源**：单条裂缝闭合后会被 `stepRifts` 从 `world.rifts`
 * 剔除，于是「从来没裂过缝」与「裂过很多、全闭合了」在 `world.rifts.length`
 * 上长得一模一样（规格 §4.5）。所以除了 `active` 是快照，其余五个数
 * **一律取 `world.riftLog`**。
 *
 * 对 `world.rifts` / `world.riftLog` 缺失做兜底（返回 0 而不是抛错）：
 * 测试会造「单世界」——那种 world 没有裂缝系统，读数必须是 0 而不是崩。
 *
 * @returns {{active:number, opened:number, closed:number, leaked:number, crossed:number, lost:number}}
 */
export function riftStats(world) {
  const rifts = world && Array.isArray(world.rifts) ? world.rifts : [];
  const log = (world && world.riftLog) || {};
  return {
    active: rifts.length,
    opened: log.opened || 0,
    closed: log.closed || 0,
    leaked: log.leaked || 0,
    crossed: log.crossed || 0,
    lost: log.lost || 0,
  };
}
