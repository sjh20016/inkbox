// 水墨沙盒 · 人物传记与编年史（观察层）
//
// 转世让一个人活得比一世长（sim/reincarnation.js），法宝让一件东西活得比人长
// （sim/artifacts.js），世家让一个姓氏活得比所有人都长（sim/family.js）。
// 这一块补的是第四样：**一个人的一生被记下来**——否则几百年跑过去，
// 世界里只剩下地形、人口和一个 400 条的滚动编年史，
// 「那个人到底经历过什么」谁也答不上来。
//
// ── 考古来源 ─────────────────────────────────────────────
//   reports/migration/biography.md                       本模块的规格书（逐条对照）
//   src/observation/BiographyCompiler.js:8-205            编译骨架、阈值、8 段文案模板
//   src/systems/narrativeSystem.js:36-73                  addPersonalLog（个人事件流）
//   src/systems/historyCompressionSystem.js:1-4, 53-81    PERMANENT_TYPES 与各表上限
//   src/ui/panels/chroniclePanel.js:5-43                  编年史面板的筛选与长度上限
//   src/systems/chronicleExportSystem.js:49-50            导出文件名规则
//   src/observation/LineageStoryBuilder.js:19-46          **反面教材**（6 个输出键里 4 个恒空）
//
// 规格书里最重要的两条前置结论，直接决定了这里怎么写：
//   · 主线那 6 个模块（CenturyReelBuilder / LineageStoryBuilder /
//     ObservationDigestBuilder / AnomalyArchive / ThreeBeatNarrativeBuilder /
//     claimEvidenceValidator）**只被构造、从未被消费**，是死代码。
//     所以本模块不移植它们的结构；lineageStory 是**重写**，不是照抄。
//   · 真正在跑的是「传记导出」与「编年史面板」这两条线，它们的阈值与模板
//     才值得逐字照抄。下面凡是标了 [照抄] 的地方，数字都来自规格书原文。
//
// ── 结构性差异：沙盒没有人物个人事件流（规格书 §8）──────
// 主线把「一个人的一生」拆成四条**人物级**流（log / lifeEventLedger /
// fateHistory / majorHistory），再从一个世界级 state 上编译传记。
// 沙盒只有一条**世界级**的 `world.chronicle`（400 条滚动窗口，World.js:309-312），
// 而且它记的是「世界发生了什么」，不是「这个人经历了什么」。
// 从编年史里按 `entity.name` 反查人物是脆的——重名即错，而且不会报错，
// 只会把别人的事迹安到另一个人头上。
// 所以这里新增第二条流：**`entity.log[]`**，与主线 `addPersonalLog` 同构。
// 本模块负责**写** `entity.log`，以及从 `entity.log` + 世界状态**读**出传记。
//
// ── 需要外部接线什么（本模块自己不碰任何别的文件）──────────
//
// **接线一：`src/inkbox/sim/cultivation.js` 的 `initEntity()`**
//   在 `entity.heritageM = null;`（约 :164）之后加一行：
//     `entity.log = [];`
//   ⚠️ 必须给初值。`heritageM` 那一列就曾经漏在 `initEntity` 外面，
//   于是 572/600 个实体身上根本没有那个键，存档写 null、读回也是 null，
//   是逐字段比对才抓出来的（见 cultivation.js:157-160 的注释）。
//   这里是同一个坑：新世界的实体没有 `log` 键、读档回来的有——
//   同一个世界两种形状，而两条路必须等价。
//   （本模块内部有 `ensureLog` 惰性兜底，但那只能救「不崩」，
//   救不了「存读档后字段不一致」。）
//
// **接线二：`src/inkbox/io/save.js`**
//   · `serializeWorld` 的实体行尾追加一列 `e.log || []`
//     （当前最后一列是 `row[56] = heritageM`，所以新列是 `row[57]`）；
//   · `restoreEntity` 里补 `log: row[57] || []`；
//   · v1 老档的 `restoreLegacyEntity` 里补 `log: []`；
//   · `SAVE_VERSION` 由 5 提到 6（并在文件头的版本表里记一笔）。
//   ⚠️ **新列一律追加在行尾**。中间插一列会把后面所有列的下标顶歪，
//   而那种错不会报错，只会让读档后的人悄悄换一副关系网（save.js:39-43 的教训）。
//   ⚠️ 体积：单条约 200 字节（text 上限 80 字），单人上限 32 条。
//   **实测**（scripts/_bioprobe.mjs，中堂 288×180）：60 年 0.24 MB（2089 条 / 1328 人）、
//   300 年 0.49 MB（3821 条 / 1400 人）。理论上限（每人 32 条全满）约 6 MB，
//   但实测远达不到——多数实体是只留一两条的凡人。
//   若长卷（384×240）存档逼近 localStorage 的 5 MB，**只调 `LOG_CAP` 这一个常量**。
//
// **接线三：`src/inkbox/main.js`**
//   · **写入口（不接这一步，传记永远是空的）**：在 `awaken()` /
//     `attemptBreakthrough()` / `onDeath()` / 结侣 / 拜师 / 得宝 / 开宗
//     这些地方调 `recordLifeEvent(world, entity, kind, text, opts)`。
//     本模块**不会**自己猜「谁经历了什么」——猜错比不猜更坏。
//   · **检视面板**（约 :569，`const kin = lineageOf(world, strongest);` 那一段）
//     加一段 `biographyRows(world, strongest)`，与家世同一个渲染方式。
//   · **编年史面板** `refreshChronicle()`（约 :877）把
//     `this.world.chronicle.slice(-40).reverse()` 换成
//     `filterChronicle(world, { limit: 40 })`（行为一致，但多了 tag 筛选）。
//   · 两个导出按钮分别接 `compileBiography` / `exportChronicle`，
//     落盘时用规格书 §3.4 的文件名规则（本模块的 `biographyFileName` 只给名字，
//     不碰 Blob / URL / document——一旦这里摸 window，长测与探针就再也跑不到这条路径）。
//
// ⚠️ 一条**边界**，接线方必须知道：`world.entities` 只装活人（life.js:288 的清理
// 把死者就地压掉了），所以「给已故者导出传记」这条路**走不通**——
// 面板上点不到死人，`findEntity` 也查不到。个人日志本身是够的
// （`recordLifeEvent` 抱引用就能给刚死的人写最后一笔，探针就是这么干的），
// 缺的是**一份逝者名录**。本模块不提供它（那要新增 world 级字段与存档列，
// 是接线方的决定）；在那之前，传记服务的是「此刻还活着的人」。
//
// ── 三条刻意的设计约束（每一条都是被这个项目咬过的地方）──────
//
// **一、不碰主随机流。**
// `Life.rng` 是全世界共用的一条流，多抽一次签，几百年后的世界就整个漂到别处去。
// 所以本模块**一次 `rng()` 都不调**——而且比 family.js 更彻底：
// family.js 还需要一个 `hash01` 来做「按人抽签但不消耗随机流」的事
// （血脉继承、挑双亲），本模块**连哈希都不需要**，因为这里没有任何一件事
// 需要「按人掷一次签」：所有顺序都由**完全确定的排序**决定
// （分数降序 → 天数升序 → 文本/id 升序），所有筛选都是纯阈值。
//
// ⚠️ 所以这里**刻意不带 `hash01`**。带一个永远不被调用的哈希函数，
// 就是这个项目一直在猎的那种「字段存在 ≠ 字段生效」——
// 上一次是 `equipTier`，上上次是只写不读的 `bloodline`（见 core/lore.js:132-137）。
// 将来若真需要按人掷签，再从 family.js 把那份实现搬过来（**逐位照搬**，
// 两份实现不一致的话，同一个 id 会在两个模块里得到两个不同的哈希）。
//
// 于是 `recordLifeEvent` / `compileBiography` / `filterChronicle`
// 全都是**纯派生**：只读世界、只写 `entity.log`，不改任何模拟参数。
// 探针实测：挂了传记驱动 + 每帧读面板的世界，与不挂的那一遍
// **世界指纹逐位相同、rng 调用次数完全相同**（14827450 次，一次没多）。
//
// **二、单图模型。**
// 主线到处是 `state.worlds.flatMap(w => w.cultivators)`；沙盒只有
// `world.entities` 一张图（World.js:43），宗门就是 faction（World.js:221-224）。
// 所以这里所有「找一个人」都写成 `world.entities.find(...)` / `factionById`，
// 没有位面、没有多世界、没有 `worldId` 过滤。
// 飞升的人会被移出 `world.entities`（life.js:288 的清理），
// 于是「已故 / 已飞升」一律表现为**查不到**——本模块对此的态度是
// 「留白，不硬凑名字」：写一个查不到来源的名字比留白更坏（family.js:439 的同一条规矩）。
//
// **三、只读派生，不改模拟参数。**
// 传记是**读数**，不是状态。除了 `entity.log`（它本身就是状态，要进存档），
// 本模块不写任何东西：不改 hp / level / relations / chronicle，
// 不改 rng，不改 world.day。任何一个函数被面板每帧调一万次，
// 世界轨迹也必须逐位不变。

import { APP, TIME } from '../core/config.js';
import { EXP_PER_LEVEL, daoStageName, realmLabel } from '../core/cultivation.js';
import { RELATION_LABELS, RELATION_TYPES } from './relations.js';

/** 一年多少天。**不写字面量 360**：World.record 与 TIME 必须同源，否则年份会错位 */
const YEAR_DAYS = TIME.daysPerYear || 360;

// ── 阈值（[照抄] 规格书 §2.7 / §2.8，数字一个没动）─────────
/** 每年最多留 3 条（规格书 §2.7 第 7 步） */
export const EVENTS_PER_YEAR = 3;
/** 全局最多留 90 条，`slice(-90)` 即「丢掉最早的、留最晚的 90 条」（§2.7 第 8 步） */
export const EVENTS_TOTAL = 90;
/** 每个事件源最多取末尾 2000 条（§2.7 第 2 步） */
export const SOURCE_ROW_CAP = 2000;
/** 重要关系最多 8 条，按 |score| 降序（§2.8） */
export const RELATION_CAP = 8;
/** 修行轨迹最多 16 条里程碑，`slice(-16)`（§2.8） */
export const MILESTONE_CAP = 16;
/** 编年史面板一屏多少条（§5.1 的 `slice(0, 160)`） */
export const CHRONICLE_LIMIT = 160;

/** 个人日志的条数上限。**这是本模块唯一需要按存档体积调的旋钮**（见文件头接线二） */
export const LOG_CAP = 32;
/** 单条文本上限。不截断的话一句长叙事能占掉半条存档 */
export const TEXT_CAP = 80;
/** 去重窗口：同一个语义键在这条数之内出现过就不再记 */
export const DEDUP_SPAN = 12;

/** 文本抽取全部落空时的兜底常量。**它本身等于丢弃**（规格书 §2.3） */
export const LOST_TEXT = '一段经历已佚';

/** 参与白名单（[照抄] BiographyCompiler.js:3-6，一字未改） */
const ALLOWED_ROLES = new Set([
  'actor', 'participant', 'commander', 'witness', 'victim', 'winner', 'loser',
  '亲历者', '参战者', '指挥者', '见证者', '受害者',
]);

/**
 * 四个事件源，**顺序不可变**（[照抄] §2.7 第 1 步：major → fate → life → log）。
 * 顺序决定去重时谁先占住语义键，而先占住的会被后来更高分的替换掉，
 * 所以顺序只影响「同分同长度时留谁」——但那也必须是确定的。
 *
 * ⚠️ 沙盒目前只有 `log` 一源真的有数据（见文件头「结构性差异」）。
 * 另外三源是**给未来留的接口**：读不到就当空数组，不报错、不影响 log。
 * 这样写而不是直接砍成单源，是因为规格书明确要求照抄四源合流骨架；
 * 而且接线方哪天要接 `entity.lifeEventLedger`，这里不用改一行。
 */
const EVENT_SOURCES = Object.freeze(['major', 'fate', 'life', 'log']);
const SOURCE_ROWS = Object.freeze({
  major: (e) => e.majorHistory,
  fate: (e) => e.fateHistory,
  life: (e) => (e.lifeEventLedger && e.lifeEventLedger.recent) || e.lifeEventLedger,
  log: (e) => e.log,
});
/** 各源的基准分（[照抄] §2.6：major=80 / fate=72 / life=60 / log 及一切未知源=35） */
const SOURCE_BASE = Object.freeze({ major: 80, fate: 72, life: 60, log: 35 });
const SOURCE_DEFAULT_BASE = 35;

/** 加分关键词（[照抄] §2.6，13 个） */
const BOOST_RE = /突破|飞升|陨落|成名|掌门|祖师|道祖|收徒|结侣|决裂|夺脉者|守城|献祭|净化/;
/** 减分关键词（[照抄] §2.6，4 个） */
const DAMPEN_RE = /日常|路过|抵达路线节点|普通交锋/;

/** 修行轨迹认这些 kind 当里程碑 */
const MILESTONE_KINDS = new Set(['awaken', 'breakthrough', 'dao', 'tribulation', 'ascend', 'daotrial']);

/**
 * 编年史的 kind → 面板 tag。
 *
 * 主线的 tag 是 `narrativeSystem.js:5-20` 那 14 个，UI 上只开 8 个按钮
 * （index.html:76：all/world/person/sect/battle/cultivation/nether/chaos）。
 * 沙盒的 kind 是另一套小写词（`world.record` 的第二个参数），所以这里做一层映射。
 *
 * ⚠️ 认不出来的 kind 一律落到 `world`——这正是主线的默认规则
 * （`narrativeSystem.js:141`：不是 marked/epic 就是 world）。
 * 反过来写成「认不出就丢」的话，接线方以后新加一种 kind，
 * 那条记录会**从编年史面板上凭空消失**，而且不报错。
 */
export const KIND_TAG = Object.freeze({
  // ── 有意归到 `world` 的世界级事件 ──
  // 这 7 个 kind 与下面导出的 `WORLD_KINDS` 白名单必须**逐字一致**：
  // 白名单存在的意义就是把「故意归 world」与「忘了配」分开，
  // 两边一旦漂移，测试就再也分不清漏配了。
  world: 'world', settle: 'world', disaster: 'world', genesis: 'world',
  site: 'world', busanzi: 'world', crisis: 'world',
  // 空间裂缝**开启**（`sim/rifts.js` 的开缝循环，2026-09-22 加）。
  // 归 `world` 而不是 `person`：开缝是玩家在世界**边缘**划出的一道口子，
  // 它不属于任何一个人（与 `rift-lost` 正相反——那一个是「某个人被吞了」）。
  // 两者同源不同类，所以一个落 world、一个落 person。
  rift: 'world',
  // ⚠️ `cave` / `secret` 曾经在这里，但**全仓没有任何写入方**（死映射）。
  // 它们尤其危险：`sites.js` 里 `site.kind === 'cave' | 'secret'` 是
  // **站点自己的 kind，另一个命名空间**；编年史里写的一律是 `'site'`
  // （sites.js 六处全是 `'site'`）。留着会让下一个读这段代码的人以为
  // 「洞府 / 秘境的编年史条目已经归类好了」，其实永远不会命中。
  clan: 'person', relation: 'person', karma: 'person', ascend: 'person',
  // `death` / `envoy` / `contest` / `beast` 都发生在**某一个具体的人**身上，
  // 而 person 组里已经有 relation / karma / clan / ascend。尤其 `death` 与
  // `ascend` 是同一组对照事件（这个人离世了，去的是上界还是幽冥），
  // 分在两个 tag 上说不通。这 4 个曾经漏配，于是死讯、天外传承、丹道夺魁、
  // 灵兽认主全都静默混进了「世界」筛选里。
  death: 'person', envoy: 'person', contest: 'person', beast: 'person',
  // 阶段三：被空间裂缝吞掉的凡人（`sim/rifts.js` 的「失踪」）。
  // 归 `person` 而不是 `world`：它与 `death` / `ascend` 是**同一组对照事件**——
  // 「这个人从这个世界上消失的第三种方式」（死了 / 飞升了 / 被缝吞了）。
  // 三者都落在**某一个具体的人**身上，分到不同 tag 上说不通。
  // 键名带连字符是本表唯一的例外：`rift-lost` 是可读的，而 `riftlost` 是个生造词。
  // ⚠️ 这个例外曾经让 `inkbox-smoke.mjs` 的 kind 审计误报（它的字面量正则
  //    不接受连字符，见那里的注释）——**正则已修，不要为了迁就正则改名**。
  'rift-lost': 'person',
  sect: 'sect',
  war: 'battle', forbidden: 'battle',
  // ⚠️ 下面这 5 个 kind 都曾被漏配，于是全部落到默认的 `world`：
  // 玩家点「修行」筛选看不到天劫/突破（最戏剧化的修行事件），
  // 点「幽冥」看不到夺舍（只看到转世）。漏配和「认不出」在代码里
  // 走的是同一条默认分支，所以**漏配是静默的**——不报错，只是少了几类事。
  // 补配时必须与已有的 `cultivate` 并列：`cultivate` 仍有大量写入方
  // （道途进阶、心魔、先天灵根来历、天授典籍），不能替换掉它。
  cultivate: 'cultivation', artifact: 'cultivation',
  awaken: 'cultivation', dao: 'cultivation', daotrial: 'cultivation',
  tribulation: 'cultivation', breakthrough: 'cultivation',
  // 阶段四：天雷飞升（`sim/cultivation.js` 的 `stepThunderAscend`）。
  // 归 `cultivation` 而不是 `person`：它是一次**渡劫**，与 `tribulation` /
  // `breakthrough` 同类；飞升成功那一步另有 `ascend`（归 `person`）记一笔，
  // 所以玩家在「修行」筛选里能看到「他引了天雷」，在「人物」里看到「他走了」。
  // ⚠️ 键名带连字符，与 `rift-lost` 同例——可读优先，不要为了迁就
  //    `_kindaudit.mjs` 那个还没修的正则改名（`inkbox-smoke.mjs` 的字面量
  //    正则已接受连字符，见那里的注释）。
  'thunder-ascend': 'cultivation',
  reincarn: 'nether',
  // 夺舍与转世是同一套幽冥机制的两半，`reincarn` 已归 `nether`，
  // `possess` 落 `world` 说不通。
  possess: 'nether',
});

/**
 * 有意归到 `world` 的 kind 白名单。
 *
 * 用途：把「故意归 world」与「忘了配」分开。
 * `kindTag()` 的兜底规则是「认不出一律落到 `world`」，于是这两种情况
 * 在代码里走的是**同一条分支**——漏配因此是静默的：新增一种 kind 忘了配，
 * 它只会从面板的专属筛选里消失，不报错、不崩溃，断言也全绿。
 * 有了这张白名单，测试才能断言「用到了、既不在 KIND_TAG 也不在
 * WORLD_KINDS 的 kind」= 漏配，从而把这类缺口逼成红色；
 * 没有它，这类漏配只能靠人肉审计（`beast`/`contest`/`envoy`/`death`
 * 这四个就是这么漏了很久才被审计器抓出来的）。
 *
 * ⚠️ 内容必须与 KIND_TAG 里值为 `'world'` 的键逐字一致。
 */
export const WORLD_KINDS = new Set([
  'world', 'settle', 'disaster', 'genesis', 'site', 'busanzi', 'crisis', 'rift',
]);

/** tag 的中文名（[照抄] 主线 STORY_TAGS 的 8 个 UI 项） */
export const TAG_LABELS = Object.freeze({
  all: '全部', world: '世界', person: '人物', sect: '宗门',
  battle: '战事', cultivation: '修行', nether: '幽冥', chaos: '混沌',
});

// ⚠️ 诚实标注：`chaos`（混沌）在沙盒里**没有任何产生源**——
// 沙盒是单图，没有混沌位面线，`world.record` 全库没有一个 kind 会映射到它，
// 所以那个筛选按钮恒为空。这**不是 bug**，是「这条线在沙盒里不存在」。
// 不为了让按钮有数据而硬塞一条映射：那会让「混沌」这个词在面板上
// 指代一批根本不是混沌的事，比空着更坏。
// （`nether` 有源——`reincarn` 那几条转世记录。）

// ── 文本与日期的小工具 ─────────────────────────────────────
/**
 * 文本清洗（[照抄] §2.9 的 `clean`，但**去掉了 `playerText` 那一步**）。
 *
 * 主线过一遍 `DISPLAY_DICTIONARY`（`src/data/displayDictionary.js:186-197`），
 * 因为它的文本里有 `state.foo.bar` 这类内部 token 要翻成中文。
 * 沙盒的文案**全部是手写中文**（core/lore.js 的 NARRATIVE 池），
 * 没有内部 token，也没有那张词典——硬造一张只会多一处能对不上的表。
 * 保留的是真正有用的那一半：把模板占位符漏参时渲染出来的字面量
 * `undefined` / `null` 抹掉。不抹的话，传记里会出现
 * 「【undefined】在undefined寿终正寝」，而 compileEvents 不会因此丢弃它
 * （文本非空、不等于兜底值），于是一句垃圾永远留在正文里。
 */
export function clean(value, fallback = '') {
  const text = String(value === undefined || value === null ? '' : value)
    .replace(/\bundefined\b/gi, '')
    .replace(/\bnull\b/gi, '')
    .trim();
  return text || fallback;
}

/**
 * 把一段手写正文收成「正好一个句末标点」的整句，供模板直接拼接。
 *
 * 为什么需要它：沙盒的日志正文是**手写文案**，绝大多数自带句号
 * （「……此乃天眷。」），而传记模板会在行尾再补一个句号——不剥就会
 * 渲染成「……此乃天眷。。」。反过来，也不是所有正文都有句号，
 * 所以不能靠「末尾有没有句号」来决定模板要不要补，那是两件独立的事。
 *
 * 收尾的引号 / 括号（`」』”’"')）】`）要留在句号**外面**：
 * `他说「道在心中。」` 剥完应当是 `他说「道在心中。」` 而不是
 * `他说「道在心中。` —— 把引号一起剥掉会撕坏成对的引号。
 */
function endSentence(text) {
  const s = String(text);
  const tail = (s.match(/[」』”’"')）】]+$/) || [''])[0];
  const head = (tail ? s.slice(0, s.length - tail.length) : s)
    .replace(/[。！？!?…]+$/, '');
  return `${head}。${tail}`;
}

/**
 * 规范化文本，用作去重键的一部分（[照抄] §2.5，清洗顺序不可换）。
 * 删掉的都是「同一件事的不同说法」之间的差异：
 * 「被推为掌门」与「正式成为掌门」清洗后应当相等。
 */
export function canonicalText(value) {
  return clean(value)
    .replace(/被推为|选择承担|被选为|正式成为/g, '')
    .replace(/[【】《》“”"'·，。；：\s]/g, '')
    .replace(/首次/g, '')
    .slice(0, 120);
}

/**
 * 取事件文本（[照抄] §2.3 的优先级）。
 * 兜底是 `LOST_TEXT` 而不是空串——**兜底值本身等于丢弃**（§2.3）：
 * `compileEvents` 会把它当「没有文本」跳过。写成空串也一样的下场，
 * 但写成常量可以让调用方一眼看出「这条被丢了」。
 */
export function eventText(row) {
  return clean(row && (row.text || row.summary || row.title || row.label || row.type), LOST_TEXT);
}

/**
 * 取事件日期（[照抄] §2.4）。
 * 沙盒新写的事件用 `day`（与 `world.chronicle` 的元素同形），
 * 但这里把主线那三个别名一起兜住——将来若接 lifeEventLedger，
 * 它用的是 `day`，fateHistory 用的是 `simDay`，两种都能读。
 */
export function eventDay(row) {
  return Number((row && (row.simDay ?? row.day ?? row.createdDay ?? row.startedDay)) ?? 0);
}

/**
 * 参与判据（[照抄] §2.2，六步一字未改）。**第一道闸门。**
 *
 * 设计意图（主线原文注释）：人物自己的日志天然具有归属；
 * 没有参与证据的世界历史只能作为时代背景，**不能冒充个人经历**。
 * 少了这一闸，一场没他什么事的世界大战会被写进他的传记里。
 *
 * 沙盒的一处适配：主线用 `lineageId` 认「同一条命脉」（转世前后算同一个人）。
 * 沙盒没有 `lineageId`，与之等价的是 `soulId`（`sim/reincarnation.js` 里
 * 那个跨世不变的神魂 id），所以这里用 `soulId ?? id`。
 * 用 `id` 当兜底是对的：没有神魂的（凡人、灵兽）就只认自己这一世。
 */
export function actorParticipated(row, entity, source) {
  if (!row || !entity) return false;
  if (row.backgroundOnly) return false;
  if (row.actorRole === 'background') return false;
  if (row.participation === 'sect_background') return false;

  const ids = row.actorIds || row.participantIds;
  if (Array.isArray(ids) && ids.length) {
    const self = String(entity.id);
    const soul = String(entity.soulId === undefined || entity.soulId === null ? entity.id : entity.soulId);
    for (let i = 0; i < ids.length; i += 1) {
      const v = String(ids[i]);
      if (v === self || v === soul) return true;
    }
    return false;
  }

  const role = row.actorRole || row.participation || row.role;
  if (role) return ALLOWED_ROLES.has(role);
  // 无 role、无 id 列表 → 只有 major 源被淘汰，其余源一律通过（§2.2 第 6 步）
  return source !== 'major';
}

/**
 * 去重键（[照抄] §2.5，逐字规则）。
 * 战争类文本**不按事件 id 去重，按「这一场战争」去重**——
 * 一场大战会在四个源里各写一条，按 id 去重会让它出现四遍。
 */
export function semanticKey(row, entity, text, yearDays = YEAR_DAYS) {
  if (row && row.semanticKey) return String(row.semanticKey);
  const owner = entity.soulId === undefined || entity.soulId === null ? entity.id : entity.soulId;
  if (/夺脉者|宿命对决|宗门交锋|战役|大战/.test(text)) {
    const warId = (row && (row.warId || row.conflictId || row.threadId))
      || Math.floor(eventDay(row) / yearDays);
    const kind = /夺脉者/.test(text) ? 'war_role' : 'war_chapter';
    return `${kind}:${owner}:${warId}`;
  }
  const source = row && (row.eventId || row.sourceEventId || row.id || row.threadId);
  if (source) return `event:${owner}:${source}:${canonicalText(text)}`;
  return `text:${owner}:${Math.floor(eventDay(row) / yearDays)}:${canonicalText(text)}`;
}

/**
 * 重要度评分（[照抄] §2.6，数字一个没动）。
 *
 * 一处沙盒适配：**行上若已经带了 `importance` 就用它**（`Number.isFinite` 判据，
 * 不是 `||`——0 是合法分数，`0 || 基准分` 会把一个明确的「不重要」抬成 35）。
 * 这是因为 `recordLifeEvent` 在写入时已经把分数算好存进 `entity.log`，
 * 编译期再按关键词重算一遍，等于同一个数算两次、且两次可能不一致
 * （写入时的文本被截断到 80 字，关键词可能正好在截断处丢了）。
 */
export function importanceOf(row, source, text) {
  if (row && Number.isFinite(row.importance)) return row.importance;
  let score = SOURCE_BASE[source];
  if (score === undefined) score = SOURCE_DEFAULT_BASE;
  if (BOOST_RE.test(text)) score += 24;
  if (DAMPEN_RE.test(text)) score -= 25;
  if (row && (row.major === true || row.severity === 'major' || row.severity === 'world')) score += 20;
  return score;
}

/** 面板上的一行 = [标签, 值]，与 family.js 的 lineageOf 同形 */
function clampText(text, cap = TEXT_CAP) {
  const s = String(text);
  return s.length > cap ? `${s.slice(0, cap - 1)}…` : s;
}

// ── 写：个人事件流 ─────────────────────────────────────────
/**
 * 惰性补上 `entity.log`。
 *
 * 这是兜底，不是设计：初值必须由 `initEntity` 给（见文件头接线一）。
 * 兜底存在的理由与 `relations.js:51-54` 的 `ensureRelations` 一样——
 * 少了它，接线方只要漏了一处，整块功能会**静悄悄地什么都不发生**，
 * 而不是抛一个能查的错。
 */
export function ensureLog(entity) {
  if (!Array.isArray(entity.log)) entity.log = [];
  return entity.log;
}

/**
 * 把一件值得记的事记到这个人身上。
 *
 * **不写 `world.chronicle`**——那是世界级的事，由别处负责（本模块不碰）。
 * 同一个人身上发生的事，世界编年史可能一个字都不提（比如闭关百年、收了一个徒弟），
 * 而传记恰恰靠这些才有内容。
 *
 * @returns {boolean} 记下了 true；被拒 false（空文本 / 重复 / 挤不进上限）
 *
 * 拒收的三种情形，每一种都必须**返回 false 而不是静默 push**：
 *   1. 清洗后为空、或等于 `LOST_TEXT`——记一条「一段经历已佚」进日志，
 *      等于让传记里出现一行没有内容的行，比不记更坏；
 *   2. 语义键在最近 `DEDUP_SPAN` 条里出现过——「每年普查一次」的接线
 *      会让同一件事被记几十遍，而传记的「每年 top3」会被这一件事塞满，
 *      看起来完全正常；
 *   3. 满了且这条比日志里最不值得留的那条还轻——见下面的淘汰规则。
 */
export function recordLifeEvent(world, entity, kind, text, opts = {}) {
  if (!world || !entity) return false;
  const body = clean(text);
  if (!body || body === LOST_TEXT) return false;

  const log = ensureLog(entity);
  const day = Number.isFinite(opts.day) ? opts.day : (Number(world.day) || 0);
  const key = opts.semanticKey ? String(opts.semanticKey) : `${kind || 'event'}:${canonicalText(body)}`;

  const from = Math.max(0, log.length - DEDUP_SPAN);
  for (let i = log.length - 1; i >= from; i -= 1) {
    if (log[i] && log[i].key === key) return false;
  }

  const entry = {
    day,
    year: Math.max(0, Math.floor(day / YEAR_DAYS)),
    kind: kind || 'event',
    text: clampText(body),
    key,
    // 分数在这里就定下来（理由见 importanceOf 的注释）。**条件赋值**：
    // 写 `importance: undefined` 会造出一个值为 undefined 的键，
    // 而 `JSON.stringify` 会把它整个丢掉——于是「新世界里有的键、读档后没有」，
    // 存读档逐字段比对立刻炸（save.js 的 num() 就是为这个坑写的）。
    importance: importanceOf({ kind, text: body, importance: opts.importance }, 'log', body),
  };
  if (Number.isFinite(opts.level)) entry.level = opts.level;

  log.push(entry);

  // 淘汰规则：**不是 FIFO**，是「按重要性淘汰，同分留新的」。
  //
  // 为什么不能 FIFO：规格书 §8.3 已经点出 400 条的编年史窗口在千年尺度下
  // 必然把早期经历顶掉。个人日志存在的**全部意义**就是不受那条窗口约束——
  // 若这里也 FIFO，一个人的「觉醒」「开宗」「结侣」会被晚年几十条琐事挤出去，
  // 而传记里看起来只是「早年一片空白」，不会报任何错。
  //
  // 淘汰的是「日志里最不值得留的那一条」，包括刚推进去的这条自己：
  // 若新事本身比现有最轻的那条还轻，它就当场被自己挤出去 → 返回 false。
  // 这样「上限 32」表达的是「这一生最重要的 32 件事」，而不是「最后 32 件事」。
  if (log.length > LOG_CAP) {
    let victim = 0;
    let worst = Infinity;
    for (let i = 0; i < log.length; i += 1) {
      const row = log[i];
      const s = row && Number.isFinite(row.importance) ? row.importance : 0;
      // 同分时淘汰更早的（留新的）——「今年的突破」比「五十年前的一次偶遇」值得留
      if (s < worst || (s === worst && (row.day || 0) < (log[victim].day || 0))) {
        worst = s;
        victim = i;
      }
    }
    const evicted = log.splice(victim, 1)[0];
    if (evicted === entry) return false;
  }
  return true;
}

// ── 读：编译事件流 ─────────────────────────────────────────
/**
 * 四源合流 → 参与判据 → 去重 → 评分 → 每年 top3 → 全局 90。
 * （[照抄] 规格书 §2.2–2.7 的骨架与全部数字）
 *
 * @returns {Array<{day:number, year:number, text:string, score:number, source:string, kind:string}>}
 *   按年份升序排列（与主线一致，因为 `slice(-90)` 依赖这个顺序）
 *
 * 沙盒与主线在「谁属于这个人的事件源」上的差异见文件头；这里只强调一点：
 * **`entity.log` 里的每一条都天然属于本人**（是 `recordLifeEvent` 写进去的），
 * 所以它们必然通过参与判据；参与判据真正拦的是另外三个源
 * （比如主线里 `actorConsequences` 推进 `majorHistory` 的那些无主条目，
 * 规格书 §2.2 实测它们**全部**被淘汰）。
 */
export function compileEvents(entity, opts = {}) {
  if (!entity) return [];
  const yearDays = opts.yearDays || YEAR_DAYS;
  const perYear = Number.isFinite(opts.perYear) ? opts.perYear : EVENTS_PER_YEAR;
  const total = Number.isFinite(opts.total) ? opts.total : EVENTS_TOTAL;
  const rowCap = Number.isFinite(opts.sourceCap) ? opts.sourceCap : SOURCE_ROW_CAP;

  const byKey = new Map();
  for (let s = 0; s < EVENT_SOURCES.length; s += 1) {
    const source = EVENT_SOURCES[s];
    const raw = SOURCE_ROWS[source](entity);
    if (!Array.isArray(raw) || !raw.length) continue;
    const rows = raw.slice(-rowCap);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!actorParticipated(row, entity, source)) continue;
      const text = eventText(row);
      // 文本为空或等于兜底值 → 丢（§2.7 第 4 步）
      if (!text || text === LOST_TEXT) continue;
      const score = importanceOf(row, source, text);
      const day = eventDay(row);
      const key = semanticKey(row, entity, text, yearDays);
      const prev = byKey.get(key);
      // 同键去重，保留条件：**新分更高 或 新文本更长**（§2.7 第 5 步）
      if (prev && !(score > prev.score || text.length > prev.text.length)) continue;
      byKey.set(key, {
        day,
        year: Math.max(0, Math.floor(day / yearDays)),
        text,
        score,
        source,
        kind: clean((row && (row.kind || row.type)) || source, source),
      });
    }
  }

  // 按年份分组 → 年内按 score 降序、day 升序，只留前 perYear 条（§2.7 第 7 步）
  const byYear = new Map();
  for (const ev of byKey.values()) {
    let bucket = byYear.get(ev.year);
    if (!bucket) {
      bucket = [];
      byYear.set(ev.year, bucket);
    }
    bucket.push(ev);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);
  const flat = [];
  for (let i = 0; i < years.length; i += 1) {
    const bucket = byYear.get(years[i]);
    // ⚠️ 排序必须是全序：只写 `b.score - a.score` 时，同分的两条顺序取决于
    // Map 的插入顺序，而插入顺序又取决于源的遍历顺序——看似确定，实则
    // 一旦有人调了 EVENT_SOURCES 或给 log 加了字段就会变。补 `day` 与
    // `text` 两级兜底，让同一个世界每次编译出逐字相同的传记。
    bucket.sort((a, b) => (b.score - a.score)
      || (a.day - b.day)
      || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
    const take = Math.min(perYear, bucket.length);
    for (let k = 0; k < take; k += 1) flat.push(bucket[k]);
  }
  // 全局 slice(-90)：作用在**年份升序**的扁平数组上，即丢掉最早的、留最晚的（§2.7 第 8 步）
  return flat.slice(-total);
}

// ── 读：派生小工具 ─────────────────────────────────────────
/**
 * 显示名（[照抄] §2.10 `identitySystem.js:3`）。
 * 主线 Worker 里那份多一个 `|| '无名修士'` 兜底，规格书建议二选一——这里选带兜底的，
 * 因为沙盒的实体名理论上可能为空（神力投放的调试实体），
 * 而「# undefined传」这种标题一旦出现，整份导出就废了。
 */
export function displayName(entity) {
  if (!entity) return '无名修士';
  const level = entity.level || 0;
  if (entity.daoTitle) {
    const suffix = level >= 40 ? '道君' : level >= 30 ? '剑君' : level >= 20 ? '真人' : '';
    return entity.daoTitle + suffix;
  }
  return clean(entity.name, '无名修士');
}

/**
 * 注目度 0..4。
 *
 * ⚠️ **沙盒没有「玩家关注」这套系统**（全库 grep `attention` / `prominence`
 * 一处都没有），而主线的「一眼看懂」第 7 行恰恰是「关注」。
 * 这里不假装有，而是从**可观察的事实**里派生一个「世人注目」：
 * 境界、杀名、身上有几件法宝、出身世家有多盛。
 *
 * 它是**只读派生**，不写回任何字段——所以面板每帧调一万次也不会改变世界。
 * 这条规矩很重要：一旦有人把它的结果存进实体，它就变成了「会漂的状态」。
 */
export function attentionOf(world, entity) {
  if (!entity) return 0;
  let score = 0;
  const level = entity.level || 0;
  if (level >= 10) score += 1;
  if (level >= 20) score += 1;
  if (level >= 30) score += 1;
  if ((entity.kills || 0) >= 3) score += 1;
  if (entity.artifacts && entity.artifacts.length) score += 1;
  if (entity.clan && world && typeof world.clanById === 'function') {
    const clan = world.clanById(entity.clan);
    if (clan && clan.reputation >= 60) score += 1;
  }
  return score > 4 ? 4 : score;
}

/** 注目度的中文名，下标即 attentionOf 的返回值 */
export const ATTENTION_NAMES = Object.freeze(['路人', '乡邻', '一乡之望', '名动一方', '举世皆知']);

/** 宗门名。查不到就是「散修」——凡人、散修、宗门解散后都落到这里 */
export function sectNameOf(world, entity) {
  if (!entity || !entity.faction) return '散修';
  const sect = world && typeof world.factionById === 'function' ? world.factionById(entity.faction) : null;
  return sect ? clean(sect.name, '散修') : '散修';
}

/**
 * 当前修炼进度百分比（[照抄] §2.8：`target = max(1, level*EXP_PER_LEVEL)`，
 * `clamp(exp/target*100, 0, 100)`）。
 * `level * EXP_PER_LEVEL` 在 level=0 时是 0，除以 0 得 Infinity →
 * `toFixed` 输出「Infinity%」。所以 `Math.max(1, ...)` 那一步不是装饰。
 */
export function progressOf(entity) {
  const level = entity && entity.level ? entity.level : 0;
  const target = Math.max(1, level * EXP_PER_LEVEL);
  const raw = ((entity && entity.exp) || 0) / target * 100;
  return raw < 0 ? 0 : raw > 100 ? 100 : raw;
}

/** 某个人身上 / 世界上的法宝名字。沙盒的法宝是对象数组（`entity.artifacts`） */
export function artifactNamesOf(entity) {
  const list = entity && entity.artifacts;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const name = clean(list[i] && list[i].name);
    if (name) out.push(name);
  }
  return out;
}

/**
 * 重要关系（[照抄] §2.8 的 `slice(0, 8)` + 按 `|score|` 降序，§3.2 的行模板）。
 *
 * 沙盒的 `entity.relations` 是 **`Map`**（主线是普通对象，规格书 §8 点过这一条），
 * 所以遍历方式不同；另外沙盒的关系条目没有主线的 `reason` 自由文本，
 * 只有 `{type, score, since}`，于是 `reason` 由分数派生。
 * 排序补了 `id` 一级兜底：只按 |score| 排时同分的两条顺序取决于 Map 插入顺序，
 * 那是「看起来确定、其实会随历史变化」的东西。
 */
export function importantRelations(world, entity, cap = RELATION_CAP) {
  // ── 已解析快照的短路（逝者名录用）────────────────────────
  // 名录（sim/necrology.js）在**入册那一刻**就把关系解析成了带名字的数组——
  // 那时人还在 `world.entities` 里、关系网也还没被 `onDeathRelations` 清掉。
  // 已故者身上没有 `relations` Map、也不在 `world.entities` 里，若不走这一条短路，
  // 每条关系都会被 `findEntity` 判成查不到，全部写成「一位姓名失载的旧识」：
  // 不报错，只是整段关系凭空变成一串一模一样的空话。
  // 判据用 `Array.isArray` 而不是真值判断——空数组也是合法的「确实没有关系」。
  const resolved = entity && entity.relationsResolved;
  if (Array.isArray(resolved)) return resolved.slice(0, cap);
  const map = entity && entity.relations;
  if (!map || typeof map.forEach !== 'function') return [];
  const rows = [];
  map.forEach((rel, id) => {
    if (!rel) return;
    rows.push({
      id,
      type: rel.type,
      score: Number(rel.score) || 0,
      since: rel.since,
    });
  });
  rows.sort((a, b) => (Math.abs(b.score) - Math.abs(a.score))
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out = [];
  const take = Math.min(cap, rows.length);
  for (let i = 0; i < take; i += 1) {
    const row = rows[i];
    const other = findEntity(world, row.id);
    out.push({
      // 查不到就留白（family.js:439 的同一条规矩：写一个查不到来源的名字比留白更坏）
      name: other ? displayName(other) : '一位姓名失载的旧识',
      type: RELATION_LABELS[row.type] || '关系',
      reason: row.score ? `${row.score > 0 ? '情分' : '仇怨'} ${Math.abs(Math.round(row.score))}` : '',
      score: row.score,
    });
  }
  return out;
}

/** 在 `world.entities` 里按 id 找一个人。找不到返回 null（死者与飞升者都被移出了） */
export function findEntity(world, id) {
  if (!world || !Array.isArray(world.entities)) return null;
  const list = world.entities;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

// ── 读：传记正文 ───────────────────────────────────────────
/**
 * 编译一个人的传记（Markdown）。
 *
 * 段落结构**固定 8 段、顺序不可变**（[照抄] §2.1 / §3.1）：
 *   1 标题 + 导出信息   2 一眼看懂   3 修行轨迹   4 法宝与遗物（可选）
 *   5 重要关系          6 前世与命系（可选）        7 生涯阶段   8 遗产与未竟之事
 * 每一段的文案模板逐字来自 `BiographyCompiler.js:158-196`。
 *
 * 两处**按规格书建议修掉的主线 bug**（§7.2 / §7.3）：
 *   · 「生涯」那行主线读 `actor.lifeSummary?.text || actor.biographySummary`，
 *     这两个字段全库 0 写入 → 永远走兜底。这里把 `lifeSummaries`（复数数组）
 *     也读上，读不到才走兜底；沙盒暂时没有这个字段，所以实际仍走兜底，
 *     但接线方将来若做「历史压缩」，这一行会自己活过来。
 *   · 「弟子数」主线读 `actor.disciples`，实体真实字段是 `discipleIds` → 永远不显示。
 *     沙盒没有这两个字段，弟子关系在 `relations` Map 里（`type === 'disciple'`），
 *     所以这里**按关系数**，是三者里唯一真的有数据的写法。
 *
 * @returns {string} Markdown。空实体也返回一份合法文档（含兜底段），**不返回空串**——
 *   空串会让面板显示成「什么都没有」，而真相是「这个人还没有值得记的事」。
 */
export function compileBiography(world, entity, opts = {}) {
  if (!entity) return '';
  const yearDays = opts.yearDays || YEAR_DAYS;
  const currentYear = Math.max(0, Math.floor((Number(world && world.day) || 0) / yearDays));
  const level = entity.level || 0;
  const events = Array.isArray(opts.events) ? opts.events : compileEvents(entity, opts);
  const artifacts = artifactNamesOf(entity);
  const relations = importantRelations(world, entity, opts.relationCap);

  const lines = [];

  // ── 1. 标题 + 导出信息 ──
  lines.push(`# ${clean(displayName(entity), clean(entity.name, '无名修士'))}传`);
  lines.push('');
  lines.push(`导出于仙历 ${currentYear} 年`);
  lines.push(`- 游戏版本：V${(APP && APP.version) || '未知'}`);
  lines.push('');

  // ── 2. 一眼看懂（7 条固定字段）──
  lines.push('## 一眼看懂');
  const summary = clean(
    (entity.lifeSummary && entity.lifeSummary.text)
      || entity.biographySummary
      || (Array.isArray(entity.lifeSummaries) && entity.lifeSummaries.length
        ? entity.lifeSummaries[entity.lifeSummaries.length - 1].text : ''),
    `${realmLabel(level)}之路仍在书写，已有 ${events.length} 件重要经历被编入传记。`,
  );
  lines.push(`- 生涯：${summary}`);
  // 「当前所求」在沙盒里的对应物是**道途**（`entity.dao`），
  // 因为沙盒没有 `storyIdentity.activeWishId` 那条线（规格书 §1.1 第 9 行）。
  lines.push(`- 当前所求：${entity.dao && entity.dao.path
    ? `${entity.dao.path.name}·${daoStageName(entity.dao.path, entity.dao.progress) || '未入阶'}`
    : '尚未显露'}`);
  lines.push(`- 境界：${realmLabel(level)} Lv${level || 1}`);
  lines.push(`- 年龄：${Math.max(0, Math.floor((entity.age || 0) / yearDays))} 年`);
  lines.push(`- 宗门：${sectNameOf(world, entity)}`);
  lines.push(`- 身份：${clean(entity.daoTitle || (entity.root && entity.root.rootName), entity.root ? '修行者' : '凡俗之身')}`);
  lines.push(`- 关注：${ATTENTION_NAMES[attentionOf(world, entity)]}`);
  lines.push('');

  // ── 3. 修行轨迹 ──
  lines.push('## 修行轨迹');
  const milestones = [];
  const log = Array.isArray(entity.log) ? entity.log : [];
  for (let i = 0; i < log.length; i += 1) {
    const row = log[i];
    if (row && MILESTONE_KINDS.has(row.kind)) milestones.push(row);
  }
  // [照抄] §2.8：里程碑只留最后 16 条
  const shownMilestones = milestones.slice(-MILESTONE_CAP);
  if (shownMilestones.length) {
    for (let i = 0; i < shownMilestones.length; i += 1) {
      const m = shownMilestones[i];
      const year = Math.floor((m.day || 0) / yearDays);
      // ⚠️ 这里**刻意只有一条模板**，没有「有境界就写境界名」的旁路。
      // `[照抄]` 的规格假设里程碑总是带境界（`踏入${境界名}。`），但沙盒里
      // 经 `world.record` 分流进日志的条目**不带 level**（`recordLifeEvent`
      // 只收到 kind 与文本；全仓没有任何生产写入方传 `opts.level`）。
      // 实测 150 年真实世界：542 条命中 `MILESTONE_KINDS` 的条目里，
      // `Number.isFinite(level)` 命中 **0 条（0.00%）**——那一支是**死分支**。
      // 死分支的危害不是「多写了几行」，而是它让读代码的人以为两种输入都被
      // 支持，于是没人去查「为什么境界名从没出现过」。宁可删掉：将来若有
      // 写入方真的补上 level，再加回来，并配一条断言盯着它别再变成死的。
      //
      // 曾经的写法是两条支路共用 `踏入${name}。`，于是兜底路径渲染出
      // 「踏入裴少归 于水边沙洲觉醒阴阳灵根。」——「踏入」后面接了一整句话。
      // ⚠️ 不要用「正文末尾有没有句号」去猜要不要加前缀：那是两件独立的事，
      //    混在一起写迟早又在某条文案上出错。
      lines.push(`- 仙历 ${year} 年：${endSentence(clean(m.text, `修为第 ${level} 层`))}`);
    }
  } else {
    lines.push(`- 当前境界：${realmLabel(level)} Lv${level || 1}。`);
  }
  lines.push(`- 当前修炼进度：约 ${progressOf(entity).toFixed(0)}%。`);

  // ── 4.（可选）法宝与遗物 ──
  // 只在真的有法宝时才出这一行：空行会让「一眼看懂」那一堆变成噪声。
  if (artifacts.length) lines.push(`- 法宝与遗物：${artifacts.join('、')}`);
  lines.push('');

  // ── 5. 重要关系 ──
  lines.push('## 重要关系');
  if (relations.length) {
    for (let i = 0; i < relations.length; i += 1) {
      const r = relations[i];
      lines.push(`- ${r.type}：${r.name}${r.reason ? `。${r.reason}` : ''}`);
    }
  } else {
    lines.push('- 尚无足以改变其人生的重要关系。');
  }
  lines.push('');

  // ── 6.（可选）前世与命系 ──
  const incarnation = entity.incarnation || 1;
  if (entity.pastLife || incarnation > 1) {
    lines.push('## 前世与命系');
    const past = entity.pastLife;
    // 沙盒的 pastLife 是对象 `{name, level, realm, fragments, sect, ...}`（reincarnation.js:297）
    // 而主线读的是字符串 `previousLifeName`。两种都兜住。
    const pastName = typeof past === 'string' ? past : clean(past && (past.name || past.realm));
    if (pastName) lines.push(`- 前世：${pastName}。`);
    lines.push(`- 当前为命系第 ${incarnation} 世。`);
    lines.push('');
  }

  // ── 7. 生涯阶段 ──
  lines.push('## 生涯阶段');
  if (events.length) {
    for (let i = 0; i < events.length; i += 1) {
      lines.push(`- 仙历 ${events[i].year} 年：${events[i].text}`);
    }
  } else {
    lines.push('- 尚无足够重要且可归属于本人的经历。');
  }
  lines.push('');

  // ── 8. 遗产与未竟之事 ──
  lines.push('## 遗产与未竟之事');
  const legacy = [];
  if (entity.clan && world && typeof world.clanById === 'function') {
    const clan = world.clanById(entity.clan);
    // 「形成跨代传承」的判据：这一族已经传到了他之后（他自己的世代 < 家族的世代）
    if (clan && (clan.generation || 1) > (entity.gen || 1)) {
      legacy.push(`【${clan.name}·${clan.hall}】其修行道路已经形成跨代传承。`);
    }
  }
  const disciples = countRelations(entity, RELATION_TYPES.DISCIPLE);
  if (disciples > 0) legacy.push(`留下 ${disciples} 名有记录的弟子。`);
  const fateTitle = clean(entity.fateTask && entity.fateTask.title);
  if (fateTitle) {
    legacy.push(`未竟命线：《${fateTitle}》。`);
  } else if (entity.dao && entity.dao.path) {
    legacy.push(`未竟命线：《${entity.dao.path.name}》止于${daoStageName(entity.dao.path, entity.dao.progress) || '未入阶'}。`);
  }
  if (artifacts.length) legacy.push(`相关遗物：${artifacts.join('、')}。`);
  if (legacy.length) {
    for (let i = 0; i < legacy.length; i += 1) lines.push(`- ${legacy[i]}`);
  } else {
    lines.push('- 尚未形成可确认的身后遗产。');
  }

  return lines.join('\n');
}

/** 数一个人身上某种关系的条数（沙盒的关系在 Map 里） */
export function countRelations(entity, type) {
  const map = entity && entity.relations;
  if (!map || typeof map.forEach !== 'function') return 0;
  let n = 0;
  map.forEach((rel) => {
    if (rel && rel.type === type) n += 1;
  });
  return n;
}

/**
 * 导出文件名（[照抄] §3.4）：`坐天观井-{显示名}-传.md`，非法字符换成 `_`。
 *
 * 只返回**名字**，不碰 Blob / URL / document——沙盒是无头可测的，
 * 一旦这里摸 `window`，长测与探针就再也跑不到这条路径。
 * 真正的落盘由接线方在 main.js 里做。
 */
export function biographyFileName(entity) {
  const safe = displayName(entity).replace(/[\\/:*?"<>|]/g, '_');
  return `坐天观井-${safe}-传.md`;
}

// ── 读：血缘谱系（重写版，不是照抄 LineageStoryBuilder）──────
/**
 * 血缘谱系故事。
 *
 * ⚠️ **这是重写，不是移植。** 主线的 `LineageStoryBuilder`（规格书 §4.5 / §7.5）
 * 6 个输出键里有 4 个恒为空数组，因为它读的字段**根本不存在**：
 *   · `descendantIds` / `children` → 实体真实字段是 `descendants`
 *   · `inheritorIds` / `heirIds` → 全库 0 写入
 *   · `enemyIds` / `rivals` → 全库 0 写入
 *   · `artifactHistory` / `sectHistory` → 全库 0 写入
 * 照抄它等于照抄一份「永远输出空」的代码，而且它看起来完全正常。
 *
 * 所以这里**只读沙盒里真的存在的字段**，并且每一条都在括号里注明出处：
 *   · 双亲 / 子女  → `parentA` / `parentB` 两条 id 边 + 反向扫描（family.js 的做法）
 *   · 师徒 / 道侣 / 宿敌 → `entity.relations` Map 的 type（relations.js:16-29）
 *   · 转世同源     → `entity.soulId`（跨世不变的神魂 id）
 *   · 世家 / 世代  → `entity.clan` / `entity.gen` + `world.clanById`
 *
 * 返回**纯文本多行**（不是 Markdown 标题），因为它的消费者是检视面板的一格，
 * 不是导出文件。面板上出现 `##` 会很怪。
 */
export function lineageStory(world, entity) {
  if (!entity) return '';
  const lines = [];
  const level = entity.level || 0;
  lines.push(`《${clean(entity.surname, clean(entity.name, '无名').slice(0, 1))}氏一脉》`);
  lines.push(`- 本人：${displayName(entity)}（${realmLabel(level)} Lv${level || 1}`
    + ` · ${sectNameOf(world, entity)}${entity.hp > 0 ? '' : ' · 已不在世'}）`);

  // 双亲：死者会被移出 world.entities，所以只报「在世 / 已故」，不硬凑名字
  if (entity.parentA || entity.parentB) {
    const a = entity.parentA ? findEntity(world, entity.parentA) : null;
    const b = entity.parentB ? findEntity(world, entity.parentB) : null;
    const parts = [];
    if (entity.parentA) parts.push(a ? displayName(a) : '已故');
    if (entity.parentB) parts.push(b ? displayName(b) : '已故');
    lines.push(`- 双亲：${parts.join(' · ')}`);
  }

  // 子女：反向扫一遍（沙盒没有 children 数组，也没有 descendants 字段——
  // 世系就是 parentA/parentB 两条边，family.js:446-450 也是这么数的）
  const kids = [];
  if (Array.isArray(world && world.entities)) {
    const list = world.entities;
    for (let i = 0; i < list.length; i += 1) {
      const e = list[i];
      if (e.parentA === entity.id || e.parentB === entity.id) kids.push(e);
    }
  }
  if (kids.length) {
    const names = kids.slice(0, 6).map((k) => displayName(k)).join('、');
    lines.push(`- 子女：${kids.length} 人在世${kids.length > 6 ? `（${names} 等）` : `（${names}）`}`);
  }

  const disciples = importantRelationsOfType(world, entity, RELATION_TYPES.DISCIPLE);
  if (disciples.length) lines.push(`- 弟子：${disciples.length} 人（${disciples.slice(0, 4).join('、')}）`);
  const mentors = importantRelationsOfType(world, entity, RELATION_TYPES.MENTOR);
  if (mentors.length) lines.push(`- 师承：${mentors.slice(0, 3).join('、')}`);
  const lovers = importantRelationsOfType(world, entity, RELATION_TYPES.LOVER);
  if (lovers.length) lines.push(`- 道侣：${lovers.slice(0, 3).join('、')}`);
  const rivals = [
    ...importantRelationsOfType(world, entity, RELATION_TYPES.RIVAL),
    ...importantRelationsOfType(world, entity, RELATION_TYPES.ENMITY),
  ];
  if (rivals.length) lines.push(`- 宿敌：${rivals.slice(0, 3).join('、')}`);

  // 转世同源：同一个神魂的其它世。**这是主线 lineageId 在沙盒里的对应物**——
  // 主线按 lineageId 串，沙盒按 soulId 串（reincarnation.js 的跨世 id）。
  if (entity.soulId !== undefined && entity.soulId !== null && Array.isArray(world && world.entities)) {
    const list = world.entities;
    const kin = [];
    for (let i = 0; i < list.length; i += 1) {
      const e = list[i];
      if (e !== entity && e.soulId === entity.soulId) kin.push(displayName(e));
    }
    lines.push(kin.length
      ? `- 同源转世：${kin.length} 世（${kin.slice(0, 3).join('、')}）`
      : '- 同源转世：此世独存');
  }

  if (entity.clan && world && typeof world.clanById === 'function') {
    const clan = world.clanById(entity.clan);
    if (clan) {
      lines.push(`- 世家：${clan.name}·${clan.hall}（第 ${entity.gen || 1} 代`
        + ` · 一族已传 ${clan.generation || 1} 代 · 声望 ${Math.round(clan.reputation || 0)}）`);
      lines.push(`- 始祖：${clan.founderName}（第 ${Math.floor((clan.foundedDay || 0) / YEAR_DAYS) + 1} 年立族）`);
      if (clan.heirloom) lines.push(`- 家学：《${clan.heirloom}》`);
    }
  }

  const logged = Array.isArray(entity.log) ? entity.log.length : 0;
  lines.push(`- 编者按：本人名下已记 ${logged} 件经历；`
    + '谱系只列**此刻仍在世**的人，已故者留「已故」二字，不硬凑名字。');
  return lines.join('\n');
}

/** 按关系类型取对方的名字（只取还在世、查得到的） */
function importantRelationsOfType(world, entity, type) {
  const map = entity && entity.relations;
  if (!map || typeof map.forEach !== 'function') return [];
  const rows = [];
  map.forEach((rel, id) => {
    if (!rel || rel.type !== type) return;
    const other = findEntity(world, id);
    if (other) rows.push(displayName(other));
  });
  // 完全确定的排序：没有分数可比时按名字排，不用 Map 的插入顺序
  rows.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return rows;
}

// ── 读：编年史筛选与导出 ───────────────────────────────────
/** 一个 kind 属于哪个面板 tag（认不出的落到 world，理由见 KIND_TAG 的注释） */
export function kindTag(kind) {
  return KIND_TAG[kind] || 'world';
}

/**
 * 编年史筛选（[照抄] §5.1：按 tag 筛 + 长度上限 + 时间倒序）。
 *
 * 主线的实现是 `items.filter(...).reverse().slice(0, 160)`——先筛完整个 1200 条、
 * 再取最新的 160 条。这里从数组末尾往回走、凑够 `limit` 条就停，
 * **结果与主线逐条相同**（同样只保留最新的一批），但不必先把整个编年史复制一遍。
 *
 * @returns {Array<{day, year, text, kind}>} 时间**倒序**（最新在前），与面板一致
 */
export function filterChronicle(world, opts = {}) {
  const src = (world && world.chronicle) || [];
  const tag = opts.tag || 'all';
  const limit = Number.isFinite(opts.limit) ? opts.limit : CHRONICLE_LIMIT;
  const out = [];
  if (limit <= 0) return out;
  for (let i = src.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const row = src[i];
    if (!row) continue;
    if (tag !== 'all' && kindTag(row.kind) !== tag) continue;
    out.push(row);
  }
  return out;
}

/** 编年史摘要行（[照抄] §5.1 的 chronicleSummary 模板） */
export function chronicleSummary(world, opts = {}) {
  const tag = opts.tag || 'all';
  const items = filterChronicle(world, { ...opts, limit: opts.limit || CHRONICLE_LIMIT });
  const label = TAG_LABELS[tag] || '全部';
  if (!items.length) return `当前筛选：${label} · 共 0 条`;
  const latest = items[0];
  return `当前筛选：${label} · 共 ${items.length} 条 · 最近一条：`
    + `${latest.year === undefined ? Math.floor((latest.day || 0) / YEAR_DAYS) : latest.year} 年`
    + `《${clean(latest.text, TAG_LABELS[kindTag(latest.kind)] || '未名之事')}》`;
}

/**
 * 编年史导出（Markdown）。
 *
 * 导出的是**筛选后的**那一批（与面板所见一致），不是整个世界编年史——
 * 「面板上看到的」与「导出来的」不一致，是玩家最不能接受的那种错。
 */
export function exportChronicle(world, opts = {}) {
  const tag = opts.tag || 'all';
  const rows = filterChronicle(world, opts);
  const yearDays = opts.yearDays || YEAR_DAYS;
  const currentYear = Math.max(0, Math.floor((Number(world && world.day) || 0) / yearDays));
  const lines = [];
  lines.push('# 坐天观井 · 世界编年史');
  lines.push('');
  lines.push(`导出于仙历 ${currentYear} 年`);
  lines.push(`- 游戏版本：V${(APP && APP.version) || '未知'}`);
  lines.push(`- 筛选：${TAG_LABELS[tag] || '全部'} · 共 ${rows.length} 条`);
  lines.push('');
  if (!rows.length) {
    lines.push('当前筛选暂无记录。');
    return lines.join('\n');
  }
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const year = row.year === undefined ? Math.floor((row.day || 0) / yearDays) : row.year;
    lines.push(`- 仙历 ${year} 年（${TAG_LABELS[kindTag(row.kind)] || '世界'}）：${clean(row.text, '未名之事')}`);
  }
  return lines.join('\n');
}

/** 编年史导出文件名（与传记同一套命名规则） */
export function chronicleFileName(world, opts = {}) {
  const year = Math.floor((Number(world && world.day) || 0) / YEAR_DAYS);
  return `坐天观井-编年史-仙历${year}年.md`;
}

// ── 统计：给长测与面板用 ───────────────────────────────────
/**
 * 传记层的读数。
 *
 * `logged` 是**有日志的人**（不是总人数），`coverage` 是覆盖率。
 * 长测要盯的正是 `coverage`：接线漏了一处（比如只接了突破、没接死亡），
 * 传记不会报错，只会「覆盖不到一半的人」——这个数字是唯一能发现它的地方。
 */
export function biographyStats(world) {
  const list = (world && world.entities) || [];
  let logged = 0;
  let events = 0;
  let topActor = null;
  let topCount = 0;
  const kindCount = new Map();
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    const log = Array.isArray(e.log) ? e.log : null;
    if (!log || !log.length) continue;
    logged += 1;
    events += log.length;
    if (log.length > topCount) {
      topCount = log.length;
      topActor = e;
    }
    for (let k = 0; k < log.length; k += 1) {
      const kind = (log[k] && log[k].kind) || 'event';
      kindCount.set(kind, (kindCount.get(kind) || 0) + 1);
    }
  }
  let topKind = null;
  let topKindCount = 0;
  kindCount.forEach((n, kind) => {
    if (n > topKindCount) {
      topKindCount = n;
      topKind = kind;
    }
  });
  return {
    entities: list.length,
    logged,
    events,
    // 保留两位，避免长测打印出 0.6666666666666666 这种读数
    avgEvents: logged ? Math.round((events / logged) * 100) / 100 : 0,
    coverage: list.length ? Math.round((logged / list.length) * 1000) / 1000 : 0,
    topActor,
    topCount,
    topKind,
    topKindCount,
    kinds: kindCount.size,
    chronicle: (world && world.chronicle ? world.chronicle.length : 0),
  };
}

// ── 面板短行 ───────────────────────────────────────────────
/**
 * 检视面板上的几行，与 `family.js` 的 `lineageOf` **同形**（`[[标签, 值], ...]`）。
 *
 * 刻意**不复用 `compileBiography`**：传记是给人读的长文（几百字），
 * 面板一格塞不下。这里只挑「一眼能看出这个人有没有故事」的四五条。
 * 空的时候返回空数组（不是一堆「暂无」），让面板可以整段不渲染。
 */
export function biographyRows(world, entity) {
  const rows = [];
  if (!entity) return rows;
  const log = Array.isArray(entity.log) ? entity.log : [];
  if (log.length) {
    rows.push(['生平', `${log.length} 件已记`]);
    // 最近一件：面板上最有信息量的就是这一行
    const last = log[log.length - 1];
    rows.push(['最近', `仙历 ${Math.floor((last.day || 0) / YEAR_DAYS)} 年 · ${clampText(last.text, 24)}`]);
  }
  const events = compileEvents(entity);
  if (events.length) {
    // 「编入传记」是筛选之后的条数——它会明显少于生平条数，
    // 这个差值本身就是信息（大部分事不够重要、或归属不明）。
    rows.push(['入传', `${events.length} 件`]);
    rows.push(['首记', `仙历 ${events[0].year} 年 · ${clampText(events[0].text, 22)}`]);
  }
  const disciples = countRelations(entity, RELATION_TYPES.DISCIPLE);
  if (disciples) rows.push(['弟子', `${disciples} 人`]);
  if (entity.pastLife || (entity.incarnation || 1) > 1) {
    rows.push(['命系', `第 ${entity.incarnation || 1} 世`]);
  }
  const attn = attentionOf(world, entity);
  if (attn >= 2) rows.push(['注目', ATTENTION_NAMES[attn]]);
  return rows;
}

// ── 测试出口（照主线 BiographyCompiler.js:200-205 的做法）────
/**
 * 冻结导出内部纯函数，供测试与探针直接调用。
 *
 * 为什么非要这一手：`compileBiography` 的产物是一大段中文，
 * 用正则去断言「参与判据拦住了 major 源」很容易写出**看起来通过、
 * 其实匹配到了别处**的测试（主线附录 A 那四条断言就是这个套路）。
 * 把纯函数摊出来，测试可以直接断言 `actorParticipated(...) === false`。
 */
export const biographyInternals = Object.freeze({
  clean,
  canonicalText,
  eventText,
  eventDay,
  importanceOf,
  actorParticipated,
  semanticKey,
  compileEvents,
  kindTag,
  progressOf,
  attentionOf,
  countRelations,
  ensureLog,
  EVENT_SOURCES,
  SOURCE_BASE,
  ALLOWED_ROLES,
  KIND_TAG,
  YEAR_DAYS,
});
