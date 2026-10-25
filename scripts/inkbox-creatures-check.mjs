// 山海异兽资产结构验收 · 纯 Node（不启浏览器）
//
// 直接读 GLB 二进制与 manifest，核对：
//   · 13 个 GLB 齐全、单材质 / 单贴图 / 16×1 调色板 PNG；
//   · 节点结构（species → root → body + 部件）、8 套同名同序 LINEAR 动画、
//     通道数 = (root + 部件) × T/R/S、四元数单位化；
//   · 三角形数 / 包围盒 / 脚底 y 与 manifest 一致（实测，不抄作者自报）；
//   · CreatureLibrary 合并静态几何、共享材质、worldTrial 物种顺序；
//   · CreatureBatch 每物种 InstancedMesh、容量溢出、拾取映射、dispose；
//   · EntityLayer 世界接线：稳定物种哈希、LOD0 真模型 / LOD1-2 旧占位 /
//     LOD off 真模型、Region 过滤、库缺失回退、世界只读；
//   · 视觉变体不抽模拟 RNG（源码里不出现 Math.random）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  CREATURE_CLIPS, DEFAULT_WORLD_TRIAL_IDS, CreatureLibrary, mergeCreatureRestGeometry,
} from '../src/inkbox/render3d/creatures/CreatureLibrary.js';
import { CreatureBatch } from '../src/inkbox/render3d/creatures/CreatureBatch.js';
import {
  creatureFacingFor, creatureSpeciesFor, stableCreatureHash,
} from '../src/inkbox/render3d/creatures/creatureSpecies.js';
import { EntityLayer } from '../src/inkbox/render3d/entities/EntityLayer.js';
import { creatureFormOf } from '../src/inkbox/core/wanlingCatalog.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/creatures');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/creature_manifest.json'), 'utf8'));
const report = { generatedAt: new Date().toISOString(), pass: false, creatures: {}, checks: 0, warnings: [] };
let checks = 0;
function check(condition, message) {
  checks += 1;
  assert(condition, message);
}
function finite(value) { return Number.isFinite(value); }
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

// ── 1. manifest 结构 ─────────────────────────────────────────────────────
check(manifest.schema === 'creature-library-v1', 'manifest schema');
check(Array.isArray(manifest.worldTrial) && manifest.worldTrial.length === 4, 'manifest worldTrial has 4 species');
check(JSON.stringify(manifest.worldTrial) === JSON.stringify([...DEFAULT_WORLD_TRIAL_IDS]), 'manifest worldTrial order matches loader default');
check(JSON.stringify(manifest.clips) === JSON.stringify([...CREATURE_CLIPS]), 'manifest clips are the 8 canonical clips');
const entries = manifest.creatures;
check(Array.isArray(entries) && entries.length === 13, 'manifest lists 13 creatures');
check(new Set(entries.map(entry => entry.id)).size === 13, 'manifest ids are unique');
for (const entry of entries) {
  check(/^[a-z][a-z0-9_-]*$/.test(entry.id), `stable id ${entry.id}`);
  check(entry.file === `mesh/creature-${entry.id}.glb`, `${entry.id}: manifest file path`);
  check(typeof entry.name_zh === 'string' && entry.name_zh.length > 0, `${entry.id}: Chinese name`);
  check(typeof entry.source === 'string' && entry.source.includes('《'), `${entry.id}: classical source`);
  check(Array.isArray(entry.size) && entry.size.length === 3 && entry.size.every(finite), `${entry.id}: size vec3`);
  check(finite(entry.height) && finite(entry.triangles) && finite(entry.feet_y), `${entry.id}: measured metadata`);
  check(Array.isArray(entry.nodes) && entry.nodes.length === entry.parts, `${entry.id}: node list`);
  check(JSON.stringify(entry.clips) === JSON.stringify([...CREATURE_CLIPS]), `${entry.id}: 8 clips`);
  check(entry.worldTrial === manifest.worldTrial.includes(entry.id), `${entry.id}: worldTrial flag`);
  check(fs.existsSync(path.join(root, entry.file)), `${entry.id}: GLB exists`);
  check(entry.sha256 === sha256(path.join(root, entry.file)), `${entry.id}: GLB sha256 matches manifest`);
}
for (const id of manifest.worldTrial) check(entries.some(entry => entry.id === id), `worldTrial species ${id} exists`);
const meshFiles = fs.readdirSync(path.join(root, 'mesh')).filter(file => file.endsWith('.glb')).sort();
check(meshFiles.length === 13, `13 GLB files (found ${meshFiles.length})`);
check(meshFiles.every(file => entries.some(entry => path.basename(entry.file) === file)), 'mesh dir has no unknown GLBs');

// ── 2. 调色板 PNG ────────────────────────────────────────────────────────
const palettePath = path.join(root, manifest.palette.file);
const palette = fs.readFileSync(palettePath);
check(palette.toString('ascii', 1, 4) === 'PNG', 'palette is a PNG');
check(palette.readUInt32BE(16) === 16 && palette.readUInt32BE(20) === 1, 'palette is 16×1 pixels');
check(palette[24] === 8 && palette[25] === 6, 'palette RGBA8');
check(manifest.palette.count === 16 && manifest.palette.colors.length === 16, 'manifest lists 16 palette colours');
check(manifest.palette.uv_rule.includes('(index+0.5)/16'), 'palette UV rule documented');
const paletteSha = crypto.createHash('sha256').update(palette).digest('hex').toUpperCase();
check(paletteSha === manifest.palette.sha256, 'palette sha256 matches manifest (external PNG == embedded image)');

// ── 3. GLB 结构 ──────────────────────────────────────────────────────────
const COMPONENT = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const ARRAY = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const TYPE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function parseGlb(binary, file) {
  check(binary.toString('ascii', 0, 4) === 'glTF', `${file}: magic`);
  check(binary.readUInt32LE(4) === 2, `${file}: version 2`);
  check(binary.readUInt32LE(8) === binary.length, `${file}: declared length`);
  const jsonLength = binary.readUInt32LE(12);
  check(binary.readUInt32LE(16) === 0x4e4f534a, `${file}: JSON chunk`);
  const gltf = JSON.parse(binary.toString('utf8', 20, 20 + jsonLength));
  const binHeader = 20 + jsonLength;
  const binLength = binary.readUInt32LE(binHeader);
  check(binary.readUInt32LE(binHeader + 4) === 0x004e4942, `${file}: BIN chunk`);
  const bin = binary.subarray(binHeader + 8, binHeader + 8 + binLength);
  return { gltf, bin };
}

function accessorData(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const Type = ARRAY[accessor.componentType];
  const size = COMPONENT[accessor.componentType];
  const count = TYPE[accessor.type];
  const byteOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = view.byteStride || size * count;
  const out = new Float64Array(accessor.count * count);
  const view8 = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  for (let i = 0; i < accessor.count; i += 1) {
    for (let c = 0; c < count; c += 1) {
      const at = byteOffset + i * stride + c * size;
      switch (accessor.componentType) {
        case 5126: out[i * count + c] = view8.getFloat32(at, true); break;
        case 5125: out[i * count + c] = view8.getUint32(at, true); break;
        case 5123: out[i * count + c] = view8.getUint16(at, true); break;
        case 5122: out[i * count + c] = view8.getInt16(at, true); break;
        case 5121: out[i * count + c] = view8.getUint8(at); break;
        case 5120: out[i * count + c] = view8.getInt8(at); break;
        default: throw new Error(`Unknown componentType ${accessor.componentType}`);
      }
    }
  }
  return out;
}

function trsMatrix(node) {
  const t = node.translation || [0, 0, 0];
  const r = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(t[0], t[1], t[2]),
    new THREE.Quaternion(r[0], r[1], r[2], r[3]),
    new THREE.Vector3(s[0], s[1], s[2]));
  return matrix;
}

const quatOk = (q, eps = 1e-4) => Math.abs(Math.hypot(q[0], q[1], q[2], q[3]) - 1) <= eps;

for (const info of entries) {
  const file = info.file;
  const binary = fs.readFileSync(path.join(root, file));
  const { gltf, bin } = parseGlb(binary, file);
  const measured = { file, bytes: binary.length, nodes: gltf.nodes.length, animations: [] };
  check(gltf.asset?.version === '2.0', `${info.id}: glTF 2.0`);
  check(gltf.buffers.length === 1 && gltf.buffers[0].uri === undefined, `${info.id}: self-contained GLB`);
  check(gltf.skins === undefined, `${info.id}: rigid parts, no skin`);
  check(gltf.materials.length === 1, `${info.id}: one material`);
  check(gltf.textures.length === 1 && gltf.images.length === 1, `${info.id}: one texture / image`);
  check(gltf.materials[0].doubleSided === true, `${info.id}: doubleSided material`);
  check(gltf.materials[0].pbrMetallicRoughness?.baseColorTexture?.index === 0, `${info.id}: palette base colour texture`);
  check(gltf.materials[0].pbrMetallicRoughness?.metallicFactor === 0, `${info.id}: unlit-ish flat palette`);
  const image = gltf.images[0];
  check(image.mimeType === 'image/png', `${info.id}: embedded PNG palette`);
  const imageView = gltf.bufferViews[image.bufferView];
  const imageBytes = bin.subarray(imageView.byteOffset || 0, (imageView.byteOffset || 0) + imageView.byteLength);
  check(crypto.createHash('sha256').update(imageBytes).digest('hex').toUpperCase() === paletteSha,
    `${info.id}: embedded palette equals materials/creature_palette.png`);

  // 节点结构
  const names = gltf.nodes.map(node => node.name);
  check(gltf.scenes.length === 1 && JSON.stringify(gltf.scenes[0].nodes) === '[0]', `${info.id}: single scene root`);
  check(names[0] === info.id && names[1] === 'root', `${info.id}: species → root`);
  check(names.includes('body'), `${info.id}: body node`);
  const meshNodes = gltf.nodes.filter(node => node.mesh !== undefined);
  check(meshNodes.length === info.parts, `${info.id}: mesh part count ${meshNodes.length} == manifest ${info.parts}`);
  check(JSON.stringify([...new Set(names.slice(2))].sort()) === JSON.stringify([...info.nodes].sort()),
    `${info.id}: node names match manifest`);
  const parentOf = new Map();
  for (let i = 0; i < gltf.nodes.length; i += 1) for (const child of gltf.nodes[i].children || []) {
    check(!parentOf.has(child), `${info.id}: node ${child} has one parent`);
    parentOf.set(child, i);
  }
  const chain = new Set();
  for (const node of meshNodes) {
    let cursor = gltf.nodes.indexOf(node);
    while (cursor !== undefined) { chain.add(cursor); cursor = parentOf.get(cursor); }
  }
  check(chain.has(0), `${info.id}: parts reachable from species root`);

  // 三角形 / 面数 / 包围盒 / 脚底
  let triangles = 0, minY = Infinity;
  const worldOf = index => {
    const cursor = [];
    for (let at = index; at !== undefined; at = parentOf.get(at)) cursor.unshift(at);
    const matrix = new THREE.Matrix4();
    for (const at of cursor) matrix.multiply(trsMatrix(gltf.nodes[at]));
    return matrix;
  };
  for (const node of meshNodes) {
    const mesh = gltf.meshes[node.mesh];
    check(mesh.primitives.length === 1, `${info.id}: one primitive per part`);
    const primitive = mesh.primitives[0];
    check(primitive.material === 0, `${info.id}: part uses shared material`);
    check((primitive.mode ?? 4) === 4, `${info.id}: triangles`);
    check(primitive.indices !== undefined, `${info.id}: indexed part`);
    check(['POSITION', 'NORMAL', 'TEXCOORD_0'].every(name => primitive.attributes[name] !== undefined),
      `${info.id}: POSITION / NORMAL / TEXCOORD_0`);
    const indexCount = gltf.accessors[primitive.indices].count;
    check(indexCount % 3 === 0, `${info.id}: whole triangles`);
    triangles += indexCount / 3;
    const indices = accessorData(gltf, bin, primitive.indices);
    const positions = accessorData(gltf, bin, primitive.attributes.POSITION);
    const vertexCount = positions.length / 3;
    check(indices.every(index => Number.isInteger(index) && index >= 0 && index < vertexCount), `${info.id}: index range`);
    check(positions.every(finite), `${info.id}: finite positions`);
    const matrix = worldOf(gltf.nodes.indexOf(node));
    const point = new THREE.Vector3();
    for (let i = 0; i < positions.length; i += 3) {
      point.set(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(matrix);
      if (point.y < minY) minY = point.y;
    }
    const normals = accessorData(gltf, bin, primitive.attributes.NORMAL);
    let normalsOk = normals.length === positions.length;
    for (let i = 0; normalsOk && i < normals.length; i += 3) {
      normalsOk = Math.abs(Math.hypot(normals[i], normals[i + 1], normals[i + 2]) - 1) <= 1e-3;
    }
    check(normalsOk, `${info.id}: unit normals`);
    const uvs = accessorData(gltf, bin, primitive.attributes.TEXCOORD_0);
    check(uvs.length === vertexCount * 2, `${info.id}: uv count`);
    let uvOk = true;
    for (let i = 0; uvOk && i < uvs.length; i += 2) {
      const cell = uvs[i] * 16 - 0.5;
      uvOk = Math.abs(cell - Math.round(cell)) <= 1e-3 && cell >= -0.5 && cell < 15.5
        && Math.abs(uvs[i + 1] - 0.5) <= 1e-3;
    }
    check(uvOk, `${info.id}: palette UV at 16 cell centres`);
  }
  check(triangles === info.triangles, `${info.id}: measured triangles ${triangles} == manifest ${info.triangles}`);
  check(Math.abs(minY - info.feet_y) <= 0.03, `${info.id}: measured feet y ${minY.toFixed(3)} == manifest ${info.feet_y}`);
  measured.triangles = triangles;
  measured.feetY = Number(minY.toFixed(4));

  // 动画
  const animations = gltf.animations || [];
  check(animations.length === 8, `${info.id}: 8 animation clips`);
  check(JSON.stringify(animations.map(clip => clip.name)) === JSON.stringify([...CREATURE_CLIPS]), `${info.id}: clip names and order`);
  const channelsPerClip = (gltf.nodes.length - 1) * 3;
  for (const clip of animations) {
    check(clip.channels.length === channelsPerClip, `${info.id}/${clip.name}: ${clip.channels.length} channels == ${channelsPerClip}`);
    const targets = new Set();
    for (const channel of clip.channels) {
      targets.add(channel.target.node);
      check(channel.target.path === 'translation' || channel.target.path === 'rotation' || channel.target.path === 'scale',
        `${info.id}/${clip.name}: TRS channel`);
      const sampler = clip.samplers[channel.sampler];
      check((sampler.interpolation ?? 'LINEAR') === 'LINEAR', `${info.id}/${clip.name}: LINEAR`);
      check(gltf.accessors[sampler.input].count >= 1, `${info.id}/${clip.name}: keyframes`);
      if (channel.target.path === 'rotation') {
        const values = accessorData(gltf, bin, sampler.output);
        for (let i = 0; i < values.length; i += 4) check(quatOk(values.subarray(i, i + 4)), `${info.id}/${clip.name}: unit quaternion`);
      }
    }
    check(targets.size === gltf.nodes.length - 1, `${info.id}/${clip.name}: animates root + every part`);
    check(!targets.has(0), `${info.id}/${clip.name}: species group itself is not animated`);
  }
  measured.animations = animations.map(clip => ({ name: clip.name, channels: clip.channels.length }));
  report.creatures[info.id] = measured;
}
check(report.creatures && Object.keys(report.creatures).length === 13, 'all 13 GLBs structurally verified');

// ── 4. 合并静态几何（用 raw GLB 读回：单几何 = 所有部件三角形之和）───────
{
  const info = entries.find(entry => entry.id === 'kaiming');
  const binary = fs.readFileSync(path.join(root, info.file));
  const { gltf } = parseGlb(binary, info.file);
  const library = new CreatureLibrary({
    entries: [{ id: info.id, info, gltf: { scene: buildRealScene(gltf, info), animations: [] } }],
    material: new THREE.MeshLambertMaterial({ name: 'synthetic' }),
  });
  const species = library.species.get(info.id);
  check(species.triangles === info.triangles, 'merged Kaiming geometry keeps measured triangles');
  check(species.geometry.getAttribute('position').count === info.triangles * 3, 'merged geometry is one position buffer');
  check(Math.abs(species.geometry.boundingBox.min.y - info.feet_y) <= 0.03, 'merged geometry keeps feet at y=0');
  check(library.material.name === 'synthetic', 'injected shared material is reused');
  library.dispose(); library.dispose();
}

// 用 raw GLB 节点/几何搭一个最小 three 场景（不依赖 GLTFLoader/图片解码）。
function buildRealScene(gltf, info) {
  const scene = new THREE.Group();
  const byIndex = gltf.nodes.map(node => {
    const object = node.mesh !== undefined ? new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshLambertMaterial()) : new THREE.Object3D();
    object.name = node.name;
    const t = node.translation || [0, 0, 0];
    object.position.set(t[0], t[1], t[2]);
    return object;
  });
  for (const [index, node] of gltf.nodes.entries()) {
    byIndex[index].name = node.name;
    for (const child of node.children || []) byIndex[index].add(byIndex[child]);
  }
  // 用真实 POSITION 数据替换 box，保证合并后的面数与 manifest 一致。
  let cursor = 0;
  for (const [index, node] of gltf.nodes.entries()) {
    if (node.mesh === undefined) continue;
    const primitive = gltf.meshes[node.mesh].primitives[0];
    const binary = fs.readFileSync(path.join(root, info.file));
    const { bin } = parseGlb(binary, info.file);
    const positions = accessorData(gltf, bin, primitive.attributes.POSITION);
    const indices = accessorData(gltf, bin, primitive.indices);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(Array.from(indices));
    byIndex[index].geometry.dispose();
    byIndex[index].geometry = geometry;
    cursor += 1;
  }
  scene.add(byIndex[0]);
  return scene;
}

// ── 5. CreatureLibrary / CreatureBatch 运行时契约（合成场景，无浏览器）────
const syntheticMaterial = new THREE.MeshLambertMaterial({ name: 'creature_synthetic_shared' });
function syntheticEntry(info) {
  const scene = new THREE.Group();
  scene.name = 'Scene';
  const group = new THREE.Group(); group.name = info.id; scene.add(group);
  const rootNode = new THREE.Group(); rootNode.name = 'root'; group.add(rootNode);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, info.height, 0.4), syntheticMaterial);
  body.name = 'body'; body.position.y = info.height / 2; rootNode.add(body);
  for (let i = 1; i < info.parts; i += 1) {
    const part = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), syntheticMaterial);
    part.name = i % 2 ? `leg-${i}` : `tail-${i}`;
    part.position.set(0.2, 0.1, 0.25 * i);
    (i % 2 ? rootNode : body).add(part);
  }
  return { id: info.id, info, gltf: { scene, animations: [] } };
}
const syntheticLibrary = new CreatureLibrary({
  entries: entries.map(syntheticEntry), material: syntheticMaterial,
});
check(syntheticLibrary.size === 13, 'CreatureLibrary merges all 13 synthetic species');
check(syntheticLibrary.material === syntheticMaterial, 'CreatureLibrary shares one material');
check(JSON.stringify(syntheticLibrary.worldSpecies) === JSON.stringify([...DEFAULT_WORLD_TRIAL_IDS]),
  'world trial species default to the 4 documented animals');
for (const info of entries) {
  const species = syntheticLibrary.species.get(info.id);
  check(species.geometry.getAttribute('position').count > 0, `${info.id}: synthetic merged geometry`);
  check(species.clips.length === 0, `${info.id}: synthetic entry keeps clips metadata`);
}
const batch = new CreatureBatch(syntheticLibrary, { capacity: 3 });
const tiangouTriangles = syntheticLibrary.species.get(DEFAULT_WORLD_TRIAL_IDS[0]).triangles;
const writes = [];
for (let i = 0; i < 5; i += 1) writes.push({
  species: DEFAULT_WORLD_TRIAL_IDS[0], x: i * 2, y: 1, z: -i, rotationY: i * 0.2, source: { id: 100 + i },
});
const batchStats = batch.write(writes);
check(batchStats.instances === 3 && batchStats.creatures === 3 && batchStats.overflow === 2,
  'CreatureBatch capacity overflow is reported');
check(batchStats.drawCalls === 1 && batchStats.triangles === 3 * tiangouTriangles, 'CreatureBatch per-species draw call and triangles');
check(batch.group.children.every(mesh => mesh.userData.renderEntities.length === mesh.count), 'CreatureBatch pick map matches instance count');
const tiangouMesh = batch.meshes.get(DEFAULT_WORLD_TRIAL_IDS[0]);
for (const [index, entity] of tiangouMesh.userData.renderEntities.entries()) {
  check(entity.id === 100 + index, 'CreatureBatch pick map keeps source identity and order');
  const matrix = new THREE.Matrix4(); tiangouMesh.getMatrixAt(index, matrix);
  const position = new THREE.Vector3().setFromMatrixPosition(matrix);
  check(position.x === index * 2 && position.y === 1 && position.z === -index, 'CreatureBatch instance placement');
}
const twoSpecies = batch.write([
  { species: DEFAULT_WORLD_TRIAL_IDS[0], x: 0, y: 0, z: 0, source: { id: 1 } },
  { species: DEFAULT_WORLD_TRIAL_IDS[1], x: 1, y: 0, z: 0, source: { id: 2 } },
]);
check(twoSpecies.drawCalls === 2 && twoSpecies.instances === 2 && twoSpecies.overflow === 0, 'CreatureBatch one InstancedMesh per species');
check(batch.write([]).instances === 0 && batch.group.children.every(mesh => !mesh.visible), 'CreatureBatch clear hides meshes');
batch.dispose(); batch.dispose();
check(syntheticLibrary.species.size === 13, 'CreatureBatch dispose never disposes library geometry');
syntheticLibrary.dispose();

// ── 6. 稳定物种哈希 ──────────────────────────────────────────────────────
check(stableCreatureHash(7, 42) === stableCreatureHash(7, 42), 'stable hash is deterministic');
check(stableCreatureHash(7, 42) !== stableCreatureHash(8, 42), 'stable hash uses seed');
check(stableCreatureHash(7, 42) !== stableCreatureHash(7, 43), 'stable hash uses entity id');
const speciesCounts = {};
for (let id = 1; id <= 400; id += 1) {
  const species = creatureSpeciesFor(20261017, id, [...DEFAULT_WORLD_TRIAL_IDS]);
  check(DEFAULT_WORLD_TRIAL_IDS.includes(species), 'species comes from world trial list');
  speciesCounts[species] = (speciesCounts[species] || 0) + 1;
}
check(Object.keys(speciesCounts).length === 4, 'hash distributes across all 4 world trial species');
const facingA = creatureFacingFor(20261017, 77);
check(facingA === creatureFacingFor(20261017, 77) && facingA >= 0 && facingA < Math.PI * 2, 'facing is a stable angle');

// ── 7. EntityLayer 世界接线（LOD0 / LOD off / Region / 回退 / 世界只读）─────
const world = {
  w: 24, h: 18, seed: 20261017,
  entities: [
    { id: 1, sp: 'beast', form: 'jingwei', level: 0, x: 4.5, y: 5.5, lift: 0, color: '#6b6152' },
    { id: 2, sp: 'beast', level: 0, x: 5.5, y: 5.5, lift: 0, color: '#6b6152' },
    { id: 3, sp: 'beast', level: 0, x: 6.5, y: 5.5, lift: 0, color: '#6b6152' },
    { id: 4, sp: 'beast', level: 0, x: 7.5, y: 6.5, lift: 0, color: '#6b6152' },
    { id: 5, sp: 'beast', level: 0, x: 8.5, y: 6.5, lift: 0, color: '#6b6152' },
    { id: 6, sp: 'beast', level: 0, x: 9.5, y: 7.5, lift: 0, color: '#6b6152' },
    { id: 7, sp: 'beast', level: 0, x: 10.5, y: 7.5, lift: 0, color: '#6b6152' },
    { id: 8, sp: 'beast', level: 0, x: 11.5, y: 8.5, lift: 0, color: '#6b6152' },
    { id: 9, sp: 'beast', level: 0, x: 12.5, y: 8.5, lift: 0, color: '#6b6152' },
    { id: 10, sp: 'beast', level: 0, x: 13.5, y: 9.5, lift: 0, color: '#6b6152' },
    { id: 11, sp: 'beast', level: 0, x: 14.5, y: 9.5, lift: 0, color: '#6b6152' },
    { id: 12, sp: 'beast', level: 0, x: 15.5, y: 10.5, lift: 0, color: '#6b6152' },
  ],
};
const worldBefore = JSON.stringify(world);
const coordinates = createCoordinates(world);
const elevation = { at: () => 1.25 };
const worldLayerMaterial = new THREE.MeshLambertMaterial({ name: 'world_layer_shared' });
const worldLibrary = new CreatureLibrary({ entries: entries.map(syntheticEntry), material: worldLayerMaterial });
const layer = new EntityLayer(world, coordinates, elevation, { creatureLibrary: worldLibrary });
layer.update(1, world, { heightChanged: true });
check(layer.creatureBatch, 'EntityLayer builds a creature batch when the library is present');
check(layer.stats.byClass.beast === 12 && layer.stats.creatures === 12, 'LOD-off path draws every visible beast with real models');
check(layer.stats.instances === 12, 'placeholder beast instances are replaced by real models');
check(layer.placeholderMeshes.beast.count === 0 && layer.placeholderMeshes.beast.parent === layer.group,
  'fallback beast batch stays attached but submits no draw while all forms are loaded');
const speciesOf = {};
for (const mesh of layer.creatureBatch.group.children) {
  speciesOf[mesh.userData.species] = mesh.count;
  for (const [index, entity] of mesh.userData.renderEntities.entries()) {
    check(entity.id != null && entity.identityContainer === 'entities', 'creature pick map keeps source identity');
    const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    check(Math.abs(position.y - 1.25) < 1e-6, 'creature y = elevation.at + lift');
    const expected = creatureFormOf(world, entity);
    check(mesh.userData.species === expected, 'explicit form wins, legacy beast uses fixed four-form hash');
    if (entity.id === 1) check(mesh.userData.species === 'jingwei', 'explicit nontrial form is rendered');
    else check(expected === creatureSpeciesFor(world.seed, entity.id, [...DEFAULT_WORLD_TRIAL_IDS]),
      'legacy beast preserves the original four-form order and hash');
  }
}
check(Object.values(speciesOf).filter(count => count > 0).length >= 3, 'at least 3 form batches appear in the world');
check(layer.stats.triangles >= 12 * 12, 'submitted triangles include real creature geometry');
check(JSON.stringify(world) === worldBefore, 'EntityLayer creature presentation is read-only for the world');
const layerSnapshot = JSON.stringify(layer.stats);
layer.update(1, world);
check(JSON.stringify(layer.stats) === layerSnapshot, 'unchanged world does not rewrite creature instances');

// LOD：LOD0/LOD1 都用真实模型（默认镜头约 8–15px 落在 LOD1，玩家正常镜头要能看到
// 不同造型）；只有 LOD2（≤7px 剪影级）保留旧简化占位。
layer.setArtProfile({ paperColor: '#f5f2ea', silhouetteInkStrength: 0.3, distanceFade: 0.5 });
layer.setLODEnabled(true);
layer.setArtView({ pixelsPerUnit: 100, verticalPixelsPerUnit: 100 });
layer.write(layer.lastDerived);
check(layer.stats.creatures === 12 && layer.stats.lod[0] === 12, 'LOD0 (zoomed in) uses real creature models');
layer.setArtView({ pixelsPerUnit: 4, verticalPixelsPerUnit: 4 });
layer.write(layer.lastDerived);
check(layer.stats.creatures === 12 && layer.stats.lod[1] === 12,
  'LOD1 (default in-game camera) also uses real creature models');
layer.setArtView({ pixelsPerUnit: 0.5, verticalPixelsPerUnit: 0.5 });
layer.write(layer.lastDerived);
check(layer.stats.creatures === 0 && layer.stats.lod[2] === 12,
  'LOD2 silhouette keeps the legacy simplified beast placeholders');
check(layer.stats.instances === 12, 'LOD demotion never drops an entity');

// Region 过滤
layer.setLODEnabled(false);
layer.setArtProfile(null);
layer.setRegionGeometry({ allInside: false, isInsideCell: x => x < 8 });
layer.update(1, world, { heightChanged: true });
check(layer.stats.creatures === 4, `Region mask filters creature models through visibleList (got ${layer.stats.creatures})`);
layer.setRegionGeometry(null);

// Incremental library: a loaded explicit form stays a GLB instance; an unavailable
// form remains visible and pickable in the bounded fallback batch.
const partialMaterial = new THREE.MeshLambertMaterial({ name: 'partial_world_shared' });
const partialLibrary = new CreatureLibrary({ entries: entries.filter(info =>
  [...DEFAULT_WORLD_TRIAL_IDS, 'jingwei'].includes(info.id)).map(syntheticEntry), material: partialMaterial });
world.entities[1].form = 'chiru';
layer.setCreatureLibrary(partialLibrary);
layer.update(1, world, { heightChanged: true });
check(layer.stats.creatures === 11, 'loaded forms remain GLB instances');
check(layer.placeholderMeshes.beast.count === 1 && layer.placeholderMeshes.beast.visible,
  'unloaded or failed form keeps visible fallback');
check(layer.placeholderMeshes.beast.userData.renderEntities[0].id === 2
  && layer.placeholderMeshes.beast.userData.renderEntities[0].identityContainer === 'entities',
  'fallback pick maps to original identity');
check([...layer.creatureBatch.meshes.values()].some(mesh =>
  mesh.userData.species === 'jingwei' && mesh.userData.renderEntities.some(entity => entity.id === 1)),
  'loaded explicit jingwei uses its own GLB batch');

// 回退：卸下库 ⇒ 完全回到旧占位几何
layer.setCreatureLibrary(null);
layer.update(1, world, { heightChanged: true });
check(layer.creatureBatch === null, 'removing the creature library drops the batch');
check(layer.stats.creatures === 0, 'without library there are no creature instances');
check(layer.placeholderMeshes.beast.count === 12 && layer.placeholderMeshes.beast.visible, 'legacy beast placeholder returns');
check(layer.stats.instances === 12, 'fallback keeps every beast visible');
layer.dispose();
check(worldLibrary.species.size === 13, 'EntityLayer dispose never disposes the shared library');
worldLibrary.dispose();
partialLibrary.dispose();

// ── 8. 视觉变体不得抽模拟 RNG ────────────────────────────────────────────
const noRngFiles = [
  'src/inkbox/render3d/creatures/creatureSpecies.js',
  'src/inkbox/render3d/creatures/CreatureLibrary.js',
  'src/inkbox/render3d/creatures/CreatureBatch.js',
  'src/inkbox/render3d/entities/deriveEntities.js',
];
for (const relative of noRngFiles) {
  const source = fs.readFileSync(path.resolve(root, '../..', relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  check(!/Math\s*\.\s*random\s*\(/.test(source), `${relative} must not use Math.random`);
}

report.checks = checks;
report.pass = true;
report.palette = { file: manifest.palette.file, sha256: paletteSha, colours: manifest.palette.colors.map(color => color.hex) };
report.worldTrial = [...manifest.worldTrial];
report.summary = {
  species: entries.length,
  clips: [...CREATURE_CLIPS],
  totalTriangles: entries.reduce((sum, entry) => sum + entry.triangles, 0),
  smallest: entries.reduce((a, b) => (a.height <= b.height ? a : b)).id,
  largest: entries.reduce((a, b) => (a.height >= b.height ? a : b)).id,
};
fs.writeFileSync(path.join(root, 'data/structure_validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ pass: report.pass, checks, worldTrial: report.worldTrial, summary: report.summary }, null, 2));
