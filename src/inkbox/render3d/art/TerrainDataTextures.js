import * as THREE from 'three';
import { TERRAIN_INFO } from '../../core/config.js';

function texture(data, w, h, format, type) {
  const t = new THREE.DataTexture(data, w, h, format, type);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false; t.flipY = false; t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/** One read-only GPU snapshot per terrain. R = raw world height, G = final stage elevation.
 * B/A = unnormalised broad X/Y gradient at the grid vertex, for radius 2.5.
 * Type IDs are bytes, NEVER interpolated. Upload ranges are component offsets in r186.
 * Dirty dispatch is TerrainMesh.update's existing height/type channel, not a new scan.
 */
export class TerrainDataTextures {
  constructor(world, elevation) {
    this.world = world; this.elevation = elevation; this.disposed = false;
    this.packedBroadRadius = 2.5;
    this.packedBroadGradient = true;
    this.heights = new Float32Array(world.size * 4);
    // r186 partial texture uploads support RGBA only (WebGLTextures componentStride=4).
    this.types = new Uint8Array(world.size * 4);
    this.heightTexture = texture(this.heights, world.w, world.h, THREE.RGBAFormat, THREE.FloatType);
    this.typeTexture = texture(this.types, world.w, world.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.uploads = { height: 0, type: 0, cells: 0 };
    this.update({ x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 });
  }
  update(region, flags = { height: true, type: true }) {
    if (!region || this.disposed) return;
    const w = this.world;
    const x0 = Math.max(0, Math.floor(region.x0)), x1 = Math.min(w.w - 1, Math.ceil(region.x1));
    const y0 = Math.max(0, Math.floor(region.y0)), y1 = Math.min(w.h - 1, Math.ceil(region.y1));
    if (x0 > x1 || y0 > y1) return;
    const height = flags.height !== false, type = flags.type !== false;
    if (!height && !type) return;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w.w + x;
        if (height) {
          this.heights[i * 4] = w.height[i];
          this.heights[i * 4 + 1] = this.elevation.node(x, y);
        }
        if (type) this.types[i * 4] = w.type[i] < TERRAIN_INFO.length ? w.type[i] : 5;
      }
      if (type) this.typeTexture.addUpdateRange((y * w.w + x0) * 4, (x1 - x0 + 1) * 4);
    }
    if (height) {
      // Each gradient touches only G on the same axis at offsets ±2.5. The
      // farthest source texel is three cells away. Refresh R/G in the exact
      // dirty region first, then B/A in its halo without changing R/G there.
      const radius = this.packedBroadRadius, halo = Math.ceil(radius);
      const hx0 = Math.max(0, x0 - halo), hx1 = Math.min(w.w - 1, x1 + halo);
      const hy0 = Math.max(0, y0 - halo), hy1 = Math.min(w.h - 1, y1 + halo);
      const at = (x, y) => this.heights[(y * w.w + x) * 4 + 1];
      const sampleX = (x, y) => {
        const c = Math.max(0, Math.min(w.w - 1, x)), i = Math.floor(c), f = c - i;
        return at(i, y) * (1 - f) + at(Math.min(w.w - 1, i + 1), y) * f;
      };
      const sampleY = (x, y) => {
        const c = Math.max(0, Math.min(w.h - 1, y)), i = Math.floor(c), f = c - i;
        return at(x, i) * (1 - f) + at(x, Math.min(w.h - 1, i + 1)) * f;
      };
      for (let y = hy0; y <= hy1; y++) {
        for (let x = hx0; x <= hx1; x++) {
          const offset = (y * w.w + x) * 4;
          this.heights[offset + 2] = (sampleX(x + radius, y) - sampleX(x - radius, y)) / (2 * radius);
          this.heights[offset + 3] = (sampleY(x, y + radius) - sampleY(x, y - radius)) / (2 * radius);
        }
        this.heightTexture.addUpdateRange((y * w.w + hx0) * 4, (hx1 - hx0 + 1) * 4);
      }
      this.heightTexture.needsUpdate = true; this.uploads.height++;
    }
    if (type) { this.typeTexture.needsUpdate = true; this.uploads.type++; }
    this.uploads.cells += (x1 - x0 + 1) * (y1 - y0 + 1);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.heightTexture.dispose(); this.typeTexture.dispose();
  }
}
