// 水墨沙盒 · 夺舍
//
// 修士死了，元神不一定散。境界够高的人，元神能抢一具还活着的、境界更低的肉身
// 继续活下去——这就是夺舍。它是「转世」（sim/reincarnation.js）的**另一半**：
//   转世 = 自己的魂回炉重造，从零开始，换一个名字、换一副灵根；
//   夺舍 = 自己的魂直接住进别人的身体，白捡一段修为与一个现成的身份。
// 两者共用同一条死讯，所以必须**互斥**——见下面「约束二」。
//
// ── 考古来源 ─────────────────────────────────────────────
//   src/systems/possessionSystem.js:75-82    触发前提（境界 ≥ 20 / 元神不散 15%）
//   src/systems/possessionSystem.js:85-90    目标选择（活人、境界严格更低、按境界升序取最低）
//   src/systems/possessionSystem.js:92-97    成功率公式与夹取
//   src/systems/possessionSystem.js:111-143  成功后的写入
//   src/systems/possessionSystem.js:145-175  亲友察觉（每种关系独立 50% / 扣 30 分）
//   src/data/narrativeMissingKeysV371.js:163-176  文案池（主线**实际生效**的那一份）
//   reports/migration/nether.md §9                沙盒骨架（本文件对外接口的出处）
//
// ── 主线这五处是坏的，移植时逐条绕开（推理见 nether.md §8）────────
//
// **一、触发点已经断掉，主线里夺舍几乎从不发生。**
// 主线靠「每 360 天扫一遍 `world.cultivators` 里 `hp<=0` 的尸体」，而尸体**在同一个
// tick 就被清扫掉了**（simulationSystem.js:52），夺舍的调度阶段又排在清扫之前。
// 于是这个系统在真实运行中一次都没触发过——公式、文案、成功率全是摆设。
// 本文件**没有** update / 扫描循环：唯一入口 `tryPossession` 由 `onDeath` 同步调用，
// 尸体此刻还在手上，关系网也还完整（见下面「接线」第 3 条）。
//
// **二、公式读了一个幽灵字段 `willpower`。**
// 主线的 Cultivator 从来没有 `willpower`（全仓库只有公式那两行读它），于是
// `|| 50` / `|| 30` 的兜底永远生效，成功率退化成**只由等级决定**的一条被常量压平的
// 曲线（20 级 0.67 → 300 级 0.93）；`:88` 注释写的「优先选道心更弱的」更是假的——
// 排序只用了 `level`。这里换成沙盒真有的 `mind`（道心 0-100，cultivation.js:109），
// **四个系数照抄主线**（0.5 / 0.3 / 0.3 / 0.4），只换字段名。
//
// **三、主线有两份文案，一份是死的。**
// possessionSystem.js:4-54 那两段本地数组（9 条）**永远不会出现在任何输出里**——
// 它们被当作 fallback 传进去，而模板池里已有同名 key，fallback 直接被丢弃（§8.1）。
// 本文件**只留一份**：nether.md §5.1 那份**真正生效**的模板池；权重在这里自己实现
// （沙盒的 `narrate()` 是均匀抽签，不支持 weight，照抄会把权重也变成死字段）。
//
// **四、`possessedBy` 存的是尸体的 id，从生成的第一秒就是悬垂引用。**
// 主线 `target.possessedBy = c.id`，而 c 在同一 tick 被 `removeEntity`（§8.5）。
// 沙盒里死者也会从 `world.entities` 移除（World.js:195），存 id 必然悬垂。
// 这里改成**快照对象** `{ name, level, faction, day }`——名字、境界、宗门、日期都是
// 夺舍**当下**的事实；肉身换了主人，这些也不该再跟着变。
//
// **五、写进去没人读的东西一律不写。**
//   · `cultivationBonus += 0.1`：全仓库无人读（§8.4），**删掉**；
//   · `bus.emit('possession.success' / 'possession.failed')`：无监听者（§8.6）。
//     沙盒没有事件总线，改为写 `world.record(..., 'possess')`——编年史里看得见，
//     而不是发一个没人听的事件；
//   · 亲友察觉里的 `'friend'` 分支永不匹配（主线 12 种关系类型里没有 friend，
//     §8.11），映射到沙盒真有的 `comrade`（同袍）。
//
// ── 需要接线方做的三件事（本文件不碰任何其它文件）──────────────
//
// 1. `src/inkbox/sim/cultivation.js` 的 `initEntity()`（约 101-166 行，
//    `entity.pastLife = null;` 那一行之后）加一句 `entity.possessedBy = null;`。
//    不加的后果：新生成的实体身上**根本没有这个键**，而读档回来的有——同一个世界
//    两种形状，`inkbox-save-equiv` 的「没有只在一侧存在的字段」判据会红。
//    （initEntity 里 124-140 行那段注释已经为同类问题踩过一次坑。）
//
// 2. `src/inkbox/io/save.js` 加一列 `possessedBy`：
//    · 写档（约 192 行，`e.pastLife || null,` 之后）加 `e.possessedBy || null,`；
//    · `restoreEntity()`（约 495 行，`pastLife: row[48] || null,` 之后）加
//      `possessedBy: row[57] ?? null,`——序号按实际插入位置顺延；
//    · `restoreLegacyEntity()`（约 546 行，`incarnation: 1, soulId: null, pastLife: null,`
//      那一行后面）补一个 `possessedBy: null,`。v1 老档当然没有被夺舍的人，
//      但**键必须存在**——缺键就是「只在一侧存在的字段」，同一个坑。
//    不加的后果：读档后「被夺舍者」变回普通人，`·异` 后缀与夺舍印记全部消失，
//    而且**一声不响**——两条世界线从此不同。
//
// 3. `src/inkbox/sim/life.js` 的 `onDeath()`（672-727 行）：
//    · 顶部加 `import { tryPossession } from './possession.js';`
//    · 把 680 行的 `enterNether(world, e, this.rng);` 改成两行：
//        const possessed = tryPossession(world, e, this.rng);
//        if (!possessed) enterNether(world, e, this.rng);
//    两个顺序约束，都不能动：
//      · 必须在 `enterNether` **之前**，并用返回值决定要不要进神魂池——这就是
//        「互斥」的全部实现（见约束二）；
//      · 必须在 `onDeathRelations`（726 行）**之前**——亲友察觉要读他**自己的**
//        关系网，而那一步会把别人指向他的关系清掉（reincarnation.js:677-680
//        为宿缘踩过同一个坑）。
//
// ── 三条设计约束（每一条都是这个项目被咬过的地方）──────────────
//
// **一、不消耗主随机流。**
// 全世界共用 `Life.rng` 一条流（理由见 family.js 头注释），在这里多抽一次签，
// 几百年后的世界就整个漂到别处去。所以：
//   · 一切随机都走 `rng` 形参，本文件**不 new 任何随机源**、不碰 `Math.random`；
//   · 抽签**全部排在稀有分支之后**：境界 < 20 的人在第一行就返回，一次签都不抽。
//     死亡绝大多数是低境界的（reincarnation.js 的实测：300 年 10165 次死亡里
//     9919 次在筑基以下，占 97.6%），主随机流为它们一位不动——扰动被限制在
//     「金丹以上的死亡」这一小撮上（同一次实测里只有 246 次，占 2.4%）。
//
// **二、与转世互斥：一次死亡最多产出一条命。**
// 主线里两套系统互不知情，同一次死亡会**同时**造出一条神魂（排着队等转世）和一个
// 夺舍者——一个死人产出两条活着的血脉。沙盒的神魂池是有限资源（SOUL_CAP = 120，
// reincarnation.js:28），不能这么花。约定：`tryPossession` 返回 true = 这条元神
// 已经住进别人的身体，接线方**跳过 `enterNether`**（见接线第 3 条）。
// 另外，被夺舍的容器**不能是转世者**（`target.soulId` 非空即排除）：否则一具身体
// 里挤着两条外来魂，判据「`possessedBy` 与 `soulId` 不共存」会红。
//
// **三、存快照，不存 id。**
// 见上面「坏掉的第四处」。`possessedBy` 里没有任何 id，所以它**永远不可能悬垂**；
// 下游要显示「此人受残魂影响」，读快照里的 `name` / `level` 就够了。

import { clamp } from '../core/noise.js';
import { SPECIES } from '../core/config.js';
import { fillTemplate } from '../core/lore.js';
import { RELATION_TYPES } from './relations.js';

// ── 常量（照抄主线，出处标在行号上；不要按沙盒数值域「重标」）──────
//
// ⚠️ reincarnation.js 的 `deathRoute` 那一段注释留了一条血的教训：
// 「阈值要在实测分布上取，不能从别的量纲照抄」。下面这几个数**不适用**那条教训——
// 它们不是「多高才算高」的分档阈值，而是**行为参数**（掷签概率、系数、扣分幅度），
// 量纲是自洽的（概率、无量纲系数、关系分）。真正的分档阈值（污染 / 因果 / 境界）
// 在 reincarnation.js 里，不在这里。

/** 夺舍门槛：元神得凝到金丹才离得开肉身。possessionSystem.js:77 */
export const POSSESSION_LEVEL_MIN = 20;
/** 元神不散的概率。possessionSystem.js:82（`rand() > 0.15` 即失败） */
export const SOUL_HOLD_CHANCE = 0.15;
/** 修为继承比例 = INHERIT_MIN + rand() * INHERIT_SPAN，即 20%~40%。possessionSystem.js:122 */
export const INHERIT_MIN = 0.2;
export const INHERIT_SPAN = 0.2;
/** 每种关系独立起疑的概率。possessionSystem.js:150（`rand() < 0.5`） */
export const SUSPICION_CHANCE = 0.5;
/** 起疑后关系扣分。possessionSystem.js:171（主线 `max(0, score-30)`） */
export const SUSPICION_PENALTY = 30;
/**
 * 会「看出破绽」的关系类型。
 *
 * 主线写的是 `lover / friend / mentor / disciple`，但 `friend` **在主线里不存在**
 * （relationshipSystem.js 的 12 种关系里没有它，addRelation 会拒绝未注册类型，
 * §8.11）——那一支永远不匹配。沙盒里语义最接近「友」的是 `comrade`（同袍），
 * 所以这里是 `lover / comrade / mentor / disciple`。
 */
export const SUSPECT_TYPES = Object.freeze([
  RELATION_TYPES.LOVER,
  RELATION_TYPES.COMRADE,
  RELATION_TYPES.MENTOR,
  RELATION_TYPES.DISCIPLE,
]);

/**
 * 关系扣分时「两边都写」用的反向类型。
 * 只有非对称关系需要反写（师徒）；道侣 / 同袍本身就是对称的，`default` 落回原类型。
 * 为什么要反写：沙盒的关系网是**两张表**，`a.relations[b]` 与 `b.relations[a]` 各存一份
 * （relations.js:59-74）。只改一头的话，读档前后「谁觉得谁不对劲」会对不上——
 * reincarnation.js:396-397 接宿缘时踩过同一个坑。
 */
const MIRROR_TYPE = Object.freeze({
  [RELATION_TYPES.MENTOR]: RELATION_TYPES.DISCIPLE,
  [RELATION_TYPES.DISCIPLE]: RELATION_TYPES.MENTOR,
});

/** 编年史里这一类的条目。沙盒的 kind 是自由字符串，仅用于面板分组 */
const RECORD_KIND = 'possess';

// ── 成功率 ───────────────────────────────────────────────
/**
 * 夺舍成功率。系数**逐字照抄** possessionSystem.js:93-95，只把 `willpower` 换成 `mind`。
 *
 * ⚠️ 与主线一样，这个函数**读的是「道心」，不是等级差**——所以它天然是平的：
 * 30 级夺舍 1 级是 0.55，300 级夺舍 1 级也才 0.79（道心 75 时）。
 * 别以为这是 bug 去「修」成陡峭曲线：主线那条平坦曲线是 `willpower` 缺失的**畸变**，
 * 而这里平坦是**设计**——元神强度（0.5·L + 0.3·道心）与肉身抗性（0.3·L + 0.4·道心）
 * 里，道心项本来就该占大头。真要改，改的是系数，不是「顺手」加个等级惩罚。
 *
 * @param {number} possessorLevel 夺舍者（死者）境界
 * @param {number} possessorMind  夺舍者道心 0-100
 * @param {number} targetLevel    容器境界
 * @param {number} targetMind     容器道心 0-100
 * @returns {number} [0.1, 0.95]
 */
export function possessionChance(possessorLevel, possessorMind, targetLevel, targetMind) {
  const soulStrength = (possessorLevel || 0) * 0.5 + (possessorMind || 0) * 0.3;
  const targetResistance = (targetLevel || 0) * 0.3 + (targetMind || 0) * 0.4;
  const denom = soulStrength + targetResistance;
  // 兜底：两项都为 0 时主线会算出 NaN（`0/0`），NaN 参与比较恒为 false，
  // 于是「rand() > NaN」为 false → 判成**成功**。一个道心归零的鬼修会 100% 夺舍成功。
  // 这里显式落回下限，宁可失败也不让 NaN 静默翻成成功。
  if (!(denom > 0)) return 0.1;
  return Math.min(0.95, Math.max(0.1, soulStrength / denom));
}

// ── 文案池（nether.md §5.1，主线**实际生效**的那一份）───────────
//
// 变量：original（夺舍者）、victim（原主名）、newName（带 ·异 后缀的新名）、
//       relative（起疑的亲友）。
// 主线那三组池子里每条都挂着 `condition: () => true`——过滤是空操作，故略去；
// `weight` 保留，因为 §5.8 的引擎**真的**按权重抽（`roll = rng()*totalWeight` 逐条扣减）。
const POSSESSION_SUCCESS = Object.freeze([
  { text: '{original}夺舍{victim}，以{newName}之名继续活着。{newName}对着镜子练习原来的笑容，练了三遍才像。', weight: 1.0 },
  { text: '{original}占据了{victim}的身体，如今唤作{newName}。他知道旧识迟早会发现破绽，所以每天都在补漏洞——但总有他没想到的细节。', weight: 0.9 },
]);

const POSSESSION_FAILED = Object.freeze([
  { text: '{original}试图夺舍{victim}，被对方的道心震了出来。{victim}拍拍衣服：“借过，我还有饭局。”', weight: 1.0 },
  { text: '{original}夺舍{victim}失败。{victim}后来跟人说：“那晚有个人想住进我脑子里，我让他先排队。”', weight: 0.9 },
]);

const POSSESSION_SUSPICION = Object.freeze([
  { text: '{relative}觉得{newName}近来不大对劲：笑得太准，记性太好，连旧伤的位置都答不上来。疑云在饭桌上悄悄生长。', weight: 1.0 },
  { text: '{relative}试探{newName}，问起一件只有故人才知道的小事。{newName}答得滴水不漏，{relative}反而更不放心了。', weight: 0.9 },
]);

/**
 * 按权重抽一条文案，再填占位符。
 *
 * 抽签次数与主线引擎**逐位一致**（一次 `rng()`，见 narrativeTemplates.js:1051-1036 的
 * `pickNarrative`）。`fillTemplate` 用沙盒自己的那份（lore.js:508），行为与主线相同：
 * **变量缺失时保留 `{key}` 原样**，不置空——所以文案里绝不会突然少一个名字。
 */
function pickText(rng, pool, params, fallback) {
  if (!pool.length) return fillTemplate(fallback, params);
  let total = 0;
  for (let i = 0; i < pool.length; i += 1) total += pool[i].weight || 1;
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i += 1) {
    roll -= pool[i].weight || 1;
    if (roll <= 0) return fillTemplate(pool[i].text, params);
  }
  return fillTemplate(pool[pool.length - 1].text, params);
}

// ── 主入口 ───────────────────────────────────────────────
/**
 * 一次死亡的夺舍判定。**由 `life.js` 的 `onDeath` 同步调用**（见文件头接线第 3 条）。
 *
 * @param {object} world 世界
 * @param {object} dead  刚死的那个人（此刻 hp<=0，但**还在 world.entities 里**，关系网完整）
 * @param {() => number} rng 调用方的随机流（沙盒里是 `Life.rng`）
 * @returns {boolean} true = 夺舍成功（接线方必须**跳过 `enterNether`**，见约束二）
 */
/**
 * 夺舍的累计账本。
 *
 * 老世界（本次改动之前构造的、或从老档读回来的）身上没有这个键，
 * 所以**每次用之前都要过这一道**，不能假定 `world.possessionLog` 存在。
 * 不这么写的话，读一个 v6 之前的档再夺舍一次就会抛 `Cannot read property
 * 'succeeded' of undefined`——而那个错误只会在「恰好发生了夺舍」时才现形，
 * 平时完全看不出来。
 */
function ensurePossessionLog(world) {
  if (!world.possessionLog || typeof world.possessionLog !== 'object') {
    world.possessionLog = { succeeded: 0, failed: 0, suspected: 0 };
  }
  const log = world.possessionLog;
  if (!Number.isFinite(log.succeeded)) log.succeeded = 0;
  if (!Number.isFinite(log.failed)) log.failed = 0;
  if (!Number.isFinite(log.suspected)) log.suspected = 0;
  return log;
}

export function tryPossession(world, dead, rng) {
  if (!world || !world.entities || !dead || typeof rng !== 'function') return false;

  // ① 门槛：境界不够，元神凝不住。**这里是本模块不扰动主随机流的关键**——
  //    世上九成九的死亡是凡人 / 炼气，它们在抽第一支签之前就返回了。
  //    ⚠️ 别把任何 rng() 挪到这一行上面。
  if ((dead.level || 0) < POSSESSION_LEVEL_MIN) return false;

  // ② 灵兽与山精没有「元神」，谈不上夺舍（沙盒把它们和修士放在同一个 entities 数组里）
  if (dead.sp === SPECIES.BEAST || dead.sp === SPECIES.SPIRIT) return false;

  // ③ 元神不散（15%）。主线是 `rand() > 0.15 → 散`，等价于 `rng() > 0.15 → 散`。
  if (rng() > SOUL_HOLD_CHANCE) return false;

  // ④ 选容器。没有合格的目标就直接算了——元神无处可去，自然消散。
  const target = pickTarget(world, dead);
  if (!target) return false;

  // ⑤ 成功率。**注意抽签顺序与主线一致**：先掷成败，再掷继承比例（主线 :95 后 :122）。
  //    顺序反了不影响正确性，但会让「同一个世界重跑」的随机流位置和主线对不上，
  //    以后要对齐两边的行为就再也对不齐了。
  const rate = possessionChance(
    dead.level || 0, dead.mind || 0, target.level || 0, target.mind || 0,
  );
  if (rng() > rate) {
    // 失败：容器毫发无伤，夺舍者元神消散。
    // ⚠️ 主线**没有**任何反噬 / 魂飞魄散 / 被吞的结算（§8.12）——不要凭空发明。
    world.record(pickText(rng, POSSESSION_FAILED, {
      original: dead.name,
      victim: target.name,
    }, `【${dead.name}】陨落后元神试图夺舍【${target.name}】，但目标道心坚如磐石，夺舍失败！`), RECORD_KIND, target);
    // 记账（纯计数，不抽签、不改世界状态）
    ensurePossessionLog(world).failed += 1;
    return false;
  }

  // ⑥ 成功。
  const originalName = target.name || '';
  // 名字后缀只在第一次夺舍时加。第二次夺舍同一具肉身（是的，一个被夺舍者还能再被夺舍）
  // 会让名字长成「张三·异·异」——主线就是这么叠的，这里挡一下。
  const newName = originalName.endsWith('·异') ? originalName : `${originalName}·异`;
  target.name = newName;
  // 快照，不是 id（约束三）。`day` 记的是夺舍当天，不是原主的生日。
  target.possessedBy = {
    name: dead.name,
    level: dead.level || 0,
    faction: dead.faction || 0,
    day: world.day,
    // 有几个亲友看出了破绽。**嵌在快照里**，不新增实体字段——
    // 它是「这一次夺舍」的一部分，跟着印记一起存、一起丢，最省事也最不会失配。
    suspected: 0,
  };

  // 修为继承：floor(L_o × (0.2 + rng × 0.2))，取 max(原境界, 继承值)。
  // ⚠️ 只写 level，**不写 maxHp / lifespan**——夺舍借的是肉身，气血与寿元随肉身，
  //    不随元神（主线也是这么做的：只写 level 与 cultivationBonus，后者已删）。
  //    改的话会凭空造命：一个凡人被夺舍后当场得到金丹的寿元与气血。
  const inheritedLevel = Math.floor((dead.level || 0) * (INHERIT_MIN + rng() * INHERIT_SPAN));
  target.level = Math.max(target.level || 0, inheritedLevel);

  world.milestone(pickText(rng, POSSESSION_SUCCESS, {
    original: dead.name,
    victim: originalName,
    newName,
  }, `被【${dead.name}】夺舍，修为被强行提升至${target.level}级，但已不再是原来的自己。`), RECORD_KIND, target);
  // 记账（纯计数，不抽签、不改世界状态）
  ensurePossessionLog(world).succeeded += 1;

  // ⑦ 亲友察觉。排在最后，因为它会改关系网——主叙事先落地，免得被扣分刷下去。
  target.possessedBy.suspected = spreadSuspicion(world, target, rng);

  return true;
}

/**
 * 挑容器：活着的、境界**严格更低**的修士，按境界升序取第一个。
 *
 * 主线的排序键只有 `level`（注释里那句「优先选道心更弱的」是假的，§8.2），
 * 这里**照抄**——不要顺手加 `mind` 做第二排序键，那会让「同一个世界重跑」
 * 的容器选择偏离主线。
 *
 * 与主线的差异（都是沙盒结构逼出来的，不是设计）：
 *   · 主线读 `w.cultivators`，沙盒的 `world.entities` 里混着凡人 / 灵兽 / 山精，
 *     所以显式要求 `sp === cultivator` 且 `level > 0`——**凡人不是容器**。
 *     主线的 `livingPeople` 也只从修士里挑（凡人不在那个数组里）；
 *     让凡人当容器还会带来一个静默失配：境界被抬起来了，`sp` 却还是 `'human'`，
 *     而沙盒里 `sp` 决定基础气血与移速（awaken() 会把它改成 `'cultivator'`）。
 *   · 排除 `soulId` 非空的转世者（约束二），否则判据 2 会红。
 *   · 排除 `eventEnemy`——沙盒没有这个字段，略。
 */
function pickTarget(world, dead) {
  const list = world.entities;
  const deadLevel = dead.level || 0;
  let best = null;
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    if (c === dead || c.hp <= 0) continue;
    const lv = c.level || 0;
    if (lv <= 0 || lv >= deadLevel) continue;
    if (c.sp !== SPECIES.CULTIVATOR) continue;
    if (c.soulId) continue;
    // 严格小于才换人：并列时保留**先遇到的**那个。与主线 `sort(升序)[0]` 的结果一致
    // （V8 的 sort 是稳定的），所以「同一个世界重跑」选出同一个人。
    if (best === null || lv < (best.level || 0)) best = c;
  }
  return best;
}

/**
 * 亲友察觉：容器的关系网里，道侣 / 同袍 / 师父 / 弟子 各自独立 50% 起疑。
 * 起疑者必须**还在世**（沙盒的 relations 里可能留着指向死人的边，
 * 虽然 `onDeathRelations` 会清一部分，但 rival / enmity 之外的类型才清）。
 *
 * @returns {number} 起疑的人数（写进 `possessedBy.suspected`）
 */
function spreadSuspicion(world, target, rng) {
  if (!target.relations || target.relations.size === 0) return 0;
  let n = 0;
  // 遍历 target 自己的关系网。里面写的 `rel.score` 是同一个对象，直接改；
  // 对方那张表是另一张 Map，改动不会破坏本次迭代。
  for (const [otherId, rel] of target.relations) {
    if (!SUSPECT_TYPES.includes(rel.type)) continue;
    if (rng() >= SUSPICION_CHANCE) continue;
    const other = findLiving(world, otherId);
    // 死人不会起疑，也不会被扣分。⚠️ 这里**不能**退化成 `continue` 之外的写法：
    // 主线的 `livingPeople(w).find(...)` 在找不到时静默跳过，扣分也就不发生——
    // 看起来像「关系分没掉」，其实是那位亲友早死了。
    if (!other || other === target) continue;

    // 沙盒的 score 是 -100~100（relations.js:8），可以为负（仇怨）。
    // 主线的 `Math.max(0, score-30)` 下界取 0 在沙盒里语义不对——那会把一段
    // 已经 -60 的仇怨「扣」回 -30，反而变好了。所以用 clamp 到 [-100, 100]。
    rel.score = clamp((rel.score || 0) - SUSPICION_PENALTY, -100, 100);

    // 两边都写。沙盒的关系网是两张表（`a→b` 与 `b→a` 各一份），只改一头的话，
    // 读档前后「谁觉得谁不对劲」会对不上——reincarnation.js:396-397 接宿缘时
    // 踩过同一个坑。反向类型见 MIRROR_TYPE 的注释。
    if (!other.relations) other.relations = new Map();
    const back = other.relations.get(target.id);
    if (back) {
      back.score = clamp((back.score || 0) - SUSPICION_PENALTY, -100, 100);
    } else {
      // 正常世界里 `addRelation` 两边都写，所以这条分支几乎不会走到；
      // 留它是为了**判据 4「两边都有对方」**在异常数据上也成立——
      // 一头有、一头没有的关系网，读档前后的表现会不一致。
      other.relations.set(target.id, {
        type: MIRROR_TYPE[rel.type] || rel.type,
        score: clamp(-SUSPICION_PENALTY, -100, 100),
        since: world.day,
      });
    }

    world.record(pickText(rng, POSSESSION_SUSPICION, {
      relative: other.name,
      newName: target.name,
    }, `【${other.name}】感到【${target.name}】似乎已非昔日之人，心中疑云重重。`), RECORD_KIND, [other, target]);
    n += 1;
  }
  // 记账：本次夺舍有几个亲友看出了破绽（纯计数，不抽签、不改世界状态）
  if (n > 0) ensurePossessionLog(world).suspected += n;
  return n;
}

/** 按 id 找一个还活着的实体。relations 的键是数字 id（save.js 存的是 `[id, type, score]`） */
function findLiving(world, id) {
  const list = world.entities;
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (e.id === id && e.hp > 0) return e;
  }
  return null;
}

// ── 读数 ─────────────────────────────────────────────────
/**
 * 当前世界里「被夺舍者」的读数。
 *
 * 只数**还在世的**：死者已经从 `world.entities` 移除，而夺舍印记是刻在容器身上的，
 * 人没了印记也就没了。所以这是一个「此刻还活着几个换了芯的人」的快照，
 * 不是「历史上夺舍过多少次」的累计——后者需要世界级账本（像 `artifactLog`），
 * 本模块不新增世界字段（那要动 World.js 与存档，超出本文件的职责）。
 *
 * ⚠️ `byFaction` 的键是 faction id；作为对象键会变成字符串，比较时记得转。
 */
export function possessionStats(world) {
  const out = { total: 0, suspected: 0, byFaction: {} };
  const list = (world && world.entities) || [];
  for (let i = 0; i < list.length; i += 1) {
    const p = list[i].possessedBy;
    if (!p) continue;
    out.total += 1;
    if ((p.suspected || 0) > 0) out.suspected += 1;
    const key = p.faction || 0;
    out.byFaction[key] = (out.byFaction[key] || 0) + 1;
  }
  // ── 累计读数（下面三个）与上面三个是**两套不同的东西**，别混用 ──
  //
  // 上面 total / suspected / byFaction 数的是「此刻在世、身上还带着印记的人」，
  // 会随着当事人死去而归零。下面三个是单调递增的账本，永远只增不减。
  //
  // 长测判据一律用下面三个：只有它们能分开「从来没触发过」和
  // 「触发过、但那些人都没了」——上面那套读数在两种情形下都是 0。
  const log = (world && world.possessionLog) || {};
  out.succeeded = log.succeeded || 0;
  out.failed = log.failed || 0;
  out.suspectEvents = log.suspected || 0;
  return out;
}

/**
 * 给测试与面板读的一组内部量（nether.md §9.5 那五条判据需要的东西都在这里）。
 * 冻结，防止调用方往里塞东西——这里的每一项都该是「读得到、改不了」的。
 */
export const possessionInternals = Object.freeze({
  POSSESSION_LEVEL_MIN,
  SOUL_HOLD_CHANCE,
  INHERIT_MIN,
  INHERIT_SPAN,
  SUSPICION_CHANCE,
  SUSPICION_PENALTY,
  SUSPECT_TYPES,
  MIRROR_TYPE,
  possessionChance,
  possessionStats,

  /** 判据 2（互斥）：有夺舍印记的不该带神魂，带神魂的不该有印记 */
  mutuallyExclusive: (entity) => !(entity && entity.possessedBy && entity.soulId),

  /**
   * 判据 3（悬垂）：`possessedBy` 必须是**快照**，里面不能有 id。
   * 有 id 就意味着它可能指向一个已经被 `removeEntity` 移除的人——
   * 那正是主线的 bug（§8.5）。
   */
  isSnapshot: (possessedBy) => Boolean(possessedBy)
    && typeof possessedBy === 'object'
    && !('id' in possessedBy)
    && !('entityId' in possessedBy),

  /** 判据 4（关系对称）：双方的关系网里都有对方 */
  relationsSymmetric: (a, b) => Boolean(a && b && a.relations && b.relations
    && a.relations.has(b.id) && b.relations.has(a.id)),

  /**
   * 判据 5（成功率分布）：按 §9.1 的 mind 公式算一个点。
   *
   * ⚠️ nether.md §9.5 判据 5 写的「L_o=30, L_t=1, mind=75 时 rate ≈ 0.709」是
   * **主线 willpower=50/30 的结果**（§2.4 那张表），不是 mind 公式的结果：
   * 把 mind 代进去，同样的点算出来是 0.553。规格书这两节自相矛盾（§9.5 引的是
   * §2.4 的旧数）。这里按 §9.1 的 mind 公式实现，测试若要复现 0.709，
   * 得用 willpower 口径而不是 mind 口径——这是规格书的问题，不是实现的。
   */
  rateAt: (possessorLevel, possessorMind, targetLevel, targetMind) => possessionChance(
    possessorLevel, possessorMind, targetLevel, targetMind,
  ),
});
