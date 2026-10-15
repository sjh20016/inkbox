import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTER_ROLES } from './characterAppearance.js';

const DEFAULT_GLB = new URL('../../../../assets/characters/cultivator/mesh/cultivator_library.glb', import.meta.url).href;
const DEFAULT_MANIFEST = new URL('../../../../assets/characters/cultivator/data/cultivator_manifest.json', import.meta.url).href;
const ROLE_MODULE_SLOTS = Object.freeze({
  basic: ['weapon', 'back', 'prop', 'tag'],
  sect_disciple: ['weapon', 'tag'],
  wanderer: ['back', 'prop'],
  elder: ['weapon', 'robe'],
  ghost: ['prop', 'tag', 'robe'],
  alchemist: ['prop', 'tag'],
});

function geometryAtRoot(node) {
  const geometry = node.geometry.clone();
  node.updateWorldMatrix(true, false);
  geometry.applyMatrix4(node.matrixWorld);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function paletteMaterial(source, palette) {
  const material = new THREE.MeshLambertMaterial({
    name: 'cultivator_shared_palette', color: '#ffffff', map: source.map,
    flatShading: true, side: THREE.FrontSide, transparent: false, depthWrite: true,
  });
  // Only the reserved robe swatch changes per instance. Skin, hair, eyes and
  // props retain their atlas UVs; a global instance tint would dye the face.
  const count = palette?.count || 12;
  const factionSlot = palette?.factionSlot ?? 5;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nattribute float instancePaletteIndex;\nvarying float vInstancePaletteIndex;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvInstancePaletteIndex = instancePaletteIndex;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nvarying float vInstancePaletteIndex;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec2 paletteUv = vMapUv;
        if (abs(paletteUv.x - ${(factionSlot + 0.5) / count}) < ${0.46 / count}
            && vInstancePaletteIndex >= 0.0) {
          paletteUv.x = (vInstancePaletteIndex + 0.5) / ${count}.0;
        }
        vec4 sampledDiffuseColor = texture2D(map, paletteUv);
        diffuseColor *= sampledDiffuseColor;
      #endif`);
  };
  material.customProgramCacheKey = () => `cultivator_palette_${count}_${factionSlot}`;
  material.needsUpdate = true;
  return material;
}

/** Shared CPU geometry, one atlas texture and one material for all batches. */
export class CharacterLibrary {
  constructor(gltf, manifest) {
    if (!manifest || typeof manifest.modules !== 'object' || typeof manifest.roles !== 'object') {
      throw new Error('Cultivator manifest requires modules and roles');
    }
    this.manifest = manifest;
    this.modules = new Map();
    const paletteCount = manifest.palette?.count;
    if (!Number.isInteger(paletteCount) || paletteCount < 8 || paletteCount > 12) {
      throw new Error('Cultivator palette must contain 8–12 colours');
    }
    gltf.scene.updateMatrixWorld(true);
    let sourceMaterial = null;
    const usedNodes = new Set();
    for (const [id, info] of Object.entries(manifest.modules)) {
      const node = gltf.scene.getObjectByName(info.node || id);
      if (!node?.isMesh) throw new Error(`Cultivator GLB missing mesh node: ${info.node || id}`);
      if (usedNodes.has(node)) throw new Error(`Cultivator GLB node reused by multiple modules: ${node.name}`);
      usedNodes.add(node);
      if (node.geometry.getAttribute('skinIndex') && !node.isSkinnedMesh) {
        throw new Error(`Cultivator module ${id} has skin attributes without a skeleton`);
      }
      if (Array.isArray(node.material)) throw new Error(`Cultivator module ${id} must have one material`);
      sourceMaterial ||= node.material;
      if (node.material !== sourceMaterial) throw new Error('Cultivator modules must share one GLB material');
      this.modules.set(id, { ...info, geometry: geometryAtRoot(node) });
    }
    if (!sourceMaterial?.map) throw new Error('Cultivator GLB requires a shared palette map');
    this.material = paletteMaterial(sourceMaterial, manifest.palette);
    this.texture = this.material.map;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    this.rig = manifest.rig?.node ? gltf.scene.getObjectByName(manifest.rig.node) : null;
    this.animations = gltf.animations || [];
    this.roles = manifest.roles;
    for (const role of manifest.phase === 'material' ? ['basic'] : CHARACTER_ROLES) {
      if (!this.roles[role]) throw new Error(`Cultivator manifest missing role ${role}`);
      for (const id of this.moduleIds(role)) {
        if (!this.modules.has(id)) throw new Error(`Cultivator role ${role} references unknown module ${id}`);
      }
    }
    this.disposed = false;
    this.sourceGeometries = new Set();
    this.sourceMaterials = new Set();
    gltf.scene.traverse(node => {
      if (!node.isMesh) return;
      this.sourceGeometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (material) this.sourceMaterials.add(material);
      }
    });
  }

  moduleIds(role, overrides = {}) {
    const config = this.resolveAppearance(role, overrides);
    return [config.body, config.hair, config.robe, config.weapon, config.back, config.prop, config.tag].filter(Boolean);
  }

  /** Validate a compact, data-driven outfit; role, x/y/z and source are not module overrides. */
  resolveAppearance(role, overrides = {}) {
    if (!CHARACTER_ROLES.includes(role)) throw new Error(`Unknown cultivator role: ${role}`);
    if (overrides.modules != null || overrides.attachments != null) {
      throw new Error('Cultivator modules must use named hair/weapon/back/prop/tag slots');
    }
    const baseBody = this.roles.basic?.body;
    const preset = this.roles[role] || this.roles.basic;
    const config = {};
    for (const slot of ['body', 'hair', 'robe', 'weapon', 'back', 'prop', 'tag']) {
      config[slot] = Object.hasOwn(overrides, slot) ? overrides[slot] : preset[slot];
      if (config[slot] == null) continue;
      if (slot === 'body' && config[slot] !== baseBody) {
        throw new Error('All cultivator roles must share the basic body');
      }
      const module = this.manifest.modules[config[slot]];
      if (!module || module.slot !== slot) {
        throw new Error(`Cultivator ${slot} must reference one known ${slot} module: ${config[slot]}`);
      }
    }
    if (!config.body || !config.hair) throw new Error('Cultivator body and one hair are required');
    const allowed = ROLE_MODULE_SLOTS[role];
    if (preset.allowedSlots && (!Array.isArray(preset.allowedSlots)
      || preset.allowedSlots.some(slot => !allowed.includes(slot)))) {
      throw new Error(`Cultivator ${role} manifest allowedSlots exceeds first-family limits`);
    }
    for (const slot of ['robe', 'weapon', 'back', 'prop', 'tag']) {
      if (config[slot] && (!allowed.includes(slot)
        || (preset.allowedSlots && !preset.allowedSlots.includes(slot)))) {
        throw new Error(`Cultivator ${role} does not allow ${slot}`);
      }
    }
    if ([config.weapon, config.prop, config.tag].filter(Boolean).length > 2) {
      throw new Error('Cultivator weapon, prop and tag may occupy at most two slots');
    }
    if (['alchemist', 'ghost'].includes(role) && config.prop && config.tag) {
      throw new Error(`Cultivator ${role} prop and tag are alternatives`);
    }
    if (config.back && (config.weapon || config.tag)) {
      throw new Error('Cultivator back pack cannot be stacked with weapon or tag');
    }
    const paletteIndex = Object.hasOwn(overrides, 'paletteIndex') && overrides.paletteIndex != null
      ? overrides.paletteIndex : preset.paletteIndex;
    if (!Number.isInteger(paletteIndex) || paletteIndex < 0 || paletteIndex >= this.manifest.palette.count) {
      throw new Error(`Cultivator ${role} requires a paletteIndex in atlas range`);
    }
    config.paletteIndex = paletteIndex;
    return config;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const module of this.modules.values()) module.geometry.dispose();
    this.material.dispose();
    for (const geometry of this.sourceGeometries) geometry.dispose();
    for (const material of this.sourceMaterials) material.dispose();
    this.texture.dispose();
    this.texture.image?.close?.();
    this.modules.clear();
  }
}

/** Browser default. Tests and standalone scenes may inject a different loader/fetch. */
export async function loadCharacterLibrary({ url = DEFAULT_GLB, manifestUrl = DEFAULT_MANIFEST,
  fetcher = globalThis.fetch, loader = new GLTFLoader() } = {}) {
  if (typeof fetcher !== 'function') throw new Error('Cultivator manifest fetch is unavailable');
  const response = await fetcher(manifestUrl);
  if (!response.ok) throw new Error(`Cultivator manifest HTTP ${response.status}`);
  const manifest = await response.json();
  const gltf = await loader.loadAsync(url);
  try { return new CharacterLibrary(gltf, manifest); }
  catch (error) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    gltf.scene.traverse(node => {
      if (!node.isMesh) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!material) continue;
        materials.add(material);
        if (material.map) textures.add(material.map);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) { texture.dispose(); texture.image?.close?.(); }
    throw error;
  }
}
