import * as THREE from 'three';
import { ElevationField } from '../terrain/ElevationField.js';
import { deriveVegetation } from './deriveVegetation.js';
import { TREE_VARIANT_SCALES, treeVariantIndex } from './treeVariation.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';
import { createPilotMaterial, updatePilotMaterial, setPilotView } from '../art/PilotMaterial.js';
import { createTreeLODBatches } from '../lod/TreeLODAssets.js';
import { createShanhaiTreeLODs, createShanhaiTreeMaterial, setShanhaiTreeView } from '../shanhai/ShanhaiFlora.js';
import { chooseLOD, LOD_BUDGETS, projectedPixels } from '../lod/PresentationBudget.js';

// Projected orthographic bounds of a bucket's tree-top AABB. The six
// comparisons are conservative: an entire bucket is classified only when
// every tree center is provably inside or outside the existing NDC margin.
function axisMin(m, i, b) {
  return m[i + 12]
    + m[i] * (m[i] >= 0 ? b.minX : b.maxX)
    + m[i + 4] * (m[i + 4] >= 0 ? b.minY : b.maxY)
    + m[i + 8] * (m[i + 8] >= 0 ? b.minZ : b.maxZ);
}
function axisMax(m, i, b) {
  return m[i + 12]
    + m[i] * (m[i] >= 0 ? b.maxX : b.minX)
    + m[i + 4] * (m[i + 4] >= 0 ? b.maxY : b.minY)
    + m[i + 8] * (m[i + 8] >= 0 ? b.maxZ : b.minZ);
}

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
    this._projectionMatrix = new THREE.Matrix4();
    this._projectionSource = null; this._projectionBuckets = [];
    this._projectionCenters = null; this._projectionFlags = null;
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
      overflow: 0, capacityOverflow: 0, derivations: 0, groundPasses: 0,
      groundSamples: 0, groundInstancesWritten: 0, groundUploadMarks: 0 };
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
    const shanhai = !!profile?.realmStyle?.shanhai;
    if (shanhai && !this.shanhaiFlora) {
      const plane = this.world.plane || 'mortal';
      this.shanhaiFlora = { geometries: createShanhaiTreeLODs(), material: createShanhaiTreeMaterial(plane), ink: createShanhaiTreeMaterial(plane, { outline: true }), outlines: [] };
      const lod = 0, src = this.lodMeshes[lod];
      const ink = new THREE.InstancedMesh(this.shanhaiFlora.geometries[lod], this.shanhaiFlora.ink, src.instanceMatrix.count);
      ink.instanceMatrix = src.instanceMatrix; ink.frustumCulled = false; ink.count = 0; ink.visible = false;
      ink.raycast = () => {}; ink.userData.presentationOnly = true; ink.userData.inkOutline = true; ink.name = `${src.name || 'VegetationLOD0'}:ink`;
      ink.renderOrder = src.renderOrder; src.add(ink); this.shanhaiFlora.outlines[lod] = ink;
    }
    this.shanhaiActive = shanhai;
    this.mesh.geometry = shanhai ? this.shanhaiFlora.geometries[0] : profile ? this.pilotGeometry : this.geometry;
    this.mesh.material = shanhai ? this.shanhaiFlora.material : profile ? this.pilotMaterial : this.material;
    for (let lod = 1; lod <= 2; lod++) {
      this.lodMeshes[lod].geometry = shanhai ? this.shanhaiFlora.geometries[lod] : this.lodGeometries[lod];
      this.lodMeshes[lod].material = shanhai ? this.shanhaiFlora.material : profile ? this.pilotMaterial : this.material;
    }
    this._syncFloraOutlines();
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
    if (this.shanhaiFlora) { setShanhaiTreeView(this.shanhaiFlora.material, this.artView); setShanhaiTreeView(this.shanhaiFlora.ink, this.artView); }
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
    this.stats.derivations++;
    const all = deriveVegetation(this.world);
    // 只在重建时过滤（本方法由节流通道调用，不是每帧）。
    this.trees = this.regionGeometry && !this.regionGeometry.allInside
      ? all.filter(tree => this.regionGeometry.isInsideCell(tree.x, tree.y) === this.regionInside)
      : all;
    this.pendingRegionRebuild = false;
    this._projectionSource = null; // Membership and Region masks replace derived trees.
    this._reassignAndUpload(true);
  }

  // A tree's fractional anchor samples the four surrounding terrain nodes.
  // Keep membership, LOD, colors and matrix rotation/scale intact on ground edits.
  updateGround(region = null) {
    // Heights can shift tree centers without changing membership. Rebuild
    // conservative bucket bounds on the next camera-driven LOD pass.
    this._projectionSource = null;
    const changedMeshes = [false, false, false];
    const s = this.stats; s.groundPasses++;
    let writes = 0;
    const varied = this.artProfile?.realmStyle?.plane === 'mortal';
    // Ground height uses the anchor's 2x2 nodes, while cliff detection samples
    // four points another 0.8 cell away. Include that one-node halo so a
    // single-node dirty region cannot miss a neighboring cliff transition.
    const cliffHalo = this.shanhaiActive ? 1 : 0;
    for (const tree of this.trees) {
      const x = Math.min(this.world.w - 2, Math.floor(tree.x));
      const y = Math.min(this.world.h - 2, Math.floor(tree.y));
      if (region && (x > region.x1 + cliffHalo || x + 1 < region.x0 - cliffHalo ||
          y > region.y1 + cliffHalo || y + 1 < region.y0 - cliffHalo)) continue;
      s.groundSamples++;
      const cliffHidden = this.shanhaiActive ? this._onCliff(tree) : false;
      const cliffChanged = cliffHidden !== !!tree.cliffHidden;
      const p = this.coordinates.worldToRender(tree.x, tree.y, this.elevation.at(tree.x, tree.y));
      const nextY = Math.fround(p.y);
      const lod = tree.renderLod, mesh = this.lodMeshes[lod], attribute = mesh.instanceMatrix;
      if (cliffChanged) {
        tree.cliffHidden = cliffHidden;
        const variant = varied ? treeVariantIndex(this.world.seed, tree.cell) : 0;
        for (let side = 0; side < tree.renderCount; side++) {
          const index = tree.renderIndex + side;
          mesh.setMatrixAt(index, this._treeMatrix(tree, p, variant, side));
          attribute.addUpdateRange(index * 16, 16);
          changedMeshes[lod] = true; writes++;
        }
        continue;
      }
      for (let side = 0; side < tree.renderCount; side++) {
        const offset = (tree.renderIndex + side) * 16 + 13;
        if (attribute.array[offset] === nextY) continue;
        attribute.array[offset] = nextY;
        attribute.addUpdateRange(offset, 1);
        changedMeshes[lod] = true; writes++;
      }
    }
    for (let lod = 0; lod < 3; lod++) if (changedMeshes[lod]) {
      const mesh = this.lodMeshes[lod];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingBox = null; mesh.boundingSphere = null;
      s.groundUploadMarks++;
    }
    s.groundInstancesWritten += writes;
    return writes;
  }

  _treeMatrix(tree, p, variant, side = 0) {
    const dummy = this._dummy;
    dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(tree.size);
    if (this.artProfile?.realmStyle?.plane === 'mortal') {
      const scale = TREE_VARIANT_SCALES[variant];
      dummy.scale.set(tree.size * scale[0], tree.size * scale[1], tree.size * scale[2]);
    }
    // Recompute from the source size on both cliff transitions; the hidden
    // 1e-5 scale cannot be inverted to recover the original variant/near size.
    if (tree.cliffHidden) dummy.scale.setScalar(1e-5);
    else if (this.shanhaiActive) {
      const near = this._structNear(tree);
      const k = near === 2 ? 1e-5 : near === 1 ? 0.52 : 0.78;
      dummy.scale.multiplyScalar(k);
    }
    dummy.rotation.y = tree.rotation + side * Math.PI / 2;
    dummy.updateMatrix();
    return dummy.matrix;
  }

  _onCliff(tree) {
    const e = this.elevation, x = tree.x, y = tree.y, c = e.at(x, y);
    const d = Math.max(Math.abs(e.at(x + 0.8, y) - c), Math.abs(e.at(x - 0.8, y) - c), Math.abs(e.at(x, y + 0.8) - c), Math.abs(e.at(x, y - 0.8) - c));
    return d > 3.2;
  }
  /** Scenery footprints (ShanhaiSceneryLayer) the forest yields to; presentation only. */
  setYieldZones(zones) {
    this.yieldZones = zones?.length ? zones : null;
    if (this.shanhaiActive && this.trees?.length) this._writeMatrices();
  }
  _structNear(tree) {
    const z = this.yieldZones;
    if (z) for (const q of z) { const d = Math.hypot(q.x - tree.x, q.y - tree.y); if (d < q.r) return 2; if (d < q.r + 1.4) return 1; }
    const st = this.world.struct; if (!st) return 0;
    const w = this.world.w, h = this.world.h, cx = Math.round(tree.x), cy = Math.round(tree.y);
    if (cx >= 0 && cy >= 0 && cx < w && cy < h && st[cy * w + cx]) return 2;
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (x >= 0 && y >= 0 && x < w && y < h && st[y * w + x]) return 1;
    return 0;
  }
  _syncFloraOutlines() {
    const f = this.shanhaiFlora; if (!f) return;
    const ink = f.outlines[0], src = this.lodMeshes[0]; if (!ink) return;
    ink.count = src.count; ink.visible = !!this.shanhaiActive && src.visible && src.count > 0;
    if (src.instanceColor && ink.instanceColor !== src.instanceColor) ink.instanceColor = src.instanceColor;
  }
  /** Enable opt-in CPU attribution for the forest LOD assignment path. */
  setLODProbeEnabled(enabled = true) {
    if (!enabled) { this.lodProbe = null; return null; }
    this.lodProbe = {
      calls: 0, matrixUploadCount: 0, matrixInstancesWritten: 0, matrixNeedsUpdateMarks: 0,
      concatTemporaryArrays: 0, concatTemporaryElements: 0, concatTemporaryElementsAvoided: 0,
      partitionElementsProcessed: 0, renderTreesArraysAllocated: 0,
      exactTreeProjections: 0, bucketClassifiedTrees: 0, last: null,
    };
    return this.lodProbe;
  }

  // Rebuilt only on changed membership, source array or ground heights.
  // These positions exactly match the old per-tree projection center.
  _prepareProjectionBuckets() {
    const trees = this.trees;
    if (this._projectionSource === trees && this._projectionCenters?.length === trees.length * 3) return;
    const centers = new Float64Array(trees.length * 3), bins = new Map();
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i], p = this.coordinates.worldToRender(t.x, t.y, this.elevation.at(t.x, t.y));
      const x = p.x, y = p.y + t.size * .75, z = p.z, k = i * 3;
      centers[k] = x; centers[k + 1] = y; centers[k + 2] = z;
      const key = `${Math.floor(t.x / 32)}:${Math.floor(t.y / 32)}`;
      let b = bins.get(key);
      if (!b) {
        b = { indices: [], minX: x, maxX: x, minY: y, maxY: y, minZ: z, maxZ: z };
        bins.set(key, b);
      }
      b.indices.push(i);
      b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x);
      b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y);
      b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z);
    }
    this._projectionSource = trees;
    this._projectionBuckets = [...bins.values()];
    this._projectionCenters = centers;
    this._projectionFlags = new Uint8Array(trees.length);
  }

  // Retain the original two stable source-order partitions. An orthographic
  // bucket wholly inside/outside ±1.1 NDC needs no individual projection;
  // crossing buckets use the original exact .project(camera) test.
  _partitionBudgetTrees() {
    const trees = this.trees, camera = this.artView.camera;
    const visible = this._visibleBudgetTrees, outside = this._outsideBudgetTrees;
    visible.length = 0; outside.length = 0;
    let exactTreeProjections = 0, bucketClassifiedTrees = 0;
    if (camera.isOrthographicCamera) {
      this._prepareProjectionBuckets();
      const m = this._projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
      const flags = this._projectionFlags, centers = this._projectionCenters;
      for (const b of this._projectionBuckets) {
        const minX = axisMin(m, 0, b), maxX = axisMax(m, 0, b);
        const minY = axisMin(m, 1, b), maxY = axisMax(m, 1, b);
        const minZ = axisMin(m, 2, b), maxZ = axisMax(m, 2, b);
        // Small guard keeps floating-point roundoff near ±1.1 on the exact
        // per-tree path rather than incorrectly classifying a whole bucket.
        const lo = -1.1 + 1e-9, hi = 1.1 - 1e-9;
        const allInside = minX >= lo && maxX <= hi
          && minY >= lo && maxY <= hi && minZ >= lo && maxZ <= hi;
        const allOutside = maxX < -1.1 - 1e-9 || minX > 1.1 + 1e-9
          || maxY < -1.1 - 1e-9 || minY > 1.1 + 1e-9 || maxZ < -1.1 - 1e-9;
        if (allInside || allOutside) {
          for (const i of b.indices) flags[i] = allInside ? 1 : 0;
          bucketClassifiedTrees += b.indices.length;
        } else {
          for (const i of b.indices) {
            const k = i * 3;
            this._projectPoint.set(centers[k], centers[k + 1], centers[k + 2]).project(camera);
            const { x, y, z } = this._projectPoint;
            flags[i] = Math.abs(x) <= 1.1 && Math.abs(y) <= 1.1 && Math.abs(z) <= 1.1 ? 1 : 0;
            exactTreeProjections++;
          }
        }
      }
      // Bucket iteration is spatial, but budget order MUST remain source order.
      for (let i = 0; i < trees.length; i++) (flags[i] ? visible : outside).push(trees[i]);
    } else {
      // Do not approximate perspective projection; preserve the former path.
      for (const tree of trees) {
        const p = this.coordinates.worldToRender(tree.x, tree.y, this.elevation.at(tree.x, tree.y));
        this._projectPoint.set(p.x, p.y + tree.size * .75, p.z).project(camera);
        const { x, y, z } = this._projectPoint;
        (Math.abs(x) <= 1.1 && Math.abs(y) <= 1.1 && Math.abs(z) <= 1.1 ? visible : outside).push(tree);
        exactTreeProjections++;
      }
    }
    return { exactTreeProjections, bucketClassifiedTrees };
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
    let partitioned = false, projectionWork = null;
    const partitionStart = probe ? performance.now() : 0;
    if (this._budgetCrowded && this.artView.camera) {
      // Scarce near-detail slots belong to the visible forest first. Source
      // ordering must not consume the budget in an off-screen map corner.
      projectionWork = this._partitionBudgetTrees();
      // A moving crowded camera now precisely projects only boundary buckets;
      // fully inside/outside buckets retain identical source-order priority.
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
          // Identical rules to budgetLOD('tree'), without one temporary
          // result object (and category normalization) for every tree.
          lod = desired;
          if (lod === 0 && this._lodCounts[0] >= budget.lod0) lod = 1;
          if (lod === 1 && this._lodCounts[1] >= budget.lod1) lod = 2;
          this._lodCounts[lod]++;
          if (lod !== desired) this._budgetDemotions++;
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
      probe.exactTreeProjections += projectionWork?.exactTreeProjections || 0;
      probe.bucketClassifiedTrees += projectionWork?.bucketClassifiedTrees || 0;
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
        exactTreeProjections: projectionWork?.exactTreeProjections || 0,
        bucketClassifiedTrees: projectionWork?.bucketClassifiedTrees || 0,
        projectionBuckets: this._projectionBuckets.length,
      };
    }
  }

  _writeMatrices() {
    const counts = this._batchCounts;
    const varied = this.artProfile?.realmStyle?.plane === 'mortal';
    this._variantCounts.fill(0);
    let matrixInstancesWritten = 0;
    counts.fill(0);
    for (const mesh of this.lodMeshes) mesh.userData.renderTrees = [];
    for (const tree of this.trees) {
      const lod = this._lodByTree.get(tree.cell) ?? 0;
      const p = this.coordinates.worldToRender(tree.x, tree.y, this.elevation.at(tree.x, tree.y));
      tree.cliffHidden = this.shanhaiActive ? this._onCliff(tree) : false;
      const variant = varied ? treeVariantIndex(this.world.seed, tree.cell) : 0;
      this._variantCounts[variant]++;
      const tint = varied ? this._variantTints[variant] : this._whiteTint;
      const target = this.lodMeshes[lod];
      tree.renderLod = lod; tree.renderIndex = counts[lod];
      tree.renderCount = lod === 0 && !this.artProfile ? 2 : 1;
      if (lod === 0 && !this.artProfile) {
        for (let side = 0; side < 2; side++) {
          target.setColorAt(counts[lod], tint); target.setMatrixAt(counts[lod]++, this._treeMatrix(tree, p, variant, side)); matrixInstancesWritten++;
          target.userData.renderTrees.push(tree);
        }
      } else {
        target.setColorAt(counts[lod], tint); target.setMatrixAt(counts[lod]++, this._treeMatrix(tree, p, variant)); matrixInstancesWritten++;
        target.userData.renderTrees.push(tree);
      }
    }
    for (let lod = 0; lod < 3; lod++) {
      const mesh = this.lodMeshes[lod];
      // A full rewrite must supersede any still-pending sparse ground uploads.
      mesh.instanceMatrix.clearUpdateRanges();
      if (counts[lod]) mesh.instanceMatrix.addUpdateRange(0, counts[lod] * 16);
      mesh.count = counts[lod]; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.boundingBox = null; mesh.boundingSphere = null;
      mesh.visible = counts[lod] > 0;
    }
    this._syncFloraOutlines();
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
    if (this.shanhaiFlora) { for (const ink of this.shanhaiFlora.outlines) { ink?.removeFromParent(); ink?.dispose(); } for (const g of this.shanhaiFlora.geometries) g.dispose(); this.shanhaiFlora.material.dispose(); this.shanhaiFlora.ink.dispose(); this.shanhaiFlora = null; }
    for (let lod = 1; lod <= 2; lod++) this.lodMeshes[lod].dispose();
    for (const geometry of this.lodGeometries) geometry.dispose();
  }
}
