// 水墨沙盒 · 3D 聚落 / 屋舍 / 宗门表现层（Render3D M1-B）
//
// ───────────────────────────────────────────────────────────────────────
// 这一层负责什么
// ───────────────────────────────────────────────────────────────────────
//
// 「3D 世界如果只有人，会像一群棋子在荒山里散步。」——所以第二优先级是**人造空间**：
// 村落 / 集镇 / 城池 / 王都的屋舍，以及宗门山门。远景一眼能看出「这里是一片村落」。
//
// ⚠️ **只读**：不写 `world`、不抽 RNG。屋舍坐标**直接复用** `village.houses` 里
//    已有的真实 `{x, y, type}`——**绝不重新生成房屋分布**（Canvas 已经有真坐标）。
// ⚠️ 聚落等级**只读** `village.level`（1..4 = 村落 / 集镇 / 城池 / 王都），
//    **不新增第二套人口等级规则**；等级只改**表现**（建筑比例 / 密度 / 中心高度）。
// ⚠️ 宗门只读 `f.color` / `f.accent`（唯一真源 `FACTION_COLORS`），**不另定义配色**。
//
// ───────────────────────────────────────────────────────────────────────
// 性能纪律
// ───────────────────────────────────────────────────────────────────────
//
// **禁止每屋一个 Mesh**。本层只用 **2 个 `InstancedMesh`**（墙体 + 屋顶），
// 二者**共享同一份 geometry / material 定义**、颜色走 `instanceColor`：
//   · 屋舍 / 聚落中心建筑 / 宗门大殿 —— 都是同一个单位立方体按不同 `scale`；
//   · 屋顶 —— 同一个单位四棱锥。
// 于是「一整个世界的建筑」= **2 次 draw call**。
// 建筑是半静态的 ⇒ 刷新频率 **4 Hz**（与实体分开，蓝图 §七 明令「建筑无需跟人物同频」）。

import * as THREE from 'three';
import { ElevationField } from '../terrain/ElevationField.js';
import { STRUCT, INK } from '../../core/config.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

/** 建筑实例容量：`maxVillages`(220) × 每村最多 19 屋 + 中心建筑 + 宗门（max 10）。 */
const CAPACITY = 4608;

/** 屋舍配色走水墨调色板（复用既有 `INK`，不新造一套）。 */
const HOUSE_BODY = INK.inkMid;
const HOUSE_ROOF = INK.ink;

/** 村落等级 → 建筑整体比例。**只改表现，不改任何人口 / 容量数值。** */
function levelScale(level) {
  const lv = Math.max(1, Math.min(4, Number(level) || 1));
  return 0.8 + lv * 0.15;                 // 村落 0.95 → 王都 1.40
}

/**
 * 世界状态 → 建筑记录（**纯函数**，可在 node 里直接断言）。
 *
 * 每条记录 `{ x, y, w, h, d, roofH, body, roof }`（x/y 已是**格中心**）：
 * 墙体从地表起、高 `h`；屋顶接在 `h` 处、高 `roofH`。
 *
 * @returns {{buildings:Array, villages:number, houses:number, centers:number, sects:number}}
 */
export function deriveSettlements(world) {
  const out = { buildings: [], villages: 0, houses: 0, centers: 0, sects: 0 };
  if (!world) return out;

  const villages = Array.isArray(world.villages) ? world.villages : [];
  for (const v of villages) {
    if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) continue;
    const scale = levelScale(v.level);
    const houses = Array.isArray(v.houses) ? v.houses : [];
    for (const h of houses) {
      if (!h || !Number.isFinite(h.x) || !Number.isFinite(h.y)) continue;
      // 宗祠（`STRUCT.HALL`）比普通屋舍大一号——复用**已有**的 `h.type` 字段。
      const s = scale * (h.type === STRUCT.HALL ? 1.6 : 1);
      out.buildings.push({
        x: h.x + 0.5, y: h.y + 0.5,
        w: 1.5 * s, h: 1.8 * s, d: 1.5 * s, roofH: 1.0 * s,
        body: HOUSE_BODY, roof: HOUSE_ROOF,
      });
      out.houses += 1;
    }
    // 中心建筑：等级 ≥ 2 的聚落在自己的中心格加一座明显更高的楼——
    // 这是「村落 / 集镇 / 城池 / 王都」体量差异最直观的读法（**派生量，不是新规则**）。
    if ((Number(v.level) || 1) >= 2) {
      const s = scale * 1.9;
      out.buildings.push({
        x: v.x + 0.5, y: v.y + 0.5,
        w: 2.2 * s, h: 2.6 * s, d: 2.2 * s, roofH: 1.6 * s,
        body: HOUSE_BODY, roof: HOUSE_ROOF,
      });
      out.centers += 1;
    }
    out.villages += 1;
  }

  const factions = Array.isArray(world.factions) ? world.factions : [];
  for (const f of factions) {
    if (!f || !Number.isFinite(f.capitalX) || !Number.isFinite(f.capitalY)) continue;
    // 山门 / 大殿：明显高于普通聚落的一个低模符号；颜色用既有 f.color / f.accent。
    out.buildings.push({
      x: f.capitalX + 0.5, y: f.capitalY + 0.5,
      w: 5, h: 7, d: 5, roofH: 3.2,
      body: f.color || HOUSE_BODY, roof: f.accent || HOUSE_ROOF,
    });
    out.sects += 1;
  }
  return out;
}

/** 精确比较（不用哈希，无碰撞风险）：这批建筑和上一批一样吗。 */
export function sameSettlements(a, b) {
  if (!a || !b) return false;
  const x = a.buildings; const y = b.buildings;
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i += 1) {
    const p = x[i]; const q = y[i];
    if (p.x !== q.x || p.y !== q.y || p.w !== q.w || p.h !== q.h
      || p.d !== q.d || p.body !== q.body || p.roof !== q.roof) return false;
  }
  return true;
}

export class SettlementLayer {
  constructor(world, coordinates, elevation = new ElevationField(world)) {
    this.elevation = elevation;
    this.coordinates = coordinates;
    this.interval = 1 / 4;                  // 半静态：4 Hz
    this.clock = Infinity;
    this.lastDerived = null;
    this.colorCache = new Map();
    this.dummy = new THREE.Object3D();
    this.stats = { buildings: 0, villages: 0, houses: 0, centers: 0, sects: 0, overflow: 0 };

    // 单位立方体，底面在 y=0（缩放后直接落地）。
    this.bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.bodyGeometry.translate(0, 0.5, 0);
    // 单位四棱锥屋顶：半径 0.72 ⇒ 内接方边长 ≈ 1.02（略出檐）。
    this.roofGeometry = new THREE.ConeGeometry(0.72, 1, 4);
    this.roofGeometry.translate(0, 0.5, 0);
    this.roofGeometry.rotateY(Math.PI / 4);

    this.group = new THREE.Group();
    this.group.name = 'SettlementLayer';
    this.bodies = this.makeMesh(this.bodyGeometry, 'Settlement:body');
    this.roofs = this.makeMesh(this.roofGeometry, 'Settlement:roof');
  }

  makeMesh(geometry, name) {
    const material = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
    const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.count = 0;
    mesh.name = name;
    mesh.renderOrder = RENDER_ORDER.settlements;
    this.group.add(mesh);
    return mesh;
  }

  update(dt, world, options = {}) {
    this.clock += Number.isFinite(dt) ? dt : 0;
    const force = !!options.heightChanged;
    if (!force && this.clock < this.interval) return false;
    this.clock = 0;
    const derived = deriveSettlements(world);
    if (!force && sameSettlements(derived, this.lastDerived)) return false;
    this.write(derived, world);
    return true;
  }

  write(derived, world) {
    const list = derived.buildings;
    const capacity = this.bodies.instanceMatrix.count;
    const n = Math.min(list.length, capacity);
    const overflow = list.length > capacity ? list.length - capacity : 0;
    for (let i = 0; i < n; i += 1) {
      const b = list[i];
      const p = this.coordinates.worldToRender(b.x, b.y, 0);
      const ground = this.elevation.at(b.x, b.y);
      this.dummy.rotation.set(0, 0, 0);

      this.dummy.position.set(p.x, ground, p.z);
      this.dummy.scale.set(b.w, b.h, b.d);
      this.dummy.updateMatrix();
      this.bodies.setMatrixAt(i, this.dummy.matrix);
      this.bodies.setColorAt(i, this.colorOf(b.body));

      this.dummy.position.set(p.x, ground + b.h, p.z);
      this.dummy.scale.set(b.w, b.roofH, b.d);
      this.dummy.updateMatrix();
      this.roofs.setMatrixAt(i, this.dummy.matrix);
      this.roofs.setColorAt(i, this.colorOf(b.roof));
    }
    for (const mesh of [this.bodies, this.roofs]) {
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.lastDerived = derived;
    this.stats = {
      buildings: n, villages: derived.villages, houses: derived.houses,
      centers: derived.centers, sects: derived.sects, overflow,
    };
  }

  colorOf(hex) {
    let color = this.colorCache.get(hex);
    if (!color) { color = new THREE.Color(hex); this.colorCache.set(hex, color); }
    return color;
  }

  dispose() {
    for (const mesh of [this.bodies, this.roofs]) {
      mesh.material.dispose();
      mesh.dispose();
    }
    this.bodyGeometry.dispose();
    this.roofGeometry.dispose();
    this.group.clear();
    this.colorCache.clear();
    this.lastDerived = null;
  }
}
