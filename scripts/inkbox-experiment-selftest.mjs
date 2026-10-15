#!/usr/bin/env node
// 水墨沙盒 · World Laboratory 自检
//
// ───────────────────────────────────────────────────────────────────────
// 这个脚本证明什么（对应委托书的三条硬性验收）
// ───────────────────────────────────────────────────────────────────────
//
//   §11 「统计函数必须：无随机性；有单元测试；对空数组有明确行为；不产生 NaN 传播」
//        → 第一段：纯函数单元测试。
//
//   §15 「开启或关闭数据收集，不应改变世界线。建议增加一个验证：
//        同 seed 跑 A = collector off / B = collector on，最终世界 digest 必须一致。」
//        → 第二段：collector purity。
//
//   §14 「同一 commit/seed/profile/preset/years/stepDays/viewPolicy 重复执行两次：
//        manifest / summary / timeseries / diagnostics 必须可比较。」
//        → 第三段：确定性。
//
//   §7  「非法输入应：输出明确错误；exit code 非 0；不静默 fallback」
//        → 第四段：Job 校验。
//
// ⚠️ 本脚本**不进 `npm test`**。委托书 §18：「不要把 B0 health report 加入 npm test。
//    现阶段：World Health 是研究工具，不是 release gate。」
//    跑法：`npm run test:experiment`。
//
// ⚠️ 但它与「World Health report」是**两件不同的事**：本脚本测的是
//    **实验工具的机械正确性**（统计函数对不对、采集器脏不脏、可不可重复），
//    不是「这个世界健不健康」。前者是工具的自检，后者是研究输出。
//    把两者混在一起，会让「工具坏了」和「世界有异常」变得无法区分。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  coefficientOfVariation, count, describe, entropy, gini, hhi, isNonDecreasing,
  isNonIncreasing, max, mean, median, min, percentile, relativeDrift, slope, stddev, sum, tail,
} from './experiment/stats.mjs';
import { validateJob, defaultJob, jobFromArgs, withProfileDefaults, JOB_SCHEMA_VERSION } from './experiment/job-schema.mjs';
import { PROFILES, PROFILE_NAMES, legacyViewOpenAt, LEGACY_RIFT_OPEN_SITES, parameterOverrideSignature } from './experiment/profiles.mjs';
import { runSeed, runSeedSafely } from './experiment/runner.mjs';
import { createLabWorld } from './experiment/world-factory.mjs';
import { worldFingerprint } from './experiment/digest.mjs';
import {
  tunable, tunableDefault, tunableMeta, TUNABLE_NAMES, withTunables,
  setTunables, resetTunables, tunablesActive, currentOverrides,
} from '../src/inkbox/sim/tunables.js';
import {
  aggregate, buildManifest, buildSummary, configSignature, createReporter, formatNumber,
  REPO_ROOT, sourceRevision, toCsv,
} from './experiment/report.mjs';
import { SNAPSHOT_COLUMNS, PROBE_COLUMNS, collectSnapshot } from './experiment/collectors.mjs';
import { diagnoseSeed } from './experiment/diagnostics.mjs';
import { advanceWorld } from '../src/inkbox/sim/advance.js';
import { compareWorldConstruction, compareSteppedWorlds } from './experiment/equivalence.mjs';
import { TELEMETRY_KEYS, bumpTelemetry, readTelemetry } from '../src/inkbox/sim/telemetry.js';
// B2-2：命运队列的纯函数（选队 / 采集 / 摘要）与被测本体同源导入。
import {
  FATE_COLUMNS, FATE_FILTERS, FATE_QUEUE_KEYS, collectFate, fateQueueSpec,
  fateQueueSummary, selectFateQueue,
} from './experiment/fate-queue.mjs';
import { FATE_CSV_COLUMNS, flattenFate } from './experiment/report.mjs';

let checks = 0;
let failed = 0;

function check(label, fn) {
  checks += 1;
  try {
    fn();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${label}\n      ${error.message}`);
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(64)}\n${title}\n${'─'.repeat(64)}`);
}

// ══════════════════════════════════════════════════════════════════
section('§11 · 统计函数（纯函数 / 空数组行为 / 无 NaN 传播）');
// ══════════════════════════════════════════════════════════════════

const EMPTY = [];
const SCALARS = [
  ['mean', mean], ['min', min], ['max', max], ['sum', sum], ['median', median],
  ['stddev', stddev], ['coefficientOfVariation', coefficientOfVariation],
  ['gini', gini], ['hhi', hhi], ['entropy', entropy], ['slope', slope],
  ['relativeDrift', relativeDrift],
];

check('空数组：全部标量函数返回 null，且**不返回 NaN / Infinity**', () => {
  for (const [name, fn] of SCALARS) {
    const v = fn(EMPTY);
    assert.equal(v, null, `${name}([]) 应为 null，实际 ${String(v)}`);
    assert.ok(!Number.isNaN(v), `${name}([]) 返回了 NaN`);
  }
  assert.equal(percentile(EMPTY, 0.5), null);
  assert.equal(count(EMPTY), 0);
  assert.deepEqual(tail(EMPTY), []);
});

check('空数组：布尔判据是「平凡成立」，不是 null', () => {
  assert.equal(isNonDecreasing(EMPTY), true);
  assert.equal(isNonIncreasing(EMPTY), true);
  assert.equal(isNonDecreasing([3]), true);
});

check('非数字 / NaN / Infinity 一律被剔除，不参与计算', () => {
  assert.equal(mean([1, NaN, 3, Infinity, -Infinity, 'x', null, undefined]), 2);
  assert.equal(count([1, NaN, 2]), 2);
  assert.equal(min([NaN, 5]), 5);
});

check('全 NaN 输入 ⇒ null（不是 NaN）', () => {
  assert.equal(mean([NaN, NaN]), null);
  assert.equal(gini([NaN]), null);
});

check('mean / min / max / sum / median 的基本正确性', () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5);
  assert.equal(min([4, -1, 9]), -1);
  assert.equal(max([4, -1, 9]), 9);
  assert.equal(sum([1, 2, 3]), 6);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([1, 2, 3]), 2);
});

check('percentile 线性插值 + 越界夹住（不抛错）', () => {
  assert.equal(percentile([0, 10], 0.5), 5);
  assert.equal(percentile([1, 2, 3, 4, 5], 0), 1);
  assert.equal(percentile([1, 2, 3, 4, 5], 1), 5);
  assert.equal(percentile([1, 2, 3, 4, 5], 2), 5);      // p > 1 被夹住
  assert.equal(percentile([1, 2, 3, 4, 5], -1), 1);     // p < 0 被夹住
  assert.equal(percentile([1, 2, 3, 4, 5], NaN), 1);    // p 非数字 ⇒ 当 0
});

check('gini：完全平均 = 0，极端集中 → 1，全 0 数组 = 0', () => {
  assert.equal(gini([5, 5, 5, 5]), 0);
  assert.equal(gini([0, 0, 0]), 0);
  const g = gini([0, 0, 0, 100]);
  assert.ok(g > 0.7 && g <= 1, `gini([0,0,0,100]) = ${g}，应接近 1`);
  assert.equal(gini([1, -1]), null);   // 有负数 ⇒ 口径失效，不硬算
});

check('HHI：n 个等份 ⇒ 1/n；独占 ⇒ 1；全 0 / 空 ⇒ null', () => {
  const four = hhi([1, 1, 1, 1]);
  assert.ok(Math.abs(four - 0.25) < 1e-12, `hhi 等份应为 0.25，实际 ${four}`);
  assert.equal(hhi([7, 0, 0, 0]), 1);
  assert.equal(hhi([0, 0]), null);
  assert.equal(hhi(EMPTY), null);
});

check('entropy：均匀分布取最大值 ln(n)；单一取值 ⇒ 0', () => {
  const h = entropy([1, 1, 1, 1]);
  assert.ok(Math.abs(h - Math.log(4)) < 1e-12, `entropy 应为 ln4，实际 ${h}`);
  assert.equal(entropy([5, 0, 0, 0]), 0);
  assert.equal(entropy([0, 0]), null);
});

check('slope：严格线性序列的斜率精确；n < 2 ⇒ null', () => {
  assert.ok(Math.abs(slope([0, 2, 4, 6]) - 2) < 1e-12);
  assert.ok(Math.abs(slope([10, 10, 10]) - 0) < 1e-12);
  assert.equal(slope([1]), null);
  assert.equal(slope(EMPTY), null);
});

check('coefficientOfVariation：零均值 ⇒ null（不是 Infinity）', () => {
  assert.equal(coefficientOfVariation([0, 0, 0]), null);
  assert.equal(coefficientOfVariation([1, -1]), null);   // 均值 0
  const cv = coefficientOfVariation([2, 2, 2]);
  assert.ok(Math.abs(cv - 0) < 1e-12);
});

check('tail / relativeDrift：后段窗口与相对漂移', () => {
  assert.deepEqual(tail([1, 2, 3, 4, 5, 6], 1 / 3), [5, 6]);
  assert.deepEqual(tail([1, 2, 3], 0), [3]);              // 至少取 1 个点
  assert.equal(tail(EMPTY).length, 0);
  assert.ok(Math.abs(relativeDrift([10, 10, 10, 10]) - 0) < 1e-12);
  assert.equal(relativeDrift([0, 0, 0]), null);
});

check('isNonDecreasing / isNonIncreasing：平台算通过', () => {
  assert.equal(isNonDecreasing([1, 1, 2, 2, 3]), true);
  assert.equal(isNonDecreasing([1, 0]), false);
  assert.equal(isNonIncreasing([3, 3, 1, 1]), true);
  assert.equal(isNonIncreasing([1, 2]), false);
});

check('describe：全字段齐全，空数组下全是 null / 0', () => {
  const d = describe([1, 2, 3]);
  for (const k of ['count', 'mean', 'min', 'max', 'p10', 'p50', 'p90', 'stddev']) {
    assert.ok(k in d, `describe 缺字段 ${k}`);
  }
  const e = describe(EMPTY);
  assert.equal(e.count, 0);
  assert.equal(e.mean, null);
  assert.equal(e.min, null);
});

// ══════════════════════════════════════════════════════════════════
section('§7 · Job 校验（非法输入必须响，不静默 fallback）');
// ══════════════════════════════════════════════════════════════════

const goodJob = defaultJob();

check('规范 Job 通过，并补齐默认值', () => {
  const v = validateJob(goodJob);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.equal(v.config.collect, true);
  assert.equal(v.config.outputRoot, 'reports/inkbox/experiments');
  assert.equal(v.config.failFast, false);
});

check('未知字段被拒绝（不忽略）', () => {
  const v = validateJob({ ...goodJob, stepdays: 3 });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('未知字段')), JSON.stringify(v.errors));
});

check('schemaVersion 不匹配被拒绝', () => {
  assert.equal(validateJob({ ...goodJob, schemaVersion: 99 }).ok, false);
  assert.equal(validateJob({ ...goodJob, schemaVersion: undefined }).ok, false);
});

check('seeds：空 / 非整数 / 负数 / 重复 都被拒绝', () => {
  assert.equal(validateJob({ ...goodJob, seeds: [] }).ok, false);
  assert.equal(validateJob({ ...goodJob, seeds: [1.5] }).ok, false);
  assert.equal(validateJob({ ...goodJob, seeds: [-1] }).ok, false);
  assert.equal(validateJob({ ...goodJob, seeds: [7, 7] }).ok, false);
});

check('profile / preset / viewPolicy 取值域被拒绝越界', () => {
  assert.equal(validateJob({ ...goodJob, profile: 'nope' }).ok, false);
  assert.equal(validateJob({ ...goodJob, preset: 'huge' }).ok, false);
  assert.equal(validateJob({ ...goodJob, viewPolicy: 'always' }).ok, false);
});

check('profile ⟹ viewPolicy 的语义咬合（natural 不许开视界）', () => {
  const v = validateJob({ ...goodJob, profile: 'natural', viewPolicy: 'legacy-duty-cycle' });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('natural')), JSON.stringify(v.errors));
  const w = validateJob({ ...goodJob, profile: 'legacy-longrun', viewPolicy: 'closed' });
  assert.equal(w.ok, false);
});

check('experiment id 的目录安全性', () => {
  assert.equal(validateJob({ ...goodJob, experiment: '../escape' }).ok, false);
  assert.equal(validateJob({ ...goodJob, experiment: 'a/b' }).ok, false);
  assert.equal(validateJob({ ...goodJob, experiment: 'ok-1.2_3' }).ok, true);
});

check('时间轴：probeDays > snapshotDays 被拒绝', () => {
  const v = validateJob({ ...goodJob, snapshotDays: 30, probeDays: 360 });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('probeDays')), JSON.stringify(v.errors));
});

check('withProfileDefaults 只补 viewPolicy，不碰别的字段', () => {
  const r = withProfileDefaults({ profile: 'natural', seeds: [1], years: 10, stepDays: 3, snapshotDays: 360, probeDays: 30, schemaVersion: JOB_SCHEMA_VERSION, experiment: 'x', preset: 'small' });
  assert.equal(r.viewPolicy, 'closed');
  assert.equal(r.years, 10);
});

check('布尔参数不做真值强转（--collect=maybe 必须报错，不能当成 true）', () => {
  const bad = validateJob(jobFromArgs({ collect: 'maybe' }, goodJob));
  assert.equal(bad.ok, false, '--collect=maybe 被静默当成布尔值了');
  assert.ok(bad.errors.some((e) => e.includes('collect')), JSON.stringify(bad.errors));
  assert.equal(validateJob(jobFromArgs({ collect: 'false' }, goodJob)).config.collect, false);
  assert.equal(validateJob(jobFromArgs({ collect: 'true' }, goodJob)).config.collect, true);
});

check('数值参数不做静默兜底（--years=abc 必须报错，不能变成默认值）', () => {
  const bad = validateJob(jobFromArgs({ years: 'abc' }, goodJob));
  assert.equal(bad.ok, false, '--years=abc 被静默吞掉了');
  const badSeeds = validateJob(jobFromArgs({ seeds: '1,,2' }, goodJob));
  assert.equal(badSeeds.ok, false, '--seeds=1,,2 里的空片段被静默过滤了');
});

check('每个 profile 都声明了合法的 viewPolicy，且名字与表键一致', () => {
  for (const name of PROFILE_NAMES) {
    const p = PROFILES[name];
    assert.ok(p, `PROFILES 缺 ${name}`);
    assert.equal(p.name, name, `${name} 的 name 字段与键不一致`);
    assert.ok(['closed', 'legacy-duty-cycle'].includes(p.viewPolicy));
    assert.equal(typeof p.viewOpenAt, 'function');
    assert.equal(typeof p.afterYear, 'function');
    assert.equal(typeof p.beforeRun, 'function');
  }
});

// ══════════════════════════════════════════════════════════════════
section('§14 · 世界工厂与世界指纹（同 seed 建两次必须一致）');
// ══════════════════════════════════════════════════════════════════

check('createLabWorld 两次同参 ⇒ digest 逐字相同', () => {
  const a = createLabWorld({ seed: 4242, preset: 'small', profile: 'natural' });
  const b = createLabWorld({ seed: 4242, preset: 'small', profile: 'natural' });
  assert.equal(worldFingerprint(a.world).digest, worldFingerprint(b.world).digest);
});

check('natural profile 不往 pendingSpawns 里多塞人（委托书 §5 / §23.F）', () => {
  const lab = createLabWorld({ seed: 4242, preset: 'small', profile: 'natural' });
  // `generateWorld(scatter:true)` 自己会撒 6 组人 + 14 组野兽，那是世界生成的正常产物。
  // 「额外人口夹具」的判据是 tally 里的计数必须为 0。
  assert.equal(lab.tally.extraPopulationGroups, 0);
  assert.equal(lab.tally.extraPopulationCount, 0);
});

check('legacy-longrun profile 确实多塞了 5 组 × 14 人', () => {
  const lab = createLabWorld({ seed: 4242, preset: 'medium', profile: 'legacy-longrun' });
  assert.equal(lab.tally.extraPopulationGroups, 5);
  assert.equal(lab.tally.extraPopulationCount, 70);
});

check('preset 与夹具标定不一致时留下可读的注记（不静默）', () => {
  const lab = createLabWorld({ seed: 1, preset: 'small', profile: 'legacy-longrun' });
  assert.ok(lab.notes.some((n) => n.startsWith('profile_preset_mismatch')), JSON.stringify(lab.notes));
});

check('natural 的视界恒闭；legacy 的视界按 20 年周期开 5 年', () => {
  assert.equal(PROFILES.natural.viewOpenAt(1), false);
  assert.equal(PROFILES.natural.viewOpenAt(21), false);
  assert.equal(legacyViewOpenAt(1), true);
  assert.equal(legacyViewOpenAt(5), true);
  assert.equal(legacyViewOpenAt(6), false);
  assert.equal(legacyViewOpenAt(21), true);
  assert.equal(legacyViewOpenAt(26), false);
});

check('上界 / 幽冥都挂上了（否则飞升与跨界会静默失效）', () => {
  const lab = createLabWorld({ seed: 99, preset: 'small', profile: 'natural' });
  assert.ok(lab.world.upper, 'world.upper 未挂');
  assert.ok(lab.world.nether, 'world.nether 未挂');
  assert.equal(lab.world.upper.plane, 'upper');
  assert.ok(Array.isArray(lab.world.upper.entities));
  assert.ok(Array.isArray(lab.world.nether.entities));
});

// ══════════════════════════════════════════════════════════════════
section('§15 · Collector purity（开关采集不得改变世界线）');
// ══════════════════════════════════════════════════════════════════

const purityBase = {
  schemaVersion: JOB_SCHEMA_VERSION,
  experiment: 'selftest-purity',
  profile: 'natural',
  preset: 'small',
  seeds: [31337],
  years: 12,
  stepDays: 3,
  snapshotDays: 360,
  probeDays: 30,
  viewPolicy: 'closed',
  collect: true,
  outputRoot: 'reports/inkbox/experiments',
  failFast: false,
};

check('natural · 同 seed 开/关采集 ⇒ world digest 逐字相同', () => {
  const off = runSeed({ ...purityBase, collect: false }, 31337);
  const on = runSeed({ ...purityBase, collect: true }, 31337);
  assert.equal(off.snapshots.length, 0, 'collect=false 时不应产出快照');
  assert.equal(off.probes.length, 0, 'collect=false 时不应产出探针');
  assert.ok(on.snapshots.length > 0, 'collect=true 时应产出快照');
  assert.equal(on.fingerprint.digest, off.fingerprint.digest,
    `采集改变了世界线：off=${off.fingerprint.digest} on=${on.fingerprint.digest}`);
});

check('legacy-longrun · 开缝夹具 + 开/关采集 ⇒ world digest 逐字相同', () => {
  // 22 年覆盖两个开窗期（第 1-5 年、第 21-22 年），把上界缝与幽冥缝都真正跑起来。
  // ⚠️ 这一条比上一条重要：旧长测的「玩家开缝」是**唯一**会往世界里加实体的夹具，
  //    若采集器恰好在那条路径上抽了一次签，只有这一条能抓到。
  const legacy = {
    ...purityBase,
    profile: 'legacy-longrun',
    preset: 'medium',
    years: 22,
    viewPolicy: 'legacy-duty-cycle',
  };
  const off = runSeed({ ...legacy, collect: false }, 31337);
  const on = runSeed({ ...legacy, collect: true }, 31337);
  assert.equal(on.fingerprint.digest, off.fingerprint.digest,
    `采集改变了世界线：off=${off.fingerprint.digest} on=${on.fingerprint.digest}`);
  assert.ok(on.tally.riftOpenedUpper + on.tally.riftOpenedNether > 0,
    '夹具没有开出任何缝 —— 这条纯度测试就空转了');
});

// ══════════════════════════════════════════════════════════════════
section('§14 · 确定性（同配置重复运行必须逐字段一致）');
// ══════════════════════════════════════════════════════════════════

const detCfg = { ...purityBase, years: 8, experiment: 'selftest-determinism' };

check('同配置跑两次 ⇒ timeseries.csv 逐 byte 相同', () => {
  const a = runSeed(detCfg, 31337);
  const b = runSeed(detCfg, 31337);
  const csvA = toCsv(SNAPSHOT_COLUMNS, a.snapshots);
  const csvB = toCsv(SNAPSHOT_COLUMNS, b.snapshots);
  assert.equal(csvA, csvB, 'timeseries.csv 两次不一致');
  assert.equal(toCsv(PROBE_COLUMNS, a.probes), toCsv(PROBE_COLUMNS, b.probes));
});

check('同配置跑两次 ⇒ 快照逐字段一致（含浮点）', () => {
  const a = runSeed(detCfg, 31337);
  const b = runSeed(detCfg, 31337);
  assert.equal(a.snapshots.length, b.snapshots.length);
  for (let i = 0; i < a.snapshots.length; i += 1) {
    for (const key of SNAPSHOT_COLUMNS) {
      assert.equal(a.snapshots[i][key], b.snapshots[i][key],
        `第 ${i} 行字段 ${key} 不一致：${a.snapshots[i][key]} vs ${b.snapshots[i][key]}`);
    }
  }
});

check('stepDays 不同 ⇒ 世界线不同（说明它确实是确定性键之一）', () => {
  const a = runSeed({ ...detCfg, stepDays: 3 }, 31337);
  const b = runSeed({ ...detCfg, stepDays: 4 }, 31337);
  assert.notEqual(a.fingerprint.digest, b.fingerprint.digest,
    'stepDays 改了世界线却没变 —— 那意味着采样与推进耦合错了');
});

check('diagnostics 两次一致', () => {
  const a = diagnoseSeed(runSeed(detCfg, 31337), detCfg);
  const b = diagnoseSeed(runSeed(detCfg, 31337), detCfg);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

// ══════════════════════════════════════════════════════════════════
section('§8 / §13 · 产物形状（无时间戳、列稳定、无 NaN 落盘）');
// ══════════════════════════════════════════════════════════════════

check('formatNumber：整数原样 / 小数 6 位 / null 与 NaN 空串 / 布尔 0-1', () => {
  assert.equal(formatNumber(7), '7');
  assert.equal(formatNumber(0.1 + 0.2), '0.3');
  assert.equal(formatNumber(null), '');
  assert.equal(formatNumber(undefined), '');
  assert.equal(formatNumber(NaN), '');
  assert.equal(formatNumber(Infinity), '');
  assert.equal(formatNumber(true), '1');
  assert.equal(formatNumber(false), '0');
  assert.equal(formatNumber(''), '');
});

check('toCsv：列顺序由列清单决定，缺失键写空串，含逗号的值被转义', () => {
  const csv = toCsv(['a', 'b'], [{ a: 1, b: 'x,y' }, { a: 2 }]);
  assert.equal(csv, 'a,b\n1,"x,y"\n2,\n');
});

check('manifest 不含任何墙钟时间字段（保证可逐 byte 比对）', () => {
  const m = buildManifest({ ...defaultJob(), collect: true, outputRoot: 'x', failFast: false });
  const banned = /(At|Time|time|timestamp|elapsed|duration|hostname|Date)/;
  for (const key of Object.keys(m)) {
    assert.ok(!banned.test(key), `manifest 出现了疑似非确定性字段「${key}」`);
  }
  assert.ok(!JSON.stringify(m).match(/\d{4}-\d{2}-\d{2}T/), 'manifest 里出现了 ISO 时间串');
});

check('configSignature：世界线键变了签名就变，collect 不影响签名', () => {
  const base = { ...defaultJob(), snapshotDays: 360, probeDays: 30 };
  const s1 = configSignature(base);
  const s2 = configSignature({ ...base, years: 301 });
  const s3 = configSignature({ ...base, collect: false });
  assert.notEqual(s1, s2);
  assert.equal(s1, s3);
});

check('CSV 表头 == 列清单（列清单是唯一真相）', () => {
  const csv = toCsv(SNAPSHOT_COLUMNS, []);
  assert.equal(csv, `${SNAPSHOT_COLUMNS.join(',')}\n`);
  assert.equal(new Set(SNAPSHOT_COLUMNS).size, SNAPSHOT_COLUMNS.length, '快照列有重名');
  assert.equal(new Set(PROBE_COLUMNS).size, PROBE_COLUMNS.length, '探针列有重名');
});

check('采集器产出的键集合与列清单严格一致（多一个少一个都算漂）', () => {
  const r = runSeed({ ...detCfg, years: 2 }, 31337);
  assert.ok(r.snapshots.length >= 1);
  const expected = new Set(SNAPSHOT_COLUMNS);
  for (const row of r.snapshots) {
    for (const key of Object.keys(row)) {
      assert.ok(expected.has(key), `快照多出未声明的键「${key}」`);
    }
    for (const key of SNAPSHOT_COLUMNS) {
      assert.ok(key in row, `快照缺少已声明的键「${key}」`);
    }
  }
  const probeExpected = new Set(PROBE_COLUMNS);
  for (const row of r.probes) {
    for (const key of Object.keys(row)) {
      assert.ok(probeExpected.has(key), `探针多出未声明的键「${key}」`);
    }
  }
});

// ══════════════════════════════════════════════════════════════════
section('§16 · 单 seed 失败不毁整批');
// ══════════════════════════════════════════════════════════════════

check('runSeedSafely 把异常变成可记录的结果，且保留 stack', () => {
  const outcome = runSeedSafely({ ...detCfg, profile: 'no-such-profile' }, 1);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.seed, 1);
  assert.ok(outcome.error.message.includes('no-such-profile'), outcome.error.message);
  assert.ok(typeof outcome.error.stack === 'string' && outcome.error.stack.length > 0);
});

check('legacy 夹具坐标与预设无关地「不越界抛错」（落空只是 no-site）', () => {
  // small 预设下 x=220 的站点落在世界外，`openRifts` 应把它夹到边界并返回 no-site，
  // 而**不是**抛异常 —— 抛异常会让整批实验在第 1 年就死。
  const cfg = {
    ...purityBase, profile: 'legacy-longrun', preset: 'small', years: 2,
    viewPolicy: 'legacy-duty-cycle',
  };
  const outcome = runSeedSafely(cfg, 31337);
  assert.equal(outcome.ok, true, outcome.error && outcome.error.message);
  assert.ok(LEGACY_RIFT_OPEN_SITES.some(([x]) => x > 200), '夹具坐标应有一条确实落在 small 世界之外');
});

// ══════════════════════════════════════════════════════════════════
section('B0.1 §1/§2/§4/§6/§7 · 口径补丁（civil/wild · 粮食 · 遥测账本 · RNG draw）');
// ══════════════════════════════════════════════════════════════════

/** B0.1 新增的快照列。**顺序必须与 `SNAPSHOT_COLUMNS` 末尾严格一致**。 */
const B01_SNAPSHOT_COLUMNS = Object.freeze([
  'popCivil', 'popCultivatorShareCivil',
  'foodEmptyCount', 'foodEmptyShare', 'foodEmptyPopulation',
  'popBirthsCum', 'popAwakensCum', 'soulPoolEvictedCum', 'lifeRngDrawsCum',
]);
/** B0.1 新增的探针列。 */
const B01_PROBE_COLUMNS = Object.freeze(['popCivil', 'foodEmptyShare', 'foodEmptyPopulation']);

check('B0.1 新列全部存在，且**都在列清单末尾**（追加式：不改名、不删列、不插中间）', () => {
  for (const c of B01_SNAPSHOT_COLUMNS) {
    assert.ok(SNAPSHOT_COLUMNS.includes(c), `快照缺 B0.1 列「${c}」`);
  }
  for (const c of B01_PROBE_COLUMNS) {
    assert.ok(PROBE_COLUMNS.includes(c), `探针缺 B0.1 列「${c}」`);
  }
  assert.deepEqual(SNAPSHOT_COLUMNS.slice(-B01_SNAPSHOT_COLUMNS.length), [...B01_SNAPSHOT_COLUMNS],
    'B0.1 的快照列没有落在末尾 —— 旧 CSV 将不再是新 CSV 的前缀子集');
  assert.deepEqual(PROBE_COLUMNS.slice(-B01_PROBE_COLUMNS.length), [...B01_PROBE_COLUMNS],
    'B0.1 的探针列没有落在末尾');
});

// 一次 12 年的 small 世界，供下面所有口径断言复用（只跑一次，别把自检跑成批实验）。
const b01Run = runSeed({ ...purityBase, years: 12 }, 31337);
const b01Last = b01Run.snapshots[b01Run.snapshots.length - 1];

check('人口口径恒等式（逐行）：popCivil = 凡人 + 修士；popTotal = popCivil + popWild', () => {
  for (const row of b01Run.snapshots) {
    assert.equal(row.popCivil, row.popMortals + row.popCultivators,
      `第 ${row.year} 年 popCivil 对不上：${row.popCivil} vs ${row.popMortals}+${row.popCultivators}`);
    assert.equal(row.popTotal, row.popCivil + row.popWild,
      `第 ${row.year} 年 popTotal 对不上：${row.popTotal} vs ${row.popCivil}+${row.popWild}`);
  }
});

check('cultivatorShareCivil 的分母**只含人**（兽 / 灵不进分母），且 ≤ 含野生的那个口径', () => {
  for (const row of b01Run.snapshots) {
    if (row.popCivil > 0) {
      assert.ok(Math.abs(row.popCultivatorShareCivil - row.popCultivators / row.popCivil) < 1e-12,
        `第 ${row.year} 年 cultivatorShareCivil 口径错：${row.popCultivatorShareCivil}`);
    } else {
      // 没有人 ⇒ null，不是 0。「没有分母」与「占比为零」是两件事。
      assert.equal(row.popCultivatorShareCivil, null, `第 ${row.year} 年 popCivil=0 时应为 null`);
    }
    if (row.popCultivatorShare !== null && row.popCultivatorShareCivil !== null) {
      assert.ok(row.popCultivatorShare <= row.popCultivatorShareCivil + 1e-12,
        `第 ${row.year} 年：含兽/灵的分母更大，占比不该更大`);
    }
  }
});

check('粮食：foodEmptyShare 的分母是**聚落数**；无聚落时为 null 而不是 0', () => {
  for (const row of b01Run.snapshots) {
    if (row.villageCount > 0) {
      assert.ok(Math.abs(row.foodEmptyShare - row.foodEmptyCount / row.villageCount) < 1e-9,
        `第 ${row.year} 年 foodEmptyShare 对不上：${row.foodEmptyShare}`);
    } else {
      assert.equal(row.foodEmptyShare, null, `第 ${row.year} 年无聚落时应为 null`);
    }
    assert.ok(row.foodEmptyCount >= 0 && row.foodEmptyPopulation >= 0);
  }
});

check('粮食：受影响人口不超过世界总人口（口径不越界）', () => {
  for (const row of b01Run.snapshots) {
    assert.ok(row.foodEmptyPopulation <= row.popTotal + 1e-9,
      `第 ${row.year} 年 foodEmptyPopulation=${row.foodEmptyPopulation} > popTotal=${row.popTotal}`);
  }
});

check('遥测账本单调不减，且**真的被数到了**（非零 ⇒ 计数器确实接上了）', () => {
  for (const key of ['popBirthsCum', 'popAwakensCum', 'soulPoolEvictedCum', 'lifeRngDrawsCum']) {
    const series = b01Run.snapshots.map((r) => r[key]);
    assert.ok(series.every((v) => typeof v === 'number' && Number.isFinite(v)),
      `${key} 出现非数值：${JSON.stringify(series.slice(0, 5))}`);
    assert.ok(isNonDecreasing(series), `${key} 不单调：${JSON.stringify(series.slice(0, 6))}`);
  }
  // 这两条是「接上了」的硬证据：一个 12 年的世界不可能 0 出生、0 次随机数抽取。
  // 只有单调性是不够的 —— 一个恒为 0 的计数器也「单调不减」。
  assert.ok(b01Last.popBirthsCum > 0, `popBirthsCum = ${b01Last.popBirthsCum}，出生计数器没接上`);
  assert.ok(b01Last.lifeRngDrawsCum > 0, `lifeRngDrawsCum = ${b01Last.lifeRngDrawsCum}，主随机流计数闭包没接上`);
});

check('telemetry 模块：累加正确 / 未知键当场抛错 / read 返回副本且不创建记录', () => {
  assert.deepEqual(TELEMETRY_KEYS.slice().sort(), ['awakens', 'births', 'soulEvictions']);
  const w = { fake: true };
  assert.deepEqual(readTelemetry(w), { births: 0, awakens: 0, soulEvictions: 0 });
  bumpTelemetry(w, 'births');
  bumpTelemetry(w, 'births', 4);
  assert.equal(readTelemetry(w).births, 5, 'bump 没有累加');
  // 未知键必须**当场抛错**：静默忽略会让「新加了一个 bump 但打错字」变成
  // 一个永远为 0 的计数器——而那看起来完全正常。
  assert.throws(() => bumpTelemetry(w, 'nope'), /未知/);
  // world 为 null / undefined 时不能抛：调用点散落在模拟各处，
  // 有些路径（如无 world 的单元调用）本来就没有 world。
  assert.doesNotThrow(() => bumpTelemetry(null, 'births'));
  assert.doesNotThrow(() => bumpTelemetry(undefined, 'births'));
  // read 必须返回**副本**：否则采集器拿到的对象与内部账本共享引用，
  // 一次不小心的赋值就会写进账本（而账本本该只有 bump 一个写入口）。
  const w2 = {};
  const snapshot = readTelemetry(w2);
  snapshot.births = 999;
  assert.equal(readTelemetry(w2).births, 0, 'readTelemetry 返回的不是副本');
  // read 不创建记录：读一个从未 bump 过的 world，不得把它注册进 WeakMap。
  assert.equal(w2.births, undefined, 'readTelemetry 往 world 上写了东西');
});

check('★ 遥测计数器不进世界状态：bump 之后 world digest 逐字不变', () => {
  // 这是「加计数器不改变世界线」的**结构性**证明，比「跑一遍看指纹一样」更强：
  // 计数存在 world 之外的 WeakMap 里 ⇒ 不进 serializeWorld ⇒ 不改世界键集 ⇒
  // 结构上不可能改变指纹。上面那条 collector purity 测的是「采集不改世界」，
  // 这一条测的是「**记账**不改世界」，两者是不同的路径。
  const lab = createLabWorld({ seed: 4242, preset: 'small', profile: 'natural' });
  const before = worldFingerprint(lab.world).digest;
  bumpTelemetry(lab.world, 'births', 12345);
  bumpTelemetry(lab.world, 'awakens', 7);
  bumpTelemetry(lab.world, 'soulEvictions', 3);
  assert.equal(worldFingerprint(lab.world).digest, before, '遥测计数器污染了世界指纹');
  assert.ok(!('telemetry' in lab.world), 'world 上出现了 telemetry 字段（应当只存在于 WeakMap）');
});

check('★ 主随机流 draw 计数不进世界状态：world-factory 的计数闭包同样不改指纹', () => {
  const a = createLabWorld({ seed: 31337, preset: 'small', profile: 'natural' });
  const b = createLabWorld({ seed: 31337, preset: 'small', profile: 'natural' });
  assert.equal(worldFingerprint(a.world).digest, worldFingerprint(b.world).digest);
  // ⚠️ 不能断言「刚建出来的世界 draw 数为 0」——**建世界本身就要抽签**
  //    （撒聚落、铺植被、放灵脉都要随机点）。实测 small 预设是 4 次。
  //    这里只钉住「它是个确定的数」：同 seed 两次建世界，抽取次数必须相同。
  //    若哪天世界生成改了抽取顺序，这一条会跟着变——那正是我们想知道的。
  assert.equal(typeof a.lifeRngDraws, 'number');
  assert.ok(a.lifeRngDraws >= 0);
  assert.equal(a.lifeRngDraws, b.lifeRngDraws,
    `同 seed 两次建世界抽了不同次数的主随机流：${a.lifeRngDraws} vs ${b.lifeRngDraws}`);
});

// ══════════════════════════════════════════════════════════════════
section('B0.1 §3/§5 · 诊断拆分与降级');
// ══════════════════════════════════════════════════════════════════

/** 造一串只带指定列的假快照（诊断是纯函数，不需要真跑世界）。 */
function fakeSnapshots(n, fields) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const row = { day: i * 360, year: i };
    for (const [k, fn] of Object.entries(fields)) row[k] = typeof fn === 'function' ? fn(i) : fn;
    out.push(row);
  }
  return out;
}

check('诊断拆分：popTotal 平台 + popCivil 下跌 ⇒ 只报 entity_plateau', () => {
  // 这正是拆分存在的理由：兽群补上了人的缺口。
  // 合成一个码时，「整个世界停住了」与「人在消失、兽在填空」长得一模一样。
  const snapshots = fakeSnapshots(12, {
    popTotal: 1000,
    popCivil: (i) => 800 - i * 20,
    popMortals: (i) => 790 - i * 20,
    popCultivators: 10,
    popWild: (i) => 200 + i * 20,
  });
  const codes = diagnoseSeed({ snapshots, probes: [], seed: 1 }, { viewPolicy: 'closed' })
    .map((d) => d.code);
  assert.ok(codes.includes('entity_plateau'), `应触发 entity_plateau，实际 ${JSON.stringify(codes)}`);
  assert.ok(!codes.includes('civil_plateau'),
    `popCivil 在下跌，不该报 civil_plateau，实际 ${JSON.stringify(codes)}`);
  assert.ok(!codes.includes('population_plateau'), '旧的 population_plateau 码仍在产出');
});

check('诊断拆分：popTotal 上涨 + popCivil 平台 ⇒ 只报 civil_plateau', () => {
  const snapshots = fakeSnapshots(12, {
    popTotal: (i) => 500 + i * 50,
    popCivil: 500,
    popMortals: 480,
    popCultivators: 20,
    popWild: (i) => i * 50,
  });
  const codes = diagnoseSeed({ snapshots, probes: [], seed: 1 }, { viewPolicy: 'closed' })
    .map((d) => d.code);
  assert.ok(codes.includes('civil_plateau'), `应触发 civil_plateau，实际 ${JSON.stringify(codes)}`);
  assert.ok(!codes.includes('entity_plateau'),
    `popTotal 在上涨，不该报 entity_plateau，实际 ${JSON.stringify(codes)}`);
});

check('granary_empty 已降级为 info，且带上规模证据、显式声明**不断言饥荒**', () => {
  const probes = [];
  for (let i = 0; i < 10; i += 1) {
    probes.push({
      day: i * 30, year: 0,
      foodEmptyCount: i === 5 ? 3 : 0,
      foodEmptyShare: i === 5 ? 0.3 : 0,
      foodEmptyPopulation: i === 5 ? 42 : 0,
      foodMin: 0, popTotal: 100,
    });
  }
  const e = diagnoseSeed({ snapshots: [], probes, seed: 1 }, { viewPolicy: 'closed' })
    .find((d) => d.code === 'granary_empty');
  assert.ok(e, 'granary_empty 未触发');
  assert.equal(e.severity, 'info', 'granary_empty 应已从 warning 降级为 info');
  assert.equal(e.evidence.maxAffectedPopulation, 42, '缺「受影响人口」证据');
  assert.equal(e.evidence.maxEmptyShare, 0.3, '缺「受影响份额」证据');
  assert.equal(e.evidence.maxEmptyVillages, 3);
  assert.ok(typeof e.evidence.notClaimed === 'string' && e.evidence.notClaimed.includes('不'),
    'evidence 必须显式声明「本诊断不断言饥荒」');
});

check('停滞流检测纳入了新的账本（births / awakens / rngDraws 都能被判为停滞）', () => {
  // 前 6 个点涨、后 6 个点完全不动 ⇒ 「曾经动过、后段停了」。
  const snapshots = fakeSnapshots(12, {
    popBirthsCum: (i) => Math.min(i, 5) * 10,
    popTotal: 100,
    popCivil: 90,
    popMortals: 80,
    popCultivators: 10,
    popWild: 10,
  });
  const codes = diagnoseSeed({ snapshots, probes: [], seed: 1 }, { viewPolicy: 'closed' })
    .filter((d) => d.code === 'stalled_flow')
    .map((d) => d.metric);
  assert.ok(codes.includes('popBirthsCum'),
    `births 停滞未被报出（实际 ${JSON.stringify(codes)}）—— 那正是「平台是贴顶还是卡死」的关键判据`);
});

// ══════════════════════════════════════════════════════════════════
section('B0.1 §8/§9 · Job 契约收紧与溯源');
// ══════════════════════════════════════════════════════════════════

check('years 必须是**正整数**：小数被拒绝，不再静默四舍五入', () => {
  const bad = validateJob({ ...goodJob, years: 3.7 });
  assert.equal(bad.ok, false, 'years=3.7 被静默接受了 —— 旧版会把它跑成 4 年');
  assert.ok(bad.errors.some((e) => e.includes('years')), JSON.stringify(bad.errors));
  assert.equal(validateJob({ ...goodJob, years: 4 }).ok, true);
  assert.equal(validateJob({ ...goodJob, years: 0 }).ok, false);
  assert.equal(validateJob({ ...goodJob, years: -5 }).ok, false);
  // 字符串形式的数字也必须被拒（CLI 传进来的就是字符串）
  assert.equal(validateJob(jobFromArgs({ years: '3.7' }, goodJob)).ok, false);
  assert.equal(validateJob(jobFromArgs({ years: '300' }, goodJob)).ok, true);
});

check('worker 契约：必须**恰好一个** seed，且必须是布尔值', () => {
  const multi = validateJob({ ...goodJob, seeds: [1, 2], worker: true });
  assert.equal(multi.ok, false, 'worker:true 配多个 seed 被放过了 —— 并行 worker 会互相覆盖顶层产物');
  assert.ok(multi.errors.some((e) => e.includes('worker')), JSON.stringify(multi.errors));
  assert.equal(validateJob({ ...goodJob, seeds: [7], worker: true }).config.worker, true);
  assert.equal(validateJob({ ...goodJob, worker: 'yes' }).ok, false, '--worker=yes 被静默当成布尔了');
  assert.equal(validateJob({ ...goodJob, worker: false }).config.worker, false);
  assert.equal(validateJob(goodJob).config.worker, false, 'worker 缺省应为 false');
});

check('runner 不再有 Math.round 兜底：非整数 years 直接在跑之前抛错', () => {
  assert.throws(
    () => runSeed({ ...purityBase, years: 3.7 }, 31337),
    /years 必须是正整数/,
    'runner 仍然接受小数 years —— 静默兜底还在',
  );
});

check('sourceRevision：revision 与 source 同生同灭（取不到就如实记 unavailable）', () => {
  const r = sourceRevision();
  assert.ok('revision' in r && 'source' in r, 'sourceRevision 必须返回 {revision, source}');
  assert.equal(r.revision === null, r.source === null,
    'revision 与 source 必须同时有值或同时为 null（半有值 = 说不清来源）');
});

check('manifest 记录了 sourceRevision 与它的来源（云环境也答得出「哪版代码」）', () => {
  const m = buildManifest({ ...defaultJob(), collect: true, outputRoot: 'x', failFast: false });
  for (const k of ['sourceRevision', 'sourceRevisionSource', 'sourceRevisionAvailable', 'worker']) {
    assert.ok(k in m, `manifest 缺字段「${k}」`);
  }
  assert.equal(m.sourceRevision === null, m.sourceRevisionSource === null);
  assert.equal(m.sourceRevisionAvailable, m.sourceRevision !== null);
});

// ══════════════════════════════════════════════════════════════════
section('B0.1 §10 · 云实验契约（worker 只写自己那间房 / 聚合 ≡ 单进程）');
// ══════════════════════════════════════════════════════════════════

check('worker 模式**一个字节都不碰顶层**（这是防并行覆盖的结构性保证）', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-worker-'));
  try {
    const cfg = {
      ...purityBase, years: 2, experiment: 'w', seeds: [31337],
      outputRoot: tmp, worker: true,
    };
    const rep = createReporter(cfg, { overwrite: true, diagnose: diagnoseSeed });
    rep.begin();
    rep.record(runSeedSafely(cfg, 31337));
    rep.finish({});

    const top = path.join(tmp, 'w');
    const topFiles = fs.readdirSync(top);
    assert.deepEqual(topFiles, ['seeds'],
      `worker 往顶层写了东西：${JSON.stringify(topFiles)}（并行 worker 会互相覆盖，且不报错）`);
    // seed 目录里该有的都在
    const sDir = path.join(top, 'seeds', '31337');
    for (const f of ['timeseries.csv', 'probes.csv', 'summary.json', 'diagnostics.json', 'fingerprint.json', 'manifest.json', 'runtime.json']) {
      assert.ok(fs.existsSync(path.join(sDir, f)), `worker 缺产物 ${f}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

check('★ 聚合产物与单进程产物**逐 byte 相同**（聚合契约的全部价值所在）', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-agg-'));
  try {
    const seeds = [31337, 4242];
    const base = { ...purityBase, years: 3, seeds, experiment: 'agg' };

    // ── A. 单进程跑完 ────────────────────────────────────────────
    const singleRoot = path.join(tmp, 'single');
    const singleCfg = { ...base, worker: false, outputRoot: singleRoot };
    const singleRep = createReporter(singleCfg, { overwrite: true, diagnose: diagnoseSeed });
    singleRep.begin();
    for (const seed of seeds) singleRep.record(runSeedSafely(singleCfg, seed));
    singleRep.finish({});

    // ── B. worker × N，再聚合 ────────────────────────────────────
    const workerRoot = path.join(tmp, 'worker');
    for (const seed of seeds) {
      const wCfg = { ...base, seeds: [seed], worker: true, outputRoot: workerRoot };
      const wRep = createReporter(wCfg, { overwrite: true, diagnose: diagnoseSeed });
      wRep.begin();
      wRep.record(runSeedSafely(wCfg, seed));
      wRep.finish({});
    }
    const aggCfg = { ...base, worker: false, outputRoot: workerRoot };
    const agg = aggregate(aggCfg, { overwrite: true });
    assert.deepEqual(agg.missing, [], `聚合缺少 seed 目录：${JSON.stringify(agg.missing)}`);
    assert.deepEqual(agg.seeds, seeds, '聚合的 seed 顺序与 Job 不一致（顺序错 ⇒ CSV 行序错）');

    // ── C. 逐 byte 比对核心产物（runtime.json 含墙钟，刻意不比）────
    for (const f of ['timeseries.csv', 'probes.csv', 'diagnostics.json', 'summary.json', 'manifest.json']) {
      const a = fs.readFileSync(path.join(singleRoot, 'agg', f), 'utf8');
      const b = fs.readFileSync(path.join(workerRoot, 'agg', f), 'utf8');
      assert.equal(b, a, `${f}：聚合结果与单进程结果不一致 —— 那它就不是「同一份实验」`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

check('聚合的顺序由 Job 决定、不由文件系统决定（字典序会把 7 排到 20260914 后面）', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-agg-order-'));
  try {
    const seeds = [7, 20260914];
    const base = { ...purityBase, years: 2, seeds, experiment: 'ord' };
    const root = path.join(tmp, 'w');
    for (const seed of seeds) {
      const wCfg = { ...base, seeds: [seed], worker: true, outputRoot: root };
      const wRep = createReporter(wCfg, { overwrite: true, diagnose: diagnoseSeed });
      wRep.begin();
      wRep.record(runSeedSafely(wCfg, seed));
      wRep.finish({});
    }
    const agg = aggregate({ ...base, worker: false, outputRoot: root }, { overwrite: true });
    assert.deepEqual(agg.seeds, [7, 20260914], '聚合顺序被文件系统改了');
    // CSV 的 seed 列必须按 Job 顺序出现。
    // ⚠️ 不能拿「第 2 行数据」当第二个 seed —— 每个 seed 会产出**多行**
    //    （第 0 / 1 / 2 年各一行），所以要看的是 seed 列的**去重顺序**。
    const lines = fs.readFileSync(path.join(root, 'ord', 'timeseries.csv'), 'utf8').split('\n');
    const seedOrder = [];
    for (let i = 1; i < lines.length; i += 1) {
      if (!lines[i]) continue;
      const s = Number(lines[i].split(',')[0]);
      if (seedOrder[seedOrder.length - 1] !== s) seedOrder.push(s);
    }
    assert.deepEqual(seedOrder, [7, 20260914],
      `CSV 里的 seed 顺序是 ${JSON.stringify(seedOrder)} —— 字典序会把 7 排到 20260914 后面`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ══════════════════════════════════════════════════════════════════
section('B1 §0.3 / §6.1 · 世界生成版本与地理类型（v1 / v2 · standard / mountains / wetlands）');
// ══════════════════════════════════════════════════════════════════
//
// 这一段守的是 B1-0 最贵的一条口径：**v1 与 v2、以及三种地理类型，
// 生成的是不同的地图**。若参数没有被透传（工厂悄悄用了默认值），
// 一份「群山世界」的实验会按「标准世界」跑完，而报告上印着 terrain=mountains。
// 所以这里不测「字段有没有写进 Job」，而是测**世界本身有没有变**。

check('三种地理预设生成**三张不同的地图**（同一 seed）', () => {
  const digs = new Map();
  for (const terrain of ['standard', 'mountains', 'wetlands']) {
    const lab = createLabWorld({
      seed: 31337, preset: 'small', profile: 'natural',
      generationVersion: 2, terrainPreset: terrain,
    });
    digs.set(terrain, worldFingerprint(lab.world).digest);
  }
  const values = [...digs.values()];
  assert.equal(new Set(values).size, 3,
    `三张地图的 digest 有重复 —— 说明 terrainPreset 没有真的进生成：${JSON.stringify(Object.fromEntries(digs))}`);
});

check('★ 地形是**形态主导变量**：跨地形差异 ≫ 同地形内的 seed 噪声（配对设计的前提）', () => {
  // ⚠️ 这条守的不是「参数生效」（上一条已守），而是**配对实验是否成立**。
  //    B1-2 的做法是「同 seed 跨地形比」。这个做法的前提是：
  //      地形带来的差异 > 种子带来的差异。
  //    如果两者量级相当，那么「同 seed 比地形」读到的差异里，
  //    seed 噪声占了大头，结论就不可信（换一个 seed 可能翻盘）。
  //
  // 判据用**陆地占比**（landShare）——它是地形预设 `waterTarget` 的直接体现，
  //    且不依赖任何模拟推进（建世界即可读出）。
  //    纪律：不硬编码期望的 landShare 数值，只断言**两个跨度的比值**。
  const landShare = (world) => {
    const w = world.w, h = world.h, water = world.water;
    let land = 0;
    for (let i = 0; i < w * h; i += 1) if (!water[i]) land += 1;
    return land / (w * h);
  };
  const terrains = ['standard', 'mountains', 'wetlands'];
  const seeds = [20260914, 7, 424242];

  // 同地形内、跨 seed 的跨度
  const within = terrains.map((terrain) => {
    const vals = seeds.map((seed) => landShare(createLabWorld({
      seed, preset: 'medium', profile: 'natural',
      generationVersion: 2, terrainPreset: terrain,
    }).world));
    return Math.max(...vals) - Math.min(...vals);
  });
  // 跨地形、同 seed 平均的跨度
  const terrMeans = terrains.map((terrain) => {
    const vals = seeds.map((seed) => landShare(createLabWorld({
      seed, preset: 'medium', profile: 'natural',
      generationVersion: 2, terrainPreset: terrain,
    }).world));
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  const between = Math.max(...terrMeans) - Math.min(...terrMeans);
  const maxWithin = Math.max(...within);

  // 要求跨地形差异至少是同地形 seed 噪声的 10 倍。
  assert.ok(between > maxWithin * 10,
    `地形差异(${between.toFixed(4)}) 未显著大于 seed 噪声(${maxWithin.toFixed(4)}) —— `
    + '「同 seed 跨地形比对」的前提不成立：地形可能没进生成，或种子被错误地混进了地形派生');
});

check('v1 与 v2 生成**不同的地图**（同一 seed + standard）', () => {
  const v1 = createLabWorld({
    seed: 31337, preset: 'small', profile: 'natural',
    generationVersion: 1, terrainPreset: 'standard',
  });
  const v2 = createLabWorld({
    seed: 31337, preset: 'small', profile: 'natural',
    generationVersion: 2, terrainPreset: 'standard',
  });
  assert.notEqual(worldFingerprint(v1.world).digest, worldFingerprint(v2.world).digest,
    'v1 与 v2 的 digest 相同 —— 生成版本参数没有生效');
  // v1 的世界**不该**有 generation 块（`worldgen.js:429` 只对 v2 建）。
  assert.equal(v1.world.generation, undefined, 'v1 世界不该有 world.generation');
  assert.equal(v2.world.generation?.version, 2);
});

check('工厂回报的 appliedVersion / appliedTerrain **读自世界状态**，不是回显入参', () => {
  const lab = createLabWorld({
    seed: 31337, preset: 'small', profile: 'natural',
    generationVersion: 2, terrainPreset: 'mountains',
  });
  assert.equal(lab.generation.requestedVersion, 2);
  assert.equal(lab.generation.requestedTerrain, 'mountains');
  // applied 必须与世界的实况一致（这是「参数有没有真的生效」的唯一可信来源）
  assert.equal(lab.generation.appliedVersion, lab.world.generation?.version);
  assert.equal(lab.generation.appliedTerrain, lab.world.generation?.terrainPreset);
  assert.equal(lab.generation.appliedTerrain, 'mountains');
});

check('★ progressive 是**视觉/访问变量**：加不加它，模拟读出的 CSV 逐 byte 相同', () => {
  // ⚠️ 这条非常重要，它把「视觉变量」与「模拟变量」的边界钉死。
  //    `mapProgress` 会进 `serializeWorld`（所以 digest 会变），且**自 G2 起
  //    它由游戏日驱动解锁**（`advanceWorld` 收尾调 `updateMapProgress`，
  //    1/3/6 年各开一阶）。因此：
  //     · 判据**不能**用 digest（会变，这是正常版本变化，见 B2_BASELINE_AUDIT §4.1）；
  //     · 判据**不能**用「跑完之后 stage 仍是 0」（那是 B1 语义）；
  //     · 唯一有效的判据是**模拟读数 CSV**：mapProgress 不进任何模拟状态。
  const mk = (progressive) => {
    const lab = createLabWorld({
      seed: 20260914, preset: 'small', profile: 'natural',
      generationVersion: 2, terrainPreset: 'standard', progressive,
    });
    const stageAtBirth = lab.world.mapProgress ? lab.world.mapProgress.stage : null;
    const snaps = [];
    for (let y = 0; y < 2; y += 1) {
      for (let d = 0; d < 360; d += 3) {
        advanceWorld(lab.world, 3, {
          life: lab.life, upperLife: lab.upperLife,
          rng: lab.ecoRng, state: lab.advanceState, riftActive: false,
        });
      }
      snaps.push(collectSnapshot(lab));
    }
    return { csv: toCsv(SNAPSHOT_COLUMNS, snaps), mapProgress: lab.world.mapProgress, stageAtBirth };
  };
  const off = mk(false);
  const on = mk(true);
  assert.equal(off.csv, on.csv,
    'progressive 改变了模拟输出 —— 它被误当成了模拟变量');
  assert.equal(off.mapProgress, undefined, 'progressive=false 时不该有 mapProgress');
  assert.equal(on.stageAtBirth, 0, 'progressive=true 时建出时应为 stage 0');
  // G2 新语义：游戏日推进会解锁 stage（1 年一阶）。第 720 日 ⇒ UNLOCK_DAYS
  // [360,1080,2160] 命中的数量 = 1。这条断言同时钉住「解锁确实发生了」。
  assert.equal(on.mapProgress?.stage, 1,
    'G2 起 mapProgress 应由游戏日驱动解锁（720 日后期望 stage 1）');
});

check('configSignature 计入 generationVersion / terrainPreset（防跨代静默覆盖）', () => {
  const base = defaultJob();
  const a = configSignature({ ...base });
  const b = configSignature({ ...base, terrainPreset: 'mountains' });
  const c = configSignature({ ...base, generationVersion: 1 });
  assert.notEqual(a, b, 'terrainPreset 没进签名 —— 群山实验会静默覆盖标准基线');
  assert.notEqual(a, c, 'generationVersion 没进签名 —— 新旧地形会互相覆盖');
  // progressive 进签名会造成「换个开放进度就被判定为不同实验」，也一并钉住。
  assert.equal(a, configSignature({ ...base, progressive: true }),
    'progressive 不该进签名：它是纯视觉变量');
});

check('Job 校验：generationVersion / terrainPreset 必填，且 v1 只能配 standard', () => {
  const good = defaultJob();
  assert.equal(validateJob({ ...good, generationVersion: undefined }).ok, false, '缺 generationVersion 应报错');
  assert.equal(validateJob({ ...good, terrainPreset: undefined }).ok, false, '缺 terrainPreset 应报错');
  assert.equal(validateJob({ ...good, generationVersion: 3 }).ok, false, '非法版本应报错');
  assert.equal(validateJob({ ...good, generationVersion: 1, terrainPreset: 'mountains' }).ok, false,
    'v1 + 非 standard 应报错（v1 不读地理类型）');
  assert.equal(validateJob({ ...good, generationVersion: 1, terrainPreset: 'standard' }).ok, true);
  assert.equal(validateJob({ ...good, generationVersion: 2, terrainPreset: 'wetlands' }).ok, true);
  assert.equal(validateJob({ ...good, progressive: 'maybe' }).ok, false, 'progressive=maybe 被静默当真值了');
  assert.equal(validateJob({ ...good, experimentGroup: '  ' }).ok, false, '空 experimentGroup 应报错');
});

check('CLI：--generationVersion / --terrainPreset / --progressive 不做静默兜底', () => {
  const good = defaultJob();
  const badGen = validateJob(jobFromArgs({ generationVersion: 'two' }, good));
  assert.equal(badGen.ok, false, '--generationVersion=two 被静默吞掉了');
  const badTerrain = validateJob(jobFromArgs({ terrainPreset: 'desert' }, good));
  assert.equal(badTerrain.ok, false);
  const okArgs = validateJob(jobFromArgs(
    { generationVersion: '2', terrain: 'mountains', progressive: 'true' }, good,
  ));
  assert.equal(okArgs.ok, true, JSON.stringify(okArgs.errors));
  assert.equal(okArgs.config.generationVersion, 2);
  assert.equal(okArgs.config.terrainPreset, 'mountains');
  assert.equal(okArgs.config.progressive, true);
});

check('世界生成元数据进 manifest 与 summary（两份 CSV 可比性的前提）', () => {
  const cfg = validateJob({ ...defaultJob(), generationVersion: 2, terrainPreset: 'wetlands' }).config;
  const m = buildManifest(cfg, {});
  assert.equal(m.generationVersion, 2);
  assert.equal(m.terrainPreset, 'wetlands');
  assert.equal(m.progressive, false);
  const s = buildSummary(cfg, [], [], []);
  assert.equal(s.config.generationVersion, 2);
  assert.equal(s.config.terrainPreset, 'wetlands');
});

check('runner 把生成元数据透传到工厂（terrainPreset 不被吃掉）', () => {
  // 用 runSeed 真跑一年，然后核验回来的 generation.appliedTerrain。
  const cfg = validateJob({
    ...defaultJob(), seeds: [4242], years: 1, stepDays: 3,
    snapshotDays: 360, probeDays: 30, preset: 'small',
    generationVersion: 2, terrainPreset: 'mountains',
  }).config;
  const result = runSeed(cfg, 4242);
  assert.equal(result.generation.requestedTerrain, 'mountains');
  assert.equal(result.generation.appliedTerrain, 'mountains',
    'runner → 工厂这一层把 terrainPreset 吃掉了');
});

// ══════════════════════════════════════════════════════════════════
section('B1 §0.4 · 模拟等价证明（实验路径 ≡ 产品初始化路径）');
// ══════════════════════════════════════════════════════════════════
//
// 这一段是 B1-0 的**硬门禁**：后续所有长期数值结论都建立在
// 「实验跑的是产品那个世界」之上。若两条路径不同，B1-1 到 B1-5
// 量到的全是另一个世界的数——而且看起来完全正常（两份报告都自洽）。
//
// ⚠️ 判据用 `mortalDigest`（`serializeWorld` → sha256），**不是**手写字段清单。
//    理由见 `digest.mjs` 的头注释：手写清单会漏掉 `souls` / `soulLog` /
//    `worldEventState` 这些「最可能被污染」的字段。

check('源码证据：本文件复刻的常量与当前 main.js / worldCreation.js 逐字一致', () => {
  // ⚠️ 这条守的是「复刻有没有跟着源码漂」。`equivalence.mjs` 用的是
  //    `0xa5a5a5a5` 与 `12345`，而产品的值写在 `main.js` 里。
  //    若哪天产品改了种子派生，而实验侧没跟，等价证明就会「证明」一个
  //    **已经不存在的产品**——所以必须把源码文本取出来核对。
  // ⚠️ `productPathSourceEvidence` 是 async（它内部用动态 import 读文件），
  //    而 `check()` 是同步的。这里改用同步读文件 + 同样的正则核对常量——
  //    断言的**内容**完全相同，只是不能让 await 漏进 check()。
  const main = fs.readFileSync(path.join(REPO_ROOT, 'src', 'inkbox', 'main.js'), 'utf8');
  const creation = fs.readFileSync(path.join(REPO_ROOT, 'src', 'inkbox', 'ui', 'worldCreation.js'), 'utf8');
  const lifeLine = main.match(/new Life\(this\.world, mulberry32\([^)]*\)\)/);
  const rngLine = main.match(/this\.rng = mulberry32\((\d+)\)/);
  const genLine = creation.match(/const generationVersion = [^;]*?:\s*(\d+)\s*\)\s*;/);
  const terrainLine = creation.match(/\?\?\s*'([a-z]+)'\s*;/);
  assert.ok(lifeLine, 'main.js 里找不到 Life 的建流行 —— 复刻点漂了');
  assert.equal(Number(lifeLine[0].match(/0x[0-9a-fA-F]+/)[0]), 0xa5a5a5a5,
    'main.js 的 life 派生键变了（equivalence.mjs 用的是旧值）');
  assert.equal(Number(rngLine[1]), 12345, 'main.js 的生态流种子变了');
  assert.equal(Number(genLine[1]), 2, 'worldCreation 的缺省 generationVersion 变了');
  assert.equal(terrainLine[1], 'standard', 'worldCreation 的缺省 terrainPreset 变了');
});

check('建世界阶段等价：product ≡ lab（digest / 键集 / 三界装配 / generation）', () => {
  const specs = [
    { seed: 20260914, preset: 'medium' },
    { seed: 7, preset: 'small' },
    { seed: 424242, preset: 'medium', terrainPreset: 'mountains' },
    { seed: 20261008, preset: 'small', generationVersion: 1 },
  ];
  for (const spec of specs) {
    const c = compareWorldConstruction(spec);
    const tag = `seed=${spec.seed} preset=${spec.preset}${spec.terrainPreset ? `/${spec.terrainPreset}` : ''}${spec.generationVersion ? `/v${spec.generationVersion}` : ''}`;
    assert.equal(c.mortal.same, true, `${tag}: 初始 World digest 不同`);
    assert.equal(c.keySet.same, true,
      `${tag}: 世界键集不同（缺 ${JSON.stringify(c.keySet.missingInLab)} / 多 ${JSON.stringify(c.keySet.extraInLab)}）`);
    assert.equal(c.wiring.same, true, `${tag}: 三界装配不同`);
    assert.equal(c.generation.same, true, `${tag}: world.generation 不同`);
  }
});

check('★ 分层等价：同 seed 各自跑 0/30/360/1080 游戏日，逐层 digest 相同', () => {
  const s = compareSteppedWorlds({ seed: 20260914, preset: 'medium' }, [0, 30, 360, 1080], 3);
  for (const m of s.marks) {
    assert.equal(m.same, true, `${m.label}（第 ${m.day} 日）：两条世界线的 digest 不同`);
  }
  assert.equal(s.allSame, true);
  assert.equal(s.finalWiring.same, true, '长时间推进后三界装配也不该分叉');
});

// ══════════════════════════════════════════════════════════════════
section('B1-1 §5.1 · soul_pool_saturation 诊断（魂池贴顶 + 持续驱逐）');
// ══════════════════════════════════════════════════════════════════
//
// 这一段守的是 B1-1 发现的那个**「有明确事实、却无诊断码」**的缺口。
// 判据的关键是**两个读数合读**：只贴顶不算饱和（可能恰好稳定在满员），
// 必须「贴顶 且 驱逐仍在涨」。

/** 造一串合成快照，只填本诊断关心的两个字段。 */
function syntheticSnapshots(soulPoolSeries, evictSeries) {
  return soulPoolSeries.map((pool, i) => ({
    seed: 1, day: i * 360, year: i,
    soulPool: pool,
    soulPoolEvictedCum: evictSeries[i],
  }));
}

check('soul_pool_saturation：贴顶 + 驱逐仍在涨 ⇒ 触发 warning', () => {
  const n = 12;
  const pool = Array.from({ length: n }, () => 120);          // 一直满
  const evict = Array.from({ length: n }, (_, i) => i * 400); // 一直涨
  const hits = diagnoseSeed({ snapshots: syntheticSnapshots(pool, evict), probes: [], seed: 1 }, { viewPolicy: 'closed' })
    .filter((d) => d.code === 'soul_pool_saturation');
  assert.equal(hits.length, 1, '贴顶 + 持续驱逐应触发恰好一条');
  assert.equal(hits[0].severity, 'warning');
  assert.equal(hits[0].evidence.observedCap, 120);
  assert.ok(hits[0].evidence.evictionGrowthInWindow > 0);
});

check('soul_pool_saturation：贴顶但驱逐停滞 ⇒ **不**触发（稳定满员不是饱和）', () => {
  const n = 12;
  const pool = Array.from({ length: n }, () => 120);
  // 驱逐在前半段涨、后 1/3 完全不动 ⇒ 「有进有出、恰好稳定」，不是饱和。
  const evict = Array.from({ length: n }, (_, i) => Math.min(i, n - 4) * 400);
  const hits = diagnoseSeed({ snapshots: syntheticSnapshots(pool, evict), probes: [], seed: 1 }, { viewPolicy: 'closed' })
    .filter((d) => d.code === 'soul_pool_saturation');
  assert.equal(hits.length, 0,
    '后段驱逐不再增长时不该报饱和 —— 否则「稳定满员」与「持续丢弃」会再次同形');
});

check('soul_pool_saturation：魂池恒为 0（无通道）⇒ 不触发', () => {
  const n = 12;
  const pool = Array.from({ length: n }, () => 0);
  const evict = Array.from({ length: n }, () => 0);
  const hits = diagnoseSeed({ snapshots: syntheticSnapshots(pool, evict), probes: [], seed: 1 }, { viewPolicy: 'closed' })
    .filter((d) => d.code === 'soul_pool_saturation');
  assert.equal(hits.length, 0, '魂池从没转过世不该报饱和（那归 cross_realm_flow_absent）');
});

check('★ soul_pool_saturation 的观测上限取自数据，不是硬编码 120', () => {
  // 换一个上限（比如未来 SOUL_CAP 改成 300）：诊断应自动跟着走。
  const n = 12;
  const pool = Array.from({ length: n }, () => 300);
  const evict = Array.from({ length: n }, (_, i) => i * 500);
  const hits = diagnoseSeed({ snapshots: syntheticSnapshots(pool, evict), probes: [], seed: 1 }, { viewPolicy: 'closed' })
    .filter((d) => d.code === 'soul_pool_saturation');
  assert.equal(hits.length, 1, '上限改成 300 后仍应触发（证明它读的是观测值）');
  assert.equal(hits[0].evidence.observedCap, 300, '观测上限应跟随数据，而不是写死 120');
});

// ══════════════════════════════════════════════════════════════════
//
// B1-3 · 受控干预（intervention profile + Job 字段）
//
// 这一段守委托书 §B1-7(D) 的不变量：**因果干预有效** ——
// 干预组与对照组必须「只差干预本身」，且干预必须真的生效。
// 若干预被静默忽略，会得到一份「看起来做了实验、实际什么都没做」的报告。

console.log('\n' + '─'.repeat(64));
console.log('B1-3 §B1-7(D) · 受控干预（Control/Treatment 配对）');
console.log('─'.repeat(64));

check('intervention：Job 校验拦截非法形状（跑之前就响）', () => {
  const good = { ...defaultJob(), profile: 'intervention', viewPolicy: 'closed' };
  // 非对象
  assert.equal(validateJob({ ...good, intervention: 'extra-population' }).ok, false,
    'intervention 为字符串应报错');
  // 未知 kind
  assert.equal(validateJob({ ...good, intervention: { kind: 'nuke' } }).ok, false,
    '未知 kind 应报错');
  // 缺参数
  assert.equal(validateJob({ ...good, intervention: { kind: 'extra-population', groups: 5 } }).ok, false,
    'extra-population 缺 count/margin/rngSeed 应报错');
  // 负数参数
  assert.equal(validateJob({ ...good, intervention: { kind: 'extra-population', rngSeed: 1, groups: -1, count: 30, margin: 20 } }).ok, false,
    '负数 groups 应报错');
  // 未知字段
  assert.equal(validateJob({ ...good, intervention: { kind: 'extra-population', rngSeed: 1, groups: 5, count: 30, margin: 20, boom: 1 } }).ok, false,
    '未知字段应报错');
  // kind=none 带参数
  assert.equal(validateJob({ ...good, intervention: { kind: 'none', groups: 5 } }).ok, false,
    'kind=none 携带其他字段应报错');
  // 合法
  assert.equal(validateJob({ ...good, intervention: { kind: 'extra-population', rngSeed: 777, groups: 5, count: 30, margin: 20 } }).ok, true);
  assert.equal(validateJob({ ...good, intervention: { kind: 'none' } }).ok, true);
});

check('intervention：非 none 干预必须配 profile=intervention（否则静默忽略）', () => {
  const nat = { ...defaultJob(), profile: 'natural', viewPolicy: 'closed',
    intervention: { kind: 'extra-population', rngSeed: 777, groups: 5, count: 30, margin: 20 } };
  assert.equal(validateJob(nat).ok, false,
    'natural + 非 none 干预 必须报错——否则干预被静默忽略而报告上写着做了实验');
  // 显式 none 在 natural 下是允许的（等价于无干预，用于自检对齐）
  const natNone = { ...defaultJob(), profile: 'natural', viewPolicy: 'closed', intervention: { kind: 'none' } };
  assert.equal(validateJob(natNone).ok, true, 'kind=none 在任何 profile 下都应合法');
});

check('intervention：CLI --intervention 解析 JSON，非法输入不做静默兜底', () => {
  const good = { ...defaultJob(), profile: 'intervention', viewPolicy: 'closed' };
  const parsed = jobFromArgs({ intervention: '{"kind":"extra-population","rngSeed":1,"groups":5,"count":30,"margin":20}' }, good);
  assert.equal(validateJob(parsed).ok, true, '合法 JSON 应被解析并通过校验');
  const none = jobFromArgs({ intervention: 'none' }, good);
  assert.deepEqual(none.intervention, { kind: 'none' }, "--intervention=none 应解析为 {kind:'none'}");
  const broken = jobFromArgs({ intervention: '{"kind":' }, good);
  assert.equal(validateJob(broken).ok, false, '坏 JSON 必须报错，不能静默变成 undefined');
});

check('intervention：登记进 JOB_KEYS（未知键检查不会误伤）', () => {
  const good = { ...defaultJob(), profile: 'intervention', viewPolicy: 'closed',
    intervention: { kind: 'extra-population', rngSeed: 777, groups: 5, count: 30, margin: 20 } };
  const r = validateJob(good);
  assert.equal(r.ok, true);
  assert.ok(r.config.intervention && r.config.intervention.kind === 'extra-population',
    'config 应携带干预');
  // 无干预时应为 null（与「显式 none」在 config 里可分）
  const noIv = validateJob({ ...defaultJob(), profile: 'natural', viewPolicy: 'closed' });
  assert.equal(noIv.config.intervention, null, '未写干预时 config.intervention 应为 null');
});

check('★ 干预真的生效：Treatment 的世界 ≠ Control 的世界（同 seed）', () => {
  const mk = (intervention, profile) => createLabWorld({
    seed: 20260914, preset: 'small', profile,
    generationVersion: 2, terrainPreset: 'standard',
    intervention,
  });
  const control = mk(null, 'natural');
  const treat = mk({ kind: 'extra-population', rngSeed: 777, groups: 5, count: 30, margin: 20 }, 'intervention');
  // ⚠️ `generateWorld(scatter:true)` **本身**就会往 pendingSpawns 排队
  //    （初始聚落的人口散布点）。所以判据不是「Control = 0」，
  //    而是「Treatment 恰好比 Control 多注入 groups 个点」——
  //    这同时验证了「注入发生」与「注入量精确」。
  assert.equal(treat.world.pendingSpawns.length - control.world.pendingSpawns.length, 5,
    'Treatment 应恰好比 Control 多 5 个待生成人口点');
  assert.equal(treat.intervention.kind, 'extra-population');
  assert.equal(treat.intervention.injectedSpawns, 5);
  assert.equal(treat.intervention.injectedEntities, 150);
  // 注入的点确实带 30 人（读实况，不是回显）
  const injected = treat.world.pendingSpawns.slice(-5);
  assert.ok(injected.every((p) => p.count === 30), '注入点应各带 30 人');
  // Control 的干预描述必须是 none
  assert.equal(control.intervention.kind, 'none');
});

check('★ 干预不改模拟常量：只碰 pendingSpawns，不碰 height / qi / entities 本体', () => {
  const mk = (intervention, profile) => createLabWorld({
    seed: 20260914, preset: 'small', profile,
    generationVersion: 2, terrainPreset: 'standard', intervention,
  });
  const control = mk(null, 'natural');
  const treat = mk({ kind: 'extra-population', rngSeed: 777, groups: 5, count: 30, margin: 20 }, 'intervention');
  // 地形与初始实体**逐字相同**（干预是「待生成」而非「已生成」——
  // 真正的实体由 life.step 在第一次推进时按 pendingSpawns 生成）。
  assert.deepEqual(treat.world.height, control.world.height, '干预不该改地形 height');
  assert.deepEqual(treat.world.qi, control.world.qi, '干预不该改灵气 qi');
  assert.equal(treat.world.entities.length, control.world.entities.length,
    '干预在注入阶段不该改变已存在实体数（只排队，未生成）');
});

check('★ 零干预（kind=none）⇒ 与 natural 逐字节相同（干预机制本身不扰线）', () => {
  // 这条把「干预机制本身」与「干预内容」分开：机制不应引入任何扰动。
  const mk = (profile, intervention) => createLabWorld({
    seed: 20260914, preset: 'small', profile,
    generationVersion: 2, terrainPreset: 'standard', intervention,
  });
  const natural = mk('natural', null);
  const none = mk('intervention', { kind: 'none' });
  assert.equal(worldFingerprint(natural.world).digest, worldFingerprint(none.world).digest,
    'intervention(kind=none) 与 natural 的建世界 digest 必须相同——机制本身不扰线');
  assert.equal(none.world.pendingSpawns.length, natural.world.pendingSpawns.length,
    '零干预不该改变 pendingSpawns（两边应同为 generateWorld 的初始散布）');
  // 两边的主随机流计数也应一致（干预不抽主随机流）
  assert.equal(none.lifeRngDraws, natural.lifeRngDraws,
    '零干预不该消耗主随机流');
});

check('★ 干预的选点用独立 RNG：不消耗凡间主随机流（与 legacy 同一纪律）', () => {
  const mk = (intervention) => createLabWorld({
    seed: 20260914, preset: 'small', profile: 'intervention',
    generationVersion: 2, terrainPreset: 'standard', intervention,
  });
  const none = mk({ kind: 'none' });
  const treat = mk({ kind: 'extra-population', rngSeed: 777, groups: 5, count: 30, margin: 20 });
  // 注入阶段不应消耗 lifeRng（选点用 mulberry32(777)）。
  assert.equal(treat.lifeRngDraws, none.lifeRngDraws,
    '干预选点必须用独立 RNG，否则会移动世界线，Control/Treatment 不再可比');
});

check('干预进 configSignature（防同一 profile 下不同干预静默覆盖）', () => {
  const base = { ...defaultJob(), profile: 'intervention', viewPolicy: 'closed' };
  const c1 = validateJob({ ...base, intervention: { kind: 'extra-population', rngSeed: 777, groups: 5, count: 30, margin: 20 } }).config;
  const c2 = validateJob({ ...base, intervention: { kind: 'extra-population', rngSeed: 777, groups: 50, count: 30, margin: 20 } }).config;
  assert.notEqual(configSignature(c1), configSignature(c2),
    'groups 5 与 50 是两次不同实验，签名必须不同（否则后者静默覆盖前者）');
  // 字段书写顺序不同但语义相同 ⇒ 签名必须相同
  const c3 = validateJob({ ...base, intervention: { kind: 'extra-population', count: 30, groups: 5, margin: 20, rngSeed: 777 } }).config;
  assert.equal(configSignature(c1), configSignature(c3),
    '语义相同的干预（字段顺序不同）必须得到相同签名');
  // 无干预的 natural 与 none 干预的 intervention 不同 profile ⇒ 天然不同签名
  const nat = validateJob({ ...defaultJob(), profile: 'natural', viewPolicy: 'closed' }).config;
  assert.notEqual(configSignature(nat), configSignature(c1), 'Control 与 Treatment 签名必须不同');
});

check('干预进 manifest 与 summary（机器可读的配对凭据）', () => {
  const cfg = validateJob({
    ...defaultJob(), profile: 'intervention', viewPolicy: 'closed',
    intervention: { kind: 'extra-population', rngSeed: 777, groups: 5, count: 30, margin: 20 },
  }).config;
  const m = buildManifest(cfg);
  assert.equal(m.intervention.kind, 'extra-population');
  const ctrl = validateJob({ ...defaultJob(), profile: 'natural', viewPolicy: 'closed' }).config;
  assert.equal(buildManifest(ctrl).intervention, null, 'Control 的 manifest.intervention 应为 null');
});

// ══════════════════════════════════════════════════════════════════
//
// B1-5 · 可调参数覆盖（sensitivity profile + Job 字段 + tunables 注册表）
//
// 这一段守三条不变量（见 `src/inkbox/sim/tunables.js` 的文件头）：
//   §B1-5(A) 零覆盖 ≡ 默认 —— **逐字节可证明**（跑一遍 300 日世界 digest）。
//   §B1-5(B) 未知键当场抛错 —— 不得静默忽略（忽略会让「跑的不是你要的」查不出来）。
//   §B1-5(C) 作用域隔离 —— 覆盖只在 withTunables 里生效，退出（含抛错）必复原。
// 外加：覆盖必须**真的生效**（改了 POP_SOFT_CAP ⇒ 世界 ≠ 基线），
// 否则整段就是空转判据（本项目最贵的教训之一）。

section('B1-5 §B1-5(A/B/C) · 可调参数覆盖（参数敏感性机制）');

check('tunables：注册表默认值 = 重构前的常量（逐位相同）', () => {
  // 抽样核对几个最关键的默认值——它们必须与重构前的模块级 const 一模一样，
  // 否则「零覆盖 ≡ 默认」这条不变量在起点就是错的。
  assert.equal(tunableDefault('POP_SOFT_CAP'), 1400, 'POP_SOFT_CAP 默认必须是 1400');
  assert.equal(tunableDefault('SOUL_CAP'), 120, 'SOUL_CAP 默认必须是 120');
  assert.equal(tunableDefault('BIRTH_PER_CAPITA_DAY'), 0.00075, 'BIRTH_PER_CAPITA_DAY 默认必须是 7.5e-4');
  assert.equal(tunableDefault('FIELD_YIELD_PER_DAY'), 0.03, 'FIELD_YIELD_PER_DAY 默认必须是 0.03');
  assert.equal(tunableDefault('UPPER_POP_CAP'), 300, 'UPPER_POP_CAP 默认必须是 300');
  assert.equal(tunableDefault('NETHER_SOUL_CAP'), 400, 'NETHER_SOUL_CAP 默认必须是 400');
  // 无覆盖时 tunable() 必须等于 default
  for (const k of TUNABLE_NAMES) {
    assert.equal(tunable(k), tunableDefault(k), `无覆盖时 tunable('${k}') 必须等于默认`);
  }
  assert.equal(tunablesActive(), false, '自检开始时应无活跃覆盖');
});

check('tunables：未知键当场抛错（§B1-5(B)：不静默忽略）', () => {
  assert.throws(() => tunable('POP_SOFTCAP'), /未知可调参数/, '拼错的键必须抛错');
  assert.throws(() => tunable('NOT_A_THING'), /未知可调参数/, '未知键必须抛错');
  assert.throws(() => withTunables({ 拼错的键: 1 }, () => {}), /未知可调参数/, '覆盖表里的未知键必须抛错');
  assert.throws(() => tunableMeta('NOPE'), /未知可调参数/, 'tunableMeta 的未知键必须抛错');
});

check('tunables：覆盖表校验（非数 / 非正 / 整型不符均抛错）', () => {
  assert.throws(() => withTunables({ POP_SOFT_CAP: 'abc' }, () => {}), /有限数/, '字符串值必须抛错');
  assert.throws(() => withTunables({ POP_SOFT_CAP: NaN }, () => {}), /有限数/, 'NaN 必须抛错');
  assert.throws(() => withTunables({ POP_SOFT_CAP: 0 }, () => {}), /必须 > 0/, '0 必须抛错');
  assert.throws(() => withTunables({ POP_SOFT_CAP: -5 }, () => {}), /必须 > 0/, '负数必须抛错');
  assert.throws(() => withTunables({ POP_SOFT_CAP: 1200.5 }, () => {}), /必须是整数/, '整型参数的覆盖值必须也是整数');
  // 非整型参数允许小数
  withTunables({ BIRTH_PER_CAPITA_DAY: 0.0015 }, () => {
    assert.equal(tunable('BIRTH_PER_CAPITA_DAY'), 0.0015);
  });
});

check('tunables：作用域隔离（§B1-5(C)：退出必复原，含抛错）', () => {
  const before = tunable('POP_SOFT_CAP');
  withTunables({ POP_SOFT_CAP: 900 }, () => {
    assert.equal(tunable('POP_SOFT_CAP'), 900, '作用域内应读到覆盖值');
    assert.equal(tunablesActive(), true);
  });
  assert.equal(tunable('POP_SOFT_CAP'), before, '作用域退出后必须复原');
  assert.equal(tunablesActive(), false);
  // 回调抛错也要复原
  assert.throws(() => withTunables({ POP_SOFT_CAP: 900 }, () => { throw new Error('boom'); }));
  assert.equal(tunable('POP_SOFT_CAP'), before, '回调抛错后也必须复原');
  // 嵌套：内层叠加，退出内层回到外层值，退出外层回到默认
  withTunables({ POP_SOFT_CAP: 1000 }, () => {
    withTunables({ SOUL_CAP: 200 }, () => {
      assert.equal(tunable('POP_SOFT_CAP'), 1000, '内层应继承外层覆盖');
      assert.equal(tunable('SOUL_CAP'), 200, '内层应读到自己的覆盖');
    });
    assert.equal(tunable('SOUL_CAP'), tunableDefault('SOUL_CAP'), '退出内层后 SOUL_CAP 应复原');
    assert.equal(tunable('POP_SOFT_CAP'), 1000, '退出内层后外层覆盖应仍在');
  });
  assert.equal(tunable('POP_SOFT_CAP'), before, '退出外层后应复原');
});

check('★ 零覆盖 ≡ 默认：300 日世界 digest 与基线逐字节相同（§B1-5(A)）', () => {
  // 这是 B1-5 最贵的一条：它证明「加了参数覆盖机制」这件事本身**不扰线**。
  // 做法：跑一条 sensitivity(零覆盖) 与一条 natural，比较 300 日后的 digest。
  const mk = (profile, overrides) => {
    const cfg = validateJob({
      ...defaultJob(), experiment: 'selftest-tunables',
      profile, viewPolicy: 'closed', seeds: [20260914], years: 1,
      stepDays: 3, snapshotDays: 360, probeDays: 30,
      ...(overrides ? { parameterOverrides: overrides } : {}),
    }).config;
    return cfg;
  };
  const drive = (cfg) => {
    const lab = createLabWorld({
      seed: 20260914, preset: 'small', profile: cfg.profile,
      generationVersion: 2, terrainPreset: 'standard',
    });
    const { world } = lab;
    for (let d = 0; d < 300; d += 3) {
      advanceWorld(world, 3, {
        life: lab.life, upperLife: lab.upperLife, rng: lab.ecoRng,
        state: lab.advanceState, riftActive: false,
      });
    }
    return worldFingerprint(world);
  };
  const natural = mk('natural', null);
  const zero = mk('sensitivity', {});   // 空覆盖
  const natFp = drive(natural);
  const zeroFp = drive(zero);
  assert.equal(zeroFp.digest, natFp.digest,
    'sensitivity(空覆盖) 与 natural 的 300 日 digest 必须逐字节相同——覆盖机制本身不扰线');
  assert.equal(zeroFp.bytes, natFp.bytes, 'digestBytes 也应相同');
});

check('★ 覆盖真的生效：改了 POP_SOFT_CAP ⇒ 世界 ≠ 基线（非空转判据）', () => {
  const mk = (profile, overrides) => validateJob({
    ...defaultJob(), experiment: 'selftest-tunables',
    profile, viewPolicy: 'closed', seeds: [20260914], years: 1,
    stepDays: 3, snapshotDays: 360, probeDays: 30,
    ...(overrides ? { parameterOverrides: overrides } : {}),
  }).config;
  // ⚠️ 判据必须给参数**足够长的时间去咬合**：`POP_SOFT_CAP` 只在人口接近上限时
  //    才起作用，而世界从 0 人长到 1400 人需要约 60 年。若只跑 3 年（1080 日），
  //    人口还在几百，把上限从 1400 改成 900 **不会**改变轨迹 ⇒ 断言失败。
  //    那不是「覆盖没生效」，而是**测试没给它时间**——本项目已经因为这类
  //    「时间不够 ⇒ 判据空转」吃过亏，所以这里明确用 60 年（21600 日）。
  const drive = (cfg, days) => {
    const lab = createLabWorld({
      seed: 20260914, preset: 'small', profile: cfg.profile,
      generationVersion: 2, terrainPreset: 'standard',
    });
    const { world } = lab;
    const run = () => {
      for (let d = 0; d < days; d += 3) {
        advanceWorld(world, 3, {
          life: lab.life, upperLife: lab.upperLife, rng: lab.ecoRng,
          state: lab.advanceState, riftActive: false,
        });
      }
      return { fp: worldFingerprint(world), pop: world.entities.length };
    };
    return cfg.parameterOverrides
      ? withTunables(cfg.parameterOverrides, run)
      : run();
  };
  const base = mk('sensitivity', {});
  const changed = mk('sensitivity', { POP_SOFT_CAP: 900 });
  const baseRun = drive(base, 21600);
  const changedRun = drive(changed, 21600);
  assert.notEqual(changedRun.fp.digest, baseRun.fp.digest,
    'POP_SOFT_CAP 1400→900 必须改变世界轨迹；若相同说明覆盖根本没进模拟');
  // 更强的判据：低上限的世界，人口应停在 900（而不是 1400）
  assert.ok(changedRun.pop <= 900,
    `POP_SOFT_CAP=900 时人口应 ≤ 900，实际 ${changedRun.pop}（证明上限真的被读到）`);
  assert.ok(changedRun.pop < baseRun.pop,
    `上限降低后人口应更少：base=${baseRun.pop} changed=${changedRun.pop}`);
  // 覆盖退出后必须复原（drive 已退出作用域）
  assert.equal(tunable('POP_SOFT_CAP'), 1400, 'drive 退出后 POP_SOFT_CAP 必须复原');
});

check('parameterOverrides：Job 校验拦截非法形状（跑之前就响）', () => {
  const good = { ...defaultJob(), profile: 'sensitivity', viewPolicy: 'closed' };
  // 非对象
  assert.equal(validateJob({ ...good, parameterOverrides: 'POP_SOFT_CAP=900' }).ok, false,
    'parameterOverrides 为字符串应报错');
  // 未知参数名
  assert.equal(validateJob({ ...good, parameterOverrides: { POP_SOFTCAP: 900 } }).ok, false,
    '未登记的参数名应报错（拼错静默忽略 = 拿「没改」的组去对比）');
  // 非正数
  assert.equal(validateJob({ ...good, parameterOverrides: { POP_SOFT_CAP: 0 } }).ok, false,
    '值 0 应报错');
  assert.equal(validateJob({ ...good, parameterOverrides: { POP_SOFT_CAP: -1 } }).ok, false,
    '负值应报错');
  // 整型参数给小数
  assert.equal(validateJob({ ...good, parameterOverrides: { POP_SOFT_CAP: 1200.5 } }).ok, false,
    '整型参数给小数应报错');
  // 合法
  assert.equal(validateJob({ ...good, parameterOverrides: { POP_SOFT_CAP: 1200, SOUL_CAP: 200 } }).ok, true);
  assert.equal(validateJob({ ...good, parameterOverrides: {} }).ok, true, '空覆盖应合法（≡ 零覆盖）');
  assert.equal(validateJob({ ...good, parameterOverrides: { BIRTH_PER_CAPITA_DAY: 0.0015 } }).ok, true,
    '非整型参数允许小数');
});

check('parameterOverrides：非空覆盖必须配 profile=sensitivity（否则静默忽略）', () => {
  const nat = { ...defaultJob(), profile: 'natural', viewPolicy: 'closed',
    parameterOverrides: { POP_SOFT_CAP: 900 } };
  assert.equal(validateJob(nat).ok, false,
    'natural + 非空覆盖 必须报错——否则覆盖被静默忽略，而报告上写着改了参数');
  // 空覆盖在 natural 下是允许的（≡ 零覆盖，用于对齐验证）
  const natEmpty = { ...defaultJob(), profile: 'natural', viewPolicy: 'closed', parameterOverrides: {} };
  assert.equal(validateJob(natEmpty).ok, true, '空覆盖在任何 profile 下都应合法');
});

check('parameterOverrides：CLI 解析 JSON，非法输入不做静默兜底', () => {
  const good = { ...defaultJob(), profile: 'sensitivity', viewPolicy: 'closed' };
  const parsed = jobFromArgs({ parameterOverrides: '{"POP_SOFT_CAP":1200,"SOUL_CAP":200}' }, good);
  assert.equal(validateJob(parsed).ok, true, '合法 JSON 应被解析并通过校验');
  assert.deepEqual(parsed.parameterOverrides, { POP_SOFT_CAP: 1200, SOUL_CAP: 200 });
  const broken = jobFromArgs({ parameterOverrides: '{"POP_SOFT_CAP":' }, good);
  assert.equal(validateJob(broken).ok, false, '坏 JSON 必须报错，不能静默变成 undefined');
});

check('parameterOverrides：登记进 JOB_KEYS 与 config（未写时为 null）', () => {
  const good = { ...defaultJob(), profile: 'sensitivity', viewPolicy: 'closed',
    parameterOverrides: { POP_SOFT_CAP: 1200 } };
  const r = validateJob(good);
  assert.equal(r.ok, true);
  assert.deepEqual(r.config.parameterOverrides, { POP_SOFT_CAP: 1200 }, 'config 应携带覆盖');
  const none = validateJob({ ...defaultJob(), profile: 'sensitivity', viewPolicy: 'closed' });
  assert.equal(none.config.parameterOverrides, null, '未写覆盖时 config.parameterOverrides 应为 null');
});

check('parameterOverrides 进 configSignature（防不同覆盖静默覆盖）', () => {
  const base = { ...defaultJob(), profile: 'sensitivity', viewPolicy: 'closed' };
  const c1 = validateJob({ ...base, parameterOverrides: { POP_SOFT_CAP: 1200 } }).config;
  const c2 = validateJob({ ...base, parameterOverrides: { POP_SOFT_CAP: 1800 } }).config;
  assert.notEqual(configSignature(c1), configSignature(c2),
    'POP_SOFT_CAP 1200 与 1800 是两次不同实验，签名必须不同');
  // 字段书写顺序不同但语义相同 ⇒ 签名必须相同
  const c3 = validateJob({ ...base, parameterOverrides: { SOUL_CAP: 200, POP_SOFT_CAP: 1200 } }).config;
  const c4 = validateJob({ ...base, parameterOverrides: { POP_SOFT_CAP: 1200, SOUL_CAP: 200 } }).config;
  assert.equal(configSignature(c3), configSignature(c4), '语义相同的覆盖（顺序不同）必须得到相同签名');
  // 零覆盖（空对象）与未写覆盖：签名里的覆盖项都应为 'none'
  assert.equal(parameterOverrideSignature({}), 'none');
  assert.equal(parameterOverrideSignature(null), 'none');
  assert.equal(parameterOverrideSignature({ POP_SOFT_CAP: 1200 }), 'POP_SOFT_CAP=1200');
});

check('parameterOverrides 进 manifest 与 summary（机器可读的凭据）', () => {
  const cfg = validateJob({
    ...defaultJob(), profile: 'sensitivity', viewPolicy: 'closed',
    parameterOverrides: { POP_SOFT_CAP: 1200 },
  }).config;
  const m = buildManifest(cfg);
  assert.equal(m.parameterOverrides.POP_SOFT_CAP, 1200);
  const plain = validateJob({ ...defaultJob(), profile: 'sensitivity', viewPolicy: 'closed' }).config;
  assert.equal(buildManifest(plain).parameterOverrides, null, '零覆盖时 manifest.parameterOverrides 应为 null');
});

check('sensitivity profile：viewPolicy 钉死 closed，profile 表已登记', () => {
  assert.ok(PROFILE_NAMES.includes('sensitivity'), 'sensitivity 必须登记进 PROFILE_NAMES');
  assert.equal(PROFILES.sensitivity.viewPolicy, 'closed', 'sensitivity 的 viewPolicy 必须是 closed');
  const bad = { ...defaultJob(), profile: 'sensitivity', viewPolicy: 'legacy-duty-cycle' };
  assert.equal(validateJob(bad).ok, false, 'sensitivity + 非 closed 视界策略必须报错');
});

check('★ runSeed 的覆盖作用域包住整个推进链（不是只在建世界时生效）', () => {
  // 逐 seed 结果里读到的 parameterOverrides 必须是**实际生效值**。
  // 这同时验证：作用域覆盖在 runSeed 完成时仍有效（读的是实况），
  // 而 runSeed 返回后必已复原。
  const cfg = validateJob({
    ...defaultJob(), experiment: 'selftest-tunables-run',
    profile: 'sensitivity', viewPolicy: 'closed', seeds: [20260914], years: 1,
    stepDays: 3, snapshotDays: 360, probeDays: 30,
    parameterOverrides: { POP_SOFT_CAP: 1000, SOUL_CAP: 150 },
  }).config;
  const r = runSeedSafely(cfg, 20260914);
  assert.equal(r.ok, true, `runSeed 应成功：${r.error ? r.error.message : ''}`);
  assert.deepEqual(r.result.parameterOverrides, { POP_SOFT_CAP: 1000, SOUL_CAP: 150 },
    '逐 seed 结果应记录**实际生效**的覆盖（读作用域实况）');
  assert.equal(tunable('POP_SOFT_CAP'), 1400, 'runSeed 返回后必须复原');
  assert.equal(tunable('SOUL_CAP'), 120, 'runSeed 返回后 SOUL_CAP 必须复原');
});

check('★ 零覆盖的 runSeed 与 natural runSeed 的 digest 逐字节相同', () => {
  const mkCfg = (profile, overrides) => validateJob({
    ...defaultJob(), experiment: 'selftest-tunables-run2',
    profile, viewPolicy: 'closed', seeds: [20260914], years: 1,
    stepDays: 3, snapshotDays: 360, probeDays: 30,
    ...(overrides ? { parameterOverrides: overrides } : {}),
  }).config;
  const a = runSeedSafely(mkCfg('natural', null), 20260914);
  const b = runSeedSafely(mkCfg('sensitivity', {}), 20260914);
  assert.equal(a.ok && b.ok, true);
  assert.equal(a.result.fingerprint.digest, b.result.fingerprint.digest,
    'sensitivity(空覆盖) 与 natural 的 runSeed digest 必须相同');
  assert.equal(a.result.fingerprint.bytes, b.result.fingerprint.bytes);
  // 防御：错误地给 natural 传非空覆盖时必须当场抛错（runner 的守卫）
  assert.throws(() => runSeed({ ...mkCfg('natural', null), parameterOverrides: { POP_SOFT_CAP: 900 } }, 20260914),
    /parameterOverrides/, 'runner 必须拦住「natural + 非空覆盖」这种静默忽略');
});

// ══════════════════════════════════════════════════════════════════
// B2-2 · 人物命运观察队列
//
// 这一段的四条断言对应 fate-queue.mjs 头注释的四条纪律。每条都刻意用
// 「跑一遍真的会失败的方式」去测，而不是只测形状：
//   ① 选人不抽 RNG      ⇒ 同 seed 两世界的队列必须逐字相同；
//   ② 不猜身份继承      ⇒ 名册里没有的人必须落 unavailable，不是 dead、不是 0；
//   ③ 幸存者偏差零容忍  ⇒ 长跑后成员数恒定，且必须有非 alive 态留在样本里；
//   ④ 只读              ⇒ 开关队列不得改变世界 digest（★ 最硬的一条）。
// ══════════════════════════════════════════════════════════════════

section('B2-2 · 人物命运观察队列（选队 / 采集 / 纯度 / 幸存者偏差）');

check('fateQueue：形状校验（非法输入响在跑之前，不静默忽略）', () => {
  const good = { ...defaultJob(), profile: 'natural', viewPolicy: 'closed' };
  assert.equal(validateJob({ ...good, fateQueue: { max: 32, atDay: 3600, filter: 'all' } }).ok, true,
    '合法规格应通过');
  assert.equal(validateJob({ ...good, fateQueue: {} }).ok, true,
    '空对象 = 全默认（32 人 / 下界 0 / all）——「开一个默认队列」是明确请求，不是省略');
  assert.equal(validateJob({ ...good, fateQueue: { max: 8 } }).ok, true, '只写 max 应合法（其余补默认）');
  // 非法形状逐一报错——每一条对应一种「静默忽略后跑出空 fate.csv」的事故
  assert.equal(validateJob({ ...good, fateQueue: { max: 0, atDay: 0, filter: 'all' } }).ok, false, 'max=0 应报错');
  assert.equal(validateJob({ ...good, fateQueue: { max: 32.5, atDay: 0, filter: 'all' } }).ok, false, 'max 小数应报错');
  assert.equal(validateJob({ ...good, fateQueue: { max: 65, atDay: 0, filter: 'all' } }).ok, false, 'max>64 应报错');
  assert.equal(validateJob({ ...good, fateQueue: { max: 32, atDay: -1, filter: 'all' } }).ok, false, 'atDay 负值应报错');
  assert.equal(validateJob({ ...good, fateQueue: { max: 32, atDay: 1.5, filter: 'all' } }).ok, false, 'atDay 小数应报错');
  assert.equal(validateJob({ ...good, fateQueue: { max: 32, atDay: 0, filter: 'bogus' } }).ok, false, '未知 filter 应报错');
  assert.equal(validateJob({ ...good, fateQueue: { max: 32, atDay: 0, filter: 'all', cue: 1 } }).ok, false,
    '未知字段应报错（拼错的键不许被静默忽略）');
  assert.equal(validateJob({ ...good, fateQueue: 'all' }).ok, false, '非对象应报错');
  // filter 白名单与 fate-queue.mjs 同一份（FATE_FILTERS），逐个试过
  for (const f of FATE_FILTERS) {
    assert.equal(validateJob({ ...good, fateQueue: { max: 8, atDay: 0, filter: f } }).ok, true,
      `filter=${f} 应合法`);
  }
});

check('fateQueue：CLI JSON 解析 + config 默认 null（未写 = 不建队）', () => {
  const good = { ...defaultJob(), profile: 'natural', viewPolicy: 'closed' };
  const parsed = jobFromArgs({ fateQueue: '{"max":16,"atDay":720,"filter":"cultivators"}' }, good);
  assert.equal(validateJob(parsed).ok, true, '合法 JSON 应被解析并通过校验');
  assert.deepEqual(parsed.fateQueue, { max: 16, atDay: 720, filter: 'cultivators' });
  // 未写 ⇒ config.fateQueue 为 null（区分「没写」与「显式写了空」）
  assert.equal(validateJob(good).config.fateQueue, null, '未写 fateQueue 时 config 应为 null');
  // 归一化：缺字段补齐默认值（max=32 / atDay=0 / filter=all）
  const r = validateJob({ ...good, fateQueue: { max: 8 } });
  assert.equal(r.ok, true, '只写 max 应合法');
  assert.deepEqual(r.config.fateQueue, { max: 8, atDay: 0, filter: 'all' },
    'config.fateQueue 应携带归一化后的完整规格');
  assert.deepEqual(validateJob({ ...good, fateQueue: {} }).config.fateQueue,
    { max: 32, atDay: 0, filter: 'all' }, '空对象 ⇒ 全默认');
  // 坏 JSON 不做静默兜底
  const broken = jobFromArgs({ fateQueue: '{"max":' }, good);
  assert.equal(validateJob(broken).ok, false, '坏 JSON 必须报错');
});

check('fateQueue 进 configSignature（不同队列不许静默互覆）', () => {
  const base = { ...defaultJob(), profile: 'natural', viewPolicy: 'closed' };
  const c1 = validateJob({ ...base, fateQueue: { max: 16, atDay: 0, filter: 'all' } }).config;
  const c2 = validateJob({ ...base, fateQueue: { max: 32, atDay: 0, filter: 'all' } }).config;
  assert.notEqual(configSignature(c1), configSignature(c2), 'max 不同 ⇒ 两次不同实验 ⇒ 签名不同');
  // 字段书写顺序不同但语义相同 ⇒ 签名必须相同
  const c3 = validateJob({ ...base, fateQueue: { filter: 'all', atDay: 0, max: 16 } }).config;
  assert.equal(configSignature(c3), configSignature(c1), '语义相同的队列（键序不同）签名必须相同');
  // null 与「未写」天然同类：签名里都是 'none'
  assert.equal(configSignature(validateJob(base).config), configSignature({ ...base, fateQueue: null }));
});

check('flattenFate：空快照 ⇒ 空行（不产只有表头的 fate.csv）', () => {
  assert.deepEqual(flattenFate(1, []), [], '没开队列时必须返回空数组');
  assert.deepEqual(flattenFate(1, null), []);
  assert.deepEqual(flattenFate(1, [{ day: 360, members: [] }]), [], '空成员也要返回空数组');
  // 一行成员 ⇒ 一行 CSV 行，且列与 FATE_CSV_COLUMNS 对齐
  const rows = flattenFate(7, [{
    day: 360,
    members: [{ slot: 0, id: 3, name: '张三', state: 'alive', level: 2, maxLevelSeen: 5, everCultivator: true }],
  }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].seed, 7);
  assert.equal(rows[0].day, 360);
  assert.equal(rows[0].name, '张三');
  assert.equal(rows[0].maxLevelSeen, 5);
  for (const col of FATE_CSV_COLUMNS) {
    assert.ok(col in rows[0], `压平行必须含列 ${col}（缺列会让 CSV 出现空洞）`);
  }
  // 追加式纪律：FATE_COLUMNS 必须原样出现在 FATE_CSV_COLUMNS 里（顺序一致）
  assert.deepEqual(FATE_CSV_COLUMNS.slice(2), [...FATE_COLUMNS],
    'fate.csv 的列必须是 seed,day + FATE_COLUMNS 原序');
});

check('① selectFateQueue 确定性：同 seed 两世界的队列逐字相同（不抽 RNG）', () => {
  const mk = () => createLabWorld({
    seed: 4242, preset: 'small', profile: 'natural',
    generationVersion: 2, terrainPreset: 'standard',
  });
  const a = mk();
  const b = mk();
  // 空池语义：第 0 日实体表是空的（初始人口排在 pendingSpawns）⇒ 选不出人，
  // 返回 **空数组**而不是兜底选人。这条先钉死，否则「空队」会被误读成「没人可选」。
  assert.deepEqual(selectFateQueue(a.world, { max: 16, atDay: 0, filter: 'all' }), [],
    '第 0 日实体表为空，选队应返回空数组（不兜底、不抛错）');
  // 推进到人口成形后再选：两个同 seed 世界必须选出**逐字相同**的队伍。
  for (const lab of [a, b]) {
    for (let d = 0; d < 90; d += 3) {
      advanceWorld(lab.world, 3, {
        life: lab.life, upperLife: lab.upperLife, rng: lab.ecoRng,
        state: lab.advanceState, riftActive: false,
      });
    }
  }
  const qa = selectFateQueue(a.world, { max: 16, atDay: 0, filter: 'all' });
  const qb = selectFateQueue(b.world, { max: 16, atDay: 0, filter: 'all' });
  assert.deepEqual(qa, qb, '同 seed 的两次选队必须逐字相同（靠 id 排序，不靠随机）');
  // 幂等：对同一个世界再选一次，结果不变（说明选队没推进世界）
  assert.deepEqual(selectFateQueue(a.world, { max: 16, atDay: 0, filter: 'all' }), qa);
  assert.ok(qa.length > 0 && qa.length <= 16, `队列规模应落在 1..16，实际 ${qa.length}`);
  // 等距取样必须覆盖 id 区间（不是只取最早的 cap 个）
  if (a.world.entities.length > 16) {
    const ids = qa.map((m) => m.id);
    assert.ok(Math.max(...ids) > Math.min(...ids), '等距取样应跨越 id 区间');
  }
});

check('④★ 开关 fateQueue 不得改变世界 digest（纯采集的结构性证明）', () => {
  const mk = (fateQueue) => validateJob({
    ...defaultJob(), experiment: 'selftest-b2fate-purity',
    profile: 'natural', viewPolicy: 'closed', seeds: [20260914], years: 3,
    stepDays: 3, snapshotDays: 360, probeDays: 30,
    ...(fateQueue ? { fateQueue } : {}),
  }).config;
  // atDay 落在运行中段（第 2 年）——建队路径也要走到，而不只是开头建一次。
  const withFate = runSeedSafely(mk({ max: 16, atDay: 720, filter: 'all' }), 20260914);
  const without = runSeedSafely(mk(null), 20260914);
  assert.equal(withFate.ok && without.ok, true,
    `两次运行都应成功：${withFate.error ? withFate.error.message : ''}${without.error ? without.error.message : ''}`);
  assert.equal(withFate.result.fingerprint.digest, without.result.fingerprint.digest,
    '★ 开队列与不开队列的世界指纹必须逐字节相同（fate-queue 只读纪律）');
  assert.equal(withFate.result.fingerprint.bytes, without.result.fingerprint.bytes);
  // 反证：队列确实采到了东西（否则「digest 相同」可能是因为「什么都没采」）
  const snaps = withFate.result.fateSnapshots;
  assert.ok(snaps.length >= 2, `3 年里应至少采到 2 期（建队在第 2 年），实际 ${snaps.length}`);
  assert.equal(snaps[0].members.length, 16, '队列规模应为 16');
  // 不开队列时 result.fateSnapshots 必须是空数组（报告层据此不写 fate.csv）
  assert.deepEqual(without.result.fateSnapshots, []);
});

check('② atDay 语义：没到建队日不采；atDay=0 从第一期就采', () => {
  const mk = (atDay) => validateJob({
    ...defaultJob(), experiment: 'selftest-b2fate-atday',
    profile: 'natural', viewPolicy: 'closed', seeds: [20260914], years: 3,
    stepDays: 3, snapshotDays: 360, probeDays: 30,
    fateQueue: { max: 8, atDay, filter: 'all' },
  }).config;
  const never = runSeedSafely(mk(99999), 20260914);   // 建队日在总时长之外
  assert.equal(never.ok, true);
  assert.deepEqual(never.result.fateSnapshots, [], 'atDay 超过总时长时一期都不该采');
  const fromZero = runSeedSafely(mk(0), 20260914);
  assert.ok(fromZero.result.fateSnapshots.length >= 3,
    'atDay=0 时应从第 1 期（第 360 日）就开始采');
  assert.equal(fromZero.result.fateSnapshots[0].day, 360, '第一期应落在第一个快照日');
});

check('③★ 幸存者偏差零容忍：长跑后成员数恒定，且死者留在样本里', () => {
  // 60 年足够让一代凡人走完一生：若队列被「悄悄只留活人」，
  // members.length 会随死亡下降——这条断言就是抓那个的。
  const cfg = validateJob({
    ...defaultJob(), experiment: 'selftest-b2fate-survival',
    profile: 'natural', viewPolicy: 'closed', seeds: [20260914], years: 60,
    stepDays: 3, snapshotDays: 360, probeDays: 30,
    fateQueue: { max: 24, atDay: 0, filter: 'all' },
  }).config;
  const r = runSeedSafely(cfg, 20260914);
  assert.equal(r.ok, true, `60 年运行应成功：${r.error ? r.error.message : ''}`);
  const snaps = r.result.fateSnapshots;
  assert.ok(snaps.length >= 60, `应采到约 60 期，实际 ${snaps.length}`);
  const sizes = snaps.map((s) => s.members.length);
  for (const n of sizes) {
    assert.equal(n, 24, '每一期的成员数必须恒为 24（样本只增不减，绝不悄悄移除）');
  }
  const last = snaps[snaps.length - 1];
  const states = {};
  for (const m of last.members) states[m.state] = (states[m.state] || 0) + 1;
  assert.ok((states.dead || 0) + (states.ascended || 0) + (states.unavailable || 0) > 0,
    `60 年后必须有成员离开实体表；四态分布=${JSON.stringify(states)}（全 alive 说明队列被过滤过）`);
  // 死者必须带**可证的**最后状态：level / died / cause / fate 至少一项有值，
  // 且 maxLevelSeen ≥ 名册 level（跨样本记忆不许丢）
  const gone = last.members.filter((m) => m.state !== 'alive');
  for (const m of gone) {
    assert.ok(m.died !== '' || m.cause !== '' || m.fate !== '' || m.state === 'unavailable',
      `离开实体表的成员应有可证的最后状态（id=${m.id} state=${m.state}）`);
    assert.ok((Number(m.maxLevelSeen) || 0) >= (Number(m.level) || 0),
      `maxLevelSeen 必须 ≥ 名册 level（跨样本记忆丢了？id=${m.id}）`);
  }
  // 摘要器：四态计数之和 = 成员数（不容许多算或少算）
  const summary = fateQueueSummary(snaps);
  assert.equal(summary.counts.alive + summary.counts.dead + summary.counts.ascended + summary.counts.unavailable,
    summary.memberCount, '四态计数之和必须等于成员数');
  assert.deepEqual(summary.columns, [...FATE_COLUMNS], '摘要应带上列清单（便于 CSV 对齐）');
  // ★ 境界列必须是**真标签**：`realmLabel` 收的是等级（内部自己调 realmFor）。
  //   曾经误写成 realmLabel(realmFor(level)) ⇒ 整列变成「炼气NaN层」——
  //   一个看起来像数据、其实是 NaN 的列。这条断言就是守它。
  for (const snap of snaps) {
    for (const m of snap.members) {
      if (m.state !== 'alive') continue;
      if ((Number(m.level) || 0) <= 0) {
        assert.equal(m.realm, '凡人', 'level<=0 的境界必须是「凡人」');
      } else {
        assert.ok(!String(m.realm).includes('NaN'),
          `境界列不得含 NaN（id=${m.id} level=${m.level} realm=${m.realm}）`);
        assert.ok(String(m.realm).length >= 2, `境界列应是真标签：${m.realm}`);
      }
    }
  }
  // 心魔列只对活体有值（死者不可得 ⇒ 空，不是 0）
  for (const m of last.members) {
    if (m.state === 'alive') assert.ok(m.heartDemon !== '', '活体必须带心魔读数');
    else assert.equal(m.heartDemon, '', '死者的心魔不可得，必须留空而不是填 0');
  }
});

check('fateQueueSpec：归一化的边界（钳位而不是抛错，校验已在上游做完）', () => {
  assert.equal(fateQueueSpec(null), null, 'null ⇒ 不建队');
  assert.equal(fateQueueSpec(undefined), null);
  assert.deepEqual(fateQueueSpec({ max: 999 }), { max: 64, atDay: 0, filter: 'all' }, 'max 超出上限应钳到 64');
  assert.deepEqual(fateQueueSpec({ max: -5 }), { max: 1, atDay: 0, filter: 'all' }, 'max 负值应钳到 1');
  assert.deepEqual(fateQueueSpec({ atDay: -10 }), { max: 32, atDay: 0, filter: 'all' }, 'atDay 负值应钳到 0');
  // 未知 filter 回落默认值（这里不抛错：validateJob 已经在跑前挡住了）
  assert.deepEqual(fateQueueSpec({ filter: 'bogus' }), { max: 32, atDay: 0, filter: 'all' });
});

// ══════════════════════════════════════════════════════════════════

console.log(`\n${'='.repeat(64)}`);
console.log(`World Laboratory 自检：${checks - failed}/${checks} 项通过`);
console.log('='.repeat(64));
if (failed) {
  console.log(`未通过 ${failed} 项。`);
  process.exit(1);
}
console.log('实验工具是干净的 ✓');
