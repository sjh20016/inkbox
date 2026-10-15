#!/usr/bin/env node
// Inkbox UX/QoL 填缝包回归 · QOL_PASS1 起
//
// ───────────────────────────────────────────────────────────────────────
// 这个文件是干什么的
// ───────────────────────────────────────────────────────────────────────
//
// 本工程包（Q1–Q42）改的全是「玩家怎么用已有功能」：Escape 该退哪一层、
// 焦点在输入框里时哪些键该被吞、长列表该折到第几条、存档槽那一行写什么。
// 这些判定的错法**几乎都不抛错**——是「该关的没关 / 该吞的没吞 / 该拦的没拦」。
// 所以它们必须能被**在 node 里直接钉住**，而不是只靠肉眼看浏览器。
//
// 于是本文件走两条腿（与 `inkbox-view.mjs` 同款）：
//   · **纯模块运行时断言**——`ui/qolState.js` 零 import，node 能直接 import，
//     于是每一条判定都能真跑（而不是扫源码猜它写对了没有）；
//   · **源码结构断言**（去注释后扫 `src/inkbox/**`）——钉那些「能真跑但跑不到」
//     的东西：模拟侧够不够得到 UI、`watchNewsCount` 是不是唯一真源、
//     Escape 有没有偷改世界。
//
// ⚠️ 去注释是**承重的**：本仓注释里大量出现「被禁止的字面量」（正是在解释
//    「为什么不能这么写」）。例如 `ui/qol.js` 的注释里就写着 `world.watch`，
//    不去注释，「qol.js 不许碰世界」那条会被注释误判成假红。
//
// ───────────────────────────────────────────────────────────────────────
// 模拟纯度门禁（委托书 §十四）
// ───────────────────────────────────────────────────────────────────────
//
// 委托书要求：「同种子、同玩家命令、同推进天数下，UI 功能前后 World 与模拟 RNG
// 不应变化」。本文件用**结构性**的方式把这条钉死，而不是靠跑两遍比对：
//
//   ① 模拟侧（`sim/**` / `world/**`）**一个文件都不 import UI 的 QoL 模块**
//      ⇒ 「UI 改不动世界」不是纪律，是**够不到**；
//   ② `ui/qolState.js` 零 import、不含 `document`、不含 RNG
//      ⇒ 它连世界长什么样都不知道；
//   ③ `ui/qol.js` / `ui/railPanels.js` 通篇没有 `world.<x> =` 赋值；
//   ④ 真跑一次 `watchNewsCount`：调两遍结果相同、世界 JSON 逐字不变
//      （本轮唯一动到 `sim/` 的一处，必须证明它只读）。
//
// 运行：`node scripts/inkbox-qol-check.mjs`（退出码 0 = 全绿）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ESCAPE_ORDER, nextEscapeAction, isTextEntryTarget,
  UI_PREFS_KEY, LEGACY_SECTION_KEY, UI_PREFS_FIELDS,
  defaultUiPrefs, sanitizeUiPrefs, serializeUiPrefs,
  withSectionCollapsed, withFoldExpanded, withHelpSeen, migrateLegacySections,
  LIST_FOLD_LIMIT, foldRows, foldMoreLabel, FOLD_COLLAPSE_LABEL,
  RECENT_CAP, pushRecent,
  SLOT_META_KEY, slotLabel, sanitizeSlotMeta, withSlotMeta, withoutSlotMeta,
  slotMetaText, exportFileName,
  STORAGE_QUOTA_CHARS, STORAGE_WARN_CHARS, quotaWarning, describeSaveError,
  inspectCoord, inspectPoint,
  toastLocation, toastHint,
  DIRTY_EVENTS, dirtyAfterEvent, dirtyAfterPersist, needsDiscardConfirm,
  CORE_SECTION_TITLES, collapseAllMap,
  speedStatusText, toolStateText, isClickWithinDrag,
} from '../src/inkbox/ui/qolState.js';
import { VIEW_CLICK_PX } from '../src/inkbox/ui/realmView.js';
import { watchNewsCount, watchHasNews } from '../src/inkbox/sim/watch.js';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { serializeWorld } from '../src/inkbox/io/save.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INKBOX_SRC = path.resolve(HERE, '../src/inkbox');

let checks = 0;
let failed = 0;
function check(label, condition, detail = '') {
  checks += 1;
  const tail = detail ? ` — ${detail}` : '';
  if (condition) {
    console.log(`  ✓ ${label}${tail}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${tail}`);
  }
}
function section(title) {
  console.log(`\n${title}`);
}

// ══ 源码扫描（去注释，保留行号） ═════════════════════════════════════
function stripComments(src) {
  let out = '';
  let i = 0;
  let mode = 0;          // 0 代码 · 1 行注释 · 2 块注释
  let quote = '';        // 当前字符串定界符（'' = 不在字符串里）
  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];
    if (mode === 0 && !quote && c === '/' && c2 === '/') { mode = 1; out += '  '; i += 2; continue; }
    if (mode === 0 && !quote && c === '/' && c2 === '*') { mode = 2; out += '  '; i += 2; continue; }
    if (mode === 1) { if (c === '\n') { mode = 0; out += c; } else { out += ' '; } i += 1; continue; }
    if (mode === 2) {
      if (c === '*' && c2 === '/') { mode = 0; out += '  '; i += 2; continue; }
      out += c === '\n' ? '\n' : ' ';
      i += 1; continue;
    }
    if (!quote && (c === "'" || c === '"' || c === '`')) { quote = c; out += c; i += 1; continue; }
    if (quote) {
      if (c === '\\') { out += c + (c2 || ''); i += 2; continue; }
      if (c === quote) quote = '';
      out += c; i += 1; continue;
    }
    out += c; i += 1;
  }
  return out;
}

/** 递归枚举 `src/inkbox/**` 下的 `.js`，返回 `{ rel, src }`（`src` 已去注释）。 */
function readTree(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) { walk(full); continue; }
      if (!name.endsWith('.js')) continue;
      const rel = path.relative(INKBOX_SRC, full).replace(/\\/g, '/');
      out.push({ rel, src: stripComments(fs.readFileSync(full, 'utf8')) });
    }
  };
  walk(dir);
  return out;
}

/** 从 `{` 起做括号配平，返回整段（含花括号）。 */
function braceSlice(src, openIdx) {
  let depth = 0;
  for (let k = openIdx; k < src.length; k += 1) {
    if (src[k] === '{') depth += 1;
    else if (src[k] === '}') { depth -= 1; if (depth === 0) return src.slice(openIdx, k + 1); }
  }
  return src.slice(openIdx);
}

/** 取 `name` 的函数体（类方法或顶层函数都认）。 */
function bodyOf(src, name) {
  const meth = new RegExp(`^[ \\t]*${name}\\s*\\([^)]*\\)\\s*\\{`, 'm').exec(src);
  if (meth) return braceSlice(src, meth.index + meth[0].length - 1);
  const fn = new RegExp(`function\\s+${name}\\s*\\(`).exec(src);
  if (fn) {
    const j = src.indexOf('{', fn.index);
    if (j >= 0) return braceSlice(src, j);
  }
  return '';
}

const TREE = readTree(INKBOX_SRC);
const findFile = (rel) => TREE.find((f) => f.rel === rel);

console.log('══════════════════════════════════════════════════════════════');
console.log('inkbox UX/QoL 填缝包 · QOL_PASS1 回归');
console.log(`范围：${TREE.length} 个源文件`);
console.log('══════════════════════════════════════════════════════════════');

// ══ Q1 · Escape 分层关闭 ═════════════════════════════════════════════
section('Q1 · Escape 分层关闭（一次只退一层）');

check('ESCAPE_ORDER 是冻结的、且顺序就是契约',
  Object.isFrozen(ESCAPE_ORDER)
  && ESCAPE_ORDER.join('>') === 'confirm>help>float>realmView>selection>inspect',
  ESCAPE_ORDER.join(' > '));

check('一层都没开 ⇒ null（调用方什么都不做，不顺手干别的）',
  nextEscapeAction({}) === null && nextEscapeAction() === null);

check('只开检视 ⇒ inspect（最低优先级那层也关得掉）',
  nextEscapeAction({ inspect: true }) === 'inspect');

check('只开划选 ⇒ selection',
  nextEscapeAction({ selection: true }) === 'selection');

check('全开 ⇒ confirm（模态优先，后面那些此刻都被它挡着）',
  nextEscapeAction({ confirm: true, help: true, float: true, realmView: true, selection: true, inspect: true }) === 'confirm');

check('help 压过 float / realmView / selection / inspect',
  nextEscapeAction({ help: true, float: true, realmView: true, selection: true, inspect: true }) === 'help');

check('realmView 压过 selection / inspect',
  nextEscapeAction({ realmView: true, selection: true, inspect: true }) === 'realmView');

// 「连续按就能一路退回普通观察状态」——逐次关掉最上层，6 下之后必须见底。
{
  const open = { confirm: true, help: true, float: true, realmView: true, selection: true, inspect: true };
  const seen = [];
  for (let i = 0; i < 10; i += 1) {
    const layer = nextEscapeAction(open);
    if (!layer) break;
    seen.push(layer);
    open[layer] = false;
  }
  check('连按 Escape：逐层退回，顺序与 ESCAPE_ORDER 完全一致，第 7 下见底',
    seen.join('>') === ESCAPE_ORDER.join('>') && nextEscapeAction(open) === null,
    seen.join(' > '));
}

check('Escape 的层表里**没有**「重置世界 / 改速度」这一类',
  !ESCAPE_ORDER.some((k) => /reset|newWorld|regen|speed|time|world/i.test(k)),
  ESCAPE_ORDER.join(' > '));

{
  const qolJs = findFile('ui/qol.js');
  const escBody = bodyOf(qolJs.src, 'handleEscape');
  check('ui/qol.js 的 handleEscape 里没有 newWorld / setSpeed / 世界赋值',
    escBody.length > 0
    && !/newWorld\s*\(/.test(escBody)
    && !/setSpeed\s*\(/.test(escBody)
    && !/\bworld\s*\.\s*\w+\s*=/.test(escBody));
}

// ══ Q2 · 输入框快捷键保护 ════════════════════════════════════════════
section('Q2 · 焦点在输入框里时不误触游戏快捷键');

check('INPUT / TEXTAREA / SELECT ⇒ 吞键',
  isTextEntryTarget({ tagName: 'INPUT' })
  && isTextEntryTarget({ tagName: 'TEXTAREA' })
  && isTextEntryTarget({ tagName: 'SELECT' }));

check('小写标签名也认（tagName 大小写不保证）',
  isTextEntryTarget({ tagName: 'input' }));

check('contenteditable 的宿主（tagName 是 DIV）⇒ 也要吞（只看标签名会漏掉它）',
  isTextEntryTarget({ tagName: 'DIV', isContentEditable: true }));

check('普通元素 / null ⇒ 不吞',
  !isTextEntryTarget({ tagName: 'DIV' })
  && !isTextEntryTarget({ tagName: 'BODY' })
  && !isTextEntryTarget(null));

{
  const mainJs = findFile('main.js');
  const esc = mainJs.src.indexOf('handleEscape()');
  const guard = mainJs.src.indexOf('isTextEntry');
  check('main.js 的 keydown 里 Escape 判据**排在**输入框保护之前（Esc 照旧能用）',
    esc >= 0 && guard >= 0 && esc < guard,
    `handleEscape@${esc} · isTextEntry@${guard}`);
}

// ══ Q35 · inspectAt 的整数守卫 ══════════════════════════════════════
section('Q35 · 检视坐标的整数守卫（与正式拾取同一套取整）');

check('取整用 Math.round（与 render/camera.js 的 pick 一致）',
  inspectCoord(10.6) === 11 && inspectCoord(10.4) === 10 && inspectCoord(-2.5) === -2,
  `10.6→${inspectCoord(10.6)} · 10.4→${inspectCoord(10.4)} · -2.5→${inspectCoord(-2.5)}`);

check('字符串数字也收（事件里拿到的常常是字符串）',
  inspectCoord('8') === 8);

check('非有限值**直接拒绝**（不兜底成 0——那会把坏调用变成「安静地看了 (0,0)」）',
  inspectCoord(NaN) === null
  && inspectCoord(Infinity) === null
  && inspectCoord(-Infinity) === null
  && inspectCoord(undefined) === null
  && inspectCoord(null) === null);

check('★ `null` / 空串 / 布尔也拒绝（`Number(null)` 与 `Number("")` 都是 0，只靠 isFinite 拦不住）',
  inspectCoord(null) === null && inspectCoord('') === null
  && inspectCoord('   ') === null && inspectCoord(false) === null);

check('但 `0` 是**合法**坐标（不能把 falsy 一律拒掉）',
  inspectCoord(0) === 0 && inspectCoord('0') === 0);

check('inspectPoint 两点都合法才返回，且已取整',
  JSON.stringify(inspectPoint(10.4, 8.6)) === JSON.stringify({ x: 10, y: 9 }));

check('inspectPoint 任一点非法 ⇒ null（调用方据此直接 return，不继续往下取 world.height）',
  inspectPoint(NaN, 1) === null && inspectPoint(1, Infinity) === null);

{
  const qs = findFile('ui/qolState.js').src;
  const body = bodyOf(qs, 'inspectCoord');
  check('inspectCoord 用的是 round 而不是 floor（floor 会与鼠标点的格子错开一格）',
    /Math\.round/.test(body) && !/Math\.floor/.test(body));
  const cam = findFile('render/camera.js').src;
  check('render/camera.js 的 pick 也用 Math.round 收世界坐标（两处口径一致）',
    /Math\.round/.test(cam));
}

// ══ Q28 · 长列表折叠 ═════════════════════════════════════════════════
section('Q28 · 长列表默认折叠（**只折展示，不折数据**）');

check('LIST_FOLD_LIMIT 落在委托书要求的 12～20 之间',
  LIST_FOLD_LIMIT >= 12 && LIST_FOLD_LIMIT <= 20, String(LIST_FOLD_LIMIT));

{
  const rows = Array.from({ length: 95 }, (_, i) => `row${i}`);
  const folded = foldRows(rows, LIST_FOLD_LIMIT, false);
  check('默认只显示 12 条，其余计入 hidden',
    folded.visible.length === LIST_FOLD_LIMIT && folded.hidden === 95 - LIST_FOLD_LIMIT,
    `可见 ${folded.visible.length} · 折叠 ${folded.hidden}`);
  check('★ visible + hidden === 全部（**一条都不许少**：模拟实体数不因折叠变小）',
    folded.visible.length + folded.hidden === rows.length);
  check('展开后全部可见、hidden 归 0',
    (() => { const e = foldRows(rows, LIST_FOLD_LIMIT, true); return e.visible.length === 95 && e.hidden === 0; })());
  check('短列表（≤ 上限）原样显示，不出现「另有 0 条」',
    (() => { const s = foldRows(['a', 'b'], LIST_FOLD_LIMIT, false); return s.visible.length === 2 && s.hidden === 0; })());
  check('空列表 / 非数组输入不抛',
    foldRows([], LIST_FOLD_LIMIT, false).visible.length === 0
    && foldRows(null, LIST_FOLD_LIMIT, false).visible.length === 0);
  check('foldRows 返回的是**副本**（调用方改它不会污染原数组）',
    (() => { const s = foldRows(rows, 3, true); s.visible.push('x'); return rows.length === 95; })());
}

check('foldMoreLabel 的单位由调用方给（人口说「人」、事件说「条」）',
  foldMoreLabel(83, '人') === '另有 83 人 · 展开'
  && foldMoreLabel(83) === '另有 83 条 · 展开');

check('FOLD_COLLAPSE_LABEL 是「收起」',
  FOLD_COLLAPSE_LABEL === '收起');

// ══ Q13 · 最近检视 ═══════════════════════════════════════════════════
section('Q13 · 最近看过（最多 5 条 · 重复上浮 · 只在 UI runtime）');

check('RECENT_CAP === 5', RECENT_CAP === 5, String(RECENT_CAP));

{
  let list = [];
  for (let i = 1; i <= 5; i += 1) list = pushRecent(list, { key: `mortal:${i}`, name: `人${i}` });
  check('推 5 条 ⇒ 最新在最前',
    list.length === 5 && list[0].key === 'mortal:5' && list[4].key === 'mortal:1');

  const again = pushRecent(list, { key: 'mortal:3', name: '人3' });
  check('重复看的人**上浮**而不是多占一格（长度仍是 5）',
    again.length === 5 && again[0].key === 'mortal:3' && again.filter((r) => r.key === 'mortal:3').length === 1);

  const over = pushRecent(again, { key: 'mortal:9', name: '人9' });
  check('超上限截尾：最老的那条被挤掉，长度恒为 5',
    over.length === 5 && !over.some((r) => r.key === 'mortal:1') && over[0].key === 'mortal:9');

  check('返回**新数组**，不改入参（原列表仍是 5 条且首项没变）',
    list.length === 5 && list[0].key === 'mortal:5');

  check('没有 key 的项被忽略（返回副本，不抛）',
    pushRecent(list, { name: '无键' }).length === 5
    && pushRecent(list, null).length === 5);
}

// ══ Q24 / Q26 · 存档槽与导出名 ══════════════════════════════════════
section('Q24 / Q26 · 槽位侧索引与导出文件名');

check('slotLabel：auto → 「自动」，slot3 → 「槽 3」',
  slotLabel('auto') === '自动' && slotLabel('slot3') === '槽 3', `${slotLabel('auto')} / ${slotLabel('slot3')}`);

check('slotLabel：不认识的槽名原样返回（不猜）',
  slotLabel('my-save') === 'my-save');

check('slotMetaText：**没有侧索引就说没有**，不去把整档解压一遍读它',
  slotMetaText({}, 'auto') === '' && slotMetaText(null, 'auto') === '');

check('slotMetaText：有 seed 与天数时报「seed N · M 年」',
  slotMetaText({ auto: { seed: 226, day: 175200 } }, 'auto') === 'seed 226 · 487 年',
  slotMetaText({ auto: { seed: 226, day: 175200 } }, 'auto'));

check('slotMetaText：只知道天数时报「仙历 M 年」',
  slotMetaText({ auto: { seed: null, day: 175200 } }, 'auto') === '仙历 487 年');

check('exportFileName 与委托书给的例子逐字一致',
  exportFileName({ seed: 226, day: 175200 }) === 'inkbox_seed226_day175200.json',
  exportFileName({ seed: 226, day: 175200 }));

check('exportFileName：坏输入不产生空名 / NaN 名',
  exportFileName({}) === 'inkbox_seed0_day0.json' && exportFileName(null) === 'inkbox_seed0_day0.json');

check('sanitizeSlotMeta 丢掉非对象 / 越界值，不抛',
  JSON.stringify(sanitizeSlotMeta('{"auto":"坏"}')) === '{}'
  && JSON.stringify(sanitizeSlotMeta('{不是 json')) === '{}'
  && sanitizeSlotMeta({ auto: { seed: -1, day: -5 } }).auto.seed === 4294967295
  && sanitizeSlotMeta({ auto: { seed: -1, day: -5 } }).auto.day === 0);

check('★ sanitizeSlotMeta 把「不知道」保留成 null（塌成 0 会让「仙历 M 年」变成死分支）',
  sanitizeSlotMeta({ auto: { seed: null, day: 720 } }).auto.seed === null
  && sanitizeSlotMeta({ auto: { seed: '', day: 720 } }).auto.seed === null
  && sanitizeSlotMeta({ auto: { seed: 5, day: null } }).auto.day === null);

check('★ withSlotMeta 也不把「种子未知」写成「种子 0」',
  withSlotMeta({}, 'auto', { seed: null, day: 720 }).auto.seed === null);

{
  const meta = withSlotMeta({}, 'auto', { seed: 7, day: 720 });
  check('withSlotMeta 写一条（返回新对象，含 savedAt）',
    meta.auto.seed === 7 && meta.auto.day === 720 && Number.isFinite(meta.auto.savedAt));
  const gone = withoutSlotMeta(meta, 'auto');
  check('withoutSlotMeta 删一条且不改入参',
    gone.auto === undefined && meta.auto !== undefined);
}

// ══ Q22 / Q25 · 存档容量与错误口径 ══════════════════════════════════
section('Q22 / Q25 · 容量预警与存档错误的人话');

check('容量口径按 UTF-16 码元（不是字节——按字节算会低估一半）',
  STORAGE_QUOTA_CHARS === 5242877 && STORAGE_WARN_CHARS === Math.floor(5242877 * 0.8),
  `${STORAGE_WARN_CHARS} / ${STORAGE_QUOTA_CHARS}`);

check('没到阈值 ⇒ 不提示（少说废话）',
  quotaWarning(0, 0) === '' && quotaWarning(STORAGE_WARN_CHARS - 1, 0) === '');

check('到 80% ⇒ 建议导出',
  quotaWarning(STORAGE_WARN_CHARS, 0).includes('导出'));

check('到硬上限 ⇒ 明确说「已满」并给出下一步',
  quotaWarning(STORAGE_QUOTA_CHARS, 0).includes('已满'));

check('本次要写入的量也算进去（不是只看现有占用）',
  quotaWarning(STORAGE_WARN_CHARS - 10, 20) !== '');

check('QuotaExceededError 的原文翻成人话（各浏览器 message 都不一样）',
  describeSaveError("Failed to execute 'setItem' on 'Storage': exceeded the quota") === '浏览器空间不足'
  && describeSaveError('The quota has been exceeded.') === '浏览器空间不足');

check('空消息 ⇒ 「未知原因」（不是空白）',
  describeSaveError('') === '未知原因' && describeSaveError(null) === '未知原因');

check('认不出来的错误原样透出（不吞掉线索）',
  describeSaveError('boom') === 'boom');

// ══ Q11 · Toast 定位 ════════════════════════════════════════════════
section('Q11 · 提示能当入口（只消费已有字段，不改事件结构）');

check('什么都没有 ⇒ null（保持普通 Toast，不可点）',
  toastLocation(null) === null && toastLocation({}) === null && toastLocation('x') === null);

check('凡间 + 坐标 ⇒ focus（镜头滑过去 + 开检视）',
  JSON.stringify(toastLocation({ x: 12, y: 34 })) === JSON.stringify({ kind: 'focus', x: 12, y: 34, entityId: null }));

check('凡间 + 坐标 + 实体 ⇒ focus 且带上实体 id',
  toastLocation({ x: 12, y: 34, entityId: 7 }).entityId === 7);

check('另一界 + 坐标 ⇒ locate（**只定位**：那个坐标在凡间是另一回事）',
  toastLocation({ plane: 'upper', x: 1, y: 2 }).kind === 'locate'
  && toastLocation({ plane: 'nether', x: 1, y: 2 }).kind === 'locate');

check('另一界但没坐标 ⇒ null（不指错地方）',
  toastLocation({ plane: 'upper' }) === null);

check('只有实体 id ⇒ entity',
  toastLocation({ entityId: 42 }).kind === 'entity');

check('不改入参（读它不等于改它）',
  (() => { const t = { x: 1, y: 2, entityId: 3, plane: 'mortal' }; const before = JSON.stringify(t); toastLocation(t); return JSON.stringify(t) === before; })());

check('提示尾巴说清楚会去哪（不写含糊的「点击查看」）',
  toastHint({ kind: 'focus' }) === '（点此前往）'
  && toastHint({ kind: 'entity' }) === '（点此找到他）'
  && toastHint({ kind: 'locate' }) === '（点此定位）'
  && toastHint(null) === '');

// ══ Q21 · 未保存变化的 dirty 判定 ═══════════════════════════════════
section('Q21 · 未保存变化（纯 UI 标志，不进 World）');

check('改了世界的行为 ⇒ dirty',
  dirtyAfterEvent(false, 'advance') === true
  && dirtyAfterEvent(false, 'intervention') === true
  && dirtyAfterEvent(false, 'terrain') === true
  && dirtyAfterEvent(false, 'undo') === true
  && dirtyAfterEvent(false, 'newWorld') === true);

check('**关视界 / 切工具这类纯界面动作 ⇒ 不 dirty**（否则会凭空拦住玩家）',
  dirtyAfterEvent(false, 'viewToggle') === false
  && dirtyAfterEvent(false, 'viewClose') === false
  && dirtyAfterEvent(false, 'toolChange') === false
  && dirtyAfterEvent(false, 'fold') === false
  && !DIRTY_EVENTS.some((e) => /view|tool|fold|prefs/i.test(e)));

check('已经 dirty 时再发生无关事件 ⇒ 保持 dirty（不会把标志洗掉）',
  dirtyAfterEvent(true, 'viewToggle') === true);

check('存档 / 导出 ⇒ 清 dirty（都给了玩家一份可恢复的副本）',
  dirtyAfterPersist('save') === false && dirtyAfterPersist('export') === false);

check('无关事件 ⇒ null（「与我无关」，调用方保持原值而不是当成 false）',
  dirtyAfterPersist('other') === null);

check('只有 dirty 时才拦一句',
  needsDiscardConfirm(true) === true && needsDiscardConfirm(false) === false);

// ── Q21 的**接线**（结构断言，比上面的纯逻辑断言更要紧）────────────────
// 上面几条只验「判定函数算得对不对」。真正会坏的是**没人调用它**：
// QOL_PASS1 初版里 `applyTool()`——玩家雕刻地形 / 施放神力的**唯一入口**——
// 压根没置 dirty（`markDirty` 只在 `newWorld` 与 `undo` 里各响一次）。
// 后果是「存档 → 雕了半天 → 点重新开天」**静默丢掉全部改动**：
// `needsDiscardConfirm()` 恒为 false，确认条根本不出现。
// 而当时所有纯逻辑断言**全绿**——判定函数一点问题都没有。
// 所以这里钉死「谁必须调用它」。
const mainSrc = stripComments(findFile('main.js').src);
const railSrc = stripComments(findFile('ui/railPanels.js').src);
const applyToolBody = bodyOf(mainSrc, 'applyTool');

check('★ main.js 的 applyTool() 必须置 dirty（玩家雕刻 / 施放神力 = 改世界）',
  /this\.qol\.markDirty\s*\(/.test(applyToolBody),
  applyToolBody
    ? `applyTool() 体 ${applyToolBody.length} 字符 · 置脏 ${/this\.qol\.markDirty\s*\(/.test(applyToolBody) ? '有' : '无'}`
    : '找不到 applyTool()（函数被改名了？）');

check('★ applyTool 用的两个事件名都在 DIRTY_EVENTS 白名单里',
  /['"]terrain['"]/.test(applyToolBody)
  && /['"]intervention['"]/.test(applyToolBody)
  && DIRTY_EVENTS.includes('terrain') && DIRTY_EVENTS.includes('intervention'),
  `terrain=${DIRTY_EVENTS.includes('terrain')} intervention=${DIRTY_EVENTS.includes('intervention')}`);

const g1HostSrc = stripComments(findFile('g1/sandboxRuntime.js').src);
const g1CardSrc = stripComments(findFile('ui/g1/presentation/characterCardView.js').src);
check('★ 人物卡记挂经 G1 命令入口置 dirty（world.watch 随存档保存）',
  railSrc.includes('createCharacterCardView(panel') && railSrc.includes('state.action?.(action)')
  && g1CardSrc.includes('type === "watch" && permissions.canWatch === true) onAction(')
  && g1HostSrc.includes("action.type === 'watch'")
  && /markDirty\s*\(\s*['"]watch['"]/.test(g1HostSrc) && DIRTY_EVENTS.includes('watch'),
  DIRTY_EVENTS.includes('watch') ? '已接线' : 'watch 不在 DIRTY_EVENTS 里');

// 反查：源码里**字面量发出**的事件名，每一个都必须在白名单里。
// 拼错一个词（比如 'terrian'）就等于静默不生效——而且不报错，
// 正是本项目最怕的那一类。
const emitted = [
  ...[...mainSrc.matchAll(/\.markDirty\s*\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)].map((m) => m[1]),
  ...[...railSrc.matchAll(/\.markDirty\s*\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)].map((m) => m[1]),
];
const unknownEvents = [...new Set(emitted)].filter((e) => !DIRTY_EVENTS.includes(e));
check('★ 字面量发出的事件名没有一个是白名单外的（拼错 = 静默失效）',
  emitted.length >= 3 && unknownEvents.length === 0,
  unknownEvents.length
    ? `白名单外：${JSON.stringify(unknownEvents)}`
    : `发出 ${JSON.stringify([...new Set(emitted)])}`);

// ── Q7 的**接线**：撤销栈变了，按钮就必须跟着变 ─────────────────────
// 同一个病：`syncUndoState()` 写好了、也在 `undo()` 里调了，但**入栈那一刻**
// 没人调。拖拽笔刷的 `markDirty` 跑在 `history.end()` **之前**，那时栈还空着，
// 于是按钮被锁成「没有可撤销的操作」，而且一直锁到下一次存档。
// 判据：`this.history.end(` 之后一小段里必须出现 `this.qol.syncUndoState()`。
const historyEndAt = mainSrc.indexOf('this.history.end(');
const historyEndTail = historyEndAt < 0 ? '' : mainSrc.slice(historyEndAt, historyEndAt + 700);
check('★ main.js 在 history.end() 之后要同步撤销按钮（否则画完一笔按钮还是灰的）',
  historyEndAt >= 0 && historyEndTail.includes('this.qol.syncUndoState()'),
  historyEndAt < 0 ? '找不到 this.history.end(' : '入栈点之后 700 字符内有同步 ✓');

// ══ Q30 · 收起全部 ══════════════════════════════════════════════════
section('Q30 · 收起全部（核心区不折）');

check('CORE_SECTION_TITLES 只有「世界」',
  CORE_SECTION_TITLES.length === 1 && CORE_SECTION_TITLES[0] === '世界');

{
  const map = collapseAllMap(['世界', '势力', '大事记', '编年']);
  check('一次收起：世界保持展开，其余全折',
    map['世界'] === false && map['势力'] === true && map['大事记'] === true && map['编年'] === true);
  check('坏输入不抛（空 / 非数组）',
    JSON.stringify(collapseAllMap(null)) === '{}' && JSON.stringify(collapseAllMap([])) === '{}');
}

// ══ Q6 / Q5 / Q42 · 状态文案与阈值 ══════════════════════════════════
section('Q6 / Q5 / Q42 · 状态文案与拖动阈值');

check('暂停与档位是同一句话的两个形态',
  speedStatusText(null, true) === '岁月已停' && speedStatusText({ label: '疾' }, false) === '岁月 · 疾');

check('档位缺失时兜底成「常」（不出现「岁月 · undefined」）',
  speedStatusText(null, false) === '岁月 · 常');

check('有笔刷的工具报半径',
  toolStateText({ name: '抬山', mode: 'drag' }, 4) === '抬山 · 4'
  && toolStateText({ name: '撒人', mode: 'click' }, 6) === '撒人 · 6');

check('划选 / 点选类工具**不报半径**（写「视界 · 4」是谎话）',
  toolStateText({ name: '视界', mode: 'select' }, 4) === '视界');

check('没有工具 ⇒ 空串（不是「undefined · 4」）',
  toolStateText(null, 4) === '');

check('阈值复用**已有**的 VIEW_CLICK_PX = 6，不另立 magic number',
  VIEW_CLICK_PX === 6 && isClickWithinDrag(5, VIEW_CLICK_PX) === true
  && isClickWithinDrag(6, VIEW_CLICK_PX) === false,
  `VIEW_CLICK_PX=${VIEW_CLICK_PX}`);

check('坏位移 ⇒ 不当作点击（宁可判成拖动）',
  isClickWithinDrag(NaN, 6) === false && isClickWithinDrag(1, NaN) === false);

// ══ Q29 · UI 偏好白名单 ═════════════════════════════════════════════
section('Q29 · UI 偏好（只装界面习惯，**绝不装世界**）');

check('两个键名固定（新键唯一写入口，旧键只读迁移）',
  UI_PREFS_KEY === 'inkbox-ui-prefs-v1' && LEGACY_SECTION_KEY === 'inkbox.sec');

check('白名单只有 collapsed / helpSeen / folds 三个字段',
  UI_PREFS_FIELDS.join(',') === 'collapsed,helpSeen,folds', UI_PREFS_FIELDS.join(','));

check('defaultUiPrefs 每次给新对象（改它不污染默认值）',
  (() => { const a = defaultUiPrefs(); const b = defaultUiPrefs(); a.collapsed.x = true; return b.collapsed.x === undefined; })());

{
  const dirty = JSON.stringify({
    collapsed: { 势力: true, 坏值: 'yes' },
    selection: { path: [[1, 2]] },
    world: { seed: 1 },
    realmView: { x: 0 },
    folds: { chronicle: true, nope: 3 },
    helpSeen: 'yes',
  });
  const safe = sanitizeUiPrefs(dirty);
  const keys = Object.keys(safe).sort().join(',');
  check('★ 白名单之外的一律丢掉（selection / world / realmView 进不了偏好）',
    keys === 'collapsed,folds,helpSeen'
    && safe.selection === undefined && safe.world === undefined && safe.realmView === undefined,
    keys);
  check('只收 boolean 值（"yes" / 3 这类坏值丢掉）',
    safe.collapsed['势力'] === true && safe.collapsed['坏值'] === undefined
    && safe.folds.chronicle === true && safe.folds.nope === undefined);
  check('helpSeen 只认严格 true（"yes" 不算看过）',
    safe.helpSeen === false);
}

check('坏 JSON / null / 数组 / 字符串 ⇒ 回默认，绝不抛（偏好坏了不该让沙盒打不开）',
  JSON.stringify(sanitizeUiPrefs('{不是 json')) === JSON.stringify(defaultUiPrefs())
  && JSON.stringify(sanitizeUiPrefs(null)) === JSON.stringify(defaultUiPrefs())
  && JSON.stringify(sanitizeUiPrefs([1, 2])) === JSON.stringify(defaultUiPrefs())
  && JSON.stringify(sanitizeUiPrefs(42)) === JSON.stringify(defaultUiPrefs()));

check('序列化只写白名单字段、键序固定（同一份偏好永远同一串）',
  serializeUiPrefs({ collapsed: { a: true }, helpSeen: true, folds: {} })
  === '{"collapsed":{"a":true},"helpSeen":true,"folds":{}}');

check('withSectionCollapsed / withFoldExpanded 返回新对象，不改入参',
  (() => {
    const p = defaultUiPrefs();
    const c = withSectionCollapsed(p, '势力', true);
    const f = withFoldExpanded(p, '编年', true);
    return p.collapsed['势力'] === undefined && c.collapsed['势力'] === true
      && p.folds['编年'] === undefined && f.folds['编年'] === true;
  })());

check('withHelpSeen 只在严格 true 时置位',
  withHelpSeen(defaultUiPrefs(), true).helpSeen === true
  && withHelpSeen(defaultUiPrefs(), 'yes').helpSeen === false);

{
  const fresh = migrateLegacySections('{"势力":true,"编年":false}', null);
  check('旧键 inkbox.sec → 新键：布尔折叠状态搬得过来',
    fresh.collapsed['势力'] === true && fresh.collapsed['编年'] === false);

  const existing = sanitizeUiPrefs({ collapsed: { 势力: false } });
  const merged = migrateLegacySections('{"势力":true}', existing);
  check('★ 迁移**不覆盖**新键里已有的选择（玩家后来的动作优先）',
    merged.collapsed['势力'] === false);

  check('旧键坏 / 空 ⇒ 原样返回，不抛',
    JSON.stringify(migrateLegacySections('{坏', null)) === JSON.stringify(defaultUiPrefs())
    && JSON.stringify(migrateLegacySections(null, null)) === JSON.stringify(defaultUiPrefs()));
}

// ══ 模拟纯度门禁 ════════════════════════════════════════════════════
section('模拟纯度门禁 · UI 够不到模拟（结构性，不是纪律）');

{
  const qs = findFile('ui/qolState.js');
  check('ui/qolState.js **零 import**（它连 World 长什么样都不知道）',
    !/^\s*import\s/m.test(qs.src), 'import 命中 ' + (qs.src.match(/^\s*import\s/gm) || []).length);

  check('ui/qolState.js 不碰 DOM（无 document / window）',
    !/\bdocument\b/.test(qs.src) && !/\bwindow\b/.test(qs.src));

  check('ui/qolState.js 零 RNG（无 rng( / Math.random）',
    !/\brng\s*\(/.test(qs.src) && !/Math\.random/.test(qs.src));
}

{
  // ① 模拟侧够不到 UI：`sim/**` / `world/**` 一个都不 import QoL 的 UI 模块。
  const simFiles = TREE.filter((f) => /^(sim|world|core)\//.test(f.rel));
  const offenders = simFiles.filter((f) => /ui\/(qol|qolState|railPanels)\.js/.test(f.src));
  check('★ sim/** · world/** · core/** 没有一个文件 import UI 的 QoL 模块',
    offenders.length === 0,
    offenders.map((f) => f.rel).join(', ') || `${simFiles.length} 个文件全部干净`);

  // ② UI 侧不改世界：QoL 的两个 DOM 模块通篇没有 `world.<x> =`。
  for (const rel of ['ui/qol.js', 'ui/railPanels.js']) {
    const src = findFile(rel).src;
    const writes = src.match(/\bworld\s*\.\s*\w+\s*(?:=[^=]|\+=|-=)/g) || [];
    check(`${rel} 通篇没有 world.<x> = 赋值（读事实可以，改不行）`,
      writes.length === 0, writes.join(' ') || '0 处');
  }
}

{
  // ③ `main.js` 只跟 `ui/qol.js` 说话 —— 它**不** import `ui/qolState.js`。
  //
  // ⚠️ 这一条是**踩了坑才补上的**：主程序里写一个裸的 `slotLabel(slot)`
  //    在语法检查里完全合法（`node --check` 绿）、在 node 测试里也看不见
  //    （`main.js` 依赖 DOM，import 不进来），只在**玩家点「存档」那一刻**
  //    抛 `ReferenceError` —— 而那条路径正好被 QoL 改写过。
  //    判据：qolState 的每个导出名，在主程序里都不许以**裸调用 / 裸取属性**
  //    出现（`this.qol.xxx(` 是允许的，那是约定的唯一入口）。
  const qs = findFile('ui/qolState.js').src;
  const exported = [...qs.matchAll(/^export\s+(?:async\s+)?(?:function|const|let)\s+([A-Za-z_$][\w$]*)/gm)]
    .map((m) => m[1]);
  const mainJs = findFile('main.js').src;
  const bare = exported.filter((name) => new RegExp(`(?<![.\\w$])${name}\\s*[.(]`).test(mainJs));
  check('★ main.js 不许**裸调** ui/qolState 的导出（必须经 `this.qol.xxx`）',
    bare.length === 0,
    bare.join(', ') || `扫了 ${exported.length} 个导出名，全部走了控制器`);
}

{
  // ③ 本轮唯一动到 sim/ 的一处：`watchNewsCount`。真跑一遍证明它只读。
  const world = generateWorld({ preset: WORLD_PRESETS.medium, seed: 20260914, scatter: true });
  const before = JSON.stringify(serializeWorld(world));
  const n1 = watchNewsCount(world);
  const n2 = watchNewsCount(world);
  const after = JSON.stringify(serializeWorld(world));
  check('★ watchNewsCount 只读：调两遍结果相同、世界 JSON 逐字不变',
    n1 === n2 && before === after, `计数 ${n1} · 快照 ${before === after ? '未变' : '被改了'}`);
  check('新世界里还没有记挂 ⇒ 未读数 0',
    n1 === 0 && typeof n1 === 'number');
  check('watchHasNews 与 watchNewsCount 同源（不是两份判据）',
    watchHasNews(world) === (watchNewsCount(world) > 0));
}

{
  const w = findFile('sim/watch.js').src;
  const bodies = (w.match(/function\s+watchEntryHasNews\s*\(/g) || []).length;
  check('sim/watch.js 里「某人有没有新消息」只有一个实现（watchEntryHasNews）',
    bodies === 1, `${bodies} 处`);
  check('sim/watch.js 不抽 RNG、不碰 DOM、不画东西（D7-E 的既有边界仍然成立）',
    !/mulberry32/.test(w) && !/render\//.test(w) && !/document\./.test(w));
}

// ══ Q20 · 持续事件必须有结局（**核查**，不是新增机制）══════════════════
// 委托书 Q20 的原话是「检查持续事件是否缺结局」。核查结论：机制是齐全的
// ——但「齐全」必须钉成断言，否则将来有人加一条新的活动事件、忘了给它终局
// 分支，玩家就会看到一场**永远在进行中**的灾祸。那不会报错，世界只是卡住。
section('Q20 · 持续事件（灾祸）的终局');
{
  const ev = findFile('sim/worldEvents.js').src;
  const stepBody = bodyOf(ev, 'stepCrises');
  const finishBody = bodyOf(ev, 'finishCrisis');
  const exits = (stepBody.match(/this\.finishCrisis\s*\(/g) || []).length;

  check('stepCrises() 的出口都收敛到 finishCrisis（聚落没了 / 期限失效 / 熬到头）',
    exits >= 3, `${exits} 个终局出口`);

  check('finishCrisis() 写状态 + endedDay + resolved，并**从 activeCrises 移除**',
    /endedDay\s*=/.test(finishBody)
    && /resolved\s*=\s*true/.test(finishBody)
    && /activeCrises\s*=\s*this\.activeCrises\.filter/.test(finishBody),
    `endedDay=${/endedDay\s*=/.test(finishBody)} resolved=${/resolved\s*=\s*true/.test(finishBody)}`);

  check('灾祸状态集是封闭的（`active` 只是其中一个，其余都算已了结）',
    ['active', 'resolved', 'failed', 'expired', 'cancelled'].every((s) => ev.includes(`'${s}'`)));
}

// ══ 收口 ════════════════════════════════════════════════════════════
console.log(`\n══════════════════════════════════════════════════════════════`);
if (failed === 0) {
  console.log(`全部通过 · ${checks} 项断言`);
  process.exit(0);
} else {
  console.log(`${failed} 项未通过 · 共 ${checks} 项断言`);
  process.exit(1);
}
