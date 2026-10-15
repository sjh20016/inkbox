import * as THREE from 'three';
import { RENDER_ORDER } from '../shared/RenderOrder.js';
import { createBoundaryInkMaterial, applyBoundaryInkStyle } from './BoundaryInkMaterial.js';

/**
 * M2-B B2/B4 · 界缘断面（§30–§33 / §44–§47 / §55–§60）。
 *
 * 职责只有一件：画**当前 RealmView Region 的空间断面**。
 * 它**不是** rift manager，也**不是** simulation seal（§31 / S6）——
 * 裂缝是 World 的持久对象（`world.rifts`），界缘只是「当前这扇窗」的表现。
 *
 * ── Rift Breach（§55–§60）─────────────────────────────────────────────
 * 结构必须是（§56）：
 * ```text
 * World rifts → riftViewModel（唯一读入口）
 * Current RealmBoundary → 与 active rifts 求**视觉交叠** → 出现 breach
 * ```
 * 界缘**不持有** `world.rifts`，只接收已经算好的 `rifts: [{x, y, radius}]`。
 * 直径与 `riftRadiusAt()` 关联，而半径一律经 `readers/riftViewModel.js` 取，
 * **不复制**裂缝半径公式（§58）。breach 纯表现：不改 rift、不改半径、不延寿、
 * 不改概率、不改跨界结果（§60）。
 *
 * ── 几何（§32 / §33）──────────────────────────────────────────────────
 * 每条边界边 1 个 quad（2 三角形）。XZ 完全来自共享世界格网节点；
 * 下端 = `mortalElevation.node()`，上端 = `targetElevation.node()`——
 * 与目标地形网格写顶点时**同一个调用** ⇒ 零缝隙由构造保证，不是调参结果。
 *
 * ── 预算（§86）────────────────────────────────────────────────────────
 * 三角形数 = 边界边数 × 2，与 **Region 周长**相关，与面积无关。
 *
 * ── 材质（§44 / M2-C2D P3）──────────────────────────────────────────────
 * 一档 `BoundaryInkMaterial`（独立文件：顶点色 + 竖向层理 / 干笔 / 底缘消隐 /
 * 顶缘窄亮带），几何与拾取契约不变。仍然没有 EffectComposer / RenderTarget /
 * WebGPU / 全屏水墨管线（§46 留给 Art Pass）。
 */

const DEPTH_REFERENCE = 60;
const INK_LIGHT = new THREE.Color('#8f8a7c');     // 上界顶部：轻、向上亮
const INK_MID = new THREE.Color('#4a463e');
const INK_DEEP = new THREE.Color('#22201c');      // 底端 / 幽冥：暗、向下沉
// §59：继承 Canvas 的裂缝语言（青色微光），**不**新造红色科幻激光。
const RIFT_GLOW = new THREE.Color('#4a7a8a');

function inkFor(sign, visualDepth, isTop, target) {
  const depth = Math.max(0, Math.min(1, visualDepth / DEPTH_REFERENCE));
  if (sign > 0) {
    target.copy(isTop ? INK_LIGHT : INK_MID).lerp(INK_DEEP, isTop ? depth * 0.45 : 0.2 + depth * 0.35);
  } else {
    target.copy(isTop ? INK_MID : INK_DEEP).lerp(INK_DEEP, isTop ? depth * 0.5 : 0.55 + depth * 0.45);
  }
  return target;
}

/** 线段到圆心的最短距离 ≤ 半径 ⇒ 这条边界边落在破口里（§58）。 */
export function edgeIntersectsRift(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax, dy = by - ay;
  const length2 = dx * dx + dy * dy;
  let t = length2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / length2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(cx - (ax + t * dx), cy - (ay + t * dy)) <= radius;
}

export class RealmBoundaryLayer {
  constructor({ coordinates }) {
    this.coordinates = coordinates;
    this.vertices = 0;
    this.edges = 0;
    this.position = new THREE.BufferAttribute(new Float32Array(0), 3).setUsage(THREE.DynamicDrawUsage);
    this.color = new THREE.BufferAttribute(new Float32Array(0), 3).setUsage(THREE.DynamicDrawUsage);
    // M2-C2D P3：只读表现属性——底 0 / 顶 1，以及按边坐标稳定 hash 的 edgeSeed。
    this.vertical = new THREE.BufferAttribute(new Float32Array(0), 1).setUsage(THREE.DynamicDrawUsage);
    this.edgeSeed = new THREE.BufferAttribute(new Float32Array(0), 1).setUsage(THREE.DynamicDrawUsage);
    this.legacyColors = new Float32Array(0);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('color', this.color);
    this.geometry.setAttribute('aVertical', this.vertical);
    this.geometry.setAttribute('aSeed', this.edgeSeed);
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(0), 1).setUsage(THREE.DynamicDrawUsage));
    this.material = createBoundaryInkMaterial();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'RealmBoundary';
    this.mesh.renderOrder = RENDER_ORDER.realmBoundary;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.key = null;
    this.realmStyle = null;
    this.realmPalette = { top: new THREE.Color(), base: new THREE.Color(), rift: new THREE.Color() };
    this.boundaryDirection = 'up';
    this.sign = 1;
    // 拾取与读数用的逐边数据（§62）
    this.edgeNodes = new Int32Array(0);
    this.edgeRawGap = new Float32Array(0);
    this.edgeVisualDepth = new Float32Array(0);
    this.edgeBreach = new Uint8Array(0);
    this.rifts = [];
    this.stats = emptyStats();
  }

  setVisible(visible) { this.mesh.visible = !!visible; }

  /** Apply profile-owned colours to the current boundary buffers; null restores legacy ink. */
  setRealmStyle(style = null, realmStyle = null) {
    if (this.realmStyle === style && this.realmInkStyle === realmStyle) return;
    this.realmStyle = style;
    this.realmInkStyle = realmStyle;
    if (style) {
      if (style.top) this.realmPalette.top.set(style.top);
      if (style.base) this.realmPalette.base.set(style.base);
      if (style.rift) this.realmPalette.rift.set(style.rift);
    }
    applyBoundaryInkStyle(this.material, realmStyle);
    this.#rewriteColors();
  }

  #rewriteColors() {
    if (!this.edges) return;
    const positions = this.position.array;
    const colors = this.color.array;
    const style = this.realmStyle;
    const hasRamp = !!(style?.top && style?.base);
    const top = new THREE.Color();
    const base = new THREE.Color();
    for (let edge = 0; edge < this.edges; edge += 1) {
      const breach = this.edgeBreach[edge] === 1;
      const edgeVertex = edge * 4;
      for (let endpoint = 0; endpoint < 4; endpoint += 2) {
        const topVertex = edgeVertex + endpoint, baseVertex = topVertex + 1;
        const depth = Math.abs(positions[topVertex * 3 + 1] - positions[baseVertex * 3 + 1]);
        if (breach) {
          top.copy(style?.rift ? this.realmPalette.rift : RIFT_GLOW);
          base.copy(top).multiplyScalar(0.72);
        } else if (hasRamp) {
          top.copy(this.realmPalette.top);
          base.copy(this.realmPalette.base);
        } else {
          inkFor(this.sign, depth, true, top);
          inkFor(this.sign, depth, false, base);
        }
        colors[topVertex * 3] = top.r; colors[topVertex * 3 + 1] = top.g; colors[topVertex * 3 + 2] = top.b;
        colors[baseVertex * 3] = base.r; colors[baseVertex * 3 + 1] = base.g; colors[baseVertex * 3 + 2] = base.b;
      }
    }
    if (!style) colors.set(this.legacyColors.subarray(0, this.vertices * 3));
    this.color.needsUpdate = true;
  }

  /** 缓存键：Region identity + 预设 + 目标位面 + 活跃裂缝签名（§85）。 */
  static keyFor({ region, mode, sign, targetPlane, riftSignature = '' }) {
    return `${mode}|${sign}|${targetPlane}|${region.x0},${region.y0},${region.x1},${region.y1},${region.path?.length ?? 0}|${riftSignature}`;
  }

  clear() {
    this.geometry.setDrawRange(0, 0);
    this.edges = 0;
    this.vertices = 0;
    this.stats = emptyStats();
  }

  #ensureCapacity(edgeCount) {
    const vertices = edgeCount * 4;
    if (this.position.count >= vertices) return;
    this.position = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.color = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.vertical = new THREE.BufferAttribute(new Float32Array(vertices), 1).setUsage(THREE.DynamicDrawUsage);
    this.edgeSeed = new THREE.BufferAttribute(new Float32Array(vertices), 1).setUsage(THREE.DynamicDrawUsage);
    this.legacyColors = new Float32Array(vertices * 3);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('color', this.color);
    this.geometry.setAttribute('aVertical', this.vertical);
    this.geometry.setAttribute('aSeed', this.edgeSeed);
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
   * @param {Array<{x:number,y:number,radius:number}>} [options.rifts] 已按目标位面过滤的活跃裂缝
   * @param {string} [options.key] 缓存键
   */
  rebuild({ regionGeometry, mortalElevation, targetElevation, sign, rifts = [], key = null, targetPlane = null, accessBounds = null }) {
    const edgeCount = regionGeometry?.edgeCount ?? 0;
    this.key = key;
    this.sign = sign;
    this.targetPlane = targetPlane;
    this.rifts = rifts;
    this.boundaryDirection = sign > 0 ? 'up' : 'down';
    if (!edgeCount) { this.clear(); return this.stats; }
    this.#ensureCapacity(edgeCount);

    const position = this.position.array;
    const index = this.geometry.index.array;
    const legacyColors = this.legacyColors;
    const scratch = new THREE.Color();
    let v = 0;
    let t = 0;
    let gapSum = 0;
    let gapMax = 0;
    let depthMax = 0;
    let depthMin = Infinity;
    let edges = 0;
    let breachEdges = 0;

    for (const { ax, ay, bx, by } of regionGeometry.boundaryEdges()) {
      // Clip only true realm boundary edges. Access edges never become physical walls.
      if (accessBounds && (Math.min(ax, bx) < accessBounds.x0 || Math.max(ax, bx) > accessBounds.x1
        || Math.min(ay, by) < accessBounds.y0 || Math.max(ay, by) > accessBounds.y1)) continue;
      const pa = this.coordinates.cellToRender(ax, ay);
      const pb = this.coordinates.cellToRender(bx, by);
      // ⚠️ §33：这两个调用与目标 Stage 地形网格写顶点时**完全同源**。
      const topA = targetElevation.node(ax, ay);
      const topB = targetElevation.node(bx, by);
      const bottomA = mortalElevation.node(ax, ay);
      const bottomB = mortalElevation.node(bx, by);
      const visualA = Math.abs(topA - bottomA);
      const visualB = Math.abs(topB - bottomB);
      const rawA = Math.abs(targetElevation.baseNode(ax, ay) - bottomA);
      const rawB = Math.abs(targetElevation.baseNode(bx, by) - bottomB);

      // ── 破口（§58）：与任何活跃裂缝的圆相交即视为裂口 ──
      let breach = false;
      for (const rift of rifts) {
        if (edgeIntersectsRift(ax, ay, bx, by, rift.x, rift.y, rift.radius)) { breach = true; break; }
      }
      if (breach) breachEdges += 1;

      const base = v;
      position[v * 3] = pa.x; position[v * 3 + 1] = topA; position[v * 3 + 2] = pa.z;
      (breach ? scratch.copy(RIFT_GLOW) : inkFor(sign, visualA, true, scratch));
      legacyColors[v * 3] = scratch.r; legacyColors[v * 3 + 1] = scratch.g; legacyColors[v * 3 + 2] = scratch.b;
      v += 1;
      position[v * 3] = pa.x; position[v * 3 + 1] = bottomA; position[v * 3 + 2] = pa.z;
      (breach ? scratch.copy(RIFT_GLOW).multiplyScalar(0.72) : inkFor(sign, visualA, false, scratch));
      legacyColors[v * 3] = scratch.r; legacyColors[v * 3 + 1] = scratch.g; legacyColors[v * 3 + 2] = scratch.b;
      v += 1;
      position[v * 3] = pb.x; position[v * 3 + 1] = topB; position[v * 3 + 2] = pb.z;
      (breach ? scratch.copy(RIFT_GLOW) : inkFor(sign, visualB, true, scratch));
      legacyColors[v * 3] = scratch.r; legacyColors[v * 3 + 1] = scratch.g; legacyColors[v * 3 + 2] = scratch.b;
      v += 1;
      position[v * 3] = pb.x; position[v * 3 + 1] = bottomB; position[v * 3 + 2] = pb.z;
      (breach ? scratch.copy(RIFT_GLOW).multiplyScalar(0.72) : inkFor(sign, visualB, false, scratch));
      legacyColors[v * 3] = scratch.r; legacyColors[v * 3 + 1] = scratch.g; legacyColors[v * 3 + 2] = scratch.b;
      v += 1;

      // ⚠️ 破口**不是**「把墙切断」：墙仍然连续（§33 的零缝隙对每一段都成立），
      //    只是这一段换成裂缝的青光。这样既读得出「这里被裂开了」，
      //    又不会在看另一界时露出一条通向天空的真空缝。
      index[t] = base; index[t + 1] = base + 1; index[t + 2] = base + 2;
      index[t + 3] = base + 2; index[t + 4] = base + 1; index[t + 5] = base + 3;
      t += 6;

      // P3 只读表现属性：底 0 / 顶 1，与稳定 edge seed（不参与几何，也不影响 zero-gap）。
      const vertical = this.vertical.array, seeds = this.edgeSeed.array;
      vertical[base] = 1; vertical[base + 1] = 0; vertical[base + 2] = 1; vertical[base + 3] = 0;
      let edgeHash = (ax * 73856093) ^ (ay * 19349663) ^ (bx * 83492791) ^ (by * 2971215073);
      const edgeSeedValue = ((edgeHash >>> 0) % 997) / 997;
      seeds[base] = seeds[base + 1] = seeds[base + 2] = seeds[base + 3] = edgeSeedValue;

      if (this.edgeNodes.length < (edges + 1) * 4) {
        this.edgeNodes = new Int32Array(Math.max(edges + 1, edgeCount) * 4);
        this.edgeRawGap = new Float32Array(Math.max(edges + 1, edgeCount));
        this.edgeVisualDepth = new Float32Array(Math.max(edges + 1, edgeCount));
        this.edgeBreach = new Uint8Array(Math.max(edges + 1, edgeCount));
      }
      this.edgeNodes[edges * 4] = ax; this.edgeNodes[edges * 4 + 1] = ay;
      this.edgeNodes[edges * 4 + 2] = bx; this.edgeNodes[edges * 4 + 3] = by;
      this.edgeRawGap[edges] = (rawA + rawB) / 2;
      this.edgeVisualDepth[edges] = (visualA + visualB) / 2;
      this.edgeBreach[edges] = breach ? 1 : 0;

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
    this.vertical.needsUpdate = true;
    this.edgeSeed.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.edges = edges;
    this.vertices = v;
    this.#rewriteColors();
    this.stats = {
      edges,
      triangles: edges * 2,
      vertices: v,
      rawGapMax: gapMax,
      rawGapMean: edges ? gapSum / edges : 0,
      visualDepthMax: depthMax,
      visualDepthMin: Number.isFinite(depthMin) ? depthMin : 0,
      breachEdges,
      breachRatio: edges ? breachEdges / edges : 0,
      riftCount: rifts.length,
    };
    return this.stats;
  }

  /**
   * §62 Boundary Picking：按**三角形索引**反查这条边。
   * @param {number} faceIndex `THREE.Intersection.faceIndex`（每条边 2 个三角形）
   */
  edgeAtTriangle(faceIndex) {
    if (!Number.isInteger(faceIndex) || faceIndex < 0) return null;
    const edge = faceIndex >> 1;
    if (edge >= this.edges) return null;
    const nodes = this.edgeNodes;
    return {
      kind: 'realm-boundary',
      targetPlane: this.targetPlane,
      direction: this.boundaryDirection,
      x: (nodes[edge * 4] + nodes[edge * 4 + 2]) / 2,
      y: (nodes[edge * 4 + 1] + nodes[edge * 4 + 3]) / 2,
      ax: nodes[edge * 4], ay: nodes[edge * 4 + 1], bx: nodes[edge * 4 + 2], by: nodes[edge * 4 + 3],
      rawGap: this.edgeRawGap[edge],
      visualDepth: this.edgeVisualDepth[edge],
      breach: this.edgeBreach[edge] === 1,
      nearbyRifts: this.#nearbyRifts(edge),
    };
  }

  /** 该边附近的活跃裂缝（**只读**读数，§62 / §63）。 */
  #nearbyRifts(edge) {
    const nodes = this.edgeNodes;
    const ax = nodes[edge * 4], ay = nodes[edge * 4 + 1], bx = nodes[edge * 4 + 2], by = nodes[edge * 4 + 3];
    const found = [];
    for (const rift of this.rifts) {
      if (edgeIntersectsRift(ax, ay, bx, by, rift.x, rift.y, rift.radius)) {
        found.push({ x: rift.x, y: rift.y, radius: rift.radius, targetPlane: this.targetPlane });
      }
    }
    return found;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

function emptyStats() {
  return {
    edges: 0, triangles: 0, vertices: 0, rawGapMax: 0, rawGapMean: 0,
    visualDepthMax: 0, visualDepthMin: 0, breachEdges: 0, breachRatio: 0, riftCount: 0,
  };
}
