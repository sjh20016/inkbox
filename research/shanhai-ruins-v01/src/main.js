import { ASSETS } from './ruinsLibrary.js';
import { GalleryViewer, DEFAULT_STATE } from './viewer.js';
import { MODES } from './scenePresets.js';

const $ = selector => document.querySelector(selector);
let viewer, savedState = { ...DEFAULT_STATE }, lastStats = {}, cycles = 0;
const chapters = ['卷一 · 仙门', '卷二 · 人间', '卷三 · 地脉', '卷四 · 幽冥'];
const titles = ['入山见道', '繁华余烬', '灵枢无言', '幽壑遗声'];
const categories = ['仙门山门', '城镇废墟', '灵脉祭坛', '幽冥遗址'];
const descriptions = ['悬瓦、石阶与孤立剑碑，框出入山之径。', '断壁、残梁与旧基，留下人间烟火的余迹。', '缺环围拢古坛，刻痕指向无言的地脉。', '错断石柱与悬空横石，在空缺中留下轮廓。'];
const fields = [
  ['realm', '位面配色', [['mortal', '凡界'], ['upper', '上界'], ['nether', '幽冥']]],
  ['lod', '几何层级', [['auto', '自动'], ['0', 'LOD0'], ['1', 'LOD1'], ['2', 'LOD2']]],
  ['style', '表现方式', [['flat', '平涂'], ['toon', '三渲二'], ['solid', '实体'], ['ink', '线刻']]],
  ['light', '受光方向', [['0', '左前'], ['1', '右前'], ['2', '逆光']]],
];
$('#assets').innerHTML = ASSETS.map((asset, index) => `<button class="asset-tab" data-asset="${asset.id}"><b>0${index + 1}</b><span>${categories[index]}</span><small>—</small></button>`).join('');
$('#modes').innerHTML = MODES.map(mode => `<button data-mode="${mode.id}"><span class="icon" aria-hidden="true">${mode.icon}</span>${mode.label}</button>`).join('');
$('#controls').innerHTML = fields.map(([key, label, values]) => `<div class="control"><label>${label}</label><div class="button-row" role="group" aria-label="${label}">${values.map(([value, name]) => `<button data-key="${key}" data-value="${value}">${name}</button>`).join('')}</div></div>`).join('') + `
  <div class="control"><label for="variant">遗构状态</label><select id="variant"></select></div>
  <div class="control"><label for="camera">镜头方位</label><select id="camera"><option value="oblique">斜俯 · 三分之侧</option><option value="front">正面</option><option value="side">侧面</option><option value="back">背面</option><option value="top">顶视</option></select></div>
  <div class="checkbox-row"><label><input id="outline" type="checkbox" checked> 几何勾线</label><label for="count">压力实例</label><select id="count" aria-label="压力实例数量"><option value="1">1</option><option value="32" selected>32</option><option value="128">128</option></select></div>`;

function syncUI(state) {
  savedState = { ...state };
  const index = ASSETS.findIndex(asset => asset.id === state.asset), asset = ASSETS[index];
  $('#asset-number').textContent = chapters[index]; $('#asset-title').textContent = titles[index];
  $('#asset-description').textContent = descriptions[index];
  const variant = $('#variant');
  if (variant.dataset.asset !== asset.id) { variant.innerHTML = asset.states.map(item => `<option value="${item.id}">${item.label}</option>`).join(''); variant.dataset.asset = asset.id; }
  variant.value = state.variant; variant.disabled = asset.states.length === 1;
  $('#camera').value = state.camera; $('#outline').checked = state.outline; $('#count').value = state.count;
  $('#count').disabled = state.mode !== 'stress';
  document.querySelectorAll('[data-key]').forEach(button => button.setAttribute('aria-pressed', String(state[button.dataset.key]) === button.dataset.value));
  document.querySelectorAll('[data-asset]').forEach(button => button.setAttribute('aria-pressed', state.asset === button.dataset.asset));
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', state.mode === button.dataset.mode));
  $('#scene-hint').textContent = MODES.find(mode => mode.id === state.mode)?.hint || (state.mode === 'comparison' ? '同一镜头、同一几何，比较四种表现。' : '四组资产共享同一尺度。');
  const labels = $('#comparison-labels'); labels.hidden = !['comparison', 'overview'].includes(state.mode);
  labels.innerHTML = (state.mode === 'comparison' ? ['平涂', '三渲二', '实体', '线刻'] : ASSETS.map(item => item.name)).map(name => `<span>${name}</span>`).join('');
  $('#load').disabled = state.loaded && !viewer?.disposed; $('#unload').disabled = !state.loaded || Boolean(viewer?.disposed);
  $('#lifecycle').textContent = `${state.loaded ? '资源已加载' : '资源已释放'} · 已完成 ${cycles} 次重建`;
}
const format = value => Number(value || 0).toLocaleString('en-US');
function showStats(stats) {
  lastStats = stats;
  const rows = [
    ['资产三角面 / 实例', `${format(stats.assetTriangles)} / ${format(stats.instances)}`],
    ['实际层级', `LOD${stats.lod ?? 0}${savedState.lod === 'auto' ? ' · 自动' : ''}`],
    ['画面三角面 / 线段', `${format(stats.triangles)} / ${format(stats.lines)}`],
    ['绘制调用', format(stats.draws)],
    ['GPU 驻留几何 / 纹理数', `${format(stats.geometries)} / ${format(stats.textures)}`],
    ['资产缓冲 (CPU)', `${((stats.library?.geometryBytes || 0) / 1024).toFixed(1)} KiB`],
    ['几何准备 CPU', `${(stats.geometryCPUms || 0).toFixed(2)} ms`],
    ['矩阵准备 CPU', `${(stats.matrixCPUms || 0).toFixed(2)} ms`],
    ['上次 render 提交 CPU', `${(stats.renderCPUms || 0).toFixed(2)} ms`],
    ['最近 RAF 间隔', `${(stats.rafIntervalMs || 0).toFixed(1)} ms`],
    ['场景重建次数', format(stats.builds)],
  ];
  $('#stats').innerHTML = rows.map(([name, value]) => `<dt>${name}</dt><dd><strong>${value}</strong></dd>`).join('');
}
function update(event) {
  if (event.state) syncUI(event.state);
  if (event.stats) showStats(event.stats);
  if ('message' in event) $('#notice').textContent = event.message;
}
function init(state = savedState) {
  if (viewer && !viewer.disposed) return viewer;
  try { viewer = new GalleryViewer($('#viewport'), state, update); syncUI(viewer.getState()); $('#notice').textContent = ''; }
  catch (error) { $('#notice').textContent = `展厅加载失败：${error.message}`; console.error(error); throw error; }
  return viewer;
}
function setState(patch) {
  if (viewer?.disposed) init({ ...savedState, ...patch });
  return viewer.setState(patch);
}
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.asset) { const asset = ASSETS.find(item => item.id === button.dataset.asset); setState({ asset: asset.id, variant: asset.states[0].id, realm: asset.defaultRealm }); }
  else if (button.dataset.mode) setState({ mode: button.dataset.mode });
  else if (button.dataset.key) setState({ [button.dataset.key]: button.dataset.value });
});
$('#variant').addEventListener('change', event => setState({ variant: event.target.value }));
$('#camera').addEventListener('change', event => setState({ camera: event.target.value }));
$('#count').addEventListener('change', event => setState({ count: Number(event.target.value) }));
$('#outline').addEventListener('change', event => setState({ outline: event.target.checked }));
$('#reset').addEventListener('click', () => { if (!viewer?.disposed) viewer.resetCamera(); });
$('#unload').addEventListener('click', () => setState({ loaded: false }));
$('#load').addEventListener('click', () => setState({ loaded: true }));
$('#cycle').addEventListener('click', () => { const state = viewer.getState(); viewer.dispose(); cycles++; init({ ...state, loaded: true }); });
window.shanhaiGallery = {
  setState, getState: () => viewer?.getState() || { ...savedState }, getStats: () => viewer?.getStats() || lastStats,
  resetCamera: () => viewer?.resetCamera(),
  dispose: () => { const result = viewer?.dispose(); $('#notice').textContent = '展厅已销毁 · 点击重新加载恢复'; $('#load').disabled = false; $('#unload').disabled = true; return result; },
  init: () => init({ ...savedState, loaded: true }),
};
window.addEventListener('pagehide', () => viewer?.dispose());
window.addEventListener('pageshow', event => { if (event.persisted) init(); });
init();
