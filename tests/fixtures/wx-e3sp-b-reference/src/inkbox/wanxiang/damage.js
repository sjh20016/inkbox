import {activeBlood} from './bloodPhysique.js';
// Typed combat adjustments use committed world objects and learned skill types.
const active = (e,id) => e?.wanxiang?.physique?.id===id&&!e.wanxiang.physique.dormant;
const enabled = world => world?.wanxiang?.enabled===true;
export function manaCapacity(e) { return active(e,'devour')?18:30; }
export function battleBonus(e,day) {
 const b=e?.wanxiang?.cultivation?.battle;
 return b&&b.untilDay>day?Math.min(.06,Math.max(0,b.bonus||0)):0;
}
function battleState(e,day) {
 const c=e.wanxiang.cultivation;
 return c.battle ||= {windowStart:day,grants:0,seen:[],untilDay:0,bonus:0,lastDevourDay:-1};
}
export function reduceIncomingDamage(e,target,amount,kind,world,{element=null,skill=null}={}) {
 if(!Number.isFinite(amount)||amount<=0)return 0;
 if(!enabled(world))return amount;
 let factor=1;
 if(active(target,'spell_ward')) {if(kind==='spell')factor-=.25;else if(kind==='physical')factor+=.15;}
 if(active(target,'earth'))factor-=.15;
 const dragon=activeBlood(target,'true_dragon');
 if(dragon && e.sp==='beast' && (e.level||0)<=(target.level||0) && Math.hypot(e.x-target.x,e.y-target.y)<=6)factor-=.08;
 const god=e.wanxiang?.bodyLedger?.godArtifact;
 if(kind==='spell' && activeBlood(e,'god_king') && god && e.artifacts?.some(a=>a.id===god&&a.ownerId===e.id&&a.durability>0))factor+=.08;
 // Element labels must come from an actually equipped, learned skill, not the caster's physique.
 const learned=(e.techniques||[]).some(t=>t.kind===(skill==='yang'?'dual':skill==='thunder'?'thunder':null));
 const legal=kind==='spell'&&e.wanxiang?.cultivation?.skills?.includes(skill)&&learned;
 if(legal&&active(e,'solar')&&skill==='yang'&&element==='yang')factor+=.12;
 if(legal&&active(e,'thunder')&&skill==='thunder'&&element==='thunder')factor+=.12;
 factor+=battleBonus(e,world.day);
 return Math.max(0,amount*factor);
}
export function postCombatHit(world,e,target,{amount,hpBefore,kind,element=null,hitId=null,sparring=false}={}) {
 if(!enabled(world)||sparring||!world.entities?.includes(e)||!world.entities?.includes(target)||e===target||e.hp<=0||e.plane!==target.plane||!Number.isFinite(hpBefore)||hpBefore<=0||!Number.isFinite(amount)||amount<=0)return {drained:0,asura:false};
 // Verify a real loss, cap overkill, and reject fabricated contribution packets.
 const loss=Math.min(amount,hpBefore,Math.max(0,hpBefore-target.hp));
 if(loss<=0)return {drained:0,asura:false};
 let drained=0,asura=false;
 if(active(e,'devour')&&target.hp>0) {
  const own=e.wanxiang.cultivation.combat,other=target.wanxiang?.cultivation?.combat;
  if(own&&other) {
   const state=battleState(e,world.day);
   if(world.day-state.lastDevourDay>=1){
    drained=Math.min(2,Math.max(0,other.mana),Math.max(0,manaCapacity(e)-own.mana));
    if(drained>0){other.mana-=drained;own.mana+=drained;state.lastDevourDay=world.day;}
   }
  }
 }
 const blood=e.wanxiang?.bloodlines?.find(b=>b.id==='asura'&&!b.latent&&!b.dormant);
 if(blood&&target.level>=e.level&&target.maxHp>=e.maxHp*.5&&loss>=target.maxHp*.02) {
  const b=battleState(e,world.day),key=`${target.plane??0}:${target.id}`;
  if(world.day-b.windowStart>=360){b.windowStart=world.day;b.grants=0;b.seen=[];}
  if(b.grants<3&&!b.seen.includes(key)) {
   b.seen.push(key);b.grants++;b.bonus=Math.min(.06,.02*b.grants);b.untilDay=world.day+30;asura=true;
   e.pollution=Math.min(100,(e.pollution||0)+.5);
  }
 }
 return {drained,asura};
}
