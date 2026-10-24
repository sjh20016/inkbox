import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createQol } from '../src/inkbox/ui/qol.js';
import { World } from '../src/inkbox/world/World.js';
import { Life } from '../src/inkbox/sim/life.js';
import { History } from '../src/inkbox/sim/powers.js';
import { TOOL_BY_ID } from '../src/inkbox/ui/tools.js';
import { LIMITS, TERRAIN } from '../src/inkbox/core/config.js';
import { accessBounds, canAccess } from '../src/inkbox/core/mapAccess.js';
import { CAUSAL_TOOL_IDS, createInterventionOutcome } from '../src/inkbox/sim/interventionFeedback.js';
import { observeToolBefore, observeToolAfter } from '../src/inkbox/sim/toolPresentation.js';
import { reactToTool } from '../src/inkbox/sim/busanzi.js';
import { peekRuntimeEvents } from '../src/inkbox/core/runtimeEvents.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';

const source=readFileSync(new URL('../src/inkbox/main.js',import.meta.url),'utf8');
const previousDocument=globalThis.document;
const elements=new Map();
function element(id){
  if(elements.has(id))return elements.get(id);
  const classes=new Set(),e={value:'slot1',dataset:{},hidden:true,disabled:false,textContent:'',listeners:{},
    classList:{contains:s=>classes.has(s),add:s=>classes.add(s),remove:s=>classes.delete(s)},
    addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},focus(){}};
  elements.set(id,e);return e;
}
globalThis.document={getElementById:id=>elements.get(id)||null};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
let checks=0;
function sandbox(seed=7001){
  elements.clear();for(const id of ['inkBtnSave','inkBtnLoad','inkSlotSelect','inkConfirm','inkConfirmText','inkConfirmOk','inkConfirmCancel'])element(id);
  const world=new World(32,24,seed);world.height.fill(.55);world.type.fill(TERRAIN.GRASS);world.veg.fill(.2);
  const sb={world,notices:[],notify(text){this.notices.push(text);},refreshSlots(){},
    terrain:{setWorld(){}},camera:{bind(){},fit(){}},history:new History(),
    attachUpper(){},attachNether(){},hideDeadBiography(){},hidePersonCard(){},closeBusanziViewer(){},
    syncWorldControls(){},syncWorldInfo(){},refreshTerritory(){},refreshChronicle(){},refreshNecrology(){},refreshThreeRealms(){},refreshBusanzi(){},refreshMilestones(){}};
  sb.qol=createQol(sb);return sb;
}
function bindPersistence(sb,{save,load}){
  const start=source.indexOf("    $('inkBtnSave').addEventListener('click'");
  const end=source.indexOf('    // Q26：',start);
  assert(start>0&&end>start);
  new Function('$','saveToStorage','loadFromStorage','listSlots','plainSaveTag','Life','mulberry32',source.slice(start,end))
    .call(sb,id=>element(id),save,load,()=>[],()=>'',Life,mulberry32);
}
try{
  {
    const sb=sandbox(),q=sb.qol;q.markDirty('terrain');const revision=q.editRevision();
    q.markDirty('terrain');q.markPersisted('save',revision);
    assert(q.isDirty(),'second edit while already dirty must survive stale persistence');
    q.markPersisted('save',q.editRevision());assert(!q.isDirty());checks++;
  }
  {
    const sb=sandbox(),gate=deferred();sb.qol.markDirty('terrain');
    bindPersistence(sb,{save:()=>gate.promise,load:()=>{throw Error('unexpected load');}});
    element('inkBtnSave').listeners.click();assert(sb.qol.isBusy('inkBtnSave'));
    sb.qol.markDirty('terrain');gate.resolve({ok:true,bytes:100,rawBytes:200,codec:'gzip'});await tick();
    assert(sb.qol.isDirty());assert(sb.notices.some(s=>s.includes('仍有未保存改动')));
    assert(!sb.qol.isBusy('inkBtnSave'));checks++;
  }
  {
    const sb=sandbox(),gate=deferred();bindPersistence(sb,{save:()=>gate.promise});
    sb.qol.markDirty('terrain');element('inkBtnSave').listeners.click();
    gate.resolve({ok:true,bytes:100,rawBytes:200,codec:'gzip'});await tick();assert(!sb.qol.isDirty());checks++;
  }
  {
    const sb=sandbox(),gate=deferred(),original=sb.world;
    bindPersistence(sb,{load:()=>gate.promise});element('inkBtnLoad').listeners.click();
    sb.qol.markDirty('terrain');gate.resolve(new World(32,24,999));await tick();
    assert.equal(sb.world,original,'async load cannot overwrite a newer edit');assert(sb.qol.isDirty());
    assert(sb.notices.some(s=>s.includes('已保留当前世界')));checks++;
  }
  {
    const sb=sandbox(),gate=deferred();let loadedSlot;
    bindPersistence(sb,{load:slot=>{loadedSlot=slot;return gate.promise;}});
    sb.qol.markDirty('terrain');element('inkSlotSelect').value='slot1';element('inkBtnLoad').listeners.click();
    assert(sb.qol.confirmOpen());assert(element('inkConfirmText').textContent.includes(sb.qol.slotLabel('slot1')));
    element('inkSlotSelect').value='slot2';sb.qol.closeConfirm(true);assert.equal(loadedSlot,'slot1');
    gate.resolve(new World(32,24,999));await tick();assert.equal(sb.world.seed,999);assert(!sb.qol.isDirty());checks++;
  }
  {
    const sb=sandbox(),start=source.indexOf('  applyTool(isFirst,'),end=source.indexOf('\n  rebuildVillageCache()',start);
    const applyTool=new Function('LIMITS','accessBounds','canAccess','CAUSAL_TOOL_IDS','createInterventionOutcome','observeToolBefore','observeToolAfter','reactToTool',
      `return ({${source.slice(start,end).trim()}}).applyTool;`)(LIMITS,accessBounds,canAccess,CAUSAL_TOOL_IDS,createInterventionOutcome,observeToolBefore,observeToolAfter,reactToTool);
    let draws=0;sb.rng=()=>{draws++;return .5;};sb.life=new Life(sb.world,sb.rng);
    sb.applyTool=applyTool;sb.tool=TOOL_BY_ID.root;
    const worldBefore=JSON.stringify(sb.world),beforeDraws=draws;sb.history.begin();
    sb.applyTool(true,{point:{x:16,y:12},radius:4,targetEntityId:-123});
    assert.equal(JSON.stringify(sb.world),worldBefore,'rejected root changes no World or Busanzi state');
    assert.equal(draws,beforeDraws,'rejection preserves player-tool RNG cursor');assert(!sb.qol.isDirty());
    assert.equal(peekRuntimeEvents(sb.world).length,0);assert(!sb.history.end('rejected'));
    sb.tool=TOOL_BY_ID.forest;sb.history.begin();sb.applyTool(true,{point:{x:16,y:12},radius:4});sb.history.end('forest');
    assert(sb.world.busanzi.acts>0,'accepted operation retains original Busanzi reaction');
    assert(sb.qol.isDirty());assert(draws>beforeDraws);checks++;
    sb.tool=TOOL_BY_ID.drain;sb.history.begin();sb.applyTool(true,{point:{x:16,y:12},radius:4});
    assert(!sb.history.end('dry drain'));assert(sb.notices.some(s=>s.includes('积水没有实际减少')));checks++;
  }
}finally{globalThis.document=previousDocument;}
console.log(`G7 persistence and rejected-tool boundaries: ${checks} groups passed`);
