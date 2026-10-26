import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { realmStyleFor } from '../src/inkbox/render3d/art/RealmStyleProfile.js';
import { shanhaiStyleFor } from '../src/inkbox/render3d/shanhai/ShanhaiStyle.js';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';
import { deriveVegetation } from '../src/inkbox/render3d/vegetation/deriveVegetation.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { VegetationLayer } from '../src/inkbox/render3d/vegetation/VegetationLayer.js';
import { PlanePicker } from '../src/inkbox/render3d/picking/PlanePicker.js';
import { Render3DAdapter } from '../src/inkbox/render3d/Render3DAdapter.js';
import { PlaneStage } from '../src/inkbox/render3d/stage/PlaneStage.js';

const world = generateWorld({ preset: { w: 96, h: 72 }, seed: 701, scatter: true });
world.height.fill(.8); world.water.fill(0); world.veg.fill(1);
world.generation = { ...world.generation, version: 2 };
const worldDigest = () => createHash('sha256').update(JSON.stringify(world)).digest('hex');
const digestBeforeRender = worldDigest();
const coordinates = {
  worldToRender: (x, y, elevation = 0) => ({ x: x - (world.w - 1) / 2, y: elevation, z: y - (world.h - 1) / 2 }),
  renderToWorld: (x, z) => ({ x: x + (world.w - 1) / 2, y: z + (world.h - 1) / 2 }),
  renderPointToCell: point => ({ x: Math.floor(point.x + (world.w - 1) / 2), y: Math.floor(point.z + (world.h - 1) / 2) }),
};
const elevation = new ElevationField(world);
const legacy = new VegetationLayer(world, coordinates, elevation, { forestCull: false });
const spatial = new VegetationLayer(world, coordinates, elevation, { forestCull: true });
const style = { paperColor: '#f5f2ea', realmStyle: realmStyleFor('mortal') };
const shanhaiProfile = { paperColor: '#f5f2ea', realmStyle: shanhaiStyleFor('mortal') };
const camera = new THREE.OrthographicCamera(-10, 10, 8, -8, .1, 400);
camera.position.set(0, 100, 100); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
const view = { pixelsPerUnit: 4, verticalPixelsPerUnit: 4, width: 800, height: 640, camera };
for (const layer of [legacy, spatial]) {
  layer.setArtProfile(style); layer.setLODEnabled(true); layer.setArtView(view);
}

const identityMap = layer => new Map(layer.trees.map(tree => [tree.cell, tree.renderLod]));
const ids = layer => layer.trees.map(tree => tree.cell);
const sameAssignments = () => {
  assert.deepEqual(ids(spatial), ids(legacy), 'old and spatial paths keep the same ordered tree identities');
  assert.deepEqual(identityMap(spatial), identityMap(legacy), 'global LOD assignments match across paths');
  assert.deepEqual(spatial.stats.lod, legacy.stats.lod, 'global LOD quotas and demotions match');
};

function assertPartitionContainsGeometry(tree, label) {
  const mesh = tree.renderMesh, geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = tree.renderPartition.bounds, matrix = new THREE.Matrix4(), vertex = new THREE.Vector3();
  const outline = mesh.material.uniforms?.uOutlineWidth?.value;
  for (let side = 0; side < tree.renderCount; side++) {
    mesh.getMatrixAt(tree.renderIndex + side, matrix);
    for (let corner = 0; corner < 8; corner++) {
      vertex.set(corner & 1 ? geometry.boundingBox.max.x : geometry.boundingBox.min.x,
        corner & 2 ? geometry.boundingBox.max.y : geometry.boundingBox.min.y,
        corner & 4 ? geometry.boundingBox.max.z : geometry.boundingBox.min.z);
      if (outline != null) {
        // Independent vertex-envelope check of the two shader displacements.
        vertex.x = (vertex.x + (corner & 1 ? 1 : -1) * outline * 1.6) * 1.35;
        vertex.y = (vertex.y + (corner & 2 ? 1 : -1) * outline * 1.6) * 1.12;
        vertex.z = (vertex.z + (corner & 4 ? 1 : -1) * outline * 1.6) * 1.35;
      }
      vertex.applyMatrix4(matrix);
      assert(box.containsPoint(vertex), `${label}: partition bound contains transformed geometry corner`);
    }
  }
}
assert.equal(spatial.spatialBatches, true);
assert.equal(legacy.spatialBatches, false);
sameAssignments();

for (const layer of [legacy, spatial]) layer.setLODEnabled(false);
sameAssignments();
assert(spatial.trees.every(tree => tree.renderLod === 0), 'LOD off assigns every tree to the base model');
for (const layer of [legacy, spatial]) layer.setLODEnabled(true);
sameAssignments();

spatial.updateSpatialVisibility(camera);
const initialPickMeshes = spatial.getPickMeshes();
assert(initialPickMeshes.length > 0, 'camera sees at least one active spatial vegetation mesh');
assert(spatial.spatialStats.visiblePartitions > 0);
assert(spatial.spatialStats.visiblePartitions < spatial.spatialStats.partitions, 'off-screen forest partitions are culled');
assert(spatial.spatialStats.submittedInstances > 0);
assert(spatial.spatialStats.submittedInstances < spatial.stats.instances, 'culled partitions stop submitting instances');
assert(spatial.trees.every(tree => tree.renderMesh && Number.isInteger(tree.renderIndex)), 'trees expose their actual batch and local slot');
const visibleTree = spatial.trees.find(tree => initialPickMeshes.includes(tree.renderMesh));
assert(visibleTree, 'a near-view tree remains represented in visible batches');
const initialRevision = spatial.pickRevision;

// Camera-only visibility changes must not rewrite instance matrices. Moving away hides
// the previous batch; restoring the original view makes its real instances pickable again.
const writes = spatial.spatialStats.matrixWrites, uploads = spatial.spatialStats.uploadMarks;
spatial.updateSpatialVisibility(camera);
assert.equal(spatial.spatialStats.matrixWrites, writes);
assert.equal(spatial.spatialStats.uploadMarks, uploads);
const savedPosition = camera.position.clone();
camera.position.set(0, 100, -250); camera.lookAt(0, 0, -250); camera.updateMatrixWorld(true);
spatial.updateSpatialVisibility(camera);
const distantPickMeshes = spatial.getPickMeshes();
assert(!distantPickMeshes.includes(visibleTree.renderMesh), 'the former near-view batch is hidden after camera movement');
assert(spatial.pickRevision > initialRevision, 'visible-batch changes invalidate picking state');
camera.position.copy(savedPosition); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
spatial.updateSpatialVisibility(camera);
assert(spatial.getPickMeshes().includes(visibleTree.renderMesh), 'moving back restores the same visible batch');
sameAssignments();

// PlanePicker sees only visible opaque subjects; outline overlays are presentation-only.
const stage = { plane: 'mortal', world, visible: true, terrain: { mesh: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()) },
  coordinates, vegetation: spatial, root: new THREE.Group(), terrainSides: null };
const host = { scene: new THREE.Group(), cameraRig: { camera }, stages: new Map([['mortal', stage]]), boundary: null,
  world, coordinates, width: 800, height: 640 };
host.scene.add(stage.root); host.scene.add(stage.terrain.mesh); host.scene.add(spatial.group);
const picker = new PlanePicker(host), intersected = [], realIntersect = picker.raycaster.intersectObjects.bind(picker.raycaster);
picker.raycaster.intersectObjects = (objects, recursive) => { intersected.push(...objects); return realIntersect(objects, recursive); };
picker.pick(400, 320, 800, 640);
assert(!intersected.some(mesh => mesh.userData?.presentationOnly || mesh.userData?.inkOutline), 'picker excludes non-pickable outlines');
assert(initialPickMeshes.some(mesh => intersected.includes(mesh)), 'picker raycasts visible spatial vegetation subjects');
assert(!distantPickMeshes.some(mesh => intersected.includes(mesh)), 'picker never raycasts the hidden former near batch');

// hoverSignature is the adapter's real cache key path; unchanged state is stable,
// while an actual spatial visibility revision invalidates it.
const adapter = Object.create(Render3DAdapter.prototype);
adapter.renderer = host; adapter.width = 800; adapter.height = 640;
const signature = () => adapter.hoverSignature(400, 320).staticKey;
const hoverKey = signature();
assert.equal(signature(), hoverKey, 'unchanged spatial view preserves hover signature');
camera.position.set(0, 100, 250); camera.lookAt(0, 0, 250); camera.updateMatrixWorld(true);
spatial.updateSpatialVisibility(camera);
assert.notEqual(signature(), hoverKey, 'visibility revision changes hover signature');
camera.position.copy(savedPosition); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
spatial.updateSpatialVisibility(camera);

// An unchanged ground sample writes nothing. A local edit updates the tree's own
// batch slot while retaining identities and global LOD placement.
const tree = visibleTree, x = Math.floor(tree.x), y = Math.floor(tree.y), cell = y * world.w + x;
const matrix = new THREE.Matrix4(); tree.renderMesh.getMatrixAt(tree.renderIndex, matrix);
const beforeY = matrix.elements[13], beforeWrites = spatial.spatialStats.matrixWrites;
const unchangedGroundMarks = spatial.stats.groundUploadMarks;
spatial.updateGround({ x0: x, y0: y, x1: x, y1: y });
assert.equal(spatial.spatialStats.matrixWrites, beforeWrites, 'unchanged local ground height skips matrix writes');
assert.equal(spatial.stats.groundUploadMarks, unchangedGroundMarks, 'unchanged ground sample skips upload marks');
const originalHeight = world.height[cell];
world.height[cell] += .2;
spatial.updateGround({ x0: x, y0: y, x1: x, y1: y });
tree.renderMesh.getMatrixAt(tree.renderIndex, matrix);
assert.notEqual(matrix.elements[13], beforeY, 'local height edit moves the tree matrix in its partition');
assert(spatial.spatialStats.matrixWrites > beforeWrites);
assert(spatial.stats.groundUploadMarks > unchangedGroundMarks, 'changed ground sample counts the partition upload');
world.height[cell] = originalHeight;
spatial.updateGround({ x0: x, y0: y, x1: x, y1: y });
sameAssignments();

// With art profiles disabled, billboard trees occupy two real instance slots;
// both slots must receive a local ground translation and keep their yaw variants.
for (const layer of [legacy, spatial]) { layer.setArtProfile(null); layer.setLODEnabled(false); }
sameAssignments();
const billboard = spatial.trees.find(candidate => candidate.renderCount === 2);
assert(billboard, 'base vegetation path creates two billboard instances per tree');
const billboardMesh = billboard.renderMesh, billboardX = Math.floor(billboard.x), billboardY = Math.floor(billboard.y);
const billboardCell = billboardY * world.w + billboardX, billboardHeight = world.height[billboardCell];
const billboardMatrices = [new THREE.Matrix4(), new THREE.Matrix4()];
for (let side = 0; side < 2; side++) billboardMesh.getMatrixAt(billboard.renderIndex + side, billboardMatrices[side]);
const billboardBeforeY = billboardMatrices.map(item => item.elements[13]);
assert.notDeepEqual(billboardMatrices[0].elements.slice(0, 12), billboardMatrices[1].elements.slice(0, 12), 'billboard sides retain distinct rotations');
world.height[billboardCell] += .2;
spatial.updateGround({ x0: billboardX, y0: billboardY, x1: billboardX, y1: billboardY });
const expectedBillboardY = Math.fround(coordinates.worldToRender(billboard.x, billboard.y,
  elevation.at(billboard.x, billboard.y)).y);
for (let side = 0; side < 2; side++) {
  billboardMesh.getMatrixAt(billboard.renderIndex + side, billboardMatrices[side]);
  assert.notEqual(billboardMatrices[side].elements[13], billboardBeforeY[side], 'billboard ground change is reflected in each matrix slot');
  assert.equal(billboardMatrices[side].elements[13], expectedBillboardY, 'each billboard slot matches the sampled ground height');
}
assert.equal(billboardMatrices[0].elements[13], billboardMatrices[1].elements[13], 'both billboard slots share the updated ground height');
world.height[billboardCell] = billboardHeight;
spatial.updateGround({ x0: billboardX, y0: billboardY, x1: billboardX, y1: billboardY });
for (const layer of [legacy, spatial]) { layer.setArtProfile(style); layer.setLODEnabled(true); }
sameAssignments();

// Art profile changes preserve the forest and its global LOD map, including the
// Shanhai main/ink pair that shares the subject instance matrix.
for (const layer of [legacy, spatial]) { layer.setArtProfile(shanhaiProfile); layer.setLODEnabled(false); }
spatial.updateSpatialVisibility(camera);
sameAssignments();
let outlinePairs = 0;
for (const mesh of spatial.getPickMeshes()) {
  const outlines = mesh.children.filter(child => child.userData?.inkOutline);
  for (const outline of outlines) {
    outlinePairs++;
    assert.equal(outline.instanceMatrix, mesh.instanceMatrix, 'Shanhai ink outline shares its subject matrix buffer');
    assert.equal(outline.count, mesh.count, 'Shanhai outline instance count matches its subject');
  }
}
assert(outlinePairs > 0, 'visible LOD0 subjects have real Shanhai outline overlays');
const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
const instanceBox = new THREE.Box3(), instanceMatrix = new THREE.Matrix4();
for (const candidate of spatial.trees) {
  assertPartitionContainsGeometry(candidate, 'Shanhai scale, yaw and shader expansion');
  candidate.renderMesh.getMatrixAt(candidate.renderIndex, instanceMatrix);
  instanceBox.copy(candidate.renderMesh.geometry.boundingBox).applyMatrix4(instanceMatrix);
  if (frustum.intersectsBox(instanceBox)) assert(candidate.renderPartition.group.visible,
    'an in-frustum tree is never hidden by its partition');
}
const outlinedSubject = spatial.getPickMeshes().find(mesh => mesh.children.some(child => child.userData?.inkOutline));
const outlinedOverlay = outlinedSubject.children.find(child => child.userData?.inkOutline);
camera.position.set(0, 100, -250); camera.lookAt(0, 0, -250); camera.updateMatrixWorld(true);
intersected.length = 0;
picker.pick(400, 320, 800, 640);
assert(!intersected.includes(outlinedSubject) && !intersected.includes(outlinedOverlay),
  'a hidden partition parent excludes both its subject and outline from raycast candidates');
camera.position.copy(savedPosition); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
spatial.updateSpatialVisibility(camera);

// Cliff hide and restoration rewrite the existing local slots. The restored
// Shanhai batches must match a fresh layer configured from the same world.
const cliffTree = spatial.trees.find(item => !item.cliffHidden && item.x > 3 && item.y > 3
  && item.x < world.w - 3 && item.y < world.h - 3);
assert(cliffTree, 'cliff fixture has an interior Shanhai tree');
const cliffX = Math.floor(cliffTree.x), cliffY = Math.floor(cliffTree.y);
const cliffCell = cliffY * world.w + cliffX, cliffOldHeight = world.height[cliffCell];
const cliffBeforeY = cliffTree.renderY;
world.height[cliffCell] = cliffOldHeight + 20;
spatial.updateGround({ x0: cliffX, y0: cliffY, x1: cliffX, y1: cliffY });
assert.equal(cliffTree.cliffHidden, true, 'local steep terrain hides the tree');
assert(cliffTree.renderY > cliffBeforeY, 'the cliff fixture also raises the tree anchor');
assertPartitionContainsGeometry(cliffTree, 'raised cliff');
world.height[cliffCell] = cliffOldHeight;
spatial.updateGround({ x0: cliffX, y0: cliffY, x1: cliffX, y1: cliffY });
assert.equal(cliffTree.cliffHidden, false, 'restoring terrain restores the tree');
assertPartitionContainsGeometry(cliffTree, 'restored cliff');
const fresh = new VegetationLayer(world, coordinates, elevation, { forestCull: true });
fresh.setArtProfile(shanhaiProfile); fresh.setLODEnabled(false); fresh.setArtView(view);
assert.deepEqual(ids(fresh), ids(spatial), 'fresh matching Shanhai layer keeps restored identities');
const freshByCell = new Map(fresh.trees.map(candidate => [candidate.cell, candidate]));
for (const source of spatial.trees) {
  const match = freshByCell.get(source.cell);
  assert(match, `fresh layer includes cell ${source.cell}`);
  assert.equal(match.renderLod, source.renderLod);
  assert.equal(match.renderCount, source.renderCount);
  for (let side = 0; side < source.renderCount; side++) {
    const a = new THREE.Matrix4(), b = new THREE.Matrix4();
    source.renderMesh.getMatrixAt(source.renderIndex + side, a);
    match.renderMesh.getMatrixAt(match.renderIndex + side, b);
    assert.deepEqual(a.elements, b.elements, `cell ${source.cell} restored matrix matches fresh layer`);
  }
}
fresh.dispose();
for (const layer of [legacy, spatial]) { layer.setArtProfile(style); layer.setLODEnabled(true); }
sameAssignments();

assert.equal(worldDigest(), digestBeforeRender, 'render operations and restored terrain edits do not mutate World');
// Exercise production Stage ownership and all three profile defaults.
for (const plane of ['mortal', 'upper', 'nether']) {
  const realmWorld = plane === 'mortal' ? world : (plane === 'upper' ? generateUpperWorld : generateNetherWorld)({ preset: { w: 48, h: 32 }, seed: 701 });
  const realmStage = new PlaneStage({ plane, world: realmWorld, forestCull: true });
  if (plane !== 'mortal') assert.equal(realmStage.vegetation, null, `${plane} profile does not acquire mortal trees`);
  else assert.equal(realmStage.vegetation.spatialBatches, true, `${plane} receives the experimental flag`);
  const ownedLayer = realmStage.vegetation;
  realmStage.dispose();
  assert.equal(realmStage.root.children.length, 0);
  assert.equal(realmStage.world, null);
  if (ownedLayer) {
    assert.equal(ownedLayer.group.children.length, 0);
    assert.equal(ownedLayer.world, null, 'disposed experimental layer releases its World reference');
  }
}

// Region rebuilds must remove excluded trees and retain no stale spatial identity.
const mask = new RegionMask({ x0: 0, y0: 0, x1: 46, y1: world.h - 1, area: 47 * world.h });
spatial.setRegionGeometry({ allInside: false, isInsideCell: (px, py) => mask.contains(px, py) }); spatial.update();
assert(spatial.trees.every(item => item.x < world.w / 2));
assert.deepEqual(ids(spatial), deriveVegetation(world).filter(item => mask.contains(item.x, item.y)).map(item => item.cell));
assert.equal(spatial.spatialStats.partitions, new Set(spatial.trees.map(t => `${Math.floor(t.x / 64)}:${Math.floor(t.y / 64)}`)).size);
spatial.setRegionGeometry(null); spatial.update();
sameAssignments();

// Stage disposal uses the layer's actual owned group and removes partition meshes.
const ownedMeshes = [...spatial.group.children];
assert(ownedMeshes.length > 0);
spatial.dispose();
assert.equal(spatial.group.children.length, 0, 'dispose removes owned spatial batches and outlines from the group');
assert(ownedMeshes.every(mesh => !mesh.parent), 'disposed batch meshes have no remaining scene parent');
legacy.dispose();
stage.terrain.mesh.geometry.dispose(); stage.terrain.mesh.material.dispose();
console.log(JSON.stringify({ result: 'R3D-S1 finite CPU regression passed', trees: legacy.stats.trees,
  visiblePartitions: spatial.spatialStats.visiblePartitions, partitions: spatial.spatialStats.partitions,
  submittedInstances: spatial.spatialStats.submittedInstances, matrixWrites: spatial.spatialStats.matrixWrites,
  checks: 'identity/LOD, bounds, visibility, writes, picking/hover, billboard, cliff, outlines, masks, purity, three-realm Stage lifecycle' }));
