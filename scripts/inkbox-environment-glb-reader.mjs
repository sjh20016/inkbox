// CPU acceptance reads the shipped bytes; it never substitutes test geometry.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { EnvironmentAssetLibrary } from '../src/inkbox/render3d/environment/EnvironmentAssetLibrary.js';

const TYPES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const COMPONENTS = { 5123: [Uint16Array, 2, 'readUInt16LE'], 5125: [Uint32Array, 4, 'readUInt32LE'], 5126: [Float32Array, 4, 'readFloatLE'] };
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) { c ^= byte; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
function decodePNG(bytes) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Invalid environment atlas PNG');
  const compressed = []; let width, height, ended = false;
  for (let at = 8; at < bytes.length;) {
    if (at + 12 > bytes.length) throw new Error('Truncated PNG chunk');
    const size = bytes.readUInt32BE(at), end = at + 12 + size;
    if (end > bytes.length) throw new Error('PNG chunk exceeds file');
    const type = bytes.toString('ascii', at + 4, at + 8), data = bytes.subarray(at + 8, at + 8 + size);
    if (crc32(bytes.subarray(at + 4, at + 8 + size)) !== bytes.readUInt32BE(at + 8 + size)) throw new Error('PNG CRC mismatch');
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data.length !== 13 || data[8] !== 8 || data[9] !== 6 || data[10] || data[11] || data[12]) throw new Error('CPU reader requires noninterlaced RGBA8 PNG');
      if (!width || !height || width * height > 1048576) throw new Error('Unexpected atlas dimensions');
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') { ended = true; if (end !== bytes.length) throw new Error('Trailing PNG data'); }
    at = end;
  }
  if (!ended || !width || !compressed.length) throw new Error('PNG is missing required chunks');
  const rowBytes = width * 4, raw = zlib.inflateSync(Buffer.concat(compressed), { maxOutputLength: (rowBytes + 1) * height });
  if (raw.length !== (rowBytes + 1) * height) throw new Error('PNG pixel length mismatch');
  const pixels = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const offset = y * (rowBytes + 1);
    if (raw[offset] !== 0) throw new Error('CPU reader requires atlas builder filter 0');
    pixels.set(raw.subarray(offset + 1, offset + rowBytes + 1), y * rowBytes);
  }
  return { data: pixels, width, height };
}

export function decodeEnvironmentGLTF(root) {
  const env = path.resolve(root, 'assets/environment');
  const manifest = JSON.parse(fs.readFileSync(path.join(env, 'data/environment_manifest.json'), 'utf8'));
  const paletteSlots = JSON.parse(fs.readFileSync(path.join(env, manifest.paletteSlots), 'utf8'));
  const glbPath = path.join(env, manifest.asset), bytes = fs.readFileSync(glbPath);
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid environment GLB header');
  let json, binary;
  for (let at = 12; at < bytes.length;) {
    if (at + 8 > bytes.length) throw new Error('Truncated GLB chunk');
    const size = bytes.readUInt32LE(at), kind = bytes.readUInt32LE(at + 4), end = at + 8 + size;
    if (size % 4 || end > bytes.length) throw new Error('Invalid GLB chunk size');
    if (kind === 0x4e4f534a) { if (json) throw new Error('Duplicate JSON chunk'); json = JSON.parse(bytes.toString('utf8', at + 8, end)); }
    else if (kind === 0x004e4942) { if (binary) throw new Error('Duplicate BIN chunk'); binary = bytes.subarray(at + 8, end); }
    else throw new Error('Unexpected GLB chunk');
    at = end;
  }
  if (!json || !binary || json.buffers?.length !== 1 || json.buffers[0].uri || json.buffers[0].byteLength > binary.length) throw new Error('Expected a single embedded GLB buffer');
  const accessor = index => {
    const a = json.accessors[index], view = json.bufferViews?.[a?.bufferView], n = TYPES[a?.type], c = COMPONENTS[a?.componentType];
    if (!a || !view || !n || !c || a.sparse || view.buffer !== 0 || !Number.isInteger(a.count) || a.count < 0) throw new Error('Unsupported GLB accessor');
    const [ArrayType, width, read] = c, offset = (view.byteOffset || 0) + (a.byteOffset || 0), stride = view.byteStride || n * width;
    const end = offset + (a.count ? (a.count - 1) * stride + n * width : 0);
    if (stride < n * width || stride % width || offset < (view.byteOffset || 0) || end > (view.byteOffset || 0) + view.byteLength || end > json.buffers[0].byteLength) throw new Error('Accessor exceeds buffer view');
    const array = new ArrayType(a.count * n);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) array[i * n + k] = binary[read](offset + i * stride + k * width);
    return new THREE.BufferAttribute(array, n, !!a.normalized);
  };
  if (json.materials?.length !== 1 || json.images?.length !== 1 || json.textures?.length !== 1) throw new Error('Environment GLB must have one material and atlas');
  const imageURI = json.images[0].uri;
  if (imageURI !== '../materials/EntityAtlas.png') throw new Error('Unexpected external atlas URI');
  const texture = new THREE.DataTexture();
  texture.image = decodePNG(fs.readFileSync(path.resolve(path.dirname(glbPath), imageURI)));
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const scene = new THREE.Group(), active = new Set();
  const visit = nodeIndex => {
    if (active.has(nodeIndex)) throw new Error('Cyclic or duplicated GLB scene node');
    active.add(nodeIndex);
    const node = json.nodes?.[nodeIndex]; if (!node) throw new Error('Missing GLB scene node');
    let object;
    if (node.mesh != null) {
      const mesh = json.meshes?.[node.mesh];
      if (mesh?.primitives?.length !== 1) throw new Error('CPU reader requires one primitive per environment node');
      const primitive = mesh.primitives[0];
      if (primitive.material !== 0 || primitive.mode != null && primitive.mode !== 4 || primitive.targets) throw new Error('Unsupported environment primitive');
      const geometry = new THREE.BufferGeometry();
      for (const [key, name] of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']]) {
        if (primitive.attributes[key] == null) throw new Error(`Missing ${key}`);
        geometry.setAttribute(name, accessor(primitive.attributes[key]));
      }
      if (primitive.indices != null) {
        const index = accessor(primitive.indices);
        for (const value of index.array) if (value >= geometry.attributes.position.count) throw new Error('Invalid triangle index');
        geometry.setIndex(index);
      }
      object = new THREE.Mesh(geometry, material);
    } else object = new THREE.Group();
    object.name = node.name || '';
    if (node.matrix) object.applyMatrix4(new THREE.Matrix4().fromArray(node.matrix));
    else {
      if (node.translation) object.position.fromArray(node.translation);
      if (node.rotation) object.quaternion.fromArray(node.rotation);
      if (node.scale) object.scale.fromArray(node.scale);
    }
    for (const child of node.children || []) object.add(visit(child));
    return object;
  };
  for (const nodeIndex of json.scenes?.[json.scene || 0]?.nodes || []) scene.add(visit(nodeIndex));
  return { gltf: { scene }, manifest, paletteSlots, json, bytes };
}

export function readEnvironmentLibrary(root) {
  const decoded = decodeEnvironmentGLTF(root);
  return new EnvironmentAssetLibrary(decoded.gltf, decoded.manifest, decoded.paletteSlots);
}
