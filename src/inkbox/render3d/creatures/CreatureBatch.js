import { creatureCelUniform } from './CreatureLibrary.js';
import { attachInkOutline, syncInkOutline, disposeInkOutline } from '../shanhai/InkOutline.js';
// 水墨沙盒 · 山海异兽实例批处理（Render3D · A1 众生入画）
//
// 每物种一个 InstancedMesh：同一个静态几何（部件已按 rest 合并）+ 同一张
// 16×1 调色板材质。一次分配容量，`write(records)` 只改 instanceMatrix。
//
// ⚠️ 拾取约定与 EntityLayer / PlanePicker 一致：
//    `mesh.userData.renderEntities[instanceId]` 必须能映射回世界记录（含 id/x/y）。
// ⚠️ 本类**不拥有** library 的几何/材质/贴图，`dispose()` 只释放实例包装。

import * as THREE from 'three';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

/** 每物种默认实例容量：世界试装 4 种 × 1024 阵 ≈ 256 KB 一次性分配。 */
export const CREATURE_BATCH_CAPACITY = 1024;

export class CreatureBatch {
  constructor(library, { capacity = CREATURE_BATCH_CAPACITY } = {}) {
    if (!library || library.disposed) throw new Error('CreatureBatch requires a live CreatureLibrary');
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error('CreatureBatch capacity must be a positive integer');
    this.library = library;
    this.capacity = capacity;
    this.group = new THREE.Group();
    this.group.name = 'CreatureBatch';
    this.meshes = new Map();
    this.dummy = new THREE.Object3D();
    this.stats = { creatures: 0, instances: 0, drawCalls: 0, triangles: 0, overflow: 0 };
    this.bySpecies = {};
    this.disposed = false;
    for (const [id, species] of library.species) {
      this.addSpecies(id, species);
    }
  }

  addSpecies(id, species = this.library.species.get(id)) {
      if (this.disposed || this.meshes.has(id) || !species) return false;
      const mesh = new THREE.InstancedMesh(species.geometry, this.library.material, this.capacity);
      mesh.name = `Creature:${id}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // 实例铺在整个世界，单几何的默认包围球会误剔除。
      mesh.frustumCulled = false;
      mesh.renderOrder = RENDER_ORDER.entities;
      mesh.count = 0;
      mesh.visible = false;
      mesh.userData.lod = 0;
      mesh.userData.species = id;
      mesh.userData.renderEntities = [];
      this.meshes.set(id, mesh);
      this.group.add(mesh);
      mesh.add(attachInkOutline(mesh, { ratio: 0.028 }));
      syncInkOutline(mesh, this.inkOutline);
      this.speciesIds = Object.freeze([...this.meshes.keys()]);
      return true;
  }

  /** V1 · 山海入画：墨线外轮廓开关（纯表现，不改实例 / 拾取映射）。 */
  setInkOutline(enabled) { this.inkOutline = !!enabled; creatureCelUniform.value = this.inkOutline ? 1 : 0; for (const mesh of this.meshes.values()) syncInkOutline(mesh, this.inkOutline); }

  hasSpecies(id) { return this.meshes.has(id); }

  capacityFor(id) { return this.meshes.has(id) ? this.capacity : 0; }

  /**
   * @param {Array<{species:string,x:number,y:number,z:number,rotationY?:number,scale?:number|{x:number,y:number,z:number},source?:object}>} records
   */
  write(records) {
    if (this.disposed) return this.stats;
    const selected = records || [];
    const counts = new Map(this.speciesIds.map(id => [id, 0]));
    const picks = new Map(this.speciesIds.map(id => [id, []]));
    let overflow = 0;
    let creatures = 0;
    for (const record of selected) {
      const mesh = this.meshes.get(record?.species);
      if (!mesh) { overflow += 1; continue; }
      const index = counts.get(record.species);
      if (index >= this.capacity) { overflow += 1; continue; }
      this.dummy.position.set(record.x || 0, record.y || 0, record.z || 0);
      this.dummy.rotation.set(0, Number.isFinite(record.rotationY) ? record.rotationY : 0, 0);
      const scale = record.scale ?? 1;
      if (typeof scale === 'number') this.dummy.scale.setScalar(scale);
      else this.dummy.scale.set(scale.x ?? 1, scale.y ?? 1, scale.z ?? 1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(index, this.dummy.matrix);
      picks.get(record.species).push(record.source || record);
      counts.set(record.species, index + 1);
      creatures += 1;
    }
    let instances = 0, drawCalls = 0, triangles = 0;
    const bySpecies = {};
    for (const [id, mesh] of this.meshes) {
      const count = counts.get(id);
      const species = this.library.species.get(id);
      mesh.count = count;
      mesh.boundingBox = null;
      mesh.boundingSphere = null;
      mesh.visible = count > 0;
      mesh.userData.renderEntities = picks.get(id);
      if (count > 0) mesh.instanceMatrix.needsUpdate = true;
      bySpecies[id] = count;
      instances += count;
      triangles += count * species.triangles;
      if (mesh.visible) drawCalls += 1;
      syncInkOutline(mesh, this.inkOutline);
    }
    this.bySpecies = bySpecies;
    this.stats = { creatures, instances, drawCalls, triangles, overflow };
    return this.stats;
  }

  clear() { return this.write([]); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.meshes.values()) {
      disposeInkOutline(mesh);
      mesh.dispose();
      mesh.userData.renderEntities = [];
      mesh.removeFromParent();
    }
    this.meshes.clear();
    this.group.clear();
    this.group.removeFromParent();
    this.bySpecies = {};
    this.stats = { creatures: 0, instances: 0, drawCalls: 0, triangles: 0, overflow: 0 };
  }
}
