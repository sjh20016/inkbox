import * as THREE from 'three';

// Nine finite pigments shared by every pilot; no per-instance textures or materials.
export const PILOT_PALETTE = Object.freeze({
  paper: '#f5f2ea', warm: '#ded5be', ink: '#303537', blue: '#697b83',
  wood: '#79664f', earth: '#918773', red: '#96706b', cyan: '#9aaea3', skin: '#c9b698',
});

function part(geometry, color, position = [0, 0, 0], rotation = 0) {
  geometry.rotateZ(rotation);
  geometry.translate(...position);
  return { geometry, color };
}

function merge(parts, name) {
  const positions = []; const normals = []; const colors = [];
  for (const { geometry, color } of parts) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.computeVertexNormals(); // Each triangle is one deliberate low-poly block.
    const p = g.getAttribute('position'); const n = g.getAttribute('normal');
    const c = new THREE.Color(PILOT_PALETTE[color]);
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(c.r, c.g, c.b);
    }
    if (g !== geometry) g.dispose();
    geometry.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  out.computeBoundingBox(); out.computeBoundingSphere();
  out.name = name;
  out.userData.triangles = positions.length / 9;
  return out;
}

export function createCultivatorPilot() {
  const p = [];
  p.push(part(new THREE.CylinderGeometry(0.26, 0.40, 0.94, 8), 'blue', [0, 1.08, 0]));
  p.push(part(new THREE.CylinderGeometry(0.30, 0.23, 0.52, 8), 'blue', [0, 1.80, 0]));
  for (const sign of [-1, 1]) {
    p.push(part(new THREE.CylinderGeometry(0.22, 0.31, 0.65, 8), 'blue', [sign * 0.48, 1.65, 0], sign * 0.92));
    p.push(part(new THREE.BoxGeometry(0.18, 0.49, 0.19), 'ink', [sign * 0.17, 0.34, 0]));
    p.push(part(new THREE.BoxGeometry(0.23, 0.12, 0.35), 'ink', [sign * 0.17, 0.06, 0.06]));
  }
  p.push(part(new THREE.CylinderGeometry(0.30, 0.30, 0.08, 8), 'wood', [0, 1.56, 0]));
  p.push(part(new THREE.IcosahedronGeometry(0.34, 1), 'skin', [0, 2.39, 0]));
  p.push(part(new THREE.IcosahedronGeometry(0.14, 0), 'ink', [0, 2.76, -0.04]));
  return merge(p, 'Pilot:Cultivator');
}

export function createTreePilot() {
  const p = [part(new THREE.CylinderGeometry(0.055, 0.09, 0.85, 5), 'wood', [0, 0.425, 0])];
  for (const [x, y, z, radius] of [[-0.22, 0.92, 0, 0.40], [0.24, 1.02, 0.07, 0.37], [0, 1.23, -0.10, 0.34]]) {
    p.push(part(new THREE.IcosahedronGeometry(radius, 0), 'cyan', [x, y, z]));
  }
  return merge(p, 'Pilot:Tree');
}

export function createBuildingBodyPilot() {
  // Four walls, door and stone plinth share one instanced batch.
  const p = [part(new THREE.BoxGeometry(1.06, 0.08, 1.06), 'earth', [0, 0.04, 0])];
  for (const sign of [-1, 1]) {
    p.push(part(new THREE.BoxGeometry(1, 0.92, 0.06), 'paper', [0, 0.54, sign * 0.47]));
    p.push(part(new THREE.BoxGeometry(0.06, 0.92, 0.88), 'paper', [sign * 0.47, 0.54, 0]));
  }
  p.push(part(new THREE.BoxGeometry(0.22, 0.56, 0.025), 'wood', [0, 0.36, 0.51]));
  return merge(p, 'Pilot:BuildingBody');
}

export function createBuildingRoofPilot() {
  // A plain ink gable, without tiles, beams or ornamental eaves.
  const vertices = [[-0.58, 0, -0.58], [0.58, 0, -0.58], [0, 1, -0.58],
    [-0.58, 0, 0.58], [0.58, 0, 0.58], [0, 1, 0.58]];
  const faces = [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(faces.flatMap(i => vertices[i]), 3));
  g.computeVertexNormals();
  return merge([part(g, 'ink')], 'Pilot:BuildingRoof');
}
