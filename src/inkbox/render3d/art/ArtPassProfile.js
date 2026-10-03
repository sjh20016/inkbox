// Presentation only. Profiles never enter World or save data.
export const ART_CONTROLS = Object.freeze({
  pigmentDensity: [0, 1, 0.01], pigmentSaturation: [0, 1, 0.01],
  terrainBoundaryStrength: [0, 1, 0.01], structuralInkStrength: [0, 1, 0.01],
  silhouetteInkStrength: [0, 1, 0.01], inkDensity: [0, 1, 0.01],
  dryBrushStrength: [0, 1, 0.01], distanceFade: [0, 1, 0.01],
  paperGrainStrength: [0, 0.06, 0.001],
});
const BASE = Object.freeze({
  name: 'pilot', enabled: true, pilots: true, paperColor: '#f5f2ea',
  pigmentDensity: 0.48, pigmentSaturation: 0.18, terrainBoundaryStrength: 0.13,
  structuralInkStrength: 0.64, silhouetteInkStrength: 0.16, inkDensity: 0.40,
  dryBrushStrength: 0.45, distanceFade: 0.66, paperGrainStrength: 0.009,
  // S3 is deliberately gated out of the shipping path. No implicit RT allocation.
  postprocess: false,
});
export const ART_PROFILES = Object.freeze({
  baseline: Object.freeze({ ...BASE, name: 'baseline', enabled: false, pilots: false }),
  pigment: Object.freeze({ ...BASE, name: 'pigment', pilots: false, structuralInkStrength: 0, silhouetteInkStrength: 0 }),
  ink: Object.freeze({ ...BASE, name: 'ink', pilots: false }),
  pilot: BASE,
  low: Object.freeze({ ...BASE, name: 'low', paperGrainStrength: 0, dryBrushStrength: 0.25 }),
});
export function resolveArtProfile(value = 'pilot', base = BASE) {
  if (typeof value === 'string') return ART_PROFILES[value] || BASE;
  if (!value || typeof value !== 'object') return ART_PROFILES.baseline;
  const result = { ...base, name: 'custom' };
  for (const [key, [min, max]] of Object.entries(ART_CONTROLS)) {
    if (Number.isFinite(value[key])) result[key] = Math.max(min, Math.min(max, value[key]));
  }
  if (/^#[\da-f]{6}$/i.test(value.paperColor || '')) result.paperColor = value.paperColor;
  for (const key of ['enabled', 'pilots']) if (typeof value[key] === 'boolean') result[key] = value[key];
  return Object.freeze(result);
}
