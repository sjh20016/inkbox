import {deriveConditions} from './conditions.js';
import { readProfile,effectiveAttribute } from './profile.js';
import {experienceEffects} from './experiences.js';
import { getCatalogEntry } from './catalog.js';
export const EFFECT_DEFAULTS=Object.freeze({cultivation:1,hp:1,combat:1,learning:1,pollution:1,healing:1,perception:1,travel:1,breakthrough:0,action:0,retreat:0,escape:0,detectRadius:0,healingReceived:1});
export function readEffects(entity,context={}) {
 const out={...EFFECT_DEFAULTS};if(!entity?.wanxiang)return out; const p=entity.wanxiang; const day=context.day??0;
 out.hp+=(effectiveAttribute(entity,'bone')-50)/500;out.learning+=(effectiveAttribute(entity,'comprehension')-50)/500;out.perception+=(effectiveAttribute(entity,'perception')-50)/500;
 const entries=[p.physique,p.hexagram,p.daoSeed,...p.bloodlines.filter(x=>!x.latent),...p.traits,...p.states,...p.personality].filter(Boolean);
 const needed=new Set(entries.flatMap(entry=>getCatalogEntry(entry.id)?.conditionalEffects?.map(row=>row.condition)||[]));
 const conditions=deriveConditions(entity,{...context,needed});
 function apply(e){for(const [k,v] of Object.entries(e||{}))if(Number.isFinite(v)){const axis=({detect_radius:'detectRadius',healing_received:'healingReceived'})[k]||k;if(axis in out)out[axis]+=v;}}
 for(const entry of entries) {
  if((entry.expiresDay??entry.untilDay)!=null&&(entry.expiresDay??entry.untilDay)<=day||entry.dormant)continue;
  const def=getCatalogEntry(entry.id);if(!["trait","persistent","state","bond"].includes(def?.category))apply(def?.effects);
  for(const c of def?.conditionalEffects||[])if(!["trait","persistent","state","bond"].includes(def?.category)&&conditions[c.condition]===true)apply(c.effects);
 }
 for(const b of p.bloodlines)if(!b.latent&&b.id==='true_dragon')out.combat+=.12*(.2+.1*(b.grade-1))*b.purity/100;
 const experience=experienceEffects(entity,day,context.world);apply({...experience,combat:experience.power,action:experience.risk});
 for(const key of Object.keys(out)){const additive=['breakthrough','action','retreat','escape'].includes(key),radius=key==='detectRadius';out[key]=Math.max(radius?-10:additive?-.5:.1,Math.min(radius?10:additive?.5:3,out[key]));}return out;
}
