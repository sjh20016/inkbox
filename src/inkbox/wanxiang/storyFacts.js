// Read-side adapters only. No event subscription, random stream or saved state.
import { characterKey, parseCharacterKey, resolveCharacter } from '../g1/characterIdentity.js';

export const STORY_LIMITS = Object.freeze({ open: 24, recent: 96, perPerson: 1,
  evidence: 24, related: 8, cooldownDays: 360, personCards: 3 });
export const storyPlane = (world, plane = 'mortal') => plane === 'mortal' ? world : world?.[plane];
export const validStoryDay = day => Number.isFinite(day) && day >= 0;
const text = value => String(value ?? '').slice(0, 480);
const positive = n => Number.isSafeInteger(n) && n > 0;
export const personIdentitySince = entity => validStoryDay(entity?.possessedBy?.day) ? entity.possessedBy.day : null;

export function personRef(plane, entity) {
  if (!entity || !characterKey(plane, entity.id)) return null;
  return { kind: 'person', plane, id: entity.id,
    incarnation: positive(entity.incarnation) ? entity.incarnation : 1, identitySince:personIdentitySince(entity) };
}
export function storyRefKey(ref) {
  if (!ref || !['mortal','upper','nether'].includes(ref.plane) || !positive(ref.id)) return null;
  if (!['person','site','artifact','settlement','settlement-ruin','faction'].includes(ref.kind)) return null;
  return `${ref.kind}:${ref.plane}:${ref.id}${ref.kind === 'person' ? `:${ref.incarnation ?? 'unknown'}:${ref.identitySince ?? 'native'}` : ''}`;
}

/** A name never resolves an identity. Missing incarnation proof disables a jump. */
export function storyPerson(world, ref) {
  const key = ref && characterKey(ref.plane, ref.id);
  const missing = { ref, entity: null, sourceWorld: storyPlane(world, ref?.plane),
    status: 'unknown', available: false, label: '身份未可考', reason: '正式身份记录不足' };
  if (!key) return missing;
  const r = resolveCharacter(world, key);
  if (!r.ok) return { ...missing, reason: '对应位面或身份已不可考' };
  const e = r.entity;
  if (!e) return { ...missing, status: r.status };
  if ((ref.identitySince ?? null) !== personIdentitySince(e))
    return { ...missing, status:'identity-unproven',reason:'原身体已换主，不能将旧引用连到当前人物' };
  const expected = ref.incarnation;
  // Dead snapshots deliberately do not preserve incarnation. They can attest
  // death of this ID, but cannot authorize a jump to a new body.
  if (expected != null && (e.incarnation == null ? expected !== 1 || r.status === 'dead'
    : e.incarnation !== expected)) return { ...missing, status: 'identity-unproven', reason: '本世身份无法与此来源核对' };
  const alive = e.hp > 0 && !e._ascended && r.accessible === true;
  const labels = {alive:'在世',dead:'已离世',ascended:'已飞升',nether:'已入幽冥',unknown:'去向未可考'};
  const currentPlane = r.currentPlane || r.plane;
  return { ref: { ...ref }, currentRef: personRef(currentPlane, e), key,
    entity: e, sourceWorld: r.sourceWorld, status: r.status,
    available: alive, label: `${e.name || '无名'} · ${labels[r.status] || '身份未可考'}`,
    reason: alive ? '' : labels[r.status] || '当前不能定位' };
}

/** Makes a bounded presentation reference, never an authoritative fact. */
export function evidence(source, key, day, type, description, grade = 'B', detail = {}) {
  if (!validStoryDay(day) || typeof key !== 'string' || !key || !['A','B','C','D'].includes(grade)) return null;
  return { ...detail, source: text(source), key: text(key), day, type: text(type), text: text(description), grade };
}

export function createStory(templateId, subjectRef, origin, fields = {}) {
  const identity = storyRefKey(subjectRef);
  if (!identity || !origin || !['A','B'].includes(origin.grade)) return null;
  const sources = [...new Map([origin, ...(fields.evidence || [])].filter(Boolean)
    .filter(e => validStoryDay(e.day) && typeof e.key === 'string')
    .map(e => [e.key, e])).values()].sort((a,b) => a.day-b.day || a.key.localeCompare(b.key)).slice(0, STORY_LIMITS.evidence);
  const keys = new Set(sources.map(e => e.key));
  const nodes = (fields.nodes || sources.map(e => ({day:e.day,text:e.text,evidenceKey:e.key})))
    .filter(n => keys.has(n.evidenceKey) && validStoryDay(n.day))
    .sort((a,b) => a.day-b.day || a.evidenceKey.localeCompare(b.evidenceKey)).slice(0, STORY_LIMITS.evidence);
  return { key: `${templateId}:${identity}:${encodeURIComponent(origin.key)}`,
    templateId, subjectRef: { ...subjectRef }, title: text(fields.title || templateId),
    mode: fields.mode === 'watch_hook' ? 'watch_hook' : 'retelling',
    status: ['watching','resolved','interrupted','unresolved'].includes(fields.status) ? fields.status : 'unresolved',
    summary: text(fields.summary), reason: text(fields.reason), outcome: text(fields.outcome),
    originDay: origin.day, lastEvidenceDay: Math.max(origin.day, ...sources.map(e => e.day)),
    actorRef: fields.actorRef || (subjectRef.kind === 'person' ? { ...subjectRef } : null),
    related: (fields.related || []).filter(Boolean).slice(0, STORY_LIMITS.related),
    evidence: sources, nodes, importance: Number.isFinite(fields.importance) ? fields.importance : 0,
    relevance: Number.isFinite(fields.relevance) ? fields.relevance : 0,
    presentationVersion: 1 };
}

export function personKeyRef(key) {
  const p = parseCharacterKey(key);
  return p ? { kind: 'person', plane: p.plane, id: p.id } : null;
}
