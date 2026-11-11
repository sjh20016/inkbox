// Native, pinned-source comparison. Diagnostics and uninstrumented timings are
// separate trials. No alternative simulation clock, world generator or facts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {digest,sourceInfo,nativeApi,contextSummary,assertNativeInvariants,advanceDays} from './inkbox-wx-e0-replay.mjs';

const option=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const days=Number(option('days','30')),dt=Number(option('dt','3')),replayDays=Number(option('replay-days','90'));
assert(days>0&&days<=360&&replayDays>0&&replayDays<=360&&dt>0&&dt<=30);
const savePath=path.resolve(option('save','reports/local/wx-e0/checkpoints/20260914-100y-save.json'));
const input=fs.readFileSync(savePath),saved=JSON.parse(input),inputBefore=digest(saved);
assert(saved.runtime,'a genuine native runtime checkpoint is required');
const directories={
  original:option('original','reports/local/wx-e0/baseline-source'),
  metrics:option('metrics','reports/local/wx-e0/metrics-source'),
  capacity:option('capacity','reports/local/wx-e0/s-capacity-source'),
  eligibility:option('eligibility','reports/local/wx-e0/b-skills-source'),
  candidate:option('candidate',root)
};
const apis={},sources={};
for(const [name,dir] of Object.entries(directories)){
  const absolute=path.resolve(dir);sources[name]=sourceInfo(absolute);apis[name]=await nativeApi(absolute);
  if(name!=='candidate')assert(sources[name].pinnedExport,`${name} needs a verified WX_E0_SOURCE.json export manifest`);
}
const quantile=(values,p)=>{const v=[...values].sort((a,b)=>a-b);return v[Math.max(0,Math.ceil(v.length*p)-1)]??null;};
const distribution=values=>({n:values.length,median:quantile(values,.5),p95:quantile(values,.95),p99:quantile(values,.99),max:values.length?Math.max(...values):null});
function runtimeDifferences(a,b,prefix='runtime'){
  if(Object.is(a,b))return [];
  if(a&&b&&typeof a==='object'&&typeof b==='object')return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>runtimeDifferences(a[k],b[k],`${prefix}.${k}`));
  return [{path:prefix,before:a??null,after:b??null}];
}
function trial(name,{measure=false,window=days}={}){
  const api=apis[name],c=api.restore(saved,{measure});return runContext(name,api,c,{measure,window});
}
function runContext(name,api,c,{measure=false,window=days}={}){
  const startDay=c.world.day,initial=contextSummary(api,c.world,{sinceDay:startDay}),stepWallMs=[];
  const effects=api.effects.measureEffects(measure),cpuStart=process.cpuUsage(),start=performance.now();
  let elapsed=0;
  try{
    while(elapsed<window-1e-9){const amount=Math.min(dt,window-elapsed),t=performance.now();api.advance(c,amount);stepWallMs.push(performance.now()-t);elapsed+=amount;}
  }finally{api.effects.measureEffects(false);}
  const wallMs=performance.now()-start,cpu=process.cpuUsage(cpuStart);
  const work=api.metrics.workMetricsSnapshot(c.world);
  if(!measure)assert.deepEqual(work,{},'default-off trial must not allocate diagnostic rows');
  assertNativeInvariants(api,c);
  const serializationStart=performance.now(),full=api.capture(c),json=JSON.stringify(full),serializationWallMs=performance.now()-serializationStart;
  return {full,row:{name,measure,window,dt,wallMs,cpuMs:(cpu.user+cpu.system)/1000,stepWallMs,stepDistributionMs:distribution(stepWallMs),
    serializationWallMs,saveBytes:Buffer.byteLength(json),fullSha256:digest(json),runtimeSha256:digest(full.runtime),runtime:full.runtime,
    initial,final:contextSummary(api,c.world,{sinceDay:startDay}),work,effects:effects?structuredClone(effects):null}};
}
const report={createdAt:new Date().toISOString(),node:process.version,platform:process.platform,os:os.release(),cpu:os.cpus()[0]?.model,
  logicalCpus:os.cpus().length,savePath,inputBytes:input.length,inputSha256:digest(input),checkpointDay:saved.day,days,dt,replayDays,sources,
  harnessHashes:Object.fromEntries(['scripts/inkbox-wx-e0-perf.mjs','scripts/inkbox-wx-e0-replay.mjs'].map(f=>[f,digest(fs.readFileSync(path.join(root,f)))])),
  method:'One native warmup per source; diagnostics OFF during original/candidate ABBAABBA trials (four restored runs per version). Per-step timings include native advance only; serialization/restore excluded. Separate ON/OFF diagnostic replays. Phase wall attribution is inclusive, not additive CPU time. Quantiles from ten steps/run and four whole-window samples are descriptive, not production latency guarantees.',
  warmups:[],paired:[],diagnostics:[],comparisons:[]};
for(const name of Object.keys(apis)){
  const api=apis[name],c=api.restore(saved);api.effects.measureEffects(false);advanceDays(api,c,days,dt);
  report.warmups.push({name,days});
}
for(const name of ['original','candidate','candidate','original','original','candidate','candidate','original']){
  const {row}=trial(name);report.paired.push(row);console.log(`PAIR ${name}: ${row.wallMs.toFixed(1)}ms CPU ${row.cpuMs.toFixed(1)}ms`);
}
const baselineRows=report.paired.filter(r=>r.name==='original'),candidateRows=report.paired.filter(r=>r.name==='candidate');
for(const [name,rows] of [['original',baselineRows],['candidate',candidateRows]])assert.equal(new Set(rows.map(r=>r.fullSha256)).size,1,`${name}: repeated independent restores preserve full world and registered RNG`);
report.timingSummary=Object.fromEntries([['original',baselineRows],['candidate',candidateRows]].map(([name,rows])=>[name,{wallMs:distribution(rows.map(r=>r.wallMs)),cpuMs:distribution(rows.map(r=>r.cpuMs)),
  stepsMs:distribution(rows.flatMap(r=>r.stepWallMs)),serializationMs:distribution(rows.map(r=>r.serializationWallMs))}]));
report.timingSummary.candidateToOriginal={medianWall:report.timingSummary.candidate.wallMs.median/report.timingSummary.original.wallMs.median,
  p95Wall:report.timingSummary.candidate.wallMs.p95/report.timingSummary.original.wallMs.p95,
  p95Step:report.timingSummary.candidate.stepsMs.p95/report.timingSummary.original.stepsMs.p95};
const diagnosticByName={};let candidateFull;
for(const name of Object.keys(apis)){
  const off=trial(name,{window:replayDays}),on=trial(name,{measure:true,window:replayDays});
  assert.equal(off.row.fullSha256,on.row.fullSha256,`${name}: observation preserves complete world and all registered RNG`);
  if(['eligibility','candidate'].includes(name))assert.equal(on.row.work['skills.manaCapacity']||0,on.row.work['skills.calls']||0,'one resource capacity evaluation per entered update');
  diagnosticByName[name]=on.row;report.diagnostics.push({off:off.row,on:on.row,observationEqual:true});
  if(name==='candidate')candidateFull=on.full;
  console.log(`REPLAY ${name}: ${replayDays}d OFF/ON identical`);
}
for(const name of ['metrics','capacity']){
  const reference=diagnosticByName.original,current=diagnosticByName[name];
  assert.equal(reference.fullSha256,current.fullSha256,`${name}: S-class must preserve complete original world and registered RNG`);
  report.comparisons.push({classification:'S',before:'original',after:name,fullWorldAndRuntimeEqual:true,registeredRuntimeEqual:true});
}
for(const [before,after] of [['capacity','eligibility'],['eligibility','candidate']]){
  const a=diagnosticByName[before],b=diagnosticByName[after];
  report.comparisons.push({classification:'B',before,after,fullWorldAndRuntimeEqual:a.fullSha256===b.fullSha256,
    registeredRuntimeEqual:a.runtimeSha256===b.runtimeSha256,runtimeDifferences:runtimeDifferences(a.runtime,b.runtime),
    policy:after==='eligibility'?'Plain level-zero profiles without combat/equipment no longer initialize or maintain skill resources; existing combat/equipment remains eligible.':'Nearest valid opportunity skips formations and contentless caves; fallback/target changes may change subsequent native RNG consumption.'});
}
// A real v11 native snapshot, serialized through JSON, restored independently
// twice. This is a restore determinism proof, not a claim of lossless terrain
// serialization versus an uninterrupted in-memory world.
const restoredInput=JSON.parse(JSON.stringify(candidateFull)),restores=[];
for(let i=0;i<2;i++)restores.push(runContext('candidate-restored',apis.candidate,apis.candidate.restore(restoredInput),{window:days}));
assert.equal(restores[0].row.fullSha256,restores[1].row.fullSha256,'two native saved continuations reproduce full world and registered RNG');
report.saveRestore={inputSha256:digest(restoredInput),window:days,fullWorldAndRuntimeEqual:true,runs:restores.map(r=>r.row)};
assert.equal(digest(saved),inputBefore,'all trials preserve the original checkpoint object');report.inputPreserved=true;
const out=path.resolve(option('out','reports/local/wx-e0/perf/native.json'));fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(`WX-E0 pinned native comparison: ${out}`);
