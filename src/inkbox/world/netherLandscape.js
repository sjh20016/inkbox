import { generateNetherWorld } from './worldgenNether.js';
import { classify, recomputeQi } from './terrain.js';

// Candidate only: old saves must continue to regenerate with the legacy generator.
export const NETHER_LANDSCAPE_VERSION = 'dn1-candidate-1';
export function generateNetherLandscape(options = {}, seedArg) {
  const opts = options.w ? { preset: options, seed: seedArg } : options;
  const world = generateNetherWorld(opts);
  const { w, h } = world;
  const phase = (world.seed >>> 0) / 4294967296 * Math.PI * 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, nx = x / (w - 1), ny = y / (h - 1);
    const river = 0.5 + 0.075 * Math.sin(nx * 6.3 + phase) + 0.025 * Math.sin(nx * 13 + phase * 1.7);
    const d = Math.abs(ny - river) * h;
    const spine = 0.19 + 0.045 * Math.sin(nx * 5 + phase * 0.7);
    const spine2 = 0.81 + 0.05 * Math.sin(nx * 4.5 + phase);
    const width = 0.055 + 0.015 * (0.5 + 0.5 * Math.sin(phase));
    const ridge = Math.max(Math.exp(-(((ny - spine) / width) ** 2)) * (0.45 + 0.55 * Math.sin(nx * 4.7 + phase) ** 2), Math.exp(-(((ny - spine2) / (width * 1.2)) ** 2)) * (0.4 + 0.6 * Math.sin(nx * 5.1 + phase + 1) ** 2));
    const peak = 0.72 + 0.28 * Math.sin(nx * 17 + phase) ** 2;
    const valley = Math.exp(-(((ny - (spine + 0.1)) / 0.045) ** 2));
    // Narrow tributaries join opposite banks while preserving broad land.
    const tx1 = 0.24 + 0.035 * Math.sin(ny * 8 + phase);
    const tx2 = 0.73 + 0.035 * Math.sin(ny * 7 + phase + 1);
    const tributary = ny < river ? Math.hypot((nx - tx1) * w, Math.max(0, 0.15 - ny) * h) : Math.hypot((nx - tx2) * w, Math.max(0, ny - 0.85) * h);
    const riverDistance = Math.min(d, tributary * 1.35);
    const bank = Math.min(1, Math.max(0, (riverDistance - 2) / 7));
    world.height[i] = riverDistance < 2 ? 0.27 : 0.312 + bank * (0.055 + 0.47 * ridge * peak - 0.035 * valley);
    world.water[i] = riverDistance < 2 ? 0.035 * (1 - riverDistance / 2) + 0.003 : 0;
    world.riverBase[i] = riverDistance < 2 ? 0.05 : 0;
    const near = Math.exp(-riverDistance / 12);
    world.veg[i] = Math.min(1, 0.12 + near * 0.55 + valley * 0.25);
    world.moist[i] = Math.min(1, 0.22 + near * 0.55 + valley * 0.15);
    world.temp[i] = Math.max(0.08, 0.26 - (world.height[i] - 0.3) * 0.35 + near * 0.05);
    world.over[i] = 0;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; world.type[i] = classify(world, x, y, i);
  }
  recomputeQi(world);
  return world;
}
