// 卜算子专用角色库：单体 GLB + 20 色调色板 + 38 骨 + Idle / Walk / Wind。
//
// 为什么不并进 `characters/CharacterLibrary.js`（三条都成立，缺一条都不该共用）：
//   1. **调色板**：修士库的 palette 校验是 8–12 色（12 格宗门图集，UV=(i+.5)/12）；
//      卜算子图集是 20 格，UV=(i+.5)/20。颜色格语义不同，不能共用一张贴图/一份材质。
//   2. **结构**：修士库是「七个槽位模块化组合 + 每个身份一套配置」，把网格摊平成
//      CPU geometry 交给 InstancedMesh 复用（静态，不需要 Skeleton）。卜算子是一个
//      固定角色：5 个网格节点、38 根骨，必须保留 SkinnedMesh + Skeleton 才能交给
//      AnimationMixer 播放。
//   3. **数量**：修士库一个世界成百上千个实例，卜算子永远只有一具。
//
// 所以这里是一份**单体角色库**：加载一次 GLB，暴露 `scene` / `animations` /
// `clip(name)` / `dispose()`，游戏内由 `BusanziViewer.js` 单独持有。
//
// 资产来源与规格见 `assets/characters/busanzi/data/busanzi_manifest.json`
// 与 `assets/characters/busanzi/docs/BUSANZI_MODEL_SPEC.md`。

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ASSET_ROOT = new URL('../../../../assets/characters/busanzi/', import.meta.url);

export const BUSANZI_GLB_URL = new URL('mesh/busanzi.glb', ASSET_ROOT).href;
export const BUSANZI_MANIFEST_URL = new URL('data/busanzi_manifest.json', ASSET_ROOT).href;
export const BUSANZI_PALETTE_COUNT = 20;
export const BUSANZI_BONE_COUNT = 38;
export const BUSANZI_CLIP_NAMES = Object.freeze(['Idle', 'Walk', 'Wind']);
export const BUSANZI_MESH_IDS = Object.freeze([
  'buzuanzi_body', 'buzuanzi_hair', 'buzuanzi_talisman', 'buzuanzi_accessories', 'buzuanzi_umbrella',
]);

/** 调色板第 `index` 格中心 UV 的 u 分量。与资产导出公式一致：`(i + 0.5) / count`。 */
export function paletteUvCenter(index, count = BUSANZI_PALETTE_COUNT) {
  return (index + 0.5) / count;
}

/** 从 u 反推色格下标（最近格；图集是 20×1，v 不参与）。 */
export function paletteSlotAt(u, count = BUSANZI_PALETTE_COUNT) {
  return Math.max(0, Math.min(count - 1, Math.floor(u * count)));
}

function isPaletteSlot(u, count = BUSANZI_PALETTE_COUNT, epsilon = 1e-4) {
  const scaled = u * count - 0.5;
  return Number.isFinite(scaled) && Math.abs(scaled - Math.round(scaled)) <= epsilon
    && scaled >= -0.5 - epsilon && scaled < count - 0.5 + epsilon;
}

/**
 * 20 格调色板材质。
 *
 * 用 Lambert + flatShading 与修士模型保持同一套「低面数、明确轮廓、有限色彩」的写意水墨观感；
 * 贴图是 GLB 内嵌的 20×1 图集，最近邻采样（不许线性插值，否则相邻色格会渗色）。
 */
export function paletteMaterial(sourceMaterial, { name = 'busanzi_palette_20' } = {}) {
  if (!sourceMaterial?.map) throw new Error('Busanzi GLB requires an embedded palette map');
  const material = new THREE.MeshLambertMaterial({
    name,
    color: '#ffffff',
    map: sourceMaterial.map,
    flatShading: true,
    side: THREE.FrontSide,
    transparent: false,
    depthWrite: true,
  });
  const texture = material.map;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  material.needsUpdate = true;
  return material;
}

function trianglesOf(geometry) {
  if (!geometry) return 0;
  const index = geometry.getIndex();
  if (index) return Math.floor(index.count / 3);
  const position = geometry.getAttribute('position');
  return position ? Math.floor(position.count / 3) : 0;
}

/**
 * 卜算子单体角色库。
 *
 * 构造后 `scene` 可直接 `scene.add(library.scene)`；动画用
 * `new THREE.AnimationMixer(library.scene)` + `library.clip(name)`。
 * 失败时构造器抛错（调用方兜底：看板/游戏只收起这块，不阻断世界）。
 */
export class BusanziLibrary {
  /**
   * @param {object} gltf GLTFLoader 产物（或测试注入的等价结构）
   * @param {object} manifest `data/busanzi_manifest.json`
   */
  constructor(gltf, manifest) {
    if (!gltf?.scene) throw new Error('BusanziLibrary requires a loaded GLB scene');
    if (!manifest || typeof manifest !== 'object') throw new Error('BusanziLibrary requires the asset manifest');
    const paletteCount = manifest.palette?.count;
    if (paletteCount !== BUSANZI_PALETTE_COUNT) {
      throw new Error(`Busanzi palette must contain exactly ${BUSANZI_PALETTE_COUNT} colours (got ${paletteCount})`);
    }
    if (!Array.isArray(manifest.meshes?.list) || manifest.meshes.list.length !== BUSANZI_MESH_IDS.length) {
      throw new Error('Busanzi manifest must declare the five mesh nodes');
    }
    if (manifest.rig?.jointCount !== BUSANZI_BONE_COUNT) {
      throw new Error(`Busanzi manifest must declare ${BUSANZI_BONE_COUNT} joints (got ${manifest.rig?.jointCount})`);
    }

    this.manifest = manifest;
    this.scene = gltf.scene;
    this.scene.name = this.scene.name || 'BusanziScene';
    this.disposed = false;
    this.sourceGeometries = new Set();
    this.sourceMaterials = new Set();
    this.textures = new Set();
    this.meshes = new Map();
    this.triangles = 0;
    this.sourceMaterial = null;

    const rig = this.scene.getObjectByName(manifest.rig.node);
    if (!rig) throw new Error(`Busanzi GLB missing rig root node: ${manifest.rig.node}`);

    for (const [index, entry] of manifest.meshes.list.entries()) {
      const expectedId = BUSANZI_MESH_IDS[index];
      if (entry.id !== expectedId) throw new Error(`Busanzi manifest mesh order ${index} must be ${expectedId}`);
      const node = this.scene.getObjectByName(entry.node || entry.id);
      if (!node) throw new Error(`Busanzi GLB missing mesh node: ${entry.node || entry.id}`);
      if (!node.isSkinnedMesh) throw new Error(`Busanzi mesh ${entry.id} must be a SkinnedMesh (animation needs a skeleton)`);
      if (!node.geometry.getAttribute('skinIndex') || !node.geometry.getAttribute('skinWeight')) {
        throw new Error(`Busanzi mesh ${entry.id} is missing skin attributes`);
      }
      if (Array.isArray(node.material)) throw new Error(`Busanzi mesh ${entry.id} must use a single material`);
      this.sourceMaterial ??= node.material;
      if (node.material !== this.sourceMaterial) throw new Error('All Busanzi meshes must share one GLB material');
      const triangles = trianglesOf(node.geometry);
      if (entry.triangles !== undefined && entry.triangles !== triangles) {
        throw new Error(`Busanzi mesh ${entry.id} triangle count ${triangles} disagrees with manifest ${entry.triangles}`);
      }
      this.triangles += triangles;
      // UV 必须是 20 个色格中心（最近邻图集的硬前提）：图集换错/UV 没重映射一查就露。
      const uv = node.geometry.getAttribute('uv');
      if (!uv) throw new Error(`Busanzi mesh ${entry.id} has no UV attribute`);
      for (let i = 0; i < uv.count; i += 1) {
        if (!isPaletteSlot(uv.getX(i), paletteCount)) {
          throw new Error(`Busanzi mesh ${entry.id} UV ${i} does not sit on a ${paletteCount}-slot palette centre`);
        }
      }
      node.frustumCulled = false;
      this.meshes.set(entry.id, node);
      this.sourceGeometries.add(node.geometry);
      if (node.skeleton) this.skeleton = node.skeleton;
    }
    if (manifest.meshes.totalTriangles !== undefined && manifest.meshes.totalTriangles !== this.triangles) {
      throw new Error(`Busanzi triangle total ${this.triangles} disagrees with manifest ${manifest.meshes.totalTriangles}`);
    }

    if (!this.skeleton) throw new Error('Busanzi GLB exposes no skeleton');
    const bones = this.skeleton.bones;
    if (bones.length !== BUSANZI_BONE_COUNT) {
      throw new Error(`Busanzi skeleton must have ${BUSANZI_BONE_COUNT} bones (got ${bones.length})`);
    }
    const expectedJoints = manifest.rig.joints;
    if (!Array.isArray(expectedJoints) || expectedJoints.length !== bones.length) {
      throw new Error('Busanzi manifest joints must list all skeleton bones');
    }
    for (const [index, bone] of bones.entries()) {
      if (bone.name !== expectedJoints[index]) {
        throw new Error(`Busanzi bone ${index} is ${bone.name}, manifest expects ${expectedJoints[index]}`);
      }
    }
    this.baseJoints = expectedJoints.slice(0, manifest.rig.baseJointCount || 16);

    this.material = paletteMaterial(this.sourceMaterial);
    this.texture = this.material.map;
    for (const mesh of this.meshes.values()) mesh.material = this.material;

    this.animations = gltf.animations || [];
    const byName = new Map(this.animations.map((clip) => [clip.name, clip]));
    this.clips = new Map();
    for (const name of BUSANZI_CLIP_NAMES) {
      const clip = byName.get(name);
      if (!clip) throw new Error(`Busanzi GLB missing animation clip: ${name}`);
      if (!(clip.duration > 0)) throw new Error(`Busanzi clip ${name} has no duration`);
      if (!clip.tracks.length) throw new Error(`Busanzi clip ${name} has no tracks`);
      this.clips.set(name, clip);
    }
    this.animationNames = BUSANZI_CLIP_NAMES.slice();

    // GLTFLoader 建的原材质已被 paletteMaterial 替换，但它仍被 GLB 引用着；
    // 记下来在 dispose 时释放（贴图是共用的 —— 由 this.texture 统一释放，这里不重复关）。
    if (this.sourceMaterial && this.sourceMaterial !== this.material) {
      this.sourceMaterials.add(this.sourceMaterial);
    }
    this.sourceTextures = new Set();
  }

  /** 取动画片段；未知名字直接抛错（调用方只允许 Idle / Walk / Wind）。 */
  clip(name) {
    const clip = this.clips.get(name);
    if (!clip) throw new Error(`Unknown busanzi clip: ${name}`);
    return clip;
  }

  mesh(id) {
    const mesh = this.meshes.get(id);
    if (!mesh) throw new Error(`Unknown busanzi mesh: ${id}`);
    return mesh;
  }

  /** 当前骨架/网格的 bind 包围盒（看板取景与自检用；不改动画状态）。 */
  getBounds(target = new THREE.Box3()) {
    target.makeEmpty();
    this.scene.updateMatrixWorld(true);
    for (const mesh of this.meshes.values()) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
      target.union(box);
    }
    return target;
  }

  /** 一份可读的运行时统计（lab/游戏内验收用）。 */
  metrics() {
    return {
      meshes: this.meshes.size,
      triangles: this.triangles,
      bones: this.skeleton?.bones.length ?? 0,
      baseJoints: this.baseJoints.length,
      clips: this.animationNames.map((name) => ({
        name,
        duration: this.clip(name).duration,
        tracks: this.clip(name).tracks.length,
      })),
      palette: {
        count: this.manifest.palette.count,
        uvFormula: this.manifest.palette.uvFormula,
        nearest: this.texture.magFilter === THREE.NearestFilter && this.texture.minFilter === THREE.NearestFilter,
        imageSize: [this.texture.image?.width ?? null, this.texture.image?.height ?? null],
      },
      displaced: this.disposed,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const geometry of this.sourceGeometries) geometry.dispose();
    this.sourceGeometries.clear();
    for (const material of this.sourceMaterials) material.dispose();
    this.sourceMaterials.clear();
    for (const texture of this.sourceTextures) {
      texture.dispose();
      texture.image?.close?.();
    }
    this.sourceTextures.clear();
    this.material?.dispose();
    this.texture?.dispose();
    this.texture?.image?.close?.();
    this.material = null;
    this.texture = null;
    this.meshes.clear();
    this.clips.clear();
    this.animations = [];
    this.skeleton = null;
    this.scene.removeFromParent();
    this.scene.clear?.();
  }
}

/**
 * 浏览器默认加载入口：manifest 与 GLB 都从运行包内的相对路径取。
 * 测试/看板可以注入 `fetcher` 或 `loader`。
 */
export async function loadBusanziLibrary({
  url = BUSANZI_GLB_URL,
  manifestUrl = BUSANZI_MANIFEST_URL,
  fetcher = globalThis.fetch,
  loader = new GLTFLoader(),
} = {}) {
  if (typeof fetcher !== 'function') throw new Error('Busanzi manifest fetch is unavailable');
  const response = await fetcher(manifestUrl);
  if (!response.ok) throw new Error(`Busanzi manifest HTTP ${response.status}`);
  const manifest = await response.json();
  const gltf = await loader.loadAsync(url);
  try {
    return new BusanziLibrary(gltf, manifest);
  } catch (error) {
    // 构造失败也要把 GLTFLoader 的资源收干净，否则一次失败会在控制台留一串没主的贴图/几何。
    const geometries = new Set(), materials = new Set(), textures = new Set();
    gltf.scene?.traverse((node) => {
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
