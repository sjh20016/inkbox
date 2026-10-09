// Player access progress only. Full World arrays and simulation remain unchanged.
import { TIME } from '../core/config.js';
import { accessBounds } from '../core/mapAccess.js';
export { accessBounds, canAccess } from '../core/mapAccess.js';

// Observation follows the existing world clock; it owns no extra clock or RNG.
const UNLOCK_DAYS = Object.freeze([1, 3, 6].map(years => years * TIME.daysPerYear));
const STAGE_PERCENT = Object.freeze([40, 60, 80, 100]);
const currentStage = world => Math.max(0, Math.min(3, Math.trunc(world.mapProgress?.stage) || 0));
const observedDays = world => Number.isFinite(world.day) ? Math.max(0, world.day) : 0;

/** Read-only UI summary. Reading progress never opens access or changes a World. */
export function mapProgressSummary(world) {
  const enabled = !!world.mapProgress;
  const stage = enabled ? currentStage(world) : 3;
  const days = observedDays(world);
  const nextUnlockDay = enabled && stage < 3 ? UNLOCK_DAYS[stage] : null;
  return { enabled, stage, percent: STAGE_PERCENT[stage], bounds: accessBounds(world),
    observedDays: days, nextUnlockDay,
    daysRemaining: nextUnlockDay === null ? 0 : Math.max(0, nextUnlockDay - days) };
}

/** Called after a successful simulation advance; manual openings never regress. */
export function updateMapProgress(world) {
  if (!world?.mapProgress) return false;
  const days = observedDays(world);
  const stage = Math.max(currentStage(world), UNLOCK_DAYS.filter(day => days >= day).length);
  if (stage === world.mapProgress.stage) return false;
  world.mapProgress = { version: 1, stage };
  return true;
}
export function createMapProgress(world, enabled = false) {
  if (enabled) world.mapProgress = { version: 1, stage: 0 };
  else delete world.mapProgress;
  return world.mapProgress;
}
export function expandMap(world, all = false) {
  if (!world.mapProgress) return false;
  const stage = all ? 3 : Math.min(3, currentStage(world) + 1);
  if (stage === world.mapProgress.stage) return false;
  world.mapProgress = { version: 1, stage };
  return true;
}
