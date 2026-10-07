#!/usr/bin/env node
// Bounded real-Edge A/B integration test. No performance/art acceptance or soak.
// Run only when the main thread owns the GPU slot. --describe never starts Edge.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launch, findEdge, sleep } from './cdp.mjs';
import { ensureCanonicalMortalCache, ensureCanonicalRealmsCache } from './inkbox-c2c-browser-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || 'reports/local/m2c2d1/comparison');
const port = Number(process.env.INKBOX_PORT || 4241);
const base = process.env.INKBOX_URL || `http://127.0.0.1:${port}`;
const mortal = { save: path.resolve(process.env.INKBOX_C2C_NATURAL_SAVE || 'reports/local/m2c2c/pilot/full-sites-natural-save.json'),
  meta: path.resolve(process.env.INKBOX_C2C_NATURAL_META || 'reports/local/m2c2c/pilot/full-natural-geography.json'), seed: 226, day: 72000 };
const realms = { save: path.resolve(process.env.INKBOX_C2C_REALMS_SAVE || 'reports/local/m2c2c/pilot/natural-realms-save.json'),
  meta: path.resolve(process.env.INKBOX_C2C_REALMS_META || 'reports/local/m2c2c/pilot/natural-realms-meta.json'),
  history: path.resolve(process.env.INKBOX_C2C_REALMS_HISTORY || 'reports/local/m2c2c/pilot/natural-realms-history.json'), seed: 20260923, day: 21600 };
const cases = [
  { key: 'mortal-coast-near', recipe: 'mortal', plane: 'mortal', kind: 'coast', zoom: 5, polar: .80, yaw: .30 },
  { key: 'upper-boundary-near', recipe: 'realms', plane: 'upper', kind: 'boundary', zoom: 3.5, polar: .78, yaw: .15 },
  { key: 'nether-boundary-near', recipe: 'realms', plane: 'nether', kind: 'boundary', zoom: 3.5, polar: .78, yaw: .15 },
];

// Install small read-only probes in the page; actual product update/render stays live.
async function installProbe() {
  const k = window.inkbox, r = k.render3d.renderer, gl = r.gpu.getContext();
  const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map(x => x.toString(16).padStart(2, '0')).join('');
  const jsonHash = value => hash(new TextEncoder().encode(JSON.stringify(value)));
  const bytes = array => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  const probe = window.__artComparisonProbe = { shaderErrors: [], releases: [], events: [] };
  const originalShaderError = r.gpu.debug.onShaderError;
  r.gpu.debug.checkShaderErrors = true;
  r.gpu.debug.onShaderError = (context, program, vertex, fragment) => {
    probe.shaderErrors.push({ program: context.getProgramInfoLog(program), vertex: context.getShaderInfoLog(vertex), fragment: context.getShaderInfoLog(fragment) });
    originalShaderError?.(context, program, vertex, fragment);
  };
  probe.settle = async () => { for (let i = 0; i < 24; i++) await new Promise(requestAnimationFrame); r.render(); };
  probe.trackWorldRelease = () => {
    const resources = new Map();
    const add = (value, type, label) => { if (value && !resources.has(value)) resources.set(value, { type, label, uuid: value.uuid, disposed: 0 }); };
    for (const stage of r.stages.values()) {
      for (const [name, value] of Object.entries({ terrain: stage.terrain?.geometry, water: stage.water?.geometry })) add(value, 'geometry', `${stage.plane}/${name}`);
      for (const [name, value] of Object.entries({ terrain: stage.terrain?.inkMaterial, legacyTerrain: stage.terrain?.material,
        water: stage.water?.inkMaterial, legacyWater: stage.water?.material })) add(value, 'material', `${stage.plane}/${name}`);
      for (const [name, value] of Object.entries({ height: stage.terrain?.artData?.heightTexture, type: stage.terrain?.artData?.typeTexture,
        surface: stage.surfaceField?.texture, scalar: stage.scalarField?.texture })) add(value, 'texture', `${stage.plane}/${name}`);
    }
    add(r.boundary?.geometry, 'geometry', 'boundary'); add(r.boundary?.material, 'material', 'boundary-shader');
    if (r.boundary?.mesh.material !== r.boundary?.material) add(r.boundary?.mesh.material, 'material', 'boundary-main-lambert');
    const records = [...resources.values()];
    for (const [resource, record] of resources) {
      const listener = () => { record.disposed++; resource.removeEventListener('dispose', listener); };
      resource.addEventListener('dispose', listener);
    }
    const entry = { seed: k.world.seed, style: r.art.comparisonStyle, resources: records };
    probe.releases.push(entry); return entry;
  };
  probe.armIdentity = () => {
    probe.world = k.world;
    probe.stageWorlds = new Map([...r.stages].map(([plane, stage]) => [plane, stage.world]));
  };
  probe.capture = async label => {
    r.render();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, rgba = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    const framebufferSHA256 = await hash(rgba);
    const geometry = new Map(), objects = [];
    r.scene.traverse(object => {
      if (!object.geometry) return;
      geometry.set(object.geometry.uuid, object.geometry);
      objects.push({ uuid: object.uuid, name: object.name, geometry: object.geometry.uuid, count: object.isInstancedMesh ? object.count : null });
    });
    const geometryRecords = [];
    for (const [uuid, g] of geometry) {
      const attributes = {};
      // Colour buffers deliberately change with historical palette; positions,
      // normals, topology, semantic attributes and geometry identities do not.
      for (const [name, attribute] of Object.entries(g.attributes)) if (name !== 'color')
        attributes[name] = { count: attribute.count, itemSize: attribute.itemSize, offset: attribute.offset ?? null,
          sha256: await hash(bytes(attribute.array ?? attribute.data.array)) };
      geometryRecords.push({ uuid, drawRange: { ...g.drawRange }, groups: g.groups.map(group => ({ ...group })), attributes,
        index: g.index ? await hash(bytes(g.index.array)) : null });
    }
    objects.sort((a, b) => a.uuid.localeCompare(b.uuid)); geometryRecords.sort((a, b) => a.uuid.localeCompare(b.uuid));
    const picks = [];
    for (const fy of [.25, .5, .75]) for (const fx of [.25, .5, .75]) {
      const hit = r.picker.pick(fx * r.width, fy * r.height, r.width, r.height);
      picks.push(hit ? Object.fromEntries(['kind', 'plane', 'x', 'y', 'entityId', 'entityContainer', 'settlementId', 'houseKey', 'artifactId', 'siteId', 'leylineId', 'riftId', 'targetPlane', 'ax', 'ay', 'bx', 'by', 'breach']
        .map(key => [key, hit[key] ?? null])) : null);
    }
    const programs = (r.gpu.info.programs || []).map(p => ({ id: p.id, name: p.name, usedTimes: p.usedTimes,
      linked: gl.getProgramParameter(p.program, gl.LINK_STATUS), log: gl.getProgramInfoLog(p.program), runnable: p.diagnostics?.runnable ?? null }));
    const glErrors = []; for (let error = gl.getError(); error !== gl.NO_ERROR; error = gl.getError()) glErrors.push(error);
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const record = { label, style: r.art.comparisonStyle, sourceRevision: r.art.comparisonSourceRevision, debugView: r.art.debugView,
      worldSHA256: await jsonHash(k.world), advanceSHA256: await jsonHash(k.advanceState), sameWorldObject: probe.world === k.world,
      sameRendererObject: window.inkbox.render3d.renderer === r,
      sameStageWorldObjects: [...r.stages].every(([plane, stage]) => probe.stageWorlds.get(plane) === stage.world),
      camera: { position: r.cameraRig.camera.position.toArray(), target: r.cameraRig.controls.target.toArray(), zoom: r.cameraRig.camera.zoom },
      framebuffer: { size: [W, H], sha256: framebufferSHA256 }, geometrySHA256: await jsonHash(geometryRecords), objectGeometrySHA256: await jsonHash(objects),
      geometry: geometryRecords, objectGeometry: objects, picks, boundaryStats: r.boundary ? { ...r.boundary.stats } : null,
      resources: { ...r.gpu.info.memory, programs: programs.length }, draw: { calls: r.gpu.info.render.calls, triangles: r.gpu.info.render.triangles },
      programs, glErrors, shaderErrors: probe.shaderErrors.slice(), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
    record.materials = { water: r.stages.get('mortal')?.water?.mesh.material.type, boundary: r.boundary?.mesh.material.type,
      terrain: await Promise.all([...r.stages].map(async ([plane, stage]) => ({ plane, visible: stage.visible,
        type: stage.terrain?.mesh.material.type, shaderSHA256: stage.terrain?.inkMaterial ? await jsonHash(stage.terrain.inkMaterial.fragmentShader) : null }))) };
    probe.events.push(record); return record;
  };
  return true;
}

async function prepareCase(spec) {
  const k = window.inkbox, r = k.render3d.renderer, w = k.world;
  document.getElementById('inkInspectClose')?.click();
  k.selection = null; r.setRealmViewState(k.getRealmViewState());
  r.setActivePlane('mortal');
  let poi;
  if (spec.kind === 'coast') {
    let best = -1, bestDepth = 0;
    for (let i = 0; i < w.size; i++) {
      const depth = w.water[i]; if (depth <= .01) continue;
      const x = i % w.w, y = (i / w.w) | 0;
      const dry = (x > 0 && w.water[i - 1] <= .0015) || (x < w.w - 1 && w.water[i + 1] <= .0015) ||
        (y > 0 && w.water[i - w.w] <= .0015) || (y < w.h - 1 && w.water[i + w.w] <= .0015);
      if (dry && (depth > bestDepth || (depth === bestDepth && best < 0))) { best = i; bestDepth = depth; }
    }
    if (best < 0) throw Error('canonical coast missing');
    poi = { x: best % w.w, y: (best / w.w) | 0 };
  } else {
    k.selectTool(spec.plane === 'upper' ? 'viewUpper' : 'viewNether');
    k.commitSelection([[Math.floor(w.w * .25), Math.floor(w.h * .25)], [Math.floor(w.w * .75), Math.floor(w.h * .25)],
      [Math.floor(w.w * .75), Math.floor(w.h * .75)], [Math.floor(w.w * .25), Math.floor(w.h * .75)]]);
    r.setRealmViewState(k.getRealmViewState());
    if (!r.realmPrototype.open || r.realmPrototype.targetPlane !== spec.plane) throw Error('product realm window failed');
    const b = r.boundary;
    if (!b.edges) throw Error('boundary edge missing');
    let best = 0; for (let e = 1; e < b.edges; e++) if (b.edgeVisualDepth[e] > b.edgeVisualDepth[best]) best = e;
    const nd = b.edgeNodes; poi = { x: (nd[best * 4] + nd[best * 4 + 2]) / 2, y: (nd[best * 4 + 1] + nd[best * 4 + 3]) / 2 };
  }
  const v = await import('./src/inkbox/render3d/art/VisualScenarios.js');
  v.applyCamera(r, 'WORLD_OVERVIEW', { poi, zoom: spec.zoom, polar: spec.polar, yaw: spec.yaw });
  await window.__artComparisonProbe.settle(); window.__artComparisonProbe.armIdentity();
  return { ...spec, poi };
}

if (process.argv.includes('--describe')) {
  new Function(`return (${installProbe.toString()})();`); new Function(`return (${prepareCase.toString()})({});`);
  console.log(JSON.stringify({ cases, cycles: 3, queue: ['main-style', 'c2d-style', 'c2d1-style'], worldReloadRounds: 2,
    output: path.join(OUT, 'comparison.json'), gpuStarted: false }, null, 2)); process.exit(0);
}

const report = { suite: 'M2-C2D.1 historical A/B GPU integration', pass: false, startedAt: new Date().toISOString(),
  host: { hostname: os.hostname(), platform: os.platform() }, cases: [], reloads: [], checks: [],
  note: 'Historical draw/triangle differences are recorded; only same-style repeated resources are checked for growth. Not art acceptance or a GPU performance benchmark.' };
let browser, server;
const page = body => browser.js(`return (async()=>{${body}})();`, { timeoutMs: 300000 });
const save = () => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'comparison.json'), JSON.stringify(report, null, 2) + '\n'); };
function check(condition, label) { report.checks.push({ label, passed: !!condition }); assert(condition, label); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function checkRecord(record, reference = null) {
  check(record.glErrors.length === 0 && record.shaderErrors.length === 0, `${record.label}: zero GL/shader errors`);
  check(record.programs.length > 0 && record.programs.every(p => p.linked && p.runnable !== false), `${record.label}: submitted GPU programs linked`);
  check(record.debugView === 'final', `${record.label}: final only`);
  check(record.sameRendererObject && record.sameWorldObject && record.sameStageWorldObjects, `${record.label}: Renderer/World object identity`);
  if (reference) for (const key of ['worldSHA256', 'advanceSHA256', 'camera', 'geometrySHA256', 'objectGeometrySHA256', 'picks', 'boundaryStats'])
    check(same(record[key], reference[key]), `${record.label}: ${key} unchanged`);
}
function noGrowth(record, anchor) {
  for (const key of ['textures', 'geometries', 'programs']) check(record.resources[key] <= anchor.resources[key], `${record.label}: ${key} no cumulative growth (${anchor.resources[key]} -> ${record.resources[key]})`);
}
async function importWorld(spec) {
  await page('window.__artComparisonProbe.pendingImportWorld=window.inkbox.world;return true;');
  const { root } = await browser.cdp.send('DOM.getDocument');
  const { nodeId } = await browser.cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#inkImportFile' });
  assert(nodeId, 'product import input missing');
  await browser.cdp.send('DOM.setFileInputFiles', { nodeId, files: [spec.save] });
  assert(await browser.waitFor(`return window.inkbox?.world!==window.__artComparisonProbe.pendingImportWorld&&window.inkbox?.world?.seed===${spec.seed}&&window.inkbox?.world?.day===${spec.day}`, { timeoutMs: 60000 }), 'canonical import failed');
  await page(`const k=window.inkbox,r=k.render3d.renderer;k.setSpeed(0);await r.art.comparisonReady;
    r.setProductionAssetsEnabled(true);await r.environmentLoadPromise;await r.characterLoadPromise;
    if(r.environmentLoadError||r.characterLoadError)throw r.environmentLoadError||r.characterLoadError;
    r.setGeographyEnabled(true);k.selection=null;r.setRealmViewState(k.getRealmViewState());
    await window.__artComparisonProbe.settle();return true;`);
}
async function capture(label, style) {
  const record = await page(`const r=window.inkbox.render3d.renderer,p=window.__artComparisonProbe;
    await r.art.setComparisonStyle(${JSON.stringify(style)});await r.art.comparisonReady;
    if(${JSON.stringify(style)}!=='c2d1-style'){
      let rejected=false;try{r.art.setDebugView('mass');}catch{rejected=true;}
      if(!rejected||r.art.comparisonDebugSupported)throw Error('historical decomposition was not rejected');
    }
    r.art.setDebugView('final');await p.settle();return p.capture(${JSON.stringify(label)});`);
  check(record.style === style, `${label}: requested style applied`);
  const expectedRevision = { 'main-style': '8b3f2bac761b59bf70f524ff9a00429fa40cc07a', 'c2d-style': 'ef8b43df91c8dff6f01e241301d3d40a4e724d84', 'c2d1-style': null };
  check(record.sourceRevision === expectedRevision[style], `${label}: correct historical provenance`);
  check(record.materials.water === (style === 'main-style' ? 'MeshBasicMaterial' : 'ShaderMaterial'), `${label}: actual historical/current water material`);
  check(record.materials.boundary === (style === 'main-style' ? 'MeshLambertMaterial' : 'ShaderMaterial'), `${label}: actual historical/current boundary material`);
  return record;
}

try {
  report.mortalPreflight = await ensureCanonicalMortalCache({ savePath: mortal.save, metaPath: mortal.meta,
    explicit: !!(process.env.INKBOX_C2C_NATURAL_SAVE || process.env.INKBOX_C2C_NATURAL_META) });
  report.realmsPreflight = await ensureCanonicalRealmsCache({ savePath: realms.save, metaPath: realms.meta, historyPath: realms.history,
    explicit: !!(process.env.INKBOX_C2C_REALMS_SAVE || process.env.INKBOX_C2C_REALMS_META || process.env.INKBOX_C2C_REALMS_HISTORY) });
  if (!process.env.INKBOX_URL) {
    server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(port)], { cwd: ROOT, windowsHide: true, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 100; i++) { if (server.exitCode !== null) throw Error(`owned server exited ${server.exitCode}`); try { ready = (await fetch(`${base}/inkbox.html`)).ok; } catch {} if (ready) break; await sleep(200); }
    assert(ready, 'server not ready');
  }
  const edge = findEdge(); assert(edge, 'Edge unavailable');
  browser = await launch({ url: `${base}/inkbox.html?renderer=3d&assets=on&boundary=strata&geography=on&artStyle=c2d1-style&artDebug=final`, browser: edge, width: 1500, height: 940, gpu: true });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.art?.comparisonReady', { timeoutMs: 60000 }));
  await page('window.inkbox.setSpeed(0);await window.inkbox.render3d.renderer.art.comparisonReady;return true;');
  await page(`return (${installProbe.toString()})();`);
  let recipe = null;
  for (const spec of cases) {
    if (recipe !== spec.recipe) { await importWorld(spec.recipe === 'mortal' ? mortal : realms); recipe = spec.recipe; }
    const entry = { key: spec.key, setup: await page(`return (${prepareCase.toString()})(${JSON.stringify(spec)});`), records: [], queue: null };
    report.cases.push(entry);
    const initial = await capture(`${spec.key}/initial`, 'c2d1-style'); entry.records.push(initial); checkRecord(initial);
    check(initial.picks.some(Boolean), `${spec.key}: picking probe hits visible geometry`);
    const anchors = {};
    for (let round = 0; round < 3; round++) for (const style of ['main-style', 'c2d-style', 'c2d1-style']) {
      const record = await capture(`${spec.key}/${round}/${style}`, style); entry.records.push(record); checkRecord(record, initial);
      if (!anchors[style]) anchors[style] = record; else noGrowth(record, anchors[style]);
      if (style === 'c2d1-style') check(same(record.framebuffer, initial.framebuffer), `${record.label}: exact candidate framebuffer roundtrip`);
      save();
    }
    entry.queue = await page(`const a=window.inkbox.render3d.renderer.art,order=[];
      const names=['main-style','c2d-style','c2d1-style'];
      const requests=names.map(name=>a.setComparisonStyle(name).then(value=>{order.push(value);return value;}));
      const results=await Promise.all(requests);await a.comparisonReady;
      await window.__artComparisonProbe.settle();return {results,order,final:await window.__artComparisonProbe.capture(${JSON.stringify(spec.key + '/queued')})};`);
    check(same(entry.queue.results, ['main-style', 'c2d-style', 'c2d1-style']) && same(entry.queue.order, entry.queue.results), `${spec.key}: queued switch ordering`);
    checkRecord(entry.queue.final, initial); noGrowth(entry.queue.final, anchors['c2d1-style']);
    check(same(entry.queue.final.framebuffer, initial.framebuffer), `${spec.key}: queued candidate framebuffer exact`);
    console.log(`PASS A/B ${spec.key}: linked shaders, 3 roundtrips, exact candidate framebuffer`); save();
  }
  // Re-enter main under the same canonical worlds twice. Ownership checks catch
  // retained old terrain data textures and the ArtPass temporary Lambert.
  const reloadAnchors = {};
  for (let round = 0; round < 2; round++) for (const spec of [mortal, realms]) {
    await capture(`reload/${round}/before`, 'main-style');
    await page('return window.__artComparisonProbe.trackWorldRelease();');
    await importWorld(spec);
    const view = spec === mortal ? cases[0] : cases[1];
    const setup = await page(`return (${prepareCase.toString()})(${JSON.stringify(view)});`);
    const record = await capture(`reload/${round}/${spec.seed}`, 'main-style'); checkRecord(record);
    const release = await page('return window.__artComparisonProbe.releases.at(-1);');
    check(release.resources.length > 0 && release.resources.every(resource => resource.disposed > 0), `${record.label}: all previous World-owned resources disposed`);
    check(release.resources.some(resource => resource.label === 'boundary-main-lambert'), `${record.label}: temporary main Lambert disposal observed`);
    report.reloads.push({ round, setup, record, release });
    if (!reloadAnchors[spec.seed]) reloadAnchors[spec.seed] = record; else noGrowth(record, reloadAnchors[spec.seed]);
    save();
  }
  const finalCandidate = await capture('reload/final-candidate', 'c2d1-style'); checkRecord(finalCandidate); report.finalCandidate = finalCandidate;
  report.errors = { runtime: browser.errors(), console: browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
    .map(e => (e.params.args || []).map(a => a.value ?? a.description ?? '').join(' ')) };
  check(report.errors.runtime.length === 0 && report.errors.console.length === 0, 'zero Edge runtime/console errors');
  report.pass = true; console.log('PASS A/B World reload ownership and stable resources; GL/runtime errors 0');
} catch (error) {
  report.failure = error.stack || String(error); process.exitCode = 1;
  if (browser) {
    report.errors = { runtime: browser.errors(), console: browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
      .map(e => (e.params.args || []).map(a => a.value ?? a.description ?? '').join(' ')) };
    report.pageEvidence = await page('return {url:location.href,events:window.__artComparisonProbe?.events,releases:window.__artComparisonProbe?.releases,shaderErrors:window.__artComparisonProbe?.shaderErrors};').catch(() => null);
  }
  console.error(`FAIL A/B: ${error.message}`);
} finally {
  report.finishedAt = new Date().toISOString();
  if (browser) { report.browser = browser.meta; await browser.close(); }
  server?.kill(); save();
}
