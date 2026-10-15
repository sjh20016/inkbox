import * as THREE from 'three';
import { createTreePilot, PILOT_PALETTE } from '../art/PilotAssets.js';

function geometryFromTriangles(triangles, name, center = [0, 0, 0]) {
  const positions = [], colors = [], normals = [];
  for (const [aa, bb, cc, pigment] of triangles) {
    let a = aa, b = bb, c = cc;
    const ax = (a[0] + b[0] + c[0]) / 3 - center[0], ay = (a[1] + b[1] + c[1]) / 3 - center[1], az = (a[2] + b[2] + c[2]) / 3 - center[2];
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
    const outward = (aby * acz - abz * acy) * ax + (abz * acx - abx * acz) * ay + (abx * acy - aby * acx) * az;
    if (outward < -1e-8) [b, c] = [c, b];
    const color = new THREE.Color(PILOT_PALETTE[pigment]);
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), vc = new THREE.Vector3(...c);
    const normal = new THREE.Vector3().subVectors(vb, va).cross(new THREE.Vector3().subVectors(vc, va)).normalize();
    for (const v of [va, vb, vc]) {
      positions.push(v.x, v.y, v.z); colors.push(color.r, color.g, color.b);
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.name = name; g.userData.triangles = triangles.length;
  return g;
}

/** Build all fixed tree LOD geometries once. */
export function createTreeLODBatches() {
  const lod1 = [];
  // Low-edge pentagonal trunk prism: five sides plus two cap fans = 10 triangles.
  const sides = 5, lower = [], upper = [];
  for (let i = 0; i < sides; i++) {
    const a = i * Math.PI * 2 / sides;
    lower.push([Math.cos(a) * 0.075, 0, Math.sin(a) * 0.075]);
    upper.push([Math.cos(a) * 0.048, 0.78, Math.sin(a) * 0.048]);
  }
  const centerBottom = [0, 0, 0], centerTop = [0, 0.78, 0];
  for (let i = 0; i < sides; i++) {
    const n = (i + 1) % sides;
    lod1.push([lower[i], upper[n], lower[n], 'wood'], [lower[i], upper[i], upper[n], 'wood']);
    lod1.push([centerBottom, lower[i], lower[n], 'wood'], [centerTop, upper[n], upper[i], 'wood']);
  }
  // Two sparse five-face leaf pyramids, each capped only by its visible side planes.
  const crown = (cx, cy, cz, r, h, color) => {
    const ring = Array.from({ length: 5 }, (_, i) => {
      const a = i * Math.PI * 2 / 5;
      return [cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r];
    });
    const tip = [cx, cy + h, cz];
    for (let i = 0; i < 5; i++) lod1.push([ring[i], tip, ring[(i + 1) % 5], color]);
  };
  crown(0, 0.78, 0, 0.38, 0.72, 'cyan');

  const lod2 = [];
  // Closed four-sided double-pyramid foliage mass: eight opaque faces, visible from all yaw angles.
  const ring = [[0.46, 0.74, 0], [0, 0.74, 0.46], [-0.46, 0.74, 0], [0, 0.74, -0.46]];
  const top = [0, 1.52, 0], bottom = [0, 0.74, 0];
  for (let i = 0; i < 4; i++) {
    lod2.push([top, ring[i], ring[(i + 1) % 4], 'cyan']);
    lod2.push([bottom, ring[(i + 1) % 4], ring[i], 'cyan']);
  }
  return [createTreePilot(), geometryFromTriangles(lod1, 'Pilot:TreeLOD1'), geometryFromTriangles(lod2, 'Pilot:TreeLOD2', [0, 0.74, 0])];
}
