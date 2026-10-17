// Formal G2.3 browser acceptance: real pointer edits, existing World simulation, and official save/load.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.INKBOX_PORT || 4219);
const BASE = process.env.INKBOX_URL || `http://127.0.0.1:${PORT}`;
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/local/g23/browser'));
const APP_URL = new URL('inkbox.html?renderer=3d', BASE.endsWith('/') ? BASE : BASE + '/').href;
const report = {
  startedAt: new Date().toISOString(), pass: false, backend: 'Repository-owned Microsoft Edge/CDP',
  browserPlugin: 'absent', fallbackReason: 'Browser plugin was unavailable; Tabbit returned CLI_REGISTRATION_UNAVAILABLE in ordinary and elevated attempts. Used the repository Edge/CDP harness as authorized.',
  sourceFlow: 'official Canvas/3D pointer tools -> World fire/veg/over -> advanceDays -> environment observer -> official browser save/load',
  performanceClaim: false, viewport: { desktop: '1440x1000', narrow: '960x800' }, checks: [], screenshots: [],
};
let server, browser;
const page = code => browser.js(`return (async()=>{${code}})()`, { timeoutMs: 60000 });
async function check(name, fn) {
  const evidence = await fn(); report.checks.push({ name, pass: true, evidence }); console.log(`PASS ${name}`);
}
async function frames(n = 2) {
  await page(`for(let n=0;n<${n};n++)await new Promise(requestAnimationFrame);return true;`);
}
async function shot(name) {
  const file = await browser.screenshot(path.join(OUT, `${name}.png`), { timeoutMs: 30000 });
  report.screenshots.push(file); return file;
}
async function clickControl(selector) {
  const point = await page(`const e=document.querySelector(${JSON.stringify(selector)});
    if(!e||e.disabled||e.hidden)throw Error('Missing enabled control '+${JSON.stringify(selector)});
    if(e.closest('.rail,.g1-character__body,.help-card'))e.scrollIntoView({block:'nearest',behavior:'instant'});
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
    if(r.width<=0||r.height<=0||hit!==e&&!e.contains(hit))throw Error('Control clipped/intercepted '+${JSON.stringify(selector)}+': '+JSON.stringify({rect:{x:r.x,y:r.y,w:r.width,h:r.height},target:{tag:e.tagName,id:e.id,className:e.className,pointer:getComputedStyle(e).pointerEvents,visibility:getComputedStyle(e).visibility,opacity:getComputedStyle(e).opacity},ancestors:(()=>{const a=[];for(let n=e;n&&a.length<8;n=n.parentElement)a.push({tag:n.tagName,id:n.id,className:n.className,pointer:getComputedStyle(n).pointerEvents,visibility:getComputedStyle(n).visibility,opacity:getComputedStyle(n).opacity});return a})(),hit:hit&&{tag:hit.tagName,id:hit.id,className:hit.className},stack:document.elementsFromPoint(x,y).slice(0,8).map(n=>({tag:n.tagName,id:n.id,className:n.className,position:getComputedStyle(n).position,z:getComputedStyle(n).zIndex,pointer:getComputedStyle(n).pointerEvents}))}));
    return{x,y,tag:e.tagName,text:e.textContent?.trim(),disabled:e.disabled};`);
  await browser.click(point.x, point.y);
  return point;
}
async function waitFor(expression, label, timeoutMs = 15000) {
  assert(await browser.waitFor(expression, { timeoutMs }), label);
}
async function setViewport(width, height) {
  await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(100); await frames(2);
}
async function chooseLand(exclude = []) {
  return page(`const k=window.inkbox,w=k.world,r=Math.max(2,Math.ceil(k.brushRadius)),b=(await import('./src/inkbox/core/mapAccess.js')).accessBounds(w);
    let best=null;
    for(let y=b.y0+r+1;y<=b.y1-r-1;y+=2)for(let x=b.x0+r+1;x<=b.x1-r-1;x+=2){
      if(${JSON.stringify(exclude)}.some(p=>Math.hypot(p.x-x,p.y-y)<24))continue;
      let veg=0,n=0,wet=0,damaged=0;
      for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dy*dy<=r*r){const i=(y+dy)*w.w+x+dx;veg+=w.veg[i];wet+=w.water[i];damaged+=w.over[i]===2||w.over[i]===3?1:0;n++;}
      const score=veg/n-wet/n*2-damaged/n*2;
      if(!best||score>best.score)best={x,y,score,meanVeg:veg/n,meanWater:wet/n,damaged,n,r};
    }
    if(!best||best.meanVeg<.22||best.meanWater>.01)throw Error('No accessible live vegetation land found: '+JSON.stringify(best));
    return best;`);
}
async function projectWorld(x, y, renderer = 'canvas') {
  return page(`const k=window.inkbox,x=${x},y=${y},canvas=${renderer === '3d' ? 'k.render3d.canvas' : 'k.canvas'},rect=canvas.getBoundingClientRect();
    let sx,sy,hit;
    if(${JSON.stringify(renderer)}==='canvas'){
      const i=y*k.world.w+x,[px,py]=k.camera.tileScreen(x,y,k.world.height[i]);sx=rect.left+px;sy=rect.top+py;
      hit={x:k.camera.pick(px,py,k.world).x,y:k.camera.pick(px,py,k.world).y,plane:'mortal'};
    }else{
      const r=k.render3d.renderer,stage=r.stages.get('mortal'),THREE=await import('three');
      r.cameraRig.camera.updateMatrixWorld();
      const p=r.coordinates.worldToRender(x,y,stage.elevation.at(x,y));
      const v=new THREE.Vector3(p.x,p.y,p.z).project(r.cameraRig.camera);
      sx=rect.left+(v.x+1)*rect.width/2;sy=rect.top+(1-v.y)*rect.height/2;
      const picked=r.pickPlane(sx-rect.left,sy-rect.top,'mortal');
      hit=picked?{x:picked.x,y:picked.y,plane:picked.plane,kind:picked.kind,world:picked.world}:null;
    }
    return{x:sx,y:sy,rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},hit,world:{x,y}};`);
}
async function clickWorld(x, y, renderer = 'canvas', settleMs = 200) {
  const point = await projectWorld(x, y, renderer);
  if (!point.hit || point.hit.plane !== 'mortal' || Math.hypot(point.hit.x - x, point.hit.y - y) > 1.5)
    throw Error(`Pointer projection did not hit intended mortal tile: ${JSON.stringify(point)}`);
  await browser.click(point.x, point.y, 'left', settleMs);
  return point;
}
async function dragWorld(points, renderer = 'canvas') {
  const screen = [];
  for (const [x, y] of points) screen.push(await projectWorld(x, y, renderer));
  await browser.mouseMove(screen[0].x, screen[0].y); await browser.mouseDown(screen[0].x, screen[0].y);
  for (const p of screen.slice(1)) await browser.mouseMove(p.x, p.y);
  const last = screen.at(-1); await browser.mouseUp(last.x, last.y); await sleep(250);
  return screen;
}
async function selectTool(tool) {
  const group = ({ burn: 'nature', inspect: 'view', viewUpper: 'view', viewNether: 'view' })[tool];
  if (group) {
    const visible = await page(`return !!document.querySelector('[data-tool="${tool}"]');`);
    if (!visible) await clickControl(`#inkGroups [data-group="${group}"]`);
  }
  await clickControl(`[data-tool="${tool}"]`);
  const selected = await page(`return document.querySelector('[data-tool="${tool}"]')?.classList.contains('on')||window.inkbox.toolId===${JSON.stringify(tool)};`);
  assert(selected, `Formal tool ${tool} did not become active`);
}
async function observeCanvas(x, y) {
  await selectTool('inspect');
  const pointer = await clickWorld(x, y, 'canvas');
  const actual = await page(`const vm=window.inkbox.environmentObservation.current(),s=window.inkbox.selected;return{vm,selected:s,inspect:document.querySelector('#inkInspect')?.textContent};`);
  assert(actual.vm.observation?.ok, `Canvas inspection did not select an environment: ${JSON.stringify(actual)}`);
  assert.equal(actual.vm.observation.plane, 'mortal');
  await closeInspector();
  return { pointer, vm: actual.vm };
}
async function doAction(type, idSelector = '#inkEnvironmentObserver') {
  const selector = `${idSelector} [data-environment-action="${type}"]`;
  return clickControl(selector);
}
async function closeInspector() {
  if (await page(`return !!document.querySelector('#inkInspect.on #inkInspectClose');`))
    await clickControl('#inkInspectClose');
}
async function scanLocal(runtime = 'environmentObservation') {
  return page(`const k=window.inkbox,r=k.${runtime},s=r.current(),b=s.observation;
    let max=0,ms=0;const t=performance.now();for(let i=0;i<30;i++){const o=r.select({plane:b.plane,x:b.location.x,y:b.location.y,radius:b.radius});if(!o.ok)throw Error('Local selection failed');max=Math.max(max,r.current().observation.metrics.cellsVisited);}
    ms=performance.now()-t;r.select({plane:b.plane,x:b.location.x,y:b.location.y,radius:b.radius});return{iterations:30,elapsedMs:ms,cellsVisited:max,radius:b.radius};`);
}
async function startServer() {
  if (process.env.INKBOX_URL) return;
  server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(PORT)],
    { cwd: ROOT, stdio: 'ignore', windowsHide: true });
  for (let n = 0; n < 100; n++) {
    if (server.exitCode !== null) throw new Error(`Server exited early: ${server.exitCode}`);
    try { if ((await fetch(APP_URL)).ok) return; } catch {}
    await sleep(150);
  }
  throw new Error(`Server not ready at ${APP_URL}`);
}

try {
  fs.mkdirSync(OUT, { recursive: true });
  await startServer();
  browser = await launch({ url: APP_URL, browser: findEdge(), width: 1440, height: 1000, gpu: process.env.INKBOX_GPU !== '0' });
  report.edge = browser.meta;
  await waitFor('return !!window.inkbox?.environmentObservation && !!window.inkbox?.world && !!document.querySelector("#inkEnvironmentObserver")', 'Formal G2.3 app did not initialize', 30000);
  await waitFor('return !!window.inkbox?.render3d?.active && !!window.inkbox.render3d.renderer?.stages?.get("mortal")', 'Three renderer did not initialize', 60000);

  await check('Application identity, initial rendering and desktop controls', async () => {
    const pageState = await page(`return{url:location.href,title:document.title,body:document.body.innerText.slice(0,1200),canvas:!!document.querySelector('#inkCanvas'),observer:!!document.querySelector('#inkEnvironmentObserver'),controls:[...document.querySelectorAll('#inkEnvironmentObserver button')].map(b=>({action:b.dataset.environmentAction,disabled:b.disabled,rect:(()=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()})),overlays:[...document.querySelectorAll('vite-error-overlay,nextjs-portal,#webpack-dev-server-client-overlay')].map(e=>e.tagName)};`);
    assert(pageState.url.includes('/inkbox.html')); assert(pageState.body.trim().length > 100); assert(pageState.canvas && pageState.observer); assert.deepEqual(pageState.overlays, []);
    assert(pageState.controls.some(row => row.action === 'find-fires' && row.rect.w > 0));
    report.pageIdentity = { title: pageState.title, url: pageState.url }; report.desktopInitial = await shot('desktop-initial');
    return { title: pageState.title, controls: pageState.controls, screenshot: report.desktopInitial };
  });

  // Canvas rails are intentionally inert while the Three renderer is active.
  // Begin Canvas-specific UI flows in the renderer that owns those controls.
  await clickControl('#inkRender3DTools [data-action="toggle"]');
  await waitFor('return window.inkbox.render3d.active===false', 'Canvas switch did not finish before pointer editing');

  await check('Canvas pointer ignites live vegetation and observer reports actual World facts', async () => {
    await page(`const k=window.inkbox;k.newWorld('small',2302301);k.setSpeed(0);return true;`); await frames(3);
    const land = await chooseLand(); report.canvasTarget = land;
    await selectTool('burn');
    const point = await clickWorld(land.x, land.y, 'canvas', 300);
    const afterBurn = await page(`const k=window.inkbox,w=k.world,{x,y}= ${JSON.stringify({ x: land.x, y: land.y })},r=k.brushRadius;
      let fire=0,scorched=0,veg=0,n=0;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const xx=x+dx,yy=y+dy;if(!w.inside(xx,yy))continue;const i=w.idx(xx,yy);if(w.fire[i]>.01)fire++;if(w.over[i]===2)scorched++;veg+=w.veg[i];n++;}
      return{fire,scorched,vegetationMean:veg/n,day:w.day,dirty:k.qol.isDirty(),renderer:k.render3d.active,pointer:${JSON.stringify(point)}};`);
    assert(afterBurn.fire > 0 && afterBurn.scorched > 0); assert(afterBurn.dirty, 'formal burn did not mark the World dirty');
    const observed = await observeCanvas(land.x, land.y);
    assert(observed.vm.observation.environment.activeFireCells > 0); assert(observed.vm.observation.environment.scorchedCells > 0);
    assert.equal(observed.vm.observation.evidence.cause, 'unknown');
    report.canvasObservation = { location: observed.vm.observation.location, day: observed.vm.observation.day,
      environment: observed.vm.observation.environment, pointer: point };
    report.canvasBurnShot = await shot('canvas-real-burn');
    return { land, afterBurn, observation: report.canvasObservation, screenshot: report.canvasBurnShot };
  });

  await check('On-demand fire search and UI observation button focus a live fire', async () => {
    const before = await page(`const k=window.inkbox,camera=k.camera,old=camera.focusOn;window.__g23Focus=[];camera.focusOn=function(...args){window.__g23Focus.push(args);return old.apply(this,args);};return{contextId:k.environmentObservation.current().contextId};`);
    await doAction('find-fires');
    await waitFor('return (window.inkbox.environmentObservation.current().search?.items?.length||0)>0', 'Fire search did not find the just-created official fire');
    const search = await page(`return window.inkbox.environmentObservation.current().search;`);
    assert(search.items.some(item => item.location.x >= 0 && Number.isFinite(item.intensity) && item.intensity > .01));
    await clickControl('#inkEnvironmentObserver [data-environment-action="observe-fire"]');
    const focused = await page(`const k=window.inkbox,vm=k.environmentObservation.current();return{vm,focus:window.__g23Focus,transition:k.camera.transition};`);
    assert(focused.vm.observation?.environment.activeFireCells > 0); assert(focused.focus.length > 0);
    const target = search.items[0].location; assert.equal(focused.focus.at(-1)[0], target.x); assert.equal(focused.focus.at(-1)[1], target.y);
    await page(`const k=window.inkbox;window.__g23FocusRestore=k.camera.focusOn;return true;`);
    report.search = { count: search.items.length, truncated: search.truncated, metrics: search.metrics, first: search.items[0] };
    return { contextId: before.contextId, search: report.search, focus: focused.focus.at(-1), observed: focused.vm.observation.location };
  });

  await check('Upper and Nether Canvas windows expose their own plane and mask mortal fire', async () => {
    const target = report.canvasTarget, span = 8;
    for (const [tool, plane] of [['viewUpper', 'upper'], ['viewNether', 'nether']]) {
      await selectTool(tool);
      await dragWorld([[target.x-span,target.y-span],[target.x+span,target.y-span],[target.x+span,target.y+span],[target.x-span,target.y+span],[target.x-span,target.y-span]]);
      const opened = await page(`return window.inkbox.getRealmViewState();`);
      assert(opened.open && opened.targetPlane === plane, `${plane} view did not open: ${JSON.stringify(opened)}`);
      const center = await projectWorld(target.x, target.y, 'canvas'); await browser.click(center.x, center.y); await frames(2);
      const vm = await page(`const k=window.inkbox;return k.environmentObservation.current();`);
      assert.equal(vm.observation?.plane, plane); assert.equal(vm.observation?.environment.fireSupported, false);
      assert(vm.observation.states.includes('unknown'));
      await waitFor(`const v=window.inkbox.environmentObservation.current(),b=document.querySelector('#inkEnvironmentObserver [data-environment-action="find-fires"]');return !!b&&b.dataset.environmentContext===v.contextId`, `${plane} observer action context did not settle`);
      await doAction('find-fires');
      await waitFor('return window.inkbox.environmentObservation.current().search!==null', `${plane} fire search did not publish a result`);
      const search = await page(`const k=window.inkbox,r=k.environmentObservation.current().search,v=k.getRealmViewState();return{items:r.items,truncated:r.truncated,metrics:r.metrics,
        hiddenLeak:r.items.some(item=>v.region.contains(item.location.x+.5,item.location.y+.5))};`);
      assert.equal(search.hiddenLeak, false, `${plane} window leaked an obscured mortal fire`);
      report[`${plane}Window`] = { location: vm.observation.location, environment: vm.observation.environment,
        visibleSearchCount: search.items.length, hiddenBurnExcluded: true };
      await closeInspector();
      await selectTool('inspect');
    }
    return { upper: report.upperWindow, nether: report.netherWindow };
  });

  await check('Session baseline, real advanceDays extinction and ecology regrowth update the same observation', async () => {
    // Close any realm aperture and make an actual Canvas inspection of the burned region.
    await selectTool('inspect'); await clickWorld(report.canvasTarget.x, report.canvasTarget.y, 'canvas'); await frames(2); await closeInspector();
    const vm0 = await page(`return window.inkbox.environmentObservation.current();`);
    assert.equal(vm0.observation.plane, 'mortal'); assert(vm0.observation.environment.activeFireCells > 0);
    await doAction('record-baseline');
    const baseline = await page(`return window.inkbox.environmentObservation.current();`);
    assert.equal(baseline.baselineDay, baseline.observation.day);
    // Keep the game's official advanceWorld path and RNG; first drain fire in .8 day steps,
    // then advance 5-day ecology beats so the existing vegetation recovery can run.
    const simulation = await page(`const k=window.inkbox;let fire=[],days=0;
      for(let i=0;i<150;i++){k.advanceDays(.8);days+=.8;k.environmentObservation.refresh();const o=k.environmentObservation.current().observation;fire.push(o.environment.activeFireCells);if(o.environment.activeFireCells===0)break;}
      const afterFire=k.environmentObservation.current().observation;
      for(let i=0;i<30;i++){k.advanceDays(5);days+=5;k.environmentObservation.refresh();}
      const final=k.environmentObservation.current();return{days,fire,afterFire,final,worldDay:k.world.day,seed:k.world.seed,fireTotal:k.world.fire.reduce((a,v)=>a+(v>.01),0)};`);
    assert.equal(simulation.afterFire.environment.activeFireCells, 0, 'formal fire cycle did not extinguish the bounded event');
    assert(simulation.days >= 5); assert(simulation.final.comparison?.ok);
    assert.equal(simulation.final.baselineDay, baseline.baselineDay);
    assert(simulation.final.observation.environment.vegetationMean > simulation.afterFire.environment.vegetationMean
      || simulation.final.observation.environment.scorchedCells < simulation.afterFire.environment.scorchedCells
      || simulation.final.observation.environment.ashCells > simulation.afterFire.environment.ashCells,
      'No current vegetation or aftermath change followed formal progression');
    report.simulation = { days: simulation.days, fireSamples: simulation.fire, afterFire: simulation.afterFire.environment,
      final: simulation.final.observation.environment, comparison: simulation.final.comparison };
    report.canvasRecoveryShot = await shot('canvas-aftermath-recovery');
    return { days: simulation.days, fireSamples: simulation.fire.length, afterFire: report.simulation.afterFire,
      final: report.simulation.final, comparison: report.simulation.comparison, screenshot: report.canvasRecoveryShot };
  });

  await check('Renderer switch preserves this World observation and bounded refresh cost', async () => {
    const before = await page(`const k=window.inkbox;window.__g23Runtime=k.environmentObservation;window.__g23ObservedWorld=k.world;return{observation:k.environmentObservation.current().observation};`);
    await clickControl('#inkRender3DTools [data-action="toggle"]');
    await waitFor('return window.inkbox.render3d.active===true', 'Three switch did not finish');
    const after = await page(`const k=window.inkbox;return{sameRuntime:k.environmentObservation===window.__g23Runtime,sameWorld:k.world===window.__g23ObservedWorld,observation:k.environmentObservation.current().observation};`);
    assert(after.sameRuntime && after.sameWorld);
    assert.deepEqual(after.observation.environment, before.observation.environment);
    const perf = await scanLocal(); assert(perf.cellsVisited <= 289); report.localRefresh = perf;
    await clickControl('#inkRender3DTools [data-action="toggle"]');
    await waitFor('return window.inkbox.render3d.active===false', 'Canvas return switch did not finish');
    return { sameRuntime: true, sameWorld: true, location: after.observation.location, localRefresh: perf };
  });

  await check('3D burn option and terrain pick alter the same live World; inspection and persistent fire tint follow', async () => {
    await clickControl('#inkRender3DTools [data-action="toggle"]');
    await waitFor('return window.inkbox.render3d.active===true', 'Three switch did not finish');
    const land = await chooseLand([report.canvasTarget]);
    const point = await projectWorld(land.x, land.y, '3d');
    assert(point.hit && point.hit.plane === 'mortal', `No authoritative 3D terrain pick: ${JSON.stringify(point)}`);
    const hit = point.hit;
    const before = await page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get('mortal'),i=${hit.y}*k.world.w+${hit.x},a=s.terrain.geometry.attributes.color.array;window.__g23ThreeWorld=k.world;
      return{fire:k.world.fire[i],veg:k.world.veg[i],over:k.world.over[i],color:[a[i*3],a[i*3+1],a[i*3+2]],info:r.gpu.info.memory};`);
    // Exercise the official 3D tool select and canvas pointerdown/pointerup path.
    await page(`const s=document.querySelector('#inkRender3DTools select[aria-label="沙盘工具"]');s.value='burn';s.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
    await browser.click(point.x, point.y, 'left', 300); await frames(6);
    const after = await page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get('mortal'),i=${hit.y}*k.world.w+${hit.x},a=s.terrain.geometry.attributes.color.array;
      return{sameWorld:k.world===window.__g23ThreeWorld,fire:k.world.fire[i],veg:k.world.veg[i],over:k.world.over[i],color:[a[i*3],a[i*3+1],a[i*3+2]],selected:s.world===k.world};`);
    assert(after.selected && after.fire > .01 && after.over === 2); assert.notDeepEqual(after.color, before.color, '3D terrain vertex tint did not update after fire');
    const sample = await page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get('mortal'),i=${hit.y}*k.world.w+${hit.x},a=s.terrain.geometry.attributes.color.array;return{color:[a[i*3],a[i*3+1],a[i*3+2]],fire:k.world.fire[i],lod:r.getLODStats(),memory:r.gpu.info.memory};`);
    assert(sample.fire > .01); assert.notDeepEqual(sample.color, before.color, 'fire tint did not persist after another Stage update');
    await page(`const s=document.querySelector('#inkRender3DTools select[aria-label="沙盘工具"]');s.value='inspect';s.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
    await browser.click(point.x, point.y, 'left', 250); await frames(2);
    const observed = await page(`const k=window.inkbox;return{vm:k.environmentObservation.current(),pick:k.render3d.renderer.selectedCell,inspect:document.querySelector('#inkInspect')?.textContent};`);
    assert(observed.vm.observation?.ok && observed.vm.observation.plane === 'mortal');
    assert(observed.vm.observation.environment.activeFireCells > 0);
    report.three = { location: observed.vm.observation.location, terrainPick: hit, before, after, settled: sample, memory: sample.memory };
    await closeInspector();
    report.threeBurnShot = await shot('three-real-burn');
    return { location: observed.vm.observation.location, observation: observed.vm.observation.environment,
      before, after, settledTint: sample.color, lod: sample.lod, memory: sample.memory, screenshot: report.threeBurnShot };
  });

  await check('Official browser save/load restores environmental facts and invalidates stale baseline actions', async () => {
    await clickControl('#inkBtnSave');
    await waitFor('return !window.inkbox.qol.isDirty()', 'Official Save did not persist the changed World');
    const saved = await page(`const k=window.inkbox,vm=k.environmentObservation.current(),o=vm.observation,{serializeWorld}=await import('./src/inkbox/io/save.js');
      const payload=serializeWorld(k.world),i=o.location.y*k.world.w+o.location.x;window.__g23SavedWorld=k.world;window.__g23SavedContext=vm.contextId;window.__g23SavedId=vm.observationId;
      return{seed:k.world.seed,day:k.world.day,location:o.location,fire:k.world.fire[i],veg:k.world.veg[i],over:k.world.over[i],savedFacts:{fire:o.environment.activeFireCells,scorched:o.environment.scorchedCells,ash:o.environment.ashCells,veg:o.environment.vegetationMean},keys:Object.keys(payload)};`);
    assert(saved.fire > .01 && saved.over === 2);
    // Formal host world replacement resets the session snapshot; then use the real Load UI.
    await page(`const k=window.inkbox;k.newWorld('small',2302302);window.__g23PreLoadWorld=k.world;return true;`); await frames(3);
    const stale = await page(`const k=window.inkbox;return{before:k.environmentObservation.current(),old:k.environmentObservation.handleAction({type:'read-area',contextId:window.__g23SavedContext,observationId:window.__g23SavedId})};`);
    assert.equal(stale.old.ok, false); assert.equal(stale.old.reason, 'stale-context');
    await clickControl('#inkBtnLoad');
    const confirm = await page(`const e=document.querySelector('#inkConfirm');return!!e&&!e.hidden;`);
    if (confirm) await clickControl('#inkConfirmOk');
    await waitFor('return window.inkbox.world!==window.__g23PreLoadWorld&&window.inkbox.world.seed===2302301', 'Official Load did not reconstruct the saved World');
    const loaded = await page(`const k=window.inkbox,o=k.environmentObservation.current().observation,i=${saved.location.y}*k.world.w+${saved.location.x};return{seed:k.world.seed,day:k.world.day,fire:k.world.fire[i],veg:k.world.veg[i],over:k.world.over[i],vm:k.environmentObservation.current(),differentEpoch:k.environmentObservation.current().contextId!==window.__g23SavedContext};`);
    assert.equal(loaded.seed, saved.seed); assert.equal(loaded.over, saved.over); assert(Math.abs(loaded.fire - saved.fire) < .02);
    assert(Math.abs(loaded.veg - saved.veg) < .005); assert(loaded.differentEpoch); assert.equal(loaded.vm.baselineDay, null);
    assert.equal(loaded.vm.observation, null, 'Loaded world must require a fresh inspection');
    assert(loaded.vm.message.includes('未作为长期史料存档'), `Load-history notice was lost: ${JSON.stringify(loaded.vm.message)}`);
    report.saveLoad = { saved, loaded, confirmationShown: confirm };
    return report.saveLoad;
  });

  await check('Progressive-map UI rejects inaccessible coordinates and narrow viewport has no horizontal clipping', async () => {
    // Use actual world-creation controls. The seed and checkbox feed the same production createSandboxWorld path.
    const checkbox = await page(`return{checked:document.querySelector('#inkProgressive').checked,seed:document.querySelector('#inkSeedInput').value};`);
    if (!checkbox.checked) await clickControl('#inkProgressive');
    await page(`const e=document.querySelector('#inkSeedInput');e.value='2302303';e.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
    await clickControl('#inkBtnRegen');
    const confirm = await page(`const e=document.querySelector('#inkConfirm');return!!e&&!e.hidden;`);
    if (confirm) await clickControl('#inkConfirmOk');
    await waitFor('return !!window.inkbox.world?.mapProgress && window.inkbox.world.seed===2302303', 'Progressive new-world setup did not complete');
    const access = await page(`const k=window.inkbox,r=k.environmentObservation;const locked=r.select({plane:'mortal',x:0,y:0,radius:3});const b=(await import('./src/inkbox/core/mapAccess.js')).accessBounds(k.world);return{locked,canAccess:(await import('./src/inkbox/core/mapAccess.js')).canAccess(k.world,0,0),bounds:b,stage:k.world.mapProgress.stage,vm:r.current()};`);
    assert.equal(access.canAccess, false); assert.equal(access.locked.ok, false); assert.equal(access.locked.reason, 'center-inaccessible');
    await setViewport(960, 800);
    const layout = await page(`const root=document.querySelector('#inkEnvironmentObserver'),r=root.getBoundingClientRect();return{innerWidth,scrollWidth:document.documentElement.scrollWidth,root:{x:r.x,y:r.y,width:r.width,right:r.right},buttons:[...root.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return{a:b.dataset.environmentAction,x:r.x,right:r.right,width:r.width,visible:r.width>0&&r.height>0}})};`);
    assert(layout.scrollWidth <= 960, `Horizontal page overflow at narrow viewport: ${JSON.stringify(layout)}`);
    assert(layout.buttons.filter(b => b.visible).every(b => b.right <= 960 && b.width > 0));
    report.narrowLayout = layout; report.narrowShot = await shot('narrow-viewport'); await setViewport(1440, 1000);
    return { access: { bounds: access.bounds, stage: access.stage, deniedReason: access.locked.reason }, layout, screenshot: report.narrowShot };
  });

  await check('Maximum Canvas brush radius 32 ignites a real bounded World region', async () => {
    // Return through the official creation UI so the brush gets tested on a full mortal map.
    const progressive = await page(`return document.querySelector('#inkProgressive').checked;`);
    if (progressive) await clickControl('#inkProgressive');
    await page(`const e=document.querySelector('#inkSeedInput');e.value='2302304';e.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
    await clickControl('#inkBtnRegen');
    const confirm = await page(`const e=document.querySelector('#inkConfirm');return!!e&&!e.hidden;`);
    if (confirm) await clickControl('#inkConfirmOk');
    await waitFor('return !window.inkbox.world?.mapProgress&&window.inkbox.world.seed===2302304', 'Full-map browser setup did not complete');
    if (await page(`return window.inkbox.render3d.active;`)) {
      await clickControl('#inkRender3DTools [data-action="toggle"]');
      await waitFor('return window.inkbox.render3d.active===false', 'Canvas switch did not finish before maximum-brush edit');
    }
    const radius = await page(`const e=document.querySelector('#inkBrushRange');e.value=e.max;e.dispatchEvent(new Event('input',{bubbles:true}));return{value:e.value,radius:window.inkbox.brushRadius};`);
    assert.equal(radius.radius, 32, `Maximum slider did not select radius 32: ${JSON.stringify(radius)}`);
    const land = await chooseLand(); report.maxBrushTarget = land;
    await selectTool('burn');
    const pointer = await clickWorld(land.x, land.y, 'canvas', 350);
    const result = await page(`const k=window.inkbox,w=k.world,{x,y}=${JSON.stringify({x:land.x,y:land.y})},r=k.brushRadius;let fire=0,scorched=0,visited=0;
      for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(dx*dx+dy*dy>r*r)continue;const xx=x+dx,yy=y+dy;if(!w.inside(xx,yy))continue;visited++;const i=w.idx(xx,yy);if(w.fire[i]>.01)fire++;if(w.over[i]===2)scorched++;}
      return{radius:r,fire,scorched,visited,dirty:k.qol.isDirty(),pointer:${JSON.stringify(pointer)}};`);
    assert.equal(result.radius, 32); assert(result.fire > 0 && result.scorched > 0); assert(result.visited <= (2*32+1)**2);
    report.maxBrush = result; report.maxBrushShot = await shot('canvas-max-brush-32');
    return { ...result, target: land, screenshot: report.maxBrushShot };
  });

  const finalHealth = await page(`return{runtime:window.inkbox.environmentObservation.current(),page:{title:document.title,url:location.href},errors:[]};`);
  report.runtimeErrors = browser.errors();
  report.consoleErrors = browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
    .map(e => e.params.args.map(x => x.value || x.description || '').join(' '));
  report.pageHealth = { title: finalHealth.page.title, url: finalHealth.page.url,
    meaningfulBody: (await page('return document.body.innerText.trim().length')) > 100,
    frameworkOverlay: await page('return !!document.querySelector("vite-error-overlay,nextjs-portal,#webpack-dev-server-client-overlay")') };
  assert.equal(report.runtimeErrors.length, 0, JSON.stringify(report.runtimeErrors));
  assert.equal(report.consoleErrors.length, 0, JSON.stringify(report.consoleErrors));
  assert(report.pageHealth.meaningfulBody && !report.pageHealth.frameworkOverlay);
  report.pass = true;
} catch (error) {
  report.error = String(error.stack || error); console.error(error);
  if (browser) try { report.failureShot = await shot('failure'); } catch (shotError) { report.screenshotError = String(shotError); }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) { server.kill(); for (let n = 0; n < 50 && server.exitCode === null && server.signalCode === null; n++) await sleep(100); }
  report.cleanup = { edgeExited: !browser || browser.child.exitCode !== null || browser.child.signalCode !== null,
    profileRemoved: !browser || !fs.existsSync(browser.userDataDir), serverExited: !server || server.exitCode !== null || server.signalCode !== null };
  if (Object.values(report.cleanup).some(value => !value)) { report.pass = false; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'g23-browser.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(`G23 browser: ${report.checks.length} checks; pass=${report.pass}`);
