// 水墨沙盒 · 逝者名录（necrology）
//
// 沙盒里 `world.entities` **只装活人**：`life.js` 的清理循环把死者与飞升者
// 就地压掉（`list.length = w`），`findEntity` 也只在 `world.entities` 里找。
// 于是「一个人死了，他的一生就再也翻不出来了」——检视面板点不到他，
// 传记（sim/biography.js）也导不出来。这不报错、不崩溃，只是**一个人的人生凭空消失**。
// 本模块补的就是这一块：给每个离世的人留一份**不可失效的快照**，
// 并且能凭它重新编译出完整的传记正文。
//
// ── 与 biography.js 的分工 ─────────────────────────────────
//   biography.js  写/读 `entity.log`，把「一个人这一生」编译成 8 段正文；
//   本模块        在生死交界处把那个人的**关键事实**抄下来（只抄一次），
//                 再用一份「伪实体」喂给 `compileBiography` 复现正文。
// 本模块**不重新实现编译逻辑**，它是适配器，不是分叉——`compileBiography`
// 与 `recordLifeEvent` 一行都没改。
//
// ── 三条铁律（每一条都是这个项目付过学费的地方）──────────────
//
// **一、`rememberDead` 一次随机流都不许碰。**
// 全世界共用 `Life.rng` 一条流，多抽一次签，几百年后的世界就整个漂到别处去、
// 既有标定全部作废。所以：墓志（`epitaph`）、随葬法宝（`relics`）、
// 亲属摘要（`relations`）**全部是纯读**——没有一次 `rng()`，没有 `Math.random`，
// 连 `family.js` 那种「按人哈希掷签」的 `hash01` 都不需要：
// 这里每一件事都是**完全确定的排序**（分数降序 → 天数降序 → id 升序）。
//
// **二、只存快照，名录里不留任何会失效的引用。**
// `possession.js` 的头注释记着这个坑：`possessedBy` 最初存的是尸体的 `id`，
// 而尸体同 tick 就被移除，于是**从生成的第一秒就是悬垂引用**；修法是改成快照对象。
// 这里同理，而且更彻底：宗门会解散（sects.js 的 `dissolveSect`）、
// 村庄会被毁、世家会断绝（family.js 有「累计断绝」这个读数）。
// 所以 `sectName` / `clanName` / `villageName` **一律在入册时解析成字符串**，
// 名录里**一个 faction id / clan id / village id 都没有**。
// 唯一的例外是 `id`（原实体 id）：它是标量、只当稳定键用，
// 代码里**永远不拿它去 `findEntity` 反查对象**——这是本文件必须守住的规矩。
//
// **三、淘汰不是 FIFO。**
// 个人日志（`LOG_CAP = 32`）最初被实现成「最后 32 条」，结果晚年的琐事把
// 「觉醒 / 开宗 / 结侣」挤出去，而传记里只表现为「早年一片空白」、**不报任何错**。
// 改成了「按重要性淘汰、同分留新的」。这里用**同一套语义**：
// 名录满 800 之后，最近 150 位按时间**无条件**保留（玩家刚看着一个人死掉，
// 去翻名录必须翻得到），剩下 650 个位置按 `(importance 降序, died 降序)` 取。
// 写成 FIFO 的话，800 个名额会被高境界者长期占满，一个刚死的炼气修士当场查不到。
//
// ── 为什么非要 `world.deadLog` 这个累计账本 ─────────────────
// `world.dead.length` 是一个**会变小**的读数（会被淘汰裁剪）。
// 于是「从来没有凡人死过」与「死过 10 万个、全被淘汰了」在长测读数上
// **长得一模一样**。这个项目已经为同一个理由造过三样东西：
// `nextSoulId`（累计造出多少神魂）、`warLog.declared`（累计宣战几场）、
// `possessionLog`（累计夺舍成功/失败/起疑）。这里是第四处。
// 不变量：**`deadLog.total - deadLog.evicted === world.dead.length`**，测试会断言它。
// `deadLog` 反推不出来，**必须进存档**。
//
// ── 一条已知的缺口（如实记下，不用启发式掩盖）────────────────
// `cause` 只有三个值：`飞升` / `寿终` / `殁`。
// 要可靠地区分「战死 / 被斩 / 天劫反噬」得在战斗结算点把**凶手**传下来，
// 而 `onDeath` 是从 `life.js` 的清理循环里调的，拿不到凶手；
// `recordDeath(world, entity, rng, killer)` 的第 4 个参数现在**恒传 `null`**。
// 所以这里**不猜**——不去看「最后一条日志的 kind 是不是 `war`」。
// 那是猜测，而 `biography.js` 文件头写着「猜错比不猜更坏」。
//
// ── 接线（四处，顺序有讲究）────────────────────────────────
//  1. `life.js` 的 `onDeath(e)` **最开头**调 `rememberDead(world, e, 'dead')`。
//     必须在最开头：① 要读的关系网还没被 `onDeathRelations` 清掉；
//     ② 要读的 `entity.artifacts` 还没被 `dropArtifacts` 搬走；
//     ③ 要读的 `entity.log` 还没被后续步骤改写。
//  2. `cultivation.js` 的 `ascend()` 里、**`leaveArtifacts` 之前**调
//     `rememberDead(world, entity, 'ascended')`。飞升者被 `if (e._ascended) continue;`
//     跳过，**不会**走 `onDeath`，所以必须单独入册。
//     ⚠️ 为什么不在 `life.js` 的 `e._ascended = true` 那一行调：那时
//     `ascend()` 早已跑完，`leaveArtifacts` 把 `entity.artifacts` 清成了 `[]`，
//     随葬法宝永远是空的。而且 `divine.js` 的 `ascendChosen()` 也会直接调 `ascend()`，
//     放在 `ascend()` 内部才能把「天意飞升」与「玩家点化飞升」两条路一起覆盖。
//  3. `World.js` 构造函数里初始化 `this.dead = []` 与 `this.deadLog = {...}`。
//  4. `io/save.js` 把这两样按**世界级字段**存（不是实体行的一列！）。
//
// ⚠️ 与 `sim/cultivation.js` 之间存在一条 import 环（`ascend()` 要调 `rememberDead`，
// 本文件要用它的 `placeName`）。ESM 的环在这里是安全的：两边都只在**函数体内**
// 使用对方的导出，没有任何模块顶层的求值依赖。
//
// ── 体积：这是全档最大的单块，也是本模块唯一的成本 ─────────────
//
// **实测**（`scripts/_necropolisprobe.mjs`，中堂 288×180，seed 20260917，120 年）：
//   · 完整存档            3,712,291 字节（3,625 KB）
//   · 把名录整块抠掉之后  2,233,678 字节（2,181 KB）
//   · **名录占 1,478,613 字节（1,444 KB）· 全档的 39.8%**
//   · 800 条 → **平均 1,848 字节/条**（另一个智能体在长卷上独立实测
//     `world.dead` = 1,004,431 字符，换算下来同样是 ~1,250 字符/条，两边对得上）
//
// 差额来自哪：**个人日志**。名录里最贵的字段是 `log`——它是
// `entity.log` 的逐条拷贝（`LOG_CAP = 32` 条上限），而死者的日志
// 实测平均 **7.51 条/人**（695/800 的人有日志，86.9%）。
// 对照一下底价：把同一批 800 条导成「一行一人 + 墓志」的 Markdown 只有
// **141,239 字节（约 176 字节/条）**——也就是说 **`log` 一项占了名录的约 90%**。
// 想按「800 条 × 250 字节 ≈ 200 KB」估的人，漏算的就是这一项；
// 而它**不能删**：用户明确选了「完整版」（点开能看到完整传记），
// 没有 log 就只剩一行名字，`compileDeadBiography` 会退化成一句墓志。
//
// **两个旋钮，按代价从大到小**：
//   1. `LOG_CAP`（在 `sim/biography.js`，32）——**最有效的那个**。
//      名录里约九成体积是日志，它直接线性地缩；而且它同时缩**活人**那一侧。
//   2. `DEAD_CAP`（本文件，800）——名录体积**线性于条数**：
//      800 条 ≈ 1.44 MB（120 年实测），降到 **300 条 ≈ 0.54 MB，省约 0.90 MB（约 63%）**。
//      ⚠️ 降它只缩名录，不缩活人；而且 `RECENT_KEEP` 必须**严格小于** `DEAD_CAP`，
//      否则「最近 N 位无条件保留」会把整个名额吃光、按重要性淘汰那一半直接失效
//      （失效的样子是「名录看起来正常，只是高境界的人开始莫名其妙地不见」——不报错）。
//
// ⚠️ **现在不要为了体积下调这两个常量**：存档压缩层（`codec.js`，gzip）已在接，
// 全档压缩比实测 3.9×，自然语言占比更高的名录压缩率只会更好。
// 先把数字记准、把旋钮标出来；真要调，**只调 `LOG_CAP` 这一个**。

import { APP, TIME } from '../core/config.js';
import { realmLabel } from '../core/cultivation.js';
import {
  clean, importantRelations, artifactNamesOf, compileBiography,
} from './biography.js';
import { placeName } from './cultivation.js';

/** 一年多少天。**不写字面量 360**：与 biography.js 同源，否则年份会错位 */
const YEAR_DAYS = TIME.daysPerYear || 360;

// ── 上限（本模块仅有的几个旋钮）─────────────────────────────
/** 名录上限。满了按「重要性淘汰、同分留新的」，**不是 FIFO**（理由见文件头铁律三） */
export const DEAD_CAP = 800;
/** 其中「最近 N 位」按时间**无条件**保留——刚死的人必须当场查得到 */
export const RECENT_KEEP = 150;
/** 墓志一句话的字数上限 */
export const EPITAPH_CAP = 40;
/** 随葬法宝名最多记几件（名录不是仓库，记前三件足够认出这个人） */
export const RELICS_CAP = 3;
/** 亲属摘要最多记几条 */
export const DEAD_RELATIONS_CAP = 4;

// ── 惰性兜底 ───────────────────────────────────────────────
/**
 * 补上 `world.dead` / `world.deadLog`。
 *
 * 照抄 `possession.js` 的 `ensurePossessionLog`，理由也一模一样：
 * 老世界对象（本次改动之前构造的）与老存档（v6 之前）身上**没有这两个键**，
 * 不兜底的话，错误**只会在「恰好有人死掉时」才现形**——
 * `Cannot read property 'total' of undefined`——平时完全不报错。
 * 这个项目的既有惯例：`ensureLog`（biography.js）、`ensureRelations`（relations.js）、
 * `ensurePossessionLog`（possession.js），这里是第四个。
 *
 * @returns {Array} `world.dead`，保证是数组
 */
export function ensureNecrology(world) {
  if (!world) return [];
  if (!Array.isArray(world.dead)) world.dead = [];
  if (!world.deadLog || typeof world.deadLog !== 'object') {
    world.deadLog = { total: 0, ascended: 0, evicted: 0 };
  }
  const log = world.deadLog;
  if (!Number.isFinite(log.total)) log.total = 0;
  if (!Number.isFinite(log.ascended)) log.ascended = 0;
  if (!Number.isFinite(log.evicted)) log.evicted = 0;
  return world.dead;
}

// ── 入册 ───────────────────────────────────────────────────
/**
 * 一个人的一生里最有分量的那件事，截成一句话当墓志。
 *
 * **不编**：优先取他自己 `log` 里 `importance` 最高的那一条（同分取较晚的），
 * 那是他自己一生里最有分量、且**已被记录**的事实。日志为空才退回模板
 * `${境界}${名}，${因}于${地}。`——模板里的每一项也都来自 record，不是修辞。
 *
 * `realmLabel(0)` 返回的是「炼气」（`realmFor(0)` 落到第一个境界），
 * 对凡人是不对的，所以 level <= 0 时显式用「凡人」。
 */
function makeEpitaph(logRows, ctx) {
  if (Array.isArray(logRows) && logRows.length) {
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < logRows.length; i += 1) {
      const row = logRows[i];
      if (!row) continue;
      const score = Number.isFinite(row.importance) ? row.importance : 0;
      // 同分取**较晚**的：与 recordLifeEvent 的淘汰规则同一条语义
      if (!best || score > bestScore || (score === bestScore && (row.day || 0) >= (best.day || 0))) {
        best = row;
        bestScore = score;
      }
    }
    const text = clean(best && best.text);
    if (text) return clipText(text, EPITAPH_CAP);
  }
  const realm = ctx.level > 0 ? realmLabel(ctx.level) : '凡人';
  return clipText(clean(`${realm}${ctx.name}，${ctx.cause}于${ctx.place}。`), EPITAPH_CAP);
}

/** 截断到 cap 字（含省略号）。与 biography.js 的 clampText 同一套写法 */
function clipText(text, cap) {
  const s = String(text === undefined || text === null ? '' : text);
  return s.length > cap ? `${s.slice(0, cap - 1)}…` : s;
}

/**
 * 淘汰分数。飞升 +60——飞升是这个世界里最大的事，不该被后来的凡人挤掉。
 * 凡人 ≈ 0~5（被淘汰的第一顺位）；有宗门/世家的修士 ≥ 20。
 */
function recordImportance(level, sectName, clanName, logLength, ascended) {
  return (level || 0) * 10
    + (sectName ? 8 : 0)
    + (clanName ? 5 : 0)
    + Math.min(24, logLength || 0)
    + (ascended ? 60 : 0);
}

/** 名录里的排序：重要度降序 → 卒年降序 → id 升序（**全序**，与 Map 插入顺序无关） */
function byImportanceThenRecent(a, b) {
  return (b.importance - a.importance) || (b.died - a.died) || (a.id - b.id);
}

/** 把 `entity.log` 抄一份出来。抄而不是抱引用：不抱着一整个已死的实体不放 */
function cloneLog(log) {
  if (!Array.isArray(log) || !log.length) return [];
  const out = [];
  for (let i = 0; i < log.length; i += 1) {
    const row = log[i];
    out.push(row ? { ...row } : row);
  }
  return out;
}

/** 宗门名（字符串快照）。没有就是空串——**不存 faction id**，理由见文件头铁律二 */
function resolveSectName(world, entity) {
  if (!entity.faction) return '';
  const sect = typeof world.factionById === 'function' ? world.factionById(entity.faction) : null;
  return sect ? clean(sect.name) : '';
}

/** 世家名（字符串快照）。**不存 clan id**——世家会断绝 */
function resolveClanName(world, entity) {
  if (!entity.clan) return '';
  const clan = typeof world.clanById === 'function' ? world.clanById(entity.clan) : null;
  return clan ? clean(clan.name) : '';
}

/** 村名（字符串快照）。**不存 village id**——村庄会被毁 */
function resolveVillageName(world, entity) {
  if (!entity.village) return '';
  const village = typeof world.villageById === 'function' ? world.villageById(entity.village) : null;
  return village ? clean(village.name) : '';
}

/**
 * 入册。**本模块唯一的写入口**。
 *
 * ⚠️ 一次 `rng()` 都不许调（见文件头铁律一）。签名里干脆没有 rng——
 * 这样以后有人想「顺手掷个签」时，连掷签的工具都拿不到。
 *
 * @param {object} world
 * @param {object} entity 刚离世的人。**此刻还在 `world.entities` 里**，
 *   关系网、法宝、日志都完整——调用方必须保证这一点（见文件头接线）。
 * @param {'dead'|'ascended'} fate
 * @returns {object|null} 写进名录的那条记录（被当场淘汰时仍返回它，便于测试）
 */
export function rememberDead(world, entity, fate = 'dead') {
  if (!world || !entity) return null;
  const list = ensureNecrology(world);
  const ledger = world.deadLog;

  const level = entity.level || 0;
  const ascended = fate === 'ascended';
  // 只有三个值，且**不猜**（见文件头「一条已知的缺口」）
  const cause = ascended
    ? '飞升'
    : (Number(entity.age) >= Number(entity.lifespan) ? '寿终' : '殁');

  const name = clean(entity.name, '无名');
  const sectName = resolveSectName(world, entity);
  const clanName = resolveClanName(world, entity);
  const place = placeName(world, entity);
  const logRows = cloneLog(entity.log);
  // ⚠️ `importantRelations` 必须在 `onDeathRelations` **之前**调：
  // 后者会把别人指向死者的关系清掉（relations.js:286-305），
  // 清完之后再解析，每一条都会变成「一位姓名失载的旧识」。
  // 这里存的是它的**输出**（已经解析好名字的数组），不是 `entity.relations` 那个 Map。
  const relations = importantRelations(world, entity, DEAD_RELATIONS_CAP);

  const record = {
    // 只作稳定键，**永不反查对象**（见文件头铁律二）
    id: entity.id,
    name,
    surname: clean(entity.surname),
    sp: entity.sp,
    gen: entity.gen || 0,
    died: Number(world.day) || 0,
    // 天数（与 entity.age 同单位）。要显示年份由消费方除以 YEAR_DAYS
    age: Math.max(0, Math.floor(Number(entity.age) || 0)),
    level,
    rootName: clean(entity.root && entity.root.rootName),
    daoName: clean(entity.dao && entity.dao.path && entity.dao.path.name),
    sectName,
    clanName,
    villageName: resolveVillageName(world, entity),
    place,
    fate: ascended ? 'ascended' : 'dead',
    cause,
    /**
     * 魂归何处。**这一列不由本函数判定，由死亡通道回填**——理由见 `markSoulRoute`。
     *
     *   · `null`        —— 还没回填。飞升者（`fate === 'ascended'`）、
     *                      上界陨落者（`upperLife.bury` 走的是上界 world，上界没有魂路）、
     *                      以及**凡人**（`soulTier === 0`，`enterNether` 第一行就返回了，
     *                      连 `soulLog` 都不记）都是这一类。
     *   · 五路之一       —— `enterNether` 判出来的魂路，与 `soulLog` **同源同一次判定**。
     *   · `'possess'`    —— 元神夺舍成功，这条命**没走**幽冥（见 `SOUL_ROUTE_POSSESS`）。
     *
     * ⚠️ 它是**快照**（一个字面量），不是引用，符合本文件铁律二。
     */
    soulRoute: null,
    kills: Math.max(0, Math.floor(entity.kills || 0)),
    relics: artifactNamesOf(entity).slice(0, RELICS_CAP),
    relations,
    log: logRows,
    epitaph: makeEpitaph(logRows, { name, level, cause, place }),
    importance: recordImportance(level, sectName, clanName, logRows.length, ascended),
  };

  list.push(record);
  ledger.total += 1;
  if (ascended) ledger.ascended += 1;
  trimNecrology(world);
  return record;
}

/**
 * 把「这条魂归了哪一路」写回刚入册的那条逝者记录。
 *
 * ── 为什么必须有这个函数（这是「这个人死了之后去哪了」查不到的全部原因）──
 * `rememberDead` 在 `onDeath()` 的**最开头**被调用（关系网、法宝、日志都还没被
 * 后续步骤动过，见 `life.js` 那段三个理由）。而魂路要等 `enterNether` 才判得出来，
 * 中间还隔着夺舍判定（夺舍成功就**不**进幽冥，是另一条去向）。
 * ⇒ 入册的那一刻，**世界上还没有任何人知道这条魂归哪一路**。
 *   不是没人算，是算出来的那一秒名册已经写完了——于是 `soulLog` 里五路俱全、
 *   魂池里排着队，而玩家在名册上翻到那个人时只看到「殁」。
 *
 * 于是分两笔写：入册时留 `null`，判路之后由本函数补上。
 *
 * ⚠️ **一次 `rng()` 都不抽**（铁律一）：只做一次线性查找 + 写一个字面量。
 *    调用它的 `enterNether` 也正因为这一点才敢在判路之后插进来。
 * ⚠️ **只写快照，不写引用**（铁律二）：`route` 是五路之一或 `'possess'`，都是字符串。
 *
 * ⚠️ 找不到就返回 `false`、什么都不改。名录满 800 会按「重要性淘汰」，
 *    理论上刚入册的人也可能被淘汰。但这条路径**实际不可达**：
 *    `trimNecrology` 无条件保留最近 `RECENT_KEEP = 150` 位，而 `enterNether`
 *    与 `rememberDead` 在同一次 `onDeath()` 里、中间没有任何人再往名录里写。
 *    所以这是**兜底**而不是常规分支——返回 `false` 让探针能看出「真发生了」，
 *    而不是悄悄吞掉（这正是本项目最忌讳的那种坏法）。
 *
 * @param {object} world
 * @param {number} id  实体 id（名录里唯一允许的标量键）
 * @param {string} route  五路之一，或 `'possess'`
 * @returns {boolean} 是否写进去了
 */
export function markSoulRoute(world, id, route) {
  const list = (world && Array.isArray(world.dead)) ? world.dead : null;
  if (!list || !list.length || route == null) return false;
  // 从**尾部**往前找：刚入册的那条就在末尾，正常情况下第一次比较就命中。
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].id === id) {
      list[i].soulRoute = route;
      return true;
    }
  }
  return false;
}

/**
 * 淘汰。**不是 FIFO**（理由见文件头铁律三）：
 *   · 最后 `RECENT_KEEP` 条按时间无条件保留；
 *   · 其余按 `(importance 降序, died 降序, id 升序)` 取前 `DEAD_CAP - RECENT_KEEP`。
 * 淘汰后保持**插入顺序**（= 时间顺序），这样同一个世界重跑得到逐位相同的名录。
 *
 * @returns {number} 本次淘汰了几条
 */
function trimNecrology(world) {
  const list = world.dead;
  const ledger = world.deadLog;
  const n = list.length;
  if (n <= DEAD_CAP) return 0;

  const recentStart = n - RECENT_KEEP;
  const keep = new Set();
  for (let i = recentStart; i < n; i += 1) keep.add(list[i]);

  const rest = [];
  for (let i = 0; i < recentStart; i += 1) rest.push(list[i]);
  rest.sort(byImportanceThenRecent);
  const quota = DEAD_CAP - RECENT_KEEP;
  for (let i = 0; i < quota && i < rest.length; i += 1) keep.add(rest[i]);

  const kept = [];
  for (let i = 0; i < n; i += 1) {
    if (keep.has(list[i])) kept.push(list[i]);
  }
  const evicted = n - kept.length;
  if (evicted > 0) {
    list.length = 0;
    for (let i = 0; i < kept.length; i += 1) list.push(kept[i]);
    // 账本与名录**必须同步**：total - evicted === dead.length 是测试要断言的
    // 不变量。只改一个的话，「累计死过多少人」这条读数会静默失真。
    ledger.evicted += evicted;
  }
  return evicted;
}

// ── 读 ─────────────────────────────────────────────────────
/**
 * 给界面用的视图。
 *
 * @param {object} opts
 *   · `sort: 'recent'（默认，卒年倒序）| 'importance'（重要度倒序）`
 *   · `limit: number` 取前几条（0 / 缺省 = 全部）
 *   · `fate: 'dead' | 'ascended'` 只看某一种
 * @returns {Array} 排序后的记录数组（元素是名录里的**同一个对象**，不是副本）
 */
export function necrologyList(world, opts = {}) {
  const src = (world && Array.isArray(world.dead)) ? world.dead : [];
  const fate = opts.fate;
  let rows = src;
  if (fate === 'dead' || fate === 'ascended') {
    rows = [];
    for (let i = 0; i < src.length; i += 1) {
      if (src[i].fate === fate) rows.push(src[i]);
    }
  } else {
    rows = src.slice();
  }
  if (opts.sort === 'importance') rows.sort(byImportanceThenRecent);
  else rows.sort((a, b) => (b.died - a.died) || (a.id - b.id));
  const limit = Number.isFinite(opts.limit) ? opts.limit : 0;
  return limit > 0 ? rows.slice(0, limit) : rows;
}

/**
 * 给长测与面板用的读数。
 *
 * `count` 是**此刻名录里还有几条**（会变小）；`total / ascended / evicted`
 * 是**单调递增的账本**（永远只增不减）。两套东西别混用：
 * 长测判据一律用账本——只有它们能分开「从来没死过人」与「死过很多、都被淘汰了」。
 */
export function necrologyStats(world) {
  const list = (world && Array.isArray(world.dead)) ? world.dead : [];
  const ledger = (world && world.deadLog) || {};
  let ascended = 0;
  let logged = 0;
  let logRows = 0;
  let withRelics = 0;
  let withRelations = 0;
  let maxLevel = 0;
  let top = null;
  for (let i = 0; i < list.length; i += 1) {
    const r = list[i];
    if (r.fate === 'ascended') ascended += 1;
    const n = Array.isArray(r.log) ? r.log.length : 0;
    if (n > 0) {
      logged += 1;
      logRows += n;
    }
    if (r.relics && r.relics.length) withRelics += 1;
    if (r.relations && r.relations.length) withRelations += 1;
    if ((r.level || 0) > maxLevel) {
      maxLevel = r.level || 0;
      top = r;
    }
  }
  const count = list.length;
  const total = Number(ledger.total) || 0;
  const evicted = Number(ledger.evicted) || 0;
  return {
    count,
    total,
    ascended: Number(ledger.ascended) || 0,
    evicted,
    // 不变量：total - evicted === count。**测试会断言它**
    balanced: total - evicted === count,
    // 名录里此刻还留着的飞升者（与账本里的 ascended 不是一回事）
    inRosterAscended: ascended,
    logged,
    loggedRatio: count ? Math.round((logged / count) * 1000) / 1000 : 0,
    avgLog: logged ? Math.round((logRows / logged) * 100) / 100 : 0,
    withRelics,
    withRelations,
    maxLevel,
    top,
  };
}

/** 按 id 查一条。名录里 id 只当键用——这里查的是名录，不是 `world.entities` */
export function findDead(world, id) {
  const list = (world && Array.isArray(world.dead)) ? world.dead : [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

// ── 编译已故者的传记 ───────────────────────────────────────
/**
 * 给 `compileBiography` 用的一层「世界视图」。
 *
 * 名录里存的是**宗门名 / 世家名的字符串**（不存 id，理由见文件头铁律二），
 * 而 `compileBiography` 是通过 `world.factionById(entity.faction)` 拿名字的。
 * 这里把两个查表函数换成「直接返回快照里的名字」的版本，
 * 其余一切（`day` / `entities` / 原型上的方法）原样继承真实世界。
 *
 * ⚠️ 为什么不在 `biography.js` 的 `sectNameOf` 里加一条短路：
 * 本模块对 `biography.js` 只允许一处编辑（`importantRelations` 的已解析短路），
 * 而那个文件此刻有别的智能体在并发编辑。适配层放在这里，改动全在本文件内。
 */
function deadWorldView(world, record) {
  const view = Object.create(world);
  view.factionById = () => (record.sectName ? { name: record.sectName } : null);
  view.clanById = () => (record.clanName
    ? { name: record.clanName, hall: '', generation: 0, reputation: 0 }
    : null);
  return view;
}

/**
 * 把一条名录记录编译成完整传记（Markdown）。**纯读**：不改世界、不抽签。
 *
 * 做法：造一个「伪实体」，把 record 里**能从记录重建的**字段摊平进去，
 * 然后交给 `compileBiography`。所以编译逻辑只有一份，这里是适配器。
 *
 * ── 重建了哪些 ──────────────────────────────────────────
 *   `log` / `level` / `name` / `surname` / `sp` / `gen` / `age` / `kills` /
 *   `root.rootName` / `artifacts`（由 `relics` 名还原成 `{name}` 数组）/
 *   `relationsResolved`（由 `record.relations` 直接给，`importantRelations` 会短路用它）。
 *
 * ── 没重建哪些，以及传记里因此少了哪一段（宁缺勿假）──────────
 *   · `dao`        —— record 只存了**道途名**，没存阶段。`daoStageName(path, progress)`
 *                    只能返回某个真实阶段，拿 0 代进去会印出「剑意初悟」这种**假阶段**。
 *                    所以伪实体**不带 dao**：传记里「当前所求」显示为「尚未显露」，
 *                    「未竟命线」那一条也不再出现。道途名仍在名录行上（`record.daoName`）。
 *   · `pastLife` / `soulId` / `incarnation` —— 转世信息不在名录里，
 *                    所以**「前世与命系」整段消失**。
 *   · `parentA` / `parentB` / `clan.generation` —— 名录里没有世系边，
 *                    「遗产与未竟之事」里**「已形成跨代传承」那一条不出现**；
 *                    `countRelations` 读的是 `relations` Map（伪实体没有），
 *                    所以**「留下 N 名有记录的弟子」也不出现**。
 *   · `daoTitle` / `fateTask` / `heritageM` / `exp` —— 未存。
 *                    影响：「身份」退回灵根名或「凡俗之身」；「当前修炼进度」显示 0%。
 *   宁可少这几段，也不填假值——这是 `biography.js` 的 `clean()` 与
 *   family.js:439「写一个查不到来源的名字比留白更坏」的同一条规矩。
 */
export function compileDeadBiography(world, record) {
  if (!world || !record) return '';
  const relics = Array.isArray(record.relics) ? record.relics : [];
  const pseudo = {
    id: record.id,
    name: record.name,
    surname: record.surname,
    sp: record.sp,
    gen: record.gen || 0,
    level: record.level || 0,
    age: record.age || 0,
    kills: record.kills || 0,
    log: Array.isArray(record.log) ? record.log : [],
    // 已解析好的关系数组 → `importantRelations` 短路返回它（对 biography.js 的唯一一处编辑）
    relationsResolved: Array.isArray(record.relations) ? record.relations : [],
    root: record.rootName ? { rootName: record.rootName } : null,
    artifacts: relics.map((name) => ({ name })),
    // `sectNameOf` / 遗产那一段都先判 `entity.faction` / `entity.clan` 是否真值；
    // 给个 1 只是为了让它们走进查表分支，真正的名字由 deadWorldView 提供。
    faction: record.sectName ? 1 : 0,
    clan: record.clanName ? 1 : 0,
    // 下面这些**刻意留空**（见函数头注释），不是漏了
    dao: null,
    daoTitle: null,
    pastLife: null,
    soulId: null,
    incarnation: 1,
    fateTask: null,
    heritageM: null,
    exp: 0,
    parentA: 0,
    parentB: 0,
    lifeSummary: null,
    // 一句**完全由记录事实拼出来**的生涯摘要。不写它的话，`compileBiography`
    // 会走兜底「……之路仍在书写」——那句话是给活人写的，安在一个已故者头上
    // 就是一句假话。这里每一个字都来自 record（境界 / 因由 / 卒年 / 享年）。
    biographySummary: deadSummary(record),
    lifeSummaries: null,
    lifeEventLedger: null,
  };
  return compileBiography(deadWorldView(world, record), pseudo);
}

/** 已故者的一行生涯摘要。**只拼记录里已有的事实**，不加任何修辞 */
function deadSummary(record) {
  const yearDays = YEAR_DAYS;
  const realm = (record.level || 0) > 0 ? realmLabel(record.level) : '凡人';
  const year = Math.max(0, Math.floor((record.died || 0) / yearDays));
  const ageYears = Math.max(0, Math.floor((record.age || 0) / yearDays));
  const who = clean(record.name, '无名');
  return `${realm}${who}，${record.cause}于仙历 ${year} 年，享年 ${ageYears} 年。`;
}

// ── 导出（照 biography.js 的 exportChronicle / chronicleFileName 的做法）──
/**
 * 名录导出（Markdown）。
 *
 * 导出的是**名录本身**（一行一人 + 墓志），不是 800 份完整传记——
 * 完整传记由面板上「点开某一条」后单独导出（`compileDeadBiography` +
 * `biographyFileName`）。理由：800 份传记是几 MB 的文本，一次性下载不现实，
 * 而且没人会读。
 */
export function exportNecrology(world, opts = {}) {
  const rows = necrologyList(world, opts);
  const yearDays = opts.yearDays || YEAR_DAYS;
  const currentYear = Math.max(0, Math.floor((Number(world && world.day) || 0) / yearDays));
  const stats = necrologyStats(world);
  const lines = [];
  lines.push('# 坐天观井 · 逝者名录');
  lines.push('');
  lines.push(`导出于仙历 ${currentYear} 年`);
  lines.push(`- 游戏版本：V${(APP && APP.version) || '未知'}`);
  lines.push(`- 名录现存 ${stats.count} 人 · 累计入册 ${stats.total} 人次`
    + `（其中飞升 ${stats.ascended}）· 已被淘汰 ${stats.evicted} 人次`);
  lines.push(`- 排序：${opts.sort === 'importance' ? '按重要度' : '按卒年'}`);
  lines.push('');
  if (!rows.length) {
    lines.push('名录尚空——这个世界还没有人离世。');
    return lines.join('\n');
  }
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const year = Math.floor((r.died || 0) / yearDays);
    const tags = [r.level > 0 ? realmLabel(r.level) : '凡人'];
    if (r.sectName) tags.push(r.sectName);
    if (r.clanName) tags.push(`${r.clanName}世家`);
    if (r.villageName) tags.push(r.villageName);
    lines.push(`- 仙历 ${year} 年 · ${r.name}（${tags.join(' · ')}）· ${r.cause}`);
    if (r.epitaph) lines.push(`  「${r.epitaph}」`);
  }
  return lines.join('\n');
}

/** 名录导出文件名（与传记同一套命名规则）。只返回名字，不碰 Blob / URL / document */
export function necrologyFileName(world) {
  const year = Math.floor((Number(world && world.day) || 0) / YEAR_DAYS);
  return `坐天观井-逝者名录-仙历${year}年.md`;
}
