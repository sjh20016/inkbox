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
import { PROFILE_NAMES, profileDefaultViewPolicy } from './profiles.mjs';

/** Job 文件格式版本。改了字段语义就 +1——云端要靠它决定怎么读。 */
export const JOB_SCHEMA_VERSION = 1;

/** 允许的采样策略。`closed` = 视界从不打开；`legacy-duty-cycle` = 旧长测的 25% 占空比。 */
export const VIEW_POLICIES = Object.freeze(['closed', 'legacy-duty-cycle']);

/**
 * 允许出现在 Job 里的全部键。**多余的键一律报错**（理由见文件头）。
 * 新增字段时必须同时加进这里，否则它会被当成拼写错误挡下来——这是有意的。
 */
export const JOB_KEYS = Object.freeze([
  'schemaVersion', 'experiment', 'profile', 'preset', 'seeds', 'years',
  'stepDays', 'snapshotDays', 'probeDays', 'viewPolicy',
  // 运行控制（不影响世界线，只影响「跑不跑 / 跑完写哪儿」）
  'collect', 'outputRoot', 'failFast',
]);

/** 各 profile 的语义硬约束：profile 名 ⟹ viewPolicy 取值。理由见 `validateJob`。 */
const PROFILE_VIEW_POLICY = Object.freeze({
  natural: 'closed',
  'legacy-longrun': 'legacy-duty-cycle',
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
  if (!isPositiveNumber(raw.years)) errors.push('years 必须是正数（游戏年）');
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

  if (errors.length) return { ok: false, errors, config: null };

  const config = {
    schemaVersion: JOB_SCHEMA_VERSION,
    experiment: raw.experiment,
    profile: raw.profile,
    preset: raw.preset,
    seeds: raw.seeds.slice(),
    years: raw.years,
    stepDays: raw.stepDays,
    snapshotDays: raw.snapshotDays,
    probeDays: raw.probeDays,
    viewPolicy: raw.viewPolicy,
    collect: raw.collect !== false,
    outputRoot: raw.outputRoot || DEFAULT_OUTPUT_ROOT,
    failFast: raw.failFast === true,
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
  // ⚠️ 布尔参数**不做真值强转**：`--collect=maybe` 若被当成 `true`，
  //    就是一次静默 fallback（委托书 §7 点名禁止）。只认 'true' / 'false'，
  //    其余原样留成字符串，由 `validateJob` 报「collect 必须是布尔值」。
  if (args.collect !== undefined) raw.collect = boolArg(args.collect);
  if (args.outputRoot !== undefined) raw.outputRoot = args.outputRoot;
  if (args.failFast !== undefined) raw.failFast = boolArg(args.failFast);

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
    seeds: [20260914],
    years: 300,
    stepDays: 3,
    snapshotDays: 360,
    probeDays: 30,
    viewPolicy: 'closed',
    ...overrides,
  };
}
