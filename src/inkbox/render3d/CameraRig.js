import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CameraRig {
  constructor(canvas, dimensions, coordinates) {
    this.dimensions = { w: dimensions.w, h: dimensions.h }; this.coordinates = coordinates;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.minPolarAngle = Math.PI / 12; this.controls.maxPolarAngle = Math.PI / 2.65;
    this.controls.minZoom = 0.5; this.controls.maxZoom = 18;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener('start', () => this.cancelFocus());
    this.fit();
  }
  resize(width, height) {
    this.width = width; this.height = height;
    const aspect = width / height, span = Math.hypot(this.dimensions.w, this.dimensions.h) * 0.60 / Math.min(1, aspect);
    this.camera.left = -span * aspect; this.camera.right = span * aspect;
    this.camera.top = span; this.camera.bottom = -span;
    this.camera.updateProjectionMatrix();
  }
  fit() {
    this.cancelFocus(); this.controls.target.set(0, 0, 0);
    this.camera.position.set(180, 250, 240); this.camera.zoom = this.accessZoom();
    this.accessTransition = null;
    this.camera.updateProjectionMatrix(); this.controls.update();
  }
  /**
   * V1 · 山海入画「观山」推荐视角：远 / 中 / 近三档循环。更低的俯角让山形以剪影立起，
   * 远景留出背景画幅与云底；中、近景保持当前目标点，只改俯角与焦距。
   */
  scenic(step = null) {
    const presets = [{ polar: 1.0, zoom: 1.18, recenter: true }, { polar: 1.08, zoom: 2.6 }, { polar: 1.13, zoom: 5.2 }];
    this.scenicStep = Number.isInteger(step) ? step % presets.length : ((this.scenicStep ?? -1) + 1) % presets.length;
    const p = presets[this.scenicStep], target = this.controls.target;
    this.cancelFocus();
    if (p.recenter) target.set(0, 4, 0);
    const offset = this.camera.position.clone().sub(target);
    const yaw = Math.atan2(offset.x, offset.z), distance = Math.max(300, offset.length());
    this.camera.position.set(target.x + Math.sin(yaw) * Math.sin(p.polar) * distance, target.y + Math.cos(p.polar) * distance,
      target.z + Math.cos(yaw) * Math.sin(p.polar) * distance);
    this.camera.zoom = Math.max(this.accessZoom(), p.zoom); this.accessTransition = null;
    this.camera.updateProjectionMatrix(); this.controls.update(); this.clampAccessTarget();
    return this.scenicStep;
  }
  setDimensions(dimensions, coordinates) {
    this.dimensions = { w: dimensions.w, h: dimensions.h }; this.coordinates = coordinates;
    this.accessBounds = null; this.accessTransition = null;
    if (this.width) this.resize(this.width, this.height);
    this.fit();
  }
  focusOn(x, y, elevation = 0, options = {}) {
    const b = this.accessBounds;
    if (b) { x = Math.max(b.x0, Math.min(b.x1, x)); y = Math.max(b.y0, Math.min(b.y1, y)); }
    const p = this.coordinates.worldToRender(x, y, elevation);
    this.focus = { from: this.controls.target.clone(), to: new THREE.Vector3(p.x, p.y, p.z), elapsed: 0, duration: Math.max(0.01, options.duration ?? 0.6) };
  }
  accessZoom(bounds = this.accessBounds) {
    return bounds ? 1 / Math.max((bounds.x1 - bounds.x0 + 1) / this.dimensions.w,
      (bounds.y1 - bounds.y0 + 1) / this.dimensions.h) : 1;
  }
  setAccessBounds(bounds = null, { transition = false } = {}) {
    this.accessBounds = bounds;
    const zoom = this.accessZoom(bounds);
    if (transition) this.accessTransition = { from: this.camera.zoom, to: zoom, elapsed: 0, duration: .45 };
    else if (bounds) { this.camera.zoom = zoom; this.camera.updateProjectionMatrix(); }
    this.clampAccessTarget();
  }
  clampAccessTarget() {
    if (!this.accessBounds) return;
    const target = this.controls.target, p = this.coordinates.renderToWorld(target.x, target.z), b = this.accessBounds;
    const next = this.coordinates.worldToRender(Math.max(b.x0, Math.min(b.x1, p.x)), Math.max(b.y0, Math.min(b.y1, p.y)), target.y);
    const delta = new THREE.Vector3(next.x - target.x, 0, next.z - target.z);
    this.camera.position.add(delta); target.add(delta);
  }
  cancelFocus() { this.focus = null; }
  rotate(angle) {
    this.cancelFocus(); const offset = this.camera.position.clone().sub(this.controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    this.camera.position.copy(this.controls.target).add(offset); this.controls.update();
  }
  moveLocal(horizontal, forward, dt, fast = false) {
    if (!horizontal && !forward) return;
    const camera = this.camera, target = this.controls.target;
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); right.y = 0;
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0); else right.normalize();
    const ahead = new THREE.Vector3().subVectors(target, camera.position); ahead.y = 0;
    if (ahead.lengthSq() < 1e-8) ahead.set(0, 0, -1); else ahead.normalize();
    const speed = Math.max(this.dimensions.w, this.dimensions.h) * 0.72 * (fast ? 2.8 : 1) * Math.max(0, dt || 0);
    const delta = right.multiplyScalar(horizontal).add(ahead.multiplyScalar(forward));
    if (delta.lengthSq() > 1) delta.normalize();
    delta.multiplyScalar(speed);
    camera.position.add(delta); target.add(delta);
    this.cancelFocus(); this.controls.update(); this.clampAccessTarget();
  }
  update(dt) {
    if (this.focus) {
      const f = this.focus; f.elapsed += dt;
      const t = Math.min(1, f.elapsed / f.duration), next = f.from.clone().lerp(f.to, 1 - (1 - t) ** 3);
      this.camera.position.add(next.clone().sub(this.controls.target)); this.controls.target.copy(next);
      if (t === 1) this.focus = null;
    }
    this.controls.update();
    this.clampAccessTarget();
    if (this.accessTransition) {
      const t = this.accessTransition; t.elapsed += Math.max(0, dt || 0);
      const progress = Math.min(1, t.elapsed / t.duration);
      this.camera.zoom = t.from + (t.to - t.from) * (1 - (1 - progress) ** 3);
      this.camera.updateProjectionMatrix();
      if (progress === 1) this.accessTransition = null;
    }
  }
  dispose() { this.controls.dispose(); }
}
