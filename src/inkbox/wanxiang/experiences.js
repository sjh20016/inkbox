import { initializeProfile } from './profile.js';
import { worldStream } from '../sim/worldStreams.js';

// Reconstructed from the supplied V0.1 specification; no missing content pack is implied.
import EXPERIENCE_TRAITS from './content/experienceTraits.js';
export { EXPERIENCE_TRAITS };
export const EXPERIENCE_CONTENT = Object.freeze(['breakthrough-success','breakthrough-failure','site-success','site-failure','healed','gate-aid','combat-wound','combat-victory','first-realm','rescue','artifact-found','manual-learned','legend-bound','legend-arrived','legend-seal','legend-draw','legend-failed','legend-left','page-borrow','page-return'].map(id=>({id,status:['breakthrough-success','breakthrough-failure','site-success','site-failure','healed'].includes(id)?'A':'C'})));
export function experienceRng(world) { return worldStream(world,'wanxiang-experiences',0x77584532); }
function ledger(p) { return p.experienceLedger ||= {seen:[],cooldowns:{},siteFailures:{},permanentGrants:0,lastPermanentDay:-100000,records:[]}; }
const NEGATIVE_STATES = new Set(['meridian_damage','site_wound','sword_blight','dusty_mind']);
export function addExperienceState(p,value) {
 const prior=p.states.find(x=>x.id===value.id);
 if(prior){if(NEGATIVE_STATES.has(value.id)){if(value.expiresDay!=null)prior.expiresDay=Math.max(prior.expiresDay||0,value.expiresDay);return true;}return false;}
 if(p.states.length>=32){if(!NEGATIVE_STATES.has(value.id))return false;const positive=p.states.findIndex(x=>!NEGATIVE_STATES.has(x.id));if(positive<0)return false;p.states.splice(positive,1);}
 p.states.push(value);return true;
}
function add(p,field,value) { if(field==='states')return addExperienceState(p,value);if(p[field].some(x=>x.id===value.id))return false; if(p[field].length>=(field==='traits'?6:4))return false; p[field].push(value);return true; }
/** Called only AFTER the native rule commits a structured fact. No log parsing. */
export function emitCommittedFact(world,e,fact) {
 if(world.wanxiang?.enabled!==true)return false;
 world.wanxiang.factSequence=(world.wanxiang.factSequence||0)+1;
 return processExperienceFact(world,e,{...fact,sequence:world.wanxiang.factSequence});
}
export function processExperienceFact(world,e,fact) {
 if(world.wanxiang?.enabled!==true||!e||e.hp<=0||!fact?.id||!fact.type||!EXPERIENCE_CONTENT.some(row=>row.id===fact.type))return false;
 const p=structuredClone(initializeProfile(e)),l=ledger(p),day=world.day||0;
 if(l.seen.includes(fact.id)|| (fact.sequence!=null ? !Number.isSafeInteger(fact.sequence)||fact.sequence<1||fact.sequence<=(l.lastSequence||0) : l.seen.length>=128))return false;
 if(fact.type.startsWith('site-') && (fact.arrived!==true || fact.siteId==null))return false;
 if(fact.type==='healed' && (!(fact.amount>=e.maxHp*.08)||fact.paid!==true||!fact.helperKey||fact.helperKey===`${world.plane||'mortal'}:${e.id}`))return false;
 if(fact.type==='healed'&&!world.entities?.some(h=>`${world.plane||'mortal'}:${h.id}`===fact.helperKey&&h!==e&&h.hp>0))return false;
 if(fact.type==='breakthrough-success' && (!Number.isInteger(fact.targetLevel)||fact.targetLevel<=(l.highWater||0)))return false;
 if(fact.sequence!=null)l.lastSequence=fact.sequence;
 if(fact.type==='breakthrough-success')l.highWater=fact.targetLevel;
 // Keep live cooldown guards rather than evicting them to make room for an attacker.
 l.seen.push(fact.id);if(l.seen.length>128)l.seen.shift();
 for(const [k,v] of Object.entries(l.cooldowns))if(v<=day)delete l.cooldowns[k];
 p.states=p.states.filter(s=>s.expiresDay==null||s.expiresDay>day);
 const key=fact.type.startsWith('site-')?`${fact.type}:${fact.siteId}`:fact.type==='breakthrough-failure'?`${fact.type}:${fact.fromLevel}`:fact.type==='healed'?`healed:${fact.helperKey}`:fact.type;
 if(l.cooldowns[key]>day||Object.keys(l.cooldowns).length>=32){p.revision++;e.wanxiang=p;return false;}
 let changed=false;
 const grant=(field,id,extra={})=>{const value={id,name:EXPERIENCE_TRAITS.find(x=>x.id===id)?.name||id,source:fact.id,startDay:day,...extra};const ok=add(p,field,value);changed ||=ok;return ok;};
 const permanent=(id)=>{if(l.permanentGrants>=6||day-l.lastPermanentDay<1800)return false;if(grant('traits',id)){l.permanentGrants++;l.lastPermanentDay=day;return true;}return false;};
 if(fact.type==='healed'&&fact.amount>0){const physique=p.physique;if(['yin_block','yang_block'].includes(physique?.id)&&!(physique.stage>0)&&(physique.lastTreatmentDay==null||day-physique.lastTreatmentDay>=30)){physique.treatments=(physique.treatments||0)+1;physique.lastTreatmentDay=day;if(physique.treatments>=2)physique.stage=1;changed=true;}const damage=p.states.find(s=>s.id==='meridian_damage');if(damage&&fact.paid===true&&(damage.lastTreatmentDay==null||day-damage.lastTreatmentDay>=30)){damage.treatments=(damage.treatments||0)+1;damage.lastTreatmentDay=day;if(damage.treatments>=2)p.states=p.states.filter(s=>s.id!=='meridian_damage');changed=true;}if(fact.helperKey)grant('bonds','gratitude:'+fact.helperKey,{name:'受恩未忘',targetKey:fact.helperKey,expiresDay:day+3600});}
 if(fact.type==='site-success'&&fact.siteId!=null){const failed=l.siteFailures[fact.siteId];if(failed!=null&&day-failed<=720){const t=p.traits.find(t=>t.id==='risk_fear');if(t){t.id='risk_resolve';t.name='险中有定';t.source=fact.id;changed=true;}delete l.siteFailures[fact.siteId];}}

 if(!(l.cooldowns[key]>day)&&Object.keys(l.cooldowns).length<32){
  l.cooldowns[key]=day+(fact.type.startsWith('site-')?720:fact.type==='healed'?1080:360);
  const rng=experienceRng(world),roll=rng();rng();
  if(fact.type==='breakthrough-success'){if(roll>=.7&&roll<.9)grant('states','breakthrough_echo',{expiresDay:day+360});else if(roll>=.9&&roll<.99&&(e.dao?.path?.key||e.dao)==='sword')permanent('sword_heart');}
  if(fact.type==='breakthrough-failure'&&roll>=.7&&roll<.95)grant('states','meridian_damage',{expiresDay:day+720});
  if(fact.type==='site-failure'){if(Object.keys(l.siteFailures).length<32||l.siteFailures[fact.siteId]!=null)l.siteFailures[fact.siteId]=day;if(roll>=.8&&roll<.98)grant('states','site_wound',{expiresDay:day+180});else if(roll>=.98)permanent('risk_fear');}
 }
 l.records.push({id:fact.id,type:fact.type,day,siteId:fact.siteId??null,changed});if(l.records.length>24)l.records.shift();
 p.revision++;e.wanxiang=p;return true;
}
export function experienceEffects(e,day=0) {
 const p=e?.wanxiang;const active=id=>[...(p?.traits||[]),...(p?.states||[])].some(t=>t.id===id&&(t.expiresDay==null||t.expiresDay>day));
 const vow=p?.traits?.find(t=>t.id==='seal_vow'),resonance=p?.traits?.find(t=>t.id==='demon_sword_resonance');const nearVow=vow&&Math.hypot(e.x-vow.anchorX,e.y-vow.anchorY)<=6;const held=resonance&&(e.artifacts||[]).some(a=>(typeof a==='object'?a.id:a)===resonance.artifactId);
 return {cultivation:(active('breakthrough_echo')? .05:0)-(active('meridian_damage')?.08:0),hp:(nearVow?.08:0)-(active('sword_blight')?.12:0)-(active('meridian_damage')?.10:0)-(active('site_wound')?.06:0),power:(held?.12:0)+(active('sword_heart')&&(e.dao?.path?.key||e.dao)==='sword'?.06:0),breakthrough:(vow?.01:0)+(active('sword_heart')&&(e.dao?.path?.key||e.dao)==='sword'?.01:0),risk:active('risk_fear')?-.2:active('risk_resolve')?.15:0,retreat:active('risk_fear')?.05:0};
}
