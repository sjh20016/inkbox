import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launch, findEdge } from './cdp.mjs';
import { classifyWebGLUpload } from './inkbox-g2-h21-upload-metrics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCT_ROOT = path.resolve(process.env.INKBOX_H3_PRODUCT_ROOT || ROOT);
const PORT = Number(process.env.INKBOX_H3_PORT || 4198);
const BASE = process.env.INKBOX_URL || `http://127.0.0.1:${PORT}`;
const OUT = path.resolve(process.env.INKBOX_H3_REPORT_DIR || path.join(ROOT, 'reports/analysis/g2-h3'));
const RAW = path.join(OUT, 'raw');
const SEED = Number(process.env.INKBOX_H3_SEED || 673231);
const WARM_FRAMES = 120;
const MEASURE_FRAMES = Number(process.env.INKBOX_H3_FRAMES || 300);
const HEADLESS = process.env.INKBOX_H3_HEADLESS !== '0';
const VIEWPORT = { width: 512, height: 320 };
const CASES = [
  { id: 'H3-E1', renderer: 'three', map: 'standard', preset: 'expanse' },
  { id: 'H3-E2', renderer: 'three', map: 'archipelago', preset: 'expanse' },
];
const ALL_RUNS = CASES.flatMap(testCase => [
  { ...testCase, mode: 'low-perturbation', repeat: 1 },
  { ...testCase, mode: 'detailed', repeat: 1 },
  { ...testCase, mode: 'detailed', repeat: 2 },
]);
const RUN_PLAN = ALL_RUNS.filter(run => (!process.env.INKBOX_H3_CASE || run.id === process.env.INKBOX_H3_CASE)
  && (!process.env.INKBOX_H3_MODE || run.mode === process.env.INKBOX_H3_MODE)
  && (!process.env.INKBOX_H3_REPEAT || run.repeat === Number(process.env.INKBOX_H3_REPEAT)));
assert(RUN_PLAN.length > 0, 'H3 run filter selected no cases');
const SOURCE_FILES = [
  'scripts/inkbox-g2-h3-performance.mjs', 'scripts/inkbox-g2-h3-archipelago-world.mjs',
  'src/inkbox/main.js', 'src/inkbox/sim/hydrology.js', 'src/inkbox/world/terrain.js',
  'src/inkbox/render3d/WorldRenderBridge.js', 'src/inkbox/render3d/stage/PlaneStage.js',
  'src/inkbox/render3d/Render3DHost.js', 'src/inkbox/render3d/terrain/TerrainMesh.js',
  'src/inkbox/render3d/water/WaterLayer.js', 'src/inkbox/render3d/art/TerrainDataTextures.js',
  'src/inkbox/render3d/vegetation/VegetationLayer.js', 'src/inkbox/core/config.js',
];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const round = value => Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
function sourceHashes() {
  return Object.fromEntries(SOURCE_FILES.map(file => [file,
    createHash('sha256').update(fs.readFileSync(path.join(PRODUCT_ROOT, file))).digest('hex')]));
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
    window.__INKBOX_G2_H3_PROBE=probe;
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
      object[method]=function(...args){const row=probe.currentRow,start=performance.now();
        if(row){row.subsystemCalls||={};row.subsystemCalls[key]=(row.subsystemCalls[key]||0)+1;}
        try{return original.apply(this,args);}finally{if(row)add(row.layerMethodMs,key,performance.now()-start);}
      };
      return true;
    };
    const installTerrainDiagnostics=stage=>{
      const terrain=stage?.terrain;if(!terrain||typeof terrain.update!=='function')return;
      const timed=terrain.update;
      terrain.update=function(...args){const row=probe.currentRow,region=args[0];if(!row||!region)return timed.apply(this,args);
        const options=args[1]||{},w=this.world,color=this.geometry.attributes.color,position=this.geometry.attributes.position,index=this.geometry.index;
        const writeHeight=options.height!==false,writeColor=options.type!==false||(this.fireEnabled&&options.fire===true);
        const cells=Math.max(0,region.x1-region.x0+1)*Math.max(0,region.y1-region.y0+1),colorStart=performance.now();let changed=0;
        if(writeColor&&cells){const values=color.array;for(let y=region.y0;y<=region.y1;y++)for(let x=region.x0;x<=region.x1;x++){
          const i=y*w.w+x,c=this.palette[w.type[i]]||this.palette[5],fire=this.fireEnabled?w.fire[i]:0;let red=c.r,green=c.g,blue=c.b;
          if(fire>0.02){const heat=Math.min(1,fire*1.15),mix=heat*0.86;red=c.r*(1-mix)+mix;green=c.g*(1-mix)+(214-heat*70)/255*mix;blue=c.b*(1-mix)+(120-heat*90)/255*mix;}
          const offset=i*3;if(values[offset]!==Math.fround(red)||values[offset+1]!==Math.fround(green)||values[offset+2]!==Math.fround(blue))changed++;
        }}
        const scanMs=writeColor?performance.now()-colorStart:0;
        const before={color:color.updateRanges.length,position:position.updateRanges.length,index:index.updateRanges.length};
        const versions={color:color.version,position:position.version,index:index.version};
        row.terrainVerticesExamined=(row.terrainVerticesExamined||0)+((writeHeight||writeColor)?cells:0);
        row.terrainHeightVerticesExamined=(row.terrainHeightVerticesExamined||0)+(writeHeight?cells:0);
        row.terrainColorVerticesExamined=(row.terrainColorVerticesExamined||0)+(writeColor?cells:0);
        row.terrainColorVerticesActuallyChanged=(row.terrainColorVerticesActuallyChanged||0)+changed;
        row.terrainColorUpdateCalls=(row.terrainColorUpdateCalls||0)+(writeColor?1:0);
        row.terrainColorInstrumentationScanMs=(row.terrainColorInstrumentationScanMs||0)+scanMs;
        try{return timed.apply(this,args);}finally{
          for(const [name,attribute] of Object.entries({color,position,index})){
            const added=attribute.updateRanges.slice(before[name]),bytes=added.reduce((sum,item)=>sum+item.count*(attribute.array.BYTES_PER_ELEMENT||4),0),marks=Math.max(0,attribute.version-versions[name]);
            const prefix='terrain'+name[0].toUpperCase()+name.slice(1),rangeKey=prefix+'UpdateRanges',byteKey=prefix+'BytesQueued',markKey=prefix+'NeedsUpdateMarks';
            row[rangeKey]=(row[rangeKey]||0)+added.length;row[byteKey]=(row[byteKey]||0)+bytes;row[markKey]=(row[markKey]||0)+marks;
          }
        }
      };
    };
    if(r&&mode==='detailed'){
      for(const [plane,stage] of r.stages){
        for(const [object,method,key] of [
          [stage.terrain,'update','terrainMesh'],[stage.terrain,'updateScalarField','terrainScalarField'],
          [stage.terrainSides,'update','terrainSides'],[stage.water,'update','waterMesh'],
          [stage.surfaceField,'update','surfaceField'],[stage.vegetation,'update','vegetation'],
          [stage.entities,'update','entities'],[stage.settlements,'update','settlements']])
          installTimed(object,method,plane+'.'+key);
        installTerrainDiagnostics(stage);
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
        const classifyUpload=${classifyWebGLUpload.toString()};
        const addUpload=(row,result)=>{
          const key=result.kind==='buffer'?'bufferUploadCalls':'textureUploadCalls';
          row[key]=(row[key]||0)+1;
          row.bufferUploadBytesKnown=(row.bufferUploadBytesKnown||0)+result.bufferUploadBytesKnown;
          row.textureUploadBytesKnown=(row.textureUploadBytesKnown||0)+result.textureUploadBytesKnown;
          row.uploadSourceBytesUpperBound=(row.uploadSourceBytesUpperBound||0)+result.uploadSourceBytesUpperBound;
          row.uploadUnknownByteCalls=(row.uploadUnknownByteCalls||0)+result.uploadUnknownByteCalls;
          row.bufferAllocationBytesKnown=(row.bufferAllocationBytesKnown||0)+result.bufferAllocationBytesKnown;
        };
        probe.glHooks=[];
        for(const method of ['bufferData','bufferSubData','texImage2D','texSubImage2D','texImage3D','texSubImage3D','compressedTexImage2D','compressedTexSubImage2D','compressedTexImage3D','compressedTexSubImage3D']){
          const original=gl[method];if(typeof original!=='function')continue;
          const wrapper=function(...args){const result=classifyUpload(method,args),row=probe.currentRow;try{return original.apply(this,args);}finally{if(row)addUpload(row,result);}};
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
        bridgeRegions:null,planeTimings:null,layerMethodMs:mode==='detailed'?{}:null,subsystemCalls:mode==='detailed'?{}:null,
        bufferUploadBytesKnown:mode==='detailed'?0:null,textureUploadBytesKnown:mode==='detailed'?0:null,
        uploadSourceBytesUpperBound:mode==='detailed'?0:null,uploadUnknownByteCalls:mode==='detailed'?0:null,
        bufferUploadCalls:mode==='detailed'?0:null,textureUploadCalls:mode==='detailed'?0:null,
        bufferAllocationBytesKnown:mode==='detailed'?0:null,
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
      installedGlHooks:probe.glHooks||[],fixture:window.__INKBOX_G2_H3_FIXTURE||null};
  `;
}

async function runOne(testCase, mode, repeat, serverChild) {
  const query = testCase.renderer === 'three' ? '?renderer=3d' : '';
  const targetUrl = `${BASE}/inkbox.html${query}`;
  const edge = findEdge();
  if (!edge) throw new Error('Microsoft Edge is required for the real-browser H3 run');
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
        const mod=await import('./scripts/inkbox-g2-h3-archipelago-world.mjs');fixture=mod.applyArchipelagoFixture(k.world);
        window.__INKBOX_G2_H3_FIXTURE=fixture;k.terrain?.invalidate?.();k.dirty=true;
      }
      return {world:[k.world.w,k.world.h],seed:k.world.seed,terrainPreset:k.world.generation?.terrainPreset||null,
        generationVersion:k.world.generation?.version||null,hydroAccum:k.hydroAccum,fixture,
        topology:(await import('./scripts/inkbox-g2-h3-archipelago-world.mjs')).measureArchipelagoTopology(k.world)};
    `, 180000);
    assert.deepEqual(setup.world, [512, 320], 'H3 cases must run the formal 512x320 expanse World');
    assert.equal(setup.seed, SEED, 'World seed drifted');
    if (testCase.map === 'archipelago') assert(setup.fixture?.topology?.islandCount >= 8, 'Archipelago fixture did not produce multiple coherent landmasses');

    // Keep the H3 viewport deterministic in headless Edge; the physical monitor is not part of this run.
    await page(browser, `
      const k=window.inkbox,dpr=1;k.dpr=dpr;k.resize();
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
      const p=window.__INKBOX_G2_H3_PROBE;
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
      source: { productHead: process.env.INKBOX_H3_PRODUCT_HEAD || '4960f88d6256d63a82c0172bb052c62ae5acb1f3',
        variant: process.env.INKBOX_H3_VARIANT || 'unspecified', sourceHashes: sourceHashes() },
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
          ? 'Times official update/render and reads the pre-existing renderer profile. No per-layer wrappers, Bridge copies, or WebGL upload wrappers; hydrology timings are available only when the isolated runtime provides the optional probe.'
          : 'Adds a pre-update color comparison scan over TerrainMesh dirty regions, wraps individual Three layer calls and WebGL upload methods, and copies Bridge dirty bounds. The diagnostic scan contributes to detailed frame CPU and layer-wrapper timings.' },
      setup, probeSetup, finalWorld: measured.finalWorld, frames: measured.rows,
      hydrologyRecords: measured.hydrologyRecords.length ? measured.hydrologyRecords : null,
    };
    const file = path.join(RAW, `${testCase.id.toLowerCase()}-${mode}-r${repeat}.json`);
    fs.writeFileSync(file, JSON.stringify(output, null, 2));
    console.log(`${output.runId}: ${output.frames.length} frames, ${output.hydrologyRecords?.length ?? 'hydrology probe unavailable'}, ${file}`);
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
  const manifest = { startedAt: new Date().toISOString(), task: 'G2-PERF-H3', seed: SEED,
    baseline: 'audit/g2-p03-vegetation-hardening-luna at 4960f88d6256d63a82c0172bb052c62ae5acb1f3',
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
      console.log(`H3 run ${index + 1}/${RUN_PLAN.length}: ${run.id} ${run.renderer}/${run.map} ${run.mode} repeat ${run.repeat}`);
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
  assert.equal(manifest.completedRuns.length, RUN_PLAN.length, 'H3 profile run incomplete');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
