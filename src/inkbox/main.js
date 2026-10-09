// 水墨沙盒 · 主程序
//
// 一条 rAF 主循环：推进模拟 → 重绘地形位图 → 叠加生灵与界面。
// 地形渲染按需刷新（改动了才重画），水文按固定真实时间步推进，
// 这样即使把时间调到「飞」，地形演化也不会因为帧率而失真。

import { APP, LIMITS, TIME, WORLD_PRESETS, SEA_LEVEL, SPECIES_INFO, TERRAIN_INFO, TERRAIN, INK } from './core/config.js';
import { REALMS, realmLabel, pollutionLabel, POLLUTION_ASCEND_LIMIT } from './core/cultivation.js';
import { mulberry32 } from './core/noise.js';
import { generateWorld } from './world/worldgen.js';
import { createSandboxWorld, creationOptions, parseSeed, syncCreationControls, syncMapProgress, expandSandboxMap } from './ui/worldCreation.js';
import { accessBounds, canAccess } from './world/mapProgress.js';
import { createSandboxCharacterRuntime } from './g1/sandboxRuntime.js';
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
// ⚠️ 三界面板要的那几份只读读数（五路中文名 `ROUTE_LABEL` / 幽冥实体口径
//    `netherGhostStats` / 上界生态账 `upperEcoStats`）已随面板一起搬进
//    `ui/railPanels.js`，本文件不再 import——见下面 QoL 那段搬迁说明。
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
import { biographyRows, exportChronicle, chronicleFileName } from './sim/biography.js';
// ⚠️ `compileBiography` / `attentionOf` / `ATTENTION_NAMES` / `displayName` /
//    `findEntity`，以及史册那套 `necrologyList` / `necrologyStats` / `findDead` /
//    `compileDeadBiography`，都已随面板一起搬进 `ui/railPanels.js`。
//    本文件只留导出按钮真正用得到的那几个文件名。
import { exportNecrology, necrologyFileName } from './sim/necrology.js';
import { warStats } from './sim/war.js';
import { History } from './sim/powers.js';
// ⚠️ `busanziTierName` / `busanziNextStep` / `busanziRecent` 已随「不算子」面板
//    搬进 `ui/railPanels.js`；本文件只留开机问候与落笔回话这两个**交互**入口。
import { greetOnBoot, reactToTool } from './sim/busanzi.js';
import { TerrainLayer } from './render/terrainLayer.js';
import { UnitsLayer } from './render/unitsLayer.js';
import { Camera } from './render/camera.js';
// 表现叠层（D7-C）：落点墨环。**纯表现**——不写世界、不抽 RNG、不进存档，
// 删掉这一层模拟结果逐字不变。镜头滑过去之后浮出一个收缩墨环，
// 给「找到某人 / 某宗门」一个落点感（墨环属于表现层，**不属于 Camera**）。
import { drawFocusPulses, drawWarLines, spawnFocusPulse, updateFocusPulses } from './render/overlayLayer.js';
// ⚠️ 人物局部关系图（D7-F）的生成器 `relationGraphSvg` 与它的上限常量
//    `RELATION_GRAPH_MAX`，已随人物卡面板搬进 `ui/railPanels.js`。
// 多位面表现舞台（D8-C）：一帧收齐三界（凡间 / 上界 / 幽冥）的 transient 表现
// 事件 → 按位面路由成短命特效 → 分发给主画布与视界窗。**纯表现**——删掉它模拟
// 结果逐字不变，也不抽任何 RNG。收队列 / 更新 / 画哪一界全在舞台里，本文件不写三遍。
import { PresentationStage } from './render/presentationStage.js';
// 「记挂」观察者状态（D7-E，见 sim/watch.js）。这是**玩家的**观察列表——
// 存在 `world.watch`（世界级字段），**不挂实体、不参与模拟、不抽 RNG**。
// ⚠️ 面板本体（增删 / 状态 / 点行导航）已搬进 `ui/railPanels.js`，本文件不再
//    import `sim/watch.js`：**未读计数**由 `ui/qol.js` 直接向 `watchNewsCount`
//    取数，已读位仍然只由 `world.watch[].lastReadDay` 这一处持有（不建 UI 侧复本）。
// 表现事件的模拟侧发射口——玩家落笔（tool-impact）由本文件直接发。
// ⚠️ 队列的**抽取端**已收进 `render/presentationStage.js`（D8-C）：本文件不再
//    自己 `drainRuntimeEvents`，否则三界要写三遍（见该文件头注释）。
import { emitPresentation } from './sim/presentation.js';
// ⚠️ `normalizeRegion as normalizeRegionGeometry` 是划选区域的**纯几何核心**
//    （鞋带面积 / 钳界 / 面积上限）。它放在 `ui/tools.js` 而不是本文件的方法里，
//    是因为本文件依赖 DOM、node 里 import 不了，而 `scripts/_riftprobe.mjs`
//    要在 node 里断言它。别名是为了不与下面同名的方法打架。
// ⚠️ 别把注释写进下面那对花括号里：`scripts/inkbox-import-check.mjs` 用正则
//    扫具名导入，会把注释文字当成导入名而误报「对面没有这个导出」。
import {
  TOOLS, TOOL_BY_ID, TOOL_GROUPS, TOOL_CURSOR, normalizeRegion as normalizeRegionGeometry,
} from './ui/tools.js';
// 视界的**纯状态与几何**（D8-B 从本文件拔出去）：判据总表 / 区域命中 / 窗内鬼魂计数。
// 零 import 的纯模块——「视界不许改世界」因此是**结构性**成立的，不是靠注释保证。
import {
  VIEW_MAX_AREA_FRAC, VIEW_CLICK_PX, viewPlaneForTool, planeLabel, ghostsInRegion,
} from './ui/realmView.js';
import { getRealmViewState } from './ui/realmViewState.js';
// 视界的**穿透检视**（D8-F）：点开窗里的东西看它是什么。**只读**——本模块只产出
// 字符串行，不暴露任何改状态的接口（「D8 仍然是观察」是结构性的，见其头注释）。
import { pickRealmSubject, realmInspectRows, resolvePlaneSubject, planeSubjectInspectRows } from './ui/realmInspector.js';
// ⚠️ 跨界**追迹**（D8-G）的 `traceTargetOf` 随「记挂」点行导航搬进
//    `ui/railPanels.js`；`crossRealmChain` 在搬迁之前就已无人调用，一并清掉。
// 视界的**绘制层**（D8-B 从本文件拔出去）：裁剪 / 贴另一界地形 / 画人与宗门 / 边框。
// ⚠️ 它不 import `sim/*`——够不到模拟，就不可能改模拟。
import { drawRealmView, drawSelectHint } from './render/realmViewLayer.js';
import { toCss } from './render/palette.js';
import {
  saveToStorage, loadFromStorage, exportFile, importFile, listSlots, deleteSlot,
} from './io/save.js';
import {
  CAUSAL_TOOL_IDS, createInterventionOutcome, measureChangedCells,
} from './sim/interventionFeedback.js';
// ── QoL 填缝包（QOL_PASS1）──────────────────────────────────────────
// 右栏观察面板的**实现**已搬进 `ui/railPanels.js`（本轮从本文件搬出去约 750 行，
// 语义一字未改，只是把 `this.` 换成 `sb.`）。本文件只留一行委托：
//   `refreshChronicle() { return refreshChroniclePanel(this); }`
// 为什么搬：`npm run test:view` 的 V6 ④ 钉着 `main.js ≤ 3084 行`（D7 硬指标），
// 而本轮要往主程序里加几十处 QoL 接线——搬完之后主程序**比搬迁前更小**。
// ⚠️ 这是本轮唯一「顺手做」的重构，而它本身不是新功能：
//    删掉 `ui/railPanels.js`、把这些函数贴回本文件，就等于回到改动前。
import {
  refreshChroniclePanel, refreshMilestonesPanel, refreshNotablesPanel,
  showPersonCardPanel, hidePersonCardPanel, buildRelationSvgPanel,
  bindRelationGraphPanel, refreshWatchPanel, openWatchRowPanel,
  refreshThreeRealmsPanel, refreshUpperRealmPanel, refreshNetherRealmPanel,
  refreshNecrologyPanel, setNecroSortPanel, showDeadBiographyPanel,
  hideDeadBiographyPanel, downloadTextPanel, refreshBusanziPanel,
  refreshSlotsPanel, setupSectionTogglesPanel, refreshRecentPanel,
  showCharacterChoicesPanel, showCharacterRelationsPanel,
} from './ui/railPanels.js';
// QoL 控制器（DOM 侧）：Escape 分层 / UI 偏好 / 最近看过 / dirty / 确认条 /
// Toast 定位 / 忙碌按钮 / 世界信息。**判定**在 `ui/qolState.js`（零 import 纯逻辑），
// 本文件只跟这个控制器说话——不直接 import `qolState.js`，免得判定散回主程序。
import { createQol } from './ui/qol.js';

const $ = (id) => document.getElementById(id);

// 周期侧栏只在整段 markup 真正变化时替换 DOM；缓存只持有元素与字符串，
// 不持有 World 或实体引用，换世界后首次渲染仍会按新内容更新。
const periodicMarkup = new WeakMap();
function setPeriodicMarkup(element, markup) {
  if (!element || periodicMarkup.get(element) === markup) return;
  element.innerHTML = markup;
  periodicMarkup.set(element, markup);
}

function setTextIfChanged(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

/** 各阶境界的横条颜色，与小人身上的束带/灵光保持同一套色（按 `REALMS` 逐档对应） */
const REALM_BAR = ['#a8b6bd', '#8fa7b8', '#c8a44e', '#8fb0d8', '#c98fd8', '#e8c860', '#b98cff'];


// ── 视界（D8-B：实现已搬到 `ui/realmView.js` + `render/realmViewLayer.js`）──
//
// 这里只留**接线**：本文件依赖 DOM，node 里 import 不进来，所以「视界是什么」
// 的判据总表与全部绘制都在上面那两个模块里（前者纯状态/几何、后者纯绘制）。
// 主程序只剩 `if (this.selection) drawRealmView(...)`（见 `render()`）。
//
// ⚠️ 视界逻辑**不许再搬回本文件**：D8 的硬指标是 `main.js` 不得比 D7 baseline 更大。

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

// ── 镜头动作时长（D7-C）──────────────────────────────────
// 走真实时间（秒）。找人物 0.6~0.9 取 0.75，找宗门 0.7~1.0 取 0.85——
// 宗门是「更大的地方」，稍慢一点读起来更稳。**不做镜头晃动、不自动跟随**。
const PERSON_FOCUS_DURATION = 0.75;
const SECT_FOCUS_DURATION = 0.85;

class Sandbox {
  constructor() {
    this.canvas = $('inkCanvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.camera = new Camera();
    this.units = new UnitsLayer();
    // ── 表现叠层状态（D7-C）────────────────────────────────
    // `focusPulses` 是**真实时间**驱动的短命墨环列表（见 render/overlayLayer.js）。
    // 它是 transient 表现，**不进存档**：读档后为空，与 runtime events 同性质。
    this.focusPulses = [];
    // ── 跨界追迹状态（D8-G）────────────────────────────────
    // `traceTarget` = 玩家刚点开的那条记挂「现在在哪一界、同坐标在哪」
    //   （`ui/realmTrace.js` 的 `traceTargetOf` 产物）。**只针对当前这个人**。
    // `tracePulses` = 追迹专用的落点墨环列表。**为什么不并进 `focusPulses`**：
    //   墨环在 `render()` 里画在**视界窗之前**（`drawFocusPulses` 那一处），
    //   而追迹墨环要落在**窗里那个人身上**——它必须画在窗**之后**才看得见。
    //   两条列表 → 两次绘制 → 层次各自正确，且不动既有 D7-C 的墨环层次。
    // 两者都是 transient 表现，**不进存档**（读档后为空）。
    this.traceTarget = null;
    this.tracePulses = [];
    // 多位面表现舞台（D8-C）：内部持有 FX 状态（`stage.fx`），由三界 transient
    // 表现事件喂养，真实时间驱动，不进存档。
    this.stage = new PresentationStage();
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
    /** D8-F：划选按下的**屏幕坐标**，抬手时用它判「拖动 vs 短点击」（`VIEW_CLICK_PX`） */
    this.pressX = null;
    this.pressY = null;
    /** Q8：`#inkBtnCloseView` 上一次的显示态（挡掉 render() 里重复的 DOM 写） */
    this.closeViewShown = null;

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
    this.g1 = createSandboxCharacterRuntime(this, { render: showPersonCardPanel, hide: hidePersonCardPanel,
      candidates: showCharacterChoicesPanel, relations: showCharacterRelationsPanel });
    /** 活人榜的点击委托只挂一次（同上） */
    this.notablesBound = false;
    /** 「天道记挂」的点击委托只挂一次（同上，D7-E） */
    this.watchBound = false;
    // ── 关系与战争可视化（D7-F）──────────────────────────────
    // `showWarLines`：玩家按 W 打开的「战争显示」——打开时画全部活跃战线
    //   （默认不画，否则几十个势力会变蜘蛛网）。
    // `focusedSectId`：最近点过的那家宗门——只画**跟它有关**的战事（规格 F 的
    //   「当前观察某个宗门」）。换世界 / 收面板不清它也没关系：找不到就画不出。
    // `relationOpen`：人物卡里「查看关系」是否摊开（纯 UI 开关，不写世界）。
    // `clock`：真实时间秒（墨环 / 战争线呼吸都吃它，与 `world.day` 无关）。
    this.showWarLines = false;
    this.focusedSectId = null;
    this.relationOpen = false;
    /** 关系图的点击委托只挂一次（容器常驻，见 bindRelationGraph） */
    this.relationBound = false;
    this.clock = 0;
    // ── 玩家干预的反馈（Batch 2）──────────────────────────
    // 点选类神力（天灾 / 抹除 / 仙道）在 `applyTool` 里会把「发生了什么」
    // 写成人话返回，然后 `notify` 出去。但**通知栏只有一行**，而 `pointerup`
    // 里那句「已记录，可 Ctrl+Z 撤销」紧接着又 `notify` 一次，把它**盖掉**——
    // 实测：陨石砸死 24 人，玩家看到的只有「陨石 · 已记录，可 Ctrl+Z 撤销」。
    // 那句话说的事比「可撤销」重要得多，所以这里把它留到 pointerup 时**接在
    // 撤销提示前面**，而不是让它被盖掉。
    this.clickSaid = '';
    this.strokeIntervention = null;

    // ── QoL 控制器（QOL_PASS1）──────────────────────────────
    // Escape 分层 / UI 偏好（`inkbox-ui-prefs-v1`）/ 最近看过 / dirty 标志 /
    // 确认条 / Toast 定位 / 忙碌按钮 / 世界信息。**在 `boot()` 里建**——
    // 构造器里 DOM 还没保证齐全，而它启动时要读三个 localStorage 键。
    // ⚠️ 它持有的全是 UI 状态：不进 World、不进正式存档、不抽 RNG。
    this.qol = null;
    /** Q30：「收起全部」的监听只挂一次（按钮常驻） */
    this.collapseAllBound = false;
  }

  // ── 启动 ────────────────────────────────────────────────
  boot() {
    this.qol = createQol(this);
    this.buildToolPanel();
    this.bindEvents();
    this.setupSectionToggles();
    this.resize();
    this.newWorld(this.presetKey, this.seed);
    this.refreshRecent();
    // Q31 / Q33：第一次打开时提示一次「按 ? 看快捷键」（看过一次就不再念，
    // 见 `ui/qol.js` 的 `nudgeHelpOnce` / `helpSeen`）。
    // ⚠️ 它收一个前缀，为的是与上面 `newWorld()` 那句「新世界已开 · 种子 N」
    //    并成**一句**——提示只有一条槽位，分开发就会互相覆盖。
    // ⚠️ 帮助入口本身是**常驻**的（顶栏那颗「? 帮助」），所以「新手引导结束后
    //    还能再打开」不依赖这句话。
    this.qol.nudgeHelpOnce(`新世界已开 · 种子 ${this.seed}`);
    requestAnimationFrame((ts) => this.frame(ts));
  }

  newWorld(presetKey = this.presetKey, seed = this.seed, options = {}) {
    const preset = WORLD_PRESETS[presetKey] || WORLD_PRESETS.medium;
    this.presetKey = presetKey;
    this.seed = seed >>> 0;
    this.world = createSandboxWorld(preset, this.seed, options);
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
    // 活人卡同理（Q36）：上一个世界的人，在新世界里查不到——留着就是一张空卡。
    this.hidePersonCard();
    // Q13：最近看过是**上一个世界**的导航记录，换世界必须清空。
    // ⚠️ 它只在 UI runtime 里，不进 World、不进正式存档。
    this.qol.clearRecent();
    this.dirty = true;
    // Q21：换世界是一次「改了世界」的动作，之后没存就再换一次要问一句。
    this.qol.markDirty('newWorld');
    this.notify(`新世界已开 · 种子 ${this.seed}`);
    this.syncWorldControls();
    this.syncWorldInfo();
    this.qol.syncToolState();
    this.refreshSlots();
    this.refreshChronicle();
    this.refreshNecrology();
    // 三界：换世界之后上界/幽冥也整个换了，面板不刷就是开在别人图上的窗
    this.refreshThreeRealms();
    // 天道记挂（D7-E）：换世界后 `world.watch` 也换了，不刷就是上一个世界的列表。
    this.refreshWatch();
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
    syncCreationControls(this);
  }

  expandMap(all = false) { return expandSandboxMap(this, all); }

  /**
   * 一条提示。实现在 `ui/qol.js`（Q11 的「提示本身可以是入口」就在那里）。
   *
   * ⚠️ 本方法保留成一层薄委托，是因为全文件几十处都在调 `this.notify(...)`；
   *    把实现搬进控制器是为了让「提示能不能点、点了去哪」只有一份判据。
   *
   * @param {string} text 玩家看到的这句话
   * @param {number} ms 显示时长
   * @param {object|null} target Q11：带定位信息时提示变成入口
   *   （`{plane, x, y, entityId}`，只消费已有字段）
   */
  notify(text, ms = 2600, target = null) {
    this.qol.notify(text, ms, target);
  }

  /** Q34：顶部那颗「seed / 幅面 / 渲染器」信息丸。 */
  syncWorldInfo() {
    this.qol.syncWorldInfo(this.render3d ? '3D' : 'Canvas');
    syncMapProgress(this);
  }

  /**
   * Q8：关闭视界。**唯一**的关闭路径——工具切换（`selectTool` 路径 ①）、
   * Escape（Q1）、视界附近的「关闭视界」按钮（Q8）全走它。
   *
   * ⚠️ 它**只**清 `selection` / `selectPath`（两个 UI 字段），
   *    不碰世界、不碰相机、不碰速度。Q8 明令「不得创造新的 selection 状态」，
   *    所以这里没有第二个「视界开没开」的标志位——判据永远只有 `this.selection`。
   * @param {string} why 'tool' | 'escape' | 'button' —— 只影响文案
   */
  closeRealmView(why = 'button') {
    if (!this.selection) return false;
    const label = this.viewPlane().label;
    this.selection = null;
    this.selectPath = null;
    // ⚠️ **不置** `this.dirty`：那个标志管的是**地形位图**要不要重画
    //    （见 `render()` 的 `terrain.needsRender(now, this.dirty)`），
    //    而视界窗是每帧按 `this.selection` 现画在画布上的（纸底 + 地形 blit
    //    每帧都重来一遍），置了只会白烧一次整张地形重绘。
    if (why === 'tool') this.notify(`已收起${label}视界`, 2200);
    else if (why === 'escape') this.notify(`已关闭${label}视界`, 2000);
    else this.notify(`已关闭${label}视界 · 切回「视界」类神力可再划开`, 2600);
    return true;
  }

  /**
   * Q8：视界开着的时候，画布上浮出那颗「关闭视界」。
   *
   * ⚠️ 判据**只有** `this.selection`——Q8 明令「不得创造新的 selection 状态」，
   *    所以这里没有第二个「视界开没开」的标志位（`closeViewShown` 只缓存
   *    **上一次的显示态**，不是状态真相；把它删掉，按钮照样正确，只是多写几次 DOM）。
   * ⚠️ 从 `render()` 里调，而不是在每个赋值点各调一次：`selection` 有八处赋值
   *    （提交 / 放弃 / 换工具 / Escape / 读档 / 重新开天…），逐个去挂迟早漏一处，
   *    而漏掉的那一处**不报错**——只是窗口开着、按钮不在，玩家找不到关的入口。
   *    缓存挡掉重复写，所以每帧调一次是安全的。
   */
  syncCloseViewBtn() {
    const btn = $('inkBtnCloseView');
    if (!btn) return;
    const want = Boolean(this.selection);
    if (this.closeViewShown === want) return;
    this.closeViewShown = want;
    btn.hidden = !want;
    btn.classList.toggle('on', want);
  }

  /**
   * Q7：撤销。**Ctrl+Z 与「撤销」按钮共用这一条路径**——
   * 两条路各写一遍的话，「按钮会说没有可撤销的操作、Ctrl+Z 却静默无事」
   * 这种不一致迟早出现，而且不报错。
   */
  undo() {
    const label = this.history.undo(this.world);
    if (!label) {
      this.notify('没有可撤销的操作', 2200);
      this.qol.syncUndoState();
      return false;
    }
    this.notify(`已撤销「${label}」`);
    this.dirty = true;
    this.qol.markDirty('undo');
    this.qol.syncUndoState();
    return true;
  }

  /** Q28：折叠状态变了 → 重画那几块长列表（**纯展示**，不碰世界）。 */
  refreshFolds() {
    this.refreshChronicle();
    this.refreshMilestones();
    this.refreshNotables();
    this.refreshWatch();
    this.refreshNecrology();
  }

  /** Q13：重画「最近看过」。 */
  refreshRecent() {
    refreshRecentPanel(this);
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
      // Q8 / Q1：关闭路径收敛到**一条** `closeRealmView()`——工具切换、Escape、
      // 「关闭视界」按钮全走它。原先这段内联逻辑是三个出口各写一遍的第一份。
      this.closeRealmView('tool');
    }
    this.toolId = id;
    document.querySelectorAll('.ink-tool').forEach((el) => el.classList.toggle('on', el.dataset.tool === id));
    const tool = TOOL_BY_ID[id];
    const hint = $('inkToolHint');
    if (hint) hint.textContent = `${tool.name} — ${tool.hint}`;
    this.updateCursor();
    // Q5：工具切换 / 快捷键切换 / 程序切换都必须同步那一行「我手里拿的是什么」。
    this.qol.syncToolState();
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
  setupSectionToggles() { return setupSectionTogglesPanel(this); }

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
        // D8-F：记下按下的**屏幕坐标**。抬手时用它算位移，区分「拖动重画视界」
        // 与「短点击窗内检视」——判据取屏幕像素（手感在屏幕上，见 `VIEW_CLICK_PX`）。
        this.pressX = this.pointer.x;
        this.pressY = this.pointer.y;
        return;
      }
      if (tool.readonly) {
        if (!this.g1.inspectCanvas(this.pointer.x, this.pointer.y)) this.inspectAt(this.hoverTile.x, this.hoverTile.y);
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
        const path = this.selectPath;
        this.selectPath = null;
        // D8-F：视界工具的手势现在有**两支**——「拖动重画视界」与「短点击窗内检视」。
        // 分派判据全在 `isRealmInspectClick()`（那里逐条说明为什么两个条件缺一不可）。
        // ⚠️ **分支放在提交之前**：检视**不是**一次划选，不能顺手 commitSelection
        //    （那会走进「退化划选 ⇒ 收起视界」那条路，把窗关掉）。
        if (this.isRealmInspectClick()) {
          const t = this.hoverTile;
          this.inspectRealmAt(t.x, t.y);
        } else {
          this.commitSelection(path);
        }
      }
      if (this.pointer.painting) {
        const label = this.tool.name;
        if (this.history.end(label)) {
          // ── Q7：撤销栈**刚刚**才有内容 ⇒ 按钮的可用态必须立刻跟上 ──────────
          // ⚠️ 不能指望 `applyTool` 里那次 `markDirty` 代劳：它是在**拖拽过程中**
          //    跑的，那时 `history.end()` 还没提交，栈仍是空的，
          //    `syncUndoState()` 据此把按钮锁成「没有可撤销的操作」。
          //    真正入栈发生在这一行，所以刷新也必须在这一行之后。
          // ⚠️ 漏掉它**不报错**——只是玩家画完一笔、撤销按钮依然是灰的，
          //    得等下一次存档（`markPersisted` 会顺手同步）才亮起来。
          this.qol.syncUndoState();
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
            // 表现层：玩家落笔的落点反馈（FX 在落点画冲击环；陨石类工具演「天降」）。
            // ⚠️ 无论成败都发——玩家确实落了这一笔，画面上就该有回响。
            //    只发事件，不改模拟、不抽 rng。
            emitPresentation(this.world, 'tool-impact', {
              x: this.strokeIntervention.x,
              y: this.strokeIntervention.y,
              data: { tool: this.strokeIntervention.toolId },
            });
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
      // ── Q1：Escape 走分层关闭，**故意放在输入框保护之前** ──────────
      // 用户明确要求「Escape 可以按既定规则处理」，所以焦点落在 seed 输入框里
      // 时它照样逐层退回。能关哪几层由 `ui/qolState.js` 的 `ESCAPE_ORDER` 决定
      // （confirm → help → float → realmView → selection → inspect），
      // **不在这张表里的东西它一律不碰**：不重置世界、不改模拟、不改时间速度、
      // 不误触「重新开天」。
      if (e.key === 'Escape') {
        if (this.qol.handleEscape()) e.preventDefault();
        return;
      }
      // ── Q2：焦点在文本输入类元素上时，游戏快捷键一律不响应 ──────────
      // ⚠️ 判据含 `isContentEditable`：`contenteditable` 的宿主元素 `tagName`
      //    是 `DIV`，只看标签名会把它漏掉——于是玩家在可编辑区域里打一个 `w`，
      //    战争显示就开了。这类漏判**不报错**，只是行为莫名其妙。
      if (this.qol.isTextEntry(e.target)) return;
      // ── Q31：`?` 开合快捷键帮助（帮助层自己按 Escape 关）──────────
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        if (this.qol.helpOpen()) this.qol.closeHelp(); else this.qol.openHelp();
        return;
      }
      if (e.code === 'Space') {
        this.spaceDown = true;
        e.preventDefault();
        this.togglePause();
        return;
      }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        // Q7：Ctrl+Z 与「撤销」按钮**共用一条执行路径**（`this.undo()`）——
        // 两条路各写一遍的话，「按钮说没有可撤销的操作、Ctrl+Z 却静默无事」
        // 这种不一致迟早出现，而且不报错。
        this.undo();
        return;
      }
      if (e.key >= '1' && e.key <= '6') {
        // Q6：快捷键切档与 UI 按钮完全同步（`setSpeed` 是唯一入口），
        // 并给一次轻量反馈（`announce=true`）。**不每个 tick 重复提示**——
        // 只有玩家真的按了键才说一次。
        this.setSpeed(Number(e.key) - 1, true);
        return;
      }
      if (e.key === '[') this.setBrush(this.brushIndex - 1);
      if (e.key === ']') this.setBrush(this.brushIndex + 1);
      if (e.key === 'g' || e.key === 'G') this.toggleGrid();
      if (e.key === 'v' || e.key === 'V') this.toggleRelief();
      // D7-F：W 打开 / 关闭「战争显示」（画全部活跃战线）。纯表现开关，不写世界。
      if (e.key === 'w' || e.key === 'W') {
        this.showWarLines = !this.showWarLines;
        this.notify(this.showWarLines ? '战争显示：开' : '战争显示：关');
        this.dirty = true;
      }
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
    // Q7：按钮与 Ctrl+Z 共用 `this.undo()`（同一条路径、同一句反馈）。
    $('inkBtnUndo').addEventListener('click', () => this.undo());
    $('inkBtnGrid').addEventListener('click', () => this.toggleGrid());
    $('inkBtnRelief').addEventListener('click', () => this.toggleRelief());
    $('inkBtnFit').addEventListener('click', () => {
      this.camera.fit(this.world);
      this.dirty = true;
    });
    // ── Q40：两个 destructive 按钮的文案与确认逻辑统一 ────────────────
    // 两个都**换掉当前世界**，所以两个都要过 `guardDiscard`（Q21 的未保存保护）：
    //   · 「重新开天」= 按输入框里的种子开一局（种子留着，方便复现）；
    //   · 「随机开天」= 随机种子开一局（原先叫「随机种子」，id 却是 `Clear`——
    //     名字说的是种子，做的事是换世界，玩家按下去才发现天没了）。
    // ⚠️ 与普通按钮的区别靠**文案 + 确认**，不做大红色视觉改版（Q40 明令）。
    // ⚠️ Q38 / Q39：都走 `runOnce`，跑的时候按钮 disabled——双击不会开两次天。
    $('inkBtnExpand')?.addEventListener('click', () => this.expandMap());
    $('inkSeedInput').addEventListener('input', e => e.target.setCustomValidity(''));
    $('inkBtnRegen').addEventListener('click', () => {
      let requestedSeed;
      try { requestedSeed = parseSeed($('inkSeedInput').value); }
      catch (error) { $('inkSeedInput').setCustomValidity(error.message); this.notify(error.message, 3200); return; }
      const requestedOptions = creationOptions();
      this.qol.guardDiscard('当前世界有尚未保存的变化，仍要按种子重新开天？', () => {
        void this.qol.runOnce('inkBtnRegen', async () => {
          const seedInput = $('inkSeedInput');
          const presetSelect = $('inkPresetSelect');
          const seed = requestedSeed;
          seedInput.value = String(seed);
          this.newWorld(presetSelect.value, seed, requestedOptions);
        });
      });
    });
    // Q4：槽位下拉**换了槽**，读档按钮的可用性要跟着变。
    // ⚠️ 少了这一句，「换到一个空槽」之后按钮仍然是亮的（`refreshSlots` 只在
    //    开机 / 存完 / 读完之后跑），点下去只会得到一句「没有存档」——
    //    而按钮本身早该拦住（Q39 那句注释说的就是这个）。
    const slotSelect = $('inkSlotSelect');
    if (slotSelect) slotSelect.addEventListener('change', () => this.refreshSlots());
    $('inkBtnSave').addEventListener('click', () => this.qol.runOnce('inkBtnSave', async () => {
      const slot = $('inkSlotSelect').value || 'auto';
      const result = await saveToStorage(this.world, slot, { name: slot });
      if (result.ok) {
        // Q24：往**侧索引**里记一笔「这一格现在是仙历几年 / 什么种子」。
        // 它不进正式存档、不改 `save.js` 的 schema——只是槽位旁边那一行小字。
        this.qol.noteSlotSaved(slot, this.world);
        // 报的是**落盘**体积（压缩后）。压缩比必须一起给出来，否则
        // 「同一个世界，存档怎么突然只剩三分之一」会被当成丢了数据。
        const ratio = result.bytes > 0 ? (result.rawBytes / result.bytes).toFixed(1) : '1.0';
        let msg = `已存档到「${this.qol.slotLabel(slot)}」· ${(result.bytes / 1024).toFixed(0)} KB`
          + (result.codec === 'gzip'
            ? `（压缩 ${ratio}×）`
            : `（明文·${plainSaveTag(result.fallbackReason)}）`);
        // Q25：容量预警。用的是**已落盘的真实码元数**（`listSlots` 的 `bytes`
        // 就是 `encoded.length`），不是估算——估出来的数在「快满了」这一刻
        // 恰恰最不准，而这一刻正是它唯一有用的时候。
        const used = listSlots().reduce((n, s) => n + (s.bytes || 0), 0);
        const warn = this.qol.quotaWarning(used, 0);
        if (warn) msg += ` · ${warn}`;
        this.notify(msg, warn ? 8000 : 2600);
        // 存档给了玩家一份可恢复的副本 ⇒ 未保存标志清掉（Q21）。
        this.qol.markPersisted('save');
      } else {
        // Q22：失败必须说人话。「浏览器空间不足」是这里最常见的一条，
        // 而 `QuotaExceededError` 的原文在各浏览器里长得都不一样（还可能是英文）。
        this.notify(`存档失败 · ${this.qol.describeSaveError(result.error)}`, 8000);
      }
      this.refreshSlots();
      this.qol.syncUndoState();
    }));
    $('inkBtnLoad').addEventListener('click', () => {
      // Q21：读档会丢掉当前世界 ⇒ 没保存过就先问一句。
      this.qol.guardDiscard('当前世界有尚未保存的变化，仍要读档覆盖吗？', () => {
        // Q39：读档是异步的（解压 + 反序列化），期间按钮 disabled。
        void this.qol.runOnce('inkBtnLoad', async () => {
          const slot = $('inkSlotSelect').value || 'auto';
          const world = await loadFromStorage(slot);
          if (!world) {
            this.notify(`「${this.qol.slotLabel(slot)}」没有存档`);
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
          this.hidePersonCard();
          // Q13：最近看过属于上一个世界，读档必须清空。
          this.qol.clearRecent();
          this.dirty = true;
          // Q21：刚读进来的世界与存档逐字一致 ⇒ 没有未保存的变化。
          this.qol.resetDirty();
          this.notify(`已读取「${this.qol.slotLabel(slot)}」`);
          this.syncWorldControls();
          this.syncWorldInfo();
          this.qol.syncToolState();
          this.qol.syncUndoState();
          this.refreshSlots();
          this.refreshTerritory();
          this.refreshChronicle();
          this.refreshNecrology();
          this.refreshThreeRealms();
          this.refreshBusanzi();
        });
      });
    });
    // Q26：导出文件名带上 seed 与天数（`inkbox_seed226_day175200.json`）。
    // ⚠️ 只改**文件名**，不改文件内容（导出仍然是不压缩的 JSON）。
    $('inkBtnExport').addEventListener('click', () => {
      this.qol.runOnce('inkBtnExport', async () => {
        const name = this.qol.exportFileName(this.world);
        exportFile(this.world, name);
        // 导出一份到磁盘也算「给了玩家可恢复的副本」⇒ 清 dirty（Q21）。
        this.qol.markPersisted('export');
        this.notify(`已导出 ${name}`, 4000);
      });
    });
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
    $('inkBtnImport').addEventListener('click', () => {
      // Q21：导入会替换当前世界 ⇒ 没保存过就先问一句。
      this.qol.guardDiscard('当前世界有尚未保存的变化，仍要导入覆盖吗？', () => $('inkImportFile').click());
    });
    // ── Q23：导入失败**不许**动到当前世界 ────────────────────────────
    // 顺序是「读 → 解 → 构造候选 → 成功之后才替换」：
    // `await importFile(file)` 在任何一步失败都会**抛出去**，
    // 而 `this.world = world` 在它**之后**才执行——所以失败时 `this.world`
    // 一个字都没动过。这不是巧合，是这一段的**结构**保证的（见 test:qol 的断言）。
    $('inkImportFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      void this.qol.runOnce('inkBtnImport', async () => {
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
        this.hidePersonCard();
        // Q13：最近看过属于上一个世界，导入也要清空。
        this.qol.clearRecent();
        this.dirty = true;
        // Q21：刚导入的世界与文件逐字一致 ⇒ 没有未保存的变化。
        this.qol.resetDirty();
        this.notify('世界已导入');
        this.syncWorldControls();
        this.syncWorldInfo();
        this.qol.syncToolState();
        this.qol.syncUndoState();
        this.refreshSlots();
        this.refreshTerritory();
        this.refreshChronicle();
        this.refreshNecrology();
        this.refreshThreeRealms();
        this.refreshBusanzi();
      } catch (error) {
        // Q22：说清「哪一步坏了」而不是只写 console。
        // ⚠️ Q23：这里**只**发一条提示——`this.world` 上一行都没碰过，
        //    玩家原来的世界原封不动。
        this.notify('导入失败 · 文件不是有效存档', 6000);
      }
      e.target.value = '';
      });
    });
    // Q40：见上面「重新开天」那一段的说明（两个 destructive 按钮同一套文案与确认）。
    $('inkBtnClear').addEventListener('click', () => {
      this.qol.guardDiscard('当前世界有尚未保存的变化，仍要随机开一局新天？', () => {
        void this.qol.runOnce('inkBtnClear', async () => {
          this.newWorld(this.presetKey, (Math.floor(Math.random() * 0xffffffff) >>> 0));
          $('inkSeedInput').value = String(this.seed);
        });
      });
    });
    // Q8：视界附近那颗「关闭视界」。它只调**既有**的关闭逻辑。
    const closeView = $('inkBtnCloseView');
    if (closeView) closeView.addEventListener('click', () => this.closeRealmView('button'));
    // ⚠️ Q31 的「? 帮助」按钮**不在这里绑**：`ui/qol.js` 的 `bind()` 已经绑了
    //    （`openHelp` 归它管，绑两处只会让一次点击跑两遍同一个幂等操作）。

    this.refreshSlots();
    this.refreshRecent();
    $('inkSeedInput').value = String(this.seed);
    this.setSpeed(this.speedIndex);
    this.setBrush(this.brushIndex);
    // Q5 / Q6 / Q7 / Q4：开机时把三处状态同步到位（工具名 / 档位文字 / 撤销可用性）。
    this.qol.syncToolState();
    this.qol.syncSpeedState();
    this.qol.syncUndoState();
    this.syncWorldInfo();
  }

  togglePause() {
    this.speedIndex = this.speedIndex === 0 ? 2 : 0;
    this.setSpeed(this.speedIndex, true);
  }

  /**
   * 切档。**唯一入口**——数字键、底栏按钮、`togglePause`、`update` 都走它，
   * 所以「键盘切档」与「UI 按钮」不可能脱节（Q6）。
   *
   * @param {number} index 0..5
   * @param {boolean} announce Q6：玩家**主动**切档时给一次轻量反馈。
   *   ⚠️ 程序化调用（读档后同步、测试里的 `setSpeed(0)`）**不要**传 true，
   *      否则世界每跑一段就自己弹一句「岁月 · 疾」——那是噪音，不是反馈。
   */
  setSpeed(index, announce = false) {
    const before = this.speedIndex;
    this.speedIndex = Math.max(0, Math.min(TIME.speeds.length - 1, index));
    document.querySelectorAll('#inkSpeedBar [data-speed]').forEach((el) => {
      el.classList.toggle('on', Number(el.dataset.speed) === this.speedIndex);
    });
    $('inkBtnPause').classList.toggle('on', this.speedIndex === 0);
    // Q6：档位的**文字**状态（`岁月 · 疾` / `岁月已停`）与暂停按钮的文案。
    this.qol.syncSpeedState();
    if (announce && this.speedIndex !== before) {
      const speed = TIME.speeds[this.speedIndex];
      this.notify(this.speedIndex === 0 ? '岁月已停' : `岁月 · ${speed.label}`, 1800);
    }
  }

  setBrush(index) {
    this.brushIndex = Math.max(0, Math.min(LIMITS.brushSizes.length - 1, index));
    $('inkBrushRange').value = String(this.brushIndex);
    $('inkBrushLabel').textContent = `半径 ${this.brushRadius}`;
    // Q5：笔刷半径是「当前工具状态」的一部分（`抬山 · 12` 里的那个数）。
    this.qol.syncToolState();
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

  refreshSlots() { return refreshSlotsPanel(this); }

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
    const bounds = accessBounds(world);
    const radius = this.brushRadius;
    if (!canAccess(world, x, y) || (world.mapProgress && world.mapProgress.stage < 3 &&
      (x-radius < bounds.x0 || x+radius > bounds.x1 || y-radius < bounds.y0 || y+radius > bounds.y1))) {
      this.notify('此处尚未开放 · 请拓展地图或将笔刷移入开放区域', 2400); return;
    }

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
    // ── Q21：**玩家真的改了世界** ⇒ 世界与磁盘上的存档不再一致 ──────────
    // ⚠️ 这一行是 Q21 未保存保护的**主要触发点**。原先它不存在：`markDirty` 只在
    //    `newWorld()`（开天）与 `undo()` 里各响一次，而开天之后玩家最常干的两件事
    //    ——雕刻地形、施放神力——**一条都不置 dirty**。后果是「存档 → 雕了半天
    //    → 点重新开天」静默丢掉全部改动：`needsDiscardConfirm()` 恒为 false，
    //    确认条根本不出现，玩家连「要丢东西了」都不知道。这类漏接线**不报错**，
    //    只是保护看起来装好了、实际是空的。
    // ⚠️ 拖拽笔刷会反复调到这里，但 `markDirty` 只在**状态真的翻转**时才写 DOM
    //    （见 `ui/qol.js` 的 `markDirty`：`if (changed) api.syncUndoState()`），
    //    所以按住刷子拖两秒也只在第一下付出代价。
    // ⚠️ 刻意**不**发 `'advance'`：时间流逝是这个世界持续在做的事，把它也算成
    //    「未保存的工作」，确认条就会几乎每次开天都弹，玩家很快学会闭眼点掉
    //    ——保护反而失效。受保护的是玩家**主动做过的编辑**。
    //    分桶只为可读：`terrain` / `intervention` 都落在 `DIRTY_EVENTS` 里，
    //    置的同样是「脏」这一个事实。
    this.qol.markDirty(CAUSAL_TOOL_IDS.includes(tool.id) ? 'intervention' : 'terrain');
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
    if (world.mapProgress && world.mapProgress.stage < 3 && points?.some(([x, y]) => !canAccess(world, x, y))) {
      this.notify('视界不能越过未开放区域 · 请先拓展地图', 2600); return;
    }
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
    // 所以门控从「只认 viewUpper」扩成「认视界工具里任一个」（`ui/realmView.js` 的 `isViewTool`）。
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
    // ⚠️ **目标位面从 `ui/realmView.js` 的 `viewPlaneForTool` 取**（D6-2 工程包 B1）：
    //    这条缝连的是玩家此刻正在看的那一界——看上界就开上界缝，看幽冥就开幽冥缝。
    //    在别处再写一遍三目会让「加第三界」变成改 N 处、漏一处。
    const riftPlane = viewPlaneForTool(tool.id);
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
        + (sel.capped ? `　已按 ${Math.round(VIEW_MAX_AREA_FRAC * 100)}% 上限收窄` : '')
        + riftNote + ghostNote, 2800);
    }
    // ── 跨界追迹（D8-G）────────────────────────────────────────
    // 玩家若刚点开一条「已入上界 / 已落幽冥」的记挂（`traceTarget` 非空），
    // 而他此刻划开的窗**覆盖**了那个人 ⇒ 在他身上落一个轻墨环（step 6）。
    // ⚠️ 这是**加法**：不改上面任何一句，也不碰 `openRifts`——
    //    「引路，不代替玩家开门」；开缝与否只由玩家这一拖决定。
    this.maybePulseTraceTarget?.();
    this.dirty = true;
  }

  /**
   * 把一条自由划选路径归一成合法的视界区域（取整 / 钳界 / 面积上限）。
   *
   * 真正的几何在 `ui/tools.js` 的 `normalizeRegion`（纯函数、不碰 DOM）——
   * 放在那里是为了让测试能在 node 里断言它（本文件依赖 DOM，node 里 import 不了）。
   * 这里只是把 `this.world` 与面积上限（`ui/realmView.js` 的 `VIEW_MAX_AREA_FRAC`）接上去。
   *
   * 判据（替代旧 `normalizeSelection` 末尾那条单格守卫）：
   *   · 去重后不足 3 点 ⇒ null（一次点击 / 一条直线都不构成「一片山河」）；
   *   · 面积 < `REGION_MIN_AREA` ⇒ null。
   * 那条旧守卫判的是**矩形跨度**，对自由形状已无意义——留着就是「看起来在防、
   * 实际不防」的死守卫，已随 `normalizeSelection` 一起删掉。
   */
  normalizeRegion(points) {
    return normalizeRegionGeometry(points, this.world, VIEW_MAX_AREA_FRAC);
  }

  /**
   * D8-F：这一次抬手是「短点击窗内检视」还是「拖动重画视界」？
   *
   * 判据**两个条件同时成立**（蓝图 §D8-F）：
   *   · 位移 < `VIEW_CLICK_PX` 像素（手基本没动 ⇒ 是一次点击，不是拖拽）；
   *   · 抬起点仍落在**已开的窗**内（`this.selection` 非空且 `regionContains`）。
   *
   * ⚠️ **两个都要**，少一个都会误判：
   *   · 只看位移 ⇒ 在窗**外**点一下也会去检视——可窗外根本没有「那一界」的东西，
   *     玩家会看到一个空卡，还会**失去**「点一下收起视界」这条既有出口；
   *   · 只看「在窗内」 ⇒ 在窗内**拖一大片**会被当成点击 ⇒ 视界再也重画不了。
   * ⚠️ 位移用**屏幕像素**（`VIEW_CLICK_PX` 是唯一真源）：缩放到很远时一格只有
   *    零点几像素，用格数会把「点一下」判成「拖了半张图」。
   * ⚠️ `this.selection` 空（还没开窗）⇒ 一律 false，走原来的提交路径
   *    （点一下仍是「拒绝并说清下一步」，见 `commitSelection` 的退化分支）。
   *
   * @returns {boolean}
   */
  isRealmInspectClick() {
    const view = this.getRealmViewState();
    if (!view.open) return false;
    if (!Number.isFinite(this.pressX) || !Number.isFinite(this.pressY)) return false;
    const moved = Math.hypot(this.pointer.x - this.pressX, this.pointer.y - this.pressY);
    // Q42：拖动 / 点击的阈值**复用** `VIEW_CLICK_PX`（6px）这一条既有规范——
    // 判据走 `qolState.isClickWithinDrag`，不在这里另立一个 magic number。
    // 语义与原来的 `moved >= VIEW_CLICK_PX` 完全等价（都是「屏幕像素」口径）。
    if (!this.qol.isClickWithinDrag(moved, VIEW_CLICK_PX)) return false;
    const t = this.hoverTile;
    if (!t) return false;
    return view.region.contains(t.x, t.y);
  }

  /**
   * D8-F：窗内穿透检视 —— 点开「另一界」里 `(x, y)` 附近的那件东西。
   *
   * ⚠️ **为什么不复用 `inspectAt()`**（蓝图 §D8-F 明令）：凡间检视卡里塞着
   *    记挂按钮 / 人物传记 / 关系图 / 家世谱系 / 地上无主之物——全是**凡间专有**。
   *    直接拿来检查一只鬼修，会制造一串 `if (plane === ...)`。所以这里另走一条：
   *    数据从 `ui/realmInspector.js`（**只读**、纯函数）拿，DOM 复用同一个
   *    `#inkInspect` 面板与同一套 `.inspect-*` 样式——**面板复用，语义不复用**。
   *
   * ⚠️ **绝不写 `this.selected`**：那个字段被 `render()` 用来在**凡间**画高亮环
   *    （`units.drawSelection`）。把幽冥坐标塞进去，会在凡间同坐标处画一个
   *    莫名其妙的圈——正是「窗内不许操控」要防的那种越界。
   *
   * ⚠️ **窗内不许做的事**（蓝图 §D8-F 末段）：改属性 / 传功 / 记挂幽冥鬼 /
   *    施神力 / 操控上界单位。本方法只往面板里写文字，**没有任何按钮**——
   *    「D8 仍然是观察」这句话因此不是靠自觉。
   *
   * @param {number} x 世界格 x（窗内）
   * @param {number} y 世界格 y
   */
  inspectRealmAt(x, y) {
    const plane = this.getRealmViewState().targetPlane;
    if (this.g1.inspectCanvas(this.pointer.x, this.pointer.y, plane)) return;
    return this.inspectPlaneAt(plane, x, y);
  }

  /** Inspect the World identity carried by a submitted 3D instance. */
  inspectPlaneSubject(planeId, ref) {
    if (!['mortal', 'upper', 'nether'].includes(planeId)) return;
    ref ||= {};
    const world = planeId === 'mortal' ? this.world : this.world?.[planeId];
    if (ref.kind === 'entity' && ref.entityContainer !== 'wraiths') {
      const entity = world?.entities.find(e => e.id === ref.entityId);
      if (entity && ['human', 'cultivator', 'ghost'].includes(entity.sp)) return this.g1.open({ plane: planeId, entityId: ref.entityId });
    }
    const picked = resolvePlaneSubject(world, planeId, ref);
    const card = planeSubjectInspectRows(picked, {
      day: this.world?.day || 0, watch: this.world?.watch,
      arrivedLog: world?.arrivedLog, planeLabel: planeLabel(planeId),
    });
    const panel = $('inkInspect');
    if (!panel) return;
    const text = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    const head = card?.head || `${planeLabel(planeId)} · 检视`;
    const rows = card?.rows || [['此处', '所选对象已不在当前世界']];
    panel.dataset.plane = planeId;
    panel.dataset.subjectKind = ref.kind;
    panel.dataset.subjectId = String(ref.entityId ?? ref.artifactId ?? ref.siteId ?? ref.leylineId ?? ref.riftId ?? ref.houseKey ?? ref.settlementId ?? '');
    // Q37：与 `inspectAt` / `inspectPlaneAt` 同一枚短标签（真实位面，不猜窗口）。
    panel.innerHTML = `<div class="inspect-head">${text(head)}`
      + `<span class="plane-tag">${planeLabel(planeId)}</span>`
      + '<button class="ink-x" id="inkInspectClose">×</button></div>'
      + rows.map(([k, v]) => `<div class="inspect-row"><span>${text(k)}</span><b>${text(v)}</b></div>`).join('');
    panel.classList.add('on');
    $('inkInspectClose').addEventListener('click', () => panel.classList.remove('on'));
    return picked;
  }

  /** Route a pick by its actual plane; cross-realm inspection never selects a mortal cell. */
  inspectPlaneAt(planeId, x, y) {
    if (planeId === 'mortal') return this.inspectAt(x, y);
    if (planeId !== 'upper' && planeId !== 'nether') return;
    if (!canAccess(this.world, x, y)) { this.notify('此处尚未开放 · 请先拓展地图', 2400); return; }
    const nether = planeId === 'nether';
    const plane = {
      plane: planeId,
      world: (this.world && this.world[planeId]) || (nether ? this.nether : this.upper),
      label: planeLabel(planeId),
    };
    const picked = pickRealmSubject(plane.world, plane.plane, x, y);
    const card = realmInspectRows(picked, {
      day: this.world ? this.world.day : 0,
      watch: this.world ? this.world.watch : null,
      arrivedLog: plane.world ? plane.world.arrivedLog : null,
      planeLabel: plane.label,
    });
    const head = card ? card.head : `${plane.label} · 格 (${x}, ${y})`;
    // 命中不到东西**也要发声**（同 `commitSelection` 的「不许静默」纪律）：
    // 静默地什么都不做，玩家会以为「点击没反应 / 工具坏了」。
    const rows = card ? card.rows : [['此处', '窗内无可检视之物']];
    const panel = $('inkInspect');
    if (!panel) return;
    // Q37：标出**这一格真正属于哪一界**（读的是检视器自己的 `planeId`，
    // 不是「当前开着哪扇窗」）。窗内检视恒非凡间，所以这个标签必然与凡间那张卡不同。
    panel.dataset.plane = planeId;
    panel.innerHTML = `<div class="inspect-head">${head}`
      + `<span class="plane-tag">${plane.label}</span>`
      + '<button class="ink-x" id="inkInspectClose">×</button></div>'
      + rows.map(([k, v]) => (k === '@note'
        ? `<div class="inspect-note">${v}</div>`
        : `<div class="inspect-row"><span>${k}</span><b>${v}</b></div>`)).join('');
    panel.classList.add('on');
    $('inkInspectClose').addEventListener('click', () => panel.classList.remove('on'));
  }

  inspectAt(x, y) {
    // Q35（BACKLOG #15）：整数守卫。**与正式拾取同一套取整规则**——
    // `render/camera.js` 的 `pick()` 对世界坐标用的是 `Math.round`
    // （矩形分支与立体分支都是），所以这里也必须是 `Math.round`。
    //
    // ⚠️ 为什么非加不可：实体的 `x` / `y` 是**连续坐标**，把浮点直接喂进
    //    `world.idx(x, y)`（`y * w + x`）会算出**非整数索引** ⇒ `world.height[i]`
    //    是 `undefined` ⇒ 面板里的 `.toFixed()` 抛 `TypeError`、**整页脚本中断**。
    //    这条路径**不报错、不 NaN**，只是把整页弄死（本仓 2026-09 实测踩过）。
    // ⚠️ 非有限值（NaN / Infinity）**直接拒绝**，而不是兜底成 0——
    //    兜底会把「一次坏调用」变成「安静地检视了 (0,0)」。
    const pt = this.qol.inspectPoint(x, y);
    if (!pt) return;
    x = pt.x;
    y = pt.y;
    if (!this.world.inside(x, y)) {
      // Q3：**不许静默返回**。玩家点了一下却什么都没发生，只会以为工具坏了。
      this.notify('此处已出图外 · 点回地图上再看', 2400);
      return;
    }
    if (!canAccess(this.world, x, y)) { this.notify('此处尚未开放 · 请先拓展地图', 2400); return; }
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
      if (!(e.hp > 0) || !canAccess(world, e.x, e.y) || Math.hypot(e.x - x, e.y - y) >= 5) continue;
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
    // Q37：把**真实位面**标在头上（本方法只服务凡间，所以恒为「凡间」）。
    // ⚠️ 标签读的是**检视器自己的位面**，不是「当前开着哪扇窗」——
    //    窗内检视（`inspectPlaneAt`）会把它改成上界 / 幽冥。
    panel.dataset.plane = 'mortal';
    panel.innerHTML = `<div class="inspect-head">格 (${x}, ${y})`
      + '<span class="plane-tag">凡间</span>'
      + '<button class="ink-x" id="inkInspectClose">×</button></div>'
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
   *   · 当前工具是**视界工具**（`ui/realmView.js` 的 `VIEW_TOOL_IDS`：`viewUpper` 或 `viewNether`）。
   *
   * ⚠️ 为什么两个都要：`selectTool` 切走工具时会清 `this.selection`（关闭路径①），
   * 但**读档 / 换世界**那条路径会直接把 `selection` 置空而工具不变；
   * 反过来，工具是视界工具但还没划开时 `selection` 是 null。
   * 只看一个都会在某个过渡帧上误判——而误判的后果是裂缝在「窗口没开」时
   * 偷偷推进（用户第 1 条要的正是「只在开启视界时有效」）。
   *
   * ⚠️ **「能看幽冥」不等于「放宽这条判据」**：两个视界工具都能开窗，
   * 所以判据从「只认 viewUpper」扩成「认视界工具里任一个」（`isViewTool`）；
   * 但 `selection` 那一半**一格都不许松**——退化成「有工具就算开着」会让
   * 裂缝在没开窗时照常推进，正是这条契约要防的事。
   *
   * 单独抽成方法而不是把条件内联进 `update`：①测试可以直接调它，
   * 不必去戳 `update` 那一大坨；②读代码时「裂缝什么时候走」一眼可查。
   *
   * @returns {boolean}
   */
  riftViewOpen() {
    return this.getRealmViewState().open;
  }

  getRealmViewState() {
    return getRealmViewState({ selection: this.selection, toolId: this.toolId });
  }

  /**
   * 当前视界该看的那一界。`viewUpper` → 上界，`viewNether` → 幽冥。
   *
   * 返回 `{ plane, world, terrain, label, clearDirty }`：
   *   · `plane` —— 位面 id（`'upper'` / `'nether'`）。D8-C 起事件路由按它分流；
   *   · `world` / `terrain` —— 贴图与画人与宗门用的那一界；
   *   · `label` —— 玩家可见文案里的界名（「上界」/「幽冥」）；
   *   · `clearDirty` —— 把这一界的「需要重绘」标记清掉（与 `upperDirty` /
   *     `netherDirty` 一一对应，避免在绘制层里再判一次工具）。
   *
   * ⚠️ 「工具 → 哪一界」的判据在 `ui/realmView.js` 的 `viewPlaneForTool`（**唯一**落点）；
   *    本方法只负责把那一界**挂在本实例上的对象**接上去。散着写
   *    `toolId === 'viewNether' ? ... : ...` 会让加第三界变成改 N 处、漏一处，
   *    而漏掉那处**不报错**（视界照常开，只是贴着另一界的地形）。
   */
  viewPlane() {
    const plane = this.getRealmViewState().targetPlane || 'upper';
    const nether = plane === 'nether';
    return {
      plane,
      world: nether ? this.nether : this.upper,
      terrain: nether ? this.netherTerrain : this.upperTerrain,
      label: planeLabel(plane),
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
      if (fired.mapProgress) {
        this.terrain?.invalidate(); this.dirty = true; this.qol?.markDirty('terrain');
        syncMapProgress(this); this.notify('山河渐展 · 新区域已开放', 2600);
      }
    }
    return fired;
  }

  update(dt) {
    // A brush transaction sees a stable world. Keep the chosen speed; do not accrue catch-up time.
    this.render3d?.flushStroke?.();
    const editingTerrain = !!this.render3d?.stroke;
    const world = this.world;
    if (!world) return;

    // ── 表现层真实时间（D7-C）────────────────────────────────
    // 镜头补间与落点墨环都走**真实时间**（秒），与游戏倍速 / 暂停**无关**：
    // 拉到「飞」速镜头动画的真实时长不变，暂停世界时墨环也照常播完。
    // ⚠️ 必须放在下面 `paused` 判断**之前**——它们不是模拟的一部分，
    //    放进去会变成「暂停时镜头卡在半路」。
    this.camera.update(dt);
    updateFocusPulses(this.focusPulses, dt);
    // 追迹墨环（D8-G）同款真实时间：暂停世界也照常播完。
    updateFocusPulses(this.tracePulses, dt);
    // 真实时间秒：战争线的「呼吸 / 断裂」相位吃它（同相机补间一样与游戏倍速无关）。
    this.clock += Number.isFinite(dt) ? dt : 0;

    // ── 表现事件 → FX（D7-D / D8-C 多位面）──────────────────
    // 每帧把**三界**本帧积累的 transient 事件抽干、转成短命特效。
    // ⚠️ 必须每帧收（每个队列有 256 上限，攒着会被顶掉）；且走真实时间
    //    （`stage.update` 与 `paused` 无关）。事件只描述「发生了什么」，不参与模拟。
    // ⚠️ 收队列这一步收进 `PresentationStage`——本文件**不**写三遍
    //    `drainRuntimeEvents(world / world.upper / world.nether)`（那是「加一界改 N 处」）。
    this.stage.ingestWorlds(world).update(dt);

    const speed = TIME.speeds[this.speedIndex].mult;
    const paused = this.speedIndex === 0 || editingTerrain;
    const days = paused ? 0 : TIME.baseDaysPerSecond * speed * dt;
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
    if (this.autoSaveAccum >= 90 && !editingTerrain) {
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
    // Q8：视界窗口与「关闭视界」按钮同帧同步（判据都是 `this.selection`）。
    this.syncCloseViewBtn();
    if (this.render3d?.render(now)) return;
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
    ctx.save();
    this.camera.clipAccess(ctx);
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
    // ⚠️ 与 `render/realmViewLayer.js` 的 `drawRiftBorder` 是两回事：那个画的是
    //    **视界窗口**边缘的缝（UI 提示），这个画的是地图上**真实存在**的裂缝实体。
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
    // ── FX 表现层（D7-D / D8-C 多位面）──────────────────────
    // 画在实体 / 火光**之上**、标签**之下**：特效属于「此刻的舞台效果」，
    // 但地名与人物名仍要能读清（标签盖在特效上）。
    // ⚠️ 这里只画**凡间**那一份（`'mortal'`）；上界 / 幽冥的 FX 由视界窗
    //    在自己的裁剪区内画（见下面 `drawRealmView` 的 `stage` 参数）。
    this.stage.drawPlane('mortal', ctx, this.camera, world);
    this.units.drawLabels(ctx, this.camera, world);

    // ── 表现叠层：落点墨环（D7-C）────────────────────────────
    // 画在标签**之上**：它是「此刻的反馈」，压在所有地图元素上面才读得出来。
    // 与实体层一样每帧重绘（墨环走真实时间，不在地形位图里）。
    drawFocusPulses(ctx, this.camera, world, this.focusPulses);

    // ── 表现叠层：活跃战争线（D7-F）──────────────────────────
    // 「现在地图哪儿正在打？」——只在**观察某家宗门**或**玩家打开战争显示**时画，
    // 默认一条都不画（否则几十个势力会变成蜘蛛网）。纯表现，不写世界、不抽 RNG。
    drawWarLines(ctx, this.camera, world, {
      activeSectId: this.focusedSectId,
      showAll: this.showWarLines,
      pulse: this.clock,
    });

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

    ctx.restore();

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
    // 看哪一界由 `viewPlane()` 按当前工具（viewUpper / viewNether）决定；
    // 裁剪 / 贴图 / 边框全在 `render/realmViewLayer.js`（D8-B 拔出去的）。
    const view = this.getRealmViewState();
    if (view.open) {
      const plane = this.viewPlane();
      drawRealmView(ctx, this.camera, this.units, this.world, view.region, plane, now, this.stage);
      // ── 追迹墨环（D8-G）────────────────────────────────────
      // 「你记挂的那个人出现在窗里了」的那一点反馈。**必须画在窗之后**：
      // 主链的 `drawFocusPulses`（上面那一处）在窗**之前**，落点会被窗盖掉。
      // ⚠️ 用 **`plane.world`**（那一界）取高程，与窗内实体同口径 ⇒ 墨环精确套住他；
      //    用凡间 `world` 会在立体视图下与那一界的人错开一个高差。
      // ⚠️ 只在**开着窗**时画：`tracePulses` 只在「划开的区域覆盖目标」那一刻生一个，
      //    寿命 1.2 秒，窗一关就不再画（避免它在凡间地面上凭空浮着）。
      drawFocusPulses(ctx, this.camera, plane.world, this.tracePulses);
    }
    // 拖拽中的框只有虚线（还没成型），画在已开的视界之上，免得被盖住看不见。
    if (this.selectPath) drawSelectHint(ctx, this.camera, this.selectPath);
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
    syncMapProgress(this);
    this.g1.refresh();
    const stats = world.stats();
    const day = Math.floor(world.day);
    const year = Math.floor(day / TIME.daysPerYear) + 1;
    const dayOfYear = (day % TIME.daysPerYear) + 1;

    setTextIfChanged($('inkTimePill'), `仙历 ${year} 年 · 第 ${dayOfYear} 日`);
    setTextIfChanged($('inkSpeedPill'), `${TIME.speeds[this.speedIndex].label}速 ×${TIME.speeds[this.speedIndex].mult}`);
    setTextIfChanged($('inkFpsPill'), `${this.fps.toFixed(0)} FPS`);
    setTextIfChanged($('inkStatPeople'), String(stats.entities));
    // 凡间鬼影（D6-3 工程包 B）：**此刻**在凡间飘荡的鬼（自幽冥缝爬出来的）。
    // ⚠️ 口径只有 `wraithStats` 一份（`sim/wraiths.js`）——不在这里自己 filter
    //    `world.wraiths`（那是第二份真相，同幽冥那行 `netherGhostStats` 的理由）。
    // ⚠️ 与「生灵」**分开报**：鬼影不在 `world.entities` 里，`stats.entities`
    //    数不到它们；合成一格会让玩家以为「生灵 513」里包含鬼。
    setTextIfChanged($('inkStatWraiths'), String(wraithStats(world).alive));
    setTextIfChanged($('inkStatVillages'), String(stats.villages));
    setTextIfChanged($('inkStatFactions'), String(stats.factions));
    setTextIfChanged($('inkStatLand'), `${((stats.land / world.size) * 100).toFixed(0)}%`);
    setTextIfChanged($('inkStatPeak'), stats.peak.toFixed(2));

    const factionList = $('inkFactionList');
    const sorted = world.factions.slice().sort((a, b) => b.pop - a.pop).slice(0, 8);
    if (factionList && !this.factionListBound) {
      factionList.addEventListener('click', (ev) => {
        const row = ev.target.closest('[data-faction-id]');
        if (!row) return;
        const f = this.world && this.world.factionById(Number(row.dataset.factionId));
        if (!f) return;
        // 找宗门：镜头**滑**过去（0.85 秒），落点浮一个墨环。
        // 走 `focusOn` 而不是直接赋值——玩家一拖 / 一滚 / 按 H 就立刻接管（见 camera.js）。
        this.camera.focusOn(f.capitalX, f.capitalY, {
          zoom: Math.max(this.camera.zoom, 7),
          duration: SECT_FOCUS_DURATION,
        });
        spawnFocusPulse(this.focusPulses, f.capitalX, f.capitalY);
        // D7-F：记住「正在观察这家宗门」——有它的战事就画一条战线（见 render 里的 drawWarLines）。
        this.focusedSectId = f.id;
        this.dirty = true;
      });
      this.factionListBound = true;
    }
    if (factionList) {
      const factionSignature = JSON.stringify(sorted.map((f) => [
        f.id, f.color, f.name, f.pop, f.followers || f.pop,
        f.villages.length, f.war.size,
      ]));
      if (this.factionRenderWorld !== world || this.factionRenderSignature !== factionSignature) {
        const factionHtml = sorted.length
          ? sorted.map((f) => `<div class="faction" data-faction-id="${f.id}">`
            + `<i style="background:${f.color}"></i><span>${f.name}</span>`
            + `<b>${f.pop}</b><em>${f.followers || f.pop} 人 · ${f.villages.length} 村</em>`
            + (f.war.size ? '<u>战</u>' : '') + '</div>').join('')
          : '<div class="ink-empty">尚无聚落。用「生灵」撒下凡人，他们会自己结庐成村。</div>';
        factionList.innerHTML = factionHtml;
        this.factionRenderWorld = world;
        this.factionRenderSignature = factionSignature;
      }
    }

    // ── 仙道 ──
    const cs = world.cultivationStats();
    setTextIfChanged($('inkStatCultivators'), String(cs.cultivators));
    setTextIfChanged($('inkStatMortals'), String(cs.mortals));
    setTextIfChanged($('inkStatPeakCultivator'), cs.peakName
      ? `${cs.peakName} · ${realmLabel(cs.highest)}`
      : '尚无修士');
    setTextIfChanged($('inkStatLeylines'), String(world.leylines.length));
    setTextIfChanged($('inkStatSites'), String(world.sites.length));
    setTextIfChanged($('inkStatAscended'), String(world.ascended.length));
    // 法宝：显示「在手 + 地上」的总数，另加器灵数。
    // 只报总数看不出玩法活没活，所以器灵单独一个读数——
    // 器灵要「相伴 50 年」才出得来，它是「世界真的跑了很久」的直接证据。
    const as = artifactStats(world);
    const artifactEl = $('inkStatArtifacts');
    if (artifactEl) {
      setTextIfChanged(artifactEl, as.live
        ? `${as.live}${as.spirits ? ` · 器灵 ${as.spirits}` : ''}`
        : '0');
    }
    // 世家：家数 · 最大世代。世家是这个世界里**唯一会断绝**的东西——
    // 宗门散了还会再立，村子荒了还能再开，而一族断了就是断了。
    // 所以「传到第几代」是它最值钱的读数，光报家数看不出这件事。
    const ks = clanStats(world);
    const clanEl = $('inkStatClans');
    if (clanEl) {
      setTextIfChanged(clanEl, ks.clans
        ? `${ks.clans}${ks.maxGen ? ` · 第${ks.maxGen}代` : ''}`
        : '0');
    }
    // 大战：进行中 · 累计灭门。报这两个而不是「累计打了几场」——
    // 「正在打」是玩家能看见的当下，「灭了几家」是政治层唯一不可逆的结局。
    // 宗门散了还能再立、村子荒了还能再开、世家断了就是断了，
    // 而**战败覆灭**是宗门唯一的死法（见 sim/war.js）。
    const ws = warStats(world);
    const warEl = $('inkStatWars');
    if (warEl) {
      setTextIfChanged(warEl, ws.ongoing
        ? `${ws.ongoing} 场`
        : (ws.destroyed ? `灭 ${ws.destroyed}` : '0'));
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
    setPeriodicMarkup(bars, barsHtml);
  }

  refreshChronicle() { return refreshChroniclePanel(this); }

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
  refreshMilestones() { return refreshMilestonesPanel(this); }

  // ── 值得关注的人物（见本文件顶部的 notablePeople）────────────────
  /**
   * 活人榜。点一行 = 「找到这个人」+「看见他在哪」+「他这一生做过什么」。
   *
   * 三条规则缺一不可（见 Batch 完成条件）：
   *   · Reachability：侧栏常驻，不用先找到他才点得开；
   *   · Feedback：每行都带「为什么是他」，不是一串没有由来的名字；
   *   · Stability：纯读派生，不写世界。
   */
  refreshNotables() { return refreshNotablesPanel(this); }

  /** 点开一个**活人**：把 `compileBiography` 那一整篇摊出来 */
  showPersonCard(id) { return this.g1.open({ plane: 'mortal', entityId: id }, { focus: true }); }

  hidePersonCard() { return this.g1.close(); }

  // ── 人物局部关系图（D7-F，见 render/relationGraph.js）────────
  /**
   * 把中心人物的**一跳关系**喂给纯 SVG 生成器。
   *
   * 邻居来自 `entity.relations`（`Map<id, {type, score}>`，见 `sim/relations.js`），
   * 每个 id 解析成「在世 / 故人 / 不可考」三态——**只查现成名录，不按名字猜**：
   *   · `findEntity` 命中 ⇒ 在世（点开他的卡）；
   *   · `findDead` 命中   ⇒ 故人（点开史册传记）；
   *   · 都没有            ⇒ 不可考（点了只提示，不抛错）。
   * 纯读派生，不改世界、不抽 RNG。
   */
  buildRelationSvg(entity) { return buildRelationSvgPanel(this, entity); }

  /**
   * 关系图外圈节点的点击委托。
   * ⚠️ 绑在**常驻的 `#inkPersonDetail`**（不是被反复重建的 `#inkPersonRel`）——
   *    卡片每开一次就 `panel.innerHTML = …` 重排一次，绑在子容器上的监听会被一起丢掉，
   *    而且**不报错**，只是点了没反应（本仓记录过的故障类）。
   */
  bindRelationGraph() { return bindRelationGraphPanel(this); }

  // ── 天道记挂（D7-E，见 sim/watch.js）────────────────────────
  /**
   * 「天道记挂」子区。它是**玩家的观察列表**，不是世界规律——
   * 所以这一块**只读** `world.watch`、只做增删与导航，从不写回模拟。
   *
   * 三种状态各有各的出口（判据顺序见 `resolveWatch`）：
   *   · 在世 / 异魂占身 → 镜头走 C 包的 focus + 墨环 + 打开人物卡；
   *   · 已入上界       → 就地摊出「上界现况」（`upperFateOf`），**不移动镜头**
   *                      （上界那具身子不在凡间这张图上，挪过去只会看见空山）；
   *   · 故人           → 打开史册传记，**不移动到不存在的人身上**。
   *
   * 标题上那颗红点是「有没有未读的重大事件」（`watchHasNews`）——
   * 点开这一块即标为已读（`markAllWatchRead`）。第一版刻意**不造通知中心**。
   *
   * ⚠️ 纯读 + 一个只增的 `lastReadDay`：挂 2.5 秒定时器刷新，不抽 rng、不动世界。
   */
  refreshWatch() { return refreshWatchPanel(this); }

  /** 点一行「记挂」：按状态导航（见 refreshWatch 的三种出口）。**纯导航 + 标已读**。 */
  openWatchRow(key) { return openWatchRowPanel(this, key); }

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
  refreshThreeRealms() { return refreshThreeRealmsPanel(this); }

  /** 上界那一块：人口 / 飞升名册（带现状）/ 上界自己的大事 */
  refreshUpperRealm(world) { return refreshUpperRealmPanel(this, world); }

  /** 幽冥那一块：魂路五路分布 / 魂池里排着谁 / 谁已经带着前世回来 */
  refreshNetherRealm(world) { return refreshNetherRealmPanel(this, world); }

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
  refreshNecrology() { return refreshNecrologyPanel(this); }

  setNecroSort(sort) { return setNecroSortPanel(this, sort); }

  /** 点开一条名录：把那个人的完整传记正文摊出来 */
  showDeadBiography(id) { return showDeadBiographyPanel(this, id); }

  hideDeadBiography() { return hideDeadBiographyPanel(this); }

  /** 下载一段文本为 .md（史册两个导出按钮共用） */
  downloadText(name, text) { return downloadTextPanel(this, name, text); }

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
  refreshBusanzi() { return refreshBusanziPanel(this); }
}

const sandbox = new Sandbox();
sandbox.boot();
window.inkbox = sandbox;
if (new URLSearchParams(location.search).get('renderer') === '3d') {
  import('./render3d/Render3DAdapter.js').then(({ Render3DAdapter }) => {
    sandbox.render3d = new Render3DAdapter(sandbox);
  }).catch(error => { console.error('Render3D:', error); sandbox.notify('3D 启动失败，继续使用 Canvas。'); });
}

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
  // 天道记挂（D7-E）：记挂的人可能在这 2.5 秒里突破 / 飞升 / 死了——
  // 状态与红点都靠这个定时器浮上来。纯读 + 只增 `lastReadDay`，不在 rAF 里。
  sandbox.refreshWatch();
}, 2500);
