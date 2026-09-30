#!/usr/bin/env node
// Render3D M2-A architecture invariants. Runs without a browser or WebGL context.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { fileURLToPath } from 'node:url';
import { SPECIES } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { Life } from '../src/inkbox/sim/life.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { spawnNetherGhost } from '../src/inkbox/sim/netherLife.js';
import { emitRuntimeEvent, drainRuntimeEvents } from '../src/inkbox/core/runtimeEvents.js';
import { PresentationStage } from '../src/inkbox/render/presentationStage.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { surfaceElevation } from '../src/inkbox/render3d/terrain/VisualElevation.js';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { SlabPrototype } from '../src/inkbox/render3d/view/SlabPrototype.js';
import { getRealmViewState } from '../src/inkbox/ui/realmViewState.js';
import { viewPlaneForTool } from '../src/inkbox/ui/realmView.js';
import { Render3DAdapter } from '../src/inkbox/render3d/Render3DAdapter.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';

let passed = 0;
const checks = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const check = (label, run) => {
  run(); passed += 1; checks.push({ label, status: 'passed' }); console.log(`PASS ${label}`);
};

function makeWorld(seed = 616161, preset = { w: 64, h: 48 }) {
  const world = generateWorld({ preset, seed, scatter: true });
  world.upper = generateUpperWorld({ preset, seed: world.seed });
  world.nether = generateNetherWorld({ preset, seed: world.seed });
  for (let i = 0; i < 30; i += 1) spawnNetherGhost(world.nether, { kind: 'ghost', decayYears: 10 });
  return world;
}

function hostOptions() {
  const gpu = {
    info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } },
    setPixelRatio() {}, setClearColor() {}, setSize() {},
    render() {}, disposeCount: 0, dispose() { this.disposeCount += 1; },
  };
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(0, 60, 70); camera.lookAt(0, 0, 0);
  const cameraRig = {
    camera, update() {}, resize() {}, setDimensions(dimensions) { this.dimensions = { ...dimensions }; }, focusOn() {},
    disposeCount: 0, dispose() { this.disposeCount += 1; },
  };
  return { gpu, cameraRig };
}

function makeHost(world) {
  const options = hostOptions();
  return { host: new Render3DHost({ clientWidth: 900, clientHeight: 600 }, world, options), ...options };
}

check('Host 创建一个共享 GPU，三位面注册在同一 scene', () => {
  const world = makeWorld(); const { host, gpu } = makeHost(world);
  assert.equal(host.gpu, gpu);
  assert.equal(host.scene.children.filter(node => node.isGroup && node.name.startsWith('PlaneStage:')).length, 3);
  assert.deepEqual([...host.stages.keys()], ['mortal', 'upper', 'nether']);
  const stageRefs = [...host.stages.values()];
  for (const plane of ['mortal', 'upper', 'nether']) assert.equal(host.setActivePlane(plane), true);
  assert.equal(host.gpu, gpu); assert.deepEqual([...host.stages.values()], stageRefs);
  host.dispose();
});

check('缺失子世界可注册；替换 world 或 buffer 会重建，维度契约错误不会半换', () => {
  const world = makeWorld(); const { host } = makeHost(world);
  const mortalOnly = { ...world, upper: null, nether: undefined };
  assert.equal(host.setWorld(mortalOnly), true);
  assert.deepEqual([...host.stages.keys()], ['mortal']);
  assert.equal(host.setActivePlane('upper'), false);
  const replacement = makeWorld(616162);
  assert.equal(host.setWorld(replacement), true);
  assert.deepEqual([...host.stages.keys()], ['mortal', 'upper', 'nether']);
  const before = host.stages.get('upper');
  const bad = { ...replacement, upper: { ...replacement.upper, w: replacement.w + 1 } };
  assert.throws(() => host.setWorld(bad), /coordinate contract mismatch/);
  assert.equal(host.stages.get('upper'), before);
  const bufferChanged = { ...replacement, upper: { ...replacement.upper, height: replacement.upper.height.slice() } };
  assert.equal(host.setWorld(bufferChanged), true);
  host.dispose();
});

check('dispose 幂等释放每个 stage、相机与唯一 GPU', () => {
  const { host, gpu, cameraRig } = makeHost(makeWorld());
  const stages = [...host.stages.values()];
  host.dispose(); host.dispose();
  assert.equal(host.stages.size, 0);
  assert(stages.every(stage => stage.world === null && stage.bridge === null));
  assert.equal(gpu.disposeCount, 1); assert.equal(cameraRig.disposeCount, 1);
});

check('子世界原地替换、真实读档与改尺寸释放旧几何并保留共享相机 / GPU', () => {
  const world = makeWorld(); const { host, gpu, cameraRig } = makeHost(world);
  const oldGeometry = host.stages.get('upper').terrain.geometry;
  let released = 0; oldGeometry.addEventListener('dispose', () => released++);
  world.upper = generateUpperWorld({ preset: { w: world.w, h: world.h }, seed: world.seed + 1 });
  assert.equal(host.setWorld(world), true);
  assert.equal(released, 1);
  assert.equal(host.stages.get('upper').world, world.upper);
  const larger = makeWorld(616162, { w: 80, h: 52 });
  assert.equal(host.setWorld(larger), true);
  assert.deepEqual(cameraRig.dimensions, { w: 80, h: 52 });
  assert([...host.stages.values()].every(stage => stage.terrain.geometry.attributes.position.count === 80 * 52));
  const loaded = deserializeWorld(serializeWorld(larger));
  assert.equal(host.setWorld(loaded), true);
  assert([...host.stages.values()].every(stage => stage.world === (stage.plane === 'mortal' ? loaded : loaded[stage.plane])));
  assert.equal(host.gpu, gpu); assert.equal(host.cameraRig, cameraRig);
  host.dispose();
});

check('极小地图 Slab 自动缩至边界；换世界清理 Slab 几何与选区', () => {
  const { host } = makeHost(makeWorld(616164, { w: 12, h: 10 }));
  host.setSlabProbe(true);
  assert.deepEqual(host.slabProbe.region, { x0: 0, y0: 0, x1: 11, y1: 9 });
  const geometry = host.slabProbe.surfaceGeometry;
  let disposed = 0; geometry.addEventListener('dispose', () => disposed++);
  host.setWorld(makeWorld());
  assert.equal(disposed, 1); assert.equal(host.slabProbe, null); assert.equal(host.slabRegion, null);
  host.dispose();
});

check('拾取遵守实体父组可见性，隐藏人物不能遮挡实际可见地形', () => {
  const world = makeWorld();
  world.entities = [{ id: 42, sp: SPECIES.HUMAN, level: 0, x: 24.5, y: 21.5 }];
  const { host } = makeHost(world);
  host.resize(900, 600); host.update(1);
  const stage = host.stages.get('mortal'), entity = stage.entities.meshes.human;
  const matrix = new THREE.Matrix4(); entity.getMatrixAt(0, matrix);
  const center = new THREE.Vector3(0, 1.2, 0).applyMatrix4(matrix), camera = host.cameraRig.camera;
  camera.up.set(0, 0, -1); camera.position.copy(center).add(new THREE.Vector3(0, 80, 0));
  camera.lookAt(center); camera.updateMatrixWorld();
  const position = center.clone().project(camera);
  const x = (position.x + 1) * 450, y = (1 - position.y) * 300;
  assert.equal(host.pick(x, y)?.entityId, 42);
  stage.entities.group.visible = false;
  assert.equal(host.pick(x, y)?.entityId, undefined);
  host.dispose();
});

check('三个世界同格共享 XZ，地貌高程只改变 Y', () => {
  const world = makeWorld(); const coords = createCoordinates(world);
  const i = 17 * world.w + 22;
  world.upper.height[i] += 0.4; world.nether.height[i] -= 0.2;
  const points = [world, world.upper, world.nether].map(value => coords.cellToRender(22, 17, surfaceElevation(value, 22, 17)));
  assert.deepEqual(points.map(({ x, z }) => [x, z]), [points[0], points[0], points[0]].map(({ x, z }) => [x, z]));
  assert.notEqual(points[0].y, points[1].y); assert.notEqual(points[0].y, points[2].y);
});

check('Canvas、Render3D 与裂缝视界共享唯一派生 RealmViewState', () => {
  const selection = { path: [[4, 4], [16, 4], [16, 14], [4, 14]], x0: 4, y0: 4, x1: 16, y1: 14, area: 120 };
  let sharedHost;
  for (const toolId of ['viewUpper', 'viewNether']) {
    const state = getRealmViewState({ selection, toolId });
    assert.equal(state.open, true); assert.equal(state.targetPlane, viewPlaneForTool(toolId));
    const host = sharedHost || (sharedHost = makeHost(makeWorld()).host);
    host.setRealmViewState(state);
    assert.equal(host.realmViewState, state);
    assert.equal(host.realmPrototype.open, true);
    assert.equal(host.realmPrototype.targetPlane, state.targetPlane);
    assert.equal(host.stages.get(state.targetPlane).regionMask, state.region);
    assert.equal(host.stages.get('mortal').regionMask, state.region);
    assert.equal(host.stages.get(state.targetPlane).visible, true);
    assert.equal(host.stages.get(state.targetPlane === 'upper' ? 'nether' : 'upper').visible, false);
    // Sandbox.riftViewOpen delegates to this same state.open calculation.
    assert.equal(getRealmViewState({ selection, toolId }).open, state.open);
  }
  sharedHost.dispose();
  assert.equal(getRealmViewState({ selection, toolId: 'raise' }).open, false);
  const main = readSource('src/inkbox/main.js');
  const adapter = readSource('src/inkbox/render3d/Render3DAdapter.js');
  assert(/riftViewOpen\(\)\s*\{\s*return this\.getRealmViewState\(\)\.open;/s.test(main), 'rift clock must read the canonical view state');
  assert(/getRealmViewState\(\)\s*\{\s*return getRealmViewState\(\{ selection: this\.selection, toolId: this\.toolId \}\);/s.test(main), 'Sandbox must derive state through the shared helper');
  assert((main.match(/this\.getRealmViewState\(\)/g) || []).length >= 3, 'Canvas view paths must also consume the same helper');
  assert(/setRealmViewState\(this\.sandbox\.getRealmViewState\(\)\)/.test(adapter), 'Render3D must receive the Sandbox state object');
});

check('三界 runtime event 只由 PresentationStage 消费，Canvas/Three 共用同一 FX state', () => {
  const world = makeWorld();
  emitRuntimeEvent(world, 'rift-open', { x: 2, y: 3 });
  emitRuntimeEvent(world.upper, 'ascension', { x: 4, y: 5 });
  emitRuntimeEvent(world.nether, 'major-death', { x: 6, y: 7 });
  const presentation = new PresentationStage();
  presentation.ingestWorlds(world).update(0.016);
  assert.deepEqual(presentation.fx.items.map(item => item.plane), ['mortal', 'upper', 'nether']);
  assert.deepEqual(drainRuntimeEvents(world), []);
  assert.deepEqual(drainRuntimeEvents(world.upper), []);
  assert.deepEqual(drainRuntimeEvents(world.nether), []);
  const { host } = makeHost(world);
  host.setPresentation(presentation);
  const selection = { path: [[1, 1], [40, 1], [40, 35], [1, 35]], x0: 1, y0: 1, x1: 40, y1: 35, area: 1326 };
  host.setRealmViewState(getRealmViewState({ selection, toolId: 'viewUpper' }));
  host.update(0.016);
  assert.equal(host.presentation, presentation);
  assert.equal(host.stages.get('mortal').fxProbe.mesh.count, 1);
  assert.equal(host.stages.get('upper').fxProbe.mesh.count, 1);
  host.setRealmViewState(getRealmViewState({ selection, toolId: 'viewNether' }));
  host.update(0.016);
  assert.equal(host.stages.get('nether').fxProbe.mesh.count, 1);
  for (const plane of ['mortal', 'upper', 'nether']) {
    const snapshot = presentation.snapshotPlane(plane);
    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.plane, plane);
    assert.notEqual(snapshot.items[0], presentation.fx.items.find(item => item.plane === plane));
    assert.throws(() => { snapshot.items[0].x = -1; }, TypeError);
  }
  host.dispose();
});

check('picked upper/nether plane 禁止雕刻凡间或目标 world', () => {
  const world = makeWorld();
  // Deliberately non-flat so every real sculpt mode has work available.
  for (let y = 0; y < world.h; y += 1) for (let x = 0; x < world.w; x += 1) {
    world.height[y * world.w + x] = 0.25 + ((x * 7 + y * 11) % 13) * 0.025;
  }
  const adapter = Object.create(Render3DAdapter.prototype);
  adapter.sandbox = { world, dirty: false };
  adapter.renderer = { activePlane: 'mortal', realmPrototype: { open: false }, slabProbe: null, markTerrainDirty() {} };
  adapter.radius = 2; adapter.strength = 0.4; adapter.undoStack = []; adapter.stroke = null;
  const point = { x: 24.5, y: 21.5 };
  for (const mode of ['raise', 'lower', 'flatten', 'smooth']) {
    adapter.mode = mode;
    for (const plane of ['upper', 'nether']) {
      adapter.renderer.activePlane = plane;
      assert.equal(adapter.canSculpt({ plane }), false, `${mode} must be disabled on ${plane}`);
      const mortalBefore = world.height.slice();
      const upperBefore = world.upper.height.slice();
      const netherBefore = world.nether.height.slice();
      // Model a stale in-progress mortal stroke while the selected plane changes.
      adapter.stroke = { plane: 'mortal', world, before: new Map(), targetHeight: world.height[point.y * world.w + point.x], changed: false };
      adapter.stamp(point, 'mortal');
      // Also exercise the direct picked-plane guard for callers that pass the hit plane.
      adapter.stroke.plane = plane;
      adapter.stamp(point, plane);
      assert.deepEqual(world.height, mortalBefore, `${mode} on ${plane} modified mortal height`);
      assert.deepEqual(world.upper.height, upperBefore, `${mode} on ${plane} modified upper height`);
      assert.deepEqual(world.nether.height, netherBefore, `${mode} on ${plane} modified nether height`);
      adapter.stroke = null;
    }
  }
  for (const plane of ['upper', 'nether']) {
    adapter.renderer.activePlane = plane;
    const target = world[plane], before = target.height.slice();
    adapter.undoStack.push({ plane, world: target, changes: [[0, -9]] });
    adapter.undo();
    assert.deepEqual(target.height, before, `undo entry for ${plane} must not be applied`);
    assert.equal(adapter.undoStack.length, 1, `undo entry for ${plane} must remain untouched while that plane is active`);
    adapter.undoStack.length = 0;
  }

  adapter.renderer.activePlane = 'mortal'; adapter.mode = 'raise';
  const before = world.height.slice();
  adapter.stroke = { plane: 'mortal', world, before: new Map(), targetHeight: world.height[point.y * world.w + point.x], changed: false };
  assert.equal(adapter.canSculpt({ plane: 'mortal' }), true);
  adapter.stamp(point, 'mortal');
  assert(adapter.stroke.changed, 'valid mortal raise must invoke sculpt and change the stroke');
  assert.notDeepEqual(world.height, before, 'valid mortal stamp must change terrain');
  adapter.endStroke();
  assert.equal(adapter.undoStack.length, 1);
  adapter.undo();
  assert.deepEqual(world.height, before, 'mortal undo must restore the exact previous height buffer');
  assert.equal(adapter.undoStack.length, 0);
});

check('RegionMask 边界与 terrain/picker 共用区域索引，镜头操作不改变世界坐标区域', () => {
  const world = makeWorld();
  world.height.fill(-0.8); world.upper.height.fill(0.8);
  world.upper.entities = [{ id: 910001, x: 21.5, y: 19.5, level: 0, sp: SPECIES.HUMAN, faction: 0 }];
  const { host } = makeHost(world);
  const selection = { path: [[12, 10], [30, 10], [30, 28], [12, 28]], x0: 12, y0: 10, x1: 30, y1: 28, area: 324 };
  const state = getRealmViewState({ selection, toolId: 'viewUpper' });
  host.setRealmViewState(state);
  const mask = state.region;
  assert.equal(mask.contains(20, 20), true);
  assert.equal(mask.contains(5, 5), false);
  const edgeCell = mask.contains(12.5, 20.5);
  const expectedQuads = Array.from({ length: (world.w - 1) * (world.h - 1) }, (_, index) => {
    const x = index % (world.w - 1), y = Math.floor(index / (world.w - 1));
    return mask.contains(x + 0.5, y + 0.5);
  }).filter(Boolean).length;
  const upper = host.stages.get('upper');
  assert.equal(upper.terrain.regionMask, mask);
  assert.equal(upper.entities.regionMask, mask);
  assert.equal(upper.terrain.geometry.drawRange.count, expectedQuads * 6, 'terrain picker geometry must use RegionMask cell-center decisions');
  assert.equal(mask.contains(12.5, 20.5), edgeCell, 'edge semantics come from the shared region predicate');
  host.resize(900, 600);
  const target = host.coordinates.cellToRender(21.5, 19.5);
  const targetY = surfaceElevation(world.upper, 21.5, 19.5);
  host.cameraRig.camera.position.set(target.x, 150, target.z);
  host.cameraRig.camera.up.set(0, 0, -1);
  host.cameraRig.camera.lookAt(target.x, targetY, target.z);
  host.cameraRig.camera.updateProjectionMatrix();
  upper.entities.update(0.2, upper.world, { heightChanged: true });
  const picked = host.pick(450, 300);
  assert.equal(picked?.plane, 'upper', `visible target plane should own center hit; got ${JSON.stringify(picked && { plane: picked.plane, x: picked.x, y: picked.y, entityId: picked.entityId })}`);
  assert.equal(picked?.entityId, 910001, 'an entity silhouette in the mask must resolve to its own record');
  assert.deepEqual(picked?.world, { x: 21.5, y: 19.5 }, 'instance hit must return its world-space center, not terrain hit coordinates');
  assert.deepEqual({ x: picked.x, y: picked.y }, { x: 21, y: 19 }, 'cell result must map the same instance center to its source cell');
  const before = [mask.contains(20, 20), mask.contains(5, 5), mask.contains(12.5, 20.5)];
  host.cameraRig.camera.rotation.y += 0.4; host.cameraRig.camera.zoom = 1.5; host.cameraRig.camera.position.x += 3;
  assert.deepEqual([mask.contains(20, 20), mask.contains(5, 5), mask.contains(12.5, 20.5)], before);
  host.dispose();
});

check('Slab 矩形 probe 的三角数、上下边界坐标、动态高度与范围守卫正确', () => {
  const world = makeWorld();
  const coordinates = createCoordinates(world);
  const region = { x0: 12, y0: 10, x1: 32, y1: 30 };
  const slab = new SlabPrototype({ mortalWorld: world, targetWorld: world.upper, coordinates, region });
  assert.equal(slab.stats.surfaceTriangles, 800);
  assert.equal(slab.stats.wallTriangles, 160);
  assert.equal(slab.stats.triangles, 960);
  for (const [label, geometry, triangles] of [
    ['surface', slab.surfaceGeometry, slab.stats.surfaceTriangles],
    ['walls', slab.wallGeometry, slab.stats.wallTriangles],
  ]) {
    assert.equal(geometry.index?.isBufferAttribute, true, `${label} index must be a Three.BufferAttribute`);
    assert.equal(geometry.index.count, triangles * 3, `${label} index count must match triangle count`);
    const vertexCount = geometry.attributes.position.count;
    for (const index of geometry.index.array) assert(index < vertexCount, `${label} index ${index} exceeds ${vertexCount} vertices`);
  }
  const assertWallsMatchSurfaces = () => {
    const positions = slab.wallGeometry.attributes.position;
    slab.edges.forEach((edge, edgeIndex) => edge.forEach(([x, y], end) => {
      const top = edgeIndex * 4 + end * 2, bottom = top + 1;
      const point = coordinates.cellToRender(x, y);
      const topY = surfaceElevation(world.upper, x, y), bottomY = surfaceElevation(world, x, y);
      assert(Math.abs(positions.getX(top) - point.x) < 1e-5 && Math.abs(positions.getZ(top) - point.z) < 1e-5);
      assert(Math.abs(positions.getY(top) - topY) < 1e-5, `top seam drift at ${x},${y}`);
      assert(Math.abs(positions.getX(bottom) - point.x) < 1e-5 && Math.abs(positions.getZ(bottom) - point.z) < 1e-5);
      assert(Math.abs(positions.getY(bottom) - bottomY) < 1e-5, `bottom seam drift at ${x},${y}`);
    }));
  };
  assertWallsMatchSurfaces();
  const firstTop = slab.surfaceGeometry.attributes.position.getY(0);
  world.upper.height[region.y0 * world.w + region.x0] += 0.12;
  world.height[region.y0 * world.w + region.x0] -= 0.08;
  slab.update();
  assert.notEqual(slab.surfaceGeometry.attributes.position.getY(0), firstTop);
  assertWallsMatchSurfaces();
  assert.throws(() => new SlabPrototype({ mortalWorld: world, targetWorld: world.upper, coordinates,
    region: { x0: 12, y0: 10, x1: 33, y1: 30 } }), /limited to 20/);
  assert.throws(() => new SlabPrototype({ mortalWorld: world, targetWorld: world.upper, coordinates,
    region: { ...region, path: [[12, 10], [32, 10], [22, 18], [12, 30]] } }), /rectangle bounds only/);
  slab.dispose();
});

check('600 日模拟 digest 在无 Stage、凡间 Stage、循环三界 Stage 下逐字一致', () => {
  const digest = w => JSON.stringify({
    day: w.day, entities: w.entities, villages: w.villages, factions: w.factions,
    artifacts: w.artifacts, artifactLog: w.artifactLog, sites: w.sites,
    leylines: w.leylines, rifts: w.rifts, riftLog: w.riftLog,
    wraiths: w.wraiths, wraithLog: w.wraithLog, watch: w.watch,
    upper: w.upper, nether: w.nether,
  });
  const run = mode => {
    const world = makeWorld();
    const opts = {
      life: new Life(world, mulberry32(world.seed ^ 0xa5a5a5a5)),
      upperLife: new Life(world.upper, mulberry32(world.seed ^ 0x55505052)),
      state: createAdvanceState(), rng: mulberry32(world.seed ^ 0x1a2b3c4d),
      nether: true, wraith: true, riftActive: true,
    };
    const created = mode === 'canvas' ? null : makeHost(world);
    const host = created?.host;
    for (let round = 0; round < 20; round += 1) {
      advanceWorld(world, 30, opts);
      if (host) {
        if (mode === 'loop') host.setActivePlane(['mortal', 'upper', 'nether'][round % 3]);
        host.update(0.2);
      }
    }
    const value = digest(world);
    assert.equal(world.day, 600);
    assert(world.entities.length > 0 && world.upper.entities.length > 0 && world.nether.entities.length > 0);
    assert(world.nether.popLog.ghostBorn > 0 && world.nether.artifacts.length > 0);
    host?.dispose();
    return value;
  };
  const canvas = run('canvas');
  assert.equal(run('mortal'), canvas, '凡间 stage 必须保持模拟纯度');
  assert.equal(run('loop'), canvas, '循环切换三界 stage 必须保持模拟纯度');
});

const reportDir = path.join(root, 'reports', 'release', 'render3d-m2a');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'm2a-results.json'), JSON.stringify({
  suite: 'Render3D M2-A',
  status: 'passed',
  passed,
  failed: 0,
  checks,
  simulation: { days: 600, comparedRuns: ['canvas-no-stage', 'render3d-mortal', 'render3d-plane-cycle'], digestEqual: true },
}, null, 2) + '\n');
fs.writeFileSync(path.join(reportDir, 'm2a.log'), `${checks.map(({ label }) => `PASS ${label}`).join('\n')}\n\n${passed} M2-A invariant groups passed.\n`);
console.log(`\n${passed} M2-A invariant groups passed; report: reports/release/render3d-m2a/m2a-results.json`);
