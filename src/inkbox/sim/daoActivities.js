import { DAO_BY_KEY } from '../core/cultivation.js';
import { addWanlingEffect, liveWanling, wanlingById, wanlingEvent, wanlingState } from '../world/wanlingState.js';
import { ensureWraithLog } from './wraiths.js';
import { claimGroundArtifact, canReceiveArtifact } from './artifacts.js';
import { addKarma } from './cultivation.js';
import { addRelation, RELATION_TYPES } from './relations.js';
import { activeJourneyForEntity } from '../world/transitState.js';

const PERIOD = 30;
const COOLDOWN = Object.freeze({ alchemy: 90, talisman: 180, formation: 90, artifact: 120,
  sword: 90, body: 90, sound: 90, buddha: 180, spirit: 120, blood: 180, corpse: 180, soul: 180 });
const MOVE_INFO = Object.freeze({ speed: 1, diet: 0 });
const HOSTILE_BEAST_FORMS = new Set(['wolf','zheng','qiongqi']);
const dist = (a,b) => Math.hypot((a.x||0)-(b.x||0),(a.y||0)-(b.y||0));
const alive = e => e && e.hp > 0 && !e._ascended;
function pathOf(e) { return e?.dao?.path?.key && DAO_BY_KEY[e.dao.path.key] ? e.dao.path.key : null; }
function spendPower(world,e,stoneCost,hpFraction=stoneCost*.02) {
  const sect=(world.factions||[]).find(s=>s.id===e.faction&&s.resources);
  if(sect&&Number.isFinite(sect.resources.spiritStone)&&sect.resources.spiritStone>=stoneCost) {
    sect.resources.spiritStone=Math.max(0,sect.resources.spiritStone-stoneCost); return true;
  }
  const cost=Math.max(1,(e.maxHp||100)*hpFraction);
  if(!Number.isFinite(e.hp)||e.hp-cost<1) return false;
  e.hp-=cost; return true;
}
function nearby(list,e,r,pred=()=>true) { let best=null,bd=r; for (const x of list||[]) { if (!pred(x)) continue; const d=dist(e,x); if(d<bd){best=x;bd=d;} } return best; }
function jobList(world) { return wanlingState(world).jobs; }
// History is retained for the codex, but only the current job can own movement.
function getJob(world,id,activeOnly=true) {
  const jobs=world?.wanling?.jobs||[];
  for(let i=jobs.length-1;i>=0;i--) if(jobs[i].actorId===id&&(!activeOnly||jobs[i].stage!=='done')) return jobs[i];
  return null;
}
function cancelJob(world,j,text) {
  j.stage='done';j.completedDay=world.day;j.nextDay=world.day+COOLDOWN[j.path];j.summary=text;
}
/** T0 takes locomotion immediately, including an imported job from an older save. */
export function yieldDaoActivityToTransit(world,actorId) {
  const j=getJob(world,actorId);if(!j)return false;
  cancelJob(world,j,'山海通衢已接管远行，本次行道终止；归来并冷却后重新择事');
  const actor=world.entities?.find(e=>e.id===actorId);
  // Life must choose a fresh ground intent after arrival, not resume this target.
  if(actor){actor.tx=actor.x;actor.ty=actor.y;actor.timer=0;}
  wanlingEvent(world,null,`【${actor?.name||'修士'}】${j.summary}`,'dao');
  return true;
}
function setJob(world,e,path,targetKind,target,summary) {
  const jobs=jobList(world);
  for(let i=jobs.length-1;i>=0;i--) if(jobs[i].stage==='done'&&world.day-(jobs[i].completedDay||jobs[i].startedDay)>360) jobs.splice(i,1);
  while(jobs.length>=96) {
    const oldest=jobs.findIndex(j=>j.stage==='done');
    if(oldest<0) return null;
    jobs.splice(oldest,1);
  }
  const j={actorId:e.id,path,targetKind,targetId:target?.id||0,x:target.x,y:target.y,stage:'travel',startedDay:world.day,nextDay:world.day+COOLDOWN[path],summary};
  jobs.push(j); e.tx=j.x; e.ty=j.y; return j;
}
function targetFor(world,e,path,life) {
  const people=(world.entities||[]).filter(x=>alive(x)&&x.id!==e.id);
  const units=liveWanling(world).filter(x=>x.id!==e.id);
  if(path==='alchemy') return nearby(people,e,32,x=>x.hp<x.maxHp*.92);
  if(path==='talisman'||path==='blood') return nearby(world.villages,e,36,v=>v.hp>0&&v.food>0);
  if(path==='formation') return nearby(world.sites,e,42,s=>s.kind==='formation'
    && (world.villages||[]).some(v=>v.hp>0&&Math.hypot(v.x-s.x,v.y-s.y)<=5));
  if(path==='artifact') return nearby(world.artifacts,e,35,a=>a.ownerId===0&&Number.isFinite(a.durability)&&a.durability>0&&Array.isArray(a.history)&&canReceiveArtifact(e,a));
  if(path==='sword') return nearby(people,e,32,x=>x.sp==='cultivator'&&x.level>0&&e.level>0&&x.hp>=x.maxHp*.9&&x.dao?.path?.key==='sword');
  if(path==='body') {
    const enemy=life?.findEnemy?.(e,12);
    if(enemy && (enemy.sp!=='beast'||HOSTILE_BEAST_FORMS.has(enemy.form))) return enemy;
    return nearby(units,e,24,x=>HOSTILE_BEAST_FORMS.has(x.form));
  }
  if(path==='sound') return nearby([...people,...units],e,30,x=>x.sp==='beast'||x.sp==='spirit');
  if(path==='buddha'||path==='soul') return nearby(world.wraiths,e,35,g=>g.hp>0);
  if(path==='spirit') return nearby(units,e,28,u=>u.hp>0) || nearby(people,e,28,x=>x.sp==='spirit');
  if(path==='corpse') return nearby([...(world.sites||[]),...(world.ruins||[])],e,40,s=>['ruin','cave','secret'].includes(s.kind));
  return null;
}
function finish(world,e,j,text) {
  j.stage='done'; j.summary=text; j.completedDay=world.day;
  wanlingState(world).stats.daoActions=(wanlingState(world).stats.daoActions||0)+1;
  wanlingEvent(world,null,`【${e.name||'修士'}】${text}`,'dao');
}
function act(world,life,e,j,target) {
  const key=j.path;
  if(key==='alchemy') {
    if(!alive(target)||target.hp>=target.maxHp*.92||!spendPower(world,e,.2,.01)) return false;
    const amount=Math.min(target.maxHp*.12,target.maxHp-target.hp); target.hp+=amount;
    finish(world,e,j,`以灵丹术为${target.name||'伤者'}疗伤，恢复${amount.toFixed(1)}气血`); return true;
  }
  if(key==='talisman') {
    if(!target||target.hp<=0||target.food<1) return false;
    target.food=Math.max(0,target.food-1);
    addWanlingEffect(world,{kind:'ward',sourceId:e.id,targetId:target.id,x:target.x,y:target.y,radius:8,value:.2,untilDay:world.day+180});
    finish(world,e,j,`在${target.name||'村落'}留下护村符，效力至第${Math.round(world.day+180)}日`); return true;
  }
  if(key==='formation') {
    if(!target||target.kind!=='formation'||!(world.villages||[]).some(v=>v.hp>0&&Math.hypot(v.x-target.x,v.y-target.y)<=5)
      ||!spendPower(world,e,.25,.01)) return false;
    addWanlingEffect(world,{kind:'formation',sourceId:e.id,targetId:target.id,x:target.x,y:target.y,radius:5,value:.1,untilDay:world.day+90});
    finish(world,e,j,`巡检并稳固${target.name||'古阵'}阵眼，为附近村落护持阵法`); return true;
  }
  if(key==='artifact') {
    if(!target||target.ownerId!==0||!world.artifacts.includes(target)||!canReceiveArtifact(e,target)||!spendPower(world,e,.35,.015)) return false;
    const claimed=claimGroundArtifact(world,e,target.id,()=>0.5,'found');
    if(!claimed) return false;
    finish(world,e,j,`以灵力收取遗物「${claimed.name||'无名法宝'}」，履历记为拾得`); return true;
  }
  if(key==='sword') {
    if(!alive(target)||target.dao?.path?.key!=='sword'||dist(e,target)>1.5||target.hp<target.maxHp*.9) return false;
    if(typeof life?.attack!=='function') return false;
    life.attack(e,target,.01,{sparring:true});
    target.restUntil=Math.max(target.restUntil||0,world.day+30);
    finish(world,e,j,`与${target.name||'剑修'}具名切磋，沿正式战斗路径轻触即止`); return true;
  }
  if(key==='body') {
    if(!alive(target)||dist(e,target)>2) return false;
    if(target.id<0){ const u=wanlingById(world,target.id); if(u){u.state='flee';u.tx=Math.max(0,Math.min(world.w-1,u.x+(u.x-e.x||1)*4));u.ty=Math.max(0,Math.min(world.h-1,u.y+(u.y-e.y||1)*4));} }
    else { target.state='flee'; target.tx=target.x+(target.x-e.x); target.ty=target.y+(target.y-e.y); }
    finish(world,e,j,`近身驱逐${target.form||target.name||'野兽'}，其已受惊迁离`); return true;
  }
  if(key==='sound') {
    if(!target||dist(e,target)>10||!spendPower(world,e,.15,.006)) return false;
    const isUnit=target.id<0;
    addWanlingEffect(world,{kind:'calm',sourceId:isUnit?e.id:0,targetId:target.id,x:target.x,y:target.y,radius:6,value:.5,untilDay:world.day+90});
    target.state='calm';
    finish(world,e,j,`以音律安抚${target.form||target.name||'异兽'}，平息九十日`); return true;
  }
  if(key==='buddha') {
    const idx=(world.wraiths||[]).indexOf(target); if(idx<0||target.hp<=0) return false;
    world.wraiths.splice(idx,1); ensureWraithLog(world).dissolved+=1;
    finish(world,e,j,`为鬼影${target.name||'孤魂'}诵经超度，凡间消散账已记`); return true;
  }
  if(key==='spirit') {
    if(!target||!alive(target)||dist(e,target)>10) return false;
    if(target.id<0){const u=wanlingById(world,target.id); if(u){u.bondedBy=e.id;u.bondDay=world.day;u.bondUntilDay=world.day+120;}}
    else addRelation(e,target,RELATION_TYPES.COMRADE,1);
    finish(world,e,j,`与${target.form||target.name||'灵物'}结缘，留下可查的关系记录`); return true;
  }
  if(key==='blood') {
    if(!target||target.hp<=0||target.food<1||!spendPower(world,e,.1,.004)) return false;
    target.food=Math.max(0,target.food-1); target.hp=Math.max(1,target.hp-2);
    addKarma(world,e,3,'血修袭扰村落');
    const guard=nearby((world.entities||[]).filter(x=>alive(x)&&x.village===target.id&&x.id!==e.id),e,12,x=>x.dao?.path?.key==='body'||x.dao?.path?.key==='sword');
    if(guard){e.hp=Math.max(1,e.hp-Math.min(3,e.hp-1));j.counteredBy=guard.id;}
    finish(world,e,j,`袭扰${target.name||'村落'}，掠去一份粮食并增业；${guard?`${guard.name||'守护者'}已反制`:'留下可追索的血债'}`); return true;
  }
  if(key==='corpse') {
    if(!target||dist(e,target)>2||!spendPower(world,e,.1,.004)) return false;
    target.visits=(target.visits||0)+1; target.lastInvestigationDay=world.day;
    finish(world,e,j,`调查${target.name||'遗址'}的亡者遗痕，未造魂傀`); return true;
  }
  if(key==='soul') {
    if(!target||!alive(target)||dist(e,target)>10||!spendPower(world,e,.2,.01)) return false;
    const hostile=(target.soulKind==='wraith'||target.soulKind==='ghostCultivator');
    if(hostile) { target.hp=Math.max(0,target.hp-Math.min(5,target.hp-1)); target.rancor=Math.max(0,(target.rancor||0)-2); }
    else { e.pollution=Math.min(100,(e.pollution||0)+.5); }
    finish(world,e,j,hostile?`净化鬼影${target.name||'孤魂'}的怨念`:`借鬼影${target.name||'孤魂'}探察魂息，承受少许浊气`); return true;
  }
  return false;
}

/** Assign bounded, real-world targets to dao cultivators on a world-day cadence. */
export function stepDaoActivities(world,life) {
  if(!world||!life||world.wanling?.enabled===false||world.day-(world.wanling?.lastPathDay??-Infinity)<PERIOD) return 0;
  const state=wanlingState(world); state.lastPathDay=world.day;
  const byId=new Map((world.entities||[]).filter(alive).map(e=>[e.id,e]));
  const allActors=new Map((world.entities||[]).map(e=>[e.id,e]));
  for(const j of state.jobs) if(j.stage!=='done') {
    const actor=allActors.get(j.actorId);
    if(activeJourneyForEntity(world,j.actorId)) {
      yieldDaoActivityToTransit(world,j.actorId);
    } else if(!alive(actor)||pathOf(actor)!==j.path) {
      j.stage='done'; j.completedDay=world.day; j.nextDay=world.day;
      j.summary='修士已离世、离开世界或改修他途，行程终止';
    }
  }
  for(const u of liveWanling(world)) if(u.bondedBy && (u.bondUntilDay<=world.day || !byId.has(u.bondedBy)
    || Math.hypot(u.x-byId.get(u.bondedBy).x,u.y-byId.get(u.bondedBy).y)>12)) {
    delete u.bondedBy; delete u.bondDay; delete u.bondUntilDay;
  }
  const jobs=jobList(world); let assigned=0;
  for(const e of world.entities||[]) {
    const key=pathOf(e); if(!key||!alive(e)||activeJourneyForEntity(world,e.id)||getJob(world,e.id)) continue;
    const prior=getJob(world,e.id,false);
    if(prior&&world.day<prior.nextDay) continue;
    const target=targetFor(world,e,key,life); if(!target) continue;
    const j=setJob(world,e,key, key==='blood'||key==='talisman'?'village':key==='formation'?'site':key==='artifact'?'artifact':key==='buddha'||key==='soul'?'wraith':key==='spirit'||key==='sound'||key==='body'?'wanling-or-entity':key==='corpse'?'site':'entity',target,`前往${target.name||target.form||target.kind||'目标'}`);
    if(j) assigned++;
  }
  return assigned;
}

/** Run a dao job's movement/action. Returns true while it owns movement for this tick. */
export function stepDaoTravel(world,life,e,dtDays) {
  if(!world?.wanling || world.wanling.enabled===false) return false;
  if(activeJourneyForEntity(world,e?.id)) {yieldDaoActivityToTransit(world,e.id);return false;}
  const j=getJob(world,e?.id); if(!j||j.stage==='done') return false;
  if(!alive(e)||!world.entities?.includes(e)||pathOf(e)!==j.path) {
    j.stage='done'; j.completedDay=world.day; j.nextDay=world.day;
    j.summary='修士已离世、离开世界或改修他途，行程终止'; return false;
  }
  let target=null;
  if(j.targetKind==='village') target=(world.villages||[]).find(x=>x.id===j.targetId);
  else if(j.targetKind==='site') target=[...(world.sites||[]),...(world.ruins||[])].find(x=>x.id===j.targetId);
  else if(j.targetKind==='artifact') target=(world.artifacts||[]).find(x=>x.id===j.targetId);
  else if(j.targetKind==='wraith') target=(world.wraiths||[]).find(x=>x.id===j.targetId);
  else if(j.targetKind==='wanling-or-entity') target=wanlingById(world,j.targetId)||world.entities?.find(x=>x.id===j.targetId);
  else target=world.entities?.find(x=>x.id===j.targetId);
    if(!target||('hp'in target&&target.hp<=0)||world.day-j.startedDay>360){cancelJob(world,j,'目标已消失或行程超期');e.tx=e.x;e.ty=e.y;return false;}
  j.x=target.x;j.y=target.y; e.tx=target.x;e.ty=target.y;
  if(dist(e,target)<= (j.path==='sword'?1.5:j.path==='corpse'?1.7: j.path==='buddha'||j.path==='spirit'||j.path==='sound'||j.path==='soul'?8:1.8)) {
    if(act(world,life,e,j,target)) { j.nextDay=world.day+COOLDOWN[j.path]; e.tx=e.x;e.ty=e.y; return true; }
    if(world.day-j.startedDay>90){cancelJob(world,j,'行动条件不再成立');e.tx=e.x;e.ty=e.y;return false;}
  }
  if(typeof life.moveTowards==='function') life.moveTowards(e,Math.max(0,Math.min(dtDays,30)),MOVE_INFO);
  return true;
}

export function daoActivityFor(world,actorId) {
  const j=getJob(world,actorId)||getJob(world,actorId,false);
  return j?{...j}:null;
}
