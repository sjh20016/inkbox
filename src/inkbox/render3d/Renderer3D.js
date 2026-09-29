import * as THREE from 'three';
import { WorldRenderBridge, mergeRegion } from './WorldRenderBridge.js';
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
  /**
   * 显式标记一块地形脏区。
   *
   * ⚠️ 唯一调用方是雕刻笔刷（`Render3DAdapter.stamp`），而 `terrain/sculpt.js`
   *    **只写 `height`** ⇒ 这里标记的是 **height 脏**（不是「地形全脏」）。
   *    桥下一帧也会 diff 出同一块区域，所以它本质是个「早一步的提示」。
   */
  markTerrainDirty(region) {
    if (!region) return;
    this.pending = mergeRegion(this.pending, region);
  }
  update(dt) {
    const scanStart = performance.now();
    const dirty = this.bridge.changes();
    this.scanMs = performance.now() - scanStart;

    const start = performance.now();
    // ── 分类派发（M1.1D D4.2）：各层只吃自己**真正依赖**的那几层 ──────────
    // height 脏区 = 桥报上来的 ∪ 雕刻笔刷的显式提示（两者都是 height）。
    const heightRegion = mergeRegion(this.pending, dirty?.height ?? null);
    const typeRegion = dirty?.type ?? null;
    const waterRegion = dirty?.water ?? null;
    const vegRegion = dirty?.veg ?? null;
    this.pending = null;
    const heightChanged = heightRegion !== null;

    // 逐层计时（M1.1D D5.2）：光知道「总 frame time」不知道 CPU 花在哪。
    const tTerrain0 = performance.now();
    // TerrainMesh：height 改 Y、type 改顶点色，**分开调**——
    // 只改 type 时绝不重写 Y（合成一块区域会把中间的格子白白重写一遍）。
    if (heightRegion) this.terrain.update(heightRegion, { height: true, type: false });
    if (typeRegion) this.terrain.update(typeRegion, { height: false, type: true });
    const tTerrain1 = performance.now();
    // WaterLayer：水面高度 = height + water ⇒ 两层任一脏都要重算。
    if (heightChanged || waterRegion) this.water.update(mergeRegion(heightRegion, waterRegion));
    const tWater1 = performance.now();
    // VegetationLayer：树的落点与存活判据吃 height + veg + type（见 deriveVegetation）。
    if (heightChanged || typeRegion || vegRegion) this.vegetationPending = true;

    this.treeClock += dt;
    if (this.vegetationPending && this.treeClock >= 0.15) { this.vegetation.update(); this.vegetationPending = false; this.treeClock = 0; }
    const tVeg1 = performance.now();
    // 贴地三兄弟：**只有 height 变**才强制重贴地。water / type / veg 变化不该动它们。
    const layers = { heightChanged };
    this.entities.update(dt, this.world, layers);
    const tEntity1 = performance.now();
    this.settlements.update(dt, this.world, layers);
    const tSettlement1 = performance.now();
    this.markers.update(dt, this.world, layers);
    this.markers.setZoom(this.cameraRig.camera.zoom);
    this.selectionMarker.update(this.world, heightChanged);
    const tMarker1 = performance.now();
    this.updateMs = performance.now() - start;
    // ⚠️ 计时字段只给探针 / 调试面板读，**不进存档、不参与任何判定**。
    this.profile = {
      bridgeScanMs: this.scanMs,
      terrainUpdateMs: tTerrain1 - tTerrain0,
      waterUpdateMs: tWater1 - tTerrain1,
      vegetationUpdateMs: tVeg1 - tWater1,
      entityUpdateMs: tEntity1 - tVeg1,
      settlementUpdateMs: tSettlement1 - tEntity1,
      markerUpdateMs: tMarker1 - tSettlement1,
    };
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
    const profile = this.profile || {};
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
      // ── M1.1D D5.2 逐层 CPU profiling（知道时间花在哪，而不是只有总 frame time）──
      bridgeScanMs: this.scanMs,
      waterUpdateMs: profile.waterUpdateMs ?? 0,
      vegetationUpdateMs: profile.vegetationUpdateMs ?? 0,
      entityUpdateMs: profile.entityUpdateMs ?? 0,
      settlementUpdateMs: profile.settlementUpdateMs ?? 0,
      markerUpdateMs: profile.markerUpdateMs ?? 0,
      layerUpdateMs: this.updateMs,
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
