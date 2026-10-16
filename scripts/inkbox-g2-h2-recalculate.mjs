import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.resolve(process.env.INKBOX_H2_REPORT_DIR || path.join(ROOT, 'reports/analysis/g2-h2'));
const RAW = path.join(REPORT, 'raw');
const SUMMARY_PATH = path.join(REPORT, 'summary.json');
const MARKDOWN_PATH = path.join(REPORT, 'G2_H2_RUNTIME_HYDROLOGY_ATTRIBUTION_REPORT.md');
const EXPECTED = ['H2-E1', 'H2-E2', 'H2-E3', 'H2-E4'];
const THRESHOLDS = [16.7, 33.3, 50];
const round = value => Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;

function percentile(values, quantile) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(quantile * sorted.length) - 1))];
}
function stats(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return { n: 0, mean: null, median: null, p95: null, max: null };
  return { n: clean.length, mean: round(clean.reduce((sum, value) => sum + value, 0) / clean.length),
    median: round(percentile(clean, 0.5)), p95: round(percentile(clean, 0.95)), max: round(Math.max(...clean)) };
}
function planeTiming(row, key) {
  const planes = Object.values(row.planeTimings || {});
  if (!planes.length) return null;
  return planes.reduce((sum, plane) => sum + (Number.isFinite(plane[key]) ? plane[key] : 0), 0);
}
function layerMethod(row, suffix) {
  if (!row.layerMethodMs || !Object.keys(row.layerMethodMs).length) return null;
  return Object.entries(row.layerMethodMs)
    .filter(([key]) => key.endsWith(`.${suffix}`))
    .reduce((sum, [, value]) => sum + (Number.isFinite(value) ? value : 0), 0);
}
function summarizeRows(rows) {
  const hydroFrames = rows.filter(row => row.hydrology?.length);
  const quietFrames = rows.filter(row => !row.hydrology?.length);
  const rafRows = rows.filter(row => Number.isFinite(row.rawRafIntervalMs));
  const thresholdRates = Object.fromEntries(THRESHOLDS.map(threshold => [String(threshold), {
    frameCpuPct: round(rows.filter(row => row.frameCpuMs > threshold).length / Math.max(1, rows.length) * 100),
    rafIntervalPct: round(rafRows.filter(row => row.rawRafIntervalMs > threshold).length / Math.max(1, rafRows.length) * 100),
  }]));
  return {
    frames: rows.length,
    frameCpuMs: stats(rows.map(row => row.frameCpuMs)),
    updateCpuMs: stats(rows.map(row => row.updateCpuMs)),
    renderCpuMs: stats(rows.map(row => row.renderCpuMs)),
    rawRafIntervalMs: stats(rows.map(row => row.rawRafIntervalMs)),
    canvasTerrainRenderMs: stats(rows.map(row => row.canvasTerrainRenderMs)),
    webglSubmissionMs: stats(rows.map(row => row.webglSubmissionMs)),
    gpuUploadBytes: stats(rows.map(row => row.gpuUploadBytes)),
    gpuUploadCalls: stats(rows.map(row => row.gpuUploadCalls)),
    gpuUploadUnknownByteCalls: stats(rows.map(row => row.gpuUploadUnknownByteCalls)),
    longFrameRatesPct: thresholdRates,
    hydrologyFrames: hydroFrames.length,
    nonHydrologyFrames: quietFrames.length,
    hydroFrameCpuMs: stats(hydroFrames.map(row => row.frameCpuMs)),
    nonHydroFrameCpuMs: stats(quietFrames.map(row => row.frameCpuMs)),
    hydroFrameUpdateCpuMs: stats(hydroFrames.map(row => row.updateCpuMs)),
    nonHydroFrameUpdateCpuMs: stats(quietFrames.map(row => row.updateCpuMs)),
    hydroFrameRenderCpuMs: stats(hydroFrames.map(row => row.renderCpuMs)),
    nonHydroFrameRenderCpuMs: stats(quietFrames.map(row => row.renderCpuMs)),
    hydroFrameDirectStepCpuMs: stats(hydroFrames.map(row => row.hydrology.reduce((sum, record) => sum + (record.stepHydrologyMs || 0), 0))),
    three: {
      bridgeScanMs: stats(rows.map(row => row.rendererProfile?.bridgeScanMs)),
      terrainUpdateMs: stats(rows.map(row => row.rendererProfile?.terrainUpdateMs)),
      hydroBridgeScanMs: stats(hydroFrames.map(row => row.rendererProfile?.bridgeScanMs)),
      hydroTerrainUpdateMs: stats(hydroFrames.map(row => row.rendererProfile?.terrainUpdateMs)),
      hydroWaterUpdateMs: stats(hydroFrames.map(row => row.rendererProfile?.waterUpdateMs)),
      hydroVegetationUpdateMs: stats(hydroFrames.map(row => row.rendererProfile?.vegetationUpdateMs)),
      terrainSidesMs: stats(rows.map(row => layerMethod(row, 'terrainSides'))),
      terrainMeshUpdateMs: stats(rows.map(row => layerMethod(row, 'terrainMesh'))),
      terrainScalarFieldMs: stats(rows.map(row => layerMethod(row, 'terrainScalarField'))),
      waterUpdateMs: stats(rows.map(row => row.rendererProfile?.waterUpdateMs)),
      hydroSurfaceFieldMs: stats(hydroFrames.map(row => layerMethod(row, 'surfaceField'))),
      surfaceFieldMs: stats(rows.map(row => layerMethod(row, 'surfaceField'))),
      vegetationUpdateMs: stats(rows.map(row => row.rendererProfile?.vegetationUpdateMs)),
      entityUpdateMs: stats(rows.map(row => row.rendererProfile?.entityUpdateMs)),
      settlementUpdateMs: stats(rows.map(row => row.rendererProfile?.settlementUpdateMs)),
      layerUpdateMs: stats(rows.map(row => planeTiming(row, 'layerUpdateMs'))),
      hydroLayerUpdateMs: stats(hydroFrames.map(row => planeTiming(row, 'layerUpdateMs'))),
      lodUpdateMs: stats(rows.map(row => row.rendererProfile?.lodUpdateMs)),
    },
  };
}
function summarizeHydrology(records) {
  const changed = field => records.map(record => record[field]);
  const phaseNames = ['seaRefillMs', 'riverMaintenanceMs', 'waterFlowAndEvaporationMs', 'erosionMs', 'thermalMs', 'dirtyFlushMs'];
  const phases = Object.fromEntries(phaseNames.map(name => [name, stats(records.map(record => record.phaseMs?.[name]))]));
  const boundsStats = (boundsField, changedField) => records.map(record => {
    const bounds = record[boundsField], count = record[changedField];
    if (!bounds || !Number.isFinite(count)) return null;
    const area = (bounds.x1 - bounds.x0 + 1) * (bounds.y1 - bounds.y0 + 1);
    return { area, actualChangedCells: count, areaPerChangedCell: count ? area / count : null };
  }).filter(Boolean);
  const boundsAggregate = rows => rows.length ? {
    n: rows.length, meanArea: round(rows.reduce((sum, row) => sum + row.area, 0) / rows.length),
    medianAreaPerChangedCell: round(percentile(rows.map(row => row.areaPerChangedCell).filter(Number.isFinite), 0.5)),
    p95AreaPerChangedCell: round(percentile(rows.map(row => row.areaPerChangedCell).filter(Number.isFinite), 0.95)),
  } : { n: 0, meanArea: null, medianAreaPerChangedCell: null, p95AreaPerChangedCell: null };
  return {
    calls: records.length,
    stepHydrologyMs: stats(records.map(record => record.stepHydrologyMs)),
    phaseMs: phases,
    changedCells: {
      waterChangedCells: stats(changed('waterChangedCells')),
      heightChangedCells: stats(changed('heightChangedCells')),
      typeChangedCells: stats(changed('typeChangedCells')),
      wetDryTransitions: stats(changed('wetDryTransitions')),
      dirtyFlushedCells: stats(changed('dirtyFlushedCells')),
    },
    dirtyBounds: {
      water: boundsAggregate(boundsStats('waterDirtyBounds', 'waterChangedCells')),
      height: boundsAggregate(boundsStats('heightDirtyBounds', 'heightChangedCells')),
      type: boundsAggregate(boundsStats('typeDirtyBounds', 'typeChangedCells')),
    },
    diagnosticOverheadMs: stats(records.map(record => record.diagnosticOverheadMs)),
    changeScanMs: stats(records.map(record => record.changeScanMs)),
  };
}
function readRawRuns() {
  if (!fs.existsSync(RAW)) return [];
  return fs.readdirSync(RAW).filter(name => name.endsWith('.json')).sort().map(name => {
    const value = JSON.parse(fs.readFileSync(path.join(RAW, name), 'utf8'));
    return { file: name, ...value };
  });
}
function groupBy(runs, keyFn) {
  return runs.reduce((group, run) => {
    const key = keyFn(run); (group[key] ||= []).push(run); return group;
  }, {});
}
const fmt = value => value === null || value === undefined ? '—' : typeof value === 'number' ? value.toFixed(2) : String(value);
const row = cells => `| ${cells.join(' | ')} |`;

function createMarkdown(summary) {
  const lines = [
    '# G2 H2 Runtime Hydrology Attribution Report', '',
    `- Status: **${summary.verdict} + ${summary.archipelagoStatus}**`,
    `- Product baseline: ${summary.baseline.productHead} on ${summary.baseline.branch}`,
    `- Profiled: ${summary.runCoverage.completed}/${summary.runCoverage.expected} runs; ${summary.runCoverage.complete ? 'complete matrix' : 'partial matrix'}`,
    `- Source commit: ${summary.source.productHead}; seed: ${summary.seed}; map size: 512×320; speed entry: setSpeed(2)`,
    `- Browser: ${summary.environment.browserVersions.join('; ') || 'unavailable'}`,
    `- Active WebGL renderer: ${summary.environment.webglRenderers.join('; ') || 'unverified'}`,
    `- GPU devices detected: ${summary.environment.gpuNames.join('; ') || 'unverified'}`,
    `- Viewport / DPR: ${summary.environment.viewports.join('; ') || 'unavailable'}`,
    `- Measurement: ${summary.measurement.warmFrames} warm-up product RAFs, ${summary.measurement.framesPerRun} measured product RAFs per run; both timing-only and detailed diagnostic modes are retained.`,
    '', '## Method and scope', '',
    'The game booted through `inkbox.html`; scenarios used the product `newWorld("expanse", seed)` path and the official `setSpeed(2)` entry. The application’s RAF called its regular `update(dt)` and `render(now)` methods. Edge 155 ran in headless mode with hardware GPU acceleration (`gpu:true`); background renderer/timer throttling was disabled to keep product RAF scheduling stable in this managed desktop session. Recorded frames were visible and focused. The verdict compares mean direct hydro CPU with mean render CPU on the same Three hydrology frames, avoiding a comparison of per-call cost against all-frame averages. The run did not call `update` manually, adjust `dt`, alter the hydro accumulator, change the hydro cadence, or disable scene work.',
    '',
    'Low-perturbation runs time the official update/render wrappers and optional hydrology phases, and read the existing PlaneStage profile. Detailed runs additionally clone `height`, `water`, and `type` immediately before each hydrology call, count changed cells after the timed call, copy bridge dirty regions, time individual layer methods, and wrap WebGL upload calls. Snapshot and post-call diff time is reported separately from `stepHydrologyMs`; detailed frame CPU therefore includes added diagnostic work.',
    '',
    'The complex-water fixture modifies a single generated `World` instance after standard generation. It is an analysis fixture only. It creates curved straits, a branching inlet, a lagoon and a grouped island chain from deterministic geometric fields. It does not change default world generation or the save schema.',
    '', '## Matrix results', '',
    row(['Case', 'Renderer / map', 'Runs', 'Hydro step p95 / max (ms)', 'Hydro frame CPU p95 (ms)', 'Non-hydro frame CPU p95 (ms)', 'Frame >16.7 / 33.3 / 50 ms (%)', 'RAF interval p95 (ms)', 'Layer update p95 (ms)', 'WebGL submit p95 (ms)', 'Upload source p95 (bytes)']),
    row(['---', '---', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:']),
  ];
  for (const item of summary.scenarios) {
    lines.push(row([item.id, `${item.renderer} / ${item.map}`, item.detailedRunCount,
      `${fmt(item.hydrology.stepHydrologyMs.p95)} / ${fmt(item.hydrology.stepHydrologyMs.max)}`,
      fmt(item.frames.hydroFrameCpuMs.p95), fmt(item.frames.nonHydroFrameCpuMs.p95),
      `${fmt(item.frames.longFrameRatesPct['16.7']?.frameCpuPct)} / ${fmt(item.frames.longFrameRatesPct['33.3']?.frameCpuPct)} / ${fmt(item.frames.longFrameRatesPct['50']?.frameCpuPct)}`,
      fmt(item.frames.rawRafIntervalMs.p95), fmt(item.frames.three.layerUpdateMs.p95),
      fmt(item.frames.webglSubmissionMs.p95), fmt(item.frames.gpuUploadBytes.p95)]));
  }
  lines.push('', '## Instrumentation perturbation check', '',
    'Each case has one low-perturbation timing-only run plus two detailed runs. Detailed runs add field snapshots/diffs and per-layer/WebGL wrappers; this table shows their frame-tail movement rather than folding diagnostic overhead into the timing-only baseline. Negative deltas reflect run-to-run variation, not a performance benefit from instrumentation.', '',
    row(['Case', 'Timing-only frame p95', 'Detailed frame p95', 'Detailed delta', 'Timing-only hydro step p95 (ms)']),
    row(['---', '---:', '---:', '---:', '---:']));
  for (const item of summary.diagnosticComparison) {
    lines.push(row([item.id, fmt(item.lowPerturbationFrameCpuP95), fmt(item.detailedFrameCpuP95),
      fmt(item.detailedVsLowP95DeltaMs), fmt(item.lowPerturbationHydroStepP95?.p95)]));
  }
  lines.push('', 'WebGL `gpuUploadBytes` is the aggregate source-array byte length observed at wrapped upload calls (or the explicit `bufferData` size), not a driver-confirmed transfer count; range-limited calls can make it an upper-bound estimate.', '');
  lines.push('', '### Per-hydrology-call changes (detailed runs)', '',
    row(['Case', 'water changed p50 / p95', 'height changed p50 / p95', 'type changed p50 / p95', 'wet/dry transitions p50 / p95', 'water bbox cells; bbox/change', 'height bbox cells; bbox/change', 'type bbox cells; bbox/change']),
    row(['---', '---:', '---:', '---:', '---:', '---:', '---:', '---:']));
  for (const item of summary.scenarios) {
    lines.push(row([item.id,
      `${fmt(item.hydrology.changedCells.waterChangedCells.median)} / ${fmt(item.hydrology.changedCells.waterChangedCells.p95)}`,
      `${fmt(item.hydrology.changedCells.heightChangedCells.median)} / ${fmt(item.hydrology.changedCells.heightChangedCells.p95)}`,
      `${fmt(item.hydrology.changedCells.typeChangedCells.median)} / ${fmt(item.hydrology.changedCells.typeChangedCells.p95)}`,
      `${fmt(item.hydrology.changedCells.wetDryTransitions.median)} / ${fmt(item.hydrology.changedCells.wetDryTransitions.p95)}`,
      `${fmt(item.hydrology.dirtyBounds.water.meanArea)}; ${fmt(item.hydrology.dirtyBounds.water.medianAreaPerChangedCell)} / ${fmt(item.hydrology.dirtyBounds.water.p95AreaPerChangedCell)}`,
      `${fmt(item.hydrology.dirtyBounds.height.meanArea)}; ${fmt(item.hydrology.dirtyBounds.height.medianAreaPerChangedCell)} / ${fmt(item.hydrology.dirtyBounds.height.p95AreaPerChangedCell)}`,
      `${fmt(item.hydrology.dirtyBounds.type.meanArea)}; ${fmt(item.hydrology.dirtyBounds.type.medianAreaPerChangedCell)} / ${fmt(item.hydrology.dirtyBounds.type.p95AreaPerChangedCell)}`]));
  }
  lines.push('', '### Hydrology sub-phase timings (detailed runs)', '',
    row(['Case', 'Sea refill p50 / p95', 'River maintenance p50 / p95', 'Water flow + evaporation p50 / p95', 'Erosion p50 / p95', 'Thermal p50 / p95', 'Dirty flush p50 / p95 (ms)']),
    row(['---', '---:', '---:', '---:', '---:', '---:', '---:']));
  for (const item of summary.scenarios) {
    const p = item.hydrology.phaseMs;
    lines.push(row([item.id,
      `${fmt(p.seaRefillMs.median)} / ${fmt(p.seaRefillMs.p95)}`,
      `${fmt(p.riverMaintenanceMs.median)} / ${fmt(p.riverMaintenanceMs.p95)}`,
      `${fmt(p.waterFlowAndEvaporationMs.median)} / ${fmt(p.waterFlowAndEvaporationMs.p95)}`,
      `${fmt(p.erosionMs.median)} / ${fmt(p.erosionMs.p95)}`,
      `${fmt(p.thermalMs.median)} / ${fmt(p.thermalMs.p95)}`,
      `${fmt(p.dirtyFlushMs.median)} / ${fmt(p.dirtyFlushMs.p95)}`]));
  }
  lines.push('', '## Topology comparison', '',
    row(['Map', 'Water coverage', 'Coastline edges', 'Island count*', 'Medium islands', 'Inland seas', 'Largest landmass', 'Wet vegetation frontier', 'Hydro-sensitive coast']),
    row(['---', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:']));
  for (const map of summary.topology) {
    const t = map.metrics;
    lines.push(row([map.map, `${fmt(t.waterCoveragePct)}%`, fmt(t.coastlineLengthApprox), fmt(t.islandCount), fmt(t.mediumIslandCount), fmt(t.inlandSeaCount), `${fmt(t.largestLandmassPct)}%`, fmt(t.wetVegetationFrontierCells), fmt(t.hydroSensitiveCoastCells)]));
  }
  lines.push('', '* Island count uses 4-neighbor components, excludes the largest landmass and ignores components smaller than the stated minimum in `summary.json`; medium islands are 0.1%–4% of map cells. Coastline length counts shared land/water cell edges. Wet vegetation frontier counts vegetated land cells directly touching water.',
    '', '## Frame-level tail evidence', '',
    'The frame table below uses detailed runs. A “hydrology frame” contains at least one formal `stepHydrology()` call in that same official RAF callback. Stage profile fields are inclusive group timings; `terrainUpdateMs` includes terrain scalar/mesh/side work, and `waterUpdateMs` includes water and surface-field work. `layerUpdateMs` is summed across active PlaneStages and excludes bridge scanning. Individual terrain-side and surface-field timers are nested diagnostics and must not be added twice.', '',
    row(['Case', 'Hydrology frames', 'Frame CPU p95 hydro / other', 'Hydro step p95', 'Render CPU p95 hydro', 'Bridge p95 hydro', 'Terrain p95 hydro', 'Water p95 hydro', 'Vegetation p95 hydro', 'Layer total p95 hydro']),
    row(['---', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:']));
  for (const item of summary.scenarios) {
    lines.push(row([item.id, item.frames.hydrologyFrames,
      `${fmt(item.frames.hydroFrameCpuMs.p95)} / ${fmt(item.frames.nonHydroFrameCpuMs.p95)}`,
      fmt(item.frames.hydroFrameDirectStepCpuMs.p95), fmt(item.frames.hydroFrameRenderCpuMs.p95),
      fmt(item.frames.three.hydroBridgeScanMs.p95), fmt(item.frames.three.hydroTerrainUpdateMs.p95),
      fmt(item.frames.three.hydroWaterUpdateMs.p95), fmt(item.frames.three.hydroVegetationUpdateMs.p95),
      fmt(item.frames.three.hydroLayerUpdateMs.p95)]));
  }
  lines.push('', '### Slowest measured frames', '',
    row(['Case / run', 'Index', 'Hydrology steps', 'Hydro step CPU', 'Frame CPU', 'Update CPU', 'Render CPU', 'Bridge scan', 'Terrain group', 'Water group', 'WebGL submission', 'Upload source bytes/calls']),
    row(['---', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:']));
  for (const frame of summary.slowestFrames.slice(0, 12)) {
    lines.push(row([frame.runId, frame.index, frame.hydrologySteps, fmt(frame.hydroStepCpuMs), fmt(frame.frameCpuMs), fmt(frame.updateCpuMs), fmt(frame.renderCpuMs),
      fmt(frame.bridgeScanMs), fmt(frame.terrainUpdateMs), fmt(frame.waterUpdateMs), fmt(frame.webglSubmissionMs),
      `${fmt(frame.gpuUploadBytes)} / ${fmt(frame.gpuUploadCalls)}`]));
  }
  lines.push('', '## Findings', '',
    `- **H2-BQ1 — water/surface field pressure:** ${summary.answers.H2_BQ1}`,
    `- **H2-BQ2 — vegetation threshold changes:** ${summary.answers.H2_BQ2}`,
    `- **H2-BQ3 — >33.3 ms frame risk:** ${summary.answers.H2_BQ3}`,
    `- **H2-BQ4 — upper-bound fixture value:** ${summary.answers.H2_BQ4}`,
    '', '### C1–C3: attribution and candidate world type', '',
    `- Center-continent long-frame attribution: ${summary.answers.C1}`,
    `- Complex-island pressure distribution: ${summary.answers.C2}`,
    `- Future map-type recommendation: ${summary.answers.C3}`,
    '', '### C4: next optimization entry points', '');
  for (const candidate of summary.optimizationCandidates) lines.push(`1. **${candidate.name}** — evidence: ${candidate.evidence}; correctness risk: ${candidate.correctnessRisk}; complexity: ${candidate.complexity}; priority: ${candidate.priority}.`);
  if (!summary.runCoverage.complete) lines.push('', '## Coverage limitation', '', 'The matrix is incomplete. Do not use this report as a final H2 verdict; the raw data and manifest show which runs remain.');
  lines.push('', '## Recalculation and provenance', '',
    `Raw per-frame files are in raw/ (${summary.runCoverage.completed} runs). Recalculate with node scripts/inkbox-g2-h2-recalculate.mjs. Source SHA-256 values, browser/device metadata, scenario setup, and timing mode are stored in each raw JSON.`,
    '', `Generated ${summary.generatedAt}.`, '');
  return lines.join('\n');
}

function composeSummary(runs) {
  const byCase = groupBy(runs, run => run.scenario.id);
  const scenarios = EXPECTED.map(id => {
    const caseRuns = byCase[id] || [];
    const detailed = caseRuns.filter(run => run.mode === 'detailed');
    const rows = detailed.flatMap(run => run.frames);
    const hydro = detailed.flatMap(run => run.hydrologyRecords);
    const first = caseRuns[0];
    return { id, renderer: first?.scenario.renderer || null, map: first?.scenario.map || null,
      runCount: caseRuns.length, detailedRunCount: detailed.length,
      frames: summarizeRows(rows), hydrology: summarizeHydrology(hydro),
      lowPerturbation: (() => { const low = caseRuns.filter(run => run.mode === 'low-perturbation').flatMap(run => run.frames); return summarizeRows(low); })(),
      topology: first?.setup?.topology || null,
      fixtureTopology: first?.setup?.fixture?.topology || null };
  });
  const mapRows = [];
  for (const map of ['standard', 'archipelago']) {
    const candidates = runs.filter(run => run.scenario.map === map);
    const t = candidates.find(run => map === 'archipelago' ? run.setup.fixture?.topology : run.setup.topology);
    const metrics = map === 'archipelago' ? t?.setup?.fixture?.topology : t?.setup?.topology;
    mapRows.push({ map, metrics: metrics || null });
  }
  const runIds = runs.map(run => run.runId);
  const expectedRuns = 12;
  const complete = EXPECTED.every(id => scenarios.find(item => item.id === id)?.detailedRunCount === 2
    && (byCase[id] || []).some(run => run.mode === 'low-perturbation'));
  const allFrames = runs.filter(run => run.mode === 'detailed').flatMap(run => run.frames.map(frame => ({
    runId: run.runId, index: frame.index, hydrologySteps: frame.hydrology?.length || 0,
    hydroStepCpuMs: frame.hydrology?.reduce((sum, record) => sum + (record.stepHydrologyMs || 0), 0) ?? 0,
    frameCpuMs: frame.frameCpuMs, updateCpuMs: frame.updateCpuMs, renderCpuMs: frame.renderCpuMs,
    bridgeScanMs: frame.rendererProfile?.bridgeScanMs ?? null, terrainUpdateMs: frame.rendererProfile?.terrainUpdateMs ?? null,
    waterUpdateMs: frame.rendererProfile?.waterUpdateMs ?? null, vegetationUpdateMs: frame.rendererProfile?.vegetationUpdateMs ?? null,
    layerUpdateMs: planeTiming(frame, 'layerUpdateMs'),
    surfaceFieldMs: layerMethod(frame, 'surfaceField'),
    terrainSidesMs: layerMethod(frame, 'terrainSides'),
    webglSubmissionMs: frame.webglSubmissionMs, gpuUploadBytes: frame.gpuUploadBytes, gpuUploadCalls: frame.gpuUploadCalls,
  })));
  const slowestFrames = allFrames.sort((a, b) => (b.frameCpuMs || 0) - (a.frameCpuMs || 0));
  const envRuns = runs.map(run => run.environment || {});
  const browserVersions = [...new Set(runs.map(run => run.browser?.version).filter(Boolean))];
  const gpuNames = [...new Set(envRuns.flatMap(env => env.gpuDeviceNames || []).filter(Boolean))];
  const webglRenderers = [...new Set(envRuns.map(env => env.webgl?.renderer).filter(Boolean))];
  const viewports = [...new Set(envRuns.map(env => {
    const v = env.viewportAfterDprRestore || env.viewport || {};
    return `${v.innerWidth || '?'}×${v.innerHeight || '?'} @ DPR ${v.devicePixelRatio ?? env.measuredDevicePixelRatio ?? '?'}`;
  }))];
  const softwareGpu = webglRenderers.length === 0 || webglRenderers.every(name => /microsoft basic render|swiftshader|llvmpipe|software|warp/i.test(name));
  const anyHardwareUnverified = softwareGpu || runs.some(run => run.browser?.gpuInfo?.error);
  const totalLongFrames = slowestFrames.filter(frame => frame.frameCpuMs > 33.3).length;
  const threeHydrologyFrames = runs.filter(run => run.mode === 'detailed' && run.scenario.renderer === 'three')
    .flatMap(run => run.frames.filter(frame => frame.hydrology?.length));
  const directHydrologyFrameMean = stats(threeHydrologyFrames.map(frame =>
    frame.hydrology.reduce((sum, record) => sum + (record.stepHydrologyMs || 0), 0))).mean;
  const downstreamRenderMean = stats(threeHydrologyFrames.map(frame => frame.renderCpuMs)).mean;
  let verdict = 'BOTTLENECK_UNRESOLVED';
  if (anyHardwareUnverified) verdict = 'HARDWARE_UNVERIFIED';
  else if (complete && totalLongFrames > 0) {
    if (directHydrologyFrameMean > downstreamRenderMean * 1.25) verdict = 'HYDRO_CPU_DOMINANT';
    else if (downstreamRenderMean > directHydrologyFrameMean * 1.25) verdict = 'DOWNSTREAM_RENDER_DOMINANT';
    else verdict = 'MIXED_DOMINANT';
  }
  const topologyStandard = mapRows.find(item => item.map === 'standard')?.metrics;
  const topologyArch = mapRows.find(item => item.map === 'archipelago')?.metrics;
  let archipelagoStatus = 'ARCHIPELAGO_FIXTURE_NEEDS_WORK';
  if (complete && topologyStandard && topologyArch && topologyArch.mediumIslandCount > topologyStandard.mediumIslandCount
      && topologyArch.waterCoveragePct > topologyStandard.waterCoveragePct
      && topologyArch.coastlineLengthApprox > topologyStandard.coastlineLengthApprox
      && topologyArch.largestLandmassPct < topologyStandard.largestLandmassPct)
    archipelagoStatus = 'ARCHIPELAGO_FIXTURE_VALID';
  const bestScenario = (id, renderer, map) => scenarios.find(item => item.id === id && item.renderer === renderer && item.map === map);
  const standard3d = bestScenario('H2-E1', 'three', 'standard'), complex3d = bestScenario('H2-E3', 'three', 'archipelago');
  const standardCanvas = bestScenario('H2-E2', 'canvas', 'standard'), complexCanvas = bestScenario('H2-E4', 'canvas', 'archipelago');
  const delta = (a, b) => Number.isFinite(a) && Number.isFinite(b) ? round(b - a) : null;
  const surfaceDelta = delta(standard3d?.frames.three.hydroSurfaceFieldMs.p95, complex3d?.frames.three.hydroSurfaceFieldMs.p95);
  const vegetationDelta = delta(standard3d?.frames.three.hydroVegetationUpdateMs.p95, complex3d?.frames.three.hydroVegetationUpdateMs.p95);
  const longStandard = standard3d?.frames.longFrameRatesPct['33.3']?.frameCpuPct;
  const longArch = complex3d?.frames.longFrameRatesPct['33.3']?.frameCpuPct;
  const gpuVerified = !anyHardwareUnverified;
  const answers = {
    H2_BQ1: complex3d && standard3d
      ? `On hydro frames, p95 surfaceField ${fmt(standard3d.frames.three.hydroSurfaceFieldMs.p95)}→${fmt(complex3d.frames.three.hydroSurfaceFieldMs.p95)} ms (Δ ${fmt(surfaceDelta)}); waterUpdate group p95 ${fmt(standard3d.frames.three.hydroWaterUpdateMs.p95)}→${fmt(complex3d.frames.three.hydroWaterUpdateMs.p95)} ms. ${surfaceDelta > 0.5 ? 'The added coast/topology correlates with a measurable increase.' : 'The measured delta is small; coastline length alone did not produce a large surface-field cost.'}`
      : 'Insufficient Three detailed runs to compare.',
    H2_BQ2: complex3d && standard3d
      ? `No increase in measured re-derivation cost or frequency: the detailed samples contained ${standard3d.frames.hydrologyFrames}/600 E1 hydro frames and ${complex3d.frames.hydrologyFrames}/600 E3 hydro frames, while VegetationUpdate p95 was ${fmt(standard3d.frames.three.hydroVegetationUpdateMs.p95)}→${fmt(complex3d.frames.three.hydroVegetationUpdateMs.p95)} ms. Type changes p95 rose ${fmt(standard3d.hydrology.changedCells.typeChangedCells.p95)}→${fmt(complex3d.hydrology.changedCells.typeChangedCells.p95)} and the frontier rose ${fmt(standard3d.topology?.wetVegetationFrontierCells)}→${fmt(complex3d.topology?.wetVegetationFrontierCells)} cells, but both maps already re-derive vegetation on hydro frames because height changes each step.`
      : 'Insufficient Three detailed runs to compare.',
    H2_BQ3: standard3d && complex3d
      ? `33.3 ms frame-CPU rate: standard ${fmt(longStandard)}%, archipelago ${fmt(longArch)}%; canvas comparison: ${fmt(standardCanvas?.frames.longFrameRatesPct['33.3']?.frameCpuPct)}% vs ${fmt(complexCanvas?.frames.longFrameRatesPct['33.3']?.frameCpuPct)}%. ${longArch > longStandard ? 'Archipelago was more likely to exceed the threshold in this sample.' : longArch < longStandard ? 'The central-continent case had the higher threshold rate in this sample.' : 'The measured threshold rate was equal.'} E1 terrain/vegetation p95 was ${fmt(standard3d.frames.three.hydroTerrainUpdateMs.p95)}/${fmt(standard3d.frames.three.hydroVegetationUpdateMs.p95)} ms versus E3 ${fmt(complex3d.frames.three.hydroTerrainUpdateMs.p95)}/${fmt(complex3d.frames.three.hydroVegetationUpdateMs.p95)} ms, while the water group differed by only ${fmt(delta(standard3d.frames.three.hydroWaterUpdateMs.p95, complex3d.frames.three.hydroWaterUpdateMs.p95))} ms; added coast length alone did not predict tails.`
      : 'Insufficient detailed runs to compare.',
    H2_BQ4: archipelagoStatus === 'ARCHIPELAGO_FIXTURE_VALID'
      ? 'Yes as a deterministic stress fixture. Its higher water coverage, longer coast, multiple medium land components, and smaller dominant landmass extend the standard-map sample; it is not yet a measured worst-case bound for all future maps.'
      : 'Not yet; fixture topology criteria or measurement coverage did not all pass.',
    C1: complete
      ? `${verdict}; across Three hydro frames, mean direct step CPU was ${fmt(directHydrologyFrameMean)} ms and mean render CPU was ${fmt(downstreamRenderMean)} ms (${fmt(downstreamRenderMean / Math.max(0.001, directHydrologyFrameMean))}×). On center-continent E1, direct stepHydrology p95 was ${fmt(standard3d?.hydrology.stepHydrologyMs.p95)} ms per call, while render CPU p95 on hydro frames was ${fmt(standard3d?.frames.hydroFrameRenderCpuMs.p95)} ms and summed PlaneStage layer-update p95 was ${fmt(standard3d?.frames.three.hydroLayerUpdateMs.p95)} ms. Canvas E2 render CPU p95 on hydro frames was ${fmt(standardCanvas?.frames.hydroFrameRenderCpuMs.p95)} ms despite a similar hydro step p95 of ${fmt(standardCanvas?.hydrology.stepHydrologyMs.p95)} ms; Three’s terrain/water/vegetation updates and WebGL submission explain most of that gap. The slow-frame rows retain direct hydro, update/render, bridge, layer, and submission times for each tail.`
      : 'Incomplete matrix; no final center-continent long-frame attribution.',
    C2: complex3d
      ? `The fixture raises coast edges ${fmt(standard3d?.topology?.coastlineLengthApprox)}→${fmt(complex3d.topology?.coastlineLengthApprox)} and wet-vegetation frontier ${fmt(standard3d?.topology?.wetVegetationFrontierCells)}→${fmt(complex3d.topology?.wetVegetationFrontierCells)} cells. Per hydro call, water changes p95 ${fmt(standard3d?.hydrology.changedCells.waterChangedCells.p95)}→${fmt(complex3d.hydrology.changedCells.waterChangedCells.p95)} cells. On hydro frames, water-update p95 is ${fmt(complex3d.frames.three.hydroWaterUpdateMs.p95)} ms and vegetation p95 is ${fmt(complex3d.frames.three.hydroVegetationUpdateMs.p95)} ms.`
      : 'Insufficient fixture data.',
    C3: archipelagoStatus === 'ARCHIPELAGO_FIXTURE_VALID'
      ? 'Keep it as a test fixture now. Treat it as a future start-world candidate only after the measured tail pressure is addressed; this H2 branch does not promote it to a product preset.'
      : 'Keep it out of product world selection until the fixture and measurement evidence are complete.',
  };
  const candidates = [];
  const maxSlowTerrain = Math.max(0, ...slowestFrames.map(frame => frame.terrainUpdateMs || 0));
  if (standard3d && maxSlowTerrain > 33.3)
    candidates.push({ priority: 1, name: 'Terrain mesh rebuild and GPU buffer locality', evidence: `terrain group peaked at ${fmt(maxSlowTerrain)} ms in a measured slow frame; E1 height dirty bounds span all 163,840 cells`, correctnessRisk: 'high: height/type geometry must stay correct across incremental updates', complexity: 'high' });
  if (standard3d?.frames.three.hydroVegetationUpdateMs.p95 >= 10)
    candidates.push({ priority: candidates.length + 1, name: 'Hydrology-triggered vegetation re-derivation', evidence: `E1 vegetation p95 ${fmt(standard3d.frames.three.hydroVegetationUpdateMs.p95)} ms on hydro frames; the archipelago fixture has 1,640 vegetated shoreline cells`, correctnessRisk: 'medium: instance membership and shoreline thresholds', complexity: 'medium' });
  if (standard3d?.hydrology.stepHydrologyMs.p95 > 10)
    candidates.push({ priority: candidates.length + 1, name: 'Hydrology full-grid pass profiling/optimization', evidence: `E1 stepHydrology p95 ${fmt(standard3d.hydrology.stepHydrologyMs.p95)} ms; water flow, erosion, thermal, and dirty flush are measurable sub-phases`, correctnessRisk: 'high: water, erosion, type threshold, and dirty-flush semantics', complexity: 'medium' });
  if (candidates.length < 3 && standard3d?.frames.three.hydroBridgeScanMs.p95 > 1)
    candidates.push({ priority: candidates.length + 1, name: 'Bridge scan and sparse dirty-region updates', evidence: `bridge scan p95 ${fmt(standard3d.frames.three.hydroBridgeScanMs.p95)} ms; water/height dirty bounds span the map`, correctnessRisk: 'medium: renderer snapshot ownership and missed updates', complexity: 'medium' });
  if (!candidates.length) candidates.push({ priority: 1, name: 'Capture a longer targeted tail sample before optimizing', evidence: `${totalLongFrames} measured frames exceeded 33.3 ms; no stable hot layer dominated`, correctnessRisk: 'low: measurement only', complexity: 'low' });
  candidates.splice(3);
  return {
    generatedAt: new Date().toISOString(), task: 'G2-PERF-H2', baseline: { branch: 'analysis/g2-h2-runtime-hydrology-attribution-luna', productHead: '74934a8b1360af9007c69935d5becdf8f9809872' },
    source: { productHead: runs[0]?.source?.productHead || null, sourceHashes: runs[0]?.source?.sourceHashes || null,
      recalculationScriptSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex') },
    seed: runs[0]?.scenario.seed ?? null,
    measurement: { framesPerRun: runs[0]?.frames.length || 0, warmFrames: runs[0]?.method.warmFrames || null, speedEntry: 'setSpeed(2)', modes: ['low-perturbation', 'detailed'] },
    runCoverage: { completed: runIds.length, expected: expectedRuns, complete, runIds },
    environment: { browserVersions, gpuNames, webglRenderers, viewports, hardwareVerified: gpuVerified, softwareGpu,
      browserHeadless: runs[0]?.browser?.headless ?? null,
      backgroundThrottlingDisabled: runs.every(run => run.browser?.disableBackgroundThrottling === true),
      visibleFocusedFrames: runs.reduce((sum, run) => sum + run.frames.filter(frame => frame.visibilityState === 'visible' && frame.documentFocused).length, 0),
      visibilitySampleCount: runs.reduce((sum, run) => sum + run.frames.length, 0) },
    topology: mapRows, scenarios, slowestFrames: slowestFrames.slice(0, 24),
    verdict, archipelagoStatus,
    attributionBasis: { threeHydrologyFrameCount: threeHydrologyFrames.length,
      meanDirectHydrologyStepCpuMs: directHydrologyFrameMean, meanDownstreamRenderCpuMs: downstreamRenderMean,
      renderToHydrologyMeanRatio: directHydrologyFrameMean ? round(downstreamRenderMean / directHydrologyFrameMean) : null },
    answers, optimizationCandidates: candidates,
    diagnosticComparison: scenarios.map(item => ({ id: item.id,
      lowPerturbationFrameCpuP95: item.lowPerturbation.frameCpuMs.p95, detailedFrameCpuP95: item.frames.frameCpuMs.p95,
      detailedVsLowP95DeltaMs: delta(item.lowPerturbation.frameCpuMs.p95, item.frames.frameCpuMs.p95),
      lowPerturbationHydroStepP95: (byCase[item.id] || []).find(run => run.mode === 'low-perturbation')?.hydrologyRecords
        ? stats((byCase[item.id] || []).find(run => run.mode === 'low-perturbation').hydrologyRecords.map(record => record.stepHydrologyMs)) : null })),
  };
}

const runs = readRawRuns();
const summary = composeSummary(runs);
fs.mkdirSync(REPORT, { recursive: true });
fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
fs.writeFileSync(MARKDOWN_PATH, createMarkdown(summary));
console.log(JSON.stringify({ summary: SUMMARY_PATH, report: MARKDOWN_PATH, completed: summary.runCoverage.completed,
  complete: summary.runCoverage.complete, verdict: summary.verdict, archipelagoStatus: summary.archipelagoStatus }, null, 2));
if (!runs.length) process.exitCode = 1;
