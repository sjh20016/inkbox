import * as THREE from 'three';
import { WaterGpuSurface } from '../water/WaterGpuSurface.js';
import { diagonalAD } from '../terrain/topology.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

const WET = 0.0015;
const vertexShader = `
uniform sampler2D nodes;
attribute vec3 waterSample;
varying vec2 vPosition;
varying float vDepth;
void main() {
  vec4 n = texture2D(nodes, waterSample.xy);
  vec3 p = position;
  p.y = mix(n.r, n.g, waterSample.z);
  vDepth = n.b;
  vPosition = p.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const fragmentShader = `
uniform float time;
varying vec2 vPosition;
varying float vDepth;
void main() {
  if (vDepth <= 0.0) discard;
  float edge = 1.0 - smoothstep(0.0001, 0.010, vDepth);
  vec2 p = vPosition;
  float phase = p.y * 2.3 + sin(p.x * 0.10 + time * 0.05) * 0.7 - time * 0.08;
  float aa = max(fwidth(phase), 0.018);
  float line = 1.0 - smoothstep(0.02, 0.02 + aa, abs(fract(phase) - 0.5));
  float broken = smoothstep(0.60, 0.88, sin(p.x * 0.24 + sin(p.y * 0.4)));
  vec3 color = mix(vec3(0.040, 0.037, 0.034), vec3(0.61, 0.59, 0.54), edge * 0.78);
  color += vec3(0.09, 0.085, 0.075) * line * broken * (1.0 - edge);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Huangquan borrows the production water sampler and topology. Only wet quads
 * are submitted, in one draw. No water simulation, picker or saved state. */
export class NetherRiverLayer {
  constructor(world, coordinates, elevation, terrainGeometry) {
    this.world = world;
    this.surface = new WaterGpuSurface(world, coordinates, elevation, terrainGeometry);
    this.geometry = new THREE.BufferGeometry();
    for (const [key, attribute] of Object.entries(this.surface.geometry.attributes)) this.geometry.setAttribute(key, attribute);
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(this.surface.geometry.index.array.length), 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.boundingBox = terrainGeometry.boundingBox.clone();
    this.geometry.boundingSphere = terrainGeometry.boundingSphere.clone();
    this.material = new THREE.ShaderMaterial({ vertexShader, fragmentShader,
      uniforms: { nodes: { value: this.surface.texture }, time: { value: 0 } }, side: THREE.DoubleSide });
    this.material.name = 'HuangquanInk';
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'NetherRiver'; this.mesh.renderOrder = RENDER_ORDER.water;
    this.mesh.raycast = () => {}; this.mesh.userData.presentationOnly = true;
    this.active = new Set(); this.region = null; this.inside = true;
    this.stats = { quads: 0, triangles: 0, rebuilds: 0, sampledCells: 0 };
    this.update({ x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 });
  }
  wetQuad(x, y) {
    const i = y * this.world.w + x, a = this.world.water, w = this.world.w;
    return a[i] > WET || a[i + 1] > WET || a[i + w] > WET || a[i + w + 1] > WET;
  }
  kept(x, y) { return !this.region || this.region.isInsideQuad(x, y) === this.inside; }
  update(region) {
    if (!region) return;
    this.surface.update(region);
    const { w, h } = this.world, qw = w - 1;
    for (let y = Math.max(0, region.y0 - 1); y <= Math.min(h - 2, region.y1); y++) {
      for (let x = Math.max(0, region.x0 - 1); x <= Math.min(w - 2, region.x1); x++) {
        const q = y * qw + x;
        if (this.wetQuad(x, y)) this.active.add(q); else this.active.delete(q);
        this.stats.sampledCells++;
      }
    }
    this.reindex();
  }
  reindex() {
    const w = this.world, qw = w.w - 1, out = this.geometry.index.array;
    let n = 0, quads = 0;
    for (const q of this.active) {
      const x = q % qw, y = Math.floor(q / qw);
      if (!this.kept(x, y)) continue;
      const a = y * w.w + x, b = a + 1, c = a + w.w, d = c + 1;
      out.set(diagonalAD(w, x, y) ? [a, c, d, a, d, b] : [a, c, b, b, c, d], n);
      n += 6; quads++;
    }
    this.surface.rimEdges.forEach((e, k) => {
      if (!this.kept(e[4], e[5]) || (w.water[e[1] * w.w + e[0]] <= WET && w.water[e[3] * w.w + e[2]] <= WET)) return;
      const v = w.size + k * 4; out.set([v, v + 1, v + 2, v, v + 2, v + 3], n); n += 6;
    });
    this.geometry.index.clearUpdateRanges();
    if (n) this.geometry.index.addUpdateRange(0, n);
    this.geometry.index.needsUpdate = true; this.geometry.setDrawRange(0, n);
    Object.assign(this.stats, { quads, triangles: n / 3, rebuilds: this.stats.rebuilds + 1 });
  }
  tick(dt) { if (this.mesh.visible) this.material.uniforms.time.value += Math.max(0, dt || 0); }
  setRegionGeometry(region, inside = true) {
    if (this.region === region && this.inside === !!inside) return;
    this.region = region; this.inside = !!inside; this.reindex();
  }
  dispose() {
    this.mesh.removeFromParent(); this.geometry.dispose(); this.surface.dispose(); this.material.dispose(); this.active.clear();
  }
}
