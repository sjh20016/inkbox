#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import{fileURLToPath}from'node:url';
import{spawn}from'node:child_process';import{createHash}from'node:crypto';
import{launch,findEdge,sleep}from'./cdp.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.INKBOX_PORT||4265),base=process.env.INKBOX_URL||`http://127.0.0.1:${port}`;
const out=path.resolve(process.env.INKBOX_REPORT_DIR||'reports/local/dn2a2/browser');
const smoke=process.argv.includes('--smoke'),skipPerf=process.argv.includes('--skip-perf');
const report={pass:false,checks:[],screenshots:[],performance:[],browserPath:'Browser plugin not available; repository owned Edge/CDP e2e',flow:'gallery -> geometry comparison -> A/B/C and blocks -> details / flame -> fixed-time movement -> angles / input / disposal'};
const source=['src/inkbox/world/netherStrataCandidate.js','src/inkbox/render3d/nether/NetherInkflame.js','src/inkbox/render3d/nether/NetherSoulfireLayer.js','src/inkbox/render3d/nether/NetherCliffLayer.js','src/inkbox/render3d/art/PigmentTerrainMaterial.js','src/inkbox/render3d/shanhai/ShanhaiStyle.js','src/inkbox/render3d/shanhai/TerrainLineArt.js','src/inkbox/render3d/shanhai/ShanhaiAtmosphere.js','src/inkbox/render3d/shanhai/ShanhaiSceneryLayer.js','src/inkbox/render3d/stage/PlaneStage.js','src/inkbox/render3d/terrain/TerrainSideLayer.js','research/nether-strata/preview.js','research/nether-strata/index.html','research/nether-strata/preview.css'];
report.source=Object.fromEntries(source.map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
let browser,server;
const page=code=>browser.js(`return(async()=>{${code}})();`,{timeoutMs:60000});
const consoleMessages=type=>browser.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type===type).map(e=>e.params.args.map(a=>a.value??a.description??'').join(' '));
const errors=()=>[...browser.errors(),...consoleMessages('error')];
async function ready(n=35){assert(await browser.waitFor(`const l=window.netherStrataLab;return !!l?.state.host&&l.state.frames.length>=${n}&&!l.state.host.stages.get('nether').terrainLines?.buildTask&&!l.state.host.cameraRig.focus;`,{timeoutMs:60000}),'real WebGL scene ready');}
async function settle(){await page('for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);');}
async function click(selector){const p=await page(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing control');const d=e.closest('details');if(d)d.open=true;e.scrollIntoView({block:'nearest'});await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);await browser.click(p.x,p.y);}
async function set(values,regenerate=false){await page(`const l=netherStrataLab;for(const[id,value]of Object.entries(${JSON.stringify(values)})){const e=document.getElementById(id);if(typeof value==='boolean')e.checked=value;else e.value=value;}if(${regenerate})l.regenerate({preserveCamera:true});else l.applyToggles();`);await ready();await settle();}
async function shot(name){const r=await browser.cdp.send('Page.captureScreenshot',{format:'jpeg',quality:90,captureBeyondViewport:false},60000);fs.writeFileSync(path.join(out,name+'.jpg'),Buffer.from(r.data,'base64'));report.screenshots.push(name+'.jpg');console.log('SHOT '+name);}
async function check(name,fn){const evidence=await fn();report.checks.push({name,pass:true,evidence});console.log('PASS '+name);}
async function art(name){await click(`[data-art="${name}"]`);await ready();await settle();}
async function view(name,close=false){await click(`[data-view="${name}"]`);if(close)await click('[data-distance="close"]');await ready();}
async function sample(mode,size){
  await set({size,seed:20260914,version:mode==='baseline'?'strata':'ink-art',artStyle:mode==='baseline'?'legacy':'cangmo',inkStyle:mode==='baseline'?'strata':'ink-art',tone:'inkflame',blocks:false,detailsInk:mode!=='static',soulfire:mode==='full'||mode==='baseline'?'flow':'off',flameLevel:'pale',cliffInk:'full',lowMist:true,ecology:true,cliffs:true,background:true,floating:true,backdrop:'gradient'},true);
  await page('const l=netherStrataLab;l.view("whole");l.state.renderDtOverride=null;l.state.effectTimeOverride=null;l.state.frames=[];');await ready(120);await page('netherStrataLab.state.frames=[];');await ready(120);
  report.performance.push({mode,preset:size,...await page('return netherStrataLab.metrics();')});console.log('PERF '+size+'/'+mode);
}
try{
  fs.mkdirSync(out,{recursive:true});
  if(!process.env.INKBOX_URL){server=spawn(process.execPath,['scripts/inkbox-server.mjs','--port',String(port)],{cwd:root,stdio:'ignore',windowsHide:true});let ok=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/research/nether-strata/index.html')).ok){ok=true;break;}}catch{}await sleep(150);}assert(ok);}
  browser=await launch({browser:findEdge(),url:base+'/research/nether-strata/index.html',width:1440,height:900,gpu:true});await ready();
  await check('page identity, meaningful controls, no overlay and real GPU',async()=>{const r=await page(`const h=netherStrataLab.state.host,g=h.gpu.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return{title:document.title,url:location.href,controls:document.querySelectorAll('[data-art]').length,notice:document.body.innerText.includes('不写正式存档'),overlay:!!document.querySelector('vite-error-overlay'),gpu:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),programs:h.gpu.info.programs.map(p=>({name:p.name,diagnostics:p.diagnostics})),metrics:netherStrataLab.metrics()};`);assert.match(r.title,/墨骨归形/);assert(r.controls===4&&r.notice&&!r.overlay);assert.equal(r.metrics.art,'cangmo');report.environment=r;assert(r.programs.every(p=>p.diagnostics?.runnable!==false),'all GPU shader programs compiled');assert.deepEqual(errors(),[]);return r;});
  await art('legacy');await view('whole');await shot('baseline-dn2a1');
  await check('static geometry and repaired thin ridge / bank, fixed cameras',async()=>{
    await art('cangmo');await set({blocks:true});await view('whole');await set({version:'strata'},true);await shot('geometry-before');const before=await page('return netherStrataLab.metrics();');
    await set({version:'ink-art'},true);await shot('geometry-after');const after=await page('return netherStrataLab.metrics();');assert.deepEqual(before.camera,after.camera);
    const points=await page('return netherStrataLab.state.metadata.diagnostics;');
    for(const kind of ['plateau',...points.map(p=>p.kind)]){await view(kind,true);const camera=await page('return netherStrataLab.metrics().camera;');await set({version:'strata'},true);await shot('shape-'+kind+'-before');assert.deepEqual(await page('return netherStrataLab.metrics().camera;'),camera);await set({version:'ink-art'},true);await shot('shape-'+kind+'-after');}
    return {before,after,points};
  });
  await set({blocks:false});await view('whole');
  await check('A B C share exact heightfield, camera and rendering system',async()=>{await page('window.__height=netherStrataLab.state.world.height.slice();window.__camera=netherStrataLab.metrics().camera;');const a=[];for(const mode of ['charcoal','cangmo','white']){await art(mode);await shot('style-'+mode);const m=await page('return netherStrataLab.metrics();');assert.equal(m.art,mode);assert.deepEqual(m.camera,await page('return __camera;'));assert(await page('return netherStrataLab.state.world.height.every((v,i)=>v===__height[i]);'));a.push(m);}return a;});
  await art('cangmo');
  for(const kind of ['plateau','cliff','abyss','foot'])await check('native '+kind,async()=>{await view(kind,true);await shot('cangmo-'+kind);return page('return netherStrataLab.metrics();');});
  await check('details and soulfire toggles preserve world and camera',async()=>{
    await view('cliff',true);const camera=await page('return netherStrataLab.metrics().camera;');await click('#detailsInk');await ready();await shot('details-off');await click('#detailsInk');await ready();await shot('details-on');assert.deepEqual(await page('return netherStrataLab.metrics().camera;'),camera);
    await view('foot',true);const a=[];for(const mode of ['off','static','flow']){await set({soulfire:mode,flameLevel:'roam'});await shot('flame-'+mode);a.push(await page('return netherStrataLab.metrics();'));}assert(a[0].soulfire.instances===0&&a[2].soulfire.instances>0);return a;
  });
  await check('fixed-time animation 0 2 4 6 with old clocks stopped',async()=>{
    await page('netherStrataLab.state.renderDtOverride=0;');
    const clip=await page('const r=document.getElementById("scene").getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:1};');
    async function pixels(mode,time,first){await set({soulfire:mode});await page(`netherStrataLab.state.effectTimeOverride=${time};`);await settle();const r=await browser.cdp.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:false},60000);fs.writeFileSync(path.join(out,`pixels-${mode}-${time}.png`),Buffer.from(r.data,'base64'));return page(`const b=await(await fetch('data:image/png;base64,${r.data}')).blob(),im=await createImageBitmap(b),c=new OffscreenCanvas(im.width,im.height),g=c.getContext('2d');g.drawImage(im,0,0);const d=g.getImageData(0,0,im.width,im.height).data;im.close();let max=0,significant=0,total=0;if(${first})window.__pixels=d;else for(let i=0;i<d.length;i+=4){let v=0;for(let k=0;k<3;k++){const a=Math.abs(d[i+k]-__pixels[i+k]);v=Math.max(v,a);total+=a;}max=Math.max(max,v);if(v>1)significant++;}return{time:${time},max,significant,mean:total/(d.length*.75),pixels:d.length/4};`);}
    const still0=await pixels('static',0,true),still6=await pixels('static',6,false);assert(still6.max<=1&&still6.significant===0);
    const a=[];for(const t of [0,2,4,6]){a.push(await pixels('flow',t,t===0));await shot('motion-'+t);}
    assert(a.slice(1).every(p=>p.significant>1000),'continuous real pixel changes over each fixed-time sample');
    const camera=await page('return netherStrataLab.metrics().camera;');await page('netherStrataLab.state.renderDtOverride=null;netherStrataLab.state.effectTimeOverride=null;');return {still0,still6,frames:a,camera};
  });
  if(!smoke){
    await check('native pan, orbit, wheel and unchanged simulation',async()=>{
      await view('whole');const point=await page('const r=document.getElementById("scene").getBoundingClientRect();return{x:r.x+r.width*.6,y:r.y+r.height*.55};');
      const before=await page('return netherStrataLab.metrics().camera;');
      async function drag(button,buttons,dx,dy){await browser.cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button,buttons,clickCount:1,...point});for(let i=1;i<=8;i++)await browser.cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',button,buttons,x:point.x+dx*i/8,y:point.y+dy*i/8});await browser.cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button,buttons:0,clickCount:1,x:point.x+dx,y:point.y+dy});await settle();}
      await drag('right',2,60,25);const pan=await page('return netherStrataLab.metrics().camera;');assert.notDeepEqual(pan.target,before.target);
      await drag('middle',4,80,18);const orbit=await page('return netherStrataLab.metrics().camera;');assert.notDeepEqual(orbit.position,pan.position);await browser.wheel(point.x,point.y,-400);await settle();const zoom=await page('return netherStrataLab.metrics().camera;');assert.notEqual(zoom.zoom,orbit.zoom);assert.equal(await page('return netherStrataLab.state.world.day;'),0);return {before,pan,orbit,zoom};
    });
    await check('different viewing angles retain depth and flame ownership',async()=>{await view('foot',true);const a=[];for(const polar of [.48,1.16]){await page(`const r=netherStrataLab.state.host.cameraRig,o=r.camera.position.clone().sub(r.controls.target),d=o.length(),yaw=Math.atan2(o.x,o.z);r.camera.position.set(r.controls.target.x+Math.sin(yaw)*Math.sin(${polar})*d,r.controls.target.y+Math.cos(${polar})*d,r.controls.target.z+Math.cos(yaw)*Math.sin(${polar})*d);r.controls.update();`);await settle();await shot('angle-'+polar);a.push(await page('return netherStrataLab.metrics();'));}return a;});
    for(const size of ['small','medium','large','expanse'])for(const seed of [0,1,42])await check('family '+size+'/'+seed,async()=>{await set({size,seed,version:'ink-art'},true);await view('whole');const m=await page('return netherStrataLab.metrics();');assert(m.soulfire.field.upper>0&&m.soulfire.field.lower>0&&m.day===0);assert(m.soulfire.triangles<=576);if((size==='medium'&&seed===42)||(size==='expanse'&&seed===1))await shot(size+'-'+seed);return m;});
    await check('background and floating props have independent visible switches',async()=>{await set({floating:true,background:true});const yes=await page('return netherStrataLab.state.host.shanhai.floaters.filter(o=>o.visible).length;');assert(yes>0);await click('#floating');await ready();assert.equal(await page('return netherStrataLab.state.host.shanhai.floaters.filter(o=>o.visible).length;'),0);await click('#background');await ready();assert.equal(await page('return netherStrataLab.state.host.shanhai.root.visible;'),false);await set({background:true});return {floaters:yes};});
    await check('responsive controls',async()=>{for(const width of [768,430]){await browser.cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await view('abyss');await shot('narrow-'+width);assert(await page('return document.documentElement.scrollWidth<=innerWidth;'));}await browser.cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});return true;});
    if(!skipPerf)for(const size of ['medium','expanse'])for(const mode of ['baseline','static','strokes','full','full','strokes','static','baseline'])await sample(mode,size);
    await check('full release and original DN2A rollback',async()=>{await art('cangmo');await set({soulfire:'flow'});const result=await page('const s=netherStrataLab.state.host.stages.get("nether"),f=s.netherInkflame;let disposed=0;for(const r of[f.texture,f.geometry,f.material])r.addEventListener("dispose",()=>disposed++);s.setNetherInkflame({});if(s.netherInkflame||disposed!==3)throw Error("Effect retained");return{disposed};');await art('legacy');assert.equal(await page('return netherStrataLab.metrics().version;'),'strata');await page('netherStrataLab.dispose();');return result;});
  }
  report.errors=errors();assert.deepEqual(report.errors,[]);report.pass=true;
}catch(e){report.error=e.stack;process.exitCode=1;console.error(e);if(browser){report.errors=errors();report.diagnostic=await page('return{url:location.href,text:document.body.innerText.slice(0,1200),metrics:window.netherStrataLab?.metrics()};').catch(()=>null);await shot('failure').catch(()=>{});}}
finally{if(browser){report.warnings=consoleMessages('warning');report.browser={...browser.meta,ownedProfile:browser.userDataDir,launcherPid:browser.child.pid};report.cleanup=await browser.close();if(!report.cleanup.complete)report.pass=false;}server?.kill();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,smoke?'smoke.json':'acceptance.json'),JSON.stringify(report,null,2));}
