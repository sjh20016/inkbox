// World Laboratory · 报告层（委托书 §8 / §13 / §16 / §17）
//
// ───────────────────────────────────────────────────────────────────────
// 两条贯穿本文件的设计约束
// ───────────────────────────────────────────────────────────────────────
//
// ① **可重复性：核心产物里不许出现墙钟时间**（委托书 §8 末段）
//    核心产物 = `manifest.json` / `summary.json` / `timeseries.csv` / `diagnostics.json`。
//    它们**只**由「配置 + 种子 + 模拟」决定，所以同配置跑两次可以逐 byte 比对。
//    一切非确定性 metadata（`startedAt` / 墙钟耗时 / 主机名 / 内存）全部隔离在
//    `runtime.json`，并在文件里显式标注 `"deterministic": false`。
//
//    ⚠️ 为什么这条重要：如果 `manifest.json` 里有一个 `generatedAt`，
//       那么「同配置两次跑出来的 manifest 是否相同」这个问题就**永远答不了**——
//       差异会被时间戳淹没，而真正的差异（比如某个字段悄悄变了）就藏在水下。
//       把时间戳赶到另一个文件里，是让「可重复」这件事**可被机器判定**的最低成本做法。
//
// ② **一个 seed 崩了不能毁掉整批**（委托书 §16）
//    所以产物是**两层**的：
//      · `seeds/<seed>/` —— 该 seed 自己的全套产物，跑完就落盘，此后不再动；
//      · 顶层合并文件 —— 每完成一个 seed **重写一次**（内容 = 已完成 seed 的并集）。
//    第 81 个 seed 崩溃时，前 80 个既在自己的目录里、也在顶层文件里。
//
// ───────────────────────────────────────────────────────────────────────
// 数值格式（决定 CSV 能不能逐 byte 比对）
// ───────────────────────────────────────────────────────────────────────
//
// `Number.prototype.toString` 在 V8 里是**确定性**的（ECMA-262 规定了最短往返表示），
// 所以直接 `String(x)` 本身是可重复的。但 0.1+0.2 那种尾巴会让 CSV 极难读，
// 所以这里统一保留 **6 位小数**（四舍五入，再去尾零）。
// 这个取舍是有意的：6 位小数对「人口 / 粮食 / 份额 / 基尼」全都够用，
// 而且**抹掉的是浮点尾巴而不是有效信息**。
//
// ⚠️ `NaN` / `Infinity` **绝不写进 CSV**，一律写成空串。
//    `JSON.stringify(NaN)` 会静默变成 `null`，CSV 里写 `NaN` 则会让
//    下游的 `parseFloat` 得到 NaN 而**不报错**——两种都是幽灵。
//    空串在 CSV 里是「无数据」的标准表示，分析工具会把它读成缺失值。

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SNAPSHOT_COLUMNS, PROBE_COLUMNS, COLLECTOR_VERSION, telemetryReport } from './collectors.mjs';
import { describeProfile } from './profiles.mjs';
import { DIGEST_SCHEME } from './digest.mjs';
import { countBySeverity } from './diagnostics.mjs';
import { mean, median, min, max, percentile } from './stats.mjs';

/** 工程根目录（`scripts/experiment/` 往上两级）。 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 单文件写入的编码与换行。**换行固定为 `\n`**——不跟随平台。 */
const NL = '\n';

// ───────────────────────────────────────────────────────────────────────
// 数值 / CSV 格式
// ───────────────────────────────────────────────────────────────────────

/** 保留 6 位小数的规范化数值串。整数原样。 */
export function formatNumber(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '';
  if (Number.isInteger(value)) return String(value);
  // 极大 / 极小值不做舍入（舍入会丢有效位，且它们的出现本身就该被看见）
  if (Math.abs(value) >= 1e15 || (Math.abs(value) < 1e-6 && value !== 0)) return String(value);
  return String(Math.round(value * 1e6) / 1e6);
}

/** CSV 字段转义：含逗号 / 引号 / 换行时加引号并翻倍内部引号。 */
function csvField(text) {
  const s = String(text);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 把一组记录序列化成 CSV 文本。列顺序由 `columns` 决定（**唯一真相**）。
 * 记录里缺失的键写成空串——不抛错，因为「某列在这个版本里还没采」是合法状态。
 */
export function toCsv(columns, rows) {
  const lines = [columns.join(',')];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const cells = new Array(columns.length);
    for (let c = 0; c < columns.length; c += 1) {
      cells[c] = csvField(formatNumber(row[columns[c]]));
    }
    lines.push(cells.join(','));
  }
  return `${lines.join(NL)}${NL}`;
}

/** 写文件（自动建目录）。**确定性**：内容只由入参决定。 */
export function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

/** 写 JSON（2 空格缩进 + 末尾换行）。键顺序 = 对象字面量顺序，所以是确定性的。 */
export function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}${NL}`);
}

// ───────────────────────────────────────────────────────────────────────
// 逐 seed 汇总
// ───────────────────────────────────────────────────────────────────────

/** 参与 summary 的数值列（排除身份列）。 */
const SUMMARY_COLUMNS = SNAPSHOT_COLUMNS.filter((c) => c !== 'seed' && c !== 'day' && c !== 'year');

/**
 * 一个 seed 的 summary。
 *
 * ⚠️ 委托书 §13：「**不要只输出平均值**。不同 seed 的差异本身就是研究对象。」
 *    所以每个指标都给 7 个读数 + 首末值，而不是一个均值。
 */
export function summarizeSeed(result, config, diagnostics) {
  const snapshots = result.snapshots;
  const metrics = {};
  for (const key of SUMMARY_COLUMNS) {
    const series = [];
    for (let i = 0; i < snapshots.length; i += 1) {
      const v = snapshots[i][key];
      if (typeof v === 'number' && Number.isFinite(v)) series.push(v);
    }
    metrics[key] = {
      ...describeSeries(series),
      first: series.length ? series[0] : null,
      last: series.length ? series[series.length - 1] : null,
    };
  }
  return {
    seed: result.seed,
    profile: config.profile,
    preset: config.preset,
    years: result.years,
    finalDay: result.finalDay,
    samples: { snapshots: snapshots.length, probes: result.probes.length },
    fingerprint: result.fingerprint,
    telemetry: telemetryReport(),
    diagnostics: countBySeverity(diagnostics),
    metrics,
  };
}

function describeSeries(series) {
  return {
    count: series.length,
    mean: mean(series),
    median: median(series),
    min: min(series),
    max: max(series),
    p10: percentile(series, 0.1),
    p90: percentile(series, 0.9),
  };
}

// ───────────────────────────────────────────────────────────────────────
// 跨 seed 聚合
// ───────────────────────────────────────────────────────────────────────

/**
 * 跨 seed 聚合。
 *
 * 委托书 §13 要求 aggregate 给 mean / median / min / max / p10 / p90。
 * 本函数对每个指标聚合**两套**横截面：
 *   · `final` —— 各 seed 的**末值**。「这些世界最后长成了什么样。」
 *   · `mean`  —— 各 seed 的**全程均值**。「这些世界的常态是什么样。」
 * 两套都要，因为一个「末值相同但路径完全不同」的世界集合与一个
 * 「路径也相同」的世界集合，在只给末值时**长得一模一样**——而前者恰恰说明
 * 世界对冲击的响应是路径依赖的，那是 B 线最关心的事情之一。
 */
export function aggregateAcrossSeeds(seedSummaries) {
  const out = {};
  for (const key of SUMMARY_COLUMNS) {
    const finals = [];
    const means = [];
    const perSeed = {};
    for (const s of seedSummaries) {
      const m = s.metrics[key];
      if (!m) continue;
      perSeed[s.seed] = m.last;
      if (typeof m.last === 'number' && Number.isFinite(m.last)) finals.push(m.last);
      if (typeof m.mean === 'number' && Number.isFinite(m.mean)) means.push(m.mean);
    }
    out[key] = {
      final: { ...describeSeries(finals), perSeed },
      mean: describeSeries(means),
    };
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// git commit（§8：取不到就写 null，不要猜）
// ───────────────────────────────────────────────────────────────────────

/**
 * 当前 HEAD 的 commit SHA。
 * 不是 git 仓库 / git 不在 PATH / 没有提交 ⇒ `null`（委托书 §8 明文）。
 *
 * ⚠️ **不要猜**：写一个假的或空的字符串会让「同 commit」这个前提变成谎言，
 *    而 §14 的确定性判据正是建立在它上面。
 */
export function currentCommit(cwd = REPO_ROOT) {
  try {
    const out = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    });
    const sha = out.trim();
    return /^[0-9a-f]{7,64}$/i.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────
// Manifest
// ───────────────────────────────────────────────────────────────────────

/**
 * 委托书 §8 的 manifest。**不含任何墙钟时间。**
 *
 * 除 §8 点名的字段外，额外记三样：`profileSpec`（profile 的完整语义快照）、
 * `digestScheme`、`columns`（CSV 列清单）。理由：
 *   · 没有 `profileSpec`，一份三个月前的 manifest 里的 `"profile": "natural"`
 *     已经无法证明当时 natural 到底做了什么——而 fixture 是会改的；
 *   · 没有 `columns`，无法判断两份历史 CSV 能不能并排分析。
 */
export function buildManifest(config, extra = {}) {
  return {
    schemaVersion: config.schemaVersion,
    experiment: config.experiment,
    profile: config.profile,
    preset: config.preset,
    seeds: config.seeds.slice(),
    years: config.years,
    stepDays: config.stepDays,
    snapshotDays: config.snapshotDays,
    probeDays: config.probeDays,
    viewPolicy: config.viewPolicy,
    commit: currentCommit(),
    node: process.version,
    collectorVersion: COLLECTOR_VERSION,
    // ── 下面三项是本实现额外记录的（委托书 §8 未点名，但 §25 的
    //    「未来要能表达 paired control / parameter sweep」需要它们）──
    profileSpec: describeProfile(config.profile),
    digestScheme: DIGEST_SCHEME,
    columns: { snapshot: SNAPSHOT_COLUMNS.slice(), probe: PROBE_COLUMNS.slice() },
    ...extra,
  };
}

/**
 * 配置签名：把「这次实验**定义成什么**」压成一个短摘要。
 *
 * ⚠️ 它的唯一用途是**防覆盖事故**（见 `createReporter.begin`）：
 *    一次 `--profile=natural --years=10` 的试跑，若不设防，会把
 *    `baseline-natural/` 里那份 300 年的正式结果**整个盖掉**，
 *    而且不会有任何提示——这是「实验目录」这种设计最容易踩的坑。
 *
 * 参与签名的字段：`profile / preset / viewPolicy / years / stepDays /
 * snapshotDays / probeDays / seeds`。
 *
 * ⚠️ **`commit` 刻意不参与签名**，尽管委托书 §14 的确定性键里有它。
 *    理由：签名管的是「这次实验**定义**成什么」，不是「这份代码是什么版本」。
 *    把 commit 放进去会造成一个荒谬的后果——
 *    修完一个 bug 想**用同一份 Job 重跑**时，会被自己的防覆盖检查拦下，
 *    而重跑恰恰是修 bug 之后的**标准动作**。
 *    commit 照旧进 manifest（所以两份结果的代码版本**可比**），
 *    只是不参与「能不能写进这个目录」的判定。
 *
 * ⚠️ `collect` 也不参与：它的全部意义就是「同一个世界线，两种采集开关」。
 */
export function configSignature(config) {
  const key = [
    config.profile, config.preset, config.viewPolicy,
    String(config.years), String(config.stepDays),
    String(config.snapshotDays), String(config.probeDays),
    config.seeds.join(','),
  ].join('|');
  return createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 16);
}

// ───────────────────────────────────────────────────────────────────────
// Reporter
// ───────────────────────────────────────────────────────────────────────

/**
 * 建一个报告器。产物路径：`<outputRoot>/<experiment>/`。
 *
 * 用法：
 * ```js
 * const reporter = createReporter(config, { outputRoot });
 * reporter.begin();
 * for (const seed of config.seeds) reporter.record(runSeedSafely(config, seed));
 * reporter.finish(runtime);
 * ```
 */
export function createReporter(config, options = {}) {
  const rootDir = path.resolve(options.outputRoot || config.outputRoot || 'reports/inkbox/experiments');
  const dir = path.join(rootDir, config.experiment);
  const seedsDir = path.join(dir, 'seeds');

  /** 已完成的 seed 结果（按配置顺序）。 */
  const done = [];
  /** 失败的 seed。 */
  const failures = [];

  function seedDir(seed) {
    return path.join(seedsDir, String(seed));
  }

  function begin() {
    fs.mkdirSync(dir, { recursive: true });

    // ── 防覆盖：同一目录里已有一份**不同配置**的结果时，拒绝开跑 ──
    const manifestPath = path.join(dir, 'manifest.json');
    const commit = currentCommit();
    const signature = configSignature(config);
    if (fs.existsSync(manifestPath) && options.overwrite !== true) {
      let previous = null;
      try {
        previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch { /* 读不动就当作「有一份但不可解析」，仍然拦下来 */ }
      if (!previous || previous.configSignature !== signature) {
        const err = new Error(
          `输出目录「${path.relative(REPO_ROOT, dir)}」已存在一份**不同配置**的结果`
          + (previous ? `（experiment=${previous.experiment} / years=${previous.years} / seeds=${JSON.stringify(previous.seeds)} / signature=${previous.configSignature || '—'}）` : '（manifest 不可解析）')
          + `，本次配置的 signature 是 ${signature}。`
          + '为避免覆盖正式结果，已中止。请改 --experiment=<新名字>，或显式加 --overwrite。',
        );
        err.code = 'OUTPUT_EXISTS';
        throw err;
      }
    }

    // manifest 在**跑之前**就落盘：这样即便第 1 个 seed 就崩，
    // 目录里也已经有一份「本来打算跑什么」的记录。
    writeJson(manifestPath, buildManifest(config, {
      configSignature: signature,
      commitSource: 'git rev-parse HEAD',
      commitAvailable: commit !== null,
    }));
  }

  /** 写一个 seed 的全套产物。**只写自己的目录，不动顶层**。 */
  function writeSeedFiles(outcome) {
    if (!outcome.ok) return;
    const r = outcome.result;
    const sDir = seedDir(r.seed);
    const diagnostics = options.diagnose
      ? options.diagnose(r, config)
      : (r.diagnostics || []);
    writeText(path.join(sDir, 'timeseries.csv'), toCsv(SNAPSHOT_COLUMNS, r.snapshots));
    writeText(path.join(sDir, 'probes.csv'), toCsv(PROBE_COLUMNS, r.probes));
    writeJson(path.join(sDir, 'summary.json'), summarizeSeed(r, config, diagnostics));
    writeJson(path.join(sDir, 'diagnostics.json'), diagnostics);
    writeJson(path.join(sDir, 'fingerprint.json'), r.fingerprint);
  }

  /** 刷新顶层合并产物（内容 = 已完成 seed 的并集）。 */
  function refreshMerged() {
    const snapshots = [];
    const probes = [];
    const diagnostics = [];
    const summaries = [];
    for (const r of done) {
      for (const s of r.snapshots) snapshots.push(s);
      for (const p of r.probes) probes.push(p);
      const d = options.diagnose ? options.diagnose(r, config) : (r.diagnostics || []);
      for (const e of d) diagnostics.push(e);
      summaries.push(summarizeSeed(r, config, d));
    }
    writeText(path.join(dir, 'timeseries.csv'), toCsv(SNAPSHOT_COLUMNS, snapshots));
    writeText(path.join(dir, 'probes.csv'), toCsv(PROBE_COLUMNS, probes));
    writeJson(path.join(dir, 'diagnostics.json'), diagnostics);
    writeJson(path.join(dir, 'summary.json'), buildSummary(config, summaries, diagnostics, failures));
  }

  /**
   * 记录一个 seed 的结局。**每完成一个 seed 就把两层都落盘**（委托书 §16）。
   */
  function record(outcome) {
    if (outcome.ok) {
      done.push(outcome.result);
      writeSeedFiles(outcome);
    } else {
      failures.push({ seed: outcome.seed, ...outcome.error });
      // 失败的 seed 也留一份自己的记录——「为什么没跑出来」本身是数据。
      writeJson(path.join(seedDir(outcome.seed), 'failure.json'), {
        seed: outcome.seed,
        message: outcome.error.message,
        stack: outcome.error.stack,
      });
    }
    refreshMerged();
  }

  function finish(runtime) {
    writeJson(path.join(dir, 'runtime.json'), {
      deterministic: false,
      note: '本文件包含非确定性 metadata（墙钟时间 / 主机名 / 内存）。'
        + 'manifest.json / summary.json / timeseries.csv / probes.csv / diagnostics.json '
        + '都不含它们，因此同配置重复运行可以逐 byte 比对。',
      ...runtime,
    });
    return dir;
  }

  return { dir, rootDir, begin, record, finish, done, failures, seedDir };
}

/** 顶层 summary.json 的形状。 */
export function buildSummary(config, seedSummaries, diagnostics, failures) {
  return {
    schemaVersion: config.schemaVersion,
    experiment: config.experiment,
    config: {
      profile: config.profile,
      preset: config.preset,
      seeds: config.seeds.slice(),
      years: config.years,
      stepDays: config.stepDays,
      snapshotDays: config.snapshotDays,
      probeDays: config.probeDays,
      viewPolicy: config.viewPolicy,
      collect: config.collect,
    },
    completedSeeds: seedSummaries.map((s) => s.seed),
    failedSeeds: failures.map((f) => f.seed),
    perSeed: seedSummaries.map((s) => ({
      seed: s.seed,
      samples: s.samples,
      fingerprint: s.fingerprint,
      // ⚠️ 字段名是 `diagnosticCounts` 而不是 `diagnostics`：后者与顶层
      //    `diagnostics: { counts, codes }` 重名，会让读 JSON 的人
      //    以为两处同形（实际一处是计数、一处是 {counts, codes}）。
      diagnosticCounts: s.diagnostics,
      // 关键读数的末值与均值单列出来——读报告的人不该为了看四个数去翻 90 个指标。
      headline: {
        popTotal: { last: s.metrics.popTotal?.last ?? null, mean: s.metrics.popTotal?.mean ?? null },
        popCultivatorShare: { last: s.metrics.popCultivatorShare?.last ?? null, mean: s.metrics.popCultivatorShare?.mean ?? null },
        villageCount: { last: s.metrics.villageCount?.last ?? null, mean: s.metrics.villageCount?.mean ?? null },
        foodP10: { last: s.metrics.foodP10?.last ?? null, mean: s.metrics.foodP10?.mean ?? null },
        sectCount: { last: s.metrics.sectCount?.last ?? null, mean: s.metrics.sectCount?.mean ?? null },
        leylineControlled: { last: s.metrics.leylineControlled?.last ?? null, mean: s.metrics.leylineControlled?.mean ?? null },
        riftCrossedCum: { last: s.metrics.riftCrossedCum?.last ?? null },
        soulCumulativeCreated: { last: s.metrics.soulCumulativeCreated?.last ?? null },
      },
    })),
    aggregate: aggregateAcrossSeeds(seedSummaries),
    diagnostics: {
      counts: countBySeverity(diagnostics),
      codes: [...new Set(diagnostics.map((d) => d.code))].sort(),
    },
    telemetry: telemetryReport(),
    failures,
  };
}
