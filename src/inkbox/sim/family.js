// 水墨沙盒 · 血脉、世系与世家
//
// 转世让「一个人」活得比一世长（sim/reincarnation.js），
// 法宝让「一件东西」活得比人长（sim/artifacts.js）。
// 这一块补的是第三样：**家**——让一个姓氏活得比所有人都长。
//
// ── 考古来源 ─────────────────────────────────────────────
//   src/systems/descendantSystem.js:36-107   parentIds / descendants / familyTrees / 世代
//   src/systems/descendantSystem.js:184-204  后裔的血脉觉醒
//   src/systems/descendantSystem.js:227-244  「一脉已传至第 N 代」（家族传承）
//   src/systems/descendantSystem.js:154-182  承先辈遗志
//   src/systems/bloodlineSystem.js:3-20      16 种血脉（沙盒用 core/lore.js 的那份）
//   src/core/lore.js INSTITUTION_TYPES       原作里「修士世家」本来就是一类的机构
//
// 原作的家族树是 `state.familyTrees` 上一个全局数组，成员按 lineageId 串；
// 沙盒是单图、几百代人，照搬会得到一个几万节点的树。所以这里换成
// **两条 id 边**（parentA / parentB）+ 一个**世家**对象：
// 世系本身靠 id 反查（和关系网同一个做法），世家只记「谁开的、传到第几代、
// 声望多少、家学是什么、什么时候断的」。
//
// ── 三条刻意的设计约束（每一条都是被这个项目咬过的地方）──────
//
// **一、不碰主随机流。**
// 生灵的出生、移动、战斗全走 `Life.rng` 一条流。往这条流里多抽一次签，
// 几百年后的世界就会整个漂到别处去（法宝那一轮的教训是：只让「身上已经有
// 法宝的那一小撮人」抽签，把扰动限制在可比量级）。所以这里做了三件事：
//   · 姓氏：`generateNameParts` 仍然抽三次（与原来的 `generateName` 逐位同流），
//     只是抽出来的姓氏**被父姓覆盖**——抽签次数不变，结果变了；
//   · 血脉继承：用**实体 id 的确定性哈希**掷签（`hash01`），一次都不消耗随机流；
//   · 灵根品质继承：**一次签都不抽**，直接把品质抬到双亲的下限；
//   · 挑双亲：**排序完全确定**（有世家者优先 → 年长优先 → id 小优先）。
// 于是「世界会不会长成原来那样」只受属性差异影响，不受随机流错位影响。
// （这一点很重要：它让这一轮的 800 年读数与上一轮**可比**。）
//
// 用哈希而不是「再开一条 rng 流」，是因为哈希**没有状态**：
// 不用进存档、不受调用顺序影响、读档后逐位可复现。
// 开第二条流的话，它推进到哪一步本身就成了要存的东西——多一样能对不上的东西。
//
// **二、沙盒没有性别字段，所以记的是「双亲」而不是「父母」。**
// 原作 `descendantSystem` 也是按道侣成对取子嗣，不看性别。这里沿用，
// 姓氏从双亲里的第一位继承（`parentA`），于是世家是一条稳定的姓氏线。
// 不新增性别字段是有意的：那会改 `initEntity` 的随机流，而且
// 「修仙者结为道侣」本来就不必分阴阳。
//
// **三、世家 = 少量真实状态 + 其余全部现算。**
// 「成员数 / 在世几人 / 有没有绝」一律每次普查现算（和村庄人口、灵气层
// 同一个做法）；只有「立族 / 世代 / 声望 / 堂号 / 家学 / 断绝」是真实状态，
// 必须进存档。存推导量迟早会和世界的真实状态对不上。

import { CLAN_HALLS, MANUALS, bloodlineByName } from '../core/lore.js';
import { clamp } from '../core/noise.js';

/**
 * 成年判据取**寿元比例**，不取绝对天数。
 *
 * ⚠️ 这里踩过一次概念坑：凡人 `lifespan` 是 4200 天（约 11.7 游戏年），
 * 而修士觉醒后会被改写成 `lifespanFor(level) * 360`——炼气期就有 39600 天。
 * 两者差一个数量级。若按「16 岁成年」这种绝对天数写，凡人**一辈子都到不了成年**，
 * 于是永远挑不出双亲，整块家世会静悄悄地什么都不发生。
 */
export const ADULT_FRAC_MIN = 0.22;
export const ADULT_FRAC_MAX = 0.80;

/** 世家数量上限。世家是「稀有的东西」，不该满地图都是 */
export const MAX_CLANS = 32;
/** 每隔多少游戏日判一次立族 */
export const CLAN_FOUND_INTERVAL_DAYS = 360 * 10;
/** 开族的最低境界：筑基。凡人一脉不叫世家，叫「一户人家」 */
export const CLAN_MIN_LEVEL = 10;
/** 至少要有几个在世子女，才谈得上「一脉」 */
export const CLAN_MIN_CHILDREN = 3;
/** 连续多少年一个在世成员都没有，才算断绝 */
export const CLAN_END_YEARS = 80;
export const CLAN_HISTORY_CAP = 24;
/** 灵根品质要「良」以上才往下传；继承的上限卡在「优」——天灵根只能自己掷出来 */
export const HERITAGE_ROOT_FLOOR = 2;
export const HERITAGE_ROOT_CAP = 3;
/** 家传血脉的继承率 */
export const BLOODLINE_INHERIT_RATE = 0.5;

/** 找双亲时向外搜的半径（村子吸纳流民的半径是 9，再放一点余量） */
const KIN_SPAN = 12;

const MANUAL_BY_NAME = new Map(MANUALS.map((m) => [m.name, m]));

/**
 * 确定性哈希 → [0,1)。
 *
 * 用来做「按人抽签但**不消耗随机流**」的事（血脉继承）。
 * 为什么不用 `rng()`：那个流是全世界共用的，多抽一次就把世界挪走了。
 * 哈希只依赖实体 id，而 id 存档会原样保留，所以它跨读档是稳定的。
 */
function hash01(n) {
  let x = Math.imul(n | 0, 2654435761);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  x = Math.imul(x, 3266489917);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// ── 出生：挑双亲、记家世 ───────────────────────────────────
/**
 * 从村子里挑一对双亲。
 *
 * **完全确定，一次签都不抽**：排序键是「有世家归属者优先 → 年长优先 → id 小优先」。
 * 三条都有理由：
 *   · 有世家者优先——不然世家在第二代就断线了（父母是从村里挑的，
 *     随机挑的话世家子弟几乎永远轮不上，世家会变成「始祖一个人的事」）；
 *   · 年长优先——村子里的生育本来就该由成年人承担；
 *   · id 兜底——保证同一个世界每次跑出来的结果逐位相同。
 *
 * @returns {[object|null, object|null]} 双亲。村子太小、没有合格成年人时是 [null, null]。
 *   **拿不到双亲也照样生**——把出生卡在「有父母」上，会直接改掉人口曲线，
 *   而那正是这个世界调了好几轮的参数（见 life.js 的 BIRTH_PER_CAPITA_DAY）。
 *   没有双亲的孩子就是「外来户」，家世栏留白。
 */
export function pickParents(life, village) {
  const pool = [];
  life.forEachNear(village.x, village.y, KIN_SPAN, (e) => {
    if (e.village !== village.id) return false;
    // ⚠️ 空间索引是 tick **开头**建的，里面还留着这一 tick 死掉与飞升的人。
    // 只判 `hp > 0` 是不够的：老死的与飞升的人 hp 都还是满的。
    // 这三个条件正好是 `Life.step` 末尾那趟清理的反面，缺一个就会挑到死人，
    // 于是孩子记上一个已经不在世上的爹——而且没有任何地方会报错。
    if (e._ascended || e.hp <= 0 || e.age >= e.lifespan) return false;
    if (e.sp === 'beast' || e.sp === 'spirit') return false;
    if (e.age < e.lifespan * ADULT_FRAC_MIN) return false;
    if (e.age > e.lifespan * ADULT_FRAC_MAX) return false;
    pool.push(e);
    return false;
  });
  if (!pool.length) return [null, null];

  // 从合格池里**按日轮换**地取一对，而不是永远取排序最前的那两个。
  //
  // 原来这里写的是 `pool.sort(有世家者优先 → 年长优先 → id 小优先)` 然后取前两名。
  // 排序是死的，于是同一对夫妻在好几年里包办了全村的新生儿，族谱退化成一个星形；
  // 更糟的是「有世家者优先」构成了**正反馈**——进了世家的人更容易当双亲，
  // 他们的后代又全都在世家谱上，一个村子很快被一家人吃掉。
  // 实测 800 年：26 家世家覆盖了 1400 人里的 **1365 人（97.5%）**，
  // 「世家」这个标签等于没有信息量。这和调参记录里
  // 「把名下村子也当洪泛种子」是同一类错误：**一个自我强化的排序键**。
  //
  // 现在按 `(世界日, 村子 id)` 的确定性哈希从池里取两个不同的人：
  //   · 不消耗主随机流（见文件头约束一），读档后同一天同一村取出同一对；
  //   · 池里只剩一个人时（村子快绝了）只取一个，另一半记 null——
  //     `registerBirth` 本来就能处理单亲。
  const day = ((life.world && life.world.day) || 0) | 0;
  const seed = hash01(day * 7919 + (village.id | 0) * 131);
  const i = Math.floor(seed * pool.length);
  const a = pool[i];
  if (pool.length === 1) return [a, null];
  const span = pool.length - 1;
  const j = (i + 1 + Math.floor(hash01((seed * 1048576) | 0) * span)) % pool.length;
  return [a, pool[j]];
}

/**
 * 记下这个新生儿的家世。**必须排在 `initEntity` 之后**——
 * 要读双亲已经觉醒的灵根与血脉，也要写进已经建好的字段。
 */
export function registerBirth(world, child, parents) {
  const a = parents ? parents[0] : null;
  const b = parents ? parents[1] : null;
  if (a) child.parentA = a.id;
  if (b) child.parentB = b.id;

  // 天资快照：**出生时记，觉醒时用**。
  // 不能等到觉醒再去查双亲——凡人寿元只有十来年，孩子觉醒时父母多半早没了，
  // 「查不到就当没有」会让家世在第二代就断掉。
  child.heritageQ = Math.max(
    a && a.root ? a.root.quality : -1,
    b && b.root ? b.root.quality : -1,
  );
  child.heritageB = (a && a.bloodline) || (b && b.bloodline) || null;

  const clanId = (a && a.clan) || (b && b.clan) || 0;
  if (!clanId) return;
  const clan = world.clanById(clanId);
  if (!clan) return;
  child.clan = clanId;
  child.gen = Math.max(a ? a.gen || 0 : 0, b ? b.gen || 0 : 0) + 1;
  child.heritageM = clan.heirloom || null;
  if (child.level > 0) learnHeirloom(child);

  if (child.gen > clan.generation) {
    clan.generation = child.gen;
    world.record(
      `【${clan.name}·${clan.hall}】一脉已传至第 ${child.gen} 代。`,
      'clan',
      child,
    );
    pushClanHistory(clan, world.day, `传至第 ${child.gen} 代`);
  }
}

/**
 * 觉醒时兑现家世带来的两样东西。**一次签都不抽**（见文件头约束一）。
 *
 * ⚠️ 调用点在 `sim/cultivation.js` 的 `awaken()` 里，紧跟在血脉掷签之后。
 * 那里是全世界唯一的「凡人 → 修士」入口，放在别处会漏掉神力点化那条路。
 */
export function applyHeritage(entity) {
  if (!entity.root) return;
  // 灵根品质：抬到双亲的下限（但不越过 HERITAGE_ROOT_CAP）。
  // 变异灵根不动——它是「洗髓花 / 雷劫台」那一类机缘给的，不是继承来的。
  if (entity.heritageQ >= HERITAGE_ROOT_FLOOR && !entity.root.mutated) {
    const floor = Math.min(entity.heritageQ, HERITAGE_ROOT_CAP);
    if (entity.root.quality < floor) {
      entity.root.quality = floor;
      entity.root.bonus = floor * 0.02;
    }
  }
  // 家传血脉：按人掷一次（哈希，不消耗随机流）
  if (entity.heritageB && hash01(entity.id) < BLOODLINE_INHERIT_RATE) {
    entity.bloodline = entity.heritageB;
  }
  if (entity.heritageM) learnHeirloom(entity);
}

/**
 * 家学：世家的子弟生来就带着家传功法。
 *
 * ⚠️ 只发给**已经觉醒的**子弟（`level > 0`）。凡人拿着功法既用不上，
 * 检视面板上还会多出一行「功法：太虚剑诀」让人误会。
 * 凡人子弟不丢这门家学——`heritageM` 照记，等他们觉醒时由
 * `applyHeritage`（挂在 `cultivation.js` 的 `awaken()` 里）补发。
 */
export function learnHeirloom(entity) {
  if (!entity.heritageM) return false;
  const manual = MANUAL_BY_NAME.get(entity.heritageM);
  if (!manual) return false;
  if (entity.techniques.some((t) => t.name === manual.name)) return false;
  entity.techniques.push(manual);
  return true;
}

// ── 世家 ───────────────────────────────────────────────────
function pushClanHistory(clan, day, text) {
  clan.history.push({ day, text });
  if (clan.history.length > CLAN_HISTORY_CAP) {
    clan.history.splice(0, clan.history.length - CLAN_HISTORY_CAP);
  }
}

/** 每 360 日普查一次：谁还在、谁最盛、谁断了、要不要开新族 */
export function stepFamily(world, life, dtDays) {
  life.clanCooldown = (life.clanCooldown || 0) + dtDays;
  if (life.clanCooldown < 360) return;
  life.clanCooldown = 0;

  const clans = world.clans;
  if (!clans) return;

  // ── 一次普查，同时算三样 ──
  // 成员数、各家的最强者、以及「谁有子女」。都是一次遍历，别再各扫一遍。
  const memberCount = new Map();
  const topOf = new Map();
  const childCount = new Map();
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.clan) {
      memberCount.set(e.clan, (memberCount.get(e.clan) || 0) + 1);
      const top = topOf.get(e.clan);
      if (!top || (e.level || 0) > (top.level || 0)) topOf.set(e.clan, e);
    }
    if (e.parentA) childCount.set(e.parentA, (childCount.get(e.parentA) || 0) + 1);
    if (e.parentB) childCount.set(e.parentB, (childCount.get(e.parentB) || 0) + 1);
  }

  // ── 现有世家：声望、峰值、断绝 ──
  for (let i = clans.length - 1; i >= 0; i -= 1) {
    const clan = clans[i];
    const members = memberCount.get(clan.id) || 0;
    if (members > 0) {
      clan.lastSeenDay = world.day;
      if (members > clan.peakMembers) clan.peakMembers = members;
      const top = topOf.get(clan.id);
      const target = clamp(members * 6 + (top ? top.level : 0) * 1.2 + clan.generation * 1.5, 0, 100);
      // 声望向目标缓动，而不是直接赋值：世家是「渐渐起来的」，
      // 直接赋值会让它在人丁一波动时上上下下跳。
      clan.reputation = Math.round((clan.reputation * 0.8 + target * 0.2) * 10) / 10;
      continue;
    }
    if (world.day - clan.lastSeenDay < CLAN_END_YEARS * 360) continue;
    clan.endedDay = world.day;
    clan.endReason = '后继无人';
    world.clanLog.ended += 1;
    pushClanHistory(clan, world.day, '一族断绝');
    // 一族已断绝，没有活着的人可以承接这条记录，故不传当事人。
    world.record(
      `【${clan.name}·${clan.hall}】后继无人，一族就此断绝。`
      + `（传 ${clan.generation} 代，历 ${Math.round((world.day - clan.foundedDay) / 360)} 年）`,
      'clan',
    );
    clans.splice(i, 1);
  }

  // ── 立族：每十年一判 ──
  if (world.day - (world.lastClanFoundDay || -1e9) < CLAN_FOUND_INTERVAL_DAYS) return;
  if (clans.length >= MAX_CLANS) return;

  let best = null;
  let bestKids = 0;
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.clan) continue;
    if ((e.level || 0) < CLAN_MIN_LEVEL) continue;
    if (!e.root) continue;
    const kids = childCount.get(e.id) || 0;
    if (kids < CLAN_MIN_CHILDREN) continue;
    // 排序键完全确定：子女多者优先，其次境界高，最后 id 小
    if (!best || kids > bestKids
      || (kids === bestKids && (e.level || 0) > (best.level || 0))
      || (kids === bestKids && e.level === best.level && e.id < best.id)) {
      best = e;
      bestKids = kids;
    }
  }
  if (!best) return;
  world.lastClanFoundDay = world.day;
  foundClan(world, best);
}

/**
 * 造一条世家记录的**唯一**工厂。
 *
 * 为什么要有它：**上界开局的三条始祖线**（`world/worldgenUpper.js` 的
 * `seedUpperPopulation`）与凡间立族（下面的 `foundClan`）必须造出**同一个形状**的
 * clan 对象。两处各拼一遍的话，形状会各自漂移——将来 `clans` 面板或本文件的
 * 读者读到一个 `undefined` 字段，**不会报错**，只会静默显示错东西。
 *
 * 工厂只负责两件事：
 *   1. **分配 id**（`world.nextClanId` 自增）——id 的取法只此一处；
 *   2. 按 `founder` 的快照拼出记录（姓 / 堂号 / 家学 / 灵根 / 坐落在哪一格）。
 *
 * **不负责** `world.clans.push`，也**不碰** `world.clanLog`：
 * 凡间立族要 push + `clanLog.founded += 1` + 写编年史 + 归谱；
 * 上界开局只 push、不记 `founded`（开局 12 人是**开局状态**，不是「立族事件」）。
 * 这两件事在两条路径上语义不同，塞进工厂反而会把它们绑死。
 *
 * ⚠️ `founder` 必须是**已经补齐修炼字段**的实体（`techniques` / `root` 都要在）：
 * 本函数读 `founder.techniques[0]` 与 `founder.root.elements[0]`，
 * 一个只有 id 与坐标的裸对象会让这两处**抛异常**（不是静默错——这里刻意不兜底，
 * 「拿一个没初始化的人来立族」是调用方的 bug，不该被吞掉）。
 *
 * @param {World} world
 * @param {object} founder 始祖实体
 * @param {{generation?: number}} [opts] 起始世代，凡间与上界开局都传 1。
 *   凡间归谱那一段会就地抬高 `clan.generation`，不经过本函数。
 */
export function makeClanRecord(world, founder, { generation = 1 } = {}) {
  const id = world.nextClanId;
  world.nextClanId += 1;
  const surname = founder.surname || founder.name.slice(0, 1);
  return {
    id,
    name: `${surname}氏`,
    hall: CLAN_HALLS[id % CLAN_HALLS.length],
    surname,
    founderId: founder.id,
    founderName: founder.name,
    foundedDay: world.day,
    generation,
    reputation: 20,
    peakMembers: 1,
    // 家学：始祖身上的第一门功法，此后代代相传
    heirloom: founder.techniques.length ? founder.techniques[0].name : null,
    element: founder.root ? founder.root.elements[0] : null,
    seatX: Math.floor(founder.x),
    seatY: Math.floor(founder.y),
    history: [],
    endedDay: -1,
    endReason: null,
    lastSeenDay: world.day,
  };
}

function foundClan(world, founder) {
  const clan = makeClanRecord(world, founder, { generation: 1 });
  const id = clan.id;
  world.clans.push(clan);
  world.clanLog.founded += 1;

  // 把始祖与**在世的**后代一次性归谱。
  // 广度优先，靠「已经进过谱」判重，不靠 depth 上限——
  // 世家可以传几十代，写死深度会在某一代静悄悄地停止收人。
  founder.clan = id;
  founder.gen = 1;
  if (clan.heirloom) founder.heritageM = clan.heirloom;
  const queue = [founder];
  while (queue.length) {
    const cur = queue.shift();
    for (let i = 0; i < world.entities.length; i += 1) {
      const e = world.entities[i];
      if (e.clan === id) continue;
      if (e.parentA !== cur.id && e.parentB !== cur.id) continue;
      e.clan = id;
      e.gen = (cur.gen || 1) + 1;
      if (e.gen > clan.generation) clan.generation = e.gen;
      if (clan.heirloom) {
        e.heritageM = clan.heirloom;
        if (e.level > 0) learnHeirloom(e);
      }
      queue.push(e);
    }
  }

  pushClanHistory(clan, world.day, `始祖【${founder.name}】立族`);
  world.record(
    `【${clan.name}·${clan.hall}】立族，始祖【${founder.name}】，`
    + `一门 ${clan.generation} 代、在世 ${countMembers(world, id)} 人。`,
    'clan',
    founder,
  );
}

function countMembers(world, clanId) {
  let n = 0;
  for (let i = 0; i < world.entities.length; i += 1) {
    if (world.entities[i].clan === clanId) n += 1;
  }
  return n;
}

/** 读档 / 新世界时把账本补齐。缺了它，长测那两条判据会读成 undefined */
export function ensureClanState(world) {
  if (!world.clans) world.clans = [];
  if (!world.clanLog) world.clanLog = { founded: 0, ended: 0 };
  if (!world.nextClanId) world.nextClanId = 1;
  return world.clans;
}

// ── 读数与显示 ─────────────────────────────────────────────
export function clanStats(world) {
  const clans = world.clans || [];
  let members = 0;
  let maxGen = 0;
  let top = null;
  for (let i = 0; i < world.entities.length; i += 1) {
    if (world.entities[i].clan) members += 1;
  }
  for (let i = 0; i < clans.length; i += 1) {
    const c = clans[i];
    if (c.generation > maxGen) maxGen = c.generation;
    if (!top || c.reputation > top.reputation) top = c;
  }
  return {
    clans: clans.length,
    members,
    maxGen,
    top,
    founded: (world.clanLog && world.clanLog.founded) || 0,
    ended: (world.clanLog && world.clanLog.ended) || 0,
  };
}

export function clanOf(world, entity) {
  if (!entity || !entity.clan) return null;
  return world.clanById(entity.clan);
}

/** 世家的一句话介绍，给面板用 */
export function describeClan(clan) {
  if (!clan) return '';
  return `${clan.name}·${clan.hall}（第 ${clan.generation} 代 · 声望 ${Math.round(clan.reputation)}`
    + `${clan.heirloom ? ` · 家学《${clan.heirloom}》` : ''}）`;
}

/**
 * 一个人的家世，摊成面板上的几行。
 * 已故的双亲查不到（死者会被移出 `world.entities`），所以只报「在世 / 已故」，
 * 不硬凑名字——写一个查不到来源的名字比留白更坏。
 */
export function lineageOf(world, entity) {
  const rows = [];
  const father = entity.parentA ? world.entities.find((e) => e.id === entity.parentA) : null;
  const mother = entity.parentB ? world.entities.find((e) => e.id === entity.parentB) : null;
  let kids = 0;
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.parentA === entity.id || e.parentB === entity.id) kids += 1;
  }
  if (entity.surname) rows.push(['姓氏', entity.surname]);
  if (entity.parentA || entity.parentB) {
    const a = father ? father.name : '已故';
    const b = entity.parentB ? (mother ? mother.name : '已故') : null;
    rows.push(['双亲', b ? `${a} · ${b}` : a]);
  }
  if (kids > 0) rows.push(['子女', `${kids} 人在世`]);
  const clan = clanOf(world, entity);
  if (clan) {
    rows.push(['世家', `${clan.name}·${clan.hall}`]);
    rows.push(['世代', `第 ${entity.gen} 代`]);
    rows.push(['始祖', `${clan.founderName}（第 ${Math.floor(clan.foundedDay / 360) + 1} 年）`]);
    if (clan.heirloom) rows.push(['家学', `《${clan.heirloom}》`]);
  }
  if (entity.heritageB) rows.push(['家传血脉', entity.heritageB]);
  return rows;
}

export { bloodlineByName };
