// Repeated same-source mature checkpoint; no cross-content optimization claim.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { Life } from '../src/inkbox/sim/life.js';
import { rngStream } from '../src/inkbox/core/noise.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { captureRuntimeState, restoreRuntimeState } from '../src/inkbox/sim/runtimeState.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { enableWorkMetrics, workMetricsSnapshot } from '../src/inkbox/sim/workMetrics.js';
const option=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const source=option('save','reports/local/wanxiang-d/profile/20260914-400y-save.json');
const input=readFileSync(source),saved=JSON.parse(input);
assert(saved.runtime,'a real G8 runtime checkpoint is required');
const days=Number(option('days','30'));assert(Number.isInteger(days)&&days>0&&days<=360);
const rows=[];let digest;
for(let run=-1;run<4;run++){
  const world=deserializeWorld(structuredClone(saved));if(!saved.runtime.upperLife){delete world.upper;delete world.nether;}
  const life=new Life(world,rngStream(world.seed^0xa5a5a5a5)),state=createAdvanceState(),playerRng=rngStream(world.seed^0x504c4159);
  restoreRuntimeState(saved.runtime,{world,life,advanceState:state,playerRng});enableWorkMetrics(world);
  const start=performance.now(),cpuStart=process.cpuUsage();
  for(let elapsed=0;elapsed<days;elapsed+=3)advanceWorld(world,Math.min(3,days-elapsed),{life,state});
  const cpu=process.cpuUsage(cpuStart),wallMs=performance.now()-start;
  const serializationStart=performance.now();
  const json=JSON.stringify(serializeWorld(world,{}, {runtime:captureRuntimeState({world,life,advanceState:state,playerRng})}));
  const serializationWallMs=performance.now()-serializationStart,hash=createHash('sha256').update(json).digest('hex');
  if(digest)assert.equal(hash,digest,'each restored mature trial produces identical worlds and RNG');else digest=hash;
  if(run>=0)rows.push({run,days,wallMs,cpuMs:(cpu.user+cpu.system)/1000,serializationWallMs,saveBytes:Buffer.byteLength(json),work:workMetricsSnapshot(world)});
}
const out=option('out','reports/local/wanxiang-d/perf.json');mkdirSync(dirname(resolve(out)),{recursive:true});
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
writeFileSync(out,JSON.stringify({sha:git(['rev-parse','HEAD']),dirty:!!git(['status','--porcelain','--untracked-files=no']),node:process.version,cpu:os.cpus()[0]?.model,
  source,sourceSha256:createHash('sha256').update(input).digest('hex'),year:saved.day/360,digest,
  method:'Four 30-day native trials after one warmup, restoring the same real mature v11 world each time. Wall phase attribution is inclusive, process CPU includes native simulation only. Not a baseline speedup claim or GPU test.',rows},null,2));
console.log(`WX-D mature checkpoint performance and identical replay: ${out}`);
