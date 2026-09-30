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
    this.camera.position.set(180, 250, 240); this.camera.zoom = 1;
    this.camera.updateProjectionMatrix(); this.controls.update();
  }
  setDimensions(dimensions, coordinates) {
    this.dimensions = { w: dimensions.w, h: dimensions.h }; this.coordinates = coordinates;
    if (this.width) this.resize(this.width, this.height);
    this.fit();
  }
  focusOn(x, y, elevation = 0, options = {}) {
    const p = this.coordinates.worldToRender(x, y, elevation);
    this.focus = { from: this.controls.target.clone(), to: new THREE.Vector3(p.x, p.y, p.z), elapsed: 0, duration: Math.max(0.01, options.duration ?? 0.6) };
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
  }
  dispose() { this.controls.dispose(); }
}
