// Local diagnostic evidence, never a Golden fixture or artistic acceptance gate.
// One Edge, one imported canonical World, one frozen camera, default framebuffer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.INKBOX_C2D1_DIAGNOSTIC_OUT || 'reports/local/m2c2d1/decomposition');
const SOURCE = process.env.INKBOX_C2D1_CAMERA_SOURCE || ['E0-c2d', 'c2d', 'candidate']
  .map(label => path.join(ROOT, `reports/local/m2c2d1/${label}/browser.json`)).find(file => fs.existsSync(file));
const SAVE = path.resolve(ROOT, process.env.INKBOX_C2C_NATURAL_SAVE || 'reports/local/m2c2c/pilot/full-sites-natural-save.json');
const port = Number(process.env.INKBOX_PORT || 4241);
const base = process.env.INKBOX_URL || `http://127.0.0.1:${port}`;
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'diagnostics require localhost');
const decompositionOnly = process.argv.includes('--decomposition-only');
const report = { suite: 'M2-C2D.1 decomposition and diagnostic GPU terrain/water/boundary contracts', golden: false,
  startedAt: new Date().toISOString(), decompositionOnly, decomposition: { pass: false }, coast: { pass: false, skipped: decompositionOnly },
  coastSampling: { pass: false, skipped: decompositionOnly },
  height: { pass: false, skipped: decompositionOnly }, waterBoundary: { pass: false, skipped: decompositionOnly } };
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
  const u = material.uniforms; material.setArtDebugMode(2); u.surfaceTexture.value = surfaceTexture; u.surfaceDepthRef.value = 0.5;
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
        types[i] = fixture.type;
        const depthByte = (sx, sy) => Math.round(255 * fixture.depth(Math.max(0, Math.min(N - 1, sx)), Math.max(0, Math.min(N - 1, sy))) / u.surfaceDepthRef.value);
        scalar[i] = depthByte(x, y); scalar[i + 1] = depthByte(x - 1, y);
        scalar[i + 2] = depthByte(x + 1, y); scalar[i + 3] = depthByte(x, y - 1);
      }
      heightTexture.needsUpdate = typeTexture.needsUpdate = surfaceTexture.needsUpdate = true;
      u.surfaceMode.value = 0; gpu.render(scene, camera); const off = fixture.points.map(([x, z]) => sample(x, z));
      glErrors.push(...errors());
      u.surfaceMode.value = 1; gpu.render(scene, camera); const on = fixture.points.map(([x, z]) => sample(x, z));
      glErrors.push(...errors());
      const deltas = on.map((rgb, i) => Math.max(...rgb.map((v, c) => Math.abs(v - off[i][c]))));
      const pass = fixture.expect === 'same' ? deltas.every(d => d === 0) : deltas.some(d => d > 0);
      const insideDomain = fixture.points.every(([x, z]) => x + (N - 1) / 2 >= 0 && x + (N - 1) / 2 <= N - 1
        && z + (N - 1) / 2 >= 0 && z + (N - 1) / 2 <= N - 1);
      samples.push({ name: fixture.name, points: fixture.points, insideDomain, expect: fixture.expect,
        surfaceOffRGB: off, surfaceOnRGB: on, maxChannelDeltas: deltas, pass: pass && insideDomain });
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

// Compare the production two-fetch GLSL against an independent five-R-fetch
// shoreline scalar on the actual Edge GPU. Fixed-point RGB24 avoids art-colour
// and 8-bit framebuffer rounding hiding a packing or interpolation error.
async function coastSamplingPage() {
  const T = await import('three');
  const { PigmentTerrainMaterial } = await import('./src/inkbox/render3d/art/PigmentTerrainMaterial.js');
  const { ART_PROFILES } = await import('./src/inkbox/render3d/art/ArtPassProfile.js');
  const host = window.inkbox.render3d.renderer, gpu = host.gpu, gl = gpu.getContext(), N = 16;
  const resources = [], pendingGlErrors = [], glErrors = [];
  const inventory = () => ({ geometries: gpu.info.memory.geometries, textures: gpu.info.memory.textures,
    programs: gpu.info.programs?.length ?? null });
  host.render();
  const beforeResources = inventory();
  const errors = dest => { for (let e = gl.getError(); e !== gl.NO_ERROR; e = gl.getError()) dest.push(e); };
  errors(pendingGlErrors);
  const production = new PigmentTerrainMaterial({ world: { w: N, h: N, seed: 226 },
    heightTexture: null, typeTexture: null }, ART_PROFILES.pilot);
  resources.push(production);
  const source = production.fragmentShader;
  const packedCall = /vec4 packedDepth=texture2D\(surfaceTexture,\(clamp\(p,vec2\(0\.0\),mapSize-1\.0\)\+0\.5\)\/mapSize\)\*surfaceDepthRef;/.test(source);
  const extract = name => {
    const match = new RegExp('float\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(source);
    if (!match) throw Error('production coast helper missing: ' + name);
    let depth = 1, end = match.index + match[0].length;
    for (; end < source.length && depth; end++) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
    if (depth) throw Error('unterminated production coast helper: ' + name);
    return source.slice(match.index, end);
  };
  const insideHelper = extract('shorelineMaskInside');
  const productionInside = /coastSoft=shorelineMaskInside\(p,packedDepth\)/.test(source)
    && !/\bif\s*\(/.test(insideHelper) && !/shorelineMask\(/.test(insideHelper);
  const bytes = new Uint8Array(N * N * 4);
  const surface = new T.DataTexture(bytes, N, N, T.RGBAFormat, T.UnsignedByteType);
  surface.minFilter = surface.magFilter = T.LinearFilter; surface.generateMipmaps = false;
  surface.flipY = false; surface.colorSpace = T.NoColorSpace; resources.push(surface);
  const material = new T.ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false,
    uniforms: { surfaceTexture: { value: surface }, mapSize: { value: new T.Vector2(N, N) },
      surfaceDepthRef: { value: 0.5 }, probePoint: { value: new T.Vector2() }, probeMode: { value: 0 } },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `uniform sampler2D surfaceTexture; uniform vec2 mapSize,probePoint; uniform float surfaceDepthRef,probeMode;
      ${extract('surfaceDepthAt')}
      ${extract('shorelineMaskValues')}
      ${insideHelper}
      ${extract('shorelineMask')}
      float originalFiveFetch(vec2 p){
        float center=surfaceDepthAt(p), left=surfaceDepthAt(p-vec2(1.0,0.0));
        float right=surfaceDepthAt(p+vec2(1.0,0.0)), down=surfaceDepthAt(p-vec2(0.0,1.0));
        float up=surfaceDepthAt(p+vec2(0.0,1.0));
        float minimum=min(center,min(min(left,right),min(down,up)));
        float maximum=max(center,max(max(left,right),max(down,up)));
        float wet=smoothstep(0.002,0.016,maximum);
        float dry=1.0-smoothstep(0.001,0.006,minimum);
        float transition=smoothstep(0.003,0.016,maximum-minimum);
        float centerWet=smoothstep(0.002,0.016,center);
        float shallow=1.0-smoothstep(0.06,0.22,center);
        return wet*dry*transition*mix(1.0,shallow,centerWet);
      }
      void main(){
        vec2 p=probePoint;
        vec4 packed=texture2D(surfaceTexture,(clamp(p,vec2(0.0),mapSize-1.0)+0.5)/mapSize)*surfaceDepthRef;
        float value=probeMode>1.5?shorelineMask(p,packed):
          (probeMode>0.5?originalFiveFetch(p):shorelineMaskInside(p,packed));
        float fixed24=floor(clamp(value,0.0,1.0)*16777215.0+0.5);
        gl_FragColor=vec4(floor(fixed24/65536.0),mod(floor(fixed24/256.0),256.0),mod(fixed24,256.0),255.0)/255.0;
      }` });
  resources.push(material);
  const geometry = new T.PlaneGeometry(2, 2); resources.push(geometry);
  const scene = new T.Scene(); scene.add(new T.Mesh(geometry, material));
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); camera.position.z = 1;
  const oldTarget = gpu.getRenderTarget(), oldViewport = gpu.getViewport(new T.Vector4()),
    oldScissor = gpu.getScissor(new T.Vector4()), oldScissorTest = gpu.getScissorTest();
  const sample = (x, y, mode) => {
    material.uniforms.probePoint.value.set(x, y); material.uniforms.probeMode.value = mode;
    gpu.render(scene, camera);
    if (gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null) throw Error('coast scalar probe requires default framebuffer');
    const rgba = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba); errors(glErrors);
    return (rgba[0] * 65536 + rgba[1] * 256 + rgba[2]) / 16777215;
  };
  const fixtures = [
    { name: 'dry', depth: () => 0 },
    { name: 'uniform-shallow', depth: () => 0.02 },
    { name: 'vertical-shore', depth: x => x >= 8 ? 0.02 : 0 },
    { name: 'diagonal-shore', depth: (x, y) => x + y >= 15 ? 0.06 : 0 },
    { name: 'sloped-shore', depth: (x, y) => x + y > 14 ? Math.min(0.5, 0.004 + (x + y - 14) * 0.012) : 0 },
  ];
  const points = [[0,0],[15,15],[0,7.5],[15,8.25],[7,7],[7.5,7.5],[8.125,6.75],
    [1.25,13.75],[14.75,0.25],[4.5,10.5],[-0.25,7.5],[15.25,7.5]];
  const cases = [], tolerance = 2e-6;
  try {
    gpu.setRenderTarget(null); gpu.setViewport(0, 0, 1, 1); gpu.setScissor(0, 0, 1, 1); gpu.setScissorTest(true);
    for (const fixture of fixtures) {
      const byteAt = (x, y) => Math.round(255 * fixture.depth(Math.max(0,Math.min(N-1,x)),Math.max(0,Math.min(N-1,y))) / 0.5);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = (y * N + x) * 4;
        bytes[i] = byteAt(x,y); bytes[i+1] = byteAt(x-1,y);
        bytes[i+2] = byteAt(x+1,y); bytes[i+3] = byteAt(x,y-1);
      }
      surface.needsUpdate = true;
      for (const [x,y] of points) {
        const insideDomain = x >= 0 && x <= N - 1 && y >= 0 && y <= N - 1;
        const packed = sample(x,y,insideDomain ? 0 : 2), reference = sample(x,y,1), error = Math.abs(packed-reference);
        cases.push({ fixture: fixture.name, point: [x,y], insideDomain, helper: insideDomain ? 'productionInside' : 'genericOutside',
          packed, reference, error, pass: error <= tolerance });
      }
    }
  } finally {
    for (const resource of resources) resource.dispose();
    gpu.setRenderTarget(oldTarget); gpu.setViewport(oldViewport); gpu.setScissor(oldScissor); gpu.setScissorTest(oldScissorTest);
    host.render(); errors(glErrors);
  }
  const maxError = Math.max(...cases.map(v => v.error));
  const afterResources = inventory(), resourcesRestored = JSON.stringify(beforeResources) === JSON.stringify(afterResources);
  return { pass: packedCall && productionInside && cases.some(v => v.insideDomain && v.reference > 0 && v.reference < 1)
      && cases.every(v => v.pass) && resourcesRestored && !pendingGlErrors.length && !glErrors.length,
    productionPackedCall: packedCall, productionInside, framebuffer: 'existing renderer default framebuffer', renderTargetsCreated: 0,
    comparison: 'closed-domain production branchless inside helper and outside generic helper versus independent five-R-fetch scalar; RGB24 encoding',
    tolerance, maxError, cases, beforeResources, afterResources, resourcesRestored, pendingGlErrors, glErrors };
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
  const source = production.fragmentShader, vertexSource = production.vertexShader;
  const extract = (name, owner) => {
    const match = new RegExp('(?:float|vec2)\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(owner);
    if (!match) throw Error('production GLSL helper missing: ' + name);
    let depth = 1, end = match.index + match[0].length;
    for (; end < owner.length && depth; end++) { if (owner[end] === '{') depth++; if (owner[end] === '}') depth--; }
    if (depth) throw Error('unterminated production GLSL helper: ' + name);
    return owner.slice(match.index, end);
  };
  let helpers;
  try { helpers = ['uvAt', 'hAt', 'typeAt', 'sampleHeightContinuous', 'sampleHeightBroad', 'sampleHeightBroadX', 'sampleHeightBroadY']
    .map(name => extract(name, ['sampleHeightContinuous', 'sampleHeightBroad', 'sampleHeightBroadX', 'sampleHeightBroadY'].includes(name) ? vertexSource : source)); }
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
  const helper = name => extract(name, vertexSource);
  const twoFetchesNoBranch = name => {
    const body = helper(name);
    return (body.match(/texture2D\s*\(/g) || []).length === 2 && !/\bif\s*\(/.test(body);
  };
  const sourceGuards = { massExpression, massUsesBroadWithoutFineSlope: /broad/i.test(massExpression) && !/\bslope\b/.test(massExpression),
    packedBranchRequiresMatchingRadius: /packedBroadRadius>0\.0\s*&&\s*R==packedBroadRadius/.test(vertexSource)
      && /vBroadGradient\s*=\s*texture2D\(heightTexture,uvAt\(grid\)\)\.ba/.test(vertexSource),
    broadXAndYFiniteDifferencesUseAxisHelpers: /float\s+bl\s*=\s*sampleHeightBroadX\(grid-vec2\(R,0\.0\)\),\s*br\s*=\s*sampleHeightBroadX\(grid\+vec2\(R,0\.0\)\)/.test(vertexSource)
      && /float\s+bd\s*=\s*sampleHeightBroadY\(grid-vec2\(0\.0,R\)\),\s*bu\s*=\s*sampleHeightBroadY\(grid\+vec2\(0\.0,R\)\)/.test(vertexSource),
    axisHelpersAreBranchlessTwoFetches: twoFetchesNoBranch('sampleHeightBroadX') && twoFetchesNoBranch('sampleHeightBroadY'),
    genericBroadRemainsContinuous: /float\s+sampleHeightBroad\(vec2 p\)\s*\{\s*return sampleHeightContinuous\(p\);\s*\}/.test(vertexSource),
    fragmentUsesInterpolatedGradient: /float\s+broadSlope2\s*=\s*dot\(vBroadGradient,vBroadGradient\)/.test(source)
      && /normalize\(vec3\(-vBroadGradient\.x,1\.0,-vBroadGradient\.y\)\)/.test(source),
    vertexPassesUnnormalizedGradient: /vBroadGradient\s*=\s*vec2\(br-bl,bu-bd\)\s*\/\s*\(2\.0\*R\)/.test(vertexSource) };
  const checks = { filtersNearest, integerSamplingExact: integers.every(v => v.pass), boundaryContinuity: boundaries.every(v => v.pass),
    typeRetainsCategoricalBoundary: categorical.every(v => v.pass), fractionalNegativeControl: fractionalNegativeControl.pass,
    broadGradientMatchesBilinearReference: gradient.every(v => v.pass), noOneCellGradientJumps: maxGradientStep < 0.0002,
    sourceGuards: sourceGuards.massUsesBroadWithoutFineSlope && sourceGuards.packedBranchRequiresMatchingRadius
      && sourceGuards.broadXAndYFiniteDifferencesUseAxisHelpers
      && sourceGuards.axisHelpersAreBranchlessTwoFetches && sourceGuards.genericBroadRemainsContinuous
      && sourceGuards.fragmentUsesInterpolatedGradient && sourceGuards.vertexPassesUnnormalizedGradient,
    stateUnchanged: JSON.stringify(before) === JSON.stringify(after), noGLErrors: !pendingGlErrors.length && !glErrors.length };
  return { pass: Object.values(checks).every(Boolean), checks, diagnosticOnly: true, golden: false, renderTargetsCreated: 0,
    method: 'standalone helper contract: continuous/generic broad retain arbitrary-fraction bilinear sampling; X/Y axis helpers remain radius-mismatch fallback; packed vertex branch is checked separately against a barycentric oracle',
    fixture: { size: [N, N], equation: '0.10 + 0.012*x + 0.006*y + 0.0008*x*x (Float32)', R, gradientStep: 1 / 16, tolerance, epsilon },
    extractedHelpers: helpers, textureFilters: { height: [heightTexture.minFilter, heightTexture.magFilter], type: [typeTexture.minFilter, typeTexture.magFilter] },
    productionTextureFilters, sourceGuards, before, after, pendingGlErrors, glErrors, integers, boundaries, categorical,
    fractionalNegativeControl, gradient, maxGradientStep };
}

// Production vertex + production shared/indexed grid: the oracle is triangle
// barycentric interpolation of vertex gradients, not fragment bilinear equality.
async function vertexGradientPage() {
  const T = await import('three');
  const { PigmentTerrainMaterial } = await import('./src/inkbox/render3d/art/PigmentTerrainMaterial.js');
  const { TerrainDataTextures } = await import('./src/inkbox/render3d/art/TerrainDataTextures.js');
  const { ART_PROFILES } = await import('./src/inkbox/render3d/art/ArtPassProfile.js');
  const { gridGeometry } = await import('./src/inkbox/render3d/terrain/TerrainMesh.js');
  const { createCoordinates } = await import('./src/inkbox/render3d/coordinates.js');
  const k = window.inkbox, host = k.render3d.renderer, gpu = host.gpu, gl = gpu.getContext(), N = 16, R = 2.5;
  const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
  const hashJSON = v => sha(new TextEncoder().encode(JSON.stringify(v)));
  const hashArray = a => sha(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  const sceneIdentity = async () => {
    const terrains = [];
    for (const stage of host.stages.values()) if (stage.terrain?.geometry) {
      const geometry = stage.terrain.geometry;
      terrains.push({ plane: stage.plane, position: await hashArray(geometry.attributes.position.array), index: await hashArray(geometry.index.array),
        positionVersion: geometry.attributes.position.version, indexVersion: geometry.index.version, drawRange: { ...geometry.drawRange } });
    }
    return { world: await hashJSON(k.world), advance: await hashJSON(k.advanceState), terrains,
      gpu: { geometries: gpu.info.memory.geometries, textures: gpu.info.memory.textures, programs: gpu.info.programs?.length ?? null,
        calls: gpu.info.render.calls, triangles: gpu.info.render.triangles } };
  };
  host.render(); const before = await sceneIdentity();
  const errors = () => { const a = []; for (let e = gl.getError(); e !== gl.NO_ERROR; e = gl.getError()) a.push(e); return a; };
  const pendingGlErrors = errors(), glErrors = [], resources = [];
  const world = { w: N, h: N, size: N * N, seed: 226, height: new Float32Array(N * N), type: new Uint8Array(N * N) },
    coordinates = createCoordinates(world);
  let fixtureHeight = (x, y) => 0.35 * x - 0.22 * y + 2;
  const data = new TerrainDataTextures(world, { node: (x, y) => fixtureHeight(x, y) }); resources.push(data);
  const heights = data.heights, heightTexture = data.heightTexture, typeTexture = data.typeTexture;
  const rawHeights = new Float32Array(N * N * 4);
  const rawHeightTexture = new T.DataTexture(rawHeights, N, N, T.RGBAFormat, T.FloatType);
  rawHeightTexture.minFilter = rawHeightTexture.magFilter = T.NearestFilter;
  rawHeightTexture.generateMipmaps = false; rawHeightTexture.flipY = false; resources.push(rawHeightTexture);
  const production = new PigmentTerrainMaterial(data, ART_PROFILES.pilot); resources.push(production);
  const vertexSource = production.vertexShader, geometry = gridGeometry(world, coordinates); resources.push(geometry);
  const positionBefore = await hashArray(geometry.attributes.position.array), indexBefore = await hashArray(geometry.index.array), drawRangeBefore = JSON.stringify(geometry.drawRange);
  const nonindexed = geometry.toNonIndexed(); resources.push(nonindexed);
  const faceGradients = new Float32Array(nonindexed.attributes.position.count * 2);
  nonindexed.setAttribute('oracleFaceGradient', new T.BufferAttribute(faceGradients, 2));
  const fallbackAssignment = /vBroadGradient\s*=\s*vec2\(br-bl,bu-bd\)\s*\/\s*\(2\.0\*R\)\s*;/;
  const packedAssignment = /vBroadGradient\s*=\s*texture2D\(heightTexture,uvAt\(grid\)\)\.ba\s*;/;
  if (!fallbackAssignment.test(vertexSource) || !packedAssignment.test(vertexSource)) {
    for (const resource of resources) resource.dispose();
    return { pass: false, failure: 'production packed/fallback unnormalised vBroadGradient assignments unavailable' };
  }
  const fragmentShader = `varying vec2 vBroadGradient; uniform float oracleComponent;
    void main(){
      float g=oracleComponent<0.5?vBroadGradient.x:vBroadGradient.y;
      float packed=floor(clamp(0.5+g/16.0,0.0,1.0)*16777215.0+0.5);
      gl_FragColor=vec4(floor(packed/65536.0),mod(floor(packed/256.0),256.0),mod(packed,256.0),255.0)/255.0;
    }`;
  const materialFor = (vertexShader, texture = heightTexture, packedRadius = R, radius = R) => {
    const m = new T.ShaderMaterial({ vertexShader, fragmentShader, toneMapped: false, side: T.DoubleSide, depthTest: false, depthWrite: false,
      uniforms: { heightTexture: { value: texture }, mapSize: { value: new T.Vector2(N, N) }, broadRadius: { value: radius },
        packedBroadRadius: { value: packedRadius }, oracleComponent: { value: 0 } } });
    resources.push(m); return m;
  };
  const replaceHeightHelperWithNearest = (shader, name) => {
    const pattern = new RegExp('float\\s+' + name + '\\s*\\(vec2 p\\)\\s*\\{[^{}]*\\}');
    if (!pattern.test(shader)) throw Error('production negative-control helper missing: ' + name);
    return shader.replace(pattern, `float ${name}(vec2 p){return hAt(p);}`);
  };
  const nearestHeightShader = ['sampleHeightBroad', 'sampleHeightBroadX', 'sampleHeightBroadY']
    .reduce(replaceHeightHelperWithNearest, vertexSource)
    .replace(packedAssignment, `vBroadGradient=vec2(
      (hAt(grid+vec2(R,0.0))-hAt(grid-vec2(R,0.0)))/(2.0*R),
      (hAt(grid+vec2(0.0,R))-hAt(grid-vec2(0.0,R)))/(2.0*R));`);
  const normalizedShader = vertexSource.replace(packedAssignment,
    '$&\n vBroadGradient/=sqrt(1.0+dot(vBroadGradient,vBroadGradient));')
    .replace(fallbackAssignment, '$&\n vBroadGradient/=sqrt(1.0+dot(vBroadGradient,vBroadGradient));');
  const faceShader = 'attribute vec2 oracleFaceGradient;\n' + vertexSource
    .replace(packedAssignment, 'vBroadGradient=oracleFaceGradient;')
    .replace(fallbackAssignment, 'vBroadGradient=oracleFaceGradient;');
  const materials = {
    production: materialFor(vertexSource),
    vertexNearest: materialFor(nearestHeightShader),
    vertexNormalizeFirst: materialFor(normalizedShader),
    faceConstant: materialFor(faceShader),
    rawFallback: materialFor(vertexSource, rawHeightTexture, 0),
    radiusFallback: materialFor(vertexSource, heightTexture, R, 3.25),
  };
  const scene = new T.Scene(), mesh = new T.Mesh(geometry, materials.production); mesh.frustumCulled = false; scene.add(mesh);
  // A tiny orthographic view centres the one framebuffer pixel at the exact
  // probe coordinate. MSAA sample spread is bounded far below oracle tolerance.
  const camera = new T.OrthographicCamera(-0.000001, 0.000001, 0.000001, -0.000001, 0.1, 100); camera.up.set(0, 0, -1);
  const oldTarget = gpu.getRenderTarget(), oldViewport = gpu.getViewport(new T.Vector4()), oldScissor = gpu.getScissor(new T.Vector4()), oldScissorTest = gpu.getScissorTest();
  const at = (x, y) => heights[(Math.max(0, Math.min(15, y)) * N + Math.max(0, Math.min(15, x))) * 4 + 1];
  const continuous = (x, y) => {
    x = Math.max(0, Math.min(15, x)); y = Math.max(0, Math.min(15, y));
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
  };
  const vertexGradient = (x, y, radius = R) => [(continuous(x + radius, y) - continuous(x - radius, y)) / (2 * radius),
    (continuous(x, y + radius) - continuous(x, y - radius)) / (2 * radius)];
  const oracle = (x, y, radius = R) => {
    const ix = Math.min(14, Math.floor(x)), iy = Math.min(14, Math.floor(y)), fx = x - ix, fy = y - iy;
    const first = fx + fy <= 1;
    const vertices = first ? [[ix, iy], [ix, iy + 1], [ix + 1, iy]] : [[ix + 1, iy], [ix, iy + 1], [ix + 1, iy + 1]];
    const weights = first ? [1 - fx - fy, fy, fx] : [1 - fy, 1 - fx, fx + fy - 1];
    const cell = iy * (N - 1) + ix, indexOffset = cell * 6 + (first ? 0 : 3);
    const indices = [...geometry.index.array.slice(indexOffset, indexOffset + 3)];
    const expectedIndices = vertices.map(([vx, vy]) => vy * N + vx);
    if (indices.some((v, i) => v !== expectedIndices[i])) throw Error('production grid triangle order differs from a,c,b / b,c,d');
    const grads = vertices.map(([vx, vy]) => vertexGradient(vx, vy, radius));
    const value = [0, 1].map(c => grads.reduce((sum, g, i) => sum + g[c] * weights[i], 0));
    return { value, triangle: first ? 'a,c,b' : 'b,c,d', vertices, weights, indices };
  };
  const sample = (point, mode) => {
    const [x, y] = point, p = coordinates.worldToRender(x, y);
    mesh.material = materials[mode]; mesh.geometry = mode === 'faceConstant' ? nonindexed : geometry;
    camera.position.set(p.x, 20, p.z); camera.lookAt(p.x, 0, p.z); camera.updateMatrixWorld(true);
    const value = [], draw = [];
    for (let component = 0; component < 2; component++) {
      mesh.material.uniforms.oracleComponent.value = component; gpu.render(scene, camera);
      if (gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null) throw Error('vertex oracle requires default framebuffer');
      const b = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); glErrors.push(...errors());
      value.push(((b[0] * 65536 + b[1] * 256 + b[2]) / 16777215 - 0.5) * 16);
      draw.push({ calls: gpu.info.render.calls, triangles: gpu.info.render.triangles });
    }
    return { value, draw };
  };
  const epsilon = 0.002, tolerance = 0.00015;
  const points = [
    { tag: 'interior-first-triangle', point: [4.23, 5.31] }, { tag: 'interior-second-triangle', point: [5.77, 4.68] },
    { tag: 'half-grid', point: [7.5, 7.5] }, { tag: 'half-grid-nondiagonal', point: [4.5, 6.25] },
    { tag: 'shared-integer-vertex', point: [7, 7] },
    { tag: 'clamped-broad-left-boundary', point: [0.01, 7.3] }, { tag: 'clamped-broad-right-boundary', point: [14.99, 6.4] },
    { tag: 'clamped-broad-bottom-boundary', point: [6.7, 0.01] }, { tag: 'clamped-broad-top-boundary', point: [5.4, 14.99] },
    { tag: 'corner-near-boundary', point: [0.01, 0.01] },
  ];
  const pairs = [
    { tag: 'diagonal', left: [7.3, 6.7 - epsilon], right: [7.3, 6.7 + epsilon] },
    { tag: 'vertical-grid-edge', left: [7 - epsilon, 6.34], right: [7 + epsilon, 6.34] },
    { tag: 'horizontal-grid-edge', left: [5.27, 8 - epsilon], right: [5.27, 8 + epsilon] },
    { tag: 'half-cell', left: [5.5 - epsilon, 5.23], right: [5.5 + epsilon, 5.23] },
  ];
  for (const pair of pairs) points.push({ tag: pair.tag + '-left', point: pair.left }, { tag: pair.tag + '-right', point: pair.right });
  const fixtures = [], fallbackCases = [], fixtureSpecs = [
    { name: 'plane', height: (x, y) => 0.35 * x - 0.22 * y + 2 },
    { name: 'nonseparable-undulation', height: (x, y) => 0.30 * x + 0.18 * y + 2.4 * Math.sin(x * 0.77) * Math.cos(y * 0.61) + 1.1 * Math.sin(x * y * 0.19) },
  ];
  let geometryAfter;
  try {
    gpu.setRenderTarget(null); gpu.setViewport(0, 0, 1, 1); gpu.setScissor(0, 0, 1, 1); gpu.setScissorTest(true);
    for (const fixture of fixtureSpecs) {
      fixtureHeight = fixture.height;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) world.height[y * N + x] = 0.1 + 0.001 * x + 0.002 * y;
      data.update({ x0: 0, y0: 0, x1: N - 1, y1: N - 1 }, { height: true, type: false });
      rawHeights.set(heights);
      for (let i = 0; i < N * N; i++) { rawHeights[i * 4 + 2] = 0; rawHeights[i * 4 + 3] = 0; }
      rawHeightTexture.needsUpdate = true;
      // Deliberately wrong per-face constant: private diagnostic clone has the
      // same constant mean vertex-gradient at all three vertices of each face.
      const pos = nonindexed.attributes.position;
      for (let v = 0; v < pos.count; v += 3) {
        const gradients = [0, 1, 2].map(o => vertexGradient(pos.getX(v + o) + 7.5, pos.getZ(v + o) + 7.5));
        const mean = [0, 1].map(c => gradients.reduce((sum, g) => sum + g[c], 0) / 3);
        for (let o = 0; o < 3; o++) faceGradients.set(mean, (v + o) * 2);
      }
      nonindexed.attributes.oracleFaceGradient.needsUpdate = true;
      const samples = [], negatives = { vertexNearest: [], faceConstant: [], vertexNormalizeFirst: [] };
      for (const { tag, point } of points) {
        const expected = oracle(...point), actual = sample(point, 'production');
        const maxError = Math.max(...actual.value.map((v, c) => Math.abs(v - expected.value[c])));
        const fragmentBilinear = vertexGradient(...point);
        samples.push({ tag, point, expected, actual, maxError, pass: maxError <= tolerance,
          fragmentBilinear, differenceFromFragmentBilinear: Math.max(...fragmentBilinear.map((v, c) => Math.abs(v - expected.value[c]))) });
        for (const mode of Object.keys(negatives)) {
          const wrong = sample(point, mode), error = Math.max(...wrong.value.map((v, c) => Math.abs(v - expected.value[c])));
          negatives[mode].push({ tag, point, actual: wrong.value, oracleError: error, rejected: error > tolerance });
        }
      }
      const continuity = pairs.map(pair => {
        const left = samples.find(s => s.tag === pair.tag + '-left'), right = samples.find(s => s.tag === pair.tag + '-right');
        const residualJump = Math.max(...[0, 1].map(c => Math.abs((right.actual.value[c] - left.actual.value[c]) - (right.expected.value[c] - left.expected.value[c]))));
        return { tag: pair.tag, actualDelta: right.actual.value.map((v, c) => v - left.actual.value[c]),
          expectedDelta: right.expected.value.map((v, c) => v - left.expected.value[c]), residualJump, pass: residualJump <= 2 * tolerance };
      });
      fixtures.push({ name: fixture.name, samples, continuity, negatives });
      // Both fallbacks run the same verbatim production vertex on a few
      // nontrivial locations. The raw texture has no B/A capability; the
      // packed texture with R=3.25 must ignore its R=2.5 B/A channels.
      for (const { tag, point } of points.filter((_, i) => [0, 1, 5, 6, 7, 9].includes(i))) {
        for (const [mode, radius] of [['rawFallback', R], ['radiusFallback', 3.25]]) {
          const expected = oracle(...point, radius), actual = sample(point, mode);
          const maxError = Math.max(...actual.value.map((v, c) => Math.abs(v - expected.value[c])));
          fallbackCases.push({ fixture: fixture.name, mode, radius, tag, point, maxError, pass: maxError <= tolerance });
        }
      }
    }
    geometryAfter = { position: await hashArray(geometry.attributes.position.array), index: await hashArray(geometry.index.array), drawRange: JSON.stringify(geometry.drawRange) };
  } finally {
    for (const resource of resources) resource.dispose();
    gpu.setRenderTarget(oldTarget); gpu.setViewport(oldViewport); gpu.setScissor(oldScissor); gpu.setScissorTest(oldScissorTest);
    host.render(); glErrors.push(...errors());
  }
  const after = await sceneIdentity();
  const negativesRejected = Object.fromEntries(['vertexNearest', 'faceConstant', 'vertexNormalizeFirst'].map(mode => [mode,
    { rejectedSamples: fixtures.reduce((sum, f) => sum + f.negatives[mode].filter(s => s.rejected).length, 0),
      maxError: Math.max(...fixtures.flatMap(f => f.negatives[mode].map(s => s.oracleError))) }]));
  const checks = { productionMatchesBarycentricOracle: fixtures.every(f => f.samples.every(s => s.pass)),
    productionPackedCapability: data.packedBroadGradient && data.packedBroadRadius === R
      && production.uniforms.packedBroadRadius.value === R && materials.production.uniforms.packedBroadRadius.value === R,
    rawAndDynamicRadiusFallbackMatchOracle: fallbackCases.length === fixtureSpecs.length * 6 * 2 && fallbackCases.every(s => s.pass),
    c0AcrossSharedEdges: fixtures.every(f => f.continuity.every(s => s.pass)),
    negativeControlsRejected: Object.values(negativesRejected).every(n => n.rejectedSamples >= 2),
    nonseparableDistinguishesFragmentBilinear: fixtures.find(f => f.name === 'nonseparable-undulation').samples.some(s => s.differenceFromFragmentBilinear > 10 * tolerance),
    productionDraw: fixtures.every(f => f.samples.every(s => s.actual.draw.every(d => d.calls === 1 && d.triangles === (N - 1) * (N - 1) * 2))),
    fixtureGeometryUnchanged: geometryAfter.position === positionBefore && geometryAfter.index === indexBefore && geometryAfter.drawRange === drawRangeBefore,
    hostWorldAdvanceGeometryDrawResourcesRestored: JSON.stringify(before) === JSON.stringify(after),
    filtersNearest: [heightTexture, rawHeightTexture].every(t => t.minFilter === T.NearestFilter && t.magFilter === T.NearestFilter),
    noGLErrors: !pendingGlErrors.length && !glErrors.length };
  return { pass: Object.values(checks).every(Boolean), checks, diagnosticOnly: true, golden: false, renderTargetsCreated: 0,
    contract: 'shared indexed grid C0 triangle-linear unnormalised vertex gradient; NOT per-fragment bilinear numeric equivalence',
    method: 'verbatim production vertex + real TerrainDataTextures packed BA + TerrainMesh.gridGeometry; raw no-BA and dynamic-radius fallback; two RGB24 default-framebuffer draws per probe; independent CPU actual-index barycentric oracle',
    R, size: [N, N], epsilon, tolerance, signedEncodingRange: [-8, 8], vertexSource,
    specializedSampling: 'default R=2.5 uses one packed BA texture read per grid vertex; raw/no-capability and mismatched radius retain axis X/Y helpers; arbitrary fractional probes retain generic continuous bilinear sampling',
    negativeControls: { vertexNearest: 'packed assignment -> nearest hAt finite differences; fallback helpers -> hAt', faceConstant: 'packed/fallback assignment -> private nonindexed face-mean gradient',
      vertexNormalizeFirst: 'normalize normal length at vertex before interpolation' },
    before, after, fixtureGeometryBefore: { position: positionBefore, index: indexBefore, drawRange: drawRangeBefore }, geometryAfter,
    negativesRejected, fixtures, fallbackCases, pendingGlErrors, glErrors };
}

// Real shipping materials, private quads, existing default framebuffer only.
// alpha:false contexts expose A=255. In that case preserve production alpha
// calculation verbatim and encode its final value in RGB for a diagnostic draw.
async function waterBoundaryPage() {
  const T = await import('three');
  const { WaterPigmentMaterial } = await import('./src/inkbox/render3d/water/WaterPigmentMaterial.js');
  const { createBoundaryInkMaterial, applyBoundaryInkStyle } = await import('./src/inkbox/render3d/boundary/BoundaryInkMaterial.js');
  const { realmStyleFor } = await import('./src/inkbox/render3d/art/RealmStyleProfile.js');
  const k = window.inkbox, host = k.render3d.renderer, gpu = host.gpu, gl = gpu.getContext(), S = 128;
  const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
  const hashJSON = v => sha(new TextEncoder().encode(JSON.stringify(v)));
  const inventory = () => ({ geometries: gpu.info.memory.geometries, textures: gpu.info.memory.textures, programs: gpu.info.programs?.length ?? null });
  host.render();
  const before = { world: await hashJSON(k.world), advance: await hashJSON(k.advanceState), gpu: inventory() };
  const errors = () => { const a = []; for (let e = gl.getError(); e !== gl.NO_ERROR; e = gl.getError()) a.push(e); return a; };
  const pendingGlErrors = errors(), glErrors = [], resources = [], alphaBits = gl.getParameter(gl.ALPHA_BITS);
  const oldTarget = gpu.getRenderTarget(), oldViewport = gpu.getViewport(new T.Vector4()), oldScissor = gpu.getScissor(new T.Vector4()), oldScissorTest = gpu.getScissorTest();
  const oldColor = gpu.getClearColor(new T.Color()), oldAlpha = gpu.getClearAlpha();
  const pixels = (bytes, x = 0.5, y = 0.5) => [...bytes.slice((Math.floor(y * S) * S + Math.floor(x * S)) * 4, (Math.floor(y * S) * S + Math.floor(x * S)) * 4 + 4)];
  const difference = (a, b) => { let count = 0, max = 0; for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) { const d = Math.abs(a[i + c] - b[i + c]); count += d > 0; max = Math.max(max, d); } return { changedChannels: count, maxChannelDelta: max }; };
  const cameraWater = new T.OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
  cameraWater.position.set(0, 20, 0); cameraWater.up.set(0, 0, -1); cameraWater.lookAt(0, 0, 0); cameraWater.updateMatrixWorld(true);
  const cameraBoundary = new T.OrthographicCamera(-8, 8, 8, -8, 0.1, 100); cameraBoundary.position.z = 20; cameraBoundary.updateMatrixWorld(true);
  const sceneWater = new T.Scene(), sceneBoundary = new T.Scene();
  const scalar = new Uint8Array(16 * 16 * 4), surface = new T.DataTexture(scalar, 16, 16, T.RGBAFormat, T.UnsignedByteType);
  surface.minFilter = surface.magFilter = T.LinearFilter; surface.needsUpdate = true; resources.push(surface);
  const water = new WaterPigmentMaterial({ w: 16, h: 16, seed: 226 }, { texture: surface, depthReference: 0.5 },
    { paperColor: realmStyleFor('mortal').paper.color, realmStyle: realmStyleFor('mortal') });
  water.blending = T.NoBlending; resources.push(water);
  const waterGeometry = new T.PlaneGeometry(16, 16); waterGeometry.rotateX(-Math.PI / 2); resources.push(waterGeometry);
  const waterMesh = new T.Mesh(waterGeometry, water); sceneWater.add(waterMesh);
  const boundary = createBoundaryInkMaterial(); applyBoundaryInkStyle(boundary, realmStyleFor('upper'));
  boundary.blending = T.NoBlending; resources.push(boundary);
  const boundaryGeometry = new T.PlaneGeometry(16, 16), positions = boundaryGeometry.attributes.position;
  const vertical = new Float32Array(positions.count), seeds = new Float32Array(positions.count), colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) { vertical[i] = (positions.getY(i) + 8) / 16; seeds[i] = 0.37; colors.set([0.22, 0.28, 0.30], i * 3); }
  boundaryGeometry.setAttribute('aVertical', new T.BufferAttribute(vertical, 1)); boundaryGeometry.setAttribute('aSeed', new T.BufferAttribute(seeds, 1));
  boundaryGeometry.setAttribute('color', new T.BufferAttribute(colors, 3)); resources.push(boundaryGeometry);
  const boundaryMesh = new T.Mesh(boundaryGeometry, boundary); sceneBoundary.add(boundaryMesh);
  const referenceMaterial = new T.MeshBasicMaterial({ color: water.uniforms.paperColor.value, blending: T.NoBlending }); resources.push(referenceMaterial);
  const referenceMesh = new T.Mesh(waterGeometry, referenceMaterial), referenceScene = new T.Scene(); referenceScene.add(referenceMesh);
  const occluderMaterial = new T.MeshBasicMaterial({ color: '#AABBCC', blending: T.NoBlending, depthWrite: true }); resources.push(occluderMaterial);
  const occluder = new T.Mesh(boundaryGeometry, occluderMaterial); occluder.position.z = 0.5; sceneBoundary.add(occluder); occluder.visible = false;
  const render = (scene, camera) => {
    gpu.render(scene, camera);
    if (gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null) throw Error('water/boundary probe requires default framebuffer');
    const bytes = new Uint8Array(S * S * 4); gl.readPixels(0, 0, S, S, gl.RGBA, gl.UNSIGNED_BYTE, bytes); glErrors.push(...errors()); return bytes;
  };
  const alphaDraw = (material, scene, camera) => {
    const original = material.fragmentShader, toneMapped = material.toneMapped;
    const clearColor = gpu.getClearColor(new T.Color()).clone(), clearAlpha = gpu.getClearAlpha();
    // All shader alpha/discard logic runs unchanged before this final routing.
    material.fragmentShader = original.replace(/#include\s*<tonemapping_fragment>/g, '').replace(/#include\s*<colorspace_fragment>/g, '')
      .replace(/}\s*$/, 'gl_FragColor=vec4(vec3(gl_FragColor.a),1.0);\n}');
    material.toneMapped = false; material.needsUpdate = true;
    // Discard has zero coverage. A black clear keeps it from masquerading as
    // the earlier non-paper discard-control colour in the encoded alpha probe.
    gpu.setClearColor('#000000', 0);
    try { return render(scene, camera); }
    finally { material.fragmentShader = original; material.toneMapped = toneMapped; material.needsUpdate = true;
      gpu.setClearColor(clearColor, clearAlpha); }
  };
  const setDepth = depth => { for (let i = 0; i < scalar.length; i += 4) scalar[i] = Math.round(Math.min(1, depth / 0.5) * 255); surface.needsUpdate = true; };
  let waterEvidence, boundaryEvidence;
  const captured = {};
  try {
    gpu.setRenderTarget(null); gpu.setViewport(0, 0, S, S); gpu.setScissor(0, 0, S, S); gpu.setScissorTest(true);
    // A fixed non-paper background makes discard observable even on alpha:false.
    gpu.setClearColor('#102030', 0);
    waterMesh.visible = false; captured.empty = render(sceneWater, cameraWater); waterMesh.visible = true;
    setDepth(0); captured.dry = render(sceneWater, cameraWater);
    water.uniforms.rippleStrength.value = 0;
    setDepth(0.02); captured.shallow = render(sceneWater, cameraWater); captured.shallowAlpha = alphaDraw(water, sceneWater, cameraWater);
    setDepth(0.5); captured.deep = render(sceneWater, cameraWater); captured.deepAlpha = alphaDraw(water, sceneWater, cameraWater);
    captured.paper = render(referenceScene, cameraWater);
    water.uniforms.pixelsPerUnit.value = 2; water.uniforms.rippleStrength.value = 0; captured.farOff = render(sceneWater, cameraWater);
    water.uniforms.rippleStrength.value = 1; captured.farOn = render(sceneWater, cameraWater);
    water.uniforms.pixelsPerUnit.value = 16; water.uniforms.rippleStrength.value = 0; captured.nearOff = render(sceneWater, cameraWater);
    water.uniforms.rippleStrength.value = 1; captured.nearOn = render(sceneWater, cameraWater);
    const shallowRGBA = pixels(captured.shallow), deepRGBA = pixels(captured.deep), paperRGBA = pixels(captured.paper);
    const shallowAlpha = pixels(captured.shallowAlpha)[0] / 255, deepAlpha = pixels(captured.deepAlpha)[0] / 255;
    waterEvidence = { shallowRGBA, deepRGBA, paperRGBA, shallowAlpha, deepAlpha,
      dryVsEmpty: difference(captured.dry, captured.empty), shallowVsDeep: difference(captured.shallow, captured.deep), deepVsPaper: difference(captured.deep, captured.paper),
      farRippleDelta: difference(captured.farOff, captured.farOn), nearRippleDelta: difference(captured.nearOff, captured.nearOn),
      checks: { dryDiscard: difference(captured.dry, captured.empty).changedChannels === 0,
        shallowDeepAlpha: shallowAlpha > 0 && deepAlpha > shallowAlpha,
        shallowDeepColor: difference(captured.shallow, captured.deep).changedChannels > 0,
        deepColorReadableAgainstPaper: difference(captured.deep, captured.paper).changedChannels > 0,
        farRippleDisabled: difference(captured.farOff, captured.farOn).changedChannels === 0,
        nearRippleVisible: difference(captured.nearOff, captured.nearOn).changedChannels > 0 } };
    captured.boundary = render(sceneBoundary, cameraBoundary); captured.boundaryAlpha = alphaDraw(boundary, sceneBoundary, cameraBoundary);
    const baseRGBA = pixels(captured.boundary, 0.5, 0.18), topRGBA = pixels(captured.boundary, 0.5, 0.94);
    const baseAlpha = pixels(captured.boundaryAlpha, 0.5, 0.01)[0] / 255, topAlpha = pixels(captured.boundaryAlpha, 0.5, 0.94)[0] / 255;
    const target = boundary.uniforms.atmosphereColor.value.clone().lerp(boundary.uniforms.paperColor.value, 0.65);
    referenceMaterial.color.copy(target); referenceMesh.geometry = boundaryGeometry; referenceMesh.rotation.x = 0;
    captured.boundaryTarget = render(referenceScene, cameraBoundary);
    const targetRGBA = pixels(captured.boundaryTarget), distance = rgb => Math.hypot(...rgb.slice(0, 3).map((v, i) => v - targetRGBA[i]));
    const fade = boundary.uniforms.bottomFadeStrength.value;
    boundary.uniforms.bottomFadeStrength.value = 0; captured.boundaryNoFade = render(sceneBoundary, cameraBoundary); boundary.uniforms.bottomFadeStrength.value = fade;
    const baseNoFadeRGBA = pixels(captured.boundaryNoFade, 0.5, 0.18);
    boundaryMesh.rotation.y = Math.PI; captured.reverse = render(sceneBoundary, cameraBoundary);
    occluder.visible = true; boundaryMesh.visible = false; captured.occluder = render(sceneBoundary, cameraBoundary);
    boundaryMesh.visible = true; captured.occludedReverse = render(sceneBoundary, cameraBoundary);
    boundaryEvidence = { baseRGBA, topRGBA, baseAlpha, topAlpha, targetRGBA, baseNoFadeRGBA,
      baseTargetDistance: distance(baseRGBA), baseNoFadeTargetDistance: distance(baseNoFadeRGBA),
      material: { depthTest: boundary.depthTest, depthWrite: boundary.depthWrite, forceSinglePass: boundary.forceSinglePass, side: boundary.side, blendingDuringProbe: boundary.blending },
      reverseVsBackground: difference(captured.reverse, captured.empty), reverseOcclusionDelta: difference(captured.occludedReverse, captured.occluder),
      checks: { bottomAlphaFades: baseAlpha < 0.05 && topAlpha > baseAlpha,
        bottomColorMovesTowardPaperAtmosphere: distance(baseRGBA) < distance(baseNoFadeRGBA),
        depthTestRetained: boundary.depthTest === true, depthWriteDisabled: boundary.depthWrite === false, forceSinglePass: boundary.forceSinglePass === true,
        reverseFaceRendered: difference(captured.reverse, captured.empty).changedChannels > 0,
        reverseFaceOccludedByDepth: difference(captured.occludedReverse, captured.occluder).changedChannels === 0 } };
  } finally {
    for (const resource of resources) resource.dispose();
    gpu.setRenderTarget(oldTarget); gpu.setViewport(oldViewport); gpu.setScissor(oldScissor); gpu.setScissorTest(oldScissorTest); gpu.setClearColor(oldColor, oldAlpha);
    host.render(); glErrors.push(...errors());
  }
  const after = { world: await hashJSON(k.world), advance: await hashJSON(k.advanceState), gpu: inventory() };
  const framebufferSHA256 = {};
  for (const [name, bytes] of Object.entries(captured)) framebufferSHA256[name] = await sha(bytes);
  const checks = { water: Object.values(waterEvidence.checks).every(Boolean), boundary: Object.values(boundaryEvidence.checks).every(Boolean),
    worldUnchanged: before.world === after.world, advanceUnchanged: before.advance === after.advance,
    actualHostResourcesRestored: JSON.stringify(before.gpu) === JSON.stringify(after.gpu), noGLErrors: !pendingGlErrors.length && !glErrors.length };
  return { pass: Object.values(checks).every(Boolean), checks, diagnosticOnly: true, golden: false, renderTargetsCreated: 0,
    alphaBits, contextAttributes: gl.getContextAttributes(), alphaProbeMethod: 'production alpha/discard calculations unchanged; final alpha routed to RGB without tone/colorspace; actualRGBA separately read with NoBlending (A may be 255 on alpha:false)',
    framebuffer: 'existing renderer default framebuffer', viewport: [S, S], water: waterEvidence, boundary: boundaryEvidence,
    before, after, pendingGlErrors, glErrors, framebufferSHA256 };
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
    delete mode.png; mode.image = path.relative(ROOT, path.join(OUT, `${mode.mode}.png`)).replaceAll('\\', '/');
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
    report.coastSampling = await page(`return (${coastSamplingPage.toString()})();`);
    fs.writeFileSync(path.join(OUT, 'coast-sampling-contract.json'), JSON.stringify(report.coastSampling, null, 2) + '\n');
    report.height = await page(`return (${heightPage.toString()})();`);
    report.height.vertexOracle = await page(`return (${vertexGradientPage.toString()})();`);
    report.height.pass = report.height.pass && report.height.vertexOracle.pass;
    fs.writeFileSync(path.join(OUT, 'height-contract.json'), JSON.stringify(report.height, null, 2) + '\n');
    report.waterBoundary = await page(`return (${waterBoundaryPage.toString()})();`);
    fs.writeFileSync(path.join(OUT, 'water-boundary-contract.json'), JSON.stringify(report.waterBoundary, null, 2) + '\n');
  }
  report.errors = { runtime: browser.errors(), console: browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
    .map(e => (e.params.args || []).map(a => a.value ?? a.description ?? '').join(' ')) };
  assert.deepEqual(report.errors, { runtime: [], console: [] }, 'runtime/console errors');
  assert(d.pass, 'decomposition invariants failed (see decomposition.json)');
  if (!decompositionOnly) assert(report.coast.pass, 'GPU coast contract failed (see coast-contract.json)');
  if (!decompositionOnly) assert(report.coastSampling.pass, 'GPU packed coast scalar contract failed (see coast-sampling-contract.json)');
  if (!decompositionOnly) assert(report.height.pass, 'GPU continuous broad height contract failed (see height-contract.json)');
  if (!decompositionOnly) assert(report.waterBoundary.pass, 'GPU water/boundary contract failed (see water-boundary-contract.json)');
  report.pass = true;
  console.log(JSON.stringify({ decomposition: d.pass, coast: decompositionOnly ? 'skipped by explicit flag' : report.coast.pass,
    coastSampling: decompositionOnly ? 'skipped by explicit flag' : report.coastSampling.pass,
    height: decompositionOnly ? 'skipped by explicit flag' : report.height.pass,
    waterBoundary: decompositionOnly ? 'skipped by explicit flag' : report.waterBoundary.pass, out: OUT }));
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
