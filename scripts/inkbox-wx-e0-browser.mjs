import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {launch,findEdge,sleep} from './cdp.mjs';
import {launchOwnedServer} from './inkbox-owned-server.mjs';
const viewportOnly=process.env.INKBOX_WX_E0_VIEWPORT_ONLY==='1';
const out=process.env.INKBOX_WX_E0_REPORT_DIR|| (viewportOnly?'reports/local/wx-e0/browser/viewport-only':'reports/local/wx-e0/browser');
fs.mkdirSync(out,{recursive:true});
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const inputs=['reports/local/wx-e0/checkpoints/20260914-100y-save.json','reports/local/wx-e0/checkpoints/20260914-400y-save.json'];
const tracked=execFileSync('git',['ls-files','src/inkbox'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(f=>f&&fs.existsSync(f));
const report={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}),hashes:Object.fromEntries([...tracked,...inputs,'scripts/inkbox-wx-e0-browser.mjs'].filter(f=>fs.existsSync(f)).map(f=>[f,hash(f)])),cases:[],scope:'Real RAF intervals are not CPU attribution. Timings are inclusive wrappers of actual calls; control upper realms are not natural three-realm evidence.'};
let server,b,browserRun;
report.browsers=[];
report.viewportChecks=[];
const durationMs=process.env.INKBOX_WX_E0_SELF_CHECK==='1'?5000:60000;
report.mode=viewportOnly?'viewport-only; not performance acceptance':durationMs===5000?'self-check only; not acceptance':'acceptance';
const page=code=>b.js(`return (async()=>{${code}})();`,{timeoutMs:120000});
async function click(sel){const p=await page(`const e=document.querySelector(${JSON.stringify(sel)});if(!e||e.disabled)throw Error('Missing '+${JSON.stringify(sel)});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);await b.click(p.x,p.y);}
async function waitForPauseActionable(){
 await page(`window.__pauseStable=null;return true;`);
 const ready=await b.waitFor(`const e=document.querySelector('#inkBtnPause');if(!e||e.disabled)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);const rect=[r.x,r.y,r.width,r.height];const stable=window.__pauseStable;const transitioning=document.getAnimations().some(a=>a instanceof CSSTransition&&a.playState==='running');const ok=r.width>0&&r.height>0&&s.visibility==='visible'&&s.pointerEvents!=='none'&&(hit===e||e.contains(hit))&&!transitioning;if(!ok){window.__pauseStable=null;return false;}if(!stable||rect.some((v,i)=>Math.abs(v-stable.rect[i])>0.25)){window.__pauseStable={rect,since:performance.now()};return false;}return performance.now()-stable.since>=300;`,{timeoutMs:10000,intervalMs:100});
 if(!ready)throw Error('Pause button never became stable and actionable after resize');
}
async function formalLoad(slot){
 await page(`inkbox.setSpeed(0);window.__oldWorld=inkbox.world;document.querySelector('#inkSlotSelect').value=${JSON.stringify(slot)};inkbox.refreshSlots();return true;`);
 await click('#inkBtnLoad');
 if(!await b.waitFor("return inkbox.world!==window.__oldWorld && !document.querySelector('#inkBtnLoad').disabled",{timeoutMs:60000,intervalMs:50}))throw Error('Formal load failed or busy');
}
async function loadCheckpoint(file){
 const url='/'+file.split('/').map(encodeURIComponent).join('/');
 const evidence=await page(`const data=await(await fetch(${JSON.stringify(url)})).json();const {deserializeWorld,saveToStorage}=await import('./src/inkbox/io/save.js');const w=deserializeWorld(data);let runtime=data.runtime,adapted=false;if(!runtime.upperLife){delete w.upper;delete w.nether;const [{Life},{UpperLife},{rngStream},{createAdvanceState},{captureRuntimeState,restoreRuntimeState},{generateUpperWorld},{generateNetherWorld}]=await Promise.all(['sim/life.js','sim/upperLife.js','core/noise.js','sim/advance.js','sim/runtimeState.js','world/worldgenUpper.js','world/worldgenNether.js'].map(p=>import('./src/inkbox/'+p)));const life=new Life(w,rngStream(w.seed^0xa5a5a5a5)),advanceState=createAdvanceState(),playerRng=rngStream(w.seed^0x504c4159);restoreRuntimeState(runtime,{world:w,life,advanceState,playerRng});const preset={w:w.w,h:w.h};w.upper=generateUpperWorld({preset,seed:w.seed});w.nether=generateNetherWorld({preset,seed:w.seed});for(const p of [w.upper,w.nether]){p.day=w.day;p.year=w.year;}runtime=captureRuntimeState({world:w,life,upperLife:new UpperLife(w.upper),advanceState,playerRng});adapted=true;}const result=await saveToStorage(w,'slot2',{source:'WX-E0 natural mortal checkpoint'},runtime);if(!result.ok)throw Error(JSON.stringify(result));inkbox.refreshSlots();document.querySelector('#inkSlotSelect').value='slot2';return {seed:data.seed,day:data.day,adapted};`);
 const start=performance.now();await formalLoad('slot2');return {...evidence,interactiveMs:performance.now()-start};
}
try{
 server=await launchOwnedServer({root:process.cwd(),port:0});report.server=server.identity;
 for(const renderer of (durationMs===5000?['canvas']:['canvas','3d'])){
  b=await launch({browser:findEdge(),url:server.url+'/inkbox.html'+(renderer==='3d'?'?renderer=3d':''),width:1366,height:768,gpu:true,headless:true});browserRun={renderer,headless:true,meta:b.meta};report.browsers.push(browserRun);
  if(!await b.waitFor('return !!window.inkbox?.creationMenu',{timeoutMs:45000}))throw Error('Entry unavailable');
  await click('[data-action="open-create"]');await page(`const f=document.querySelector('.g2-creation');f.querySelector('input[aria-label="世界种子"]').value='20260914';f.querySelector('select').value='small';return true;`);await click('.g2-creation__page:not([hidden]) button[type="submit"]');if(!await b.waitFor('return !!inkbox.world',{timeoutMs:60000}))throw Error('Creation failed');
  if(renderer==='3d'&&!await b.waitFor('return !!inkbox.render3d?.active',{timeoutMs:60000}))throw Error('Three unavailable');
  if(viewportOnly)await page(`window.__viewportEvents=[];for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>window.__viewportEvents.push({type,target:{tag:e.target.tagName,id:e.target.id},speed:inkbox.speedIndex,viewport:[innerWidth,innerHeight]}),true);return true;`);
  const speeds=await page(`const {TIME}=await import('./src/inkbox/core/config.js');return {speeds:TIME.speeds,defaultIndex:inkbox.speedIndex};`);const indices=[speeds.speeds.findIndex(s=>s.mult===1),speeds.defaultIndex,speeds.speeds.length-1];if(indices.some(i=>i<1))throw Error('Invalid speed indices');
  for(const [width,height] of [[1440,900],[1024,768],[390,844]]){
   const check={renderer,width,height,status:'failed',visualReview:'pending screenshot inspection'};
   report.viewportChecks.push(check);
   try{
    await b.cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
    await page(`inkbox.setSpeed(0);return true;`);
    await waitForPauseActionable();
    await click('#inkBtnPause');const unpaused=await page(`return inkbox.speedIndex===2;`);
    await click('#inkBtnPause');const paused=await page(`return inkbox.speedIndex===0;`);
    const person=await page(`const {isHumanPerson}=await import('./src/inkbox/core/demographics.js');const e=inkbox.world.entities.find(e=>isHumanPerson(e)&&e.hp>0);if(!e)throw Error('No living person');const result=inkbox.g1.open('mortal:'+e.id);return {ok:result.ok,id:e.id,close:!!document.querySelector('#inkPersonDetail [data-g1-action="close"]')};`);
    check.screenshot=path.join(out,`viewport-${renderer}-${width}x${height}.png`);
    await b.screenshot(check.screenshot);
    await click('#inkPersonDetail [data-g1-action="close"]');
    const closed=await page(`return !document.querySelector('#inkPersonDetail').classList.contains('on');`);
    Object.assign(check,{person,paused,unpaused,closed,status:person.ok&&person.close&&paused&&unpaused&&closed?'observed':'failed'});
   }catch(e){check.error=String(e);}
  }
  if(viewportOnly){browserRun.events=await page(`return window.__viewportEvents;`);browserRun.errors=b.errors();if(browserRun.errors.length)for(const c of report.viewportChecks.filter(c=>c.renderer===renderer)){c.status='failed';c.consoleErrors=browserRun.errors;}browserRun.cleanup=await b.close();b=null;continue;}
  await b.cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  for(const [world,file] of (durationMs===5000?[['new',null]]:[['new',null],['100y',inputs[0]],['400y',inputs[1]]])){
   if(file&&!fs.existsSync(file)){for(const index of indices)report.cases.push({renderer,world,index,status:'blocked',reason:'checkpoint missing'});continue;}
   let load=null;try{if(file)load=await loadCheckpoint(file);
   await page(`inkbox.setSpeed(0);return true;`);await click('#inkBtnPause');const unpaused=await page(`return inkbox.speedIndex!==0;`);await click('#inkBtnPause');const paused=await page(`return inkbox.speedIndex===0;`);
   const person=await page(`const e=inkbox.world.entities.find(e=>e.sp==='human'&&e.hp>0);if(!e)return {ok:false};const r=inkbox.g1.open('mortal:'+e.id);return {ok:r.ok,id:e.id};`);if(person.ok)await click('#inkPersonDetail [data-g1-action="close"]');
   await page(`const {APP}=await import('./src/inkbox/core/config.js');window.__slotKey=APP.saveKey+':slot1';localStorage.removeItem(window.__slotKey);document.querySelector('#inkSlotSelect').value='slot1';return true;`);
   const saveStart=performance.now();await click('#inkBtnSave');if(!await b.waitFor('return !!localStorage.getItem(window.__slotKey) && !document.querySelector("#inkBtnSave").disabled',{timeoutMs:60000,intervalMs:50}))throw Error('Save did not complete');const saveMs=performance.now()-saveStart;
   const slot=await page(`const raw=localStorage.getItem(window.__slotKey);window.__oldWorld=inkbox.world;return {characters:raw.length,compressed:raw.startsWith('INKGZ1:')};`);
   const loadStart=performance.now();await formalLoad('slot1');const loadMs=performance.now()-loadStart;
   report.cases.push({renderer,world,kind:'ui',status:person.ok&&paused&&unpaused&&slot.compressed?'observed':'failed',person,paused,unpaused,saveMs,loadMs,slot,note:'Button-to-observed completion includes CDP click/poll overhead'});
   await b.screenshot(path.join(out,`${world}-${renderer}.png`));}catch(e){for(const index of indices)report.cases.push({renderer,world,index,status:'failed',reason:String(e)});continue;}
   const snapshot=await page(`return localStorage.getItem(window.__slotKey);`);const slotHash=createHash('sha256').update(snapshot).digest('hex');
   for(const index of (durationMs===5000?[indices[0]]:indices)){const result={renderer,world,index,speed:speeds.speeds[index],load,slotHash};report.cases.push(result);console.log('CASE START',renderer,world,index,report.mode);try{
    await formalLoad('slot1');
    await page(`const {isHumanPerson,isMortalHuman}=await import('./src/inkbox/core/demographics.js');window.__pop=()=>{const w=inkbox.world,count=p=>({entities:p?.entities?.length??null,mortalHumans:p?.entities?.filter(e=>isMortalHuman(e)&&e.hp>0).length??null,cultivators:p?.entities?.filter(e=>isHumanPerson(e)&&e.level>0&&e.hp>0).length??null,souls:p?.souls?.length??null});return {mortal:count(w),upper:count(w.upper),nether:count(w.nether)};};for(const n of ['update','advanceDays','render'])if(typeof inkbox[n]!=='function')throw Error('Missing '+n);if(typeof inkbox.life?.step!=='function')throw Error('Missing life.step');inkbox.setSpeed(${index});window.__restorePerf=[];window.__perf={frames:[],update:[],advanceDays:[],render:[],life:[],startDay:inkbox.world.day,startPopulation:window.__pop(),start:performance.now()};for(const name of ['update','advanceDays','render']){const original=inkbox[name];window.__restorePerf.push(()=>inkbox[name]=original);inkbox[name]=function(...args){const t=performance.now();try{return original.apply(this,args)}finally{window.__perf?.[name].push(performance.now()-t)}};}const life=inkbox.life;if(life?.step){const original=life.step;window.__restorePerf.push(()=>life.step=original);life.step=function(...args){const t=performance.now();try{return original.apply(this,args)}finally{window.__perf?.life.push(performance.now()-t)}};}const run=window.__perf;let prev;function sample(t){if(window.__perf!==run)return;if(prev!==undefined)run.frames.push(t-prev);prev=t;requestAnimationFrame(sample)}requestAnimationFrame(sample);return true;`);
    await sleep(durationMs);
    Object.assign(result,await page(`const p=window.__perf;window.__restorePerf.forEach(f=>f());window.__perf=null;const stats=a=>{const s=[...a].sort((x,y)=>x-y),q=n=>s.length?s[Math.min(s.length-1,Math.floor((s.length-1)*n))]:null;return {count:s.length,p50:q(.5),p95:q(.95),p99:q(.99),total:s.reduce((a,b)=>a+b,0),longFrames:s.filter(x=>x>50).length}};let gl=inkbox.render3d?.renderer?.gpu?.getContext();let info=null;if(gl){const d=gl.getExtension('WEBGL_debug_renderer_info');info={version:gl.getParameter(gl.VERSION),vendor:d&&gl.getParameter(d.UNMASKED_VENDOR_WEBGL),renderer:d&&gl.getParameter(d.UNMASKED_RENDERER_WEBGL)};info.classification=!info.renderer?'unknown':/swiftshader|llvmpipe|software|basic render/i.test(info.renderer)?'software':'hardware-reported';}return {elapsedMs:performance.now()-p.start,startDay:p.startDay,endDay:inkbox.world.day,startPopulation:p.startPopulation,endPopulation:window.__pop(),visibility:document.visibilityState,focused:document.hasFocus(),paused:inkbox.speedIndex===0,viewport:[innerWidth,innerHeight],webgl:info,frames:stats(p.frames),update:stats(p.update),advanceDays:stats(p.advanceDays),render:stats(p.render),life:stats(p.life)};`));result.status=result.elapsedMs>=durationMs&&result.endDay>result.startDay&&['frames','update','advanceDays','render','life'].every(k=>result[k].count>0)?(durationMs===60000?'observed':'self-check'):'failed';
   }catch(e){result.status='failed';result.reason=String(e);}finally{try{await page(`window.__restorePerf?.forEach(f=>f());window.__restorePerf=[];window.__perf=null;inkbox.setSpeed(0);return true;`)}catch(e){result.cleanupError=String(e);result.status='failed';}console.log('CASE END',renderer,world,index,result.status);}}
  }
  browserRun.errors=b.errors();if(browserRun.errors.length)for(const c of [...report.cases,...report.viewportChecks].filter(c=>c.renderer===renderer)){c.status='failed';c.consoleErrors=browserRun.errors;}browserRun.cleanup=await b.close();b=null;
 }
}catch(e){report.fatal=String(e)}finally{if(b){browserRun.errors=b.errors();browserRun.cleanup=await b.close();}if(server){const child=server.child;if(child.exitCode===null&&child.signalCode===null){child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(5000)]);}report.serverCleanup={exited:child.exitCode!==null||child.signalCode!==null,exitCode:child.exitCode,signal:child.signalCode};}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
if(report.fatal||report.viewportChecks.some(c=>c.status!=='observed')||report.cases.some(c=>!['observed','self-check'].includes(c.status)))process.exitCode=1;






