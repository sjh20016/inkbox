// CPU geometry, snapshot, clipping and owned-resource checks. GPU proof is in test:g2:browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';
import { ThreeFxProbe } from '../src/inkbox/render3d/view/ThreeFxProbe.js';
import { ThreeCombatFx, COMBAT_3D_CAP } from '../src/inkbox/render3d/view/ThreeCombatFx.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';
import { PresentationStage } from '../src/inkbox/render/presentationStage.js';
import { emitPresentation } from '../src/inkbox/sim/presentation.js';
import { peekRuntimeEvents } from '../src/inkbox/core/runtimeEvents.js';
import { makeTestHost } from './inkbox-c2c-test-utils.mjs';

const report={suite:'G2 pooled 3D snapshot brushes',gpu:false,checks:[]};
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const check=(name,fn)=>{fn();report.checks.push({name,pass:true});console.log('PASS '+name);};
function worlds(seed=729){
  const preset={w:64,h:48},world=generateWorld({preset,seed,scatter:true});
  world.upper=generateUpperWorld({preset,seed});world.nether=generateNetherWorld({preset,seed});return world;
}
const world=worlds(),coordinates=createCoordinates(world),elevation=new ElevationField(world);
const combat=(style='blade',extra={})=>Object.freeze({plane:'mortal',kind:'combat',x:26,y:22,age:.1,ttl:.65,
  seed:.4,intensity:.6,subjectId:1,targetId:2,data:Object.freeze({style,fromX:25,fromY:22,tier:'mid'}),...extra});
const lightning=Object.freeze({plane:'mortal',kind:'lightning',x:27,y:22,age:.1,ttl:.7,seed:.1});
const options={plane:'mortal',coordinates,elevation};

check('three styles submit distinct shared geometry at actual entity coordinates',()=>{
  const fx=new ThreeCombatFx(options),before=sha(world);
  try{
    fx.update(['blade','fire','thunder'].map(style=>combat(style)),world);
    assert.equal(fx.stats.active,3);assert.equal(fx.stats.combatActive,3);
    assert.deepEqual(fx.stats.styleCounts,{blade:1,fire:1,thunder:1});assert.equal(fx.stats.drawCalls,3);
    assert.equal(new Set(Object.values(fx.batches).map(b=>sha([...b.geometry.attributes.position.array]))).size,3);
    const m=fx.batches.blade.mesh.instanceMatrix.array;
    assert(Math.abs(m[12]-(25.5-(world.w-1)/2))<1e-5);
    assert(Math.abs(m[14]-(22-(world.h-1)/2))<1e-5,'entity coordinates have no half-cell offset');
    const expected=(elevation.at(25,22)+elevation.at(26,22))/2+.6;
    assert(Math.abs(m[13]-expected)<1e-5,'use the existing stage elevation interface');
    assert.equal(sha(world),before);
    assert(Object.values(fx.batches).every(b=>b.mesh.userData.presentationOnly));
  }finally{fx.dispose();}
});

check('near-contact hit remains visible-sized, at the true midpoint, with conservative ownership',()=>{
  const fx=new ThreeCombatFx(options),item=combat('thunder',{x:24.775,y:22,data:{style:'thunder',fromX:24.725,fromY:22,tier:'high'}});
  try{
    const before=sha(world);fx.update([item],world);assert.equal(fx.stats.active,1);
    const m=fx.batches.thunder.mesh.instanceMatrix.array;
    assert(Math.abs(m[12]-(24.75-(world.w-1)/2))<1e-5);
    assert(Math.abs(m[14]-(22-(world.h-1)/2))<1e-5);
    assert(Math.hypot(m[0],m[2])>.4,'near-contact glyph must not collapse below overlapping character feet');
    const region=new RegionGeometry(world,new RegionMask(normalizeRegion([[24,20],[28,20],[28,26],[24,26]],world,.45)));
    fx.update([item],world,region,true);
    assert.equal(fx.stats.active,0,'true center inside does not permit the expanded brush to cross a window edge');
    assert.equal(fx.stats.regionRejected,1);assert.equal(sha(world),before);
  }finally{fx.dispose();}
});
check('single immutable snapshot read leaves the runtime queue untouched',()=>{
  const stage=new PresentationStage();
  for(const style of ['blade','fire','thunder'])assert(emitPresentation(world,'combat-hit',{
    x:26,y:22,subjectId:1,targetId:2,intensity:.6,data:{style,fromX:25,fromY:22,tier:'mid'}}));
  stage.ingestWorlds(world).update(.01);
  const snapshot=stage.snapshotPlane('mortal'),before=sha(snapshot),probe=new ThreeFxProbe(options);
  emitPresentation(world,'tool-impact',{x:28,y:24});const queued=peekRuntimeEvents(world);
  let reads=0;const reader={combatEnabled:true,snapshotPlane:()=>{reads++;return snapshot;}};
  try{
    probe.update(reader,world,{enabled:true});
    assert.equal(reads,1);assert.equal(probe.combat.stats.combatActive,3);
    assert.equal(probe.mesh.count,0,'combat cannot be represented by the old debug rings');
    assert.equal(sha(snapshot),before);assert.deepEqual(peekRuntimeEvents(world),queued);
    reader.combatEnabled=false;probe.update(reader,world,{enabled:true});assert.equal(probe.combat.stats.combatActive,0);
  }finally{probe.dispose();stage.dispose();}
});

check('all three planes filter snapshots independently',()=>{
  for(const plane of ['mortal','upper','nether']){
    const w=plane==='mortal'?world:world[plane],fx=new ThreeCombatFx({plane,coordinates,elevation:new ElevationField(w)});
    try{
      const items=['mortal','upper','nether'].map(p=>combat('blade',{plane:p}));
      fx.update(items,w);assert.equal(fx.stats.combatActive,1);
      fx.update(items.filter(i=>i.plane!==plane),w);assert.equal(fx.stats.active,0);
    }finally{fx.dispose();}
  }
});

check('fixed buffers protect real lightning and bound dense combat without object growth',()=>{
  const fx=new ThreeCombatFx(options);
  const ids=Object.values(fx.batches).map(b=>[b.mesh.uuid,b.geometry.uuid,b.material.uuid,b.mesh.instanceMatrix,b.opacity,b.detail]);
  try{
    const items=Object.freeze([...Array.from({length:40},()=>combat('fire')),lightning,lightning]);
    fx.update(items,world);assert.equal(fx.stats.active,COMBAT_3D_CAP);assert.equal(fx.stats.lightningActive,2);
    assert.equal(fx.stats.combatActive,30);assert.equal(fx.stats.overflow,10);assert.equal(fx.stats.drawCalls,2);
    const matrices=Object.values(fx.batches).map(b=>sha([...b.mesh.instanceMatrix.array]));
    for(let i=0;i<500;i++)fx.update(items,world);
    assert.deepEqual(Object.values(fx.batches).map(b=>[b.mesh.uuid,b.geometry.uuid,b.material.uuid,b.mesh.instanceMatrix,b.opacity,b.detail]),ids);
    assert.deepEqual(Object.values(fx.batches).map(b=>sha([...b.mesh.instanceMatrix.array])),matrices);
    fx.update(items,world,null,true,{combatEnabled:false});
    assert.equal(fx.stats.lightningActive,2);assert.equal(fx.stats.combatActive,0);
    fx.update([combat('blade',{age:.65}),{...lightning,age:.7}],world);assert.equal(fx.stats.active,0);
    assert(Object.values(fx.batches).every(b=>!b.mesh.visible&&b.mesh.count===0));
  }finally{fx.dispose();}
});

check('complete footprints reject window crossings, access edges and expired strokes',()=>{
  const mask=new RegionMask(normalizeRegion([[18,15],[40,15],[40,35],[18,35]],world,.45));
  const region=new RegionGeometry(world,mask),fx=new ThreeCombatFx(options);
  try{
    fx.update([combat()],world,region,true);assert.equal(fx.stats.active,1);
    fx.update([combat()],world,region,false);assert.equal(fx.stats.active,0);assert.equal(fx.stats.regionRejected,1);
    const crossing=combat('thunder',{x:18.2,data:{style:'thunder',fromX:17.8,fromY:22,tier:'high'}});
    fx.update([crossing],world,region,true);assert.equal(fx.stats.active,0);assert.equal(fx.stats.regionRejected,1);
    const edge=combat('blade',{x:.02,data:{style:'blade',fromX:.02,fromY:22,tier:'high'}});
    fx.update([edge],world);assert.equal(fx.stats.active,0,'even coincident impacts own their entire rotated footprint');
    fx.update([combat('blade',{x:NaN}),combat('invalid'),combat('blade',{age:-1})],world);assert.equal(fx.stats.active,0);
  }finally{fx.dispose();}
});

check('lightning-style ignition detail requires its confirmed terrain cell to be visible',()=>{
  const fx=new ThreeCombatFx(options),item=combat('thunder',{data:{style:'thunder',fromX:25,fromY:22,tier:'mid',ignition:{
    cells:1,x:32,y:22,plane:'mortal',day:1,actorId:1,targetId:2,
  }}});
  const detail=()=>fx.batches.thunder.detail.getX(0);
  try{
    fx.update([item],world);assert.equal(fx.stats.combatActive,1);assert.equal(detail(),2,'a confirmed visible fact keeps its orange detail');
    const noFact=combat('thunder',{data:{style:'thunder',fromX:25,fromY:22,tier:'mid'}});
    fx.update([noFact],world);assert.equal(fx.stats.combatActive,1);assert.equal(detail(),1,'a hit without a fact uses ordinary mid-tier detail');
    const hidden=new RegionGeometry(world,new RegionMask(normalizeRegion([[18,15],[30,15],[30,35],[18,35]],world,.45)));
    fx.update([item],world,hidden,true);
    assert.equal(fx.stats.combatActive,1,'the brush remains visible when its own footprint is inside');
    assert.equal(detail(),1,'a confirmed fact in a hidden cell cannot color the brush orange');
    const visible=new RegionGeometry(world,new RegionMask(normalizeRegion([[18,15],[34,15],[34,35],[18,35]],world,.45)));
    fx.update([item],world,visible,true);assert.equal(fx.stats.combatActive,1);assert.equal(detail(),2,'including the fact cell restores orange detail');
  }finally{fx.dispose();}
});

check('Host hidden planes clear and World replacement disposes every shared resource exactly once',()=>{
  assert(emitPresentation(world.upper,'combat-hit',{
    x:26,y:22,subjectId:1,targetId:2,intensity:.6,
    data:{style:'thunder',fromX:25,fromY:22,tier:'high'}}));
  const stage=new PresentationStage().ingestWorlds(world);
  const host=makeTestHost(world,{geography:true});
  let disposed=0;
  try{
    host.setPresentation(stage);
    const previous=[...host.stages.values()].map(s=>s.fxProbe.combat);
    for(const fx of previous)for(const b of Object.values(fx.batches)){
      b.geometry.addEventListener('dispose',()=>disposed++);b.material.addEventListener('dispose',()=>disposed++);
    }
    host.update(.01);
    assert.equal(host.stages.get('upper').fxProbe.combat.stats.active,0,'closed windows have no active instances');
    host.setWorld(worlds(730));assert.equal(disposed,18);assert(previous.every(fx=>fx.disposed));
    host.setPresentation(new PresentationStage().ingestWorlds(host.world));host.update(.01);
    assert([...host.stages.values()].every(s=>s.fxProbe.combat.stats.active===0));
    for(const fx of previous)fx.dispose();assert.equal(disposed,18);
  }finally{host.dispose();stage.dispose();}
});

check('new FX resources release once and detach their presentation roots',()=>{
  const fx=new ThreeCombatFx(options);let released=0;
  for(const b of Object.values(fx.batches)){
    b.geometry.addEventListener('dispose',()=>released++);b.material.addEventListener('dispose',()=>released++);
  }
  fx.dispose();fx.dispose();assert.equal(released,6);assert.equal(fx.root.children.length,0);assert.equal(fx.root.parent,null);
});

report.pass=true;
const output=path.resolve(process.env.INKBOX_REPORT_DIR||'reports/local/g2/three');
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'g2-three.json'),JSON.stringify(report,null,2));
console.log('G2 3D CPU checks: '+report.checks.length+' passed');
