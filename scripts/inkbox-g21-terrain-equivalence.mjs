import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { createMapProgress } from '../src/inkbox/world/mapProgress.js';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';

// A byte-buffer Canvas adapter isolates production pixel arithmetic from drivers.
// Both implementations still execute their original create/putImageData calls.
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {getContext(){return {createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};}};}};
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const relative='src/inkbox/render/terrainLayer.js';
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/g21-terrain-rgba.json'),'utf8'));
assert.equal(manifest.comparisons.length,324,'Fixed terrain manifest must retain every comparison');
const historical=process.argv.includes('--historical')||process.argv.includes('--benchmark');
let Original;
if(historical){
  let before;try{before=execFileSync('git',['show',`${manifest.baseline}:${relative}`],{cwd:ROOT,encoding:'utf8',windowsHide:true});}catch{throw new Error(`Historical diagnostic requires Git object ${manifest.baseline}; default fixture verification works without Git.`);}
  assert.equal(createHash('sha256').update(before).digest('hex'),manifest.baselineTerrainSourceSha256,'Historical terrain source differs from fixed reference');
  const importSource=source=>source.replace(/from\s+'([^']+)'/g,(_,specifier)=>`from '${pathToFileURL(path.resolve(ROOT,path.dirname(relative),specifier)).href}'`);
  ({TerrainLayer:Original}=await import('data:text/javascript;base64,'+Buffer.from(importSource(before)).toString('base64')));
}
const {TerrainLayer:Current}=await import('../src/inkbox/render/terrainLayer.js');
const report={pass:false,mode:historical?'Historical byte comparison plus fixed fixture':'Fixed fixture verification, no Git dependency',baseline:manifest.baseline,baselineTerrainSourceSha256:manifest.baselineTerrainSourceSha256,candidateSourceSha256:createHash('sha256').update(fs.readFileSync(path.join(ROOT,relative))).digest('hex'),scope:'Exact production RGBA against fixed SHA256 manifest; Canvas adapter excludes putImageData driver cost',comparisons:[]};
function compare(a,b,label,time){
  if(a)a.render(time,true);b.render(time,true);
  if(a){assert.equal(a.data.length,b.data.length,label+' buffer length');assert.deepEqual(a.data,b.data,label+' pixels');assert.equal(a.lastRender,b.lastRender);}
  const index=report.comparisons.length,result={index,label,time,bytes:b.data.length,sha256:createHash('sha256').update(b.data).digest('hex')};
  assert.deepEqual(result,manifest.comparisons[index],label+' fixed RGBA reference');report.comparisons.push(result);
}
for(const seed of [1,673231,20260924]){
  // Official realm factories, including shipping expanse size, cover palette paths.
  const worlds=[generateWorld({preset:WORLD_PRESETS.expanse,seed,scatter:false}),generateUpperWorld({preset:WORLD_PRESETS.small,seed}),generateNetherWorld({preset:WORLD_PRESETS.small,seed})];
  for(const [plane,world] of worlds.entries()){
    for(const relief of [true,false]){
      const a=Original?new Original(world,{relief}):null,b=new Current(world,{relief});
      for(const time of [0,.11,1,19.99,20,39.99,40,59.99,60,123.456,-1])compare(a,b,`seed${seed}/plane${plane}/relief${relief}`,time);
      createMapProgress(world,true);
      for(const stage of [0,1,2,3]){world.mapProgress.stage=stage;compare(a,b,`progressive${stage}/seed${seed}/plane${plane}/relief${relief}`,stage+.125);}
      delete world.mapProgress;
      // Explicit brush-like extremes exercise fire/qi/snow/cliffs and water thresholds.
      for(let i=0;i<world.size;i+=97){world.height[i]=(i%7)/6;world.water[i]=i%2?.0015:.3;world.fire[i]=.95;world.qi[i]=1;world.veg[i]=1;world.temp[i]=.1;}
      a?.invalidate();b.invalidate();compare(a,b,`modified/seed${seed}/plane${plane}/relief${relief}`,73.123);
      a?.setRelief(!relief);b.setRelief(!relief);compare(a,b,`toggleRelief/seed${seed}/plane${plane}`,83);
      const other=worlds[(plane+1)%worlds.length];a?.setWorld(other);b.setWorld(other);compare(a,b,`setWorld/seed${seed}/plane${plane}`,84);
      for(const now of [84,84.11,84.110001,85])for(const dirty of [false,true]){const expected=dirty||now-84>.11;assert.equal(b.needsRender(now,dirty),expected,'cadence unchanged');if(a)assert.equal(a.needsRender(now,dirty),expected);}
    }
  }
}
if(process.argv.includes('--benchmark')){
  const world=generateWorld({preset:WORLD_PRESETS.expanse,seed:673231,scatter:false});
  const sample=a=>{const sorted=[...a].sort((a,b)=>a-b);return {n:a.length,p50:sorted[45],p95:sorted[85],max:sorted.at(-1)};};
  report.arithmeticBenchmark={scope:'Node V8 production TerrainLayer.render arithmetic plus byte writes; Canvas adapter excludes driver. Diagnostic only, never whole-product acceptance.',order:['original','current','current','original'],warm:120,frames:90,runs:[]};
  for(const mode of report.arithmeticBenchmark.order){const layer=new (mode==='original'?Original:Current)(world);for(let i=0;i<120;i++)layer.render(1+i/60,true);const samples=[];for(let i=0;i<90;i++){const t=performance.now();layer.render(3+i/60,true);samples.push(performance.now()-t);}report.arithmeticBenchmark.runs.push({mode,metrics:sample(samples),samples});}
}
assert.equal(report.comparisons.length,manifest.comparisons.length,'Every fixed RGBA reference must be verified');
report.pass=true;
const out=path.resolve(process.env.INKBOX_REPORT_DIR||path.join(ROOT,'reports/release/g2.1-hardening/proof',historical?'performance-terrain-equivalence':'performance-terrain-fixture'));
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(report,null,2));
console.log(`Terrain exact byte equivalence: ${report.comparisons.length} comparisons pass`);
