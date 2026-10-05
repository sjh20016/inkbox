import { Renderer3D } from './Renderer3D.js';
import { ArtDebugPanel } from './art/ArtDebugPanel.js';
import { sculpt, strokeSamples, restoreHeights } from './terrain/sculpt.js';
import { isViewTool } from '../ui/realmView.js';

/**
 * M2-B B4（§63）：界缘检视的文案。
 *
 * ⚠️ **只说中性事实**：哪一界的界缘、此处界差、附近有几道裂缝、这里是不是破口。
 *    不许出现「镇压强度」「泄漏概率」「鬼魂风险 −30%」这类**机制性文案**——
 *    那些机制目前根本不存在（P2 / §63）。界差是**表现读数**，不是封印强度。
 */
export function boundaryInspectorText(hit) {
  if (!hit) return '';
  const name = hit.targetPlane === 'upper' ? '上界界缘' : '幽冥界缘';
  const rifts = hit.nearbyRifts || [];
  const parts = [
    `${name} · 格 ${Math.round(hit.x)}, ${Math.round(hit.y)}`,
    `此处界差 ${hit.rawGap.toFixed(1)}（画出的深度 ${hit.visualDepth.toFixed(1)}）`,
    rifts.length ? `附近裂缝 ${rifts.length} 道` : '附近无裂缝',
  ];
  if (rifts.length) parts.push(hit.breach ? '此处为破口' : '未与界缘相交');
  return parts.join(' · ');
}
import { TERRAIN_INFO } from '../core/config.js';

// DOM/input integration lives here; Sandbox sees only render() and dispose().
export class Render3DAdapter {
  constructor(sandbox) {
    this.sandbox = sandbox; this.active = true; this.mode = 'inspect'; this.radius = 6; this.strength = 0.035;
    // M2-B B2（§54）：垂直表现模式的**调试开关**。`?boundary=strata` 让视觉证据脚本
    // 能在同一 seed / 同一 Region / 同一相机下切换 Raw 与 Strata。正式 UI 不并列它。
    this.boundaryMode = new URLSearchParams(globalThis.location?.search || '').get('boundary') || null;
    this.abort = new AbortController(); this.undoStack = [];
    const stage = sandbox.canvas.parentElement;
    this.canvas = document.createElement('canvas'); this.canvas.id = 'inkCanvas3D';
    this.canvas.setAttribute('aria-label', '立体山河沙盘'); this.canvas.tabIndex = 0;
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none', zIndex: '1' });
    stage.append(this.canvas);
    const artParams = new URLSearchParams(globalThis.location?.search || '');
    const requestedArt = artParams.get('art');
    const artProfile = requestedArt === 'off' ? 'baseline' : requestedArt || 'realm-style-v1';
    try { this.renderer = new Renderer3D(this.canvas, sandbox.world, { artProfile, lodEnabled: artParams.get('lod') !== 'off',
      productionAssets: artParams.get('assets') !== 'off', decorations: artParams.get('decorations') !== 'off',
      geography: artParams.get('geography') !== 'off' && artParams.get('assets') !== 'off' }); }
    catch (error) { this.canvas.remove(); throw error; }
    this.panel = document.createElement('div'); this.panel.id = 'inkRender3DTools';
    Object.assign(this.panel.style, { position: 'absolute', top: '10px', left: '10px', right: '10px', zIndex: '4', display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center', padding: '7px', background: '#eee5d3ed', border: '1px solid #a99b7d', borderRadius: '6px', fontSize: '12px' });
    this.panel.innerHTML = `<b>山河沙盘 · M1</b><select aria-label="沙盘工具"><option value="inspect">检视</option><option value="raise">抬山</option><option value="lower">压地</option><option value="flatten">平整</option><option value="smooth">平滑</option><option value="viewUpper">上界视界</option><option value="viewNether">幽冥视界</option></select><label>半径 <input aria-label="笔刷半径" type="range" min="1" max="24" value="6" style="width:65px"></label><button data-action="undo">撤销雕刻</button><button data-action="fit">全图</button><button data-action="focus">聚焦选中格</button><button data-action="toggle">切回 Canvas</button><details><summary>操作 / 性能</summary><div data-debug style="position:absolute;top:100%;left:0;background:#eee5d3f5;padding:10px;white-space:pre-line;pointer-events:none"></div></details>`;
    stage.append(this.panel);
    this.readout = document.createElement('div'); this.readout.id = 'inkRender3DReadout';
    Object.assign(this.readout.style, { position: 'absolute', bottom: '12px', left: '12px', zIndex: '3', padding: '6px 10px', background: '#eee5d3eb', borderRadius: '4px', fontSize: '12px', pointerEvents: 'none' });
    stage.append(this.readout);
    this.listen(this.panel.querySelector('select'), 'change', e => {
      this.endStroke();
      const next = e.target.value;
      const wasView = isViewTool(this.mode);
      // 离开视界工具 ⇒ 走 Canvas 既有的「切换工具即关窗」出口（关闭路径 ①）。
      if (wasView && !isViewTool(next)) this.sandbox.selectTool('inspect');
      this.mode = next;
      // M2-B B3（§48）：视界是**正式工具**，与 Canvas 工具表共用同一个 toolId ——
      // 目标位面、门控、V7 语义全部由 `viewPlaneForTool` 一处决定。
      if (isViewTool(next)) this.sandbox.selectTool(next);
    });
    this.listen(this.panel.querySelector('input'), 'input', e => { this.radius = Number(e.target.value); });
    this.listen(this.panel, 'click', e => {
      const action = e.target.dataset.action;
      if (action === 'toggle') this.setActive(!this.active);
      if (action === 'fit') this.renderer.cameraRig.fit();
      if (action === 'focus' && this.selectedCell) this.renderer.focusOn(this.selectedCell.x, this.selectedCell.y, {}, this.selectedCell.plane);
      if (action === 'undo') this.undo();
    });
    this.listen(this.canvas, 'contextmenu', e => e.preventDefault());
    this.listen(document.getElementById('inkBtnUndo'), 'click', e => {
      if (this.active) { e.stopImmediatePropagation(); this.undo(); }
    }, true);
    this.listen(this.canvas, 'pointerdown', e => {
      if (e.button !== 0 || e.pointerType === 'touch') return;
      this.canvas.focus(); this.renderer.cameraRig.cancelFocus();
      // ── M2-B B3：正式 3D 划窗（§48–§52）─────────────────────────────
      // 屏幕轨迹**只用于采样**；记下来的一律是 world x/y ⇒ 相机转了也不漂（§51）。
      // 开窗动作仍然只由 `Sandbox.commitSelection` 在 pointerup 一次成型（§49 / S9）。
      if (this.isViewMode()) {
        const hit = this.hitMortal(e);
        if (!hit) return;
        this.canvas.setPointerCapture(e.pointerId);
        this.realmDraw = { path: [[hit.world.x, hit.world.y]], last: hit.world };
        this.renderer.setDraftPath(this.realmDraw.path);
        return;
      }
      const hit = this.hit(e);
      if (!hit) return;
      // M2-B B4（§62/§63）：界缘断面也能被命中，但它**不是**一格的检视对象，
      // 也**不落选择环**——界缘属于「当前这扇窗」，不属于某一位面的某一格。
      if (hit.kind === 'realm-boundary') {
        this.selectedBoundary = hit; this.selectedCell = null;
        this.renderer.setSelection(null, null);
        this.sandbox.notify(boundaryInspectorText(hit), 3600);
        return;
      }
      this.selectedBoundary = null;
      this.selectedCell = { plane: hit.plane, x: hit.x, y: hit.y, kind: hit.kind, settlementId: hit.settlementId,
        entityId: hit.entityId, artifactId: hit.artifactId, siteId: hit.siteId, leylineId: hit.leylineId, riftId: hit.riftId,
        entityContainer: hit.entityContainer,
        houseKey: hit.houseKey, houseX: hit.houseX, houseY: hit.houseY };
      // M1-D2：无论检视还是雕刻，都在该格地表落一个轻量选中环（纯表现，不进存档）。
      this.renderer.setSelection(hit.x, hit.y, hit.plane);
      if (this.mode === 'inspect') {
        if (['entity', 'house', 'settlement', 'artifact', 'site', 'leyline', 'rift'].includes(hit.kind))
          sandbox.inspectPlaneSubject(hit.plane, this.selectedCell);
        else sandbox.inspectPlaneAt(hit.plane, hit.x, hit.y);
        return;
      }
      if (!this.canSculpt(hit)) return;
      this.canvas.setPointerCapture(e.pointerId);
      this.stroke = { plane: 'mortal', world: sandbox.world, before: new Map(), last: hit.world, targetHeight: sandbox.world.height[hit.y * sandbox.world.w + hit.x], changed: false };
      this.stamp(hit.world, hit.plane); this.lastStamp = performance.now();
    });
    this.listen(this.canvas, 'pointermove', e => {
      this.pointer = { x: e.clientX, y: e.clientY };
      if (this.realmDraw) { this.sampleRealmDraw(e); return; }
      if (!this.stroke) return;
      const hit = this.hit(e);
      if (!this.canSculpt(hit)) { this.stroke.last = null; return; }
      if (this.stroke.last) for (const point of strokeSamples(this.stroke.last, hit.world, this.radius)) this.stamp(point, hit.plane);
      else this.stamp(hit.world, hit.plane);
      this.stroke.last = hit.world; this.lastStamp = performance.now();
    });
    // ⚠️ 只有 pointerup 才**提交**；pointercancel / lostpointercapture 一律**取消**
    //    （拖动被打断不该开出一扇玩家没画完的窗）。
    this.listen(this.canvas, 'pointerup', () => { this.commitRealmDraw(); this.endStroke(); });
    for (const event of ['pointercancel', 'lostpointercapture']) this.listen(this.canvas, event, () => this.endStroke());
    this.listen(this.canvas, 'pointerleave', () => { this.pointer = null; this.renderer.brush(null); });
    this.listen(window, 'blur', () => { this.endStroke(); this.pointer = null; });
    this.listen(window, 'keydown', e => {
      if (!this.active || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const key = e.key.toLowerCase();
      if (['q', 'e', 'f'].includes(key) || ((e.ctrlKey || e.metaKey) && key === 'z')) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (key === 'z') this.undo();
        else if (key === 'f') this.renderer.cameraRig.fit();
        else this.renderer.cameraRig.rotate((key === 'q' ? -1 : 1) * Math.PI / 4);
      }
    }, true);
    this.listen(this.canvas, 'webglcontextlost', e => { e.preventDefault(); this.setActive(false); sandbox.notify('3D 图形上下文丢失，已回到 Canvas；恢复后可重新切入。'); });
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(stage);
    this.originalFocus = sandbox.camera.focusOn; this.originalFit = sandbox.camera.fit;
    const adapter = this;
    sandbox.camera.focusOn = function (...args) { if (adapter.active) return adapter.focusMortal(...args); return adapter.originalFocus.apply(this, args); };
    sandbox.camera.fit = function (...args) { const result = adapter.originalFit.apply(this, args); if (adapter.active) adapter.renderer.cameraRig.fit(); return result; };
    this.addPrototypeControls();
    if (artParams.get('artdebug') === '1') this.artDebug = new ArtDebugPanel(this.renderer, stage);
    this.setActive(true); this.resize();
  }
  listen(target, name, fn, capture = false) { target.addEventListener(name, fn, { signal: this.abort.signal, capture }); }
  addPrototypeControls() {
    this.panel.querySelector('b').textContent = '山河沙盘';
    // ⚠️ §54：下面这些是**调试探针**（固定矩形 Mask / Slab / 位面切换），不是玩家功能。
    //    它们被折进一个 details 里与正式工具分开——但**仍留在 DOM 中**，因为
    //    M2-A 的浏览器证据脚本按 `[data-probe]` 与 `[aria-label="调试位面"]` 选取它们。
    const debug = document.createElement('details');
    debug.style.cssText = 'display:inline-block';
    debug.innerHTML = '<summary style="cursor:pointer">调试探针</summary>';
    const controls = document.createElement('span');
    controls.style.cssText = 'display:inline-flex;gap:5px;flex-wrap:wrap;padding-top:4px';
    controls.innerHTML = `<select aria-label="调试位面"><option value="mortal">凡间</option><option value="upper">上界</option><option value="nether">幽冥</option></select><button data-probe="upper">上界 Mask</button><button data-probe="nether">幽冥 Mask</button><button data-probe="close">关窗</button><button data-probe="slab">Slab 20×20</button>`;
    debug.append(controls);
    this.panel.append(debug);
    const select = controls.querySelector('select'); this.planeSelect = select;
    const requested = new URLSearchParams(location.search).get('plane');
    if (requested && this.renderer.setActivePlane(requested)) select.value = requested;
    this.listen(select, 'change', () => { this.endStroke(); this.selectedCell = null; this.renderer.setSelection(null, null); if (!this.renderer.setActivePlane(select.value)) select.value = this.renderer.activePlane; });
    this.listen(controls, 'click', event => {
      const mode = event.target.dataset.probe; if (!mode) return;
      this.endStroke(); this.renderer.setActivePlane('mortal'); select.value = 'mortal';
      if (mode === 'close') { this.sandbox.selection = null; this.sandbox.dirty = true; return; }
      if (mode === 'slab') {
        this.sandbox.selection = null; this.renderer.setRealmViewState(this.sandbox.getRealmViewState());
        this.renderer.setSlabProbe(true); return;
      }
      if (!this.renderer.stages.has(mode)) return;
      const { w, h } = this.sandbox.world;
      const x0 = Math.floor(w * 0.28), x1 = Math.floor(w * 0.72), y0 = Math.floor(h * 0.28), y1 = Math.floor(h * 0.72);
      // Use the established selection and view tool: no second 3D view state.
      this.sandbox.selectTool(mode === 'upper' ? 'viewUpper' : 'viewNether');
      this.sandbox.selection = { x0, y0, x1, y1, area: (x1 - x0) * (y1 - y0), path: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] };
      this.sandbox.dirty = true;
    });
  }
  // Existing faction/person links always refer to mortal subjects. Make that
  // plane visible and use its elevation rather than the current debug stage.
  focusMortal(x, y, options = {}) {
    this.endStroke(); this.sandbox.selection = null; this.sandbox.dirty = true;
    this.renderer.setActivePlane('mortal'); this.planeSelect.value = 'mortal';
    this.renderer.setRealmViewState(this.sandbox.getRealmViewState());
    this.renderer.focusOn(x, y, options, 'mortal');
  }
  resize() { const r = this.sandbox.canvas.parentElement.getBoundingClientRect(); this.renderer.resize(Math.max(1, r.width), Math.max(1, r.height)); }
  setActive(active) {
    this.endStroke(); this.active = active; this.lastNow = null;
    this.canvas.hidden = !active; this.readout.hidden = !active;
    if (this.artDebug) this.artDebug.element.hidden = !active;
    this.sandbox.canvas.style.visibility = active ? 'hidden' : '';
    this.panel.querySelector('[data-action="toggle"]').textContent = active ? '切回 Canvas' : '进入 3D';
    for (const element of this.panel.querySelectorAll('select,input,button:not([data-action="toggle"])')) element.disabled = !active;
    document.querySelector('.rail.left').inert = active;
    document.querySelector('.rail.left').style.opacity = active ? '0.5' : '';
    for (const id of ['inkBrushRange', 'inkBtnRelief', 'inkBtnGrid']) document.getElementById(id).disabled = active;
    document.getElementById('inkHint').style.visibility = active ? 'hidden' : '';
    this.sandbox.pointer.painting = false; this.sandbox.pointer.down = false; this.sandbox.pointer.panning = false;
    this.sandbox.dirty = true;
  }
  hit(e) { const rect = this.canvas.getBoundingClientRect(); return this.renderer.pick(e.clientX - rect.left, e.clientY - rect.top); }
  /** §52：划窗只 raycast **凡间** terrain —— 鼠标经过已经开着的目标界不参与。 */
  hitMortal(e) { const rect = this.canvas.getBoundingClientRect(); return this.renderer.pickPlane(e.clientX - rect.left, e.clientY - rect.top, 'mortal'); }
  isViewMode() { return isViewTool(this.mode); }
  canSculpt(hit) {
    return !this.isViewMode()
      && hit?.plane === 'mortal' && this.renderer.activePlane === 'mortal'
      && !this.renderer.realmPrototype.open && !this.renderer.slabProbe;
  }
  stamp(point, plane) {
    if (plane !== 'mortal' || this.stroke?.plane !== 'mortal' || !this.canSculpt({ plane }) || this.stroke.world !== this.sandbox.world) return;
    const region = sculpt(this.sandbox.world, { ...point, radius: this.radius, strength: this.strength, mode: this.mode, targetHeight: this.stroke.targetHeight });
    if (region) {
      for (const [i, , old] of region.changes) if (!this.stroke.before.has(i)) this.stroke.before.set(i, old);
      this.stroke.changed = true; this.renderer.markTerrainDirty(region); this.sandbox.dirty = true;
    }
  }
  endStroke() {
    // 拖动被打断（pointercancel / 切工具 / 失焦 / 关面板）⇒ 取消未完成的划窗，
    // **不提交**：不该开出一扇玩家没画完的窗。
    this.cancelRealmDraw();
    if (this.stroke?.changed) {
      const changes = [...this.stroke.before];
      this.undoStack.push({ plane: this.stroke.plane, world: this.stroke.world, changes });
      if (this.undoStack.length > 12) this.undoStack.shift();
    }
    this.stroke = null;
  }

  // ── M2-B B3 · 正式 3D 划窗（§48–§52）──────────────────────────────────

  /**
   * 采样一个指针位置，追加到**世界坐标路径**上。
   *
   * §51：屏幕鼠标轨迹只用于**采样**，最终 Region 必须由 world x/y 构成——
   * 相机转动后 Region 不漂移。所以这里每次采样都重新 raycast 凡间地形。
   * 采样点间距小于 0.6 格就丢掉，避免路径被抖动的像素灌满。
   */
  sampleRealmDraw(e) {
    const hit = this.hitMortal(e);
    if (!hit) return;
    const point = hit.world;
    const last = this.realmDraw.last;
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.6) return;
    this.realmDraw.path.push([point.x, point.y]);
    this.realmDraw.last = point;
    this.renderer.setDraftPath(this.realmDraw.path);
  }

  /**
   * pointerup：把世界坐标路径交给 **Canvas 侧唯一提交点**（§49 / S9）。
   *
   * ⚠️ 每次拖拽**只调一次** `commitSelection`——它自己负责 normalizeRegion、
   *    选区、目标位面、`openRifts`、通知与 V7 语义。这里**绝不**自己调 `openRifts`，
   *    也**没有**第二个 3D 选择状态。
   * 退化路径（点一下 / 只划一条线）也照样交出去：`commitSelection` 会用既有的
   *    「点一下 = 收起视界 / 太小 = 拒绝并发声」出口（不许静默）。
   */
  commitRealmDraw() {
    const draw = this.realmDraw;
    if (!draw) return null;
    this.realmDraw = null;
    this.renderer.setDraftPath(null);
    const path = draw.path;
    this.sandbox.commitSelection(path);
    this.sandbox.dirty = true;
    return path;
  }

  cancelRealmDraw() {
    if (!this.realmDraw) return null;
    const path = this.realmDraw.path;
    this.realmDraw = null;
    this.renderer.setDraftPath(null);
    return path;
  }
  undo() {
    this.endStroke();
    if (!this.canSculpt({ plane: this.renderer.activePlane })) return;
    const entry = this.undoStack.pop();
    if (!entry || entry.plane !== 'mortal' || entry.world !== this.sandbox.world) return;
    // ⚠️ 高度还原与 canonical 派生量重算**一起**做（§16）：只还原高度会让 type / qi
    //    停在被雕刻后的值上。写 world.height 的活儿统一留在 `terrain/sculpt.js` 边界里。
    const restored = restoreHeights(entry.world, entry.changes);
    if (restored) this.renderer.markTerrainDirty(restored);
    this.sandbox.dirty = true;
  }
  render(now) {
    if (!this.active) return false;
    const world = this.sandbox.world;
    if (this.renderer.setWorld(world)) { this.stroke = null; this.undoStack = []; this.selectedCell = null; this.lastNow = null; this.planeSelect.value = this.renderer.activePlane; }
    this.renderer.setRealmViewState(this.sandbox.getRealmViewState());
    if (this.boundaryMode) this.renderer.setBoundaryMode(this.boundaryMode);
    this.renderer.setPresentation(this.sandbox.stage);
    const dt = this.lastNow == null ? 0 : Math.max(0, now - this.lastNow); this.lastNow = now;
    this.renderer.update(dt);
    const hit = this.pointer ? this.hit({ clientX: this.pointer.x, clientY: this.pointer.y }) : null;
    if (this.stroke && this.canSculpt(hit) && performance.now() - this.lastStamp > 75) { this.stamp(hit.world, hit.plane); this.lastStamp = performance.now(); }
    this.renderer.brush(this.mode === 'inspect' || !this.canSculpt(hit) ? null : hit, this.radius);
    const metrics = this.renderer.render();
    const cell = hit || this.selectedCell;
    const viewedWorld = this.renderer.stages.get(cell?.plane || this.renderer.activePlane)?.world || world;
    // §63：界缘检视优先显示（它是中性的界差读数，与格子检视互斥）。
    const boundaryText = this.selectedBoundary ? boundaryInspectorText(this.selectedBoundary) : null;
    const village = cell?.kind === 'settlement' ? viewedWorld.villages?.find(v => v.id === cell.settlementId) : null;
    this.readout.textContent = boundaryText || (village ? `聚落 · ${village.name}` : cell && cell.plane
      ? `${cell.plane} · 格 ${cell.x}, ${cell.y} · 高程 ${viewedWorld.height[cell.y * viewedWorld.w + cell.x]?.toFixed(4)} · ${TERRAIN_INFO[viewedWorld.type[cell.y * viewedWorld.w + cell.x]]?.name || '—'}`
      : '左键检视 / 雕刻 · 中键旋转 · 右键平移 · 滚轮缩放');
    if (!this.lastDebug || now - this.lastDebug > 0.3) {
      this.lastDebug = now;
      this.panel.querySelector('[data-debug]').textContent = `Q/E 旋转 · F 全图 · Ctrl+Z 撤销雕刻\n左键检视 / 雕刻 · 中键旋转 · 右键平移 · 滚轮缩放\n${metrics.fps.toFixed(1)} FPS · ${metrics.frameMs.toFixed(1)} ms/frame\n${metrics.drawCalls} draws · ${metrics.triangles} triangles\n${metrics.terrainVertices} terrain vertices · ${metrics.treeInstances} trees\n${metrics.entityInstances} entities · ${metrics.houseInstances} buildings · ${metrics.markerInstances} markers\nRaycast ${metrics.lastRaycastMs.toFixed(2)} ms（上次查询） · render submit ${metrics.renderMs.toFixed(2)} ms\nCPU 更新 ${metrics.layerUpdateMs.toFixed(2)} ms（桥扫描 ${metrics.bridgeScanMs.toFixed(2)} · 地形 ${metrics.terrainUpdateMs.toFixed(2)} · 水 ${metrics.waterUpdateMs.toFixed(2)} · 植被 ${metrics.vegetationUpdateMs.toFixed(2)}）\n实体 ${metrics.entityUpdateMs.toFixed(2)} ms · 建筑 ${metrics.settlementUpdateMs.toFixed(2)} ms · 标记 ${metrics.markerUpdateMs.toFixed(2)} ms`;
      if (metrics.lod) {
        const names = { tree: 'Trees', character: 'Characters', building: 'Buildings' };
        this.panel.querySelector('[data-debug]').textContent += '\n' + Object.entries(metrics.lod).map(([key, value]) =>
          `${names[key]} L0/L1/L2 ${value.lod.join('/')} · ${value.triangles} tris · overflow ${value.overflow} · capacity ${value.capacity}${value.hlod ? ` · HLOD ${value.hlod}` : ''}`).join('\n');
      }
    }
    return true;
  }
  dispose() {
    this.setActive(false); this.artDebug?.dispose(); this.abort.abort(); this.resizeObserver.disconnect(); this.renderer.dispose();
    this.sandbox.camera.focusOn = this.originalFocus; this.sandbox.camera.fit = this.originalFit;
    this.canvas.remove(); this.panel.remove(); this.readout.remove();
  }
}
