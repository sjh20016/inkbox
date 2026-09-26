// 水墨沙盒 · 主程序
//
// 一条 rAF 主循环：推进模拟 → 重绘地形位图 → 叠加生灵与界面。
// 地形渲染按需刷新（改动了才重画），水文按固定真实时间步推进，
// 这样即使把时间调到「飞」，地形演化也不会因为帧率而失真。

import { APP, LIMITS, TIME, WORLD_PRESETS, SEA_LEVEL, SPECIES_INFO, TERRAIN_INFO, TERRAIN, INK } from './core/config.js';
import { REALMS, realmLabel, pollutionLabel, POLLUTION_ASCEND_LIMIT } from './core/cultivation.js';
import { mulberry32 } from './core/noise.js';
import { generateWorld } from './world/worldgen.js';
// 上界：`generateUpperWorld` 的 seed 收的是**凡间种子**，内部自己派生上界 seed
// （所以这里绝不能先 xor 一次再传进去，那会双重派生）。
// `recomputeUpperQi` 是上界专用的灵气补算——**不能用凡间的 `recomputeQi`**：
// 那个走凡间那套 `qiAt`（读 riverBase + 凡间灵脉加成），会把上界的灵气层整个覆盖掉，
// 而且不报错（上界灵气要的是「地表基数 × 1.8」）。
import { generateUpperWorld, recomputeUpperQi } from './world/worldgenUpper.js';
// 幽冥：`generateNetherWorld` 的 seed 同样收**凡间种子**，内部自己派生幽冥种子
// （`deriveNetherSeed` 是异或、自逆——先派生一次再传进来会静默退回凡间种子）。
// 与上界不同，幽冥**没有** `recomputeNetherQi` 可调：它的 `qi` 走凡间那套 `qiAt`
// （阴气在 `veg` 层，不在 `qi` 层），生成器内部已 `recomputeQi` 一次，调用方无事可做。
import { generateNetherWorld } from './world/worldgenNether.js';
import { recomputeRect, flushDirty } from './world/terrain.js';
import { Life } from './sim/life.js';
import { UpperLife } from './sim/upperLife.js';
// 三界面板（Batch 3）要的两样：五路的中文名（**考古定名**，只有这一份）
// 与「这个人死了之后去哪了」要读的魂路账本/魂池读数。
// ⚠️ `ROUTE_LABEL` 不在 `necrology.js` 里再抄一份——它已经有 `longrun` 的
//    键集断言盯着（`inkbox-longrun.mjs:737-745`），多一份真相就是多一个漂移点。
import { reincarnationStats, ROUTE_LABEL, SOUL_ROUTES, SOUL_ROUTE_POSSESS } from './sim/reincarnation.js';
// 幽冥鬼魂 / 鬼修的低频 tick（契约 `reports/d5/BATCH2-DESIGN.md` §六）。
// ⚠️ `stepNether` 收的是**凡间 world**（它要读凡间魂池 `world.souls` 做对账），
//    不是 `this.nether`——见 `netherLife.js` 里 `stepNether` 的 @param 注释。
// `netherGhostStats` 是**唯一**的幽冥实体统计口径（契约 §七「Feedback」）：
//    右栏那行与视界提示行都从它取数，**不在 main.js 里再 filter 一遍
//    `nether.entities`**——那会出现第二份真相，两边迟早对不上。
import { netherGhostStats, netherEcoStats, netherItemStats } from './sim/netherLife.js';
// 上界生态账本的**只读**汇总（D6-2 工程包 E）。与幽冥的 `netherEcoStats` 同款口径：
// 三界面板上两处都印「生 / 亡」，玩家可以横向对照，账平不平一眼可见。
import { upperEcoStats } from './world/planes.js';
// 凡间鬼影（D6-3 工程包 B）：**只 import 只读汇总**，不 import `stepMortalWraiths`
// ——推进走 `sim/advance.js` 那个唯一入口（`ADVANCE_PERIODS.wraith`），本文件不驱动它。
// `wraithStats` 是**唯一**的凡间鬼影统计口径（`sim/wraiths.js`）：右栏那格与
// hover 提示都从它取数，**不在 main.js 里再 filter 一遍 `world.wraiths`**。
import { wraithStats } from './sim/wraiths.js';
// D6-3 工程包 D：`isControlled` 是「此刻被附身接管」的唯一判据（`life.js` 的行为锁
// 与这里的面板都读它）。**只读**，不引入任何写路径。
import { isControlled } from './sim/possession.js';
import { stepHydrology } from './sim/hydrology.js';
import { decayOverlay } from './sim/ecology.js';
// 空间裂缝（阶段三）：**开缝**这个动作只在 pointerup 的提交点（commitSelection）
// 发生；**判定 / 漏物 / 闭合**走低频时钟，那个时钟已搬进 `sim/advance.js`
// （见下面的 `advanceWorld`），本文件不再自己驱动它。
import { openRifts } from './sim/rifts.js';
// ⚠️ `advanceWorld` / `createAdvanceState` 是**世界推进的唯一入口**：
//    `update()` 里原先那段「life + upper + nether + rift + eco + fire」的时钟
//    列表已**整段搬进** `sim/advance.js`。**别在本文件里再抄一遍**——测试侧
//    （`inkbox-longrun.mjs` / `inkbox-playtest.mjs`）调的是同一个函数，
//    抄第二份就会重演 BACKLOG #13（漏掉 `stepNether`，幽冥实体只增不减）。
import { advanceWorld, createAdvanceState } from './sim/advance.js';
import { computeTerritory } from './sim/territory.js';
import { artifactStats, artifactPower, describeArtifact, ownerLine } from './sim/artifacts.js';
import { lineageOf, clanStats } from './sim/family.js';
import { biographyRows, exportChronicle, chronicleFileName, biographyFileName } from './sim/biography.js';
// ── 世界可观察性（Batch 1）────────────────────────────────
// `compileBiography` 是**已经写好、只是没人调**的那一份：此前它只服务导出按钮，
// 面板上看不到——玩家点一个人只能看到 `biographyRows` 那几行摘要。
// `attentionOf` / `ATTENTION_NAMES` 同理（「世人注目」0..4，纯派生、不写回实体）。
// `findEntity` 是活人版的名录查找（死者用 `findDead`）。
import {
  compileBiography, attentionOf, ATTENTION_NAMES, displayName, findEntity,
} from './sim/biography.js';
import {
  necrologyList, necrologyStats, findDead, compileDeadBiography,
  exportNecrology, necrologyFileName,
} from './sim/necrology.js';
import { warStats } from './sim/war.js';
import { History } from './sim/powers.js';
import {
  greetOnBoot, reactToTool, busanziTierName, busanziNextStep, busanziRecent,
} from './sim/busanzi.js';
import { TerrainLayer } from './render/terrainLayer.js';
import { UnitsLayer } from './render/unitsLayer.js';
import { Camera } from './render/camera.js';
// ⚠️ `normalizeRegion as normalizeRegionGeometry` 是划选区域的**纯几何核心**
//    （鞋带面积 / 钳界 / 面积上限）。它放在 `ui/tools.js` 而不是本文件的方法里，
//    是因为本文件依赖 DOM、node 里 import 不了，而 `scripts/_riftprobe.mjs`
//    要在 node 里断言它。别名是为了不与下面同名的方法打架。
// ⚠️ 别把注释写进下面那对花括号里：`scripts/inkbox-import-check.mjs` 用正则
//    扫具名导入，会把注释文字当成导入名而误报「对面没有这个导出」。
import {
  TOOLS, TOOL_BY_ID, TOOL_GROUPS, TOOL_CURSOR, normalizeRegion as normalizeRegionGeometry,
} from './ui/tools.js';
import { toCss } from './render/palette.js';
import {
  saveToStorage, loadFromStorage, exportFile, importFile, listSlots, deleteSlot,
} from './io/save.js';
import {
  CAUSAL_TOOL_IDS, createInterventionOutcome, measureChangedCells,
} from './sim/interventionFeedback.js';

const $ = (id) => document.getElementById(id);

/** 各阶境界的横条颜色，与小人身上的束带/灵光保持同一套色（按 `REALMS` 逐档对应） */
const REALM_BAR = ['#a8b6bd', '#8fa7b8', '#c8a44e', '#8fb0d8', '#c98fd8', '#e8c860', '#b98cff'];

/** 史册面板一屏渲染多少条（全 800 条塞进 DOM 只会让侧栏滚不动） */
const NECRO_PANEL_LIMIT = 30;

/** 大事记面板一屏渲染多少条（账本本身封顶在 World.MILESTONE_CAP = 600） */
const MILESTONE_PANEL_LIMIT = 12;

// ── 三界面板（Batch 3）────────────────────────────────────────
//
// 这一块的**全部内容都是现成读数**：上界的 `entities`/`factions`/`arrivedLog`/
// `milestones`，幽冥的 `soulLog`/`souls`/`reincarnationStats` 早就在跑，
// 缺的只是出口——Batch 3 之前 `grep -n "上界\|幽冥" inkbox.html` 是 **0 命中**。
// 所以这里只有取数上限与显示色，**一个后台状态都没有**。
//
// 上限都取「一屏看得完」的量级（不是为了省 CPU：这些数组本来就只有几十上百条）。
const UPPER_ARRIVAL_LIMIT = 4;
const UPPER_MILESTONE_LIMIT = 4;
const SOUL_POOL_LIMIT = 5;
const SOUL_BACK_LIMIT = 4;

/**
 * 五路的显示顺序。**从 `SOUL_ROUTES` 派生，不另抄一份字面量**——
 * 抄一份的话，将来有人加了第六路，条形图会**静默地**少画一根，
 * 而账本里那个数照样在涨（故障类 1：字段存在 ≠ 字段生效）。
 */
const SOUL_ROUTE_ORDER = Object.values(SOUL_ROUTES);

/** 五路各自的条形色。取自 `inkbox.html` 的调色板，缺键兜底成淡墨，不留空白 */
const SOUL_ROUTE_COLOR = {
  natural: '#4d6b52',
  linger: '#3f5f7d',
  ghost: '#7d776b',
  wraith: '#a8493c',
  gone: '#b3aa97',
};

/** 「两世抉择」的中文（`stepReincarnation` 写进 `pastLife.choice` 的三个值） */
const PAST_LIFE_CHOICE = {
  inherit: '前世记忆尽数归来',
  fuse: '两世各占一半',
  refuse: '斩断旧债与旧名',
};

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
 *    这也是本项目的一条老规矩（见 biography.js 的 `attentionOf` 注释）。
 */
function notablePeople(world) {
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

// ── 三界面板的两个纯读辅助（Batch 3）──────────────────────────

/**
 * 境界标签。**`level === 0` 是「凡人」，不是「炼气」**——
 * `realmLabel(0)` 会给出「炼气」（境界表第一档从 0 起重），
 * 直接用它的话，一个被裂缝卷上界的凡人会在名册上被写成「炼气」。
 * 这种错不报错、不 NaN，只是把一个人说成了另一个人。
 */
function realmOrMortal(level) {
  return (level || 0) > 0 ? realmLabel(level) : '凡人';
}

/**
 * 「我刚送上去的那个人，后来怎么样了？」
 *
 * `upper.arrivedLog` 记的是他**上来那一刻**的快照（名字 / 境界 / 走的哪条道），
 * 而玩家真正想问的是**现在**：还在吗？什么境界了？死了没有？
 * 这三件事都能从上界的现成状态里读出来，**不需要新账本**：
 *   · `upper.entities` 里找得到 ⇒ 在世（顺带报当前境界与岁数）；
 *   · `upper.dead` 里找得到     ⇒ 已陨落（带年份）；
 *   · 两处都没有                ⇒ **如实说不知道**，不猜。
 *     上界的名录也是 800 上限、按重要性淘汰的，老得足够久的会被汰掉——
 *     那时候「查不到」是真的查不到，硬凑一句「下落不明」只会更误导。
 *
 * ⚠️ 纯读：不写世界、不抽 rng。面板每 2.5 秒调一次也不会让世界漂。
 */
function upperFateOf(upper, entry) {
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
 * 三种情形**必须分开说**，因为它们对玩家的意思完全不同：
 *   · `'possess'`   → 元神夺舍：**他还活着**，只是换了具身子；
 *   · 五路之一      → 魂路名（考古定名，见 `ROUTE_LABEL`）；
 *   · 凡人（level 0）→ 魂不留（`soulTier === 0`，`soulLog` 也不记他）。
 *
 * ⚠️ 飞升者返回空串：那一行的 `who` 已经写着「飞升」，再说一遍是啰嗦。
 * ⚠️ **Batch 3 之前的老档**没有这一列，会全部落到最后一支（空串）——
 *    这是**对的**：那些记录写下的那一刻这个字段还不存在，补不出来，
 *    也不该拿 `level`/`cause` 去猜（`necrology.js` 文件头那条「不猜」的规矩）。
 */
function soulRouteText(record) {
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
 * 这里只认三种记号（`#` / `##` / `- `），其余原样保留——**原文一字不改**，
 * 只是换一种显示方式；所以「面板上看到的」与「导出来的」不会打架。
 */
function renderBiographyHtml(md) {
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

/**
 * 另一界（上界 / 幽冥）地形位图的最短重绘间隔（秒）。
 *
 * 视界的贴图走「全量渲染到离屏 canvas，再裁剪贴出」（规格 §3.4 的 C2 方案，
 * 不改 terrainLayer.js）。`TerrainLayer.render()` 是**全量**的——它遍历整张
 * `w×h` 并逐像素写 ImageData。若每帧都重绘另一界，地形成本直接翻倍。
 *
 * 但另一界地形**变化极慢**（不跑水文/生态，只有玩家工具会改），所以把它的重绘
 * 摊薄到 0.2 秒一档：视界里的云/浪会略顿，但这是 C2 方案下唯一能控成本的地方。
 * ⚠️ 这个数是**实测标定**的（见交付报告里的 FPS 读数），不要凭感觉改小。
 * ⚠️ 名字里的 `UPPER` 是历史遗留（视界起初只能看上界）；现在上界与幽冥两个
 *    图层**各自**按它节流，互不影响（各自的 `TerrainLayer.lastRender`）。
 */
const UPPER_RENDER_PERIOD = 0.2;

/** 视界面积上限（占全图比例）。划满全图会让渲染退化成「全图渲染两遍」 */
const UPPER_VIEW_MAX_AREA = 0.4;

/**
 * 「视界」工具 → 它看的那一界（`ui/tools.js` 里 `mode: 'select'`、能看另一界的那些）。
 *
 * **这是「当前在看哪一界」的判据总表**，四处共用它：
 *   · `riftViewOpen()` —— 裂缝冻结判据（契约 C1.1）；
 *   · `commitSelection()` —— 开缝门控**与目标位面**（划选边缘裂开细缝，缝连哪一界）；
 *   · `viewPlane()` —— 贴哪一界的地形。
 * 散着写 `toolId === 'viewUpper'` 会让「加一界」变成「改 N 处、漏一处」，
 * 而漏掉的那处**不报错**（比如裂缝照常开，只是开在没开窗的时候）。
 *
 * ⚠️ **目标位面也必须从这张表来**（D6-2 工程包 B1）：`openRifts` 的第三参
 *    `targetPlane` 与这里**必须是同一个真源**。若在 `commitSelection` 里另写一句
 *    `tool.id === 'viewNether' ? 'nether' : 'upper'`，那么「加第三界」时这里改了、
 *    那里忘了，幽冥的缝会**静默地**连到上界去——正是本阶段要根除的那个语义错误。
 *
 * ⚠️ 它**只**回答「是不是视界工具」；「窗口真的开着」还要 `this.selection` 非空，
 *    那是 `riftViewOpen()` 的第二半，两者不可互相替代。
 */
const VIEW_TOOL_PLANE = Object.freeze({
  viewUpper: 'upper',
  viewNether: 'nether',
});

/**
 * 视界工具的 id 列表。**从 `VIEW_TOOL_PLANE` 的键派生**——不再另列一份字面量：
 * 两份清单必然分叉，而分叉的后果是「工具能看幽冥，但裂缝按上界开」（不报错）。
 */
const VIEW_TOOL_IDS = Object.freeze(Object.keys(VIEW_TOOL_PLANE));

/**
 * 射线法：点 `(x, y)` 是否落在闭合多边形 `path`（`[x, y]` 格点数组，首尾不重复）内。
 *
 * 半开区间判定（`(yi > y) !== (yj > y)`）让顶点 / 水平边只被数一次——
 * 否则恰好压在折线上的鬼魂会被算两次，计数凭空多一只。
 */
function pointInPolygon(path, x, y) {
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i, i += 1) {
    const xi = path[i][0];
    const yi = path[i][1];
    const xj = path[j][0];
    const yj = path[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * 视界窗口里**看得见**的鬼魂数（契约 `reports/d5/BATCH2-DESIGN.md` §七「Feedback」）。
 *
 * ⚠️ **为什么用多边形而不是包围盒**：`drawPlaneView` 的裁剪是
 *    `ctx.clip()` 走 `sel.path` 那条自由折线（`main.js:1900-1909`），
 *    玩家看到的窗口**就是那个形状**。包围盒会把套索凹进去的那几块也数进来，
 *    于是「提示行说 7 只、窗里只看得见 3 只」——读数与画面打架，正是 D4 要治的病。
 *    所以这里做**点在多边形内**判定，与 `ctx.clip()` 同形状。
 *    代价 O(鬼魂数 × 顶点数)：鬼魂上限是几十、顶点也是几十，且只在**提交划选那一下**
 *    算一次（不在每帧），完全可以接受。
 *    `sel.path` 缺失时退回包围盒——与 `drawPlaneView` 的矩形兜底同款防御。
 *
 * ⚠️ **只对幽冥界计数**：上界没有鬼魂，加了会印出「窗内可见鬼魂 0 只」这种噪音。
 *
 * @param {object} plane `viewPlane()` 的产物（`world` / `label`）
 * @param {object} sel   `normalizeRegion()` 的产物（`path` / `x0..y1`）
 * @returns {number} 窗内鬼魂数（非幽冥界 / 无选区返回 0）
 */
function ghostsInRegion(plane, sel) {
  if (!plane || plane.label !== '幽冥' || !sel) return 0;
  const list = (plane.world && plane.world.entities) || [];
  const path = sel.path;
  let n = 0;
  if (path && path.length >= 3) {
    for (let i = 0; i < list.length; i += 1) {
      const e = list[i];
      if (e && pointInPolygon(path, e.x, e.y)) n += 1;
    }
    return n;
  }
  // 兜底：矩形（与 `drawPlaneView` 的 `ctx.rect` 分支一致，含端点格）。
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (!e) continue;
    if (e.x >= sel.x0 && e.x <= sel.x1 + 1 && e.y >= sel.y0 && e.y <= sel.y1 + 1) n += 1;
  }
  return n;
}

/**
 * 「退回明文」的短标签。**两个原因必须分开说**：
 *   · `'compression-unavailable'` —— 这台浏览器没有 `CompressionStream`，换浏览器能解决；
 *   · 其余（`compress-failed: ...`）—— 支持压缩、但编码时抛错了，这是**我们的 bug**。
 * 合并成一句「本机不支持压缩」的代价：第二类情形下玩家会去翻浏览器设置，
 * 而真因永远不会被报出来。见 `io/codec.js:242` / `:254` 两个赋值点。
 */
function plainSaveTag(reason) {
  return reason === 'compression-unavailable' ? '本机不支持压缩' : '压缩失败';
}

/** 同一件事的完整说法（用于 toast）。与 `plainSaveTag` 同源，保证两处口径一致。 */
function plainSaveNotice(reason) {
  if (reason === 'compression-unavailable') {
    return '本机不支持压缩，存档将以明文写入（体积约为压缩后的 3 倍）';
  }
  return `存档压缩失败，已退回明文写入：${reason || '原因未知'}`;
}

class Sandbox {
  constructor() {
    this.canvas = $('inkCanvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.camera = new Camera();
    this.units = new UnitsLayer();
    this.history = new History();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);

    this.presetKey = 'medium';
    this.seed = 20260914;
    this.speedIndex = 2;
    this.toolId = 'raise';
    this.brushIndex = 3;
    this.showGrid = false;

    this.world = null;
    this.life = null;
    this.terrain = null;
    this.rng = mulberry32(12345);

    // ── 上界（另一个 world，同尺寸的另一张地图）─────────────
    // 它与凡间共用一条时间轴（day 由凡间赋值，见 update），但渲染、模拟各走各的。
    // `this.upper` 只在本类里当缓存用；世界侧的正规引用是 `world.upper`
    // （下一阶段的 ascend() 靠它找到上界）。
    this.upper = null;
    this.upperTerrain = null;
    // ⚠️ 各低频时钟的累积器（上界 / 幽冥 / 裂缝 / 植被 / 野火）**不再散着放**——
    //    全部收进 `this.advanceState`（`sim/advance.js` 的 `createAdvanceState()`）。
    //    理由见那个文件头：散着放就得在**每一处**推进代码里各抄一遍时钟列表，
    //    而那个模式已经漏过两次时钟（植被 / 野火；以及 2026-09-23 新增的
    //    `stepNether`，即 BACKLOG #13）。放一份，`update()` 与全部测试脚本
    //    共用同一份节流状态。
    //    ⚠️ `hydroAccum` / `decayAccum` **不在里面**：那两个按**真实时间**（`dt`）
    //       驱动，不是「游戏日驱动的时钟」（见各自的注释）。
    this.advanceState = createAdvanceState();
    /** 上界地形需要重绘（本轮只由低频 step 置位，为下一阶段留口） */
    this.upperDirty = false;

    // ── 幽冥（第三界，与上界同构）──────────────────────────
    // 世界侧的正规引用是 `world.nether`（`attachNether` 造），`this.nether` 只是
    // 本类的缓存。**构造器这一格不能省**：漏了它，一次 reset 之后残留的
    // `this.nether` 会仍指着上一局的世界——`attachNether` 覆盖了它所以看不出来，
    // 但 `this.upper` / `this.upperTerrain` 都在这里置空，不置就是不对称。
    this.nether = null;
    // 幽冥地形图层：与 `this.upperTerrain` 逐格对称（见 attachNether）。
    // **这一格同样不能省**：漏了它，一次换世界之后残留的旧图层会仍指着上一局的
    // 幽冥——`attachNether` 覆盖了它所以看不出来，但视界贴的就是别人的图。
    this.netherTerrain = null;
    /** 幽冥地形需要重绘（与 `upperDirty` 同构，本轮同样只置位、不读） */
    this.netherDirty = false;
    // （幽冥的低频时钟累积器在 `this.advanceState.nether`，见上面那段说明。）

    // ── 上界视界（自由形状划选 / 套索）──────────────────────
    // ⚠️ `this.selection` 是 **UI 状态，不进世界存档**：存档是给「世界」的，
    //    不是给「屏幕」的（规格 §6.2）。所以它挂在这里，不挂 world。
    /** 已提交的划选区域 `{path,x0,y0,x1,y1,area,capped}`（整数格、已钳到边界），null = 没开视界。
     *  `path` 是自由闭合多边形的顶点序列（首尾不重复）；`x0/y0/x1/y1` 是它的包围盒。 */
    this.selection = null;
    /** 拖拽中的路径（世界坐标格点数组 `[[x,y],...]`），null = 没在划。用来做实时反馈 */
    this.selectPath = null;

    this.pointer = { x: 0, y: 0, inside: false, down: false, painting: false, panning: false, lastX: 0, lastY: 0 };
    this.hoverTile = { x: 0, y: 0 };
    this.selected = null;
    this.dirty = true;
    this.lastTime = 0;
    this.fps = 0;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.hydroAccum = 0;
    // （植被 / 野火的时钟累积器在 `this.advanceState.eco` / `.fire`，同上。）
    this.decayAccum = 0;
    this.autoSaveAccum = 0;
    // 自动存档的并发护栏。存档现在是**异步**的（gzip 要走 CompressionStream），
    // 而这段代码跑在帧循环里：不挡的话 90 秒到点就发一次，上一次还没压完又发一次。
    // 更坏的是它会和玩家手点的「存档」撞在一起，而 localStorage 的写**不是原子的**
    // ——两边交错就可能留下半截档，而那是读档时才发现的。
    this.autoSaving = false;
    // 「本机不支持压缩、已退回明文」只提醒一次。
    // **不提醒是禁止的**：退回之后长卷存档从 24.6% 涨到 72.3%（三界并存之后直接超配额），
    // 而玩家看到的现象只是「存档怎么变大了」，日志里一个错都没有——
    // 这正是本项目最怕的那类静默失效。每 90 秒弹一次又太吵，所以只弹第一次。
    this.warnedPlainAutoSave = false;
    this.uiAccum = 0;
    this.running = true;
    this.toast = '';
    this.toastTimer = 0;
    this.brushTimer = 0;
    // 史册面板的排序方式（见 refreshNecrology）。'recent' = 按卒年倒序（默认），
    // 'importance' = 按淘汰分数倒序。**只影响这一块面板**，不动世界。
    this.necroSort = 'recent';
    // 面板上正在摊开的那条名录（点了才摊）。只存 id，不抱记录对象——
    // 名录会淘汰裁剪，抱对象会抱着一条已经不存在的旧闻。
    this.necroOpenId = null;
    /** 史册列表的点击委托只挂一次（面板每次刷新都重建 innerHTML） */
    this.necroBound = false;
    // ── 世界可观察性（Batch 1）────────────────────────────
    // 「值得关注」面板正在摊开的那个人（活人）。与 `necroOpenId` 同一个道理：
    // 只存 id 不抱对象——活人会死、会被 `world.entities` 就地压掉，
    // 抱着一个已经不在世上的对象会让面板一直显示一份查不到的旧卡片。
    this.personOpenId = null;
    /** 活人榜的点击委托只挂一次（同上） */
    this.notablesBound = false;
    // ── 玩家干预的反馈（Batch 2）──────────────────────────
    // 点选类神力（天灾 / 抹除 / 仙道）在 `applyTool` 里会把「发生了什么」
    // 写成人话返回，然后 `notify` 出去。但**通知栏只有一行**，而 `pointerup`
    // 里那句「已记录，可 Ctrl+Z 撤销」紧接着又 `notify` 一次，把它**盖掉**——
    // 实测：陨石砸死 24 人，玩家看到的只有「陨石 · 已记录，可 Ctrl+Z 撤销」。
    // 那句话说的事比「可撤销」重要得多，所以这里把它留到 pointerup 时**接在
    // 撤销提示前面**，而不是让它被盖掉。
    this.clickSaid = '';
    this.strokeIntervention = null;
  }

  // ── 启动 ────────────────────────────────────────────────
  boot() {
    this.buildToolPanel();
    this.bindEvents();
    this.setupSectionToggles();
    this.resize();
    this.newWorld(this.presetKey, this.seed);
    requestAnimationFrame((ts) => this.frame(ts));
  }

  newWorld(presetKey = this.presetKey, seed = this.seed) {
    const preset = WORLD_PRESETS[presetKey] || WORLD_PRESETS.medium;
    this.presetKey = presetKey;
    this.seed = seed >>> 0;
    this.world = generateWorld({ preset, seed: this.seed, scatter: true });
    this.life = new Life(this.world, mulberry32(this.seed ^ 0xa5a5a5a5));
    this.terrain = new TerrainLayer(this.world, { relief: this.camera.relief });
    // 上界：与凡间同尺寸的另一张地图 + 第二个 TerrainLayer。
    // 放在 terrain 之后，是因为第二个图层要用相机当前的 relief 设置。
    this.attachUpper(this.world);
    // 幽冥：与凡间同尺寸的第三张图，但没有 TerrainLayer、没有 Life（见 attachNether）。
    // 与上界并列，同样放在 terrain 之后。
    this.attachNether(this.world);
    this.camera.bind(this.world);
    this.camera.fit(this.world);
    this.history.clear();
    this.selected = null;
    // 换世界就把视界收掉：它划的是上一个世界的地方，留着就是开在别人图上的窗，
    // 而窗口里贴的是旧上界——看起来完全正常，只是全错。
    this.selection = null;
    this.selectPath = null;
    // 换世界就把摊开的那份传记收起来：它属于上一个世界，
    // 留着就是一条查不到的旧闻（而且看起来完全正常）。
    this.hideDeadBiography();
    this.dirty = true;
    this.notify(`新世界已开 · 种子 ${this.seed}`);
    this.syncWorldControls();
    this.refreshChronicle();
    this.refreshNecrology();
    // 三界：换世界之后上界/幽冥也整个换了，面板不刷就是开在别人图上的窗
    this.refreshThreeRealms();
    // 卜算子登场。台词只在「第一次见面」时说一次（met 存在世界里，读档不会重说）。
    greetOnBoot(this.world, this.rng);
    this.refreshBusanzi();
  }

  /**
   * 给一个凡间世界挂上界：生成（或复用存档里的）上界 world + 第二个 TerrainLayer。
   *
   * 三件必须做对的事，每一件错了都不报错：
   *  1. **上界 seed 必须与凡间不同**。上界的 `Life` 会从它自己的 `world.seed`
   *     内部派生 `warRng`（`life.js:124`，构造函数里派生、外部覆盖不了），
   *     seed 相同 → 两张图的战争随机流一模一样。所以凡间 seed **原样**传进
   *     `generateUpperWorld`——它内部会派生（`upper.seed === deriveUpperSeed(凡间seed)`）。
   *     千万别在这里先 xor 一次：那是**双重派生**，上界 seed 会落到另一个值上，
   *     而且不报错，只是与 `planes.js` / save.js 派生出来的那份对不上。
   *  2. **`qi` 是推导量，要补算**。`generateUpperWorld` 落地时灵脉可能还没灌进来，
   *     第二个 TerrainLayer 读到的地气层会是全 0——地图上一点灵气色都没有，
   *     而且**不报错、不崩溃**，只是看着「上界很荒」。
   *     ⚠️ 必须用 `recomputeUpperQi`（上界公式：地表基数 × 1.8），**不是**凡间的
   *     `recomputeQi`——那个走凡间那套 `qiAt`（读 riverBase + 凡间灵脉加成），
   *     会把上界的灵气层整个按凡间公式覆盖掉，同样不报错。
   *  3. **`world.upper = upper`** 是下一阶段 `ascend()` 唯一的入口（规格 §2.1）。
   *     现在先挂上，免得那一阶段回来补接线时漏掉一处调用方
   *     （`ascend()` 有两个调用方，漏一个就是「玩家亲手送走的人上界查不到」）。
   *
   * ⚠️ 读档进来的世界若已自带 `upper`（存档侧在加这个块），**直接复用、不要重生成**——
   *    重生成会与存档里那份上界分叉，而两条线看起来都「正常」。
   */
  attachUpper(mortal) {
    let upper = mortal.upper;
    const shapeOk = upper && upper.height && upper.w === mortal.w && upper.h === mortal.h;
    if (!shapeOk) {
      // 按尺寸反查回预设（读档路径只拿得到 world，拿不到预设名），
      // 查不到就退回一个只有尺寸的最小 preset——generateWorld 只读 w/h。
      const preset = Object.values(WORLD_PRESETS)
        .find((p) => p.w === mortal.w && p.h === mortal.h) || { w: mortal.w, h: mortal.h };
      // seed 传凡间的原值：上界 seed 的派生在生成器内部做。
      upper = generateUpperWorld({ preset, seed: mortal.seed });
      mortal.upper = upper;
    }
    recomputeUpperQi(upper);
    this.upper = upper;
    // UpperLife 的随机流从 upper.seed 派生（铁律一），重建点唯一——
    // 与凡间 Life 的重建方式完全对称：新档/读档/导入三条路径都汇聚在这里。
    this.upperLife = new UpperLife(upper);
    // 第二个 TerrainLayer：全量渲染到它自己的离屏 canvas，视界贴图时再裁剪。
    this.upperTerrain = new TerrainLayer(upper, { relief: this.camera.relief });
    // 换世界 / 读档后上界时钟归零，免得新一局继承上一局残留的累加量。
    this.advanceState.upper = 0;
    this.upperDirty = true;
  }

  /**
   * 给一个凡间世界挂幽冥：生成（或复用存档里的）幽冥 world。与 `attachUpper` 逐条对称，
   * 但有**四条刻意的差异**，每条都有理由，不是抄漏：
   *  1. **seed 传凡间的 `mortal.seed`（原样）**。`generateNetherWorld` 内部走
   *     `deriveNetherSeed`（异或、自逆），先派生一次再传进来会**静默**退回凡间种子。
   *  2. **不调任何 `recomputeNetherQi`**——它不存在，也不需要。幽冥的 `qi` 走凡间那套
   *     `qiAt`（阴气在 `veg` 层，不在 `qi` 层），生成器内部已 `recomputeQi` 一次
   *     （见 `worldgenNether.js:634-637`、`save.js:778-780`）。上界那行 `recomputeUpperQi`
   *     在幽冥这一侧对应的动作就是**什么都不做**。
   *  3. **没有 `NetherLife` 类**（`sim/` 下只有 `upperLife.js` 这个类），但幽冥 tick
   *     **已接**（8-C 落地，2026-09-23）：低频 `stepNether(world, days)` 每 10 游戏日
   *     跑一次（见 `update()`），收的是**凡间 world**（它要读 `world.souls` 对账）。
   *     ⚠️ 这条注释原先写着「幽冥 tick 是阶段 8-C 的活，本轮不做」——**已过期**。
   *  4. **接 `TerrainLayer`（本轮补上）**：幽冥是**真正的 `World` 实例**
   *     （`worldgenNether.js` 里 `new World(...)`），height/water/type/veg 都填了，
   *     而 `TerrainLayer.render()` 只从 world 解构那几张数组、构造函数只读
   *     `reliefScale / w / h / seed` ⇒ **不需要新渲染器**，直接建第二个图层即可。
   *     在这之前这里写着「不接 TerrainLayer、不渲染：没有现成的幽冥渲染入口」——
   *     那是「视界只能看上界」时代的结论；现在视界能选看哪一界，入口就是这一行。
   *
   * ⚠️ 读档进来的世界若已自带 `nether`（`save.js:614-616` 会建）就**复用、不重生成**——
   *    重生成会与存档里那份幽冥分叉。新开一局时 `mortal.nether` 是 `undefined`，
   *    正是这里要补的路径。
   */
  attachNether(mortal) {
    let nether = mortal.nether;
    const shapeOk = nether && nether.height && nether.w === mortal.w && nether.h === mortal.h;
    if (!shapeOk) {
      // 按尺寸反查回预设（读档路径只拿得到 world，拿不到预设名），
      // 查不到就退回一个只有尺寸的最小 preset——generateNetherWorld 只读 w/h。
      const preset = Object.values(WORLD_PRESETS)
        .find((p) => p.w === mortal.w && p.h === mortal.h) || { w: mortal.w, h: mortal.h };
      // seed 传凡间的原值：幽冥 seed 的派生在生成器内部做。
      nether = generateNetherWorld({ preset, seed: mortal.seed });
      mortal.nether = nether;
    }
    // 世界侧的正规引用（`world.nether`）在这里，本类缓存 `this.nether` 与上界同构。
    this.nether = nether;
    // 第三个 TerrainLayer：与 `attachUpper` 那行逐字对称。视界贴图时按坐标裁剪。
    this.netherTerrain = new TerrainLayer(nether, { relief: this.camera.relief });
    this.netherDirty = true;
    // 与 `attachUpper` 的 `this.advanceState.upper = 0` 对称：换世界 / 读档后
    // 时钟归零，免得新一局继承上一局残留的累加量。
    this.advanceState.nether = 0;
  }

  // 让底部控件反映「当前真正在跑的那个世界」。
  // 换世界有三条路径：开新天、读档、导入。存档里只记了 w/h 和种子，不记预设名，
  // 所以这里按尺寸反查回预设；读档进来一个长卷时，下拉才不会还停在「中堂」。
  syncWorldControls() {
    if (!this.world) return;
    const match = Object.keys(WORLD_PRESETS)
      .find((key) => WORLD_PRESETS[key].w === this.world.w && WORLD_PRESETS[key].h === this.world.h);
    if (match) this.presetKey = match;
    const presetSelect = $('inkPresetSelect');
    if (presetSelect) presetSelect.value = this.presetKey;
    const seedInput = $('inkSeedInput');
    if (seedInput) seedInput.value = String(this.world.seed);
    this.seed = this.world.seed >>> 0;
  }

  notify(text, ms = 2600) {
    this.toast = text;
    this.toastTimer = ms / 1000;
    const el = $('inkHint');
    if (el) el.textContent = text;
  }

  // ── 工具面板 ────────────────────────────────────────────
  buildToolPanel() {
    const groups = $('inkGroups');
    const list = $('inkTools');
    groups.innerHTML = '';
    list.innerHTML = '';
    let activeGroup = TOOL_GROUPS[0].key;

    const renderList = (groupKey) => {
      list.innerHTML = '';
      TOOLS.filter((tool) => tool.group === groupKey).forEach((tool) => {
        const btn = document.createElement('button');
        btn.className = 'ink-tool';
        btn.dataset.tool = tool.id;
        btn.innerHTML = `<span class="ink-tool-icon">${tool.icon}</span><span class="ink-tool-name">${tool.name}</span>`;
        btn.title = `${tool.name} · ${tool.hint}`;
        btn.addEventListener('click', () => this.selectTool(tool.id));
        list.appendChild(btn);
      });
      this.selectTool(this.toolId);
    };

    TOOL_GROUPS.forEach((group) => {
      const tab = document.createElement('button');
      // ⚠️ 类名必须与 `inkbox.html` 的样式表一致：那边定义的是 `.group`，
      //    不是 `.ink-group`。写成 `ink-group` 时**不报错**，只是标签完全没样式
      //    （连带 `.group.on` 失效 ⇒ 玩家看不出哪一组被选中）。
      tab.className = 'group';
      tab.dataset.group = group.key;
      tab.textContent = group.label;
      tab.style.setProperty('--group-color', group.color);
      tab.addEventListener('click', () => {
        activeGroup = group.key;
        groups.querySelectorAll('.group').forEach((el) => el.classList.toggle('on', el.dataset.group === group.key));
        renderList(group.key);
      });
      if (group.key === activeGroup) tab.classList.add('on');
      groups.appendChild(tab);
    });
    renderList(activeGroup);
  }

  selectTool(id) {
    if (!TOOL_BY_ID[id]) return;
    // ── 关闭路径 ①：切走视界工具（viewUpper / viewNether）就收起视界 ──
    // 视界是「view 模式」的产物：离开这个工具就该离开这个视图。
    // 这也是**唯一的常规出口**——`render()` 只看 `this.selection`，不清的话那扇窗
    // 会永久盖在屏幕上，玩家会以为卡死了。
    //
    // ⚠️ 只在**工具真的换了**（`id !== this.toolId`）时清。`buildToolPanel` 的
    //    `renderList` 每次点分组标签都会拿**同一个** `this.toolId` 再调一次本函数，
    //    无条件清会让「只是点了个分组标签」也把窗关掉。
    // ⚠️ 不置 `this.dirty`：视界开关只影响画中画那一层，不碰地形位图，
    //    而 `render()` 每帧都会按 `this.selection` 重画那扇窗。
    // ⚠️ 界名取 `viewPlane().label`，且必须在 `this.toolId = id` **之前**取——
    //    取的是**正在被切走的那一界**（窗里贴的就是它），说「上界视界」还是
    //    「幽冥视界」得与玩家刚看到的一致。
    if (id !== this.toolId && this.selection) {
      const label = this.viewPlane().label;
      this.selection = null;
      this.selectPath = null;
      this.notify(`已收起${label}视界`, 2200);
    }
    this.toolId = id;
    document.querySelectorAll('.ink-tool').forEach((el) => el.classList.toggle('on', el.dataset.tool === id));
    const tool = TOOL_BY_ID[id];
    const hint = $('inkToolHint');
    if (hint) hint.textContent = `${tool.name} — ${tool.hint}`;
    this.updateCursor();
  }

  get tool() {
    return TOOL_BY_ID[this.toolId] || TOOLS[0];
  }

  get brushRadius() {
    return LIMITS.brushSizes[this.brushIndex] || 4;
  }

  updateCursor() {
    if (!this.canvas) return;
    if (this.pointer.panning) {
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    const tool = this.tool;
    // 划选（select）与点选（click）都该是十字光标：它们都要精确落到格上。
    this.canvas.style.cursor = tool.readonly
      ? 'help'
      : (tool.mode === 'click' || tool.mode === 'select') ? 'crosshair' : 'cell';
  }

  // ── 右栏分区折叠（BACKLOG ⑭ · D3-B3）───────────────────────
  // 右栏 12 个 sec-title 都是信息墙，新玩家被压住、老玩家也用不到全部。
  // 给每个分区加可点击折叠 + 持久化（localStorage）：
  //   · 哪些默认折叠由 HTML 上 `data-default-collapsed="1"` 标注（图例、操作、门道）；
  //   · 玩家的选择覆盖默认值，刷新后还在；
  //   · 不重新写 HTML 结构，只是把每个 sec-title 之后到下一个 sec-title 之前
  //     的兄弟元素包进一个 `.sec-body` 容器，用 max-height 做折叠动画。
  //   · 这是 JS 一次性做，boot 之后所有 refresh 函数依然 appendChild 到 sec-body 内。
  setupSectionToggles() {
    const rail = document.querySelector('.rail.right');
    if (!rail) return;
    const STORAGE_KEY = 'inkbox.sec';
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { /* localStorage 不可用就当空 */ }
    const titles = rail.querySelectorAll('.sec-title');
    for (const title of titles) {
      const key = (title.textContent || '').trim();
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
      // 状态恢复：localStorage > data-default-collapsed > 默认展开
      const initialCollapsed = stored[key] !== undefined
        ? stored[key]
        : title.dataset.defaultCollapsed === '1';
      if (initialCollapsed) {
        body.classList.add('collapsed');
        title.classList.add('collapsed');
      }
      title.addEventListener('click', () => {
        const collapsed = !body.classList.contains('collapsed');
        body.classList.toggle('collapsed', collapsed);
        title.classList.toggle('collapsed', collapsed);
        try {
          const cur = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
          cur[key] = collapsed;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
        } catch (_) { /* 不存也不影响 UI */ }
      });
    }
  }

  // ── 事件 ────────────────────────────────────────────────
  bindEvents() {
    window.addEventListener('resize', () => this.resize());

    const canvas = this.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      this.pointer.x = e.clientX - rect.left;
      this.pointer.y = e.clientY - rect.top;
      this.pointer.inside = true;
      // 必须就地重算光标格。hoverTile 平时靠 pointermove 维护，但相机可以在
      // 不移动鼠标的情况下变化——按 H 回全图、点右侧势力行、切立体视图（拾取公式
      // 本身随立体投影改变）、窗口缩放。这些情况下沿用旧 hoverTile 就会「笔落别处」。
      this.hoverTile = this.camera.pick(this.pointer.x, this.pointer.y, this.world);
      if (e.button === 2 || e.button === 1 || this.spaceDown) {
        this.pointer.panning = true;
        this.pointer.lastX = this.pointer.x;
        this.pointer.lastY = this.pointer.y;
        this.updateCursor();
        return;
      }
      this.pointer.down = true;
      const tool = this.tool;
      if (tool.mode === 'select') {
        // 划选是**一次成型**的动作：按下只是起个头，抬起才提交。
        // 所以这里不 history.begin()、不 applyTool()，拖拽也不走主循环的限速笔刷——
        // 「反复调用会不断重开视界」正是不能复用 'drag' 的理由（规格 §3.2）。
        const t = this.hoverTile;
        if (!this.world.inside(t.x, t.y)) return;
        // 起一条路径，首点就是落笔格。路径是**世界坐标的格点序列**，
        // 闭合但首尾不重复（最后一点 ≠ 第一点），由 normalizeRegion 收尾。
        this.selectPath = [[t.x, t.y]];
        return;
      }
      if (tool.readonly) {
        this.inspectAt(this.hoverTile.x, this.hoverTile.y);
        return;
      }
      this.history.begin();
      this.clickSaid = '';
      this.lastInterventionOutcome = null;
      this.strokeIntervention = CAUSAL_TOOL_IDS.includes(tool.id)
        ? { toolId: tool.id, x: this.hoverTile.x, y: this.hoverTile.y }
        : null;
      this.pointer.painting = true;
      this.applyTool(true);
    });

    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer.x = e.clientX - rect.left;
      this.pointer.y = e.clientY - rect.top;
      this.pointer.inside = true;
      const tile = this.camera.pick(this.pointer.x, this.pointer.y, this.world);
      this.hoverTile = tile;
      if (this.pointer.panning) {
        const dx = this.pointer.x - this.pointer.lastX;
        const dy = this.pointer.y - this.pointer.lastY;
        this.camera.panBy(dx, dy);
        this.camera.clamp();
        this.pointer.lastX = this.pointer.x;
        this.pointer.lastY = this.pointer.y;
        return;
      }
      // 划选拖拽：把当前格钳进地图，追加进路径（实时反馈）。
      // ⚠️ **连续去重**：只有与上一个点的格坐标不同才追加。鼠标每帧都发
      //    pointermove，不去重的话一条划选会攒出上万个点，鞋带公式与光栅化
      //    都跟着变慢，而形状一点没变。取整 / 收尾放在提交时做。
      if (this.selectPath) {
        const x = this.world.clampX(tile.x);
        const y = this.world.clampY(tile.y);
        const last = this.selectPath[this.selectPath.length - 1];
        if (!last || last[0] !== x || last[1] !== y) this.selectPath.push([x, y]);
      }
      // 落笔统一交给主循环限速处理，这里只更新光标所在格
    });

    const endPointer = () => {
      // 划选在这里**提交一次**（也只有这里提交）。放在 painting 之前，
      // 因为 'select' 不置 painting 位。
      if (this.selectPath) {
        this.commitSelection(this.selectPath);
        this.selectPath = null;
      }
      if (this.pointer.painting) {
        const label = this.tool.name;
        if (this.history.end(label)) {
          if (this.strokeIntervention) {
            const entry = this.history.stack[this.history.stack.length - 1];
            const outcome = createInterventionOutcome({
              ...this.strokeIntervention,
              action: this.tool.name,
              metrics: measureChangedCells(this.world, entry?.changes),
            });
            this.lastInterventionOutcome = outcome;
            this.clickSaid = outcome.message;
            if (outcome.status === 'success') {
              this.world.record(outcome.message, 'intervention');
              this.refreshChronicle();
            }
          }
          // ⚠️ 点选工具刚在 pointerdown 的 `applyTool` 里报过「发生了什么」
          //    （「乱石岗天降陨石：17 人罹难，3 所聚落受损。」）。通知栏只有
          //    一行、后写的赢，所以这里**接在后面**而不是盖掉它——否则玩家
          //    永远看不到自己刚才把世界改成了什么样。
          const said = this.clickSaid;
          const undoNote = this.lastInterventionOutcome?.status === 'failed'
            ? '' : '可 Ctrl+Z 撤销。';
          this.notify(said ? `${said}${undoNote}` : `${label} · 已记录，可 Ctrl+Z 撤销`);
        }
      }
      this.strokeIntervention = null;
      this.lastInterventionOutcome = null;
      this.clickSaid = '';
      this.pointer.down = false;
      this.pointer.painting = false;
      this.pointer.panning = false;
      this.updateCursor();
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('pointerleave', () => {
      this.pointer.inside = false;
      endPointer();
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
      this.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
      this.dirty = true;
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.code === 'Space') {
        this.spaceDown = true;
        e.preventDefault();
        this.togglePause();
        return;
      }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const label = this.history.undo(this.world);
        this.notify(label ? `已撤销「${label}」` : '没有可撤销的操作');
        this.dirty = true;
        return;
      }
      if (e.key >= '1' && e.key <= '6') {
        this.setSpeed(Number(e.key) - 1);
        return;
      }
      if (e.key === '[') this.setBrush(this.brushIndex - 1);
      if (e.key === ']') this.setBrush(this.brushIndex + 1);
      if (e.key === 'g' || e.key === 'G') this.toggleGrid();
      if (e.key === 'v' || e.key === 'V') this.toggleRelief();
      if (e.key === 'h' || e.key === 'H') {
        this.camera.fit(this.world);
        this.dirty = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.spaceDown = false;
    });

    // 底部控制
    $('inkBrushRange').addEventListener('input', (e) => this.setBrush(Number(e.target.value)));
    $('inkSpeedBar').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-speed]');
      if (btn) this.setSpeed(Number(btn.dataset.speed));
    });
    $('inkBtnPause').addEventListener('click', () => this.togglePause());
    $('inkBtnUndo').addEventListener('click', () => {
      const label = this.history.undo(this.world);
      this.notify(label ? `已撤销「${label}」` : '没有可撤销的操作');
      this.dirty = true;
    });
    $('inkBtnGrid').addEventListener('click', () => this.toggleGrid());
    $('inkBtnRelief').addEventListener('click', () => this.toggleRelief());
    $('inkBtnFit').addEventListener('click', () => {
      this.camera.fit(this.world);
      this.dirty = true;
    });
    $('inkBtnRegen').addEventListener('click', () => {
      const seedInput = $('inkSeedInput');
      const presetSelect = $('inkPresetSelect');
      const seed = (Number(seedInput.value) >>> 0) || (Math.floor(Math.random() * 0xffffffff) >>> 0);
      seedInput.value = String(seed);
      this.newWorld(presetSelect.value, seed);
    });
    $('inkBtnSave').addEventListener('click', async () => {
      const slot = $('inkSlotSelect').value || 'auto';
      const result = await saveToStorage(this.world, slot, { name: slot });
      if (result.ok) {
        // 报的是**落盘**体积（压缩后）。压缩比必须一起给出来，否则
        // 「同一个世界，存档怎么突然只剩三分之一」会被当成丢了数据。
        const ratio = result.bytes > 0 ? (result.rawBytes / result.bytes).toFixed(1) : '1.0';
        this.notify(`已存档到「${slot}」· ${(result.bytes / 1024).toFixed(0)} KB`
          + (result.codec === 'gzip'
            ? `（压缩 ${ratio}×）`
            : `（明文·${plainSaveTag(result.fallbackReason)}）`));
      } else {
        this.notify(`存档失败：${result.error}`);
      }
      this.refreshSlots();
    });
    $('inkBtnLoad').addEventListener('click', async () => {
      const slot = $('inkSlotSelect').value || 'auto';
      const world = await loadFromStorage(slot);
      if (!world) {
        this.notify(`「${slot}」没有存档`);
        return;
      }
      this.world = world;
      this.life = new Life(this.world, mulberry32(this.world.seed ^ 0xa5a5a5a5));
      this.terrain.setWorld(this.world);
      // 上界也要跟着换：存档里带 upper 就复用，没带就按凡间 seed 重新派生
      // （旧档降级路径）。不换的话视界会贴上一个世界的上界——看着完全正常，只是全错。
      this.attachUpper(this.world);
      // 幽冥同理：存档带 nether 就复用，没带就按凡间 seed 重新派生（旧档降级）。
      this.attachNether(this.world);
      this.camera.bind(this.world);
      this.camera.fit(this.world);
      this.history.clear();
      this.selected = null;
      // 视界是 UI 状态，换世界就收掉。
      this.selection = null;
      this.selectPath = null;
      this.hideDeadBiography();
      this.dirty = true;
      this.notify(`已读取「${slot}」`);
      this.syncWorldControls();
      this.refreshTerritory();
      this.refreshChronicle();
      this.refreshNecrology();
      this.refreshThreeRealms();
      this.refreshBusanzi();
    });
    $('inkBtnExport').addEventListener('click', () => exportFile(this.world));
    // 编年史导出：编年是这个世界唯一的「史书」，而它是个 400 条的滚动窗口——
    // 越往后，前面的事就被顶出去了。导出是**唯一**能把早年的记录留下来
    // 的办法，也是「观察层」这个玩法真正的出口（见 sim/biography.js）。
    $('inkBtnChronicle').addEventListener('click', () => {
      const md = exportChronicle(this.world);
      const name = chronicleFileName(this.world);
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      this.notify(`已导出 ${name}（${md.length} 字）`);
    });
    // ── 史册（逝者名录，见 sim/necrology.js）───────────────
    // 排序切换。**只改面板的排法**，不碰世界——名录本身按时间插入，
    // 排序是纯派生（necrologyList 每次都新建数组，不改 world.dead）。
    $('inkBtnNecroRecent').addEventListener('click', () => this.setNecroSort('recent'));
    $('inkBtnNecroImportance').addEventListener('click', () => this.setNecroSort('importance'));
    $('inkBtnNecrology').addEventListener('click', () => {
      const md = exportNecrology(this.world, { sort: this.necroSort });
      this.downloadText(necrologyFileName(this.world), md);
    });
    $('inkBtnImport').addEventListener('click', () => $('inkImportFile').click());
    $('inkImportFile').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const world = await importFile(file);
        this.world = world;
        this.life = new Life(this.world, mulberry32(this.world.seed ^ 0xa5a5a5a5));
        this.terrain.setWorld(this.world);
        // 同读档：导入的世界也要挂上它自己的上界，否则视界贴的是上一个世界的上界。
        this.attachUpper(this.world);
        // 幽冥同理：导入的世界也要挂上它自己的幽冥。
        this.attachNether(this.world);
        this.camera.bind(this.world);
        this.camera.fit(this.world);
        this.history.clear();
        this.selected = null;
        this.selection = null;
        this.selectPath = null;
        this.hideDeadBiography();
        this.dirty = true;
        this.notify('世界已导入');
        this.syncWorldControls();
        this.refreshTerritory();
        this.refreshChronicle();
        this.refreshNecrology();
        this.refreshThreeRealms();
        this.refreshBusanzi();
      } catch (error) {
        this.notify('导入失败：文件不是有效存档');
      }
      e.target.value = '';
    });
    $('inkBtnClear').addEventListener('click', () => {
      this.newWorld(this.presetKey, (Math.floor(Math.random() * 0xffffffff) >>> 0));
      $('inkSeedInput').value = String(this.seed);
    });

    this.refreshSlots();
    $('inkSeedInput').value = String(this.seed);
    this.setSpeed(this.speedIndex);
    this.setBrush(this.brushIndex);
  }

  togglePause() {
    this.speedIndex = this.speedIndex === 0 ? 2 : 0;
    this.setSpeed(this.speedIndex);
  }

  setSpeed(index) {
    this.speedIndex = Math.max(0, Math.min(TIME.speeds.length - 1, index));
    document.querySelectorAll('#inkSpeedBar [data-speed]').forEach((el) => {
      el.classList.toggle('on', Number(el.dataset.speed) === this.speedIndex);
    });
    $('inkBtnPause').classList.toggle('on', this.speedIndex === 0);
  }

  setBrush(index) {
    this.brushIndex = Math.max(0, Math.min(LIMITS.brushSizes.length - 1, index));
    $('inkBrushRange').value = String(this.brushIndex);
    $('inkBrushLabel').textContent = `半径 ${this.brushRadius}`;
  }

  toggleGrid() {
    this.showGrid = !this.showGrid;
    $('inkBtnGrid').classList.toggle('on', this.showGrid);
  }

  toggleRelief() {
    this.camera.relief = !this.camera.relief;
    this.terrain.setRelief(this.camera.relief);
    // 上界图层也要跟着切投影，否则视界里还按旧投影贴图，与窗外的山水对不上。
    if (this.upperTerrain) this.upperTerrain.setRelief(this.camera.relief);
    // 幽冥图层同理：漏了这行，看幽冥时贴的是旧投影的图，同样不报错。
    if (this.netherTerrain) this.netherTerrain.setRelief(this.camera.relief);
    $('inkBtnRelief').classList.toggle('on', this.camera.relief);
    this.dirty = true;
    this.notify(this.camera.relief ? '立体视图：能看清山有多高' : '平面视图：适合精确改地形');
  }

  /**
   * 自动存档（每 90 秒一次）。**异步且不阻塞帧循环**——调用方用 `void` 甩出去。
   *
   * 布尔护栏 `autoSaving`：90 秒一次、压缩只要 74 ms，看起来撞不上；但**档越大越慢**，
   * 三界并存之后整档是现在的 1.6 倍，而 localStorage 的写**不是原子的**。
   * 护栏的成本是一个 if，不护栏的代价是同一份档被并行写两遍、可能留下半截档，
   * 而那是**读档时才发现**的。
   *
   * 失败与「退回明文」都必须说出来：
   *   · 自动存档是玩家唯一的兜底，而它失败最常见的原因正是**配额满了**——
   *     那恰恰是压缩要解决的那个问题，所以「失败」与「压缩没生效」常常同时出现；
   *   · 退回明文之后长卷存档从 24.6% 涨到 72.3%，不报的话玩家只会觉得「存档变大了」。
   */
  async autoSave() {
    if (this.autoSaving) return;
    this.autoSaving = true;
    try {
      const result = await saveToStorage(this.world, 'auto');
      if (!result.ok) {
        this.notify(`自动存档失败：${result.error}`, 8000);
      } else if (result.codec !== 'gzip' && !this.warnedPlainAutoSave) {
        this.warnedPlainAutoSave = true;
        this.notify(plainSaveNotice(result.fallbackReason), 8000);
      }
      this.refreshSlots();
    } catch (error) {
      // 兜底：`void this.autoSave()` 甩出去之后没人接这个 promise，
      // 漏出去就是一个 unhandled rejection，而它在控制台里与「世界坏了」长得一样。
      console.error('[inkbox] 自动存档异常', error);
    } finally {
      this.autoSaving = false;
    }
  }

  refreshSlots() {
    const select = $('inkSlotSelect');
    const current = select.value;
    select.innerHTML = '';
    const slots = listSlots();
    // ── 预置槽 ────────────────────────────────────────────────
    // ⚠️ 2026-09-22 之前这里**一个预置槽都没有**：下拉里只有 localStorage 里已经存在的键，
    //    首次打开就只有一个空的 `auto`。于是玩家**没有办法存第二份**——「存档」永远覆盖
    //    auto，想留住两个世界只能靠导出文件。而 INKBOX.md 一直写着「localStorage 8 槽」
    //    （文档与实现不符：故障类 1 的镜像——**文档说有、代码里没有**）。
    //    修法就是把这 8 个命名槽显式说出来：`save.js` 本来就接受任意槽名
    //    （键是 `${saveKey}:${slot}`），这里只是把「有哪几个槽」摆给玩家看。
    const preset = ['auto'];
    for (let i = 1; i <= 8; i += 1) preset.push(`slot${i}`);
    const byName = new Map(slots.map((s) => [s.slot, s]));
    const merged = preset.map((name) => byName.get(name) || { slot: name, bytes: 0, compressed: false });
    // 兜底：`listSlots()` 里既不是 auto 也不是 slot1..8 的槽名照旧列出来。
    // 目前没有已知的写入路径会产生这类槽名（导入只返回 world、不落槽），
    // 留着是为了将来真出现别的写入路径时，老档不会从下拉里静默消失。
    for (const s of slots) if (!preset.includes(s.slot)) merged.push(s);
    merged.forEach((s) => {
      const option = document.createElement('option');
      option.value = s.slot;
      // 压缩状态必须显示出来：同一个世界，压缩后 24.6%、退回明文 72.3%。
      // 只给一个 KB 数字的话，两者看起来只是「大小不同」，
      // 玩家会以为存档坏了，而实际上该查的是浏览器支不支持压缩。
      const size = s.bytes
        ? `${(s.bytes / 1024).toFixed(0)} KB${s.compressed ? ' · 压缩' : ' · 明文'}`
        : '空';
      // 槽名是给 `save.js` 用的键（`auto` / `slot3`），不是给玩家看的字。
      const label = s.slot === 'auto' ? '自动'
        : (/^slot[1-8]$/.test(s.slot) ? `槽 ${s.slot.slice(4)}` : s.slot);
      option.textContent = `${label}（${size}）`;
      select.appendChild(option);
    });
    if (current) select.value = current;
  }

  // ── 落笔 ────────────────────────────────────────────────
  applyTool(isFirst) {
    const tool = this.tool;
    if (tool.mode === 'click' && !isFirst) return;
    // 划选工具没有「一个落点 + 半径」可言：它要的是一片自由形状，走 commitSelection。
    // 这里直接挡住——否则 apply(ctx) 会拿到一个没有 rect / commitSelection 的 ctx
    // 而抛错。试玩测试第 9 节会无差别地对每个工具调 applyTool，这条守卫也是为它存在的。
    if (tool.mode === 'select') return;
    const world = this.world;
    const x = this.hoverTile.x;
    const y = this.hoverTile.y;
    if (!world.inside(x, y)) return;

    const eventIdBefore = this.life.events.nextEventId;
    const ctx = {
      world,
      life: this.life,
      // 「降灾」工具要往世界事件表里推一场经年灾祸（`worldEvents.triggerCrisis`）。
      // 它挂在 Life 上，不从 world 走——WorldEvents 是随 Life 重建的。
      events: this.life.events,
      x: x + 0.5,
      y: y + 0.5,
      radius: this.brushRadius,
      amount: tool.amount,
      history: this.history,
      rng: this.rng,
    };
    ctx.result = tool.apply(ctx);
    this.dirty = true;
    this.rebuildVillageCache();

    // 卜算子的反应只在「按下的那一下」触发，拖拽重复的那几十次不算。
    // 否则按住刷子拖两秒，他就会跟你熟得像认识了十年。
    if (isFirst) {
      const spoke = reactToTool(world, this.rng, tool.id);
      if (spoke) this.refreshBusanzi();
    }

    if (tool.mode === 'click') {
      if (CAUSAL_TOOL_IDS.includes(tool.id)) {
        const event = tool.id === 'crisis'
          ? this.life.events.activeCrises.find((row) => row.id === eventIdBefore)
            || this.life.events.history.find((row) => row.id === eventIdBefore)
          : null;
        const outcome = createInterventionOutcome({
          toolId: tool.id,
          action: tool.name,
          x,
          y,
          rawResult: ctx.result,
          event,
        });
        this.lastInterventionOutcome = outcome;
        this.clickSaid = outcome.message;
        this.notify(outcome.message, 5200);
        this.refreshChronicle();
        this.refreshMilestones();
        return;
      }
      // 仙道那批神力会把「发生了什么」写成人话返回，直接透给玩家；
      // 地形笔刷返回数字，退回「落于某格」的通用提示。
      const said = ctx.result;
      if (typeof said === 'string' && said) {
        this.clickSaid = said;
        this.notify(said, 3200);
      } else {
        this.clickSaid = '';
        this.notify(`${tool.name} · 落于 (${x}, ${y})`, 1800);
      }
    }
  }

  rebuildVillageCache() {
    // 地形变了，村子的房屋可能已经沉进水里或埋进山里
    const world = this.world;
    for (let i = 0; i < world.villages.length; i += 1) {
      const v = world.villages[i];
      const idx = world.idx(Math.floor(v.x), Math.floor(v.y));
      if (!world.isBuildable(idx) && world.water[idx] > 0.01) {
        v.hp = Math.min(v.hp, 30);
      }
    }
  }

  /**
   * 自由划选路径 → 视界。**这是 'select' 模式唯一的提交点**（pointerup 调一次）。
   *
   * 为什么不复用 applyTool：applyTool 的 ctx 是「一个落点 + 半径」，
   * 而划选要的是一片**自由形状**；而且它会被主循环的限速**反复调用**，
   * 而「开一扇视界」是**一次成型**的动作——反复调用会不断重开（规格 §3.2）。
   * 所以走这条独立路径，且只由 pointerup 触发一次。
   *
   * 划选区域是 **UI 状态，不进世界存档**（规格 §6.2）：它挂在 `this.selection`，
   * 不挂 `world`。换世界 / 读档都会把它清掉。
   *
   * ⚠️ 参数名是 `points`：它装的是**自由形状的原始路径**（世界坐标格点数组），
   *    不是矩形。此前它叫 `rect`（矩形时代的遗留），名字与内容不符；
   *    本轮把它改成诚实的名字，并**同步**改了 `scripts/_riftwire.mjs` 里
   *    `extractBody(src, 'commitSelection(points) {')` 那处**按字面**切函数体的
   *    字符串——两处必须一起改，否则那条接线断言会当场变红（这是有意的护栏）。
   */
  commitSelection(points) {
    const world = this.world;
    if (!world) return;
    // 当前工具对应哪一界（决定文案里的界名与开缝门控）。它同时给出
    // 「上界」/「幽冥」两个中文名，免得这里再抄一份三目。
    const plane = this.viewPlane();
    const sel = this.normalizeRegion(points);
    if (!sel) {
      // 退化划选（点一下只有 1 点、划一条直线只有 2 点 / 面积太小）。
      // 它有两种语义，按「当前有没有开着的视界」分——**两种都必须发声**：
      // 静默地关掉和静默地拒绝一样坏，玩家只会觉得「刚才那下把东西弄没了」。
      //
      //   · 开着 → **收起**（关闭路径 ②，切换工具是路径 ①，见 selectTool）。
      //     为什么敢让「点一下」兼任关闭：关掉是**可逆的**（再拖一次就回来，两秒），
      //     而「关不掉」是不可逆的体验损失——那扇窗会永久盖在屏幕上，像卡死了。
      //     两者不对称，所以宁可允许误触关闭。
      //     这与「拒绝时不清已有视界」并不矛盾：那一版是**拒绝的副作用**，
      //     这一版是玩家**主动做的动作**，是明明白白的一下点击。
      //   · 没开 → **拒绝**，并说清下一步该做什么（不只是「失败了」）。
      if (this.selection) {
        this.selection = null;
        this.notify(`已收起${plane.label}视界（再按住拖拽可重新划开）`, 2600);
      } else {
        this.notify('划选太小，未开视界——请按住鼠标拖出一片形状（不能只点一格）', 3200);
      }
      return;
    }
    // 区域对象就是归一化结果本身：`path` + 包围盒 + `area` + `capped`。
    // 工具只负责决定「划哪块」，**记在哪由 UI 决定**——所以给它一个接收器，
    // 而不是让 ui/tools.js 反过来摸 Sandbox（那会让工具表依赖主程序）。
    const region = sel;
    const tool = this.tool;
    const ctx = {
      world,
      life: this.life,
      rect: region,
      history: this.history,
      rng: this.rng,
      commitSelection: (r) => { this.selection = r; },
    };
    const said = tool.apply(ctx);

    // ── 开缝：这是「视界」这个动作的**副作用**（规格 §4.1）──────────
    // 裂缝开在划选区域**边缘的连线**上，是两界的接缝；内部不开（内部是「看到的另一界」）。
    //
    // **两界都开缝**：`sim/rifts.js:5` 引的**用户原话**是「上界视界和**下界**的
    // 边缘会因此产生轻微的空间裂缝」——上界与幽冥共用同一个凡间 `world.rifts`，
    // 所以门控从「只认 viewUpper」扩成「认 VIEW_TOOL_IDS 里任一个」。
    //
    // ⚠️ **「都开缝」≠「都执行同一套跨界逻辑」**（D6-2 工程包 B）：缝开出来之后
    //    行为按目标位面分流——上界缝走漏物 / 吸人，幽冥缝走**它自己那三个效果**
    //    （凡人跌入幽冥 D6-3 A / 鬼爬入凡间 B / 幽冥物品漏回凡间 C），
    //    各抽各的流、互不干扰。分流点在 `sim/rifts.js` 的 `stepRifts` 第 3 步
    //    （`stepNetherRift`），**不在这里**：开缝是同一个动作，走路是两回事。
    //    ⚠️ 本条原来写的是「幽冥缝**本阶段冻结跨界**」——那是 D6-2 的临时状态，
    //    D6-3 A 已解冻。注释不跟着改就会变成一份**说谎的**设计说明。
    //
    // **为什么接在这里，而不是 ui/tools.js 的 `apply`**：`commitSelection` 是
    // pointerup 的**唯一**提交点，天然满足「一次成型、只能调一次」（规格 §3.2）。
    // 放在这里就不必把 `openRifts` 穿过工具表的 ctx 传进去——那会让工具表
    // 反过来依赖主程序，正是本文件一直在避免的方向（工具表只管「划哪块」）。
    //
    // ⚠️ **不许静默**：无论开成没开成都要发声。静默地关掉与静默地拒绝一样坏，
    //    玩家只会觉得「刚才那下把东西弄没了」（见上面「退化划选」那段同款教训）。
    //
    // ⚠️ **目标位面从 `VIEW_TOOL_PLANE` 取**（D6-2 工程包 B1）：这条缝连的是
    //    玩家此刻正在看的那一界——看上界就开上界缝，看幽冥就开幽冥缝。
    //    在别处再写一遍三目会让「加第三界」变成改 N 处、漏一处。
    const riftPlane = VIEW_TOOL_PLANE[tool.id];
    const rift = (riftPlane && typeof openRifts === 'function')
      ? openRifts(world, region, riftPlane)
      : null;
    let riftNote = '';
    if (rift && rift.opened > 0) {
      riftNote = `　边缘裂开 ${rift.opened} 道细缝`;
    } else if (rift && rift.refused) {
      // 拒绝也要说清为什么，不能只回一句「失败了」。
      // ⚠️ `'no-plane'`（D6-2 新加）：目标位面不存在（比如幽冥图没挂上）。
      //    说「地太薄」是**谎话**——玩家会去换一块地方划，而问题在世界没挂上，
      //    他划一万次也开不出缝。所以单列一句。
      riftNote = rift.reason === 'active-cap'
        ? '　裂缝太多，暂不开新缝'
        : rift.reason === 'no-plane'
          ? '　这一界尚未成形，缝连不过去'
          : '　这一带的地太薄/太虚，裂不开缝';
    }

    // 文案用**多边形面积**（不是包围盒面积）：套索是不规则的，包围盒会把
    // 「我划的那块」说得比实际大一圈。`area` 来自鞋带公式，可能是 .5，取整。
    const shownArea = Math.round(sel.area);
    const pct = ((sel.area) / world.size * 100).toFixed(0);
    // ── 窗内可见鬼魂（契约 §七「Feedback」）────────────────────────────
    // 「系统在跑、但没人看得见」正是 D4 要治的病：幽冥里明明有鬼魂
    // （`enterNether` 生成，见 `sim/netherLife.js`），玩家划开视界却读不到数。
    // 这一句只在**幽冥视界**且**窗内真的数得到鬼魂**时出现：
    //   · 上界没有鬼魂 ⇒ 加这句会印「窗内可见鬼魂 0 只」的噪音；
    //   · 幽冥但窗内 0 只 ⇒ 「0 只」不是信息，省掉。
    const ghosts = ghostsInRegion(plane, sel);
    const ghostNote = ghosts > 0 ? ` · 窗内可见鬼魂 ${ghosts} 只` : '';
    if (typeof said === 'string' && said) {
      this.notify(said + riftNote, 3200);
    } else {
      this.notify(`${plane.label}视界 · 约 ${shownArea} 格（全图 ${pct}%）`
        + (sel.capped ? `　已按 ${Math.round(UPPER_VIEW_MAX_AREA * 100)}% 上限收窄` : '')
        + riftNote + ghostNote, 2800);
    }
    this.dirty = true;
  }

  /**
   * 把一条自由划选路径归一成合法的视界区域（取整 / 钳界 / 面积上限）。
   *
   * 真正的几何在 `ui/tools.js` 的 `normalizeRegion`（纯函数、不碰 DOM）——
   * 放在那里是为了让 `scripts/_riftprobe.mjs` 能在 node 里断言它（本文件依赖
   * DOM，node 里 import 不了）。这里只是把 `this.world` 与面积上限接上去。
   *
   * 判据（替代旧 `normalizeSelection` 末尾那条单格守卫）：
   *   · 去重后不足 3 点 ⇒ null（一次点击 / 一条直线都不构成「一片山河」）；
   *   · 面积 < `REGION_MIN_AREA` ⇒ null。
   * 那条旧守卫判的是**矩形跨度**，对自由形状已无意义——留着就是「看起来在防、
   * 实际不防」的死守卫，已随 `normalizeSelection` 一起删掉。
   */
  normalizeRegion(points) {
    return normalizeRegionGeometry(points, this.world, UPPER_VIEW_MAX_AREA);
  }

  inspectAt(x, y) {
    if (!this.world.inside(x, y)) return;
    this.selected = { x, y };
    const world = this.world;
    const i = world.idx(x, y);
    const info = TERRAIN_INFO[world.type[i]];
    const village = world.villages.find((v) => Math.hypot(v.x - x, v.y - y) < 6);
    const faction = village ? world.factionById(village.faction) : null;
    let people = 0;
    let strongest = null;
    for (let k = 0; k < world.entities.length; k += 1) {
      const e = world.entities[k];
      if (Math.hypot(e.x - x, e.y - y) >= 5) continue;
      people += 1;
      // ⚠️ 这里原来是 `(e.level || 0) > (strongest ? strongest.level : 0)`——
      // 全是凡人的格子上 `0 > 0` 永远为假，于是 `strongest` 一直是 null，
      // 下面那段「家世」就永远显示不出来。改成「没选过就选第一个」。
      if (!strongest || (e.level || 0) > (strongest.level || 0)) strongest = e;
    }
    // 近处鬼影（D6-3 工程包 B）：鬼**不在 `world.entities` 里**，上面那个循环
    // 数不到它们（这正是「独立容器」在读数侧的代价）。单独数一遍。
    // ⚠️ **恒印这一行**（哪怕 0 只）：忽有忽无的尾巴会让以文字为锚点的断言
    //    随时变红（同右栏「最高 —」的理由）。
    let haunts = 0;
    if (Array.isArray(world.wraiths)) {
      for (let k = 0; k < world.wraiths.length; k += 1) {
        const g = world.wraiths[k];
        if (Math.hypot(g.x - x, g.y - y) < 5) haunts += 1;
      }
    }
    // 被附身（D6-3 工程包 D）：附近最强的那个人此刻**被一只鬼修接管着**吗？
    // ⚠️ **必须印**（机制在跑、玩家看不见等于不存在）：被附身者会**不再按自己的
    //    计划行动、也不接战**（`life.js` 的行为锁），不写这一行，玩家只会觉得
    //    「这人怎么傻站着」。与「养伤」同一类：行为异常必须有解释。
    // ⚠️ 用 `isControlled`（唯一判据）而不是自己比 `until > day`——那是第二份真相。
    // ⚠️ 附身**可能是凡人**（`pickCrossTarget` 修士优先，附近没有修士时才挑凡人），
    //    而凡人走下面 `else if (people > 0)` 那条**不显示修士详情**的分支——
    //    所以这一行要**两处都印**，否则凡人被附身时玩家什么都看不到。
    const possLine = (strongest && strongest.possessionScar && isControlled(strongest, world.day))
      ? `被【${strongest.possessionScar.ghostName}】`
        + `（${realmLabel(strongest.possessionScar.ghostLevel)}）驱使`
        + ` · 还有 ${Math.ceil(strongest.possessionScar.until - world.day)} 天`
      : null;
    const rows = [
      ['地貌', info ? info.name : '未知'],
      ['高程', world.height[i].toFixed(3)],
      ['水深', world.water[i].toFixed(3)],
      ['气温', `${(world.temp[i] * 100).toFixed(0)}%`],
      ['湿度', `${(world.moist[i] * 100).toFixed(0)}%`],
      ['植被', `${(world.veg[i] * 100).toFixed(0)}%`],
      ['肥力', `${(world.fertility(i) * 100).toFixed(0)}%`],
      ['灵气', `${(world.qi[i] * 100).toFixed(0)}%`],
      ['建筑', world.struct[i] ? ['', '屋舍', '宗祠', '垣墙', '望楼', '残垣'][world.struct[i]] : '无'],
      ['近处生灵', `${people} 人`],
      ['近处鬼影', `${haunts} 只`],
    ];
    if (village) {
      rows.push(['聚落', `${village.name} · ${['', '村落', '集镇', '城池', '王都'][village.level]}`]);
      rows.push(['人口', `${village.pop}`]);
      rows.push(['存粮', `${Math.round(village.food)}`]);
      rows.push(['势力', faction ? faction.name : '无']);
    }
    // 附近最强的修士：把境界、灵根、道途这些「迁移过来的设定」摊给玩家看。
    // 只报最强的那个，不然一屏人名列不下。
    if (strongest && (strongest.level || 0) >= 1) {
      const e = strongest;
      rows.push(['—', '—']);
      rows.push(['修士', `${e.name} · ${realmLabel(e.level)}`]);
      if (e.root) rows.push(['灵根', `${e.root.rootName}（${['劣', '中', '良', '优', '天'][e.root.quality] || '?'}）`]);
      if (e.dao) rows.push(['道途', `${e.dao.path.name} · ${e.dao.stage + 1} 阶`]);
      if (e.techniques.length) rows.push(['功法', e.techniques.map((t) => t.name).join('、')]);
      if (e.daoTitle) rows.push(['道号', e.daoTitle]);
      if (e.forbidden) rows.push(['禁术', e.forbidden]);
      if (e.beast) rows.push(['灵兽', e.beast]);
      if (e.bloodline) rows.push(['血脉', e.bloodline]);
      // 夺舍印记：这个人的身体**不是他自己的**。存的是夺舍当下的快照
      // （名字/境界/宗门/日期），不是 id——夺舍者早已不在世上（见 sim/possession.js）。
      if (e.possessedBy) {
        rows.push(['夺舍', `此身原属【${e.possessedBy.name}】`
          + `（${realmLabel(e.possessedBy.level)} · 第 ${Math.floor((e.possessedBy.day || 0) / 360) + 1} 年）`]);
      }
      rows.push(['因果', `${Math.round(e.karma)} · 心魔 ${Math.round(e.heartDemon)} · 道心 ${Math.round(e.mind)}`]);
      // ── 污染 ──
      // ⚠️ 这一行**必须**有。`pollution` 是真的在模拟的量（后台禁术事件 +12、
      //    每 tick 自然累积、秘境与天劫也加），而且它有一条**硬死锁**：
      //    凡间 level 60 且 `pollution ≥ 70` ⇒ 既不能突破（`cultivation.js`
      //    的 ceilingFor）也不能飞升（`:426` 的 `pollution < POLLUTION_ASCEND_LIMIT`）。
      //    面板不写它，玩家就**看不见自己是怎么把世界推死的**。
      //    `pollutionLabel()` 早就写好了（`core/cultivation.js:446`），
      //    但在 2026-09-22 之前**全库只有它自己的定义、零读者**（故障类 1）。
      if (e.pollution > 0) {
        const dead = e.pollution >= POLLUTION_ASCEND_LIMIT;
        rows.push(['污染', `${Math.round(e.pollution)} · ${pollutionLabel(e.pollution)}`
          + (dead ? '（已断飞升路）' : '')]);
        // 面板上有数，不等于玩家看得懂：「沾染浊气」是什么、从哪来、积多了会怎样，
        // 一个数字加一个档位名答不出来。所以真沾上了（≥ 20）就补一句说明。
        // 门槛设在 20 而不是 0：清净的人不占这块地方。
        if (e.pollution >= 20) {
          rows.push(['@note', dead
            ? '浊气已封道基：此身既不能突破，也飞升不了。'
            : '浊气积于道基，来自禁术、秘境与天劫；积到 70 便断飞升路。']);
        }
      }
      if (e.madUntil > world.day) rows.push(['状态', '走火入魔']);
      // 养伤：打完一架之后的恢复期，这段时间**不接战、也不会被选为目标**。
      // ⚠️ 这一行不是装饰：没有它，「这人怎么老不出手」在界面上永远是个谜
      //    （机制在跑、玩家看不见，等于不存在）。
      if (e.restUntil > world.day) {
        rows.push(['养伤', `还需 ${Math.ceil(e.restUntil - world.day)} 天`]);
      }
      // 被附身（D6-3 工程包 D）：这具身体此刻被一只鬼修接管着（行为锁生效）。
      // 与上面「养伤」同一类——行为异常必须在面板上有解释，否则机制等于不存在。
      if (possLine) rows.push(['附身', possLine]);
      // ── 法宝 ──
      // 法宝这一块要摊的不是「加多少战力」，而是**这件东西的来历**——
      // 它是沙盒里唯一能横跨几百年的东西，面板上不写「历任主人」就白做了。
      if (e.artifacts && e.artifacts.length) {
        rows.push(['法宝', e.artifacts.map((a) => describeArtifact(a)).join('、')]);
        let best = e.artifacts[0];
        for (let k = 1; k < e.artifacts.length; k += 1) {
          if (artifactPower(e.artifacts[k]) > artifactPower(best)) best = e.artifacts[k];
        }
        const line = ownerLine(best).text;
        if (line) rows.push(['来历', line]);
        if (best.spirit) rows.push(['器灵', `${best.spirit.name}·${best.spirit.personality}——${best.spirit.memory}`]);
      }
    } else if (people > 0) {
      rows.push(['—', '—']);
      rows.push(['近人', '皆是凡人，尚未觉醒']);
      // 凡人也会被附身（`pickCrossTarget` 修士优先，附近没有修士时才挑凡人）。
      // 这条分支不显示修士详情，所以「附身」要在这里再印一次（同上面那段注释）。
      if (possLine) rows.push(['附身', possLine]);
    }
    // ── 家世 ──
    // 转世让一个人活得比一世长，法宝让一件东西活得比人长，
    // 世家让一个姓氏活得比所有人都长（见 sim/family.js）。
    // 面板上要摊的不是数值，是**这一支人从哪来**：姓氏、双亲、子女、
    // 世家与世代、始祖、家学。凡人也有家世，所以这一段不挂在修士那个分支里。
    if (strongest) {
      const kin = lineageOf(world, strongest);
      if (kin.length) {
        rows.push(['—', '—']);
        for (let k = 0; k < kin.length; k += 1) rows.push(kin[k]);
      }
    }
    // ── 传记 ──
    // 家世说「这一支人从哪来」，传记说「**这个人**这一生做了什么」。
    // 沙盒原来只有一本 400 条的滚动编年史，看得到世界、看不到人；
    // 个人事件流（`entity.log`）是这一块新加的，见 sim/biography.js。
    if (strongest) {
      const bio = biographyRows(world, strongest);
      if (bio.length) {
        rows.push(['—', '—']);
        for (let k = 0; k < bio.length; k += 1) rows.push(bio[k]);
      }
    }
    // 脚下无主的东西：这是「地上真的有旧物」这件事唯一的可见之处
    const lying = (world.artifacts || []).filter((a) => Math.hypot(a.x - x, a.y - y) < 4);
    if (lying.length) {
      rows.push(['—', '—']);
      for (let k = 0; k < Math.min(3, lying.length); k += 1) {
        const a = lying[k];
        const line = ownerLine(a).text;
        rows.push(['无主之物', `${describeArtifact(a)}${line ? `　${line}` : ''}`]);
      }
      if (lying.length > 3) rows.push(['无主之物', `另有 ${lying.length - 3} 件`]);
    }
    const panel = $('inkInspect');
    // 「查看他的一生」：检视面板本来只给**摘要**（生平几件、最近一件）。
    // 完整的 `compileBiography` 此前只服务导出按钮——面板上看不到。
    // 这一颗按钮就是那条断掉的线：点它 → 摊开这个人的整篇传记。
    // 只在「附近真的有修士」时才出现（`strongest` 为空时按钮会点出一片空白）。
    const bioBtn = strongest
      ? '<button class="btn" id="inkInspectBio" style="width:calc(100% - 20px);margin:8px 10px 10px">查看他的一生</button>'
      : '';
    panel.innerHTML = `<div class="inspect-head">格 (${x}, ${y})<button class="ink-x" id="inkInspectClose">×</button></div>`
      // `@note` 是 `rows` 里唯一的**伪标签**，专门表示「说明行」：
      // 它不是一项读数，是给上一行做注解的整行小字。两列布局（span + b）
      // 装不下一句解释——长句会被 `.inspect` 的 `overflow: hidden` 裁掉。
      + rows.map(([k, v]) => (k === '@note'
        ? `<div class="inspect-note">${v}</div>`
        : `<div class="inspect-row"><span>${k}</span><b>${v}</b></div>`)).join('')
      + bioBtn;
    panel.classList.add('on');
    $('inkInspectClose').addEventListener('click', () => panel.classList.remove('on'));
    if (strongest) {
      $('inkInspectBio').addEventListener('click', () => this.showPersonCard(strongest.id));
    }
    this.selected = { x, y };
  }

  // ── 主循环 ──────────────────────────────────────────────
  frame(timestamp) {
    const now = timestamp / 1000;
    let dt = this.lastTime ? now - this.lastTime : 0;
    this.lastTime = now;
    if (dt > 0.12) dt = 0.12;

    this.fpsAccum += dt;
    this.fpsFrames += 1;
    if (this.fpsAccum >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    this.update(dt);
    this.render(now);
    requestAnimationFrame((ts) => this.frame(ts));
  }

  /**
   * 「视界现在开着吗」——裂缝时钟的唯一判据（契约 C1.1）。
   *
   * 判据是**两个条件同时成立**：
   *   · `this.selection` 非空（玩家划开了一片自由形状，那扇窗真的显示着）；
   *   · 当前工具是**视界工具**（`VIEW_TOOL_IDS`：`viewUpper` 或 `viewNether`）。
   *
   * ⚠️ 为什么两个都要：`selectTool` 切走工具时会清 `this.selection`（关闭路径①），
   * 但**读档 / 换世界**那条路径会直接把 `selection` 置空而工具不变；
   * 反过来，工具是视界工具但还没划开时 `selection` 是 null。
   * 只看一个都会在某个过渡帧上误判——而误判的后果是裂缝在「窗口没开」时
   * 偷偷推进（用户第 1 条要的正是「只在开启视界时有效」）。
   *
   * ⚠️ **「能看幽冥」不等于「放宽这条判据」**：两个视界工具都能开窗，
   * 所以判据从「只认 viewUpper」扩成「认 VIEW_TOOL_IDS 里任一个」；
   * 但 `selection` 那一半**一格都不许松**——退化成「有工具就算开着」会让
   * 裂缝在没开窗时照常推进，正是这条契约要防的事。
   *
   * 单独抽成方法而不是把条件内联进 `update`：①测试可以直接调它，
   * 不必去戳 `update` 那一大坨；②读代码时「裂缝什么时候走」一眼可查。
   *
   * @returns {boolean}
   */
  riftViewOpen() {
    return Boolean(this.selection) && VIEW_TOOL_IDS.includes(this.toolId);
  }

  /**
   * 当前视界该看的那一界。`viewUpper` → 上界，`viewNether` → 幽冥。
   *
   * 返回 `{ world, terrain, label, clearDirty }`：
   *   · `world` / `terrain` —— 贴图与画人与宗门用的那一界；
   *   · `label` —— 玩家可见文案里的界名（「上界」/「幽冥」）；
   *   · `clearDirty` —— 把这一界的「需要重绘」标记清掉（与 `upperDirty` /
   *     `netherDirty` 一一对应，避免在 `drawPlaneView` 里再判一次工具）。
   *
   * ⚠️ 这是「按当前工具分流到哪一界」的**唯一**落点。散着写
   *    `toolId === 'viewNether' ? ... : ...` 会让加第三界变成改 N 处、漏一处，
   *    而漏掉那处**不报错**（视界照常开，只是贴着另一界的地形）。
   */
  viewPlane() {
    const nether = this.toolId === 'viewNether';
    return {
      world: nether ? this.nether : this.upper,
      terrain: nether ? this.netherTerrain : this.upperTerrain,
      label: nether ? '幽冥' : '上界',
      clearDirty: () => { if (nether) this.netherDirty = false; else this.upperDirty = false; },
    };
  }

  /**
   * 推进世界 `days` 个游戏日 —— **真实游戏与全部测试脚本共用的唯一入口**。
   *
   * 时钟列表（life / upper / nether / rift / eco / fire）与各自的节拍，全部
   * 定义在 `sim/advance.js` 的 `ADVANCE_PERIODS`——**本文件不自己抄一遍**。
   * 这是 BACKLOG #13 的修法：此前 main.js 与各测试脚本各抄一份时钟列表，
   * 2026-09-23 新增 `stepNether` 时测试侧漏了，于是长测与 playtest 里幽冥四步
   * （对账 / 到期 / 积怨 / 逐出）一次都不跑、实体只增不减——那些读数因此
   * **不代表真实游戏**（60 年印 186 只，而同世界 `soulLog.linger` 只有 60）。
   *
   * ⚠️ **测试请调这个方法，别自己写 `w.day += 30; life.step(30)`**。
   *    那正是这个 bug 的成因：手抄的时钟列表迟早会漏掉新加的那一个。
   *    本方法把「跑时钟 + 置 dirty 位」两件事绑在一起，测试调它得到的
   *    就是**真实游戏的那条路**。
   *
   * @param {number} days 游戏日数。`≤ 0`（或 NaN）直接返回 `null`。
   * @param {object} [opts] 逃生口，**目前没有任何调用方用它**。存在的理由：
   *   有些测试需要保住既有的世界线（eco/fire 是唯一抽签的两套，跑起来会改植被与
   *   肥力、反馈回凡间）——那时传 `{ rng: null }` 显式关掉它们，比「再抄一份
   *   时钟列表」好。**真实游戏永远不传**。若将来确实没人用，可以删掉。
   * @returns {object|null} `{ upper, nether, rift, wraith, eco, fire }`，各时钟这一拍跑没跑。
   */
  advanceDays(days, opts) {
    const world = this.world;
    if (!world || !(days > 0)) return null;
    // ⚠️ `riftActive` 传 `this.riftViewOpen()`（契约 C1.1：视界关着就冻结）。
    // ⚠️ `rng` 默认 `this.rng`——**不是** `this.life.rng`（那是凡间主随机流，铁律一）。
    const rng = opts && 'rng' in opts ? opts.rng : this.rng;
    const fired = advanceWorld(world, days, {
      life: this.life,
      upperLife: this.upperLife,
      rng,
      state: this.advanceState,
      riftActive: this.riftViewOpen(),
    });
    if (fired) {
      if (fired.upper) this.upperDirty = true;
      if (fired.nether) this.netherDirty = true;   // 实体动了要重画（与 upperDirty 同构）
      // ⚠️ 裂缝**不置** `this.dirty`：`dirty` 管的是**地形位图**要不要重画，
      //    而裂缝画在每帧重绘的叠加层上（`drawRifts`，与 `drawEntities` 同层）。
      //    置了只会让整张地形位图每 30 天白重算一次，纯浪费。
      // ⚠️ 凡间鬼影（`fired.wraith`）同理**不置** `dirty`：它们画在每帧重绘的
      //    叠加层上（`drawWraiths`，与 `drawEntities` 同层），地形位图不受影响。
      if (fired.eco || fired.fire) this.dirty = true;
    }
    return fired;
  }

  update(dt) {
    const world = this.world;
    if (!world) return;
    const speed = TIME.speeds[this.speedIndex].mult;
    const paused = this.speedIndex === 0;
    const days = TIME.baseDaysPerSecond * speed * dt;
    if (days > 0) {
      // ── 世界推进：**全部游戏日驱动的时钟**都在 `advanceDays()` 里 ────
      // ⚠️ 原先散在这里的四段注释（上界 / 幽冥 / 裂缝 / 植被野火）**已随逻辑
      //    搬进 `sim/advance.js`**。要读「为什么周期是 30」「为什么关窗时既不
      //    累加也不清零」「为什么裂缝不置 dirty」，去那边看——
      //    **别在这里重新长出一份副本**，那正是 BACKLOG #13 的成因。
      this.advanceDays(days);
    }

    // 水文按真实时间推进：无论时间倍速多快，地貌演化都保持稳定步长。
    // 但「暂停」必须真的暂停——否则玩家按下暂停后地形仍在悄悄侵蚀，
    // 而且此时任何落笔都会被水流抹掉，撤销也对不上。
    // 注意是「不累积」而不是「累积了不执行」，免得解除暂停时补跑一大串步。
    if (!paused) {
      this.hydroAccum += dt;
      let hydroSteps = 0;
      while (this.hydroAccum >= 0.16 && hydroSteps < 3) {
        this.hydroAccum -= 0.16;
        hydroSteps += 1;
        stepHydrology(world, 4, null);
        this.dirty = true;
      }

      this.decayAccum += dt;
      if (this.decayAccum >= 2.5) {
        decayOverlay(world, this.decayAccum + 2.5 * 360, this.rng);
        flushDirty(world);
        this.decayAccum = 0;
        this.dirty = true;
      }
    }

    if (this.pointer.painting && this.tool.mode === 'drag' && this.pointer.inside) {
      // 按住不放时笔刷持续生效（像真的在浇灌），但要限速——
      // 否则 60 FPS 下每秒落笔 60 次，山会瞬间窜到天上。
      this.brushTimer -= dt;
      if (this.brushTimer <= 0) {
        this.brushTimer = 0.075;
        this.applyTool(false);
      }
    }

    this.autoSaveAccum += dt;
    if (this.autoSaveAccum >= 90) {
      this.autoSaveAccum = 0;
      // ⚠️ 这里**不能 await**：这段代码在帧循环里。长卷实测 encodeSave 74 ms，
      // 按 60 FPS 算是掉 4~5 帧——每次自动存档画面都卡一下，而玩家不知道是为什么。
      // 所以甩出去不管，护栏与失败上报都在 autoSave() 里。
      void this.autoSave();
    }

    this.uiAccum += dt;
    if (this.uiAccum >= 0.25) {
      this.uiAccum = 0;
      this.updateHud();
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.notify(this.defaultHint(), 1e9);
    }
  }

  defaultHint() {
    const tool = this.tool;
    return `${tool.name}：${tool.hint} · 左键落笔 / 右键平移 / 滚轮缩放`;
  }

  render(now) {
    const world = this.world;
    if (!world) return;
    const ctx = this.ctx;
    const { width, height } = this.canvasSize();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // 纸底
    ctx.fillStyle = INK.paperDeep;
    ctx.fillRect(0, 0, width, height);

    if (this.terrain.needsRender(now, this.dirty)) {
      this.terrain.render(now, true);
      this.dirty = false;
    }

    const zoom = this.camera.zoom;
    const originX = this.camera.toScreenX(0);
    const originY = this.camera.toScreenY(-this.terrain.pad);
    ctx.drawImage(
      this.terrain.canvas,
      0, 0, this.terrain.canvas.width, this.terrain.canvas.height,
      originX, originY,
      this.terrain.canvas.width * zoom, this.terrain.canvas.height * zoom,
    );

    this.units.drawTerritory(ctx, this.camera, world, this.terrain.pad);
    this.units.drawLeylines(ctx, this.camera, world, now);
    // ── 空间裂缝（阶段三 · 块四）──────────────────────────
    // 画在**地形/地脉之上、人造物之下**：裂缝是「地上的裂口」（地表级），
    // 而建筑 / 宗门 / 地点 / 实体都是**立在地上**的东西，理应盖在裂口之上。
    // 这样也保证实体在最上层——玩家仍能看见「谁站在缝边上 / 谁正被吸走」；
    // 若把缝盖在人之上，人会看起来凭空消失，正好与「凡人被吸走后失踪」混淆。
    // 位置由代理 B 在 `render/unitsLayer.js` 的 `drawRifts` 注释里一并给出
    // （`main.js:1159` 之后、`drawStructures` 之前）。
    // ⚠️ 真实签名是 `drawRifts(ctx, camera, world, time)`（**不是我原先假设的
    //    `(ctx, world, cam, now)`**——参数顺序不同，按 B 的来）。
    // ⚠️ 与 `drawRiftBorder` 是两回事：那个画的是**视界窗口**的四条边（UI 提示），
    //    这个画的是地图上**真实存在**的裂缝实体。
    this.units.drawRifts(ctx, this.camera, world, now);
    if (this.showGrid) this.units.drawGrid(ctx, this.camera, world);
    this.units.drawStructures(ctx, this.camera, world);
    this.units.drawSects(ctx, this.camera, world);
    this.units.drawSites(ctx, this.camera, world, now);
    this.units.drawEntities(ctx, this.camera, world, now);
    // 凡间鬼影（D6-3 工程包 B）。**必须单独调**：这批实体不在 `world.entities`
    // 里（理由见 `sim/wraiths.js` 头注释），`drawEntities` 一行都画不到它们。
    // 画在凡人**之后**：鬼浮在人上面（半透明），视觉上像「从人身里透出来」。
    // ⚠️ 这是**加法**——不要删掉上面那次 `drawEntities`，也不要合并两者。
    this.units.drawWraiths(ctx, this.camera, world, now);
    this.units.drawFireGlow(ctx, this.camera, world, now);
    this.units.drawLabels(ctx, this.camera, world);

    if (this.selected) this.units.drawSelection(ctx, this.camera, world, this.selected.x, this.selected.y);

    // 划选模式不画圆形笔刷——那会让玩家以为选出来的是圆的（划选是自由形状）。
    if (this.pointer.inside && this.tool.mode !== 'select') {
      const tool = this.tool;
      if (!tool.readonly && tool.mode === 'drag') {
        this.units.drawBrush(ctx, this.camera, world, this.hoverTile.x, this.hoverTile.y, this.brushRadius, TOOL_CURSOR[this.toolId]);
      } else if (!tool.readonly) {
        this.units.drawBrush(ctx, this.camera, world, this.hoverTile.x, this.hoverTile.y, Math.max(2, this.brushRadius * 0.5), TOOL_CURSOR[this.toolId]);
      } else {
        this.units.drawSelection(ctx, this.camera, world, this.hoverTile.x, this.hoverTile.y);
      }
    }

    // 画外压边：做成卷轴装裱的样子——四周压一圈暗角，再落两道墨线。
    // 这一步把「一张地图」变成「一幅裱好的画」。
    const cx = width / 2;
    const cy = height / 2;
    const vignette = ctx.createRadialGradient(
      cx, cy, Math.min(width, height) * 0.42,
      cx, cy, Math.max(width, height) * 0.78,
    );
    vignette.addColorStop(0, 'rgba(34,32,28,0)');
    vignette.addColorStop(1, 'rgba(34,32,28,0.20)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(34,32,28,0.42)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    ctx.strokeStyle = 'rgba(34,32,28,0.16)';
    ctx.strokeRect(4.5, 4.5, width - 9, height - 9);

    // ── 视界（画中画）──────────────────────────────────────
    // 放在**最后**有两个理由：① 要盖住凡间的实体/聚落——规格 §3.3 说得很硬：
    // 「窗里只有另一界的东西」，凡间的人与村子漏进视界就是「串味」；
    // ② 裂缝边框要在所有叠层之上。也正因为它压在最上面，视界不会被暗角压暗——
    // 「另一界的一扇窗」本来就该比周围亮一点。
    // 看哪一界由 `viewPlane()` 按当前工具（viewUpper / viewNether）决定。
    if (this.selection) this.drawPlaneView(ctx, now, this.viewPlane());
    // 拖拽中的框只有虚线（还没成型），画在已开的视界之上，免得被盖住看不见。
    if (this.selectPath) this.drawSelectHint(ctx, this.selectPath);
  }

  /**
   * 画中画：在划选区域里贴出**另一界**（上界 / 幽冥）的对应区域（规格 §3.4 的 C2 方案）。
   *
   * 做法是「全量渲染到那一界自己的离屏 canvas，再裁剪贴出」——**不改 terrainLayer.js**。
   * 两个 canvas 同尺寸、同 pad、同 reliefScale，所以凡间 (x,y) 与那一界 (x,y)
   * 是同一个坐标；视界里贴的必须正是**同一块坐标区域**，这是下一阶段
   * 「裂缝漏物落在同一个位置」的依据（规格 §3.4 第 3 条）。
   *
   * `plane` 由 `viewPlane()` 给出（`{ world, terrain, label, clearDirty }`）——
   * 上界与幽冥共用**同一段**裁剪 / 贴图 / 边框逻辑，唯一的分流就是「贴哪张地形、
   * 画哪一界的人与宗门」。
   *
   * ⚠️ **口径更新（2026-09-23）**：这里原先写着「幽冥没有实体（`nether.entities`
   *    为空），那两行 draw* 自然是空转」。**那句话现在过期了**——8-C/8-D 已落地，
   *    `enterNether` 会在幽冥生成鬼魂与鬼修（`sim/netherLife.js`），
   *    所以 `drawSects` / `drawEntities` 在幽冥这一支是**真的在画东西**。
   *    `netherDirty` 由 `stepNether` 置位（见 `update()`），与上界同构。
   *    ⇒ 别再把它当「空转的占位行」删掉或跳过。
   *
   * ⚠️ 裁剪用的是**屏幕多边形路径 + `ctx.clip()`**（自由形状划选），**不是**
   *    `drawImage` 的 `sourceRect`。原因：立体视图下每一格的落笔行是
   *    `y + pad - round(高程 × reliefScale)`，**行号随各自的高程变**，所以
   *    「一块坐标区域」在 canvas 里并不是一块规整的矩形——sourceRect 在立体
   *    视图下会取错一块。clip 则总是裁出屏幕上那片形状。
   *    代价：clip 之下仍要 blit 整张 canvas（GPU 侧）；CPU 侧那次全量重绘
   *    已由 UPPER_RENDER_PERIOD 摊薄。
   */
  drawPlaneView(ctx, now, plane) {
    const sel = this.selection;
    const terrain = plane && plane.terrain;
    const viewWorld = plane && plane.world;
    if (!sel || !terrain || !viewWorld) return;
    const cam = this.camera;

    // 另一界地形低频重绘：全量 render 很贵，而它变化极慢（不跑水文/生态）。
    // ⚠️ `upperDirty` / `netherDirty` 这一轮**刻意不作为重绘的触发条件**
    //    （它们只被置位、不被读）：
    //    高倍速下每 0.167 秒就跨一次「10 游戏日」边界（baseDaysPerSecond 3 ×
    //    最高 20 倍 = 60 日/秒），若让脏标记绕过节流，就等于每帧全量重绘那一界，
    //    成本直接翻倍——而那正是这条节流要防的事。
    //    它们是给**下一阶段**留的：那时 `upperLife.step` 会改上界实体/宗门，
    //    「内容变了」才需要一次立刻重绘；届时也要守住 UPPER_RENDER_PERIOD 这个上限。
    // ⚠️ 两个图层**各自**有 `lastRender`，所以上界与幽冥各按各的节拍重绘，
    //    互相不会把对方的节流打乱。
    if (now - terrain.lastRender > UPPER_RENDER_PERIOD) {
      terrain.render(now, true);
      plane.clearDirty();
    }

    const zoom = cam.zoom;
    const originX = cam.toScreenX(0);
    const originY = cam.toScreenY(-terrain.pad);
    // 选区的屏幕**包围盒**：用「零抬升」的映射（canvas 行 = y + pad）。
    // 平面视图下这**严格**对位；立体视图下窗口边界落在零抬升基线上，
    // 窗内仍是那一界的地形（只是边界与那一界自身的抬升不完全贴合，见方法注释）。
    // ⚠️ 路径顶点也走**同一个** `toScreenX/Y` 映射（见下面的 clip），
    //    绝不另引入高程偏移——否则形状会相对那一界地形整体错位。
    const sx0 = cam.toScreenX(sel.x0);
    const sy0 = cam.toScreenY(sel.y0);
    const sw = cam.toScreenX(sel.x1 + 1) - sx0;
    const sh = cam.toScreenY(sel.y1 + 1) - sy0;
    if (sw <= 0 || sh <= 0) return;

    ctx.save();
    ctx.beginPath();
    // 自由形状：按 `path` 走线裁窗。`path` 不存在时退回矩形（防御性——
    // 老形状 / 注入的旧对象不该把这一帧炸掉）。
    if (sel.path && sel.path.length >= 3) {
      ctx.moveTo(cam.toScreenX(sel.path[0][0]), cam.toScreenY(sel.path[0][1]));
      for (let i = 1; i < sel.path.length; i += 1) {
        ctx.lineTo(cam.toScreenX(sel.path[i][0]), cam.toScreenY(sel.path[i][1]));
      }
      ctx.closePath();
    } else {
      ctx.rect(sx0, sy0, sw, sh);
    }
    ctx.clip();
    ctx.drawImage(
      terrain.canvas,
      0, 0, terrain.canvas.width, terrain.canvas.height,
      originX, originY,
      terrain.canvas.width * zoom, terrain.canvas.height * zoom,
    );
    // ── 那一界的人与宗门（2026-09-23 接线）──────────────────────────────
    // 在这之前窗里**只有地形**：上界明明在跑（`:1525` 的 `upperLife.step`）、
    // 有实体、有宗门（`upper.entities` / `upper.factions`），玩家却一个都看不见
    // ——「系统在跑、但没人看得见」正是 D4 要治的病，只是这次犯在上界。
    //
    // 复用**同一个** `UnitsLayer`：它的 draw* 全部以 `world` 为参数
    // （`render/unitsLayer.js:480 drawSects` / `:557 drawEntities`），
    // 构造函数里没有任何绑定凡间的实例状态，所以把 `world` 换成 `plane.world`
    // 即可，**不需要新渲染器、不需要新图层类**。
    // ⚠️ **口径更新（2026-09-23，8-C/8-D 已落地）**：这条注释原先写着「幽冥这一侧
    //    `entities` / `factions` 都是空数组，所以这两行对幽冥是**空转**」——**已过期**。
    //    现在 `nether.entities` 里**真的有鬼魂与鬼修**（`enterNether` 生成，
    //    见 `sim/netherLife.js`），所以 `drawEntities` 在幽冥这一支**真的在画东西**。
    //    `factions` 仍恒空（`worldgenNether` 不填，`World` 构造函数给 `[]`）⇒
    //    `drawSects` 对幽冥仍是空转，但它与 `drawEntities` 共用同一次调用，留着无害。
    //
    // ⚠️ 这里**刻意不调** `drawTerritory`：它的离屏画布是**单槽缓存**、
    //    缓存键含 `world.seed`（`unitsLayer.js:240-242`）。凡间主图每帧调一次、
    //    窗里再按另一界调一次 ⇒ 两边的键每帧互相覆盖 ⇒ **每帧重烘 5 万格两遍**。
    //    地盘若要进窗，得先给另一界第二个槽位（已记 BACKLOG）。
    //
    // ⚠️ 实体是**直接画到主 ctx** 的，不受 `UPPER_RENDER_PERIOD` 节流影响
    //    （那个节流只管上面那张地形位图）。所以那一界的人一动，窗里当帧就动
    //    ——**不需要 `upperDirty` 参与**，上面 `upperDirty` 那段注释说的
    //    「下一阶段」正是这里。
    // ── 凡间的裂缝（2026-09-23 补）────────────────────────────────
    // 裂缝**开在划选区域的边界格上**（`sim/rifts.js:465-477` 的候选格就是边界格），
    // 而本窗口把整个选区裁住 ⇒ 主渲染链里那次 `drawRifts`（`:1755`）画的缝，
    // **落在窗内那一半被窗口盖掉**，玩家只看得见框外半圈。
    // 用户点名要的「划选区域**边缘**会产生不稳定的裂隙」，这个反馈因此只兑现了一半。
    //
    // 修法是**加法**，不是改顺序：在窗内再画一次凡间的缝。
    // 窗外那半仍由主链那次负责，**两次合起来才是一道完整的缝**
    // ⇒ **不要删掉主链那次调用、也不要移动它**（移了会连带动到标签/光晕的叠层次序）。
    //
    // 传 **`this.world`（凡间）**而不是 `viewWorld`：缝是凡间与另一界的接缝，
    // 本来就长在凡间。放在地形之上、人之下，视觉上像「缝从地底裂出来」。
    this.units.drawRifts(ctx, cam, this.world, now);
    this.units.drawSects(ctx, cam, viewWorld);
    this.units.drawEntities(ctx, cam, viewWorld, now);
    ctx.restore();

    this.drawRiftBorder(ctx, sel, now);
  }

  /**
   * 视界边缘的「裂缝」：沿划选形状一圈**断续的墨线 + 微光**，不是实线。
   *
   * 它既是 UI 提示（这里开着一扇窗），也是裂缝的空间位置提示——
   * 裂缝就开在这条边缘的**连线**上（规格 §4.1；矩形时代是「四条边」，
   * 现在是自由形状的闭合折线）。刻意不画实线：实线看着像选择框，断续才像缝。
   *
   * 取屏幕坐标走的是与 `drawPlaneView` **同一个**零抬升映射，否则边框会与
   * 窗口边界错位。`sel.path` 缺失时退回矩形四角（防御性）。
   */
  drawRiftBorder(ctx, sel, now) {
    if (!sel) return;
    const cam = this.camera;
    let pts;
    if (sel.path && sel.path.length >= 3) {
      pts = sel.path.map((p) => [cam.toScreenX(p[0]), cam.toScreenY(p[1])]);
    } else {
      const x0 = cam.toScreenX(sel.x0);
      const y0 = cam.toScreenY(sel.y0);
      const x1 = cam.toScreenX(sel.x1 + 1);
      const y1 = cam.toScreenY(sel.y1 + 1);
      pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    }
    // 太小的窗不画边框（与旧版 `w <= 2 || h <= 2` 等价，按包围盒量）
    let minX = pts[0][0];
    let maxX = minX;
    let minY = pts[0][1];
    let maxY = minY;
    for (let i = 1; i < pts.length; i += 1) {
      if (pts[i][0] < minX) minX = pts[i][0];
      if (pts[i][0] > maxX) maxX = pts[i][0];
      if (pts[i][1] < minY) minY = pts[i][1];
      if (pts[i][1] > maxY) maxY = pts[i][1];
    }
    if (maxX - minX <= 2 || maxY - minY <= 2) return;
    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    };
    ctx.save();
    // 微光：一条略粗的冷色描边垫在底下。**刻意不用 shadowBlur**——
    // 那个在每帧都画的路径上出了名的贵，而这里只画一圈折线，粗线就够。
    const glow = 0.30 + 0.22 * Math.sin(now * 1.7);
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(122, 186, 196, ${glow.toFixed(3)})`;
    trace();
    ctx.stroke();
    // 断续墨线：断口缓慢流动，看着像「缝在动」，而不是像选择框
    ctx.lineWidth = 1.2;
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -now * 9;
    ctx.strokeStyle = 'rgba(34, 32, 28, 0.86)';
    trace();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * 拖拽中的划选路径：一条闭合的虚线预览（**还没成型**，所以没有微光/裂缝，
   * 免得与已开的视界混淆）。首尾自动连上，让玩家边划边看到形状。
   */
  drawSelectHint(ctx, path) {
    if (!Array.isArray(path) || path.length < 2) return;
    const cam = this.camera;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(74, 122, 138, 0.9)';
    ctx.beginPath();
    ctx.moveTo(cam.toScreenX(path[0][0]), cam.toScreenY(path[0][1]));
    for (let i = 1; i < path.length; i += 1) {
      ctx.lineTo(cam.toScreenX(path[i][0]), cam.toScreenY(path[i][1]));
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  canvasSize() {
    return {
      width: this.canvas.width / this.dpr,
      height: this.canvas.height / this.dpr,
    };
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(240, Math.floor(rect.height));
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.camera.setViewport(width, height);
    if (this.world) {
      this.camera.bind(this.world);
      this.camera.clamp();
    }
    this.dirty = true;
  }

  updateHud() {
    const world = this.world;
    if (!world) return;
    const stats = world.stats();
    const day = Math.floor(world.day);
    const year = Math.floor(day / TIME.daysPerYear) + 1;
    const dayOfYear = (day % TIME.daysPerYear) + 1;

    $('inkTimePill').textContent = `仙历 ${year} 年 · 第 ${dayOfYear} 日`;
    $('inkSpeedPill').textContent = `${TIME.speeds[this.speedIndex].label}速 ×${TIME.speeds[this.speedIndex].mult}`;
    $('inkFpsPill').textContent = `${this.fps.toFixed(0)} FPS`;
    $('inkStatPeople').textContent = String(stats.entities);
    // 凡间鬼影（D6-3 工程包 B）：**此刻**在凡间飘荡的鬼（自幽冥缝爬出来的）。
    // ⚠️ 口径只有 `wraithStats` 一份（`sim/wraiths.js`）——不在这里自己 filter
    //    `world.wraiths`（那是第二份真相，同幽冥那行 `netherGhostStats` 的理由）。
    // ⚠️ 与「生灵」**分开报**：鬼影不在 `world.entities` 里，`stats.entities`
    //    数不到它们；合成一格会让玩家以为「生灵 513」里包含鬼。
    $('inkStatWraiths').textContent = String(wraithStats(world).alive);
    $('inkStatVillages').textContent = String(stats.villages);
    $('inkStatFactions').textContent = String(stats.factions);
    $('inkStatLand').textContent = `${((stats.land / world.size) * 100).toFixed(0)}%`;
    $('inkStatPeak').textContent = stats.peak.toFixed(2);

    const factionList = $('inkFactionList');
    factionList.innerHTML = '';
    const sorted = world.factions.slice().sort((a, b) => b.pop - a.pop).slice(0, 8);
    sorted.forEach((f) => {
      const row = document.createElement('div');
      row.className = 'faction';
      row.innerHTML = `<i style="background:${f.color}"></i><span>${f.name}</span>`
        + `<b>${f.pop}</b><em>${f.followers || f.pop} 人 · ${f.villages.length} 村</em>`
        + (f.war.size ? '<u>战</u>' : '');
      row.addEventListener('click', () => {
        this.camera.x = f.capitalX;
        this.camera.y = f.capitalY;
        this.camera.zoom = Math.max(this.camera.zoom, 7);
        this.camera.clamp();
        this.dirty = true;
      });
      factionList.appendChild(row);
    });
    if (!sorted.length) {
      factionList.innerHTML = '<div class="ink-empty">尚无聚落。用「生灵」撒下凡人，他们会自己结庐成村。</div>';
    }

    // ── 仙道 ──
    const cs = world.cultivationStats();
    $('inkStatCultivators').textContent = String(cs.cultivators);
    $('inkStatMortals').textContent = String(cs.mortals);
    $('inkStatPeakCultivator').textContent = cs.peakName
      ? `${cs.peakName} · ${realmLabel(cs.highest)}`
      : '尚无修士';
    $('inkStatLeylines').textContent = String(world.leylines.length);
    $('inkStatSites').textContent = String(world.sites.length);
    $('inkStatAscended').textContent = String(world.ascended.length);
    // 法宝：显示「在手 + 地上」的总数，另加器灵数。
    // 只报总数看不出玩法活没活，所以器灵单独一个读数——
    // 器灵要「相伴 50 年」才出得来，它是「世界真的跑了很久」的直接证据。
    const as = artifactStats(world);
    const artifactEl = $('inkStatArtifacts');
    if (artifactEl) {
      artifactEl.textContent = as.live
        ? `${as.live}${as.spirits ? ` · 器灵 ${as.spirits}` : ''}`
        : '0';
    }
    // 世家：家数 · 最大世代。世家是这个世界里**唯一会断绝**的东西——
    // 宗门散了还会再立，村子荒了还能再开，而一族断了就是断了。
    // 所以「传到第几代」是它最值钱的读数，光报家数看不出这件事。
    const ks = clanStats(world);
    const clanEl = $('inkStatClans');
    if (clanEl) {
      clanEl.textContent = ks.clans
        ? `${ks.clans}${ks.maxGen ? ` · 第${ks.maxGen}代` : ''}`
        : '0';
    }
    // 大战：进行中 · 累计灭门。报这两个而不是「累计打了几场」——
    // 「正在打」是玩家能看见的当下，「灭了几家」是政治层唯一不可逆的结局。
    // 宗门散了还能再立、村子荒了还能再开、世家断了就是断了，
    // 而**战败覆灭**是宗门唯一的死法（见 sim/war.js）。
    const ws = warStats(world);
    const warEl = $('inkStatWars');
    if (warEl) {
      warEl.textContent = ws.ongoing
        ? `${ws.ongoing} 场`
        : (ws.destroyed ? `灭 ${ws.destroyed}` : '0');
    }

    // 境界分布：**按境界表逐档**渲染（并集表：凡间六阶 + 上界大乘，见 INKBOX §九.14）。
    // 凡间到不了大乘，所以这一档在凡间面板上恒为 0 —— 那不是 bug，是「合体大圆满
    // 即飞升」的可视化：玩家看得见梯子上面还有一档，而这一界的人上不去。
    // 相对最大值归一化——用绝对人口当分母的话，一个几千人的世界里各条都会缩成看不见的小点。
    const bars = $('inkRealmBars');
    let realmMax = 1;
    for (let i = 0; i < cs.byRealm.length; i += 1) realmMax = Math.max(realmMax, cs.byRealm[i]);
    let barsHtml = '';
    for (let i = 0; i < REALMS.length; i += 1) {
      const n = cs.byRealm[i] || 0;
      const pct = n ? Math.max(3, (n / realmMax) * 100) : 0;
      barsHtml += `<div class="dao-realm"><span>${REALMS[i].name}</span>`
        + `<i style="width:${pct}%;background:${REALM_BAR[i]}"></i><b>${n}</b></div>`;
    }
    bars.innerHTML = barsHtml;
  }

  refreshChronicle() {
    const list = $('inkChronicle');
    if (!list || !this.world) return;
    const items = this.world.chronicle.slice(-40).reverse();
    list.innerHTML = items.length
      ? items.map((c) => {
        // 卜算子的话单独标一下，免得读者分不清哪句是旁白、哪句是史实
        const cls = c.kind === 'busanzi' ? 'ink-log is-busanzi' : 'ink-log';
        const who = c.kind === 'busanzi' ? '卜算子' : `${Math.floor(c.day / 360) + 1} 年`;
        return `<div class="${cls}"><b>${who}</b>${c.text}</div>`;
      }).join('')
      : '<div class="ink-empty">世界还很安静。</div>';
  }

  // ── 大事记（World.milestones，见 world/World.js 的 milestone()）──────
  /**
   * 世界大事面板。
   *
   * 与 `refreshChronicle` 的分工：编年是「什么都记」的 400 条滚动窗口，
   * 快进几十年之后满屏都是「某村归入某宗门」；大事记只记玩家真会回头看的
   * 那几件（大境界突破 / 飞升 / 开宗 / 覆灭 / 分裂 / 大战 / 夺舍 / 开缝 /
   * 金丹以上陨落），窗口长得多（MILESTONE_CAP = 600）。
   *
   * 刷新节奏与编年史一致（挂 2.5 秒那个定时器，不在 rAF 里）——
   * 每帧把 600 条重排一遍是白烧 CPU。
   */
  refreshMilestones() {
    const box = $('inkMilestones');
    const world = this.world;
    if (!box || !world) return;
    const all = Array.isArray(world.milestones) ? world.milestones : [];
    const items = all.slice(-MILESTONE_PANEL_LIMIT).reverse();
    const active = this.life?.events?.activeCrises || [];
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
    const milestoneRows = items.map((m) => {
        const year = Math.floor((m.day || 0) / 360) + 1;
        return `<div class="ink-log"><b>仙历 ${year} 年</b>${m.text}</div>`;
      });
    const rows = [...activeRows, ...milestoneRows];
    box.innerHTML = rows.length
      ? rows.join('')
      : '<div class="ink-empty">还没有值得记的大事。快进一些年，或者亲手去改一改这个世界。</div>';
  }

  // ── 值得关注的人物（见本文件顶部的 notablePeople）────────────────
  /**
   * 活人榜。点一行 = 「找到这个人」+「看见他在哪」+「他这一生做过什么」。
   *
   * 三条规则缺一不可（见 Batch 完成条件）：
   *   · Reachability：侧栏常驻，不用先找到他才点得开；
   *   · Feedback：每行都带「为什么是他」，不是一串没有由来的名字；
   *   · Stability：纯读派生，不写世界。
   */
  refreshNotables() {
    const box = $('inkNotables');
    const world = this.world;
    if (!box || !world) return;
    const rows = notablePeople(world);
    box.innerHTML = rows.length
      ? rows.map((r) => {
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
      }).join('')
      : '<div class="ink-empty">还没有觉醒的修士。用「生灵」撒下凡人，再快进几年。</div>';
    // 事件委托（同史册）：面板每 2.5 秒重建 innerHTML，
    // 逐行挂监听会被下一次刷新全部丢掉——而且不报错，只是点了没反应。
    if (!this.notablesBound) {
      box.addEventListener('click', (ev) => {
        const el = ev.target.closest('[data-live]');
        if (el) this.showPersonCard(Number(el.dataset.live));
      });
      this.notablesBound = true;
    }
    // 正在摊开的那个人死了 / 换世界了 → 收起面板，不留一张查不到的旧卡片
    if (this.personOpenId !== null && !findEntity(world, this.personOpenId)) {
      this.hidePersonCard();
    }
  }

  /** 点开一个**活人**：把 `compileBiography` 那一整篇摊出来 */
  showPersonCard(id) {
    const world = this.world;
    const entity = findEntity(world, id);
    const panel = $('inkPersonDetail');
    if (!entity || !panel) return;
    this.personOpenId = id;
    panel.innerHTML = `<div class="inspect-head">${displayName(entity)}的一生`
      + '<button class="ink-x" id="inkPersonClose">×</button></div>'
      + `<div class="necro-body">${renderBiographyHtml(compileBiography(world, entity))}</div>`
      + '<button class="btn" id="inkBtnPersonBio" style="width:calc(100% - 20px);margin:0 10px 10px">导出此人传记（Markdown）</button>';
    panel.classList.add('on');
    $('inkPersonClose').addEventListener('click', () => this.hidePersonCard());
    $('inkBtnPersonBio').addEventListener('click', () => {
      // 再编译一遍：正文是纯派生，不值得为它多存一份（存了就会与世界不同步）
      const now = findEntity(this.world, id);
      if (now) this.downloadText(biographyFileName(now), compileBiography(this.world, now));
    });
    // 「找到这个人」和「看见他在哪」是同一件事——所以顺带把镜头挪过去。
    // 挪镜头**不是**改世界状态（camera 是渲染层），所以不影响存读档等价。
    this.camera.x = entity.x;
    this.camera.y = entity.y;
    this.camera.zoom = Math.max(this.camera.zoom, 7);
    this.camera.clamp();
    this.dirty = true;
  }

  hidePersonCard() {
    const panel = $('inkPersonDetail');
    if (panel) panel.classList.remove('on');
    this.personOpenId = null;
  }

  // ── 三界（上界 / 幽冥，见 Batch 3）───────────────────────────
  /**
   * 三界面板。**不新增任何后台状态**——上界的 `entities`/`factions`/`villages`/
   * `milestones`/`arrivedLog`，幽冥的 `soulLog`/`souls`/`reincarnationStats`
   * 全都在跑（上界的 `stepCultivation` 甚至会写自己的大事记，只是没人画）。
   *
   * 它回答两个具体的问题，验收判据就是这两句：
   *   · 「我刚送上去的那个人后来怎么样了」→ 飞升名册 + **他现在的状态**
   *     （还在不在上界、什么境界、死了没有，见 `upperFateOf`）；
   *   · 「这个人死了之后去哪了」→ 魂路五路分布 + 魂池里还排着谁 + 谁已经回来。
   *     （**按人查**在史册那一行，见 `refreshNecrology` 里的 `soulRouteText`。）
   *
   * ⚠️ 刷新节奏与大事记一致（挂 2.5 秒那个定时器，**不在 rAF 里**）：纯读派生，
   *    不写世界、不抽 rng。把它挪进 `frame()` 才是「每帧重排几百条魂」。
   */
  refreshThreeRealms() {
    const world = this.world;
    if (!world) return;
    this.refreshUpperRealm(world);
    this.refreshNetherRealm(world);
  }

  /** 上界那一块：人口 / 飞升名册（带现状）/ 上界自己的大事 */
  refreshUpperRealm(world) {
    const upper = world.upper || this.upper;
    const meta = $('inkUpperMeta');
    const box = $('inkUpperLog');
    if (!upper) {
      if (meta) meta.textContent = '未生成';
      if (box) box.innerHTML = '<div class="ink-empty">这一局没有上界。</div>';
      return;
    }
    const pop = upper.popLog || {};
    if (meta) {
      // `arrived` 是**累计**从凡间到达的（`planes.arriveUpper` 记账），
      // 与 `upper.entities.length`（此刻活着几个）是两件事——两个都报，
      // 只报一个的话「上来过 1 个」与「此刻 13 个」谁都会读错。
      //
      // ── 生态账本（D6-2 工程包 E）──
      // 追加「生 / 亡」两项，与**幽冥那一行同款口径**：生 = 四种来源之和
      // （开天播种 + 从凡间到达 + 修士化生 + 凡人生育），亡 = 累计陨落。
      // ⚠️ 守恒式 `生灵 === 生 − 亡` 是**契约**（`upperEcoStats` 是这四项相加的
      //    唯一处，smoke 5x 直接断言）——三项摆在同行，账平不平一眼可见。
      // ⚠️ **追加**而不是改写：playtest 10e 用 `includes('生灵 N')` 等子串对账，
      //    改写会悄悄改掉那条断言的契约（规格明令：不新增区 / CSS 类，也不动锚点）。
      const eco = upperEcoStats(upper);
      meta.textContent = `生灵 ${upper.entities.length} · 宗门 ${upper.factions.length}`
        + ` · 飞升上来 ${pop.arrived || 0}`
        + ` · 生态 生 ${eco.born} · 亡 ${eco.died}`;
    }
    if (!box) return;
    const rows = [];
    const log = Array.isArray(upper.arrivedLog) ? upper.arrivedLog : [];
    for (const a of log.slice(-UPPER_ARRIVAL_LIMIT).reverse()) {
      rows.push(`<div class="ink-log"><b>仙历 ${Math.floor((a.day || 0) / 360) + 1} 年</b>`
        + `${a.name}（${realmOrMortal(a.level)}）`
        + `${a.via === 'rift' ? '被裂缝卷上界' : '飞升上界'}`
        + `${a.sect ? ` · 入「${a.sect}」` : ''}`
        + `<div class="necro-epitaph">${upperFateOf(upper, a)}</div></div>`);
    }
    const ms = Array.isArray(upper.milestones) ? upper.milestones : [];
    for (const m of ms.slice(-UPPER_MILESTONE_LIMIT).reverse()) {
      rows.push(`<div class="ink-log"><b>仙历 ${Math.floor((m.day || 0) / 360) + 1} 年</b>${m.text}</div>`);
    }
    box.innerHTML = rows.length ? rows.join('')
      : '<div class="ink-empty">上界还只有开天时的那十几个人。凡间有人飞升之后，这里会记下他。</div>';
  }

  /** 幽冥那一块：魂路五路分布 / 魂池里排着谁 / 谁已经带着前世回来 */
  refreshNetherRealm(world) {
    const meta = $('inkNetherMeta');
    const bars = $('inkSoulRoutes');
    const box = $('inkSoulPool');
    const st = reincarnationStats(world);
    const log = world.soulLog || {};
    let total = 0;
    for (const k of SOUL_ROUTE_ORDER) total += Number(log[k]) || 0;
    if (meta) {
      // `waiting` 是**此刻**池子里排队的（上限 SOUL_CAP = 120），
      // `total` 是**累计**判过路的魂——同「上界那两栏」的理由，两个都报。
      let line = `魂池 ${st.waiting} · 累计 ${total} · 已归来 ${st.reborn}`;
      // ── 幽冥实体读数（2026-09-23 补，契约 `reports/d5/BATCH2-DESIGN.md` §七）──
      // 上三栏是**凡间魂池**的账（累计判过路），这一栏才是**幽冥里此刻站着谁**
      // ——两者不是一回事：面板印「鬼修 45」曾让玩家开视界却一个都查不到
      // （BATCH-REPORT 那条 P1）。所以**扩展现有这一行**（BACKLOG P3 #3：
      // 右栏已 12 个区，加区前先考虑合并 ⇒ 不新增区、不加新 CSS 类）。
      //
      // ⚠️ `world.nether` 在老档 / 单世界路径下可能是 `undefined`：
      //    此时**退回原字符串**，不抛错（守卫风格照抄 `refreshUpperRealm`）。
      // ⚠️ 口径只有 `netherGhostStats` 一份（`sim/netherLife.js`）——
      //    不要在这里自己 `filter` 一遍 `nether.entities`，那是第二份真相。
      // ⚠️ 没有鬼修时「最高」印 `—` 而**不是**省略整段：忽有忽无的尾巴会让
      //    以文字为锚点的断言（playtest / smoke）随时变红。
      const nether = world.nether;
      if (nether) {
        const gs = netherGhostStats(nether);
        // 生态账本（D6-2 工程包 E）：与**上界那一行同款口径**（生 / 亡）。
        // ⚠️ 多一栏「逐」：幽冥有**两条**离开路径（消散 + 上限逐出），
        //    而上界只有一条（陨落）——守恒式是 `鬼魂 + 鬼修 === 生 − 亡 − 逐`。
        //    这是两个世界的规则差别，不是口径不统一。
        // ⚠️ D6-3 工程包 B 再加一栏「出」：**第三条离开路径**——自幽冥缝
        //    爬入凡间的鬼（`nether.popLog.climbedOut`）。守恒式因此变成
        //    `鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出`（`netherEcoStats.conserved`
        //    与 playtest 的断言同步改了）。**必须印**：不印的话玩家看到
        //    「鬼魂 3 但生 100 亡 20 逐 5」，账差 72 却查不出差在哪。
        const eco = netherEcoStats(nether);
        // ⚠️ D6-3 工程包 C 再加一栏「物」：幽冥**此刻躺着几件物品**（自生 + 跌入者
        //    带下来的，减去漏回凡间的）。它是 `netherItemStats().alive`——现算，
        //    不入档（铁律二）。**必须印**：玩家开幽冥视界时，这一栏是「幽冥里有没有
        //    东西」的唯一读数；不印的话「幽冥物品泄漏」这条通道对玩家不可见。
        // ⚠️ D6-3 工程包 D 再加一栏「夺」：**第四条离开路径**——低阶鬼修真夺舍
        //    凡间活人后**从幽冥消失**（`nether.popLog.possessedOut`）。守恒式因此
        //    变成 `鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺`（`netherEcoStats.conserved`
        //    与 playtest 10e 的算式同步改了）。**必须印**：不印的话玩家看到
        //    「鬼魂 3 但生 100 亡 20 逐 5 出 3」，账差 69 却查不出差在哪。
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
      bars.innerHTML = SOUL_ROUTE_ORDER.map((k) => {
        const n = Number(log[k]) || 0;
        const pct = n ? Math.max(3, (n / max) * 100) : 0;
        // ⚠️ 「零的那几路压淡」走 `data-zero` 而**不是**多拼一个类名：
        //    `_uiclass.mjs` 的类名抽取要求 class 属性里是字面量，
        //    一旦写成「类名 + 模板插值」（realm-soul 后面接一个条件类名），
        //    整段匹配就失败 ⇒ 那个类名对探针**完全不可见**，改名/删样式都不会红。
        //    走 data 属性后 class 属性是纯字面量，探针照得到。
        //    （探针这个盲点已记进 BACKLOG，本轮不动 RESEARCH 资产。）
        return `<div class="realm-soul" data-zero="${n ? '0' : '1'}">`
          + `<span>${ROUTE_LABEL[k] || k}</span>`
          + `<i style="width:${pct}%;background:${SOUL_ROUTE_COLOR[k] || '#7d776b'}"></i>`
          + `<b>${n}</b></div>`;
      }).join('');
    }
    if (!box) return;
    const rows = [];
    // ① 池子里还排着谁。⚠️ 池子**只装 natural / linger 两路**——后三路
    //    （鬼修 / 怨魂化 / 魂火散尽）不入轮回，只在上面那五根条里计数。
    //    所以「某人不在池子里」并不等于「他没留下魂」，这行小字得说清楚。
    const pool = world.souls.slice().sort((a, b) => a.dueDay - b.dueDay).slice(0, SOUL_POOL_LIMIT);
    for (const s of pool) {
      const left = Math.max(0, Math.ceil((s.dueDay - world.day) / 360));
      rows.push(`<div class="ink-log"><b>${left > 0 ? `${left} 年后` : '待投胎'}</b>`
        + `${s.ofName}（${realmOrMortal(s.ofLevel)}）`
        + ` · ${ROUTE_LABEL[s.route] || s.route}`
        + ` · 第 ${(s.incarnation || 1) + 1} 世`
        + `${s.ofSectName ? ` · 前世在「${s.ofSectName}」` : ''}</div>`);
    }
    // ② 已经带着前世回来的人
    const back = [];
    for (const e of world.entities) {
      if (e && e.pastLife) back.push(e);
    }
    for (const e of back.slice(-SOUL_BACK_LIMIT).reverse()) {
      rows.push(`<div class="ink-log"><b>${e.name}</b>（${realmOrMortal(e.level)}）`
        + ` ← 前世 ${e.pastLife.name}（${e.pastLife.realm || realmOrMortal(e.pastLife.level)}）`
        + `<div class="necro-epitaph">${PAST_LIFE_CHOICE[e.pastLife.choice] || '记忆尚未觉醒'}`
        + `${e.pastLife.conflict ? ' · 两世相争' : ''}</div></div>`);
    }
    box.innerHTML = rows.length ? rows.join('')
      : '<div class="ink-empty">魂池还是空的。这个世界的人死得还不够多——快进一些年。</div>';
  }

  // ── 史册（逝者名录，见 sim/necrology.js）─────────────────
  /**
   * 史册列表。
   *
   * ⚠️ 刷新节奏：它挂在 `setInterval(..., 2500)` 上，**不在 rAF 主循环里**。
   * 「把 800 条排一遍再取前 30 条」这点开销每 2.5 秒付一次完全付得起；
   * 但绝不要把它挪进 `frame()`——那才是「每帧重算 800 条」。
   *
   * 列表只渲染前 `NECRO_PANEL_LIMIT` 条：全 800 条塞进 DOM 没有意义，
   * 只会让侧栏滚不动。要看全的用下面的导出。
   */
  refreshNecrology() {
    const box = $('inkNecrology');
    const world = this.world;
    if (!box || !world) return;
    const rows = necrologyList(world, { sort: this.necroSort, limit: NECRO_PANEL_LIMIT });
    const st = necrologyStats(world);
    const count = $('inkNecroCount');
    if (count) count.textContent = `${st.count} / 累计 ${st.total}`;
    box.innerHTML = rows.length
      ? rows.map((r) => {
        const year = Math.floor((r.died || 0) / 360);
        const tags = [realmOrMortal(r.level)];
        if (r.sectName) tags.push(r.sectName);
        const who = r.fate === 'ascended' ? '飞升' : r.cause;
        // 「这个人死了之后去哪了」就在这一行上回答（Batch 3 加的 `soulRoute` 列）。
        // 不印出来的话，玩家只能靠「五路总数 + 魂池名单」去反推，
        // 而那两条都查不到**具体某个人**——他可能压根没进池子（后三路）。
        const fate = soulRouteText(r);
        return `<div class="ink-log necro-row" data-dead="${r.id}">`
          + `<b>仙历 ${year} 年</b>${r.name}（${tags.join(' · ')}）· ${who}`
          + (fate ? ` · ${fate}` : '')
          + (r.epitaph ? `<div class="necro-epitaph">「${r.epitaph}」</div>` : '')
          + '</div>';
      }).join('')
      : '<div class="ink-empty">名录尚空——这个世界还没有人离世。</div>';
    // 点开某一条：用**事件委托**。面板每 2.5 秒重建一次 innerHTML，
    // 逐条挂监听会被下一次刷新全部丢掉（而且不会报错，只是点了没反应）。
    if (!this.necroBound) {
      box.addEventListener('click', (ev) => {
        const el = ev.target.closest('[data-dead]');
        if (el) this.showDeadBiography(Number(el.dataset.dead));
      });
      this.necroBound = true;
    }
    // 正在摊开的那条被淘汰了 / 换世界了 → 收起面板，不留一条查不到的旧闻
    if (this.necroOpenId !== null && !findDead(world, this.necroOpenId)) {
      this.hideDeadBiography();
    }
  }

  setNecroSort(sort) {
    this.necroSort = sort === 'importance' ? 'importance' : 'recent';
    const recent = $('inkBtnNecroRecent');
    const imp = $('inkBtnNecroImportance');
    if (recent) recent.classList.toggle('on', this.necroSort === 'recent');
    if (imp) imp.classList.toggle('on', this.necroSort === 'importance');
    this.refreshNecrology();
  }

  /** 点开一条名录：把那个人的完整传记正文摊出来 */
  showDeadBiography(id) {
    const record = findDead(this.world, id);
    const panel = $('inkNecroDetail');
    if (!record || !panel) return;
    this.necroOpenId = id;
    const md = compileDeadBiography(this.world, record);
    panel.innerHTML = `<div class="inspect-head">${record.name}传`
      + '<button class="ink-x" id="inkNecroClose">×</button></div>'
      + `<div class="necro-body">${renderBiographyHtml(md)}</div>`
      + '<button class="btn" id="inkBtnNecroBio" style="width:calc(100% - 20px);margin:0 10px 10px">导出此人传记（Markdown）</button>';
    panel.classList.add('on');
    $('inkNecroClose').addEventListener('click', () => this.hideDeadBiography());
    $('inkBtnNecroBio').addEventListener('click', () => {
      // 再编译一遍：正文是纯派生，不值得为它多存一份（存了就会与世界不同步）
      this.downloadText(biographyFileName(record), compileDeadBiography(this.world, record));
    });
  }

  hideDeadBiography() {
    const panel = $('inkNecroDetail');
    if (panel) panel.classList.remove('on');
    this.necroOpenId = null;
  }

  /** 下载一段文本为 .md（史册两个导出按钮共用） */
  downloadText(name, text) {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    this.notify(`已导出 ${name}（${text.length} 字）`);
  }

  /**
   * 读档 / 导入之后立刻把地盘重算一遍。
   *
   * 地盘不进存档（它是推导量，见 sim/territory.js），所以刚读进来的世界
   * 地图上一片势力色都没有，要等下一个重算日（最长三十游戏日）才长出来——
   * 玩家会以为地盘丢了。这里主动算一次。
   *
   * ⚠️ 只算、不落账：`computeTerritory` 是纯计算，不碰灵脉归属、不收编村子。
   * 若在这里顺手把认领与收编也做了，读档那条线就会比连续跑的那条线
   * 多做一次状态改动，存读档的分叉等价立刻就破。
   */
  refreshTerritory() {
    if (!this.world) return;
    computeTerritory(this.world);
    this.dirty = true;
  }

  /**
   * 卜算子那块对话条。
   *
   * 他的台词一直在编年史里（sim/busanzi.js 只往那儿写），但编年史一屏四十条、
   * 每几秒翻一次，他那句话转眼就没了。所以这里把 kind === 'busanzi' 的条目
   * 单独拎出来显示——**不新增状态，纯筛选**。
   * 亲缘同理：它是推导量，这里只负责画出来。
   */
  refreshBusanzi() {
    const box = $('inkBusanzi');
    if (!box || !this.world) return;
    const recent = busanziRecent(this.world, 3);
    if (!recent.length) {
      box.classList.remove('on');
      return;
    }
    const lines = $('inkBusanziLines');
    if (lines) {
      lines.innerHTML = recent
        .map((c) => `<div class="busanzi-line">${c.text}</div>`)
        .join('');
    }
    const tier = $('inkBusanziTier');
    if (tier) tier.textContent = busanziTierName(this.world);
    const meter = $('inkBusanziMeter');
    if (meter) {
      const next = busanziNextStep(this.world);
      meter.style.width = next ? `${Math.min(100, (next.value / next.need) * 100).toFixed(1)}%` : '100%';
    }
    box.classList.add('on');
  }
}

const sandbox = new Sandbox();
sandbox.boot();
window.inkbox = sandbox;

// 编年史与卜算子对话条需要定期刷新。
// 卜算子走这个定时器而不是只靠落笔触发，是为了让「里程碑」那几句话
// （第一个山门、头一个飞升……）在世界自己跑到的时候也能浮上来——
// 那些事不是玩家按出来的，但恰恰最该有人替他说一声。
setInterval(() => {
  sandbox.refreshChronicle();
  sandbox.refreshBusanzi();
  // 史册也走这个定时器：名录只在「有人离世」时才变，没必要每帧重排 800 条。
  sandbox.refreshNecrology();
  // 大事记 / 活人榜同理：它们只在「又发生了一件大事」「又有人觉醒」时才变，
  // 挂 2.5 秒这个节奏足够，而且**不在 rAF 里**（否则每帧重排 600 条大事）。
  sandbox.refreshMilestones();
  sandbox.refreshNotables();
  // 三界同理，而且**尤其**该走这个定时器：上界与幽冥是玩家看不见的地方，
  // 上面发生的事（有人飞升上来、某个魂排到了队）都不是玩家按出来的。
  // 不主动推一把，玩家永远不会知道那边动过。
  sandbox.refreshThreeRealms();
}, 2500);
