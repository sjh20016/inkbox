#!/usr/bin/env node
// 水墨沙盒 · 三界生态不变量回归（D6-2 工程包 F）
//
// ───────────────────────────────────────────────────────────────────────
// 这个文件是干什么的
// ───────────────────────────────────────────────────────────────────────
//
// D6-2 的前五个包各自**加**了一样东西（A 文档 / B 裂隙目标位面 / C 上界空间生态 /
// D 幽冥最低生态 / E 三界生态读数）。每一个包自己的测试只保证「我加的这一样是对的」。
// 本包（F）反过来问一个问题：
//
//   **这些新东西，有没有把三界之间那些**本来就成立**的不变量弄坏？**
//
// 所以本文件**不测新功能**，只钉十组**跨包契约**（F1–F10）。它的价值在于：
// 将来任何人再动三界中的任何一处，这十组会先响。
//
// ⚠️ D6-3 起 F7/F8/F9/F10 换了「保证方式」，不是「放松了判据」：
//    D6-2 的幽冥缝靠**一行 `continue`** 在抽签前返回；D6-3 解冻它之后，那条
//    `continue` 变成**分流**（`stepNetherRift` + 自己的流 `netherRiftRngFor`）。
//    所以「上界链路不可达」的判据必须从「那一行还在不在」改成**源码结构**：
//    `stepNetherRift` / `fallIntoNether` / `climbOutToMortal` / `leakNetherItem`
//    的函数体里**够不到** `arriveUpper` / `leakFromUpper` / `leakToUpper`。
//    一行守卫可以被顺手删掉，函数边界不能。
//    · F8 = 凡人跌入幽冥（凡 → 幽 的**人**）；F9 = 鬼进入凡间（幽 → 凡 的**鬼**）；
//      F10 = 幽冥物品泄漏（两个方向的**东西** + 幽冥自生）。
//
// ───────────────────────────────────────────────────────────────────────
// 为什么单独一个脚本，不并进 smoke
// ───────────────────────────────────────────────────────────────────────
//
// ① 语义不同：smoke 是「功能冒烟」（每个系统各自能用），本文件是「不变量回归」
//    （界与界之间的规则）。混在一起，红了之后分不清是「功能坏了」还是「越界了」。
// ② 时间尺度不同：不变量要在**长时段**（300 年）下才看得出破没破，而 smoke 已经
//    13 分钟了。本文件独立跑，可以按需要单独加长，不拖慢日常冒烟。
// ③ 本文件的判据**全部可推导**（期望值写成表达式，不写手算常数），并且**每条都配
//    一条对照**——「不该动的没动」与「该动的动了」要同时成立才算数。
//
// ───────────────────────────────────────────────────────────────────────
// 纪律（与仓库其余测试同款）
// ───────────────────────────────────────────────────────────────────────
//
// · **世界推进一律走 `advanceWorld`**（唯一入口）。本文件**不**写 `w.day += N`。
// · 每条断言都要能回答「什么故障让它变红」——写不出来就说明它抓不到东西。
// · 守恒 / 求和型断言前面必须有**非空性守卫**（`0 === 0` 是空过，不是通过）。
// · 「结构不可达」类改动（F7）用**随机流位置**判，**不用**「跑 N 拍没发生」——
//   后者在「结构正确」与「运气好」下长得一模一样（假绿工厂）。
//
// 运行：`node scripts/inkbox-three-realms.mjs`（退出码 0 = 全绿）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_PRESETS, TIME, SPECIES } from '../src/inkbox/core/config.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { advanceWorld, createAdvanceState, ADVANCE_PERIODS } from '../src/inkbox/sim/advance.js';
import {
  UPPER_ID_BASE, NETHER_ID_BASE, UPPER_SEED_KEY, NETHER_SEED_KEY,
  deriveUpperSeed, deriveNetherSeed, createPlanes, upperWalkable, netherWalkable,
  arriveUpper, upperEcoStats, ensureUpperPopLog,
} from '../src/inkbox/world/planes.js';
import {
  RIFT_PERIOD_DAYS, RIFT_SEED_KEY, RIFT_BASE_RADIUS,
  openRifts, stepRifts, riftRngFor,
  // D6-3 工程包 A：幽冥缝的**独立**流 + 凡人跌入幽冥
  netherRiftRngFor, NETHRIFT_SEED_KEY, fallIntoNether,
  // D6-3 工程包 B：幽 → 凡（鬼爬入凡间）+ 它的触发概率常量
  climbOutToMortal, WRAITH_CLIMB_CHANCE_PER_PERIOD,
  // D6-3 工程包 C：幽 → 凡（**物品**漏回地上）+ 第七条独立流 + 它的触发概率常量
  leakNetherItem, netherItemRngFor, NETHERITEM_SEED_KEY, NETHER_ITEM_LEAK_CHANCE_PER_PERIOD,
  // D6-3 工程包 D：跨位面夺舍（鬼修 → 凡间活人）+ **第八条独立流** + 它的触发概率常量。
  // `TAU_GROW` 也进来：F11 的端到端要把缝的 `age` 直接设成它（刚开的缝半径 = 0）。
  netherPossessRngFor, NETHER_POSSESS_SEED_KEY, POSSESS_CHANCE_PER_PERIOD, TAU_GROW,
} from '../src/inkbox/sim/rifts.js';
import { RIFT_CROSS_MAX_LEVEL } from '../src/inkbox/core/cultivation.js';
// D6-3 工程包 D：造测试凡人的唯一正确方式（手抄字段表会漏 `fortune` ⇒ `awaken` 算 NaN）。
// ⚠️ 两个 `cultivation.js` 同名：`RIFT_CROSS_MAX_LEVEL` 在 `core/`，`initEntity` 在 `sim/`。
import { initEntity } from '../src/inkbox/sim/cultivation.js';
// D6-3 工程包 D：跨位面夺舍 / 附身的阶位分界常量（F11 用它把两种鬼修分开跑）。
import { POSSESS_TIER_MAX_LEVEL } from '../src/inkbox/sim/possession.js';
// D6-3 工程包 E：凡间法宝守恒式的读数（F12 用它核「含幽冥两向」的守恒）。
import { artifactStats } from '../src/inkbox/sim/artifacts.js';
import {
  netherGhostStats, netherEcoStats, ghostTierOf, spawnNetherGhost, NETHER_SOUL_CAP,
  DECAY_TRACE_VEG,
  // D6-3 工程包 C：幽冥物品的读数与四条流水账（自生 / 跌入 / 漏出 / 朽坏）
  netherItemStats, ensureNetherPopLog, NETHER_ITEM_PERIOD_DAYS, NETHER_ITEM_CHANCE,
  NETHER_ITEM_TIER, NETHER_ITEM_QUALITY,
} from '../src/inkbox/sim/netherLife.js';
// D6-3 工程包 B：凡间鬼影的独立容器 + 独立 tick + 独立流。
import {
  MORTALHAUNT_SEED_KEY, mortalHauntRngFor, spawnWraith, stepMortalWraiths,
  wraithStats, WRAITH_DISSOLVE_DAYS, WRAITH_CAP, WRAITH_PERIOD_DAYS,
} from '../src/inkbox/sim/wraiths.js';
import { MERCY_SEED_KEY } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { Life } from '../src/inkbox/sim/life.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { SOUL_ROUTES, SOUL_ROUTE_POSSESS } from '../src/inkbox/sim/reincarnation.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
// D8-E：跨界表现事件落在 transient 队列里（`core/runtimeEvents.js` 的 WeakMap），
// 本组用 `peekRuntimeEvents` 只读地看「成功时到底发了几条」。
import { peekRuntimeEvents } from '../src/inkbox/core/runtimeEvents.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INKBOX_SRC = path.resolve(HERE, '../src/inkbox');

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(title) {
  console.log(`\n${title}`);
}

// ══ 工具：源码扫描 ════════════════════════════════════════════════
//
// 本文件有两条**结构型**判据（F1①、F7②），它们要读源码而不是读运行时状态。
// 读源码必须先**去掉注释**——这个仓库的注释里大量出现被讨论的代码本身
// （例如 advance.js 的头注释里就写着 `w.day += 30`）。不去注释就会假红：
// 那是「注释里提到它」与「代码里真的写了它」分不清。
//
// `stripComments` 保留**行号**（注释替换成等长空白），这样报出来的行号能直接跳。
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

/** 递归枚举 `src/inkbox/**` 下的 `.js`，回调 `(相对路径, 去注释源码)`。 */
function walkSource(dir, cb) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) { walkSource(full, cb); continue; }
    if (!name.endsWith('.js')) continue;
    const rel = path.relative(INKBOX_SRC, full).replace(/\\/g, '/');
    cb(rel, stripComments(fs.readFileSync(full, 'utf8')));
  }
}

/** 数一段源码里某个正则的出现次数（去注释后）。 */
function countIn(src, re) {
  const m = src.match(re);
  return m ? m.length : 0;
}

// ══ 工具：取某个函数的**函数体**（做「函数边界」类判据）═════════════
//
// F7⑨ / F8⑤ 要问的不是「某个名字在整个文件里出现过没有」，而是
// 「**这个函数够不够得到它**」。grep 全文抓不到这件事：`rifts.js` 里
// `leakFromUpper` 当然存在，问题是 `stepNetherRift` 能不能调到它。
//
// 做法：从 `function <name>(` 起找到签名后的第一个 `{`，再**括号配平**到
// 配对的 `}`。源码已去注释（否则注释里出现的名字会假红）。
// ⚠️ 配平是朴素计数：字符串 / 模板串里的花括号会计进来。本仓这两个函数
//    里的模板串 `${...}` 是成对的，所以配平正确；将来若有人往里面塞
//    半个花括号的字面量，这条会失准——那时改成真正的词法扫描。
const RIFT_SRC = stripComments(fs.readFileSync(path.join(INKBOX_SRC, 'sim/rifts.js'), 'utf8'));
function fnBodyOf(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return '';
  const j = src.indexOf('{', i);
  if (j < 0) return '';
  let depth = 0;
  for (let k = j; k < src.length; k += 1) {
    if (src[k] === '{') depth += 1;
    else if (src[k] === '}') { depth -= 1; if (depth === 0) return src.slice(j, k + 1); }
  }
  return src.slice(j);
}

// ══ 通用世界搭建 ══════════════════════════════════════════════════

const SEED = 20260924;

/** 造一个「三界俱全」的 world（上界 / 幽冥都挂上，但**不**挂任何 life 实例）。 */
function makeThreeRealmWorld(seed = SEED) {
  const w = generateWorld({ preset: WORLD_PRESETS.medium, seed, scatter: true });
  w.upper = generateUpperWorld({ preset: WORLD_PRESETS.medium, seed: w.seed });
  w.nether = generateNetherWorld({ preset: WORLD_PRESETS.medium, seed: w.seed });
  return w;
}

/** 三界一起推进 `days` 天（步长 `step`），**只走 `advanceWorld`**。 */
function runWorld(w, days, step, opts = {}) {
  const state = opts.state || createAdvanceState();
  const fired = { upper: 0, nether: 0, rift: 0, wraith: 0, eco: 0, fire: 0 };
  let left = days;
  while (left > 0) {
    const d = Math.min(step, left);
    const r = advanceWorld(w, d, {
      life: opts.life,
      upperLife: opts.upperLife,
      rng: opts.rng,
      state,
      nether: opts.nether,
      riftActive: opts.riftActive,
      wraith: opts.wraith,
    });
    if (r) for (const k of Object.keys(fired)) if (r[k]) fired[k] += 1;
    left -= d;
  }
  return { state, fired };
}

console.log('水墨沙盒 · 三界生态不变量回归（D6-2 工程包 F · D6-3 续 F7–F10）');
console.log('='.repeat(64));

// ══════════════════════════════════════════════════════════════════
// F1 · 时间：三界共享同一条时间轴
// ══════════════════════════════════════════════════════════════════
//
// 规格：**唯一时间源是凡间 `world.day`**；上界 / 幽冥的 `day` 只是被**赋值**，
// 它们**不自己推进**。这条破了不会报错——上界会照常长出人来，只是长在一个
// 与凡间断开的时间轴上（长测里表现为「上界大事的年份与凡间对不上」）。
section('F1. 时间：三界共享同一条时间轴（唯一推进入口）');

{
  // ① 结构判据：全仓「推进游戏日」的语句只有一处。
  //    故障：有人在某个模块里自己写了 `world.day += N`（例如新加一个世界级系统
  //    时顺手推一下时间）⇒ 三界时间轴从那一刻起分叉，且**没有任何读数会立刻变红**。
  const hits = [];
  walkSource(INKBOX_SRC, (rel, src) => {
    src.split('\n').forEach((line, i) => {
      if (/\.day\s*\+=/.test(line)) hits.push(`${rel}:${i + 1} ${line.trim()}`);
    });
  });
  check('★ 全仓「游戏日 +=」只有一处，且在唯一推进入口 `advance.js`',
    hits.length === 1 && hits[0].startsWith('sim/advance.js:'),
    hits.length ? hits.join(' | ') : '零处（推进入口整个消失了）');

  // ② 三界的 `day` 恒等（跑 300 年）
  const w = makeThreeRealmWorld();
  const life = new Life(w, mulberry32(1));
  life.processPendingSpawns();
  const ul = new UpperLife(w.upper);
  runWorld(w, 300 * TIME.daysPerYear, 30, { life, upperLife: ul });
  check('三界 `day` 恒等（上界 / 幽冥被赋值，不自己推进）',
    w.upper.day === w.day && w.nether.day === w.day,
    `凡间 ${w.day} · 上界 ${w.upper.day} · 幽冥 ${w.nether.day}`);
  check('三界 `year` 都由 `day` 现算（同一个换算口径）',
    w.upper.year === Math.floor(w.day / TIME.daysPerYear)
    && w.nether.year === w.upper.year,
    `凡间 ${w.year} · 上界 ${w.upper.year} · 幽冥 ${w.nether.year}`);
}

{
  // ③ 节拍：上界 / 幽冥每 10 日一拍。
  //    ⚠️ 期望值写成**可推导表达式**（`days / ADVANCE_PERIODS.upper`），不写手算常数。
  //    ⚠️ 步长必须**恰好等于**周期：累加器是「加满就清零」（不是「减掉周期」），
  //    所以步长 30 时一次调用只跑 1 拍——用 30 去推 `30/10 = 3` 会假红。
  const w = makeThreeRealmWorld();
  const life = new Life(w, mulberry32(2));
  life.processPendingSpawns();
  const ul = new UpperLife(w.upper);
  const DAYS = 1000;
  const { fired } = runWorld(w, DAYS, ADVANCE_PERIODS.upper, { life, upperLife: ul });
  const want = DAYS / ADVANCE_PERIODS.upper;
  check('上界 / 幽冥每 10 日一拍（节拍数 = 总天数 ÷ 周期）',
    fired.upper === want && fired.nether === want,
    `上界 ${fired.upper} / 幽冥 ${fired.nether} · 应为 ${DAYS}÷${ADVANCE_PERIODS.upper}=${want}`);
}

{
  // ④ 裂缝累加器：关窗时**既不累加也不清零**（契约 C1.1）。
  //    故障：把 `if (riftActive)` 写成「关窗就 `state.rift = 0`」⇒ 玩家反复开关视界
  //    就能把裂缝永久卡在扩张期（一条不报错的坏法）。
  const w = makeThreeRealmWorld();
  const life = new Life(w, mulberry32(3));
  life.processPendingSpawns();
  const ul = new UpperLife(w.upper);
  const state = createAdvanceState();

  runWorld(w, 20, 10, { life, upperLife: ul, state, riftActive: true });
  const afterOpen1 = state.rift;
  runWorld(w, 60, 10, { life, upperLife: ul, state, riftActive: false });
  const afterClosed = state.rift;
  const firedR = runWorld(w, 10, 10, { life, upperLife: ul, state, riftActive: true });
  check('关窗期间裂缝累加器**冻结**（既不累加也不清零）',
    afterOpen1 === 20 && afterClosed === 20,
    `开窗 20 日后 ${afterOpen1} · 关窗 60 日后 ${afterClosed}`);
  check('关窗攒下的天数**不丢**：再开窗 10 日即跨过 30 日周期、恰好推 1 拍',
    firedR.fired.rift === 1,
    `开窗 20 + 关窗 60 + 开窗 10 ⇒ 累加器 ${state.rift} · 推了 ${firedR.fired.rift} 拍`);
}

// ══════════════════════════════════════════════════════════════════
// F2 · 世界身份：三界各自的 plane / seed / 尺寸
// ══════════════════════════════════════════════════════════════════
section('F2. 世界身份：plane / seed 派生 / 地图尺寸');

{
  const w = makeThreeRealmWorld();

  check('三界的 `plane` 各就各位（mortal / upper / nether）',
    w.plane === 'mortal' && w.upper.plane === 'upper' && w.nether.plane === 'nether',
    `${w.plane} / ${w.upper.plane} / ${w.nether.plane}`);

  // 派生是**异或自逆**：双重派生必须回到原值。故障：有人把派生改成 `+` 或哈希，
  // 于是「拿派生值再派生一次」不再回到凡间种子——而调用方一旦传错（传派生值），
  // 世界会**静默地**退回凡间种子，两张地图逐格相同且不报错。
  check('`deriveUpperSeed` 是异或自逆（双重派生回到原值）',
    deriveUpperSeed(deriveUpperSeed(SEED)) === SEED,
    `s=${SEED} → ${deriveUpperSeed(SEED)} → ${deriveUpperSeed(deriveUpperSeed(SEED))}`);
  check('`deriveNetherSeed` 是异或自逆（双重派生回到原值）',
    deriveNetherSeed(deriveNetherSeed(SEED)) === SEED,
    `s=${SEED} → ${deriveNetherSeed(SEED)} → ${deriveNetherSeed(deriveNetherSeed(SEED))}`);

  // 三个种子两两不同。故障：两个派生键撞了（例如都写 `^0x55505052`）⇒
  // 上界与幽冥拿到同一张地形图，且不报错。
  const seeds = [SEED, deriveUpperSeed(SEED), deriveNetherSeed(SEED)];
  check('凡间 / 上界 / 幽冥 三个种子两两不同',
    new Set(seeds).size === 3, seeds.join(' / '));
  check('派生键两两不同（UPPER_SEED_KEY ≠ NETHER_SEED_KEY）',
    UPPER_SEED_KEY !== NETHER_SEED_KEY,
    `0x${UPPER_SEED_KEY.toString(16)} vs 0x${NETHER_SEED_KEY.toString(16)}`);

  check('上界 / 幽冥的 `seed` === 各自派生（调用方一律传**凡间**种子）',
    w.upper.seed === deriveUpperSeed(w.seed) && w.nether.seed === deriveNetherSeed(w.seed),
    `凡间 ${w.seed} · 上界 ${w.upper.seed} · 幽冥 ${w.nether.seed}`);

  check('三界地图同尺寸（坐标可对应）',
    w.upper.w === w.w && w.upper.h === w.h && w.nether.w === w.w && w.nether.h === w.h,
    `${w.w}×${w.h} · 上界 ${w.upper.w}×${w.upper.h} · 幽冥 ${w.nether.w}×${w.nether.h}`);

  // 落点判据**单源**：上界用 `upperWalkable`、幽冥用 `netherWalkable`。
  // 这里顺带钉住 B 包的实测结论——**两个判据在同一张图上并不等价**
  // （云海 vs 冥河是两套地形语义），所以谁也不能顶替谁。
  // 故障：有人「统一」成同一个函数 ⇒ 落点会落进云海 / 冥河里，且不报错。
  const size = w.size;
  let diff = 0;
  let upOk = 0;
  let neOk = 0;
  for (let i = 0; i < size; i += 1) {
    const a = upperWalkable(w.upper, i);
    const b = netherWalkable(w.nether, i);
    if (a) upOk += 1;
    if (b) neOk += 1;
    if (a !== b) diff += 1;
  }
  check('上界 / 幽冥两张图**都**有可通行格（非空性守卫）',
    upOk > 0 && neOk > 0, `上界 ${upOk} 格 · 幽冥 ${neOk} 格 · 共 ${size} 格`);
  check('★ 两套落点判据**不可互相顶替**（在各自图上分叉）',
    diff > 0,
    `分叉 ${diff}/${size} 格（${(diff / size * 100).toFixed(1)}%）`);
}

// ══════════════════════════════════════════════════════════════════
// F3 · id 空间：三段两两不相交 + 跨界引用带世界限定符
// ══════════════════════════════════════════════════════════════════
//
// ⚠️ F3 与 F4 共用**同一个** 300 年世界：两次长跑换成一次（F3 要的是「飞升过
// 之后的 id 分布」，F4 要的是「300 年后的人口账」），省掉一次重复演化。
// 两条判据互不干扰（都不写这个世界的状态）。
section('F3. id 空间：三段不相交 · 不撞号 · 跨界引用带限定符');

const LONG = (() => {
  const w = makeThreeRealmWorld();
  const life = new Life(w, mulberry32(4));
  life.processPendingSpawns();
  const ul = new UpperLife(w.upper);
  runWorld(w, 300 * TIME.daysPerYear, 30, { life, upperLife: ul });
  return w;
})();

{
  const w = LONG;

  const mortalIds = w.entities.map((e) => e.id);
  const upperIds = w.upper.entities.map((e) => e.id);
  const netherIds = w.nether.entities.map((e) => e.id);

  // 非空性守卫：三段里凡间与上界必须**真的有人**，否则下面的集合判据是空真。
  check('三段都有实体（非空性守卫）',
    mortalIds.length > 0 && upperIds.length > 0,
    `凡间 ${mortalIds.length} · 上界 ${upperIds.length} · 幽冥 ${netherIds.length}`);

  check('上界实体 id 全部落在上界段（≥ UPPER_ID_BASE）',
    upperIds.every((id) => id >= UPPER_ID_BASE),
    upperIds.length ? `最小 ${Math.min(...upperIds)} · 基数 ${UPPER_ID_BASE}` : '（上界无人）');
  check('幽冥实体 id 全部落在幽冥段（≥ NETHER_ID_BASE）',
    netherIds.every((id) => id >= NETHER_ID_BASE),
    netherIds.length ? `最小 ${Math.min(...netherIds)} · 基数 ${NETHER_ID_BASE}` : '（幽冥空）');
  check('凡间实体 id 全部低于上界段（不与上界撞号）',
    mortalIds.every((id) => id < UPPER_ID_BASE),
    mortalIds.length ? `最大 ${Math.max(...mortalIds)} < ${UPPER_ID_BASE}` : '（凡间无人）');

  // 三段集合**两两不相交**（这才是「id 空间隔离」的正面判据，比逐段上下界更硬）。
  const upSet = new Set(upperIds);
  const neSet = new Set(netherIds);
  const cross = mortalIds.filter((id) => upSet.has(id) || neSet.has(id)).length
    + upperIds.filter((id) => neSet.has(id)).length;
  check('三段 id 集合两两不相交（无一个 id 出现在两界）',
    cross === 0, `交集 ${cross} 个`);

  check('三界的 `nextEntityId` 都大于本界最大 id（新人不撞号）',
    w.nextEntityId > Math.max(0, ...mortalIds)
    && w.upper.nextEntityId > Math.max(0, ...upperIds)
    && w.nether.nextEntityId > Math.max(0, ...netherIds),
    `凡间 ${w.nextEntityId} · 上界 ${w.upper.nextEntityId} · 幽冥 ${w.nether.nextEntityId}`);

  // 跨界引用：`arrivedLog` 里的来源必须带**世界限定符**（`mortal:<id>`），
  // 不是裸数字的凡间 id。故障：写回裸 id ⇒ 上界名册的 id 与上界自己的 id 同号，
  // 读的人会把它当上界实体（静默错谱）。
  const arrived = Array.isArray(w.upper.arrivedLog) ? w.upper.arrivedLog : [];
  const badFrom = arrived.filter((a) => !/^mortal:\d+$/.test(String(a.fromKey || '')));
  check('上界名册的来源一律带世界限定符（`mortal:<id>`）',
    arrived.length > 0 ? badFrom.length === 0 : true,
    arrived.length ? `${arrived.length} 条 · 不合格 ${badFrom.length} 条` : '（没人飞升过，本条空真）');

  // 飞升快照的引用型字段必须被**切断**（铁律三）。
  //
  // ⚠️ 这条**不能拿 300 年后的世界去判**——两个原因，都踩过：
  //   ① 上界实体里有**本土**人（开局播种的始祖线 + 上界本土出生），它们
  //      **本来就**有 `faction` / `clan` / `gen`（那是上界自己的仙门与始祖线）；
  //   ② 跨界者落地后，上界的**独立炼器**会给他炼出法宝 ⇒ `artifacts` 非空
  //      ——那是 300 年里长出来的，不是「没切断」。
  // 所以判据改成**直接调 `arriveUpper` 做一次落地**：在**落地那一刻**看快照，
  // 并配一条反向对照——原实体必须**没被改动**（证明是拷贝，不是原地改写）。
  {
    const wP = generateWorld({ preset: WORLD_PRESETS.small, seed: 4321, scatter: true });
    const uP = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: wP.seed });
    const probe = {
      id: 42, name: '探针甲', sp: 'human', level: 0, age: 30,
      hp: 10, maxHp: 10, lifespan: 3600, x: 1, y: 1,
      faction: 7, clan: 3, gen: 2, village: 5, parentA: 11, parentB: 12,
      mortalId: 42, artifacts: [{ id: 999 }], relations: new Map([[1, 2]]),
    };
    const copy = arriveUpper(uP, probe, wP, {});
    check('★ 跨界落地那一刻：凡间引用字段被切断（faction/clan/gen/village/parentA/parentB = 0）',
      copy.faction === 0 && copy.clan === 0 && copy.gen === 0 && copy.village === 0
      && copy.parentA === 0 && copy.parentB === 0,
      `faction=${copy.faction} clan=${copy.clan} gen=${copy.gen} village=${copy.village}`
      + ` parentA=${copy.parentA} parentB=${copy.parentB}`);
    check('★ 跨界落地那一刻：`artifacts` / `relations` 换成**新容器**（不是凡间那两个引用）',
      Array.isArray(copy.artifacts) && copy.artifacts.length === 0
      && copy.relations instanceof Map && copy.relations.size === 0
      && copy.artifacts !== probe.artifacts && copy.relations !== probe.relations,
      `artifacts ${copy.artifacts.length} 项（新容器 ${copy.artifacts !== probe.artifacts}）`
      + ` · relations ${copy.relations.size} 项（新容器 ${copy.relations !== probe.relations}）`);
    check('跨界快照不再带凡间裸 id（`mortalId` 被删，来源改走 `arrivedLog.fromKey`）',
      !('mortalId' in copy), `mortalId in copy = ${'mortalId' in copy}`);
    check('上界快照的 id 重新编号（≥ UPPER_ID_BASE），不与凡间 id 同号',
      copy.id >= UPPER_ID_BASE && copy.id !== probe.id,
      `凡间 ${probe.id} → 上界 ${copy.id}`);
    check('反向对照：**原实体**没被改动（证明走的是拷贝，不是原地改写）',
      probe.faction === 7 && probe.clan === 3 && probe.parentA === 11
      && probe.artifacts.length === 1 && probe.relations.size === 1,
      `faction=${probe.faction} clan=${probe.clan} parentA=${probe.parentA}`
      + ` artifacts=${probe.artifacts.length} relations=${probe.relations.size}`);
  }

  // `arriveUpper` 的目标必须是上界。故障：守卫被删 ⇒ 有人把凡人塞进凡间 world，
  // 表现为「凡间凭空多出一个人」，不报错。
  let threw = false;
  try { arriveUpper(w, { id: 1, name: 'x', level: 0 }, w, {}); } catch { threw = true; }
  check('`arriveUpper` 拒绝非上界目标（守卫是响的）', threw,
    threw ? '抛错 ✓' : '没抛错 —— 守卫被删了');
}

// ══════════════════════════════════════════════════════════════════
// F4 · 上界闭环：只进不出 + 不跑凡间系统
// ══════════════════════════════════════════════════════════════════
section('F4. 上界闭环：人口守恒 · 没有出口 · 不跑凡间系统');

{
  const w = LONG;
  const pop = ensureUpperPopLog(w.upper);
  const eco = upperEcoStats(w.upper);
  check('上界人口守恒：entities === seeded + arrived + born + bornMortal − died（真实 300 年）',
    eco.conserved,
    `${eco.alive} === ${pop.seeded || 0} + ${pop.arrived || 0} + ${pop.born || 0}`
    + ` + ${pop.bornMortal || 0} − ${pop.died || 0}`);

  // 上界**没有出口**。故障：将来有人给上界接上「飞升到更高一界」而没同步账本 ⇒
  // 人在上界消失但账本没记（守恒式会红，但这条**更早**响，且直接指出是「出口」）。
  const ascended = Array.isArray(w.upper.ascended) ? w.upper.ascended : [];
  check('上界**没有飞升出口**（`upper.ascended` 恒空）',
    ascended.length === 0, `ascended ${ascended.length} 条`);

  // 上界**不跑**凡间系统：这些字段在 `resetUpperSystems` 里被显式归零
  // （那是机器可读的承诺，不是注释）。故障：谁在上界误调了凡间模块 ⇒ 这里响。
  //
  // ⚠️ `dead` **不在**这份名单里：上界有**它自己的**逝者名录（上界人也会死，
  //    `UpperLife.bury` 会记一条）——那是「陨落」这条**允许运行**的系统的一部分，
  //    不是凡间系统泄漏。第一版把它列进去，红了 25 条，是判据写错。
  const forbidden = {
    villages: (w.upper.villages || []).length,
    souls: (w.upper.souls || []).length,
    rifts: (w.upper.rifts || []).length,
    wars: (w.upper.wars || []).length,
    ascended: ascended.length,
  };
  const dirty = Object.keys(forbidden).filter((k) => forbidden[k] > 0);
  check('上界不跑凡间系统（villages / souls / rifts / wars / ascended 全空）',
    dirty.length === 0,
    dirty.length ? dirty.map((k) => `${k}=${forbidden[k]}`).join(' ')
      : Object.keys(forbidden).map((k) => `${k}=0`).join(' '));

  // 上界**自己的**两本死亡账必须一致：`deadLog.total`（逝者名录）与 `popLog.died`
  // （人口账）。故障：有人在某条死亡路径上只记了一本 ⇒ 两本账从那一刻起分叉，
  // 而「人口守恒式」只看得见 `died`，「逝者名录」只看得见 `dead`，各自都自洽。
  const deadTotal = (w.upper.deadLog || {}).total || 0;
  check('上界两本死亡账一致（`deadLog.total` === `popLog.died`）',
    deadTotal === (pop.died || 0),
    `逝者名录 ${deadTotal} · 人口账 died ${pop.died || 0}`);

  // 魂路账本同样恒零（上界不跑 `enterNether`）。
  const soulLog = w.upper.soulLog || {};
  const soulSum = Object.keys(soulLog).reduce((n, k) => n + (Number(soulLog[k]) || 0), 0);
  check('上界魂路账本恒零（上界不跑 enterNether）',
    soulSum === 0, `魂路合计 ${soulSum}`);

  // 反向对照：上界实体**不带**魂路（那是凡间逝者的属性）。
  const withRoute = w.upper.entities.filter((e) => e.soulRoute !== undefined).length;
  check('上界实体不带魂路（反向对照：魂路是凡间逝者的属性）',
    withRoute === 0, `带魂路 ${withRoute} 位 / 共 ${w.upper.entities.length} 位`);

  // 上界人口在长时段里**真的动过**——否则上面那条守恒式是 12 === 12 − 0 的空过。
  check('上界人口在 300 年里真的动过（非空性守卫：不是 12 === 12 − 0 的空过）',
    (pop.born || 0) + (pop.died || 0) + (pop.arrived || 0) > 0,
    `arrived ${pop.arrived || 0} · born ${pop.born || 0} · died ${pop.died || 0}`);
}

// ══════════════════════════════════════════════════════════════════
// F5 · 幽冥闭环：守恒 · 五路 · 六级现算 · 魂池不搬家 · 零 rng
// ══════════════════════════════════════════════════════════════════
section('F5. 幽冥闭环：守恒 · 五路 · 六级现算 · 魂池不搬家 · 零 rng');

{
  // ① 守恒式（隔离世界：手工种 + **不挂 life** ⇒ 三个数可控）。
  //    隔离的理由：真实世界里 `life.step` 同时在产鬼，手工种的那批会被淹掉
  //    （既有故障类「手工注入的样本被自然产出淹掉」）。
  const w = generateWorld({ preset: WORLD_PRESETS.medium, seed: SEED, scatter: true });
  w.nether = generateNetherWorld({ preset: WORLD_PRESETS.medium, seed: w.seed });
  for (let i = 0; i < 30; i += 1) spawnNetherGhost(w.nether, { kind: 'ghost', decayYears: 10 });
  for (let i = 0; i < 5; i += 1) spawnNetherGhost(w.nether, { kind: 'ghostCultivator' });
  runWorld(w, 60 * TIME.daysPerYear, 3, { nether: true, riftActive: false });
  const eco = netherEcoStats(w.nether);
  check('幽冥守恒式（隔离世界）：现存 === 生 − 亡 − 逐',
    eco.alive === eco.born - eco.died - eco.evicted && eco.born === 35,
    `生 ${eco.born} · 亡 ${eco.died} · 逐 ${eco.evicted} · 现存 ${eco.alive}`);

  // ② 上限逐出是**独立**的第三条离开路径，不许并进「亡」。
  const w2 = generateWorld({ preset: WORLD_PRESETS.small, seed: 4242, scatter: true });
  w2.nether = generateNetherWorld({ preset: WORLD_PRESETS.small, seed: w2.seed });
  for (let i = 0; i < NETHER_SOUL_CAP + 20; i += 1) {
    spawnNetherGhost(w2.nether, { kind: 'ghost', decayYears: 100000 });
  }
  const before = netherEcoStats(w2.nether);
  runWorld(w2, ADVANCE_PERIODS.nether, ADVANCE_PERIODS.nether, { nether: true, riftActive: false });
  const after = netherEcoStats(w2.nether);
  check('★ 上限逐出只进「逐」不进「亡」（两条离开路径分得开）',
    after.evicted > before.evicted && after.died === before.died
    && after.alive === NETHER_SOUL_CAP && after.conserved,
    `逐 ${before.evicted}→${after.evicted} · 亡 ${before.died}→${after.died} · 现存 ${after.alive}`);

  // ③ 魂五路：考古定名，五键一个不少；夺舍是**第六种去向**，不在五路里。
  const routes = Object.keys(SOUL_ROUTES).map((k) => SOUL_ROUTES[k]);
  check('魂五路齐全（natural / linger / ghost / wraith / gone）',
    routes.length === 5 && routes.every((r) => typeof r === 'string'),
    routes.join(' / '));
  check('夺舍（SOUL_ROUTE_POSSESS）**不在**魂五路里（它是第六种去向）',
    !routes.includes(SOUL_ROUTE_POSSESS), `${SOUL_ROUTE_POSSESS} ∉ [${routes.join(',')}]`);

  // ④ 鬼修六级**现算**，实体上不许有阶字段（铁律二：能现算的不入档）。
  //    故障：有人为了省事把 `tier` 写进实体 ⇒ 派生量入档，改阈值时存量数据不再对应。
  const w3 = generateWorld({ preset: WORLD_PRESETS.small, seed: 77, scatter: true });
  w3.nether = generateNetherWorld({ preset: WORLD_PRESETS.small, seed: w3.seed });
  spawnNetherGhost(w3.nether, { kind: 'ghostCultivator' });
  const cult = w3.nether.entities.find((e) => e.soulKind === 'ghostCultivator');
  const tierKeys = ['tier', 'ghostTier', 'rank', 'grade', 'stage'];
  const hasTierKey = cult ? tierKeys.filter((k) => k in cult) : [];
  check('鬼修实体上**没有**阶字段（六级由 `level` 现算，不存阶）',
    cult ? hasTierKey.length === 0 : false,
    cult ? `阶字段：${hasTierKey.length ? hasTierKey.join(',') : '无'} · ghostTierOf(${cult.level})=${ghostTierOf(cult.level)}`
      : '（没造出鬼修）');
  check('`ghostTierOf` 随 level 单调不减（六级门槛是有序的）',
    ghostTierOf(0) <= ghostTierOf(10) && ghostTierOf(10) <= ghostTierOf(30)
    && ghostTierOf(30) <= ghostTierOf(70) && ghostTierOf(70) <= ghostTierOf(150)
    && ghostTierOf(150) <= ghostTierOf(300) && ghostTierOf(300) === ghostTierOf(9999),
    [0, 10, 30, 70, 150, 300, 9999].map((l) => `${l}→${ghostTierOf(l)}`).join(' '));

  // ⑤ 魂池**不搬家**：`planes.nether.souls` 是凡间魂池的**别名**（同一引用），
  //    而幽冥实例上的 `nether.souls` 是另一只空数组。
  //    故障：把别名写成拷贝 ⇒ 读档后排队等转世的神魂凭空消失（World.js:90 点名的那条）。
  const pw = generateWorld({ preset: WORLD_PRESETS.small, seed: 88, scatter: true });
  const pn = generateNetherWorld({ preset: WORLD_PRESETS.small, seed: pw.seed });
  const planes = createPlanes(pw, null, pn);
  check('★ 魂池不搬家：`planes.nether.souls` 是凡间魂池的**同一引用**（不是拷贝）',
    planes.nether.souls === pw.souls,
    `同一引用=${planes.nether.souls === pw.souls} · 池里 ${pw.souls.length} 个神魂`);
  check('幽冥**实例**上的 `souls` 与那个别名**不是**同一个数组（别名 ≠ 实例状态）',
    pn.souls !== planes.nether.souls,
    `实例 ${pn.souls.length} 项 · 别名 ${planes.nether.souls.length} 项`);

  // ⑥ 零 rng：`netherLife.js` **不 import 任何 rng 生成器**。
  //    ⚠️ 只扫 `import` 行：铁律一的注释里就有 `mulberry32` 字面量，grep 全文会假红。
  const netherSrc = fs.readFileSync(path.join(INKBOX_SRC, 'sim/netherLife.js'), 'utf8');
  const importLines = netherSrc.split('\n').filter((l) => l.trim().startsWith('import'));
  const rngImports = importLines.filter((l) => /mulberry32|Math\.random|xorshift|rng|noise/i.test(l));
  check('★ 幽冥模块**不 import 任何 rng 生成器**（零 rng 的结构保证）',
    rngImports.length === 0,
    rngImports.length ? rngImports.join(' | ') : `${importLines.length} 条 import 里没有 rng`);
}

// ══════════════════════════════════════════════════════════════════
// F6 · 存读档：三界全量进档 + 关键契约存得住
// ══════════════════════════════════════════════════════════════════
section('F6. 存读档：三界全量进档 · 目标位面 · 阴气留痕 · 人口账本');

{
  const w = makeThreeRealmWorld();
  const life = new Life(w, mulberry32(6));
  life.processPendingSpawns();
  const ul = new UpperLife(w.upper);
  runWorld(w, 60 * TIME.daysPerYear, 30, { life, upperLife: ul });

  // 造一条 nether 缝 + 一条老档（无 targetPlane）缝，验两类存读档行为。
  w.rifts = [
    {
      id: 1, x: 20, y: 20, strength: RIFT_BASE_RADIUS, openedDay: w.day,
      age: 300, closedDay: -1, leaked: 0, crossed: 0, targetPlane: 'nether',
    },
    {
      id: 2, x: 40, y: 40, strength: RIFT_BASE_RADIUS, openedDay: w.day,
      age: 300, closedDay: -1, leaked: 0, crossed: 0,
    },
  ];
  w.nextRiftId = 3;

  // 手工写一格阴气留痕（D4）：**必须是读档不重算的**，否则留痕会「内存可见、存档消失」。
  const traceIdx = 1234;
  w.nether.veg[traceIdx] = 0.5;
  const upperPopBefore = { ...ensureUpperPopLog(w.upper) };
  const arrivedLenBefore = (w.upper.arrivedLog || []).length;
  const vegBefore = w.nether.veg[traceIdx];

  const clone = deserializeWorld(serializeWorld(w));

  check('三界的 `plane` / `seed` 跨存档逐字还原',
    clone.plane === 'mortal' && clone.upper.plane === 'upper' && clone.nether.plane === 'nether'
    && clone.upper.seed === w.upper.seed && clone.nether.seed === w.nether.seed,
    `上界 ${clone.upper.seed} / 幽冥 ${clone.nether.seed}`);

  // 裂缝键集：恰好 10 个（含 `targetPlane`）。故障：有人加字段忘了同步
  // save.js 的读写两侧 ⇒ 读档后那个字段变 undefined（静默）。
  const RIFT_KEYS = ['age', 'closedDay', 'crossed', 'id', 'leaked', 'openedDay', 'strength', 'targetPlane', 'x', 'y'];
  const rift0 = (clone.rifts || [])[0];
  const riftKeys = rift0 ? Object.keys(rift0).sort() : [];
  check('裂缝键集恰好 10 个（含 `targetPlane`）',
    riftKeys.join(',') === RIFT_KEYS.join(','),
    riftKeys.length ? riftKeys.join(',') : '（读档后没有裂缝）');
  check('★ `targetPlane` 存得住（nether 缝读回来还是 nether）',
    rift0 && rift0.targetPlane === 'nether',
    rift0 ? `targetPlane=${rift0.targetPlane}` : '（无）');
  check('老档缺 `targetPlane` 的缝读回来兜底成 `upper`（诚实缺省，不被静默冻结）',
    (clone.rifts || [])[1] && clone.rifts[1].targetPlane === 'upper',
    (clone.rifts || [])[1] ? `targetPlane=${clone.rifts[1].targetPlane}` : '（无）');

  // 阴气留痕：**读档不重算**（只走 `recomputeQi`），且**存得住**。
  //
  // ⚠️ 判据**不能**写成「读回来逐位相等」：`veg` 走 `encodeQuantized`（max=1），
  //    步长 1/65535，**最大舍入误差 = 0.5/65535 ≈ 7.6e-6**。写死等号会假红
  //    （实测 0.5 → 0.5000076293945312，误差恰好就是半个步长）。
  //    真正要守的是两件事，都写成**可推导**的形式：
  //      ① 误差在量化界内（`≤ 0.5/65535`）—— 说明「没丢，只是被量化」；
  //      ② 误差**远小于一次留痕的增量**（`< DECAY_TRACE_VEG / 10`）
  //         —— 这才是承重的：若有人把 `DECAY_TRACE_VEG` 调到 1e-5 量级，
  //         留痕会被量化抹平（「内存可见、存档消失」），本条当场变红。
  const VEG_HALF_STEP = 0.5 / 65535;
  const vegErr = Math.abs(clone.nether.veg[traceIdx] - vegBefore);
  check('★ 阴气留痕（`nether.veg`）读档**不重算**：误差在量化界内',
    vegErr <= VEG_HALF_STEP * (1 + 1e-9) && vegBefore === 0.5,
    `写入 ${vegBefore} → 读回 ${clone.nether.veg[traceIdx]}`
    + `（误差 ${vegErr.toExponential(3)} ≤ 0.5/65535 = ${VEG_HALF_STEP.toExponential(3)}）`);
  check('★ 留痕的增量**远大于**量化误差（否则会被 `encodeQuantized` 抹平）',
    vegErr < DECAY_TRACE_VEG / 10,
    `量化误差 ${vegErr.toExponential(3)} < 留痕增量 ${DECAY_TRACE_VEG} ÷ 10 = ${(DECAY_TRACE_VEG / 10).toExponential(3)}`);

  // 上界人口账本七键 + 名册长度。
  const clonePop = ensureUpperPopLog(clone.upper);
  const popKeys = ['arrived', 'arrivedThunder', 'born', 'bornMortal', 'died', 'seeded', 'sucked'];
  check('上界人口账本七键齐全且逐键存得住',
    popKeys.every((k) => k in clonePop)
    && popKeys.every((k) => (clonePop[k] || 0) === (upperPopBefore[k] || 0)),
    popKeys.map((k) => `${k}:${clonePop[k] || 0}`).join(' '));
  check('上界名册（`arrivedLog`）条数存得住',
    (clone.upper.arrivedLog || []).length === arrivedLenBefore,
    `${arrivedLenBefore} → ${(clone.upper.arrivedLog || []).length}`);

  // 反向对照：改了值之后必须读得回来（否则上面那条可能是「两边都丢了」）。
  // 同样按量化界判——0.25 与 0.5 差 0.25，远大于 7.6e-6，所以这条能区分。
  clone.nether.veg[traceIdx] = 0.25;
  const clone2 = deserializeWorld(serializeWorld(clone));
  check('反向对照：改了阴气再存读，读回来的**是改后的值**（证明读侧真的读了这一栏）',
    Math.abs(clone2.nether.veg[traceIdx] - 0.25) <= VEG_HALF_STEP * (1 + 1e-9),
    `0.25 → ${clone2.nether.veg[traceIdx]}`);
}

// ══════════════════════════════════════════════════════════════════
// F7 · 裂隙目标：nether 缝**结构上**走不到上界转移
// ══════════════════════════════════════════════════════════════════
//
// 这是 D6-2 最硬的一条不变量。验收方式必须是**随机流位置**，不能是
// 「跑 N 拍没漏东西」——后者在「结构正确」与「运气好」下长得一模一样。
//
// ⚠️ **D6-3 工程包 A 之后，这条不变量本身没变，保证方式变了**：
//    D6-2 的保证是「在抽签之前 `continue`」（**一行**可以被顺手删掉的守卫）；
//    D6-3 解冻幽冥缝时把它改成了**分流**——`stepNetherRift` + 自己的流。
//    于是「不可达」改由**函数边界**保证：`stepNetherRift` / `fallIntoNether`
//    的函数体里**够不到** `arriveUpper` / `leakFromUpper` / `leakToUpper`。
//    所以本组现在有三层判据，缺一不可：
//      ① 源码结构：分流点调的是 `stepNetherRift`，且它的函数体里没有上界那三个名字；
//      ② 随机流位置：裂隙流**一次都没被抽**（对照：上界缝必须抽）；
//      ③ 独立流**真的在被消费**（否则「独立流」只是一句注释：建了流没人抽，
//         与「共用裂隙流」在行为上无法区分）。
section('F7. 裂隙目标：nether 缝走自己的通道（上界链路结构不可达）');

{
  // ① 源码结构：`targetPlane === 'nether'` 的分流点必须**排在**第一处 `rng()` 之前。
  const riftSrc = RIFT_SRC;
  const fnStart = riftSrc.indexOf('export function stepRifts');
  const fnBody = fnStart >= 0 ? riftSrc.slice(fnStart) : '';
  const netherIdx = fnBody.indexOf("targetPlane === 'nether'");
  const rngIdx = fnBody.indexOf('rng()');
  check('★ `stepRifts` 里 nether 的**分流点**排在**第一处 `rng()` 之前**（上界链路在它之后）',
    netherIdx > 0 && rngIdx > 0 && netherIdx < rngIdx,
    `nether 判定 @${netherIdx} · 首处 rng() @${rngIdx}`);

  // ② 随机流位置（**本组的核心判据**）。
  //
  //    手法：`riftRngFor(world)` 返回的是**该 world 专属**的 mulberry32 实例
  //    （存在模块级 WeakMap 里）。所以「它被抽了几次」是可以**数**出来的：
  //    拿一个同样种子、从零开始的参照流，往前推 k 次，看哪一次与它当前的下一签相同。
  //
  //    期望：**nether 缝 0 次**；对照组（上界缝）**≥ 1 次**。
  //    只有两条同时成立，才说明「判据抓得到抽签」而不仅仅是「碰巧都是 0」。
  const makeRiftWorld = (plane) => {
    const w = generateWorld({ preset: WORLD_PRESETS.small, seed: 909, scatter: true });
    w.upper = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: w.seed });
    w.rifts = [{
      id: 1, x: 12, y: 12, strength: RIFT_BASE_RADIUS, openedDay: 0,
      age: 0, closedDay: -1, leaked: 0, crossed: 0, targetPlane: plane,
    }];
    w.nextRiftId = 2;
    return w;
  };
  const drawsConsumed = (w) => {
    const rng = riftRngFor(w);            // 取实例：**不抽签**
    const next = rng();                   // 此刻的下一签（抽掉，无所谓，测试用完即弃）
    const ref = mulberry32(((w.seed || 0) ^ RIFT_SEED_KEY) >>> 0);
    for (let k = 0; k <= 40; k += 1) {
      const v = ref();
      if (v === next) return k;           // 参照流推 k 次后与它同签 ⇒ 它被抽了 k 次
    }
    return -1;                            // 对不上：说明用的不是这条流（结构变了）
  };

  const wN = makeRiftWorld('nether');
  const wU = makeRiftWorld('upper');
  stepRifts(wN);
  stepRifts(wU);
  const drawsNether = drawsConsumed(wN);
  const drawsUpper = drawsConsumed(wU);

  check('★ nether 缝跑一拍 `stepRifts`：**消费裂隙随机流 0 次**',
    drawsNether === 0, `消费 ${drawsNether} 次`);
  check('★ 对照：上界缝跑同一拍**必须**消费随机流（≥ 1 次）——否则上面那条是假绿',
    drawsUpper >= 1, `消费 ${drawsUpper} 次`);

  // ③ 冻结只针对**跨界效果**，不针对生命周期：nether 缝该老还是会老。
  check('nether 缝的年龄照常推进（冻结的是跨界，不是生命周期）',
    wN.rifts.length > 0 && wN.rifts[0].age === RIFT_PERIOD_DAYS,
    wN.rifts.length ? `age=${wN.rifts[0].age} · 期望 ${RIFT_PERIOD_DAYS}` : '（缝被剔除了）');

  // ④ `openRifts` 在没有幽冥位面时**如实报拒**（不返回「干干净净什么也没做」）。
  // ⚠️ 区域用**矩形**形式（`{x0,y0,x1,y1}`）——smoke 5q 用的就是这一块，
  //    它在中堂图上确实能开出缝（见下面的反向对照）。第一版用了 `path` 形式的
  //    地图角落，`reason` 是 `no-site`（候选格全不可站）——那会让这条判据
  //    **在「该拒绝」与「反正都开不出」之间分不清**，正好是它要防的事。
  const RECT = { x0: 30, y0: 20, x1: 74, y1: 64 };
  const wNoNether = generateWorld({ preset: WORLD_PRESETS.small, seed: 909, scatter: true });
  const refused = openRifts(wNoNether, RECT, 'nether');
  check('`openRifts(..., "nether")` 在无幽冥位面时如实报拒（reason=no-plane）',
    refused.refused === true && refused.reason === 'no-plane',
    JSON.stringify(refused));

  // ⑤ 反向对照：同样的区域开**上界**缝，必须真的开出缝来。
  const wUp = generateWorld({ preset: WORLD_PRESETS.small, seed: 909, scatter: true });
  wUp.upper = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: wUp.seed });
  const openedUp = openRifts(wUp, RECT, 'upper');
  check('反向对照：同一区域开上界缝**真的开出来了**（上面那条拒绝不是「反正都开不出」）',
    openedUp.opened > 0, JSON.stringify(openedUp));
  check('开出来的缝全部带 `targetPlane`（10 键一个不少）',
    wUp.rifts.length > 0 && wUp.rifts.every((r) => r.targetPlane === 'upper'
      && Object.keys(r).length === 10),
    `${wUp.rifts.length} 条 · 键数 ${wUp.rifts.length ? Object.keys(wUp.rifts[0]).length : 0}`);

  // ⑥ 同一区域开**幽冥**缝（这次幽冥位面在）——缝必须开出来，且 `targetPlane='nether'`。
  //    与 ④ 合起来才说明「拒绝」是因为**没有幽冥位面**，而不是因为区域不行。
  const wNe = generateWorld({ preset: WORLD_PRESETS.small, seed: 909, scatter: true });
  wNe.upper = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: wNe.seed });
  wNe.nether = generateNetherWorld({ preset: WORLD_PRESETS.small, seed: wNe.seed });
  const openedNe = openRifts(wNe, RECT, 'nether');
  check('★ 同一区域在**有**幽冥位面时能开出幽冥缝（`targetPlane=\'nether\'`）',
    openedNe.opened > 0 && wNe.rifts.every((r) => r.targetPlane === 'nether'),
    `${JSON.stringify(openedNe)} · 值 ${[...new Set(wNe.rifts.map((r) => r.targetPlane))].join('/')}`);

  // ── ⑦ ★ D6-3 A：幽冥缝**真的在消费自己的流** ────────────────────
  //    这是「独立流」这个设计的**唯一可验证判据**。没有它，把 `stepNetherRift`
  //    写成 `return;`（什么都不做）也能让 ② 全绿——「建了流却没人抽」与
  //    「共用裂隙流」在行为上无法区分（见「故障类：字段存在≠生效」）。
  //
  //    ⚠️ 用**同种子双世界比对**，不能用「绝对位置计数」：`openRifts` **自己**
  //    会消费裂隙流（它用 `rng` 洗牌候选站点），绝对位置里混着那一笔。
  //    这里两个世界都由 `makeRiftWorld` 手工造（**不经** `openRifts`），
  //    一个推 200 拍、一个一拍不推：两签必须不同。
  //    什么故障让它变红：`stepNetherRift` 忘了抽签（直接 `return` / 判据写反）。
  const wNa = makeRiftWorld('nether');
  const wNb = makeRiftWorld('nether');
  for (let k = 0; k < 200; k += 1) { wNa.day += RIFT_PERIOD_DAYS; stepRifts(wNa); }
  const netNextA = netherRiftRngFor(wNa)();
  const netNextB = netherRiftRngFor(wNb)();
  check('★ D6-3 A：幽冥缝推进 200 拍后**消费了自己的流**（独立流不是摆设）',
    netNextA !== netNextB, `推过 200 拍 ${netNextA} vs 一拍没推 ${netNextB}`);

  check('★ 两条流用**四个两两不同**的派生键（相同 = 共用一条流，独立流白建）',
    NETHRIFT_SEED_KEY !== RIFT_SEED_KEY
    && NETHRIFT_SEED_KEY !== UPPER_SEED_KEY && NETHRIFT_SEED_KEY !== NETHER_SEED_KEY
    && RIFT_SEED_KEY !== UPPER_SEED_KEY && RIFT_SEED_KEY !== NETHER_SEED_KEY
    && UPPER_SEED_KEY !== NETHER_SEED_KEY,
    `rift=0x${RIFT_SEED_KEY.toString(16)} · netherRift=0x${NETHRIFT_SEED_KEY.toString(16)}`
    + ` · upper=0x${UPPER_SEED_KEY.toString(16)} · nether=0x${NETHER_SEED_KEY.toString(16)}`);

  // ── ⑧ ★ D6-3 A：**两条流互不干扰** ───────────────────────────────
  //    同一世界里多一条幽冥缝，上界缝的抽签次数必须**一个字都不变**。
  //    这是本包最承重的一条：它保证「玩家多开一条幽冥视界」不会移动上界缝的
  //    随机序列（否则既有标定与长测读数全部作废，而且**不报错**）。
  //    什么故障让它变红：把 nether 缝接回 `rng`（共用裂隙流）。
  const mkUpper = (withNether) => {
    const w = makeRiftWorld('upper');
    if (withNether) {
      w.rifts.push({
        id: 2, x: 20, y: 20, strength: RIFT_BASE_RADIUS, openedDay: 0,
        age: 0, closedDay: -1, leaked: 0, crossed: 0, targetPlane: 'nether',
      });
      w.nextRiftId = 3;
    }
    return w;
  };
  const wOnlyUpper = mkUpper(false);
  const wBothPlanes = mkUpper(true);
  stepRifts(wOnlyUpper);
  stepRifts(wBothPlanes);
  const cOnlyUpper = drawsConsumed(wOnlyUpper);
  const cBothPlanes = drawsConsumed(wBothPlanes);
  check('★ 上界缝的抽签次数**不受**「同世界还有没有幽冥缝」影响（两条流互不干扰）',
    cOnlyUpper === cBothPlanes && cOnlyUpper >= 1,
    `只有上界缝 ${cOnlyUpper} 次 · 再加一条幽冥缝 ${cBothPlanes} 次`);

  // ── ⑨ ★ 源码结构：**函数边界**（D6-3 换掉那行 `continue` 之后的保证方式）──
  //    `stepNetherRift` / `fallIntoNether` 的函数体里必须**够不到**上界那三个
  //    名字。什么故障让它变红：有人为了「复用」把 `leakFromUpper` /
  //    `leakToUpper` / `arriveUpper` 塞进幽冥通道（语义错位，而且不报错——
  //    `riftLog.leaked` 照涨，看起来像「幽冥也会漏东西」）。
  const UPPER_CHAIN = ['arriveUpper', 'leakFromUpper', 'leakToUpper'];
  const netherStepBody = fnBodyOf(riftSrc, 'stepNetherRift');
  const netherFallBody = fnBodyOf(riftSrc, 'fallIntoNether');
  const chainHits = UPPER_CHAIN.filter(
    (n) => netherStepBody.includes(n) || netherFallBody.includes(n),
  );
  check('★ 源码结构：`stepNetherRift` / `fallIntoNether` 的函数体里**没有**上界那三个名字',
    netherStepBody.length > 0 && netherFallBody.length > 0 && chainHits.length === 0,
    `stepNetherRift ${netherStepBody.length} 字符 · fallIntoNether ${netherFallBody.length} 字符`
    + ` · 命中 ${chainHits.join('/') || '无'}`);
  // 对照：那三个名字**确实**被 `stepRifts` 引用——否则上一条是「全世界都没提它」的假绿。
  check('对照：`leakFromUpper` / `leakToUpper` **确实**被 `stepRifts` 引用（证明上一条有区分力）',
    fnBody.includes('leakFromUpper') && fnBody.includes('leakToUpper'),
    `leakFromUpper=${fnBody.includes('leakFromUpper')} · leakToUpper=${fnBody.includes('leakToUpper')}`);
  check('分流点调的是 `stepNetherRift`（不是上界那两个）',
    fnBody.includes('stepNetherRift('),
    `stepNetherRift( 命中=${fnBody.includes('stepNetherRift(')}`);
}

// ══════════════════════════════════════════════════════════════════
// F8 · 凡人跌入幽冥（D6-3 工程包 A）
// ══════════════════════════════════════════════════════════════════
//
// F7 判的是「幽冥缝**没有接错线**」；F8 判的是**接上的那条线干了什么**：
// 站在幽冥缝附近的凡人会被卷进幽冥，落成鬼魂。
//
// 本组的四条不变量：
//   ① **守恒**：凡间剩下的人 + 幽冥多出来的魂 === 注入的人数。
//      什么故障让它变红：先 `splice` 出凡间、再发现落不成 ⇒ 人从世界上消失
//      （这正是「先落成再移除」这个实现顺序要防的事）。
//   ② **上界口径零变化**：幽冥缝跑满一生，上界 entities / artifacts /
//      popLog.arrived 一个数都不许动（F7 的语义隔离在**行为**上的对照）。
//   ③ **高修为不进候选**：`level >= RIFT_CROSS_MAX_LEVEL` 只能走飞升。
//      判据用 `>=` 而不是 `>`（写成 `>` 会静默放过化神期）。
//   ④ **双向隔离**：上界缝跑满一生，`fellIn` 恒 0（F7 判「幽冥够不到上界」，
//      这条判「上界够不到幽冥」）。
//
// ⚠️ **隔离世界**：这里**不挂 `life`**，幽冥实体的唯一来源就是跌入——
//    否则自然产鬼会把「我送进去的那批」淹掉（故障类：手工注入的样本被自然产出淹掉）。
// ⚠️ **判据必须确定性**：种子写死 ⇒ 结果可复现；`totalFell > 0` 是**非空性守卫**
//    （否则两条守恒式会退化成 `0 === 0` 的空过）。
section('F8. 凡人跌入幽冥：守恒 · 上界零变化 · 高修为不进候选（D6-3 A）');

{
  const mkFallWorld = (seed) => {
    const w = makeThreeRealmWorld(seed);
    // **手工**一条 nether 缝：不经 `openRifts`，免得依赖地形
    // （本组判的是效果本身，不是开缝；开缝由 F7 的 ④⑤⑥ 判）。
    w.rifts = [{
      id: 1, x: 30, y: 30, strength: RIFT_BASE_RADIUS, openedDay: 0,
      age: 0, closedDay: -1, leaked: 0, crossed: 0, targetPlane: 'nether',
    }];
    w.nextRiftId = 2;
    return w;
  };
  const putPerson = (w, level) => {
    w.entities.push({
      id: 999999, sp: SPECIES.CULTIVATOR, x: 30.5, y: 30.5,
      level, hp: 10, maxHp: 10, age: 0, lifespan: 100000,
      artifacts: [], relations: new Map(), name: '守缝人',
    });
  };

  // ── ① 端到端 · 多世界长时段 ─────────────────────────────────────
  const SEEDS = [11, 23, 37, 59, 71, 97, 113, 131];
  let totalFell = 0;
  let conserveOk = true;
  let upperCleanOk = true;
  let bookkeepingOk = true;
  for (const sd of SEEDS) {
    const w = mkFallWorld(sd);
    putPerson(w, 10);
    const nBefore = w.nether.entities.length;
    const uEnt = w.upper.entities.length;
    const uArt = w.upper.artifacts.length;
    const uArr = ensureUpperPopLog(w.upper).arrived;
    // 跑满一条缝的一生（闭合点 ≈ TAU_CLOSE / RIFT_PERIOD_DAYS 拍），再留余量。
    for (let k = 0; k < 200; k += 1) { w.day += RIFT_PERIOD_DAYS; stepRifts(w); }
    const fell = w.nether.entities.length - nBefore;
    totalFell += fell;
    if (w.entities.length + fell !== 1) conserveOk = false;
    if (w.upper.entities.length !== uEnt || w.upper.artifacts.length !== uArt
      || ensureUpperPopLog(w.upper).arrived !== uArr) upperCleanOk = false;
    // 账本与实体必须对得上：`fellIn` 是 `ghostBorn` 的子计数。
    const pl = w.nether.popLog || {};
    if ((pl.fellIn || 0) !== fell || (pl.fellIn || 0) > (pl.ghostBorn || 0)) bookkeepingOk = false;
  }
  check('★ 端到端：8 个种子里确实有人跌进幽冥（下面两条守恒式的**非空性守卫**）',
    totalFell > 0, `共跌入 ${totalFell} 人 / ${SEEDS.length} 个世界`);
  check('★ 守恒：每个世界里「凡间剩下的 + 幽冥多出来的 === 1」（绝不凭空蒸发）',
    conserveOk, `${SEEDS.length} 个世界逐个核对`);
  check('★ 幽冥缝跑满一生：上界 entities / artifacts / popLog.arrived **一个数都没动**',
    upperCleanOk, `${SEEDS.length} 个世界逐个核对`);
  check('★ 账本与实体对得上：`fellIn === 跌入实体数`，且 `fellIn <= ghostBorn`（子计数）',
    bookkeepingOk, `${SEEDS.length} 个世界逐个核对`);

  // ── ② 对照：高修为（`level === 门槛`）**一个都不跌** ──────────────
  //    与 ① 同种子同跑法 ⇒ 唯一差别是 level，所以它抓的是**候选判据**本身。
  let totalFellHigh = 0;
  for (const sd of SEEDS) {
    const w = mkFallWorld(sd);
    putPerson(w, RIFT_CROSS_MAX_LEVEL);
    const nBefore = w.nether.entities.length;
    for (let k = 0; k < 200; k += 1) { w.day += RIFT_PERIOD_DAYS; stepRifts(w); }
    totalFellHigh += w.nether.entities.length - nBefore;
  }
  check('★ 对照：化神期（`level === 门槛`）**一个都不跌**（只能走飞升）',
    totalFellHigh === 0 && totalFell > 0,
    `高修为跌入 ${totalFellHigh} 人 · 同期凡人跌入 ${totalFell} 人`);

  // ── ③ 身份快照 + 存档 ───────────────────────────────────────────
  //    什么故障让它变红：把 `fellIn` 记到 `world.riftLog`（`save.js` 里**逐键
  //    显式序列化的 5 键**）里 ⇒ 读档后丢失，且 save-equiv 的键集判据会红。
  //    `nether.popLog` 是 `NETHER_ONLY_KEYS` **整对象**序列化，所以留得住。
  const wSnap = mkFallWorld(4242);
  putPerson(wSnap, 10);
  const fellDirect = fallIntoNether(wSnap, wSnap.rifts[0], RIFT_BASE_RADIUS);
  const g = wSnap.nether.entities[wSnap.nether.entities.length - 1];
  check('★ 直接调 `fallIntoNether`：落成的是**鬼修**，且带 `mortal:<id>` 身份快照',
    fellDirect === true && Boolean(g) && g.sp === SPECIES.GHOST && g.soulKind === 'ghostCultivator'
    && Boolean(g.ghostOf) && g.ghostOf.ref === 'mortal:999999',
    `ok=${fellDirect} · sp=${g && g.sp} · soulKind=${g && g.soulKind}`
    + ` · ref=${g && g.ghostOf && g.ghostOf.ref}`);
  const wBack = deserializeWorld(serializeWorld(wSnap));
  check('★ 存读档：`nether.popLog.fellIn` 与鬼修身份快照都留得住',
    (wBack.nether.popLog || {}).fellIn === 1
    && wBack.nether.entities.length === wSnap.nether.entities.length,
    `fellIn=${(wBack.nether.popLog || {}).fellIn}`
    + ` · 幽冥实体 ${wSnap.nether.entities.length}→${wBack.nether.entities.length}`);

  // ── ④ 反向对照：**上界**缝够不到幽冥 ─────────────────────────────
  const wUpOnly = mkFallWorld(4242);
  wUpOnly.rifts[0].targetPlane = 'upper';
  putPerson(wUpOnly, 10);
  const nBeforeUp = wUpOnly.nether.entities.length;
  for (let k = 0; k < 200; k += 1) { wUpOnly.day += RIFT_PERIOD_DAYS; stepRifts(wUpOnly); }
  check('★ 反向对照：**上界**缝跑满一生，`fellIn` 恒 0、幽冥实体数不变（上界够不到幽冥）',
    (wUpOnly.nether.popLog || {}).fellIn === 0
    && wUpOnly.nether.entities.length === nBeforeUp,
    `fellIn=${(wUpOnly.nether.popLog || {}).fellIn}`
    + ` · 幽冥 ${nBeforeUp}→${wUpOnly.nether.entities.length}`);

  // ── ⑤ 源码结构：`fallIntoNether` **零 rng** ──────────────────────
  //    「这一拍有没有动静」的抽签在 `stepNetherRift` 里；「选谁」不抽签
  //    （候选 = 半径内境界最高的那个，落点由 `spawnNetherGhost` 的纯哈希决定）。
  //    什么故障让它变红：有人为了「公平」在选人时加了 `nrng()`——那会让
  //    「同一种子同一天」的结果依赖**这条流之前被抽过几次**（跨世界不可复现）。
  const fallBody = fnBodyOf(RIFT_SRC, 'fallIntoNether');
  check('★ 源码结构：`fallIntoNether` **零 rng**（判定节奏才抽签，选谁不抽签）',
    fallBody.length > 0 && !/\brng\s*\(/.test(fallBody) && !fallBody.includes('Math.random'),
    `命中 ${(fallBody.match(/\brng\s*\(/g) || []).join('/') || '无'}`);
}

// ══════════════════════════════════════════════════════════════════
// F9 · 鬼进入凡间（D6-3 工程包 B）
// ══════════════════════════════════════════════════════════════════
//
// F8 判的是「凡人跌进幽冥」（凡 → 幽）；F9 判的是同一条缝的**反方向**
// （幽 → 凡）：缝口的鬼魂爬进凡间，在凡间飘荡一段日子再消散。
//
// 本组要钉的**核心判决**（这是整个 B 包存在的理由）：
//   **鬼绝不进 `world.entities`**。凡间与上界共用 `cultivation.stepEntity`，
//   它的「凡人试着觉醒」豁免名单只有 `beast` / `spirit`，`ghost` 不在其中
//   ⇒ 鬼一旦进了 `world.entities`：① 普通鬼魂被掷觉醒骰 → `awaken()` 给
//   `level=1` + 灵根 + **寿元被重算**；② 鬼修按 `world.qi[格]` 修炼 → 突破 →
//   40 级起天雷飞升 → **上界凭空多一个鬼**。两条都**不报错**并污染上界人口账。
//   所以鬼住 `world.wraiths`（独立容器），由 `stepMortalWraiths`（独立 tick）驱动。
//   「结构上够不到」比「加一行守卫」强（A 包判决：一行 `continue` 能被顺手删掉）。
//
// 六条不变量：
//   ① **守恒**：`wraiths.length + wraithLog.dissolved === nether.popLog.climbedOut`
//      （同一批鬼的两端记账，跨世界交叉核对）。什么故障让它变红：爬出时
//      `climbedOut += 1` 漏了 / 记重了，或消散没记进 `wraithLog.dissolved`。
//   ② **凡间实体零变化**：幽冥缝跑满一生，`world.entities` / 上界三口径一个数都不动。
//      （鬼爬进来**不许**混进凡人列表——这正是「结构隔离」在行为上的对照。）
//   ③ **保留幽冥身份**：爬出来的鬼 id 落在幽冥段（≥ 2_000_000），与凡间 id 不相交。
//   ④ **到期消散**：`world.day >= dissolveDay` 时消失并计入 `dissolved`（不是永生）。
//   ⑤ **存读档**：`wraiths` / `wraithLog` 逐字段留得住。
//   ⑥ **源码结构**：`wraiths.js` 的**代码**里不出现 `world.entities` / `addEntity`
//      （去注释后查——头注释里当然会讨论 `world.entities`，那是**说明**不是**引用**）。
//      什么故障让它变红：有人图省事改成 `world.addEntity(ghost)` ⇒ 鬼混进凡人列表。
//
// ⚠️ **隔离世界**：不挂 `life`——否则自然产鬼会把「我放进去的那批」淹掉
//    （故障类：手工注入的样本被自然产出淹掉）。
// ⚠️ `totalClimbed > 0` 是**非空性守卫**（否则守恒式退化成 `0 === 0` 的空过）。
section('F9. 鬼进入凡间：守恒 · 凡间实体零变化 · 独立容器（D6-3 B）');

{
  const mkClimbWorld = (seed) => {
    const w = makeThreeRealmWorld(seed);
    // 手工一条 nether 缝（同 F8 的理由：判效果本身，不依赖开缝与地形）。
    w.rifts = [{
      id: 1, x: 30, y: 30, strength: RIFT_BASE_RADIUS, openedDay: 0,
      age: 0, closedDay: -1, leaked: 0, crossed: 0, targetPlane: 'nether',
    }];
    w.nextRiftId = 2;
    return w;
  };
  // 往缝口放 n 只鬼魂（不挂 life ⇒ 它们是幽冥实体的**唯一**来源）。
  const putGhosts = (w, n, at = { x: 30.5, y: 30.5 }) => {
    for (let i = 0; i < n; i += 1) {
      spawnNetherGhost(w.nether, { kind: 'ghost', decayYears: 100000 });
      const g = w.nether.entities[w.nether.entities.length - 1];
      g.x = at.x; g.y = at.y;
    }
  };

  // ── ① 端到端 · 多世界长时段 ─────────────────────────────────────
  const SEEDS = [11, 23, 37, 59, 71, 97, 113, 131];
  let totalClimbed = 0;
  let conserveOk = true;
  let mortalCleanOk = true;
  let upperCleanOk = true;
  for (const sd of SEEDS) {
    const w = mkClimbWorld(sd);
    putGhosts(w, 6);
    const mEnt = w.entities.length;
    const uEnt = w.upper.entities.length;
    const uArt = w.upper.artifacts.length;
    const uArr = ensureUpperPopLog(w.upper).arrived;
    // 跑满一条缝的一生（200 拍 ≈ 6000 日，远长于 WRAITH_DISSOLVE_DAYS = 1080），
    // 再让凡间侧的鬼影 tick 把消散跑掉。两件事都要跑，守恒式才是有内容的。
    const state = createAdvanceState();
    for (let k = 0; k < 200; k += 1) {
      w.day += RIFT_PERIOD_DAYS;
      stepRifts(w);
      // 每拍后跑一次凡间鬼影 tick（与真实游戏同频：`advanceWorld` 里 `wraith` 周期 10 日）。
      stepMortalWraiths(w, RIFT_PERIOD_DAYS);
    }
    const climbed = (w.nether.popLog || {}).climbedOut || 0;
    totalClimbed += climbed;
    // 守恒：此刻在凡间飘的 + 已经消散的 === 幽冥记的「爬出去」。
    if (wraithStats(w).total !== climbed) conserveOk = false;
    // 凡间实体列表**一个数都不许动**（鬼没混进去）。
    if (w.entities.length !== mEnt) mortalCleanOk = false;
    if (w.upper.entities.length !== uEnt || w.upper.artifacts.length !== uArt
      || ensureUpperPopLog(w.upper).arrived !== uArr) upperCleanOk = false;
  }
  check('★ 端到端：8 个种子里确实有鬼爬进凡间（下面两条守恒式的**非空性守卫**）',
    totalClimbed > 0, `共爬出 ${totalClimbed} 只 / ${SEEDS.length} 个世界`);
  check('★ 守恒：`此刻在凡间 + 已消散 === 幽冥记的爬出数`（同一批鬼的两端记账）',
    conserveOk, `${SEEDS.length} 个世界逐个核对`);
  check('★ 凡间 `world.entities` **一个数都没动**（鬼没混进凡人列表）',
    mortalCleanOk, `${SEEDS.length} 个世界逐个核对`);
  check('★ 幽冥缝跑满一生：上界 entities / artifacts / popLog.arrived **一个数都没动**',
    upperCleanOk, `${SEEDS.length} 个世界逐个核对`);

  // ── ② 直接调 `climbOutToMortal`：保留幽冥 id + 不落进 entities + 编年史 ──
  const wDir = mkClimbWorld(4242);
  putGhosts(wDir, 1);
  const ghostId = wDir.nether.entities[0].id;
  const mBefore = wDir.entities.length;
  const climbedDirect = climbOutToMortal(wDir, wDir.rifts[0], RIFT_BASE_RADIUS);
  const wr = wDir.wraiths[0];
  check('★ 直接调 `climbOutToMortal`：落进 `world.wraiths`（**不是** `world.entities`）',
    climbedDirect === true && wDir.wraiths.length === 1 && wDir.entities.length === mBefore,
    `ok=${climbedDirect} · wraiths=${wDir.wraiths.length} · entities ${mBefore}→${wDir.entities.length}`);
  check('★ 爬出来的鬼**保留幽冥 id**（落在幽冥段 ≥ 2_000_000，与凡间 id 不相交）',
    Boolean(wr) && wr.id === ghostId && wr.id >= NETHER_ID_BASE,
    `id=${wr && wr.id}（原 ${ghostId}）· 基址 ${NETHER_ID_BASE}`);
  check('★ 编年史写一笔 `rift-out`（归 `person`：与 `rift-lost` 是同一组对照事件的两半）',
    wDir.chronicle.some((c) => c.kind === 'rift-out'),
    JSON.stringify(wDir.chronicle.filter((c) => c.kind === 'rift-out').slice(-1)));

  // ── ③ 到期消散（不是永生）───────────────────────────────────────
  //    判据是 `world.day >= dissolveDay`，**不是** `age >= lifespan`：鬼不在
  //    `world.entities` 里，`stepCultivation` 根本不给它累加 `age`，拿 lifespan
  //    判会**永远不消散**（`age` 恒 0）。什么故障让它变红：有人照抄凡间那套判据。
  const wDis = mkClimbWorld(99);
  putGhosts(wDis, 1);
  climbOutToMortal(wDis, wDis.rifts[0], RIFT_BASE_RADIUS);
  const dDay = wDis.wraiths[0].dissolveDay;
  wDis.day = dDay + 1;
  const stDis = stepMortalWraiths(wDis, WRAITH_PERIOD_DAYS);
  check('★ 到期消散：`day >= dissolveDay` 时消失并计入 `wraithLog.dissolved`',
    wDis.wraiths.length === 0 && stDis.dissolved === 1 && wDis.wraithLog.dissolved === 1,
    `alive ${wDis.wraiths.length} · 本拍消散 ${stDis.dissolved} · 累计 ${wDis.wraithLog.dissolved}`);
  check('★ 消散后守恒式仍成立（`0 + dissolved === climbedOut`）',
    wraithStats(wDis).total === (wDis.nether.popLog.climbedOut || 0),
    `${wraithStats(wDis).total} vs ${wDis.nether.popLog.climbedOut}`);

  // ── ④ 存读档：`wraiths` / `wraithLog` 逐字段留得住 ───────────────
  //    什么故障让它变红：`serializeWorld` 漏写 `wraiths`（读档后满地图的鬼消失），
  //    或写进 `riftLog` 那种**逐键显式**的容器里（那会读档丢失 + save-equiv 键集红）。
  const wSnap = mkClimbWorld(4242);
  putGhosts(wSnap, 3);
  climbOutToMortal(wSnap, wSnap.rifts[0], RIFT_BASE_RADIUS);
  stepMortalWraiths(wSnap, WRAITH_PERIOD_DAYS);
  const snapBefore = JSON.stringify({ wraiths: wSnap.wraiths, log: wSnap.wraithLog });
  const wBack = deserializeWorld(serializeWorld(wSnap));
  check('★ 存读档：`wraiths`（22 字段逐字段）与 `wraithLog` 都留得住',
    JSON.stringify({ wraiths: wBack.wraiths, log: wBack.wraithLog }) === snapBefore,
    `wraiths ${wSnap.wraiths.length}→${wBack.wraiths.length}`
    + ` · dissolved ${wBack.wraithLog.dissolved}`);

  // ── ⑤ 源码结构：`wraiths.js` 的**代码**够不到 `world.entities` ────
  //    「鬼不进凡间实体列表」这条判据的**机器可读形态**。去注释后查：
  //    头注释里大量讨论 `world.entities`（那是**说明**），但**代码**里一次都不许出现。
  //    什么故障让它变红：有人改成 `world.addEntity(...)` 或直接
  //    `world.entities.push(...)` —— 鬼就混进凡人列表，被觉醒 / 修炼 / 飞升。
  const WRAITH_SRC = stripComments(fs.readFileSync(path.join(INKBOX_SRC, 'sim/wraiths.js'), 'utf8'));
  const entHits = countIn(WRAITH_SRC, /world\.entities/g);
  const addHits = countIn(WRAITH_SRC, /\.addEntity\s*\(/g);
  check('★ 源码结构：`sim/wraiths.js` 的代码里不出现 `world.entities` / `addEntity`',
    entHits === 0 && addHits === 0,
    `world.entities ${entHits} 次 · addEntity ${addHits} 次`);
  // 对称的一条：`stepMortalWraiths` 的函数体里也不许碰 entities。
  const stepBody = fnBodyOf(WRAITH_SRC, 'stepMortalWraiths');
  check('★ 源码结构：`stepMortalWraiths` 函数体里够不到 `world.entities`',
    stepBody.length > 0 && !stepBody.includes('.entities'),
    stepBody.length ? `命中 ${(stepBody.match(/\.entities/g) || []).length} 次` : '找不到函数体');

  // ── ⑥ 源码结构：`climbOutToMortal` **零 rng** ────────────────────
  //    判定节奏的抽签在 `stepNetherRift` 里；「谁爬出来」由**空间距离**决定
  //    （纯算术，平手保留先遇到的 ⇒ 顺序稳定可复现）。
  //    什么故障让它变红：有人为了「公平」在选鬼时加了 `hrng()`。
  const climbBody = fnBodyOf(RIFT_SRC, 'climbOutToMortal');
  check('★ 源码结构：`climbOutToMortal` **零 rng**（判定节奏才抽签，选谁不抽签）',
    climbBody.length > 0 && !/\brng\s*\(/.test(climbBody) && !climbBody.includes('Math.random'),
    `命中 ${(climbBody.match(/\brng\s*\(/g) || []).join('/') || '无'}`);

  // ── ⑦ 第四条流与其余五条**两两不同** ─────────────────────────────
  //    什么故障让它变红：`MORTALHAUNT_SEED_KEY` 与任何一条既有流派生键相同
  //    ⇒ 两条流从同一个种子出发，抽签序列完全重合（世界线悄悄耦合，不报错）。
  const KEYS = {
    rift: RIFT_SEED_KEY, netherRift: NETHRIFT_SEED_KEY, wraith: MORTALHAUNT_SEED_KEY,
    upper: UPPER_SEED_KEY, nether: NETHER_SEED_KEY, mercy: MERCY_SEED_KEY,
  };
  const vals = Object.values(KEYS);
  const uniq = new Set(vals);
  check('★ 六条独立随机流的派生键**两两不同**（rift / netherRift / wraith / upper / nether / mercy）',
    uniq.size === vals.length,
    Object.entries(KEYS).map(([k, v]) => `${k}=0x${v.toString(16)}`).join(' · '));
  // 行为侧对照：`mortalHauntRngFor(w)` 取两次必须是**同一个实例**（惰性、不重播种），
  // 且它抽的第一个数与「照同一公式现建一条」逐位相同（派生口径唯一）。
  const rngA = mortalHauntRngFor(wDir);
  const rngB = mortalHauntRngFor(wDir);
  const ref = mulberry32(((wDir.seed || 0) ^ MORTALHAUNT_SEED_KEY) >>> 0);
  check('★ `mortalHauntRngFor` 是**同一实例**（惰性建立、不重播种）且派生口径唯一',
    rngA === rngB && rngA() === ref(),
    `同一实例=${rngA === rngB}`);

  // ── ⑧ 反向对照：**上界**缝够不到凡间鬼影 ─────────────────────────
  //    与 F8④ 对称。什么故障让它变红：`stepNetherRift` 的分流被写反
  //    （上界缝也跑 `climbOutToMortal`）⇒ 上界缝会往外吐鬼。
  const wUpOnly = mkClimbWorld(4242);
  wUpOnly.rifts[0].targetPlane = 'upper';
  putGhosts(wUpOnly, 4);
  const nBeforeUp = wUpOnly.nether.entities.length;
  for (let k = 0; k < 200; k += 1) { wUpOnly.day += RIFT_PERIOD_DAYS; stepRifts(wUpOnly); }
  check('★ 反向对照：**上界**缝跑满一生，`climbedOut` 恒 0、`wraiths` 恒空（上界够不到凡间鬼影）',
    ((wUpOnly.nether.popLog || {}).climbedOut || 0) === 0
    && wUpOnly.wraiths.length === 0
    && wUpOnly.nether.entities.length === nBeforeUp,
    `climbedOut=${(wUpOnly.nether.popLog || {}).climbedOut || 0}`
    + ` · wraiths=${wUpOnly.wraiths.length} · 幽冥 ${nBeforeUp}→${wUpOnly.nether.entities.length}`);

  // ── ⑨ 概率常量落在 (0, 1) 且与「每 30 日一拍」的语义一致 ──────────
  //    什么故障让它变红：常量被写成 0（永不触发，B 包静默死掉）或 > 1
  //    （每拍必触发，鬼会瞬间塞满凡间）——两者都不报错。
  check('★ 触发概率常量在 (0,1) 内（写 0 会让 B 包静默死掉，> 1 会瞬间塞满凡间）',
    WRAITH_CLIMB_CHANCE_PER_PERIOD > 0 && WRAITH_CLIMB_CHANCE_PER_PERIOD < 1,
    `${WRAITH_CLIMB_CHANCE_PER_PERIOD} / 每 ${RIFT_PERIOD_DAYS} 日一拍`);
}

// ══════════════════════════════════════════════════════════════════
// F10 · 幽冥物品泄漏（D6-3 工程包 C）
// ══════════════════════════════════════════════════════════════════
//
// F8 判「人」凡 → 幽、F9 判「鬼」幽 → 凡；F10 判**东西**跨界，而东西**两个
// 方向**都走，再加上第三条来源（幽冥自生）：
//
//   来源① **跌入者随身带下去**（`fallIntoNether` → `moveArtifactsToNether`）
//   来源② **幽冥自生**（`stepNetherItems`，零 rng 的确定性哈希流）
//   去向  **经缝漏回凡间地上**（`leakNetherItem` → `toGround`，落地等捡）
//
// 六条不变量：
//   ① **守恒**：`nether.artifacts.length === itemsSpawned + itemsFellIn
//      − itemsLeakedOut − itemsDecayed`（`netherItemStats().conserved`）。
//      什么故障让它变红：某条流水忘了记 / 记重了，或裁剪朽坏没进 `itemsDecayed`。
//   ② **凡间实体只可能因「跌入幽冥」而减少**：幽冥物品跑满一生，`world.entities`
//      的减员全部记在 `fellIn` 上；上界三口径一个数都不动。
//      （⚠️ 判据写成**守恒式**而不是「实体数不变」：本世界的凡间撒过人，缝口附近
//        可能恰好站着一个活人，他会走 A 包合法地跌进去。写「不变」会让这条断言
//        取决于地形与种子——今天绿、换种子红，且红的理由与 C 包无关。）
//   ③ **两端记账恒等**：`凡间地上多出来的件数 === itemsLeakedOut`，
//      且 `artifactLog.netherIn === itemsLeakedOut`（同一批东西的两端账）。
//      什么故障让它变红：漏物只记一端 ⇒ 凡间的守恒律静默失效（在世凭空多一件）。
//   ④ **跨世界 id 重赋**（铁律三）：凡 → 幽、幽 → 凡两个方向都要重赋，
//      否则「凡间第 N 件」与「幽冥第 N 件」同号，`claimGroundArtifact` 会命中
//      先出现的那一件（**不报错**）。
//   ⑤ **存读档**：`nether.artifacts`（走 `serializeWorld` 通用路径）与
//      `popLog.items*` 四条流水（`NETHER_ONLY_KEYS` 整对象）都留得住。
//   ⑥ **源码结构**：`leakNetherItem` 与 `stepNetherItems` 都**零 rng**——
//      判定节奏的抽签在 `stepNetherRift` 里；「漏哪一件」由**空间距离**决定。
//
// ⚠️ **隔离世界**：不挂 `life`——否则自然产出会把手工注入的那批淹掉
//    （故障类：手工注入的样本被自然产出淹掉）。
// ⚠️ `totalSpawned > 0` / `totalLeaked > 0` 是**非空性守卫**（否则守恒式与
//    「地上多出来的 === 漏出数」都会退化成 `0 === 0` 的空过）。
// ⚠️ 缝必须开在**凡间可通行格**上：`leakNetherItem` 靠 `findMortalSpot` 在缝口
//    附近找凡间落点，缝本身开在水面 / 山体上会让它整次放弃（红得莫名其妙）。
section('F10. 幽冥物品泄漏：守恒 · 两端记账 · id 重赋 · 零 rng（D6-3 C）');

{
  // 手工造一件幽冥物品（形状照抄 `netherLife.js` 的 `spawnNetherItem`）。
  // ⚠️ 手工注入**必须同时记账**（`itemsSpawned`），否则守恒式会被本组自己搞红。
  const mkItem = (id, name, x, y, techName, techNote) => ({
    id, slot: '法宝', tier: NETHER_ITEM_TIER, quality: NETHER_ITEM_QUALITY, name,
    durability: 100, maxDurability: 100, scars: 0,
    forgedDay: 0, forgedByName: null, ownerId: 0, ownerName: null,
    heldSince: 0, spirit: null, history: [[0, 'forged', null]], lostDay: 0,
    x, y, technique: techName ? { name: techName, note: techNote || '' } : null,
  });
  // 三界俱全 + 一条手工 nether 缝（开在**可通行格**上，理由见段头）。
  const mkItemWorld = (seed) => {
    const w = makeThreeRealmWorld(seed);
    let rx = 30; let ry = 30;
    outer: for (let y = 5; y < w.h - 5; y += 1) {
      for (let x = 5; x < w.w - 5; x += 1) {
        if (w.isWalkable(y * w.w + x)) { rx = x; ry = y; break outer; }
      }
    }
    w.rifts = [{
      id: 1, x: rx, y: ry, strength: RIFT_BASE_RADIUS, openedDay: 0,
      age: 0, closedDay: -1, leaked: 0, crossed: 0, targetPlane: 'nether',
    }];
    w.nextRiftId = 2;
    return w;
  };

  // ── ① 端到端 · 自生：多世界长时段 ───────────────────────────────
  //    只跑幽冥时钟（`riftActive: false` ⇒ 缝不演化），判「自生 + 守恒 + 世界没被搅动」。
  const SEEDS = [11, 23, 37, 59, 71, 97, 113, 131];
  let totalSpawned = 0;
  let spawnConserveOk = true;
  let mortalCleanOk = true;
  let upperCleanOk = true;
  for (const sd of SEEDS) {
    const w = mkItemWorld(sd);
    const mEnt = w.entities.length;
    const uEnt = w.upper.entities.length;
    const uArt = w.upper.artifacts.length;
    const uArr = ensureUpperPopLog(w.upper).arrived;
    // 3000 日 = 100 个判定点（`NETHER_ITEM_PERIOD_DAYS = 30`）。步长取
    // `ADVANCE_PERIODS.nether`（10）⇒ 每一拍都是一次真实的幽冥 tick。
    runWorld(w, 3000, ADVANCE_PERIODS.nether, { riftActive: false });
    const st = netherItemStats(w.nether);
    totalSpawned += st.spawned;
    if (!st.conserved) spawnConserveOk = false;
    if (w.entities.length !== mEnt) mortalCleanOk = false;
    if (w.upper.entities.length !== uEnt || w.upper.artifacts.length !== uArt
      || ensureUpperPopLog(w.upper).arrived !== uArr) upperCleanOk = false;
  }
  check('★ 端到端：8 个种子里幽冥确实自生出了物品（下面守恒式的**非空性守卫**）',
    totalSpawned > 0, `共凝出 ${totalSpawned} 件 / ${SEEDS.length} 个世界`);
  check('★ 守恒：`alive === spawned + fellIn − leakedOut − decayed`（逐世界成立）',
    spawnConserveOk, `${SEEDS.length} 个世界逐个核对`);
  check('★ 幽冥自生跑满 3000 日：凡间 `world.entities` **一个数都没动**',
    mortalCleanOk, `${SEEDS.length} 个世界逐个核对`);
  check('★ 上界 entities / artifacts / popLog.arrived **一个数都没动**（自生只碰幽冥）',
    upperCleanOk, `${SEEDS.length} 个世界逐个核对`);

  // ── ② 端到端 · 漏出：多世界长时段 ───────────────────────────────
  //    这一条把缝开起来（默认 `riftActive`），判「漏出 + 两端记账 + 世界没被搅动」。
  //    ⚠️ 自生也在跑（同一条幽冥时钟），所以池子里会同时有「手工注入的」与
  //       「自然凝出的」——守恒式与两端账**不受影响**，这正是要验的。
  let totalLeaked = 0;
  let leakConserveOk = true;
  let twoSidedOk = true;
  let leakMortalCleanOk = true;
  for (const sd of SEEDS) {
    const w = mkItemWorld(sd);
    const rf = w.rifts[0];
    // 缝口附近放 4 件（离缝口 ≈ 0.7 格 ⇒ 恒在半径内，除非缝缩到 0.3 以下）。
    for (let i = 0; i < 4; i += 1) {
      w.nether.artifacts.push(mkItem(i + 1, `幽冥物${i}`, rf.x + 0.5, rf.y + 0.5, '玄阴诀', '引阴气入体'));
    }
    ensureNetherPopLog(w.nether).itemsSpawned += 4;
    const mEnt = w.entities.length;
    const fellBefore = w.nether.popLog.fellIn || 0;
    const groundBefore = w.artifacts.length;
    // 跑满一条缝的一生（200 拍 ≈ 6000 日，闭合点 ≈ 13000 日 ⇒ 全程活着）。
    runWorld(w, 200 * RIFT_PERIOD_DAYS, ADVANCE_PERIODS.nether, {});
    const st = netherItemStats(w.nether);
    totalLeaked += st.leakedOut;
    if (!st.conserved) leakConserveOk = false;
    // 两端记账：凡间地上**多出来的件数** === 幽冥记的漏出数；
    // 且凡间侧的流入账 `netherIn` 与它相等（同一批东西的两端）。
    if (w.artifacts.length - groundBefore !== st.leakedOut) twoSidedOk = false;
    if ((w.artifactLog.netherIn || 0) !== st.leakedOut) twoSidedOk = false;
    // ⚠️ 判据写成**守恒式**，不是「实体数不变」：本世界的凡间是 `scatter: true`
    //    撒过人的，而缝口附近**可能**恰好站着一个活人——他会走 A 包的
    //    `fallIntoNether` 跌进幽冥（那是**合法的**减员，不是物品系统的错）。
    //    写「实体数不变」会让这条断言**取决于地形与种子**：今天是绿的，换个
    //    种子就红，而红的理由与 C 包毫无关系（一条运气撑起来的判据）。
    //    守恒式（`剩下的 + 跌入的 === 原来的`）与种子无关，且它抓的正是
    //    「物品泄漏偷偷动了几人列表」这个故障——那是唯一会破坏它的原因。
    const fellDelta = (w.nether.popLog.fellIn || 0) - fellBefore;
    if (w.entities.length + fellDelta !== mEnt) leakMortalCleanOk = false;
  }
  check('★ 端到端：8 个种子里确实有幽冥物品漏进凡间（下面两条判据的**非空性守卫**）',
    totalLeaked > 0, `共漏出 ${totalLeaked} 件 / ${SEEDS.length} 个世界`);
  check('★ 守恒：`alive === spawned + fellIn − leakedOut − decayed`（自生与漏出同时跑）',
    leakConserveOk, `${SEEDS.length} 个世界逐个核对`);
  check('★ 两端记账恒等：`凡间地上多出来的件数 === itemsLeakedOut === artifactLog.netherIn`',
    twoSidedOk, `${SEEDS.length} 个世界逐个核对`);
  check('★ 凡间实体只可能因「跌入幽冥」而减少（物品泄漏绝不碰凡人列表）',
    leakMortalCleanOk, `${SEEDS.length} 个世界逐个核对`);

  // ── ③ 直接调 `leakNetherItem`：id 重赋 + 编年史 + 两端账 ──────────
  const wDir = mkItemWorld(4242);
  const rfDir = wDir.rifts[0];
  wDir.nextArtifactId = 5;                  // 凡间 id 空间从 5 起，便于观察重赋
  wDir.nether.artifacts = [mkItem(77, '河官笔', rfDir.x + 0.5, rfDir.y + 0.5, '玄阴诀', '引阴气入体')];
  ensureNetherPopLog(wDir.nether).itemsSpawned = 1;
  wDir.nether.nextArtifactId = 2;
  const ground0 = wDir.artifacts.length;
  const leakedDirect = leakNetherItem(wDir, wDir.rifts[0], RIFT_BASE_RADIUS);
  const landed = wDir.artifacts[wDir.artifacts.length - 1];
  check('★ 直接调 `leakNetherItem`：幽冥池少一件、凡间地上多一件（走 `toGround`，落地等捡）',
    leakedDirect === true && wDir.nether.artifacts.length === 0 && wDir.artifacts.length === ground0 + 1,
    `ok=${leakedDirect} · 幽冥 ${wDir.nether.artifacts.length} · 地上 ${ground0}→${wDir.artifacts.length}`);
  check('★ 跨世界 id **重赋**到凡间空间（幽冥的 77 → 凡间的 5，`nextArtifactId` → 6）',
    Boolean(landed) && landed.id === 5 && wDir.nextArtifactId === 6,
    `id=${landed && landed.id} · nextArtifactId=${wDir.nextArtifactId}`);
  check('★ 落地的物品**保留 `technique`**（功法跟着东西走，凡人捡到才有得学）',
    Boolean(landed && landed.technique) && landed.technique.name === '玄阴诀',
    `tech=${landed && landed.technique && landed.technique.name}`);
  check('★ 编年史写一笔 `rift-in`（**一件东西**跨界，归 `cultivation` 不归 `person`）',
    wDir.chronicle.some((c) => c.kind === 'rift-in'),
    JSON.stringify(wDir.chronicle.filter((c) => c.kind === 'rift-in').slice(-1)));

  // ── ④ 直接调 `fallIntoNether`：跌入者的法宝跟着下去 + 重赋 id ─────
  const wFell = mkItemWorld(777);
  const rfF = wFell.rifts[0];
  wFell.entities.push({
    id: 999999, sp: SPECIES.CULTIVATOR, x: rfF.x + 0.5, y: rfF.y + 0.5,
    level: 10, hp: 10, maxHp: 10, age: 0, lifespan: 100000,
    artifacts: [], relations: new Map(), name: '试缝人', techniques: [],
  });
  const person = wFell.entities[0];
  person.artifacts = [mkItem(11, '凡剑甲', 0, 0, null), mkItem(12, '凡剑乙', 0, 0, null)];
  wFell.nextArtifactId = 20;
  const outBefore = wFell.artifactLog.netherOut || 0;
  const fellDirect = fallIntoNether(wFell, wFell.rifts[0], RIFT_BASE_RADIUS);
  const ghost = wFell.nether.entities[wFell.nether.entities.length - 1];
  check('★ 直接调 `fallIntoNether`：法宝**跟着人进幽冥**（随身清空、幽冥池 +2、`itemsFellIn=2`）',
    fellDirect === true && person.artifacts.length === 0 && wFell.nether.artifacts.length === 2
    && wFell.nether.popLog.itemsFellIn === 2,
    `ok=${fellDirect} · 随身 ${person.artifacts.length} · 幽冥 ${wFell.nether.artifacts.length}`
    + ` · fellIn=${wFell.nether.popLog.itemsFellIn}`);
  check('★ 跨世界 id **重赋**到幽冥空间（不再撞凡间的 11 / 12）',
    wFell.nether.artifacts.every((a) => a.id !== 11 && a.id !== 12),
    `幽冥 id=${wFell.nether.artifacts.map((a) => a.id).join(',')}`);
  check('凡间账 `artifactLog.netherOut` += 2（跨位面流出，与上界的 `riftOut` 分列两键）',
    (wFell.artifactLog.netherOut || 0) === outBefore + 2,
    `netherOut=${wFell.artifactLog.netherOut}`);
  check('法宝落点 = **人的落点**（东西是跟人一起下去的，不是掉在缝口）',
    wFell.nether.artifacts.every((a) => Math.hypot(a.x - ghost.x, a.y - ghost.y) < 1e-9),
    `art=${wFell.nether.artifacts.map((a) => a.x + ',' + a.y).join('|')} ghost=${ghost.x},${ghost.y}`);

  // ── ⑤ 存读档：`nether.artifacts` + `popLog.items*` 留得住 ────────
  //    什么故障让它变红：`serializeNetherWorld` 漏写 `artifacts`（读档后池子空），
  //    或把四条流水记进 `riftLog` 那种**逐键显式**的容器里（读档丢失 + save-equiv 红）。
  const wSnap = mkItemWorld(555);
  wSnap.nether.artifacts = [mkItem(7, '引路幡', 12.5, 8.5, '幽明录', '阴阳两界之事，皆可入录')];
  wSnap.nether.nextArtifactId = 8;
  const snapLog = ensureNetherPopLog(wSnap.nether);
  snapLog.itemsSpawned = 1; snapLog.itemsFellIn = 2; snapLog.itemsLeakedOut = 3; snapLog.itemsDecayed = 4;
  const wBack = deserializeWorld(serializeWorld(wSnap));
  check('★ 存读档：`nether.artifacts`（含 `technique`）与 `nextArtifactId` 都留得住',
    JSON.stringify(wBack.nether.artifacts) === JSON.stringify(wSnap.nether.artifacts)
    && wBack.nether.nextArtifactId === 8,
    `物品 ${wSnap.nether.artifacts.length}→${wBack.nether.artifacts.length}`
    + ` · nextArtifactId=${wBack.nether.nextArtifactId}`);
  check('★ 存读档：`popLog.items*` 四条流水（自生 / 跌入 / 漏出 / 朽坏）逐项留得住',
    wBack.nether.popLog.itemsSpawned === 1 && wBack.nether.popLog.itemsFellIn === 2
    && wBack.nether.popLog.itemsLeakedOut === 3 && wBack.nether.popLog.itemsDecayed === 4,
    JSON.stringify({
      s: wBack.nether.popLog.itemsSpawned, f: wBack.nether.popLog.itemsFellIn,
      l: wBack.nether.popLog.itemsLeakedOut, d: wBack.nether.popLog.itemsDecayed,
    }));

  // ── ⑥ 源码结构：`leakNetherItem` 与 `stepNetherItems` 都**零 rng** ──
  //    判定节奏的抽签在 `stepNetherRift` 里（「这一拍有没有动静」）；
  //    「漏哪一件」由**空间距离**决定（平手保留先遇到的 ⇒ 顺序稳定可复现），
  //    「凝不凝」由 `hash32` / `hashStep` 的确定性哈希决定（幽冥没有第二条流可挂）。
  //    什么故障让它变红：有人为了「公平」在选物品 / 选槽位时加了 `rng()`——
  //    那会让「同种子同一天」的结果依赖**这条流之前被抽过几次**（跨世界不可复现）。
  const leakBody = fnBodyOf(RIFT_SRC, 'leakNetherItem');
  check('★ 源码结构：`leakNetherItem` **零 rng**（判定节奏才抽签，漏哪件不抽签）',
    leakBody.length > 0 && !/\brng\s*\(/.test(leakBody) && !leakBody.includes('Math.random'),
    `命中 ${(leakBody.match(/\brng\s*\(/g) || []).join('/') || '无'}`);
  const NETHER_SRC = stripComments(fs.readFileSync(path.join(INKBOX_SRC, 'sim/netherLife.js'), 'utf8'));
  const spawnBody = fnBodyOf(NETHER_SRC, 'stepNetherItems');
  check('★ 源码结构：`stepNetherItems` **零 rng**（自生由 `hash32` / `hashStep` 决定）',
    spawnBody.length > 0 && !/\brng\s*\(/.test(spawnBody) && !spawnBody.includes('Math.random'),
    `命中 ${(spawnBody.match(/\brng\s*\(/g) || []).join('/') || '无'}`);

  // ── ⑦ 第七条流与其余六条**两两不同** ─────────────────────────────
  //    什么故障让它变红：`NETHERITEM_SEED_KEY` 与任何一条既有流派生键相同
  //    ⇒ 两条流从同一个种子出发，抽签序列完全重合（世界线悄悄耦合，不报错）。
  const KEYS = {
    rift: RIFT_SEED_KEY, netherRift: NETHRIFT_SEED_KEY, wraith: MORTALHAUNT_SEED_KEY,
    item: NETHERITEM_SEED_KEY, upper: UPPER_SEED_KEY, nether: NETHER_SEED_KEY, mercy: MERCY_SEED_KEY,
  };
  const vals = Object.values(KEYS);
  const uniq = new Set(vals);
  check('★ 七条独立随机流的派生键**两两不同**（rift / netherRift / wraith / item / upper / nether / mercy）',
    uniq.size === vals.length,
    Object.entries(KEYS).map(([k, v]) => `${k}=0x${v.toString(16)}`).join(' · '));
  // 行为侧对照：同一实例（惰性、不重播种），且抽的第一个数与「照同一公式现建一条」逐位相同。
  const irngA = netherItemRngFor(wDir);
  const irngB = netherItemRngFor(wDir);
  const iref = mulberry32(((wDir.seed || 0) ^ NETHERITEM_SEED_KEY) >>> 0);
  check('★ `netherItemRngFor` 是**同一实例**（惰性建立、不重播种）且派生口径唯一',
    irngA === irngB && irngA() === iref(), `同一实例=${irngA === irngB}`);

  // ── ⑧ 反向对照：**上界**缝够不到幽冥物品 ─────────────────────────
  //    与 F8④ / F9⑧ 对称。什么故障让它变红：`stepNetherRift` 的分流被写反
  //    （上界缝也跑 `leakNetherItem`）⇒ 上界缝会往外吐幽冥物品。
  const wUpOnly = mkItemWorld(4242);
  wUpOnly.rifts[0].targetPlane = 'upper';
  wUpOnly.nether.artifacts = [mkItem(1, '守物', 30.5, 30.5, '玄阴诀', '')];
  ensureNetherPopLog(wUpOnly.nether).itemsSpawned = 1;
  const nItemBeforeUp = wUpOnly.nether.artifacts.length;
  for (let k = 0; k < 200; k += 1) { wUpOnly.day += RIFT_PERIOD_DAYS; stepRifts(wUpOnly); }
  check('★ 反向对照：**上界**缝跑满一生，`itemsLeakedOut` 恒 0、幽冥物品池不变（上界够不到）',
    ((wUpOnly.nether.popLog || {}).itemsLeakedOut || 0) === 0
    && wUpOnly.nether.artifacts.length === nItemBeforeUp,
    `itemsLeakedOut=${(wUpOnly.nether.popLog || {}).itemsLeakedOut || 0}`
    + ` · 幽冥物品 ${nItemBeforeUp}→${wUpOnly.nether.artifacts.length}`);

  // ── ⑨ 概率常量落在 (0, 1) 且与「每 30 日一拍」的语义一致 ──────────
  //    什么故障让它变红：常量被写成 0（永不触发，C 包静默死掉）或 > 1
  //    （每拍必触发，幽冥物品会瞬间漏满凡间）——两者都不报错。
  check('★ 触发概率常量在 (0,1) 内（写 0 会让 C 包静默死掉，> 1 会瞬间漏满凡间）',
    NETHER_ITEM_LEAK_CHANCE_PER_PERIOD > 0 && NETHER_ITEM_LEAK_CHANCE_PER_PERIOD < 1,
    `${NETHER_ITEM_LEAK_CHANCE_PER_PERIOD} / 每 ${RIFT_PERIOD_DAYS} 日一拍`);
  check('★ 自生概率常量在 (0,1) 内，周期 = 30 日（与幽冥 10 日节拍错开）',
    NETHER_ITEM_CHANCE > 0 && NETHER_ITEM_CHANCE < 1 && NETHER_ITEM_PERIOD_DAYS === 30,
    `${NETHER_ITEM_CHANCE} / 每 ${NETHER_ITEM_PERIOD_DAYS} 日一个判定点`);
}

// ══════════════════════════════════════════════════════════════════
// F11 · 跨位面夺舍（D6-3 工程包 D）
// ══════════════════════════════════════════════════════════════════
//
// F8 判「人」凡 → 幽、F9 判「鬼」幽 → 凡、F10 判**东西**两个方向；F11 判
// **元神跨界**——幽冥的鬼修把元神搬进凡间活人的身体（真夺舍）或暂时接管
// 他的行动（附身）。
//
// 用户裁决（2026-09-26）：
//   · 低阶鬼修（`level ≤ POSSESS_TIER_MAX_LEVEL`）**真夺舍** ⇒ 鬼修**从幽冥消失**
//     （第四条离开路径 `possessedOut`）；「继续修仙的执念」；
//   · 高阶鬼修（厉鬼及以上）只**暂时附身** ⇒ **留在幽冥**；附身期由 `life.js`
//     的行为锁接管行动（本文件不判行为锁——那在 smoke 5q⑰ / life.js 里）。
//
// 八条不变量：
//   ① **端到端**：8 个种子、跑满一条缝的一生，**真夺舍**与**附身**都确实发生
//      （非空性守卫——没有它，下面「守恒」「没灭人」全是 `0 === 0` 的空过）。
//   ② **守恒**：`鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺`（`netherEcoStats().conserved`）。
//   ③ **凡间减员全部记在 `fellIn` 上**：夺舍**不灭人**（只换元神）——少了的人
//      只能是走 A 包合法跌进幽冥的。什么故障让它变红：夺舍错写成「把人从
//      `world.entities` 里挪走」或「凭空造人」。
//   ④ **上界零变化**：夺舍只碰凡间与幽冥，上界 entities / artifacts / popLog.arrived
//      一个数都不动。
//   ⑤ **零 rng**（源码结构）：`crossPlanePossession` / `possessMortal` /
//      `hauntMortal` 里没有 `rng(` / `Math.random`——判定节奏的抽签在
//      `stepNetherRift` 里（第八条流）。
//   ⑥ **四支独立**（源码结构）：`stepNetherRift` 里四个效果各在自己的 `if` 里，
//      **不是 `else if`**——否则后三支的抽签会被前面条件吃掉，四条流重新耦合
//      （而且**不报错**）。这是「互不干扰」唯一的可验证判据。
//   ⑦ **八条流两两不同**。
//   ⑧ **反向对照**：上界缝跑满一生，`possessedOut` / `crossPlane` / `haunted` 恒 0。
//
// ⚠️ **隔离世界 + 手工注入**（同 F8/F9/F10）：不挂 `life`；鬼修手工放在缝口，
//    并**同时记账**（`ghostBorn` 含鬼修）——否则守恒式会被本组自己搞红。
// ⚠️ 端到端段显式 `nether: false`：**冻结幽冥自己的移动 / 消散时钟**。本节判的是
//    **夺舍通道**，而「鬼在幽冥里怎么飘」是 F5 的事。不冻结的话注入的鬼修会朝
//    冥河迁移、离开缝口半径，判据就退化成「地形与种子决定成败」。
section('F11. 跨位面夺舍：真夺舍 / 附身 · 守恒 · 零 rng · 四支独立（D6-3 D）');

{
  // 造一个「三界俱全 + 一条活跃 nether 缝」的世界（缝开在**凡间可通行格**上）。
  // ⚠️ `age` 直接给 `TAU_GROW`：`riftRadiusAt(0) === 0`，刚开的缝半径是 0，
  //    「缝口半径内找鬼修 / 找人」在第一步会全部落空（红得莫名其妙）。
  const mkPossessWorld = (seed) => {
    const w = makeThreeRealmWorld(seed);
    let rx = 30; let ry = 30;
    outer: for (let y = 5; y < w.h - 5; y += 1) {
      for (let x = 5; x < w.w - 5; x += 1) {
        if (w.isWalkable(y * w.w + x)) { rx = x; ry = y; break outer; }
      }
    }
    w.rifts = [{
      id: 1, x: rx, y: ry, strength: RIFT_BASE_RADIUS, openedDay: 0,
      age: TAU_GROW, closedDay: -1, leaked: 0, crossed: 0, targetPlane: 'nether',
    }];
    w.nextRiftId = 2;
    return w;
  };
  // 造一只鬼修。形状照抄 `netherLife.js` 的 `GHOST_TEMPLATE`（只列本节会读到的键）。
  const mkGhost = (id, level, x, y, rancor) => ({
    id, sp: SPECIES.HUMAN, x, y, tx: x, ty: y, vx: 0, vy: 0,
    hp: 10, maxHp: 10, age: 0, lifespan: 1e9,
    level, name: `鬼修${id}`, soulKind: 'ghostCultivator',
    ghostRancor: rancor, ghostDecayDay: -1e9, soulBind: null,
    state: 'wander', timer: 0, anim: 0, face: 1, relations: new Map(),
  });
  // 手工放鬼修**必须同时记账**（`ghostBorn` 含鬼修、`cultivatorBorn` 是它的子集），
  // 否则守恒式会被这一节自己搞红——那是**探针的错，不是代码的错**。
  const pushGhost = (w, ghost) => {
    w.nether.entities.push(ghost);
    const log = ensureNetherPopLog(w.nether);
    log.ghostBorn += 1;
    log.cultivatorBorn += 1;
  };
  // 造一个**凡人**（`level 0`）。走 `initEntity` 而不是手抄字段表（理由见 smoke 5q⑰）。
  const mkMortal = (id, x, y) => {
    const e = {
      id, sp: SPECIES.HUMAN, x, y, tx: x, ty: y, vx: 0, vy: 0,
      hp: 10, maxHp: 10, age: 20, lifespan: 80, name: `凡人${id}`,
      kills: 0, relations: new Map(), techniques: [], artifacts: [],
      village: 0, faction: 0, clan: 0, gen: 0, state: 'wander', timer: 0,
      anim: 0, face: 1,
    };
    initEntity(e, mulberry32(id * 7919 + 13));
    return e;
  };

  // ── ①–④ 端到端：8 个种子 × { 低阶鬼修, 高阶鬼修 } ──────────────────
  //    每支各跑 200 拍 = 6000 日 ≈ 16.7 年（缝全程活着：闭合点 ≈ 13000 日）。
  //    低阶那支判「真夺舍」，高阶那支判「附身」——两支分开跑，是因为
  //    `pickGhostAtRift` 取**缝口最近的一只**，两种鬼混在一起时只会用到其中一种。
  const SEEDS = [11, 23, 37, 59, 71, 97, 113, 131];
  const runOne = (seed, ghostLevel) => {
    const w = mkPossessWorld(seed);
    const rf = w.rifts[0];
    for (let i = 0; i < 6; i += 1) {
      pushGhost(w, mkGhost(2000001 + i, ghostLevel, rf.x + 0.5, rf.y + 0.5, ghostLevel <= POSSESS_TIER_MAX_LEVEL ? 200 : 250));
    }
    for (let i = 0; i < 20; i += 1) w.entities.push(mkMortal(900 + i, rf.x + 0.5, rf.y + 0.5));
    const mCount = w.entities.length;
    const uEnt = w.upper.entities.length;
    const uArr = ensureUpperPopLog(w.upper).arrived;
    const uArt = w.upper.artifacts.length;
    runWorld(w, 200 * RIFT_PERIOD_DAYS, ADVANCE_PERIODS.nether, { nether: false });
    return {
      possess: w.possessionLog.crossPlane || 0,
      haunt: w.possessionLog.haunted || 0,
      conserve: netherEcoStats(w.nether).conserved,
      removed: mCount - w.entities.length,
      fellIn: w.nether.popLog.fellIn || 0,
      upperClean: w.upper.entities.length === uEnt
        && ensureUpperPopLog(w.upper).arrived === uArr
        && w.upper.artifacts.length === uArt,
    };
  };
  let totalPossess = 0; let totalHaunt = 0;
  let conserveOk = true; let removedOk = true; let upperOk = true;
  for (const sd of SEEDS) {
    const low = runOne(sd, 15);     // 怨灵级 ⇒ 真夺舍
    const high = runOne(sd, 35);    // 鬼将级 ⇒ 只附身
    totalPossess += low.possess;
    totalHaunt += high.haunt;
    if (!low.conserve || !high.conserve) conserveOk = false;
    if (low.removed !== low.fellIn || high.removed !== high.fellIn) removedOk = false;
    if (!low.upperClean || !high.upperClean) upperOk = false;
  }
  check('★ 端到端（低阶鬼修 · 8 种子）：确实发生了**真夺舍**（下面各式的非空性守卫）',
    totalPossess > 0, `共 ${totalPossess} 次 / ${SEEDS.length} 个世界`);
  check('★ 端到端（高阶鬼修 · 8 种子）：确实发生了**附身**（非空性守卫）',
    totalHaunt > 0, `共 ${totalHaunt} 次 / ${SEEDS.length} 个世界`);
  check('★ 守恒：`鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺`（逐世界成立）',
    conserveOk, `${SEEDS.length * 2} 个世界逐个核对`);
  check('★ 凡间减员**全部**记在 `fellIn` 上（夺舍不灭人、不造人——只换元神）',
    removedOk, `${SEEDS.length * 2} 个世界逐个核对`);
  check('★ 上界 entities / artifacts / popLog.arrived **一个数都没动**（夺舍只碰凡间与幽冥）',
    upperOk, `${SEEDS.length * 2} 个世界逐个核对`);

  // ── ⑤ 源码结构：三个效果函数**零 rng** ────────────────────────────
  //    什么故障让它变红：有人为了「公平」在选容器 / 掷继承比例时加了 `rng()`——
  //    那会让「同种子同一天」的结果依赖**这条流之前被抽过几次**（跨世界不可复现），
  //    而且会移动凡间主随机流（铁律一）。D 包的效果函数**一次签都不抽**。
  const POSSESS_SRC = stripComments(fs.readFileSync(path.join(INKBOX_SRC, 'sim/possession.js'), 'utf8'));
  for (const fn of ['crossPlanePossession', 'possessMortal', 'hauntMortal']) {
    const body = fnBodyOf(POSSESS_SRC, fn);
    check(`★ 源码结构：\`${fn}\` **零 rng**（判定节奏才抽签，效果本身不抽）`,
      body.length > 0 && !/\brng\s*\(/.test(body) && !body.includes('Math.random'),
      `命中 ${(body.match(/\brng\s*\(/g) || []).join('/') || '无'}`);
  }

  // ── ⑥ 源码结构：`stepNetherRift` 四支效果各在自己的 `if` 里（不是 `else if`）──
  //    ⚠️ 这是「四条流互不干扰」唯一的**可验证**判据。写成 `else if` 之后，
  //    后三支的抽签会被前面条件吃掉 ⇒ `hrng`/`irng`/`prng` 的消费次数取决于
  //    `nrng` 的结果 ⇒ 四条流重新耦合，而**不报错**（这正是 A 包把 `continue`
  //    换成函数边界时记下的那条教训的同族）。
  const netherRiftBody = fnBodyOf(RIFT_SRC, 'stepNetherRift');
  const fourCalls = ['fallIntoNether', 'climbOutToMortal', 'leakNetherItem', 'crossPlanePossession'];
  const allFour = fourCalls.every((fn) => netherRiftBody.includes(`${fn}(`));
  const ifCount = countIn(netherRiftBody, /\bif\s*\(/g);
  check('★ 源码结构：`stepNetherRift` 四支效果齐全且**不是 `else if`**（`else` 一次都不出现）',
    netherRiftBody.length > 0 && allFour && !/\belse\b/.test(netherRiftBody),
    `四支齐全=${allFour} · 含 else=${/\belse\b/.test(netherRiftBody)}`);
  check('★ 源码结构：`stepNetherRift` 里恰好 4 个 `if (`（多一个少一个都会让流耦合）',
    ifCount === 4, `实测 ${ifCount} 个`);

  // ── ⑦ 八条独立流两两不同 ─────────────────────────────────────────
  //    什么故障让它变红：`NETHER_POSSESS_SEED_KEY` 与任何一条既有流派生键相同
  //    ⇒ 两条流从同一个种子出发，抽签序列完全重合（世界线悄悄耦合，不报错）。
  const KEYS8 = {
    rift: RIFT_SEED_KEY, netherRift: NETHRIFT_SEED_KEY, wraith: MORTALHAUNT_SEED_KEY,
    item: NETHERITEM_SEED_KEY, possess: NETHER_POSSESS_SEED_KEY,
    upper: UPPER_SEED_KEY, nether: NETHER_SEED_KEY, mercy: MERCY_SEED_KEY,
  };
  const vals8 = Object.values(KEYS8);
  check('★ 八条独立随机流的派生键**两两不同**（rift/netherRift/wraith/item/possess/upper/nether/mercy）',
    new Set(vals8).size === vals8.length,
    Object.entries(KEYS8).map(([k, v]) => `${k}=0x${v.toString(16)}`).join(' · '));
  // 行为侧对照：同一实例（惰性、不重播种），且抽的第一个数与「照同一公式现建一条」逐位相同。
  const wDir = mkPossessWorld(4242);
  const prngA = netherPossessRngFor(wDir);
  const prngB = netherPossessRngFor(wDir);
  const pref = mulberry32(((wDir.seed || 0) ^ NETHER_POSSESS_SEED_KEY) >>> 0);
  check('★ `netherPossessRngFor` 是**同一实例**（惰性建立、不重播种）且派生口径唯一',
    prngA === prngB && prngA() === pref(), `同一实例=${prngA === prngB}`);

  // ── ⑧ 反向对照：**上界**缝够不到夺舍通道 ─────────────────────────
  //    与 F8④ / F9⑧ / F10⑧ 对称。什么故障让它变红：`stepNetherRift` 的分流被写反
  //    （上界缝也跑 `crossPlanePossession`）⇒ 上界缝会凭空夺舍凡间活人。
  //    ⚠️ 缝口**也放鬼修与凡人**，否则这条对照会退化成「没得夺所以没夺」的空过。
  const wUpOnly = mkPossessWorld(4242);
  const upRift = wUpOnly.rifts[0];
  upRift.targetPlane = 'upper';
  for (let i = 0; i < 6; i += 1) pushGhost(wUpOnly, mkGhost(2000201 + i, 15, upRift.x + 0.5, upRift.y + 0.5, 200));
  for (let i = 0; i < 20; i += 1) wUpOnly.entities.push(mkMortal(950 + i, upRift.x + 0.5, upRift.y + 0.5));
  runWorld(wUpOnly, 200 * RIFT_PERIOD_DAYS, ADVANCE_PERIODS.nether, { nether: false });
  check('★ 反向对照：**上界**缝跑满一生，`possessedOut` / `crossPlane` / `haunted` 恒 0（够不到夺舍通道）',
    (wUpOnly.nether.popLog.possessedOut || 0) === 0
    && (wUpOnly.possessionLog.crossPlane || 0) === 0
    && (wUpOnly.possessionLog.haunted || 0) === 0,
    `possessedOut=${wUpOnly.nether.popLog.possessedOut || 0}`
    + ` crossPlane=${wUpOnly.possessionLog.crossPlane || 0}`
    + ` haunted=${wUpOnly.possessionLog.haunted || 0}`);

  // ── ⑨ 触发概率常量落在 (0,1) ─────────────────────────────────────
  //    什么故障让它变红：常量被写成 0（永不触发，D 包静默死掉）或 > 1
  //    （每拍必触发，鬼修会瞬间夺舍满凡间）——两者都不报错。
  check('★ 触发概率常量在 (0,1) 内（写 0 会让 D 包静默死掉，> 1 会每拍必夺）',
    POSSESS_CHANCE_PER_PERIOD > 0 && POSSESS_CHANCE_PER_PERIOD < 1,
    `${POSSESS_CHANCE_PER_PERIOD} / 每 ${RIFT_PERIOD_DAYS} 日一拍`);

  // ── ⑩ 存读档：`possessedOut` / `crossPlane` / `haunted` / `possessionScar` 留得住 ──
  //    ⚠️ 手工造**非零**状态当守卫：靠自然抽签命中会让这条判据取决于种子。
  //    什么故障让它变红：`possessedOut` 没进 `popLog` 的序列化 / 反序列化，
  //    或 `possessionScar` 没进实体行 row[68]（读档后印记凭空消失 ⇒ 行为锁失效）。
  {
    const w = mkPossessWorld(7171);
    const mortal0 = mkMortal(1201, 30.5, 30.5);
    w.entities.push(mortal0);
    mortal0.possessionScar = { ghostName: '甲', ghostLevel: 15, day: 0, until: -1, mode: 'possess' };
    w.nether.popLog.possessedOut = 3;
    w.possessionLog.crossPlane = 3;
    w.possessionLog.haunted = 2;
    const pick = (x) => ({
      out: x.nether.popLog.possessedOut || 0,
      cross: x.possessionLog.crossPlane || 0,
      haunt: x.possessionLog.haunted || 0,
      scar: JSON.stringify((x.entities.find((e) => e.id === 1201) || {}).possessionScar || null),
    });
    const before = pick(w);
    const round = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    const after = pick(round);
    check('★ 存读档：`possessedOut` / `crossPlane` / `haunted` / `possessionScar` 四样都留得住',
      before.out === 3 && before.scar !== 'null' && JSON.stringify(before) === JSON.stringify(after),
      `${JSON.stringify(before)} vs ${JSON.stringify(after)}`);
  }
}

// ══════════════════════════════════════════════════════════════════
// F12 · 三界跨界生态联合（D6-3 工程包 E）
// ══════════════════════════════════════════════════════════════════
//
// F8 判「人」凡→幽、F9 判「鬼」幽→凡、F10 判**东西**两向、F11 判**元神**跨界。
// 四组各测**一条通道**。F12 反过来问：
//
//   **四条通道挂在同一条缝上时，四本账会不会串？**
//
// 这是 E 包存在的理由：A–D 各自单独正确，不等于它们**合起来**正确。
// 典型故障（都不报错）：
//   · 四条流被写成 `else if` ⇒ 后三支的抽签被前面吃掉（F11⑥ 已钉**结构**，
//     这里再钉**行为**：四支各自消费自己的流，且消费次数与其余三支**相等**）；
//   · 某一支顺手写了另一支的账本（例如 `leakNetherItem` 记了 `fellIn`）；
//   · 幽冥缝开在**够不到河带**的位置 ⇒ C/D 结构性饿死（E 包的实测教训，
//     由 longrun 的 `NETHER_RIFT_SITES` + 几何探针负责，本节只判账）。
//
// 七条不变量：
//   ① **端到端 · 四支同缝**：一条缝上 A/B/C/D 四支都确实发生过（非空性守卫）。
//   ② **五条守恒 / 对账式同时成立**：幽冥生态 / 幽冥物品 / 鬼影两端 /
//      跨书三对（`itemsLeakedOut ↔ netherIn`、`itemsFellIn ↔ netherOut`、
//      `possessedOut ↔ crossPlane`）/ 凡间法宝（含幽冥两向）。
//   ③ **上界零变化**：四支只碰凡间与幽冥，上界 entities / artifacts /
//      popLog.arrived 一个数都不动。
//   ④ **凡间减员全部记在 `fellIn` 上**（D 不灭人、不造人——只换元神）。
//   ⑤ **四支流各被消费「恰好 pass 次」**（行为侧的「不是 `else if`」判据）。
//   ⑥ **1×1 开缝不消费裂隙流**（同种子双世界比对）：这是 E 包在 longrun 里
//      敢「常年开幽冥缝」而**不搅乱上界缝位置**的唯一依据。
//   ⑦ **反向对照**：上界缝跑满一生，四支账本恒 0。
//
// ⚠️ **隔离世界 + 手工注入**（同 F8–F11）：不挂 `life`；四类样本**全放在缝口**
//    （半径内），并**同时记账**（`ghostBorn` / `cultivatorBorn` / `itemsSpawned`）
//    ——否则守恒式会被本组自己搞红。
// ⚠️ 端到端段显式 `nether: false`：**冻结幽冥自己的移动 / 自生**（同 F11）。
//    本节判**跨界通道**，「鬼在幽冥里怎么飘」是 F5 的事；不冻结的话注入的样本
//    会朝冥河迁移、离开缝口半径，判据退化成「地形与种子决定成败」。
section('F12. 三界跨界生态联合：四支同缝 · 五守恒 · 不串账 · 不扰动裂隙流（D6-3 E）');

{
  // 造一件幽冥物品（形状照抄 F10 的 `mkItem`）。
  const mkItem = (id, x, y) => ({
    id, slot: '法宝', tier: NETHER_ITEM_TIER, quality: NETHER_ITEM_QUALITY, name: `幽冥物${id}`,
    durability: 100, maxDurability: 100, scars: 0,
    forgedDay: 0, forgedByName: null, ownerId: 0, ownerName: null,
    heldSince: 0, spirit: null, history: [[0, 'forged', null]], lostDay: 0,
    x, y, technique: null,
  });
  // 造一只鬼修（形状照抄 F11 的 `mkGhost`）。
  const mkGhost = (id, level, x, y, rancor) => ({
    id, sp: SPECIES.HUMAN, x, y, tx: x, ty: y, vx: 0, vy: 0,
    hp: 10, maxHp: 10, age: 0, lifespan: 1e9,
    level, name: `鬼修${id}`, soulKind: 'ghostCultivator',
    ghostRancor: rancor, ghostDecayDay: -1e9, soulBind: null,
    state: 'wander', timer: 0, anim: 0, face: 1, relations: new Map(),
  });
  // 造一个凡人（走 `initEntity`，理由见 F11）。
  const mkMortal = (id, x, y) => {
    const e = {
      id, sp: SPECIES.HUMAN, x, y, tx: x, ty: y, vx: 0, vy: 0,
      hp: 10, maxHp: 10, age: 20, lifespan: 80, name: `凡人${id}`,
      kills: 0, relations: new Map(), techniques: [], artifacts: [],
      village: 0, faction: 0, clan: 0, gen: 0, state: 'wander', timer: 0,
      anim: 0, face: 1,
    };
    initEntity(e, mulberry32(id * 7919 + 13));
    return e;
  };
  // 三界俱全 + 一条手工 nether 缝（缝口开在**凡间可通行格**上）。
  // ⚠️ `age` 直接给 `TAU_GROW`：`riftRadiusAt(0) === 0`，刚开的缝半径是 0。
  const mkJointWorld = (seed) => {
    const w = makeThreeRealmWorld(seed);
    let rx = 30; let ry = 30;
    outer: for (let y = 5; y < w.h - 5; y += 1) {
      for (let x = 5; x < w.w - 5; x += 1) {
        if (w.isWalkable(y * w.w + x)) { rx = x; ry = y; break outer; }
      }
    }
    w.rifts = [{
      id: 1, x: rx, y: ry, strength: RIFT_BASE_RADIUS, openedDay: 0,
      age: TAU_GROW, closedDay: -1, leaked: 0, crossed: 0, targetPlane: 'nether',
    }];
    w.nextRiftId = 2;
    return w;
  };
  // 往缝口放齐四类样本（A 的凡人 / B 的鬼魂 / C 的物品 / D 的鬼修），并记账。
  const stockRift = (w) => {
    const rf = w.rifts[0];
    const log = ensureNetherPopLog(w.nether);
    for (let i = 0; i < 4; i += 1) w.entities.push(mkMortal(900 + i, rf.x + 0.5, rf.y + 0.5));
    // D：6 只鬼修（level 15 ≤ POSSESS_TIER_MAX_LEVEL ⇒ 真夺舍，鬼修从幽冥消失）
    for (let i = 0; i < 6; i += 1) {
      w.nether.entities.push(mkGhost(2000001 + i, 15, rf.x + 0.5, rf.y + 0.5, 200));
    }
    // B：4 只普通鬼魂（`sp = GHOST`，与鬼修区分）
    for (let i = 0; i < 4; i += 1) {
      // ⚠️ `spawnNetherGhost` **自己会记 `ghostBorn`**（`netherLife.js:667`）——
      //    所以下面只手工补**手推的 6 只鬼修**那一份，不能把这两批一起补
      //    （补成 10 会重复计 4 ⇒ 守恒式被本组自己搞红，而那是**探针的错**）。
      spawnNetherGhost(w.nether, { kind: 'ghost', decayYears: 100000 });
      const g = w.nether.entities[w.nether.entities.length - 1];
      g.x = rf.x + 0.5; g.y = rf.y + 0.5;
    }
    log.ghostBorn += 6;           // 只有 6 只手推的鬼修没记过账
    log.cultivatorBorn += 6;
    // C：4 件幽冥物品
    for (let i = 0; i < 4; i += 1) w.nether.artifacts.push(mkItem(i + 1, rf.x + 0.5, rf.y + 0.5));
    log.itemsSpawned += 4;
    return rf;
  };

  // ── ①–④ 端到端 · 四支同缝 ─────────────────────────────────────
  const SEEDS = [11, 23, 37, 59, 71, 97, 113, 131];
  const tot = { fellIn: 0, climbedOut: 0, leakedOut: 0, possess: 0, haunt: 0 };
  let ecoOk = true; let itemOk = true; let wraithOk = true; let crossOk = true;
  let artOk = true; let upperOk = true; let mortalOk = true;
  for (const sd of SEEDS) {
    const w = mkJointWorld(sd);
    stockRift(w);
    const mEnt = w.entities.length;
    const uEnt = w.upper.entities.length;
    const uArt = w.upper.artifacts.length;
    const uArr = ensureUpperPopLog(w.upper).arrived;
    // 跑满一条缝的一生（200 拍 ≈ 6000 日，闭合点 ≈ 12889 日 ⇒ 全程活着）。
    // `nether: false` 冻结幽冥自己的移动 / 自生（理由见段头）。
    runWorld(w, 200 * RIFT_PERIOD_DAYS, ADVANCE_PERIODS.nether, { nether: false });
    const pl = w.nether.popLog || {};
    const ne = netherEcoStats(w.nether);
    const ni = netherItemStats(w.nether);
    tot.fellIn += pl.fellIn || 0;
    tot.climbedOut += pl.climbedOut || 0;
    tot.leakedOut += ni.leakedOut;
    tot.possess += w.possessionLog.crossPlane || 0;
    tot.haunt += w.possessionLog.haunted || 0;
    // ② 五条守恒 / 对账式
    if (!ne.conserved) ecoOk = false;
    if (!ni.conserved) itemOk = false;
    if (wraithStats(w).total !== ne.climbedOut) wraithOk = false;
    if (ni.leakedOut !== (w.artifactLog.netherIn || 0)) crossOk = false;
    if (ni.fellIn !== (w.artifactLog.netherOut || 0)) crossOk = false;
    if ((pl.possessedOut || 0) !== (w.possessionLog.crossPlane || 0)) crossOk = false;
    const af = artifactStats(w);
    const al = af.log || {};
    const lost = af.live + (al.broken || 0) + (al.decayed || 0);
    if (lost + (al.riftOut || 0) + (al.netherOut || 0)
      !== (al.forged || 0) + (al.riftIn || 0) + (al.netherIn || 0)) artOk = false;
    // ③ 上界零变化
    if (w.upper.entities.length !== uEnt || w.upper.artifacts.length !== uArt
      || ensureUpperPopLog(w.upper).arrived !== uArr) upperOk = false;
    // ④ 凡间减员全部记在 fellIn 上（不挂 life ⇒ 唯一的减员源是 A 通道）
    if (w.entities.length + (pl.fellIn || 0) !== mEnt) mortalOk = false;
  }
  check('★ 端到端（8 种子 · 单缝）：A 跌入 / B 爬出 / C 漏物 / D 夺舍 四支**都发生过**',
    tot.fellIn > 0 && tot.climbedOut > 0 && tot.leakedOut > 0 && (tot.possess + tot.haunt) > 0,
    `跌入 ${tot.fellIn} · 爬出 ${tot.climbedOut} · 漏物 ${tot.leakedOut}`
    + ` · 夺舍 ${tot.possess} / 附身 ${tot.haunt}`);
  check('★ 五条守恒 / 对账式同时成立（幽冥生态 · 幽冥物品 · 鬼影两端 · 跨书三对 · 凡间法宝含幽冥）',
    ecoOk && itemOk && wraithOk && crossOk && artOk,
    `生态 ${ecoOk} · 物品 ${itemOk} · 鬼影 ${wraithOk} · 跨书 ${crossOk} · 法宝 ${artOk}`);
  check('★ 上界 entities / artifacts / popLog.arrived **一个数都没动**（四支只碰凡间与幽冥）',
    upperOk, `${SEEDS.length} 个世界逐个核对`);
  check('★ 凡间减员**全部**记在 `fellIn` 上（D 夺舍不灭人、不造人——只换元神）',
    mortalOk, `${SEEDS.length} 个世界逐个核对`);

  // ── ⑤ 四支流各被消费「恰好 pass 次」——「不是 `else if`」的**行为侧**判据 ──
  //    为什么这一条比 F11⑥ 的**结构**判据更强：结构判据只看源码里有没有 `else`，
  //    而这条直接量「四条流各自前进了多少步」。写成 `else if` 时，后三支的消费次数
  //    会**少于** pass 数（被前面的条件吃掉），四者不再相等 ⇒ 立刻红。
  //    做法：`*RngFor(w)` 返回的是**同一个惰性实例**（不重播种），所以跑完之后
  //    再抽一次，与「照同一公式现建一条、前进 pass 次」逐位比较即可。
  //    ⚠️⚠️ **必须同时传 `wraith: false`**：第二条流 `mortalHauntRngFor` **不只**被
  //    `stepNetherRift` 消费——`stepMortalWraiths`（凡间鬼影 tick，每 10 日一拍）
  //    也用它（`wraiths.js:333`）。不冻结它，这条流的消费次数就**多于** pass
  //    （实测：`netherRift/item/possess` 都恰好 pass 次，只有 `wraith` 否）。
  //    冻结之后四条流都只由 `stepNetherRift` 消费 ⇒ 判据干净。
  {
    const w = mkJointWorld(4242);
    stockRift(w);
    const PASSES = 60;
    const { fired } = runWorld(w, PASSES * RIFT_PERIOD_DAYS, ADVANCE_PERIODS.nether,
      { nether: false, wraith: false });
    const passes = fired.rift;
    const sameAfter = (key, rngFn) => {
      const ref = mulberry32(((w.seed || 0) ^ key) >>> 0);
      for (let i = 0; i < passes; i += 1) ref();
      return rngFn(w)() === ref();
    };
    const okN = sameAfter(NETHRIFT_SEED_KEY, netherRiftRngFor);
    const okH = sameAfter(MORTALHAUNT_SEED_KEY, mortalHauntRngFor);
    const okI = sameAfter(NETHERITEM_SEED_KEY, netherItemRngFor);
    const okP = sameAfter(NETHER_POSSESS_SEED_KEY, netherPossessRngFor);
    check('★ 四支流各被消费**恰好 pass 次**（写成 `else if` 会让后三支少消费 ⇒ 立刻红）',
      passes === PASSES && okN && okH && okI && okP,
      `pass ${passes}/${PASSES} · netherRift ${okN} · wraith ${okH} · item ${okI} · possess ${okP}`);
  }

  // ── ⑥ 1×1 开缝**不消费裂隙流**（同种子双世界比对）────────────────
  //    什么故障让它变红：`openRifts` 的洗牌循环被改成无条件执行（例如
  //    `for (i = sites.length; i > 0; i -= 1)`），或 1×1 的站点过滤把格子去重成 0。
  //    这条是 E 包在 longrun 里敢「常年开幽冥缝」的**唯一**依据：
  //    它保证上界缝的位置与「不开幽冥缝」时逐字相同（「不扰动随机流」的可数形态）。
  {
    const a = makeThreeRealmWorld(4242);
    const b = makeThreeRealmWorld(4242);
    // 找一个「凡间可站 ∩ 幽冥可站」的格（1×1 缝口必须同时满足两者）。
    let tx = -1; let ty = -1;
    outer2: for (let y = 5; y < a.h - 5; y += 1) {
      for (let x = 5; x < a.w - 5; x += 1) {
        const i = y * a.w + x;
        if (a.isWalkable(i) && netherWalkable(a.nether, i)) { tx = x; ty = y; break outer2; }
      }
    }
    const resA = openRifts(a, { x0: tx, y0: ty, x1: tx, y1: ty }, 'nether');
    // 两条世界各自抽**下一个**裂隙流的值：若开缝消费了流，两者会错开。
    const ra = riftRngFor(a);
    const rb = riftRngFor(b);
    const va = ra(); const vb = rb();
    check('★ 1×1 开缝**不消费裂隙流**：开过幽冥缝的世界，下一个裂隙流值与没开的世界**逐位相同**',
      resA.opened === 1 && tx >= 0 && va === vb,
      `opened=${resA.opened} · 缝口 (${tx},${ty}) · 下一签 ${va} vs ${vb}`);
  }

  // ── ⑦ 反向对照：**上界**缝跑满一生，四支账本恒 0 ────────────────
  //    与 F8④ / F9⑧ / F10⑧ / F11⑧ 对称。什么故障让它变红：
  //    `stepRifts` 的目标位面分流被写反（上界缝也跑 `stepNetherRift`）⇒
  //    上界缝会凭空吞人、吐鬼、漏物、夺舍。
  {
    const w = mkJointWorld(4242);
    stockRift(w);
    w.rifts[0].targetPlane = 'upper';
    runWorld(w, 200 * RIFT_PERIOD_DAYS, ADVANCE_PERIODS.nether, { nether: false });
    const pl = w.nether.popLog || {};
    const leaked = netherItemStats(w.nether).leakedOut;
    check('★ 反向对照：**上界**缝跑满一生，四支账本（跌入 / 爬出 / 漏物 / 夺舍）恒 0',
      (pl.fellIn || 0) === 0 && (pl.climbedOut || 0) === 0 && leaked === 0
      && (pl.possessedOut || 0) === 0 && (w.possessionLog.crossPlane || 0) === 0,
      `fellIn=${pl.fellIn || 0} climbedOut=${pl.climbedOut || 0}`
      + ` leakedOut=${leaked} possessedOut=${pl.possessedOut || 0}`);
  }

  // ── ⑧ 源码结构：三支效果函数**零 rng**（F11⑤ 已覆盖 `possess*` 那一支）──
  //    什么故障让它变红：有人为了「公平」在选容器 / 选物品时加了 `rng()`——
  //    那会让「同种子同一天」的结果依赖**这条流之前被抽过几次**（跨世界不可复现），
  //    而且会移动凡间主随机流（铁律一）。
  for (const fn of ['fallIntoNether', 'climbOutToMortal', 'leakNetherItem']) {
    const body = fnBodyOf(RIFT_SRC, fn);
    check(`★ 源码结构：\`${fn}\` **零 rng**（判定节奏才抽签，效果本身不抽）`,
      body.length > 0 && !/\brng\s*\(/.test(body) && !body.includes('Math.random'),
      `命中 ${(body.match(/\brng\s*\(/g) || []).join('/') || '无'}`);
  }
}

// ══════════════════════════════════════════════════════════════════
// F13 · 跨界动作「在两边发生」（D8-E）
// ══════════════════════════════════════════════════════════════════
//
// 蓝图原文：「不要新造任何跨界概率。**只在已经成功完成转移以后**发事件。」
// 以及「**成功以后发。** 不是"开始尝试"就发。」
//
// 本组把这两句落成**可判定**的两条：
//   ① **源码结构**：九个跨界效果函数体里，`emitRiftCross(` 都排在**最后一个
//      `return false` 之后**——失败分支全部在前，发射只可能落在成功路径上。
//      （这是「成功才发」唯一能在**不跑世界**时钉住它的形态。）
//   ② **运行时**：三个导出的幽冥转移函数各跑一次「失败（没得转）」与「成功」；
//      失败**一个事件都不发**、成功恰好发**两条**（离开端 + 到达端，各在自己位面）。
//
// 什么故障让它变红：把发射点写在函数开头（"开始尝试"就发）⇒ ①红；
// 落点失败 / cap 满时也发了事件 ⇒ ②红（那是典型的「表现层说谎」）。
//
// ⚠️ 与 F8/F9/F10 同款：直调导出函数、手工摆位、`w.day += RIFT_PERIOD_DAYS` 之外
//    不推进世界（本组根本不需要推进——转移函数是同步的、零 rng 的）。
section('F13. 跨界动作「在两边发生」· 成功才发（D8-E）');
{
  // ── ① 源码结构：发射点排在最后一个 `return false` 之后 ────────────
  const CROSS_FNS = [
    ['rifts', 'leakUpperArtifact'], ['rifts', 'leakUpperHerb'], ['rifts', 'leakToUpper'],
    ['rifts', 'leakGroundArtifactToUpper'], ['rifts', 'fallIntoNether'],
    ['rifts', 'climbOutToMortal'], ['rifts', 'leakNetherItem'],
    ['possess', 'possessMortal'], ['possess', 'hauntMortal'],
  ];
  const POSSESS_SRC2 = stripComments(fs.readFileSync(path.join(INKBOX_SRC, 'sim/possession.js'), 'utf8'));
  const srcOf = (which) => (which === 'rifts' ? RIFT_SRC : POSSESS_SRC2);
  let allHave = true; let allAfter = true;
  const detail = [];
  for (const [which, fn] of CROSS_FNS) {
    const body = fnBodyOf(srcOf(which), fn);
    const at = body.indexOf('emitRiftCross(');
    const lastFail = body.lastIndexOf('return false');
    if (at < 0) { allHave = false; detail.push(`${fn}:未发`); continue; }
    if (!(lastFail >= 0 && at > lastFail)) { allAfter = false; detail.push(`${fn}:位置 ${at}<=${lastFail}`); }
  }
  check('★ 源码结构：九个跨界效果函数**都**发了 rift-cross（六类跨界全覆盖）',
    allHave, detail.length ? detail.join(' ') : '九处齐全');
  check('★ 源码结构：发射点**排在最后一个 `return false` 之后**（成功才发，不是"开始尝试"就发）',
    allAfter, detail.length ? detail.join(' ') : '九处都在失败分支之后');

  // ── ② 运行时：失败不发 / 成功恰好两条 ─────────────────────────────
  const mkRiftWorld = (seed) => {
    const w = makeThreeRealmWorld(seed);
    let rx = 30; let ry = 30;
    outer: for (let y = 5; y < w.h - 5; y += 1) {
      for (let x = 5; x < w.w - 5; x += 1) {
        if (w.isWalkable(y * w.w + x)) { rx = x; ry = y; break outer; }
      }
    }
    w.rifts = [{
      id: 1, x: rx, y: ry, strength: RIFT_BASE_RADIUS, openedDay: 0,
      age: TAU_GROW, closedDay: -1, leaked: 0, crossed: 0, targetPlane: 'nether',
    }];
    w.nextRiftId = 2;
    return w;
  };
  const crossOf = (w) => peekRuntimeEvents(w).filter((e) => e.type === 'rift-cross');

  // 失败：半径内没人 / 没鬼 / 没物 ⇒ 一个 rift-cross 都不该有。
  // ⚠️ 先清空 `world.entities`：`generateWorld({scatter:true})` 可能撒下活人，
  //    万一正好站在缝口半径内，`fallIntoNether` 会**合法地**成功（那是 F8 的
  //    正常路径，不是本组要测的失败）。清空后失败判据才干净。
  const wFail = mkRiftWorld(5150);
  wFail.entities = [];
  const rf = wFail.rifts[0];
  const failRes = [
    fallIntoNether(wFail, rf, RIFT_BASE_RADIUS),
    climbOutToMortal(wFail, rf, RIFT_BASE_RADIUS),
    leakNetherItem(wFail, rf, RIFT_BASE_RADIUS),
  ];
  check('★ 运行时：三条转移**全部失败**（半径内没人 / 没鬼 / 没物）',
    failRes.every((r) => r === false), `返回 ${failRes.join('/')}`);
  check('★ 运行时：失败时**一个 rift-cross 都不发**（表现层不说谎）',
    crossOf(wFail).length === 0, `实测 ${crossOf(wFail).length} 条`);

  // 成功：放进一个人 ⇒ `fallIntoNether` 恰好发两条（凡间 depart + 幽冥 arrive）。
  const wOk = mkRiftWorld(5150);
  const rf2 = wOk.rifts[0];
  wOk.entities = [];
  const person = initEntity({
    id: 7001, sp: SPECIES.HUMAN, x: rf2.x + 0.5, y: rf2.y + 0.5, tx: rf2.x, ty: rf2.y,
    vx: 0, vy: 0, hp: 10, maxHp: 10, age: 20, lifespan: 80, name: '凡人7001',
    kills: 0, relations: new Map(), techniques: [], artifacts: [],
    village: 0, faction: 0, clan: 0, gen: 0, state: 'wander', timer: 0, anim: 0, face: 1,
  }, mulberry32(7001));
  wOk.entities.push(person);
  const fellOk = fallIntoNether(wOk, rf2, RIFT_BASE_RADIUS);
  const evs = crossOf(wOk);
  const dep = evs.find((e) => e.data.phase === 'depart');
  const arr = evs.find((e) => e.data.phase === 'arrive');
  check('★ 运行时：成功转移恰好发**两条** rift-cross（离开端 + 到达端）',
    fellOk === true && evs.length === 2, `转移=${fellOk} · 事件=${evs.length}`);
  check('★ 运行时：离开端在**凡间**、到达端在**幽冥**（两边都在发生）',
    !!dep && dep.plane === 'mortal' && !!arr && arr.plane === 'nether'
    && dep.data.kind === 'person' && arr.data.fromPlane === 'mortal'
    && arr.data.toPlane === 'nether',
    dep && arr ? `${dep.plane}/${dep.data.phase} · ${arr.plane}/${arr.data.phase}` : '缺事件');
  check('★ 运行时：`fromKey` 用稳定 key（`mortal:<id>`），不依赖名字做身份',
    !!dep && dep.data.fromKey === 'mortal:7001', dep ? String(dep.data.fromKey) : '无');
}

console.log(`\n${'='.repeat(64)}`);
if (failures === 0) {
  console.log('全部通过 ✓ · 三界生态不变量成立');
  process.exit(0);
} else {
  console.log(`${failures} 项未通过 ✗`);
  process.exit(1);
}
