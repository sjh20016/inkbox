// M2-C2D.1: frozen C2D product import / camera recipes + four mid views.
// No soak; shared fixture, CDP and product-frame probes retain their owners.
// Same natural Worlds and camera recipes at any HEAD; the label only names the
// output directory so baseline/final runs pair view-by-view.
// Golden evidence comes from normal product rendering only (no inspector views).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launch, findEdge, sleep } from './cdp.mjs';
import os from 'node:os';
import { framebufferBody } from './inkbox-render3d-m2c2d1-framebuffer.mjs';
import { sampleBody } from './inkbox-product-frame-timing.mjs';
import { ensureCanonicalMortalCache, ensureCanonicalRealmsCache } from './inkbox-c2c-browser-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = process.env.INKBOX_C2D1_LABEL || 'candidate';
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || `reports/local/m2c2d1/${LABEL}`);
const NATURAL_SAVE = path.resolve(process.env.INKBOX_C2C_NATURAL_SAVE || 'reports/local/m2c2c/pilot/full-sites-natural-save.json');
const NATURAL_GEOGRAPHY = path.resolve(process.env.INKBOX_C2C_NATURAL_META || 'reports/local/m2c2c/pilot/full-natural-geography.json');
const REALMS_SAVE = path.resolve(process.env.INKBOX_C2C_REALMS_SAVE || 'reports/local/m2c2c/pilot/natural-realms-save.json');
const REALMS_META = path.resolve(process.env.INKBOX_C2C_REALMS_META || 'reports/local/m2c2c/pilot/natural-realms-meta.json');
const REALMS_HISTORY = path.resolve(process.env.INKBOX_C2C_REALMS_HISTORY || 'reports/local/m2c2c/pilot/natural-realms-history.json');
const port = Number(process.env.INKBOX_PORT || 4241);
const base = process.env.INKBOX_URL || `http://127.0.0.1:${port}`;

// Paper colours match RealmStyleProfile per dominant view realm.
const PAPER = { mortal: '#ECE4D2', upper: '#E8DEC8', nether: '#D5D1C7' };
const ALL_VIEWS = [
  { key: 'mortal-overview', recipe: 'mortal', plane: 'mortal', kind: 'overview', zoom: 1.45, polar: 0.55, yaw: 0.15, paper: PAPER.mortal },
  { key: 'mortal-coast-near', recipe: 'mortal', plane: 'mortal', kind: 'coast', zoom: 5, polar: 0.80, yaw: 0.30, paper: PAPER.mortal },
  { key: 'mortal-cliff-near', recipe: 'mortal', plane: 'mortal', kind: 'cliff', zoom: 5, polar: 0.70, yaw: 0.50, paper: PAPER.mortal },
  { key: 'mortal-settlement-near', recipe: 'mortal', plane: 'mortal', kind: 'settlement', zoom: 6, polar: 0.85, yaw: 0.40, paper: PAPER.mortal },
  { key: 'upper-overview', recipe: 'realms', plane: 'upper', kind: 'overview', zoom: 1.45, polar: 0.55, yaw: 0.15, paper: PAPER.upper },
  { key: 'upper-boundary-near', recipe: 'realms', plane: 'upper', kind: 'boundary', zoom: 3.5, polar: 0.78, yaw: 0.15, paper: PAPER.upper },
  { key: 'nether-overview', recipe: 'realms', plane: 'nether', kind: 'overview', zoom: 1.45, polar: 0.55, yaw: 0.15, paper: PAPER.nether },
  { key: 'nether-boundary-near', recipe: 'realms', plane: 'nether', kind: 'boundary', zoom: 3.5, polar: 0.78, yaw: 0.15, paper: PAPER.nether },
  { key: 'mortal-cliff-mid', recipe: 'mortal', plane: 'mortal', kind: 'cliff', zoom: 2.7, polar: 0.70, yaw: 0.50, paper: PAPER.mortal },
  { key: 'mortal-settlement-mid', recipe: 'mortal', plane: 'mortal', kind: 'settlement', zoom: 3, polar: 0.85, yaw: 0.40, paper: PAPER.mortal },
  { key: 'upper-terrain-mid', recipe: 'realms', plane: 'upper', kind: 'overview', zoom: 2.7, polar: 0.55, yaw: 0.15, paper: PAPER.upper },
  { key: 'nether-terrain-mid', recipe: 'realms', plane: 'nether', kind: 'overview', zoom: 2.7, polar: 0.55, yaw: 0.15, paper: PAPER.nether },
];
// Local QA supplements expose water hidden behind the frozen 02 camera and
// houses hidden by the frozen 04 camera. They never replace the Golden matrix.
const LOCAL_VIEWS = [
  { key: 'mortal-coast-reverse', recipe: 'mortal', plane: 'mortal', kind: 'coast', poiOverride: { x: 50, y: 113 }, zoom: 5, polar: 0.55, yaw: 3.44, paper: PAPER.mortal },
  { key: 'mortal-water-body-near', recipe: 'mortal', plane: 'mortal', kind: 'coast', poiOverride: { x: 17, y: 13 }, zoom: 4, polar: 0.55, yaw: 0.15, paper: PAPER.mortal },
  { key: 'mortal-village-water-near', recipe: 'mortal', plane: 'mortal', kind: 'settlement', poiOverride: { x: 155, y: 110 }, zoom: 4, polar: 0.55, yaw: 3.44, paper: PAPER.mortal },
];
const requested = (process.env.INKBOX_C2D1_VIEWS || '').split(',').filter(Boolean);
const availableViews = requested.some(key => LOCAL_VIEWS.some(v => v.key === key)) ? [...ALL_VIEWS, ...LOCAL_VIEWS] : ALL_VIEWS;
for (const key of requested) assert(availableViews.some(v => v.key === key), 'Unknown view: ' + key);
const VIEWS = requested.length ? availableViews.filter(v => requested.includes(v.key)) : ALL_VIEWS;
const DEBUG = process.env.INKBOX_C2D1_ART_DEBUG || null;
const STYLE = process.env.INKBOX_C2D1_ART_STYLE || null;
const EXPERIMENT = process.env.INKBOX_C2D1_EXPERIMENT || null;
const PAIRED_GPU = process.env.INKBOX_C2D1_PAIRED_GPU === '1';
const PAIRED_DESIGN = Object.freeze({ roundsPerStyle: 4, externalWarmupRAFs: 48, productSamplesPerRound: 120,
  existingProbeWarmupRAFs: 12, order: 'even view: AB/BA/AB/BA; odd view: BA/AB/BA/AB; A=C2D, B=candidate',
  median: 'median of all four round medians; average central two', p95: 'maximum of all four round p95s (not a pooled p95)',
  max: 'maximum over all four rounds', validSamples: 'sum over all four rounds', retry: 'none; no valid round discarded',
  budget: 'per-view candidate median <= C2D median; zero tolerance',
  images: 'new screenshot/framebuffer diagnostics after each style final round; never reuse older images' });
if (DEBUG) assert(['base','coast','mass','structure','atmosphere','final'].includes(DEBUG), 'Invalid artDebug');
if (STYLE) assert(['main-style','c2d-style','c2d1-style'].includes(STYLE), 'Invalid artStyle');
if (EXPERIMENT) {
  assert(['E1','E2','E3','E4'].includes(EXPERIMENT), 'Invalid ablation experiment');
  assert(!STYLE || STYLE === 'c2d1-style', 'ablation uses the current shader, not a historical snapshot');
}
if (PAIRED_GPU) {
  assert(!requested.length, 'paired GPU requires the full fixed 12-camera sequence');
  assert(!DEBUG || DEBUG === 'final', 'paired GPU measures final only');
  assert(!STYLE || STYLE === 'c2d1-style', 'paired GPU owns C2D/candidate style switching');
  assert(!EXPERIMENT, 'paired GPU requires the production candidate, not an ablation');
  assert(process.env.INKBOX_C2D1_SKIP_GPU !== '1', 'paired GPU cannot skip GPU timing');
}
if (process.argv.includes('--list')) { console.log(JSON.stringify(ALL_VIEWS, null, 2)); process.exit(0); }
if (process.argv.includes('--paired-design')) {
  assert.equal(medianOf([8, 26, 7, 10]), 9);
  assert.deepEqual(pairedOrder(0, 0), ['c2d-style', 'c2d1-style']);
  assert.deepEqual(pairedOrder(0, 1), ['c2d1-style', 'c2d-style']);
  assert.deepEqual(pairedOrder(1, 0), ['c2d1-style', 'c2d-style']);
  new Function(`return (${pairedIdentityProbe.toString()})();`);
  const synthetic = [8, 26, 7, 10].map(median => ({ measurement: { gpuRenderMs: { median, p95: median + 2, max: median + 3, samples: 120 }, gpuQueryValidSamples: 120 } }));
  const aggregate = aggregateMeasurements(synthetic);
  assert.equal(aggregate.gpuRenderMs.median, 9); assert.equal(aggregate.gpuRenderMs.p95, 28);
  assert.equal(aggregate.gpuRenderMs.max, 29); assert.equal(aggregate.gpuQueryValidSamples, 480);
  assert.deepEqual(aggregate.aggregation.roundMedians, [8, 26, 7, 10]);
  synthetic[1].measurement.gpuRenderMs = null;
  assert.equal(aggregateMeasurements(synthetic).gpuRenderMs, null);
  console.log(JSON.stringify({ ...PAIRED_DESIGN, selfChecks: 'passed', gpuStarted: false }, null, 2)); process.exit(0);
}


const report = { suite: 'M2-C2D.1 evidence capture (not art acceptance)', label: LABEL, captureComplete: false,
  requestedDebug: DEBUG, requestedStyle: STYLE, experiment: EXPERIMENT, selectedViews: VIEWS.map(v => v.key), host: { hostname: os.hostname(), platform: os.platform(), arch: os.arch() },
  startedAt: new Date().toISOString(), nodeVersion: process.version, lodHistory: 'complete preceding camera recipes, including unselected views',
  sourceSHA256: Object.fromEntries(['art/PigmentTerrainMaterial.js','art/TerrainDataTextures.js','art/SurfaceVisualFieldTexture.js','art/RealmStyleProfile.js','art/ArtPass.js','art/ArtComparisonSnapshots.js',
    'water/WaterPigmentMaterial.js','boundary/BoundaryInkMaterial.js'].map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(ROOT,'src/inkbox/render3d',file))).digest('hex')])),
  method: 'same natural World (C2C canonical caches) + fixed camera recipes; in-canvas gl.readPixels tonal metrics', views: [] };
let browser, server;
const page = (body, timeoutMs = 240000) => browser.js(`return (async()=>{${body}})();`, { timeoutMs });
const pairedReports = PAIRED_GPU ? Object.fromEntries(['c2d', 'candidate'].map(label => [label, { ...report, label,
  requestedStyle: label === 'c2d' ? 'c2d-style' : 'c2d1-style', views: [], pairedTiming: PAIRED_DESIGN }])) : null;
if (PAIRED_GPU) {
  report.pairedTiming = PAIRED_DESIGN;
  report.sameEdgeSessionId = `${process.pid}-${report.startedAt}`;
  for (const run of Object.values(pairedReports)) run.sameEdgeSessionId = report.sameEdgeSessionId;
}

function medianOf(values) {
  assert(values.length && values.every(Number.isFinite), 'median requires all finite values');
  const sorted = values.slice().sort((a, b) => a - b), i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
}
function pairedOrder(viewIndex, round) { return (viewIndex + round) % 2 ? ['c2d1-style', 'c2d-style'] : ['c2d-style', 'c2d1-style']; }
function aggregateMeasurements(rounds) {
  assert.equal(rounds.length, 4, 'exactly four rounds must be retained');
  const measurements = rounds.map(round => round.measurement);
  const gpu = measurements.map(m => m?.gpuRenderMs ?? null);
  const allGPU = gpu.every(m => m && Number.isFinite(m.median) && Number.isFinite(m.p95) && Number.isFinite(m.max) && m.samples > 0);
  const sum = key => measurements.reduce((n, m) => n + (m?.[key] ?? 0), 0);
  const result = { ...measurements.at(-1), unavailable: !allGPU,
    reason: allGPU ? null : 'At least one of the four predefined rounds lacks valid GPU timing; no round discarded',
    gpuRenderMs: allGPU ? { median: medianOf(gpu.map(m => m.median)), p95: Math.max(...gpu.map(m => m.p95)),
      max: Math.max(...gpu.map(m => m.max)), samples: gpu.reduce((n, m) => n + m.samples, 0) } : null,
    gpuQueryValidSamples: sum('gpuQueryValidSamples'), gpuQueryInvalidSamples: sum('gpuQueryInvalidSamples'),
    gpuQuerySkippedSamples: sum('gpuQuerySkippedSamples'), maxPendingQueries: Math.max(...measurements.map(m => m.maxPendingQueries ?? 0)),
    aggregation: { ...PAIRED_DESIGN, rounds: 4, roundMedians: gpu.map(m => m?.median ?? null), roundP95: gpu.map(m => m?.p95 ?? null),
      roundMax: gpu.map(m => m?.max ?? null), roundValidSamples: measurements.map(m => m.gpuQueryValidSamples ?? 0) } };
  for (const key of ['cpuUpdateMs', 'cpuRenderSubmitMs', 'rafIntervalMs']) {
    const metrics = measurements.map(m => m[key]);
    if (metrics.every(m => m && Number.isFinite(m.median))) result[key] = { median: medianOf(metrics.map(m => m.median)),
      p95: Math.max(...metrics.map(m => m.p95)), max: Math.max(...metrics.map(m => m.max)),
      samples: metrics.reduce((n, m) => n + m.samples, 0), mean: metrics.reduce((n, m) => n + m.mean * m.samples, 0) / metrics.reduce((n, m) => n + m.samples, 0) };
  }
  result.productCallCounts = Object.fromEntries(['updates', 'renders', 'rafIntervals'].map(key => [key,
    measurements.reduce((n, m) => n + (m.productCallCounts?.[key] ?? 0), 0)]));
  return result;
}

async function pairedIdentityProbe() {
  const k = window.inkbox, r = k.render3d.renderer, gl = r.gpu.getContext();
  const sha = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map(x => x.toString(16).padStart(2, '0')).join('');
  const jsonHash = value => sha(new TextEncoder().encode(JSON.stringify(value)));
  const geometries = new Map(), objects = [];
  r.scene.traverse(object => {
    if (!object.geometry) return;
    geometries.set(object.geometry.uuid, object.geometry);
    objects.push({ uuid: object.uuid, geometry: object.geometry.uuid, count: object.isInstancedMesh ? object.count : null });
  });
  const records = [];
  for (const [uuid, g] of geometries) {
    const attributes = {};
    for (const [name, attribute] of Object.entries(g.attributes)) if (name !== 'color') {
      const array = attribute.array ?? attribute.data.array;
      attributes[name] = { count: attribute.count, itemSize: attribute.itemSize, offset: attribute.offset ?? null,
        sha256: await sha(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)) };
    }
    records.push({ uuid, attributes, drawRange: { ...g.drawRange }, groups: g.groups.map(group => ({ ...group })),
      index: g.index ? await sha(new Uint8Array(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength)) : null });
  }
  records.sort((a, b) => a.uuid.localeCompare(b.uuid)); objects.sort((a, b) => a.uuid.localeCompare(b.uuid));
  const picks = [];
  for (const fy of [.25, .5, .75]) for (const fx of [.25, .5, .75]) {
    const hit = r.picker.pick(fx * r.width, fy * r.height, r.width, r.height);
    picks.push(hit ? Object.fromEntries(['kind', 'plane', 'x', 'y', 'entityId', 'entityContainer', 'settlementId', 'houseKey',
      'artifactId', 'siteId', 'leylineId', 'riftId', 'targetPlane', 'ax', 'ay', 'bx', 'by', 'breach'].map(key => [key, hit[key] ?? null])) : null);
  }
  const pendingGlErrors = []; for (let error = gl.getError(); error !== gl.NO_ERROR; error = gl.getError()) pendingGlErrors.push(error);
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return { worldSHA256: await jsonHash(k.world), advanceStateSHA256: await jsonHash(k.advanceState),
    worldObjectUnchanged: k.world === window.__pairedIdentityRefs.world && [...r.stages].every(([plane, stage]) => window.__pairedIdentityRefs.stages.get(plane) === stage.world),
    camera: { position: r.cameraRig.camera.position.toArray(), target: r.cameraRig.controls.target.toArray(), zoom: r.cameraRig.camera.zoom },
    geometrySHA256: await jsonHash(records), objectGeometrySHA256: await jsonHash(objects), geometry: records, picks,
    boundaryVisible: !!r.boundary?.mesh.visible,
    boundaryStats: r.boundary?.mesh.visible ? { ...r.boundary.stats } : null,
    boundaryCacheStats: r.boundary ? { ...r.boundary.stats } : null, lod: r.getLODStats(), pendingGlErrors,
    artStyle: r.art.comparisonStyle, artDebug: r.art.debugView,
    rendererInfo: { vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) },
    gpu: { memory: { ...r.gpu.info.memory }, programs: r.gpu.info.programs?.length ?? null,
      drawCalls: r.gpu.info.render.calls, triangles: r.gpu.info.render.triangles } };
}
const pairedIdentity = () => page(`return (${pairedIdentityProbe.toString()})();`);
function checkPairedIdentity(record, reference, label) {
  assert(record.worldObjectUnchanged, `${label}: World object identity changed`);
  assert.deepEqual(record.pendingGlErrors, [], `${label}: GL errors (recorded, not retried)`);
  for (const key of ['worldSHA256', 'advanceStateSHA256', 'camera', 'geometrySHA256', 'objectGeometrySHA256', 'picks', 'boundaryVisible', 'boundaryStats', 'boundaryCacheStats', 'lod'])
    assert.deepEqual(record[key], reference[key], `${label}: ${key} changed`);
  assert.equal(record.gpu.drawCalls, reference.gpu.drawCalls, `${label}: draw changed`);
  assert.equal(record.gpu.triangles, reference.gpu.triangles, `${label}: triangles changed`);
}
function writePairedProgress() {
  for (const [label, run] of Object.entries(pairedReports)) {
    fs.mkdirSync(path.join(OUT, label), { recursive: true });
    fs.writeFileSync(path.join(OUT, label, 'browser-progress.json'), JSON.stringify(run));
  }
  fs.writeFileSync(path.join(OUT, 'browser-progress.json'), JSON.stringify(report));
}
async function capturePairedView(view, importEpoch, setup) {
  await page('const r=window.inkbox.render3d.renderer;window.__pairedIdentityRefs={world:window.inkbox.world,stages:new Map([...r.stages].map(([plane,stage])=>[plane,stage.world]))};return true;');
  const viewIndex = ALL_VIEWS.indexOf(view), records = [], images = {};
  const entry = { view: view.key, importEpoch, setup, fixedViewIndex: viewIndex,
    orders: Array.from({ length: 4 }, (_, round) => pairedOrder(viewIndex, round)), rounds: records, captures: images };
  report.views.push(entry); // persist failed attempts too; no replacement by a better run
  assert.deepEqual(setup.pendingGlErrors, [], `${view.key}: setup GL errors (not retried)`);
  let identityReference = null;
  for (let round = 0; round < 4; round++) {
    const order = pairedOrder(viewIndex, round);
    for (let position = 0; position < order.length; position++) {
      const style = order[position], label = style === 'c2d-style' ? 'c2d' : 'candidate';
      const record = { round, position, order, style, label, status: 'started', startedAt: new Date().toISOString(),
        externalWarmupRAFs: 48, measurement: null };
      records.push(record); writePairedProgress();
      await page(`const r=window.inkbox.render3d.renderer;await r.art.setComparisonStyle(${JSON.stringify(style)});await r.art.comparisonReady;
        r.art.setDebugView('final');for(let i=0;i<48;i++)await new Promise(requestAnimationFrame);return true;`);
      record.before = await pairedIdentity();
      identityReference ??= record.before;
      assert.deepEqual(record.before.boundaryStats, setup.boundaryStats, `${view.key}: active boundary matches fixed camera setup`);
      assert(identityReference.picks.some(Boolean), `${view.key}: picking probe must hit visible geometry`);
      assert.equal(record.before.artStyle, style, 'paired style did not apply');
      checkPairedIdentity(record.before, identityReference, `${view.key}/${round}/${label}/before`);
      writePairedProgress();
      // One attempt only. Unlike the default single-run path this never retries.
      record.measurement = await browser.js(`return (async()=>{${sampleBody(`paired/${view.key}/${round}/${label}`)}})();`, { timeoutMs: 180000 });
      record.after = await pairedIdentity();
      record.finishedAt = new Date().toISOString(); record.status = 'completed';
      checkPairedIdentity(record.after, identityReference, `${view.key}/${round}/${label}/after`);
      assert.equal(record.measurement.worldDigest, identityReference.worldSHA256, 'sample World digest drift');
      assert.equal(record.measurement.advanceStateDigest, identityReference.advanceStateSHA256, 'sample advance digest drift');
      assert.equal(record.measurement.drawCalls, identityReference.gpu.drawCalls, 'sample draw drift');
      assert.equal(record.measurement.triangles, identityReference.gpu.triangles, 'sample triangles drift');
      assert.equal(record.measurement.glError, 0, 'sample GL error');
      if (round === 3) {
        const metrics = await page(framebufferBody(view.paper));
        const image = path.join(OUT, label, `${view.key}.png`); await browser.screenshot(image);
        const captured = await pairedIdentity(); checkPairedIdentity(captured, identityReference, `${view.key}/${label}/image`);
        images[label] = { view: view.key, importEpoch, ...setup, ...captured,
          captureIdentity: { world: captured.worldSHA256, advance: captured.advanceStateSHA256 }, metrics,
          image: path.relative(ROOT, image).replaceAll(path.sep, '/'), imageSha256: createHash('sha256').update(fs.readFileSync(image)).digest('hex'),
          captureRound: round, captureStyle: style, capturedAt: new Date().toISOString() };
      }
      writePairedProgress();
    }
  }
  for (const label of ['c2d', 'candidate']) {
    const rounds = records.filter(record => record.label === label);
    const measurement = aggregateMeasurements(rounds);
    const result = { ...images[label], measurement, pairedRounds: rounds, pairedOrder: entry.orders, sameEdgeSessionId: report.sameEdgeSessionId };
    pairedReports[label].views.push(result); entry[label] = result;
  }
  const a = entry.candidate.measurement.gpuRenderMs?.median, b = entry.c2d.measurement.gpuRenderMs?.median;
  entry.budget = { toleranceMs: 0, c2dMedianMs: b ?? null, candidateMedianMs: a ?? null, deltaMs: Number.isFinite(a) && Number.isFinite(b) ? a - b : null,
    status: Number.isFinite(a) && Number.isFinite(b) ? a <= b ? 'observed-within-target' : 'observed-exceeds-target' : 'pending' };
  console.log(`[${report.views.length}/12] paired ${view.key} C2D=${b?.toFixed(2) ?? 'unavailable'} candidate=${a?.toFixed(2) ?? 'unavailable'} ${entry.budget.status}`);
  writePairedProgress(); return entry;
}

async function importSave(savePath, seed, day) {
  const { root } = await browser.cdp.send('DOM.getDocument');
  const { nodeId } = await browser.cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#inkImportFile' });
  assert(nodeId, 'product import file input unavailable');
  await browser.cdp.send('DOM.setFileInputFiles', { nodeId, files: [savePath] });
  assert(await browser.waitFor(`return window.inkbox?.world?.seed===${seed}&&window.inkbox?.world?.day===${day}`, { timeoutMs: 60000 }),
    `canonical save seed=${seed} day=${day} did not load through product importFile`);
  await page(`const k=window.inkbox,r=k.render3d.renderer;k.setSpeed(0);
    await r.art.comparisonReady;
    r.setProductionAssetsEnabled(true);await r.environmentLoadPromise;
    if(r.environmentLoadError)throw r.environmentLoadError;
    await r.characterLoadPromise;if(r.characterLoadError)throw r.characterLoadError;
    r.setGeographyEnabled(true);
    k.selection=null;r.setRealmViewState(k.getRealmViewState());
    for(let i=0;i<20;i++)await new Promise(requestAnimationFrame);return true;`, 300000);
}

async function measureWithRetry(view) {
  if (process.env.INKBOX_C2D1_SKIP_GPU === '1') return { unavailable: true, reason: 'INKBOX_C2D1_SKIP_GPU=1' };
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await browser.js(`return (async()=>{${sampleBody(`${LABEL}/${view.key}`)}})();`, { timeoutMs: 180000 }); }
    catch (error) {
      lastError = String(error?.message || error);
      // 排空遗留 GL error 并让 GPU 进程沉降，再试一次；不吞掉失败事实。
      await page(`const r=window.inkbox.render3d.renderer,gl=r.gpu.getContext();
        for(let e=gl.getError();e!==gl.NO_ERROR;e=gl.getError()){}
        for(let i=0;i<30;i++)await new Promise(requestAnimationFrame);return true;`).catch(() => {});
    }
  }
  return { unavailable: true, reason: lastError };
}

async function captureView(view, importEpoch, selected = true) {
  const setup = await page(`
    const k=window.inkbox,r=k.render3d.renderer,v=window.__c2dVisuals;
    document.getElementById('inkInspectClose')?.click();
    const w=k.world,plane=${JSON.stringify(view.plane)},kind=${JSON.stringify(view.kind)};
    // 视界断面必须从凡间背景上看目标界（与玩家开窗时的产品状态一致）。
    r.setActivePlane(kind==='boundary'?'mortal':plane);
    let poi=null,poiSource='';
    if(kind==='overview'){poi={x:(w.w-1)/2,y:(w.h-1)/2};poiSource='world-bounds';}
    else if(kind==='coast'){
      let best=-1,bestDepth=0;
      for(let i=0;i<w.size;i++){
        const depth=w.water[i];if(depth<=0.01)continue;
        const x=i%w.w,y=(i/w.w)|0;
        const dry=(x>0&&w.water[i-1]<=0.0015)||(x<w.w-1&&w.water[i+1]<=0.0015)||(y>0&&w.water[i-w.w]<=0.0015)||(y<w.h-1&&w.water[i+w.w]<=0.0015);
        if(dry&&(depth>bestDepth||(depth===bestDepth&&best<0))){best=i;bestDepth=depth;}
      }
      if(best<0)throw Error('no natural coastline cell in current World');
      poi={x:best%w.w,y:(best/w.w)|0};poiSource='max-depth wet cell adjacent to dry land (index order tiebreak)';
    } else if(kind==='cliff'){
      let best=-1,bestSlope=0;
      for(let y=1;y<w.h-1;y++)for(let x=1;x<w.w-1;x++){
        const i=y*w.w+x;if(w.water[i]>0.0015)continue;
        const hh=w.height[i];
        const s=Math.max(Math.abs(hh-w.height[i-1]),Math.abs(hh-w.height[i+1]),Math.abs(hh-w.height[i-w.w]),Math.abs(hh-w.height[i+w.w]));
        if(s>bestSlope){bestSlope=s;best=i;}
      }
      if(best<0)throw Error('no natural cliff cell in current World');
      poi={x:best%w.w,y:(best/w.w)|0};poiSource='max 4-neighbour height delta on dry land';
    } else if(kind==='settlement'){
      const vs=[...(w.villages||[])].sort((a,b)=>(b.houses?.length||0)-(a.houses?.length||0));
      if(!vs.length||!(vs[0].houses?.length))throw Error('no natural settlement in current World');
      poi={x:vs[0].x,y:vs[0].y};poiSource='largest natural village by house count';
    } else if(kind==='boundary'){
      const tool=plane==='upper'?'viewUpper':'viewNether';
      k.selectTool(tool);
      const pts=[[Math.floor(w.w*.25),Math.floor(w.h*.25)],[Math.floor(w.w*.75),Math.floor(w.h*.25)],[Math.floor(w.w*.75),Math.floor(w.h*.75)],[Math.floor(w.w*.25),Math.floor(w.h*.75)]];
      k.commitSelection(pts);r.setRealmViewState(k.getRealmViewState());
      const state=k.getRealmViewState();
      if(!k.selection||state.targetPlane!==plane)throw Error('normal UI selection failed to open '+plane+' view (selection='+JSON.stringify(k.selection&&{x0:k.selection.x0,y0:k.selection.y0,x1:k.selection.x1,y1:k.selection.y1,capped:k.selection.capped})+' tool='+k.tool?.name+')');
      for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);
      if(!r.realmPrototype.open||r.realmPrototype.targetPlane!==plane)throw Error('realmPrototype did not open '+plane+' (open='+r.realmPrototype.open+' target='+r.realmPrototype.targetPlane+' stateOpen='+state.open+')');
      const b=r.boundary;if(!b.edges)throw Error('boundary has no edges for '+plane);
      let best=0;for(let e=1;e<b.edges;e++)if(b.edgeVisualDepth[e]>b.edgeVisualDepth[best])best=e;
      const nd=b.edgeNodes;poi={x:(nd[best*4]+nd[best*4+2])/2,y:(nd[best*4+1]+nd[best*4+3])/2};
      poiSource='player-window boundary edge with max visualDepth; edge index '+best;
    }
    const localPOI=${JSON.stringify(view.poiOverride ?? null)};
    if(localPOI){poi=localPOI;poiSource='local supplement (frozen Golden unchanged): '+${JSON.stringify(view.key)};}
    const cam=v.applyCamera(r,'WORLD_OVERVIEW',{poi,zoom:${view.zoom},polar:${view.polar},yaw:${view.yaw}});
    // Controlled uniform-only ablations, after product view/profile updates.
    // E1 restores main tone with the repaired coast; E2 adds only broad mass;
    // E3 adds calibrated structure. E4 uses the final production profile.
    const experiment=${JSON.stringify(EXPERIMENT)};
    if(experiment&&experiment!=='E4')for(const stage of r.stages.values()){
      const u=stage.terrain?.inkMaterial?.uniforms;if(!u)continue;
      u.realmContrast.value={mortal:1.03,upper:1.09,nether:1.30}[stage.plane];
      u.massShadeStrength.value=experiment==='E1'?0:{mortal:0.16,upper:0.14,nether:0.12}[stage.plane];
      u.deepInkStrength.value=experiment==='E3'?{mortal:0.16,upper:0.12,nether:0.16}[stage.plane]:0;
      u.heightWashStrength.value=0;
    }
    for(let i=0;i<24;i++)await new Promise(requestAnimationFrame);
    // 先记录（而不是吞掉）产品渲染遗留的 GL error，再让采样在干净状态下计时。
    const gl=r.gpu.getContext(),pendingGlErrors=[];
    for(let e=gl.getError();e!==gl.NO_ERROR;e=gl.getError())pendingGlErrors.push(e);
    const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const debugInfo=gl.getExtension('WEBGL_debug_renderer_info');
    return {poi,poiSource,pendingGlErrors,artDebug:r.art?.debugView??null,artStyle:r.art?.comparisonStyle??null,
      rendererInfo:{vendor:debugInfo?gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:debugInfo?gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)},
      camera:{position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom},
      worldSHA256:await sha(k.world),advanceStateSHA256:await sha(k.advanceState),
      boundaryStats:kind==='boundary'?{...r.boundary.stats}:null,
      gpu:{memory:{...r.gpu.info.memory},programs:r.gpu.info.programs?.length??null,drawCalls:r.gpu.info.render.calls,triangles:r.gpu.info.render.triangles}};`);
  // LOD uses hysteresis. A subset still visits preceding camera recipes, so a
  // four-view ablation has exactly the same presentation history as all twelve.
  if (!selected) return null;
  if (PAIRED_GPU) return capturePairedView(view, importEpoch, setup);
  const measured = await measureWithRetry(view);
  const metricBody = framebufferBody(view.paper);
  const metrics = await page(metricBody);
  const image = path.join(OUT, `${view.key}.png`);
  await browser.screenshot(image);
  const afterIdentity=await page(`const hash=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))].map(x=>x.toString(16).padStart(2,'0')).join('');return {world:await hash(window.inkbox.world),advance:await hash(window.inkbox.advanceState)};`);
  assert.equal(afterIdentity.world,setup.worldSHA256,view.key+': World drift during capture');
  assert.equal(afterIdentity.advance,setup.advanceStateSHA256,view.key+': advance drift during capture');
  if(DEBUG)assert.equal(setup.artDebug,DEBUG,'artDebug query not applied');
  if(STYLE)assert.equal(setup.artStyle,STYLE,'artStyle query not applied');
  return { view: view.key, importEpoch, ...setup, captureIdentity: afterIdentity, metrics, measurement: measured,
    image: path.relative(ROOT, image).replaceAll(path.sep, '/'),
    imageSha256: createHash('sha256').update(fs.readFileSync(image)).digest('hex') };
}

try {
  fs.mkdirSync(OUT, { recursive: true });
  report.mortalCachePreflight = await ensureCanonicalMortalCache({ savePath: NATURAL_SAVE, metaPath: NATURAL_GEOGRAPHY,
    explicit: !!(process.env.INKBOX_C2C_NATURAL_SAVE || process.env.INKBOX_C2C_NATURAL_META) });
  report.realmsCachePreflight = await ensureCanonicalRealmsCache({ savePath: REALMS_SAVE, metaPath: REALMS_META, historyPath: REALMS_HISTORY,
    explicit: !!(process.env.INKBOX_C2C_REALMS_SAVE || process.env.INKBOX_C2C_REALMS_META || process.env.INKBOX_C2C_REALMS_HISTORY) });
  if (!process.env.INKBOX_URL) {
    server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(port)], { cwd: ROOT, windowsHide: true, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 100; i++) { if (server.exitCode !== null) throw Error(`owned server exited ${server.exitCode}`); try { ready = (await fetch(`${base}/inkbox.html`)).ok; } catch {} if (ready) break; await sleep(200); }
    assert(ready, 'Inkbox server did not become ready');
  }
  const edge = findEdge(); assert(edge, 'Microsoft Edge unavailable');
  browser = await launch({ url: 'about:blank', browser: edge, width: 1500, height: 940, gpu: true });
  const url=new URL('/inkbox.html',base);
  for(const [key,value] of Object.entries({renderer:'3d',assets:'on',boundary:'strata',geography:'on',...(DEBUG&&!PAIRED_GPU?{artDebug:DEBUG}:{}),...(STYLE&&!PAIRED_GPU?{artStyle:STYLE}:{})}))url.searchParams.set(key,value);
  report.url=url.href;
  await browser.cdp.send('Page.navigate', { url: url.href });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.getGeographyStats', { timeoutMs: 60000 }));
  await page(`window.inkbox.setSpeed(0);await window.inkbox.render3d.renderer.art.comparisonReady;window.__c2dVisuals=await import('./src/inkbox/render3d/art/VisualScenarios.js');return true;`);

  let loadedRecipe = null, importEpoch = 0;
  const lastSelected = Math.max(...VIEWS.map(view => availableViews.indexOf(view)));
  for (const view of availableViews.slice(0, lastSelected + 1)) {
    if (loadedRecipe !== view.recipe) {
      console.log(`· 载入 ${view.recipe} 规范世界…`);
      if (view.recipe === 'mortal') await importSave(NATURAL_SAVE, 226, 72000);
      else await importSave(REALMS_SAVE, 20260923, 21600);
      loadedRecipe = view.recipe;
      importEpoch++;
    }
    const record = await captureView(view, importEpoch, VIEWS.includes(view));
    if (!record) continue;
    if (PAIRED_GPU) continue; // capturePairedView persists both fresh style runs
    assert(record.worldSHA256 && record.advanceStateSHA256, `${view.key}: World/advance 身份摘要缺失`);
    if (record.measurement?.unavailable) console.log(`WARN ${view.key}: GPU 计时不可用（${record.measurement.reason}），已记录并继续`);
    report.views.push(record);
    fs.writeFileSync(path.join(OUT, 'browser-progress.json'), JSON.stringify(report));
    const m = record.metrics || {};
    console.log(`[${report.views.length}/${VIEWS.length}] ${view.key}  span=${m.lstarSpan?.toFixed(1)}  nearPaper=${m.nearPaperRatio?.toFixed(3)}  L30=${m.darkRatioL30?.toFixed(3)}  calls=${record.gpu?.drawCalls}  tris=${record.gpu?.triangles}  glErr=${(record.pendingGlErrors || []).length}`);
  }
  assert.equal(report.views.length, VIEWS.length);
  report.pendingGlErrors = PAIRED_GPU ? report.views.flatMap(entry => entry.rounds.flatMap(round => [round.before, round.after]
    .filter(Boolean).flatMap(identity => identity.pendingGlErrors.map(error => ({ view: entry.view, round: round.round, style: round.style, error })))))
    : report.views.flatMap(entry => (entry.pendingGlErrors || []).map(error => ({ view: entry.view, error })));
  report.gpuTimingUnavailable = PAIRED_GPU ? Object.values(pairedReports).flatMap(run => run.views.filter(entry => entry.measurement?.unavailable)
    .map(entry => ({ view: entry.view, style: run.requestedStyle, reason: entry.measurement.reason })))
    : report.views.filter(entry => entry.measurement?.unavailable).map(entry => ({ view: entry.view, reason: entry.measurement.reason }));
  const errors = { runtime: browser.errors(), consoleApi: browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
    .map(e => ({ text: (e.params.args || []).map(a => a.value ?? a.description ?? '').join(' ') })) };
  assert.deepEqual(errors, { runtime: [], consoleApi: [] }, 'Edge runtime or console errors during C2D.1 views');
  report.captureComplete = true;
  if (PAIRED_GPU) {
    report.performance = { target: PAIRED_DESIGN.budget, views: report.views.map(entry => ({ view: entry.view, ...entry.budget })),
      status: report.views.some(entry => entry.budget.status === 'observed-exceeds-target') ? 'observed-exceeds-target'
        : report.views.every(entry => entry.budget.status === 'observed-within-target') ? 'observed-within-target' : 'pending' };
    if (report.performance.status !== 'observed-within-target') process.exitCode = 1;
    console.log(`Paired GPU: capture complete; budget ${report.performance.status}; all predefined rounds retained`);
  }
} catch (error) {
  report.failure = error.stack || String(error);
  if (PAIRED_GPU) {
    const attempt = report.views.at(-1)?.rounds?.findLast(round => round.status === 'started');
    if (attempt) {
      attempt.status = 'failed'; attempt.failure = report.failure; attempt.finishedAt = new Date().toISOString();
      if (browser) attempt.failureIdentity = await pairedIdentity().catch(failure => ({ failure: String(failure) }));
    }
  }
  // 失败时也把页面级证据留下：否则「初始化没起来」只能看到一句断言。
  try {
    if (browser) {
      report.failureUrl = await page('return location.href;').catch(() => null);
      report.failureConsoleErrors = browser.cdp.events
        .filter(e => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
        .map(e => (e.params.args || []).map(a => a.value ?? a.description ?? '').join(' '));
      report.failureRuntimeErrors = browser.errors();
      report.failureHasInkbox = await page('return {inkbox:typeof window.inkbox,render3d:typeof window.inkbox?.render3d,renderer:typeof window.inkbox?.render3d?.renderer};').catch(() => null);
    }
  } catch {}
  console.error(report.failure);
  if (report.failureUrl) console.error('url: ' + report.failureUrl);
  if (report.failureHasInkbox) console.error('globals: ' + JSON.stringify(report.failureHasInkbox));
  if (report.failureConsoleErrors?.length) console.error('console errors: ' + JSON.stringify(report.failureConsoleErrors, null, 2));
  if (report.failureRuntimeErrors?.length) console.error('runtime errors: ' + JSON.stringify(report.failureRuntimeErrors, null, 2));
  process.exitCode = 1;
}
finally {
  report.finishedAt = new Date().toISOString();
  if (browser) { report.browser = browser.meta; await browser.close(); }
  server?.kill();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
  if (PAIRED_GPU) for (const [label, run] of Object.entries(pairedReports)) {
    Object.assign(run, { captureComplete: report.captureComplete, finishedAt: report.finishedAt, browser: report.browser, url: report.url,
      sameEdgeSessionId: report.sameEdgeSessionId, mortalCachePreflight: report.mortalCachePreflight, realmsCachePreflight: report.realmsCachePreflight,
      failure: report.failure ?? null, failureRuntimeErrors: report.failureRuntimeErrors ?? [], failureConsoleErrors: report.failureConsoleErrors ?? [],
      pendingGlErrors: run.views.flatMap(entry => (entry.pendingGlErrors || []).map(error => ({ view: entry.view, error }))),
      gpuTimingUnavailable: run.views.filter(entry => entry.measurement?.unavailable).map(entry => ({ view: entry.view, reason: entry.measurement.reason })),
      pairedAttempts: report.views.map(entry => ({ view: entry.view, importEpoch: entry.importEpoch, orders: entry.orders, rounds: entry.rounds, captures: entry.captures })),
      performance: report.performance ?? { status: 'pending', target: PAIRED_DESIGN.budget } });
    fs.mkdirSync(path.join(OUT, label), { recursive: true });
    fs.writeFileSync(path.join(OUT, label, 'browser.json'), JSON.stringify(run, null, 2) + '\n');
  }
}
