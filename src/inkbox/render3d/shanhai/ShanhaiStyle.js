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
    terrain: { band: [-4, 36], low: '#C3B595', mid: '#A1A48C', high: '#889691', peak: '#EFEADD', shadow: '#525C5A',
      light: '#F5EDDB', gold: '#C3A25B', mist: '#E9E3D5', strength: 0.82, shade: 0.46, cun: 0.36, ridge: 0.42, wash: 0.12, line: 0.0,
      goldAmt: 0.0, mistAmt: 0.26, air: 0.30 },
    sky: { top: '#E9E1CD', bottom: '#F3EEE1', horizon: '#E4DCC8' },
    hills: ['#B9C2B4', '#9DAEA4', '#7F948E'], hillInk: '#5A6A68', mistBand: '#F4EFE3', sun: { color: '#E2A27A', x: 0.80, y: 0.20, r: 0.040, alpha: 0.16 },
    base: { color: '#EFEADC', ink: '#9BA49A', opacity: 0.92, kind: 'mist' },
    light: { sky: '#FBF1DA', ground: '#6E7A64', hemi: 1.75, sun: '#FFE8C2', sunIntensity: 2.5, sunDir: [-90, 150, -60] },
  },
  upper: {
    terrain: { band: [-2, 40], low: '#CDBFA2', mid: '#93B3A8', high: '#8399B4', peak: '#F5F2EA', shadow: '#62668A',
      light: '#FBF4E4', gold: '#D6BE86', mist: '#EEF0EB', strength: 0.82, shade: 0.24, cun: 0.20, ridge: 0.34, wash: 0.16, line: 0.0,
      goldAmt: 0.35, mistAmt: 0.40, air: 0.38, mineral: 0.55 },
    sky: { top: '#E7EBE2', bottom: '#F4EEDF', horizon: '#EFE6D0' },
    hills: ['#CCD8D6', '#AEBFC6', '#919FB6'], hillInk: '#5A6684', mistBand: '#FBF7EC', sun: { color: '#D9B65A', x: 0.22, y: 0.18, r: 0.05, alpha: 0.38 },
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
    vegetation: { palette: ['#A3AE88', '#879A84', '#6F8274'], tints5: ['#A3AE88', '#949F7E', '#879A84', '#7F9385', '#B3A687'], instanceTintWeight: 0.28 },
    water: { color: '#86A8A9', opacity: 0.88, paperStrength: 0.18, rippleStrength: 0.36 },
    building: { palette: { wall: '#EEE7D8', roof: '#5E666B', wood: '#9F8A70', earth: '#AC9C80', accent: '#A9573F' } },
    pigment: { density: 0.80, saturation: 0.82, colorLayer: 0.35 },
    ink: { structure: 0.40, silhouette: 0.16, density: 0.34, dryBrush: 0.26, feibai: 0.12, color: '#35322D' },
    contrast: 1.03,
    atmosphere: { color: '#E7E0CF', strength: 0.10, low: -6, high: 6 },
  }),
  upper: merge(REALM_STYLES.upper, {
    name: 'UpperShanhaiV1', shanhai: SHANHAI_SCENE.upper.terrain, paper: { color: '#F0E8D4', background: '#F0E8D4', exposure: 1.03 },
    vegetation: { palette: ['#86A294', '#6C9188', '#BDB08A'], tints5: ['#86A294', '#78998E', '#8FA7B0', '#BDB08A', '#9CB3A4'], instanceTintWeight: 0.30 },
    building: { palette: { wall: '#F0EDE1', roof: '#2F4955', wood: '#996547', earth: '#C3A26B', accent: '#D5B65A' } },
    pigment: { density: 0.80, saturation: 0.70, colorLayer: 0.60 },
    contrast: 1.04,
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

/**
 * V1.1 · 幽冥黑白方案。`v1` = V1 灰调白描（回退参考）；`print` = A 黑白版画；
 * `ink` = B 焦墨干笔（默认，融合 A 的大块黑白结构与 B 的笔势飞白）。
 * 运行时通过 `?nether=v1|print|ink` 切换，只改表现参数。
 */
export const SHANHAI_OPTIONS = { nether: 'ink' };
const NETHER_BW_SCENE = {
  sky: { top: '#D9D3C6', bottom: '#EEE9DE', horizon: '#E4DED2' },
  hills: ['#C4BEB2', '#8E897F', '#3E3B36'], hillInk: '#1A1816', mistBand: '#F1ECE3',
  sun: { color: '#B23A2E', x: 0.76, y: 0.16, r: 0.034, alpha: 0.85 },
  base: { color: '#E8E2D6', ink: '#141311', opacity: 0.94, kind: 'inkfog' },
  light: { sky: '#F2EEE6', ground: '#6A665E', hemi: 1.9, sun: '#F4F0E6', sunIntensity: 2.1, sunDir: [-110, 140, -40] },
};
const NETHER_VARIANTS = deepFreeze({
  print: {
    scene: merge(SHANHAI_SCENE.nether, { ...NETHER_BW_SCENE, terrain: { ...SHANHAI_SCENE.nether.terrain, low: '#2A2724', mid: '#8A857B', high: '#D8D2C4', peak: '#F1ECE2',
      shadow: '#0E0D0C', mist: '#E9E3D7', shade: 0.55, cun: 0.10, ridge: 0.90, line: 0.30, wash: 0.10, inkMode: 'print', inkAmt: 0.94, mistAmt: 0.18, air: 0.22 } }),
  },
  ink: {
    scene: merge(SHANHAI_SCENE.nether, { ...NETHER_BW_SCENE, terrain: { ...SHANHAI_SCENE.nether.terrain, low: '#2A2724', mid: '#8A857B', high: '#D8D2C4', peak: '#F1ECE2',
      shadow: '#0E0D0C', mist: '#E9E3D7', shade: 0.50, cun: 0.24, ridge: 0.70, line: 0.0, wash: 0.10, inkMode: 'ink', inkAmt: 0.90, mistAmt: 0.18, air: 0.22 } }),
  },
});
const netherVariantStyle = {};
for (const [key, v] of Object.entries(NETHER_VARIANTS)) netherVariantStyle[key] = deepFreeze(merge(SHANHAI_STYLES.nether, {
  name: `NetherShanhaiV11_${key}`, shanhai: v.scene.terrain,
  paper: { color: '#ECE6DA', background: '#ECE6DA', exposure: 1.0 },
  pigment: { density: 0.70, saturation: 0.10 },
  ink: { structure: 0.70, silhouette: 0.40, density: 0.40, dryBrush: 0.70, feibai: 0.40, color: '#0E0D0C' },
  contrast: 1.12, atmosphere: { color: '#ECE6DA', strength: 0.10, low: -20, high: 4 },
}));
const netherKey = () => (NETHER_VARIANTS[SHANHAI_OPTIONS.nether] ? SHANHAI_OPTIONS.nether : null);

export function shanhaiStyleFor(plane) {
  if (plane === 'nether' && netherKey()) return netherVariantStyle[netherKey()];
  const style = SHANHAI_STYLES[plane];
  if (!style) throw new Error(`Unknown shanhai plane: ${plane}`);
  return style;
}
export function shanhaiSceneFor(plane) {
  if (plane === 'nether' && netherKey()) return NETHER_VARIANTS[netherKey()].scene;
  return SHANHAI_SCENE[plane] || SHANHAI_SCENE.mortal;
}
