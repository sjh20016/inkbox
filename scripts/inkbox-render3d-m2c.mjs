#!/usr/bin/env node
// Render3D M2-C art-pass contracts. Runs headlessly with Three.js stubs from M2-A.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { fileURLToPath } from 'node:url';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { Life } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { spawnNetherGhost } from '../src/inkbox/sim/netherLife.js';
import { ART_CONTROLS, ART_PROFILES, resolveArtProfile } from '../src/inkbox/render3d/art/ArtPassProfile.js';
import { TerrainDataTextures } from '../src/inkbox/render3d/art/TerrainDataTextures.js';
import { PigmentTerrainMaterial } from '../src/inkbox/render3d/art/PigmentTerrainMaterial.js';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';
import { VIEW_MAX_AREA_FRAC } from '../src/inkbox/ui/realmView.js';

let passed = 0;
const checks = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = (label, run) => {
  run(); passed += 1; checks.push({ label, status: 'passed' }); console.log(`PASS ${label}`);
};

function makeWorld(seed = 916263, preset = { w: 64, h: 48 }) {
  const world = generateWorld({ preset, seed, scatter: true });
  world.upper = generateUpperWorld({ preset, seed: world.seed });
  world.nether = generateNetherWorld({ preset, seed: world.seed });
  for (let i = 0; i < 30; i++) spawnNetherGhost(world.nether, { kind: 'ghost', decayYears: 10 });
  return world;
}

function hostOptions() {
  const gpu = {
    info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } },
    setPixelRatio() {}, setClearColor() {}, setSize() {}, render() {},
    disposeCount: 0, dispose() { this.disposeCount += 1; },
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

function snapshot(world) {
  return JSON.stringify(world);
}

function updateRanges(texture) {
  return texture.updateRanges.map(range => ({ start: range.start, count: range.count }));
}

function regionFor(world, points = [[12, 10], [40, 10], [40, 32], [12, 32]]) {
  const selection = normalizeRegion(points, world, VIEW_MAX_AREA_FRAC);
  assert.ok(selection, 'fixture region must be valid');
  return new RegionMask(selection);
}

check('ArtPassProfile: known presets are immutable, custom values clamp, and profile resolution is pure', () => {
  const world = makeWorld(901, { w: 17, h: 13 });
  const before = snapshot(world);
  assert.deepEqual(Object.keys(ART_PROFILES).sort(), ['baseline', 'ink', 'legacy', 'low', 'pigment', 'pilot', 'realm-style-v1']);
  assert(Object.isFrozen(ART_PROFILES) && Object.values(ART_PROFILES).every(Object.isFrozen));
  const input = { pigmentDensity: -7, paperGrainStrength: 2, distanceFade: 0.31, paperColor: '#abcdef', enabled: true };
  const resolved = resolveArtProfile(input);
  assert.equal(resolved.pigmentDensity, ART_CONTROLS.pigmentDensity[0]);
  assert.equal(resolved.paperGrainStrength, ART_CONTROLS.paperGrainStrength[1]);
  assert.equal(resolved.distanceFade, 0.31);
  assert.equal(resolved.paperColor, '#abcdef');
  assert.equal(resolved.enabled, true);
  assert(Object.isFrozen(resolved));
  assert.equal(resolveArtProfile('missing'), ART_PROFILES.pilot);
  assert.equal(resolveArtProfile('baseline').enabled, false);
  assert.equal(resolveArtProfile({ paperColor: 'red' }).paperColor, ART_PROFILES.pilot.paperColor);
  assert.equal(snapshot(world), before, 'resolving visual profiles must not touch World');
});

check('TerrainDataTextures: deterministic RGBA snapshots use nearest sampling and never write World', () => {
  const world = makeWorld(902, { w: 19, h: 11 });
  world.height[3 * world.w + 4] = 0.625;
  world.type[3 * world.w + 4] = 2;
  const before = snapshot(world), elevation = new ElevationField(world);
  const a = new TerrainDataTextures(world, elevation), b = new TerrainDataTextures(world, elevation);
  try {
    assert.deepEqual(a.heights, b.heights);
    assert.deepEqual(a.types, b.types);
    assert.equal(a.heightTexture.image.width, 19); assert.equal(a.heightTexture.image.height, 11);
    assert.equal(a.typeTexture.image.width, 19); assert.equal(a.typeTexture.image.height, 11);
    assert.equal(a.heights.length, world.size * 4); assert.equal(a.types.length, world.size * 4);
    assert.equal(a.heightTexture.format, THREE.RGBAFormat); assert.equal(a.heightTexture.type, THREE.FloatType);
    assert.equal(a.typeTexture.format, THREE.RGBAFormat); assert.equal(a.typeTexture.type, THREE.UnsignedByteType);
    for (const texture of [a.heightTexture, a.typeTexture]) {
      assert.equal(texture.minFilter, THREE.NearestFilter); assert.equal(texture.magFilter, THREE.NearestFilter);
      assert.equal(texture.generateMipmaps, false); assert.equal(texture.flipY, false); assert.equal(texture.unpackAlignment, 1);
    }
    const i = 3 * world.w + 4;
    assert.equal(a.heights[i * 4], world.height[i]);
    assert.ok(Math.abs(a.heights[i * 4 + 1] - elevation.node(4, 3)) < 1e-5,
      'GPU snapshot stores the derived elevation in Float32 precision');
    assert.equal(a.types[i * 4], 2);
    assert.equal(snapshot(world), before);
  } finally { a.dispose(); b.dispose(); }
});

check('TerrainDataTextures: height/type dirty channels stay independent with r186 RGBA component ranges', () => {
  const world = makeWorld(903, { w: 13, h: 9 });
  const data = new TerrainDataTextures(world, new ElevationField(world));
  try {
    const ht = data.heightTexture, tt = data.typeTexture;
    ht.clearUpdateRanges(); tt.clearUpdateRanges();
    const initial = { ...data.uploads };
    const heightRegion = { x0: 2, y0: 1, x1: 3, y1: 2 };
    world.height[1 * world.w + 2] = 0.77;
    data.update(heightRegion, { height: true, type: false });
    assert.deepEqual(data.uploads, { height: initial.height + 1, type: initial.type, cells: initial.cells + 4 });
    assert.deepEqual(updateRanges(ht), [
      { start: (1 * world.w + 2) * 4, count: 2 * 4 },
      { start: (2 * world.w + 2) * 4, count: 2 * 4 },
    ]);
    assert.deepEqual(updateRanges(tt), []);
    assert.ok(Math.abs(data.heights[(1 * world.w + 2) * 4] - 0.77) < 1e-6);
    assert.ok(Math.abs(ht.image.data[(1 * world.w + 2) * 4] - 0.77) < 1e-6);

    ht.clearUpdateRanges(); tt.clearUpdateRanges();
    const afterHeight = { ...data.uploads };
    const typeRegion = { x0: 7, y0: 4, x1: 7, y1: 4 };
    world.type[4 * world.w + 7] = 250; // unknown canonical type must be mapped to the safe fallback.
    data.update(typeRegion, { height: false, type: true });
    assert.deepEqual(data.uploads, { height: afterHeight.height, type: afterHeight.type + 1, cells: afterHeight.cells + 1 });
    assert.deepEqual(updateRanges(ht), []);
    assert.deepEqual(updateRanges(tt), [{ start: (4 * world.w + 7) * 4, count: 4 }]);
    assert.equal(data.types[(4 * world.w + 7) * 4], 5);
    assert.equal(data.types[(4 * world.w + 7) * 4 + 1], 0, 'unused channels stay zero');
    ht.clearUpdateRanges(); tt.clearUpdateRanges();
    const beforeNoop = { ...data.uploads };
    data.update(typeRegion, { height: false, type: false });
    data.update({ x0: 40, y0: 40, x1: 41, y1: 41 });
    assert.deepEqual(data.uploads, beforeNoop);
  } finally { data.dispose(); }
});

check('PigmentTerrainMaterial: map size, profile uniforms, opaque output and cached material updates', () => {
  const world = makeWorld(904, { w: 23, h: 15 });
  const data = new TerrainDataTextures(world, new ElevationField(world));
  const profile = resolveArtProfile({ paperColor: '#e2d8c7', pigmentDensity: 0.73, inkDensity: 0.22 });
  const material = new PigmentTerrainMaterial(data, profile);
  try {
    assert.equal(material.name, 'Inkbox:PigmentTerrain');
    assert.equal(material.uniforms.mapSize.value.x, 23); assert.equal(material.uniforms.mapSize.value.y, 15);
    assert.equal(material.uniforms.heightTexture.value, data.heightTexture);
    assert.equal(material.uniforms.typeTexture.value, data.typeTexture);
    assert.equal(material.uniforms.pigmentDensity.value, 0.73);
    assert.equal(material.uniforms.inkDensity.value, 0.22);
    assert.equal(material.uniforms.paperColor.value.getHexString(), 'e2d8c7');
    assert.equal(material.transparent, false);
    assert.match(material.fragmentShader, /gl_FragColor=vec4\(color,1\.0\)/);
    const next = resolveArtProfile({ paperColor: '#faf8f1', pigmentDensity: 1.5 });
    material.setProfile(next);
    assert.equal(material.uniforms.paperColor.value.getHexString(), 'faf8f1');
    assert.equal(material.uniforms.pigmentDensity.value, ART_CONTROLS.pigmentDensity[1]);
    assert.equal(material.uniforms.mapSize.value.x, 23, 'profile updates must retain this material texture dimension');
  } finally { material.dispose(); data.dispose(); }
});

check('TerrainMesh / Host art toggle: original Lambert is restored and repeated toggles reuse cached art resources', () => {
  const world = makeWorld(905, { w: 32, h: 24 });
  const before = snapshot(world), { host } = makeHost(world);
  try {
    assert.equal(typeof host.setArtProfile, 'function', 'Host exposes the art profile entry point');
    const stage = host.stages.get('mortal'), terrain = stage.terrain;
    const original = terrain.material, originalMeshMaterial = terrain.mesh.material;
    assert.equal(original, originalMeshMaterial);
    assert.equal(original.isMeshLambertMaterial, true);
    host.setArtProfile('pilot');
    const data = terrain.artData, ink = terrain.inkMaterial;
    assert(data instanceof TerrainDataTextures); assert(ink instanceof PigmentTerrainMaterial);
    assert.equal(terrain.material, original, 'compatibility material reference stays Lambert');
    assert.equal(terrain.mesh.material, ink);
    assert.equal(ink.uniforms.mapSize.value.x, world.w); assert.equal(ink.uniforms.mapSize.value.y, world.h);
    assert.equal(JSON.stringify(host.art.profile), JSON.stringify(resolveArtProfile('pilot')));
    for (const profile of ['ink', 'pigment', 'low', 'pilot']) {
      host.setArtProfile(profile);
      assert.equal(terrain.mesh.material, ink, 'profile changes reuse the one ShaderMaterial');
      assert.equal(terrain.artData, data, 'profile changes reuse the same texture pair');
    }
    for (let i = 0; i < 4; i++) {
      host.setArtProfile('baseline');
      assert.equal(terrain.mesh.material, original);
      host.setArtProfile('pilot');
      assert.equal(terrain.mesh.material, ink);
      assert.equal(terrain.inkMaterial, ink); assert.equal(terrain.artData, data);
    }
    assert.equal(snapshot(world), before, 'enabling, tuning and disabling art must leave World unchanged');
  } finally { host.dispose(); }
});

check('Host art resource lifetime: profile-off retains cache; final dispose releases each material and texture once', () => {
  const world = makeWorld(906, { w: 28, h: 20 }), { host } = makeHost(world);
  const stage = host.stages.get('mortal'), terrain = stage.terrain;
  const disposed = new Map();
  const watch = resource => {
    let count = 0;
    resource.addEventListener('dispose', () => { count += 1; });
    disposed.set(resource, () => count);
  };
  host.setArtProfile('pilot');
  const resources = [terrain.material, terrain.inkMaterial, terrain.artData.heightTexture, terrain.artData.typeTexture];
  resources.forEach(watch);
  host.setArtProfile('baseline');
  assert.equal(terrain.mesh.material, terrain.material);
  assert(disposed.get(terrain.inkMaterial)() === 0, 'turning art off keeps cached shader material reusable');
  assert(disposed.get(terrain.artData.heightTexture)() === 0);
  host.setArtProfile('pilot');
  assert.equal(terrain.mesh.material, terrain.inkMaterial);
  host.dispose(); host.dispose();
  for (const resource of resources) assert.equal(disposed.get(resource)(), 1, `${resource.name || resource.constructor.name} disposed exactly once`);
});

check('Art-off pauses texture uploads and re-enabling performs one complete resync using the same cache', () => {
  const world = makeWorld(909, { w: 26, h: 18 }), { host } = makeHost(world);
  try {
    const terrain = host.stages.get('mortal').terrain;
    host.setArtProfile('pilot');
    const data = terrain.artData, material = terrain.inkMaterial;
    host.setArtProfile('baseline');
    const quiet = { ...data.uploads };
    const index = 7 * world.w + 9;
    world.height[index] += 0.4; world.type[index] = (world.type[index] + 1) % 23;
    host.update(0.2);
    assert.deepEqual(data.uploads, quiet, 'disabled art must not enqueue texture work');
    host.setArtProfile('pilot');
    assert.deepEqual(data.uploads, { height: quiet.height + 1, type: quiet.type + 1, cells: quiet.cells + world.size });
    assert.ok(Math.abs(data.heights[index * 4] - world.height[index]) < 1e-5);
    assert.equal(data.types[index * 4], world.type[index]);
    assert.equal(terrain.artData, data); assert.equal(terrain.inkMaterial, material);
    assert.equal(terrain.mesh.material, material);
  } finally { host.dispose(); }
});

check('Stage integration: view mask and elevation-profile dirty changes synchronize art textures', () => {
  const world = makeWorld(907, { w: 48, h: 36 }), { host } = makeHost(world);
  try {
    const upper = host.stages.get('upper');
    host.setArtProfile('pilot');
    const region = regionFor(world);
    host.setRealmViewState({ open: true, targetPlane: 'upper', region });
    assert.equal(upper.regionMask, region);
    assert.equal(upper.terrain.regionMask, region);
    assert.equal(upper.terrain.mesh.material, upper.terrain.inkMaterial);
    host.setBoundaryMode('strata');
    host.update(0.2);
    const data = upper.terrain.artData, index = 18 * world.w + 24;
    assert.ok(Math.abs(data.heights[index * 4 + 1] - upper.elevation.node(24, 18)) < 1e-5);
    const oldVisual = data.heights[index * 4 + 1];
    upper.world.height[index] += 0.35;
    host.update(0.2);
    assert.equal(data.heights[index * 4], upper.world.height[index]);
    assert.ok(Math.abs(data.heights[index * 4 + 1] - upper.elevation.node(24, 18)) < 1e-5);
    assert.notEqual(data.heights[index * 4 + 1], oldVisual, 'dirty height update refreshes the final stage elevation channel');

    // The stratum profile may be rebuilt once after a height change; let its
    // full-map synchronization settle before checking the independent type path.
    host.update(0.2);
    const oldType = data.types[index * 4];
    upper.world.type[index] = (oldType + 1) % 23;
    const beforeHeightUploads = data.uploads.height, beforeTypeUploads = data.uploads.type;
    host.update(0.2);
    assert.equal(data.types[index * 4], upper.world.type[index]);
    assert.equal(data.uploads.type, beforeTypeUploads + 1);
    assert.equal(data.uploads.height, beforeHeightUploads, 'type dirty does not rewrite the height texture');
    assert.equal(data.heights[index * 4], upper.world.height[index]);
    assert.equal(upper.terrain.regionGeometry, upper.regionGeometry, 'terrain uses the Stage-owned mask geometry');
  } finally { host.dispose(); }
});

check('600-day simulation digest stays identical with art disabled, enabled, tuned and repeatedly toggled', () => {
  // Sandbox's real UpperLife derives its independent streams from upper.seed.
  // Hash the complete serializable world so newly added fields and typed arrays
  // cannot silently escape the purity comparison.
  const digest = world => createHash('sha256').update(JSON.stringify(world)).digest('hex');
  const run = mode => {
    const world = makeWorld(908);
    const opts = {
      life: new Life(world, mulberry32(world.seed ^ 0xa5a5a5a5)),
      upperLife: new UpperLife(world.upper),
      state: createAdvanceState(), rng: mulberry32(world.seed ^ 0x1a2b3c4d),
      nether: true, wraith: true, riftActive: true,
    };
    const host = mode === 'canvas' ? null : makeHost(world).host;
    for (let round = 0; round < 20; round++) {
      advanceWorld(world, 30, opts);
      if (host) {
        if (mode === 'toggle') {
          host.setArtProfile(round % 3 === 0 ? 'baseline' : (round % 3 === 1 ? 'pigment' : {
            paperColor: '#e5dfd4', pigmentDensity: 0.81, silhouetteInkStrength: 0.37,
          }));
          if (round % 4 === 0) host.setActivePlane(['mortal', 'upper', 'nether'][round % 3]);
          if (round % 5 === 0) host.setRealmViewState({ open: true, targetPlane: 'upper', region: regionFor(world) });
          if (round % 5 === 1) host.setRealmViewState({ open: false, targetPlane: null, region: null });
        } else host.setArtProfile('baseline');
        host.update(0.2);
      }
    }
    const value = digest(world);
    assert.equal(world.day, 600);
    assert(world.entities.length > 0 && world.upper.entities.length > 0 && world.nether.entities.length > 0,
      'purity fixture must contain active populations');
    host?.dispose();
    return value;
  };
  const baseline = run('canvas');
  assert.equal(run('disabled'), baseline, 'ordinary Render3D stage remains simulation-pure');
  assert.equal(run('toggle'), baseline, 'all profile changes, masks and texture updates remain presentation-only');
});

const reportDir = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(root, 'reports', 'release', 'render3d-m2c'));
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'm2c-results.json'), JSON.stringify({
  suite: 'Render3D M2-C contract and integration', status: 'passed', passed, failed: 0, checks,
  simulation: { days: 600, comparedRuns: ['canvas-no-stage', 'render3d-art-disabled', 'render3d-art-profile-toggle'], digestEqual: true },
}, null, 2) + '\n');
fs.writeFileSync(path.join(reportDir, 'm2c.log'), `${checks.map(({ label }) => `PASS ${label}`).join('\n')}\n\n${passed} M2-C invariant groups passed.\n`);
console.log(`\n${passed} M2-C invariant groups passed; report: reports/release/render3d-m2c/m2c-results.json`);
