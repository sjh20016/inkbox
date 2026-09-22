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
import { stepHydrology } from './sim/hydrology.js';
import { stepVegetation, stepFire, decayOverlay } from './sim/ecology.js';
// 空间裂缝（阶段三）：开缝只在 pointerup 的提交点（commitSelection）发生，
// 判定/漏物/闭合走一条低频时钟（见 update）。`stepRifts` 内部对 `world.upper`
// 缺失有兜底，所以裂缝时钟**无条件跑**（裂缝属于凡间）。
import { RIFT_PERIOD_DAYS, stepRifts, openRifts } from './sim/rifts.js';
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
import { TOOLS, TOOL_BY_ID, TOOL_GROUPS, TOOL_CURSOR } from './ui/tools.js';
import { toCss } from './render/palette.js';
import {
  saveToStorage, loadFromStorage, exportFile, importFile, listSlots, deleteSlot,
} from './io/save.js';

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
 * 上界地形位图的最短重绘间隔（秒）。
 *
 * 视界的贴图走「全量渲染到离屏 canvas，再裁剪贴出」（规格 §3.4 的 C2 方案，
 * 不改 terrainLayer.js）。`TerrainLayer.render()` 是**全量**的——它遍历整张
 * `w×h` 并逐像素写 ImageData。若每帧都重绘上界，地形成本直接翻倍。
 *
 * 但上界地形**变化极慢**（不跑水文/生态，只有玩家工具会改），所以把它的重绘
 * 摊薄到 0.2 秒一档：视界里的云/浪会略顿，但这是 C2 方案下唯一能控成本的地方。
 * ⚠️ 这个数是**实测标定**的（见交付报告里的 FPS 读数），不要凭感觉改小。
 */
const UPPER_RENDER_PERIOD = 0.2;

/** 视界面积上限（占全图比例）。划满全图会让渲染退化成「全图渲染两遍」 */
const UPPER_VIEW_MAX_AREA = 0.4;

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
    this.followSelection = false;

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
    // 上界低频 step 的累积器（每 10 游戏日一次）。与 hydroAccum / ecoAccum 同构。
    this.upperAccum = 0;
    // 裂缝判定时钟的累积器（每 RIFT_PERIOD_DAYS = 30 游戏日一次）。
    // 紧挨 upperAccum 放，方便对照：两个都是「低频但时间点对齐」的时钟。
    this.riftAccum = 0;
    /** 上界地形需要重绘（本轮只由低频 step 置位，为下一阶段留口） */
    this.upperDirty = false;

    // ── 幽冥（第三界，与上界同构）──────────────────────────
    // 世界侧的正规引用是 `world.nether`（`attachNether` 造），`this.nether` 只是
    // 本类的缓存。**构造器这一格不能省**：漏了它，一次 reset 之后残留的
    // `this.nether` 会仍指着上一局的世界——`attachNether` 覆盖了它所以看不出来，
    // 但 `this.upper` / `this.upperTerrain` 都在这里置空，不置就是不对称。
    this.nether = null;

    // ── 上界视界（划选矩形）────────────────────────────────
    // ⚠️ `this.selection` 是 **UI 状态，不进世界存档**：存档是给「世界」的，
    //    不是给「屏幕」的（规格 §6.2）。所以它挂在这里，不挂 world。
    /** 已提交的划选矩形 `{x0,y0,x1,y1}`（整数格、已钳到边界），null = 没开视界 */
    this.selection = null;
    /** 拖拽中的矩形（同样的形状），null = 没在划。用来做实时反馈 */
    this.selectDrag = null;

    this.pointer = { x: 0, y: 0, inside: false, down: false, painting: false, panning: false, lastX: 0, lastY: 0 };
    this.hoverTile = { x: 0, y: 0 };
    this.selected = null;
    this.dirty = true;
    this.lastTime = 0;
    this.fps = 0;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.hydroAccum = 0;
    this.ecoAccum = 0;
    this.fireAccum = 0;
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
  }

  // ── 启动 ────────────────────────────────────────────────
  boot() {
    this.buildToolPanel();
    this.bindEvents();
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
    this.selectDrag = null;
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
    this.upperAccum = 0;
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
   *  3. **没有 `NetherLife`**（`sim/` 下只有 `upperLife.js`），也不新建。幽冥 tick 是
   *     阶段 8-C 的活，本轮不做。
   *  4. **不接 `TerrainLayer`、不渲染**：没有现成的幽冥渲染入口。
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
    // 先挂上：下一阶段（8-C 接幽冥 tick）唯一的入口，免得回来补接线时漏掉调用方。
    this.nether = nether;
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
    // ── 关闭路径 ①：切走 viewUpper 就收起视界 ──
    // 视界是「view 模式」的产物：离开这个工具就该离开这个视图。
    // 这也是**唯一的常规出口**——`render()` 只看 `this.selection`，不清的话那扇窗
    // 会永久盖在屏幕上，玩家会以为卡死了。
    //
    // ⚠️ 只在**工具真的换了**（`id !== this.toolId`）时清。`buildToolPanel` 的
    //    `renderList` 每次点分组标签都会拿**同一个** `this.toolId` 再调一次本函数，
    //    无条件清会让「只是点了个分组标签」也把窗关掉。
    // ⚠️ 不置 `this.dirty`：视界开关只影响画中画那一层，不碰地形位图，
    //    而 `render()` 每帧都会按 `this.selection` 重画那扇窗。
    if (id !== this.toolId && this.selection) {
      this.selection = null;
      this.selectDrag = null;
      this.notify('已收起上界视界', 2200);
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
        this.selectDrag = { x0: t.x, y0: t.y, x1: t.x, y1: t.y };
        return;
      }
      if (tool.readonly) {
        this.inspectAt(this.hoverTile.x, this.hoverTile.y);
        return;
      }
      this.history.begin();
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
      // 划选拖拽：把当前格钳进地图，框跟着长（实时反馈）。
      // 取整/排序放在提交时做——拖动过程中允许 x1 < x0（从右下往左上划）。
      if (this.selectDrag) {
        this.selectDrag.x1 = this.world.clampX(tile.x);
        this.selectDrag.y1 = this.world.clampY(tile.y);
      }
      // 落笔统一交给主循环限速处理，这里只更新光标所在格
    });

    const endPointer = () => {
      // 划选在这里**提交一次**（也只有这里提交）。放在 painting 之前，
      // 因为 'select' 不置 painting 位。
      if (this.selectDrag) {
        this.commitSelection(this.selectDrag);
        this.selectDrag = null;
      }
      if (this.pointer.painting) {
        const label = this.tool.name;
        if (this.history.end(label)) {
          // ⚠️ 点选工具刚在 pointerdown 的 `applyTool` 里报过「发生了什么」
          //    （「乱石岗天降陨石：17 人罹难，3 所聚落受损。」）。通知栏只有
          //    一行、后写的赢，所以这里**接在后面**而不是盖掉它——否则玩家
          //    永远看不到自己刚才把世界改成了什么样。
          const said = this.tool.mode === 'click' ? this.clickSaid : '';
          this.notify(said ? `${said}可 Ctrl+Z 撤销。` : `${label} · 已记录，可 Ctrl+Z 撤销`);
        }
      }
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
      this.selectDrag = null;
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
        this.selectDrag = null;
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
    // 划选工具没有「一个落点 + 半径」可言：它要的是一个矩形，走 commitSelection。
    // 这里直接挡住——否则 apply(ctx) 会拿到一个没有 rect / commitSelection 的 ctx
    // 而抛错。试玩测试第 9 节会无差别地对每个工具调 applyTool，这条守卫也是为它存在的。
    if (tool.mode === 'select') return;
    const world = this.world;
    const x = this.hoverTile.x;
    const y = this.hoverTile.y;
    if (!world.inside(x, y)) return;

    const before = world.entities.length;
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
   * 划选矩形 → 视界。**这是 'select' 模式唯一的提交点**（pointerup 调一次）。
   *
   * 为什么不复用 applyTool：applyTool 的 ctx 是「一个落点 + 半径」，
   * 而划选要的是一个矩形；而且它会被主循环的限速**反复调用**，
   * 而「开一扇视界」是**一次成型**的动作——反复调用会不断重开（规格 §3.2）。
   * 所以走这条独立路径，且只由 pointerup 触发一次。
   *
   * 视界矩形是 **UI 状态，不进世界存档**（规格 §6.2）：它挂在 `this.selection`，
   * 不挂 `world`。换世界 / 读档都会把它清掉。
   */
  commitSelection(rect) {
    const world = this.world;
    if (!world) return;
    const sel = this.normalizeSelection(rect);
    if (!sel) {
      // 单格点击（'select' 模式下 pointerdown 与 pointerup 落在同一格）。
      // 它有两种语义，按「当前有没有开着的视界」分——**两种都必须发声**：
      // 静默地关掉和静默地拒绝一样坏，玩家只会觉得「刚才那下把东西弄没了」。
      //
      //   · 开着 → **收起**（关闭路径 ②，切换工具是路径 ①，见 selectTool）。
      //     为什么敢让「点一格」兼任关闭：关掉是**可逆的**（再拖一次就回来，两秒），
      //     而「关不掉」是不可逆的体验损失——那扇窗会永久盖在屏幕上，像卡死了。
      //     两者不对称，所以宁可允许误触关闭。
      //     这与「拒绝时不清已有视界」并不矛盾：那一版是**拒绝的副作用**，
      //     这一版是玩家**主动做的动作**，是明明白白的一下点击。
      //   · 没开 → **拒绝**，并说清下一步该做什么（不只是「失败了」）。
      if (this.selection) {
        this.selection = null;
        this.notify('已收起上界视界（再按住拖拽可重新划开）', 2600);
      } else {
        this.notify('划选太小，未开视界——请按住鼠标拖拽出一片区域（不能只点一格）', 3200);
      }
      return;
    }
    const viewRect = { x0: sel.x0, y0: sel.y0, x1: sel.x1, y1: sel.y1 };
    const tool = this.tool;
    const ctx = {
      world,
      life: this.life,
      rect: viewRect,
      history: this.history,
      rng: this.rng,
      // 工具只负责决定「划哪块」，**记在哪由 UI 决定**——所以给它一个接收器，
      // 而不是让 ui/tools.js 反过来摸 Sandbox（那会让工具表依赖主程序）。
      commitSelection: (r) => { this.selection = r; },
    };
    const said = tool.apply(ctx);

    // ── 开缝：这是「上界视界」这个动作的**副作用**（规格 §4.1）──────────
    // 裂缝开在划选矩形的**四条边**上，是两界的接缝；内部不开（内部是「看到的上界」）。
    //
    // **为什么接在这里，而不是 ui/tools.js 的 `apply`**：`commitSelection` 是
    // pointerup 的**唯一**提交点，天然满足「一次成型、只能调一次」（规格 §3.2）。
    // 放在这里就不必把 `openRifts` 穿过工具表的 ctx 传进去——那会让工具表
    // 反过来依赖主程序，正是本文件一直在避免的方向（工具表只管「划哪块」）。
    //
    // ⚠️ **不许静默**：无论开成没开成都要发声。静默地关掉与静默地拒绝一样坏，
    //    玩家只会觉得「刚才那下把东西弄没了」（见上面「单格点击」那段同款教训）。
    const rift = (tool.id === 'viewUpper' && typeof openRifts === 'function')
      ? openRifts(world, viewRect)
      : null;
    let riftNote = '';
    if (rift && rift.opened > 0) {
      riftNote = `　边缘裂开 ${rift.opened} 道细缝`;
    } else if (rift && rift.refused) {
      // 拒绝也要说清为什么，不能只回一句「失败了」。
      riftNote = rift.reason === 'active-cap'
        ? '　裂缝太多，暂不开新缝'
        : '　这一带的地太薄/太虚，裂不开缝';
    }

    const cols = viewRect.x1 - viewRect.x0 + 1;
    const rows = viewRect.y1 - viewRect.y0 + 1;
    const pct = ((cols * rows) / world.size * 100).toFixed(0);
    if (typeof said === 'string' && said) {
      this.notify(said + riftNote, 3200);
    } else {
      this.notify(`上界视界 · ${cols}×${rows} 格（全图 ${pct}%）`
        + (sel.capped ? `　已按 ${Math.round(UPPER_VIEW_MAX_AREA * 100)}% 上限收窄` : '')
        + riftNote, 2800);
    }
    this.dirty = true;
  }

  /**
   * 把一次拖拽归一成一个合法的划选矩形：取整、排序、钳到地图边界、按面积上限截断。
   * 返回 `{x0, y0, x1, y1, capped}`；**单格（一次点击）返回 null**，见下面的判据。
   *
   * 取整/排序放在这里而不是拖动过程中：拖动时允许 `x1 < x0`（从右下往左上划），
   * 每动一下就排序会让框在正负方向之间跳。
   */
  normalizeSelection(rect) {
    const world = this.world;
    if (!world || !rect) return null;
    const round = (v) => Math.round(v);
    let x0 = world.clampX(round(Math.min(rect.x0, rect.x1)));
    let y0 = world.clampY(round(Math.min(rect.y0, rect.y1)));
    let x1 = world.clampX(round(Math.max(rect.x0, rect.x1)));
    let y1 = world.clampY(round(Math.max(rect.y0, rect.y1)));
    if (x1 < x0 || y1 < y0) return null;

    // 面积上限：划满全图会让视界退化成「全图渲染两遍」（规格 §3.4）。
    // 超了就绕中心等比收窄，并把 `capped` 交回去让玩家知道——
    // **不能静默截断**，否则玩家会以为「我明明划了全图，怎么只有中间一块」。
    let capped = false;
    const maxArea = Math.max(1, Math.floor(world.size * UPPER_VIEW_MAX_AREA));
    let area = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (area > maxArea) {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const k = Math.sqrt(maxArea / area);
      const hw = ((x1 - x0) / 2) * k;
      const hh = ((y1 - y0) / 2) * k;
      x0 = world.clampX(Math.floor(cx - hw));
      y0 = world.clampY(Math.floor(cy - hh));
      x1 = world.clampX(Math.ceil(cx + hw));
      y1 = world.clampY(Math.ceil(cy + hh));
      // 取整可能又顶出去一点，收紧到确实不超上限（循环有界，最多几轮）
      let guard = 0;
      while ((x1 - x0 + 1) * (y1 - y0 + 1) > maxArea && guard < 64) {
        if (x1 - x0 >= y1 - y0) x1 -= 1;
        else y1 -= 1;
        guard += 1;
      }
      capped = true;
    }
    // ⚠️ 这里原来写的是 `area = (x1-x0+1)*(y1-y0+1); if (area <= 0) return null;`
    //    —— **那是一句不可达的死代码**。`x1 >= x0` / `y1 >= y0` 上面已经保证过，
    //    而 `+1` 让格数最小就是 `1*1 = 1`，所以 `area` 永远 ≥ 1，`<= 0` 永不成立。
    //    后果：**点一下（pointerdown + pointerup 落在同一格）会开出一扇 1×1 的上界窗**，
    //    而读代码的人会以为「退化选区已经挡住了」。**一句看起来在防、实际不防的守卫，
    //    比没有守卫更坏** —— 它让人不去查那里。
    //
    //    判据必须是**跨度**，不是格数：
    //      · 单格（`x1 === x0 && y1 === y0`）不构成「一片山河」，不该开窗；
    //      · 但 1×N / N×1 的细条是合法的划选，要放行。
    if (x1 === x0 && y1 === y0) return null;
    return { x0, y0, x1, y1, capped };
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
   * 「上界视界现在开着吗」——裂缝时钟的唯一判据（契约 C1.1）。
   *
   * 判据是**两个条件同时成立**：
   *   · `this.selection` 非空（玩家划开了一片矩形，那扇窗真的显示着）；
   *   · `this.toolId === 'viewUpper'`（当前工具仍是视界工具）。
   *
   * ⚠️ 为什么两个都要：`selectTool` 切走工具时会清 `this.selection`（关闭路径①），
   * 但**读档 / 换世界**那条路径会直接把 `selection` 置空而工具不变；
   * 反过来，工具是 `viewUpper` 但还没划开时 `selection` 是 null。
   * 只看一个都会在某个过渡帧上误判——而误判的后果是裂缝在「窗口没开」时
   * 偷偷推进（用户第 1 条要的正是「只在开启视界时有效」）。
   *
   * 单独抽成方法而不是把条件内联进 `update`：①测试可以直接调它，
   * 不必去戳 `update` 那一大坨；②读代码时「裂缝什么时候走」一眼可查。
   *
   * @returns {boolean}
   */
  riftViewOpen() {
    return Boolean(this.selection) && this.toolId === 'viewUpper';
  }

  update(dt) {
    const world = this.world;
    if (!world) return;
    const speed = TIME.speeds[this.speedIndex].mult;
    const paused = this.speedIndex === 0;
    const days = TIME.baseDaysPerSecond * speed * dt;
    if (days > 0) {
      world.day += days;
      world.year = Math.floor(world.day / TIME.daysPerYear);
      this.life.step(days);

      // ── 上界共享同一条时间轴（规格 §3.5 / §6.4）──────────────
      // `world.day` 是**唯一**的时间源，上界不自己推进 day（它的 day 只是被赋值）。
      // 所以「上界比凡间慢」不会发生——上界只是**更新频率低**，但**时间点永远对齐**。
      // 与下面的 ecoAccum / fireAccum 完全同构：那几个时钟也是低频、但时间点对齐。
      // 判据：每 tick 都有 `world.day === this.upper.day`。
      if (this.upper) {
        this.upper.day = world.day;
        this.upper.year = world.year;
        this.upperAccum += days;
        if (this.upperAccum >= 10) {         // 每 10 游戏日跑一次上界
          // 阶段二：上界模拟。⚠️ 绝不能拿凡间的 `this.life` 去 step 上界：
          // `stepEntity` 会抽 `Life.rng`，那是全世界共用的一条主随机流，
          // 多抽一次整个世界线就漂走（铁律一，见 life.js 的注释）。
          // `UpperLife` 有自己从 `upper.seed` 派生的独立流。
          this.upperLife.step(this.upperAccum);
          this.upperDirty = true;
          this.upperAccum = 0;
        }
      }

      // ── 幽冥共享同一条时间轴（与上界逐字同构）──────────────
      // ⚠️ 这一步**不是可有可无的**：`serializeWorld` 会把 `day` / `year` 一起写进档
      //    （见 io/save.js 的标量区），所以幽冥那侧的 `day` **在存档格式里是有含义的**。
      //    不同步它，一份凡间第 300 日写下的档，里面幽冥的 `day` 会是 0——读回来
      //    照样还原成 0，**不报错、不 NaN**，等 8-C 接上幽冥 tick 时，幽冥就会
      //    从「第 0 日」起步，而所有读数看上去都是对的（故障类 1）。
      //    判据与上界同：每 tick 都有 `world.day === world.nether.day`。
      if (this.nether) {
        this.nether.day = world.day;
        this.nether.year = world.year;
      }

      // ── 空间裂缝（阶段三）────────────────────────────────
      // 与上界时钟同构的低频时钟，但**不套 `if (this.upper)`**：
      // 裂缝属于**凡间**（`world.rifts` / `world.riftLog`），上界只是在渲染时
      // 按坐标对位读它。`stepRifts` 内部对 `world.upper` 缺失有兜底
      // （需要上界那一侧的方向会被跳过），所以上界没挂上时裂缝判定照常进行。
      // ⚠️ 别以为「裂缝是两界之间的事」就该加 `if (this.upper)`——加了会让
      //    没上界的档（老档 / 单世界测试）裂缝系统整个静默停摆。
      // ⚠️ 本轮新增的 `if (this.riftViewOpen())` 是**另一件事**（契约 C1.1：
      //    视界关着就冻结），与 `this.upper` 无关，两者不要混。
      //
      // **为什么不能每帧跑**（规格 §4.3 第 1 条）：漏物判定每跑一次都要抽签。
      // 60 FPS 下每秒抽 60 次，而漏物概率是按「每 30 日 0.5%」标定的——
      // 按帧抽等于把概率放大 60×，裂缝会瞬间漏到爆炸，而且**不报错**，
      // 只是世界莫名其妙地被上界法宝塞满。
      //
      // **为什么周期取 30**：与 `TERRITORY_PERIOD_DAYS` 同频（规格 §4.3 第 1 条
      // 的「建议 30 日」），两个低频系统共用同一个节拍，长测里也好对齐。
      //
      // **不置 `this.dirty`**：`this.dirty` 管的是**地形位图**要不要重画
      // （见 render 里 `terrain.needsRender(now, this.dirty)`），而地形位图烤的是
      // height / water / type / veg 那几张数组；裂缝是**画在每帧重绘的叠加层**上的
      // （与 `drawLeylines` / `drawEntities` 同一层，见 render）。置 dirty 只会让
      // 整张地形位图每 30 天白重算一次，是纯浪费。
      //
      // ⚠️⚠️ **只在视界开启时累加（契约 C1.1，用户第 1 条）**：
      // 视界关着时裂缝**冻结**——不扩张、不闭合、不漏物。
      // **为什么不是「只暂停漏物判定、让曲线照走」**：一条 30–40 年的缝会在
      // 玩家关窗期间照常过完它的一生，玩家永远看不到它，与「只有开启视界时
      // 有效」直接矛盾。曲线改读 `rift.age`（`rifts.js`）与本行是同一件事的
      // 两半：一个管「什么时候推进」，一个管「推进的是哪条时间轴」。
      //
      // ⚠️ **关窗时既不累加也不清零**：累加器跨开关存活，与同段的
      // `ecoAccum` / `fireAccum` 同性质（那几个也是「低频但时间点对齐」）。
      // 清零会让「关一下再开」白白丢掉已经攒下的天数——玩家反复开关就能把
      // 裂缝永久卡在扩张期，那是一条不报错的坏法。
      if (this.riftViewOpen()) {
        this.riftAccum += days;
        if (this.riftAccum >= RIFT_PERIOD_DAYS) {
          stepRifts(world);
          this.riftAccum = 0;
        }
      }

      this.ecoAccum += days;
      if (this.ecoAccum >= 5) {
        stepVegetation(world, this.ecoAccum, this.rng);
        this.ecoAccum = 0;
        this.dirty = true;
      }
      this.fireAccum += days;
      if (this.fireAccum >= 0.8) {
        stepFire(world, this.fireAccum, this.rng);
        this.fireAccum = 0;
        this.dirty = true;
      }
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
    this.units.drawFireGlow(ctx, this.camera, world, now);
    this.units.drawLabels(ctx, this.camera, world);

    if (this.selected) this.units.drawSelection(ctx, this.camera, world, this.selected.x, this.selected.y);

    // 划选模式不画圆形笔刷——那会让玩家以为选出来的是圆的（划选是矩形语义）。
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

    // ── 上界视界（画中画）──────────────────────────────────
    // 放在**最后**有两个理由：① 要盖住凡间的实体/聚落——规格 §3.3 说得很硬：
    // 「窗里只有上界的东西」，凡间的人与村子漏进视界就是「串味」；
    // ② 裂缝边框要在所有叠层之上。也正因为它压在最上面，视界不会被暗角压暗——
    // 「另一界的一扇窗」本来就该比周围亮一点。
    if (this.selection) this.drawUpperView(ctx, now);
    // 拖拽中的框只有虚线（还没成型），画在已开的视界之上，免得被盖住看不见。
    if (this.selectDrag) this.drawSelectHint(ctx, this.selectDrag);
  }

  /**
   * 画中画：在划选矩形里贴出上界的对应区域（规格 §3.4 的 C2 方案）。
   *
   * 做法是「全量渲染到上界自己的离屏 canvas，再裁剪贴出」——**不改 terrainLayer.js**。
   * 两个 canvas 同尺寸、同 pad、同 reliefScale，所以凡间 (x,y) 与上界 (x,y)
   * 是同一个坐标；视界里贴的必须正是**同一块坐标区域**，这是下一阶段
   * 「裂缝漏物落在同一个位置」的依据（规格 §3.4 第 3 条）。
   *
   * ⚠️ 裁剪用的是屏幕矩形 + `ctx.clip()`，**不是** `drawImage` 的 `sourceRect`。
   *    原因：立体视图下每一格的落笔行是 `y + pad - round(高程 × reliefScale)`，
   *    **行号随各自的高程变**，所以「一块矩形区域」在 canvas 里并不是一个矩形——
   *    sourceRect 在立体视图下会取错一块。clip 则总是裁出屏幕上那块方窗。
   *    代价：clip 之下仍要 blit 整张上界 canvas（GPU 侧）；CPU 侧那次全量重绘
   *    已由 UPPER_RENDER_PERIOD 摊薄。
   */
  drawUpperView(ctx, now) {
    const sel = this.selection;
    const up = this.upperTerrain;
    if (!sel || !up) return;
    const cam = this.camera;

    // 上界地形低频重绘：全量 render 很贵，而它变化极慢（不跑水文/生态）。
    // ⚠️ `upperDirty` 这一轮**刻意不作为重绘的触发条件**（它只被置位、不被读）：
    //    高倍速下每 0.167 秒就跨一次「10 游戏日」边界（baseDaysPerSecond 3 ×
    //    最高 20 倍 = 60 日/秒），若让脏标记绕过节流，就等于每帧全量重绘上界，
    //    成本直接翻倍——而那正是这条节流要防的事。
    //    它是给**下一阶段**留的：那时 `upperLife.step` 会改上界实体/宗门，
    //    「内容变了」才需要一次立刻重绘；届时也要守住 UPPER_RENDER_PERIOD 这个上限。
    if (now - up.lastRender > UPPER_RENDER_PERIOD) {
      up.render(now, true);
      this.upperDirty = false;
    }

    const zoom = cam.zoom;
    const originX = cam.toScreenX(0);
    const originY = cam.toScreenY(-up.pad);
    // 选区的屏幕矩形：用「零抬升」的映射（canvas 行 = y + pad）。
    // 平面视图下这**严格**对位；立体视图下窗口边界落在零抬升基线上，
    // 窗内仍是上界地形（只是边界与上界自身的抬升不完全贴合，见方法注释）。
    const sx0 = cam.toScreenX(sel.x0);
    const sy0 = cam.toScreenY(sel.y0);
    const sw = cam.toScreenX(sel.x1 + 1) - sx0;
    const sh = cam.toScreenY(sel.y1 + 1) - sy0;
    if (sw <= 0 || sh <= 0) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(sx0, sy0, sw, sh);
    ctx.clip();
    ctx.drawImage(
      up.canvas,
      0, 0, up.canvas.width, up.canvas.height,
      originX, originY,
      up.canvas.width * zoom, up.canvas.height * zoom,
    );
    ctx.restore();

    this.drawRiftBorder(ctx, sx0, sy0, sw, sh, now);
  }

  /**
   * 视界边缘的「裂缝」：一圈**断续的墨线 + 微光**，不是实线。
   *
   * 它既是 UI 提示（这里开着一扇窗），也是裂缝的空间位置提示——
   * 下一阶段的裂缝就开在这四条边上（规格 §4.1「开在划选矩形的四条边」）。
   * 刻意不画实线：实线看着像选择框，断续才像缝。
   */
  drawRiftBorder(ctx, x, y, w, h, now) {
    if (w <= 2 || h <= 2) return;
    ctx.save();
    // 微光：一条略粗的冷色描边垫在底下。**刻意不用 shadowBlur**——
    // 那个在每帧都画的路径上出了名的贵，而这里只画四条边，粗线就够。
    const glow = 0.30 + 0.22 * Math.sin(now * 1.7);
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(122, 186, 196, ${glow.toFixed(3)})`;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // 断续墨线：断口缓慢流动，看着像「缝在动」，而不是像选择框
    ctx.lineWidth = 1.2;
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -now * 9;
    ctx.strokeStyle = 'rgba(34, 32, 28, 0.86)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
    ctx.restore();
  }

  /** 拖拽中的划选框：只有一圈虚线，没有微光/裂缝——还没成型，不能与已开的视界混淆 */
  drawSelectHint(ctx, rect) {
    const cam = this.camera;
    const x0 = cam.toScreenX(Math.min(rect.x0, rect.x1));
    const y0 = cam.toScreenY(Math.min(rect.y0, rect.y1));
    const w = cam.toScreenX(Math.max(rect.x0, rect.x1) + 1) - x0;
    const h = cam.toScreenY(Math.max(rect.y0, rect.y1) + 1) - y0;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(74, 122, 138, 0.9)';
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
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
    box.innerHTML = items.length
      ? items.map((m) => {
        const year = Math.floor((m.day || 0) / 360) + 1;
        return `<div class="ink-log"><b>仙历 ${year} 年</b>${m.text}</div>`;
      }).join('')
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
      meta.textContent = `生灵 ${upper.entities.length} · 宗门 ${upper.factions.length}`
        + ` · 飞升上来 ${pop.arrived || 0}`;
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
      meta.textContent = `魂池 ${st.waiting} · 累计 ${total} · 已归来 ${st.reborn}`;
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
