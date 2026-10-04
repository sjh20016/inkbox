// 水墨沙盒 · 3D 世界关键物与地点标记层（Render3D M1-C）
//
// ───────────────────────────────────────────────────────────────────────
// 这一层负责什么
// ───────────────────────────────────────────────────────────────────────
//
// 「低成本但能显著增加世界信息密度」的东西：
//   · **无主法宝**（`world.artifacts`）——地上极小的墨点 / 冷光，玩家能看出「那里有东西」；
//   · **地点**（`world.sites`）——按 `kind` 分四种抽象低模符号（秘境 / 洞府 / 阵法 / 遗迹）；
//   · **灵脉**（`world.leylines`）——山体上方一个很小的环形标记；
//   · **空间裂缝**（`world.rifts`）——贴地的圆环，半径**必须**调 `sim/rifts.js` 的唯一公式。
//
// ⚠️ **只读**：不写 `world`、不抽 RNG、不复制任何生态数值。
// ⚠️ **裂缝半径绝不在这里重算**：一律 `riftRadiusAt(rift)`（`sim/rifts.js`）。
//    在渲染层抄一条生长曲线，就会在下次调参时与模拟**静默分叉**——不报错、只是画错。
//
// ───────────────────────────────────────────────────────────────────────
// LOD（蓝图 §七「第一版 LOD」）
// ───────────────────────────────────────────────────────────────────────
//
// 小标记在**全图视角**会把画面糊成一片点 ⇒ 各自设一个**最小显示缩放**：
// 法宝最晚显（`MARKER_MIN_ZOOM`）、地点稍早、灵脉居中；**裂缝始终可见**（它是地貌级特征）。
// 这不是「复杂距离 LOD」，只是几条 `visible` 阈值——蓝图允许的最小规则。

import * as THREE from 'three';
import { realmStyleFor } from '../art/RealmStyleProfile.js';
import { ElevationField } from '../terrain/ElevationField.js';
import { INK } from '../../core/config.js';
import { visibleRift } from '../readers/riftViewModel.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

/** 四类地点（与 `sim/sites.js` 写入的 `kind` 字面量一一对应，顺序即渲染顺序契约）。 */
export const SITE_KINDS = Object.freeze(['secret', 'cave', 'formation', 'ruin']);

/** 各类标记的最小显示缩放（正交相机 `zoom`）。 */
export const MARKER_MIN_ZOOM = 1.6;      // 法宝：放大后才显（与 Canvas 版口径一致）
export const SITE_MIN_ZOOM = 1.05;       // 地点：地标级，稍早显
export const LEYLINE_MIN_ZOOM = 1.3;     // 灵脉

const ARTIFACT_CAP = 256;                // GROUND_CAP = 120
const SITE_CAP = 256;
const LEYLINE_CAP = 256;
const RIFT_CAP = 128;                    // RIFT_MAX_ACTIVE = 64

/** 地点符号配色：照搬 Canvas 版 `drawSites` 的语义（青 / 墨 / 金 / 灰）。 */
const SITE_COLOR = Object.freeze({
  secret: INK.azurite, cave: INK.ink, formation: INK.gold, ruin: '#8e8778',
});

function siteGeometry(kind) {
  if (kind === 'secret') {                       // 秘境：更像一道裂口（细长菱形）
    const g = new THREE.OctahedronGeometry(0.55, 0);
    g.scale(1, 1.9, 1); g.translate(0, 0.9, 0); return g;
  }
  if (kind === 'cave') {                          // 洞府：更像入口（矮门框）
    const g = new THREE.BoxGeometry(1.3, 1.3, 0.35); g.translate(0, 0.65, 0); return g;
  }
  if (kind === 'formation') {                     // 阵法：偏几何（平铺方环）
    const g = new THREE.TorusGeometry(0.72, 0.1, 4, 12);
    g.rotateX(-Math.PI / 2); g.translate(0, 0.25, 0); return g;
  }
  const g = new THREE.BoxGeometry(0.5, 1.5, 0.5); // 遗迹：偏残缺（歪斜残柱）
  g.rotateZ(0.22); g.translate(0, 0.7, 0); return g;
}

/**
 * 世界状态 → 各类标记坐标（**纯函数**，node 可断言）。
 *
 * @returns {{artifacts:Array, sites:object, leylines:Array, rifts:Array, total:number}}
 *   每条 `{ id, x, y, ... }`；`rifts` 额外带 `radius`（**来自 `riftRadiusAt`**）。
 */
export function deriveMarkers(world) {
  const out = { artifacts: [], sites: { secret: [], cave: [], formation: [], ruin: [] }, leylines: [], rifts: [], total: 0 };
  if (!world) return out;

  // ── 无主法宝：`world.artifacts` 本身就是「在地面、无主」的那一批 ──
  const artifacts = Array.isArray(world.artifacts) ? world.artifacts : [];
  for (const a of artifacts) {
    if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;
    out.artifacts.push({ id: a.id, x: a.x, y: a.y });
    out.total += 1;
  }

  // ── 地点：按 kind 分流（未知 kind 直接跳过，不猜）──
  const sites = Array.isArray(world.sites) ? world.sites : [];
  for (const s of sites) {
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    const bucket = out.sites[s.kind];
    if (!bucket) continue;
    bucket.push({ id: s.id, x: s.x, y: s.y });
    out.total += 1;
  }

  // ── 灵脉 ──
  const leylines = Array.isArray(world.leylines) ? world.leylines : [];
  for (const l of leylines) {
    if (!l || !Number.isFinite(l.x) || !Number.isFinite(l.y)) continue;
    out.leylines.push({ id: l.id, x: l.x, y: l.y, strength: l.strength });
    out.total += 1;
  }

  // ── 裂缝：只画还开着的；半径走唯一公式 ──
  const rifts = Array.isArray(world.rifts) ? world.rifts : [];
  for (const r of rifts) {
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    const view = visibleRift(r);
    if (!view) continue;
    out.rifts.push({ id: r.id, x: r.x, y: r.y, ...view });
    out.total += 1;
  }
  return out;
}

/** 精确比较（无哈希碰撞风险）。 */
function sameList(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const p = a[i]; const q = b[i];
    if (p.id !== q.id || p.x !== q.x || p.y !== q.y || p.radius !== q.radius) return false;
  }
  return true;
}
function sameMarkers(a, b) {
  if (!a || !b) return false;
  if (!sameList(a.artifacts, b.artifacts) || !sameList(a.leylines, b.leylines) || !sameList(a.rifts, b.rifts)) return false;
  return SITE_KINDS.every((k) => sameList(a.sites[k], b.sites[k]));
}

export class WorldMarkerLayer {
  constructor(world, coordinates, elevation = new ElevationField(world)) {
    this.coordinates = coordinates;
    this.elevation = elevation;
    this.regionGeometry = null;
    this.regionInside = true;
    this.interval = 1 / 4;                  // 标记是半静态的：4 Hz
    this.clock = Infinity;
    this.lastDerived = null;
    this.zoom = 1;
    this.colorCache = new Map();
    this.realmStyle = null;
    this.dummy = new THREE.Object3D();
    this.stats = { artifacts: 0, sites: 0, leylines: 0, rifts: 0, total: 0 };

    this.group = new THREE.Group();
    this.group.name = 'WorldMarkerLayer';
    // 每项：{ mesh, minZoom }。`setZoom` 按它统一决定 visible。
    this.entries = [];

    this.artifacts = this.makeMesh(new THREE.OctahedronGeometry(0.34, 0), ARTIFACT_CAP, MARKER_MIN_ZOOM, 'Marker:artifact');
    this.siteMeshes = {};
    for (const kind of SITE_KINDS) this.siteMeshes[kind] = this.makeMesh(siteGeometry(kind), SITE_CAP, SITE_MIN_ZOOM, `Marker:site:${kind}`);
    this.leylines = this.makeMesh(this.leylineGeometry(), LEYLINE_CAP, LEYLINE_MIN_ZOOM, 'Marker:leyline');
    this.rifts = this.makeMesh(this.riftGeometry(), RIFT_CAP, 0, 'Marker:rift');
  }

  leylineGeometry() {
    const g = new THREE.TorusGeometry(0.85, 0.09, 4, 16);
    g.rotateX(-Math.PI / 2);
    return g;                                // 浮在地表上方（位置里加高度）
  }

  riftGeometry() {
    const g = new THREE.RingGeometry(0.82, 1.0, 28);
    g.rotateX(-Math.PI / 2);
    return g;                                // 单位半径，按 riftRadiusAt 缩放
  }

  makeMesh(geometry, capacity, minZoom, name) {
    const material = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.count = 0;
    mesh.name = name;
    mesh.renderOrder = RENDER_ORDER.markers;
    this.group.add(mesh);
    this.entries.push({ mesh, minZoom });
    return mesh;
  }

  /** 相机缩放变了 ⇒ 按各类阈值开关可见性（不重写矩阵）。 */
  setZoom(zoom) {
    this.zoom = Number.isFinite(zoom) ? zoom : this.zoom;
    for (const { mesh, minZoom } of this.entries) mesh.visible = mesh.count > 0 && this.zoom >= minZoom;
  }

  /** Existing persistent rifts retain their World radius and visibility contract. */
  setArtProfile(profile) {
    const style = profile?.realmStyle || null;
    if (style === this.realmStyle) return;
    this.realmStyle = style;
    const rifts = this.lastDerived?.rifts || [];
    for (let i = 0; i < this.rifts.count; i++)
      this.rifts.setColorAt(i, this.colorOf(this.riftColor(rifts[i]?.targetPlane)));
    if (this.rifts.instanceColor) this.rifts.instanceColor.needsUpdate = true;
  }

  riftColor(targetPlane) {
    const target = targetPlane === 'upper' ? 'upper' : 'nether';
    return this.realmStyle ? realmStyleFor(target).boundary.rift
      : target === 'upper' ? INK.azurite : '#4a4f5c';
  }

  update(dt, world, options = {}) {
    this.clock += Number.isFinite(dt) ? dt : 0;
    const force = !!options.heightChanged;
    if (!force && this.clock < this.interval) return false;
    this.clock = 0;
    const derived = deriveMarkers(world);
    if (!force && sameMarkers(derived, this.lastDerived)) return false;
    this.write(derived, world);
    return true;
  }

  /** §19：区域判据只来自 `RegionGeometry`。 */
  setRegionGeometry(geometry, inside = true) {
    if (this.regionGeometry === geometry && this.regionInside === !!inside) return;
    this.regionGeometry = geometry || null;
    this.regionInside = !!inside;
    this.lastDerived = null;
    this.clock = Infinity;
  }

  /**
   * §24：法宝 / 地点 / 灵脉按**世界坐标**判 inside / outside。
   * ⚠️ **裂缝不走这里** —— 它是 World 的持久对象，与当前这扇窗无关（§55–§57 / S6）。
   */
  regionFilter(list) {
    if (!this.regionGeometry || this.regionGeometry.allInside) return list;
    return list.filter(item => this.regionGeometry.isInsideCell(item.x, item.y) === this.regionInside);
  }

  write(derived, world) {
    const stats = { artifacts: 0, sites: 0, leylines: 0, rifts: 0, total: 0 };

    // ── 法宝：贴地浮一点点的冷金小点 ──
    stats.artifacts = this.fill(this.artifacts, this.regionFilter(derived.artifacts), world, 0.55, () => INK.gold);

    // ── 地点：四种符号 ──
    for (const kind of SITE_KINDS) {
      stats.sites += this.fill(this.siteMeshes[kind], this.regionFilter(derived.sites[kind]), world, 0, () => SITE_COLOR[kind]);
    }

    // ── 灵脉：悬浮环 ──
    stats.leylines = this.fill(this.leylines, this.regionFilter(derived.leylines), world, 1.7, () => INK.orchid);

    // ── 裂缝：贴地圆环，半径现算 ──（**故意不过滤**，见 `regionFilter` 注释）
    const riftMesh = this.rifts;
    const cap = riftMesh.instanceMatrix.count;
    const nRift = Math.min(derived.rifts.length, cap);
    for (let i = 0; i < nRift; i += 1) {
      const r = derived.rifts[i];
      const p = this.coordinates.worldToRender(r.x, r.y, 0);
      this.dummy.position.set(p.x, this.elevation.at(r.x, r.y) + 0.3, p.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(r.radius, 1, r.radius);
      this.dummy.updateMatrix();
      riftMesh.setMatrixAt(i, this.dummy.matrix);
      // The real target plane owns its rift accent; no new rift is created here.
      riftMesh.setColorAt(i, this.colorOf(this.riftColor(r.targetPlane)));
    }
    this.finish(riftMesh, nRift);
    stats.rifts = nRift;
    stats.total = stats.artifacts + stats.sites + stats.leylines + stats.rifts;

    this.lastDerived = derived;
    this.stats = stats;
    this.setZoom(this.zoom);                 // 数量变了 ⇒ 重算可见性
  }

  /** 把一批 `{x, y}` 写进一个 InstancedMesh；`lift` 是离地高度，`colorOf` 给颜色。 */
  fill(mesh, list, world, lift, colorOf) {
    const cap = mesh.instanceMatrix.count;
    const n = Math.min(list.length, cap);
    for (let i = 0; i < n; i += 1) {
      const item = list[i];
      const p = this.coordinates.worldToRender(item.x, item.y, 0);
      this.dummy.position.set(p.x, this.elevation.at(item.x, item.y) + lift, p.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      mesh.setColorAt(i, this.colorOf(colorOf(item)));
    }
    this.finish(mesh, n);
    return n;
  }

  finish(mesh, n) {
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  colorOf(hex) {
    let color = this.colorCache.get(hex);
    if (!color) { color = new THREE.Color(hex); this.colorCache.set(hex, color); }
    return color;
  }

  dispose() {
    for (const { mesh } of this.entries) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    }
    this.group.clear();
    this.entries.length = 0;
    this.colorCache.clear();
    this.lastDerived = null;
  }
}
