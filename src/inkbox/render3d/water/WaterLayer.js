import * as THREE from 'three';
import { gridGeometry } from '../terrain/TerrainMesh.js';
import { visualElevation } from '../terrain/VisualElevation.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

export class WaterLayer {
  constructor(world, coordinates) {
    this.world = world; this.geometry = gridGeometry(world, coordinates);
    this.material = new THREE.MeshBasicMaterial({ color: '#718f92', transparent: true, opacity: 0.68, depthWrite: false });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = RENDER_ORDER.water;
    this.update({ x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 });
  }
  update(region) {
    const w = this.world, attr = this.geometry.attributes.position;
    for (let y = region.y0; y <= region.y1; y++) {
      for (let x = region.x0; x <= region.x1; x++) {
        const i = y * w.w + x;
        // Dry surface lies just below terrain. Wet surface uses the existing water depth.
        attr.setY(i, w.water[i] > 0.0015 ? visualElevation(w.height[i] + w.water[i]) + 0.04 : visualElevation(w.height[i]) - 0.08);
      }
      attr.addUpdateRange((y * w.w + region.x0) * 3, (region.x1 - region.x0 + 1) * 3);
    }
    attr.needsUpdate = true;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
