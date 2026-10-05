// World Laboratory · 世界工厂（委托书 §6）
//
// ───────────────────────────────────────────────────────────────────────
// 职责边界：**只建世界，不跑世界**
// ───────────────────────────────────────────────────────────────────────
//
// 委托书 §6 给 world-factory 的职责清单是：
//   · 根据 seed / preset 创建凡界；
//   · 建 UpperLife；
//   · 建 Nether；
//   · 创建 AdvanceState；
//   · 创建各自独立 RNG；
//   · 根据 profile 注入 fixture；
//   · **不负责运行实验**。
//
// 最后一条是刻意的：把「世界长什么样」与「世界怎么走」分开，于是
// 「同 seed 同 profile 建两次世界必须逐字段相同」这件事可以被**单独**验证，
// 而不必跑三百年。诊断「世界线为什么漂了」时，这是唯一能快速二分的地方。
//
// ───────────────────────────────────────────────────────────────────────
// 三条随机流的纪律（这是本文件最需要小心的部分）
// ───────────────────────────────────────────────────────────────────────
//
// 委托书 §14 要求「必须沿用项目现有确定性 RNG 纪律」。本文件建的流与
// `main.js` / `inkbox-longrun.mjs` **逐一对应**，且**不新增第四条**：
//
//   ① `lifeRng = mulberry32(world.seed ^ 0xa5a5a5a5)`
//      —— 凡间**主随机流**。全世界共用一条。`main.js:563` 与
//      `inkbox-longrun.mjs:100` **逐字相同**。
//      ⚠️ 它是唯一一条「多抽一次就整条世界线漂走」的流。实验框架的采集器
//         绝不许碰它（`collector purity` 测试守的就是这一条）。
//
//   ② `ecoRng = mulberry32(12345)`
//      —— 植被 / 野火用的流。`main.js:434` 的 `this.rng` 与
//      `inkbox-longrun.mjs:158` 的 `ecoRng` **逐字相同**。
//      ⚠️ 为什么生态要单独一条：混用会让「加了植被模拟」这件事反过来改变
//         生灵的生死判定，两条世界线就没法对比了。
//
//   ③ 上界 / 幽冥 / 裂隙 / 鬼影的流**不在这里建**——它们由各自的模块
//      从 `seed` 派生（`UpperLife` 构造器、`deriveNetherSeed`、
//      `rifts.js` 的裂隙流、`wraiths.js` 的 `0x4841554e`）。
//      本文件**不预先派生、不代为传递**：先派生一次再传进去会**静默**退回
//      原种子（异或自逆），而 `main.js:646-651` 已经把这个坑写进注释了。
//
// ⚠️ 严禁 `Math.random()`。委托书 §14 点名禁止。本文件全文没有它。

import { generateWorld } from '../../src/inkbox/world/worldgen.js';
import { generateUpperWorld, recomputeUpperQi } from '../../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../../src/inkbox/world/worldgenNether.js';
import { WORLD_PRESETS } from '../../src/inkbox/core/config.js';
import { mulberry32 } from '../../src/inkbox/core/noise.js';
import { Life } from '../../src/inkbox/sim/life.js';
import { UpperLife } from '../../src/inkbox/sim/upperLife.js';
import { createAdvanceState } from '../../src/inkbox/sim/advance.js';
import { profileOf } from './profiles.mjs';

/** 凡间主随机流的派生键。与 `main.js:563` / `inkbox-longrun.mjs:100` 逐字相同。 */
export const LIFE_RNG_KEY = 0xa5a5a5a5;

/** 生态（植被 / 野火）随机流的种子。与 `main.js:434` / `inkbox-longrun.mjs:158` 逐字相同。 */
export const ECO_RNG_SEED = 12345;

/**
 * 建一个可以跑实验的世界。
 *
 * @param {object} spec
 * @param {number} spec.seed   凡间种子（上界 / 幽冥的种子在各自生成器内部派生）
 * @param {string} spec.preset `WORLD_PRESETS` 的键
 * @param {string} spec.profile `PROFILES` 的键
 * @returns {{
 *   seed: number, presetKey: string, profileName: string,
 *   world: object, upper: object, nether: object,
 *   life: object, upperLife: object, advanceState: object, ecoRng: () => number,
 *   tally: object, notes: string[]
 * }}
 */
export function createLabWorld({ seed, preset, profile }) {
  const presetDef = WORLD_PRESETS[preset];
  if (!presetDef) throw new Error(`未知预设「${preset}」`);
  const profileDef = profileOf(profile);
  if (!profileDef) throw new Error(`未知 profile「${profile}」`);

  const notes = [];

  // ── 凡界 ─────────────────────────────────────────────────────
  // `scatter: true` 是委托书 §5 Profile A 明文要求的（也是 main.js 新开局的形态）。
  const world = generateWorld({ preset: presetDef, seed, scatter: true });

  // ── 凡间主循环 ───────────────────────────────────────────────
  // ⚠️ 用 `world.seed` 而不是入参 `seed`：`World` 构造器会对种子做归一，
  //    两者在边界值上可能不同。旧长测用的也是 `world.seed`，保持一致。
  const life = new Life(world, mulberry32(world.seed ^ LIFE_RNG_KEY));

  // ── 上界（与 `main.js` 的 `attachUpper` 同款）─────────────────
  // 为什么必须建：不建 `world.upper`，`ascend()` 的 `arriveUpper` 找不到落点，
  // 飞升者会凭空消失，而**不会有任何断言变红**——只是「上界人数恒 0」。
  const upper = generateUpperWorld({ preset: presetDef, seed });
  recomputeUpperQi(upper);
  world.upper = upper;
  const upperLife = new UpperLife(upper);

  // ── 幽冥（与 `main.js` 的 `attachNether` 同款）────────────────
  // ⚠️ **必须在主循环之前挂**：`openRifts(..., 'nether')` 的第 0 步会检查
  //    `world.nether` 在不在，缺了就整条拒掉（`reason: 'no-plane'`）——
  //    于是四条跨界通道一条都跑不到，而长测会印出一片干净的 0。
  //    旧长测脚本**从来没有建过幽冥**，这是 D6-3 工程包 E 补的洞。
  // ⚠️ `seed` 传**凡间的原值**：派生在生成器内部做。先派生再传会静默退回凡间种子。
  // ⚠️ `world.wraiths` 不必在这里建：`spawnWraith` 会惰性建它。
  const nether = generateNetherWorld({ preset: presetDef, seed });
  world.nether = nether;

  // ── 全部「游戏日驱动」时钟的累加器 ────────────────────────────
  // 与真实游戏的 `main.js` 的 `this.advanceState` 是**同一种东西**。
  const advanceState = createAdvanceState();

  // ── 生态流 ───────────────────────────────────────────────────
  const ecoRng = mulberry32(ECO_RNG_SEED);

  // ── 夹具计数（诊断用，进 runtime.json）───────────────────────
  // ⚠️ 夹具的副作用必须**可数**。旧长测靠 `riftOpenedByPlayer` 与
  //    `riftLog.opened` 交叉核对「玩家模拟到底开了几道缝」；少了这个数，
  //    「缝没开出来」与「缝开了但没统计」在报告上长得一模一样。
  const tally = {
    extraPopulationGroups: 0,
    extraPopulationCount: 0,
    riftOpenedUpper: 0,
    riftOpenedNether: 0,
    riftRefusedUpper: [],
    riftRefusedNether: [],
  };

  const ctx = { world, upper, nether, life, upperLife, advanceState, ecoRng, seed, preset, profile, tally, notes };

  // ── 夹具注入 ─────────────────────────────────────────────────
  const extra = profileDef.extraPopulation;
  if (extra) {
    const before = world.pendingSpawns.length;
    profileDef.beforeRun(ctx);
    tally.extraPopulationGroups = world.pendingSpawns.length - before;
    tally.extraPopulationCount = tally.extraPopulationGroups * extra.count;
  } else {
    profileDef.beforeRun(ctx);   // natural 的 beforeRun 是空实现；照调，保持契约统一
  }

  // ── 夹具坐标与预设的咬合检查 ─────────────────────────────────
  // ⚠️ 这不是断言，是**观察**：夹具坐标是按 medium 标定的，换预设时站点会落空
  //    （`openRifts` 把坐标 clamp 到边界 → 候选格过滤后返回 `no-site`）。
  //    那不是崩溃，是实验条件变了——但必须在报告里看得见，
  //    否则「legacy-longrun 在 small 上跑出全 0 的裂缝读数」会被误读成
  //    「裂缝系统坏了」。委托书 §5 的原话：「若无法逐字复现，应记录差异。」
  if (profileDef.calibratedPreset && profileDef.calibratedPreset !== preset) {
    notes.push(
      `profile_preset_mismatch: profile「${profile}」的夹具坐标按 preset「${profileDef.calibratedPreset}」标定，`
      + `本次用「${preset}」（${presetDef.w}×${presetDef.h}）。站点可能落在界外 ⇒ 开缝返回 no-site。`,
    );
  }

  return {
    seed,
    presetKey: preset,
    profileName: profile,
    world,
    upper,
    nether,
    life,
    upperLife,
    advanceState,
    ecoRng,
    tally,
    notes,
    ctx,
  };
}
