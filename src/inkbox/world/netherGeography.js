import { slopeAt } from './terrain.js';
export const NETHER_REGIONS = Object.freeze({
  river: Object.freeze({ label: '黄泉河川', sceneryKinds: ['lamp', 'deadtree', 'remnant'], density: 0.65, mistStrength: 0.35 }),
  ridge: Object.freeze({ label: '墨骨山岭', sceneryKinds: ['pillar', 'deadtree'], density: 0.35, mistStrength: 0.15 }),
  waste: Object.freeze({ label: '荒魂原野', sceneryKinds: ['deadtree'], density: 0.1, mistStrength: 0.05 }),
  tomb: Object.freeze({ label: '断碑古冢', sceneryKinds: ['tombs', 'ruin', 'remnant'], density: 0.4, mistStrength: 0.2, decorative: true }),
  valley: Object.freeze({ label: '阴雾深谷', sceneryKinds: ['lamp', 'deadtree'], density: 0.3, mistStrength: 0.75 }),
});
const BANK_OFFSETS = [];
for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
  const distance = Math.hypot(dx, dy);
  if (distance <= 5 && distance > 0) BANK_OFFSETS.push({ dx, dy, distance });
}
BANK_OFFSETS.sort((a, b) => a.distance - b.distance);
export function sampleNetherGeography(world, x, y) {
  x = Math.max(0, Math.min(world.w - 1, Math.floor(x)));
  y = Math.max(0, Math.min(world.h - 1, Math.floor(y)));
  const i = y * world.w + x, height = world.height[i], water = world.water[i], yin = world.veg[i];
  const slope = slopeAt(world, x, y);
  let bankDistance = water > 0.0015 ? 0 : Infinity;
  if (bankDistance !== 0) for (const { dx, dy, distance } of BANK_OFFSETS) {
    const xx = x + dx, yy = y + dy;
    if (xx >= 0 && xx < world.w && yy >= 0 && yy < world.h && world.water[yy * world.w + xx] > 0.0015) { bankDistance = distance; break; }
  }
  const kind = bankDistance <= 4 ? 'river' : height > 0.57 || slope > 0.035 ? 'ridge' : yin > 0.31 && height < 0.39 ? 'valley' : height > 0.4 && height < 0.5 && yin < 0.25 ? 'tomb' : 'waste';
  return { kind, height, slope, yin, water, bankDistance, type: world.type[i] };
}
export const deriveNetherRegion = sampleNetherGeography;
