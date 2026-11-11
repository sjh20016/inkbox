import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {ROOT,option,source,environment,readCheckpoint,nativeApi,advanceDays,digest,writeJson,distribution} from './inkbox-wx-e1-common.mjs';
const api=await nativeApi(),{deriveConditions}=await api.load('wanxiang/conditions.js'),{experienceEffects}=await api.load('wanxiang/experiences.js'),{initializeProfile}=await api.load('wanxiang/profile.js');
const report={environment:environment(),source:source(),scope:'diagnostic inclusive wall attribution; not diagnostic-off acceleration',natural:[],scale:[],micro:null,uncovered:['Village/sect/relation population visits are NOT instrumented; separate inclusive phase timers only.','Worldless skill effects are counted by the serial global effects meter, not attributed to a missing world.'],timingRelations:'life includes prepare/entity-loop/post; stepEntity is within entity-loop; conditions/experience/clamp are subsets of effects.dynamicMs. Never add parent and child times.'};
const mode=option('mode','all'),out=option('out','reports/local/wx-e1/w1/profile.json');
try{
 if(['all','natural','cpu'].includes(mode))for(const age of option('ages','100,400').split(',').map(Number)){
  const cp=readCheckpoint(age);
  const windows=mode==='cpu'?[[Number(option('days','30')),Number(option('dt','3'))]]:[[30,3],[90,3],[Number(option('fractional-days','3')),0.1]];
  for(const [days,dt]of windows){
   const rows=[];for(const measured of mode==='cpu'?[false]:[false,true]){
    const c=api.restore(cp.saved,{measure:measured}),effect=api.effects.measureEffects(measured),t=performance.now();advanceDays(api,c,days,dt);
    const wallMs=performance.now()-t,full=api.capture(c);api.effects.measureEffects(false);
    const work=api.metrics.workMetricsSnapshot(c.world),hist=work['life.stepEntity']?.histogram;
    const histogramQuantile=p=>{if(!hist)return null;let n=0,total=hist.reduce((a,b)=>a+b,0);for(let i=0;i<hist.length;i++){n+=hist[i];if(n>=total*p)return 2**(i-12);}return null;};
    rows.push({measured,wallMs,fullSha256:digest(full),runtimeSha256:digest(full.runtime),work,effect,stepEntityHistogramUpperMs:{p95:histogramQuantile(.95),p99:histogramQuantile(.99)}});
   }
   assert.equal(new Set(rows.map(r=>r.fullSha256)).size,1,'diagnostics preserve full world+RNG');report.natural.push({age,checkpoint:{file:cp.file,bytes:cp.bytes,sha256:cp.sha256},days,dt,rows});writeJson(out,report);console.log(`PROFILE ${age}y ${days}d dt=${dt} equality OK`);
  }
 }
 if(['all','scale'].includes(mode))for(const n of [500,1000,1500,2500]){
  // Synthetic controlled burden: caller, mentor, helper and positions stay fixed;
  // only unrelated dead/far entities are inserted before the fixed final helper.
  const e={id:1,hp:100,maxHp:100,x:0,y:0,faction:1,level:2,techniques:[],dao:{path:{key:'sword'}},relations:new Map([[2,{type:'mentor'}]])};initializeProfile(e);e.wanxiang.bonds=[{id:'shared_insight',expiresDay:20,targetKey:'mortal:2'}];
  const helper={id:2,hp:100,x:1,y:0,faction:1,state:'fight',dao:{path:{key:'fire'}}},world={day:10,plane:'mortal',entities:[e,...Array.from({length:n-2},(_,i)=>({id:i+3,hp:100,x:1000,y:1000})),helper]};
  const calls=1000,context={world,day:10,needed:new Set(['mentor_near','three_allies_near'])};
  for(const [name,fn]of [['peer',()=>deriveConditions(e,context)],['shared',()=>experienceEffects(e,10,world)]]){
   for(let i=0;i<100;i++)fn();const times=[];for(let round=0;round<5;round++){const t=performance.now();for(let i=0;i<calls;i++)fn();times.push(performance.now()-t);}
   api.metrics.enableWorkMetrics(world,true,{timing:false});for(let i=0;i<calls;i++)fn();const work=api.metrics.workMetricsSnapshot(world);api.metrics.enableWorkMetrics(world,false);
   report.scale.push({synthetic:true,n,name,calls,wallMs:distribution(times),microsecondsPerCall:times.map(t=>t*1000/calls),work});
  }
 }
 if(['all','micro'].includes(mode)){
  const cp=readCheckpoint(400),c=api.restore(cp.saved),before=digest(api.capture(c)),queries=[];const {maxHpFor,combatPower}=await api.load('sim/cultivation.js');
  api.effects.observeEffects((e,context,tag,out)=>{if(queries.length<10000)queries.push({e,context,tag,out});});
  try{for(let i=0;i<c.world.entities.length&&queries.length<10000;i++){const e=c.world.entities[i];if(!e.wanxiang)continue;maxHpFor(e,c.world.day,c.world);combatPower(e,c.world.day,c.world,c.world.entities[(i+1)%c.world.entities.length]);}}finally{api.effects.observeEffects();}
  const times=[];for(let round=0;round<6;round++){const t=performance.now();for(const q of queries)api.effects.readEffects(q.e,q.context,q.tag);times.push(performance.now()-t);}
  assert.equal(digest(api.capture(c)),before,'microbench is a pure read of a fixed native world');
  report.micro={checkpoint:{sha256:cp.sha256,bytes:cp.bytes},queries:queries.length,sources:[...new Set(queries.map(q=>q.tag))],worldCopies:1,warmupRounds:1,timedRounds:5,wallMs:distribution(times.slice(1)),unsupported:['Live event contexts that cannot be frozen without changing implicit dependencies are excluded; this sample uses actual maxHpFor and combatPower queries on an immutable 400-year restore.'],inputPreserved:true};
 }
 report.exitCode=0;
}catch(e){report.error=e.stack;report.exitCode=1;throw e;}finally{api.effects.measureEffects(false);writeJson(out,report);}
