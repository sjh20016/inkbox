import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launch, findEdge } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.INKBOX_H2_PORT || 4198);
const BASE = process.env.INKBOX_URL || `http://127.0.0.1:${PORT}`;
const OUT = path.resolve(process.env.INKBOX_H2_REPORT_DIR || path.join(ROOT, 'reports/analysis/g2-h2'));
const RAW = path.join(OUT, 'raw');
const SEED = Number(process.env.INKBOX_H2_SEED || 673231);
const WARM_FRAMES = 120;
const MEASURE_FRAMES = Number(process.env.INKBOX_H2_FRAMES || 300);
const HEADLESS = process.env.INKBOX_H2_HEADLESS !== '0';
const VIEWPORT = { width: 1440, height: 900 };
const CASES = [
  { id: 'H2-E1', renderer: 'three', map: 'standard', preset: 'expanse' },
  { id: 'H2-E2', renderer: 'canvas', map: 'standard', preset: 'expanse' },
  { id: 'H2-E3', renderer: 'three', map: 'archipelago', preset: 'expanse' },
  { id: 'H2-E4', renderer: 'canvas', map: 'archipelago', preset: 'expanse' },
];
const ALL_RUNS = CASES.flatMap(testCase => [
  { ...testCase, mode: 'low-perturbation', repeat: 1 },
  { ...testCase, mode: 'detailed', repeat: 1 },
  { ...testCase, mode: 'detailed', repeat: 2 },
]);
const RUN_PLAN = ALL_RUNS.filter(run => (!process.env.INKBOX_H2_CASE || run.id === process.env.INKBOX_H2_CASE)
  && (!process.env.INKBOX_H2_MODE || run.mode === process.env.INKBOX_H2_MODE));
assert(RUN_PLAN.length > 0, 'H2 run filter selected no cases');
const SOURCE_FILES = [
  'scripts/cdp.mjs', 'scripts/inkbox-g2-h2-profile.mjs', 'scripts/inkbox-g2-h2-recalculate.mjs',
  'scripts/inkbox-g2-h2-archipelago-world.mjs', 'src/inkbox/main.js', 'src/inkbox/sim/hydrology.js',
  'src/inkbox/world/terrain.js', 'src/inkbox/render/terrainLayer.js',
  'src/inkbox/render3d/WorldRenderBridge.js', 'src/inkbox/render3d/stage/PlaneStage.js',
  'src/inkbox/render3d/Render3DHost.js', 'src/inkbox/render3d/water/WaterLayer.js',
  'src/inkbox/render3d/vegetation/VegetationLayer.js', 'src/inkbox/core/config.js',
];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const round = value => Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
function sourceHashes() {
  return Object.fromEntries(SOURCE_FILES.map(file => [file,
    createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex')]));
}
function evalSource(body) { return `return (async()=>{${body}})();`; }
async function page(browser, body, timeoutMs = 120000) {
  return browser.js(evalSource(body), { timeoutMs });
}
async function waitForServer(url, child) {
  for (let i = 0; i < 100; i += 1) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`Inkbox server exited ${child.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch { /* server is starting */ }
    await sleep(150);
  }
  throw new Error(`Inkbox server did not start at ${url}`);
}
async function ownedGpuInfo(browser) {
  const response = await fetch(`http://127.0.0.1:${browser.meta.debugPort}/json/version`);
  const version = await response.json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SystemInfo.getInfo timed out')), 15000);
      const onMessage = event => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timer); ws.removeEventListener('message', onMessage);
        if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
      };
      ws.addEventListener('message', onMessage);
      ws.send(JSON.stringify({ id: 1, method: 'SystemInfo.getInfo', params: {} }));
    });
  } finally { ws.close(); }
}
async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return { exited: true, exitCode: child?.exitCode ?? null };
  child.kill();
  for (let i = 0; i < 50; i += 1) {
    if (child.exitCode !== null || child.signalCode !== null) return { exited: true, exitCode: child.exitCode, signalCode: child.signalCode };
    await sleep(100);
  }
  return { exited: false, pid: child.pid };
}

function installProbeSource(caseJson, modeJson, repeat) {
  return `
    const k=window.inkbox, mode=${modeJson}, scenario=${caseJson}, repeat=${repeat};
    const probe={enabled:true,mode,frameIndex:null,hydrologyRecords:[],rows:[],currentRow:null};
    window.__INKBOX_G2_H2_PROBE=probe;
    let previousTimestamp=null,hydroCursor=0;
    const add=(object,key,ms)=>{object[key]=(object[key]||0)+ms;};
    const copyRegion=region=>region?{x0:region.x0,y0:region.y0,x1:region.x1,y1:region.y1}:null;
    const originalUpdate=k.update;
    k.update=function(dt){const row=probe.currentRow,start=performance.now();try{return originalUpdate.call(this,dt);}finally{if(row)row.updateCpuMs=performance.now()-start;}};
    const originalRender=k.render;
    k.render=function(now){const row=probe.currentRow,start=performance.now();try{return originalRender.call(this,now);}finally{if(row)row.renderCpuMs=performance.now()-start;}};
    const r=k.render3d?.renderer;
    const installTimed=(object,method,key)=>{
      if(!object||typeof object[method]!=='function')return false;
      const original=object[method];
      object[method]=function(...args){const row=probe.currentRow,start=performance.now();try{return original.apply(this,args);}finally{if(row)add(row.layerMethodMs,key,performance.now()-start);}};
      return true;
    };
    if(r&&mode==='detailed'){
      for(const [plane,stage] of r.stages){
        for(const [object,method,key] of [
          [stage.terrain,'update','terrainMesh'],[stage.terrain,'updateScalarField','terrainScalarField'],
          [stage.terrainSides,'update','terrainSides'],[stage.water,'update','waterMesh'],
          [stage.surfaceField,'update','surfaceField'],[stage.vegetation,'update','vegetation'],
          [stage.entities,'update','entities'],[stage.settlements,'update','settlements']])
          installTimed(object,method,plane+'.'+key);
        const originalStageUpdate=stage.update;
        stage.update=function(...args){const out=originalStageUpdate.apply(this,args),row=probe.currentRow;if(row){
          row.planeTimings||={};row.planeTimings[plane]={...this.timings};
        }return out;};
        const originalChanges=stage.bridge?.changes;
        if(originalChanges)stage.bridge.changes=function(...args){const out=originalChanges.apply(this,args),row=probe.currentRow;if(row){
          row.bridgeRegions||={};row.bridgeRegions[plane]=out?{height:copyRegion(out.height),water:copyRegion(out.water),type:copyRegion(out.type),veg:copyRegion(out.veg),fire:copyRegion(out.fire)}:null;
        }return out;};
      }
      const gl=r.gpu?.getContext?.();
      if(gl){
        const uploadBytes=(method,args)=>{
          for(const value of args){
            if(ArrayBuffer.isView(value))return value.byteLength;
            if(value instanceof ArrayBuffer)return value.byteLength;
          }
          if(method==='bufferData'&&typeof args[1]==='number')return args[1];
          return null;
        };
        probe.glHooks=[];
        for(const method of ['bufferData','bufferSubData','texImage2D','texSubImage2D','compressedTexImage2D','compressedTexSubImage2D']){
          const original=gl[method];if(typeof original!=='function')continue;
          const wrapper=function(...args){const known=uploadBytes(method,args),row=probe.currentRow;try{return original.apply(this,args);}finally{if(row){
            row.gpuUploadCalls=(row.gpuUploadCalls||0)+1;
            if(known===null)row.gpuUploadUnknownByteCalls=(row.gpuUploadUnknownByteCalls||0)+1;
            else row.gpuUploadBytes=(row.gpuUploadBytes||0)+known;
          }}};
          try{Object.defineProperty(gl,method,{configurable:true,writable:true,value:wrapper});if(gl[method]===wrapper)probe.glHooks.push(method);}catch{}
        }
      }
      const gpuRender=r.gpu?.render;
      if(typeof gpuRender==='function')r.gpu.render=function(...args){const row=probe.currentRow,start=performance.now();try{return gpuRender.apply(this,args);}finally{if(row)row.webglSubmissionMs=performance.now()-start;}};
    }
    if(mode==='detailed'&&!r){
      const terrain=k.terrain, originalTerrainRender=terrain?.render;
      if(typeof originalTerrainRender==='function')terrain.render=function(...args){const row=probe.currentRow,start=performance.now();try{return originalTerrainRender.apply(this,args);}finally{if(row)row.canvasTerrainRenderMs=performance.now()-start;}};
    }
    const originalFrame=k.frame;
    k.frame=function(timestamp){
      probe.frameIndex=probe.rows.length;
      const row={index:probe.frameIndex,rafTimestampMs:timestamp,rawRafIntervalMs:previousTimestamp===null?null:timestamp-previousTimestamp,
        mode:probe.mode,hydrology:null,updateCpuMs:null,renderCpuMs:null,frameCpuMs:null,
        documentFocused:document.hasFocus(),visibilityState:document.visibilityState,
        bridgeRegions:null,planeTimings:null,layerMethodMs:mode==='detailed'?{}:null,
        gpuUploadBytes:mode==='detailed'?0:null,gpuUploadCalls:mode==='detailed'?0:null,gpuUploadUnknownByteCalls:mode==='detailed'?0:null,
        webglSubmissionMs:null,canvasTerrainRenderMs:null};
      previousTimestamp=timestamp;probe.currentRow=row;const hydroStart=hydroCursor,start=performance.now();
      try{return originalFrame.call(this,timestamp);}finally{
        row.frameCpuMs=performance.now()-start;
        row.hydrology=probe.hydrologyRecords.slice(hydroStart);hydroCursor=probe.hydrologyRecords.length;
        if(r){row.rendererProfile={...(r.profile||{})};row.updatedPlanes=[...(r.updatedPlanes||[])];row.rendererSize={width:r.width,height:r.height,pixelRatio:r.gpu?.getPixelRatio?.()??null};}
        row.day=k.world?.day??null;row.speedIndex=k.speedIndex;row.paused=k.speedIndex===0||!!k.render3d?.stroke;
        probe.rows.push(row);probe.currentRow=null;
      }
    };
    return {scenario,mode,repeat,world:[k.world.w,k.world.h],seed:k.world.seed,speedIndex:k.speedIndex,rendererReady:!!r,
      installedGlHooks:probe.glHooks||[],fixture:window.__INKBOX_H2_FIXTURE||null};
  `;
}

async function runOne(testCase, mode, repeat, serverChild) {
  const query = testCase.renderer === 'three' ? '?renderer=3d' : '';
  const targetUrl = `${BASE}/inkbox.html${query}`;
  const edge = findEdge();
  if (!edge) throw new Error('Microsoft Edge is required for the real-browser H2 run');
  const browser = await launch({ url: 'about:blank', browser: edge, gpu: true, headless: HEADLESS,
    disableBackgroundThrottling: true, ...VIEWPORT });
  let runError = null;
  try {
    await browser.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const raf=window.requestAnimationFrame.bind(window);let held=false;window.requestAnimationFrame=callback=>raf(ts=>{if(!held&&window.inkbox){held=true;window.inkbox.setSpeed(0);}return callback(ts);});})();` });
    await browser.cdp.send('Page.navigate', { url: targetUrl });
    assert(await browser.waitFor('return !!window.inkbox?.world', { timeoutMs: 60000 }), 'Inkbox did not boot');
    if (testCase.renderer === 'three') assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.gpu', { timeoutMs: 60000 }), 'Three renderer did not boot');
    const gpuInfo = await ownedGpuInfo(browser).catch(error => ({ error: error.message }));

    const setup = await page(browser, `
      const k=window.inkbox,seed=${SEED};k.setSpeed(0);k.newWorld('expanse',seed,{progressive:false,terrainPreset:'standard'});
      let fixture=null;
      if(${JSON.stringify(testCase.map)}==='archipelago'){
        const mod=await import('./scripts/inkbox-g2-h2-archipelago-world.mjs');fixture=mod.applyArchipelagoFixture(k.world);
        window.__INKBOX_H2_FIXTURE=fixture;k.terrain?.invalidate?.();k.dirty=true;
      }
      return {world:[k.world.w,k.world.h],seed:k.world.seed,terrainPreset:k.world.generation?.terrainPreset||null,
        generationVersion:k.world.generation?.version||null,hydroAccum:k.hydroAccum,fixture,
        topology:(await import('./scripts/inkbox-g2-h2-archipelago-world.mjs')).measureArchipelagoTopology(k.world)};
    `, 180000);
    assert.deepEqual(setup.world, [512, 320], 'H2 cases must run the formal 512x320 expanse World');
    assert.equal(setup.seed, SEED, 'World seed drifted');
    if (testCase.map === 'archipelago') assert(setup.fixture?.topology?.islandCount >= 8, 'Archipelago fixture did not produce multiple coherent landmasses');

    // cdp.mjs uses DPR=1 while booting for a stable remote viewport. Restore the actual monitor DPR before measuring.
    await browser.cdp.send('Emulation.clearDeviceMetricsOverride');
    await page(browser, `
      const k=window.inkbox,dpr=Math.min(2,window.devicePixelRatio||1);k.dpr=dpr;k.resize();
      const r=k.render3d?.renderer;if(r){r.gpu.setPixelRatio(dpr);r.resize(r.width,r.height);}
      k.setSpeed(2);return true;
    `);
    const environment = await page(browser, `
      await new Promise(requestAnimationFrame);
      const k=window.inkbox,r=k.render3d?.renderer;
      return {userAgent:navigator.userAgent,devicePixelRatio,viewport:{innerWidth,innerHeight,outerWidth,outerHeight},
        screen:{width:screen.width,height:screen.height},renderer:${JSON.stringify(testCase.renderer)},
        webgl:r?(()=>{const gl=r.gpu.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {vendor:gl.getParameter(ext?ext.UNMASKED_VENDOR_WEBGL:gl.VENDOR),renderer:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER),version:gl.getParameter(gl.VERSION),pixelRatio:r.gpu.getPixelRatio()};})():null};
    `);
    const windowInfo = await browser.cdp.send('Browser.getWindowForTarget').catch(() => null);
    if (windowInfo?.windowId != null) {
      await browser.cdp.send('Browser.setWindowBounds', {
        windowId: windowInfo.windowId,
        bounds: { ...windowInfo.bounds, windowState: 'normal' },
      }).catch(() => {});
    }
    await browser.cdp.send('Page.bringToFront').catch(() => {});
    await page(browser, 'window.focus();return true;');
    assert(await browser.waitFor('return document.visibilityState === "visible" && document.hasFocus()', {
      timeoutMs: 10000, intervalMs: 100,
    }), 'Measurement tab did not become the visible foreground page');
    await page(browser, `for(let i=0;i<${WARM_FRAMES};i++)await new Promise(requestAnimationFrame);return true;`, 180000);

    const screenshotName = `${testCase.id.toLowerCase()}-${testCase.renderer}.png`;
    const screenshotPath = path.join(OUT, 'screenshots', screenshotName);
    if (!fs.existsSync(screenshotPath)) {
      const screenshot = await browser.cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, 30000);
      fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    }

    const probeSetup = await browser.js(evalSource(installProbeSource(JSON.stringify(testCase), JSON.stringify(mode), repeat)), { timeoutMs: 60000 });
    assert.equal(probeSetup.speedIndex, 2, 'Formal setSpeed(2) was not active when measurement began');
    const measured = await page(browser, `
      const p=window.__INKBOX_G2_H2_PROBE;
      await new Promise((resolve,reject)=>{const deadline=performance.now()+180000;const tick=()=>{
        if(p.rows.length>=${MEASURE_FRAMES})return resolve();if(performance.now()>deadline)return reject(new Error('Timed out waiting for product RAF samples'));requestAnimationFrame(tick);
      };requestAnimationFrame(tick);});
      p.enabled=false;window.inkbox.setSpeed(0);
      return {rows:p.rows,hydrologyRecords:p.hydrologyRecords,finalWorld:{day:window.inkbox.world.day,seed:window.inkbox.world.seed,
        hydroAccum:window.inkbox.hydroAccum,speedIndex:window.inkbox.speedIndex,entities:window.inkbox.world.entities.length,
        pendingSpawns:window.inkbox.world.pendingSpawns?.length??null}};
    `, 240000);
    assert.equal(measured.rows.length, MEASURE_FRAMES, 'Did not collect the requested number of official frames');
    assert(measured.rows.every(row => row.speedIndex === 2 && row.paused === false), 'Measured frame included a pause');
    assert(measured.rows.every(row => row.documentFocused && row.visibilityState === 'visible'),
      'Measured RAF samples included a hidden or background tab');
    const browserVersion = browser.meta?.browser || null;
    const output = {
      runId: `${testCase.id}-${mode}-r${repeat}`,
      scenario: { ...testCase, dimensions: [512, 320], seed: SEED, speedEntry: 'window.inkbox.setSpeed(2)' },
      mode, repeat, startedAt: new Date().toISOString(),
      source: { productHead: '74934a8b1360af9007c69935d5becdf8f9809872', sourceHashes: sourceHashes() },
      browser: { executable: edge, version: browserVersion, gpuInfo, headless: HEADLESS,
        disableBackgroundThrottling: true },
      environment: { ...environment, measuredDevicePixelRatio: environment.devicePixelRatio,
        viewportAfterDprRestore: await page(browser, 'return {innerWidth,innerHeight,devicePixelRatio};'),
        gpuDeviceNames: (gpuInfo?.gpu?.devices || []).map(device => device.deviceString || device.vendorString || device.deviceId),
        screenshot: path.relative(ROOT, screenshotPath) },
      method: { warmFrames: WARM_FRAMES, measuredFrames: MEASURE_FRAMES, normalProductRaf: true,
        backgroundThrottlingDisabled: true,
        dtClampChanged: false, hydrologyFrequencyChanged: false, formalWorldCreation: true,
        lowPerturbationVsDetailed: mode === 'low-perturbation'
          ? 'Times official update/render and hydrology phases only; uses pre-existing PlaneStage profile. No field snapshots, per-layer wrappers, bridge-region copy, or WebGL upload wrappers.'
          : 'Adds exact water/height/type snapshots around each hydrology call; wraps individual Three layer calls and WebGL upload methods; records returned bridge dirty regions. Snapshot/diff work is outside stepHydrologyMs and reported separately.' },
      setup, probeSetup, finalWorld: measured.finalWorld, frames: measured.rows,
      hydrologyRecords: measured.hydrologyRecords,
    };
    const file = path.join(RAW, `${testCase.id.toLowerCase()}-${mode}-r${repeat}.json`);
    fs.writeFileSync(file, JSON.stringify(output, null, 2));
    console.log(`${output.runId}: ${output.frames.length} frames, ${output.hydrologyRecords.length} hydro calls, ${file}`);
    return output;
  } catch (error) { runError = error; throw error; }
  finally {
    const cleanup = await browser.close().catch(error => ({ complete: false, error: error.message }));
    if (!cleanup?.complete) console.error(`Browser cleanup incomplete for ${testCase.id}/${mode}/r${repeat}: ${JSON.stringify(cleanup)}`);
    if (runError) console.error(`Run failed ${testCase.id}/${mode}/r${repeat}: ${runError.stack || runError}`);
  }
}

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });
  const manifest = { startedAt: new Date().toISOString(), task: 'G2-PERF-H2', seed: SEED,
    baseline: 'origin/codex/g2-p1-integration-validation at 74934a8b1360af9007c69935d5becdf8f9809872',
    viewport: VIEWPORT, warmFrames: WARM_FRAMES, measuredFrames: MEASURE_FRAMES,
    runPlan: RUN_PLAN, fullMatrix: RUN_PLAN.length === ALL_RUNS.length,
    completedRuns: [], failures: [] };
  fs.writeFileSync(path.join(OUT, 'profile-manifest.json'), JSON.stringify(manifest, null, 2));
  let serverChild = null;
  if (!process.env.INKBOX_URL) {
    serverChild = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(PORT)],
      { cwd: ROOT, stdio: 'ignore', windowsHide: true });
    await waitForServer(`${BASE}/inkbox.html`, serverChild);
  }
  try {
    for (const [index, run] of RUN_PLAN.entries()) {
      console.log(`H2 run ${index + 1}/${RUN_PLAN.length}: ${run.id} ${run.renderer}/${run.map} ${run.mode} repeat ${run.repeat}`);
      try {
        const completed = await runOne(run, run.mode, run.repeat, serverChild);
        manifest.completedRuns.push(completed.runId);
      } catch (error) {
        manifest.failures.push({ run: `${run.id}-${run.mode}-r${run.repeat}`, message: error.message, stack: error.stack });
        fs.writeFileSync(path.join(OUT, 'profile-manifest.json'), JSON.stringify(manifest, null, 2));
        throw error;
      }
      manifest.updatedAt = new Date().toISOString();
      fs.writeFileSync(path.join(OUT, 'profile-manifest.json'), JSON.stringify(manifest, null, 2));
    }
  } finally {
    manifest.serverCleanup = await stopChild(serverChild);
    manifest.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, 'profile-manifest.json'), JSON.stringify(manifest, null, 2));
  }
  assert.equal(manifest.completedRuns.length, RUN_PLAN.length, 'H2 profile matrix incomplete');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
