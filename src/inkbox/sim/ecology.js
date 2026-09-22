// 水墨沙盒 · 生态：植被生长、野火、灾害痕迹消退

import { SEA_LEVEL, TERRAIN } from '../core/config.js';
import { clamp } from '../core/noise.js';
import { OVER, decayOverlay, recomputeRect, markDirty, flushDirty } from '../world/terrain.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

const GROWABLE = new Set([
  TERRAIN.GRASS, TERRAIN.MEADOW, TERRAIN.FOREST, TERRAIN.JUNGLE,
  TERRAIN.SAVANNA, TERRAIN.SWAMP, TERRAIN.ASH, TERRAIN.SCORCHED,
]);

/** 植被：湿润温暖处向 1 生长，干旱寒冷处衰退；玩家烧过的地会先长草再成林 */
export function stepVegetation(world, dtDays, rng) {
  const { w, h, veg, moist, temp, height, over, type } = world;
  const rate = clamp(dtDays * 0.0022, 0, 0.05);
  let touched = 0;
  const dirty = [];

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (height[i] < SEA_LEVEL + 0.004) {
        if (veg[i] !== 0) veg[i] = 0;
        continue;
      }
      const t = type[i];
      if (t === TERRAIN.ROCK || t === TERRAIN.MOUNTAIN || t === TERRAIN.PEAK || t === TERRAIN.SNOW || t === TERRAIN.LAVA) {
        veg[i] = Math.max(0, veg[i] - rate * 2);
        continue;
      }
      if (world.fire[i] > 0.05) continue;

      const suitability = clamp(
        (moist[i] - 0.12) * 1.6
        * (1 - Math.max(0, height[i] - 0.62) * 2.2)
        * (1 - Math.max(0, 0.32 - temp[i]) * 1.8),
        0, 1,
      );
      const target = suitability;
      const current = veg[i];
      const step = rate * (target > current ? 1 : 0.45);
      const next = current + (target - current) * step;
      if (Math.abs(next - current) > 0.004) {
        veg[i] = clamp(next, 0, 1);
        touched += 1;
        // 焦土长草：植被回到一定密度后，覆盖层自动褪去
        if (over[i] === OVER.SCORCHED && veg[i] > 0.35) {
          over[i] = OVER.NONE;
          dirty.push(x, y);
        }
      }
    }
  }

  for (let k = 0; k < dirty.length; k += 2) {
    recomputeRect(world, dirty[k], dirty[k + 1], dirty[k], dirty[k + 1]);
  }
  if (touched > 0) world.touch();
  return touched;
}

/** 野火：火从可燃格向邻格蔓延，烧完留下焦土 */
export function stepFire(world, dtDays, rng) {
  const { w, h, veg, fire, moist, over, height } = world;
  const spread = clamp(dtDays * 0.09, 0, 0.5);
  const burn = clamp(dtDays * 0.16, 0, 0.6);
  const next = world._fireNext && world._fireNext.length === world.size
    ? world._fireNext
    : (world._fireNext = new Float32Array(world.size));
  next.set(fire);

  let active = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const f = fire[i];
      if (f <= 0.01) continue;
      active += 1;

      // 燃烧消耗植被
      const fuel = veg[i];
      if (fuel > 0.02) {
        const consumed = Math.min(fuel, burn * (0.4 + f));
        veg[i] = fuel - consumed;
        if (over[i] !== OVER.SCORCHED) {
          over[i] = OVER.SCORCHED;
          markDirty(world, i);
        }
        next[i] = Math.min(1, f + consumed * 0.5);
      } else {
        next[i] = Math.max(0, f - burn * 0.7);
      }

      // 向邻格蔓延：湿度、植被决定成功率
      if (f < 0.12) continue;
      for (let d = 0; d < 8; d += 1) {
        const nx = x + DIRS[d][0];
        const ny = y + DIRS[d][1];
        const ni = ny * w + nx;
        if (height[ni] < SEA_LEVEL + 0.004) continue;
        if (world.type[ni] === TERRAIN.LAVA) continue;
        if (world.water[ni] > 0.004) continue;
        const neighbourFuel = veg[ni];
        if (neighbourFuel < 0.18) continue;
        const dryness = 1 - clamp(moist[ni] * 1.15, 0, 1);
        const chance = spread * (d > 3 ? 0.45 : 1) * (0.25 + dryness) * (0.4 + neighbourFuel);
        if (rng() < chance) {
          next[ni] = Math.max(next[ni], 0.25 + rng() * 0.35);
        }
      }
    }
  }

  for (let i = 0; i < world.size; i += 1) fire[i] = next[i];
  if (active > 0) world.touch();
  return active;
}

/** 点燃一片区域 */
export function ignite(world, x, y, radius = 2, power = 1) {
  const r2 = radius * radius;
  let lit = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > r2) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (!world.inside(tx, ty)) continue;
      const i = world.idx(tx, ty);
      if (world.water[i] > 0.02) continue;
      world.fire[i] = Math.min(1, 0.45 + power * 0.4);
      lit += 1;
    }
  }
  if (lit) world.touch();
  return lit;
}

/** 熄灭一片区域（降雨 / 神意） */
export function extinguish(world, x, y, radius = 3) {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > r2) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (!world.inside(tx, ty)) continue;
      const i = world.idx(tx, ty);
      world.fire[i] = 0;
    }
  }
  world.touch();
}

export { decayOverlay };
