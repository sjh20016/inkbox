import { readJournal, receiptRevisit, personRef, resolveJournalPerson, createVow, abandonVow } from '../sim/journal.js';
import { readObserveEcho } from '../sim/observeEcho.js';
import { watchRows } from '../sim/watch.js';
import { canAccess } from '../core/mapAccess.js';

const esc = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const when = d => Number.isFinite(d) ? `第 ${Math.floor(d / 360) + 1} 年 ${Math.floor((d % 360) / 30) + 1} 月` : '日期未知';
const states = { active: '等待中', fulfilled: '成愿', failed: '未能如愿', lost: '失考', unresolved: '未结', abandoned: '已弃愿' };
const labels = { burn: '焚林', root: '赐灵根', crisis: '降灾', drain: '抽水' };
const button = (action, id, label) => `<button type="button" data-journal-action="${action}" data-id="${esc(id)}">${esc(label)}</button>`;

export function createJournalPanel(sb, doc = document) {
  const root = doc.getElementById('inkJournal'), content = doc.getElementById('inkJournalContent');
  if (!root || !content) return null;
  let world = null, signature = '', last = 0;
  const opened = new Set();
  const cardActions = new WeakMap();
  function notify(text) { if (text) sb.notify?.(text); }
  function dirty() { sb.qol?.markDirty('terrain'); }
  function locate(target) {
    if (!target || world !== sb.world) return;
    if (target.type === 'settlement') { sb.observeEcho?.locate?.(target.id ?? target.settlementId); return; }
    if (target.type === 'person') {
      const resolved = resolveJournalPerson(world, target);
      if (!resolved?.entity) { notify('原人物身份的详录已不可考。'); return; }
      const entity = resolved.entity, plane = resolved.plane;
      if (plane === 'mortal' && !canAccess(world, entity.x, entity.y)) { notify('此人尚在已开放山河之外。'); return; }
      sb.g1?.open({ plane, entityId: entity.id }, { focus: true }); return;
    }
    if (target.type === 'position' && Number.isFinite(target.x) && Number.isFinite(target.y)) {
      if (!canAccess(world, target.x, target.y)) { notify('此处尚在已开放山河之外。'); return; }
      sb.camera.focusOn(target.x, target.y, { zoom: Math.max(sb.camera.zoom, 7), duration: 0.75 });
    }
  }
  function refresh(force = true) {
    if (!root.open || !sb.world) return;
    const changed = world !== sb.world;
    if (changed) { world = sb.world; signature = ''; opened.clear(); }
    const now = performance.now();
    if (!force && !changed && now - last < 2000) return;
    last = now;
    const journal = readJournal(world), echo = readObserveEcho(world), rows = watchRows(world);
    const receipts = [...journal.receipts.map(r => ({ ...r, source: 'journal' })), ...echo.marks.map(r => ({ ...r, kind: 'drain', source: 'echo' }))].sort((a, b) => b.day - a.day || b.id - a.id);
    const projections = receipts.map(r => r.source === 'journal' && opened.has(`receipt-${r.id}`) ? receiptRevisit(world, r) : null);
    const next = JSON.stringify([journal, echo, rows.map(r => [r.entry.key, r.entry.name, r.state]), projections]);
    if (next === signature) return;
    if (!force && !changed && content.contains(doc.activeElement)) return;
    signature = next;
    const rail = root.closest('.rail'), scroll = rail?.scrollTop;
    const active = content.contains(doc.activeElement) ? doc.activeElement : null;
    const activeKey = active && [active.dataset.journalAction, active.dataset.id];
    const activeDetail = active?.tagName === 'SUMMARY' ? active.parentElement?.dataset.journalDetail : null;
    const lines = values => (values?.length ? values : ['尚无可靠记录。']).map(v => `<p>${esc(typeof v === 'string' ? v : `${when(v.day)} · ${v.text}`)}</p>`).join('');
    const receiptHtml = receipts.map((r, i) => {
      const key = `receipt-${r.source === 'echo' ? 'echo-' : ''}${r.id}`;
      const result = projections[i];
      return `<details data-journal-detail="${esc(key)}" ${opened.has(key) ? 'open' : ''}><summary>${esc(when(r.day))} · ${esc(labels[r.kind] || r.kind)}</summary>` + (r.source === 'echo'
        ? `<p>抽水 ${esc(r.changedCells)} 格，位置（${esc(r.x)}, ${esc(r.y)}）。</p>${button('echo', r.id, '查看抽水详录')}`
        : result ? `<h5>当时直接改变</h5>${lines(result.direct)}<h5>此后真实发生</h5>${lines(result.following)}<h5>无法确定的关联</h5>${lines(result.uncertain)}${(result.targets || []).map((t, n) => button('target', `${r.id}:${n}`, t.type === 'person' ? '回访人物' : t.type === 'settlement' ? '回访聚落' : '回到落笔处')).join(' ')}` : '') + '</details>';
    }).join('');
    const vowHtml = v => `<div class="journal-vow"><strong>${esc(v.kind === 'settlement' ? '守一方烟火' : '待一人破境')} · ${esc(v.name)}</strong><p>${esc(when(v.createdDay))} 立愿 · ${esc(states[v.status] || v.status)}${v.endedDay != null ? ` · ${esc(when(v.endedDay))}` : ` · 待至 ${esc(when(v.dueDay))}`}</p>${v.result || v.note ? `<p>${esc(v.result || v.note)}</p>` : ''}${button('vow-locate', v.id, '回访')}${v.status === 'active' ? ' ' + button('abandon', v.id, '弃愿') : ''}</div>`;
    content.innerHTML = `<p class="journal-intro">留下一笔，记住一人或一处地方。岁月过去之后，可以回来看看。</p><section><h4>我落过的笔</h4>${receiptHtml || '<p>尚无笔录。有效落笔后，可在这里回看。</p>'}${journal.discardedReceipts || echo.discardedMarks ? `<p>已有 ${esc((journal.discardedReceipts || 0) + (echo.discardedMarks || 0))} 笔旧详录超出保留窗口。</p>` : ''}</section><section><h4>我记挂的</h4>${rows.map(r => button('watch', r.entry.key, r.entry.name)).join(' ') || '<p>尚未记挂人物。</p>'}${echo.focus ? button('place', echo.focus.settlementId, `◆ ${echo.focus.name}`) : '<p>尚未记挂地方。</p>'}</section><section><h4>我在等的事</h4>${journal.vows.active.map(vowHtml).join('') || '<p>尚无行愿。可从人物卡或聚落卡立愿。</p>'}<details data-journal-detail="archive" ${opened.has('archive') ? 'open' : ''}><summary>已结束的行愿（${journal.vows.archive.length}）</summary>${journal.vows.archive.slice().reverse().map(vowHtml).join('') || '<p>尚无归档。</p>'}</details></section>`;
    if (rail && scroll != null) rail.scrollTop = scroll;
    if (activeDetail) [...content.querySelectorAll('[data-journal-detail]')].find(d => d.dataset.journalDetail === activeDetail)?.querySelector('summary')?.focus({ preventScroll: true });
    if (activeKey?.[0]) [...content.querySelectorAll('[data-journal-action]')].find(b => b.dataset.journalAction === activeKey[0] && b.dataset.id === activeKey[1])?.focus({ preventScroll: true });
  }
  root.addEventListener('toggle', e => {
    if (e.target === root) { if (root.open) refresh(true); return; }
    const key = e.target.dataset.journalDetail; if (!key) return;
    if (!e.target.isConnected) return;
    const wasOpen = opened.has(key);
    if (e.target.open) opened.add(key); else opened.delete(key);
    if (e.target.open && !wasOpen) { signature = ''; refresh(true); }
  }, true);
  content.addEventListener('click', e => {
    const b = e.target.closest('[data-journal-action]'); if (!b || world !== sb.world) return;
    const id = b.dataset.id, data = readJournal(world), action = b.dataset.journalAction;
    if (action === 'watch') sb.openWatchRow(id);
    else if (action === 'place') sb.observeEcho?.locate?.(Number(id));
    else if (action === 'echo') { doc.getElementById('inkJournalEchoDetail').open = true; sb.observeEcho?.openMark?.(id); }
    else if (action === 'abandon') { const result = abandonVow(world, id); notify(result.message); if (result.ok) dirty(); signature = ''; refresh(true); }
    else if (action === 'vow-locate') { const v = [...data.vows.active, ...data.vows.archive].find(v => String(v.id) === id); if (v) locate({ ...v.ref, type: v.kind === 'settlement' ? 'settlement' : 'person' }); }
    else if (action === 'target') { const [rid, index] = id.split(':'); const r = data.receipts.find(r => String(r.id) === rid); if (r) locate(receiptRevisit(world, r).targets[Number(index)]); }
  });
  function appendAction(panel, label, makeRef, kind, key) {
    const previous = cardActions.get(panel);
    if (previous?.world === sb.world && previous.key === key && previous.control.isConnected) return;
    panel.querySelectorAll('.journal-card-actions').forEach(node => node.remove());
    const cardWorld = sb.world, control = doc.createElement('div'); control.className = 'journal-card-actions';
    cardActions.set(panel, { world: cardWorld, key, control });
    const b = doc.createElement('button'); b.type = 'button'; b.textContent = label; control.append(b);
    b.addEventListener('click', () => {
      if (cardWorld !== sb.world || !control.isConnected) { notify('世界或对象卡已改变，请重新打开。'); return; }
      const ref = makeRef(); if (!ref) { notify('原身份已不可考，无法立愿。'); return; }
      const result = createVow(cardWorld, kind, ref); notify(result.message); if (result.ok) { dirty(); signature = ''; refresh(true); }
    });
    (panel.querySelector('.inspect-head') || panel.firstElementChild)?.after(control);
  }
  return { refresh, open() { root.open = true; refresh(true); },
    appendSettlementActions(panel, id, plane = 'mortal') { if (plane !== 'mortal') return; appendAction(panel, '立愿 · 守一方烟火', () => ({ id, plane }), 'settlement', `settlement:${plane}:${id}`); },
    appendPersonActions(panel, identity) {
      const key = identity?.key, resolved = key && resolveJournalPerson(sb.world, identity), initial = resolved?.entity;
      if (!key || resolved?.status !== 'alive' || !(initial?.hp > 0) || !(initial?.level > 0)) {
        panel.querySelectorAll('.journal-card-actions').forEach(node => node.remove());
        cardActions.delete(panel); return;
      }
      appendAction(panel, '立愿 · 待一人破境', () => {
        const ref = personRef(sb.world, identity.plane, identity.id), current = ref && resolveJournalPerson(sb.world, ref);
        return panel.dataset.characterKey === key && ref?.key === key && current?.entity === initial ? ref : null;
      }, 'breakthrough', key);
    }
  };
}
