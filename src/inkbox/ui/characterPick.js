// Character-G0: 2D screen-space selection. Read-only and RNG-free.
// Use the same elevated coordinates as the Canvas entity renderer.
export function characterCandidatesAt(world, camera, sx, sy, radius = 19, limit = 6) {
  if (!world || !camera || !Number.isFinite(sx) || !Number.isFinite(sy)) return [];
  const hits = [];
  for (const e of world.entities || []) {
    if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.y) || !(e.hp > 0)) continue;
    const x = Math.max(0, Math.min(world.w - 1, Math.floor(e.x)));
    const y = Math.max(0, Math.min(world.h - 1, Math.floor(e.y)));
    const altitude = world.height[y * world.w + x] || 0;
    const [px, py] = camera.tileScreen(e.x, e.y, altitude);
    const dist = Math.hypot(px - sx, py - sy);
    if (dist <= radius) hits.push({ id: e.id, name: e.name || '无名', level: e.level || 0, dist });
  }
  hits.sort((a, b) => a.dist - b.dist || a.id - b.id);
  return hits.slice(0, limit);
}
