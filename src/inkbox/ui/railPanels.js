// 水墨沙盒 · 右栏观察面板（QOL_PASS1 从 `main.js` 拔出来）
//
// ───────────────────────────────────────────────────────────────────────
// 这个模块负责什么
// ───────────────────────────────────────────────────────────────────────
//
// 「玩家看世界的那些面板」——编年 / 大事记 / 活人榜 / 记挂 / 三界 / 史册 /
// 人物一生 / 关系图 / 卜算子 / 存档槽 / 右栏分区折叠。原先它们全在 `main.js` 里，
// 合计约 750 行，把主程序挤成了一个谁都不敢碰的文件。
//
// QOL_PASS1 的硬约束是 `npm run test:view` 的 V6 ④：
//
//   > `main.js` 行数 ≤ D7 baseline 3084（D8 硬指标）
//
// 本轮要往主程序里加 42 项 QoL 接线，**不可能**在那条硬指标下再塞几百行。
// 所以先把这 750 行搬出来（**纯搬迁**：语义一字不改，只是把 `this.` 换成 `sb.`），
// 主程序只留一行委托 `refreshChronicle() { return refreshChroniclePanel(this); }`。
// 搬完之后主程序比搬迁前更小，V6 ④ 反而更宽松——这是本轮唯一「顺手做」的重构，
// 而它本身不是新功能（删掉本文件、把函数贴回 `main.js` 就等于回到改动前）。
//
// ⚠️ **本模块依赖 DOM**（`document.getElementById`），所以 node 里 import 不了
//    ——这不是缺陷，是分工：能纯跑的判定全在 `ui/qolState.js`，
//    `scripts/inkbox-qol-check.mjs` 测那一份；本文件靠浏览器回归（playtest）守。
//
// ⚠️ 本模块**只读世界**：所有 `world.xxx = ` 赋值一处都没有（唯一的例外是
//    `world.watch` 的增删，那是**玩家观察状态**，D7-E 起就由 `sim/watch.js` 负责）。
//    它不抽 RNG、不改模拟、不进存档。

import { realmLabel } from '../core/cultivation.js';
import { compileCharacterFacts } from '../g1/characterRuntime.js';
import {
  compileBiography, attentionOf, ATTENTION_NAMES, displayName, findEntity, biographyFileName,
} from '../sim/biography.js';
import {
  necrologyList, necrologyStats, findDead, compileDeadBiography,
  exportNecrology, necrologyFileName,
} from '../sim/necrology.js';
import {
  reincarnationStats, ROUTE_LABEL, SOUL_ROUTES, SOUL_ROUTE_POSSESS,
} from '../sim/reincarnation.js';
import { netherGhostStats, netherEcoStats, netherItemStats } from '../sim/netherLife.js';
import { upperEcoStats } from '../world/planes.js';
import {
  WATCH_CAP, isWatched, toggleWatch, watchRows, ensureWatch,
  resolveWatch, markWatchRead, markAllWatchRead, watchNewsCount,
} from '../sim/watch.js';
import {
  busanziRecent, busanziTierName, busanziNextStep,
} from '../sim/busanzi.js';
import { relationGraphSvg, RELATION_GRAPH_MAX } from '../render/relationGraph.js';
import { spawnFocusPulse } from '../render/overlayLayer.js';
import { listSlots } from '../io/save.js';
import {
  UI_PREFS_KEY, LIST_FOLD_LIMIT, foldRows, foldMoreLabel,
  FOLD_COLLAPSE_LABEL, sanitizeUiPrefs, serializeUiPrefs, withSectionCollapsed,
  withFoldExpanded, slotLabel, slotMetaText, collapseAllMap,
} from './qolState.js';

const $ = (id) => document.getElementById(id);

// ── 共享 DOM 小工具 ──────────────────────────────────────────────────
// 周期侧栏只在整段 markup 真正变化时替换 DOM；缓存只持有元素与字符串，
// 不持有 World 或实体引用，换世界后首次渲染仍会按新内容更新。
const periodicMarkup = new WeakMap();

export function setPeriodicMarkup(element, markup) {
  if (!element || periodicMarkup.get(element) === markup) return;
  element.innerHTML = markup;
  periodicMarkup.set(element, markup);
}

export function setTextIfChanged(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

/** 某一块面板上一次渲染的整段 markup（测试与折叠状态用）。 */
export function lastMarkup(element) {
  return periodicMarkup.get(element);
}

/**
 * 一个分区标题的**折叠键**（Q29 持久化用）。
 *
 * ⚠️ 默认取 `textContent`，但**优先认 `data-sec-key`**：`#inkWatchTitle` 的
 *    标题里嵌着一个实时未读数（「天道记挂 · 3」），拿 textContent 当键的话，
 *    键会随计数变化——玩家折起来、刷新一次，键从「天道记挂 · 3」变成
 *    「天道记挂 · 0」，偏好对不上，表现为「折叠没记住」，而且
 *    `inkbox-ui-prefs-v1` 里会**静默地**攒下一串只差一个数字的垃圾键。
 *    给那个标题写死 `data-sec-key="记挂"` 就把键钉住了。
 *
 * ⚠️⚠️ 取 textContent 时**必须先把 `.chev`（▾/▸）摘掉**。那个箭头是
 *    `setupSectionTogglesPanel` 塞进标题里的一个 `<span>`，也是 textContent
 *    的一部分——不摘的话键会变成「世界▾」「势力▾」。两个后果都不报错：
 *      · `collapseAllMap` 拿 `CORE_SECTION_TITLES`（`['世界']`）去比，
 *        `'世界▾' !== '世界'` ⇒ 核心区**照样被折**，「收起全部」看起来像把
 *        界面弄坏了（Q30 明令要避免的正是这个）；
 *      · 偏好键里混进一个纯装饰字符，改名/换箭头字符时偏好集体失配。
 *    用克隆节点摘，**不**动真实 DOM。
 */
export function sectionKey(title) {
  if (!title) return '';
  const fixed = title.dataset ? title.dataset.secKey : '';
  if (fixed) return String(fixed).trim();
  const clone = title.cloneNode(true);
  const chev = clone.querySelector ? clone.querySelector('.chev') : null;
  if (chev && chev.parentNode) chev.parentNode.removeChild(chev);
  return String(clone.textContent || '').trim();
}

// ── 面板容量 ─────────────────────────────────────────────────────────
/** 史册面板一屏渲染多少条（全 800 条塞进 DOM 只会让侧栏滚不动） */
export const NECRO_PANEL_LIMIT = 30;

/** 大事记面板一屏渲染多少条（账本本身封顶在 World.MILESTONE_CAP = 600） */
export const MILESTONE_PANEL_LIMIT = 12;

// 三界面板（Batch 3）的两条上限：都取「一屏看得完」的量级
// （不是为了省 CPU：这些数组本来就只有几十上百条）。
export const UPPER_ARRIVAL_LIMIT = 4;
export const UPPER_MILESTONE_LIMIT = 4;
export const SOUL_POOL_LIMIT = 5;
export const SOUL_BACK_LIMIT = 4;

/** 编年史一屏渲染多少条（Q28：长局之后这里会变成几十屏）。 */
export const CHRONICLE_PANEL_LIMIT = 20;

/**
 * 五路的显示顺序。**从 `SOUL_ROUTES` 派生，不另抄一份字面量**——
 * 抄一份的话，将来有人加了第六路，条形图会**静默地**少画一根，
 * 而账本里那个数照样在涨（故障类 1：字段存在 ≠ 字段生效）。
 */
export const SOUL_ROUTE_ORDER = Object.values(SOUL_ROUTES);

/** 五路各自的条形色。取自 `inkbox.html` 的调色板，缺键兜底成淡墨，不留空白 */
export const SOUL_ROUTE_COLOR = {
  natural: '#4d6b52',
  linger: '#3f5f7d',
  ghost: '#7d776b',
  wraith: '#a8493c',
  gone: '#b3aa97',
};

/** 「两世抉择」的中文（`stepReincarnation` 写进 `pastLife.choice` 的三个值） */
export const PAST_LIFE_CHOICE = {
  inherit: '前世记忆尽数归来',
  fuse: '两世各占一半',
  refuse: '斩断旧债与旧名',
};

/** 位面 id → 玩家可见界名（`main.js` 的 `planeLabel` 只覆盖上界 / 幽冥，凡间要自己补）。 */
function planeTagOf(plane) {
  if (plane === 'upper') return '上界';
  if (plane === 'nether') return '幽冥';
  if (plane === 'unknown') return '去向不可考';
  return '凡间';
}

// ── 值得关注的人物 ───────────────────────────────────────────────────
/**
 * 「值得关注的人物」——**不新建任何评分系统**，只是把已经存在的读数挑出来。
 *
 * 每条规则都简单、透明、可维护，而且都能回答「**为什么**是他」：
 *   当世之巅 = 境界最高（同境界比修为）
 *   最年长   = 年龄最大
 *   名动一方 = `attentionOf` 最高（境界/杀名/法宝/世家 的派生量，见 biography.js）
 *   身怀重宝 = 身上法宝最多
 *   血债累累 = 杀人最多
 *   新晋突破 = 个人日志里最后一条跨大境界记录最新的人
 *   来历不凡 = 身负禁术 / 灵兽 / 是夺舍之身
 *
 * 同一个**人**只出现一次（先到先得，规则按上面这个顺序排）——
 * 一张榜上同一个人占三行，玩家会以为面板坏了。
 *
 * ⚠️ 纯读：不改世界、不抽 rng、不写回实体。面板每 2.5 秒调一次也不会让世界漂。
 */
export function notablePeople(world) {
  const live = [];
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e && e.hp > 0 && (e.level || 0) >= 1) live.push(e);
  }
  if (!live.length) return [];

  const rows = [];
  const taken = new Set();
  const push = (e, reason) => {
    if (!e || taken.has(e.id)) return;
    taken.add(e.id);
    rows.push({ e, reason });
  };
  /** 在 live 里取 `score` 最大的那个；`score` 返回 `null` 表示「此人不是候选」 */
  const top = (score) => {
    let win = null;
    let winScore = -Infinity;
    for (let i = 0; i < live.length; i += 1) {
      const s = score(live[i]);
      if (s === null || s === undefined) continue;
      if (s > winScore) { winScore = s; win = live[i]; }
    }
    return win;
  };

  // ① 当世之巅（这里手写两趟比较，不塞进 top()：它是「境界优先、修为次之」的字典序）
  let peak = null;
  for (let i = 0; i < live.length; i += 1) {
    const e = live[i];
    if (!peak) { peak = e; continue; }
    const lv = e.level || 0;
    const pl = peak.level || 0;
    if (lv > pl || (lv === pl && (e.exp || 0) > (peak.exp || 0))) peak = e;
  }
  push(peak, '当世之巅');

  push(top((e) => (e.age || 0)), '最年长');
  // 注目度 0/1 是「路人 / 乡邻」，上榜没有意义——所以门槛设在 2（一乡之望）
  push(top((e) => {
    const a = attentionOf(world, e);
    return a >= 2 ? a : null;
  }), '名动一方');
  push(top((e) => {
    const n = Array.isArray(e.artifacts) ? e.artifacts.length : 0;
    return n >= 1 ? n : null;
  }), '身怀重宝');
  push(top((e) => {
    const k = e.kills || 0;
    return k >= 3 ? k : null;
  }), '血债累累');
  push(top((e) => {
    const log = e.log;
    if (!Array.isArray(log)) return null;
    for (let i = log.length - 1; i >= 0; i -= 1) {
      if (log[i] && log[i].kind === 'breakthrough') return log[i].day || 0;
    }
    return null;
  }), '新晋突破');
  push(top((e) => ((e.forbidden || e.beast || e.possessedBy) ? 1 : null)), '来历不凡');

  return rows;
}

// ── 纯读辅助 ─────────────────────────────────────────────────────────
/**
 * 境界标签。**`level === 0` 是「凡人」，不是「炼气」**——
 * `realmLabel(0)` 会给出「炼气」（境界表第一档从 0 起重），
 * 直接用它的话，一个被裂缝卷上界的凡人会在名册上被写成「炼气」。
 * 这种错不报错、不 NaN，只是把一个人说成了另一个人。
 */
export function realmOrMortal(level) {
  return (level || 0) > 0 ? realmLabel(level) : '凡人';
}

/**
 * 「我刚送上去的那个人，后来怎么样了？」
 *
 * `upper.arrivedLog` 记的是他**上来那一刻**的快照（名字 / 境界 / 走的哪条道），
 * 而玩家真正想问的是**现在**：还在吗？什么境界了？死了没有？
 * 这三件事都能从上界的现成状态里读出来，**不需要新账本**。
 *
 * ⚠️ 纯读：不写世界、不抽 rng。
 */
export function upperFateOf(upper, entry) {
  const alive = upper.entities.find((e) => e.id === entry.id);
  if (alive) {
    return `如今在世 · ${realmOrMortal(alive.level)} · ${Math.floor((alive.age || 0) / 360)} 岁`;
  }
  const rec = findDead(upper, entry.id);
  if (rec) return `仙历 ${Math.floor((rec.died || 0) / 360) + 1} 年在上界陨落`;
  return '已不在上界名录（陨落已久，或身份已断）';
}

/**
 * 逝者名录上那一行「魂归何处」。
 *
 * `soulRoute` 是 Batch 3 新加的一列（见 `necrology.markSoulRoute`）。
 * 三种情形**必须分开说**：夺舍（他还活着，只是换了具身子）/ 五路之一 / 魂不留。
 *
 * ⚠️ 飞升者返回空串：那一行的 `who` 已经写着「飞升」，再说一遍是啰嗦。
 * ⚠️ **Batch 3 之前的老档**没有这一列，会全部落到最后一支（空串）——
 *    这是**对的**：那些记录写下的那一刻这个字段还不存在，补不出来，
 *    也不该拿 `level`/`cause` 去猜。
 */
export function soulRouteText(record) {
  const r = record.soulRoute;
  if (r === SOUL_ROUTE_POSSESS) return '魂未入幽冥 · 元神夺舍';
  if (r && ROUTE_LABEL[r]) return `魂归${ROUTE_LABEL[r]}`;
  if (record.fate === 'ascended') return '';
  if ((record.level || 0) === 0) return '魂不留';
  return '';
}

/**
 * 把 `compileBiography` 的 Markdown **显示**成排版。
 *
 * 传记正文是 Markdown（导出按钮落盘用的就是那一份原文）。直接摊在面板上
 * 会满屏 `#` 与 `-`，读起来像配置文件而不像「这个人的一生」。
 * 这里只认三种记号（`#` / `##` / `- `），其余原样保留——**原文一字不改**。
 */
export function renderBiographyHtml(md) {
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = String(md || '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith('## ')) out.push(`<div class="bio-h2">${esc(line.slice(3))}</div>`);
    else if (line.startsWith('# ')) out.push(`<div class="bio-h1">${esc(line.slice(2))}</div>`);
    else if (line.startsWith('- ')) out.push(`<div class="bio-li">${esc(line.slice(2))}</div>`);
    else out.push(`<div>${esc(line)}</div>`);
  }
  return out.join('');
}

// ── 折叠控件（Q28）──────────────────────────────────────────────────
/**
 * 「另有 N 条 · 展开」/「收起」。
 *
 * ⚠️ 折叠是**纯展示**：`rows` 一条都不会少（数据没被切掉），
 *    只是 DOM 里少画几条。世界里的实体数、名录条数、魂池容量一个都不变。
 */
function foldControl(sb, key, hidden, expanded, unit) {
  if (hidden > 0) {
    return `<button class="btn fold-more" data-fold="${key}">${foldMoreLabel(hidden, unit)}</button>`;
  }
  if (expanded) {
    return `<button class="btn fold-more" data-fold="${key}">${FOLD_COLLAPSE_LABEL}</button>`;
  }
  return '';
}

/**
 * 折叠按钮的**事件委托**（Q28）。
 *
 * ⚠️ **必须委托，不能逐次挂监听**：这些面板每 2.5 秒整段重建 innerHTML，
 *    挂在按钮上的监听会被下一次刷新一起丢掉——而且**不报错**，
 *    只是点了没反应（本仓记录过的故障类）。
 *    所以监听挂在**常驻的列表容器**上（`#inkChronicle` / `#inkMilestones` /
 *    `#inkNotables` / `#inkWatch` / `#inkNecrology`），只挂一次。
 * ⚠️ 折叠状态存在 UI 偏好里（`inkbox-ui-prefs-v1`），**不进 World**。
 */
function bindFold(box, sb) {
  if (!box || box.dataset.foldBound === '1') return;
  box.dataset.foldBound = '1';
  box.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-fold]');
    if (!el) return;
    const key = el.dataset.fold;
    if (!sb.qol) return;
    sb.qol.setFoldExpanded(key, !sb.qol.foldExpanded(key));
  });
}

/**
 * 折叠状态从 `sb.qol` 取（UI 偏好，不进世界）。没有 qol 时退回「全部展开」。
 *
 * ⚠️ `limit` 必须**与调用方真正 slice 的上限是同一个值**：这块面板折起来
 *    显示几条、按钮上写「另有几条」，两者一旦各用一套上限就会对不上——
 *    例如编年史上限是 `CHRONICLE_PANEL_LIMIT`(20)，而这里默认按
 *    `LIST_FOLD_LIMIT`(12) 算，按钮就会写「另有 28 条」而展开只多出 20 条。
 *    玩家按一下、数一遍，发现面板在说谎。所以上限由调用方传进来。
 */
function foldState(sb, key, total, unit = '条', limit = LIST_FOLD_LIMIT) {
  const expanded = Boolean(sb && sb.qol && sb.qol.foldExpanded(key));
  const folded = foldRows(new Array(total), limit, expanded);
  return { expanded, hidden: folded.hidden, limit };
}

// ── 编年史（Q17 / Q18 / Q19 / Q28）──────────────────────────────────
/**
 * 编年史面板。
 *
 * ⚠️ 面板是**最新在最上**（`slice(-N).reverse()`）。所以 Q17 的「回到最新」
 *    在这块面板上等于**滚到列表顶部**，而不是滚到底部——照字面实现「滚到底」
 *    会把玩家送到**最旧**的那一条上，与需求正好相反。
 *
 * ⚠️ Q18：玩家正在翻旧史时，新记录**不许**把他的阅读位置顶走。
 *    做法是先量 `.rail.right` 的 `scrollTop`，替换 innerHTML 之后再按
 *    `scrollHeight` 的增量补回去；玩家本来就在顶部（`scrollTop === 0`）时
 *    不补——那正是「继续自动跟随」。
 */
export function refreshChroniclePanel(sb) {
  const list = $('inkChronicle');
  if (!list || !sb.world) return;
  const all = sb.world.chronicle.slice(-40).reverse();
  const { expanded, hidden } = foldState(sb, 'chronicle', all.length, '条', CHRONICLE_PANEL_LIMIT);
  const shown = expanded ? all : all.slice(0, CHRONICLE_PANEL_LIMIT);
  const rail = document.querySelector('.rail.right');
  const markup = shown.length
    ? shown.map((c) => {
      // 卜算子的话单独标一下，免得读者分不清哪句是旁白、哪句是史实
      const cls = c.kind === 'busanzi' ? 'ink-log is-busanzi' : 'ink-log';
      const who = c.kind === 'busanzi' ? '卜算子' : `${Math.floor(c.day / 360) + 1} 年`;
      // Q19：**只有**记录本身携带定位信息时才给「查看」。
      // 当前的 `world.record()` 只写 `{day, year, text, kind}`，没有坐标也没有 id
      // ⇒ 这一支今天恒不出现，历史保持纯文字（正是规格要的降级）。
      // 留着它是因为「以后某个事件源真的带上坐标」时，这里不用再改一次。
      const loc = chronicleLocation(c);
      const view = loc ? `<button class="btn log-view" data-goto-log="${c.day}:${loc.x},${loc.y}">查看</button>` : '';
      return `<div class="${cls}"><b>${who}</b>${c.text}${view}</div>`;
    }).join('') + foldControl(sb, 'chronicle', hidden, expanded, '条')
    : '<div class="ink-empty">世界还很安静。</div>';
  preserveRailScroll(rail, () => setPeriodicMarkup(list, markup));
  bindChronicle(list, sb);
}

/**
 * 编年史的点击委托（Q19「查看」+ Q28 折叠）。
 *
 * ⚠️ 挂在**常驻的 `#inkChronicle`** 上，只挂一次（面板每 2.5 秒重建 innerHTML）。
 * ⚠️ 「查看」**只导航**：把镜头挪到那条记录的位置并检视那一格。
 *    它**不**改世界——Q19 明令「不要重新设计记录数据」，本方法只消费已有字段。
 */
function bindChronicle(box, sb) {
  bindFold(box, sb);
  if (!box || box.dataset.chronicleBound === '1') return;
  box.dataset.chronicleBound = '1';
  box.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-goto-log]');
    if (!el) return;
    const [dayText, xy] = String(el.dataset.gotoLog).split(':');
    const [x, y] = String(xy || '').split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    void dayText;
    sb.camera.focusOn(x, y, { zoom: Math.max(sb.camera.zoom, 7), duration: 0.75 });
    spawnFocusPulse(sb.focusPulses, x, y);
    sb.dirty = true;
    sb.inspectAt?.(Math.round(x), Math.round(y));
  });
}

/** 一条编年记录能不能定位。**只消费已有字段**，不为它改 `World.record`。 */
export function chronicleLocation(record) {
  if (!record) return null;
  const x = Number(record.x);
  const y = Number(record.y);
  if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  return null;
}

/**
 * 替换 innerHTML 时保住玩家的阅读位置。
 *
 * ⚠️ 只补偿**向下**的位移（新记录插在列表顶部会把内容整体下推）。
 *    玩家在顶部时不补偿——那时他要的就是「跟着最新的走」。
 */
export function preserveRailScroll(rail, mutate) {
  if (!rail) { mutate(); return; }
  const before = rail.scrollTop;
  const beforeHeight = rail.scrollHeight;
  mutate();
  if (before <= 0) return;
  const delta = rail.scrollHeight - beforeHeight;
  if (delta !== 0) rail.scrollTop = before + delta;
}

/** Q17：把编年史那一块滚进视野（「回到最新」）。已经在视野里则不动。 */
export function scrollRailToLatest(el, rail) {
  if (!el || !rail) return false;
  const railRect = rail.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  if (elRect.top >= railRect.top && elRect.top < railRect.bottom) return false;
  el.scrollIntoView({ block: 'start' });
  return true;
}

// ── 大事记（Q19 / Q28）───────────────────────────────────────────────
/**
 * 世界大事面板。
 *
 * 与 `refreshChroniclePanel` 的分工：编年是「什么都记」的 400 条滚动窗口，
 * 快进几十年之后满屏都是「某村归入某宗门」；大事记只记玩家真会回头看的
 * 那几件，窗口长得多（MILESTONE_CAP = 600）。
 */
export function refreshMilestonesPanel(sb) {
  const box = $('inkMilestones');
  const world = sb.world;
  if (!box || !world) return;
  const all = Array.isArray(world.milestones) ? world.milestones : [];
  const newestFirst = all.slice().reverse();
  const { expanded, hidden } = foldState(sb, 'milestones', newestFirst.length, '条', MILESTONE_PANEL_LIMIT);
  const shown = expanded ? newestFirst : newestFirst.slice(0, MILESTONE_PANEL_LIMIT);
  const active = sb.life?.events?.activeCrises || [];
  // 「进行中」的灾祸**永远置顶**，而且不参与折叠——它是**当下**，
  // 被折进「另有 N 条」里就等于告诉玩家「这场灾已经过去了」。
  const activeRows = active.map((event) => {
    const village = world.villageById(event.villageId);
    const yearsLeft = Math.max(0, Math.ceil(
      ((event.startedDay || 0) + (event.durationDays || 0) - world.day) / 360,
    ));
    const impact = village
      ? `聚落元气 ${Math.max(0, village.hp || 0).toFixed(0)} · 粮食 ${Math.max(0, village.food || 0).toFixed(0)}`
      : '受灾聚落已不在';
    return `<div class="ink-log crisis-active"><b>进行中 · 事件 #${event.id}「${event.name}」</b>`
      + `${event.villageName || '受灾聚落'} · 约 ${yearsLeft} 年后结算 · ${impact}</div>`;
  });
  const milestoneRows = shown.map((m) => {
    const year = Math.floor((m.day || 0) / 360) + 1;
    const loc = chronicleLocation(m);
    const view = loc ? `<button class="btn log-view" data-goto-log="${m.day}:${loc.x},${loc.y}">查看</button>` : '';
    return `<div class="ink-log"><b>仙历 ${year} 年</b>${m.text}${view}</div>`;
  });
  const rows = [...activeRows, ...milestoneRows];
  const body = rows.length ? rows.join('') : '<div class="ink-empty">还没有值得记的大事。快进一些年，或者亲手去改一改这个世界。</div>';
  const rail = document.querySelector('.rail.right');
  preserveRailScroll(rail, () => setPeriodicMarkup(box,
    body + foldControl(sb, 'milestones', hidden, expanded, '条')));
  bindFold(box, sb);
}

// ── 值得关注（Q9 / Q13 / Q28 / Q36）─────────────────────────────────
/**
 * 活人榜。点一行 = 「找到这个人」+「看见他在哪」+「他这一生做过什么」。
 *
 * 三条规则缺一不可：Reachability（侧栏常驻）/ Feedback（每行带「为什么是他」）
 * / Stability（纯读派生，不写世界）。
 */
export function refreshNotablesPanel(sb) {
  const box = $('inkNotables');
  const world = sb.world;
  if (!box || !world) return;
  const rows = notablePeople(world);
  const { expanded, hidden } = foldState(sb, 'notables', rows.length, '人');
  const shown = expanded ? rows : rows.slice(0, LIST_FOLD_LIMIT);
  const markup = rows.length
    ? shown.map((r) => {
      const e = r.e;
      const tags = [realmLabel(e.level || 0)];
      if (e.faction) {
        const f = world.factionById(e.faction);
        if (f) tags.push(f.name);
      }
      return `<div class="ink-log notable-row" data-live="${e.id}">`
        + `<span class="notable-reason">${r.reason}</span>${displayName(e)}（${tags.join(' · ')} · `
        + `${Math.floor((e.age || 0) / 360)} 岁）`
        + `<div class="necro-epitaph">${ATTENTION_NAMES[attentionOf(world, e)]}`
        + `${e.forbidden ? ` · 身负禁术「${e.forbidden}」` : ''}`
        + `${e.beast ? ` · 有灵兽${e.beast}` : ''}</div>`
        + '</div>';
    }).join('') + foldControl(sb, 'notables', hidden, expanded, '人')
    : '<div class="ink-empty">还没有觉醒的修士。用「生灵」撒下凡人，再快进几年。</div>';
  setPeriodicMarkup(box, markup);
  bindFold(box, sb);
  // 事件委托（同史册）：面板每 2.5 秒重建 innerHTML，
  // 逐行挂监听会被下一次刷新全部丢掉——而且不报错，只是点了没反应。
  if (!sb.notablesBound) {
    box.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-live]');
      if (el) sb.showPersonCard(Number(el.dataset.live));
    });
    sb.notablesBound = true;
  }
  // Q36：正在摊开的那个人死了 / 换世界了 → 收起面板，不留一张查不到的旧卡片
  if (!sb.g1 && sb.personOpenId !== null && !findEntity(world, sb.personOpenId)) {
    hidePersonCardPanel(sb);
    sb.notify?.('此人已不在此界', 2600);
  }
}

// ── 人物一生（Q9 / Q12 / Q13 / Q36 / Q37）───────────────────────────
/**
 * 点开一个**活人**：把 `compileBiography` 那一整篇摊出来。
 *
 * Q12：顶部那一排小动作就是**统一操作条**——只显示当前目标**真的有**的能力：
 *   `定位` · `记挂 / 取消记挂` · `关系` · `导出传记`。
 *   （宗门那一条在凡间人物上没有对应能力，所以**不显示**，而不是显示一个灰按钮。）
 * Q13：每次主动检视都记进「最近看过」（`sb.qol.noteRecent`）。
 * Q36：目标已经不在世上时**明确说一句**，不留一张查不到的旧卡片。
 * Q37：卡片头带上**真实位面**（本方法只服务凡间，所以恒为「凡间」）。
 */
export function showPersonCardPanel(sb, model, onAction) {
  const panel = $('inkPersonDetail');
  if (!panel || !model) return;
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const r = sb.g1?.resolve(model.identity.key), entity = r?.entity;
  const nativeCultivator = entity?.sp === 'cultivator' && Number.isFinite(entity.level) && entity.level > 0;
  const biography = nativeCultivator && (r.status === 'dead' || r.fateRecord) ? compileDeadBiography(r.sourceWorld, entity)
    : nativeCultivator && entity.hp > 0 ? compileBiography(r.sourceWorld, entity) : compileCharacterFacts(model);
  const body = renderBiographyHtml(biography);
  const summary = sb.g1?.summary();
  const news = summary ? '<div class="inspect-note">重大近况 · 已保留 ' + summary.events.length + ' 条；人物日志最多保留 32 条。</div>'
    + summary.events.map(row => '<div class="inspect-note">' + esc(row.text) + '</div>').join('') : '';
  const rows = [model.header.realm, model.header.ageText, model.header.affiliation, model.header.stateText];
  const cultivation = model.cultivation;
  const numbers = ![cultivation.exp, cultivation.required, cultivation.percent].every(Number.isFinite) ? cultivation.stateText : '修为 ' + cultivation.exp.toFixed(2)
    + ' / ' + cultivation.required + ' · ' + cultivation.percent.toFixed(1) + '%';
  const scroll = panel.scrollTop, oldBodyScroll = panel.querySelector('.necro-body')?.scrollTop || 0;
  panel.dataset.plane = model.identity.currentPlane || model.identity.plane;
  panel.dataset.characterKey = model.identity.key;
  panel.innerHTML = '<div class="inspect-head">' + esc(model.identity.name) + '的一生'
    + '<span class="plane-tag">' + planeTagOf(model.identity.currentPlane || model.identity.plane) + '</span>'
    + '<button class="ink-x" id="inkPersonClose">×</button></div>'
    + '<div class="inspect-note">' + rows.map(esc).join(' · ') + '</div>'
    + '<div class="inspect-note">' + esc(numbers) + ' · ' + esc(cultivation.rateText) + '</div>'
    + model.cultivationRows.map(row => '<div class="inspect-row"><span>' + esc(row.label) + '</span><b>' + esc(row.value) + '</b></div>').join('')
    + news + '<div class="necro-body">' + body + '</div>'
    + '<div class="inspect-actions">'
    + '<button class="btn" id="inkBtnPersonLocate"' + (model.identity.canFocus ? '' : ' disabled') + '>定位</button>'
    + '<button class="btn" id="inkBtnPersonWatch"' + ((!model.watched && (model.identity.plane !== 'mortal'
      || model.identity.status !== 'alive' || !model.identity.canFocus)) ? ' disabled' : '') + '>'
    + (model.watched ? '★ 取消记挂' : '☆ 记挂此人') + '</button>'
    + '<button class="btn" id="inkBtnPersonRel">查看关系</button>'
    + '<button class="btn" id="inkBtnPersonBio">导出传记</button></div>'
    + '<div class="inspect-actions">' + model.edicts.map(edict => '<button class="btn" data-g1-edict="' + esc(edict.id)
      + '" title="' + esc(edict.enabled ? edict.description : edict.disabledReason) + '"' + (edict.enabled ? '' : ' disabled')
      + '>' + esc(edict.title) + '</button>').join('') + '</div>'
    + '<div id="inkPersonRel" style="text-align:center;padding:0 10px"></div>';
  panel.classList.add('on');
  const act = type => onAction({ type, targetKey: model.identity.key });
  $('inkPersonClose').addEventListener('click', () => act('close'));
  $('inkBtnPersonLocate').addEventListener('click', () => act('focus'));
  $('inkBtnPersonWatch').addEventListener('click', () => act('watch'));
  $('inkBtnPersonRel').addEventListener('click', () => act('show-relations'));
  $('inkBtnPersonBio').addEventListener('click', () => act('export'));
  panel.querySelectorAll('[data-g1-edict]').forEach(button => button.addEventListener('click', () =>
    onAction({ type: 'edict', targetKey: model.identity.key, edictId: button.dataset.g1Edict })));
  if (sb.relationOpen && entity && model.identity.currentPlane === 'mortal') {
    $('inkPersonRel').innerHTML = buildRelationSvgPanel(sb, entity);
    bindRelationGraphPanel(sb);
  }
  panel.scrollTop = scroll;
  if (panel.querySelector('.necro-body')) panel.querySelector('.necro-body').scrollTop = oldBodyScroll;
}

export function showCharacterChoicesPanel(sb, candidates, choose) {
  const panel = $('inkInspect');
  if (!panel) return;
  const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  panel.dataset.plane = candidates[0].plane;
  panel.innerHTML = '<div class="inspect-head">此处有 ' + candidates.length + ' 位人物'
    + '<button class="ink-x" id="inkInspectClose">×</button></div>'
    + '<select id="inkG1Candidates" aria-label="选择重叠人物" style="width:calc(100% - 20px);margin:10px">'
    + candidates.map((candidate, index) => '<option value="' + index + '">' + esc(candidate.name)
      + ' · #' + candidate.id + '</option>').join('') + '</select>'
    + '<button class="btn" id="inkG1OpenCandidate" style="margin:0 10px 10px">查看此人</button>';
  panel.classList.add('on');
  $('inkInspectClose').addEventListener('click', () => panel.classList.remove('on'));
  $('inkG1OpenCandidate').addEventListener('click', () => {
    if (choose(candidates[Number($('inkG1Candidates').value)]).ok) panel.classList.remove('on');
  });
}

export function showCharacterRelationsPanel(sb, effect) {
  sb.relationOpen = !sb.relationOpen;
  const box = $('inkPersonRel');
  if (!box) return;
  if (!sb.relationOpen) { box.innerHTML = ''; return; }
  if (effect.plane === 'mortal') { box.innerHTML = buildRelationSvgPanel(sb, effect.entity); bindRelationGraphPanel(sb); }
  else box.textContent = '跨界关系以当前命簿中已知记录为准';
}


export function hidePersonCardPanel(sb) {
  const panel = $('inkPersonDetail');
  if (panel) panel.classList.remove('on');
  sb.personOpenId = null;
  sb.relationOpen = false;   // 收起卡片时也收起关系图（下次打开是干净状态）
}

// ── 人物局部关系图 ───────────────────────────────────────────────────
/**
 * 把中心人物的**一跳关系**喂给纯 SVG 生成器。
 *
 * 邻居来自 `entity.relations`（`Map<id, {type, score}>`），每个 id 解析成
 * 「在世 / 故人 / 不可考」三态——**只查现成名录，不按名字猜**。
 */
export function buildRelationSvgPanel(sb, entity) {
  const world = sb.world;
  const neighbors = [];
  const rels = entity && entity.relations;
  if (rels && typeof rels.forEach === 'function') {
    rels.forEach((rel, id) => {
      const live = findEntity(world, id);
      const dead = live ? null : findDead(world, id);
      neighbors.push({
        id,
        name: (live && displayName(live)) || (dead && dead.name) || '无名',
        type: rel && rel.type,
        score: rel && rel.score,
        state: live ? 'live' : (dead ? 'dead' : 'unknown'),
      });
    });
  }
  return relationGraphSvg(
    { id: entity.id, name: displayName(entity) },
    neighbors,
    { max: RELATION_GRAPH_MAX },
  );
}

/**
 * 关系图外圈节点的点击委托。
 * ⚠️ 绑在**常驻的 `#inkPersonDetail`**（不是被反复重建的 `#inkPersonRel`）——
 *    卡片每开一次就 `panel.innerHTML = …` 重排一次，绑在子容器上的监听会被一起丢掉，
 *    而且**不报错**，只是点了没反应（本仓记录过的故障类）。
 */
export function bindRelationGraphPanel(sb) {
  const panel = $('inkPersonDetail');
  if (!panel || sb.relationBound) return;
  panel.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-goto]');
    if (!el) return;
    const nid = Number(el.dataset.goto);
    if (!Number.isFinite(nid)) return;
    if (findEntity(sb.world, nid)) sb.showPersonCard(nid);
    else if (findDead(sb.world, nid)) sb.showDeadBiography(nid);
    else sb.notify?.('此人已不可考');
  });
  sb.relationBound = true;
}

// ── 天道记挂（Q14 / Q15 / Q16 / Q36）────────────────────────────────
/**
 * 「天道记挂」子区。它是**玩家的观察列表**，不是世界规律——
 * 所以这一块**只读** `world.watch`、只做增删与导航，从不写回模拟。
 *
 * Q14：标题上的计数从「记挂了几个」升级成 `记挂 · 3` ——
 * 3 = **自上一次打开以来有几位记挂对象出了新变化**（`watchNewsCount` 数出来的）。
 * 打开这一块即全部标为已读（`markAllWatchRead`）。第一版刻意**不造通知中心**。
 *
 * Q15：**记挂对象不许从列表里无声消失**。列表本身来自 `world.watch`（只增不减），
 * 所以行永远在；变的是**状态那一栏**——`已飞升` / `已陨落` / `魂入幽冥` /
 * `异魂占身` / `在世` / `已不可考`。六种说法各自对应一条**可靠事实**，
 * 一条都不按名字猜（见 `sim/watch.js` 的 `resolveWatch` 判据顺序）。
 *
 * ⚠️ 纯读 + 一个只增的 `lastReadDay`：挂 2.5 秒定时器刷新，不抽 rng、不动世界。
 */
export function refreshWatchPanel(sb) {
  const box = $('inkWatch');
  const world = sb.world;
  if (!box || !world) return;
  const rows = watchRows(world);
  const count = $('inkWatchCount');
  // Q14：标题上的数字。有未读时是**未读人数**（`记挂 · 3`），
  // 没有未读时退回「记挂了几个人」——否则玩家会以为自己的列表被清空了。
  // ⚠️ 口径只有 `watchNewsCount` 一份（`sim/watch.js`）：它与红点**同源**，
  //    本文件不自己数一遍（自己数 = 第二份真相，迟早出现「红点亮着而数字是 0」）。
  const unread = watchNewsCount(world);
  setTextIfChanged(count, unread > 0 ? `记挂 · ${unread}` : `记挂 · ${rows.length}`);
  const dot = $('inkWatchDot');
  if (dot) dot.style.display = unread > 0 ? '' : 'none';
  const { expanded, hidden } = foldState(sb, 'watch', rows.length, '人');
  const shown = expanded ? rows : rows.slice(0, LIST_FOLD_LIMIT);
  setPeriodicMarkup(box, rows.length
    ? shown.map((r) => {
      const e = r.entry;
      const tags = [];
      if (r.entity) tags.push(realmOrMortal(r.entity.level || 0));
      tags.push(watchStateLabel(r));
      // 已入上界的：顺手把「现在在上界怎么样」摊在小字里（复用三界面板的
      // `upperFateOf`，不新增账本）。其余状态没有这一行。
      const extra = (r.upper && world.upper)
        ? `<div class="necro-epitaph">${upperFateOf(world.upper, r.upper)}</div>`
        : '';
      return `<div class="ink-log notable-row" data-watch="${e.key}">`
        + `<span class="notable-reason">★</span>${e.name}（${tags.join(' · ')}）`
        + `${extra}</div>`;
    }).join('') + foldControl(sb, 'watch', hidden, expanded, '人')
    : '<div class="ink-empty">尚未记挂任何人。点开一个人物卡，按「☆ 记挂此人」。</div>');
  bindFold(box, sb);
  // 事件委托（同活人榜 / 史册）：面板每 2.5 秒重建 innerHTML，
  // 逐行挂监听会被下一次刷新全部丢掉——而且不报错，只是点了没反应。
  if (!sb.watchBound) {
    box.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-watch]');
      if (el) sb.openWatchRow(el.dataset.watch);
    });
    // 点标题 = 把全部记挂标为已读（红点熄灭、未读数归零）。第一版**不造通知中心**，
    // 只用这一下「清红点」的手势。标题是常驻元素，挂一次即可。
    // ⚠️ 已读位 `lastReadDay` 由 `sim/watch.js` 的 `markAllWatchRead` 写进
    //    `world.watch`（D7-E 起它就是世界级观察状态）——本文件**不另存一份**，
    //    两份「读到哪了」一定会分叉。
    const title = $('inkWatchTitle');
    if (title) {
      title.style.cursor = 'pointer';
      title.addEventListener('click', () => {
        markAllWatchRead(sb.world, sb.world.day);
        sb.refreshWatch();
      });
    }
    sb.watchBound = true;
  }
}

/**
 * Q15：一条记挂**现在的状态**，用玩家看得懂的一句话。
 *
 * ⚠️ 六种说法**一一对应 `resolveWatch` 的六种 state**，不多不少：
 *    多一种（比如按名字猜出来的「已转世」）就是**编造**；
 *    少一种（比如把 ascended 也说成「故人」）就是**撒谎**。
 */
export function watchStateLabel(resolved) {
  if (!resolved) return '已不可考';
  switch (resolved.state) {
    case 'alive': return '在世';
    case 'possessed': return '异魂占身';
    case 'ascended':
      // 走上界的路只有两条（`upper.arrivedLog[].via`）：飞升 / 被裂缝卷上去。
      return resolved.upper && resolved.upper.via === 'rift' ? '被裂缝卷上界' : '已飞升';
    case 'dead': {
      const year = Math.floor((Number(resolved.dead && resolved.dead.died) || 0) / 360) + 1;
      return `已陨落 · 仙历 ${year} 年`;
    }
    case 'nether': return '魂入幽冥';
    default: return '已不可考';
  }
}

/** 点一行「记挂」：按状态导航（见 refreshWatchPanel 的几种出口）。**纯导航 + 标已读**。 */
export function openWatchRowPanel(sb, key) {
  const world = sb.world;
  if (!world) return;
  const entry = ensureWatch(world).find((w) => w.key === key);
  if (!entry) return;
  const r = resolveWatch(world, entry);
  const sinceDay = Number.isFinite(entry.lastReadDay) ? entry.lastReadDay : entry.addedDay;
  markWatchRead(world, key, world.day);
  if (sb.g1) { sb.g1.open(key, { sinceDay }); sb.refreshWatch(); return; }   // 点开即已读（红点熄灭）
  if ((r.state === 'alive' || r.state === 'possessed') && r.entity) {
    sb.showPersonCard(r.entity.id);     // 内含 focus + 墨环 + 人物卡
  } else if (r.state === 'dead' && r.dead) {
    sb.showDeadBiography(r.dead.id);
  }
  // ascended / nether / unknown：只标已读、就地显示现况（红点灭），不移动镜头。
  sb.refreshWatch();
}

// ── 三界（Q9 / Q10 / Q37）───────────────────────────────────────────
/** 三界面板。**不新增任何后台状态**——全是现成读数。 */
export function refreshThreeRealmsPanel(sb) {
  const world = sb.world;
  if (!world) return;
  refreshUpperRealmPanel(sb, world);
  refreshNetherRealmPanel(sb, world);
}

/** 上界那一块：人口 / 飞升名册（带现状）/ 上界自己的大事 */
export function refreshUpperRealmPanel(sb, world) {
  const upper = world.upper || sb.upper;
  const meta = $('inkUpperMeta');
  const box = $('inkUpperLog');
  if (!upper) {
    if (meta) meta.textContent = '未生成';
    setPeriodicMarkup(box, '<div class="ink-empty">这一局没有上界。</div>');
    return;
  }
  const pop = upper.popLog || {};
  if (meta) {
    // `arrived` 是**累计**从凡间到达的，与 `upper.entities.length`（此刻活着几个）
    // 是两件事——两个都报，只报一个的话「上来过 1 个」与「此刻 13 个」谁都会读错。
    //
    // 生态账本（D6-2 工程包 E）：追加「生 / 亡」两项，与**幽冥那一行同款口径**。
    // ⚠️ 守恒式 `生灵 === 生 − 亡` 是**契约**——三项摆在同行，账平不平一眼可见。
    // ⚠️ **追加**而不是改写：playtest 10e 用 `includes('生灵 N')` 等子串对账。
    const eco = upperEcoStats(upper);
    meta.textContent = `生灵 ${upper.entities.length} · 宗门 ${upper.factions.length}`
      + ` · 飞升上来 ${pop.arrived || 0}`
      + ` · 生态 生 ${eco.born} · 亡 ${eco.died}`;
  }
  if (!box) return;
  const rows = [];
  const log = Array.isArray(upper.arrivedLog) ? upper.arrivedLog : [];
  for (const a of log.slice(-UPPER_ARRIVAL_LIMIT).reverse()) {
    // Q9：名册里每一条**都带权威 id**（`arrivedLog[].id` 是上界实体的 id），
    // 所以名字可以点——点开的是**上界那一界**的检视卡（`inspectPlaneSubject`），
    // 不是凡间的人物卡。两条路径不能混（混了就会在凡间找一个不存在的 id）。
    rows.push(`<div class="ink-log"><b>仙历 ${Math.floor((a.day || 0) / 360) + 1} 年</b>`
      + `<button class="btn log-name" data-plane="upper" data-entity="${a.id}">${a.name}</button>`
      + `（${realmOrMortal(a.level)}）`
      + `${a.via === 'rift' ? '被裂缝卷上界' : '飞升上界'}`
      + `${a.sect ? ` · 入「${a.sect}」` : ''}`
      + `<div class="necro-epitaph">${upperFateOf(upper, a)}</div></div>`);
  }
  const ms = Array.isArray(upper.milestones) ? upper.milestones : [];
  for (const m of ms.slice(-UPPER_MILESTONE_LIMIT).reverse()) {
    rows.push(`<div class="ink-log"><b>仙历 ${Math.floor((m.day || 0) / 360) + 1} 年</b>${m.text}</div>`);
  }
  setPeriodicMarkup(box, rows.length ? rows.join('')
    // Q27 空状态：`此界尚无人飞升`（不再是「上界还只有开天时的那十几个人」——
    // 那句话把「没有人飞升」这件**事实**说成了「上界很荒」的**印象**）。
    : '<div class="ink-empty">此界尚无人飞升。凡间有人飞升之后，这里会记下他。</div>');
}

/** 幽冥那一块：魂路五路分布 / 魂池里排着谁 / 谁已经带着前世回来 */
export function refreshNetherRealmPanel(sb, world) {
  const meta = $('inkNetherMeta');
  const bars = $('inkSoulRoutes');
  const box = $('inkSoulPool');
  const st = reincarnationStats(world);
  const log = world.soulLog || {};
  let total = 0;
  for (const k of SOUL_ROUTE_ORDER) total += Number(log[k]) || 0;
  if (meta) {
    // `waiting` 是**此刻**池子里排队的，`total` 是**累计**判过路的魂——两个都报。
    let line = `魂池 ${st.waiting} · 累计 ${total} · 已归来 ${st.reborn}`;
    // ── 幽冥实体读数（2026-09-23 补）：上三栏是**凡间魂池**的账，
    //    这一栏才是**幽冥里此刻站着谁**——两者不是一回事。
    // ⚠️ 口径只有 `netherGhostStats` 一份——不要在这里自己 filter `nether.entities`。
    // ⚠️ 没有鬼修时「最高」印 `—` 而**不是**省略整段：忽有忽无的尾巴会让
    //    以文字为锚点的断言随时变红。
    const nether = world.nether;
    if (nether) {
      const gs = netherGhostStats(nether);
      // 生态账本（D6-2 工程包 E）：与**上界那一行同款口径**（生 / 亡）。
      // ⚠️ 多一栏「逐」：幽冥有**两条**离开路径（消散 + 上限逐出）。
      // ⚠️ D6-3 工程包 B 再加一栏「出」：**第三条离开路径**——自幽冥缝爬入凡间的鬼。
      // ⚠️ D6-3 工程包 C 再加一栏「物」：幽冥**此刻躺着几件物品**。
      // ⚠️ D6-3 工程包 D 再加一栏「夺」：**第四条离开路径**——夺舍凡间活人后消失。
      //    守恒式是 `鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺`。**必须都印**：
      //    不印的话玩家看到账差却查不出差在哪。
      const eco = netherEcoStats(nether);
      const items = netherItemStats(nether);
      line += ` · 幽冥 鬼魂 ${gs.ghost} · 鬼修 ${gs.cultivator}`
        + ` · 最高 ${gs.topTierName || '—'}`
        + ` · 生态 生 ${eco.born} · 亡 ${eco.died} · 逐 ${eco.evicted} · 出 ${eco.climbedOut} · 夺 ${eco.possessedOut}`
        + ` · 物 ${items.alive}`;
    }
    meta.textContent = line;
  }
  if (bars) {
    let max = 1;
    for (const k of SOUL_ROUTE_ORDER) max = Math.max(max, Number(log[k]) || 0);
    setPeriodicMarkup(bars, SOUL_ROUTE_ORDER.map((k) => {
      const n = Number(log[k]) || 0;
      const pct = n ? Math.max(3, (n / max) * 100) : 0;
      // ⚠️ 「零的那几路压淡」走 `data-zero` 而**不是**多拼一个类名：
      //    类名探针要求 class 属性里是字面量，一旦写成「类名 + 模板插值」，
      //    整段匹配就失败 ⇒ 那个类名对探针**完全不可见**。
      return `<div class="realm-soul" data-zero="${n ? '0' : '1'}">`
        + `<span>${ROUTE_LABEL[k] || k}</span>`
        + `<i style="width:${pct}%;background:${SOUL_ROUTE_COLOR[k] || '#7d776b'}"></i>`
        + `<b>${n}</b></div>`;
    }).join(''));
  }
  if (!box) return;
  const rows = [];
  // ① 池子里还排着谁。⚠️ 池子**只装 natural / linger 两路**——后三路
  //    （鬼修 / 怨魂化 / 魂火散尽）不入轮回，只在上面那五根条里计数。
  //    Q9：魂池条目**没有实体 id**（它是一条还没投胎的魂），所以名字**不可点**
  //    ——点一个不存在的 id 只会得到一张空卡（规格：不许按名字反查）。
  const pool = world.souls.slice().sort((a, b) => a.dueDay - b.dueDay).slice(0, SOUL_POOL_LIMIT);
  for (const s of pool) {
    const left = Math.max(0, Math.ceil((s.dueDay - world.day) / 360));
    rows.push(`<div class="ink-log"><b>${left > 0 ? `${left} 年后` : '待投胎'}</b>`
      + `${s.ofName}（${realmOrMortal(s.ofLevel)}）`
      + ` · ${ROUTE_LABEL[s.route] || s.route}`
      + ` · 第 ${(s.incarnation || 1) + 1} 世`
      + `${s.ofSectName ? ` · 前世在「${s.ofSectName}」` : ''}</div>`);
  }
  // ② 已经带着前世回来的人。Q9：这些人**都是凡间实体**，带权威 id ⇒ 名字可点。
  const back = [];
  for (const e of world.entities) {
    if (e && e.pastLife) back.push(e);
  }
  for (const e of back.slice(-SOUL_BACK_LIMIT).reverse()) {
    rows.push(`<div class="ink-log"><button class="btn log-name" data-plane="mortal" data-entity="${e.id}">${e.name}</button>`
      + `（${realmOrMortal(e.level)}）`
      + ` ← 前世 ${e.pastLife.name}（${e.pastLife.realm || realmOrMortal(e.pastLife.level)}）`
      + `<div class="necro-epitaph">${PAST_LIFE_CHOICE[e.pastLife.choice] || '记忆尚未觉醒'}`
      + `${e.pastLife.conflict ? ' · 两世相争' : ''}</div></div>`);
  }
  setPeriodicMarkup(box, rows.length ? rows.join('')
    // Q27 空状态：`此刻无魂候渡`（技术词一律不出现）。
    : '<div class="ink-empty">此刻无魂候渡。这个世界的人死得还不够多——快进一些年。</div>');
}

// ── 史册（Q9 / Q27 / Q28 / Q36 / Q37）──────────────────────────────
/**
 * 史册列表。
 *
 * ⚠️ 刷新节奏：它挂在 `setInterval(..., 2500)` 上，**不在 rAF 主循环里**。
 *    列表只渲染前 `NECRO_PANEL_LIMIT` 条：全 800 条塞进 DOM 没有意义。
 */
export function refreshNecrologyPanel(sb) {
  const box = $('inkNecrology');
  const world = sb.world;
  if (!box || !world) return;
  const rows = necrologyList(world, { sort: sb.necroSort, limit: NECRO_PANEL_LIMIT });
  const st = necrologyStats(world);
  const count = $('inkNecroCount');
  if (count) count.textContent = `${st.count} / 累计 ${st.total}`;
  const { expanded, hidden } = foldState(sb, 'necrology', rows.length, '位');
  const shown = expanded ? rows : rows.slice(0, LIST_FOLD_LIMIT);
  setPeriodicMarkup(box, rows.length
    ? shown.map((r) => {
      const year = Math.floor((r.died || 0) / 360);
      const tags = [realmOrMortal(r.level)];
      if (r.sectName) tags.push(r.sectName);
      const who = r.fate === 'ascended' ? '飞升' : r.cause;
      // 「这个人死了之后去哪了」就在这一行上回答（Batch 3 加的 `soulRoute` 列）。
      const fate = soulRouteText(r);
      return `<div class="ink-log necro-row" data-dead="${r.id}">`
        + `<b>仙历 ${year} 年</b>${r.name}（${tags.join(' · ')}）· ${who}`
        + (fate ? ` · ${fate}` : '')
        + (r.epitaph ? `<div class="necro-epitaph">「${r.epitaph}」</div>` : '')
        + '</div>';
    }).join('') + foldControl(sb, 'necrology', hidden, expanded, '位')
    : '<div class="ink-empty">名录尚空——这个世界还没有人离世。</div>');
  bindFold(box, sb);
  // 点开某一条：用**事件委托**。面板每 2.5 秒重建一次 innerHTML。
  if (!sb.necroBound) {
    box.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-dead]');
      if (el) sb.showDeadBiography(Number(el.dataset.dead));
    });
    sb.necroBound = true;
  }
  // Q36：正在摊开的那条被淘汰了 / 换世界了 → 收起面板，不留一条查不到的旧闻
  if (sb.necroOpenId !== null && !findDead(world, sb.necroOpenId)) {
    hideDeadBiographyPanel(sb);
    sb.notify?.('此录已不在史册（可能已被名录窗口淘汰）', 2600);
  }
}

export function setNecroSortPanel(sb, sort) {
  sb.necroSort = sort === 'importance' ? 'importance' : 'recent';
  const recent = $('inkBtnNecroRecent');
  const imp = $('inkBtnNecroImportance');
  if (recent) recent.classList.toggle('on', sb.necroSort === 'recent');
  if (imp) imp.classList.toggle('on', sb.necroSort === 'importance');
  sb.refreshNecrology();
}

/** 点开一条名录：把那个人的完整传记正文摊出来。Q36：找不到时明确说一句。 */
export function showDeadBiographyPanel(sb, id) {
  const record = findDead(sb.world, id);
  const panel = $('inkNecroDetail');
  if (!panel) return;
  if (!record) {
    hideDeadBiographyPanel(sb);
    sb.notify?.('此录已不在史册', 2600);
    return;
  }
  sb.necroOpenId = id;
  const md = compileDeadBiography(sb.world, record);
  panel.dataset.plane = 'mortal';
  panel.innerHTML = `<div class="inspect-head">${record.name}传`
    + '<span class="plane-tag">凡间</span>'
    + '<button class="ink-x" id="inkNecroClose">×</button></div>'
    + `<div class="necro-body">${renderBiographyHtml(md)}</div>`
    + '<div class="inspect-actions"><button class="btn" id="inkBtnNecroBio">导出传记</button></div>';
  panel.classList.add('on');
  $('inkNecroClose').addEventListener('click', () => hideDeadBiographyPanel(sb));
  $('inkBtnNecroBio').addEventListener('click', () => {
    // 再编译一遍：正文是纯派生，不值得为它多存一份（存了就会与世界不同步）
    sb.downloadText(biographyFileName(record), compileDeadBiography(sb.world, record));
  });
}

export function hideDeadBiographyPanel(sb) {
  const panel = $('inkNecroDetail');
  if (panel) panel.classList.remove('on');
  sb.necroOpenId = null;
}

/** 下载一段文本为 .md（史册两个导出按钮共用） */
export function downloadTextPanel(sb, name, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  sb.notify?.(`已导出 ${name}（${text.length} 字）`);
}

/** 史册导出（Q26：文件名走 `necrologyFileName`，本模块不另起一套命名）。 */
export function exportNecrologyPanel(sb) {
  const md = exportNecrology(sb.world, { sort: sb.necroSort });
  downloadTextPanel(sb, necrologyFileName(sb.world), md);
}

// ── 卜算子 ───────────────────────────────────────────────────────────
/**
 * 卜算子那块对话条。
 *
 * 他的台词一直在编年史里（sim/busanzi.js 只往那儿写），但编年史一屏四十条、
 * 每几秒翻一次，他那句话转眼就没了。所以这里把 kind === 'busanzi' 的条目
 * 单独拎出来显示——**不新增状态，纯筛选**。
 */
export function refreshBusanziPanel(sb) {
  const box = $('inkBusanzi');
  if (!box || !sb.world) return;
  const recent = busanziRecent(sb.world, 3);
  if (!recent.length) {
    box.classList.remove('on');
    return;
  }
  const lines = $('inkBusanziLines');
  if (lines) {
    setPeriodicMarkup(lines, recent
      .map((c) => `<div class="busanzi-line">${c.text}</div>`)
      .join(''));
  }
  const tier = $('inkBusanziTier');
  if (tier) tier.textContent = busanziTierName(sb.world);
  const meter = $('inkBusanziMeter');
  if (meter) {
    const next = busanziNextStep(sb.world);
    meter.style.width = next ? `${Math.min(100, (next.value / next.need) * 100).toFixed(1)}%` : '100%';
  }
  box.classList.add('on');
}

// ── 存档槽（Q22 / Q24 / Q39）────────────────────────────────────────
/**
 * 存档槽下拉。
 *
 * ⚠️ 2026-09-22 之前这里**一个预置槽都没有**：下拉里只有 localStorage 里已经存在的键，
 *    首次打开就只有一个空的 `auto`。于是玩家**没有办法存第二份**。
 *    修法就是把这 8 个命名槽显式说出来（`save.js` 本来就接受任意槽名）。
 *
 * Q24：槽位旁多一句「仙历 N 年 / seed N · N 年」——来自**侧索引**
 * （`inkbox-slotmeta-v1`），**不是**把整档解压一遍读出来的：
 * 为了显示一行字去跑一次 `deserialize` 等于把存档格式抄了第二份。
 * 侧索引没有这一格（老档 / 别处写进去的档）时就只报体积，**不猜**。
 *
 * Q39：空槽的「读档」按钮进 disabled——点了会得到一句「没有存档」，
 * 但按钮本身就该先告诉玩家「这里没东西可读」。
 */
export function refreshSlotsPanel(sb) {
  const select = $('inkSlotSelect');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '';
  const slots = listSlots();
  const preset = ['auto'];
  for (let i = 1; i <= 8; i += 1) preset.push(`slot${i}`);
  const byName = new Map(slots.map((s) => [s.slot, s]));
  const merged = preset.map((name) => byName.get(name) || { slot: name, bytes: 0, compressed: false });
  // 兜底：`listSlots()` 里既不是 auto 也不是 slot1..8 的槽名照旧列出来。
  for (const s of slots) if (!preset.includes(s.slot)) merged.push(s);
  const meta = sb.qol ? sb.qol.slotMeta() : {};
  merged.forEach((s) => {
    const option = document.createElement('option');
    option.value = s.slot;
    // 压缩状态必须显示出来：同一个世界，压缩后 24.6%、退回明文 72.3%。
    const size = s.bytes
      ? `${(s.bytes / 1024).toFixed(0)} KB${s.compressed ? ' · 压缩' : ' · 明文'}`
      : '空';
    const extra = s.bytes ? slotMetaText(meta, s.slot) : '';
    option.textContent = `${slotLabel(s.slot)}（${size}${extra ? ` · ${extra}` : ''}）`;
    option.dataset.empty = s.bytes ? '0' : '1';
    select.appendChild(option);
  });
  if (current) select.value = current;
  // Q4 / Q39：空槽不可读（按钮禁用 + 说明原因）。
  // ⚠️ `disabled` 有两个来源，必须能共存：
  //      · **状态**（这一格是空的）——由本函数按槽位内容决定；
  //      · **忙碌**（正在解压 / 反序列化）——由 `qol.setBusy()` 决定。
  //    `setBusy(id, false)` 收工时会把 `disabled` 写成 `false`，如果它不知道
  //    「这一格本来就是空的」，就会把空槽的读档按钮**重新点亮**——点了得到一句
  //    「没有存档」，而按钮本身早该拦住。所以状态这一半写进 `forceDisabled`，
  //    `setBusy` 认它（见 `ui/qol.js` 的 `setBusy`）。
  //    （2026 QoL 之前 `forceDisabled` 只有读者、没有写者——等于一条不生效的机制。）
  const loadBtn = $('inkBtnLoad');
  if (loadBtn) {
    const picked = merged.find((s) => s.slot === select.value);
    const empty = !picked || !picked.bytes;
    loadBtn.dataset.forceDisabled = empty ? '1' : '0';
    loadBtn.disabled = empty;
    loadBtn.title = empty ? '这一格还没有存档' : `读取「${slotLabel(select.value)}」`;
  }
}

// ── 右栏分区折叠（Q29 / Q30）────────────────────────────────────────
/**
 * 右栏 12 个 sec-title 都是信息墙，新玩家被压住、老玩家也用不到全部。
 * 给每个分区加可点击折叠 + 持久化：
 *   · 哪些默认折叠由 HTML 上 `data-default-collapsed="1"` 标注（图例、操作、门道）；
 *   · 玩家的选择覆盖默认值，刷新后还在；
 *   · 不重新写 HTML 结构，只是把每个 sec-title 之后到下一个 sec-title 之前
 *     的兄弟元素包进一个 `.sec-body` 容器，用 max-height 做折叠动画。
 *
 * Q29：偏好**不再**写进旧的 `inkbox.sec`，而是写进 `inkbox-ui-prefs-v1`
 * （白名单见 `ui/qolState.js`）。旧键只读一次，用来迁移玩家已有的习惯。
 * ⚠️ 本对象**只装 UI 偏好**：World / selection / RealmView Region 一律不进
 *    （`sanitizeUiPrefs` 会把这些字段直接丢掉）。
 */
export function setupSectionTogglesPanel(sb) {
  const rail = document.querySelector('.rail.right');
  if (!rail) return;
  const qol = sb.qol;
  const stored = qol ? qol.prefs() : sanitizeUiPrefs(null);
  const titles = rail.querySelectorAll('.sec-title');
  for (const title of titles) {
    const key = sectionKey(title);
    if (!title.querySelector('.chev')) {
      const chev = document.createElement('span');
      chev.className = 'chev';
      chev.textContent = '\u25BE'; // ▾ 展开；折叠时 CSS 旋转 -90°
      title.appendChild(chev);
    }
    // 包后续兄弟到 sec-body（直到下一个 sec-title）
    const body = document.createElement('div');
    body.className = 'sec-body';
    let sib = title.nextElementSibling;
    while (sib && !sib.classList.contains('sec-title')) {
      const after = sib.nextElementSibling;
      body.appendChild(sib);
      sib = after;
    }
    title.after(body);
    // 状态恢复：prefs > data-default-collapsed > 默认展开
    const initialCollapsed = stored.collapsed[key] !== undefined
      ? stored.collapsed[key]
      : title.dataset.defaultCollapsed === '1';
    if (initialCollapsed) {
      body.classList.add('collapsed');
      title.classList.add('collapsed');
    }
    title.addEventListener('click', () => {
      const collapsed = !body.classList.contains('collapsed');
      body.classList.toggle('collapsed', collapsed);
      title.classList.toggle('collapsed', collapsed);
      if (qol) qol.setSectionCollapsed(key, collapsed);
    });
  }
  // Q30：「收起」一次折起全部非核心区（核心 = 「世界」那一节）。
  const collapseAll = $('inkBtnCollapseAll');
  if (collapseAll && !sb.collapseAllBound) {
    collapseAll.addEventListener('click', () => {
      // 用 `sectionKey()` 而不是 `textContent`：键必须与上面循环里**同一把**
      // （否则「收起全部」写进去的偏好，单点标题时读不出来）。
      const map = collapseAllMap([...titles].map((t) => sectionKey(t)));
      for (const title of titles) {
        const key = sectionKey(title);
        const want = map[key] === true;
        const body = title.nextElementSibling;
        if (!body || !body.classList.contains('sec-body')) continue;
        body.classList.toggle('collapsed', want);
        title.classList.toggle('collapsed', want);
        if (qol) qol.setSectionCollapsed(key, want);
      }
      sb.notify?.('已收起右栏（点分区标题可再展开）', 2400);
    });
    sb.collapseAllBound = true;
  }
}

// ── 最近看过（Q13）──────────────────────────────────────────────────
/**
 * 「最近看过」那一块。数据**只在 UI runtime 里**（`sb.qol.recent()`），
 * 不进 World、不进正式存档，换世界 / 读档时由 `main.js` 清空。
 *
 * ⚠️ 列表为空时**整块收起**（连标题一起藏起来）：
 *    一个永远空着的「最近看过」只是右栏上又多了一行占地方的东西。
 *
 * @param {object} sb
 */
export function refreshRecentPanel(sb) {
  const box = $('inkRecent');
  if (!box) return;
  const title = $('inkRecentTitle');
  const rows = (sb.qol && typeof sb.qol.recent === 'function') ? sb.qol.recent() : [];
  if (title) title.style.display = rows.length ? '' : 'none';
  box.style.display = rows.length ? '' : 'none';
  setPeriodicMarkup(box, rows.map((r) => {
    const tag = r.plane === 'upper' ? '上界' : (r.plane === 'nether' ? '幽冥' : '凡间');
    return `<div class="ink-log notable-row" data-recent="${r.key}">`
      + `<span class="notable-reason">${tag}</span>${r.name || '无名'}</div>`;
  }).join(''));
  if (box.dataset.recentBound === '1') return;
  box.dataset.recentBound = '1';
  box.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-recent]');
    if (!el) return;
    // 键的格式是 `<plane>:<id>`（见 `showPersonCardPanel` 的 `noteRecent`）。
    const key = String(el.dataset.recent);
    const at = key.indexOf(':');
    const plane = at < 0 ? 'mortal' : key.slice(0, at);
    const id = Number(key.slice(at + 1));
    if (!Number.isFinite(id)) return;
    if (plane === 'mortal') {
      if (findEntity(sb.world, id)) sb.showPersonCard(id);
      else if (findDead(sb.world, id)) sb.showDeadBiography(id);
      else sb.notify?.('此人已不可考');
      return;
    }
    // 另一界：复用**既有**的跨界检视入口（`inspectPlaneSubject`），
    // 不新造一条「另一界人物卡」。
    if (typeof sb.inspectPlaneSubject === 'function') {
      sb.inspectPlaneSubject(plane, { kind: 'entity', entityId: id });
    }
  });
}

export { UI_PREFS_KEY, serializeUiPrefs, withSectionCollapsed, withFoldExpanded };
