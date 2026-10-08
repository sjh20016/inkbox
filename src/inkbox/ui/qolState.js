// 水墨沙盒 · UX/QoL 填缝包的**纯逻辑**（QOL_PASS1）
//
// ───────────────────────────────────────────────────────────────────────
// 这个模块负责什么
// ───────────────────────────────────────────────────────────────────────
//
// 本轮（Q1–Q42）改的全是「玩家怎么用已有功能」，**一条模拟规则都不动**。
// 但「怎么用」里有一大半是**判定**：Escape 该关哪一层、焦点在输入框里时
// 哪些键该被吞掉、长列表该折到第几条、存档槽那一行该写什么。
// 这些判定如果写在 `main.js` 里，就只能在浏览器里试——而它们恰好是最容易
// 悄悄错的那一类（错法通常不是抛错，而是「该关的没关 / 该吞的没吞」）。
//
// 所以把它们**全部**收进这个文件，并保持：
//   · **零 import**（与 `ui/realmView.js` / `render/relationGraph.js` 同款）——
//     没有世界、没有 DOM、没有 RNG，于是 `scripts/inkbox-qol-check.mjs`
//     能在 node 里直接把每一条判定钉住；
//   · **不写任何世界字段、不进存档**——本模块只回答「该怎么做」，
//     做不做、怎么做由 `ui/qol.js` 与 `main.js` 决定。
//
// ⚠️ 铁律：本模块**不 import `sim/*` / `world/*` / `render/*`**。
//    它连 `World` 长什么样都不知道——这正是「UI 微调不许碰模拟」的**结构性**
//    保证，而不是靠一句注释。
//
// ⚠️ 本模块的消费者有两处 DOM 侧 + 测试：
//    · `ui/qol.js`（QoL 控制器：Escape 分层 / 偏好 / 确认条 / Toast 定位）；
//    · `ui/railPanels.js`（右栏面板：折叠条数 / 分区折叠 / 槽位文案）。
//    两个都是**纯 UI** 模块，谁也不许把这里的东西接进模拟。
//    测试侧是 `scripts/inkbox-qol-check.mjs`。
//    ⚠️ `main.js` **不**直接 import 本模块——它只跟 `ui/qol.js` 说话，
//       免得「判定」散回主程序（那正是本模块存在的理由）。

// ── Q1 · Escape 分层关闭 ─────────────────────────────────────────────
/**
 * Escape 的**优先级总表**（从上到下，先命中的先关）。
 *
 * 用户要的是「Escape 不该是含义模糊的『什么都关』按钮」：
 * 每按一次只退**一层**，连续按就能从「开着弹窗 + 视界 + 检视」一路退回
 * 普通观察状态。所以判据必须是**有序**的——顺序本身就是契约。
 *
 *   confirm    轻量确认条（Q21：毁掉当前世界前的问一句）——最优先，
 *              因为它是**模态**的：后面那些层此刻都被它挡着。
 *   help       快捷键帮助层（Q31）。
 *   float      浮层：人物一生 / 史册传记 / 窗内检视卡（Q36 的 stale 面板）。
 *   realmView  已提交的视界（`this.selection`）。
 *   selection  拖拽中的划选路径（`this.selectPath`）——还没成型，先丢掉。
 *   inspect    凡间检视面板（`#inkInspect`）。
 *
 * ⚠️ **不在这张表里的东西，Escape 一律不许碰**：
 *    时间速度、世界状态、`world.watch`、选中实体、`newWorld()`。
 *    「Escape 不重置世界」是硬要求，所以这张表里没有「重置」这一层。
 */
export const ESCAPE_ORDER = Object.freeze(['confirm', 'help', 'float', 'realmView', 'selection', 'inspect']);

/**
 * 这一下 Escape 该关哪一层。
 *
 * @param {object} state 各层是否开着（真值即「开着」）：
 *   `{ confirm, help, float, realmView, selection, inspect }`
 * @returns {string|null} 层名（`ESCAPE_ORDER` 之一）；一层都没开时返回 `null`
 *   ——调用方据此**什么都不做**（而不是顺手去做别的事）。
 */
export function nextEscapeAction(state = {}) {
  for (let i = 0; i < ESCAPE_ORDER.length; i += 1) {
    const layer = ESCAPE_ORDER[i];
    if (state && state[layer]) return layer;
  }
  return null;
}

// ── Q2 · 输入框快捷键保护 ────────────────────────────────────────────
/** 会「吃键盘」的表单元素标签。 */
const TEXT_ENTRY_TAGS = Object.freeze(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * 焦点是不是落在**文本输入类**元素上（Q2：此时 `1–6 / G / V / W / H / [ / ] / Space`
 * 不得误触游戏快捷键）。
 *
 * ⚠️ 判据必须含 `isContentEditable`：`contenteditable` 的宿主元素
 *    `tagName` 是 `DIV`，只看标签名会把它漏掉——于是玩家在可编辑区域里
 *    打一个 `w`，战争显示就开了。这类漏判**不报错**，只是行为莫名其妙。
 * ⚠️ `Escape` **不在**被吞之列（用户明确要求「Escape 可以按既定规则处理」），
 *    所以调用方要把它放在这个判据**之前**。
 *
 * @param {object|null} el 事件目标（或任何带 `tagName` / `isContentEditable` 的对象）
 * @returns {boolean}
 */
export function isTextEntryTarget(el) {
  if (!el) return false;
  const tag = String(el.tagName || '').toUpperCase();
  if (TEXT_ENTRY_TAGS.includes(tag)) return true;
  return el.isContentEditable === true;
}

// ── Q29 · UI 偏好（**只存界面习惯**）─────────────────────────────────
/**
 * UI 偏好的 localStorage 键。
 *
 * ⚠️ 与旧的 `inkbox.sec`（右栏分区折叠）**不是同一份东西**：旧键只装
 *    「哪些分区折叠」，本键要多装几样纯 UI 习惯（帮助看没看过、长列表展开没展开）。
 *    旧键照旧读（向后兼容），新键是唯一的写入口——两个键同时写会让
 *    「哪一份是真的」变成第二个真相。
 *
 * ⚠️ 这个对象**只许装 UI 偏好**。禁止装：`World`、`selection`、
 *    RealmView Region、任何 gameplay state。`sanitizeUiPrefs` 是这条禁令的
 *    执行点——白名单之外的一律丢掉（宁可丢一个偏好，也不许把世界漏进 localStorage）。
 */
export const UI_PREFS_KEY = 'inkbox-ui-prefs-v1';

/** 旧的右栏分区折叠键（D3-B3 引入）。只读，不再写。 */
export const LEGACY_SECTION_KEY = 'inkbox.sec';

/** 白名单：本键**只允许**出现这三个字段。 */
export const UI_PREFS_FIELDS = Object.freeze(['collapsed', 'helpSeen', 'folds']);

/** 空偏好。调用方拿到的是**新对象**，改它不会污染默认值。 */
export function defaultUiPrefs() {
  return { collapsed: {}, helpSeen: false, folds: {} };
}

/**
 * 把任意输入（通常是 `localStorage.getItem` 的原始串）收成一份合法偏好。
 * 任何异常 / 非对象 / 越界字段一律**安静丢掉**，绝不抛错——
 * 偏好坏了不该让整个沙盒打不开。
 */
export function sanitizeUiPrefs(raw) {
  const out = defaultUiPrefs();
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch (_) { return out; }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  if (data.collapsed && typeof data.collapsed === 'object' && !Array.isArray(data.collapsed)) {
    for (const [k, v] of Object.entries(data.collapsed)) {
      if (typeof v === 'boolean') out.collapsed[String(k)] = v;
    }
  }
  if (data.folds && typeof data.folds === 'object' && !Array.isArray(data.folds)) {
    for (const [k, v] of Object.entries(data.folds)) {
      if (typeof v === 'boolean') out.folds[String(k)] = v;
    }
  }
  out.helpSeen = data.helpSeen === true;
  return out;
}

/** 序列化：只写白名单字段，键序固定（同一份偏好永远同一串，便于比对）。 */
export function serializeUiPrefs(prefs) {
  const safe = sanitizeUiPrefs(prefs);
  return JSON.stringify({ collapsed: safe.collapsed, helpSeen: safe.helpSeen, folds: safe.folds });
}

/** 折叠状态切换（返回**新对象**，不改入参）。 */
export function withSectionCollapsed(prefs, key, collapsed) {
  const next = sanitizeUiPrefs(prefs);
  next.collapsed[String(key)] = collapsed === true;
  return next;
}

/** 长列表展开状态切换（返回**新对象**）。 */
export function withFoldExpanded(prefs, key, expanded) {
  const next = sanitizeUiPrefs(prefs);
  next.folds[String(key)] = expanded === true;
  return next;
}

/**
 * 「帮助提示看过了」（Q29 / Q31，返回**新对象**）。
 *
 * ⚠️ 只用来**少说一句废话**：没看过时开机提示一次「按 ? 看快捷键」，
 *    看过之后不再提示。它**不控制任何玩法**——不看帮助一样能玩，
 *    所以即使 localStorage 被清空、这个位丢了，也只是多提示一次。
 */
export function withHelpSeen(prefs, seen) {
  const next = sanitizeUiPrefs(prefs);
  next.helpSeen = seen === true;
  return next;
}

/**
 * 旧键 → 新键的迁移。旧键里**只有**分区折叠，所以只搬 `collapsed`。
 * `legacy` 为空时返回一份默认偏好（调用方据此决定要不要写回）。
 */
export function migrateLegacySections(legacyRaw, prefs) {
  const next = sanitizeUiPrefs(prefs);
  if (!legacyRaw) return next;
  let legacy = legacyRaw;
  if (typeof legacyRaw === 'string') {
    try { legacy = JSON.parse(legacyRaw); } catch (_) { return next; }
  }
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return next;
  for (const [k, v] of Object.entries(legacy)) {
    if (typeof v === 'boolean' && next.collapsed[String(k)] === undefined) {
      next.collapsed[String(k)] = v;
    }
  }
  return next;
}

// ── Q28 · 长列表折叠 ─────────────────────────────────────────────────
/** 右栏长列表默认显示多少条（Q28：12～20 条）。 */
export const LIST_FOLD_LIMIT = 12;

/**
 * 把一列已经渲染好的行按「默认折叠」切开。
 *
 * ⚠️ 这是**纯展示限制**：`rows` 一条都不能少（不许 `slice` 掉数据再交出去，
 *    调用方要拿 `hidden` 去写「另有 N 条 · 展开」）。世界里的实体数、
 *    名录条数、魂池容量**一个都不许因此变小**。
 *
 * @param {Array} rows 全部行
 * @param {number} limit 默认显示条数
 * @param {boolean} expanded 玩家是否已展开
 * @returns {{visible: Array, hidden: number, expanded: boolean}}
 */
export function foldRows(rows, limit = LIST_FOLD_LIMIT, expanded = false) {
  const list = Array.isArray(rows) ? rows : [];
  const n = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : LIST_FOLD_LIMIT;
  if (expanded || list.length <= n) {
    return { visible: list.slice(), hidden: 0, expanded: expanded === true };
  }
  return { visible: list.slice(0, n), hidden: list.length - n, expanded: false };
}

/**
 * 「另有 N 条 · 展开」/「收起」的文案。
 *
 * ⚠️ 单位（人 / 位 / 条）由调用方给：人口列表说「另有 83 人」，
 *    事件列表说「另有 83 条」。写死一个单位会让某一块读起来像错的。
 */
export function foldMoreLabel(hidden, unit = '条') {
  const n = Math.max(0, Math.floor(Number(hidden) || 0));
  return `另有 ${n} ${unit} · 展开`;
}

/** 展开态下的收起文案。 */
export const FOLD_COLLAPSE_LABEL = '收起';

// ── Q13 · 最近检视 ───────────────────────────────────────────────────
/** 最近检视最多留几条。 */
export const RECENT_CAP = 5;

/**
 * 把一项推到「最近看过」队首：重复项**上浮**（不重复占位），超上限截尾。
 *
 * ⚠️ 返回**新数组**——它只活在 UI runtime，不进 `World`、不进正式存档、
 *    换世界 / 读档清空（清空是调用方的事，见 `ui/qol.js`）。
 *
 * @param {Array} list 现有列表（`{key, kind, name, ...}`）
 * @param {object} item 新项（必须带 `key`）
 * @param {number} cap 上限
 */
export function pushRecent(list, item, cap = RECENT_CAP) {
  if (!item || item.key === undefined || item.key === null) return Array.isArray(list) ? list.slice() : [];
  const out = [];
  for (const it of Array.isArray(list) ? list : []) {
    if (it && String(it.key) !== String(item.key)) out.push(it);
  }
  out.unshift(item);
  return out.slice(0, Math.max(0, Math.floor(cap) || RECENT_CAP));
}

// ── Q24 / Q26 · 存档槽与导出名 ───────────────────────────────────────
/** 槽位信息的侧索引键。**不是**正式存档的一部分，也不改 `save.js` 的 schema。 */
export const SLOT_META_KEY = 'inkbox-slotmeta-v1';

/** 槽名 → 玩家可见短名（`auto` → 「自动」，`slot3` → 「槽 3」）。 */
export function slotLabel(slot) {
  const s = String(slot || '');
  if (s === 'auto') return '自动';
  const m = /^slot([1-9]\d*)$/.exec(s);
  return m ? `槽 ${m[1]}` : s;
}

/**
 * 把任意输入收成一份合法的槽位侧索引 `{ [slot]: { seed, day, savedAt } }`。
 *
 * ⚠️ `seed` / `day` 的「**不知道**」必须用 `null` 表达，**不许塌成 0**：
 *    `Number(null)` 是 0，所以只写 `Number.isFinite(Number(info.seed))` 的话，
 *    一条「种子未知」的记录会被读成「种子 0」——而 `slotMetaText` 那句
 *    「仙历 M 年」（只知道天数、不知道种子）就成了**永远走不到的死分支**。
 *    这正是本项目记过的「字段存在 ≠ 字段生效」：分支写了，但没有任何输入能命中它。
 */
export function sanitizeSlotMeta(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch (_) { return {}; }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out = {};
  for (const [slot, info] of Object.entries(data)) {
    if (!info || typeof info !== 'object' || Array.isArray(info)) continue;
    const seed = asFiniteNumber(info.seed);
    const day = asFiniteNumber(info.day);
    const savedAt = asFiniteNumber(info.savedAt);
    out[String(slot)] = {
      seed: seed === null ? null : seed >>> 0,
      day: day === null ? null : Math.max(0, Math.floor(day)),
      savedAt: savedAt === null ? null : savedAt,
    };
  }
  return out;
}

/** `null` / `undefined` / `''` / 非有限值 ⇒ `null`（**不塌成 0**）；否则给数字。 */
function asFiniteNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 写一条槽位信息（返回**新对象**）。 */
export function withSlotMeta(meta, slot, info) {
  const next = sanitizeSlotMeta(meta);
  // ⚠️ 走 `asFiniteNumber` 而不是 `Number(...)`：`Number(null)` 是 0，
  //    用 `Number` 的话「种子未知」会被写成「种子 0」（理由见 sanitizeSlotMeta）。
  const seed = asFiniteNumber(info && info.seed);
  const day = asFiniteNumber(info && info.day);
  next[String(slot)] = {
    seed: seed === null ? null : seed >>> 0,
    day: day === null ? null : Math.max(0, Math.floor(day)),
    savedAt: Date.now(),
  };
  return next;
}

/** 删一条槽位信息（返回**新对象**）。 */
export function withoutSlotMeta(meta, slot) {
  const next = sanitizeSlotMeta(meta);
  delete next[String(slot)];
  return next;
}

/**
 * 槽位那一行的附加信息（Q24）：`仙历 482 年` / `seed 226 · 482 年`。
 * 没有侧索引（老档、别处写进去的档）时返回空串——**不猜**，
 * 也不为了显示它去把整档解压一遍（那是 `deserialize` 的第二份实现）。
 */
export function slotMetaText(meta, slot) {
  const info = sanitizeSlotMeta(meta)[String(slot)];
  if (!info || info.day === null) return '';
  const year = Math.floor(info.day / 360) + 1;
  return info.seed === null ? `仙历 ${year} 年` : `seed ${info.seed} · ${year} 年`;
}

/** 导出文件名（Q26）：只含安全字符，含 seed 与天数。 */
export function exportFileName(world) {
  const seed = Number(world && world.seed);
  const day = Number(world && world.day);
  const s = Number.isFinite(seed) ? seed >>> 0 : 0;
  const d = Number.isFinite(day) ? Math.max(0, Math.floor(day)) : 0;
  return `inkbox_seed${s}_day${d}.json`;
}

// ── Q22 / Q25 · 存档容量与错误口径 ───────────────────────────────────
/**
 * localStorage 的实测硬上限（UTF-16 码元）。这个数是本项目既有文档里量出来的，
 * **不是**规范保证值；改它等于改「多大算满」的口径，要有新的实测支撑。
 */
export const STORAGE_QUOTA_CHARS = 5242877;

/** 预警阈值：用到 80% 就提醒玩家导出文件长期保存。 */
export const STORAGE_WARN_CHARS = Math.floor(STORAGE_QUOTA_CHARS * 0.8);

/**
 * 保存前的粗略容量提示（Q25）。
 *
 * ⚠️ 用**序列化字符串长度**（码元）而不是字节：localStorage 按 UTF-16 码元计费，
 *    拿 `Blob.size` 去比会低估一半，于是「还能存」的错觉一直持续到配额报错。
 *
 * @param {number} usedChars 当前已用码元（各槽之和）
 * @param {number} incomingChars 这一次要写入的码元
 * @returns {string} 空串 = 不必提示
 */
export function quotaWarning(usedChars, incomingChars) {
  const used = Number.isFinite(usedChars) ? Math.max(0, usedChars) : 0;
  const incoming = Number.isFinite(incomingChars) ? Math.max(0, incomingChars) : 0;
  const total = used + incoming;
  if (total >= STORAGE_QUOTA_CHARS) return '存档空间已满，请先导出并清理旧槽';
  if (total >= STORAGE_WARN_CHARS) return '此世界存档较大，建议导出文件长期保存';
  return '';
}

/**
 * 把 `localStorage.setItem` 抛出来的原始消息翻成人话（Q22）。
 *
 * 为什么必须翻：`QuotaExceededError` 的 message 在各浏览器里不一样
 * （`Failed to execute 'setItem' ... exceeded the quota` /
 * `The quota has been exceeded.` / 本地化版本），直接把原文贴进通知栏，
 * 玩家看到的是半句英文技术话——而**这条错恰恰是最需要玩家看懂的一条**
 * （它要求玩家去导出并清槽）。
 */
export function describeSaveError(message) {
  const text = String(message == null ? '' : message).trim();
  if (!text) return '未知原因';
  if (/quota|exceeded|storage\s*full|空间/i.test(text)) return '浏览器空间不足';
  return text;
}

// ── Q35 · inspectAt 的整数守卫 ───────────────────────────────────────
/**
 * 把「检视坐标」收成整数格——**与正式拾取同一套取整规则**。
 *
 * ⚠️ 正式拾取是 `render/camera.js` 的 `pick()`，它对世界坐标用的是
 *    `Math.round`（矩形分支与立体分支都是）。所以这里也必须是 `Math.round`：
 *    换成 `Math.floor` 会让 `inspectAt(10.6, 8.6)` 与「鼠标点在那一格」
 *    落到**不同的格**上——面板说的人和地图上圈住的人不是同一个，
 *    而且不报错、不 NaN，只是读数是别人的。
 *
 * ⚠️ 非有限值（`NaN` / `Infinity` / `undefined`）**直接拒绝**（返回 `null`），
 *    而不是兜底成 0：兜底成 0 会把「一次坏调用」变成「安静地检视了 (0,0)」。
 * ⚠️ `null` / `''` / 布尔也必须**显式拒绝**——`Number(null)` 与 `Number('')`
 *    都是 **0**，光靠 `Number.isFinite` 拦不住它们，于是「坐标没给」会悄悄
 *    变成「坐标就是 (0,0)」，正好是这条守卫要防的那种错。
 *    （`0` 本身是**合法**坐标，所以不能简单地把 falsy 一律拒掉。）
 *
 * @param {number} value 可能是浮点 / 越界的坐标
 * @returns {number|null}
 */
export function inspectCoord(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value === 'boolean') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/** 一次检视调用的两个坐标都要合法。 */
export function inspectPoint(x, y) {
  const ix = inspectCoord(x);
  const iy = inspectCoord(y);
  if (ix === null || iy === null) return null;
  return { x: ix, y: iy };
}

// ── Q11 · Toast 的定位信息 ───────────────────────────────────────────
/**
 * 一条提示能带玩家去哪。
 *
 * 判据**只消费已有字段**（Q11 明令「不要为了支持点击而修改模拟事件结构」）：
 *   · `plane` 不是凡间 且 有坐标 ⇒ 只能定位（另一界的人不在凡间这张图上）；
 *   · 有坐标 ⇒ `focus`（镜头滑过去）+ 凡间检视；
 *   · 只有实体 id ⇒ `entity`（镜头跟着那个人走）；
 *   · 什么都没有 ⇒ `null`（保持普通 Toast，不可点）。
 */
export function toastLocation(target) {
  if (!target || typeof target !== 'object') return null;
  const plane = target.plane ? String(target.plane) : 'mortal';
  const x = Number(target.x);
  const y = Number(target.y);
  const hasXY = Number.isFinite(x) && Number.isFinite(y);
  if (plane !== 'mortal') {
    return hasXY ? { kind: 'locate', plane, x, y } : null;
  }
  if (hasXY) {
    const id = Number(target.entityId);
    return { kind: 'focus', x, y, entityId: Number.isFinite(id) ? id : null };
  }
  const id = Number(target.entityId);
  if (Number.isFinite(id)) return { kind: 'entity', entityId: id };
  return null;
}

/** Toast 可点时的提示尾巴（不要写成「点击查看」而不说会去哪）。 */
export function toastHint(location) {
  if (!location) return '';
  if (location.kind === 'locate') return '（点此定位）';
  if (location.kind === 'entity') return '（点此找到他）';
  return '（点此前往）';
}

// ── Q21 · 未保存变化的 dirty 判定 ────────────────────────────────────
/**
 * 会把当前世界变成「还没保存」的玩家行为。
 *
 * ⚠️ 这是一个**纯 UI 标志**：它不是模拟字段、不进 `World`、不进存档，
 *    也不做任何 diff。判据只有一句：玩家做过一件「改了世界」的事。
 * ⚠️ `advance` 也在里面：世界自己跑了明显时间也算——否则「开着快进去吃饭，
 *    回来点重新开天」不会得到任何提醒，而那是玩家最需要提醒的一种情况。
 */
export const DIRTY_EVENTS = Object.freeze([
  'advance', 'intervention', 'terrain', 'undo', 'watch', 'character-edict', 'load', 'import', 'newWorld',
]);

/** 玩家做了一件事之后，dirty 变成什么。 */
export function dirtyAfterEvent(dirty, event) {
  if (DIRTY_EVENTS.includes(event)) return true;
  return dirty === true;
}

/**
 * 把世界「存下来」之后，dirty 变成什么。
 * 存档与导出都算：两者都给了玩家一份可恢复的副本。
 */
export function dirtyAfterPersist(event) {
  if (event === 'save' || event === 'export') return false;
  return null;   // null = 「这次事件与 dirty 无关」，调用方保持原值
}

/** 要不要在「重新开天 / 读档 / 导入」之前问一句。 */
export function needsDiscardConfirm(dirty) {
  return dirty === true;
}

// ── Q30 · 「收起全部」 ───────────────────────────────────────────────
/**
 * 哪些分区**不**参与「收起全部」。
 *
 * 「世界」是右栏第一块、也是玩家最常看的一块，把它一起收掉会让
 * 「收起」看起来像「把界面弄坏了」。所以核心区只留它。
 */
export const CORE_SECTION_TITLES = Object.freeze(['世界']);

/** 一次「收起全部」之后，每个分区标题应该是什么折叠状态。 */
export function collapseAllMap(titles) {
  const out = {};
  for (const t of Array.isArray(titles) ? titles : []) {
    const key = String(t || '').trim();
    if (!key) continue;
    out[key] = !CORE_SECTION_TITLES.includes(key);
  }
  return out;
}

// ── Q6 · 时间速度的文案 ──────────────────────────────────────────────
/**
 * 暂停 / 档位的中文状态。
 *
 * ⚠️ 「岁月已停」与「岁月 · 疾」必须是**同一句话的两个形态**——
 *    分开写两处，迟早有一处忘了改（本项目记录过的「文档说有、代码里没有」）。
 *
 * @param {{label:string, mult:number}|null} speed 当前档（`TIME.speeds[i]`）
 * @param {boolean} paused
 */
export function speedStatusText(speed, paused) {
  if (paused) return '岁月已停';
  const label = speed && speed.label ? speed.label : '常';
  return `岁月 · ${label}`;
}

// ── Q5 · 当前工具状态 ────────────────────────────────────────────────
/**
 * 底部「我手里现在拿的是什么」那一行。
 *
 *   · 划选 / 点选工具没有半径可言 ⇒ 只报名字（写「抬山 · 4」是谎话）；
 *   · 笔刷类工具带上半径（数字就是玩家刚调的那一个）。
 */
export function toolStateText(tool, brushRadius) {
  if (!tool) return '';
  const name = tool.name || tool.id || '';
  const hasBrush = tool.mode === 'drag' || tool.mode === 'click';
  if (!hasBrush) return name;
  const r = Number(brushRadius);
  return Number.isFinite(r) ? `${name} · ${Math.round(r)}` : name;
}

// ── Q42 · 拖动 / 点击阈值 ────────────────────────────────────────────
/**
 * 复用**已有**的 6px 规范（`ui/realmView.js` 的 `VIEW_CLICK_PX`），
 * 不在本模块另立一个 magic number。
 *
 * 这里只回答「这一段位移算不算点击」——判据是**屏幕像素**，
 * 因为手感在屏幕上（缩放到很远时一格只有零点几像素，用格数会把
 * 「点一下」判成「拖了半张图」）。
 */
export function isClickWithinDrag(movedPx, clickPx) {
  const moved = Number(movedPx);
  const limit = Number(clickPx);
  if (!Number.isFinite(moved) || !Number.isFinite(limit)) return false;
  return moved < limit;
}
