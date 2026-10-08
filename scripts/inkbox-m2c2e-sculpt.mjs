import assert from 'node:assert/strict';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { recomputeRect } from '../src/inkbox/world/terrain.js';
import { SEA_LEVEL } from '../src/inkbox/core/config.js';
import { TerrainStroke, sculpt, restoreTerrainStroke } from '../src/inkbox/render3d/terrain/sculpt.js';
import { Render3DAdapter } from '../src/inkbox/render3d/Render3DAdapter.js';
import { serializeWorld,deserializeWorld } from '../src/inkbox/io/save.js';
import { maintainRivers,refillSea,stepWater } from '../src/inkbox/sim/hydrology.js';
import { accessBounds, createMapProgress } from '../src/inkbox/world/mapProgress.js';
let passed=0;function check(label,fn){fn();passed++;console.log(`PASS ${label}`);}
const make=()=>generateWorld({preset:{w:32,h:24},seed:42424,scatter:false});
const channels=w=>['height','water','riverBase','type','qi'].map(k=>[k,w[k].slice()]);
const same=(w,expected)=>{for(const [k,v]of expected)assert.deepEqual(w[k],v,k);};
const canonical=w=>{const expected=channels(w);recomputeRect(w,0,0,w.w-1,w.h-1);same(w,expected);};
for(const mode of ['raise','lower','flatten','smooth','ridge','basin'])check(`${mode}: before/after, atomic undo/redo, canonical and saved water/river state`,()=>{
 const w=make(),before=channels(w),brush=new TerrainStroke(w,{x:12,y:10},{mode,radius:4,strength:.09,syncWater:true});
 brush.sample({x:18,y:12});brush.flush();const entry=brush.finish();assert.ok(entry);canonical(w);const after=channels(w);
 restoreTerrainStroke(w,entry);same(w,before);restoreTerrainStroke(w,entry,'after');same(w,after);canonical(w);
 const restored=deserializeWorld(serializeWorld(w));for(const k of ['height','water','riverBase'])for(let i=0;i<w.size;i++)assert.ok(Math.abs(restored[k][i]-w[k][i])<2e-5,k);
 assert.equal(new Set(entry.records.map(r=>r[0])).size,entry.records.length);
});
check('fixed-distance commands ignore pointer segmentation, duplicates and flush/frame cadence',()=>{
 const run=(count,flush)=>{const w=make(),s=new TerrainStroke(w,{x:8,y:9},{mode:'smooth',radius:3,strength:.075});
  for(let i=1;i<=count;i++){const p={x:8+12*i/count,y:9+6*i/count};s.sample(p);s.sample(p);if(flush)s.flush();}return {w,entry:s.finish()};};
 const a=run(1,false),b=run(120,true);same(b.w,channels(a.w));assert.deepEqual(a.entry.records,b.entry.records);assert.equal(a.entry.stats.stamps,b.entry.stats.stamps);
});
check('raise dries old wet/river bed and undo restores source; below-sea basin immediately refills',()=>{
 const w=make(),i=10*w.w+12;w.riverBase.fill(0);recomputeRect(w,0,0,w.w-1,w.h-1);w.height[i]=SEA_LEVEL+.01;w.water[i]=.025;w.riverBase[i]=.012;recomputeRect(w,12,10,12,10);
 const before=channels(w),s=new TerrainStroke(w,{x:12,y:10},{radius:1,strength:.12,mode:'raise'}),entry=s.finish();assert.equal(w.water[i],0);assert.equal(w.riverBase[i],0);
 maintainRivers(w);assert.equal(w.water[i],0);restoreTerrainStroke(w,entry);same(w,before);
 const b=new TerrainStroke(w,{x:12,y:10},{radius:1,strength:.12,mode:'basin'});b.finish();assert.ok(w.height[i]<SEA_LEVEL);assert.ok(w.water[i]>=Math.fround(SEA_LEVEL-w.height[i]));
 const depth=w.water[i];refillSea(w);assert.equal(w.water[i],depth);
});
check('legacy sculpt preserves water by default and no renderer silently smooths a sharp spike',()=>{
 const w=make(),i=10*w.w+12;w.height[i]=.99;const peak=w.height[i],water=w.water.slice();sculpt(w,{x:12,y:10,radius:1,strength:.01,mode:'lower'});assert.deepEqual(w.water,water);assert.equal(w.height[i],Math.fround(peak-.01));
});
check('access bounds clip stamp writes and locked/world-edge/realm edits give explicit reasons',()=>{
 const w=make();createMapProgress(w,true);const bounds=accessBounds(w),before=w.height.slice();const s=new TerrainStroke(w,{x:bounds.x0,y:bounds.y0},{radius:8,strength:.04,accessBounds:bounds});s.finish();
 for(let y=0;y<w.h;y++)for(let x=0;x<w.w;x++)if(x<bounds.x0||y<bounds.y0||x>bounds.x1||y>bounds.y1)assert.equal(w.height[y*w.w+x],before[y*w.w+x]);
 const a=Object.create(Render3DAdapter.prototype);a.mode='raise';a.sandbox={world:w};a.renderer={activePlane:'mortal',realmPrototype:{open:false}};
 assert.match(a.editReason({plane:'mortal',kind:'world-edge'}),/外侧面/);assert.match(a.editReason({plane:'mortal',world:{x:0,y:0}}),/未解锁/);
 a.renderer.realmPrototype.open=true;assert.match(a.editReason({plane:'mortal'}),/关闭视界/);
});
check('Adapter undo/redo updates QOL and Canvas cache and rejects an obsolete World session',()=>{
 const w=make(),s=new TerrainStroke(w,{x:12,y:10},{radius:2});const entry=s.finish();let dirty=0,invalid=0;
 const a=Object.create(Render3DAdapter.prototype);a.sandbox={world:w,qol:{markDirty:()=>dirty++},terrain:{invalidate:()=>invalid++}};
 a.renderer={activePlane:'mortal',realmPrototype:{open:false},markTerrainDirty:()=>{}};a.mode='raise';a.undoStack=[entry];a.redoStack=[];a.cancelRealmDraw=()=>{};
 assert.ok(a.undo());assert.ok(a.redo());assert.equal(dirty,2);assert.equal(invalid,2);a.sandbox.world=make();assert.equal(a.undo(),false);assert.equal(a.undoStack.length,0);assert.equal(a.redoStack.length,0);
});
check('deferred stamps leave canonical type/qi and touch unchanged until the actual flush',()=>{
 const w=make(),type=w.type.slice(),qi=w.qi.slice(),touch=w.touch.bind(w);let touches=0;w.touch=()=>{touches++;touch();};
 const s=new TerrainStroke(w,{x:12,y:10},{mode:'flatten',targetHeight:.99,radius:4,strength:1});s.sample({x:15,y:10});
 assert.deepEqual(w.type,type);assert.deepEqual(w.qi,qi);assert.equal(touches,0);
 s.flush();assert.equal(touches,1);assert.notDeepEqual(w.type,type);assert.notDeepEqual(w.qi,qi);canonical(w);s.finish();
});
check('real Adapter.render never generates stationary RAF stamps across frame cadence',()=>{
 const w=make(),a=Object.create(Render3DAdapter.prototype);a.active=true;a.mode='raise';a.radius=2;a.lastNow=100;a.lastDebug=100;a.lastStamp=0;a.pointer={x:0,y:0};
 a.sandbox={world:w,getRealmViewState:()=>({open:false}),stage:null};a.renderer={setWorld:()=>false,setRealmViewState:()=>{},setPresentation:()=>{},update:()=>{},
  brush:()=>{},render:()=>({}),stages:new Map(),activePlane:'mortal',realmPrototype:{open:false},markTerrainDirty:()=>{}};
 a.panel={querySelector:()=>null};a.readout={};a.undoStack=[];a.redoStack=[];
 a.hit=()=>({plane:'mortal',world:{x:12,y:10},x:12,y:10});a.stroke=new TerrainStroke(w,{x:12,y:10},{radius:2});
 a.stamp=()=>assert.fail('render must not stamp');a.flushStroke();const before=channels(w),stamps=a.stroke.stats.stamps;
 for(let i=0;i<100;i++)assert.equal(a.render(100+i*.001),true);same(w,before);assert.equal(a.stroke.stats.stamps,stamps);
});
check('one canonical flush per pending batch and finished commands are idempotent',()=>{
 const w=make(),s=new TerrainStroke(w,{x:12,y:10},{radius:4});s.sample({x:15,y:10});assert.ok(s.flush());assert.equal(s.flush(),null);
 const entry=s.finish(),after=channels(w);assert.equal(entry.stats.canonicalFlushes,1);assert.equal(s.finish(),entry);assert.equal(s.sample({x:20,y:10}),false);same(w,after);
});
check('history obeys both count and bytes budgets and a fresh command discards redo',()=>{
 const w=make(),a=Object.create(Render3DAdapter.prototype);a.sandbox={world:w};a.renderer={markTerrainDirty:()=>{}};a.cancelRealmDraw=()=>{};
 a.undoStack=[];a.redoStack=[];a.historyBytes=0;a.historyLimit=2;a.historyByteLimit=256;
 for(let k=0;k<3;k++){a.stroke=new TerrainStroke(w,{x:10+k,y:10},{radius:1});a.endStroke();}
 assert.equal(a.undoStack.length,2);assert.equal(a.historyBytes,256);a.redoStack.push(a.undoStack.pop());
 a.stroke=new TerrainStroke(w,{x:16,y:10},{radius:1});a.endStroke();assert.equal(a.redoStack.length,0);assert.ok(a.historyBytes<=256);
 a.clearHistory();assert.equal(a.undoStack.length,0);assert.equal(a.historyBytes,0);
});
check('real water evaporation rejects old undo atomically and Adapter clears/notifies the session',()=>{
 const w=make();w.height.fill(.5);w.water.fill(.1);w.riverBase.fill(0);recomputeRect(w,0,0,w.w-1,w.h-1);
 const entry=new TerrainStroke(w,{x:12,y:10},{mode:'lower',radius:3,strength:.02}).finish();const edited=w.water[entry.records[0][0]];
 stepWater(w,1,{flowRate:0,evapRate:.01});assert.notEqual(w.water[entry.records[0][0]],edited);
 const evolved=channels(w),touch=w.touch.bind(w);let touches=0;w.touch=()=>{touches++;touch();};
 assert.equal(restoreTerrainStroke(w,entry),null);same(w,evolved);assert.equal(touches,0);
 const a=Object.create(Render3DAdapter.prototype);let notice='';a.sandbox={world:w,notify:text=>notice=text};
 a.renderer={activePlane:'mortal',realmPrototype:{open:false},markTerrainDirty:()=>assert.fail('conflict is not an edit')};
 a.mode='raise';a.undoStack=[entry];a.redoStack=[entry];a.cancelRealmDraw=()=>{};
 assert.equal(a.undo(),false);same(w,evolved);assert.equal(a.undoStack.length,0);assert.equal(a.redoStack.length,0);
 assert.match(notice,/世界演化/);assert.equal(a.historyNotice,notice);
});
check('late touched height or river changes reject the entire undo/redo with no partial writes',()=>{
 for(const channel of ['height','riverBase'])for(const side of ['before','after']){
  const w=make(),entry=new TerrainStroke(w,{x:12,y:10},{radius:3}).finish();assert.ok(entry.records.length>2);
  if(side==='after')assert.ok(restoreTerrainStroke(w,entry));
  const i=entry.records.at(-1)[0];w[channel][i]+=.001;const evolved=channels(w);
  assert.equal(restoreTerrainStroke(w,entry,side),null);same(w,evolved);
 }
});
check('evolution outside touched records does not reject undo and overlapping strokes undo/redo normally',()=>{
 const w=make(),entry=new TerrainStroke(w,{x:12,y:10},{radius:3}).finish();assert.ok(!entry.records.some(r=>r[0]===0));
 w.height[0]+=.01;w.water[0]+=.001;w.riverBase[0]+=.001;const outside=[w.height[0],w.water[0],w.riverBase[0]];
 assert.ok(restoreTerrainStroke(w,entry));assert.deepEqual([w.height[0],w.water[0],w.riverBase[0]],outside);
 assert.ok(restoreTerrainStroke(w,entry,'after'));
 const before=channels(w),first=new TerrainStroke(w,{x:12,y:10},{radius:3}).finish(),second=new TerrainStroke(w,{x:13,y:10},{mode:'lower',radius:3}).finish(),after=channels(w);
 assert.ok(restoreTerrainStroke(w,second));assert.ok(restoreTerrainStroke(w,first));same(w,before);
 assert.ok(restoreTerrainStroke(w,first,'after'));assert.ok(restoreTerrainStroke(w,second,'after'));same(w,after);
});
check('Adapter redo conflict clears both stacks and preserves later legitimate height',()=>{
 const w=make(),entry=new TerrainStroke(w,{x:12,y:10},{radius:2}).finish();assert.ok(restoreTerrainStroke(w,entry));
 w.height[entry.records[0][0]]+=.001;const evolved=channels(w),a=Object.create(Render3DAdapter.prototype);let notice='';
 a.sandbox={world:w,notify:text=>notice=text};a.renderer={activePlane:'mortal',realmPrototype:{open:false}};
 a.mode='raise';a.undoStack=[];a.redoStack=[entry];a.cancelRealmDraw=()=>{};
 assert.equal(a.redo(),false);same(w,evolved);assert.equal(a.redoStack.length,0);assert.equal(a.undoStack.length,0);assert.match(notice,/世界演化/);
});
console.log(`M2-C2E sculpt CPU contracts: ${passed}/${passed} passed`);
