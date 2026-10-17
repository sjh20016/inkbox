// 卜算子 · 三维形象小窗（独立 WebGLRenderer 的 DOM 模态层）
//
// 设计约束（来自 A1_TEAM.md §3.2 / 委托书 §五）：
//   · **首开按需加载**：游戏启动时不加载 three / GLB，玩家第一次点面板上的肖像入口
//     才动态 import 本文件并拉取模型；在此之前零显存占用。
//   · **独立渲染器**：不复用主地图的 Renderer3D（3D 模式下两者同时活着）。
//     关闭时 renderer.dispose() + forceContextLoss()，DOM 与 canvas 一起移除；
//     换世界 / pagehide 也走 close()，不留第二个 WebGL 上下文。
//   · **加载失败不阻断游戏**：只在弹窗里说一句、并通知外层，游戏照常跑。
//   · **动画**：Idle / Walk / Wind 三选一，AnimationMixer + crossFade；
//     「风起」是**可演示的风起**（Wind 片段 + 2.75s 后自动淡回 Idle）——
//     仓库里没有风力事实，所以不伪造天气/风级机制。
//   · 关闭路径：✕ 按钮 / 点遮罩 / Esc（捕获阶段先吃掉，不传给游戏的 Escape 分层）。
//
// 资产：`assets/characters/busanzi/`；加载/材质/规格见 BusanziLibrary.js。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BUSANZI_CLIP_NAMES, loadBusanziLibrary } from './BusanziLibrary.js';

const STYLE_ID = 'inkboxBusanziViewerStyles';
const CLIP_LABELS = Object.freeze({ Idle: '静立', Walk: '行步', Wind: '风起' });
const CAPTIONS = Object.freeze({
  Idle: '井边静立。符纸垂着，只露一角赭红的离卦。',
  Walk: '沿井三步。衣摆与符纸跟着步子轻轻晃。',
  Wind: '风起——符纸被卷到一侧，头发、衣摆、袖片与铃一起动。风停自回静立。',
});
const STYLES = `
  .busanzi-viewer{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:18px;font-family:var(--serif,"Noto Serif SC","Songti SC","SimSun",serif);color:#22201c}
  .busanzi-viewer[hidden]{display:none!important}
  .busanzi-viewer .bv-backdrop{position:absolute;inset:0;background:rgba(34,32,28,.42);backdrop-filter:blur(2px)}
  .busanzi-viewer .bv-card{position:relative;width:min(520px,94vw);max-height:92vh;display:flex;flex-direction:column;background:linear-gradient(170deg,#efe8d8,#e2d8c2);border:1px solid rgba(34,32,28,.34);border-radius:8px;box-shadow:0 14px 42px rgba(40,32,20,.32);overflow:hidden}
  .busanzi-viewer .bv-head{display:flex;align-items:flex-start;gap:12px;padding:12px 16px 9px;border-bottom:1px solid rgba(34,32,28,.14);background:rgba(255,255,255,.32)}
  .busanzi-viewer .bv-eyebrow{font-size:10px;letter-spacing:3px;color:#7d776b}
  .busanzi-viewer h2{margin:1px 0 0;font-size:17px;letter-spacing:3px;font-weight:700}
  .busanzi-viewer .bv-close{margin-left:auto;border:1px solid rgba(34,32,28,.26);background:rgba(255,255,255,.4);color:#4a463e;border-radius:4px;font:inherit;font-size:15px;line-height:1;padding:3px 8px;cursor:pointer}
  .busanzi-viewer .bv-close:hover{background:rgba(255,255,255,.8)}
  .busanzi-viewer .bv-stage{position:relative;flex:1 1 auto;min-height:300px;height:clamp(300px,52vh,520px);background:radial-gradient(circle at 50% 30%,#f4eee0 0%,#e6dcc8 62%,#d9ceb6 100%)}
  .busanzi-viewer .bv-stage canvas{display:block;width:100%;height:100%;touch-action:none}
  .busanzi-viewer .bv-loading,.busanzi-viewer .bv-error{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;text-align:center;padding:22px;font-size:12.5px;line-height:1.8;color:#4a463e;background:rgba(239,232,216,.86)}
  .busanzi-viewer .bv-loading[hidden],.busanzi-viewer .bv-error[hidden]{display:none}
  .busanzi-viewer .bv-error b{color:#a8493c;letter-spacing:2px}
  .busanzi-viewer .bv-retry{border:1px solid rgba(34,32,28,.3);background:rgba(255,255,255,.5);border-radius:4px;font:inherit;font-size:12px;padding:4px 12px;cursor:pointer}
  .busanzi-viewer .bv-caption{position:absolute;left:12px;right:12px;bottom:10px;margin:0;font-size:11.5px;line-height:1.7;color:#5e574a;background:rgba(244,238,224,.82);border:1px solid rgba(34,32,28,.12);border-radius:4px;padding:5px 9px;pointer-events:none}
  .busanzi-viewer .bv-hint{position:absolute;right:12px;top:10px;font-size:10.5px;letter-spacing:1px;color:#7d776b;background:rgba(244,238,224,.7);border-radius:3px;padding:2px 7px;pointer-events:none}
  .busanzi-viewer .bv-bar{display:flex;align-items:center;gap:8px;padding:10px 16px 12px;border-top:1px solid rgba(34,32,28,.14);background:rgba(255,255,255,.28)}
  .busanzi-viewer .bv-bar button{border:1px solid rgba(34,32,28,.24);background:#e7dfcf;color:#4a463e;border-radius:4px;font:inherit;font-size:12px;letter-spacing:2px;padding:5px 14px;cursor:pointer}
  .busanzi-viewer .bv-bar button:hover{background:#f0e9db}
  .busanzi-viewer .bv-bar button[aria-pressed="true"]{background:#3d4a3f;border-color:#3d4a3f;color:#f3efe4}
  .busanzi-viewer .bv-bar button:disabled{opacity:.45;cursor:progress}
  .busanzi-viewer .bv-status{margin-left:auto;font-size:11px;color:#7d776b;letter-spacing:1px;font-variant-numeric:tabular-nums}
  @media(max-width:560px){.busanzi-viewer .bv-card{width:96vw}.busanzi-viewer .bv-bar{flex-wrap:wrap}.busanzi-viewer .bv-status{width:100%;margin-left:0}}
`;

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.append(style);
}

function angleBetween(a, b) {
  const dot = Math.min(1, Math.max(-1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));
  return 2 * Math.acos(dot);
}

/** 一块软阴影贴片：把「悬空的 3D 角色」压回纸面。 */
function createContactShadow() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.06, size / 2, size / 2, size * 0.5);
  gradient.addColorStop(0, 'rgba(60,50,34,0.42)');
  gradient.addColorStop(0.55, 'rgba(60,50,34,0.16)');
  gradient.addColorStop(1, 'rgba(60,50,34,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.28, 1.28),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.004;
  mesh.renderOrder = 1;
  return mesh;
}

export class BusanziViewer {
  constructor({ onError } = {}) {
    this.onError = typeof onError === 'function' ? onError : null;
    this.opened = false;
    this.loading = false;
    this.ready = false;
    this.disposed = false;
    this.error = null;
    this.activeClip = null;
    this.library = null;
    this.mixer = null;
    this.actions = new Map();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.root = null;
    this.canvas = null;
    this.stage = null;
    this.holdTimer = 0;
    this.rafId = 0;
    this.lastFrame = 0;
    this.pending = null;
    this.savedFocus = null;
    this.resizeObserver = null;
    this.resizeBound = null;
    this.loadToken = 0;
    this.windHoldMs = 2750;
    this.rafLoop = this.rafLoop.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onPageHide = () => this.dispose();
    window.addEventListener('pagehide', this.onPageHide);
  }

  get state() {
    return {
      opened: this.opened,
      loading: this.loading,
      ready: this.ready,
      activeClip: this.activeClip,
      error: this.error,
      clips: [...BUSANZI_CLIP_NAMES],
    };
  }

  /** DOM 侧的可读探针 API（与 lab 的 probe 同构，验收脚本用）。 */
  probe(names = []) {
    if (!this.library) throw new Error('Busanzi viewer is not loaded');
    this.library.scene.updateMatrixWorld(true);
    const out = {};
    for (const name of names) {
      const bone = this.library.skeleton.bones.find((item) => item.name === name);
      if (!bone) throw new Error(`Unknown busanzi bone: ${name}`);
      out[name] = {
        quaternion: bone.getWorldQuaternion(new THREE.Quaternion()).toArray(),
        position: bone.getWorldPosition(new THREE.Vector3()).toArray(),
      };
    }
    return out;
  }

  /** 运行时统计（验收用；renderer.info 是独立 renderer 的，不混进主地图读数）。 */
  metrics() {
    if (!this.renderer) return { opened: this.opened, ready: this.ready, error: this.error, disposed: this.disposed };
    const gl = this.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      opened: this.opened,
      ready: this.ready,
      activeClip: this.activeClip,
      mixerRunning: Boolean(this.mixer) && [...this.actions.values()].some((action) => action.isRunning()),
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      contextLost: gl.isContextLost(),
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      size: [this.canvas?.clientWidth ?? 0, this.canvas?.clientHeight ?? 0],
    };
  }

  /** 打开（幂等）：首次调用才 mount DOM / 加载 GLB / 建独立 renderer。 */
  async open() {
    if (this.disposed) throw new Error('Busanzi viewer has been disposed');
    if (this.opened && this.ready) return true;
    if (this.pending) return this.pending;
    this.pending = this.openInternal().finally(() => { this.pending = null; });
    return this.pending;
  }

  async openInternal() {
    if (!this.root) this.mount();
    const token = ++this.loadToken;
    this.error = null;
    this.loading = true;
    this.opened = true;
    this.root.hidden = false;
    this.showLoading(true);
    this.showError(null);
    try {
      if (!this.library) this.library = await loadBusanziLibrary();
      // 加载期间被关闭 / 被重开：这一份结果作废，资源立刻还回去。
      if (this.disposed || token !== this.loadToken || !this.opened) {
        this.library?.dispose?.();
        this.library = null;
        return false;
      }
      this.buildScene();
      this.ready = true;
      this.loading = false;
      this.showLoading(false);
      this.playClip('Idle', { initial: true });
      this.startLoop();
      return true;
    } catch (error) {
      if (token !== this.loadToken || !this.opened) return false;
      // 失败只报错：弹窗留着一条可读原因 + 重试；游戏主体不受影响。
      this.error = error?.message || String(error);
      this.loading = false;
      this.ready = false;
      this.showLoading(false);
      this.showError(this.error);
      console.error('[inkbox] 卜算子三维形象加载失败', error);
      try { this.onError?.(`卜算子形象加载失败：${this.error}`); } catch { /* 通知失败不影响游戏 */ }
      return false;
    }
  }

  /** 切动画；未打开时先打开。返回当前片段名（失败返回 false）。 */
  async play(name) {
    if (!BUSANZI_CLIP_NAMES.includes(name)) throw new Error(`Unknown busanzi clip: ${name}`);
    if (!this.opened) {
      const ok = await this.open();
      if (!ok) return false;
    }
    return this.playClip(name) ? name : false;
  }

  playClip(name, { initial = false } = {}) {
    if (!this.mixer || !this.ready) return false;
    const next = this.actions.get(name);
    if (!next) return false;
    const previous = this.activeClip ? this.actions.get(this.activeClip) : null;
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.play();
    if (previous && previous !== next) previous.crossFadeTo(next, initial ? 0.01 : 0.24, false);
    this.activeClip = name;
    this.clearHold();
    // 「风起」是可演示的风起：放一遍多（约 2.75s）就淡回静立，不假装有风力系统。
    if (name === 'Wind') {
      this.holdTimer = setTimeout(() => {
        if (this.opened && this.ready) this.playClip('Idle');
      }, this.windHoldMs);
    }
    this.updateBar();
    return true;
  }

  // ── DOM ──────────────────────────────────────────────────────────
  mount() {
    ensureStyles();
    this.savedFocus = typeof document !== 'undefined' ? document.activeElement : null;
    const root = document.createElement('div');
    root.className = 'busanzi-viewer';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '卜算子 · 观其真形');
    root.innerHTML = `
      <div class="bv-backdrop" data-close="backdrop"></div>
      <div class="bv-card">
        <header class="bv-head">
          <div>
            <div class="bv-eyebrow">天道引路人 · 井外生客</div>
            <h2>卜算子 · 观其真形</h2>
          </div>
          <button type="button" class="bv-close" aria-label="关闭卜算子形象">✕</button>
        </header>
        <div class="bv-stage">
          <div class="bv-loading">正在请她入画…</div>
          <div class="bv-error" hidden><b>形象未能入画</b><span class="bv-error-text"></span><button type="button" class="bv-retry">再试一次</button></div>
          <span class="bv-hint">拖动旋转 · 滚轮远近</span>
          <p class="bv-caption">${CAPTIONS.Idle}</p>
        </div>
        <footer class="bv-bar">
          ${BUSANZI_CLIP_NAMES.map((name) => `<button type="button" data-clip="${name}" aria-pressed="${name === 'Idle' ? 'true' : 'false'}">${CLIP_LABELS[name]} ${name}</button>`).join('')}
          <span class="bv-status">Idle</span>
        </footer>
      </div>`;
    document.body.append(root);
    this.root = root;
    this.stage = root.querySelector('.bv-stage');
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', '卜算子三维模型');
    this.stage.prepend(this.canvas);
    root.querySelector('.bv-close').addEventListener('click', () => this.close());
    root.querySelector('[data-close="backdrop"]').addEventListener('click', () => this.close());
    root.querySelector('.bv-retry').addEventListener('click', () => {
      const error = this.error;
      this.close();
      void this.open().catch((reason) => console.error('[inkbox] 卜算子形象重试失败', reason, error));
    });
    for (const button of root.querySelectorAll('[data-clip]')) {
      button.addEventListener('click', () => { void this.play(button.dataset.clip); });
    }
    document.addEventListener('keydown', this.onKeyDown, true);
    root.querySelector('.bv-close').focus?.();
  }

  onKeyDown(event) {
    if (!this.opened) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  showLoading(visible) {
    const node = this.root?.querySelector('.bv-loading');
    if (node) node.hidden = !visible;
  }

  showError(message) {
    const box = this.root?.querySelector('.bv-error');
    if (!box) return;
    box.hidden = !message;
    const text = box.querySelector('.bv-error-text');
    if (text) text.textContent = message || '';
  }

  updateBar() {
    if (!this.root) return;
    for (const button of this.root.querySelectorAll('[data-clip]')) {
      button.setAttribute('aria-pressed', String(button.dataset.clip === this.activeClip));
      button.disabled = !this.ready;
    }
    const status = this.root.querySelector('.bv-status');
    if (status) status.textContent = this.ready ? `${this.activeClip} · ${CLIP_LABELS[this.activeClip] || ''}` : '未就绪';
    const caption = this.root.querySelector('.bv-caption');
    if (caption) caption.textContent = CAPTIONS[this.activeClip] || CAPTIONS.Idle;
  }

  // ── three.js 场景（每次打开重建，关闭销毁）─────────────────────────
  buildScene() {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff6e6', '#6a6455', 2.15));
    const key = new THREE.DirectionalLight('#fff1dc', 2.25);
    key.position.set(-3.4, 6.2, 4.8); scene.add(key);
    const fill = new THREE.DirectionalLight('#a9bccf', 0.85);
    fill.position.set(4.2, 2.6, 3.2); scene.add(fill);
    const rim = new THREE.DirectionalLight('#ffe0ab', 0.7);
    rim.position.set(0.8, 3.4, -5.2); scene.add(rim);
    scene.add(createContactShadow());
    scene.add(this.library.scene);

    const bounds = this.library.getBounds();
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 100);
    const fitHeight = Math.max(size.y * 1.28, 1.7);
    const distance = fitHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.set(center.x + size.y * 0.36, center.y + size.y * 0.1, center.z + distance);
    camera.lookAt(center.x, center.y * 0.94, center.z);

    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    const controls = new OrbitControls(camera, this.canvas);
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.minDistance = Math.max(0.9, size.y * 0.55);
    controls.maxDistance = Math.max(3, size.y * 2.4);
    controls.maxPolarAngle = Math.PI / 2.02;
    controls.target.set(center.x, center.y * 0.94, center.z);
    controls.update();

    const mixer = new THREE.AnimationMixer(this.library.scene);
    const actions = new Map();
    for (const name of BUSANZI_CLIP_NAMES) {
      const action = mixer.clipAction(this.library.clip(name));
      action.setLoop(THREE.LoopRepeat, Infinity);
      actions.set(name, action);
    }

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;
    this.mixer = mixer;
    this.actions = actions;
    this.activeClip = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage);
    window.addEventListener('resize', this.resizeBound = () => this.resize());
    this.resize();
    renderer.render(scene, camera);
    this.updateBar();
  }

  resize() {
    if (!this.renderer || !this.stage) return;
    const box = this.stage.getBoundingClientRect();
    const width = Math.max(1, Math.floor(box.width));
    const height = Math.max(1, Math.floor(box.height));
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (!this.opened) return;
    this.renderer.render(this.scene, this.camera);
  }

  startLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.lastFrame = 0;
    this.rafId = requestAnimationFrame(this.rafLoop);
  }

  rafLoop(now) {
    if (!this.opened || !this.renderer) { this.rafId = 0; return; }
    const delta = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.1) : 0;
    this.lastFrame = now;
    this.mixer?.update(delta);
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.rafLoop);
  }

  clearHold() {
    if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = 0; }
  }

  /** 关窗：动画/渲染器/几何/材质/贴图/DOM 全部还回去。可以重复调用。 */
  close() {
    this.loadToken += 1;
    this.clearHold();
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.library?.scene ?? this.mixer.getRoot()); }
    this.actions?.clear();
    this.actions = new Map();
    this.mixer = null;
    this.controls?.dispose();
    this.controls = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeBound) { window.removeEventListener('resize', this.resizeBound); this.resizeBound = null; }
    // 场景里的灯光/阴影贴片是本模块建的；library.scene 由 library.dispose 释放。
    if (this.scene) {
      for (const child of [...this.scene.children]) {
        if (child === this.library?.scene) continue;
        child.traverse?.((node) => {
          if (node.isMesh) {
            node.geometry?.dispose();
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            for (const material of materials) {
              if (!material) continue;
              material.map?.dispose();
              material.dispose();
            }
          }
        });
      }
      this.scene.remove(this.library?.scene);
      this.scene.clear?.();
    }
    this.scene = null;
    this.camera = null;
    if (this.renderer) {
      this.renderer.dispose();
      try { this.renderer.forceContextLoss(); } catch { /* 上下文已丢 */ }
      this.renderer = null;
    }
    this.library?.dispose?.();
    this.library = null;
    this.ready = false;
    this.loading = false;
    this.opened = false;
    this.activeClip = null;
    this.error = null;
    if (this.root) {
      this.root.remove();
      this.root = null;
    }
    this.canvas = null;
    this.stage = null;
    document.removeEventListener('keydown', this.onKeyDown, true);
    try { this.savedFocus?.focus?.({ preventScroll: true }); } catch { /* 焦点元素可能已不在 */ }
    this.savedFocus = null;
    window.dispatchEvent(new CustomEvent('inkbox:busanzi-viewer-closed'));
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.close();
    this.disposed = true;
    window.removeEventListener('pagehide', this.onPageHide);
  }
}

export { angleBetween, CLIP_LABELS, CAPTIONS };
