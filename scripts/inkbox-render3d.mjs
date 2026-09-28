import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { WORLD_PRESETS, SEA_LEVEL } from '../src/inkbox/core/config.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { visualElevation, surfaceElevation } from '../src/inkbox/render3d/terrain/VisualElevation.js';
import { sculpt, strokeSamples } from '../src/inkbox/render3d/terrain/sculpt.js';
import { TerrainMesh } from '../src/inkbox/render3d/terrain/TerrainMesh.js';
import { TerrainPicker } from '../src/inkbox/render3d/terrain/TerrainPicker.js';
import { WorldRenderBridge } from '../src/inkbox/render3d/WorldRenderBridge.js';
import { WaterLayer } from '../src/inkbox/render3d/water/WaterLayer.js';
import { VegetationLayer } from '../src/inkbox/render3d/vegetation/VegetationLayer.js';
import { deriveVegetation } from '../src/inkbox/render3d/vegetation/deriveVegetation.js';

let passed = 0;
function check(label, fn) { fn(); passed++; console.log(`PASS ${label}`); }
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
for (const [name, preset] of Object.entries(WORLD_PRESETS)) {
  const world = generateWorld({ preset, seed: 20260928, scatter: false });
  const c = createCoordinates(world), before = digest(world);
  check(`${name}: coordinate round trips, corners, clamp`, () => {
    for (const [x, y] of [[0, 0], [world.w - 1, 0], [0, world.h - 1], [world.w - 1, world.h - 1], [(world.w - 1) / 2, (world.h - 1) / 2], [13.25, 17.75]]) {
      const p = c.worldToRender(x, y, 8), q = c.renderToWorld(p.x, p.z);
      assert.equal(q.x, x); assert.equal(q.y, y);
      assert.deepEqual(c.renderPointToCell(p), { x: Math.round(x), y: Math.round(y) });
    }
    assert.deepEqual(c.renderPointToCell({ x: -10000, z: 10000 }), { x: 0, y: world.h - 1 });
  });
  const bridge = new WorldRenderBridge(world), terrain = new TerrainMesh(world, c), water = new WaterLayer(world, c), vegetation = new VegetationLayer(world, c);
  check(`${name}: real heightfield, sea baseline, stable trees`, () => {
    assert.equal(terrain.geometry.attributes.position.count, world.size);
    assert.equal(visualElevation(SEA_LEVEL), 0);
    assert(visualElevation(0) < 0); assert(visualElevation(1) > 0);
    for (let i = 0; i < world.size; i += 103) assert(Math.abs(terrain.geometry.attributes.position.getY(i) - visualElevation(world.height[i])) < 1e-5);
    assert.deepEqual(deriveVegetation(world), deriveVegetation(world));
    assert(vegetation.trees.length > 0 && vegetation.trees.length <= 10000);
  });
  check(`${name}: raycast at 4 yaws and 2 pitches`, () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) for (const pitch of [0.3, 1.0]) {
      const camera = new THREE.OrthographicCamera(-300, 300, 200, -200, 0.1, 2000);
      camera.position.set(Math.sin(yaw) * 400 * Math.sin(pitch), 400 * Math.cos(pitch), Math.cos(yaw) * 400 * Math.sin(pitch));
      camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      const picker = new TerrainPicker(terrain, c, camera);
      // Topmost height is visible at every azimuth; inset corners avoid raster-edge ambiguity.
      let peak = 0;
      for (let i = 1; i < world.size; i++) if (world.height[i] > world.height[peak]) peak = i;
      const x = peak % world.w, y = Math.floor(peak / world.w), sx = x + (x < world.w - 1 ? 0.13 : -0.13), sy = y + (y < world.h - 1 ? 0.19 : -0.19);
      const p = c.worldToRender(sx, sy, surfaceElevation(world, sx, sy));
      const screen = new THREE.Vector3(p.x, p.y, p.z).project(camera);
      const hit = picker.pick((screen.x + 1) * 500, (1 - screen.y) * 400, 1000, 800);
      assert(hit, 'peak hit'); assert.equal(hit.x, x); assert.equal(hit.y, y);
    }
  });
  check(`${name}: render data purity`, () => {
    for (let frame = 0; frame < 5; frame++) { assert.equal(bridge.changes(), null); vegetation.update(); }
    assert.equal(digest(world), before);
  });
  terrain.dispose(); water.dispose(); vegetation.dispose();
}

for (const mode of ['raise', 'lower', 'flatten', 'smooth']) {
  check(`${mode}: bounded, deterministic, height-only editing`, () => {
    const world = generateWorld({ preset: { w: 32, h: 24 }, seed: 42, scatter: false });
    const copy = generateWorld({ preset: { w: 32, h: 24 }, seed: 42, scatter: false });
    const old = world.height.slice(), rest = digest({ water: world.water, type: world.type, veg: world.veg, entities: world.entities, day: world.day });
    const brush = { mode, x: 1, y: 1, radius: 5, strength: 0.1, targetHeight: 0.4 };
    sculpt(world, brush); sculpt(copy, brush);
    assert.deepEqual(world.height, copy.height);
    let changed = 0;
    for (let i = 0; i < world.size; i++) {
      assert(Number.isFinite(world.height[i]) && world.height[i] >= 0 && world.height[i] <= 1);
      if (Math.hypot(i % world.w - 1, Math.floor(i / world.w) - 1) >= 5) assert.equal(world.height[i], old[i]);
      if (old[i] !== world.height[i]) changed++;
    }
    assert(changed > 0);
    assert.equal(digest({ water: world.water, type: world.type, veg: world.veg, entities: world.entities, day: world.day }), rest);
  });
}
check('stroke spacing avoids disconnected brush stamps', () => {
  const points = [{ x: 0, y: 0 }, ...strokeSamples({ x: 0, y: 0 }, { x: 100, y: 50 }, 4)];
  for (let i = 1; i < points.length; i++) assert(Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) <= 1.001);
});
check('dirty update retains geometry and refreshes exact heights', () => {
  const w = generateWorld({ preset: { w: 32, h: 24 }, seed: 7, scatter: false });
  const bridge = new WorldRenderBridge(w), t = new TerrainMesh(w, bridge.coordinates), geometry = t.geometry;
  sculpt(w, { mode: 'raise', x: 16, y: 12, radius: 3 });
  const region = bridge.changes(); assert(region); t.update(region);
  assert.equal(t.geometry, geometry); assert.equal(bridge.changes(), null);
  assert(Math.abs(t.geometry.attributes.position.getY(12 * w.w + 16) - visualElevation(w.height[12 * w.w + 16])) < 1e-5);
  t.dispose();
});
check('stationary picking cache invalidates after sculpt and camera movement', () => {
  const world = generateWorld({ preset: { w: 32, h: 24 }, seed: 5, scatter: false });
  const c = createCoordinates(world), terrain = new TerrainMesh(world, c);
  const camera = new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, 1000);
  camera.position.set(0.13, 200, 0.19); camera.up.set(0, 0, -1); camera.lookAt(0.13, 0, 0.19);
  const picker = new TerrainPicker(terrain, c, camera), first = picker.pick(500, 400, 1000, 800);
  assert(first); assert.equal(picker.pick(500, 400, 1000, 800), first); assert.equal(picker.timeMs, 0);
  const region = sculpt(world, { x: first.x, y: first.y, radius: 4, mode: 'raise' }); terrain.update(region);
  const raised = picker.pick(500, 400, 1000, 800); assert(raised.point.y > first.point.y);
  camera.position.x += 3; camera.lookAt(3.13, 0, 0.19);
  assert.notEqual(picker.pick(500, 400, 1000, 800).x, raised.x);
  terrain.dispose();
});
console.log(`Render3D M0: ${passed} groups passed`);
