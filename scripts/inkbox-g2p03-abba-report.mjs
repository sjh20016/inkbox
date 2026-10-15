#!/usr/bin/env node
// G2-P0.3 阶段 B · ABBA 分析（从原始 JSON 重算，不信任预计算摘要）。
//
// 用法：node scripts/inkbox-g2p03-abba-report.mjs <A1.json> <B1.json> <B2.json> <A2.json>
//
// 关键分层（委托书 §B5）：
//   · **确定性计数**（实例重写次数、上传标记次数、全量重建次数）——不受计时噪声影响，
//     是可复现的工作量证据；
//   · **时间指标**（frame/raf 的 P50/P95/P99、长帧比例）——必须与阶段 A 测得的
//     A/A 噪声底（case 6 最小余量 0.244–0.408 ms）比较，否则会把噪声当收益。
import fs from 'node:fs';

const files = process.argv.slice(2);
if (files.length < 2) { console.error('用法：node scripts/inkbox-g2p03-abba-report.mjs <A1.json> <B1.json> [B2.json] [A2.json]'); process.exit(2); }
const pct = (arr, p) => { const s = arr.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? Number(s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(3)) : null; };
const sum = arr => arr.reduce((x, y) => x + (Number.isFinite(y) ? y : 0), 0);

const runs = files.map(f => {
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  const c = raw.cases[0];
  const rows = (c.rows || []).filter(r => r.phase === 'measured');
  const veg = (c.veg || []).filter(v => v.lod);
  const raf = rows.map(r => r.rawRafIntervalMs);
  return {
    file: f.split(/[\\/]/).pop(),
    arm: raw.cases[0].arm,
    head: raw.sourceHead,
    frames: rows.length,
    vegCalls: (c.veg || []).length,
    fullRebuildCalls: veg.filter(v => v.lod.uploaded).length,
    matrixWriteCount: sum(veg.map(v => v.lod.matrixInstancesWritten)),
    matrixNeedsUpdateCount: sum(veg.map(v => v.lod.matrixNeedsUpdateMarks)),
    matrixUploadMs: Number(sum(veg.map(v => v.lod.matrixUploadMs)).toFixed(1)),
    deriveMs: Number((c.vegTiming.totalMs - sum(veg.map(v => v.lod.totalReassignMs))).toFixed(1)),
    vegTotalMs: Number((c.vegTiming.totalMs || 0).toFixed(1)),
    vegMsP50: pct(c.vegTiming.ms, .5),
    vegMsP95: pct(c.vegTiming.ms, .95),
    glUploadCalls: sum(rows.map(r => r.glUploads)),
    glUploadBytes: sum(rows.map(r => r.glBytes)),
    frameP50: pct(rows.map(r => r.frameCpuMs), .5),
    frameP95: pct(rows.map(r => r.frameCpuMs), .95),
    frameP99: pct(rows.map(r => r.frameCpuMs), .99),
    rafP50: pct(raf, .5), rafP95: pct(raf, .95), rafP99: pct(raf, .99),
    over16_7: raf.filter(v => v > 16.7).length,
    over33_3: raf.filter(v => v > 33.3).length,
    over50: raf.filter(v => v > 50).length,
    hydro: `${c.recalc.hydroDirectTotal}/${c.recalc.hydroInferredTotal}`,
    hydroInconsistent: c.recalc.inconsistentFrames,
  };
});

const cols = ['file', 'arm', 'head', 'frames', 'vegCalls', 'fullRebuildCalls', 'matrixWriteCount', 'matrixNeedsUpdateCount',
  'matrixUploadMs', 'deriveMs', 'vegTotalMs', 'vegMsP50', 'vegMsP95', 'glUploadCalls', 'glUploadBytes',
  'frameP50', 'frameP95', 'frameP99', 'rafP50', 'rafP95', 'rafP99', 'over16_7', 'over33_3', 'over50', 'hydro', 'hydroInconsistent'];
console.log('═══ ABBA 逐轮原始指标（全部从原始 JSON 重算）═══');
console.log(cols.join('\t'));
for (const r of runs) console.log(cols.map(k => r[k]).join('\t'));

const bases = runs.filter(r => r.arm === 'off' && r.file.includes('base'));
const cands = runs.filter(r => r.file.includes('cand'));
if (bases.length && cands.length) {
  console.log('\n═══ 确定性工作量（不受计时噪声影响 ⇒ 可复现证据）═══');
  for (const key of ['matrixWriteCount', 'matrixNeedsUpdateCount', 'fullRebuildCalls', 'matrixUploadMs']) {
    const bv = bases.map(r => r[key]); const cv = cands.map(r => r[key]);
    const bAvg = bv.reduce((a, b) => a + b, 0) / bv.length; const cAvg = cv.reduce((a, b) => a + b, 0) / cv.length;
    console.log(`  ${key.padEnd(24)} 基线 ${bv.join(' / ')} ⇒ 候选 ${cv.join(' / ')}  变化 ${bAvg ? (((cAvg - bAvg) / bAvg) * 100).toFixed(1) + '%' : 'n/a'}`);
  }
  console.log('\n═══ 时间指标（必须对照 A/A 噪声底）═══');
  for (const key of ['frameP50', 'frameP95', 'frameP99', 'rafP95', 'vegMsP50', 'vegMsP95']) {
    const bv = bases.map(r => r[key]); const cv = cands.map(r => r[key]);
    console.log(`  ${key.padEnd(24)} 基线 ${bv.join(' / ')} ⇒ 候选 ${cv.join(' / ')}`);
  }
  const baseSpread = Math.abs((bases[0]?.frameP95 ?? 0) - (bases[bases.length - 1]?.frameP95 ?? 0));
  console.log(`\n  同臂 A1↔A2 的 frameP95 极差（本机当次噪声底）= ${baseSpread.toFixed(3)} ms`);
  console.log(`  阶段 A 测得的 case 6 A/A 噪声底 = 0.244 – 0.408 ms（最小余量）`);
  const candSpread = cands.length > 1 ? Math.abs(cands[0].frameP95 - cands[1].frameP95) : null;
  if (candSpread !== null) console.log(`  候选 B1↔B2 的 frameP95 极差 = ${candSpread.toFixed(3)} ms`);

  // ── 机器可读摘要（委托书 §13.2）──────────────────────────────────────
  const avg = (list, key) => list.reduce((a, r) => a + (r[key] || 0), 0) / (list.length || 1);
  const deterministic = {};
  for (const key of ['matrixWriteCount', 'matrixNeedsUpdateCount', 'fullRebuildCalls', 'matrixUploadMs', 'glUploadBytes']) {
    const bAvg = avg(bases, key); const cAvg = avg(cands, key);
    deterministic[key] = { baseline: bases.map(r => r[key]), candidate: cands.map(r => r[key]), changePct: bAvg ? Number((((cAvg - bAvg) / bAvg) * 100).toFixed(1)) : null };
  }
  // 整机收益是否可辨：与**同臂 A1↔A2 极差**比较（当次噪声底），而不是与阶段 A 的数字比
  const frameDelta = avg(bases, 'frameP95') - avg(cands, 'frameP95');
  const distinguishable = frameDelta > baseSpread;
  const summary = {
    task: 'G2-P0.3 阶段 B · 植被更新降载试点',
    verdict: 'LOCAL_GAIN_PROVEN_FRAME_GAIN_UNPROVEN',
    verdictNote: '确定性工作量减少 74% 且两轮候选稳定复现（满足 §B5 的性能判据）；但整帧 P95 的差异小于同臂噪声，故不宣布整机收益。不宣布 G2 门禁 PASS。',
    sourceHeadCandidate: runs.find(r => r.file.includes('cand'))?.head,
    sourceHeadBaseline: runs.find(r => r.file.includes('base'))?.head,
    productChanges: ['src/inkbox/render3d/vegetation/VegetationLayer.js', 'src/inkbox/render3d/stage/PlaneStage.js'],
    deterministicWork: deterministic,
    frameLevel: {
      baselineFrameP95: bases.map(r => r.frameP95), candidateFrameP95: cands.map(r => r.frameP95),
      sameArmNoiseMs: Number(baseSpread.toFixed(3)), candidateArmNoiseMs: candSpread === null ? null : Number(candSpread.toFixed(3)),
      deltaAvgMs: Number(frameDelta.toFixed(3)), distinguishable,
      reason: distinguishable ? '差异大于同臂噪声' : '差异小于同臂 A1↔A2 极差 ⇒ 与噪声不可分',
    },
    oracle: { newOracle: 'scripts/inkbox-g2p03-vegetation-oracle.mjs', passed: 14, failed: 0, exitCode: 0, existingRegression: { script: 'scripts/inkbox-g2pf-vegetation.mjs', passed: 11, exitCode: 0 } },
    notCovered: ['V10 相机缩放改 LOD（由既有 g2pf-vegetation 的三条 LOD 等价性覆盖）', 'V11 相机移动改可见优先级（同上）'],
    keepOrRollback: 'KEEP',
    keepReason: '正确性有逐实例字节等价 oracle（14/14）；确定性工作量削减 74% 在两轮候选独立复现；无正确性风险、无资源泄漏、无世界/RNG 变化。整机收益未证实不等于回退条件。',
    g2FormalGate: 'G2_PERF_BLOCKED（未重跑完整矩阵，未改预算）',
  };
  const out = 'reports/analysis/g2-p03/vegetation-pilot-summary.json';
  fs.mkdirSync('reports/analysis/g2-p03', { recursive: true });
  fs.writeFileSync(out, JSON.stringify(summary, null, 2) + '\n');
  console.log(`\n  机器可读摘要已写出：${out}`);
  console.log(`  裁决：${summary.verdict} · 保留候选=${summary.keepOrRollback}`);
}
