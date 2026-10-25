import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { Life } from '../src/inkbox/sim/life.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { History } from '../src/inkbox/sim/powers.js';
import { planTransitRoute, transitGeographyStats } from '../src/inkbox/world/transitGeography.js';
import { readTransitJourneys, snapshotTransit } from '../src/inkbox/world/transitState.js';
import { requestCargoJourney, requestPersonJourney, stepTransit } from '../src/inkbox/sim/transit.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { recomputeAll } from '../src/inkbox/world/terrain.js';
import { TerrainStroke, restoreTerrainStroke } from '../src/inkbox/render3d/terrain/sculpt.js';
import { igniteCell, extinguishCell } from '../src/inkbox/sim/nature.js';
import { stepFire } from '../src/inkbox/sim/ecology.js';
import { installTransitScenario, applyTransitScenarioEdit, TRANSIT_SCENE_SEED } from '../src/inkbox/dev/transitScenario.js';

function setup() {
  const world=new World(200,128,TRANSIT_SCENE_SEED);
  const life=new Life(world,mulberry32(1234));
  const info=installTransitScenario(world,life),state=createAdvanceState();
  return {world,life,info,state,advance(days){return advanceWorld(world,days,{life,state,riftActive:false});}};
}
function foodBalance(w) {
  const s=w.transit,held=s.journeys.reduce((n,j)=>n+j.cargo.food,0);
  assert.equal(s.ledger.loaded,held+s.ledger.delivered+s.ledger.lost+s.ledger.returned);
}

{
  const f=setup(),{world:w,info:g}=f,h=new History();
  assert.equal(planTransitRoute(w,g.left,g.right).ok,true,'initial real land bridge');
  assert(applyTransitScenarioEdit(w,h,'cut'));
  assert.equal(planTransitRoute(w,g.left,g.right).ok,false,'formal sculpt breaks land connection');
  assert.equal(planTransitRoute(w,g.left,g.right,{mode:'water'}).ok,true,'actual permanent water route');
  const actor=w.entities.find(e=>e.id===g.flierId),personBefore={id:actor.id,age:actor.age,life:actor.lifespan,village:actor.village};
  const from=w.villageById(g.leftId),to=w.villageById(g.rightId),foodBefore=[from.food,to.food];
  const result=requestCargoJourney(w,{fromVillageId:from.id,toVillageId:to.id,food:24});
  assert(result.ok,result.reason);const ship=result.journey;
  assert.equal(from.food,foodBefore[0]-24);assert.equal(to.food,foodBefore[1]);
  assert.equal(ship.cargo.food,24);foodBalance(w);
  assert(requestPersonJourney(w,{actorId:actor.id,toVillageId:to.id}).ok);
  const noStatePosition={...ship.position};
  assert.equal(advanceWorld(w,100,{life:f.life}),null);
  assert.deepEqual(ship.position,noStatePosition,'missing clock state cannot advance journeys');
  let steps=0;
  while(ship.legMode!=='water'&&steps++<20) f.advance(1);
  assert.equal(ship.legMode,'water');
  const sailor=w.entities.find(e=>e.id===ship.actorId),sailorAge=sailor.age;
  assert.equal(sailor.id,ship.actorId);assert(sailor.hp>0);
  applyTransitScenarioEdit(w,h,'dam');f.advance(1);
  assert.equal(ship.status,'blocked','formal sea barrier blocks the actual ship');
  const held={...ship.position},cargo=ship.cargo.food;
  f.advance(3);assert.deepEqual(ship.position,held);assert.equal(ship.cargo.food,cargo);
  assert.equal(w.entities.find(e=>e.id===ship.actorId).age,sailorAge+4);
  assert.equal(w.transit.ledger.delivered,0,'blocked cargo is not delivered early');
  foodBalance(w);
  const payload=serializeWorld(w);
  assert.equal(payload.v,11);assert.equal(payload.transit.v,1);
  assert(!JSON.stringify(payload.transit).includes('points'),'derived route geometry is not saved');
  const restored=deserializeWorld(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(snapshotTransit(restored),payload.transit);
  assert.equal(restored.entities.find(e=>e.id===actor.id).age,actor.age);
  assert.equal(restored.entities.find(e=>e.id===actor.id).lifespan,actor.lifespan);
  assert.equal(restored.entities.find(e=>e.id===actor.id).village,personBefore.village);
  applyTransitScenarioEdit(restored,new History(),'reopen');
  const restoredLife=new Life(restored,mulberry32(1234)),restoredClock=createAdvanceState();
  const advance=days=>advanceWorld(restored,days,{life:restoredLife,state:restoredClock,riftActive:false});
  advance(1);
  const same=restored.transit.journeys.find(j=>j.id===ship.id);
  assert.equal(same.status,'active');assert.equal(same.cargo.food,24);
  for(let n=0;n<180&&same.status==='active';n++)advance(1);
  assert.equal(same.status,'arrived');assert.equal(same.cargo.food,0);
  assert.equal(restored.transit.ledger.delivered,24);
  const delivered=restored.transit.ledger.delivered,targetFood=restored.villageById(to.id).food;
  stepTransit(restored);stepTransit(restored);
  assert.equal(restored.transit.ledger.delivered,delivered);
  assert.equal(restored.villageById(to.id).food,targetFood,'same-day repeated ticks cannot deliver again');
  foodBalance(restored);
  const flier=restored.entities.find(e=>e.id===personBefore.id);
  assert(flier&&flier.age>personBefore.age&&flier.lifespan===personBefore.life);
  const airTrip=restored.transit.journeys.find(j=>j.actorId===flier.id&&j.kind==='person');
  assert.equal(airTrip.status,'arrived');
  assert.equal(flier.village,personBefore.village,'travel does not change social affiliation');
  const legacy={...payload};delete legacy.transit;
  assert.equal(deserializeWorld(legacy).transit,undefined,'old v11 blocks load without manufactured journeys');
  assert.throws(()=>deserializeWorld({...payload,transit:{...payload.transit,v:99}}));
  console.log('T0 integration: real Life/advance/powers, blocked reload, identity, delivery balance passed',
    JSON.stringify({ship:ship.id,actor:ship.actorId,flier:actor.id,day:restored.day,ledger:restored.transit.ledger,geo:transitGeographyStats(restored)}));
}
{
  // Exercise production Three transaction undo/redo, without reopening a
  // player undo control. These edits must invalidate the same route cache.
  const w=new World(32,24,77);w.height.fill(.16);w.water.fill(.19);w.temp.fill(.6);w.moist.fill(.55);
  for(let y=2;y<22;y++)for(let x=2;x<30;x++)if(x<15||x>16){w.height[w.idx(x,y)]=.43;w.water[w.idx(x,y)]=0;}
  for(const x of [15,16]){w.height[w.idx(x,12)]=.3;w.water[w.idx(x,12)]=0;}
  recomputeAll(w);const a={x:12,y:12},b={x:20,y:12};
  assert.equal(planTransitRoute(w,a,b).ok,true);
  const stroke=new TerrainStroke(w,{x:15.5,y:12.5},{radius:3,strength:.12,mode:'lower',syncWater:true,natural:false});
  const entry=stroke.finish();assert(entry);
  assert.equal(planTransitRoute(w,a,b).ok,false);
  assert(restoreTerrainStroke(w,entry,'before'));assert.equal(planTransitRoute(w,a,b).ok,true);
  assert(restoreTerrainStroke(w,entry,'after'));assert.equal(planTransitRoute(w,a,b).ok,false);
  console.log('T0 integration: internal Three undo/redo revalidates connectivity');
}
{
  const w=new World(12,8,71);w.height.fill(.43);w.temp.fill(.6);w.moist.fill(.55);
  recomputeAll(w);const a={x:2,y:4},b={x:9,y:4};
  assert.equal(planTransitRoute(w,a,b).ok,true);
  for(let y=1;y<7;y++)igniteCell(w,w.idx(5,y),1);
  assert.equal(planTransitRoute(w,a,b).ok,false,'formal fire barrier invalidates cached land route');
  for(let y=1;y<7;y++)extinguishCell(w,w.idx(5,y));
  assert.equal(planTransitRoute(w,a,b).ok,true,'formal extinguish restores cached connectivity');
  for(let y=1;y<7;y++)igniteCell(w,w.idx(5,y),1);
  assert.equal(planTransitRoute(w,a,b).ok,false);
  for(let n=0;n<4;n++)stepFire(w,1,()=>1);
  assert.equal(planTransitRoute(w,a,b).ok,true,'legacy explicit fire decay crosses the walkability threshold');
  for(let y=1;y<7;y++)igniteCell(w,w.idx(5,y),1);
  assert.equal(planTransitRoute(w,a,b).ok,false);
  advanceWorld(w,8,{state:createAdvanceState(),riftActive:false,nether:false,wraith:false});
  assert.equal(planTransitRoute(w,a,b).ok,true,'formal event expiry restores connectivity');
  console.log('T0 integration: ignition, extinction, explicit decay and game-day expiry invalidate routes');
}
