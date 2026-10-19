import * as THREE from 'three';
import { diagonalAD, adaptiveTopology } from '../terrain/topology.js';

// Runtime A/B switch; set before selecting the art profile. CPU clipping remains
// the compatibility oracle, while normal realm-style rendering uses this path.
export const waterGpuConfig = {
  enabled: new URLSearchParams(globalThis.location?.search ?? '').get('water') !== 'cpu',
};

/** Fixed nodal mesh and perimeter. Only the authoritative float snapshot moves.
 * R = surface elevation, G = terrain elevation, B = signed wet depth.
 * Interpolating B across each terrain triangle and discarding B <= 0 gives the
 * same linear shoreline as CPU polygon clipping, including the perimeter.
 */
export class WaterGpuSurface {
  constructor(world, coordinates, elevation, bounds) {
    this.world = world; this.elevation = elevation;
    this.rimEdges = [];
    for (let x = 0; x < world.w - 1; x++) {
      this.rimEdges.push([x, 0, x + 1, 0, x, 0], [x + 1, world.h - 1, x, world.h - 1, x, world.h - 2]);
    }
    for (let y = 0; y < world.h - 1; y++) {
      this.rimEdges.push([0, y + 1, 0, y, 0, y], [world.w - 1, y, world.w - 1, y + 1, world.w - 2, y]);
    }
    const count = world.size + this.rimEdges.length * 4;
    const position = new Float32Array(count * 3), sample = new Float32Array(count * 3);
    const write = (v, x, y, bottom = 0) => {
      const p = coordinates.cellToRender(x, y);
      position.set([p.x, 0, p.z], v * 3);
      sample.set([(x + .5) / world.w, (y + .5) / world.h, bottom], v * 3);
    };
    for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) write(y * world.w + x, x, y);
    this.rimEdges.forEach(([ax, ay, bx, by], k) => {
      const v = world.size + k * 4;
      write(v, ax, ay, 1); write(v + 1, ax, ay); write(v + 2, bx, by); write(v + 3, bx, by, 1);
    });
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    this.geometry.setAttribute('waterSample', new THREE.BufferAttribute(sample, 3));
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(((world.w - 1) * (world.h - 1) + this.rimEdges.length) * 6), 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.index.onUpload(() => { this.fullIndexUpload = false; });
    this.geometry.boundingBox = bounds.boundingBox.clone();
    this.geometry.boundingSphere = bounds.boundingSphere.clone();
    this.diagonals = new Uint8Array((world.w - 1) * (world.h - 1));
    this.values = new Float32Array(world.size * 4);
    this.texture = new THREE.DataTexture(this.values, world.w, world.h, THREE.RGBAFormat, THREE.FloatType);
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false; this.texture.flipY = false;
    this.texture.unpackAlignment = 1;
    this.fullTextureUpload = true;
    this.texture.onUpdate = () => { this.fullTextureUpload = false; };
    this.setRegionGeometry(null, true);
    this.update({ x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 });
  }
  kept(x, y) {
    return !this.region || this.region.allInside || this.region.isInsideQuad(x, y) === this.inside;
  }
  writeQuad(x, y, ad) {
    const w = this.world, q = y * (w.w - 1) + x, a = y * w.w + x, b = a + 1, c = a + w.w, d = c + 1;
    this.diagonals[q] = Number(ad);
    const out = this.geometry.index.array, o = q * 6;
    if (!this.kept(x, y)) { out.fill(a, o, o + 6); return; }
    out[o] = a; out[o + 1] = c; out[o + 2] = ad ? d : b;
    out[o + 3] = ad ? a : b; out[o + 4] = ad ? d : c; out[o + 5] = ad ? b : d;
  }
  setRegionGeometry(region, inside) {
    this.region = region; this.inside = inside;
    const w = this.world, index = this.geometry.index;
    let kept = 0;
    for (let y = 0; y < w.h - 1; y++) for (let x = 0; x < w.w - 1; x++) {
      this.writeQuad(x, y, diagonalAD(w, x, y));
      if (this.kept(x, y)) kept++;
    }
    const base = (w.w - 1) * (w.h - 1) * 6;
    this.rimEdges.forEach((e, k) => {
      const v = w.size + k * 4, o = base + k * 6;
      index.array.set(this.kept(e[4], e[5]) ? [v, v + 1, v + 2, v, v + 2, v + 3] : [v, v, v, v, v, v], o);
    });
    this.fullIndexUpload = true;
    index.clearUpdateRanges(); index.needsUpdate = true;
    this.keptQuads = kept;
  }
  update(region) {
    const w = this.world, t = this.texture, e = this.elevation;
    const x0 = Math.max(0, region.x0), x1 = Math.min(w.w - 1, region.x1);
    const y0 = Math.max(0, region.y0), y1 = Math.min(w.h - 1, region.y1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w.w + x, o = i * 4;
        this.values[o] = Math.fround(e.nodeForHeight(w.height[i] + w.water[i], x, y)) + .04;
        this.values[o + 1] = e.node(x, y);
        // Subtract before Float32 storage to retain the exact CPU threshold sign.
        this.values[o + 2] = w.water[i] - .0015;
      }
      if (!this.fullTextureUpload) t.addUpdateRange((y * w.w + x0) * 4, (x1 - x0 + 1) * 4);
    }
    // r186 does not merge adjacent texture row uploads. Large dirty spans use
    // one upload; small edits keep their precise row ranges.
    if (y1 - y0 + 1 >= 64) { this.fullTextureUpload = true; t.clearUpdateRanges(); }
    t.needsUpdate = true;
    if (!adaptiveTopology(w)) return;
    let changed = false;
    for (let y = Math.max(0, y0 - 1); y <= Math.min(w.h - 2, y1); y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(w.w - 2, x1); x++) {
      const q = y * (w.w - 1) + x, ad = diagonalAD(w, x, y);
      if (this.diagonals[q] === Number(ad)) continue;
      this.writeQuad(x, y, ad);
      if (this.kept(x, y)) {
        if (!this.fullIndexUpload) this.geometry.index.addUpdateRange(q * 6, 6);
        changed = true;
      }
    }
    // V1.1: large sculpt strokes flip many diagonals at once; many tiny index ranges were
    // observed (intermittently) to leave stale triangles stretched across the map. Above a
    // small budget, upload the whole index once instead.
    if (changed && this.geometry.index.updateRanges.length > 48) { this.fullIndexUpload = true; this.geometry.index.clearUpdateRanges(); }
    if (changed) this.geometry.index.needsUpdate = true;
  }
  dispose() { this.geometry.dispose(); this.texture.dispose(); }
}
