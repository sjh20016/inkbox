import * as THREE from 'three';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

/**
 * M2-B B2 · 界缘断面（§30–§33 / §44–§47）。
 *
 * 职责只有一件：画**当前 RealmView Region 的空间断面**。
 * 它**不是** rift manager，也**不是** simulation seal（§31 / S6）——
 * 裂缝是 World 的持久对象，界缘只是「当前这扇窗」的表现；两者的视觉交叠
 * （breach）由 B4 读取结果叠加，不在这里持有。
 *
 * ── 几何（§32）────────────────────────────────────────────────────────
 * 每条 Region 边界边生成 **1 个 quad（2 个三角形）**：
 *   · XZ **完全来自共享世界格网节点**（`coordinates.cellToRender`），
 *     与地形网格用的是同一套坐标 ⇒ 同坐标必然对齐；
 *   · 下端 = `mortalElevation.node(x, y)`（凡间真实地形）；
 *   · 上端 = `targetElevation.node(x, y)`（目标位面的**最终**边界高程）。
 *
 * ⚠️⚠️ §33「禁止墙体自身悬空压缩」：上端**必须**是目标地形自己在同一节点的值，
 *    所以这里调用的就是目标 Stage 地形网格写顶点时**同一个** `elevation.node()`。
 *    两侧由同一个函数在同一节点取值 ⇒ 结构上不可能出现黑缝，
 *    而不是靠事后调参把缝对上。真实高差 40 就画 40，不许单独压成 15。
 *
 * ── 预算（§86）────────────────────────────────────────────────────────
 * 三角形数 = 边界边数 × 2，与 **Region 周长**相关；与面积无关。
 * 如果哪天变成「面积 × 大型网格」，说明设计走偏了。
 *
 * ── 材质（§44）────────────────────────────────────────────────────────
 * 只用一档 `MeshLambertMaterial` + 顶点色。**没有** EffectComposer / RenderTarget /
 * WebGPU / TSL / 大型 shader pipeline，也没有全局水墨管线（§46 留给 Art Pass）。
 * 三个视觉通道（§45）都落在顶点色上：几何表达方向与深度、墨色表达深浅、
 * Upper 顶部轻 / Nether 向下沉。
 */

/** 墨色浓淡的归一化参考深度（**表现量**，不是物理量）。 */
const DEPTH_REFERENCE = 60;
const INK_LIGHT = new THREE.Color('#8f8a7c');     // 上界顶部：轻、向上亮
const INK_MID = new THREE.Color('#4a463e');
const INK_DEEP = new THREE.Color('#22201c');      // 底端 / 幽冥：暗、向下沉

function inkFor(sign, visualDepth, isTop, target) {
  const depth = Math.max(0, Math.min(1, visualDepth / DEPTH_REFERENCE));
  if (sign > 0) {
    target.copy(isTop ? INK_LIGHT : INK_MID).lerp(INK_DEEP, isTop ? depth * 0.45 : 0.2 + depth * 0.35);
  } else {
    target.copy(isTop ? INK_MID : INK_DEEP).lerp(INK_DEEP, isTop ? depth * 0.5 : 0.55 + depth * 0.45);
  }
  return target;
}

export class RealmBoundaryLayer {
  constructor({ coordinates }) {
    this.coordinates = coordinates;
    this.vertices = 0;
    this.edges = 0;
    this.position = new THREE.BufferAttribute(new Float32Array(0), 3).setUsage(THREE.DynamicDrawUsage);
    this.color = new THREE.BufferAttribute(new Float32Array(0), 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('color', this.color);
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(0), 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true, side: THREE.DoubleSide, flatShading: true, transparent: true, opacity: 0.96,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'RealmBoundary';
    this.mesh.renderOrder = RENDER_ORDER.realmBoundary;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.key = null;
    this.boundaryDirection = 'up';
    this.stats = { edges: 0, triangles: 0, vertices: 0, rawGapMax: 0, rawGapMean: 0, visualDepthMax: 0, visualDepthMin: Infinity };
  }

  setVisible(visible) { this.mesh.visible = !!visible; }

  /** 缓存键：Region identity + 预设 + 两侧高程版本。变了才重建（§85）。 */
  static keyFor({ region, mode, sign, targetPlane }) {
    return `${mode}|${sign}|${targetPlane}|${region.x0},${region.y0},${region.x1},${region.y1},${region.path?.length ?? 0}`;
  }

  clear() {
    this.geometry.setDrawRange(0, 0);
    this.edges = 0;
    this.vertices = 0;
    this.stats = { edges: 0, triangles: 0, vertices: 0, rawGapMax: 0, rawGapMean: 0, visualDepthMax: 0, visualDepthMin: Infinity };
  }

  #ensureCapacity(edgeCount) {
    const vertices = edgeCount * 4;
    if (this.position.count >= vertices) return;
    this.position = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.color = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('color', this.color);
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(edgeCount * 6), 1).setUsage(THREE.DynamicDrawUsage));
  }

  /**
   * 依据 Region 边界与两侧高程重建断面。
   *
   * @param {object} options
   * @param {object} options.regionGeometry
   * @param {object} options.mortalElevation
   * @param {object} options.targetElevation
   * @param {number} options.sign `+1` 上界 / `-1` 幽冥
   * @param {string} [options.key] 缓存键
   */
  rebuild({ regionGeometry, mortalElevation, targetElevation, sign, key = null }) {
    const edgeCount = regionGeometry?.edgeCount ?? 0;
    this.key = key;
    this.boundaryDirection = sign > 0 ? 'up' : 'down';
    if (!edgeCount) { this.clear(); return this.stats; }
    this.#ensureCapacity(edgeCount);

    const position = this.position.array;
    const color = this.color.array;
    const index = this.geometry.index.array;
    const scratch = new THREE.Color();
    let v = 0;         // 顶点游标（每边 4 个）
    let t = 0;         // 索引游标（每边 6 个）
    let gapSum = 0;
    let gapMax = 0;
    let depthMax = 0;
    let depthMin = Infinity;
    let edges = 0;

    for (const { ax, ay, bx, by } of regionGeometry.boundaryEdges()) {
      const pa = this.coordinates.cellToRender(ax, ay);
      const pb = this.coordinates.cellToRender(bx, by);
      // ⚠️ §33：这两个调用与目标 Stage 地形网格写顶点时**完全同源**。
      const topA = targetElevation.node(ax, ay);
      const topB = targetElevation.node(bx, by);
      const bottomA = mortalElevation.node(ax, ay);
      const bottomB = mortalElevation.node(bx, by);
      const visualA = Math.abs(topA - bottomA);
      const visualB = Math.abs(topB - bottomB);
      // rawGap 记录**未经 Strata 塑形**的真实高差，供读数与报告区分「真实 vs 画出来」。
      const rawA = Math.abs(targetElevation.baseNode(ax, ay) - bottomA);
      const rawB = Math.abs(targetElevation.baseNode(bx, by) - bottomB);

      // 顶点顺序：[topA, bottomA, topB, bottomB]
      const base = v;
      position[v * 3] = pa.x; position[v * 3 + 1] = topA; position[v * 3 + 2] = pa.z;
      inkFor(sign, visualA, true, scratch); color[v * 3] = scratch.r; color[v * 3 + 1] = scratch.g; color[v * 3 + 2] = scratch.b;
      v += 1;
      position[v * 3] = pa.x; position[v * 3 + 1] = bottomA; position[v * 3 + 2] = pa.z;
      inkFor(sign, visualA, false, scratch); color[v * 3] = scratch.r; color[v * 3 + 1] = scratch.g; color[v * 3 + 2] = scratch.b;
      v += 1;
      position[v * 3] = pb.x; position[v * 3 + 1] = topB; position[v * 3 + 2] = pb.z;
      inkFor(sign, visualB, true, scratch); color[v * 3] = scratch.r; color[v * 3 + 1] = scratch.g; color[v * 3 + 2] = scratch.b;
      v += 1;
      position[v * 3] = pb.x; position[v * 3 + 1] = bottomB; position[v * 3 + 2] = pb.z;
      inkFor(sign, visualB, false, scratch); color[v * 3] = scratch.r; color[v * 3 + 1] = scratch.g; color[v * 3 + 2] = scratch.b;
      v += 1;

      // 两个三角形：topA-bottomA-topB、topB-bottomA-bottomB
      index[t] = base; index[t + 1] = base + 1; index[t + 2] = base + 2;
      index[t + 3] = base + 2; index[t + 4] = base + 1; index[t + 5] = base + 3;
      t += 6;

      gapSum += (rawA + rawB) / 2;
      gapMax = Math.max(gapMax, rawA, rawB);
      depthMax = Math.max(depthMax, visualA, visualB);
      depthMin = Math.min(depthMin, visualA, visualB);
      edges += 1;
    }

    this.geometry.setDrawRange(0, t);
    this.geometry.index.needsUpdate = true;
    this.position.needsUpdate = true;
    this.color.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.edges = edges;
    this.vertices = v;
    this.stats = {
      edges,
      triangles: edges * 2,
      vertices: v,
      rawGapMax: gapMax,
      rawGapMean: edges ? gapSum / edges : 0,
      visualDepthMax: depthMax,
      visualDepthMin: Number.isFinite(depthMin) ? depthMin : 0,
    };
    return this.stats;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
