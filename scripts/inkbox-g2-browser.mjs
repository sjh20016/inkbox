// Real Edge browser evidence for G2 combat presentation. Combat is created only by
// Life.spawn + normal advanceDays; this harness never calls attack or emits fake hits.
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';
import { beastCombatFixtureExpression, combatFixtureExpression, findCombatRoots } from './inkbox-g2-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.INKBOX_PORT || 4217);
const BASE = process.env.INKBOX_URL || `http://127.0.0.1:${PORT}`;
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/g2-local/browser'));
const APP = new URL('inkbox.html', BASE.endsWith('/') ? BASE : `${BASE}/`);
const roots = findCombatRoots();
const report = { startedAt: new Date().toISOString(), pass: false, browser: 'Microsoft Edge via repository-owned scripts/cdp.mjs',
  browserBackendReason: process.env.INKBOX_BROWSER_BACKEND_REASON || 'Repository Edge regression for the formal Canvas and Three product paths',
  sourceFlow: 'Life.spawn -> Life.stepEntity/attack -> advanceDays; no injected combat events',
  gpuMode:process.env.INKBOX_GPU==='0'?'functionalOnly (CI software D3D)':'hardwareRequired (local Edge GPU)',checks: [], screenshots: [],
  fixtureRoots: Object.fromEntries(Object.entries(roots).map(([style, item]) => [style, item.root.rootName])), errors: [] };
let server, browser;
const page = (expr, timeoutMs = 45000) => {
  const code=`return (async()=>{${expr}})()`;new Script(`(()=>{${code}})`);
  return browser.js(code,{timeoutMs});
};
const check = async (name, fn) => {
  report.phase = name;
  try { const evidence = await fn(); report.checks.push({ name, pass: true, evidence }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, pass: false, error: String(error.stack || error) }); console.error(`FAIL ${name}: ${error.message}`); }
  finally { if(browser){const held=await page('const held=!!window.__g2ReleaseFrame;window.__g2ReleaseFrame?.();return held');if(held)await awaitFrames(2);} }
};
async function startServer() {
  if (process.env.INKBOX_URL) return;
  server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(PORT)],
    { cwd: ROOT, stdio: 'ignore', windowsHide: true });
  const ready = new URL('inkbox.html', BASE.endsWith('/') ? BASE : `${BASE}/`);
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`server exited ${server.exitCode}`);
    try { if ((await fetch(ready)).ok) return; } catch {}
    await sleep(150);
  }
  throw new Error('Inkbox server did not become ready');
}
async function screenshot(name) {
  const file = await browser.screenshot(path.join(OUT, `${name}.png`), { timeoutMs: 30000 });
  report.screenshots.push(file); return file;
}
const HOLD_AFTER_PAINT = `
  if(window.__g2ReleaseFrame)throw Error('previous product frame hold still active');
  const originalFrame=k.frame;let painted=false,resolvePaint;
  const paintDone=new Promise(resolve=>{resolvePaint=resolve});
  k.frame=function(ts){
    if(!painted){painted=true;originalFrame.call(this,ts);resolvePaint();return}
    requestAnimationFrame(t=>this.frame(t));
  };
  window.__g2ReleaseFrame=()=>{k.frame=originalFrame;window.__g2ReleaseFrame=null};
  await paintDone;
`;
async function releaseFrames() {
  await page('window.__g2ReleaseFrame?.();return true');await awaitFrames(2);
}
async function captureFocusedStyle(fixture, style, renderer, stats) {
  const actorMap=new Map(fixture.actors.filter(e=>e.side===0).map(e=>[e.id,e.style]));
  const hit=stats.mortal.find(i=>i.style===style&&actorMap.get(i.subjectId)===style);
  assert(hit,`${renderer} ${style}: no sampled real hit from the qualified attacker`);
  assert([hit.x,hit.y,hit.fromX,hit.fromY].every(Number.isFinite),'missing true hit endpoints');
  // All styles photograph the same completed first-contact product frame.
  // Only camera and rendering change here; no event injection, TTL extension or simulation step.
  const captured=await page(`const k=window.inkbox,hit=${JSON.stringify(hit)},x=(hit.fromX+hit.x)/2,y=(hit.fromY+hit.y)/2;
    if(!window.__g2ReleaseFrame)throw Error('photograph requires the owned completed product frame');
    if(${JSON.stringify(renderer)}==='3d'){
      const r=k.render3d.renderer,s=r.stages.get('mortal'),rig=r.cameraRig;
      const elevation=(s.elevation.at(hit.fromX,hit.fromY)+s.elevation.at(hit.x,hit.y))/2+.17;
      const p=r.coordinates.worldToRender(x,y,elevation);
      rig.cancelFocus();rig.controls.target.set(p.x,p.y,p.z);
      rig.camera.position.set(p.x+135,p.y+195,p.z+180);rig.camera.lookAt(p.x,p.y,p.z);
      rig.camera.zoom=18;rig.camera.updateProjectionMatrix();rig.controls.update();
    }else{
      const i=k.world.idx(Math.floor(x),Math.floor(y)),h=k.world.height[i]||0;
      k.camera.focusOn(x,y-(k.camera.relief?h*k.camera.reliefScale:0),{zoom:26,duration:0});k.camera.update(.02);
    }
    k.render(k.lastTime);
    return {id:hit.subjectId,targetId:hit.targetId,x,y,from:[hit.fromX,hit.fromY],style:${JSON.stringify(style)},seed:k.world.seed,day:k.world.day,hit};`);
  const observed=await page(`const k=window.inkbox,id=${captured.id},style=${JSON.stringify(style)};
    const stage=k.render3d?.active?k.render3d.renderer.stages.get('mortal').fxProbe.stats.combat:k.stage.stats;
    const items=k.stage.snapshotPlane('mortal').items.filter(i=>i.kind==='combat'&&(i.subjectId===id||i.targetId===id));
    let ndc=null,batchCenterError=null,pixelDelta=0,glError=0;
    if(k.render3d?.active){const r=k.render3d.renderer,s=r.stages.get('mortal'),i=items.find(x=>x.data.style===style);
      if(i){const p=r.coordinates.worldToRender((i.data.fromX+i.x)/2,(i.data.fromY+i.y)/2,(s.elevation.at(i.data.fromX,i.data.fromY)+s.elevation.at(i.x,i.y))/2+.17),c=r.cameraRig.camera;
        c.updateMatrixWorld(true);const m=c.matrixWorldInverse.elements,q=c.projectionMatrix.elements;
        const vx=m[0]*p.x+m[4]*p.y+m[8]*p.z+m[12],vy=m[1]*p.x+m[5]*p.y+m[9]*p.z+m[13],vz=m[2]*p.x+m[6]*p.y+m[10]*p.z+m[14],vw=m[3]*p.x+m[7]*p.y+m[11]*p.z+m[15];
        const cx=q[0]*vx+q[4]*vy+q[8]*vz+q[12]*vw,cy=q[1]*vx+q[5]*vy+q[9]*vz+q[13]*vw,cw=q[3]*vx+q[7]*vy+q[11]*vz+q[15]*vw;ndc=[cx/cw,cy/cw];
        const batch=s.fxProbe.combat.batches[style],a=batch.mesh.instanceMatrix.array;
        batchCenterError=Infinity;
        for(let index=0;index<batch.mesh.count;index++){const offset=index*16+12;
          batchCenterError=Math.min(batchCenterError,Math.hypot(a[offset]-p.x,a[offset+1]-p.y,a[offset+2]-p.z));}
        const gl=r.gpu.getContext(),canvas=r.gpu.domElement,w=canvas.width,h=canvas.height,cxpx=Math.round((ndc[0]+1)*w/2),cypx=Math.round((1-ndc[1])*h/2),radius=80;
        const x0=Math.max(0,cxpx-radius),y0=Math.max(0,cypx-radius),rw=Math.min(w-x0,radius*2),rh=Math.min(h-y0,radius*2),buf=new Uint8Array(rw*rh*4),mesh=batch.mesh,visible=mesh.visible;
        try{mesh.visible=false;r.render();gl.readPixels(x0,h-y0-rh,rw,rh,gl.RGBA,gl.UNSIGNED_BYTE,buf);mesh.visible=visible;r.render();const on=new Uint8Array(rw*rh*4);gl.readPixels(x0,h-y0-rh,rw,rh,gl.RGBA,gl.UNSIGNED_BYTE,on);for(let n=0;n<buf.length;n+=4)if(buf[n]!==on[n]||buf[n+1]!==on[n+1]||buf[n+2]!==on[n+2])pixelDelta++;}
        finally{mesh.visible=visible;r.render();}
        glError=gl.getError();}
    }else{const canvas=k.canvas,dpr=canvas.width/canvas.getBoundingClientRect().width,i=items.find(x=>x.data.style===style),sx=k.camera.tileScreen((i.data.fromX+i.x)/2,(i.data.fromY+i.y)/2,k.world.height[k.world.idx(Math.floor((i.data.fromX+i.x)/2),Math.floor((i.data.fromY+i.y)/2))]||0),cx=Math.round(sx[0]*dpr),cy=Math.round(sx[1]*dpr),radius=80,x0=Math.max(0,cx-radius),y0=Math.max(0,cy-radius),rw=Math.min(canvas.width-x0,radius*2),rh=Math.min(canvas.height-y0,radius*2),ctx=canvas.getContext('2d'),buf=ctx.getImageData(x0,y0,rw,rh).data,original=k.stage.drawPlane,stageObj=k.stage;
      try{stageObj.drawPlane=function(plane,context,camera,world){const saved=this.fx.items;this.fx.items=saved.filter(item=>!(item.plane===plane&&item.kind==='combat'&&item.data.style===style));try{return original.call(this,plane,context,camera,world)}finally{this.fx.items=saved}};k.render(k.lastTime);const off=ctx.getImageData(x0,y0,rw,rh).data;stageObj.drawPlane=original;k.render(k.lastTime);const on=ctx.getImageData(x0,y0,rw,rh).data;for(let n=0;n<off.length;n+=4)if(off[n]!==on[n]||off[n+1]!==on[n+1]||off[n+2]!==on[n+2])pixelDelta++;}
      finally{stageObj.drawPlane=original;k.render(k.lastTime);}}
    return {items:items.map(i=>({subjectId:i.subjectId,targetId:i.targetId,style:i.data.style,ttl:i.ttl,age:i.age})),stage,ndc,batchCenterError,pixelDelta,glError,
      source:(await import('./src/inkbox/sim/presentation.js')).combatPresentationStats(k.world)};`);
    assert(observed.items.some(item=>item.style===style),`${renderer} ${style} close-up has no real visible combat item for hit ${JSON.stringify(captured.hit)}: ${JSON.stringify(observed)}`);
    if(renderer==='3d'){
      assert.equal(observed.glError,0,'WebGL pixel read failed');
      assert(observed.stage.styleCounts[style]>0,`3D ${style} instance batch empty: ${JSON.stringify(observed.stage)}`);
      assert(observed.ndc&&Math.abs(observed.ndc[0])<.3&&Math.abs(observed.ndc[1])<.3,`3D ${style} event is not centered in viewport: ${JSON.stringify(observed.ndc)}`);
      assert(observed.batchCenterError<.02,`3D ${style} batch instance does not match true hit endpoints: ${JSON.stringify(observed.batchCenterError)}`);
    }
    if(observed.pixelDelta<4)await screenshot(`${renderer}-combat-${style}-failure`);
    assert(observed.pixelDelta>=4,`${renderer} ${style} rendered <4 changed RGB pixels in the hit ROI: ${JSON.stringify({hit:captured.hit,observed})}`);
    const path=await screenshot(`${renderer}-combat-${style}`);
    return {captured,observed,path};
}
async function click(selector) {
  const p = await page(`const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('missing control '+${JSON.stringify(selector)});if(e.closest('.rail,.g1-character__body'))e.scrollIntoView({block:'nearest'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};`);
  await browser.click(p.x, p.y);
}
async function awaitFrames(n = 3) { await page(`return (async()=>{for(let i=0;i<${n};i++)await new Promise(requestAnimationFrame);return true})()`); }
function combatExpression(count = 6) { return combatFixtureExpression({ count, roots, seed: 673231 }); }
async function prepareWorld(preset = 'small', seed = 673231, count = 18) {
  const prior = await page(`const k=window.inkbox;k.setSpeed(0);const old=k.world;k.newWorld(${JSON.stringify(preset)},${seed});return {priorSeed:old.seed,priorEntities:old.entities.length,preset:k.presetKey,seed:k.world.seed};`);
  assert(await browser.waitFor(`return window.inkbox.lastTime>0 && window.inkbox.world.seed===${seed} && (!window.inkbox.render3d?.active || window.inkbox.render3d.renderer.world===window.inkbox.world)`,{timeoutMs:30000}), 'new World did not reach a normal product frame / renderer adoption');
  await awaitFrames(2);
  const guide=await page('return document.querySelector("#inkBusanziToggle")?.getAttribute("aria-expanded")==="true"');
  if(guide) await click('#inkBusanziToggle');
  await page('window.inkbox.advanceDays(0.1);return true');
  const fixture = await page(combatExpression(count));
  fixture.startedWith = prior;
  fixture.focus = await page(`const k=window.inkbox,actors=window.__g2CombatActors.map(id=>k.world.entities.find(e=>e.id===id));
    const focus=actors.slice(0,6).reduce((p,e)=>({x:p.x+e.x/6,y:p.y+e.y/6}),{x:0,y:0});
    if(k.render3d?.active){const r=k.render3d.renderer;r.focusOn(focus.x,focus.y,{duration:0},'mortal');r.cameraRig.camera.zoom=18;r.cameraRig.camera.updateProjectionMatrix();r.cameraRig.controls.update();}
    else {const idx=k.world.idx(Math.floor(focus.x),Math.floor(focus.y)),h=k.world.height[idx]||0;k.camera.focusOn(focus.x,focus.y-(k.camera.relief?h*k.camera.reliefScale:0),{zoom:13,duration:0});}
    return {focus,frame:k.lastTime,worldSeed:k.world.seed};`);
  return fixture;
}
async function runCombat(days = 2, hold = false) {
  await page(`const k=window.inkbox;k.advanceDays(${days});${hold?HOLD_AFTER_PAINT:''}return true`);
  await awaitFrames(1);
  return page(`return (async()=>{const k=window.inkbox;return {source:(await import('./src/inkbox/sim/presentation.js')).combatPresentationStats(k.world),
    queue:(await import('./src/inkbox/core/runtimeEvents.js')).runtimeEventStats(k.world),stage:k.stage.stats,
    mortal:k.stage.snapshotPlane('mortal').items.filter(i=>i.kind==='combat').map(i=>({style:i.data.style,subjectId:i.subjectId,targetId:i.targetId,
      x:i.x,y:i.y,fromX:i.data.fromX,fromY:i.data.fromY,ttl:i.ttl,age:i.age})),
    actors:window.__g2CombatActors.map(id=>{const e=k.world.entities.find(e=>e.id===id);return{id:e.id,hp:e.hp,maxHp:e.maxHp,root:e.root?.rootName,elements:e.root?.elements}}),
    renderer:k.render3d?.renderer?.getGeographyStats?.()||null};})()`);
}
async function testHighSpeed(renderer) {
  const fixture=await prepareWorld('small',673236,18);
  const before=await page(`const k=window.inkbox;return {day:k.world.day,source:(await import('./src/inkbox/sim/presentation.js')).combatPresentationStats(k.world)};`);
  try {
    await click('#inkSpeedBar [data-speed="5"]');
    const running=await page(`const k=window.inkbox,s=await import('./src/inkbox/sim/presentation.js'),r=await import('./src/inkbox/core/runtimeEvents.js');
      const samples=[];for(let n=0;n<18;n++){await new Promise(requestAnimationFrame);samples.push({day:k.world.day,queue:r.runtimeEventStats(k.world),stage:k.stage.stats,
        pool:k.render3d?.active?k.render3d.renderer.stages.get('mortal').fxProbe.stats.combat:null});}
      return {speed:k.speedIndex,day:k.world.day,source:s.combatPresentationStats(k.world),samples};`);
    assert.equal(running.speed,5);assert(running.day>before.day);assert(running.source.hits>before.source.hits);
    assert(running.samples.every(x=>x.queue.queued<=256&&x.queue.combatQueued<=64&&x.stage.active<=64&&x.stage.combatActive<=32));
    if(renderer==='3d')assert(running.samples.every(x=>x.pool.active<=32&&x.pool.drawCalls<=3));
    await click('#inkSpeedBar [data-speed="0"]');
    const pausedDay=await page('return window.inkbox.world.day');
    assert(await browser.waitFor('return window.inkbox.stage.stats.combatActive===0',{timeoutMs:5000}),'combat FX did not expire in real seconds while simulation paused');
    const paused=await page('return {day:window.inkbox.world.day,speed:window.inkbox.speedIndex,stage:window.inkbox.stage.stats}');
    assert.equal(paused.speed,0);assert.equal(paused.day,pausedDay);
    return {fixture,before,running,paused};
  }finally{await page('window.inkbox.setSpeed(0);return true');}
}
async function drawCanvasWindow(plane) {
  const tool=plane==='upper'?'viewUpper':'viewNether';
  const start=await page(`const k=window.inkbox,w=k.world;k.setSpeed(0);k.camera.fit(w);k.selectTool(${JSON.stringify(tool)});
    const cx=Math.floor(w.w/2),cy=Math.floor(w.h/2),x0=cx-7,y0=cy-7,x1=cx+7,y1=cy+7;
    function point(x,y){const i=w.idx(x,y),p=k.camera.tileScreen(x+.5,y+.5,w.height[i]||0),r=k.canvas.getBoundingClientRect();return{x:r.left+p[0],y:r.top+p[1]}}
    return {a:point(x0,y0),b:point(x1,y0),c:point(x1,y1),d:point(x0,y1),tool:k.toolId};`);
  const points=[start.a,start.b,start.c,start.d,start.a];
  await browser.cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:points[0].x,y:points[0].y});
  await browser.cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:points[0].x,y:points[0].y,button:'left',clickCount:1});
  for(const p of points.slice(1))await browser.cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,button:'left',buttons:1});
  await browser.cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:points.at(-1).x,y:points.at(-1).y,button:'left',clickCount:1});
  await sleep(120);
  return page(`return window.inkbox.getRealmViewState?.()||{open:!!window.inkbox.selection,targetPlane:window.inkbox.viewPlane?.().plane};`);
}
try {
  fs.mkdirSync(OUT, { recursive: true }); await startServer();
  APP.searchParams.set('renderer', 'canvas');
  browser = await launch({ url: APP.toString(), browser: findEdge(), width: 1440, height: 1000, gpu: process.env.INKBOX_GPU !== '0' });
  await browser.cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});
  report.edge = browser.meta;
  assert(await browser.waitFor('return !!window.inkbox?.world && !!window.inkbox?.life', { timeoutMs: 30000 }), 'Canvas app not ready');
  report.identity = await page(`return {title:document.title,url:location.href,viewport:[innerWidth,innerHeight],canvas:!!document.querySelector('#inkCanvas')};`);
  await check('Canvas real AI combat produces sampled hits and styled FX', async () => {
    const fixture = await prepareWorld('small',673231,18);
    assert.equal(fixture.count, 18); assert(fixture.originalEntitiesRetained);assert.equal(fixture.seed,673231);assert.deepEqual(fixture.world,[200,128]);
    const stats = await runCombat(.2,true);
    assert(stats.source.hits > 0 && stats.source.sampled > 0 && stats.source.emitted > 0,
      `real combat counters missing: ${JSON.stringify(stats.source)}`);
    assert(stats.queue.combatQueued >= 0);
    assert(stats.mortal.length > 0, 'no product-stage combat FX after real hits');
    const actorStyles=new Map(fixture.actors.filter(a=>a.side===0).map(a=>[a.id,a.style]));
    const observed=new Set(stats.mortal.map(x=>actorStyles.get(x.subjectId)).filter(Boolean));
    assert.equal(observed.size,3,`all three real attacker affinities must be visible; saw ${JSON.stringify([...observed])}`);
    const hpChanges=stats.actors.map(a=>({id:a.id,before:fixture.actors.find(x=>x.id===a.id)?.hp,after:a.hp}))
      .filter(x=>Number.isFinite(x.before)&&x.after<x.before);
    assert(hpChanges.length>0,`FX appeared without observable real HP loss: ${JSON.stringify(hpChanges)}`);
    const closeups=[];for(const style of ['blade','fire','thunder'])closeups.push(await captureFocusedStyle(fixture,style,'canvas',stats));
    return { fixture, stats, hpChanges, closeups };
  });
  await check('Canvas combat toggle suppresses only FX while simulation keeps fighting', async () => {
    const checkbox = await page(`const e=document.querySelector('#inkCombatFx');return e?{checked:e.checked,disabled:e.disabled}:null;`);
    assert(checkbox && checkbox.checked && !checkbox.disabled, `combat toggle absent/disabled: ${JSON.stringify(checkbox)}`);
    await click('#inkCombatFx');
    const off = await page(`return {checked:document.querySelector('#inkCombatFx').checked,enabled:window.inkbox.stage.combatEnabled};`);
    assert.equal(off.enabled, false); assert.equal(off.checked, false);
    const before = await page(`return (await import('./src/inkbox/sim/presentation.js')).combatPresentationStats(window.inkbox.world);`);
    await page('window.inkbox.advanceDays(1);return true'); await awaitFrames(4);
    const after = await page(`const k=window.inkbox;return {source:(await import('./src/inkbox/sim/presentation.js')).combatPresentationStats(k.world),
      stage:k.stage.stats,items:k.stage.snapshotPlane('mortal').items.filter(i=>i.kind==='combat').length};`);
    assert(after.source.hits > before.hits, `simulation did not continue while FX disabled: ${JSON.stringify({before,after})}`);
    assert.equal(after.stage.combatActive, 0); assert.equal(after.items, 0);
    await click('#inkCombatFx'); const restored = await page('return window.inkbox.stage.combatEnabled');
    assert.equal(restored, true); return { checkbox, off, before, after, restored };
  });
  await check('Formal beast and cultivator fight through normal hostility without injected attacks', async () => {
    const world=await page("const k=window.inkbox;k.setSpeed(0);k.newWorld('small',673234);return {seed:k.world.seed};");
    assert.equal(world.seed,673234);
    assert(await browser.waitFor('return window.inkbox.lastTime>0&&window.inkbox.world.seed===673234',{timeoutMs:30000}));
    await page('window.inkbox.advanceDays(0.1);return true');
    const fixture=await page(beastCombatFixtureExpression({roots}));
    assert.equal(fixture.beast.sp,'beast');assert.equal(fixture.beast.level,30);assert.equal(fixture.cultivator.level,30);
    assert(fixture.priorEntitiesRetained);
    try {
      const stepped=await page(`const k=window.inkbox,w=k.world,s=await import('./src/inkbox/sim/presentation.js'),
        r=await import('./src/inkbox/core/runtimeEvents.js'),ids=window.__g2BeastActors,before=s.combatPresentationStats(w),beastId=ids[1];let matched=[];
        for(let n=0;n<48&&!matched.length;n++){k.advanceDays(.5);matched=r.peekRuntimeEvents(w).filter(e=>e.type==='combat-hit'&&(e.subjectId===beastId||e.targetId===beastId));}
        if(!matched.length)throw Error('No real beast hit through ordinary hostility');
        const event=matched[0],x=(event.data.fromX+event.x)/2,y=(event.data.fromY+event.y)/2,i=w.idx(Math.floor(x),Math.floor(y)),h=w.height[i]||0;
        k.camera.focusOn(x,y-(k.camera.relief?h*k.camera.reliefScale:0),{zoom:26,duration:0});
        ${HOLD_AFTER_PAINT}
        const actors=ids.map(id=>{const e=w.entities.find(e=>e.id===id);return{id:e.id,sp:e.sp,level:e.level,hp:e.hp,madUntil:e.madUntil}});
        return {before,source:s.combatPresentationStats(w),actors,events:matched,day:w.day,queue:r.runtimeEventStats(w),
          items:k.stage.snapshotPlane('mortal').items.filter(i=>i.kind==='combat').map(i=>({subjectId:i.subjectId,targetId:i.targetId,style:i.data.style})),focus:{x,y}};`);
      const beastId=fixture.beast.id,beastEvent=stepped.events.find(e=>e.subjectId===beastId||e.targetId===beastId);
      assert(beastEvent);
      assert(stepped.source.hits>stepped.before.hits);
      assert(stepped.actors.some(a=>a.sp==='beast'&&a.id===beastId&&a.hp<fixture.beast.hp),`beast took no real damage: ${JSON.stringify(stepped)}`);
      assert(stepped.actors.every(a=>a.madUntil===0),'fixture unexpectedly used madness hostility');
      assert(stepped.items.some(i=>i.subjectId===beastId||i.targetId===beastId),`beast hit not visible in product snapshot: ${JSON.stringify(stepped)}`);
      await screenshot('beast-combat');return {world,fixture,stepped,beastEvent};
    }finally{await releaseFrames();}
  });
  await check('Product save/load replaces World and does not serialize combat counters', async () => {
    const before = await page(`window.__g2SavedWorld=window.inkbox.world;return {day:window.inkbox.world.day,entities:window.inkbox.world.entities.length};`);
    await click('#inkBtnSave'); await sleep(250);
    await click('#inkBtnLoad');
    const loaded = await page(`return (async()=>{const k=window.inkbox,s=await import('./src/inkbox/sim/presentation.js');
      return {replaced:k.world!==window.__g2SavedWorld,day:k.world.day,entities:k.world.entities.length,
        source:s.combatPresentationStats(k.world),stage:k.stage.stats.combatActive};})()`);
    assert(loaded.replaced); assert.equal(loaded.source.hits, 0); assert.equal(loaded.source.emitted, 0);
    await awaitFrames(4);
    const fixture=await page(combatExpression(6));await page('window.inkbox.advanceDays(8);return true');await awaitFrames(1);
    const postLoad=await page(`const k=window.inkbox;return {seed:k.world.seed,source:(await import('./src/inkbox/sim/presentation.js')).combatPresentationStats(k.world),
      actors:window.__g2CombatActors.map(id=>k.world.entities.find(e=>e.id===id)?.hp)};`);
    assert(postLoad.source.hits>0&&postLoad.source.emitted>0,`combat failed after real load: ${JSON.stringify(postLoad)}`);
    return { before, loaded, fixture, postLoad };
  });
  await check('Canvas realm window uses actual pointer drag and closes on tool change', async () => {
    const start = await page(`const k=window.inkbox,w=k.world;k.setSpeed(0);k.camera.fit(w);k.selectTool('viewUpper');
      const x0=Math.floor(w.w/2)-8,y0=Math.floor(w.h/2)-8,x1=x0+16,y1=y0+16;
      function point(x,y){const i=w.idx(x,y),p=k.camera.tileScreen(x+.5,y+.5,w.height[i]||0),r=k.canvas.getBoundingClientRect();return{x:r.left+p[0],y:r.top+p[1]}}
      return {a:point(x0,y0),b:point(x1,y0),c:point(x1,y1),d:point(x0,y1),tool:k.toolId};`);
    assert.equal(start.tool, 'viewUpper');
    const points = [start.a,start.b,start.c,start.d,start.a];
    await browser.cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:points[0].x,y:points[0].y});
    await browser.cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:points[0].x,y:points[0].y,button:'left',clickCount:1});
    for (const p of points.slice(1)) await browser.cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,button:'left',buttons:1});
    await browser.cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:points.at(-1).x,y:points.at(-1).y,button:'left',clickCount:1});
    await sleep(300);
    let opened = await page('return window.inkbox.getRealmViewState?.()||{open:!!window.inkbox.selection,targetPlane:window.inkbox.viewPlane?.().plane};');
    assert(opened.open && opened.targetPlane === 'upper', `upper view not opened: ${JSON.stringify(opened)}`);
    await page("window.inkbox.selectTool('inspect');return true");
    const closed = await page('return {open:window.inkbox.getRealmViewState?.().open??!!window.inkbox.selection,selection:!!window.inkbox.selection};');
    assert.equal(closed.open,false); return { opened, closed };
  });
  await check('Canvas upper bottleneck uses real UpperLife breakthrough and upper-plane lightning', async () => {
    const opened=await drawCanvasWindow('upper');assert(opened.open&&opened.targetPlane==='upper',JSON.stringify(opened));
    const trigger=await page(`return (async()=>{const k=window.inkbox,{initEntity}=await import('./src/inkbox/sim/cultivation.js'),
      {expToNext}=await import('./src/inkbox/core/cultivation.js'),{mulberry32}=await import('./src/inkbox/core/noise.js');
      const view=k.getRealmViewState(),region=view.region;if(!region)throw Error('upper region missing');
      const x=(region.x0+region.x1)/2,y=(region.y0+region.y1)/2,u=k.world.upper;
      const e=initEntity({name:'G2 upper bottleneck',sp:'cultivator',x,y},mulberry32(11),{cultivator:true});u.addEntity(e);
      e.level=60;e.exp=expToNext(60)+1;e.age=0;e.lifespan=1e9;e.lastKarmaDay=e.lastTrialDay=u.day;
      const previous=k.upperLife.rng;try{k.upperLife.rng=()=>0;k.advanceDays(10)}finally{k.upperLife.rng=previous}
      ${HOLD_AFTER_PAINT}
      return {id:e.id,name:e.name,x,y,level:e.level,day:u.day,chronicle:u.chronicle.slice(-5),rngRestored:k.upperLife.rng===previous};})()`);
    await awaitFrames(1);
    const state=await page(`const k=window.inkbox,u=k.world.upper;return {view:k.getRealmViewState(),level:u.entities.find(e=>e.id===${trigger.id})?.level,
      chronicle:u.chronicle.slice(-8),source:(await import('./src/inkbox/core/runtimeEvents.js')).runtimeEventStats(u),
      upper:k.stage.snapshotPlane('upper').items.map(i=>({kind:i.kind,subjectId:i.subjectId,plane:i.plane,ttl:i.ttl})),
      mortal:k.stage.snapshotPlane('mortal').items.filter(i=>i.kind==='lightning').length};`);
    assert(trigger.level===61&&trigger.rngRestored,JSON.stringify(trigger));
    assert(state.chronicle.some(x=>x.kind==='tribulation'),`upper Chronicle missing real tribulation: ${JSON.stringify(state.chronicle)}`);
    assert(state.upper.some(x=>x.kind==='lightning'&&x.subjectId===trigger.id),`upper lightning missing: ${JSON.stringify(state.upper)}`);
    assert.equal(state.mortal,0,'upper lightning leaked to mortal plane');
    await screenshot('upper-tribulation');await releaseFrames();await click('#inkBtnCloseView');
    return {trigger,state,closed:await page('return window.inkbox.getRealmViewState().open')};
  });

  await check('Canvas native flight speed remains bounded and paused FX expire in real seconds',()=>testHighSpeed('canvas'));

  APP.searchParams.set('renderer', '3d');
  await browser.cdp.send('Page.navigate',{url:APP.toString()});
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.active && !!window.inkbox?.render3d?.renderer?.stages?.get("mortal")',{timeoutMs:60000}), '3D renderer failed to initialize');
  await page(`return (async()=>{const r=window.inkbox.render3d.renderer;await Promise.all([r.characterLoadPromise,r.environmentLoadPromise,r.art.comparisonReady]);return true})()`,60000);
  await check('3D host consumes actual combat FX through bounded shared style batches', async () => {
    const fixture = await prepareWorld('small',673232,18);
    const stats = await runCombat(.2,true);
    const three = await page(`const r=window.inkbox.render3d.renderer,s=r.stages.get('mortal');
      return {gl:(()=>{const c=r.gpu.getContext(),x=c.getExtension('WEBGL_debug_renderer_info');return c.getParameter(x?x.UNMASKED_RENDERER_WEBGL:c.RENDERER)})(),
        dpr:r.gpu.getPixelRatio(),combat:s.fxProbe.stats.combat,batches:Object.fromEntries(Object.entries(s.fxProbe.combat.batches).map(([k,b])=>[k,{count:b.mesh.count,capacity:b.mesh.instanceMatrix.count,visible:b.mesh.visible}])),
        probeCombat:s.fxProbe.combat.stats,summary:r.getGeographyStats().stages.mortal.fx.combat};`);
    report.webglRenderer=three.gl;
    if(process.env.INKBOX_GPU!=='0')assert(!/basic render|swiftshader|llvmpipe|software/i.test(three.gl),`software WebGL renderer: ${three.gl}`);
    assert(stats.source.hits>0 && three.combat.combatActive>0,`3D FX missing: ${JSON.stringify({stats,three})}`);
    assert(three.combat.capacity===32 && three.combat.drawCalls<=3 && three.combat.drawCalls>=1);
    assert(Object.values(three.batches).every(b=>b.capacity===32));
    const closeups=[];for(const style of ['blade','fire','thunder'])closeups.push(await captureFocusedStyle(fixture,style,'3d',stats));
    return {fixture,stats,three,closeups};
  });
  await check('3D checkbox disables combat FX without changing actual HP-hit simulation', async () => {
    await click('#inkCombatFx');
    let state=await page('return {enabled:window.inkbox.stage.combatEnabled,checked:document.querySelector("#inkCombatFx").checked}');
    assert.equal(state.enabled,false);
    const before=await page(`return (await import('./src/inkbox/sim/presentation.js')).combatPresentationStats(window.inkbox.world);`);
    await page('window.inkbox.advanceDays(1);return true');await awaitFrames(5);
    const after=await page(`const k=window.inkbox;return {source:(await import('./src/inkbox/sim/presentation.js')).combatPresentationStats(k.world),
      combat:k.render3d.renderer.stages.get('mortal').fxProbe.stats.combat,stage:k.stage.stats};`);
    assert(after.source.hits>before.hits); assert.equal(after.combat.combatActive,0);assert.equal(after.combat.drawCalls,0);
    assert.equal(after.stage.combatActive,0);
    await click('#inkCombatFx'); await page('window.inkbox.advanceDays(1);return true');await awaitFrames(5);
    const on=await page('return window.inkbox.render3d.renderer.stages.get("mortal").fxProbe.stats.combat');
    assert(on.combatActive>0); return {off:{state,before,after},on};
  });
  await check('3D upper/nether windows route real upper tribulation lightning and native renderer toggle works', async () => {
    const details=await page('const d=document.querySelector("#inkRender3DTools [data-probe=upper]").closest("details");return {open:d.open}');
    if(!details.open)await click('#inkRender3DTools details:nth-of-type(2) summary');
    await click('#inkRender3DTools [data-probe="upper"]');
    let opened=await page('return window.inkbox.getRealmViewState()');
    assert(opened.open&&opened.targetPlane==='upper',JSON.stringify(opened));
    await click('#inkCombatFx');
    const trigger=await page(`return (async()=>{const k=window.inkbox,{initEntity}=await import('./src/inkbox/sim/cultivation.js'),
      {expToNext}=await import('./src/inkbox/core/cultivation.js'),{mulberry32}=await import('./src/inkbox/core/noise.js');
      const region=k.getRealmViewState().region,u=k.world.upper,x=(region.x0+region.x1)/2,y=(region.y0+region.y1)/2;
      const e=initEntity({name:'G2 3D upper bottleneck',sp:'cultivator',x,y},mulberry32(11),{cultivator:true});u.addEntity(e);
      e.level=60;e.exp=expToNext(60)+1;e.age=0;e.lifespan=1e9;e.lastKarmaDay=e.lastTrialDay=u.day;
      const previous=k.upperLife.rng;try{k.upperLife.rng=()=>0;k.advanceDays(10)}finally{k.upperLife.rng=previous}
      ${HOLD_AFTER_PAINT}
      return {id:e.id,level:e.level,x,y,chronicle:u.chronicle.slice(-5)};})()`);
    await awaitFrames(1);
    const upper=await page(`const k=window.inkbox,s=k.render3d.renderer.stages.get('upper'),m=k.render3d.renderer.stages.get('mortal');
      return {view:k.getRealmViewState(),upper:s.fxProbe.stats.combat,mortal:m.fxProbe.stats.combat,
        chronicle:k.world.upper.chronicle.slice(-12),upperItems:k.stage.snapshotPlane('upper').items.map(i=>({kind:i.kind,subjectId:i.subjectId})),
        source:(await import('./src/inkbox/core/runtimeEvents.js')).runtimeEventStats(k.world.upper),enabled:k.stage.combatEnabled};`);
    assert.equal(trigger.level,61);assert(upper.enabled===false,'combat toggle should remain off during tribulation priority check');
    assert(upper.upper.lightningActive>0,`no actual upper lightning on 3D stage: ${JSON.stringify(upper)}`);
    assert.equal(upper.upper.combatActive,0);assert.equal(upper.mortal.lightningActive,0);
    assert(upper.upperItems.some(i=>i.kind==='lightning'&&i.subjectId===trigger.id));
    assert(upper.chronicle.some(x=>x.kind==='tribulation'&&x.text.includes(trigger.id.toString())||x.kind==='tribulation'&&x.text.includes('G2 3D upper bottleneck')),
      `live upper Chronicle missing this real tribulation: ${JSON.stringify({triggerChronicle:trigger.chronicle,live:upper.chronicle})}`);
    await releaseFrames();
    await click('#inkCombatFx');
    await click('#inkRender3DTools [data-probe="nether"]');
    const nether=await page('return window.inkbox.getRealmViewState()');
    assert(nether.open&&nether.targetPlane==='nether',JSON.stringify(nether));
    await click('#inkRender3DTools [data-probe="close"]');
    const closed=await page('return window.inkbox.getRealmViewState().open');assert.equal(closed,false);
    const modeBefore=await page('return {active:window.inkbox.render3d.active,canvasHidden:getComputedStyle(document.querySelector("#inkCanvas")).visibility==="hidden"}');
    await click('#inkRender3DTools [data-action="toggle"]');
    const canvas=await page('return {active:window.inkbox.render3d.active,canvasHidden:getComputedStyle(document.querySelector("#inkCanvas")).visibility==="hidden"}');
    assert.equal(canvas.active,false);assert.equal(canvas.canvasHidden,false);
    await click('#inkRender3DTools [data-action="toggle"]');
    assert(await browser.waitFor('return window.inkbox.render3d.active===true&&getComputedStyle(document.querySelector("#inkCanvas")).visibility==="hidden"===true',{timeoutMs:15000}),
      '3D host did not restore after native Canvas/3D toggle');
    const restored=await page('return {active:window.inkbox.render3d.active,canvasHidden:getComputedStyle(document.querySelector("#inkCanvas")).visibility==="hidden"}');
    assert.equal(restored.active,true);assert.equal(restored.canvasHidden,true);
    return {trigger,upper,nether,closed,modeBefore,canvas,restored};
  });
  await check('3D native flight speed remains bounded and paused FX expire in real seconds',()=>testHighSpeed('3d'));
  await check('World replacement releases old Three FX resources and repeated dispose is idempotent', async () => {
    // Ensure visible real effects exist, then count owned batch resource disposal on each plane.
    await page('window.inkbox.advanceDays(4);return true');await awaitFrames(1);
    const old = await page(`const k=window.inkbox,r=k.render3d.renderer;window.__g2Disposed={geometry:0,material:0};
      const planes=[...r.stages.keys()],oldStages=Object.fromEntries(planes.map(p=>[p,r.stages.get(p)]));
      for(const stage of Object.values(oldStages))for(const batch of Object.values(stage.fxProbe.combat.batches)){
        batch.geometry.addEventListener('dispose',()=>window.__g2Disposed.geometry++);
        batch.material.addEventListener('dispose',()=>window.__g2Disposed.material++);
      }
      return {hostPresent:!!r,planes,stageCount:r.stages.size,combatActive:r.stages.get('mortal').fxProbe.stats.combat.combatActive,
        source:(await import('./src/inkbox/sim/presentation.js')).combatPresentationStats(k.world)};`);
    assert(old.stageCount===3&&old.planes.includes('upper')&&old.planes.includes('nether'));
    assert(old.source.hits>0,`no combat before world replacement: ${JSON.stringify(old.source)}`);
    // The formal World replacement path must dispose every three-style batch on all planes.
    await page("window.inkbox.newWorld('small',673233);return true");
    await awaitFrames(10);
    const switched = await page(`const k=window.inkbox,r=k.render3d.renderer;return {worldAdopted:r.world===k.world,
      newStage:r.stages.get('mortal')!==null,oldStageCount:r.stages.size,
      canvasConnected:!!document.querySelector('#inkCanvas3D'),geometries:r.gpu.info.memory.geometries,textures:r.gpu.info.memory.textures,
      disposed:window.__g2Disposed,source:(await import('./src/inkbox/sim/presentation.js')).combatPresentationStats(k.world),
      active:[...r.stages.values()].reduce((n,s)=>n+s.fxProbe.stats.combat.active,0)};`);
    assert(switched.worldAdopted && switched.newStage && switched.canvasConnected);
    assert.equal(switched.disposed.geometry,9,`old ThreeCombatFx geometry disposal count: ${JSON.stringify(switched.disposed)}`);
    assert.equal(switched.disposed.material,9,`old ThreeCombatFx material disposal count: ${JSON.stringify(switched.disposed)}`);
    assert.equal(switched.source.hits,0);assert.equal(switched.active,0);
    const warm=[];
    for(const seed of [673234,673235]){
      await page(`window.inkbox.newWorld('small',${seed});return true`);await awaitFrames(8);
      warm.push(await page(`const k=window.inkbox,r=k.render3d.renderer;return {adopted:r.world===k.world,geometries:r.gpu.info.memory.geometries,
        textures:r.gpu.info.memory.textures,stageCount:r.stages.size,active:[...r.stages.values()].reduce((n,s)=>n+s.fxProbe.stats.combat.active,0)};`));
      assert(warm.at(-1).adopted&&warm.at(-1).stageCount===3&&warm.at(-1).active===0);
    }
    assert(warm.every(x=>x.geometries===switched.geometries&&x.textures===switched.textures),`GPU resources grew after warm world replacement: ${JSON.stringify({switched,warm})}`);
    const disposed = await page(`const k=window.inkbox,adapter=k.render3d,host=adapter.renderer;
      const probe=host.stages.get('mortal').fxProbe;probe.dispose();probe.dispose();
      adapter.dispose();adapter.dispose();return {probeDisposed:probe.disposed,hostDisposed:host.disposed,
        canvasRemoved:!document.querySelector('#inkCanvas3D'),panelRemoved:!document.querySelector('#inkRender3DTools')};`);
    assert(disposed.probeDisposed&&disposed.hostDisposed&&disposed.canvasRemoved&&disposed.panelRemoved);
    return { old:{...old,oldStages:undefined},switched,warm,disposed };
  });

  report.errors = browser.errors();
  report.consoleErrors = browser.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type==='error')
    .map(e=>e.params.args.map(a=>a.value||a.description||'').join(' '));
  if (report.errors.length || report.consoleErrors.length) {
    const relevant = [...report.errors,...report.consoleErrors].filter(x=>!/favicon|net::ERR_ABORTED/.test(String(x)));
    if (relevant.length) report.checks.push({name:'browser console/runtime',pass:false,error:relevant.slice(0,12)});
  }
  report.pass = report.checks.length>0 && report.checks.every(c=>c.pass);
} catch (error) {
  report.error=String(error.stack||error); console.error(error);
  if(browser){try{await screenshot('failure')}catch{}}
} finally {
  report.finishedAt=new Date().toISOString();
  fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'g2-browser.json'),JSON.stringify(report,null,2)+'\n');
  if(browser)await browser.close();if(server){try{server.kill()}catch{}}
}
console.log(`G2 browser: ${report.checks.filter(c=>c.pass).length}/${report.checks.length} checks; pass=${report.pass}; report=${path.join(OUT,'g2-browser.json')}`);
if(!report.pass)process.exitCode=1;
