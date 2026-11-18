import {sendTribulation} from '../sim/divine.js';
import {worldStream} from '../sim/worldStreams.js';
// Persistent body consequences belong to this lifetime, outside editable catalog entries.
export function bodyLedger(e) {
  return e.wanxiang.bodyLedger ||= {phoenixUses:0,phoenixUntil:0,feathers:0,featherSources:[],weakUntil:0,traumaGrants:0,traumaThreats:{},pendingTrauma:null,godArtifact:null};
}
export function validateBodyLedger(l) {
  const fields=['phoenixUses','phoenixUntil','feathers','featherSources','weakUntil','traumaGrants','traumaThreats','pendingTrauma','godArtifact','godFragmentSource','embryoGranted','hiddenAwakened','fireUntil','calamityUntil'];
  if(!l||typeof l!=='object'||Array.isArray(l)||Object.keys(l).some(k=>!fields.includes(k)))throw Error('invalid-body-ledger');
  if(l.godArtifact!=null&&(!Number.isSafeInteger(l.godArtifact)||l.godArtifact<=0))throw Error('invalid-body-ledger');
  if(l.godFragmentSource!=null&&(typeof l.godFragmentSource!=='string'||l.godFragmentSource.length>100))throw Error('invalid-body-ledger');
  const threatKey=k=>/^(mortal|upper|nether):[1-9][0-9]*$/.test(k);
  if(l.traumaThreats&&Object.entries(l.traumaThreats).some(([k,v])=>!threatKey(k)||!Number.isFinite(v)||v<0))throw Error('invalid-body-ledger');
  if(l.pendingTrauma&&(!threatKey(l.pendingTrauma.key)||!Number.isFinite(l.pendingTrauma.day)||l.pendingTrauma.day<0))throw Error('invalid-body-ledger');
  if(l.featherSources&&(l.featherSources.some(s=>typeof s!=='string'||!s.length||s.length>100)||new Set(l.featherSources).size!==l.featherSources.length))throw Error('invalid-body-ledger');
  const optional=['embryoGranted','hiddenAwakened'];
  if(optional.some(k=>l?.[k]!=null&&typeof l[k]!=='boolean')||['fireUntil','calamityUntil'].some(k=>l?.[k]!=null&&(!Number.isFinite(l[k])||l[k]<0)))throw Error('invalid-body-ledger');
  if (!l || ![l.phoenixUses,l.feathers,l.traumaGrants].every(Number.isInteger) || l.phoenixUses<0 || l.phoenixUses>3 || l.feathers<0 || l.feathers>3 || l.traumaGrants<0 || l.traumaGrants>5 || ![l.phoenixUntil,l.weakUntil].every(n=>Number.isFinite(n)&&n>=0) || !Array.isArray(l.featherSources) || l.featherSources.length>3 || !l.traumaThreats || Object.keys(l.traumaThreats).length>5) throw Error('invalid-body-ledger');
}
export const activeBlood=(e,id)=>e.wanxiang?.bloodlines?.find(b=>b.id===id&&!b.latent&&!b.dormant);
export function grantBloodResource(world,e,kind,sourceId) {
  if (!world.wanxiang?.enabled || !e.wanxiang || !sourceId) return false;
  if(kind==='god-fragment') {
    if(!activeBlood(e,'god_king'))return false;
    const l=bodyLedger(e);if(l.godFragmentSource)return false;
    l.godFragmentSource=String(sourceId);e.wanxiang.revision++;return true;
  }
  if(kind!=='phoenix-feather' || !activeBlood(e,'heaven_phoenix'))return false;
  const l=bodyLedger(e);if(l.featherSources.includes(String(sourceId))||l.featherSources.length>=3)return false;
  l.featherSources.push(String(sourceId));l.feathers++;e.wanxiang.revision++;return true;
}
export function tryPhoenix(world,e,cause) {
  if(!world.wanxiang?.enabled || !e.wanxiang || !activeBlood(e,'heaven_phoenix') || e.hp>0 || e.age>=e.lifespan || e._deathRecorded || e._ascended || !['combat','fire','environment'].includes(cause))return false;
  const l=bodyLedger(e);if(l.feathers<1||l.phoenixUses>=3||world.day<l.phoenixUntil)return false;
  l.feathers--;l.phoenixUses++;l.phoenixUntil=world.day+18000;l.weakUntil=world.day+360;
  e.hp=Math.max(1,e.maxHp*.25);delete e.killedBy;delete e.diedOf;
  e.restUntil=Math.max(e.restUntil||0,l.weakUntil);e.wanxiang.revision++;
  e.wanxiang.history.push({day:world.day,source:'天凤涅槃',cause,cost:'消耗本源羽',uses:l.phoenixUses});e.wanxiang.history=e.wanxiang.history.slice(-128);
  return true;
}
export function noteBodyWound(world,attacker,target,hpBefore,sparring) {
  if(sparring||!world.wanxiang?.enabled||target.wanxiang?.physique?.id!=='undying'||attacker===target||attacker.level<target.level||hpBefore<target.maxHp*.5||target.hp>target.maxHp*.2||target.hp<=0)return;
  const l=bodyLedger(target),key=`${world.plane||'mortal'}:${attacker.id}`;
  if(l.traumaGrants>=5||l.pendingTrauma||world.day<(l.traumaThreats[key]||0))return;
  l.pendingTrauma={key,day:world.day};target.wanxiang.revision++;
}
export function stepBody(world,e) {
  if(!world.wanxiang?.enabled||!e.wanxiang||e.hp<=0)return;
  const profile=e.wanxiang;
  if(e.level>=3&&!profile.bloodlines.some(b=>!b.latent)){
    const inherited=profile.bloodlines.filter(b=>b.latent&&b.stable&&b.source?.kind==='birth').sort((a,b)=>b.purity-a.purity)[0];
    if(inherited){
      inherited.latent=false;profile.revision++;
      profile.history.push({day:world.day,source:'血脉显化',bloodlineId:inherited.id,parent:inherited.source.parent,level:e.level});
      profile.history=profile.history.slice(-128);
    }
  }
  if(profile.physique?.id==='dao_embryo'&&!profile.bodyLedger?.embryoGranted){
    bodyLedger(e).embryoGranted=true;
    profile.permanent.comprehension=Math.min(100,profile.permanent.comprehension+10);
    profile.revision++;
  }
  if(profile.physique?.id==='mortal'&&!profile.bodyLedger?.hiddenAwakened){
    const visits=new Set((profile.experienceLedger?.records||[]).filter(r=>r.type==='site-success').map(r=>r.siteId));
    visits.delete(null);
    if(visits.size>=2){bodyLedger(e).hiddenAwakened=true;profile.revision++;}
  }
  if(profile.physique?.id==='fire_eater'&&e.level>0){
    const index=world.idx(Math.floor(e.x),Math.floor(e.y)),fire=world.fire[index];
    const combat=profile.cultivation.combat;
    if(fire>.1&&combat&&combat.mana<30&&world.day>=(profile.bodyLedger?.fireUntil||0)&&e.hp>e.maxHp*.3){
      const taken=Math.min(.1,fire,(30-combat.mana)/10);
      world.fire[index]-=taken;combat.mana+=taken*10;e.hp-=e.maxHp*taken*.1;
      bodyLedger(e).fireUntil=world.day+30;profile.revision++;
    }
  }
  const l=e.wanxiang.bodyLedger;
  if(l?.pendingTrauma&&e.wanxiang.physique?.id==='undying'&&e.hp>=e.maxHp*.9&&world.day>l.pendingTrauma.day){
    if(l.traumaGrants>=5){l.pendingTrauma=null;return;}
    l.traumaThreats[l.pendingTrauma.key]=world.day+360;l.pendingTrauma=null;l.traumaGrants++;e.wanxiang.revision++;
  }
  if(activeBlood(e,'god_king')&&l?.godFragmentSource&&!l.godArtifact){
    // A god shard is represented by a real high-tier relic, bound and worn once.
    const relic=e.artifacts?.find(a=>a.ownerId===e.id&&a.tier>=4&&a.durability>=20);
    if(relic){const state=bodyLedger(e);relic.durability-=20;state.godArtifact=relic.id;e.wanxiang.revision++;}
  }
}
export function bodyHpMultiplier(e){return 1+.02*(e.wanxiang?.bodyLedger?.traumaGrants||0);}
export function bodyCombatMultiplier(e,day){return e.wanxiang?.bodyLedger?.weakUntil>day?.65:1;}
export function bodyCurseResistance(e){return e.wanxiang?.physique?.id==='mortal'&&e.wanxiang.bodyLedger?.hiddenAwakened?.12:0;}
export function invokeCalamity(world,e,target){
  if(!world.wanxiang?.enabled||e.wanxiang?.physique?.id!=='calamity'||!(e.level>0)||e===target||e.hp<=e.maxHp*.5||target.hp<=0||target.level<e.level||Math.hypot(e.x-target.x,e.y-target.y)>3||e.exp<20||world.day<(e.wanxiang.bodyLedger?.calamityUntil||0))return false;
  if(!world.isWalkable(world.idx(Math.floor(target.x),Math.floor(target.y))))return false;
  e.exp-=20;bodyLedger(e).calamityUntil=world.day+360;e.wanxiang.revision++;
  const result=sendTribulation(world,e.x,e.y,3,worldStream(world,'wanxiang-calamity',0x73554332));
  // A successful native breakthrough heals. Debit the physical cost afterwards
  // so the same transaction cannot cancel its own price through that heal.
  e.hp-=e.maxHp*.2;
  e.wanxiang.history.push({day:world.day,source:'引劫',targetKey:`${world.plane||'mortal'}:${target.id}`,cost:'20修为与两成气血',result});
  e.wanxiang.history=e.wanxiang.history.slice(-128);
  return true;
}
