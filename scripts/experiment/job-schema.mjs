// World Laboratory · Job 校验（委托书 §7）
//
// ───────────────────────────────────────────────────────────────────────
// 立场：**非法输入必须响，且必须响在跑之前**
// ───────────────────────────────────────────────────────────────────────
//
// 委托书 §7 的原话是：「实验系统必须验证配置。非法输入应：输出明确错误；
// exit code 非 0；**不静默 fallback**。」
//
// 这三条里最贵的是第三条。一个静默 fallback 的实验框架会这样坏掉：
// 你传 `--years=3000`（多打了一个 0），它悄悄按 800 跑完，出了报告，
// 你拿着报告去调参数——**而且永远查不出来**，因为报告上写的也是 800，
// 看起来完全自洽。
//
// 所以本文件对**未知字段**也报错（`strict keys`）。这看起来苛刻，
// 但它挡住的是最常见的真实事故：把 `stepDays` 写成 `stepdays`、
// 把 `seeds` 写成 `seed`——JS 不报错，实验照跑，只是跑的不是你要的那个。
//
// ⚠️ 本文件是**纯校验**：不读文件、不建世界、不打印。它把「能不能跑」
//    与「怎么跑」分开，于是校验逻辑本身可以在自检脚本里被逐条测试。

import { WORLD_PRESETS } from '../../src/inkbox/core/config.js';
import { PROFILE_NAMES, profileDefaultViewPolicy, INTERVENTION_KINDS } from './profiles.mjs';
import { GENERATION_VERSIONS, TERRAIN_PRESET_NAMES } from './world-factory.mjs';
import { TUNABLE_NAMES, tunableMeta } from '../../src/inkbox/sim/tunables.js';
// B2-2：命运队列的白名单从 fate-queue.mjs 取（**一处定义**，理由见该文件的
//   FATE_FILTERS 注释）。job-schema 已经经 world-factory 传递加载整个 sim，
//   所以这一行不引入新的依赖面。
import { FATE_FILTERS, FATE_QUEUE_KEYS, fateQueueSpec } from './fate-queue.mjs';

/**
 * Job 文件格式版本。改了字段语义就 +1——云端要靠它决定怎么读。
 *
 * ── 版本历史 ──────────────────────────────────────────────────────
 * v1 → v2（B0.1 §8 / §10）：
 *   · `years` 从「正数」收紧为「**正整数**」。
 *     旧版允许 `years: 3.7`，而 `runner.mjs` 会 `Math.round` 成 4 ——
 *     那是本文件头点名要禁止的**静默 fallback**，而且是最隐蔽的一种：
 *     报告上写着 4，看起来完全自洽，你永远查不出自己要的是 3.7。
 *     B0.1 的裁决是「要整数」而不是「真支持小数」，因为小数年在
 *     `Math.floor(day / daysPerYear)` 的年号口径下没有定义明确的意义。
 *   · 新增可选字段 `worker`：单 seed worker 模式（云实验用）。
 *
 * v2 → v3（B1 §6.1）：
 *   · 新增 `generationVersion` / `terrainPreset`（**必填**）——
 *     M2-C2E 起世界生成有两套体系（v1 旧地形 / v2 邻域滤波），
 *     两者跑出来是两张不同的地图。不写进 Job，新旧结果会被静默混进
 *     同一份统计，而报告上只印「preset=medium」，看不出差别。
 *   · 新增可选 `progressive`（地图渐进开放；**视觉变量**，不改模拟状态）。
 *   · 新增可选 `experimentGroup`（实验分组标签，进 manifest，便于横向对比）。
 *
 * ⚠️ 为什么 `generationVersion` / `terrainPreset` 是**必填**而不是给个默认：
 *    委托书 §6.1 的原话是「不能因为缺失字段就静默改成一个合法但不是用户
 *    请求的实验」。给默认值恰好就是那句话禁止的事——一份没写 terrainPreset
 *    的 Job 会在「群山世界」的实验里悄悄按「标准世界」跑完，而两边报告
 *    长得一模一样。所以：缺失 ⇒ 报错，跑之前就报。
 *
 * v3（B1-3 增补，**不改版本号**）：
 *   · 新增可选字段 `intervention`（受控干预，仅 `profile=intervention` 生效）。
 *     形状随 kind 演化，故**只做 kind 级校验**（见 validateJob）；加字段不改
 *     版本号，因为「没写 intervention」与 v3 已有 Job 的语义完全一致（都是无干预）。
 *
 * v3（B1-5 增补，**不改版本号**）：
 *   · 新增可选字段 `parameterOverrides`（可调参数覆盖，仅 `profile=sensitivity` 生效）。
 *     同样是**只在原 Job 上新增一个可选字段**：不写 ⇒ 语义与旧 v3 Job 完全相同
 *     （零覆盖 ≡ 默认），故版本号不必动。为什么必须与 `sensitivity` profile 绑定、
 *     且为什么键必须来自 `TUNABLE_NAMES`：见 validateJob 里该段的注释。
 *
 * v3（B2-2 增补，**不改版本号**）：
 *   · 新增可选字段 `fateQueue`（人物命运观察队列，任何 profile 生效）。
 *     与上两条同口径：不写 ⇒ 队列不建、不采集、不产 fate.csv，语义与旧 v3 Job
 *     完全一致。它与 intervention / parameterOverrides 的差别在于**作用面**：
 *     后两者改变「世界怎么跑」，fateQueue 只改变「多记一份读数」——它是纯采集，
 *     所以不绑定任何 profile。相应地，它必须满足更硬的一条纪律：开关它不得改变
 *     世界指纹（`inkbox-experiment-selftest.mjs` 的 B2-2 段钉死）。
 *     为什么 still 要在这里严格校验形状：一份 `fateQueue: {max: 0}` 若被静默
 *     忽略，跑出来的就是一份「没有命运数据」的实验，而报告目录里什么都没有——
 *     这种缺失**没有任何痕迹**，比报错危险得多。
 *
 * ⚠️ 为什么增补字段时**不改版本号**：schemaVersion 的语义是「怎么读这份 Job」。
 *    新增一个**带严格默认**（不写=无操作）的可选字段，不改变任何旧 Job 的读法，
 *    相应地也不该让旧 Job 失效。真正需要 +1 的是「改了已有字段的语义」
 *    （如 v2→v3 把 `years` 从「正数」收紧为「正整数」）。
 */
export const JOB_SCHEMA_VERSION = 3;

/** 允许的采样策略。`closed` = 视界从不打开；`legacy-duty-cycle` = 旧长测的 25% 占空比。 */
export const VIEW_POLICIES = Object.freeze(['closed', 'legacy-duty-cycle']);

/**
 * 允许出现在 Job 里的全部键。**多余的键一律报错**（理由见文件头）。
 * 新增字段时必须同时加进这里，否则它会被当成拼写错误挡下来——这是有意的。
 */
export const JOB_KEYS = Object.freeze([
  'schemaVersion', 'experiment', 'profile', 'preset', 'seeds', 'years',
  'stepDays', 'snapshotDays', 'probeDays', 'viewPolicy',
  // ── B1 §6.1：世界生成元数据（必填，理由见 JOB_SCHEMA_VERSION 注释）──
  'generationVersion', 'terrainPreset',
  // ── B1 §6.1：可选元数据 ─────────────────────────────────────
  'progressive', 'experimentGroup',
  // ── B1-3：受控干预（仅 profile=intervention 时生效）──────────
  'intervention',
  // ── B1-5：可调参数覆盖（仅 profile=sensitivity 时生效）───────
  'parameterOverrides',
  // ── B2-2：人物命运观察队列（纯采集，任何 profile 生效）────────
  'fateQueue',
  // 运行控制（不影响世界线，只影响「跑不跑 / 跑完写哪儿」）
  'collect', 'outputRoot', 'failFast',
  // B0.1 §10：云实验的单 seed worker 开关（见 validateJob 的说明）
  'worker',
]);

/** 各 profile 的语义硬约束：profile 名 ⟹ viewPolicy 取值。理由见 `validateJob`。 */
const PROFILE_VIEW_POLICY = Object.freeze({
  natural: 'closed',
  'legacy-longrun': 'legacy-duty-cycle',
  // B1-3：干预本身**不开视界**（干预是「注入初始条件」，不是「模拟玩家看世界」）。
  //   若将来要研究「开视界 × 干预」的交互，应当新增一个 profile，而不是在这里放开。
  intervention: 'closed',
  // B1-5：参数敏感性同样**不开视界**。敏感性研究的是「平衡常量 → 世界轨迹」，
  //   与「玩家看世界」是两件事。混在一起就无法把「参数变了」与「视界开了」
  //   分离开——而分不清哪个因素造成的差异，整个实验就没有信息量。
  sensitivity: 'closed',
});

const DEFAULT_OUTPUT_ROOT = 'reports/inkbox/experiments';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isPositiveNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function isPositiveInt(v) {
  return isPositiveNumber(v) && Number.isInteger(v);
}

/** 实验 id 只允许安全字符：它会被用作**目录名**。 */
const EXPERIMENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * 校验一份 Job（或 CLI 组装出来的同形对象）。
 *
 * @param {unknown} raw
 * @returns {{ok: boolean, errors: string[], config: object|null}}
 *   `errors` 是**人话**的逐条原因（不抛异常——调用方要能一次把所有错都印出来，
 *   而不是修一个跑一次）。`config` 只在 `ok === true` 时非空，且**已补齐默认值**。
 */
export function validateJob(raw) {
  const errors = [];
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ['Job 必须是一个 JSON 对象'], config: null };
  }

  // ── 未知键：报错，不忽略 ──────────────────────────────────────
  for (const key of Object.keys(raw)) {
    if (!JOB_KEYS.includes(key)) {
      errors.push(`未知字段「${key}」；允许的字段：${JOB_KEYS.join(', ')}`);
    }
  }

  // ── schemaVersion ────────────────────────────────────────────
  if (raw.schemaVersion !== JOB_SCHEMA_VERSION) {
    errors.push(`schemaVersion 必须是 ${JOB_SCHEMA_VERSION}，收到 ${JSON.stringify(raw.schemaVersion)}`);
  }

  // ── experiment ───────────────────────────────────────────────
  if (typeof raw.experiment !== 'string' || !raw.experiment.trim()) {
    errors.push('experiment 必须是非空字符串（会作为输出目录名）');
  } else if (!EXPERIMENT_ID_RE.test(raw.experiment)) {
    errors.push(`experiment「${raw.experiment}」含不安全字符；只允许字母 / 数字 / . _ -，且首字符必须是字母或数字`);
  }

  // ── profile ──────────────────────────────────────────────────
  if (!PROFILE_NAMES.includes(raw.profile)) {
    errors.push(`profile 必须是 ${PROFILE_NAMES.join(' / ')} 之一，收到 ${JSON.stringify(raw.profile)}`);
  }

  // ── preset ───────────────────────────────────────────────────
  if (!Object.keys(WORLD_PRESETS).includes(raw.preset)) {
    errors.push(`preset 必须是 ${Object.keys(WORLD_PRESETS).join(' / ')} 之一，收到 ${JSON.stringify(raw.preset)}`);
  }

  // ── 世界生成元数据（B1 §6.1 起必填）──────────────────────────
  //
  // ⚠️ 这两项**不给默认值**。理由见 JOB_SCHEMA_VERSION 的注释：
  //    默认值 = 静默 fallback = 一份「群山世界」的实验按「标准世界」跑完，
  //    而报告上只写 preset=medium，两边看起来完全一样。
  //    所以「没写」是一个**必须被看见**的错误，不是一次可以容忍的省略。
  if (!GENERATION_VERSIONS.includes(raw.generationVersion)) {
    errors.push(`generationVersion 必须是 ${GENERATION_VERSIONS.join(' / ')} 之一`
      + `（1 = 旧地形，2 = M2-C2E 新地形），收到 ${JSON.stringify(raw.generationVersion)}。`
      + '⚠️ 该字段必填：v1 与 v2 生成的**是两张不同的地图**，缺省会让新旧结果被静默混统计。');
  }
  if (raw.generationVersion === 1 && raw.terrainPreset !== 'standard') {
    // v1 不读 terrainPreset（`worldgen.js` 只在 v2 用它）。写一个非 standard 的
    // 地理类型而版本是 1，说明调用方以为自己在跑群山世界——而实际上不会。
    // 这是「合法但不是用户请求的实验」，必须报错。
    errors.push(`generationVersion: 1 时 terrainPreset 只能是 'standard'，收到 ${JSON.stringify(raw.terrainPreset)}。`
      + 'v1 是旧地形，不读地理类型参数；要有群山 / 水泽请用 generationVersion: 2。');
  } else if (!TERRAIN_PRESET_NAMES.includes(raw.terrainPreset)) {
    errors.push(`terrainPreset 必须是 ${TERRAIN_PRESET_NAMES.join(' / ')} 之一，收到 ${JSON.stringify(raw.terrainPreset)}。`
      + '⚠️ 该字段必填，理由同 generationVersion。');
  }

  // ── seeds ────────────────────────────────────────────────────
  if (!Array.isArray(raw.seeds) || raw.seeds.length === 0) {
    errors.push('seeds 必须是至少含一个元素的数组');
  } else {
    const bad = raw.seeds.filter((s) => !Number.isInteger(s) || s < 0);
    if (bad.length) errors.push(`seeds 必须是非负整数，收到 ${JSON.stringify(bad)}`);
    const dupes = raw.seeds.filter((s, i) => raw.seeds.indexOf(s) !== i);
    if (dupes.length) errors.push(`seeds 含重复项 ${JSON.stringify([...new Set(dupes)])}（重复跑同一个 seed 会覆盖前一次的输出）`);
  }

  // ── 时间轴 ───────────────────────────────────────────────────
  // ⚠️ years 是**正整数**，不是「正数」（B0.1 §8）。
  //    旧版允许 3.7 而 runner 悄悄 round 成 4 —— 见 JOB_SCHEMA_VERSION 的注释。
  //    这里报错而不是继续 round：让「你写错了」在跑之前就可见。
  if (!isPositiveInt(raw.years)) {
    errors.push('years 必须是正整数（游戏年）。B0.1 起不再接受小数：'
      + '旧版会把 3.7 静默四舍五入成 4，报告上看起来完全正常。'
      + (isPositiveNumber(raw.years) ? `收到 ${raw.years}，请显式写成 ${Math.round(raw.years)}。` : `收到 ${JSON.stringify(raw.years)}。`));
  }
  if (!isPositiveInt(raw.stepDays)) errors.push('stepDays 必须是正整数（每次 advanceWorld 推进的游戏日）');
  if (!isPositiveNumber(raw.snapshotDays)) errors.push('snapshotDays 必须是正数（快照间隔，游戏日）');
  if (!isPositiveNumber(raw.probeDays)) errors.push('probeDays 必须是正数（探针间隔，游戏日）');
  if (isPositiveNumber(raw.snapshotDays) && isPositiveNumber(raw.probeDays) && raw.probeDays > raw.snapshotDays) {
    errors.push('probeDays 不应大于 snapshotDays：探针的用途是补上快照之间的短时窗口');
  }
  if (isPositiveInt(raw.stepDays) && isPositiveNumber(raw.probeDays) && raw.probeDays < raw.stepDays) {
    errors.push('probeDays 小于 stepDays：每次推进跨过了整个探针间隔，探针会漏点');
  }

  // ── viewPolicy + profile 的语义咬合 ──────────────────────────
  // ⚠️ 这一条是本文件**最值钱**的检查，理由：
  //    `natural` 的定义是「没有玩家干预时世界自身会如何运行」（委托书 §5），
  //    而**开视界就是玩家操作**（`main.js` 的 `riftViewOpen()` 只在玩家
  //    切到上界/幽冥视界时为真）。若允许 `natural + legacy-duty-cycle`，
  //    得到的既不是自然世界、也不是旧长测——它是一个**没有名字的第三种东西**，
  //    而报告上会写着「natural」。委托书 §5 末尾点名禁止的正是这种命名。
  //    要跑「世界相同、但玩家一直开着视界」，应当新增一个 profile
  //    （§6 预留的 `observer`），而不是拿 natural 拧一个旋钮。
  if (!VIEW_POLICIES.includes(raw.viewPolicy)) {
    errors.push(`viewPolicy 必须是 ${VIEW_POLICIES.join(' / ')} 之一，收到 ${JSON.stringify(raw.viewPolicy)}`);
  } else if (PROFILE_NAMES.includes(raw.profile)) {
    const pinned = PROFILE_VIEW_POLICY[raw.profile];
    if (raw.viewPolicy !== pinned) {
      errors.push(`profile「${raw.profile}」的语义要求 viewPolicy = 「${pinned}」，收到「${raw.viewPolicy}」。`
        + '要换视界策略请新增一个 profile（见 scripts/experiment/profiles.mjs），不要复用现有名字。');
    }
  }

  // ── 运行控制（可选）──────────────────────────────────────────
  if (raw.collect !== undefined && typeof raw.collect !== 'boolean') {
    errors.push('collect 必须是布尔值（false = 关掉全部采集，用于 collector purity 验证）');
  }
  if (raw.outputRoot !== undefined && (typeof raw.outputRoot !== 'string' || !raw.outputRoot.trim())) {
    errors.push('outputRoot 必须是非空字符串');
  }
  if (raw.failFast !== undefined && typeof raw.failFast !== 'boolean') {
    errors.push('failFast 必须是布尔值');
  }

  // ── worker（B0.1 §10：云实验的单 seed worker 契约）────────────
  //
  // 为什么需要它，而不是「云端自己控制 seeds 数组就行」：
  //   1000 seed 的实验会被切成 N 个进程并行跑。若 worker 仍写**顶层**产物
  //   （`summary.json` / 顶层 CSV / `manifest.json`），N 个进程会同时往同一批
  //   文件里写——**结果是后写的覆盖先写的，而且不报错**。
  //   你最后拿到一份「1000 seed」的报告，里面只有最后几个 seed 的数据，
  //   聚合统计（均值 / 分位 / 诊断计数）全部建立在一个静默被截断的集合上。
  //
  // 所以契约是双向的：
  //   · `worker: true` ⟹ 必须**恰好一个** seed（否则一个进程内部就要写多个
  //     seed 目录，说明它其实是聚合器，不该叫 worker）；
  //   · 并且 worker 模式下 runner **只写** `seeds/<seed>/`，顶层产物交给
  //     聚合步骤（`--aggregate`）从各 seed 目录重建。
  //
  // 这条不是性能优化，是**正确性**：它把「并行写同一文件」这个数据竞争
  // 从「靠人记得别这么干」变成「结构上做不到」。
  if (raw.worker !== undefined && typeof raw.worker !== 'boolean') {
    errors.push('worker 必须是布尔值（true = 单 seed worker 模式，只写 seeds/<seed>/）');
  }
  if (raw.worker === true && Array.isArray(raw.seeds) && raw.seeds.length !== 1) {
    errors.push(`worker: true 要求 seeds 恰好含 1 个元素，收到 ${raw.seeds.length} 个`
      + '（worker 只跑一个 seed；多 seed 请用聚合模式，否则并行 worker 会互相覆盖顶层产物）');
  }

  // ── 可选元数据（B1 §6.1）────────────────────────────────────
  //   `progressive` 是**视觉变量**：它建的 `mapProgress` 只被相机夹取与图层
  //   绘制读取，不改任何 `height` / `entities` / 模拟推进。所以它不参与
  //   `configSignature`（那管的是「实验定义成什么」），只写进 manifest 备查。
  if (raw.progressive !== undefined && typeof raw.progressive !== 'boolean') {
    errors.push('progressive 必须是布尔值（true = 地图渐进开放；只影响可访问边界，不改模拟状态）');
  }
  if (raw.experimentGroup !== undefined
    && (typeof raw.experimentGroup !== 'string' || !raw.experimentGroup.trim())) {
    errors.push('experimentGroup 必须是非空字符串（用于横向分组对比，例：geography-sweep）');
  }

  // ── B1-3 · 受控干预（可选，仅 profile=intervention 时生效）───
  //
  // ⚠️ 形状**严格校验**，理由与 generationVersion 同源：
  //    一份「看起来合法」的干预声明如果被静默忽略，得到的是一份
  //    **根本没做干预**的实验，而报告上印着 intervention。那正是本文件存在的理由。
  if (raw.intervention !== undefined) {
    const iv = raw.intervention;
    if (!isPlainObject(iv)) {
      errors.push('intervention 必须是一个对象');
    } else {
      if (!INTERVENTION_KINDS.includes(iv.kind)) {
        errors.push(`intervention.kind 必须是 ${INTERVENTION_KINDS.join(' / ')} 之一，收到 ${JSON.stringify(iv.kind)}`);
      }
      // 非 none 的干预**只允许**与其他 profile 分开：必须配 profile=intervention。
      if (iv.kind && iv.kind !== 'none' && raw.profile !== 'intervention') {
        errors.push(`intervention.kind=${iv.kind} 要求 profile=intervention，收到 profile=${JSON.stringify(raw.profile)}。`
          + '干预只在 intervention profile 下被施加；其他 profile 会静默忽略它。');
      }
      if (iv.kind === 'extra-population') {
        for (const k of ['rngSeed', 'groups', 'count', 'margin']) {
          if (!isPositiveInt(iv[k])) {
            errors.push(`intervention.extra-population 需要正整数 ${k}，收到 ${JSON.stringify(iv[k])}`);
          }
        }
        const extraKeys = Object.keys(iv).filter((k) => !['kind', 'rngSeed', 'groups', 'count', 'margin'].includes(k));
        if (extraKeys.length) {
          errors.push(`intervention.extra-population 含未知字段 ${JSON.stringify(extraKeys)}`
            + '（允许：kind, rngSeed, groups, count, margin）');
        }
      }
      if (iv.kind === 'none') {
        const noneKeys = Object.keys(iv).filter((k) => k !== 'kind');
        if (noneKeys.length) {
          errors.push(`intervention.kind=none 不应携带其他字段，收到 ${JSON.stringify(noneKeys)}`);
        }
      }
    }
  }

  // ── B1-5 · 可调参数覆盖（可选，仅 profile=sensitivity 时生效）──
  //
  // ⚠️ 三条硬约束，理由与 generationVersion 同源（「非法输入必须响在跑之前」）：
  //
  //   1) **键必须来自 TUNABLE_NAMES**。拼错一个键（`POP_SOFTCAP`）若被静默忽略，
  //      得到的是一份**没做任何覆盖**的实验，而报告上印着 override。
  //      于是你会拿「改了参数的组」和「没改的组」做对比——**两组其实一模一样**，
  //      却得出结论说「该参数不敏感」。这是本文件要挡的最坏情形。
  //   2) **值必须是有限正数**。非正 / NaN 会让相关机制静止或产生 NaN，
  //      静默跑完一整年。`tunables.js` 的 `assertPatch` 也拦，但这里要**先**拦，
  //      好让错误在「建世界之前」就带着 Job 上下文报出来。
  //   3) **非空覆盖要求 profile=sensitivity**。覆盖只在 sensitivity 作用域被施加；
  //      挂在 natural 上会被静默忽略，产出一份「看起来改了、其实没改」的 natural。
  //      空对象 `{}` 是允许的（≡ 零覆盖 ≡ natural），因为「零覆盖 ≡ 默认」是一条
  //      被自检钉死的不变量，允许它能让「同一 Job 跑空覆盖 vs 不写字段」的
  //      等价性可被直接实验验证。
  if (raw.parameterOverrides !== undefined) {
    const po = raw.parameterOverrides;
    if (!isPlainObject(po)) {
      errors.push('parameterOverrides 必须是一个对象（`{ 参数名: 数值 }`）');
    } else {
      const keys = Object.keys(po);
      for (const k of keys) {
        if (!TUNABLE_NAMES.includes(k)) {
          errors.push(`parameterOverrides 含未登记的参数「${k}」；已登记（见 src/inkbox/sim/tunables.js）：${TUNABLE_NAMES.join(', ')}`);
          continue;
        }
        const v = po[k];
        if (!isPositiveNumber(v)) {
          errors.push(`parameterOverrides.${k} 必须是有限正数，收到 ${JSON.stringify(v)}`
            + `（默认 ${tunableMeta(k).default} ${tunableMeta(k).unit}）`);
        } else if (Number.isInteger(tunableMeta(k).default) && !Number.isInteger(v)) {
          errors.push(`parameterOverrides.${k} 默认是整数（${tunableMeta(k).default}），覆盖值也必须是整数，收到 ${v}`);
        }
      }
      if (keys.length > 0 && raw.profile !== 'sensitivity') {
        errors.push(`非空 parameterOverrides 要求 profile=sensitivity，收到 profile=${JSON.stringify(raw.profile)}。`
          + '覆盖只在 sensitivity profile 下被施加；其他 profile 会静默忽略它，'
          + '于是你会拿一个「其实没改」的组去做对比。');
      }
    }
  }

  // ── B2-2 · 人物命运观察队列（可选，**任何 profile** 生效）──────
  //
  // ⚠️ 为什么它不像 parameterOverrides 那样绑定 profile：fateQueue 是**纯采集**
  //    （`scripts/experiment/fate-queue.mjs` 只读 world、不抽签、不推进），
  //    所以它在 natural / intervention / sensitivity 下都合法且无歧义。
  //    那为什么还要在这里严格校验：因为「静默忽略」的代价是**无声的**——
  //    `fateQueue: {max: 0}` 若被当作「没有队列」，跑完的目录里就是没有 fate.csv，
  //    而你会以为「这个实验的个体都不可追踪」。缺一份数据和没有数据，
  //    在只看目录的复盘里长得一模一样。
  //
  // 三条形状规则：
  //   1) `max` 正整数且 ≤ 64（委托书：至多 32 名；留到 64 是给敏感性用的头寸）；
  //   2) `atDay` 非负整数（第几天建队；0 = 人口一成形就建）；
  //   3) `filter` ∈ {all, cultivators, mortals}（选取范围；**写法**与 digest 无关，
  //      只影响「观察谁」——它不参与世界线，但进 manifest 与 configSignature）。
  //   ⚠️ 三者**全部可选**：`fateQueue: {}` 是合法的（= 全默认：32 人 / 下界 0 /
  //      全部人口）。因为「开一个默认队列」本身是一个明确的请求，不是省略。
  //      只在「写了但非法」时报错——缺字段由 `fateQueueSpec` 补默认（一处定义）。
  // 未知字段一律报错（与 intervention 同口径）：形状随专题演化时是「加新键」，
  //   而不是在旧键上塞可选值——后者会让「拼错的键被静默忽略」重新变成可能。
  if (raw.fateQueue !== undefined) {
    const fq = raw.fateQueue;
    if (!isPlainObject(fq)) {
      errors.push('fateQueue 必须是一个对象（形如 {max: 32, atDay: 3600, filter: "all"}）');
    } else {
      if (fq.max !== undefined && (!isPositiveInt(fq.max) || fq.max > 64)) {
        errors.push(`fateQueue.max 必须是 1..64 的正整数，收到 ${JSON.stringify(fq.max)}`
          + '（委托书 §B2-2：至多 32 名；上限留到 64）');
      }
      if (fq.atDay !== undefined && (!Number.isInteger(fq.atDay) || fq.atDay < 0)) {
        errors.push(`fateQueue.atDay 必须是非负整数（建队日下界；0 = 人口一成形就建），收到 ${JSON.stringify(fq.atDay)}`);
      }
      if (fq.filter !== undefined && !FATE_FILTERS.includes(fq.filter)) {
        errors.push(`fateQueue.filter 必须是 ${FATE_FILTERS.join(' / ')} 之一，收到 ${JSON.stringify(fq.filter)}`);
      }
      const fqExtra = Object.keys(fq).filter((k) => !FATE_QUEUE_KEYS.includes(k));
      if (fqExtra.length) {
        errors.push(`fateQueue 含未知字段 ${JSON.stringify(fqExtra)}（允许：${FATE_QUEUE_KEYS.join(', ')}）`);
      }
    }
  }

  if (errors.length) return { ok: false, errors, config: null };

  const config = {
    schemaVersion: JOB_SCHEMA_VERSION,
    experiment: raw.experiment,
    profile: raw.profile,
    preset: raw.preset,
    // ── B1 §6.1 世界生成元数据（进 manifest，用于判断两份 CSV 可比吗）──
    generationVersion: raw.generationVersion,
    terrainPreset: raw.terrainPreset,
    progressive: raw.progressive === true,
    experimentGroup: raw.experimentGroup || null,
    // ── B1-3 受控干预（仅 intervention profile 会施加）──────────
    //   `undefined` ⟹ 不携带干预（等价于 none）。保持 undefined 而不是补
    //   一个 `{kind:'none'}` 默认：那样会让「没写干预」与「显式写了 none」
    //   在产物里同形，而前者是「一份没做干预的实验」——必须能分辨。
    intervention: raw.intervention === undefined ? null : raw.intervention,
    // ── B1-5 可调参数覆盖（仅 sensitivity profile 会施加）───────
    //   与 intervention 同口径：`undefined` ⟹ 不携带覆盖（等价于 `{}`）。
    //   保持 undefined 而不是补一个 `{}`：那样会让「没写覆盖」与「显式写了空覆盖」
    //   在产物里同形，而前者是「一份没有 sensitivity 语义的 Job」——必须能分辨。
    parameterOverrides: raw.parameterOverrides === undefined ? null : raw.parameterOverrides,
    // ── B2-2 人物命运观察队列（纯采集，任何 profile 生效）─────────
    //   与 intervention 同口径区分「没写」与「显式写了空」：
    //   `undefined` ⟹ null ⟹ 不建队列、不产 fate.csv。
    //   ⚠️ 这里存**归一化后的规格**（补齐 max/atDay/filter 默认值）而不是原样
    //      回显：校验已在上面做完（非法值到不了这一行），runner 直接消费规格，
    //      不需要再做一次「缺字段补默认」——那会让默认值有两处定义。
    fateQueue: raw.fateQueue === undefined ? null : fateQueueSpec(raw.fateQueue),
    seeds: raw.seeds.slice(),
    years: raw.years,
    stepDays: raw.stepDays,
    snapshotDays: raw.snapshotDays,
    probeDays: raw.probeDays,
    viewPolicy: raw.viewPolicy,
    collect: raw.collect !== false,
    outputRoot: raw.outputRoot || DEFAULT_OUTPUT_ROOT,
    failFast: raw.failFast === true,
    worker: raw.worker === true,
  };
  return { ok: true, errors: [], config };
}

/**
 * 从命令行参数组装一份待校验的 Job。
 *
 * ⚠️ 这里**只做形状组装，不做默认值兜底**——缺哪个字段就让 `validateJob` 报出来。
 *    这正是「不静默 fallback」在 CLI 这一层的形态：`--years` 打错成 `--year`
 *    不会变成「按默认 300 年跑」，而是「years 必须是正数」。
 *
 * @param {Record<string,string>} args `--k=v` 解析出来的键值对
 * @param {object} [base] Job 文件的内容（`--job` 与命令行混用时作为基底）
 */
export function jobFromArgs(args, base = {}) {
  const raw = { ...base };

  if (args.profile !== undefined) raw.profile = args.profile;
  if (args.preset !== undefined) raw.preset = args.preset;
  if (args.experiment !== undefined) raw.experiment = args.experiment;
  if (args.seeds !== undefined) {
    // 逗号分隔。空片段 / 非数字**原样留着**，交给 validateJob 报错——
    // 在这里 `filter(Boolean)` 掉就会把 `--seeds=1,,2` 静默变成 `[1,2]`。
    raw.seeds = String(args.seeds).split(',').map((s) => {
      const t = s.trim();
      if (!/^\d+$/.test(t)) return t;        // 非纯数字：留成字符串，让校验器说人话
      return Number(t);
    });
  }
  if (args.years !== undefined) raw.years = numericArg(args.years);
  if (args.step !== undefined) raw.stepDays = numericArg(args.step);
  if (args.stepDays !== undefined) raw.stepDays = numericArg(args.stepDays);
  if (args.snapshotDays !== undefined) raw.snapshotDays = numericArg(args.snapshotDays);
  if (args.probeDays !== undefined) raw.probeDays = numericArg(args.probeDays);
  if (args.viewPolicy !== undefined) raw.viewPolicy = args.viewPolicy;
  // ── B1 §6.1：世界生成元数据 ─────────────────────────────────
  // ⚠️ `generationVersion` 走 `numericArg`：`--generationVersion=two` 会原样
  //    留成字符串 "two"，然后被 validateJob 报「必须是 1 / 2 之一」；
  //    若在这里 `|| 2` 兜底，就是一次静默 fallback（一份 v1 实验按 v2 跑完）。
  if (args.generationVersion !== undefined) raw.generationVersion = numericArg(args.generationVersion);
  if (args.generation !== undefined) raw.generationVersion = numericArg(args.generation);
  if (args.terrainPreset !== undefined) raw.terrainPreset = args.terrainPreset;
  if (args.terrain !== undefined) raw.terrainPreset = args.terrain;
  if (args.progressive !== undefined) raw.progressive = boolArg(args.progressive);
  if (args.experimentGroup !== undefined) raw.experimentGroup = args.experimentGroup;
  // ── B1-3：受控干预 ───────────────────────────────────────────
  // ⚠️ 只接受 JSON 文本（`--intervention='{"kind":"extra-population",...}'`），
  //    **不做逐字段拆解**：干预的形状会随 kind 演化，逐个加 `--intervention-count`
  //    之类的开关会让 CLI 与 schema 各自长出一份形状定义，迟早分叉。
  //    非法 JSON 原样留成字符串 ⇒ `validateJob` 报「intervention 必须是一个对象」。
  if (args.intervention !== undefined) {
    const t = String(args.intervention).trim();
    if (t.startsWith('{')) {
      try { raw.intervention = JSON.parse(t); } catch { raw.intervention = t; }
    } else if (t === 'none') {
      raw.intervention = { kind: 'none' };
    } else {
      raw.intervention = t;   // 交给校验器报错
    }
  }
  // ── B1-5：可调参数覆盖 ───────────────────────────────────────
  // ⚠️ 与 intervention 同口径：只接受 JSON 文本
  //    （`--parameterOverrides='{"POP_SOFT_CAP":1200}'`），**不做逐字段拆解**
  //    （否则 CLI 与 schema 会各自长出一份参数名清单，迟早分叉）。
  //    非法 JSON 原样留成字符串 ⇒ `validateJob` 报「必须是一个对象」。
  if (args.parameterOverrides !== undefined) {
    const t = String(args.parameterOverrides).trim();
    if (t.startsWith('{')) {
      try { raw.parameterOverrides = JSON.parse(t); } catch { raw.parameterOverrides = t; }
    } else {
      raw.parameterOverrides = t;   // 交给校验器报错
    }
  }
  // ── B2-2：人物命运观察队列 ─────────────────────────────────────
  // ⚠️ 与 intervention / parameterOverrides 同口径：只接受 JSON 文本，
  //    **不做逐字段拆解**（否则 CLI 与 schema 各长一份形状定义，迟早分叉）。
  //    非法 JSON 原样留成字符串 ⇒ validateJob 报「必须是一个对象」。
  if (args.fateQueue !== undefined) {
    const t = String(args.fateQueue).trim();
    if (t.startsWith('{')) {
      try { raw.fateQueue = JSON.parse(t); } catch { raw.fateQueue = t; }
    } else {
      raw.fateQueue = t;   // 交给校验器报错
    }
  }
  // ⚠️ 布尔参数**不做真值强转**：`--collect=maybe` 若被当成 `true`，
  //    就是一次静默 fallback（委托书 §7 点名禁止）。只认 'true' / 'false'，
  //    其余原样留成字符串，由 `validateJob` 报「collect 必须是布尔值」。
  if (args.collect !== undefined) raw.collect = boolArg(args.collect);  if (args.outputRoot !== undefined) raw.outputRoot = args.outputRoot;
  if (args.failFast !== undefined) raw.failFast = boolArg(args.failFast);
  // B0.1 §10：`--worker=true` 走单 seed 模式（只写 seeds/<seed>/）。
  // 同 collect / failFast：不做真值强转，`--worker=maybe` 留给校验器报错。
  if (args.worker !== undefined) raw.worker = boolArg(args.worker);

  return raw;
}

/** `"true"` → `true`；`"false"` → `false`；其余**原样返回**（交给校验器报错）。 */
function boolArg(text) {
  const t = String(text).trim().toLowerCase();
  if (t === 'true' || t === '1') return true;
  if (t === 'false' || t === '0') return false;
  return text;
}

/** `"300"` → `300`；`"abc"` → 原样返回字符串（让校验器报「必须是正数」而不是变成 NaN）。 */
function numericArg(text) {
  const t = String(text).trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
}

/**
 * 补上 profile 的默认视界策略（仅在**没有** Job 文件、且命令行也没给 viewPolicy 时用）。
 * 有了它，`--profile=natural` 才能只写一个参数就跑起来。
 */
export function withProfileDefaults(raw) {
  const out = { ...raw };
  if (out.viewPolicy === undefined && PROFILE_NAMES.includes(out.profile)) {
    out.viewPolicy = profileDefaultViewPolicy(out.profile);
  }
  return out;
}

/** 一份「最小可跑」的 Job 骨架，给 CLI 的默认值用（委托书 §3 的示例命令同形）。 */
export function defaultJob(overrides = {}) {
  return {
    schemaVersion: JOB_SCHEMA_VERSION,
    experiment: 'baseline-natural',
    profile: 'natural',
    preset: 'medium',
    // B1 §6.1：产品默认生成 = v2 + standard（main.js 的 newWorld 同口径）。
    // 这两项**必填**，但 `defaultJob` 是「CLI 一个参数都不给时」的骨架，
    // 不是给已有 Job 补默认——真跑实验时它们会显式写在 Job 里或被 CLI 覆盖。
    generationVersion: 2,
    terrainPreset: 'standard',
    seeds: [20260914],
    years: 300,
    stepDays: 3,
    snapshotDays: 360,
    probeDays: 30,
    viewPolicy: 'closed',
    ...overrides,
  };
}
