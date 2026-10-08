#!/usr/bin/env node
// M2-C2D CPU contracts: continuous surface visual field (P1), painterly water (P1),
// broad-normal terrain shading + tone controls (P2), boundary ink attributes (P3).
// Runs headlessly; shader compilation itself is exercised by the Edge browser gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';
import { SurfaceVisualFieldTexture } from '../src/inkbox/render3d/art/SurfaceVisualFieldTexture.js';
import { WaterPigmentMaterial } from '../src/inkbox/render3d/water/WaterPigmentMaterial.js';
import { createBoundaryInkMaterial, applyBoundaryInkStyle } from '../src/inkbox/render3d/boundary/BoundaryInkMaterial.js';
import { realmStyleFor } from '../src/inkbox/render3d/art/RealmStyleProfile.js';
import { visualElevation } from '../src/inkbox/render3d/terrain/VisualElevation.js';

let passed = 0;
const checks = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = (label, run) => { run(); passed += 1; checks.push({ label, status: 'passed' }); console.log(`PASS ${label}`); };
// 结构断言必须先去掉注释：文档里「提到」某个被禁词不等于代码里用了它（沿用 M2-B 的做法）。
function stripComments(source) {
  let out = ''; let i = 0; const n = source.length; let state = 'code';
  while (i < n) {
    const c = source[i], d = source[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { state = 'block'; i += 2; continue; }
      if (c === "'") state = 'single';
      else if (c === '"') state = 'double';
      else if (c === '`') state = 'template';
      out += c; i += 1; continue;
    }
    if (state === 'line') { if (c === '\n') { state = 'code'; out += c; } i += 1; continue; }
    if (state === 'block') { if (c === '*' && d === '/') { state = 'code'; i += 2; } else i += 1; continue; }
    out += c;
    if (c === '\\') { out += source[i + 1] ?? ''; i += 2; continue; }
    if ((state === 'single' && c === "'") || (state === 'double' && c === '"') || (state === 'template' && c === '`')) state = 'code';
    i += 1;
  }
  return out;
}
const readSource = file => fs.readFileSync(path.join(root, file), 'utf8');
const readCode = file => stripComments(readSource(file));
const C2D_FILES = [
  'src/inkbox/render3d/art/SurfaceVisualFieldTexture.js',
  'src/inkbox/render3d/water/WaterPigmentMaterial.js',
  'src/inkbox/render3d/boundary/BoundaryInkMaterial.js',
];

function makeWorld(seed = 916263, preset = { w: 64, h: 48 }) {
  const world = generateWorld({ preset, seed, scatter: true });
  world.upper = generateUpperWorld({ preset, seed: world.seed });
  world.nether = generateNetherWorld({ preset, seed: world.seed });
  return world;
}
function hostOptions() {
  const gpu = { info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } },
    setPixelRatio() {}, setClearColor() {}, setSize() {}, render() {}, dispose() {} };
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(0, 60, 70); camera.lookAt(0, 0, 0);
  const cameraRig = { camera, update() {}, resize() {}, setDimensions(dimensions) { this.dimensions = { ...dimensions }; }, focusOn() {}, dispose() {} };
  return { gpu, cameraRig };
}
function makeHost(world) {
  const options = hostOptions();
  return { host: new Render3DHost({ clientWidth: 900, clientHeight: 600 }, world, options), ...options };
}
const windowRegion = world => new RegionMask({
  x0: Math.floor(world.w * 0.25), y0: Math.floor(world.h * 0.25),
  x1: Math.floor(world.w * 0.75), y1: Math.floor(world.h * 0.75),
  path: [[Math.floor(world.w * 0.25), Math.floor(world.h * 0.25)], [Math.floor(world.w * 0.75), Math.floor(world.h * 0.25)],
    [Math.floor(world.w * 0.75), Math.floor(world.h * 0.75)], [Math.floor(world.w * 0.25), Math.floor(world.h * 0.75)]],
  area: world.w * world.h * 0.25,
});

// ── T1 · 硬边界与既有契约的结构守卫 ─────────────────────────────────────
check('T1 C2D 新文件不引入全屏后处理 / 新依赖 / 美术随机', () => {
  for (const file of C2D_FILES) {
    const source = readCode(file);
    for (const banned of ['EffectComposer', 'WebGLRenderTarget', 'RenderTarget', 'Bloom', 'Kuwahara', 'SSAO', 'UnrealBloomPass', 'Math.random'])
      assert.doesNotMatch(source, new RegExp(banned.replace('.', '\\.')), `${file} 不得出现 ${banned}`);
  }
});

check('T1 VisualElevation 公式冻结，terrain type 仍为离散 NearestFilter', () => {
  const source = readCode('src/inkbox/render3d/terrain/VisualElevation.js');
  assert.match(source, /d \* 38 \+ Math\.max\(0, d\) \*\* 2 \* 38/, 'VisualElevation 公式必须逐字保持');
  assert.equal(visualElevation(0.5), (0.5 - 0.3) * 38 + Math.pow(0.2, 2) * 38, 'VisualElevation 结果不得改变');
  const textures = readCode('src/inkbox/render3d/art/TerrainDataTextures.js');
  assert.match(textures, /NearestFilter/, 'terrain typeTexture 必须保持 NearestFilter');
  const terrain = readCode('src/inkbox/render3d/art/PigmentTerrainMaterial.js');
  assert.match(terrain, /float typeAt\(vec2 p\) \{ return floor\(texture2D\(typeTexture/, 'terrain type 必须按离散 ID 读取，不得线性插值');
  assert.match(terrain, /surfaceTexture/, 'terrain 必须借用连续 surface visual field');
});

check('T1 RealmBoundaryLayer 仍满足 M2-B §30/§44/§58 与 zero-gap 契约', () => {
  const source = readCode('src/inkbox/render3d/boundary/RealmBoundaryLayer.js');
  for (const banned of ['EffectComposer', 'RenderTarget', 'WebGLRenderTarget', 'WebGPU', 'ShaderMaterial', 'drainRuntimeEvents'])
    assert.doesNotMatch(source, new RegExp(banned), `界缘层不得出现 ${banned}`);
  assert.doesNotMatch(source, /world\.rifts|riftRadiusAt|riftIsActive|openRifts/, '界缘层不得持有 / 读取裂缝');
  assert.match(source, /RENDER_ORDER\.realmBoundary/);
  for (const name of ['rawGap', 'visualDepth', 'boundaryDirection']) assert.match(source, new RegExp(name));
  assert.match(source, /targetElevation\.node\(ax, ay\)/, '顶部仍是目标界高程（zero-gap 由构造保证）');
  assert.match(source, /mortalElevation\.node\(ax, ay\)/, '底部仍是凡间高程');
});

// ── T2 · 连续表面视觉场 ────────────────────────────────────────────────
check('T2 SurfaceVisualFieldTexture：RGBA8 + LinearFilter + R 水深与 packed 邻格', () => {
  const world = makeWorld();
  const field = new SurfaceVisualFieldTexture(world);
  assert.equal(field.texture.format, THREE.RGBAFormat);
  assert.equal(field.texture.type, THREE.UnsignedByteType);
  assert.equal(field.texture.minFilter, THREE.LinearFilter);
  assert.equal(field.texture.magFilter, THREE.LinearFilter);
  assert.equal(field.texture.generateMipmaps, false);
  assert.equal(field.bytes.byteLength, world.size * 4);
  let wet = 0, dry = 0;
  const byteAt = (x, y) => {
    const d = world.water[y * world.w + x];
    return d > 0 ? Math.min(255, Math.round(d / field.depthReference * 255)) : 0;
  };
  for (let i = 0; i < world.size; i++) {
    const expected = world.water[i] > 0 ? Math.min(255, Math.round(world.water[i] / field.depthReference * 255)) : 0;
    assert.equal(field.bytes[i * 4], expected, `cell ${i} 的 R 通道必须是归一化水深`);
    const x = i % world.w, y = Math.floor(i / world.w);
    assert.deepEqual([...field.bytes.subarray(i * 4, i * 4 + 4)], [
      expected, byteAt(Math.max(0, x - 1), y), byteAt(Math.min(world.w - 1, x + 1), y), byteAt(x, Math.max(0, y - 1)),
    ], `cell ${i} 的 G/B/A 必须为 clamped 左/右/下的 R8`);
    if (world.water[i] > 0) {
      wet += 1;
      // 8 bit 量化下限 = depthReference/255 ≈ 0.00196；比它更浅的水按 0 处理（记录在案）。
      if (world.water[i] >= field.depthReference / 255) assert(field.bytes[i * 4] > 0, `cell ${i} 的水深在量化精度之上，不得为 0`);
    } else { dry += 1; assert.equal(field.bytes[i * 4], 0); }
  }
  assert(wet > 0 && dry > 0, `测试世界必须同时有干湿格（wet=${wet} dry=${dry}）`);
  field.dispose();
});

check('T2 更新按核半径外扩，CPU payload 在预算内', () => {
  const world = makeWorld();
  const field = new SurfaceVisualFieldTexture(world, { kernelRadius: 0 });
  assert.equal(field.kernelRadius, 1, 'packed 邻格必须保留至少一格 dirty halo');
  const beforeBytes = field.bytes.slice();
  world.water[10 * world.w + 10] = world.water[10 * world.w + 10] > 0 ? 0 : 0.5;
  const before = field.stats.cells;
  field.update({ x0: 10, y0: 10, x1: 10, y1: 10 });
  assert.equal(field.stats.cells - before, 9, '单格 dirty 必须按核半径 1 扩成 3×3');
  const changedDepth = world.water[10 * world.w + 10] > 0 ? 255 : 0;
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    const i = (y * world.w + x) * 4;
    const expected = beforeBytes.subarray(i, i + 4).slice();
    if (x === 10 && y === 10) expected[0] = changedDepth;
    if (x === 11 && y === 10) expected[1] = changedDepth;
    if (x === 9 && y === 10) expected[2] = changedDepth;
    if (x === 10 && y === 11) expected[3] = changedDepth;
    assert.deepEqual([...field.bytes.subarray(i, i + 4)], [...expected], `dirty 更新仅修改受影响的 packed byte：${x},${y}`);
  }
  const medium = new SurfaceVisualFieldTexture({ w: 288, h: 180, size: 288 * 180, water: new Float32Array(288 * 180), plane: 'mortal' });
  assert(medium.bytes.byteLength <= 0.25 * 1024 * 1024, `medium 视觉场必须 ≤ 0.25 MiB，实际 ${medium.bytes.byteLength}`);
  medium.dispose(); field.dispose();
});

check('T2 视觉场只编码水深，不读 terrain type', () => {
  const source = readCode('src/inkbox/render3d/art/SurfaceVisualFieldTexture.js');
  assert.match(source, /w\.water\[y \* w\.w \+ x\]/, '必须取 world.water 的指定格');
  assert.doesNotMatch(source, /\.type\[/, '不得读取 terrain type');
});

// ── T3 · 水面材质替换与 legacy 几何恢复 ────────────────────────────────
check('T3 水面：realm-style 不改 World / Region，legacy 几何原样恢复', () => {
  const world = makeWorld();
  const { host } = makeHost(world);
  host.setArtProfile('legacy');
  const water = host.stages.get('mortal').water;
  const regionGeometry = new RegionGeometry(world, windowRegion(world));
  water.setRegionGeometry(regionGeometry, true);
  const mesh = water.mesh;
  const legacyMaterial = water.material;
  const legacyGeometry = water.legacyGeometry;
  const legacyIndices = legacyGeometry.index.array.slice();
  const waterData = world.water;
  const waterBefore = world.water.slice();
  const regionInside = water.regionInside;
  host.setArtProfile('realm-style-v1');
  assert.equal(water.inkActive, true, 'realm-style 必须使用绘画水面材质');
  assert(water.mesh.material instanceof WaterPigmentMaterial);
  assert.equal(water.mesh.material.uniforms.surfaceTexture.value, host.stages.get('mortal').surfaceField.texture);
  assert.equal(water.mesh.material.uniforms.surfaceDepthRef.value, host.stages.get('mortal').surfaceField.depthReference);
  assert.equal(world.water, waterData, '切换 art profile 不得替换 World 水深事实源');
  assert.deepEqual(world.water, waterBefore, '切换 art profile 不得改写 World 水深');
  assert.equal(host.world, world, '切换 art profile 不得建立第二套 World');
  assert.equal(water.regionGeometry, regionGeometry, '切换 art profile 不得替换 Region 几何');
  assert.equal(water.regionInside, regionInside, '切换 art profile 不得改变 Region 方向');
  assert.equal(water.mesh, mesh, '切换 art profile 必须复用原水面 mesh');
  host.setArtProfile('legacy');
  assert.equal(water.inkActive, false, 'legacy 必须恢复原材质');
  assert.equal(water.mesh.material, legacyMaterial);
  assert.equal(water.geometry, legacyGeometry, 'legacy 必须恢复原始几何');
  assert.deepEqual(water.geometry.index.array, legacyIndices, 'legacy 路径仍保持既有水面拓扑');
  assert.equal(host.stages.get('mortal').root.children.filter(child => child === water.mesh).length, 1, '水面仍只有一个网格');
  host.dispose();
});

check('T3 水面材质保留 ArtPass 的 color / opacity 语义', () => {
  const world = makeWorld();
  const field = new SurfaceVisualFieldTexture(world);
  const material = new WaterPigmentMaterial(world, field, { realmStyle: realmStyleFor('mortal'), paperColor: realmStyleFor('mortal').paper.color });
  assert(material.color instanceof THREE.Color, 'material.color 必须是 Color（ArtPass legacy 通道）');
  material.color.set('#ffffff');
  assert.equal(material.color, material.uniforms.tint.value, 'color 必须就是 tint uniform 本体');
  assert.equal(material.color.getHexString(), 'ffffff');
  assert.equal(typeof material.opacity, 'number');
  material.dispose(); field.dispose();
});

// ── T4 · 界缘水墨断面 ──────────────────────────────────────────────────
check('T4 界缘：verticalT / edgeSeed 只读属性与几何契约并存', () => {
  const world = makeWorld();
  const { host } = makeHost(world);
  host.setArtProfile('realm-style-v1');
  host.setRealmViewState({ open: true, targetPlane: 'upper', region: windowRegion(world) });
  host.update(0.016);
  const boundary = host.boundary;
  assert(boundary.edges > 0, '必须画出边界边');
  assert.equal(boundary.stats.triangles, boundary.edges * 2, '每条边仍是 1 quad / 2 三角形');
  const vertical = boundary.vertical.array, seeds = boundary.edgeSeed.array;
  for (let edge = 0; edge < boundary.edges; edge++) {
    const base = edge * 4;
    assert.deepEqual([vertical[base], vertical[base + 1], vertical[base + 2], vertical[base + 3]], [1, 0, 1, 0], '底 0 / 顶 1');
    const seed = seeds[base];
    assert(seed >= 0 && seed < 1, 'edgeSeed 必须落在 [0,1)');
    assert.equal(seeds[base + 1], seed); assert.equal(seeds[base + 2], seed); assert.equal(seeds[base + 3], seed);
  }
  const unique = new Set(Array.from({ length: boundary.edges }, (_, e) => seeds[e * 4]));
  assert(unique.size > 1, 'edgeSeed 必须按边区分');
  host.dispose();
});

check('T4 界缘：材质、picking 反查与 legacy 颜色通道都不变', () => {
  const world = makeWorld();
  const { host } = makeHost(world);
  host.setArtProfile('realm-style-v1');
  host.setRealmViewState({ open: true, targetPlane: 'nether', region: windowRegion(world) });
  host.update(0.016);
  const boundary = host.boundary;
  const material = boundary.material;
  assert.equal(material.vertexColors, true);
  assert.equal(material.transparent, true);
  assert(material.color instanceof THREE.Color, 'material.color 必须仍是 Color');
  material.color.set('#ffffff');
  assert.equal(material.color.getHexString(), material.uniforms.tint.value.getHexString(), 'color 必须直接写 tint uniform');
  const edge = boundary.edgeAtTriangle(0);
  assert.equal(edge.kind, 'realm-boundary');
  assert.equal(edge.targetPlane, 'nether');
  assert.equal(boundary.edgeAtTriangle(boundary.stats.triangles - 1) !== null, true, '最后一条边仍可按三角形反查');
  const style = realmStyleFor('nether');
  applyBoundaryInkStyle(material, style);
  assert.equal(material.uniforms.boneStrength.value, style.boundaryInk.bone, 'nether 骨线强度必须来自风格档案');
  applyBoundaryInkStyle(material, null);
  assert(material.uniforms.boneStrength.value < style.boundaryInk.bone, 'null 风格必须回到接近平板的调制');
  host.dispose();
});

// ── T5 · 地形绘画法线与明度骨架 ────────────────────────────────────────
check('T5 地形：低频 broad normal 与三项 tone control 从风格档案接线', () => {
  const world = makeWorld();
  const { host } = makeHost(world);
  host.setArtProfile('realm-style-v1');
  const terrain = host.stages.get('mortal').terrain;
  const uniforms = terrain.inkMaterial.uniforms;
  const style = realmStyleFor('mortal');
  assert.equal(uniforms.massShadeStrength.value, style.tone.massShade);
  assert.equal(uniforms.deepInkStrength.value, style.tone.deepInk);
  assert.equal(uniforms.heightWashStrength.value, style.tone.heightWash);
  assert(uniforms.broadRadius.value >= 2, '低频半径必须明显大于 1 格，否则退化成三角面噪声');
  assert.equal(uniforms.surfaceMode.value, 1, '凡间地形必须借用连续表面视觉场');
  assert.equal(uniforms.surfaceTexture.value, host.stages.get('mortal').surfaceField.texture);
  const shader = uniforms.massShadeStrength ? terrain.inkMaterial.fragmentShader : '';
  assert.match(shader, /vec3 broadN=normalize/, '必须存在绘画用低频法线');
  assert.match(shader, /float facing=abs\(dot\(broadN,/, 'silhouette/facing 必须走 broad normal');
  assert.doesNotMatch(shader, /cross\(dFdx\(vWorld\),dFdy\(vWorld\)\)/, '不得再用真实三角面 dFdx/dFdy 做 facing');
  assert.match(shader, /structure\*structure\*deepInkStrength/, '深墨必须集中在结构位置');
  // 远景结构墨（小笔触）仍在：ridge / valley / breakInk 与 sparse/dry 未被移除。
  for (const token of ['float ridge=', 'float valley=', 'float breakInk=', 'float sparse=', 'float dry=']) assert.match(shader, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  host.dispose();
});

check('T5 三界 tone / water / boundaryInk 参数齐全且在合理范围', () => {
  for (const plane of ['mortal', 'upper', 'nether']) {
    const style = realmStyleFor(plane);
    for (const key of ['massShade', 'deepInk', 'heightWash']) assert(Number.isFinite(style.tone[key]), `${plane}.tone.${key} 缺失`);
    assert(style.tone.massShade > 0 && style.tone.massShade < 1, `${plane} 大尺度明暗必须克制`);
    assert(style.tone.deepInk > 0 && style.tone.deepInk < 1, `${plane} 深墨必须克制`);
    for (const key of ['paperStrength', 'rippleStrength', 'shoreSoftness']) assert(Number.isFinite(style.water[key]), `${plane}.water.${key} 缺失`);
    for (const key of ['strata', 'dryBrush', 'bottomFade', 'topBand', 'inkVariation', 'bone']) assert(Number.isFinite(style.boundaryInk[key]), `${plane}.boundaryInk.${key} 缺失`);
  }
  assert.equal(realmStyleFor('nether').tone.heightWash, 0, '幽冥不做高峰回纸（它要的是深，不是亮）');
});

// ── T6 · 只读表现：不新增 World 字段、不改世界数据 ─────────────────────
check('T6 开窗 + 换档不写 World，也不新增字段', () => {
  const world = makeWorld();
  const keysBefore = Object.keys(world).sort();
  const heightBefore = world.height.slice(), waterBefore = world.water.slice();
  const { host } = makeHost(world);
  host.setArtProfile('realm-style-v1');
  host.setRealmViewState({ open: true, targetPlane: 'upper', region: windowRegion(world) });
  host.update(0.016);
  host.setArtProfile('legacy');
  host.setRealmViewState({ open: false, targetPlane: null, region: null });
  host.update(0.016);
  assert.deepEqual(Object.keys(world).sort(), keysBefore, 'World 不得新增字段');
  assert.deepEqual([...world.height], [...heightBefore], '地形真实 height 不得被表现层改写');
  assert.deepEqual([...world.water], [...waterBefore], 'water 不得被表现层改写');
  host.dispose();
});

console.log(`\nM2-C2D CPU contracts: ${passed}/${checks.length} passed`);
fs.mkdirSync(path.join(root, 'reports/local/m2c2d'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports/local/m2c2d/cpu-contracts.json'),
  JSON.stringify({ suite: 'M2-C2D CPU contracts', pass: true, checks, finishedAt: new Date().toISOString() }, null, 2) + '\n');
