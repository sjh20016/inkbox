import { isAdult, isHumanPerson } from '../core/demographics.js';

/** Durable origin snapshots outlive the bounded personal log and parent entities. */
export function personBirthOriginText(entity) {
  const origin = entity?.birthOrigin;
  if (!origin || typeof origin !== 'object') return '不可考（无出生来历快照）';
  const kind = { village: '凡间自然出生', 'upper-village': '上界自然出生',
    genesis: '开世人群', placed: '由神力安置', fixture: '开发夹具（非自然出生）' }[origin.kind];
  if (typeof kind !== 'string') return '不可考（来源类型未记明）';
  const place = typeof origin.villageName === 'string' && origin.villageName ? ` · ${origin.villageName}` : '';
  const parents = Array.isArray(origin.parentNames) ? origin.parentNames.filter(name => typeof name === 'string' && name) : [];
  const family = ['village', 'upper-village'].includes(origin.kind)
    ? ` · 双亲 ${parents.length ? parents.join('、') : '不可考'}` : '';
  return `${kind}${place}${family}`;
}

/** Presentation of current stored facts; never infer longevity from a realm label. */
export function personLifeFacts(entity) {
  if (!isHumanPerson(entity)) return null;
  const ageText = Number.isFinite(entity.age) ? `${Math.floor(entity.age / 360)} 岁` : '实岁不可考';
  const lifespanText = Number.isFinite(entity.lifespan) && entity.lifespan >= 0
    ? `寿元上限 ${Number((entity.lifespan / 360).toFixed(1))} 年` : '寿元上限不可考';
  const adulthood = Number.isFinite(entity.age) ? isAdult(entity) ? '成年（满十八岁）' : '未成年' : '不可考';
  const identity = entity.pastLife ? '转世身份 · 前世记忆不等于今世修为'
    : entity.sp === 'cultivator' && !(entity.level > 0) ? '修士身份 · 尚未实际入门' : null;
  return { ageText, lifespanText, adulthood, identity };
}

export function personLifeRows(entity) {
  const facts = personLifeFacts(entity);
  return facts ? [['年龄', `${facts.ageText}（实岁）`], ['当前寿元', facts.lifespanText], ['成年', facts.adulthood],
    ...(!(entity.level > 0) ? [['修行', '未实际入门 · 凡人修为']] : []),
    ...(facts.identity ? [['身份', facts.identity]] : [])] : [];
}
