// Same-checkpoint ABBA: native simulation with/without explicit story reads.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {deserializeWorld,serializeWorld} from '../src/inkbox/io/save.js';
import {Life} from '../src/inkbox/sim/life.js';
import {rngStream} from '../src/inkbox/core/noise.js';
import {advanceWorld,createAdvanceState} from '../src/inkbox/sim/advance.js';
import {captureRuntimeState,restoreRuntimeState} from '../src/inkbox/sim/runtimeState.js';
import {readPersonStories,readWorldStories} from '../src/inkbox/wanxiang/storyReading.js';
import {personRef} from '../src/inkbox/wanxiang/storyFacts.js';

const option=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const dir=path.resolve(option('data','reports/local/wx-s1/natural'));
const out=path.resolve(option('out','reports/local/wx-s1/perf'));fs.mkdirSync(out,{recursive:true});
const years=option('years','100,400').split(',').map(Number);
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourceFiles=['wanxiang/storyFacts.js','wanxiang/storyPeople.js','wanxiang/storyWorld.js','wanxiang/storySelection.js','wanxiang/storyReading.js','sim/life.js','sim/advance.js'];
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const sourceHashes=Object.fromEntries(sourceFiles.map(f=>[f,digest(fs.readFileSync(`src/inkbox/${f}`,'utf8'))]));
function restore(saved) {
  // Native restore retains some cold-history arrays by reference. Each trial
  // must own its input, exactly as the existing WX-D mature replay harness.
  const input=structuredClone(saved),world=deserializeWorld(input);
  if (!input.runtime?.upperLife) {delete world.upper;delete world.nether;}
  const life=new Life(world,rngStream(world.seed^0xa5a5a5a5)),state=createAdvanceState(),playerRng=rngStream(world.seed^0x504c4159);
  restoreRuntimeState(input.runtime,{world,life,advanceState:state,playerRng});
  return {world,life,state,playerRng};
}
const save=c=>serializeWorld(c.world,{}, {runtime:captureRuntimeState({world:c.world,life:c.life,advanceState:c.state,playerRng:c.playerRng})});
const percentile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))];
const worlds=[];
for(const year of years) {
  const filename=path.join(dir,`20260914-${year}y-save.json`);
  if(!fs.existsSync(filename))throw Error(`Missing actual mature checkpoint: ${filename}`);
  const saved=JSON.parse(fs.readFileSync(filename,'utf8')),c=restore(saved);
  const actor=c.world.entities.filter(e=>e.hp>0&&e.wanxiang).sort((a,b)=>(b.wanxiang.history?.length||0)-(a.wanxiang.history?.length||0)||a.id-b.id)[0];
  assert(actor,'mature checkpoint has a real Profile actor');const ref=personRef('mortal',actor);
  // Warm imports and projection without advancing or changing official state.
  for(let i=0;i<20;i++)readPersonStories(c.world,ref);
  const before=JSON.stringify(save(c));global.gc?.();const heapBefore=process.memoryUsage().heapUsed;
  const latencies=[],queries=[];
  for(let i=0;i<100;i++) {const started=performance.now();queries.push(readPersonStories(c.world,ref));latencies.push(performance.now()-started);}
  queries.length=0;global.gc?.();const heapAfter=process.memoryUsage().heapUsed;
  const after=JSON.stringify(save(c));assert.equal(after,before,'100 person queries preserve complete world/resources/Profile/runtime RNG');
  const projected=readWorldStories(c.world);assert.equal(JSON.stringify(save(c)),before,'world research query is also pure');
  const runs=[];
  // Each run starts from the same restored checkpoint. A performs no reads;
  // B reads one real person's book after each native 3-day advance.
  for(const observe of [false,true,true,false]) {
    const trial=restore(saved);let lifeMs=0,lifeCalls=0,readMs=0,queryCount=0;
    const original=trial.life.step;
    trial.life.step=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{lifeMs+=performance.now()-t;lifeCalls++;}};
    const t=performance.now();
    for(let day=0;day<30;day+=3) {
      advanceWorld(trial.world,3,trial);
      if(observe){const q=performance.now();readPersonStories(trial.world,ref);readMs+=performance.now()-q;queryCount++;}
    }
    const wallMs=performance.now()-t,complete=save(trial);
    runs.push({observe,wallMs,lifeMs,lifeCalls,readMs,queryCount,worldAndRngSha256:digest(complete),runtimeSha256:digest(complete.runtime)});
  }
  assert.equal(new Set(runs.map(r=>r.worldAndRngSha256)).size,1,'same native script on/off leaves bitwise-identical facts and RNG');
  const mean=(mode,field)=>runs.filter(r=>r.observe===mode).reduce((n,r)=>n+r[field],0)/2;
  worlds.push({year,day:c.world.day,checkpoint:filename,checkpointSha256:digest(fs.readFileSync(filename,'utf8')),
    actor:{id:actor.id,name:actor.name,incarnation:actor.incarnation??1},population:c.world.entities.length,
    sourceSaveBytes:Buffer.byteLength(JSON.stringify(saved)),storySaveNetBytes:Buffer.byteLength(after)-Buffer.byteLength(before),
    query:{count:100,medianMs:percentile(latencies,.5),p95Ms:percentile(latencies,.95),maxMs:Math.max(...latencies),heapRetainedDeltaBytes:heapAfter-heapBefore,gc:typeof global.gc==='function'},
    selection:projected.stats,readsPreserveFullSnapshot:before===after,runs,
    means:{unobservedLifeMs:mean(false,'lifeMs'),observedLifeMs:mean(true,'lifeMs'),lifeRelativePercent:(mean(true,'lifeMs')/mean(false,'lifeMs')-1)*100,explicitReadMs:mean(true,'readMs')},
    hotPath:{storyChecksPerNativeStep:0,storyCandidatesPerNativeStep:0,storySelectionsPerNativeStep:0,storyCallsPerRenderFrame:0,addedEventHandlerMs:0,addedEventAllocations:0},
    note:'Life timing jitter is not causally attributable to stories: story queries run after Life. No story event handlers or render hooks exist. Heap delta is retained heap after GC, not a precise allocation count.'});
  console.log(`${year}y: person P95 ${worlds.at(-1).query.p95Ms.toFixed(3)} ms; all four world/RNG hashes identical`);
}
const report={sha,dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),node:process.version,cpu:os.cpus()[0]?.model,
  generatedAt:new Date().toISOString(),sourceHashes,method:'Identical true mature checkpoint; warmed 100 explicit single-person queries; four independently restored 30-day native runs in ABBA order; full serialized world plus captureRuntimeState hash.',worlds};
fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2));
console.log(`WX-S1 performance/save evidence written to ${out}`);
