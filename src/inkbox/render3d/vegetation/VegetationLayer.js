import * as THREE from 'three';
import { ElevationField } from '../terrain/ElevationField.js';
import { deriveVegetation } from './deriveVegetation.js';
import { TREE_VARIANT_SCALES, treeVariantIndex } from './treeVariation.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';
import { createPilotMaterial, updatePilotMaterial, setPilotView } from '../art/PilotMaterial.js';
import { createTreeLODBatches } from '../lod/TreeLODAssets.js';
import { budgetLOD, chooseLOD, LOD_BUDGETS, projectedPixels } from '../lod/PresentationBudget.js';

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
    this.lodEnabled = false;
    this.artView = {};
    this._viewPpu = NaN; this._viewVerticalPpu = NaN;
    this._cameraMatrix = new Float64Array(16); this._cameraMatrix.fill(NaN);
    this._projectPoint = new THREE.Vector3();
    this._requestedLods = new Map(); this._visibleBudgetTrees = []; this._outsideBudgetTrees = [];
    this._budgetCrowded = false;
    this._lodByTree = new Map();
    this.lodGeometries = createTreeLODBatches();
    this.pilotGeometry = this.lodGeometries[0]; this.pilotMaterial = null;
    this._nextLodByTree = new Map();
    this._dummy = new THREE.Object3D();
    this._variantTints = Array.from({ length: 5 }, () => new THREE.Color('#ffffff'));
    this._whiteTint = new THREE.Color('#ffffff');
    this._variantCounts = [0, 0, 0, 0, 0];
    this._batchCounts = [0, 0, 0]; this._lodCounts = [0, 0, 0];
    this._budgetDemotions = 0;
    this.lodProbe = null;
    this.stats = { trees: 0, instances: 0, triangles: 0, lod: [0, 0, 0],
      lodCounts: { lod0: 0, lod1: 0, lod2: 0 }, lod0: 0, lod1: 0, lod2: 0,
      budgetDemotions: 0, capacity: LOD_BUDGETS.categories.tree.capacity,
      overflow: 0, capacityOverflow: 0 };
    this.texture = pixelTree();
    this.geometry = new THREE.PlaneGeometry(1, 1.5); this.geometry.translate(0, 0.75, 0);
    this.material = new THREE.MeshLambertMaterial({ map: this.texture, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, 20000);
    this.mesh.renderOrder = RENDER_ORDER.vegetation;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.name = 'VegetationLayer';
    this.group.add(this.mesh);
    this.mesh.userData.lod = 0;
    this.lodMeshes = [this.mesh, null, null];
    for (let lod = 1; lod <= 2; lod++) {
      const mesh = new THREE.InstancedMesh(this.lodGeometries[lod], this.material, 10000);
      mesh.name = `VegetationLOD${lod}`;
      mesh.userData.lod = lod;
      mesh.renderOrder = RENDER_ORDER.vegetation;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
      this.lodMeshes[lod] = mesh;
    }
    this.update();
  }

  setArtProfile(profile) {
    const nextProfile = profile || null;
    const changed = this.artProfile !== nextProfile;
    this.artProfile = nextProfile;
    const tints = profile?.realmStyle?.vegetation?.tints5;
    for (let i = 0; i < 5; i++) this._variantTints[i].set(tints?.[i] || '#ffffff');
    if (profile && !this.pilotMaterial) this.pilotMaterial = createPilotMaterial(profile, 1.5);
    if (profile) updatePilotMaterial(this.pilotMaterial, profile);
    this.mesh.geometry = profile ? this.pilotGeometry : this.geometry;
    this.mesh.material = profile ? this.pilotMaterial : this.material;
    for (let lod = 1; lod <= 2; lod++) this.lodMeshes[lod].material = profile ? this.pilotMaterial : this.material;
    this.mesh.boundingBox = null; this.mesh.boundingSphere = null;
    if (changed) this._reassignAndUpload(true);
  }

  setLODEnabled(enabled) {
    const next = !!enabled;
    if (next === this.lodEnabled) return;
    this.lodEnabled = next;
    this._reassignAndUpload(true);
  }

  setArtView(view = {}) {
    this.artView = view || {};
    if (this.pilotMaterial) setPilotView(this.pilotMaterial, this.artView);
    const ppu = Number.isFinite(this.artView.pixelsPerUnit) ? this.artView.pixelsPerUnit : 1;
    const verticalPpu = Number.isFinite(this.artView.verticalPixelsPerUnit) ? this.artView.verticalPixelsPerUnit : ppu;
    const scaleChanged = ppu !== this._viewPpu || verticalPpu !== this._viewVerticalPpu;
    const matrix = this.artView.camera?.matrixWorldInverse?.elements;
    let cameraChanged = false;
    if (matrix) for (let i = 0; i < 16; i++) {
      if (matrix[i] !== this._cameraMatrix[i]) cameraChanged = true;
      this._cameraMatrix[i] = matrix[i];
    }
    if (scaleChanged || (cameraChanged && this.artProfile && this.lodEnabled && this._budgetCrowded)) {
      this._viewPpu = ppu; this._viewVerticalPpu = verticalPpu;
      this._reassignAndUpload(false);
    }
  }
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
    this._reassignAndUpload(true);
  }

  /** Enable opt-in CPU attribution for the forest LOD assignment path. */
  setLODProbeEnabled(enabled = true) {
    if (!enabled) { this.lodProbe = null; return null; }
    this.lodProbe = {
      calls: 0, matrixUploadCount: 0, matrixInstancesWritten: 0, matrixNeedsUpdateMarks: 0,
      concatTemporaryArrays: 0, concatTemporaryElements: 0, concatTemporaryElementsAvoided: 0,
      partitionElementsProcessed: 0, renderTreesArraysAllocated: 0, last: null,
    };
    return this.lodProbe;
  }

  _reassignAndUpload(forceUpload) {
    if (!this.trees) return;
    const probe = this.lodProbe, totalStart = probe ? performance.now() : 0;
    const previous = this._lodByTree, nextStates = this._nextLodByTree;
    nextStates.clear(); this._lodCounts.fill(0); this._budgetDemotions = 0;
    const requested = this._requestedLods; requested.clear();
    const desiredCounts = [0, 0, 0], enabled = !!this.artProfile && this.lodEnabled;
    const desiredStart = probe ? performance.now() : 0;
    for (const tree of this.trees) {
      const px = projectedPixels(1.5 * tree.size, this.artView, 0.8 * tree.size);
      const desired = chooseLOD('tree', px, previous.get(tree.cell), enabled);
      requested.set(tree.cell, desired); desiredCounts[desired]++;
    }
    const projectionChooseLoopMs = probe ? performance.now() - desiredStart : 0;
    const budget = LOD_BUDGETS.categories.tree;
    this._budgetCrowded = enabled && (desiredCounts[0] > budget.lod0
      || desiredCounts[1] + Math.max(0, desiredCounts[0] - budget.lod0) > budget.lod1);
    let partitioned = false;
    const partitionStart = probe ? performance.now() : 0;
    if (this._budgetCrowded && this.artView.camera) {
      // Scarce near-detail slots belong to the visible forest first. Source
      // ordering must not consume the budget in an off-screen map corner.
      const visible = this._visibleBudgetTrees, outside = this._outsideBudgetTrees;
      visible.length = outside.length = 0;
      for (const tree of this.trees) {
        const p = this.coordinates.worldToRender(tree.x, tree.y, this.elevation.at(tree.x, tree.y));
        this._projectPoint.set(p.x, p.y + tree.size * .75, p.z).project(this.artView.camera);
        const { x, y, z } = this._projectPoint;
        (Math.abs(x) <= 1.1 && Math.abs(y) <= 1.1 && Math.abs(z) <= 1.1 ? visible : outside).push(tree);
      }
      // Linear, stable partition; stationary overview cameras do no projection
      // work, and a crowded moving view does not allocate/sort N entry objects.
      partitioned = true;
    }
    const crowdedPartitionMs = probe ? performance.now() - partitionStart : 0;
    const budgetStart = probe ? performance.now() : 0;
    for (let pass = 0; pass < (partitioned ? 2 : 1); pass++) {
      const ordered = partitioned ? (pass === 0 ? this._visibleBudgetTrees : this._outsideBudgetTrees) : this.trees;
      for (const tree of ordered) {
        let lod = 0;
        if (this.artProfile && this.lodEnabled) {
          const desired = requested.get(tree.cell);
          const budgetResult = budgetLOD('tree', desired, this._lodCounts);
          lod = budgetResult.lod;
          if (budgetResult.demoted) this._budgetDemotions++;
        } else this._lodCounts[0]++;
        nextStates.set(tree.cell, lod);
      }
    }
    const budgetAssignMs = probe ? performance.now() - budgetStart : 0;
    let changed = previous.size !== nextStates.size;
    if (!changed) for (const [cell, lod] of nextStates) if (previous.get(cell) !== lod) { changed = true; break; }
    this._lodByTree = nextStates; this._nextLodByTree = previous; this._nextLodByTree.clear();
    let matrixUploadMs = 0, matrixInstancesWritten = 0, uploaded = false;
    if (forceUpload || changed) {
      const uploadStart = probe ? performance.now() : 0;
      matrixInstancesWritten = this._writeMatrices(); uploaded = true;
      if (probe) matrixUploadMs = performance.now() - uploadStart;
    }
    this._updateStats();
    if (probe) {
      probe.calls++;
      const partitionElementsProcessed = partitioned ? this._visibleBudgetTrees.length + this._outsideBudgetTrees.length : 0;
      probe.partitionElementsProcessed += partitionElementsProcessed;
      probe.concatTemporaryElementsAvoided += partitionElementsProcessed;
      probe.renderTreesArraysAllocated += uploaded ? this.lodMeshes.length : 0;
      if (uploaded) {
        probe.matrixUploadCount++;
        probe.matrixInstancesWritten += matrixInstancesWritten;
        probe.matrixNeedsUpdateMarks += this.lodMeshes.length;
      }
      probe.last = {
        treeCount: this.trees.length, enabled, forceUpload: !!forceUpload, changed, uploaded,
        projectionChooseLoopMs, crowdedPartitionMs, budgetAssignMs, matrixUploadMs,
        totalReassignMs: performance.now() - totalStart,
        crowded: this._budgetCrowded, requestedLOD: [...desiredCounts], assignedLOD: [...this._lodCounts],
        budgetDemotions: this._budgetDemotions, concatTemporaryArrays: 0, concatTemporaryElements: 0,
        concatTemporaryElementsAvoided: partitionElementsProcessed, partitionElementsProcessed,
        matrixInstancesWritten, matrixNeedsUpdateMarks: uploaded ? this.lodMeshes.length : 0,
      };
    }
  }

  _writeMatrices() {
    const dummy = this._dummy, counts = this._batchCounts;
    const varied = this.artProfile?.realmStyle?.plane === 'mortal';
    this._variantCounts.fill(0);
    let matrixInstancesWritten = 0;
    counts.fill(0);
    for (const mesh of this.lodMeshes) mesh.userData.renderTrees = [];
    for (const tree of this.trees) {
      const lod = this._lodByTree.get(tree.cell) ?? 0;
      const p = this.coordinates.worldToRender(tree.x, tree.y, this.elevation.at(tree.x, tree.y));
      dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(tree.size);
      const variant = varied ? treeVariantIndex(this.world.seed, tree.cell) : 0;
      this._variantCounts[variant]++;
      if (varied) {
        const scale = TREE_VARIANT_SCALES[variant];
        dummy.scale.set(tree.size * scale[0], tree.size * scale[1], tree.size * scale[2]);
      }
      const tint = varied ? this._variantTints[variant] : this._whiteTint;
      const target = this.lodMeshes[lod];
      if (lod === 0 && !this.artProfile) {
        for (let side = 0; side < 2; side++) {
          dummy.rotation.y = tree.rotation + side * Math.PI / 2;
          dummy.updateMatrix(); target.setColorAt(counts[lod], tint); target.setMatrixAt(counts[lod]++, dummy.matrix); matrixInstancesWritten++;
          target.userData.renderTrees.push(tree);
        }
      } else {
        dummy.rotation.y = tree.rotation;
        dummy.updateMatrix(); target.setColorAt(counts[lod], tint); target.setMatrixAt(counts[lod]++, dummy.matrix); matrixInstancesWritten++;
        target.userData.renderTrees.push(tree);
      }
    }
    for (let lod = 0; lod < 3; lod++) {
      const mesh = this.lodMeshes[lod];
      mesh.count = counts[lod]; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.boundingBox = null; mesh.boundingSphere = null;
      mesh.visible = counts[lod] > 0;
    }
    return matrixInstancesWritten;
  }

  _updateStats() {
    const s = this.stats, lods = this._lodCounts, counts = this._batchCounts;
    let instances = 0, triangles = 0;
    for (let lod = 0; lod < 3; lod++) {
      const mesh = this.lodMeshes[lod];
      const vertexCount = mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count;
      triangles += counts[lod] * vertexCount / 3; instances += counts[lod];
      s.lod[lod] = lods[lod];
    }
    const capacity = LOD_BUDGETS.categories.tree.capacity;
    const overflow = Math.max(0, this.trees.length - capacity);
    s.trees = this.trees.length; s.instances = instances; s.triangles = triangles;
    s.variantCounts = this._variantCounts;
    s.variantMode = this.artProfile?.realmStyle?.plane === 'mortal';
    s.lod0 = s.lod[0]; s.lod1 = s.lod[1]; s.lod2 = s.lod[2];
    s.lodCounts.lod0 = s.lod[0]; s.lodCounts.lod1 = s.lod[1]; s.lodCounts.lod2 = s.lod[2];
    s.budgetDemotions = this._budgetDemotions; s.capacity = capacity;
    s.overflow = overflow; s.capacityOverflow = overflow;
  }
  dispose() {
    this.mesh.dispose(); this.geometry.dispose(); this.material.dispose(); this.texture.dispose();
    this.pilotMaterial?.dispose();
    for (let lod = 1; lod <= 2; lod++) this.lodMeshes[lod].dispose();
    for (const geometry of this.lodGeometries) geometry.dispose();
  }
}
