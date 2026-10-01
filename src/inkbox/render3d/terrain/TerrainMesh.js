import * as THREE from 'three';
import { ElevationField } from './ElevationField.js';
import { TERRAIN_INFO } from '../../core/config.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

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
  // `elevation` 缺省只为**测试 / 历史调用**保留（等价 RAW）；生产路径由 PlaneStage 显式传入。
  constructor(world, coordinates, elevation = new ElevationField(world)) {
    this.world = world;
    this.elevation = elevation;
    this.geometry = gridGeometry(world, coordinates);
    this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(world.size * 3), 3).setUsage(THREE.DynamicDrawUsage));
    // Steep boundary slopes can face away even while the camera stays above ground.
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = RENDER_ORDER.terrain;
    this.fullIndices = this.geometry.index.array.slice();
    this.geometry.index.setUsage(THREE.DynamicDrawUsage);
    this.palette = TERRAIN_INFO.map(t => new THREE.Color(`rgb(${t.color.join(',')})`));
    this.update({ x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 });
  }
  /**
   * 刷新一块地形。
   *
   * @param {{x0:number,y0:number,x1:number,y1:number}|null} region 闭区间格坐标矩形。
   * @param {{height?:boolean, type?:boolean}} [options] 这一帧要写哪几项：
   *   · 只 `height` ⇒ 只重写顶点 Y；
   *   · 只 `type`   ⇒ 只重写顶点色；
   *   · 两者都给（**默认**）⇒ 都写。
   *
   * ⚠️ 默认「都写」是为了让「整图初始化」和「我只知道有一块区域要刷」的调用方
   *    不必关心分类；**Renderer3D 永远显式传 flags**，因为 `WorldRenderBridge`
   *    已经把 height 与 type 分成两条脏区（M1.1D D4.2）——
   *    只改 `type` 时重写一遍 Y 是纯浪费，而 M2 之后图更大、浪费会被放大。
   */
  update(region, options = { height: true, type: true }) {
    if (!region) return;
    const writeHeight = options.height !== false;
    const writeType = options.type !== false;
    if (!writeHeight && !writeType) return;
    const { position, color } = this.geometry.attributes, w = this.world;
    for (let y = region.y0; y <= region.y1; y++) {
      for (let x = region.x0; x <= region.x1; x++) {
        const i = y * w.w + x;
        if (writeHeight) position.setY(i, this.elevation.node(x, y));
        if (writeType) { const c = this.palette[w.type[i]] || this.palette[5]; color.setXYZ(i, c.r, c.g, c.b); }
      }
      const start = (y * w.w + region.x0) * 3, count = (region.x1 - region.x0 + 1) * 3;
      if (writeHeight) position.addUpdateRange(start, count);
      if (writeType) color.addUpdateRange(start, count);
    }
    if (writeHeight) position.needsUpdate = true;
    if (writeType) color.needsUpdate = true;
    // Flat material derives normals in the shader; no full-grid normal rebuild.
  }
  /** Keep or exclude quads by their world-grid centre, shared with entity filtering. */
  setRegionMask(region, inside = true) {
    if (this.regionMask === region && this.regionInside === !!inside) return;
    this.regionMask = region || null;
    this.regionInside = !!inside;
    if (!region) {
      this.geometry.index.array.set(this.fullIndices);
      this.geometry.index.needsUpdate = true;
      this.geometry.setDrawRange(0, this.fullIndices.length);
      return;
    }
    const { w, h } = this.world;
    const kept = this.geometry.index.array; let count = 0;
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      if (region.contains(x + 0.5, y + 0.5) !== this.regionInside) continue;
      const i = (y * (w - 1) + x) * 6;
      for (let k = 0; k < 6; k++) kept[count++] = this.fullIndices[i + k];
    }
    this.geometry.index.needsUpdate = true;
    this.geometry.setDrawRange(0, count);
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
