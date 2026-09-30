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
import { BrushOverlay } from './BrushOverlay.js';
import { surfaceElevation } from './terrain/VisualElevation.js';
import { RenderDebug } from './debug/RenderDebug.js';

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
    this.realmViewState = { open: false, targetPlane: null, region: null };
    this.setWorld(world);
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
        const stage = new PlaneStage({ plane, world: entry.world, profile: PLANE_RENDER_PROFILE[plane], coordinates: this.coordinates });
        this.stages.set(plane, stage); this.scene.add(stage.root);
        stage.fxProbe = new ThreeFxProbe({ plane, coordinates: this.coordinates });
        stage.root.add(stage.fxProbe.root);
      });
    } catch (error) { this.releaseWorld(); this.worldSet = null; throw error; }
    if (!this.stages.has(this.activePlane)) this.activePlane = 'mortal';
    this.debug.samples = []; this.applyView(); return true;
  }
  setActivePlane(plane) {
    if (!this.stages.has(plane)) return false;
    this.activePlane = plane; this.setSlabProbe(false); this.applyView(); return true;
  }
  setRealmViewState(state) { this.realmViewState = state; this.applyView(); }
  setPresentation(presentation) { this.presentation = presentation; }
  applyView() {
    if (this.slabProbe) {
      const rectangle = this.slabProbe.region;
      this.slabRegion ||= { ...rectangle, contains: (x, y) => x >= rectangle.x0 && x < rectangle.x1 && y >= rectangle.y0 && y < rectangle.y1 };
    }
    this.realmPrototype.apply(this.realmViewState, this.activePlane);
  }
  update(dt) {
    const start = performance.now(); this.applyView();
    const totals = { bridgeScanMs: 0, terrainUpdateMs: 0, waterUpdateMs: 0, vegetationUpdateMs: 0, entityUpdateMs: 0, settlementUpdateMs: 0, markerUpdateMs: 0 };
    this.updatedPlanes = [];
    for (const [plane, stage] of this.stages) {
      if (!stage.visible) continue;
      stage.update(dt, this.cameraRig.camera.zoom); this.updatedPlanes.push(plane);
      for (const key of Object.keys(totals)) totals[key] += stage.timings?.[key] || 0;
      stage.fxProbe.root.visible = !this.realmPrototype.open;
      stage.fxProbe.update(this.presentation, stage.world);
    }
    this.slabProbe?.update();
    this.profile = totals; this.scanMs = totals.bridgeScanMs; this.updateMs = performance.now() - start;
    this.cameraRig.update(dt); this.dt = dt;
  }
  markTerrainDirty(region) { this.stages.get('mortal')?.markTerrainDirty(region); }
  setSelection(x, y, plane = 'mortal') {
    for (const stage of this.stages.values()) stage.setSelection(stage.plane === plane ? x : null, stage.plane === plane ? y : null);
  }
  focusOn(x, y, options = {}, plane = this.activePlane) {
    const stage = this.stages.get(plane); if (!stage) return;
    this.cameraRig.focusOn(x, y, surfaceElevation(stage.world, x, y), options);
  }
  brush(hit, radius) { this.brushOverlay.update(hit, radius, this.stages.get('mortal')); }
  pick(x, y) { return this.picker.pick(x, y, this.width, this.height); }
  setSlabProbe(enabled, targetPlane = 'nether', region = null) {
    this.slabProbe?.dispose(); this.slabProbe = null; this.slabRegion = null;
    if (!enabled || !this.stages.has(targetPlane)) return;
    const columns = Math.min(20, this.world.w - 1), rows = Math.min(20, this.world.h - 1);
    const x0 = Math.floor((this.world.w - 1 - columns) / 2), y0 = Math.floor((this.world.h - 1 - rows) / 2);
    this.slabProbe = new SlabPrototype({ mortalWorld: this.world, targetWorld: this.stages.get(targetPlane).world,
      coordinates: this.coordinates, region: region || { x0, y0, x1: x0 + columns, y1: y0 + rows } });
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
      treeInstances: sum(s => s.vegetation?.mesh.visible ? s.vegetation.trees.length : 0), entityInstances: sum(s => s.entities?.stats.instances),
      houseInstances: sum(s => s.settlements?.group.visible ? s.settlements.stats.buildings : 0), markerInstances: sum(s => s.markers?.group.visible ? s.markers.stats.total : 0),
      raycastMs: this.picker.timeMs, lastRaycastMs: this.picker.lastRaycastMs,
      scanMs: this.scanMs || 0, layerUpdateMs: this.updateMs || 0, ...this.profile,
      residentPlanes: [...this.stages.keys()], visiblePlanes: visible.map(s => s.plane), updatedPlanes: this.updatedPlanes,
      memory: { ...this.gpu.info.memory }, activePlane: this.activePlane, maskOpen: this.realmPrototype.open,
    });
  }
  resize(width, height) { this.width = width; this.height = height; this.gpu.setSize(width, height, false); this.cameraRig.resize(width, height); }
  releaseWorld() {
    this.slabProbe?.dispose(); this.slabProbe = null; this.slabRegion = null;
    for (const stage of this.stages.values()) { stage.fxProbe?.dispose(); stage.dispose(); stage.root.removeFromParent(); }
    this.stages.clear();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.releaseWorld(); this.brushOverlay.dispose(); this.cameraRig.dispose(); this.gpu.dispose(); this.scene.clear();
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
