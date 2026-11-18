import * as THREE from 'three';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

const MAX_POINTS = 512;

/**
 * M2-B B3 · 拖拽中的 Region 路径预览（§50 / §51）。
 *
 * 它画的是**世界坐标路径**，不是屏幕轨迹：每个采样点先 raycast 凡间地形得到
 * `(x, y)`，再由 `cellToRender` 落到共享格网上、由 `elevation.at()` 贴地。
 * 于是相机怎么转，已经画出来的那段都不会漂（§51 的核心要求）。
 *
 * ⚠️ 它只是**预览**：不持有选区、不进存档、不参与任何判定。
 *    真正的 Region 仍由 `Sandbox.commitSelection(path)` 在 pointerup 时一次成型。
 */
export class DraftPathOverlay {
  constructor({ coordinates }) {
    this.coordinates = coordinates;
    this.positions = new Float32Array(MAX_POINTS * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.LineBasicMaterial({ color: '#4a7a8a', transparent: true, opacity: 0.92, depthTest: false });
    this.mesh = new THREE.Line(this.geometry, this.material);
    this.mesh.name = 'RealmDraftPath';
    this.mesh.renderOrder = RENDER_ORDER.selection;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.count = 0;
  }

  /**
   * @param {Array<[number, number]>|null} path world 格坐标路径
   * @param {object} elevation 凡间 `ElevationField`（贴地）
   */
  setPath(path, elevation) {
    if (!path || path.length < 2 || !elevation) { this.clear(); return; }
    const n = Math.min(path.length, MAX_POINTS);
    for (let i = 0; i < n; i += 1) {
      const [x, y] = path[i];
      const p = this.coordinates.cellToRender(x, y);
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = elevation.at(x, y) + 0.2;
      this.positions[i * 3 + 2] = p.z;
    }
    this.count = n;
    this.geometry.setDrawRange(0, n);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.mesh.visible = true;
  }

  clear() {
    this.count = 0;
    this.geometry.setDrawRange(0, 0);
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
