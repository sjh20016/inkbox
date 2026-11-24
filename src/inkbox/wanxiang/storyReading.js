// Only explicit player queries call these projections. No simulation scheduling.
import { canAccess } from '../core/mapAccess.js';
import { parseCharacterKey, resolveCharacter } from '../g1/characterIdentity.js';
import { STORY_LIMITS, personRef, personIdentitySince, storyPerson, storyPlane, storyRefKey } from './storyFacts.js';
import { selectStories } from './storySelection.js';
import { personStoryCandidates } from './storyPeople.js';
import { worldObjectStoryCandidates } from './storyWorld.js';

export const STORY_COVERAGE = '仅编排正式保留记录；人物经历、原物履历及地方沿革都有容量上限。缺少来源时不推测行动、旧主、重建者或结局。';
const planes = ['mortal','upper','nether'];
const copy = value => structuredClone(value);

/** Revalidate every jump against the current world, including visibility. */
export function resolveStoryRef(world, ref) {
  if (!storyRefKey(ref)) return { ref, available:false, label:'引用未可考', reason:'缺少稳定身份' };
  if (ref.kind === 'person') {
    if (!Number.isSafeInteger(ref.incarnation) || ref.incarnation < 1)
      return { ref, available:false, label:ref.label || `${ref.plane}:${ref.id}`, reason:ref.reason || '历史未保留对方本世身份，不能授权定位' };
    return storyPerson(world,ref);
  }
  const w = storyPlane(world,ref.plane);
  if (!w) return { ref, available:false, label:'位面未可考', reason:'对应位面没有保留' };
  let entity, kind = ref.kind;
  if (kind === 'artifact') {
    const found = planes.flatMap(plane => {
      const pw = storyPlane(world,plane);
      return [...(pw?.artifacts || []),...(pw?.entities || []).flatMap(e => e.artifacts || [])]
        .filter(a => a && typeof a === 'object' && a.id === ref.id).map(a => ({ plane,entity:a }));
    });
    const unique = [...new Map(found.map(row => [row.entity,row])).values()];
    if (unique.length !== 1) return { ref, available:false, label:'原物已不可考', reason:unique.length ? '原物归属记录不唯一' : '原物已不在现存目录，无法判定是否朽坏' };
    if (unique[0].plane !== ref.plane) return { ref, available:false, label:'原物已跨界', reason:'原位面记录已过时；保留历史引用' };
    entity = unique[0].entity;
    if (entity.ownerId > 0) {
      const holder = w.entities?.find(e => e.id === entity.ownerId && e.hp > 0 && e.artifacts?.some(a => a?.id === entity.id));
      if (!holder) return { ref, entity, available:false, label:entity.name || '旧物', reason:'当前持有人记录无法核对' };
      const accessible = canAccess(world,holder.x,holder.y);
      return { ref, entity, available:accessible, label:entity.name || '旧物', reason:accessible ? '' : '持有人位于未开放区域',
        currentRef:personRef(ref.plane,holder), x:holder.x, y:holder.y };
    }
  } else if (kind === 'site') entity = w.sites?.find(s => s.id === ref.id);
  else if (kind === 'settlement') entity = w.villages?.find(v => v.id === ref.id && v.hp > 0);
  else if (kind === 'settlement-ruin') entity = w.settlementRuins?.find(v => v.id === ref.id);
  else if (kind === 'faction') entity = w.factions?.find(f => f.id === ref.id && !(f.destroyedDay >= 0));
  if (!entity) return { ref, available:false, label:'已消散或失考', reason:'原身份不在现存记录；不按同名替换' };
  const x = kind === 'faction' ? entity.capitalX : entity.x, y = kind === 'faction' ? entity.capitalY : entity.y;
  const accessible = Number.isFinite(x) && Number.isFinite(y) && canAccess(world,x,y);
  return { ref, entity, x,y, available:accessible, label:entity.name || `${kind} #${ref.id}`,
    reason:accessible ? '' : '位置不在当前开放区域' };
}

function present(world, candidates, options = {}) {
  const result = selectStories(candidates.cards || [],{day:world?.day || 0,...options});
  const cards = result.cards.map(card => ({ ...copy(card), related:(card.related || []).slice(0,STORY_LIMITS.related).map(ref => {
    const r = resolveStoryRef(world,ref);
    return { ...copy(ref), label:r.label, available:r.available === true && ref.available !== false, reason:ref.available === false ? ref.reason || r.reason || '' : r.reason || '' };
  }) }));
  return { cards, day:world?.day || 0, coverage:STORY_COVERAGE + (!cards.length && candidates.stats?.reason ? ` ${candidates.stats.reason}` : ''),
    stats:{ ...result.stats, facts:candidates.stats || {} } };
}

export function readPersonStories(world, refOrKey, options = {}) {
  let ref = refOrKey;
  if (typeof refOrKey === 'string') {
    const parsed = parseCharacterKey(refOrKey);
    const r = parsed && resolveCharacter(world,refOrKey);
    ref = r?.entity ? {kind:'person',plane:parsed.plane,id:parsed.id,incarnation:r.entity.incarnation ?? 1,identitySince:personIdentitySince(r.entity)} : null;
  }
  if (!ref || ref.kind !== 'person') return present(world,{cards:[],stats:{rejectedIdentity:1}},options);
  const r = storyPerson(world,ref);
  if (!r.entity) return present(world,{cards:[],stats:{rejectedIdentity:1,reason:r.reason || '本世来源已不在保留记录中'}},options);
  const result = personStoryCandidates(world,ref);
  // The formal carried inventory is at most three. No world-wide story query.
  for (const a of r.entity.artifacts || []) if (a && typeof a === 'object') {
    const projection = worldObjectStoryCandidates(world,{kind:'artifact',plane:r.currentRef?.plane || ref.plane,id:a.id});
    result.cards.push(...projection.cards);
  }
  return present(world,result,{limit:STORY_LIMITS.personCards,...options});
}
export function readObjectStories(world, ref, options = {}) {
  return present(world,worldObjectStoryCandidates(world,ref),options);
}

/** Manual research/export only; the production HUD never calls a world query. */
export function readWorldStories(world, options = {}) {
  const candidates = [], stats = { people:0,objects:0,byType:{} };
  const add = result => {
    candidates.push(...result.cards);
    for (const [key,value] of Object.entries(result.stats || {})) if (typeof value === 'number') stats.byType[key]=(stats.byType[key] || 0)+value;
  };
  for (const plane of planes) {
    const w = storyPlane(world,plane); if (!w) continue;
    for (const e of w.entities || []) if (e.wanxiang) { stats.people++; add(personStoryCandidates(world,personRef(plane,e))); }
    const seen = new Set();
    for (const a of [...(w.artifacts || []),...(w.entities || []).flatMap(e => e.artifacts || [])]) {
      if (!a?.id || seen.has(a.id)) continue; seen.add(a.id); stats.objects++;
      add(worldObjectStoryCandidates(world,{kind:'artifact',plane,id:a.id}));
    }
    for (const [kind,objects] of [['settlement',w.villages],['settlement-ruin',w.settlementRuins]]) {
      for (const object of objects || []) { stats.objects++; add(worldObjectStoryCandidates(world,{kind,plane,id:object.id})); }
    }
  }
  return present(world,{cards:candidates,stats},options);
}
