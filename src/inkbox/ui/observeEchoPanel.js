// One bounded UI projection of existing settlement facts. Only the model owns
// persistent focus and marks; this module never advances simulation or RNG.
import { canAccess } from '../core/mapAccess.js';
import { settlementCondition } from '../world/settlementState.js';
import { settlementRuinMarkerId } from '../world/settlementIdentity.js';
import { readObserveEcho, focusSettlement, clearSettlementFocus, resolveObservedSettlement,
  settlementRevisit, markRevisit } from '../sim/observeEcho.js';

const STATES = { normal: '○ 正常', disaster: '！受灾', damaged: '！受灾', recovering: '↗ 恢复', declining: '↓ 衰弱', ruins: '◇ 遗址', ruin: '◇ 遗址' };
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const n = value => Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '未知';
const when = day => Number.isFinite(day) ? `第 ${Math.floor(day / 360) + 1} 年 ${Math.floor((day % 360) / 30) + 1} 月` : '日期未知';
const state = value => STATES[value] || '状态未知';
const signed = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${n(value)}` : '未保留';
const summary = s => s ? `${state(s.status)} · 人口 ${n(s.pop)} · 粮 ${n(s.food)} · 可用屋 ${n(s.houses)}` : '原身份详录未保留';

export function createObserveEchoPanel(sandbox, doc = document) {
  const shelf = doc.getElementById('inkObserveEcho');
  const stage = doc.querySelector('.stage');
  if (!shelf || !stage) return null;
  const layer = doc.createElement('div'); layer.className = 'e0-map-marks'; layer.setAttribute('aria-label', '聚落处境标记'); stage.append(layer);
  let world = null, candidates = [], signature = '', selectedMark = null;
  let lastRefreshTime = -Infinity, wasVisible = false;
  const nodes = [], openDetails = new Set();
  const visible = place => place && canAccess(sandbox.world, place.x, place.y);
  function dirty() { sandbox.qol?.markDirty('terrain'); sandbox.settlementInspectionSignature = null; }
  function locate(id) {
    if (world !== sandbox.world) { refresh(); return; }
    const current = resolveObservedSettlement(sandbox.world, id), place = current.settlement;
    if (!place) { sandbox.notify('原聚落身份的详录已不在当前世界。'); return; }
    if (!visible(place)) { sandbox.notify('这处旧址尚在已开放山河之外。'); return; }
    sandbox.camera.focusOn(place.x, place.y, { zoom: Math.max(sandbox.camera.zoom, 7), duration: 0.75 });
    sandbox.selected = { x: Math.floor(place.x), y: Math.floor(place.y) };
    sandbox.inspectPlaneSubject('mortal', current.kind === 'ruin'
      ? { kind: 'site', siteId: settlementRuinMarkerId(place.id) }
      : { kind: 'settlement', settlementId: place.id });
    if (doc.getElementById('inkExperienceOpen')?.getAttribute('aria-expanded') === 'true') doc.getElementById('inkExperienceClose')?.click();
  }
  function watch(id) {
    if (!focusSettlement(sandbox.world, id)) { sandbox.notify('未找到这座聚落的原身份。'); return; }
    dirty(); refresh(); sandbox.notify('已记挂这处地方。岁月之后，可从「聚落 · 回声」回来。');
  }
  function click(event) {
    const b = event.target.closest('[data-e0-action]'); if (!b) return;
    if (world !== sandbox.world) { refresh(); return; }
    const id = Number(b.dataset.id);
    if (b.dataset.e0Action === 'locate') locate(id);
    if (b.dataset.e0Action === 'watch') watch(id);
    if (b.dataset.e0Action === 'clear') { clearSettlementFocus(sandbox.world); dirty(); refresh(); }
    if (b.dataset.e0Action === 'mark') { selectedMark = b.dataset.mark; signature = ''; refresh(); }
  }
  shelf.addEventListener('click', click);
  shelf.addEventListener('toggle', event => {
    const key = event.target.dataset.e0Detail; if (!key) return;
    if (event.target.open) { openDetails.add(key); refresh(); } else openDetails.delete(key);
  }, true);
  function button(action, label, id) { return `<button type="button" data-e0-action="${action}" data-id="${esc(id)}">${esc(label)}</button>`; }
  function revisitHtml(result, baseline) {
    const now = result.current.settlement, changes = result.changes || {}, aid = result.aidDelta || {};
    const history = result.history || {};
    const crises = now ? (sandbox.world.worldEventState?.activeCrises || []).filter(c => c.villageId === now.id && c.status === 'active').length : null;
    return `<p class="e0-note">当时：${esc(summary(baseline))}</p><p>现在：${esc(summary(now))}</p>`
      + `<p>人口 ${signed(changes.pop)} · 可用屋 ${signed(changes.houses)} · 损毁屋 ${signed(changes.ruinedHouses)}</p>`
      + `<p>此后援助累计差：粮草 ${signed(aid.provisions)} · 灵石 ${signed(aid.spiritStone)}</p>`
      + (crises != null ? `<p>尚未结束的活动危机：${crises} 项。</p>` : '')
      + (now?.status === 'ruins' || now?.status === 'ruin' ? '<p>这座聚落已荒废，仍沿原身份回看遗址。</p>' : '')
      + (history.entries || []).slice(-4).map(e => `<p class="e0-history">${esc(when(e.day))} · ${esc(e.text)}</p>`).join('')
      + `<p class="e0-note">${esc(history.note || '地方沿革仅保留有限详录。')}${history.windowMayBeIncomplete ? ' 详录未完整保留。' : ''}</p>`;
  }
  function refresh(force = true) {
    if (!sandbox.world) return;
    const changedWorld = world !== sandbox.world;
    const showing = shelf.getClientRects().length > 0, opened = showing && !wasVisible;
    wasVisible = showing;
    const now = performance.now();
    if (!force && !changedWorld && !opened && now - lastRefreshTime < 2000) return;
    lastRefreshTime = now;
    if (changedWorld) { world = sandbox.world; signature = ''; selectedMark = null; openDetails.clear(); }
    const data = readObserveEcho(world), focus = data.focus;
    // Only low-frequency HUD refresh enumerates settlement records, never tiles.
    const places = [...(world.villages || []).filter(visible).map(place => ({ place, status: settlementCondition(world, place).status })),
      ...(world.settlementRuins || []).filter(visible).map(place => ({ place, status: 'ruins' }))];
    places.sort((a, b) => Number(b.place.id === focus?.settlementId) - Number(a.place.id === focus?.settlementId)
      || Number(a.status === 'normal') - Number(b.status === 'normal') || a.place.id - b.place.id);
    candidates = places.filter(item => item.status !== 'normal' || item.place.id === focus?.settlementId).slice(0, 8);
    while (nodes.length < candidates.length) {
      const b = doc.createElement('button'); b.type = 'button'; b.className = 'e0-map-mark';
      b.addEventListener('click', () => locate(Number(b.dataset.id))); layer.append(b); nodes.push(b);
    }
    nodes.forEach((b, i) => {
      const item = candidates[i]; b.hidden = !item; if (!item) return;
      b.dataset.id = item.place.id; b.dataset.state = item.status;
      b.textContent = `${item.place.id === focus?.settlementId ? '◆ ' : ''}${state(item.status)} · ${item.place.name || '无名聚落'}`;
      b.title = '检视这座聚落；山体遮挡时可从书架列表找回';
    });
    const relevant = focus ? settlementRevisit(world, focus) : null;
    const marks = data.marks || [], selected = marks.find(m => String(m.id) === String(selectedMark)) || marks.at(-1);
    const echo = selected ? markRevisit(world, selected) : null;
    // Passage of time alone is not rendered text. Do not replace live controls
    // merely because the model's observation-window endpoint moved forward.
    const nextSignature = JSON.stringify([places.map(x => [x.place.id, x.place.name, x.status]), focus, relevant, marks, selectedMark, echo, data.discardedMarks],
      (key, value) => key === 'toDay' ? undefined : value);
    if (nextSignature === signature) return;
    if (!force && !changedWorld && shelf.contains(doc.activeElement)) return;
    signature = nextSignature;
    const scroll = shelf.scrollTop;
    const rail = shelf.closest('.rail'), railScroll = rail?.scrollTop;
    const listScroll = shelf.querySelector('.e0-place-list')?.scrollTop || 0;
    const active = shelf.contains(doc.activeElement) ? doc.activeElement : null;
    const activeAction = active?.dataset.e0Action, activeId = active?.dataset.id, activeMark = active?.dataset.mark;
    shelf.innerHTML = '<h3>聚落 · 回声</h3><p class="e0-note">先看一座村的处境，再决定旁观或落笔。状态徽标最多八处；列表可检视重叠或被山遮住的聚落。</p>'
      + (focus ? `<section class="e0-focus"><h4>◆ 记挂 · ${esc(focus.name)}</h4>${button('locate', '回到原址', focus.settlementId)} ${button('clear', '放下记挂', focus.settlementId)}<p class="e0-note">记于 ${esc(when(focus.day))}；只记挂一处地方，人物名单独立。</p>${revisitHtml(relevant, focus.snapshot)}</section>`
        : '<p>尚未记挂地方。在聚落卡上点「记挂此地」，以后可回来比较。</p>')
      + `<details data-e0-detail="places" ${openDetails.has('places') ? 'open' : ''}><summary>已开放山河的聚落与遗址（${places.length}）</summary><div class="e0-place-list">`
      + (places.length ? places.map(({ place, status }) => `<div>${button('locate', `${state(status)} · ${place.name || '无名聚落'}`, place.id)}</div>`).join('') : '<p>尚未发现聚落，继续观察真实世界的演化。</p>') + '</div></details>'
      + '<h4>我落过的笔 · 抽水</h4><p class="e0-note">仅登记实际变水的一笔。先暂停便于查看直接改变；继续岁月后，村庄仍按自身条件演化。</p>'
      + (marks.length ? `<div class="e0-mark-list">${marks.slice(-6).reverse().map(mark => `<button type="button" data-e0-action="mark" data-mark="${esc(mark.id)}" aria-pressed="${mark.id === selected?.id}">${esc(when(mark.day))} · 抽水 ${n(mark.changedCells)} 格${mark.status === 'undone' ? ' · 已撤销' : ''}</button>`).join('')}</div>` : '<p>尚无抽水笔录；无效果的落笔不会登记。</p>')
      + (selected ? `<section class="e0-echo"><h4>当时直接改变</h4><p>${esc(when(selected.day))}，在（${n(selected.x)}, ${n(selected.y)}）抽水 ${n(selected.changedCells)} 格。</p>`
        + (selected.before && selected.after ? `<p>关联原村：${esc(selected.before.name)}；村心积水 ${n(selected.before.water)} → ${n(selected.after.water)}（未落在村心时可不变）。</p>` : '<p>这一笔没有关联可确认的聚落身份。</p>')
        + `<p>${selected.status === 'undone' ? '已撤销：当时改动已回退，不表示持续效果。' : selected.status === 'undo-refused' ? `撤销未完成：${esc(selected.undoReason || '世界已发生后续变化')}。` : selected.undoAvailable ? '当前可尝试 Ctrl+Z 撤销；后续变化可能使撤销被拒绝。' : '该笔已无可用撤销记录。'}</p>`
        + '<h4>此后实际发生</h4>' + revisitHtml(echo, selected.after)
        + (selected.settlementId != null ? button('locate', '检视原聚落 / 遗址', selected.settlementId) : '')
        + '<h4>无法确定的关联</h4><p>抽水只直接改变上述水层。之后的恢复、援助、人口变化或荒废，不能据此归因于这一笔。</p></section>' : '')
      + `<p class="e0-note">笔录有界；${data.discardedMarks ? `已有 ${n(data.discardedMarks)} 笔旧详录未保留。` : '只保留有限近期笔录。'}用当前世界存档保存记挂与笔录。</p>`;
    shelf.scrollTop = scroll;
    if (rail) rail.scrollTop = railScroll;
    const list = shelf.querySelector('.e0-place-list'); if (list) list.scrollTop = listScroll;
    if (activeAction) [...shelf.querySelectorAll('[data-e0-action]')].find(b => b.dataset.e0Action === activeAction
      && b.dataset.id === activeId && b.dataset.mark === activeMark)?.focus({ preventScroll: true });
  }
  function project() {
    // At most eight projections. No per-frame World enumeration or fact lookup.
    if (world !== sandbox.world) { nodes.forEach(node => { node.hidden = true; }); return; }
    const bounds = stage.getBoundingClientRect(), used = [];
    const obstacles = [...stage.querySelectorAll('.inspect.on,#inkBusanzi')]
      .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
      .map(el => { const r = el.getBoundingClientRect(); return { x: r.left - bounds.left, y: r.top - bounds.top, w: r.width, h: r.height }; });
    nodes.forEach((b, i) => {
      const item = candidates[i]; if (!item) { b.hidden = true; return; }
      const place = item.place;
      let p;
      if (sandbox.render3d?.active) p = sandbox.render3d.projectSettlementAnchor?.(place);
      else {
        const index = world.idx(Math.floor(place.x), Math.floor(place.y));
        const [x, y] = sandbox.camera.tileScreen(place.x, place.y, world.height[index]); p = { x, y, visible: true };
      }
      // The CSS width is stable even while display:none. A hidden node must not
      // alternate between a guessed width and its measured width next frame.
      const width = 164, height = 26;
      const x = (p?.x || 0) - width / 2, y = (p?.y || 0) - 30;
      const box = { x, y, w: width, h: height };
      const overlaps = [...used, ...obstacles].some(q => x < q.x + q.w + 4 && x + width + 4 > q.x && y < q.y + q.h + 4 && y + height + 4 > q.y);
      b.hidden = !p?.visible || x < 8 || y < 16 || x + width > bounds.width - 8 || y + height > bounds.height - 62 || overlaps;
      if (!b.hidden) { b.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`; used.push(box); }
    });
  }
  return { refresh, project, focusId: () => readObserveEcho(sandbox.world).focus?.settlementId,
    appendCardActions(panel, id) {
      const cardWorld = sandbox.world;
      const controls = doc.createElement('div'); controls.className = 'e0-card-actions';
      controls.innerHTML = button('watch', id === readObserveEcho(sandbox.world).focus?.settlementId ? '重新记下此刻' : '记挂此地', id);
      controls.addEventListener('click', event => {
        if (cardWorld !== sandbox.world) { refresh(); return; }
        click(event);
      }); panel.querySelector('.inspect-head')?.after(controls);
    } };
}
