// World Laboratory · 运行器（委托书 §6 / §9 / §14 / §16）
//
// ───────────────────────────────────────────────────────────────────────
// 唯一的推进方式：`advanceWorld()`
// ───────────────────────────────────────────────────────────────────────
//
// 委托书 §6 与 §23.B 都把这件事写成了硬性验收：
//
//   > 必须以 `advanceWorld()` 作为游戏日推进唯一入口。
//
// 本文件**没有**任何 `life.step(...)` / `stepNether(...)` / `stepRifts(...)`
// 的直接调用。这不是洁癖，是本项目已经付过两次学费的地方
// （`sim/advance.js` 的头注释记着）：
//   · 最初长测只调 `life.step`，漏了植被与野火 ⇒ 测出来的世界人口卡在 600、
//     聚落 13 座，而真实游戏人口 1400、聚落 69 座——拿假数据调参数；
//   · 2026-09-23 新增 `stepNether` 时**又漏了同一个地方** ⇒ 幽冥四步一次都不跑、
//     实体只增不减，面板印「鬼魂 186」而账本只有 60。
//
// 所以本文件的循环体里只有一行会改变世界，就是那一行 `advanceWorld`。
// 「时钟列表」这件事在本仓库里只有一处定义（`sim/advance.js` 的 `ADVANCE_PERIODS`），
// 本文件**不维护第二份**。
//
// ───────────────────────────────────────────────────────────────────────
// 采样：两层，且都发生在**推进之外**（委托书 §9）
// ───────────────────────────────────────────────────────────────────────
//
//   · Snapshot —— 默认每游戏年一次，采全部指标（含 qi 层、境界分布、灵脉分布）；
//   · Probe    —— 默认每 30 游戏日一次，只采轻量指标。
//
// 为什么非要两层：年度快照会**整年整年地跳过**短期事件。一次只持续 40 天的粮荒、
// 一次人口跌落又回升、一次粮仓见底、一次宗门稳定度崩到 30 又修回来——
// 这些在每年 1 月 1 日的快照上**完全看不见**，于是报告上会写着「粮食充裕、
// 宗门稳定」，而玩家那一年其实饿死过人。
//
// ⚠️ 采样**不改变世界**：采集器只读（见 `collectors.mjs` 的头注释），
//    而且采样发生在 `advanceWorld` 返回**之后**，不与任何时钟交错。
//    这一条由 `inkbox-experiment-selftest.mjs` 的 collector purity 测试反向证明。
//
// ⚠️ `Math.random()` 全文没有。委托书 §14 点名禁止。
//
// ───────────────────────────────────────────────────────────────────────
// 参数覆盖：整条推进链包在 `withTunables` 作用域里（B1-5）
// ───────────────────────────────────────────────────────────────────────
//
// `config.parameterOverrides`（仅 `profile=sensitivity` 非空）要在
// **整条推进链**上生效：`advanceWorld` → `Life.step` → `sects.step` → …
// 这些函数读的是 `tunable('POP_SOFT_CAP')` 之类，而不是模块级常量。
//
// ⇒ 做法：把 `runSeed` 的**整个身体**包进一次 `withTunables(overrides, fn)`。
//    这样有三个好处，恰是本项目最贵的三条纪律：
//      · 覆盖对整个 seed（含建世界、三百年推进、收尾采样）一致；
//      · `fn` 返回**或抛错**后必然复原 ⇒ 绝不会泄漏到下一个 seed / 实验；
//      · **默认值一个字节都没被改** —— 它只在内存里被临时遮蔽。
//
// ⚠️ 为什么**不**在 `createLabWorld` 内部开作用域：那样作用域会在
//    `createLabWorld` 返回时结束，而**推进还没开始**，覆盖等于没生效——
//    产出一份「看起来改了参数、其实按默认跑完」的实验。
//    作用域必须**包住推进**，所以它在 `runSeed` 这一层，不进工厂。
//
// ⚠️ 与 B1-3 的差别（为什么干预不在这一层）：干预改的是**世界状态**
//    （`world.pendingSpawns`），它必须在建世界后、推进前注入一次；
//    参数覆盖改的是**读数**，它必须在整个推进期间持续有效。两者作用面不同，
//    故一个在工厂里施加、一个在运行器里包作用域。

import { TIME } from '../../src/inkbox/core/config.js';
import { advanceWorld } from '../../src/inkbox/sim/advance.js';
import { createLabWorld } from './world-factory.mjs';
import { profileOf } from './profiles.mjs';
import { collectProbe, collectSnapshot } from './collectors.mjs';
import { worldFingerprint } from './digest.mjs';
// B2-2：人物命运观察队列（只读采集，见 fate-queue.mjs 头注释的四条纪律）。
import { selectFateQueue, collectFate } from './fate-queue.mjs';
// B1-5：可调参数的作用域覆盖（见本文件头部「参数覆盖」一段）。
import { withTunables, currentOverrides } from '../../src/inkbox/sim/tunables.js';

const DAYS_PER_YEAR = TIME.daysPerYear;

/**
 * 跑一个 seed。
 *
 * ⚠️ B1-5：本函数是**薄包装**——它只做一件事：若 config 声明了
 *    `parameterOverrides`（仅 `profile=sensitivity` 合法），就把
 *    `runSeedInner` 的**整个执行**包进 `withTunables` 作用域。
 *    真正的运行逻辑在 `runSeedInner`。这样「加了个覆盖」与「什么都没加」
 *    走的是**同一条**代码路径（覆盖为空时 `withTunables({}, fn)` 等价于
 *    `fn()`，因为空 patch 不改任何读值）——于是「零覆盖 ≡ natural 逐字节相同」
 *    这条不变量是**结构保证**，不是靠人记得别写歪。
 *
 * @param {object} config 已通过 `validateJob` 的配置
 * @param {number} seed
 * @param {object} [hooks]
 * @param {(info: object) => void} [hooks.onProgress] 进度回调（只用于 stdout 的简洁进度行）
 * @returns {object} 结果包（见 `runSeedInner`）
 */
export function runSeed(config, seed, hooks = {}) {
  const overrides = config.parameterOverrides;
  // 没有覆盖（null / undefined / 空对象）⇒ 直接跑，不进作用域。
  // ⚠️ 判空而不是「有键才包」：空 patch 也包一次是无害的，但省掉它能让
  //    「零覆盖的调用栈」与「natural 的调用栈」逐帧相同，便于调试。
  if (!overrides || Object.keys(overrides).length === 0) {
    return runSeedInner(config, seed, hooks);
  }
  // ⚠️ 非空覆盖只在 sensitivity profile 下合法（job-schema 已挡，这里再挡一道）：
  //    否则一次「合法但不是用户请求的实验」会静默产出错误结论
  //    （拿一个「其实没改」的组去做对比，却以为改了）。
  if (config.profile !== 'sensitivity') {
    throw new Error(`config 携带了非空 parameterOverrides，但 profile=${JSON.stringify(config.profile)}。`
      + '参数覆盖只在 profile=sensitivity 下被施加；其他 profile 会静默忽略它。');
  }
  return withTunables(overrides, () => runSeedInner(config, seed, hooks));
}

/**
 * 跑一个 seed 的**实体**（调用方一律走 `runSeed`）。
 */
function runSeedInner(config, seed, hooks = {}) {
  const profile = profileOf(config.profile);
  if (!profile) throw new Error(`未知 profile「${config.profile}」`);

  const startedAt = Date.now();
  // ⚠️ B1 §6.1：世界生成元数据**必须**从 config 透传到工厂。
  //    漏传任意一项，工厂就会退回自己的默认（v2 + standard）——
  //    于是一份「群山世界」的 Job 会静默按「标准世界」跑完，
  //    而 stdout 的配置行上明明印着 `terrain=mountains`。
  //    这正是不把默认值写进 CLI / Job 的理由：唯一可信的来源是 config。
  const lab = createLabWorld({
    seed,
    preset: config.preset,
    profile: config.profile,
    generationVersion: config.generationVersion,
    terrainPreset: config.terrainPreset,
    progressive: config.progressive === true,
    // B1-3：受控干预（只有 profile=intervention 会施加；其余传 null）。
    intervention: config.intervention ?? null,
  });
  const { world, ctx } = lab;

  const collect = config.collect !== false;
  const snapshots = [];
  const probes = [];
  // ── B2-2 · 命运观察队列 ────────────────────────────────────────
  //
  // `config.fateQueue` 已是 `validateJob` 归一化后的规格（{max, atDay, filter}）
  // 或 null。三个变量的分工：
  //   · `fateSpec`      —— 本次要不要建队（null = 不建，一个字节都不采）；
  //   · `fateQueue`     —— **建队后不再变动**的成员名单。名单是「输入」而不是
  //                       每次重算的产物：若每次采样都重选，世界演化会把原成员
  //                       换掉，样本就成了「今天还活着的人」——那正是幸存者偏差，
  //                       本装置存在的全部理由就是消灭它；
  //   · `prevFate`      —— 上一次采集，用于跨样本记忆（maxLevelSeen /
  //                       everCultivator / lastAliveDay）。成员死去后这些字段
  //                       仍要能回答「他这一辈子到过哪个境界」。
  //
  // ⚠️ 采集频率**绑快照**（snapshotDays，默认 1 年）而不是绑 probe / 推进步：
  //    300 年 × 32 人若每 3 游戏日一采是 117 万行，其中 99% 是同一状态的复读；
  //    而年度粒度足够回答「人生是否分叉」（一次炼气→筑基的跃升在年级别可见）。
  const fateSpec = config.fateQueue || null;
  let fateQueue = null;
  let prevFate = null;
  const fateSnapshots = [];

  // ⚠️ B0.1 §8：这里**不再有 `Math.round`**。
  //    旧版写的是 `Math.round(config.years)`，于是 `years: 3.7` 会被静默跑成 4 年，
  //    而报告上写着 4——看起来完全自洽，你永远查不出自己要的是 3.7。
  //    现在 `validateJob` 已经把 `years` 收紧为**正整数**，所以：
  //      · 走到这里时 `config.years` 一定是整数（非法值在跑之前就被挡了）；
  //      · 本文件不再做任何"修正"，只做乘法。
  //    「非法输入必须响，且必须响在跑之前」——这一行是那条纪律在运行器里的兑现点。
  if (!Number.isInteger(config.years) || config.years <= 0) {
    throw new Error(`years 必须是正整数，收到 ${JSON.stringify(config.years)}`
      + '（runner 不做四舍五入兜底；请在 Job / CLI 里写成整数）');
  }
  const totalDays = config.years * DAYS_PER_YEAR;
  const stepDays = config.stepDays;

  // 采样计划：用「下一个应采样的游戏日」做游标，而不是用浮点取模。
  // ⚠️ 语义是「**到达或越过**该日时采一次」——`stepDays` 不整除 `probeDays` 时，
  //    采样点会落在最近的推进边界上（例如 step=7 / probe=30 ⇒ 落在第 35 日）。
  //    用取模（`day % probeDays === 0`）在那种情况下会**一次都采不到**，
  //    而且不报错——整份 probes.csv 只剩表头。
  let nextProbeDay = 0;
  let nextSnapshotDay = 0;

  const sample = (day) => {
    if (!collect) return;
    if (day >= nextProbeDay) {
      probes.push(collectProbe(lab));
      // 推进到下一个严格大于当前日的采样点（避免同一日重复采）
      do { nextProbeDay += config.probeDays; } while (nextProbeDay <= day);
    }
    if (day >= nextSnapshotDay) {
      snapshots.push(collectSnapshot(lab));
      collectFateIfDue(day);
      do { nextSnapshotDay += config.snapshotDays; } while (nextSnapshotDay <= day);
    }
  };

  /**
   * 命运队列的「到点建队 + 按期采集」。
   *
   * ⚠️ 建队条件是「已达 atDay **且**实体表非空」，而不是「第一次调用就建」。
   *    两个理由各自对应一种失败：
   *      · 只按 atDay：`atDay` 小于人口成形期时建出**空队**，之后每一期都是
   *        0 成员——fate.csv 要么不存在（report 层跳过空行），要么是一堆空行，
   *        而你会以为「这个世界的个体不可追踪」；
   *      · 忽略 atDay：队列在第一次采样（可能是第 0 日）就建好，观察的是
   *        「初始人口」而不是「atDay 时的世界构成」——而那正是 B2-2 要研究的。
   *    实际建队日记在 fate.csv 第一行的 `day` 上，不猜不编。
   * ⚠️ 本函数只读 world（`selectFateQueue` 按 id 排序等距取，不抽 RNG；
   *    `collectFate` 只读实体表与名册）。开关它不得改变世界指纹——
   *    这条由自检的 B2-2 段钉死。
   */
  function collectFateIfDue(day) {
    if (!fateSpec) return;
    if (!fateQueue) {
      if (day < fateSpec.atDay) return;        // 还没到建队日：这一期不采
      const picked = selectFateQueue(world, fateSpec);
      if (picked.length === 0) return;         // 空池（人口还没落地）：等下一期
      fateQueue = picked;
    }
    const snap = collectFate(world, fateQueue, prevFate);
    prevFate = snap;
    fateSnapshots.push(snap);
  }

  // 世界初态（第 0 日）。为什么要有它：它是「变化了多少」的唯一参照，
  // 而且它把「世界建出来就是这样」与「跑了一年变成这样」分开——
  // 少了这一行，诊断里的 final_third 会拿一个没有起点的序列去算漂移。
  sample(world.day);

  const years = config.years;
  for (let y = 1; y <= years; y += 1) {
    // 契约 C1.1 在实验侧的**唯一**兑现处：视界开着才让裂缝时钟累加。
    const viewOpen = profile.viewOpenAt(y);
    for (let d = 0; d < DAYS_PER_YEAR; d += stepDays) {
      const chunk = Math.min(stepDays, DAYS_PER_YEAR - d);
      // ⚠️ **本函数里唯一会改变世界的一行。**
      //    `rng` 传 `lab.ecoRng`（与 main.js 的 this.rng 同种子）；
      //    `state` 必须长期持有（否则节流静默失效）；
      //    `riftActive` 传 profile 的视界策略。
      advanceWorld(world, chunk, {
        life: lab.life,
        upperLife: lab.upperLife,
        rng: lab.ecoRng,
        state: lab.advanceState,
        riftActive: viewOpen,
      });
      sample(world.day);
    }

    // 年结钩子（旧长测的「模拟玩家开缝」在这里）。
    // ⚠️ 它**只做夹具动作**（开缝），不推进世界——推进已经全部发生在上面那一行里。
    profile.afterYear(ctx, y);

    if (hooks.onProgress) {
      hooks.onProgress({ seed, year: y, years, day: world.day });
    }
  }

  // 收尾：把最后一段（不足一个采样间隔的尾巴）补齐。
  // ⚠️ 不补的话，`snapshotDays` 不整除总天数时报告会缺最后一年的读数，
  //    而那是「最终状态」——整份报告最重要的一行。
  if (collect && (world.day > 0) && snapshots[snapshots.length - 1].day !== world.day) {
    snapshots.push(collectSnapshot(lab));
    // B2-2：尾快照同样要带一次命运采集——否则队列的最后一行停在去年，
    //    「第 300 年谁还活着」这个问题在 fate.csv 里没有答案。
    collectFateIfDue(world.day);
  }
  if (collect && (world.day > 0) && probes[probes.length - 1].day !== world.day) {
    probes.push(collectProbe(lab));
  }

  const fingerprint = worldFingerprint(world);

  return {
    seed,
    profile: config.profile,
    preset: config.preset,
    // B1 §6.1：把**工厂实际应用**的生成参数带回来（读世界状态，不是读入参）。
    //   这样逐 seed 产物与顶层 summary 都能回答「这份数据是哪一代地图跑的」，
    //   而不是要靠人记得当时传了什么。
    generation: lab.generation,
    // B1-3：实际施加的干预（读 world 实况的注入量，不是回显入参）。
    intervention: lab.intervention,
    // B1-5：实际生效的参数覆盖（从 tunables 的**当前作用域**读，不是回显入参）。
    //   运行到这一行时仍在 `withTunables` 作用域内（runSeed 的包装），
    //   所以读到的一定是这次运行真正生效的那份覆盖，逐键可比对。
    //   ⚠️ 这是「读实况」纪律在 B1-5 的兑现：报告说改了什么，取决于
    //      作用域里真正有什么，而不是 Job 里写了什么。
    parameterOverrides: currentOverrides(),
    years,
    totalDays,
    stepDays,
    snapshots,
    probes,
    // B2-2：命运快照序列（空数组 = 没开队列）。⚠️ 它在 result 里而不是被
    //   直接写盘：runner 只负责「采集对」，写哪儿是 report.mjs 的决定
    //   （同一份 result 要被 writer / aggregate / 自检三方消费）。
    fateSnapshots,
    fingerprint,
    elapsedMs: Date.now() - startedAt,
    tally: lab.tally,
    notes: lab.notes.slice(),
    finalDay: world.day,
  };
}

/**
 * 跑一个 seed 并**吞掉异常**，把失败变成一份可记录的结果。
 *
 * 委托书 §16：「可中断 —— 每完成一个 seed 即写出结果。如果第 81 / 100 seed 崩溃：
 * 前 80 个不能全部丢失。」
 *
 * 本函数与 `runSeed` 的分工：`runSeed` 负责「跑对」，本函数负责「跑错也要留痕」。
 * 异常里**保留原始 stack**——一个只说「模拟崩溃」的报告等于没有报告。
 *
 * @returns {{ok: boolean, result: object|null, error: {message: string, stack: string}|null}}
 */
export function runSeedSafely(config, seed, hooks = {}) {
  try {
    return { ok: true, seed, result: runSeed(config, seed, hooks), error: null };
  } catch (error) {
    return {
      ok: false,
      seed,
      result: null,
      error: {
        message: error && error.message ? error.message : String(error),
        stack: error && error.stack ? error.stack : null,
      },
    };
  }
}
