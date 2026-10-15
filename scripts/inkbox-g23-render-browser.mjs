// Supplemental G2.3 hardware render check. Run after the main formal browser suite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.INKBOX_PORT || 4220);
const BASE = process.env.INKBOX_URL || `http://127.0.0.1:${PORT}`;
const APP_URL = new URL('inkbox.html?renderer=3d', BASE.endsWith('/') ? BASE : BASE + '/').href;
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/local/g23/render-browser'));
const report = { startedAt: new Date().toISOString(), pass: false, url: APP_URL, viewport: '1440x1000',
  browser: 'isolated Microsoft Edge/CDP', browserPlugin: 'absent',
  fallbackReason: 'The repository CDP harness is the user-specified hardware acceptance path; Browser plugin is unavailable.',
  sourceFlow: 'official 3D burn pointer -> World -> observer -> terrain pigment GPU -> formal progression -> realm windows',
  performanceClaim: false, checks: [], screenshots: [] };
let server, browser;
const page = (body, timeoutMs = 60000) => browser.js(`return (async()=>{${body}})()`, { timeoutMs });
const frames = n => page(`for(let i=0;i<${n};i++)await new Promise(requestAnimationFrame);return true;`, 60000);
async function check(name, fn) { const evidence = await fn(); report.checks.push({ name, pass: true, evidence }); console.log(`PASS ${name}`); }
async function waitFor(expr, label, timeoutMs = 30000) { assert(await browser.waitFor(expr, { timeoutMs }), label); }
async function click(selector) {
  const p = await page(`const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing control: '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',behavior:'instant'});await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};`);
  assert(p.w > 0 && p.h > 0); await browser.click(p.x, p.y); return p;
}
async function shot(name) { const file = await browser.screenshot(path.join(OUT, `${name}.png`), { timeoutMs: 30000 }); report.screenshots.push(file); return file; }
async function tool(name) { await page(`const e=document.querySelector('#inkRender3DTools select[aria-label="沙盘工具"]');e.value=${JSON.stringify(name)};e.dispatchEvent(new Event('change',{bubbles:true}));return true;`); }
async function point(x, y) {
  return page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get('mortal'),T=await import('three'),rect=k.render3d.canvas.getBoundingClientRect();r.cameraRig.camera.updateMatrixWorld();const p=r.coordinates.worldToRender(${x},${y},s.elevation.at(${x},${y})),v=new T.Vector3(p.x,p.y,p.z).project(r.cameraRig.camera),sx=rect.left+(v.x+1)*rect.width/2,sy=rect.top+(1-v.y)*rect.height/2,h=r.pickPlane(sx-rect.left,sy-rect.top,'mortal');return{x:sx,y:sy,hit:h?{x:h.x,y:h.y,plane:h.plane,kind:h.kind}:null};`);
}
async function visiblePlanePoint(x, y, plane) {
  return page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get(${JSON.stringify(plane)}),T=await import('three'),rect=k.render3d.canvas.getBoundingClientRect();r.cameraRig.camera.updateMatrixWorld();for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){const xx=${x}+dx,yy=${y}+dy;if(!s.world.inside(xx,yy))continue;const p=r.coordinates.worldToRender(xx,yy,s.elevation.at(xx,yy)),v=new T.Vector3(p.x,p.y,p.z).project(r.cameraRig.camera),sx=(v.x+1)*rect.width/2,sy=(1-v.y)*rect.height/2;if(sx<0||sy<0||sx>rect.width||sy>rect.height)continue;const hit=r.pick(sx,sy);if(hit?.plane===${JSON.stringify(plane)})return{x:sx+rect.left,y:sy+rect.top,hit:{plane:hit.plane,x:hit.x,y:hit.y,kind:hit.kind}};}throw Error('No visible '+${JSON.stringify(plane)}+' pick around realm window center');`);
}
async function selectLand() {
  return page(`const k=window.inkbox,w=k.world,r=window.inkbox.render3d.renderer,b=(await import('./src/inkbox/core/mapAccess.js')).accessBounds(w),radius=Math.max(3,k.render3d.radius),candidates=[];for(let y=b.y0+radius+4;y<b.y1-radius-4;y+=3)for(let x=b.x0+radius+4;x<b.x1-radius-4;x+=3){let veg=0,water=0,n=0;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)if(dx*dx+dy*dy<=radius*radius){const i=(y+dy)*w.w+x+dx;veg+=w.veg[i];water+=w.water[i];n++;}if(veg/n>.65&&water/n<.002)candidates.push({x,y,veg:veg/n});}candidates.sort((a,b)=>Math.hypot(a.x-w.w/2,a.y-w.h/2)-Math.hypot(b.x-w.w/2,b.y-w.h/2));for(const c of candidates.slice(0,80)){const T=await import('three'),s=r.stages.get('mortal'),rect=k.render3d.canvas.getBoundingClientRect(),p=r.coordinates.worldToRender(c.x,c.y,s.elevation.at(c.x,c.y)),v=new T.Vector3(p.x,p.y,p.z).project(r.cameraRig.camera),sx=(v.x+1)*rect.width/2,sy=(1-v.y)*rect.height/2;if(sx<20||sy<20||sx>rect.width-20||sy>rect.height-20)continue;const hit=r.pickPlane(sx,sy,'mortal');if(hit?.plane==='mortal'&&Math.hypot(hit.x-c.x,hit.y-c.y)<2)return{...c,hit:{x:hit.x,y:hit.y},screen:{x:sx+rect.left,y:sy+rect.top}};}throw Error('No screen-pickable accessible vegetated land');`);
}
async function sample(x, y) {
  return page(`const k=window.inkbox,w=k.world,r=k.render3d.renderer,s=r.stages.get('mortal'),i=${y}*w.w+${x},a=s.terrain.geometry.attributes.color.array,t=s.terrain.artData,obs=k.environmentObservation.current().observation,gl=r.gpu.getContext();return{day:w.day,fire:w.fire[i],veg:w.veg[i],over:w.over[i],type:w.type[i],canonical:(await import('./src/inkbox/world/terrain.js')).classify(w,${x},${y},i),color:[a[i*3],a[i*3+1],a[i*3+2]],fireAlpha:t?.types[i*4+3]??null,material:s.terrain.mesh.material.name,artProfile:r.art.profile.name,lodEnabled:r.lodEnabled,zoom:r.cameraRig.camera.zoom,drawRange:s.terrain.geometry.drawRange.count,observer:obs?{plane:obs.plane,fire:obs.environment.activeFireCells,scorched:obs.environment.scorchedCells,ash:obs.environment.ashCells}:null,gpu:{geometry:r.gpu.info.memory.geometries,texture:r.gpu.info.memory.textures,program:r.gpu.info.programs?.length??0},glError:gl.getError()};`);
}
async function startServer() {
  if (process.env.INKBOX_URL) return;
  server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore', windowsHide: true });
  for (let n = 0; n < 100; n++) { if (server.exitCode !== null) throw Error(`Server exited: ${server.exitCode}`); try { if ((await fetch(APP_URL)).ok) return; } catch {} await sleep(150); }
  throw Error(`Server unavailable: ${APP_URL}`);
}

try {
  fs.mkdirSync(OUT, { recursive: true }); await startServer();
  browser = await launch({ url: APP_URL, browser: findEdge(), width: 1440, height: 1000, gpu: process.env.INKBOX_GPU !== '0' });
  report.edge = browser.meta;
  await waitFor('return !!window.inkbox?.render3d?.active && !!window.inkbox?.environmentObservation', 'Official 3D app failed to load', 60000);
  report.page = await page(`return{url:location.href,title:document.title,content:document.body.innerText.trim().length,overlay:!!document.querySelector('vite-error-overlay,nextjs-portal,#webpack-dev-server-client-overlay')};`);
  assert(report.page.url.includes('/inkbox.html') && report.page.content > 100 && !report.page.overlay);
  await page(`window.inkbox.newWorld('small',2302301);window.inkbox.setSpeed(0);return true;`);
  await waitFor('return window.inkbox.render3d.renderer.world===window.inkbox.world', '3D did not adopt official World');
  await page(`const r=window.inkbox.render3d.renderer;await Promise.all([r.characterLoadPromise,r.environmentLoadPromise,r.art.comparisonReady]);return{art:r.art.profile.name,lod:r.lodEnabled};`, 90000);
  await frames(120); // Warm all async assets/programs before resource baseline.

  await check('Official 3D burn uses current World and refreshes active fire pigment', async () => {
    const land = await selectLand(); report.target = land;
    const { x, y } = land.hit;
    const before = await sample(x, y);
    assert.equal(before.fire, 0); assert.equal(before.artProfile, 'realm-style-v1'); assert(before.lodEnabled);
    await tool('burn'); await browser.click(land.screen.x, land.screen.y, 'left', 300); await frames(8);
    await tool('inspect'); const p = await point(x, y); assert(p.hit?.plane === 'mortal'); await browser.click(p.x, p.y); await frames(4);
    const active = await sample(x, y);
    assert(active.fire > .02 && active.over === 2 && active.fireAlpha > 0);
    assert.notDeepEqual(active.color, before.color); assert.equal(active.type, active.canonical);
    assert.equal(active.observer?.plane, 'mortal'); assert(active.observer.fire > 0);
    assert.equal(active.glError, 0);
    if (await page(`return !!document.querySelector('#inkInspect.on #inkInspectClose');`)) await click('#inkInspectClose');
    report.fire = { before, active };
    return { target: land, before, active };
  });

  await check('Near and far actual GPU views retain fire with LOD enabled', async () => {
    const { x, y } = report.target.hit;
    await click('#inkRender3DTools [data-action="focus"]'); await frames(50);
    const center = await point(x, y);
    for (let i = 0; i < 10; i++) await browser.wheel(center.x, center.y, -120);
    await frames(30);
    const near = await sample(x, y); assert(near.zoom > report.fire.active.zoom && near.fireAlpha > 0 && near.lodEnabled && near.glError === 0);
    const nearShot = await shot('mortal-near-live-fire');
    await click('#inkRender3DTools [data-action="fit"]'); await frames(40);
    const far = await sample(x, y); assert(far.zoom < near.zoom && far.fireAlpha > 0 && far.lodEnabled && far.glError === 0);
    const farShot = await shot('mortal-far-live-fire');
    report.views = { near, far, nearShot, farShot };
    return report.views;
  });

  await check('Formal day advancement extinguishes fire and refreshes 3D terrain', async () => {
    const { x, y } = report.target.hit;
    const progress = await page(`const k=window.inkbox,w=k.world,{x,y}=${JSON.stringify({ x, y })};let steps=0;for(;steps<150;steps++){k.advanceDays(.8);if(w.fire[y*w.w+x]<=.01)break;}for(let n=0;n<30;n++)k.advanceDays(5);k.environmentObservation.refresh();return{steps,day:w.day,fire:w.fire[y*w.w+x],over:w.over[y*w.w+x],veg:w.veg[y*w.w+x]};`, 90000);
    assert(progress.fire <= .01); await frames(8);
    const after = await sample(x, y); assert.equal(after.fireAlpha, 0); assert.equal(after.type, after.canonical);
    assert(after.color.some((v, i) => Math.abs(v - report.fire.active.color[i]) > .01)); assert.equal(after.glError, 0);
    report.extinction = { progress, after }; return report.extinction;
  });

  await check('Existing real-time overlay decay cadence updates canonical type and art texture', async () => {
    const { x, y } = report.target.hit;
    const start = await sample(x, y); assert([0, 2, 3].includes(start.over));
    await page(`window.inkbox.setSpeed(1);return true;`);
    let final = start, elapsedMs = 0;
    for (let n = 0; n < 8 && final.over === start.over; n++) { await sleep(2500); elapsedMs += 2500; final = await sample(x, y); }
    await page(`window.inkbox.setSpeed(0);return true;`); await frames(4);
    assert.notEqual(final.over, start.over, 'No real-time overlay transition within 20 seconds');
    assert.equal(final.type, final.canonical);
    const textureType = await page(`const k=window.inkbox,s=k.render3d.renderer.stages.get('mortal'),i=${y}*k.world.w+${x};return s.terrain.artData.types[i*4];`);
    assert.equal(textureType, final.type);
    report.decay = { elapsedMs, start, final, textureType }; return report.decay;
  });

  await check('Formal Three Upper and Nether windows clip mortal fire and keep child alpha empty', async () => {
    const { x, y } = report.target.hit;
    // Light another authentic event so the negative realm test is live.
    await tool('burn'); const p = await point(x, y); await browser.click(p.x, p.y); await frames(8);
    const live = await sample(x, y); assert(live.fire > .02);
    const results = [];
    for (const [mode, plane] of [['viewUpper', 'upper'], ['viewNether', 'nether']]) {
      await tool(mode);
      const corners = [[x-9,y-9],[x+9,y-9],[x+9,y+9],[x-9,y+9],[x-9,y-9]];
      const pts = []; for (const [xx, yy] of corners) pts.push(await point(xx, yy));
      assert(pts.every(q => q.hit?.plane === 'mortal'));
      // Keep CDP's pressed button through the native pointer route. The generic
      // mouseMove helper sends buttons:0, which cancels this canvas's capture.
      await browser.mouseMove(pts[0].x,pts[0].y); await browser.mouseDown(pts[0].x,pts[0].y);
      for (const q of pts.slice(1)) { await browser.cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:q.x,y:q.y,button:'left',buttons:1}); await sleep(30); }
      await browser.mouseUp(pts.at(-1).x,pts.at(-1).y);
      await frames(8);
      const state = await page(`const k=window.inkbox,r=k.render3d.renderer,v=k.getRealmViewState(),s=r.stages.get(${JSON.stringify(plane)}),i=${y}*k.world.w+${x},gl=r.gpu.getContext(),full=(k.world.w-1)*(k.world.h-1)*6;return{open:v.open,target:v.targetPlane,mask:r.realmPrototype.open,inside:v.region?.contains(${x}+.5,${y}+.5),mortalQuads:r.stages.get('mortal').terrain.geometry.drawRange.count,fullQuads:full,childQuads:s.terrain.geometry.drawRange.count,childAlpha:s.terrain.artData?.types[i*4+3]??0,observer:k.environmentObservation.current().observation?.plane??null,fire:k.world.fire[i],glError:gl.getError(),tool:k.toolId};`);
      assert(state.open && state.target === plane && state.mask && state.inside && state.childQuads > 0 && state.mortalQuads < state.fullQuads,
        `Realm window failed: ${JSON.stringify({ plane, state, pts })}`);
      assert.equal(state.childAlpha, 0); assert(state.fire > .02); assert.equal(state.glError, 0);
      results.push({ plane, ...state });
      const center = await visiblePlanePoint(x, y, plane);
      const beforeClick = await page(`const k=window.inkbox,r=k.render3d.renderer,rect=k.render3d.canvas.getBoundingClientRect(),sx=${center.x}-rect.left,sy=${center.y}-rect.top,m=r.pickPlane(sx,sy,'mortal'),v=r.pick(sx,sy);window.__g23RealmBefore={selection:k.selection,rifts:k.world.rifts.length};return{mortalHit:m?.plane??null,visibleHit:v?.plane??null};`);
      await browser.click(center.x, center.y); await frames(3);
      const observed = await page(`const k=window.inkbox,o=k.environmentObservation.current().observation;return{plane:o?.plane,fireSupported:o?.environment.fireSupported,sameRegion:k.selection===window.__g23RealmBefore.selection,riftsBefore:window.__g23RealmBefore.rifts,riftsAfter:k.world.rifts.length,realmDraw:!!k.render3d.realmDraw,viewOpen:k.getRealmViewState().open};`);
      assert.equal(observed?.plane, plane, `Three child click failed: ${JSON.stringify({ plane, center, beforeClick, observed })}`); assert.equal(observed.fireSupported, false);
      assert(observed.sameRegion && observed.riftsAfter === observed.riftsBefore);
      results.at(-1).observed = { ...observed, route: 'actual Three click on visible child terrain' };
    }
    report.realm = results; return results;
  });

  await check('Warm repeated RAF and world replacement release old terrain with no stale observer callback', async () => {
    await tool('inspect'); await page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get('mortal');window.__g23Old={world:k.world,context:k.environmentObservation.current().contextId,id:k.environmentObservation.current().observationId,disposed:0};s.terrain.geometry.addEventListener('dispose',()=>window.__g23Old.disposed++);return true;`);
    await frames(120);
    const before = await page(`const r=window.inkbox.render3d.renderer;return{memory:{...r.gpu.info.memory},program:r.gpu.info.programs?.length??0};`);
    await frames(120);
    const repeat = await page(`const r=window.inkbox.render3d.renderer;return{memory:{...r.gpu.info.memory},program:r.gpu.info.programs?.length??0,glError:r.gpu.getContext().getError()};`);
    assert.deepEqual(repeat.memory, before.memory); assert.equal(repeat.program, before.program); assert.equal(repeat.glError, 0);
    await page(`window.inkbox.newWorld('small',2302302);return true;`);
    await waitFor('return window.inkbox.render3d.renderer.world===window.inkbox.world', 'New World did not reach 3D');
    await page(`const r=window.inkbox.render3d.renderer;await Promise.all([r.characterLoadPromise,r.environmentLoadPromise,r.art.comparisonReady]);return true;`, 90000);
    await frames(120);
    const replacement = await page(`const k=window.inkbox,r=k.render3d.renderer,old=window.__g23Old,stale=k.environmentObservation.handleAction({type:'read-area',contextId:old.context,observationId:old.id});return{newWorld:k.world!==old.world,seed:k.world.seed,disposed:old.disposed,stale:{ok:stale.ok,reason:stale.reason},memory:{...r.gpu.info.memory},program:r.gpu.info.programs?.length??0,glError:r.gpu.getContext().getError()};`);
    assert(replacement.newWorld && replacement.disposed > 0); assert.equal(replacement.stale.ok, false); assert.equal(replacement.stale.reason, 'stale-context'); assert.equal(replacement.glError, 0);
    const cycles = [];
    for (let n = 0; n < 2; n++) {
      await page(`const k=window.inkbox,s=k.render3d.renderer.stages.get('mortal');window.__g23Cycle={world:k.world,disposed:0};s.terrain.geometry.addEventListener('dispose',()=>window.__g23Cycle.disposed++);k.newWorld('small',2302302);return true;`);
      await waitFor('return window.inkbox.render3d.renderer.world===window.inkbox.world', 'Repeated World did not reach 3D');
      await page(`const r=window.inkbox.render3d.renderer;await Promise.all([r.characterLoadPromise,r.environmentLoadPromise,r.art.comparisonReady]);return true;`, 90000);
      await frames(120);
      const cycle = await page(`const k=window.inkbox,r=k.render3d.renderer;return{replaced:k.world!==window.__g23Cycle.world,disposed:window.__g23Cycle.disposed,memory:{...r.gpu.info.memory},program:r.gpu.info.programs?.length??0,glError:r.gpu.getContext().getError()};`);
      assert(cycle.replaced && cycle.disposed > 0 && cycle.glError === 0);
      assert.deepEqual(cycle.memory, replacement.memory); assert.equal(cycle.program, replacement.program);
      cycles.push(cycle);
    }
    report.resources = { before, repeat, replacement, cycles }; return report.resources;
  });

  report.runtimeErrors = browser.errors();
  report.consoleErrors = browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error').map(e => e.params.args.map(a => a.value || a.description || '').join(' '));
  assert.deepEqual(report.runtimeErrors, []); assert.deepEqual(report.consoleErrors, []);
  report.pass = true;
} catch (error) {
  report.error = String(error.stack || error); process.exitCode = 1; console.error(error);
} finally {
  if (browser) await browser.close();
  if (server) { server.kill(); for (let n = 0; n < 50 && server.exitCode === null && server.signalCode === null; n++) await sleep(100); }
  report.cleanup = { edgeExited: !browser || browser.child.exitCode !== null || browser.child.signalCode !== null,
    profileRemoved: !browser || !fs.existsSync(browser.userDataDir), serverExited: !server || server.exitCode !== null || server.signalCode !== null };
  if (Object.values(report.cleanup).some(v => !v)) { report.pass = false; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'g23-render-browser.json'), JSON.stringify(report, null, 2) + '\n');
}
