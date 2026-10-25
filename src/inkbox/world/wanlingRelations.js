// Pure relationship-derived identities shared by inspection and both renderers.
import { stableWanlingHash } from '../core/wanlingCatalog.js';
import { RELATION_TYPES } from '../sim/relations.js';

export function readBiyiPairs(world) {
  if (world?.plane && world.plane !== 'mortal') return [];
  const alive = (world?.entities || []).filter(e => e && e.hp > 0 && !e._ascended
    && Number.isFinite(e.x) && Number.isFinite(e.y));
  const byId = new Map(alive.map(e => [e.id, e]));
  const pairs = [];
  for (const a of alive) {
    if (!(a.relations instanceof Map)) continue;
    for (const [id, relation] of a.relations) {
      if (relation?.type !== RELATION_TYPES.LOVER || a.id >= Number(id)) continue;
      const b = byId.get(Number(id));
      if (!b || b.relations?.get(a.id)?.type !== RELATION_TYPES.LOVER
        || Math.hypot(a.x - b.x, a.y - b.y) > 3) continue;
      pairs.push({ id: `biyi:${a.id}:${b.id}`, identityContainer: 'biyi',
        facingId: stableWanlingHash(world.seed || 0, a.id, `biyi:${b.id}`),
        form: 'biyi', partners: [a.id, b.id], x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2 });
    }
  }
  pairs.sort((a, b) => a.partners[0] - b.partners[0] || a.partners[1] - b.partners[1]);
  return pairs.slice(0, 8);
}
