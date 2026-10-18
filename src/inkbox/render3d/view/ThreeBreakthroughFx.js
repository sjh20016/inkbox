import * as THREE from 'three';
import { decorationFootprintOwned } from '../environment/RealmDecorationLayer.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

export const BREAKTHROUGH_3D_CAP = 16;
const STYLES = Object.freeze(['minorSuccess', 'minorFailure', 'majorSuccess', 'majorFailure']);
const COLORS = Object.freeze({ minorSuccess: 0x7aa5a2, minorFailure: 0x6d3835,
  majorSuccess: 0xc59427, majorFailure: 0x9c302a });
// The default 200/288-cell overview needs broad ink strokes, not subpixel lines.
// Keep the whole enlarged seal inside the same ownership check as its center.
const REACH = Object.freeze({ major: 7.4, minor: 1.4 });

function geometryFor(style) {
  const major = style.startsWith('major'), success = style.endsWith('Success');
  const positions = [], indices = [];
  function stroke(ax, az, bx, bz, width) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len * width, nz = dx / len * width, i = positions.length / 3;
    positions.push(ax + nx, 0, az + nz, ax - nx, 0, az - nz,
      bx - nx, 0, bz - nz, bx + nx, 0, bz + nz);
    indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  const rings = major ? 3 : 1, segments = major ? 32 : 20;
  for (let ring = 0; ring < rings; ring++) {
    const radius = (major ? 6.2 : 1.25) * (1 - ring * .23);
    for (let j = 0; j < segments; j++) {
      const a = j / segments * Math.PI * 2, b = (j + 1) / segments * Math.PI * 2;
      stroke(Math.cos(a) * radius, Math.sin(a) * radius * .82,
        Math.cos(b) * radius, Math.sin(b) * radius * .82, major ? .18 : .085);
    }
  }
  if (major) for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const inner = success ? 3.7 : 1.7, outer = success ? 7.1 : 5.0;
    stroke(Math.cos(a) * inner, Math.sin(a) * inner * .82,
      Math.cos(a) * outer, Math.sin(a) * outer * .82, .18);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

// A few vertical ink sheets give the settled result height at character scale.
// They share the seal's fixed instance budget and never create objects per event.
function auraGeometryFor(style) {
  const major = style.startsWith('major'), success = style.endsWith('Success');
  const positions = [], indices = [];
  const count = major ? 8 : 4, radius = major ? 2.45 : .62;
  for (let i = 0; i < count; i++) {
    const angle = i * Math.PI * 2 / count;
    const r = radius * (i % 2 ? .73 : 1);
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    const width = major ? .31 : .15;
    const height = (major ? 4.8 : 1.65) * (.72 + i % 3 * .14);
    const base = positions.length / 3;
    if (success) {
      // Upward gathering strokes, broken at the crown.
      positions.push(x-width, .12, z, x+width, .12, z,
        x+width*.38, height, z, x-width*.38, height*.83, z);
    } else {
      // Failed qi breaks outward and falls, never reading as a victory beam.
      const ox = Math.cos(angle) * (major ? 1.1 : .38), oz = Math.sin(angle) * (major ? 1.1 : .38);
      positions.push(x-width, height*.55, z, x+width, height*.7, z,
        x+ox+width*.3, .12, z+oz, x+ox-width*.4, .34, z+oz);
    }
    indices.push(base,base+1,base+2,base,base+2,base+3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);
  return geometry;
}

/** Bounded, presentation-only ground seals for settled breakthroughs. */
export class ThreeBreakthroughFx {
  constructor({ plane, coordinates, elevation }) {
    this.plane = plane; this.coordinates = coordinates; this.elevation = elevation;
    this.root = new THREE.Group(); this.root.name = 'BreakthroughFx:' + plane;
    this.batches = {}; this.auras = {};
    for (const style of STYLES) {
      const geometry = geometryFor(style);
      const material = new THREE.MeshBasicMaterial({ color: COLORS[style], transparent: true,
        opacity: style.startsWith('major') ? .94 : .8, side: THREE.DoubleSide,
        depthWrite: false, depthTest: false });
      const mesh = new THREE.InstancedMesh(geometry, material, BREAKTHROUGH_3D_CAP);
      mesh.name = `BreakthroughFx:${plane}:${style}`; mesh.count = 0; mesh.visible = false;
      mesh.frustumCulled = false; mesh.renderOrder = RENDER_ORDER.fx + 1;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.presentationOnly = true; mesh.raycast = () => {};
      this.root.add(mesh); this.batches[style] = { mesh, geometry, material };
      const auraGeometry = auraGeometryFor(style);
      const auraMaterial = new THREE.MeshBasicMaterial({ color: COLORS[style], transparent: true,
        opacity: style.endsWith('Success') ? .76 : .82, side: THREE.DoubleSide,
        // Read as an event ink mark, like the seal. Steep terrain can otherwise
        // bury every vertical sheet; footprint ownership still gates the whole FX.
        depthWrite: false, depthTest: false });
      const aura = new THREE.InstancedMesh(auraGeometry, auraMaterial, BREAKTHROUGH_3D_CAP);
      aura.name = `BreakthroughAura:${plane}:${style}`; aura.count = 0; aura.visible = false;
      aura.frustumCulled = false; aura.renderOrder = RENDER_ORDER.fx + 2;
      aura.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      aura.userData.presentationOnly = true; aura.raycast = () => {};
      this.root.add(aura); this.auras[style] = { mesh: aura, geometry: auraGeometry, material: auraMaterial };
    }
    this.transform = new THREE.Object3D();
    this.footprint = { x: 0, y: 0, width: 0, depth: 0, rotationY: 0 };
    this.stats = { active: 0, majorActive: 0, successActive: 0, failureActive: 0,
      capacity: BREAKTHROUGH_3D_CAP, overflow: 0, regionRejected: 0, drawCalls: 0, triangles: 0 };
  }
  clear() {
    for (const { mesh } of Object.values(this.batches)) { mesh.count = 0; mesh.visible = false; }
    for (const { mesh } of Object.values(this.auras)) { mesh.count = 0; mesh.visible = false; }
    Object.assign(this.stats, { active: 0, majorActive: 0, successActive: 0, failureActive: 0,
      overflow: 0, regionRejected: 0, drawCalls: 0, triangles: 0 });
  }
  update(items, world, region = null, inside = true) {
    this.clear();
    if (this.disposed || !world || !Array.isArray(items) || !this.coordinates || !this.elevation) return;
    for (const major of [true, false]) for (const item of items) {
      if (item.plane !== this.plane || item.kind !== 'breakthrough' || item.data?.major !== major
        || !['success', 'failure'].includes(item.data?.outcome)
        || ![item.x, item.y, item.age, item.ttl].every(Number.isFinite)
        || !(item.ttl > 0) || item.age < 0 || item.age >= item.ttl) continue;
      if (this.stats.active >= BREAKTHROUGH_3D_CAP) { this.stats.overflow++; continue; }
      const reach = major ? REACH.major : REACH.minor, f = this.footprint;
      f.x = item.x; f.y = item.y; f.width = f.depth = reach * 2;
      if (!decorationFootprintOwned(world, region, inside, f)) { this.stats.regionRejected++; continue; }
      const z = this.elevation.at(item.x, item.y);
      if (!Number.isFinite(z)) continue;
      const point = this.coordinates.worldToRender(item.x, item.y, z + .24);
      if (![point.x, point.y, point.z].every(Number.isFinite)) continue;
      const progress = item.age / item.ttl, style = `${major ? 'major' : 'minor'}${item.data.outcome === 'success' ? 'Success' : 'Failure'}`;
      const batch = this.batches[style], index = batch.mesh.count++;
      this.transform.position.set(point.x, point.y, point.z);
      this.transform.rotation.set(0, (Number.isFinite(item.seed) ? item.seed : 0) * .35, 0);
      const pulse = Math.min(1, progress * 5) * Math.min(1, (1-progress) * 3);
      this.transform.scale.setScalar((item.data.outcome === 'success' ? .58 + progress * .42 : 1 - progress * .55) * pulse);
      this.transform.updateMatrix(); batch.mesh.setMatrixAt(index, this.transform.matrix);
      const aura = this.auras[style].mesh; aura.count++;
      this.transform.scale.set((.48 + progress * .45) * pulse,
        (item.data.outcome === 'success' ? .35 + progress * .75 : 1 - progress * .75) * pulse,
        (.48 + progress * .45) * pulse);
      this.transform.updateMatrix(); aura.setMatrixAt(index, this.transform.matrix);
      this.stats.active++; if (major) this.stats.majorActive++;
      this.stats[item.data.outcome === 'success' ? 'successActive' : 'failureActive']++;
    }
    for (const { mesh, geometry } of Object.values(this.batches)) if (mesh.count) {
      mesh.visible = true; mesh.instanceMatrix.needsUpdate = true;
      this.stats.drawCalls++; this.stats.triangles += mesh.count * geometry.index.count / 3;
    }
    for (const { mesh, geometry } of Object.values(this.auras)) if (mesh.count) {
      mesh.visible = true; mesh.instanceMatrix.needsUpdate = true;
      this.stats.drawCalls++; this.stats.triangles += mesh.count * geometry.index.count / 3;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.clear();
    for (const { mesh, geometry, material } of [...Object.values(this.batches), ...Object.values(this.auras)]) {
      mesh.removeFromParent(); mesh.dispose(); geometry.dispose(); material.dispose();
    }
    this.root.removeFromParent();
  }
}
