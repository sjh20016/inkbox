import { SEA_LEVEL } from '../../core/config.js';

// Pure presentation mapping; no simulation threshold changes.
export function visualElevation(height) {
  const d = height - SEA_LEVEL;
  return d * 38 + Math.max(0, d) ** 2 * 38;
}

// Matches the terrain's a,c,b / b,c,d triangulation exactly.
export function surfaceElevation(world, x, y) {
  x = Math.max(0, Math.min(world.w - 1, x));
  y = Math.max(0, Math.min(world.h - 1, y));
  const ix = Math.min(world.w - 2, Math.floor(x)), iy = Math.min(world.h - 2, Math.floor(y));
  const u = x - ix, v = y - iy, i = iy * world.w + ix;
  // Match Float32 position attributes before interpolation, especially at silhouettes.
  const a = Math.fround(visualElevation(world.height[i])), b = Math.fround(visualElevation(world.height[i + 1]));
  const c = Math.fround(visualElevation(world.height[i + world.w])), d = Math.fround(visualElevation(world.height[i + world.w + 1]));
  return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
}
