#!/usr/bin/env node
// T2 · 卜算子资产结构验收（不启浏览器；读的是随包发布的真实 GLB / PNG 字节）
//
// 覆盖 A1_TEAM.md §3.2 的结构要求：
//   · 38 骨（前 16 与修士库一致：关节名/顺序 + inverseBindMatrices 字节）
//   · 3 个 clip（Idle / Walk / Wind）的名称、时长、通道数、STEP 插值
//   · Wind 的 16 根身体骨通道与 Idle 逐字节相同（只有附加骨在动）
//   · 蒙皮：每顶点 1 根骨、权重 1；每根附加骨在每个片段里都有旋转通道
//   · 调色板：20 格 PNG、UV 落在 (i+.5)/20 色格中心、最近邻、单材质单贴图
//   · 面数：5 个网格节点 714 + 182 + 50 + 330 + 258 = 1534
//   · manifest 与 GLB 实测逐项一致（三角形、骨骼、片段、来源 sha256）
// 末尾用合成骨架再跑一遍 BusanziLibrary 的真实构造/释放路径（无浏览器、无 GPU）。
//
// 用法：node scripts/inkbox-busanzi-check.mjs
// 退出码：0 = 全过；1 = 任一断言失败。

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  BUSANZI_CLIP_NAMES, BUSANZI_MESH_IDS, BUSANZI_PALETTE_COUNT, BusanziLibrary,
  paletteMaterial, paletteSlotAt, paletteUvCenter,
} from '../src/inkbox/render3d/busanzi/BusanziLibrary.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(root, 'assets/characters/busanzi');
const glbPath = path.join(assetRoot, 'mesh/busanzi.glb');
const palettePath = path.join(assetRoot, 'materials/busanzi_palette_20.png');
const portraitPath = path.join(assetRoot, 'materials/busanzi_portrait.png');
const manifestPath = path.join(assetRoot, 'data/busanzi_manifest.json');
const cultivatorPath = path.join(root, 'assets/characters/cultivator/mesh/cultivator_library.glb');
const reportPath = path.join(assetRoot, 'data/structural_validation.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();

// ── 只读 GLB 解析（结构验收读原始字节，不信任作者自报）─────────────────
function readGLB(bytes, label) {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${label}: 不是 GLB`);
  assert.equal(bytes.readUInt32LE(4), 2, `${label}: glTF 版本必须是 2`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${label}: header 长度字段与文件不符`);
  let json = null, binary = null;
  for (let at = 12; at < bytes.length;) {
    assert(at + 8 <= bytes.length, `${label}: GLB chunk 截断`);
    const size = bytes.readUInt32LE(at), kind = bytes.readUInt32LE(at + 4), end = at + 8 + size;
    assert(size % 4 === 0 && end <= bytes.length, `${label}: GLB chunk 尺寸非法`);
    if (kind === 0x4e4f534a) { assert(!json, `${label}: 重复 JSON chunk`); json = JSON.parse(bytes.toString('utf8', at + 8, end)); }
    else if (kind === 0x004e4942) { assert(!binary, `${label}: 重复 BIN chunk`); binary = bytes.subarray(at + 8, end); }
    else throw new Error(`${label}: 未知 GLB chunk`);
    at = end;
  }
  assert(json && binary, `${label}: 缺 JSON 或 BIN chunk`);
  assert.equal(json.buffers?.length, 1, `${label}: 必须只有一个内嵌 buffer`);
  assert.equal(json.buffers[0].uri, undefined, `${label}: GLB 必须自包含`);
  return { json, binary };
}

const COMPONENT = {
  5120: [1, 'readInt8'], 5121: [1, 'readUInt8'], 5122: [2, 'readInt16LE'],
  5123: [2, 'readUInt16LE'], 5125: [4, 'readUInt32LE'], 5126: [4, 'readFloatLE'],
};
const TYPE_WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function accessorView(gltf, index) {
  const accessor = gltf.json.accessors?.[index];
  assert(accessor, `accessor ${index} 不存在`);
  assert(!accessor.sparse, `accessor ${index} 不允许 sparse`);
  const [width, read] = COMPONENT[accessor.componentType] || [];
  const typeWidth = TYPE_WIDTH[accessor.type];
  assert(width && typeWidth, `accessor ${index} 类型不支持`);
  const view = gltf.json.bufferViews[accessor.bufferView];
  assert(view && view.buffer === 0, `accessor ${index} bufferView 非法`);
  const stride = view.byteStride || width * typeWidth;
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const end = start + (accessor.count ? (accessor.count - 1) * stride + width * typeWidth : 0);
  assert(start >= (view.byteOffset || 0) && end <= (view.byteOffset || 0) + view.byteLength, `accessor ${index} 越界`);
  assert(end <= gltf.json.buffers[0].byteLength, `accessor ${index} 超出 BIN chunk`);
  return { accessor, view, width, typeWidth, stride, start, read };
}

const accessorFloats = (gltf, index) => {
  const { accessor, width, typeWidth, stride, start, read } = accessorView(gltf, index);
  assert.equal(width, 4, `accessor ${index} 不是 32 位浮点`);
  const out = new Float32Array(accessor.count * typeWidth);
  for (let i = 0; i < accessor.count; i += 1) {
    for (let k = 0; k < typeWidth; k += 1) out[i * typeWidth + k] = gltf.binary.readFloatLE(start + i * stride + k * 4);
  }
  return { values: out, count: accessor.count, typeWidth };
};

/** 取 accessor 的紧凑字节（无 stride 时就是原始切片；有 stride 时逐元素拼）。 */
const accessorBytes = (gltf, index) => {
  const { accessor, width, typeWidth, stride, start, read } = accessorView(gltf, index);
  const packed = width * typeWidth;
  if (stride === packed) return Buffer.from(gltf.binary.subarray(start, start + accessor.count * packed));
  const out = Buffer.alloc(accessor.count * packed);
  for (let i = 0; i < accessor.count; i += 1) gltf.binary.copy(out, i * packed, start + i * stride, start + i * stride + packed);
  return out;
};

const readInts = (gltf, index) => {
  const { accessor, width, typeWidth, stride, start, read } = accessorView(gltf, index);
  const out = [];
  for (let i = 0; i < accessor.count; i += 1) {
    for (let k = 0; k < typeWidth; k += 1) out.push(read === 'readUInt8' ? gltf.binary.readUInt8(start + i * stride + k * width) : read === 'readUInt16LE' ? gltf.binary.readUInt16LE(start + i * stride + k * width) : gltf.binary.readUInt32LE(start + i * stride + k * width));
  }
  return out;
};

// ── PNG 解码（只支持本资产的 8bit RGBA、非隔行；做完整反滤波）──────────
function decodePNG(bytes, label) {
  assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${label}: PNG 签名不对`);
  let width = 0, height = 0, colorType = 0, bitDepth = 0, interlace = 0, ended = false;
  const compressed = [];
  for (let at = 8; at < bytes.length;) {
    assert(at + 12 <= bytes.length, `${label}: PNG chunk 截断`);
    const size = bytes.readUInt32BE(at), end = at + 12 + size;
    assert(end <= bytes.length, `${label}: PNG chunk 越界`);
    const type = bytes.toString('ascii', at + 4, at + 8), data = bytes.subarray(at + 8, at + 8 + size);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') { ended = true; assert.equal(end, bytes.length, `${label}: PNG 尾部有多余数据`); }
    at = end;
  }
  assert(ended && width && height, `${label}: PNG 缺 IHDR/IEND`);
  assert.equal(bitDepth, 8, `${label}: 只支持 8bit PNG`);
  assert.equal(colorType, 6, `${label}: 只支持 RGBA PNG`);
  assert.equal(interlace, 0, `${label}: 只支持非隔行 PNG`);
  const bpp = 4, rowLength = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(compressed), { maxOutputLength: (rowLength + 1) * height });
  assert.equal(raw.length, (rowLength + 1) * height, `${label}: PNG 解压长度不符`);
  const pixels = Buffer.alloc(rowLength * height);
  let previous = Buffer.alloc(rowLength);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (rowLength + 1)];
    const source = raw.subarray(y * (rowLength + 1) + 1, (y + 1) * (rowLength + 1));
    const row = Buffer.alloc(rowLength);
    for (let i = 0; i < rowLength; i += 1) {
      const a = i >= bpp ? row[i - bpp] : 0, b = previous[i], c = i >= bpp ? previous[i - bpp] : 0;
      let value = source[i];
      if (filter === 1) value = (value + a) & 0xff;
      else if (filter === 2) value = (value + b) & 0xff;
      else if (filter === 3) value = (value + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value = (value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      } else assert.equal(filter, 0, `${label}: PNG filter 非法`);
      row[i] = value;
    }
    row.copy(pixels, y * rowLength);
    previous = row;
  }
  return { width, height, pixels };
}

const report = { generatedAt: new Date().toISOString(), asset: 'busanzi', pass: false };

// ── ① GLB 总体结构 ───────────────────────────────────────────────────
const glbBytes = fs.readFileSync(glbPath);
const gltf = readGLB(glbBytes, 'busanzi.glb');
const { json } = gltf;
assert.equal(json.scenes?.length, 1, 'GLB 必须只有一个场景');
assert.equal(json.materials?.length, 1, '单材质');
assert.equal(json.textures?.length, 1, '单贴图');
assert.equal(json.images?.length, 1, '单图集');
assert.equal(json.skins?.length, 1, '单 skin');
assert(json.images[0].bufferView !== undefined, '图集必须内嵌在 GLB 里（运行包不依赖外部贴图）');
assert.equal(json.images[0].mimeType, 'image/png', '内嵌图集必须是 PNG');
assert.equal(json.samplers?.[0]?.magFilter, 9728, '调色板必须最近邻放大');
assert.equal(json.samplers?.[0]?.minFilter, 9728, '调色板必须最近邻缩小');
assert.equal(json.samplers?.[0]?.wrapS, 33071, '调色板 U 必须 CLAMP_TO_EDGE');
assert.equal(json.samplers?.[0]?.wrapT, 33071, '调色板 V 必须 CLAMP_TO_EDGE');

const rootNodeIndex = json.scenes[0].nodes?.[0];
const rootNode = json.nodes[rootNodeIndex];
assert.equal(rootNode?.name, 'cultivator_rig', '场景根节点必须沿用修士库的 cultivator_rig 名字');

// ── ② 5 个网格节点 / 面数 / 蒙皮 ────────────────────────────────────
const meshNodes = json.nodes.filter((node) => node.mesh !== undefined);
assert.equal(meshNodes.length, 5, '必须是 5 个网格节点');
assert.deepEqual(meshNodes.map((node) => node.name), [...BUSANZI_MESH_IDS], '5 个网格节点名/顺序');
for (const node of meshNodes) assert.equal(rootNode.children.includes(json.nodes.indexOf(node)), true, `${node.name} 必须是 cultivator_rig 的直接子节点`);

const skeletonJoints = json.skins[0].joints;
assert.equal(skeletonJoints.length, 38, 'skin.joints 必须是 38 根骨');
assert.equal(new Set(skeletonJoints).size, 38, '38 根骨不允许复用节点');
const jointNames = skeletonJoints.map((index) => json.nodes[index].name);
assert.deepEqual(jointNames, manifest.rig.joints, '骨骼名/顺序必须与 manifest 一致');
assert.deepEqual(manifest.rig.joints.slice(0, 16), [
  'root', 'pelvis', 'spine', 'head', 'l_upperarm', 'l_lowerarm', 'l_hand',
  'r_upperarm', 'r_lowerarm', 'r_hand', 'l_upperleg', 'l_lowerleg', 'l_foot',
  'r_upperleg', 'r_lowerleg', 'r_foot',
], '前 16 根骨必须是修士库共享骨架');
assert.equal(manifest.rig.addOnBones.length, 22, '附加骨必须是 22 根');
assert.deepEqual(manifest.rig.addOnBones, jointNames.slice(16), '附加骨必须覆盖骨骼列表后 22 项');

const meshTriangles = {};
let totalTriangles = 0;
const vertexUvs = [];
for (const [index, node] of meshNodes.entries()) {
  const mesh = json.meshes[node.mesh];
  assert.equal(mesh.name, manifest.meshes.list[index].mesh, `${node.name} 的 mesh 名与 manifest 一致`);
  assert.equal(mesh.primitives.length, 1, `${node.name} 必须只有一个 primitive`);
  const primitive = mesh.primitives[0];
  assert.equal(primitive.material, 0, `${node.name} 必须用共享材质 0`);
  assert.equal(primitive.mode ?? 4, 4, `${node.name} 必须是三角形`);
  for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
    assert(primitive.attributes[attribute] !== undefined, `${node.name} 缺 ${attribute}`);
  }
  assert.equal(node.skin, 0, `${node.name} 必须绑定 skin 0`);
  const positions = accessorFloats(gltf, primitive.attributes.POSITION);
  const indices = readInts(gltf, primitive.indices);
  assert.equal(indices.length % 3, 0, `${node.name} 索引数必须是 3 的倍数`);
  assert(indices.every((value) => value >= 0 && value < positions.count), `${node.name} 索引越界`);
  const triangles = indices.length / 3;
  meshTriangles[BUSANZI_MESH_IDS[index]] = triangles;
  totalTriangles += triangles;
  assert.equal(triangles, manifest.meshes.list[index].triangles, `${node.name} 面数与 manifest 不符`);

  const normals = accessorFloats(gltf, primitive.attributes.NORMAL);
  for (let i = 0; i < normals.count; i += 1) {
    const x = normals.values[i * 3], y = normals.values[i * 3 + 1], z = normals.values[i * 3 + 2];
    assert(Math.abs(Math.hypot(x, y, z) - 1) < 1e-3, `${node.name} 法线未单位化`);
  }

  const uvs = accessorFloats(gltf, primitive.attributes.TEXCOORD_0);
  for (let i = 0; i < uvs.count; i += 1) {
    const u = uvs.values[i * 2], v = uvs.values[i * 2 + 1];
    const scaled = u * BUSANZI_PALETTE_COUNT - 0.5;
    assert(Math.abs(scaled - Math.round(scaled)) < 1e-4, `${node.name} 的 UV u=${u} 不在 (i+.5)/20 色格中心`);
    assert(Math.abs(v - 0.5) < 1e-4, `${node.name} 的 UV v=${v} 必须在 20×1 图集中线 0.5`);
    vertexUvs.push(paletteSlotAt(u));
  }

  const joints = readInts(gltf, primitive.attributes.JOINTS_0);
  const weights = accessorFloats(gltf, primitive.attributes.WEIGHTS_0);
  assert.equal(weights.typeWidth, 4, `${node.name} WEIGHTS_0 必须是 VEC4`);
  for (let i = 0; i < weights.count; i += 1) {
    const row = [0, 1, 2, 3].map((k) => weights.values[i * 4 + k]);
    assert(Math.abs(row.reduce((a, b) => a + b, 0) - 1) < 1e-5, `${node.name} 顶点 ${i} 权重和不为 1`);
    const rigid = row.filter((value) => value >= 0.9999).length;
    assert.equal(rigid, 1, `${node.name} 顶点 ${i} 必须是单骨刚性蒙皮（权重 1）`);
    for (let k = 0; k < 4; k += 1) {
      if (row[k] > 0) assert(joints[i * 4 + k] < 38, `${node.name} 顶点 ${i} 骨骼号越界`);
    }
  }
}
assert.equal(totalTriangles, 1534, '三角形合计必须是 1534');
assert.equal(manifest.meshes.totalTriangles, 1534, 'manifest 三角形合计必须是 1534');
assert.deepEqual(meshTriangles, { buzuanzi_body: 714, buzuanzi_hair: 182, buzuanzi_talisman: 50, buzuanzi_accessories: 330, buzuanzi_umbrella: 258 }, '逐网格面数');
assert(new Set(vertexUvs).size > 1 && Math.min(...vertexUvs) >= 0 && Math.max(...vertexUvs) < 20, 'UV 色格下标必须落在 0..19');

// ── ③ 调色板图集：外部 PNG ↔ 内嵌 PNG ↔ manifest 三边一致 ─────────────
const paletteBytes = fs.readFileSync(palettePath);
assert.equal(sha256(paletteBytes), manifest.source.originalPaletteSha256, 'materials/ 调色板必须与来源字节一致');
const imageView = json.bufferViews[json.images[0].bufferView];
const embeddedImage = gltf.binary.subarray(imageView.byteOffset || 0, (imageView.byteOffset || 0) + imageView.byteLength);
assert.equal(sha256(embeddedImage), sha256(paletteBytes), 'GLB 内嵌图集必须与 materials/ 外部 PNG 逐字节一致');
const palette = decodePNG(paletteBytes, 'busanzi_palette_20.png');
assert.equal(palette.width, 20, '调色板宽度必须是 20');
assert.equal(palette.height, 1, '调色板高度必须是 1');
const paletteHex = [];
for (let i = 0; i < palette.width; i += 1) {
  paletteHex.push(`#${[...palette.pixels.subarray(i * 4, i * 4 + 3)].map((value) => value.toString(16).padStart(2, '0')).join('')}`);
}
assert.deepEqual(paletteHex, manifest.palette.colors.map((entry) => entry.hex.toLowerCase()), '调色板像素必须与 manifest 色表逐格一致');
assert.equal(manifest.palette.uvFormula, '(index + 0.5) / 20', 'manifest 必须记录 UV 公式');
assert.equal(manifest.palette.count, 20, 'manifest 调色板格数必须是 20');
for (const [index, entry] of manifest.palette.colors.entries()) {
  assert.equal(entry.index, index, '调色板 index 必须连续');
  assert.equal(paletteUvCenter(index), (index + 0.5) / 20, 'paletteUvCenter 必须与导出公式一致');
}

// ── ④ 动画：Idle / Walk / Wind ──────────────────────────────────────
assert.deepEqual(json.animations.map((animation) => animation.name), [...BUSANZI_CLIP_NAMES], '动画片段必须是 Idle / Walk / Wind');
const animationSummary = [];
for (const animation of json.animations) {
  assert.equal(animation.channels.length, 70, `${animation.name}: 通道数必须是 70（48 身体 + 22 附加骨）`);
  assert.equal(animation.samplers.length, 70, `${animation.name}: sampler 数必须是 70`);
  const targets = new Set();
  let minKeyframes = Infinity, maxKeyframes = 0, duration = 0;
  for (const channel of animation.channels) {
    assert(channel.target.node !== undefined && channel.target.path, `${animation.name}: 通道缺 target`);
    assert(skeletonJoints.includes(channel.target.node), `${animation.name}: 通道目标必须是骨架关节`);
    const targetName = json.nodes[channel.target.node].name;
    targets.add(`${targetName}:${channel.target.path}`);
    const sampler = animation.samplers[channel.sampler];
    const interpolation = sampler.interpolation ?? 'LINEAR';
    assert(['STEP', 'LINEAR'].includes(interpolation), `${animation.name}: 不支持的插值 ${interpolation}`);
    // 22 根附加骨是这次「风起」新做的动画：必须是 24fps STEP（与修士库身体通道的
    // 2 帧步进风格一致；原修士库身体通道里本来就混有 LINEAR，逐项对齐见 ⑤）。
    if (manifest.rig.addOnBones.includes(targetName)) {
      assert.equal(interpolation, 'STEP', `${animation.name}: 附加骨 ${targetName} 的通道必须是 STEP`);
    }
    const input = accessorFloats(gltf, sampler.input);
    assert.equal(input.typeWidth, 1, `${animation.name}: 时间输入必须是 SCALAR`);
    assert(input.count >= 2, `${animation.name}: 每个通道至少 2 个关键帧`);
    minKeyframes = Math.min(minKeyframes, input.count);
    maxKeyframes = Math.max(maxKeyframes, input.count);
    for (let i = 1; i < input.count; i += 1) assert(input.values[i] > input.values[i - 1], `${animation.name}: 时间必须单调递增`);
    duration = Math.max(duration, input.values[input.count - 1]);
    const output = accessorFloats(gltf, sampler.output);
    const expectedWidth = channel.target.path === 'rotation' ? 4 : channel.target.path === 'translation' || channel.target.path === 'scale' ? 3 : 0;
    assert.equal(output.typeWidth, expectedWidth, `${animation.name}: ${channel.target.path} 输出宽度不对`);
    if (channel.target.path === 'rotation') {
      for (let i = 0; i < output.count; i += 1) {
        const q = [0, 1, 2, 3].map((k) => output.values[i * 4 + k]);
        assert(Math.abs(Math.hypot(...q) - 1) < 1e-3, `${animation.name}: 旋转四元数未单位化`);
      }
    }
  }
  assert.equal(targets.size, 70, `${animation.name}: 70 个通道必须覆盖 70 个互不重复的 (骨, 路径)`);
  assert(Math.abs(duration - manifest.animations.durationSeconds) < 1e-6, `${animation.name}: 时长必须是 1.375s`);
  assert.equal(minKeyframes, manifest.animations.keyframes.min, `${animation.name}: 最少关键帧数必须与 manifest 一致`);
  assert.equal(maxKeyframes, manifest.animations.keyframes.max, `${animation.name}: 最多关键帧数必须与 manifest 一致`);
  animationSummary.push({ name: animation.name, channels: animation.channels.length, duration, minKeyframes, maxKeyframes });
}
for (const name of BUSANZI_CLIP_NAMES) {
  const declared = manifest.animations.clips.find((clip) => clip.name === name);
  assert(declared && declared.channels === 70 && Math.abs(declared.durationSeconds - 1.375) < 1e-6, `manifest 必须记录 ${name} 的 70 通道/1.375s`);
}

// 22 根附加骨在每个片段里都必须有旋转通道（Wind 的可见动作全靠它们）
for (const animation of json.animations) {
  const rotationTargets = new Set(animation.channels
    .filter((channel) => channel.target.path === 'rotation')
    .map((channel) => json.nodes[channel.target.node].name));
  for (const bone of manifest.rig.addOnBones) {
    assert(rotationTargets.has(bone), `${animation.name}: 附加骨 ${bone} 缺旋转通道`);
  }
}

// Wind 的 16 根身体骨通道必须与 Idle 逐字节相同（身体姿态不变，只有附加骨在动）
const clipByName = new Map(json.animations.map((animation) => [animation.name, animation]));
function channelBytes(animation, index) {
  const channel = animation.channels[index], sampler = animation.samplers[channel.sampler];
  return { target: `${json.nodes[channel.target.node].name}:${channel.target.path}`,
    input: accessorBytes(gltf, sampler.input), output: accessorBytes(gltf, sampler.output) };
}
for (let index = 0; index < 48; index += 1) {
  const idle = channelBytes(clipByName.get('Idle'), index);
  const wind = channelBytes(clipByName.get('Wind'), index);
  assert.equal(wind.target, idle.target, `Wind 第 ${index} 个通道目标必须与 Idle 一致`);
  assert(wind.input.equals(idle.input), `Wind 第 ${index} 个通道时间必须与 Idle 一致`);
  assert(wind.output.equals(idle.output), `Wind 第 ${index} 个通道数据必须与 Idle 一致`);
}
report.windBodyEqualsIdle = true;

// ── ⑤ 与修士库的一致性：前 16 根骨（名称/顺序 + inverseBindMatrices 字节）──
assert(fs.existsSync(cultivatorPath), '修士库 GLB 必须存在（用于前 16 骨一致性校验）');
const cultivator = readGLB(fs.readFileSync(cultivatorPath), 'cultivator_library.glb');
assert.equal(cultivator.json.skins?.length, 1, '修士库必须只有一个 skin');
const cultivatorJoints = cultivator.json.skins[0].joints;
assert.equal(cultivatorJoints.length, 16, '修士库必须是 16 根共享骨架');
const cultivatorNames = cultivatorJoints.map((index) => cultivator.json.nodes[index].name);
assert.deepEqual(jointNames.slice(0, 16), cultivatorNames, '卜算子前 16 根骨必须与修士库同名同序');
const busanziIbm = accessorBytes(gltf, json.skins[0].inverseBindMatrices);
const cultivatorIbm = accessorBytes(cultivator, cultivator.json.skins[0].inverseBindMatrices);
assert.equal(busanziIbm.length, 38 * 64, '卜算子 IBM 必须是 38 个 4×4 矩阵');
assert.equal(cultivatorIbm.length, 16 * 64, '修士库 IBM 必须是 16 个 4×4 矩阵');
assert(busanziIbm.subarray(0, 16 * 64).equals(cultivatorIbm), '前 16 个 inverseBindMatrices 必须与修士库逐字节一致');

// Idle / Walk 里的 48 个「原修士库身体通道」必须与仓库里的修士库逐字节一致
// （README 的兼容承诺：目标 / 插值 / 关键帧数据原样复制；附加骨通道才在它之上新增）。
const cultivatorClips = new Map((cultivator.json.animations || []).map((animation) => [animation.name.toLowerCase(), animation]));
function channelsByTarget(sourceGLTF, animation) {
  const map = new Map();
  for (const channel of animation.channels) {
    const name = sourceGLTF.json.nodes[channel.target.node].name;
    const sampler = animation.samplers[channel.sampler];
    map.set(`${name}:${channel.target.path}`, {
      interpolation: sampler.interpolation ?? 'LINEAR',
      input: accessorBytes(sourceGLTF, sampler.input),
      output: accessorBytes(sourceGLTF, sampler.output),
    });
  }
  return map;
}
let comparedChannels = 0;
for (const clipName of ['Idle', 'Walk']) {
  const cultivatorClip = cultivatorClips.get(clipName.toLowerCase());
  assert(cultivatorClip, `修士库必须有 ${clipName} 片段（前 16 骨兼容性前提）`);
  const cultivatorChannels = channelsByTarget(cultivator, cultivatorClip);
  assert.equal(cultivatorChannels.size, 48, `修士库 ${clipName} 必须有 48 个身体通道`);
  const busanziChannels = channelsByTarget(gltf, clipByName.get(clipName));
  for (const name of cultivatorNames) {
    for (const pathname of ['translation', 'rotation', 'scale']) {
      const key = `${name}:${pathname}`;
      const expected = cultivatorChannels.get(key);
      const actual = busanziChannels.get(key);
      assert(expected && actual, `卜算子 ${clipName} 必须保留修士库的 ${key} 通道`);
      assert.equal(actual.interpolation, expected.interpolation, `卜算子 ${clipName} ${key} 插值必须与修士库一致`);
      assert(actual.input.equals(expected.input), `卜算子 ${clipName} ${key} 关键帧时间必须与修士库字节一致`);
      assert(actual.output.equals(expected.output), `卜算子 ${clipName} ${key} 关键帧数据必须与修士库字节一致`);
      comparedChannels += 1;
    }
  }
}
assert.equal(comparedChannels, 96, 'Idle + Walk 各 48 个身体通道都必须逐字节对齐修士库');
report.cultivatorCompatibility = { joints: cultivatorNames, ibmBytesCompared: 16 * 64, animationChannels: 'Idle/Walk × 48 channels byte-identical' };

// ── ⑥ manifest 与 GLB 的一致性 + 来源/文档/肖像 ─────────────────────
assert.equal(manifest.schema, 'inkbox.busanzi.manifest/1', 'manifest schema');
assert.equal(manifest.assetId, 'busanzi', 'manifest assetId');
assert.equal(sha256(glbBytes), manifest.source.originalGlbSha256, 'mesh/busanzi.glb 必须与来源字节一致');
assert.match(manifest.source.zipSha256, /^[0-9A-F]{64}$/, 'manifest 必须记录来源 zip sha256');
assert(/buzuanzi\.zip$/.test(manifest.source.zip), 'manifest 必须记录来源 zip 名');
assert.equal(manifest.runtime.glb, 'mesh/busanzi.glb', 'manifest runtime.glb 路径');
assert.equal(manifest.runtime.palette, 'materials/busanzi_palette_20.png', 'manifest runtime.palette 路径');
for (const relative of [manifest.runtime.glb, manifest.runtime.palette, manifest.runtime.portrait]) {
  assert(fs.existsSync(path.join(assetRoot, relative)), `运行包资产必须存在：${relative}`);
}
const portrait = decodePNG(fs.readFileSync(portraitPath), 'busanzi_portrait.png');
assert(portrait.width >= 200 && portrait.height >= 200, '肖像 PNG 必须是从真实模型渲染出的清晰图（≥200px）');
const specPath = path.join(assetRoot, 'docs/BUSANZI_MODEL_SPEC.md');
assert(fs.existsSync(specPath), '必须提供 docs/BUSANZI_MODEL_SPEC.md');
const spec = fs.readFileSync(specPath, 'utf8');
for (const token of ['buzuanzi.zip', manifest.source.zipSha256, manifest.source.originalGlbSha256, 'BusanziLibrary', 'BusanziViewer', 'Idle', 'Walk', 'Wind', '20']) {
  assert(spec.includes(token), `docs/BUSANZI_MODEL_SPEC.md 必须写明：${token}`);
}

// ── ⑦ 用合成骨架跑真实 BusanziLibrary 构造/释放路径（无浏览器、无 GPU）──
function syntheticGLTF(manifestOverride) {
  const bones = manifestOverride.rig.joints.map((name) => new THREE.Bone());
  bones.forEach((bone, index) => { bone.name = manifestOverride.rig.joints[index]; });
  const skeleton = new THREE.Skeleton(bones);
  const texture = new THREE.DataTexture(new Uint8Array(20 * 4).fill(0xcc), 20, 1);
  const sourceMaterial = new THREE.MeshStandardMaterial({ map: texture, name: 'buzuanzi_flat_palette' });
  const rig = new THREE.Group(); rig.name = 'cultivator_rig';
  const scene = new THREE.Group(); scene.add(rig);
  for (const id of BUSANZI_MESH_IDS) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([paletteUvCenter(0), 0.5, paletteUvCenter(1), 0.5, paletteUvCenter(2), 0.5], 2));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    geometry.setIndex([0, 1, 2]);
    const mesh = new THREE.SkinnedMesh(geometry, sourceMaterial);
    mesh.name = id; mesh.bind(skeleton); rig.add(mesh);
  }
  const tracks = BUSANZI_CLIP_NAMES.map((name) => new THREE.QuaternionKeyframeTrack('head.quaternion', [1 / 24, 1.375], [0, 0, 0, 1, 0, 0, 0, 1]));
  return { scene, animations: BUSANZI_CLIP_NAMES.map((name, index) => new THREE.AnimationClip(name, 1.375, [tracks[index]])) };
}
const syntheticManifest = { ...manifest, meshes: { list: manifest.meshes.list.map(({ id, node, mesh }) => ({ id, node, mesh })) } };
const synthetic = syntheticGLTF(syntheticManifest);
const library = new BusanziLibrary(synthetic, syntheticManifest);
assert.equal(library.meshes.size, 5, '合成骨架必须构造出 5 个网格');
assert.equal(library.skeleton.bones.length, 38, '合成骨架必须 38 骨');
assert.equal(library.metrics().palette.nearest, true, 'BusanziLibrary 必须把贴图设为最近邻');
assert(Math.abs(library.clip('Wind').duration - 1.375) < 1e-6, 'clip(Wind) 必须是 1.375s 片段');
assert.throws(() => library.clip('Run'), /Unknown busanzi clip/, '未知片段必须抛错而不是静默返回 null');
library.dispose(); library.dispose();
assert.equal(library.disposed, true, 'dispose 必须幂等');
assert.throws(() => new BusanziLibrary(synthetic, { ...syntheticManifest, palette: { ...syntheticManifest.palette, count: 12 } }), /20 colours/,
  '12 色（修士库规格）必须被 BusanziLibrary 拒绝');
const fallbackMaterial = paletteMaterial({ map: new THREE.DataTexture(new Uint8Array(80), 20, 1) });
assert.equal(fallbackMaterial.flatShading, true, 'paletteMaterial 必须 flatShading');
assert.equal(fallbackMaterial.map.magFilter, THREE.NearestFilter, 'paletteMaterial 必须最近邻');
assert.equal(fallbackMaterial.map.minFilter, THREE.NearestFilter, 'paletteMaterial 必须最近邻');
fallbackMaterial.dispose(); fallbackMaterial.map.dispose();

// ── 汇总 ─────────────────────────────────────────────────────────────
report.pass = true;
report.glb = { bytes: glbBytes.length, sha256: sha256(glbBytes), meshes: meshTriangles, totalTriangles };
report.palette = { width: palette.width, height: palette.height, count: manifest.palette.colors.length, nearest: true, sha256: sha256(paletteBytes) };
report.rig = { joints: jointNames.length, baseJoints: 16, addOnBones: 22 };
report.animations = animationSummary;
report.manifest = { schema: manifest.schema, sourceZip: manifest.source.zip, sourceZipSha256: manifest.source.zipSha256 };
report.portrait = { width: portrait.width, height: portrait.height, sha256: sha256(fs.readFileSync(portraitPath)) };
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log('\nT2 busanzi structural acceptance passed.');
