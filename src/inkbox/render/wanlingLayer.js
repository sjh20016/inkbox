// Read-only 万灵 presentation shared by Canvas and 3D.
import { WANLING_BY_KEY, stableWanlingHash } from '../core/wanlingCatalog.js';
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

export function drawWanling(ctx, camera, world, time = 0) {
  if (!world || (world.plane && world.plane !== 'mortal')) return;
  const rect = camera.visibleRect(world);
  const units = [...(world.wanling?.units || []), ...readBiyiPairs(world)];
  const zoom = camera.zoom;
  for (const unit of units) {
    if (unit.hp !== undefined && (unit.hp <= 0 || unit.state === 'dissipated')) continue;
    if (!Number.isFinite(unit.x) || !Number.isFinite(unit.y)
      || unit.x < rect.x0 || unit.x > rect.x1 || unit.y < rect.y0 || unit.y > rect.y1
      || (camera.canAccess && !camera.canAccess(unit.x, unit.y))) continue;
    const info = WANLING_BY_KEY.get(unit.form);
    if (!info) continue;
    const height = world.height?.[world.idx(Math.floor(unit.x), Math.floor(unit.y))] || 0;
    const sx = camera.toScreenX(unit.x);
    const sy = camera.toScreenY(unit.y - (camera.relief ? height * (camera.reliefScale || 10) : 0));
    const size = Math.max(3, Math.min(15, zoom * 0.8));
    const disguised = unit.form === 'jiuweihu' && unit.mask === 'human';
    ctx.save();
    ctx.fillStyle = disguised ? '#907d6d' : info.category === 'spirit' ? '#588a78' : info.category === 'herd' ? '#79694e' : '#776052';
    ctx.strokeStyle = '#302c27';
    ctx.lineWidth = Math.max(0.8, size * 0.12);
    ctx.beginPath();
    if (disguised) {
      ctx.arc(sx, sy - size * 1.05, size * .28, 0, Math.PI * 2);
      ctx.rect(sx - size * .28, sy - size * .73, size * .56, size * .82);
      ctx.rect(sx - size * .24, sy, size * .17, size * .45);
      ctx.rect(sx + size * .07, sy, size * .17, size * .45);
    } else if (unit.form === 'biyi') {
      ctx.ellipse(sx - size * .28, sy - size * .4, size * .4, size * .2, -.5, 0, Math.PI * 2);
      ctx.ellipse(sx + size * .28, sy - size * .4, size * .4, size * .2, .5, 0, Math.PI * 2);
    } else if (info.category === 'spirit') {
      ctx.moveTo(sx, sy - size * 1.1);
      ctx.lineTo(sx + size * .65, sy - size * .3);
      ctx.lineTo(sx, sy + size * .15);
      ctx.lineTo(sx - size * .65, sy - size * .3);
      ctx.closePath();
    } else {
      ctx.ellipse(sx, sy - size * .45, size * .8, size * .42, 0, 0, Math.PI * 2);
    }
    ctx.fill(); ctx.stroke();
    if (zoom >= 2.2) {
      ctx.fillStyle = '#f0e5cb';
      ctx.font = `${Math.max(9, Math.round(size * .95))}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText(disguised ? '隐' : info.glyph, sx, sy - size * .2);
    }
    if (unit.count > 1) {
      ctx.fillStyle = '#302c27';
      ctx.font = `${Math.max(9, Math.round(size * .9))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`×${unit.count}`, sx + size, sy - size);
    }
    ctx.restore();
  }
}
