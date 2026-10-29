import * as THREE from 'three';
import { quadIndices } from '../terrain/topology.js';
import { INKFLAME_GLSL, inkflameUniforms } from './NetherInkflame.js';

// A thin ink wash laid on the existing triangles. It never supplies a second
// surface to the picker; every vertex comes from the authoritative heightfield.
const VERTEX = `
attribute vec3 ink;
attribute float cliffSlope;
attribute float cliffFamily;
varying vec3 vInk;
varying float vHeight;
varying vec2 vGround;
varying float vSlope;
varying float vFamily;
void main() {
  vInk = ink;
  vHeight = position.y;
  vGround = position.xz;
  vSlope = cliffSlope;
  vFamily = cliffFamily;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAGMENT = `
${INKFLAME_GLSL}
varying vec3 vInk;
varying float vHeight;
varying vec2 vGround;
varying float vSlope;
varying float vFamily;
void main() {
  float opacity = smoothstep(0.9, 2.6, vSlope);
  if (opacity < 0.01) discard;
  float footprint = max(length(dFdx(vGround)), length(dFdy(vGround)));
  float detail = 1.0 - smoothstep(0.28, 1.6, footprint);
  float strata = 1.0 - smoothstep(0.30, 0.70, abs(vFamily));
  float fracture = 1.0 - smoothstep(0.30, 0.70, abs(vFamily - 1.0));
  float abyss = 1.0 - smoothstep(0.30, 0.70, abs(vFamily - 2.0));
  float phase = vHeight * 0.18;
  float band = abs(fract(phase) - 0.5);
  float aa = max(fwidth(phase), 0.012);
  float line = 1.0 - smoothstep(0.025, 0.025 + aa, band);
  // All breakup is anchored to terrain coordinates, so orbiting cannot move ink.
  float grain = sin(vGround.x * 0.31 + vGround.y * 0.19 + floor(phase) * 2.1);
  float broken = smoothstep(-0.35, 0.18, grain);
  float fissure = 1.0 - smoothstep(0.0, 0.055 + fwidth(vGround.x),
    abs(fract(vGround.x * 0.071 + sin(vGround.y * 0.09) * 0.12) - 0.5));
  float layerInk = (0.24 * strata + 0.11 * fracture + 0.035 * abyss) * line * broken;
  float crackInk = (0.015 * strata + 0.075 * fracture + 0.01 * abyss) * fissure * broken;
  // The shared terrain shader owns the continuous grey rock mass and deep ink.
  // This conservative mesh adds broken bedding/fractures only: its gradient or
  // budget boundary cannot cut a differently coloured triangle into a cliff.
  vec3 pigment = vInk * 0.24;
  float inkAlpha = opacity * detail * (layerInk + crackInk);
  if(nfOptions.w>.5){
    vec4 m=nfMasks(vec3(vGround.x,vHeight,vGround.y));
    float strength=nfOptions.w>1.5?1.0:.48;
    float wet=nfNoise(vec2(vGround.x*.19+vGround.y*.13,vHeight*.027));
    float drag=smoothstep(.72,.88,wet)*(.25+.75*m.r);
    float primaryPhase=vHeight*.12+nfNoise(vGround*.06)*.55;
    float aa=max(fwidth(primaryPhase),.025);
    float bed=1.-smoothstep(.025,.025+aa,abs(fract(primaryPhase)-.5));
    float brokenBed=bed*smoothstep(.38,.68,nfNoise(vGround*.13));
    float rubbed=smoothstep(.69,.88,nfNoise(vec2(vGround.x*.28+vGround.y*.16,vHeight*.085)));
    float authored=brokenBed*(.16+.16*strata)+drag*.22+crackInk*.5;
    authored*=1.-rubbed*.55;
    inkAlpha=mix(inkAlpha,opacity*detail*authored,strength);
    inkAlpha*=1.-m.b*.86;
  }
  if (inkAlpha < 0.003) discard;
  gl_FragColor = vec4(pigment, inkAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class NetherCliffLayer {
  constructor(world, coordinates, elevation, fallbackTexture = null) {
    this.world = world;
    this.coordinates = coordinates;
    this.elevation = elevation;
    this.regionGeometry = null;
    this.regionInside = true;
    this.enabled = true;
    this.dirty = false;
    this.disposed = false;
    this.group = new THREE.Group();
    this.group.name = 'NetherCliffLayer';
    this.material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT,
      side: THREE.DoubleSide, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: inkflameUniforms(fallbackTexture,world) });
    this.material.name = 'NetherCliffInk';
    this.geometry = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'NetherCliffOverlay';
    this.mesh.raycast = () => {};
    this.mesh.userData.presentationOnly = true;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.stats = { quads: 0, triangles: 0, rebuilds: 0, segments: 0, families: { strata: 0, fracture: 0, abyss: 0 } };
    this.rebuild();
  }
  setEnabled(enabled) {
    if (this.disposed) return;
    this.enabled = !!enabled;
    if (this.enabled && this.dirty) this.rebuild();
    this.group.visible = this.enabled;
  }
  setRegionGeometry(region, inside = true) {
    if (this.regionGeometry === region && this.regionInside === !!inside) return;
    this.regionGeometry = region;
    this.regionInside = !!inside;
    if (this.enabled) this.rebuild(); else this.dirty = true;
  }
  update() { /* Geometry is rebuilt only for world edits or Region changes. */ }
  rebuild() {
    if (this.disposed) return;
    if (!this.enabled) { this.dirty = true; return; }
    const { world: w, elevation, coordinates } = this;
    const qw = w.w - 1, qh = w.h - 1, count = qw * qh;
    const steep = new Uint8Array(count), drop = new Float32Array(count);
    for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) {
      const q = y * qw + x, i = y * w.w + x;
      const a = elevation.node(x, y), b = elevation.node(x + 1, y);
      const c = elevation.node(x, y + 1), d = elevation.node(x + 1, y + 1);
      const span = Math.max(a, b, c, d) - Math.min(a, b, c, d);
      // Only large structural drops, not the busy small-scale chisel noise.
      if (span > 3.5 && Math.max(w.height[i], w.height[i + 1], w.height[i + w.w], w.height[i + w.w + 1]) > 0.48) {
        steep[q] = 1;
        drop[q] = span;
      }
    }
    const positions = [], inks = [], slopes = [], familyCodes = [];
    const slopeCache = new Float32Array(w.size).fill(-1);
    const slopeAt = index => {
      if (slopeCache[index] >= 0) return slopeCache[index];
      const x = index % w.w, y = (index - x) / w.w;
      const sx = (elevation.node(Math.min(w.w - 1, x + 1), y) - elevation.node(Math.max(0, x - 1), y)) * (x > 0 && x < w.w - 1 ? 0.5 : 1);
      const sz = (elevation.node(x, Math.min(w.h - 1, y + 1)) - elevation.node(x, Math.max(0, y - 1))) * (y > 0 && y < w.h - 1 ? 0.5 : 1);
      return (slopeCache[index] = Math.hypot(sx, sz));
    };
    let segments = 0, quads = 0;
    const families = { strata: 0, fracture: 0, abyss: 0 };
    const cap = Math.min(9500, Math.max(2500, Math.round(count * 0.075)));
    const selected = [];
    for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) {
      const q = y * qw + x;
      if (!steep[q]) continue;
      if (this.regionGeometry && (this.regionGeometry.allInside ? !this.regionInside :
          this.regionGeometry.isInsideQuad(x, y) !== this.regionInside)) continue;
      const neighbors = Number(x > 0 && steep[q - 1]) + Number(x + 1 < qw && steep[q + 1]) +
        Number(y > 0 && steep[q - qw]) + Number(y + 1 < qh && steep[q + qw]);
      if (neighbors < 2) continue; // reject isolated spikes and tiny chains
      selected.push(q);
    }
    // Spend the geometry budget on the steepest cuts across the whole world.
    // Row-order truncation hides the southern half of large candidates.
    if (selected.length > cap) {
      selected.sort((a, b) => drop[b] - drop[a] || a - b);
      selected.length = cap;
    }
    selected.sort((a, b) => a - b);
    for (const q of selected) {
      const x = q % qw, y = (q - x) / qw;
      const neighbors = Number(x > 0 && steep[q - 1]) + Number(x + 1 < qw && steep[q + 1]) +
        Number(y > 0 && steep[q - qw]) + Number(y + 1 < qh && steep[q + qw]);
      const indices = quadIndices(w, x, y);
      const i = y * w.w + x;
      const high = Math.max(w.height[i], w.height[i + 1], w.height[i + w.w], w.height[i + w.w + 1]);
      const low = Math.min(w.height[i], w.height[i + 1], w.height[i + w.w], w.height[i + w.w + 1]);
      const family = low < 0.28 ? 'abyss' : drop[q] > 4.5 ? 'fracture' : 'strata';
      families[family]++;
      const familyCode = family === 'abyss' ? 2 : family === 'fracture' ? 1 : 0;
      for (const index of indices) {
        const nx = index % w.w, ny = (index - nx) / w.w;
        const p = coordinates.cellToRender(nx, ny);
        positions.push(p.x, elevation.node(nx, ny), p.z);
        // The same world node receives the same ink in every adjacent quad.
        // This avoids a checkerboard of hard per-quad color discontinuities.
        const level = Math.max(0, Math.min(1, (w.height[index] - 0.25) / 0.85));
        const tone = 0.075 + 0.15 * level * level;
        inks.push(tone, tone * 0.96, tone * 0.87);
        slopes.push(slopeAt(index));
        familyCodes.push(familyCode);
      }
      quads++;
      if (neighbors <= 2) segments++;
    }
    const next = new THREE.BufferGeometry();
    next.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    next.setAttribute('ink', new THREE.Float32BufferAttribute(inks, 3));
    next.setAttribute('cliffSlope', new THREE.Float32BufferAttribute(slopes, 1));
    next.setAttribute('cliffFamily', new THREE.Float32BufferAttribute(familyCodes, 1));
    if (positions.length) next.computeBoundingSphere();
    this.mesh.geometry = next;
    this.geometry.dispose();
    this.geometry = next;
    this.stats = { quads, triangles: quads * 2, segments, rebuilds: this.stats.rebuilds + 1, families };
    this.dirty = false;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.group.clear();
    this.world = this.coordinates = this.elevation = this.regionGeometry = null;
  }
}
