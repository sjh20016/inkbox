import * as THREE from '../../../vendor/three/build/three.module.js';
import { OrbitControls } from '../../../vendor/three/examples/jsm/controls/OrbitControls.js';
import { ASSETS, createRuinsLibrary } from './ruinsLibrary.js';
import { createReferences, instanceMatrices } from './scenePresets.js';

const DIRECTIONS = { oblique: [1.2, .95, 1.5], front: [0, .12, 1], side: [1, .12, 0], back: [0, .12, -1], top: [0, 1, .001] };
export const DEFAULT_STATE = { asset: ASSETS[0].id, variant: ASSETS[0].states[0].id, realm: 'mortal', lod: 'auto', style: 'toon', outline: true, light: 0, camera: 'oblique', mode: 'solo', count: 32, loaded: true };

export class GalleryViewer {
  constructor(container, initial = {}, onUpdate = () => {}) {
    this.container = container; this.onUpdate = onUpdate; this.state = { ...DEFAULT_STATE, ...initial };
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#f3efe4');
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .05, 3000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.prepend(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false; this.controls.minZoom = .15; this.controls.maxZoom = 8;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x7f8171, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2.3); light.position.set(-8, 16, 10); this.scene.add(light);
    this.groups = []; this.metrics = { geometryCPUms: 0, matrixCPUms: 0, renderCPUms: 0, rafIntervalMs: 0, builds: 0, instances: 0, lod: 0 };
    this.library = null; this.disposed = false; this.dirty = true; this.contextLost = false;
    this.handleChange = () => { this.dirty = true; this.checkAutoLOD(); };
    this.controls.addEventListener('change', this.handleChange);
    this.handleVisibility = () => { this.lastFrame = 0; if (!document.hidden) this.dirty = true; };
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.handleLost = event => { event.preventDefault(); this.contextLost = true; this.onUpdate({ message: 'WebGL 上下文已丢失，等待恢复。' }); };
    this.handleRestored = () => { this.contextLost = false; this.dirty = true; this.onUpdate({ message: '' }); };
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleRestored);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
    this.resize(); this.rebuild(); this.resetCamera();
    this.tick = time => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(this.tick);
      if (document.hidden || this.contextLost) return;
      if (this.lastFrame) this.metrics.rafIntervalMs = time - this.lastFrame;
      this.lastFrame = time;
      if (this.dirty) {
        const started = performance.now(); this.renderer.render(this.scene, this.camera);
        this.metrics.renderCPUms = performance.now() - started; this.dirty = false;
      }
      if (!this.lastReport || time - this.lastReport > 450) { this.lastReport = time; this.onUpdate({ stats: this.getStats() }); }
    };
    this.raf = requestAnimationFrame(this.tick);
  }
  resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false); this.aspect = width / height; this.updateProjection(); this.dirty = true;
    if (this.library) this.checkAutoLOD();
  }
  updateProjection() {
    const span = this.span || 10; this.camera.left = -span * this.aspect; this.camera.right = span * this.aspect;
    this.camera.top = span; this.camera.bottom = -span; this.camera.updateProjectionMatrix();
  }
  resolveLOD() {
    if (this.state.lod !== 'auto') return Number(this.state.lod);
    const visibleHeight = (this.span || 10) * 2 / this.camera.zoom;
    // Measure the stable LOD0 extent, never the currently simplified silhouette.
    const pixels = (this.assetExtent || 7) / visibleHeight * this.container.clientHeight;
    // A dead band keeps small zoom / resize changes from rebuilding at a threshold.
    const current = this.metrics.lod;
    if (current === 0) return pixels < 45 ? 2 : pixels < 130 ? 1 : 0;
    if (current === 2) return pixels > 170 ? 0 : pixels > 65 ? 1 : 2;
    return pixels > 170 ? 0 : pixels < 45 ? 2 : 1;
  }
  checkAutoLOD() { if (this.state.lod === 'auto' && this.resolveLOD() !== this.metrics.lod && this.state.loaded) this.rebuild(); }
  clearGroups() {
    for (const group of this.groups) { this.scene.remove(group); group.userData.dispose?.(); }
    this.groups.length = 0;
  }
  rebuild() {
    if (this.disposed) return;
    this.clearGroups();
    if (!this.state.loaded) {
      this.library?.dispose(); this.library = null; this.metrics.instances = 0; this.metrics.assetTriangles = 0;
      this.renderer.renderLists.dispose(); this.dirty = true; this.onUpdate({ stats: this.getStats() }); return;
    }
    this.library ||= createRuinsLibrary();
    const { state } = this, started = performance.now();
    const reference = this.library.statsFor(state.asset, 0, state.variant);
    this.assetBounds = reference.bounds;
    this.assetHeight = reference.bounds.max[1] - reference.bounds.min[1];
    this.assetExtent = Math.max(...reference.bounds.max.map((v, i) => v - reference.bounds.min[i]));
    this.spacing = this.assetExtent * 1.5;
    const lod = this.resolveLOD();
    const matrixStart = performance.now();
    const rowRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...DIRECTIONS[state.camera]).normalize()).normalize();
    const rowMatrix = i => new THREE.Matrix4().makeTranslation(...rowRight.clone().multiplyScalar((i - 1.5) * this.spacing).toArray());
    let entries;
    if (state.mode === 'overview') entries = ASSETS.map((asset, i) => ({ id: asset.id, variant: asset.states[0].id, realm: asset.defaultRealm, style: state.style, matrices: [rowMatrix(i)] }));
    else if (state.mode === 'comparison') entries = ['flat', 'toon', 'solid', 'ink'].map((style, i) => ({ id: state.asset, variant: state.variant, realm: state.realm, style, matrices: [rowMatrix(i)] }));
    else entries = [{ id: state.asset, variant: state.variant, realm: state.realm, style: state.style, matrices: instanceMatrices(state.mode === 'stress' ? state.count : 1, this.spacing) }];
    this.metrics.matrixCPUms = performance.now() - matrixStart;
    this.metrics.instances = entries.reduce((sum, entry) => sum + entry.matrices.length, 0);
    this.metrics.assetTriangles = 0;
    for (const entry of entries) {
      const group = this.library.createBatch({ id: entry.id, state: entry.variant, realm: entry.realm, style: entry.style, lod, light: state.light, matrices: entry.matrices, outline: state.outline });
      this.scene.add(group); this.groups.push(group);
      this.metrics.assetTriangles += this.library.statsFor(entry.id, lod, entry.variant).triangles * entry.matrices.length;
    }
    if (state.mode === 'game' || state.mode === 'distant') { const references = createReferences(); this.scene.add(references); this.groups.push(references); }
    this.metrics.geometryCPUms = performance.now() - started - this.metrics.matrixCPUms;
    this.metrics.lod = lod; this.metrics.builds++; this.dirty = true;
    this.onUpdate({ stats: this.getStats() });
  }
  resetCamera() {
    if (this.disposed) return;
    const mode = this.state.mode;
    const direction = new THREE.Vector3(...DIRECTIONS[this.state.camera]).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const bounds = this.assetBounds || { min: [-2, 0, -2], max: [2, 4, 2] };
    const points = [];
    for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) points.push(new THREE.Vector3(x, y, z));
    const widths = points.map(point => point.dot(right)), heights = points.map(point => point.dot(up));
    const projectedWidth = Math.max(...widths) - Math.min(...widths), projectedHeight = Math.max(...heights) - Math.min(...heights);
    let span = Math.max(projectedHeight, projectedWidth / (this.aspect || 1)) * .74;
    if (mode === 'game') span = 11;
    if (mode === 'distant') span = 22;
    if (mode === 'stress') span = Math.max(span, this.spacing * Math.ceil(Math.sqrt(this.state.count)) * .69);
    if (mode === 'overview' || mode === 'comparison') span = Math.max(span, this.spacing * 2.1 / Math.min(this.aspect || 1, 2));
    this.span = span; this.camera.zoom = 1; this.updateProjection();
    const target = new THREE.Vector3(...bounds.min).add(new THREE.Vector3(...bounds.max)).multiplyScalar(.5);
    this.camera.position.copy(target).addScaledVector(direction, Math.max(100, span * 3));
    this.controls.target.copy(target); this.camera.up.set(0, 1, 0); this.controls.update(); this.checkAutoLOD(); this.dirty = true;
  }
  setState(patch = {}) {
    if (this.disposed) return;
    const previous = this.state; const next = { ...previous, ...patch };
    const asset = ASSETS.find(item => item.id === next.asset) || ASSETS[0]; next.asset = asset.id;
    if (!asset.states.some(item => item.id === next.variant)) next.variant = asset.states[0].id;
    if (!['mortal', 'upper', 'nether'].includes(next.realm)) next.realm = 'mortal';
    if (!['auto', '0', '1', '2'].includes(String(next.lod))) next.lod = 'auto';
    if (!['flat', 'toon', 'solid', 'ink'].includes(next.style)) next.style = 'flat';
    if (!['solo', 'game', 'distant', 'stress', 'overview', 'comparison'].includes(next.mode)) next.mode = 'solo';
    if (!DIRECTIONS[next.camera]) next.camera = 'oblique';
    next.light = [0, 1, 2].includes(Number(next.light)) ? Number(next.light) : 0;
    next.count = [1, 32, 128].includes(Number(next.count)) ? Number(next.count) : 32;
    next.outline = Boolean(next.outline); next.loaded = Boolean(next.loaded); this.state = next;
    const geometryChange = ['asset', 'variant', 'realm', 'lod', 'style', 'outline', 'light', 'mode', 'count', 'loaded'].some(key => previous[key] !== next[key]);
    if (geometryChange || (previous.camera !== next.camera && ['overview', 'comparison'].includes(next.mode))) this.rebuild();
    if (['asset', 'camera', 'mode', 'count'].some(key => previous[key] !== next[key])) this.resetCamera();
    this.onUpdate({ state: this.getState(), stats: this.getStats() });
    return this.getState();
  }
  getState() { return { ...this.state }; }
  getStats() {
    const info = this.renderer.info;
    return { ...this.metrics, loaded: Boolean(this.library), disposed: this.disposed, contextLost: this.contextLost,
      draws: info.render.calls, triangles: info.render.triangles, lines: info.render.lines,
      geometries: info.memory.geometries, textures: info.memory.textures, library: this.library?.stats() || null,
      canvas: { width: this.renderer.domElement.width, height: this.renderer.domElement.height }, dpr: this.renderer.getPixelRatio() };
  }
  dispose() {
    if (this.disposed) return this.getStats();
    this.disposed = true; cancelAnimationFrame(this.raf); this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.controls.removeEventListener('change', this.handleChange); this.controls.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleRestored);
    this.clearGroups(); this.library?.dispose(); this.library = null;
    this.renderer.renderLists.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
    return this.getStats();
  }
}
