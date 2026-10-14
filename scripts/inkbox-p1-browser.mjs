// P1-W: real product browser interaction at target viewport sizes. No GPU performance claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.INKBOX_PORT || 4228);
const BASE = process.env.INKBOX_URL || `http://127.0.0.1:${PORT}`;
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/local/p1/browser'));
const report = { startedAt: new Date().toISOString(), pass: false, checks: [],
  screenshots: [], performanceClaim: false, backend: 'Edge/CDP formal product' };
let server, browser;
const page = code => browser.js(`return (async()=>{${code}})()`, { timeoutMs: 60000 });
const check = async (name, fn) => {
  const result = await fn(); report.checks.push({ name, pass: true, result }); console.log('PASS '+name);
};
async function frames() { await page('await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return true;'); }
async function viewport(w, h) {
  await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width:w, height:h, deviceScaleFactor:1, mobile:false });
  await sleep(130); await frames();
}
async function clickControl(selector) {
  const point = await page(`const e=document.querySelector(${JSON.stringify(selector)});
    if(!e||e.disabled||e.hidden)throw Error('Missing control '+${JSON.stringify(selector)});
    const style=getComputedStyle(e),r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    const hit=document.elementFromPoint(x,y);
    if(style.display==='none'||style.visibility==='hidden'||r.width===0||r.height===0||(!e.contains(hit)&&e!==hit))
      throw Error('Hidden/clipped/intercepted '+${JSON.stringify(selector)}+': '+JSON.stringify({rect:{x:r.x,y:r.y,w:r.width,h:r.height},hit:hit?.id,stack:document.elementsFromPoint(x,y).slice(0,8).map(v=>({id:v.id,cls:v.className,z:getComputedStyle(v).zIndex,pointer:getComputedStyle(v).pointerEvents,pos:getComputedStyle(v).position})),left:(()=>{const a=document.getElementById('inkToolsRail');return{cls:a.className,display:getComputedStyle(a).display,pos:getComputedStyle(a).position,z:getComputedStyle(a).zIndex,pointer:getComputedStyle(a).pointerEvents}})(),scrim:(()=>{const a=document.getElementById('inkExperienceScrim');return{hidden:a.hidden,z:getComputedStyle(a).zIndex,pos:getComputedStyle(a).position}})()}));
    return{x,y};`);
  await browser.click(point.x,point.y);
}
async function shot(name) {
  const p = await browser.screenshot(path.join(OUT,name+'.png'), { timeoutMs:30000 });
  report.screenshots.push(p);
}
async function evaluateLayout(renderer, w, h) {
  return page(`const rail=document.getElementById('inkExperienceRail');
    const nav=document.querySelector('.p1-observe-nav'),stage=document.querySelector('.stage'),rect=rail.getBoundingClientRect();
    return {renderer:${JSON.stringify(renderer)},width:innerWidth,height:innerHeight,
      railDisplay:getComputedStyle(rail).display,railWidth:rect.width,
      navVisible:getComputedStyle(nav).display!=='none',stageWidth:stage.getBoundingClientRect().width,
      openButton:getComputedStyle(document.getElementById('inkExperienceOpen')).display,
      title:document.getElementById('inkWatchTitle').textContent.trim()};`);
}
async function exerciseDesktop(renderer,w,h) {
  await viewport(w,h);
  const before=await evaluateLayout(renderer,w,h);
  assert.equal(before.width,w); assert.equal(before.height,h);
  assert.notEqual(before.railDisplay,'none');assert(before.stageWidth>350);
  for(const [key,id] of [['combat','inkCombatTitle'],['environment','inkEnvironmentTitle'],['watch','inkWatchTitle']]){
    await clickControl(`[data-experience-target="${key}"]`);
    await frames();
    const value=await page(`const t=document.getElementById(${JSON.stringify(id)}),r=t.getBoundingClientRect(),
      rail=document.getElementById('inkExperienceRail'),b=rail.getBoundingClientRect(),
      nav=rail.querySelector('.p1-observe-nav').getBoundingClientRect();
      return{visible:r.height>0&&r.top>=nav.bottom-2&&r.bottom<b.bottom,
        titleTop:r.top,navBottom:nav.bottom,railBottom:b.bottom,railScrollTop:rail.scrollTop,
        collapsed:t.classList.contains('collapsed'),focused:document.activeElement===t};`);
    assert(value.visible && !value.collapsed && value.focused,`${renderer} ${w}x${h} ${key}: ${JSON.stringify(value)}`);
  }
  await shot(renderer+'-'+w+'x'+h);
  return before;
}
async function exerciseDrawer(renderer) {
  await viewport(960,800);
  const before=await evaluateLayout(renderer,960,800);
  assert.equal(before.railDisplay,'none'); assert.notEqual(before.openButton,'none');
  await clickControl('#inkExperienceOpen');
  const opened=await page(`const r=document.getElementById('inkExperienceRail');
    return{visible:getComputedStyle(r).display!=='none',open:r.classList.contains('p1-open'),
      expanded:document.getElementById('inkExperienceOpen').getAttribute('aria-expanded'),
      scrim:document.getElementById('inkExperienceScrim').hidden};`);
  assert(opened.visible&&opened.open&&opened.expanded==='true'&&!opened.scrim,JSON.stringify(opened));
  await clickControl('[data-experience-target="environment"]');
  const reachable=await page(`const b=document.querySelector('#inkEnvironmentObserver [data-environment-action="find-fires"]'),
    r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return{visible:r.width>0&&r.height>0,unblocked:hit===b||b.contains(hit),title:document.getElementById('inkEnvironmentTitle').textContent};`);
  assert(reachable.visible&&reachable.unblocked,JSON.stringify(reachable));
  await shot(renderer+'-960x800');
  await browser.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await browser.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  assert(await page('return !document.getElementById("inkExperienceRail").classList.contains("p1-open")'),'Escape should close only drawer');
  await viewport(680,720);
  let toolState;
  if (renderer === 'canvas') {
    await clickControl('#inkToolsOpen');
    assert(await page('return document.getElementById("inkToolsRail").classList.contains("p1-open")'),'Canvas tool drawer not reachable');
    await shot(renderer+'-680x720');
    await clickControl('#inkToolsClose');
    assert(await page('return document.getElementById("inkExperienceScrim").hidden'),'Canvas scrim should clear');
    toolState = { canvasDrawer: true };
  } else {
    toolState = await page(`const left=document.getElementById('inkToolsRail'),
      launcher=document.getElementById('inkToolsOpen'),native=document.getElementById('inkRender3DTools'),
      r=native.getBoundingClientRect();
      return { leftInert:left.inert,launcherHidden:getComputedStyle(launcher).display==='none',
        nativeVisible:r.width>0&&r.height>0&&getComputedStyle(native).display!=='none',
        nativeText:native.innerText.slice(0,140) };`);
    assert(toolState.leftInert && toolState.launcherHidden && toolState.nativeVisible,
      'Three must retain its own formal tools, not reactivate inert Canvas tools: '+JSON.stringify(toolState));
    await shot(renderer+'-680x720');
  }
  return{opened,reachable,toolState};
}
try {
  fs.mkdirSync(OUT,{recursive:true});
  if(!process.env.INKBOX_URL){
    server=spawn(process.execPath,['scripts/inkbox-server.mjs','--port',String(PORT)],{cwd:ROOT,stdio:'ignore',windowsHide:true});
    let ready=false;
    for(let n=0;n<90;n++){try{if((await fetch(BASE+'/inkbox.html')).ok){ready=true;break;}}catch{}await sleep(150);}
    assert(ready,'P1 browser server failed to start');
  }
  browser=await launch({url:BASE+'/inkbox.html',browser:findEdge(),width:1366,height:768,gpu:false});
  report.edge=browser.meta;
  for(const renderer of ['canvas','3d']){
    await browser.cdp.send('Page.navigate',{url:BASE+'/inkbox.html'+(renderer==='3d'?'?renderer=3d':'')});
    assert(await browser.waitFor('return document.readyState === "complete" && !!window.inkbox?.world && !!document.querySelector("[data-experience-target]")',{timeoutMs:90000}),renderer+' boot failed');
    if(renderer==='3d')assert(await browser.waitFor('return !!window.inkbox?.render3d?.active',{timeoutMs:90000}),'Three not active');
    await frames();
    for(const [w,h] of [[1366,768],[1280,720]])await check(renderer+' '+w+'x'+h,()=>exerciseDesktop(renderer,w,h));
    await check(renderer+' narrow 960/680',()=>exerciseDrawer(renderer));
  }
  report.runtimeErrors=browser.errors();
  assert.equal(report.runtimeErrors.length,0,JSON.stringify(report.runtimeErrors));
  report.pass=true;
} catch(error){
  report.error=String(error.stack||error);console.error(error);process.exitCode=1;
  if(browser)try{await shot('p1-failure')}catch(e){report.screenshotError=String(e)}
} finally {
  if(browser)await browser.close();
  if(server){server.kill();for(let n=0;n<50&&server.exitCode===null&&server.signalCode===null;n++)await sleep(100);}
  report.cleanup={profileRemoved:!browser||!fs.existsSync(browser.userDataDir),
    serverExited:!server||server.exitCode!==null||server.signalCode!==null};
  if(!Object.values(report.cleanup).every(Boolean)){report.pass=false;process.exitCode=1;}
  report.finishedAt=new Date().toISOString();
  fs.mkdirSync(OUT,{recursive:true});
  fs.writeFileSync(path.join(OUT,'p1-browser.json'),JSON.stringify(report,null,2)+'\n');
}
console.log('P1 browser: '+report.checks.length+' cases; pass='+report.pass);
