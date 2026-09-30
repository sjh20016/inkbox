import * as THREE from 'three';
import { surfaceElevation } from '../terrain/VisualElevation.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

const MAX_MARKERS = 32;
const PLANE_COLOR = Object.freeze({ mortal: 0xa8493c, upper: 0xd6b664, nether: 0x7776a9 });

/** Small debug rings for the already consumed PresentationStage events. */
export class ThreeFxProbe {
  constructor({ plane, coordinates }) {
    this.plane = plane;
    this.coordinates = coordinates;
    this.root = new THREE.Group();
    this.group = this.root;
    this.geometry = new THREE.RingGeometry(0.38, 0.55, 24);
    this.geometry.rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      color: PLANE_COLOR[plane] ?? PLANE_COLOR.mortal,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.75,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_MARKERS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RENDER_ORDER.fx;
    this.root.add(this.mesh);
    this.transform = new THREE.Object3D();
  }

  update(presentation, world) {
    // PresentationStage owns the event queue. This probe only reads its snapshot.
    const items = presentation?.snapshotPlane?.(this.plane)?.items ?? [];
    if (!world || !this.coordinates || !Array.isArray(items)) {
      this.mesh.count = 0;
      return;
    }
    let count = 0;
    for (const item of items) {
      if (count >= MAX_MARKERS) break;
      if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
      const point = this.coordinates.worldToRender(item.x, item.y,
        surfaceElevation(world, item.x, item.y) + 0.2);
      const life = item.ttl > 0 ? Math.max(0.2, 1 - item.age / item.ttl) : 1;
      this.transform.position.set(point.x, point.y, point.z);
      this.transform.scale.setScalar(life);
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(count++, this.transform.matrix);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.root.remove(this.mesh);
    this.root.removeFromParent();
  }
}
