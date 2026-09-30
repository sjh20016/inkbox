#!/usr/bin/env node
// Inkbox 视界（realm view）回归 · D8-A 起
//
// ───────────────────────────────────────────────────────────────────────
// 这个文件是干什么的
// ───────────────────────────────────────────────────────────────────────
//
// D8「视界 2.0」要把「裁一块另一界地图出来看」的贴图，升级成一扇**活着的窗**
// （窗内演事件 / 跨界可看见 / 窗内可点开）。这很容易在重构中**悄悄改变旧语义**——
// 例如把「看上界」写成了「看幽冥」，或让「看」这个动作顺手消费了模拟随机流。
//
// 所以 D8-A 先立一条**基线**：把视界**今天已有的**行为钉死，再动它。
// 这一版**只钉旧行为，不加新功能**——它的价值在于证明
// 「D8 从一个稳定的 D7 快照出发，而不是一边修 D7 一边开发新功能」。
//
// ⚠️ 视界代码住在 `main.js`，而 `main.js` 依赖 DOM（`document is not defined`），
//    **node 里 import 不进来**。所以本文件用两条腿走路：
//      · **源码结构断言**（去注释后扫 `src/inkbox/**`）——钉「函数够不够得到谁」；
//      · **纯模块运行时断言**（`ui/tools.js` 的几何、`worldgen`、`save`、`rifts`）
//        ——钉「同坐标 / 不进存档 / 不转移人口 / 不抽 RNG」这些能真跑的事。
//    两者合起来才覆盖规格里那十条。
//
// ⚠️ **去注释是承重的**：本仓注释里大量出现「被禁止的字面量」（正是在解释
//    「为什么不能这么写」）。例如 `drawPlaneView` 的注释里就写着 `enterNether`
//    ——不去注释，那条「视界够不到幽冥链路」的断言会把**注释里提到它**误判成
//    「代码里调了它」，当场假红。这正是仓库里已记录的假红故障类。
//
// ───────────────────────────────────────────────────────────────────────
// 为什么单独一个脚本，不并进 smoke
// ───────────────────────────────────────────────────────────────────────
//
// ① 语义不同：smoke 是「功能冒烟」，three-realms 是「界与界的不变量」，
//    本文件是「**观察层**的契约」——「看」不许改世界。混在一起红了分不清。
// ② 规格 §D8-H 明确要求独立脚本：`scripts/inkbox-view.mjs`，不要往 350 KB 的
//    smoke 里塞。D8-H 会把它扩成 V1–V8 八组；本版（D8-A）先立 V1–V5，
//    D8-B 加 V6（模块边界），D8-D 加 V7（位面画像与地面物品）。
//    D8-F 加 V8（穿透检视）；**D8-G 暂缓**，本版另加 V9 —— 只钉追迹的**纯逻辑地基**，
//    不测追迹 UI（墨环 / 自动开视界都还没做，见委托书 §一.4）。
//
// 运行：`node scripts/inkbox-view.mjs`（退出码 0 = 全绿）
//
// ⚠️ D8-B 会把视界代码从 `main.js` 拔到 `ui/realmView.js` + `render/realmViewLayer.js`。
//    本文件的**源码断言全部走全树检索**（`findBody` 扫 `src/inkbox/**`），
//    所以那一次搬家**不该**让本文件变红——搬家改变的是位置，不是契约。
//    若搬家后本文件红了，说明搬家顺手改了语义，那正是它要拦的事。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TOOLS, TOOL_BY_ID, normalizeRegion, REGION_MIN_AREA } from '../src/inkbox/ui/tools.js';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { serializeWorld } from '../src/inkbox/io/save.js';
import { openRifts } from '../src/inkbox/sim/rifts.js';
// D8-D：视界绘制层的**位面画像**与**地面法宝 / 阴气**。该模块**零 import**、
// 顶层不碰 DOM，所以 node 能直接 import——于是这几条能做成**运行时**断言，
// 而不是只扫源码（比「注释里写着只读」硬得多）。
import {
  REALM_VIEW_PROFILE, ARTIFACT_MARK_MIN_ZOOM,
  drawGroundArtifacts, drawRealmYin,
} from '../src/inkbox/render/realmViewLayer.js';
// D8-F：视界的「穿透检视」。`ui/realmInspector.js` 只 import 纯函数、顶层不碰 DOM，
// 所以 node 能直接 import —— 于是 V8 组能写成**运行时**断言（真跑挑拣与格式化），
// 而不是只扫源码。位移阈值 `VIEW_CLICK_PX` 同理从纯模块取（唯一真源）。
import { VIEW_CLICK_PX } from '../src/inkbox/ui/realmView.js';
import { getRealmViewState } from '../src/inkbox/ui/realmViewState.js';
import {
  pickRealmSubject, realmInspectRows, REALM_INSPECT_RADIUS,
} from '../src/inkbox/ui/realmInspector.js';
// D8-G：跨界「追迹」的**纯逻辑地基**（本工程包暂缓 UI，只钉纯函数）。
//   · `sim/watch.js` 的 `netherGhostOf` / `resolveWatch` 只 import 纯函数、顶层不碰 DOM；
//   · `ui/realmTrace.js` 同理（只 import `realmLabel`）。
//   两者 node 都能直接 import ⇒ V9 组是**运行时**断言，不是只扫源码。
import { netherGhostOf, resolveWatch } from '../src/inkbox/sim/watch.js';
import { traceTargetOf, crossRealmChain } from '../src/inkbox/ui/realmTrace.js';

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

// ══ 工具：源码扫描（全树） ═══════════════════════════════════════════
//
// 与 `inkbox-three-realms.mjs` 同款 `stripComments`：保留**行号**（注释换成
// 等长空白），这样报出来的行号能直接跳。去注释的理由见文件头。
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
    if (mode === 1) {
      if (c === '\n') { mode = 0; out += c; } else { out += ' '; }
      i += 1; continue;
    }
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

const TREE = readTree(INKBOX_SRC);
const ALL_SRC = TREE.map((f) => f.src).join('\n');

/** 数一段源码里某个正则的出现次数（去注释后）。 */
function countIn(src, re) {
  const m = src.match(re);
  return m ? m.length : 0;
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

/**
 * 取 `name` 的**函数体**（含花括号）。两种写法都认：
 *   · 类方法 `  name(args) {`（缩进后直接是名字）；
 *   · 顶层函数 `function name(args) {`。
 *
 * ⚠️ 用**函数边界**而不是「全文出现过」：`rifts.js` 里当然有 `arriveUpper`，
 *    问题是**这个函数够不够得到它**。grep 全文答不了这个问题。
 * ⚠️ 配平是朴素计数：字符串 / 模板串里的花括号会计进来。本仓这些函数里的
 *    模板串 `${...}` 是成对的，所以配平正确。
 */
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

/** 全树找 `name` 的**全部**函数体（同名定义在多处时用来报警）。 */
function findAllBodies(name) {
  const hits = [];
  for (const f of TREE) {
    const body = bodyOf(f.src, name);
    if (body) hits.push({ rel: f.rel, body });
  }
  return hits;
}

/** 全树找 `name` 的函数体，返回 `{ rel, body }`（找不到 → null）。 */
function findBody(name) {
  const hits = findAllBodies(name);
  return hits.length ? hits[0] : null;
}

/** 全树找第一个匹配 `re` 的文件，返回 `{ rel, src }`（找不到 → null）。 */
function findFileWith(re) {
  for (const f of TREE) if (re.test(f.src)) return f;
  return null;
}

/**
 * 找一块 `size×size`（含边界 ⇒ 实际 `size+1` 见方）**全部可行走**的陆地块。
 *
 * ⚠️ 为什么需要它：`openRifts` 的候选格是划选区域的**周长格**（不是内部），
 *    且要求 `isWalkable`。随手写死一个坐标区域，若恰好落在海里，`opened` 就是 0
 *    ——那不是「视界坏了」，是**测试选址选到了水里**。用真实的陆地块，
 *    这条非空守卫才不会假红。
 * ⚠️ `world.isWalkable(i)` 收的是**索引** `i = y*w + x`，不是 `(x,y)`。
 */
function findLandBlock(world, size) {
  const { w, h } = world;
  for (let y = 2; y + size + 2 < h; y += 1) {
    for (let x = 2; x + size + 2 < w; x += 1) {
      let ok = true;
      for (let dy = 0; dy <= size && ok; dy += 1) {
        for (let dx = 0; dx <= size; dx += 1) {
          if (!world.isWalkable((y + dy) * w + (x + dx))) { ok = false; break; }
        }
      }
      if (ok) return { x, y, size };
    }
  }
  return null;
}

// ══ 视界契约的「真源」常量（源码） ════════════════════════════════════
//
// `VIEW_TOOL_PLANE` 是「视界工具 → 它看的那一界」的**唯一**总表
// （`ui/tools.js` 的注释点名了它：那边改了名而这边没改，视界会静默地开错缝）。
// D8-B 把它从 `main.js` 搬到了 `ui/realmView.js` —— **全树检索照样找得到**。
// 这里从源码里把它解析出来，与运行时的 `TOOLS` 对照。
const planeFile = findFileWith(/const\s+VIEW_TOOL_PLANE\s*=/);
const planeMap = {};
if (planeFile) {
  const m = /const\s+VIEW_TOOL_PLANE\s*=\s*Object\.freeze\(\s*\{([\s\S]*?)\}\s*\)/.exec(planeFile.src);
  if (m) {
    for (const e of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*'([^']+)'/g)) planeMap[e[1]] = e[2];
  }
}
const planeKeys = Object.keys(planeMap).sort();

// 视界相关的函数清单。**每一个都必须找得到**——找不到就说明有人删了/改了名，
// 而契约没跟着更新。
//
// ⚠️ D8-B 之后它们分布在三个文件里（全树检索因此是**必须**的，不是洁癖）：
//   · `main.js`                 —— 只留薄接线（`viewPlane` / `riftViewOpen`）；
//   · `ui/realmView.js`         —— 纯状态与几何（零 import）；
//   · `render/realmViewLayer.js`—— 纯绘制（不 import `sim/*`）。
const VIEW_FNS = [
  'viewPlane',        // 当前工具 → 看哪一界（接线）
  'riftViewOpen',     // 视界是否开着（裂缝冻结的判据）
  'viewPlaneForTool', // 工具 → 位面 id（**唯一**判据落点）
  'isViewTool',       // 是不是视界工具
  'planeLabel',       // 位面 id → 玩家可见界名
  'pointInRegion',    // 点在自由多边形内（窗内计数 / hit-test 同源）
  'regionContains',   // 区域命中测试（path 优先、矩形兜底）
  'ghostsInRegion',   // 窗内可见鬼魂数
  'drawRealmView',    // 窗内绘制（裁剪 + 贴另一界地形 + 人 + 宗门 + 缝）
  'drawRiftBorder',   // 视界边缘的缝
  'drawSelectHint',   // 拖拽中的虚线预览
  // D8-D 新增的两个窗内绘制：纳入这张单子 ⇒ 自动获得「名字唯一 / 不抽 RNG /
  // 够不到跨界转移链路」三条既有覆盖，不必另写一遍。
  'drawGroundArtifacts', // 地面法宝（上界 / 幽冥都画）
  'drawRealmYin',        // 幽冥阴气（只读 veg 的轻微雾墨）
];
const VIEW_BODIES = {};
for (const name of VIEW_FNS) VIEW_BODIES[name] = findBody(name);

// 跨界「转移」链路（sim 侧，会改三界状态）。视界的**观察路径**够不到它们。
// ⚠️ `commitSelection` **不在**这张单子里：它是「划开视界」这个**动作**，
//    合法副作用就是 `openRifts` 开缝。被禁的是「看」——`viewPlane` / `drawRealmView`。
const NETHER_CHAIN = [
  'fallIntoNether', 'climbOutToMortal', 'leakNetherItem',
  'possessMortal', 'hauntMortal', 'stepNetherRift', 'stepNetherItems',
  'spawnNetherGhost', 'enterNether',
];
const UPPER_CHAIN = ['arriveUpper', 'leakFromUpper', 'leakToUpper'];

// 视界实现**不许**再住回主程序（D8-B 的硬指标就是「`main.js` 只减不增」）。
// 这几个是「纯几何 / 纯绘制」，它们回到 `main.js` 就等于这次抽离被回滚了。
const MUST_LEAVE_MAIN = [
  'pointInRegion', 'regionContains', 'ghostsInRegion',
  'drawRealmView', 'drawRiftBorder', 'drawSelectHint',
];
// D7 baseline（commit `22a930e`）的 `main.js` 行数。D8 完成时不得更大。
const MAIN_JS_D7_BASELINE_LINES = 3084;

console.log('══════════════════════════════════════════════════════════════');
console.log('inkbox 视界回归（realm view）· D8 基线');
console.log('══════════════════════════════════════════════════════════════');

// ── 前置：真源与函数都在 ────────────────────────────────────────────
section('V0 · 真源与函数存在性（找不到 = 契约被悄悄改了）');
check('`VIEW_TOOL_PLANE` 在源码里找得到', !!planeFile);
check(`${VIEW_FNS.length} 个视界函数都找得到`,
  VIEW_FNS.every((n) => VIEW_BODIES[n] && VIEW_BODIES[n].body),
  VIEW_FNS.filter((n) => !(VIEW_BODIES[n] && VIEW_BODIES[n].body)).join(', '));
// ⚠️ 全树检索的前提是**名字唯一**：同名定义在两处，`findBody` 返回哪一个取决于
//    目录遍历顺序（文件系统相关）⇒ 断言会飘。这里把它钉死，顺带暴露「有人抄了一份」。
check(`${VIEW_FNS.length} 个视界函数名在树里各自唯一（全树检索不含糊）`,
  VIEW_FNS.every((n) => findAllBodies(n).length === 1),
  VIEW_FNS.filter((n) => findAllBodies(n).length !== 1)
    .map((n) => `${n}×${findAllBodies(n).length}`).join(', '));

// ══ V1 · 视界身份 ══════════════════════════════════════════════════
//
// 规格 §D8-A 头三条：viewUpper → upper · viewNether → nether · 同坐标。
// 外加「单视界」（只允许一扇窗）。
section('V1 · 视界身份（看哪一界 / 同坐标 / 单窗）');

// ① 工具表恰好两项，且映射正确。
check('VIEW_TOOL_PLANE 恰好两项：viewUpper→upper、viewNether→nether',
  planeKeys.length === 2
  && planeMap.viewUpper === 'upper'
  && planeMap.viewNether === 'nether');

// ② 运行时工具表与源码真源**同一批 id**（防「tools.js 改名、真源表没改」）。
const runtimeViewTools = TOOLS.filter((t) => t.mode === 'select').map((t) => t.id).sort();
check('运行时恰好两个 select 工具，且 id 与源码真源逐字相同',
  runtimeViewTools.length === 2
  && runtimeViewTools.join(',') === planeKeys.join(','));

// ③ `VIEW_TOOL_IDS` 从 `VIEW_TOOL_PLANE` **派生**，不是手抄的第二份字面量。
//    （两份清单必然分叉，后果是「工具能看幽冥、裂缝按上界开」——不报错。）
check('VIEW_TOOL_IDS 由 Object.keys(VIEW_TOOL_PLANE) 派生（不是手抄字面量）',
  /const\s+VIEW_TOOL_IDS\s*=\s*Object\.freeze\(\s*Object\.keys\(\s*VIEW_TOOL_PLANE\s*\)\s*\)/.test(ALL_SRC));

// ④ 「工具 → 哪一界」的唯一落点是 `viewPlaneForTool`（D8-B 抽出来的）。
const vpftBody = (VIEW_BODIES.viewPlaneForTool && VIEW_BODIES.viewPlaneForTool.body) || '';
check('viewPlaneForTool() 查 VIEW_TOOL_PLANE（唯一真源，不是第二个三目）',
  /VIEW_TOOL_PLANE\s*\[/.test(vpftBody));
check('isViewTool() 查 VIEW_TOOL_IDS（与真源同源）',
  /VIEW_TOOL_IDS\.includes\s*\(/.test((VIEW_BODIES.isViewTool && VIEW_BODIES.isViewTool.body) || ''));
check('两个界名只在 PLANE_LABEL 里出现一次（上界 / 幽冥）',
  /PLANE_LABEL\s*=\s*Object\.freeze\(\s*\{[^}]*upper:\s*'上界'[^}]*nether:\s*'幽冥'[^}]*\}/.test(ALL_SRC));

// ⑤ 位面判据经共享 RealmViewState 派生，Canvas/Three/裂缝共用。
const vpBody = (VIEW_BODIES.viewPlane && VIEW_BODIES.viewPlane.body) || '';
check('viewPlane() 经 getRealmViewState() 分流（不再自己写三目）',
  /this\.getRealmViewState\(\)\.targetPlane/.test(vpBody)
  && !/this\.toolId\s*===\s*'viewNether'/.test(vpBody));
check('viewPlane() 两界都可选（同时够得到 this.upper 与 this.nether）',
  /\bthis\.upper\b/.test(vpBody) && /\bthis\.nether\b/.test(vpBody));
check('viewPlane() 给出位面 id（D8-C 事件路由要按它分流）',
  /\bplane\b/.test(vpBody));

// ⑥ `riftViewOpen()` 读取共享判据；纯模块断言两半条件。
const rvBody = (VIEW_BODIES.riftViewOpen && VIEW_BODIES.riftViewOpen.body) || '';
check('riftViewOpen() 读取共享 RealmViewState.open',
  /this\.getRealmViewState\(\)\.open/.test(rvBody)
  && !getRealmViewState({ selection: null, toolId: 'viewUpper' }).open
  && !getRealmViewState({ selection: { x0: 0, y0: 0, x1: 2, y1: 2 }, toolId: 'raise' }).open
  && getRealmViewState({ selection: { x0: 0, y0: 0, x1: 2, y1: 2 }, toolId: 'viewUpper' }).open);
const stableSelection = { path: [[0, 0], [2, 0], [2, 2]], x0: 0, y0: 0, x1: 2, y1: 2, area: 2 };
const stableRegion = getRealmViewState({ selection: stableSelection, toolId: 'viewUpper' }).region;
check('同一未变选区保留 RegionMask 身份（3D 不每帧重建）',
  getRealmViewState({ selection: stableSelection, toolId: 'viewUpper' }).region === stableRegion);
stableSelection.path[1][0] = 3;
check('原地修改 path 后刷新 RegionMask',
  getRealmViewState({ selection: stableSelection, toolId: 'viewUpper' }).region !== stableRegion);

// ⑦ 同坐标：三界同尺寸（坐标一一对应，地形语义独立）。
{
  const seed = 20260927;
  const w = generateWorld({ preset: WORLD_PRESETS.medium, seed, scatter: false });
  const u = generateUpperWorld({ preset: WORLD_PRESETS.medium, seed: w.seed });
  const n = generateNetherWorld({ preset: WORLD_PRESETS.medium, seed: w.seed });
  check('三界同尺寸（凡间 / 上界 / 幽冥坐标一一对应）',
    w.w === u.w && w.h === u.h && w.w === n.w && w.h === n.h,
    `${w.w}×${w.h}`);

  // ⑧ 单视界：`selection` 是**单值**，不是数组 / 列表。
  //    （多窗会把裁剪、交互、事件路由、裂缝冻结、性能复杂度一次翻倍——D8 明确不做。）
  check('selection 是单值：全树无 `selection.push` / `selection[...]` 数组用法',
    countIn(ALL_SRC, /\bselection\.push\s*\(/) === 0
    && countIn(ALL_SRC, /\bselection\s*\[/) === 0);

  // ⑨ 渲染路径只有一个视界绘制入口（一扇窗）。
  //    ⚠️ 判据走**全树计数**而不是「取 render() 的函数体」：树里有**两个** `render(`
  //    （`main.js` 的 `render(now)` 与 `render/terrainLayer.js` 的 `render(time,force)`），
  //    取第一个会随目录遍历顺序飘。全树计数既更稳，也正好表达「只有一处窗」。
  //    ⚠️ 定义那一处是 `export function drawRealmView(`，要减掉，否则数到 2。
  const realmDrawCalls = countIn(ALL_SRC, /drawRealmView\s*\(/g)
    - countIn(ALL_SRC, /function\s+drawRealmView\s*\(/g);
  check('全树只有一处 drawRealmView 调用（单窗）', realmDrawCalls === 1, `${realmDrawCalls} 处`);


  // ── V2 · 视界生命周期 ────────────────────────────────────────────
  section('V2 · 视界生命周期（切走工具关闭 / 关闭后 selection 归 null）');

  const selToolBody = (findBody('selectTool') && findBody('selectTool').body) || '';
  check('selectTool() 在**换了工具**时清空 selection（关闭路径①）',
    /id\s*!==\s*this\.toolId/.test(selToolBody)
    && countIn(selToolBody, /this\.selection\s*=\s*null/g) >= 1);

  const commitBody = (findBody('commitSelection') && findBody('commitSelection').body) || '';
  check('commitSelection() 退化划选时清空 selection（关闭路径②）',
    countIn(commitBody, /this\.selection\s*=\s*null/g) >= 1);
  check('commitSelection() 提交时把 selection 设为**单个**区域对象',
    /this\.selection\s*=\s*r\b/.test(commitBody));

  // ── V3 · 视界与存档 ──────────────────────────────────────────────
  section('V3 · 视界与存档（UI 状态，不进存档）');

  const saveFile = findFileWith(/export\s+function\s+serializeWorld/);
  check('io/save.js 通篇不提 selection（视界不落档）',
    !!saveFile && countIn(saveFile.src, /\bselection\b/) === 0);

  const blob = JSON.stringify(serializeWorld(w));
  check('serializeWorld() 产物里没有 selection 键', !blob.includes('"selection"'));

  // ── V4 · 视界边界隔离（不越界去够另一界的转移链路） ────────────────
  section('V4 · 视界边界隔离（观察路径够不到跨界转移链路）');

  const netherRe = new RegExp(`\\b(${NETHER_CHAIN.join('|')})\\b`);
  const upperRe = new RegExp(`\\b(${UPPER_CHAIN.join('|')})\\b`);
  const offendersNether = [];
  const offendersUpper = [];
  for (const name of VIEW_FNS) {
    const body = (VIEW_BODIES[name] && VIEW_BODIES[name].body) || '';
    if (netherRe.test(body)) offendersNether.push(name);
    if (upperRe.test(body)) offendersUpper.push(name);
  }
  check('看路径够不到幽冥转移链路（fallIntoNether / climbOutToMortal / …）',
    offendersNether.length === 0,
    offendersNether.length ? `越界：${offendersNether.join(', ')}` : '');
  check('看路径够不到上界转移链路（arriveUpper / leakFromUpper / leakToUpper）',
    offendersUpper.length === 0,
    offendersUpper.length ? `越界：${offendersUpper.join(', ')}` : '');

  // 运行时隔离：划开视界的**副作用只有开缝**，不转移人口。
  {
    const w2 = generateWorld({ preset: WORLD_PRESETS.medium, seed: 424242, scatter: true });
    w2.upper = generateUpperWorld({ preset: WORLD_PRESETS.medium, seed: w2.seed });
    w2.nether = generateNetherWorld({ preset: WORLD_PRESETS.medium, seed: w2.seed });
    const mBefore = w2.entities.length;
    const uBefore = w2.upper.entities.length;
    const nBefore = w2.nether.entities.length;

    // 选一块真实陆地：`openRifts` 的候选格是区域**周长格**且要可行走，
    // 落在海里的区域会 `no-site`（不是 bug，是选址选错了）。见 findLandBlock。
    const landU = findLandBlock(w2, 5);
    check('世界里存在一块 5×5 可行走陆地（非空守卫）', !!landU);
    const lu = landU || { x: 20, y: 20, size: 5 };
    const regionU = normalizeRegion(
      [[lu.x, lu.y], [lu.x + lu.size, lu.y], [lu.x + lu.size, lu.y + lu.size], [lu.x, lu.y + lu.size]],
      w2, 0.4,
    );
    const rU = openRifts(w2, regionU, 'upper');
    check('划上界视界在边缘开出裂缝（非空守卫：opened > 0）', (rU.opened || 0) > 0,
      `opened=${rU.opened} reason=${rU.reason || '-'}`);
    check('划上界视界不改变凡间人口', w2.entities.length === mBefore);
    check('划上界视界不改变上界人口', w2.upper.entities.length === uBefore);
    check('划上界视界不改变幽冥人口', w2.nether.entities.length === nBefore);

    // 幽冥视界另选一块陆地（避免与上界缝重叠）。它要求周长格**同时**满足
    // `isWalkable` 且 `netherWalkable`（幽冥河带），所以不强制 opened > 0。
    let landN = null;
    for (let y = 2; y + 7 < w2.h && !landN; y += 1) {
      for (let x = 2; x + 7 < w2.w; x += 1) {
        let ok = true;
        for (let dy = 0; dy <= 5 && ok; dy += 1) {
          for (let dx = 0; dx <= 5; dx += 1) {
            if (!w2.isWalkable((y + dy) * w2.w + (x + dx))) { ok = false; break; }
          }
        }
        if (ok && (Math.abs(x - lu.x) > 20 || Math.abs(y - lu.y) > 20)) { landN = { x, y, size: 5 }; break; }
      }
    }
    const ln = landN || { x: lu.x + 40, y: lu.y + 40, size: 5 };
    const regionN = normalizeRegion(
      [[ln.x, ln.y], [ln.x + ln.size, ln.y], [ln.x + ln.size, ln.y + ln.size], [ln.x, ln.y + ln.size]],
      w2, 0.4,
    );
    const riftsBefore = w2.rifts.length;
    const rN = openRifts(w2, regionN, 'nether');
    check('划幽冥视界不改变凡间 / 上界 / 幽冥人口',
      w2.entities.length === mBefore
      && w2.upper.entities.length === uBefore
      && w2.nether.entities.length === nBefore);
    check('划幽冥视界同样只增加裂缝（rifts.length 不减）', w2.rifts.length >= riftsBefore,
      `opened=${rN.opened} reason=${rN.reason || '-'}`);
  }

  // ── V5 · 视界纯度（不写世界 / 不抽模拟 RNG） ──────────────────────
  section('V5 · 视界纯度（观察不写世界、不抽模拟 RNG）');

  // 源码：看路径里没有任何随机源。
  const rngRe = /\brng\b|\bmulberry32\b|\bMath\.random\b/;
  const rngOffenders = VIEW_FNS.filter((name) => {
    const body = (VIEW_BODIES[name] && VIEW_BODIES[name].body) || '';
    return rngRe.test(body);
  });
  check(`看路径 ${VIEW_FNS.length} 个函数体里没有 rng / mulberry32 / Math.random`,
    rngOffenders.length === 0,
    rngOffenders.length ? `越界：${rngOffenders.join(', ')}` : '');

  // 运行时：视界工具的 apply 是**纯**的——只读 rect、只调 commitSelection、返回 0。
  // 用一个 Proxy 记录它到底碰了 ctx 的哪些字段：多碰一个（比如 `rng`）就红。
  function probeApply(tool, rect) {
    const touched = [];
    const ctx = new Proxy(
      { rect, commitSelection: () => touched.push('commitSelection') },
      { get(t, p) { if (typeof p === 'string') touched.push(p); return t[p]; } },
    );
    return { ret: tool.apply(ctx), touched };
  }
  const rect = { x0: 1, y0: 1, x1: 9, y1: 9, path: [[1, 1], [9, 1], [9, 9], [1, 9]], area: 64, capped: false };
  const pU = probeApply(TOOL_BY_ID.viewUpper, rect);
  const pN = probeApply(TOOL_BY_ID.viewNether, rect);
  const pureOk = (p) => p.ret === 0
    && p.touched.includes('commitSelection')
    && p.touched.every((k) => k === 'rect' || k === 'commitSelection');
  check('两个视界工具的 apply 都是纯的：只读 rect、只调 commitSelection、返回 0（不碰 rng）',
    pureOk(pU) && pureOk(pN),
    `touched: [${pU.touched.join(',')}] / [${pN.touched.join(',')}]`);

  // 运行时：区域几何是确定性纯函数（同输入同输出 ⇒ 没有隐藏随机源）。
  const sq = [[10, 10], [30, 10], [30, 30], [10, 30]];
  const g1 = JSON.stringify(normalizeRegion(sq, w, 0.4));
  const g2 = JSON.stringify(normalizeRegion(sq, w, 0.4));
  check('normalizeRegion 确定性（同输入逐字同输出，不抽 RNG）', g1 === g2 && g1.length > 10);

  // 区域几何的守卫（规格 §D8-A 未列，但它是「窗」的最小合法性，顺手钉住）。
  check('REGION_MIN_AREA === 6（针尖大的窗不开）', REGION_MIN_AREA === 6);
  const okSel = normalizeRegion(sq, w, 0.4);
  check('合法四边形 → 归一化出 path / 包围盒 / 面积',
    !!okSel && okSel.path.length === 4 && okSel.x0 === 10 && okSel.x1 === 30 && okSel.area === 400);
  check('单点 / 两点 / 共线直线 → null（不构成一片山河）',
    normalizeRegion([[5, 5]], w, 0.4) === null
    && normalizeRegion([[5, 5], [9, 9]], w, 0.4) === null
    && normalizeRegion([[0, 0], [50, 0], [100, 0]], w, 0.4) === null);

  // ── V6 · 模块边界（D8-B 抽离出来的结构契约） ──────────────────────
  //
  // D8-B 把视界从 `main.js` 拔成「纯状态 / 纯绘制 / 接线」三层。这一组钉的就是
  // 那次抽离本身——一旦被回滚（有人把逻辑写回 `main.js`），这里先响。
  section('V6 · 模块边界（视界三层拆分：纯状态 / 纯绘制 / 接线）');

  const mainFile = TREE.find((f) => f.rel === 'main.js');
  const layerFile = TREE.find((f) => f.rel === 'render/realmViewLayer.js');
  const viewFile = TREE.find((f) => f.rel === 'ui/realmView.js');

  check('render/realmViewLayer.js 存在', !!layerFile);
  check('ui/realmView.js 存在', !!viewFile);

  // ① 绘制层**不 import `sim/*`**：够不到模拟，就不可能改模拟。
  //    这是「视界不许改世界」（契约 V6）的**结构性**保证，比注释硬。
  check('render/realmViewLayer.js 不 import sim/*',
    !!layerFile && countIn(layerFile.src, /from\s+['"][^'"]*\/sim\//g) === 0);

  // ② 纯状态模块**零 import**（与 `render/relationGraph.js` 同款）。
  check('ui/realmView.js 零 import（纯常量 + 纯函数）',
    !!viewFile && countIn(viewFile.src, /^\s*import\s/gm) === 0);

  // ③ 纯几何 / 纯绘制**不许住回主程序**——回去就等于这次抽离被回滚。
  const backInMain = MUST_LEAVE_MAIN.filter((n) => findAllBodies(n).some((h) => h.rel === 'main.js'));
  check('纯几何 / 纯绘制都不在 main.js（抽离没被回滚）',
    backInMain.length === 0,
    backInMain.length ? `回到 main.js：${backInMain.join(', ')}` : '');

  // ④ D8 硬指标：`main.js` 不得比 D7 baseline 更大。
  //    ⚠️ 比**行数**而不是字节：工作树是 CRLF、git 里是 LF，字节数会差 3000 多，
  //    直接比字节会得出「什么都没干就胖了 3 KB」的假结论。
  const mainLines = mainFile ? mainFile.src.split('\n').length : 0;
  check(`main.js 行数 ≤ D7 baseline ${MAIN_JS_D7_BASELINE_LINES}（D8 硬指标）`,
    mainLines > 0 && mainLines <= MAIN_JS_D7_BASELINE_LINES,
    `${mainLines} 行（D7 baseline ${MAIN_JS_D7_BASELINE_LINES}）`);
}

// ── V7 · 位面画像与地面物品（D8-D） ────────────────────────────────
//
// D8-D 让视界窗「按位面画对的东西」：上界画宗门 / 法宝，幽冥画鬼 / 幽冥物品 / 阴气。
// 这一组钉两件事：① 画像表**结构正确、只装开关、运行时改不动**；② 新增的两个
// 绘制函数**零 RNG / 只读世界 / 按缩放门控**。它们零 import、顶层不碰 DOM，
// 所以能**真跑**——这是 D8-D 最硬的一组断言（不是扫注释）。
section('V7 · 视界位面画像与地面物品（REALM_VIEW_PROFILE / drawGroundArtifacts）');

const layerFile7 = TREE.find((f) => f.rel === 'render/realmViewLayer.js');

// ① 画像表恰好覆盖「视界能看的每一个位面」——加第三界时漏补表，这里先响。
check('REALM_VIEW_PROFILE 覆盖所有视界位面（键 == VIEW_TOOL_PLANE 的位面集合）',
  Object.keys(REALM_VIEW_PROFILE).sort().join(',')
    === [...new Set(Object.values(planeMap))].sort().join(','),
  `画像 [${Object.keys(REALM_VIEW_PROFILE).join(',')}] vs 位面 [${[...new Set(Object.values(planeMap))].join(',')}]`);

// ② 两界都画「地形级 + 立在地上的」东西。
check('两界都画：缝 / 人 / 地面法宝',
  REALM_VIEW_PROFILE.upper.rifts && REALM_VIEW_PROFILE.nether.rifts
  && REALM_VIEW_PROFILE.upper.entities && REALM_VIEW_PROFILE.nether.entities
  && REALM_VIEW_PROFILE.upper.groundArtifacts && REALM_VIEW_PROFILE.nether.groundArtifacts);

// ③ 关键差异：幽冥**没有宗门**（factions 恒空），上界有。
check('幽冥不画宗门（nether.sects === false）、上界画（upper.sects === true）',
  REALM_VIEW_PROFILE.nether.sects === false && REALM_VIEW_PROFILE.upper.sects === true);

// ④ 阴气只在幽冥铺（上界的 veg 是**植被**，不是阴气）。
check('只有幽冥铺阴气（nether.yinWash === true、upper.yinWash === false）',
  REALM_VIEW_PROFILE.nether.yinWash === true && REALM_VIEW_PROFILE.upper.yinWash === false);

// ⑤ 画像表**只装开关**、不装数值——「本包不改任何生态数值」的结构性保证。
//    谁把 veg 阈值 / 概率之类塞进来（那会变成「渲染层藏生态参数」），这里当场红。
check('画像表每一项都是 boolean（不夹带任何生态数值）',
  Object.values(REALM_VIEW_PROFILE).every((p) => Object.values(p).every((v) => typeof v === 'boolean')));

// ⑥ 冻结：运行时改不动（防「偷偷 PROFILE.nether.sects = true」）。
check('画像表（含每一界）都被 Object.freeze 冻住',
  Object.isFrozen(REALM_VIEW_PROFILE)
  && Object.isFrozen(REALM_VIEW_PROFILE.upper)
  && Object.isFrozen(REALM_VIEW_PROFILE.nether));

// ⑦ 源码：`drawRealmView` 按 `plane.plane` 查画像表（不是写死两界分支）。
const drvBody = (VIEW_BODIES.drawRealmView && VIEW_BODIES.drawRealmView.body) || '';
check('drawRealmView() 按 plane.plane 查 REALM_VIEW_PROFILE',
  /REALM_VIEW_PROFILE\s*\[\s*plane\.plane\s*\]/.test(drvBody));
check('drawRealmView() 对未知位面兜底 upper（不因查不到表就整帧不画）',
  /REALM_VIEW_PROFILE\.upper/.test(drvBody));
check('drawRealmView() 按画像分流宗门 / 地面法宝 / 阴气',
  /profile\.sects/.test(drvBody) && /profile\.groundArtifacts/.test(drvBody) && /profile\.yinWash/.test(drvBody));

// ⑧ 绘制层**通篇不向 world.* 赋值**（「只读」的结构性保证，比注释硬）。
check('render/realmViewLayer.js 通篇不向 world.* 赋值（只读）',
  !!layerFile7 && countIn(layerFile7.src, /\bworld\s*\.\s*\w+\s*=/g) === 0,
  layerFile7 ? `${countIn(layerFile7.src, /\bworld\s*\.\s*\w+\s*=/g)} 处` : '');
// ⑨ 绘制层**零 import**（新增两个函数没有偷偷拉依赖进来）。
check('render/realmViewLayer.js 零 import（D8-D 仍不拉依赖）',
  !!layerFile7 && countIn(layerFile7.src, /^\s*import\s/gm) === 0);

// ── 运行时：stub ctx / cam / world 把两个新函数**真跑一遍** ───────────
function fakeCtx() {
  const ops = [];
  const grad = { addColorStop: (p, c) => ops.push(['stop', p, c]) };
  return {
    ops,
    save: () => ops.push(['save']), restore: () => ops.push(['restore']),
    beginPath: () => ops.push(['bp']), arc: (...a) => ops.push(['arc', ...a]),
    stroke: () => ops.push(['stroke']), fill: () => ops.push(['fill']),
    createRadialGradient: () => grad,
    set strokeStyle(v) { ops.push(['ss', v]); },
    set fillStyle(v) { ops.push(['fs', v]); },
    set lineWidth(v) { ops.push(['lw', v]); },
    set lineCap(v) { ops.push(['lc', v]); },
  };
}
const fakeCam = (zoom) => ({
  zoom,
  visibleRect: () => ({ x0: 0, y0: 0, x1: 999, y1: 999 }),
  tileScreen: (x, y, h) => [x, y - h],
});
function fakeWorld(n, items) {
  return {
    w: n,
    h: n,
    idx: (x, y) => y * n + x,
    height: new Float32Array(n * n),
    veg: Float32Array.from({ length: n * n }, (_, i) => ((i * 7) % n) / n),
    artifacts: items || [],
  };
}
const itemList = [
  { id: 5, tier: 3, x: 10.5, y: 12.5 },
  { id: 9, tier: 5, x: 40.5, y: 41.5 },
  { id: 1, tier: 1, x: -3, y: 2 },     // 越界格：应跳过而不是抛
  { id: 2, tier: 2, x: NaN, y: 2 },    // 非法坐标：应跳过
];

// ⑩ 放大才显：低于门限零绘制、高于门限有绘制。
const artWorld = fakeWorld(100, itemList);
const cBelow = fakeCtx();
drawGroundArtifacts(cBelow, fakeCam(ARTIFACT_MARK_MIN_ZOOM - 0.2), artWorld);
const cAbove = fakeCtx();
drawGroundArtifacts(cAbove, fakeCam(ARTIFACT_MARK_MIN_ZOOM + 1), artWorld);
check('drawGroundArtifacts：低于 ARTIFACT_MARK_MIN_ZOOM 不画、高于则画',
  cBelow.ops.length === 0 && cAbove.ops.length > 0,
  `below=${cBelow.ops.length} above=${cAbove.ops.length}`);

// ⑪ 确定性：同输入两次调用，绘制指令逐字相同（零 RNG）。
const cA = fakeCtx();
const cB = fakeCtx();
drawGroundArtifacts(cA, fakeCam(3), artWorld);
drawGroundArtifacts(cB, fakeCam(3), artWorld);
check('drawGroundArtifacts 确定性（同输入两次调用 ops 逐字相同）',
  cA.ops.length > 0 && JSON.stringify(cA.ops) === JSON.stringify(cB.ops));

// ⑫ 只读：调用前后世界（含 veg 逐位）一字未改。
const snapBefore = JSON.stringify(artWorld);
drawGroundArtifacts(fakeCtx(), fakeCam(3), artWorld);
check('drawGroundArtifacts 只读（世界 JSON 前后逐字相同）',
  JSON.stringify(artWorld) === snapBefore);

// ⑬ 空池不抛、零绘制。
const emptyWorld = fakeWorld(20, []);
const cEmpty = fakeCtx();
let threw = false;
try { drawGroundArtifacts(cEmpty, fakeCam(3), emptyWorld); } catch { threw = true; }
check('drawGroundArtifacts：空池零绘制、不抛', !threw && cEmpty.ops.length === 0);

// ⑭ 阴气：确定性 + 只读 + 荒芜（veg 全 0）不铺雾。
const yinWorld = fakeWorld(40, []);
const ySnap = JSON.stringify(yinWorld);
const y1 = fakeCtx();
const y2 = fakeCtx();
drawRealmYin(y1, fakeCam(2), yinWorld, { x0: 0, y0: 0, x1: 39, y1: 39 });
drawRealmYin(y2, fakeCam(2), yinWorld, { x0: 0, y0: 0, x1: 39, y1: 39 });
check('drawRealmYin 确定性（同输入两次 ops 逐字相同）',
  y1.ops.length > 0 && JSON.stringify(y1.ops) === JSON.stringify(y2.ops));
check('drawRealmYin 只读（世界 JSON 前后逐字相同）', JSON.stringify(yinWorld) === ySnap);
const barrenWorld = fakeWorld(40, []);
barrenWorld.veg.fill(0);
const cBarren = fakeCtx();
drawRealmYin(cBarren, fakeCam(2), barrenWorld, { x0: 0, y0: 0, x1: 39, y1: 39 });
// ⚠️ 判「没铺雾」要数**绘制指令**（arc / fill），不是 ops.length——函数无论如何
//    都会走一遍 save / restore，那两条也算 ops。
const paintOps = (ctx) => ctx.ops.filter((o) => o[0] === 'arc' || o[0] === 'fill').length;
check('drawRealmYin：veg 全 0（荒芜）不铺雾', paintOps(cBarren) === 0, `${paintOps(cBarren)} 笔`);

// ── V8 · 穿透检视（D8-F） ──────────────────────────────────────────
//
// D8-F 让玩家**点开窗里的东西**看它是什么（上界人物 / 幽冥鬼魂 / 幽冥物品），
// 而**仍然是观察**。这一组钉三件事：
//   ① 位移阈值 `VIEW_CLICK_PX` 在蓝图给的 5～7 区间（拖动 vs 短点击的判据真源）；
//   ② `ui/realmInspector.js` 的挑拣与格式化**真跑**（它零 import DOM ⇒ node 能 import）：
//      三张卡各自该有什么行、优先级（鬼在物前）、来路/前世/来源的判据；
//   ③ 结构：检视是**只读**的——不写 world、不抽 RNG、**不建 upper watch**、
//      不写 `this.selected`、**不复用** `inspectAt`。
section('V8 · 穿透检视（inspectRealmAt / pickRealmSubject）');

// ① 阈值：蓝图 §D8-F 给的是「移动 < 5～7 px」。它是唯一真源（main.js 从这里取）。
check('VIEW_CLICK_PX 在蓝图区间 [5,7] 内', VIEW_CLICK_PX >= 5 && VIEW_CLICK_PX <= 7, `${VIEW_CLICK_PX}`);
check('REALM_INSPECT_RADIUS 是正数（否则永远点不到东西）',
  Number.isFinite(REALM_INSPECT_RADIUS) && REALM_INSPECT_RADIUS > 0, `${REALM_INSPECT_RADIUS}`);

// ── 运行时：造两个位面世界，把「挑拣 + 格式化」真跑一遍 ───────────────
const fakeUpperW = () => ({
  entities: [
    { id: 1000001, name: '云中子', level: 42, age: 360 * 7, faction: 3, fromMortal: true, x: 10, y: 10 },
    { id: 1000002, name: '散人甲', level: 0, age: 360 * 30, faction: 0, x: 200, y: 200 },
  ],
  factions: [{ id: 3, name: '青云门' }],
  arrivedLog: [{
    day: 100, id: 1000001, fromKey: 'mortal:77', name: '云中子',
    level: 42, kind: 'cultivator', via: 'rift', sect: '铁剑山庄',
  }],
  artifacts: [],
});
const fakeNetherW = () => ({
  entities: [
    { id: 2000001, name: '孤魂', soulKind: 'ghost', level: 0, ghostRancor: 0, x: 10, y: 10,
      ghostOf: { ref: 'mortal:9', name: '张三', level: 5, sectName: '铁剑山庄', deathDay: 0, route: 'natural', incarnation: 1 } },
    { id: 2000002, name: '厉鬼王', soulKind: 'ghostCultivator', level: 25, ghostRancor: 88, x: 60, y: 60,
      ghostOf: { ref: 'mortal:12', name: '李四', level: 33, sectName: null, deathDay: 0, route: null, incarnation: 1 } },
  ],
  artifacts: [
    { id: 1, name: '幽都残卷', technique: { name: '冥河引', note: 'x' }, x: 10, y: 10 },
    { id: 2, name: '凡人旧剑', x: 10, y: 10 },
  ],
});
const rowKeys = (card) => card.rows.map((r) => r[0]);
const rowVal = (card, k) => { const r = card.rows.find((x) => x[0] === k); return r ? r[1] : null; };

const uw = fakeUpperW();
const nw = fakeNetherW();

// ② 挑拣：上界只挑人；幽冥先鬼后物；半径外 / 非法坐标 ⇒ null。
const upPick = pickRealmSubject(uw, 'upper', 10, 10);
check('pickRealmSubject：上界挑到人（kind=person）',
  !!upPick && upPick.kind === 'person' && upPick.subject.name === '云中子');
check('pickRealmSubject：半径外无命中 ⇒ null', pickRealmSubject(uw, 'upper', 999, 999) === null);
check('pickRealmSubject：非法坐标 / 空世界 ⇒ null（不抛）',
  pickRealmSubject(uw, 'upper', NaN, 0) === null && pickRealmSubject(null, 'upper', 0, 0) === null);

const nthPick = pickRealmSubject(nw, 'nether', 10, 10);
check('pickRealmSubject：幽冥同格有鬼有物时**先挑鬼**（活的优先）',
  !!nthPick && nthPick.kind === 'ghost' && nthPick.subject.name === '孤魂');
const onlyItemW = fakeNetherW();
onlyItemW.entities = [];
const itemPick = pickRealmSubject(onlyItemW, 'nether', 10, 10);
check('pickRealmSubject：幽冥无鬼时挑物品（kind=artifact）',
  !!itemPick && itemPick.kind === 'artifact' && itemPick.subject.name === '幽都残卷');

// ③ 上界人物卡：姓名 / 境界 / 年龄 / 仙门 / 来路 / 凡间来历 / 凡间宗门 / ★ 天道旧识。
const upCard = realmInspectRows(upPick, {
  day: 360 * 50, planeLabel: '上界', arrivedLog: uw.arrivedLog, watch: [{ key: 'mortal:77' }],
});
check('上界人物卡含 姓名/境界/年龄/仙门/来路',
  ['姓名', '境界', '年龄', '仙门', '来路'].every((k) => rowKeys(upCard).includes(k)),
  rowKeys(upCard).join('|'));
check('上界人物卡：来路按 arrivedLog.via 说「经裂隙而来」', rowVal(upCard, '来路') === '经裂隙而来');
check('上界人物卡：有 fromKey 时显示「凡间来历」', rowVal(upCard, '凡间来历') === 'mortal:77');
check('上界人物卡：记挂对象飞升而来 ⇒ 显示 ★ 天道旧识', rowVal(upCard, '旧识') === '★ 天道旧识');

// ⚠️ ★ 天道旧识 是**只显示**：绝不顺手建一条 upper watch（蓝图 §D8-F 明令）。
const watchArr = [{ key: 'mortal:999' }];
const watchSnap = JSON.stringify(watchArr);
const upCardNoStar = realmInspectRows(upPick, {
  day: 360 * 50, planeLabel: '上界', arrivedLog: uw.arrivedLog, watch: watchArr,
});
check('非记挂对象 ⇒ 不显示 ★ 天道旧识', !rowKeys(upCardNoStar).includes('旧识'));
check('检视**不新建** upper watch（watch 数组前后逐字相同）', JSON.stringify(watchArr) === watchSnap);

// ④ 幽冥鬼魂 / 鬼修卡。
const gPick = pickRealmSubject(nw, 'nether', 10, 10);
const gCard = realmInspectRows(gPick, { day: 360 * 50, planeLabel: '幽冥' });
check('幽冥鬼魂卡含 名字/类别/积怨/滞留/前世/来路',
  ['名字', '类别', '积怨', '滞留', '前世', '来路'].every((k) => rowKeys(gCard).includes(k)),
  rowKeys(gCard).join('|'));
check('普通鬼魂：类别=普通鬼魂、来路=循魂路而来（route 非 null）',
  rowVal(gCard, '类别') === '普通鬼魂' && rowVal(gCard, '来路') === '循魂路而来');
check('鬼魂滞留年数按 ghostOf.deathDay 现算', rowVal(gCard, '滞留') === '50 年');

const gcPick = pickRealmSubject(nw, 'nether', 60, 60);
const gcCard = realmInspectRows(gcPick, { day: 360 * 50, planeLabel: '幽冥' });
check('鬼修：类别=鬼修、有「阶位」行（厉鬼）',
  rowVal(gcCard, '类别') === '鬼修' && rowVal(gcCard, '阶位') === '厉鬼');
check('鬼修：ghostOf.route === null ⇒ 来路=自裂缝跌入', rowVal(gcCard, '来路') === '自裂缝跌入');

// ⑤ 幽冥物品卡：`technique` 是「幽冥自生」的唯一标记。
const iCard = realmInspectRows(itemPick, { planeLabel: '幽冥' });
check('幽冥物品卡含 名字/携带功法/来源',
  ['名字', '携带功法', '来源'].every((k) => rowKeys(iCard).includes(k)), rowKeys(iCard).join('|'));
check('带 technique 的幽冥物品 ⇒ 来源=幽冥自生、携带功法=冥河引',
  rowVal(iCard, '来源') === '幽冥自生' && rowVal(iCard, '携带功法') === '冥河引');
const plainItem = pickRealmSubject({ artifacts: [{ id: 3, name: '凡人旧剑', x: 0, y: 0 }] }, 'nether', 0, 0);
const pCard = realmInspectRows(plainItem, { planeLabel: '幽冥' });
check('不带 technique 的物品 ⇒ 来源=自凡间跌入带来、携带功法=无',
  rowVal(pCard, '来源') === '自凡间跌入带来' && rowVal(pCard, '携带功法') === '无');

// ⑥ 空命中 ⇒ realmInspectRows 返回 null（由调用方决定怎么发声）。
check('realmInspectRows(null) === null（空卡交给调用方发声）', realmInspectRows(null, {}) === null);

// ⑦ 只读：两个函数跑完，两个世界的 JSON 逐字不变（零写、零 RNG）。
const upSnap = JSON.stringify(uw);
const nthSnap = JSON.stringify(nw);
pickRealmSubject(uw, 'upper', 10, 10);
pickRealmSubject(nw, 'nether', 10, 10);
realmInspectRows(upPick, { day: 1, planeLabel: '上界', arrivedLog: uw.arrivedLog, watch: [] });
realmInspectRows(gPick, { day: 1, planeLabel: '幽冥' });
check('检视只读：两位面世界 JSON 前后逐字相同',
  JSON.stringify(uw) === upSnap && JSON.stringify(nw) === nthSnap);

// ── 结构断言（源码）：只读 + 不复用 inspectAt + 分派顺序 ─────────────
const inspFile = TREE.find((f) => f.rel === 'ui/realmInspector.js');
check('ui/realmInspector.js 存在于源码树', !!inspFile);
check('ui/realmInspector.js 通篇不向 world.* 赋值（只读的结构性保证）',
  !!inspFile && countIn(inspFile.src, /\bworld\s*\.\s*\w+\s*=/g) === 0);
check('ui/realmInspector.js 零 RNG（无 rng( / Math.random）',
  !!inspFile && countIn(inspFile.src, /\brng\s*\(/g) === 0 && countIn(inspFile.src, /Math\.random/g) === 0);
check('ui/realmInspector.js 不 import render/* 或 main.js（不碰 DOM）',
  !!inspFile && !/from\s+'[^']*render\//.test(inspFile.src) && !/from\s+'[^']*main\.js/.test(inspFile.src));

const mainSrc = (TREE.find((f) => f.rel === 'main.js') || {}).src || '';
const inspBody = (findBody('inspectRealmAt') && findBody('inspectRealmAt').body) || '';
const planeInspBody = (findBody('inspectPlaneAt') && findBody('inspectPlaneAt').body) || '';
const clickBody = (findBody('isRealmInspectClick') && findBody('isRealmInspectClick').body) || '';
check('main.js 的 inspectRealmAt() 经按界 adapter 调用 realmInspector 两函数',
  !!inspBody && inspBody.includes('this.inspectPlaneAt(')
  && planeInspBody.includes('pickRealmSubject(') && planeInspBody.includes('realmInspectRows('));
check('inspectRealmAt() **不复用**凡间 inspectAt（函数体里没有 this.inspectAt(）',
  !!inspBody && !inspBody.includes('this.inspectAt('));
check('inspectRealmAt() **不写** this.selected（避免在凡间画出幽冥坐标的高亮环）',
  !!inspBody && !/this\.selected\s*=/.test(inspBody));
check('isRealmInspectClick() 读取共享视界判据及 RegionMask 命中',
  !!clickBody && clickBody.includes('view.open') && clickBody.includes('view.region.contains('));
check('isRealmInspectClick() 用 VIEW_CLICK_PX 当位移阈值（不写死数字）',
  !!clickBody && clickBody.includes('VIEW_CLICK_PX'));
check('endPointer 里检视分支**排在** commitSelection 之前（否则点窗会顺手关窗）',
  // ⚠️ 断言的是**调用点** `this.isRealmInspectClick(`，不是方法定义 `isRealmInspectClick() {`
  //    ——定义出现在文件更早处，拿它做 indexOf 会让这条**恒真**（假绿工厂）。
  mainSrc.includes('this.isRealmInspectClick(')
  && mainSrc.indexOf('this.isRealmInspectClick(') < mainSrc.indexOf('this.commitSelection(path)'));

// 提示语更新（玩家可见）：两个视界工具都要说清「拖动重划 / 单击查看」。
const vt = TOOLS.filter((t) => t.id === 'viewUpper' || t.id === 'viewNether');
check('两个视界工具的提示语都含「拖动重划视界 · 单击窗内事物查看」',
  vt.length === 2 && vt.every((t) => /拖动重划视界/.test(t.hint) && /单击窗内事物查看/.test(t.hint)),
  vt.map((t) => t.hint).join(' || '));

// ── V9 · 跨界追迹地基（D8-G · WIP） ────────────────────────────────
//
// D8-G「跨界追迹」在本工程包中**暂缓**（委托书 §一.4：只保存地基、不扩建）。
// 但地基里的**纯逻辑**必须钉住，免得下一次模型接手时把它当历史垃圾删掉：
//   · `sim/watch.js` 的 `netherGhostOf` —— 第二条可靠跨界引用（跌入幽冥）；
//   · `resolveWatch` 的 `nether` 分支 —— 且**必须排在 `dead` 之后**；
//   · `ui/realmTrace.js` 的 `traceTargetOf` / `crossRealmChain` —— 纯函数、零 DOM。
//
// ⚠️ 这一组**不测试追迹 UI**（墨环 / 自动开视界都还没做）——只钉「算得对、不猜、只读」。
section('V9 · 跨界追迹地基（D8-G · WIP，只钉纯逻辑）');

// ① 可靠引用：只认 `ghostOf.route === null`（自裂缝跌入）；正常成鬼（route 非 null）不算。
//    ⚠️ 判据来源是 `sim/rifts.js` 的 `fallIntoNether` 显式传 `route: null`，
//    而 `reincarnation.js` 里正常死亡的鬼 `route` 恒为 SOUL_ROUTES 五值之一（永不为 null）。
const mw = {
  w: 1, h: 1, size: 1, day: 100,
  entities: [],
  dead: [],
  watch: [{ key: 'mortal:7', name: '陆迟', lastKnownId: 7, addedDay: 0, lastReadDay: 0 }],
  upper: { entities: [], arrivedLog: [] },
  nether: {
    entities: [{
      id: 2000001, name: '陆迟', soulKind: 'ghost', level: 0, x: 30, y: 40,
      ghostOf: { ref: 'mortal:7', name: '陆迟', level: 4, deathDay: 90, route: null, incarnation: 1 },
    }],
  },
};
check('netherGhostOf：认得「跌入幽冥」的鬼（ghostOf.ref 命中且 route===null）',
  !!netherGhostOf(mw, 'mortal:7'));
check('netherGhostOf：**不认**正常死亡成鬼（route 非 null）⇒ null',
  netherGhostOf({ nether: { entities: [{ id: 1, ghostOf: { ref: 'mortal:7', route: 'natural' } }] } }, 'mortal:7') === null);
check('netherGhostOf：无 nether / 非法 key ⇒ null（不抛）',
  netherGhostOf({}, 'mortal:7') === null && netherGhostOf(mw, null) === null);

// ② resolveWatch：跌入者 ⇒ state 'nether'、label '已落幽冥'。
const netherResolved = resolveWatch(mw, mw.watch[0]);
check('resolveWatch：跌入幽冥者 ⇒ state=nether / 已落幽冥',
  netherResolved.state === 'nether' && netherResolved.label === '已落幽冥', netherResolved.label);

// ③ 顺序承重：跌入者若又进了逝者名录（`world.dead`），③(dead) 必须赢过 ④(nether)。
//    ——否则「死者成鬼」会被误报成「跌入幽冥」（蓝图 §D8-G 明令 ④ 在 ③ 之后）。
const bothW = { ...mw, dead: [{ id: 7, name: '陆迟', died: 90 }] };
check('resolveWatch：逝者名录命中优先于 nether（④ 排在 ③ 之后）',
  resolveWatch(bothW, bothW.watch[0]).state === 'dead');

// ④ traceTargetOf：上界按 upperId 取同坐标；幽冥取那只鬼；查不到就 null（不指错地方）。
const upperTarget = traceTargetOf(
  { upper: { entities: [{ id: 1000009, name: '沈秋', level: 20, x: 12, y: 34 }] } },
  { state: 'ascended', upperId: 1000009 },
);
check('traceTargetOf：上界命中 ⇒ {plane:upper, 同坐标}',
  !!upperTarget && upperTarget.plane === 'upper' && upperTarget.x === 12 && upperTarget.y === 34);
const netherTarget = traceTargetOf(mw, netherResolved);
check('traceTargetOf：幽冥命中 ⇒ {plane:nether, 同坐标}',
  !!netherTarget && netherTarget.plane === 'nether' && netherTarget.x === 30 && netherTarget.y === 40);
check('traceTargetOf：查不到坐标 / 非跨界态 ⇒ null（不指错地方）',
  traceTargetOf({ upper: { entities: [] } }, { state: 'ascended', upperId: 1 }) === null
  && traceTargetOf(mw, { state: 'alive' }) === null
  && traceTargetOf(mw, { state: 'nether', ghost: { x: NaN, y: 0 } }) === null);

// ⑤ crossRealmChain：只针对当前这个人，凡间 → 那一界；两条链各自的措辞。
const upChain = crossRealmChain(
  { upper: { entities: [{ id: 1000009, name: '沈秋', level: 20 }] } },
  { name: '沈秋' },
  { state: 'ascended', upperId: 1000009, upper: { via: 'ascend' } },
);
check('crossRealmChain：飞升链 = 凡间 →（↓ 飞升）→ 上界',
  !!upChain && upChain.lines.length === 3
  && upChain.lines[0] === '凡间：沈秋' && upChain.lines[1].includes('飞升')
  && upChain.lines[2].startsWith('上界：沈秋'));
const nthChain = crossRealmChain(mw, mw.watch[0], netherResolved);
check('crossRealmChain：跌入链 = 凡间 →（↓ 跌入裂隙）→ 幽冥 · 游魂',
  !!nthChain && nthChain.lines[0] === '凡间：陆迟'
  && nthChain.lines[1].includes('跌入裂隙') && nthChain.lines[2].startsWith('幽冥：陆迟'));
check('crossRealmChain：在世 / 不可考 ⇒ null（不硬编一条链）',
  crossRealmChain(mw, mw.watch[0], { state: 'alive' }) === null
  && crossRealmChain(mw, mw.watch[0], { state: 'unknown' }) === null);

// ⑥ 只读：跑完，凡间 / 两位面 / 记挂的 JSON 逐字不变（零写、零 RNG）。
const traceSnap = JSON.stringify(mw);
const upperSnap = JSON.stringify(mw.upper);
const netherSnap = JSON.stringify(mw.nether);
traceTargetOf(mw, netherResolved); crossRealmChain(mw, mw.watch[0], netherResolved);
netherGhostOf(mw, 'mortal:7'); resolveWatch(mw, mw.watch[0]);
check('追迹地基只读：world / upper / nether JSON 前后逐字相同',
  JSON.stringify(mw) === traceSnap && JSON.stringify(mw.upper) === upperSnap && JSON.stringify(mw.nether) === netherSnap);

// ⑦ 结构：`ui/realmTrace.js` 零 RNG、够不到模拟写入口、不碰 DOM。
const traceFile = TREE.find((f) => f.rel === 'ui/realmTrace.js');
check('ui/realmTrace.js 存在于源码树', !!traceFile);
check('ui/realmTrace.js 零 RNG（无 rng( / Math.random）',
  !!traceFile && countIn(traceFile.src, /\brng\s*\(/g) === 0 && countIn(traceFile.src, /Math\.random/g) === 0);
check('ui/realmTrace.js 不 import sim/*（引路不代替玩家开门 = 结构性）',
  !!traceFile && !/from\s+'[^']*\/sim\//.test(traceFile.src) && !/\bopenRifts\b/.test(traceFile.src));
check('ui/realmTrace.js 不 import render/* 或 main.js（不碰 DOM）',
  !!traceFile && !/from\s+'[^']*render\//.test(traceFile.src) && !/from\s+'[^']*main\.js/.test(traceFile.src));

// ⑧ WIP 保护：`main.js` 调 `maybePulseTraceTarget` 必须带 `?.`——
//    该方法**尚未实现**（委托书 §一.4 暂缓 D8-G），缺了可选调用保护就会在划选时抛错。
check('main.js 的 maybePulseTraceTarget 调用带 `?.` 保护（未实现也不许抛错）',
  /this\.maybePulseTraceTarget\s*\?\.\s*\(/.test(mainSrc));

console.log('\n══════════════════════════════════════════════════════════════');
console.log(failed === 0
  ? `全部通过 · ${checks} 项断言`
  : `${failed} 项未通过 · 共 ${checks} 项断言`);
console.log('══════════════════════════════════════════════════════════════');
process.exit(failed === 0 ? 0 : 1);
