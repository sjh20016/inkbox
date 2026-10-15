// 600-frame lifecycle and 6000-frame resource soak for the integrated M2-C2A renderer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser, sleep } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.INKBOX_PORT || 4192);
const base = process.env.INKBOX_URL || `http://127.0.0.1:${port}`;
function rendererPageURL(value) {
  const url = new URL(value);
  if (/\/inkbox\.html\/?$/i.test(url.pathname)) url.pathname = url.pathname.replace(/\/$/, '');
  else url.pathname = `${url.pathname.replace(/\/$/, '')}/inkbox.html`;
  url.searchParams.set('renderer', '3d'); url.searchParams.set('assets','off');
  return url.toString();
}
const pageURL = rendererPageURL(base);
const output = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(root, 'reports/m2c2a/browser'));
const report = { startedAt: new Date().toISOString(), lifecycleFrames: 600, soakFrames: 6000, blockFrames: 300, blocks: [], pass: false };
let server, browser;
const page = body => browser.js(`return (async()=>{${body}})();`);
function browserDiagnostics() {
  const consoleErrors = browser?.cdp.events.filter(event => event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error')
    .map(event => event.params.args?.map(arg => arg.value || arg.description || '').join(' ')) || [];
  return { consoleErrors, runtimeErrors: browser?.errors() || [] };
}

async function startServer() {
  if (process.env.INKBOX_URL) return null;
  const child = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(port)], { cwd: root, stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(pageURL)).ok) return child; } catch { /* startup */ }
    await sleep(150);
  }
  child.kill(); throw new Error(`Inkbox server did not start at ${base}`);
}
async function prepare() {
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size', { timeoutMs: 60000 }), `Render3D did not boot: ${browser.errors().join(' | ')}`);
  return page(`
    const k=window.inkbox,r=k.render3d.renderer;
    await r.characterLoadPromise;if(r.characterLoadError)throw r.characterLoadError;
    window.__m2c2a=await import('./src/inkbox/render3d/art/VisualScenarios.js');
    const spec=window.__m2c2a.applyScenario(k,'DENSITY_A');
    await r.characterLoadPromise;if(r.characterLoadError)throw r.characterLoadError;
    r.setArtProfile('pilot');if(typeof r.setLODEnabled!=='function')throw new Error('Render3DHost.setLODEnabled(bool) is required');r.setLODEnabled(true);
    window.__m2c2a.applyCamera(r,'WORLD_OVERVIEW');
    return spec;
  `);
}
async function cpuMemorySample() {
  try {
    await browser.cdp.send('HeapProfiler.collectGarbage', {}, 30000);
    const [performance, dom] = await Promise.all([
      browser.cdp.send('Performance.getMetrics', {}, 30000),
      browser.cdp.send('Memory.getDOMCounters', {}, 30000),
    ]);
    const metrics = Object.fromEntries((performance.metrics || []).map(metric => [metric.name, metric.value]));
    if (!Number.isFinite(metrics.JSHeapUsedSize) || !Number.isFinite(dom.nodes) || !Number.isFinite(dom.jsEventListeners)) throw new Error('CDP omitted JS heap or DOM counters');
    return { available: true, afterForcedGC: true, jsHeapUsedBytes: metrics.JSHeapUsedSize, jsHeapTotalBytes: metrics.JSHeapTotalSize, domNodes: dom.nodes, jsEventListeners: dom.jsEventListeners };
  } catch (error) {
    return { available: false, reason: String(error?.message || error), afterForcedGC: false };
  }
}
async function warmAllVariants() {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,w=k.world;
    const region=(plane)=>{const side=Math.floor(Math.min(w.w,w.h)*.58),cx=(w.w-1)/2,cy=(w.h-1)/2,x0=Math.floor(cx-side/2),y0=Math.floor(cy-side/2),x1=x0+side,y1=y0+side;k.selectTool(plane==='upper'?'viewUpper':'viewNether');k.selection={path:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],x0,y0,x1,y1,area:(x1-x0)*(y1-y0)};k.dirty=true;r.setRealmViewState(k.getRealmViewState());};
    const close=()=>{k.selectTool('inspect');k.selection=null;k.dirty=true;r.setRealmViewState(k.getRealmViewState());};
    const warm=[],gl=r.gpu.getContext(),resourceReference={};
    for(const profile of ['baseline','pilot'])for(const lod of [false,true])for(const view of ['mortal','upper','nether']){
      r.setArtProfile(profile);r.setLODEnabled(lod);
      if(view==='mortal')close();else region(view);
      for(const zoom of [18,4,.5]){
        window.__m2c2a.applyCamera(r,'WORLD_OVERVIEW',{poi:{x:(w.w-1)/2,y:(w.h-1)/2,source:'warmup-LOD-zoom'},zoom});
        for(let frame=0;frame<3;frame++){await new Promise(requestAnimationFrame);r.update(1/60);r.render();}
        const glError=gl.getError(),programStatus=r.gpu.info.programs.map(p=>({name:p.name||null,runnable:p.diagnostics?.runnable??p.runnable??null}));
        if(glError!==0)throw new Error('GL error during shader/resource warmup '+profile+'/'+lod+'/'+view+'/zoom'+zoom+': '+glError);
        if(programStatus.some(p=>p.runnable===false))throw new Error('Shader program failed during warmup '+profile+'/'+lod+'/'+view+'/zoom'+zoom);
        const resources={...r.gpu.info.memory,programs:r.gpu.info.programs.length},key=[profile,lod?'lod':'no-lod',view].join('/');
        resourceReference[key]=resources;warm.push({profile,lod,view,zoom,glError,programStatus,resources});
      }
    }
    for(const profile of ['baseline','pilot'])for(const lod of [false,true])for(const view of ['mortal','upper','nether']){
      r.setArtProfile(profile);r.setLODEnabled(lod);if(view==='mortal')close();else region(view);
      window.__m2c2a.applyCamera(r,'WORLD_OVERVIEW',{poi:{x:(w.w-1)/2,y:(w.h-1)/2,source:'warmed-reference'},zoom:4});
      for(let frame=0;frame<3;frame++){await new Promise(requestAnimationFrame);r.update(1/60);r.render();}
      resourceReference[[profile,lod?'lod':'no-lod',view].join('/')]= {...r.gpu.info.memory,programs:r.gpu.info.programs.length};
    }
    close();r.setArtProfile('pilot');r.setLODEnabled(true);window.__m2c2a.applyCamera(r,'WORLD_OVERVIEW');
    for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);r.render();}
    return {warm,resourceReference,resources:{...r.gpu.info.memory,programs:r.gpu.info.programs.length},visiblePlanes:[...r.stages.values()].filter(s=>s.visible).map(s=>s.plane),referenceExplanation:'GPU resource baselines are keyed by warmed profile/LOD/view. Every combination is rendered at legal zoom 18, 4 and 0.5 before lifecycle/soak; realm windows remain open for realm baselines so the boundary geometry is already included.'};
  `);
}
async function runLifecycle() {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,w=k.world,gl=r.gpu.getContext(),width=r.width,height=r.height;
    const digestBefore=await window.__m2c2a.snapshotDigest(k),resources=[],raf=[],glErrors=[],windows=[];let prev=null;
    const open=plane=>{const side=Math.floor(Math.min(w.w,w.h)*.58),cx=(w.w-1)/2,cy=(w.h-1)/2,x0=Math.floor(cx-side/2),y0=Math.floor(cy-side/2),x1=x0+side,y1=y0+side;k.selectTool(plane==='upper'?'viewUpper':'viewNether');k.selection={path:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],x0,y0,x1,y1,area:(x1-x0)*(y1-y0)};k.dirty=true;r.setRealmViewState(k.getRealmViewState());windows.push({plane,open:r.realmPrototype.open,visible:[...r.stages.values()].filter(s=>s.visible).map(s=>s.plane)});};
    const close=()=>{k.selectTool('inspect');k.selection=null;k.dirty=true;r.setRealmViewState(k.getRealmViewState());};
    for(let frame=0;frame<600;frame++){
      if(frame===20)r.resize(width-31,height-19);if(frame===40)r.resize(width,height);
      if(frame===180)r.resize(width-17,height-11);if(frame===205)r.resize(width,height);
      if(frame===240)open('upper');if(frame===300)open('nether');if(frame===355){close();window.__m2c2a.applyCamera(r,'WORLD_OVERVIEW');}
      if(frame%20===0){const profile=['baseline','pilot'][(frame/20|0)%2],lod=(frame/20|0)%2===0;r.setArtProfile(profile);r.setLODEnabled(lod);}
      r.cameraRig.rotate(.009);r.cameraRig.camera.zoom=1.45+4.5*(1-Math.cos(frame/599*Math.PI*4))/2;r.cameraRig.camera.updateProjectionMatrix();
      const ts=await new Promise(requestAnimationFrame);if(prev!==null)raf.push(ts-prev);prev=ts;
      const error=gl.getError();if(error!==0)glErrors.push({frame,error});
      if([0,119,239,299,354,429,599].includes(frame))resources.push({frame,...r.gpu.info.memory,programs:r.gpu.info.programs.length,calls:r.gpu.info.render.calls,triangles:r.gpu.info.render.triangles});
    }
    close();r.resize(width,height);r.setArtProfile('pilot');r.setLODEnabled(true);window.__m2c2a.applyCamera(r,'WORLD_OVERVIEW');
    const digestAfter=await window.__m2c2a.snapshotDigest(k),sorted=[...raf].sort((a,b)=>a-b);
    return {frames:600,raf:{samples:raf.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)]},resources,windows,glErrors,worldDigestBefore:digestBefore,worldDigestAfter:digestAfter,worldUnchanged:digestBefore.value===digestAfter.value,resizeRestored:r.width===width&&r.height===height};
  `);
}
async function soakBlock(block) {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,w=k.world,gl=r.gpu.getContext(),plane=${block}%2===0?'upper':'nether',profile=${block}%2===0?'pilot':'baseline',lod=${block}%2===0;
    const side=Math.floor(Math.min(w.w,w.h)*.58),cx=(w.w-1)/2,cy=(w.h-1)/2,x0=Math.floor(cx-side/2),y0=Math.floor(cy-side/2),x1=x0+side,y1=y0+side;
    k.selectTool(plane==='upper'?'viewUpper':'viewNether');k.selection={path:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],x0,y0,x1,y1,area:(x1-x0)*(y1-y0)};k.dirty=true;r.setRealmViewState(k.getRealmViewState());
    r.setArtProfile(profile);r.setLODEnabled(lod);
    const stage=r.stages.get(plane),layers=[stage.terrain,stage.entities,stage.vegetation,stage.settlements].filter(Boolean);
    if(!stage.terrain||!stage.entities)throw new Error('Realm terrain/entities are required in soak block ${block}');
    if(!r.realmPrototype.open||!r.stages.get('mortal').visible||!stage.visible)throw new Error('Realm window stage visibility failed in soak block ${block}');
    if(!layers.every(layer=>layer.regionGeometry===stage.regionGeometry)||!r.stages.get('mortal').regionGeometry||r.stages.get('mortal').regionInside!==false||stage.regionInside!==true)throw new Error('RegionGeometry sharing/mask failed in soak block ${block}');
    const frameIntervals=[],frames=300;let previous=null;
    for(let i=0;i<frames;i++){
      const global=${block}*300+i;r.cameraRig.rotate(.006);r.cameraRig.camera.zoom=1.5+6*(1-Math.cos((i/299)*Math.PI*2))/2;r.cameraRig.camera.updateProjectionMatrix();
      const ts=await new Promise(requestAnimationFrame);if(previous!==null)frameIntervals.push(ts-previous);previous=ts;
      const error=gl.getError();if(error!==0)throw new Error('GL error '+error+' at soak frame '+global);
    }
    const digest=await window.__m2c2a.snapshotDigest(k),stats={};
    for(const [name,layer] of [['trees',stage.vegetation],['characters',stage.entities],['buildings',stage.settlements]]){
      if(!layer){stats[name]={absent:true,lod:[0,0,0],triangles:0,overflow:0,capacity:0};continue;}
      const s=layer.stats,lodCounts=s.lod??s.lodCounts;
      if(!Array.isArray(lodCounts)||lodCounts.length!==3||!Number.isFinite(s.triangles)||!Number.isFinite(s.overflow)||!Number.isFinite(s.capacity))throw new Error(name+' layer missing lod/triangles/overflow/capacity stats at soak frame '+${block}*300);
      stats[name]={lod:lodCounts,triangles:s.triangles,overflow:s.overflow,capacity:s.capacity};
    }
    const ordered=[...frameIntervals].sort((a,b)=>a-b);
    return {block:${block},frames:300,plane,profile,lodEnabled:r.lodEnabled,resources:{...r.gpu.info.memory,programs:r.gpu.info.programs.length},worldDigest:digest,stats,raf:{samples:frameIntervals.length,medianMs:ordered[Math.floor(ordered.length*.5)],p95Ms:ordered[Math.floor(ordered.length*.95)]},drawCalls:r.gpu.info.render.calls,triangles:r.gpu.info.render.triangles,visiblePlanes:[...r.stages.values()].filter(s=>s.visible).map(s=>s.plane),glError:gl.getError()};
  `);
}

try {
  fs.mkdirSync(output, { recursive: true });
  const executable = findBrowser(); assert(executable, 'Microsoft Edge or Chrome is required');
  server = await startServer();
  browser = await launch({ url: pageURL, browser: executable, width: 1500, height: 940, gpu: true, timeoutMs: 30000 });
  report.scenario = await prepare();
  report.environment = await page(`const r=window.inkbox.render3d.renderer,g=r.gpu.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {browser:navigator.userAgent,gpu:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),viewport:[innerWidth,innerHeight],dpr:r.gpu.getPixelRatio()};`);
  await browser.cdp.send('Performance.enable', {}, 30000);
  report.warmup = await warmAllVariants();
  report.lifecycle = await runLifecycle();
  assert(report.lifecycle.worldUnchanged, '600-frame lifecycle changed complete World/advanceState fingerprint');
  assert(report.lifecycle.resizeRestored, '600-frame lifecycle failed to restore renderer dimensions');
  assert.deepEqual(report.lifecycle.glErrors, [], 'GL errors during lifecycle');
  assert(report.lifecycle.windows.some(x=>x.plane==='upper'&&x.visible.includes('upper')) && report.lifecycle.windows.some(x=>x.plane==='nether'&&x.visible.includes('nether')), 'Lifecycle did not show both realm windows');
  for(let block=0;block<20;block++){
    const current=await soakBlock(block);
    current.cpuMemory=await cpuMemorySample();
    assert.equal(current.glError,0,`GL error after soak block ${block}`);
    assert.equal(current.worldDigest.value,report.lifecycle.worldDigestAfter.value,`World digest changed after soak block ${block}`);
    const resourceKey=[current.profile,current.lodEnabled?'lod':'no-lod',current.plane].join('/'),reference=report.warmup.resourceReference[resourceKey];
    assert(reference,`No fully warmed GPU resource reference for ${resourceKey}`);
    assert.deepEqual(current.resources,reference,`GPU geometry/texture/program counts drifted from same-state fully warmed reference after soak block ${block}`);
    assert(current.visiblePlanes.includes('mortal')&&current.visiblePlanes.includes(current.plane),`Realm visibility failed after soak block ${block}`);
    report.blocks.push(current);
    console.log(`soak ${((block+1)*300).toString().padStart(4,' ')} / 6000 frames · ${current.plane} · ${current.profile} · LOD ${current.lodEnabled?'on':'off'} · geometry ${current.resources.geometries} · programs ${current.resources.programs}`);
    fs.writeFileSync(path.join(output,'soak-progress.json'),JSON.stringify(report,null,2));
  }
  const memorySamples=report.blocks.map(block=>block.cpuMemory),first=memorySamples[0],last=memorySamples.at(-1);
  if(memorySamples.every(sample=>sample?.available)){
    const heapLimit=first.jsHeapUsedBytes*1.25+8*1024*1024,domNodeLimit=first.domNodes*1.10+200,listenerLimit=first.jsEventListeners*1.10+100;
    report.cpuMemoryStability={available:true,afterForcedGC:true,first,last,heapGrowthBytes:last.jsHeapUsedBytes-first.jsHeapUsedBytes,heapLimitBytes:heapLimit,domNodeDelta:last.domNodes-first.domNodes,domNodeLimitDelta:domNodeLimit-first.domNodes,listenerDelta:last.jsEventListeners-first.jsEventListeners,listenerLimitDelta:listenerLimit-first.jsEventListeners,tolerance:'post-GC end-of-soak JS heap <= 1.25x first block + 8 MiB; DOM nodes <= first + 10% + 200; listeners <= first + 10% + 100 to allow framework/inspector counter fluctuation'};
    assert(last.jsHeapUsedBytes<=heapLimit,'Post-GC JS heap grew beyond 1.25x first soak block + 8 MiB');
    assert(last.domNodes<=domNodeLimit,'DOM node count grew beyond first block + 10% + 200');
    assert(last.jsEventListeners<=listenerLimit,'DOM listener count grew beyond first block + 10% + 100');
  } else report.cpuMemoryStability={available:false,reason:memorySamples.find(sample=>!sample?.available)?.reason||'CDP counters unavailable',note:'CPU/DOM memory stability was not asserted'};
  report.diagnostics=browserDiagnostics();
  report.browserErrors=[...report.diagnostics.consoleErrors,...report.diagnostics.runtimeErrors];
  assert.deepEqual(report.browserErrors,[],'Browser console/shader/runtime/resource errors');
  report.pass=true;
} catch(error) {
  report.failure=error.stack||String(error);report.diagnostics=browser?browserDiagnostics():{consoleErrors:[],runtimeErrors:[]};
  report.browserErrors=[...(report.browserErrors||[]),...report.diagnostics.consoleErrors,...report.diagnostics.runtimeErrors];
  process.exitCode=1;console.error(error.stack||error);
} finally {
  report.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(output,'lifecycle-soak.json'),JSON.stringify(report,null,2));
  try { fs.unlinkSync(path.join(output,'soak-progress.json')); } catch { /* no progress file */ }
  await browser?.close();
  if(server&&server.exitCode===null){server.kill();await sleep(250);}
}
