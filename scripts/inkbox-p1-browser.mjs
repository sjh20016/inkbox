// P1-W: real product browser interaction at target viewport sizes. No GPU performance claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {createHash} from 'node:crypto';
import {collectBrowserErrors} from './inkbox-g2pf-config.mjs';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';
import { launchOwnedServer } from './inkbox-owned-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.INKBOX_PORT || 0);
let BASE = process.env.INKBOX_URL;
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/local/p1/browser'));
const report = { startedAt: new Date().toISOString(), pass: false, checks: [],
  head:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8',windowsHide:true}).trim(),sourceHashes:Object.fromEntries(['scripts/inkbox-p1-browser.mjs','scripts/cdp.mjs','src/inkbox/ui/playerExperienceNav.js','src/inkbox/ui/playerExperienceNav.css','inkbox.html'].map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(ROOT,file))).digest('hex')])),screenshots: [], performanceClaim: false, backend: 'Edge/CDP formal product' };
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

async function nativeKey(key,shift=false){const code=key==='Tab'?'Tab':'Escape',vk=key==='Tab'?9:27;const event={key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,modifiers:shift?8:0};await browser.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',...event});await browser.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',...event});await frames();}
async function focusState(railId){return page(`const rail=document.getElementById(${JSON.stringify(railId)}),focusable=[...rail.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex="0"]')].filter(el=>el.getClientRects().length>0&&!el.closest('.sec-body.collapsed'));return{inside:rail.contains(document.activeElement),index:focusable.indexOf(document.activeElement),count:focusable.length,id:document.activeElement?.id};`);}
async function nativeTrap(railId){
 await page(`window.__p1NativeTabs=[];const handler=e=>{if(e.key==='Tab')window.__p1NativeTabs.push({trusted:e.isTrusted,shift:e.shiftKey});};window.addEventListener('keydown',handler,true);window.__p1RemoveNativeTabs=()=>window.removeEventListener('keydown',handler,true);return true;`);
 try{let state=await focusState(railId);assert(state.inside&&state.count>=2,'Drawer must receive focus');const limit=state.count+2;for(let n=0;state.index!==0&&n<limit;n++){await nativeKey('Tab');state=await focusState(railId);assert(state.inside,'Native Tab escaped drawer');}assert.equal(state.index,0,'Could not reach actual first tab stop with native Tab');await nativeKey('Tab',true);const reverse=await focusState(railId);assert.equal(reverse.index,reverse.count-1,'Native Shift+Tab at first must wrap to actual last');await nativeKey('Tab');const forward=await focusState(railId);assert.equal(forward.index,0,'Native Tab at last must wrap to actual first');const events=await page('return window.__p1NativeTabs;');assert(events.length>=2&&events.every(e=>e.trusted),'Boundary tests must use trusted CDP keyboard events');return{reverse,forward,events};}finally{await page('window.__p1RemoveNativeTabs?.();return true;');}
}
async function assertDrawerClosedAndFocus(opener){const state=await page(`return{closed:!document.querySelector('.p1-open'),scrimHidden:document.getElementById('inkExperienceScrim').hidden,focus:document.activeElement?.id,expanded:document.getElementById(${JSON.stringify(opener)}).getAttribute('aria-expanded')};`);assert(state.closed&&state.scrimHidden&&state.focus===opener&&state.expanded==='false',JSON.stringify(state));return state;}
async function clickBackdrop(){const p=await page(`const scrim=document.getElementById('inkExperienceScrim'),r=scrim.getBoundingClientRect();for(const u of [.02,.1,.9,.98])for(const v of [.1,.5,.9]){const x=r.left+r.width*u,y=r.top+r.height*v;if(document.elementFromPoint(x,y)===scrim)return{x,y};}throw Error('No genuinely exposed backdrop point');`);await browser.click(p.x,p.y);}
async function mapOperable(renderer){
 const before=await page(`const k=window.inkbox,canvas=${renderer==='3d'?'k.render3d.canvas':'k.canvas'},r=canvas.getBoundingClientRect();k.selectTool('inspect');window.__p1MapPointer=null;canvas.addEventListener('pointerdown',e=>window.__p1MapPointer={trusted:e.isTrusted,x:e.clientX,y:e.clientY},{once:true});const x=r.left+r.width*.5,y=r.top+r.height*.5;const hit=document.elementFromPoint(x,y);if(hit!==canvas)throw Error('Closed drawer still intercepts map');return{x,y,zoom:${renderer==='3d'?'k.render3d.renderer.cameraRig.camera.zoom':'k.camera.zoom'}};`);
 await browser.wheel(before.x,before.y,-160);await browser.click(before.x,before.y);const after=await page(`const k=window.inkbox;return{pointer:window.__p1MapPointer,zoom:${renderer==='3d'?'k.render3d.renderer.cameraRig.camera.zoom':'k.camera.zoom'},scrimHidden:document.getElementById('inkExperienceScrim').hidden};`);assert(after.pointer?.trusted&&after.scrimHidden,'Map did not receive trusted pointer');assert.notEqual(after.zoom,before.zoom,'Native map wheel had no product camera effect');return{before,after};
}
async function exerciseNarrowKeyboard(renderer){
 await viewport(680,720);await clickControl('#inkExperienceOpen');const navigation=[];
 for(const [key,id]of [['combat','inkCombatTitle'],['environment','inkEnvironmentTitle'],['watch','inkWatchTitle']]){await clickControl(`[data-experience-target="${key}"]`);const evidence=await page(`const t=document.getElementById(${JSON.stringify(id)}),r=t.getBoundingClientRect(),rail=document.getElementById('inkExperienceRail'),bar=rail.querySelector('.p1-observe-nav').getBoundingClientRect();return{key:${JSON.stringify(key)},top:r.top,bottom:r.bottom,barBottom:bar.bottom,railBottom:rail.getBoundingClientRect().bottom,focused:document.activeElement===t,collapsed:t.classList.contains('collapsed')};`);assert(evidence.focused&&!evidence.collapsed&&evidence.top>=evidence.barBottom-2&&evidence.bottom<evidence.railBottom,JSON.stringify(evidence));navigation.push(evidence);}
 const observationTrap=await nativeTrap('inkExperienceRail');await nativeKey('Escape');const escape=await assertDrawerClosedAndFocus('inkExperienceOpen');await clickControl('#inkExperienceOpen');await clickBackdrop();const backdrop=await assertDrawerClosedAndFocus('inkExperienceOpen');let tools=null;if(renderer==='canvas'){await clickControl('#inkToolsOpen');const trap=await nativeTrap('inkToolsRail');await nativeKey('Escape');const closed=await assertDrawerClosedAndFocus('inkToolsOpen');tools={trap,closed};}const map=await mapOperable(renderer);return{navigation,observationTrap,escape,backdrop,tools,map};
}
try {
  fs.mkdirSync(OUT,{recursive:true});
  if(!BASE){const owned=await launchOwnedServer({root:ROOT,port:PORT});server=owned.child;BASE=owned.url;report.serverIdentity=owned.identity;}
  else report.serverIdentity={owned:false,url:BASE,reason:'External server source identity unverified'};
  browser=await launch({url:BASE+'/inkbox.html',browser:findEdge(),width:1366,height:768,gpu:true});
  report.edge=browser.meta;
  for(const renderer of ['canvas','3d']){
    await browser.cdp.send('Page.navigate',{url:BASE+'/inkbox.html'+(renderer==='3d'?'?renderer=3d':'')});
    assert(await browser.waitFor('return document.readyState === "complete" && !!window.inkbox?.world && !!document.querySelector("[data-experience-target]")',{timeoutMs:90000}),renderer+' boot failed');
    if(renderer==='3d')assert(await browser.waitFor('return !!window.inkbox?.render3d?.active',{timeoutMs:90000}),'Three not active');
    await frames();
    if(renderer==='3d'){report.hardware=await page(`const gl=window.inkbox.render3d.renderer.gpu.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{vendor:gl.getParameter(ext?ext.UNMASKED_VENDOR_WEBGL:gl.VENDOR),renderer:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};`);assert(!/swiftshader|llvmpipe|software|basic render|warp/i.test(report.hardware.renderer),'Hardware renderer required: '+JSON.stringify(report.hardware));}
    for(const [w,h] of [[1500,940],[1366,768],[1280,720]])await check(renderer+' '+w+'x'+h,()=>exerciseDesktop(renderer,w,h));
    await check(renderer+' narrow 960/680',()=>exerciseDrawer(renderer));
    await check(renderer+' 680 observation navigation/native trap/focus/map',()=>exerciseNarrowKeyboard(renderer));
  }
  report.browserErrors=collectBrowserErrors(browser);
  assert.equal(report.browserErrors.length,0,JSON.stringify(report.browserErrors));
  assert(report.serverIdentity?.owned,'Owned product source is required for formal P1 acceptance');
  report.pass=true;
} catch(error){
  report.error=String(error.stack||error);console.error(error);process.exitCode=1;
  if(browser)try{await shot('p1-failure')}catch(e){report.screenshotError=String(e)}
} finally {
  if(browser){try{report.authoritativeCleanup=await browser.close();}catch(error){report.authoritativeCleanupError=String(error.stack||error);report.pass=false;process.exitCode=1;}if(!report.authoritativeCleanup?.complete){report.pass=false;process.exitCode=1;}report.browserErrors=collectBrowserErrors(browser);if(report.browserErrors.length){report.pass=false;process.exitCode=1;}}
  if(server){if(server.exitCode!==null||server.signalCode!==null){report.pass=false;process.exitCode=1;report.serverPrematureExit=true;}server.kill();for(let n=0;n<50&&server.exitCode===null&&server.signalCode===null;n++)await sleep(100);}
  report.cleanup={browser:report.authoritativeCleanup||null,serverExited:!server||server.exitCode!==null||server.signalCode!==null};
  if(!report.cleanup.serverExited){report.pass=false;process.exitCode=1;}
  report.actualExitCode=process.exitCode||0;
  report.finishedAt=new Date().toISOString();
  fs.mkdirSync(OUT,{recursive:true});
  fs.writeFileSync(path.join(OUT,'p1-browser.json'),JSON.stringify(report,null,2)+'\n');
}
console.log('P1 browser: '+report.checks.length+' cases; pass='+report.pass);
