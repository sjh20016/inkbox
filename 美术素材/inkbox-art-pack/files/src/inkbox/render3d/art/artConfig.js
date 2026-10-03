// 墨界美术 · 参数表（纯数据，不含逻辑）。
//
// 这一份是整个美术层唯一的"调参处"：每界的垂直档、墙高、肩部宽度、水墨色阶。
// 想改画面，先改这里；不要去散落的 Layer 里改数字。
//
// ⚠️ 全部是表现层常量。它们不进存档、不参与任何模拟判定、不改 sim/ 的任何概率。

/** 纸色：清屏色、雾色、DOM 叠层底色共用。与 inkbox.html 的 --paper(#e9e0cd) 同族，略深一点以衬托地形。 */
export const PAPER = '#d9cdb4';

/**
 * 每界垂直档。
 *   datum  基准偏移：上界 +（天柱，从凡间升起），幽冥 −（地井，向下沉）。
 *   relief 起伏缩放：目标界自己的山水起伏压到多少倍，避免两界起伏叠加后墙高失控。
 * 凡间恒为 {0, 1}：窗外的世界永远保持真实。
 * 初值来自 skirt-prototype 对 17 个区域的实测（上界 17% / 幽冥 0% 的边缘节点处于"叙事错边"）。
 */
export const ART_PLANES = Object.freeze({
  mortal: Object.freeze({ datum: 0, relief: 1 }),
  upper: Object.freeze({ datum: 30, relief: 0.6 }),
  nether: Object.freeze({ datum: -30, relief: 0.6 }),
});

/** 界缘（boundary skirt）。hMin 墙高下限；hCap 软饱和上限；shoulder 肩部宽度（格）。 */
export const SKIRT = Object.freeze({ hMin: 8, hCap: 26, shoulder: 5 });

/**
 * 水墨色阶：每界三个停靠点（暗 / 中 / 亮，sRGB 0-255）+ 保留原色相的比例 chroma。
 * 地形原色按亮度映射到这条色阶，再按 chroma 混回一部分原色相，保留"草是绿的、沙是黄的"的可读性。
 * bands 为亮度量化档数；cun 为陡坡干笔加深强度。
 */
export const INK_PALETTE = Object.freeze({
  mortal: Object.freeze({ shadow: [52, 47, 40], mid: [148, 136, 108], light: [232, 221, 192], chroma: 0.55, bands: 6, cun: 0.42 }),
  upper: Object.freeze({ shadow: [86, 100, 104], mid: [176, 190, 182], light: [243, 241, 228], chroma: 0.32, bands: 6, cun: 0.30 }),
  nether: Object.freeze({ shadow: [26, 22, 33], mid: [92, 80, 102], light: [170, 154, 172], chroma: 0.28, bands: 5, cun: 0.50 }),
});

/** 水域地形索引（TERRAIN_INFO 的 DEEP..SHALLOW）按花青色阶走，不走上面的通用映射。 */
export const WATER_TERRAIN = Object.freeze([0, 1, 2, 3]);
export const WATER_INK = Object.freeze([[46, 70, 92], [64, 90, 110], [88, 112, 128], [136, 156, 166]]);

/** 雾：正交相机下按视深度线性衰减。数值按默认 fit 机位（距目标约 390）标定。 */
export const FOG = Object.freeze({ near: 330, far: 700 });

/** 裂缝在墙上的微光色（与 Canvas 视界 drawRiftBorder 的青色同源：rgba(122,186,196)）。 */
export const RIFT_GLOW = '#7abac4';
export const INK_COLOR = '#22201c';

/** URL 开关：?art=ink（或 art=1）。关闭时一切行为与 M2-A 完全一致。 */
export function artRequested(search = (typeof location !== 'undefined' ? location.search : '')) {
  const v = new URLSearchParams(search).get('art');
  return v === 'ink' || v === '1' || v === 'on';
}
