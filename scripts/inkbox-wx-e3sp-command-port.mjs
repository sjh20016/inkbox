import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {nativeApi} from './inkbox-wx-e0-replay.mjs';
import {referenceRoot} from './inkbox-wx-e3sp-reference.mjs';
import {restoreResearchContext,captureResearchSave} from '../research/wx-e3sp/context.js';
import {executeResearchCommand} from '../research/wx-e3sp/commandPort.js';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),ref=await nativeApi(referenceRoot());
const candidate=await nativeApi(root);
const initial=ref.capture(ref.fresh(73101)),a=ref.restore(initial),b=restoreResearchContext(initial);
const [cfg,map,tools,powers,presentation,terrain,feedback,busanzi]=await Promise.all(['core/config.js','world/mapProgress.js','ui/tools.js','sim/powers.js','sim/toolPresentation.js','world/terrainChanges.js','sim/interventionFeedback.js','sim/busanzi.js'].map(ref.load));
const text=fs.readFileSync(path.join(ref.root,'src/inkbox/main.js'),'utf8').replace(/\r\n?/g,'\n');
const start=text.indexOf('\n  applyTool('),end=text.indexOf('\n  rebuildVillageCache()',start);
const scope={LIMITS:cfg.LIMITS,accessBounds:map.accessBounds,canAccess:map.canAccess,observeToolBefore:presentation.observeToolBefore,observeToolAfter:presentation.observeToolAfter,noteAllTerrain:terrain.noteAllTerrain,CAUSAL_TOOL_IDS:feedback.CAUSAL_TOOL_IDS,createInterventionOutcome:feedback.createInterventionOutcome,reactToTool:busanzi.reactToTool};
const apply=new Function(...Object.keys(scope),'return ({'+text.slice(start,end)+'}).applyTool;')(...Object.values(scope));
const fstart=text.indexOf('      if (this.pointer.painting) {',text.indexOf('const endPointer ='));
const fend=text.indexOf('      this.strokeIntervention = null;',fstart);
const finish=new Function('createInterventionOutcome','measureChangedCells',text.slice(fstart,fend));
const sb={world:a.world,life:a.life,rng:a.playerRng,history:new powers.History(),qol:{markDirty(){},syncUndoState(){}},notify(){},refreshBusanzi(){},refreshChronicle(){},refreshMilestones(){},pointer:{painting:true}};
function run(command){
 if(command.type==='undo'){sb.history.undo(a.world);return;}
 const p=command.payload,pts=command.type==='terrain-stroke'?p.points:[p.point];sb.tool=tools.TOOL_BY_ID[p.toolId];sb.history.begin();sb.clickSaid='';sb.strokeIntervention=feedback.CAUSAL_TOOL_IDS.includes(p.toolId)?{toolId:p.toolId,x:pts[0].x,y:pts[0].y}:null;
 for(let i=0;i<pts.length;i++)for(let n=0;n<(pts[i].count??1);n++)apply.call(sb,i===0&&n===0,{point:pts[i],radius:p.radius});
 finish.call(sb,feedback.createInterventionOutcome,feedback.measureChangedCells);
}
const bounds=map.accessBounds(a.world),point={x:Math.floor((bounds.x0+bounds.x1)/2),y:Math.floor((bounds.y0+bounds.y1)/2)};
const person=a.world.entities.find(e=>e.hp>0),personPoint=person?{x:Math.floor(person.x),y:Math.floor(person.y)}:point;
const commands=[
 {type:'terrain-stroke',payload:{toolId:'raise',radius:1,points:[{...point,count:2},{x:point.x+1,y:point.y,count:1}]}},
 {type:'terrain-stroke',payload:{toolId:'raise',radius:1,points:[point]}},
 {type:'undo'},
 {type:'power',payload:{toolId:'lightning',radius:3,point:personPoint}},
 {type:'power',payload:{toolId:'erase',radius:3,point:personPoint}},
 {type:'undo'},
];
for(const command of commands){run(command);const receipt=executeResearchCommand(b,command);assert.equal(typeof receipt.ok,'boolean');assert.deepEqual(candidate.capture(b),ref.capture(a),'frozen B real applyTool/endPointer World+ALL RNG '+JSON.stringify(command));assert.equal(captureResearchSave(b),JSON.stringify(ref.capture(a)));assert.equal(b.history.stack.length,sb.history.stack.length);}
const saved=captureResearchSave(b),restored=restoreResearchContext(saved);assert.deepEqual(JSON.parse(captureResearchSave(restored)),JSON.parse(saved));
console.log('E3S command port: 6 native gestures/undo match frozen B actual applyTool + endPointer complete World/all RNG; v11 roundtrip exact');
