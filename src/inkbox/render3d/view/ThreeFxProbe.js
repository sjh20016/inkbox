import * as THREE from 'three';
import { RENDER_ORDER } from '../shared/RenderOrder.js';
import { RiftNarrativeFx, isRiftNarrativeItem } from './RiftNarrativeFx.js';

const MAX_MARKERS = 32;
const PLANE_COLOR = Object.freeze({ mortal: 0xa8493c, upper: 0xd6b664, nether: 0x7776a9 });

/**
 * Small debug rings for the already consumed PresentationStage events.
 *
 * ⚠️ 唯一消费者仍是 `PresentationStage`（S8）：这里只读 `snapshotPlane()`，
 *    绝不 `drainRuntimeEvents()`。
 * ⚠️ 贴地高度走 `stage.elevation.at()`（M2-B §8），不再自己 import 高程函数。
 */
export class ThreeFxProbe {
  constructor({ plane, coordinates, elevation }) {
    this.plane = plane;
    this.coordinates = coordinates;
    this.elevation = elevation;
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
    this.narrative = new RiftNarrativeFx({ plane, coordinates, elevation });
    this.root.add(this.narrative.mesh);
    this.stats = { ...this.narrative.stats, debugActive: 0 };
  }

  update(presentation, world, { enabled = false, region = null, inside = true } = {}) {
    // PresentationStage owns the event queue. This probe only reads its snapshot.
    const items = presentation?.snapshotPlane?.(this.plane)?.items ?? [];
    if (enabled) this.narrative.update(items, world, region, inside);
    else this.narrative.clear();
    if (!world || !this.coordinates || !this.elevation || !Array.isArray(items)) {
      this.mesh.count = 0;
      this.stats = { ...this.narrative.stats, debugActive: 0 };
      return;
    }
    let count = 0;
    for (const item of items) {
      if (count >= MAX_MARKERS) break;
      if (enabled && isRiftNarrativeItem(item)) continue;
      if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
      const point = this.coordinates.worldToRender(item.x, item.y,
        this.elevation.at(item.x, item.y) + 0.2);
      const life = item.ttl > 0 ? Math.max(0.2, 1 - item.age / item.ttl) : 1;
      this.transform.position.set(point.x, point.y, point.z);
      this.transform.scale.setScalar(life);
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(count++, this.transform.matrix);
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    if (count) this.mesh.instanceMatrix.needsUpdate = true;
    this.stats = { ...this.narrative.stats, debugActive: count };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.narrative.dispose();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.root.remove(this.mesh);
    this.root.removeFromParent();
  }
}
