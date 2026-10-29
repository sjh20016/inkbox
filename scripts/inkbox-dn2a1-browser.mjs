#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
import {launch,findEdge,sleep} from './cdp.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.INKBOX_PORT||4263),base=process.env.INKBOX_URL||`http://127.0.0.1:${port}`;
const out=path.resolve(process.env.INKBOX_REPORT_DIR||path.join(root,'reports/local/dn2a1/browser'));
const smoke=process.argv.includes('--smoke'),skipPerf=process.argv.includes('--skip-perf');
const report={pass:false,checks:[],screenshots:[],performance:[],
  browserPath:'Browser plugin not available; existing owned Edge/CDP workflow',
  flow:'Strata lab -> four comparison presets -> three visual controls -> white breath at real low cliff foot',
  limitations:['Read-only preview; CPU submission is not GPU execution time.','No particles or simulation flame.']};
const sources=['src/inkbox/render3d/nether/NetherInkflame.js','src/inkbox/render3d/nether/NetherSoulfireLayer.js',
  'src/inkbox/render3d/nether/NetherCliffLayer.js','src/inkbox/render3d/art/PigmentTerrainMaterial.js',
  'src/inkbox/render3d/shanhai/TerrainLineArt.js','src/inkbox/render3d/stage/PlaneStage.js','research/nether-strata/preview.js'];
report.source=Object.fromEntries(sources.map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
let browser,server;
const page=code=>browser.js(`return (async()=>{${code}})();`,{timeoutMs:60000});
async function click(selector){const p=await page(`const e=document.querySelector(${JSON.stringify(selector)});const d=e.closest('details');if(d)d.open=true;e.scrollIntoView({block:'nearest'});await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);await browser.click(p.x,p.y);}
async function ready(n=40){assert(await browser.waitFor(`const l=window.netherStrataLab;return !!l?.state.host&&l.state.frames.length>=${n}&&!l.state.host.stages.get('nether').terrainLines?.buildTask&&!l.state.host.cameraRig.focus;`,{timeoutMs:60000}));}
async function shot(name){const file=path.join(out,name+'.jpg');const r=await browser.cdp.send('Page.captureScreenshot',{format:'jpeg',quality:88,captureBeyondViewport:false},60000);fs.writeFileSync(file,Buffer.from(r.data,'base64'));report.screenshots.push(file);console.log('Screenshot '+name);}
async function check(name,fn){const evidence=await fn();report.checks.push({name,pass:true,evidence});console.log('PASS '+name);}
async function look(mode){await click(`[data-look="${mode}"]`);await ready();}
async function generate(size='medium',seed=20260914){await page(`document.getElementById('size').value=${JSON.stringify(size)};document.getElementById('seed').value=${seed};`);await click('#generate button');await ready();}
async function sample(mode,size){await look(mode);await page('netherStrataLab.view("whole");netherStrataLab.state.renderDtOverride=null;netherStrataLab.state.effectTimeOverride=null;netherStrataLab.state.frames=[];');await ready(120);await page('netherStrataLab.state.frames=[];');await ready(120);report.performance.push({mode,preset:size,...await page('return netherStrataLab.metrics();')});console.log('PERF '+size+'/'+mode);}
try{
  fs.mkdirSync(out,{recursive:true});
  if(!process.env.INKBOX_URL){server=spawn(process.execPath,['scripts/inkbox-server.mjs','--port',String(port)],{cwd:root,stdio:'ignore',windowsHide:true});let ok=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/research/nether-strata/index.html')).ok){ok=true;break;}}catch{}await sleep(150);}assert(ok);}
  browser=await launch({browser:findEdge(),url:base+'/research/nether-strata/index.html?version=strata&look=inkflame',width:1440,height:900,gpu:true});await ready();
  await check('identity, content, WebGL and compiled scene',async()=>{const r=await page(`const g=netherStrataLab.state.host.gpu.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {url:location.href,title:document.title,content:document.body.innerText.length,controls:document.querySelectorAll('[data-look]').length,notice:document.body.innerText.includes('不写正式存档'),overlay:!!document.querySelector('vite-error-overlay'),gpu:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),viewport:[innerWidth,innerHeight],metrics:netherStrataLab.metrics()};`);assert.match(r.title,/墨焰洗狱/);assert(r.controls===4&&r.notice&&!r.overlay);assert(r.metrics.soulfire.field.lower>0);report.environment=r;return r;});
  await check('same camera four presets and exact world preservation',async()=>{
    await page('window.__heights=netherStrataLab.state.world.height.slice();window.__camera=netherStrataLab.metrics().camera;');
    const modes=[];for(const mode of ['legacy','tone','static','inkflame']){await look(mode);await shot('whole-'+mode);const m=await page('return netherStrataLab.metrics();');assert.equal(m.look,mode);assert.equal(m.day,0);assert(await page('return netherStrataLab.state.world.height.every((v,i)=>v===__heights[i]);'));const c=await page('return __camera;');assert.deepEqual(m.camera,c);modes.push(m);}return modes;
  });
  for(const kind of ['plateau','cliff','abyss','foot'])await check('native view '+kind,async()=>{await click(`[data-view="${kind}"]`);if(kind!=='plateau')await click('[data-distance="close"]');await ready();await shot('inkflame-'+kind);return page('return netherStrataLab.metrics();');});
  await check('same foot camera soulfire off, static and flow',async()=>{
    const modes=[];await page('document.querySelector(".effect-controls").open=true;netherStrataLab.state.effectTimeOverride=20;');
    for(const mode of ['off','static','flow']){await page(`document.getElementById('soulfire').value=${JSON.stringify(mode)};document.getElementById('soulfire').dispatchEvent(new Event('change',{bubbles:true}));`);await ready();await shot('foot-soulfire-'+mode);modes.push(await page('return netherStrataLab.metrics();'));}
    assert(modes[0].soulfire.instances<=24&&modes[2].soulfire.instances>0);return modes;
  });
  if(!smoke){
    await check('only flow changes pixels when the old render clocks are held',async()=>{
      await page('netherStrataLab.state.renderDtOverride=0;');
      const clip=await page(`const r=document.getElementById('scene').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};`);
      async function digest(mode,time){
        await page(`document.getElementById('soulfire').value=${JSON.stringify(mode)};netherStrataLab.applyToggles();netherStrataLab.state.effectTimeOverride=${time};for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);`);await ready();
        const r=await browser.cdp.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:false},60000);
        const bytes=Buffer.from(r.data,'base64');fs.writeFileSync(path.join(out,`motion-${mode}-${time}.png`),bytes);
        const pixels=await page(`const blob=await(await fetch('data:image/png;base64,${r.data}')).blob(),im=await createImageBitmap(blob),c=new OffscreenCanvas(im.width,im.height),g=c.getContext('2d');g.drawImage(im,0,0);const data=g.getImageData(0,0,im.width,im.height).data;im.close();let max=0,changed=0,significant=0,total=0;if(${time}===0)window.__nfPixels=data;else for(let i=0;i<data.length;i+=4){let delta=0;for(let k=0;k<3;k++){const d=Math.abs(data[i+k]-__nfPixels[i+k]);delta=Math.max(delta,d);total+=d;}max=Math.max(max,delta);if(delta)changed++;if(delta>1)significant++;}return {max,changed,significant,mean:total/(data.length*.75),pixels:data.length/4};`);
        return {sha256:createHash('sha256').update(bytes).digest('hex'),...pixels};
      }
      const static0=await digest('static',0),static60=await digest('static',60);
      // Repeated GPU screenshots can differ by one output byte at a handful of
      // antialiased edges. Require no larger difference, not identical PNG bytes.
      assert(static60.max<=1&&static60.changed/static60.pixels<.001,'static ignores presentation time within one-byte edge quantization');
      const flow0=await digest('flow',0),flow60=await digest('flow',60);
      assert(flow60.significant>1000&&flow60.mean>static60.mean*10,'flow produces actual GPU pixel motion above static quantization');
      await page('netherStrataLab.state.renderDtOverride=null;netherStrataLab.state.effectTimeOverride=null;');
      return {static0,static60,flow0,flow60};
    });
    await check('flow has a visual time but no topology or world changes',async()=>{
      await look('inkflame');const before=await page('return netherStrataLab.metrics();');
      await page('netherStrataLab.state.effectTimeOverride=60;netherStrataLab.state.frames=[];');await ready();await shot('foot-flow-later');
      const after=await page('return netherStrataLab.metrics();');assert.equal(before.soulfire.rebuilds,after.soulfire.rebuilds);assert.equal(before.soulfire.instanceWrites,after.soulfire.instanceWrites);assert.equal(before.cliffs.rebuilds,after.cliffs.rebuilds);assert.equal(after.day,0);return {before,after};
    });
    await check('original DN2A rollback releases new field and overlay',async()=>{
      await look('inkflame');await page(`const f=netherStrataLab.state.host.stages.get('nether').netherInkflame;window.__released=0;f.texture.addEventListener('dispose',()=>__released++);f.geometry.addEventListener('dispose',()=>__released++);f.material.addEventListener('dispose',()=>__released++);`);
      await look('legacy');assert(await page(`const s=netherStrataLab.state.host.stages.get('nether');return !s.netherInkflame&&__released===3&&s.terrain.inkMaterial.uniforms.nfOptions.value.toArray().every(v=>v===0);`));return page('return netherStrataLab.metrics();');
    });
    for(const size of ['small','medium','large','expanse'])for(const seed of [0,1,42])await check('rendered family '+size+'/'+seed,async()=>{await look('inkflame');await generate(size,seed);const m=await page('return netherStrataLab.metrics();');assert(m.soulfire.field.upper>0&&m.soulfire.field.lower>0&&m.soulfire.instances<=24);if((size==='medium'&&seed===42)||(size==='expanse'&&seed===1))await shot(size+'-'+seed);return m;});
    await check('narrow native controls',async()=>{for(const width of [768,430]){await browser.cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await look('inkflame');await click('[data-view="abyss"]');await ready();await shot('narrow-'+width);assert(await page('return document.documentElement.scrollWidth<=innerWidth;'));}await browser.cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});return true;});
    if(!skipPerf)for(const size of ['medium','expanse']){await generate(size);for(const mode of ['legacy','tone','static','inkflame','inkflame','static','tone','legacy'])await sample(mode,size);}
    await check('Host disposal releases field and plume resources',async()=>{await look('inkflame');return page(`const l=netherStrataLab,s=l.state.host.stages.get('nether'),f=s.netherInkflame;let disposed=0;for(const r of [f.texture,f.geometry,f.material])r.addEventListener('dispose',()=>disposed++);l.dispose();if(disposed!==3||s.root.children.length)throw Error('Inkflame resources retained');return {disposed,rootChildren:s.root.children.length};`);});
  }
  report.errors=browser.errors();assert.deepEqual(report.errors,[]);report.pass=true;
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error);if(browser){report.diagnostic=await page('return {url:location.href,title:document.title,text:document.body.innerText.slice(0,1400)};').catch(()=>null);await shot('failure').catch(()=>{});}}
finally{if(browser){report.errors=browser.errors();report.browser={...browser.meta,ownedProfile:browser.userDataDir,launcherPid:browser.child.pid};report.cleanup=await browser.close();if(!report.cleanup.complete)report.pass=false;}server?.kill();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,smoke?'smoke.json':'acceptance.json'),JSON.stringify(report,null,2));}
