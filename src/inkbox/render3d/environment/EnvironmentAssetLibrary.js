import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ENVIRONMENT_PALETTE_SLOTS } from '../art/RealmStyleProfile.js';

const DEFAULT_GLB = new URL('../../../../assets/environment/mesh/environment_library.glb', import.meta.url).href;
const DEFAULT_MANIFEST = new URL('../../../../assets/environment/data/environment_manifest.json', import.meta.url).href;
const DEFAULT_PALETTE = new URL('../../../../assets/environment/data/palette_slots.json', import.meta.url).href;
const identity = new THREE.Matrix4();
const disposedGLTFs = new WeakSet();
const closedTextures = new WeakSet();

function equalBounds(actual, expected, epsilon = 1e-5) {
  return ['min', 'max'].every(edge => actual?.[edge]?.length === 3 && expected?.[edge]?.length === 3
    && actual[edge].every((value, i) => Number.isFinite(value) && Math.abs(value - expected[edge][i]) <= epsilon));
}
function boundsOf(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  return { min: box.min.toArray(), max: box.max.toArray() };
}
function decodedUVSlots(geometry) {
  const uv = geometry.getAttribute('uv');
  if (!uv) throw new Error('Environment mesh is missing TEXCOORD_0');
  const slots = new Set();
  for (let i = 0; i < uv.count; i++) {
    const x = uv.getX(i) * 8 - 0.5, y = uv.getY(i) * 8 - 0.5;
    const xi = Math.round(x), yi = Math.round(y);
    if (Math.abs(x - xi) > 1e-4 || Math.abs(y - yi) > 1e-4 || xi < 0 || xi > 7 || yi < 0 || yi > 7) {
      throw new Error('Environment UV must point at the center of an 8x8 atlas cell');
    }
    slots.add(yi * 8 + xi);
  }
  return [...slots].sort((a, b) => a - b);
}
function disposeGLTF(gltf) {
  if (!gltf?.scene || disposedGLTFs.has(gltf)) return;
  disposedGLTFs.add(gltf);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  gltf.scene.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of (Array.isArray(node.material) ? node.material : node.material ? [node.material] : [])) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) disposeTexture(texture);
}
function disposeTexture(texture) {
  if (!texture || closedTextures.has(texture)) return;
  closedTextures.add(texture);
  texture.image?.close?.();
  texture.dispose();
}

/** Shared decoded environment geometry and the single index atlas texture. */
export class EnvironmentAssetLibrary {
  constructor(gltf, manifest, paletteSlots) {
    this.manifest = manifest;
    this.paletteSlots = paletteSlots;
    this.modules = new Map();
    this.assets = manifest?.assets;
    this.texture = null;
    this.disposed = false;
    try {
      if (!gltf?.scene || !manifest?.modules || !manifest.assets) throw new Error('Environment library requires a decoded GLB and manifest');
      if (!Array.isArray(paletteSlots?.slots) || paletteSlots.slots.length !== 28
          || paletteSlots.slots.some((slot, index) => slot.index !== index || slot.semantic !== ENVIRONMENT_PALETTE_SLOTS[index])) throw new Error('Environment palette must match RealmStyleProfile\'s ordered 28 semantic slots');
      gltf.scene.updateMatrixWorld(true);
      const nodeByName = new Map();
      gltf.scene.traverse(node => {
        if (!node.isMesh) return;
        if (nodeByName.has(node.name)) throw new Error(`Duplicate environment mesh name ${node.name}`);
        nodeByName.set(node.name, node);
      });
      let atlas = null, sourceMaterial = null;
      for (const [nodeName, info] of Object.entries(manifest.modules)) {
        if (nodeName !== info.node) throw new Error(`Environment module key must equal its ASCII node name: ${nodeName}`);
        const node = nodeByName.get(nodeName);
        if (!node || !node.isMesh || !/^[a-z][a-z0-9_]*$/.test(node.name)) throw new Error(`Environment GLB is missing named mesh ${nodeName}`);
        if (Array.isArray(node.material)) throw new Error(`Environment mesh ${nodeName} must use exactly one material`);
        if (node.geometry.getAttribute('skinIndex') || node.geometry.getAttribute('skinWeight')) throw new Error(`Environment mesh ${nodeName} cannot be skinned`);
        if (!node.matrixWorld.equals(identity)) throw new Error(`Environment node ${nodeName} must have an identity transform`);
        if (!node.material?.map?.isTexture) throw new Error(`Environment mesh ${nodeName} must reference the shared external atlas`);
        sourceMaterial ||= node.material;
        if (sourceMaterial !== node.material) throw new Error('Environment modules must share one glTF material');
        atlas ||= node.material.map;
        if (atlas !== node.material.map) throw new Error('Environment modules must share one atlas texture');
        const geometry = node.geometry;
        const triangles = (geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3;
        if (!Number.isInteger(info.triangles) || triangles !== info.triangles) throw new Error(`Environment triangle mismatch for ${nodeName}: expected ${info.triangles}, decoded ${triangles}`);
        const actualBounds = boundsOf(geometry);
        if (!equalBounds(actualBounds, info.bounds)) throw new Error(`Environment bounds mismatch for ${nodeName}`);
        const actualSlots = decodedUVSlots(geometry);
        if (JSON.stringify(actualSlots) !== JSON.stringify(info.uvSlots)) throw new Error(`Environment UV slot mismatch for ${nodeName}`);
        if (actualSlots.some(slot => slot < 0 || slot >= ENVIRONMENT_PALETTE_SLOTS.length)
            || !Array.isArray(info.semanticSlots)
            || JSON.stringify(info.semanticSlots) !== JSON.stringify(actualSlots.map(slot => ENVIRONMENT_PALETTE_SLOTS[slot]))) throw new Error(`Environment semantic slot mismatch for ${nodeName}`);
        const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
        if (!normal || normal.count !== position.count || geometry.getAttribute('uv').count !== position.count) throw new Error(`Environment mesh ${nodeName} has inconsistent vertex attributes`);
        for (let i = 0; i < normal.count; i++) {
          const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
          if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-4) throw new Error(`Environment mesh ${nodeName} has a non-unit normal`);
        }
        this.modules.set(nodeName, { ...info, geometry, node });
      }
      if (nodeByName.size !== this.modules.size) throw new Error('Environment GLB contains meshes outside the manifest');
      if (!atlas) throw new Error('Environment atlas texture was not decoded');
      for (const [assetId, asset] of Object.entries(this.assets)) {
        if (asset.id !== assetId || !Array.isArray(asset.lods) || asset.lods.length !== 3
            || asset.lods.some(nodeName => !this.modules.has(nodeName))) throw new Error(`Environment asset ${assetId} must reference three loaded LOD modules`);
      }
      atlas.magFilter = THREE.NearestFilter;
      atlas.minFilter = THREE.NearestFilter;
      atlas.generateMipmaps = false;
      atlas.colorSpace = THREE.NoColorSpace;
      atlas.flipY = false;
      atlas.needsUpdate = true;
      this.texture = atlas;
      this.sourceMaterial = sourceMaterial;
    } catch (error) {
      disposeGLTF(gltf);
      this.disposed = true;
      throw error;
    }
  }

  geometryFor(assetId, lod = 0) {
    const asset = this.assetInfo(assetId);
    const nodeName = typeof lod === 'string' ? lod : asset.lods[lod];
    const module = this.modules.get(nodeName);
    if (!module || !asset.lods.includes(nodeName)) throw new Error(`Unknown environment LOD ${String(lod)} for ${assetId}`);
    return module.geometry;
  }

  assetInfo(assetId) {
    if (this.disposed) throw new Error('Environment asset library is disposed');
    const asset = this.assets[assetId];
    if (!asset) throw new Error(`Unknown environment asset ${assetId}`);
    return asset;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const geometries = new Set([...this.modules.values()].map(module => module.geometry));
    for (const geometry of geometries) geometry.dispose();
    this.sourceMaterial?.dispose();
    disposeTexture(this.texture);
    this.modules.clear();
    this.texture = null;
    this.sourceMaterial = null;
  }
}

async function fetchJSON(fetcher, url, label) {
  const response = await fetcher(url);
  if (!response?.ok) throw new Error(`Unable to load environment ${label}: ${response?.status ?? 'no response'}`);
  return response.json();
}
function parseGLTF(loader, bytes, basePath) {
  return new Promise((resolve, reject) => loader.parse(bytes, basePath, resolve, reject));
}

/** Load manifest, slot order and one GLB/atlas for all plane stages. */
export async function loadEnvironmentAssetLibrary({ url = DEFAULT_GLB, manifestUrl = DEFAULT_MANIFEST, paletteUrl = DEFAULT_PALETTE, fetcher = globalThis.fetch?.bind(globalThis), loader } = {}) {
  if (typeof fetcher !== 'function') throw new Error('Environment loader requires fetch');
  const gltfLoader = loader || new GLTFLoader();
  let gltf = null;
  try {
    const [manifest, paletteSlots, glbResponse] = await Promise.all([
      fetchJSON(fetcher, manifestUrl, 'manifest'),
      fetchJSON(fetcher, paletteUrl, 'palette slots'),
      fetcher(url),
    ]);
    if (!glbResponse?.ok) throw new Error(`Unable to load environment GLB: ${glbResponse?.status ?? 'no response'}`);
    const bytes = await glbResponse.arrayBuffer();
    const basePath = new URL('.', url).href;
    gltf = await parseGLTF(gltfLoader, bytes, basePath);
    return new EnvironmentAssetLibrary(gltf, manifest, paletteSlots);
  } catch (error) {
    disposeGLTF(gltf);
    throw error;
  }
}
