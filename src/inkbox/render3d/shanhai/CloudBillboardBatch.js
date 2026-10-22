import * as THREE from 'three';

/**
 * A single transparent draw for a group of camera-facing cloud quads.
 * Quads are sorted back-to-front inside the geometry because Three.js can
 * only sort transparent objects, not the individual faces in one object.
 */
export class CloudBillboardBatch {
  constructor({ texture, renderOrder = -2 }) {
    this.records = [];
    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.FrontSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'ShanhaiCloudBillboardBatch';
    this.mesh.raycast = () => {};
    this.mesh.userData.presentationOnly = true;
    this.mesh.userData.decorative = 'shanhai';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._viewPosition = new THREE.Vector3();
    this._sort = [];
  }

  add({ x, y, z, width, height, color, opacity = 1, phase = 0 }) {
    const tint = new THREE.Color(color);
    const record = { x, y, z, width, height, r: tint.r, g: tint.g, b: tint.b, opacity, phase };
    this.records.push(record);
    this._sort.push({ record, x: 0, y: 0, z: 0, depth: 0 });
  }

  _ensureBuffers() {
    const count = this.records.length;
    const vertexCount = count * 4;
    const IndexArray = vertexCount > 65535 ? Uint32Array : Uint16Array;
    const positions = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const colors = new THREE.BufferAttribute(new Float32Array(vertexCount * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new THREE.BufferAttribute(new IndexArray(count * 6), 1).setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      const v = i * 4, ix = i * 6;
      uvs.set([0, 0, 1, 0, 1, 1, 0, 1], v * 2);
      indices.setX(ix, v); indices.setX(ix + 1, v + 1); indices.setX(ix + 2, v + 2);
      indices.setX(ix + 3, v); indices.setX(ix + 4, v + 2); indices.setX(ix + 5, v + 3);
    }
    this.geometry.setAttribute('position', positions);
    this.geometry.setAttribute('color', colors);
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(indices);
  }

  update(time, camera, fade = 1) {
    const count = this.records.length;
    if (!count) return;
    if (this.geometry.getAttribute('position')?.count !== count * 4) this._ensureBuffers();
    camera.updateMatrixWorld();
    this._right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this._up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    this._sort.length = count;
    for (let i = 0; i < count; i++) {
      const record = this.records[i];
      const phase = record.phase;
      const x = record.x + Math.sin(time * 0.07 + phase) * 3;
      const y = record.y + Math.sin(time * 0.11 + phase) * 0.8;
      const z = record.z + Math.cos(time * 0.05 + phase) * 3;
      this._viewPosition.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      const item = this._sort[i];
      item.record = record; item.x = x; item.y = y; item.z = z; item.depth = this._viewPosition.z;
    }
    // More negative camera-space z is farther away; alpha blending needs far first.
    this._sort.sort((a, b) => a.depth - b.depth);

    const positions = this.geometry.getAttribute('position');
    const colors = this.geometry.getAttribute('color');
    for (let sorted = 0; sorted < count; sorted++) {
      const item = this._sort[sorted], record = item.record;
      const vertex = sorted * 4;
      const rx = this._right.x * record.width * 0.5, ry = this._right.y * record.width * 0.5, rz = this._right.z * record.width * 0.5;
      const ux = this._up.x * record.height * 0.5, uy = this._up.y * record.height * 0.5, uz = this._up.z * record.height * 0.5;
      const alpha = record.opacity * fade;
      positions.setXYZ(vertex, item.x - rx - ux, item.y - ry - uy, item.z - rz - uz);
      positions.setXYZ(vertex + 1, item.x + rx - ux, item.y + ry - uy, item.z + rz - uz);
      positions.setXYZ(vertex + 2, item.x + rx + ux, item.y + ry + uy, item.z + rz + uz);
      positions.setXYZ(vertex + 3, item.x - rx + ux, item.y - ry + uy, item.z - rz + uz);
      for (let corner = 0; corner < 4; corner++) colors.setXYZW(vertex + corner, record.r, record.g, record.b, alpha);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.records.length = 0;
  }
}
