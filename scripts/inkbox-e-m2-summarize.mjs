import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=fs.existsSync('src/inkbox/main.js')?process.cwd():path.resolve('inkbox-wx-em2');
const file=path.join(root,process.argv[2]||'reports/local/wx-em2/browser-formal-resumed/report.json');
const report=JSON.parse(fs.readFileSync(file));
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const dist=a=>{const s=a.filter(Number.isFinite).sort((a,b)=>a-b),q=p=>s[Math.max(0,Math.ceil(s.length*p)-1)]??null;return {calls:s.length,total:s.reduce((a,b)=>a+b,0),p50:q(.5),p95:q(.95),p99:q(.99),max:s.at(-1)??null};};
assert(report.pass&&report.exitCode===0,'matrix must finish successfully');
assert.equal(report.serverCleanup.exited,true,'resumed server exited');
if(report.inherited){const prior=JSON.parse(fs.readFileSync(report.inherited.file));assert.equal(prior.serverCleanup.exited,true,'original server exited');const keys=x=>Object.keys(x.hashes).filter(p=>p.startsWith('src/')).sort();assert.deepEqual(keys(prior.source),keys(report.source),'exact source path sets');}
assert.equal(report.cases.length,72);assert.equal(new Set(report.cases.map(c=>c.id)).size,72);
const rows=[],evidence=[];
for(const c of report.cases){
 assert.equal(c.status,'observed');assert.equal(c.errors.length,0);assert(c.cleanup.complete,'owned Edge/profile cleanup complete');
 assert.equal(hash(c.rawFile),c.rawSha256,'raw file identity');
 const r=JSON.parse(fs.readFileSync(c.rawFile));assert.equal(r.breakdown.dropped,0);assert.equal(r.breakdown.activeSpans,0);
 const samples=new Map(r.breakdown.samples.map(s=>[s.id,s]));assert.equal(samples.size,r.breakdown.samples.length);
 const children=new Map();for(const s of samples.values()){if(s.parentId!==null){assert(samples.has(s.parentId),'complete parent graph');children.set(s.parentId,(children.get(s.parentId)||0)+s.inclusiveMs);}assert(s.inclusiveMs>=0&&s.exclusiveMs>=0);}
 for(const s of samples.values())assert(Math.abs(s.inclusiveMs-s.exclusiveMs-(children.get(s.id)||0))<.0001,'inclusive/exclusive conservation');
 const frames=r.frames,js=frames.map(f=>f.endMs-f.enterMs),gaps=frames.slice(1).map((f,i)=>f.enterMs-frames[i].endMs),advanced=frames.filter(f=>f.endDay>f.startDay),idle=frames.filter(f=>!(f.endDay>f.startDay));
 const raf=dist(frames.slice(1).map((f,i)=>f.rafTimestampMs-frames[i].rafTimestampMs)),elapsed=r.elapsedMs/1000,rate=(r.endDay-r.startDay)/elapsed,target=3*(c.speedIndex===0?0:c.speedIndex===2?2:20)*elapsed;
 assert.deepEqual(raf,c.summary.rafIntervalMs,'independent raw rAF reconstruction');assert.equal(rate,c.summary.completedDaysPerSecond);assert.equal(target,c.summary.wallTargetDays);assert.equal(Math.max(0,target-(r.endDay-r.startDay)),c.summary.unreconciledWallTargetDays);
 if(c.mode==='A')assert.equal(r.breakdown.samples.length,0,'A instrumentation off');else assert.equal(r.breakdown.samples.filter(s=>s.name==='frame').length,frames.length,'B captures each frame');
 assert.equal(frames.length,c.summary.jsFrameMs.calls);assert(Math.abs(frames.reduce((n,f)=>n+f.endDay-f.startDay,0)-(r.endDay-r.startDay))<1e-6,'all completed days accounted for');
 const cache=r.breakdown.samples.filter(s=>s.name==='readView.cache'),life=r.breakdown.samples.filter(s=>s.name==='life'),canvas=r.breakdown.samples.filter(s=>s.name==='render.canvas'),three=r.breakdown.samples.filter(s=>s.name==='render.three');
 const segments={};for(const s of samples.values()){const g=segments[s.name]??={inc:[],exc:[]};g.inc.push(s.inclusiveMs);g.exc.push(s.exclusiveMs);}
 const groups={simulating:dist(advanced.map(f=>f.endMs-f.enterMs)),notSimulating:dist(idle.map(f=>f.endMs-f.enterMs)),calendarCrossing:dist(advanced.filter(f=>Math.floor(f.endDay/30)!==Math.floor(f.startDay/30)).map(f=>f.endMs-f.enterMs)),actualTerritoryRebuild:dist(advanced.filter(f=>f.territoryRebuilt===true).map(f=>f.endMs-f.enterMs)),actualTerritoryUnchanged:dist(advanced.filter(f=>f.territoryRebuilt===false).map(f=>f.endMs-f.enterMs)),actualMarkerAvailable:frames.some(f=>'territoryRebuilt'in f)};
 const row={id:c.id,age:c.age,renderer:c.renderer,view:c.view,speedIndex:c.speedIndex,mode:c.mode,input:c.input,browser:c.browserVersion,rendererState:c.rendererState,elapsedMs:r.elapsedMs,completedDays:r.endDay-r.startDay,completedDaysPerSecond:c.summary.completedDaysPerSecond,wallTargetDays:c.summary.wallTargetDays,unreconciledWallTargetDays:c.summary.unreconciledWallTargetDays,queuedSimulationDays:0,jsFrameMs:dist(js),rafIntervalMs:c.summary.rafIntervalMs,betweenOwnedCallbacksMs:dist(gaps),gapDefinition:'Includes browser rendering, compositor/refresh, other tasks and waiting; not measured GPU execution time',longTaskMs:dist(r.longTasks.map(t=>t.durationMs)),longTaskCount:r.longTasks.length,over50msJs:js.filter(t=>t>50).length,over50msJsFraction:js.filter(t=>t>50).length/js.length,lifeShareOfOwnedJs:life.length?life.reduce((n,s)=>n+s.inclusiveMs,0)/js.reduce((a,b)=>a+b,0):null,projection:c.mode==='B'?{calls:cache.length,hits:cache.filter(s=>s.cacheHit).length,builds:cache.filter(s=>!s.cacheHit).length,copiedEntities:cache.reduce((n,s)=>n+(s.copiedEntities||0),0)}:null,segments:Object.fromEntries(Object.entries(segments).map(([k,g])=>[k,{inclusiveMs:dist(g.inc),exclusiveMs:dist(g.exc)}])),groups,heapBefore:c.heapBefore,heapAfter:c.heapAfter,rawFile:c.rawFile,rawSha256:c.rawSha256,screenshot:c.screenshot,cleanup:c.cleanup};
 rows.push(row);evidence.push({file:c.rawFile,sha256:c.rawSha256,bytes:fs.statSync(c.rawFile).size});
}
const matrix=new Map();for(const row of rows){const key=[row.age,row.renderer,row.view,row.speedIndex].join('/');if(!matrix.has(key))matrix.set(key,[]);matrix.get(key).push(row);}
assert.equal(matrix.size,24);for(const a of matrix.values()){assert.equal(a.length,3);assert.deepEqual(a.map(r=>r.mode),['A','B','A']);}
for(const age of [100,400])assert.equal(new Set(rows.filter(r=>r.age===age).map(r=>r.input.sha256)).size,1,'one exact input per age');
const summary={schemaVersion:1,pass:true,source:report.source,inherited:report.inherited,method:report.method,trialDefinition:'Three independent formal trials per scene, A/B/A; not three ABBA cycles',rawReport:{file,sha256:hash(file)},environment:report.environment,checks:{configurations:24,formalTrials:72,allParentGraphsClosed:true,exclusiveConservation:true,noDroppedSamples:true,allCompletedDaysAccounted:true,allOwnedCleanupComplete:true},rows,evidence};
const out=path.join(root,'reports/local/wx-em2/final-matrix.json');fs.writeFileSync(out,JSON.stringify(summary,null,2));
const table=['|Age|Renderer/view|Speed index|JS P95 A/B/A ms|rAF P95 A/B/A ms|Completed days/s A/B/A|','|---|---|---|---|---|---|'];for(const a of matrix.values()){const q=(key,d=1)=>a.map(r=>typeof key==='function'?key(r).toFixed(d):r[key].p95.toFixed(d)).join(' / ');table.push(`|${a[0].age}|${a[0].renderer}/${a[0].view}|${a[0].speedIndex}|${q('jsFrameMs')}|${q('rafIntervalMs')}|${q(r=>r.completedDaysPerSecond,3)}|`);}
fs.writeFileSync(path.join(root,'reports/local/wx-em2/final-matrix-table.md'),table.join('\n')+'\n');
console.log(JSON.stringify({pass:true,rows:rows.length,out,priority:rows.filter(r=>r.age===400&&r.speedIndex===2).map(r=>({id:r.id,jsP95:r.jsFrameMs.p95,rafP95:r.rafIntervalMs.p95,daysPerSecond:r.completedDaysPerSecond,lifeShare:r.lifeShareOfOwnedJs}))},null,2));
