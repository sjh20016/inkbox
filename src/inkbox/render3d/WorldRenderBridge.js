// 水墨沙盒 · Render3D 地形脏区桥（M0 建立 · M1.1D D4 分类化）
//
// ───────────────────────────────────────────────────────────────────────
// 这一层负责什么
// ───────────────────────────────────────────────────────────────────────
//
// 渲染器**自己的只读快照**：把 `world` 的四个传统地形数组（`height` / `water` /
// `type` / `veg`）各存一份，另存活动火势快照；每帧 diff 出分类脏区。
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
//   TerrainMesh      ← height（改 Y）+ type / mortal fire（改顶点色）
//   WaterLayer       ← height + water（水面高度 = height + water）
//   VegetationLayer  ← height（局部贴地）+ height / water / veg 资格变化（成员重建）
//   EntityLayer      ← 只有 height
//   SettlementLayer  ← 只有 height
//   WorldMarkerLayer ← 只有 height
//   SelectionMarker  ← 只有 height（外加「选中格自己变了」）
//
// ⚠️ 判据必须按**真实依赖**给，不许「凭感觉全绑」——全绑就退化成 M1 的行为。

import { createCoordinates } from './coordinates.js';
import { vegetationEligible } from './vegetation/deriveVegetation.js';
import { terrainChangesActive, subscribeTerrainChanges, readTerrainChanges, disposeTerrainSubscription } from '../world/terrainChanges.js';

/** 历史四层地形数组的键（顺序即渲染顺序契约）；fire 单列快照。 */
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
    this.fireSnapshot = world.fire.slice();
    this.arraySources = Object.fromEntries([...BRIDGE_LAYERS, 'fire'].map(key => [key, world[key]]));
    // Only explicitly activated worlds opt in. Direct TypedArray mutation
    // callers keep the historical full-diff behavior without any registration.
    this.subscription = subscribeTerrainChanges(world);
    this.needsFullScan = false;
    this.scanStats = { calls: 0, comparedCells: 0, valueComparisons: 0, fullScans: 0, incrementalScans: 0, idleSkips: 0, overflows: 0 };
  }
  forceRescan() { this.needsFullScan = true; }
  dispose() { disposeTerrainSubscription(this.subscription); this.subscription = null; }

  /**
   * 对比本帧与上一帧的地形数组和活动火势。
   *
   * @returns {{any:true, vegetationMembership:boolean, height:Region|null, water:Region|null, type:Region|null, veg:Region|null, fire:Region|null}|null}
   *   **各层全都没变 ⇒ `null`**（调用方据此跳过整条地形更新路径）。
   *   每一层要么是 `null`，要么是**闭区间**格坐标矩形 `{x0, y0, x1, y1}`。
   */
  changes() {
    const w = this.world;
    const { height, water, type, veg, fire } = w;
    const old = this.snapshots, stats = this.scanStats;
    stats.calls++;
    // A bridge can outlive the moment product code activates its World.
    // Establish a new snapshot comparison before switching from legacy scan.
    let subscriptionJustCreated = false;
    if (!this.subscription && terrainChangesActive(w)) {
      this.subscription = subscribeTerrainChanges(w);
      subscriptionJustCreated = true;
    }
    let full = !this.subscription || this.needsFullScan || subscriptionJustCreated;
    this.needsFullScan = false;
    const arrays = { height, water, type, veg, fire };
    for (const name of [...BRIDGE_LAYERS, 'fire']) {
      if (this.arraySources[name] !== arrays[name] || arrays[name].length !== w.size) {
        full = true;
        this.arraySources[name] = arrays[name];
      }
      // A caller may replace a TypedArray or reconstitute the World in place.
      // Snapshot capacity must match the authoritative array before diffing.
      if (name === 'fire') {
        if (this.fireSnapshot.length !== arrays[name].length) this.fireSnapshot = arrays[name].slice();
      } else if (old[name].length !== arrays[name].length) old[name] = arrays[name].slice();
    }
    const pending = this.subscription ? readTerrainChanges(this.subscription) : null;
    if (pending?.full) { full = true; if (pending.overflow) stats.overflows++; }
    if (!full && !pending) { stats.idleSkips++; return null; }
    // A single union rectangle is safe because the old five-layer snapshot
    // decides which individual cells/layers really changed. It may be broader
    // than the logged writes, but never misses any of them.
    let bounds = full ? { x0: 0, y0: 0, x1: w.w - 1, y1: w.h - 1 } : null;
    if (!full) for (const r of pending.regions) if (r) {
      if (!bounds) bounds = { ...r };
      else {
        bounds.x0 = Math.min(bounds.x0, r.x0); bounds.y0 = Math.min(bounds.y0, r.y0);
        bounds.x1 = Math.max(bounds.x1, r.x1); bounds.y1 = Math.max(bounds.y1, r.y1);
      }
    }
    if (!bounds) { stats.idleSkips++; return null; }
    if (full) stats.fullScans++; else stats.incrementalScans++;
    let vegetationMembership = false;
    // 每层各一条包围盒：`[x0, y0, x1, y1]`，`x1 < 0` = 这层没脏。
    // ⚠️ 四层**分开记**——揉成一个 region 就是 M1 那套过粗的 dirty。
    const box = {
      height: [w.w, w.h, -1, -1], water: [w.w, w.h, -1, -1],
      type: [w.w, w.h, -1, -1], veg: [w.w, w.h, -1, -1], fire: [w.w, w.h, -1, -1],
    };
    for (let y = bounds.y0; y <= bounds.y1; y++) for (let x = bounds.x0; x <= bounds.x1; x++) {
      const i = y * w.w + x;
      stats.comparedCells++; stats.valueComparisons += 5;
      const dHeight = old.height[i] !== height[i];
      const dWater = old.water[i] !== water[i];
      const dType = old.type[i] !== type[i];
      const dVeg = old.veg[i] !== veg[i];
      const dFire = this.fireSnapshot[i] !== fire[i];
      if (!dHeight && !dWater && !dType && !dVeg && !dFire) continue;
      if (!vegetationMembership && (dHeight || dWater || dVeg)) {
        vegetationMembership = vegetationEligible(w.seed, i, old.height[i], old.water[i], old.veg[i])
          !== vegetationEligible(w.seed, i, height[i], water[i], veg[i]);
      }
      // ⚠️ 每层**各自**更新快照：漏更一层，那一层会「只脏一次」然后永久沉默，
      //    而且不报错——症状是「地形改完画面不再跟」。
      if (dHeight) { old.height[i] = height[i]; grow(box.height, x, y); }
      if (dWater) { old.water[i] = water[i]; grow(box.water, x, y); }
      if (dType) { old.type[i] = type[i]; grow(box.type, x, y); }
      if (dVeg) { old.veg[i] = veg[i]; grow(box.veg, x, y); }
      if (dFire) { this.fireSnapshot[i] = fire[i]; grow(box.fire, x, y); }
    }
    const out = {
      any: false, vegetationMembership, height: toRegion(box.height), water: toRegion(box.water),
      type: toRegion(box.type), veg: toRegion(box.veg), fire: toRegion(box.fire),
    };
    if (!out.height && !out.water && !out.type && !out.veg && !out.fire) return null;
    out.any = true;
    return out;
  }
}
