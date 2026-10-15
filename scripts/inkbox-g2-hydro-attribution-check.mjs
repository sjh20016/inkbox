#!/usr/bin/env node
// G2-P0.3 阶段 A · 水文计数器自测（委托书 §A2 的 A2-1 … A2-8）。
//
// 这是「测试结果不能只靠执行者自己解释」原则的第一步：计数器是**纯函数**，
// 它的每条边界都在这里被钉死；注入浏览器的存取器源码也在 Node 里真跑。
//
// 运行：node scripts/inkbox-g2-hydro-attribution-check.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  HYDRO_PERIOD_S, HYDRO_MAX_STEPS, HYDRO_EPS,
  inferHydroSteps, crossCheckHydro, hydroAccessorSource,
} from './inkbox-g2-hydro-counter.mjs';

let passed = 0;
const failures = [];
function check(label, run) {
  try { run(); passed += 1; console.log(`  ✓ ${label}`); }
  catch (error) { failures.push({ label, error }); console.log(`  ✗ ${label}\n      ${error.message}`); }
}

const DT60 = 1 / 60;                       // 16.666… ms，Controlled 与多数 Native 帧
const CAP = 0.12;                          // main.js:1923 的截断上限

console.log('G2-P0.3 · 水文计数器自测（A2）');

// ── A2-1：累加未达到 0.16 ⇒ 0 步 ───────────────────────────────
check('A2-1 累加未达到 0.16 秒 → 0 步', () => {
  const accumBefore = 0.05;
  const accumAfter = accumBefore + DT60;          // 0.0667 < 0.16
  const out = inferHydroSteps({ paused: false, accumBefore, accumAfter, dt: DT60 });
  assert.equal(out.steps, 0, '应为 0 步');
  assert.equal(out.consistent, true);
});

// ── A2-2：0.15 + 1/60 ⇒ 恰好 1 步（旧版 delta>0 判据在此漏掉） ──
check('A2-2 0.15 + 1/60 跨过阈值 → 1 步（旧判据漏报的那一类）', () => {
  const accumBefore = 0.15;
  const accumAfter = accumBefore + DT60 - HYDRO_PERIOD_S;   // 0.00667
  const out = inferHydroSteps({ paused: false, accumBefore, accumAfter, dt: DT60 });
  assert.equal(out.steps, 1, '应为 1 步');
  assert.equal(out.consistent, true);
  // 反例：旧判据只看 delta 符号 ⇒ 这一帧 delta 为负，会被判成「没有水文」
  const oldBuggyJudgement = accumAfter - accumBefore > 0;
  assert.equal(oldBuggyJudgement, false, '该帧 delta 必须为负，证明旧判据在此漏报');
});

// ── A2-3：0.02 + 1/60 ⇒ 0 步 ───────────────────────────────────
check('A2-3 0.02 + 1/60 → 0 步', () => {
  const accumBefore = 0.02;
  const out = inferHydroSteps({ paused: false, accumBefore, accumAfter: accumBefore + DT60, dt: DT60 });
  assert.equal(out.steps, 0);
});

// ── A2-4：dt 被截断到 0.12 ⇒ 必须按截断后的 dt 算 ────────────────
check('A2-4 dt 截断到 0.12 → 按截断后的 dt 计算（原始间隔会多算）', () => {
  const accumBefore = 0.05;
  const capped = inferHydroSteps({ paused: false, accumBefore, accumAfter: accumBefore + CAP - HYDRO_PERIOD_S, dt: CAP });
  assert.equal(capped.steps, 1, '截断后 0.05+0.12=0.17 ⇒ 1 步');
  // 反例：若误用原始 RAF 间隔 0.5s 当 dt，会算出 3 步 —— 正式游戏不存在这种补跑
  const wrong = inferHydroSteps({ paused: false, accumBefore, accumAfter: accumBefore + CAP - HYDRO_PERIOD_S, dt: 0.5 });
  assert.equal(wrong.consistent, false, '用未截断的 dt 必须被残差校验拒绝');
  assert.match(wrong.reason, /residual-too-large/);
});

// ── A2-5：暂停 ⇒ 0 步且不累加 ───────────────────────────────────
check('A2-5 暂停 → 0 步且累加器不变', () => {
  const out = inferHydroSteps({ paused: true, accumBefore: 0.09, accumAfter: 0.09, dt: DT60 });
  assert.equal(out.steps, 0);
  assert.equal(out.consistent, true);
  assert.equal(out.reason, 'paused');
  // 反例：暂停却动了累加器 ⇒ 必须判 INVALID，不能悄悄算成 0
  const bad = inferHydroSteps({ paused: true, accumBefore: 0.09, accumAfter: 0.1067, dt: DT60 });
  assert.equal(bad.consistent, false);
  assert.match(bad.reason, /paused-but-accumulator-changed/);
});

// ── A2-6：Controlled 固定 dt ⇒ 用真正传入 update 的 dt ──────────
check('A2-6 Controlled 固定 1/60 → 用真正传入 update 的 dt', () => {
  // 连续 10 帧固定 1/60：第 10 帧跨过阈值并补水
  let accum = 0;
  const steps = [];
  for (let i = 0; i < 12; i += 1) {
    const before = accum;
    accum += DT60;
    let stepped = 0;
    while (accum >= HYDRO_PERIOD_S && stepped < HYDRO_MAX_STEPS) { accum -= HYDRO_PERIOD_S; stepped += 1; }
    const out = inferHydroSteps({ paused: false, accumBefore: before, accumAfter: accum, dt: DT60 });
    assert.equal(out.consistent, true, `第 ${i} 帧推导必须自洽：${out.reason}`);
    assert.equal(out.steps, stepped, `第 ${i} 帧推导步数须等于真实步数`);
    steps.push(out.steps);
  }
  assert.deepEqual(steps, [0,0,0,0,0,0,0,0,0,1,0,0], '固定 1/60 下每 10 帧一步');
});

// ── A2-7：多步积压与上限 ────────────────────────────────────────
check('A2-7 多步积压：2 步正常，超过上限时按 3 步封顶', () => {
  const two = inferHydroSteps({ paused: false, accumBefore: 0.30, accumAfter: 0.30 + CAP - 2 * HYDRO_PERIOD_S, dt: CAP });
  assert.equal(two.steps, 2, '0.30+0.12=0.42 ⇒ 2 步（0.10 剩余）');
  // 0.60+0.12=0.72：无上限会是 4 步，产品 `hydroSteps < 3` 封顶 ⇒ 3 步、剩 0.24
  const capped = inferHydroSteps({ paused: false, accumBefore: 0.60, accumAfter: 0.60 + CAP - 3 * HYDRO_PERIOD_S, dt: CAP });
  assert.equal(capped.steps, 3, '必须遵守 3 步上限');
  assert.equal(capped.consistent, true);
  // 反例：若装作跑了 4 步，累加器会对不上 ⇒ 拒绝
  const impossible = inferHydroSteps({ paused: false, accumBefore: 0.60, accumAfter: 0.60 + CAP - 4 * HYDRO_PERIOD_S, dt: CAP });
  assert.equal(impossible.consistent, false, '4 步既超上限又与实测累加器矛盾');
});

// ── A2-8：直接计数与推导冲突 ⇒ 必须失败 ─────────────────────────
check('A2-8 直接计数与推导冲突 → 判定失败（不得产出结论）', () => {
  const agree = crossCheckHydro({ directSteps: 2, inferred: { steps: 2, consistent: true } });
  assert.equal(agree.ok, true);
  const conflict = crossCheckHydro({ directSteps: 2, inferred: { steps: 1, consistent: true } });
  assert.equal(conflict.ok, false);
  assert.match(conflict.reason, /direct\(2\)!=inferred\(1\)/);
  const brokenInferred = crossCheckHydro({ directSteps: 0, inferred: { steps: null, consistent: false, reason: 'residual-too-large:0.09' } });
  assert.equal(brokenInferred.ok, false);
  const noDirect = crossCheckHydro({ directSteps: null, inferred: { steps: 0, consistent: true } });
  assert.equal(noDirect.ok, false);
});

// ── A2-9（附加）：注入浏览器的存取器源码在 Node 里真跑 ──────────
console.log('  附加：验证注入源码本身（在 Node 里真跑同一个字符串）');
check('存取器：+dt 记 accumulate、−0.16 记 step、其它写记 other', () => {
  class FakeSandbox { constructor() { this.hydroAccum = 0; } }
  const target = new FakeSandbox();
  // 用同一个生成函数取得源码，避免「测试的和注入的不是一份」
  new Function('sandbox', `const window = { inkbox: sandbox };\n${hydroAccessorSource('sandbox')}`)(target);
  const probe = target.__hydroProbe;
  assert.ok(probe, '必须挂上 __hydroProbe');

  const dt = DT60;
  probe.lastDt = dt;                       // 由帧探针在 update 前设置
  const before = target.hydroAccum;
  target.hydroAccum = before + dt;         // 产品 `this.hydroAccum += dt`
  assert.equal(probe.accumulateWrites, 1);
  target.hydroAccum = target.hydroAccum - HYDRO_PERIOD_S;   // 产品 `this.hydroAccum -= 0.16`
  assert.equal(probe.stepCalls, 1, '减 0.16 必须被记成一次水文调用');
  target.hydroAccum = 123;                 // 反例：别的写入者
  assert.equal(probe.otherWrites.length, 1, '既非 +dt 也非 −0.16 的写入必须被单独记录');
  assert.equal(probe.stepCalls, 1, '无关写入不得污染水文计数');

  // 两路一致性：直接法 1 步 ⇒ 推导法也必须 1 步
  const inferred = inferHydroSteps({ paused: false, accumBefore: before, accumAfter: before + dt - HYDRO_PERIOD_S, dt });
  assert.equal(crossCheckHydro({ directSteps: probe.stepCalls, inferred }).ok, true);
});

check('存取器：读数语义与产品字段完全一致（不改变取值）', () => {
  class FakeSandbox { constructor() { this.hydroAccum = 0.42; } }
  const target = new FakeSandbox();
  new Function('sandbox', `const window = { inkbox: sandbox };\n${hydroAccessorSource('sandbox')}`)(target);
  assert.equal(target.hydroAccum, 0.42, '装存取器后初值必须原样可读');
  target.hydroAccum += 0.01;
  assert.equal(target.hydroAccum, 0.43, '写入必须原样生效');
});

// ⚠️ 反例（真实踩过）：把 inferHydroSteps 注入页面时它的**模块级常量不会跟着走**。
//    gate 模式 paused 恒真、函数走 early-return，碰不到常量 ⇒ 不报错；
//    非暂停路径才炸 ReferenceError，而且是在页面 RAF 回调里炸 ⇒ 整个游戏循环停摆。
//    所以这里在**隔离作用域**里把注入形态真跑一遍，两种路径都要过。
check('注入形态：inferHydroSteps 在无模块作用域下仍可用（paused 与非 paused 都要过）', () => {
  const injected = `const HYDRO_PERIOD_S=${HYDRO_PERIOD_S},HYDRO_MAX_STEPS=${HYDRO_MAX_STEPS},HYDRO_EPS=${HYDRO_EPS};const inferHydro=(${inferHydroSteps.toString()});return inferHydro;`;
  const inferHydro = new Function(injected)();
  // 非暂停路径（gate 模式永远走不到这里，所以历史上没暴露）
  assert.deepEqual(inferHydro({ paused: false, accumBefore: 0.15, accumAfter: 0.15 + DT60 - HYDRO_PERIOD_S, dt: DT60 }), { steps: 1, consistent: true, reason: 'ok' });
  assert.equal(inferHydro({ paused: false, accumBefore: 0.02, accumAfter: 0.02 + DT60, dt: DT60 }).steps, 0);
  // 暂停路径
  assert.equal(inferHydro({ paused: true, accumBefore: 0.09, accumAfter: 0.09, dt: DT60 }).steps, 0);
  // 且必须真的不依赖外部常量：故意在函数外不留任何变量
  assert.equal(typeof HYDRO_PERIOD_S, 'number');
});

console.log('');
if (failures.length) {
  console.error(`水文计数器自测失败 ${failures.length} 项 / 共 ${passed + failures.length} 项`);
  for (const f of failures) console.error(`  ✗ ${f.label}: ${f.error.message}`);
  process.exitCode = 1;
} else {
  console.log(`水文计数器自测通过 · ${passed} 项（A2-1…A2-8 + 注入源码 2 项）`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 离线重算模式（委托书 §4）：
// 全部 P50/P95/P99、长帧比例与水文分组结果，都必须能从**原始逐帧 JSON**
// 独立重算 —— 不能只提交算好的摘要表。本模式不读任何预先计算的统计字段，
// 只读 frames / veg / probe 原始数组，重新推一遍并交叉验证计数器。
//
// 用法：
//   node scripts/inkbox-g2-hydro-attribution-check.mjs --recalc=reports/analysis/g2-p03/<file>.json
// ─────────────────────────────────────────────────────────────────────────────

function percentile(values, p) {
  const sorted = values.filter(v => v !== null && v !== undefined && Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return Number(sorted[index].toFixed(3));
}

function recalcFile(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const lines = [];
  const say = s => { lines.push(s); console.log(s); };
  let problems = 0;

  say(`\n═══ 离线重算：${file} ═══`);
  say(`产品 HEAD ${raw.sourceHead} · 产品源码改动「${raw.productSourceDirty || ''}」· 门禁抽取 SHA-256 ${raw.gateSourceIdentity.extractedSha256.slice(0, 16)}`);
  say(`环境：${raw.environment?.gpu?.renderer || '(未记录)'} · clock=${raw.clock} · surface=${raw.surface}`);

  for (const run of raw.cases || []) {
    const { case: spec, arm, rows, veg, probe } = run;
    const measured = rows.filter(r => r.phase === 'measured');
    const use = measured.length ? measured : rows;
    say(`\n── case ${spec.caseIndex ?? spec.preset} / arm=${arm} / ${use.length} 帧${measured.length ? '（measured 段）' : ''} ──`);

    // ① 计数器交叉验证（独立重推，不信任已存的 hydroInferredCalls）
    let bad = 0; let directTotal = 0; let inferredTotal = 0;
    for (const r of use) {
      const inferred = inferHydroSteps({
        paused: r.paused === true,
        accumBefore: r.hydroAccumBefore,
        accumAfter: r.hydroAccumAfter,
        dt: r.simulationDtMs === null ? NaN : r.simulationDtMs / 1000,
      });
      directTotal += r.hydroDirectCalls || 0;
      inferredTotal += inferred.steps || 0;
      if (!crossCheckHydro({ directSteps: r.hydroDirectCalls, inferred }).ok) bad += 1;
    }
    say(`水文：直接 ${directTotal} 步 · 推导 ${inferredTotal} 步 · 不一致帧 ${bad} · paused 全真 ${use.every(r => r.paused === true)}`);
    if (bad) { problems += 1; say('  ✗ 计数器不一致 ⇒ 该次运行 INVALID，不得产出性能结论'); }
    if (probe?.otherCount) { problems += 1; say(`  ✗ hydroAccum 存在 ${probe.otherCount} 次非 +dt/-0.16 写入 ⇒ 判据不成立`); }

    // ② 时间口径（四类必须分开报，不得混用）
    for (const [name, key] of [['rawRafIntervalMs', 'rawRafIntervalMs'], ['simulationDtMs', 'simulationDtMs'], ['updateCpuMs', 'updateCpuMs'], ['renderCpuMs', 'renderCpuMs'], ['frameCpuMs', 'frameCpuMs']]) {
      const v = use.map(r => r[key]);
      say(`  ${name.padEnd(18)} P50 ${percentile(v, .5)} · P95 ${percentile(v, .95)} · P99 ${percentile(v, .99)} · max ${percentile(v, 1)}`);
    }
    const raf = use.map(r => r.rawRafIntervalMs);
    say(`  RAF 长帧比例：>16.7ms ${(raf.filter(v => v > 16.7).length / raf.length * 100).toFixed(1)}% · >33.3ms ${(raf.filter(v => v > 33.3).length / raf.length * 100).toFixed(1)}% · >50ms ${(raf.filter(v => v > 50).length / raf.length * 100).toFixed(1)}%`);

    // ③ 水文分组：有步 / 无步 两类帧的分布（用**下一帧** RAF 关联，慢帧表现为下一帧 dt 变大）
    const lag = [];
    for (let i = 0; i < use.length - 1; i += 1) {
      const inferred = inferHydroSteps({ paused: use[i].paused === true, accumBefore: use[i].hydroAccumBefore, accumAfter: use[i].hydroAccumAfter, dt: (use[i].simulationDtMs || 0) / 1000 });
      lag.push({ steps: inferred.steps || 0, nextRaf: use[i + 1].rawRafIntervalMs, selfCpu: use[i].frameCpuMs });
    }
    const withH = lag.filter(x => x.steps > 0); const withoutH = lag.filter(x => x.steps === 0);
    say(`  水文分组：有步帧 n=${withH.length}（下一帧 RAF P50 ${percentile(withH.map(x => x.nextRaf), .5)} / P95 ${percentile(withH.map(x => x.nextRaf), .95)}）`);
    say(`            无步帧 n=${withoutH.length}（下一帧 RAF P50 ${percentile(withoutH.map(x => x.nextRaf), .5)} / P95 ${percentile(withoutH.map(x => x.nextRaf), .95)}）`);

    // ④ 脏通道与触发证据
    const chans = { height: 0, type: 0, veg: 0, water: 0 };
    let firedCounts = {}; let lifeFrames = 0;
    for (const r of use) {
      if (r.bridge) for (const k of Object.keys(chans)) if (r.bridge[k]) chans[k] += 1;
      if (r.fired) for (const k of Object.keys(r.fired)) if (r.fired[k]) firedCounts[k] = (firedCounts[k] || 0) + 1;
      if (r.lifeStepped) lifeFrames += 1;
    }
    say(`  脏通道：${JSON.stringify(chans)} · lifeStepped ${lifeFrames}/${use.length} · fired ${JSON.stringify(firedCounts)}`);

    // ⑤ 植被：真实 GPU 上传与「成员是否真的变了」
    const glCalls = use.reduce((a, r) => a + (r.glUploads || 0), 0);
    const glBytes = use.reduce((a, r) => a + (r.glBytes || 0), 0);
    const sigs = (veg || []).map(v => v.treeSignature);
    let changed = 0;
    for (let i = 1; i < sigs.length; i += 1) if (sigs[i] !== sigs[i - 1]) changed += 1;
    const redundant = Math.max(0, sigs.length - 1 - changed);
    say(`  植被：完整更新 ${sigs.length} 次 · 唯一成员签名 ${new Set(sigs).size} · 相邻签名变化 ${changed} 次 ⇒ 成员未变的重建 ${redundant} 次`);
    say(`  GPU 上传：${glCalls} 次调用 · ${glBytes} 字节（拦截 bufferSubData/bufferData）`);
  }
  say(`\n重算完成：${problems ? `发现 ${problems} 处不可信` : '全部一致，可独立复算'}`);

  // ── A/A 离散度（委托书 §A5 问题 1/2：同配置不同轮次相差多少）─────────────
  // 从**每轮自己的原始帧数组**重算 P95，再比较轮间极差与比值。
  // 门禁现行预算为 `On ≤ Off×1.08 + 1.5ms`，所以这里把同一把尺子量在 A/A 上：
  // 「同代码 vs 同代码」若也能越线，说明该通道的分辨率不足以支撑该预算。
  const groups = new Map();
  for (const run of raw.cases || []) {
    const key = `${run.case.caseIndex ?? run.case.preset}/${run.case.renderer}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  for (const [key, runs] of groups) {
    if (runs.length < 2) continue;
    const per = runs.map(run => {
      const rows = (run.rows || []).filter(r => r.phase === 'measured');
      const use = rows.length ? rows : (run.rows || []);
      return { frameP95: percentile(use.map(r => r.frameCpuMs), .95), rafP95: percentile(use.map(r => r.rawRafIntervalMs), .95), rafP50: percentile(use.map(r => r.rawRafIntervalMs), .5) };
    });
    const spread = list => {
      const v = list.filter(Number.isFinite);
      return { min: Math.min(...v), max: Math.max(...v), range: Number((Math.max(...v) - Math.min(...v)).toFixed(3)), ratio: Number((Math.max(...v) / Math.min(...v)).toFixed(3)) };
    };
    const f = spread(per.map(p => p.frameP95));
    const r = spread(per.map(p => p.rafP95));
    say(`\n── A/A 离散 · ${key} · ${runs.length} 轮同配置 ──`);
    say(`  frameCpuMs P95 各轮：${per.map(p => p.frameP95).join(' / ')}  ⇒ 极差 ${f.range} ms（${(f.ratio * 100 - 100).toFixed(1)}%）`);
    say(`  rawRaf     P95 各轮：${per.map(p => p.rafP95).join(' / ')}  ⇒ 极差 ${r.range} ms（${(r.ratio * 100 - 100).toFixed(1)}%）`);
    // ⚠️ 必须按**门禁自己的判据**模拟：门禁取 Off 组与 On 组的**最差 P95**，
    //    判 `OnWorst <= OffWorst * 1.08 + 1.5`。上一版写成「最快轮 vs 最慢轮的容许
    //    上限」，方向是反的，会得出一个碰巧正确的「通过」——这种结论不算证据。
    //    这里穷举把 N 轮拆成两组（每组 ≥2）的全部方式，并对 Off/On 两种角色各算一次。
    const p95 = runs.map(run => {
      const rows = (run.rows || []).filter(r => r.phase === 'measured');
      const use = rows.length ? rows : (run.rows || []);
      return percentile(use.map(r => r.frameCpuMs), .95);
    });
    const combos = [];
    const n = p95.length;
    const half = Math.floor(n / 2);
    const choose = (start, picked) => {
      if (picked.length === half) { combos.push(picked.slice()); return; }
      for (let i = start; i < n; i += 1) { picked.push(i); choose(i + 1, picked); picked.pop(); }
    };
    if (n >= 4) choose(0, []);
    const allowance = off => Number((off * 1.08 + 1.5).toFixed(3));
    let worstMargin = Infinity; let failing = 0; let total = 0;
    for (const groupA of combos) {
      const groupB = p95.map((_, i) => i).filter(i => !groupA.includes(i));
      for (const [offIdx, onIdx] of [[groupA, groupB], [groupB, groupA]]) {
        const offWorst = Math.max(...offIdx.map(i => p95[i]));
        const onWorst = Math.max(...onIdx.map(i => p95[i]));
        const margin = Number((allowance(offWorst) - onWorst).toFixed(3));
        total += 1;
        if (margin < 0) failing += 1;
        worstMargin = Math.min(worstMargin, margin);
      }
    }
    if (total) {
      say(`  门禁同构模拟：${total} 种有序分组（组内取最差 P95，判 OnWorst ≤ OffWorst×1.08+1.5）`);
      say(`    判为回退的分组 ${failing}/${total} · 最小余量 ${worstMargin} ms`);
      say(`  ⇒ 同代码 A/A ${failing ? `**会**出现 ${failing} 种假失败` : '未出现假失败'}${!failing && worstMargin < 1.5 ? '，但最小余量已不足 1.5ms，属薄余量' : ''}`);
    }
  }
  say('');
  return problems;
}

const recalcArg = process.argv.find(a => a.startsWith('--recalc='));
if (recalcArg) {
  const problems = recalcFile(recalcArg.slice('--recalc='.length));
  if (problems) process.exitCode = 1;
}
