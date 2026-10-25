import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { Life } from '../src/inkbox/sim/life.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { invalidateTransitGeography, transitGeographyStats } from '../src/inkbox/world/transitGeography.js';
import { requestCargoJourney, requestPersonJourney, stepTransit, cancelJourney, destroyJourneyVehicle } from '../src/inkbox/sim/transit.js';
import { activeJourneyForEntity, snapshotTransit, restoreTransitSnapshot } from '../src/inkbox/world/transitState.js';

function fixture() {
  const world=new World(30,18,123);world.day=0;
  world.type.fill(TERRAIN.SEA);world.water.fill(0.15);
  for(let y=4;y<=13;y++)for(let x=2;x<=5;x++)land(world,x,y);
  for(let y=4;y<=13;y++)for(let x=24;x<=27;x++)land(world,x,y);
  world.villages=[{id:1,name:'甲',x:4,y:8,food:100,hp:100},{id:2,name:'乙',x:25,y:8,food:4,hp:100}];
  world.entities=[
    {id:1,sp:'human',level:0,age:19*360,lifespan:60*360,hp:100,village:1,x:4.5,y:8.5},
    {id:2,sp:'cultivator',level:20,age:25*360,lifespan:200*360,hp:100,village:1,x:4.5,y:8.5},
  ];
  return world;
}
function land(w,x,y) {const i=y*w.w+x;w.type[i]=TERRAIN.GRASS;w.water[i]=0;}
function sea(w,x,y) {const i=y*w.w+x;w.type[i]=TERRAIN.SEA;w.water[i]=0.15;}
function tick(w,day) {w.day=day;return stepTransit(w);}
function cloneWorld(w) {const copy=fixture();copy.day=w.day;copy.entities=w.entities.map(e=>({...e}));copy.villages=w.villages.map(v=>({...v}));return copy;}
function nearIslands() {
  const w=fixture();w.villages[1].x=15;
  for(let y=4;y<=13;y++)for(let x=13;x<=17;x++)land(w,x,y);
  return w;
}

{
  const w=fixture();
  assert.equal(requestCargoJourney(w,{fromVillageId:1,toVillageId:2,food:100}).ok,false);
  assert.equal(w.villages[0].food,100);
  assert.equal(w.transit,undefined);
  const result=requestCargoJourney(w,{fromVillageId:1,toVillageId:2,food:18});
  assert.equal(result.ok,true,result.reason);assert.equal(w.villages[0].food,82);
  assert.equal(w.villages[1].food,4);assert.equal(result.journey.cargo.food,18);
  assert.equal(activeJourneyForEntity(w,1)?.id,result.journey.id);
  assert.equal(requestCargoJourney(w,{fromVillageId:1,toVillageId:2,actorId:1}).ok,false);
  tick(w,5);assert.equal(result.journey.legMode,'water');
  const snapshot=snapshotTransit(w),copy=cloneWorld(w);
  copy.transit=restoreTransitSnapshot(snapshot,copy);
  tick(copy,100);tick(copy,101);
  assert.equal(copy.villages[1].food,22);
  assert.equal(copy.transit.ledger.delivered,18);
  assert.equal(copy.transit.journeys[0].status,'arrived');
  assert.equal(copy.entities[0].id,1);assert.equal(copy.entities[0].village,1);
}
{
  const w=fixture(),{journey:j}=requestCargoJourney(w,{fromVillageId:1,toVillageId:2,food:12});
  tick(w,4);assert.equal(j.status,'active');
  for(let y=0;y<w.h;y++)land(w,15,y);
  invalidateTransitGeography(w);tick(w,5);
  assert.equal(j.status,'blocked');assert.equal(j.cargo.food,12);assert.equal(w.villages[1].food,4);
  const plans=transitGeographyStats(w).plans;
  tick(w,5.1);tick(w,5.2);
  assert.equal(transitGeographyStats(w).plans,plans);
  for(let y=0;y<w.h;y++)sea(w,15,y);
  invalidateTransitGeography(w);tick(w,6);
  assert.equal(j.status,'active');assert.equal(j.id,1);assert.equal(j.cargo.food,12);
  tick(w,100);assert.equal(w.villages[1].food,16);
}
{
  const w=nearIslands();
  const first=requestCargoJourney(w,{fromVillageId:1,toVillageId:2,food:12});
  assert.equal(first.ok,true,first.reason);
  tick(w,100);assert.equal(first.journey.status,'arrived');
  assert.equal(w.entities[0].village,1);assert.equal(w.villages[0].food,88);
  assert.equal(w.villages[1].food,16);
  assert.equal(w.transit.journeys.length,1,'target-island sailor cannot load source-island food');
  const before=JSON.stringify(snapshotTransit(w));
  assert.equal(requestCargoJourney(w,{fromVillageId:1,toVillageId:2,actorId:1}).ok,false);
  assert.equal(JSON.stringify(snapshotTransit(w)),before);
}
{
  const w=nearIslands();w.entities[0].x=3.5;w.entities[0].y=10.5;
  const result=requestCargoJourney(w,{fromVillageId:1,toVillageId:2,food:12});
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.journey.goal.sourceReached,false);
  invalidateTransitGeography(w);
  tick(w,1);assert.equal(result.journey.legMode,'land');
  assert.equal(w.villages[1].food,4);
  tick(w,100);assert.equal(result.journey.status,'arrived');
  assert.equal(result.journey.goal.sourceReached,true);
  assert.equal(w.villages[1].food,16);
}
{
  const w=fixture(),{journey:j}=requestCargoJourney(w,{fromVillageId:1,toVillageId:2,food:12});
  cancelJourney(w,j.id);assert.equal(w.villages[0].food,100);
  assert.equal(w.transit.ledger.returned,12);assert.equal(j.status,'cancelled');
}
{
  const w=fixture(),{journey:j}=requestCargoJourney(w,{fromVillageId:1,toVillageId:2,food:12});
  tick(w,5);destroyJourneyVehicle(w,j.id);
  assert.equal(j.status,'lost');assert.equal(w.transit.ledger.lost,12);
  assert.equal(w.entities[0].hp,0);
}
{
  const w=fixture(),{journey:j}=requestPersonJourney(w,{actorId:2,toVillageId:2});
  assert.ok(j);tick(w,2);assert.equal(j.status,'active');
  const id=w.entities[1].id,villageId=w.entities[1].village;
  tick(w,20);assert.equal(j.status,'arrived');assert.equal(w.entities[1].id,id);
  assert.equal(w.entities[1].village,villageId);
}
{
  const w=fixture(),{journey:j}=requestCargoJourney(w,{fromVillageId:1,toVillageId:2,food:12});
  tick(w,1);w.entities[0].hp=0;tick(w,2);
  assert.equal(j.status,'lost');assert.equal(w.transit.ledger.lost,12);
}
{
  const w=fixture(),{journey:j}=requestCargoJourney(w,{fromVillageId:1,toVillageId:2,food:12});
  w.villages.pop();tick(w,1);assert.equal(j.status,'lost');
  assert.equal(w.transit.ledger.lost,12);
}
{
  const w=fixture(),{journey:j}=requestCargoJourney(w,{fromVillageId:1,toVillageId:2,food:12});
  tick(w,5);w.villages.pop();tick(w,6);
  assert.equal(j.status,'lost');assert.equal(w.entities[0].hp,0);
}
{
  const w=fixture();tick(w,30);
  assert.equal(w.transit.journeys.length,1);
  assert.equal(w.transit.journeys[0].cargo.food,12);
  tick(w,30.1);assert.equal(w.transit.journeys.length,1);
}
{
  const w=fixture();for(let y=0;y<w.h;y++)land(w,15,y);
  const before=JSON.stringify(snapshotTransit(w));
  assert.equal(requestCargoJourney(w,{fromVillageId:1,toVillageId:2}).ok,false);
  assert.equal(requestPersonJourney(w,{actorId:1,toVillageId:2}).ok,false);
  assert.equal(JSON.stringify(snapshotTransit(w)),before);
  assert.equal(w.villages[0].food,100);
  tick(w,30);assert.equal(w.transit,undefined);
  const plans=transitGeographyStats(w).plans;tick(w,30.1);
  assert.equal(transitGeographyStats(w).plans,plans);
}
{
  const w=fixture(),{journey:j}=requestPersonJourney(w,{actorId:2,toVillageId:2});
  tick(w,2);cancelJourney(w,j.id);
  assert.equal(j.goal.cancelRequested,true);
  land(w,25,8);w.type[8*w.w+25]=TERRAIN.MOUNTAIN;
  invalidateTransitGeography(w);tick(w,3);assert.equal(j.status,'blocked');
  const copy=cloneWorld(w);copy.type.set(w.type);copy.water.set(w.water);
  copy.transit=restoreTransitSnapshot(snapshotTransit(w),copy);
  assert.equal(copy.transit.journeys[0].goal.cancelRequested,true);
  land(copy,25,8);invalidateTransitGeography(copy);tick(copy,4);
  assert.equal(copy.transit.journeys[0].status,'landing');
  tick(copy,20);assert.equal(copy.transit.journeys[0].status,'cancelled');
}
{
  const w=fixture();assert.throws(()=>restoreTransitSnapshot({v:2,journeys:[]},w));
  assert.equal(restoreTransitSnapshot(undefined,w),null);
}
{
  const w=fixture();w.entities=[];w.nextEntityId=1;
  const life=new Life(w,()=>0.5);
  assert.equal(life.spawn(4,8,'human',1,0,{village:1,genesis:true}),1);
  const sailor=w.entities[0];
  const result=requestCargoJourney(w,{fromVillageId:1,toVillageId:2,actorId:sailor.id,food:12});
  assert.equal(result.ok,true,result.reason);
  tick(w,5);assert.equal(result.journey.legMode,'water');
  const position={x:sailor.x,y:sailor.y},age=sailor.age;
  w.day=6;life.stepEntity(sailor,1);
  assert.equal(sailor.age,age+1);
  assert.deepEqual({x:sailor.x,y:sailor.y},position);
  stepTransit(w);assert.notDeepEqual({x:sailor.x,y:sailor.y},position);
}
console.log('T0 journeys: pass');
