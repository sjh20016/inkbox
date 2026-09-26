// 水墨沙盒 · 世界推进的**唯一入口**（全部「游戏日驱动的时钟」）
//
// ───────────────────────────────────────────────────────────────────────
// 为什么要有这个文件（BACKLOG #13）
// ───────────────────────────────────────────────────────────────────────
//
// 在此之前，「世界怎么走」这件事有**两份手抄的真相**：
//   · `main.js` 的 `update()` —— rAF 循环，玩家真正走的那条路；
//   · 各测试脚本自己的推进循环（`w.day += 30; life.step(30)`）。
// 两份之间没有任何**结构上**的绑定，于是每新增一个时钟，就要记得在每一份里
// 都补一行——靠记性。这个模式已经踩过两次：
//   · `scripts/inkbox-longrun.mjs:105` 记着「最初这一支只调 `life.step(days)`，
//     把植被与野火两套时钟漏掉了」；
//   · 2026-09-23 新增 `stepNether`（幽冥鬼魂）时**又漏了同一个地方**——
//     长测与 playtest 里幽冥四步（对账 / 到期 / 积怨 / 逐出）一次都不跑，
//     实体只增不减。实测：playtest 跑 60 年，面板印「幽冥 鬼魂 **186**」，
//     而同世界 `soulLog.linger` 只有 **60**（186 是 60 年累计生成、一只没清）；
//     对照 `_ghostsouls.mjs`（它**显式**调了 `stepNether`）200 年实体只有 **188**。
//
// 本文件的立场：**「世界怎么走」只能有一处定义**。谁要推进世界，就调
// `advanceWorld()`，**别再自己抄一遍时钟列表**。新增时钟时只改这里一处，
// 所有调用方（真实游戏 + 全部测试）自动跟上——这才是「结构上的保证」，
// 而不是靠注释提醒。
//
// ⚠️ **本模块只收「游戏日驱动」的时钟**。`main.js` 的 `update()` 里还有两个
//    **按真实时间**（`dt`）驱动的：`stepHydrology`（水文）与 `decayOverlay`（衰减）。
//    它们的注释明写「无论时间倍速多快，地貌演化都保持稳定步长」——
//    语义上不属于「游戏日」，**故意不收进来**。别顺手把它们也搬进来。
//
// ───────────────────────────────────────────────────────────────────────
// 铁律一（随机流）在这里的形态
// ───────────────────────────────────────────────────────────────────────
//
// 本模块**自己不抽任何签**，它只是把已有的时钟按顺序调一遍：
//   · `life.step(days)`        —— 抽 `Life.rng`（凡间主随机流，调用方持有）
//   · `upperLife.step(days)`   —— 抽上界自己从 `upper.seed` 派生的独立流
//   · `stepNether(world, d)`   —— **零 rng**（见 `netherLife.js` 头注释）
//   · `stepRifts(world)`       —— 抽 `rifts.js` 的独立流
//   · `stepMortalWraiths`      —— 抽 `wraiths.js` 的独立流（`0x4841554e`）
//   · `stepVegetation` / `stepFire` —— 抽**调用方传进来的** `deps.rng`
// 所以「世界线会不会漂」取决于调用方传什么，本模块**不改变**这件事。
//
// ⚠️ 正因为如此，`deps.rng` 是**可选**的：不传就**跳过** eco/fire 两套时钟
//    （而不是偷偷拿 `Math.random` 顶上）。测试若本来就不跑这两套，硬跑会让
//    世界线漂走，而那是**不可逆**的（既有长测标定当场作废）。

import { TIME } from '../core/config.js';
import { stepNether } from './netherLife.js';
import { stepRifts, RIFT_PERIOD_DAYS } from './rifts.js';
import { stepMortalWraiths, WRAITH_PERIOD_DAYS } from './wraiths.js';
import { stepVegetation, stepFire } from './ecology.js';

/**
 * 各低频时钟的节拍（游戏日）。
 * ⚠️ 数值与 `main.js` 原先硬编码在 `update()` 里的值**逐字一致**——
 *    改这里等于改真实游戏的节奏，别当成「调参」随手动。
 */
export const ADVANCE_PERIODS = Object.freeze({
  upper: 10,
  nether: 10,
  rift: RIFT_PERIOD_DAYS,   // 30
  // 凡间鬼影（D6-3 工程包 B）。与 upper / nether 同频（10 日），长测好对齐。
  // ⚠️ 与 `rift` 的 30 日**不同频是刻意的**：鬼**从缝里出来**那一刻归 `rift`
  //    （`stepNetherRift` 里抽签），但**出来之后在凡间怎么飘**是凡间自己的事，
  //    与「视界开没开」无关（见下面 wraith 那一段）。
  wraith: WRAITH_PERIOD_DAYS,   // 10
  eco: 5,
  fire: 0.8,
});

/**
 * 建一份累加器。**调用方必须长期持有它**（模块级常量 / 实例属性）。
 *
 * ⚠️ 不要每次 `advanceWorld` 现建一个：那会让节流**静默失效**——每拍都从 0
 *    起算，「每 10 日一次」退化成「每次调用一次」。低频时钟之所以低频，是因为
 *    有的很贵：`stepNether` 要做「400 实体 × 120 魂池」两两比对，`stepVegetation`
 *    要抽签。每帧跑会把帧率吃掉，而且**不报错**，只是机器发烫。
 */
export function createAdvanceState() {
  return { upper: 0, nether: 0, rift: 0, wraith: 0, eco: 0, fire: 0 };
}

/**
 * 推进世界 `days` 个游戏日，并把**全部**游戏日驱动的时钟跑到该跑的位置。
 *
 * @param {object} world 凡间 world。**不是**上界 / 幽冥——那两个是它的
 *   `.upper` / `.nether`（`world.day` 是三界**唯一**的时间源，上界与幽冥的
 *   `day` 只是被赋值，不自己推进）。
 * @param {number} days 推进的天数。`≤ 0`（或 NaN）直接返回，什么都不做——
 *   与 `update()` 的 `if (days > 0)` 同款守卫。
 * @param {object} deps
 *   · `life`        凡间 `Life` 实例。**必需**——它是世界的主循环，缺了世界不会动。
 *   · `upperLife`   上界 `UpperLife` 实例（可选；缺则跳过上界 tick）
 *   · `rng`         `stepVegetation` / `stepFire` 用的流（可选；缺则**跳过**这两套）
 *   · `state`       `createAdvanceState()` 的产物。**必需**——缺了节流会失效，
 *                   所以这里宁可**不推进**也不静默退化。
 *   · `riftActive`  裂缝是否推进（默认 `true`）。真实游戏传 `this.riftViewOpen()`
 *                   ——契约 C1.1「视界关着就冻结」在**推进侧**的唯一兑现处。
 *   · `nether`      显式 `false` 关闭幽冥 tick（默认：`world.nether` 存在就 tick）。
 *   · `wraith`      显式 `false` 关闭凡间鬼影 tick（默认：`world.wraiths` 存在就 tick）。
 * @returns {object|null} 这一拍各时钟跑了没有：`{ upper, nether, rift, wraith, eco, fire }`。
 *   调用方据此置 `dirty` 位（`main.js` 就是这么用的）。
 */
export function advanceWorld(world, days, deps = {}) {
  if (!world || !(days > 0)) return null;
  const state = deps.state;
  if (!state) return null;              // 没有累加器 = 节流失效，宁可不推

  const fired = { upper: false, nether: false, rift: false, wraith: false, eco: false, fire: false };

  world.day += days;
  world.year = Math.floor(world.day / TIME.daysPerYear);

  // ── 凡间主循环（每拍都跑，不节流）────────────────────────────
  if (deps.life) deps.life.step(days);

  // ── 上界：与凡间共享同一条时间轴，但**更新频率低**（每 10 日）──
  // ⚠️ 绝不能拿凡间的 `deps.life` 去 step 上界：`stepEntity` 会抽 `Life.rng`，
  //    那是全世界共用的一条主随机流，多抽一次整个世界线就漂走（铁律一）。
  //    `UpperLife` 有自己从 `upper.seed` 派生的独立流。
  if (world.upper && deps.upperLife) {
    world.upper.day = world.day;
    world.upper.year = world.year;
    state.upper += days;
    if (state.upper >= ADVANCE_PERIODS.upper) {
      deps.upperLife.step(state.upper);
      state.upper = 0;
      fired.upper = true;
    }
  }

  // ── 幽冥：与上界逐字同构（每 10 日）──────────────────────────
  // ⚠️ `stepNether` 收的是**凡间 world**——它要用 `world.souls`（凡间魂池）
  //    做「绑魂鬼魂」的对账。`world.nether.souls` 在游戏里**恒空**
  //    （`planes.createPlanes` 的别名 0 调用点），拿它会把每只绑魂鬼魂
  //    都误判成「魂已离池」而当场清空——静默的灾难。
  if (world.nether && deps.nether !== false) {
    world.nether.day = world.day;
    world.nether.year = world.year;
    state.nether += days;
    if (state.nether >= ADVANCE_PERIODS.nether) {
      stepNether(world, state.nether);
      state.nether = 0;
      fired.nether = true;
    }
  }

  // ── 空间裂缝：每 30 日一拍，且**只在视界开启时累加**（契约 C1.1）──
  //
  // **为什么不能每帧跑**（规格 §4.3 第 1 条）：漏物判定每跑一次都要抽签。
  // 60 FPS 下每秒抽 60 次，而漏物概率是按「每 30 日 0.5%」标定的——按帧抽
  // 等于把概率放大 60×，裂缝会瞬间漏到爆炸，而且**不报错**，只是世界莫名
  // 其妙地被上界法宝塞满。
  //
  // **为什么周期取 30**：与 `TERRITORY_PERIOD_DAYS` 同频（规格 §4.3 第 1 条
  // 的「建议 30 日」），两个低频系统共用同一个节拍，长测里也好对齐。
  //
  // ⚠️ **关窗时既不累加也不清零**：累加器跨开关存活，与 eco/fire 同性质。
  //    清零会让「关一下再开」白白丢掉已经攒下的天数——玩家反复开关就能把
  //    裂缝永久卡在扩张期，那是一条**不报错**的坏法。
  //    **为什么不是「只暂停漏物判定、让曲线照走」**：一条 30–40 年的缝会在
  //    玩家关窗期间照常过完它的一生，玩家永远看不到它，与「只有开启视界时
  //    有效」直接矛盾。曲线改读 `rift.age`（`rifts.js`）与本行是同一件事的
  //    两半：一个管「什么时候推进」，一个管「推进的是哪条时间轴」。
  //
  // ⚠️ 别以为「裂缝是两界之间的事」就该套 `if (world.upper)`：裂缝属于**凡间**
  //    （`world.rifts` / `world.riftLog`），加那个条件会让没上界的档
  //    （老档 / 单世界测试）裂缝系统**整个静默停摆**。`stepRifts` 内部对
  //    `world.upper` 缺失有兜底（需要上界那一侧的方向会被跳过）。
  //
  // ⚠️ 本函数**不置任何 `dirty` 位**：那三个位（`upperDirty` / `netherDirty` /
  //    `dirty`）是**渲染侧**的事，由调用方按返回的 `fired` 决定。特别是
  //    裂缝**不该**置 `dirty`——`dirty` 管的是**地形位图**要不要重画，而裂缝
  //    画在每帧重绘的叠加层上（`drawRifts`，与 `drawEntities` 同层），
  //    置了只会让整张地形位图每 30 天白重算一次，纯浪费。
  if (deps.riftActive !== false) {
    state.rift += days;
    if (state.rift >= ADVANCE_PERIODS.rift) {
      stepRifts(world);
      state.rift = 0;
      fired.rift = true;
    }
  }

  // ── 凡间鬼影：每 10 日一拍（D6-3 工程包 B）──────────────────────
  //
  // 自幽冥缝爬入凡间的鬼，在凡间飘荡 → 到期消散（`stepMortalWraiths`）。
  //
  // ⚠️ **刻意不挂 `deps.riftActive`**（与上面裂缝那一段的关键差别）：
  //    `riftActive` 管的是**裂缝系统**（C1.1「视界关着就冻结」——缝的曲线与
  //    漏物判定只在开窗时演化）。而鬼一旦爬出来，它就是**凡间世界里的一只实体**，
  //    它飘不飘与玩家开不开视界**毫无关系**——就像 `life.step` 里的凡人照常走路
  //    一样，不因视界关闭而冻结。把它挂上去会造成「玩家关掉视界 ⇒ 满地图的鬼
  //    集体定住、永不消散」，那是一条**不报错**的坏法。
  //
  // ⚠️ 也**不挂 `if (world.upper)` / `if (world.nether)`**：鬼影属于**凡间**
  //    （`world.wraiths`），加那两个条件会让没上界 / 没幽冥的档（老档、单世界测试）
  //    鬼影系统整个静默停摆（同裂缝那段的警告）。
  //
  // ⚠️ `stepMortalWraiths` **不抽凡间主随机流**：它用自己从 `world.seed` 派生的
  //    独立流（`mortalHauntRngFor`，键 `0x4841554e`），所以本行不会让世界线漂走。
  if (world.wraiths && deps.wraith !== false) {
    state.wraith += days;
    if (state.wraith >= ADVANCE_PERIODS.wraith) {
      stepMortalWraiths(world, state.wraith);
      state.wraith = 0;
      fired.wraith = true;
    }
  }

  // ── 植被 / 野火：**只有调用方给了 `rng` 才跑** ─────────────────
  // ⚠️ 这两套**抽签**。测试若本来不跑它们（比如 playtest 原先只调 `life.step`），
  //    这里跳过才是对的——硬跑会让世界线漂走，而那是**不可逆**的。
  if (deps.rng) {
    state.eco += days;
    if (state.eco >= ADVANCE_PERIODS.eco) {
      stepVegetation(world, state.eco, deps.rng);
      state.eco = 0;
      fired.eco = true;
    }
    state.fire += days;
    if (state.fire >= ADVANCE_PERIODS.fire) {
      stepFire(world, state.fire, deps.rng);
      state.fire = 0;
      fired.fire = true;
    }
  }

  return fired;
}
