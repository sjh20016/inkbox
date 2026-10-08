// Player access progress only. Full World arrays and simulation remain unchanged.
export { accessBounds, canAccess } from '../core/mapAccess.js';
export function createMapProgress(world, enabled = false) {
  if (enabled) world.mapProgress = { version: 1, stage: 0 };
  else delete world.mapProgress;
  return world.mapProgress;
}
export function expandMap(world, all = false) {
  if (!world.mapProgress) return false;
  const stage = all ? 3 : Math.min(3, world.mapProgress.stage + 1);
  if (stage === world.mapProgress.stage) return false;
  world.mapProgress = { version: 1, stage };
  return true;
}
