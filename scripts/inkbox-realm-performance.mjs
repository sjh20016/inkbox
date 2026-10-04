#!/usr/bin/env node
// Opt-in real-GPU B5 performance evidence; run serially with other GPU probes.
// Samples only the product RAF loop; no probe-owned Host.update/render calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/m2c2b0/performance'));
const BASE_URL = process.env.INKBOX_URL || `http://127.0.0.1:${process.env.INKBOX_PORT || 4192}`;
const APP_URL = new URL(BASE_URL);
APP_URL.pathname = `${APP_URL.pathname.replace(/\/$/, '').replace(/\/inkbox\.html$/i, '')}/inkbox.html`;
APP_URL.searchParams.set('renderer', '3d');
const WIDTH = 1500, HEIGHT = 940, DPR = 1, SAMPLES = 120, WARMUP_RAFS = 12, STABLE_FRAMES = 6;
const SCENARIOS = ['GOLDEN_A', 'DENSITY_A'];
const PROFILES = ['legacy', 'realm-style-v1'];
const ORIGINAL_A0 = Object.freeze({
  GOLDEN_A: {
    snapshot: '0f9efd918df2e4f26bcf678cffe2ca1593381c9abee209de9e2e8cc747d755f1',
    world: '5e49218aab202aca706b0e0941ea993cf766c4ee1a685750671548e4825bebf9',
    advanceState: '18dc072cca13f3c141d9c35aadf6e16a6355d941f984dae58f63100f592ae558',
    triangles: 179874, drawCalls: 12,
  },
  DENSITY_A: {
    snapshot: '62e4c87937af73ca8d68f5b0d420450c0d64544b0a5068d76edb8fab1e778b74',
    world: '4d3cc0f901295f359c51f48ada6f95d8c4402f17856cb74fa673f020776e6919',
    advanceState: '18dc072cca13f3c141d9c35aadf6e16a6355d941f984dae58f63100f592ae558',
    triangles: 282411, drawCalls: 12,
  },
});
const FOREST_A0 = Object.freeze({ triangles: 414037, drawCalls: 13 });
const report = {
  startedAt: new Date().toISOString(), pass: false, source: APP_URL.toString(),
  method: {
    viewport: [WIDTH, HEIGHT], expectedDpr: DPR, overviewSamplesPerProfile: SAMPLES,
    warmupRafs: WARMUP_RAFS, stableFrames: STABLE_FRAMES,
    scenarios: SCENARIOS, profiles: PROFILES,
    setup: 'Apply scenario, await Render3DHost and stage World adoption, disable LOD, apply fixed WORLD_OVERVIEW camera, wait five product RAFs for dimensions/PPU, apply profile, enable LOD, warm and require six stable product frames before sampling.',
    timing: 'Wrap the live product-loop Host.update/render methods. Each wrapper forwards exactly once; the probe never calls either method directly. rAF intervals use browser timestamps.',
    gpuTiming: 'EXT_disjoint_timer_query_webgl2 elapsed render queries are asynchronous, bounded to eight pending, disjoint-filtered, drained and always deleted. CPU update/render submission and rAF are reported separately.',
    purity: 'Full JSON.stringify({world,advanceState}) SHA-256 plus independent World and advanceState SHA-256 values must match the original A0 baseline and remain unchanged after each sample.',
  },
  baseline: ORIGINAL_A0,
  cases: [],
};
let browser;

const wrapPage = body => `return (async()=>{${body}})();`;
const page = body => {
  const source = wrapPage(body);
  new vm.Script(`(()=>{${source}})`, { filename: 'inkbox-realm-performance-inline.js' });
  return browser.js(source);
};
const waitFrames = count => page(`for(let i=0;i<${count};i++)await new Promise(requestAnimationFrame);return true;`);
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = q => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return { samples: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    median: at(.5), p95: at(.95), max: sorted.at(-1) };
};

function setupBody(scenario) {
  return `
    const k=window.inkbox,r=k.render3d.renderer,a=await import('./src/inkbox/render3d/art/VisualScenarios.js');
    if(typeof r.setLODEnabled!=='function'||typeof r.getLODStats!=='function')throw new Error('C2A LOD API missing');
    r.setArtProfile('legacy');r.setLODEnabled(false);
    const spec=a.applyScenario(k,${JSON.stringify(scenario)});
    let adopted=false;
    for(let i=0;i<180;i++){
      await new Promise(requestAnimationFrame);
      if(r.world===k.world&&r.stages.get('mortal')?.world===k.world){adopted=true;break;}
    }
    if(!adopted)throw new Error('Render3DHost did not adopt ${scenario} World within 180 product frames');
    await r.characterLoadPromise;if(r.characterLoadError)throw r.characterLoadError;
    const digest=await a.snapshotDigest(k);
    const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))]
      .map(v=>v.toString(16).padStart(2,'0')).join('');
    return {spec,digest,worldDigest:await hash(k.world),advanceStateDigest:await hash(k.advanceState),
      mapSize:[k.world.w,k.world.h],houses:k.world.villages.reduce((n,v)=>n+(v.houses?.length||0),0),
      rendererSize:[r.width,r.height],dpr:r.gpu.getPixelRatio(),lodEnabled:r.lodEnabled};
  `;
}

function cameraBody(scenario, forest = false) {
  return `
    const k=window.inkbox,r=k.render3d.renderer,a=await import('./src/inkbox/render3d/art/VisualScenarios.js');
    r.setLODEnabled(false);
    if(r.lodEnabled)throw new Error('LOD must be disabled while applying the fixed camera');
    let camera;
    if(${JSON.stringify(forest)}){
      const {deriveVegetation}=await import('./src/inkbox/render3d/vegetation/deriveVegetation.js');
      const trees=deriveVegetation(k.world),tile=16,cols=Math.ceil(k.world.w/tile),rows=Math.ceil(k.world.h/tile),counts=new Uint32Array(cols*rows);
      for(const t of trees)counts[Math.floor(t.y/tile)*cols+Math.floor(t.x/tile)]++;
      let best=0;for(let i=1;i<counts.length;i++)if(counts[i]>counts[best])best=i;
      const tx=best%cols,ty=Math.floor(best/cols),x0=tx*tile,y0=ty*tile,x1=Math.min(k.world.w,x0+tile),y1=Math.min(k.world.h,y0+tile);
      const poi={x:(x0+x1-1)/2,y:(y0+y1-1)/2,source:'deriveVegetation maximum 16x16 tile',tile:[tx,ty],trees:counts[best],totalTrees:trees.length};
      camera=a.applyCamera(r,'WORLD_OVERVIEW',{poi,zoom:9});
      window.__inkboxRealmPerformance.forest={tileSize:tile,counts:poi,treeCount:trees.length};
    }else camera=a.applyCamera(r,'WORLD_OVERVIEW');
    for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);
    if(r.world!==k.world||r.stages.get('mortal')?.world!==k.world)throw new Error('scenario World adoption drifted before camera setup');
    const actual={position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom};
    const maxDelta=(x,y)=>Math.max(...x.map((v,i)=>Math.abs(v-y[i])));
    const delta={position:maxDelta(actual.position,camera.position),target:maxDelta(actual.target,camera.target),zoom:Math.abs(actual.zoom-camera.zoom)};
    if(delta.position>1e-5||delta.target>1e-5||delta.zoom>1e-8)throw new Error('camera drift during five LOD-disabled product RAFs: '+JSON.stringify(delta));
    window.__inkboxRealmPerformance.cameras[${JSON.stringify(scenario)}]=camera;
    return {camera,actual,delta,ppu:r.stages.get('mortal').vegetation?._viewPpu??null,
      rendererSize:[r.width,r.height],cssResolution:[r.gpu.domElement.clientWidth,r.gpu.domElement.clientHeight],dpr:r.gpu.getPixelRatio()};
  `;
}

function configureBody(profile, scenario, forest = false) {
  return `
    const k=window.inkbox,r=k.render3d.renderer,a=await import('./src/inkbox/render3d/art/VisualScenarios.js');
    r.setLODEnabled(false);
    for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);
    const camera=window.__inkboxRealmPerformance.cameras[${JSON.stringify(scenario)}];
    const before={position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom};
    const maxDelta=(x,y)=>Math.max(...x.map((v,i)=>Math.abs(v-y[i])));
    if(maxDelta(before.position,camera.position)>1e-5||maxDelta(before.target,camera.target)>1e-5||Math.abs(before.zoom-camera.zoom)>1e-8)
      throw new Error('camera changed before profile configuration');
    r.setArtProfile(${JSON.stringify(profile)});
    r.setLODEnabled(true);
    let signature=null,stable=0,stableState=null;
    for(let i=0;i<90&&stable<${STABLE_FRAMES};i++){
      await new Promise(requestAnimationFrame);
      const sample={drawCalls:r.gpu.info.render.calls,triangles:r.gpu.info.render.triangles,lod:r.getLODStats(),
        camera:{position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom},
        rendererSize:[r.width,r.height],dpr:r.gpu.getPixelRatio()};
      const next=JSON.stringify({drawCalls:sample.drawCalls,triangles:sample.triangles,lod:sample.lod,
        rendererSize:sample.rendererSize,dpr:sample.dpr,camera:sample.camera});
      stable=next===signature?stable+1:1;signature=next;stableState=sample;
    }
    if(stable<${STABLE_FRAMES})throw new Error('LOD/draw/pose did not settle for six product frames in '+${JSON.stringify(scenario+'/'+profile+(forest?'/forest':'/overview'))});
    const pose=stableState.camera;
    if(maxDelta(pose.position,camera.position)>1e-5||maxDelta(pose.target,camera.target)>1e-5||Math.abs(pose.zoom-camera.zoom)>1e-8)
      throw new Error('product RAF changed fixed profile camera pose');
    if(!r.lodEnabled||r.world!==k.world||r.stages.get('mortal')?.world!==k.world)throw new Error('LOD or World adoption invariant failed');
    if(r.scene.fog!==null)throw new Error('profile installed scene-global fog');
    const gl=r.gpu.getContext(),programs=r.gpu.info.programs.map(p=>({name:p.name||null,
      linked:p.program?gl.getProgramParameter(p.program,gl.LINK_STATUS):null,
      runnable:p.diagnostics?.runnable??p.runnable??null,
      log:p.diagnostics?.programLog||p.diagnostics?.vertexShader?.log||p.diagnostics?.fragmentShader?.log||null}));
    if(!programs.length||programs.some(p=>p.linked!==true||p.runnable===false))throw new Error('WebGL LINK_STATUS/runnable failure or unavailable status: '+JSON.stringify(programs));
    const rect=r.gpu.domElement.getBoundingClientRect(),css=[rect.width,rect.height],canvasPixels=[r.gpu.domElement.width,r.gpu.domElement.height];
    if(innerWidth!==${WIDTH}||innerHeight!==${HEIGHT}||Math.abs(r.gpu.getPixelRatio()-${DPR})>1e-8||r.width!==1086||Math.abs(r.height-797.5)>.1||Math.abs(css[1]-797.5)>.1)
      throw new Error('viewport/DPR/renderer size differs from original A0 baseline: '+JSON.stringify({viewport:[innerWidth,innerHeight],size:[r.width,r.height],css,dpr:r.gpu.getPixelRatio()}));
    return {scenario:${JSON.stringify(scenario)},profile:${JSON.stringify(profile)},kind:${JSON.stringify(forest?'forest-zoom9':'overview')},
      camera,actualCamera:pose,stableFrames:stable,lodEnabled:r.lodEnabled,lod:stableState.lod,triangles:stableState.triangles,drawCalls:stableState.drawCalls,
      rendererSize:stableState.rendererSize,cssResolution:css,canvasPixelSize:canvasPixels,dpr:r.gpu.getPixelRatio(),fogIsNull:r.scene.fog===null,programs,
      timerQueryAvailable:!!gl.getExtension('EXT_disjoint_timer_query_webgl2')};
  `;
}

function sampleBody(label) {
  return `
    const r=window.inkbox.render3d.renderer,state={updates:[],renders:[],raf:[],gpuMs:[],gpuInvalid:0,gpuSkipped:0,maxPending:0,armed:false};
    const originalUpdate=r.update,originalRender=r.render,gl=r.gpu.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),pending=[];
    const poll=()=>{
      if(!timer)return;
      const disjoint=gl.getParameter(timer.GPU_DISJOINT_EXT);
      if(disjoint)for(const item of pending)item.disjoint=true;
      for(let i=pending.length-1;i>=0;i--){
        const item=pending[i];if(!gl.getQueryParameter(item.query,gl.QUERY_RESULT_AVAILABLE))continue;
        const ns=gl.getQueryParameter(item.query,gl.QUERY_RESULT);
        if(disjoint||item.disjoint)state.gpuInvalid++;else state.gpuMs.push(ns/1e6);
        gl.deleteQuery(item.query);pending.splice(i,1);
      }
    };
    r.update=function(...args){const start=performance.now();try{return originalUpdate.apply(this,args);}finally{if(state.armed)state.updates.push(performance.now()-start);}};
    r.render=function(...args){
      poll();const start=performance.now();let query=null,active=false;
      if(state.armed&&timer){
        if(pending.length<8){query=gl.createQuery();if(query){try{gl.beginQuery(timer.TIME_ELAPSED_EXT,query);active=true;}catch(error){gl.deleteQuery(query);query=null;throw error;}}
          else state.gpuSkipped++;}
        else state.gpuSkipped++;
      }
      try{
        const result=originalRender.apply(this,args);
        if(active){gl.endQuery(timer.TIME_ELAPSED_EXT);pending.push({query,disjoint:false});query=null;active=false;state.maxPending=Math.max(state.maxPending,pending.length);}
        if(state.armed)state.renders.push({elapsed:performance.now()-start,drawCalls:this.gpu.info.render.calls,
          triangles:this.gpu.info.render.triangles,lod:this.getLODStats()});
        return result;
      }catch(error){
        if(active){try{gl.endQuery(timer.TIME_ELAPSED_EXT);}catch{}active=false;}
        if(query){try{gl.deleteQuery(query);}catch{}query=null;}
        throw error;
      }
    };
    try{
      for(let i=0;i<${WARMUP_RAFS};i++)await new Promise(requestAnimationFrame);
      state.armed=true;let previous=null;
      for(let i=0;i<${SAMPLES}+1;i++){
        const timestamp=await new Promise(requestAnimationFrame);
        if(previous!==null)state.raf.push(timestamp-previous);previous=timestamp;
      }
      state.armed=false;
      for(let i=0;i<180&&pending.length;i++){await new Promise(requestAnimationFrame);poll();}
      poll();
      const digest=await (await import('./src/inkbox/render3d/art/VisualScenarios.js')).snapshotDigest(window.inkbox);
      const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))]
        .map(v=>v.toString(16).padStart(2,'0')).join('');
      const worldDigest=await hash(window.inkbox.world),advanceStateDigest=await hash(window.inkbox.advanceState);
      const glError=gl.getError();
      const summarize=values=>{const sorted=values.slice(-${SAMPLES}).sort((a,b)=>a-b);if(sorted.length!==${SAMPLES})throw new Error('expected ${SAMPLES} product samples, got '+sorted.length);
        return {samples:sorted.length,mean:sorted.reduce((s,v)=>s+v,0)/sorted.length,median:sorted[Math.floor(sorted.length*.5)],
          p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)};};
      if(state.updates.length<${SAMPLES}||state.renders.length<${SAMPLES}||state.raf.length!==${SAMPLES})
        throw new Error('product sample cardinality mismatch: '+JSON.stringify({updates:state.updates.length,renders:state.renders.length,raf:state.raf.length}));
      if(Math.abs(state.updates.length-state.renders.length)>1||Math.abs(state.updates.length-state.raf.length)>1||Math.abs(state.renders.length-state.raf.length)>1)
        throw new Error('product update/render/rAF guard differed by more than one: '+JSON.stringify({updates:state.updates.length,renders:state.renders.length,raf:state.raf.length}));
      if(state.maxPending>8)throw new Error('GPU timer pending query bound exceeded');
      const frames=state.renders.slice(-${SAMPLES}),first=JSON.stringify({drawCalls:frames[0].drawCalls,triangles:frames[0].triangles,lod:frames[0].lod});
      if(frames.some(frame=>JSON.stringify({drawCalls:frame.drawCalls,triangles:frame.triangles,lod:frame.lod})!==first))
        throw new Error('draw/triangle/LOD changed within the 120-frame sample');
      const result={case:${JSON.stringify(label)},sampleMode:'product-loop-only; original update/render each forwarded once',
        cpuUpdateMs:summarize(state.updates),cpuRenderSubmitMs:summarize(state.renders.map(x=>x.elapsed)),rafIntervalMs:summarize(state.raf),
        gpuRenderMs:state.gpuMs.length?(()=>{const x=state.gpuMs.slice().sort((a,b)=>a-b);return {samples:x.length,median:x[Math.floor(x.length*.5)],p95:x[Math.floor(x.length*.95)],max:x.at(-1)};})():null,
        gpuQueryValidSamples:state.gpuMs.length,gpuQueryInvalidSamples:state.gpuInvalid,gpuQuerySkippedSamples:state.gpuSkipped,
        gpuTimerUnavailableReason:timer?null:'EXT_disjoint_timer_query_webgl2 unavailable',maxPendingQueries:state.maxPending,
        productCallCounts:{updates:state.updates.length,renders:state.renders.length,rafIntervals:state.raf.length},
        triangles:frames.at(-1).triangles,drawCalls:frames.at(-1).drawCalls,lod:frames.at(-1).lod,
        digest:digest.value,digestBytes:digest.bytes,worldDigest,advanceStateDigest,glError};
      if(glError!==gl.NO_ERROR)throw new Error('WebGL GL error '+glError);
      return result;
    }finally{
      state.armed=false;
      for(const item of pending){try{gl.deleteQuery(item.query);}catch{}}
      pending.length=0;r.update=originalUpdate;r.render=originalRender;
    }
  `;
}

function compileAllInline() {
  const compile = (body, label) => new vm.Script(`(()=>{${wrapPage(body)}})`, { filename: `inkbox-realm-performance-${label}.js` });
  for (const scenario of SCENARIOS) {
    compile(setupBody(scenario), `setup-${scenario}`);
    compile(cameraBody(scenario), `camera-${scenario}`);
    for (const profile of PROFILES) {
      compile(configureBody(profile, scenario), `configure-${scenario}-${profile}`);
      compile(sampleBody(`${scenario}-overview-${profile}`), `sample-${scenario}-${profile}`);
    }
  }
  compile(cameraBody('DENSITY_A', true), 'camera-DENSITY_A-forest');
  for (const profile of PROFILES) {
    compile(configureBody(profile, 'DENSITY_A', true), `configure-DENSITY_A-forest-${profile}`);
    compile(sampleBody(`DENSITY_A-forest-${profile}`), `sample-DENSITY_A-forest-${profile}`);
  }
}

function assertOriginalA0(measured, expected, label) {
  assertStateMatchesA0(measured, expected, label);
  assert.equal(measured.triangles, expected.triangles, `${label}: triangles differ from original A0`);
  assert.equal(measured.drawCalls, expected.drawCalls, `${label}: draw calls differ from original A0`);
}

function assertStateMatchesA0(measured, expected, label) {
  assert.equal(measured.digest, expected.snapshot, `${label}: full World+advanceState snapshotDigest differs from original A0`);
  assert.equal(measured.worldDigest, expected.world, `${label}: World digest differs from original A0`);
  assert.equal(measured.advanceStateDigest, expected.advanceState, `${label}: advanceState digest differs from original A0`);
}

compileAllInline();
if (process.argv.includes('--check')) {
  console.log('B5 performance probe inline browser scripts compiled by Node VM.');
  process.exit(0);
}

try {
  browser = await launch({ url: APP_URL.toString(), browser: findBrowser(), width: WIDTH, height: HEIGHT, gpu: true, timeoutMs: 30000 });
  report.environment = { browser: browser.meta.browser, viewport: [browser.meta.width, browser.meta.height], debugPort: browser.meta.debugPort };
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size', { timeoutMs: 60000 }),
    `Render3D failed to boot: ${browser.errors().join(' | ')}`);
  report.gpu = await page(`
    const r=window.inkbox.render3d.renderer,g=r.gpu.getContext(),debug=g.getExtension('WEBGL_debug_renderer_info');
    return {renderer:debug?g.getParameter(debug.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),vendor:debug?g.getParameter(debug.UNMASKED_VENDOR_WEBGL):null,
      viewport:[innerWidth,innerHeight],rendererSize:[r.width,r.height],cssResolution:[r.gpu.domElement.clientWidth,r.gpu.domElement.clientHeight],dpr:r.gpu.getPixelRatio(),
      canvasPixelSize:[r.gpu.domElement.width,r.gpu.domElement.height],
      timerQueryWebGL2:!!g.getExtension('EXT_disjoint_timer_query_webgl2')};
  `);
  assert.deepEqual(report.gpu.viewport, [WIDTH, HEIGHT], 'browser viewport must match A0');
  assert.equal(report.gpu.dpr, DPR, 'DPR must match A0');
  await page(`window.__inkboxRealmPerformance={cameras:{},forest:null};return true;`);

  for (const scenario of SCENARIOS) {
    const expected = ORIGINAL_A0[scenario];
    const setup = await page(setupBody(scenario));
    report.scenarios ??= {};
    report.scenarios[scenario] = {
      mapSize: setup.mapSize, houses: setup.houses, coverage: setup.spec.coverage,
      snapshotDigest: setup.digest, worldDigest: setup.worldDigest, advanceStateDigest: setup.advanceStateDigest,
      sourceWorldMatchesA0: setup.digest.value === expected.snapshot && setup.worldDigest === expected.world && setup.advanceStateDigest === expected.advanceState,
    };
    assertStateMatchesA0({ digest: setup.digest.value, worldDigest: setup.worldDigest, advanceStateDigest: setup.advanceStateDigest }, expected, `${scenario} setup`);
    const overviewCamera = await page(cameraBody(scenario));
    const overviewPair = [];
    for (const profile of PROFILES) {
      const configured = await page(configureBody(profile, scenario));
      const sampled = await page(sampleBody(`${scenario}-overview-${profile}`));
      assertOriginalA0(sampled, expected, `${scenario}/${profile} overview`);
      assert.equal(sampled.glError, 0, `${scenario}/${profile}: GL error`);
      assert.deepEqual(sampled.lod, configured.lod, `${scenario}/${profile}: LOD shifted during sample`);
      overviewPair.push({ profile, configured, sampled });
    }
    assert.deepEqual(overviewPair[0].configured.actualCamera, overviewPair[1].configured.actualCamera,
      `${scenario}: legacy/v1 overview camera pose must match`);
    assert.deepEqual(overviewPair[0].sampled.lod, overviewPair[1].sampled.lod, `${scenario}: legacy/v1 LOD must match`);
    assert.equal(overviewPair[0].sampled.triangles, overviewPair[1].sampled.triangles, `${scenario}: legacy/v1 triangles must match`);
    assert.equal(overviewPair[0].sampled.drawCalls, overviewPair[1].sampled.drawCalls, `${scenario}: legacy/v1 draw calls must match`);
    report.cases.push({ scenario, name: 'overview', expectedA0: expected, samePose: true,
      cameraRecipe: overviewCamera.camera, legacy: overviewPair[0], v1: overviewPair[1] });
  }

  // Additional 200k-class pressure sample: real densest 16x16 tree tile at the original zoom-9 camera.
  const forestCamera = await page(cameraBody('DENSITY_A', true));
  const forestPair = [];
  for (const profile of PROFILES) {
    const configured = await page(configureBody(profile, 'DENSITY_A', true));
    const sampled = await page(sampleBody(`DENSITY_A-forest-zoom9-${profile}`));
    assertStateMatchesA0(sampled, ORIGINAL_A0.DENSITY_A, `DENSITY_A forest/${profile}`);
    assert.equal(sampled.triangles, FOREST_A0.triangles, `DENSITY_A forest/${profile}: triangles differ from original A0`);
    assert.equal(sampled.drawCalls, FOREST_A0.drawCalls, `DENSITY_A forest/${profile}: draw calls differ from original A0`);
    assert.equal(sampled.glError, 0, `forest/${profile}: GL error`);
    assert.deepEqual(sampled.lod, configured.lod, `forest/${profile}: LOD shifted during sample`);
    forestPair.push({ profile, configured, sampled });
  }
  assert.deepEqual(forestPair[0].configured.actualCamera, forestPair[1].configured.actualCamera, 'forest: legacy/v1 camera pose must match');
  assert.deepEqual(forestPair[0].sampled.lod, forestPair[1].sampled.lod, 'forest: legacy/v1 LOD must match');
  assert.equal(forestPair[0].sampled.triangles, forestPair[1].sampled.triangles, 'forest: legacy/v1 triangles must match');
  assert.equal(forestPair[0].sampled.drawCalls, forestPair[1].sampled.drawCalls, 'forest: legacy/v1 draw calls must match');
  report.forest = { cameraRecipe: forestCamera.camera, selection: await page('return window.__inkboxRealmPerformance.forest;'), expectedA0: FOREST_A0,
    legacy: forestPair[0], v1: forestPair[1] };

  report.consoleErrors = browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
    .map(e => e.params.args?.map(a => a.value || a.description || '').join(' '));
  report.runtimeErrors = browser.errors();
  report.errors = [...report.consoleErrors, ...report.runtimeErrors];
  assert.deepEqual(report.errors, [], 'browser console/runtime errors');
  report.pass = true;
} catch (error) {
  report.failure = error.stack || String(error);
  report.consoleErrors = browser?.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
    .map(e => e.params.args?.map(a => a.value || a.description || '').join(' ')) || [];
  report.runtimeErrors = browser?.errors() || [];
  report.errors = [...report.consoleErrors, ...report.runtimeErrors];
  process.exitCode = 1;
  console.error(report.failure);
} finally {
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'performance.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  console.log(`B5 performance probe ${report.pass ? 'PASS' : 'FAIL'} · ${path.relative(ROOT, path.join(OUT, 'performance.json'))}`);
}
