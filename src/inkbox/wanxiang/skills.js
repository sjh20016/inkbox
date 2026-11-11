import {readEffects} from './effects.js';
import { practiceState, knownPractices } from './practice.js';
import { manaCapacity } from './damage.js';
import { countWorkMetric, startWorkMetric, endWorkMetric } from '../sim/workMetrics.js';
import { isMortalHuman } from '../core/demographics.js';

function measuredCapacity(e,world) {
 if(world)countWorkMetric(world,'skills.manaCapacity');
 return manaCapacity(e);
}

// B-class: no automatic mana/default-skill allocation for a life with neither
// formal skill eligibility nor retained combat/equipment. Existing state keeps
// its previous maintenance policy, including a cultivator who loses levels.
export function needsSkillResources(e) {
 const c=e?.wanxiang?.cultivation;
 return e?.level>0 || !!c?.combat || Array.isArray(c?.skills)&&c.skills.length>0;
}

export const SKILLS=Object.freeze([
 {id:'renew',name:'回元',cost:8,cooldown:4,range:0,kind:'heal',scale:.08},
 {id:'strike',name:'凝气击',cost:5,cooldown:2,range:1.6,kind:'physical',scale:1.15},
 {id:'yang',name:'阳息诀',cost:10,cooldown:5,range:1.6,kind:'spell',element:'yang',manualKind:'dual',scale:1.4},
 {id:'thunder',name:'引雷诀',cost:10,cooldown:5,range:1.6,kind:'spell',element:'thunder',manualKind:'thunder',scale:1.4},
 {id:'spell',name:'御法',cost:10,cooldown:5,range:1.6,kind:'spell',scale:1.4},
]);
export function skillSlotCount(e) { return 3+((e.level||0)>=10?1:0)+((e.level||0)>=20&&knownPractices(e).length>=3?1:0); }
function canUseSkill(e, skill) {
 return !!skill && e.level > 0 && (!skill.manualKind || knownPractices(e).some(t => !t.missing && t.kind === skill.manualKind));
}
export function equipSkills(e,ids) {
 if(!Array.isArray(ids)||ids.length>skillSlotCount(e)||new Set(ids).size!==ids.length||ids.some(id=>!canUseSkill(e, SKILLS.find(s=>s.id===id)))) return false;
 combatState(e);practiceState(e).skills=ids.slice();return true;
}
function updateCombatResources(e,days,world) {
 const c=practiceState(e);
 if(!c.combat && c.skills.length===0) c.skills=['renew','strike','spell'];
 // Capacity depends only on the already-initialized physique. No relevant
 // state changes between the old initialization, clamp and regeneration reads.
 const capacity=measuredCapacity(e,world);
 const state=c.combat ||= {mana:capacity,lastActionDay:-1,cooldowns:{}};
 state.mana=Math.min(capacity,state.mana);
 if(days>0)state.mana=Math.min(capacity,Math.max(0,state.mana)+days*2);
 return state;
}
export function combatState(e,world=null) {return updateCombatResources(e,0,world);}
// One bounded scan, one action. Caller applies returned damage through its existing death path.
// null is ordinary-attack fallback; wait consumes this attempt without another attack.
export function chooseSkillAction(e,target,day,{power=1,defense=0}={}) {
 if(!Number.isFinite(day)||![e.x,e.y,target?.x,target?.y,power,defense].every(Number.isFinite)||e.hp<=0||!target||target===e||target.hp<=0||e.plane!==target.plane) return null;
 const c=practiceState(e), state=combatState(e);
 if(day-state.lastActionDay<1) return {kind:'wait',damage:0};
 for(const id of c.skills.slice(0,skillSlotCount(e))) {
  const s=SKILLS.find(x=>x.id===id);if(!canUseSkill(e,s)) continue;
  const effect=readEffects(e,{day,target,skillId:id},'skill'),cost=s.cost*effect.spell_cost;
  if(state.mana<cost || (state.cooldowns[id] ?? -1)>day) continue;
  if(s.kind==='heal' ? e.hp>=e.maxHp*.4 : Math.hypot(e.x-target.x,e.y-target.y)>s.range) continue;
  state.mana-=cost;state.cooldowns[id]=day+s.cooldown;state.lastActionDay=day;
  if(s.kind==='heal') {const healing=Math.min(e.maxHp-e.hp,e.maxHp*s.scale);e.hp+=healing;return {kind:'heal',skill:id,damage:0,healing};}
  return {kind:s.kind,skill:id,element:s.element||null,damage:Math.max(0,power*3.4*s.scale*(s.kind==='physical'?effect.physical_power:1)*(10/(10+Math.max(0,defense)*(s.kind==='spell'?.2:.35))))};
 }
 // Global action interval also covers normal fallback to prevent repeated same-day attacks.
 state.lastActionDay=day;return null;
}
export function stepSkillResources(e,dtDays,world=null) {
 if(!Number.isFinite(dtDays)||dtDays<=0) return;
 if(!needsSkillResources(e)){if(world)countWorkMetric(world,'skills.direct-rejected');return;}
 const started=world?startWorkMetric(world):null;
 if(world){
   countWorkMetric(world,'skills.calls');
   countWorkMetric(world,isMortalHuman(e)?'skills.mortal.calls':e.level>0?'skills.level-positive.calls':'skills.other-unleveled.calls');
   countWorkMetric(world,e.wanxiang?.cultivation?.combat?'skills.preallocated':'skills.unallocated');
 }
 updateCombatResources(e,dtDays,world);
 if(world)endWorkMetric(world,'skills.resources',started);
}
