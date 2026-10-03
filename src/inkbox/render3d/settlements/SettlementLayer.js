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
import { createBuildingBodyPilot, createBuildingRoofPilot } from '../art/PilotAssets.js';
import { createPilotMaterial, updatePilotMaterial, setPilotView } from '../art/PilotMaterial.js';
import { createBuildingLODBatches } from '../lod/BuildingLODAssets.js';
import { budgetLOD, chooseLOD, LOD_BUDGETS, projectedPixels } from '../lod/PresentationBudget.js';

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
  for (let villageIndex = 0; villageIndex < villages.length; villageIndex++) {
    const v = villages[villageIndex];
    if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) continue;
    const scale = levelScale(v.level);
    const houses = Array.isArray(v.houses) ? v.houses : [];
    const settlementId = Number.isFinite(v.id) ? v.id : `derived-village-${villageIndex}`;
    for (const h of houses) {
      if (!h || !Number.isFinite(h.x) || !Number.isFinite(h.y)) continue;
      // 宗祠（`STRUCT.HALL`）比普通屋舍大一号——复用**已有**的 `h.type` 字段。
      const s = scale * (h.type === STRUCT.HALL ? 1.6 : 1);
      out.buildings.push({
        x: h.x + 0.5, y: h.y + 0.5,
        w: 1.5 * s, h: 1.8 * s, d: 1.5 * s, roofH: 1.0 * s,
        body: HOUSE_BODY, roof: HOUSE_ROOF, settlementId, type: 'house', sourceIndex: out.buildings.length,
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
        body: HOUSE_BODY, roof: HOUSE_ROOF, settlementId, type: 'center', sourceIndex: out.buildings.length,
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
      body: f.color || HOUSE_BODY, roof: f.accent || HOUSE_ROOF, settlementId: null,
      type: 'sect', sourceIndex: out.buildings.length,
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
      || p.d !== q.d || p.body !== q.body || p.roof !== q.roof
      || p.settlementId !== q.settlementId || p.type !== q.type) return false;
  }
  return true;
}

export class SettlementLayer {
  constructor(world, coordinates, elevation = new ElevationField(world)) {
    this.world = world;
    this.elevation = elevation;
    this.regionGeometry = null;
    this.regionInside = true;
    this.coordinates = coordinates;
    this.interval = 1 / 4;                  // 半静态：4 Hz
    this.clock = Infinity;
    this.lastDerived = null;
    this.colorCache = new Map();
    this.dummy = new THREE.Object3D();
    this.lodEnabled = false; this.artView = {};
    this._viewPpu = NaN; this._viewVerticalPpu = NaN;
    this._lodCounts = [0, 0, 0]; this._buildingBudgetCounts = [0, 0, 0]; this._batchCounts = [0, 0, 0, 0, 0]; this._settlementCounts = [0, 0, 0];
    this._budgetDemotions = 0; this._hlodPickEntries = [];
    this._currentLods = new Int8Array(CAPACITY); this._nextLods = new Int8Array(CAPACITY);
    this._currentLods.fill(-1); this._nextLods.fill(-1);
    this._currentHlodBySettlement = new Map(); this._nextHlodBySettlement = new Map();
    this._groups = []; this._groupById = new Map(); this._selectedBuildings = [];
    this._priorityBuildings = []; this._pixelsBySource = new Float64Array(CAPACITY);
    this._desiredLods = new Int8Array(CAPACITY);
    this._priorityVisibility = new Uint8Array(CAPACITY); this._priorityCongested = false;
    this._cameraElements = new Float64Array(32); this._cameraMatrixReady = false;
    this._priorityFrustum = new THREE.Frustum(); this._viewProjection = new THREE.Matrix4();
    this._prioritySphere = new THREE.Sphere(new THREE.Vector3(), 0);
    this._priorityPoint = new THREE.Vector3();
    this._renderBuildingLists = [[], [], []];
    this.stats = { buildings: 0, villages: 0, houses: 0, centers: 0, sects: 0,
      instances: 0, triangles: 0, lod: [0, 0, 0], hlod: 0, overflow: 0,
      capacity: CAPACITY, capacityOverflow: 0, budgetDemotions: 0 };

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
    this.bodies.userData.lod = 0; this.roofs.userData.lod = 0;
    this.bodies.userData.renderBuildings = this._renderBuildingLists[0];
    this.roofs.userData.renderBuildings = this._renderBuildingLists[0];
    this.lodGeometries = createBuildingLODBatches();
    this.lod1 = this.makeMesh(this.lodGeometries[0], 'Settlement:LOD1'); this.lod1.userData.lod = 1;
    this.lod1.userData.renderBuildings = this._renderBuildingLists[1];
    this.lod2 = this.makeMesh(this.lodGeometries[1], 'Settlement:LOD2'); this.lod2.userData.lod = 2;
    this.lod2.userData.renderBuildings = this._renderBuildingLists[2];
    this.hlod = this.makeMesh(this.lodGeometries[1], 'Settlement:HLOD', LOD_BUDGETS.categories.settlement.capacity);
    this.hlod.userData.lod = 2; this.hlod.userData.hlod = true;
    this.hlod.userData.renderSettlements = this._hlodPickEntries;
    this._lodLegacyMaterials = [this.lod1.material, this.lod2.material, this.hlod.material];
    for (const mesh of [this.lod1, this.lod2, this.hlod]) mesh.material.vertexColors = true;
    this.lod1.visible = this.lod2.visible = this.hlod.visible = false;
    this.artProfile = null;
    this.pilotBody = null; this.pilotRoof = null; this.pilotMaterial = null;
    this.legacyMaterials = [this.bodies.material, this.roofs.material];
  }

  setArtProfile(profile) {
    const nextProfile = profile || null;
    const changed = this.artProfile !== nextProfile;
    this.artProfile = profile || null;
    if (profile && !this.pilotBody) {
      this.pilotBody = createBuildingBodyPilot(); this.pilotRoof = createBuildingRoofPilot();
      this.pilotMaterial = createPilotMaterial(profile, 1);
    }
    if (profile) updatePilotMaterial(this.pilotMaterial, profile);
    this.bodies.geometry = profile ? this.pilotBody : this.bodyGeometry;
    this.roofs.geometry = profile ? this.pilotRoof : this.roofGeometry;
    this.bodies.material = profile ? this.pilotMaterial : this.legacyMaterials[0];
    this.roofs.material = profile ? this.pilotMaterial : this.legacyMaterials[1];
    for (const mesh of [this.bodies, this.roofs, this.lod1, this.lod2, this.hlod]) {
      if (mesh !== this.bodies && mesh !== this.roofs) mesh.material = profile ? this.pilotMaterial : this.legacyMaterials[0];
      mesh.boundingBox = null; mesh.boundingSphere = null;
    }
    if (changed && this.lastDerived) this._reassignAndWrite(true);
  }

  setLODEnabled(enabled) {
    const next = !!enabled;
    if (next === this.lodEnabled) return;
    this.lodEnabled = next;
    if (this.lastDerived) this._reassignAndWrite(true);
  }

  setArtView(view = {}) {
    this.artView = view || {};
    if (this.pilotMaterial) setPilotView(this.pilotMaterial, this.artView);
    const ppu = Number.isFinite(this.artView.pixelsPerUnit) ? this.artView.pixelsPerUnit : 1;
    const verticalPpu = Number.isFinite(this.artView.verticalPixelsPerUnit) ? this.artView.verticalPixelsPerUnit : ppu;
    const cameraChanged = this._trackCamera(this.artView.camera);
    const projectionChanged = ppu !== this._viewPpu || verticalPpu !== this._viewVerticalPpu;
    if (projectionChanged || (this._priorityCongested && cameraChanged)) {
      this._viewPpu = ppu; this._viewVerticalPpu = verticalPpu;
      if (this.lastDerived) this._reassignAndWrite(false);
    }
  }

  _trackCamera(camera) {
    const world = camera?.matrixWorld?.elements, projection = camera?.projectionMatrix?.elements;
    if (!world || !projection) return false;
    let changed = false;
    for (let i = 0; i < 16; i++) {
      const a = world[i], b = projection[i];
      if (this._cameraMatrixReady && (this._cameraElements[i] !== a || this._cameraElements[i + 16] !== b)) changed = true;
      this._cameraElements[i] = a; this._cameraElements[i + 16] = b;
    }
    this._cameraMatrixReady = true;
    return changed;
  }

  makeMesh(geometry, name, capacity = CAPACITY) {
    const material = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
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

  /**
   * §19：区域判据只来自 `RegionGeometry`。
   * §23：跨边建筑**按建筑中心格归属**（第一版不做 Mesh clipping）——
   * 边缘会出现「轮廓泄漏半间屋」，已记录给 Art Pass，不在本阶段解决。
   */
  setRegionGeometry(geometry, inside = true) {
    if (this.regionGeometry === geometry && this.regionInside === !!inside) return;
    this.regionGeometry = geometry || null;
    this.regionInside = !!inside;
    this.lastDerived = null;
    this.clock = Infinity;
  }

  write(derived, world) {
    this.world = world;
    this.lastDerived = derived;
    this._prepareMembers(derived);
    this._reassignAndWrite(true);
  }

  _prepareMembers(derived) {
    const masked = !!this.regionGeometry && !this.regionGeometry.allInside;
    const buildings = derived.buildings;
    this._groups.length = 0; this._groupById.clear(); this._selectedBuildings.length = 0;
    for (const b of buildings) {
      const inside = masked ? this.regionGeometry.isInsideCell(b.x, b.y) : true;
      const selected = !masked || inside === this.regionInside;
      if (selected) {
        b._layerIndex = this._selectedBuildings.length;
        this._selectedBuildings.push(b);
      } else b._layerIndex = -1;
      if (b.settlementId == null || (b.type !== 'house' && b.type !== 'center')) continue;
      let group = this._groupById.get(b.settlementId);
      if (!group) {
        group = { id: b.settlementId, members: [], selectedHouses: [], memberIds: [],
          minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity,
          maxHeight: 0, houseCount: 0, side: inside, mixed: false, useHlod: false,
          centerX: 0, centerY: 0, width: 0, depth: 0 };
        this._groupById.set(b.settlementId, group); this._groups.push(group);
      }
      group.members.push(b);
      if (inside !== group.side) group.mixed = true;
      if (b.type === 'house') {
        group.houseCount++;
        if (selected) group.selectedHouses.push(b);
        group.memberIds.push(b.sourceIndex);
        group.minX = Math.min(group.minX, b.x - b.w / 2); group.maxX = Math.max(group.maxX, b.x + b.w / 2);
        group.minY = Math.min(group.minY, b.y - b.d / 2); group.maxY = Math.max(group.maxY, b.y + b.d / 2);
        group.maxHeight = Math.max(group.maxHeight, b.h + b.roofH);
      }
    }
    for (const group of this._groups) {
      if (group.houseCount) {
        group.centerX = (group.minX + group.maxX) / 2; group.centerY = (group.minY + group.maxY) / 2;
        group.width = Math.max(0.75, group.maxX - group.minX); group.depth = Math.max(0.75, group.maxY - group.minY);
        if (masked) {
          const x0 = Math.floor(group.minX), x1 = Math.floor(group.maxX);
          const y0 = Math.floor(group.minY), y1 = Math.floor(group.maxY);
          for (let y = y0; y <= y1 && !group.mixed; y++) for (let x = x0; x <= x1; x++) {
            if (this.regionGeometry.isInsideCell(x, y) !== group.side) { group.mixed = true; break; }
          }
        }
      }
    }
  }

  _reassignAndWrite(forceWrite) {
    if (!this.lastDerived) return;
    const selected = this._selectedBuildings, count = Math.min(selected.length, CAPACITY);
    this._nextLods.fill(-1); this._lodCounts.fill(0); this._buildingBudgetCounts.fill(0);
    this._settlementCounts.fill(0); this._budgetDemotions = 0;
    const previousHlod = this._currentHlodBySettlement, nextHlod = this._nextHlodBySettlement;
    nextHlod.clear();
    for (const group of this._groups) {
      const prior = previousHlod.get(group.id) ? 2 : 1;
      const groupPixels = projectedPixels(group.maxHeight, this.artView, Math.max(group.width, group.depth));
      const wantsHlod = !!(this.world?.plane === 'mortal' && this.artProfile && this.lodEnabled && !group.mixed
        && group.houseCount > 1 && group.selectedHouses.length === group.houseCount
        && chooseLOD('settlement', groupPixels, prior, true) === 2);
      group.useHlod = wantsHlod;
      nextHlod.set(group.id, wantsHlod);
      if (!wantsHlod) continue;
      budgetLOD('settlement', 2, this._settlementCounts);
      for (const b of group.selectedHouses) {
        if (b._layerIndex < 0 || b._layerIndex >= count) continue;
        this._nextLods[b._layerIndex] = 3;
        this._lodCounts[2]++;
      }
    }

    this._priorityBuildings.length = 0;
    let detailedCandidates = 0, middleCandidates = 0;
    const activeLOD = !!(this.artProfile && this.lodEnabled);
    for (let i = 0; i < count; i++) {
      const b = selected[i];
      if (this._nextLods[i] === 3) continue;
      const pixels = projectedPixels(b.h + b.roofH, this.artView, Math.max(b.w, b.d));
      this._pixelsBySource[i] = pixels;
      this._desiredLods[i] = activeLOD
        ? chooseLOD('building', pixels, this._currentLods[i] < 0 ? undefined : this._currentLods[i], true) : 0;
      if (this._desiredLods[i] === 0) detailedCandidates++;
      else if (this._desiredLods[i] === 1) middleCandidates++;
      this._priorityBuildings.push(b);
    }
    if (activeLOD && (detailedCandidates > LOD_BUDGETS.categories.building.lod0
      || middleCandidates > LOD_BUDGETS.categories.building.lod1)) {
      this._priorityCongested = true;
      const camera = this.artView.camera;
      if (camera?.isCamera && camera.matrixWorldInverse && camera.projectionMatrix) {
        this._viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this._priorityFrustum.setFromProjectionMatrix(this._viewProjection);
        for (const b of this._priorityBuildings) this._priorityVisibility[b._layerIndex] = this._priorityVisible(b);
      } else for (const b of this._priorityBuildings) this._priorityVisibility[b._layerIndex] = 1;
      this._priorityBuildings.sort((a, b) => this._priorityVisibility[b._layerIndex] - this._priorityVisibility[a._layerIndex]
        || this._pixelsBySource[b._layerIndex] - this._pixelsBySource[a._layerIndex] || a.sourceIndex - b.sourceIndex);
    } else this._priorityCongested = false;
    for (const b of this._priorityBuildings) {
      const i = b._layerIndex;
      if (activeLOD) {
        const budget = budgetLOD('building', this._desiredLods[i], this._buildingBudgetCounts);
        this._nextLods[i] = budget.lod; this._lodCounts[budget.lod]++;
        if (budget.demoted) this._budgetDemotions++;
      } else {
        this._nextLods[i] = 0; this._lodCounts[0]++;
      }
    }

    let changed = count !== this._lastSelectedCount;
    if (!changed) for (let i = 0; i < count; i++) if (this._currentLods[i] !== this._nextLods[i]) { changed = true; break; }
    if (!changed && previousHlod.size !== nextHlod.size) changed = true;
    if (!changed) for (const [id, use] of nextHlod) if (previousHlod.get(id) !== use) { changed = true; break; }
    const oldCurrent = this._currentLods;
    this._currentLods = this._nextLods; this._nextLods = oldCurrent;
    const oldHlod = this._currentHlodBySettlement;
    this._currentHlodBySettlement = this._nextHlodBySettlement; this._nextHlodBySettlement = oldHlod; this._nextHlodBySettlement.clear();
    this._lastSelectedCount = count;
    if (forceWrite || changed) this._writeMatrices();
    this._updateStats();
  }

  _priorityVisible(building) {
    const p = this.coordinates.worldToRender(building.x, building.y, this.elevation.at(building.x, building.y));
    const height = building.h + building.roofH;
    this._priorityPoint.set(p.x, p.y + height / 2, p.z);
    this._prioritySphere.center.copy(this._priorityPoint);
    this._prioritySphere.radius = Math.hypot(building.w, building.d, height) / 2;
    return this._priorityFrustum.intersectsSphere(this._prioritySphere) ? 1 : 0;
  }

  _writeMatrices() {
    const counts = this._batchCounts, lists = this._renderBuildingLists;
    counts.fill(0); for (const list of lists) list.length = 0; this._hlodPickEntries.length = 0;
    const bodyCount = Math.min(this._selectedBuildings.length, CAPACITY);
    for (let i = 0; i < bodyCount; i++) {
      const b = this._selectedBuildings[i], lod = this._currentLods[i];
      if (lod === 3) continue;
      const p = this.coordinates.worldToRender(b.x, b.y, 0), ground = this.elevation.at(b.x, b.y);
      this.dummy.rotation.set(0, 0, 0);
      if (lod === 0) {
        this.dummy.position.set(p.x, ground, p.z); this.dummy.scale.set(b.w, b.h, b.d); this.dummy.updateMatrix();
        this.bodies.setMatrixAt(counts[0], this.dummy.matrix); this.bodies.setColorAt(counts[0]++, this.colorOf(b.body));
        this.dummy.position.set(p.x, ground + b.h, p.z); this.dummy.scale.set(b.w, b.roofH, b.d); this.dummy.updateMatrix();
        this.roofs.setMatrixAt(counts[1], this.dummy.matrix); this.roofs.setColorAt(counts[1]++, this.colorOf(b.roof));
        lists[0].push(b);
      } else {
        this.dummy.position.set(p.x, ground, p.z); this.dummy.scale.set(b.w, b.h + b.roofH, b.d); this.dummy.updateMatrix();
        const target = lod === 1 ? this.lod1 : this.lod2, slot = lod === 1 ? 2 : 3;
        target.setMatrixAt(counts[slot]++, this.dummy.matrix); lists[lod].push(b);
      }
    }
    for (const group of this._groups) {
      if (!group.useHlod || !group.selectedHouses.length) continue;
      const p = this.coordinates.worldToRender(group.centerX, group.centerY, 0), ground = this.elevation.at(group.centerX, group.centerY);
      this.dummy.position.set(p.x, ground, p.z); this.dummy.scale.set(group.width, group.maxHeight, group.depth); this.dummy.rotation.set(0, 0, 0); this.dummy.updateMatrix();
      this.hlod.setMatrixAt(counts[4], this.dummy.matrix);
      this._hlodPickEntries[counts[4]] = { id: group.id, settlementId: group.id, x: group.centerX, y: group.centerY,
        source: 'village-hlod', members: group.memberIds };
      counts[4]++;
    }
    const meshes = [this.bodies, this.roofs, this.lod1, this.lod2, this.hlod];
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i]; mesh.count = counts[i]; mesh.visible = counts[i] > 0;
      mesh.boundingBox = null; mesh.boundingSphere = null;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  _updateStats() {
    const s = this.stats, meshes = [this.bodies, this.roofs, this.lod1, this.lod2, this.hlod];
    let instances = 0, triangles = 0, hlod = 0;
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i], n = mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count;
      instances += mesh.count; triangles += mesh.count * n / 3;
      if (i === 4) hlod = mesh.count;
    }
    s.buildings = this._selectedBuildings.length; s.instances = instances; s.triangles = triangles; s.hlod = hlod;
    s.lod[0] = this._lodCounts[0]; s.lod[1] = this._lodCounts[1]; s.lod[2] = this._lodCounts[2];
    s.overflow = Math.max(0, s.buildings - CAPACITY); s.capacityOverflow = s.overflow;
    s.capacity = CAPACITY; s.budgetDemotions = this._budgetDemotions;
    s.villages = this.lastDerived.villages; s.houses = this.lastDerived.houses;
    s.centers = this.lastDerived.centers; s.sects = this.lastDerived.sects;
  }

  colorOf(hex) {
    let color = this.colorCache.get(hex);
    if (!color) { color = new THREE.Color(hex); this.colorCache.set(hex, color); }
    return color;
  }

  dispose() {
    this.setArtProfile(null);
    this.pilotBody?.dispose(); this.pilotRoof?.dispose(); this.pilotMaterial?.dispose();
    const meshes = [this.bodies, this.roofs, this.lod1, this.lod2, this.hlod];
    for (const mesh of meshes) mesh.dispose();
    for (const material of new Set([...meshes.map(mesh => mesh.material), ...this._lodLegacyMaterials])) material.dispose();
    for (const geometry of this.lodGeometries) geometry.dispose();
    this.bodyGeometry.dispose();
    this.roofGeometry.dispose();
    this.group.clear();
    this.colorCache.clear();
    this.lastDerived = null;
  }
}
