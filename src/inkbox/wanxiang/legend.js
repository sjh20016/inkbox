import { initializeProfile } from './profile.js';
import { activeJourneyForEntity } from '../world/transitState.js';
import { addExperienceState, experienceRng } from './experiences.js';
export const LEGEND_STATES=Object.freeze(['bound','travel','choice','seal-work','draw-work','sealed','drawn','failed','left','interrupted']);
export function artifactRestriction(world,a){const l=world?.wanxiang?.legend;if(!l||l.artifactId!==a.id)return null;if(l.stage==='sealed'&&(world.sites||[]).some(s=>s.id===l.siteId))return '封剑守阙，原物不可领取';if(!['drawn','failed','left','interrupted','sealed'].includes(l.stage))return '封剑异象预约中';return null;}
export function bindLegend(world,artifact,site,actor){
 if(world.wanxiang?.enabled!==true||!world.wanxiang?.experiments?.legend||world.wanxiang.legend||!world.artifacts.includes(artifact)||artifact.ownerId||artifact.durability<=0||artifact.kind!=='weapon'||!world.sites.includes(site)||actor.hp<=0||actor.level<10||!world.entities.includes(actor)||Math.hypot(artifact.x-site.x,artifact.y-site.y)>6)return false;
 world.wanxiang.legend={artifactId:artifact.id,siteId:site.id,actorId:actor.id,stage:'bound',startDay:world.day,progress:0,lastDay:world.day};return true;
}
/** Experimental state machine: actual arrival and work only. Claim callback uses the canonical artifact transfer. */
export function stepLegend(world,claim){
 if(world.wanxiang?.enabled===true&&world.wanxiang?.experiments?.legend&&!world.wanxiang.legend){
 for(const a of world.artifacts||[]){if(a.ownerId||a.durability<=0||a.kind!=='weapon')continue;const s=world.sites.find(s=>Math.hypot(a.x-s.x,a.y-s.y)<=3);const e=s&&world.entities.find(e=>e.hp>0&&e.level>=10&&!e.target&&!(world.wanxiang.encounters||[]).some(c=>c.stage==='open'&&c.participants.some(p=>p.actorId===e.id&&p.stage==='travel'))&&!(world.wanling?.jobs||[]).some(j=>j.actorId===e.id&&j.stage!=='done')&&!activeJourneyForEntity(world,e.id)&&Math.hypot(e.x-s.x,e.y-s.y)<=24);if(e&&bindLegend(world,a,s,e))break;}
 }
 const l=world.wanxiang?.legend;if(world.wanxiang?.enabled!==true||!world.wanxiang?.experiments?.legend||!l||['sealed','drawn','failed','left','interrupted'].includes(l.stage))return;
 const e=world.entities.find(e=>e.id===l.actorId),a=world.artifacts.find(a=>a.id===l.artifactId),s=world.sites.find(s=>s.id===l.siteId);
 const elapsed=Math.max(0,world.day-l.lastDay);l.lastDay=world.day;
 if(!e||e.hp<=0||!a||a.durability<=0||a.ownerId||!s){l.stage='interrupted';return;}
 if(world.day-l.startDay>3600){l.stage='left';return;}
 if(l.stage==='bound'){l.stage='travel';return;}
 const near=Math.hypot(e.x-s.x,e.y-s.y)<=3;
 if(l.stage==='travel'){if(near)l.stage='choice';else if(world.day-l.startDay>720)l.stage='left';return;}
 if(l.stage==='choice'){chooseLegend(world,e.id,(e.mind||50)>=60?'seal':'draw');return;} // explicit choice through chooseLegend; never invent NPC travel.
 if(!near||e.target){l.awayDays=(l.awayDays||0)+elapsed;if(l.awayDays>30)l.stage='left';return;}
 l.awayDays=0;l.progress+=Math.min(elapsed,30);
 if(l.progress<(l.stage==='seal-work'?180:90))return;
 const profile=initializeProfile(e);if(profile.traits.length>=6||profile.traits.filter(t=>t.special).length>=2||profile.states.length>=32){l.stage='left';return;}
 const success=experienceRng(world)()<Math.max(.1,Math.min(.85,.4+.003*((e.mind||50)-50)-.003*(e.pollution||0)));
 if(!success){const p=initializeProfile(e);addExperienceState(p,{id:'sword_blight',source:`legend:${a.id}`,artifactId:a.id,startDay:world.day});p.revision++;e.hp-=e.maxHp*.25;e.diedOf='legend';l.stage='failed';return;}
 if(l.stage==='seal-work'){if(!Number.isFinite(e.lifespan)||e.lifespan-e.age<2){l.stage='left';return;}const p=initializeProfile(e);p.costs||={lifespan:0};p.costs.lifespan+=2;p.revision++;e.lifespan-=2;p.traits.push({id:'seal_vow',special:true,source:`legend:${a.id}`,siteId:s.id,anchorX:s.x,anchorY:s.y,startDay:world.day});l.stage='sealed';}
 else {l.stage='drawn';if(!claim?.(world,e,a.id,experienceRng(world),'found'))l.stage='failed';else {const p=initializeProfile(e);p.traits.push({id:'demon_sword_resonance',special:true,artifactId:a.id,source:`legend:${a.id}`,startDay:world.day});p.revision++;}}
}
export function chooseLegend(world,actorId,choice){const l=world.wanxiang?.legend;if(world.wanxiang?.enabled!==true||!world.wanxiang?.experiments?.legend||!l||l.actorId!==actorId||l.stage!=='choice'||!['seal','draw','leave'].includes(choice))return false;const e=world.entities.find(e=>e.id===actorId);if(!e||e.hp<=0)return false;const p=initializeProfile(e);if(choice!=='leave'&&(p.traits.length>=6||p.traits.filter(t=>t.special).length>=2||p.states.length>=32)){l.stage='left';return false;}l.stage=choice==='leave'?'left':choice+'-work';l.progress=0;l.lastDay=world.day;return true;}

export function stepLegendTravel(world,life,e,dtDays){
 const l=world.wanxiang?.legend;if(world.wanxiang?.enabled!==true||!world.wanxiang.experiments?.legend||!l||l.actorId!==e.id||!['bound','travel','choice','seal-work','draw-work'].includes(l.stage))return false;
 const s=world.sites.find(s=>s.id===l.siteId);if(!s||e.hp<=0||e.target||activeJourneyForEntity(world,e.id)||e.hp/e.maxHp<.35){l.stage='interrupted';return false;}
 if(Math.hypot(e.x-s.x,e.y-s.y)>3){e.tx=s.x;e.ty=s.y;life.moveTowards(e,Math.min(30,Math.max(0,dtDays)),{speed:1,diet:0});}
 return true;
}

export function legendOwnsMovement(world,id){const l=world.wanxiang?.legend;return world.wanxiang?.enabled===true&&world.wanxiang.experiments?.legend===true&&l?.actorId===id&&['bound','travel','choice','seal-work','draw-work'].includes(l.stage);}
