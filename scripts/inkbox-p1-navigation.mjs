import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindPlayerExperienceNav } from '../src/inkbox/ui/playerExperienceNav.js';

const html = readFileSync(new URL('../inkbox.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/inkbox/ui/playerExperienceNav.css', import.meta.url), 'utf8');
for (const id of ['inkExperienceRail', 'inkExperienceOpen', 'inkExperienceClose',
  'inkToolsRail', 'inkToolsOpen', 'inkToolsClose', 'inkExperienceScrim',
  'inkCombatTitle', 'inkEnvironmentTitle', 'inkWatchTitle']) {
  assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id + ' must be unique');
}
assert.match(html, /playerExperienceNav\.js/);
assert.match(html, /playerExperienceNav\.css/);
assert.match(css, /max-width:\s*1080px/);
assert.match(css, /max-width:\s*720px/);

function fakeDOM() {
  const map = new Map();
  const doc = {
    activeElement: null,
    getElementById(id) { return map.get(id); },
    querySelector(selector) {
      if (selector === '.rail.right') return map.get('inkExperienceRail');
      if (selector === '.rail.left') return map.get('inkToolsRail');
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-experience-target]') return shortcuts;
      throw Error('unexpected document selector ' + selector);
    },
  };
  function element(id) {
    const handlers = new Map(), attrs = new Map(), classes = new Set();
    const item = {
      id, isConnected: true, hidden: false, dataset: {}, parent: null,
      classList: {
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        contains(name) { return classes.has(name); },
      },
      addEventListener(name, fn) {
        if (!handlers.has(name)) handlers.set(name, new Set());
        handlers.get(name).add(fn);
      },
      removeEventListener(name, fn) { handlers.get(name)?.delete(fn); },
      dispatch(name, event = {}) { for (const fn of handlers.get(name) || []) fn(event); },
      click() { this.dispatch('click', { target: this }); },
      setAttribute(key, value) { attrs.set(key, String(value)); },
      getAttribute(key) { return attrs.get(key); },
      removeAttribute(key) { attrs.delete(key); },
      focus() { doc.activeElement = this; },
      scrollIntoView() { this.scrolls = (this.scrolls || 0) + 1; },
      getClientRects() { return [{}]; },
      closest(selector) { return selector === '.sec-body.collapsed' ? null : null; },
      contains(other) { return other === this || other?.parent === this; },
      querySelectorAll(selector) {
        if (selector.includes('button:not')) return this.focusables || [];
        throw Error('unexpected element selector ' + selector);
      },
    };
    map.set(id, item);
    return item;
  }
  const right = element('inkExperienceRail'), left = element('inkToolsRail');
  const observeOpen = element('inkExperienceOpen'), toolsOpen = element('inkToolsOpen');
  const observeClose = element('inkExperienceClose'), toolsClose = element('inkToolsClose');
  right.focusables = [observeClose]; left.focusables = [toolsClose];
  observeClose.parent = right; toolsClose.parent = left;
  const scrim = element('inkExperienceScrim');
  scrim.hidden = true;
  const titles = [element('inkCombatTitle'), element('inkEnvironmentTitle'), element('inkWatchTitle')];
  for (const title of titles) {
    const body = element(title.id + '-body');
    title.nextElementSibling = body;
    title.addEventListener('click', () => {
      title.classList.remove('collapsed'); body.classList.remove('collapsed');
    });
  }
  const shortcuts = ['combat', 'environment', 'watch'].map(key => {
    const button = element('shortcut-' + key);
    button.dataset.experienceTarget = key;
    button.parent = right;
    return button;
  });
  const winHandlers = new Map(); let width = 1366;
  const win = {
    matchMedia(query) { return { matches: width <= Number(/max-width:\s*(\d+)px/.exec(query)[1]) }; },
    addEventListener(name, fn) {
      if (!winHandlers.has(name)) winHandlers.set(name, new Set());
      winHandlers.get(name).add(fn);
    },
    removeEventListener(name, fn) { winHandlers.get(name)?.delete(fn); },
    dispatch(name, event = {}) { for (const fn of winHandlers.get(name) || []) fn(event); },
  };
  return { doc, win, right, left, scrim, shortcuts, titles, observeOpen, toolsOpen,
    observeClose, toolsClose, setWidth(n) { width = n; win.dispatch('resize'); } };
}

const env = fakeDOM();
const unbind = bindPlayerExperienceNav(env.doc, env.win);
const [combat, environment, watch] = env.titles;

// 1366 / 1280 桌面：跳转折叠节，不改 World，不弹模态抽屉。
combat.classList.add('collapsed');
combat.nextElementSibling.classList.add('collapsed');
env.shortcuts[0].click();
assert.equal(combat.classList.contains('collapsed'), false);
assert.equal(combat.scrolls, 1);
assert.equal(env.scrim.hidden, true);
assert.equal(env.doc.activeElement, combat);
env.setWidth(1280);
env.shortcuts[2].click();
assert.equal(watch.scrolls, 1);

// 960：右栏从 display:none 转为可操作抽屉，Escape 只关闭这一层。
env.setWidth(960);
env.observeOpen.click();
assert.equal(env.right.classList.contains('p1-open'), true);
assert.equal(env.observeOpen.getAttribute('aria-expanded'), 'true');
assert.equal(env.scrim.hidden, false);
assert.equal(env.doc.activeElement, env.observeClose);
env.shortcuts[1].click();
assert.equal(environment.scrolls, 1);
let prevented = 0, stopped = 0;
env.win.dispatch('keydown', { key: 'Escape',
  preventDefault() { prevented++; }, stopImmediatePropagation() { stopped++; } });
assert.equal(prevented, 1);
assert.equal(stopped, 1);
assert.equal(env.right.classList.contains('p1-open'), false);
assert.equal(env.doc.activeElement, env.observeOpen);
assert.equal(env.scrim.hidden, true);

// 680：左栏也可达；遮罩关闭和返回焦点有效。
env.setWidth(680);
env.toolsOpen.click();
assert.equal(env.left.classList.contains('p1-open'), true);
assert.equal(env.scrim.hidden, false);
env.scrim.click();
assert.equal(env.left.classList.contains('p1-open'), false);
assert.equal(env.doc.activeElement, env.toolsOpen);

// 展开后跨 breakpoint 应自动清理覆盖层。
env.observeOpen.click();
env.setWidth(1366);
assert.equal(env.right.classList.contains('p1-open'), false);
assert.equal(env.scrim.hidden, true);

// 销毁后再点击不能重新打开抽屉。
unbind();
env.setWidth(960);
env.observeOpen.click();
assert.equal(env.right.classList.contains('p1-open'), false);
console.log('P1 observation navigation: static anchors + desktop/narrow/keyboard/destroy PASS');
