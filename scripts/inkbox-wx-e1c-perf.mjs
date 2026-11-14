import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {ROOT,option,source,environment,readCheckpoint,exportReference,nativeApi,advanceDays,digest,writeJson,distribution} from './inkbox-wx-e1c-common.mjs';
const report={environment:environment(),candidate:source(),reference:exportReference(),method:'diagnostics OFF, one independent warmup/source then ABBAABBA (4 restores/version). Native advance only; restore and serialize timed separately. Full world and all registered runtime/RNG must match. No shared mutable checkpoint.',cases:[]};
const api={A:await nativeApi(report.reference.root),B:await nativeApi(ROOT)},out=option('out','reports/local/wx-e1c/perf/native.json'),days=Number(option('days','30'));
assert(days>0&&days<=360);
function trial(name,saved,dt,{countOnly=false}={}){
 const a=api[name],restoreStart=performance.now(),c=a.restore(saved),restoreMs=performance.now()-restoreStart;
 a.effects.measureEffects(false);if(countOnly)a.metrics.enableWorkMetrics(c.world,true,{timing:false});
 const steps=[],cpuStart=process.cpuUsage(),start=performance.now();let elapsed=0;
 while(elapsed<days-1e-9){const amount=Math.min(dt,days-elapsed),t=performance.now();a.advance(c,amount);steps.push(performance.now()-t);elapsed+=amount;}
 const wallMs=performance.now()-start,cpu=process.cpuUsage(cpuStart),serializeStart=performance.now(),full=a.capture(c),json=JSON.stringify(full),serializationMs=performance.now()-serializeStart;
 return {name,countOnly,wallMs,cpuMs:(cpu.user+cpu.system)/1000,restoreMs,serializationMs,stepMs:steps,stepDistribution:distribution(steps),saveBytes:Buffer.byteLength(json),fullSha256:digest(json),runtimeSha256:digest(full.runtime),work:a.metrics.workMetricsSnapshot(c.world)};
}
try{
 for(const age of option('ages','100,400').split(',').map(Number))for(const dt of option('dts','3,0.1').split(',').map(Number)){
  assert(dt>0&&dt<=30);const cp=readCheckpoint(age),input=digest(cp.saved),row={age,days,dt,checkpoint:{file:cp.file,bytes:cp.bytes,sha256:cp.sha256},warmups:[],paired:[],counted:[]};report.cases.push(row);
  if(option('mode','all')!=='count'){
   for(const name of ['A','B']){const c=api[name].restore(cp.saved);api[name].effects.measureEffects(false);advanceDays(api[name],c,days,dt);row.warmups.push(name);}
   for(const name of ['A','B','B','A','A','B','B','A']){const result=trial(name,cp.saved,dt);row.paired.push(result);writeJson(out,report);console.log(`PAIR ${age}y dt=${dt} ${name}: ${result.wallMs.toFixed(1)}ms`);}
   assert.equal(new Set(row.paired.map(r=>r.fullSha256)).size,1,'A/B repeated full world+RNG identity');
   row.summary=Object.fromEntries(['A','B'].map(name=>{const rows=row.paired.filter(r=>r.name===name);return [name,{wallMs:distribution(rows.map(r=>r.wallMs)),cpuMs:distribution(rows.map(r=>r.cpuMs)),stepMs:distribution(rows.flatMap(r=>r.stepMs)),restoreMs:distribution(rows.map(r=>r.restoreMs)),serializationMs:distribution(rows.map(r=>r.serializationMs))}];}));
   row.ratios={median:row.summary.B.wallMs.p50/row.summary.A.wallMs.p50,p95:row.summary.B.stepMs.p95/row.summary.A.stepMs.p95,p99:row.summary.B.stepMs.p99/row.summary.A.stepMs.p99};
   row.tailReview=row.ratios.p95>1.25||row.ratios.p99>1.25?'requires investigation; single small-sample ratio is not proof of sustained regression':'no >25% observed step tail ratio in this sample';
  }
  // Exact logical work is tested independently of clocks and repeatable on the
  // same native input. No diagnostics-on timing is advertised as performance.
  for(let i=0;i<2;i++)row.counted.push(trial('B',cp.saved,dt,{countOnly:true}));
  assert.deepEqual(row.counted[0].work,row.counted[1].work,'same-source pure counters repeat exactly');
  assert.equal(row.counted[0].fullSha256,row.counted[1].fullSha256);
  if(row.paired.length)assert.equal(row.counted[0].fullSha256,row.paired[0].fullSha256,'counting preserves complete world/RNG');
  assert.equal(row.counted[0].work['experience.active.arrays']||0,0);assert.equal(row.counted[0].work['experience.active.copied']||0,0);
  assert.equal(digest(cp.saved),input);row.fullWorldAndRngEqual=true;row.logicalCountsRepeat=true;writeJson(out,report);
 }
 report.exitCode=0;
}catch(e){report.error=e.stack;report.exitCode=1;throw e;}finally{writeJson(out,report);}
