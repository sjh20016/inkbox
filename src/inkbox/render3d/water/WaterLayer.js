import * as THREE from 'three';
import { ElevationField } from '../terrain/ElevationField.js';
import { gridGeometry } from '../terrain/TerrainMesh.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

/**
 * 水面网格。
 *
 * M2-B §8：高度改问 `stage.elevation`。注意水面要的是「**高程 + 水深**」的高度，
 * 所以走 `nodeForHeight(value, x, y)`（按高度值求格点高度）而不是 `node(x, y)`
 * （只按世界格的高程求）。两者在 RAW 下逐位一致，但语义不同，别混用。
 */
export class WaterLayer {
  constructor(world, coordinates, elevation = new ElevationField(world)) {
    this.world = world; this.coordinates = coordinates; this.elevation = elevation;
    this.geometry = gridGeometry(world, coordinates);
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
        attr.setY(i, w.water[i] > 0.0015
          ? this.elevation.nodeForHeight(w.height[i] + w.water[i], x, y) + 0.04
          : this.elevation.nodeForHeight(w.height[i], x, y) - 0.08);
      }
      attr.addUpdateRange((y * w.w + region.x0) * 3, (region.x1 - region.x0 + 1) * 3);
    }
    attr.needsUpdate = true;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
