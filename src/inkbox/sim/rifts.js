// 水墨沙盒 · 空间裂缝（阶段三：三界并存 · 块四）
//
// 规格：`reports/design/upperworld.md` §4（第 1172-1313 行）。
//
// 用户原话：「上界视界和下界的边缘会因此产生轻微的空间裂缝」。
// 所以裂缝**不是**自然发生的随机事件，而是**玩家开视界这个动作的副作用**——
// 划选视界时，在划选矩形的**四条边**（两界的接缝）上裂开。
// 内部是「看到的上界」，边缘才是「两界的缝」，所以不开在内部。
//
// 本模块只做四件事，且只做这四件：
//   1. `openRifts`  划选 → 在四边开缝（生成）
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

import { mulberry32 } from '../core/noise.js';
import { SPECIES } from '../core/config.js';
// ⚠️ `RIFT_CROSS_MAX_LEVEL`（= 40，化神期起点）由**飞升代理**在
// `core/cultivation.js` 里创建，本模块只 import、**不自己定义**。
// 语义（用户第 3 条）：裂隙处无限制、谁都有概率跨界，但「高修为修士必须走飞升」——
// 所以能走裂缝的只有 `level < RIFT_CROSS_MAX_LEVEL` 的人（含凡人 level 0）。
// 这个 import 不存在时本模块会报 `SyntaxError`——那是**预期的**，
// 两个代理并行落地；飞升代理完成后即通（见交付报告）。
import { RIFT_CROSS_MAX_LEVEL } from '../core/cultivation.js';
import { arriveUpper, upperWalkable } from '../world/planes.js';
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

/** 裂缝随机流的派生键：ASCII 'rift'（0x72 0x69 0x66 0x74）。 */
export const RIFT_SEED_KEY = 0x72696674;

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
 * 在划选矩形的**四条边**上开裂缝。
 *
 * 规则（规格 §4.1 + §4.3 判定规则）：
 *   · 矩形先归一化（`x0<=x1`、`y0<=y1`）并 clamp 到地图内；
 *   · 裂缝数 = `clamp(1, 4, round(周长 / 120))`，周长 = `2 * (cols + rows)`；
 *   · 候选格 = 四条边上的所有格（**不含内部**），角格去重；
 *   · 位置过滤：凡间 `world.isWalkable` 为真 **且** 上界对应格
 *     `upperWalkable` 为真——否则会开出「一条在雪山之巅、谁都够不着的裂缝」；
 *   · 去重：已有活跃裂缝的格不再开；
 *   · 选格走 `riftRngFor(world)`，Fisher-Yates 洗牌取前 N（**无偏、抽签数确定**）。
 *
 * ⚠️ **`world.upper` 可能不存在**（测试造的单世界、或阶段一之前的档）。
 * 那时**跳过位置过滤里的上界那一半**，只判凡间。这不是「放行」：
 * 上界不存在时，`stepRifts` 的整个方向 B 也会被跳过（见那里的注释），
 * 于是不会出现「只有一半世界能站人」的矛盾。
 *
 * ⚠️ **为什么用洗牌而不是「反复重试直到命中」**：重试的抽签次数取决于
 * 候选格的随机命中率，是**不定量**的——同一个 world 上，一次 `openRifts`
 * 之后流的位置不可预测，于是「同一 seed 的两条世界线」在第二次开缝时
 * 就会分叉。洗牌的抽签数只取决于候选数组长度（确定的），流位置可预测。
 *
 * @param {object} world 凡间 world（需要 `w`/`h`/`size`/`isWalkable`；可选 `upper`）
 * @param {{x0:number,y0:number,x1:number,y1:number}} rect 划选矩形（格坐标）
 * @returns {{opened:number, refused:boolean, reason:string|null}}
 */
export function openRifts(world, rect) {
  ensureRiftState(world);
  const { w, h } = world;

  // ── 1. 归一化 + clamp ─────────────────────────────────────
  const rx0 = Math.min(rect.x0, rect.x1) | 0;
  const rx1 = Math.max(rect.x0, rect.x1) | 0;
  const ry0 = Math.min(rect.y0, rect.y1) | 0;
  const ry1 = Math.max(rect.y0, rect.y1) | 0;
  const x0 = clamp(0, w - 1, rx0);
  const x1 = clamp(0, w - 1, rx1);
  const y0 = clamp(0, h - 1, ry0);
  const y1 = clamp(0, h - 1, ry1);

  // ── 2. 上限：活跃裂缝够了就拒绝 ───────────────────────────
  // 数「活跃」（`closedDay < 0`）而不是 `world.rifts.length`：
  // `stepRifts` 会剔除闭合的，但**调用方不一定刚调过** `stepRifts`——
  // 若数组里还留着已闭合的记录，按 `.length` 数会提前触顶（少开缝，不报错）。
  let activeCount = 0;
  for (let i = 0; i < world.rifts.length; i += 1) {
    if (world.rifts[i].closedDay < 0) activeCount += 1;
  }
  if (activeCount >= RIFT_MAX_ACTIVE) {
    return { opened: 0, refused: true, reason: 'active-cap' };
  }

  // ── 3. 候选格：四条边（不含内部），角格去重 ───────────────
  const cols = x1 - x0 + 1;
  const rows = y1 - y0 + 1;
  const cells = [];
  const seen = new Set();
  const pushCell = (x, y) => {
    const i = y * w + x;
    if (seen.has(i)) return;              // 角格被上下边与左右边各算一次
    seen.add(i);
    cells.push({ x, y, i });
  };
  for (let x = x0; x <= x1; x += 1) { pushCell(x, y0); pushCell(x, y1); }
  for (let y = y0 + 1; y <= y1 - 1; y += 1) { pushCell(x0, y); pushCell(x1, y); }

  // ── 4. 位置过滤 + 去重（已有活跃裂缝的格）─────────────────
  const upper = world.upper;
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
    // `upper` 缺省 → 只判凡间（理由见函数头注释）
    if (upper && !upperWalkable(upper, c.i)) continue;
    sites.push(c);
  }

  // ── 5. 洗牌取前 N ────────────────────────────────────────
  const perimeter = 2 * (cols + rows);
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
    });
    world.nextRiftId += 1;
    world.riftLog.opened += 1;
    // ── 开缝进大事账本 ────────────────────────────────────
    // 裂缝是**玩家亲手划出来的**、而且会持续漏物 / 吸人上界 / 自己闭合，
    // 所以它是「我刚才那一笔到底改了什么」最直接的回执。
    // ⚠️ 不调 `rng()`：这里用的是已经洗好的 `sites`，加一行不会移动随机流。
    world.milestone(
      `${placeOf(world, c.x, c.y)}的天地裂开一道缝隙，灵气自其中泄出。`,
      'rift',
    );
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
 * `io/save.js` 的 `riftLog` **5 键契约**与 `rifts[]` **9 字段契约**一个字都
 * 不用动，五支按旧契约写断言的脚本一条都不会红。两个来源的**分离读数**
 * 靠已有账本现算：
 * `灵植件数 = riftLog.leaked − artifactLog.riftIn − artifactLog.riftOut`
 * （`riftIn` 只在法宝「上→下」时自增、`riftOut` 只在凡间法宝「下→上」时自增）。
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
    arriveUpper(world.upper, best, world, { via: 'rift' });
    // `crossed` 现在数「真的进了上界的人」，**修士与凡人都在内**
    // （旧语义里凡人是「失踪」、不计 crossed；用户第 4 条推翻了它）。
    rift.crossed += 1;
    world.riftLog.crossed += 1;
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
  return true;
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

  // ── 3. 漏物：每条仍活跃的裂缝独立判 ──────────────────────
  for (let i = 0; i < kept.length; i += 1) {
    const rift = kept[i];
    const r = riftRadiusAt(rift);
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
