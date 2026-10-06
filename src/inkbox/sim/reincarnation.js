// 水墨沙盒 · 转世
//
// 原作（reincarnationSystem.js / pastLifeMemorySystem.js / descendantSystem.js /
// bloodlineSystem.js，合计 944 行）里，修士死后神魂入幽冥，按「执念」与污染
// 决定是自然转世、滞留，还是干脆不入轮回；转世者带着前世记忆碎片降生，
// 若干年后要面对「继承前世 / 拒绝前世 / 融合两世」的抉择。
//
// 沙盒是**单图**、没有幽冥位面，所以这里是同一套机制的降维版：
//
//   · **死路分流保留**（**魂分五路**）。它决定「这条命还回不回来」，是玩法相关的那一半：
//     自然转世 / 滞留幽冥 / 成鬼修 / 怨魂化 / 魂火散尽。
//     ⚠️ 五路里只有**前两路**会把魂推进魂池（`world.souls`）；后三路**不入轮回**，
//        所以在池子里永远看不见——它们靠累计账本 `world.soulLog` 记账。
//        （2026-09-23 起，`ghost` / `wraith` 两路还会在**幽冥界**留下实体，
//         见 `sim/netherLife.js`；`soulLog` 的账本口径**不变**，实体是另一回事。）
//     ⚠️ 下面几段历史注释里还写着「魂飞魄散」，那是**当时**这一路的名字
//        （旧义 = 魂散了）。2026-09-21 按 06 册考古定名改为「成鬼修」（魂被留下）。
//        那几段是**反面教材**，保留原措辞，别当成现行语义读。
//   · **神魂池是世界里一个带上限的数组**，不再有独立的幽冥地图。
//   · 转世者附在村庄的**新生儿**上，带着前世姓名、记忆碎片与宿缘关系。
//   · 记忆觉醒时，宿缘关系**按原来的类型**接回今生的关系网。
//
// ⚠️ 最后那一点是刻意的：如果新造一个「宿缘」关系类型，就没有任何系统会读它
// （师徒传道、道侣共鸣、宿敌相争全是按类型分派的），
// 等于又多一处「算出来了但没人读」的静悄悄坏死。
// 接回原类型之后，既有逻辑立刻就能用上，而且语义也更对——
// 「前世故人循因果找上今生」，找上来的本来就是旧日那种关系。

import { TIME } from '../core/config.js';
import { clamp } from '../core/noise.js';
import { RELATION_TYPES } from './relations.js';
import { lifespanFor, realmFor, realmLabel } from './cultivation.js';
// 名册侧的回填（见 `necrology.js` 的 `markSoulRoute`）。方向是**单向**的：
// 本模块 → necrology，而 necrology **不**import 本模块（它要的中文路名在界面层拼），
// 所以这条新边**不引入新的 import 环**。⚠️ 别顺手把 `ROUTE_LABEL` 挪过来给
// necrology 用——那会把这条边变成双向环，而本项目已经有一条
// `necrology ↔ cultivation` 的环在交学费了。
import { markSoulRoute } from './necrology.js';
// 幽冥侧的实体构造与 tick（契约 `reports/d5/BATCH2-DESIGN.md`）。
// 方向是**单向**的：本模块 → netherLife，而 netherLife **不**import 本模块
// （它要的字段全在 core/config.js 里），所以这条边不引入新的 import 环。
import { spawnNetherGhost } from './netherLife.js';
// B0.1 观测计数器（只自增，不抽签、不改状态、不进存档）。见 sim/telemetry.js。
import { bumpTelemetry } from './telemetry.js';

/** 神魂池上限。满了就丢掉等得最久的那个——「多數神魂散于天地」 */
export const SOUL_CAP = 120;

/**
 * 死路（**魂分五路**）。
 *
 * ⚠️⚠️ **定名不得擅改**：`剧情文案素材/00_文案使用说明（AI与开发者必读）.md:229-239`
 * 明写「魂分五路（自然转世/滞留/鬼修/怨魂化/魂火散尽）…是**考古定名，不得擅改或另造同义词**」，
 * 且 `06册 §5.2` 的标题就是「魂分五路（natural / linger / ghost / wraith / gone）」。
 *
 * ⚠️ **2026-09-21 更正（用户拍板「按考古定名改代码」）**：本表原先只有**四路**，
 * 缺 `gone`；而且 `ghost` 的语义**与定名正好相反**——
 *   · 定名（`06册 G13-08`，标注「（注：鬼修）」）：`ghost` = **魂留下来，成鬼修**；
 *   · 旧代码：`ghost` = 「入不了轮回、连神魂都留不下」（`enterNether` 直接 `return null`）。
 * 本文件原先那条「⚠️ 命名雷」注释以为冲突对象是「原作」，**没意识到真正有约束力的
 * 是 06 册的考古定名**。现已按定名收敛。
 *
 * 每一路的**文案依据**（规则不是我发明的，是从 06 册倒推的）：
 *   · `natural` 自然转世 —— G13-06「魂清如水，冥河照不见影子…对岸接得最快」
 *   · `linger`  滞留幽冥 —— G13-07/G13-12「有些魂在河边坐下了，说等一个人」
 *   · `ghost`   成鬼修   —— **G13-04「怨气重的过不了石，石头把他们留下，慢慢磨」**
 *                          （即：浊气/业障中重 → 被留下 → 成鬼修。**魂留下，不散**）
 *   · `wraith`  怨魂化   —— G13-09「怨念与浊气纠缠，不入轮回，化作怨魂」
 *   · `gone`    魂火散尽 —— G13-10「走到河心，自己散了，像一盏油尽的灯…
 *                           **能走到自己散的，多半已经不累了**」（寿终、无怨、无牵挂）
 */
export const SOUL_ROUTES = Object.freeze({
  NATURAL: 'natural',
  LINGER: 'linger',
  GHOST: 'ghost',
  WRAITH: 'wraith',
  GONE: 'gone',
});

export const ROUTE_LABEL = Object.freeze({
  natural: '自然转世',
  linger: '滞留幽冥',
  ghost: '鬼修',
  wraith: '怨魂化',
  gone: '魂火散尽',
});

/**
 * 名册上的**第六种去向**——但它**不是魂路**。
 *
 * 元神夺舍成功的人（`possession.js` 的 `tryPossession` 返回真）**没有**进幽冥：
 * `life.js` 的 `if (!possessed) enterNether(...)` 就是「一次死亡只产出两条命里的
 * 一条」这条互斥规则的**全部实现**。于是他在逝者名录上会与「没留下魂的凡人」
 * 长得一模一样（`soulRoute === null`），玩家分不出「魂散」与「人还活着，只是换了具身子」。
 * 这个字面量就是用来把这两种情形分开的。
 *
 * ⚠️⚠️ **绝不能把它加进 `SOUL_ROUTES` / `world.soulLog`**：
 *   · `soulLog` 的五路是**考古定名**（06 册 §5.2，见上面 `SOUL_ROUTES` 的注释），
 *     多一个键就是擅改定名；
 *   · `soulLog` 的**键集**有断言盯着（`inkbox-longrun.mjs:737-745` 逐键比对
 *     `ROUTE_LABEL` 与 `soulLog` 的键集），多一个键会直接把它撞红；
 *   · 语义上它也不是「魂归何处」——这个人根本没死透，魂还在自己身上。
 */
export const SOUL_ROUTE_POSSESS = 'possess';
//   键名沿用是历史原因，**值存进了存档**（`soul.route`），所以不能随手改名。
//   看到 `ghost` 时不要按原作的意思理解，也不要"顺手修回去"。

/**
 * 取（必要时先建）魂路累计账本。
 *
 * ⚠️ 必须**防御性**地取，不能假定它一定存在：`World` 的构造器会建它，
 * 但手工拼出来的 `world` 对象（smoke 测试、探针、老档迁移路径）不一定有。
 * 这不是假想的风险——`possession.js:241-250` 为同一件事单独写了一段
 * 「每次用之前都要过这一道」。
 *
 * ⚠️ 还要**逐键**兜底，不能整体兜：老档里可能只有 4 个键（`gone` 是
 * 2026-09-21 才新增的第五路），而 `log[route] += 1` 遇上 `undefined`
 * 会算出 `NaN`——`NaN` 不报错、`JSON.stringify` 还会把它变成 `null`，
 * 于是账本从此静默失效（同 `riftLog` 从 4 键扩到 5 键时的处置）。
 */
export function ensureSoulLog(world) {
  if (!world.soulLog || typeof world.soulLog !== 'object') {
    world.soulLog = { natural: 0, linger: 0, ghost: 0, wraith: 0, gone: 0 };
  }
  const log = world.soulLog;
  if (typeof log.natural !== 'number') log.natural = 0;
  if (typeof log.linger !== 'number') log.linger = 0;
  if (typeof log.ghost !== 'number') log.ghost = 0;
  if (typeof log.wraith !== 'number') log.wraith = 0;
  if (typeof log.gone !== 'number') log.gone = 0;
  return log;
}

/**
 * 「正常修行」每百年会积下的浊气：0.0004/天 × 360 天 × 100 年。
 * 用来把污染换算成「相对于活了多少岁，是不是偏脏」——理由见 `deathRoute`。
 */
const NORMAL_POLLUTION_PER_CENTURY = 14.4;

/** 污染的上限（`cultivation.js` 里 clamp 到 100） */
const POLLUTION_CAP = 100;

/**
 * 业障 / 浊气高到什么程度就「入不了轮回」。
 *
 * ⚠️ 这几个数**必须贴着字段的上限取**，理由见 `deathRoute` 里那段实测：
 * 因果与污染在这套数值里都是**会顶到上限的累加器**，
 * 因果中位数就有 42（宗门战争太频繁），拿 4 去卡等于把所有人挡在门外。
 */
const KARMA_GHOST = 70;
const KARMA_WRAITH = 95;
const MURKY_GHOST = 45;
const MURKY_WRAITH = 70;

/**
 * 哪些人有资格留下神魂。
 *
 * 不能人人都留。凡人寿元 4200 天、活着一千多人，八百年下来是几万条命，
 * 排队转世既不现实也没意义——原作也是这么分的（`importantLineage`
 * 决定要不要走完整流程，其余走一个只记数的 `backgroundReincarnate`）。
 * 所以按境界给概率：转世得是「值得记一笔」的事件，不能变成流水线。
 *
 * ⚠️ 门槛曾经只开在「金丹以上（level >= 20）」，而且**理由是编的**——
 * 我当时写的是「转世得值得记一笔」，却从没量过各境界的死亡数。
 * 实测（300 年探针，中堂 · 种子 20260914）：
 *   炼气~筑基死 9919 次 · 金丹死 184 次 · 元婴以上死 62 次
 * 高境界确实会死（多是被打死的，不是老死的），但**低境界的基数大两个数量级**。
 * 只开金丹以上，等于把分母砍掉 98%；再叠上 `deathRoute` 那个污染 bug，
 * 就出现了「死了 246 个金丹以上、造出 0 个神魂」这种彻底失效。
 * 现在按境界给一串递减的概率，低境界取「千中取几」——
 * 数量多、但每条命的分量轻，正好对应原作里只记数的 `backgroundReincarnate`。
 */
export function soulTier(entity) {
  const level = entity.level || 0;
  // 元婴 = 元神已成，死而神魂不散。这是「必留」的那一档，也正好是它名字的意思。
  if (level >= 30) return 1;
  if (level >= 20) return 0.1;    // 金丹：一成
  if (level >= 10) return 0.03;   // 筑基：百中取三
  if (level >= 1) return 0.002;   // 炼气：千中取二——基数最大，只能给到这么低
  return 0;                        // 凡人：魂散，不留
}

/**
 * 这个人是**寿终**（自然死亡）吗？
 *
 * 判据与 `life.js` 的死亡触发同源：`hp <= 0 || age >= lifespan`，
 * 所以「寿终」= **没被打死**（`hp > 0`）且**活满了寿元**。
 *
 * ⚠️ 为什么必须抽成一个函数、而不是在两处各写一遍：
 * 它现在有**两个**读者——`deathRoute` 的 `gone` 分支（判魂火散尽）
 * 与 `enterNether` 的免抽签（见那里的注释）。两处若各写各的，
 * 将来改一处就会静默地漂开，而「漂开」在这套数值里不报错，
 * 只表现为「gone 突然变成 0」或「寿终的魂突然又被抽签挡掉」。
 *
 * ⚠️ `lifespan` 缺失时返回 **false**（保守）：宁可漏判成「不是寿终」，
 * 也不拿一个编出来的寿命去判生死。
 *
 * ⚠️⚠️ **「寿元被砸到 age 以下」不算寿终**（2026-09-21 修，第三类漏判）：
 * `applyBreakthroughFailure` 突破失败会把 `lifespan` 按低一档境界**重算**
 * （三个后果档里有两个这么做，合计 80%），于是 `age >= lifespan` 会在
 * **同一个 tick** 里变成真，随后死亡清扫就把它判成「寿终」。
 * 但那是**寿元折损而死**，不是寿终正寝——判成寿终会让它静默地流进
 * `gone` / `natural`，把魂路账本变成假读数。
 * 判据：`life.js` 的 `stepEntity` 在**每个 tick 开头**写下 `_lifespan0`（临时字段，不进档）。
 * 若本 tick 开始时 `age` 还没到那时的寿元、结束时到了，就说明寿元是**本 tick 被改小的**。
 */
export function diedOfOldAge(entity) {
  if (!(entity.hp > 0)) return false;
  const age = entity.age || 0;
  if (!(age >= (entity.lifespan || Infinity))) return false;
  // `_lifespan0` 未定义（探针手搓的实体 / 上界实体）时**不启用**本判据，
  // 退回旧行为——保守方向仍是「可能多判一次寿终」，但那正是本判据要防的东西，
  // 所以只在拿得到快照时才生效，且测试必须覆盖「有快照 + 被砸寿元」这条路径。
  const lifespan0 = entity._lifespan0;
  if (typeof lifespan0 === 'number' && age < lifespan0) return false;
  return true;
}

/**
 * 死路分流。按因果 / 境界 / 是否横死决定。
 * 对应原作的 `deathRoute`。
 *
 * ⚠️⚠️ 这里有一个**把整条转世链路变成死代码**的坑，务必留着别改回去。
 *
 * 最初我按 `pollution >= 40 魂飞魄散 / >= 60 怨魂化` 分档，
 * 注释还写着「阈值按沙盒的数值域重新标过」——**那句话是假的，我没量过**。
 * 污染在这个模拟里是个**单调线性累加器**（`cultivation.js` 里
 * `pollution += 0.0004/天`，邪修 0.0022/天，上限 100；只有突破时 -1、
 * 以及极少数世界事件 -15）。也就是说：
 *
 *     污染 ≈ 「活了多久」× 0.0004 × 360 − 突破次数
 *     炼气寿终（110 年）≈  8 · 筑基（240 年）≈ 16
 *     金丹寿终（620 年）≈ 60 · 元婴以上（1500 年起）直接顶到上限 100
 *
 * 拿 40/60 去卡，等于把**所有金丹以上的死者**一律判成魂飞魄散。
 * 实测代价：金丹以上死了 246 次，造出 0 个神魂，转世一次都没发生过。
 * 而 `inkbox-smoke` 的 5f 那 29 条断言全绿——因为它们都是手工构造实体、
 * 把 `pollution` 显式写成 0 的，测的是一个真实世界永远不会出现的输入域。
 *
 * 所以判「入不入得了轮回」只用**事件驱动**的信号：
 *   · `karma` 记的是「做过什么」（杀同门 +12、杀外人 +3），不会随时间自己涨；
 *   · 污染则先减去「同龄人正常修行该积的量」，只留**超出的那部分**。
 *
 * 而那个「该积的量」本身要**卡在上限上**（`Math.min(POLLUTION_CAP, ...)`）。
 * 这一步是关键，不能省：元婴寿元 1500 年，正常也该积 216 点，
 * 而污染上限只有 100——不封顶的话「超出部分」永远是负数，
 * 于是**所有活得久的人都被判成「干净」**，比原来的 bug 还糟。
 * 封顶之后语义就对了：
 *   · 元婴寿终（活满 1500 年、污染顶到 100）→ 超出 0，判不了，放它去转世；
 *   · 百岁就脏到 100 的邪修 → 超出 85.6，判怨魂化。
 * 换句话说——**污染只在「还没老到把上限顶满」时才有信息量**，
 * 一旦顶满，它就再也区分不出「活得久」和「作恶多」了。
 *
 * ─────────────────────────────────────────────────────────────
 * ⚠️ 上面这一整段推理，是**我先猜、后被实测推翻**的。留在这里当反面教材。
 *
 * 我当时认定凶手是污染，还据此写了很长一段解释。加插桩实测之后：
 *
 *     金丹以上死者 422 人 · 临死因果 p50/p90 = 42/100 · 临死污染 p50/p90 = 15/56
 *     逐个归因：被 `karma >= 4` 挡掉的 **422 人（100%）** · 被污染挡掉的 **0 人**
 *
 * 也就是说：**真凶是因果，污染一个人都没挡住。** 而且——
 * 金丹以上**不是老死的，是打死的**：临死年龄中位数只有 **28 岁**，
 * 不是我推的「寿终正寝、污染攒到 60」。那个「污染 ≈ 活了多久」的公式本身没错，
 * 只是**真实世界里的死亡样本根本不长这样**。
 *
 * `karma >= 4` 是从 `breakthroughChance` 抄的，那是**突破惩罚**的量纲
 * （`karma*0.025` 封顶 0.2，所以在那里 4 就算「重」）；
 * 而这个世界的因果中位数是 **42**，照抄过来就把所有金丹以上一律判成魂飞魄散。
 * 实测代价：金丹以上死了 246 次、造出 **0** 个神魂，
 * 转世只在低境界里发生，「强魂归来」这件事从来没出现过。
 *
 * 而 `inkbox-smoke` 的 5f 那 29 条断言**全绿**——因为它们手工构造实体时
 * 把 `pollution` / `karma` 显式写成 0，测的是一个真实世界永远不会出现的输入域。
 *
 * 三条教训，一条比一条贵：
 *   1. **阈值要在实测分布上取，不能从别的量纲照抄。**（污染、因果、境界门槛，同一个错误犯了三遍）
 *   2. **「累加器」类字段（单调增长、有上限）在单测里手写常量等于没测**——
 *      必须按它在真实世界里跟什么绑定来构造输入。
 *   3. **猜出来的归因，要用插桩验一遍再写进注释。** 不然就是给自己留假史料。
 */
export function deathRoute(entity) {
  // ⚠️ 原先这里有一句 `const level = entity.level || 0;`。寿终优先之后，
  //    唯一读它的那一行（`level >= 30 || hp <= 0`）已删，它成了死变量，故移除。
  const pollution = entity.pollution || 0;
  const karma = entity.karma || 0;
  const ageYears = (entity.age || 0) / TIME.daysPerYear;
  const baseline = Math.min(
    POLLUTION_CAP,
    NORMAL_POLLUTION_PER_CENTURY * (ageYears / 100),
  );
  const murky = pollution - baseline;

  // ── 寿终优先（2026-09-21，用户拍板）────────────────────────────
  // 老死压过业障。理由**是实测的，不是审美**：寿终要求活到 110–200 岁，
  // 而活得久就必然杀够人把 karma 顶到 `KARMA_MAX = 100`（`core/cultivation.js:440`），
  // 于是 ≥ `KARMA_WRAITH`(95) → 一律判怨魂化。插桩实测（`scripts/_natprobe.mjs`）：
  // 4 例寿终者 karma **全是 100.0**、murky 70.8–80.9，**4/4 判成怨魂化**，
  // 于是 `natural`（自然转世）**结构上不可达**——长测里它恒为 0。
  // ⇒ **长寿与「业障低」在这个世界里互斥**，所以「老死」这一支必须**先判**，
  //    否则它永远被业障吃掉。代价（明确记下）：老死的恶人不再成怨魂。
  if (diedOfOldAge(entity)) {
    // 「油尽」+「不累了」：牵挂 ≤ 1 → 魂火散尽；否则自然转世。
    // ⚠️ 阈值是 `<= 1` 而**不是** `=== 0`（2026-09-21，用户拍板）：实测 3 种子 × 300 年，
    //    「牵挂 === 0」的候选池恒为 **0/0/0**——在有人口、有家族、有宗门的世界里，
    //    「无牵挂」结构上不可能，所以 `=== 0` 会让 `gone` 也成为死路。
    // ⚠️ `diedOfOldAge` 自带 `hp > 0`（见其定义）：横死（`hp <= 0`）不会被判成「油尽」，
    //    否则被打死的魂会被**静默地**判成寿终。
    return collectBonds(entity).length <= 1 ? SOUL_ROUTES.GONE : SOUL_ROUTES.NATURAL;
  }

  // ── 以下**全部是横死**（非寿终的死亡只可能来自 `hp <= 0`）──────────
  // 怨魂化：业障压不住，或者比同龄人脏出一大截，死了也不肯散
  if (karma >= KARMA_WRAITH || murky >= MURKY_WRAITH) return SOUL_ROUTES.WRAITH;
  // 成鬼修：业障或浊气重到过不了冥河的石——**魂被留下，慢慢磨**（不散、也不入轮回）。
  // ⚠️ 这一支原先叫「魂飞魄散」，与 06 册的考古定名**正好相反**（见文件头「魂分五路」）。
  //    依据 G13-04：「怨气重的过不了石，石头把他们留下，慢慢磨」。
  //    改名不只是文案：旧语义「魂散了」意味着这条路**什么都不产出**；
  //    新语义「成了鬼修」意味着它是幽冥界的人口来源——这是**两条互斥的规则**。
  if (karma >= KARMA_GHOST || murky >= MURKY_GHOST) return SOUL_ROUTES.GHOST;
  // ── 滞留 vs 自然转世：按**宿缘**分流（2026-09-21 · 8-C 落地）──────────
  // 判据取自 06 册 §5.2 的考古定名，**不是这里发明的**：
  //   · G13-07「有些魂在河边坐下了，**说等一个人**。河官不催，只在册子上批『在等』二字」
  //   · G13-12「有些魂坐在渡口不走…问他等什么，他说**等一个还没死的人**」
  // ⇒ `linger`（滞留幽冥）的语义就是「**有牵挂、有宿缘**」，故判据 = **宿缘非空**。
  //   定名出处：`剧情文案素材/00_文案使用说明（AI与开发者必读）.md:229-239`
  //   「魂分五路（自然转世/滞留/鬼修/怨魂化/魂火散尽）…是**考古定名，不得擅改或另造同义词**」；
  //   分类标题见 `06册 §5.2`「魂分五路（natural / linger / ghost / wraith / gone）」。
  //
  // ⚠️ 这里原先的判据是 `level >= 30 || entity.hp <= 0`（`level >= 30` 半支早前已删），
  //    即「**横死 ⇒ 滞留**」——**`hp <= 0` 是代码自己发明的**，文案里根本没有这一条。
  //    `linger` 本该按「有宿缘」判，这是项目里**已登记的忠实度缺口**，本轮按文案收口。
  //
  // ⚠️⚠️ **这会挪动所有魂的分流**：此前凡横死（= 非寿终死亡的全集）一律 `linger`，
  //    现在其中**无宿缘**的那部分改判 `natural`。既有 `soulLog` 读数全部变化、
  //    与旧版**不可比**——尤其 `natural` 从「结构上恒为 0」变成非零，**这正是本次要救活的**
  //    （它恒 0 的第一个原因「业障吃掉寿终」已在上面修掉，这里是第二个原因）。
  //
  // ⚠️ 复用**本文件私有**的 `collectBonds`（约 :437）：它返回 `[otherId, type, score]`
  //    数组、实体无 `relations` 时返回 `[]`。**不要**另写一份过滤逻辑——
  //    那会出现第二份真相（探针 `_soulrouteprobe.mjs` 已因它没导出而不得不复刻一份口径）。
  //
  // ⚠️⚠️ **本函数必须是纯函数、一次 `rng()` 都不抽**：`enterNether` 把账本记在
  //    抽签**之前**，那条前移之所以是 RNG 中立的，全靠「`deathRoute` 不抽签」这一点。
  //    一旦这里抽签，账本前移就不再中立，会**静默地移动世界线**。`collectBonds` 是纯读，
  //    用它判路不引入任何抽签——**不要**为了「加点随机性」在这里调 `rng`。
  return collectBonds(entity).length > 0 ? SOUL_ROUTES.LINGER : SOUL_ROUTES.NATURAL;
}

/**
 * 死者身份的**快照**（契约 §三 的 `ghostOf`）。
 *
 * ⚠️⚠️ **零 id 引用，全是值**：`ref` 用 `'mortal:<id>'` **字符串**，绝不存裸的
 * 凡间 id 数字。理由（`planes.arriveUpper` 已经踩过这个坑）：凡间 id 与幽冥 /
 * 上界 id **同段会撞号**（三个 `World` 的 `nextEntityId` 各自从
 * 1 / `UPPER_ID_BASE` / `NETHER_ID_BASE` 起编），存裸数字就是指向别人的
 * 悬垂指针，而且**不报错**。
 *
 * 这是「幽冥里的这只鬼，对应到死去的哪个修士」的那根线，也是未来玩家操作
 * 鬼魂的接口（本轮只留接口，不做操作）。
 *
 * ⚠️ 纯读、一次 `rng()` 都不抽——`enterNether` 在凡间主随机流上，任何抽签
 *    都会静默移动世界线（铁律一）。
 */
export function ghostSnapshot(world, entity, route) {
  const faction = world.factionById(entity.faction);
  return {
    ref: `mortal:${entity.id}`,
    name: entity.name || null,
    level: entity.level || 0,
    // 灵根是**对象**（`rollSpiritRoot` 产 `{ elements, quality, rootName, ... }`），
    // 快照只留名字（契约示例：`root: '幽冥灵根'`）。没有灵根就是 null。
    root: entity.root ? (entity.root.rootName || null) : null,
    // 宗门存**名字**（不是 id）：凡间宗门 id 与幽冥 / 上界 id 无关，
    // 存 id 是悬垂引用（同 `soul.ofSectName` 的理由）。取不到就 null。
    sectName: (faction && faction.name) || null,
    deathDay: world.day,
    route,
    incarnation: entity.incarnation || 1,
  };
}

/** 记一条神魂。返回 null 表示这个人不留神魂（魂散）。 */
export function enterNether(world, entity, rng) {
  const tier = soulTier(entity);
  if (tier <= 0) return null;
  // ── 判路 + 记累计账本（**必须在抽签之前**）──────────────────────
  // ⚠️ 顺序是承重的：账本记在抽签**之前**，它才是五路普查。
  //    原先写在抽签之后（两道闸门之后），后果是**只覆盖 1.86% 的路线判定**
  //    （插桩实测：9389 次判定 → 账本只记 175 条，见 `scripts/_natprobe.mjs`），
  //    而它同时顶着「五路里有三路不进魂池的**唯一**读数」这个名义——
  //    也就是**名义是普查、实际只是「抽签中选者」的分布**。2026-09-21 修。
  //
  //    为什么前移是安全的：`deathRoute` **纯读、一次 `rng()` 都不抽**，
  //    所以把它提到 `rng()` 之前，**随机流一点没动**，世界线不受影响——
  //    这正是本改动能与「寿终优先」分开验收的原因。
  //
  //    代价：恒等式由 `natural + linger === nextSoulId - 1` 放宽为
  //    `natural + linger >= nextSoulId - 1`。**放宽是对的**——入池的魂只是
  //    `natural`/`linger` 的**子集**（一大批落选者留在池外），所以现在只有
  //    「入池」那一侧是精确的；长测按新口径断言（见 `inkbox-longrun.mjs`）。
  const route = deathRoute(entity);
  const soulLog = ensureSoulLog(world);
  soulLog[route] += 1;
  // ── 名册侧回填：把这一路写回他刚入册的那条逝者记录 ──────────────
  // 没有这一步，「这个人死了之后去哪了」在界面上永远查不到：
  // `rememberDead` 跑在 `onDeath()` 最开头（那时路还没判），
  // 而 `soulLog` 只有五路的总数、`world.souls` 只装**入池**的那两路——
  // 于是「张三归了哪一路」既不在名册里，也无法从任何账本反推。
  //
  // ⚠️ 位置在 `soulLog[route] += 1` 之后、**抽签之前**：这样它与 `soulLog`
  //    记的是**同一次判定的同一个值**，两者不可能分叉。落选（下一行 return null）
  //    与后三路（不进池）都会走到这里，与 `soulLog` 的口径完全一致。
  // ⚠️ `markSoulRoute` 纯读纯写、一次 `rng()` 都不抽，所以插在这里不移动随机流。
  // ⚠️ 凡人到不了这一行（`soulTier === 0` 在上面就 return 了）——名册上他们的
  //    `soulRoute` 保持 `null`，这是**对的**：他们连 `soulLog` 都不记一笔。
  markSoulRoute(world, entity.id, route);

  // ── 抽签：决定这条魂**进不进池**（与「路怎么判」是两件事）──────────
  // ── 寿终的修士**免抽签**（2026-09-21，用户拍板）────────────────
  // 为什么：`soulTier` 的存在理由是「不能人人都留魂」——它自己的注释写的是
  // 「凡人寿元 4200 天、活着一千多人，八百年下来是几万条命，排队转世既不现实也没意义」。
  // 那说的是**凡人**。而**寿终的修士不是凡人**，恰恰是那段注释里
  // 「转世得是值得记一笔的事件」的那种命——何况寿终在这套数值里**极其稀有**
  // （实测 300 年只有 1–5 次，见 `scripts/_soulrouteprobe.mjs`）。
  //
  // ⚠️ 这条豁免**不是** `gone` 的唯一闸门。真正的堵点是「寿终者必有牵挂」
  //    （候选池 0/0/0，已按用户拍板放宽为 `牵挂 <= 1`，见上面的 `deathRoute`）。
  //    豁免解决的是**第二道**闸门：低境界 `tier` 只有 0.002，寿终的魂会因为
  //    抽签落选而进不了池——而那正是「值得记一笔」的命。
  //
  // ⚠️ 上一行 `tier <= 0` **仍然拦着凡人**（`level === 0` 的人 `tier` 就是 0），
  //    所以这条豁免**不会**把几万条凡人命放进魂池——这正是它安全的原因。
  //    若哪天有人把 `tier <= 0` 挪到这一行之后，凡人会瞬间淹没魂池。
  //
  // ⚠️ 代价要说清楚：寿终的魂**不再抽那一次 `rng()`**，所以它出现时
  //    随机流会平移一次。这无法避免（要免抽签就不能抽），但寿终极稀有，
  //    扰动面最小。**不要**为了「不扰动」改成无条件先抽一次再判断——
  //    那会让**每一个** `tier >= 1` 的实体都多抽一次，扰动面反而大得多。
  //
  // ⚠️⚠️ **这一行的调用条件与位置逐字保持原样（2026-09-23）**：`tier >= 1` 与
  //    「寿终」仍然短路**不抽**，其余照抽。把它拆成 `drawsLot` / `lotPass`
  //    两行，**不是为了改抽签，而是为了让下面那个三分支能排在「落选 return」之前**
  //    （理由见那个分支的注释）。抽签的次数与条件一个都没变 ⇒ 随机流位置不变。
  //    `scripts/_ghostrng.mjs` 钉着这件事：它跑「不挂幽冥」与「挂幽冥」两条线，
  //    要求前 40 位凡间实体逐条一致——**改这一行之前先跑它**。
  const drawsLot = tier < 1 && !diedOfOldAge(entity);
  const lotPass = !drawsLot || rng() >= tier;

  // ── 入不了轮回的三路：**不**进魂池，但会在幽冥留下实体（8-C/8-D）─────────
  // 池子（`world.souls`）的语义是「排队等转世」——`takeDueSoul` 只按 `dueDay`
  // 到期取魂，**完全不读 `route`**。所以把这三种魂塞进池子，它们到期后会照常
  // 转世成人，而那正是这三条路要避免的事（魂散尽 / 被留下 / 不入轮回）。
  // ⚠️ 也就是说：**「记录」与「入池」是两件事**，账本记的是前者。
  //
  // ⚠️⚠️ **口径更新（2026-09-23，契约 `reports/d5/BATCH2-DESIGN.md` §二）**：
  //    此前这三路「什么都不产出」——`return null` 之后就没了，幽冥里空无一物。
  //    现在它们**仍然不进魂池**（这一点不变），但其中两路会在**幽冥界**
  //    留下可观察的实体：
  //      · `ghost`（成鬼修）  ⇒ 幽冥里一只 **鬼修**（起步=游魂，level 1）；
  //      · `wraith`（怨魂化） ⇒ 照旧留怨气 `site`（不变），**并且**幽冥里一只
  //                              **普通鬼魂**（`soulKind === 'ghost'`）；
  //      · `gone`（魂火散尽） ⇒ 什么都不做（魂都散了，不该有任何实体）。
  //    ⚠️ 落成实体**不改变随机流**：`spawnNetherGhost` 一次 `rng()` 都不抽
  //       （落点走纯哈希，见 `netherLife.js` 头注释）。
  //
  // ⚠️⚠️ **本分支必须排在「落选 return」之前**（2026-09-23 修，**承重**）。
  //    原先它排在 `if (tier < 1 && ... && rng() >= tier) return null;` **之后**，
  //    于是这三路要先过**池子**的抽签才能走到这里——而 `soulTier` 对炼气
  //    只有 **0.002**、筑基 0.03、金丹 0.1（见那个函数的表）。
  //    实测后果：`ghost` 路 **45–61 条 / 300 年**，但真能留下实体的只有 **1–3%**
  //    ⇒ **面板印「鬼修 45」，幽冥里只有个位数**。这正是 `BACKLOG.md` #1 那条
  //    P1（「明显数据错误导致体验失真」）的最终形态。
  //
  //    为什么这是**范畴错误**而不是「数值偏低」：池子抽签的存在理由是管
  //    「魂池别被凡人淹掉」（`soulTier` 注释的原话：凡人八百年几万条命，
  //    排队转世既不现实也没意义）。而这三路**根本不进池**（见上）。
  //    拿一个为池子设的抽签去管不进池子的三路，是拿错了尺子。
  //    改后 `soulLog[route]` 与幽冥实体数**口径一致**，面板那句才不是谎。
  if (route === SOUL_ROUTES.GHOST
    || route === SOUL_ROUTES.WRAITH
    || route === SOUL_ROUTES.GONE) {
    // 怨魂化会在地上留一处「怨气」——`world.sites` 里唯一由死路产生的记号
    // ⚠️ **仍然只在抽签中选时留下**（保持 8-B 的既有行为**逐字不变**）：
    //    `world.sites` 是**凡间**状态、上限 64，顺手把它也放开会让 site
    //    更快饱和，等于偷偷改了几间的演化——那不是本改动的目的。
    if (route === SOUL_ROUTES.WRAITH && lotPass && world.sites.length < 64) {
      world.addSite({
        kind: 'ruin',
        x: clamp(Math.floor(entity.x), 0, world.w - 1),
        y: clamp(Math.floor(entity.y), 0, world.h - 1),
        name: `${entity.name}的怨气`,
        reward: '阴煞之气',
        age: 0,
        visits: 0,
      });
    }
    // 幽冥实体（守卫：无头测试里 `world.nether` 是 `undefined`，必须安静跳过——
    // 上面 `soulLog[route] += 1` 与 `markSoulRoute` 是既有账本，**照旧执行**，
    // 它们与「有没有幽冥 world」无关）。
    if (world.nether && Array.isArray(world.nether.entities) && route !== SOUL_ROUTES.GONE) {
      spawnNetherGhost(world.nether, {
        kind: route === SOUL_ROUTES.GHOST ? 'ghostCultivator' : 'ghost',
        ghostOf: ghostSnapshot(world, entity, route),
        soulId: null,
        x: entity.x,
        y: entity.y,
      });
    }
    return null;
  }

  // ── 只有**进池的两路**（natural / linger）才受池子抽签管辖 ──────────
  // ⚠️ 这一行**从 `:438` 搬到这里**（2026-09-23）：语义没变，只是位置挪到了
  //    三分支**之后**。搬动的理由是那三路不进池、不该被池子的尺子量
  //    （见上面那个分支的长注释）。抽签本身仍在原处照抽 ⇒ 随机流不变。
  if (!lotPass) return null;

  const level = entity.level || 0;
  // 滞留者走得慢：等得久，但记忆碎片带得多——这是对「境界高」的回报
  const waitYears = route === SOUL_ROUTES.LINGER
    ? 120 + rng() * 240
    : 40 + rng() * 120;

  const soul = {
    id: world.nextSoulId,
    ofName: entity.name,
    ofLevel: level,
    ofRoot: entity.root || null,
    ofSect: entity.faction || 0,
    ofSectName: (world.factionById(entity.faction) || {}).name || null,
    route,
    deathDay: world.day,
    /**
     * 这是第几世。**必须在这里记下来**——`attachSoul` 用的是
     * `(soul.incarnation || 1) + 1`，而这一列原来**全仓只有读、没有写**：
     * 于是每个神魂的 `incarnation` 都是 `undefined`，兜底成 1，
     * 每一次转世回来都得到 **2**——「第几世」这个读数恒为「第二世」，
     * 传了七世的魂和刚死一次的魂长得一模一样。
     * 典型的「字段存在 ≠ 字段生效」，而且它不报错、不 NaN，
     * 只在检视面板上静静地写着一个错的数字。
     */
    incarnation: entity.incarnation || 1,
    dueDay: world.day + waitYears * TIME.daysPerYear,
    fragments: 1 + Math.floor(level / 20) + (route === SOUL_ROUTES.LINGER ? 1 : 0),
    // 宿缘：只留还有分量的那些。指向的人可能早就死了，
    // 觉醒时会逐个确认是否在世，不在就自然作废。
    bonds: collectBonds(entity),
  };
  world.nextSoulId += 1;
  world.souls.push(soul);
  // 池满了，丢**等得最久**的那个——也就是 `dueDay` **最大**的那个。
  //
  // ⚠️⚠️ 这里原本写的是「丢 `dueDay` 最小的」，**正好写反了，而且会把整条链路饿死**。
  // 推理如下（实测抓到过，别改回去）：
  //
  //   `takeDueSoul` 只取 `dueDay <= world.day` 的，也就是「已经到期」的魂。
  //   池子一满，每来一个新魂就挤掉当前 `dueDay` 最小的那个——
  //   **而那个正是马上就要到期、下一秒就该被取走的魂。**
  //   于是池子里的最小 `dueDay` 被每一次新死亡不断往后推，
  //   永远保持在「现在 + 40 年」开外，`takeDueSoul` 就再也找不到到期的魂了。
  //
  //   要命的是这个过程**完全静默**：`enterNether` 正常返回一个神魂对象、
  //   池子大小稳定在 120、`nextSoulId` 一直在涨，每个函数都干净得很。
  //   实测代价：800 年造出 366 个神魂，到第 800 年**活着的转世者是 0**——
  //   早期还没满池时转世过一批，池子满了之后就再也没有过。
  //
  //   改丢 `dueDay` 最大的之后，池子留住的是**最急着要回来的那批**，
  //   它们按期到期、被取走、腾出位置，管道就通了。
  //   语义上也更顺：幽冥满了，**新来的魂排不上队**，而不是「等着投胎的被打发走」。
  if (world.souls.length > SOUL_CAP) {
    let latest = 0;
    for (let i = 1; i < world.souls.length; i += 1) {
      if (world.souls[i].dueDay > world.souls[latest].dueDay) latest = i;
    }
    world.souls.splice(latest, 1);
    // ── B0.1 · 魂池逐出记账 ──────────────────────────────────
    //
    // 为什么必须记这一笔（原文见 `docs/WORLD_LAB.md` §十一）：逐出**不记账**时，
    // 「池子从没满过」与「池子一直在满、一直在丢魂」在 `soulPool` 这一个读数上
    // **同形**——两者都印 120。补上账本之后，「一直在丢」才第一次可见。
    //
    // ⚠️ 只做 `+= 1`：不抽签、不读签、不写 world ⇒ 世界指纹一个字节不变。
    bumpTelemetry(world, 'soulEvictions');
  }
  // ── 滞留者在幽冥留下一只普通鬼魂（契约 §二 / §六）────────────────────
  // 「有些魂在河边坐下了，说等一个人」（`G13-07/G13-12`）——魂**留在池里**
  // 排队等转世（上面的 `world.souls.push`），同时幽冥里有一只**绑着它**的鬼魂。
  // 这只鬼的生死与那条魂绑死：魂一离开魂池（转世 / 被逐出），
  // `stepNether` 的对账（契约 §六 第 1 条）下一 tick 就让它散。
  //
  // ⚠️ 放在**逐出之后**、且要求 `soul` 仍在池里：刚 push 就被 `SOUL_CAP` 逐出
  //    的魂不该留下鬼影（否则它下一 tick 就被对账清掉，等于白造一只、还多记一笔
  //    `ghostBorn`）。`indexOf` 是引用比较，池里最多 120 条，代价可忽略。
  // ⚠️ 与上面的三路一样：不抽 `rng`（铁律一），无头测试里 `world.nether` 缺失
  //    就安静跳过（`soulLog` / `markSoulRoute` 的账本**不受影响**）。
  if (world.nether && Array.isArray(world.nether.entities)
    && world.souls.indexOf(soul) >= 0) {
    spawnNetherGhost(world.nether, {
      kind: 'ghost',
      ghostOf: ghostSnapshot(world, entity, route),
      soulId: soul.id,
      x: entity.x,
      y: entity.y,
    });
  }
  return soul;
}

/** 把关系网里分量够重的关系抽成可序列化的宿缘清单 */
function collectBonds(entity) {
  const out = [];
  if (!entity.relations) return out;
  for (const [otherId, rel] of entity.relations.entries()) {
    if (Math.abs(rel.score || 0) < 30) continue;
    out.push([otherId, rel.type, Math.round((rel.score || 0) * 0.7)]);
  }
  return out;
}

/**
 * 取一个到期的神魂。取 `dueDay` 最小的那个，保证确定性。
 * 没有到期的就返回 null——绝大多数新生儿都是新魂。
 */
export function takeDueSoul(world) {
  if (!world.souls.length) return null;
  let best = -1;
  for (let i = 0; i < world.souls.length; i += 1) {
    if (world.souls[i].dueDay > world.day) continue;
    if (best < 0 || world.souls[i].dueDay < world.souls[best].dueDay) best = i;
  }
  if (best < 0) return null;
  return world.souls.splice(best, 1)[0];
}

/**
 * 把神魂附到新生儿身上。
 *
 * ⚠️ 调用方必须**先把实体 awaken 成修士**再调这里，否则 `level` 还是 0，
 * `lifespan` 也还是凡人的，转世者会当场变成一个「带着前世记忆的凡人」，
 * 而且此后永远不会想起前世（觉醒的触发条件之一是境界）。
 */
export function attachSoul(world, entity, soul, rng) {
  entity.incarnation = (soul.incarnation || 1) + 1;
  entity.soulId = soul.id;
  // 前世灵根：境界够高的会把它带过来，并且资质再抬一档
  if (soul.ofLevel >= 20 && soul.ofRoot) {
    entity.root = soul.ofRoot;
    if (soul.ofLevel >= 30 && entity.root && typeof entity.root === 'object') {
      entity.root = { ...entity.root, quality: Math.min(4, (entity.root.quality || 0) + 1) };
    }
  }
  entity.lifespan = lifespanFor(entity.level || 1) * 360 * (0.85 + rng() * 0.3);
  entity.hp = entity.maxHp;
  entity.pastLife = {
    name: soul.ofName,
    level: soul.ofLevel,
    realm: realmLabel(realmFor(soul.ofLevel)),
    fragments: soul.fragments,
    sect: soul.ofSectName,
    bonds: soul.bonds,
    remembered: false,
    choice: null,
  };
  // 前世的路怎么走的，也算在他身上：滞留者记忆更完整，但也更容易起冲突
  entity.mind = clamp((entity.mind || 60) - (soul.route === SOUL_ROUTES.LINGER ? 6 : 0), 0, 100);
  return entity;
}

/**
 * 每 tick：处理记忆觉醒。
 *
 * 触发条件（先到为准）：
 *   · 修到筑基（10 重）—— 前世碎片被修为冲开；
 *   · 或活满 15 年 —— 没修成也会在某个夜里梦到。
 *
 * 觉醒时做三件事：记一笔编年史、按前世性情做「两世抉择」、把宿缘接回关系网。
 */
export function stepReincarnation(world, dtDays, rng) {
  void dtDays;
  const list = world.entities;
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    const past = e.pastLife;
    if (!past || past.remembered) continue;
    const ageYears = (e.age || 0) / TIME.daysPerYear;
    if ((e.level || 0) < 10 && ageYears < 15) continue;

    past.remembered = true;
    // 两世抉择：今生道心压得住就继承，压不住就斩断
    const mind = e.mind || 60;
    const fragments = past.fragments || 0;
    let choice;
    if (mind < 50 || (e.heartDemon || 0) >= 45) choice = 'refuse';
    else if (fragments >= 3 && mind >= 60) choice = 'inherit';
    else choice = 'fuse';
    past.choice = choice;

    // ── 两世抉择的四种结局一律走 `milestone`（不只是编年史）──────────
    // 用户框架 §6.1 要求大事账本「至少能够记录……重要转世/夺舍事件」——
    // 夺舍那半早就进了（`possession.js` 的 `POSSESSION_SUCCESS`），转世这半
    // 原先只写 `record`，于是「有人想起了前世」这件事快进几十年后就查不到了。
    //
    // 为什么不担心灌满 600 条窗口：这一支**很稀**。300 年长测
    // （`reports/d2/longrun-b5-300y.log`）实测「转世者 28 位 · 已觉醒 25 位」，
    // 约 12 年一次；作为对照，突破那一支当年是「60 年 572 条、548 条是突破」，
    // 才需要设门槛。所以这里**不设门槛**，四种结局都记。
    //
    // ⚠️ `milestone()` 内部先调 `record()`，所以换过去**不会丢编年史那一笔**；
    //    它一次 `rng()` 都不抽（见 `world/World.js` 的注释），因此这次改动
    //    **不移动任何随机流**——把 `record` 换成 `milestone` 是安全的。
    if (choice === 'refuse') {
      past.bonds = [];
      e.mind = clamp(mind + 10, 0, 100);
      world.milestone(
        `【${e.name}】想起前世【${past.name}】，却在道心上把旧债与旧名一并斩了。`,
        'reincarn',
        e,
      );
    } else {
      const keep = choice === 'inherit' ? 1 : 0.6;
      const restored = restoreBonds(world, e, past.bonds, keep);
      if (choice === 'inherit') {
        e.exp = (e.exp || 0) + 40 * Math.max(1, Math.floor((e.level || 1) / 3));
        world.milestone(
          `【${e.name}】前世【${past.name}】的记忆尽数归来，${restored ? `旧日${restored}段因缘重新缠上今生` : '只是身边已无故人'}。`,
          'reincarn',
          e,
        );
      } else {
        world.milestone(
          `【${e.name}】梦见前世【${past.name}】的零碎片段，两世的人与事在心里各占一半${restored ? `，${restored}位旧人循着痕迹找了过来` : ''}。`,
          'reincarn',
          e,
        );
      }
    }

    // 记忆碎片过多 → 两世冲突，心魔上涌。对应原作的 memoryFragments ≥ 4
    if (fragments >= 4) {
      e.heartDemon = clamp((e.heartDemon || 0) + 12, 0, 100);
      past.conflict = true;
      world.milestone(
        `【${e.name}】承载的前世记忆超过今生所能容纳，两世人格开始争夺同一段人生。`,
        'reincarn',
        e,
      );
    }
    void rng;
  }
}

/**
 * 把宿缘接回关系网。返回接上了几段。
 *
 * 只接**双方都还在世**的：前世仇人若早已化为尘土，这条线就自然作废，
 * 不必强留一个指向死人的引用（`onDeathRelations` 会把指向死者的关系清掉，
 * 两边口径不一致的话，读档前后的关系网就会对不上）。
 */
function restoreBonds(world, entity, bonds, keep) {
  if (!bonds || !bonds.length) return 0;
  let n = 0;
  for (let i = 0; i < bonds.length; i += 1) {
    const [otherId, type, score] = bonds[i];
    const other = world.entities.find((x) => x.id === otherId);
    if (!other || other.hp <= 0) continue;
    if (other === entity) continue;
    if (!entity.relations) entity.relations = new Map();
    if (!other.relations) other.relations = new Map();
    const back = REVERSE_TYPE[type] || type;
    entity.relations.set(other.id, { type, score: Math.round(score * keep), since: world.day });
    other.relations.set(entity.id, { type: back, score: Math.round(score * keep), since: world.day });
    n += 1;
  }
  return n;
}

/** 关系的反向类型。接宿缘时两边都得写，否则只有一头认得出对方 */
const REVERSE_TYPE = Object.freeze({
  [RELATION_TYPES.MENTOR]: RELATION_TYPES.DISCIPLE,
  [RELATION_TYPES.DISCIPLE]: RELATION_TYPES.MENTOR,
  [RELATION_TYPES.FORMER_MENTOR]: RELATION_TYPES.FORMER_DISCIPLE,
  [RELATION_TYPES.FORMER_DISCIPLE]: RELATION_TYPES.FORMER_MENTOR,
  [RELATION_TYPES.GRATITUDE]: RELATION_TYPES.BENEFACTOR,
  [RELATION_TYPES.BENEFACTOR]: RELATION_TYPES.GRATITUDE,
});

/** 供测试与面板读的一份读数 */
export function reincarnationStats(world) {
  let reborn = 0;
  let remembered = 0;
  let conflicted = 0;
  const souls = new Set();
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.soulId) souls.add(e.soulId);
    if (!e.pastLife) continue;
    reborn += 1;
    if (e.pastLife.remembered) remembered += 1;
    if (e.pastLife.conflict) conflicted += 1;
  }
  return {
    waiting: world.souls.length,
    reborn,
    remembered,
    conflicted,
    distinctSouls: souls.size,
  };
}
