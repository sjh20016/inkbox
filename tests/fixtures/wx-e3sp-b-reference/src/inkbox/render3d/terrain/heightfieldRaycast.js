import * as THREE from 'three';

// P1：规则格网地形的射线求交。
//
// three 的 Mesh.raycast 会把 512×320 地形的 32.6 万个三角形逐个求交（单次约 25–30 ms），
// 而地形 quad 的三角形一定落在它自己的 XZ 方格内 ⇒ 只需测试射线 XZ 投影扫过的方格。
// 本函数保持 Mesh.raycast 的全部语义：同一份 CPU position / index（含视界遮罩与动态对角线）、
// 同样的包围球 / 包围盒预检、material.side、near/far、交点字段；命中按索引顺序推入，
// 与逐三角形遍历在 Raycaster 稳定排序后的结果一致。格网不规则或有 morph / 多材质时回退原实现。

const _inverse = new THREE.Matrix4(), _ray = new THREE.Ray(), _sphere = new THREE.Sphere(), _sphereHit = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _local = new THREE.Vector3();
const EPS = 1e-4;

/** 读出 position 的规则网格参数；不规则返回 null（调用方回退 three 原实现）。 */
function gridFrame(position, w, h) {
  const p = position.array, at = (i, k) => p[i * 3 + k];
  if (!(w >= 2 && h >= 2) || position.count !== w * h || position.itemSize !== 3) return null;
  const x0 = at(0, 0), z0 = at(0, 2), dx = at(1, 0) - x0, dz = at(w, 2) - z0;
  if (!(dx !== 0 && dz !== 0) || at(1, 2) !== z0 || at(w, 0) !== x0) return null;
  const last = w * h - 1;
  if (Math.abs(at(last, 0) - (x0 + (w - 1) * dx)) > 1e-4 * Math.abs(dx) || Math.abs(at(last, 2) - (z0 + (h - 1) * dz)) > 1e-4 * Math.abs(dz)) return null;
  return { x0, z0, dx, dz };
}

/**
 * @param {import('./TerrainMesh.js').TerrainMesh} terrain
 * @returns {boolean} false ⇒ 调用方应走 three 原实现
 */
export function raycastTerrain(terrain, raycaster, intersects) {
  const mesh = terrain.mesh, geometry = mesh.geometry, material = mesh.material, world = terrain.world;
  if (material === undefined) return true;
  if (Array.isArray(material) || geometry.morphAttributes.position || !geometry.index || geometry.drawRange.start !== 0) return false;
  const position = geometry.attributes.position, frame = gridFrame(position, world.w, world.h);
  if (!frame) return false;
  const index = geometry.index.array, quadW = world.w - 1, quadH = world.h - 1;
  const end = Math.min(geometry.index.count, geometry.drawRange.count);
  const full = end === quadW * quadH * 6;
  const region = terrain.regionGeometry, inside = terrain.regionInside;
  // 遮罩时索引被压缩：quad 的 6 个索引位置 = 它在保留 quad 中的行优先序号 × 6。
  let slots = null;
  if (!full) {
    if (!region || region.allInside || typeof region.isInsideQuad !== 'function') return false;
    slots = terrain.maskSlots?.region === region && terrain.maskSlots.inside === inside ? terrain.maskSlots.map : null;
    if (!slots) {
      slots = new Int32Array(quadW * quadH).fill(-1); let n = 0;
      for (let y = 0; y < quadH; y++) for (let x = 0; x < quadW; x++) if (region.isInsideQuad(x, y) === inside) slots[y * quadW + x] = 6 * n++;
      if (n * 6 !== end) return false;
      terrain.maskSlots = { region, inside, map: slots };
    }
  }

  // 与 Mesh.raycast 相同的世界空间包围球与局部包围盒预检。
  if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
  _sphere.copy(geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
  _ray.copy(raycaster.ray).recast(raycaster.near);
  if (_sphere.containsPoint(_ray.origin) === false) {
    if (_ray.intersectSphere(_sphere, _sphereHit) === null) return true;
    if (_ray.origin.distanceToSquared(_sphereHit) > (raycaster.far - raycaster.near) ** 2) return true;
  }
  _inverse.copy(mesh.matrixWorld).invert();
  _ray.copy(raycaster.ray).applyMatrix4(_inverse);
  if (geometry.boundingBox !== null && _ray.intersectsBox(geometry.boundingBox) === false) return true;

  // 射线投影到 quad 坐标：u = (X - x0) / dx，v = (Z - z0) / dz；quad (i, j) 占 [i, i+1] × [j, j+1]。
  const o = _ray.origin, d = _ray.direction;
  const u0 = (o.x - frame.x0) / frame.dx, du = d.x / frame.dx, v0 = (o.z - frame.z0) / frame.dz, dv = d.z / frame.dz;
  // 只取 t ≥ 0（Ray.intersectTriangle 不返回原点之后的负 t）并裁到格网矩形。
  let t0 = 0, t1 = Infinity;
  const clip = (p0, dp, lo, hi) => {
    if (Math.abs(dp) < 1e-12) return p0 >= lo && p0 <= hi;
    let a = (lo - p0) / dp, b = (hi - p0) / dp; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); return t0 <= t1;
  };
  if (!clip(u0, du, -EPS, quadW + EPS) || !clip(v0, dv, -EPS, quadH + EPS)) return true;
  // 两个分量都近乎为零（竖直射线）：XZ 投影在可达 t 内的漂移远小于 EPS，按单点处理。
  if (!Number.isFinite(t1)) t1 = t0;

  const uv = geometry.attributes.uv, uv1 = geometry.attributes.uv1, normal = geometry.attributes.normal;
  const side = material.side, hits = [];
  const test = (slot) => {
    for (let k = slot; k < slot + 6; k += 3) {
      const a = index[k], b = index[k + 1], c = index[k + 2];
      _a.fromBufferAttribute(position, a); _b.fromBufferAttribute(position, b); _c.fromBufferAttribute(position, c);
      const hit = side === THREE.BackSide ? _ray.intersectTriangle(_c, _b, _a, true, _local)
        : _ray.intersectTriangle(_a, _b, _c, side === THREE.FrontSide, _local);
      if (hit === null) continue;
      const point = _local.clone().applyMatrix4(mesh.matrixWorld);
      const distance = raycaster.ray.origin.distanceTo(point);
      if (distance < raycaster.near || distance > raycaster.far) continue;
      const barycoord = new THREE.Vector3();
      THREE.Triangle.getBarycoord(_local, _a, _b, _c, barycoord);
      const intersection = { distance, point, object: mesh };
      if (uv) intersection.uv = THREE.Triangle.getInterpolatedAttribute(uv, a, b, c, barycoord, new THREE.Vector2());
      if (uv1) intersection.uv1 = THREE.Triangle.getInterpolatedAttribute(uv1, a, b, c, barycoord, new THREE.Vector2());
      if (normal) {
        intersection.normal = THREE.Triangle.getInterpolatedAttribute(normal, a, b, c, barycoord, new THREE.Vector3());
        if (intersection.normal.dot(_ray.direction) > 0) intersection.normal.multiplyScalar(-1);
      }
      const face = { a, b, c, normal: new THREE.Vector3(), materialIndex: 0 };
      THREE.Triangle.getNormal(_a, _b, _c, face.normal);
      intersection.face = face; intersection.barycoord = barycoord; intersection.faceIndex = Math.floor(k / 3);
      hits.push(intersection);
    }
  };
  // 按 quad 行扫描：每行求射线在该行带内的 t 区间，再取覆盖的 u 区间（两侧各放宽 EPS，保守光栅化）。
  const rowA = Math.max(0, Math.floor(Math.min(v0 + dv * t0, v0 + dv * t1) - EPS));
  const rowB = Math.min(quadH - 1, Math.floor(Math.max(v0 + dv * t0, v0 + dv * t1) + EPS));
  for (let j = rowA; j <= rowB; j++) {
    let ta = t0, tb = t1;
    if (Math.abs(dv) >= 1e-12) {
      let a = (j - EPS - v0) / dv, b = (j + 1 + EPS - v0) / dv; if (a > b) [a, b] = [b, a];
      ta = Math.max(ta, a); tb = Math.min(tb, b); if (ta > tb) continue;
    }
    const ua = u0 + du * ta, ub = u0 + du * tb;
    const i0 = Math.max(0, Math.floor(Math.min(ua, ub) - EPS)), i1 = Math.min(quadW - 1, Math.floor(Math.max(ua, ub) + EPS));
    for (let i = i0; i <= i1; i++) {
      const q = j * quadW + i, slot = slots ? slots[q] : q * 6;
      if (slot >= 0 && slot < end) test(slot);
    }
  }
  // 与逐三角形遍历相同的推入顺序（索引顺序）⇒ 稳定排序后的同距命中次序也一致。
  hits.sort((x, y) => x.faceIndex - y.faceIndex);
  for (const hit of hits) intersects.push(hit);
  return true;
}
