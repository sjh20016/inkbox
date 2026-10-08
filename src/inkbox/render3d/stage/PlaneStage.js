import * as THREE from 'three';
import { WorldRenderBridge, mergeRegion } from '../WorldRenderBridge.js';
import { TerrainSideLayer } from '../terrain/TerrainSideLayer.js';
import { TerrainMesh } from '../terrain/TerrainMesh.js';
import { WaterLayer } from '../water/WaterLayer.js';
import { VegetationLayer } from '../vegetation/VegetationLayer.js';
import { EntityLayer } from '../entities/EntityLayer.js';
import { SettlementLayer } from '../settlements/SettlementLayer.js';
import { WorldMarkerLayer } from '../markers/WorldMarkerLayer.js';
import { SelectionMarker } from '../SelectionMarker.js';
import { ElevationField } from '../terrain/ElevationField.js';
import { RegionGeometry } from '../region/RegionGeometry.js';
import { composeAccessGeometry } from '../region/AccessGeometry.js';
import { renderProfileFor } from './PlaneRenderProfile.js';
import { createEnvironmentMaterial, setEnvironmentMaterialProfile, setEnvironmentMaterialView } from '../environment/EnvironmentMaterial.js';
import { RealmDecorationLayer } from '../environment/RealmDecorationLayer.js';
import { RealmArtifactLayer } from '../markers/RealmArtifactLayer.js';
import { geographyFeatures } from './GeographyFeatures.js';
import { ScalarFieldTexture } from '../art/ScalarFieldTexture.js';
import { SurfaceVisualFieldTexture } from '../art/SurfaceVisualFieldTexture.js';

/** One world's read-only 3D content. Scene, camera and renderer belong to the host. */
export class PlaneStage {
  constructor({ plane, world, profile = renderProfileFor(plane), coordinates, characterLibrary = null,
    environmentLibrary = null, productionAssets = false, decorations = true, geography = false } = {}) {
    if (!world) throw new Error(`PlaneStage ${plane}: world is required`);
    this.plane = plane;
    this.profile = profile;
    this.root = new THREE.Group();
    this.root.name = `PlaneStage:${plane}`;
    this.visible = true;
    this.timings = {};
    this.characterLibrary = characterLibrary;
    this.environmentLibrary = environmentLibrary;
    this.productionAssetsEnabled = !!productionAssets;
    this.decorationsEnabled = !!decorations;
    this.geographyFeatures = geographyFeatures(geography);
    this.setWorld(world, coordinates);
  }

  setWorld(world, coordinates) {
    if (!world) throw new Error(`PlaneStage ${this.plane}: world is required`);
    if (this.world === world && this.coordinates === (coordinates || this.coordinates)) return;
    this.releaseLayers();
    this.world = world;
    this.bridge = new WorldRenderBridge(world);
    this.coordinates = coordinates || this.bridge.coordinates;
    const p = this.profile;
    // M2-B §6：每个 Stage 持有一份高程单源（默认 RAW ⇒ 与 M2-A 逐位一致）。
    this.elevation = new ElevationField(world, p.elevation);
    this.terrain = p.terrain ? new TerrainMesh(world, this.coordinates, this.elevation) : null;
    this.terrainSides=this.terrain?new TerrainSideLayer(world,this.coordinates,this.elevation):null;
    if(this.terrainSides)this.root.add(this.terrainSides.mesh);
    this.scalarField=this.plane==='upper'?new ScalarFieldTexture(world,'qi',1)
      :this.plane==='nether'?new ScalarFieldTexture(world,'veg',2):null;
    this.syncScalarField();
    if (this.terrain) {
      if (p.terrainTint) this.terrain.material.color.set(p.terrainTint);
      this.root.add(this.terrain.mesh);
    }
    this.water = p.water ? new WaterLayer(world, this.coordinates, this.elevation) : null;
    if (this.water) this.root.add(this.water.mesh);
    // M2-C2D P1：Stage-owned 连续表面视觉场；Terrain / Water 只借用，不各存一份。
    this.surfaceField = p.water ? new SurfaceVisualFieldTexture(world) : null;
    this.terrain?.setSurfaceField(this.surfaceField);
    this.water?.setSurfaceField(this.surfaceField);
    this.vegetation = p.vegetation ? new VegetationLayer(world, this.coordinates, this.elevation) : null;
    if (this.vegetation) this.root.add(this.vegetation.group || this.vegetation.mesh);
    this.entities = p.entities ? new EntityLayer(world, this.coordinates, this.elevation,
      { derive: p.entities, characterLibrary: this.characterLibrary }) : null;
    if (this.entities) this.root.add(this.entities.group);
    this.settlements = p.settlements ? new SettlementLayer(world, this.coordinates, this.elevation) : null;
    if (this.settlements) this.root.add(this.settlements.group);
    this.decorations = this.plane==='upper'||this.plane==='nether'?new RealmDecorationLayer(world,this.coordinates,this.elevation):null;
    if(this.decorations)this.root.add(this.decorations.group);
    this.realmArtifacts=this.plane==='nether'?new RealmArtifactLayer(world,this.coordinates,this.elevation):null;
    if(this.realmArtifacts)this.root.add(this.realmArtifacts.group);
    this.markers = p.markers ? new WorldMarkerLayer(world, this.coordinates, this.elevation) : null;
    if (this.markers) this.root.add(this.markers.group);
    this.markers?.setGeographyFeatures?.(this.geographyFeatures);
    this.setEnvironmentAssets(this.environmentLibrary, this.productionAssetsEnabled);
    this.selectionMarker = p.selection
      ? new SelectionMarker(this.coordinates, this.elevation, { readonly: !!p.selectionReadonly, tint: p.selectionTint })
      : null;
    if (this.selectionMarker) this.root.add(this.selectionMarker.mesh);
    this.pending = null;
    this.vegetationPending = false;
    this.treeClock = 0;
    this.accessKey = null; this.accessBounds = null; this.contentGeometry = null; this.contentInside = true; this.contentKey = null;
    this.regionMask = null;
    this.regionGeometry = null;
    this.regionInside = true;
    this.timings = {};
    this.root.visible = this.visible;
  }

  setVisible(visible) {
    this.visible = !!visible;
    this.root.visible = this.visible;
  }

  setEnvironmentAssets(library, enabled = this.productionAssetsEnabled) {
    this.productionAssetsEnabled = !!enabled;
    this.syncScalarField();
    if (library !== this.environmentLibrary || (library && !this.environmentMaterial)) {
      const previous = this.environmentMaterial;
      this.environmentLibrary = library;
      this.environmentMaterial = library ? createEnvironmentMaterial(library, this.plane) : null;
      if (this.environmentMaterial) {
        setEnvironmentMaterialProfile(this.environmentMaterial, this.environmentArtProfile);
        setEnvironmentMaterialView(this.environmentMaterial, this.environmentArtView);
      }
      this.settlements?.setEnvironmentAssets(library, this.environmentMaterial, this.productionAssetsEnabled);
      this.entities?.setEnvironmentAssets(library, this.environmentMaterial, this.productionAssetsEnabled);
      this.decorations?.setEnvironmentAssets(library,this.environmentMaterial,this.productionAssetsEnabled&&this.decorationsEnabled);
      this.realmArtifacts?.setEnvironmentAssets(library,this.environmentMaterial,this.productionAssetsEnabled);
      this.markers?.setEnvironmentAssets?.(library, this.environmentMaterial, this.productionAssetsEnabled);
      previous?.dispose();
    } else {
      this.settlements?.setEnvironmentAssets(library, this.environmentMaterial, this.productionAssetsEnabled);
      this.entities?.setEnvironmentAssets(library, this.environmentMaterial, this.productionAssetsEnabled);
      this.decorations?.setEnvironmentAssets(library,this.environmentMaterial,this.productionAssetsEnabled&&this.decorationsEnabled);
      this.realmArtifacts?.setEnvironmentAssets(library,this.environmentMaterial,this.productionAssetsEnabled);
      this.markers?.setEnvironmentAssets?.(library, this.environmentMaterial, this.productionAssetsEnabled);
    }
  }

  setEnvironmentArtProfile(profile) {
    this.environmentArtProfile = profile;
    if (this.environmentMaterial) setEnvironmentMaterialProfile(this.environmentMaterial, profile);
  }

  setGeographyFeatures(features) {
    this.geographyFeatures = geographyFeatures(features);
    this.markers?.setGeographyFeatures?.(this.geographyFeatures);
    this.syncScalarField();
  }
  syncScalarField(){
    const enabled=this.productionAssetsEnabled&&(this.plane==='upper'?this.geographyFeatures.upperQi
      :this.plane==='nether'&&this.geographyFeatures.netherYin);
    this.terrain?.setScalarField(this.scalarField,enabled);
  }

  setEnvironmentArtView(view) {
    this.environmentArtView = view;
    if (this.environmentMaterial) setEnvironmentMaterialView(this.environmentMaterial, view);
    this.decorations?.setArtView(view);
    this.realmArtifacts?.setArtView(view);
    this.markers?.setArtView?.(view);
  }

  /**
   * M2-B B2：切换本 Stage 的**表现**高程剖面（Raw / Strata，§34）。
   *
   * ⚠️ 只改表现：`ElevationField` 是只读映射，**绝不**写 `world.height`（P4 / §39）。
   * 剖面变了 ⇒ 地形顶点 Y 要整图重写；其余贴地层各自按节流刷新，这里直接催一次。
   *
   * @returns {boolean} 剖面是否真的变了
   */
  setElevationProfile(profile) {
    const before = this.elevation.profile;
    const next = this.elevation.setProfile(profile);
    if (before === next) return false;
    const region = { x0: 0, y0: 0, x1: this.world.w - 1, y1: this.world.h - 1 };
    this.terrain?.update(region, { height: true, type: false });
    this.water?.update(region);
    this.terrainSides?.update();
    if (this.entities) { this.entities.lastDerived = null; this.entities.clock = Infinity; }
    if (this.settlements) { this.settlements.lastDerived = null; this.settlements.clock = Infinity; }
    if (this.markers) { this.markers.lastDerived = null; this.markers.clock = Infinity; }
    if (this.vegetation) this.vegetationPending = true;
    if (this.selectionMarker) this.selectionMarker.needsPlace = true;
    this.decorations?.invalidateGround();
    if(this.realmArtifacts)this.realmArtifacts.clock=Infinity;
    this.refreshGroundLayers();
    return true;
  }

  // A new Strata shoulder can be applied after this Stage updated in the current frame.
  // Flush only ground-dependent layers; do not scan the Bridge or advance simulation again.
  refreshGroundLayers() {
    const options = { heightChanged: true };
    if (this.vegetation) {
      this.vegetation.update(); this.vegetationPending = false; this.treeClock = 0;
    }
    this.entities?.update(0, this.world, options);
    this.settlements?.update(0, this.world, options);
    this.markers?.update(0, this.world, options);
    this.decorations?.update({ layoutChanged: true });
    this.realmArtifacts?.update(0, options);
    this.selectionMarker?.update(this.world, true);
  }

  /**
   * 设置本 Stage 的 Region 遮罩。
   *
   * M2-B §12 / §85：`RegionGeometry` **只在 Region identity 变化时重建**。
   * 视界开着时 `applyView()` 每帧都会调到这里，而 `getRealmViewState()` 在选区
   * 未变时返回**同一个** `RegionMask` 实例（`ui/realmViewState.js` 的 WeakMap 缓存）
   * ⇒ 身份比较就足以判定「要不要重建」，不需要每帧重算。
   *
   * @param {object|null} region `RegionMask`（或 Slab 的等价矩形对象）
   * @param {boolean} [inside] `true` = 保留窗内（目标界），`false` = 保留窗外（凡间）
   */
  setRegionMask(region, inside = true) {
    this.regionInside = !!inside;
    if (this.regionMask !== (region || null)) {
      this.regionMask = region || null;
      this.regionGeometry = region ? new RegionGeometry(this.world, region) : null;
    }
    const key = `${this.regionInside}|${this.accessBounds ? Object.values(this.accessBounds).join(',') : 'full'}`;
    if (this.contentSource !== this.regionGeometry || this.contentKey !== key) {
      this.contentSource = this.regionGeometry; this.contentKey = key;
      const content = composeAccessGeometry(this.world, this.accessBounds, this.regionGeometry, this.regionInside);
      this.contentGeometry = content.geometry; this.contentInside = content.inside;
    }
    for (const layer of [this.terrain, this.water, this.terrainSides, this.vegetation, this.settlements,
      this.markers, this.entities, this.decorations, this.realmArtifacts]) {
      layer?.setRegionGeometry(this.contentGeometry, this.contentInside);
    }
  }

  setAccessBounds(bounds = null) {
    const key = bounds ? Object.values(bounds).join(',') : 'full';
    if (key === this.accessKey) return false;
    this.accessKey = key; this.accessBounds = bounds;
    this.setRegionMask(this.regionMask, this.regionInside);
    return true;
  }

  markTerrainDirty(region) {
    if (region) this.pending = mergeRegion(this.pending, region);
  }

  setSelection(x, y) { this.selectionMarker?.setCell(x, y); }

  update(dt, zoom = 1) {
    if (!this.visible) return;
    const scanStart = performance.now();
    const dirty = this.bridge.changes();
    const bridgeScanMs = performance.now() - scanStart;
    const heightRegion = mergeRegion(this.pending, dirty?.height ?? null);
    const typeRegion = dirty?.type ?? null;
    const waterRegion = dirty?.water ?? null;
    const vegRegion = dirty?.veg ?? null;
    this.pending = null;
    const heightChanged = heightRegion !== null;

    const t0 = performance.now();
    this.terrain?.updateScalarField(dt);
    if (heightRegion) this.terrain?.update(heightRegion, { height: true, type: false });
    if(heightRegion)this.terrainSides?.update(heightRegion);
    if (typeRegion) this.terrain?.update(typeRegion, { height: false, type: true });
    const t1 = performance.now();
    if ((heightChanged || waterRegion) && this.water) this.water.update(mergeRegion(heightRegion, waterRegion));
    // P1：视觉场只接现有 water dirty（值只编码水深）；扩核由场自己负责。
    if (waterRegion) this.surfaceField?.update(waterRegion);
    const t2 = performance.now();
    // §22：Region 变化也要重建植被实例（走同一条节流通道，不是每帧全量重写）。
    if (this.vegetation && (heightChanged || typeRegion || vegRegion || this.vegetation.pendingRegionRebuild)) this.vegetationPending = true;
    this.treeClock += Number.isFinite(dt) ? dt : 0;
    if (this.vegetationPending && (heightChanged || this.treeClock >= 0.15)) {
      this.vegetation.update(); this.vegetationPending = false; this.treeClock = 0;
    }
    const t3 = performance.now();
    const options = { heightChanged };
    this.entities?.update(dt, this.world, options);
    const t4 = performance.now();
    this.settlements?.update(dt, this.world, options);
    const t5 = performance.now();
    if (typeRegion) this.markers?.invalidateGeographyTerrainType();
    this.markers?.update(dt, this.world, options);
    this.markers?.setZoom(zoom);
    this.decorations?.update({layoutChanged:heightChanged||!!typeRegion});
    this.realmArtifacts?.update(dt,{heightChanged});
    this.selectionMarker?.update(this.world, heightChanged);
    const t6 = performance.now();
    this.timings = {
      bridgeScanMs, terrainUpdateMs: t1 - t0, waterUpdateMs: t2 - t1,
      vegetationUpdateMs: t3 - t2, entityUpdateMs: t4 - t3,
      settlementUpdateMs: t5 - t4, markerUpdateMs: t6 - t5,
      layerUpdateMs: t6 - t0,
    };
    // 本帧地形高度是否真的变过——界缘断面据此刷新（§85「相关 height dirty」）。
    this.heightChanged = heightChanged;
  }

  releaseLayers() {
    this.terrainSides?.dispose();this.terrainSides=null;
    this.terrain?.dispose(); this.water?.dispose(); this.vegetation?.dispose();
    this.scalarField?.dispose();this.scalarField=null;
    this.surfaceField?.dispose();this.surfaceField=null;
    this.entities?.dispose(); this.settlements?.dispose(); this.markers?.dispose();
    this.decorations?.dispose();this.decorations=null;
    this.realmArtifacts?.dispose();this.realmArtifacts=null;
    this.environmentMaterial?.dispose(); this.environmentMaterial = null;
    this.selectionMarker?.dispose();
    this.root.clear();
    this.terrain = this.water = this.vegetation = this.entities = null;
    this.settlements = this.markers = this.selectionMarker = null;
    this.elevation = null;
  }

  dispose() {
    this.releaseLayers();
    this.bridge = null;
    this.world = null;
    this.root.removeFromParent();
  }
}
