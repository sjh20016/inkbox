#!/usr/bin/env node
// G8-C.1: execute the actual Sandbox, DOM listeners, codec and storage in Edge/CDP.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launch, findEdge, sleep } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.INKBOX_PORT || 4241);
const base = process.env.INKBOX_URL || `http://127.0.0.1:${port}`;
const url = new URL('/inkbox.html', base).href;
const output = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(root, 'reports/local/g8c1/browser'));
const downloads = path.join(output, 'downloads');
const report = { startedAt: new Date().toISOString(), url, viewport: [1366, 900],
  browserPath: 'Existing repository CDP; Browser plugin absent; Tabbit launcher missing',
  purpose: 'formal save/load/import/autosave runtime checkpoints', checks: [], pass: false };
let server, browser;
const page = body => browser.js(`return (async () => { ${body} })();`, { timeoutMs: 45000 });
async function check(name, run) {
  report.phase = name;
  report.checks.push({ name, evidence: await run(), pass: true });
  console.log(`PASS ${name}`);
}
async function click(selector) {
  const point = await page(`const e=document.querySelector(${JSON.stringify(selector)});
    if(!e||e.disabled)throw Error('Control unavailable: '+${JSON.stringify(selector)});
    e.scrollIntoView({block:'nearest'});await new Promise(requestAnimationFrame);
    const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
  await browser.click(point.x, point.y);
}
async function load(slot, accepted = true) {
  await page(`const k=window.inkbox;k.qol.resetDirty();window.__g8Before=k.world;
    const s=document.querySelector('#inkSlotSelect');s.value=${JSON.stringify(slot)};
    s.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
  await click('#inkBtnLoad');
  assert(await browser.waitFor('return !window.inkbox.qol.isBusy("inkBtnLoad")', { timeoutMs: 15000 }));
  assert.equal(await page('return window.inkbox.world!==window.__g8Before;'), accepted);
}
async function importText(text) {
  return page(`const k=window.inkbox;k.qol.resetDirty();window.__g8Before=k.world;
    const input=document.querySelector('#inkImportFile'),dt=new DataTransfer();
    dt.items.add(new File([${JSON.stringify(text)}],'g8-checkpoint.json',{type:'application/json'}));
    input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
}

try {
  fs.mkdirSync(downloads, { recursive: true });
  if (!process.env.INKBOX_URL) {
    server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(port)],
      { cwd: root, stdio: 'ignore', windowsHide: true });
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) throw Error(`Owned server exited ${server.exitCode}`);
      try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
      await sleep(150);
    }
    assert(ready, 'owned server ready');
  }
  browser = await launch({ url, browser: findEdge(), width: 1366, height: 900, gpu: false });
  report.browser = browser.meta;
  assert(await browser.waitFor('return !!window.inkbox?.creationMenu', { timeoutMs: 30000 }));
  await check('Product page and controlled mid-period session', async () => {
    const result = await page(`const k=window.inkbox;k.creationMenu.close();k.setSpeed(0);
      k.newWorld('small',20260914,{progressive:false});k.setSpeed(0);
      for(let i=0;i<7;i++)k.advanceDays(3);
      // Exercise every saved clock, including a closed-view rift clock.
      Object.assign(k.advanceState,{upper:1.25,nether:2.5,rift:3.75,wraith:.5});
      for(let i=0;i<9;i++)k.rng();
      const {worldStream}=await import('./src/inkbox/sim/worldStreams.js');
      worldStream(k.world,'rift',0x52494654)();
      k.qol.resetDirty();window.__g8Checkpoint=k.captureRuntime();
      return {url:location.href,title:document.title,content:document.body.innerText.length,
        canvas:!!document.querySelector('canvas'),overlay:!!document.querySelector('vite-error-overlay'),
        checkpoint:window.__g8Checkpoint};`);
    assert.equal(result.url, url); assert(result.title && result.content > 100 && result.canvas && !result.overlay);
    assert(result.checkpoint.exact && result.checkpoint.upperLife.foundAccum > 0);
    return result;
  });
  await check('Actual autoSave captures before async codec and guards concurrent saves', async () => {
    const result = await page(`const k=window.inkbox,io=await import('./src/inkbox/io/save.js'),
      {APP}=await import('./src/inkbox/core/config.js'),original=Storage.prototype.setItem;
      let writes=0;Storage.prototype.setItem=function(key,value){if(key===APP.saveKey+':auto')writes++;return original.call(this,key,value);};
      try{const pending=k.autoSave();const guarded=k.autoSaving;await k.autoSave();
        k.life.rng();k.rng();k.advanceState.rift+=.25;k.world.day+=1;
        await pending;const w=await io.loadFromStorage('auto'),saved=io.savedRuntimeOf(w);
        return {writes,guarded,released:!k.autoSaving,saved:saved.state,day:w.day};
      }finally{Storage.prototype.setItem=original;}`);
    assert(result.guarded && result.released); assert.equal(result.writes, 1);
    assert.deepEqual(result.saved, report.checks[0].evidence.checkpoint);
    assert.equal(result.day, result.saved.day); return result;
  });
  await check('Actual auto-slot load restores RNG next draw, four clocks and UpperLife', async () => {
    await load('auto');
    const result = await page(`const k=window.inkbox,cp=window.__g8Checkpoint,
      {rngStream}=await import('./src/inkbox/core/noise.js'),r=rngStream(1);r.setState(cp.life.rng);
      const expected=r(),actual=k.life.rng();k.life.rng.setState(cp.life.rng);
      return {expected,actual,state:k.captureRuntime(),owners:k.life.world===k.world&&k.upperLife.upper===k.world.upper};`);
    assert.equal(result.actual, result.expected); assert(result.owners);
    assert.deepEqual(result.state, report.checks[0].evidence.checkpoint); return result;
  });
  await check('Manual save uses the same runtime snapshot contract', async () => {
    await page(`const k=window.inkbox;k.qol.resetDirty();document.querySelector('#inkSlotSelect').value='slot1';k.refreshSlots();return true;`);
    await click('#inkBtnSave');
    assert(await browser.waitFor('return !window.inkbox.qol.isBusy("inkBtnSave")', { timeoutMs: 15000 }));
    const result = await page(`const io=await import('./src/inkbox/io/save.js');return io.savedRuntimeOf(await io.loadFromStorage('slot1'));`);
    assert.equal(result.status, 'ok'); assert.deepEqual(result.state, report.checks[0].evidence.checkpoint);
    await load('slot1'); return result;
  });
  let exported;
  await check('Native export download and actual File input import continue the same session', async () => {
    await browser.cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    const prior = new Set(fs.readdirSync(downloads));
    await click('#inkBtnExport');
    let file;
    for (let i=0;i<100;i++) { file=fs.readdirSync(downloads).find(f=>f.endsWith('.json')&&!prior.has(f));if(file)break;await sleep(100); }
    assert(file, 'formal export downloaded');
    exported=fs.readFileSync(path.join(downloads,file),'utf8');
    assert.deepEqual(JSON.parse(exported).runtime, report.checks[0].evidence.checkpoint);
    await page(`window.inkbox.advanceDays(3);return true;`);
    await importText(exported);
    assert(await browser.waitFor('return !window.inkbox.qol.isBusy("inkBtnImport")', { timeoutMs: 15000 }));
    const result=await page(`const k=window.inkbox;return {replaced:k.world!==window.__g8Before,state:k.captureRuntime(),input:document.querySelector('#inkImportFile').value};`);
    assert(result.replaced && !result.input);assert.deepEqual(result.state,JSON.parse(exported).runtime);
    return {filename:file,bytes:exported.length,...result};
  });
  await check('Quota failure keeps previous auto-slot and reports failure', async () => {
    const result=await page(`const k=window.inkbox,{APP}=await import('./src/inkbox/core/config.js'),key=APP.saveKey+':auto',
      before=localStorage.getItem(key),original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(name,value){if(name===key)throw new DOMException('G8 quota injection','QuotaExceededError');return original.call(this,name,value);};
      try{await k.autoSave();return {same:localStorage.getItem(key)===before,released:!k.autoSaving,toast:k.toast};}
      finally{Storage.prototype.setItem=original;}`);
    assert(result.same && result.released && /自动存档失败/.test(result.toast));return result;
  });
  await check('Old auto-slot without runtime loads with an explicit compatibility notice', async () => {
    await page(`const io=await import('./src/inkbox/io/save.js'),{APP}=await import('./src/inkbox/core/config.js');
      localStorage.setItem(APP.saveKey+':auto',JSON.stringify(io.serializeWorld(window.inkbox.world)));window.inkbox.refreshSlots();return true;`);
    await load('auto');
    const result=await page(`return {toast:window.inkbox.toast,state:window.inkbox.captureRuntime()};`);
    assert(/旧存档无运行状态/.test(result.toast));assert.deepEqual(result.state.advance,{upper:0,nether:0,rift:0,wraith:0});return result;
  });
  await check('Corrupt new auto-slots reject before replacing World or runtime', async () => {
    const mutations=['p.runtime.life.rng=-1','p.runtime.advance.rift=-1','p.runtime.v=99',
      'p.runtime.day+=1','p.runtime.life=null','p.runtime.exact=false'];
    const results=[];
    for (const mutation of mutations) {
      await page(`const k=window.inkbox,io=await import('./src/inkbox/io/save.js'),{APP}=await import('./src/inkbox/core/config.js');
        window.__g8Stable=JSON.stringify(k.captureRuntime());const p=io.serializeWorld(k.world,{}, {runtime:k.captureRuntime()});
        ${mutation};localStorage.setItem(APP.saveKey+':auto',JSON.stringify(p));k.refreshSlots();return true;`);
      await load('auto',false);
      const result=await page(`return {same:JSON.stringify(window.inkbox.captureRuntime())===window.__g8Stable,toast:window.inkbox.toast};`);
      assert(result.same && /读取失败/.test(result.toast));results.push({mutation,...result});
    }
    const corrupt=JSON.parse(exported);corrupt.runtime.advance.upper=-1;
    await importText(JSON.stringify(corrupt));
    assert(await browser.waitFor('return !window.inkbox.qol.isBusy("inkBtnImport")', { timeoutMs: 15000 }));
    assert(await page(`return window.inkbox.world===window.__g8Before&&JSON.stringify(window.inkbox.captureRuntime())===window.__g8Stable&&/导入失败/.test(window.inkbox.toast);`));
    return results;
  });
  await check('World A to B clears clocks and streams without retaining controller ownership', async () => {
    const result=await page(`const k=window.inkbox,old=k.world,clocks=k.advanceState,rng=k.rng;
      k.newWorld('small',77,{progressive:false});k.setSpeed(0);const first=k.captureRuntime();
      k.advanceDays(3);k.rng();k.newWorld('small',77,{progressive:false});k.setSpeed(0);
      const second=k.captureRuntime();return {first,second,replaced:old!==k.world,identity:clocks===k.advanceState&&rng===k.rng,
        ownership:k.life.world===k.world&&k.upperLife.upper===k.world.upper};`);
    assert(result.replaced&&result.identity&&result.ownership);assert.deepEqual(result.first,result.second);
    assert.deepEqual(result.second.advance,{upper:0,nether:0,rift:0,wraith:0});return result;
  });
  report.consoleErrors=browser.errors();assert.deepEqual(report.consoleErrors,[]);
  report.screenshot=await browser.screenshot(path.join(output,'g8c1-save-acceptance.png'));
  report.pass=true;
} catch(error) {
  report.error=error.stack;process.exitCode=1;console.error(error);
  if(browser) { report.consoleErrors=browser.errors();try{report.screenshot=await browser.screenshot(path.join(output,'g8c1-failure.png'));}catch{} }
} finally {
  if(browser){await browser.close();report.browser=browser.meta;}
  if(server)server.kill();
  report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'acceptance.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({pass:report.pass,checks:report.checks.length,output}));
}
