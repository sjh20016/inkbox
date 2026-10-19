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
  mortal: { wall: '#EEE7D6', roof: '#6E7A80', wood: '#85684D', red: '#B64A3B', stone: '#A8A496', dark: '#3B3A36', gold: '#C3A25B', boat: '#7B6448', sail: '#E9E1CC' },
  upper: { wall: '#F0EDE1', roof: '#4E6E78', wood: '#996547', red: '#B73F32', stone: '#C9C3B0', dark: '#305566', gold: '#D5B65A', jade: '#5C8D6B', cloud: '#FBF8EF', paleGold: '#D9C99A' },
  nether: { wall: '#8E8A82', roof: '#3A3734', wood: '#4A4640', red: '#B23A2E', stone: '#77746D', dark: '#1D1C1A', bone: '#D9D3C5', soul: '#C6463A' },
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
  }
  const geometry = mergeGeometries(L, false); for (const g of L) g.dispose();
  geometry.computeBoundingSphere(); return geometry;
}

const KINDS = Object.freeze({
  mortal: ['pavilion', 'pagoda', 'paifang', 'bridge', 'boat', 'stele'],
  upper: ['hall', 'gate', 'array', 'stele'],
  nether: ['pillar', 'tombs', 'lamp', 'deadtree', 'ruin'],
});
const QUOTA = Object.freeze({
  mortal: { pavilion: 6, pagoda: 2, paifang: 3, bridge: 4, boat: 6, stele: 5 },
  upper: { hall: 5, gate: 2, array: 3, stele: 6 },
  nether: { pillar: 12, tombs: 5, lamp: 14, deadtree: 16, ruin: 3 },
});
// Landmarks read at medium zoom: a pagoda must out-top houses, lamps stay small.
const LANDMARK_SCALE = Object.freeze({ pavilion: 1.5, pagoda: 1.9, paifang: 1.5, bridge: 1, boat: 1.2, stele: 1.3, hall: 1.9, gate: 1.7, array: 1.05, pillar: 1.6, tombs: 1.5, lamp: 1.4, deadtree: 1.7, ruin: 1.6 });
const FOOT = Object.freeze({ pavilion: 2.4, pagoda: 2.6, paifang: 4, bridge: 2, boat: 2, stele: 1, hall: 3.4, gate: 4.2, array: 5.4, pillar: 1.2, tombs: 3, lamp: 0.8, deadtree: 1.2, ruin: 3.4 });

/** Deterministic layout from seed + creation-time terrain. Read-only on World. */
export function deriveScenery(world) {
  const kinds = KINDS[world?.plane]; if (!kinds) return [];
  const { w, h } = world, H = world.height, T = world.type, out = [], taken = [];
  const waterAt = i => !!TERRAIN_INFO[T[i]]?.water;
  const structAt = (x, y, r) => {
    if (!world.struct) return false;
    for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) if (world.struct[yy * w + xx]) return true;
    return false;
  };
  const slopeAt = (x, y) => { const i = y * w + x; return Math.max(Math.abs(H[i] - H[i - 1]), Math.abs(H[i] - H[i + 1]), Math.abs(H[i] - H[i - w]), Math.abs(H[i] - H[i + w])); };
  const free = (x, y, r) => taken.every(t => Math.hypot(t.x - x, t.y - y) > r + t.r);
  const accept = { // per-kind site predicate on raw cells
    pavilion: (i, x, y) => !waterAt(i) && H[i] > 0.38 && H[i] < 0.70 && slopeAt(x, y) < 0.04,
    pagoda: (i, x, y) => !waterAt(i) && H[i] > 0.44 && H[i] < 0.80 && slopeAt(x, y) < 0.04,
    paifang: (i, x, y) => !waterAt(i) && H[i] > 0.31 && H[i] < 0.42 && slopeAt(x, y) < 0.012 && T[i] !== 17,
    stele: (i, x, y) => !waterAt(i) && slopeAt(x, y) < 0.03 && (world.plane !== 'upper' || H[i] > 0.34),
    boat: (i, x, y) => waterAt(i) && T[i] >= 2 && [[3, 0], [-3, 0], [0, 3], [0, -3]].some(([dx, dy]) => x + dx > 0 && x + dx < w - 1 && y + dy > 0 && y + dy < h - 1 && !waterAt((y + dy) * w + x + dx)),
    hall: (i, x, y) => H[i] > 0.50 && slopeAt(x, y) < 0.09,
    gate: (i, x, y) => H[i] > 0.38 && slopeAt(x, y) < 0.04,
    array: (i, x, y) => H[i] > 0.32 && slopeAt(x, y) < 0.03,
    pillar: (i, x, y) => !waterAt(i) && slopeAt(x, y) < 0.06,
    tombs: (i, x, y) => !waterAt(i) && slopeAt(x, y) < 0.02,
    lamp: (i, x, y) => !waterAt(i) && slopeAt(x, y) < 0.04,
    deadtree: (i, x, y) => !waterAt(i) && slopeAt(x, y) < 0.05,
    ruin: (i, x, y) => !waterAt(i) && slopeAt(x, y) < 0.015,
  };
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
    const stride = Math.max(5, Math.round(Math.sqrt(w * h / (quota * 6))));
    const cands = [];
    for (let by = 2; by < h - 3; by += stride) for (let bx = 2; bx < w - 3; bx += stride) {
      const hash = hashString(`${world.seed >>> 0}|${world.plane}|scenery:${kind}:${bx},${by}`);
      const x = Math.min(w - 3, bx + hash % stride), y = Math.min(h - 3, by + (hash >>> 8) % stride), i = y * w + x;
      if (x < 2 || y < 2 || !Number.isFinite(H[i]) || !accept[kind](i, x, y)) continue;
      if (world.plane === 'mortal' && kind !== 'boat' && structAt(x, y, 3)) continue;
      cands.push({ x: x + 0.5, y: y + 0.5, hash });
    }
    cands.sort((p, q) => p.hash - q.hash);
    let n = 0;
    for (const c of cands) {
      if (n >= quota) break; if (!free(c.x, c.y, r + 4)) continue;
      taken.push({ x: c.x, y: c.y, r }); n++;
      out.push({ kind, x: c.x, y: c.y, rotationY: (c.hash >>> 20) / 4096 * Math.PI * 2, width: r, depth: r, scale: 0.9 + ((c.hash >>> 4) % 20) / 50, phase: (c.hash % 628) / 100 });
    }
  }
  return out;
}

export class ShanhaiSceneryLayer {
  constructor(world, coordinates, elevation) {
    this.world = world; this.coordinates = coordinates; this.elevation = elevation;
    this.group = new THREE.Group(); this.group.name = 'ShanhaiSceneryLayer'; this.group.userData.decorative = 'shanhai';
    this.enabled = false; this.regionGeometry = null; this.regionInside = true; this.clock = 0; this.time = 0;
    this.layout = deriveScenery(world);
    this.meshes = new Map(); this.transform = new THREE.Object3D();
    const pal = PALETTES[world.plane];
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.material.name = 'ShanhaiScenery';
    this.inkMaterial = new THREE.MeshBasicMaterial({ color: world.plane === 'nether' ? '#171513' : '#3A3631', side: THREE.BackSide });
    this.inkMaterial.onBeforeCompile = shader => { shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * 0.06;'); };
    this.glowMaterial = world.plane === 'nether' ? new THREE.SpriteMaterial({ map: glowTexture(pal.soul), color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.NormalBlending }) : null;
    this.glows = [];
    const counts = {};
    for (const r of this.layout) counts[r.kind] = (counts[r.kind] || 0) + 1;
    for (const [kind, count] of Object.entries(counts)) {
      const geometry = buildKind(kind, pal);
      const mesh = new THREE.InstancedMesh(geometry, this.material, count); mesh.name = `ShanhaiScenery:${kind}`;
      const ink = new THREE.InstancedMesh(geometry, this.inkMaterial, count); ink.name = `ShanhaiSceneryInk:${kind}`; ink.instanceMatrix = mesh.instanceMatrix;
      for (const m of [mesh, ink]) { m.raycast = () => {}; m.userData.presentationOnly = true; m.userData.decorative = 'shanhai'; m.frustumCulled = false; this.group.add(m); }
      this.meshes.set(kind, { mesh, ink, geometry, records: this.layout.filter(r => r.kind === kind) });
    }
    if (this.glowMaterial) for (const r of this.layout.filter(r => r.kind === 'lamp')) {
      const s = new THREE.Sprite(this.glowMaterial); s.raycast = () => {}; s.userData.decorative = 'shanhai'; s.scale.set(2.4, 2.4, 1); r.glow = s; this.glows.push(s); this.group.add(s);
    }
    this.stats = { records: this.layout.length, visible: 0, yielded: 0, regionHidden: 0, kinds: counts };
    this.group.visible = false; this.dirty = true;
  }
  setEnabled(enabled) { this.enabled = !!enabled; this.group.visible = this.enabled; if (this.enabled) this.dirty = true; }
  setRegionGeometry(geometry, inside = true) { if (this.regionGeometry !== geometry || this.regionInside !== !!inside) { this.regionGeometry = geometry; this.regionInside = !!inside; this.dirty = true; } }
  invalidateGround() { this.dirty = true; }
  /** Yield to real settlements: a village grown onto a pavilion site wins, always. */
  occupied(r) {
    const s = this.world.struct; if (!s || r.kind === 'boat' || r.kind === 'bridge') return false;
    const w = this.world.w, rad = Math.ceil(r.width / 2) + 1, cx = Math.floor(r.x), cy = Math.floor(r.y);
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) if (x >= 0 && y >= 0 && x < w && y < this.world.h && s[y * w + x]) return true;
    return false;
  }
  update(dt = 0, { heightChanged = false } = {}) {
    if (!this.enabled) return;
    this.time += Math.max(0, dt || 0); this.clock += Math.max(0, dt || 0);
    if (heightChanged) this.dirty = true;
    if (this.clock > 2.0) { this.clock = 0; this.dirty = true; }
    const animate = this.world.plane !== 'mortal' || this.layout.some(r => r.kind === 'boat');
    if (!this.dirty && !animate) return;
    const full = this.dirty; this.dirty = false;
    let visible = 0, yielded = 0, regionHidden = 0;
    const t = this.transform, zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const { mesh, records } of this.meshes.values()) {
      const animated = records[0] && ['boat', 'hall', 'lamp', 'array'].includes(records[0].kind);
      if (!full && !animated) continue;
      records.forEach((r, i) => {
        if (full) {
          r.hidden = false;
          if (this.regionGeometry && !decorationFootprintOwned(this.world, this.regionGeometry, this.regionInside, { x: r.x, y: r.y, width: r.width, depth: r.depth, rotationY: r.rotationY })) { r.hidden = true; regionHidden++; }
          else if (this.world.plane === 'mortal' && this.occupied(r)) { r.hidden = true; yielded++; }
          else if (r.kind === 'boat' && !TERRAIN_INFO[this.world.type[Math.floor(r.y) * this.world.w + Math.floor(r.x)]]?.water) { r.hidden = true; yielded++; }
          r.ground = r.kind === 'bridge' ? Math.max(this.elevation.at(r.ends[0], r.ends[1]), this.elevation.at(r.ends[2], r.ends[3])) - 0.6
            : r.kind === 'boat' ? Math.max(this.elevation.at(r.x, r.y), 0) + 0.05
            : Math.min(this.elevation.at(r.x, r.y), this.elevation.at(r.x + 0.8, r.y + 0.8), this.elevation.at(r.x - 0.8, r.y - 0.8)) - 0.05;
        }
        if (r.hidden || !Number.isFinite(r.ground)) { mesh.setMatrixAt(i, zero); if (r.glow) r.glow.visible = false; return; }
        const p = this.coordinates.worldToRender(r.x, r.y, r.ground);
        let lift = 0, spin = 0;
        if (r.kind === 'hall') lift = 4.5 + Math.sin(this.time * 0.6 + r.phase) * 0.5;
        if (r.kind === 'boat') lift = Math.sin(this.time * 1.4 + r.phase) * 0.06;
        if (r.kind === 'array') spin = this.time * 0.15;
        t.position.set(p.x, p.y + lift, p.z); t.rotation.set(0, r.rotationY + spin, 0);
        if (r.kind === 'bridge') t.scale.set(r.span, 1.4, 1.2); else t.scale.setScalar(r.scale * LANDMARK_SCALE[r.kind]);
        t.updateMatrix(); mesh.setMatrixAt(i, t.matrix); visible++;
        if (r.glow) {
          r.glow.visible = true; const c = Math.cos(r.rotationY), s = Math.sin(r.rotationY);
          const k = r.scale * LANDMARK_SCALE.lamp; r.glow.position.set(p.x + c * 0.22 * k, p.y + 1.3 * k, p.z - s * 0.22 * k);
          const f = 1.8 + Math.sin(this.time * 3 + r.phase) * 0.25 + Math.sin(this.time * 7.3 + r.phase) * 0.12; r.glow.scale.set(f, f, 1);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (full) Object.assign(this.stats, { visible, yielded, regionHidden });
  }
  dispose() {
    for (const { mesh, ink, geometry } of this.meshes.values()) { mesh.dispose(); ink.dispose(); geometry.dispose(); }
    this.meshes.clear(); this.material.dispose(); this.inkMaterial.dispose(); this.glowMaterial?.map?.dispose(); this.glowMaterial?.dispose();
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
