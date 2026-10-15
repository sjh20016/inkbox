// World Laboratory · Profile 定义（委托书 §5 / §6）
//
// ───────────────────────────────────────────────────────────────────────
// 本文件要解决的核心问题：**「自然世界」与「旧长测世界」不是同一个世界**
// ───────────────────────────────────────────────────────────────────────
//
// `scripts/inkbox-longrun.mjs` 跑出来的世界**不是纯自然世界**。它至少额外做了四件事：
//   ① 多撒了 5 组 × 14 个凡人（`mulberry32(4242)` 选点）；
//   ② 每 20 年模拟玩家开一次视界，每次持续 5 年（25% 占空比）；
//   ③ 在三个固定矩形上开上界缝；
//   ④ 在六个固定点上常年维持幽冥缝。
//
// 这四件事对 regression / liveness **非常有价值**（没有它们，裂缝系统永远空转，
// 那条判据就是一条永远绿的假判据）。但它们**不能**被称为「自然世界」——
// 拿它去回答「没有玩家干预时，世界自身会如何运行」，答案会被玩家的手污染。
//
// ⇒ 所以本文件定义**两个** profile，名字如实反映语义：
//     · `natural`        —— 无玩家干预。**只有它**能回答上面那个问题。
//     · `legacy-longrun` —— 尽可能逐字复刻旧长测的夹具。目的不是替代旧长测，
//                           而是保证「新实验框架可以表达旧测试世界」。
//
// ⚠️ 委托书 §5 点名禁止的一件事：**不要把「额外人口但不开裂隙」也叫 `longrun`**。
//    本文件通过「profile 名 ⟹ 完整语义（含 viewPolicy）」的硬绑定来兑现它：
//    每个 profile 只有**一个**合法 viewPolicy，由 `job-schema.mjs` 强制
//    （想换视界策略就新增一个 profile，见 §25 的扩展点）。

import { mulberry32 } from '../../src/inkbox/core/noise.js';
import { TIME } from '../../src/inkbox/core/config.js';
// 夹具要「模拟玩家开缝」，所以直接调模拟侧的正规入口。
// ⚠️ 不自己写一份开缝逻辑：`openRifts` 里有上限判定、候选格过滤、洗牌抽签，
//    任何一条抄漏都会让夹具**静默**偏离旧长测（比如漏掉 `active-cap`，
//    世界会多出几百条缝而读数看着「更活跃」，像是个更好的世界）。
import { openRifts } from '../../src/inkbox/sim/rifts.js';

export const PROFILE_NAMES = Object.freeze(['natural', 'legacy-longrun', 'intervention', 'sensitivity']);

// ───────────────────────────────────────────────────────────────────────
// Profile A · natural
// ───────────────────────────────────────────────────────────────────────
//
// 委托书 §5 的原文要求（逐条落实）：
//     generateWorld(scatter:true)   → world-factory 负责
//     attach upper                  → world-factory 负责
//     attach nether                 → world-factory 负责
//     不额外补人口                   → extraPopulation = null
//     不主动投放资源                 → 无资源投放 hook
//     不开裂隙                       → riftOpening = null
//     不模拟玩家操作                 → afterYear 为空
//     riftActive = false            → viewOpenAt 恒 false
//
// ⚠️ 生态（植被 / 野火）**仍然要跑**，而且用的是 `mulberry32(12345)`——
//    与 `main.js:434` 的 `this.rng` **同一个种子**。这不是「额外操作」，
//    这是真实游戏每帧都在做的事（`update()` 把 `this.rng` 传给 `advanceWorld`）。
//    把生态也关掉会得到一个「植被冻结」的世界：食物永远紧缺、人口卡在 600、
//    聚落 13 座——而真实游戏里人口顶到 1400、聚落 69 座。
//    `inkbox-longrun.mjs` 的头部注释把这件事记成「踩过的坑（一）」，
//    结论是「拿一个植被冻结的世界去调人口与开宗参数，等于照着假数据拧旋钮」。
//    本 profile 不重犯它。

// ───────────────────────────────────────────────────────────────────────
// Profile B · legacy-longrun 的夹具常量（逐字照搬 `inkbox-longrun.mjs`）
// ───────────────────────────────────────────────────────────────────────

/** 额外人口的选点流种子。与 `inkbox-longrun.mjs:127` 逐字相同。 */
const LEGACY_SCATTER_RNG_SEED = 4242;
/** 撒 5 组，每组 14 人，落点离边界至少 20 格。与 `inkbox-longrun.mjs:128-132` 逐字相同。 */
const LEGACY_SCATTER_GROUPS = 5;
const LEGACY_SCATTER_COUNT = 14;
const LEGACY_SCATTER_MARGIN = 20;

/**
 * 「玩家行为」模拟的节奏（`inkbox-longrun.mjs:171`）。
 *
 * ⚠️ **核心陷阱**（原文照录，这是本项目最贵的一条工程知识）：
 *    `openRifts` 只在**玩家开视界**时被调用。长测脚本不会开视界，所以什么都不做的
 *    话 `riftLog` 会**恒为 0**——于是「裂缝系统活着」那条判据永远绿、什么也没测
 *    （**空转判据**）。本项目已经因为「空转判据」吃过好几次亏。
 *
 * **确定性**：不用 `Math.random`，节奏（每 20 年）与坐标（三个固定矩形）都写死。
 */
export const LEGACY_RIFT_OPEN_EVERY_YEARS = 20;

/**
 * 上界缝站点：三个 40×30 矩形的左上角。
 *
 * 矩形取 40×30 ⇒ 周长 140 ⇒ `clamp(1, 4, round(140/120)) = 1` ⇒ 每次开 **1** 道缝。
 * 三个坐标是照 medium 预设、种子 20260914 的 world 实测挑的：四条边的
 * 「凡间 + 上界都可站人」格数都在 100 以上，不会因为位置过滤而开不出来。
 *
 * ⚠️ **这些坐标是预设相关的**。换 `small`（200×128）时 x=220 的站点会落在
 *    世界之外——`openRifts` 会把坐标 clamp 到边界（不抛错），但候选格随之落空，
 *    返回 `no-site`。那不是崩溃，是**实验条件变了**，所以 `world-factory`
 *    会在 preset ≠ medium 时往 runtime 里记一条 `profile_preset_mismatch`。
 */
export const LEGACY_RIFT_OPEN_SITES = Object.freeze([
  Object.freeze([40, 50]),
  Object.freeze([220, 70]),
  Object.freeze([60, 120]),
]);

/**
 * 幽冥缝站点（D6-3 工程包 E · 三界跨界生态）。
 *
 * ⚠️⚠️ **为什么站点是 1×1 的「点」而不是 40×30 的矩形**（这一条是 E 包的核心，
 *     原文照录——它是「不扰动随机流」这条纪律的一个**可数形态**）：
 *
 *   `openRifts` 只把**矩形周长**上的格当候选缝口，而幽冥缝口还必须**同时**满足
 *   `world.isWalkable`（凡间可站）**且** `netherWalkable`（幽冥可站）。
 *   而幽冥的鬼 / 物品**只落在河带格**（`netherBankTiles` = 幽冥可站 ∩ 近河 ≤4）。
 *   ⇒ 缝口必须落在「凡间可站 ∩ 幽冥河带」的**交集**里，缝半径（峰值 ~5.7 格）
 *     才够得着鬼与物品；否则通道 C（物品漏出）/ D（夺舍）**结构性永不触发**。
 *
 *   实测：用 ±10 矩形站点 ⇒ 10 条缝跑 300 年，C=18 但 **D 恒 0**；
 *   改用「重叠格」上的缝口后，半径 3.63 格内有 26 个河带格 + 42 个凡人。
 *
 *   1×1 区域 ⇒ `cols=rows=1` ⇒ 候选格恰好是那一个点 ⇒ 缝口**精确落点**。
 *   ⚠️ 附带好处：`sites.length === 1` ⇒ `openRifts` 的洗牌循环
 *      `for (i = sites.length - 1; i > 0; i -= 1)` **不执行** ⇒ **消费裂隙流 0 次**
 *      ⇒ 上界缝的位置与「不开幽冥缝」时**逐字相同**。
 */
export const LEGACY_NETHER_RIFT_SITES = Object.freeze([
  Object.freeze([127, 45]),
  Object.freeze([192, 30]),
  Object.freeze([66, 46]),
  Object.freeze([101, 100]),
  Object.freeze([189, 101]),
  Object.freeze([261, 101]),
]);

/**
 * 「视界开着多久」（契约 C1.1 的落地）。
 *
 * ⚠️⚠️ **这一条不加，整段裂缝判据就是在测另一个世界。**
 *    契约 C1.1 把裂缝改成「**只在视界开启时演化**」。若写成「每 30 日无条件
 *    `stepRifts`」，等价于**视界永远开着**，于是 `leaked` / `crossed` / `closed`
 *    会比玩家真实体验高出一个数量级，拿这组数去调 `LEAK_CHANCE_PER_PERIOD`
 *    就是照着假数据拧旋钮。
 *
 * **玩家行为模型**：每 20 年开一次视界，每次保持 5 年 → 占空比 25%。
 * 为什么是 25% 而不是「一直开着」：一直开着等于取消了这条契约；而占空比太低
 * （比如开 1 年）会让「一条缝活 30-40 个**视界内**年」需要 120-160 个世界年
 * 才走完，300 年的实验里连一代缝都过不完，`closed` 恒 0 —— 那不是「系统坏了」，
 * 是**测试没给它时间**。25% 下 300 年累计约 75 个视界内年 ≈ 两代缝，恰好够判
 * 「会闭合」。
 */
export const LEGACY_VIEW_OPEN_YEARS = 5;

/**
 * 第 `year` 年（1 起）视界是否开着。开窗从 `year = 1, 21, 41, …` 开始，各持续 5 年。
 *
 * ⚠️ 判据必须与开缝的触发点**同源**（都用 `(year-1) % 周期`），否则会出现
 *    「缝开了但时钟没走」或「时钟走了但一条缝都没有」——两种都不报错，只是读数偏小。
 *    旧脚本原先写的是 `y % 20 === 0`（在第 20/40/… 年开），与「窗口从第 1 年算起」
 *    差一格，会造成「缝在第 20 年开出来、但第 20 年视界已关」→ 那道缝永远 age=0。
 *    这是**已修过的 bug**，本文件保留正确形态。
 */
export function legacyViewOpenAt(year) {
  return (year - 1) % LEGACY_RIFT_OPEN_EVERY_YEARS < LEGACY_VIEW_OPEN_YEARS;
}

/** 第 `year` 年是否是「开缝年」（开窗期的第一年）。 */
export function legacyRiftOpenYear(year) {
  return (year - 1) % LEGACY_RIFT_OPEN_EVERY_YEARS === 0;
}

// ───────────────────────────────────────────────────────────────────────
// Profile 表
// ───────────────────────────────────────────────────────────────────────

/**
 * 每个 profile 的完整定义。
 *
 * 契约（`world-factory.mjs` 按它执行）：
 *   · `beforeRun(ctx)` —— 世界已建好、主循环**尚未开始**时的夹具注入。
 *     唯一允许改世界的地方（`pendingSpawns` 之类）。
 *   · `viewOpenAt(year)` —— 该年视界是否开着 → 直接喂给 `advanceWorld` 的
 *     `riftActive`。这是契约 C1.1 在实验侧的**唯一**兑现处。
 *   · `afterYear(ctx, year)` —— 每年结束时跑一次。旧长测的「开缝」在这里。
 *   · `calibratedPreset` —— 夹具坐标是按哪个预设标定的。`null` = 无预设依赖。
 */
export const PROFILES = Object.freeze({
  natural: Object.freeze({
    name: 'natural',
    label: '自然世界 · 无玩家干预',
    viewPolicy: 'closed',
    calibratedPreset: null,
    summary: '没有玩家干预时，世界自身会如何运行。不补人口、不投放资源、不开裂隙、视界恒闭。',
    /** 额外人口夹具：无。 */
    extraPopulation: null,
    /** 开缝夹具：无。 */
    riftOpening: null,
    beforeRun() {},
    viewOpenAt() { return false; },
    afterYear() {},
  }),

  'legacy-longrun': Object.freeze({
    name: 'legacy-longrun',
    label: '旧长测夹具 · 复刻 inkbox-longrun.mjs',
    viewPolicy: 'legacy-duty-cycle',
    calibratedPreset: 'medium',
    summary: '尽可能逐字复刻 scripts/inkbox-longrun.mjs 的实验条件：额外人口 + 25% 视界占空比 + 上界缝矩形 + 幽冥缝站点。',
    extraPopulation: Object.freeze({
      rngSeed: LEGACY_SCATTER_RNG_SEED,
      groups: LEGACY_SCATTER_GROUPS,
      count: LEGACY_SCATTER_COUNT,
      margin: LEGACY_SCATTER_MARGIN,
    }),
    riftOpening: Object.freeze({
      everyYears: LEGACY_RIFT_OPEN_EVERY_YEARS,
      openYears: LEGACY_VIEW_OPEN_YEARS,
      sites: LEGACY_RIFT_OPEN_SITES,
      netherSites: LEGACY_NETHER_RIFT_SITES,
    }),

    /**
     * 额外人口夹具。**逐字照搬 `inkbox-longrun.mjs:127-132`**。
     *
     * 为什么需要它（原文照录）：
     *   「再撒几批人，让世界热闹点——默认散布出的聚落太少，少了就测不出
     *     『人口压力 → 开宗 → 抢灵脉』这条链。」
     *
     * ⚠️ 用**自己的** `mulberry32(4242)`，不抽 `Life.rng`——所以夹具本身
     *    不移动世界线（它只往 `world.pendingSpawns` 里塞东西，
     *    由 `life.step` 在第一次推进时消费）。
     */
    beforeRun(ctx) {
      const scatterRng = mulberry32(LEGACY_SCATTER_RNG_SEED);
      const { world } = ctx;
      for (let g = 0; g < LEGACY_SCATTER_GROUPS; g += 1) {
        const x = LEGACY_SCATTER_MARGIN + Math.floor(scatterRng() * (world.w - LEGACY_SCATTER_MARGIN * 2));
        const y = LEGACY_SCATTER_MARGIN + Math.floor(scatterRng() * (world.h - LEGACY_SCATTER_MARGIN * 2));
        world.pendingSpawns.push({ x, y, species: 'human', count: LEGACY_SCATTER_COUNT });
      }
    },

    viewOpenAt: legacyViewOpenAt,

    /**
     * 每年结束时的「玩家行为」：在视界开着的年份里开缝。
     *
     * ⚠️ 上界缝每 20 年开一批就够（它们能活 ~56 世界年）；幽冥缝则要**持续有活的**，
     *    否则空窗会让四条跨界通道的样本量腰斩。所以幽冥缝「每年补开一次」：
     *    已活跃的站点被 `openRifts` 的 `occupied` 过滤掉（返回 `no-site`），
     *    所以**不会重复开**，也不会报错。
     *
     * ⚠️ 1×1 区域 ⇒ `sites.length === 1` ⇒ 洗牌循环不执行 ⇒ **不抽裂隙流**
     *    ⇒ 所以这一段**不移动上界缝的位置**。
     */
    afterYear(ctx, year) {
      if (!legacyViewOpenAt(year)) return;
      const { world, tally } = ctx;
      if (legacyRiftOpenYear(year)) {
        for (const [ox, oy] of LEGACY_RIFT_OPEN_SITES) {
          const r = openRifts(world, { x0: ox, y0: oy, x1: ox + 39, y1: oy + 29 }, 'upper');
          tally.riftOpenedUpper += r.opened;
          if (r.refused) tally.riftRefusedUpper.push(r.reason);
        }
      }
      for (const [nx, ny] of LEGACY_NETHER_RIFT_SITES) {
        const r = openRifts(world, { x0: nx, y0: ny, x1: nx, y1: ny }, 'nether');
        tally.riftOpenedNether += r.opened;
        if (r.refused) tally.riftRefusedNether.push(r.reason);
      }
    },
  }),

  // ─────────────────────────────────────────────────────────────────────
  // Profile C · intervention —— B1-3 受控干预
  // ─────────────────────────────────────────────────────────────────────
  //
  // 委托书 B1-3 要求「Control/Treatment 配对」。本 profile 就是 Treatment 的载体：
  // 它按 Job 里声明的 `intervention` **单变量**注入，其余一切与 `natural` 逐字相同
  // （不补人口默认值、不开缝、视界恒闭）。
  //
  // ⚠️⚠️ **为什么干预走 profile 而不是改模拟常量**（这是 B1-3 最贵的一条纪律）：
  //   B0/B1 的边界是「不改平衡参数、不改模拟规则」。所以受控干预**只能**注入
  //   **初始条件 / 外部事件**，不能去动 `sects.js` / `ecology.js` 里的常量。
  //   本 profile 的全部干预都发生在「世界已建好、主循环未开始」的 `beforeRun` 里，
  //   或「每年结束后」的 `afterYear` 里——**没有一行改模拟规则**。
  //
  // ⚠️ **为什么 Control 必须用 `natural` 而不是「intervention 且参数为空」**：
  //   委托书 §B1-7(D) 的不变量是「因果干预有效：干预组与对照组**只差干预本身**」。
  //   若 Control 也走 intervention profile，那么「profile 相同」这件事本身
  //   就成了一个额外的可比性前提；而两组**必须**能逐字节对齐到同一条自然线。
  //   所以配对的口径是：
  //       Control   = profile `natural`（零干预）
  //       Treatment = profile `intervention` + 声明了干预
  //   判据：Control 的 digest 与 B1-1 基线**逐字节相同**（已由 §3.0 证明），
  //   于是「Treatment − Control」把干预本身孤立了出来。
  //
  // ⚠️ `kind: 'none'` 是**合法**的：它是「intervention profile 的零干预基线」，
  //    用于自检「零干预 ⇒ 与 natural 逐字节相同」。生产实验不该用它当 Control
  //    （会多引入一个 profile 变量），但自检需要它来钉「干预机制本身不扰线」。
  intervention: Object.freeze({
    name: 'intervention',
    label: '受控干预 · B1-3 Treatment',
    viewPolicy: 'closed',
    calibratedPreset: null,
    summary: '按 Job 声明的 intervention 单变量注入（默认 = 零干预）。不补默认人口、不开缝、视界恒闭；除声明的干预外与 natural 逐字相同。',
    /** 干预不携带固定夹具：一切由 Job 的 `intervention` 决定。 */
    extraPopulation: null,
    riftOpening: null,
    /** natural 的空实现；真正的注入在 `applyIntervention` 里。 */
    beforeRun() {},
    viewOpenAt() { return false; },
    afterYear() {},
  }),

  // ─────────────────────────────────────────────────────────────────────
  // Profile D · sensitivity —— B1-5 参数敏感性
  // ─────────────────────────────────────────────────────────────────────
  //
  // 委托书 B1-5 要求「参数敏感性实验」。本 profile 是它的载体：
  // 它按 Job 里声明的 `parameterOverrides` **单变量或多变量**覆盖模拟常量，
  // 其余一切与 `natural` 逐字相同（不补人口、不开缝、视界恒闭）。
  //
  // ⚠️⚠️ **为什么这不违反「不改平衡参数」**：
  //   B0/B1 的边界是「不改 main 的官方默认数值」。本 profile
  //   **不改任何默认值**——它只在**一次运行的同步作用域内**临时覆盖，
  //   作用域一结束（`withTunables` 的 finally）就必然复原。
  //   默认值仍写在 `src/inkbox/sim/tunables.js` 的 REGISTRY 里，逐位不变。
  //   于是「natural 基线」依旧是那个世界，「sensitivity」只是一次**投影**。
  //
  // ⚠️ 关键不变量（自检钉死，见 §B1-5(A)）：**零覆盖 ⇒ 与 natural 逐字节相同**。
  //    `parameterOverrides` 为空时，本 profile 必须产出与 `natural` 一模一样的世界。
  sensitivity: Object.freeze({
    name: 'sensitivity',
    label: '参数敏感性 · B1-5',
    viewPolicy: 'closed',
    calibratedPreset: null,
    summary: '按 Job 声明的 parameterOverrides 覆盖可调常量（默认 = 零覆盖）。不补人口、不开缝、视界恒闭；除声明的覆盖外与 natural 逐字相同。',
    /** 敏感性实验不携带固定夹具：一切由 Job 的 `parameterOverrides` 决定。 */
    extraPopulation: null,
    riftOpening: null,
    /** natural 的空实现；真正的作用域覆盖在 `withParameterOverrides` 里。 */
    beforeRun() {},
    viewOpenAt() { return false; },
    afterYear() {},
  }),
});

/** 该 profile 的默认视界策略。CLI 只给 `--profile` 时用它补齐。 */
export function profileDefaultViewPolicy(name) {
  const p = PROFILES[name];
  return p ? p.viewPolicy : null;
}

/** 取 profile 定义；未知名字返回 `null`（由调用方报错，不在这里抛）。 */
export function profileOf(name) {
  return PROFILES[name] || null;
}

// ───────────────────────────────────────────────────────────────────────
// B1-3 · 受控干预（intervention profile 的执行体）
// ───────────────────────────────────────────────────────────────────────
//
// 干预类型表。**只允许这里列出的 kind**（job-schema 会按同一份表校验，
// 不在这里抛——非法输入必须在跑之前就响）。
//
// 设计原则（守 B0 边界「不改模拟规则」）：
//   · 只能注入**初始条件**或**外部事件**；
//   · 不得改 `sects.js` / `ecology.js` / `cultivation.js` 里的任何常量；
//   · 注入必须走**已存在的合法入口**（如 `world.pendingSpawns`），
//     不新造旁路——那样产物会与产品读档不兼容。
export const INTERVENTION_KINDS = Object.freeze(['none', 'extra-population']);

/**
 * 在「世界已建好、主循环未开始」时施加干预。
 *
 * @param {object} ctx world-factory 传进来的上下文（含 world / tally / notes）
 * @param {object|null} intervention Job 声明的干预（已校验）
 * @returns {object} 实际施加的干预的描述（进 manifest，**读实况不读入参**）
 */
export function applyIntervention(ctx, intervention) {
  const desc = {
    kind: 'none',
    requested: intervention ? { ...intervention } : null,
    applied: null,
    // 实际注入的实体数（读 world.pendingSpawns 的增量，不是回显入参）
    injectedSpawns: 0,
    injectedEntities: 0,
  };
  if (!intervention || intervention.kind === 'none') {
    return desc;
  }

  const { world, tally } = ctx;
  if (intervention.kind === 'extra-population') {
    // ── 额外人口注入 ─────────────────────────────────────────────
    //
    // ⚠️ 走 `world.pendingSpawns`（与 `legacy-longrun` 的额外人口**同一机制**），
    //    由 `life.processPendingSpawns` 在第一次推进时消费。
    //    ⇒ 不抽 `Life.rng`、不改任何模拟常量、不新造旁路。
    //
    // ⚠️ 选点用**自己的** `mulberry32(rngSeed)`，不抽主随机流——
    //    否则干预会**移动世界线**，Control 与 Treatment 就不再可比
    //    （两边的凡间主随机流被干预消耗了不同的次数）。
    //    这正是 B1-7(B)「随机流稳定」不变量在干预处的兑现。
    const rngSeed = intervention.rngSeed;
    const rng = mulberry32(rngSeed);
    const groups = intervention.groups;
    const count = intervention.count;
    const margin = intervention.margin;
    for (let g = 0; g < groups; g += 1) {
      const x = margin + Math.floor(rng() * (world.w - margin * 2));
      const y = margin + Math.floor(rng() * (world.h - margin * 2));
      world.pendingSpawns.push({ x, y, species: 'human', count });
    }
    desc.kind = 'extra-population';
    desc.applied = { rngSeed, groups, count, margin };
    desc.injectedSpawns = groups;
    desc.injectedEntities = groups * count;
    if (tally) {
      tally.extraPopulationGroups = groups;
      tally.extraPopulationCount = groups * count;
    }
    return desc;
  }

  // 不可能走到（job-schema 已挡），但留一道守卫，避免未来加了 kind 却漏了实现。
  throw new Error(`未知干预类型「${intervention.kind}」；允许：${INTERVENTION_KINDS.join(', ')}`);
}

/** 供报告使用的 profile 摘要（进 manifest）。 */
export function describeProfile(name) {
  const p = PROFILES[name];
  if (!p) return null;
  return {
    name: p.name,
    label: p.label,
    viewPolicy: p.viewPolicy,
    calibratedPreset: p.calibratedPreset,
    summary: p.summary,
    // B1-3 / B1-5：`intervention` 与 `sensitivity` 的参数都由 Job 决定，
    //   所以它们的固定 fixtures 全为 null，实际参数记录在 manifest 的
    //   `intervention` / `parameterOverrides` 字段里。
    parameterized: p.name === 'intervention' || p.name === 'sensitivity',
    fixtures: {
      extraPopulation: p.extraPopulation ? { ...p.extraPopulation } : null,
      riftOpening: p.riftOpening
        ? {
          everyYears: p.riftOpening.everyYears,
          openYears: p.riftOpening.openYears,
          upperSites: p.riftOpening.sites.map((s) => s.slice()),
          netherSites: p.riftOpening.netherSites.map((s) => s.slice()),
        }
        : null,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// B1-5 · 参数敏感性（sensitivity profile 的执行体）
// ───────────────────────────────────────────────────────────────────────
//
// `parameterOverrides` 的形状是 `{ <TUNABLE_NAME>: <number>, … }`。
// 合法键由 `src/inkbox/sim/tunables.js` 的 `TUNABLE_NAMES` 决定——
//   **唯一真相就在那里**，本文件不抄一份（抄一份就会漂移）。
// 校验由 job-schema 负责（跑之前就响），本文件只负责**执行**。
//
// ⚠️⚠️ **为什么执行体是一个「作用域包装」而不是「一次性写入」**：
//   模拟是同步的（`advanceWorld` 一次调用跑完一年）。覆盖必须**跨整条
//   推进链**有效（`advanceWorld` → `Life.step` → …），所以不能只在
//   某一次调用里生效。做法是：把**整个 `runSeed` 的推进**包在
//   `withTunables(overrides, fn)` 里。这样：
//     · 覆盖对整条链可见；
//     · `fn` 返回（含抛错）后**必然**复原 ⇒ 不会泄漏到下一个 seed / 实验；
//     · 默认值一个字节都没被改。

/** 覆盖表 → 稳定排序的「规范化签名片段」（进 configSignature，见 report.mjs）。 */
export function parameterOverrideSignature(overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return 'none';
  const keys = Object.keys(overrides).sort();
  return keys.map((k) => `${k}=${overrides[k]}`).join(',');
}

/** 覆盖表 → 人类可读描述（进 manifest / summary / 报告）。 */
export function describeParameterOverrides(overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return null;
  const out = {};
  for (const k of Object.keys(overrides).sort()) out[k] = overrides[k];
  return out;
}

/** 一天多少游戏日 → 年（报告里要按年印读数）。 */
export const DAYS_PER_YEAR = TIME.daysPerYear;
