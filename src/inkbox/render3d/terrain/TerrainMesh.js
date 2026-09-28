import * as THREE from 'three';
import { TERRAIN_INFO } from '../../core/config.js';
import { visualElevation } from './VisualElevation.js';

export function gridGeometry(world, coordinates) {
  const position = new Float32Array(world.size * 3);
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    const p = coordinates.cellToRender(x, y), i = (y * world.w + x) * 3;
    position.set([p.x, 0, p.z], i);
  }
  const indices = new Uint32Array((world.w - 1) * (world.h - 1) * 6);
  let j = 0;
  for (let y = 0; y < world.h - 1; y++) for (let x = 0; x < world.w - 1; x++) {
    const a = y * world.w + x, b = a + 1, c = a + world.w, d = c + 1;
    indices.set([a, c, b, b, c, d], j); j += 6;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  // Conservative immutable bounds cover all legal elevations, including future sculpting.
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-(world.w - 1) / 2, -30, -(world.h - 1) / 2), new THREE.Vector3((world.w - 1) / 2, 120, (world.h - 1) / 2));
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  return geometry;
}

export class TerrainMesh {
  constructor(world, coordinates) {
    this.world = world;
    this.geometry = gridGeometry(world, coordinates);
    this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(world.size * 3), 3).setUsage(THREE.DynamicDrawUsage));
    // Steep boundary slopes can face away even while the camera stays above ground.
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.palette = TERRAIN_INFO.map(t => new THREE.Color(`rgb(${t.color.join(',')})`));
    this.update({ x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 });
  }
  update(region) {
    const { position, color } = this.geometry.attributes, w = this.world;
    for (let y = region.y0; y <= region.y1; y++) {
      for (let x = region.x0; x <= region.x1; x++) {
        const i = y * w.w + x, c = this.palette[w.type[i]] || this.palette[5];
        position.setY(i, visualElevation(w.height[i]));
        color.setXYZ(i, c.r, c.g, c.b);
      }
      const start = (y * w.w + region.x0) * 3, count = (region.x1 - region.x0 + 1) * 3;
      position.addUpdateRange(start, count); color.addUpdateRange(start, count);
    }
    position.needsUpdate = true; color.needsUpdate = true;
    // Flat material derives normals in the shader; no full-grid normal rebuild.
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
