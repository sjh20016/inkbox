#!/usr/bin/env node
// Offline diagnostic for archived inkbox-g2-performance.mjs metrics.json files.
// This tool does not launch a browser, touch product code, set acceptance gates,
// or modify the original report. RAF/native callback intervals are not GPU time.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const VERSION = 1;
const THRESHOLDS_MS = [16.7, 33.3, 50];
const HELP = `Usage: node scripts/inkbox-g2p02-fluency.mjs --input PATH [--input PATH ...] --output DIR [--check]\n\nOffline analysis of one or more inkbox-g2-performance.mjs metrics.json reports.\nWrites fluency-analysis.json and fluency-analysis.md. --check verifies synthetic\npercentile, threshold-share, and long-frame streak examples without a browser/GPU.`;

function percentile(values, p) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const position = (xs.length - 1) * p;
  const lo = Math.floor(position), hi = Math.ceil(position);
  return xs[lo] + (xs[hi] - xs[lo]) * (position - lo);
}

function stats(values) {
  const xs = values.filter(Number.isFinite);
  if (!xs.length) return { n: 0, p50: null, p95: null, p99: null, max: null };
  return {
    n: xs.length,
    p50: percentile(xs, 0.5),
    p95: percentile(xs, 0.95),
    p99: percentile(xs, 0.99),
    max: Math.max(...xs),
  };
}

function frameStats(frames, key) {
  return stats(frames.map((frame) => frame?.[key]));
}

function thresholdSummary(values, threshold) {
  const xs = values.filter(Number.isFinite);
  let streaks = [], streak = 0;
  for (const value of xs) {
    if (value > threshold) streak++;
    else if (streak) { streaks.push(streak); streak = 0; }
  }
  if (streak) streaks.push(streak);
  const distribution = {};
  for (const length of streaks) distribution[length] = (distribution[length] || 0) + 1;
  const count = xs.filter((value) => value > threshold).length;
  return {
    thresholdMs: threshold,
    count,
    fraction: xs.length ? count / xs.length : null,
    percent: xs.length ? count / xs.length * 100 : null,
    longestStreak: streaks.length ? Math.max(...streaks) : 0,
    streakCount: streaks.length,
    streakLengthDistribution: distribution,
  };
}

function pearson(pairs) {
  if (pairs.length < 2) return null;
  const xs = pairs.map(([x]) => x), ys = pairs.map(([, y]) => y);
  const xm = xs.reduce((a, b) => a + b, 0) / xs.length;
  const ym = ys.reduce((a, b) => a + b, 0) / ys.length;
  let numerator = 0, xx = 0, yy = 0;
  for (let i = 0; i < pairs.length; i++) {
    const dx = xs[i] - xm, dy = ys[i] - ym;
    numerator += dx * dy; xx += dx * dx; yy += dy * dy;
  }
  return xx && yy ? numerator / Math.sqrt(xx * yy) : null;
}

function gpuAnalysis(run) {
  const timing = run.gpuTiming;
  if (!timing) return { supported: null, available: false, validSamples: 0, invalidSamples: 0, ms: stats([]), disjointObserved: null, pendingAtEnd: null, scope: null };
  const samples = Array.isArray(timing.samples) ? timing.samples : [];
  const valid = samples.filter((sample) => sample?.valid === true && Number.isFinite(sample.ms));
  return {
    supported: timing.supported ?? null,
    available: valid.length > 0,
    validSamples: valid.length,
    invalidSamples: samples.length - valid.length,
    ms: stats(valid.map((sample) => sample.ms)),
    disjointObserved: timing.disjointObserved ?? null,
    pendingAtEnd: timing.pendingAtEnd ?? null,
    scope: timing.scope ?? null,
  };
}

function analyzeRun(run, runIndex, report, caseInfo, source) {
  const frames = Array.isArray(run.frameTimings) ? run.frameTimings : [];
  const cpuNames = ['cpu', 'conservativeWrapperCpu', 'completeWrapperCpu', 'advance', 'update', 'render', 'webglSubmission'];
  const cpu = Object.fromEntries(cpuNames.map((key) => [key, frameStats(frames, key)]));
  const nativeRaf = frameStats(frames, 'raf');
  const nativeCallback = frameStats(frames, 'nativeCallbackInterval');
  const cadence = {
    nativeRafInterval: Object.fromEntries(THRESHOLDS_MS.map((threshold) => [String(threshold), thresholdSummary(frames.map((frame) => frame?.raf), threshold)])),
    nativeCallbackInterval: Object.fromEntries(THRESHOLDS_MS.map((threshold) => [String(threshold), thresholdSummary(frames.map((frame) => frame?.nativeCallbackInterval), threshold)])),
  };
  // For frame i, correlate CPU from frame i-1 with the native callback interval ending at i.
  // This is a descriptive adjacent-frame association and has no GPU-time interpretation.
  const adjacentPairs = [];
  for (let i = 1; i < frames.length; i++) {
    const previousCpu = frames[i - 1]?.completeWrapperCpu ?? frames[i - 1]?.cpu;
    const currentInterval = frames[i]?.nativeCallbackInterval;
    if (Number.isFinite(previousCpu) && Number.isFinite(currentInterval)) adjacentPairs.push([previousCpu, currentInterval]);
  }
  const gpu = gpuAnalysis(run);
  return {
    identity: {
      report: source,
      caseIndex: caseInfo.caseIndex,
      preset: caseInfo.preset ?? null,
      renderer: run.renderer ?? caseInfo.renderer ?? null,
      scenario: caseInfo.scenario ?? 'unspecified',
      view: caseInfo.view ?? null,
      count: caseInfo.count ?? null,
      mode: run.mode ?? null,
      runIndex,
      surface: report.method?.surface ?? report.environment?.surface ?? null,
      presentationClock: report.method?.presentationClock ?? null,
      webglHardware: report.environment?.webgl ?? null,
    },
    sampleCount: frames.length,
    frameTimings: {
      nativeRafIntervalMs: nativeRaf,
      nativeCallbackIntervalMs: nativeCallback,
      cpuMs: cpu,
      longFrames: cadence,
      previousFrameCompleteWrapperCpuVsCurrentNativeInterval: {
        n: adjacentPairs.length,
        pearson: pearson(adjacentPairs),
        interpretation: 'Diagnostic adjacency only; not GPU time and not a causal attribution.',
      },
    },
    gpuQuery: gpu,
  };
}

function collectInputPaths(input) {
  const resolved = path.resolve(input);
  if (!fs.existsSync(resolved)) throw new Error(`Input does not exist: ${input}`);
  const stat = fs.statSync(resolved);
  if (stat.isFile()) return [resolved];
  if (!stat.isDirectory()) throw new Error(`Input is not a file or directory: ${input}`);
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name === 'metrics.json') found.push(full);
    }
  };
  walk(resolved);
  return found.sort();
}

function loadReport(file) {
  let report;
  try { report = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`Cannot parse ${file}: ${error.message}`); }
  if (!report || !Array.isArray(report.cases)) throw new Error(`Not an inkbox-g2-performance report (missing cases[]): ${file}`);
  const digest = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const source = { file: path.join(path.basename(path.dirname(file)), path.basename(file)), sha256: digest };
  const cases = report.cases.map((caseResult, position) => {
    const caseIndex = caseResult.caseIndex ?? position;
    return {
    identity: {
      caseIndex,
      preset: caseResult.preset ?? null,
      renderer: caseResult.renderer ?? null,
      scenario: caseResult.scenario ?? 'unspecified',
      view: caseResult.view ?? null,
      count: caseResult.count ?? null,
    },
    originalResult: {
      pass: caseResult.pass ?? null,
      performanceChecks: caseResult.performanceChecks ?? [],
      diagnosticComparisons: caseResult.diagnosticComparisons ?? [],
      scenarioErrors: caseResult.scenarioErrors ?? [],
      failure: caseResult.failure ?? null,
      runs: (caseResult.runs ?? []).map((run, runIndex) => analyzeRun(run, runIndex, report, { ...caseResult, caseIndex }, source)),
    },
  };
  });
  return {
    identity: source,
    reportMetadata: {
      startedAt: report.startedAt ?? null,
      finishedAt: report.finishedAt ?? null,
      productionHead: report.productionHead ?? null,
      priorInstrumentProductionHead: report.priorInstrumentProductionHead ?? null,
      priorInstrumentHash: report.priorInstrumentHash ?? null,
      sourceHashes: report.sourceHashes ?? {},
      method: report.method ?? {},
      environment: report.environment ?? {},
      pass: report.pass ?? null,
      exitCode: Object.hasOwn(report, 'exitCode') ? report.exitCode : null,
      acceptanceEligible: report.acceptanceEligible ?? report.method?.acceptanceEligible ?? null,
      failure: report.failure ?? null,
      browserErrors: report.environment?.browserErrors ?? [],
      browserErrorCount: report.environment?.browserErrorCount ?? null,
      cleanup: {
        edgeExitEvidence: report.environment?.edgeExitEvidence ?? null,
        edgeExited: report.environment?.edgeExited ?? null,
        profileCleanupEvidence: report.environment?.profileCleanupEvidence ?? null,
        ownedBrowserProcessesExited: report.environment?.ownedBrowserProcessesExited ?? null,
        profileRemoved: report.environment?.profileRemoved ?? null,
        serverExitEvidence: report.environment?.serverExitEvidence ?? null,
        serverExited: report.environment?.serverExited ?? null,
      },
      caseCount: report.cases.length,
      casesWithoutRuns: report.cases.filter((item) => !Array.isArray(item.runs) || !item.runs.length).map((item) => ({ preset: item.preset, renderer: item.renderer, scenario: item.scenario ?? 'unspecified', view: item.view, count: item.count })),
    },
    cases,
  };
}

function runCheck() {
  const values = [10, 20, 30, 40];
  const q = [16, 34, 10, 35, 35, 10];
  const p = [percentile(values, 0.5), percentile(values, 0.95), percentile(values, 0.99)];
  if (p.some((value, i) => Math.abs(value - [25, 38.5, 39.7][i]) > 1e-10)) throw new Error(`Percentile check failed: ${p}`);
  const thresholds = thresholdSummary(q, 33.3);
  if (thresholds.count !== 3 || thresholds.fraction !== 0.5 || thresholds.longestStreak !== 2 || JSON.stringify(thresholds.streakLengthDistribution) !== JSON.stringify({ 1: 1, 2: 1 })) throw new Error(`Threshold/streak check failed: ${JSON.stringify(thresholds)}`);
  const selectedCases = [{ caseIndex: 9 }, { caseIndex: 10 }];
  const selectedIndexes = selectedCases.map((item, position) => item.caseIndex ?? position);
  if (JSON.stringify(selectedIndexes) !== JSON.stringify([9, 10])) throw new Error(`Partial caseIndex check failed: ${selectedIndexes}`);
  const fullCases = [{}, {}, {}];
  const fullIndexes = fullCases.map((item, position) => item.caseIndex ?? position);
  if (JSON.stringify(fullIndexes) !== JSON.stringify([0, 1, 2])) throw new Error(`Full-matrix fallback check failed: ${fullIndexes}`);
  return { percentile: p, threshold: thresholds, caseIndexes: { partialSelection: selectedIndexes, fullMatrixFallback: fullIndexes } };
}

function mdEscape(value) { return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' '); }
function renderMarkdown(output) {
  const lines = [
    '# Inkbox G2-P0.2 Fluency Offline Diagnostic',
    '',
    `Generated: ${output.generatedAt}`, '',
    '> Offline diagnostic only. It does not change product behavior or any formal measurement/acceptance threshold. RAF/native callback intervals are not GPU time.', '',
    `Reports: ${output.reports.length} · independent case/mode/run observations: ${output.reports.reduce((n, report) => n + report.cases.reduce((m, c) => m + c.originalResult.runs.length, 0), 0)}`, '',
    '| Report | Case | Renderer / scenario | Surface / clock | Mode | Run | RAF P95 / max (ms) | >16.7 / >33.3 / >50 ms frames | Complete CPU P95 (ms) | WebGL submit P95 (ms) | GPU query valid n / P95 (ms) | Original budget result |',
    '|---|---:|---|---|---|---:|---:|---|---:|---:|---:|---|',
  ];
  for (const report of output.reports) for (const item of report.cases) {
    for (const run of item.originalResult.runs) {
      const cadence = run.frameTimings.longFrames.nativeRafInterval;
      const ratio = (key) => `${cadence[key].count}/${run.sampleCount} (${cadence[key].percent == null ? 'n/a' : cadence[key].percent.toFixed(1) + '%'})`;
      const id = run.identity;
      lines.push(`| ${mdEscape(id.report.file)} | ${id.caseIndex} | ${mdEscape(`${id.renderer}/${id.scenario}`)} | ${mdEscape(`${id.surface ?? 'unknown'}/${id.presentationClock ?? 'unknown'}`)} | ${mdEscape(id.mode)} | ${id.runIndex} | ${run.frameTimings.nativeRafIntervalMs.p95?.toFixed(2) ?? 'n/a'} / ${run.frameTimings.nativeRafIntervalMs.max?.toFixed(2) ?? 'n/a'} | ${ratio('16.7')}; ${ratio('33.3')}; ${ratio('50')} | ${run.frameTimings.cpuMs.completeWrapperCpu.p95?.toFixed(2) ?? 'n/a'} | ${run.frameTimings.cpuMs.webglSubmission.p95?.toFixed(2) ?? 'n/a'} | ${run.gpuQuery.validSamples} / ${run.gpuQuery.ms.p95?.toFixed(2) ?? 'n/a'} | ${id.mode == null ? 'unknown' : mdEscape(item.originalResult.pass)}`);
    }
  }
  if (!output.reports.length) lines.push('| _No metrics reports found_ | | | | | | | | | | | |');
  lines.push('', 'Original `performanceChecks`, report errors, source hashes, environment, and cleanup evidence are retained in the JSON. Runs are never averaged or selected by best result.', '');
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { inputs: [], output: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') { if (!argv[i + 1]) throw new Error(`${arg} needs a path`); args.inputs.push(argv[++i]); }
    else if (arg === '--output' || arg === '-o') { if (!argv[i + 1]) throw new Error(`${arg} needs a directory`); args.output = argv[++i]; }
    else if (arg === '--check') args.check = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }
  if (args.check) console.log(`--check PASS ${JSON.stringify(runCheck())}`);
  if (!args.inputs.length && args.check) return;
  if (!args.inputs.length || !args.output) throw new Error('--input and --output are required unless only --check is used');
  const files = [...new Set(args.inputs.flatMap(collectInputPaths))];
  if (!files.length) throw new Error('No metrics.json files found in the provided input path(s)');
  const reports = files.map(loadReport);
  const output = {
    schema: 'inkbox-g2p02-fluency-analysis',
    version: VERSION,
    generatedAt: new Date().toISOString(),
    purpose: 'Offline fluency diagnostics for integration preparation; not a release gate.',
    methodology: {
      percentile: 'Sorted linear interpolation at p*(n-1).',
      longFrameThresholdsMs: THRESHOLDS_MS,
      frameIntervals: 'raf is the native requestAnimationFrame timestamp delta; nativeCallbackInterval is measured independently with performance.now().',
      gpu: 'GPU timer query statistics use only samples marked valid; missing queries remain unavailable, never inferred from RAF or CPU.',
      comparisons: 'No cross-report, renderer, scenario, mode, surface, clock, hardware, or run pooling. No best-run selection.',
      adjacentCpuAssociation: 'Pearson correlation of previous frame completeWrapperCpu (fallback: cpu) against the current frame nativeCallbackInterval; descriptive only, never GPU time.',
      thresholdsAffectAcceptance: false,
    },
    reports,
  };
  const outDir = path.resolve(args.output);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'fluency-analysis.json');
  const mdPath = path.join(outDir, 'fluency-analysis.md');
  fs.writeFileSync(jsonPath, JSON.stringify(output));
  fs.writeFileSync(mdPath, renderMarkdown(output));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  for (const report of reports) for (const item of report.cases) for (const run of item.originalResult.runs) {
    const id = run.identity;
    console.log(`${id.report.file} case#${id.caseIndex} ${id.renderer}/${id.scenario} ${id.surface ?? 'unknown'} ${id.mode ?? 'unknown'} run#${id.runIndex}: RAF p95=${run.frameTimings.nativeRafIntervalMs.p95?.toFixed(2) ?? 'n/a'}ms, >16.7ms=${run.frameTimings.longFrames.nativeRafInterval['16.7'].count}/${run.sampleCount}, originalPass=${item.originalResult.pass}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.message); console.error(HELP); process.exitCode = 1; }
}
