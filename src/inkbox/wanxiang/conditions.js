import {MANUAL_INDEX, techniqueId as id} from './manualIds.js';
import {workMetricsEnabled,countWorkMetric,maxWorkMetric} from '../sim/workMetrics.js';
import {mentorLookup} from '../sim/entityReadView.js';

let observer=null;
// Opt-in pure diagnostic comparison of the COMPLETE returned map.
export function observeConditions(callback=null){observer=callback;}


export const SUPPORTED_CONDITIONS=Object.freeze(['social_sect_aid','social_mentor_aid','social_junior_aid','using_equipped_skill','always','hp_below_30','hp_above_80','mind_above_70','pollution_above_40','first_manual','manual_progress_below_half','manual_progress_above_half','at_home_village','away_from_home','sword_path','fire_path','yin_path','sword_manual','alchemy_manual','meridians_blocked','yin_meridians_open','yang_meridians_open','legal_journey','land_journey','heal_ally','heal_junior','heal_true_kin','aid_without_repayment','mentor_near','different_path_mentor','same_sect_ally_near','three_allies_near','enemy_stronger','enemy_hp_below_30','same_path_manual','paid_resource_study','after_major_success_360d','after_escape_180d','fed_and_resting','exploration','at_ruin','prior_failure_same_gate']);
// Only current state or bounded committed records can prove a condition.
export function deriveConditions(e,context={}) {
 const p=e?.wanxiang,c=p?.cultivation||{},world=context.world,day=context.day??world?.day??0;
 const needs=name=>!context.needed||context.needed.has(name);
 const primary=((e.techniques||[]).some(k=>id(k)===c.primary)?MANUAL_INDEX.get(c.primary):null);
 const path=primary?.kind||(e.dao?.path?.key||e.dao);
 const target=MANUAL_INDEX.get(context.manualId);
 const progress=target?(c.learning?.[id(target)]??0):undefined;
 const home=e.birthOrigin?.villageId>0?world?.villageById?.(e.birthOrigin.villageId):null;
 const distance=home?Math.hypot(e.x-home.x,e.y-home.y):NaN;
 const journey=(needs('legal_journey')||needs('land_journey'))&&world?.transit?.journeys?.find(j=>j.actorId===e.id&&['active','blocked','landing'].includes(j.status));
 const near=(other,r=8)=>other&&other.hp>0&&Math.hypot(e.x-other.x,e.y-other.y)<=r;
 const relation=(other,type)=>e.relations?.get?.(other?.id)?.type===type;
 const peerConditions=['mentor_near','different_path_mentor','same_sect_ally_near','three_allies_near'];
 const measuring=workMetricsEnabled(world),peerEligible=peerConditions.some(needs);
 if(measuring){countWorkMetric(world,'conditions.calls');if(peerEligible){countWorkMetric(world,'conditions.peer.calls');maxWorkMetric(world,'conditions.peer.maxScan',world?.entities?.length||0);}}
 const indexedMentor=peerEligible?mentorLookup(world,e):null;
 if(measuring&&peerEligible&&!indexedMentor)countWorkMetric(world,'mentor.lookupFallbacks');
 let mentor=indexedMentor?.mentor,nearCount=0,allies=0;
 // Preserve Array.filter's original world order and sparse-array behavior. All
 // returned peer fields remain computed, even when needed requests only one.
 if(peerEligible){const list=world?.entities||[];for(let i=0;i<list.length;i++){
  if(!(i in list))continue;
  const other=list[i];if(measuring)countWorkMetric(world,'conditions.peer.entitiesVisited');
  if(other===e||!near(other))continue;
  nearCount++;
  if(!indexedMentor&&!mentor&&relation(other,'mentor'))mentor=other;
  if(e.faction&&other.faction===e.faction&&['fight','attack','mad'].includes(other.state))allies++;
 }}
 if(measuring){if(mentor)countWorkMetric(world,'conditions.peer.mentorHits');countWorkMetric(world,'conditions.peer.nearHits',nearCount);}
 const patient=context.target;
 const recent=(type,days)=>{const stamp=p?.experienceLedger?.recentFacts?.[type];if(Number.isFinite(stamp)&&day>=stamp&&day-stamp<days)return true;return (p?.experienceLedger?.records||[]).some(row=>row.type===type&&day>=row.day&&day-row.day<days);};
 const blocked=['yin_block','yang_block'].includes(p?.physique?.id)&&!(p.physique.stage>0);
 const result={
 social_sect_aid:context.paidAid===true&&!!patient&&!!e.faction&&e.faction===patient.faction,
 social_mentor_aid:context.paidAid===true&&!!patient&&['mentor','disciple'].some(type=>relation(patient,type)),
 social_junior_aid:context.paidAid===true&&!!patient&&patient.level<e.level,
 using_equipped_skill:!!context.skillId&&c.skills?.includes(context.skillId)===true,
 heal_ally:!!patient&&['comrade','lover','kin','disciple','mentor'].some(type=>relation(patient,type)),
 heal_junior:!!patient&&patient.level<e.level,
 heal_true_kin:!!patient&&relation(patient,'kin'),
 aid_without_repayment:!!patient&&context.paidAid===true&&!p?.bonds?.some(b=>b.targetKey===`${world?.plane||'mortal'}:${patient.id}`),
 mentor_near:!!mentor,different_path_mentor:!!mentor&&mentor.dao?.path?.key!==path,
 same_sect_ally_near:!!e.faction&&allies>0,
 three_allies_near:!!e.faction&&allies>=3,
 enemy_stronger:context.target?.hp>0&&context.target.level>e.level,
 enemy_hp_below_30:context.target?.maxHp>0&&context.target.hp/context.target.maxHp<.3,
 same_path_manual:!!target&&target.kind===path,
 paid_resource_study:context.paidStudy===true,
 after_major_success_360d:recent('breakthrough-success',360),
 after_escape_180d:recent('escaped',180),
 fed_and_resting:e.state==='rest'&&e.carried>0,
 exploration:needs('exploration')&&!!world?.wanxiang?.encounters?.some(scene=>scene.stage==='open'&&scene.participants.some(actor=>actor.actorId===e.id&&actor.stage==='travel')),
 at_ruin:needs('at_ruin')&&!!world?.sites?.some(site=>site.kind==='ruin'&&Math.hypot(e.x-site.x,e.y-site.y)<=1.5),
 always:true,hp_below_30:e.maxHp>0&&e.hp/e.maxHp<.3,hp_above_80:e.maxHp>0&&e.hp/e.maxHp>.8,mind_above_70:e.mind>70,pollution_above_40:e.pollution>40,
 first_manual:(e.techniques||[]).length===0,manual_progress_below_half:Number.isFinite(progress)&&progress<.5,manual_progress_above_half:Number.isFinite(progress)&&progress>.5,
 at_home_village:Number.isFinite(distance)&&distance<=3,away_from_home:Number.isFinite(distance)&&distance>3,
 prior_failure_same_gate:Number.isInteger(context.targetLevel)&&((p?.experienceLedger?.failedGates||[]).includes(context.targetLevel)||(p?.experienceLedger?.records||[]).some(r=>r.type==='breakthrough-failure'&&r.targetLevel===context.targetLevel&&r.day<=day)),
 sword_path:path==='sword',fire_path:path==='fire',yin_path:path==='yin',sword_manual:target?target.kind==='sword':context.sword_manual===true,alchemy_manual:target?target.kind==='alchemy':context.alchemy_manual===true,
 meridians_blocked:blocked,yin_meridians_open:p?.physique?.id==='yin_block'&&p.physique.stage>0&&path==='yin',yang_meridians_open:p?.physique?.id==='yang_block'&&p.physique.stage>0&&(path==='dual'||path==='yang'),legal_journey:!!journey,land_journey:!!journey&&journey.mode==='land'};
 if(observer)observer(e,context,result);return result;
}
