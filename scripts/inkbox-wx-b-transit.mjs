import assert from 'node:assert/strict';
import {World} from '../src/inkbox/world/World.js';
import {TERRAIN} from '../src/inkbox/core/config.js';
import {requestPersonJourney,requestCargoJourney,stepTransit} from '../src/inkbox/sim/transit.js';
import {snapshotTransit,restoreTransitSnapshot} from '../src/inkbox/world/transitState.js';
import {initializeProfile} from '../src/inkbox/wanxiang/profile.js';
import {equipSkills,chooseSkillAction} from '../src/inkbox/wanxiang/skills.js';
import {MANUALS} from '../src/inkbox/core/lore.js';
function fixture(physique,seed=123){
 const w=new World(40,18,seed);w.day=0;w.height.fill(.5);w.type.fill(TERRAIN.GRASS);w.water.fill(0);
 w.villages=[{id:1,x:3,y:8,hp:100,food:100},{id:2,x:35,y:8,hp:100,food:4}];
 w.entities=[{id:1,sp:'human',level:0,age:8000,lifespan:90000,hp:100,village:1,x:3.5,y:8.5},{id:2,sp:'cultivator',level:20,age:9000,lifespan:90000,hp:100,maxHp:100,village:1,x:3.5,y:8.5,techniques:[]}];
 w.wanxiang={enabled:true};if(physique)initializeProfile(w.entities[1]).physique={id:physique};return w;
}
const base=fixture(),space=fixture('spacetime');
for(const w of [base,space]){const r=requestPersonJourney(w,{actorId:2,toVillageId:2});assert(r.ok,r.reason);w.day=1;stepTransit(w);}
assert(space.entities[1].x>base.entities[1].x,'time reduction advances only along validated route');
const saved=snapshotTransit(space),copy=fixture('spacetime');copy.day=space.day;copy.entities=structuredClone(space.entities);copy.transit=restoreTransitSnapshot(saved,copy);
space.day=2;copy.day=2;stepTransit(space);stepTransit(copy);assert.deepEqual(copy.entities[1],space.entities[1]);
const delayed=fixture('spacetime',63);assert(requestPersonJourney(delayed,{actorId:2,toVillageId:2}).ok);assert.equal(delayed.transit.journeys[0].disorientedUntil,1);delayed.day=.5;stepTransit(delayed);assert.equal(delayed.entities[1].x,3.5);
const blocked=fixture('spacetime');blocked.entities[1].level=0;assert.equal(requestPersonJourney(blocked,{actorId:2,toVillageId:2}).ok,false);
// Cargo retains its mortal-sailor gate, and only actual land legs pay the earth penalty.
function cargo(physique){const w=fixture();w.type.fill(TERRAIN.SEA);w.water.fill(.15);for(let y=4;y<14;y++)for(let x=1;x<7;x++){w.type[w.idx(x,y)]=TERRAIN.GRASS;w.water[w.idx(x,y)]=0;}for(let y=4;y<14;y++)for(let x=32;x<39;x++){w.type[w.idx(x,y)]=TERRAIN.GRASS;w.water[w.idx(x,y)]=0;}w.entities[0].x=1.5;if(physique)initializeProfile(w.entities[0]).physique={id:physique};assert(requestCargoJourney(w,{fromVillageId:1,toVillageId:2,actorId:1,food:12}).ok);w.day=1;stepTransit(w);return w;}
assert(cargo('earth').entities[0].x<cargo().entities[0].x);
const actor=fixture().entities[1],target={id:3,hp:100,maxHp:100,x:4,y:8.5};
actor.techniques=[{name:'forged',kind:'thunder'}];assert.equal(equipSkills(actor,['thunder']),false);
actor.techniques=[MANUALS.find(m=>m.kind==='thunder')];assert(equipSkills(actor,['thunder']));assert.equal(chooseSkillAction(actor,target,1,{power:1}).skill,'thunder');
actor.techniques=[];const restored=structuredClone(actor);assert.notEqual(chooseSkillAction(restored,target,10,{power:1})?.skill,'thunder');
restored.level=0;assert.equal(equipSkills(restored,['spell']),false);
console.log('WX-B T0 legal time/land costs, bounded saved disorientation, route gates and actual learned skill qualification passed');
