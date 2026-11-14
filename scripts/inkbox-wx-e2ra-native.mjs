import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,BASE,option,source,environment,readCheckpoint,exportReference,nativeApi,digest,writeJson,advanceDays} from './inkbox-wx-e2ra-common.mjs';
import {renderFrame,getEntityInspection,getWorldStatus,worldGeneration} from '../src/inkbox/presentation/readView/index.js';
import {getSettlementInspection} from '../src/inkbox/presentation/readView/query.js';
import {CommandBridge} from '../src/inkbox/presentation/readView/commandBridge.js';

const out=option('out','reports/local/wx-e2ra/native.json'),reference=exportReference(),api={A:await nativeApi(reference.root),B:await nativeApi(ROOT)};
const report={source:source(),reference,environment:environment(),method:'same exact step and complete formal applyTool/undo sequence; candidate adds production read projections and synchronous command forwarding; all world/runtime/RNG compared',cases:[]};
function snapshot(full){const json=JSON.stringify(full),sha256=digest(json),file=path.join(path.dirname(out),'worlds',sha256+'.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,json);return {file,sha256,bytes:Buffer.byteLength(json)};}
function extract(text,name,end){const start=text.indexOf('\n  '+name+'('),stop=text.indexOf('\n  '+end,start);assert(start>=0&&stop>start,'extract actual production method '+name);return text.slice(start,stop).trim();}
async function operations(impl){
 const main=fs.readFileSync(path.join(impl.root,'src/inkbox/main.js'),'utf8').replace(/\r\n?/g,'\n');
 const [config,map,tools,powers,presentation,terrain,opportunity,feedback,busanzi]=await Promise.all(['core/config.js','world/mapProgress.js','ui/tools.js','sim/powers.js','sim/toolPresentation.js','world/terrainChanges.js','ui/opportunityTools.js','sim/interventionFeedback.js','sim/busanzi.js'].map(impl.load));
 const scope={LIMITS:config.LIMITS,accessBounds:map.accessBounds,canAccess:map.canAccess,observeToolBefore:presentation.observeToolBefore,observeToolAfter:presentation.observeToolAfter,noteAllTerrain:terrain.noteAllTerrain,showOpportunityPlacement:opportunity.showOpportunityPlacement,CAUSAL_TOOL_IDS:feedback.CAUSAL_TOOL_IDS,createInterventionOutcome:feedback.createInterventionOutcome,reactToTool:busanzi.reactToTool};
 const applySource=extract(main,'applyTool','rebuildVillageCache()'),undoSource=extract(main,'undo','/** Q28');
 const apply=new Function(...Object.keys(scope),'return ({'+applySource+'}).applyTool;')(...Object.values(scope));
 const undo=new Function('return ({'+undoSource+'}).undo;')();
 return {applySource,undoSource,build(c){const notices=[],dirty=[];const bounds=map.accessBounds(c.world),point={x:Math.floor((bounds.x0+bounds.x1)/2),y:Math.floor((bounds.y0+bounds.y1)/2)};const sb={world:c.world,life:c.life,rng:c.playerRng,history:new powers.History(),tool:tools.TOOL_BY_ID.raise,hoverTile:point,brushRadius:1,qol:{markDirty:k=>dirty.push(k),syncUndoState(){}},notify:m=>notices.push(m),refreshBusanzi(){},refreshChronicle(){},refreshMilestones(){}};sb.applyTool=apply;sb.undo=undo;return {sb,point,notices,dirty,execute(){sb.history.begin({toolId:'raise',...point,radius:1});sb.applyTool(true);sb.history.end('抬山');return {notices:[...notices],dirty:[...dirty],historyEntries:sb.history.stack.length};},undo(){return sb.undo();}};}};
}
const ops={A:await operations(api.A),B:await operations(api.B)};
assert.equal(ops.A.applySource,ops.B.applySource,'COMPLETE production applyTool body unchanged from #66');
assert.equal(ops.A.undoSource,ops.B.undoSource,'COMPLETE production undo body unchanged from #66');
report.formalOperationHashes={applyTool:digest(ops.A.applySource),undo:digest(ops.A.undoSource)};
const derive={A:await api.A.load('render3d/entities/deriveEntities.js'),B:await api.B.load('render3d/entities/deriveEntities.js')};
function reads(c,row){
 for(const plane of ['mortal','upper','nether']){const w=plane==='mortal'?c.world:c.world[plane];if(!w)continue;
  const frame=renderFrame(w,plane);assert.equal(frame.committedDay,w.day);assert.equal(frame.entityCount,w.entities.length);assert.equal(renderFrame(w,plane),frame,'unchanged committed input reuses frame');
  for(let i=0;i<w.entities.length;i++){const e=w.entities[i],dto=frame.entities[i];for(const k of ['id','x','y','tx','ty','sp','level','faction','hp','maxHp'])assert(Object.is(dto[k],e[k]),'exact Float64/source field '+k);assert.equal(dto.entityKey,plane+':'+e.id);}
  row.frameSamples++;row.projectedBytes+=Buffer.byteLength(JSON.stringify(frame));
  assert.equal(getWorldStatus(w,plane).entityCount,w.entities.length);
  if(w.entities[0])assert.equal(getEntityInspection(w,plane,w.entities[0].id).entityId,w.entities[0].id);
  if(w.villages?.[0])assert(getSettlementInspection(w,plane,w.villages[0].id));
 }
 assert.deepEqual(derive.B.deriveEntities(c.world),derive.A.deriveEntities(c.world),'actual legacy and ReadView Three derive rows identical on the same live facts');
}
try{
 for(const age of option('ages','100,400').split(',').map(Number))for(const [days,dt]of [[90,3],[3,0.1]]){
  const cp=readCheckpoint(age),input=digest(cp.saved),c={A:api.A.restore(cp.saved),B:api.B.restore(cp.saved)},row={age,days,dt,checkpoint:{bytes:cp.bytes,sha256:cp.sha256},frameSamples:0,projectedBytes:0};report.cases.push(row);
  const oa=ops.A.build(c.A),ob=ops.B.build(c.B),bridge=new CommandBridge(()=>c.B.world),gen=worldGeneration(c.B.world);
  row.formalCommand=bridge.dispatch({worldGeneration:gen},()=>ob.execute()).value;assert.deepEqual(row.formalCommand,oa.execute());assert(row.formalCommand.historyEntries>0,'the real admitted brush changes terrain, not a no-op command');reads(c.B,row);
  let elapsed=0,undone=false;while(elapsed<days-1e-9){const step=Math.min(dt,days-elapsed);api.A.advance(c.A,step);api.B.advance(c.B,step);elapsed+=step;reads(c.B,row);if(!undone){assert.equal(bridge.dispatch({worldGeneration:gen},()=>ob.undo()).value,oa.undo(),'formal History undo returns same result');undone=true;reads(c.B,row);}}
  const expected=api.A.capture(c.A),full=api.B.capture(c.B);assert.deepEqual(full,expected,'ENTIRE World, all runtime/RNG including playerRng equal after identical commands+steps+extra reads');
  const before=digest(full);let ran=false;assert.equal(bridge.dispatch({worldGeneration:gen+1},()=>{ran=true;}).reason,'stale-world');assert.equal(ran,false);assert.equal(digest(api.B.capture(c.B)),before);
  const saved=JSON.parse(JSON.stringify(full)),forks=[];for(const impl of [api.A,api.B,api.B]){const f=impl.restore(saved);advanceDays(impl,f,3,dt);forks.push(digest(impl.capture(f)));}assert.equal(new Set(forks).size,1,'v11 independent saved forks');assert.equal(digest(cp.saved),input);
  Object.assign(row,{fullSha256:digest(full),runtimeSha256:digest(full.runtime),runtime:full.runtime,worldSnapshot:snapshot(full),saveForks:forks,completeWorldAllRngEqual:true});writeJson(out,report);console.log(`E2R-a ${age}y ${days}d dt=${dt}: formal operation/undo, views, all World/RNG and v11 forks match`);
 }
 // Formal control realms test API boundaries; these are not natural aged realms.
 const controls={};for(const name of ['A','B']){const a=api[name],c=a.fresh(73101),[{generateUpperWorld},{generateNetherWorld},{UpperLife}]=await Promise.all(['world/worldgenUpper.js','world/worldgenNether.js','sim/upperLife.js'].map(a.load));c.world.upper=generateUpperWorld({preset:{w:c.world.w,h:c.world.h},seed:c.world.seed});c.world.nether=generateNetherWorld({preset:{w:c.world.w,h:c.world.h},seed:c.world.seed});c.upperLife=new UpperLife(c.world.upper);advanceDays(a,c,3,0.1);controls[name]=c;}
 const controlRows={frameSamples:0,projectedBytes:0};reads(controls.B,controlRows);assert.deepEqual(api.B.capture(controls.B),api.A.capture(controls.A),'formal three-realm complete world and all runtime/RNG match');report.controlRealms={...controlRows,natural:false,fullSha256:digest(api.B.capture(controls.B)),equal:true};
 report.exitCode=0;
}catch(error){report.exitCode=1;report.error=error.stack;throw error;}finally{writeJson(out,report);}
