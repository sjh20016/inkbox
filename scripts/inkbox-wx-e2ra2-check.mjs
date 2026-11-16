import assert from 'node:assert/strict';
import { manageCommittedWorlds, beginCompleteStep, publishCompleteStep, abortCompleteStep, publishAfterCommand, getCommittedFrame, getCommittedQuery, assertLegacyReadAllowed, disposeCommittedWorlds } from '../src/inkbox/presentation/readView/committedStore.js';
import { renderFrame, getWorldStatus, getEntityInspection, worldGeneration } from '../src/inkbox/presentation/readView/index.js';
import { getSettlementInspection } from '../src/inkbox/presentation/readView/query.js';
import { deriveEntities, deriveUpperEntities } from '../src/inkbox/render3d/entities/deriveEntities.js';
import { Camera } from '../src/inkbox/render/camera.js';
import { UnitsLayer } from '../src/inkbox/render/unitsLayer.js';
import { noteTerrainCell } from '../src/inkbox/world/terrainChanges.js';
import { TerrainReadView } from '../src/inkbox/presentation/readView/terrain.js';
import { fixture as characterFixture } from './inkbox-g1-fixtures.mjs';
import { createSandboxCharacterRuntime, canvasCharacterCandidates } from '../src/inkbox/g1/sandboxRuntime.js';
import { refreshWatchPanel, openWatchRowPanel } from '../src/inkbox/ui/railPanels.js';
import { toggleWatch } from '../src/inkbox/sim/watch.js';

function fixture(plane='mortal') {
  return { plane, day: 144000, seed: 72, revision: 0, w: 12, h: 10, size:120, reliefScale:10,
    mapProgress:{stage:1}, height:new Float32Array(120).fill(.3), water:new Float32Array(120),
    type:new Uint8Array(120),veg:new Float32Array(120),fire:new Float32Array(120),
    entities:[{id:1,name:'甲',x:5.125,y:4.25,tx:6,ty:4,sp:'human',hp:2,maxHp:10,level:1,faction:1,face:-1}],
    factions:[{id:1,color:'#466487',accent:'#ddd'}],wanling:{units:[]},wraiths:[],
    idx:(x,y)=>y*12+x,factionById(id){return this.factions.find(f=>f.id===id);},villages:[],settlementRuins:[] };
}
function frozenGraph(value,seen=new Set()) {
  if(!value||typeof value!=='object'||seen.has(value))return;
  seen.add(value);assert(Object.isFrozen(value),'every DTO object frozen');assert(!(value instanceof Map));assert(!ArrayBuffer.isView(value));
  for(const v of Object.values(value)){assert.notEqual(typeof v,'function');frozenGraph(v,seen);}
}
const world=fixture();world.upper=fixture('upper');world.nether=fixture('nether');
const before=JSON.stringify(world),initial=manageCommittedWorlds(world),first=renderFrame(world);
assert.equal(JSON.stringify(world),before,'management does not write simulation fields');
assert.equal(first,getCommittedFrame(world));assert.equal(first,renderFrame(world,'mortal',{refresh:true}));
assert.equal(worldGeneration(world),worldGeneration(world.upper));assert.equal(getCommittedFrame(world,'upper'),renderFrame(world.upper));
frozenGraph(first);frozenGraph(getCommittedQuery(world));
const initialQuery=getCommittedQuery(world),three=deriveEntities(world),camera=new Camera();camera.setViewport(640,480);camera.bind(world);camera.zoom=8;camera.x=5;camera.y=4;camera.relief=true;
function draw(){const calls=[],ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]||((...a)=>calls.push([k,...a])),set:(t,k,v)=>{calls.push([k,v]);return true;}});new UnitsLayer().drawEntities(ctx,camera,world,1.25,renderFrame(world));return calls;}
const originalDraw=draw(),pick=camera.pick(320,240,world),rect=camera.visibleRect(world);
beginCompleteStep(world);world.entities[0].x=8;world.entities[0].hp=8;world.factions[0].color='#fff';world.day+=3;
const descriptors=Object.getOwnPropertyDescriptors(world);
for(const key of Object.keys(world))Object.defineProperty(world,key,{configurable:true,get(){throw Error('POISON draft read '+key);}});
assert.equal(renderFrame(world),first);assert.deepEqual(deriveEntities(world),three);assert.deepEqual(draw(),originalDraw);
assert.deepEqual(camera.pick(320,240,world),pick);assert.deepEqual(camera.visibleRect(world),rect);
assert.equal(getWorldStatus(world).observedDay,144000);assert.equal(getEntityInspection(world,'mortal',1).hpRatio,.2);
assert.equal(getCommittedQuery(world),initialQuery);assert.equal(getCommittedQuery(world).committedDay,144000);assert.throws(()=>getSettlementInspection(world,'mortal',1),/prohibited/);
for(const [key,d]of Object.entries(descriptors))Object.defineProperty(world,key,d);
const completed=publishCompleteStep(world),second=renderFrame(world);
assert.equal(second.commitSequence,initial.commitSequence+1);assert.equal(second.entities[0].x,8);assert.equal(second.entities[0].hp,8);
assert.equal(first.entities[0].x,5.125);assert.equal(first.factions[0].color,'#466487');
assert.equal(second.geometry.height,first.geometry.height,'unchanged layer structurally shared');
assert.equal(deriveUpperEntities(world.upper).total,1);assert.equal(renderFrame(world.upper).commitSequence,completed.commitSequence);
world.height[0]=.75;noteTerrainCell(world,'height',0);world.entities[0].hp=3;
publishAfterCommand(world);const third=renderFrame(world);assert.equal(third.geometry.height[0],.75);assert.equal(second.geometry.height[0],Math.fround(.3));
assert.equal(third.geometry.water,second.geometry.water);assert.equal(third.committedDay,second.committedDay);assert.equal(third.entities[0].hp,3);
world.height[1]=.5;world.height[118]=.625;noteTerrainCell(world,'height',1);noteTerrainCell(world,'height',118);publishAfterCommand(world);
const disjoint=renderFrame(world);assert.equal(disjoint.geometry.height[1],.5);assert.equal(disjoint.geometry.height[118],.625);assert.equal(third.geometry.height[1],Math.fround(.3));assert.equal(third.geometry.height[118],Math.fround(.3));
// The native journal currently merges each layer into one rectangle. Exercise
// the block facade's broader contract too, by splitting those real dirty cells.
const originalChanges=TerrainReadView.prototype.changes;
try {
  TerrainReadView.prototype.changes=function(){const change=originalChanges.call(this);if(this.world!==world||!change)return change;return Object.freeze({full:false,blocks:Object.freeze([
    Object.freeze({layer:'height',x0:1,x1:1,y0:0,y1:0,data:Object.freeze([world.height[1]])}),
    Object.freeze({layer:'height',x0:10,x1:10,y0:9,y1:9,data:Object.freeze([world.height[118]])}),
  ])});};
  world.height[1]=.875;world.height[118]=.9375;noteTerrainCell(world,'height',1);noteTerrainCell(world,'height',118);publishAfterCommand(world);
  const split=renderFrame(world);assert.equal(split.geometry.height[1],.875,'first block survives second same-layer block');assert.equal(split.geometry.height[118],.9375);assert.equal(disjoint.geometry.height[1],.5);assert.equal(disjoint.geometry.height[118],.625);
} finally {TerrainReadView.prototype.changes=originalChanges;}
world.entities=[{...world.entities[0],id:9,name:'乙'}];publishAfterCommand(world);assert.equal(getEntityInspection(world,'mortal',1),null);assert.equal(getEntityInspection(world,'mortal',9).name,'乙');
for(let i=0;i<2050;i++){world.height[i%120]=i;noteTerrainCell(world,'height',i%120);}publishAfterCommand(world);
assert.deepEqual(renderFrame(world).geometry.height,Array.from(world.height),'journal overflow performs full refresh');
const last=renderFrame(world);beginCompleteStep(world);world.day+=3;abortCompleteStep(world);
assert.equal(renderFrame(world),last);assert.throws(()=>assertLegacyReadAllowed(world),/prohibited/);assert.throws(()=>beginCompleteStep(world),/faulted/);assert.throws(()=>publishAfterCommand(world),/recovery/);
const failure=fixture();manageCommittedWorlds(failure);const complete=renderFrame(failure);beginCompleteStep(failure);Object.defineProperty(failure,'entities',{get(){throw Error('injected producer fault');}});
assert.throws(()=>publishCompleteStep(failure),/producer fault/);assert.equal(renderFrame(failure),complete);assert.throws(()=>assertLegacyReadAllowed(failure),/prohibited/);
disposeCommittedWorlds(world);assert.equal(renderFrame(world),null);assert.throws(()=>assertLegacyReadAllowed(world),/prohibited/);
assert.throws(()=>camera.visibleRect(world),/disposed/);assert.throws(()=>camera.canAccess(5,4),/disposed/);
const reusedGeneration=manageCommittedWorlds(world).worldGeneration;assert.notEqual(reusedGeneration,first.worldGeneration,'same object simulation rebuild starts new session');disposeCommittedWorlds(world);
const newWorld=fixture();manageCommittedWorlds(newWorld);assert.notEqual(worldGeneration(newWorld),first.worldGeneration);disposeCommittedWorlds(newWorld);disposeCommittedWorlds(failure);
for(const operation of ['add','replace','delete'])for(const boundary of ['begin','publish']){
  const root=fixture();if(operation!=='add')root.upper=fixture('upper');manageCommittedWorlds(root);const old=renderFrame(root),oldChild=root.upper;
  if(boundary==='publish')beginCompleteStep(root);
  if(operation==='delete')delete root.upper;else root.upper=fixture('upper');
  assert.throws(()=>boundary==='begin'?beginCompleteStep(root):publishCompleteStep(root),/topology changed/);
  assert.equal(renderFrame(root),old);assert.throws(()=>assertLegacyReadAllowed(root),/prohibited/);
  if(root.upper)assert.equal(renderFrame(root.upper),null,'unapproved child cannot use unmanaged fallback');
  if(oldChild)assert.equal(renderFrame(oldChild).commitSequence,old.commitSequence,'old committed child remains reliable');
  disposeCommittedWorlds(root);manageCommittedWorlds(root);assert(renderFrame(root));if(root.upper)assert(renderFrame(root.upper));disposeCommittedWorlds(root);
}
const firstOwner=fixture();firstOwner.upper=fixture('upper');manageCommittedWorlds(firstOwner);const ownerFrame=renderFrame(firstOwner.upper),intruder=fixture();manageCommittedWorlds(intruder);intruder.upper=firstOwner.upper;
assert.throws(()=>beginCompleteStep(intruder),/topology changed/);assert.equal(renderFrame(firstOwner.upper),ownerFrame,'fault detection never steals another live session child');disposeCommittedWorlds(intruder);disposeCommittedWorlds(firstOwner);
const both=fixture();manageCommittedWorlds(both);both.upper=fixture('upper');both.nether=fixture('nether');assert.throws(()=>beginCompleteStep(both),/topology changed/);assert.equal(renderFrame(both.upper),null);assert.equal(renderFrame(both.nether),null);disposeCommittedWorlds(both);
{
  const {world,entity}=characterFixture(812),key='mortal:'+entity.id;
  manageCommittedWorlds(world);let action,mingpu,publishes=0;
  const sb={world,camera:{},focusPulses:[],qol:{markDirty(){},noteRecent(){}},notify(){},refreshWatch(){},refreshChronicle(){},refreshNotables(){},refreshRecent(){},publishCommittedEdit(){publishes++;publishAfterCommand(world);}};
  const runtime=createSandboxCharacterRuntime(sb,{render(_sb,_model,a,options){action=a;mingpu=options.onMingpu;}});
  assert(runtime.open(key).ok);assert(action({type:'watch',targetKey:key}).ok);assert.equal(publishes,1);
  beginCompleteStep(world);const properties=Object.getOwnPropertyDescriptors(world);
  for(const key of Object.keys(properties))Object.defineProperty(world,key,{configurable:true,get(){throw Error('G1 draft read '+key);}});
  assert.equal(runtime.current(),null);assert.equal(runtime.resolve(key),null);assert.equal(runtime.summary(),null);assert.equal(runtime.refresh(),null);assert.equal(runtime.open(key).ok,false);
  assert.equal(action({type:'edict',targetKey:key,edictId:'cultivation'}).ok,false);assert.equal(mingpu({type:'enable',targetKey:key}).ok,false);assert.deepEqual(canvasCharacterCandidates(sb,1,1),[]);assert.equal(publishes,1);
  for(const [key,d]of Object.entries(properties))Object.defineProperty(world,key,d);publishCompleteStep(world);assert(runtime.refresh());abortCompleteStep(world);
  assert.equal(runtime.open(key).ok,false);assert.equal(runtime.dispatch({type:'watch',targetKey:key}).ok,false);assert.equal(publishes,1);disposeCommittedWorlds(world);
}
{
  const {world,entity}=characterFixture(813),key='mortal:'+entity.id,listeners=new Map(),nodes=new Map(),previousDocument=globalThis.document;
  const node=id=>nodes.get(id)||nodes.set(id,{dataset:{},style:{},innerHTML:'',textContent:'',addEventListener(type,fn){listeners.set(id+':'+type,fn);}}).get(id);
  try {
    globalThis.document={getElementById:node};toggleWatch(world,entity,world.day);manageCommittedWorlds(world);let publishes=0;
    const sb={world,g1:{open(){return{ok:true};}},refreshWatch(){},publishCommittedEdit(){publishes++;publishAfterCommand(world);}};
    refreshWatchPanel(sb);const click=listeners.get('inkWatchTitle:click');assert(click);beginCompleteStep(world);const properties=Object.getOwnPropertyDescriptors(world);
    for(const key of Object.keys(properties))Object.defineProperty(world,key,{configurable:true,get(){throw Error('Rail draft read '+key);}});
    click();openWatchRowPanel(sb,key);refreshWatchPanel(sb);assert.equal(publishes,0);
    for(const [key,d]of Object.entries(properties))Object.defineProperty(world,key,d);publishCompleteStep(world);click();assert.equal(publishes,1);openWatchRowPanel(sb,key);assert.equal(publishes,2);disposeCommittedWorlds(world);
  } finally {if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
}
console.log('E2R-a.2: same-generation Canvas/Three and real Camera survive poisoned draft; atomic commit/query, same-day edits, identities, COW/overflow, fault/disposal pass');
