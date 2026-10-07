import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { ART_DEBUG_VIEWS, ART_DEBUG_MODES, artDebugOptions } from '../src/inkbox/render3d/art/ArtDiagnostics.js';
import { analyzeFramebuffer } from './inkbox-render3d-m2c2d1-framebuffer.mjs';
import { compareRuns } from './inkbox-render3d-m2c2d1-diagnostics.mjs';

const checks = [];
const check = (label, run) => { run(); checks.push({ label, pass: true }); console.log(`PASS ${label}`); };
const checkAsync = async (label, run) => { await run(); checks.push({ label, pass: true }); console.log(`PASS ${label}`); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function makeHost(development) {
  const preset = { w: 48, h: 32 }, seed = 20261007;
  const world = generateWorld({ preset, seed, scatter: true });
  world.upper = generateUpperWorld({ preset, seed });
  world.nether = generateNetherWorld({ preset, seed });
  const gpu = { info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } },
    setPixelRatio() {}, setClearColor() {}, setSize() {}, render() {}, dispose() {} };
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 500);
  camera.position.set(0, 60, 70); camera.lookAt(0, 0, 0);
  const cameraRig = { camera, update() {}, resize() {}, setDimensions() {}, focusOn() {}, dispose() {} };
  const host = new Render3DHost({ clientWidth: 900, clientHeight: 600 }, world,
    { gpu, cameraRig, artProfile: 'realm-style-v1', artDevelopment: development });
  return { host, world };
}

check('development queries are accepted locally and ignored on published origins', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    const options = artDebugOptions({ hostname, protocol: 'http:', search: '?artDebug=coast' });
    assert.equal(options.development, true); assert.equal(options.debugView, 'coast');
  }
  assert.equal(artDebugOptions({ hostname: 'example.com', protocol: 'https:', search: '?artDebug=coast&artdebug=1' }).debugView, 'final');
  assert.equal(artDebugOptions({ hostname: 'example.com', protocol: 'https:', search: '?artDebug=coast&artdebug=1' }).panel, false);
  assert.equal(artDebugOptions({ hostname: 'example.com', protocol: 'https:', search: '?artStyle=main-style' }).comparisonStyle, 'c2d1-style');
  assert.equal(artDebugOptions({ hostname: 'localhost', protocol: 'http:', search: '?artDebug=unknown' }).debugView, 'final');
});

check('all six debug views change uniforms only and restore final', () => {
  const { host, world } = makeHost(true);
  const before = digest(world), stages = [...host.stages.values()];
  const resources = stages.map(stage => ({ material: stage.terrain.inkMaterial,
    mesh: stage.terrain.mesh, field: stage.surfaceField?.texture ?? null,
    height: stage.terrain.artData.heightTexture, type: stage.terrain.artData.typeTexture }));
  const camera = host.cameraRig.camera.matrixWorld.toArray();
  try {
    for (const view of ART_DEBUG_VIEWS) {
      assert.equal(host.art.setDebugView(view), view);
      stages.forEach((stage, i) => {
        assert.equal(stage.terrain.inkMaterial.uniforms.artDebugMode.value, ART_DEBUG_MODES[view]);
        assert.equal(stage.terrain.inkMaterial, resources[i].material);
        assert.equal(stage.terrain.mesh, resources[i].mesh);
        assert.equal(stage.surfaceField?.texture ?? null, resources[i].field);
        assert.equal(stage.terrain.artData.heightTexture, resources[i].height);
        assert.equal(stage.terrain.artData.typeTexture, resources[i].type);
        assert.equal(stage.terrain.artData.typeTexture.magFilter, THREE.NearestFilter);
      });
      assert.equal(digest(world), before);
      assert.deepEqual(host.cameraRig.camera.matrixWorld.toArray(), camera);
    }
    host.art.setDebugView('final');
    stages.forEach(stage => assert.equal(stage.terrain.inkMaterial.uniforms.artDebugMode.value, 0));
    assert.throws(() => host.art.setDebugView('invalid'), /Unknown art debug view/);
  } finally { host.dispose(); }
});

check('production hosts stay in final even when called directly', () => {
  const { host } = makeHost(false);
  try {
    assert.equal(host.art.setDebugView('coast'), 'final');
    for (const stage of host.stages.values()) assert.equal(stage.terrain.inkMaterial.uniforms.artDebugMode.value, 0);
  } finally { host.dispose(); }
});

check('frequency diagnostics distinguish a flat wash, a gradient and fragmented strokes', () => {
  const measure = pixel => {
    const size = 40, bytes = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4, value = pixel(x, y);
      bytes.set([value, value, value, 255], i);
    }
    return analyzeFramebuffer(bytes, size, size, '#ffffff');
  };
  const flat = measure(() => 128), gradient = measure(x => Math.round(x * 255 / 39));
  const fragmented = measure((x, y) => ((x >> 2) + (y >> 2)) % 2 ? 255 : 0);
  assert.equal(flat.edgeDensity, 0); assert(flat.highFreqEnergy < 1e-12);
  assert(gradient.lowFreqEnergy > flat.lowFreqEnergy);
  assert(fragmented.highFreqEnergy > gradient.highFreqEnergy * 10);
  assert(fragmented.edgeDensity > gradient.edgeDensity);
  assert(Math.abs(fragmented.darkRatioL30 - .5) < .001);
});

check('Safety PASS never certifies art and never waives a positive GPU regression', () => {
  const view = { view: 'mortal-cliff-near', worldSHA256: 'world', advanceStateSHA256: 'advance', poi: { x: 10, y: 10 },
    camera: { position: [0, 10, 20], target: [0, 0, 0], zoom: 5 },
    gpu: { drawCalls: 1, triangles: 2, memory: { geometries: 1, textures: 1 }, programs: 1 },
    rendererInfo: { renderer: 'test GPU' }, measurement: { gpuRenderMs: { median: 10, p95: 12 } },
    metrics: { bufferSize: [100, 100], darkRatioL20: .01, darkRatioL30: .05, nearPaperRatio: .01,
      meanSaturation: .10, lstarSpan: 60, highFreqEnergy: .01, edgeDensity: .10, localContrast: .03 } };
  const run = () => ({ captureComplete: true, views: [structuredClone(view)], host: { hostname: 'same-machine' },
    browser: { browser: 'Edge', width: 1500, height: 940 } });
  const runs = { main: run(), c2d: run(), candidate: run() };
  runs.candidate.views[0].metrics.highFreqEnergy = .80;
  runs.candidate.views[0].metrics.nearPaperRatio = .001;
  runs.candidate.views[0].measurement.gpuRenderMs.median = 10.01;
  const result = compareRuns(runs, { partial: true });
  assert.equal(result.safetyGate.status, 'passed');
  assert.equal(result.artDiagnostics.acceptance, null);
  assert.equal(result.artDiagnostics.status, 'human-review-required');
  assert.equal(result.performance.status, 'observed-exceeds-target');
  delete runs.candidate.views[0].gpu.programs;
  const missing = compareRuns(runs, { partial: true });
  assert.equal(missing.safetyGate.status, 'failed');
  assert(missing.safetyGate.failures.some(message => message.includes('programs contract')));
});

await checkAsync('historical hot switches queue in order, restore the current shader and release a replaced World', async () => {
  const { host, world } = makeHost(true);
  const initial = digest(world), terrain = host.stages.get('mortal').terrain;
  const shader = terrain.inkMaterial.fragmentShader, geometry = terrain.geometry;
  const colors = terrain.inkMaterial.uniforms.palette.value.map(c => c.getHexString());
  try {
    const order = [], requested = ['main-style', 'c2d-style', 'c2d1-style'];
    const result = await Promise.all(requested.map(name => host.art.setComparisonStyle(name).then(value => { order.push(value); return value; })));
    assert.deepEqual(result, requested); assert.deepEqual(order, requested);
    assert.equal(host.stages.get('mortal').terrain.geometry, geometry);
    assert.equal(terrain.inkMaterial.fragmentShader, shader);
    assert.deepEqual(terrain.inkMaterial.uniforms.palette.value.map(c => c.getHexString()), colors);
    assert.equal(digest(world), initial);
    await host.art.setComparisonStyle('main-style');
    assert.equal(host.art.comparisonSourceRevision, '8b3f2bac761b59bf70f524ff9a00429fa40cc07a');
    assert.equal(host.stages.get('mortal').markers.riftColor('upper'), '#557D91');
    assert.equal(host.stages.get('mortal').markers.riftColor('nether'), '#8E302B');
    assert.throws(() => host.art.setDebugView('structure'), /historical final/);
    const legacy = host.boundary.mesh.material; let releases = 0;
    legacy.addEventListener('dispose', () => releases++);
    const next = generateWorld({ preset: { w: 48, h: 32 }, seed: 20261008, scatter: true });
    const beforeNext = digest(next);
    host.setWorld(next);
    assert.equal(releases, 1);
    assert.equal(host.stages.get('mortal').water.mesh.material.type, 'MeshBasicMaterial');
    await host.art.setComparisonStyle('c2d1-style');
    assert.equal(host.stages.get('mortal').terrain.inkMaterial.fragmentShader, shader);
    assert.equal(host.boundary.mesh.material, host.boundary.material);
    assert.equal(digest(next), beforeNext);
  } finally { host.dispose(); }
  const production = makeHost(false).host;
  try { assert.equal(await production.art.setComparisonStyle('main-style'), 'c2d1-style'); }
  finally { production.dispose(); }
});

fs.mkdirSync('reports/local/m2c2d1', { recursive: true });
fs.writeFileSync('reports/local/m2c2d1/cpu-contracts.json', JSON.stringify({ pass: true, checks, finishedAt: new Date().toISOString() }, null, 2));
console.log(`M2-C2D.1 CPU contracts: ${checks.length}/${checks.length} passed`);
