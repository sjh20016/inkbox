// Actual Edge / Canvas UnitsLayer / WebGL EntityLayer, isolated research page.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {launch,findEdge,sleep} from './cdp.mjs';
import {launchOwnedServer} from './inkbox-owned-server.mjs';
import {ROOT,option,digest,writeJson,distribution,environment} from './inkbox-e-m2-common.mjs';
const out=path.resolve(option('out','reports/local/wx-e3sp/browser'));
const durationMs=Number(option('duration-ms','30000')),warmupMs=Number(option('warmup-ms','5000')),rounds=Number(option('rounds','3'));
const renderers=option('renderers','canvas,3d').split(','),age=Number(option('age','400')),mode=option('mode','cooperative');
const captureCpuProfile=option('cpu-profile','0')==='1';
const inputCount=option('inputs','1')==='1'?8:0;
assert(durationMs>=1000&&durationMs<=60000&&rounds>=1);assert([100,400].includes(age));
assert(renderers.every(x=>['canvas','3d'].includes(x)));assert(['cooperative','sync'].includes(mode));
function source(){const git=args=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim();const files=git(['ls-files','--cached','--others','--exclude-standard','src','research/wx-e3sp','scripts/inkbox-wx-e3sp*','package.json','.github/workflows/ci.yml']).split(/\r?\n/).filter(f=>f&&fs.existsSync(path.join(ROOT,f)));return {head:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),dirty:git(['status','--porcelain']),hashes:Object.fromEntries([...new Set(files)].sort().map(f=>[f,digest(fs.readFileSync(path.join(ROOT,f)))]))};}
fs.mkdirSync(out,{recursive:true});const input=path.resolve(option('checkpoint-root','../inkbox-wx-s1/reports/local/wx-s1/natural'),`20260914-${age}y-save.json`),bytes=fs.readFileSync(input),saved=JSON.parse(bytes);assert.equal(saved.v,11);assert(saved.runtime.exact);
const dest=path.join(ROOT,`reports/local/wx-e3sp/inputs/${age}.json`);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(input,dest);
const report={pass:false,source:source(),environment:environment(),input:{file:input,sha256:digest(bytes),bytes:bytes.length,natural:true,childRealms:!!saved.runtime.upperLife},durationMs,warmupMs,rounds,mode,renderers,inputCount,captureCpuProfile,cases:[],method:'Fixed dt=3 in the private research context. Edge runs the actual Canvas UnitsLayer and WebGL EntityLayer through the isolated page. The browser seals each sample at the first timer callback after the requested interval. Input time starts at the trusted DOM event timestamp. Local feedback ends at the first completed render callback and authority ends at receipt delivery.'};
const resumeFile=option('resume-from','');
const prior=resumeFile?JSON.parse(fs.readFileSync(resumeFile)):null;
if(prior){
  assert.notEqual(path.resolve(resumeFile),path.join(out,'report.json'),'preserve the prior run');
  for(const key of ['durationMs','warmupMs','rounds','mode','renderers','inputCount','captureCpuProfile'])
    assert.deepEqual(report[key],prior[key],'same trial configuration: '+key);
  assert.deepEqual(report.source.hashes,prior.source.hashes,'same frozen source inventory and bytes');
  assert.equal(report.input.sha256,prior.input.sha256,'same original checkpoint');
  report.cases=prior.cases.filter(row=>row.status==='observed');
  report.resumedFrom={file:path.resolve(resumeFile),sha256:digest(fs.readFileSync(resumeFile)),error:prior.error??null};
}
const completedIds=new Set(report.cases.map(row=>row.id));
if(report.cases.length)report.browserProduct=report.cases[0].browserVersion.product;
const edge=findEdge();
assert(edge,'Installed Edge is required');
let server,b,current;
try{
 server=await launchOwnedServer({root:ROOT,port:0});report.server=server.identity;
 for(let round=0;round<rounds;round++)for(const renderer of renderers){
  const id=`${age}-${renderer}-${mode}-r${round}`;
  if(completedIds.has(id))continue;
  current={id,renderer,round,status:'running',startedAt:new Date().toISOString()};report.cases.push(current);writeJson(path.join(out,'report.json'),report);
  b=await launch({browser:edge,url:server.url+`/research/wx-e3sp/index.html?age=${age}&renderer=${renderer}&mode=${mode}`,width:1366,height:768,gpu:true,headless:true});current.browser=b.meta;current.browserVersion=await b.cdp.send('Browser.getVersion');
  assert.match(current.browserVersion.product,/^Edg\//);
  report.browserProduct??=current.browserVersion.product;
  assert.equal(current.browserVersion.product,report.browserProduct,'same Edge build across repeated trials');
  const page=code=>b.js(`return (async()=>{${code}})();`,{timeoutMs:120000});
  assert(await b.waitFor('return !!window.e3spDemo?.simulation||!!window.e3spDemo?.error',{timeoutMs:60000}),'research page boot');
  current.boot=await page('if(e3spDemo.error)throw Error(e3spDemo.error);return {renderer:e3spDemo.rendererKind,status:e3spDemo.simulation.getStatus(),entities:e3spDemo.simulation.getFrame().entities.length,actualPresenter:e3spDemo.presenter.kind};');assert.equal(current.boot.renderer,renderer);assert.equal(current.boot.actualPresenter,renderer);
  assert.equal(current.boot.status.initialCheckpointSha256,report.input.sha256);
  if(renderer==='3d')current.gpu=await page(`const gl=e3spDemo.presenter.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {webgl:gl.getParameter(gl.VERSION),vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),unmasked:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};`);
  await sleep(warmupMs);
  await page('e3spDemo.simulation.pause(performance.now());return true;');
  assert(await b.waitFor('return e3spDemo.simulation.getStatus().inFlightDays===0',{timeoutMs:60000}),'warmup step reaches complete boundary');
  await b.cdp.send('HeapProfiler.collectGarbage');current.heapBefore=await b.cdp.send('Runtime.getHeapUsage');
  if(captureCpuProfile){
    await b.cdp.send('Profiler.enable');
    await b.cdp.send('Profiler.setSamplingInterval',{interval:1000});
    await b.cdp.send('Profiler.start');
  }
  const inputTargets=await page(`
    const d=e3spDemo,s=d.simulation,presenter=d.presenter;
    document.querySelector('#tool').value='raise';
    const controls=['#command','#undo'].map(selector=>{
      const r=document.querySelector(selector).getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2};
    });
    s.resetMetrics();d.frameStats.length=0;d.inputStats.length=0;
    const status=s.getStatus(),frames=[],clicks=[],longTasks=[];
    const originalRender=presenter.render;
    let frameMismatch=0;
    presenter.render=function(...args){
      const result=originalRender.apply(this,args),front=s.getFrame(),st=s.getStatus();
      if(presenter.frame!==front)frameMismatch++;
      frames.push({committedDay:front.committedDay,commitSequence:front.commitSequence,
        steps:st.commits,phase:st.phase,inFlightDays:st.inFlightDays,targetDay:st.targetDay});
      return result;
    };
    const clickListener=event=>{
      if(event.target.closest('#command,#undo'))clicks.push({timestamp:event.timeStamp,trusted:event.isTrusted,delivered:performance.now()});
    };
    document.addEventListener('click',clickListener,true);
    const observe=list=>{for(const entry of list)longTasks.push({startMs:entry.startTime,durationMs:entry.duration});};
    const observer=new PerformanceObserver(list=>observe(list.getEntries()));
    observer.observe({type:'longtask',buffered:false});
    const start=performance.now();
    s.resume(2,start);
    window.__e3Sealed=null;
    setTimeout(()=>{
      const stop=performance.now();
      s.pause(stop);
      observe(observer.takeRecords());observer.disconnect();
      presenter.render=originalRender;
      document.removeEventListener('click',clickListener,true);
      const st=s.getStatus();
      window.__e3Sealed={start,stop,timeOrigin:performance.timeOrigin,startDay:status.committedDay,endDay:st.committedDay,
        startCommits:status.commits,startCommands:status.commandCommits,startTargetDay:status.targetDay,
        frames:d.frameStats.slice(),observations:frames,frameMismatch,clicks,longTasks,inputs:d.inputStats.slice(),
        metrics:s.getMetrics(),status:st,demoError:d.error??null};
    },${durationMs});
    return controls;
  `);
  const injectionTimes=[];
  for(let i=0;i<inputCount;i++){
    await sleep(Math.max(35,Math.min(1900,Math.floor(durationMs/(inputCount+3)))));
    const p=inputTargets[i%4===3?1:0];
    injectionTimes.push({index:i,type:i%4===3?'undo':'raise',hostStartedMs:Date.now()});
    await b.click(p.x,p.y,'left',0);
    injectionTimes.at(-1).hostReturnedMs=Date.now();
  }
  assert(await b.waitFor('return !!window.__e3Sealed',{timeoutMs:durationMs+30000}),'browser sealed the sample');
  if(captureCpuProfile){
    const {profile}=await b.cdp.send('Profiler.stop');
    current.cpuProfile=path.join(out,id+'.cpuprofile');
    writeJson(current.cpuProfile,profile);
    current.cpuProfileSha256=digest(fs.readFileSync(current.cpuProfile));
    await b.cdp.send('Profiler.disable');
  }
  const raw=await page('return __e3Sealed;');
  raw.injections=injectionTimes;
  current.interval={startMs:raw.start,stopMs:raw.stop,elapsedMs:raw.stop-raw.start,startDay:raw.startDay,endDay:raw.endDay};
  current.rawFile=path.join(out,id+'.json');writeJson(current.rawFile,raw);current.rawSha256=digest(fs.readFileSync(current.rawFile));
  const frames=raw.frames.filter(f=>f.enterMs>=raw.start&&f.enterMs<=raw.stop),js=frames.map(f=>f.endMs-f.enterMs),raf=frames.map(f=>f.intervalMs).filter(Number.isFinite),atoms=raw.metrics.atomicSamples,elapsed=(raw.stop-raw.start)/1000;
  assert(frames.length>=3);assert.equal(raw.status.state==='FAULT',false,raw.status.fault||'not faulted');assert(raw.endDay>raw.startDay,'committed days advance');assert.equal(raw.metrics.normalStepRestores,0);assert.equal(raw.metrics.normalStepFullSaves,0);assert.equal(raw.metrics.dropped,0);
  assert.equal(raw.metrics.restoreCalls,1,'only the initial World restore');
  assert.equal(raw.metrics.fullSaveCalls,0,'normal slices never serialize a full save');
  assert.equal(raw.demoError,null);assert.equal(raw.frameMismatch,0,'presenter used the current committed frame');
  assert.equal(raw.observations.length,raw.frames.length,'one committed observation for each rendered callback');
  assert.equal(raw.clicks.length,inputCount,'all trusted clicks are inside the sealed window');
  assert(raw.clicks.every(click=>click.trusted&&click.timestamp>=raw.start&&click.delivered<=raw.stop));
  const countsByStep={};
  for(const observation of raw.observations){
    if(observation.inFlightDays)countsByStep[observation.steps]=(countsByStep[observation.steps]||0)+1;
  }
  const displayYields=Object.entries(countsByStep).filter(([step])=>Number(step)<raw.status.commits).map(([,count])=>count);
  if(mode==='cooperative')assert(displayYields.some(count=>count>1),'at least one completed step spans multiple actual display callbacks');
  const byPhase={};for(const atom of atoms)(byPhase[atom.phase]??=[]).push(atom.durationMs);
  assert.equal(raw.endDay-raw.startDay,(raw.status.commits-raw.startCommits)*3,'actual completed fixed steps account for all game days');
  current.summary={jsFrameMs:distribution(js),rafIntervalMs:distribution(raf),longTaskMs:distribution(raw.longTasks.map(x=>x.durationMs)),over50msJs:js.filter(x=>x>50).length,over50msJsRatio:js.filter(x=>x>50).length/js.length,over50msRaf:raf.filter(x=>x>50).length,completedDays:raw.endDay-raw.startDay,completedDaysPerSecond:(raw.endDay-raw.startDay)/elapsed,stepCommits:raw.status.commits-raw.startCommits,commandCommits:raw.status.commandCommits-raw.startCommands,actualDisplayedFrames:frames.length,atomicMaxMs:raw.metrics.atomicMaxMs,atomicByPhase:Object.fromEntries(Object.entries(byPhase).map(([k,v])=>[k,distribution(v)])),targetDay:raw.status.targetDay,committedDay:raw.status.committedDay,queuedDays:raw.status.queuedDays,inFlightDays:raw.status.inFlightDays,lagDays:raw.status.lagDays,normalStepRestores:0,normalStepFullSaves:0};
  current.summary.sliceMs=distribution(raw.metrics.slices.map(slice=>slice.durationMs));
  current.summary.activeSliceMs=raw.metrics.totalCpuMs;
  current.summary.atomsOver6ms=atoms.filter(atom=>atom.durationMs>6).length;
  current.summary.atomsOver8ms=atoms.filter(atom=>atom.durationMs>8).length;
  current.summary.longTaskWallShare=raw.longTasks.reduce((total,entry)=>
    total+Math.max(0,Math.min(raw.stop,entry.startMs+entry.durationMs)-Math.max(raw.start,entry.startMs)),0)/(elapsed*1000);
  current.summary.completedStepsYieldingAcrossCallbacks=displayYields.filter(count=>count>1).length;
  current.summary.inFlightDisplayCallbacksPerCompletedStep=distribution(displayYields);
  // Pending input completion is outside the sealed performance interval.
  assert(await b.waitFor('const s=e3spDemo.simulation.getStatus();return s.queueLength===0&&s.inFlightDays===0;',{timeoutMs:60000}),'pending commands complete at legal paused boundary');
  current.inputs=await page('return e3spDemo.inputStats;');
  assert.equal(current.inputs.length,inputCount);
  assert(current.inputs.every(x=>x.ack.ok&&x.localPaintedMs!=null&&x.authorityMs!=null&&!x.error),'native input receives local and authoritative completion');
  if(inputCount)assert(current.inputs.some(x=>x.receipt.native.changed),'at least one real terrain edit');
  current.inputs.forEach((receipt,index)=>{
    const click=raw.clicks[index];assert(click.timestamp<=receipt.issuedMs);
    receipt.inputTimestampMs=click.timestamp;
  });
  current.summary.localInputMs=distribution(current.inputs.map(x=>x.localPaintedMs-x.inputTimestampMs));
  current.summary.authorityInputMs=distribution(current.inputs.map(x=>x.authorityMs-x.inputTimestampMs));
  current.summary.handlerToAuthorityMs=distribution(current.inputs.map(x=>x.authorityMs-x.issuedMs));
  current.screenshot=path.join(out,id+'.png');await b.screenshot(current.screenshot);
  // Explicit save and story reads verify safe public data; not normal step copies.
  current.query=await page(`
    const d=e3spDemo,s=d.simulation,frame=s.getFrame(),query=s.getQuery(),ref=query.entities[0]?.storyRef;
    const text=await s.requestSave(),data=JSON.parse(text),cards=ref?await s.readStories(ref,frame.worldGeneration):null;
    const bytes=value=>new TextEncoder().encode(value).length;
    const {height,water,type,veg,qi,...geometry}=frame.geometry;
    return {saveBytes:bytes(text),frameBytes:bytes(JSON.stringify({...frame,geometry})),queryBytes:bytes(JSON.stringify(query)),
      savedDay:data.day,committedDay:frame.committedDay,storyPresent:!!cards,storyRef:ref,eventStats:d.eventStats,
      fullSaveCalls:s.getStatus().fullSaveCalls};
  `);
  assert.equal(current.query.savedDay,current.query.committedDay);
  assert.equal(current.query.fullSaveCalls,1,'explicit safe-boundary save is counted once');
  await b.cdp.send('HeapProfiler.collectGarbage');current.heapAfter=await b.cdp.send('Runtime.getHeapUsage');current.errors=b.errors();assert.equal(current.errors.length,0,'no browser errors');
  await page('e3spDemo.dispose();return true;');current.cleanup=await b.close();assert(current.cleanup.complete);b=null;current.status='observed';current.finishedAt=new Date().toISOString();writeJson(path.join(out,'report.json'),report);console.log(JSON.stringify({id,...current.summary,atomicByPhase:undefined}));
 }
 assert.deepEqual(source().hashes,report.source.hashes,'sampled implementation stayed frozen');report.pass=true;report.exitCode=0;
}catch(error){if(current)current.status='failed';report.error=error.stack;report.exitCode=1;process.exitCode=1;}finally{
 if(b){current.errors=b.errors();current.cleanup=await b.close();}
 if(server){const c=server.child;if(c.exitCode===null&&c.signalCode===null){c.kill();await Promise.race([new Promise(r=>c.once('exit',r)),sleep(3000)]);}report.serverCleanup={exited:c.exitCode!==null||c.signalCode!==null};}
 report.finishedAt=new Date().toISOString();writeJson(path.join(out,'report.json'),report);console.log(JSON.stringify({pass:report.pass,error:report.error,out}));
}
