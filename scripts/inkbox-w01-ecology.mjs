import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { OVER, recomputeTile } from '../src/inkbox/world/terrain.js';
import { settleNature } from '../src/inkbox/sim/nature.js';
import { addWanlingEffect, wanlingState } from '../src/inkbox/world/wanlingState.js';
import { requestWanling, removeWanling, stepWanling, wanlingVillageInfluence,
  wanlingGuardAt, wanlingResonanceAt, isWanlingHostile } from '../src/inkbox/sim/wanling.js';

function world() {
  const w=new World(32,32,773);
  w.height.fill(0.45);w.moist.fill(0.5);w.temp.fill(0.6);w.veg.fill(0.8);
  w.type.fill(TERRAIN.GRASS);w.qi.fill(0.35);
  return w;
}
function place(w,form,x,y) {
  const r=requestWanling(w,form,x,y);
  assert.equal(r.ok,true,`${form}: ${r.reason}`);
  assert.ok(r.unit.id<0);assert.ok(!w.entities.includes(r.unit));
  return r.unit;
}
function advance(w,days) {w.day+=days;stepWanling(w,days);}

// 1. Real village multiplier is derived from live proximity and vanishes on removal.
{
  const w=world(),v={x:12,y:12},d=place(w,'dangkang',12,13);
  assert.equal(wanlingVillageInfluence(w,v).yieldScale,1.15);
  assert.equal(wanlingVillageInfluence(w,{x:30,y:30}).yieldScale,1);
  removeWanling(w,d.id);
  assert.equal(wanlingVillageInfluence(w,v).yieldScale,1);
}
// 2. Herd grazing/capture and guard+sound reversal are observable state.
{
  const w=world(),deer=place(w,'deer',10,10),wolf=place(w,'wolf',11,10);
  const count=deer.count;advance(w,30);assert.ok(deer.count<count);
  assert.ok(w.wanling.events.some(e=>e.id===deer.id&&e.day===30&&e.text.includes('数量')),
    'the first real predation after placement is visible without waiting ninety days');
  const dog=place(w,'tiangou',13,12),wolfHp=wolf.hp;advance(w,30);
  assert.ok(wolf.hp<wolfHp);assert.ok(wanlingGuardAt(w,13,12)>0);
  assert.equal(isWanlingHostile(w,{form:'dangkang',sp:'beast'}, {sp:'human'}),false);
  assert.equal(isWanlingHostile(w,{form:'qiongqi',sp:'beast'}, {karma:-30,x:13,y:12}),false);
  removeWanling(w,dog.id);
  assert.equal(wanlingGuardAt(w,13,12),0);
}
// One wolf near two herds takes exactly one deer in one ecology period.
{
  const w=world(),a=place(w,'deer',10,10),b=place(w,'deer',20,20),wolf=place(w,'wolf',11,10);
  b.x=b.tx=11.5;b.y=b.ty=11.5;
  const before=a.count+b.count;
  advance(w,30);
  assert.equal(a.count+b.count,before-1);
  assert.equal(wolf.state,'hunting');
}
// Coincident predator/prey still produces a nonzero escape destination.
{
  const w=world(),deer=place(w,'deer',10,10),wolf=place(w,'wolf',11,10);
  wolf.x=wolf.tx=deer.x;wolf.y=wolf.ty=deer.y;
  const before=deer.count;advance(w,30);
  assert.equal(deer.count,before-1);
  assert.ok(Math.hypot(deer.tx-10.5,deer.ty-10.5)>0.1);
}
// Low grass causes bounded migration toward an actual greener legal cell.
{
  const w=world(),deer=place(w,'deer',10,10);
  w.veg.fill(0);w.veg[w.idx(12,10)]=0.8;
  const before=deer.count;advance(w,30);
  assert.equal(deer.count,before);assert.equal(deer.state,'migrating');
  assert.ok(deer.tx>deer.x);
}
// A hungry pack takes at most one food per month; dog or sound prevents it.
{
  const w=world(),v={id:1,name:'试村',x:12,y:12,hp:60,food:10};w.villages.push(v);
  const wolf=place(w,'wolf',11,12);advance(w,30);
  assert.equal(v.food,9);assert.equal(wolf.state,'raiding');
  advance(w,1);assert.equal(v.food,9);
  const dog=place(w,'tiangou',12,14);advance(w,29);assert.equal(v.food,9);
  removeWanling(w,dog.id);
  wolf.x=wolf.tx=11.5;wolf.y=wolf.ty=12.5;
  addWanlingEffect(w,{kind:'calm',sourceId:0,targetId:wolf.id,x:11.5,y:12.5,radius:1,value:.5,untilDay:150});
  advance(w,30);assert.equal(v.food,9);
  wolf.x=wolf.tx=18.5;wolf.y=wolf.ty=12.5;
  assert.ok(wanlingState(w).effects.some(e=>e.kind==='calm'));
  advance(w,30);assert.equal(wolf.state,'calm');
}
// 3. Forest anchor uses actual vegetation; losing forest weakens/dissipates.
{
  const w=world(),wood=place(w,'wood',10,10);
  w.veg.fill(0);const hp=wood.hp;advance(w,30);
  assert.ok(wood.hp<hp||wood.state==='migrating');
  for(let n=0;n<5;n++) advance(w,30);
  assert.equal(w.wanling.units.some(u=>u.id===wood.id),false);
  w.veg.fill(0.8);assert.equal(requestWanling(w,'wood',10,10).ok,true);
}
// 4. Jingwei writes the actual shallow cell through terrainEdit and topology dirtiness.
{
  const w=world(),i=w.idx(11,10);w.water[i]=0.01;recomputeTile(w,11,10);
  const bird=place(w,'jingwei',10,10),before=w.height[i];advance(w,30);
  assert.ok(w.height[i]>before);assert.ok(w.water[i]<0.01);
  assert.equal(bird.state,'building');
}
// 5. Fei uses Nature's scheduled overlay recovery, without permanent terrain damage.
{
  const w=world(),u=place(w,'fei',10,10),i=w.idx(10,10),old=w.veg[i];
  advance(w,30);assert.equal(w.over[i],OVER.SCORCHED);assert.ok(w.veg[i]<old);
  assert.ok(w.nature.overlays.has(i));removeWanling(w,u.id);
  w.day=391;settleNature(w,w.day);
  assert.equal(w.over[i],OVER.NONE);assert.ok(Math.abs(w.veg[i]-old)<0.001);
}
// Independent leyline resonance and real karma targeting do not allocate Life entities.
{
  const w=world();w.leylines=[{x:15,y:15,radius:8,strength:0.5}];
  w.qi[w.idx(15,15)]=0.8;place(w,'dijiang',15,15);
  assert.ok(wanlingResonanceAt(w,15,15)>0);
  assert.equal(wanlingResonanceAt(w,30,30),0);
  const p={id:1,x:20,y:20,hp:30,maxHp:30,karma:-50,sp:'human'};w.entities.push(p);
  place(w,'qiongqi',20,21);advance(w,30);assert.ok(p.hp<30&&p.hp>0);
}
// Qiongqi honors target-following sound calm for the effect's full lifetime.
{
  const w=world(),p={id:2,x:10,y:10,hp:30,maxHp:30,karma:-50,sp:'human'};
  w.entities.push(p);const q=place(w,'qiongqi',11,10);
  addWanlingEffect(w,{kind:'calm',sourceId:0,targetId:q.id,x:11.5,y:10.5,radius:1,value:.5,untilDay:120});
  q.x=q.tx=13.5;q.y=q.ty=10.5;
  advance(w,30);assert.equal(p.hp,30);assert.equal(q.state,'calm');
  w.day=121;stepWanling(w,1);
  assert.equal(wanlingState(w).effects.some(e=>e.kind==='calm'&&e.untilDay>w.day),false);
}
// Movement is bounded per step; legacy beasts receive both influence and calm.
{
  const w=world();place(w,'deer',10,10);const wolf=place(w,'wolf',13,10);
  advance(w,30);
  assert.notEqual(wolf.tx,wolf.x);
  assert.ok(Math.hypot(wolf.x-13.5,wolf.y-10.5)<=2.001);
  const old={id:91,sp:'beast',form:'tiangou',name:'旧天狗',x:18,y:18,hp:40,maxHp:40};
  w.entities.push(old);
  assert.ok(wanlingGuardAt(w,18,18)>0);
  assert.equal(wanlingVillageInfluence(w,{id:5,x:18,y:18}).damageScale,0.9);
  w.entities.splice(0,1);
  assert.equal(wanlingVillageInfluence(w,{id:5,x:18,y:18}).damageScale,1);
  w.entities.push(old);w.nextEntityId++;
  assert.equal(wanlingVillageInfluence(w,{id:5,x:18,y:18}).damageScale,0.9);
  addWanlingEffect(w,{kind:'calm',sourceId:0,targetId:old.id,x:18,y:18,radius:6,value:.5,untilDay:120});
  assert.equal(isWanlingHostile(w,old,{sp:'beast',form:'wolf',x:18,y:18}),false);
}
// A spirit bond is a finite relationship and clears on separation or death.
{
  const w=world(),lushu=place(w,'lushu',10,10);
  const p={id:2,x:11,y:10,hp:20,maxHp:20,exp:0,dao:{path:{key:'spirit'}}};
  w.entities.push(p);advance(w,30);
  assert.equal(lushu.bondedBy,p.id);assert.ok(w.wanling.effects.some(e=>e.kind==='bond'));
  p.x=25;p.y=25;advance(w,1);
  assert.equal(lushu.bondedBy,undefined);assert.equal(w.wanling.effects.some(e=>e.kind==='bond'),false);
  p.x=11;p.y=10;advance(w,29);
  assert.equal(lushu.bondedBy,p.id);
  p.hp=0;advance(w,1);
  assert.equal(lushu.bondedBy,undefined);
}
// Real dao ward and formation effects expire and fail with their human source.
{
  const w=world(),v={id:2,x:12,y:12},p={id:4,sp:'cultivator',x:12,y:12,hp:20};
  w.entities.push(p);w.sites.push({id:10,kind:'formation',x:12,y:12});wanlingState(w);
  addWanlingEffect(w,{kind:'ward',sourceId:4,targetId:2,x:12,y:12,radius:8,value:.2,untilDay:90});
  addWanlingEffect(w,{kind:'formation',sourceId:4,targetId:10,x:12,y:12,radius:5,value:.1,untilDay:90});
  assert.ok(wanlingVillageInfluence(w,v).damageScale<0.9);
  assert.equal(wanlingVillageInfluence(w,{id:3,x:31,y:31}).damageScale,1);
  w.sites.length=0;assert.equal(wanlingVillageInfluence(w,v).damageScale,0.9);
  p.hp=0;assert.equal(wanlingVillageInfluence(w,v).damageScale,1);
}
// Fox affinity is local to a living village; disguise reverts after leaving.
{
  const w=world(),v={id:3,x:12,y:12,hp:50},fox=place(w,'jiuweihu',12,13);
  w.villages.push(v);
  assert.equal(wanlingVillageInfluence(w,v).recoveryScale,1.04);
  advance(w,30);assert.ok(['human','fox'].includes(fox.mask));
  fox.x=fox.tx=25.5;fox.y=fox.ty=25.5;
  assert.equal(wanlingVillageInfluence(w,v).recoveryScale,1);
  advance(w,30);assert.equal(fox.mask,'fox');
  fox.x=fox.tx=12.5;fox.y=fox.ty=13.5;v.hp=0;
  assert.equal(wanlingVillageInfluence(w,v).recoveryScale,1);
  advance(w,30);assert.equal(fox.mask,'fox');
}
// Water and stone anchors weaken when their real terrain support disappears.
{
  const w=world(),wi=w.idx(8,8),si=w.idx(23,23);
  w.water[wi]=0.02;w.height[si]=0.7;
  const water=place(w,'water',8,8),stone=place(w,'stone',23,23);
  w.water[wi]=0;w.height[si]=0.4;
  advance(w,30);
  assert.equal(water.state,'weak');assert.equal(stone.state,'weak');
  assert.ok(water.hp<water.maxHp&&stone.hp<stone.maxHp);
}
// Disabled ecology makes no new state and does not touch the legacy random seed.
{
  const w=world();wanlingState(w);w.wanling.enabled=false;
  const before=structuredClone(w.wanling),seed=w.seed;
  advance(w,30);assert.deepEqual(w.wanling,before);assert.equal(w.seed,seed);
  assert.equal(wanlingVillageInfluence(w,{x:10,y:10}).yieldScale,1);
  const empty=world();empty.wanling={enabled:false};
  assert.equal(requestWanling(empty,'deer',10,10).ok,false);
  assert.deepEqual(empty.wanling,{enabled:false});
}
console.log('W0.1 ecology: 17 real-world scenarios passed');
