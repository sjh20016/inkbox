import { Renderer3D } from './Renderer3D.js';
import { sculpt, strokeSamples } from './terrain/sculpt.js';
import { TERRAIN_INFO } from '../core/config.js';

// DOM/input integration lives here; Sandbox sees only render() and dispose().
export class Render3DAdapter {
  constructor(sandbox) {
    this.sandbox = sandbox; this.active = true; this.mode = 'inspect'; this.radius = 6; this.strength = 0.035;
    this.abort = new AbortController(); this.undoStack = [];
    const stage = sandbox.canvas.parentElement;
    this.canvas = document.createElement('canvas'); this.canvas.id = 'inkCanvas3D';
    this.canvas.setAttribute('aria-label', '立体山河沙盘'); this.canvas.tabIndex = 0;
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none', zIndex: '1' });
    stage.append(this.canvas);
    try { this.renderer = new Renderer3D(this.canvas, sandbox.world); }
    catch (error) { this.canvas.remove(); throw error; }
    this.panel = document.createElement('div'); this.panel.id = 'inkRender3DTools';
    Object.assign(this.panel.style, { position: 'absolute', top: '10px', left: '10px', right: '10px', zIndex: '4', display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center', padding: '7px', background: '#eee5d3ed', border: '1px solid #a99b7d', borderRadius: '6px', fontSize: '12px' });
    this.panel.innerHTML = `<b>山河沙盘 · M1</b><select aria-label="沙盘工具"><option value="inspect">检视</option><option value="raise">抬山</option><option value="lower">压地</option><option value="flatten">平整</option><option value="smooth">平滑</option></select><label>半径 <input aria-label="笔刷半径" type="range" min="1" max="24" value="6" style="width:65px"></label><button data-action="undo">撤销雕刻</button><button data-action="fit">全图</button><button data-action="focus">聚焦选中格</button><button data-action="toggle">切回 Canvas</button><details><summary>操作 / 性能</summary><div data-debug style="position:absolute;top:100%;left:0;background:#eee5d3f5;padding:10px;white-space:pre-line;pointer-events:none"></div></details>`;
    stage.append(this.panel);
    this.readout = document.createElement('div'); this.readout.id = 'inkRender3DReadout';
    Object.assign(this.readout.style, { position: 'absolute', bottom: '12px', left: '12px', zIndex: '3', padding: '6px 10px', background: '#eee5d3eb', borderRadius: '4px', fontSize: '12px', pointerEvents: 'none' });
    stage.append(this.readout);
    this.listen(this.panel.querySelector('select'), 'change', e => { this.endStroke(); this.mode = e.target.value; });
    this.listen(this.panel.querySelector('input'), 'input', e => { this.radius = Number(e.target.value); });
    this.listen(this.panel, 'click', e => {
      const action = e.target.dataset.action;
      if (action === 'toggle') this.setActive(!this.active);
      if (action === 'fit') this.renderer.cameraRig.fit();
      if (action === 'focus' && this.selectedCell) this.renderer.cameraRig.focusOn(this.selectedCell.x, this.selectedCell.y);
      if (action === 'undo') this.undo();
    });
    this.listen(this.canvas, 'contextmenu', e => e.preventDefault());
    this.listen(document.getElementById('inkBtnUndo'), 'click', e => {
      if (this.active) { e.stopImmediatePropagation(); this.undo(); }
    }, true);
    this.listen(this.canvas, 'pointerdown', e => {
      if (e.button !== 0 || e.pointerType === 'touch') return;
      this.canvas.focus(); this.renderer.cameraRig.cancelFocus();
      const hit = this.hit(e);
      if (!hit) return;
      this.selectedCell = { x: hit.x, y: hit.y };
      // M1-D2：无论检视还是雕刻，都在该格地表落一个轻量选中环（纯表现，不进存档）。
      this.renderer.setSelection(hit.x, hit.y);
      if (this.mode === 'inspect') { sandbox.inspectAt(hit.x, hit.y); return; }
      this.canvas.setPointerCapture(e.pointerId);
      this.stroke = { world: sandbox.world, before: new Map(), last: hit.world, targetHeight: sandbox.world.height[hit.y * sandbox.world.w + hit.x], changed: false };
      this.stamp(hit.world); this.lastStamp = performance.now();
    });
    this.listen(this.canvas, 'pointermove', e => {
      this.pointer = { x: e.clientX, y: e.clientY };
      if (!this.stroke) return;
      const hit = this.hit(e);
      if (!hit) { this.stroke.last = null; return; }
      if (this.stroke.last) for (const point of strokeSamples(this.stroke.last, hit.world, this.radius)) this.stamp(point);
      else this.stamp(hit.world);
      this.stroke.last = hit.world; this.lastStamp = performance.now();
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) this.listen(this.canvas, event, () => this.endStroke());
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
    sandbox.camera.focusOn = function (...args) { if (adapter.active) return adapter.renderer.cameraRig.focusOn(...args); return adapter.originalFocus.apply(this, args); };
    sandbox.camera.fit = function (...args) { const result = adapter.originalFit.apply(this, args); if (adapter.active) adapter.renderer.cameraRig.fit(); return result; };
    this.setActive(true); this.resize();
  }
  listen(target, name, fn, capture = false) { target.addEventListener(name, fn, { signal: this.abort.signal, capture }); }
  resize() { const r = this.sandbox.canvas.parentElement.getBoundingClientRect(); this.renderer.resize(Math.max(1, r.width), Math.max(1, r.height)); }
  setActive(active) {
    this.endStroke(); this.active = active; this.lastNow = null;
    this.canvas.hidden = !active; this.readout.hidden = !active;
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
  stamp(point) {
    if (!this.stroke || this.stroke.world !== this.sandbox.world) return;
    const region = sculpt(this.sandbox.world, { ...point, radius: this.radius, strength: this.strength, mode: this.mode, targetHeight: this.stroke.targetHeight });
    if (region) {
      for (const [i, , old] of region.changes) if (!this.stroke.before.has(i)) this.stroke.before.set(i, old);
      this.stroke.changed = true; this.renderer.markTerrainDirty(region); this.sandbox.dirty = true;
    }
  }
  endStroke() {
    if (this.stroke?.changed) {
      const changes = [...this.stroke.before];
      this.undoStack.push({ world: this.stroke.world, changes });
      if (this.undoStack.length > 12) this.undoStack.shift();
    }
    this.stroke = null;
  }
  undo() {
    this.endStroke(); const entry = this.undoStack.pop();
    if (!entry || entry.world !== this.sandbox.world) return;
    for (const [i, value] of entry.changes) entry.world.height[i] = value;
    entry.world.touch(); this.sandbox.dirty = true;
  }
  render(now) {
    if (!this.active) return false;
    const world = this.sandbox.world;
    if (this.renderer.world !== world) { this.stroke = null; this.undoStack = []; this.selectedCell = null; this.renderer.setSelection(null, null); this.renderer.setWorld(world); this.lastNow = null; }
    const dt = this.lastNow == null ? 0 : Math.max(0, now - this.lastNow); this.lastNow = now;
    this.renderer.update(dt);
    const hit = this.pointer ? this.hit({ clientX: this.pointer.x, clientY: this.pointer.y }) : null;
    if (this.stroke && hit && performance.now() - this.lastStamp > 75) { this.stamp(hit.world); this.lastStamp = performance.now(); }
    this.renderer.brush(this.mode === 'inspect' ? null : hit, this.radius);
    const metrics = this.renderer.render();
    const cell = hit || this.selectedCell;
    this.readout.textContent = cell ? `格 ${cell.x}, ${cell.y} · 高程 ${world.height[cell.y * world.w + cell.x].toFixed(4)} · ${TERRAIN_INFO[world.type[cell.y * world.w + cell.x]]?.name || '—'}` : '左键检视 / 雕刻 · 中键旋转 · 右键平移 · 滚轮缩放';
    if (!this.lastDebug || now - this.lastDebug > 0.3) {
      this.lastDebug = now;
      this.panel.querySelector('[data-debug]').textContent = `Q/E 旋转 · F 全图 · Ctrl+Z 撤销雕刻\n左键检视 / 雕刻 · 中键旋转 · 右键平移 · 滚轮缩放\n${metrics.fps.toFixed(1)} FPS · ${metrics.frameMs.toFixed(1)} ms/frame\n${metrics.drawCalls} draws · ${metrics.triangles} triangles\n${metrics.terrainVertices} terrain vertices · ${metrics.treeInstances} trees\n${metrics.entityInstances} entities · ${metrics.houseInstances} buildings · ${metrics.markerInstances} markers\nRaycast ${metrics.lastRaycastMs.toFixed(2)} ms（上次查询） · terrain update ${metrics.terrainUpdateMs.toFixed(2)} ms\nbridge scan ${metrics.scanMs.toFixed(2)} ms · render submit ${metrics.renderMs.toFixed(2)} ms`;
    }
    return true;
  }
  dispose() {
    this.setActive(false); this.abort.abort(); this.resizeObserver.disconnect(); this.renderer.dispose();
    this.sandbox.camera.focusOn = this.originalFocus; this.sandbox.camera.fit = this.originalFit;
    this.canvas.remove(); this.panel.remove(); this.readout.remove();
  }
}
