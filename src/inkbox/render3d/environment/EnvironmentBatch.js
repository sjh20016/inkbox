import * as THREE from 'three';

const LOD_COUNT = 3;

/** Fixed-capacity instancing over shared EnvironmentAssetLibrary geometry. */
export class EnvironmentBatch {
  constructor(library, { material, capacity, pickField = 'renderBuildings', assetIds = ['mortal.house.base'], includeHLOD = false } = {}) {
    if (!library || library.disposed) throw new Error('EnvironmentBatch requires a live asset library');
    if (!material?.isMaterial) throw new Error('EnvironmentBatch requires the Stage-owned shared material');
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('EnvironmentBatch capacity must be a positive integer');
    if (typeof pickField !== 'string' || !pickField) throw new Error('EnvironmentBatch requires a picker record field');
    this.library = library;
    this.material = material;
    this.capacity = capacity;
    this.pickField = pickField;
    this.includeHLOD = !!includeHLOD;
    this.assetIds = [...new Set(assetIds)];
    this.group = new THREE.Group();
    this.group.name = 'environment_instance_batch';
    this.meshes = new Map();
    this.disposed = false;
    this._stats = { instances: 0, triangles: 0, drawCalls: 0, overflow: 0, lod: [0, 0, 0] };
    const nodeAssets = new Map();
    for (const assetId of this.assetIds) {
      const asset = library.assetInfo(assetId);
      for (const nodeName of [...asset.lods, ...(includeHLOD && asset.hlod ? [asset.hlod] : [])]) {
        const owners = nodeAssets.get(nodeName) || [];
        owners.push(assetId);
        nodeAssets.set(nodeName, owners);
      }
    }
    for (const [nodeName, owners] of nodeAssets) {
      const geometry = library.geometryFor(owners[0], nodeName);
      for (const assetId of owners.slice(1)) {
        if (library.geometryFor(assetId, nodeName) !== geometry) throw new Error(`Shared environment module ${nodeName} was decoded more than once`);
      }
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = nodeName;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.boundingBox = null;
      mesh.boundingSphere = null;
      mesh.userData[this.pickField] = [];
      mesh.userData.environmentAssetIds = owners;
      mesh.userData.lod = this.library.assetInfo(owners[0]).lods.indexOf(nodeName);
      if (mesh.userData.lod < 0) {
        mesh.userData.lod = 3;
        mesh.userData.renderSettlements = mesh.userData[this.pickField];
      }
      this.meshes.set(nodeName, mesh);
      this.group.add(mesh);
    }
    this._sourceByNode = new Map();
    this._dummy = new THREE.Object3D();
  }

  write(records = []) {
    if (this.disposed) throw new Error('Cannot write to a disposed EnvironmentBatch');
    if (!Array.isArray(records)) throw new TypeError('EnvironmentBatch.write expects an array');
    for (const mesh of this.meshes.values()) {
      mesh.count = 0;
      mesh.visible = false;
      mesh.boundingBox = null;
      mesh.boundingSphere = null;
      mesh.userData[this.pickField].length = 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this._sourceByNode.clear();
    const counts = new Map([...this.meshes.keys()].map(key => [key, 0]));
    let overflow = 0;
    for (const record of records) {
      const asset = this.library.assetInfo(record.assetId);
      const lod = Number(record.lod);
      if (!Number.isInteger(lod) || lod < 0 || lod >= LOD_COUNT && !(lod === 3 && this.includeHLOD && asset.hlod)) throw new Error(`Invalid environment LOD ${record.lod}`);
      const nodeName = lod === 3 ? asset.hlod : asset.lods[lod];
      const mesh = this.meshes.get(nodeName);
      if (!mesh) throw new Error(`EnvironmentBatch was not configured for ${record.assetId}`);
      const index = counts.get(nodeName);
      if (index >= this.capacity) { overflow++; continue; }
      const position = record.position || {};
      const scale = record.scale || {};
      const values = [position.x, position.y, position.z, scale.x, scale.y, scale.z, record.rotationY ?? 0];
      if (!values.every(Number.isFinite) || values.slice(3, 6).some(value => value <= 0)) throw new Error('Environment instance transform must be finite and use positive scales');
      this._dummy.position.set(position.x, position.y, position.z);
      this._dummy.rotation.set(0, record.rotationY ?? 0, 0);
      this._dummy.scale.set(scale.x, scale.y, scale.z);
      this._dummy.updateMatrix();
      mesh.setMatrixAt(index, this._dummy.matrix);
      mesh.userData[this.pickField][index] = record.source ?? null;
      counts.set(nodeName, index + 1);
      const sources = this._sourceByNode.get(nodeName) || [];
      sources.push(record.source ?? null);
      this._sourceByNode.set(nodeName, sources);
    }
    const lod = [0, 0, 0];
    let instances = 0, triangles = 0, drawCalls = 0, hlod = 0;
    for (const [nodeName, mesh] of this.meshes) {
      const count = counts.get(nodeName) || 0;
      mesh.count = count;
      mesh.visible = count > 0;
      mesh.boundingBox = null;
      mesh.boundingSphere = null;
      mesh.instanceMatrix.needsUpdate = true;
      if (!count) continue;
      const module = this.library.modules.get(nodeName);
      instances += count;
      triangles += count * module.triangles;
      drawCalls++;
      if (mesh.userData.lod === 3) hlod += count;
      for (const assetId of mesh.userData.environmentAssetIds) {
        const lodIndex = this.library.assetInfo(assetId).lods.indexOf(nodeName);
        if (lodIndex >= 0) { lod[lodIndex] += count; break; }
      }
    }
    this._stats = { instances, triangles, drawCalls, overflow, lod, ...(this.includeHLOD ? { hlod } : {}) };
    return this.stats;
  }

  get stats() { return { ...this._stats, lod: [...this._stats.lod] }; }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.meshes.values()) {
      this.group.remove(mesh);
      mesh.dispose();
    }
    this.meshes.clear();
    this._sourceByNode.clear();
    this._stats = { instances: 0, triangles: 0, drawCalls: 0, overflow: 0, lod: [0, 0, 0] };
    // Geometry, material and atlas belong to the library/Stage.
  }
}
