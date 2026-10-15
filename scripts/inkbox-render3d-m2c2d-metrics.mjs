#!/usr/bin/env node
// M2-C2D metrics gate: paired baseline/final comparison on identical World,
// advance state and camera. Reads the two browser runs' JSON only; never
// touches images or the product.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_DIR = path.resolve(process.env.INKBOX_C2D_BASE_DIR || 'reports/local/m2c2d/baseline');
const FINAL_DIR = path.resolve(process.env.INKBOX_C2D_FINAL_DIR || 'reports/local/m2c2d/final');
const read = dir => JSON.parse(fs.readFileSync(path.join(dir, 'browser.json'), 'utf8'));

// ── 判据口径 ──────────────────────────────────────────────────────────────
// 这是「近景绘画化**修正**」，不是重画一版美术。因此护栏以**相对不倒退**
// 为主，只配少量绝对下限（纸色与深墨必须真的出现在画面里）。
// 为什么不给每个 POI 定同一个绝对目标：基线自身在 5 个近景里就有 3 个
// 「深墨 L*≤30」不足 2%（崖壁 0.015 / 村落 0.000 / 上界断面 0.011），
// 把它设成统一硬指标等于要求超出委托范围的改画；真正要守住的是
// 「不得比基线更平、纸色不得消失、深墨不得倒退」。
const NEAR_SPAN_MIN = 40;            // 近景不得退化成一条窄灰带
const NEAR_SPAN_TOLERANCE = 5;       // 相对基线允许的噪声级回落
const NEAR_PAPER_MIN = 0.03;         // 纸色必须真的出现在画面里
const NEAR_PAPER_TOLERANCE = 0.02;
const DEEP_INK_BAND = [0.02, 0.12];  // 基线本就有深墨时，必须留在合理带内
const DEEP_INK_TOLERANCE = 0.005;
const SATURATION_TOLERANCE = 0.05;   // 水墨不能越画越艳
const OVERVIEW_SPAN_TOLERANCE = 5;   // 远景是回归守卫
const NETHER_DARK_L20_MAX = 0.15;    // 幽冥要「深」，但不能糊成一片死黑
const SPAN_NETHER_MIN = 45;
const NEAR_VIEWS = ['mortal-coast-near', 'mortal-cliff-near', 'mortal-settlement-near', 'upper-boundary-near', 'nether-boundary-near'];
const OVERVIEW_VIEWS = ['mortal-overview', 'upper-overview', 'nether-overview'];
const BOUNDARY_VIEWS = ['upper-boundary-near', 'nether-boundary-near'];

const baseline = read(BASE_DIR), final = read(FINAL_DIR);
const byKey = run => Object.fromEntries(run.views.map(entry => [entry.view, entry]));
const base = byKey(baseline), last = byKey(final);
const report = { suite: 'M2-C2D metrics gate', pass: false, baseline: BASE_DIR, final: FINAL_DIR, views: [], notes: [] };

assert.equal(Object.keys(base).length, 8, 'baseline 必须包含 8 个固定镜头');
assert.equal(Object.keys(last).length, 8, 'final 必须包含 8 个固定镜头');

const same = (a, b, digits = 6) => JSON.stringify(a.map(v => Number(v.toFixed(digits)))) === JSON.stringify(b.map(v => Number(v.toFixed(digits))));

for (const key of Object.keys(base)) {
  const before = base[key], after = last[key];
  assert(same(before.camera.position, after.camera.position), `${key}: 相机位置必须一致`);
  assert(same(before.camera.target, after.camera.target), `${key}: 相机目标必须一致`);
  assert.equal(before.camera.zoom, after.camera.zoom, `${key}: 相机 zoom 必须一致`);
  assert.equal(before.worldSHA256, after.worldSHA256, `${key}: World 必须逐字一致`);
  if (before.measurement?.worldDigest && after.measurement?.worldDigest)
    assert.equal(before.measurement.worldDigest, after.measurement.worldDigest, `${key}: World+advance digest 必须一致`);
  else report.notes.push(`${key}: GPU 计时不可用，World 身份改由 setup 阶段的 SHA-256 逐字比对（已通过）`);
  // 预算：draw call 与三角形不得因本阶段增加。
  assert(after.gpu.drawCalls <= before.gpu.drawCalls, `${key}: draw call 不得增加（${before.gpu.drawCalls} → ${after.gpu.drawCalls}）`);
  if (BOUNDARY_VIEWS.includes(key)) {
    // 界缘是唯一 `DoubleSide + transparent` 的层。legacy MeshLambertMaterial 的
    // `forceSinglePass=false` 会让 THREE 画两遍（背面 + 正面）；换成 ShaderMaterial
    // 后 `forceSinglePass=true`（three.core.js 里 ShaderMaterial 的默认值）只画一遍，
    // 于是恰好少 `boundaryStats.triangles` 个三角形。几何契约由下面的
    // boundaryStats 逐字比对单独钉住，这里只要求「不增加」。
    assert(after.gpu.triangles <= before.gpu.triangles, `${key}: 三角形数不得增加（${before.gpu.triangles} → ${after.gpu.triangles}）`);
    if (after.gpu.triangles < before.gpu.triangles)
      report.notes.push(`${key}: 三角形 ${before.gpu.triangles} → ${after.gpu.triangles}（ShaderMaterial.forceSinglePass=true 取消了 DoubleSide+transparent 的第二遍；几何契约见 boundaryStats 比对）`);
    // 几何 / zero-gap / 拾取反查契约必须逐字不变。
    assert(before.boundaryStats && after.boundaryStats, `${key}: boundaryStats 缺失`);
    assert.deepEqual(after.boundaryStats, before.boundaryStats, `${key}: 界缘几何契约必须逐字一致`);
  } else {
    assert.equal(after.gpu.triangles, before.gpu.triangles, `${key}: 三角形数不得改变（${before.gpu.triangles} → ${after.gpu.triangles}）`);
  }
  const b = before.metrics, a = after.metrics;
  const record = { view: key, baseline: { span: b.lstarSpan, nearPaper: b.nearPaperRatio, dark30: b.darkRatioL30, dark20: b.darkRatioL20, saturation: b.meanSaturation },
    final: { span: a.lstarSpan, nearPaper: a.nearPaperRatio, dark30: a.darkRatioL30, dark20: a.darkRatioL20, saturation: a.meanSaturation },
    gpu: { calls: [before.gpu.drawCalls, after.gpu.drawCalls], triangles: [before.gpu.triangles, after.gpu.triangles],
      medianMs: [before.measurement?.gpuRenderMs?.median ?? null, after.measurement?.gpuRenderMs?.median ?? null],
      p95Ms: [before.measurement?.gpuRenderMs?.p95 ?? null, after.measurement?.gpuRenderMs?.p95 ?? null] } };
  report.views.push(record);
  if (key === 'nether-boundary-near') {
    assert(a.darkRatioL20 <= NETHER_DARK_L20_MAX, `${key}: L*<20 占比必须 ≤ ${NETHER_DARK_L20_MAX}（实际 ${a.darkRatioL20.toFixed(3)}）`);
    assert(a.lstarSpan >= SPAN_NETHER_MIN, `${key}: 明度跨度必须 ≥ ${SPAN_NETHER_MIN}（实际 ${a.lstarSpan.toFixed(1)}）`);
    assert(a.meanSaturation <= b.meanSaturation + SATURATION_TOLERANCE, `${key}: 平均饱和度不得明显升高（${b.meanSaturation.toFixed(3)} → ${a.meanSaturation.toFixed(3)}）`);
  } else if (NEAR_VIEWS.includes(key)) {
    assert(a.lstarSpan >= b.lstarSpan - NEAR_SPAN_TOLERANCE, `${key}: 明度跨度不得比基线更窄（基线 ${b.lstarSpan.toFixed(1)} → ${a.lstarSpan.toFixed(1)}）`);
    assert(a.lstarSpan >= NEAR_SPAN_MIN, `${key}: 近景明度跨度必须 ≥ ${NEAR_SPAN_MIN}（实际 ${a.lstarSpan.toFixed(1)}）`);
    assert(a.nearPaperRatio >= NEAR_PAPER_MIN, `${key}: 纸色必须出现在画面里（≥${NEAR_PAPER_MIN}，实际 ${a.nearPaperRatio.toFixed(3)}）`);
    assert(a.nearPaperRatio >= b.nearPaperRatio - NEAR_PAPER_TOLERANCE, `${key}: 纸色不得丢失（基线 ${b.nearPaperRatio.toFixed(3)} → ${a.nearPaperRatio.toFixed(3)}）`);
    assert(a.darkRatioL30 >= b.darkRatioL30 - DEEP_INK_TOLERANCE, `${key}: 深墨不得倒退（基线 ${b.darkRatioL30.toFixed(3)} → ${a.darkRatioL30.toFixed(3)}）`);
    if (b.darkRatioL30 >= DEEP_INK_BAND[0])
      assert(a.darkRatioL30 >= DEEP_INK_BAND[0] && a.darkRatioL30 <= DEEP_INK_BAND[1],
        `${key}: 基线已有深墨，必须留在 ${DEEP_INK_BAND.join('~')}（实际 ${a.darkRatioL30.toFixed(3)}）`);
    assert(a.meanSaturation <= b.meanSaturation + SATURATION_TOLERANCE, `${key}: 平均饱和度不得明显升高（${b.meanSaturation.toFixed(3)} → ${a.meanSaturation.toFixed(3)}）`);
    report.notes.push(`${key}: 跨度 ${b.lstarSpan.toFixed(1)} → ${a.lstarSpan.toFixed(1)}；纸色 ${b.nearPaperRatio.toFixed(3)} → ${a.nearPaperRatio.toFixed(3)}；深墨 L*≤30 ${b.darkRatioL30.toFixed(3)} → ${a.darkRatioL30.toFixed(3)}`);
  } else if (OVERVIEW_VIEWS.includes(key)) {
    assert(a.lstarSpan >= b.lstarSpan - OVERVIEW_SPAN_TOLERANCE, `${key}: 远景明度跨度不得倒退（${b.lstarSpan.toFixed(1)} → ${a.lstarSpan.toFixed(1)}）`);
    assert(a.meanSaturation <= b.meanSaturation + SATURATION_TOLERANCE, `${key}: 远景饱和度不得明显升高`);
    report.notes.push(`${key}: 远景跨度 ${b.lstarSpan.toFixed(1)} → ${a.lstarSpan.toFixed(1)}，纸色亮部 ${b.nearPaperRatio.toFixed(3)} → ${a.nearPaperRatio.toFixed(3)}`);
  }
  const medianDelta = (after.measurement?.gpuRenderMs?.median ?? null) - (before.measurement?.gpuRenderMs?.median ?? null);
  const p95Delta = (after.measurement?.gpuRenderMs?.p95 ?? null) - (before.measurement?.gpuRenderMs?.p95 ?? null);
  // GPU 预算：draw call / 三角形是硬约束（上面已钉）；GPU 耗时给一个可解释的
  // 上界。P2 的低频法线在地形片元里多取 4 个高度 tap，最重的近景（村落）
  // 实测 +1.80ms median，仍在 60fps 帧预算（16.7ms）内；P3 把界缘从两遍
  // 降到一遍，上界断面的 p95 反而降了 2.2ms。
  if (Number.isFinite(medianDelta)) assert(medianDelta <= 2.0, `${key}: GPU median 增量必须 ≤ +2.0ms（实际 ${medianDelta.toFixed(2)}）`);
  if (Number.isFinite(p95Delta)) assert(p95Delta <= 2.5, `${key}: GPU p95 增量必须 ≤ +2.5ms（实际 ${p95Delta.toFixed(2)}）`);
  if (Number.isFinite(medianDelta) && Math.abs(medianDelta) >= 0.5)
    report.notes.push(`${key}: GPU median ${medianDelta > 0 ? '+' : ''}${medianDelta.toFixed(2)}ms（${before.measurement.gpuRenderMs.median.toFixed(2)} → ${after.measurement.gpuRenderMs.median.toFixed(2)}）`);
}

// `advanceState` 是**开机帧时序**的节流累加器（`{upper,nether,rift,wraith,eco,fire}`），
// 既不属于 World 也不入档（`io/` / `core/` 里没有它）。`setSpeed(0)` 之后它在一次运行内
// 恒定，但两次独立开机残留的余数不同 ⇒ 不能跨运行比对。这里改钉真正有意义的不变量：
// 每次运行内必须只有一个值（若某次改动让它在镜头间漂移，这条会红）。
report.advanceState = { baseline: [...new Set(baseline.views.map(v => v.advanceStateSHA256))],
  final: [...new Set(final.views.map(v => v.advanceStateSHA256))] };
assert.equal(report.advanceState.baseline.length, 1, 'baseline: advanceState 必须在一次运行内恒定');
assert.equal(report.advanceState.final.length, 1, 'final: advanceState 必须在一次运行内恒定');
report.notes.push('advanceState 是开机帧时序累加器（不入档）；World 身份改由 worldSHA256 逐字比对');

report.textureDelta = final.views.map(entry => ({ view: entry.view, textures: entry.gpu.memory.textures }));
report.gpuTimingUnavailable = { baseline: baseline.gpuTimingUnavailable || [], final: final.gpuTimingUnavailable || [] };
report.pass = true;
fs.mkdirSync(path.join(ROOT, 'reports/local/m2c2d'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports/local/m2c2d/metrics-gate.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`M2-C2D metrics gate: PASS over ${report.views.length} paired views`);
for (const note of report.notes) console.log(`  · ${note}`);
