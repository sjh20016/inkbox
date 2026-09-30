import * as THREE from 'three';
import { WorldRenderBridge, mergeRegion } from '../WorldRenderBridge.js';
import { TerrainMesh } from '../terrain/TerrainMesh.js';
import { WaterLayer } from '../water/WaterLayer.js';
import { VegetationLayer } from '../vegetation/VegetationLayer.js';
import { EntityLayer } from '../entities/EntityLayer.js';
import { SettlementLayer } from '../settlements/SettlementLayer.js';
import { WorldMarkerLayer } from '../markers/WorldMarkerLayer.js';
import { SelectionMarker } from '../SelectionMarker.js';
import { renderProfileFor } from './PlaneRenderProfile.js';

/** One world's read-only 3D content. Scene, camera and renderer belong to the host. */
export class PlaneStage {
  constructor({ plane, world, profile = renderProfileFor(plane), coordinates } = {}) {
    if (!world) throw new Error(`PlaneStage ${plane}: world is required`);
    this.plane = plane;
    this.profile = profile;
    this.root = new THREE.Group();
    this.root.name = `PlaneStage:${plane}`;
    this.visible = true;
    this.timings = {};
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
    this.terrain = p.terrain ? new TerrainMesh(world, this.coordinates) : null;
    if (this.terrain) {
      if (p.terrainTint) this.terrain.material.color.set(p.terrainTint);
      this.root.add(this.terrain.mesh);
    }
    this.water = p.water ? new WaterLayer(world, this.coordinates) : null;
    if (this.water) this.root.add(this.water.mesh);
    this.vegetation = p.vegetation ? new VegetationLayer(world, this.coordinates) : null;
    if (this.vegetation) this.root.add(this.vegetation.mesh);
    this.entities = p.entities ? new EntityLayer(world, this.coordinates, { derive: p.entities }) : null;
    if (this.entities) this.root.add(this.entities.group);
    this.settlements = p.settlements ? new SettlementLayer(world, this.coordinates) : null;
    if (this.settlements) this.root.add(this.settlements.group);
    this.markers = p.markers ? new WorldMarkerLayer(world, this.coordinates) : null;
    if (this.markers) this.root.add(this.markers.group);
    this.selectionMarker = p.selection ? new SelectionMarker(this.coordinates) : null;
    if (this.selectionMarker) this.root.add(this.selectionMarker.mesh);
    this.pending = null;
    this.vegetationPending = false;
    this.treeClock = 0;
    this.regionMask = null;
    this.regionInside = true;
    this.timings = {};
    this.root.visible = this.visible;
  }

  setVisible(visible) {
    this.visible = !!visible;
    this.root.visible = this.visible;
  }

  /** Only terrain and entities participate in the M2-A mask probe. */
  setRegionMask(region, inside = true) {
    this.regionMask = region || null;
    this.regionInside = !!inside;
    this.terrain?.setRegionMask(this.regionMask, this.regionInside);
    this.entities?.setRegionMask(this.regionMask, this.regionInside);
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
    if (heightRegion) this.terrain?.update(heightRegion, { height: true, type: false });
    if (typeRegion) this.terrain?.update(typeRegion, { height: false, type: true });
    const t1 = performance.now();
    if ((heightChanged || waterRegion) && this.water) this.water.update(mergeRegion(heightRegion, waterRegion));
    const t2 = performance.now();
    if (this.vegetation && (heightChanged || typeRegion || vegRegion)) this.vegetationPending = true;
    this.treeClock += Number.isFinite(dt) ? dt : 0;
    if (this.vegetationPending && this.treeClock >= 0.15) {
      this.vegetation.update(); this.vegetationPending = false; this.treeClock = 0;
    }
    const t3 = performance.now();
    const options = { heightChanged };
    this.entities?.update(dt, this.world, options);
    const t4 = performance.now();
    this.settlements?.update(dt, this.world, options);
    const t5 = performance.now();
    this.markers?.update(dt, this.world, options);
    this.markers?.setZoom(zoom);
    this.selectionMarker?.update(this.world, heightChanged);
    const t6 = performance.now();
    this.timings = {
      bridgeScanMs, terrainUpdateMs: t1 - t0, waterUpdateMs: t2 - t1,
      vegetationUpdateMs: t3 - t2, entityUpdateMs: t4 - t3,
      settlementUpdateMs: t5 - t4, markerUpdateMs: t6 - t5,
      layerUpdateMs: t6 - t0,
    };
  }

  releaseLayers() {
    this.terrain?.dispose(); this.water?.dispose(); this.vegetation?.dispose();
    this.entities?.dispose(); this.settlements?.dispose(); this.markers?.dispose();
    this.selectionMarker?.dispose();
    this.root.clear();
    this.terrain = this.water = this.vegetation = this.entities = null;
    this.settlements = this.markers = this.selectionMarker = null;
  }

  dispose() {
    this.releaseLayers();
    this.bridge = null;
    this.world = null;
    this.root.removeFromParent();
  }
}
