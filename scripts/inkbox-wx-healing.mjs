import assert from 'node:assert/strict';
import {World} from '../src/inkbox/world/World.js';
import {Life} from '../src/inkbox/sim/life.js';
import {DAO_BY_KEY} from '../src/inkbox/core/cultivation.js';
import {initializeProfile} from '../src/inkbox/wanxiang/profile.js';
import {stepDaoActivities,stepDaoTravel,daoActivityFor} from '../src/inkbox/sim/daoActivities.js';
function treatment({wood=false,home=false,hex=false,recipientWood=false}={}) {
 const world=new World(40,32,711);world.day=30;
 const life=new Life(world,()=>.5);
 const actor=world.addEntity({sp:'cultivator',name:'丹修',x:10.5,y:10.5,hp:100,maxHp:100,level:8,artifacts:[],dao:{path:DAO_BY_KEY.alchemy,stage:0,progress:0}});
 const patient=world.addEntity({sp:'human',name:'伤者',x:10.7,y:10.5,hp:40,maxHp:100,level:0});
 if(wood||hex){const p=initializeProfile(actor);if(wood)p.physique={id:'wood'};if(hex)p.hexagram={id:'hex_48'};}
 if(recipientWood)initializeProfile(patient).physique={id:'wood'};
 if(home){const village={id:1,x:10.5,y:10.5};world.villages.push(village);actor.birthOrigin={villageId:1};}
 assert.equal(stepDaoActivities(world,life),1);
 assert.equal(stepDaoTravel(world,life,actor,1),true);
 assert.equal(daoActivityFor(world,actor.id).stage,'done');
 assert.equal(actor.hp,99,'native treatment resource cost is retained');
 return patient.hp-40;
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
near(treatment(),12);
near(treatment({wood:true}),12*1.12);
near(treatment({hex:true,home:true}),12*1.06);
near(treatment({hex:true}),12);
near(treatment({recipientWood:true}),12,'outgoing healer effect is not a received-healing effect');
near(treatment({wood:true,hex:true,home:true}),12*1.18);
console.log('Wanxiang: actual alchemy travel/action consumes healer healing, home provenance and recipient-only axes; legacy amount/cost retained');

{
 const world=new World(40,32,712);world.day=30;world.wanxiang={enabled:true};
 const life=new Life(world,()=>.5);
 const healer=()=>world.addEntity({sp:'cultivator',x:10.5,y:10.5,hp:100,maxHp:100,level:8,artifacts:[],dao:{path:DAO_BY_KEY.alchemy,stage:0,progress:0}});
 const first=healer();
 const target=world.addEntity({sp:'human',x:10.7,y:10.5,hp:40,maxHp:100,level:0});
 const p=initializeProfile(target);p.physique={id:'yin_block',stage:0};p.states.push({id:'meridian_damage',expiresDay:750});
 assert.equal(stepDaoActivities(world,life),1);assert(stepDaoTravel(world,life,first,1));
 assert.equal(target.wanxiang.physique.treatments,1);
 assert.equal(target.wanxiang.experienceLedger.records.at(-1).type,'healed');
 // A different real helper can treat after 30 days; the first helper's 1080-day experience cooldown remains intact.
 world.day=60;const second=healer();assert.equal(stepDaoActivities(world,life),1);assert(stepDaoTravel(world,life,second,1));
 assert.equal(target.wanxiang.physique.stage,1);
 assert(!target.wanxiang.states.some(s=>s.id==='meridian_damage'));
 assert.equal(target.wanxiang.experienceLedger.records.filter(r=>r.type==='healed').length,2);
 assert.equal(first.hp,99);assert.equal(second.hp,99);
 const revision=target.wanxiang.revision;
 assert.equal(stepDaoTravel(world,life,second,1),false);
 assert.equal(target.wanxiang.revision,revision,'completed travel cannot re-emit healing');
 console.log('Wanxiang: two paid native alchemy actions 30 days apart commit real healed facts, open meridians and remove meridian damage once');
}
