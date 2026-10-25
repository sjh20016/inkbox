import { OPUS_SYMBOLS } from './secretScrollSymbols.js';
import { blockingInputLayer } from '../inputLayers.js';
import { enterRender3D } from '../../render3d/entry.js';
import { TOOL_BY_ID } from '../tools.js';

// Opus 玄门秘卷 presentation. Existing controls, handlers and G1 cards remain
// the owners of game actions; this module arranges and decorates their DOM.
const mounted = new WeakMap();
const glyphs = { terrain: 'shan', water: 'shui', nature: 'sheng', disaster: 'zai', life: 'sheng', dao: 'xian', view: 'guan' };
const frames = { terrain: 'sq', water: 'broken', nature: 'sq', disaster: 'broken', life: 'round', dao: 'tall', view: 'round' };
const crown = '<svg class="r1-crown" viewBox="0 0 34 12" aria-hidden="true"><path d="M3 10 Q6 2 9 10 M14 10 Q17 1 20 10 M25 10 Q28 2 31 10 M1 11 H33"/></svg>';
const ring = '<svg class="r1-ring" viewBox="0 0 52 46" aria-hidden="true"><path d="M40 6 C22 -2 2 8 4 26 C6 42 34 46 46 32 C52 24 48 12 36 8"/></svg>';

function seal(glyph, frame = 'sq') {
  return `<svg class="r1-seal-icon" viewBox="0 0 48 48" aria-hidden="true"><use class="r1-fr" href="#r1-f-${frame}"/><use class="r1-gu" href="#r1-g-${glyph}"/></svg>`;
}
function foot(index) {
  // Fixed ornamental strokes, unrelated to world or simulation randomness.
  const x = 8 + index % 4 * 3;
  return `<svg class="r1-sigil" viewBox="0 0 30 54" aria-hidden="true"><path d="M15 2V9H${x}V17H23V24H7V32H${30-x}V40H15V46Q15 51 21 49"/><circle cx="${x}" cy="17" r="1.8"/><circle cx="15" cy="40" r="1.8"/></svg>`;
}

export function bindSecretScrollUi(sandbox, doc = document, win = window) {
  if (!sandbox || mounted.has(doc)) return mounted.get(doc) || (() => {});
  const $ = id => doc.getElementById(id);
  const body = doc.body, app = doc.querySelector('.app'), left = $('inkToolsRail'), right = $('inkExperienceRail');
  if (!app || !left || !right) return () => {};
  const listeners = [], observers = [], generated = [], moves = [], decorations = [];
  let disposed = false, activeGroup = 'terrain', activeVolume = 'yi', bookOpen = false, bookOpener = null, enteringThree = false;
  const listen = (el, event, fn, options) => {
    if (!el) return;
    el.addEventListener(event, fn, options); listeners.push(() => el.removeEventListener(event, fn, options));
  };
  const observe = (el, fn, options) => {
    if (!el) return;
    const observer = new win.MutationObserver(fn); observer.observe(el, options); observers.push(observer);
  };
  const el = (tag, className, text) => {
    const node = doc.createElement(tag); if (className) node.className = className;
    if (text != null) node.textContent = text; return node;
  };
  const add = (parent, node) => { parent.append(node); generated.push(node); return node; };
  const move = (node, parent) => {
    if (!node || !parent) return;
    moves.push({ node, parent: node.parentNode, next: node.nextSibling }); parent.append(node);
  };
  const button = (label, className, fn) => {
    const node = el('button', className, label); node.type = 'button'; listen(node, 'click', fn); return node;
  };
  const sprite = add(body, el('div', 'r1-symbols')); sprite.innerHTML = OPUS_SYMBOLS;
  body.classList.add('r1-scroll-ui'); body.dataset.r1Arts = 'closed';

  const brand = doc.querySelector('.brand'), brandName = brand?.querySelector('h1'), brandSeal = brand?.querySelector('.seal');
  if (brandName) { const text = brandName.textContent; decorations.push(() => { brandName.textContent = text; }); brandName.textContent = '坐天观井'; }
  if (brandSeal) { const nodes = [...brandSeal.childNodes]; decorations.push(() => brandSeal.replaceChildren(...nodes)); brandSeal.innerHTML = seal('jing'); }

  function openArts(group = activeGroup) {
    activeGroup = group; body.dataset.r1Arts = 'open';
    const label = $('inkGroups')?.querySelector(`[data-group="${group}"] .r1-seal-label`)?.textContent || '天道术式';
    canvasTitle.textContent = label; nativeTitle.textContent = label;
    sandbox.render3d?.clearCameraKeys?.(); sync();
  }
  function closeArts() {
    body.dataset.r1Arts = 'closed';
    if (sandbox.render3d?.active) sandbox.render3d.canvas?.focus({ preventScroll: true });
  }
  function head(title) {
    const header = el('header', 'r1-arts-head'), heading = el('h2', '', title);
    header.append(heading, button('收', 'r1-jue r1-arts-close', closeArts)); return { header, heading };
  }
  const canvasArts = add(left, el('section', 'r1-arts-sheet')); canvasArts.id = 'r1CanvasArts'; canvasArts.setAttribute('aria-label', '神力符匣');
  const ch = head('山形'); canvasArts.append(ch.header); const canvasTitle = ch.heading;
  move($('inkTools'), canvasArts); move($('inkWanlingQuick'), canvasArts); move($('inkOpportunityOptions'), canvasArts);
  const footerClusters = [...doc.querySelectorAll('.bottom > .cluster')];
  move(footerClusters[1], canvasArts); move($('inkToolHint'), canvasArts); move($('inkToolState'), canvasArts);
  let nativeTitle = el('h2', '', '山形');
  const threeRack = add(app, el('nav', 'r1-three-rack')); threeRack.id = 'r1ThreeRack'; threeRack.setAttribute('aria-label', '天道印令');

  function decorateGroups() {
    for (const b of $('inkGroups').querySelectorAll('[data-group]')) {
      if (b.dataset.r1Decorated) continue;
      const label = b.textContent, nodes = [...b.childNodes]; decorations.push(() => { b.replaceChildren(...nodes); delete b.dataset.r1Decorated; });
      b.dataset.r1Decorated = 'true'; b.setAttribute('aria-label', label);
      const stone = el('span', 'r1-stone'); stone.innerHTML = seal(glyphs[b.dataset.group] || 'jing', frames[b.dataset.group]);
      b.replaceChildren(stone, el('span', 'r1-seal-label', label));
      const proxy = button('', 'group', () => openArts(b.dataset.group));
      proxy.dataset.r1Group = b.dataset.group; proxy.setAttribute('aria-label', label);
      proxy.innerHTML = stone.outerHTML; proxy.append(el('span', 'r1-seal-label', label)); threeRack.append(proxy);
    }
  }
  function decorateTools() {
    for (const [i, b] of [...$('inkTools').querySelectorAll('[data-tool]')].entries()) {
      if (b.dataset.r1Decorated) continue;
      const nodes = [...b.childNodes], name = b.querySelector('.ink-tool-name')?.textContent || b.textContent;
      decorations.push(() => { b.replaceChildren(...nodes); delete b.dataset.r1Decorated; }); b.dataset.r1Decorated = 'true';
      b.setAttribute('aria-label', b.title || name); b.replaceChildren();
      const symbols = el('span', 'r1-tool-symbols'); symbols.innerHTML = crown + ring;
      b.append(symbols, el('span', 'r1-tool-glyph', name.slice(0, 1)), el('span', 'ink-tool-name', name));
      const sigil = el('span', 'r1-tool-foot'); sigil.innerHTML = foot(i); b.append(sigil);
    }
  }
  decorateGroups(); decorateTools();
  observe($('inkTools'), decorateTools, { childList: true });
  listen($('inkGroups'), 'click', event => { const b = event.target.closest('[data-group]'); if (b) openArts(b.dataset.group); });

  // Original top-level controls remain the same DOM nodes with the same listeners.
  const system = add(app, el('div', 'r1-system')); system.id = 'r1System';
  const systemRow = el('div', 'r1-system-row'); system.append(systemRow);
  move($('inkBtnMenu'), systemRow); move($('inkBtnHelp'), systemRow);
  const settings = add(app, el('section', 'r1-settings')); settings.id = 'r1Settings'; settings.hidden = true; settings.setAttribute('aria-label', '天地卷匣');
  const settingsHead = el('header', 'r1-arts-head'); settingsHead.append(el('h2', '', '天地卷匣'), button('合匣', 'r1-jue', () => showSettings(false))); settings.append(settingsHead);
  const settingsToggle = button('世设', 'r1-jue', () => showSettings(settings.hidden)); settingsToggle.setAttribute('aria-controls', settings.id); settingsToggle.setAttribute('aria-expanded', 'false'); systemRow.append(settingsToggle);
  function showSettings(open) {
    settings.hidden = !open; settingsToggle.setAttribute('aria-expanded', String(open));
    if (open) { sandbox.render3d?.clearCameraKeys?.(); settingsHead.querySelector('button').focus({ preventScroll: true }); }
    else if (sandbox.render3d?.active) sandbox.render3d.canvas?.focus({ preventScroll: true });
    else settingsToggle.focus({ preventScroll: true });
  }
  move(footerClusters[3], settings); move($('inkFpsPill'), settings); move($('inkCombatFx')?.closest('label'), settings); move($('inkSpeedPill'), settings);
  move(footerClusters[4], system); move($('inkWorldInfo'), system);
  const clock = footerClusters[0]; clock.id = 'r1Clock';
  const date = el('div', 'r1-date'); generated.push(date); const dial = el('span', 'r1-dial');
  dial.innerHTML = '<svg viewBox="-24 -24 48 48" aria-hidden="true"><circle r="20"/><path d="M0-20V-15M20 0H15M0 20V15M-20 0H-15M14-14L11-11M14 14L11 11M-14 14L-11 11M-14-14L-11-11"/><path class="r1-hand" d="M0 0L5-16"/><circle r="2"/></svg>';
  date.append(dial); move($('inkTimePill'), date); clock.insertBefore(date, $('inkSpeedBar'));
  const canvasView = add(app, el('nav', 'r1-canvas-view')); canvasView.id = 'r1CanvasView'; canvasView.setAttribute('aria-label', '舆图视图');
  move(footerClusters[2], canvasView);
  const canvasToggle = button('立体沙盘', 'r1-jue', async () => {
    if (enteringThree) return;
    enteringThree = true; canvasToggle.setAttribute('aria-busy', 'true'); sync();
    try { await enterRender3D(sandbox); }
    catch (error) { sandbox.notify('三维沙盘暂未载入，请稍后重试。'); console.warn('Render3D entry:', error); }
    finally { enteringThree = false; canvasToggle.removeAttribute('aria-busy'); sync(); }
  });
  canvasToggle.title = '进入立体沙盘，保留当前世界';
  canvasView.prepend(canvasToggle);

  const realmBar = add(app, el('nav', 'r1-realm-bar')); realmBar.setAttribute('aria-label', '三界视界');
  const realmButtons = [];
  for (const [plane, label, glyph] of [['mortal', '凡界', 'shan'], ['upper', '上界', 'xian'], ['nether', '幽冥', 'you']]) {
    const b = button('', 'r1-realm', async () => {
      try {
        if (!sandbox.render3d?.active) await enterRender3D(sandbox);
        if (!sandbox.render3d?.setDisplayPlane?.(plane)) sandbox.notify(`暂不能进入${label}`, 2400);
      } catch (error) {
        sandbox.notify(`暂不能进入${label}，请稍后重试。`, 2400);
        console.warn('Realm entry:', error);
      }
      sync();
    });
    b.title = `直接进入${label}整界；局部划窗请用视界符匣`;
    const icon = el('span'); icon.innerHTML = seal(glyph, 'round'); b.append(icon, el('span', '', label)); b.dataset.realmPlane = plane; realmBar.append(b); realmButtons.push(b);
  }

  let nativePanel = null;
  function mountNativePanel() {
    const panel = $('inkRender3DTools'); if (!panel || panel === nativePanel) return;
    nativePanel = panel; panel.classList.add('r1-native-panel');
    const original = [...panel.childNodes];
    const view = el('nav', 'r1-native-view'); view.setAttribute('aria-label', '沙盘视图');
    const sheet = el('section', 'r1-arts-sheet r1-native-arts'); sheet.id = 'r1NativeArts'; sheet.setAttribute('aria-label', '沙盘符匣');
    const h = head('山形'); nativeTitle = h.heading; sheet.append(h.header);
    const strips = el('div', 'r1-native-strips'); sheet.append(strips);
    for (const node of original) {
      const action = node.dataset?.action;
      if (['fit', 'scenic', 'focus', 'toggle'].includes(action)) view.append(node);
      else sheet.append(node);
    }
    panel.append(view, sheet);
    decorations.push(() => { panel.replaceChildren(...original); panel.classList.remove('r1-native-panel'); });
    const select = panel.querySelector('select[aria-label="沙盘工具"]');
    for (const [i, option] of [...select.options].entries()) {
      const b = button('', 'ink-tool', () => { select.value = option.value; select.dispatchEvent(new win.Event('change', { bubbles: true })); sync(); });
      b.dataset.nativeMode = option.value;
      b.dataset.nativeGroup = TOOL_BY_ID[option.value]?.group || (option.value.startsWith('view') ? 'view' : 'terrain');
      b.title = TOOL_BY_ID[option.value]?.hint || option.textContent;
      const symbols = el('span', 'r1-tool-symbols'); symbols.innerHTML = crown + ring;
      const sigil = el('span', 'r1-tool-foot'); sigil.innerHTML = foot(i);
      b.append(symbols, el('span', 'r1-tool-glyph', option.textContent[0]), el('span', 'ink-tool-name', option.textContent), sigil); strips.append(b);
    }
    listen(select, 'change', sync); sync();
  }

  // The four prototype volumes contain the actual existing observation sections.
  const summary = add(right, el('div', 'r1-world-summary')); summary.id = 'r1WorldSummary';
  const shelfHead = el('header', 'r1-shelf-head'); generated.push(shelfHead); const shelfTitle = el('h2', '', '山河异志');
  shelfHead.append(shelfTitle, button('收卷', 'r1-jue', () => {
    if (win.matchMedia('(max-width:1080px)').matches) $('inkExperienceClose').click();
    else body.classList.toggle('r1-shelf-folded');
  })); right.append(shelfHead);
  const volumes = new Map();
  const volumeNames = { yi: '山河异志', nian: '编年', gua: '记挂', shi: '势力' };
  const tabs = add(app, el('nav', 'r1-volume-tabs')); tabs.id = 'r1VolumeTabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '异志分卷'); tabs.setAttribute('aria-orientation', 'vertical');
  const sectionTitles = [...right.children].filter(n => n.classList.contains('sec-title'));
  for (const [key, name] of Object.entries(volumeNames)) {
    const volume = add(right, el('section', 'r1-volume')); volume.id = `r1Volume-${key}`; volume.setAttribute('role', 'tabpanel'); volumes.set(key, volume);
    const tab = button(name, 'r1-volume-tab', () => selectVolume(key)); tab.id = `r1VolumeTab-${key}`;
    tab.dataset.volume = key; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', volume.id); volume.setAttribute('aria-labelledby', tab.id); tabs.append(tab);
  }
  for (const title of sectionTitles) {
    const content = title.nextElementSibling, name = title.dataset.secKey || title.textContent.replace(/[▾▸]/g, '').trim();
    const key = name === '势力' || name === '仙道' ? 'shi' : name === '编年' || name === '史册' ? 'nian' : name === '记挂' || name.startsWith('天道') || name === '值得关注' || name === '最近看过' ? 'gua' : 'yi';
    const target = name === '世界' ? summary : volumes.get(key); move(title, target);
    if (content?.classList.contains('sec-body')) move(content, target);
  }
  move($('inkObserveEcho'), volumes.get('yi'));
  move($('inkWanling'), volumes.get('yi'));
  move($('inkTransitPanel'), volumes.get('yi'));
  if ($('inkObserveEcho')) volumes.get('yi').prepend($('inkObserveEcho'));
  if ($('inkTransitPanel')) volumes.get('yi').prepend($('inkTransitPanel'));
  if ($('inkWanling')) volumes.get('yi').prepend($('inkWanling'));
  right.prepend(summary); move(doc.querySelector('.p1-observe-nav'), right); right.insertBefore(doc.querySelector('.p1-observe-nav'), shelfHead);
  const collapse = $('inkBtnCollapseAll'); if (collapse) { move(collapse, settings); }
  function selectVolume(key, reveal = true) {
    activeVolume = key; body.classList.remove('r1-shelf-folded'); shelfTitle.textContent = volumeNames[key];
    for (const [id, volume] of volumes) volume.hidden = id !== key;
    for (const tab of tabs.children) { const selected = tab.dataset.volume === key; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; }
    if (reveal && win.matchMedia('(max-width:1080px)').matches && $('inkExperienceOpen').getAttribute('aria-expanded') !== 'true') $('inkExperienceOpen').click();
  }
  selectVolume('yi', false);
  listen(tabs, 'keydown', event => {
    const order = [...tabs.children], index = order.indexOf(doc.activeElement); if (index < 0) return;
    const next = event.key === 'ArrowDown' ? (index + 1) % order.length : event.key === 'ArrowUp' ? (index + order.length - 1) % order.length : event.key === 'Home' ? 0 : event.key === 'End' ? order.length - 1 : -1;
    if (next < 0) return; event.preventDefault(); selectVolume(order[next].dataset.volume); order[next].focus();
  });
  listen(right, 'click', event => { const target = event.target.closest('[data-experience-target]')?.dataset.experienceTarget; if (target) selectVolume(target === 'watch' ? 'gua' : 'yi', false); }, true);

  const illustration = $('inkBusanziPortrait')?.querySelector('img');
  if (illustration) {
    const old = illustration.getAttribute('src'); illustration.src = './assets/characters/busanzi/materials/busanzi_illustration.png';
    illustration.closest('button').classList.add('r1-illustrated');
    decorations.push(() => { illustration.src = old; illustration.closest('button')?.classList.remove('r1-illustrated'); });
  }
  const backdrop = add(body, el('div', 'r1-book-backdrop')); backdrop.id = 'r1BookBackdrop'; backdrop.hidden = true;
  const card = $('inkPersonDetail');
  // Fixed descendants of the WebGL stage would remain below its sibling shelf.
  // Keep the same official card node and listeners, outside that stacking context.
  move(card, body);
  listen(backdrop, 'click', () => card.querySelector('[data-g1-action="close"]')?.click());
  function syncBook() {
    const open = card.classList.contains('on'); if (open === bookOpen) return;
    bookOpen = open; backdrop.hidden = !open;
    if (open) {
      bookOpener = doc.activeElement; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', '人物命簿');
      sandbox.render3d?.clearCameraKeys?.(); card.querySelector('[data-g1-action="close"]')?.focus({ preventScroll: true });
    } else {
      card.removeAttribute('role'); card.removeAttribute('aria-modal'); card.removeAttribute('aria-label');
      if (bookOpener?.isConnected) bookOpener.focus({ preventScroll: true }); bookOpener = null;
    }
  }
  observe(card, syncBook, { attributes: true, attributeFilter: ['class'] });
  listen(win, 'keydown', event => {
    const layer = blockingInputLayer(doc);
    if (layer && layer !== card) {
      if (layer.id === 'inkHelp' && event.key === 'Tab') {
        const nodes = [...layer.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(n => n.tabIndex >= 0 && n.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && (doc.activeElement === first || !layer.contains(doc.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (doc.activeElement === last || !layer.contains(doc.activeElement))) { event.preventDefault(); first?.focus(); }
      }
      return;
    }
    if (!bookOpen && !settings.hidden && event.key === 'Escape') { showSettings(false); event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (!bookOpen || layer !== card) return;
    if (event.key === 'Tab') {
      const nodes = [...card.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(n => n.tabIndex >= 0 && n.getClientRects().length && !n.closest('[hidden]'));
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && (doc.activeElement === first || !card.contains(doc.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (doc.activeElement === last || !card.contains(doc.activeElement))) { event.preventDefault(); first?.focus(); }
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey && /^[wasdqefr]$/i.test(event.key) && !event.target.closest('input,textarea,select,[contenteditable="true"]')) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);

  function sync() {
    if (disposed) return;
    const three = !!sandbox.render3d?.active; body.dataset.r1Mode = three ? '3d' : 'canvas';
    body.dataset.r1Realm = three ? sandbox.render3d.renderer.activePlane : 'mortal';
    const quick = $('inkWanlingQuick'), sheet = three ? $('r1NativeArts') : canvasArts;
    if (quick && sheet && quick.parentNode !== sheet) sheet.insertBefore(quick, (three ? sheet.querySelector('.r1-native-strips') : $('inkTools'))?.nextSibling || null);
    sandbox.wanlingSelection?.refresh();
    const mode = three ? sandbox.render3d.mode : sandbox.toolId;
    for (const b of realmButtons) b.setAttribute('aria-pressed', String(b.dataset.realmPlane === body.dataset.r1Realm));
    for (const b of threeRack.children) b.classList.toggle('on', b.dataset.r1Group === activeGroup && body.dataset.r1Arts === 'open');
    for (const b of nativePanel?.querySelectorAll('[data-native-mode]') || []) { b.hidden = b.dataset.nativeGroup !== activeGroup; b.classList.toggle('on', b.dataset.nativeMode === mode); }
    const pause = $('inkBtnPause'); pause.setAttribute('aria-label', pause.classList.contains('on') ? '继续岁月' : '暂停岁月');
    canvasToggle.disabled = enteringThree;
  }
  observe(left, sync, { attributes: true, attributeFilter: ['inert'] });
  observe($('inkBtnPause'), sync, { attributes: true, attributeFilter: ['class'] });
  observe(doc.querySelector('.stage'), mountNativePanel, { childList: true });
  listen(doc, 'change', sync);
  listen(doc, 'pointerup', () => win.requestAnimationFrame(sync));
  listen(win, 'resize', () => { if (!settings.hidden) settings.hidden = true; sync(); });
  mountNativePanel(); syncBook(); sync();

  const dispose = () => {
    if (disposed) return; disposed = true; observers.forEach(o => o.disconnect()); listeners.forEach(remove => remove());
    for (const { node, parent, next } of moves.reverse()) if (parent) parent.insertBefore(node, next?.parentNode === parent ? next : null);
    decorations.reverse().forEach(restore => restore()); generated.reverse().forEach(n => n.remove());
    body.classList.remove('r1-scroll-ui', 'r1-shelf-folded');
    for (const key of ['r1Arts', 'r1Mode', 'r1Realm']) delete body.dataset[key]; mounted.delete(doc);
  };
  mounted.set(doc, dispose); return dispose;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', () => bindSecretScrollUi(window.inkbox), { once: true });
}
