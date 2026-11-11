// Read-only labels. Missing context is not proof that a mechanism has failed.
export function mechanismState(row) {
 if(['已失效','潜隐','休眠','当前休眠'].includes(row.status))return '当前休眠';
 if(row.status==='机制尚未实现')return row.status;
 if(row.status==='数值条件已证实')return row.checks?.length?'当前条件已满足':'常驻生效';
 return '需等实际行动才能判定';
}
const FACTS={'meridian-open':'经脉自然贯通','risk-resolved':'险中有定','aid-bond':'受恩未忘','healed':'真实援助与疗伤','gate-aid':'付费护关','site-success':'洞府机缘结算','site-failure':'探府失利','breakthrough-success':'修行破境','breakthrough-failure':'破境受挫','escaped':'真实脱战','combat-victory':'斗法获胜','manual-learned':'学成真实功法','artifact-found':'取得原物'};
export const factTitle = type => FACTS[type]||type;
export const provenance = event => (event.kind==='natural'||event.kind==='natural-choice')?'自然因果':event.mode==='decree'?'天道敕改':event.mode==='player'?'常规改命':event.source||'自然因果';

export const worldDay = value => Number.isFinite(value)?String(Math.floor(value)):'未载';
export function interactionCost(cost) {
 if(cost==null)return '未载';
 if(typeof cost==='string')return cost;
 const amount=Number.isFinite(cost.amount)?String(Math.round(cost.amount*1000)/1000):'未载';
 if(cost.kind==='sect-spirit-stone')return `宗门灵石 ${amount}`;
 if(cost.kind==='actor-hp')return `自身气血 ${amount}`;
 return cost.paid===true?'已支付实际代价':'代价明细未载';
}
const FIELD_NAMES={root:'灵根',physique:'体质',bloodlines:'血脉',hexagram:'本命卦',attributes:'基础禀赋',personality:'性格',hobbies:'杂趣',states:'状态',traits:'经历特质',bonds:'因缘',daoSeed:'道种',cultivation:'修持配置',bone:'根骨',comprehension:'悟性',perception:'神识',elements:'元素',purity:'纯度',natural:'天然',heavenly:'天赐',stage:'阶段',grade:'血阶',latent:'潜隐',stable:'稳定',inheritable:'可传承',source:'来源',startDay:'起始日',expiresDay:'到期日',treatments:'治疗次数',lastTreatmentDay:'上次治疗日',paid:'已付费'};
export const fieldTitle = field => FIELD_NAMES[field]||'人物状态';
export function catalogValue(value,catalog={}) {
 if(value==null)return '无';
 if(Array.isArray(value))return value.map(v=>catalogValue(v,catalog)).join('、')||'无';
 if(typeof value==='boolean')return value?'是':'否';
 if(typeof value==='number')return Number.isInteger(value)?String(value):String(Math.round(value*1000)/1000);
 if(typeof value==='string'){const entry=Object.values(catalog).flat().find(row=>row?.id===value);return entry?.name||({metal:'金',wood:'木',water:'水',fire:'火',earth:'土'}[value])||value;}
 const name=value.name||catalogValue(value.id,catalog);
 if(value.id)return `${name}${value.stage!=null?' · 阶段 '+value.stage:''}${value.grade!=null?' · 血阶 '+value.grade:''}${value.latent?' · 潜隐':''}${value.inheritable?' · 可传承':''}`;
 return Object.entries(value).map(([key,v])=>`${fieldTitle(key)}：${key.endsWith('Day')?worldDay(v):catalogValue(v,catalog)}`).join(' · ');
}
export function operationTitle(op,catalog={}) {
 if(op.op!=='decree')return `${fieldTitle(op.field)}：${catalogValue(op.value??op.id,catalog)}`;
 const object=catalogValue(op.id,catalog);
 if(op.action==='open_meridians')return '天道敕令开脉';
 if(op.action==='set_physique_stage')return `天道调整体质阶段：${op.stage}`;
 if(op.action==='remove_state')return `天道洗去状态：${object}`;
 if(op.action==='grant_bloodline')return `天道敕赐血脉：${object} · 血阶 ${op.grade??1} · 纯度 ${op.purity??50}`;
 if(op.action==='set_bloodline_visibility')return `天道${op.latent?'潜隐':'显化'}血脉：${object}`;
 return '天道敕改';
}
