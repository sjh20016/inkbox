// A real combat consequence. The short-lived fire-colored hit FX is not evidence
// that terrain ignited; only a confirmed change to World.fire is.
import { SEA_LEVEL, SPECIES, TERRAIN } from '../core/config.js';
import { ignite } from './ecology.js';

export const FIRE_CAST_LEVEL = 10;
export const FIRE_CAST_COOLDOWN_DAYS = 90;
export const FIRE_CAST_CHANCE = 0.25;
export const FIRE_CAST_MAX_CELLS = 3;

const OFFSETS = Object.freeze([[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1],
  [1, 1], [-1, 1], [-1, -1], [1, -1]]);

/** Stable independent draw: save/reload cannot reroll an attempted day. */
export function combatIgnitionRoll(seed, actorId, targetId, day, salt = 0) {
  let h = 2166136261;
  for (const value of [seed, actorId, targetId, Math.floor(day), salt]) {
    h = Math.imul(h ^ (Number(value) >>> 0), 16777619);
    h ^= h >>> 16;
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/** These are the same live arrays that stepFire consumes on subsequent ticks. */
export function combustibleCombatCell(world, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !world?.inside?.(x, y)) return false;
  const i = world.idx(x, y);
  return !world.isWater(i) && world.height[i] >= SEA_LEVEL + 0.004
    && world.type[i] !== TERRAIN.LAVA && world.veg[i] >= 0.25 && world.moist[i] < 0.7
    && world.fire[i] <= 0.01;
}

/** Called only after Life.attack actually subtracts HP. No Life/ecology RNG draws. */
export function tryCombatIgnition(world, attacker, target, hit, hpBefore) {
  if (!world || (world.plane || 'mortal') !== 'mortal' || !attacker || !target
    || attacker.sp !== SPECIES.CULTIVATOR || attacker.level < FIRE_CAST_LEVEL
    || !attacker.root?.elements?.includes('火') || !(attacker.hp > 0)
    || !(hpBefore > 0) || !Number.isFinite(hit) || !(hit > 0)
    || !Number.isFinite(target.hp) || !(hpBefore - target.hp > 0)
    || !Number.isFinite(world.day) || world.day < 0
    || !Number.isSafeInteger(attacker.id) || attacker.id <= 0
    || !Number.isSafeInteger(target.id) || target.id <= 0 || attacker.id === target.id
    || !Number.isFinite(attacker.x) || !Number.isFinite(attacker.y)
    || !Number.isFinite(target.x) || !Number.isFinite(target.y)
    || Math.hypot(attacker.x - target.x, attacker.y - target.y) > 1.6
    || !Array.isArray(world.entities) || !world.entities.includes(attacker) || !world.entities.includes(target)) return null;

  const last = Number.isFinite(attacker.lastFireCastDay) ? attacker.lastFireCastDay : -1e9;
  if (world.day - last < FIRE_CAST_COOLDOWN_DAYS) return null;

  const cx = Math.round(target.x), cy = Math.round(target.y);
  const cells = OFFSETS.map(([dx, dy]) => ({ x: cx + dx, y: cy + dy }))
    .filter(cell => combustibleCombatCell(world, cell.x, cell.y));
  if (!cells.length) return null;

  // Charge the attempt before the draw, including failed draws. It is a World
  // entity field so a reload cannot buy another attempt at the same encounter.
  attacker.lastFireCastDay = world.day;
  if (combatIgnitionRoll(world.seed, attacker.id, target.id, world.day) >= FIRE_CAST_CHANCE) return null;

  const sizeRoll = combatIgnitionRoll(world.seed, attacker.id, target.id, world.day, 1);
  const limit = sizeRoll < 0.8 ? 1 : sizeRoll < 0.96 ? 2 : FIRE_CAST_MAX_CELLS;
  let ignited = 0, first = null;
  for (const cell of cells.slice(0, limit)) {
    const i = world.idx(cell.x, cell.y), before = world.fire[i];
    ignite(world, cell.x, cell.y, 0, 0);
    if (before <= 0.01 && world.fire[i] > 0.01) {
      ignited += 1;
      first ||= cell;
    }
  }
  if (!ignited) return null;

  const fact = { cells: ignited, x: first.x, y: first.y, plane: 'mortal',
    day: world.day, actorId: attacker.id, targetId: target.id };
  world.milestone(`【${attacker.name}】与【${target.name}】交手时余焰落地，在（${first.x}，${first.y}）点燃 ${ignited} 格。`,
    'combat-fire', attacker, fact);
  return fact;
}
