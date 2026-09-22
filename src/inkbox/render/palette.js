// 水墨沙盒 · 色彩工具
// 所有颜色都以 [r,g,b] 整数数组流转，避免每像素解析字符串。

import { TERRAIN_INFO, INK } from '../core/config.js';

export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

export const INK_RGB = Object.freeze({
  paper: hexToRgb(INK.paper),
  paperDeep: hexToRgb(INK.paperDeep),
  mist: hexToRgb(INK.mist),
  ink: hexToRgb(INK.ink),
  inkMid: hexToRgb(INK.inkMid),
  cinnabar: hexToRgb(INK.cinnabar),
  azurite: hexToRgb(INK.azurite),
  ochre: hexToRgb(INK.ochre),
  shadow: [74, 71, 66],
  gold: hexToRgb(INK.gold),
});

export const TERRAIN_RGB = TERRAIN_INFO.map((info) => info.color);

export function mixRgb(a, b, t, out = [0, 0, 0]) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

export function shadeRgb(a, factor, out = [0, 0, 0]) {
  out[0] = a[0] * factor;
  out[1] = a[1] * factor;
  out[2] = a[2] * factor;
  return out;
}

export function toCss(rgb, alpha = 1) {
  if (alpha >= 1) return `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
  return `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${alpha})`;
}

export function luminance(rgb) {
  return (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
}

/** 4×4 有序抖动矩阵，用于制造宣纸颗粒感 */
export const BAYER4 = Object.freeze([
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
]);
