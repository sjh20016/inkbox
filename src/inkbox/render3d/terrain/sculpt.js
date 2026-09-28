// The only render3d world write boundary. A stamp reads a stable neighbourhood.
export function sculpt(world, { x, y, radius = 6, strength = 0.035, mode = 'raise', targetHeight }) {
  if (![x, y, radius, strength].every(Number.isFinite) || radius <= 0 || strength < 0) throw new Error('Invalid brush');
  if (!['raise', 'lower', 'flatten', 'smooth'].includes(mode)) throw new Error('Unknown sculpt mode');
  if (mode === 'flatten' && !Number.isFinite(targetHeight)) throw new Error('Flatten requires a stroke target');
  const x0 = Math.max(0, Math.ceil(x - radius)), x1 = Math.min(world.w - 1, Math.floor(x + radius));
  const y0 = Math.max(0, Math.ceil(y - radius)), y1 = Math.min(world.h - 1, Math.floor(y + radius));
  const changes = [];
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const distance = Math.hypot(cx - x, cy - y);
    if (distance >= radius) continue;
    const i = cy * world.w + cx, old = world.height[i];
    const falloff = (1 - (distance / radius) ** 2) ** 2;
    let next;
    if (mode === 'raise' || mode === 'lower') next = old + (mode === 'raise' ? 1 : -1) * strength * falloff;
    else {
      let target = targetHeight;
      if (mode === 'smooth') {
        let sum = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && nx < world.w && ny >= 0 && ny < world.h) { sum += world.height[ny * world.w + nx]; count++; }
        }
        target = sum / count;
      }
      next = old + (target - old) * Math.min(1, strength * 8 * falloff);
    }
    next = Math.fround(Math.max(0, Math.min(1, next)));
    if (next !== old) changes.push([i, next, old]);
  }
  for (const [i, value] of changes) world.height[i] = value;
  if (!changes.length) return null;
  world.touch();
  return { x0, y0, x1, y1, count: changes.length, changes };
}

export function strokeSamples(from, to, radius) {
  const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / Math.max(0.5, radius * 0.25)));
  return Array.from({ length: count }, (_, i) => ({ x: from.x + (to.x - from.x) * (i + 1) / count, y: from.y + (to.y - from.y) * (i + 1) / count }));
}
