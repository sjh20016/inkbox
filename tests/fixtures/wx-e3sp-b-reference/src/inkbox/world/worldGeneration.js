// One parameterized terrain foundation. No simulation RNG is consumed here.
export const TERRAIN_PRESETS = Object.freeze({
  standard: Object.freeze({ label: '标准世界', waterTarget: 0.42, ridgeWeight: 0.42, ridgePower: 1.7, landPower: 2.15 }),
  mountains: Object.freeze({ label: '群山世界', waterTarget: 0.30, ridgeWeight: 0.62, ridgePower: 1.9, landPower: 1.35 }),
  wetlands: Object.freeze({ label: '水泽世界', waterTarget: 0.59, ridgeWeight: 0.24, ridgePower: 1.5, landPower: 2.8 }),
});
export function generationParameters(terrainPreset = 'standard') {
  const parameters = TERRAIN_PRESETS[terrainPreset];
  if (!parameters) throw new RangeError(`Unknown terrain preset: ${terrainPreset}`);
  return parameters;
}
// Generation-only stable-neighborhood filter: never called for loaded or sculpted arrays.
// Weak peak/ridge weights retain relief while removing high-frequency isolated spikes.
export function smoothGeneratedHeight(world) {
  const { w, h, height } = world;
  for (let pass = 0; pass < 2; pass += 1) {
    const source = height.slice();
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x, center = source[i];
        const left = source[i - 1], right = source[i + 1], up = source[i - w], down = source[i + w];
        const average = (left + right + up + down) / 4;
        const ridge = center > average && ((center > left && center > right) || (center > up && center > down));
        height[i] = center + (average - center) * (ridge ? 0.08 : 0.22);
      }
    }
  }
}
