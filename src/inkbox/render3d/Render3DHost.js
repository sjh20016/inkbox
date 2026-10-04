import * as THREE from 'three';
import { CameraRig } from './CameraRig.js';
import { createCoordinates } from './coordinates.js';
import { PlaneStage } from './stage/PlaneStage.js';
import { PLANE_RENDER_PROFILE } from './stage/PlaneRenderProfile.js';
import { PLANES, snapshotWorldSet, sameWorldSet } from './stage/WorldSetSnapshot.js';
import { PlanePicker } from './picking/PlanePicker.js';
import { RealmView3DPrototype } from './view/RealmView3DPrototype.js';
import { SlabPrototype } from './view/SlabPrototype.js';
import { ThreeFxProbe } from './view/ThreeFxProbe.js';
import { DraftPathOverlay } from './view/DraftPathOverlay.js';
import { BrushOverlay } from './BrushOverlay.js';
import { RealmBoundaryLayer } from './boundary/RealmBoundaryLayer.js';
import { BOUNDARY_MODES, RAW_BOUNDARY, boundarySpec, buildRealmBoundaryField } from './boundary/strataProfile.js';
import { RenderDebug } from './debug/RenderDebug.js';
import { visibleRift } from './readers/riftViewModel.js';
import { ArtPass } from './art/ArtPass.js';
import { loadCharacterLibrary } from './characters/CharacterLibrary.js';

/**
 * M2-B B4（§56–§58）：与**当前窗口目标位面**一致的活跃裂缝。
 *
 * ⚠️ 半径一律经 `readers/riftViewModel.js` 的 `visibleRift()` —— 它是
 * render3d 通往权威裂缝公式的**唯一**入口，禁止在这里复制半径公式（§58）。
 * ⚠️ 只读：不改 rift、不改半径、不延寿、不改概率（§60）。
 * ⚠️ 界缘层本身**不持有** `world.rifts`（S6）——这里只是把算好的读数传下去。
 */
function activeRiftsFor(world, targetPlane) {
  const out = [];
  for (const rift of world?.rifts || []) {
    const view = visibleRift(rift);
    if (!view || view.targetPlane !== targetPlane) continue;
    out.push({ id: rift.id, x: rift.x, y: rift.y, radius: view.radius });
  }
  return out;
}

export class Render3DHost {
  constructor(canvas, world, options = {}) {
    snapshotWorldSet(world);
    this.canvas = canvas; this.stages = new Map(); this.activePlane = 'mortal';
    this.gpu = options.gpu || new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.gpu.setPixelRatio(Math.min(1.5, globalThis.devicePixelRatio || 1)); this.gpu.setClearColor('#d9cdb4');
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#faf2dc', '#686d59', 2));
    const sun = new THREE.DirectionalLight('#fff5dc', 2.2); sun.position.set(-90, 160, -70); this.scene.add(sun);
    this.debug = new RenderDebug(); this.coordinates = createCoordinates(world);
    this.cameraRig = options.cameraRig || new CameraRig(canvas, { w: world.w, h: world.h }, this.coordinates);
    this.picker = new PlanePicker(this); this.realmPrototype = new RealmView3DPrototype(this);
    this.brushOverlay = new BrushOverlay(); this.ring = this.brushOverlay.mesh; this.scene.add(this.ring);
    this.draftPath = new DraftPathOverlay({ coordinates: this.coordinates }); this.scene.add(this.draftPath.mesh);
    this.realmViewState = { open: false, targetPlane: null, region: null };
    // M2-B B2：垂直表现模式。默认 Raw —— 它是工程基线（§34 Mode R），
    // 也就是「什么都不加」，保证 B1 之前的画面逐字不变。
    this.boundaryMode = 'raw';
    this.boundaryKey = null;
    this.boundaryField = null;
    this.art = new ArtPass(this, { profile: options.artProfile || 'baseline' });
    this.lodEnabled = !!options.lodEnabled;
    this.characterLibrary = options.characterLibrary || null;
    this.ownsCharacterLibrary = !options.characterLibrary;

    this.setWorld(world);
    const load = options.loadCharacterLibrary || (typeof window !== 'undefined' && options.characters !== false
      ? loadCharacterLibrary : null);
    if (!this.characterLibrary && load) {
      this.characterLoadPromise = Promise.resolve().then(() => load()).then(library => {
        if (this.disposed) { library.dispose(); return; }
        this.characterLibrary = library;
        for (const stage of this.stages.values()) {
          stage.characterLibrary = library;
          stage.entities?.setCharacterLibrary(library);
        }
      }).catch(error => {
        this.characterLoadError = error;
        if (!this.disposed) console.error('Cultivator character library failed to load', error);
      });
    }
  }
  setWorld(world) {
    const next = snapshotWorldSet(world);
    if (sameWorldSet(this.worldSet, next)) return false;
    this.releaseWorld(); this.world = world; this.worldSet = next;
    this.coordinates = createCoordinates(world);
    this.cameraRig.setDimensions({ w: world.w, h: world.h }, this.coordinates);
    try {
      next.forEach((entry, i) => {
        if (!entry) return;
        const plane = PLANES[i];
        const stage = new PlaneStage({ plane, world: entry.world, profile: PLANE_RENDER_PROFILE[plane],
          coordinates: this.coordinates, characterLibrary: this.characterLibrary });
        this.stages.set(plane, stage); this.scene.add(stage.root);
        stage.fxProbe = new ThreeFxProbe({ plane, coordinates: this.coordinates, elevation: stage.elevation });
        stage.root.add(stage.fxProbe.root);
      });
    } catch (error) { this.releaseWorld(); this.worldSet = null; throw error; }
    if (!this.stages.has(this.activePlane)) this.activePlane = 'mortal';
    // M2-B B2：界缘断面跨「凡间 ↔ 目标界」两个 Stage，所以它属于 Host 而不是某个 Stage。
    this.boundary = new RealmBoundaryLayer({ coordinates: this.coordinates });
    this.scene.add(this.boundary.mesh);
    this.boundaryKey = null; this.boundaryField = null;
    this.art.setProfile(this.art.profile);
    this.setLODEnabled(this.lodEnabled);
    this.debug.samples = []; this.applyView(); return true;
  }
  setArtProfile(profile) { return this.art.setProfile(profile); }
  setLODEnabled(enabled) {
    this.lodEnabled = !!enabled;
    for (const stage of this.stages.values()) {
      for (const layer of [stage.vegetation, stage.entities, stage.settlements]) layer?.setLODEnabled?.(this.lodEnabled);
    }
    this.art.update();
    return this.lodEnabled;
  }
  getLODStats() {
    const result = {};
    for (const [name, key] of [['tree', 'vegetation'], ['character', 'entities'], ['building', 'settlements']]) {
      const totals = { lod: [0, 0, 0], triangles: 0, instances: 0, overflow: 0, capacity: 0, hlod: 0 };
      for (const stage of this.stages.values()) {
        if (!stage.visible) continue;
        const stats = stage[key]?.stats;
        if (!stats) continue;
        for (let level = 0; level < 3; level++) totals.lod[level] += stats.lod?.[level] || 0;
        for (const field of ['triangles', 'overflow', 'capacity', 'hlod']) totals[field] += stats[field] || 0;
        totals.instances += stats.instances ?? stats.buildings ?? 0;
      }
      result[name] = totals;
    }
    return result;
  }
  setActivePlane(plane) {
    if (!this.stages.has(plane)) return false;
    this.activePlane = plane; this.setSlabProbe(false); this.applyView(); return true;
  }
  setRealmViewState(state) { this.realmViewState = state; this.applyView(); }

  /**
   * M2-B B2（§34 / §54）：切换垂直表现模式 `raw` / `strata`。
   * 这是**调试开关**，不占正式 UI 的位置（§54）。
   */
  setBoundaryMode(mode) {
    const next = BOUNDARY_MODES.includes(mode) ? mode : 'raw';
    if (this.boundaryMode === next) return false;
    this.boundaryMode = next;
    this.boundaryKey = null;
    this.applyView();
    return true;
  }

  /**
   * 界缘断面的装配（B2）。
   *
   * 只在 **(Region identity, 模式, 目标位面)** 变化时重建（§12 / §85）：
   * 这些量决定了 `RealmBoundaryLayer.keyFor()` 的缓存键。地形高度变脏时由
   * `update()` 把键置空，下一帧走同一条重建路径。
   *
   * ⚠️ 顺序是**承重**的：先把目标位面的表现剖面换好，再画墙——墙顶取的就是
   *    目标界在边界节点的**最终**高程（§33），顺序反了墙顶会慢一帧。
   */
  #applyBoundary() {
    if (!this.boundary) return;
    const mortal = this.stages.get('mortal');
    const targetPlane = this.realmPrototype.open ? this.realmPrototype.targetPlane : null;
    const target = targetPlane ? this.stages.get(targetPlane) : null;
    if (!target || !mortal) {
      this.boundary.setVisible(false);
      this.boundaryKey = null;
      this.boundaryField = null;
      // 关窗 ⇒ 目标界回到 Raw 基线：没有窗就没有断面，别留着 datum 悬在天上。
      if (target) target.setElevationProfile(RAW_BOUNDARY);
      return;
    }
    const region = this.realmViewState.region;
    const sign = targetPlane === 'upper' ? 1 : -1;
    const spec = boundarySpec(this.boundaryMode, sign);
    const rifts = activeRiftsFor(this.world, targetPlane);
    // 半径会随裂缝生长变化 ⇒ 量化后进缓存键，让破口宽度跟着更新（§58）。
    const riftSignature = rifts.map(r => `${r.id}:${Math.round(r.radius * 20)}`).join(',');
    const key = RealmBoundaryLayer.keyFor({ region, mode: spec.mode, sign, targetPlane, riftSignature });
    if (this.boundaryKey !== key) {
      this.boundaryKey = key;
      if (spec.mode === 'strata') {
        // §38：shoulder 场只在这里构建一次，绝不每帧重算。
        this.boundaryField = buildRealmBoundaryField({
          world: target.world,
          regionGeometry: target.regionGeometry,
          mortalElevation: mortal.elevation,
          targetElevation: target.elevation,
          spec,
        });
        target.setElevationProfile({ datum: spec.datum, relief: spec.relief, shoulder: this.boundaryField.shoulder });
      } else {
        this.boundaryField = null;
        target.setElevationProfile(RAW_BOUNDARY);
      }
      // ⚠️ 凡间 Stage **永远**保持真实高程（§37「凡间地形：保持真实」）。
      mortal.setElevationProfile(RAW_BOUNDARY);
      this.boundary.rebuild({
        regionGeometry: target.regionGeometry,
        mortalElevation: mortal.elevation,
        targetElevation: target.elevation,
        sign, key, rifts, targetPlane,
      });
    }
    this.boundary.setVisible(true);
  }
  setPresentation(presentation) { this.presentation = presentation; }
  applyView() {
    if (this.slabProbe) {
      const rectangle = this.slabProbe.region;
      this.slabRegion ||= { ...rectangle, contains: (x, y) => x >= rectangle.x0 && x < rectangle.x1 && y >= rectangle.y0 && y < rectangle.y1 };
    }
    this.realmPrototype.apply(this.realmViewState, this.activePlane);
    this.#applyBoundary();
    this.art.syncStyleContext();
  }
  update(dt) {
    const start = performance.now(); this.applyView();
    const totals = { bridgeScanMs: 0, terrainUpdateMs: 0, waterUpdateMs: 0, vegetationUpdateMs: 0, entityUpdateMs: 0, settlementUpdateMs: 0, markerUpdateMs: 0 };
    this.updatedPlanes = [];
    for (const [plane, stage] of this.stages) {
      if (!stage.visible) continue;
      stage.update(dt, this.cameraRig.camera.zoom); this.updatedPlanes.push(plane);
      for (const key of Object.keys(totals)) totals[key] += stage.timings?.[key] || 0;
      // §65：depart 画在源 Stage、arrive 画在目标 Stage。**不再因为开窗就整层关掉**
      // ——stage.root.visible 已经负责「这一界这帧画不画」，这里不需要再加一条。
      stage.fxProbe.root.visible = true;
      stage.fxProbe.update(this.presentation, stage.world);
    }
    // §85：地形高度真的变过（雕刻 / 水文 / 生态）⇒ 界缘断面必须跟着重建。
    // 只把缓存键置空，下一帧走同一条重建路径——不在渲染循环里重建几何。
    if (this.boundary?.mesh.visible) {
      for (const stage of this.stages.values()) {
        if (stage.heightChanged) { this.boundaryKey = null; break; }
      }
    }
    this.slabProbe?.update();
    this.cameraRig.update(dt);
    const lodStart = performance.now(); this.art.update(); totals.lodUpdateMs = performance.now() - lodStart;
    this.profile = totals; this.scanMs = totals.bridgeScanMs; this.updateMs = performance.now() - start;
    this.dt = dt;
  }
  markTerrainDirty(region) { this.stages.get('mortal')?.markTerrainDirty(region); }
  setSelection(x, y, plane = 'mortal') {
    for (const stage of this.stages.values()) stage.setSelection(stage.plane === plane ? x : null, stage.plane === plane ? y : null);
  }
  focusOn(x, y, options = {}, plane = this.activePlane) {
    const stage = this.stages.get(plane); if (!stage) return;
    this.cameraRig.focusOn(x, y, stage.elevation.at(x, y), options);
  }
  brush(hit, radius) { this.brushOverlay.update(hit, radius, this.stages.get('mortal')); }
  /** 默认拾取：可见几何优先（§61）——界缘也能被命中（§62）。 */
  pick(x, y) { return this.picker.pick(x, y, this.width, this.height); }
  /** M2-B B3（§52）：划窗时**只**拾凡间——目标界已经开着也不能把路径点写到它上面。 */
  pickPlane(x, y, plane) { return this.picker.pick(x, y, this.width, this.height, plane); }
  /** 拖拽中的路径预览（世界坐标，纯表现）。 */
  setDraftPath(path) { this.draftPath?.setPath(path, this.stages.get('mortal')?.elevation); }
  setSlabProbe(enabled, targetPlane = 'nether', region = null) {
    this.slabProbe?.dispose(); this.slabProbe = null; this.slabRegion = null;
    if (!enabled || !this.stages.has(targetPlane)) return;
    const columns = Math.min(20, this.world.w - 1), rows = Math.min(20, this.world.h - 1);
    const x0 = Math.floor((this.world.w - 1 - columns) / 2), y0 = Math.floor((this.world.h - 1 - rows) / 2);
    // ⚠️ Slab 是**历史研究探针**（§30 明令不扩它），但它仍必须走同一套高程口径，
    //    否则就是 S10 说的「第二套高程真相」。两侧各给一份 ElevationField。
    this.slabProbe = new SlabPrototype({ mortalWorld: this.world, targetWorld: this.stages.get(targetPlane).world,
      coordinates: this.coordinates, region: region || { x0, y0, x1: x0 + columns, y1: y0 + rows },
      mortalElevation: this.stages.get('mortal')?.elevation, targetElevation: this.stages.get(targetPlane).elevation });
    this.slabProbe.surfaceMesh.material.color.copy(this.stages.get(targetPlane).terrain.material.color);
    this.scene.add(this.slabProbe.root);
    this.applyView();
  }
  render() {
    const start = performance.now(); this.gpu.render(this.scene, this.cameraRig.camera);
    const visible = [...this.stages.values()].filter(stage => stage.visible);
    const sum = fn => visible.reduce((n, stage) => n + (fn(stage) || 0), 0);
    return this.debug.record(this.dt, this.gpu, {
      renderMs: performance.now() - start, terrainVertices: sum(s => s.world.size),
      treeInstances: sum(s => s.vegetation?.stats.trees), entityInstances: sum(s => s.entities?.stats.instances),
      houseInstances: sum(s => s.settlements?.group.visible ? s.settlements.stats.buildings : 0), markerInstances: sum(s => s.markers?.group.visible ? s.markers.stats.total : 0),
      raycastMs: this.picker.timeMs, lastRaycastMs: this.picker.lastRaycastMs,
      scanMs: this.scanMs || 0, layerUpdateMs: this.updateMs || 0, ...this.profile,
      residentPlanes: [...this.stages.keys()], visiblePlanes: visible.map(s => s.plane), updatedPlanes: this.updatedPlanes,
      memory: { ...this.gpu.info.memory }, activePlane: this.activePlane, maskOpen: this.realmPrototype.open,
      boundaryMode: this.boundaryMode, boundaryEdges: this.boundary?.stats.edges || 0,
      boundaryTriangles: this.boundary?.stats.triangles || 0, boundaryVisible: !!this.boundary?.mesh.visible,
      boundaryRawGapMax: this.boundary?.stats.rawGapMax || 0, boundaryVisualDepthMax: this.boundary?.stats.visualDepthMax || 0,
      lodEnabled: this.lodEnabled, lod: this.getLODStats(),
    });
  }
  resize(width, height) { this.width = width; this.height = height; this.gpu.setSize(width, height, false); this.cameraRig.resize(width, height); }
  releaseWorld() {
    this.slabProbe?.dispose(); this.slabProbe = null; this.slabRegion = null;
    this.boundary?.dispose(); this.boundary = null; this.boundaryKey = null; this.boundaryField = null;
    for (const stage of this.stages.values()) { stage.fxProbe?.dispose(); stage.dispose(); stage.root.removeFromParent(); }
    this.stages.clear();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.releaseWorld(); this.draftPath?.dispose(); this.draftPath = null;
    this.art.dispose(); this.brushOverlay.dispose(); this.cameraRig.dispose(); this.gpu.dispose(); this.scene.clear();
    if (this.ownsCharacterLibrary) this.characterLibrary?.dispose();
    this.characterLibrary = null;

    this.world = null; this.worldSet = null; this.presentation = null;
  }
  // Compatibility for the existing M1 debug consumers, not layer ownership.
  get bridge() { return this.stages.get('mortal')?.bridge; }
  get terrain() { return this.stages.get('mortal')?.terrain; }
  get water() { return this.stages.get('mortal')?.water; }
  get vegetation() { return this.stages.get('mortal')?.vegetation; }
  get entities() { return this.stages.get('mortal')?.entities; }
  get settlements() { return this.stages.get('mortal')?.settlements; }
  get markers() { return this.stages.get('mortal')?.markers; }
  get selectionMarker() { return this.stages.get('mortal')?.selectionMarker; }
}
