import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,option,checkpoint,source,environment,verifiedReference,nativeApi,contextSummary,assertNativeInvariants,digest,writeJson} from './inkbox-e-m2-common.mjs';
import {configureFrameBreakdown,snapshotFrameBreakdown} from '../src/inkbox/dev/frameBreakdown.js';
import {renderFrame,getEntityInspection,getWorldStatus,worldGeneration} from '../src/inkbox/presentation/readView/index.js';
import {getSettlementInspection} from '../src/inkbox/presentation/readView/query.js';
import {CommandBridge} from '../src/inkbox/presentation/readView/commandBridge.js';
import {readPersonStories,readObjectStories} from '../src/inkbox/wanxiang/storyReading.js';
const out=path.resolve(option('out','reports/local/wx-em2/native/acceptance.json'));
const reference=verifiedReference(),api={A:await nativeApi(reference.root),B:await nativeApi(ROOT)};
const report={pass:false,scope:'Same combined #72 feature set vs instrumentation and additional pure reads; no cross-feature-version L0 claim',reference,source:source(),environment:environment(),cases:[]};
const derive={A:await api.A.load('render3d/entities/deriveEntities.js'),B:await api.B.load('render3d/entities/deriveEntities.js')};
function extract(text,name,end){const a=text.indexOf('\n  '+name+'('),b=text.indexOf('\n  '+end,a);assert(a>=0&&b>a,'Full formal method exists '+name);return text.slice(a,b).trim();}
async function operations(impl){
 const main=fs.readFileSync(path.join(impl.root,'src/inkbox/main.js'),'utf8').replace(/\r\n?/g,'\n');
 const [config,map,tools,powers,presentation,terrain,opportunity,feedback,busanzi]=await Promise.all(['core/config.js','world/mapProgress.js','ui/tools.js','sim/powers.js','sim/toolPresentation.js','world/terrainChanges.js','ui/opportunityTools.js','sim/interventionFeedback.js','sim/busanzi.js'].map(impl.load));
 const scope={LIMITS:config.LIMITS,accessBounds:map.accessBounds,canAccess:map.canAccess,observeToolBefore:presentation.observeToolBefore,observeToolAfter:presentation.observeToolAfter,noteAllTerrain:terrain.noteAllTerrain,showOpportunityPlacement:opportunity.showOpportunityPlacement,CAUSAL_TOOL_IDS:feedback.CAUSAL_TOOL_IDS,createInterventionOutcome:feedback.createInterventionOutcome,reactToTool:busanzi.reactToTool};
 const applySource=extract(main,'applyTool','rebuildVillageCache()'),undoSource=extract(main,'undo','/** Q28');
 const apply=new Function(...Object.keys(scope),'return ({'+applySource+'}).applyTool;')(...Object.values(scope)),undo=new Function('return ({'+undoSource+'}).undo;')();
 return {applySource,undoSource,build(c){const bounds=map.accessBounds(c.world),point={x:Math.floor((bounds.x0+bounds.x1)/2),y:Math.floor((bounds.y0+bounds.y1)/2)},notices=[],dirty=[];
 const sb={world:c.world,life:c.life,rng:c.playerRng,history:new powers.History(),tool:tools.TOOL_BY_ID.raise,hoverTile:point,brushRadius:1,qol:{markDirty:k=>dirty.push(k),syncUndoState(){}},notify:m=>notices.push(m),refreshBusanzi(){},refreshChronicle(){},refreshMilestones(){},applyTool:apply,undo};
 return {execute(){sb.history.begin({toolId:'raise',...point,radius:1});sb.applyTool(true);sb.history.end('抬山');return {notices:[...notices],dirty:[...dirty],historyEntries:sb.history.stack.length};},undo:()=>sb.undo()};}};
}
const ops={A:await operations(api.A),B:await operations(api.B)};
assert.equal(ops.A.applySource,ops.B.applySource,'Full applyTool unchanged from combined #72');assert.equal(ops.A.undoSource,ops.B.undoSource,'Full undo unchanged');
report.formalMethodHashes={applyTool:digest(ops.A.applySource),undo:digest(ops.A.undoSource)};
function reads(c,row){for(const plane of ['mortal','upper','nether']){const w=plane==='mortal'?c.world:c.world[plane];if(!w)continue;const f=renderFrame(w,plane);assert.equal(f.committedDay,w.day);assert.equal(f.entityCount,w.entities.length);for(let i=0;i<w.entities.length;i++)for(const k of ['id','x','y','tx','ty','sp','level','hp','maxHp','faction'])assert(Object.is(f.entities[i][k],w.entities[i][k]),'DTO exact source '+k);assert(Object.isFrozen(f)&&Object.isFrozen(f.entities));getWorldStatus(w,plane);if(w.entities[0])getEntityInspection(w,plane,w.entities[0].id);if(w.villages?.[0])getSettlementInspection(w,plane,w.villages[0].id);row.readFrames++;}
 assert.deepEqual(derive.B.deriveEntities(c.world),derive.A.deriveEntities(c.world),'actual Three derived rows equal on same facts');
 for(const e of c.world.entities.filter(e=>e.wanxiang).slice(0,3))readPersonStories(c.world,'mortal:'+e.id);
 if(c.world.villages?.[0])readObjectStories(c.world,{kind:'settlement',plane:'mortal',id:c.world.villages[0].id});
}
function equalBoundary(c,row,label){const a=api.A.capture(c.A),b=api.B.capture(c.B);assert.deepEqual(b,a,'ENTIRE serializeWorld / ALL runtime RNG: '+label);const sha256=digest(b),runtimeSha256=digest(b.runtime);row.boundaries.push({label,day:c.B.world.day,sha256,runtimeSha256});return b;}
try{
 for(const age of option('ages','100,400').split(',').map(Number))for(const [days,dt]of [[30,3],[90,3],[3,.1]]){
  configureFrameBreakdown({enabled:true,reset:true,capacity:500000});const cp=checkpoint(age),input=digest(cp.saved),c={A:api.A.restore(cp.saved),B:api.B.restore(cp.saved)};
  const row={age,days,dt,input:{file:cp.file,sha256:cp.sha256,bytes:cp.bytes},readFrames:0,boundaries:[],sourceTags:[]};report.cases.push(row);
  const oa=ops.A.build(c.A),ob=ops.B.build(c.B),bridge=new CommandBridge(()=>c.B.world),generation=worldGeneration(c.B.world);
  const command=bridge.dispatch({worldGeneration:generation},()=>ob.execute());assert.deepEqual(command.value,oa.execute());assert(command.value.historyEntries>0);equalBoundary(c,row,'formal raised terrain');reads(c.B,row);equalBoundary(c,row,'pure observation');
  let elapsed=0,undone=false;while(elapsed<days-1e-9){const amount=Math.min(dt,days-elapsed);for(const name of ['A','B']){api[name].metrics.enableWorkMetrics(c[name].world,true,{timing:false});api[name].advance(c[name],amount);}elapsed+=amount;
   const counts={A:api.A.metrics.workMetricsSnapshot(c.A.world),B:api.B.metrics.workMetricsSnapshot(c.B.world)};assert.deepEqual(counts.B,counts.A,'instrumentation preserves deterministic logical work and every sourceTag');row.sourceTags.push(Object.fromEntries(Object.entries(counts.B).filter(([key])=>key.startsWith('effects.source.'))));
   equalBoundary(c,row,'advance '+elapsed);reads(c.B,row);equalBoundary(c,row,'reads '+elapsed);if(!undone){assert.equal(bridge.dispatch({worldGeneration:generation},()=>ob.undo()).value,oa.undo());undone=true;equalBoundary(c,row,'formal undo');}
  }
  const full=equalBoundary(c,row,'final');for(const name of ['A','B'])assertNativeInvariants(api[name],c[name]);
  const saved=JSON.parse(JSON.stringify(full)),forks=[];row.forkCommands=[];for(const name of ['A','B','B']){const f=api[name].restore(saved),op=ops[name].build(f),receipts=[];for(let i=0;i<2;i++){receipts.push(op.execute());api[name].advance(f,dt);receipts.push(op.undo());api[name].advance(f,dt);}row.forkCommands.push(receipts);forks.push(digest(api[name].capture(f)));}assert.equal(new Set(forks).size,1,'v11 independent restore/continuation command forks');assert.deepEqual(row.forkCommands[1],row.forkCommands[0]);assert.deepEqual(row.forkCommands[2],row.forkCommands[0]);
  const before=digest(api.B.capture(c.B));let ran=false;assert.equal(bridge.dispatch({worldGeneration:generation+10000},()=>{ran=true;}).reason,'stale-world');assert.equal(ran,false);assert.equal(digest(api.B.capture(c.B)),before);assert.equal(digest(cp.saved),input);
  const data=snapshotFrameBreakdown();assert.equal(data.dropped,0);assert.equal(data.activeSpans,0);row.diagnostics={samples:data.samples.length,dropped:data.dropped};row.forks=forks;row.finalSha256=digest(full);row.runtimeSha256=digest(full.runtime);row.context=contextSummary(api.B,c.B.world);row.fullSnapshot=path.join(path.dirname(out),`world-${age}-${days}-${dt}.json`);writeJson(row.fullSnapshot,full);row.equal=true;writeJson(out,report);console.log(`E-M2 ${age}y ${days}d/dt${dt}: ${row.boundaries.length} full world/runtime/RNG boundaries equal`);
 }
 const controls={};for(const name of ['A','B']){const a=api[name],c=a.fresh(73101),[{generateUpperWorld},{generateNetherWorld},{UpperLife}]=await Promise.all(['world/worldgenUpper.js','world/worldgenNether.js','sim/upperLife.js'].map(a.load));c.world.upper=generateUpperWorld({preset:{w:c.world.w,h:c.world.h},seed:c.world.seed});c.world.nether=generateNetherWorld({preset:{w:c.world.w,h:c.world.h},seed:c.world.seed});c.upperLife=new UpperLife(c.world.upper);controls[name]=c;}
 const control={natural:false,boundaries:[],readFrames:0};for(let i=0;i<30;i++){for(const name of ['A','B'])api[name].advance(controls[name],3);reads(controls.B,control);equalBoundary(controls,control,'controlled three-realms '+i);}report.controlRealms=control;report.pass=true;report.exitCode=0;
}catch(error){report.error=error.stack;report.exitCode=1;process.exitCode=1;}finally{configureFrameBreakdown({enabled:false});report.finishedAt=new Date().toISOString();writeJson(out,report);console.log(JSON.stringify({pass:report.pass,output:out,error:report.error}));}
