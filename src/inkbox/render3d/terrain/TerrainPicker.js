import * as THREE from 'three';

export class TerrainPicker {
  constructor(terrain, coordinates, camera) { this.terrain = terrain; this.coordinates = coordinates; this.camera = camera; this.raycaster = new THREE.Raycaster(); this.timeMs = 0; this.lastRaycastMs = 0; }
  pick(x, y, width, height) {
    const start = performance.now();
    this.camera.updateMatrixWorld(); this.terrain.mesh.updateMatrixWorld();
    const signature = [x, y, width, height, this.terrain.geometry.attributes.position.version, ...this.camera.matrixWorld.elements, ...this.camera.projectionMatrix.elements];
    if (this.signature && signature.every((v, i) => v === this.signature[i])) { this.timeMs = 0; return this.cachedHit; }
    this.signature = signature;
    this.raycaster.setFromCamera(new THREE.Vector2(x / width * 2 - 1, 1 - y / height * 2), this.camera);
    const hit = this.raycaster.intersectObject(this.terrain.mesh, false)[0];
    this.timeMs = performance.now() - start;
    this.lastRaycastMs = this.timeMs;
    this.cachedHit = hit ? { ...this.coordinates.renderPointToCell(hit.point), point: hit.point, world: this.coordinates.renderToWorld(hit.point.x, hit.point.z) } : null;
    return this.cachedHit;
  }
}
