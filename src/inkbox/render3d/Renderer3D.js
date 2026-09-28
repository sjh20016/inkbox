import * as THREE from 'three';
import { WorldRenderBridge } from './WorldRenderBridge.js';
import { CameraRig } from './CameraRig.js';
import { TerrainMesh } from './terrain/TerrainMesh.js';
import { TerrainPicker } from './terrain/TerrainPicker.js';
import { surfaceElevation } from './terrain/VisualElevation.js';
import { WaterLayer } from './water/WaterLayer.js';
import { VegetationLayer } from './vegetation/VegetationLayer.js';
import { EntityLayer } from './entities/EntityLayer.js';
import { SettlementLayer } from './settlements/SettlementLayer.js';
import { WorldMarkerLayer } from './markers/WorldMarkerLayer.js';
import { SelectionMarker } from './SelectionMarker.js';
import { RenderDebug } from './debug/RenderDebug.js';

export class Renderer3D {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.gpu = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.gpu.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.gpu.setClearColor('#d9cdb4');
    this.debug = new RenderDebug(); this.updateMs = 0; this.scanMs = 0;
    this.setWorld(world);
  }
  setWorld(world) {
    if (this.world === world) return;
    this.releaseWorld(); this.world = world;
    this.debug.samples = [];
    this.bridge = new WorldRenderBridge(world); this.coordinates = this.bridge.coordinates;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#faf2dc', '#686d59', 2));
    const sun = new THREE.DirectionalLight('#fff5dc', 2.2); sun.position.set(-90, 160, -70); this.scene.add(sun);
    this.terrain = new TerrainMesh(world, this.coordinates); this.scene.add(this.terrain.mesh);
    this.water = new WaterLayer(world, this.coordinates); this.scene.add(this.water.mesh);
    this.vegetation = new VegetationLayer(world, this.coordinates); this.scene.add(this.vegetation.mesh);
    // ── M1 世界对象表现层（各自持有只读快照、各自决定要不要重写实例）──
    // ⚠️ 都**不给 `World` 加 dirty 字段**：地形 diff 仍归 `WorldRenderBridge`，
    //    动态对象由各层自管（蓝图 §八「渲染器拥有自己的观察快照」）。
    this.entities = new EntityLayer(world, this.coordinates); this.scene.add(this.entities.group);
    this.settlements = new SettlementLayer(world, this.coordinates); this.scene.add(this.settlements.group);
    this.markers = new WorldMarkerLayer(world, this.coordinates); this.scene.add(this.markers.group);
    this.selectionMarker = new SelectionMarker(this.coordinates); this.scene.add(this.selectionMarker.mesh);
    this.cameraRig = new CameraRig(this.canvas, world, this.coordinates);
    this.picker = new TerrainPicker(this.terrain, this.coordinates, this.cameraRig.camera);
    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(97 * 3), 3));
    this.ring = new THREE.Line(ringGeometry, new THREE.LineBasicMaterial({ color: '#a8493c', depthTest: false }));
    this.ring.renderOrder = 5; this.ring.frustumCulled = false; this.ring.visible = false; this.scene.add(this.ring);
    this.pending = null; this.vegetationPending = false; this.treeClock = 0;
    if (this.width) this.resize(this.width, this.height);
  }
  markTerrainDirty(region) {
    if (!region) return;
    const r = this.pending;
    this.pending = r ? { x0: Math.min(r.x0, region.x0), y0: Math.min(r.y0, region.y0), x1: Math.max(r.x1, region.x1), y1: Math.max(r.y1, region.y1) } : { ...region };
  }
  update(dt) {
    const scan = performance.now(); this.markTerrainDirty(this.bridge.changes()); this.scanMs = performance.now() - scan;
    const start = performance.now();
    // 地形这一帧变过 ⇒ 所有贴地的东西（实体 / 建筑 / 标记 / 选中环）都得跟着重算 Y。
    const terrainChanged = !!this.pending;
    if (this.pending) { this.terrain.update(this.pending); this.water.update(this.pending); this.pending = null; this.vegetationPending = true; }
    this.treeClock += dt;
    if (this.vegetationPending && this.treeClock >= 0.15) { this.vegetation.update(); this.vegetationPending = false; this.treeClock = 0; }
    const layers = { terrainChanged };
    this.entities.update(dt, this.world, layers);
    this.settlements.update(dt, this.world, layers);
    this.markers.update(dt, this.world, layers);
    this.markers.setZoom(this.cameraRig.camera.zoom);
    this.selectionMarker.update(this.world);
    this.updateMs = performance.now() - start;
    this.cameraRig.update(dt); this.dt = dt;
  }
  /** 3D 点选：把选中环挪到该格（纯表现，不进存档）。 */
  setSelection(x, y) { this.selectionMarker.setCell(x, y); }
  brush(hit, radius) {
    this.ring.visible = !!hit;
    if (!hit) return;
    const attr = this.ring.geometry.attributes.position;
    for (let i = 0; i <= 96; i++) {
      const angle = i / 96 * Math.PI * 2;
      const x = Math.max(0, Math.min(this.world.w - 1, hit.world.x + Math.cos(angle) * radius));
      const y = Math.max(0, Math.min(this.world.h - 1, hit.world.y + Math.sin(angle) * radius));
      const p = this.coordinates.worldToRender(x, y, surfaceElevation(this.world, x, y) + 0.12);
      attr.setXYZ(i, p.x, p.y, p.z);
    }
    attr.needsUpdate = true;
  }
  pick(x, y) { return this.picker.pick(x, y, this.width, this.height); }
  render() {
    const start = performance.now(); this.gpu.render(this.scene, this.cameraRig.camera);
    return this.debug.record(this.dt, this.gpu, {
      renderMs: performance.now() - start,
      terrainVertices: this.world.size,
      treeInstances: this.vegetation.trees.length,
      raycastMs: this.picker.timeMs,
      lastRaycastMs: this.picker.lastRaycastMs,
      terrainUpdateMs: this.updateMs,
      scanMs: this.scanMs,
      entityInstances: this.entities.stats.instances,
      houseInstances: this.settlements.stats.buildings,
      markerInstances: this.markers.stats.total,
    });
  }
  resize(width, height) { this.width = width; this.height = height; this.gpu.setSize(width, height, false); this.cameraRig.resize(width, height); }
  releaseWorld() {
    this.cameraRig?.dispose(); this.terrain?.dispose(); this.water?.dispose(); this.vegetation?.dispose();
    this.entities?.dispose(); this.settlements?.dispose(); this.markers?.dispose(); this.selectionMarker?.dispose();
    if (this.ring) { this.ring.geometry.dispose(); this.ring.material.dispose(); }
  }
  dispose() { this.releaseWorld(); this.gpu.dispose(); }
}
