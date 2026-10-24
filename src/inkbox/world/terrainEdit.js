// Persistent terrain edits shared by Canvas, Three and world events.
import { clamp } from '../core/noise.js';
import { playerEditedCell } from '../sim/nature.js';

/** A height edit preserves the existing water surface; raising land above it exposes land. */
export function setHeight(world, i, value, { player = true } = {}) {
  const old = world.height[i];
  const next = Math.fround(clamp(value, 0, 1));
  if (next === old) return false;
  const ownedBase = player ? world.nature?.floods?.get(i)?.base : undefined;
  const initialWater = ownedBase ?? world.water[i];
  const surface = old + initialWater;
  if (player) playerEditedCell(world, i);
  world.height[i] = next;
  if (initialWater > 0 || ownedBase !== undefined)
    world.water[i] = initialWater > 0 ? Math.fround(Math.max(0, surface - next)) : 0;
  return true;
}

/** Explicit creation or drainage persists until another explicit operation changes it. */
export function setWater(world, i, value, { player = true } = {}) {
  const next = Math.fround(Math.max(0, value));
  if (next === world.water[i] && !(player && world.nature?.floods?.has(i))) return false;
  if (player) playerEditedCell(world, i);
  world.water[i] = next;
  return true;
}
