// Player access progress only. Full World arrays and simulation remain unchanged.
const STAGE_FRACTIONS = [0.4, 0.6, 0.8, 1];
export function createMapProgress(world, enabled = false) {
  if (enabled) world.mapProgress = { version: 1, stage: 0 };
  else delete world.mapProgress;
  return world.mapProgress;
}
export function accessBounds(world) {
  const stage = world.mapProgress ? Math.max(0, Math.min(3, Math.trunc(world.mapProgress.stage) || 0)) : 3;
  const fraction = STAGE_FRACTIONS[stage];
  const width = Math.max(1, Math.ceil(world.w * fraction)), height = Math.max(1, Math.ceil(world.h * fraction));
  const x0 = Math.floor((world.w - width) / 2), y0 = Math.floor((world.h - height) / 2);
  return { x0, y0, x1: x0 + width - 1, y1: y0 + height - 1 };
}
export function canAccess(world, x, y) {
  const bounds = accessBounds(world);
  return Number.isFinite(x) && Number.isFinite(y) && x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1;
}
export function expandMap(world, all = false) {
  if (!world.mapProgress) return false;
  const stage = all ? 3 : Math.min(3, world.mapProgress.stage + 1);
  if (stage === world.mapProgress.stage) return false;
  world.mapProgress = { version: 1, stage };
  return true;
}
