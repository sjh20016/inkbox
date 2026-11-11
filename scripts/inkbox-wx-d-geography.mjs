import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { canReachOpportunity, opportunityLandRoute, routeCorners } from '../src/inkbox/wanxiang/opportunityGeography.js';
import { siteContentState, siteHasContent, enterSite, stepOpportunitySupply, stepSites } from '../src/inkbox/sim/sites.js';
import { MANUALS } from '../src/inkbox/core/lore.js';
import { stepEncounters } from '../src/inkbox/wanxiang/encounters.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { invalidateTransitGeography } from '../src/inkbox/world/transitGeography.js';
import { Life } from '../src/inkbox/sim/life.js';
import { initializeProfile } from '../src/inkbox/wanxiang/profile.js';

let checks=0;
function check(label, fn) { fn(); checks++; console.log(`ok ${label}`); }
function world(w=32,h=24) {
 const v=new World(w,h,81001);v.height.fill(.45);v.qi.fill(.8);v.type.fill(TERRAIN.GRASS);
 v.day=360;v.wanxiang={enabled:true,wxCEnabled:true,opportunities:{version:1,lastSupplyDay:0,counters:{}}};return v;
}
const actor={id:1,sp:'cultivator',x:4,y:12,hp:100,maxHp:100,level:6,techniques:[]};
check('edge coordinates never wrap into opposite row',()=>{
 const w=world();assert.equal(canReachOpportunity(w,{...actor,x:-1},{x:5,y:12}),false);
 assert.equal(canReachOpportunity(w,actor,{x:w.w,y:12}),false);
});
check('mountain and river barriers reject disconnected cave',()=>{
 const w=world();for(let y=1;y<w.h-1;y++)w.type[w.idx(15,y)]=TERRAIN.MOUNTAIN;
 invalidateTransitGeography(w);assert.equal(canReachOpportunity(w,actor,{x:25,y:12}),false);
 w.type[w.idx(15,12)]=TERRAIN.GRASS;invalidateTransitGeography(w);
 assert.equal(canReachOpportunity(w,actor,{x:25,y:12}),true);
 for(let y=1;y<w.h-1;y++)w.type[w.idx(15,y)]=TERRAIN.WATER;
 invalidateTransitGeography(w);assert.equal(canReachOpportunity(w,actor,{x:25,y:12}),false);
});
check('legal detour yields executable corners',()=>{
 const w=world();for(let y=5;y<19;y++)w.struct[w.idx(15,y)]=3;
 invalidateTransitGeography(w);const route=opportunityLandRoute(w,actor,{x:25,y:12});
 assert(route?.distance>21);assert(routeCorners(route).length>1);
 const traveller={...actor,tx:actor.x,ty:actor.y,state:'idle'};
 const life=new Life(w,()=>.5),corners=routeCorners(route);let corner=0;
 for(let tick=0;tick<600&&Math.hypot(traveller.x-25,traveller.y-12)>1.5;tick++) {
  while(corner<corners.length-1&&Math.hypot(traveller.x-corners[corner].x,traveller.y-corners[corner].y)<.7)corner++;
  traveller.tx=corners[corner].x;traveller.ty=corners[corner].y;
  life.moveTowards(traveller,1,{speed:1,diet:0});
  assert.notEqual(w.struct[w.idx(Math.floor(traveller.x),Math.floor(traveller.y))],3);
 }
 assert(Math.hypot(traveller.x-25,traveller.y-12)<=1.5);
});
check('long connected detour is not counted as executable supply',()=>{
 const w=world(64,64),e={...actor,x:30,y:5},s={x:32,y:5};
 for(let y=1;y<61;y++)w.struct[w.idx(31,y)]=3;
 invalidateTransitGeography(w);const route=opportunityLandRoute(w,e,s);
 assert(route?.ok && route.distance>96);assert.equal(canReachOpportunity(w,e,s),false);
});
check('many failed candidates do not create phantom cave',()=>{
 const w=world();w.entities.push({...actor});w.villages.push({id:1,x:4,y:12,hp:100,food:100});
 for(let y=1;y<w.h-1;y++)for(let x=1;x<w.w-1;x++)w.qi[w.idx(x,y)]=0;
 stepOpportunitySupply(w);assert.equal(w.sites.length,0);assert.equal(w.wanxiang.opportunities.counters.generated||0,0);
});
check('candidate denominator includes rejected water and mountain cells',()=>{
 const w=world();w.entities.push({...actor});w.villages.push({id:1,x:4,y:12,hp:100,food:100});
 w.water.fill(.1);stepOpportunitySupply(w);
 assert.equal(w.sites.length,0);assert((w.wanxiang.opportunities.counters.candidate||0)>0);
 assert.equal(w.wanxiang.opportunities.counters.invalidGeography,w.wanxiang.opportunities.counters.candidate);
});
check('new supply has a real qualified anchor and regional count',()=>{
 const w=world();w.entities.push({...actor});w.villages.push({id:1,x:4,y:12,hp:100,food:100});
 stepOpportunitySupply(w);
 assert.equal(w.sites.length,1);
 assert(canReachOpportunity(w,actor,w.sites[0]));
 assert.equal(w.wanxiang.opportunities.counters.qualified,1);
 assert.equal([0,1,2,3].reduce((n,r)=>n+(w.wanxiang.opportunities.counters[`region${r}`]||0),0),1);
});
check('content remains available after inheritance is claimed',()=>{
 const s={inheritanceManual:'诀',inheritanceExhausted:true,phoenixFeatherCharges:1,godFragmentCharges:1,artifactId:4};
 assert.equal(siteContentState(s).inheritance,false);assert.equal(siteHasContent(s),true);
 s.phoenixFeatherCharges=0;s.godFragmentCharges=0;s.artifactId=0;assert.equal(siteHasContent(s),false);
});
check('site inventory survives v11 save and restore',()=>{
 const w=world();w.addSite({kind:'cave',x:10,y:10,name:'测试洞府',inheritanceManual:'诀',inheritanceExhausted:true,phoenixFeatherCharges:1,dragonBoneCharges:0,godFragmentCharges:0,age:0,visits:0});
 const restored=deserializeWorld(serializeWorld(w));assert.equal(siteContentState(restored.sites[0]).phoenixFeather,true);
});
check('one cave inheritance cannot be claimed twice',()=>{
 const w=world();const manual=MANUALS[0];
 const site=w.addSite({kind:'cave',x:10,y:10,name:'唯一洞府',inheritanceManual:manual.name,inheritanceExhausted:false,
  inheritanceClaimedBy:null,reward:`《${manual.name}》`,age:0,visits:0});
 const first={...actor,name:'甲',x:10,y:10,exp:0,fortune:50,mind:100,heartDemon:0,techniques:[]};
 const second={...actor,id:2,name:'乙',x:10,y:10,exp:0,fortune:50,mind:100,heartDemon:0,techniques:[]};
 enterSite(w,first,site,()=>0);enterSite(w,second,site,()=>0);
 assert.equal(site.inheritanceClaimedBy,first.id);
 assert.equal(site.inheritanceExhausted,true);
 assert.equal(second.techniques.some(t=>t.name===manual.name),false);
});
check('phoenix feather and god fragment consume only on actual eligible grant',()=>{
 const w=world();const s=w.addSite({kind:'cave',x:10,y:10,name:'余藏洞府',inheritanceExhausted:true,
  phoenixFeatherCharges:2,godFragmentCharges:2,age:0,visits:0});
 const make=(id,blood)=>{const e={...actor,id,name:`修士${id}`,x:10,y:10,exp:0,fortune:50,mind:100,heartDemon:0,techniques:[]};
  initializeProfile(e).bloodlines=blood?[{id:blood,latent:false,dormant:false}]:[];w.entities.push(e);return e;};
 const plain=make(10,null),phoenix=make(11,'heaven_phoenix'),god=make(12,'god_king');
 enterSite(w,plain,s,()=>0);assert.equal(s.phoenixFeatherCharges,2);assert.equal(s.godFragmentCharges,2);
 enterSite(w,phoenix,s,()=>0);assert.equal(s.phoenixFeatherCharges,1);assert.equal(phoenix.wanxiang.bodyLedger.feathers,1);
 enterSite(w,phoenix,s,()=>0);assert.equal(s.phoenixFeatherCharges,1,'same source cannot be granted twice');
 enterSite(w,god,s,()=>0);assert.equal(s.godFragmentCharges,1);assert.equal(god.wanxiang.bodyLedger.godFragmentSource,String(s.id));
 enterSite(w,god,s,()=>0);assert.equal(s.godFragmentCharges,1,'god fragment is unique to recipient');
});
check('resource-only cave can open an encounter without inheritance',()=>{
 const w=world();const e={...actor,name:'凤修',x:10,y:10,techniques:[]};initializeProfile(e).bloodlines=[{id:'heaven_phoenix',latent:false,dormant:false}];w.entities.push(e);
 w.addSite({kind:'cave',x:10,y:10,name:'羽洞',inheritanceExhausted:true,phoenixFeatherCharges:1,age:0,visits:0});
 stepEncounters(w);assert.equal(w.wanxiang.encounters.filter(x=>x.stage==='open').length,1);
});
check('empty old cave skips visitor lottery until annual lifecycle step',()=>{
 const w=world();w.wanxiang.enabled=false;w.day=1000;const s=w.addSite({kind:'cave',x:10,y:10,name:'旧址',inheritanceExhausted:true,age:100,visits:0});
 let draws=0;stepSites(w,1,()=>{draws++;return 0;});assert.equal(draws,0);assert.equal(s.age,100);
 w.day+=180;stepSites(w,180,()=>{draws++;return 0;});assert.equal(s.age,100);assert.equal(draws,0);
 w.day+=180;stepSites(w,180,()=>{draws++;return 0;});assert.equal(s.age,460);assert.equal(draws,0);
});
check('supply stays in mortal realm across a three-realm world',()=>{
 const root=world(), upper=world(), nether=world();upper.plane='upper';nether.plane='nether';
 root.upper=upper;root.nether=nether;
 for(const plane of [upper,nether]) {plane.entities.push({...actor});plane.villages.push({id:1,x:4,y:12,hp:100,food:100});stepOpportunitySupply(plane);assert.equal(plane.sites.length,0);}
 root.entities.push({...actor});root.villages.push({id:1,x:4,y:12,hp:100,food:100});stepOpportunitySupply(root);
 assert.equal(root.sites.length,1);
});
console.log(`${checks} geography checks passed`);
