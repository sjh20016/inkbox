import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { deriveSettlements } from '../src/inkbox/render3d/settlements/SettlementLayer.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { Life } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { spawnNetherGhost } from '../src/inkbox/sim/netherLife.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'M2C2A1_HLOD_REPORT.md');
const results = [];
const digest = world => createHash('sha256').update(JSON.stringify(world)).digest('hex');
function check(name, fn) { fn(); results.push(name); console.log(`PASS ${name}`); }
function worldFor(seed = 930) {
  const preset = { w: 64, h: 48 }, world = generateWorld({ preset, seed, scatter: true });
  world.upper = generateUpperWorld({ preset, seed: world.seed });
  world.nether = generateNetherWorld({ preset, seed: world.seed });
  for (let i = 0; i < 30; i++) spawnNetherGhost(world.nether, { kind: 'ghost', decayYears: 10 });
  const deps = { life: new Life(world, mulberry32(world.seed ^ 0xa5a5a5a5)), upperLife: new UpperLife(world.upper),
    state: createAdvanceState(), rng: mulberry32(world.seed ^ 0x1a2b3c4d), nether: true, wraith: true, riftActive: true };
  for (let day = 0; day < 1440; day++) advanceWorld(world, 1, deps);
  assert(world.villages.some(village => village.houses?.length > 1), 'fixture requires real village houses');
  return world;
}
function hostFor(world) {
  const camera = new THREE.OrthographicCamera(-50, 50, 40, -40, 0.1, 2000);
  camera.position.set(0, 100, 100); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const gpu = { info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } },
    setPixelRatio() {}, setClearColor() {}, setSize() {}, render() {}, dispose() {} };
  const cameraRig = { camera, update() {}, resize() {}, setDimensions() {}, dispose() {}, focusOn() {} };
  const host = new Render3DHost({}, world, { gpu, cameraRig, characters: false, lodEnabled: true });
  host.resize(900, 600);
  return host;
}
function view(host, ppu) {
  const data = { pixelsPerUnit: ppu, verticalPixelsPerUnit: ppu, width: 900, height: 600, camera: host.cameraRig.camera };
  for (const stage of host.stages.values()) for (const layer of [stage.vegetation, stage.entities, stage.settlements]) layer?.setArtView(data);
}
function triangles(mesh) { return (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3; }

const world = worldFor(), before = digest(world), derived = deriveSettlements(world).buildings;
const host = hostFor(world);
let report;
try {
  host.setArtProfile('pilot'); host.update(0.3); view(host, 0.1); host.settlements.update(0.3, world); view(host, 0.1);
  const layer = host.settlements;
  check('cluster mode keeps one shared 12-triangle instanced geometry within four slots per settlement', () => {
    assert.equal(layer.hlodMode, 'cluster');
    assert.equal(triangles(layer.hlodCluster), 12);
    assert.equal(layer.hlodCluster.count <= 512 * 4, true);
    assert.equal(layer.hlodCluster.geometry, layer.hlodClusterGeometry);
    const entries = layer.hlodCluster.userData.renderSettlements;
    const bySettlement = new Map();
    for (const entry of entries) bySettlement.set(entry.settlementId, [...(bySettlement.get(entry.settlementId) || []), entry]);
    assert.equal(layer.stats.hlod, bySettlement.size, 'stats.hlod counts represented villages');
    assert.equal(layer.stats.hlodClusters, entries.length);
    assert.equal(layer.stats.hlodTriangles, entries.length * 12);
    for (const [settlementId, clusters] of bySettlement) {
      assert(clusters.length >= 2 && clusters.length <= 4, `settlement ${settlementId}: expected 2-4 roof groups`);
      assert(clusters.length * 12 >= 24 && clusters.length * 12 <= 48);
      const houses = derived.filter(building => building.type === 'house' && building.settlementId === settlementId);
      const ids = clusters.flatMap(cluster => cluster.members);
      assert.deepEqual([...ids].sort((a, b) => a - b), houses.map(house => house.sourceIndex).sort((a, b) => a - b),
        `settlement ${settlementId}: cluster membership must exactly cover real houses`);
      const settlementBuildings = derived.filter(building => (building.type === 'house' || building.type === 'center')
        && building.settlementId === settlementId);
      assert.deepEqual(clusters.flatMap(cluster => cluster.buildings).sort((a, b) => a - b),
        settlementBuildings.map(building => building.sourceIndex).sort((a, b) => a - b),
        `settlement ${settlementId}: cluster identities must also account for the real center building`);
    }
    report = { villages: layer.stats.hlod, clusters: layer.stats.hlodClusters, triangles: layer.stats.hlodTriangles,
      capacity: layer.hlodCluster.instanceMatrix.count, sharedGeometryTriangles: triangles(layer.hlodCluster) };
  });
  check('shared cluster roof faces point outward and remain raycastable from above', () => {
    const geometry = layer.hlodClusterGeometry, positions = geometry.attributes.position, normals = geometry.attributes.normal;
    for (let i = 0; i < positions.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(positions, i);
      const b = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
      const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      assert(normal.dot(new THREE.Vector3().fromBufferAttribute(normals, i)) > 0.999, 'stored normal must match the visible triangle winding');
      const centroid = a.add(b).add(c).multiplyScalar(1 / 3);
      assert(normal.dot(centroid.sub(new THREE.Vector3(0, 0.45, 0))) > 0, 'wall and roof normals must face away from the mass center');
    }
    const material = new THREE.MeshBasicMaterial(), mesh = new THREE.Mesh(geometry, material), ray = new THREE.Raycaster(
      new THREE.Vector3(-0.25, 3, 0), new THREE.Vector3(0, -1, 0));
    assert(ray.intersectObject(mesh, false).length > 0, 'roof must be visible to a FrontSide ray from above');
    material.dispose();
  });
  check('cluster pivots use representative member ground and legacy mode remains reversible', () => {
    const entries = layer.hlodCluster.userData.renderSettlements, mesh = layer.hlodCluster;
    const houses = new Map(derived.filter(building => building.type === 'house').map(building => [building.sourceIndex, building]));
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i], members = entry.members.map(id => houses.get(id));
      const representative = [...members].sort((a, b) => ((a.x - entry.x) ** 2 + (a.y - entry.y) ** 2)
        - ((b.x - entry.x) ** 2 + (b.y - entry.y) ** 2) || a.sourceIndex - b.sourceIndex)[0];
      mesh.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
      assert(Math.abs(position.y - layer.elevation.at(representative.x, representative.y)) < 1e-5,
        'cluster matrix must land on representative member ground');
      assert.equal(entry.source, 'village-hlod-cluster');
    }
    layer.setHLODMode('legacy');
    assert.equal(layer.hlod, layer.hlodLegacy); assert.equal(layer.hlodCluster.count, 0);
    assert.equal(layer.stats.hlodClusters, 0); assert.equal(layer.stats.hlod, layer.hlodLegacy.count);
    assert.equal(layer.stats.hlodTriangles, layer.hlodLegacy.count * 8);
    layer.setHLODMode('cluster');
    assert.equal(layer.hlod, layer.hlodCluster); assert(layer.hlodCluster.count > 0);
  });
  check('far HLOD restores every real house at near range without changing World', () => {
    view(host, 100); layer.update(0.3, world); view(host, 100);
    assert.equal(layer.stats.buildings, derived.length);
    assert.equal(layer.stats.hlod, 0); assert.equal(layer.hlodCluster.count, 0);
    assert.equal(digest(world), before);
  });
  check('a settlement crossing a real Region mask refuses both HLOD modes', () => {
    const village = world.villages.find(item => item.houses?.length > 3 && new Set(item.houses.map(house => house.x)).size > 1);
    assert(village, 'fixture must contain a real multi-house village');
    const members = derived.filter(item => item.type === 'house' && item.settlementId === village.id);
    const minX = Math.min(...members.map(item => item.x)), maxX = Math.max(...members.map(item => item.x));
    const minY = Math.min(...members.map(item => item.y)), maxY = Math.max(...members.map(item => item.y));
    const split = new RegionMask(normalizeRegion([[(minX + maxX) / 2, minY - 1], [maxX + 2, minY - 1],
      [maxX + 2, maxY + 2], [(minX + maxX) / 2, maxY + 2]], world, 0.45));
    host.setRealmViewState({ open: true, targetPlane: 'upper', region: split }); host.update(0.3); view(host, 0.1);
    const inside = members.filter(member => layer.regionGeometry.isInsideCell(member.x, member.y));
    assert(inside.length > 0 && inside.length < members.length, 'real houses must straddle the Region boundary');
    assert(!layer.hlodCluster.userData.renderSettlements.some(entry => entry.settlementId === village.id));
    layer.setHLODMode('legacy');
    assert(!layer.hlodLegacy.userData.renderSettlements.some(entry => entry.settlementId === village.id));
    assert.equal(digest(world), before);
  });
} finally { host.dispose(); }

fs.writeFileSync(reportPath, [
  '# M2-C2A.1 HLOD Cluster Report', '',
  `- Result: PASS (${results.length} focused checks)`,
  '- Production HLOD: deterministic 2–4 contiguous groups along each village bbox long axis.',
  '- Geometry: one shared 12-triangle vertex-color geometry and one InstancedMesh (capacity 512 × 4).',
  '- Identity: each cluster pick entry retains the real settlementId and an exact, non-overlapping subset of house source indices.',
  '- Real village centers are assigned to the nearest cluster identity and suppressed as standalone far LOD masses; near/mid still render them as real buildings.',
  '- Grounding: each cluster uses a deterministic representative house for elevation sampling.',
  '- Compatibility: stats.hlod counts villages; stats.hlodClusters and stats.hlodTriangles report submitted cluster geometry.',
  '- Debug comparison: setHLODMode("legacy" | "cluster"), default cluster.',
  `- Fixture: 64 × 48 generated world, 1,440 simulation days; initial/final SHA-256 ${before}.`,
  `- Measured far cluster batch: ${JSON.stringify(report)}.`,
  '', 'Checks:', ...results.map(name => `- PASS ${name}`), '',
].join('\n'));
console.log(`\n${results.length} A2 HLOD checks passed; report: ${path.relative(root, reportPath)}`);
