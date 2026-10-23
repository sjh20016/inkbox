#!/usr/bin/env node
import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { Life } from '../src/inkbox/sim/life.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { grantRoot } from '../src/inkbox/sim/divine.js';
import { Render3DAdapter } from '../src/inkbox/render3d/Render3DAdapter.js';

const world = new World(40, 32, 1023);
world.height.fill(.48); world.type.fill(TERRAIN.GRASS); world.veg.fill(.8);
const life = new Life(world, () => .5);
assert.equal(life.spawn(20, 16, 'human', 2), 2);
const [first, second] = world.entities;
for (const entity of [first, second]) entity.age = 25 * 360;
const age = second.age, lifespan = second.lifespan;
const firstLevel = first.level;
assert.match(grantRoot(world, second.x, second.y, 2, () => .5, second.id), /点化 1 人/);
assert.equal(first.level, firstLevel, 'same-cell neighbor stays untouched');
assert.equal(second.level, 1, 'clicked real identity awakens');
assert.equal(second.age, age, 'awakening preserves age');
assert.ok(second.lifespan > lifespan, 'new root uses formal longevity');
const count = world.entities.length;
assert.match(grantRoot(world, first.x, first.y, 2, () => .5, -9999), /重新点选/);
assert.equal(first.level, firstLevel, 'stale ID cannot fall back to neighbor');
assert.equal(world.entities.length, count);
const oldHp = first.hp; first.hp = 0;
assert.match(grantRoot(world, first.x, first.y, 2, () => .5, first.id), /重新点选/);
assert.equal(first.level, firstLevel, 'dead ID cannot fall back to neighbor');
first.hp = oldHp;
assert.match(grantRoot(world, 1, 1, 1, () => .5, first.id), /移出神力范围/);
assert.equal(first.level, firstLevel, 'out-of-range ID cannot grant');

const keys = new Set(['w']);
const movement = [];
const debug = { textContent: '' };
const adapter = Object.assign(Object.create(Render3DAdapter.prototype), {
  active: true, mode: 'inspect', heldCameraKeys: keys, lastNow: null, lastDebug: Infinity,
  sandbox: { world, stage: null, getRealmViewState: () => ({ open: false }) },
  renderer: {
    world, activePlane: 'mortal', setWorld: () => false,
    setRealmViewState() {}, setPresentation() {}, update() {}, brush() {},
    cameraRig: { moveLocal(...args) { movement.push(args); } },
    render: () => ({ fps: 60, frameMs: 16, drawCalls: 1, triangles: 1,
      terrainVertices: 1, treeInstances: 0, entityInstances: 0, houseInstances: 0,
      markerInstances: 0, lastRaycastMs: 0, renderMs: 0, layerUpdateMs: 0,
      bridgeScanMs: 0, terrainUpdateMs: 0, waterUpdateMs: 0,
      vegetationUpdateMs: 0, entityUpdateMs: 0, settlementUpdateMs: 0,
      markerUpdateMs: 0 }),
    stages: new Map([['mortal', { world }]]),
  },
  panel: { querySelector: () => debug }, readout: { textContent: '' },
  syncHistoryState() {}, flushStroke() {},
});
adapter.render(10);
adapter.render(10.05);
assert.ok(Math.abs(movement[1][2] - .05) < 1e-8, 'RAF seconds reach camera as seconds');
keys.clear(); adapter.render(10.1);
assert.equal(movement.at(-1)[1], 0, 'released key stops camera movement');

const previousDocument = globalThis.document;
globalThis.document = { body: { dataset: {} } };
try {
  const realmAdapter = Object.assign(Object.create(Render3DAdapter.prototype), {
    active: true, mode: 'forest', heldCameraKeys: new Set(['w']),
    canvas: { focus() {} }, planeSelect: { value: 'mortal' },
    renderer: {
      activePlane: 'mortal', stages: new Map([['mortal', {}], ['upper', {}], ['nether', {}]]),
      setSelection() {}, setSlabProbe() {},
      setActivePlane(plane) { this.activePlane = plane; return true; },
    },
    sandbox: { getRealmViewState: () => ({ open: true }), closeRealmView() { this.closed = true; },
      selectTool(id) { this.toolId = id; } },
    cancelStroke() { this.cancelled = true; },
    setTool(id) { this.mode = id; return true; },
    invalidateHover() {},
  });
  assert.equal(realmAdapter.setDisplayPlane('upper'), true);
  assert.equal(realmAdapter.renderer.activePlane, 'upper');
  assert.equal(realmAdapter.mode, 'inspect', 'other realms remain read only');
  assert.equal(realmAdapter.sandbox.closed, true, 'full realm closes local view window');
  assert.equal(realmAdapter.cancelled, true, 'pending gesture is cancelled on switch');
  assert.equal(realmAdapter.heldCameraKeys.size, 0, 'switch clears held key');
  assert.equal(globalThis.document.body.dataset.r1Realm, 'upper');
} finally { globalThis.document = previousDocument; }
console.log('P0-A focused input and exact-person grant: passed');
