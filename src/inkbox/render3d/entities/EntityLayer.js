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
// 实体上限约 3000 ⇒ **禁止每人一个 `THREE.Mesh`**。基础生灵按视觉类别
// InstancedMesh；修士库加载后按共享 body / hair / attachment 模块分批，
// 每个模块一个 draw call，全部角色共用一张 palette 和一种材质。
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
import { createCultivatorPilot } from '../art/PilotAssets.js';
import { createPilotMaterial, updatePilotMaterial, setPilotView } from '../art/PilotMaterial.js';
import { CharacterBatch } from '../characters/CharacterBatch.js';
import { createCharacterLODGeometries } from '../lod/CharacterLODAssets.js';
import { budgetLOD, chooseLOD, LOD_BUDGETS, projectedPixels } from '../lod/PresentationBudget.js';

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
  let g;
  if (cls === 'spirit') {
    g = new THREE.IcosahedronGeometry(0.85, 0);
    g.translate(0, 0.85, 0);
  } else {
    const [w, h, d] = STYLE[cls].size;
    g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
  }
  // PilotMaterial expects a vertex pigment; white lets instanceColor retain
  // the existing species/faction tint on fallback silhouettes.
  const colors = new Float32Array(g.getAttribute('position').count * 3);
  colors.fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export class EntityLayer {
  constructor(world, coordinates, elevation = new ElevationField(world), { derive = deriveEntities, characterLibrary = null } = {}) {
    this.world = world;
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
    this.placeholderMeshes = {};
    this.characterBatch = null;
    this.lodEnabled = false;
    this.artView = {};
    this._viewPpu = NaN; this._viewVerticalPpu = NaN;
    this._cameraMatrix = new Float64Array(16);
    this._cameraMatrix.fill(NaN);
    this._projectPoint = new THREE.Vector3();
    this._lodByEntity = new Map();
    this.stats = { instances: 0, byClass: {}, lod: [0, 0, 0], triangles: 0,
      overflow: 0, capacityOverflow: 0, capacity: LOD_BUDGETS.categories.character.capacity, budgetDemotions: 0 };

    this.group = new THREE.Group();
    this.group.name = 'EntityLayer';
    this.artProfile = null;
    this.pilotGeometry = null;
    this.pilotMaterial = null;
    this.pilotWraithMaterial = null;
    this.pilotGhostMaterial = null;
    this.legacyMaterials = {};
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
      mesh.userData.lod = 0;
      this.meshes[cls] = mesh;
      this.legacyMaterials[cls] = material;
      this.placeholderMeshes[cls] = mesh;
      this.group.add(mesh);
    }
    this.lodGeometries = createCharacterLODGeometries(STYLE);
    this.lodMeshes = {};
    for (const [cls, geometries] of Object.entries(this.lodGeometries)) {
      this.lodMeshes[cls] = geometries.map((geometry, index) => {
        const mesh = new THREE.InstancedMesh(geometry, this.legacyMaterials[cls === 'ghost' ? 'wraith' : cls], CAPACITY);
        mesh.name = `Entity:${cls}:LOD${index + 1}`;
        mesh.userData.lod = index + 1;
        mesh.userData.renderEntities = [];
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.renderOrder = RENDER_ORDER.entities;
        mesh.count = 0; mesh.visible = false;
        this.group.add(mesh);
        return mesh;
      });
    }
    this.legacyCultivator = { geometry: this.placeholderMeshes.cultivator.geometry, material: this.placeholderMeshes.cultivator.material };
    if (characterLibrary) this.setCharacterLibrary(characterLibrary);
  }

  setArtProfile(profile) {
    const changed = this.artProfile !== (profile || null);
    this.artProfile = profile || null;
    if (profile && !this.pilotGeometry) {
      this.pilotGeometry = createCultivatorPilot();
      this.pilotMaterial = createPilotMaterial(profile, 2.9);
      this.pilotWraithMaterial = createPilotMaterial(profile, 2.2, { opacity: STYLE.wraith.opacity });
    }
    if (profile) {
      updatePilotMaterial(this.pilotMaterial, profile);
      updatePilotMaterial(this.pilotWraithMaterial, profile);
      this.updateGhostMaterial(profile);
    }
    // The library's cultivator entry is a CharacterBatch module. Art profiles
    // only replace the unused placeholder geometry, never that module's geometry.
    const mesh = this.placeholderMeshes.cultivator;
    mesh.geometry = profile ? this.pilotGeometry : this.legacyCultivator.geometry;
    for (const cls of ENTITY_CLASSES) {
      this.placeholderMeshes[cls].material = profile
        ? (cls === 'wraith' ? this.pilotWraithMaterial : this.pilotMaterial)
        : this.legacyMaterials[cls];
    }
    for (const [cls, meshes] of Object.entries(this.lodMeshes)) {
      for (const lodMesh of meshes) lodMesh.material = profile
        ? (cls === 'ghost' && this.characterBatch ? this.pilotGhostMaterial
          : cls === 'wraith' || cls === 'ghost' ? this.pilotWraithMaterial : this.pilotMaterial)
        : this.legacyMaterials[cls === 'ghost' ? 'wraith' : cls];
    }
    mesh.boundingBox = null; mesh.boundingSphere = null;
    if (changed && this.lastDerived) this.write(this.lastDerived);
  }

  updateGhostMaterial(profile) {
    if (!this.characterBatch || !profile) return;
    const source = this.characterBatch.library.material;
    if (!this.pilotGhostMaterial) {
      this.pilotGhostMaterial = createPilotMaterial(profile, 2.2, { opacity: source.opacity });
      this.pilotGhostMaterial.name = 'Pilot:LibraryGhost';
    }
    updatePilotMaterial(this.pilotGhostMaterial, profile);
    this.pilotGhostMaterial.uniforms.pilotOpacity.value = source.opacity;
    this.pilotGhostMaterial.transparent = source.transparent;
    this.pilotGhostMaterial.depthWrite = source.depthWrite;
  }

  setLODEnabled(enabled) {
    const next = !!enabled;
    if (this.lodEnabled === next) return;
    this.lodEnabled = next;
    if (this.lastDerived) this.write(this.lastDerived);
  }

  setArtView(view = {}) {
    this.artView = view || {};
    if (this.pilotMaterial) setPilotView(this.pilotMaterial, view);
    if (this.pilotWraithMaterial) setPilotView(this.pilotWraithMaterial, view);
    if (this.pilotGhostMaterial) setPilotView(this.pilotGhostMaterial, view);
    const ppu = Number.isFinite(this.artView.pixelsPerUnit) ? this.artView.pixelsPerUnit : 1;
    const verticalPpu = Number.isFinite(this.artView.verticalPixelsPerUnit) ? this.artView.verticalPixelsPerUnit : ppu;
    const scaleChanged = ppu !== this._viewPpu || verticalPpu !== this._viewVerticalPpu;
    const matrix = this.artView.camera?.matrixWorldInverse?.elements;
    let cameraChanged = false;
    if (matrix) for (let i = 0; i < 16; i++) {
      if (matrix[i] !== this._cameraMatrix[i]) cameraChanged = true;
      this._cameraMatrix[i] = matrix[i];
    }
    if (!scaleChanged && !cameraChanged) return;
    this._viewPpu = ppu; this._viewVerticalPpu = verticalPpu;
    if (!this.lastDerived || !this.artProfile || !this.lodEnabled) return;
    // Below the first detail cap, camera translation cannot change an entity's
    // screen-size LOD or its budget allocation.
    if (!scaleChanged && ENTITY_CLASSES.reduce((n, cls) => n + this.lastDerived[cls].length, 0)
      <= LOD_BUDGETS.categories.character.lod0) return;
    const selection = this.selectLOD(this.lastDerived);
    const next = selection.states, previous = this._lodByEntity;
    let changed = next.size !== previous.size;
    if (!changed) for (const [id, lod] of next) if (previous.get(id) !== lod) { changed = true; break; }
    if (changed) this.writeLOD(this.lastDerived, selection);
  }

  setCharacterLibrary(library) {
    if (!library || this.characterBatch?.library === library) return;
    this.characterBatch?.dispose();
    this.characterBatch?.group.removeFromParent();
    this.characterBatch = new CharacterBatch(library, CAPACITY);
    this.group.add(this.characterBatch.group);
    this.placeholderMeshes.cultivator.visible = false;
    this.placeholderMeshes.cultivator.count = 0;
    this.placeholderMeshes.cultivator.boundingBox = null;
    this.placeholderMeshes.cultivator.boundingSphere = null;
    this.placeholderMeshes.cultivator.removeFromParent();
    const body = library.roles.basic.body;
    this.meshes.cultivator = this.characterBatch.meshes[body];
    if (this.artProfile) this.setArtProfile(this.artProfile);
    this.lastDerived = null;
    this.clock = Infinity;
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
    if (this.artProfile && this.lodEnabled) this.writeLOD(derived);
    else this.writeLegacy(derived);
    this.lastDerived = derived;
  }

  visibleList(derived, cls) {
    const list = derived[cls];
    return this.regionGeometry && !this.regionGeometry.allInside
      ? list.filter(item => this.regionGeometry.isInsideCell(item.x, item.y) === this.regionInside)
      : list;
  }

  selectLOD(derived) {
    const entries = [], states = new Map(), counts = [0, 0, 0];
    let budgetDemotions = 0;
    for (const cls of ENTITY_CLASSES) {
      for (const item of this.visibleList(derived, cls)) {
        entries.push({ cls, item, lod: 0, priority: 0 });
      }
    }
    // Screen-centred entities receive scarce detailed slots first. Otherwise
    // the fixed derive/class order can spend the whole L0 budget off screen.
    if (entries.length > LOD_BUDGETS.categories.character.lod0 && this.artView.camera) {
      for (const entry of entries) {
        const item = entry.item;
        const p = this.coordinates.worldToRender(item.x, item.y, 0);
        this._projectPoint.set(p.x, this.elevation.at(item.x, item.y) + item.lift, p.z)
          .project(this.artView.camera);
        const x = Math.abs(this._projectPoint.x), y = Math.abs(this._projectPoint.y), z = this._projectPoint.z;
        entry.priority = (x <= 1.1 && y <= 1.1 && z >= -1.1 && z <= 1.1 ? 0 : 100)
          + x * x + y * y;
      }
      entries.sort((a, b) => a.priority - b.priority || String(a.cls).localeCompare(String(b.cls))
        || (a.item.id | 0) - (b.item.id | 0));
    }
    for (const entry of entries) {
        const { cls, item } = entry;
        const key = `${cls}:${item.id}`;
        const [width, height] = STYLE[cls].size;
        const pixels = projectedPixels(height, this.artView, width);
        const desired = chooseLOD('character', pixels, this._lodByEntity.get(key), true);
        const result = budgetLOD('character', desired, counts);
        if (result.demoted) budgetDemotions++;
        states.set(key, result.lod);
        entry.lod = result.lod;
    }
    return { entries, states, counts, budgetDemotions };
  }

  writeLOD(derived, selection = this.selectLOD(derived)) {
    const batches = new Map();
    const register = mesh => batches.set(mesh, { items: [], count: 0 });
    for (const mesh of Object.values(this.placeholderMeshes)) register(mesh);
    for (const meshes of Object.values(this.lodMeshes)) for (const mesh of meshes) register(mesh);
    const byClass = Object.fromEntries(ENTITY_CLASSES.map(cls => [cls, 0]));
    const characterRecords = [];
    let instances = 0, overflow = 0;
    const lod = [0, 0, 0];
    for (const { cls, item, lod: level } of selection.entries) {
      const ghost = !!this.characterBatch && cls === 'wraith' && item.appearance?.role === 'ghost';
      if (level === 0 && this.characterBatch && (cls === 'cultivator' || ghost)) {
        characterRecords.push(this.characterRecord(item));
        continue;
      }
      const target = level === 0 ? this.placeholderMeshes[cls]
        : this.lodMeshes[ghost ? 'ghost' : cls][level - 1];
      const batch = batches.get(target);
      if (batch.count >= target.instanceMatrix.count) { overflow++; continue; }
      const p = this.coordinates.worldToRender(item.x, item.y, 0);
      this.dummy.position.set(p.x, this.elevation.at(item.x, item.y) + item.lift, p.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      target.setMatrixAt(batch.count, this.dummy.matrix);
      target.setColorAt(batch.count, this.colorOf(item.color));
      batch.items.push(item); batch.count++;
      byClass[cls]++; instances++; lod[level]++;
    }
    for (const [mesh, batch] of batches) {
      mesh.count = batch.count;
      mesh.boundingBox = null; mesh.boundingSphere = null;
      mesh.visible = batch.count > 0 && mesh.parent === this.group;
      mesh.userData.renderEntities = batch.items;
      if (batch.count) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
    if (this.characterBatch) {
      this.characterBatch.write(characterRecords);
      overflow += this.characterBatch.stats.overflow;
      const body = this.meshes.cultivator;
      for (const item of body.userData.renderEntities) {
        const cls = item.appearance?.role === 'ghost' ? 'wraith' : 'cultivator';
        byClass[cls]++; instances++; lod[0]++;
      }
    }
    this._lodByEntity = selection.states;
    const capacityOverflow = Math.max(0, selection.entries.length - LOD_BUDGETS.categories.character.capacity);
    this.stats = { instances, byClass, lod, triangles: this.submittedTriangles(),
      overflow, capacityOverflow, capacity: LOD_BUDGETS.categories.character.capacity,
      budgetDemotions: selection.budgetDemotions };
    this.lastDerived = derived;
  }

  writeLegacy(derived) {
    this._lodByEntity.clear();
    for (const meshes of Object.values(this.lodMeshes)) for (const mesh of meshes) {
      mesh.count = 0; mesh.visible = false; mesh.userData.renderEntities = [];
      mesh.boundingBox = null; mesh.boundingSphere = null;
    }
    let instances = 0; let overflow = 0;
    const byClass = {};
    const characterRecords = [];
    for (const cls of ENTITY_CLASSES) {
      const mesh = this.placeholderMeshes[cls];
      const list = this.visibleList(derived, cls);
      if (this.characterBatch && cls === 'cultivator') {
        for (const item of list) characterRecords.push(this.characterRecord(item));
        byClass[cls] = 0;
        continue;
      }
      const drawn = this.characterBatch && cls === 'wraith'
        ? list.filter(item => !item.appearance || item.appearance.role !== 'ghost') : list;
      if (this.characterBatch && cls === 'wraith') {
        for (const item of list) {
          if (item.appearance?.role === 'ghost') characterRecords.push(this.characterRecord(item));
        }
      }
      const capacity = mesh.instanceMatrix.count;
      const n = Math.min(drawn.length, capacity);
      if (drawn.length > capacity) overflow += drawn.length - capacity;
      for (let i = 0; i < n; i += 1) {
        const item = drawn[i];
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
      mesh.boundingBox = null; mesh.boundingSphere = null;
      // instanceId is local to the filtered batch, not to the world container.
      mesh.userData.renderEntities = drawn.slice(0, n);
      mesh.visible = n > 0;         // 空类别 ⇒ 连这次 draw call 都省掉
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      byClass[cls] = n;
      instances += n;
    }
    if (this.characterBatch) {
      this.characterBatch.write(characterRecords);
      overflow += this.characterBatch.stats.overflow;
      const body = this.meshes.cultivator;
      for (const item of body.userData.renderEntities) {
        const cls = item.appearance?.role === 'ghost' ? 'wraith' : 'cultivator';
        byClass[cls] += 1;
        instances += 1;
      }
    }
    this.stats = { instances, byClass, lod: [instances, 0, 0], triangles: this.submittedTriangles(),
      overflow, capacityOverflow: Math.max(0, instances - LOD_BUDGETS.categories.character.capacity),
      capacity: LOD_BUDGETS.categories.character.capacity, budgetDemotions: 0 };
  }

  submittedTriangles() {
    let triangles = 0;
    this.group.traverse(mesh => {
      if (!mesh.isInstancedMesh || !mesh.visible || !mesh.count) return;
      for (let parent = mesh.parent; parent; parent = parent.parent) if (!parent.visible) return;
      const vertexCount = mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0;
      triangles += mesh.count * vertexCount / 3;
    });
    return triangles;
  }

  characterRecord(item) {
    const p = this.coordinates.worldToRender(item.x, item.y, 0);
    return { id: item.id, role: item.appearance?.role || 'basic',
      paletteIndex: item.appearance?.paletteIndex,
      x: p.x, y: this.elevation.at(item.x, item.y) + item.lift, z: p.z,
      source: item };
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
    this.lastDerived = null;
    this.setArtProfile(null);
    this.pilotGeometry?.dispose();
    this.pilotMaterial?.dispose();
    this.pilotWraithMaterial?.dispose();
    this.pilotGhostMaterial?.dispose();
    this.characterBatch?.dispose();
    this.characterBatch = null;
    for (const meshes of Object.values(this.lodMeshes)) for (const mesh of meshes) {
      mesh.dispose(); mesh.userData.renderEntities = [];
    }
    for (const geometries of Object.values(this.lodGeometries)) for (const geometry of geometries) geometry.dispose();
    for (const cls of ENTITY_CLASSES) {
      const mesh = this.placeholderMeshes[cls];
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
