// Read-only access policy shared by Canvas and 3D; never advances or mutates World.
const STAGE_FRACTIONS = [0.4, 0.6, 0.8, 1];
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
