import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CameraRig {
  constructor(canvas, dimensions, coordinates) {
    this.dimensions = { w: dimensions.w, h: dimensions.h }; this.coordinates = coordinates;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
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
