import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { makeTestHost } from './inkbox-c2c-test-utils.mjs';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';
import { ThreeFxProbe } from '../src/inkbox/render3d/view/ThreeFxProbe.js';
import { RiftNarrativeFx, RIFT_FX_CAPACITY } from '../src/inkbox/render3d/view/RiftNarrativeFx.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';
import { PresentationStage } from '../src/inkbox/render/presentationStage.js';
import { emitPresentation, emitRiftCross } from '../src/inkbox/sim/presentation.js';
import { peekRuntimeEvents } from '../src/inkbox/core/runtimeEvents.js';
import { openRifts } from '../src/inkbox/sim/rifts.js';

const OUT=path.resolve(process.env.INKBOX_REPORT_DIR||'reports/local/m2c2c/rifts');
const report={suite:'C2C persistent Rift and fixed snapshot brush pool',checks:[],gpu:false,
  fixture:'existing producer and presentation API unit fixtures; overflow snapshots are explicit technical stress, not live gameplay'};
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const check=(name,fn)=>{fn();report.checks.push({name,passed:true});console.log(`PASS ${name}`);};
function worlds(seed=516){const preset={w:64,h:48},world=generateWorld({preset,seed,scatter:true});
  world.upper=generateUpperWorld({preset,seed});world.nether=generateNetherWorld({preset,seed});return world;}
const world=worlds(),coordinates=createCoordinates(world),elevation=new ElevationField(world);

check('actual openRifts producer reaches the sole presentation consumer and new Host pool',()=>{
  const opened=openRifts(world,{x0:15,y0:12,x1:40,y1:33},'nether');assert(opened.opened>0);
  const presentation=new PresentationStage().ingestWorlds(world).update(.01),before=sha(world);
  const snapshot=presentation.snapshotPlane('mortal');assert(snapshot.items.some(i=>i.kind==='rift'));
  assert(Object.isFrozen(snapshot)&&Object.isFrozen(snapshot.items)&&snapshot.items.every(Object.isFrozen));
  const host=makeTestHost(world,{geography:true});
  try{host.setPresentation(presentation);host.update(.01);
    assert(host.stages.get('mortal').fxProbe.stats.active>0);
    assert.equal(host.stages.get('mortal').fxProbe.mesh.count,0,'new Rift items must not duplicate debug rings');
    assert.equal(sha(world),before);
  }finally{host.dispose();}
});

check('four audited API event kinds map to torn brushes without a second queue drain',()=>{
  const current=worlds(),presentation=new PresentationStage();
  for(const type of ['rift-open','possession','ascension','tribulation'])
    assert(emitPresentation(current,type,{x:25,y:22,subjectId:7,targetId:8}));
  assert.equal(emitRiftCross(current,{kind:'person',fromPlane:'mortal',toPlane:'upper',fromX:25,fromY:22,toX:29,toY:24,subjectId:7}).length,2);
  presentation.ingestWorlds(current).update(.01);
  const frozen=presentation.snapshotPlane('mortal'),snapshotSha=sha(frozen),before=sha(current);
  // Leave a new event unconsumed to prove that Render3D only reads snapshots.
  emitPresentation(current,'rift-open',{x:28,y:24});const queued=peekRuntimeEvents(current);
  const probe=new ThreeFxProbe({plane:'mortal',coordinates:createCoordinates(current),elevation:new ElevationField(current)});
  let reads=0;const reader={snapshotPlane:()=>{reads++;return frozen;}};
  try{probe.update(reader,current,{enabled:true});
    assert.equal(reads,1);assert.equal(probe.stats.events,4);assert.equal(probe.stats.active,12);
    assert.equal(probe.mesh.count,1,'unrelated legacy tribulation remains');
    assert.equal(sha(frozen),snapshotSha);assert.equal(sha(current),before);
    assert.deepEqual(peekRuntimeEvents(current),queued);
    const ids=[probe.narrative.mesh.uuid,probe.narrative.geometry.uuid,probe.narrative.material.uuid];
    for(let i=0;i<60;i++)probe.update(reader,current,{enabled:i%2===0});
    assert.deepEqual([probe.narrative.mesh.uuid,probe.narrative.geometry.uuid,probe.narrative.material.uuid],ids);
    assert.equal(probe.stats.active,0);assert.equal(probe.mesh.count,5,'off retains former debug representation');
  }finally{probe.dispose();}
});

check('bounded fixed buffer capacity, deterministic replay, honest overflow and expiry',()=>{
  const fx=new RiftNarrativeFx({plane:'mortal',coordinates,elevation});
  const item=Object.freeze({plane:'mortal',kind:'rift',x:25,y:22,seed:.4,age:.1,ttl:.9,data:null});
  const items=Object.freeze(Array.from({length:90},()=>item));
  const ids=[fx.mesh.uuid,fx.geometry.uuid,fx.material.uuid,fx.mesh.instanceMatrix,fx.mesh.instanceColor,fx.opacity];
  try{fx.update(items,world);assert.equal(fx.mesh.count,RIFT_FX_CAPACITY);assert.equal(fx.stats.overflow,26);
    assert.equal(fx.stats.drawCalls,1);assert.equal(fx.stats.triangles,1536);
    const first=sha([...fx.mesh.instanceMatrix.array]);
    for(let i=0;i<600;i++)fx.update(items,world);
    assert.equal(sha([...fx.mesh.instanceMatrix.array]),first);
    assert.deepEqual([fx.mesh.uuid,fx.geometry.uuid,fx.material.uuid,fx.mesh.instanceMatrix,fx.mesh.instanceColor,fx.opacity],ids);
    fx.update([Object.freeze({...item,age:.9})],world);assert.equal(fx.mesh.count,0);assert(!fx.mesh.visible);
  }finally{fx.dispose();fx.dispose();}
});

check('cross directions require complete actual payload and plane/phase consistency',()=>{
  const fx=new RiftNarrativeFx({plane:'mortal',coordinates,elevation});
  const item={plane:'mortal',kind:'riftcross',x:25,y:22,seed:.2,age:.1,ttl:.7};
  try{fx.update([Object.freeze({...item,data:null})],world);
    assert.equal(fx.stats.genericDirections,1);assert.equal(fx.mesh.count,4);
    const data={fromPlane:'mortal',toPlane:'upper',fromX:25,fromY:22,toX:30,toY:25,phase:'depart'};
    fx.update([Object.freeze({...item,data:Object.freeze(data)})],world);
    assert.equal(fx.stats.genericDirections,0);assert.equal(fx.mesh.count,2);
    const matrix=fx.mesh.instanceMatrix.array;
    assert(matrix[0]>0&&matrix[2]>0,'first stroke follows the true positive X/Y displacement');
    fx.update([Object.freeze({...item,data:Object.freeze({...data,phase:'arrive'})})],world);
    assert.equal(fx.stats.genericDirections,1,'mismatched arrival plane cannot invent a direction');
    fx.update([Object.freeze({...item,plane:'nether',data:Object.freeze(data)})],world);assert.equal(fx.mesh.count,0);
  }finally{fx.dispose();}
});

check('shared Region quad ownership rejects complete strokes on the wrong plane side',()=>{
  const region=new RegionMask(normalizeRegion([[18,15],[40,15],[40,35],[18,35]],world,.45));
  const geometry=new RegionGeometry(world,region),fx=new RiftNarrativeFx({plane:'mortal',coordinates,elevation});
  const item=Object.freeze({plane:'mortal',kind:'rift',x:25,y:22,seed:.1,age:.1,ttl:.9});
  try{fx.update([item],world,geometry,false);assert.equal(fx.mesh.count,0);assert(fx.stats.regionRejected>0);
    fx.update([item],world,geometry,true);assert.equal(fx.mesh.count,4);
    const outside=Object.freeze({...item,x:10,y:8});fx.update([outside],world,geometry,false);assert.equal(fx.mesh.count,4);
    fx.update([outside],world,geometry,true);assert.equal(fx.mesh.count,0);
  }finally{fx.dispose();}
});

check('World replacement releases each owned pool once and creates empty new buffers',()=>{
  const host=makeTestHost(world,{geography:true});
  try{let disposed=0;const old=[...host.stages.values()].map(s=>s.fxProbe.narrative);
    for(const fx of old){fx.geometry.addEventListener('dispose',()=>disposed++);fx.material.addEventListener('dispose',()=>disposed++);}
    host.setWorld(worlds(517));assert.equal(disposed,6);assert(old.every(fx=>fx.disposed));
    host.update(.2);assert([...host.stages.values()].every(s=>s.fxProbe.stats.active===0));
  }finally{host.dispose();}
});

const sources=['src/inkbox/render3d/view/RiftNarrativeFx.js','src/inkbox/render3d/view/ThreeFxProbe.js'];
check('new presentation modules cannot write World or consume simulation randomness',()=>{
  for(const file of sources){const text=fs.readFileSync(file,'utf8');
    assert(!/from\s+['"][^'"]*sim\//.test(text));assert(!/Math\.random\s*\(|\.rng\s*\(/.test(text));
    assert(!/\bworld\.[\w$]+\s*=(?!=)/.test(text));
    assert(!/import[\s\S]*?\bdrainRuntimeEvents\b[\s\S]*?from/.test(text));
  }
});
// Persistent-wound contracts are maintained alongside their layer implementation.
await import('./inkbox-render3d-m2c2c-rift-wounds.mjs');
report.passed=true;fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'rifts.json'),JSON.stringify(report,null,2));
