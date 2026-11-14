import { STORY_LIMITS, storyRefKey } from './storyFacts.js';

const cmp = (a,b) => a < b ? -1 : a > b ? 1 : 0;
export function compareStories(a,b) {
  return (b.importance || 0)-(a.importance || 0) || (b.relevance || 0)-(a.relevance || 0)
    || a.originDay-b.originDay || cmp(a.templateId,b.templateId) || cmp(a.key,b.key);
}
const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])]))
  : value;
const signature = value => JSON.stringify(canonical(value));

/** Bounded read-side selection. The budget never removes authoritative history. */
export function selectStories(input = [], { day = 0, limit = STORY_LIMITS.open + STORY_LIMITS.recent } = {}) {
  const stats = { candidates: input.length, invalid: 0, deduplicated: 0, cooldown: 0,
    perPerson: 0, capacity: 0, expiredUnproven: 0, selected: 0, open: 0, recent: 0 };
  const unique = new Map();
  for (const card of input) {
    if (!card?.key || !Number.isFinite(card.originDay) || !card.evidence?.some(e => ['A','B'].includes(e.grade))) { stats.invalid++; continue; }
    const prior = unique.get(card.key);
    if (prior) {
      stats.deduplicated++;
      if (signature(card) < signature(prior)) unique.set(card.key,card);
    } else unique.set(card.key,card);
  }
  const ordered = [...unique.values()].map(card => {
    if (card.status !== 'watching' || !(day-card.lastEvidenceDay > 3600)) return card;
    stats.expiredUnproven++;
    return { ...card, status:'unresolved', mode:'retelling', outcome:'expired_unproven',
      reason:'已长期没有保留的后续回执；到期只记未获确证，不判定行动完成。' };
  }).sort(compareStories);
  const cards = [], openPeople = new Set(), periods = new Map();
  const cap = Math.max(0,Math.min(STORY_LIMITS.open + STORY_LIMITS.recent,Number.isFinite(limit) ? Math.floor(limit) : STORY_LIMITS.open + STORY_LIMITS.recent));
  for (const card of ordered) {
    const subject = storyRefKey(card.subjectRef || card.actorRef) || card.key;
    const periodKey = `${card.templateId}:${subject}`;
    const periodsForSubject = periods.get(periodKey) || [];
    if (periodsForSubject.some(day => Math.abs(day-card.originDay) < STORY_LIMITS.cooldownDays)) { stats.cooldown++; continue; }
    const open = card.status === 'watching';
    const person = card.actorRef?.kind === 'person' ? storyRefKey(card.actorRef) : null;
    if (open && person && openPeople.has(person)) { stats.perPerson++; continue; }
    if (cards.length >= cap || (open ? stats.open >= STORY_LIMITS.open : stats.recent >= STORY_LIMITS.recent)) { stats.capacity++; continue; }
    cards.push(card); periodsForSubject.push(card.originDay); periods.set(periodKey,periodsForSubject);
    if (open) { stats.open++; if (person) openPeople.add(person); } else stats.recent++;
  }
  stats.selected = cards.length;
  return { cards, stats };
}
