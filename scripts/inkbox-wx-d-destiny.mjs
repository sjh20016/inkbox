import assert from 'node:assert/strict';
import {socialAidWeight} from '../src/inkbox/wanxiang/experiences.js';
const world={day:10,plane:'mortal',wanxiang:{enabled:true}};
const target={id:2};
const e={wanxiang:{bonds:[{id:'gratitude:mortal:2',targetKey:'mortal:2',expiresDay:20}],personality:[],traits:[]}};
assert.equal(socialAidWeight(e,target,world),1.25);
assert.equal(socialAidWeight(e,{id:3},world),1);
world.day=20;assert.equal(socialAidWeight(e,target,world),1);
world.day=10;e.wanxiang.bonds[0].dormant=true;assert.equal(socialAidWeight(e,target,world),1);
world.wanxiang.enabled=false;assert.equal(socialAidWeight(e,target,world),1);
console.log('WX-D social preference guards passed');
import {emptyProfile} from '../src/inkbox/wanxiang/profile.js';
import {readEffects} from '../src/inkbox/wanxiang/effects.js';
const actor={id:11,hp:100,maxHp:100,level:4,x:0,y:0,faction:1,relations:new Map([[12,{type:'mentor'}]]),techniques:[],wanxiang:emptyProfile()};
const patient={id:12,hp:50,maxHp:100,level:2,x:1,y:0,faction:1};
const context={world,target:patient,paidAid:true};world.wanxiang.enabled=true;
for(const id of ['hex_07','hex_13','hex_19']){
 actor.wanxiang.hexagram={id};assert.equal(readEffects(actor,context).aidIntent,1.12);
 assert.equal(readEffects(actor,{...context,paidAid:false}).aidIntent,1);
 actor.wanxiang.hexagram.dormant=true;assert.equal(readEffects(actor,context).aidIntent,1);
 actor.wanxiang.hexagram={id,expiresDay:world.day};assert.equal(readEffects(actor,context).aidIntent,1);
 actor.wanxiang.hexagram={id};const restored=JSON.parse(JSON.stringify(actor));restored.relations=new Map([[12,{type:'mentor'}]]);assert.equal(readEffects(restored,context).aidIntent,1.12);
}
console.log('WX-D aid intent: three hexagrams, payment intent, expiry, dormancy and JSON restore passed');
import {stepDaoActivities,daoActivityFor} from '../src/inkbox/sim/daoActivities.js';
import {wanlingState} from '../src/inkbox/world/wanlingState.js';
import {WX_D_CONSUMERS} from '../src/inkbox/wanxiang/consumerManifest.js';
function selected(hex,enabled=true) {
 const make=(id,x)=>({id,name:`p${id}`,sp:'cultivator',x,y:3,tx:x,ty:3,hp:60,maxHp:100,level:5,exp:0,incarnation:1,dao:{path:{key:'body'}},wanxiang:emptyProfile(),relations:new Map()});
 const a=make(1,3),near=make(2,4),favored=make(3,4.5);a.hp=100;a.level=6;a.faction=9;near.faction=8;favored.faction=9;
 a.relations=new Map([[2,{type:'mentor'}],[3,{type:hex==='hex_13'?'disciple':'mentor'}]]);
 if(hex==='hex_13')a.relations.set(2,{type:'kin'});
 if(hex==='hex_19'){near.level=6;favored.level=5;}
 a.wanxiang.hexagram={id:hex,dormant:!enabled};
 const w={day:30,plane:'mortal',w:10,h:10,size:100,struct:new Uint8Array(100),water:new Float32Array(100),entities:[a,near,favored],villages:[],sites:[],ruins:[],artifacts:[],wraiths:[],factions:[],wanxiang:{enabled:true,wxCEnabled:true},isWalkable:i=>i>=0&&i<100,record(){}};
 // Both must be valid candidate ties; for the mentor condition use gratitude on the nearer non-mentor.
 if(hex==='hex_13')a.wanxiang.bonds.push({id:'gratitude:mortal:2',targetKey:'mortal:2',expiresDay:100},{id:'gratitude:mortal:3',targetKey:'mortal:3',expiresDay:100});
 wanlingState(w).lastPathDay=0;stepDaoActivities(w,{moveTowards(){}});return daoActivityFor(w,1)?.targetId;
}
for(const row of WX_D_CONSUMERS){
 const yes=selected(row.entryId,true),no=selected(row.entryId,false);
 assert.equal(yes,3,row.entryId);assert.equal(no,2,row.entryId);
}

import {World} from '../src/inkbox/world/World.js';
import {TERRAIN} from '../src/inkbox/core/config.js';
import {rngStream} from '../src/inkbox/core/noise.js';
import {enterSite} from '../src/inkbox/sim/sites.js';
import {encounterDecision} from '../src/inkbox/wanxiang/opportunities.js';
import {stepDaoTravel} from '../src/inkbox/sim/daoActivities.js';
import {serializeWorld,deserializeWorld} from '../src/inkbox/io/save.js';
let seed=1;while(rngStream((seed^0x77584532)>>>0)()<.98)seed++;
const w=new World(10,10,seed);w.height.fill(.45);w.type.fill(TERRAIN.GRASS);w.day=30;w.wanxiang={enabled:true,wxCEnabled:true};
const v={id:101,name:'旅人',sp:'cultivator',x:3,y:3,tx:3,ty:3,hp:100,maxHp:100,level:5,exp:0,fortune:50,mind:100,heartDemon:0,incarnation:1,techniques:[],dao:{path:{key:'body'}},wanxiang:emptyProfile(),relations:new Map()};
const healer={id:102,name:'医者',sp:'cultivator',x:4,y:3,tx:4,ty:3,hp:100,maxHp:100,level:5,exp:0,incarnation:1,techniques:[],dao:{path:{key:'alchemy'}},wanxiang:emptyProfile(),relations:new Map()};
w.entities.push(v,healer);
const site=w.addSite({kind:'cave',x:3,y:3,name:'试府',inheritanceManual:'不存在',inheritanceExhausted:false,age:0,visits:1,encounterMode:true});
w.wanxiang.encounters=[{id:'cave:test',siteId:site.id,stage:'open',startDay:30,untilDay:750,participants:[{actorId:v.id,stage:'arrived'}]}];
assert.equal(enterSite(w,v,site,()=>.99).ok,false);assert(v.wanxiang.traits.some(t=>t.id==='risk_fear'));
const cautious=encounterDecision(w,v,{...site,x:14});assert.equal(cautious.willing,false);
wanlingState(w).lastPathDay=0;stepDaoActivities(w,{moveTowards(){}});assert.equal(stepDaoTravel(w,{moveTowards(){}},healer,1),true);
assert(v.hp>55);const recovered=encounterDecision(w,v,{...site,x:14});assert(recovered.score>cautious.score);assert.equal(recovered.willing,true);
const saved=serializeWorld(w);const restored=deserializeWorld(saved);const rv=restored.entities.find(e=>e.id===v.id);assert(rv?.wanxiang?.traits.some(t=>t.id==='risk_fear'));
restored.day=31;restored.wanxiang.encounters[0].participants[0].settled=false;const rs=restored.sites.find(s=>s.id===site.id);rs.visits++;
assert.equal(enterSite(restored,rv,rs,()=>0).ok,true);assert(rv.wanxiang.traits.some(t=>t.id==='risk_resolve'));
console.log('WX-D cave failure, paid healing, changed decision, v11 restore and successful retry passed');

