import { MANUALS, FORBIDDEN_TECHNIQUES, NETHER_TECHNIQUES } from '../core/lore.js';
const manuals=[...MANUALS,...FORBIDDEN_TECHNIQUES,...NETHER_TECHNIQUES];
const id=t=>'manual:'+Array.from(t.name).map(c=>c.codePointAt(0).toString(16)).join('-');
export const SUPPORTED_CONDITIONS=Object.freeze(['always','hp_below_30','hp_above_80','mind_above_70','pollution_above_40','first_manual','manual_progress_below_half','manual_progress_above_half','at_home_village','away_from_home','sword_path','fire_path','yin_path','sword_manual','alchemy_manual','meridians_blocked','yin_meridians_open','yang_meridians_open','legal_journey','land_journey']);
// Only current state or bounded committed records can prove a condition.
export function deriveConditions(e,context={}) {
 const p=e?.wanxiang,c=p?.cultivation||{},world=context.world,day=context.day??world?.day??0;
 const primary=manuals.find(t=>id(t)===c.primary&&(e.techniques||[]).some(k=>k.name===t.name));
 const path=primary?.kind||(e.dao?.path?.key||e.dao);
 const target=manuals.find(t=>id(t)===context.manualId);
 const progress=target?c.learning?.[id(target)]:undefined;
 const home=e.birthOrigin?.villageId>0?world?.villageById?.(e.birthOrigin.villageId):null;
 const distance=home?Math.hypot(e.x-home.x,e.y-home.y):NaN;
 const journey=world?.transit?.journeys?.find(j=>j.actorId===e.id&&['active','blocked','landing'].includes(j.status));
 const blocked=['yin_block','yang_block'].includes(p?.physique?.id)&&!(p.physique.stage>0);
 return {always:true,hp_below_30:e.maxHp>0&&e.hp/e.maxHp<.3,hp_above_80:e.maxHp>0&&e.hp/e.maxHp>.8,mind_above_70:e.mind>70,pollution_above_40:e.pollution>40,
 first_manual:(e.techniques||[]).length===0,manual_progress_below_half:Number.isFinite(progress)&&progress<.5,manual_progress_above_half:Number.isFinite(progress)&&progress>.5,
 at_home_village:Number.isFinite(distance)&&distance<=3,away_from_home:Number.isFinite(distance)&&distance>3,
 prior_failure_same_gate:Number.isInteger(context.targetLevel)&&(p?.experienceLedger?.records||[]).some(r=>r.type==='breakthrough-failure'&&r.targetLevel===context.targetLevel&&r.day<=day),
 sword_path:path==='sword',fire_path:path==='fire',yin_path:path==='yin',sword_manual:target?target.kind==='sword':context.sword_manual===true,alchemy_manual:target?target.kind==='alchemy':context.alchemy_manual===true,
 meridians_blocked:blocked,yin_meridians_open:p?.physique?.id==='yin_block'&&p.physique.stage>0&&path==='yin',yang_meridians_open:p?.physique?.id==='yang_block'&&p.physique.stage>0&&(path==='dual'||path==='yang'),legal_journey:!!journey,land_journey:!!journey&&journey.mode==='land'};
}
