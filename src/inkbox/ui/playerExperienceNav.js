// P1 玩家观察入口。只操作已存在的 DOM / 折叠区；不接触 World、RNG、存档或渲染器。
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
    const body = target.nextElementSibling;
    // 原折叠监听是唯一的状态/偏好写入者；不要直接强改 collapsed 类。
    if (target.classList.contains('collapsed') || body?.classList.contains('collapsed')) target.click();
    target.scrollIntoView({ block: 'start', inline: 'nearest' });
    target.focus({ preventScroll: true });
  }

  listen(observeOpen, 'click', () => {
    if (openSide === 'right') close();
    else show('right', observeOpen);
  });
  listen(toolsOpen, 'click', () => {
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

  return () => { close({ restoreFocus: false }); listeners.forEach(remove => remove()); };
}

// 主程序完成 boot / 正式分区包装之后再绑定；不改变 main.js 或模拟时序。
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', () => bindPlayerExperienceNav(), { once: true });
}
