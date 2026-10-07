#!/usr/bin/env node
// Offline evidence only. Safety PASS never means art acceptance.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAFETY = Object.freeze({ dark20Max: .40, saturationRiseMax: .20,
  whitePaperMax: .98, spanRetainedMin: .45, gpuCatastropheRatio: 2, gpuCatastropheExtraMs: 5 });
const diagnostic = v => ({ nearPaper: v.metrics?.nearPaperRatio, dark30: v.metrics?.darkRatioL30,
  dark20: v.metrics?.darkRatioL20, span: v.metrics?.lstarSpan, saturation: v.metrics?.meanSaturation,
  localContrast: v.metrics?.localContrast ?? null, edgeDensity: v.metrics?.edgeDensity ?? null,
  highFreqEnergy: v.metrics?.highFreqEnergy ?? null, lowFreqEnergy: v.metrics?.lowFreqEnergy ?? null });
const rounded = v => v?.map(n => Number(n.toFixed(6)));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const finite = v => typeof v === 'number' && Number.isFinite(v);

export function compareRuns(runs, { partial = false } = {}) {
  const report = { suite: 'M2-C2D.1 Safety Gate + Art Diagnostics', safetyGate: { status: 'pending', thresholds: SAFETY, failures: [] },
    artDiagnostics: { status: 'human-review-required', acceptance: null, note: 'No metric certifies painterly quality.', views: [] },
    contracts: [], coverage: {}, performance: { target: 'candidate GPU median <= same-machine C2D, no tolerance', status: 'pending', views: [],
      note: 'A single paired run records observed timing. Repeat serial paired captures to investigate variance; positive deltas are never waived.' }, notes: [] };
  const fail = (message) => report.safetyGate.failures.push(message);
  const maps = Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, new Map(run.views.map(v => [v.view, v]))]));
  for (const [name, run] of Object.entries(runs)) {
    report.coverage[name] = { count: run.views.length, expected: partial ? 'explicit subset' : 12,
      complete: partial || run.views.length === 12 };
    if (maps[name].size !== run.views.length) fail(`${name}: duplicate views`);
    if (!(run.captureComplete ?? run.pass)) fail(`${name}: capture incomplete`);
    if ((run.pendingGlErrors || []).length) fail(`${name}: pending GL errors`);
    // Re-importing a save can reset the unsaved advance accumulator. Compare
    // only one import epoch; every fresh capture also records its before/after.
    const epochs = new Map();
    for (const v of run.views) {
      if (!v.worldSHA256 || !v.advanceStateSHA256) fail(`${name}/${v.view}: missing identity`);
      if (v.captureIdentity && (v.captureIdentity.world !== v.worldSHA256 || v.captureIdentity.advance !== v.advanceStateSHA256))
        fail(`${name}/${v.view}: identity drift during capture`);
      if (v.importEpoch === undefined) continue;
      if (!epochs.has(v.importEpoch)) epochs.set(v.importEpoch, []);
      epochs.get(v.importEpoch).push(v);
    }
    for (const [epoch, values] of epochs) if (new Set(values.map(v => v.advanceStateSHA256)).size > 1)
      fail(`${name}/import-${epoch}: advance drift`);
    if (run.views.some(v => v.importEpoch === undefined)) report.notes.push(`${name}: legacy capture has no import epochs; no cross-import advance assertion.`);
  }
  if (partial) {
    if ([...maps.candidate.keys()].some(key => !maps.c2d.has(key))) fail('step experiment has no matching C2D reference');
  } else if (!equal([...maps.c2d.keys()].sort(), [...maps.candidate.keys()].sort())) fail('C2D/candidate view sets differ');
  if (!partial && (!report.coverage.c2d.complete || !report.coverage.candidate.complete)) fail('C2D/candidate require 12 views; --partial explicitly selects a step experiment');
  if (!partial && !report.coverage.main?.complete) fail('main reference requires the same 12 fresh views');
  for (const key of maps.candidate.keys()) {
    report.artDiagnostics.views.push({ view: key, ...Object.fromEntries(Object.entries(maps).map(([name, m]) => [name, m.has(key) ? diagnostic(m.get(key)) : null])) });
  }
  for (const [beforeName, afterName] of [['main', 'c2d'], ['main', 'candidate'], ['c2d', 'candidate']]) {
    if (!maps[beforeName]) continue;
    for (const [key, a] of maps[afterName]) {
      const b = maps[beforeName].get(key); if (!b) continue;
      const pair = `${beforeName}/${afterName}/${key}`;
      const checks = { world: !!a.worldSHA256 && a.worldSHA256 === b.worldSHA256,
        camera: !!a.camera?.position && !!b.camera?.position && !!a.camera?.target && !!b.camera?.target && finite(a.camera?.zoom) && equal(rounded(a.camera?.position), rounded(b.camera?.position)) && equal(rounded(a.camera?.target), rounded(b.camera?.target)) && a.camera?.zoom === b.camera?.zoom,
        poi: equal(a.poi, b.poi), framebuffer: equal(a.metrics?.bufferSize, b.metrics?.bufferSize),
        draw: a.gpu?.drawCalls <= b.gpu?.drawCalls, triangles: a.gpu?.triangles <= b.gpu?.triangles,
        boundary: equal(a.boundaryStats, b.boundaryStats),
        geometries: finite(a.gpu?.memory?.geometries) && a.gpu.memory.geometries === b.gpu?.memory?.geometries };
      if (beforeName === 'c2d') {
        checks.textures = a.gpu?.memory?.textures <= b.gpu?.memory?.textures;
        checks.programs = finite(a.gpu?.programs) && finite(b.gpu?.programs) && a.gpu.programs <= b.gpu.programs;
      }
      // C2D's stage-owned SurfaceVisualField contributes at most one texture per
      // realm (three possible active stages); candidate may not add beyond C2D.
      if (beforeName === 'main') checks.surfaceTextureBudget = a.gpu?.memory?.textures <= b.gpu?.memory?.textures + 3;
      for (const [check, valid] of Object.entries(checks)) if (valid === false) fail(`${pair}: ${check} contract`);
      report.contracts.push({ pair, checks, resources: { before: b.gpu?.memory, after: a.gpu?.memory,
        programs: [b.gpu?.programs ?? null, a.gpu?.programs ?? null] } });
      const m = a.metrics, baseline = b.metrics;
      const finalComposite = !a.artDebug || a.artDebug === 'final';
      if (finalComposite) {
        const required = ['darkRatioL20', 'meanSaturation', 'nearPaperRatio', 'lstarSpan'];
        if (required.some(k => !finite(m?.[k]) || !finite(baseline?.[k]))) fail(`${pair}: missing tonal evidence`);
        else {
          if (m.darkRatioL20 > SAFETY.dark20Max) fail(`${pair}: catastrophic dark coverage`);
          if (m.meanSaturation > baseline.meanSaturation + SAFETY.saturationRiseMax) fail(`${pair}: saturation explosion`);
          if (m.nearPaperRatio > SAFETY.whitePaperMax) fail(`${pair}: washed white framebuffer`);
          if (m.lstarSpan < baseline.lstarSpan * SAFETY.spanRetainedMin) fail(`${pair}: luminance span collapsed`);
        }
      } else report.notes.push(`${pair}: layer debug image; final-composite tonal safety not evaluated`);
      if (beforeName !== 'c2d') continue;
      const sameMachine = !!runs.c2d.host?.hostname && runs.c2d.host.hostname === runs.candidate.host?.hostname &&
        equal(b.rendererInfo, a.rendererInfo) && !!a.rendererInfo?.renderer &&
        equal(runs.c2d.browser && { browser: runs.c2d.browser.browser, width: runs.c2d.browser.width, height: runs.c2d.browser.height },
          runs.candidate.browser && { browser: runs.candidate.browser.browser, width: runs.candidate.browser.width, height: runs.candidate.browser.height });
      const bm = b.measurement?.gpuRenderMs?.median, am = a.measurement?.gpuRenderMs?.median;
      const available = sameMachine && finite(bm) && bm > 0 && finite(am) && am > 0 && finalComposite && (!b.artDebug || b.artDebug === 'final');
      const item = { view: key, sameMachine, baselineMedianMs: bm ?? null, candidateMedianMs: am ?? null,
        deltaMs: available ? am - bm : null, status: available ? am <= bm ? 'observed-within-target' : 'observed-exceeds-target' : 'unavailable-or-incomparable',
        p95Ms: [b.measurement?.gpuRenderMs?.p95 ?? null, a.measurement?.gpuRenderMs?.p95 ?? null],
        validSamples: [b.measurement?.gpuQueryValidSamples ?? null, a.measurement?.gpuQueryValidSamples ?? null] };
      report.performance.views.push(item);
      if (available && am > bm * SAFETY.gpuCatastropheRatio + SAFETY.gpuCatastropheExtraMs) fail(`${pair}: catastrophic GPU regression`);
    }
  }
  report.safetyGate.status = report.safetyGate.failures.length ? 'failed' : 'passed';
  report.performance.status = report.performance.views.some(v => v.status === 'observed-exceeds-target') ? 'observed-exceeds-target'
    : report.performance.views.length && report.performance.views.every(v => v.status === 'observed-within-target') ? 'observed-within-target' : 'pending';
  if (!report.coverage.main?.complete) report.notes.push('main reference lacks full 12-view coverage; missing mid views have no invented metrics.');
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dirs = { main: process.env.INKBOX_C2D1_MAIN_DIR || 'reports/local/m2c2d1/main',
    c2d: process.env.INKBOX_C2D1_C2D_DIR || 'reports/local/m2c2d1/c2d',
    candidate: process.env.INKBOX_C2D1_CANDIDATE_DIR || 'reports/local/m2c2d1/candidate' };
  const runs = Object.fromEntries(Object.entries(dirs).map(([name, dir]) => [name, JSON.parse(fs.readFileSync(path.join(dir, 'browser.json'), 'utf8'))]));
  const report = compareRuns(runs, { partial: process.argv.includes('--partial') });
  report.sources = dirs;
  const out = path.resolve(process.env.INKBOX_C2D1_DIAGNOSTICS_OUT || 'reports/local/m2c2d1/diagnostics.json');
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(`Safety Gate: ${report.safetyGate.status}; Art Diagnostics: human review required; GPU: ${report.performance.status}`);
  for (const failure of report.safetyGate.failures) console.error(failure);
  if (report.safetyGate.status === 'failed' || report.performance.status !== 'observed-within-target') process.exitCode = 1;
}
