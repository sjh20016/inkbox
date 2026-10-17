// 水墨沙盒 · 山海异兽资产库（Render3D · A1 众生入画）
//
// ───────────────────────────────────────────────────────────────────────
// 这层负责什么
// ───────────────────────────────────────────────────────────────────────
//
// 13 只《山海经》异兽是**部件式刚体**：`root → body → (头/尾/翼/腿)`，没有骨骼，
// 每只 8 套同名 clip（static / idle / walk / run / eat / dance / gesture-positive /
// gesture-negative），共用一张 16×1 调色板（UV = (格+0.5)/16）。
//
// 世界里的灵兽是 InstancedMesh 批处理 ⇒ 需要**一份静态几何 + 一份共享材质**。
// 所以本库在加载时把每个物种的所有部件按 rest 变换（节点默认矩阵，不含动画）
// 合并成一个几何体：`Body + 尾部 + 四条腿 ...` 一次 draw call 画完。
// 动画 clip 本身保留下来（`keepRigs: true` 时连原层级场景也保留），给 lab 用
// AnimationMixer 播放；世界批处理只吃合并后的静态几何。
//
// ⚠️ 资源纪律：几何/材质/贴图全部由本库持有，`dispose()` 一次释放；
//    `CreatureBatch` 只拥有自己的 InstancedMesh 包装，不释放共享几何。
// ⚠️ 加载失败可回退：调用方（Render3DHost / EntityLayer）在库为空时退回旧占位。

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ASSET_ROOT = new URL('../../../../assets/creatures/', import.meta.url);
export const CREATURE_MANIFEST_URL = new URL('data/creature_manifest.json', ASSET_ROOT).href;
export const CREATURE_PALETTE_URL = new URL('materials/creature_palette.png', ASSET_ROOT).href;
export const CREATURE_MESH_ROOT = new URL('mesh/', ASSET_ROOT).href;

/** 8 套动画的名字与顺序是资产契约（同名同序，LINEAR）。 */
export const CREATURE_CLIPS = Object.freeze([
  'static', 'idle', 'walk', 'run', 'eat', 'dance', 'gesture-positive', 'gesture-negative',
]);

/** 默认世界试装：4 种体型/外观有代表性的普通动物。 */
export const DEFAULT_WORLD_TRIAL_IDS = Object.freeze(['tiangou', 'dangkang', 'lushu', 'xuangui']);

/** manifest 既接受 `{ creatures: [...] }` 也接受裸数组（兼容资产原包格式）。 */
export function creatureManifestEntries(manifest) {
  const list = Array.isArray(manifest) ? manifest : manifest?.creatures;
  if (!Array.isArray(list) || list.length === 0) throw new Error('Creature manifest requires a non-empty creature list');
  return list;
}

/** 把 GLB 场景里的所有部件按 rest 世界矩阵烘成一个几何体。 */
export function mergeCreatureRestGeometry(gltfScene, id = 'creature') {
  if (!gltfScene?.isObject3D) throw new Error('Creature GLB scene is required');
  gltfScene.updateMatrixWorld(true);
  const parts = [];
  gltfScene.traverse(node => {
    if (!node.isMesh) return;
    if (node.isSkinnedMesh) throw new Error(`Creature ${id} must be a rigid part model, not skinned`);
    if (Array.isArray(node.material) && node.material.length > 1) {
      throw new Error(`Creature ${id} part must use one shared material`);
    }
    if (!node.geometry) return;
    let geometry = node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    if (geometry.index) {
      const nonIndexed = geometry.toNonIndexed();
      geometry.dispose();
      geometry = nonIndexed;
    }
    parts.push(geometry);
  });
  if (parts.length === 0) throw new Error(`Creature ${id} GLB contains no mesh parts`);
  let merged = null;
  try {
    merged = mergeGeometries(parts, false);
  } finally {
    for (const part of parts) part.dispose();
  }
  if (!merged) throw new Error(`Creature ${id} parts could not be merged (attribute mismatch)`);
  merged.name = `creature:${id}`;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function paletteMaterial(texture) {
  const material = new THREE.MeshLambertMaterial({
    name: 'creature_shared_palette',
    color: '#ffffff',
    map: texture,
    flatShading: true,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
  });
  return material;
}

/** 16×1 最近邻调色板贴图（外置 PNG 与 GLB 内嵌图逐字节相同）。 */
export function configureCreaturePaletteTexture(texture) {
  if (!texture) throw new Error('Creature palette texture is required');
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 所有物种共享的调色板材质（一张贴图 + 一个材质）。
 * 生物本身颜色全在 UV 里，不做逐实例染色。
 */
export function createCreatureMaterial(texture) {
  return paletteMaterial(configureCreaturePaletteTexture(texture));
}

function disposeMaterialResources(material, materialSet, textureSet) {
  if (!material) return;
  if (materialSet) materialSet.add(material);
  if (material.map && textureSet) textureSet.add(material.map);
}

function entryFor(gltf, info, keepRigs) {
  const id = info?.id;
  if (!id) throw new Error('Creature manifest entry requires an id');
  const geometry = mergeCreatureRestGeometry(gltf.scene, id);
  const nodes = [];
  gltf.scene.traverse(node => { if (node.isMesh) nodes.push(node.name); });
  const box = geometry.boundingBox;
  const size = Array.isArray(info.size) && info.size.length === 3 ? [...info.size]
    : [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
  const height = Number.isFinite(info.height) ? info.height : box.max.y - box.min.y;
  const position = geometry.getAttribute('position');
  return {
    id,
    name_zh: info.name_zh || id,
    size_class: info.size_class || null,
    source: info.source || null,
    quote: info.quote || null,
    height,
    height_vs_cultivator: info.height_vs_cultivator ?? null,
    size,
    feet_y: Number.isFinite(info.feet_y) ? info.feet_y : box.min.y,
    triangles: position.count / 3,
    parts: Number.isFinite(info.parts) ? info.parts : nodes.length,
    nodes,
    clips: (gltf.animations || []).map(clip => clip.name),
    geometry,
    keepRigs: !!keepRigs,
    worldTrial: !!info.worldTrial,
  };
}

/**
 * 统一的异兽资产库。
 *
 * - 世界批处理吃 `species.geometry` / `library.material`（单几何 + 单材质）；
 * - lab 在 `keepRigs: true` 时额外拿到原层级场景与动画 clip，可用
 *   `new THREE.AnimationMixer(rig.scene)` 播放。
 */
export class CreatureLibrary {
  constructor({ entries, paletteTexture = null, material = null, keepRigs = false, manifest = null } = {}) {
    if (!Array.isArray(entries) || entries.length === 0) throw new Error('CreatureLibrary requires loaded GLB entries');
    this.manifest = manifest;
    this.keepRigs = !!keepRigs;
    this.species = new Map();
    this.ids = [];
    this.rigs = new Map();
    this.sourceGeometries = new Set();
    this.sourceMaterials = new Set();
    this.sourceTextures = new Set();
    this.disposed = false;
    if (material) {
      this.material = material;
      this.texture = material.map || null;
    } else {
      if (!paletteTexture) throw new Error('CreatureLibrary requires a 16×1 palette texture');
      this.texture = configureCreaturePaletteTexture(paletteTexture);
      this.material = paletteMaterial(this.texture);
    }
    for (const entry of entries) {
      const info = entry.info || {};
      const gltf = entry.gltf;
      if (!gltf?.scene) throw new Error(`Creature ${entry.id || '?'} GLB scene is required`);
      if (!info.id) info.id = entry.id;
      const species = entryFor(gltf, info, this.keepRigs);
      if (!/^[a-z][a-z0-9_-]*$/.test(species.id)) throw new Error(`Unstable creature id: ${species.id}`);
      if (this.species.has(species.id)) throw new Error(`Duplicate creature id: ${species.id}`);
      this.species.set(species.id, species);
      this.ids.push(species.id);
      gltf.scene.traverse(node => {
        if (!node.isMesh) return;
        if (this.keepRigs) this.sourceGeometries.add(node.geometry);
        else node.geometry.dispose();
        for (const source of Array.isArray(node.material) ? node.material : [node.material]) {
          disposeMaterialResources(source, this.sourceMaterials, this.sourceTextures);
        }
        if (this.keepRigs) node.material = this.material;
      });
      if (this.keepRigs) {
        this.rigs.set(species.id, { id: species.id, scene: gltf.scene, animations: gltf.animations || [] });
      }
    }
    // 世界试装物种：默认 4 种，缺谁补谁；一个都没加载时退回全部已加载物种。
    const trial = DEFAULT_WORLD_TRIAL_IDS.filter(id => this.species.has(id));
    this.worldSpecies = trial.length ? trial : [...this.ids];
    this.totalTriangles = [...this.species.values()].reduce((sum, species) => sum + species.triangles, 0);
  }

  get size() { return this.species.size; }

  hasSpecies(id) { return this.species.has(id); }

  clipsFor(id) { return this.rigs.get(id)?.animations?.map(clip => clip.name) || this.species.get(id)?.clips || []; }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const species of this.species.values()) species.geometry?.dispose();
    if (this.keepRigs) {
      for (const geometry of this.sourceGeometries) geometry.dispose();
      this.sourceGeometries.clear();
    }
    for (const rig of this.rigs.values()) rig.scene?.removeFromParent?.();
    this.rigs.clear();
    for (const material of this.sourceMaterials) material.dispose();
    for (const texture of this.sourceTextures) { texture.dispose(); texture.image?.close?.(); }
    this.sourceMaterials.clear();
    this.sourceTextures.clear();
    this.material?.dispose();
    this.texture?.dispose();
    this.texture?.image?.close?.();
    this.material = null;
    this.texture = null;
    this.species.clear();
    this.ids = [];
    this.worldSpecies = [];
  }
}

function disposeGltf(gltf) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  gltf?.scene?.traverse(node => {
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
}

/**
 * 浏览器默认加载入口。
 *
 * @param {object} [options]
 * @param {ReadonlyArray<string>|null} [options.ids] `null` = manifest 全部 13 只（lab）；
 *   世界试装传 4 个 id（默认由 Render3DHost 传入 DEFAULT_WORLD_TRIAL_IDS）。
 * @param {boolean} [options.keepRigs] 保留原层级场景 + 动画 clip（lab 用）。
 * @param {string} [options.manifestUrl]
 * @param {string} [options.paletteUrl]
 * @param {(id:string)=>string} [options.urlFor] 单只 GLB 地址解析。
 * @param {typeof fetch} [options.fetcher]
 * @param {object} [options.loader] GLTFLoader 兼容对象（测试可注入）。
 * @param {object} [options.textureLoader] TextureLoader 兼容对象（测试可注入）。
 * @param {object|null} [options.paletteTexture] 预先加载的调色板贴图（测试可注入）。
 */
export async function loadCreatureLibrary({
  ids = null,
  keepRigs = false,
  manifestUrl = CREATURE_MANIFEST_URL,
  paletteUrl = CREATURE_PALETTE_URL,
  urlFor = id => new URL(`creature-${id}.glb`, CREATURE_MESH_ROOT).href,
  fetcher = globalThis.fetch,
  loader = new GLTFLoader(),
  textureLoader = new THREE.TextureLoader(),
  paletteTexture = null,
} = {}) {
  if (typeof fetcher !== 'function') throw new Error('Creature manifest fetch is unavailable');
  const response = await fetcher(manifestUrl);
  if (!response.ok) throw new Error(`Creature manifest HTTP ${response.status}`);
  const manifest = await response.json();
  const all = creatureManifestEntries(manifest);
  const wanted = ids == null ? all : all.filter(entry => ids.includes(entry.id));
  if (wanted.length === 0) throw new Error('Creature manifest has no requested species');
  let texture = paletteTexture;
  if (!texture) {
    texture = await textureLoader.loadAsync(paletteUrl);
    configureCreaturePaletteTexture(texture);
  }
  const loaded = [];
  const failed = [];
  try {
    for (const info of wanted) {
      try {
        const gltf = await loader.loadAsync(urlFor(info.id));
        loaded.push({ id: info.id, info, gltf });
      } catch (error) {
        failed.push({ id: info.id, message: error?.message || String(error) });
      }
    }
    if (loaded.length === 0) throw new Error(`No creature GLB loaded${failed.length ? `: ${failed.map(f => f.id).join(', ')}` : ''}`);
    const library = new CreatureLibrary({ entries: loaded, paletteTexture: texture, keepRigs, manifest });
    library.errors = failed;
    return library;
  } catch (error) {
    for (const entry of loaded) disposeGltf(entry.gltf);
    texture?.dispose();
    throw error;
  }
}
