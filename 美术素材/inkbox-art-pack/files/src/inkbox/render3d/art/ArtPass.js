import * as THREE from 'three';
import { ART_PLANES, FOG, PAPER, SKIRT } from './artConfig.js';
import { ElevationField } from './ElevationField.js';
import { getRegionMask3D } from './RegionMask3D.js';
import { computeRim } from './RimField.js';
import { SkirtLayer } from './SkirtLayer.js';
import { ArtAssets } from './ArtAssets.js';
import { makeInkColorizer } from './inkColor.js';

// 墙重算的触发阈值（视觉高度单位）与最小间隔（秒）。0.12 单位 ≈ 原始高程 0.003，低于肉眼可辨的缝。
const RIM_EPS = 0.12;
const RIM_MIN_INTERVAL = 0.4;

/**
 * 墨界美术层的编排者（M2-B + Art Pass 的唯一入口）。挂在 Render3DHost 上，关闭时整套行为与 M2-A 逐位一致。
 *
 *   elevationFor(plane, world)  每界一个 ElevationField（垂直档 + 肩部）；Stage 构造时领取
 *   styleStage(stage)           地形水墨顶点色 + 色调分档材质 + 水面花青
 *   attach() / detach()         场景级：雾、清屏色、宣纸叠层、界缘墙
 *   afterApply(state)           每帧在 RealmView3DPrototype.apply 之后：开窗 / 关窗 / 还原窗外各层
 *   update()                    每帧在各 Stage 更新之后：凡间或目标界高程变了就重算墙，推进墙的时间
 *
 * ⚠️ 纯表现：只读 world，不写 world / sim / save，不抽任何随机流。
 */
export class ArtPass {
  constructor(host, { enabled = false, assets = null } = {}) {
    this.host = host;
    this.enabled = !!enabled;
    this.assets = assets;
    this.fields = new Map();
    this.skirt = null;
    this.active = null;       // { mask, target, sign, rim }
    this.saved = null;
    this.overlay = null;
    this.gradientMap = null;
  }

  /** Stage 构造时领取本界的高程场。未启用 ⇒ null，调用方回退到全局 surfaceElevation（M2-A 行为）。 */
  elevationFor(plane, world) {
    if (!this.enabled) return null;
    const field = new ElevationField(world, ART_PLANES[plane] || ART_PLANES.mortal);
    this.fields.set(plane, field);
    return field;
  }

  terrainMaterial() {
    if (!this.gradientMap) {
      const t = new THREE.DataTexture(new Uint8Array([120, 170, 214, 255]), 4, 1, THREE.RedFormat);
      t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
      this.gradientMap = t;
    }
    const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: this.gradientMap, side: THREE.DoubleSide });
    m.flatShading = true;   // 与 TerrainMesh 一致：法线由着色器按片元导数求，不重建全图法线
    return m;
  }

  styleStage(stage) {
    if (!this.enabled) return;
    const t = stage.terrain;
    if (t) {
      t.colorize = makeInkColorizer(stage.plane);
      t.setMaterial(this.terrainMaterial());
      t.update({ x0: 0, y0: 0, x1: stage.world.w - 1, y1: stage.world.h - 1 }, { height: false, type: true });
    }
    if (stage.water) { stage.water.material.color.set('#5f8392'); stage.water.material.opacity = 0.62; }
  }

  attach() {
    if (!this.enabled) return;
    const host = this.host;
    this.assets ||= new ArtAssets();
    if (!this.saved) {
      this.saved = { fog: host.scene.fog, clear: host.gpu.getClearColor ? host.gpu.getClearColor(new THREE.Color()).clone() : null };
    }
    host.gpu.setClearColor(PAPER);
    host.scene.fog = new THREE.Fog(PAPER, FOG.near, FOG.far);
    if (!this.skirt) {
      this.skirt = new SkirtLayer({ assets: this.assets, coordinates: host.coordinates });
      host.scene.add(this.skirt.root);
    } else this.skirt.coordinates = host.coordinates;
    this.mountOverlay();
  }

  mountOverlay() {
    if (this.overlay || typeof document === 'undefined') return;
    const parent = this.host.canvas?.parentElement;
    if (!parent) return;
    const el = document.createElement('div');
    el.id = 'inkArtPaper';
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '2', mixBlendMode: 'multiply', opacity: '0.85',
      backgroundColor: '#f8f2e4',
      backgroundImage: `url(${this.assets.paperUrl()}), radial-gradient(ellipse at 50% 46%, rgba(255,255,255,0) 56%, rgba(128,104,66,0.26) 100%)`,
      backgroundSize: '256px 256px, 100% 100%',
    });
    parent.append(el);
    this.overlay = el;
  }

  /** 关闭 / 世界重建前：撤销场景级改动。Stage 随 Host.releaseWorld 释放，这里不碰。 */
  detach() {
    this.closeWindow();
    this.fields.clear();
    if (this.overlay) { this.overlay.remove(); this.overlay = null; }
    if (this.saved) {
      this.host.scene.fog = this.saved.fog;
      if (this.saved.clear) this.host.gpu.setClearColor(this.saved.clear);
      this.saved = null;
    }
    if (this.skirt) { this.skirt.dispose(); this.skirt = null; }
  }

  /** Slab 探针、关窗、切回非凡间观察 ⇒ 没有"窗"。 */
  afterApply(state) {
    if (!this.enabled) return;
    const host = this.host, proto = host.realmPrototype;
    const mortal = host.stages.get('mortal');
    const open = !!(proto.open && state?.region && mortal && !host.slabProbe);
    if (!open) { this.closeWindow(); return; }
    const target = proto.targetPlane;
    const w = mortal.world.w, h = mortal.world.h;
    const mask = getRegionMask3D(state.region, w, h, SKIRT.shoulder);
    if (!this.active || this.active.mask !== mask || this.active.target !== target) this.openWindow(mask, target);
    // 窗外的凡间：水、植被、聚落回到画面（按同一张掩码过滤，窗内部分不画）。
    for (const layer of [mortal.water, mortal.vegetation, mortal.settlements]) {
      const root = layer?.group || layer?.mesh;
      if (root) root.visible = true;
    }
  }

  openWindow(mask, target) {
    this.closeWindow();
    const host = this.host;
    const mortal = host.stages.get('mortal'), stage = host.stages.get(target);
    const mortalField = this.fields.get('mortal'), targetField = this.fields.get(target);
    if (!mortal || !stage || !mortalField || !targetField) return;
    this.active = { mask, target, sign: Math.sign(ART_PLANES[target].datum) || 1, rim: null };
    mortal.setArtMask(mask, false);
    this.rebuildRim();
  }

  rebuildRim() {
    const a = this.active, host = this.host;
    const stage = host.stages.get(a.target), mortal = host.stages.get('mortal');
    const mortalField = this.fields.get('mortal'), targetField = this.fields.get(a.target);
    a.rim = computeRim({ mask: a.mask, mortalField, targetField, sign: a.sign });
    a.lastRim = performance.now() / 1000;
    const nodes = a.mask.rimNodes;
    a.snap = new Float32Array(nodes.length * 2);
    for (let k = 0; k < nodes.length; k++) { a.snap[k * 2] = mortalField.base(nodes[k]); a.snap[k * 2 + 1] = targetField.base(nodes[k]); }
    targetField.setShoulder(a.rim.rimY, a.rim.rimW);
    stage.markTerrainDirty(a.mask.bbox);
    this.skirt?.setWindow({ mask: a.mask, rim: a.rim, mortalField, targetPlane: a.target, mortalWorld: mortal.world });
  }

  closeWindow() {
    const a = this.active;
    if (!a) { this.skirt?.hide(); return; }
    this.active = null;
    const host = this.host;
    const stage = host.stages.get(a.target), mortal = host.stages.get('mortal');
    const field = this.fields.get(a.target);
    if (field?.hasShoulder) {
      field.clearShoulder();
      stage?.markTerrainDirty(a.mask.bbox);
      // 目标界关窗后被隐藏，Stage.update 不再跑：立即把肩部影响的网格 Y 还原，
      // 不依赖"下次显示时补写"（那是 pending 的兜底，不是契约）。
      stage?.terrain?.update(a.mask.bbox, { height: true });
    }
    mortal?.setArtMask(null, false);
    this.skirt?.hide();
  }

  /**
   * 每帧（各 Stage 更新之后）。凡间的水文侵蚀在正常游玩时一直在改高程，所以墙不能"高程一动就重算"：
   * 只比较边缘节点的 (凡间 M, 目标界 T)，变化超过 RIM_EPS 且距上次重算 ≥ RIM_MIN_INTERVAL 才重算。
   * 代价 O(边缘节点数 ≤ 几百)；重算本身只在越过阈值时发生。
   */
  update() {
    if (!this.enabled || !this.skirt) return;
    const a = this.active, now = performance.now() / 1000;
    if (a) {
      const mortalField = this.fields.get('mortal'), targetField = this.fields.get(a.target);
      const nodes = a.mask.rimNodes, snap = a.snap;
      let drift = 0;
      for (let k = 0; k < nodes.length; k++) {
        const n = nodes[k];
        const dm = Math.abs(mortalField.base(n) - snap[k * 2]), dt = Math.abs(targetField.base(n) - snap[k * 2 + 1]);
        if (dm > drift) drift = dm;
        if (dt > drift) drift = dt;
      }
      if (drift > RIM_EPS && now - a.lastRim >= RIM_MIN_INTERVAL) this.rebuildRim();
    }
    this.skirt.tick(now, this.host.cameraRig?.camera, this.host.height);
  }

  dispose() {
    this.detach();
    this.assets?.dispose(); this.assets = null;
    this.gradientMap?.dispose(); this.gradientMap = null;
  }
}
