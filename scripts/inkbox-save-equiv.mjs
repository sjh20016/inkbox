#!/usr/bin/env node
// 水墨沙盒 · 存读档等价测试
//
// 迁移修仙系统时最容易漏的一环，是「新状态没写进存档」：一存一读，
// 境界、灵根、道途、关系网、灵脉全丢，修士退化成凡人，宗门账本直接崩。
// 这个脚本逐字段比对读档前后的世界，把「到底哪一项没存」指出来。
//
// 判定标准分两层（原因见 src/inkbox/io/save.js 头注释）：
//   硬要求 —— 读档瞬间结构完整：除地形层的量化误差与 tick 内一次性标记
//             （_justAwakened）外，逐字段一致；
//   可接受 —— 继续演化后轨迹缓慢分叉，量级与 7.6e-6 的量化误差相符。
//
// ── 一条比「逐字段一致」更要紧的规矩：判据看的是**键**，不是值 ──
//
// 读档侧的兜底 `data.X || 默认值` 会把「serialize 根本没写 X」伪装成
// 「X 存了默认值」——两边读出来一模一样，逐字段比对全绿，而字段其实丢了。
// 这个坑本项目已经踩过两次：`possessionLog`（v6）与 `dead` / `deadLog`（v7）
// 都是「deserialize 有、serialize 没有」，两次都只能靠**查序列化结果的键集**
// 才抓得出来。所以本文件的规矩是：
//   · 世界级字段的清单**从 `Object.keys(serializeWorld(world))` 反推**，
//     不在这里手抄一份——手抄的清单一定会漏，而漏了就是静默绿；
//   · 「这个字段存了没有」一律查**序列化结果的键集**（过一遍 JSON，
//     与真正落盘的 localStorage 字符串同形），不查「读回来等于什么」；
//   · 出现在 world 上、却不在序列化结果里的键 → FAIL（serialize 漏写）；
//   · 出现在序列化结果里、却没接进比对也不在豁免名单里的键 → FAIL（忘了注册）。
// 见第 3 节末尾那四条断言。**一支不会因为漏存而红的等价测试，等于没有。**

// `readFileSync` 只为一件事：从 `src/inkbox/io/save.js` 的源码里**按列名**
// 解析出实体行的列下标（见下面 ENTITY_COL_V6）。不是为了读数据文件。
import { readFileSync } from 'node:fs';

import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { Life } from '../src/inkbox/sim/life.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { busanziRecent } from '../src/inkbox/sim/busanzi.js';
import { DEAD_CAP } from '../src/inkbox/sim/necrology.js';
// 上界（v8）：它是第二个 `World` 实例，要自己造一张挂到凡间 world 上，
// 否则 `serializeWorld` 根本不写 `upper` 块（见下面「挂上界」那一段）。
//
// `deriveUpperSeed` 是**唯一的**种子派生处（`world/planes.js`）。这里 import 它
// 而不是自己写 `seed ^ 0x55505052`——那正是 save.js 文件头点名禁止的第二份真相。
// ⚠️ 但 import 它**不是**为了自己派生一次喂给生成器：`generateUpperWorld` 收的是
// 「凡间原值」，派生在它内部做（`worldgenUpper.js:578`）。这个 import 只用来
// **断言**派生结果对不对（第 6 节 ④⑤）。
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
// 幽冥（v10）：与上界**逐字同形**的第三个独立 `World` 实例。
// `deriveNetherSeed` 与 `deriveUpperSeed` 一样是**唯一的**种子派生处
// （`world/planes.js`）——这里 import 它只用来**断言**派生结果对不对（本节 ③），
// 不是自己派生一次喂给生成器（`generateNetherWorld` 内部自己派生）。
// `createPlanes` 用来钉「魂池不搬家」那条引用相等的契约（本节 ⑤）；
// `NETHER_ID_BASE` 用来钉幽冥实体 id 段的起点（本节 ⑦）。
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import {
  deriveUpperSeed, deriveNetherSeed, createPlanes, NETHER_ID_BASE,
} from '../src/inkbox/world/planes.js';

const SEED = 20260914;
const PRE_YEARS = 120;
const POST_YEARS = 60;
const STEP = 3;

/** 地形层是量化存储的，误差上限 = 1 / 65535 / 2 ≈ 7.63e-6 */
const QUANT_STEP = 1 / 65535;
/**
 * 允许读档后被丢弃的字段：**同 tick 内的一次性标记**，跨 tick 无意义。
 *
 * * `_justAwakened` / `_ascended`：觉醒与飞升当 tick 的标记。
 * * `_lifespan0`（2026-09-21 加）：`life.js` 的 `stepEntity` 在**每个 tick 开头**
 *   写下的**寿元快照**。`diedOfOldAge` 用它把「寿终正寝」与「突破失败砸寿元而死」
 *   分开——后者是 `applyBreakthroughFailure` 重算 `lifespan` 造成的，
 *   在**同一个 tick 内**就会让 `age >= lifespan` 变成真，不修就会被静默算进
 *   `gone` / `natural`。它每个 tick 开头都被重写、且只被**同一 tick 内**的死亡清扫读，
 *   跨存档没有任何意义（实体行是 `save.js` 里的显式位置数组，本来也不写它）。
 *   ⚠️ 注册它是**必须的**：漏注册就会撞红「没有只在一侧存在的字段」那条断言
 *   （实测 `_lifespan0×631`）——那正是这条断言该有的行为，别去放宽它。
 * * `killedBy`（2026-09-22 加）：`life.js` 的 `attack()` 在**致死一击处**盖下的
 *   **凶手快照** `{id, name}`。存在的理由：致死伤害在 `stepEntity` 循环里产生，
 *   而 `onDeath` 是 `step()` 的**另一个**循环（死亡清扫）里调的，那里拿不到凶手，
 *   于是 `recordDeath` 的第 4 个参数一直恒传 `null` ⇒ `core/lore.js:333-336`
 *   那两行「死于【{killer}】之手」的战斗致死文案**从未被选中过**，
 *   每个横死的修士都被印成「寿终正寝」。
 *   它与 `_lifespan0` 同类：**同一 `step()` 内写、同一 `step()` 内被读**，
 *   跨不过 tick。**未注册就撞红是正确行为**——那说明它真的跨了 tick，
 *   而那就是一个必须单独查的真问题，不许靠放宽断言掩盖。
 * * `diedOf`（2026-09-22 加）：各**致死点**盖下的**死因标记**（字符串，
 *   如 `'famine'` / `'fire'` / `'site'` / `'war'` / `'narrated'`）。
 *   存在的理由：`recordDeath` 原来只有「有 killer / 没 killer」二元选择，
 *   于是饿死、烧死、天劫劈死、秘境打死、战殁**只要没盖 killer 就一律印成
 *   「寿终正寝」**。`diedOf` 让清扫里的 `recordDeath` 选对池子
 *   （灾劫类走 `deathOther`，真寿终走 `deathNatural`）。
 *   它与 `killedBy` 同类：**同一 `step()` 内写、同一 `step()` 内被读**，
 *   跨不过 tick（真寿终那一处还**显式传 `null`**，不看残留的 `diedOf`）。
 * * `_deathRecorded`（2026-09-22 加）：`recordDeath` 的**去重标记**（布尔）。
 *   寿终实体在 `stepEntity` 的 `age >= lifespan` 分支里已记过一条编年史，
 *   而 `step()` 的死亡清扫又会对同一个实体再调一次 `onDeath` ⇒ 原来会记两条。
 *   本标记挡掉第二条。同 tick 内写、同 tick 内读（实体随后即被移出 `world.entities`），
 *   跨存档没有任何意义。
 *
 * ⚠️ 加条目必须写清理由。白名单没有理由就等于**静默忽略**，
 *   而静默忽略会把「已知可接受」和「还没人看过」混成一样。
 */
const VOLATILE = new Set([
  '_justAwakened', '_ascended', '_lifespan0', 'killedBy', 'diedOf', '_deathRecorded',
]);

/**
 * 实体行的列数。**全文件只在这里写一次**——行长度断言、v6 三列断言、
 * 旧档降级都从这里取，不各写一个 60。
 *
 * 演变：v5 是 57 列；v6 在行尾追加了 log / possessedBy / nascentEscapeUsed
 * 三列 → 60；v7 的逝者名录是**世界级**字段，不动实体行（所以仍是 60）。
 * v8 追加 fromMortal / fromSect → 62；**v9（2026-09-22）追加 restUntil → 63**
 * （「养伤」截止日，见 `src/inkbox/sim/life.js` 的 `WOUNDED_REST_DAYS`）。
 * **v11（2026-09-23）追加 soulKind / ghostOf / ghostRancor / ghostDecayDay /
 * soulBind → 68**（幽冥鬼魂与鬼修，契约 `reports/d5/BATCH2-DESIGN.md` §三；
 * 非幽冥实体这五格一律稳定默认值，凡间 / 上界存档形状一格没变）。
 * **D6-3 工程包 D（2026-09-26）追加 possessionScar → 69**（跨位面夺舍 / 附身的
 * 不良状态印记快照，见 `sim/possession.js`；非被夺舍者一律 `null`）。
 *
 * ⚠️ 这个常量与 save.js 里那个实体行数组必须同源。那边加一列而这里没跟上，
 * 「实体行最长长度 == 本常量」那条断言会当场红——这正是它存在的意义。
 * 反过来说，若哪天要动这个数，**先去 save.js 数一遍列**，别只改这里。
 */
const ENTITY_COLUMNS = 69;
/**
 * 从 `src/inkbox/io/save.js` 的源码里，把 `world.entities.map((e) => [ … ])`
 * 这个**实体行数组**的顶层元素表达式逐个切出来（注释剥掉，字符串保留）。
 *
 * 为什么要解析源码，而不是继续写 `ENTITY_COLUMNS - 3 / -2 / -1`：
 * 那两个减法**假设 v6 三列一直在行尾**。v8 在它们**后面**又追加了
 * `fromMortal` / `fromSect` 两列之后，这个假设就悄悄失效了——
 * `62 - 3 = 59` 指的是 `nascentEscapeUsed` 那一列，不是 `log`。
 * 更坏的是这种错**不报错**：v5 降级那条断言只会把行截到错误的长度，
 * 而截出来的 `log` 恰好是非空的真实数据，「有值」看起来一切正常，
 * 只是值是错的。减法写法的根本毛病是「行尾再长东西」这件事本身
 * 不触发任何警报——正是它这次让测试红在一个离真因很远的地方。
 *
 * 解析源码则天然跟着列走：谁在行尾加列都无所谓，只要这三个列名还在，
 * 下标就永远对。**代价**是它依赖 save.js 的行数组写法——所以解析失败
 * 一律**抛错**（不退回某个默认值）：宁可当场炸，也不放一个悄悄错位的
 * 下标过去（那会让「读档后的人悄悄换一副关系网」这种错静默通过）。
 *
 * @returns {string[]} 每个元素是数组里一个顶层列的表达式文本
 */
function parseEntityColumnExprs() {
  const src = readFileSync(new URL('../src/inkbox/io/save.js', import.meta.url), 'utf8');
  const marker = 'entities: world.entities.map((e) => [';
  const at = src.indexOf(marker);
  if (at < 0) {
    throw new Error(
      'save.js 里找不到实体行数组的起点（`entities: world.entities.map((e) => [`）。'
      + 'save.js 的写法变了，请同步更新本文件的 parseEntityColumnExprs。',
    );
  }
  const exprs = [];
  let cur = '';
  let depth = 0;
  let i = at + marker.length;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') {              // 行注释：整段剥掉
      while (i < src.length && src[i] !== '\n') i += 1;
      cur += ' ';
      continue;
    }
    if (ch === '/' && next === '*') {              // 块注释：整段剥掉
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      cur += ' ';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {  // 字符串 / 模板串：原样保留
      const quote = ch;
      cur += ch;
      i += 1;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') { cur += src[i]; i += 1; }
        cur += src[i]; i += 1;
      }
      cur += quote; i += 1;
      continue;
    }
    if (ch === '[' || ch === '(' || ch === '{') { depth += 1; cur += ch; i += 1; continue; }
    if (ch === ']' || ch === ')' || ch === '}') {
      if (ch === ']' && depth === 0) break;        // 行数组的收尾
      depth -= 1; cur += ch; i += 1; continue;
    }
    if (ch === ',' && depth === 0) { exprs.push(cur.trim()); cur = ''; i += 1; continue; }
    cur += ch; i += 1;
  }
  exprs.push(cur.trim());
  // 行尾那个尾随逗号会切出一个空元素，滤掉
  return exprs.filter((s) => s.length > 0);
}

const ENTITY_SOURCE_EXPRS = parseEntityColumnExprs();

/**
 * 从切出来的表达式里，按**列名**定位一列的下标（匹配 `e.<name>` 属性访问）。
 *
 * 找不到、或找到不止一处 → 抛错。「不止一处」也要抛：那说明这个匹配方式
 * 不足以唯一定位，继续用会张冠李戴。
 */
function entityColumnIndex(name) {
  const re = new RegExp(`\\be\\.${name}\\b`);
  const hits = [];
  for (let i = 0; i < ENTITY_SOURCE_EXPRS.length; i += 1) {
    if (re.test(ENTITY_SOURCE_EXPRS[i])) hits.push(i);
  }
  if (hits.length !== 1) {
    throw new Error(
      `在 save.js 的实体行里定位列 \`${name}\` 时命中 ${hits.length} 处`
      + `（应恰好 1 处，下标 [${hits.join(', ')}]）。`
      + '要么列名改了，要么这个匹配方式不再唯一——请同步更新本文件的 entityColumnIndex。',
    );
  }
  return hits[0];
}

/**
 * v6 追加的三列（`log` / `possessedBy` / `nascentEscapeUsed`）的**真实下标**。
 * **从 save.js 源码按列名解析**，不是从行尾倒着数。
 *
 * 当年它们确实在行尾（row[57..59]），v8 又在它们后面追加了
 * `fromMortal` / `fromSect`（row[60..61]），「在行尾」这个前提就没了。
 * 用 `ENTITY_COLUMNS - 3 / -2 / -1` 会算出 59 / 60 / 61——那是 v8 两列
 * 加 `nascentEscapeUsed`，**全错**。所以改成按名字解析：谁再加列都不会错位。
 *
 * 由本节末尾两条自检守着（下标必须连续递增、必须在行内，且列数与源码同源）。
 */
const ENTITY_COL_V6 = Object.freeze({
  log: entityColumnIndex('log'),
  possessedBy: entityColumnIndex('possessedBy'),
  nascentEscapeUsed: entityColumnIndex('nascentEscapeUsed'),
});

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  else { failures += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(t) { console.log(`\n${t}`); }

/**
 * 逐个字段比对两个普通对象，返回「字段名: 左值 ≠ 右值」的说明串（全同则返回空串）。
 *
 * 为什么不直接 `JSON.stringify(a) === JSON.stringify(b)` 了事：
 * 那样断言一红只能看到「两坨 JSON 不一样」，还得自己肉眼找是哪一格。
 * 这一支测试的全部价值就在于**把到底哪一项没存指出来**，所以差异要按字段摊开。
 */
function diffFields(a, b, keys) {
  const bad = [];
  for (const k of keys) {
    const va = a ? a[k] : undefined;
    const vb = b ? b[k] : undefined;
    if (JSON.stringify(va) !== JSON.stringify(vb)) {
      bad.push(`${k}: ${JSON.stringify(va)} ≠ ${JSON.stringify(vb)}`);
    }
  }
  return bad.join(' | ');
}

/**
 * 两组实体的**逐字段**比对（凡间与上界共用同一份机制，不各写一套）。
 *
 * 键集取**并集**（`Object.keys(a) ∪ Object.keys(b)`），绝不手抄字段清单。
 * 为什么必须取并集：只遍历原实体那一侧的话，「压根没被建出来的键」永远测不到——
 * `heritageM` 就是这么溜过去的：`initEntity` 漏了一行初始化，实体身上根本没有
 * 这个键，于是它既不在 a 的键里、也不在 b 的键里，逐字段比对一路全绿，而存档
 * 那边写的是 `e.heritageM || null`，读回来就成了 `null`（原世界是 `undefined`）
 * ——**同一个世界，两种形状**。最后是冒烟测试里那八列写死的列名把它抓出来的。
 * 教训：逐字段比对只能证明「有的东西对得上」，证明不了「该有的东西都在」。
 *
 * `relations` 跳过：它是 Map，逐条比对在别处单独做（键是对方 id，比对象本身没意义）。
 * `VOLATILE` 跳过：那几样是运行期的临时标记，不入档也不该入档。
 *
 * ⚠️ 抽成函数是为了让**上界**那 12 人复用同一套机制（第 6 节 ④c）。两份实现
 * 迟早各自演化，然后其中一份悄悄不再发现漏存——那正是本文件最怕的事。
 *
 * @param {Array} liveList  原世界（活对象）的实体数组
 * @param {Array} cloneList 读档后的实体数组
 * @returns {{diffs: Map<string,number>, onlyLive: Map<string,number>,
 *            onlyClone: Map<string,number>, missingIds: Array<number>}}
 *   · `diffs`      —— 键 → 「值对不上」的实体数
 *   · `onlyLive`   —— 只在原世界存在的键 → 实体数（漏存 / 漏还原）
 *   · `onlyClone`  —— 只在读档后存在的键 → 实体数（凭空长出来的键）
 *   · `missingIds` —— 在存档里整个丢掉的实体 id
 */
function compareEntityFields(liveList, cloneList) {
  const byId = new Map(cloneList.map((e) => [e.id, e]));
  const diffs = new Map();
  const onlyLive = new Map();
  const onlyClone = new Map();
  const missingIds = [];
  for (const a of liveList) {
    const b = byId.get(a.id);
    if (!b) { missingIds.push(a.id); continue; }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (VOLATILE.has(k) || k === 'relations') continue;
      const hasA = Object.prototype.hasOwnProperty.call(a, k);
      const hasB = Object.prototype.hasOwnProperty.call(b, k);
      if (hasA !== hasB) {
        const side = hasA ? onlyLive : onlyClone;
        side.set(k, (side.get(k) || 0) + 1);
        continue;
      }
      const va = a[k]; const vb = b[k];
      if (typeof va === 'number') {
        if (va !== vb) diffs.set(k, (diffs.get(k) || 0) + 1);
      } else if (typeof va === 'object' && va !== null) {
        if (JSON.stringify(va) !== JSON.stringify(vb)) diffs.set(k, (diffs.get(k) || 0) + 1);
      } else if (va !== vb) diffs.set(k, (diffs.get(k) || 0) + 1);
    }
  }
  return { diffs, onlyLive, onlyClone, missingIds };
}

/**
 * **设计内**的非有限数：路径前缀 → 理由。前缀写法与 `findNonFinite` 的归并口径一致
 * （所有数字下标折成 `[]` / `<>`）。
 *
 * ⚠️ 两条纪律：
 *   ① **只能放哨兵，不能放累加器。** 累加器上出现 `NaN` 永远是 bug（`undefined + 1`），
 *      一个都不许进这张表；
 *   ② **每一条都要写清为什么合法、并指明代码位置。** 白名单没有理由就等于「静默忽略」，
 *      而静默忽略正是本项目最怕的那件事——它把「已知可接受」和「还没人看过」混成一样。
 *
 * 目前只有一条：寻路代价层用 `Infinity` 表示「不可通行」
 * （`sim/territory.js:55` 的公式说明、`:82` 的 `!info.walk` 分支），
 * Dijkstra 洪泛靠它永不松弛——所以那一层整层是 `Infinity` 是**正常**的。
 *
 * 这张表由下面「白名单里没有已失效的条目」那条反向断言守着：
 * 哪天地形或公式改了、`_terrCost` 不再产生 `Infinity`，那条会红，逼人来删这一行。
 * 「烂在原地的白名单」比「没有白名单」更坏——它让后来的人以为那里确实还需要豁免。
 */
const NON_FINITE_ALLOWED = new Map([
  ['world._terrCost[]', '寻路代价层的「不可通行」哨兵（sim/territory.js:55 / :82）'],
]);

/**
 * 递归扫描**活对象**里的非有限数（NaN / ±Infinity），**按路径前缀归并**后返回。
 *
 * ⚠️ 必须在任何 `JSON.stringify` **之前**跑，不能去检查序列化后的字符串。
 * 理由：`JSON.stringify(NaN)` 会**静默变成 `null`**，不报错。
 * 而本文件两侧都走 `JSON.parse(JSON.stringify(...))`——这本身是**对的**，
 * 因为那正是真实存档边界；但它对「非有限数」这一类**天生免疫**：
 * 两侧被同一个静默转换污染，怎么比都相等，逐字段比对一路全绿。
 *
 * 而**行为是分叉的**：`NaN + 1 = NaN`（累加器永久坏掉，这个地点再也统计不出人）
 * vs `null + 1 = 1`（计数器复活，从零重新开始）。
 * 同一个存档，在「接着玩」与「读回来再玩」两条路上走出不同历史——
 * 这正是本文件最该抓、却最容易漏的一类。
 *
 * 这条守的是**一整类**：凡是「累加器 / 数值字段在某条构造路径上忘了给初值」
 * 的都会这样烂——`heritageM` / `log` / `lastBeastDay` / `incarnation` 已经栽过几次，
 * `sites[i].visits` 是最新的一例（飞升者遗留洞府走 cultivation.js 的 addSite 时漏了）。
 *
 * ── 为什么**按前缀归并**，而不是「只报前 N 条」（本版才改的） ──
 * 旧版有一个 `limit = 20` 的提前退出，本意是「别把一屏刷满」。实测同时踩了两个坑：
 *   · **误报**：`world._terrCost` 是**整张地图那么大**的 `Float32Array`
 *     （中堂 51840 格），而它用 `Infinity` 表示「不可通行」——是设计内的哨兵，
 *     整层 Infinity 完全正常。旧版把它当坏数据报了出来。
 *   · **遮蔽**（更严重）：那 20 个名额被 `_terrCost` 一口气吃光，扫描**根本走不到 `sites`**。
 *     也就是说，这条**为了抓 `sites[i].visits = NaN` 而写出来**的断言，
 *     恰恰被 `_terrCost` 挡住、看不见自己该抓的东西。
 *     一个 20 元素的坏数组能盖住整个世界——这不是「少报」，是**断言失效**。
 * 归并之后：51840 个 `Infinity` 合成一条 `world._terrCost[] × 51840`，
 * 额度再也不会被单一字段吃掉；并且**取消了提前退出**（全量收集，不再截断）。
 *
 * @param {*} root 起点（传 `world` 或 `clone`）
 * @param {string} label 路径前缀
 * @returns {Map<string, {count:number, first:string, value:string}>} 前缀 → 命中信息
 */
function findNonFinite(root, label) {
  const hits = new Map();
  const seen = new WeakSet();
  const note = (path, value) => {
    // 把**所有**数字下标折成 `[]` / `<>`：于是「整层都是 Infinity」只占一条，
    // 而 `world.entities[3].log[7]` 也归到 `world.entities[].log[]`——
    // 同一类毛病跨多个实体时不会刷成几百行。精确路径留在 `first` 里。
    const prefix = path.replace(/\[\d+\]/g, '[]').replace(/<\d+>/g, '<>');
    const hit = hits.get(prefix);
    if (hit) { hit.count += 1; return; }
    hits.set(prefix, { count: 1, first: path, value: String(value) });
  };
  const walk = (value, path) => {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) note(path, value);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    // 环（world 上的临时缓冲 / 共享的常量对象）只走一次
    if (seen.has(value)) return;
    seen.add(value);
    // 地形层那些 Float32Array / Uint8Array 也一起查：
    // 一个 NaN 混进地形层，会比一个坏掉的 visits 更难查
    if (ArrayBuffer.isView(value)) {
      for (let i = 0; i < value.length; i += 1) {
        if (!Number.isFinite(value[i])) note(`${path}[${i}]`, value[i]);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) walk(value[i], `${path}[${i}]`);
      return;
    }
    if (value instanceof Map) {
      value.forEach((v, k) => walk(v, `${path}<${String(k)}>`));
      return;
    }
    if (value instanceof Set) {
      let i = 0;
      value.forEach((v) => { walk(v, `${path}<${i}>`); i += 1; });
      return;
    }
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) walk(value[keys[i]], `${path}.${keys[i]}`);
  };
  walk(root, label);
  return hits;
}

/** 把 `findNonFinite` 的结果摊成一行可读报告（命中数降序，最吵的排前面）。 */
function formatNonFinite(hits) {
  return [...hits.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([prefix, h]) => `${prefix} = ${h.value} × ${h.count}（例：${h.first}）`)
    .join(' | ');
}

/** 按白名单把命中分成「设计内哨兵」与「真问题」两堆。 */
function splitNonFinite(hits) {
  const offending = new Map();
  const allowed = new Map();
  for (const [prefix, hit] of hits) {
    (NON_FINITE_ALLOWED.has(prefix) ? allowed : offending).set(prefix, hit);
  }
  const sum = (m) => [...m.values()].reduce((s, h) => s + h.count, 0);
  return { offending, allowed, offendingCount: sum(offending), allowedCount: sum(allowed) };
}

function run(world, life, years) {
  for (let y = 0; y < years; y += 1) {
    for (let d = 0; d < 360; d += STEP) { world.day += STEP; life.step(STEP); }
  }
}

console.log('水墨沙盒 · 存读档等价测试');
console.log('='.repeat(56));

const world = generateWorld({ preset: WORLD_PRESETS.medium, seed: SEED, scatter: true });

// ── 挂上界（v8）────────────────────────────────────────────
//
// ⚠️ **这一步必须自己来做，不能指望 `generateWorld`**：上界的正规接线在
// `main.js:238`（`attachUpper` 里 `mortal.upper = upper`），而测试直接调
// `generateWorld`，所以 `world.upper` 本来是 `undefined`。
// 后果很隐蔽：`serializeWorld` 的写法是「存在才写」（`...(world.upper ? {upper: …} : {})`），
// 于是**今天的测试里 payload 根本没有 `upper` 键**，而 `deserializeWorld`
// 无论有没有 `upper` 都会补一个出来——所以 `clone.upper` 一直是个
// 「就地生成、没人比过」的世界，v8 那条新路径**一格都没被测到**。
//
// 照 main.js 的做法传**凡间种子**（`world.seed`）：`generateUpperWorld`
// 的 `seed` 参数契约是凡间种子，它内部自己派生（`worldgenUpper.js:578`）。
// 这里若手滑传 `deriveUpperSeed(world.seed)`，异或自逆会让上界退回凡间种子
// ——正是本文件下面 ② 那条断言要防的回归。
const upper0 = generateUpperWorld({ preset: WORLD_PRESETS.medium, seed: world.seed });
world.upper = upper0;

// ── 挂幽冥（v10）────────────────────────────────────────────
//
// 与上界**逐字同形**：幽冥是第三个独立 `World` 实例，凡间 world 上只挂一个引用
// `world.nether`。正规接线在 `main.js`，而测试直接调 `generateWorld`，
// 所以 `world.nether` 本来是 `undefined`——`serializeWorld` 的「存在才写」
// （`...(world.nether ? {nether: …} : {})`）于是根本不写 `nether` 块，
// 而 `deserializeWorld` 无论有没有都会补一个出来。与上界当年一模一样：
// v10 那条新路径**一格都没被测到**，所以这一步必须自己来做。
//
// 照 main.js 的做法传**凡间种子**（`world.seed`）：`generateNetherWorld`
// 的 `seed` 参数契约是凡间种子，它内部自己派生（`worldgenNether.js:608`）。
// 这里若手滑传 `deriveNetherSeed(world.seed)`，异或自逆会让幽冥退回凡间种子
// ——正是本节 ③ 那条断言要防的回归。
const nether0 = generateNetherWorld({ preset: WORLD_PRESETS.medium, seed: world.seed });
world.nether = nether0;

// 存档前的 temp / moist 快照。这两层**不进存档**（上界只存 6 层地形），
// 读档时是照 seed 重新生成拿回来的——所以这份快照是本文件里
// **唯一能观测到「种子派生正确」的探针**（理由见第 6 节 ②）。
const UPPER_TEMP_BEFORE = Float32Array.from(upper0.temp);
const UPPER_MOIST_BEFORE = Float32Array.from(upper0.moist);

const life = new Life(world, mulberry32(SEED ^ 0xa5a5a5a5));
life.processPendingSpawns();
section(`1. 演化 ${PRE_YEARS} 年`);
run(world, life, PRE_YEARS);

// ── 空间裂缝测试夹具：**存档前**往活世界灌三条裂缝（阶段三）──────
//
// 为什么必须灌在「存档前」、而不是像大战/夺舍那样去改序列化结果的副本：
// 裂缝是**世界级**数组，`serializeWorld(world)` 会照 `world.rifts` 现写。
// 灌在存档前，走的就是**真实的写→读**这条路（而不是只测读侧），
// 于是第 3 节的「世界级字段逐键一致」会自动把它比上（键集从 payload 反推）。
//
// 为什么不用「跑出来的」：裂缝由玩家开视界触发（规格 §4.1），一次 120 年的
// 跑动里可能一条都没有。靠运气撑起来的判据会在调参后静悄悄不再测任何东西。
// 所以直接灌三条确定的数据，覆盖不同状态：还开着（closedDay=-1）、已闭合
// （closedDay>=0）、不同 leaked / crossed / strength。
// ⚠️ `age` 是第 9 个契约字段（2026-09-19 阶段四新增），**夹具必须带上它**：
//    活世界的缝若没有 `age` 键，而读档产物有（`save.js` 写 `num(r.age, 0)`），
//    第 3 节那条「世界级字段逐键一致」就会红在 `rifts` 上 —— 那是**夹具过期**，不是产品 bug。
// ⚠️ `age` 的值刻意**不等于** `world.day - openedDay`（绝对时间的估算值）：
//    这样万一读档侧哪天改回「按绝对时间兜底算 `age`」，下面第 6 节 ⑤ 会立刻红。
//    （`age` 记的是「**视界开启期间**累积的天数」，取决于玩家历次开关视界的历史，
//     与绝对经过天数**没有**换算关系 —— 这正是它必须进档、不能现算的理由。）
// ⚠️ `targetPlane` 是第 10 个契约字段（2026-09-24 · D6-2 工程包 B2 新增），
//    **夹具必须带上它，且两个值都要出现**：只带 `'upper'` 的话，「读侧把
//    `'nether'` 写丢 / 写成 `'upper'`」这个坏法在夹具里**测不出来**
//    （两侧都是 `'upper'`，怎么比都相等）。所以 #3 刻意是幽冥缝。
//    什么故障会让这条变红：写侧漏写 `targetPlane`、读侧兜底写反、
//    或有人把归一写成 `=== 'upper' ? 'upper' : 'nether'`（那会把老档全判成幽冥缝）。
const RIFTS_FIXTURE = [
  { id: 1, x: 84, y: 52, strength: 2.0, openedDay: 10240, age: 3000, closedDay: -1, leaked: 2, crossed: 1, targetPlane: 'upper' },
  { id: 2, x: 12, y: 7, strength: 3.4, openedDay: 9000, age: 500, closedDay: 11000, leaked: 0, crossed: 0, targetPlane: 'upper' },
  { id: 3, x: 200, y: 130, strength: 1.1, openedDay: 12000, age: 7777, closedDay: -1, leaked: 1, crossed: 0, targetPlane: 'nether' },
];
world.rifts = RIFTS_FIXTURE.map((r) => ({ ...r }));
world.nextRiftId = 4;
world.riftLog = { opened: 5, closed: 2, leaked: 3, crossed: 1, lost: 4 };

// ── 凡间鬼影测试夹具（D6-3 工程包 B）──────────────────────────
//
// 与 `RIFTS_FIXTURE` 同理：**存档前**往活世界灌两只鬼，走真实的写→读，
// 于是第 3 节那条「世界级字段逐键一致」（键集从 payload 反推）会自动把它比上。
// 为什么不用「跑出来的」：鬼由「幽冥缝抽签」产出（一次 120 年跑动里可能一只都没有），
// 靠运气撑起来的判据会在调参后**静悄悄不再测任何东西**。
//
// ⚠️ **键集必须与 `sim/wraiths.js` 的 `WRAITH_TEMPLATE` 完全一致（22 键）**：
//    少一个键，读侧 `restoreWraiths` 会补默认值，第 3 节那条「逐键一致」就会
//    红在 `wraiths` 上——那是**夹具过期**，不是产品 bug（同上面 `age` 的警告）。
// ⚠️ 值刻意**取得与模板默认值都不同**（id 用幽冥段 2_000_000+、level 一 0 一 1、
//    `dissolveDay` 各不同、`ghostOf` 一 null 一快照对象）：两侧全用默认值时，
//    「写侧漏写某个字段」这个坏法在夹具里**测不出来**（两侧都是默认值，怎么比都相等）。
const WRAITHS_FIXTURE = [
  {
    id: 2000007, sp: 'ghost', x: 41.5, y: 22.5, tx: 44.5, ty: 25.5, vx: 0, vy: 0,
    hp: 60, maxHp: 60, level: 0, soulKind: 'ghost', ghostOf: null,
    name: '孤魂', rancor: 0, fromRiftId: 3, climbedDay: 12000, dissolveDay: 13080,
    state: 'wander', timer: 17, anim: 3.5, face: 1,
  },
  {
    id: 2000031, sp: 'ghost', x: 88.5, y: 61.5, tx: 90.5, ty: 63.5, vx: 0, vy: 0,
    hp: 60, maxHp: 60, level: 3, soulKind: 'ghostCultivator',
    ghostOf: {
      ref: 'mortal:512', name: '崔无咎', level: 6, root: '幽冥灵根',
      sectName: '玄阴宗', deathDay: 11800, route: 'ghost', incarnation: 2,
    },
    name: '崔无咎', rancor: 4, fromRiftId: 3, climbedDay: 11900, dissolveDay: 12980,
    state: 'wander', timer: 42, anim: 9.25, face: -1,
  },
];
world.wraiths = WRAITHS_FIXTURE.map((w) => ({ ...w, ghostOf: w.ghostOf ? { ...w.ghostOf } : null }));
world.wraithLog = { dissolved: 7 };

// ── 幽冥物品测试夹具（D6-3 工程包 C）──────────────────────────
//
// 与 `RIFTS_FIXTURE` / `WRAITHS_FIXTURE` 同理：**存档前**往活世界灌两件幽冥物品，
// 走真实的写→读，于是第 3 节那条「世界级字段逐键一致」（`artifactLog` 整对象）
// 与第 6b 节新增的 ⑧ 会自动把它比上。
//
// 为什么不用「跑出来的」：幽冥物品的三条来源（自生 / 跌入带物 / 缝漏）全部要经
// `advanceWorld` 那条链路，而本文件的 `run()` 只驱动 `life.step`——一次 120 年的
// 跑动里可能一件都没有。靠运气撑起来的判据会在调参后**静悄悄不再测任何东西**
// （同 `rifts` / `wraiths` 的夹具理由）。
//
// ⚠️ **键集必须与 `netherLife.js` 的 `spawnNetherItem` 产物完全一致（19 键）**：
//    少一个键，读侧会补默认值 / 留 undefined，⑧ 的「逐字段等价」就会红在
//    `nether.artifacts` 上——那是**夹具过期**，不是产品 bug（同 `age` 的警告）。
// ⚠️ 两件刻意**一件带 `technique`、一件不带**：带的那件来自幽冥自生 / 缝漏，
//    不带的那件来自「跌入者随身带下来的凡间法宝」——两种形状都要往返得住。
// ⚠️ id 用**幽冥自己的编号**（从 1 起），**不是**幽冥实体那个 2_000_000 段：
//    法宝 id 是**世界内**编号（铁律三：跨世界时由 `rifts.js` 重赋，id 从不跨界）。
//    值刻意与默认值都不同（名字 / 槽位 / 品阶 / 品质 / 耐久 / 伤痕 / history 全非默认），
//    否则「写侧漏写某个字段」这个坏法在夹具里测不出来（两侧都是默认值，怎么比都相等）。
const NETHER_ITEMS_FIXTURE = [
  {
    id: 1, slot: '法宝', tier: 1, quality: 2, name: '河官笔',
    durability: 100, maxDurability: 100, scars: 0,
    forgedDay: 12000, forgedByName: null, ownerId: 0, ownerName: null,
    heldSince: 12000, spirit: null, history: [[12000, 'forged', null]], lostDay: 12000,
    x: 41.5, y: 22.5, technique: { name: '玄阴诀', note: '引阴气入体，寒而不僵' },
  },
  {
    id: 2, slot: '武器', tier: 0, quality: 1, name: '残剑', durability: 63, maxDurability: 100,
    scars: 2, forgedDay: 11000, forgedByName: '崔无咎', ownerId: 0, ownerName: null,
    heldSince: 11900, spirit: null, history: [[11000, 'forged', '崔无咎']], lostDay: 11900,
    x: 88.5, y: 61.5, technique: null,
  },
];
world.nether.artifacts = NETHER_ITEMS_FIXTURE.map((a) => ({
  ...a,
  technique: a.technique ? { ...a.technique } : null,
  history: a.history.map((h) => h.slice()),
}));
world.nether.nextArtifactId = 3;
// 四条物品流水：与池子**自洽**（`alive === spawned + fellIn − leakedOut − decayed`
// ⇒ 2 === 3 + 1 − 1 − 1）。写全非零值才能把「漏写某一键」逼出来
// （两侧都取默认 0 的话，怎么写都相等）。
world.nether.popLog = Object.assign(world.nether.popLog || {}, {
  itemsSpawned: 3, itemsFellIn: 1, itemsLeakedOut: 1, itemsDecayed: 1,
});
// 凡间侧的两个新键（与既有 `riftIn` / `riftOut` **同款**：`World` 构造器不带它们，
// 跨位面事件发生时才惰性添加）。写非零值 ⇒ 第 3 节的「世界级字段逐键一致」
// 会连带把 `artifactLog` 整对象比上（`JSON.stringify` 口径）。
world.artifactLog.netherIn = 4;
world.artifactLog.netherOut = 5;

// ── 非有限数：必须在序列化**之前**查活对象 ──────────────────
//
// 这一条不能等第 3 节——`JSON.stringify(NaN)` 会静默变成 `null`，
// 一旦先序列化，NaN 就被洗白了：两侧都是 null，怎么比都相等。
// 所以它是**全文件第一条语义判据**，排在序列化前面（见 findNonFinite 的注释：
// 它守的是「累加器字段在某条构造路径上忘了给初值」这一整类）。
{
  const hits = findNonFinite(world, 'world');
  const { offending, allowed, offendingCount, allowedCount } = splitNonFinite(hits);
  check('world 里没有非有限数（NaN / Infinity）',
    offendingCount === 0,
    offendingCount === 0
      ? `${world.entities.length} 生灵 + ${world.sites.length} 地点 + 地形层全部有限`
        + (allowedCount ? `（另有设计内哨兵 ${allowedCount} 处：${formatNonFinite(allowed)}）` : '')
      : `${offending.size} 类 / ${offendingCount} 处：${formatNonFinite(offending)}`);

  // 反向：白名单里的条目必须**仍然**命中。哪天地形或公式改了、`_terrCost`
  // 不再产生 `Infinity`，这一条会红，逼人来删白名单那一行——
  // 「烂在原地的白名单」比「没有白名单」更坏。
  // 只查活世界这一侧：`clone` 是读档产物，推导缓存（`_terrCost`）未必在那边建起来，
  // 拿它判白名单会得到一个与代码无关的假红。
  const stale = [...NON_FINITE_ALLOWED.keys()].filter((prefix) => !hits.has(prefix));
  check('非有限数白名单里没有已失效的条目', stale.length === 0,
    stale.length
      ? `已失效 ${stale.length} 条：${stale.join(', ')}（哨兵不再出现，请删掉白名单里这一行）`
      : `白名单 ${NON_FINITE_ALLOWED.size} 条全部命中`);

  // 自检：扫描**确实走进了上界**吗？（v8：world 上挂了第二个世界 `world.upper`）
  //
  // 上界是挂在一个键下面的**一整个对象树**。哪天 `findNonFinite` 的递归不再走进
  // 去（比如有人给某个分支加了提前 return、或把 `Object.keys` 那一段改成白名单），
  // 上界里长出 NaN 也不会有任何提示——而这条断言守的正是「累加器字段在某条构造
  // 路径上忘了给初值」那一整类，上界下一阶段要接人口（规格 §2.3），同样会踩。
  //
  // ⚠️ 实测：上界此刻**没有任何非有限数**，`world.upper._terrCost` **不存在**
  //    （上界不跑 territory，那是凡间地盘重算才建的推导缓冲）。
  //    所以 NON_FINITE_ALLOWED 里**不要**加 `world.upper._terrCost[]`——
  //    加了不但没用，还会让上面那条「白名单必须仍然命中」的反向断言变红。
  //    既然没有命中可查，就不能靠「扫出来的结果」证明走到了，只能**种一个哨兵**。
  //
  // 上界没挂上时（`world.upper` 是 undefined）这条自检本身没法做——**直接判红**，
  // 而不是让 `world.upper[probeKey]` 抛一个 TypeError 把后面所有断言一起带走：
  // 那样红是红了，但报的是「读不到 undefined 的属性」，与「上界没挂上」差了十万八千里，
  // 而且第 6 节整节都不会跑。（诊断性优先：这一支测试的全部价值就是**指出是哪一项**。）
  if (!world.upper) {
    check('非有限数扫描确实走进了上界（自检：在上界种一个 NaN 能被捞出来）',
      false, 'world.upper 没挂上 —— 扫描无从走进上界，第 6 节整节也失去意义');
  } else {
    const probeKey = '__eqUpperNonFiniteProbe';
    world.upper[probeKey] = NaN;
    const probeHit = findNonFinite(world, 'world').has(`world.upper.${probeKey}`);
    delete world.upper[probeKey];
    check('非有限数扫描确实走进了上界（自检：在上界种一个 NaN 能被捞出来）',
      probeHit,
      probeHit ? `world.upper.${probeKey} 命中` : '没走到上界 —— 上界里的 NaN 会被静默漏掉');
  }
}

// 序列化**只做一次**，后面所有判据都从它出发。
// `payload` 是 serializeWorld 的返回对象；`payloadJson` 是它过一遍 JSON 之后的形状，
// **与真正落盘的 localStorage 字符串同形**。
//
// ⚠️ 判「键有没有存」一律查 `payloadJson`，不查 `payload`：
// 直接查返回对象的话，`X: undefined` 这种写法 `hasOwnProperty` 为 true、
// 看着「写了」，但 `JSON.stringify` 会把它整个丢掉，落盘后键就没了。
// 查 JSON 之后的形状才能同时抓住「没写」与「写成 undefined」两种。
const payload = serializeWorld(world);
const payloadJson = JSON.parse(JSON.stringify(payload));
const bytes = JSON.stringify(payload).length;
console.log(`  生灵 ${world.entities.length} · 村 ${world.villages.length} · 宗 ${world.factions.length}`
  + ` · 灵脉 ${world.leylines.length} · 地点 ${world.sites.length} · 存档 ${(bytes / 1024).toFixed(0)} KB`);

const clone = deserializeWorld(JSON.parse(JSON.stringify(payload)));

// 读档后那一侧也扫一遍：`deserializeWorld` 自己也可能造出非有限数
// （比如某个 `num(x, fallback)` 的 fallback 被传成 undefined）。
// 注意这条**替代不了**上面那条——若 world 里有 NaN，它序列化后已经是 null，
// clone 这边只会看到一个有限数，扫不出任何东西。
{
  const hits = findNonFinite(clone, 'clone');
  const { offending, allowed, offendingCount, allowedCount } = splitNonFinite(hits);
  check('读档后的世界也没有非有限数',
    offendingCount === 0,
    offendingCount === 0
      // 旧文案是「两侧都是有限数」——**不诚实**：读档侧可能压根没建那个推导缓存，
      // 「没查到」与「查过且有限」是两回事。这里改成只陈述实际扫过的对象。
      ? `读回来的 ${clone.entities.length} 生灵 + ${clone.sites.length} 地点全部有限`
        + (allowedCount ? `（另有设计内哨兵 ${allowedCount} 处：${formatNonFinite(allowed)}）` : '')
      : `${offending.size} 类 / ${offendingCount} 处：${formatNonFinite(offending)}`);
}

// ── 2. 地形层：允许量化误差，但必须在界内 ──────────────────
section('2. 地形层量化误差');
for (const k of ['height', 'water', 'temp', 'moist', 'veg', 'fire', 'riverBase']) {
  let max = 0;
  for (let i = 0; i < world.size; i += 1) max = Math.max(max, Math.abs(world[k][i] - clone[k][i]));
  check(`${k} 误差在量化界内`, max <= QUANT_STEP * 1.01, `最大 ${max.toExponential(2)}`);
}
let qiMax = 0;
for (let i = 0; i < world.size; i += 1) qiMax = Math.max(qiMax, Math.abs(world.qi[i] - clone.qi[i]));
// 灵气层是重算的：灵脉必须先灌进去，否则整层偏低
check('灵气层与灵脉自洽', qiMax <= QUANT_STEP * 2, `最大 ${qiMax.toExponential(2)}`);

// ── 3. 顶层标量 ────────────────────────────────────────────
section('3. 顶层标量');

// ⚠️ 世界级字段的清单**从序列化结果反推**（`Object.keys(payload)`），不手抄。
//
// 手抄清单的教训就在眼前：这里原来写死的是一串十一个标量
// （w/h/seed/…/plane）。`world.dead` / `world.deadLog` 加进存档时，
// 那份清单没人想起来改，于是这两个字段**一条都没被比到**，
// 而整支测试照样全绿——这就是「字段存在 ≠ 字段生效」的又一个变种：
// **新增字段忘了注册，就静默绿**。
//
// 下面这张表是**不参与通用比对**的键，每一个都写明理由。
// 它本身也被断言（本节末尾「未注册键」那条）：出现在 payload 顶层、
// 又不在这里、又没被比到的键，一律 FAIL。
const WORLD_EXEMPT = new Map([
  ['v', '存档版本号：只用来选降级分支，不参与语义等价'],
  ['app', '客户端版本号：纯元信息'],
  ['meta', '存档元信息（时间戳等）：与模拟状态无关'],
  ['terrain', '地形层：Uint16 / 字节量化存储，误差在第 2 节逐层判'],
  ['entities', '生灵：payload 是行数组、解档后是实体对象，第 4 节逐字段比'],
  ['villages', '聚落：payload 只存子集且 pop 是每 tick 现算的推导量，第 5 节比'],
  ['factions', '宗门：relations / war 在两侧是 Map / Set，形状不同，第 5 节比'],
  ['ascended', '飞升名录：序列化时 slice(-120) 截断，这里只比条数'],
  ['busanzi', '卜算子：payload 只存六项，本节下面按字段比'],
  // 上界块（v8）：它是**整个上界 world 的序列化块**，形状与凡间同源，
  // 但地形只存 6 层（凡间 11 层）。塞进这个通用循环会因为 `terrain` 形状不同而红，
  // 所以挪到第 6 节单独逐字段比——**不是豁免，是换个更严的地方比**。
  ['upper', '上界块（v8）：地形只存 6 层，第 6 节整块逐字段比'],
  // 幽冥块（v10）：与上界**逐字同形**，也是**整个幽冥 world 的序列化块**，
  // 地形同样只存 6 层。塞进这个通用循环会因为 `terrain` 形状不同而红，
  // 所以挪到第 6b 节单独比——**不是豁免，是换个更严的地方比**。
  ['nether', '幽冥块（v10）：地形只存 6 层，第 6b 节整块逐字段比'],
]);

/**
 * world 上有、但**按设计就不进存档**的键（推导量 / 渲染标记 / 临时缓冲）。
 *
 * 与 WORLD_EXEMPT 是一对：WORLD_EXEMPT 管「payload 里的键为什么没被通用比对」，
 * 这张表管「world 上的键为什么没出现在 payload 里」。两张表都要求写明理由——
 * **没有理由的缺席就是漏存**，必须红（见本节末尾 world → payload 那条断言）。
 * 下划线开头的键（territory.js 等就地挂上的推导缓冲）由前缀规则统一排除，
 * 不必逐个列在这里。
 */
const WORLD_NOT_SAVED = new Map([
  ['size', '推导量：w × h'],
  ['flow', '推导量：水流场，hydrology.js 每步重算'],
  ['qi', '推导量：灵气层，terrain.js 的 qiAt 现算'],
  ['territory', '推导量：地盘标签图，territory.js 每 30 日重算'],
  ['terrRev', '推导量：地盘重算版本号，与 territory 同生共死'],
  ['reliefScale', '推导量：由 h 现算（World 构造器里的 reliefScaleFor(h)），渲染层几何常量'],
  ['pendingSpawns', '生成期临时队列，下一个 tick 就被消化'],
  ['revision', '渲染脏标记，与模拟状态无关'],
  ['terrainDirty', '渲染脏标记，与模拟状态无关'],
]);

// 通用比对：标量用 ===，对象 / 数组用 JSON.stringify。
const worldCompared = [];
const worldDiff = [];
for (const k of Object.keys(payload)) {
  if (WORLD_EXEMPT.has(k)) continue;
  worldCompared.push(k);
  const va = world[k];
  const vb = clone[k];
  const scalar = va === null || typeof va !== 'object';
  const same = scalar ? va === vb : JSON.stringify(va) === JSON.stringify(vb);
  if (!same) {
    worldDiff.push(`${k}: 左 ${JSON.stringify(va).slice(0, 50)} ≠ 右 ${JSON.stringify(vb).slice(0, 50)}`);
  }
}
check('世界级字段逐键一致（键集从 payload 反推，不手抄清单）',
  worldDiff.length === 0,
  worldDiff.length
    ? worldDiff.join(' | ')
    : `${worldCompared.length} 键：${worldCompared.join(' ')}`);

check('编年史条数一致', world.chronicle.length === clone.chronicle.length,
  `${world.chronicle.length} 条`);

// 卜算子：他自己那份 log 是**必须**单独存的。
// 他所有的话同时也进了 chronicle，但 chronicle 是 400 条的滚动窗口——
// 一场两百年的局会把他的来路整个顶出去，读档后对话条就空了。
const bz = world.busanzi || {};
const bz2 = clone.busanzi || {};
check('卜算子状态逐字段一致',
  bz.met === bz2.met && bz.acts === bz2.acts && bz.peakPop === bz2.peakPop && bz.tier === bz2.tier
    && JSON.stringify(bz.milestones) === JSON.stringify(bz2.milestones),
  `met=${bz.met} acts=${bz.acts} tier=${bz.tier} 里程碑 ${(bz.milestones || []).length} 个`);
check('卜算子说过的话被保留',
  (bz.log || []).length === (bz2.log || []).length
    && JSON.stringify(bz.log) === JSON.stringify(bz2.log),
  `${(bz.log || []).length} 句`);
check('卜算子最近台词可读回',
  busanziRecent(clone, 3).length === busanziRecent(world, 3).length,
  busanziRecent(clone, 1).map((l) => l.text).join('') || '（还没说过话）');

// ── 大战（v6 新增的世界级三样）─────────────────────────────
//
// 进行中的大战带着参战名单、已打几阵、攒了多少紧张度、战殁者名单，
// 全是**反推不出来**的真实状态。不存的话读档后所有战事凭空消失，
// 长测的 warStats 读数与「接着玩」那条线就对不上了——而且一声不响。
check('大战逐字段一致（含参战名单/阵数/紧张度/战殁名单）',
  JSON.stringify(world.wars) === JSON.stringify(clone.wars),
  `${world.wars.length} 场`);
check('大战账本四字段一致',
  diffFields(world.warLog, clone.warLog, ['declared', 'resolved', 'destroyed', 'casualties']) === '',
  diffFields(world.warLog, clone.warLog, ['declared', 'resolved', 'destroyed', 'casualties'])
    || JSON.stringify(world.warLog));
check('大战 id 计数器一致', world.nextWarId === clone.nextWarId, `next ${world.nextWarId}`);
{
  // 不抬 `nextWarId` 的后果最阴：新战事会**撞 id**，`warById()` 只返回第一个，
  // 而 `warLog.declared` 照样在涨——读档当时看不出任何异常。
  let max = 0;
  for (const w of clone.wars) max = Math.max(max, w.id || 0);
  check('读档后 nextWarId 比世上最大的 id 还大', clone.nextWarId > max,
    `next ${clone.nextWarId} > max ${max}`);
}

// ── 夺舍累计账本（v6 新增；D6-3 工程包 D 追加两键）─────────
//
// `possessionStats` 数的是「此刻在世、还带着印记的人」，当事人一死就归零——
// 于是「夺舍从没发生过」与「发生过但那些人都没了」读数一样。
// 累计账本是唯一能把这两者分开的东西，丢了就再也分不出来了。
// ⚠️ 五键全比：D6-3 工程包 D 的 `crossPlane` / `haunted` 同样反推不出来
//    （「跨位面夺舍从没发生」与「发生过但没存」读档后长得一模一样）。
check('夺舍累计账本五字段一致（含 D 包的 crossPlane / haunted）',
  diffFields(world.possessionLog, clone.possessionLog, ['succeeded', 'failed', 'suspected', 'crossPlane', 'haunted']) === '',
  diffFields(world.possessionLog, clone.possessionLog, ['succeeded', 'failed', 'suspected', 'crossPlane', 'haunted'])
    || JSON.stringify(world.possessionLog));

// ── 逝者名录（v7 新增的世界级两样）─────────────────────────
//
// `world.entities` 只装活人：人一死就被 life.js 的清理循环就地压掉。
// 名录是「他这一生」唯一的残留（宗门/世家/村名、随葬法宝、关系、日志、墓志），
// 反推不出来——不存的话读档后每个人死掉的那一刻，他的一生就再也翻不出来了。
check('逝者名录逐字段一致（不可失效的快照 + 传记原料）',
  JSON.stringify(world.dead) === JSON.stringify(clone.dead),
  `${world.dead.length} 位（上限 ${DEAD_CAP}）`);
check('逝者账本三字段一致',
  diffFields(world.deadLog, clone.deadLog, ['total', 'ascended', 'evicted']) === '',
  diffFields(world.deadLog, clone.deadLog, ['total', 'ascended', 'evicted'])
    || JSON.stringify(world.deadLog));
{
  // 账本类字段必须用**累计值**判：`dead.length` 会被淘汰裁剪、会变小，
  // 单看它分不出「从来没死过人」与「死过十万个、全被淘汰了」——两者都是 800。
  // 不变量来自 necrology.js 文件头（那里写明「测试会断言它」）。
  const L = clone.deadLog || {};
  const net = (L.total || 0) - (L.evicted || 0);
  check('逝者账本不变量：total − evicted === dead.length',
    net === clone.dead.length,
    `${L.total} − ${L.evicted} = ${net} vs dead.length ${clone.dead.length}`);
}
{
  // 铁律二（necrology.js 文件头）：名录里**不留任何会失效的引用**。
  // 宗门会解散（dissolveSect）、世家会断绝、村子会被毁——存 id 就是存一个
  // 迟早指向虚空的指针，而且不会报错，只会在几百年后把别人的名字安到他头上。
  // 唯一允许的 id 是快照自己的 `id`：标量、只当稳定键、永不反查对象。
  const bad = [];
  for (const r of clone.dead) {
    for (const k of Object.keys(r)) {
      if (k === 'id') continue;                     // 稳定键，见 necrology.js 铁律二
      if (/(?:^|[a-z])[Ii]d$/.test(k)) bad.push(`${r.name}.${k}`);
    }
    if (Array.isArray(r.relations)) {
      for (const rel of r.relations) {
        if (rel && ('id' in rel || 'entityId' in rel)) bad.push(`${r.name}.relations[].id`);
      }
    }
    if (typeof r.sectName !== 'string' || typeof r.clanName !== 'string'
      || typeof r.villageName !== 'string') {
      bad.push(`${r.name}.{sect,clan,village}Name 不是字符串`);
    }
  }
  check('逝者快照不含任何 id 型引用（宗门/世家/村名一律已解析成字符串）',
    bad.length === 0,
    bad.length ? bad.slice(0, 4).join(' | ') : `${clone.dead.length} 位`);
}

// ── 空间裂缝（阶段三 · 世界级三样）───────────────────────────
//
// `world.rifts` 是**活跃**裂缝列表（闭合的会被剔除），`riftLog` 是累计账本。
// 三者都**必须进存档**，且各自漏了都是不同形状的静默坏：
//   · 漏 `rifts`      —— 读档后地图上正在漏物的裂缝凭空消失；
//   · 漏 `nextRiftId` —— 读档后 id 从 1 重来 → 新裂缝**撞号** → 按 id 闭合时动错那条；
//   · 漏 `riftLog`    —— 「从来没裂过缝」与「裂过很多、全闭合了」读数一模一样
//                        （同 warLog / possessionLog / deadLog 的理由）。
//
// 为什么不用「跑出来的」：裂缝由玩家开视界触发（规格 §4.1），一次 120 年的跑动
// 里可能一条都没有。靠运气撑起来的判据会在调参后**静悄悄不再测任何东西**。
// 所以夹具（`RIFTS_FIXTURE`，见第 1 节末尾）在**存档前**就灌进了活世界，
// 下面拿主线那份 `clone` 逐字段比——走的是真实的写→读。
//
// ⚠️ 裂缝记录**必须无 id 引用**（铁律三）：只有自己的 `id` 是稳定键，
//    不许出现 `entityId` / `mortalId` 那类指向别人的裸 id。
{
  // ① 逐字段等价（10 个契约字段全比）。
  // 什么故障会让它变红：save.js 的裂缝记录漏写 / 漏还原任何一个字段
  //   （`strength` 漏了 → 渲染时最粗上限读不到；`closedDay` 漏了 → 闭合的裂缝
  //    被当成还开着；`leaked`/`crossed` 漏了 → 长测判据读数归零；
  //    `age` 漏了 → 读档侧退回「按绝对时间兜底」，缝的年龄 / 半径在存读档之间跳变；
  //    `targetPlane` 漏了 → 幽冥缝读档后退回 `undefined`，而 `stepRifts` 把
  //    `undefined` 当**上界缝**处理 ⇒ 读一次档，一世界的幽冥缝集体改成往上界漏物。
  //    ⚠️ `age` 进档**不违反铁律二**：它取决于玩家历次开关视界的历史，现算不出来；
  //      而 `radius` / `peakDay` 仍是推导量，**不该**出现。）
  const RIFT_KEYS = ['age', 'id', 'x', 'y', 'strength', 'openedDay', 'closedDay', 'leaked', 'crossed', 'targetPlane'];
  const riftBad = [];
  if (clone.rifts.length !== world.rifts.length) {
    riftBad.push(`条数 ${clone.rifts.length} ≠ ${world.rifts.length}`);
  }
  for (let i = 0; i < Math.max(clone.rifts.length, world.rifts.length); i += 1) {
    const d = diffFields(clone.rifts[i], world.rifts[i], RIFT_KEYS);
    if (d) riftBad.push(`#${(clone.rifts[i] || world.rifts[i] || {}).id}: ${d}`);
  }
  check('裂缝逐字段跨存档等价（10 个契约字段：age/id/x/y/strength/openedDay/closedDay/leaked/crossed/targetPlane）',
    riftBad.length === 0,
    riftBad.length ? riftBad.join(' | ') : `${clone.rifts.length} 条 × ${RIFT_KEYS.length} 字段`);

  // ② 记录键集**恰好**是契约那 10 个：防止有人往记录里塞 id 引用（铁律三）。
  // 什么故障会让它变红：给裂缝记录加了 `entityId` / `ownerId` 之类的悬垂引用，
  //   或漏存某个契约字段（`radius` / `peakDay` 是推导量，**不该**出现）。
  const keyBad = [];
  for (const r of clone.rifts) {
    const ks = Object.keys(r).sort().join(',');
    if (ks !== [...RIFT_KEYS].sort().join(',')) keyBad.push(`#${r.id}: [${Object.keys(r).join(' ')}]`);
  }
  check('裂缝记录的键集恰好是 10 个契约字段（无任何 id 引用、不含推导量 radius/peakDay）',
    keyBad.length === 0,
    keyBad.length ? keyBad.join(' | ') : `${clone.rifts.length} 条键集一致`);

  // ②c `targetPlane` 必须**原样往返**，且两个值都在夹具里出现过。
  // ① 只保证两侧值相等；若夹具里全是 `'upper'`，那么「读侧把所有缝都写成
  // `'upper'`」这个坏法在 ① 里**测不出来**（两侧都是 'upper'，怎么比都相等）。
  // 所以这里先确认**夹具本身有区分力**（至少一条 nether），再确认逐条往返。
  // 什么故障会让它变红：写侧漏写 `targetPlane`（读档后一律兜底成 'upper'）、
  //   读侧把归一写成 `=== 'upper' ? 'upper' : 'nether'`（老档全被判成幽冥缝）。
  {
    const planes = new Set(world.rifts.map((r) => r.targetPlane));
    const discriminating = planes.size >= 2;
    const bad = clone.rifts.filter((r, i) => !world.rifts[i] || r.targetPlane !== world.rifts[i].targetPlane);
    check('裂隙 targetPlane 原样往返，且夹具覆盖 upper/nether 两个值（有区分力）',
      discriminating && bad.length === 0,
      `${discriminating ? '夹具含 ' + [...planes].join('/') : '⚠️ 夹具只有一个值 ⇒ 这条判据没有区分力'}`
      + ` · 不一致 ${bad.length} 条`
      + (bad.length ? `（例：#${bad[0].id} 读回 ${bad[0].targetPlane}）` : ''));
  }

  // ②b `age` 必须**原样往返**，不能被读档侧「按绝对时间」重算。
  // ① 只保证两侧值相等；若读档侧改用 `world.day - openedDay` 兜底、
  // **而夹具的 age 恰好等于那个差**，① 会**假绿**。
  // 所以这里先确认**夹具本身有区分力**（至少一条 `age ≠ 绝对时间估算值`），
  // 再确认每条都原样往返 —— 缺了前半句，这条断言随时可能退化成恒真。
  // 什么故障会让它变红：读档侧把 `age` 改回 `world.day - openedDay`
  //   （2026-09-19 之前的旧语义）→ 玩家关过视界的缝在存读档之间**年龄跳变**，
  //   半径随之跳变，而 `riftLog` 一个字都不会错、看不出任何异常。
  const absEst = (r) => Math.max(0, (world.day || 0) - (r.openedDay || 0));
  const discriminating = world.rifts.filter((r) => r.age !== absEst(r));
  const ageBad = world.rifts.filter((r, i) => clone.rifts[i] && clone.rifts[i].age !== r.age);
  check('裂缝 age 原样往返（且夹具对「按绝对时间重算」有区分力）',
    discriminating.length > 0 && ageBad.length === 0,
    `有区分力的 ${discriminating.length}/${world.rifts.length} 条`
    + `（例：age=${world.rifts[0] ? world.rifts[0].age : '—'}`
    + ` vs 绝对估算 ${world.rifts[0] ? absEst(world.rifts[0]) : '—'}）`
    + ` · 往返不符 ${ageBad.length} 条`);

  // ③ nextRiftId 等价，且读档后**新开一条不撞号**。
  // 什么故障会让它变红：save.js 漏写 `nextRiftId` —— 读档后从 1 重来，
  //   新裂缝拿到已存在的 id，按 id 闭合 / 移除时会动错那一条（读档当时看不出）。
  //   （写侧漏写由第 3 节的两条键集判据直接抓：实测删掉那一行会报 2 红。）
  const used = new Set(clone.rifts.map((r) => r.id));
  const maxId = clone.rifts.reduce((m, r) => Math.max(m, r.id || 0), 0);
  check('nextRiftId 存得住，且读档后新开的裂缝不与已读回的 id 撞号',
    clone.nextRiftId === world.nextRiftId && !used.has(clone.nextRiftId) && clone.nextRiftId > maxId,
    `next ${clone.nextRiftId}（应为 ${world.nextRiftId}）> max id ${maxId}，且不在已用 id 里`);

  // ④ riftLog 5 键齐全且值等价。
  // 什么故障会让它变红：漏写 / 漏还原 `riftLog`（账本归零），或少了某一个键。
  check('riftLog 5 键齐全且值等价（opened/closed/leaked/crossed/lost）',
    diffFields(clone.riftLog, world.riftLog, ['opened', 'closed', 'leaked', 'crossed', 'lost']) === '',
    diffFields(clone.riftLog, world.riftLog, ['opened', 'closed', 'leaked', 'crossed', 'lost'])
      || JSON.stringify(clone.riftLog));

  // ⑤ 专门抓「只还原了 4 个键、`lost` 丢了」：构造一个**旧形状**的 riftLog
  //    （只有 opened/closed/leaked/crossed），读档后 `lost` 必须被兜底补成 0，
  //    且键集是完整的 5 个。
  // 什么故障会让它变红：读侧写成 `data.riftLog || {5键}` —— 那样 4 键的老形状
  //   会被原样收下，`lost` 永久 undefined，`undefined + 1 = NaN` 那类坑。
  {
    const raw4 = JSON.parse(JSON.stringify(payloadJson));
    raw4.riftLog = { opened: 5, closed: 2, leaked: 3, crossed: 1 };  // 故意漏 lost
    const c4 = deserializeWorld(raw4);
    const ks = Object.keys(c4.riftLog || {}).sort().join(',');
    check('旧形状 riftLog（只有 4 键）读档后补上 lost=0，5 键齐全',
      ks === 'closed,crossed,leaked,lost,opened' && c4.riftLog.lost === 0,
      `键 [${Object.keys(c4.riftLog || {}).join(' ')}] · lost=${c4.riftLog && c4.riftLog.lost}`);
  }
}

// ── 凡间鬼影（D6-3 工程包 B · 世界级两样）─────────────────────
//
// `world.wraiths` 是**此刻在凡间飘荡**的鬼（自幽冥缝爬出来的），`wraithLog` 是
// 累计账本（只有 `dissolved` 一键）。两样都**必须进存档**，各自漏了都是静默坏：
//   · 漏 `wraiths`    —— 读档后满地图的鬼凭空消失（玩家明明刚看见）；
//   · 漏 `wraithLog`  —— 「从来没鬼消散过」与「消散过很多」读数一模一样
//                        （同 warLog / riftLog 的理由）。
//
// ⚠️ 鬼**不在 `world.entities` 里**（理由见 `sim/wraiths.js` 头注释），所以它
//    有**自己的 22 字段形状**，与实体行那套 68 列无关——本块逐字段比。
// ⚠️ `id` 是**幽冥段**（2_000_000+）的稳定键，**不是**凡间 id：它是「这只鬼从
//    幽冥来的」这件事在数据上的唯一痕迹，也保证鬼影容器与 `world.entities`
//    结构上不相交（铁律三）。
{
  const WRAITH_KEYS = ['id', 'sp', 'x', 'y', 'tx', 'ty', 'vx', 'vy', 'hp', 'maxHp',
    'level', 'soulKind', 'ghostOf', 'name', 'rancor', 'fromRiftId', 'climbedDay',
    'dissolveDay', 'state', 'timer', 'anim', 'face'];
  const wraithBad = [];
  if (clone.wraiths.length !== world.wraiths.length) {
    wraithBad.push(`条数 ${clone.wraiths.length} ≠ ${world.wraiths.length}`);
  }
  for (let i = 0; i < Math.max(clone.wraiths.length, world.wraiths.length); i += 1) {
    const d = diffFields(clone.wraiths[i], world.wraiths[i], WRAITH_KEYS);
    if (d) wraithBad.push(`#${(clone.wraiths[i] || world.wraiths[i] || {}).id}: ${d}`);
  }
  check('凡间鬼影逐字段等价（22 键：位置 / 身份 / 跨界留痕 / 行为全比）',
    wraithBad.length === 0,
    wraithBad.length ? wraithBad.join(' | ')
      : `${clone.wraiths.length} 只 × ${WRAITH_KEYS.length} 键`);

  // ② 鬼影的 id 必须落在**幽冥段**（≥ NETHER_ID_BASE），且与 `world.entities`
  //    的 id **不相交**。什么故障会让它变红：`spawnWraith` 改成调 `world.addEntity`
  //    （那会赋凡间段的号）——鬼就会与凡人撞 id，而「按 id 找实体」的地方会取错。
  const MORTAL_ID_MAX = Math.max(0, ...world.entities.map((e) => e.id || 0));
  const idBad = clone.wraiths.filter((w) => !(w.id >= 2000000) || w.id <= MORTAL_ID_MAX);
  check('凡间鬼影 id 落在幽冥段（≥ 2_000_000）且与凡间实体 id 不相交',
    idBad.length === 0,
    idBad.length ? `越界：${idBad.map((w) => w.id).join(',')}（凡间最大 ${MORTAL_ID_MAX}）`
      : `${clone.wraiths.map((w) => w.id).join(',')} 均 ≥ 2_000_000 且 > ${MORTAL_ID_MAX}`);

  // ③ 鬼影**不携带**幽冥侧那两个字段（`ghostDecayDay` / `soulBind`）：
  //    它们归 `stepNether` 管。带着会让「这只鬼到底归谁管」变成要猜的事
  //    （模板刻意不带，见 `WRAITH_TEMPLATE` 的注释）。
  const stray = clone.wraiths.filter((w) =>
    Object.prototype.hasOwnProperty.call(w, 'ghostDecayDay')
    || Object.prototype.hasOwnProperty.call(w, 'soulBind'));
  check('凡间鬼影不带幽冥侧字段（ghostDecayDay / soulBind）',
    stray.length === 0,
    stray.length ? `有 ${stray.length} 只带了` : '无');

  // ④ wraithLog 一键齐全且值等价。什么故障会让它变红：漏写 / 漏还原 `wraithLog`。
  check('wraithLog 一键齐全且值等价（dissolved）',
    diffFields(clone.wraithLog, world.wraithLog, ['dissolved']) === '',
    diffFields(clone.wraithLog, world.wraithLog, ['dissolved'])
      || JSON.stringify(clone.wraithLog));
}

// ── 老档兼容：payload 里**没有** rifts / nextRiftId / riftLog 三个键 ──
//
// 阶段三之前的老档没有这三样。缺键若不补成默认值，就是「只在一侧存在的字段」——
// 新世界有、读回来没有，于是任何遍历键的代码从此对不上，而且不报错
// （同 `dead`/`deadLog` 的 v5 降级、`upper` 的 v7 降级同一个形状）。
// 什么故障会让它变红：读侧没兜底 → `world.rifts.length` 抛 TypeError；
//   或兜底不完整（`riftLog` 只补了 4 个键、`nextRiftId` 留 undefined）。
{
  const raw0 = JSON.parse(JSON.stringify(payloadJson));
  delete raw0.rifts;
  delete raw0.nextRiftId;
  delete raw0.riftLog;
  // 凡间鬼影（D6-3 工程包 B）：老档也没有这两项。一并删掉，验读侧兜底。
  delete raw0.wraiths;
  delete raw0.wraithLog;
  let c0 = null;
  let threw = '';
  try { c0 = deserializeWorld(raw0); } catch (e) { threw = String(e && e.message ? e.message : e); }
  check('老档（没有 rifts/nextRiftId/riftLog 键）读档不抛错', threw === '', threw || 'ok');
  check('老档读回来：rifts 是空数组而不是 undefined',
    !!c0 && Array.isArray(c0.rifts) && c0.rifts.length === 0,
    c0 ? `rifts=${Array.isArray(c0.rifts) ? c0.rifts.length : typeof c0.rifts}` : '（读档抛错了）');
  check('老档读回来：nextRiftId 是 1', !!c0 && c0.nextRiftId === 1,
    c0 ? String(c0.nextRiftId) : '（读档抛错了）');
  check('老档读回来：riftLog 5 键齐全且全 0',
    !!c0 && diffFields(c0.riftLog, { opened: 0, closed: 0, leaked: 0, crossed: 0, lost: 0 },
      ['opened', 'closed', 'leaked', 'crossed', 'lost']) === '',
    c0 ? JSON.stringify(c0.riftLog) : '（读档抛错了）');
  // 凡间鬼影的老档兜底：空数组 + `{dissolved:0}`。什么故障会让它变红：
  //   读侧没兜底 → `world.wraiths.length` 抛 TypeError（`drawWraiths` / `wraithStats` 都读它）。
  check('老档读回来：wraiths 是空数组而不是 undefined',
    !!c0 && Array.isArray(c0.wraiths) && c0.wraiths.length === 0,
    c0 ? `wraiths=${Array.isArray(c0.wraiths) ? c0.wraiths.length : typeof c0.wraiths}` : '（读档抛错了）');
  check('老档读回来：wraithLog 只有 dissolved=0',
    !!c0 && diffFields(c0.wraithLog, { dissolved: 0 }, ['dissolved']) === '',
    c0 ? JSON.stringify(c0.wraithLog) : '（读档抛错了）');
}

// ── 序列化结果的键集必须真的含新字段（不能靠读档兜底伪装）──
//
// 这一条是 `possessionLog` 那个 bug 的直接产物：它曾经**只存在于 deserialize 侧**
// （`data.possessionLog || { succeeded: 0, ... }`），serialize 侧压根没写。
// 只比对「读回来的值」的话，那个 `|| 默认值` 兜底会把「根本没存」
// 伪装成「存了默认值」——世界当时恰好没夺舍过，两边都是 0，一路全绿。
// **这正是它能骗过第一轮的原因。**（v7 的 `dead` / `deadLog` 是同一形状的第二次。）
//
// 所以这里不看读回来的值，直接检查**序列化结果**（`payloadJson`，过一遍 JSON，
// 与真正落盘的 localStorage 字符串同形）的键集。
{
  // 世界级新字段：v6 的大战三样 + 夺舍账本，v7 的逝者名录 + 账本，v8 的上界块，
  // 阶段三的空间裂缝三样（rifts / nextRiftId / riftLog），v10 的幽冥块。
  // ⚠️ `nether` 在这里只判「**写了没有**」——查的是序列化结果的键集。
  //    光看 `clone.nether` 非 null 是**证明不了**的：读档侧无论有没有块都会补一个
  //    （有就还原、没有就地生成），所以「v10 块没写」这件事在 clone 侧完全看不出来。
  const worldKeys = ['wars', 'nextWarId', 'warLog', 'possessionLog', 'dead', 'deadLog', 'upper',
    'nether', 'rifts', 'nextRiftId', 'riftLog', 'wraiths', 'wraithLog'];
  const missWorld = worldKeys.filter((k) => !Object.prototype.hasOwnProperty.call(payloadJson, k));
  check('序列化结果顶层含全部世界级新字段'
    + '（wars/nextWarId/warLog/possessionLog/dead/deadLog/upper/nether/rifts/nextRiftId/riftLog/wraiths/wraithLog）',
    missWorld.length === 0,
    missWorld.length ? `缺：${missWorld.join(' ')}` : worldKeys.join(' '));

  // 实体级三列在**行尾**。行长度必须**正好**等于 ENTITY_COLUMNS：
  //   短了 → 某列压根没写进行里（老档才该是 57）；
  //   长了 → save.js 加了列而这里没跟上，得回来更新常量与旧档降级。
  const badRow = payloadJson.entities.find((r) => r.length !== ENTITY_COLUMNS);
  check(`序列化结果每条实体行长度 == ${ENTITY_COLUMNS}（解档侧读的列数）`,
    !badRow,
    badRow ? `有行长度 ${badRow.length}（应 == ${ENTITY_COLUMNS}）`
      : `${payloadJson.entities.length} 位 × ${ENTITY_COLUMNS} 列`);

  const v6Names = Object.keys(ENTITY_COL_V6);
  const firstRow = payloadJson.entities[0] || [];
  const missCol = v6Names.filter((n) =>
    !Object.prototype.hasOwnProperty.call(firstRow, ENTITY_COL_V6[n]));
  check(`序列化结果实体行含全部 v6 新列（row[${ENTITY_COL_V6.log}..${ENTITY_COL_V6.nascentEscapeUsed}]）`,
    payloadJson.entities.length === 0 || missCol.length === 0,
    missCol.length ? `缺：${missCol.join(' ')}` : `${payloadJson.entities.length} 位 × 3 列`);

  // ── 自检：常量与下标**真的与 save.js 源码同源**吗？──────────────
  //
  // 上面那条「行长度 == ENTITY_COLUMNS」只证明**总列数**对得上，
  // 证明不了 v6 那三列的下标还指着原来那三列——v8 在行尾加了两列之后，
  // `ENTITY_COLUMNS - 3` 已经指到 `nascentEscapeUsed` 去了，而总列数
  // 恰恰是对的。所以补两条：
  //   ① 手写的 ENTITY_COLUMNS 必须等于从 save.js 源码数出来的列数
  //      （以后谁在 save.js 加列、忘了改这里，当场红）；
  //   ② v6 三列的下标必须由源码按列名解析得到、连续递增、且在行内
  //      （位置被挪动 / 列名被改 → 红）。
  // 什么故障会让它变红：save.js 给实体行加列删列而本文件没同步（①）；
  //   v6 三列在数组里的相对位置被挪动、或某个列名被改名（②）。
  check('ENTITY_COLUMNS 与 save.js 源码里的实体行列数同源（不靠人记得去数）',
    ENTITY_COLUMNS === ENTITY_SOURCE_EXPRS.length,
    `本文件写 ${ENTITY_COLUMNS}，save.js 源码数出 ${ENTITY_SOURCE_EXPRS.length}`);
  check(`v6 三列下标由源码按列名解析（log=${ENTITY_COL_V6.log}`
    + ` possessedBy=${ENTITY_COL_V6.possessedBy} nascentEscapeUsed=${ENTITY_COL_V6.nascentEscapeUsed}）`,
    ENTITY_COL_V6.possessedBy === ENTITY_COL_V6.log + 1
      && ENTITY_COL_V6.nascentEscapeUsed === ENTITY_COL_V6.log + 2
      && ENTITY_COL_V6.log >= 0
      && ENTITY_COL_V6.nascentEscapeUsed < ENTITY_COLUMNS,
    `连续递增=${ENTITY_COL_V6.possessedBy === ENTITY_COL_V6.log + 1
      && ENTITY_COL_V6.nascentEscapeUsed === ENTITY_COL_V6.log + 2}`
    + `，在行内=${ENTITY_COL_V6.log >= 0 && ENTITY_COL_V6.nascentEscapeUsed < ENTITY_COLUMNS}`);

  // ── v9（2026-09-22）追加的 `restUntil`（养伤截止日）────────────
  // 同 v6 那三列的道理：**按列名从源码解析下标**，不从行尾倒着数。
  // 什么故障会让它变红：① `restUntil` 被移出实体行数组（`entityColumnIndex` 抛错，
  // 本进程直接崩，比绿更显眼）；② 它被挪到别的列名后面（下标变了，但这里只断言
  // 「在行内且唯一」，所以真正抓「挪位」的是下面那条**往返**断言）。
  const REST_UNTIL_COL = entityColumnIndex('restUntil');
  check(`restUntil 列由源码按列名解析且在行内（row[${REST_UNTIL_COL}]）`,
    REST_UNTIL_COL >= 0 && REST_UNTIL_COL < ENTITY_COLUMNS,
    `实测 row[${REST_UNTIL_COL}]，行宽 ${ENTITY_COLUMNS}`);
  // ⚠️ 光有「下标在行内」证明不了**读侧真的读了它**——读侧把 `row[62]` 写成
  //    `row[61]` 的话，下标照样在行内，而养伤字段会静默读成 `-1e9`。
  //    所以这里直接**看值**：给一行写一个可辨认的数，读回来必须一模一样。
  const restIdx = REST_UNTIL_COL;
  const stamped = payloadJson.entities.map((r) => {
    const c = r.slice();
    c[restIdx] = 4242;
    return c;
  });
  let roundTripOk = true;
  let rtDetail = '';
  try {
    const rt = deserializeWorld(
      JSON.parse(JSON.stringify({ ...payloadJson, entities: stamped })),
    );
    roundTripOk = rt.entities.length > 0
      && rt.entities.every((e) => e.restUntil === 4242);
    rtDetail = `读了 ${rt.entities.length} 位，`
      + `对不上 ${rt.entities.filter((e) => e.restUntil !== 4242).length} 位`;
  } catch (err) {
    roundTripOk = false;
    rtDetail = `读档抛错：${err && err.message ? err.message : err}`;
  }
  check('restUntil 写 4242 → 读回来还是 4242（证明读侧真的读了这一列）',
    roundTripOk, rtDetail || '全部一致');

  // ── D6-3 工程包 D（2026-09-26）追加的 `possessionScar`（跨位面夺舍印记）──
  // 同 `restUntil`：按列名从源码解析下标，再**看值**——「下标在行内」证明不了
  // 读侧真的读了它（把 `row[68]` 写成 `row[67]` 照样在行内，而印记静默变 null）。
  // 什么故障会让它变红：save.js 加 / 挪列而本文件没同步（`entityColumnIndex` 抛错，
  //   进程直接崩）；或读侧把 `possessionScar` 读成了别的下标（读回来是 null）。
  const POSSESSION_SCAR_COL = entityColumnIndex('possessionScar');
  check(`possessionScar 列由源码按列名解析且在行内（row[${POSSESSION_SCAR_COL}]）`,
    POSSESSION_SCAR_COL >= 0 && POSSESSION_SCAR_COL < ENTITY_COLUMNS,
    `实测 row[${POSSESSION_SCAR_COL}]，行宽 ${ENTITY_COLUMNS}`);
  {
    const scar = { ghostName: '阿飘', ghostLevel: 33, day: 720, until: 1080, mode: 'haunt' };
    const scarRows = payloadJson.entities.map((r) => {
      const c = r.slice();
      c[POSSESSION_SCAR_COL] = scar;
      return c;
    });
    let scarOk = true;
    let scarDetail = '';
    try {
      const rt = deserializeWorld(
        JSON.parse(JSON.stringify({ ...payloadJson, entities: scarRows })),
      );
      scarOk = rt.entities.length > 0
        && rt.entities.every((e) => JSON.stringify(e.possessionScar) === JSON.stringify(scar));
      scarDetail = `读了 ${rt.entities.length} 位，`
        + `对不上 ${rt.entities.filter((e) => JSON.stringify(e.possessionScar) !== JSON.stringify(scar)).length} 位`;
    } catch (err) {
      scarOk = false;
      scarDetail = `读档抛错：${err && err.message ? err.message : err}`;
    }
    check('possessionScar 写一份快照 → 读回来逐字段一致（证明读侧真的读了这一列）',
      scarOk, scarDetail || '全部一致');
  }
}

// ── 「有没有漏掉的人」：两条断言，方向相反，抓的**不是同一类错** ──
//
// 上面那些逐字段比对只能证明「已经比过的东西对得上」，证明不了
// 「该比的东西都进来了」。要证明后者，必须**两个方向各查一遍**——
// 而这两条抓的是两种形状不同的错，**不能互相替代**：
//
//   ① payload → world：字段**存了、但没人比**。
//      形状是「加了新字段，忘了把它接进比对清单」。
//      `world.dead` 就是这个形状：save.js 里明明白白写着 `dead: world.dead || []`，
//      可当时那份写死的比对清单里没有它——于是测试 76 ✓ / EXIT 0，
//      而它一条都没被比到，名录漏没漏、存没存全都测不出来。
//
//   ② world → payload：字段**在 world 上、却压根没进存档**。
//      形状是「serialize 漏写」。`possessionLog` 就是这个形状：
//      deserialize 侧有 `data.possessionLog || {…}`，serialize 侧一行都没有。
//
// ⚠️ ② 才是真正会响的那条，因为 ① 天生**看不见漏写**：
//    漏写的字段根本不在 payload 里，从 payload 反推的那个循环永远扫不到它。
//    实测：把 save.js 的 `deadLog:` 那一行注掉之后，① 那行变成「28 键」且照样绿，
//    只有 ② 报了「漏写：deadLog」。
{
  // ① payload → world：出现在序列化结果顶层、却既没被通用比对、
  //    也不在 WORLD_EXEMPT 里的键 → 有人加了字段却忘了接进比对。
  //    通用循环本来就是遍历 payload 的，所以这条眼下恒真；它是**守门人**——
  //    防的是以后有人把那个循环改回白名单，而新字段又没人想起来加。
  const accounted = new Set([...worldCompared, ...WORLD_EXEMPT.keys()]);
  const unregistered = Object.keys(payload).filter((k) => !accounted.has(k));
  check('payload 顶层没有「没接进比对」的键（新增字段必须注册或写明豁免理由）',
    unregistered.length === 0,
    unregistered.length ? `未注册：${unregistered.join(' ')}`
      : `${Object.keys(payload).length} 键全部有着落`);

  // ② world → payload：**world 上有、序列化结果里没有** → serialize 漏写了。
  //    排除项：下划线开头的推导量 / 临时缓冲（territory.js 等就地挂在 world 上），
  //    以及 terrain 的十一个分层（它们在 payload.terrain 里，不在顶层）。
  const terrainKeys = new Set(Object.keys(payload.terrain || {}));
  const notSaved = Object.keys(world).filter((k) =>
    !k.startsWith('_')
    && !Object.prototype.hasOwnProperty.call(payload, k)
    && !terrainKeys.has(k)
    && !WORLD_NOT_SAVED.has(k));
  check('world 上没有「serialize 漏写」的键（漏了就是读档后凭空消失）',
    notSaved.length === 0,
    notSaved.length ? `漏写：${notSaved.join(' ')}`
      : `${Object.keys(world).filter((k) => !k.startsWith('_')).length} 个非下划线键全部有着落`);

  // ③ 反向（本版新增）：**payload 里的键必须在 world 上有对应字段**（或写明豁免）。
  //
  //    ⚠️ 这一条是「canary 实测」逼出来的：上面 ① 是**恒真的守门人**——
  //    它从 `Object.keys(payload)` 反推 `accounted`，于是任何 payload 键都自动
  //    「有着落」，**抓不到「serialize 里多写了一个 world 上不存在的键」**。
  //    而通用逐字段比对读的是 `world[k]` vs `clone[k]`：一个凭空多出来的键在
  //    两侧都是 `undefined`，`undefined === undefined` → **一路全绿**。
  //    实测证据：临时往 `serializeWorld` 塞一个 `_canaryKey: 1`，加这条之前
  //    整支测试**全绿通过（EXIT=0）**——「序列化键集驱动」的保护在「多写」这个
  //    方向上是失效的。所以补这条反向断言。
  // 什么故障会让它变红：serializeWorld 手滑多写一个键（如 `riftLogs` 拼错）、
  //    塞了临时调试键、或加了一个 payload 字段却忘了在 `World` 构造器上建它。
  const phantom = Object.keys(payloadJson).filter((k) =>
    !Object.prototype.hasOwnProperty.call(world, k) && !WORLD_EXEMPT.has(k));
  check('payload 里的键在 world 上都有对应字段（反向断言：抓「序列化写了世界没有的键」）',
    phantom.length === 0,
    phantom.length ? `凭空多出：${phantom.join(' ')}`
      : `${Object.keys(payloadJson).length} 键在 world 上都有对应字段（或已豁免）`);
}

// ── 自检：键集判据**真的会因为漏存而红**吗？──────────────
//
// 「一支不会因为漏存而红的等价测试，等于没有。」所以这里当场把 `deadLog`
// 从序列化结果里抠掉，用**同一条判据**跑一遍，必须报红。
// 这与「把 save.js 里 serialize 的 deadLog 那一行注释掉」是同一个失败形状，
// 但不必去动 src/ 下的文件（那边的编辑随时可能被别人的改动覆盖）。
// 它每次都会跑：以后谁把上面那条判据改成恒真，这里立刻炸。
{
  const sabotaged = JSON.parse(JSON.stringify(payloadJson));
  delete sabotaged.deadLog;
  const keys = ['wars', 'nextWarId', 'warLog', 'possessionLog', 'dead', 'deadLog'];
  const miss = keys.filter((k) => !Object.prototype.hasOwnProperty.call(sabotaged, k));
  console.log(`  · 自检（把 deadLog 从序列化结果里抠掉）→ 键集判据报：「缺：${miss.join(' ')}」`);
  check('自检：漏存 deadLog 时键集判据必须报红', miss.includes('deadLog'),
    miss.length ? `缺：${miss.join(' ')}` : '（没报出来 —— 说明上面那条判据是假的）');
}


// ── 4. 生灵：逐字段枚举差异 ────────────────────────────────
section('4. 生灵字段逐项比对');
const byId = new Map(clone.entities.map((e) => [e.id, e]));
const missing = world.entities.filter((e) => !byId.has(e.id));
check('没有生灵在存档中丢失', missing.length === 0, `${world.entities.length} 位`);
check('生灵 id 无重复', byId.size === clone.entities.length);

// 逐字段比对抽成了 `compareEntityFields`（见文件头附近）：上界那 12 人用的是
// **同一份**机制，理由与那段注释里写的一样（键集取并集、绝不手抄清单）。
const { diffs, onlyLive, onlyClone } = compareEntityFields(world.entities, clone.entities);
check('没有「只在一侧存在」的字段（漏初始化与漏存都会在这里现形）',
  onlyLive.size === 0 && onlyClone.size === 0,
  onlyLive.size || onlyClone.size
    ? `只活在原世界：${[...onlyLive].map(([k, n]) => `${k}×${n}`).join(' ')}`
      + ` | 只活在读档后：${[...onlyClone].map(([k, n]) => `${k}×${n}`).join(' ')}`
    : `${world.entities.length} 位 · 键集一致`);
if (diffs.size === 0) {
  check('生灵所有字段逐位一致', true, `${world.entities.length} 位 × ${new Set(world.entities.flatMap((e) => Object.keys(e))).size} 字段`);
} else {
  check('生灵所有字段逐位一致', false,
    `未存字段：${[...diffs].map(([k, n]) => `${k}×${n}`).join(' ')}`);
}

// 关系网逐条比对
let relBad = 0;
for (const a of world.entities) {
  const b = byId.get(a.id);
  const sa = a.relations ? a.relations.size : 0;
  const sb = b && b.relations ? b.relations.size : 0;
  if (sa !== sb) { relBad += 1; continue; }
  if (!sa) continue;
  for (const [id, rel] of a.relations) {
    const got = b.relations.get(id);
    if (!got || got.type !== rel.type || got.score !== rel.score) { relBad += 1; break; }
  }
}
check('关系网逐条一致', relBad === 0, relBad ? `${relBad} 位对不上` : '含类型与分值');

// ── 个人日志（log，v6 新增）────────────────────────────────
//
// 日志是传记的**全部原料**：丢了它，读档后每个人的生平都变成空白，
// 而编年史那 400 条滚动窗口根本补不回来（它记的是世界、不是人）。
// 上面那条「生灵字段逐项比对」其实已经把它盖住了，这里单独再报一遍，
// 是为了在红的时候能直接看出「是日志没了」，而不是淹没在字段清单里。
let logBad = 0;
let logBadWhy = '';
let loggedN = 0;
let logTotal = 0;
for (const a of world.entities) {
  const b = byId.get(a.id);
  if (!b) continue;
  const la = Array.isArray(a.log) ? a.log : null;
  const lb = Array.isArray(b.log) ? b.log : null;
  if (la && la.length) { loggedN += 1; logTotal += la.length; }
  if (JSON.stringify(la) !== JSON.stringify(lb)) {
    logBad += 1;
    if (!logBadWhy) {
      logBadWhy = `${a.name}#${a.id}: 左 ${JSON.stringify(la).slice(0, 70)}`
        + ` ≠ 右 ${JSON.stringify(lb).slice(0, 70)}`;
    }
  }
}
check('个人日志逐条一致',
  logBad === 0,
  logBad ? `${logBad} 位对不上（例：${logBadWhy}）`
    : `${loggedN}/${world.entities.length} 人有日志 · 共 ${logTotal} 条`);

// 每条日志的形状：六个键都得在，且不能有 undefined 值。
//
// ⚠️ 这一条防的是 `recordLifeEvent` 那处**条件赋值**：
// 写 `importance: undefined` 会造出一个「值为 undefined 的键」，
// 而 `JSON.stringify` 会把它**整个丢掉**——于是新世界里有的键、读档后没有。
// 键集看上去一样，值也对得上，偏偏那一格凭空消失，逐字段比对才会红。
let logShapeBad = 0;
let logShapeWhy = '';
for (const e of world.entities) {
  const rows = Array.isArray(e.log) ? e.log : [];
  for (const row of rows) {
    for (const k of ['day', 'year', 'kind', 'text', 'key', 'importance']) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) {
        logShapeBad += 1;
        if (!logShapeWhy) logShapeWhy = `${e.name}#${e.id} 缺 ${k}`;
      }
    }
    if (row.importance === undefined) {
      logShapeBad += 1;
      if (!logShapeWhy) logShapeWhy = `${e.name}#${e.id} 的 importance 是 undefined`;
    }
    if (!Object.values(row).every((v) => v !== undefined)) {
      logShapeBad += 1;
      if (!logShapeWhy) logShapeWhy = `${e.name}#${e.id} 有一条日志带 undefined 值`;
    }
  }
}
check('日志每条形状完整（day/year/kind/text/key/importance 都在且非 undefined）',
  logShapeBad === 0, logShapeBad ? logShapeWhy : `${logTotal} 条`);

// ── 夺舍印记（possessedBy，v6 新增）────────────────────────
//
// 存的是**快照对象**而不是 id（夺舍者会从 world.entities 移除，存 id 必悬垂）。
// 不存的话读档后「被夺舍者」变回普通人，`·异` 后缀与印记全部消失。
let posBad = 0;
let posWhy = '';
let posN = 0;
for (const a of world.entities) {
  const b = byId.get(a.id);
  if (!b) continue;
  const pa = a.possessedBy || null;
  const pb = b.possessedBy || null;
  if (pa) posN += 1;
  if ((pa === null) !== (pb === null)) {
    posBad += 1;
    if (!posWhy) posWhy = `${a.name}#${a.id}: ${pa ? '有' : '无'}印记 ≠ ${pb ? '有' : '无'}印记`;
    continue;
  }
  if (!pa) continue;
  const bad = diffFields(pa, pb, ['name', 'level', 'faction', 'day', 'suspected']);
  if (bad) {
    posBad += 1;
    if (!posWhy) posWhy = `${a.name}#${a.id} ${bad}`;
  }
}
check('夺舍印记逐字段一致（快照 name/level/faction/day/suspected）',
  posBad === 0, posBad ? posWhy : `${posN} 位带印记`);

// ── 元婴脱壳记账（nascentEscapeUsed，v6 新增）──────────────
//
// 一生只触发一次。不存的话读档后同一个人可以反复脱壳、永远死不了。
let escBad = 0;
let escWhy = '';
let escN = 0;
for (const a of world.entities) {
  const b = byId.get(a.id);
  if (!b) continue;
  const va = a.nascentEscapeUsed === true;
  const vb = b.nascentEscapeUsed === true;
  if (va) escN += 1;
  if (va !== vb) {
    escBad += 1;
    if (!escWhy) escWhy = `${a.name}#${a.id}: ${a.nascentEscapeUsed} ≠ ${b.nascentEscapeUsed}`;
  }
}
check('元婴脱壳记账逐位一致（布尔）',
  escBad === 0, escBad ? escWhy : `${escN} 位用过脱壳`);


// ── 5. 聚落与宗门 ──────────────────────────────────────────
section('5. 聚落与宗门字段');
const vDiff = [];
for (let i = 0; i < world.villages.length; i += 1) {
  const a = world.villages[i]; const b = clone.villages[i];
  for (const k of Object.keys(a)) {
    if (k === 'pop') continue;               // 人口是每 tick 现算的推导量
    const same = typeof a[k] === 'number' ? a[k] === b[k] : JSON.stringify(a[k]) === JSON.stringify(b[k]);
    if (!same && !vDiff.includes(k)) vDiff.push(k);
  }
}
check('村子字段一致', vDiff.length === 0, vDiff.length ? `未存：${vDiff.join(' ')}` : `${world.villages.length} 座`);

const fDiff = [];
for (let i = 0; i < world.factions.length; i += 1) {
  const a = world.factions[i]; const b = clone.factions[i];
  for (const k of Object.keys(a)) {
    if (k === 'relations' || k === 'war' || k === 'pop' || k === 'followers') continue;
    const same = typeof a[k] === 'number' ? a[k] === b[k] : JSON.stringify(a[k]) === JSON.stringify(b[k]);
    if (!same && !fDiff.includes(k)) fDiff.push(k);
  }
}
check('宗门字段一致', fDiff.length === 0, fDiff.length ? `未存：${fDiff.join(' ')}` : `${world.factions.length} 家`);
check('宗门关系是数值映射', clone.factions.every((f) => f.relations instanceof Map));
check('宗门交战名单是 Set', clone.factions.every((f) => f.war instanceof Set));

check('灵脉一致', clone.leylines.length === world.leylines.length, `${world.leylines.length} 条`);
check('地点一致', clone.sites.length === world.sites.length, `${world.sites.length} 处`);
check('飞升名录一致', clone.ascended.length === world.ascended.length);

// ── 法宝 ──
// 生灵身上的那一列（`entity.artifacts`）已经被上面「生灵字段逐项比对」覆盖了，
// 这里补的是**世界级**那三样：地上那批、id 计数器、累计账本。
// 漏掉 `nextArtifactId` 的后果最阴：新炼出的法宝会撞 id，
// 而「一件法宝只能在一个地方」这条不变量要到几百年后才显形。
check('地上的法宝逐字段一致',
  JSON.stringify(world.artifacts) === JSON.stringify(clone.artifacts),
  `${world.artifacts.length} 件（含履历）`);
check('法宝累计账本一致',
  JSON.stringify(world.artifactLog) === JSON.stringify(clone.artifactLog),
  JSON.stringify(world.artifactLog));
check('法宝 id 计数器一致', world.nextArtifactId === clone.nextArtifactId,
  `next ${world.nextArtifactId}`);
{
  let max = 0;
  for (const a of clone.artifacts) max = Math.max(max, a.id || 0);
  for (const e of clone.entities) for (const a of (e.artifacts || [])) max = Math.max(max, a.id || 0);
  check('读档后 nextArtifactId 比世上最大的 id 还大', clone.nextArtifactId > max,
    `next ${clone.nextArtifactId} > max ${max}`);
}

// ── 世家 ──
// 和法宝那一组同一个道理：实体身上那八列（surname/parentA/parentB/clan/gen/
// heritageQ/heritageB/heritageM）已经被「生灵字段逐项比对」覆盖了，
// 这里补的是**世界级**那四样：族谱、id 计数器、立族/断绝账本、立族冷却。
//
// 漏 `nextClanId` 的后果和漏 `nextArtifactId` 一模一样：新立的世家撞 id，
// 于是两家共用一个 clan id——`clanById()` 只返回第一个，
// 第二家的成员会被算进第一家，而两边的 `clanLog.founded` 照样在涨。
check('世家族谱逐字段一致',
  JSON.stringify(world.clans) === JSON.stringify(clone.clans),
  `${world.clans.length} 家（含堂号/世代/声望/家学/族史）`);
check('世家账本一致',
  JSON.stringify(world.clanLog) === JSON.stringify(clone.clanLog),
  JSON.stringify(world.clanLog));
check('世家 id 计数器一致', world.nextClanId === clone.nextClanId, `next ${world.nextClanId}`);
check('立族冷却也存了（不存的话读档后立刻又能立一族）',
  world.lastClanFoundDay === clone.lastClanFoundDay, `第 ${world.lastClanFoundDay} 日`);
{
  let max = 0;
  for (const c of clone.clans) max = Math.max(max, c.id || 0);
  check('读档后 nextClanId 比族谱上最大的 id 还大', clone.nextClanId > max,
    `next ${clone.nextClanId} > max ${max}`);
}
// 父子引用：`parentA`/`parentB` 指向的人**允许已经死了**（死人会从 entities 里移除，
// 所以不能要求 id 一定查得到）。能要求的是三件事：
//   · 不指向自己；· 双亲不是同一个 id；· 族谱上的人一定是「某人的后代或始祖」。
check('没有人的双亲指向自己', clone.entities.every((e) => e.parentA !== e.id && e.parentB !== e.id));
check('没有人的双亲是同一个人', clone.entities.every((e) => !e.parentA || e.parentA !== e.parentB));
check('世家归属不悬空（clan 要么 0，要么查得到）',
  clone.entities.every((e) => !e.clan || !!clone.clanById(e.clan)),
  `${clone.entities.filter((e) => e.clan).length} 位在谱上`);
check('在谱上的人一定有世代编号（≥1）',
  clone.entities.every((e) => !e.clan || (e.gen || 0) >= 1));
check('在谱上的人一定有姓氏（族名就是从姓来的）',
  clone.entities.every((e) => !e.clan || !!e.surname),
  [...new Set(clone.clans.map((c) => c.name))].slice(0, 6).join(' '));

// ── 大战与夺舍（手工构造，不依赖运气）──────────────────────
//
// 为什么不用「跑出来的」：夺舍要境界 ≥ 20 的死亡 + 15% 元神不散 + 掷中成功率，
// 大战要两家大门派攒够紧张度再掷签——两者在一次 120 年的跑动里都可能一次都不发生。
// 靠运气撑起来的判据，会在某次调参之后**静悄悄地不再测任何东西**（还是全绿）。
// 所以这里直接往序列化结果里塞一份确定的数据，专测「这三列 / 这四样存不存得住」。
//
// 为什么不另造一个小世界：直接拿主世界已经序列化好的那一份改，行里其它 57 列
// 都是真实跑出来的，只有 v6 那三格是手工填的——这样测的就是**读档这一侧**，
// 不掺任何「新世界刚好长成这样」的偶然。
{
  const raw = JSON.parse(JSON.stringify(payloadJson));
  const victimRow = raw.entities.find((r) => r.length === ENTITY_COLUMNS) || raw.entities[0];
  const victimId = victimRow[0];
  const victimOldName = victimRow[16];
  const snapshot = { name: '旧元神', level: 41, faction: 7, day: world.day - 360, suspected: 2 };
  const logRow = [{
    day: world.day - 720, year: 1, kind: 'awaken', text: '觉醒了火灵根。',
    key: 'awaken:火', importance: 59, level: 1,
  }];
  victimRow[16] = `${victimOldName}·异`;
  victimRow[ENTITY_COL_V6.log] = logRow;
  victimRow[ENTITY_COL_V6.possessedBy] = snapshot;
  victimRow[ENTITY_COL_V6.nascentEscapeUsed] = true;

  const war = {
    id: 9001, aId: 1, bId: 2, aName: '甲宗', bName: '乙宗',
    typeId: 'dao_dispute', typeLabel: '道争', place: '断魂崖', x: 12, y: 34,
    sideA: [1, 5], sideB: [2, 6], tension: 73, clashCount: 2,
    startedDay: 100, lastClashDay: 460, phase: 'clashing', outcome: null,
    winnerId: 0, loserId: 0, wounded: 4,
    casualties: [{ id: 77, name: '战殁者', level: 12, faction: 1, day: 460 }],
    result: null,
  };
  raw.wars = [war];
  raw.nextWarId = 9002;
  raw.warLog = { declared: 1, resolved: 0, destroyed: 0, casualties: 1 };
  raw.possessionLog = { succeeded: 3, failed: 1, suspected: 2, crossPlane: 4, haunted: 5 };

  const c2 = deserializeWorld(raw);
  const victim = c2.entities.find((e) => e.id === victimId);
  check('被夺舍者的名字带 ·异 后缀',
    !!victim && victim.name === `${victimOldName}·异`,
    victim ? victim.name : '（找不到该实体）');
  check('夺舍印记快照完整（五个字段全对）',
    !!victim && !!victim.possessedBy
      && diffFields(victim.possessedBy, snapshot, ['name', 'level', 'faction', 'day', 'suspected']) === '',
    victim && victim.possessedBy ? JSON.stringify(victim.possessedBy) : 'null');
  check('个人日志随实体存回来',
    !!victim && JSON.stringify(victim.log) === JSON.stringify(logRow),
    victim ? `${(victim.log || []).length} 条` : '（找不到）');
  check('元婴脱壳记账存回来', !!victim && victim.nascentEscapeUsed === true,
    victim ? String(victim.nascentEscapeUsed) : '（找不到）');
  check('夺舍累计账本没丢（五键，含 D 包 crossPlane / haunted）',
    diffFields(c2.possessionLog, raw.possessionLog, ['succeeded', 'failed', 'suspected', 'crossPlane', 'haunted']) === '',
    diffFields(c2.possessionLog, raw.possessionLog, ['succeeded', 'failed', 'suspected', 'crossPlane', 'haunted'])
      || JSON.stringify(c2.possessionLog));

  const w2 = c2.wars[0];
  check('进行中的大战读档后还在（phase/clashCount/tension/sideA/sideB/casualties）',
    !!w2 && JSON.stringify(w2) === JSON.stringify(war),
    w2 ? `phase=${w2.phase} clash=${w2.clashCount} tension=${w2.tension}`
      + ` sideA=[${w2.sideA}] sideB=[${w2.sideB}] 战殁=${(w2.casualties || []).length}`
      : `wars 长度 ${c2.wars.length}`);
  check('大战账本没丢',
    diffFields(c2.warLog, raw.warLog, ['declared', 'resolved', 'destroyed', 'casualties']) === '',
    JSON.stringify(c2.warLog));

  // id 兜底：故意把 `nextWarId` 压到比最大 id 还小，读档时必须就地抬上去。
  // 不抬的后果是「两场战事共用一个 id」——`warById()` 只返回第一个，
  // 而 `warLog.declared` 照样在涨，读档当时看不出任何异常。
  const rawLow = JSON.parse(JSON.stringify(raw));
  rawLow.nextWarId = 1;
  const c3 = deserializeWorld(rawLow);
  check('nextWarId 偏低时读档就地抬到比最大 id 还大', c3.nextWarId > 9001,
    `next ${c3.nextWarId} > max 9001`);
}

// ── 旧档降级：v5 老档（没有 v6/v7 的那些列与那几样世界级）──
//
// **这一条最要紧**：老档里缺的键若不补成默认值，就是「只在一侧存在的字段」——
// 新世界的人有 log / possessedBy / nascentEscapeUsed，读回来的没有，
// 同一个世界两种形状。而且这类缺键不会报错，只会让**任何遍历键的代码**
// （包括上面那条「没有只在一侧存在的字段」）从此永远对不上。
// 手法照抄冒烟测试里那条 v4 降级（`raw.v = 4; row.length = 49;`）。
{
  const raw = JSON.parse(JSON.stringify(payloadJson));
  raw.v = 5;
  // 砍掉 v6 追加的三列：`ENTITY_COL_V6.log` 就是 v5 的行长（57）。
  // 用常量而不是字面量 57，免得列数一变这里悄悄砍错。
  for (const row of raw.entities) row.length = ENTITY_COL_V6.log;
  delete raw.wars;
  delete raw.nextWarId;
  delete raw.warLog;
  delete raw.possessionLog;
  delete raw.dead;        // v7 才有的世界级两样，v5 档当然也没有
  delete raw.deadLog;
  // 阶段三才有的空间裂缝三样，v5 档更不会有。
  delete raw.rifts;
  delete raw.nextRiftId;
  delete raw.riftLog;
  // v8 才有的上界块，v5 档更不会有。必须删掉：留着的话这份「v5 老档」其实带着
  // 一个 v8 的 upper 块，读档走的是**还原**分支而不是**降级生成**分支——
  // 那样这条 v5 判据就测不到降级路径了，而它照样全绿。（v7 降级路径另有一条
  // 专门的判据，见第 6 节 ⑥。）
  delete raw.upper;
  const old = deserializeWorld(raw);
  check('v5 老档读回来：log 是空数组而不是 undefined',
    old.entities.every((e) => Array.isArray(e.log) && e.log.length === 0),
    `${old.entities.length} 位`);
  check('v5 老档读回来：possessedBy 是 null',
    old.entities.every((e) => e.possessedBy === null));
  check('v5 老档读回来：possessionScar 是 null（D6-3 工程包 D 的新列，老档没有）',
    old.entities.every((e) => e.possessionScar === null));
  check('v5 老档读回来：nascentEscapeUsed 是 false',
    old.entities.every((e) => e.nascentEscapeUsed === false));
  check('v5 老档读回来：wars 是空数组',
    Array.isArray(old.wars) && old.wars.length === 0, `${old.wars.length} 场`);
  check('v5 老档读回来：nextWarId 是 1', old.nextWarId === 1, String(old.nextWarId));
  check('v5 老档读回来：warLog 四字段全零',
    diffFields(old.warLog, { declared: 0, resolved: 0, destroyed: 0, casualties: 0 },
      ['declared', 'resolved', 'destroyed', 'casualties']) === '',
    JSON.stringify(old.warLog));
  check('v5 老档读回来：possessionLog 五字段全零（含 D 包 crossPlane / haunted）',
    diffFields(old.possessionLog, { succeeded: 0, failed: 0, suspected: 0, crossPlane: 0, haunted: 0 },
      ['succeeded', 'failed', 'suspected', 'crossPlane', 'haunted']) === '',
    JSON.stringify(old.possessionLog));
  check('v5 老档读回来：dead 是空数组而不是 undefined',
    Array.isArray(old.dead) && old.dead.length === 0, `${old.dead.length} 位`);
  check('v5 老档读回来：deadLog 三字段全零',
    diffFields(old.deadLog, { total: 0, ascended: 0, evicted: 0 },
      ['total', 'ascended', 'evicted']) === '',
    JSON.stringify(old.deadLog));
  check('v5 老档读回来：rifts 是空数组',
    Array.isArray(old.rifts) && old.rifts.length === 0, `${old.rifts.length} 条`);
  check('v5 老档读回来：nextRiftId 是 1', old.nextRiftId === 1, String(old.nextRiftId));
  check('v5 老档读回来：riftLog 五字段全零',
    diffFields(old.riftLog, { opened: 0, closed: 0, leaked: 0, crossed: 0, lost: 0 },
      ['opened', 'closed', 'leaked', 'crossed', 'lost']) === '',
    JSON.stringify(old.riftLog));
}

// ── 6. 上界（v8 · 三界并存）────────────────────────────────
//
// 上界是一个**独立的 World 实例**，凡间 world 上只挂一个引用 `world.upper`。
// 它的 entities / villages / factions 与凡间完全隔离，所以「两界 id 撞车」
// 不会发生——代价是**它整套都要单独进存档**（v8 起 payload 顶层多一个 `upper` 键）。
//
// 它**只存 6 层地形**（height/water/veg/type/over/struct）：
// `temp` / `moist` / `fire` / `riverBase` 刻意不存（规格 §1.3 的体积账，
// 中堂两层量化 Float32 ≈ 276 KB）。读档时照 seed **重新生成**一遍拿回来。
//
// ⚠️ 「不存、靠重新生成」这个设计把一条**真·存读档不等价**引了进来，
//    而它正是本节存在的全部理由——见下面 ②。
//
// ⚠️ 本节单独写、不并进第 3 节的通用比对，有两个理由：
//   · 上界的 terrain 形状与凡间**不同**（6 层 vs 11 层），塞进去会因为
//     `terrain` 对不上而红；
//   · `temp`/`moist` 的「不存但必须逐格拿回」需要一条自己的断言，
//     不能混在「键都在」里——它守的是**种子派生**，不是「有没有存」。
section('6. 上界（v8 · 三界并存）');

const up = world.upper;
const up2 = clone.upper;

// ⚠️ 这条**只**证明「读回来的上界与凡间同尺寸」，**不能**证明「存档里带了 upper 块」。
// 为什么：`deserializeWorld` 无论存档里有没有 `upper` **都会**造一个出来（有就还原、
// 没有就地生成，save.js:432-434），所以 `clone.upper` 永远非 null、尺寸也永远对得上
// ——「v8 块没写」这件事在 clone 侧**完全看不出来**。
// 要判「存档里到底有没有」只有一条路：查序列化结果的键集，那是第 3 节那条
// 「序列化结果顶层含全部世界级新字段（…/upper）」在管的事。
// 这条改名前叫「v8 路径：payload 里带了 upper 块」，**名不副实**——它会让人以为
// 键集已经有人验过了。本文件最怕的就是这种「看着验过了、其实没验」。
check('读档后有上界，且尺寸与凡间一致（不证明存档里有 upper，那是第 3 节的事）',
  !!up2 && !!up && up2.w === up.w && up2.h === up.h,
  up2 ? `${up2.w}×${up2.h}` : '（clone.upper 是 null —— v8 块没写或没读）');

if (up2) {
  // ── ⓪ 非有限数扫描要**走到上界** ──
  //
  // 第 1 节那条 `findNonFinite(world, 'world')` 会顺 `world.upper` 这个引用
  // 递归进去（它走 `Object.keys`，World 实例的字段都是可枚举的），
  // 但那一条的**报告文案看不出上界有没有被扫到**——「没扫」与「扫了且干净」
  // 长得一模一样。所以这里补一条**作用域收在上界**的扫描：
  // 它红了说明上界自己造出了非有限数；它绿了才真的证明上界那半边干净。
  //
  // ⚠️ 实测：上界**没有** `_terrCost`——阶段一它不跑 `territory.js`，
  //    代价层压根没建（第 1 节的哨兵计数只有凡间那一份，也印证了这点）。
  //    所以**不要**往 `NON_FINITE_ALLOWED` 里加 `world.upper._terrCost[]`：
  //    那是一条永远命中不了的死条目，会反过来把「白名单里没有已失效的条目」
  //    那条反向断言弄红。上界代价层落地那天再加，并且要带上理由。
  const upHits = findNonFinite(up, 'world.upper');
  const upSplit = splitNonFinite(upHits);
  check('上界块里没有非有限数（扫描作用域收在上界，确认它真被扫到）',
    upSplit.offendingCount === 0,
    upSplit.offendingCount === 0
      ? `${up.size} 格地形 + ${up.leylines.length} 条仙脉全部有限`
        + (upSplit.allowedCount
          ? `（另有设计内哨兵 ${upSplit.allowedCount} 处：${formatNonFinite(upSplit.allowed)}）`
          : '（无设计内哨兵：上界不跑 territory，代价层未建）')
      : `${upSplit.offending.size} 类 / ${upSplit.offendingCount} 处：${formatNonFinite(upSplit.offending)}`);

  // ── ① 种子派生：两条断言必须**同时**成立 ──
  //
  // `deriveUpperSeed(x) = x ^ 0x55505052` 是**异或自逆**的，所以「多派生一次」
  // 不会让种子变远，而是让它**精确地回到凡间种子**——不报错、不崩溃。后果两层：
  //   · 第一层（看得见）：`Life` 的 `warRng = mulberry32(seed ^ 0x776172)`
  //     （`sim/life.js:124`）两界完全重合，两场战事会在同一时刻、以同样的签数发生；
  //   · 第二层（看不见，更阴）：`temp`/`moist` 不进存档、靠「照 seed 重新生成」
  //     拿回，种子一错这两层就**静默换成另一张气候图**，而 `type` 是存档旧值，
  //     读档那一刻看不出任何异常——洞要到玩家在上界动一次地形（触发
  //     `classify` 读 `temp`/`moist`）才张开。
  //
  // 两条缺一不可：只查「派生正确」抓不到「传错种子恰好抵消」，
  // 只查「不等于凡间种子」抓不到「派生成了别的数」。
  const expectedUpperSeed = deriveUpperSeed(world.seed);
  check('上界 seed === deriveUpperSeed(凡间 seed)',
    up2.seed === expectedUpperSeed,
    `实测 ${up2.seed}，应为 ${expectedUpperSeed}`);
  check('上界 seed !== 凡间 seed（两界战争随机流不重合）',
    up2.seed !== world.seed,
    `上界 ${up2.seed} vs 凡间 ${world.seed}`);

  // ── ② temp / moist 逐格一致（本节最要紧的一条）──
  //
  // 这两层**不在存档里**，读回来的是 `deserializeUpperWorld` 照 seed 重新生成的。
  // 于是「种子派生对了」这件事，唯一能被观测到的后果就是这两层对不对得上：
  //   · 种子错了 → 重新生成出另一张气候图 → 这里逐格不等 → 红；
  //   · 而 `type` 是存档里的旧值，读档瞬间**一切正常**。
  //
  // ⚠️ 这一条是那个「双重派生」bug 的**唯一观测点**。只比对「存档里存了的字段」
  //    （下面 ③④）**永远抓不到它**——坏掉的两层压根不在存档里，比无可比。
  //    这也是本节顺序「先 temp/moist、再逐字段」的原因。
  let upTempBad = 0;
  let upMoistBad = 0;
  for (let i = 0; i < UPPER_TEMP_BEFORE.length; i += 1) {
    if (UPPER_TEMP_BEFORE[i] !== up2.temp[i]) upTempBad += 1;
    if (UPPER_MOIST_BEFORE[i] !== up2.moist[i]) upMoistBad += 1;
  }
  check('读档后上界 temp 与存档前逐格一致（不存，靠 seed 重新生成）',
    upTempBad === 0,
    upTempBad
      ? `不同 ${upTempBad} / ${UPPER_TEMP_BEFORE.length} 格（种子派生错 → 换了一张气候图）`
      : `${UPPER_TEMP_BEFORE.length} 格`);
  check('读档后上界 moist 与存档前逐格一致',
    upMoistBad === 0,
    upMoistBad ? `不同 ${upMoistBad} / ${UPPER_MOIST_BEFORE.length} 格`
      : `${UPPER_MOIST_BEFORE.length} 格`);

  // 自检：上面两条**真的会因为双重派生而红**吗？
  //
  // 「一支不会因为漏存而红的等价测试，等于没有」——同一条纪律（见第 3 节末尾
  // 那条把 deadLog 从序列化结果里抠掉的自检）。这里不去动 save.js，而是**当场
  // 造一张「多派生一次」的上界**（`seed: deriveUpperSeed(凡间 seed)`），看它的
  // 气候与正确的那张差多少格：
  //   · 差 0 格 → temp 对种子不敏感 → 上面两条是**假判据**，这条自检必须红；
  //   · 差几万格 → 「双重派生」这个 bug 一旦落进 save.js，上面两条必然抓住。
  // 顺带把 `deriveUpperSeed` 的**异或自逆**性质钉在测试里：它派生的不是
  // 「另一个数」，而是**精确地回到凡间种子**——这正是那个 bug 不报错的原因。
  const doubleDerived = generateUpperWorld({
    preset: { w: up.w, h: up.h },
    seed: deriveUpperSeed(world.seed),
  });
  check('自检：双重派生会把上界种子退回凡间种子（异或自逆）',
    doubleDerived.seed === world.seed,
    `双重派生 seed=${doubleDerived.seed} vs 凡间 ${world.seed}`);
  let dblBad = 0;
  for (let i = 0; i < up.size; i += 1) if (doubleDerived.temp[i] !== up.temp[i]) dblBad += 1;
  check('自检：双重派生的上界气候与正确的**不同**（上面 temp 判据真的会红）',
    dblBad > 0, `差 ${dblBad} / ${up.size} 格`);

  // ── ③ 六层地形逐格一致 ──
  // height/water/veg 是量化 Float32（允许 1 个量化步长，与第 2 节同口径），
  // type/over/struct 是字节层（必须严格相等）。
  for (const k of ['height', 'water', 'veg']) {
    let max = 0;
    for (let i = 0; i < up.size; i += 1) max = Math.max(max, Math.abs(up[k][i] - up2[k][i]));
    check(`上界 ${k} 误差在量化界内`, max <= QUANT_STEP * 1.01, `最大 ${max.toExponential(2)}`);
  }
  for (const k of ['type', 'over', 'struct']) {
    let bad = 0;
    for (let i = 0; i < up.size; i += 1) if (up[k][i] !== up2[k][i]) bad += 1;
    check(`上界 ${k} 逐格一致（字节层）`, bad === 0, bad ? `不同 ${bad} 格` : `${up.size} 格`);
  }

  // ── ④ upper 块逐字段比对（键集从 payload.upper 反推，不手抄）──
  //
  // 与第 3 节凡间那套**同一套机制**，理由也一样：手抄清单一定会漏，
  // 漏了就是静默绿。`serializeUpperWorld` 本身就是「先照 `serializeWorld`
  // 整个存一遍、再把地形裁到 6 层」，所以它的键集天然与凡间同源——
  // 哪天 save.js 给凡间加了新的世界级字段，上界这块会自动多一个键，
  // 下面这条断言也就自动开始比它，不需要人来改清单。
  const UPPER_EXEMPT = new Map([
    ['v', '存档版本号：只用来选降级分支，不参与语义等价'],
    ['app', '客户端版本号：纯元信息'],
    ['meta', '存档元信息：与模拟状态无关'],
    ['terrain', '上界地形只存 6 层（凡间 11 层），形状不同，本节 ③ 已逐层比'],
    ['entities', '上界生灵：payload 是行数组、解档后是实体对象，形状不同。'
      + '阶段二起**不再恒空**（开局十二人 + 飞升者），逐字段比在 ④c；'
      + '恒空与否不是豁免理由——形状不同才是'],
    ['villages', '上界聚落：payload 只存子集。上界**恒空**（规格 §2.4「上界没有凡人，'
      + '也没有聚落」），恒空判据在 ④b'],
    ['factions', '上界宗门：relations / war 两侧是 Map / Set，形状不同。'
      + '阶段二起**不再恒空**（上界仙门，`upperLife.maybeFoundSects`）'],
    ['ascended', '飞升名录：序列化时 slice(-120) 截断，这里只比条数'],
    ['busanzi', '卜算子：payload 只存六项子集'],
  ]);
  const upCompared = [];
  const upDiff = [];
  for (const k of Object.keys(payloadJson.upper)) {
    if (UPPER_EXEMPT.has(k)) continue;
    upCompared.push(k);
    const va = up[k];
    const vb = up2[k];
    const scalar = va === null || typeof va !== 'object';
    const same = scalar ? va === vb : JSON.stringify(va) === JSON.stringify(vb);
    if (!same) {
      upDiff.push(`${k}: 左 ${JSON.stringify(va).slice(0, 50)} ≠ 右 ${JSON.stringify(vb).slice(0, 50)}`);
    }
  }
  check('上界块逐字段一致（键集从 payload.upper 反推，不手抄清单）',
    upDiff.length === 0,
    upDiff.length ? upDiff.join(' | ') : `${upCompared.length} 键：${upCompared.join(' ')}`);

  // 上界**独有**的三样（`io/save.js:469` 的 `UPPER_ONLY_KEYS`）：
  // popLog / arrivedLog / mortalLog。
  //
  // ⚠️ 这个数组是**自激活**的：写侧「存在才写」、读侧「存在才还原」，所以下面
  //    这条判据**不需要谁来改**——`worldgenUpper` 把某个字段造出来那天，它立刻
  //    开始要求该字段存得住、读得回。（凡是「要人记得回来加一行」的清单，迟早
  //    会漏——v6 的 possessionLog 与 v7 的 dead/deadLog 两次假绿都是这么来的。）
  //    现状：`popLog` / `arrivedLog` **已落地**（`resetUpperSystems` 建了这两本账），
  //    所以本条此刻**真的在守**；`mortalLog`（阶段三裂缝的「上界可查名册」）
  //    尚未实现，仍然空转待命——自激活的意思是「它一落地就自动被守上」。
  //
  // ⚠️⚠️ `realmCap` 与 `bottlenecks` **已从本数组删掉**，也已从
  //    `io/save.js` 的 `UPPER_ONLY_KEYS` 里删掉（本轮同步）。这是**决定不实现**，
  //    不是**忘了**——下一个读到这儿的人请**不要**把它们加回来。理由是本项目
  //    **铁律二「能现算的派生量不入档」**：
  //      · 境界天花板现在由 `core/cultivation.js` 的 `ceilingFor(plane)` **现算**
  //        （凡间 60 / 上界 69），`bottlenecks` 就是同一文件里那张常量表；
  //      · 把现算量存进存档 = **造出第二个真源**，而两个真源迟早漂移；漂移的
  //        后果是「上界能突破到多少级」在存档里与在代码里给出**不同**答案，
  //        而且**不报错**——玩家只会看到某个人莫名其妙卡在某一级；
  //      · 同一条铁律下的既有例子：`world.qi` 不入档（读档后重算）、上界的
  //        `temp` / `moist` 不入档（照 seed 重新生成，本节 ② 逐格比）。
  //    核实依据（删之前查过）：全 `src/inkbox` 里除了 `io/save.js` 那一行
  //    `UPPER_ONLY_KEYS`，**没有任何生产者/消费者**写过或读过这两个键——
  //    `worldgenUpper.resetUpperSystems` 不建它们，`cultivation.js` 走的是
  //    `ceilingFor(plane)`。所以它们从来不是上界 world 上的字段，写侧
  //    「存在才写」永不触发，是两条**死条目**。
  const UPPER_ONLY_KEYS = ['popLog', 'arrivedLog', 'mortalLog'];
  const upOnlyLive = UPPER_ONLY_KEYS.filter((k) => up[k] !== undefined);
  const upOnlyBad = upOnlyLive.filter((k) =>
    !Object.prototype.hasOwnProperty.call(payloadJson.upper, k)
    || JSON.stringify(up[k]) !== JSON.stringify(up2[k]));
  check(`上界独有字段（${UPPER_ONLY_KEYS.join('/')}）存得住`,
    upOnlyBad.length === 0,
    upOnlyBad.length
      ? `丢了 / 对不上：${upOnlyBad.join(' ')}`
      : `${upOnlyLive.length}/${UPPER_ONLY_KEYS.length} 样已落地`
        + (upOnlyLive.length === 0 ? '（尚未实现：本条此刻空转，落地即自动生效）' : ''));
  // 什么故障会让它变红：`popLog` / `arrivedLog` 被漏存或漏还原——上界的人口
  //   三本账（飞升 / 化生 / 陨落）读档后凭空归零，长测的人口曲线从此与
  //   「接着玩」那条线分叉，而不报错。

  // 铁律二的**反向闸门**：既然天花板与瓶颈表「决定不实现」，就得有人盯着它们
  // **别**以状态字段的形式冒出来。删掉两个条目却不装新闸门，等于把「不许存
  // 派生量」这条规则降级成一句注释（「只删不补 = 拆了闸门没装新的」）。
  // 什么故障会让它变红：有人把 `realmCap` / `bottlenecks` 挂成上界 world 的
  //   **状态**字段（而不是现算），或 `save.js` 把它写进了 payload——那就是
  //   铁律二的破口，第二份真源从那天开始漂移，且不报错。
  const derivedLeak = ['realmCap', 'bottlenecks'].filter((k) =>
    up[k] !== undefined || Object.prototype.hasOwnProperty.call(payloadJson.upper, k));
  check('境界天花板与瓶颈表不入档（能现算的派生量不入档：ceilingFor(plane) 现算）',
    derivedLeak.length === 0,
    derivedLeak.length
      ? `派生量被存成了上界状态：${derivedLeak.join(' ')}（铁律二破口：造出第二份真源）`
      : 'realmCap / bottlenecks 既不在上界 world 上、也不在 payload 里');

  // ── ④b 上界**不跑凡间专属系统**（阶段二口径，规格 §2.3 / §2.4）──
  //
  // 这条在阶段一时是「上界没有生灵 / 聚落 / 宗门」。阶段二之后它**按预期改写**，
  // **不是删掉**：上界现在有自己的生灵（开局十二人 + 飞升者）、自己的仙门、
  // 自己的始祖线，那三样**应该**非空，所以从「恒空」名单里**移出**——正向断言
  // 在下面 ④c（只删不补 = 拆了闸门没装新的）。
  //
  // 留下来的是**凡间专属、上界永远不该跑**的系统。名单以**源码**为准，不凭印象：
  // `worldgenUpper.js` 的 `resetUpperSystems()` 就是「上界不跑的系统」的
  // **机器可读形态**（它存在的意义正是把这份语义钉在代码里，而不是靠
  // 「World 构造函数碰巧没给初值」这个偶然事实）。逐项对应它的小节号：
  //   1 卜算子 · 2 夺舍 · 4 神魂/幽冥 · 6 大战 · 7 飞升记录 · 5 世家**账本**（不含 clans）
  // 另加一项源码依据充分的：凡人聚落 `villages`。
  //
  // ⚠️ 两处**不**在名单里，理由必须写清（不然下一个人会以为是漏了、又加回去）：
  //   · `dead` / `deadLog.total` —— 上界**跑**逝者名录！`upperLife.bury()` 调
  //     `rememberDead(upper, e)` 把上界陨落者入册（`sim/upperLife.js:140`，
  //     注释原话「未来幽冥/名录面板读上界时不需要第二套解析」）。它是上界自己的
  //     真实状态，只是**开局为空**（`resetUpperSystems` 清零一次，那是「干净基线」
  //     而不是「永远不写」）。把它写进恒空名单，等于断言「上界的人不会死」——
  //     一旦本测试将来接上 `UpperLife`，那会是一条**假红**。
  //   · `clans` / `entities` / `factions` —— 上界自己的真实状态（见上）。
  //
  // `villages` 恒空的依据（这一项要单独给依据，因为它不在 resetUpperSystems 的
  // 七个系统里）：① 规格 §2.4「上界没有凡人，也没有聚落」；② 开局十二人一律
  // `village: 0`（`worldgenUpper.js:570-573` 明文），`upperLife.maybeBorn` 同样
  // `village: 0`；③ 仙门记录里 `villages: []`，`maybeFoundSects` 注释写明
  // 「上界宗门不做凡间那套收编村庄」；④ 全项目 `world.villages.push` **只**出现在
  // `sim/life.js`（凡间），上界没有任何一条代码路径能造出聚落。
  //
  // 什么故障会让它变红：`World` 构造函数将来给某个字段留了**非空初值**
  // （比如「默认一家示例宗门」「默认一个卜算子里程碑」），而 `resetUpperSystems`
  // 漏了对应那一行——上界会安静地多出不该有的状态，**不报错**；或者上界被错接了
  // 凡间系统（错接夺舍、错开战、飞升者被错记成「又飞升了一次」）。都不抛错。
  const upperForbidden = (w) => {
    const bad = [];
    let checked = 0;
    const empty = (label, arr) => { checked += 1; if (arr.length !== 0) bad.push(`${label}=${arr.length}`); };
    const zero = (label, v) => { checked += 1; if (v !== 0) bad.push(`${label}=${v}`); };
    const falsy = (label, v) => { checked += 1; if (v !== false) bad.push(`${label}=${v}`); };
    // 1. 卜算子
    falsy('busanzi.met', w.busanzi.met);
    zero('busanzi.acts', w.busanzi.acts);
    empty('busanzi.milestones', w.busanzi.milestones);
    zero('busanzi.peakPop', w.busanzi.peakPop);
    zero('busanzi.tier', w.busanzi.tier);
    // 2. 夺舍
    zero('possessionLog.succeeded', w.possessionLog.succeeded);
    zero('possessionLog.failed', w.possessionLog.failed);
    zero('possessionLog.suspected', w.possessionLog.suspected);
    // D6-3 工程包 D 追加的跨位面子账：上界既无鬼修也无幽冥缝，
    // 这两键在上界恒零——正面钉住「上界不会长出跨位面夺舍」。
    zero('possessionLog.crossPlane', w.possessionLog.crossPlane);
    zero('possessionLog.haunted', w.possessionLog.haunted);
    // 4. 神魂 / 幽冥 —— 上界陨落者的魂路（走幽冥还是消散）尚未拍板，
    //    阶段二不给它编一个去向，所以魂池恒空（`upperLife.js:131-134`）。
    empty('souls', w.souls);
    // 魂路累计账本（v9）。上界不跑 `enterNether`，五键恒零——这条与上面
    // `riftLog` 那五行同理，正面钉住「上界不会长出魂路账」。
    zero('soulLog.natural', w.soulLog.natural);
    zero('soulLog.linger', w.soulLog.linger);
    zero('soulLog.ghost', w.soulLog.ghost);
    zero('soulLog.wraith', w.soulLog.wraith);
    zero('soulLog.gone', w.soulLog.gone);
    // 6. 大战
    empty('wars', w.wars);
    zero('warLog.declared', w.warLog.declared);
    // 7. 飞升记录 —— 上界没有飞升出口（`cultivation.js` 按 plane 分流）。
    empty('ascended', w.ascended);
    // 5. 世家**账本**（`clans` 已移出这一条，账本仍在）
    zero('clanLog.founded', w.clanLog.founded);
    zero('clanLog.ended', w.clanLog.ended);
    // 另加：凡人聚落
    empty('villages', w.villages);
    // 8. 空间裂缝 —— 凡间专属（规格 §4.2：裂缝开在凡间边缘），上界恒空恒零。
    //    `serializeUpperWorld` 刻意不写这三样，读侧靠 `restoreWorldState` 兜成空；
    //    这条同时钉住「上界不会长出裂缝」——否则上界会静默跑起凡间系统。
    empty('rifts', w.rifts);
    // `nextRiftId` 的初值是 1（`World` 构造器），**不是 0**——上界不跑裂缝，
    // 所以它恒为 1。用 `!== 1` 而不是 `zero`：0 才是「没初始化」的形状。
    checked += 1;
    if (w.nextRiftId !== 1) bad.push(`nextRiftId=${w.nextRiftId}`);
    zero('riftLog.opened', w.riftLog.opened);
    zero('riftLog.closed', w.riftLog.closed);
    zero('riftLog.leaked', w.riftLog.leaked);
    zero('riftLog.crossed', w.riftLog.crossed);
    zero('riftLog.lost', w.riftLog.lost);
    // 9. 凡间鬼影（D6-3 工程包 B）—— 缝开在凡间、鬼爬进**凡间**，上界恒空恒零。
    //    `serializeUpperWorld` 刻意不写这两样，读侧靠 `restoreWorldState` 兜成
    //    空数组 / `{dissolved:0}`；这条同时钉住「上界不会长出鬼影」。
    empty('wraiths', w.wraiths);
    zero('wraithLog.dissolved', w.wraithLog.dissolved);
    return { bad, checked };
  };
  const fLive = upperForbidden(up);
  const fLoaded = upperForbidden(up2);
  const forbiddenBad = [
    ...fLive.bad.map((s) => `原世界 ${s}`),
    ...fLoaded.bad.map((s) => `读档后 ${s}`),
  ];
  check('上界不跑凡间专属系统：卜算子 / 夺舍 / 神魂 / 大战 / 飞升记录 / 世家账本 / 凡人聚落 / 空间裂缝 / 凡间鬼影 全部恒空恒零',
    forbiddenBad.length === 0,
    forbiddenBad.length
      ? forbiddenBad.join(' | ')
      : `${fLive.checked} 项 × 2 侧（原世界 + 读档后）全空 / 全零`);

  // 上界的编年史**开局恒空**（`seedUpperPopulation` 明文不写 `chronicle`：
  // 开局十二人是「开局状态」，不是「事件」）。它**不并进上面那条**，因为语义
  // 不同——上面是「上界不跑这个系统」，这条是「开局不写事件」。阶段二的立派 /
  // 陨落**会**写编年史，那时这条该随之改写（改成「只有事件才写」），不是删掉。
  // 什么故障会让它变红：有人在 `generateUpperWorld` 里调了 `world.record(...)`
  //   （例如给开局十二人补一条「紫霄初立，十二仙裔降世」）——那会污染
  //   「上界编年史里没有凡间话术」这条干净基线，而且不报错。
  check('上界的编年史开局恒空（开局不是事件，只有事件才写）',
    up.chronicle.length === 0 && up2.chronicle.length === 0,
    `原世界 ${up.chronicle.length} 条 · 读档后 ${up2.chronicle.length} 条`);

  // ── ④c 阶段二：上界的**开局人口与始祖线**（规格 §2.3.1 / §2.3.3）──
  //
  // 上界开局十二人分 3 条始祖线（`worldgenUpper.seedUpperPopulation`），用现成的
  // `clan` 字段表示：注册进 `upper.clans` / `upper.nextClanId`，每人
  // `entity.clan = <clanId>`、`entity.gen = 1`。
  //
  // 这四样都是**上界自己的真实状态**，必须整套进存档。丢任何一样的后果都一样：
  // 不报错，只是「始祖线」这条设定静悄悄消失——`entity.clan` 指向一个读档后
  // 不存在的 id，族谱断线而没有任何提示。
  //
  // ① 始祖线**条数与成员归组**。成员数按 `entity.clan` **现算**，不另记一份
  //    （记了就是第二个真源，迟早漂移）。
  // 什么故障会让它变红：序列化侧漏掉 `clans`（读档后只剩 0 条，`clanById` 全线
  //   落空）；或读档侧漏还原 `entity.clan`（成员数整片对不上）。
  const groupByClan = (w) => {
    const m = new Map();
    for (const e of w.entities) {
      if (!e.clan) continue;
      m.set(e.clan, (m.get(e.clan) || 0) + 1);
    }
    return m;
  };
  const gLive = groupByClan(up);
  const gLoaded = groupByClan(up2);
  const clanIds = [...new Set([...gLive.keys(), ...gLoaded.keys()])].sort((a, b) => a - b);
  const groupBad = clanIds.filter((id) => (gLive.get(id) || 0) !== (gLoaded.get(id) || 0));
  check('上界始祖线存得住：条数一致，且每条线的成员数（按 entity.clan 归组）逐条一致',
    up2.clans.length === up.clans.length && up.clans.length > 0 && groupBad.length === 0,
    up.clans.length === 0
      ? '上界一条始祖线都没有 —— 开局人口的血脉线没落地（`> 0` 是刻意的：`0 === 0` 的断言等于没断言）'
      : groupBad.length
        ? `成员数对不上：${groupBad.map((id) => `#${id} ${gLive.get(id) || 0}→${gLoaded.get(id) || 0}`).join(' ')}`
        : `${up2.clans.length} 条 · 成员 ${clanIds.map((id) => `#${id}×${gLive.get(id) || 0}`).join(' ')}`);

  // ② 每条始祖线的**全部字段**逐字段一致。键集从 `payload.upper.clans` 反推
  //    （那是「实际存了什么」的真源），并上原世界与读档后的键——**不手抄清单**：
  //    手抄的清单一定会漏，漏了就是静默绿。逐字段摊开是为了**指出是哪一项**，
  //    不是只说「两坨 JSON 不一样」。
  // 什么故障会让它变红：`clan` 记录里任何一个字段在序列化 / 还原时被丢掉或换了
  //   值——`surname` 丢了族名会退化成取名字首字；`founderId` / `seatX` / `seatY`
  //   丢了，族谱与地图上的祖地就跟人对不上号。
  const clanKeys = new Set();
  for (const row of (payloadJson.upper.clans || [])) for (const k of Object.keys(row)) clanKeys.add(k);
  for (const c of up.clans) for (const k of Object.keys(c)) clanKeys.add(k);
  for (const c of up2.clans) for (const k of Object.keys(c)) clanKeys.add(k);
  const clanFieldBad = [];
  for (let i = 0; i < Math.max(up.clans.length, up2.clans.length); i += 1) {
    const a = up.clans[i];
    const b = up2.clans[i];
    const d = diffFields(a, b, [...clanKeys]);
    if (d) clanFieldBad.push(`#${(a || b || {}).id}: ${d}`);
  }
  check('上界始祖线逐字段一致（键集从 payload.upper.clans 反推，不手抄清单）',
    clanFieldBad.length === 0,
    clanFieldBad.length
      ? clanFieldBad.join(' | ')
      : `${up2.clans.length} 条 × ${clanKeys.size} 字段：${[...clanKeys].join(' ')}`);

  // ③ 上界实体身上的 `clan` / `gen` 存得住。
  //    `clan` 是一条**跨「人 ↔ 始祖线」的引用**：它在实体行里是一列 id（`save.js`
  //    的 v5 家世八列之一）。丢了就是静默断谱——读档后按 clan 反查全线落空，
  //    族谱面板变成空列表，而没有任何报错。`gen`（世代编号，始祖为 1）同理。
  // 什么故障会让它变红：`save.js` 的实体行漏掉 `clan` / `gen` 两列，或读档侧
  //   忘了还原它们（写侧 `num(e.clan, 0)`、读侧同样 `num(row[...], 0)`）。
  //   顺带要求「至少有一个人 clan > 0」：全员 clan 都是 0 时，`0 === 0` 也会全绿。
  const upById = new Map(up2.entities.map((e) => [e.id, e]));
  const clanGenBad = [];
  let upperWithClan = 0;
  for (const e of up.entities) {
    const b = upById.get(e.id);
    if (!b) { clanGenBad.push(`#${e.id} 整个丢了`); continue; }
    if (e.clan) upperWithClan += 1;
    if (e.clan !== b.clan) clanGenBad.push(`#${e.id} clan ${e.clan}→${b.clan}`);
    if (e.gen !== b.gen) clanGenBad.push(`#${e.id} gen ${e.gen}→${b.gen}`);
  }
  check('上界实体的 clan / gen 读档后仍在（clan 是跨「人 ↔ 始祖线」的引用，丢了就是静默断谱）',
    clanGenBad.length === 0 && upperWithClan > 0,
    clanGenBad.length
      ? clanGenBad.slice(0, 8).join(' | ')
      : `${up.entities.length} 位 · 其中 ${upperWithClan} 位在谱上（clan > 0）`);

  // ④ 上界的人口**四本账**：`seeded` / `arrived` / `born` / `died`。
  //
  //    为什么开局那 12 人必须另立 `seeded`、绝不能记进 `arrived` 或 `born`：
  //    长测的两条验收判据正是 `arrived > 0`（飞升通道通了）与 `born > 0`（上界真在
  //    繁衍）。开局 12 人若被记进去，那两条会在「飞升通道其实断了」「化生其实从没
  //    触发」的世界里**照样变绿**——判据被开局状态污染，从此失去信号价值。
  //
  //    ⚠️ **这里刻意不写 `arrived === 0`**（交接规格草案里是这么写的；照写跑出来
  //    是红的，而且**红得对**）：本测试自己把凡间跑了 120 年，期间**真的有飞升者
  //    上来**（实测 `arrived = 1`）。那个 1 是诚实的读数，不是「开局人口冒充来源」。
  //    正确的判据分两条，各守一头：
  //      · **开局那一刻**三本账必须全 0 —— 用一张**新生成**的上界量（第一条），
  //        它没跑过任何演化，`arrived` / `born` / `died` 非 0 就只能是生成期写错的；
  //      · **运行期**用**账本守恒**（第二条）：`entities === seeded + arrived +
  //        born − died`。开局 12 人若被同时记进 `seeded` 与 `arrived`，这个恒等式
  //        当场不成立——「冒充」的定义就是这个。
  //
  // 什么故障会让它变红：① 序列化 / 还原漏掉 `popLog`（或漏掉 `seeded` 这个阶段二
  //    新加的第四键）；② 有人把开局人口记进 `arrived` / `born`；③ `bury` 移出实体
  //    却忘了 `died += 1`（人口账与实体表从此对不上，长测曲线悄悄失真，不报错）。
  const freshUpper = generateUpperWorld({ preset: { w: up.w, h: up.h }, seed: world.seed });
  check('上界开局那一刻人口三本账全为 0（开局人口只记 seeded，不冒充 arrived / born）',
    freshUpper.popLog.seeded === 12
      && freshUpper.popLog.arrived === 0
      && freshUpper.popLog.born === 0
      && freshUpper.popLog.died === 0,
    `seeded ${freshUpper.popLog.seeded} · arrived ${freshUpper.popLog.arrived}`
    + ` · born ${freshUpper.popLog.born} · died ${freshUpper.popLog.died}`);
  const pl = up.popLog || {};
  const pl2 = up2.popLog || {};
  const ledgerLive = pl.seeded + pl.arrived + pl.born - pl.died;
  const ledgerLoaded = pl2.seeded + pl2.arrived + pl2.born - pl2.died;
  check('上界人口账本守恒且存得住：entities === seeded + arrived + born − died（两侧都成立）',
    ledgerLive === up.entities.length && ledgerLoaded === up2.entities.length
      && pl2.seeded === pl.seeded && pl2.arrived === pl.arrived
      && pl2.born === pl.born && pl2.died === pl.died,
    `seeded ${pl.seeded}→${pl2.seeded} · arrived ${pl.arrived}→${pl2.arrived}`
    + ` · born ${pl.born}→${pl2.born} · died ${pl.died}→${pl2.died}`
    + ` | 账 ${ledgerLive} / 实体 ${up.entities.length}（原世界）`
    + ` · 账 ${ledgerLoaded} / 实体 ${up2.entities.length}（读档后）`);

  // ⑤ 上界**全部实体**读档后逐字段一致（开局十二人 + 飞升者）。
  //    复用第 4 节凡间那套逐字段比对机制（`compareEntityFields`，键集取并集）——
  //    **不另写一套**：两份实现迟早各自演化，然后其中一份悄悄不再发现漏存。
  //
  //    ⚠️ 范围从「开局十二人」扩到**全部上界实体**（含飞升者），这是本次改动的
  //    承重点。上一版只比开局十二人，飞升者整个不在比对范围内——而
  //    `fromMortal` / `mortalId` 不入档这件事，恰恰只会在飞升者身上现形。
  //    「只比一部分人」等价于「另一部分人的字段丢了也没人管」，上一版就是这么
  //    漏掉飞升者来历的。所以改成比全部，**不留任何「这一批不用比」的口子**。
  //
  //    ── 为什么不为飞升者逐条豁免字段 ──
  //    扩范围时最容易顺手写一串豁免理由，但那种理由往往就是「静默忽略」的
  //    另一种写法。这里**一条豁免都没加**，因为飞升者身上那些「被切断」的
  //    字段在两世界里**本来就相等**，不需要豁免：
  //      · `relations` —— `arriveUpper` 切成空 Map，读档侧对空关系网同样给
  //        空 Map，两侧相等（且 `compareEntityFields` 本来就跳过 `relations`，
  //        Map 的逐条比在别处做）；
  //      · `artifacts` —— `arriveUpper` 清成 `[]`，存档写 `e.artifacts || []`
  //        = `[]`，读档回 `[]`，两侧相等；
  //      · `faction` / `clan` / `gen` / `village` —— `arriveUpper` 一律清 0，
  //        两侧都是 0，相等。
  //    关键点：**切断发生在「入档前」**，存档存的是切断后的值，读档读回的
  //    是同一个值——这不是「字段丢了」。真正会丢的是 `fromMortal` / `fromSect`
  //    （v8 才补进存档），它们有下面 ⑤c 的专门判据。
  //
  // 什么故障会让它变红：任何一位上界实体（含飞升者）在存档里整个丢了、或它的
  //    任何一列在序列化 / 还原时换了值（漏初始化与漏存都会在这里现形，因为键集
  //    取并集）。上一版的 `fromMortal` / `mortalId` 缺口就是这一类。
  const allUpDiff = compareEntityFields(up.entities, up2.entities);
  const allUpBad = allUpDiff.missingIds.length || allUpDiff.diffs.size
    || allUpDiff.onlyLive.size || allUpDiff.onlyClone.size;
  check('上界全部实体（开局十二人 + 飞升者）读档后逐字段一致',
    up.entities.length > 0 && allUpBad === 0,
    allUpBad
      ? `丢失 ${allUpDiff.missingIds.length} 位`
        + ` · 值对不上：${[...allUpDiff.diffs].map(([k, n]) => `${k}×${n}`).join(' ')}`
        + ` · 只活在原世界：${[...allUpDiff.onlyLive].map(([k, n]) => `${k}×${n}`).join(' ')}`
        + ` · 只活在读档后：${[...allUpDiff.onlyClone].map(([k, n]) => `${k}×${n}`).join(' ')}`
      : `${up.entities.length} 位（开局 ${up.entities.filter((e) => !e.fromMortal).length}`
        + ` + 飞升 ${up.entities.filter((e) => e.fromMortal).length}）`
        + ` × ${new Set(up.entities.flatMap((e) => Object.keys(e))).size} 字段`);

  // ⑤b 开局人口**形状**：正好十二人（3 条始祖线 × 4 人，06 册 §〇 第 1 条）。
  //    「十二人全在、字段都对」已被上面 ⑤ 覆盖；这里单独钉的是 `seeded` 账面
  //    与实际落座数一致、且正好 12——那是**开局人口账本**的形状，不是字段等价，
  //    两件事不能并成一条（混在一起，红了会分不清是哪件坏了）。
  // 什么故障会让它变红：`seedUpperPopulation` 少发 / 多发人，或有人把开局人口
  //    记进了别的账（`arrived` / `born`），于是 `seeded` 与落座数对不上。
  const seededLive = up.entities.filter((e) => !e.fromMortal);
  check('上界开局人口正好十二人（seeded 账面 == 实际落座数 == 12）',
    pl.seeded === 12 && seededLive.length === pl.seeded,
    `seeded=${pl.seeded}，实际落座 ${seededLive.length} 位`);

  // ⑤c 飞升者的**来历快照**存得住（v8 内追加的实体行 row[60..61]）。
  //
  //    `arriveUpper`（`world/planes.js:250-256`）给每位飞升者落两样东西：
  //      · `fromMortal` —— 布尔，是不是自凡间上来的；
  //      · `fromSect`   —— 来之前在凡间的宗门**名字**（字符串 | null）。
  //    它们是「这个人从哪来」的全部记录；丢了，读档后飞升者就与上界原生人
  //    混成一堆（上界面板「新来的，从井里」再也认不出人）。
  {
    // ① 往返一致：逐位飞升者核 `fromMortal` / `fromSect`。
    // 什么故障会让它变红：save.js 的实体行漏掉这两列、把 `fromSect` 恒写成空串、
    //    把 `fromMortal` 恒写成 0，或读档侧忘了还原（`restoreEntity` 少了
    //    row[60]/row[61]）——四种都会让某位飞升者的值对不上。
    const ascLive = up.entities.filter((e) => e.fromMortal);
    const ascById = new Map(up2.entities.map((e) => [e.id, e]));
    const fromBad = [];
    for (const a of ascLive) {
      const b = ascById.get(a.id);
      if (!b) { fromBad.push(`#${a.id} 整个丢了`); continue; }
      if (b.fromMortal !== true) fromBad.push(`#${a.id} fromMortal ${a.fromMortal}→${b.fromMortal}`);
      if (b.fromSect !== a.fromSect) {
        fromBad.push(`#${a.id} fromSect ${JSON.stringify(a.fromSect)}→${JSON.stringify(b.fromSect)}`);
      }
    }
    // `ascLive.length > 0` 一起判：飞升者一位都没有时上面的循环空转、这条会假绿，
    // 而「飞升通道断了」正是本测试该报的事（理由同 ④ 那条账本守恒）。
    check('飞升者的来历快照往返一致（fromMortal / fromSect 逐值相等）',
      ascLive.length > 0 && fromBad.length === 0,
      ascLive.length === 0
        ? '这次跑动没有任何飞升者，判据空转——不能算通过'
        : (fromBad.length ? fromBad.slice(0, 6).join(' | ')
          : `${ascLive.length} 位飞升者，来历全对得上`));

    // ② 上界实体身上**不许有凡间裸 id**：faction / clan / gen / village 全 0。
    //    `arriveUpper` 把它们一律清 0（规格 §6.3 第 3 条）：两界 id 同段，留着
    //    `clan=1` 会被 `clanById` 认成上界始祖线（静默错谱）；留着 `faction=1`
    //    会被算进别人的仙门，并让 `maybeFoundSects` 的 `!e.faction` 永远为假
    //    （飞升者永远开不了宗）。
    //    ⚠️ 只对**飞升者**判 `clan === 0`：开局十二人本来就是 3 条始祖线的成员
    //    （`clan` 是 1..3，见本节 ③ 那条），对他们判 0 会**假红**。所以这条守的
    //    是「飞升者没把凡间 id 带上来」，不是「所有上界实体的 clan 都是 0」。
    //    两侧都查（原世界 + 读档后）：清 0 要发生在入档前，存回来还得是 0。
    // 什么故障会让它变红：`arriveUpper` 漏清某个字段（比如新加了一个凡间 id
    //    字段忘了清），或读档侧把某个字段还原成了非 0。
    const ascIds = new Set(ascLive.map((e) => e.id));
    const bareBad = [];
    for (const e of up.entities) {                     // 原世界：fromMortal 是活对象上的真值
      if (!e.fromMortal) continue;
      if (e.faction !== 0 || e.clan !== 0 || e.gen !== 0 || e.village !== 0) {
        bareBad.push(`#${e.id} faction=${e.faction} clan=${e.clan} gen=${e.gen} village=${e.village}`);
      }
    }
    // 读档后那一侧**按 id 认人**（`ascIds`），不按 `fromMortal` 认——否则
    // 「fromMortal 没存住」会把飞升者整个从这条判据的覆盖范围里摘掉，于是它
    // 悄悄不再检查任何人、却照样全绿（本项目最怕的那种静默失效）。
    for (const e of up2.entities) {
      if (!ascIds.has(e.id)) continue;
      if (e.faction !== 0 || e.clan !== 0 || e.gen !== 0 || e.village !== 0) {
        bareBad.push(`#${e.id}（读档后）faction=${e.faction} clan=${e.clan} gen=${e.gen} village=${e.village}`);
      }
    }
    check('飞升者身上没有凡间裸 id（faction/clan/gen/village 两侧全 0）',
      ascLive.length > 0 && bareBad.length === 0,
      bareBad.length ? bareBad.slice(0, 6).join(' | ')
        : `${ascLive.length} 位飞升者 × 2 侧（原世界 + 读档后）全 0`);

    // ③ 反向断言：`mortalId` 必须**不在**上界实体上。
    //    光写「有 fromMortal」挡不住有人把凡间裸 id 加回来——`fromMortal` 只记
    //    「是不是凡间来的」，`mortalId` 才是那个会悬垂的裸 id（两界 id 同段，
    //    `World.js:140`）。所以正面断言之外还要一条反向断言：这个键**不许存在**。
    //    查**全部上界实体**（不只飞升者）：原生上界人也不该有它。
    // 什么故障会让它变红：有人给 `arriveUpper` 加回 `copy.mortalId = entity.id`，
    //    或 `restoreEntity` / `restoreLegacyEntity` 里冒出一个 `mortalId` 键。
    const mortalIdBad = [];
    for (const list of [up.entities, up2.entities]) {
      for (const e of list) if ('mortalId' in e) mortalIdBad.push(`#${e.id}`);
    }
    check('上界实体上没有 `mortalId` 键（反向断言：挡住把凡间裸 id 加回来）',
      mortalIdBad.length === 0,
      mortalIdBad.length ? `有 mortalId 的：${mortalIdBad.slice(0, 6).join(' ')}`
        : `${up.entities.length} 位 × 2 侧都没有`);

    // ④ `null` ↔ 空串 这条归一**必须真的被测到**。
    //    写侧 `e.fromSect || ''`（null → 空串）、读侧 `row[61] || null`（空串 → null）。
    //    只比「跑出来的那一份」的话，万一这次世界里每位飞升者都恰好有宗门名，
    //    这条归一就一次都没走到——「没测到」与「测了且对」长得一模一样。
    //    所以手工把某一行的 fromSect 写成空串、另一行写成名字，再读回来逐值核。
    // 什么故障会让它变红：读侧漏了「空串归一回 null」（`row[61]` 原样返回，得到
    //    空串而非 null），或写侧把 null 写成了别的形状（如 `'null'` 字符串）。
    const norm = JSON.parse(JSON.stringify(payloadJson));
    const normRows = norm.upper.entities;
    const emptyRow = normRows.find((r) => r[60] === true) || normRows[0];
    const namedRow = normRows.find((r) => r !== emptyRow) || normRows[0];
    emptyRow[60] = true; emptyRow[61] = '';        // null 的写侧形状
    namedRow[60] = true; namedRow[61] = '青云宗';   // 有宗门的写侧形状
    const cN = deserializeWorld(norm);
    const gotEmpty = cN.upper.entities.find((e) => e.id === emptyRow[0]);
    const gotNamed = cN.upper.entities.find((e) => e.id === namedRow[0]);
    check('fromSect 空串读侧归一回 null（null 的写侧形状，这条归一必须被测到）',
      !!gotEmpty && gotEmpty.fromSect === null && gotEmpty.fromMortal === true,
      gotEmpty ? `fromMortal=${gotEmpty.fromMortal} fromSect=${JSON.stringify(gotEmpty.fromSect)}`
        : '（找不到该实体）');
    check('fromSect 宗门名原样存回（既不变成空串、也不变成 null）',
      !!gotNamed && gotNamed.fromSect === '青云宗',
      gotNamed ? JSON.stringify(gotNamed.fromSect) : '（找不到该实体）');
  }

  // 仙脉是上界**自己的真实状态**（气温由「离仙脉距离」驱动，灵气公式也读它），
  // 必须进存档。顺手要求 > 0：`0 条也通过` 的断言等于没断言。
  check('上界的仙脉存住了（气温与灵气都靠它驱动）',
    up.leylines.length > 0 && up2.leylines.length === up.leylines.length,
    `${up.leylines.length} 条`);

  check('上界位面名是 upper（不是构造器默认的 mortal）',
    up2.plane === 'upper',
    `plane=${up2.plane}（写成 mortal 的话，任何按 plane 分流的代码都会把它当凡间，且不报错）`);

  // ── ⑤ 上界块的「有没有漏掉的东西」：与第 3 节同款两条，方向相反 ──
  {
    // ① payload.upper → clone.upper：出现在上界序列化结果里、却既没被上面
    //    的循环比到、也不在 UPPER_EXEMPT 里的键 → 有人加了字段却忘了接。
    const accounted = new Set([...upCompared, ...UPPER_EXEMPT.keys()]);
    const unregistered = Object.keys(payloadJson.upper).filter((k) => !accounted.has(k));
    check('上界块没有「没接进比对」的键（新增字段必须注册或写明豁免理由）',
      unregistered.length === 0,
      unregistered.length ? `未注册：${unregistered.join(' ')}`
        : `${Object.keys(payloadJson.upper).length} 键全部有着落`);

    // ② upper → payload.upper：**上界上有、序列化结果里没有** → 上界块漏写了。
    //    这是真正会响的那条（理由与第 3 节 ② 一样：从 payload 反推的循环
    //    天生看不见「压根没进 payload」的字段）。
    //    凡间那张 WORLD_NOT_SAVED（推导量 / 渲染标记）直接复用——上界是同一个
    //    World 类，构造器挂的推导字段一模一样；再补上「上界刻意不存」的几层。
    const UPPER_NOT_SAVED = new Map([
      ...WORLD_NOT_SAVED,
      ['temp', '上界刻意不存：生成期产物，读档照 seed 重新生成（本节 ② 逐格比）'],
      ['moist', '上界刻意不存：同上'],
      ['fire', '上界不跑 stepFire，恒为 0（规格 §1.5）'],
      ['riverBase', '上界不刻河，恒为 0（规格 §1.4）'],
      ['owner', '凡间那一层本身就是死数据（全项目只有 save.js 自己读写），上界更不抄'],
      // 空间裂缝是**凡间专属**（规格 §4.2），上界实例上恒空。
      // `serializeUpperWorld` 里显式 `delete payload.rifts/nextRiftId/riftLog`，
      // 所以上界块里没有它们——这里豁免的理由是「上界不跑这个系统」，
      // 而它恒空这件事由本节 ④b 的 `upperForbidden` 正面断言守着。
      ['rifts', '空间裂缝是凡间专属，上界恒空、刻意不存（serializeUpperWorld 里 delete）'],
      ['nextRiftId', '同上'],
      ['riftLog', '同上'],
      // 魂路累计账本同理：上界不跑 `enterNether`，五键恒零，
      // `serializeUpperWorld` 里显式 `delete payload.soulLog`，故上界块没有它。
      ['soulLog', '魂路账本是凡间专属，上界不跑 enterNether、恒零、刻意不存（serializeUpperWorld 里 delete）'],
      // 夺舍累计账本（D6-3 工程包 D 复核补删）：上界不跑 `stepPossession`，
      // `serializeUpperWorld` 里显式 `delete payload.possessionLog`。
      // 恒零这件事由本节 ④b 的 `upperForbidden` 正面断言守着（含 D 包新加的两键）。
      ['possessionLog', '夺舍账本是凡间专属，上界不跑 stepPossession、恒零、刻意不存（serializeUpperWorld 里 delete）'],
      // 凡间鬼影（D6-3 工程包 B）同理：缝开在凡间、鬼爬进**凡间**，
      // `serializeUpperWorld` 里显式 `delete payload.wraiths / wraithLog`。
      // 上界恒空恒零这件事由本节 ④b 的 `upperForbidden` 正面断言守着。
      ['wraiths', '凡间鬼影是凡间专属（缝开在凡间、鬼爬进凡间），上界恒空、刻意不存（serializeUpperWorld 里 delete）'],
      ['wraithLog', '同上'],
    ]);
    const terrainKeys = new Set(Object.keys(payloadJson.upper.terrain || {}));
    const notSaved = Object.keys(up).filter((k) =>
      !k.startsWith('_')
      && !Object.prototype.hasOwnProperty.call(payloadJson.upper, k)
      && !terrainKeys.has(k)
      && !UPPER_NOT_SAVED.has(k));
    check('上界没有「serialize 漏写」的键（漏了就是读档后凭空消失）',
      notSaved.length === 0,
      notSaved.length ? `漏写：${notSaved.join(' ')}`
        : `${Object.keys(up).filter((k) => !k.startsWith('_')).length} 个非下划线键全部有着落`);
  }

  // ── ⑥ v7 老档降级：payload 里没有 upper 块，就地生成一个 ──
  //
  // 老档里没有 `upper` 键。若读档时留 null，就是「只在一侧存在的字段」——
  // 新世界的人有上界、老档读回来的人没有，于是任何遍历 world 的代码从此对不上，
  // 而且不报错（与 `busanzi` 的 v1 降级、`dead`/`deadLog` 的 v5 降级同一个形状）。
  //
  // 这条同时把**种子派生**在降级路径上再验一遍：降级分支也走
  // `generateUpperWorld`，所以「seed 参数收的是凡间种子」这个契约两条路径都要守。
  {
    const legacy = JSON.parse(JSON.stringify(payloadJson));
    legacy.v = 7;
    delete legacy.upper;
    const old = deserializeWorld(legacy);
    check('v7 老档读回来：upper 不是 null（就地生成一个，不是留空）',
      !!old.upper && old.upper.w === up.w && old.upper.h === up.h,
      old.upper ? `${old.upper.w}×${old.upper.h}` : '（null —— 老档读回来就没有上界了）');
    check('v7 老档降级：upper.seed === deriveUpperSeed(凡间 seed)',
      !!old.upper && old.upper.seed === expectedUpperSeed,
      `实测 ${old.upper && old.upper.seed}，应为 ${expectedUpperSeed}`);
    check('v7 老档降级：upper.seed !== 凡间 seed',
      !!old.upper && old.upper.seed !== world.seed,
      `上界 ${old.upper && old.upper.seed} vs 凡间 ${world.seed}`);
  }
}

// ── 6b. 幽冥界（v10 · 三界并存）─────────────────────────────
//
// 幽冥是**第三个独立的 `World` 实例**，凡间 world 上只挂一个引用 `world.nether`。
// 它与上界（第 6 节）**逐字同形**：`serializeNetherWorld` 先照凡间的形状整个存
// 一遍、再把地形裁到 6 层（height/water/veg/type/over/struct）；读档时照 seed
// 重新生成一遍、再用存档的 6 层覆盖。顶层因此多一个 `nether` 键——那是
// **整个幽冥 world 的序列化块**（v10 起 `SAVE_VERSION` 从 9 升到 10）。
//
// ⚠️ 本节单独写、不并进第 3 节的通用比对，理由与上界那一段逐字相同：
//   · 幽冥的 terrain 形状与凡间**不同**（6 层 vs 11 层），塞进去会因为
//     `terrain` 对不上而红；
//   · 幽冥块**刻意不含**四个凡间专属键（`serializeNetherWorld` 里显式 delete），
//     「块里没有它们」是**反方向**的判据，不能混在「键都在」里（见下面 ⑥）。
//
// ⚠️ 「不存、靠重新生成」这个设计（`temp` / `moist` 裁掉了）把一条**真·存读档
//    不等价**引了进来——与上界 ② 同一个形状：种子派生错了，那几层会静默换成
//    另一张气候图，而 `type` 是存档旧值，读档那一刻看不出任何异常。
section('6b. 幽冥界（v10 · 三界并存）');

const nth = world.nether;
const nth2 = clone.nether;

// ⚠️ 这条**只**证明「读回来的幽冥与凡间同尺寸」，**不能**证明「存档里带了 nether 块」。
// 为什么：`deserializeWorld` 无论存档里有没有 `nether` **都会**造一个出来
// （有就还原、没有就地生成，save.js:614-616），所以 `clone.nether` 永远非 null、
// 尺寸也永远对得上——「v10 块没写」这件事在 clone 侧**完全看不出来**。
// 要判「存档里到底有没有」只有一条路：查序列化结果的键集，那是第 3 节那条
// 「序列化结果顶层含全部世界级新字段（…/nether）」在管的事。
// 什么故障会让它变红：读档侧漏接 `world.nether`（幽冥整个变 null，任何遍历
//   `world.nether` 的代码当场 TypeError），或尺寸与凡间 / 上界对不上。
check('读档后有幽冥，且尺寸与凡间一致（不证明存档里有 nether，那是第 3 节的事）',
  !!nth2 && !!nth && nth2.w === nth.w && nth2.h === nth.h,
  nth2 ? `${nth2.w}×${nth2.h}` : '（clone.nether 是 null —— v10 块没写或没读）');

if (nth2) {
  // ── ② 位面名必须是 nether ──
  //
  // `World` 构造器给的默认值是 `'mortal'`（World.js:206）。读档侧
  // `restoreWorldState` 写的是 `world.plane = data.plane || 'mortal'`——所以只要
  // `serializeNetherWorld` 没把 `payload.plane` 钉成 `'nether'`，读回来就是
  // `'mortal'`。**不报错**：任何按 `world.plane` 分流的代码（灵气公式、突破上限、
  // 裂缝、飞升出口）都会把这个幽冥实例当凡间处理。
  // 什么故障会让它变红：`serializeNetherWorld` 漏写 `payload.plane = 'nether'`，
  //   或读档侧把 plane 还原成了别的值。
  check('幽冥位面名是 nether（不是构造器默认的 mortal）',
    nth2.plane === 'nether',
    `plane=${nth2.plane}（写成 mortal 的话，任何按 plane 分流的代码都会把它当凡间，且不报错）`);

  // ── ③ 种子派生：两条断言必须**同时**成立 ──
  //
  // `deriveNetherSeed(x) = x ^ 0x4e455452` 是**异或自逆**的，所以「多派生一次」
  // 不会让种子变远，而是让它**精确地回到凡间种子**——不报错、不崩溃。后果与上界
  // （第 6 节 ① 那一整段）逐字相同：`Life` 的 `warRng = mulberry32(seed ^ 0x776172)`
  // （`sim/life.js:124`）三界完全重合，三张图的战争随机流逐次抽同一支签；
  // 而幽冥的 `temp` / `moist` 也不进存档、靠「照 seed 重新生成」拿回，种子一错
  // 这两层就**静默换成另一张气候图**，读档那一刻看不出任何异常。
  //
  // 两条缺一不可：只查「派生正确」抓不到「传错种子恰好抵消」，
  // 只查「不等于凡间种子」抓不到「派生成了别的数」。
  // 什么故障会让它变红：`deserializeNetherWorld` 的第二参传成了
  //   `data.nether.seed`（已派生的幽冥种子），或先 `deriveNetherSeed(data.seed)`
  //   再传——两处都是**双重派生**（异或自逆）→ `nth2.seed === world.seed`。
  const expectedNetherSeed = deriveNetherSeed(world.seed);
  check('幽冥 seed === deriveNetherSeed(凡间 seed)',
    nth2.seed === expectedNetherSeed,
    `实测 ${nth2.seed}，应为 ${expectedNetherSeed}`);
  check('幽冥 seed !== 凡间 seed（三界战争随机流不重合）',
    nth2.seed !== world.seed,
    `幽冥 ${nth2.seed} vs 凡间 ${world.seed}`);

  // 自检：上面那条「seed === 派生值」**真的会因为双重派生而红**吗？
  //
  // 与上界那段自检同款（同一条纪律：「一支不会因为漏存而红的等价测试，等于没有」）。
  // 这里不去动 save.js，而是**当场造一张「多派生一次」的幽冥**
  // （`seed: deriveNetherSeed(凡间 seed)`），看它的种子：
  //   · 退回凡间种子 → 这正是「双重派生不报错」的成因，上面 ③ 的两条判据守得住；
  //   · 没退回 → 说明派生不是纯异或，上面 ③ 的注释要重写。
  // 什么故障会让它变红：`deriveNetherSeed` 被改成非异或（比如加了乘法），
  //   那时「双重派生」不再抵消，③ 的注释就成了假的——这条自检把它钉住。
  const nthDouble = generateNetherWorld({
    preset: { w: nth.w, h: nth.h },
    seed: deriveNetherSeed(world.seed),
  });
  check('自检：双重派生会把幽冥种子退回凡间种子（异或自逆）',
    nthDouble.seed === world.seed,
    `双重派生 seed=${nthDouble.seed} vs 凡间 ${world.seed}`);

  // ── ④ 六层地形逐格一致 ──
  // height/water/veg 是量化 Float32（允许 1 个量化步长，与第 2 / 6 节同口径），
  // type/over/struct 是字节层（必须严格相等）。**阈值照抄上界那几层，不自创**。
  // 什么故障会让它变红：`serializeNetherWorld` 裁层时漏了某一层、或读档侧
  //   `deserializeNetherWorld` 忘了把某一层从存档覆盖回生成结果——那一层就会
  //   停在新生成的图上，与存档前的值逐格不同（而其余层照样对得上）。
  for (const k of ['height', 'water', 'veg']) {
    let max = 0;
    for (let i = 0; i < nth.size; i += 1) max = Math.max(max, Math.abs(nth[k][i] - nth2[k][i]));
    check(`幽冥 ${k} 误差在量化界内`, max <= QUANT_STEP * 1.01, `最大 ${max.toExponential(2)}`);
  }
  for (const k of ['type', 'over', 'struct']) {
    let bad = 0;
    for (let i = 0; i < nth.size; i += 1) if (nth[k][i] !== nth2[k][i]) bad += 1;
    check(`幽冥 ${k} 逐格一致（字节层）`, bad === 0, bad ? `不同 ${bad} 格` : `${nth.size} 格`);
  }

  // ── ⑤ 魂池不搬家：createPlanes 里 nether.souls 必须是凡间魂池的同一个引用 ──
  //
  // 幽冥 world **自己的** `souls` 是恒空的独立数组（`worldgenNether` 明文
  // `world.souls.length = 0`，§8.2「魂池不搬家」）——它**不是**凡间那个魂池。
  // `createPlanes` 把注册表里的 `nether.souls` 开成 `mortal.souls` 的**别名**，
  // 所以读档后重建注册表时，这个别名必须仍指向**读回来的凡间**魂池（`clone.souls`）。
  // 断言写成**引用相等**（`===`），不是 `JSON.stringify` 相等：别名一旦被写成
  // `[...mortal.souls]` 的拷贝，值在那一刻相同、之后却各走各的——正是
  // `World.js:90-91` 点名的「读档后排队等转世的神魂凭空消失」，且不报错。
  // 口径照抄 smoke 里那条 `planes.nether.souls === mortalM.souls`。
  // 什么故障会让它变红：`createPlanes` 把别名写成拷贝（`[...mortal.souls]`），
  //   或读档侧没把凡间魂池还原进 `clone.souls`（别名指向了另一个数组）。
  const planes = createPlanes(clone, clone.upper, clone.nether);
  check('createPlanes：nether.souls 是凡间魂池的**同一个数组引用**（不是拷贝）',
    planes.nether.souls === clone.souls,
    planes.nether.souls === clone.souls
      ? `同一引用 · 池里 ${planes.nether.souls.length} 个神魂`
      : '不同引用：别名一旦是拷贝，值此刻相同、之后各走各的（转世的神魂会凭空消失）');

  // ── ⑥ 七个凡间专属键**不在** nether 块里（反向断言）──
  //
  // `serializeNetherWorld` 显式 `delete payload.rifts / nextRiftId / riftLog /
  // soulLog / wraiths / wraithLog / possessionLog`：裂缝开在**凡间**（§4.2），
  // 魂路账本记在**凡间**那侧（§8.2「魂池不搬家」，`enterNether` 由凡间的
  // `Life` 调，幽冥实例上恒为零），凡间鬼影（D6-3 工程包 B）同理——缝在凡间、
  // 鬼爬进凡间；夺舍账本（D6-3 工程包 D 复核补删）也记在**凡间**那侧
  // （`resetNetherSystems` 第 2 条钉零，跨位面子账由凡间的 `stepNetherRift` 记）。
  // 留着会让 payload 平白多出几个**恒空**的键，读档后 `restoreWorldState` 又把
  // 它们还原成空——两份空状态互相印证，看着无害，实则是「幽冥也跑裂缝 / 也转世 /
  // 也夺舍」这个**不存在**的语义被写进了存档格式，后来人会照着它去接线。
  //
  // ⚠️ 查的是**序列化结果的键集**（`payloadJson.nether`），不是读回来的值：
  //    `restoreWorldState` 会给幽冥 world 补回这六样（空数组 / 零账本），所以
  //    「读回来的 `nth2.rifts` 是空数组」这件事**恒真**、证明不了块里没有它。
  //    这正是本文件开头那条规矩：判「存了没有」一律查序列化结果的键集。
  // 什么故障会让它变红：有人把 `serializeNetherWorld` 里那几行 delete 删掉
  //   （或漏删其中一行）——存档格式从此多出几个语义错误的键，且不报错。
  const NETHER_FORBIDDEN_KEYS = ['rifts', 'nextRiftId', 'riftLog', 'soulLog', 'wraiths', 'wraithLog', 'possessionLog'];
  const leakedMortal = NETHER_FORBIDDEN_KEYS.filter((k) =>
    Object.prototype.hasOwnProperty.call(payloadJson.nether, k));
  check(`幽冥块里没有凡间专属的七个键（${NETHER_FORBIDDEN_KEYS.join('/')}）`,
    leakedMortal.length === 0,
    leakedMortal.length ? `不该有却出现：${leakedMortal.join(' ')}`
      : `${Object.keys(payloadJson.nether).length} 键，七个凡间专属键一个都没带`);

  // ── ⑦ 实体 id 从幽冥段起编（NETHER_ID_BASE = 2_000_000）──
  //
  // 铁律三：每个 `World` 的 `nextEntityId` 都从 1 起，三界若各自从 1 编号，
  // 「三界实体 id 集合两两交集为空」立刻被打破——关系网、账本里任何拿 id 当键
  // 的地方都无法区分「凡间的 3 号」「上界的 3 号」与「幽冥的 3 号」。
  // `nextEntityId` 本身进存档（`serializeWorld` 自带这个键），所以这个偏移只需
  // 在**生成期**设一次（`worldgenNether.resetNetherSystems`），读档原样带回。
  //
  // ⚠️ **2026-09-23 契约变更**：原来这条判据是 `nextEntityId === NETHER_ID_BASE`，
  //    它的前提是「幽冥恒空」——那时没有任何东西往幽冥撒实体。生成侧落地后
  //    （`reincarnation.js` 的 `spawnNetherGhost`：只要 `world.nether` 存在，
  //    `enterNether` 就会造鬼魂），幽冥**合法地**开始有实体，`nextEntityId`
  //    随之从 2000000 涨到 2000026。旧判据的前提不再成立——**这是契约变更，不是回归**。
  //    按契约 §八「契约变更 ⇒ 换契约稳定的不变量」，改成两条**与实体数量无关**的判据：
  //      (a) 每一个幽冥实体的 id 都 `>= NETHER_ID_BASE`（三界 id 段两两不相交）；
  //      (b) `nextEntityId` 严格大于世上**最大**的幽冥实体 id（新鬼不会撞号）。
  //    ⚠️ (a) 之前**必须有非空性守卫**：「所有 id 都 ≥ 基址」在**空集上是空真**，
  //       少了守卫就成了一条永远绿的假断言（本项目纪律：守恒 / 求和型断言前必须有非空守卫）。
  //    ⚠️ 只放宽成「`nextEntityId >= NETHER_ID_BASE`」是不够的：那会放过
  //       「实体进来了、`nextEntityId` 却没跟着抬高」这个真回归（新鬼会撞号）。
  // 什么故障会让它变红：(a) `resetNetherSystems` 漏了 `world.nextEntityId = NETHER_ID_BASE`，
  //   或读档侧没把它还原（`restoreWorldState` 的 `data.nextEntityId || 1` 拿到空值 → 退回 1）；
  //   (b) `World.addEntity` 分配 id 后没把 `nextEntityId` 抬高（幽灵 id 撞号）。
  const netherEntities = nth2.entities;
  const netherIdOf = (e) => (Number.isFinite(e && e.id) ? e.id : 0);
  check('幽冥有实体（下面两条 id 判据在空集上是空真，先钉住非空）',
    netherEntities.length > 0,
    `${netherEntities.length} 位（若为 0，说明生成侧没往幽冥撒实体，id 判据无意义）`);
  const minNetherId = netherEntities.reduce((m, e) => Math.min(m, netherIdOf(e)), Infinity);
  check(`幽冥实体 id 全部 ≥ ${NETHER_ID_BASE}（三界 id 段两两不相交）`,
    netherEntities.every((e) => netherIdOf(e) >= NETHER_ID_BASE),
    `${netherEntities.length} 位 · 最小 id ${Number.isFinite(minNetherId) ? minNetherId : '(空)'}`);
  const maxNetherId = netherEntities.reduce((m, e) => Math.max(m, netherIdOf(e)), 0);
  check('幽冥 nextEntityId 大于世上最大的实体 id（新鬼不撞号）',
    nth2.nextEntityId > maxNetherId && nth2.nextEntityId >= NETHER_ID_BASE,
    `next ${nth2.nextEntityId} > max ${maxNetherId}（且 ≥ ${NETHER_ID_BASE}）`);

  // ── ⑧ 幽冥物品（D6-3 工程包 C）──────────────────────────────
  //
  // `nether.artifacts` 是**此刻躺在幽冥地上的**物品池（自生的 + 跌入者带下来的），
  // `popLog.items*` 是四条累计流水（自生 / 跌入 / 漏出 / 朽坏）。两样都必须进档：
  //   · 漏 `artifacts` —— 读档后幽冥物品凭空消失（缝再漏不出东西来）；
  //   · 漏 `popLog.items*` —— 守恒式 `alive === spawned + fellIn − leakedOut − decayed`
  //     静默失衡，而每一侧单看都对（同 `warLog` / `riftLog` 的理由）。
  //
  // ⚠️ `artifacts` 走的是 `serializeWorld` 的**通用路径**（`artifacts` 整数组写），
  //    与凡间 / 上界**同一条路**——这正是「复用 `World.artifacts` 字段 ⇒ 零存档
  //    结构改动」的兑现。所以本块不动 `save.js` 的结构，只钉住它真的往返了。
  // ⚠️ 物品 id 是**幽冥自己的编号**（从 1 起），**不是**实体那个 2_000_000 段
  //    （法宝 id 是世界内编号，跨世界时由 `rifts.js` 重赋）。所以判据是
  //    `nextArtifactId > 最大物品 id`，**不是** `id >= NETHER_ID_BASE`。
  // 什么故障会让它变红：`serializeNetherWorld` 裁层时顺手把 `artifacts` 也裁掉
  //   （它确实是「地形之外」的东西，容易被当成可重算的）；或读侧没还原这个数组。
  const NETHER_ITEM_KEYS = ['id', 'slot', 'tier', 'quality', 'name', 'durability',
    'maxDurability', 'scars', 'forgedDay', 'forgedByName', 'ownerId', 'ownerName',
    'heldSince', 'spirit', 'history', 'lostDay', 'x', 'y', 'technique'];
  const itemBad = [];
  if (nth2.artifacts.length !== nth.artifacts.length) {
    itemBad.push(`条数 ${nth2.artifacts.length} ≠ ${nth.artifacts.length}`);
  }
  for (let i = 0; i < Math.max(nth2.artifacts.length, nth.artifacts.length); i += 1) {
    const d = diffFields(nth2.artifacts[i], nth.artifacts[i], NETHER_ITEM_KEYS);
    if (d) itemBad.push(`#${(nth2.artifacts[i] || nth.artifacts[i] || {}).id}: ${d}`);
  }
  check('幽冥物品逐字段等价（19 键：含 `technique` 与 `history`）',
    itemBad.length === 0,
    itemBad.length ? itemBad.join(' | ')
      : `${nth2.artifacts.length} 件 × ${NETHER_ITEM_KEYS.length} 键`);

  // ② `technique` 逐字段等价（`{name,note}` 两键）。它是幽冥物品的**身份标记**
  //    （凡间炼出的法宝没有这一字段），也是凡人拾到后习得的那门功法。
  //    漏存 ⇒ 读档后「这件东西能教你什么」凭空消失，而法宝本身还在（更难察觉）。
  const techBad = [];
  for (let i = 0; i < nth2.artifacts.length; i += 1) {
    const a = nth2.artifacts[i];
    if (!a.technique) continue;
    const d = diffFields(a.technique, (nth.artifacts[i] || {}).technique, ['name', 'note']);
    if (d) techBad.push(`${a.name}: ${d}`);
  }
  check('幽冥物品携带的 `technique`（`{name,note}`）往返得住',
    techBad.length === 0,
    techBad.length ? techBad.join(' | ')
      : `${nth2.artifacts.filter((a) => a.technique).length} 件带功法 · `
        + `${nth2.artifacts.filter((a) => !a.technique).length} 件不带`);

  // ③ `nextArtifactId` 必须**严格大于**世上最大的物品 id，且原样往返：
  //    不抬的话，读档后新凝的物品会与池子里已有的**撞号**，而 `leakNetherItem`
  //    按 id 线性查找会命中**先出现的那一件**——不报错，只是漏出去的不是你以为的那件。
  const maxItemId = nth2.artifacts.reduce((m, a) => Math.max(m, a.id || 0), 0);
  check('幽冥 `nextArtifactId` 大于世上最大的物品 id（新凝的不撞号）',
    nth2.nextArtifactId > maxItemId && nth2.nextArtifactId === nth.nextArtifactId,
    `next ${nth2.nextArtifactId} > max ${maxItemId}（存档前 ${nth.nextArtifactId}）`);

  // ④ 四条物品流水逐项等价。什么故障会让它变红：`popLog` 被改成逐键显式序列化
  //    （新加的四个键没人注册 ⇒ 读档后是 undefined，`alive === sum` 变成 `2 === NaN`）。
  const itemLogKeys = ['itemsSpawned', 'itemsFellIn', 'itemsLeakedOut', 'itemsDecayed'];
  check('幽冥物品四条流水（自生 / 跌入 / 漏出 / 朽坏）逐项等价',
    diffFields(nth2.popLog, nth.popLog, itemLogKeys) === '',
    diffFields(nth2.popLog, nth.popLog, itemLogKeys)
      || itemLogKeys.map((k) => `${k}=${nth2.popLog[k]}`).join(' '));

  // ⑤ 守恒式在往返后仍成立。这一条把 ①–④ 合成一个**可读的**结论：
  //    「池子里的件数」与「四条流水」在两侧都对得上，且它们之间还自洽。
  const aliveItems = nth2.artifacts.length;
  const itemSum = nth2.popLog.itemsSpawned + nth2.popLog.itemsFellIn
    - nth2.popLog.itemsLeakedOut - nth2.popLog.itemsDecayed;
  check('往返后幽冥物品守恒式仍成立（`alive === spawned + fellIn − leakedOut − decayed`）',
    aliveItems === itemSum, `${aliveItems} vs ${itemSum}`);

  // ── ⑨ v9 老档降级：payload 里没有 nether 块，就地生成一个 ──
  //
  // 老档里没有 `nether` 键（v10 才引入）。若读档时留 null，就是「只在一侧存在的
  // 字段」——新世界有幽冥、老档读回来没有，于是任何遍历 world 的代码从此对不上，
  // 而且不报错（与 `upper` 的 v7 降级、`dead`/`deadLog` 的 v5 降级同一个形状）。
  // 这条同时把**种子派生**在降级路径上再验一遍：降级分支也走
  // `generateNetherWorld`，所以「seed 参数收的是凡间种子」这个契约两条路径都要守。
  // 什么故障会让它变红：读侧写成 `world.nether = data.nether ? ... : null`
  //   （把生成分支删了），或降级分支的 seed 传成了派生值（双重派生 → 退回凡间种子）。
  {
    const legacy = JSON.parse(JSON.stringify(payloadJson));
    legacy.v = 9;
    delete legacy.nether;
    const old = deserializeWorld(legacy);
    check('v9 老档读回来：nether 不是 null（就地生成一个，不是留空）',
      !!old.nether && old.nether.w === nth.w && old.nether.h === nth.h,
      old.nether ? `${old.nether.w}×${old.nether.h}` : '（null —— 老档读回来就没有幽冥了）');
    check('v9 老档降级：nether.seed === deriveNetherSeed(凡间 seed)',
      !!old.nether && old.nether.seed === expectedNetherSeed,
      `实测 ${old.nether && old.nether.seed}，应为 ${expectedNetherSeed}`);
    check('v9 老档降级：nether.seed !== 凡间 seed',
      !!old.nether && old.nether.seed !== world.seed,
      `幽冥 ${old.nether && old.nether.seed} vs 凡间 ${world.seed}`);
    // 幽冥物品池与四条流水也必须**就地存在**（D6-3 工程包 C）：
    // 老档里没有 `nether` 块 ⇒ 走生成分支 ⇒ `resetNetherSystems` 得把 `artifacts`
    // 建成空数组、`popLog.items*` 归零。留 `undefined` 的话，读档后第一次
    // `stepNetherItems` 会在 `Array.isArray(items)` 处安静跳过（池子永远长不出来），
    // 或 `alive === spawned + ...` 变成 `NaN` —— 两者都不报错。
    // 什么故障会让它变红：`resetNetherSystems` 漏了 `world.artifacts.length = 0` /
    //   那四条 `popLog.items* = 0`。
    check('v9 老档降级：幽冥物品池是空数组（不是 undefined）',
      !!old.nether && Array.isArray(old.nether.artifacts) && old.nether.artifacts.length === 0,
      `artifacts=${old.nether && Array.isArray(old.nether.artifacts)
        ? `[]（${old.nether.artifacts.length} 件）` : typeof (old.nether && old.nether.artifacts)}`);
    check('v9 老档降级：四条物品流水都就位且为 0',
      !!old.nether && old.nether.popLog
      && old.nether.popLog.itemsSpawned === 0 && old.nether.popLog.itemsFellIn === 0
      && old.nether.popLog.itemsLeakedOut === 0 && old.nether.popLog.itemsDecayed === 0,
      old.nether && old.nether.popLog
        ? itemLogKeys.map((k) => `${k}=${old.nether.popLog[k]}`).join(' ')
        : '（popLog 缺失）');
  }
}

// ── 7. 继续演化：信息性输出，不作为失败判据 ────────────────
section(`7. 分叉观察（各再跑 ${POST_YEARS} 年，仅供参考）`);
const lifeA = new Life(world, mulberry32(0x5eed));
const lifeB = new Life(clone, mulberry32(0x5eed));
run(world, lifeA, POST_YEARS);
run(clone, lifeB, POST_YEARS);
console.log(`  连续运行：生灵 ${world.entities.length} · 村 ${world.villages.length}`
  + ` · 宗 ${world.factions.length} · 地点 ${world.sites.length} · 飞升 ${world.ascended.length}`);
console.log(`  存读档后：生灵 ${clone.entities.length} · 村 ${clone.villages.length}`
  + ` · 宗 ${clone.factions.length} · 地点 ${clone.sites.length} · 飞升 ${clone.ascended.length}`);
const drift = Math.abs(world.entities.length - clone.entities.length);
console.log(`  生灵数偏差 ${drift}（量化误差在混沌系统中被放大的结果，不是漏存字段）`);

console.log(`\n${'='.repeat(56)}`);
if (failures === 0) {
  console.log('全部通过 ✓  读档瞬间结构完整');
} else {
  console.log(`${failures} 项未通过 ✗`);
}
process.exit(failures ? 1 : 0);
