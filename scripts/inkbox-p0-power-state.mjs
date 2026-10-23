import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { Life } from '../src/inkbox/sim/life.js';
import { History } from '../src/inkbox/sim/powers.js';
import { TOOL_BY_ID } from '../src/inkbox/ui/tools.js';
import { observeToolBefore, observeToolAfter } from '../src/inkbox/sim/toolPresentation.js';
import { peekRuntimeEvents } from '../src/inkbox/core/runtimeEvents.js';
import { recomputeAll, OVER } from '../src/inkbox/world/terrain.js';
import { PresentationStage } from '../src/inkbox/render/presentationStage.js';
import { ThreeFxProbe } from '../src/inkbox/render3d/view/ThreeFxProbe.js';
import { ThreePowerFx } from '../src/inkbox/render3d/view/ThreePowerFx.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';

let checks=0;
function fixture(){
  const world=new World(64,48,1023001);world.height.fill(.55);world.type.fill(TERRAIN.GRASS);
  world.water.fill(0);world.veg.fill(.2);recomputeAll(world);
  let draws=0;const rng=()=>{draws++;return .5;};const life=new Life(world,rng);
  return {world,life,rng,draws:()=>draws};
}
function apply(f,id,{x=32.5,y=24.5,radius=5,targetEntityId}={}){
  const tool=TOOL_BY_ID[id],history=new History();history.begin();
  const ctx={world:f.world,life:f.life,events:f.life.events,rng:f.rng,history,x,y,radius,amount:tool.amount,targetEntityId};
  const raw=JSON.stringify(f.world),rngBefore=f.draws();const before=observeToolBefore(ctx,tool);
  assert.equal(JSON.stringify(f.world),raw,'observation before is simulation-pure');
  assert.equal(f.draws(),rngBefore,'observation before takes no RNG');
  let executions=0;ctx.result=(()=>{executions++;return tool.apply(ctx);})();
  const actual=JSON.stringify(f.world),rngAfter=f.draws();const outcome=observeToolAfter(ctx,before);
  assert.equal(executions,1);assert.equal(JSON.stringify(f.world),actual,'feedback never mutates actual result');
  assert.equal(f.draws(),rngAfter,'feedback takes no RNG');history.end(tool.name);checks++;
  return {ctx,outcome,events:peekRuntimeEvents(f.world).filter(e=>e.data?.power===true),
    waterEvents:peekRuntimeEvents(f.world).filter(e=>e.data?.tool==='water-response')};
}
function verifyThreePower(f, tool) {
  const stage=new PresentationStage();
  const probe=new ThreeFxProbe({plane:'mortal',coordinates:createCoordinates(f.world),
    elevation:new ElevationField(f.world)});
  try {
    stage.ingestWorlds(f.world).update(.15);
    const items=stage.snapshotPlane('mortal').items.filter(item=>item.kind==='power');
    assert(items.some(item=>item.data?.tool===tool),tool+' enters the shared 3D presentation stage');
    probe.update(stage,f.world);
    assert(probe.power.stats.active>0,tool+' draws a 3D power phase');
    assert(probe.power.stats.drawCalls<=3,'three shared batches bound draw calls');
    for(const [kind,capacity] of Object.entries(probe.power.stats.caps))
      if(kind!=='events')assert(probe.power.stats.instances[kind]<=capacity);
    stage.update(10);probe.update(stage,f.world);
    assert.equal(probe.power.stats.active,0,'short FX expire without simulation writes');
  } finally {probe.dispose();stage.dispose();}
}
for(const id of ['forest','fertile','rain','burn','lightning','meteor','quake']){
  const f=fixture(),i=f.world.idx(32,24);const before=f.world.veg[i];
  const {outcome,events}=apply(f,id);assert(outcome.changed,id+' has an actual world consequence');
  assert.equal(events.length,1,id+' emits one formal result');assert.equal(events[0].data.tool,id);
  assert(events[0].data.affectedCells>0);assert(events[0].x===32.5&&events[0].y===24.5);
  if(id==='forest'||id==='fertile'||id==='rain')assert(f.world.veg[i]>before);
  if(id==='burn')assert(f.world.veg[i]<before&&f.world.over[i]===OVER.SCORCHED&&f.world.fire[i]>0);
  verifyThreePower(f,id);
}
{
  const f=fixture(),prior=JSON.stringify(f.world.water);
  const {outcome,events,waterEvents}=apply(f,'flood');
  assert(outcome.changed&&JSON.stringify(f.world.water)!==prior,'flood changes authoritative water');
  assert.equal(events.length,0,'flood does not add a second generic impact over the water response');
  assert(waterEvents.length>=1&&waterEvents.every(e=>e.data.source==='flood'&&e.data.phase==='rise'),
    'flood FX follows only real rise/flow observations');
  verifyThreePower(f,'water-response');
}
{
  const f=fixture();f.life.spawn(32,24,'human',2);const people=f.world.entities;
  assert(people.length>=2);const chosen=people[1],other=people[0],age=chosen.age,life=chosen.lifespan;
  const r=apply(f,'root',{targetEntityId:chosen.id});
  assert(r.outcome.changed);assert.equal(chosen.level,1);assert.equal(chosen.age,age);assert(chosen.lifespan>life);
  assert.equal(other.level,0,'crowded pick never blesses neighbor');
  assert.equal(r.events[0].subjectId,chosen.id);assert.equal(r.events[0].x,chosen.x);assert.equal(r.events[0].y,chosen.y);
  const rejected=apply(f,'root',{targetEntityId:-999});assert(!rejected.outcome.changed);assert.equal(rejected.events.length,1,'failed attempt emits no additional success');
}
{
  const f=fixture(),i=f.world.idx(32,24),qi=f.world.qi[i];const r=apply(f,'leyline');
  assert(r.outcome.changed);assert.equal(f.world.leylines.length,1);assert(f.world.qi[i]>qi,'formal leyline immediately changes real Qi');
  const stage=new PresentationStage(),raw=JSON.stringify(f.world);stage.ingestWorlds(f.world).update(.3);
  assert(stage.snapshotPlane('mortal').items.some(item=>item.data?.tool==='leyline'));
  stage.update(10);assert.equal(stage.snapshotPlane('mortal').items.length,0);assert.equal(JSON.stringify(f.world),raw);stage.dispose();
}
{
  const f=fixture();f.life.spawn(32,24,'human',1);const e=f.world.entities.at(-1),id=e.id;
  const result=apply(f,'lightning');assert.equal(e.hp,0);assert.equal(result.outcome.killed,1);
  assert(f.world.entities.includes(e),'power leaves death to Life authority');
  f.life.step(.01);assert(!f.world.entities.some(e=>e.id===id));
  assert(f.world.dead.some(row=>row.id===id),'formal onDeath records real biography');
}
{
  const f=fixture();f.world.veg.fill(1);const r=apply(f,'forest');
  // The outer brush still sets lower canopy density, so retry after settling it.
  const again=apply(f,'forest');assert(!again.outcome.changed);assert.equal(again.events.length,r.events.length,'unchanged result has no extra FX');
}
{
  const f=fixture(),prior=JSON.stringify(f.world),r=apply(f,'crisis');
  assert(!r.outcome.changed,'an empty settlement crisis has no physical consequence or success FX');
  assert(r.outcome.persistentChanged,'cancelled crisis still changes the saved history and event ID');
  assert.equal(r.events.length,0,'empty crisis never displays a success spell');
  assert.notEqual(JSON.stringify(f.world),prior,'cancelled crisis history is a real save change');
}
{
  const f=fixture(),fx=new ThreePowerFx({plane:'mortal',coordinates:createCoordinates(f.world),
    elevation:new ElevationField(f.world)});
  const region={isInsideQuad:(x)=>x<31};
  try {
    fx.update([{kind:'power',plane:'mortal',x:30.5,y:24.5,age:1,ttl:3,seed:0,
      data:{tool:'fertile',radius:5}}],f.world,region,true);
    assert.equal(fx.stats.active,1,'near-edge event remains eligible');
    assert.equal(fx.batches.ring.mesh.count,0,'ring crossing the realm edge is culled as a whole');
    assert(fx.batches.stroke.mesh.count>0,'owned inner strokes remain visible');
    assert(fx.stats.regionRejected>0,'cross-boundary primitive rejection is reported');
    assert.equal(fx.ownedStroke(30,24,33,24,.1),false,'segment endpoint crossing the edge is rejected');
  } finally {fx.dispose();}
}
console.log(`P0-C real power state and pure feedback: ${checks} executions passed`);
