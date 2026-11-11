import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFile,mkdir,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import assert from 'node:assert/strict';
const arg=process.argv.find(a=>a.startsWith('--baseline='));
if(!arg){console.error('A separate baseline checkout is required. Usage: npm run profile:wanxiang:effects -- --baseline="/absolute/path/to/b50623b-checkout"');process.exit(2);}
const baseline=resolve(arg.slice('--baseline='.length));
try{await access(resolve(baseline,'src/inkbox/wanxiang/effects.js'));}catch{console.error(`Baseline has no Inkbox effect source: ${baseline}. Supply --baseline=<checkout>, not a release package.`);process.exit(2);}
const git=(root,args)=>{try{return execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch{return null;}};
const roots=[['baseline',baseline],['candidate',resolve('.')]],versions={};
for(const [version,root] of roots){
 versions[version]={root,sha:git(root,['rev-parse','HEAD']),tree:git(root,['rev-parse','HEAD^{tree}']),dirty:git(root,['status','--porcelain']),module:await import(pathToFileURL(resolve(root,'src/inkbox/wanxiang/effects.js'))),profile:await import(pathToFileURL(resolve(root,'src/inkbox/wanxiang/profile.js')))};
}
const rows=[];
for(const population of [100,300,500])for(const peers of [false,true]){
 const fixtures={};
 for(const [version] of roots){
  let scans=0;const {emptyProfile}=versions[version].profile;
  const entities=Array.from({length:population},(_,i)=>({id:i+1,hp:100,maxHp:100,level:3,x:i%20,y:Math.floor(i/20),faction:1,relations:new Map(),techniques:[],wanxiang:emptyProfile()}));
  // Both fixtures use WX-B consumers, so new combat axes do not alter the
  // simulated content used to claim an optimization benefit.
  for(const e of entities)e.wanxiang.hexagram={id:peers?'hex_45':'hex_01'};
  const world={day:10,plane:'mortal',get entities(){scans++;return entities;}};
  fixtures[version]={entities,world,scanCount:()=>scans,reset:()=>{scans=0;}};
  const {readEffects}=versions[version].module;
  for(let i=0;i<1500;i++)readEffects(entities[i%population],{world});
 }
 const baseResult=versions.baseline.module.readEffects(fixtures.baseline.entities[0],{world:fixtures.baseline.world});
 const candidateResult=versions.candidate.module.readEffects(fixtures.candidate.entities[0],{world:fixtures.candidate.world});
 for(const axis of Object.keys(baseResult))assert.equal(candidateResult[axis],baseResult[axis],`common fixture semantics ${axis}`);
 for(const [pass,version] of ['baseline','candidate','candidate','baseline'].entries()){
  const {entities,world,scanCount,reset}=fixtures[version],{readEffects,measureEffects}=versions[version].module;
  reset();const times=[],n=5000,m=measureEffects?.(true),start=performance.now();
  for(let i=0;i<n;i++){const e=entities[i%population];e.hp=i%2?20:100;const t=performance.now();readEffects(e,{world});times.push(performance.now()-t);}
  const elapsed=performance.now()-start;measureEffects?.(false);times.sort((a,b)=>a-b);
  rows.push({version,pass,fixture:'controlled synthetic effect context; not natural population',population,peers,calls:n,meanMs:elapsed/n,p95Ms:times[Math.floor(n*.95)],fullPopulationScanTriggers:scanCount(),phases:m||'baseline has no phase instrumentation'});
 }
}
const provenance=Object.fromEntries(Object.entries(versions).map(([v,{root,sha,tree,dirty}])=>[v,{root,sha,tree,dirty:dirty===null?null:dirty.length>0,dirtyPaths:dirty||'',note:v==='baseline'?'HEAD may be 9581e97: compare tree with b50623b rather than assuming equal commit IDs.':null}]));
const out={createdAt:new Date().toISOString(),node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,os:{type:os.type(),release:os.release(),arch:os.arch()},method:'per-fixture ABBA, both modules warmed 1500 calls before 5000-call samples; candidate phase timing instrumentation adds overhead',provenance,cache:{scope:'immutable catalog definitions only',invalidation:'No entity cache exists; entity invalidation rate is not applicable. Immutable catalog compilation needs no invalidation; module reload replaces it.',dynamic:'HP, target, expiry, dormancy, paid skill and relationship facts are recomputed every call.'},rows};
await mkdir('reports/local/wanxiang-c',{recursive:true});await writeFile('reports/local/wanxiang-c/effect-perf.json',JSON.stringify(out,null,2));console.log(JSON.stringify({provenance,rows},null,2));
