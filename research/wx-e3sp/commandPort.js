import { TOOL_BY_ID } from '../../src/inkbox/ui/tools.js';
import { LIMITS } from '../../src/inkbox/core/config.js';
import { accessBounds, canAccess } from '../../src/inkbox/world/mapProgress.js';
import { noteAllTerrain } from '../../src/inkbox/world/terrainChanges.js';
import { observeToolBefore, observeToolAfter } from '../../src/inkbox/sim/toolPresentation.js';
import { reactToTool } from '../../src/inkbox/sim/busanzi.js';
import { CAUSAL_TOOL_IDS, createInterventionOutcome, measureChangedCells } from '../../src/inkbox/sim/interventionFeedback.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const supported=new Set(['raise','lightning','erase']);
// A small research admission port, not another power implementation. The
// existing Tool/History/domain functions remain the sole mutation owners.
export function executeResearchCommand(context,descriptor) {
  const {world,life,playerRng,history}=context;
  if(descriptor.type==='undo'){
    const label=history.undo(world);
    return {ok:!!label,reason:label?null:history.lastUndoFailure||'nothing-to-undo',toolId:'undo',label:label||null,historyEntries:history.stack.length};
  }
  const p=descriptor.payload||{},id=p.toolId,tool=TOOL_BY_ID[id];
  if(!['power','terrain-stroke'].includes(descriptor.type)||!supported.has(id))return {ok:false,reason:'unsupported-command'};
  if(p.plane&&p.plane!=='mortal')return {ok:false,reason:'mortal-only'};
  const points=descriptor.type==='terrain-stroke'?p.points:[p.point];
  if(!Array.isArray(points)||points.length===0||points.length>128||!Number.isFinite(p.radius)||p.radius<1||p.radius>Math.max(...LIMITS.brushSizes))return {ok:false,reason:'invalid-parameters'};
  for(const q of points)if(!q||!Number.isFinite(q.x)||!Number.isFinite(q.y)||!Number.isSafeInteger(q.count??1)||(q.count??1)<1||(q.count??1)>4096)return {ok:false,reason:'invalid-parameters'};
  if(points.reduce((n,q)=>n+(q.count??1),0)>4096)return {ok:false,reason:'too-many-samples'};
  const messages=[],impacts=[];history.begin();
  const first=points[0],strokeIntervention=CAUSAL_TOOL_IDS.includes(id)?{toolId:id,x:first.x,y:first.y}:null;
  for(let i=0;i<points.length;i++)for(let repeat=0;repeat<(points[i].count??1);repeat++){
    const q=points[i],isFirst=i===0&&repeat===0;
    if(tool.mode==='click'&&!isFirst)continue;
    if(!world.inside(q.x,q.y))continue;
    const bounds=accessBounds(world),r=p.radius;
    if(!canAccess(world,q.x,q.y)||(world.mapProgress&&world.mapProgress.stage<3&&(q.x-r<bounds.x0||q.x+r>bounds.x1||q.y-r<bounds.y0||q.y+r>bounds.y1)))continue;
    const ctx={world,life,events:life.events,x:q.x+.5,y:q.y+.5,radius:r,targetEntityId:p.targetEntityId,amount:tool.amount,history,rng:playerRng,siteTheme:'random',wanlingForm:'dangkang'};
    const observation=observeToolBefore(ctx,tool);ctx.result=tool.apply(ctx);noteAllTerrain(world);
    const impact=observeToolAfter(ctx,observation);impacts.push(copy(impact));
    if(isFirst&&(impact.changed||impact.persistentChanged))reactToTool(world,playerRng,id);
    if(tool.mode==='click'){
      if(CAUSAL_TOOL_IDS.includes(id)){
        history.queueToolReceipt?.(ctx,observation,impact,null);
        messages.push(createInterventionOutcome({toolId:id,action:tool.name,x:q.x,y:q.y,rawResult:ctx.result,event:null}).message);
      }else messages.push(typeof ctx.result==='string'&&ctx.result?ctx.result:`${tool.name} · 落于 (${q.x}, ${q.y})`);
    }
  }
  const changed=history.end(tool.name);
  if(changed&&strokeIntervention){
    const entry=history.stack.at(-1),outcome=createInterventionOutcome({...strokeIntervention,action:tool.name,metrics:measureChangedCells(world,entry?.changes)});
    if(outcome.status==='success')world.record(outcome.message,'intervention');messages.push(outcome.message);
  }
  return {ok:true,toolId:id,historyEntries:history.stack.length,changed,impacts,messages,journalReceipt:history.lastJournalReceipt?copy(history.lastJournalReceipt):null};
}
