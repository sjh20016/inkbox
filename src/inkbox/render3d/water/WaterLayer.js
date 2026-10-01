import * as THREE from 'three';
import { gridGeometry } from '../terrain/TerrainMesh.js';
import { ElevationField } from '../terrain/ElevationField.js';
import { applyQuadMask } from '../region/quadMask.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

/**
 * 水面网格。
 *
 * M2-B §8：高度改问 `stage.elevation`。注意水面要的是「**高程 + 水深**」的高度，
 * 所以走 `nodeForHeight(value, x, y)`（按高度值求格点高度）而不是 `node(x, y)`
 * （只按世界格的高程求）。两者在 RAW 下逐位一致，但语义不同，别混用。
 *
 * M2-B §21：凡间水**只保留窗外**（窗内交给目标位面）。遮罩与地形共用
 * `applyQuadMask` ⇒ 判据只有 RegionGeometry 一条（§19）。
 * ⚠️ **不要**为了结构对称自动给上界 / 幽冥造凡间式蓝色水——它们现在
 * `water: false`，那位面有没有「水」这个视觉语义**尚未论证**（§21 / §27）。
 */
export class WaterLayer {
  constructor(world, coordinates, elevation = new ElevationField(world)) {
    this.world = world; this.coordinates = coordinates; this.elevation = elevation;
    this.geometry = gridGeometry(world, coordinates);
    this.material = new THREE.MeshBasicMaterial({ color: '#718f92', transparent: true, opacity: 0.68, depthWrite: false });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = RENDER_ORDER.water;
    this.fullIndices = this.geometry.index.array.slice();
    this.geometry.index.setUsage(THREE.DynamicDrawUsage);
    this.regionGeometry = null;
    this.regionInside = true;
    this.keptQuads = (world.w - 1) * (world.h - 1);
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
  /** 与 TerrainMesh 同款：按 Region 保留 / 排除 quad（§19 的唯一判据链）。 */
  setRegionGeometry(geometry, inside = true) {
    if (this.regionGeometry === geometry && this.regionInside === !!inside) return;
    this.regionGeometry = geometry || null;
    this.regionInside = !!inside;
    this.keptQuads = applyQuadMask({
      geometry: this.geometry, fullIndices: this.fullIndices, regionGeometry: this.regionGeometry,
      inside: this.regionInside, quadW: this.world.w - 1, quadH: this.world.h - 1,
    });
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
