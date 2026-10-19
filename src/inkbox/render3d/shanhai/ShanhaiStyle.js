// V1 · 山海入画 — presentation-only style set layered on REALM_STYLES.
// Nothing here reaches World, Sim, RNG or save data. `?art=realm-style-v1`
// still renders the previous look; `?art=shanhai-v1` (default) renders this one.
import { REALM_STYLES } from '../art/RealmStyleProfile.js';

const deepFreeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); }
  return value;
};
const merge = (base, over) => {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(over)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value) && base?.[key] && typeof base[key] === 'object'
      ? merge(base[key], value) : value;
  }
  return out;
};

/**
 * `terrain` is the in-shader 青绿 / 浅绛 / 焦墨 layering; `scene` drives the
 * painted backdrop, lights and the cloud / ink base under the world slab.
 * Colours are drawn from the attached 中国画配色 reference (矿物色 + 墨分五色).
 */
export const SHANHAI_SCENE = deepFreeze({
  mortal: {
    terrain: { band: [-4, 36], low: '#C7A678', mid: '#7FA05F', high: '#4F8478', peak: '#F0E9D8', shadow: '#344A50',
      light: '#F7E8C6', gold: '#C3A25B', mist: '#E7E0CF', strength: 0.74, shade: 0.24, cun: 0.20, ridge: 0.50, wash: 0.26, line: 0.42,
      goldAmt: 0.0, mistAmt: 0.30, air: 0.38 },
    sky: { top: '#E9E1CD', bottom: '#F3EEE1', horizon: '#E4DCC8' },
    hills: ['#B9C2B4', '#9DAEA4', '#7F948E'], hillInk: '#5A6A68', mistBand: '#F4EFE3', sun: { color: '#E2A27A', x: 0.80, y: 0.20, r: 0.040, alpha: 0.16 },
    base: { color: '#EFEADC', ink: '#9BA49A', opacity: 0.92, kind: 'mist' },
    light: { sky: '#FBF1DA', ground: '#6E7A64', hemi: 1.75, sun: '#FFE8C2', sunIntensity: 2.5, sunDir: [-90, 150, -60] },
  },
  upper: {
    terrain: { band: [-2, 40], low: '#C49B5C', mid: '#3F8A6C', high: '#2C6A8C', peak: '#F4EFE2', shadow: '#22465A',
      light: '#FFF1CF', gold: '#D2AE4E', mist: '#F2ECDD', strength: 0.80, shade: 0.24, cun: 0.18, ridge: 0.44, wash: 0.22, line: 0.34,
      goldAmt: 0.75, mistAmt: 0.44, air: 0.40 },
    sky: { top: '#E7EBE2', bottom: '#F4EEDF', horizon: '#EFE6D0' },
    hills: ['#B7CEC6', '#8FB3AE', '#5F8F98'], hillInk: '#355E70', mistBand: '#FBF7EC', sun: { color: '#D9B65A', x: 0.22, y: 0.18, r: 0.05, alpha: 0.38 },
    base: { color: '#FBF8EF', ink: '#B7C6C2', opacity: 0.96, kind: 'cloud' },
    light: { sky: '#FFF6E2', ground: '#7C8C88', hemi: 1.9, sun: '#FFF0CC', sunIntensity: 2.6, sunDir: [-70, 170, -90] },
  },
  nether: {
    terrain: { band: [-14, 30], low: '#3A3733', mid: '#6E6A62', high: '#B5AFA2', peak: '#ECE6D8', shadow: '#1A1816',
      light: '#CFCABE', gold: '#8E302B', mist: '#B9B3A6', strength: 0.84, shade: 0.30, cun: 0.36, ridge: 0.80, wash: 0.16, line: 0.60,
      goldAmt: 0.0, mistAmt: 0.26, air: 0.28 },
    sky: { top: '#9C978D', bottom: '#D6D0C2', horizon: '#BDB7AA' },
    hills: ['#9A958B', '#6E6A62', '#3E3B37'], hillInk: '#171513', mistBand: '#D8D2C5', sun: { color: '#B23A2E', x: 0.76, y: 0.16, r: 0.03, alpha: 0.55 },
    base: { color: '#9A958A', ink: '#2A2724', opacity: 0.92, kind: 'inkfog' },
    light: { sky: '#E2DDD2', ground: '#4A4640', hemi: 1.65, sun: '#D8D2C6', sunIntensity: 1.9, sunDir: [-110, 140, -40] },
  },
});

export const SHANHAI_STYLES = deepFreeze({
  mortal: merge(REALM_STYLES.mortal, {
    name: 'MortalShanhaiV1', shanhai: SHANHAI_SCENE.mortal.terrain, paper: { color: '#EDE5D1', background: '#EDE5D1', exposure: 1.02 },
    vegetation: { palette: ['#A9BC7A', '#7FA08A', '#5E7466'], tints5: ['#A9BC7A', '#8DA46A', '#7FA08A', '#6A9A88', '#C2A27A'], instanceTintWeight: 0.55 },
    water: { color: '#6F9EA2', opacity: 0.90, paperStrength: 0.36, rippleStrength: 0.62 },
    building: { palette: { wall: '#EEE7D6', roof: '#5E6B73', wood: '#85684D', earth: '#B48A56', accent: '#B64A3B' } },
    pigment: { density: 0.80, saturation: 0.82, colorLayer: 0.35 },
    ink: { structure: 0.62, silhouette: 0.26, density: 0.44, dryBrush: 0.36, feibai: 0.16, color: '#2B2925' },
    contrast: 1.07,
    atmosphere: { color: '#E7E0CF', strength: 0.10, low: -6, high: 6 },
  }),
  upper: merge(REALM_STYLES.upper, {
    name: 'UpperShanhaiV1', shanhai: SHANHAI_SCENE.upper.terrain, paper: { color: '#F0E8D4', background: '#F0E8D4', exposure: 1.03 },
    vegetation: { palette: ['#5C8D6B', '#306D51', '#C3A25B'], tints5: ['#5C8D6B', '#43846C', '#70A5AF', '#C3A25B', '#8CB394'] },
    building: { palette: { wall: '#F0EDE1', roof: '#2F4955', wood: '#996547', earth: '#C3A26B', accent: '#D5B65A' } },
    pigment: { density: 0.82, saturation: 0.92, colorLayer: 0.95 },
    contrast: 1.10,
    atmosphere: { color: '#F4EEDF', strength: 0.26, low: 6, high: 20 },
  }),
  nether: merge(REALM_STYLES.nether, {
    name: 'NetherShanhaiV1', shanhai: SHANHAI_SCENE.nether.terrain, paper: { color: '#C9C4B9', background: '#C9C4B9', exposure: 0.92 },
    pigment: { density: 0.80, saturation: 0.40 },
    ink: { structure: 0.82, silhouette: 0.34, density: 0.58, dryBrush: 0.80, feibai: 0.36, color: '#171513' },
    contrast: 1.24,
    atmosphere: { color: '#5D5B57', strength: 0.16, low: -20, high: 4 },
  }),
});

export function shanhaiStyleFor(plane) {
  const style = SHANHAI_STYLES[plane];
  if (!style) throw new Error(`Unknown shanhai plane: ${plane}`);
  return style;
}
export function shanhaiSceneFor(plane) { return SHANHAI_SCENE[plane] || SHANHAI_SCENE.mortal; }
