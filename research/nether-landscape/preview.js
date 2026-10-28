import { World } from '/src/inkbox/world/World.js';
import { WORLD_PRESETS } from '/src/inkbox/core/config.js';
import { generateNetherWorld } from '/src/inkbox/world/worldgenNether.js';
import { generateNetherLandscape, NETHER_LANDSCAPE_VERSION } from '/src/inkbox/world/netherLandscape.js';
import { NETHER_REGIONS, sampleNetherGeography } from '/src/inkbox/world/netherGeography.js';
import { createNetherTerrainEditor } from '/src/inkbox/world/netherTerrainEdit.js';
import { Render3DHost } from '/src/inkbox/render3d/Render3DHost.js';
import { SHANHAI_OPTIONS } from '/src/inkbox/render3d/shanhai/ShanhaiStyle.js';

const $ = id => document.getElementById(id), canvas = $('scene');
const state = { host: null, world: null, editor: null, frames: [], revision: 0, tour: false, editCount: 0, lastEditMs: 0 };
let last = 0, hudAt = 0, startPointer = null;
function status(text) { $('status').textContent = text; }
function resize() { const r = canvas.parentElement.getBoundingClientRect(); state.host?.resize(Math.max(1, r.width), Math.max(1, r.height)); }
new ResizeObserver(resize).observe(canvas.parentElement);
function applyToggles() {
  const stage = state.host?.stages.get('nether'); if (!stage) return;
  stage.setNetherLandscapeEnabled($('landscape').checked);
  state.host.setSceneryEnabled($('ecology').checked);
  SHANHAI_OPTIONS.lines = $('lines').checked ? 'on' : 'off';
  SHANHAI_OPTIONS.nether = $('inkStyle').value;
  state.host.setArtProfile('shanhai-v1');
}
function regenerate() {
  const seed = Number($('seed').value), preset = WORLD_PRESETS[$('size').value];
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) { status('请输入 0 至 4294967295 的整数种子。'); return; }
  state.editor?.cancel(); state.host?.dispose();
  const candidate = $('version').value === 'candidate';
  const world = (candidate ? generateNetherLandscape : generateNetherWorld)({ preset, seed });
  // The lab hosts the actual nether World. The empty, hidden mortal container
  // supplies the production Host's coordinate and realm ownership contract.
  const root = new World(world.w, world.h, seed); root.plane = 'mortal'; root.nether = world;
  state.world = world;
  state.host = new Render3DHost(canvas, root, { artProfile: 'shanhai-v1', characters: false, creatures: false,
    productionAssets: true, geography: true, lodEnabled: true });
  state.host.setActivePlane('nether'); state.host.setArtProfile('shanhai-v1');
  state.editor = createNetherTerrainEditor(world); state.editCount = 0; state.frames = []; state.revision++;
  state.points = viewpoints(world); resize(); view('whole'); applyToggles();
  $('sceneLabel').textContent = candidate ? '墨骨山河 · 试卷' : '黄泉地脉 · 原卷';
  status(`${preset.label} · 种子 ${seed}。左键单击落笔，可随时回到初卷。`);
}
function viewpoints(world) {
  const points = {}, scores = {};
  for (let y = 8; y < world.h - 8; y += 3) for (let x = 8; x < world.w - 8; x += 3) {
    const g = sampleNetherGeography(world, x, y);
    if (g.water > .0015) continue;
    const score = (g.kind === 'ridge' ? g.height * 3 : g.kind === 'valley' ? g.yin : 1)
      - Math.hypot((x - world.w / 2) / world.w, (y - world.h / 2) / world.h) * .5;
    if (!(g.kind in scores) || score > scores[g.kind]) { scores[g.kind] = score; points[g.kind] = { x, y }; }
  }
  return points;
}
function view(kind) {
  const host = state.host; state.tour = kind === 'tour';
  if (kind === 'whole' || kind === 'tour') { host.cameraRig.fit(); host.cameraRig.scenic(0); return; }
  const p = state.points[kind];
  if (!p) { status(`此种子未找到${NETHER_REGIONS[kind].label}样点，可改种子或画幅。`); return; }
  host.cameraRig.scenic(1); host.cameraRig.camera.zoom = 5.5; host.cameraRig.camera.updateProjectionMatrix();
  host.focusOn(p.x, p.y, { duration: .25 }, 'nether');
  status(`${NETHER_REGIONS[kind].label} · 格 ${p.x}, ${p.y}。景物与阴雾由真实地形和阴气派生。`);
}
function editAt(x, y) {
  const tool = $('tool').value; if (tool === 'inspect') return false;
  const mapped = tool === 'drain' ? 'river' : tool === 'clearYin' ? 'yin' : tool;
  const begin = performance.now();
  const args = { tool: mapped, x, y, radius: Number($('radius').value), strength: tool === 'clearYin' ? -.24 : mapped === 'yin' ? .24 : .055 };
  if (tool === 'drain') args.value = 0;
  if (tool === 'flatten') args.value = state.world.height[Math.floor(y) * state.world.w + Math.floor(x)];
  try {
    const result = state.editor.apply(args); state.lastEditMs = performance.now() - begin; state.editCount += result.changed ? 1 : 0;
    state.lastEdit = { ...result, x, y, tool }; state.revision++;
    status(`已改 ${result.changed} 格 · 安置 ${result.moved} 个落点 · ${state.lastEditMs.toFixed(1)} ms。可撤销或回滚。`);
    return result;
  } catch (error) { status(error.message); return false; }
}
canvas.addEventListener('pointerdown', e => { if (e.button === 0) startPointer = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', e => {
  if (!startPointer || e.button !== 0) return;
  const start = startPointer; startPointer = null;
  if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return;
  const r = canvas.getBoundingClientRect(), hit = state.host.pickPlane(e.clientX - r.left, e.clientY - r.top, 'nether');
  if (hit?.world) editAt(hit.world.x, hit.world.y);
});
canvas.addEventListener('pointercancel', () => { startPointer = null; });
$('generate').addEventListener('submit', e => { e.preventDefault(); regenerate(); });
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => view(b.dataset.view)));
for (const id of ['ecology', 'lines', 'inkStyle']) $(id).addEventListener('change', applyToggles);
$('landscape').addEventListener('change', () => { $('inkStyle').value = $('landscape').checked ? 'brush' : 'line-c'; applyToggles(); });
$('radius').addEventListener('input', () => { $('radiusValue').value = `${$('radius').value} 格`; });
for (const action of ['undo', 'redo']) $(action).addEventListener('click', () => { const ok = state.editor[action](); state.revision++; status(ok ? '已恢复地形、阴气与实体落点。' : '没有可恢复的笔画。'); });
$('cancel').addEventListener('click', () => { state.editor.cancel(); state.editor = createNetherTerrainEditor(state.world); state.editCount = 0; state.revision++; status('已回到初卷；真实地形与落点均已回滚。'); });
$('commit').addEventListener('click', () => { state.editor.commit(); state.editor = createNetherTerrainEditor(state.world); state.editCount = 0; status('试塑已完成并成为本卷的新基线；此图仍仅保留在当前预览。'); });
const percentile = (list, p) => [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(list.length * p))] || 0;
function metrics() {
  const s = state.host.stages.get('nether'), info = state.host.gpu.info;
  return { seed: Number($('seed').value), version: $('version').value, candidateVersion: NETHER_LANDSCAPE_VERSION,
    size: [state.world.w, state.world.h], day: state.world.day, frames: state.frames.length,
    updateP95: percentile(state.frames.map(f => f.update), .95), submitP95: percentile(state.frames.map(f => f.submit), .95),
    rafP95: percentile(state.frames.map(f => f.raf), .95), over50: state.frames.filter(f => f.raf > 50).length,
    draws: info.render.calls, triangles: info.render.triangles, memory: { ...info.memory },
    river: s.netherRiver?.stats, mist: s.netherEcology?.stats, scenery: s.scenery.stats, lines: s.terrainLines?.stats, lastEditMs: state.lastEditMs };
}
function frame(now) {
  const dt = last ? Math.min(.1, (now - last) / 1000) : .016, interval = last ? now - last : 0; last = now;
  const host = state.host;
  if (host) {
    if (state.tour) host.cameraRig.rotate(dt * .10);
    const start = performance.now(); host.update(dt); const updated = performance.now(); host.render();
    state.frames.push({ raf: interval, update: updated - start, submit: performance.now() - updated });
    if (state.frames.length > 180) state.frames.shift();
    if (now - hudAt > 500) { hudAt = now; const m = metrics();
      $('stats').textContent = `${m.size.join('×')} · 第 ${m.day} 日（未推进）\n更新 P95 ${m.updateP95.toFixed(2)} ms\n提交 P95 ${m.submitP95.toFixed(2)} ms\nRAF P95 ${m.rafP95.toFixed(1)} ms\n${m.draws} draws / ${m.triangles} 三角形\n河面 ${m.river?.quads || 0} quads\n阴雾 ${m.mist?.instances || 0} / 24\n画中物 ${m.scenery.records} 个`; }
  }
  requestAnimationFrame(frame);
}
window.netherLab = { state, regenerate, view, editAt, metrics, sampleNetherGeography, applyToggles };
regenerate(); requestAnimationFrame(frame);
