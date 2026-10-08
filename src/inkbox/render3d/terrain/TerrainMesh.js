import * as THREE from 'three';
import { quadIndices, dirtyQuads, adaptiveTopology } from './topology.js';
import { ElevationField } from './ElevationField.js';
import { RegionGeometry } from '../region/RegionGeometry.js';
import { applyQuadMask } from '../region/quadMask.js';
import { TERRAIN_INFO } from '../../core/config.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';
import { TerrainDataTextures } from '../art/TerrainDataTextures.js';
import { PigmentTerrainMaterial } from '../art/PigmentTerrainMaterial.js';

export function gridGeometry(world, coordinates) {
  const position = new Float32Array(world.size * 3);
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    const p = coordinates.cellToRender(x, y), i = (y * world.w + x) * 3;
    position.set([p.x, 0, p.z], i);
  }
  const indices = new Uint32Array((world.w - 1) * (world.h - 1) * 6);
  let j = 0;
  for (let y = 0; y < world.h - 1; y++) for (let x = 0; x < world.w - 1; x++) {
    const a = y * world.w + x, b = a + 1, c = a + world.w, d = c + 1;
    indices.set(quadIndices(world,x,y), j); j += 6;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  // Conservative immutable bounds cover all legal elevations, including future sculpting.
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-(world.w - 1) / 2, -30, -(world.h - 1) / 2), new THREE.Vector3((world.w - 1) / 2, 120, (world.h - 1) / 2));
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  return geometry;
}

export class TerrainMesh {
  // `elevation` 缺省只为**测试 / 历史调用**保留（等价 RAW）；生产路径由 PlaneStage 显式传入。
  constructor(world, coordinates, elevation = new ElevationField(world)) {
    this.world = world;
    this.elevation = elevation;
    this.regionGeometry = null;
    this.regionMask = null;
    this.regionInside = true;
    this.geometry = gridGeometry(world, coordinates);
    this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(world.size * 3), 3).setUsage(THREE.DynamicDrawUsage));
    // Steep boundary slopes can face away even while the camera stays above ground.
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = RENDER_ORDER.terrain;
    this.fullIndices = this.geometry.index.array.slice();
    this.geometry.index.setUsage(THREE.DynamicDrawUsage);
    this.palette = TERRAIN_INFO.map(t => new THREE.Color(`rgb(${t.color.join(',')})`));
    this.update({ x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 });
  }
  setArtProfile(profile) {
    const wasEnabled = !!this.artProfile;
    this.artProfile = profile || null;
    if (profile) {
      if (!this.artData) this.artData = new TerrainDataTextures(this.world, this.elevation);
      else if (!wasEnabled) {
        this.artData.heightTexture.clearUpdateRanges(); this.artData.typeTexture.clearUpdateRanges();
        this.artData.update({ x0: 0, y0: 0, x1: this.world.w - 1, y1: this.world.h - 1 });
      }
      if (!this.inkMaterial) this.inkMaterial = new PigmentTerrainMaterial(this.artData, profile);
      else this.inkMaterial.setProfile(profile);
    }
    // Keep material as the legacy tint source for the historical Slab probe.
    this.mesh.material = profile ? this.inkMaterial : this.material;
    this.syncScalarField();
    this.bindSurfaceField();
  }
  /** Field ownership remains with PlaneStage; this material only borrows it. */
  setScalarField(field,enabled){this.scalarField=field;this.scalarFieldEnabled=!!enabled;this.syncScalarField();}
  /** M2-C2D P1：连续表面视觉场同样归 PlaneStage 所有，这里只绑定借用。 */
  setSurfaceField(field){this.surfaceField=field||null;this.bindSurfaceField();}
  bindSurfaceField(){
    if(!this.inkMaterial)return;
    const field=this.surfaceField;
    this.inkMaterial.uniforms.surfaceTexture.value=field?field.texture:this.artData.typeTexture;
    this.inkMaterial.uniforms.surfaceMode.value=field&&this.artProfile?1:0;
    this.inkMaterial.uniforms.surfaceDepthRef.value=field?field.depthReference:0.5;
  }
  syncScalarField(){
    this.scalarField?.setEnabled(this.scalarFieldEnabled&&!!this.artProfile);
    this.bindScalarField();
  }
  bindScalarField(){
    if(!this.inkMaterial)return;
    const field=this.scalarField,active=field?.enabled&&field.valid&&field.texture;
    this.inkMaterial.uniforms.fieldMode.value=active?field.mode:0;
    this.inkMaterial.uniforms.fieldTexture.value=active?field.texture:this.artData.typeTexture;
  }
  updateScalarField(dt){this.scalarField?.update(dt);this.bindScalarField();}
  /**
   * 刷新一块地形。
   *
   * @param {{x0:number,y0:number,x1:number,y1:number}|null} region 闭区间格坐标矩形。
   * @param {{height?:boolean, type?:boolean}} [options] 这一帧要写哪几项：
   *   · 只 `height` ⇒ 只重写顶点 Y；
   *   · 只 `type`   ⇒ 只重写顶点色；
   *   · 两者都给（**默认**）⇒ 都写。
   *
   * ⚠️ 默认「都写」是为了让「整图初始化」和「我只知道有一块区域要刷」的调用方
   *    不必关心分类；**Renderer3D 永远显式传 flags**，因为 `WorldRenderBridge`
   *    已经把 height 与 type 分成两条脏区（M1.1D D4.2）——
   *    只改 `type` 时重写一遍 Y 是纯浪费，而 M2 之后图更大、浪费会被放大。
   */
  update(region, options = { height: true, type: true }) {
    if (!region) return;
    const writeHeight = options.height !== false;
    const writeType = options.type !== false;
    if (!writeHeight && !writeType) return;
    const { position, color } = this.geometry.attributes, w = this.world;
    for (let y = region.y0; y <= region.y1; y++) {
      for (let x = region.x0; x <= region.x1; x++) {
        const i = y * w.w + x;
        if (writeHeight) position.setY(i, this.elevation.node(x, y));
        if (writeType) { const c = this.palette[w.type[i]] || this.palette[5]; color.setXYZ(i, c.r, c.g, c.b); }
      }
      const start = (y * w.w + region.x0) * 3, count = (region.x1 - region.x0 + 1) * 3;
      if (writeHeight) position.addUpdateRange(start, count);
      if (writeType) color.addUpdateRange(start, count);
    }
    if (writeHeight) {
      position.needsUpdate = true;
      if (adaptiveTopology(w)) {
        dirtyQuads(w,region,(x,y)=>this.fullIndices.set(quadIndices(w,x,y),(y*(w.w-1)+x)*6));
        this.keptQuads=applyQuadMask({geometry:this.geometry,fullIndices:this.fullIndices,
          regionGeometry:this.regionGeometry,inside:this.regionInside,quadW:w.w-1,quadH:w.h-1});
      }
    }
    if (writeType) color.needsUpdate = true;
    // The existing dirty channels are also the only GPU snapshot update source.
    // Disabled art does not collect unbounded upload ranges; re-enable performs a full sync.
    if (this.artProfile) this.artData.update(region, options);
    // Flat material derives normals in the shader; no full-grid normal rebuild.
  }
  /**
   * 按 Region 保留 / 排除 quad。
   *
   * M2-B §19：判据**只**来自 `RegionGeometry`——不再自己调 `region.contains()`。
   * M2-B §85：几何只在 Region identity 变化时重建；本方法只重写索引，不动顶点。
   *
   * ⚠️ `this.regionMask` 仍保留 `RegionMask` 本体（M2-A 测试与读数按它断言身份），
   *    但**判定不再走它**——避免「Terrain 一套 contains」那种第二判据。
   */
  setRegionGeometry(geometry, inside = true) {
    if (this.regionGeometry === geometry && this.regionInside === !!inside) return;
    this.regionGeometry = geometry || null;
    this.regionInside = !!inside;
    this.regionMask = geometry?.region || null;
    const keptQuads = applyQuadMask({
      geometry: this.geometry, fullIndices: this.fullIndices, regionGeometry: this.regionGeometry,
      inside: this.regionInside, quadW: this.world.w - 1, quadH: this.world.h - 1,
    });
    this.keptQuads = keptQuads;
  }

  /**
   * 兼容入口：M2-A 的调用方（含测试）按 `RegionMask` 传参。
   * 它会就地为该 mask 建一份 `RegionGeometry`——生产路径请用 `setRegionGeometry`，
   * 那样 Region 改变时只构建一次。
   */
  setRegionMask(region, inside = true) {
    this.setRegionGeometry(region ? new RegionGeometry(this.world, region) : null, inside);
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); this.inkMaterial?.dispose(); this.artData?.dispose(); }
}
