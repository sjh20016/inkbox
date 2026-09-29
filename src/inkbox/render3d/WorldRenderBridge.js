// 水墨沙盒 · Render3D 地形脏区桥（M0 建立 · M1.1D D4 分类化）
//
// ───────────────────────────────────────────────────────────────────────
// 这一层负责什么
// ───────────────────────────────────────────────────────────────────────
//
// 渲染器**自己的只读快照**：把 `world` 的四个地形数组（`height` / `water` /
// `type` / `veg`）各存一份，每帧 diff 出「这一帧到底哪几层、在哪一块矩形里变了」。
//
// ⚠️ **dirty 状态永远属于 Render3D 自己**，绝不往 `World` 上加
//    `heightDirty` / `renderDirty` / `threeDirty` 之类的字段（M1.1D D4.3）。
//    Canvas 与 Three 必须能各自独立观察同一个世界——把渲染状态写进模拟层，
//    就等于让「开不开 3D」改变世界本身。
//
// ───────────────────────────────────────────────────────────────────────
// 为什么要**分类**（M1.1D D4）
// ───────────────────────────────────────────────────────────────────────
//
// M1 时四层揉成一个 dirty region ⇒ 只要 `water` / `veg` / `type` 动一下，
// 也会被当成「地形变了」⇒ **实体 / 建筑 / marker 全部重新贴地**。
// M1 尚可接受（人少），M2 三界之后就是纯 CPU 浪费。
//
// 现在改成**每层各报一条脏区**，各消费方只吃自己真正依赖的那几层：
//
//   TerrainMesh      ← height（改 Y）+ type（改顶点色）
//   WaterLayer       ← height + water（水面高度 = height + water）
//   VegetationLayer  ← height + veg + type（树的位置与存活判据）
//   EntityLayer      ← 只有 height
//   SettlementLayer  ← 只有 height
//   WorldMarkerLayer ← 只有 height
//   SelectionMarker  ← 只有 height（外加「选中格自己变了」）
//
// ⚠️ 判据必须按**真实依赖**给，不许「凭感觉全绑」——全绑就退化成 M1 的行为。

import { createCoordinates } from './coordinates.js';

/** 四层地形数组的键（顺序即渲染顺序契约）。 */
export const BRIDGE_LAYERS = Object.freeze(['height', 'water', 'type', 'veg']);

/**
 * 合并两块脏区域 —— **纯函数**（不修改入参，返回值总是新对象）。
 *
 * @param {{x0:number,y0:number,x1:number,y1:number}|null} a
 * @param {{x0:number,y0:number,x1:number,y1:number}|null} b
 * @returns {{x0:number,y0:number,x1:number,y1:number}|null} 两者都没脏 ⇒ `null`
 *
 * ⚠️ 抽出它只为「同一件事只写一遍」：`Math.min x0 / Math.max x1` 这套
 *    在桥、Renderer3D、雕刻笔刷三处都要用，抄三份迟早抄漏一个方向。
 */
export function mergeRegion(a, b) {
  if (!a) return b ? { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 } : null;
  if (!b) return { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 };
  return {
    x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
  };
}

/** 把单格并进一个 `[x0, y0, x1, y1]` 包围盒（就地改，热循环里不产生垃圾）。 */
function grow(box, x, y) {
  if (x < box[0]) box[0] = x;
  if (y < box[1]) box[1] = y;
  if (x > box[2]) box[2] = x;
  if (y > box[3]) box[3] = y;
}

/** `[x0, y0, x1, y1]` → 区域对象；`x1 < 0` 表示这一层没脏。 */
function toRegion(box) {
  return box[2] < 0 ? null : { x0: box[0], y0: box[1], x1: box[2], y1: box[3] };
}

export class WorldRenderBridge {
  constructor(world) {
    this.world = world;
    this.coordinates = createCoordinates(world);
    this.snapshots = Object.fromEntries(BRIDGE_LAYERS.map(key => [key, world[key].slice()]));
  }

  /**
   * 对比本帧与上一帧的四个地形数组。
   *
   * @returns {{any:true, height:Region|null, water:Region|null, type:Region|null, veg:Region|null}|null}
   *   **四层全都没变 ⇒ `null`**（调用方据此跳过整条地形更新路径）。
   *   每一层要么是 `null`，要么是**闭区间**格坐标矩形 `{x0, y0, x1, y1}`。
   */
  changes() {
    const w = this.world;
    const { height, water, type, veg } = w;
    const old = this.snapshots;
    // 每层各一条包围盒：`[x0, y0, x1, y1]`，`x1 < 0` = 这层没脏。
    // ⚠️ 四层**分开记**——揉成一个 region 就是 M1 那套过粗的 dirty。
    const box = {
      height: [w.w, w.h, -1, -1], water: [w.w, w.h, -1, -1],
      type: [w.w, w.h, -1, -1], veg: [w.w, w.h, -1, -1],
    };
    for (let i = 0; i < w.size; i++) {
      const dHeight = old.height[i] !== height[i];
      const dWater = old.water[i] !== water[i];
      const dType = old.type[i] !== type[i];
      const dVeg = old.veg[i] !== veg[i];
      if (!dHeight && !dWater && !dType && !dVeg) continue;
      const x = i % w.w, y = (i / w.w) | 0;
      // ⚠️ 每层**各自**更新快照：漏更一层，那一层会「只脏一次」然后永久沉默，
      //    而且不报错——症状是「地形改完画面不再跟」。
      if (dHeight) { old.height[i] = height[i]; grow(box.height, x, y); }
      if (dWater) { old.water[i] = water[i]; grow(box.water, x, y); }
      if (dType) { old.type[i] = type[i]; grow(box.type, x, y); }
      if (dVeg) { old.veg[i] = veg[i]; grow(box.veg, x, y); }
    }
    const out = {
      any: false, height: toRegion(box.height), water: toRegion(box.water),
      type: toRegion(box.type), veg: toRegion(box.veg),
    };
    if (!out.height && !out.water && !out.type && !out.veg) return null;
    out.any = true;
    return out;
  }
}
