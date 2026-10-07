import * as THREE from 'three';

/**
 * M2-C2D P1 · Stage-owned 只读连续表面视觉场。
 *
 * RGBA Uint8 DataTexture + **LinearFilter**：
 *   R = 经固定参考深度归一化的 `world.water`（连续标量水深）。
 *   G/B/A = 同一格左 / 右 / 下邻居的量化 R 水深（边缘 clamp）。
 *
 * ⚠️ 这是对**连续标量水深**的插值——不是 terrain type 插值。
 *    `typeTexture` 依旧是离散 ID + NearestFilter，两者互不替代。
 *
 * 所有权：PlaneStage 创建并持有；Terrain / Water 只**借用**这张纹理，
 * 不拥有第二份世界真相。更新只接 `WorldRenderBridge` 现有 water/height
 * dirty 分类（Stage 自己缓存渲染状态，绝不向 World 加字段）。
 * 取样核半径 1 格 ⇒ dirty region 外扩 1 格，线性采样才不会读到旧 texel。
 */
export class SurfaceVisualFieldTexture {
  constructor(world, { depthReference = 0.5, kernelRadius = 1 } = {}) {
    this.world = world;
    this.depthReference = depthReference;
    // Packed neighbour bytes require at least a one-cell dirty halo.
    this.kernelRadius = Number.isFinite(kernelRadius) ? Math.max(1, Math.ceil(kernelRadius)) : 1;
    this.bytes = new Uint8Array(world.size * 4);
    this.texture = new THREE.DataTexture(this.bytes, world.w, world.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.flipY = false;
    this.texture.unpackAlignment = 1;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.name = `Inkbox:${world.plane ?? 'plane'}:surface-visual-field:RGBA8`;
    this.disposed = false;
    this.stats = { format: 'RGBA8', filter: 'linear', depthReference, kernelRadius: this.kernelRadius,
      bytes: this.bytes.byteLength, updates: 0, cells: 0 };
    this.update({ x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 });
  }

  /** region 是 bridge 报出的 dirty 闭区间；这里负责按核半径外扩。 */
  update(region) {
    if (!region || this.disposed) return;
    const w = this.world, k = this.kernelRadius;
    const x0 = Math.max(0, Math.floor(region.x0) - k), x1 = Math.min(w.w - 1, Math.ceil(region.x1) + k);
    const y0 = Math.max(0, Math.floor(region.y0) - k), y1 = Math.min(w.h - 1, Math.ceil(region.y1) + k);
    if (x0 > x1 || y0 > y1) return;
    const inv = 255 / this.depthReference;
    const depthByte = (x, y) => {
      const d = w.water[y * w.w + x];
      return d > 0 ? Math.min(255, Math.round(d * inv)) : 0;
    };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w.w + x;
        const offset = i * 4;
        this.bytes[offset] = depthByte(x, y);
        this.bytes[offset + 1] = depthByte(Math.max(0, x - 1), y);
        this.bytes[offset + 2] = depthByte(Math.min(w.w - 1, x + 1), y);
        this.bytes[offset + 3] = depthByte(x, Math.max(0, y - 1));
      }
      this.texture.addUpdateRange((y * w.w + x0) * 4, (x1 - x0 + 1) * 4);
    }
    this.texture.needsUpdate = true;
    this.stats.updates += 1;
    this.stats.cells += (x1 - x0 + 1) * (y1 - y0 + 1);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.texture.dispose();
    this.world = null;
  }
}
