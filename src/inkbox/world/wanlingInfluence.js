// Pure queries used by Life, settlement and dao code. Keep this layer free of sim imports.
import { WANLING_BY_KEY, LEGACY_BEAST_FORMS } from '../core/wanlingCatalog.js';
import { wanlingEffectAt } from './wanlingState.js';

const close = (a, b, r) => (a.x-b.x)**2+(a.y-b.y)**2 <= r*r;
const legacyCache=new WeakMap();
function legacy(world) {
  if(!world||world.wanling?.enabled===false) return {beasts:[],byId:new Map()};
  const prior=legacyCache.get(world);
  if(prior?.day===world.day&&prior.entities===world.entities&&prior.length===world.entities?.length
    &&prior.nextEntityId===world.nextEntityId) return prior;
  const beasts=[],byId=new Map();
  for(const e of world.entities||[]) {
    if(e.hp<=0||e._ascended) continue;
    byId.set(e.id,e);
    if(e.sp==='beast'&&LEGACY_BEAST_FORMS.includes(e.form)) beasts.push(e);
  }
  const result={day:world.day,entities:world.entities,length:world.entities?.length,
    nextEntityId:world.nextEntityId,beasts,byId};
  legacyCache.set(world,result);return result;
}
const active = (world) => world?.wanling?.enabled === false ? [] : [...(world?.wanling?.units || []),...legacy(world).beasts];
const soundCalm = (world, x, y) => wanlingEffectAt(world, 'calm', x, y) > 0;
function shore(world,u) {
  const x=Math.floor(u.x), y=Math.floor(u.y);
  for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) {
    if (world.inside(x+dx,y+dy) && world.water[world.idx(x+dx,y+dy)]>0.0015) return true;
  }
  return false;
}
export function wanlingVillageInfluence(world,village) {
  const value={yieldScale:1,recoveryScale:1,damageScale:1,sources:[]};
  if(!village) return value;
  for(const u of active(world)) {
    if(u.hp<=0 || u.state==='dissipated' || !close(u,village,9)) continue;
    let applies=true;
    switch(u.form) {
      case 'dangkang': value.yieldScale+=0.15; break;
      case 'lushu': value.recoveryScale+=0.12; break;
      case 'xuangui': if(shore(world,u)) value.damageScale*=0.9; else applies=false; break;
      case 'water': if(world.water[world.idx(Math.floor(u.x),Math.floor(u.y))]>0.008) value.damageScale*=0.96; else applies=false; break;
      case 'stone': if(world.height[world.idx(Math.floor(u.x),Math.floor(u.y))]>=0.58) value.damageScale*=0.92; else applies=false; break;
      case 'fei': value.yieldScale-=0.1; value.damageScale*=1.08; break;
      case 'tiangou': value.damageScale*=0.9; break;
      case 'jiuweihu': if(village.hp>0) value.recoveryScale+=0.04; else applies=false; break;
      case 'kaiming': if(guardedSite(world,u)) value.damageScale*=0.9; else applies=false; break;
      case 'wolf': if(u.count>=7 && !soundCalm(world,u.x,u.y) && !wanlingGuardAt(world,u.x,u.y)) value.damageScale*=1.08; else applies=false; break;
      default: applies=false;
    }
    if(applies) value.sources.push({id:u.id,form:u.form,name:WANLING_BY_KEY.get(u.form)?.name||u.form});
  }
  if(world?.wanling?.enabled!==false) for(const e of world?.wanling?.effects||[]) {
    if(!['ward','formation'].includes(e.kind)||e.untilDay<=world.day) continue;
    if(e.kind==='ward'&&e.targetId!==village.id) continue;
    if(e.kind==='formation'&&!world.sites?.some(s=>s.id===e.targetId&&s.kind==='formation')) continue;
    if(!close(e,village,Math.min(12,e.radius||0))) continue;
    if(e.sourceId>0 && !(legacy(world).byId.get(e.sourceId)?.hp>0)) continue;
    const mitigation=Math.min(0.1,Math.max(0,e.value||0)*0.5);
    if(!mitigation) continue;
    value.damageScale*=1-mitigation;
    value.sources.push({id:e.sourceId,form:e.kind,name:e.kind==='ward'?'护村符':'阵眼守护'});
  }
  value.yieldScale=Math.max(0.8,Math.min(1.2,value.yieldScale));
  value.recoveryScale=Math.min(1.2,value.recoveryScale);
  value.damageScale=Math.max(0.75,Math.min(1.2,value.damageScale));
  return value;
}
export function wanlingResonanceAt(world,x,y) {
  for(const u of active(world)) if(u.form==='dijiang' && u.hp>0 && close(u,{x,y},6)
    && world.leylines?.some(l=>close(u,l,8))) return 0.08;
  return 0;
}
export function wanlingBondBonus(world,entity) {
  if(world?.wanling?.enabled===false || !(entity?.hp>0) || entity._ascended) return 0;
  for(const u of world?.wanling?.units||[]) if(u.hp>0 && u.bondedBy===entity.id
    && world.day<u.bondUntilDay && close(u,entity,10)) return 0.04;
  return 0;
}
export function wanlingGuardAt(world,x,y) {
  let strength=0;
  for(const u of active(world)) if(u.hp>0 && ['tiangou','kaiming'].includes(u.form)
    && (u.form!=='kaiming'||guardedSite(world,u))
    && close(u,{x,y},u.form==='kaiming'?8:6)) strength=Math.max(strength,0.15);
  return strength;
}
function guardedSite(world,u) {
  return world.sites?.some(s=>close(u,s,8)) || world.rifts?.some(r=>r.closedDay<0&&close(u,r,8));
}
export function isWanlingHostile(world,beast,other) {
  if(world?.wanling?.enabled===false) return true;
  const form=beast?.form;
  if(!form) return true; // generic legacy beasts retain their old behavior
  if(soundCalm(world,beast.x,beast.y)) return false;
  if(['dangkang','lushu','xuangui','chiru','jingwei','dijiang','wood','water','stone','deer','fei','jiuweihu'].includes(form)) return false;
  if(form==='tiangou'||form==='kaiming') return other?.sp==='beast' && ['wolf','fei','qiongqi','zheng'].includes(other.form);
  if(form==='zheng') return other?.form==='wolf';
  if(form==='wolf') return other?.form==='deer' && !soundCalm(world,beast.x,beast.y);
  if(form==='qiongqi') return (other?.karma||0)<=-20 && !wanlingGuardAt(world,other.x,other.y);
  return true;
}
