import { WANLING_CATALOG, WANLING_BY_KEY } from '../core/wanlingCatalog.js';
import { liveWanling, WANLING_LIMITS } from '../world/wanlingState.js';
import { wanlingCapacityReason } from '../sim/wanling.js';

const CATEGORY_NAMES = { beast: '山海异兽', herd: '山野群落', spirit: '地灵' };
const HABITATS = { land: '干燥陆地', shore: '水岸浅滩', water: '稳定水域', highland: '山体高地', forest: '茂密林地', qi: '真实灵脉附近' };

// This is UI state on the existing shell. It never belongs to World or a save.
export function selectedWanling(sandbox) {
  return WANLING_BY_KEY.get(sandbox.wanlingForm) || WANLING_CATALOG.find(c => !c.derived);
}
export function placeableWanlings(category = '') {
  return WANLING_CATALOG.filter(c => !c.derived && (!category || c.category === category));
}
export function selectWanlingForm(sandbox, key, { activate = false } = {}) {
  if (!WANLING_BY_KEY.has(key)) return false;
  sandbox.wanlingForm = key;
  if (activate) sandbox.selectTool('beast');
  sandbox.wanlingSelection?.refresh();
  sandbox.wanlingCodex?.syncChoice();
  sandbox.qol?.syncToolState();
  return true;
}
export function wanlingPlacementNotice(sandbox) {
  const world = sandbox.world, choice = selectedWanling(sandbox);
  if (!world) return '请先创造天地';
  if (sandbox.render3d?.active && sandbox.render3d.renderer.activePlane !== 'mortal') return '仅可投放于凡界，请先返回凡界';
  if (choice.derived) return '关系派生，不可独立投放；请另选生灵';
  if (world.wanling?.enabled === false) return '此世界未启用万灵';
  return wanlingCapacityReason(world,choice.key);
}

/** One small selector moves between the Canvas and Three symbol sheets. */
export function createWanlingSelection(sandbox, doc = document) {
  const root = doc.getElementById('inkWanlingQuick');
  if (!root) return null;
  const make = (tag, text) => { const e = doc.createElement(tag); if (text) e.textContent = text; return e; };
  const title = make('strong'), count = make('span'), header = make('div'); header.className = 'wanling-quick-head'; header.append(title, count);
  const categoryLabel = make('label', '生灵类别'), category = make('select'); category.id = 'inkWanlingCategory'; category.setAttribute('aria-label', '生灵类别');
  const all = make('option', '全部生灵'); all.value = ''; category.append(all);
  for (const key of new Set(placeableWanlings().map(c => c.category))) {
    const option = make('option', CATEGORY_NAMES[key] || key); option.value = key; category.append(option);
  }
  categoryLabel.append(category);
  const formLabel = make('label', '当前形态'), form = make('select'); form.id = 'inkWanlingQuickForm'; form.setAttribute('aria-label', '投放生灵形态'); formLabel.append(form);
  const note = make('p'), status = make('p'); note.className = status.className = 'wanling-note'; status.id = 'inkWanlingQuickStatus'; status.setAttribute('role', 'status');
  const ready = make('button', '收匣，点地图投放'); ready.type = 'button'; ready.id = 'inkWanlingReady';
  const choices = make('div'); choices.className = 'wanling-quick-fields'; choices.append(categoryLabel, formLabel);
  root.className = 'wanling-quick'; root.setAttribute('aria-label', '万灵投放快选'); root.replaceChildren(header, choices, note, status, ready);
  sandbox.wanlingForm = selectedWanling(sandbox).key;
  let shownCategory = null;
  function fillForms() {
    if (shownCategory === category.value) return;
    shownCategory = category.value;
    form.replaceChildren();
    const placeholder = make('option', '选择可投放生灵'); placeholder.value = ''; placeholder.disabled = true; form.append(placeholder);
    for (const c of placeableWanlings(category.value)) { const o = make('option', `${c.glyph} · ${c.name}`); o.value = c.key; form.append(o); }
  }
  function refresh() {
    const choice = selectedWanling(sandbox);
    root.hidden = sandbox.toolId !== 'beast';
    if (category.value && choice.category !== category.value) category.value = '';
    fillForms(); form.value = choice.derived ? '' : choice.key;
    title.textContent = `万灵 · ${choice.name}`;
    count.textContent = `${liveWanling(sandbox.world).length}/${WANLING_LIMITS.units}`;
    note.textContent = `栖地：${HABITATS[choice.habitat] || choice.habitat}。${choice.role}。`;
    const reason = wanlingPlacementNotice(sandbox);
    status.textContent = reason || '合上符匣，在已开放的凡界合法栖地单击；一次一个单位，可连续投放。';
    ready.disabled = !!reason;
    const toolState = doc.getElementById('inkToolState');
    if (sandbox.toolId === 'beast' && toolState) toolState.textContent = `万灵 · ${choice.name}｜点选地图投放`;
    const hint = doc.getElementById('inkToolHint');
    if (sandbox.toolId === 'beast' && hint) hint.textContent = `万灵 · ${choice.name} · ${reason || '点选地图投放'}`;
  }
  category.addEventListener('change', () => {
    fillForms();
    const available = placeableWanlings(category.value);
    const current = selectedWanling(sandbox);
    selectWanlingForm(sandbox, available.some(c => c.key === current.key) ? current.key : available[0].key);
  });
  form.addEventListener('change', () => selectWanlingForm(sandbox, form.value));
  ready.addEventListener('click', () => {
    doc.body.dataset.r1Arts = 'closed';
    (sandbox.render3d?.active ? sandbox.render3d.canvas : sandbox.canvas)?.focus({ preventScroll: true });
  });
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation(); doc.body.dataset.r1Arts = 'closed';
    (sandbox.render3d?.active ? sandbox.render3d.canvas : sandbox.canvas)?.focus({ preventScroll: true });
  });
  refresh();
  return { refresh, dispose() { root.replaceChildren(); } };
}
