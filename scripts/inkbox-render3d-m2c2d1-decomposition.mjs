// Local diagnostic evidence, never a Golden fixture or artistic acceptance gate.
// One Edge, one imported canonical World, one frozen camera, default framebuffer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'reports/local/m2c2d1/decomposition');
const SOURCE = process.env.INKBOX_C2D1_CAMERA_SOURCE || ['E0-c2d', 'c2d', 'candidate']
  .map(label => path.join(ROOT, `reports/local/m2c2d1/${label}/browser.json`)).find(file => fs.existsSync(file));
const SAVE = path.resolve(ROOT, process.env.INKBOX_C2C_NATURAL_SAVE || 'reports/local/m2c2c/pilot/full-sites-natural-save.json');
const port = Number(process.env.INKBOX_PORT || 4241);
const base = process.env.INKBOX_URL || `http://127.0.0.1:${port}`;
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'diagnostics require localhost');
const decompositionOnly = process.argv.includes('--decomposition-only');
const report = { suite: 'M2-C2D.1 decomposition and diagnostic GPU coast contract', golden: false,
  startedAt: new Date().toISOString(), decompositionOnly, decomposition: { pass: false }, coast: { pass: false, skipped: decompositionOnly },
  height: { pass: false, skipped: decompositionOnly } };
let browser, server;
const page = body => browser.js(`return (async()=>{${body}})();`, { timeoutMs: 240000 });

// Runs synchronously through all draws/readbacks; async SHA starts only afterwards.
async function decompositionPage(recipe) {
  const k = window.inkbox, r = k.render3d.renderer, gl = r.gpu.getContext();
  const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
  const errors = () => { const a = []; for (let e = gl.getError(); e !== gl.NO_ERROR; e = gl.getError()) a.push(e); return a; };
  const toPNG = (bytes, W, H) => {
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d'), image = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) image.data.set(bytes.subarray(y * W * 4, (y + 1) * W * 4), (H - y - 1) * W * 4);
    ctx.putImageData(image, 0, 0); return canvas.toDataURL('image/png').split(',')[1];
  };
  const identity = () => ({ world: JSON.stringify(k.world), advance: JSON.stringify(k.advanceState),
    camera: { position: r.cameraRig.camera.position.toArray(), target: r.cameraRig.controls.target.toArray(),
      zoom: r.cameraRig.camera.zoom, projection: r.cameraRig.camera.projectionMatrix.toArray() },
    gpu: { drawCalls: r.gpu.info.render.calls, triangles: r.gpu.info.render.triangles,
      geometries: r.gpu.info.memory.geometries, textures: r.gpu.info.memory.textures, programs: r.gpu.info.programs?.length ?? null } });
  const pendingGlErrors = errors(), captures = [];
  const capture = (mode, png) => {
    if (r.art.setDebugView(mode) !== mode) throw Error('debug mode rejected: ' + mode);
    r.render();
    if (gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null) throw Error('capture is not the default framebuffer');
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, bytes = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    const state = identity();
    captures.push({ mode, debugView: r.art.debugView, bufferSize: [W, H], bytes,
      png: png ? toPNG(bytes, W, H) : null, glErrors: errors(), ...state });
  };
  capture('final', false);
  for (const mode of ['base', 'coast', 'mass', 'structure', 'atmosphere', 'final']) capture(mode, true);
  const records = [];
  for (const { bytes, world, advance, ...record } of captures) records.push({ ...record,
    framebufferSHA256: await sha(bytes), worldSHA256: await sha(new TextEncoder().encode(world)),
    advanceSHA256: await sha(new TextEncoder().encode(advance)) });
  return { recipe, pendingGlErrors, baseline: records[0], modes: records.slice(1),
    method: 'synchronous render + gl.readPixels(default framebuffer); PNG encoded from these same flipped RGBA bytes; SHA-256 of raw unflipped RGBA' };
}

// Tiny synthetic scalar textures and a private plane; no writes to k.world,
// no RenderTarget, no changes to main-scene geometry or presentation materials.
async function coastPage() {
  const T = await import('three');
  const { PigmentTerrainMaterial } = await import('./src/inkbox/render3d/art/PigmentTerrainMaterial.js');
  const { ART_PROFILES } = await import('./src/inkbox/render3d/art/ArtPassProfile.js');
  const k = window.inkbox, host = k.render3d.renderer, gpu = host.gpu, gl = gpu.getContext();
  const digest = async v => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(v))))].map(x => x.toString(16).padStart(2, '0')).join('');
  const before = { world: await digest(k.world), advance: await digest(k.advanceState) };
  const errors = () => { const a = []; for (let e = gl.getError(); e !== gl.NO_ERROR; e = gl.getError()) a.push(e); return a; };
  const pendingGlErrors = errors(), N = 16, resources = [];
  const texture = (values, type, filter = T.NearestFilter) => {
    const t = new T.DataTexture(values, N, N, T.RGBAFormat, type);
    t.minFilter = t.magFilter = filter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
    resources.push(t); return t;
  };
  const heights = new Float32Array(N * N * 4), types = new Uint8Array(N * N * 4), scalar = new Uint8Array(N * N * 4);
  const heightTexture = texture(heights, T.FloatType), typeTexture = texture(types, T.UnsignedByteType);
  const surfaceTexture = texture(scalar, T.UnsignedByteType, T.LinearFilter);
  const material = new PigmentTerrainMaterial({ world: { w: N, h: N, seed: 226 }, heightTexture, typeTexture }, ART_PROFILES.pilot);
  resources.push(material);
  const u = material.uniforms; u.artDebugMode.value = 2; u.surfaceTexture.value = surfaceTexture; u.surfaceDepthRef.value = 0.5;
  const scene = new T.Scene(), geometry = new T.PlaneGeometry(16, 16); geometry.rotateX(-Math.PI / 2); resources.push(geometry);
  scene.add(new T.Mesh(geometry, material));
  const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
  const camera = new T.OrthographicCamera(-8 * aspect, 8 * aspect, 8, -8, 0.1, 100);
  camera.position.set(0, 20, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const oldTarget = gpu.getRenderTarget(), oldColor = gpu.getClearColor(new T.Color()), oldAlpha = gpu.getClearAlpha();
  const oldViewport = gpu.getViewport(new T.Vector4()), oldScissor = gpu.getScissor(new T.Vector4()), oldScissorTest = gpu.getScissorTest();
  const samples = [], glErrors = [];
  const sample = (x, z) => {
    const point = new T.Vector3(x, 0, z).project(camera), px = Math.floor((point.x + 1) * gl.drawingBufferWidth / 2), py = Math.floor((point.y + 1) * gl.drawingBufferHeight / 2);
    const bytes = new Uint8Array(4); gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return [...bytes].slice(0, 3);
  };
  try {
    gpu.setRenderTarget(null); gpu.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gpu.setScissorTest(false); gpu.setClearColor(u.paperColor.value, 1);
    if (gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null) throw Error('GPU coast contract requires default framebuffer');
    const fixtures = [
      { name: 'dry-flat-inland', type: 5, mountain: false, depth: () => 0, points: [[-4, 0], [0, 0], [4, 0]], expect: 'same' },
      { name: 'dry-mountain-inland', type: 14, mountain: true, depth: () => 0, points: [[-4, 0], [0, 0], [4, 0]], expect: 'same' },
      { name: 'uniform-shallow-wet-is-not-shore', type: 2, mountain: false, depth: () => 0.02, points: [[-4, 0], [0, 0], [4, 0]], expect: 'same' },
      { name: 'wet-dry-transition', type: 5, mountain: false, depth: x => x >= 8 ? 0.02 : 0, points: [[0, 0]], expect: 'different' },
      { name: 'transition-far-dry-inland', type: 5, mountain: false, depth: x => x >= 8 ? 0.02 : 0, points: [[-5, 0]], expect: 'same' },
    ];
    for (const fixture of fixtures) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = (y * N + x) * 4; heights[i + 1] = fixture.mountain ? Math.abs(x - 8) * 2 : 0;
        types[i] = fixture.type; scalar[i] = Math.round(255 * fixture.depth(x, y) / u.surfaceDepthRef.value);
      }
      heightTexture.needsUpdate = typeTexture.needsUpdate = surfaceTexture.needsUpdate = true;
      u.surfaceMode.value = 0; gpu.render(scene, camera); const off = fixture.points.map(([x, z]) => sample(x, z));
      glErrors.push(...errors());
      u.surfaceMode.value = 1; gpu.render(scene, camera); const on = fixture.points.map(([x, z]) => sample(x, z));
      glErrors.push(...errors());
      const deltas = on.map((rgb, i) => Math.max(...rgb.map((v, c) => Math.abs(v - off[i][c]))));
      const pass = fixture.expect === 'same' ? deltas.every(d => d === 0) : deltas.some(d => d > 0);
      samples.push({ name: fixture.name, points: fixture.points, expect: fixture.expect, surfaceOffRGB: off, surfaceOnRGB: on, maxChannelDeltas: deltas, pass });
    }
  } finally {
    for (const resource of resources) resource.dispose();
    gpu.setRenderTarget(oldTarget); gpu.setViewport(oldViewport); gpu.setScissor(oldScissor); gpu.setScissorTest(oldScissorTest); gpu.setClearColor(oldColor, oldAlpha);
    host.render();
    glErrors.push(...errors());
  }
  const after = { world: await digest(k.world), advance: await digest(k.advanceState) };
  return { diagnosticOnly: true, golden: false, framebuffer: 'existing renderer default framebuffer', renderTargetsCreated: 0,
    size: [N, N], shader: 'production PigmentTerrainMaterial', comparison: 'same-position coast RGB with surfaceMode=0/1',
    pendingGlErrors, glErrors, before, after, samples,
    pass: samples.every(s => s.pass) && pendingGlErrors.length === 0 && glErrors.length === 0 && JSON.stringify(before) === JSON.stringify(after) };
}

// Execute verbatim production GLSL helpers on a private one-pixel viewport.
// RGB24 fixed-point encoding avoids judging sampling through art colours.
async function heightPage() {
  const T = await import('three');
  const { PigmentTerrainMaterial } = await import('./src/inkbox/render3d/art/PigmentTerrainMaterial.js');
  const { ART_PROFILES } = await import('./src/inkbox/render3d/art/ArtPassProfile.js');
  const k = window.inkbox, host = k.render3d.renderer, gpu = host.gpu, gl = gpu.getContext(), N = 16, R = 2.5;
  const digest = async v => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(v))))].map(x => x.toString(16).padStart(2, '0')).join('');
  const before = { world: await digest(k.world), advance: await digest(k.advanceState) };
  const errors = () => { const a = []; for (let e = gl.getError(); e !== gl.NO_ERROR; e = gl.getError()) a.push(e); return a; };
  const pendingGlErrors = errors(), glErrors = [], resources = [];
  const heights = new Float32Array(N * N * 4), types = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4; heights[i + 1] = 0.10 + 0.012 * x + 0.006 * y + 0.0008 * x * x;
    types[i] = (x + y * 3) % 23;
  }
  const texture = (data, type) => {
    const t = new T.DataTexture(data, N, N, T.RGBAFormat, type);
    t.minFilter = t.magFilter = T.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
    resources.push(t); return t;
  };
  const heightTexture = texture(heights, T.FloatType), typeTexture = texture(types, T.UnsignedByteType);
  const production = new PigmentTerrainMaterial({ world: { w: N, h: N, seed: 226 }, heightTexture, typeTexture }, ART_PROFILES.pilot);
  resources.push(production);
  const source = production.fragmentShader;
  const extract = name => {
    const match = new RegExp('(?:float|vec2)\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(source);
    if (!match) throw Error('production GLSL helper missing: ' + name);
    let depth = 1, end = match.index + match[0].length;
    for (; end < source.length && depth; end++) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
    if (depth) throw Error('unterminated production GLSL helper: ' + name);
    return source.slice(match.index, end);
  };
  let helpers;
  try { helpers = ['uvAt', 'hAt', 'typeAt', 'sampleHeightContinuous', 'sampleHeightBroad'].map(extract); }
  catch (error) {
    for (const resource of resources) resource.dispose();
    return { pass: false, diagnosticOnly: true, failure: String(error), pendingGlErrors };
  }
  const material = new T.ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false,
    uniforms: { heightTexture: { value: heightTexture }, typeTexture: { value: typeTexture }, mapSize: { value: new T.Vector2(N, N) },
      probePoint: { value: new T.Vector2() }, probeMode: { value: 0 } },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `uniform sampler2D heightTexture,typeTexture; uniform vec2 mapSize,probePoint; uniform float probeMode;
      ${helpers.join('\n')}
      void main(){
        float value=sampleHeightContinuous(probePoint);
        if(probeMode>0.5&&probeMode<1.5)value=hAt(probePoint);
        if(probeMode>1.5&&probeMode<2.5)value=typeAt(probePoint)/255.0;
        if(probeMode>2.5&&probeMode<3.5)value=sampleHeightBroad(probePoint);
        if(probeMode>3.5)value=0.5+(sampleHeightBroad(probePoint+vec2(2.5,0.0))-sampleHeightBroad(probePoint-vec2(2.5,0.0)))/5.0;
        float packed=floor(clamp(value,0.0,1.0)*16777215.0+0.5);
        gl_FragColor=vec4(floor(packed/65536.0),mod(floor(packed/256.0),256.0),mod(packed,256.0),255.0)/255.0;
      }` });
  resources.push(material);
  const geometry = new T.PlaneGeometry(2, 2); resources.push(geometry);
  const scene = new T.Scene(); scene.add(new T.Mesh(geometry, material));
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); camera.position.z = 1;
  const oldTarget = gpu.getRenderTarget(), oldViewport = gpu.getViewport(new T.Vector4()), oldScissor = gpu.getScissor(new T.Vector4()), oldScissorTest = gpu.getScissorTest();
  const at = (x, y) => heights[(Math.max(0, Math.min(15, y)) * N + Math.max(0, Math.min(15, x))) * 4 + 1];
  const expected = (x, y) => {
    x = Math.max(0, Math.min(15, x)); y = Math.max(0, Math.min(15, y));
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
  };
  const sample = (x, y, mode) => {
    material.uniforms.probePoint.value.set(x, y); material.uniforms.probeMode.value = mode;
    gpu.render(scene, camera);
    if (gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null) throw Error('height probe requires default framebuffer');
    const b = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); glErrors.push(...errors());
    return (b[0] * 65536 + b[1] * 256 + b[2]) / 16777215;
  };
  const tolerance = 2e-6, epsilon = 1e-4, integers = [], boundaries = [], gradient = [], categorical = [];
  let fractionalNegativeControl;
  try {
    gpu.setRenderTarget(null); gpu.setViewport(0, 0, 1, 1); gpu.setScissor(0, 0, 1, 1); gpu.setScissorTest(true);
    for (const y of [0, 4, 8, 15]) for (const x of [0, 4, 8, 15]) {
      const nearest = sample(x, y, 1), continuous = sample(x, y, 0), broad = sample(x, y, 3), type = Math.round(sample(x, y, 2) * 255), height = at(x, y);
      integers.push({ point: [x, y], expectedHeight: height, nearest, continuous, broad, type, expectedType: (x + y * 3) % 23,
        pass: [nearest, continuous, broad].every(v => Math.abs(v - height) <= tolerance) && type === (x + y * 3) % 23 });
    }
    // Both integer and half-integer boundaries catch nearest sampling hiding
    // behind one chosen probe location. Check both axes and clamped edges.
    for (const axis of ['x', 'y']) for (const center of [0, 4, 4.5, 7, 7.5, 10, 10.5, 15]) {
      const point = d => axis === 'x' ? [center + d, 7.25] : [7.25, center + d];
      const a = point(-epsilon), b = point(epsilon), left = sample(...a, 0), right = sample(...b, 0);
      const leftExpected = expected(...a), rightExpected = expected(...b), delta = Math.abs(right - left);
      boundaries.push({ axis, center, left, right, delta, expectedDelta: Math.abs(rightExpected - leftExpected),
        pass: Math.abs(left - leftExpected) <= tolerance && Math.abs(right - rightExpected) <= tolerance && delta < 2e-5 });
    }
    for (const x of [7.49, 7.51]) {
      const type = Math.round(sample(x, 7, 2) * 255), expectedType = (Math.floor(x + 0.5) + 21) % 23;
      categorical.push({ point: [x, 7], type, expectedType, pass: type === expectedType });
    }
    fractionalNegativeControl = { point: [7.25, 7.25], nearest: sample(7.25, 7.25, 1), continuous: sample(7.25, 7.25, 0) };
    fractionalNegativeControl.pass = Math.abs(fractionalNegativeControl.nearest - fractionalNegativeControl.continuous) > 0.001;
    for (let i = 0; i <= 104; i++) {
      const x = 4.25 + i / 16, y = 7.25, actual = sample(x, y, 4) - 0.5, want = (expected(x + R, y) - expected(x - R, y)) / (2 * R);
      gradient.push({ x, actual, expected: want, pass: Math.abs(actual - want) <= tolerance });
    }
  } finally {
    for (const resource of resources) resource.dispose();
    gpu.setRenderTarget(oldTarget); gpu.setViewport(oldViewport); gpu.setScissor(oldScissor); gpu.setScissorTest(oldScissorTest);
    host.render(); glErrors.push(...errors());
  }
  const after = { world: await digest(k.world), advance: await digest(k.advanceState) };
  const maxGradientStep = Math.max(...gradient.slice(1).map((v, i) => Math.abs(v.actual - gradient[i].actual)));
  const productionTextureFilters = [...host.stages.values()].filter(s => s.terrain?.artData).map(s => ({ plane: s.plane,
    height: [s.terrain.artData.heightTexture.minFilter, s.terrain.artData.heightTexture.magFilter],
    type: [s.terrain.artData.typeTexture.minFilter, s.terrain.artData.typeTexture.magFilter] }));
  const filtersNearest = [heightTexture, typeTexture].every(t => t.minFilter === T.NearestFilter && t.magFilter === T.NearestFilter)
    && productionTextureFilters.length > 0 && productionTextureFilters.every(s => [...s.height, ...s.type].every(f => f === T.NearestFilter));
  const massExpression = source.match(/float\s+massMask\s*=([^;]+);/)?.[1] || '';
  const sourceGuards = { massExpression, massUsesBroadWithoutFineSlope: /broad/i.test(massExpression) && !/\bslope\b/.test(massExpression),
    broadFiniteDifferenceUsesContinuousHelper: /float\s+bl\s*=\s*sampleHeightBroad\(/.test(source) && /float\s+bd\s*=\s*sampleHeightBroad\(/.test(source) };
  const checks = { filtersNearest, integerSamplingExact: integers.every(v => v.pass), boundaryContinuity: boundaries.every(v => v.pass),
    typeRetainsCategoricalBoundary: categorical.every(v => v.pass), fractionalNegativeControl: fractionalNegativeControl.pass,
    broadGradientMatchesBilinearReference: gradient.every(v => v.pass), noOneCellGradientJumps: maxGradientStep < 0.0002,
    sourceGuards: sourceGuards.massUsesBroadWithoutFineSlope && sourceGuards.broadFiniteDifferenceUsesContinuousHelper,
    stateUnchanged: JSON.stringify(before) === JSON.stringify(after), noGLErrors: !pendingGlErrors.length && !glErrors.length };
  return { pass: Object.values(checks).every(Boolean), checks, diagnosticOnly: true, golden: false, renderTargetsCreated: 0,
    method: 'verbatim production GLSL helpers; GPU RGB24 float encoding; default framebuffer gl.readPixels; independent CPU bilinear reference',
    fixture: { size: [N, N], equation: '0.10 + 0.012*x + 0.006*y + 0.0008*x*x (Float32)', R, gradientStep: 1 / 16, tolerance, epsilon },
    extractedHelpers: helpers, textureFilters: { height: [heightTexture.minFilter, heightTexture.magFilter], type: [typeTexture.minFilter, typeTexture.magFilter] },
    productionTextureFilters, sourceGuards, before, after, pendingGlErrors, glErrors, integers, boundaries, categorical,
    fractionalNegativeControl, gradient, maxGradientStep };
}

try {
  fs.mkdirSync(OUT, { recursive: true });
  assert(SOURCE, 'fixed camera evidence missing; run test:render3d:m2c2d1:browser first');
  const source = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const view = source.views.find(v => v.view === 'mortal-cliff-near');
  assert(source.captureComplete && view?.poi && view?.camera, 'E0-c2d frozen cliff evidence unavailable');
  const [x, y, z] = view.camera.position.map((v, i) => v - view.camera.target[i]);
  const recipe = { source: path.relative(ROOT, SOURCE), view: view.view, poi: view.poi,
    zoom: view.camera.zoom, yaw: Math.atan2(x, z), polar: Math.atan2(Math.hypot(x, z), y) };
  assert(fs.existsSync(SAVE), 'canonical mortal save missing');
  if (!process.env.INKBOX_URL) {
    server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(port)], { cwd: ROOT, windowsHide: true, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 100; i++) { if (server.exitCode !== null) throw Error('owned server exited'); try { ready = (await fetch(`${base}/inkbox.html`)).ok; } catch {} if (ready) break; await sleep(200); }
    assert(ready, 'local server unavailable');
  }
  const edge = findEdge(); assert(edge, 'Edge unavailable');
  browser = await launch({ url: 'about:blank', browser: edge, width: 1500, height: 940, gpu: true });
  const url = new URL('/inkbox.html?renderer=3d&assets=on&boundary=strata&geography=on', base);
  await browser.cdp.send('Page.navigate', { url: url.href });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.art', { timeoutMs: 60000 }));
  await page('window.inkbox.setSpeed(0);return true;');
  const { root } = await browser.cdp.send('DOM.getDocument');
  const { nodeId } = await browser.cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#inkImportFile' });
  assert(nodeId, 'product import input missing');
  await browser.cdp.send('DOM.setFileInputFiles', { nodeId, files: [SAVE] });
  assert(await browser.waitFor('return window.inkbox?.world?.seed===226&&window.inkbox?.world?.day===72000', { timeoutMs: 60000 }), 'canonical product import failed');
  report.camera = await page(`const k=window.inkbox,r=k.render3d.renderer;k.setSpeed(0);r.setProductionAssetsEnabled(true);
    await r.environmentLoadPromise;if(r.environmentLoadError)throw r.environmentLoadError;
    await r.characterLoadPromise;if(r.characterLoadError)throw r.characterLoadError;
    r.setGeographyEnabled(true);k.selection=null;r.setRealmViewState(k.getRealmViewState());r.setActivePlane('mortal');
    const v=await import('./src/inkbox/render3d/art/VisualScenarios.js');
    const cam=v.applyCamera(r,'WORLD_OVERVIEW',${JSON.stringify(recipe)});
    for(let i=0;i<24;i++)await new Promise(requestAnimationFrame);return cam;`);
  report.decomposition = await page(`return (${decompositionPage.toString()})(${JSON.stringify(recipe)});`);
  const d = report.decomposition;
  for (const mode of d.modes) {
    fs.writeFileSync(path.join(OUT, `${mode.mode}.png`), Buffer.from(mode.png, 'base64'));
    delete mode.png; mode.image = `reports/local/m2c2d1/decomposition/${mode.mode}.png`;
  }
  delete d.baseline.png;
  d.invariants = { sameWorld: d.modes.every(m => m.worldSHA256 === d.baseline.worldSHA256),
    sameAdvance: d.modes.every(m => m.advanceSHA256 === d.baseline.advanceSHA256),
    sameCamera: d.modes.every(m => JSON.stringify(m.camera) === JSON.stringify(d.baseline.camera)),
    sameGPU: d.modes.every(m => JSON.stringify(m.gpu) === JSON.stringify(d.baseline.gpu)),
    completeResourceEvidence: [d.baseline, ...d.modes].every(m => Number.isFinite(m.gpu.programs) && m.gpu.programs > 0),
    distinctLayerOutputs: d.modes.slice(0, -1).every(m => m.framebufferSHA256 !== d.baseline.framebufferSHA256),
    diagnosticModesDiffer: new Set(d.modes.map(m => m.framebufferSHA256)).size === 6,
    roundTripFinal: d.modes.at(-1).framebufferSHA256 === d.baseline.framebufferSHA256,
    noGLErrors: !d.pendingGlErrors.length && [d.baseline, ...d.modes].every(m => !m.glErrors.length) };
  d.pass = Object.values(d.invariants).every(Boolean);
  fs.writeFileSync(path.join(OUT, 'decomposition.json'), JSON.stringify(d, null, 2) + '\n');
  if (!decompositionOnly) {
    report.coast = await page(`return (${coastPage.toString()})();`);
    fs.writeFileSync(path.join(OUT, 'coast-contract.json'), JSON.stringify(report.coast, null, 2) + '\n');
    report.height = await page(`return (${heightPage.toString()})();`);
    fs.writeFileSync(path.join(OUT, 'height-contract.json'), JSON.stringify(report.height, null, 2) + '\n');
  }
  report.errors = { runtime: browser.errors(), console: browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
    .map(e => (e.params.args || []).map(a => a.value ?? a.description ?? '').join(' ')) };
  assert.deepEqual(report.errors, { runtime: [], console: [] }, 'runtime/console errors');
  assert(d.pass, 'decomposition invariants failed (see decomposition.json)');
  if (!decompositionOnly) assert(report.coast.pass, 'GPU coast contract failed (see coast-contract.json)');
  if (!decompositionOnly) assert(report.height.pass, 'GPU continuous broad height contract failed (see height-contract.json)');
  report.pass = true;
  console.log(JSON.stringify({ decomposition: d.pass, coast: decompositionOnly ? 'skipped by explicit flag' : report.coast.pass,
    height: decompositionOnly ? 'skipped by explicit flag' : report.height.pass, out: OUT }));
} catch (error) {
  report.pass = false; report.failure = error.stack || String(error);
  if (browser) report.errors = { runtime: browser.errors(), console: browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
    .map(e => (e.params.args || []).map(a => a.value ?? a.description ?? '').join(' ')) };
  console.error(report.failure); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  if (browser) { report.browser = browser.meta; await browser.close(); }
  server?.kill(); fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
