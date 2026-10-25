// Independent, low-frequency mortal ecology. All identities remain outside Life.entities.
import { WANLING_BY_KEY, WANLING_CATALOG, stableWanlingHash } from '../core/wanlingCatalog.js';
import { WANLING_LIMITS, wanlingState, wanlingEvent, wanlingEffectAt, addWanlingEffect } from '../world/wanlingState.js';
import { OVER, markDirty, markDirtyWithNeighbors, flushDirty } from '../world/terrain.js';
import { setHeight } from '../world/terrainEdit.js';
import { setRecoveringOverlay } from './nature.js';
import { wanlingGuardAt } from '../world/wanlingInfluence.js';
export { wanlingVillageInfluence, wanlingResonanceAt, wanlingGuardAt, isWanlingHostile } from '../world/wanlingInfluence.js';

const SPIRITS=new Set(['wood','water','stone']);
const HERDS=new Set(['deer','wolf']);
const RARE=new Set(['jingwei','jiuweihu','zheng','dijiang','qiongqi','fei','kaiming']);
const HP={deer:22,wolf:32,wood:26,water:26,stone:32,tiangou:80,kaiming:100,qiongqi:90,zheng:70};
const distance=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2;
const rand=(world,id,salt)=>stableWanlingHash(world.seed,id,salt)/0x100000000;
const at=(world,u)=>world.idx(Math.floor(u.x),Math.floor(u.y));
function coast(world,x,y) {
  for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++)
    if(world.inside(x+dx,y+dy)&&world.water[world.idx(x+dx,y+dy)]>0.0015) return true;
  return false;
}
function habitat(world,form,x,y) {
  if(!world.inside(x,y)) return false;
  const i=world.idx(x,y), wet=world.water[i]>0.0015;
  switch(WANLING_BY_KEY.get(form)?.habitat) {
    case 'water': return wet&&world.water[i]>0.008;
    case 'shore': return form==='xuangui' ? wet||coast(world,x,y) : !wet&&coast(world,x,y);
    case 'forest': return !wet&&world.veg[i]>=0.42&&world.fire[i]<0.3;
    case 'highland': return !wet&&world.height[i]>=0.58;
    case 'qi': return !wet&&world.qi[i]>=0.55&&!!nearest(world.leylines,x,y,12);
    default: return !wet&&world.isWalkable(i);
  }
}
function nearest(items,x,y,r,predicate=()=>true) {
  let best=null, limit=r*r;
  for(const o of items||[]) {
    if(!predicate(o)) continue;
    const d=(o.x-x)**2+(o.y-y)**2;
    if(d<=limit) {best=o;limit=d;}
  }
  return best;
}
function localSpot(world,form,x,y,r,salt) {
  x=Math.floor(x);y=Math.floor(y);
  if(habitat(world,form,x,y)) return [x,y];
  for(let k=0;k<32;k++) {
    const a=rand(world,k+x*37+y*17,salt+'a')*Math.PI*2;
    const d=1+rand(world,k+x*23+y*41,salt+'d')*r;
    const xx=Math.floor(x+Math.cos(a)*d),yy=Math.floor(y+Math.sin(a)*d);
    if(habitat(world,form,xx,yy)) return [xx,yy];
  }
  return null;
}
function record(world,u,text) {
  if((u.lastEventDay??-Infinity)+90>world.day) return;
  u.lastEventDay=world.day; wanlingEvent(world,u,text);
}
export function requestWanling(world,form,x,y,{natural=false}={}) {
  const info=WANLING_BY_KEY.get(form);
  if(!info||info.derived) return {ok:false,reason:'不可投放的万灵形态'};
  if(world?.plane!=='mortal'||world?.wanling?.enabled===false) return {ok:false,reason:'此世界未开放万灵'};
  if(!Number.isFinite(x)||!Number.isFinite(y)) return {ok:false,reason:'位置无效'};
  x=Math.floor(x);y=Math.floor(y);
  if(!habitat(world,form,x,y)) return {ok:false,reason:'栖地不符'};
  const s=wanlingState(world), units=s.units;
  if(units.length>=WANLING_LIMITS.units) return {ok:false,reason:'生态名额已满'};
  if(units.filter(u=>u.form===form).length>=WANLING_LIMITS.perForm) return {ok:false,reason:'此类生灵过多'};
  if(RARE.has(form)&&units.filter(u=>RARE.has(u.form)).length>=WANLING_LIMITS.rare) return {ok:false,reason:'稀有生态名额已满'};
  if(units.some(u=>u.form===form&&distance(u,{x,y})<16)) return {ok:false,reason:'同类生灵过近'};
  const maxHp=HP[form]||50;
  const unit={id:-s.nextId++,sp:SPIRITS.has(form)?'spirit':'beast',form,name:info.name,
    x:x+0.5,y:y+0.5,tx:x+0.5,ty:y+0.5,hp:maxHp,maxHp,
    count:form==='deer'?9:form==='wolf'?5:1,state:natural?'forage':'settled',
    bornDay:world.day,lastActDay:world.day};
  units.push(unit);
  if(!natural) record(world,unit,`${unit.name}在（${x},${y}）现身。`);
  return {ok:true,unit};
}
export function removeWanling(world,id) {
  const units=world?.wanling?.units, index=units?.findIndex(u=>u.id===Number(id))??-1;
  if(index<0) return false;
  const [u]=units.splice(index,1);
  world.wanling.effects=world.wanling.effects.filter(e=>e.sourceId!==u.id);
  wanlingEvent(world,u,`${u.name}离开此地。`);
  return true;
}
function move(world,u,x,y) {
  const spot=localSpot(world,u.form,x,y,4,`${u.id}:${world.day}`);
  if(!spot) return false;
  u.tx=spot[0]+0.5;u.ty=spot[1]+0.5;
  return true;
}
function advanceMotion(world,days) {
  const limit=Math.min(2,Math.max(0,days)*0.055);
  if(!limit) return false;
  let moved=false;
  for(const u of world.wanling.units) {
    if(u.hp<=0||!Number.isFinite(u.tx)||!Number.isFinite(u.ty)) continue;
    const dx=u.tx-u.x,dy=u.ty-u.y,d=Math.hypot(dx,dy);
    if(d<1e-5) continue;
    const step=Math.min(d,limit);
    u.x+=dx/d*step;u.y+=dy/d*step;moved=true;
  }
  return moved;
}
function lostHabitat(world,u) {
  if(habitat(world,u.form,Math.floor(u.x),Math.floor(u.y))) return false;
  if(habitat(world,u.form,Math.floor(u.tx),Math.floor(u.ty))&&Math.hypot(u.tx-u.x,u.ty-u.y)>0.1) {
    u.state='migrating';return true;
  }
  const spot=localSpot(world,u.form,u.x,u.y,9,`migrate:${u.id}:${world.day}`);
  if(spot) { move(world,u,...spot);u.state='migrating';record(world,u,`${u.name}失去旧栖地，迁往附近。`); }
  else {u.hp=Math.max(0,u.hp-9);u.state=u.hp?'weak':'dissipated';if(!u.hp) record(world,u,`${u.name}失栖消散。`);}
  return true;
}
function herdCount(world,u,delta,reason) {
  const before=u.count;u.count=Math.max(0,Math.min(30,before+delta));
  if(before!==u.count) record(world,u,`${u.name}${reason}，数量${before}→${u.count}。`);
  if(!u.count) {u.hp=0;u.state='gone';}
}
function repel(world,guard,target) {
  target.hp=Math.max(0,target.hp-8);
  if(HERDS.has(target.form)) herdCount(world,target,-1,'受驱');
  const dx=target.x-guard.x,dy=target.y-guard.y,dist=Math.hypot(dx,dy)||1;
  move(world,target,target.x+dx/dist*5,target.y+dy/dist*5);
  target.state='flee'; record(world,guard,`${guard.name}驱逐${target.name}。`);
}
function buildShore(world,u) {
  if((u.lastBuildDay??-Infinity)+180>world.day) return;
  const x=Math.floor(u.x),y=Math.floor(u.y);
  for(let dy=-3;dy<=3;dy++) for(let dx=-3;dx<=3;dx++) {
    const xx=x+dx,yy=y+dy;if(!world.inside(xx,yy)) continue;
    const i=world.idx(xx,yy),depth=world.water[i];
    if(depth<=0.0015||depth>0.014||world.struct[i]||world.nature?.floods?.has(i)||!coast(world,xx,yy)) continue;
    if(setHeight(world,i,world.height[i]+Math.min(0.004,depth),{player:false})) {
      markDirtyWithNeighbors(world,i);flushDirty(world);world.touch();
      u.lastBuildDay=world.day;u.state='building';
      record(world,u,`${u.name}在（${xx},${yy}）衔石筑岸，浅滩高程改变。`);return;
    }
  }
}
function scorch(world,u) {
  if((u.lastScorchDay??-Infinity)+180>world.day) return;
  const x=Math.floor(u.x),y=Math.floor(u.y);let count=0;
  for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
    const xx=x+dx,yy=y+dy;if(!world.inside(xx,yy)) continue;
    const i=world.idx(xx,yy);
    if(world.water[i]>0.0015||world.struct[i]||world.over[i]===OVER.LAVA||world.nature?.overlays?.has(i)) continue;
    const old=world.veg[i];world.veg[i]=Math.fround(Math.max(0,old*0.4));
    setRecoveringOverlay(world,i,OVER.SCORCHED,360,world.day,{recoverVeg:old,expectedVeg:world.veg[i]});count++;
  }
  if(count) {flushDirty(world);world.touch();u.lastScorchDay=world.day;u.state='scorching';record(world,u,`${u.name}留下${count}格可恢复枯痕。`);}
}
function act(world,u) {
  if((SPIRITS.has(u.form)||u.form==='chiru'||u.form==='xuangui')&&lostHabitat(world,u)) return;
  const i=at(world,u),units=world.wanling.units;
  switch(u.form) {
    case 'deer': {
      const wolf=nearest(units,u.x,u.y,5,v=>v.form==='wolf'&&v.hp>0&&wanlingEffectAt(world,'calm',v.x,v.y)<=0);
      if(wolf) {move(world,u,u.x+(u.x-wolf.x)*2,u.y+(u.y-wolf.y)*2);u.state='flee';}
      else {const available=world.veg[i];const eaten=Math.min(available,0.015*u.count);world.veg[i]=Math.fround(available-eaten);u.state='grazing';if(eaten) {markDirty(world,i);flushDirty(world);world.touch();}if(world.veg[i]<0.08) herdCount(world,u,-1,'缺草');else if(available>0.65&&rand(world,u.id,`fawn:${world.day}`)<0.25) herdCount(world,u,1,'繁衍');}
      break;
    }
    case 'wolf': {
      const calm=wanlingEffectAt(world,'calm',u.x,u.y)>0;
      const guard=nearest(units,u.x,u.y,7,v=>v!==u&&v.hp>0&&['tiangou','kaiming','zheng'].includes(v.form));
      if(guard) repel(world,guard,u);
      else if(calm) {u.state='calm';move(world,u,u.x+4,u.y+4);}
      else {const deer=nearest(units,u.x,u.y,7,v=>v.form==='deer'&&v.hp>0);if(deer) {const caught=distance(u,deer)<=1.8**2;if(caught) herdCount(world,deer,-1,'遭狼捕食');move(world,u,deer.x,deer.y);u.state=caught?'hunting':'chasing';if(caught&&u.count<12&&rand(world,u.id,`pups:${world.day}`)<0.2) herdCount(world,u,1,'获食繁衍');}else u.state='forage';}
      break;
    }
    case 'tiangou': case 'zheng': case 'kaiming': {
      const forms=u.form==='zheng'?['wolf']:['wolf','qiongqi','fei','zheng'];
      const site=u.form==='kaiming'&&(nearest(world.sites,u.x,u.y,8)||nearest(world.rifts,u.x,u.y,8,r=>r.closedDay<0));
      const target=(u.form!=='kaiming'||site)
        ? nearest(units,u.x,u.y,u.form==='kaiming'?9:7,v=>v!==u&&v.hp>0&&forms.includes(v.form)) : null;
      if(target) repel(world,u,target);
      u.state=u.form==='kaiming'?(site?'guarding':'wandering'):'guarding';
      break;
    }
    case 'dangkang': u.state=nearest(world.villages,u.x,u.y,9)?'blessing':'forage';break;
    case 'lushu': {
      u.state=nearest(world.villages,u.x,u.y,9)?'blessing':'forage';
      const p=nearest(world.entities,u.x,u.y,4,e=>e.hp>0&&e.dao?.path?.key==='spirit');
      if(p&&!world.wanling.effects.some(e=>e.kind==='bond'&&e.sourceId===u.id&&e.targetId===p.id&&e.untilDay>world.day)) {
        p.exp=(p.exp||0)+2;
        u.bondedBy=p.id;u.bondDay=world.day;u.bondUntilDay=world.day+180;
        addWanlingEffect(world,{kind:'bond',sourceId:u.id,targetId:p.id,x:p.x,y:p.y,radius:0,value:1,untilDay:world.day+180});
        record(world,u,`${u.name}与【${p.name}】结缘。`);
      }
      break;
    }
    case 'xuangui': u.state='shore';break;
    case 'chiru': {
      u.state='swimming';u.resource=Math.min(5,(u.resource||0)+1);
      const p=nearest(world.entities,u.x,u.y,4,e=>e.hp>0&&e.dao?.path?.key==='alchemy');
      if(p&&u.resource>0) {u.resource--;p.exp=(p.exp||0)+2;record(world,u,`【${p.name}】从${u.name}栖水采得一份灵材。`);}
      break;
    }
    case 'jingwei': buildShore(world,u);break;
    case 'jiuweihu': {
      const nearVillage=nearest(world.villages,u.x,u.y,9,v=>v.hp>0);
      u.mask=nearVillage&&rand(world,u.id,`mask:${Math.floor(world.day/90)}`)<0.45?'human':'fox';
      u.state=u.mask==='human'?'disguised':nearVillage?'affable':'wandering';
      break;
    }
    case 'dijiang': u.state=nearest(world.leylines,u.x,u.y,8)?'resonating':'wandering';break;
    case 'qiongqi': {
      const victim=nearest(world.entities,u.x,u.y,5,p=>p.hp>0&&!p._ascended&&(p.karma||0)<=-20);
      if(victim&&!wanlingGuardAt(world,victim.x,victim.y)) {victim.hp=Math.max(1,victim.hp-Math.min(8,(victim.maxHp||40)*0.12));u.state='hunting';record(world,u,`${u.name}循善业袭扰【${victim.name}】。`);} else u.state='prowling';break;
    }
    case 'fei': scorch(world,u);break;
    case 'wood': {const old=world.veg[i];world.veg[i]=Math.fround(Math.min(1,old+0.04));if(world.veg[i]!==old) {markDirty(world,i);flushDirty(world);world.touch();}u.state='rooted';break;}
    case 'water': case 'stone': u.state='anchored';break;
  }
  u.lastActDay=world.day;
}
function naturalSpawn(world,period) {
  const options=WANLING_CATALOG.filter(e=>!e.derived&&!['fei','qiongqi'].includes(e.key));
  for(let k=0;k<5;k++) {
    const n=period*17+k,form=options[stableWanlingHash(world.seed,n,'form')%options.length].key;
    const x=stableWanlingHash(world.seed,n,'x')%world.w,y=stableWanlingHash(world.seed,n,'y')%world.h;
    const spot=localSpot(world,form,x,y,12,`natural:${n}`);
    if(spot) {const added=requestWanling(world,form,...spot,{natural:true});if(added.ok) {record(world,added.unit,`${added.unit.name}自然出现。`);return;}}
  }
}
function cleanBonds(world,s) {
  if(!s.units.some(u=>u.bondedBy)||!s.effects.some(e=>e.kind==='bond')) return;
  const people=new Map((world.entities||[]).filter(e=>e.hp>0&&!e._ascended).map(e=>[e.id,e]));
  const units=new Map(s.units.filter(u=>u.hp>0).map(u=>[u.id,u]));
  for(const u of s.units) if(u.bondedBy) {
    const p=people.get(u.bondedBy);
    const due=u.bondUntilDay??((u.bondDay??-Infinity)+120);
    if(!p||due<=world.day||distance(u,p)>100) {
      delete u.bondedBy;delete u.bondDay;delete u.bondUntilDay;
    }
  }
  s.effects=s.effects.filter(e=>{
    if(e.kind!=='bond') return true;
    const source=e.sourceId<0?units.get(e.sourceId):people.get(e.sourceId);
    const target=e.targetId<0?units.get(e.targetId):people.get(e.targetId);
    return e.untilDay>world.day&&source&&target&&distance(source,target)<=100;
  });
}
export function stepWanling(world,days,{life}={}) {
  if(world?.plane!=='mortal'||!Number.isFinite(days)||days<=0) return false;
  const fresh=!world.wanling;
  const s=wanlingState(world);if(!s.enabled) return false;
  if(fresh) s.lastEcoDay=s.lastSpawnDay=Math.max(0,world.day-days);
  cleanBonds(world,s);
  const finalDay=world.day;
  let loops=0,changed=false;
  while(s.lastEcoDay+30<=finalDay&&loops++<12) {
    changed=true;
    s.lastEcoDay+=30;world.day=s.lastEcoDay;
    for(const u of [...s.units]) if(u.hp>0) act(world,u);
    s.units=s.units.filter(u=>u.hp>0&&u.count>0&&u.state!=='dissipated');
    s.effects=s.effects.filter(e=>e.untilDay>world.day&&(e.sourceId>=0||s.units.some(u=>u.id===e.sourceId)));
  }
  world.day=finalDay;
  if(loops>12) s.lastEcoDay=finalDay;
  changed=advanceMotion(world,days)||changed;
  loops=0;
  while(s.lastSpawnDay+90<=finalDay&&loops++<4) {
    changed=true;
    s.lastSpawnDay+=90;world.day=s.lastSpawnDay;naturalSpawn(world,Math.floor(s.lastSpawnDay/90));
  }
  world.day=finalDay;
  if(loops>4) s.lastSpawnDay=finalDay;
  return changed;
}
