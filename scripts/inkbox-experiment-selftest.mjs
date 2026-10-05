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
import {
  coefficientOfVariation, count, describe, entropy, gini, hhi, isNonDecreasing,
  isNonIncreasing, max, mean, median, min, percentile, relativeDrift, slope, stddev, sum, tail,
} from './experiment/stats.mjs';
import { validateJob, defaultJob, jobFromArgs, withProfileDefaults, JOB_SCHEMA_VERSION } from './experiment/job-schema.mjs';
import { PROFILES, PROFILE_NAMES, legacyViewOpenAt, LEGACY_RIFT_OPEN_SITES } from './experiment/profiles.mjs';
import { runSeed, runSeedSafely } from './experiment/runner.mjs';
import { createLabWorld } from './experiment/world-factory.mjs';
import { worldFingerprint } from './experiment/digest.mjs';
import { formatNumber, toCsv, configSignature, buildManifest } from './experiment/report.mjs';
import { SNAPSHOT_COLUMNS, PROBE_COLUMNS } from './experiment/collectors.mjs';
import { diagnoseSeed } from './experiment/diagnostics.mjs';

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

console.log(`\n${'='.repeat(64)}`);
console.log(`World Laboratory 自检：${checks - failed}/${checks} 项通过`);
console.log('='.repeat(64));
if (failed) {
  console.log(`未通过 ${failed} 项。`);
  process.exit(1);
}
console.log('实验工具是干净的 ✓');
