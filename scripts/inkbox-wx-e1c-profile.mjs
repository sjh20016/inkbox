// CPU evidence parser. Sampling estimates are never function wall times.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const hash=b=>createHash('sha256').update(b).digest('hex');
const opt=(n,d)=>process.argv.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3)??d;
const root=path.resolve(opt('source',process.cwd()));

function location(frame){
 let file=frame.url||'',local=null;
 try{local=file.startsWith('file:')?fileURLToPath(file):path.isAbsolute(file)?file:null;}catch{}
 if(local&&local.startsWith(root+path.sep))file=path.relative(root,local).replaceAll('\\','/');
 const line=(frame.lineNumber??-1)+1,column=(frame.columnNumber??-1)+1;
 let sourceLine=null;try{if(local&&line>0)sourceLine=fs.readFileSync(local,'utf8').split(/\r?\n/)[line-1]?.trim()??null;}catch{}
 return {file:file||'(V8/runtime)',line,column,sourceLine};
}
function classify(row){
 const f=row.file,n=row.functionName;
 if(f.includes('/world/wanlingState.js'))return {cost:'effect list (cap64) with source/target O(N) entity.find',allocation:'iteration with find callbacks; no exact heap bytes measured',action:'real adjacent hotspot, outside current shared/mentor/ally increment'};
 if(f.includes('/world/wanlingInfluence.js'))return {cost:'constant form checks; soundCalm delegates effect-list * O(N) lookups',allocation:'small literals/callbacks as present; no exact heap bytes measured',action:'inclusive dependency must not be added twice; adjacent debt'};
 if(f.includes('/world/worldgenNether.js'))return {cost:n==='stampPolyline'?'O(polyline length * radius squared)':'O(terrain cells)',allocation:'initial terrain generation; harness restore dependency',action:'setup work, outside measured advance; no worldgen change'};
 if(f.includes('/world/transitGeography.js'))return {cost:'O(terrain cells + adjacency edges) topology flood fill',allocation:'Int32Array/Uint32Array and neighbor arrays',action:'setup/dirty-topology work; outside selected peer query increment'};
 if(f.includes('/wanxiang/profile.js'))return {cost:n==='clone'?'O(profile data bytes) structuredClone':'bounded profile lists and encoded profile data',allocation:n==='clone'?'complete profile clone':'temporary arrays/Sets/JSON validation string',action:'restore/save validation, no format or schema change'};
 if(f.includes('/sim/sects.js'))return {cost:'O(villages * entities) on established sect boundary',allocation:'resident scan has no output array',action:'protect sect support/affiliation; separate existing subsystem debt'};
 if(n==='digest'||n==='update'||n==='utf8Slice'||n==='structuredClone')return {cost:'O(input bytes or object graph)',allocation:'encoding/clone/digest buffers',action:'harness capture/hash/restore caller chain; not constant simulation work'};
 if(f.includes('/wanxiang/conditions.js'))return {cost:n==='near'?'O(1) per candidate; called by O(N) peer scan':n==='(anonymous)'?'bounded recent-fact ledger predicate':'bounded fields plus qualified O(N) peer scan',allocation:n==='near'?'no result buffer; per-call closure is created by parent':'closure/result object; CPU cannot attribute allocation bytes',action:n==='(anonymous)'?'retain recent-fact semantics; not selected peer scan work':'candidate: live peer query; first mentor order and full map are invariants'};
 if(f.includes('/wanxiang/experiences.js'))return {cost:'bounded trait/state lists plus qualified O(N) helper search',allocation:'invocation-local Set and filtered bonds; not repeated active arrays',action:'candidate: exact plane/id lookup; live hp and distance'};
 if(f.includes('/wanxiang/effects.js'))return {cost:'bounded catalog/effect axes plus transitive peer/helper work',allocation:'returned effect map and catalog temporaries',action:'retain accumulation order; no whole-step effect snapshot'};
 if(n==='(garbage collector)')return {cost:'runtime GC',allocation:'observed GC samples; not exclusive allocation cost or bytes',action:'context only; no direct L0 rule change justified'};
 if(f.includes('/sim/life.js'))return {cost:['forEachNear','findEnemy','(anonymous)'].includes(n)?'local grid candidates; dense worst case O(N)':n==='moveTowards'?'movement substeps depend on distance/dt':'per-entity work or O(N) loop; inclusive children overlap',allocation:'callbacks/temporary scalar data as present; no exact heap attribution',action:'protect existing step-start Life.grid, movement, death and phase/RNG order'};
 if(/save|runtimeState/.test(f))return {cost:'world/terrain/runtime serialization or restore',allocation:'restore/capture allocations; outside advance timing',action:'profile includes harness setup/teardown; do not call it simulation speedup'};
 if(/node:|internal\/|\(V8/.test(f))return {cost:'runtime or harness; inspect inclusive caller chain',allocation:'not measured by CPU profile',action:'context only'};
 return {cost:'inspect source and inclusive chain; no complexity inferred from rank',allocation:'not measured by CPU profile',action:'outside selected identity/peer L0 increment unless new evidence requires it'};
}
export function parseCpuProfile(file){
 const bytes=fs.readFileSync(file),p=JSON.parse(bytes),nodes=new Map(p.nodes.map(n=>[n.id,n])),parent=new Map();
 for(const n of p.nodes)for(const id of n.children||[])parent.set(id,n.id);
 const samples=p.samples||[],deltas=p.timeDeltas||[],timed=samples.length>0&&deltas.length===samples.length&&deltas.every(d=>Number.isFinite(d)&&d>=0);
 const counts=new Map(),weights=new Map(),inclusive=new Map(),inclusiveWeights=new Map();
 for(let i=0;i<samples.length;i++){
  const id=samples[i];if(!nodes.has(id))throw Error('Unknown sample node '+id);
  counts.set(id,(counts.get(id)||0)+1);if(timed)weights.set(id,(weights.get(id)||0)+deltas[i]);
  const seen=new Set();let at=id;while(nodes.has(at)&&!seen.has(at)){seen.add(at);inclusive.set(at,(inclusive.get(at)||0)+1);if(timed)inclusiveWeights.set(at,(inclusiveWeights.get(at)||0)+deltas[i]);at=parent.get(at);}
 }
 const grouped=new Map();
 for(const n of p.nodes){
  const loc=location(n.callFrame),functionName=n.callFrame.functionName||'(anonymous)',key=JSON.stringify([functionName,loc.file,loc.line,loc.column]);
  let row=grouped.get(key);if(!row){row={functionName,...loc,selfSamples:0,nodeHitCount:0,estimatedSelfMs:timed?0:null,nodeIds:[]};grouped.set(key,row);}
  row.selfSamples+=samples.length?(counts.get(n.id)||0):(n.hitCount||0);row.nodeHitCount+=n.hitCount||0;row.nodeIds.push(n.id);if(timed)row.estimatedSelfMs+=(weights.get(n.id)||0)/1000;
 }
 const chain=id=>{const result=[],seen=new Set();let at=id;while(nodes.has(at)&&!seen.has(at)){seen.add(at);const n=nodes.get(at);result.unshift({functionName:n.callFrame.functionName||'(anonymous)',...location(n.callFrame)});at=parent.get(at);}return result;};
 const rows=[...grouped.values()].filter(r=>r.selfSamples>0).sort((a,b)=>b.selfSamples-a.selfSamples||String(a.file).localeCompare(b.file));
 const top25=rows.slice(0,25).map(r=>({...r,share:r.selfSamples/(samples.length||rows.reduce((s,r)=>s+r.selfSamples,0)),...classify(r),inclusiveCallPaths:r.nodeIds.map(id=>({nodeId:id,inclusiveSamples:inclusive.get(id)||0,estimatedInclusiveMs:timed?(inclusiveWeights.get(id)||0)/1000:null,path:chain(id)})).sort((a,b)=>b.inclusiveSamples-a.inclusiveSamples).slice(0,3)}));
 return {file:path.resolve(file),sha256:hash(bytes),bytes:bytes.length,nodes:p.nodes.length,totalNodeHitCount:p.nodes.reduce((s,n)=>s+(n.hitCount||0),0),samples:samples.length,timeDeltas:deltas.length,negativeDeltas:deltas.filter(d=>d<0).length,deltaRange:deltas.length?[Math.min(...deltas),Math.max(...deltas)]:null,profileSpanMs:(p.endTime-p.startTime)/1000,sampledTimeMs:timed?deltas.reduce((a,b)=>a+b,0)/1000:null,timeBasis:timed?'timeDeltas in microseconds; weighted CPU sampling estimate, NOT function wall time':'hit/sample counts only; time estimates unavailable because timeDeltas are missing, mismatched or negative',scope:'node --cpu-prof covers entire process including bootstrap, restore and serialization; simulation-only wall time is recorded separately in the native profile JSON',top25};
}
const files=process.argv.slice(2).filter(a=>!a.startsWith('--'));
if(files.length){const out=opt('out','reports/local/wx-e1c/top25.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({parserSourceSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),profiles:files.map(parseCpuProfile)},null,2));console.log('CPU Top25 parsed: '+files.length+' profiles -> '+out);}
