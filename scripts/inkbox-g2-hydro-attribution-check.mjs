#!/usr/bin/env node
// G2-P0.3 阶段 A · 水文计数器自测（委托书 §A2 的 A2-1 … A2-8）。
//
// 这是「测试结果不能只靠执行者自己解释」原则的第一步：计数器是**纯函数**，
// 它的每条边界都在这里被钉死；注入浏览器的存取器源码也在 Node 里真跑。
//
// 运行：node scripts/inkbox-g2-hydro-attribution-check.mjs

import assert from 'node:assert/strict';
import {
  HYDRO_PERIOD_S, HYDRO_MAX_STEPS,
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

console.log('');
if (failures.length) {
  console.error(`水文计数器自测失败 ${failures.length} 项 / 共 ${passed + failures.length} 项`);
  for (const f of failures) console.error(`  ✗ ${f.label}: ${f.error.message}`);
  process.exit(1);
}
console.log(`水文计数器自测通过 · ${passed} 项（A2-1…A2-8 + 注入源码 2 项）`);
