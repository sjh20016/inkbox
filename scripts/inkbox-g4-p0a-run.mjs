#!/usr/bin/env node
// Bounded R2.1 state machine. A failed gate never schedules a later stage.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { createLabServer } from './inkbox-g4-p0a-server.mjs';
import { launchLabBrowser, classifyHardware } from './inkbox-g4-p0a-browser.mjs';
import { writeJson, sha256, persistRun, assessPrimary } from './inkbox-g4-p0a-stats.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).filter(v => v.startsWith('--')).map(v => {
  const index = v.indexOf('='); return index < 0 ? [v.slice(2), true] : [v.slice(2, index), v.slice(index + 1)];
}));
const suite = args.suite ?? 'all';
if (!['all', 'smoke'].includes(suite)) throw new Error('Supported --suite: all | smoke (all remains conditional on each gate).');
const OUT = path.resolve(ROOT, args.out ?? 'analysis/g4/p0a/results');
if (fs.existsSync(path.join(OUT, 'manifest.json'))) throw new Error('OUTPUT_EXISTS: use a fresh --out directory; failed runs are never overwritten.');
fs.mkdirSync(OUT, { recursive: true });
const git = (...argv) => execFileSync('git', argv, { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();
const manifest = { schema: 'g4-p0a-r2.1', startedAt: new Date().toISOString(), suite,
  status: 'RUNNING', reason: null, runs: [], failures: [], stages: {},
  quantiles: 'Nearest rank: sorted[ceil(p*N)-1]; rates use strict >; adjacent RAF frames are not independent repeats.',
  baselineSHA: git('rev-parse', 'HEAD'), regressionBudget: { formula: 'baseline * 1.08 + 1.5ms',
    evaluation: null, reason: 'No matching approved product baseline for this device and this experimental protocol; no claim of regression-budget acceptance.' } };
const provenance = { baselineSHA: manifest.baselineSHA, referenceMainAtCommission: 'e1e55039bb56efda7a307513ede07a9fab3bf534',
  branch: git('branch', '--show-current'), node: process.version, files: {}, input: {}, environment: null };
const bindings = [];
let server, browser, stop = false;
const checkpoint = () => { writeJson(path.join(OUT, 'manifest.json'), manifest); writeJson(path.join(OUT, 'provenance.json'), provenance); writeJson(path.join(OUT, 'variant-bindings.json'), bindings); };
const fail = (status, reason, evidence = {}) => { manifest.status = status; manifest.reason = reason; manifest.failures.push({ reason, ...evidence }); stop = true; checkpoint(); };

function zipEntry(bytes, entryName) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP_EOCD_MISSING');
  const entries = bytes.readUInt16LE(eocd + 10); let offset = bytes.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('ZIP_CENTRAL_DIRECTORY_INVALID');
    const nameLength = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === entryName) {
      const method = bytes.readUInt16LE(offset + 10), size = bytes.readUInt32LE(offset + 20), local = bytes.readUInt32LE(offset + 42);
      const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
      const compressed = bytes.subarray(start, start + size);
      if (method === 0) return compressed;
      if (method === 8) return inflateRawSync(compressed);
      throw new Error(`ZIP_COMPRESSION_UNSUPPORTED: ${method}`);
    }
    offset += 46 + nameLength + extra + comment;
  }
  throw new Error(`ZIP_ENTRY_MISSING: ${entryName}`);
}

const BOOT_PAUSE = `(() => {
  Object.defineProperty(window, 'inkbox', { configurable: true, set(app) {
    app.setSpeed(0);
    Object.defineProperty(window, 'inkbox', { value: app, configurable: true, writable: true, enumerable: true });
  }});
})()`;
const pageCall = (name, options) => browser.session.js(`return (async () => {
  const experiment = await import('/scripts/inkbox-g4-p0a-page.mjs');
  return await experiment[${JSON.stringify(name)}](${JSON.stringify(options ?? {})});
})();`, { timeoutMs: 240000 });

async function prepare(variant, { renderer = 'Three', map = 'standard', native = false, normalize = true } = {}) {
  server.setNative(native);
  browser.session.cdp.events.length = 0;
  const query = new URLSearchParams({ g4variant: variant, ...(renderer === 'Three' ? { renderer: '3d' } : {}) });
  await browser.session.cdp.send('Page.navigate', { url: `${server.origin}/inkbox.html?${query}` });
  await browser.session.cdp.send('Page.bringToFront');
  if (!await browser.session.waitFor('return !!window.inkbox?.world && window.inkbox.speedIndex === 0', { timeoutMs: 30000 })) throw new Error('PRODUCT_BOOT_BLOCKED');
  if (renderer === 'Three' && !await browser.session.waitFor('return !!window.inkbox?.render3d?.renderer', { timeoutMs: 30000 })) throw new Error('RENDERER_BOOT_BLOCKED');
  const setup = await pageCall('setup', { map, native, normalize });
  if (setup.viewport.width !== 1366 || setup.viewport.height !== 768 || setup.viewport.dpr !== 1) throw new Error('VIEWPORT_DRIFT');
  return setup;
}

function pageErrors() {
  return browser.session.cdp.events.filter(e => e.method === 'Runtime.exceptionThrown' ||
    e.method === 'Network.loadingFailed' && !e.params.canceled ||
    e.method === 'Network.responseReceived' && e.params.response.status >= 400 ||
    e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
    .map(e => ({ method: e.method, params: JSON.parse(JSON.stringify(e.params).replaceAll(server.origin, '<localhost>')) }));
}

function checkT0(setup, map = 'standard') {
  const reference = manifest.t0?.[map];
  const key = { mortal: setup.t0.sha256, upper: setup.otherPlanes.upper.sha256, nether: setup.otherPlanes.nether.sha256,
    advanceState: setup.advanceState, seed: setup.world.seed, generation: setup.world.generation };
  if (reference && JSON.stringify(key) !== JSON.stringify(reference)) throw new Error(`T0_MISMATCH: ${map}`);
  manifest.t0 ??= {}; manifest.t0[map] ??= key;
}

async function run(label, variant, options = {}) {
  console.log(JSON.stringify({ phase: 'start', label, variant, ...options }));
  const setup = await prepare(variant, options);
  if (options.normalize !== false) checkT0(setup, options.map);
  const result = await pageCall('sample', { warmup: options.warmup ?? 120, count: options.count ?? 600,
    mode: options.mode ?? 'primary', events: options.events ?? false, native: options.native ?? false });
  const errors = pageErrors();
  const metadata = { label, variant: options.native ? 'V0_native_direct' : variant, map: options.map ?? 'standard',
    renderer: options.renderer ?? 'Three', mode: options.mode ?? 'primary', setup, pageErrors: errors };
  const entry = persistRun(OUT, label, metadata, result);
  const proof = result.proof;
  const valid = result.validity.count && result.validity.visible && !result.contextLost && !errors.length &&
    (options.native || result.validity.hydroCadence && proof.hydroStepCount > 0 && proof.productWorldCalls === proof.hydroStepCount &&
      proof.worldIsProductWorld && proof.variant === variant && proof.lastDtDays === 4 && !proof.errors.length &&
      (variant !== 'V3_staticSeaStrict' || proof.normalizationCalls.v3Steps === proof.hydroStepCount)) && result.validity.events;
  entry.status = valid ? 'PASS' : 'FAIL'; entry.validity = result.validity; entry.pageErrors = errors;
  manifest.runs.push(entry); bindings.push({ label, proof }); checkpoint();
  console.log(JSON.stringify({ phase: 'complete', label, status: entry.status, raf: entry.summary?.raf, hydroSteps: entry.summary?.hydroSteps }));
  if (!valid) throw new Error(`RUN_INVALID: ${label}`);
  return entry;
}

async function s0() {
  const referenceFiles = ['src/inkbox/sim/hydrology.js', 'src/inkbox/world/terrain.js', 'src/inkbox/main.js',
    'src/inkbox/render3d/stage/PlaneStage.js', 'src/inkbox/render3d/WorldRenderBridge.js', 'src/inkbox/sim/powers.js'];
  for (const file of referenceFiles) provenance.files[file] = { blob: git('rev-parse', `HEAD:${file}`), sha256: sha256(fs.readFileSync(path.join(ROOT, file))) };
  if (provenance.baselineSHA !== provenance.referenceMainAtCommission) {
    const changed = git('diff', '--name-only', provenance.referenceMainAtCommission, provenance.baselineSHA, '--', ...referenceFiles,
      'scripts/cdp.mjs', 'scripts/inkbox-product-frame-timing.mjs');
    provenance.baseDrift = changed;
    if (changed) { fail('ENV_BLOCKED', 'BASE_DRIFT', { changed }); return; }
  }
  const zipPath = args['r2-zip'] ? path.resolve(args['r2-zip']) : path.join(ROOT, 'G4-PERF-天地有度-R2.zip');
  if (!fs.existsSync(zipPath)) { fail('ENV_BLOCKED', 'INPUT_BLOCKED', { message: 'Provide --r2-zip=<original R2 ZIP path>.' }); return; }
  const zip = fs.readFileSync(zipPath), reference = fs.readFileSync(path.join(ROOT, 'analysis/g4/p0a/reference/variants-r2.mjs'));
  const original = zipEntry(zip, 'G4-PERF-R2/g4lab/lib/variants.mjs');
  if (!original.equals(reference)) { fail('ENV_BLOCKED', 'INPUT_FINGERPRINT_MISMATCH'); return; }
  provenance.input = { archiveName: 'G4-PERF-天地有度-R2.zip', archiveSHA256: sha256(zip), variantsSHA256: sha256(original),
    envSHA256: sha256(zipEntry(zip, 'G4-PERF-R2/g4lab/lib/env.mjs')) };
  server = await createLabServer({ root: ROOT }); provenance.adapter = server.provenance;
  const responses = [];
  for (const route of ['/src/inkbox/main.js', '/__g4__/hydrology-entry.mjs', '/__g4__/variants-r2.mjs']) {
    const response = await fetch(server.origin + route), text = await response.text();
    execFileSync(process.execPath, ['--input-type=module', '--check'], { input: text, encoding: 'utf8', windowsHide: true });
    responses.push({ route, status: response.status, sha256: sha256(text), nodeImport: /(?:from\s*|import\s*)['"]node:/.test(text) });
  }
  provenance.serverResponses = responses;
  if (responses.some(r => r.status !== 200 || r.nodeImport)) { fail('ENV_BLOCKED', 'ADAPTER_RESPONSE_INVALID'); return; }
  browser = await launchLabBrowser({ ...(args.browser ? { executable: args.browser } : {}), headless: !!args.headless });
  provenance.environment = browser.environment;
  try { provenance.environment.powerMode = execFileSync('powercfg', ['/getactivescheme'], { encoding: 'utf8', windowsHide: true }).trim(); }
  catch { provenance.environment.powerMode = null; provenance.environment.powerModeReason = 'Host power scheme command unavailable.'; }
  await browser.session.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT_PAUSE });
  const setup = await prepare('V0_current'); checkT0(setup);
  const hardware = classifyHardware(browser.environment, setup.webgl);
  provenance.environment.productWebgl = setup.webgl; provenance.environment.hardware = hardware;
  if (!hardware.pass) { fail('ENV_BLOCKED', 'GPU_UNCONFIRMED', { hardware, webgl: setup.webgl }); return; }
  const oracle = await pageCall('oracle'); writeJson(path.join(OUT, 'v0-oracle.json'), oracle);
  if (oracle.status !== 'PASS') { fail('INCONCLUSIVE', 'V0_ORACLE_FAILED', { oracle }); return; }
  await run('s0-v0-binding', 'V0_current', { warmup: 12, count: 24, mode: 'smoke' });
  for (const variant of ['V1_noErosion', 'V3_staticSeaStrict', 'V9_hydrologyOff'])
    await run(`s0-${variant}-binding`, variant, { warmup: 12, count: 24, mode: 'smoke' });
  const fingerprints = bindings.map(b => b.proof.fingerprint.split(':').at(-1));
  if (new Set(fingerprints).size !== 4) throw new Error('VARIANT_FINGERPRINT_COLLISION');
  // Untouched native V0 is descriptive only and is never pooled with normalized ABBA.
  server.setNative(true);
  const nativeResponse = await (await fetch(server.origin + '/src/inkbox/main.js')).arrayBuffer();
  if (sha256(new Uint8Array(nativeResponse)) !== server.provenance.mainSourceSHA256) throw new Error('NATIVE_MAIN_HASH_MISMATCH');
  await run('s0-native-v0-unnormalized', 'V0_current', { warmup: 120, count: 120, native: true, normalize: false, mode: 'native-description' });
  manifest.stages.S0 = { status: 'PASS', input: 'PASS', sourceBoundary: 'PASS', v0Oracle: 'PASS',
    initialState: 'PASS', bindingFingerprints: 'PASS', realProductCalls: 'PASS', hardware: 'PASS',
    nativeMainByteIdentical: 'PASS', checkpoint: 'S0 complete; S1 may run.' };
  checkpoint();
}

async function s1() {
  let aa, delta;
  for (let attempt = 1; attempt <= 2; attempt++) {
    aa = [await run(`s1-aa${attempt}-a`, 'V0_current'), await run(`s1-aa${attempt}-b`, 'V0_current')];
    delta = Math.abs(aa[0].summary.raf.p95 - aa[1].summary.raf.p95);
    manifest.aaAttempts ??= []; manifest.aaAttempts.push({ attempt, p95Ms: aa.map(a => a.summary.raf.p95), differenceMs: delta, pass: delta <= 3 }); checkpoint();
    if (delta <= 3) break;
    if (attempt === 1) {
      // One bounded environment inspection and one complete retry, never selective deletion.
      writeJson(path.join(OUT, 'aa-noise-inspection.json'), { firstAttempt: manifest.aaAttempts[0],
        pageState: await browser.session.js('return {visibility:document.visibilityState,focus:document.hasFocus(),width:innerWidth,height:innerHeight,dpr:devicePixelRatio};'),
        action: 'Rebuild both segments with the unchanged fixed environment once. No samples removed and no configuration changed.' });
    }
  }
  manifest.aa = manifest.aaAttempts.at(-1);
  if (delta > 3) {
    manifest.stages.S1 = { status: 'INCONCLUSIVE', reason: 'INCONCLUSIVE_NOISE', abba: 'NOT_RUN' };
    fail('INCONCLUSIVE', 'INCONCLUSIVE_NOISE'); return;
  }
  const abba = [];
  for (const [i, variant] of ['V0_current', 'V3_staticSeaStrict', 'V3_staticSeaStrict', 'V0_current'].entries())
    abba.push(await run(`s1-abba-${i + 1}`, variant));
  const v1 = await run('s1-diagnostic-v1', 'V1_noErosion', { count: 300, mode: 'short-raf-diagnostic' });
  const v9 = await run('s1-diagnostic-v9', 'V9_hydrologyOff', { count: 300, mode: 'short-raf-diagnostic' });
  const assessment = assessPrimary(abba);
  manifest.primary = assessment;
  manifest.stages.S1 = { status: 'PASS', aaDifferenceMs: delta, abba: abba.map(r => r.label), assessment,
    lowerBound: { v1: v1.summary.raf, v9: v9.summary.raf, note: 'V9 still follows normal product dirty/render submission; not GPU idle.' },
    checkpoint: 'S1 main rounds complete; later stages depend on this evidence.' };
  checkpoint();
  const v0MeanP95 = (abba[0].summary.raf.p95 + abba[3].summary.raf.p95) / 2;
  if (assessment.pairs.every(p => p.improvementMs < 5) && v0MeanP95 - v9.summary.raf.p95 < 5) {
    fail('NO_GO', 'S1_V3_AND_V9_NO_MATERIAL_BENEFIT'); return;
  }
  if (assessment.tailRegression) { fail('INCONCLUSIVE', 'TAIL_REGRESSION'); return; }
}

async function s2() {
  const runs = [];
  for (const variant of ['V0_current', 'V3_staticSeaStrict']) runs.push(await run(`s2-events-${variant}`, variant, { events: true, mode: 'events' }));
  manifest.stages.S2 = { status: 'PASS', runs: runs.map(r => r.label),
    ruleEquivalenceRequired: false, description: 'Authoritative powers.addWater at measured hydro step 15 and powers.sculpt at step 35; actual mutations retained in raw completion records.' };
  checkpoint();
}

async function s3() {
  if (!manifest.primary?.clearBenefit) { manifest.stages.S3 = { status: 'NOT_RUN', reason: 'S1_CLEAR_BENEFIT_GATE_NOT_MET' }; return; }
  const runs = [];
  for (const variant of ['V0_current', 'V3_staticSeaStrict']) runs.push(await run(`s3-canvas-${variant}`, variant, { renderer: 'Canvas', mode: 'confirmation' }));
  try {
    const fixtureSHA = git('rev-parse', 'bfabe00');
    const source = execFileSync('git', ['show', `${fixtureSHA}:scripts/inkbox-g2-h3-archipelago-world.mjs`], { cwd: ROOT });
    const text = source.toString('utf8'), converted = text.replaceAll("'../src/inkbox/", "'/src/inkbox/");
    fs.writeFileSync(path.join(ROOT, 'analysis/g4/p0a/reference/archipelago-bfabe00.mjs'), source);
    fs.writeFileSync(path.join(ROOT, 'analysis/g4/p0a/reference/archipelago-browser.mjs'), converted);
    provenance.fixture = { sourceCommit: fixtureSHA, sourceSHA256: sha256(source), browserSHA256: sha256(converted), importOnlyRewrite: true };
    for (const variant of ['V0_current', 'V3_staticSeaStrict']) runs.push(await run(`s3-archipelago-${variant}`, variant, { map: 'archipelago', mode: 'confirmation' }));
  } catch (error) { fail('INCONCLUSIVE', 'FIXTURE_BLOCKED', { message: error.message }); return; }
  if (provenance.environment.productWebgl.timerExtension) {
    for (const variant of ['V0_current', 'V3_staticSeaStrict']) runs.push(await run(`s3-gpu-${variant}`, variant, { count: 300, mode: 'diagnostic' }));
  }
  manifest.stages.S3 = { status: 'PASS', runs: runs.map(r => r.label), diagnosticsPooledWithPrimary: false }; checkpoint();
}

try {
  await s0();
  if (!stop && suite === 'all') await s1();
  if (!stop && suite === 'all') await s2();
  if (!stop && suite === 'all') await s3();
  if (!stop) {
    manifest.status = suite === 'smoke' ? 'S0_PASS' : manifest.primary?.clearBenefit ? 'GO_P1_REVIEW' : 'INCONCLUSIVE';
    manifest.reason = suite === 'smoke' ? 'REQUESTED_SMOKE_ONLY' : manifest.primary?.clearBenefit ? 'S1_THRESHOLDS_AND_S2_VALID' : 'S1_THRESHOLD_NOT_MET';
  }
} catch (error) {
  const message = error.message.replaceAll(ROOT, '<checkout>');
  const errors = browser ? pageErrors() : [];
  let pageState = null;
  try { if (browser) pageState = await browser.session.js('return {url:location.href,ready:document.readyState,visibility:document.visibilityState,world:!!window.inkbox?.world,speed:window.inkbox?.speedIndex,renderer:!!window.inkbox?.render3d?.renderer,body:document.body?.innerText?.slice(0,1000)};', { timeoutMs: 5000 }); } catch {}
  writeJson(path.join(OUT, 'failure.json'), { message, browserStderr: error.browserStderr ?? null, pageErrors: errors, pageState });
  if (!manifest.stages.S0) manifest.stages.S0 = { status: 'FAIL', reason: message };
  fail(manifest.stages.S0?.status === 'PASS' ? 'INCONCLUSIVE' : 'ENV_BLOCKED', /EVENT_BLOCKED/.test(message) ? 'EVENT_BLOCKED' : 'EXPERIMENT_BLOCKED', { message });
} finally {
  for (const stage of ['S0', 'S1', 'S2', 'S3']) manifest.stages[stage] ??= { status: 'NOT_RUN', reason: manifest.reason };
  manifest.finishedAt = new Date().toISOString(); checkpoint();
  try { await browser?.session.close(); } catch (error) { manifest.failures.push({ reason: 'BROWSER_CLEANUP', message: error.message }); }
  await server?.close(); checkpoint();
  console.log(JSON.stringify({ status: manifest.status, reason: manifest.reason, runs: manifest.runs.length, out: path.relative(ROOT, OUT).replaceAll('\\', '/') }));
  process.exitCode = ['GO_P1_REVIEW', 'NO_GO', 'S0_PASS'].includes(manifest.status) ? 0 : 2;
}
