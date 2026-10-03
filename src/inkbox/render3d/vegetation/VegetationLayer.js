import * as THREE from 'three';
import { ElevationField } from '../terrain/ElevationField.js';
import { deriveVegetation } from './deriveVegetation.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';
import { createTreePilot } from '../art/PilotAssets.js';
import { createPilotMaterial, updatePilotMaterial, setPilotView } from '../art/PilotMaterial.js';

function pixelTree() {
  const data = new Uint8Array(16 * 24 * 4);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) {
    const trunk = y < 8 && x >= 7 && x <= 8;
    const width = y >= 6 ? Math.max(0, 7 - Math.floor((y - 6) / 3)) : -1;
    const leaf = y >= 6 && Math.abs(x - 7.5) < width;
    if (trunk || leaf) {
      const color = trunk ? [100, 80, 54] : (x + y) % 4 === 0 ? [111, 136, 86] : x < 8 ? [62, 88, 64] : [81, 108, 74];
      data.set([...color, 255], (y * 16 + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, 16, 24);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  return texture;
}

/**
 * 植被实例层。
 *
 * M2-B §8：贴地高度走 `stage.elevation.at()`。
 * M2-B §22：Region 过滤**只在 Region identity 变化或真实 veg/type dirty 时重建**，
 * 禁止每帧全量重写实例（过滤逻辑见 B1，本文件只提供重建入口）。
 */
export class VegetationLayer {
  constructor(world, coordinates, elevation = new ElevationField(world)) {
    this.world = world; this.coordinates = coordinates; this.elevation = elevation;
    this.regionGeometry = null;
    this.regionInside = true;
    this.pendingRegionRebuild = false;
    this.artProfile = null;
    this.pilotGeometry = null; this.pilotMaterial = null;
    this.texture = pixelTree();
    this.geometry = new THREE.PlaneGeometry(1, 1.5); this.geometry.translate(0, 0.75, 0);
    this.material = new THREE.MeshLambertMaterial({ map: this.texture, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, 20000);
    this.mesh.renderOrder = RENDER_ORDER.vegetation;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.update();
  }

  setArtProfile(profile) {
    const changed = !!this.artProfile !== !!profile;
    this.artProfile = profile || null;
    if (profile && !this.pilotGeometry) {
      this.pilotGeometry = createTreePilot();
      this.pilotMaterial = createPilotMaterial(profile, 1.5);
    }
    if (profile) updatePilotMaterial(this.pilotMaterial, profile);
    this.mesh.geometry = profile ? this.pilotGeometry : this.geometry;
    this.mesh.material = profile ? this.pilotMaterial : this.material;
    this.mesh.boundingBox = null; this.mesh.boundingSphere = null;
    if (changed) this.update();
  }

  setArtView(view) { if (this.pilotMaterial) setPilotView(this.pilotMaterial, view); }
  /**
   * §19：区域判据只来自 `RegionGeometry`。
   * §22：这里**只登记**「需要重建」，真正的重建交给 `PlaneStage.update()` 的
   * 节流通道（0.15 s）——禁止每帧全量重写实例。
   */
  setRegionGeometry(geometry, inside = true) {
    if (this.regionGeometry === geometry && this.regionInside === !!inside) return;
    this.regionGeometry = geometry || null;
    this.regionInside = !!inside;
    this.pendingRegionRebuild = true;
  }

  update() {
    const all = deriveVegetation(this.world);
    // 只在重建时过滤（本方法由节流通道调用，不是每帧）。
    this.trees = this.regionGeometry && !this.regionGeometry.allInside
      ? all.filter(tree => this.regionGeometry.isInsideCell(tree.x, tree.y) === this.regionInside)
      : all;
    this.pendingRegionRebuild = false;
    const dummy = new THREE.Object3D();
    let j = 0;
    for (const tree of this.trees) {
      const p = this.coordinates.worldToRender(tree.x, tree.y, this.elevation.at(tree.x, tree.y));
      dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(tree.size);
      // The opaque volume needs one real submission; baseline retains its cross cards.
      for (let side = 0; side < (this.artProfile ? 1 : 2); side++) {
        dummy.scale.setScalar(tree.size);
        dummy.rotation.y = tree.rotation + side * Math.PI / 2;
        dummy.updateMatrix(); this.mesh.setMatrixAt(j++, dummy.matrix);
      }
    }
    this.mesh.count = j; this.mesh.instanceMatrix.needsUpdate = true;
    const triangles = (this.mesh.geometry.index?.count ?? this.mesh.geometry.getAttribute('position').count) / 3;
    this.stats = { trees: this.trees.length, instances: j, triangles: j * triangles };
  }
  dispose() {
    this.mesh.dispose(); this.geometry.dispose(); this.material.dispose(); this.texture.dispose();
    this.pilotGeometry?.dispose(); this.pilotMaterial?.dispose();
  }
}
