import * as THREE from 'three';
import { deriveVegetation } from './deriveVegetation.js';
import { surfaceElevation } from '../terrain/VisualElevation.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

function pixelTree() {
  const data = new Uint8Array(16 * 24 * 4);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) {
    const trunk = y < 8 && x >= 7 && x <= 8;
    const width = y >= 6 ? Math.max(0, 7 - Math.floor((y - 6) / 3)) : -1;
    const leaf = y >= 6 && Math.abs(x - 7.5) < width;
    if (trunk || leaf) {
      const color = trunk ? [100, 80, 54] : (x + y) % 4 === 0 ? [111, 136, 86] : x < 8 ? [62, 88, 64] : [81, 108, 74];
      data.set([...color, 255], (y * 16 + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, 16, 24);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  return texture;
}

export class VegetationLayer {
  constructor(world, coordinates) {
    this.world = world; this.coordinates = coordinates;
    this.texture = pixelTree();
    this.geometry = new THREE.PlaneGeometry(1, 1.5); this.geometry.translate(0, 0.75, 0);
    this.material = new THREE.MeshLambertMaterial({ map: this.texture, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, 20000);
    this.mesh.renderOrder = RENDER_ORDER.vegetation;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.update();
  }
  update() {
    this.trees = deriveVegetation(this.world);
    const dummy = new THREE.Object3D();
    let j = 0;
    for (const tree of this.trees) {
      const p = this.coordinates.worldToRender(tree.x, tree.y, surfaceElevation(this.world, tree.x, tree.y));
      dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(tree.size);
      for (let side = 0; side < 2; side++) {
        dummy.rotation.y = tree.rotation + side * Math.PI / 2;
        dummy.updateMatrix(); this.mesh.setMatrixAt(j++, dummy.matrix);
      }
    }
    this.mesh.count = j; this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.dispose(); this.geometry.dispose(); this.material.dispose(); this.texture.dispose(); }
}
