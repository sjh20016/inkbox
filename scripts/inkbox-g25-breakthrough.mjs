import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture } from './inkbox-g1-fixtures.mjs';
import { attemptBreakthrough } from '../src/inkbox/sim/cultivation.js';
import { configureBreakthroughPresentation } from '../src/inkbox/sim/presentation.js';
import { emitRuntimeEvent, peekRuntimeEvents, BREAKTHROUGH_RUNTIME_EVENT_CAP } from '../src/inkbox/core/runtimeEvents.js';
import { PresentationStage } from '../src/inkbox/render/presentationStage.js';
import { createFxState, drawFx, ingestRuntimeEvents, BREAKTHROUGH_FX_CAP } from '../src/inkbox/render/fxLayer.js';
import { ThreeBreakthroughFx, BREAKTHROUGH_3D_CAP } from '../src/inkbox/render3d/view/ThreeBreakthroughFx.js';
import { ThreeFxProbe } from '../src/inkbox/render3d/view/ThreeFxProbe.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';
import { serializeWorld } from '../src/inkbox/io/save.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const checks = [];
function check(name, fn) { fn(); checks.push(name); console.log('PASS ' + name); }
function settled(level, success, source = true) {
  const f = fixture(250511 + level * 10 + Number(success)), { world, entity } = f;
  entity.level = level; entity.exp = 3000; entity.root.quality = 0;
  entity.x = entity.tx = 28.25; entity.y = entity.ty = 20.25;
  entity.heartDemon = 0; entity.pollution = 0; entity.karma = 0; entity.fortune = 50;
  configureBreakthroughPresentation(world, source);
  let calls = 0; const rng = () => { calls++; return success ? 0 : .99999; };
  attemptBreakthrough(world, entity, rng);
  return { world, entity, calls, event: peekRuntimeEvents(world).find(e => e.type === 'breakthrough') };
}
const minorSuccess = settled(8, true), minorFailure = settled(8, false);
const majorSuccess = settled(9, true), majorFailure = settled(9, false);
check('real attemptBreakthrough settles four distinct facts at actual character XY', () => {
  for (const [f, outcome, major, level] of [
    [minorSuccess,'success',false,8],[minorFailure,'failure',false,8],
    [majorSuccess,'success',true,9],[majorFailure,'failure',true,9]]) {
    assert.equal(f.event?.type,'breakthrough');
    assert.deepEqual([f.event.x,f.event.y,f.event.subjectId],[28.25,20.25,f.entity.id]);
    assert.equal(f.event.data.outcome,outcome); assert.equal(f.event.data.major,major);
    assert.equal(f.event.data.fromLevel,level); assert.equal(f.event.data.toLevel,f.entity.level);
    assert.equal(f.event.plane,'mortal');
  }
  assert(peekRuntimeEvents(majorSuccess.world).some(e=>e.type==='tribulation'));
});
check('source off changes only transient events; world and RNG remain identical', () => {
  for (const [level, success] of [[8,true],[8,false],[9,true],[9,false]]) {
    const on = settled(level,success,true), off = settled(level,success,false);
    assert.equal(off.event,undefined); assert.equal(on.calls,off.calls);
    assert.equal(digest(serializeWorld(on.world)),digest(serializeWorld(off.world)));
  }
});
check('event validation rejects invented or inconsistent results; bounded queue reserves major arrivals', () => {
  const world = {plane:'mortal',day:1}, data = {outcome:'success',major:false,fromLevel:8,toLevel:9};
  for (const bad of [{...data,toLevel:8},{...data,outcome:'failure',toLevel:9},{...data,major:'yes'}]) {
    assert.throws(()=>emitRuntimeEvent(world,'breakthrough',{x:8,y:9,subjectId:1,data:bad}));
  }
  for (let i=0;i<BREAKTHROUGH_RUNTIME_EVENT_CAP;i++) emitRuntimeEvent(world,'breakthrough',{x:8,y:9,subjectId:i+1,data});
  assert.equal(peekRuntimeEvents(world).length,BREAKTHROUGH_RUNTIME_EVENT_CAP);
  assert.equal(emitRuntimeEvent(world,'breakthrough',{x:8,y:9,subjectId:90,data}),null);
  assert(emitRuntimeEvent(world,'breakthrough',{x:8,y:9,subjectId:91,data:{...data,major:true}}));
  assert.equal(peekRuntimeEvents(world).length,BREAKTHROUGH_RUNTIME_EVENT_CAP);
});
function canvas(item, access = () => true, plane = 'mortal') {
  const commands=[];
  const ctx={save(){},restore(){},beginPath(){},moveTo(...x){commands.push(['move',...x]);},lineTo(...x){commands.push(['line',...x]);},
    ellipse(...x){commands.push(['ellipse',...x]);},stroke(){commands.push(['stroke',this.strokeStyle]);}};
  const camera={zoom:4,viewW:200,viewH:200,canAccess:access,tileScreen(x,y){return [x*4,y*4];}};
  drawFx(ctx,camera,minorSuccess.world,{items:[item]},plane);
  return commands;
}
check('Canvas and Stage show different ordinary/major and success/failure geometry', () => {
  const stage = new PresentationStage(), outputs=[];
  for (const f of [minorSuccess,minorFailure,majorSuccess,majorFailure]) {
    stage.ingestWorlds(f.world);
    const item = stage.snapshotPlane('mortal').items.find(i=>i.kind==='breakthrough');
    assert(item); outputs.push(canvas(item));
    assert.equal(canvas(item,()=>false).length,0);
    assert.equal(canvas(item,()=>true,'upper').length,0);
  }
  assert(outputs.every(o=>o.length>0));
  assert.equal(new Set(outputs.map(digest)).size,4);
  assert(outputs[2].filter(c=>c[0]==='ellipse').length>outputs[0].filter(c=>c[0]==='ellipse').length);
  stage.dispose();
});
check('FX cap preserves existing combat accounting and prioritizes major breakthroughs', () => {
  const fx=createFxState(), e=i=>({type:'breakthrough',plane:'mortal',day:1,x:20,y:20,subjectId:i,
    data:{outcome:'success',major:false,fromLevel:8,toLevel:9}});
  ingestRuntimeEvents(fx,Array.from({length:BREAKTHROUGH_FX_CAP+3},(_,i)=>e(i+1)));
  assert.equal(fx.items.length,BREAKTHROUGH_FX_CAP);
  ingestRuntimeEvents(fx,[{...e(99),data:{...e(99).data,major:true}}]);
  assert.equal(fx.items.length,BREAKTHROUGH_FX_CAP);assert.equal(fx.items.filter(i=>i.data.major).length,1);
  assert.equal(fx.combatReceived,0);assert.equal(fx.combatEvicted,0);
});
check('Three dedicated buffers differ, filter full footprint/plane, and dispose cleanly', () => {
  const world=majorSuccess.world, coordinates=createCoordinates(world),elevation=new ElevationField(world);
  const fx=new ThreeBreakthroughFx({plane:'mortal',coordinates,elevation});
  const item=(f)=>({plane:'mortal',kind:'breakthrough',x:28.25,y:20.25,age:.1,ttl:f.event.data.major?1.8:.75,
    seed:.3,data:f.event.data});
  try {
    const items=[minorSuccess,minorFailure,majorSuccess,majorFailure].map(item);
    fx.update(items,world);assert.equal(fx.stats.active,4);assert.equal(fx.stats.majorActive,2);
    assert.equal(fx.stats.successActive,2);assert.equal(fx.stats.failureActive,2);
    assert(new Set(Object.values(fx.batches).map(b=>digest([...b.geometry.attributes.position.array]))).size>=3);
    assert.equal(new Set(Object.values(fx.batches).map(b=>b.material.color.getHex())).size,4);
    const region=new RegionGeometry(world,new RegionMask(normalizeRegion([[28,19],[30,19],[30,22],[28,22]],world,.45)));
    fx.update([item(majorSuccess)],world,region,true);assert.equal(fx.stats.active,0);assert.equal(fx.stats.regionRejected,1);
    fx.update([item(majorSuccess)],world,region,false);assert.equal(fx.stats.active,0);
    fx.update([{...item(majorSuccess),plane:'upper'}],world);assert.equal(fx.stats.active,0);
    fx.update(Array.from({length:BREAKTHROUGH_3D_CAP+3},()=>item(majorSuccess)),world);
    assert.equal(fx.stats.active,BREAKTHROUGH_3D_CAP);assert.equal(fx.stats.overflow,3);
    fx.clear();assert(Object.values(fx.batches).every(b=>!b.mesh.visible && b.mesh.count===0));
  } finally { fx.dispose(); }
  assert(fx.disposed);assert.equal(fx.root.parent,null);
});
check('ThreeFxProbe consumes Stage snapshot and clears on renderer lifecycle', () => {
  const world=settled(9,true).world, stage=new PresentationStage(), coordinates=createCoordinates(world), elevation=new ElevationField(world);
  stage.ingestWorlds(world);
  const probe=new ThreeFxProbe({plane:'mortal',coordinates,elevation});
  try {
    probe.update(stage,world);assert.equal(probe.breakthrough.stats.active,1);
    assert.equal(probe.mesh.count,0);probe.clear();assert.equal(probe.breakthrough.stats.active,0);
  } finally { probe.dispose();stage.dispose(); }
  assert(probe.breakthrough.disposed);
});
console.log(`G2.5-C breakthrough: ${checks.length} checks passed`);
