// 水墨沙盒 · UX/QoL 填缝包的 **DOM 侧控制器**（QOL_PASS1）
//
// ───────────────────────────────────────────────────────────────────────
// 这个模块负责什么
// ───────────────────────────────────────────────────────────────────────
//
// `ui/qolState.js` 回答「该怎么做」（Escape 关哪一层、焦点在不在输入框里、
// 折叠到第几条、槽位那一行写什么）；本文件回答「**把答案接到界面上**」：
// 读 DOM、写 DOM、读写 localStorage、挂事件。
//
// 它是**唯一**同时具备这三种能力的 QoL 模块，所以它也是唯一需要被
// `main.js` 持有的一个：`boot()` 里一行 `this.qol = createQol(this)`。
//
// ⚠️ **本模块不改模拟**。它读 `sb.world` 只读事实（`world.day`、`world.seed`、
//    `world.watch` 的未读数），一处 `world.xxx = ` 赋值都没有。
//    它自己持有的状态（偏好 / 最近看过 / dirty / 忙碌按钮）**全在内存或
//    localStorage 的 UI 键里**，不进 `World`、不进正式存档、不抽 RNG。
//    删掉本文件、把调用点去掉，模拟结果逐字不变。
//
// ⚠️ **依赖 DOM**，所以 node 里 import 不了——能纯跑的那一半全在 `qolState.js`。
//    本文件靠浏览器回归（`scripts/inkbox-playtest.mjs`）守。

import {
  UI_PREFS_KEY, LEGACY_SECTION_KEY,
  sanitizeUiPrefs, serializeUiPrefs, withSectionCollapsed, withFoldExpanded,
  withHelpSeen, migrateLegacySections, defaultUiPrefs,
  SLOT_META_KEY, sanitizeSlotMeta, withSlotMeta, withoutSlotMeta,
  pushRecent, RECENT_CAP,
  nextEscapeAction, isTextEntryTarget,
  quotaWarning, describeSaveError,
  slotLabel, exportFileName,
  dirtyAfterEvent, dirtyAfterPersist, needsDiscardConfirm,
  speedStatusText, toolStateText, inspectPoint, isClickWithinDrag,
  toastLocation, toastHint,
} from './qolState.js';
import { watchNewsCount } from '../sim/watch.js';
// 档位表（Q6 的文字状态要它）。**纯 config，零副作用**——不是模拟模块。
import { TIME } from '../core/config.js';
// 观井初课（Q31）：原作新手引导文案，此前是**零读者常量**（见 lore.js 的说明）。
// 帮助层把它摆出来——不新增状态、不新增存档字段，只是给那段文案一个出口。
import { FIRST_LESSON } from '../core/lore.js';

const $ = (id) => document.getElementById(id);

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

/** localStorage 读一个键（不可用 / 抛错时当作没有）。 */
function readKey(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

/** localStorage 写一个键。返回是否写成功——**调用方要能知道失败**（配额满了）。 */
function writeKey(key, value) {
  try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
}

// ── 帮助层的内容（Q31 / Q32 / Q33 的替代出口）────────────────────────
/**
 * 帮助层里的键位表。
 *
 * ⚠️ 事实来源是 `PLAYER_GUIDE.md`（「空格 / 1-6 / [ ] / G / V / W / H / Ctrl+Z /
 *    右键拖拽 / 滚轮」）与 `main.js` 的 keydown 实现。**两处必须一致**——
 *    帮助里写着一个按不出来的键，比没有帮助更坏。
 * ⚠️ 不用「九步新手引导」：本仓**没有**那套 UI（`FIRST_LESSON` 此前零读者），
 *    所以这里只摆**真的存在**的键位与那段初课文案。
 */
export const HELP_KEYS = Object.freeze([
  ['空格', '暂停 / 继续'],
  ['1 – 6', '时间倍速（停 · 缓 · 常 · 疾 · 迅 · 飞）'],
  ['[ ]', '笔刷缩小 / 放大'],
  ['G', '网格'],
  ['V', '立体视图'],
  ['W', '战争显示'],
  ['H', '回到全图'],
  ['Ctrl+Z', '撤销上一笔'],
  ['?', '打开 / 关闭这一页'],
  ['Esc', '逐层退回（关弹窗 → 关浮层 → 关视界 → 关检视）'],
]);

export const HELP_MOUSE = Object.freeze([
  ['左键', '落笔 · 划选视界 · 点开检视'],
  ['右键拖拽', '平移地图'],
  ['滚轮', '缩放（只在图上；在右栏上是滚列表）'],
]);

// ── 控制器 ───────────────────────────────────────────────────────────

/**
 * @param {object} sb `Sandbox` 实例。本控制器要用到：
 *   `world` / `selection` / `selectPath` / `history` / `camera` / `focusPulses` /
 *   `notify()` / `closeRealmView()` / `hidePersonCard()` / `hideDeadBiography()` /
 *   `showPersonCard()` / `showDeadBiography()` / `inspectAt()` / `refreshFolds()` /
 *   `refreshSlots()` / `refreshRecent()`
 */
export function createQol(sb) {
  // ── 内存状态（全部是 UI runtime，不进 World）──────────────────────
  /** UI 偏好缓存（白名单见 qolState.UI_PREFS_FIELDS） */
  let prefs = defaultUiPrefs();
  /** 槽位侧索引缓存 */
  let slotMeta = {};
  /** 「最近看过」（Q13）：最多 RECENT_CAP 条，换世界 / 读档清空 */
  let recent = [];
  /** Q21 的 dirty 标志。**不是**模拟字段。 */
  let dirty = false;
  /** 正在跑的异步命令（Q38 / Q39）：`Set<buttonId>` */
  const busy = new Set();
  /** 确认条当前的回调 */
  let confirmCb = null;
  /** 当前 Toast 能不能点、点了去哪（Q11） */
  let toastTarget = null;
  /** 帮助层是否看过（Q29 的 helpSeen，用来少说一句废话） */
  let helpNudged = false;

  // ── 启动时把两份 localStorage 读进来 ──────────────────────────────
  // ⚠️ 旧键 `inkbox.sec` **只读一次**，用来把玩家已有的折叠习惯搬进新键。
  //    搬完不再写旧键——两个键同时写，「哪一份是真的」就变成第二个真相。
  prefs = migrateLegacySections(readKey(LEGACY_SECTION_KEY), sanitizeUiPrefs(readKey(UI_PREFS_KEY)));
  slotMeta = sanitizeSlotMeta(readKey(SLOT_META_KEY));
  helpNudged = prefs.helpSeen === true;

  function persistPrefs(next) {
    prefs = sanitizeUiPrefs(next);
    writeKey(UI_PREFS_KEY, serializeUiPrefs(prefs));
  }

  function persistSlotMeta(next) {
    slotMeta = sanitizeSlotMeta(next);
    writeKey(SLOT_META_KEY, JSON.stringify(slotMeta));
  }

  const api = {
    // ── 偏好（Q29）──────────────────────────────────────────────
    prefs() { return sanitizeUiPrefs(prefs); },
    sectionCollapsed(key, fallback = false) {
      const v = prefs.collapsed[String(key)];
      return v === undefined ? fallback : v === true;
    },
    setSectionCollapsed(key, collapsed) {
      persistPrefs(withSectionCollapsed(prefs, key, collapsed));
    },
    foldExpanded(key) { return prefs.folds[String(key)] === true; },
    setFoldExpanded(key, expanded) {
      persistPrefs(withFoldExpanded(prefs, key, expanded));
      // 折叠是**纯展示**：重画那几块面板即可，不碰世界、不置 dirty。
      if (typeof sb.refreshFolds === 'function') sb.refreshFolds();
    },
    helpSeen() { return helpNudged; },
    markHelpSeen() {
      if (helpNudged) return;
      helpNudged = true;
      persistPrefs(withHelpSeen(prefs, true));
    },

    // ── 槽位侧索引（Q24）────────────────────────────────────────
    slotMeta() { return sanitizeSlotMeta(slotMeta); },
    noteSlotSaved(slot, world) {
      persistSlotMeta(withSlotMeta(slotMeta, slot, {
        seed: world && world.seed, day: world && world.day,
      }));
    },
    forgetSlot(slot) { persistSlotMeta(withoutSlotMeta(slotMeta, slot)); },

    // ── 最近看过（Q13）──────────────────────────────────────────
    recent() { return recent.slice(); },
    noteRecent(item) { recent = pushRecent(recent, item); },
    clearRecent() { recent = []; if (typeof sb.refreshRecent === 'function') sb.refreshRecent(); },

    // ── 记挂未读（Q14）──────────────────────────────────────────
    // ⚠️ 计数走 `sim/watch.js` 的 `watchNewsCount`（**唯一**判据），
    //    本控制器不自己数——自己数就是第二份真相，迟早与红点不一致。
    //    它只读 `world.watch` 与实体的只读事实，不抽 RNG、不写世界。
    watchUnread() { return sb.world ? watchNewsCount(sb.world) : 0; },

    // ── dirty（Q21）─────────────────────────────────────────────
    isDirty() { return dirty; },
    markDirty(event) {
      const next = dirtyAfterEvent(dirty, event);
      const changed = next !== dirty;
      dirty = next;
      if (changed) api.syncUndoState();
      return dirty;
    },
    markPersisted(event) {
      const next = dirtyAfterPersist(event);
      if (next === null) return dirty;
      dirty = next;
      api.syncUndoState();
      return dirty;
    },
    resetDirty() { dirty = false; },
    needsDiscardConfirm() { return needsDiscardConfirm(dirty); },

    /**
     * Q21：在「重新开天 / 读档 / 导入」之前问一句。
     * 不 dirty（或没有确认条元素）时**直接执行**——确认是为了保护玩家，
     * 不是为了拦路。
     */
    guardDiscard(text, onOk) {
      if (!api.needsDiscardConfirm()) { onOk(); return; }
      api.confirm({
        text: text || '当前世界有尚未保存的变化，仍要继续？',
        okLabel: '仍然继续',
        cancelLabel: '先留着',
        onOk,
      });
    },

    // ── 轻量确认条（Q21，**不是** modal）────────────────────────
    confirm({ text, okLabel = '继续', cancelLabel = '取消', onOk, onCancel }) {
      const bar = $('inkConfirm');
      if (!bar) { if (onOk) onOk(); return; }   // 没有确认条就退化成直接执行
      confirmCb = { onOk, onCancel };
      setText($('inkConfirmText'), text || '');
      setText($('inkConfirmOk'), okLabel);
      setText($('inkConfirmCancel'), cancelLabel);
      bar.hidden = false;
      bar.classList.add('on');
      const ok = $('inkConfirmOk');
      if (ok && ok.focus) ok.focus();
    },
    closeConfirm(ok) {
      const bar = $('inkConfirm');
      if (bar) { bar.hidden = true; bar.classList.remove('on'); }
      const cb = confirmCb;
      confirmCb = null;
      if (!cb) return;
      if (ok) { if (cb.onOk) cb.onOk(); } else if (cb.onCancel) cb.onCancel();
    },
    confirmOpen() {
      const bar = $('inkConfirm');
      return Boolean(bar && !bar.hidden);
    },

    // ── 帮助层（Q31 / Q32）──────────────────────────────────────
    openHelp() {
      const layer = $('inkHelp');
      if (!layer) return;
      layer.hidden = false;
      layer.classList.add('on');
      api.markHelpSeen();
    },
    closeHelp() {
      const layer = $('inkHelp');
      if (layer) { layer.hidden = true; layer.classList.remove('on'); }
    },
    helpOpen() {
      const layer = $('inkHelp');
      return Boolean(layer && !layer.hidden);
    },

    // ── 输入框保护（Q2）─────────────────────────────────────────
    // ⚠️ 包装一层是为了让 `main.js` **不必** import `qolState.js`——
    //    判定只在 qolState 里写一份（见该文件头的说明）。
    isTextEntry(el) { return isTextEntryTarget(el); },
    /** Q35：检视坐标的整数守卫（与正式拾取同一套取整规则）。 */
    inspectPoint(x, y) { return inspectPoint(x, y); },
    /** Q42：复用**已有**的 6px 拖动 / 点击阈值，不另立 magic number。 */
    isClickWithinDrag(movedPx, clickPx) { return isClickWithinDrag(movedPx, clickPx); },

    // ── Escape 分层（Q1）────────────────────────────────────────
    /**
     * 此刻各层开没开。**判据只读 DOM 的 `.on` 类与 sandbox 的两个 UI 字段**
     * （`selection` / `selectPath`），不读世界。
     */
    escLayers() {
      const on = (id) => { const n = $(id); return Boolean(n && n.classList.contains('on')); };
      return {
        confirm: api.confirmOpen(),
        help: api.helpOpen(),
        float: on('inkPersonDetail') || on('inkNecroDetail'),
        realmView: Boolean(sb.selection),
        selection: Boolean(sb.selectPath),
        inspect: on('inkInspect'),
      };
    },
    /**
     * 按一下 Escape。**只关最上面那一层**。
     * @returns {boolean} 有没有吃掉这一下（`false` = 什么都没开，调用方别做别的事）
     */
    handleEscape() {
      const layer = nextEscapeAction(api.escLayers());
      if (!layer) return false;
      switch (layer) {
        case 'confirm': api.closeConfirm(false); break;
        case 'help': api.closeHelp(); break;
        // 浮层：人物一生 / 史册传记。两块都是「摊开的一份东西」，一起收。
        case 'float':
          if (typeof sb.hidePersonCard === 'function') sb.hidePersonCard();
          if (typeof sb.hideDeadBiography === 'function') sb.hideDeadBiography();
          break;
        // 视界：走**既有**的关闭路径（Q8 用的是同一条），不新造 selection 语义。
        case 'realmView': sb.closeRealmView('escape'); break;
        // 划选路径还没成型，直接丢掉，并说一声（静默丢弃 = 玩家以为手抖了）。
        case 'selection':
          sb.selectPath = null;
          sb.dirty = true;
          sb.notify('已放弃这次划选', 2000);
          break;
        case 'inspect': {
          const panel = $('inkInspect');
          if (panel) panel.classList.remove('on');
          break;
        }
        default: break;
      }
      return true;
    },

    // ── Toast（Q11 / Q22）───────────────────────────────────────
    /**
     * 写一条提示。`target` 带定位信息时，提示本身变成**入口**
     * （Q11：`focus → inspect`，只有坐标就只定位，什么都没有就保持普通提示）。
     */
    notify(text, ms = 2600, target = null) {
      sb.toast = text;
      sb.toastTimer = ms / 1000;
      const el = $('inkHint');
      if (!el) return;
      const loc = toastLocation(target);
      toastTarget = loc;
      el.textContent = loc ? `${text} ${toastHint(loc)}` : text;
      el.classList.toggle('toast-link', Boolean(loc));
      el.title = loc ? '点此前往' : '';
    },
    /** 当前提示能不能点（测试用）。 */
    toastLocation() { return toastTarget; },
    /** 点提示：按定位信息前往。**纯导航**（镜头 + 检视），不改世界。 */
    gotoToast() {
      const loc = toastTarget;
      if (!loc) return false;
      if (loc.kind === 'entity') {
        if (typeof sb.showPersonCard === 'function') sb.showPersonCard(loc.entityId);
        return true;
      }
      if (loc.kind === 'focus') {
        if (loc.entityId !== null && typeof sb.showPersonCard === 'function') {
          sb.showPersonCard(loc.entityId);
          return true;
        }
        sb.camera.focusOn(loc.x, loc.y, { zoom: Math.max(sb.camera.zoom, 7), duration: 0.75 });
        sb.dirty = true;
        if (typeof sb.inspectAt === 'function') sb.inspectAt(Math.round(loc.x), Math.round(loc.y));
        return true;
      }
      // locate：另一界的坐标。镜头照样滑过去（相机是共用的），
      // 但**不**在凡间开检视卡——那个坐标在凡间是另一回事。
      sb.camera.focusOn(loc.x, loc.y, { zoom: Math.max(sb.camera.zoom, 7), duration: 0.75 });
      sb.dirty = true;
      return true;
    },

    // ── 状态同步（Q5 / Q6 / Q7 / Q4）────────────────────────────
    /** Q5：底部「我手里现在拿的是什么」。工具切换 / 快捷键 / 程序切换都走它。 */
    syncToolState() {
      const el = $('inkToolState');
      if (!el) return;
      setText(el, toolStateText(sb.tool, sb.brushRadius));
    },
    /**
     * Q6：暂停与档位的**文字**状态（与 `#inkSpeedPill` 同一句话的两个形态）。
     *
     * ⚠️ 档位表取 `core/config.js` 的 `TIME.speeds`（**唯一**来源），
     *    不在这里另抄一份「停 / 缓 / 常 / 疾 / 迅 / 飞」——
     *    抄一份的话，将来加第七档时帮助层与这里会**静默地**少一档。
     */
    syncSpeedState() {
      const el = $('inkSpeedState');
      const speed = TIME.speeds[sb.speedIndex] || null;
      const paused = sb.speedIndex === 0;
      if (el) setText(el, speedStatusText(speed, paused));
      const pause = $('inkBtnPause');
      if (pause) {
        pause.classList.toggle('on', paused);
        setText(pause, paused ? '▶ 继续' : '⏸ 暂停');
      }
    },
    /**
     * Q7 / Q4：撤销按钮的可用性。
     * ⚠️ 判据是 `history.stack.length`——**已有状态**，不复制业务判断
     *    （不许自己记一份「能不能撤销」，那份迟早与 History 不一致）。
     */
    syncUndoState() {
      const btn = $('inkBtnUndo');
      if (!btn) return;
      const depth = sb.history && Array.isArray(sb.history.stack) ? sb.history.stack.length : 0;
      const can = depth > 0;
      btn.disabled = !can;
      btn.title = can ? `撤销上一笔（Ctrl+Z）· 可撤 ${depth} 步` : '没有可撤销的操作';
    },
    /** Q39：异步命令的忙碌状态。 */
    setBusy(id, on) {
      if (on) busy.add(id); else busy.delete(id);
      const el = $(id);
      if (el) {
        el.disabled = on || el.dataset.forceDisabled === '1';
        el.setAttribute('aria-busy', on ? 'true' : 'false');
      }
    },
    isBusy(id) { return busy.has(id); },
    /**
     * Q38 / Q39：跑一条**一次性**异步命令，期间按钮 disabled。
     * 双击时第二下直接落空——这正是「防止双击导致重复命令」。
     */
    async runOnce(id, fn) {
      if (busy.has(id)) return undefined;
      api.setBusy(id, true);
      try { return await fn(); } finally { api.setBusy(id, false); }
    },

    // ── 世界信息（Q34）──────────────────────────────────────────
    syncWorldInfo(rendererName) {
      const w = sb.world;
      if (!w) return;
      const seedEl = $('inkInfoSeed');
      if (seedEl) seedEl.textContent = `seed ${w.seed >>> 0}`;
      const presetEl = $('inkInfoPreset');
      if (presetEl) presetEl.textContent = String(sb.presetKey || '');
      const rEl = $('inkInfoRenderer');
      if (rEl) rEl.textContent = rendererName || 'Canvas';
      const box = $('inkWorldInfo');
      if (box) box.title = `点击复制种子 ${w.seed >>> 0}`;
    },
    /** Q34：点一下就把种子复制走——方便玩家反馈 bug 时报世界。 */
    async copySeed() {
      const w = sb.world;
      if (!w) return false;
      const seed = String(w.seed >>> 0);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(seed);
          api.notify(`种子 ${seed} 已复制`, 2400);
          return true;
        }
      } catch (_) { /* 无权限 / 非安全上下文：落到下面的提示 */ }
      api.notify(`种子 ${seed}（复制不可用，请手动记下）`, 4000);
      return false;
    },

    // ── 事件绑定（只挂一次）─────────────────────────────────────
    bind() {
      const hint = $('inkHint');
      if (hint && !hint.dataset.qolBound) {
        hint.dataset.qolBound = '1';
        hint.addEventListener('click', () => api.gotoToast());
      }
      const ok = $('inkConfirmOk');
      if (ok) ok.addEventListener('click', () => api.closeConfirm(true));
      const cancel = $('inkConfirmCancel');
      if (cancel) cancel.addEventListener('click', () => api.closeConfirm(false));
      const helpClose = $('inkHelpClose');
      if (helpClose) helpClose.addEventListener('click', () => api.closeHelp());
      const helpBtn = $('inkBtnHelp');
      if (helpBtn) helpBtn.addEventListener('click', () => api.openHelp());
      const worldInfo = $('inkWorldInfo');
      if (worldInfo) worldInfo.addEventListener('click', () => { void api.copySeed(); });
      // 点帮助层背景也能关（卡片本身不冒泡到背景）
      const layer = $('inkHelp');
      if (layer) {
        layer.addEventListener('click', (ev) => { if (ev.target === layer) api.closeHelp(); });
      }
    },

    // ── 渲染帮助层的内容（静态，挂一次）─────────────────────────
    renderHelp() {
      const keys = $('inkHelpKeys');
      if (keys) {
        keys.innerHTML = HELP_KEYS
          .map(([k, v]) => `<div class="help-row"><kbd>${k}</kbd><span>${v}</span></div>`).join('');
      }
      const mouse = $('inkHelpMouse');
      if (mouse) {
        mouse.innerHTML = HELP_MOUSE
          .map(([k, v]) => `<div class="help-row"><kbd>${k}</kbd><span>${v}</span></div>`).join('');
      }
      const lesson = $('inkHelpLesson');
      if (lesson) {
        lesson.innerHTML = FIRST_LESSON
          .map((s) => `<div class="help-lesson"><b>${s.title}</b>${s.text}</div>`).join('');
      }
    },

    /**
     * 开机时提示一次「按 ? 看快捷键」（Q29 的 helpSeen 就是为它存的：
     * 看过一次就不再念）。
     *
     * ⚠️ 收一个 `prefix`：提示只有**一条**（`#inkHint` 是单槽的），
     *    所以这里不能各发各的——后发的会盖掉先发的，玩家只看得到后一句。
     *    与开机那句「新世界已开 · 种子 N」并成一句说。
     * @param {string} [prefix]
     */
    nudgeHelpOnce(prefix) {
      if (helpNudged) return false;
      api.markHelpSeen();
      const lead = prefix ? `${prefix} · ` : '';
      api.notify(`${lead}按 ? 可看快捷键与门道`, 5200);
      return true;
    },

    // 供 `main.js` 读的几个只读量
    get recentCap() { return RECENT_CAP; },
    describeSaveError,
    quotaWarning,
    /**
     * 槽名 → 玩家可见短名（`auto` → 「自动」）与导出文件名（Q26）。
     *
     * ⚠️ 这两个也走控制器转发，**不是**为了好看：`main.js` 按约定不直接
     *    import `ui/qolState.js`（判定只写一份，不许散回主程序），
     *    所以主程序里 `slotLabel(slot)` 这种**裸调用**会在运行时才炸
     *    （`ReferenceError`，而且是在点「存档」那一刻）。
     *    `test:qol` 里有一条结构断言专门拦这个（见「main.js 不许裸调 qolState」）。
     */
    slotLabel,
    exportFileName,
  };

  api.bind();
  api.renderHelp();
  return api;
}
