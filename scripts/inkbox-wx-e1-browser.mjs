// Real official page, owned Edge/CDP. Browser plugin unavailable; use the
// repository's existing browser harness without introducing dependencies.
import fs from 'node:fs';
import path from 'node:path';
import {launch,findEdge,sleep} from './cdp.mjs';
import {launchOwnedServer} from './inkbox-owned-server.mjs';
import {ROOT,option,environment,source,readCheckpoint,writeJson,digest} from './inkbox-wx-e1-common.mjs';
const out=path.resolve(option('out','reports/local/wx-e1/browser')),durationMs=Number(option('duration-ms','30000'));
fs.mkdirSync(out,{recursive:true});const cp=readCheckpoint(400),input=path.join(out,'input400.json');fs.copyFileSync(cp.file,input);
const report={source:source(),environment:environment(),browserPath:'Browser plugin unavailable; existing repository Edge/CDP e2e harness',flow:'official creation -> genuine 400-year mortal save load -> actual Canvas/Three default 2x frames -> pause/inspect/save/load',durationMs,checkpoint:{sha256:cp.sha256,bytes:cp.bytes},cases:[]};
let server,b,current;
try{
 server=await launchOwnedServer({root:ROOT,port:0});report.server=server.identity;
 for(const renderer of ['canvas','3d']){
  current={renderer,status:'failed'};report.cases.push(current);
  b=await launch({browser:findEdge(),url:server.url+'/inkbox.html'+(renderer==='3d'?'?renderer=3d':''),width:1366,height:768,gpu:true,headless:true});current.browser=b.meta;
  const page=code=>b.js(`return (async()=>{${code}})();`,{timeoutMs:120000});
  const click=async selector=>{const p=await page(`const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing control');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);await b.click(p.x,p.y);};
  if(!await b.waitFor('return !!window.inkbox?.creationMenu',{timeoutMs:45000}))throw Error('Official page unavailable');
  current.identity=await page(`return {url:location.href,title:document.title,content:document.body.innerText.slice(0,300)};`);
  await click('[data-action="open-create"]');await page(`const f=document.querySelector('.g2-creation');f.querySelector('input[aria-label="世界种子"]').value='20260914';f.querySelector('select').value='small';return true;`);await click('.g2-creation__page:not([hidden]) button[type="submit"]');
  if(!await b.waitFor('return !!inkbox.world',{timeoutMs:60000}))throw Error('Creation failed');
  if(renderer==='3d'&&!await b.waitFor('return !!inkbox.render3d?.active',{timeoutMs:60000}))throw Error('Actual Three renderer inactive');
  const url='/'+path.relative(ROOT,input).replaceAll('\\','/').split('/').map(encodeURIComponent).join('/');
  current.load=await page(`inkbox.setSpeed(0);const data=await(await fetch(${JSON.stringify(url)})).json();const {deserializeWorld,saveToStorage}=await import('./src/inkbox/io/save.js');const w=deserializeWorld(data);let runtime=data.runtime,controlRealms=false;if(!runtime.upperLife){delete w.upper;delete w.nether;const [{Life},{UpperLife},{rngStream},{createAdvanceState},{captureRuntimeState,restoreRuntimeState},{generateUpperWorld},{generateNetherWorld}]=await Promise.all(['sim/life.js','sim/upperLife.js','core/noise.js','sim/advance.js','sim/runtimeState.js','world/worldgenUpper.js','world/worldgenNether.js'].map(p=>import('./src/inkbox/'+p)));const life=new Life(w,rngStream(w.seed^0xa5a5a5a5)),advanceState=createAdvanceState(),playerRng=rngStream(w.seed^0x504c4159);restoreRuntimeState(runtime,{world:w,life,advanceState,playerRng});w.upper=generateUpperWorld({preset:{w:w.w,h:w.h},seed:w.seed});w.nether=generateNetherWorld({preset:{w:w.w,h:w.h},seed:w.seed});for(const p of [w.upper,w.nether]){p.day=w.day;p.year=w.year;}runtime=captureRuntimeState({world:w,life,upperLife:new UpperLife(w.upper),advanceState,playerRng});controlRealms=true;}const result=await saveToStorage(w,'slot2',{},runtime);if(!result.ok)throw Error(JSON.stringify(result));inkbox.refreshSlots();document.querySelector('#inkSlotSelect').value='slot2';window.__prior=inkbox.world;return {day:data.day,controlRealms,note:'Generated control upper/nether are not natural 400-year histories'};`);
  await click('#inkBtnLoad');if(!await b.waitFor('return inkbox.world!==window.__prior && !document.querySelector("#inkBtnLoad").disabled',{timeoutMs:60000}))throw Error('Formal native load failed');
  await page(`inkbox.setSpeed(2);window.__e1={start:performance.now(),day:inkbox.world.day,frames:[],longTasks:[]};const run=window.__e1;let last;function sample(t){if(window.__e1!==run)return;if(last!==undefined)run.frames.push(t-last);last=t;requestAnimationFrame(sample);}requestAnimationFrame(sample);window.__e1Observer=new PerformanceObserver(list=>{for(const e of list.getEntries())run.longTasks.push({start:e.startTime,duration:e.duration});});window.__e1Observer.observe({type:'longtask',buffered:false});return true;`);
  await b.cdp.send('Profiler.enable');await b.cdp.send('Profiler.start');await sleep(durationMs);const profile=await b.cdp.send('Profiler.stop');writeJson(path.join(out,`${renderer}-400y-2x.cpuprofile`),profile.profile);
  current.sample=await page(`const p=window.__e1;window.__e1=null;window.__e1Observer.disconnect();inkbox.setSpeed(0);const sorted=p.frames.sort((a,b)=>a-b),q=n=>sorted[Math.max(0,Math.ceil(sorted.length*n)-1)]??null;return {startDay:p.day,endDay:inkbox.world.day,elapsedMs:performance.now()-p.start,frameCount:sorted.length,p50:q(.5),p95:q(.95),p99:q(.99),longFrameCount:sorted.filter(x=>x>50).length,longTasks:p.longTasks,targetDaysPerSecond:6,actualDaysPerSecond:(inkbox.world.day-p.day)/((performance.now()-p.start)/1000),visibility:document.visibilityState};`);
  current.inspect=await page(`const {isHumanPerson}=await import('./src/inkbox/core/demographics.js');const e=inkbox.world.entities.find(e=>e.hp>0&&isHumanPerson(e));if(!e)throw Error('Missing living individual');return inkbox.g1.open('mortal:'+e.id);`);
  current.screenshot=path.join(out,`${renderer}-400y.png`);await b.screenshot(current.screenshot);await click('#inkPersonDetail [data-g1-action="close"]');
  await page(`document.querySelector('#inkSlotSelect').value='slot1';const {APP}=await import('./src/inkbox/core/config.js');window.__savedKey=APP.saveKey+':slot1';localStorage.removeItem(window.__savedKey);return true;`);
  await click('#inkBtnSave');if(!await b.waitFor('return !!localStorage.getItem(window.__savedKey) && !document.querySelector("#inkBtnSave").disabled',{timeoutMs:60000}))throw Error('Completed-step save failed');
  const saved=await page(`window.__beforeLoad=inkbox.world;return localStorage.getItem(window.__savedKey);`);current.savedSlotSha256=digest(saved);
  await click('#inkBtnLoad');if(!await b.waitFor('return inkbox.world!==window.__beforeLoad && !document.querySelector("#inkBtnLoad").disabled',{timeoutMs:60000}))throw Error('Saved-step load failed');
  current.errors=b.errors();if(current.errors.length)throw Error('Browser errors '+JSON.stringify(current.errors));
  if(current.sample.frameCount<10||current.sample.endDay<=current.sample.startDay)throw Error('Insufficient real frames/progress');
  current.status='observed';current.cleanup=await b.close();b=null;writeJson(path.join(out,'report.json'),report);
 }
 report.exitCode=0;
}catch(e){report.error=e.stack;report.exitCode=1;process.exitCode=1;}finally{
 if(b){current.errors=b.errors();current.cleanup=await b.close();}
 if(server){const child=server.child;if(child.exitCode===null&&child.signalCode===null){child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),sleep(3000)]);}report.serverCleanup={exited:child.exitCode!==null||child.signalCode!==null};}
 writeJson(path.join(out,'report.json'),report);
}
