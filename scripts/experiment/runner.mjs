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

import { TIME } from '../../src/inkbox/core/config.js';
import { advanceWorld } from '../../src/inkbox/sim/advance.js';
import { createLabWorld } from './world-factory.mjs';
import { profileOf } from './profiles.mjs';
import { collectProbe, collectSnapshot } from './collectors.mjs';
import { worldFingerprint } from './digest.mjs';

const DAYS_PER_YEAR = TIME.daysPerYear;

/**
 * 跑一个 seed。
 *
 * @param {object} config 已通过 `validateJob` 的配置
 * @param {number} seed
 * @param {object} [hooks]
 * @param {(info: object) => void} [hooks.onProgress] 进度回调（只用于 stdout 的简洁进度行）
 * @returns {object} 结果包（见下方 return）
 */
export function runSeed(config, seed, hooks = {}) {
  const profile = profileOf(config.profile);
  if (!profile) throw new Error(`未知 profile「${config.profile}」`);

  const startedAt = Date.now();
  const lab = createLabWorld({ seed, preset: config.preset, profile: config.profile });
  const { world, ctx } = lab;

  const collect = config.collect !== false;
  const snapshots = [];
  const probes = [];

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
      do { nextSnapshotDay += config.snapshotDays; } while (nextSnapshotDay <= day);
    }
  };

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
  }
  if (collect && (world.day > 0) && probes[probes.length - 1].day !== world.day) {
    probes.push(collectProbe(lab));
  }

  const fingerprint = worldFingerprint(world);

  return {
    seed,
    profile: config.profile,
    preset: config.preset,
    years,
    totalDays,
    stepDays,
    snapshots,
    probes,
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
