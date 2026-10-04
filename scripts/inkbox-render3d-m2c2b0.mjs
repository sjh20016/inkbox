import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { deriveVegetation } from '../src/inkbox/render3d/vegetation/deriveVegetation.js';
import { treeVariantIndex } from '../src/inkbox/render3d/vegetation/treeVariation.js';
import { deriveSettlements } from '../src/inkbox/render3d/settlements/SettlementLayer.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { Life, mercyRngFor, MERCY_SEED_KEY } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import {
  openRifts, riftRngFor, RIFT_SEED_KEY, netherRiftRngFor, NETHRIFT_SEED_KEY,
  netherItemRngFor, NETHERITEM_SEED_KEY, netherPossessRngFor, NETHER_POSSESS_SEED_KEY,
} from '../src/inkbox/sim/rifts.js';
import { mortalHauntRngFor, MORTALHAUNT_SEED_KEY } from '../src/inkbox/sim/wraiths.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { serializeWorld } from '../src/inkbox/io/save.js';
import { ART_PROFILES } from '../src/inkbox/render3d/art/ArtPassProfile.js';
import { REALM_STYLES } from '../src/inkbox/render3d/art/RealmStyleProfile.js';

const OUT_DIR = path.resolve(process.env.INKBOX_REPORT_DIR || 'reports/m2c2b0/core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HASH_SCAN_LIMIT = 1_000_000;
const RNG_STREAMS = [
  ['mercy', MERCY_SEED_KEY, mercyRngFor],
  ['rift', RIFT_SEED_KEY, riftRngFor],
  ['netherRift', NETHRIFT_SEED_KEY, netherRiftRngFor],
  ['netherItem', NETHERITEM_SEED_KEY, netherItemRngFor],
  ['netherPossess', NETHER_POSSESS_SEED_KEY, netherPossessRngFor],
  ['mortalHaunt', MORTALHAUNT_SEED_KEY, mortalHauntRngFor],
];
const MODES = ['no-render', 'legacy', 'mortal-v1', 'nether-view-v1', 'upper-view-v1', 'toggle-cycle'];
const results = { suite: 'M2-C2B0', checks: [], modes: [] };

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function check(name, fn) {
  fn(); results.checks.push({ name, passed: true }); console.log(`PASS ${name}`);
}
function deepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Reflect.ownKeys(value).every(key => deepFrozen(value[key], seen));
}
function worldFor(seed = 908) {
  const preset = { w: 64, h: 48 };
  const world = generateWorld({ preset, seed, scatter: true });
  world.upper = generateUpperWorld({ preset, seed: world.seed });
  world.nether = generateNetherWorld({ preset, seed: world.seed });
  return world;
}
function makeRegion(world) {
  return new RegionMask(normalizeRegion([[10, 9], [44, 9], [44, 35], [10, 35]], world, 0.45));
}
function makeHost(world) {
  const camera = new THREE.OrthographicCamera(-50, 50, 40, -40, 0.1, 2000);
  camera.position.set(0, 100, 100); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const gpu = {
    info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } },
    setPixelRatio() {}, setClearColor() {}, setSize() {}, render() {}, dispose() {},
  };
  const cameraRig = {
    camera, update() {}, resize() {}, setDimensions() {}, dispose() {}, focusOn() {},
  };
  const host = new Render3DHost({}, world, { gpu, cameraRig, characters: false, lodEnabled: true });
  host.resize(900, 600);
  return host;
}
function setView(host, ppu) {
  const data = { pixelsPerUnit: ppu, verticalPixelsPerUnit: ppu, width: 900, height: 600, camera: host.cameraRig.camera };
  for (const stage of host.stages.values()) {
    for (const layer of [stage.vegetation, stage.entities, stage.settlements]) layer?.setArtView(data);
  }
}
function meshTriangles(root) {
  let total = 0;
  root?.traverse(mesh => {
    if (mesh.isInstancedMesh && mesh.visible) total += mesh.count * (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
  });
  return total;
}
function openFixture(world) {
  const selection = { x0: 10, y0: 9, x1: 44, y1: 35 };
  const upper = openRifts(world, selection, 'upper');
  const nether = openRifts(world, selection, 'nether');
  assert(upper.opened > 0, `upper openRifts fixture failed: ${JSON.stringify(upper)}`);
  assert(nether.opened > 0, `nether openRifts fixture failed: ${JSON.stringify(nether)}`);
  assert(world.rifts.some(rift => rift.targetPlane === 'upper' && rift.age === 0 && rift.closedDay === -1));
  assert(world.rifts.some(rift => rift.targetPlane === 'nether' && rift.age === 0 && rift.closedDay === -1));
  return { upper, nether };
}
function locateConsumption(seed, salt, sample) {
  const count = HASH_SCAN_LIMIT + sample.length;
  const stream = mulberry32((seed ^ salt) >>> 0);
  const expected = new Float64Array(count);
  for (let i = 0; i < count; i++) expected[i] = stream();
  outer: for (let start = 0; start <= HASH_SCAN_LIMIT; start++) {
    for (let j = 0; j < sample.length; j++) if (expected[start + j] !== sample[j]) continue outer;
    return start;
  }
  throw new Error(`RNG position not found in first ${HASH_SCAN_LIMIT} draws for salt 0x${salt.toString(16)}`);
}
function hiddenRngPositions(world) {
  const positions = {};
  for (const [name, salt, accessor] of RNG_STREAMS) {
    const sample = Array.from({ length: 8 }, () => accessor(world)());
    positions[name] = locateConsumption(world.seed || 0, salt, sample);
  }
  return positions;
}
function presentationRngScan() {
  const targets = [
    'src/inkbox/render3d/art/ArtPassProfile.js',
    'src/inkbox/render3d/art/RealmStyleProfile.js',
    'src/inkbox/render3d/vegetation/treeVariation.js',
    'src/inkbox/render3d/vegetation/deriveVegetation.js',
    'src/inkbox/render3d/vegetation/VegetationLayer.js',
    'src/inkbox/render3d/settlements/SettlementLayer.js',
  ];
  for (const relative of targets) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert(!/from\s+['"][^'"]*(?:\/sim\/|\\sim\\)/.test(source), `${relative} must not import simulation modules`);
  }
}
function snapshot(world, state) {
  const save = serializeWorld(world);
  const saveKeys = Object.keys(save).sort();
  const presentationKeys = /(?:artProfile|realmStyle|treeVariation|hlod|lodEnabled)/i;
  const findPresentationFields = (value, prefix = '') => {
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, child]) => {
      const field = prefix ? `${prefix}.${key}` : key;
      return [...(presentationKeys.test(key) ? [field] : []), ...findPresentationFields(child, field)];
    });
  };
  const leaked = findPresentationFields(save);
  assert.deepEqual(leaked, [], `save must contain no presentation fields: ${leaked.join(', ')}`);
  return {
    worldSha: sha(world), advanceStateSha: sha(state), fullSha: sha({ world, advanceState: state }),
    saveSha: sha(save), saveKeys, save,
  };
}

check('profiles are deeply frozen and render presentation has no simulation imports', () => {
  assert(deepFrozen(ART_PROFILES)); assert(deepFrozen(REALM_STYLES));
  assert.equal(ART_PROFILES.legacy.name, 'legacy');
  assert.equal(ART_PROFILES['realm-style-v1'].mode, 'realm-style-v1');
  presentationRngScan();
});
check('five deterministic tree variants preserve identity for derived cells', () => {
  const world = worldFor(913), trees = deriveVegetation(world);
  assert(trees.length > 0, 'fixture must derive real trees');
  const ids = trees.map(tree => treeVariantIndex(world.seed, tree.cell));
  const repeated = trees.map(tree => treeVariantIndex(world.seed, tree.cell));
  assert.deepEqual(ids, repeated);
  assert.deepEqual([...new Set(ids)].sort(), [0, 1, 2, 3, 4], 'real derived cells must cover all five presentation variants');
});
check('far HLOD has real settlement members and region ownership stays derived-only', () => {
  const world = worldFor(914), deps = {
    life: new Life(world, mulberry32(world.seed ^ 0xa5a5a5a5)), upperLife: new UpperLife(world.upper),
    state: createAdvanceState(), rng: mulberry32(world.seed ^ 0x1a2b3c4d), nether: true, wraith: true, riftActive: false,
  };
  for (let day = 0; day < 1440; day++) advanceWorld(world, 1, deps);
  assert(world.villages.some(village => village.houses?.length), 'fixture must contain real houses');
  const before = sha(world), host = makeHost(world), derived = deriveSettlements(world).buildings;
  try {
    host.setArtProfile('realm-style-v1'); host.setLODEnabled(true); host.update(0.3);
    setView(host, 0.1); host.update(0.3); setView(host, 0.1);
    const settlement = host.stages.get('mortal').settlements;
    assert(settlement.stats.hlodClusters > 0, 'far view must use real HLOD clusters');
    const entries = settlement._hlodPickEntries;
    assert(entries.length > 0 && settlement.hlodCluster.count === entries.length);
    let membersChecked = 0;
    for (const entry of entries) {
      assert(entry.members?.length > 0 && entry.buildings?.length > 0, 'cluster needs real member indexes');
      for (const sourceIndex of entry.buildings) {
        const member = derived[sourceIndex];
        assert(member, `HLOD member ${sourceIndex} must resolve to a derived building`);
        assert.equal(member.settlementId, entry.settlementId);
        membersChecked++;
      }
    }
    assert(membersChecked > 0);
    const region = makeRegion(world);
    host.setRealmViewState({ open: true, targetPlane: 'upper', region });
    host.update(0.3); setView(host, 0.1); host.update(0.3); setView(host, 0.1);
    const stage = host.stages.get('mortal');
    assert(stage.regionGeometry, 'realm window must install shared region geometry');
    for (const layer of [stage.vegetation, stage.entities, stage.settlements]) {
      if (layer) assert.equal(layer.regionGeometry, stage.regionGeometry);
    }
    const inside = (x, y) => stage.regionGeometry.isInsideCell(x, y);
    for (const tree of stage.vegetation.trees || []) assert.equal(inside(tree.x, tree.y), false);
    const visibleEntries = stage.settlements._hlodPickEntries;
    for (const entry of visibleEntries) {
      const cells = entry.buildings.map(index => derived[index]);
      assert(cells.length > 0 && cells.every(item => !inside(item.x, item.y)), 'HLOD cannot cross the realm window');
    }
    assert.equal(sha(world), before, 'rendering and region ownership must not mutate World');
    results.hlodRegion = { memberClusters: entries.length, membersChecked, visibleWindowClusters: visibleEntries.length };
  } finally { host.dispose(); }
});

for (const mode of MODES) {
  const world = worldFor(908), state = createAdvanceState(), fixtures = openFixture(world);
  let calls = 0; const byStream = {};
  const counted = (name, rng) => {
    byStream[name] = 0;
    return () => { calls++; byStream[name]++; return rng(); };
  };
  const life = new Life(world, counted('life', mulberry32(world.seed ^ 0xa5a5a5a5)));
  const upperLife = new UpperLife(world.upper);
  const deps = {
    life, upperLife, state, rng: counted('advance', mulberry32(world.seed ^ 0x1a2b3c4d)),
    nether: true, wraith: true, riftActive: true,
  };
  life.warRng = counted('war', life.warRng);
  upperLife.rng = counted('upper', upperLife.rng);
  upperLife.spatialRng = counted('upperSpatial', upperLife.spatialRng);
  const host = mode === 'no-render' ? null : makeHost(world);
  const region = makeRegion(world);
  try {
    if (host) {
      host.setArtProfile(mode === 'legacy' ? 'legacy' : 'realm-style-v1');
      host.setLODEnabled(true);
      if (mode === 'nether-view-v1') host.setRealmViewState({ open: true, targetPlane: 'nether', region });
      if (mode === 'upper-view-v1') host.setRealmViewState({ open: true, targetPlane: 'upper', region });
      host.update(0.2);
    }
    for (let day = 0; day < 600; day++) {
      advanceWorld(world, 1, deps);
      if (!host) continue;
      const before = calls;
      if (mode === 'toggle-cycle') {
        if (day % 15 === 0) host.setArtProfile(['legacy', 'realm-style-v1'][Math.floor(day / 15) % 2]);
        if (day % 20 === 0) {
          host.cameraRig.camera.zoom = 1 + (day % 60) / 20;
          host.cameraRig.camera.updateProjectionMatrix();
        }
        if (day % 12 === 0) {
          const phase = Math.floor(day / 12) % 3;
          host.setRealmViewState(phase === 0 ? { open: false, targetPlane: null, region: null }
            : { open: true, targetPlane: phase === 1 ? 'upper' : 'nether', region });
        }
      }
      host.update(0.2);
      assert.equal(calls, before, `${mode}: presentation update must not consume direct simulation RNG`);
    }
    assert.equal(world.day, 600);
    assert(world.rifts.some(rift => rift.targetPlane === 'upper' && rift.age > 0));
    assert(world.rifts.some(rift => rift.targetPlane === 'nether' && rift.age > 0));
    assert(calls > 0, 'five direct RNG wrappers must record real simulation draws');
    assert(Object.keys(byStream).length === 5, `expected exactly five direct streams, got ${Object.keys(byStream)}`);
    const snap = snapshot(world, state);
    const hidden = hiddenRngPositions(world);
    const directCounts = { ...byStream };
    const row = {
      mode, days: world.day, riftFixture: fixtures, worldSha: snap.worldSha,
      advanceStateSha: snap.advanceStateSha, fullSha: snap.fullSha, saveSha: snap.saveSha,
      saveKeys: snap.saveKeys, populations: {
        mortal: world.entities.length, upper: world.upper.entities.length,
        nether: world.nether.entities.length, wraiths: world.wraiths?.length || 0,
      }, rng: { directCounts, hiddenPositions: hidden, directTotal: calls,
        hiddenTotal: Object.values(hidden).reduce((a, b) => a + b, 0) },
    };
    results.modes.push(row);
    if (results.modes.length > 1) {
      const baseline = results.modes[0];
      for (const key of ['worldSha', 'advanceStateSha', 'fullSha', 'saveSha']) assert.equal(row[key], baseline[key], `${mode} ${key}`);
      assert.deepEqual(row.saveKeys, baseline.saveKeys, `${mode} save keys`);
      assert.deepEqual(row.rng, baseline.rng, `${mode} 11-stream RNG accounting`);
    }
    console.log(`${mode}: world=${row.worldSha.slice(0, 12)} advance=${row.advanceStateSha.slice(0, 12)} save=${row.saveSha.slice(0, 12)} rng=${JSON.stringify(row.rng)}`);
  } finally { host?.dispose(); }
}

assert.equal(results.modes.length, MODES.length);
assert(results.modes.every(row => RNG_STREAMS.every(([name]) => Number.isInteger(row.rng.hiddenPositions[name]))));
results.passed = true;
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'm2c2b0-results.json'), JSON.stringify(results, null, 2));
console.log(`${results.checks.length} checks passed; six 600-day modes share full digest ${results.modes[0].fullSha}; report ${OUT_DIR}`);
