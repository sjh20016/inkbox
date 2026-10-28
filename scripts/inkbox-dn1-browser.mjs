#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { launch, findEdge, sleep } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.INKBOX_PORT || 4257);
const base = process.env.INKBOX_URL || `http://127.0.0.1:${port}`;
const out = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(root, 'reports/local/dn1/browser'));
const smoke = process.argv.includes('--smoke');
const productOnly = process.argv.includes('--product-only');
const skipPerf = process.argv.includes('--skip-perf');
const report = { checks: [], screenshots: [], performance: [], pass: false,
  browserPath: 'Browser plugin not available; repository Edge/CDP workflow',
  limitations: ['CPU submit time is not GPU execution time.', 'Isolated candidate editor has no simulation or product save export.'] };
function sourceHash(relative) {
  const hash = createHash('sha256');
  const walk = dir => { for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const child = path.posix.join(dir, entry.name); if (entry.isDirectory()) walk(child); else if (entry.isFile()) hash.update(child).update(fs.readFileSync(path.join(root, child)));
  } };
  walk(relative); return hash.digest('hex');
}
report.source = { render3d: sourceHash('src/inkbox/render3d'), world: sourceHash('src/inkbox/world'), ui: sourceHash('src/inkbox/ui'), performanceSkipped: skipPerf };
let server, browser;
const page = code => browser.js(`return (async()=>{${code}})();`, { timeoutMs: 90000 });
async function click(selector) {
  const p = await page(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing control');e.scrollIntoView({block:'nearest'});await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect();if(!r.width||!r.height)throw Error('Control is hidden: '+${JSON.stringify(selector)});return {x:r.x+r.width/2,y:r.y+r.height/2};`);
  await browser.click(p.x, p.y);
}
async function ready() {
  assert(await browser.waitFor('const s=window.netherLab?.state;return !!s?.host && s.frames.length>=20 && !s.host.stages.get("nether").terrainLines?.buildTask;', { timeoutMs: 60000 }));
}
async function regenerate(version, size = 'medium') {
  await page(`document.getElementById('version').value=${JSON.stringify(version)};document.getElementById('size').value=${JSON.stringify(size)};`);
  await click('#generate button'); await ready();
}
async function shot(name) {
  const file = path.join(out, name + '.jpg');
  const result = await browser.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, captureBeyondViewport: false }, 60000);
  fs.writeFileSync(file, Buffer.from(result.data, 'base64')); report.screenshots.push(file); console.log('Screenshot saved: ' + name + '.jpg');
}
async function check(name, run) { const evidence = await run(); report.checks.push({ name, pass: true, evidence }); console.log('PASS ' + name); }
async function sample(label, size, enabled) {
  await page(`const l=netherLab,s=l.state.host.stages.get('nether');document.getElementById('landscape').checked=${enabled};document.getElementById('inkStyle').value=${enabled}?'brush':'line-c';l.applyToggles();l.view('whole');l.state.frames=[];`);
  assert(await browser.waitFor('return netherLab.state.frames.length>=120;', { timeoutMs: 45000 }));
  await page('netherLab.state.frames=[];');
  assert(await browser.waitFor('return netherLab.state.frames.length>=120;', { timeoutMs: 45000 }));
  report.performance.push({ label, size, enabled, ...await page('return netherLab.metrics();') });
}
try {
  fs.mkdirSync(out, { recursive: true });
  if (!process.env.INKBOX_URL) {
    server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(port)], { cwd: root, stdio: 'ignore', windowsHide: true });
    let ok = false;
    for (let i = 0; i < 80; i++) { try { if ((await fetch(base + '/inkbox.html')).ok) { ok = true; break; } } catch {} await sleep(150); }
    assert(ok, 'owned server is ready');
  }
  browser = await launch({ browser: findEdge(), url: base + '/research/nether-landscape/index.html', width: 1440, height: 900, gpu: true });
  if (!productOnly) {
  await ready();
  await check('preview identity, WebGL, meaningful first screen', async () => {
    const result = await page(`const g=netherLab.state.host.gpu.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {url:location.href,title:document.title,content:document.body.innerText.length,overlay:!!document.querySelector('vite-error-overlay'),gpu:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),timerQuery:!!g.getExtension('EXT_disjoint_timer_query_webgl2'),viewport:[innerWidth,innerHeight],metrics:netherLab.metrics()};`);
    assert.match(result.title, /幽冥造境/); assert(result.content > 200); assert(!result.overlay); report.environment = result; return result;
  });
  await shot('candidate-full');
  if (smoke) for (const kind of ['ridge', 'river']) { await click(`[data-view="${kind}"]`); await sleep(650); await shot('candidate-' + kind); }
  if (!smoke) {
    await check('legacy generation and visual rollback', async () => {
      await regenerate('legacy');
      await click('#landscape'); await shot('legacy-full');
      await page('window.__dn1Original=netherLab.state.world.height.slice();');
      await click('#landscape');
      assert(await page('return netherLab.state.world.height.every((v,i)=>v===__dn1Original[i]);'));
      await shot('legacy-new-visual-full'); return page('return netherLab.metrics();');
    });
    await regenerate('candidate');
    for (const kind of ['river', 'ridge', 'valley', 'waste']) {
      await check('native viewpoint ' + kind, async () => { await click(`[data-view="${kind}"]`); await sleep(650); await shot('candidate-' + kind); return page('return {text:document.getElementById("status").textContent,metrics:netherLab.metrics()};'); });
    }
    await check('native terrain stroke, undo, redo and cancel', async () => {
      await page('window.__dn1Before=netherLab.state.world.height.slice();document.getElementById("tool").value="raise";');
      const point = await page(`const s=netherLab.state,h=s.host,p=s.points.waste,e=h.stages.get('nether').elevation.at(p.x,p.y),r=document.getElementById('scene').getBoundingClientRect();const v=h.cameraRig.controls.target.clone().set(p.x-(s.world.w-1)/2,e,p.y-(s.world.h-1)/2).project(h.cameraRig.camera);return {x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};`);
      await shot('edit-before'); await browser.click(point.x, point.y);
      assert(await browser.waitFor('return !!netherLab.state.lastEdit?.changed;'));
      await sleep(800); await shot('edit-after');
      assert(await page('return netherLab.state.world.height.some((v,i)=>v!==__dn1Before[i]);'));
      await click('#undo'); assert(await page('return netherLab.state.world.height.every((v,i)=>v===__dn1Before[i]);'));
      await click('#redo'); assert(await page('return netherLab.state.world.height.some((v,i)=>v!==__dn1Before[i]);'));
      await click('#cancel'); assert(await page('return netherLab.state.world.height.every((v,i)=>v===__dn1Before[i]);'));
      return page('return {lastEdit:netherLab.state.lastEdit,day:netherLab.state.world.day,metrics:netherLab.metrics()};');
    });
    await check('tour and display controls', async () => {
      await click('[data-view="tour"]'); await sleep(400); await click('[data-view="whole"]');
      await click('#ecology'); assert(await page('return !netherLab.state.host.stages.get("nether").scenery.group.visible;')); await click('#ecology');
      await click('#lines'); assert(await page('return !netherLab.state.host.stages.get("nether").terrainLines.group.visible;')); await click('#lines');
      assert.equal(await page('return netherLab.state.world.day;'), 0); return true;
    });
    for (const size of ['small', 'large', 'expanse']) await check('actual rendered size ' + size, async () => {
      await regenerate('candidate', size); const m = await page('return netherLab.metrics();');
      assert(m.river.quads > 0 && m.river.quads < m.size[0] * m.size[1] / 4); assert(m.mist.instances <= 24); return m;
    });
    for (const size of skipPerf ? [] : ['medium', 'expanse']) {
      await regenerate('legacy', size);
      for (const [i, enabled] of [false, true, true, false].entries()) await sample('ABBA-' + i, size, enabled);
    }
    await check('narrow preview viewport', async () => {
      await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: 768, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(400); await shot('narrow-preview');
      const result = await page('return {w:innerWidth,scroll:document.documentElement.scrollWidth,canvas:document.getElementById("scene").getBoundingClientRect().width};'); assert(result.scroll <= result.w && result.canvas > 400); return result;
    });
    }
  }
  if (!smoke) {
    await check('formal creation, full nether, scenery control and Canvas fact parity', async () => {
      await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await browser.cdp.send('Page.navigate', { url: base + '/inkbox.html?renderer=3d' });
      assert(await browser.waitFor('return !!window.inkbox?.creationMenu && !!inkbox.render3d?.active;', { timeoutMs: 60000 }));
      await click('[data-action="open-create"]');
      await page(`const f=document.querySelector('.g2-creation__page:not([hidden]) form');f.querySelector('input[aria-label="世界种子"]').value='20260914';const s=f.querySelectorAll('select');s[0].value='small';s[1].value='standard';f.querySelector('input[type="checkbox"]').checked=false;`);
      await click('.g2-creation__page:not([hidden]) button[type="submit"]');
      if (await page('return inkbox.qol.confirmOpen();')) await click('#inkConfirmOk');
      assert(await browser.waitFor('return inkbox.world.seed===20260914 && inkbox.world.w===200;'));
      await click('#inkSpeedBar [data-speed="0"]');
      const mortalPaper = await page('return getComputedStyle(document.body).getPropertyValue("--paper").trim().toLowerCase();');
      await click('[data-realm-plane="nether"]');
      assert(await browser.waitFor('const s=inkbox.render3d.renderer.stages.get("nether");return inkbox.render3d.renderer.activePlane==="nether" && !!s.netherRiver?.mesh.visible;'));
      const theme = await page(`const b=getComputedStyle(document.body),r=getComputedStyle(document.querySelector('.rail.right'));
        return {realm:document.body.dataset.r1Realm,paper:b.getPropertyValue('--paper').trim().toLowerCase(),ink:b.getPropertyValue('--ink').trim().toLowerCase(),desk:b.getPropertyValue('--desk').trim().toLowerCase(),seal:b.getPropertyValue('--cin').trim().toLowerCase(),railBackground:r.backgroundColor,railColor:r.color};`);
      assert.equal(theme.paper, '#25221e'); assert.equal(theme.ink, '#ece3cf'); assert.equal(theme.seal, '#d0583f');
      assert.equal(theme.railBackground, 'rgb(37, 34, 30)');
      const secondary = await page(`return {catalog:getComputedStyle(document.querySelector('.wanling-details')).color,guideButton:getComputedStyle(document.getElementById('inkBusanziAcknowledge')).color,scheme:getComputedStyle(document.body).colorScheme};`);
      assert.equal(secondary.catalog, 'rgb(212, 202, 182)'); assert.equal(secondary.guideButton, 'rgb(212, 202, 182)'); assert.equal(secondary.scheme, 'dark');
      await click('[data-r1-group="terrain"]');
      await shot('product-nether-tools');
      await click('#inkRender3DTools [data-scenery]');
      assert(await page('const s=inkbox.render3d.renderer.stages.get("nether");return !s.scenery.group.visible && !s.netherEcology.group.visible && s.netherRiver.mesh.visible;'));
      await click('#inkRender3DTools [data-scenery]');
      await click('#r1NativeArts .r1-arts-close');
      await click('#inkBtnHelp');
      assert(await browser.waitFor('return !document.getElementById("inkHelp").hidden;'));
      assert.equal(await page('return getComputedStyle(document.querySelector(".help-card")).backgroundColor;'), 'rgb(37, 34, 30)');
      await click('#inkHelpClose');
      await page(`const {serializeWorld}=await import('/src/inkbox/io/save.js');window.__dn1ProductSnapshot=JSON.stringify(serializeWorld(inkbox.world));`);
      await shot('product-nether');
      await page(`const h=inkbox.render3d.renderer,w=inkbox.world.nether;let best=-Infinity,p=null;for(let y=8;y<w.h-8;y+=2)for(let x=8;x<w.w-8;x+=2){const score=w.height[y*w.w+x]-Math.hypot(x-w.w/2,y-w.h/2)/w.w*.25;if(score>best){best=score;p={x,y};}}h.cameraRig.scenic(1);h.cameraRig.camera.zoom=4;h.cameraRig.camera.updateProjectionMatrix();h.focusOn(p.x,p.y,{duration:.15},'nether');`);
      await sleep(600); await shot('product-nether-mountain');
      await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: 680, height: 720, deviceScaleFactor: 1, mobile: false });
      await sleep(300); await shot('product-nether-narrow');
      assert(await page('return document.documentElement.scrollWidth<=innerWidth && document.body.dataset.r1Realm==="nether";'));
      await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await click('[data-realm-plane="upper"]');
      assert(await page('return document.body.dataset.r1Realm==="upper" && getComputedStyle(document.body).getPropertyValue("--paper").trim().toLowerCase()==="#f0f0e8";'));
      await click('[data-realm-plane="mortal"]');
      assert.equal(await page('return getComputedStyle(document.body).getPropertyValue("--paper").trim().toLowerCase();'), mortalPaper);
      await click('[data-realm-plane="nether"]');
      await click('#inkRender3DTools [data-action="toggle"]');
      assert(await browser.waitFor('return !inkbox.render3d?.active;'));
      assert(await page(`const {serializeWorld}=await import('/src/inkbox/io/save.js');return JSON.stringify(serializeWorld(inkbox.world))===__dn1ProductSnapshot;`));
      assert(await page('return document.body.dataset.r1Realm==="mortal";'));
      return { theme, secondary, canvas: await page('return {title:document.title,url:location.href,seed:inkbox.world.seed,day:inkbox.world.day,renderer:document.getElementById("inkInfoRenderer").textContent};') };
    });
  }
  report.errors = browser.errors(); assert.deepEqual(report.errors, []); report.pass = true;
} catch (error) {
  report.error = error.stack; process.exitCode = 1; console.error(error);
  if (browser) { report.diagnostic = await page('return {url:location.href,title:document.title,text:document.body.innerText.slice(0,1200)};').catch(() => null); await shot('failure').catch(() => {}); }
}
finally {
  if (browser) { report.browser = browser.meta; report.errors = browser.errors(); report.cleanup = await browser.close(); }
  server?.kill(); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, smoke ? 'smoke.json' : 'acceptance.json'), JSON.stringify(report, null, 2));
}
