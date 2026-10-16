// Browser-only experiment controls. No product source or RAF loop is changed.
import * as H from '/src/inkbox/sim/hydrology.js';
import * as T from '/src/inkbox/world/terrain.js';
import * as P from '/src/inkbox/sim/powers.js';
import { World } from '/src/inkbox/world/world.js';
import { SEA_LEVEL, TIME } from '/src/inkbox/core/config.js';

const raf = () => new Promise(requestAnimationFrame);
const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(v => v.toString(16).padStart(2, '0')).join('');
const jsonSha = value => sha(new TextEncoder().encode(JSON.stringify(value)));
let setupRecord = null;

async function worldDigest(world) {
  const layers = {};
  for (const key of Object.keys(world).sort()) {
    const value = world[key];
    if (ArrayBuffer.isView(value)) layers[key] = await sha(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  const logical = {};
  for (const key of ['w', 'h', 'seed', 'day', 'version', 'generation', 'mapProgress', 'entities',
    'villages', 'factions', 'leylines', 'sites', 'artifacts', 'artifactLog', 'ascended', 'chronicle']) logical[key] = world[key] ?? null;
  const data = { layers, logical: await jsonSha(logical) };
  return { ...data, sha256: await jsonSha(data) };
}

function webglInfo() {
  const r = window.inkbox.render3d?.renderer;
  if (!r) return { available: false, reason: 'Canvas path has no WebGL context' };
  const gl = r.gpu.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
  return { available: true, vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
    renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
    version: gl.getParameter(gl.VERSION), contextLost: gl.isContextLost(),
    timerExtension: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
}

function cameraState() {
  const k = window.inkbox, r = k.render3d?.renderer;
  if (r) return { renderer: 'Three', position: r.cameraRig.camera.position.toArray(),
    target: r.cameraRig.controls.target.toArray(), zoom: r.cameraRig.camera.zoom, lod: r.getLODStats() };
  return { renderer: 'Canvas', x: k.camera.x, y: k.camera.y, zoom: k.camera.zoom,
    viewW: k.camera.viewW, viewH: k.camera.viewH, relief: k.camera.relief };
}

function viewportState() {
  const k = window.inkbox, vv = window.visualViewport;
  const canvases = [...document.querySelectorAll('#inkCanvas, #inkCanvas3D')].map(canvas => {
    const rect = canvas.getBoundingClientRect(), style = getComputedStyle(canvas);
    return { id: canvas.id, width: canvas.width, height: canvas.height,
      clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      display: style.display, visibility: style.visibility,
      active: canvas === (k?.render3d?.renderer?.gpu?.domElement ?? k?.canvas ?? null) };
  });
  return { innerWidth, innerHeight, dpr: devicePixelRatio, outerWidth, outerHeight,
    visualViewport: vv ? { width: vv.width, height: vv.height, scale: vv.scale,
      offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop } : null, canvases };
}

export async function setup({ normalize = true, map = 'standard', native = false } = {}) {
  const k = window.inkbox;
  if (k.speedIndex !== 0 || k.world.day !== 0) throw new Error('BOOT_PAUSE_FAILED: simulation ran before setup');
  k.newWorld('expanse', 673231, { generationVersion: 2, terrainPreset: 'standard', progressive: false });
  if (map === 'archipelago') {
    const fixture = await import('/analysis/g4/p0a/reference/archipelago-browser.mjs');
    fixture.applyArchipelagoFixture(k.world);
  }
  const beforeWarm = await worldDigest(k.world);
  const start = performance.now();
  for (let i = 0; i < 30; i++) H.stepHydrology(k.world, 4, null);
  const v0PrewarmMs = performance.now() - start;
  let normalization = null;
  if (normalize) normalization = (await import('/__g4__/hydrology-entry.mjs')).prepareWorld(k.world);
  T.flushDirty(k.world);
  k.terrain.invalidate(); k.dirty = true;
  // The normal adapter performs setWorld and binds all planes on its own RAF.
  for (let i = 0; i < 4; i++) await raf();
  const r = k.render3d?.renderer;
  if (r) {
    await r.art.comparisonReady;
    r.cameraRig.fit();
    for (let i = 0; i < 4; i++) await raf();
    if ([...r.stages].some(([plane, stage]) => stage.world !== (plane === 'mortal' ? k.world : k.world[plane])))
      throw new Error('STAGE_WORLD_MISMATCH');
  } else k.camera.fit(k.world);
  const t0 = await worldDigest(k.world);
  const otherPlanes = { upper: await worldDigest(k.upper), nether: await worldDigest(k.nether) };
  const speedIndex = TIME.speeds.findIndex(speed => speed.mult === 2);
  if (speedIndex < 1) throw new Error('SPEED_2X_MISSING');
  if (k.hydroAccum !== 0 || k.decayAccum !== 0) throw new Error('INITIAL_ACCUMULATOR_DRIFT');
  const module = native ? null : await import('/__g4__/hydrology-entry.mjs');
  module?.resetCounters();
  setupRecord = { beforeWarm, t0, otherPlanes, v0PrewarmMs, normalization, map, native,
    speedIndex, speed: TIME.speeds[speedIndex], advanceState: structuredClone(k.advanceState),
    world: { w: k.world.w, h: k.world.h, seed: k.world.seed, day: k.world.day, generation: k.world.generation },
    camera: cameraState(), webgl: webglInfo(), viewport: viewportState(),
    visibility: document.visibilityState,
    initializationExcluded: '30 direct V0 steps, shared enterStaticSea + flushDirty, normal scene/cache preparation, camera fit; all outside RAF sampling.' };
  return setupRecord;
}

function cloneHydroWorld(world) {
  const out = new World(world.w, world.h, world.seed);
  // Hydrology only consumes the mortal world's own state and World methods.
  const own = { ...world }; delete own.upper; delete own.nether;
  Object.assign(out, structuredClone(own));
  return out;
}

export async function oracle() {
  const k = window.inkbox;
  if (k.speedIndex !== 0) throw new Error('ORACLE_REQUIRES_PAUSE');
  const adapter = await import('/__g4__/hydrology-entry.mjs');
  const a = cloneHydroWorld(k.world), b = cloneHydroWorld(k.world);
  for (let i = 0; i < 10; i++) { H.stepHydrology(a, 4, null); adapter.stepHydrology(b, 4, null); }
  const layers = {};
  for (const key of ['height', 'water', 'type', 'qi']) {
    let differences = 0;
    for (let i = 0; i < a.size; i++) if (!Object.is(a[key][i], b[key][i])) differences++;
    layers[key] = { differences, directSHA256: await sha(a[key]), adapterSHA256: await sha(b[key]) };
  }
  const proof = adapter.readProbe(); adapter.resetCounters();
  return { status: Object.values(layers).every(layer => layer.differences === 0) ? 'PASS' : 'FAIL',
    steps: 10, dtDays: 4, tolerance: 0, layers, proof };
}

function eventPoint(world) {
  // Deterministic distance-to-sea BFS; setup only, never in a measured frame.
  const distance = new Int32Array(world.size); distance.fill(-1);
  const queue = new Int32Array(world.size); let head = 0, tail = 0;
  for (let i = 0; i < world.size; i++) if (world.height[i] < SEA_LEVEL) { distance[i] = 0; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++], x = i % world.w, y = Math.floor(i / world.w);
    for (const j of [x ? i - 1 : -1, x < world.w - 1 ? i + 1 : -1, y ? i - world.w : -1, y < world.h - 1 ? i + world.w : -1])
      if (j >= 0 && distance[j] < 0) { distance[j] = distance[i] + 1; queue[tail++] = j; }
  }
  for (let y = 24; y < world.h - 24; y++) for (let x = 24; x < world.w - 24; x++) {
    const i = y * world.w + x;
    if (distance[i] > 20 && world.height[i] < .65) return { x, y, distanceToSea: distance[i] };
  }
  throw new Error('EVENT_BLOCKED: no inland fixture point farther than 20 cells from sea');
}

function patchSummary(world, point) {
  let water = 0, height = 0, wetCells = 0, cells = 0;
  for (let y = point.y - 10; y <= point.y + 10; y++) for (let x = point.x - 10; x <= point.x + 10; x++) {
    const i = y * world.w + x; water += world.water[i]; height += world.height[i];
    wetCells += world.water[i] > .0008 ? 1 : 0; cells++;
  }
  return { waterSum: water, heightSum: height, wetCells, cells, radius: 10 };
}

export async function sample({ warmup = 120, count = 600, mode = 'primary', events = false, native = false } = {}) {
  if (!setupRecord) throw new Error('SETUP_REQUIRED');
  const k = window.inkbox, adapter = native ? null : await import('/__g4__/hydrology-entry.mjs');
  const point = events ? eventPoint(k.world) : null;
  const diagnostics = mode === 'diagnostic', r = k.render3d?.renderer, gl = diagnostics && r ? r.gpu.getContext() : null;
  const timer = gl?.getExtension('EXT_disjoint_timer_query_webgl2');
  const pending = [], gpuSamples = [], eventLog = [], frames = [], warmupFrames = [];
  let gpuInvalid = 0, gpuSkipped = 0, contextLost = false, disjointObserved = false;
  let armed = false, updateMs = 0, renderSubmitMs = 0, stageUpdateMs = 0, stageRenderMs = 0;
  let drawCalls = null, triangles = null;
  const onLost = () => { contextLost = true; };
  r?.canvas?.addEventListener('webglcontextlost', onLost);
  const originals = { update: k.update, render: k.render, stageUpdate: r?.update, stageRender: r?.render };
  const poll = () => {
    if (!timer) return;
    const disjoint = !!gl.getParameter(timer.GPU_DISJOINT_EXT);
    if (disjoint) { disjointObserved = true; for (const p of pending) p.disjoint = true; }
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i]; if (!gl.getQueryParameter(p.query, gl.QUERY_RESULT_AVAILABLE)) continue;
      const ns = gl.getQueryParameter(p.query, gl.QUERY_RESULT);
      if (disjoint || p.disjoint) gpuInvalid++; else gpuSamples.push({ frame: p.frame, gpuMs: ns / 1e6, disjoint: false });
      gl.deleteQuery(p.query); pending.splice(i, 1);
    }
  };
  if (diagnostics) {
    k.update = function (...args) { const t = performance.now(); try { return originals.update.apply(this, args); } finally { updateMs += performance.now() - t; } };
    k.render = function (...args) { const t = performance.now(); try { return originals.render.apply(this, args); } finally { renderSubmitMs += performance.now() - t; } };
    if (r) {
      r.update = function (...args) { const t = performance.now(); try { return originals.stageUpdate.apply(this, args); } finally { stageUpdateMs += performance.now() - t; } };
      r.render = function (...args) {
        poll(); let query = null;
        if (armed && timer && pending.length < 8) { query = gl.createQuery(); if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query); }
        if (armed && !query) gpuSkipped++;
        const t = performance.now();
        try { return originals.stageRender.apply(this, args); }
        finally {
          stageRenderMs += performance.now() - t;
          if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); pending.push({ query, frame: frames.length, disjoint: false }); }
          drawCalls = this.gpu.info.render.calls; triangles = this.gpu.info.render.triangles;
        }
      };
    }
  }
  let previous = null, prevProbe = null, prevAccum = k.hydroAccum, prevProductTime = null, measuredStartCount = 0;
  try {
    k.setSpeed(setupRecord.speedIndex);
    for (let i = -warmup; i <= count; i++) {
      const timestamp = await raf(), probe = adapter?.readProbe() ?? null;
      const delta = previous === null ? null : timestamp - previous;
      const hydroSteps = prevProbe && probe ? probe.hydroStepCount - prevProbe.hydroStepCount : null;
      const hydrologyMs = prevProbe && probe ? probe.hydroTotalMs - prevProbe.hydroTotalMs : null;
      const productLastTime = k.lastTime;
      const rawProductDt = prevProductTime === null ? null : productLastTime - prevProductTime;
      const productDt = rawProductDt === null ? null : Math.min(Math.max(rawProductDt, 0), .12);
      let expectedAccum = productDt === null ? null : prevAccum + productDt, expected = null;
      if (expectedAccum !== null) {
        expected = 0;
        while (expectedAccum >= .16 && expected < 3) { expectedAccum -= .16; expected++; }
      }
      const cadenceMatch = expected === null ? null : hydroSteps === expected && Object.is(expectedAccum, k.hydroAccum);
      const record = { frame: i, rafTimestamp: timestamp, rafIntervalMs: delta,
        updateMs: diagnostics ? updateMs : null, renderSubmitMs: diagnostics ? renderSubmitMs : null,
        stageUpdateMs: diagnostics ? stageUpdateMs : null, stageRenderMs: diagnostics ? stageRenderMs : null,
        cpuUnavailableReason: diagnostics ? null : 'Low-perturbation main round does not wrap product update/render.',
        hydrologyMs, hydroSteps, expectedHydroSteps: expected, hydroCadenceMatch: cadenceMatch,
        productLastTimeSeconds: productLastTime, productDtSeconds: productDt, rawProductDtSeconds: rawProductDt,
        hydroAccumulatorBefore: prevAccum, expectedHydroAccumulatorAfter: expectedAccum,
        hydroAccumulatorAfter: k.hydroAccum,
        hydroStepCounterBefore: prevProbe?.hydroStepCount ?? null, hydroStepCounterAfter: probe?.hydroStepCount ?? null,
        visibility: document.visibilityState, contextLost: contextLost || !!gl?.isContextLost(),
        gpuMs: null, gpuValid: null, gpuDisjoint: null,
        gpuUnavailableReason: diagnostics ? (timer ? 'Asynchronous query result stored separately by frame.' : 'Timer extension unavailable.') : 'GPU queries excluded from low-perturbation main round.',
        drawCalls: diagnostics ? drawCalls : null, triangles: diagnostics ? triangles : null,
        estimatedJsPayloadBytes: null, jsPayloadReason: 'GL upload calls are not intercepted; no estimate made.',
        variant: native ? 'V0_native_direct' : probe?.variant, map: setupRecord.map, renderer: setupRecord.camera.renderer,
        eventLabel: null };
      if (i < 0) warmupFrames.push(record);
      if (i === 0) { armed = true; measuredStartCount = probe?.hydroStepCount ?? 0; }
      if (i > 0) {
        frames.push(record);
        if (events) {
          const steps = probe.hydroStepCount - measuredStartCount;
          for (const spec of [{ at: 15, name: 'inland-water', amount: .10, radius: 6 }, { at: 25, name: 'local-sculpt', amount: .026, radius: 5 }]) {
            if (steps < spec.at || eventLog.some(e => e.name === spec.name)) continue;
            const before = patchSummary(k.world, point); k.history.begin();
            if (spec.name === 'inland-water') P.addWater(k.world, point.x + .5, point.y + .5, spec.radius, spec.amount, k.history);
            else P.sculpt(k.world, point.x + .5, point.y + .5, spec.radius, spec.amount, k.history);
            k.history.end(spec.name); k.dirty = true;
            const after = patchSummary(k.world, point);
            eventLog.push({ ...spec, actualStep: steps, frame: i, point, before, after,
              authoritativeEntry: spec.name === 'inland-water' ? 'powers.addWater' : 'powers.sculpt' });
            record.eventLabel = spec.name;
          }
          if (hydroSteps > 0 && steps % 5 === 0) record.retreat = { step: steps, ...patchSummary(k.world, point) };
        }
      }
      previous = timestamp; prevProbe = probe; prevAccum = k.hydroAccum; prevProductTime = productLastTime;
      updateMs = 0; renderSubmitMs = 0; stageUpdateMs = 0; stageRenderMs = 0;
    }
    armed = false; k.setSpeed(0);
    for (let i = 0; i < 60 && pending.length; i++) { await raf(); poll(); }
    const unresolved = pending.length;
    const proof = adapter?.readProbe() ?? null;
    return { frames, warmupFrames, proof, events: eventLog,
      gpu: { extension: !!timer, valid: gpuSamples.length, invalid: gpuInvalid, skipped: gpuSkipped,
        unresolved, disjointObserved, samples: gpuSamples, estimatedJsPayloadBytes: null },
      mode, count, warmup, contextLost: contextLost || !!gl?.isContextLost(),
      finalCamera: cameraState(), finalWebgl: webglInfo(),
      validity: { visible: frames.every(f => f.visibility === 'visible'),
        count: frames.length === count && frames.every(f => Number.isFinite(f.rafIntervalMs) && f.rafIntervalMs > 0),
        hydroCadence: native ? null : frames.every(f => f.hydroCadenceMatch === true && f.hydroSteps <= 3),
        events: !events || eventLog.length === 2 && eventLog[0].after.waterSum > eventLog[0].before.waterSum && eventLog[1].after.heightSum > eventLog[1].before.heightSum } };
  } finally {
    armed = false; k.setSpeed(0);
    if (diagnostics) { k.update = originals.update; k.render = originals.render; if (r) { r.update = originals.stageUpdate; r.render = originals.stageRender; } }
    for (const p of pending) gl.deleteQuery(p.query);
    r?.canvas?.removeEventListener('webglcontextlost', onLost);
  }
}
