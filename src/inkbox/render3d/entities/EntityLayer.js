// 水墨沙盒 · 3D 实体表现层（Render3D M1-A）
//
// ───────────────────────────────────────────────────────────────────────
// 这一层负责什么
// ───────────────────────────────────────────────────────────────────────
//
// 把 `world.entities`（凡人 / 修士 / 灵兽 / 山精）与 `world.wraiths`（凡间鬼影）
// 画成山河里的**小棋子**——远景一眼能看出「这里有人，而且大概知道是什么人」。
//
// ⚠️ **只读**：本文件不写 `world`、不抽模拟 RNG、不 `Math.random`。
//    实体的真实 x/y **一个字节都不改**；它只决定「画在哪、画成什么样」。
//
// ───────────────────────────────────────────────────────────────────────
// 性能纪律（蓝图 §七）
// ───────────────────────────────────────────────────────────────────────
//
// 实体上限约 3000 ⇒ **禁止每人一个 `THREE.Mesh`**。本层按**视觉类别**建 5 个
// `InstancedMesh`（human / cultivator / beast / spirit / wraith），颜色走
// `instanceColor`，geometry / material 每类各一份、**共享给该类全部实例**。
// 目标：普通生灵全部加起来 **5 次 draw call**（类别为空时 `visible=false`，连这次也省掉）。
//
// 更新频率 **15 Hz**（蓝图给的是 10～20 Hz）——相机仍按渲染帧更新，只有实体表现
// 降频；且**派生结果没变就整层不重写**（写 `instanceMatrix` 的代价主要在 GPU 上传）。
//
// ⚠️ 高度**不得用固定 Y**：一律 `stage.elevation.at(x, y)`（M2-B §8 高程单源，
//    与地形网格同一套三角插值）⇒ 玩家抬高山峰后，单位下一次刷新就站在新地表上。

import * as THREE from 'three';
import { ElevationField } from '../terrain/ElevationField.js';
import { deriveEntities, sameEntities, ENTITY_CLASSES } from './deriveEntities.js';
import { RegionGeometry } from '../region/RegionGeometry.js';
import { LIMITS } from '../../core/config.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

/**
 * 实例容量。`LIMITS.maxEntities`（3000，凡间生灵上限）+ 余量覆盖 `world.wraiths`
 * 与 `LIMITS.maxVillages` 级别的波动。每类各一份 ⇒ 5 × 3256 × 16 float ≈ 1 MB，
 * 一次性分配、**不随帧增长**。
 */
const CAPACITY = LIMITS.maxEntities + 256;

/** 每类视觉语言（蓝图 M1-A2）。几何体**底面在 y=0**，实例位置直接落在地表。 */
const STYLE = Object.freeze({
  // 凡人：低矮简洁墨色几何体。
  human: { size: [1.1, 2.4, 1.1] },
  // 修士：轮廓与凡人接近，但更高瘦一点（颜色再按宗门 / 境界区分）。
  cultivator: { size: [1.0, 2.9, 1.0] },
  // 灵兽：横向、四足感。
  beast: { size: [2.5, 1.1, 1.5] },
  // 山精：圆润的小型标记（下面单独建 Icosahedron）。
  spirit: { size: [1.7, 1.7, 1.7] },
  // 鬼影：凡人轮廓的冷墨半透明版。
  wraith: { size: [1.0, 2.2, 1.0], opacity: 0.55 },
});

function geometryFor(cls) {
  if (cls === 'spirit') {
    const g = new THREE.IcosahedronGeometry(0.85, 0);
    g.translate(0, 0.85, 0);
    return g;
  }
  const [w, h, d] = STYLE[cls].size;
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return g;
}

export class EntityLayer {
  constructor(world, coordinates, elevation = new ElevationField(world), { derive = deriveEntities } = {}) {
    this.coordinates = coordinates;
    this.elevation = elevation;
    this.derive = derive;
    this.regionGeometry = null;
    this.regionMask = null;
    this.regionInside = true;
    this.interval = 1 / 15;
    this.clock = Infinity;          // 首帧必刷
    this.lastDerived = null;
    this.colorCache = new Map();    // '#rrggbb' → THREE.Color（避免每帧 new 3000 个）
    this.dummy = new THREE.Object3D();
    this.meshes = {};
    this.stats = { instances: 0, byClass: {}, overflow: 0 };

    this.group = new THREE.Group();
    this.group.name = 'EntityLayer';
    for (const cls of ENTITY_CLASSES) {
      const style = STYLE[cls];
      const material = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
      if (style.opacity != null) {
        material.transparent = true; material.opacity = style.opacity; material.depthWrite = false;
      }
      const mesh = new THREE.InstancedMesh(geometryFor(cls), material, CAPACITY);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;   // 实例铺满全图，默认包围球（单位几何）会误剔除
      mesh.visible = false;
      mesh.count = 0;
      mesh.name = `Entity:${cls}`;
      mesh.renderOrder = RENDER_ORDER.entities;
      this.meshes[cls] = mesh;
      this.group.add(mesh);
    }
  }

  /**
   * @param {number} dt 真实秒
   * @param {object} world 凡间 world
   * @param {{heightChanged?:boolean}} options `heightChanged` ⇒ 跳过频率与去重，强制重写
   *   （**只有高度变了**才需要重贴地，哪怕人没动）。
   *   ⚠️ M1.1D D4.2：`water` / `type` / `veg` 变化**不**该让所有人重写 Y——
   *   那是 M1 把四层揉成一个 dirty region 时的过粗行为。
   * @returns {boolean} 本帧是否真的重写了实例
   */
  update(dt, world, options = {}) {
    this.clock += Number.isFinite(dt) ? dt : 0;
    const force = !!options.heightChanged;
    if (!force && this.clock < this.interval) return false;
    this.clock = 0;
    const derived = this.derive(world);
    if (!force && sameEntities(derived, this.lastDerived)) return false;
    this.write(derived, world);
    return true;
  }

  write(derived, world) {
    let instances = 0; let overflow = 0;
    const byClass = {};
    for (const cls of ENTITY_CLASSES) {
      const mesh = this.meshes[cls];
      const list = this.regionGeometry && !this.regionGeometry.allInside
        ? derived[cls].filter(item => this.regionGeometry.isInsideCell(item.x, item.y) === this.regionInside)
        : derived[cls];
      const capacity = mesh.instanceMatrix.count;
      const n = Math.min(list.length, capacity);
      if (list.length > capacity) overflow += list.length - capacity;
      for (let i = 0; i < n; i += 1) {
        const item = list[i];
        // ⚠️ 只读 x/y；高度一律走地表插值，不用固定 Y。
        const p = this.coordinates.worldToRender(item.x, item.y, 0);
        this.dummy.position.set(p.x, this.elevation.at(item.x, item.y) + item.lift, p.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        mesh.setColorAt(i, this.colorOf(item.color));
      }
      mesh.count = n;
      // instanceId is local to the filtered batch, not to the world container.
      mesh.userData.renderEntities = list.slice(0, n);
      mesh.visible = n > 0;         // 空类别 ⇒ 连这次 draw call 都省掉
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      byClass[cls] = n;
      instances += n;
    }
    this.lastDerived = derived;
    this.stats = { instances, byClass, overflow };
  }

  colorOf(hex) {
    let color = this.colorCache.get(hex);
    if (!color) { color = new THREE.Color(hex); this.colorCache.set(hex, color); }
    return color;
  }

  /**
   * §19：区域判据只来自 `RegionGeometry`（不再自己调 `region.contains`）。
   * `this.regionMask` 保留 `RegionMask` 本体供读数 / M2-A 断言使用。
   */
  setRegionGeometry(geometry, inside = true) {
    if (this.regionGeometry === geometry && this.regionInside === !!inside) return;
    this.regionGeometry = geometry || null;
    this.regionInside = !!inside;
    this.regionMask = geometry?.region || null;
    this.lastDerived = null;
    this.clock = Infinity;
  }

  /** 兼容入口（M2-A 调用方与测试按 RegionMask 传参）。 */
  setRegionMask(region, inside = true) {
    this.setRegionGeometry(region ? new RegionGeometry(this.world, region) : null, inside);
  }

  dispose() {
    for (const cls of ENTITY_CLASSES) {
      const mesh = this.meshes[cls];
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
      mesh.userData.renderEntities = [];
    }
    this.group.clear();
    this.colorCache.clear();
    this.lastDerived = null;
  }
}
