// 水墨沙盒 · 3D 选中提示（Render3D M1-D2）
//
// 3D 模式下点一个格子，在**地表稍上方**落一个轻量选中环——比 M0 的弱反馈清楚得多。
//
// ⚠️ 它是**纯表现**：
//   · 按 `surfaceElevation()` **贴地**（相机旋转 / 地形雕刻后位置都正确）；
//   · **不写世界状态**、**不进存档**（`Sandbox` 那边也不把它塞进任何持久字段）；
//   · 不是大型发光 UI——只是一个环。

import * as THREE from 'three';
import { surfaceElevation } from './terrain/VisualElevation.js';
import { INK } from '../core/config.js';

export class SelectionMarker {
  constructor(coordinates) {
    this.coordinates = coordinates;
    this.cell = null;
    this.geometry = new THREE.RingGeometry(0.6, 0.86, 24);
    this.geometry.rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      color: INK.cinnabar, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 6;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'SelectionMarker';
  }

  /** 选中一个世界格（`null` / 非法坐标 = 取消选中）。 */
  setCell(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) { this.cell = null; this.mesh.visible = false; return; }
    this.cell = { x, y };
    this.mesh.visible = true;
  }

  clear() { this.setCell(null, null); }

  /** 每帧跟随地形（雕刻 / 读档换世界后高度立刻正确）。 */
  update(world) {
    if (!this.cell || !world) { this.mesh.visible = false; return; }
    const { x, y } = this.cell;
    const p = this.coordinates.worldToRender(x, y, 0);
    this.mesh.position.set(p.x, surfaceElevation(world, x, y) + 0.18, p.z);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
