import * as THREE from '../../../vendor/three/build/three.module.js';
import { ASSETS, createRuinsLibrary } from '../src/ruinsLibrary.js';
import { REALMS, STYLES } from '../src/materials.js';
import { GalleryViewer } from '../src/viewer.js';

const output = document.querySelector('#results');
const status = document.querySelector('#status');
const canvas = document.querySelector('#preview');
const report = { status: 'running', environment: {}, checks: [], failures: [], coverage: {}, limits: [] };
const check = async (name, fn) => {
  try { const detail = await fn(); report.checks.push({ name, status: 'pass', ...(detail === undefined ? {} : { detail }) }); }
  catch (error) { report.failures.push({ name, error: error?.stack || String(error) }); }
  paintReport();
};
function paintReport() {
  report.status = report.failures.length ? 'fail' : 'running';
  status.textContent = report.status.toUpperCase();
  status.className = report.status;
  output.textContent = JSON.stringify(report, null, 2);
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}
function near(actual, expected, epsilon, message) {
  if (Math.abs(actual - expected) > epsilon) throw new Error(`${message}: expected ${expected} ± ${epsilon}, got ${actual}`);
}
function memorySnapshot(renderer) {
  return { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
}
function sameMemory(a, b) { return a.geometries === b.geometries && a.textures === b.textures; }

let renderer, library, scene, camera, currentGroup;
const shaderMessages = [];
const originalConsoleError = console.error.bind(console);
console.error = (...args) => { const line = args.map(String).join(' '); if (/shader|program|webgl/i.test(line)) shaderMessages.push(line); originalConsoleError(...args); };

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.setSize(420, 300, false);
  renderer.setClearColor('#d7d1bd', 1);
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
    const msg = [gl.getShaderInfoLog(vertexShader), gl.getShaderInfoLog(fragmentShader), gl.getProgramInfoLog(program)].filter(Boolean).join('\n');
    shaderMessages.push(msg || 'WebGL shader compile/link failure without driver log');
  };
  scene = new THREE.Scene(); scene.background = new THREE.Color('#d7d1bd');
  camera = new THREE.PerspectiveCamera(38, 420 / 300, .1, 100);
  camera.position.set(4.5, 3.2, 6.2); camera.lookAt(0, 1.15, 0);
  scene.add(new THREE.HemisphereLight('#fff4dc', '#536156', 2.2));
  const key = new THREE.DirectionalLight('#fff2d4', 2); key.position.set(-4, 7, 5); scene.add(key);
  library = createRuinsLibrary();
  report.environment = {
    userAgent: navigator.userAgent,
    webgl: renderer.getContext().getParameter(renderer.getContext().VERSION),
    shadingLanguage: renderer.getContext().getParameter(renderer.getContext().SHADING_LANGUAGE_VERSION),
    renderer: renderer.getContext().getParameter(renderer.getContext().RENDERER),
    vendor: renderer.getContext().getParameter(renderer.getContext().VENDOR),
    threeRevision: THREE.REVISION,
    canvas: `${canvas.width}x${canvas.height}`,
  };
  const debugRenderer = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
  report.environment.hardwareRenderer = debugRenderer
    ? renderer.getContext().getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL) : 'not exposed';
  paintReport();

  await check('WebGL context available', () => {
    if (renderer.getContext().isContextLost()) throw new Error('WebGL context is lost');
    return report.environment;
  });

  const combos = [];
  for (const asset of ASSETS) for (const state of asset.states) for (let lod = 0; lod < 3; lod++)
    for (const realm of REALMS) for (const style of STYLES) for (const light of [0, 1, 2]) combos.push({ asset, state: state.id, lod, realm, style, light });
  report.coverage.expectedRenderCombos = combos.length;
  let renderCount = 0, drawSamples = [];

  await check('Compile and render every asset/state/LOD/realm/style/light combination', async () => {
    for (const item of combos) {
      const batch = library.createBatch({ id: item.asset.id, lod: item.lod, state: item.state, realm: item.realm, style: item.style, light: item.light, outline: true });
      if (currentGroup) { scene.remove(currentGroup); currentGroup.userData.dispose(); }
      currentGroup = batch;
      scene.add(batch);
      const stats = library.statsFor(item.asset.id, item.lod, item.state);
      const radius = Math.max(1, stats.bounds.max[0] - stats.bounds.min[0], stats.bounds.max[1] - stats.bounds.min[1], stats.bounds.max[2] - stats.bounds.min[2]);
      camera.position.set(radius * .8, radius * .65 + .4, radius * 1.2);
      camera.lookAt(0, radius * .42, 0); camera.updateProjectionMatrix();
      renderer.info.reset(); renderer.render(scene, camera); renderCount++;
      const gl = renderer.getContext(), glError = gl.getError();
      if (glError !== gl.NO_ERROR) throw new Error(`${item.asset.id}/${item.state}/LOD${item.lod}/${item.realm}/${item.style}: WebGL error 0x${glError.toString(16)}`);
      if (shaderMessages.length) throw new Error(`${item.asset.id}/${item.state}/LOD${item.lod}/${item.realm}/${item.style}: ${shaderMessages[0]}`);
      if (renderCount === 1) drawSamples.push({ count: 1, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, expectedTriangles: stats.triangles });
      if (renderCount % 24 === 0) {
        report.coverage.renderedCombos = renderCount;
        paintReport();
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }
    return { rendered: renderCount, drawCallsForOne: drawSamples[0]?.calls, triangleAccountingSample: drawSamples[0] };
  });
  report.coverage.renderedCombos = renderCount;

  await check('Instance batching: 1 / 32 / 128 and triangle accounting', () => {
    const asset = ASSETS[0], state = asset.states[0].id, lod = 0, realm = 'mortal', style = 'toon';
    const metrics = [];
    for (const count of [1, 32, 128]) {
      if (currentGroup) { scene.remove(currentGroup); currentGroup.userData.dispose(); currentGroup = null; }
      const matrices = Array.from({ length: count }, (_, i) => new THREE.Matrix4().makeTranslation((i % 8) * 1.5, 0, Math.floor(i / 8) * 1.5));
      const batch = library.createBatch({ id: asset.id, lod, state, realm, style, light: 1, matrices, outline: true });
      scene.add(batch); currentGroup = batch;
      camera.position.set(9, 12, 20); camera.lookAt(5, 0, 5);
      renderer.info.reset(); renderer.render(scene, camera);
      const calls = renderer.info.render.calls, triangles = renderer.info.render.triangles;
      const unit = library.statsFor(asset.id, lod, state).triangles;
      const expected = unit * count;
      const expectedLines = batch.children[1].geometry.getAttribute('position').count / 2;
      equal(triangles, expected, `triangle count for batch ${count}`);
      equal(renderer.info.render.lines, expectedLines, `line count for batch ${count}`);
      if (calls < 1 || calls > 2) throw new Error(`batch ${count} expected one instanced body plus optional outline (1-2 calls), got ${calls}`);
      metrics.push({ count, calls, triangles, lines: renderer.info.render.lines, expectedTriangles: expected, expectedLines, buffers: library.stats() });
    }
    const small = metrics[0].calls, large = metrics[2].calls;
    if (large / small > 3) throw new Error(`draw-call growth is not bounded: 1=${small}, 128=${large}`);
    return metrics;
  });

  await check('Repeated batch create / dispose returns renderer memory to warm baseline', () => {
    if (currentGroup) { scene.remove(currentGroup); currentGroup.userData.dispose(); currentGroup = null; }
    const warm = library.createBatch({ id: ASSETS[0].id, outline: true }); scene.add(warm); renderer.render(scene, camera);
    scene.remove(warm); warm.userData.dispose(); renderer.render(scene, camera);
    const baseline = memorySnapshot(renderer);
    for (let i = 0; i < 6; i++) {
      const batch = library.createBatch({ id: ASSETS[i % ASSETS.length].id, lod: i % 3, outline: true });
      scene.add(batch); renderer.render(scene, camera);
      scene.remove(batch); batch.userData.dispose(); renderer.render(scene, camera);
      const now = memorySnapshot(renderer);
      if (!sameMemory(now, baseline)) throw new Error(`iteration ${i + 1}: renderer memory ${JSON.stringify(now)} differs from baseline ${JSON.stringify(baseline)}`);
    }
    return { baseline, repetitions: 6 };
  });

  await check('Batch disposal preserves borrowed library geometry and materials', () => {
    const asset = ASSETS[0], geom = library.geometryFor(asset.id), mat = library.materialFor('upper', 'ink', 2);
    let gd = 0, md = 0; geom.addEventListener('dispose', () => gd++); mat.addEventListener('dispose', () => md++);
    const batch = library.createBatch({ id: asset.id, realm: 'upper', style: 'ink', light: 2, outline: true });
    scene.add(batch); renderer.render(scene, camera); scene.remove(batch); batch.userData.dispose();
    equal(gd, 0, 'batch must not dispose shared geometry'); equal(md, 0, 'batch must not dispose shared material');
    equal(library.geometryFor(asset.id), geom, 'shared geometry remains cached');
    equal(library.materialFor('upper', 'ink', 2), mat, 'shared material remains cached');
    return { borrowedGeometrySurvived: true, borrowedMaterialSurvived: true };
  });

  await check('Final library release clears all owned resources', () => {
    if (currentGroup) { scene.remove(currentGroup); currentGroup.userData.dispose(); currentGroup = null; }
    library.dispose(); renderer.render(scene, camera);
    const stats = library.stats();
    equal(stats.geometries, 0, 'geometry count'); equal(stats.materials, 0, 'material count'); equal(stats.textures, 0, 'texture count'); equal(stats.geometryBytes, 0, 'owned geometry bytes'); equal(stats.batches, 0, 'batch count');
    if (!stats.disposed) throw new Error('library did not report disposed=true');
    const gpu = memorySnapshot(renderer);
    if (gpu.geometries !== 0 || gpu.textures !== 0) throw new Error(`renderer GPU resource counts remain after full release: ${JSON.stringify(gpu)}`);
    return { library: stats, rendererMemory: gpu };
  });
  renderer.dispose();
  await check('Viewer automatic LOD is stable; load/unload and destroy release resources', () => {
    const host = document.createElement('div');
    host.style.cssText = 'width:700px;height:500px;max-width:100%';
    document.querySelector('main').append(host);
    const viewer = new GalleryViewer(host);
    const outcomes = [];
    try {
      for (const variant of ['dormant', 'depleted']) {
        viewer.setState({ asset: 'shanhai.leyline.altar', variant, lod: 'auto' });
        for (const zoom of [.15, .3, .5, 1, 2, 4]) {
          viewer.camera.zoom = zoom; viewer.updateProjection(); viewer.checkAutoLOD();
          const builds = viewer.metrics.builds;
          for (let i = 0; i < 20; i++) viewer.checkAutoLOD();
          equal(viewer.metrics.builds, builds, `stable LOD: ${variant} zoom ${zoom}`);
          outcomes.push({ variant, zoom, lod: viewer.metrics.lod });
        }
      }
      for (let i = 0; i < 6; i++) {
        viewer.setState({ loaded: true, mode: i % 2 ? 'game' : 'stress', count: 128 });
        viewer.renderer.render(viewer.scene, viewer.camera);
        viewer.setState({ loaded: false }); viewer.renderer.render(viewer.scene, viewer.camera);
        equal(viewer.renderer.info.memory.geometries, 0, `viewer unload ${i} geometry`);
        equal(viewer.renderer.info.memory.textures, 0, `viewer unload ${i} textures`);
      }
      viewer.dispose(); viewer.dispose();
      equal(host.querySelectorAll('canvas').length, 0, 'viewer canvas removed');
      return { stableSamples: outcomes, loadUnloadCycles: 6, finalMemory: memorySnapshot(viewer.renderer) };
    } finally { viewer.dispose(); host.remove(); }
  });
} catch (error) {
  report.failures.push({ name: 'Harness startup/runtime', error: error?.stack || String(error) });
} finally {
  if (currentGroup && currentGroup.userData?.dispose) { scene?.remove(currentGroup); currentGroup.userData.dispose(); }
  if (library && !library.stats().disposed) library.dispose();
  renderer?.dispose();
  console.error = originalConsoleError;
  report.coverage = { ...report.coverage, assets: ASSETS.map(a => ({ id: a.id, states: a.states.map(s => s.id) })), realms: REALMS, styles: STYLES, lods: [0, 1, 2], lights: [0, 1, 2] };
  report.limits.push('Serial low-resolution representative WebGL renders; not a full game simulation, FPS benchmark, or multi-device compatibility test.');
  report.status = report.failures.length ? 'fail' : 'pass';
  status.textContent = report.status.toUpperCase(); status.className = report.status;
  output.textContent = JSON.stringify(report, null, 2);
}
