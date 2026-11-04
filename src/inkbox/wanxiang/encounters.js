import { legendOwnsMovement } from './legend.js';
import { worldStream } from '../sim/worldStreams.js';
import { activeJourneyForEntity } from '../world/transitState.js';
import { experienceEffects } from './experiences.js';
const alive=e=>e&&e.hp>0;
export function encounterFor(world,id){return world.wanxiang?.encounters?.find(s=>s.stage==='open'&&s.participants.some(p=>p.actorId===id&&p.stage==='travel'));}
export function stepEncounters(world) {
 if(world.wanxiang?.enabled!==true)return;
 const wx=world.wanxiang ||= {};wx.encounters ||= [];
 if(world.day-(wx.lastEncounterDay??-1e6)<30)return;wx.lastEncounterDay=world.day;
 for(const s of wx.encounters)if(s.stage==='open'){
 const site=world.sites.find(x=>x.id===s.siteId);
 if(!site||(site.inheritanceExhausted&&!(site.dragonBoneCharges>0))||world.day>s.untilDay){s.stage=site?.inheritanceExhausted?'claimed':'ended';s.endedDay=world.day;for(const p of s.participants)if(p.stage==='travel')p.stage='ended';}
 }
 wx.encounters=wx.encounters.filter(s=>s.stage==='open'||world.day-(s.endedDay||0)<720).slice(-24);
 for(const site of world.sites){
 if(wx.encounters.filter(s=>s.stage==='open').length>=3)break;
 if(site.kind!=='cave'||!site.inheritanceManual||(site.inheritanceExhausted&&!(site.dragonBoneCharges>0))||site.encounterMode)continue;
 const candidates=world.entities.filter(e=>alive(e)&&e.level>=3&&e.hp/e.maxHp>.55&&!activeJourneyForEntity(world,e.id)&&!encounterFor(world,e.id)&&!legendOwnsMovement(world,e.id)&&!(world.wanling?.jobs||[]).some(j=>j.actorId===e.id&&j.stage!=='done')&&((site.dragonBoneCharges>0&&(!e.wanxiang?.bloodlines?.length||e.wanxiang.bloodlines.some(b=>b.id==='true_dragon'&&!b.stable)))||((e.techniques||[]).length<3&&!(e.techniques||[]).some(t=>t.name===site.inheritanceManual)))&&Math.hypot(e.x-site.x,e.y-site.y)<24&&experienceEffects(e,world.day).risk>-.2).sort((a,b)=>Math.hypot(a.x-site.x,a.y-site.y)-Math.hypot(b.x-site.x,b.y-site.y)||String(a.id).localeCompare(String(b.id))).slice(0,3);
 if(!candidates.length)continue;
 site.encounterMode=true;wx.encounters.push({id:`cave:${site.id}`,siteId:site.id,stage:'open',startDay:world.day,untilDay:world.day+720,participants:candidates.map(e=>({actorId:e.id,stage:'travel'}))});
 }
}
/** Life calls this after survival/combat/T0 checks and before dao travel. */
export function stepEncounterTravel(world,life,e,dtDays,resolve) {
 const s=encounterFor(world,e.id);if(!s)return false;
 const p=s.participants.find(p=>p.actorId===e.id);const site=world.sites.find(x=>x.id===s.siteId);
 if(world.wanxiang?.enabled!==true)return false;
 if(!alive(e)||!site||(site.inheritanceExhausted&&!(site.dragonBoneCharges>0))||world.day>s.untilDay||activeJourneyForEntity(world,e.id)||e.hp/e.maxHp<.35){p.stage='withdrawn';e.tx=e.x;e.ty=e.y;return false;}
 const dist=Math.hypot(e.x-site.x,e.y-site.y);
 if(dist<=1.5){p.stage='arrived';site.visits=(site.visits||0)+1;if(resolve){const result=resolve(world,e,site,worldStream(world,'wanxiang-encounters',0x77584533));if(result?.studying){p.stage='travel';p.settled=false;}}return true;}
 e.tx=site.x;e.ty=site.y;
 life.moveTowards(e,Math.min(30,Math.max(0,dtDays)),{speed:1,diet:0});
 return true;
}
