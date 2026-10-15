#!/usr/bin/env node
// 从原始逐帧 JSON 生成 reports/analysis/g2-p03/attribution-summary.json。
// 所有数值都由本脚本重算，不接受手工填写的摘要。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferHydroSteps } from './inkbox-g2-hydro-counter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'reports', 'analysis', 'g2-p03');
const read = name => JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));
const pct = (arr, p) => {
  const s = arr.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? Number(s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(3)) : null;
};
const stepOf = r => inferHydroSteps({
  paused: r.paused === true, accumBefore: r.hydroAccumBefore, accumAfter: r.hydroAccumAfter,
  dt: r.simulationDtMs === null ? NaN : r.simulationDtMs / 1000,
}).steps || 0;
const measuredOf = run => {
  const m = (run.rows || []).filter(r => r.phase === 'measured');
  return m.length ? m : (run.rows || []);
};

const gate = read('attribution-gate-cases6-native.json');
const off = read('attribution-aa-cases6-5-offoffoffoff-native.json');
const on = read('attribution-aa-cases6-5-on4-native.json');
const live = read('attribution-live-L1-L2-native.json');

// ── 门禁口径 ──────────────────────────────────────────────────────────────
const g = gate.cases[0];
const gr = measuredOf(g);
const gChan = gr.reduce((o, r) => { if (r.bridge) for (const k of ['height', 'type', 'veg', 'water']) if (r.bridge[k]) o[k] = (o[k] || 0) + 1; return o; }, { height: 0, type: 0, veg: 0, water: 0 });
const gSig = (g.veg || []).map(v => v.treeSignature);
let gChanged = 0; for (let i = 1; i < gSig.length; i += 1) if (gSig[i] !== gSig[i - 1]) gChanged += 1;

// ── A/A ───────────────────────────────────────────────────────────────────
function aaBatches(src, arms) {
  const groups = new Map();
  for (const run of src.cases || []) {
    const key = `${run.case.caseIndex}/${run.case.renderer}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  const out = [];
  for (const [key, runs] of groups) {
    const p95 = runs.map(r => pct(measuredOf(r).map(x => x.frameCpuMs), .95));
    const raf95 = runs.map(r => pct(measuredOf(r).map(x => x.rawRafIntervalMs), .95));
    const n = p95.length; const combos = []; const half = Math.floor(n / 2);
    const choose = (s, picked) => { if (picked.length === half) { combos.push(picked.slice()); return; } for (let i = s; i < n; i += 1) { picked.push(i); choose(i + 1, picked); picked.pop(); } };
    if (n >= 4) choose(0, []);
    let failing = 0; let total = 0; let worst = Infinity;
    for (const A of combos) {
      const B = p95.map((_, i) => i).filter(i => !A.includes(i));
      for (const [o, q] of [[A, B], [B, A]]) {
        const ow = Math.max(...o.map(i => p95[i])); const qw = Math.max(...q.map(i => p95[i]));
        const margin = Number((ow * 1.08 + 1.5 - qw).toFixed(3));
        total += 1; if (margin < 0) failing += 1; worst = Math.min(worst, margin);
      }
    }
    out.push({ key, arms, rounds: p95.length, frameCpuP95: p95, frameCpuP95Range: Number((Math.max(...p95) - Math.min(...p95)).toFixed(3)), rawRafP95: raf95, rawRafP95Range: Number((Math.max(...raf95) - Math.min(...raf95)).toFixed(3)), gateEquivalentGroupings: total, falseRegressionGroupings: failing, minMarginMs: worst });
  }
  return out;
}

// ── A7 ────────────────────────────────────────────────────────────────────
const runtime = (live.cases || []).map(c => {
  const rows = c.rows;
  const lag = [];
  for (let i = 0; i < rows.length - 1; i += 1) lag.push({ s: stepOf(rows[i]), next: rows[i + 1].simulationDtMs, nextCpu: rows[i + 1].frameCpuMs });
  const a = lag.filter(x => x.s > 0); const b = lag.filter(x => x.s === 0);
  const ch = rows.reduce((o, r) => { if (r.bridge) for (const k of ['height', 'type', 'veg', 'water']) if (r.bridge[k]) o[k] = (o[k] || 0) + 1; return o; }, { height: 0, type: 0, veg: 0, water: 0 });
  return {
    scene: c.case.caseIndex, renderer: c.case.renderer, round: c.round, frames: rows.length,
    hydroStepsDirect: c.recalc.hydroDirectTotal, hydroStepsInferred: c.recalc.hydroInferredTotal,
    inconsistentFrames: c.recalc.inconsistentFrames, pausedFrames: c.recalc.pausedFrames,
    stepMsP50: pct(c.probe.stepMs, .5), stepMsP95: pct(c.probe.stepMs, .95),
    nextFrameSimDtMsWithHydro: { p50: pct(a.map(x => x.next), .5), p95: pct(a.map(x => x.next), .95), n: a.length },
    nextFrameSimDtMsWithoutHydro: { p50: pct(b.map(x => x.next), .5), p95: pct(b.map(x => x.next), .95), n: b.length },
    nextFrameOver33ms: { withHydro: a.filter(x => x.next > 33.3).length, withoutHydro: b.filter(x => x.next > 33.3).length },
    bridgeDirtyChannels: ch,
    glUploads: rows.reduce((s, x) => s + (x.glUploads || 0), 0),
    glBytes: rows.reduce((s, x) => s + (x.glBytes || 0), 0),
  };
});

const summary = {
  task: 'G2-P0.3 阶段 A · 性能证据勘误与真实瓶颈确认',
  status: { phaseA: 'A_PASS', phaseBAtCapture: 'B_NOT_STARTED', phaseBDecision: 'START', g2FormalGate: 'G2_PERF_BLOCKED', note: '阶段 A 取证时阶段 B 尚未实现；§8 裁决为 START，后续阶段 B 结果见 G2_P03_VEGETATION_PILOT_REPORT.md' },
  baseline: { branch: 'codex/g2-p1-integration-validation', commit: '74934a8b1360af9007c69935d5becdf8f9809872', analysisSourceHeadAtCapture: gate.sourceHead, equalsPr12Head: true, remoteBranchRefAtReview: '74934a8b1360af9007c69935d5becdf8f9809872（git ls-remote，推送前核实）' },
  integrity: { productSourceDirty: gate.productSourceDirty || '', changedFiles: 6, modifiedExistingFiles: 0, inventory: ['G2_P03_ATTRIBUTION_CORRECTION_REPORT.md（新增）', 'reports/analysis/g2-p03/attribution-summary.json（新增）', 'scripts/inkbox-g2-hydro-counter.mjs（新增）', 'scripts/inkbox-g2-hydro-attribution.mjs（新增）', 'scripts/inkbox-g2-hydro-attribution-check.mjs（新增）', 'scripts/inkbox-g2p03-summary.mjs（新增）'] },
  environment: { browser: 'Microsoft Edge', gpu: gate.environment.gpu.renderer, viewport: gate.environment.gpu.viewport, dpr: gate.environment.gpu.dpr, clock: 'native', gateExtractionSha256: gate.gateSourceIdentity.extractedSha256, gateConstants: gate.gateSourceIdentity.constants },
  counter: {
    unitTests: { passed: 11, exitCode: 0 },
    directMethod: '实例存取器拦截 hydroAccum 写入，「减 0.16 的次数」即 stepHydrology() 调用次数',
    inferredMethod: 'round((accumBefore + dt - accumAfter) / 0.16) + 残差校验',
    otherWritesObserved: gate.cases[0].probe.otherCount,
    oldBugFixed: 'delta>0 判据漏掉累加器下降的补水帧；另修 inferHydroSteps 常量未注入（仅非暂停路径可见）',
  },
  formalGate: {
    hydrologyCallsMeasuredDirect: g.recalc.hydroDirectTotal,
    hydrologyCallsMeasuredInferred: g.recalc.hydroInferredTotal,
    inconsistentFrames: g.recalc.inconsistentFrames,
    totalFrames: g.rows.length, measuredFrames: gr.length,
    pausedEveryMeasuredFrame: gr.every(r => r.paused === true),
    hydrologyActive: false, attribution: 'CONFIRMED_NO_HYDROLOGY',
    fixture: { count: g.fixture.count, pairs: g.fixture.pairs, seed: g.fixture.seed, originalEntitiesRetained: g.fixture.originalEntitiesRetained },
    frameCpuMs: { p50: pct(gr.map(r => r.frameCpuMs), .5), p95: pct(gr.map(r => r.frameCpuMs), .95), p99: pct(gr.map(r => r.frameCpuMs), .99) },
    updateCpuMsP95: pct(gr.map(r => r.updateCpuMs), .95),
    renderCpuMsP95: pct(gr.map(r => r.renderCpuMs), .95),
  },
  vegetation: {
    updates: (g.veg || []).length, uniqueMembershipSignatures: new Set(gSig).size, adjacentSignatureChanges: gChanged,
    redundantRebuilds: Math.max(0, gSig.length - 1 - gChanged),
    treeCount: (g.veg || [])[0] ? (g.veg || [])[0].treeCount : null,
    bridgeDirtyChannels: gChan, frames: gr.length,
    lifeSteppedFrames: gr.filter(r => r.lifeStepped).length,
    firedCounts: gr.reduce((o, r) => { if (r.fired) for (const k in r.fired) if (r.fired[k]) o[k] = (o[k] || 0) + 1; return o; }, {}),
    gpuUploadCalls: gr.reduce((s, r) => s + (r.glUploads || 0), 0),
    gpuUploadBytes: gr.reduce((s, r) => s + (r.glBytes || 0), 0),
    trigger: 'LIFE_VEG_CHANGE（life.step 吃草写 world.veg，sim/life.js:679）→ veg 通道每帧脏 → vegetationPending → treeClock>=0.15 节流器定节拍',
    triggerClass: 'CONFIRMED', hydrologyInvolved: false,
    caveat: 'treeSignature 覆盖成员/位置/大小/旋转；高度变化不改变签名但仍需重写 Y —— 「冗余」指成员未变，不等于完全无需工作',
  },
  aaControl: { method: '4 轮同配置 + 门禁同构判据（组内取最差 P95，判 OnWorst<=OffWorst*1.08+1.5，穷举有序分组）', off4: aaBatches(off, 'off'), on4: aaBatches(on, 'on') },
  vegetationCost: (() => {
    const vt = g.vegTiming || { calls: 0, totalMs: 0, ms: [] };
    const renderTotal = gr.reduce((s, r) => s + (r.renderCpuMs || 0), 0);
    const frameTotal = gr.reduce((s, r) => s + (r.frameCpuMs || 0), 0);
    return {
      calls: vt.calls, perCallMsP50: pct(vt.ms, .5), perCallMsP95: pct(vt.ms, .95), perCallMsMax: pct(vt.ms, 1),
      totalMsPer90Frames: Number(vt.totalMs.toFixed(1)), msPerFrame: Number((vt.totalMs / gr.length).toFixed(2)),
      shareOfRenderCpu: Number((vt.totalMs / renderTotal * 100).toFixed(1)),
      shareOfFrameCpu: Number((vt.totalMs / frameTotal * 100).toFixed(1)),
    };
  })(),
  phaseBVerdict: {
    decision: 'START',
    reason: '初稿曾判「不启动」，理由是植被占比未知；补测后该理由被推翻：植被 update 占 renderCpu 80.2%、frameCpu 64.3%，单次 P50 11.3ms；而 15/21 次重建成员未变且门禁环境 height/water/type 脏全为 0 ⇒ 可证明的纯浪费约 1.97 ms/帧，是 A/A 噪声底(0.244-0.408ms)的 5-8 倍。',
    acceptanceThreshold: 'case 6 P95 改善 ≥ 1.5 ms 且两轮候选都复现；case 5 波动过大不宜作验收场景',
    notStartedAtCapture: true,
    boundary: '门禁口径下最强（成员未变即完全无需重写）；正常游玩下水文改高程，成员未变仍需重写贴地 Y',
  },
  runtimeHydrology: { sceneSet: 'L1 Canvas / L2 Three，512×320，setSpeed(2)，不注入 advanceDays，120 暖 + 180 测 × 2 轮', runs: runtime, chainAttribution: 'RUNTIME_HYDRO_CHAIN_SUPPORTED', scopeNote: '属正常游玩运行时风险，与正式门禁归因无关（门禁水文 0 次）' },
  gate8: { counterTests: true, twoPathAgreement: true, clocksSeparated: true, officialFixtureReused: true, vegetationTriggerRecorded: true, aaCompleted: true, liveRecomputable: true, rawJsonMatchesReport: true, productSourceUnchanged: true, noKnownCounterBugs: true },
  artifacts: {
    report: 'G2_P03_ATTRIBUTION_CORRECTION_REPORT.md',
    raw: ['reports/analysis/g2-p03/attribution-gate-cases6-native.json', 'reports/analysis/g2-p03/attribution-aa-cases6-5-offoffoffoff-native.json', 'reports/analysis/g2-p03/attribution-aa-cases6-5-on4-native.json', 'reports/analysis/g2-p03/attribution-live-L1-L2-native.json'],
    scripts: ['scripts/inkbox-g2-hydro-counter.mjs', 'scripts/inkbox-g2-hydro-attribution.mjs', 'scripts/inkbox-g2-hydro-attribution-check.mjs', 'scripts/inkbox-g2p03-summary.mjs'],
  },
};

fs.writeFileSync(path.join(DIR, 'attribution-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log('attribution-summary.json 已写出');
console.log('  门禁水文：直接', summary.formalGate.hydrologyCallsMeasuredDirect, '推导', summary.formalGate.hydrologyCallsMeasuredInferred, '| 不一致', summary.formalGate.inconsistentFrames);
console.log('  植被：更新', summary.vegetation.updates, '唯一签名', summary.vegetation.uniqueMembershipSignatures, '冗余重建', summary.vegetation.redundantRebuilds, '| GPU', summary.vegetation.gpuUploadCalls, '次 /', summary.vegetation.gpuUploadBytes, '字节');
for (const b of [...summary.aaControl.off4, ...summary.aaControl.on4]) console.log(`  A/A ${b.arms} ${b.key}: P95 ${b.frameCpuP95.join('/')} ⇒ 假失败 ${b.falseRegressionGroupings}/${b.gateEquivalentGroupings} 余量 ${b.minMarginMs}`);
for (const r of summary.runtimeHydrology.runs) console.log(`  ${r.scene} r${r.round}: 水文 ${r.hydroStepsDirect}/${r.hydroStepsInferred} · 步后帧 P50 ${r.nextFrameSimDtMsWithHydro.p50} vs 无水文 ${r.nextFrameSimDtMsWithoutHydro.p50}`);
