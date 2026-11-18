import * as THREE from 'three';
import { makeCanvas } from './canvas.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hashString } from '../../core/noise.js';
import { TERRAIN_INFO } from '../../core/config.js';
import { decorationFootprintOwned } from '../environment/RealmDecorationLayer.js';

/**
 * V1 · 山海入画 — 纯装饰景观层（Scenery）。
 *
 * ⚠️ 纯表现：无身份、无拾取（raycast = noop，且不在 PlanePicker 收集名单内）、
 *    无碰撞 / 通行影响、无模拟时钟、不进存档。布局只由 seed + 创建时地形推导，
 *    之后仅随高度贴地、随视界 Region 裁切、在聚落/建筑靠近时自动让位。
 * 与可交互对象的区分：装饰物不响应悬停 / 检视，统一使用「画中物」配色
 * （不带势力色、不带选择环），`?scenery=off` 或工具栏「画中景」可整体关闭。
 */
const C = (hex) => new THREE.Color(hex);
const PALETTES = Object.freeze({
  mortal: { wall: '#F2EDE0', roof: '#56626B', wood: '#7A6450', red: '#B64A3B', stone: '#B3AE9F', dark: '#3B3A36', gold: '#C3A25B', boat: '#7B6448', sail: '#E9E1CC', pine: '#4E7A63' },
  upper: { wall: '#F0EDE1', roof: '#4E6E78', wood: '#996547', red: '#B73F32', stone: '#C9C3B0', dark: '#305566', gold: '#D5B65A', jade: '#5C8D6B', cloud: '#FBF8EF', paleGold: '#D9C99A', rock: '#7E8F8A' },
  nether: { wall: '#D9D3C5', roof: '#141312', wood: '#1D1C1A', red: '#B23A2E', stone: '#A9A397', dark: '#121110', bone: '#E6E0D2', soul: '#C6463A' },
});

function part(list, geometry, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
  const c = C(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(key)) g.deleteAttribute(key);
  list.push(g);
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
// A flared hip roof: pyramid whose eaves curl outward (飞檐) by lifting the corners.
function roof(w, h, flare = 0.35) {
  const g = new THREE.ConeGeometry(w * 0.72, h, 4, 2, false); g.rotateY(Math.PI / 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i); if (y > -h / 2 + 1e-3) continue;
    const x = p.getX(i), z = p.getZ(i), corner = Math.abs(Math.abs(x) - Math.abs(z)) < w * 0.05 ? 1 : 0;
    p.setX(i, x * (1 + flare * 0.25)); p.setZ(i, z * (1 + flare * 0.25)); p.setY(i, y + corner * h * flare);
  }
  g.computeVertexNormals(); return g;
}

function buildKind(kind, pal) {
  const L = [];
  switch (kind) {
    case 'pavilion': { // 亭
      for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) part(L, cyl(0.09, 0.1, 1.6, 6), pal.red, { x, y: 0.95, z });
      part(L, box(2.2, 0.15, 2.2), pal.stone, { y: 0.08 });
      part(L, roof(2.6, 1.1, 0.4), pal.roof, { y: 2.25 });
      part(L, cyl(0.02, 0.12, 0.5, 6), pal.gold, { y: 3.0 });
      break; }
    case 'pagoda': { // 塔
      part(L, box(2.4, 0.3, 2.4), pal.stone, { y: 0.15 });
      let y = 0.3;
      for (let i = 0; i < 5; i++) {
        const s = 1.7 - i * 0.22, h = 1.05 - i * 0.08;
        part(L, cyl(s * 0.5, s * 0.52, h, 8), pal.wall, { y: y + h / 2 }); y += h;
        part(L, roof(s * 1.55, 0.42, 0.55), pal.roof, { y: y + 0.12 }); y += 0.26;
      }
      part(L, cyl(0.03, 0.09, 1.1, 6), pal.gold, { y: y + 0.5 });
      break; }
    case 'paifang': { // 牌坊
      for (const x of [-1.6, 1.6]) part(L, box(0.28, 2.8, 0.28), pal.red, { x, y: 1.4 });
      for (const x of [-0.55, 0.55]) part(L, box(0.22, 2.4, 0.22), pal.red, { x, y: 1.2 });
      part(L, box(3.8, 0.28, 0.34), pal.roof, { y: 2.5 });
      part(L, box(2.0, 0.42, 0.18), pal.gold, { y: 2.1 });
      part(L, roof(4.4, 0.55, 0.5), pal.roof, { y: 3.0, sz: 0.28 });
      break; }
    case 'bridge': { // 石拱桥，长轴 X，长 1 单位后按实例缩放
      const arch = new THREE.TorusGeometry(0.5, 0.11, 4, 12, Math.PI); arch.scale(1, 0.55, 3.2);
      part(L, arch, pal.stone, { y: 0.0 });
      part(L, box(1.06, 0.06, 0.62), pal.stone, { y: 0.30 });
      for (const z of [-0.33, 0.33]) part(L, box(1.06, 0.12, 0.04), pal.wood, { y: 0.4, z });
      break; }
    case 'boat': { // 小舟
      const hull = new THREE.CylinderGeometry(0.35, 0.18, 2.0, 6, 1, false, 0, Math.PI); hull.rotateZ(Math.PI / 2); hull.rotateX(Math.PI);
      part(L, hull, pal.boat, { y: 0.15 });
      part(L, cyl(0.03, 0.03, 1.2, 4), pal.wood, { y: 0.75 });
      part(L, box(0.04, 0.8, 0.7), pal.sail, { y: 0.85, x: 0.05 });
      break; }
    case 'stele': { // 碑
      part(L, box(0.9, 0.3, 0.5), pal.stone, { y: 0.15 });
      part(L, box(0.6, 1.5, 0.18), pal.dark || pal.stone, { y: 1.0 });
      part(L, box(0.75, 0.16, 0.26), pal.gold || pal.stone, { y: 1.8 });
      break; }
    case 'hall': { // 上界悬殿（含托底浮云台）
      const base = new THREE.ConeGeometry(2.4, 2.6, 7, 1); base.rotateX(Math.PI);
      part(L, base, pal.stone, { y: -1.1 });
      part(L, cyl(2.5, 2.45, 0.35, 10), pal.cloud, { y: 0.18 });
      part(L, box(2.6, 1.2, 1.8), pal.wall, { y: 0.95 });
      for (const x of [-1.15, -0.4, 0.4, 1.15]) part(L, box(0.12, 1.2, 0.12), pal.red, { x, y: 0.95, z: 0.92 });
      part(L, roof(3.4, 1.0, 0.5), pal.roof, { y: 2.0, sz: 0.75 });
      part(L, roof(2.2, 0.7, 0.5), pal.roof, { y: 2.75, sz: 0.75 });
      part(L, cyl(0.03, 0.1, 0.6, 6), pal.gold, { y: 3.3 });
      break; }
    case 'gate': { // 天门
      for (const x of [-1.5, 1.5]) part(L, cyl(0.16, 0.2, 3.4, 8), pal.wall, { x, y: 1.7 });
      part(L, box(4.0, 0.25, 0.4), pal.gold, { y: 3.2 });
      part(L, box(4.6, 0.2, 0.5), pal.roof, { y: 3.55 });
      part(L, box(1.2, 0.5, 0.1), pal.jade, { y: 2.7 });
      break; }
    case 'array': { // 阵纹（地面法阵）
      for (const [r, w] of [[2.6, 0.07], [1.9, 0.05], [1.1, 0.06]]) { const t = new THREE.RingGeometry(r - w, r, 40); t.rotateX(-Math.PI / 2); part(L, t, pal.paleGold, { y: 0.06 }); }
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; part(L, box(0.4, 0.02, 0.06), pal.paleGold, { x: Math.cos(a) * 2.25, z: Math.sin(a) * 2.25, y: 0.07, ry: -a }); }
      part(L, cyl(0.25, 0.3, 0.9, 6), pal.jade, { y: 0.45 });
      break; }
    case 'pillar': { // 断柱
      const g = cyl(0.42, 0.5, 3.2, 7), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 1.5) p.setY(i, p.getY(i) - Math.abs(Math.sin(i * 2.7)) * 1.1);
      g.computeVertexNormals();
      part(L, g, pal.stone, { y: 1.5, rz: 0.12 });
      part(L, box(1.2, 0.3, 1.2), pal.dark, { y: 0.15 });
      break; }
    case 'tombs': { // 碑林（一簇）
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4, r = 0.4 + (i % 3) * 0.8;
        part(L, box(0.45, 1.0 + (i % 3) * 0.35, 0.14), i % 4 === 0 ? pal.bone : pal.stone, { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.5, rz: (i % 2 ? 1 : -1) * 0.18, ry: a });
      }
      break; }
    case 'lamp': { // 魂灯
      part(L, cyl(0.05, 0.07, 1.6, 5), pal.dark, { y: 0.8 });
      part(L, box(0.5, 0.06, 0.06), pal.dark, { y: 1.55 });
      part(L, cyl(0.16, 0.12, 0.34, 6), pal.soul, { y: 1.3, x: 0.22 });
      break; }
    case 'deadtree': { // 枯木
      part(L, cyl(0.06, 0.16, 2.6, 5), pal.wood, { y: 1.3, rz: 0.08 });
      for (const [h, a, l] of [[1.6, 0.7, 1.1], [2.0, -0.8, 0.9], [2.4, 0.5, 0.7], [1.2, -0.4, 0.8]]) part(L, cyl(0.025, 0.06, l, 4), pal.wood, { y: h + l * 0.3, x: Math.sin(a) * l * 0.4, rz: -a, ry: h * 2 });
      break; }
    case 'ruin': { // 残殿
      for (const [x, h] of [[-1.3, 2.2], [1.3, 1.1], [-1.3, 1.6], [1.3, 2.4]]) part(L, box(0.28, h, 0.28), pal.wood, { x, y: h / 2, z: x * (h > 2 ? 0.5 : -0.5) });
      part(L, box(2.9, 0.18, 0.4), pal.roof, { y: 2.2, rz: -0.18, z: -0.6 });
      part(L, box(3.2, 0.25, 2.6), pal.stone, { y: 0.12 });
      break; }
    case 'hermitage': { // 山居：白墙黛瓦小院 + 矮墙 + 双松 + 碑
      part(L, box(3.6, 0.14, 2.8), pal.stone, { y: 0.07 });
      part(L, box(1.7, 0.95, 1.1), pal.wall, { x: -0.5, y: 0.6, z: -0.5 });
      part(L, roof(2.3, 0.62, 0.45), pal.roof, { x: -0.5, y: 1.36, z: -0.5, sz: 0.66 });
      part(L, box(1.0, 0.72, 0.9), pal.wall, { x: 1.05, y: 0.5, z: 0.15, ry: Math.PI / 2 });
      part(L, roof(1.45, 0.48, 0.4), pal.roof, { x: 1.05, y: 1.08, z: 0.15, sx: 0.7, ry: Math.PI / 2 });
      part(L, box(0.06, 0.5, 0.06), pal.red, { x: -0.95, y: 0.4, z: 0.07 }); part(L, box(0.06, 0.5, 0.06), pal.red, { x: -0.05, y: 0.4, z: 0.07 });
      for (const [x, z, w, d] of [[0, 1.3, 3.4, 0.12], [-1.72, 0.4, 0.12, 1.8]]) part(L, box(w, 0.42, d), pal.wall, { x, y: 0.28, z });
      for (const [x, z, s] of [[1.6, -1.0, 1.0], [-1.6, -1.1, 0.8]]) {
        part(L, cyl(0.05, 0.08, 1.6 * s, 5), pal.wood, { x, y: 0.8 * s, z, rz: 0.12 });
        for (let t = 0; t < 3; t++) part(L, new THREE.ConeGeometry((0.62 - t * 0.14) * s, 0.26 * s, 7), pal.pine || pal.roof, { x: x + (t % 2 ? 0.08 : -0.06), y: (1.15 + t * 0.32) * s, z });
      }
      part(L, box(0.34, 0.7, 0.1), pal.stone, { x: 0.4, y: 0.42, z: 1.0 });
      break; }
    case 'terrace': { // 上界云台：崖石托底 + 汉白玉台 + 重檐殿 + 金顶（悬于山巅之上）
      const rock = new THREE.ConeGeometry(2.3, 3.6, 7, 3); rock.rotateX(Math.PI);
      { const q = rock.attributes.position; for (let i = 0; i < q.count; i++) { const y = q.getY(i); const k = 1 + 0.18 * Math.sin(i * 1.7) * (y < 1.5 ? 1 : 0); q.setX(i, q.getX(i) * k); q.setZ(i, q.getZ(i) * k); } rock.computeVertexNormals(); }
      part(L, rock, pal.rock || pal.stone, { y: -1.6 });
      part(L, cyl(2.55, 2.4, 0.32, 12), pal.cloud, { y: 0.16 });
      part(L, cyl(1.9, 1.95, 0.22, 12), pal.wall, { y: 0.42 });
      part(L, box(2.4, 1.15, 1.6), pal.wall, { y: 1.1 });
      for (const x of [-1.05, -0.35, 0.35, 1.05]) part(L, box(0.11, 1.15, 0.11), pal.red, { x, y: 1.1, z: 0.82 });
      part(L, roof(3.3, 0.85, 0.55), pal.roof, { y: 2.05, sz: 0.72 });
      part(L, box(1.4, 0.45, 0.95), pal.wall, { y: 2.55 });
      part(L, roof(2.1, 0.62, 0.55), pal.roof, { y: 3.05, sz: 0.72 });
      part(L, cyl(0.03, 0.1, 0.6, 6), pal.gold, { y: 3.6 });
      break; }
    case 'remnant': { // 幽冥遗迹：焦墨乱石 + 断碑 + 双残柱
      const rock = new THREE.DodecahedronGeometry(1.2, 0); rock.scale(1.3, 0.9, 1.0);
      part(L, rock, pal.dark, { x: -0.9, y: 0.6, z: -0.4 });
      const rock2 = new THREE.DodecahedronGeometry(0.7, 0); part(L, rock2, pal.dark, { x: 1.2, y: 0.35, z: 0.8, sy: 0.8 });
      part(L, box(0.7, 1.7, 0.2), pal.bone, { x: 0.5, y: 0.85, z: -0.6, rz: 0.22 });
      part(L, box(0.8, 0.5, 0.3), pal.stone, { x: 0.5, y: 0.25, z: -0.6 });
      for (const [x, h] of [[1.6, 2.4], [2.4, 1.3]]) part(L, cyl(0.24, 0.3, h, 7), pal.bone, { x, y: h / 2, z: -1.2 });
      break; }
  }
  const geometry = mergeGeometries(L, false); for (const g of L) g.dispose();
  geometry.computeBoundingSphere(); return geometry;
}

/** Shared builder for out-of-map motifs (ShanhaiAtmosphere floating isles). Caller owns disposal. */
export function sceneryGeometry(kind, plane) { return buildKind(kind, PALETTES[plane] || PALETTES.mortal); }

const KINDS = Object.freeze({
  mortal: ['hermitage', 'pavilion', 'pagoda', 'paifang', 'bridge', 'boat', 'stele'],
  upper: ['terrace', 'gate', 'array', 'stele'],
  nether: ['remnant', 'pillar', 'tombs', 'lamp', 'deadtree', 'ruin'],
});
const QUOTA = Object.freeze({
  mortal: { hermitage: 4, pavilion: 5, pagoda: 2, paifang: 3, bridge: 4, boat: 6, stele: 4 },
  upper: { terrace: 3, gate: 2, array: 2, stele: 5 },
  nether: { remnant: 4, pillar: 8, tombs: 5, lamp: 12, deadtree: 12, ruin: 2 },
});
// Landmarks read at medium zoom: a pagoda must out-top houses, lamps stay small.
const LANDMARK_SCALE = Object.freeze({ hermitage: 1.25, terrace: 2.1, remnant: 1.5, pavilion: 1.5, pagoda: 1.9, paifang: 1.5, bridge: 1, boat: 1.2, stele: 1.3, hall: 1.9, gate: 1.7, array: 1.05, pillar: 1.6, tombs: 1.5, lamp: 1.4, deadtree: 1.7, ruin: 1.6 });
const FOOT = Object.freeze({ hermitage: 4.6, terrace: 5, remnant: 4, pavilion: 2.4, pagoda: 2.6, paifang: 4, bridge: 2, boat: 2, stele: 1, hall: 3.4, gate: 4.2, array: 5.4, pillar: 1.2, tombs: 3, lamp: 0.8, deadtree: 1.2, ruin: 3.4 });

/**
 * V1.1 · 随形布局。
 * 候选点只由 seed + 网格哈希决定（与地形无关，稳定）；每次「地形真实改变」后，
 * 用**当前**高度 / 水体 / 坡度重新评估候选，并按哈希顺序挑满配额。
 * ⇒ 地形不变时布局逐帧不变；削山 / 抬山 / 引水后，不再合适的景物隐去，
 *   新平出的台地、新挖的水面会在既有候选里就近补位（不会每帧跳动）。
 * Read-only on World.
 */
export function sceneryCandidates(world) {
  const kinds = KINDS[world?.plane]; if (!kinds) return [];
  const { w, h } = world, out = [];
  for (const kind of kinds) {
    if (kind === 'bridge') continue;
    const quota = QUOTA[world.plane][kind];
    // ~10 candidates per slot, spread over the whole map.
    const stride = Math.max(4, Math.round(Math.sqrt(w * h / (quota * 10))));
    for (let by = 2; by < h - 3; by += stride) for (let bx = 2; bx < w - 3; bx += stride) {
      const hash = hashString(`${world.seed >>> 0}|${world.plane}|scenery:${kind}:${bx},${by}`);
      const x = Math.min(w - 3, bx + hash % stride), y = Math.min(h - 3, by + (hash >>> 8) % stride);
      if (x < 2 || y < 2) continue;
      out.push({ kind, cx: x, cy: y, x: x + 0.5, y: y + 0.5, hash, rotationY: (hash >>> 20) / 4096 * Math.PI * 2,
        width: FOOT[kind], depth: FOOT[kind], scale: 0.9 + ((hash >>> 4) % 20) / 50, phase: (hash % 628) / 100 });
    }
  }
  return out;
}

export function deriveScenery(world, candidates = sceneryCandidates(world)) {
  const kinds = KINDS[world?.plane]; if (!kinds) return [];
  const { w, h } = world, H = world.height, T = world.type, out = [], taken = [];
  const waterAt = i => !!TERRAIN_INFO[T[i]]?.water;
  const structAt = (x, y, r) => {
    if (!world.struct) return false;
    for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) if (world.struct[yy * w + xx]) return true;
    return false;
  };
  const slopeAt = (x, y) => { x = Math.max(1, Math.min(w - 2, x)); y = Math.max(1, Math.min(h - 2, y)); const i = y * w + x; return Math.max(Math.abs(H[i] - H[i - 1]), Math.abs(H[i] - H[i + 1]), Math.abs(H[i] - H[i - w]), Math.abs(H[i] - H[i + w])); };
  const free = (x, y, r) => taken.every(t => Math.hypot(t.x - x, t.y - y) > r + t.r);
  const accept = {
    pavilion: (i, x, y) => !waterAt(i) && H[i] > 0.38 && H[i] < 0.70 && slopeAt(x, y) < 0.04,
    pagoda: (i, x, y) => !waterAt(i) && H[i] > 0.44 && H[i] < 0.80 && slopeAt(x, y) < 0.04,
    paifang: (i, x, y) => !waterAt(i) && H[i] > 0.31 && H[i] < 0.42 && slopeAt(x, y) < 0.012 && T[i] !== 17,
    stele: (i, x, y) => !waterAt(i) && slopeAt(x, y) < 0.03 && (world.plane !== 'upper' || H[i] > 0.34),
    boat: (i, x, y) => waterAt(i) && T[i] >= 2 && [[3, 0], [-3, 0], [0, 3], [0, -3]].some(([dx, dy]) => x + dx > 0 && x + dx < w - 1 && y + dy > 0 && y + dy < h - 1 && !waterAt((y + dy) * w + x + dx)),
    hall: (i, x, y) => H[i] > 0.50 && slopeAt(x, y) < 0.09,
    hermitage: (i, x, y) => !waterAt(i) && H[i] > 0.36 && H[i] < 0.66 && slopeAt(x, y) < 0.03 && slopeAt(x + 1, y + 1) < 0.035 && slopeAt(x - 1, y - 1) < 0.035,
    terrace: (i, x, y) => H[i] > 0.55 && slopeAt(x, y) < 0.10,
    remnant: (i, x, y) => !waterAt(i) && slopeAt(x, y) < 0.05,
    gate: (i, x, y) => H[i] > 0.38 && slopeAt(x, y) < 0.04,
    array: (i, x, y) => H[i] > 0.32 && slopeAt(x, y) < 0.03,
    pillar: (i, x, y) => !waterAt(i) && slopeAt(x, y) < 0.06,
    tombs: (i, x, y) => !waterAt(i) && slopeAt(x, y) < 0.02,
    lamp: (i, x, y) => !waterAt(i) && slopeAt(x, y) < 0.04,
    deadtree: (i, x, y) => !waterAt(i) && slopeAt(x, y) < 0.05,
    ruin: (i, x, y) => !waterAt(i) && slopeAt(x, y) < 0.015,
  };
  const byKind = new Map();
  for (const c of candidates) { if (!byKind.has(c.kind)) byKind.set(c.kind, []); byKind.get(c.kind).push(c); }
  for (const kind of kinds) {
    const quota = QUOTA[world.plane][kind], r = FOOT[kind];
    if (kind === 'bridge') {
      // Narrow water (≤4 cells) between two dry banks along X or Y.
      const cands = [];
      for (let y = 3; y < h - 3; y += 2) for (let x = 3; x < w - 3; x += 2) {
        const i = y * w + x; if (!waterAt(i) || T[i] < 2) continue;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          let a = 0, b = 0;
          while (a < 4 && waterAt((y - dy * (a + 1)) * w + x - dx * (a + 1))) a++;
          while (b < 4 && waterAt((y + dy * (b + 1)) * w + x + dx * (b + 1))) b++;
          const span = a + b + 1; if (a >= 4 || b >= 4 || span < 2) continue;
          const x0 = x - dx * (a + 1), y0 = y - dy * (a + 1), x1 = x + dx * (b + 1), y1 = y + dy * (b + 1);
          if (Math.abs(H[y0 * w + x0] - H[y1 * w + x1]) > 0.05) continue;
          cands.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, span: span + 1.6, rotationY: dx ? 0 : Math.PI / 2, ends: [x0, y0, x1, y1], hash: hashString(`${world.seed >>> 0}|bridge:${x},${y}`) });
        }
      }
      cands.sort((p, q) => p.hash - q.hash);
      for (const c of cands) { if (out.filter(o => o.kind === 'bridge').length >= quota) break; if (!free(c.x, c.y, 8)) continue; taken.push({ x: c.x, y: c.y, r: 3 }); out.push({ kind, ...c, width: c.span, depth: 1.4, scale: 1 }); }
      continue;
    }
    const cands = (byKind.get(kind) || []).filter(c => {
      const i = c.cy * w + c.cx;
      if (!Number.isFinite(H[i]) || !accept[kind](i, c.cx, c.cy)) return false;
      return !(world.plane === 'mortal' && kind !== 'boat' && structAt(c.cx, c.cy, 3));
    }).sort((p, q) => p.hash - q.hash);
    let n = 0;
    for (const c of cands) {
      if (n >= quota) break; if (!free(c.x, c.y, r + 4)) continue;
      taken.push({ x: c.x, y: c.y, r }); n++;
      out.push({ ...c, key: `${kind}:${c.cx},${c.cy}` });
    }
  }
  return out;
}

export class ShanhaiSceneryLayer {
  constructor(world, coordinates, elevation) {
    this.world = world; this.coordinates = coordinates; this.elevation = elevation;
    this.group = new THREE.Group(); this.group.name = 'ShanhaiSceneryLayer'; this.group.userData.decorative = 'shanhai';
    this.enabled = false; this.regionGeometry = null; this.regionInside = true; this.clock = 0; this.time = 0;
    this.candidates = sceneryCandidates(world);
    this.relayoutAt = -1; this.relayouts = 0;
    this.meshes = new Map(); this.transform = new THREE.Object3D();
    const pal = PALETTES[world.plane];
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.material.name = 'ShanhaiScenery';
    this.inkMaterial = new THREE.MeshBasicMaterial({ color: world.plane === 'nether' ? '#171513' : '#3A3631', side: THREE.BackSide });
    this.inkMaterial.onBeforeCompile = shader => { shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normalize(normal) * 0.4 + normalize(position - vec3(0.0, 1.0, 0.0) + vec3(1e-4))) * 0.06;'); };
    this.glowMaterial = world.plane === 'nether' ? new THREE.SpriteMaterial({ map: glowTexture(pal.soul), color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.NormalBlending }) : null;
    this.glows = [];
    // Fixed capacity per kind (= quota) so relayout after terrain edits never reallocates GPU buffers.
    const quota = QUOTA[world.plane] || {};
    for (const kind of KINDS[world.plane] || []) {
      const count = quota[kind] || 0; if (!count) continue;
      const geometry = buildKind(kind, pal);
      const mesh = new THREE.InstancedMesh(geometry, this.material, count); mesh.name = `ShanhaiScenery:${kind}`;
      const ink = new THREE.InstancedMesh(geometry, this.inkMaterial, count); ink.name = `ShanhaiSceneryInk:${kind}`; ink.instanceMatrix = mesh.instanceMatrix;
      for (const m of [mesh, ink]) { m.raycast = () => {}; m.userData.presentationOnly = true; m.userData.decorative = 'shanhai'; m.frustumCulled = false; this.group.add(m); }
      const glows = [];
      if (kind === 'lamp' && this.glowMaterial) for (let i = 0; i < count; i++) {
        const sp = new THREE.Sprite(this.glowMaterial); sp.raycast = () => {}; sp.userData.decorative = 'shanhai'; sp.scale.set(2.4, 2.4, 1); sp.visible = false; glows.push(sp); this.glows.push(sp); this.group.add(sp);
      }
      this.meshes.set(kind, { kind, mesh, ink, geometry, slots: new Array(count).fill(null), glows });
    }
    this.stats = { records: 0, visible: 0, yielded: 0, regionHidden: 0, relayouts: 0, kinds: {} };
    this.relayout();
    this.group.visible = false; this.dirty = true;
  }
  get layout() { const out = []; for (const e of this.meshes.values()) for (const r of e.slots) if (r) out.push(r); return out; }
  /** Re-evaluate candidates against the *current* terrain; surviving records keep their slot (no jumping). */
  relayout() {
    const next = deriveScenery(this.world, this.candidates), byKind = new Map();
    for (const r of next) { if (!r.key) r.key = `${r.kind}:${Math.round(r.x * 2)},${Math.round(r.y * 2)}`; if (!byKind.has(r.kind)) byKind.set(r.kind, []); byKind.get(r.kind).push(r); }
    const counts = {};
    for (const [kind, e] of this.meshes) {
      const list = byKind.get(kind) || [], keys = new Map(list.map(r => [r.key, r]));
      const placed = new Set();
      e.slots = e.slots.map(old => { if (old && keys.has(old.key)) { placed.add(old.key); return keys.get(old.key); } return null; });
      for (const r of list) { if (placed.has(r.key)) continue; const k = e.slots.indexOf(null); if (k < 0) break; e.slots[k] = r; placed.add(r.key); }
      counts[kind] = placed.size;
    }
    this.relayouts++;
    Object.assign(this.stats, { records: Object.values(counts).reduce((a, b) => a + b, 0), kinds: counts, relayouts: this.relayouts });
    this.dirty = true;
  }
  setEnabled(enabled) { this.enabled = !!enabled; this.group.visible = this.enabled; if (this.enabled) this.dirty = true; else if (this.zones?.length) { this.zones = []; this._zoneSig = ''; this.zonesVersion = (this.zonesVersion || 0) + 1; } }
  setRegionGeometry(geometry, inside = true) { if (this.regionGeometry !== geometry || this.regionInside !== !!inside) { this.regionGeometry = geometry; this.regionInside = !!inside; this.dirty = true; } }
  invalidateGround() { this.dirty = true; this.relayoutAt = this.time + 0.4; }
  /** Yield to real settlements: a village grown onto a pavilion site wins, always. */
  occupied(r) {
    const s = this.world.struct; if (!s || r.kind === 'boat' || r.kind === 'bridge') return false;
    const w = this.world.w, rad = Math.ceil(r.width / 2) + 1, cx = Math.floor(r.x), cy = Math.floor(r.y);
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) if (x >= 0 && y >= 0 && x < w && y < this.world.h && s[y * w + x]) return true;
    return false;
  }
  groundFor(r) {
    const E = this.elevation;
    if (r.kind === 'bridge') return Math.max(E.at(r.ends[0], r.ends[1]), E.at(r.ends[2], r.ends[3])) - 0.6;
    if (r.kind === 'boat') return Math.max(E.at(r.x, r.y), 0) + 0.05;
    // Footprint-aware: sink to the lowest of five samples so no corner floats over a fresh cut.
    const d = Math.min(1.6, (r.width || 1) * 0.3);
    return Math.min(E.at(r.x, r.y), E.at(r.x + d, r.y + d), E.at(r.x - d, r.y - d), E.at(r.x + d, r.y - d), E.at(r.x - d, r.y + d)) - 0.05;
  }
  update(dt = 0, { heightChanged = false } = {}) {
    this.time += Math.max(0, dt || 0);
    if (heightChanged) { this.dirty = true; this.relayoutAt = this.time + 0.4; }
    if (!this.enabled) return;
    this.clock += Math.max(0, dt || 0);
    // Debounced: only re-pick sites once the brush has rested for 0.4s.
    if (this.relayoutAt >= 0 && this.time >= this.relayoutAt) { this.relayoutAt = -1; this.relayout(); }
    if (this.clock > 2.0) { this.clock = 0; this.dirty = true; }
    const animate = this.world.plane !== 'mortal' || (this.meshes.get('boat')?.slots.some(Boolean));
    if (!this.dirty && !animate) return;
    const full = this.dirty; this.dirty = false;
    let visible = 0, yielded = 0, regionHidden = 0;
    const t = this.transform, zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const { kind, mesh, slots, glows } of this.meshes.values()) {
      const animated = ['boat', 'lamp', 'array'].includes(kind);
      if (!full && !animated) continue;
      slots.forEach((r, i) => {
        const glow = glows[i];
        if (!r) { mesh.setMatrixAt(i, zero); if (glow) glow.visible = false; return; }
        if (full) {
          r.hidden = false;
          if (this.regionGeometry && !decorationFootprintOwned(this.world, this.regionGeometry, this.regionInside, { x: r.x, y: r.y, width: r.width, depth: r.depth, rotationY: r.rotationY })) { r.hidden = true; regionHidden++; }
          else if (this.world.plane === 'mortal' && this.occupied(r)) { r.hidden = true; yielded++; }
          else if (r.kind === 'boat' && !TERRAIN_INFO[this.world.type[Math.floor(r.y) * this.world.w + Math.floor(r.x)]]?.water) { r.hidden = true; yielded++; }
          r.ground = this.groundFor(r);
        }
        if (r.hidden || !Number.isFinite(r.ground)) { mesh.setMatrixAt(i, zero); if (glow) glow.visible = false; return; }
        const p = this.coordinates.worldToRender(r.x, r.y, r.ground);
        let lift = 0, spin = 0;
        if (r.kind === 'boat') lift = Math.sin(this.time * 1.4 + r.phase) * 0.06;
        if (r.kind === 'array') spin = this.time * 0.15;
        t.position.set(p.x, p.y + lift, p.z); t.rotation.set(0, r.rotationY + spin, 0);
        if (r.kind === 'bridge') t.scale.set(r.span, 1.4, 1.2); else t.scale.setScalar(r.scale * LANDMARK_SCALE[r.kind]);
        t.updateMatrix(); mesh.setMatrixAt(i, t.matrix); visible++;
        if (glow) {
          glow.visible = true; const c = Math.cos(r.rotationY), s = Math.sin(r.rotationY);
          const k = r.scale * LANDMARK_SCALE.lamp; glow.position.set(p.x + c * 0.22 * k, p.y + 1.3 * k, p.z - s * 0.22 * k);
          const f = 1.8 + Math.sin(this.time * 3 + r.phase) * 0.25 + Math.sin(this.time * 7.3 + r.phase) * 0.12; glow.scale.set(f, f, 1);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (full) {
      Object.assign(this.stats, { visible, yielded, regionHidden });
      // Footprints the forest should give way to (presentation only).
      const zones = [];
      for (const e of this.meshes.values()) for (const r of e.slots) if (r && !r.hidden && r.kind !== 'boat' && r.kind !== 'bridge') zones.push({ x: r.x, y: r.y, r: FOOT[r.kind] * LANDMARK_SCALE[r.kind] * r.scale * 0.42 });
      const sig = zones.map(z => `${z.x},${z.y}`).join('|');
      if (sig !== this._zoneSig) { this._zoneSig = sig; this.zones = zones; this.zonesVersion = (this.zonesVersion || 0) + 1; }
    }
  }
  dispose() {
    for (const { mesh, ink, geometry } of this.meshes.values()) { mesh.dispose(); ink.dispose(); geometry.dispose(); }
    this.meshes.clear(); this.glows.length = 0; this.material.dispose(); this.inkMaterial.dispose(); this.glowMaterial?.map?.dispose(); this.glowMaterial?.dispose();
    this.group.removeFromParent();
  }
}

function glowTexture(hex) {
  const S = 64, canvas = makeCanvas(S, S);
  const g = canvas.getContext('2d'), grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2), c = C(hex);
  const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
  grad.addColorStop(0, `rgba(255,236,220,0.95)`); grad.addColorStop(0.25, `rgba(${rgb},0.75)`); grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
