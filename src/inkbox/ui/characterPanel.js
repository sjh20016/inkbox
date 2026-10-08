// Character-G0/G0.5: the shared mortal character panel, UI-only except edict commands.
// No new inventory, simulation clock, save columns, or duplicate entity identities.
import { findEntity, compileBiography, biographyFileName, displayName } from '../sim/biography.js';
import { toggleWatch, isWatched, WATCH_CAP } from '../sim/watch.js';
import { spawnFocusPulse } from '../render/overlayLayer.js';
import { characterSnapshot } from './characterCardData.js';
import { applyHeavenEdict, HEAVEN_EDICTS } from '../sim/heavenEdicts.js';

const $ = id => document.getElementById(id);
const SESSIONS = new WeakMap();
const ESC = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const n = value => Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
const row = (title, body) => '<div class="cc-row"><span>' + ESC(title) + '</span><b>' + ESC(body) + '</b></div>';
const liveRow = (title, key, body) => '<div class="cc-row"><span>' + ESC(title) + '</span><b data-cc-field="' + key + '">' + ESC(body) + '</b></div>';
const tag = t => '<span class="cc-trait" title="' + ESC(t.type + ' · ' + t.axis) + '">' + ESC(t.name) + '</span>';
const card = (title, html) => '<section class="cc-section"><h3>' + ESC(title) + '</h3>' + html + '</section>';

function styleOnce() {
  if ($('inkCharacterCardStyle')) return;
  const style = document.createElement('style');
  style.id = 'inkCharacterCardStyle';
  style.textContent = `
    #inkPersonDetail.character-card{width:min(384px,calc(100vw - 24px));max-height:min(80vh,760px);right:14px;bottom:49px;overflow:hidden;box-shadow:0 6px 28px rgba(48,42,31,.24);}
    .cc-header{display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,.45);border-bottom:1px solid var(--line);}
    .cc-seal{width:46px;height:50px;display:grid;place-items:center;border:1px solid var(--line-strong);border-radius:5px;color:var(--cinnabar);font:23px var(--serif);background:var(--paper-2);flex:0 0 auto;}
    .cc-header-main{min-width:0;flex:1}.cc-header-main strong{display:block;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cc-small{font-size:11px;color:var(--ink-soft);line-height:1.55}.cc-toolbar{display:flex;gap:5px;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid var(--line);flex-wrap:wrap;}
    .cc-progress{padding:10px 12px 8px;background:rgba(255,255,255,.19);border-bottom:1px solid var(--line)}.cc-prow{display:flex;justify-content:space-between;gap:9px;font-size:12px;color:var(--ink-mid);margin-bottom:6px}
    .cc-meter{height:9px;background:var(--paper-3);border-radius:8px;overflow:hidden}.cc-meter i{height:100%;display:block;background:var(--malachite);width:0;transition:width .25s}
    .cc-tabs{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--line-strong)}.cc-tab{border:0;border-right:1px solid var(--line);padding:8px 4px;background:transparent;font:12px var(--serif);color:var(--ink-mid);cursor:pointer}
    .cc-tab.active{background:rgba(168,73,60,.09);color:var(--cinnabar);font-weight:bold;border-bottom:2px solid var(--cinnabar);}
    .cc-scroll{overflow:auto;max-height:min(45vh,410px);padding:9px 12px 12px;overscroll-behavior:contain}
    .cc-section{margin-bottom:12px}.cc-section h3{font-size:12px;font-weight:bold;color:var(--ink);margin-bottom:7px;letter-spacing:2px;border-bottom:1px solid var(--line);padding-bottom:3px}
    .cc-row{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px dashed rgba(34,32,28,.10);font-size:12px}.cc-row span{color:var(--ink-soft);flex:0 0 90px}
    .cc-row b{font-weight:500;text-align:right;overflow-wrap:anywhere}.cc-traits{display:flex;gap:5px;flex-wrap:wrap}.cc-trait{display:inline-block;padding:4px 7px;border-radius:4px;border:1px solid var(--line-strong);background:rgba(255,255,255,.35);font-size:11px;color:var(--ink-mid);}
    .cc-empty{color:var(--ink-soft);font-size:12px;line-height:1.7}.cc-event{padding:5px 0;border-bottom:1px dotted var(--line);font-size:11.5px;line-height:1.65;color:var(--ink-mid);overflow-wrap:anywhere}
    .cc-event time{display:block;font-size:10px;color:var(--ink-soft)}.cc-edict{display:flex;align-items:center;gap:9px;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);}
    .cc-edict p{flex:1;font-size:12px}.cc-edict small{display:block;color:var(--ink-soft);font-size:10px;line-height:1.55;margin-top:4px}
    .cc-actions{display:flex;flex-wrap:wrap;gap:5px;padding:8px 10px;border-top:1px solid var(--line)}.cc-actions button{font-size:11px;padding:5px 7px}
    .cc-relationship{overflow:auto;max-height:195px}.cc-biography{white-space:pre-wrap;font-size:11.5px;line-height:1.7;color:var(--ink-mid)}
    #inkPersonDetail.character-card button:disabled{opacity:.45;cursor:not-allowed}
    @media(max-width:750px){#inkPersonDetail.character-card{right:8px;bottom:52px;max-height:76vh}.cc-scroll{max-height:36vh}}
  `;
  document.head.appendChild(style);
}
function getSession(sb) {
  let session = SESSIONS.get(sb);
  if (!session) {
    session = { id: null, world: null, tab: 'overview', snapshot: null, relationOpen: false, callbacks: {}, signature: '', lastRenderedAt: -1 };
    SESSIONS.set(sb, session);
  }
  return session;
}
function eventsHtml(rows, limit = 6) {
  const part = (rows || []).slice(0, limit);
  return part.length
    ? part.map(e => '<div class="cc-event"><time>仙历 ' + (Math.floor(e.day / 360) + 1) +
      ' 年</time>' + ESC(e.text) + '</div>').join('')
    : '<p class="cc-empty">此人尚未留下可追溯的事迹。</p>';
}
function characterBody(session, world, entity) {
  const p = session.snapshot, tab = session.tab;
  if (!p) return '';
  if (!entity) return card('行踪', '<p class="cc-empty">此人已离开凡间或不再可考。可从「天道记挂」与史册中继续查找。</p>');
  if (tab === 'overview') {
    return card('一眼观命',
      row('身份', p.level > 0 ? '修士' : '凡人') + row('所依', p.faction)
      + liveRow('寿元', 'life', p.ageYears + ' / ' + p.lifespanYears + ' 年'))
      + card('人物特征', '<div class="cc-traits">' + (p.traits.length ? p.traits.slice(0,8).map(tag).join('') : '<span class="cc-empty">凡骨无奇，命数未定。</span>') + '</div>')
      + card('眼下境况', liveRow('当前状态', 'state', p.state) + liveRow('气运', 'fortune', p.fortune) + liveRow('道心', 'mind', p.mind) + liveRow('心魔', 'heartDemon', p.heartDemon) + liveRow('污染', 'pollution', p.pollution))
      + card('近期经历', eventsHtml(p.logs, 4));
  }
  if (tab === 'cultivation') return card('修炼实况',
    liveRow('境界', 'realm', p.realm) + liveRow('修为', 'cultivation', p.awakened ? n(p.exp) + ' / ' + n(p.target) : '尚未启灵') +
    liveRow('每日修为', 'rate', p.awakened ? n(p.rate) + ' / 游戏日' : '无') +
    liveRow('基础战力', 'combat', n(p.combat)) + liveRow('体魄', 'health', n(p.hp) + ' / ' + n(p.maxHp)) +
    row('道途', p.dao) + row('灵根', p.root + (p.rootQuality ? ' · ' + p.rootQuality : '')) +
    row('血脉', p.bloodline) + liveRow('道心', 'mind', p.mind) + liveRow('心魔', 'heartDemon', p.heartDemon) +
    liveRow('因果', 'karma', p.karma) + liveRow('气运', 'fortune', p.fortune) + liveRow('污染', 'pollution', p.pollution) +
    '<p class="cc-small">修炼速度、战力均取自现有模拟计算。突破满条后仍可能失败。</p>') +
    card('功法与法宝', row('功法', p.techniques.join('、') || '无') +
      row('法宝', p.artifacts.join('、') || '无') + row('禁术', p.forbidden || '无')) +
    card('家世与轮回', row('世代', p.incarnation + ' 世') +
      row('双亲记录', (p.parentA || p.parentB) ? '已入家谱' : '未可考') +
      row('家族编号', p.clan ? String(p.clan) : '无'));
  if (tab === 'edict') return card('天道敕令',
    '<p class="cc-empty">只对当前所选人物生效；直接改变真实模拟中的对应数值。后续突破、得失由世界自行决定。</p>' +
    HEAVEN_EDICTS.map(e => '<div class="cc-edict"><p><b>' + ESC(e.name) + '</b><small>' + ESC(e.description) + '</small></p>' +
      '<button class="btn" data-cc-action="edict" data-edict="' + ESC(e.id) +
      '"' + ((e.id === 'cultivation' && (!p.awakened || p.capped || p.percent >= 100)) ||
        (e.id === 'fortune' && p.fortune >= 100) || (e.id === 'mind' && p.mind >= 100) ? ' disabled' : '') +
      '>施令</button></div>').join('')) +
    card('天道落子 · 已有记录', eventsHtml(p.logs.filter(e => e.text.includes('【天道敕令】')), 8));
  if (tab === 'life') return card('最近的世事', eventsHtml(p.logs, 12)) +
    card('完整传记', '<details><summary class="log-name">展开完整传记</summary><div class="cc-biography">' +
      ESC(compileBiography(world, entity)) + '</div></details>') +
    card('人物关系', '<button class="btn" data-cc-action="relation">' +
      (session.relationOpen ? '收起关系' : '查看关系') + '</button><div class="cc-relationship" data-cc-rel></div>');
  return '';
}
function paintRelations(sb) {
  const st = getSession(sb), holder = $('inkPersonDetail')?.querySelector('[data-cc-rel]');
  if (!holder) return;
  const e = findEntity(sb.world, st.id);
  holder.innerHTML = st.relationOpen && e && st.callbacks.renderRelations
    ? st.callbacks.renderRelations(sb.world, e) : '';
  if (st.relationOpen) st.callbacks.bindRelations?.();
}
function updateFields(sb) {
  const panel = $('inkPersonDetail'), st = getSession(sb), p = st.snapshot;
  if (!panel || !p) return;
  const set = (name, value) => { const el = panel.querySelector('[data-cc="' + name + '"]'); if (el && el.textContent !== String(value)) el.textContent = String(value); };
  set('name', p.name); set('realm', p.realm); set('state', p.state);
  set('sub', p.faction + ' · ' + p.ageYears + ' 岁 · ' + p.state);
  set('count', p.awakened ? n(p.exp) + ' / ' + n(p.target) : '尚未启灵');
  set('pct', p.awakened ? n(p.percent) + '%' : '凡人');
  const bar = panel.querySelector('[data-cc="bar"]');
  if (bar) bar.style.width = p.percent + '%';
  const watch = panel.querySelector('[data-cc-action="watch"]');
  if (watch) watch.textContent = isWatched(sb.world, findEntity(sb.world, st.id)) ? '★ 取消记挂' : '☆ 记挂';
}
function renderTab(sb) {
  const panel = $('inkPersonDetail'), st = getSession(sb);
  if (!panel) return;
  panel.querySelectorAll('[data-cc-tab]').forEach(b => {
    b.classList.toggle('active', b.dataset.ccTab === st.tab);
    b.setAttribute('aria-selected', b.dataset.ccTab === st.tab ? 'true' : 'false');
  });
  const body = panel.querySelector('.cc-scroll');
  if (!body) return;
  const top = body.scrollTop;
  body.innerHTML = characterBody(st, sb.world, findEntity(sb.world, st.id));
  body.scrollTop = top;
  paintRelations(sb);
}
function handleClick(sb, ev) {
  const panel = $('inkPersonDetail'), st = getSession(sb);
  const tab = ev.target.closest('[data-cc-tab]');
  if (tab) { st.tab = tab.dataset.ccTab; const box = panel.querySelector('.cc-scroll'); if (box) box.scrollTop = 0; renderTab(sb); return; }
  const button = ev.target.closest('[data-cc-action]');
  if (!button) return;
  const action = button.dataset.ccAction;
  if (action === 'close') return closeCharacterCard(sb);
  const now = findEntity(sb.world, st.id);
  if (action === 'locate') {
    if (!now) return sb.notify?.('此人已离开凡间');
    sb.camera.focusOn(now.x, now.y, { zoom: Math.max(sb.camera.zoom, 7), duration: .75 });
    spawnFocusPulse(sb.focusPulses, now.x, now.y); sb.dirty = true; return;
  }
  if (action === 'export') {
    if (now) sb.downloadText(biographyFileName(now), compileBiography(sb.world, now));
    return;
  }
  if (action === 'relation') { st.relationOpen = !st.relationOpen; renderTab(sb); return; }
  if (!now) return sb.notify?.('此人已离开凡间');
  if (action === 'watch') {
    const result = toggleWatch(sb.world, now, sb.world.day);
    if (!result.ok) return sb.notify?.(result.reason === 'full' ? '记挂名额已满（' + WATCH_CAP + '）' : '未能修改记挂');
    sb.qol?.markDirty('watch');
    sb.refreshWatch?.(); updateFields(sb);
    sb.notify?.(result.watched ? '已记挂 · ' + displayName(now) : '不再记挂 · ' + displayName(now));
    return;
  }
  if (action === 'edict') {
    const outcome = applyHeavenEdict(sb.world, { targetId: now.id, action: button.dataset.edict });
    if (!outcome.ok) return sb.notify?.(outcome.reason);
    sb.qol?.markDirty('character-edict');
    sb.refreshChronicle?.();
    sb.refreshWatch?.();
    sb.notify?.(outcome.note, 4000);
    refreshCharacterCard(sb, true);
  }
}
export function openCharacterCard(sb, id, callbacks = {}) {
  const world = sb.world, e = findEntity(world, id);
  const panel = $('inkPersonDetail');
  if (!panel || !e) { sb.notify?.('此人已不在凡间'); return; }
  styleOnce();
  const st = getSession(sb);
  if (st.id !== id || st.world !== world) {
    st.tab = 'overview'; st.relationOpen = false;
  }
  st.id = id; st.world = world; st.callbacks = callbacks;
  st.snapshot = characterSnapshot(world, e);
  sb.personOpenId = id;
  panel.classList.add('character-card', 'on');
  panel.dataset.plane = 'mortal';
  panel.innerHTML = '<div class="cc-header"><span class="cc-seal">命</span><div class="cc-header-main">' +
    '<strong data-cc="name"></strong><div class="cc-small" data-cc="sub"></div>' +
    '<span class="plane-tag">凡间</span> <span data-cc="realm"></span></div>' +
    '<button class="ink-x" data-cc-action="close" title="关闭人物卡">×</button></div>' +
    '<div class="cc-progress"><div class="cc-prow"><b>修为 · <span data-cc="state"></span></b>' +
    '<span data-cc="count"></span></div><div class="cc-meter"><i data-cc="bar"></i></div>' +
    '<div class="cc-prow" style="margin-top:4px;margin-bottom:0"><span>此身修行</span><span data-cc="pct"></span></div></div>' +
    '<div class="cc-tabs" role="tablist">' +
    [['overview','命簿'],['cultivation','修行'],['edict','改命'],['life','生平']]
      .map(([key,label]) => '<button class="cc-tab" type="button" data-cc-tab="' + key + '" role="tab">' + label + '</button>').join('') +
    '</div><div class="cc-scroll"></div>' +
    '<div class="cc-actions"><button class="btn" data-cc-action="locate">定位</button>' +
    '<button class="btn" data-cc-action="watch">☆ 记挂</button>' +
    '<button class="btn" data-cc-action="export">导出传记</button></div>';
  if (!panel.dataset.characterBound) {
    panel.dataset.characterBound = '1';
    panel.addEventListener('click', ev => handleClick(sb, ev));
  }
  st.signature = '';
  refreshCharacterCard(sb, true);
  if (!sb.suppressCharacterFocus) {
    sb.camera.focusOn(e.x, e.y, { zoom: Math.max(sb.camera.zoom, 7), duration: .75 });
    spawnFocusPulse(sb.focusPulses, e.x, e.y);
  }
  sb.qol?.noteRecent({ key: 'mortal:' + e.id, kind: 'person', id: e.id, name: displayName(e), plane: 'mortal' });
  sb.refreshRecent?.();
  sb.dirty = true;
}
export function refreshCharacterCard(sb, force = false) {
  const st = getSession(sb), panel = $('inkPersonDetail');
  if (!panel || !panel.classList.contains('on') || !st.id || st.world !== sb.world) return;
  const e = findEntity(sb.world, st.id);
  if (e) st.snapshot = characterSnapshot(sb.world, e);
  if (!st.snapshot) return;
  // Rebuild only when a categorical state changes; progress and labels update in place.
  const p = st.snapshot;
  const signature = [p.awakened, p.realm, p.state, p.root, p.dao, p.bloodline,
    p.techniques.join('|'), p.artifacts.join('|'), p.traits.map(t => t.name).join('|'),
    p.logs[0]?.day, p.logs[0]?.text, e ? 'alive' : 'gone'].join(':');
  if (force || signature !== st.signature) { st.signature = signature; renderTab(sb); }
  updateFields(sb);
  // Update visible numbers in place; never reset the scroll, tabs or open biography.
  const values = {
    fortune: p.fortune, mind: p.mind, heartDemon: p.heartDemon,
    pollution: p.pollution, karma: p.karma, state: p.state,
    realm: p.realm, cultivation: p.awakened ? n(p.exp) + ' / ' + n(p.target) : '尚未启灵',
    rate: p.awakened ? n(p.rate) + ' / 游戏日' : '无',
    combat: n(p.combat), health: n(p.hp) + ' / ' + n(p.maxHp),
    life: p.ageYears + ' / ' + p.lifespanYears + ' 年',
  };
  for (const [name, value] of Object.entries(values)) {
    const node = panel.querySelector('[data-cc-field="' + name + '"]');
    if (node && node.textContent !== String(value)) node.textContent = String(value);
  }
}
export function closeCharacterCard(sb) {
  const panel = $('inkPersonDetail'), st = getSession(sb);
  if (panel) panel.classList.remove('on');
  st.id = null; st.world = null; st.snapshot = null; st.relationOpen = false;
  sb.personOpenId = null; sb.relationOpen = false;
}
