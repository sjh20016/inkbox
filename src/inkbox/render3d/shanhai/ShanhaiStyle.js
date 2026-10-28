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
      goldAmt: 0.0, mistAmt: 0.26, air: 0.30,
      // V1.3 · 薄墨勾山：只有主峰外轮廓、主脊与大崖顶；淡、细、少，远景让给色面。
      lines: { contour: { width: 1.4, widthVar: 0.35, color: '#4E5550', alpha: 0.42, facing: 0.20, breakup: 0.25 },
        ridge: 0.50, valley: 0, cliff: 0.32, minLen: 9, gate: 0.40, width: 1.3, color: '#4A4F48', alpha: 0.52, dry: 0.35 } },
    sky: { top: '#E9E1CD', bottom: '#F3EEE1', horizon: '#E4DCC8' },
    hills: ['#B9C2B4', '#9DAEA4', '#7F948E'], hillInk: '#5A6A68', mistBand: '#F4EFE3', sun: { color: '#E2A27A', x: 0.80, y: 0.20, r: 0.040, alpha: 0.16 },
    base: { color: '#EFEADC', ink: '#9BA49A', opacity: 0.92, kind: 'mist' },
    light: { sky: '#FBF1DA', ground: '#6E7A64', hemi: 1.75, sun: '#FFE8C2', sunIntensity: 2.5, sunDir: [-90, 150, -60] },
  },
  upper: {
    terrain: { band: [-2, 40], low: '#CDBFA2', mid: '#93B3A8', high: '#8399B4', peak: '#F5F2EA', shadow: '#62668A',
      light: '#FBF4E4', gold: '#D6BE86', mist: '#EEF0EB', strength: 0.82, shade: 0.24, cun: 0.20, ridge: 0.34, wash: 0.16, line: 0.0,
      goldAmt: 0.35, mistAmt: 0.40, air: 0.38, mineral: 0.55,
      // V1.3 · 细线勾仙山：浅青灰细线，远处被云雾吃掉（farMist），不闭合。
      lines: { contour: { width: 1.2, widthVar: 0.30, color: '#6C7A96', alpha: 0.40, facing: 0.20, breakup: 0.35 },
        ridge: 0.45, valley: 0, cliff: 0.25, minLen: 9, gate: 0.42, width: 1.1, color: '#6F7D9A', alpha: 0.46, dry: 0.30 } },
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
export const SHANHAI_OPTIONS = { nether: typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('netherLandscape') === 'off' ? 'line-c' : 'brush', lines: 'on' };
const NETHER_BW_SCENE = {
  sky: { top: '#D9D3C6', bottom: '#EEE9DE', horizon: '#E4DED2' },
  hills: ['#C4BEB2', '#8E897F', '#3E3B36'], hillInk: '#1A1816', mistBand: '#F1ECE3',
  sun: { color: '#B23A2E', x: 0.76, y: 0.16, r: 0.034, alpha: 0.85 },
  base: { color: '#E8E2D6', ink: '#141311', opacity: 0.94, kind: 'inkfog' },
  light: { sky: '#F2EEE6', ground: '#6A665E', hemi: 1.9, sun: '#F4F0E6', sunIntensity: 2.1, sunDir: [-110, 140, -40] },
};
const LINE_BASE = { ...SHANHAI_SCENE.nether.terrain, low: '#D8D2C5', mid: '#CFC9BC', high: '#E3DED2', peak: '#F3EFE6',
  shadow: '#3A3732', mist: '#EDE8DE', shade: 0.30, cun: 0.0, ridge: 0.0, line: 0.0, wash: 0.10, inkMode: 'none', inkAmt: 0,
  mistAmt: 0.22, air: 0.24, lineFill: 1 };
export const NETHER_VARIANTS = deepFreeze({
  // D-N2A is selected explicitly by the isolated lab; the product keeps brush.
  strata: { scene: merge(SHANHAI_SCENE.nether, { ...NETHER_BW_SCENE, terrain: { ...LINE_BASE,
    strata: 1, brush: 0, lineTone: 0.32, mistAmt: 0.20, air: 0.26,
    lines: { brush: 1, contour: null,
      ridge: 0.60, valley: 0, cliff: 0.85, hatch: 0, minLen: 10, gate: 0.35, width: 1.7,
      kindWidth: [0.7, 0, 1, 0], dry: 0.55, color: '#302C27', alpha: 0.76 } } }) },
  brush: { scene: merge(SHANHAI_SCENE.nether, { ...NETHER_BW_SCENE, terrain: { ...LINE_BASE, brush: 1, lineTone: 0.45, mistAmt: 0.30, air: 0.36,
    lines: { brush: 1, contour: { width: 3.3, widthVar: 0.7, color: '#171512', alpha: 0.9, facing: 0.24, breakup: 0.35 },
      ridge: 1, valley: 0.45, cliff: 0.85, hatch: 0.90, minLen: 5, gate: 0.10, width: 3.8, kindWidth: [1, 0.55, 0.85, 0.50], dry: 0.65, color: '#1b1916', alpha: 0.94 } } }) },
  print: {
    scene: merge(SHANHAI_SCENE.nether, { ...NETHER_BW_SCENE, terrain: { ...SHANHAI_SCENE.nether.terrain, low: '#2A2724', mid: '#8A857B', high: '#D8D2C4', peak: '#F1ECE2',
      shadow: '#0E0D0C', mist: '#E9E3D7', shade: 0.55, cun: 0.10, ridge: 0.90, line: 0.30, wash: 0.10, inkMode: 'print', inkAmt: 0.94, mistAmt: 0.18, air: 0.22 } }),
  },
  ink: {
    scene: merge(SHANHAI_SCENE.nether, { ...NETHER_BW_SCENE, terrain: { ...SHANHAI_SCENE.nether.terrain, low: '#2A2724', mid: '#8A857B', high: '#D8D2C4', peak: '#F1ECE2',
      shadow: '#0E0D0C', mist: '#E9E3D7', shade: 0.50, cun: 0.24, ridge: 0.70, line: 0.0, wash: 0.10, inkMode: 'ink', inkAmt: 0.90, mistAmt: 0.18, air: 0.22 } }),
  },
  // ── V1.3 · 墨骨成山：幽冥线刻三档（A 极简轮廓 / B 轮廓+结构线 / C 完整线刻）──
  // 实体着色退为骨白，山形由 TerrainLineArt 的视角相关轮廓 + 高度场结构线建立。
  'line-a': { scene: merge(SHANHAI_SCENE.nether, { ...NETHER_BW_SCENE, terrain: { ...LINE_BASE, lineTone: 0.22,
    lines: { contour: { width: 2.4, widthVar: 0.25, color: '#151412', alpha: 0.95, facing: 0.22 },
      ridge: 1, valley: 0, cliff: 0, minLen: 10, gate: 0.32, width: 2.0, color: '#1B1917', alpha: 0.92 } } }) },
  'line-b': { scene: merge(SHANHAI_SCENE.nether, { ...NETHER_BW_SCENE, terrain: { ...LINE_BASE, lineTone: 0.30,
    lines: { contour: { width: 2.3, widthVar: 0.30, color: '#151412', alpha: 0.95, facing: 0.22 },
      ridge: 1, valley: 0.55, cliff: 0.75, minLen: 6, gate: 0.14, width: 1.8, kindWidth: [1, 0.65, 0.8], color: '#1B1917', alpha: 0.90 } } }) },
  'line-c': { scene: merge(SHANHAI_SCENE.nether, { ...NETHER_BW_SCENE, terrain: { ...LINE_BASE, lineTone: 0.58,
    lines: { contour: { width: 2.8, widthVar: 0.45, color: '#121110', alpha: 0.96, facing: 0.24, breakup: 0.18 },
      ridge: 1, valley: 0.55, cliff: 0.85, hatch: 0.90, minLen: 5, gate: 0.10, width: 2.4, kindWidth: [1, 0.6, 0.85, 0.75], dry: 0.50, color: '#161513', alpha: 0.92 } } }) },
});
const netherVariantStyle = {};
const inkGrey = hex => {
  const value = Number.parseInt(hex.slice(1), 16), n = Math.round(((value >> 16) * .299 + ((value >> 8) & 255) * .587 + (value & 255) * .114));
  return `#${[n, Math.max(0, n - 2), Math.max(0, n - 6)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
};
for (const [key, v] of Object.entries(NETHER_VARIANTS)) netherVariantStyle[key] = deepFreeze(merge(SHANHAI_STYLES.nether, {
  name: `NetherShanhaiV11_${key}`, shanhai: v.scene.terrain,
  paper: { color: '#ECE6DA', background: '#ECE6DA', exposure: 1.0 },
  pigment: { density: 0.70, saturation: 0.10 },
  ink: { structure: 0.70, silhouette: 0.40, density: 0.40, dryBrush: 0.70, feibai: 0.40, color: '#0E0D0C' },
  contrast: 1.12, atmosphere: { color: '#ECE6DA', strength: 0.10, low: -20, high: 4 },
  ...(key === 'brush' || key === 'strata' ? { terrain: { palette: REALM_STYLES.nether.terrain.palette.map(inkGrey), rock: '#57534C' },
    vegetation: { palette: ['#36332E', '#5E5A52', '#777065'] } } : {}),
}));
// `?nether=v12` = V1.2 原始幽冥（焦墨 ink，无线刻），作为对照与回退。
const netherKey = () => { const k = SHANHAI_OPTIONS.nether === 'v12' ? 'ink' : SHANHAI_OPTIONS.nether; return NETHER_VARIANTS[k] ? k : null; };

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
