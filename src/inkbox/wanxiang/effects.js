import {deriveConditions} from './conditions.js';
import { effectiveAttribute } from './profile.js';
import {experienceEffects} from './experiences.js';
import { getCatalogEntry } from './catalog.js';
import {workMetricsEnabled,countWorkMetric,recordWorkActor,startWorkMetric,endWorkMetric} from '../sim/workMetrics.js';
export const EFFECT_DEFAULTS=Object.freeze({cultivation:1,hp:1,combat:1,learning:1,pollution:1,healing:1,perception:1,travel:1,physical_power:1,spell_cost:1,breakthrough:0,action:0,retreat:0,escape:0,detectRadius:0,healingReceived:1,aidIntent:1});
const compiled=new Map();
let metrics=null;
let observer=null;
// Test/profile-only observer. It must be a pure read; disabled in production.
export function observeEffects(callback=null){observer=callback;}
export function measureEffects(enabled=true){metrics=enabled?{calls:0,staticMs:0,dynamicMs:0,cacheHits:0,cacheMisses:0}:null;return metrics;}
function definition(id){
 let d=compiled.get(id);if(d){if(metrics)metrics.cacheHits++;return d;}
 const row=getCatalogEntry(id),allowed=!["trait","persistent","state","bond"].includes(row?.category);
 d={effects:allowed?row?.effects:null,conditional:allowed?row?.conditionalEffects||[]:[]};compiled.set(id,d);if(metrics)metrics.cacheMisses++;return d;
}
// Cache only immutable catalog compilation. Entity health, expiry, relations,
// payment, targets and even in-place profile edits are evaluated on every call.
export function readEffects(entity,context={},source='other') {
 const world=context?.world,measuring=workMetricsEnabled(world);
 if(measuring){countWorkMetric(world,'effects.calls');countWorkMetric(world,`effects.source.${source}`);if(entity)recordWorkActor(world,entity);}
 if(metrics){metrics.sources ||= {};metrics.sources[source]=(metrics.sources[source]||0)+1;}
 const out={...EFFECT_DEFAULTS};if(!entity?.wanxiang)return out;
 if(measuring)countWorkMetric(world,'effects.alloc.result');
 const start=metrics?performance.now():0;if(metrics)metrics.calls++;
 const p=entity.wanxiang, day=context.day??context.world?.day??0;
 out.hp+=(effectiveAttribute(entity,'bone')-50)/500;out.learning+=(effectiveAttribute(entity,'comprehension')-50)/500;out.perception+=(effectiveAttribute(entity,'perception')-50)/500;
 let staticPhase=measuring?startWorkMetric(world):null;
 const entries=[p.physique,p.hexagram,p.daoSeed,...p.bloodlines.filter(x=>!x.latent),...p.traits,...p.states,...p.personality].filter(e=>e&&!e.dormant&&((e.expiresDay??e.untilDay)==null||(e.expiresDay??e.untilDay)>day));
 if(measuring){endWorkMetric(world,'effects.entries',staticPhase);countWorkMetric(world,'effects.alloc.entryArrays',3);staticPhase=startWorkMetric(world);}
 const definitions=entries.map(e=>definition(e.id)),needed=new Set();
 for(const d of definitions)for(const row of d.conditional)needed.add(row.condition);
 if(measuring){endWorkMetric(world,'effects.definitions',staticPhase);staticPhase=startWorkMetric(world);}
 function apply(e){for(const [k,v] of Object.entries(e||{}))if(Number.isFinite(v)){const axis=({detect_radius:'detectRadius',healing_received:'healingReceived'})[k]||k;if(axis in out)out[axis]+=v;}}
 for(const d of definitions)apply(d.effects);
 for(const b of p.bloodlines)if(!b.latent&&!b.dormant&&b.id==='true_dragon')out.combat+=.12*(.2+.1*(b.grade-1))*b.purity/100;
 if(measuring)endWorkMetric(world,'effects.staticApply',staticPhase);
 const dynamicStart=metrics?performance.now():0;if(metrics)metrics.staticMs+=dynamicStart-start;
 if(needed.size){const t=measuring?startWorkMetric(world):null;const conditions=deriveConditions(entity,{...context,needed});if(measuring)endWorkMetric(world,'effects.conditions',t);for(const d of definitions)for(const row of d.conditional)if(conditions[row.condition]===true)apply(row.effects);}
 const t=measuring?startWorkMetric(world):null;
 const experience=experienceEffects(entity,day,context.world);if(measuring)endWorkMetric(world,'effects.experience',t);apply({...experience,combat:experience.power,action:experience.risk});
 const clampStart=measuring?startWorkMetric(world):null;
 for(const key of Object.keys(out)){const additive=['breakthrough','action','retreat','escape'].includes(key),radius=key==='detectRadius';out[key]=Math.max(radius?-10:additive?-.5:.1,Math.min(radius?10:additive?.5:3,out[key]));}
 if(measuring)endWorkMetric(world,'effects.clamp',clampStart);
 if(metrics)metrics.dynamicMs+=performance.now()-dynamicStart;
 if(observer)observer(entity,context,source,out);return out;
}
