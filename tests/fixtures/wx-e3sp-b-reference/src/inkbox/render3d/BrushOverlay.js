import * as THREE from 'three';
import { RENDER_ORDER } from './shared/RenderOrder.js';

/**
 * 笔刷落点环。
 *
 * M2-B §8：贴地高度改问 `stage.elevation.at()`，不再自己 import `surfaceElevation`
 * ——高程只有一个入口（S10）。
 */
export class BrushOverlay {
  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(97 * 3), 3));
    this.mesh = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#a8493c', depthTest: false }));
    this.mesh.renderOrder = RENDER_ORDER.selection; this.mesh.frustumCulled = false; this.mesh.visible = false;
  }
  update(hit, radius, stage) {
    this.mesh.visible = !!(hit && hit.plane === 'mortal' && stage && stage.elevation);
    if (!this.mesh.visible) return;
    const attr = this.mesh.geometry.attributes.position, world = stage.world;
    for (let i = 0; i <= 96; i++) {
      const angle = i / 96 * Math.PI * 2;
      const x = Math.max(0, Math.min(world.w - 1, hit.world.x + Math.cos(angle) * radius));
      const y = Math.max(0, Math.min(world.h - 1, hit.world.y + Math.sin(angle) * radius));
      const p = stage.coordinates.worldToRender(x, y, stage.elevation.at(x, y) + 0.12);
      attr.setXYZ(i, p.x, p.y, p.z);
    }
    attr.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
