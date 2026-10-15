import * as THREE from 'three';
import { PILOT_PALETTE } from '../art/PilotAssets.js';

function coloredGeometry(triangles, name, center) {
  const positions = [], colors = [], normals = [];
  for (const [aa, bb, cc, pigment] of triangles) {
    let a = aa, b = bb, c = cc;
    const cx = (a[0] + b[0] + c[0]) / 3 - center[0];
    const cy = (a[1] + b[1] + c[1]) / 3 - center[1];
    const cz = (a[2] + b[2] + c[2]) / 3 - center[2];
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
    const outward = (aby * acz - abz * acy) * cx + (abz * acx - abx * acz) * cy + (abx * acy - aby * acx) * cz;
    if (outward < -1e-8) [b, c] = [c, b];
    const color = new THREE.Color(PILOT_PALETTE[pigment]);
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), vc = new THREE.Vector3(...c);
    const normal = new THREE.Vector3().subVectors(vb, va).cross(new THREE.Vector3().subVectors(vc, va)).normalize();
    for (const v of [va, vb, vc]) {
      positions.push(v.x, v.y, v.z); colors.push(color.r, color.g, color.b);
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.name = name; geometry.userData.triangles = triangles.length;
  return geometry;
}

/** LOD1 is 12 wall triangles + 8 gable triangles; LOD2 is an 8-triangle ink roof mass. */
export function createBuildingLODBatches() {
  const lod1 = [];
  const addQuad = (a, b, c, d, color) => lod1.push([a, b, c, color], [a, c, d, color]);
  const x0 = -0.5, x1 = 0.5, y0 = 0, y1 = 0.62, z0 = -0.5, z1 = 0.5;
  addQuad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], 'paper');
  addQuad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], 'paper');
  addQuad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], 'paper');
  addQuad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], 'paper');
  addQuad([x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], 'earth');
  addQuad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], 'earth');

  const frontL = [x0 - 0.06, y1, z0 - 0.06], frontR = [x1 + 0.06, y1, z0 - 0.06];
  const backL = [x0 - 0.06, y1, z1 + 0.06], backR = [x1 + 0.06, y1, z1 + 0.06];
  const frontTip = [0, 1, z0 - 0.06], backTip = [0, 1, z1 + 0.06];
  lod1.push([frontL, frontR, frontTip, 'ink'], [backR, backL, backTip, 'ink']);
  addQuad(frontL, frontTip, backTip, backL, 'ink');
  addQuad(frontTip, frontR, backR, backTip, 'ink');
  addQuad(frontL, backL, backR, frontR, 'ink');

  const lod2 = [];
  const leftFront = [-0.5, 0, -0.5], rightFront = [0.5, 0, -0.5], topFront = [0, 1, -0.5];
  const leftBack = [-0.5, 0, 0.5], rightBack = [0.5, 0, 0.5], topBack = [0, 1, 0.5];
  lod2.push([leftFront, rightFront, topFront, 'ink'], [rightBack, leftBack, topBack, 'ink']);
  lod2.push([leftFront, topFront, topBack, 'ink'], [leftFront, topBack, leftBack, 'ink']);
  lod2.push([topFront, rightFront, rightBack, 'ink'], [topFront, rightBack, topBack, 'ink']);
  lod2.push([leftFront, leftBack, rightBack, 'ink'], [leftFront, rightBack, rightFront, 'ink']);

  return [coloredGeometry(lod1, 'Pilot:BuildingLOD1', [0, 0.5, 0]),
    coloredGeometry(lod2, 'Pilot:BuildingLOD2', [0, 0.35, 0])];
}

/** A compact 12-triangle village mass: four wall quads and two roof planes. */
export function createSettlementClusterGeometry() {
  const triangles = [];
  const addQuad = (a, b, c, d, pigment) => {
    triangles.push([a, b, c, pigment], [a, c, d, pigment]);
  };
  const x0 = -0.5, x1 = 0.5, y0 = 0, eave = 0.58, peak = 0.94, z0 = -0.5, z1 = 0.5;
  addQuad([x0, y0, z0], [x1, y0, z0], [x1, eave, z0], [x0, eave, z0], 'earth');
  addQuad([x1, y0, z1], [x0, y0, z1], [x0, eave, z1], [x1, eave, z1], 'earth');
  addQuad([x0, y0, z1], [x0, y0, z0], [x0, eave, z0], [x0, eave, z1], 'paper');
  addQuad([x1, y0, z0], [x1, y0, z1], [x1, eave, z1], [x1, eave, z0], 'paper');
  addQuad([x0, eave, z0], [0, peak, z0], [0, peak, z1], [x0, eave, z1], 'ink');
  addQuad([0, peak, z0], [x1, eave, z0], [x1, eave, z1], [0, peak, z1], 'ink');
  return coloredGeometry(triangles, 'Pilot:SettlementCluster12', [0, 0.45, 0]);
}
