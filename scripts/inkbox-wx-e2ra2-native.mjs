import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,option,source,environment,digest,writeJson,advanceDays} from './inkbox-wx-e2ra-common.mjs';
import {nativeApi,assertNativeInvariants,contextSummary} from './inkbox-wx-e0-replay.mjs';
import {CommandBridge} from '../src/inkbox/presentation/readView/commandBridge.js';
import {renderFrame,worldGeneration,getWorldStatus,getEntityInspection} from '../src/inkbox/presentation/readView/index.js';
import {getSettlementInspection} from '../src/inkbox/presentation/readView/query.js';
import {manageCommittedWorlds,beginCompleteStep,publishCompleteStep,abortCompleteStep} from '../src/inkbox/presentation/readView/committedStore.js';
import {createHash} from 'node:crypto';

const AROOT=path.resolve(option('reference-root',path.join(ROOT,'../inkbox-wx-em2')));
const out=path.resolve(option('out','reports/local/wx-e2ra2/native/acceptance.json'));
const api={A:await nativeApi(AROOT),B:await nativeApi(ROOT)};
const report={pass:false,source:source(),reference:{root:AROOT,head:'A frozen E-M2 green candidate'},environment:environment(),method:'same natural v11 inputs, dt sequences, and formal commands; full serializeWorld + runtime/RNG compared at boundaries; B committed-view changes are checked for observed equivalence',cases:[]};
function extract(text,name,end){const a=text.indexOf('\n  '+name+'('),b=text.indexOf('\n  '+end,a);assert(a>=0&&b>a,'actual formal '+name+' method found');return text.slice(a,b).trim();}
function checkpoint(age){const file=path.resolve(option('checkpoint-root',path.join(ROOT,'../inkbox-wx-s1/reports/local/wx-s1/natural')),`20260914-${age}y-save.json`),bytes=fs.readFileSync(file),saved=JSON.parse(bytes);assert.equal(saved.v,11);assert(saved.runtime);return {file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,saved};}
async function operation(impl){
 const main=fs.readFileSync(path.join(impl.root,'src/inkbox/main.js'),'utf8').replace(/\r\n?/g,'\n');
 const [cfg,map,tools,powers,presentation,terrain,opportunity,feedback,busanzi]=await Promise.all(['core/config.js','world/mapProgress.js','ui/tools.js','sim/powers.js','sim/toolPresentation.js','world/terrainChanges.js','ui/opportunityTools.js','sim/interventionFeedback.js','sim/busanzi.js'].map(impl.load));
 const scope={LIMITS:cfg.LIMITS,accessBounds:map.accessBounds,canAccess:map.canAccess,observeToolBefore:presentation.observeToolBefore,observeToolAfter:presentation.observeToolAfter,noteAllTerrain:terrain.noteAllTerrain,showOpportunityPlacement:opportunity.showOpportunityPlacement,CAUSAL_TOOL_IDS:feedback.CAUSAL_TOOL_IDS,createInterventionOutcome:feedback.createInterventionOutcome,reactToTool:busanzi.reactToTool};
 const applyText=extract(main,'applyTool','rebuildVillageCache()'),undoText=extract(main,'undo','/** Q28');
 const apply=new Function(...Object.keys(scope),'return ({'+applyText+'}).applyTool;')(...Object.values(scope));
 const undo=new Function(...Object.keys(scope),'return ({'+undoText+'}).undo;')(...Object.values(scope));
 return {build(c){const bounds=map.accessBounds(c.world),point={x:Math.floor((bounds.x0+bounds.x1)/2),y:Math.floor((bounds.y0+bounds.y1)/2)},dirty=[],notices=[];const sb={world:c.world,life:c.life,rng:c.playerRng,history:new powers.History(),tool:tools.TOOL_BY_ID.raise,hoverTile:point,brushRadius:1,qol:{markDirty:k=>dirty.push(k),syncUndoState(){}},notify:m=>notices.push(m),refreshBusanzi(){},refreshChronicle(){},refreshMilestones(){},applyTool:apply,undo};return {sb,point,dirty,notices,execute(){sb.history.begin({toolId:'raise',...point,radius:1});sb.applyTool(true);sb.history.end('抬山');return {dirty:[...dirty],notices:[...notices],historyEntries:sb.history.stack.length};},undo(){return sb.undo();}};}};
}
const operations={A:await operation(api.A),B:await operation(api.B)};
function full(c){return api.A.capture(c.A);}
function compare(c,row,label){const a=api.A.capture(c.A),b=api.B.capture(c.B);assert.deepEqual(b,a,'complete serialized World and ALL registered runtime/RNG: '+label);const sha=digest(b);row.boundaries.push({label,day:c.B.world.day,sha256:sha,runtimeSha256:digest(b.runtime)});return b;}
function observe(c,row){for(const plane of ['mortal','upper','nether']){const w=plane==='mortal'?c.B.world:c.B.world[plane];if(!w)continue;const f=renderFrame(w,plane);assert.equal(f.committedDay,w.day);assert.equal(f.entityCount,w.entities.length);assert(Object.isFrozen(f)&&Object.isFrozen(f.entities));for(let i=0;i<w.entities.length;i++)for(const k of ['id','x','y','tx','ty','sp','level','hp','maxHp','faction'])assert(Object.is(f.entities[i][k],w.entities[i][k]),'committed field '+k);assert.equal(getWorldStatus(w,plane).entityCount,w.entities.length);if(w.entities[0])assert(getEntityInspection(w,plane,w.entities[0].id));if(w.villages?.[0])assert(getSettlementInspection(w,plane,w.villages[0].id));row.frameReads++;}}
function step(c,delta){api.A.advance(c.A,delta);beginCompleteStep(c.B.world);try{api.B.advance(c.B,delta);publishCompleteStep(c.B.world);}catch(error){abortCompleteStep(c.B.world);throw error;}}
function stepOne(name,c,delta){if(name==='A'){api.A.advance(c,delta);return;}beginCompleteStep(c.world);try{api.B.advance(c,delta);publishCompleteStep(c.world);}catch(error){abortCompleteStep(c.world);throw error;}}
try{
 for(const age of [100,400])for(const [days,dt] of [[90,3],[3,.1]]){
  const cp=checkpoint(age),c={A:api.A.restore(cp.saved),B:api.B.restore(cp.saved)},row={age,days,dt,checkpoint:{file:cp.file,sha256:cp.sha256,bytes:cp.bytes},boundaries:[],frameReads:0};manageCommittedWorlds(c.B.world);report.cases.push(row);
  const oa=operations.A.build(c.A),ob=operations.B.build(c.B),bridge=new CommandBridge(()=>c.B.world),gen=worldGeneration(c.B.world);
  const first=bridge.dispatch({worldGeneration:gen},()=>ob.execute());assert.equal(first.ok,true);const ref=oa.execute();assert.deepEqual(first.value,ref,'formal applyTool receipt equivalent');assert(first.value.historyEntries>0,'command changes real terrain');row.command=first.value;compare(c,row,'after command');observe(c,row);compare(c,row,'after Query/Frame');
  const second=bridge.dispatch({worldGeneration:gen},()=>ob.execute()),refSecond=oa.execute();assert.equal(second.ok,true,'second same-day command accepted');assert.deepEqual(second.value,refSecond);compare(c,row,'second same-day command');observe(c,row);compare(c,row,'second command read');
  let elapsed=0,undone=false;while(elapsed<days-1e-9){const delta=Math.min(dt,days-elapsed);step(c,delta);elapsed+=delta;compare(c,row,'advance '+elapsed);observe(c,row);compare(c,row,'observe '+elapsed);if(!undone){const u=bridge.dispatch({worldGeneration:gen},()=>ob.undo(true));const ur=oa.undo(true);assert.equal(u.ok,true,'same-day undo accepted');assert.deepEqual(u.value,ur,'formal undo result equivalent');undone=true;compare(c,row,'same-day undo');}}
  const final=compare(c,row,'final');for(const name of ['A','B'])assertNativeInvariants(api[name],c[name]);
  let ran=false;const stale=bridge.dispatch({worldGeneration:gen+1},()=>{ran=true;});assert.equal(stale.reason,'stale-world');assert.equal(ran,false);compare(c,row,'stale generation rejection');
  const forks=[];for(const name of ['A','B','B']){const f=api[name].restore(JSON.parse(JSON.stringify(final)));if(name==='B')manageCommittedWorlds(f.world);let elapsedFork=0;while(elapsedFork<3-1e-9){const amount=Math.min(dt,3-elapsedFork);stepOne(name,f,amount);elapsedFork+=amount;}forks.push(digest(api[name].capture(f)));}assert.equal(new Set(forks).size,1,'independent v11 save/restore continuations match');row.forks=forks;row.fullSha256=digest(final);row.runtimeSha256=digest(final.runtime);row.context=contextSummary(api.B,c.B.world);row.equal=true;row.snapshot=path.join(path.dirname(out),`world-${age}-${days}-${dt}.json`);writeJson(row.snapshot,final);writeJson(out,report);console.log(`E2R-a.2 ${age}y ${days}d dt=${dt}: ${row.boundaries.length} complete boundaries equal`);
 }
 const controls={};for(const name of ['A','B']){const c=api[name].fresh(73101),[{generateUpperWorld},{generateNetherWorld},{UpperLife}]=await Promise.all(['world/worldgenUpper.js','world/worldgenNether.js','sim/upperLife.js'].map(api[name].load));c.world.upper=generateUpperWorld({preset:{w:c.world.w,h:c.world.h},seed:c.world.seed});c.world.nether=generateNetherWorld({preset:{w:c.world.w,h:c.world.h},seed:c.world.seed});c.upperLife=new UpperLife(c.world.upper);if(name==='B')manageCommittedWorlds(c.world);controls[name]=c;}
 const controlRow={boundaries:[],frameReads:0};for(let i=0;i<30;i++){step(controls,3);compare(controls,controlRow,'controlled three realms '+i);observe(controls,controlRow);compare(controls,controlRow,'controlled three realms observed '+i);}
 report.controlRealms={natural:false,steps:30,completeWorldAndRngEqual:true};report.pass=true;report.exitCode=0;
}catch(error){report.error=error.stack;report.exitCode=1;process.exitCode=1;}finally{report.finishedAt=new Date().toISOString();writeJson(out,report);console.log(JSON.stringify({pass:report.pass,error:report.error,out}));}
