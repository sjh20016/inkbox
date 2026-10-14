// G2 product lifecycle/resource soak. No synthetic runtime events or fire-array edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';
import { findCombatRoots, combatFixtureExpression } from './inkbox-g2-fixtures.mjs';
import { collectBrowserErrors } from './inkbox-g2pf-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.INKBOX_PORT || 4198);
const base = process.env.INKBOX_URL || `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(root, 'reports/g2-local/soak'));
const seed = 673231, lifecycleFrames = 600, soakFrames = 6000, blockFrames = 300;
const fixture = combatFixtureExpression({ count: 32, roots: findCombatRoots(), seed });
const report = { startedAt: new Date().toISOString(), productionHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
  pass: false, lifecycleFrames, soakFrames, blockFrames, blocks: [], lifecycle: [],
  scope: 'One real Edge/GPU expanse World at production assets/DPR. 600 product RAF lifecycle frames plus 6000 product RAF soak frames; extra setup/warm/expiry frames explicitly counted. Fixed advanceDays(.1) once per original product update is a controlled simulation schedule, not Native performance acceptance. UI input/save gates are covered by existing G1/G22/G23 browser tests.',
  resourceScope: 'Exact geometry/texture/program references are captured only after awaiting production assets and warming all three planes and actual combat styles. World/renderer replacement starts a new resource context. A count drift is a stability failure requiring attribution, not by itself proof of leakage.',
  memoryScope: 'CDP post-forced-GC block samples; C2A existing tolerances retained: final heap <= first*1.25+8MiB, nodes <= first*1.10+200, listeners <= first*1.10+100. Simulation population and DOM activity also affect these counters; not an hours-long endurance claim.' };
let server, browser;
function expression(body) { const code = `return (async()=>{${body}})();`; new vm.Script(`(()=>{${code}})`); return code; }
const page = (body, timeoutMs = 120000) => browser.js(expression(body), { timeoutMs });

const install = `
const k=window.inkbox;
const queue=await import('./src/inkbox/core/runtimeEvents.js'), source=await import('./src/inkbox/sim/presentation.js');
const h=window.__g2pfSoak={updates:0,renders:0,canvasRenders:0,threeRenders:0,advances:0,rafFrames:0,warmFrames:0,expiryFrames:0,
  combatHits:0,nearNewsPeak:0,characterFrames:0,environmentFrames:0,firePeak:0,queuePeak:0,combatQueuePeak:0,stagePeak:0,combatPeak:0,
  failures:[],burns:[],resourceContexts:[],pool:null,simulate:true,previous:null,intervals:[],lastSourceHits:0,queue,source};
h.require=(ok,message)=>{if(!ok)throw Error(message);};
h.resources=()=>{const r=k.render3d.renderer;return {...r.gpu.info.memory,programs:r.gpu.info.programs.length};};
h.bindPools=()=>{const r=k.render3d.renderer;h.pool=[...r.stages.values()].flatMap(stage=>Object.entries(stage.fxProbe.combat.batches).map(([style,b])=>({plane:stage.plane,style,pool:stage.fxProbe.combat,mesh:b.mesh,geometry:b.geometry,material:b.material})));return h.pool.map(p=>({plane:p.plane,style:p.style,mesh:p.mesh.uuid,geometry:p.geometry.uuid,material:p.material.uuid,capacity:p.pool.stats.capacity}));};
h.burn=()=>{const w=k.world;let point=null;for(let y=12;y<w.h-12&&!point;y+=7)for(let x=12;x<w.w-12;x+=7){const i=w.idx(x,y);if(w.isWalkable(i)&&w.veg[i]>.3&&w.fire[i]<.01){point={x,y};break;}}
  h.require(point,'No real vegetated cell available for official burn');const i=w.idx(point.x,point.y),before={fire:w.fire[i],veg:w.veg[i],over:w.over[i]},t=performance.now();
  k.selectTool('burn');k.applyTool(true,{point,radius:6});k.selectTool('raise');
  const after={fire:w.fire[i],veg:w.veg[i],over:w.over[i]};h.require(after.fire>.01,'Official burn failed to ignite real vegetation');
  h.require(k.environmentObservation.select({plane:'mortal',...point,radius:6}).ok,'Bounded environment observation failed');
  h.burns.push({frame:h.rafFrames,worldSeed:w.seed,point,before,after,synchronousMs:performance.now()-t});};
h.sample=()=>{const q=queue.runtimeEventStats(k.world),combat=k.stage.fx.items.filter(f=>f.kind==='combat').length;
  h.queuePeak=Math.max(h.queuePeak,q.queued);h.combatQueuePeak=Math.max(h.combatQueuePeak,q.combatQueued);h.stagePeak=Math.max(h.stagePeak,k.stage.fx.items.length);h.combatPeak=Math.max(h.combatPeak,combat);
  h.require(q.queued<=256&&q.combatQueued<=64&&k.stage.fx.items.length<=64&&combat<=32,'Stage/runtime queue capacity exceeded');for(const plane of ['mortal','upper','nether'])h.require(k.stage.fx.items.filter(f=>f.kind==='combat'&&f.plane===plane).length<=16,'Per-plane combat Stage capacity exceeded');
  for(const p of h.pool||[]){const livePool=k.render3d.renderer.stages.get(p.plane)?.fxProbe?.combat;h.require(livePool===p.pool,'Live combat pool replaced within World context');const b=livePool.batches[p.style];h.require(b.mesh===p.mesh&&b.geometry===p.geometry&&b.material===p.material&&livePool.root.children.length===3&&livePool.root.children.includes(b.mesh),'Combat pool identity changed within World context');h.require(p.pool.stats.capacity===32&&p.pool.stats.combatActive<=32&&b.mesh.count<=32,'Three combat pool capacity exceeded');}
  const hits=source.combatPresentationStats(k.world).hits;h.combatHits+=Math.max(0,hits-h.lastSourceHits);h.lastSourceHits=hits;
  h.nearNewsPeak=Math.max(h.nearNewsPeak,k.combatObservation.current()?.events?.length||0);
  h.characterFrames+=!!k.g1.current();const observation=k.environmentObservation.current()?.observation;
  h.environmentFrames+=!!observation?.ok;h.firePeak=Math.max(h.firePeak,observation?.environment?.activeFireCells||0);
};
const originalUpdate=k.update,originalRender=k.render;
k.update=function(...args){h.updates++;if(h.simulate){this.advanceDays(.1);h.advances++;}return originalUpdate.apply(this,args);};
k.render=function(...args){const result=originalRender.apply(this,args);h.renders++;if(this.render3d.active)h.threeRenders++;else h.canvasRenders++;try{h.sample();}catch(error){h.failures.push({frame:h.rafFrames,message:error.message});}return result;};
h.restore=()=>{k.update=originalUpdate;k.render=originalRender;};
h.frames=async(n,kind)=>{for(let i=0;i<n;i++){const ts=await new Promise(requestAnimationFrame);if(h.previous!==null)h.intervals.push(ts-h.previous);h.previous=ts;h.rafFrames++;if(kind==='warm')h.warmFrames++;if(kind==='expiry')h.expiryFrames++;}h.require(h.failures.length===0,JSON.stringify(h.failures.slice(0,5)));};
h.openCharacter=()=>{const e=k.world.entities.find(e=>window.__g2CombatActors.includes(e.id)&&e.hp>0)||k.world.entities.find(e=>['human','cultivator'].includes(e.sp)&&e.hp>0);h.require(e,'No real living character for G1');const opened=k.g1.open({plane:'mortal',entityId:e.id});h.require(opened.ok,'G1 formal character open failed');return opened;};
h.warm=async(label)=>{h.pool=null;const r=k.render3d.renderer;k.render3d.setActive(true);await Promise.all([r.characterLoadPromise,r.environmentLoadPromise,r.art.comparisonReady]);h.require(!r.characterLoadError&&!r.environmentLoadError,'Production assets failed');h.openCharacter();h.burn();
  await h.frames(90,'warm');for(const plane of ['upper','nether','mortal']){r.setActivePlane(plane);await h.frames(8,'warm');await r.gpu.compileAsync(r.scene,r.cameraRig.camera);}
  r.cameraRig.fit();await h.frames(12,'warm');const identity=h.bindPools();const context={label,resources:h.resources(),identity,warmedPlanes:['upper','nether','mortal'],assetsEnabled:r.productionAssetsEnabled};h.require(context.assetsEnabled,'Production assets disabled');h.resourceContexts.push(context);return context;};
return true;`;

const createWorld = `const k=window.inkbox;k.speedIndex=0;k.newWorld('expanse',${seed},{progressive:false});k.camera.fit(k.world);window.__g2pfSoak.lastSourceHits=0;return [k.world.w,k.world.h];`;
const renewalFixture = combatFixtureExpression({ count: 2, roots: findCombatRoots(), seed });
async function ensureRealNearNews(){const present=await page(`return !!window.inkbox.combatObservation.current()?.events?.some(e=>e.canObserve);`);if(!present){const renewal=await browser.js(renewalFixture,{timeoutMs:120000});assert.equal(renewal.originalEntitiesRetained,true);await page(`await window.__g2pfSoak.frames(45,'warm');return true;`);report.combatRenewals||=[];report.combatRenewals.push(renewal);}}
const staleCapture = `const k=window.inkbox,h=window.__g2pfSoak,opened=h.openCharacter(),event=k.combatObservation.current()?.events?.find(e=>e.canObserve),env=k.environmentObservation.current();
h.require(event,'No actual AI near-news token before replacement');h.require(env.observation?.ok,'No real environment token before replacement');
window.__g2pfStale={g1:()=>k.g1.dispatch({type:'focus',targetKey:opened.viewModel.identity.key},opened.token),g22:()=>k.combatObservation.handleAction({type:'locate-combat',eventId:event.id}),g23:()=>k.environmentObservation.handleAction({type:'focus-area',contextId:env.contextId,observationId:env.observationId})};return {eventId:event.id,contextId:env.contextId};`;
const staleCheck = `const k=window.inkbox,a=window.__g2pfStale;const result={g1:a.g1(),g22:a.g22(),g23:a.g23()};for(const [name,value]of Object.entries(result))if(value.ok)throw Error('Old '+name+' callback remained valid after World replacement');window.__g2pfStale=null;return result;`;
const runBlock = (n,lifecycle=false) => `const k=window.inkbox,h=window.__g2pfSoak;h.burn();h.openCharacter();const before={updates:h.updates,renders:h.renders,advances:h.advances,frames:h.rafFrames};if(${lifecycle}){await h.frames(100,'sample');k.render3d.setActive(false);await h.frames(50,'sample');k.render3d.setActive(true);await h.frames(${n}-150,'sample');}else await h.frames(${n},'sample');const r=k.render3d.renderer,gl=r.gpu.getContext(),error=gl.getError();if(error!==0)throw Error('GL error '+error);return {frames:${n},before,after:{updates:h.updates,renders:h.renders,advances:h.advances,frames:h.rafFrames},resources:h.resources(),source:h.source.combatPresentationStats(k.world),day:k.world.day,population:k.world.entities.length,glError:error,visibility:document.visibilityState,poolIdentity:h.pool.map(p=>p.mesh.uuid)};`;

const environmentProgram = `const k=window.inkbox,r=k.render3d.renderer,g=r.gpu.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,gpu:g.getParameter(e?e.UNMASKED_RENDERER_WEBGL:g.RENDERER),deviceDpr:devicePixelRatio,threeDpr:r.gpu.getPixelRatio()};`;
const expiryProgram = `const k=window.inkbox,h=window.__g2pfSoak,event=k.combatObservation.current().events.find(e=>e.canObserve);h.require(event,'Missing real AI event for expiry');h.simulate=false;await h.frames(240,'expiry');const result=k.combatObservation.handleAction({type:'locate-combat',eventId:event.id});h.require(!result.ok,'Expired real near-news token remained actionable');h.simulate=true;return {eventId:event.id,result};`;
const replaceAdapterProgram = `const k=window.inkbox,old=k.render3d,button=old.panel.querySelector('[data-action="toggle"]');old.dispose();const {Render3DAdapter}=await import('./src/inkbox/render3d/Render3DAdapter.js');k.render3d=new Render3DAdapter(k);const active=k.render3d.active,oldActive=old.active,sharedBefore={canvasVisibility:k.canvas.style.visibility,railInert:document.querySelector('.rail.left').inert};button.click();const sharedAfter={canvasVisibility:k.canvas.style.visibility,railInert:document.querySelector('.rail.left').inert};if(k.render3d.active!==active||old.active!==oldActive||JSON.stringify(sharedBefore)!==JSON.stringify(sharedAfter)||!old.renderer.disposed||old.renderer.stages.size!==0)throw Error('Disposed renderer callback/resources survived replacement');return {oldDisposed:old.renderer.disposed,oldStages:old.renderer.stages.size,oldDomConnected:button.isConnected,newActive:k.render3d.active,oldActiveBefore:oldActive,oldActiveAfter:old.active,sharedBefore,sharedAfter};`;
const accountingProgram = `const h=window.__g2pfSoak;h.restore();const intervals=[...h.intervals].sort((a,b)=>a-b);return {rafIntervals:{n:intervals.length,p50:intervals[Math.floor(intervals.length*.5)],p95:intervals[Math.floor(intervals.length*.95)],max:intervals.at(-1),scope:'Harness RAF callback timestamps spanning warm/lifecycle/soak, includes inter-block CDP/setup gaps; stability evidence only, no performance budget'},updates:h.updates,renders:h.renders,canvasRenders:h.canvasRenders,threeRenders:h.threeRenders,controlledAdvanceCalls:h.advances,totalHarnessRaf:h.rafFrames,extraWarmRaf:h.warmFrames,extraExpiryRaf:h.expiryFrames,combatHits:h.combatHits,nearNewsPeak:h.nearNewsPeak,characterFrames:h.characterFrames,environmentFrames:h.environmentFrames,firePeak:h.firePeak,queuePeak:h.queuePeak,combatQueuePeak:h.combatQueuePeak,stagePeak:h.stagePeak,combatPeak:h.combatPeak,burns:h.burns,failures:h.failures,resourceContexts:h.resourceContexts};`;
for (const body of [install, createWorld, staleCapture, staleCheck, runBlock(300),runBlock(200,true), fixture, renewalFixture, environmentProgram, expiryProgram, replaceAdapterProgram, accountingProgram]) expression(body);
if (process.argv.includes('--check')) { console.log('G2-PF soak: inline lifecycle/6000 RAF programs compile; hardware not launched'); process.exit(0); }

async function memory() {
  await browser.cdp.send('HeapProfiler.collectGarbage');
  const [performance, dom] = await Promise.all([browser.cdp.send('Performance.getMetrics'), browser.cdp.send('Memory.getDOMCounters')]);
  const metrics = Object.fromEntries(performance.metrics.map(m => [m.name, m.value]));
  assert(Number.isFinite(metrics.JSHeapUsedSize) && Number.isFinite(dom.nodes) && Number.isFinite(dom.jsEventListeners), 'Required heap/listener counters unavailable');
  return { afterForcedGC: true, heapBytes: metrics.JSHeapUsedSize, nodes: dom.nodes, listeners: dom.jsEventListeners };
}
function errors() { return { runtime: browser?.errors() || [], console: browser?.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error').map(e => ({ args: e.params.args, stackTrace: e.params.stackTrace })) || [] }; }
async function waitExited(child) { for (let i = 0; i < 50; i++) { if (child.exitCode !== null || child.signalCode !== null) return true; try { process.kill(child.pid, 0); } catch (error) { if (error.code === 'ESRCH') return true; } await sleep(100); } return false; }
async function cleanupProfile(profile) {
  const target = path.resolve(profile); assert.equal(path.dirname(target).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase(), 'Profile outside system temp'); assert.match(path.basename(target), /^cdp-[a-z0-9]+$/i);
  for (let i = 0; i < 10; i++) { try { fs.rmSync(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }); } catch { /* bounded retry */ } if (!fs.existsSync(target)) return true; await sleep(200); } return false;
}
try {
  fs.mkdirSync(output, { recursive: true });
  if (!process.env.INKBOX_URL) { server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(port)], { cwd: root, stdio: 'ignore', windowsHide: true }); let ready = false; for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) { ready = true; break; } } catch { /* startup */ } await sleep(150); } assert(ready && server.exitCode === null, 'Owned server did not start'); }
  browser = await launch({ url: 'about:blank', browser: findEdge(), width: 1500, height: 940, gpu: true });
  await browser.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(window,'inkbox',{configurable:true,set(k){Object.defineProperty(window,'inkbox',{configurable:true,writable:true,value:k});k.speedIndex=0;}});" });
  await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 940, deviceScaleFactor: 2, mobile: false });
  await browser.cdp.send('Performance.enable');
  const url = new URL('/inkbox.html', base); url.searchParams.set('renderer', '3d');
  await browser.cdp.send('Page.navigate', { url: url.toString() });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size', { timeoutMs: 60000 }), 'Product renderer failed to boot');
  report.environment = await page(environmentProgram);
  assert(!/swiftshader|llvmpipe|software|basic render/i.test(report.environment.gpu), 'Hardware GPU required');
  await page(install);
  assert.deepEqual(await page(createWorld), [512, 320]);
  report.fixture = await browser.js(fixture, { timeoutMs: 120000 }); assert.equal(report.fixture.originalEntitiesRetained, true);
  report.warmup = await page(`return await window.__g2pfSoak.warm('initial');`);
  // A real old near-news token must expire with display time, without clearing Stage.
  await ensureRealNearNews();report.expiry = await page(expiryProgram);
  let lifecycleReference=report.warmup;
  for (let segment = 0; segment < 3; segment++) {
    const current = await page(runBlock(200,true)); report.lifecycle.push({ segment, referenceLabel:lifecycleReference.label,...current });assert.deepEqual(current.resources,lifecycleReference.resources,'Lifecycle resources drifted within warmed World/renderer context '+segment);
    if (segment < 2) {
      await ensureRealNearNews();const tokens = await page(staleCapture);
      await page(`window.__g2pfSoak.pool=null;return true;`);
      await page(createWorld); const nextFixture = await browser.js(fixture, { timeoutMs: 120000 }); assert.equal(nextFixture.originalEntitiesRetained, true);
      const invalidated = await page(staleCheck);
      let adapterReplacement = null;
      if (segment === 1) adapterReplacement = await page(replaceAdapterProgram);
      const warmup = await page(`return await window.__g2pfSoak.warm('replacement-${segment}');`);
      lifecycleReference=warmup;report.lifecycle.push({ operation: 'world-replacement', tokens, invalidated, adapterReplacement, fixture: nextFixture, warmup });
    }
  }
  report.soakResourceReference = await page(`return await window.__g2pfSoak.warm('stable-soak');`);
  for (let block = 0; block < soakFrames / blockFrames; block++) {
    const current = await page(runBlock(blockFrames)); current.memory = await memory(); current.block = block;
    report.blocks.push(current);
    assert.deepEqual(current.resources, report.soakResourceReference.resources, `Warmed same-state resources drifted at block ${block}; classify before calling it leakage`);
    assert(current.after.updates - current.before.updates >= blockFrames && current.after.renders - current.before.renders >= blockFrames, 'Product update/render skipped RAF samples');
    console.log(`G2 soak ${(block + 1) * blockFrames}/${soakFrames} product RAF; geometry=${current.resources.geometries} programs=${current.resources.programs} listeners=${current.memory.listeners}`);
    fs.writeFileSync(path.join(output, 'lifecycle-soak.json'), JSON.stringify(report, null, 2));
  }
  report.accounting = await page(accountingProgram);
  assert(report.accounting.canvasRenders>=150&&report.accounting.threeRenders>=6000,'Lifecycle did not exercise Canvas and Three product render paths');
  assert(report.accounting.combatHits > 0 && report.accounting.nearNewsPeak > 0 && report.accounting.characterFrames > 0 && report.accounting.firePeak > 0, 'G1/G22/G23 live product evidence missing');
  assert.equal(report.lifecycle.filter(row => row.frames).reduce((n, row) => n + row.frames, 0), lifecycleFrames);
  assert.equal(report.blocks.reduce((n, row) => n + row.frames, 0), soakFrames);
  const first = report.blocks[0].memory, last = report.blocks.at(-1).memory;
  report.memoryTrend = { first, last, heapDeltaBytes: last.heapBytes - first.heapBytes, nodeDelta: last.nodes - first.nodes, listenerDelta: last.listeners - first.listeners,
    limits: { heapBytes: first.heapBytes * 1.25 + 8 * 1024 * 1024, nodes: first.nodes * 1.10 + 200, listeners: first.listeners * 1.10 + 100 } };
  assert(last.heapBytes <= report.memoryTrend.limits.heapBytes && last.nodes <= report.memoryTrend.limits.nodes && last.listeners <= report.memoryTrend.limits.listeners, 'C2A inherited post-GC heap/DOM/listener stability threshold failed');
  report.errors = errors(); assert.equal(collectBrowserErrors(browser).length, 0, 'Browser console/runtime errors'); report.pass = true;
} catch (error) { if(browser){try{report.partialAccounting=await page(accountingProgram);}catch(accountingError){report.partialAccountingError=accountingError.message;}}report.failure = error.stack || String(error); report.errors = errors(); process.exitCode = 1; console.error(report.failure); }
finally {
  if (browser) { const profile = browser.userDataDir; await browser.close(); report.browserExited = await waitExited(browser.child); report.profileRemoved = report.browserExited && await cleanupProfile(profile); if (!report.browserExited || !report.profileRemoved) { report.pass = false; report.cleanupFailure = 'Owned browser/profile cleanup incomplete'; process.exitCode = 1; } }
  if (server) { server.kill(); report.serverExited = await waitExited(server); if (!report.serverExited) { report.pass = false; report.cleanupFailure = 'Owned server cleanup incomplete'; process.exitCode = 1; } }
  report.errors=errors();if(collectBrowserErrors(browser).length){report.pass=false;report.failure ||= 'Browser errors during final cleanup';process.exitCode=1;}report.finishedAt = new Date().toISOString(); fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'lifecycle-soak.json'), JSON.stringify(report, null, 2));
}
