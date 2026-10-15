import * as THREE from 'three';
import { TERRAIN_INFO } from '../../core/config.js';
import { INK_PALETTE, WATER_TERRAIN, WATER_INK } from './artConfig.js';

// 地形顶点色的水墨化（纯函数 + 一个小工厂）。
//
// 做三件事：
//   1. 亮度映射到每界三停靠点色阶（暗 / 中 / 亮），再按 chroma 混回一部分原色相；
//   2. 亮度量化成 bands 档：形成"墨分五色"的层次，而不是连续渐变；
//   3. 陡坡按"皴"加深：坡度越大越暗，并乘一个按格哈希的笔触抖动，打破机械感。
// 水域走花青色阶。全部在 sRGB 里算，最后一次性转线性写入顶点色（与 TerrainMesh 调色板同口径）。

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function cellHash(i) { let n = (i + 1) * 0x9e3779b1 >>> 0; n = Math.imul(n ^ (n >>> 16), 0x21f0aaad); n = Math.imul(n ^ (n >>> 15), 0x735a2d97); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }

export function makeInkColorizer(plane) {
  const pal = INK_PALETTE[plane] || INK_PALETTE.mortal;
  const sh = pal.shadow.map((v) => v / 255), mid = pal.mid.map((v) => v / 255), lt = pal.light.map((v) => v / 255);
  const out = new THREE.Color();
  const ramp = (L, k) => (L < 0.5 ? lerp(sh[k], mid[k], L * 2) : lerp(mid[k], lt[k], (L - 0.5) * 2));
  const base = TERRAIN_INFO.map((t) => t.color.map((v) => v / 255));

  /** @returns {THREE.Color} 复用的同一个对象（调用方立即读取 r/g/b） */
  return function colorize(world, i) {
    const type = world.type[i];
    const wi = WATER_TERRAIN.indexOf(type);
    if (wi >= 0) {
      const c = WATER_INK[wi];
      return out.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
    }
    const c = base[type] || base[5];
    const L0 = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;

    // 坡度：四邻高程差之和（原始 height 单位，0..1 域）。
    const w = world.w, h = world.h, x = i % w, y = (i / w) | 0;
    const hx = world.height[y * w + Math.min(w - 1, x + 1)] - world.height[y * w + Math.max(0, x - 1)];
    const hy = world.height[Math.min(h - 1, y + 1) * w + x] - world.height[Math.max(0, y - 1) * w + x];
    const slope = smooth(0.015, 0.09, Math.abs(hx) + Math.abs(hy));
    const stroke = 0.55 + 0.45 * cellHash(i);

    let L = clamp01(L0 * (1 - pal.cun * slope * stroke));
    const q = Math.floor(L * pal.bands + 0.5) / pal.bands;
    L = lerp(L, q, 0.55);

    const keep = L / Math.max(L0, 0.06);
    const r = lerp(ramp(L, 0), clamp01(c[0] * keep), pal.chroma);
    const g = lerp(ramp(L, 1), clamp01(c[1] * keep), pal.chroma);
    const b = lerp(ramp(L, 2), clamp01(c[2] * keep), pal.chroma);
    return out.setRGB(r, g, b, THREE.SRGBColorSpace);
  };
}
