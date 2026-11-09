import { initializeProfile, ARRAY_LIMITS } from './profile.js';
import { worldStream } from '../sim/worldStreams.js';
import {workMetricsEnabled,countWorkMetric} from '../sim/workMetrics.js';

// Reconstructed from the supplied V0.1 specification; no missing content pack is implied.
import EXPERIENCE_TRAITS from './content/experienceTraits.js';
import design from './content/designCatalog.js';

// The rarity interval is fixed. Modifiers only redistribute its legal candidates.
export function chooseExperienceCandidate(candidates, profile, roll, choice) {
 if(roll<.9 || roll>=.99)return null;
 const hex=design.hexagrams.find(row=>row.id===profile.hexagram?.id);
 const rows=candidates.filter(row=>row.eligible!==false);
 function weight(row) {
  const causal=profile.physique?.id==='causal'&&row.family==='因缘'?1.15:1;
  const fate=hex&&hex.family===row.family?hex.familyWeight:1;
  const timid=profile.personality.some(x=>x.id==='personality_timid')&&row.id==='risk_fear'?1.15:1;
  return row.weight*causal*fate*timid;
 }
 let ticket=choice*rows.reduce((sum,row)=>sum+weight(row),0);
 for(const row of rows){ticket-=weight(row);if(ticket<0)return row;}
 return null;
}
export { EXPERIENCE_TRAITS };
export const EXPERIENCE_CONTENT = Object.freeze(['breakthrough-success','breakthrough-failure','site-success','site-failure','healed','gate-aid','combat-wound','escaped','combat-victory','first-realm','rescue','artifact-found','manual-learned','legend-bound','legend-arrived','legend-seal','legend-draw','legend-failed','legend-left','page-borrow','page-return'].map(id=>({id,status:['breakthrough-success','breakthrough-failure','site-success','site-failure','healed'].includes(id)?'A':'C'})));
export function experienceRng(world) { return worldStream(world,'wanxiang-experiences',0x77584532); }
function ledger(p) { return p.experienceLedger ||= {seen:[],cooldowns:{},siteFailures:{},permanentGrants:0,lastPermanentDay:-100000,records:[]}; }
const NEGATIVE_STATES = new Set(['meridian_damage','site_wound','sword_blight','dusty_mind']);
export function addExperienceState(p,value) {
 const prior=p.states.find(x=>x.id===value.id);
 if(prior){if(NEGATIVE_STATES.has(value.id)){if(value.expiresDay!=null)prior.expiresDay=Math.max(prior.expiresDay||0,value.expiresDay);return true;}return false;}
 if(p.states.length>=32){if(!NEGATIVE_STATES.has(value.id))return false;const positive=p.states.findIndex(x=>!NEGATIVE_STATES.has(x.id));if(positive<0)return false;p.states.splice(positive,1);}
 p.states.push(value);return true;
}
export function bondKey(row) { return JSON.stringify([row.id,row.targetKey||'',row.sourceScope||'']); }
// Maintenance occurs at committed changes, never while rendering a character.
export function maintainExperienceRelations(p,day=0) {
 const l=ledger(p);const expired=p.bonds.filter(row=>row.expiresDay!=null&&row.expiresDay<=day&&!row.permanent);
 if(expired.length){l.bondHistory=[...(l.bondHistory||[]),...expired.map(row=>({...row,endedDay:day}))].slice(-32);p.bonds=p.bonds.filter(row=>!expired.includes(row));}
 return expired.length;
}
function add(p,field,value) {
 if(field==='states')return addExperienceState(p,value);
 if(field==='bonds'){
  const prior=p.bonds.find(row=>bondKey(row)===bondKey(value));
  if(prior){if(value.expiresDay>prior.expiresDay){prior.expiresDay=value.expiresDay;return true;}return false;}
 } else if(p[field].some(x=>x.id===value.id))return false;
 if(p[field].length>=ARRAY_LIMITS[field])return false;
 p[field].push(value);return true;
}
/** Called only AFTER the native rule commits a structured fact. No log parsing. */
export function emitCommittedFact(world,e,fact) {
 if(world.wanxiang?.enabled!==true)return false;
 world.wanxiang.factSequence=(world.wanxiang.factSequence||0)+1;
 return processExperienceFact(world,e,{...fact,sequence:world.wanxiang.factSequence});
}
export function processExperienceFact(world,e,fact) {
 if(world.wanxiang?.enabled!==true||!e||e.hp<=0||!fact?.id||!fact.type||!EXPERIENCE_CONTENT.some(row=>row.id===fact.type))return false;
 const p=structuredClone(initializeProfile(e)),l=ledger(p),day=world.day||0;
 const beforeStage=p.physique?.stage||0,beforeFear=p.traits.some(row=>row.id==='risk_fear');
 const hadGratitude=p.bonds.some(row=>row.id==='gratitude:'+fact.helperKey);
 if(l.seen.includes(fact.id)|| (fact.sequence!=null ? !Number.isSafeInteger(fact.sequence)||fact.sequence<1||fact.sequence<=(l.lastSequence||0) : l.seen.length>=128))return false;
 if(fact.type.startsWith('site-') && (fact.arrived!==true || fact.siteId==null))return false;
 if(fact.type==='combat-wound'&&(!(fact.amount>=e.maxHp*.2)||e.hp/e.maxHp>.3||fact.hostile!==true||fact.sourceId===e.id||!world.entities?.some(other=>other.id===fact.sourceId&&other.hp>0)))return false;
 if(fact.type==='healed' && (!(fact.amount>=e.maxHp*.08)||fact.paid!==true||!fact.helperKey||fact.helperKey===`${world.plane||'mortal'}:${e.id}`))return false;
 if(fact.type==='healed'&&!world.entities?.some(h=>`${world.plane||'mortal'}:${h.id}`===fact.helperKey&&h!==e&&h.hp>0))return false;
 if(fact.type==='breakthrough-success' && (!Number.isInteger(fact.targetLevel)||fact.targetLevel<=(l.highWater||0)))return false;
 if(fact.sequence!=null)l.lastSequence=fact.sequence;
 if(fact.type==='breakthrough-success')l.highWater=fact.targetLevel;
 if(fact.type==='breakthrough-failure'&&Number.isInteger(fact.targetLevel)&&fact.targetLevel>0&&fact.targetLevel<=64){
  l.failedGates=Array.from(new Set([...(l.failedGates||[]),fact.targetLevel])).slice(-64);
 }
 // Keep live cooldown guards rather than evicting them to make room for an attacker.
 l.seen.push(fact.id);if(l.seen.length>128)l.seen.shift();
 for(const [k,v] of Object.entries(l.cooldowns))if(v<=day)delete l.cooldowns[k];
 p.states=p.states.filter(s=>s.expiresDay==null||s.expiresDay>day);
 maintainExperienceRelations(p,day);
 for(const [site,failedDay] of Object.entries(l.siteFailures))if(day-failedDay>720)delete l.siteFailures[site];
 const key=fact.type.startsWith('site-')?`${fact.type}:${fact.siteId}`:fact.type==='breakthrough-failure'?`${fact.type}:${fact.fromLevel}`:fact.type==='healed'?`healed:${fact.helperKey}`:fact.type;
 const rewardEligible=!(l.cooldowns[key]>day)&&Object.keys(l.cooldowns).length<32;
 l.recentFacts||={};l.recentFacts[fact.type]=day;
 if(fact.type==='site-failure'){if(Object.keys(l.siteFailures).length<32||l.siteFailures[fact.siteId]!=null)l.siteFailures[fact.siteId]=day;}
 let changed=false;
 const grant=(field,id,extra={})=>{const value={id,name:EXPERIENCE_TRAITS.find(x=>x.id===id)?.name||id,source:fact.id,startDay:day,...extra};const ok=add(p,field,value);changed ||=ok;return ok;};
 const permanent=(id)=>{if(l.permanentGrants>=6||day-l.lastPermanentDay<1800)return false;if(grant('traits',id)){l.permanentGrants++;l.lastPermanentDay=day;return true;}return false;};
 if(fact.type==='healed'&&fact.amount>0){const physique=p.physique;if(['yin_block','yang_block'].includes(physique?.id)&&!(physique.stage>0)&&(physique.lastTreatmentDay==null||day-physique.lastTreatmentDay>=30)){physique.treatments=(physique.treatments||0)+1;physique.lastTreatmentDay=day;if(physique.treatments>=2)physique.stage=1;changed=true;}const damage=p.states.find(s=>s.id==='meridian_damage');if(damage&&fact.paid===true&&(damage.lastTreatmentDay==null||day-damage.lastTreatmentDay>=30)){damage.treatments=(damage.treatments||0)+1;damage.lastTreatmentDay=day;if(damage.treatments>=2)p.states=p.states.filter(s=>s.id!=='meridian_damage');changed=true;}if(fact.helperKey)grant('bonds','gratitude:'+fact.helperKey,{name:'受恩未忘',targetKey:fact.helperKey,expiresDay:day+3600});}
 if(fact.type==='healed'&&fact.helperKey)grant('bonds','shared_insight',{targetKey:fact.helperKey,expiresDay:day+720});
 if(fact.type==='gate-aid'&&fact.paid===true&&fact.helperKey)grant('states','alchemy_guard',{expiresDay:day+180,targetKey:fact.helperKey});
 if(fact.type==='site-success'&&fact.siteId!=null){const failed=l.siteFailures[fact.siteId];if(failed!=null&&day-failed<=720){const t=p.traits.find(t=>t.id==='risk_fear');if(t){const resolved=p.traits.find(row=>row.id==='risk_resolve');if(resolved){p.traits=p.traits.filter(row=>row!==t);}else{t.id='risk_resolve';t.name='险中有定';t.source=fact.id;}changed=true;}delete l.siteFailures[fact.siteId];}}

 if(rewardEligible){
  l.cooldowns[key]=day+(fact.type.startsWith('site-')?720:fact.type==='healed'?1080:360);
  const rng=experienceRng(world),roll=rng(),choice=rng();
  // One rarity roll gates the whole family. Weight only chooses within that tier.
  const families={
   'combat-wound':[{id:'wounded_insight',field:'traits',weight:1,family:'因缘'},{id:'risk_fear',field:'traits',weight:1,family:'逆境'},{id:'pollution_restraint',field:'traits',weight:1,family:'守成',eligible:e.pollution>40}],
   'combat-victory':[{id:'tempered_bones',field:'traits',weight:1,eligible:fact.targetLevel>=e.level&&fact.hostile===true}],
   'manual-learned':[{id:'sword_review',field:'states',weight:1,eligible:(e.dao?.path?.key||e.dao)==='sword',duration:720}],
   'artifact-found':[{id:'artifact_obsession',field:'traits',weight:1}],
   'breakthrough-failure':[{id:'dusty_mind',field:'states',weight:1,duration:360}],
  };
  const candidates=(families[fact.type]||[]).filter(row=>row.eligible!==false);
  let selected=chooseExperienceCandidate(candidates,p,roll,choice);
  // Direct one already-qualified rare wound result per twenty years.
  // The same rarity roll and permanent grant budget still govern the result.
  if(selected && candidates.length>1 && p.physique?.id==='causal'
    && day-(l.lastCausalChoiceDay??-7200)>=7200) {
    const insight=candidates.find(row=>row.family==='因缘');
    if(insight){selected=insight;l.lastCausalChoiceDay=day;}
  }
  if(selected){if(selected.field==='traits')permanent(selected.id);else grant(selected.field,selected.id,{expiresDay:day+selected.duration});}
  if(fact.type==='breakthrough-success'){if(roll>=.7&&roll<.9)grant('states','breakthrough_echo',{expiresDay:day+360});else if(roll>=.9&&roll<.99&&(e.dao?.path?.key||e.dao)==='sword')permanent('sword_heart');}
  if(fact.type==='breakthrough-failure'&&roll>=.7&&roll<.95)grant('states','meridian_damage',{expiresDay:day+720});
  if(fact.type==='site-failure'){if(Object.keys(l.siteFailures).length<32||l.siteFailures[fact.siteId]!=null)l.siteFailures[fact.siteId]=day;if(roll>=.8&&roll<.98)grant('states','site_wound',{expiresDay:day+180});else if(roll>=.98)permanent('risk_fear');}
 }
 // Only material, committed transformations become durable life milestones.
 const milestone=(type,result,targetKey=null)=>{p.history.push({kind:'natural',type,day,actorKey:`${world.plane||'mortal'}:${e.id}`,source:fact.id,location:{x:e.x,y:e.y,plane:world.plane||'mortal'},targetKey,cost:fact.paid===true?{paid:true,helperKey:fact.helperKey||null}:null,result});p.history=p.history.slice(-128);};
 if(fact.type==='healed'&&beforeStage===0&&p.physique?.stage===1)milestone('meridian-open',{physiqueId:p.physique.id,stage:1,treatments:p.physique.treatments},fact.helperKey);
 if(beforeFear&&!p.traits.some(row=>row.id==='risk_fear')&&p.traits.some(row=>row.id==='risk_resolve'))milestone('risk-resolved',{siteId:fact.siteId,traitId:'risk_resolve'});
 if(fact.type==='healed'&&!hadGratitude&&p.bonds.some(row=>row.id==='gratitude:'+fact.helperKey))milestone('aid-bond',{bondId:'gratitude:'+fact.helperKey,healed:fact.amount},fact.helperKey);
 l.records.push({id:fact.id,type:fact.type,day,siteId:fact.siteId??null,targetLevel:fact.targetLevel??null,helperKey:fact.helperKey??null,rewardEligible,rewardDrawn:rewardEligible,changed});if(l.records.length>24)l.records.shift();
 p.revision++;e.wanxiang=p;return true;
}
export function consumeGateAid(e,day=0) {
 const p=e.wanxiang;if(!p)return false;
 const index=p.states.findIndex(row=>row.id==='alchemy_guard'&&row.expiresDay>day);
 if(index<0)return false;
 p.states.splice(index,1);p.revision++;return true;
}
export function experienceEffects(e,day=0,world=null) {
 const measuring=workMetricsEnabled(world);
 const p=e?.wanxiang;const active=id=>{if(measuring){countWorkMetric(world,'experience.active.queries');countWorkMetric(world,'experience.active.arrays');countWorkMetric(world,'experience.active.copied',(p?.traits?.length||0)+(p?.states?.length||0));}return [...(p?.traits||[]),...(p?.states||[])].some(t=>{if(measuring)countWorkMetric(world,'experience.active.visited');return t.id===id&&(t.expiresDay==null||t.expiresDay>day);});};
 const shared=(p?.bonds||[]).filter(row=>row.id==='shared_insight'&&!row.dormant&&row.expiresDay>day);
 if(measuring){countWorkMetric(world,'experience.calls');countWorkMetric(world,'experience.shared.bonds',shared.length);if(shared.length&&world?.entities)countWorkMetric(world,'experience.shared.calls');}
 const helper=shared.length&&world?.entities?.find(other=>{if(measuring)countWorkMetric(world,'experience.shared.entitiesVisited');return other.hp>0&&Math.hypot(e.x-other.x,e.y-other.y)<=8&&shared.some(row=>row.targetKey===`${world.plane||'mortal'}:${other.id}`);});
 if(measuring&&helper)countWorkMetric(world,'experience.shared.hits');
 const vow=p?.traits?.find(t=>t.id==='seal_vow'),resonance=p?.traits?.find(t=>t.id==='demon_sword_resonance');const nearVow=vow&&Math.hypot(e.x-vow.anchorX,e.y-vow.anchorY)<=6;const held=resonance&&(e.artifacts||[]).some(a=>(typeof a==='object'?a.id:a)===resonance.artifactId);
 return {cultivation:(helper?.04:0)+(active('breakthrough_echo')? .05:0)-(active('meridian_damage')?.08:0),hp:(active('tempered_bones')?.06:0)-(active('wounded_insight')?.05:0)+(nearVow?.08:0)-(active('sword_blight')?.12:0)-(active('meridian_damage')?.10:0)-(active('site_wound')?.06:0),power:(active('wounded_insight')?.04:0)+(active('sword_review')&&(e.dao?.path?.key||e.dao)==='sword'?.04:0)+(held?.12:0)+(active('sword_heart')&&(e.dao?.path?.key||e.dao)==='sword'?.06:0),pollution:active('pollution_restraint')?-.15:0,breakthrough:(active('alchemy_guard')?.02:0)-(active('dusty_mind')?.015:0)+(vow?.01:0)+(active('sword_heart')&&(e.dao?.path?.key||e.dao)==='sword'?.01:0),risk:active('risk_fear')?-.2:active('risk_resolve')?.15:0,retreat:active('risk_fear')?.05:0};
}

// A bounded preference only: callers retain all eligibility, reachability and payment checks.
export function socialAidWeight(e,target,world,kind='heal') {
 if(!e?.wanxiang||!target||!world||world.wanxiang?.enabled!==true||world.wanxiang.wxCEnabled===false)return 1;
 const day=world.day||0,p=e.wanxiang,key=`${world.plane||'mortal'}:${target.id}`;
 const bond=(p.bonds||[]).some(b=>b.id===`gratitude:${key}`&&b.targetKey===key&&!b.dormant&&(b.expiresDay==null||b.expiresDay>day));
 const relation=e.relations?.get?.(target.id)?.type;
 const romantic=(p.personality||[]).some(t=>t.id==='personality_romantic'&&!t.dormant&&(t.expiresDay==null||t.expiresDay>day));
 const fear=(p.traits||[]).some(t=>t.id==='risk_fear'&&!t.dormant&&(t.expiresDay==null||t.expiresDay>day));
 return 1+(bond?.25:0)+(romantic&&['lover','kin'].includes(relation)?.15:0)+(kind==='guard'&&fear?-.1:0);
}
