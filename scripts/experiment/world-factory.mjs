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
import { createMapProgress } from '../../src/inkbox/world/mapProgress.js';
import { Life } from '../../src/inkbox/sim/life.js';
import { UpperLife } from '../../src/inkbox/sim/upperLife.js';
import { createAdvanceState } from '../../src/inkbox/sim/advance.js';
import { profileOf, applyIntervention } from './profiles.mjs';

/** 凡间主随机流的派生键。与 `main.js:375` / `inkbox-longrun.mjs` 逐字相同。 */
export const LIFE_RNG_KEY = 0xa5a5a5a5;

/** 生态（植被 / 野火）随机流的种子。与 `main.js:226` / `inkbox-longrun.mjs` 逐字相同。 */
export const ECO_RNG_SEED = 12345;

/**
 * 世界生成的默认版本与地理预设（B1 §0.3）。
 *
 * ⚠️⚠️ 这两个缺省值是本文件**改过的一处**，理由是委托书 §0.3 点名的
 *     「M2-C2E 新世界生成差异」——旧 B0 factory 调的是
 *     `generateWorld({ preset, seed, scatter: true })`，一个版本参数都不传，
 *     于是 `generationVersion` 取到 `worldgen.js` 的缺省 **1** ⇒ **旧地形**。
 *     而产品路径（`ui/worldCreation.js` 的 `creationOptions`）缺省是
 *     `generationVersion: 2` / `terrainPreset: 'standard'`（M2-C2E 的新体系，
 *     多一道 `smoothGeneratedHeight` 稳定邻域滤波）。
 *
 *     两者跑出来的**是两张不同的地图**，而报告上只会写「preset=medium」——
 *     完全自洽，看不出差别。这正是委托书 §0.3 要求「明确记录
 *     `generationVersion` / `terrainPreset` 与实际创建参数」的原因：
 *     参数不写进 Job 与 manifest，新旧结果就会被静默混进同一份统计。
 *
 *     所以 B1 起：**缺省对齐产品**（v2 + standard），并且把实际值原样
 *     写进 manifest。要跑旧地形必须**显式**传 `generationVersion: 1`——
 *     「显式」是刻意的摩擦：v1 与 v2 的数值结果**不许直接混合统计**。
 */
export const DEFAULT_GENERATION_VERSION = 2;
export const DEFAULT_TERRAIN_PRESET = 'standard';

/** 合法地理生成类型（与 `worldGeneration.js` 的 `TERRAIN_PRESETS` 同源）。 */
export const TERRAIN_PRESET_NAMES = Object.freeze(['standard', 'mountains', 'wetlands']);
/** 合法世界生成版本。v1 = 旧地形（无邻域滤波）；v2 = M2-C2E 新地形。 */
export const GENERATION_VERSIONS = Object.freeze([1, 2]);

/**
 * 建一个可以跑实验的世界。
 *
 * @param {object} spec
 * @param {number} spec.seed   凡间种子（上界 / 幽冥的种子在各自生成器内部派生）
 * @param {string} spec.preset `WORLD_PRESETS` 的键
 * @param {string} spec.profile `PROFILES` 的键
 * @param {number} [spec.generationVersion] 世界生成版本（缺省 2，对齐产品）
 * @param {string} [spec.terrainPreset] 地理生成类型（缺省 standard）
 * @param {boolean} [spec.progressive] 地图渐进开放（缺省 false；**只影响可访问边界**，
 *   不改变模拟状态——见下面 `mapProgress` 那一段的说明）
 * @returns {{
 *   seed: number, presetKey: string, profileName: string,
 *   world: object, upper: object, nether: object,
 *   life: object, upperLife: object, advanceState: object, ecoRng: () => number,
 *   tally: object, notes: string[], lifeRngDraws: number
 * }}
 */
export function createLabWorld({
  seed, preset, profile,
  generationVersion = DEFAULT_GENERATION_VERSION,
  terrainPreset = DEFAULT_TERRAIN_PRESET,
  progressive = false,
  intervention = null,
}) {
  const presetDef = WORLD_PRESETS[preset];
  if (!presetDef) throw new Error(`未知预设「${preset}」`);
  const profileDef = profileOf(profile);
  if (!profileDef) throw new Error(`未知 profile「${profile}」`);

  // ⚠️ 版本 / 地理类型**不在这里兜底**：调用方（Job 校验）已经在跑之前报过错了。
  //    这里只做最后一道「不可能发生」的守卫——因为静默把非法值换成合法值
  //    正是委托书 §7 点名禁止的 fallback。
  if (!GENERATION_VERSIONS.includes(generationVersion)) {
    throw new Error(`未知 generationVersion「${generationVersion}」；允许：${GENERATION_VERSIONS.join(', ')}`);
  }
  if (generationVersion >= 2 && !TERRAIN_PRESET_NAMES.includes(terrainPreset)) {
    throw new Error(`未知 terrainPreset「${terrainPreset}」；允许：${TERRAIN_PRESET_NAMES.join(', ')}`);
  }

  const notes = [];

  // ── 凡界 ─────────────────────────────────────────────────────
  // `scatter: true` 是委托书 §5 Profile A 明文要求的（也是 main.js 新开局的形态）。
  //
  // ⚠️ 逐字对齐产品路径（`ui/worldCreation.js:createSandboxWorld`）：
  //    `generateWorld({ preset, seed, scatter: true, generationVersion, terrainPreset })`
  //    然后按 `progressive` 决定建不建 `mapProgress`。
  //    这两步合起来才等于产品建出一个世界时发生的事。
  //
  // ⚠️ v1 时 `terrainPreset` 不参与生成（`worldgen.js` 只在 v2 读它），
  //    但仍然传进去并由 `world.generation` 记录实况——
  //    「参数是什么」与「参数有没有生效」是两件事，都要留在 metadata 里。
  const world = generateWorld({
    preset: presetDef, seed, scatter: true, generationVersion, terrainPreset,
  });

  // ── 地图渐进开放（B1 §0.3 末段）──────────────────────────────
  //
  // ⚠️ 语义边界，务必分清：
  //   · `mapProgress` 是**视觉可访问边界**（`core/mapAccess.js` 的只读策略），
  //     它影响的只有相机夹取、图层绘制的可见范围；
  //   · 它**不改变** `world.height` / `world.entities` / 模拟推进。
  //   ⇒ 所以它是「渲染侧的一次操作」，不是「真正改变模拟状态的操作」。
  //     委托书 §0.3 要求把这两者分开记录，本文件的做法是：
  //     建世界时默认 `progressive: false`（= 产品默认，删掉 mapProgress），
  //     并把实际值记进 `notes` / `lab.generation`。
  //   要研究「渐进开放」本身，应当把 `progressive: true` 写进 Job 元数据，
  //   并在报告里明确它是**视觉**变量。
  //
  // ⚠️ 用官方 `createMapProgress`（`world/mapProgress.js`）而不是手写
  //    `{version:1, stage:0}`：那个形状是**产品侧的事实**，散落出第二份副本
  //    哪天产品改了 `mapProgress` 的字段，实验侧就会写出一个产品和读档
  //    都不认识的对象——而两边的报告看起来都正常。
  createMapProgress(world, progressive);


  // ── 凡间主循环 ───────────────────────────────────────────────
  // ⚠️ 用 `world.seed` 而不是入参 `seed`：`World` 构造器会对种子做归一，
  //    两者在边界值上可能不同。旧长测用的也是 `world.seed`，保持一致。
  //
  // ── B0.1 · 主随机流 draw count ───────────────────────────────
  //
  // 把 `mulberry32` 包一层计数闭包：**取到的值一位不变**，只是每次调用 +1。
  //
  // ⚠️ 为什么包装是安全的（而不是「我们小心了」）：`mulberry32` 的状态在
  //    它自己的闭包里，包装函数只是 `return base()`。所以「抽了多少次」与
  //    「抽到了什么」在结构上不可能互相影响——包装不会多抽、不会少抽、
  //    不会改种子、不会改调用顺序。
  //
  // ⚠️ 为什么不改 `life.js`：那样等于给模拟加一条「观测依赖」，而模拟侧
  //    一旦有了计数开关，就必须回答「关掉计数会不会改变世界线」。
  //    放在这里，答案天然是「不会」——计数活在实验框架里，模拟完全不知情。
  //
  // 用途：把「这个世界消耗了多少随机性」变成一个可读的数。它是
  // **单调递增**的，所以后段斜率 = 随机消耗速率；两条 profile 并排比时，
  // 「加了夹具之后随机消耗涨了多少」第一次可见。
  const baseLifeRng = mulberry32(world.seed ^ LIFE_RNG_KEY);
  let lifeRngDraws = 0;
  const lifeRng = function countedLifeRng() {
    lifeRngDraws += 1;
    return baseLifeRng();
  };
  const life = new Life(world, lifeRng);

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

  // ── B1-3 · 受控干预注入 ───────────────────────────────────────
  //
  // ⚠️ 干预在**夹具之后**施加，且只有 `intervention` profile 会真正做事
  //    （其他 profile 传 `intervention=null` ⇒ `applyIntervention` 立刻返回 none）。
  //    这样做的理由是保持「一处施加、一处记录」：干预的实际效果读 world 实况，
  //    进 manifest，而不是靠调用方记得自己传了什么。
  //
  // ⚠️ 若 profile 不是 `intervention` 却传了非空 `intervention`，说明调用方
  //    以为在跑干预实验而实际没有——这是「合法但不是用户请求的实验」，
  //    必须当场报错（与 job-schema 同一条纪律）。
  if (intervention && intervention.kind && intervention.kind !== 'none' && profile !== 'intervention') {
    throw new Error(`Profile「${profile}」不接受 intervention（收到 kind=${intervention.kind}）。`
      + '受控干预必须用 profile=intervention，否则干预会被静默忽略而报告上看起来像做了实验。');
  }
  const interventionDesc = (profile === 'intervention')
    ? applyIntervention(ctx, intervention)
    : { kind: 'none', requested: null, applied: null, injectedSpawns: 0, injectedEntities: 0 };
  if (interventionDesc.kind !== 'none') {
    notes.push(`intervention_applied: ${interventionDesc.kind} `
      + `(${interventionDesc.injectedSpawns} 点 / ${interventionDesc.injectedEntities} 人)`);
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
    // ── B1 §0.3 · 实际创建参数（不是「请求的参数」）────────────────
    //
    // ⚠️ 这三项读的是 **world 上的实况**，不是入参。理由：入参写 2、而模拟
    //    实际按 1 跑（比如未来某天 `worldgen.js` 改了缺省），报告上会印一个
    //    「v2」而世界是 v1 —— 那正是 §0.3 要防的静默混统计。
    //    实况的来源：`world.generation`（v2 才建）与 `world.mapProgress`。
    generation: {
      // 请求值（入参）
      requestedVersion: generationVersion,
      requestedTerrain: terrainPreset,
      // 实况值（世界上的）
      appliedVersion: world.generation?.version ?? 1,
      appliedTerrain: world.generation?.terrainPreset ?? null,
      // 地图渐进开放：`null` = 关（世界没有 mapProgress），否则是 stage 对象。
      mapProgress: world.mapProgress ? { ...world.mapProgress } : null,
    },
    // B1-3：实际施加的干预（读 world 实况的注入量，不是回显入参）。
    intervention: interventionDesc,
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
    /**
     * B0.1 · 凡间主随机流累计抽签次数（只读）。
     *
     * ⚠️ 用 getter 而不是快照值：`createLabWorld` 返回后主循环还会跑几百年，
     *    快照值会永远停在 0。getter 让采集器每次都能读到当前值。
     */
    get lifeRngDraws() { return lifeRngDraws; },
  };
}
