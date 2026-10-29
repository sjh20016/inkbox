#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { launch, findEdge, sleep } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.INKBOX_PORT || 4261);
const base = process.env.INKBOX_URL || `http://127.0.0.1:${port}`;
const out = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(root,'reports/local/dn2a/browser'));
const smoke = process.argv.includes('--smoke'), skipPerf = process.argv.includes('--skip-perf');
const controlsOnly = process.argv.includes('--controls-only');
const report = { pass:false, checks:[], screenshots:[], performance:[],
  browserPath:'Browser plugin not available; repository owned Edge/CDP workflow',
  flow:'Open the strata lab -> choose candidate/seed -> inspect three landforms -> switch cliff geometry and brush -> observe actual WebGL',
  limitations:['CPU submission is not GPU execution time.','Read-only candidate, no simulation or save export.'] };
const digest = file => createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
report.source = Object.fromEntries(['src/inkbox/world/netherStrataCandidate.js','src/inkbox/render3d/nether/NetherCliffLayer.js',
  'src/inkbox/render3d/art/PigmentTerrainMaterial.js','src/inkbox/render3d/shanhai/ShanhaiStyle.js',
  'src/inkbox/render3d/stage/PlaneStage.js','research/nether-strata/preview.js'].map(f=>[f,digest(f)]));
let server, browser;
const page = code => browser.js(`return (async()=>{${code}})();`,{timeoutMs:60000});
async function click(selector) {
  const p = await page(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing control');const d=e.closest('details');if(d)d.open=true;e.scrollIntoView({block:'nearest'});await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect();if(!r.width||!r.height)throw Error('Hidden control');return {x:r.x+r.width/2,y:r.y+r.height/2};`);
  await browser.click(p.x,p.y);
}
async function ready(frames=35) {
  assert(await browser.waitFor(`const l=window.netherStrataLab;return !!l?.state.host&&l.state.frames.length>=${frames}&&!l.state.host.stages.get('nether').terrainLines?.buildTask;`,{timeoutMs:60000}),'real renderer ready');
}
async function shot(name) {
  const file = path.join(out,name+'.jpg');
  const r = await browser.cdp.send('Page.captureScreenshot',{format:'jpeg',quality:88,captureBeyondViewport:false},60000);
  fs.writeFileSync(file,Buffer.from(r.data,'base64')); report.screenshots.push(file); console.log('Screenshot '+name);
}
async function check(name,fn) { const evidence=await fn();report.checks.push({name,pass:true,evidence});console.log('PASS '+name); }
async function generate({version='strata',size='medium',seed=20260914,style='strata',cliffs=true}={}) {
  await page(`document.getElementById('version').value=${JSON.stringify(version)};document.getElementById('size').value=${JSON.stringify(size)};document.getElementById('seed').value=${seed};document.getElementById('inkStyle').value=${JSON.stringify(style)};document.getElementById('cliffs').checked=${cliffs};`);
  await click('#generate button'); await ready();
}
async function sample(mode,size) {
  const modes={A:{version:'dn1',style:'brush',cliffs:false},B:{style:'brush',cliffs:false},C:{style:'brush',cliffs:true},D:{style:'strata',cliffs:true}};
  await generate({...modes[mode],size});
  await ready(120); await page('netherStrataLab.state.frames=[];'); await ready(120);
  report.performance.push({mode,size,...await page('return netherStrataLab.metrics();')});
  console.log('PERF '+size+'/'+mode);
}
try {
  fs.mkdirSync(out,{recursive:true});
  if (!process.env.INKBOX_URL) {
    server=spawn(process.execPath,['scripts/inkbox-server.mjs','--port',String(port)],{cwd:root,stdio:'ignore',windowsHide:true});
    let ok=false; for(let i=0;i<80;i++){try{if((await fetch(base+'/research/nether-strata/index.html')).ok){ok=true;break;}}catch{}await sleep(150);}assert(ok,'owned server ready');
  }
  browser=await launch({browser:findEdge(),url:base+'/research/nether-strata/index.html?version=strata&look=legacy',width:1440,height:900,gpu:true});
  await ready();
  await check('page identity, meaningful content, WebGL and overlay',async()=>{
    const r=await page(`const g=netherStrataLab.state.host.gpu.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {title:document.title,url:location.href,content:document.body.innerText.length,overlay:!!document.querySelector('vite-error-overlay'),gpu:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),viewport:[innerWidth,innerHeight],metrics:netherStrataLab.metrics()};`);
    assert.match(r.title,/叠狱成形/);assert(r.content>250);assert(!r.overlay);assert(r.metrics.triangles>1000);report.environment=r;return r;
  });
  await shot('strata-full-20260914');
  if(controlsOnly)await check('native right pan, middle orbit and wheel zoom',async()=>{
    const p=await page(`const r=document.getElementById('scene').getBoundingClientRect();return {x:r.x+r.width*.55,y:r.y+r.height*.55};`);
    const before=await page('return netherStrataLab.metrics().camera;');
    async function drag(button,buttons,dx,dy){
      await browser.cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button,buttons,x:p.x,y:p.y,clickCount:1});
      for(let i=1;i<=5;i++)await browser.cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',button,buttons,x:p.x+dx*i/5,y:p.y+dy*i/5});
      await browser.cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button,buttons:0,x:p.x+dx,y:p.y+dy,clickCount:1});
    }
    await drag('right',2,60,25);const pan=await page('return netherStrataLab.metrics().camera;');
    assert(pan.target.some((v,i)=>Math.abs(v-before.target[i])>1),'right drag pans target');
    await drag('middle',4,75,10);const orbit=await page('return netherStrataLab.metrics().camera;');
    assert(orbit.position.some((v,i)=>Math.abs(v-pan.position[i])>1),'middle drag orbits');
    await browser.cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:p.x,y:p.y,deltaX:0,deltaY:-500});
    const zoom=await page('return netherStrataLab.metrics().camera;');assert(zoom.zoom>orbit.zoom,'wheel zooms');
    await click('[data-view="whole"]');return {before,pan,orbit,zoom};
  });
  if(!controlsOnly)for(const kind of ['plateau','cliff','abyss']) await check('native landmark '+kind,async()=>{
    await click(`[data-view="${kind}"]`);assert(await browser.waitFor(`return !netherStrataLab.state.host.cameraRig.focus;`));
    if(kind!=='plateau')await click('[data-distance="close"]');
    assert(await browser.waitFor(`return !netherStrataLab.state.host.cameraRig.focus;`));await ready();await shot('strata-'+kind);
    return page('return {landmark:netherStrataLab.state.landmark,status:document.getElementById("status").textContent,metrics:netherStrataLab.metrics()};');
  });
  if(!smoke&&!controlsOnly){
    await check('cliff off/on preserves world, topology and idle cache',async()=>{
      await page(`window.__height=netherStrataLab.state.world.height.slice();window.__builds=netherStrataLab.state.host.stages.get('nether').netherCliffs.stats.rebuilds;`);
      await click('#cliffs');assert(await page(`return !netherStrataLab.state.host.stages.get('nether').netherCliffs.group.visible;`));
      await shot('cliff-off');await click('#cliffs');await ready();
      assert(await page(`return netherStrataLab.state.world.height.every((v,i)=>v===__height[i])&&netherStrataLab.state.host.stages.get('nether').netherCliffs.stats.rebuilds===__builds;`));return page('return netherStrataLab.metrics();');
    });
    await check('same camera D-N1 brush / strata / line drawing',async()=>{
      const before=await page('return netherStrataLab.metrics().camera;');
      for(const style of ['brush','strata','line-a']){
        await page(`document.getElementById('inkStyle').value=${JSON.stringify(style)};document.getElementById('inkStyle').dispatchEvent(new Event('change',{bubbles:true}));`);
        await ready();const camera=await page('return netherStrataLab.metrics().camera;');
        assert(Math.abs(camera.zoom-before.zoom)<1e-8&&camera.position.every((v,i)=>Math.abs(v-before.position[i])<1e-8)&&camera.target.every((v,i)=>Math.abs(v-before.target[i])<1e-8));await shot('same-camera-'+style);
      }return true;
    });
    await generate({version:'dn1',style:'brush',cliffs:false});await shot('dn1-full-20260914');
    for(const seed of [1,42]){await generate({seed});await shot('strata-full-'+seed);}
    for(const size of ['small','large','expanse'])await check('rendered size '+size,async()=>{
      await generate({size});const m=await page('return netherStrataLab.metrics();');assert(m.cliffs.triangles<=(size==='small'?8000:20000));
      if(size==='expanse')await shot('strata-expanse');return m;
    });
    await check('narrow layout, native camera controls and seed zero',async()=>{
      await generate({seed:0});
      for(const width of [768,430]){
        await browser.cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        await click('[data-view="abyss"]');await click('[data-distance="close"]');
        assert(await browser.waitFor('return !netherStrataLab.state.host.cameraRig.focus;'));await shot('narrow-'+width);
        assert(await page('return document.documentElement.scrollWidth<=innerWidth&&document.getElementById("scene").getBoundingClientRect().width>100;'));
      }
      await browser.cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});return true;
    });
    await check('repeated Host replacement has bounded resources',async()=>{
      await generate();const first=await page('return netherStrataLab.metrics().memory;');await generate();await generate();
      const last=await page('return netherStrataLab.metrics().memory;');assert(last.geometries<=first.geometries+2);assert(last.textures<=first.textures+2);return {first,last};
    });
    if(!skipPerf)for(const size of ['medium','expanse'])for(const mode of ['A','B','C','D','D','C','B','A'])await sample(mode,size);
    await check('Stage disposal releases owned cliff resources',async()=>{
      await generate();return page(`const l=netherStrataLab,s=l.state.host.stages.get('nether'),c=s.netherCliffs;let geometry=0,material=0;c.geometry.addEventListener('dispose',()=>geometry++);c.material.addEventListener('dispose',()=>material++);l.dispose();if(!geometry||!material||s.root.children.length)throw Error('Stage retained resources');return {geometry,material,rootChildren:s.root.children.length};`);
    });
  }
  report.errors=browser.errors();assert.deepEqual(report.errors,[]);report.pass=true;
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error);if(browser){report.diagnostic=await page('return {title:document.title,url:location.href,text:document.body.innerText.slice(0,1200)};').catch(()=>null);await shot('failure').catch(()=>{});}}
finally{if(browser){report.errors=browser.errors();report.browser=browser.meta;report.cleanup=await browser.close();}server?.kill();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,controlsOnly?'controls.json':smoke?'smoke.json':'acceptance.json'),JSON.stringify(report,null,2));}
