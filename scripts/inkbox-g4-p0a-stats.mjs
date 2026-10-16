import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
export const quantile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
};
export function distribution(values) {
  if (!values.length) return { n: 0, p50: null, p95: null, p99: null };
  return { n: values.length, p50: quantile(values, .5), p95: quantile(values, .95), p99: quantile(values, .99),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    gt33_3Percent: values.filter(v => v > 33.3).length / values.length * 100,
    gt50Percent: values.filter(v => v > 50).length / values.length * 100,
    gt100Percent: values.filter(v => v > 100).length / values.length * 100,
    gt200Percent: values.filter(v => v > 200).length / values.length * 100 };
}
export function summarizeRun(result) {
  const summary = { raf: distribution(result.frames.map(f => f.rafIntervalMs)),
    hydroSteps: result.frames.reduce((sum, f) => sum + (f.hydroSteps ?? 0), 0),
    hydrologyMs: distribution(result.frames.map(f => f.hydrologyMs).filter(v => v !== null)),
    updateMs: distribution(result.frames.map(f => f.updateMs).filter(v => v !== null)),
    renderSubmitMs: distribution(result.frames.map(f => f.renderSubmitMs).filter(v => v !== null)),
    stageUpdateMs: distribution(result.frames.map(f => f.stageUpdateMs).filter(v => v !== null)),
    stageRenderMs: distribution(result.frames.map(f => f.stageRenderMs).filter(v => v !== null)),
    gpuMs: distribution(result.gpu?.samples?.map(f => f.gpuMs) ?? []), hydroFrameClasses: {} };
  for (const steps of [0, 1, 2, 3]) summary.hydroFrameClasses[steps] = distribution(result.frames.filter(f => f.hydroSteps === steps).map(f => f.rafIntervalMs));
  return summary;
}
export function persistRun(out, label, metadata, result) {
  const records = [{ kind: 'metadata', ...metadata },
    ...(result.warmupFrames ?? []).map(f => ({ kind: 'warmup-frame', ...f })),
    ...(result.frames ?? []).map(f => ({ kind: 'measured-frame', ...f })),
    ...((result.gpu?.samples ?? []).map(f => ({ kind: 'gpu-query', ...f }))),
    { kind: 'completion', ...Object.fromEntries(Object.entries(result).filter(([key]) => !['frames', 'warmupFrames'].includes(key))) }];
  const raw = records.map(value => JSON.stringify(value)).join('\n') + '\n';
  const bytes = gzipSync(raw, { level: 9 });
  const filename = `${label}.jsonl.gz`;
  fs.writeFileSync(path.join(out, filename), bytes);
  return { label, file: filename, sha256: sha256(bytes), rawSHA256: sha256(raw), bytes: bytes.length,
    samples: result.frames?.length ?? 0, warmupSamples: result.warmupFrames?.length ?? 0,
    variant: metadata.variant, map: metadata.map, renderer: metadata.renderer, mode: metadata.mode,
    status: metadata.status ?? 'COMPLETE', summary: result.frames?.length ? summarizeRun(result) : null };
}

export function assessPrimary(runs) {
  if (runs.length !== 4) return { status: 'INCONCLUSIVE', reason: 'INCOMPLETE_ABBA' };
  const pairs = [[runs[0], runs[1]], [runs[3], runs[2]]].map(([a, b]) => ({
    v0: a.label, v3: b.label, improvementMs: a.summary.raf.p95 - b.summary.raf.p95,
    p99IncreaseMs: b.summary.raf.p99 - a.summary.raf.p99,
    p99BudgetMs: Math.max(3, a.summary.raf.p99 * .1),
    gt50IncreasePercentagePoints: b.summary.raf.gt50Percent - a.summary.raf.gt50Percent,
  }));
  const improvements = pairs.map(p => p.improvementMs);
  const medianImprovementMs = (improvements[0] + improvements[1]) / 2;
  const tailRegression = pairs.some(p => p.p99IncreaseMs > p.p99BudgetMs + 1e-9 || p.gt50IncreasePercentagePoints > 1 + 1e-9);
  const worstV3P95 = Math.max(runs[1].summary.raf.p95, runs[2].summary.raf.p95);
  const clearBenefit = improvements.every(v => v >= 10) && (medianImprovementMs >= 20 || worstV3P95 <= 33.3);
  return { status: tailRegression ? 'INCONCLUSIVE' : clearBenefit ? 'PENDING_EVENTS' : 'INCONCLUSIVE',
    reason: tailRegression ? 'TAIL_REGRESSION' : clearBenefit ? 'S1_BENEFIT_AWAITS_S2' : 'S1_THRESHOLD_NOT_MET',
    pairs, medianImprovementMs, worstV3P95, clearBenefit, tailRegression };
}

// Independent evidence re-read, not a second performance run.
if (process.argv[1]?.endsWith('inkbox-g4-p0a-stats.mjs')) {
  const out = path.resolve(process.argv.find(v => v.startsWith('--out='))?.slice(6) ?? 'analysis/g4/p0a/results');
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  for (const run of manifest.runs) {
    const bytes = fs.readFileSync(path.join(out, run.file));
    if (sha256(bytes) !== run.sha256) throw new Error(`RAW_HASH_MISMATCH: ${run.label}`);
    const raw = gunzipSync(bytes).toString('utf8');
    if (sha256(raw) !== run.rawSHA256) throw new Error(`RAW_CONTENT_HASH_MISMATCH: ${run.label}`);
    const records = raw.trim().split('\n').map(JSON.parse), frames = records.filter(r => r.kind === 'measured-frame');
    if (frames.length !== run.samples) throw new Error(`SAMPLE_COUNT_MISMATCH: ${run.label}`);
    const raf = distribution(frames.map(f => f.rafIntervalMs));
    if (run.summary && JSON.stringify(raf) !== JSON.stringify(run.summary.raf)) throw new Error(`SUMMARY_MISMATCH: ${run.label}`);
    console.log(JSON.stringify({ label: run.label, samples: frames.length, sha256: run.sha256, raf }));
  }
}
