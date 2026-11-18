// P1 玩家观察入口。只操作已存在的 DOM / 折叠区；不接触 World、RNG、存档或渲染器。
import { blockingInputLayer } from './inputLayers.js';
export function bindPlayerExperienceNav(doc = document, win = window) {
  const $ = id => doc.getElementById(id);
  const right = doc.querySelector('.rail.right');
  const left = doc.querySelector('.rail.left');
  const scrim = $('inkExperienceScrim');
  const observeOpen = $('inkExperienceOpen');
  const toolsOpen = $('inkToolsOpen');
  const observeClose = $('inkExperienceClose');
  const toolsClose = $('inkToolsClose');
  if (!right || !left || !scrim || !observeOpen || !observeClose || !toolsOpen || !toolsClose) return () => {};

  const targets = {
    journal: $('inkJournalTitle'),
    combat: $('inkCombatTitle'),
    environment: $('inkEnvironmentTitle'),
    watch: $('inkWatchTitle'),
  };
  const atMost = width => win.matchMedia(`(max-width: ${width}px)`).matches;
  const listeners = [];
  const listen = (el, name, fn, options) => {
    el.addEventListener(name, fn, options);
    listeners.push(() => el.removeEventListener(name, fn, options));
  };
  let openSide = null;
  let opener = null;

  function close({ restoreFocus = true } = {}) {
    if (!openSide) return;
    right.classList.remove('p1-open');
    left.classList.remove('p1-open');
    right.removeAttribute('aria-modal');
    left.removeAttribute('aria-modal');
    scrim.hidden = true;
    observeOpen.setAttribute('aria-expanded', 'false');
    toolsOpen.setAttribute('aria-expanded', 'false');
    openSide = null;
    if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }
  function show(side, source) {
    if (openSide) close({ restoreFocus: false });
    openSide = side;
    opener = source;
    const rail = side === 'right' ? right : left;
    rail.classList.add('p1-open');
    rail.setAttribute('aria-modal', 'true');
    scrim.hidden = false;
    (side === 'right' ? observeOpen : toolsOpen).setAttribute('aria-expanded', 'true');
    (side === 'right' ? observeClose : toolsClose).focus({ preventScroll: true });
  }
  function reveal(target) {
    if (!target) return;
    if (target.id === 'inkJournalTitle' && !target.parentElement.open) target.click();
    const body = target.nextElementSibling;
    // Preserve the original section-state/prefs listener. A fast-jump must not race
    // against its 350ms max-height animation, otherwise Three can land a heading
    // ABOVE the sticky toolbar even while DOM focus is correct.
    if (target.classList.contains('collapsed') || body?.classList.contains('collapsed')) {
      const style = body?.style;
      const previous = style?.transition;
      if (style) style.transition = 'none';
      target.click();
      if (style) {
        void body.offsetHeight; // settle the opened section before measuring geometry
        style.transition = previous;
      }
    }
    if (typeof right.getBoundingClientRect === 'function'
      && typeof target.getBoundingClientRect === 'function') {
      // Scroll ONLY the actual right rail, not every scrollable ancestor.
      // Browser scrollIntoView may complete asynchronously after a Three resize.
      const railBox = right.getBoundingClientRect();
      const bar = right.querySelector?.('.p1-observe-nav');
      const barHeight = bar?.getBoundingClientRect?.().height || 0;
      const headBox = target.getBoundingClientRect();
      right.scrollTop = Math.max(0, right.scrollTop + headBox.top - railBox.top - barHeight - 8);
    } else {
      // Lightweight DOM contract runner has no geometry engine.
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    target.focus({ preventScroll: true });
  }

  listen(observeOpen, 'click', () => {
    if (openSide === 'right') close();
    else show('right', observeOpen);
  });
  listen(toolsOpen, 'click', () => {
    // Three 的正式工具栏另有入口；不可打开被引擎主动设为 inert 的 Canvas 神力栏。
    if (left.inert) return;
    if (openSide === 'left') close();
    else show('left', toolsOpen);
  });
  listen(observeClose, 'click', () => close());
  listen(toolsClose, 'click', () => close());
  listen(scrim, 'click', () => close());
  for (const button of doc.querySelectorAll('[data-experience-target]')) {
    listen(button, 'click', () => {
      if (atMost(1080) && openSide !== 'right') show('right', observeOpen);
      reveal(targets[button.dataset.experienceTarget]);
    });
  }
  // 先于游戏原有 Escape 分层处理抽屉，避免一次按键同时关闭人物卡/视界。
  listen(win, 'keydown', event => {
    // An open book/help/viewer owns keyboard focus above the underlying drawer.
    if (blockingInputLayer(doc)) return;
    if (!openSide) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const rail = openSide === 'right' ? right : left;
    const focusable = Array.from(rail.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex="0"]'))
      .filter(el => el.getClientRects().length > 0 && !el.closest('.sec-body.collapsed'));
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (doc.activeElement === first || !rail.contains(doc.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (doc.activeElement === last || !rail.contains(doc.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }, true);
  listen(win, 'resize', () => {
    if ((openSide === 'right' && !atMost(1080)) || (openSide === 'left' && !atMost(720))) close();
  });

  const inertObserver = typeof win.MutationObserver === 'function'
    ? new win.MutationObserver(() => { if (left.inert && openSide === 'left') close(); }) : null;
  inertObserver?.observe(left, { attributes: true, attributeFilter: ['inert'] });
  return () => { close({ restoreFocus: false }); inertObserver?.disconnect(); listeners.forEach(remove => remove()); };
}

// 主程序完成 boot / 正式分区包装之后再绑定；不改变 main.js 或模拟时序。
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', () => bindPlayerExperienceNav(), { once: true });
}
