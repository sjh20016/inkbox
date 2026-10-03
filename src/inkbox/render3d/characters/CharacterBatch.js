import * as THREE from 'three';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

function instancedGeometry(base, capacity) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.name = `${base.name || 'cultivator'}_instances`;
  geometry.setIndex(base.getIndex());
  for (const [name, attribute] of Object.entries(base.attributes)) {
    if (!name.startsWith('skin') && name !== 'instancePaletteIndex') geometry.setAttribute(name, attribute);
  }
  for (const group of base.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.setDrawRange(base.drawRange.start, base.drawRange.count);
  geometry.boundingBox = base.boundingBox;
  geometry.boundingSphere = base.boundingSphere;
  geometry.setAttribute('instancePaletteIndex', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
  return geometry;
}

/** One InstancedMesh per module, with stable pick mapping for every visible part. */
export class CharacterBatch {
  constructor(library, capacity = 256) {
    if (!library || library.disposed) throw new Error('CharacterBatch requires a live CharacterLibrary');
    this.library = library;
    this.capacity = capacity;
    this.group = new THREE.Group();
    this.group.name = 'CultivatorCharacterBatch';
    this.meshes = {};
    this.dummy = new THREE.Object3D();
    this.stats = { characters: 0, moduleInstances: 0, drawCalls: 0, overflow: 0 };
    this.disposed = false;
    for (const [id, module] of library.modules) {
      const mesh = new THREE.InstancedMesh(instancedGeometry(module.geometry, capacity), library.material, capacity);
      mesh.name = `Cultivator:${id}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = RENDER_ORDER.entities;
      mesh.userData.lod = 0;
      mesh.count = 0;
      mesh.visible = false;
      mesh.userData.renderEntities = [];
      this.meshes[id] = mesh;
      this.group.add(mesh);
    }
  }

  /** records: { role, x, y, z, rotation?, scale?, paletteIndex?, source? } */
  write(records) {
    if (this.disposed) return;
    const selected = records || [];
    const counts = Object.fromEntries(Object.keys(this.meshes).map(id => [id, 0]));
    const picks = Object.fromEntries(Object.keys(this.meshes).map(id => [id, []]));
    let overflow = 0;
    let characters = 0;
    for (const record of selected) {
      const config = this.library.resolveAppearance(record.role || 'basic', record);
      const ids = [config.body, config.hair, config.robe, config.weapon, config.back, config.prop, config.tag].filter(Boolean);
      if (counts[config.body] >= this.capacity) { overflow += 1; continue; }
      this.dummy.position.set(record.x || 0, record.y || 0, record.z || 0);
      this.dummy.rotation.set(0, record.rotation || 0, 0);
      this.dummy.scale.setScalar(record.scale || 1);
      this.dummy.updateMatrix();
      for (const id of ids) {
        const mesh = this.meshes[id];
        if (!mesh) throw new Error(`Cultivator mesh ${id} was not loaded`);
        const index = counts[id];
        if (index >= this.capacity) throw new Error(`Cultivator module ${id} exceeds body capacity`);
        mesh.setMatrixAt(index, this.dummy.matrix);
        mesh.geometry.getAttribute('instancePaletteIndex').setX(index, config.paletteIndex);
        picks[id].push(record.source || record);
        counts[id] = index + 1;
      }
      characters += 1;
    }
    let drawCalls = 0, moduleInstances = 0;
    for (const [id, mesh] of Object.entries(this.meshes)) {
      mesh.count = counts[id];
      mesh.boundingBox = null; mesh.boundingSphere = null;
      mesh.visible = mesh.count > 0;
      mesh.userData.renderEntities = picks[id];
      mesh.instanceMatrix.needsUpdate = mesh.visible;
      mesh.geometry.getAttribute('instancePaletteIndex').needsUpdate = mesh.visible;
      moduleInstances += mesh.count;
      if (mesh.visible) drawCalls += 1;
    }
    this.stats = { characters, moduleInstances, drawCalls, overflow };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of Object.values(this.meshes)) {
      mesh.geometry.dispose();
      mesh.dispose();
      mesh.userData.renderEntities = [];
    }
    this.group.clear();
  }
}
