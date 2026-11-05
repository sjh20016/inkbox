import assert from 'node:assert/strict';
import {stepEncounters,stepEncounterTravel,finishEncounter} from '../src/inkbox/wanxiang/encounters.js';
import {recordLegendHealing,stepLegendConsequences} from '../src/inkbox/wanxiang/legend.js';
import {initializeProfile} from '../src/inkbox/wanxiang/profile.js';
const entity=()=>({id:1,hp:100,maxHp:100,level:5,x:1,y:1,techniques:[]});
const scene=()=>({day:30,sites:[{id:1,kind:'cave',x:1,y:1,inheritanceManual:'卷'}],entities:[entity()],wanxiang:{enabled:true}});
for(const cause of ['death','timeout','withdrawal','removed','arrived','claimed']) {
 const w=scene();stepEncounters(w);const s=w.wanxiang.encounters[0];assert(s);
 if(cause==='death')w.entities[0].hp=0;
 if(cause==='timeout')w.day=s.untilDay;
 if(cause==='withdrawal')w.entities[0].hp=20;
 if(cause==='removed')w.sites=[];
 if(cause==='claimed')w.sites[0].inheritanceExhausted=true;
 if(cause==='withdrawal'||cause==='arrived')stepEncounterTravel(w,{moveTowards(){}},w.entities[0],1,()=>({ok:true}));
 else stepEncounters(w);
 assert.notEqual(s.stage,'open',cause);
 if(w.sites.length)assert.equal(w.sites[0].encounterMode,false,cause);
}
{
 const w=scene();stepEncounters(w);const first=w.wanxiang.encounters[0];finishEncounter(w,first,'withdrawn');
 const resumed=structuredClone(w);resumed.day+=30;stepEncounters(resumed);assert.equal(resumed.wanxiang.encounters.filter(s=>s.stage==='open').length,0);
 resumed.day+=180;stepEncounters(resumed);assert.equal(resumed.wanxiang.encounters.filter(s=>s.stage==='open').length,1);assert.notEqual(resumed.wanxiang.encounters.at(-1).id,first.id);
 resumed.sites[0].inheritanceExhausted=true;stepEncounters(resumed);resumed.day+=360;stepEncounters(resumed);assert.equal(resumed.wanxiang.encounters.filter(s=>s.stage==='open').length,0);
}
{
 const w=scene();w.sites[0].encounterMode=true;w.entities=[];stepEncounters(w);assert.equal(w.sites[0].encounterMode,false,'orphaned save flag released');
}
{
 const w=scene(),e=w.entities[0],p=initializeProfile(e);w.artifacts=[];w.wanxiang.legend={siteId:1};e.x=20;e.y=20;
 p.states.push({id:'sword_blight',artifactId:3});
 assert.equal(recordLegendHealing(w,e,7,true),false);
 for(const day of [30,60,90]){w.day=day;assert(recordLegendHealing(w,e,8,true));stepLegendConsequences(w);}
 assert.equal(p.states.length,1);w.day=120;stepLegendConsequences(w);assert.equal(p.states.length,0);
}
console.log('WX-B encounter terminal/reopen, old-save orphan repair, unique resources and paid legend healing passed');
{
 const {World}=await import('../src/inkbox/world/World.js');
 const {serializeWorld,deserializeWorld}=await import('../src/inkbox/io/save.js');
 const w=new World(20,20,812);w.sites.push({id:1,kind:'cave',x:5,y:5,visits:0,encounterRetryDay:180,phoenixFeatherCharges:1,godFragmentCharges:1});
 const r=deserializeWorld(serializeWorld(w));
 for(const key of ['encounterRetryDay','phoenixFeatherCharges','godFragmentCharges'])assert.equal(r.sites[0][key],w.sites[0][key]);
 console.log('WX-B cave cooldown and finite bloodline resources survive official serde');
}
