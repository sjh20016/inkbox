import * as THREE from 'three';
import { quadIndices, diagonalAD, adaptiveTopology } from './topology.js';
import { ElevationField } from './ElevationField.js';
import { RegionGeometry } from '../region/RegionGeometry.js';
import { applyQuadMask } from '../region/quadMask.js';
import { TERRAIN_INFO } from '../../core/config.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';
import { TerrainDataTextures } from '../art/TerrainDataTextures.js';
import { PigmentTerrainMaterial } from '../art/PigmentTerrainMaterial.js';
import { terrainGpuConfig } from './terrainGpuConfig.js';
import { raycastTerrain } from './heightfieldRaycast.js';

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
  constructor(world, coordinates, elevation = new ElevationField(world), fireEnabled = false) {
    this.world = world;
    this.fireEnabled = fireEnabled;
    this.elevation = elevation;
    this.regionGeometry = null;
    this.regionMask = null;
    this.regionInside = true;
    this.geometry = gridGeometry(world, coordinates);
    // Node UVs stay exact even when a caller supplies scaled/translated coordinates.
    const uv = new Float32Array(world.size * 2);
    for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
      const i = (y * world.w + x) * 2;
      uv[i] = (x + 0.5) / world.w; uv[i + 1] = (y + 0.5) / world.h;
    }
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(world.size * 3), 3).setUsage(THREE.DynamicDrawUsage));
    // Steep boundary slopes can face away even while the camera stays above ground.
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    // P1：只测射线 XZ 投影经过的 quad（与逐三角形遍历结果一致）；格网不规则时回退 three 原实现。
    const terrain = this;
    this.mesh.raycast = function (raycaster, intersects) {
      if (!raycastTerrain(terrain, raycaster, intersects)) THREE.Mesh.prototype.raycast.call(this, raycaster, intersects);
    };
    this.mesh.renderOrder = RENDER_ORDER.terrain;
    this.fullIndices = this.geometry.index.array.slice();
    this.geometry.index.setUsage(THREE.DynamicDrawUsage);
    this.palette = TERRAIN_INFO.map(t => new THREE.Color(`rgb(${t.color.join(',')})`));
    // G5：GPU 位移期间被跳过上传的通道。退回 Lambert（或任何非 Pigment 材质）前必须整张补齐。
    this.legacyStale = { position: false, color: false };
    this.cpuHeightVersion = 0; this.geometry.userData.cpuHeightVersion = 0;
    this.stats = { topologyFlips: 0, indexUploads: 0, skippedPositionRows: 0, skippedColorRows: 0, legacyResyncs: 0 };
    this.update({ x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 });
  }
  /** GPU 位移只在 Pigment 材质真正挂在 mesh 上时生效；调试材质 / Lambert 一律走旧路径。 */
  /** G5：GPU 位移激活时梯度改由着色器求；切换模式需要整张重打包 B/A。 */
  syncGradientPacking() {
    if (!this.artData || !this.inkMaterial) return;
    const pack = !this.gpuDisplacementActive();
    if (this.artData.packedBroadGradient === pack) return;
    this.artData.packedBroadGradient = pack;
    this.inkMaterial.uniforms.packedBroadRadius.value = pack ? this.artData.packedBroadRadius : 0;
    if (pack) { this.artData.heightTexture.clearUpdateRanges(); this.artData.update({ x0: 0, y0: 0, x1: this.world.w - 1, y1: this.world.h - 1 }, { height: true, type: false }); }
  }
  gpuDisplacementActive() {
    return terrainGpuConfig.displacement && this.gpuEnabled !== false && !!this.artProfile && !!this.inkMaterial && this.mesh.material === this.inkMaterial;
  }
  /** 把被跳过的顶点 Y / 顶点色整张补回 GPU，保证旧材质不会看到陈旧数据。 */
  resyncLegacyAttributes() {
    const stale = this.legacyStale;
    if (!stale.position && !stale.color) return;
    const { position, color } = this.geometry.attributes, w = this.world;
    if (stale.color) {
      for (let i = 0; i < w.size; i++) {
        const c = this.palette[w.type[i]] || this.palette[5];
        const fire = this.fireEnabled ? w.fire[i] : 0;
        if (fire > 0.02) {
          const heat = Math.min(1, fire * 1.15), mix = heat * 0.86;
          color.setXYZ(i, c.r * (1 - mix) + mix, c.g * (1 - mix) + (214 - heat * 70) / 255 * mix, c.b * (1 - mix) + (120 - heat * 90) / 255 * mix);
        } else color.setXYZ(i, c.r, c.g, c.b);
      }
      color.clearUpdateRanges(); color.addUpdateRange(0, color.array.length); color.needsUpdate = true;
    }
    // CPU position 数组一直是新的（拾取依赖它），这里只需整张上传。
    if (stale.position) { position.clearUpdateRanges(); position.addUpdateRange(0, position.array.length); position.needsUpdate = true; }
    stale.position = stale.color = false; this.stats.legacyResyncs++;
  }
  setArtProfile(profile, { gpu = true } = {}) {
    const wasEnabled = !!this.artProfile;
    this.artProfile = profile || null;
    this.gpuEnabled = gpu;
    if (profile) {
      if (!this.artData) this.artData = new TerrainDataTextures(this.world, this.elevation, this.fireEnabled);
      else if (!wasEnabled) {
        this.artData.heightTexture.clearUpdateRanges(); this.artData.typeTexture.clearUpdateRanges();
        this.artData.update({ x0: 0, y0: 0, x1: this.world.w - 1, y1: this.world.h - 1 });
      }
      if (!this.inkMaterial) this.inkMaterial = new PigmentTerrainMaterial(this.artData, profile);
      else this.inkMaterial.setProfile(profile);
    }
    // Keep material as the legacy tint source for the historical Slab probe.
    this.mesh.material = profile ? this.inkMaterial : this.material;
    if (this.inkMaterial) this.inkMaterial.uniforms.gpuDisplacement.value = this.gpuDisplacementActive() ? 1 : 0;
    if (!this.gpuDisplacementActive()) this.resyncLegacyAttributes();
    this.syncGradientPacking();
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
    const writeFire = this.fireEnabled && options.fire === true;
    const writeColor = writeType || writeFire;
    if (!writeHeight && !writeColor) return;
    const { position, color } = this.geometry.attributes, w = this.world;
    const gpu = this.gpuDisplacementActive();
    if (!gpu) this.resyncLegacyAttributes();
    // GPU 位移时：顶点 Y 仍写 CPU 数组（射线拾取的真相），顶点色整段跳过；两者都不上传。
    const writeColorCpu = writeColor && !gpu;
    if (gpu) this.syncGradientPacking();
    // GPU 模式：先写纹理（G = ElevationField.node()），CPU 顶点 Y 直接拷 G，免去第二次求值。
    const gpuHeights = gpu && writeHeight ? (this.artData.update(region, options), this.artData.heights) : null;
    const posArr = position.array;
    let cpuHeightChanged = false;
    for (let y = region.y0; y <= region.y1; y++) {
      if (gpuHeights && !writeColorCpu) {
        for (let x = region.x0, i = y * w.w + x; x <= region.x1; x++, i++) {
          const value = gpuHeights[i * 4 + 1], offset = i * 3 + 1;
          if (posArr[offset] !== value) { posArr[offset] = value; cpuHeightChanged = true; }
        }
        continue;
      }
      let rowHeightChanged = false;
      for (let x = region.x0; x <= region.x1; x++) {
        const i = y * w.w + x;
        if (writeHeight) {
          const value = gpuHeights ? gpuHeights[i * 4 + 1] : Math.fround(this.elevation.node(x, y));
          if (posArr[i * 3 + 1] !== value) { posArr[i * 3 + 1] = value; cpuHeightChanged = true; rowHeightChanged = true; }
        }
        if (writeColorCpu) {
          const c = this.palette[w.type[i]] || this.palette[5];
          const fire = this.fireEnabled ? w.fire[i] : 0;
          if (fire > 0.02) {
            const heat = Math.min(1, fire * 1.15), mix = heat * 0.86;
            color.setXYZ(i, c.r * (1 - mix) + mix,
              c.g * (1 - mix) + (214 - heat * 70) / 255 * mix,
              c.b * (1 - mix) + (120 - heat * 90) / 255 * mix);
          } else color.setXYZ(i, c.r, c.g, c.b);
        }
      }
      const start = (y * w.w + region.x0) * 3, count = (region.x1 - region.x0 + 1) * 3;
      if (writeHeight && !gpu && rowHeightChanged) position.addUpdateRange(start, count);
      if (writeColorCpu) color.addUpdateRange(start, count);
    }
    const rows = region.y1 - region.y0 + 1;
    if (writeHeight && gpu) { this.legacyStale.position ||= cpuHeightChanged; this.stats.skippedPositionRows += rows; }
    if (writeColor && gpu) { this.legacyStale.color = true; this.stats.skippedColorRows += rows; }
    if (writeHeight) {
      if (cpuHeightChanged) {
        this.cpuHeightVersion++; this.geometry.userData.cpuHeightVersion = this.cpuHeightVersion;
        if (!gpu) position.needsUpdate = true;
      }
      if (adaptiveTopology(w)) {
        let changed=false;this.flipSpans=null;const full=this.fullIndices,qw=w.w-1;
        for(let y=Math.max(0,region.y0-1);y<=Math.min(w.h-2,region.y1);y++)for(let x=Math.max(0,region.x0-1);x<=Math.min(w.w-2,region.x1);x++){
          const a=y*w.w+x,b=a+1,c=a+w.w,d=c+1,o=(y*qw+x)*6,ad=diagonalAD(w,x,y);
          // The third corner distinguishes both valid index patterns; unchanged topology is never re-uploaded.
          if(full[o+2]===(ad?d:b))continue;
          const spans=(this.flipSpans||=[]),last=spans[spans.length-1];
          // 同行合并；跨行间隙 < 4096 个索引（16 KB）也合并，用少量多传换更少的 bufferSubData 调用。
          if(last&&(last[2]===y||o-last[1]<4096)){last[1]=o+6;last[2]=y;}else spans.push([o,o+6,y]);
          full[o]=a;full[o+1]=c;full[o+2]=ad?d:b;full[o+3]=ad?a:b;full[o+4]=ad?d:c;full[o+5]=ad?b:d;changed=true;
        }
        if(changed){this.stats.topologyFlips++;this.stats.indexUploads++;}
        const unmasked=!this.regionGeometry||this.regionGeometry.allInside;
        if(changed&&terrainGpuConfig.partialIndexUpload&&unmasked&&this.flipSpans){
          // G5：无视界遮罩时索引与 fullIndices 一一对应 ⇒ 只上传翻转 quad 所在行的最小跨度。
          const index=this.geometry.index,arr=index.array;
          for(const [o0,o1] of this.flipSpans){arr.set(full.subarray(o0,o1),o0);index.addUpdateRange(o0,o1-o0);this.stats.indexBytes=(this.stats.indexBytes||0)+(o1-o0)*4;}
          index.needsUpdate=true;this.geometry.setDrawRange(0,full.length);this.keptQuads=full.length/6;
        } else if(changed){this.keptQuads=applyQuadMask({geometry:this.geometry,fullIndices:full,
          regionGeometry:this.regionGeometry,inside:this.regionInside,quadW:qw,quadH:w.h-1});this.stats.indexBytes=(this.stats.indexBytes||0)+this.geometry.index.array.byteLength;}
        this.flipSpans=null;
      }
    }
    if (writeColorCpu) color.needsUpdate = true;
    // The existing dirty channels are also the only GPU snapshot update source.
    // Disabled art does not collect unbounded upload ranges; re-enable performs a full sync.
    if (this.artProfile && !gpuHeights) this.artData.update(region, options);
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
