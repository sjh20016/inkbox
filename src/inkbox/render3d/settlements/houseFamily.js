import { hashString } from '../../core/noise.js';

export const MORTAL_HOUSE_ASSET_IDS = Object.freeze([
  'mortal.house.base', 'mortal.house.small', 'mortal.house.courtyard', 'mortal.house.hall',
]);
const SIZES = Object.freeze({
  base: Object.freeze({ width: 1, height: 1, depth: 1, roof: 'gable' }),
  small: Object.freeze({ width: .86, height: .78, depth: .86, roof: 'thatch' }),
  courtyard: Object.freeze({ width: 1, height: .90, depth: 1, roof: 'hip' }),
});

/** Coherent village rows and permanent radial bands; no mutable level/neighbour input. */
export function houseFamilyFor(seed, village, x, y) {
  const plan = hashString(`${seed >>> 0}|village:${String(village.id)}|${village.x},${village.y}`);
  const quarter = plan & 1, dx = x - village.x, dy = y - village.y;
  const row = Math.floor((quarter ? dx : dy) / 2), phase = (plan >>> 1) % 3;
  const lane = ((row + phase) % 3 + 3) % 3, radius = Math.hypot(dx, dy);
  const family = radius <= 3.5 && lane === 0 ? 'courtyard' : radius >= 5.5 || lane === 2 ? 'small' : 'base';
  const size = SIZES[family];
  // Opposite rows face the immutable village center, sharing one ridge axis.
  const face = quarter ? dx >= 0 ? Math.PI / 2 : Math.PI * 1.5 : dy >= 0 ? 0 : Math.PI;
  return { assetId: MORTAL_HOUSE_ASSET_IDS[family === 'base' ? 0 : family === 'small' ? 1 : 2],
    family, roofFamily: size.roof, rotationY: face, ...size };
}
