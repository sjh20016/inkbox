#!/usr/bin/env node
// 水墨沙盒 · World Laboratory 命令行入口（委托书 §3 / §7 / §16 / §18）
//
// ───────────────────────────────────────────────────────────────────────
// 这个脚本和另外三支测试的分工
// ───────────────────────────────────────────────────────────────────────
//
//   smoke       —— 单点断言：某个函数、某次存读档对不对
//   regression  —— 干预前后世界有没有按预期变
//   longrun     —— 连着跑几百年，看世界会不会「静悄悄地死掉」
//   **experiment（本脚本）** —— 把「世界怎么运行」当成**研究对象**，
//                               回答「为什么变成这样 / 哪个变量有因果权力 /
//                               同一 seed 接受不同冲击后会怎么分叉」
//
// 前三支回答「**对不对**」，本脚本回答「**为什么**」。
// 所以本脚本**没有**任何 pass/fail 判据（诊断全是 info/warning），
// 也**不进 `npm test`**——委托书 §18 明文：「World Health 是研究工具，不是 release gate」。
//
// ───────────────────────────────────────────────────────────────────────
// 用法
// ───────────────────────────────────────────────────────────────────────
//
//   node scripts/inkbox-experiment.mjs \
//     --profile=natural --seeds=20260914,7,424242 --years=300 --step=3
//
//   node scripts/inkbox-experiment.mjs --job=experiments/jobs/baseline-natural.json
//
// 退出码（委托书 §16）：
//   0 —— 全部 seed 跑完
//   1 —— 有 seed 在模拟中崩溃（**其余 seed 的结果仍然保留**）
//   2 —— 配置非法（含输出目录防覆盖拦截）
//   3 —— Job 文件读不了 / 不是合法 JSON
//
// ⚠️ stdout 只印「进度 / 种子 / 耗时 / 输出路径 / 致命错误」。
//    **绝不把 CSV 打进 stdout**——几百 MB 的 CSV 会把任何 CI 日志系统淹掉。
//
// ⚠️ 不依赖浏览器：没有 Canvas / DOM / WebGL / Chrome / CDP。
//    本脚本的 import 图上没有任何 `render` / `render3d` / `ui` 模块
//    （`node scripts/inkbox-import-check.mjs` 只查相对导入目标存不存在，
//     这条约束由本文件自己守——所以下面刻意只 import `sim` / `core` / `world` / `io`）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  JOB_SCHEMA_VERSION, defaultJob, jobFromArgs, validateJob, withProfileDefaults,
} from './experiment/job-schema.mjs';
import { PROFILE_NAMES } from './experiment/profiles.mjs';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { runSeedSafely } from './experiment/runner.mjs';
import { diagnoseSeed } from './experiment/diagnostics.mjs';
import { REPO_ROOT, aggregate, createReporter } from './experiment/report.mjs';

const EXIT_OK = 0;
const EXIT_SIM_FAILURE = 1;
const EXIT_CONFIG = 2;
const EXIT_JOB_IO = 3;

/** 命令行允许出现的 `--k=v` 键。**多一个都报错**——理由见下面 `parseArgv` 的注释。 */
const CLI_VALUE_KEYS = Object.freeze([
  'job', 'experiment', 'profile', 'preset', 'seeds', 'years', 'step', 'stepDays',
  'snapshotDays', 'probeDays', 'viewPolicy', 'outputRoot', 'collect', 'failFast', 'help',
  // B0.1 §10：单 seed worker 模式
  'worker',
]);

/** 命令行允许出现的裸开关。 */
const CLI_FLAG_KEYS = Object.freeze([
  'help', 'quiet', 'overwrite', 'fail-fast',
  // B0.1 §10：从各 seed 目录重建顶层产物（不跑模拟）
  'aggregate',
]);

const USAGE = `水墨沙盒 · World Laboratory

用法：
  node scripts/inkbox-experiment.mjs --profile=<name> --seeds=<a,b,c> [--years=300] [--step=3]
  node scripts/inkbox-experiment.mjs --job=<path/to/job.json> [覆盖项...]

云实验（B0.1 §10）：
  # 每个 worker 跑一个 seed，只写 seeds/<seed>/，互不干扰
  node scripts/inkbox-experiment.mjs --job=<job.json> --seeds=<n> --worker=true
  # 全部 worker 跑完后，用**同一份 Job** 重建顶层产物
  node scripts/inkbox-experiment.mjs --job=<job.json> --aggregate

参数：
  --job=<path>          从 JSON Job 文件启动（云端批跑的主入口）
  --experiment=<id>     实验 id，同时是输出目录名（默认 baseline-<profile>）
  --profile=<name>      ${PROFILE_NAMES.join(' / ')}
  --preset=<name>       ${Object.keys(WORLD_PRESETS).join(' / ')}（默认 medium）
  --seeds=<a,b,c>       逗号分隔的非负整数种子
  --years=<n>           游戏年数（正整数，默认 300；小数会被拒绝而不是四舍五入）
  --step=<n>            每次 advanceWorld 推进的游戏日（默认 3）
  --snapshotDays=<n>    快照间隔，游戏日（默认 360 = 1 年）
  --probeDays=<n>       探针间隔，游戏日（默认 30）
  --viewPolicy=<name>   closed / legacy-duty-cycle（由 profile 钉死，通常不用手填）
  --outputRoot=<path>   输出根目录（默认 reports/inkbox/experiments）
  --worker=true         单 seed worker：只写 seeds/<seed>/，顶层留给 --aggregate
  --aggregate           不跑模拟；从各 seeds/<seed>/ 重建顶层产物（顺序由 Job 决定）
  --overwrite           允许覆盖输出目录里**配置不同**的既有结果
  --fail-fast           任一 seed 崩溃即中止（默认：记录后继续跑完其余 seed）
  --quiet               只印每个 seed 的结论行
  --help                印这段

退出码：0 成功 / 1 有 seed 崩溃或缺失 / 2 配置非法 / 3 Job 文件读不了
`;

// ───────────────────────────────────────────────────────────────────────
// 参数解析
// ───────────────────────────────────────────────────────────────────────

function parseArgv(argv) {
  const values = {};
  const flags = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq === -1) {
      flags.add(token.slice(2));
    } else {
      values[token.slice(2, eq)] = token.slice(eq + 1);
    }
  }

  // ── 未知参数：报错，不忽略 ────────────────────────────────────
  //
  // ⚠️ 这一条是委托书 §7「不静默 fallback」在 **CLI 这一层**的兑现处，
  //    也是本文件最容易漏掉的一处。理由：
  //      `jobFromArgs` 只读它认识的那几个键，所以 `--yearz=300` 会被
  //      **无声丢弃**，实验照跑，按默认 300 年跑完——看起来完全正常，
  //      而你想跑的 3000 年从来没跑过。这类事故**没有任何痕迹**。
  //    本项目的 import-check 工具（`scripts/inkbox-import-check.mjs`）头注释里
  //    写过同一句话：「会撒谎的工具比没有工具更坏」。
  const unknown = [];
  for (const key of Object.keys(values)) if (!CLI_VALUE_KEYS.includes(key)) unknown.push(`--${key}=…`);
  for (const key of flags) if (!CLI_FLAG_KEYS.includes(key)) unknown.push(`--${key}`);
  if (unknown.length) {
    process.stderr.write(`\n✗ 未知命令行参数：${unknown.join('、')}\n`);
    process.stderr.write(`  允许的键：${CLI_VALUE_KEYS.map((k) => `--${k}`).join(' ')}\n`);
    process.stderr.write(`  允许的开关：${CLI_FLAG_KEYS.map((k) => `--${k}`).join(' ')}\n`);
    process.stderr.write('  （拼错的参数不会被忽略——静默忽略会让「跑的不是你要的」永远查不出来）\n');
    process.exit(EXIT_CONFIG);
  }

  return { values, flags };
}

/** 人话的配置行（stdout 上唯一一处「本次到底跑什么」）。 */
function describeConfig(config) {
  return [
    `experiment=${config.experiment}`,
    `profile=${config.profile}`,
    `preset=${config.preset}`,
    `seeds=[${config.seeds.join(',')}]`,
    `years=${config.years}`,
    `step=${config.stepDays}`,
    `snapshot=${config.snapshotDays}`,
    `probe=${config.probeDays}`,
    `viewPolicy=${config.viewPolicy}`,
    `collect=${config.collect}`,
    `worker=${config.worker === true}`,
  ].join(' ');
}

function fail(code, message, detail) {
  process.stderr.write(`\n✗ ${message}\n`);
  if (detail) process.stderr.write(`${detail}\n`);
  process.exit(code);
}

// ───────────────────────────────────────────────────────────────────────
// 主流程
// ───────────────────────────────────────────────────────────────────────

const { values: args, flags } = parseArgv(process.argv.slice(2));

if (flags.has('help') || args.help !== undefined) {
  process.stdout.write(USAGE);
  process.exit(EXIT_OK);
}

const quiet = flags.has('quiet');

// ── 1. 取原始配置 ───────────────────────────────────────────────
let raw;
if (args.job !== undefined) {
  const jobPath = path.resolve(REPO_ROOT, args.job);
  let text;
  try {
    text = fs.readFileSync(jobPath, 'utf8');
  } catch (error) {
    fail(EXIT_JOB_IO, `读不了 Job 文件：${jobPath}`, error.message);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(EXIT_JOB_IO, `Job 文件不是合法 JSON：${jobPath}`, error.message);
  }
  // 命令行参数**覆盖** Job 字段：显式覆盖不是 fallback，是「在 Job 基础上做一次变体」。
  raw = jobFromArgs(args, parsed);
} else {
  // 无 Job：从默认骨架 + 命令行组装。
  // ⚠️ 这里**不做**「缺字段就补默认」之外的事——`--year=300` 这种拼错
  //    会变成「未知字段」，而不是静默按默认 300 年跑。
  const base = defaultJob();
  if (args.profile !== undefined) base.experiment = `baseline-${args.profile}`;
  if (args.seeds === undefined) delete base.seeds;
  if (args.years === undefined) delete base.years;
  if (args.step === undefined) delete base.stepDays;
  if (args.snapshotDays === undefined) delete base.snapshotDays;
  if (args.probeDays === undefined) delete base.probeDays;
  if (args.profile === undefined) delete base.profile;
  // ⚠️ `preset` **不删**：`medium` 是文档化的默认世界尺寸，不是「缺省兜底」——
  //    它会被印在 stdout 的配置行上，所以「用了默认值」这件事是可见的。
  //    而 `--profile` / `--seeds` / `--years` 缺了就报错：那三个没有合理默认。
  if (args.viewPolicy === undefined) delete base.viewPolicy;
  raw = jobFromArgs(args, base);
  if (raw.profile === undefined && args.profile === undefined) {
    fail(EXIT_CONFIG, '缺少 --profile（或 --job）', `可用 profile：${PROFILE_NAMES.join(' / ')}`);
  }
  if (raw.seeds === undefined) fail(EXIT_CONFIG, '缺少 --seeds', '例：--seeds=20260914,7,424242');
  if (raw.years === undefined) fail(EXIT_CONFIG, '缺少 --years', '例：--years=300');
  if (raw.stepDays === undefined) raw.stepDays = defaultJob().stepDays;
  if (raw.snapshotDays === undefined) raw.snapshotDays = defaultJob().snapshotDays;
  if (raw.probeDays === undefined) raw.probeDays = defaultJob().probeDays;
}

raw = withProfileDefaults(raw);

// ── 2. 校验（§7：非法输入必须响，且不静默 fallback）─────────────
const verdict = validateJob(raw);
if (!verdict.ok) {
  fail(EXIT_CONFIG, `配置非法（${verdict.errors.length} 处）`,
    verdict.errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n'));
}
const config = verdict.config;
config.failFast = config.failFast || flags.has('fail-fast');

// ── 2.5 聚合模式（B0.1 §10）：不跑模拟，只把各 worker 的 seed 目录合起来 ──
//
// ⚠️ 聚合**必须用同一份 Job**（同一 seeds 数组、同一顺序），而不是扫描目录。
//    理由见 `report.aggregate` 的注释：顺序错了，CSV 行序就与单进程不同，
//    「聚合结果 === 单进程结果」这条保证就没了。
if (flags.has('aggregate')) {
  // 聚合与 worker 是**互斥**的：聚合产出顶层，worker 禁止碰顶层。
  // 同时给两个，说明调用方对这两条通路的心智模型是错的——
  // 与其猜他想干嘛，不如让他看见这个矛盾。
  if (config.worker === true) {
    fail(EXIT_CONFIG, '--aggregate 与 --worker=true 不能同时使用',
      '  worker 只写 seeds/<seed>/（禁止碰顶层）；aggregate 只写顶层（不碰 seed 目录）。'
      + '两者是同一条流水线的不同阶段，不是一个命令的两个开关。');
  }
  const result = aggregate(config, { overwrite: flags.has('overwrite') });
  process.stdout.write(`\n水墨沙盒 · World Laboratory（聚合模式）\n${describeConfig(config)}\n`);
  process.stdout.write(`合并 seed：${result.seeds.length}/${config.seeds.length}`
    + `  [${result.seeds.join(', ')}]\n`);
  process.stdout.write(`输出目录：${path.relative(REPO_ROOT, result.dir)}\n`);
  if (result.missing.length) {
    process.stderr.write(`\n✗ 有 ${result.missing.length} 个 seed 的目录不存在或没跑完：`
      + `${result.missing.join(', ')}\n`);
    process.stderr.write('  （顶层产物已写出，但它是**不完整的**——这不是「1000 seed」的结果。'
      + '请先补齐这些 seed 再聚合。）\n');
  }
  if (result.failed.length) {
    process.stderr.write(`⚠️ ${result.failed.length} 个 seed 有 failure.json：${result.failed.join(', ')}\n`);
  }
  process.exit((result.missing.length || result.failed.length) ? EXIT_SIM_FAILURE : EXIT_OK);
}

// ── 3. 开跑 ─────────────────────────────────────────────────────
const t0 = Date.now();
const rssSamples = [];

const reporter = createReporter(config, {
  overwrite: flags.has('overwrite'),
  diagnose: diagnoseSeed,
});

try {
  reporter.begin();
} catch (error) {
  fail(EXIT_CONFIG, error.message);
}

process.stdout.write(`\n水墨沙盒 · World Laboratory\n${describeConfig(config)}\n`);
process.stdout.write(`输出：${path.relative(REPO_ROOT, reporter.dir)}\n\n`);

const seedRuntimes = [];
let crashed = 0;

for (let i = 0; i < config.seeds.length; i += 1) {
  const seed = config.seeds[i];
  const label = `[${i + 1}/${config.seeds.length}] seed ${seed}`;
  process.stdout.write(`${label} ▸ 起跑\n`);

  let lastMilestone = 0;
  const seedStart = Date.now();

  const outcome = runSeedSafely(config, seed, {
    onProgress(info) {
      if (quiet) return;
      const pct = Math.floor((info.year / info.years) * 5) * 20;   // 0/20/40/60/80/100
      if (pct >= lastMilestone + 20) {
        lastMilestone = pct;
        process.stdout.write(`  ${label} … ${String(pct).padStart(3)}% 第 ${info.year} 年`
          + `（${((Date.now() - seedStart) / 1000).toFixed(1)}s）\n`);
      }
    },
  });

  const elapsedMs = Date.now() - seedStart;
  rssSamples.push(process.memoryUsage().rss);

  if (outcome.ok) {
    reporter.record(outcome);
    const yearsPerSec = elapsedMs > 0 ? (outcome.result.years / (elapsedMs / 1000)) : null;
    seedRuntimes.push({
      seed,
      ok: true,
      elapsedMs,
      yearsPerSecond: yearsPerSec,
      snapshots: outcome.result.snapshots.length,
      probes: outcome.result.probes.length,
      digest: outcome.result.fingerprint.digest,
      digestBytes: outcome.result.fingerprint.bytes,
      tally: outcome.result.tally,
      notes: outcome.result.notes,
    });
    process.stdout.write(`  ${label} ✓ ${(elapsedMs / 1000).toFixed(1)}s`
      + `${yearsPerSec ? ` · ${yearsPerSec.toFixed(1)} 年/秒` : ''}`
      + ` · 快照 ${outcome.result.snapshots.length} / 探针 ${outcome.result.probes.length}`
      + ` · ${outcome.result.fingerprint.digest.slice(0, 12)}\n`);
  } else {
    crashed += 1;
    reporter.record(outcome);
    seedRuntimes.push({ seed, ok: false, elapsedMs, error: outcome.error.message });
    process.stderr.write(`  ${label} ✗ 崩溃：${outcome.error.message}\n`);
    process.stderr.write('  （该 seed 的其余结果已丢弃，但**之前完成的 seed 全部保留**）\n');
    if (config.failFast) {
      process.stderr.write('  --fail-fast 生效，中止后续 seed。\n');
      break;
    }
  }
}

const totalMs = Date.now() - t0;
const peakRss = rssSamples.length ? Math.max(...rssSamples) : process.memoryUsage().rss;
const completedYears = seedRuntimes.filter((r) => r.ok).reduce((a, r) => a + config.years, 0);

const outDir = reporter.finish({
  startedAt: new Date(t0).toISOString(),
  finishedAt: new Date().toISOString(),
  elapsedMs: totalMs,
  hostname: safeHostname(),
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  pid: process.pid,
  // ⚠️ 是**采样**最大值（每个 seed 结束采一次），不是真正的峰值。名字如实写。
  sampledPeakRssBytes: peakRss,
  seedCount: config.seeds.length,
  completedSeedCount: seedRuntimes.filter((r) => r.ok).length,
  failedSeedCount: crashed,
  simulatedYears: completedYears,
  yearsPerSecond: totalMs > 0 ? completedYears / (totalMs / 1000) : null,
  seedRuntimes,
  outputPath: path.relative(REPO_ROOT, reporter.dir),
  notes: [
    'worldDigest = sha256(JSON.stringify(serializeWorld(world)))；scheme 见 manifest.digestScheme。',
    '核心产物（manifest/summary/timeseries/probes/diagnostics）不含墙钟时间，可逐 byte 比对。',
  ],
});

process.stdout.write(`\n完成：${seedRuntimes.filter((r) => r.ok).length}/${config.seeds.length} 个 seed`
  + ` · ${(totalMs / 1000).toFixed(1)}s`
  + ` · 合计 ${completedYears} 模拟年`
  + `${completedYears > 0 ? ` · ${(completedYears / (totalMs / 1000)).toFixed(1)} 年/秒` : ''}\n`);
process.stdout.write(`输出目录：${path.relative(REPO_ROOT, outDir)}\n`);
if (crashed) {
  process.stdout.write(`⚠️ ${crashed} 个 seed 崩溃 —— 详见 ${path.join(path.relative(REPO_ROOT, outDir), 'summary.json')} 的 failures 段\n`);
}
process.exit(crashed ? EXIT_SIM_FAILURE : EXIT_OK);

function safeHostname() {
  try {
    return process.env.COMPUTERNAME || process.env.HOSTNAME || null;
  } catch {
    return null;
  }
}
