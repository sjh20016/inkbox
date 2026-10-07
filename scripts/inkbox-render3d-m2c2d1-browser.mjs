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
const requested = (process.env.INKBOX_C2D1_VIEWS || '').split(',').filter(Boolean);
for (const key of requested) assert(ALL_VIEWS.some(v => v.key === key), 'Unknown view: ' + key);
const VIEWS = requested.length ? ALL_VIEWS.filter(v => requested.includes(v.key)) : ALL_VIEWS;
const DEBUG = process.env.INKBOX_C2D1_ART_DEBUG || null;
const STYLE = process.env.INKBOX_C2D1_ART_STYLE || null;
const EXPERIMENT = process.env.INKBOX_C2D1_EXPERIMENT || null;
if (DEBUG) assert(['base','coast','mass','structure','atmosphere','final'].includes(DEBUG), 'Invalid artDebug');
if (STYLE) assert(['main-style','c2d-style','c2d1-style'].includes(STYLE), 'Invalid artStyle');
if (EXPERIMENT) {
  assert(['E1','E2','E3','E4'].includes(EXPERIMENT), 'Invalid ablation experiment');
  assert(!STYLE || STYLE === 'c2d1-style', 'ablation uses the current shader, not a historical snapshot');
}
if (process.argv.includes('--list')) { console.log(JSON.stringify(ALL_VIEWS, null, 2)); process.exit(0); }


const report = { suite: 'M2-C2D.1 evidence capture (not art acceptance)', label: LABEL, captureComplete: false,
  requestedDebug: DEBUG, requestedStyle: STYLE, experiment: EXPERIMENT, selectedViews: VIEWS.map(v => v.key), host: { hostname: os.hostname(), platform: os.platform(), arch: os.arch() },
  startedAt: new Date().toISOString(), method: 'same natural World (C2C canonical caches) + fixed camera recipes; in-canvas gl.readPixels tonal metrics', views: [] };
let browser, server;
const page = (body, timeoutMs = 240000) => browser.js(`return (async()=>{${body}})();`, { timeoutMs });

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
  for(const [key,value] of Object.entries({renderer:'3d',assets:'on',boundary:'strata',geography:'on',...(DEBUG?{artDebug:DEBUG}:{}),...(STYLE?{artStyle:STYLE}:{})}))url.searchParams.set(key,value);
  report.url=url.href;
  await browser.cdp.send('Page.navigate', { url: url.href });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.getGeographyStats', { timeoutMs: 60000 }));
  await page(`window.inkbox.setSpeed(0);window.__c2dVisuals=await import('./src/inkbox/render3d/art/VisualScenarios.js');return true;`);

  let loadedRecipe = null, importEpoch = 0;
  const lastSelected = Math.max(...VIEWS.map(view => ALL_VIEWS.indexOf(view)));
  for (const view of ALL_VIEWS.slice(0, lastSelected + 1)) {
    if (loadedRecipe !== view.recipe) {
      console.log(`· 载入 ${view.recipe} 规范世界…`);
      if (view.recipe === 'mortal') await importSave(NATURAL_SAVE, 226, 72000);
      else await importSave(REALMS_SAVE, 20260923, 21600);
      loadedRecipe = view.recipe;
      importEpoch++;
    }
    const record = await captureView(view, importEpoch, VIEWS.includes(view));
    if (!record) continue;
    assert(record.worldSHA256 && record.advanceStateSHA256, `${view.key}: World/advance 身份摘要缺失`);
    if (record.measurement?.unavailable) console.log(`WARN ${view.key}: GPU 计时不可用（${record.measurement.reason}），已记录并继续`);
    report.views.push(record);
    fs.writeFileSync(path.join(OUT, 'browser-progress.json'), JSON.stringify(report));
    const m = record.metrics || {};
    console.log(`[${report.views.length}/${VIEWS.length}] ${view.key}  span=${m.lstarSpan?.toFixed(1)}  nearPaper=${m.nearPaperRatio?.toFixed(3)}  L30=${m.darkRatioL30?.toFixed(3)}  calls=${record.gpu?.drawCalls}  tris=${record.gpu?.triangles}  glErr=${(record.pendingGlErrors || []).length}`);
  }
  assert.equal(report.views.length, VIEWS.length);
  report.pendingGlErrors = report.views.flatMap(entry => (entry.pendingGlErrors || []).map(error => ({ view: entry.view, error })));
  report.gpuTimingUnavailable = report.views.filter(entry => entry.measurement?.unavailable).map(entry => ({ view: entry.view, reason: entry.measurement.reason }));
  const errors = { runtime: browser.errors(), consoleApi: browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
    .map(e => ({ text: (e.params.args || []).map(a => a.value ?? a.description ?? '').join(' ') })) };
  assert.deepEqual(errors, { runtime: [], consoleApi: [] }, 'Edge runtime or console errors during C2D.1 views');
  report.captureComplete = true;
} catch (error) {
  report.failure = error.stack || String(error);
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
}
