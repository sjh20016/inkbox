// World Laboratory · 人物命运观察队列（B2-2）
//
// ───────────────────────────────────────────────────────────────────────
// 这个模块回答什么
// ───────────────────────────────────────────────────────────────────────
//
// B2-2 要回答：「修士成长是否有足够长的可观察过程？不同修士的人生是否真的
// 会分叉？」这需要一个**确定性的、长达数百年的个体追踪装置**。本文件就是它。
//
// ───────────────────────────────────────────────────────────────────────
// 四条纪律（每一条都对应一种「看起来能跑、其实是造假」的写法）
// ───────────────────────────────────────────────────────────────────────
//
// ① **选人不抽 RNG**。选择规则是纯函数：按 `entity.id`（创建序，稳定且唯一）
//    排序后等距取 ≤ max 个。不用随机、不调任何会推进世界的入口。
//    ⇒「选了谁」与「世界怎么走」在结构上不可能互相影响。
//
// ② **不猜身份继承**。人死后想追他的转世，唯一诚实的凭据是代码里真实存在的
//    **id 级关系**：`entity.soulId`（这具身体里装着哪条魂）。同一条魂换身体，
//    `soulId` 不变 ⇒ 可以直接观测。而「死者 → 新魂」的映射在代码里只能靠
//    `soul.ofName`（姓名）建立，委托书明文禁止用姓名猜身份继承 ⇒ 记为
//    `unavailable`，不补零、不冒充。
//
// ③ **幸存者偏差零容忍**。队列成员死亡 / 被名册淘汰后**永远留在样本里**：
//    活着记当前状态；死了记名册里的最后可证状态（`world.dead` 有 `id` 稳定键）；
//    名册里也没有（被 trimNecrology 淘汰）⇒ 记 `unavailable` + 最后一次
//    活着时的观测。样本只增不减。
//
// ④ **只读**。本模块不写 world、不抽签、不调 advance*（与 collectors.mjs 同纪律）。
//    这是可证的：开关本模块时世界 digest 必须逐字节相同（自检钉死）。
//
// ───────────────────────────────────────────────────────────────────────
// 一条从实现里长出来的语义：atDay 是**下界**，不是精确建队日
// ───────────────────────────────────────────────────────────────────────
//
// 实测（`generateWorld(scatter:true)`）：第 0 日的 `world.entities` 是**空的**，
// 20 个初始聚落点排在 `world.pendingSpawns` 里，要等 `advanceWorld` 才逐日落地
// （第 3 日 3 个、第 30 日 12 个、第 90 日 30 个）。⇒ `atDay: 0` 建不出任何队伍。
//
// 所以建队条件是「已达 atDay **且**实体表非空」的**第一个快照点**：
//   · 空池期不建队、**也不采空快照**（一份 0 成员的 fate.csv 比没有更坏——
//     它看起来像「跑过了，只是没人可看」）；
//   · 实际建队日记在 fate.csv 第一行的 `day` 上——**不猜、不编**，要查就查。
//   · 真实实验用 atDay ≥ 3600（第 10 年）时人口早已成形，这条规则不改变任何
//     既有语义；它只让「很小的 atDay」从「静默产出空数据」变成「等有人再说」。

// ⚠️ 只 import `realmLabel`：它收的是**等级**（内部自己调 realmFor）。
//    早先同时 import 了 realmFor 并写成 `realmLabel(realmFor(level))`——
//    把 realm 对象当等级传进去，整列变成「炼气NaN层」。见 collectFate 里的注释。
import { realmLabel } from '../../src/inkbox/core/cultivation.js';

/**
 * 选取范围的白名单。
 *
 * ⚠️ **一处定义，两处引用**：`job-schema.mjs` 的校验器与 `selectFateQueue`
 *    都从这里取。若在两处各写一份 `['all','cultivators','mortals']`，
 *    将来加一种范围（比如「只看宗门子弟」）时必然只改一处——
 *    于是 Job 能过校验、选人时却被当成未知值静默忽略，跑出一份空队列。
 */
export const FATE_FILTERS = Object.freeze(['all', 'cultivators', 'mortals']);

/** `fateQueue` 的合法键（与 FATE_FILTERS 同目的：校验器与 runner 共用）。 */
export const FATE_QUEUE_KEYS = Object.freeze(['max', 'atDay', 'filter']);

/** 默认队列规格。atDay 默认 0 = 从第 0 日起观察（不给「默认不观察」的兜底）。 */
export const FATE_QUEUE_DEFAULTS = Object.freeze({ max: 32, atDay: 0, filter: 'all' });

/**
 * 把 Job 里的 `fateQueue` 归一化成完整规格（补齐默认值）。
 *
 * 只应在 `validateJob` **之后**调用——这里不做合法性检查，
 * 因为「非法输入必须响在跑之前」的兑现点是校验器，不是本函数。
 *
 * @param {object|null|undefined} spec
 * @returns {{max:number, atDay:number, filter:string}|null} `null` = 不建队列
 */
export function fateQueueSpec(spec) {
  if (spec === null || spec === undefined) return null;
  return {
    max: Math.max(1, Math.min(64, Math.floor(Number(spec.max ?? FATE_QUEUE_DEFAULTS.max)))),
    atDay: Math.max(0, Math.floor(Number(spec.atDay ?? FATE_QUEUE_DEFAULTS.atDay))),
    filter: FATE_FILTERS.includes(spec.filter) ? spec.filter : FATE_QUEUE_DEFAULTS.filter,
  };
}

/**
 * 命运队列 CSV 的列清单（**追加式纪律**：新增列一律加在末尾，永不改名删列）。
 *
 * `state` 四态：`alive` / `dead` / `ascended` / `unavailable`。
 * `unavailable` 是**诚实态**：被 necrology 淘汰后我们仍然持有最后一次活着的观测，
 * 但「现在的确切状态」不可得 —— 它绝不是 0，也不是 dead。
 */
export const FATE_COLUMNS = Object.freeze([
  'slot', 'id', 'name', 'state', 'level', 'realm', 'exp', 'hp', 'maxHp',
  'age', 'lifespan', 'faction', 'village', 'root',
  'soulId', 'incarnation',
  'died', 'cause', 'fate', 'soulRoute',
  'maxLevelSeen', 'everCultivator', 'lastAliveDay', 'note',
  // ── 追加列（B2-2 补：突破失败的可证残留）────────────────────────
  // ⚠️ 只加在末尾，永不改名删列（旧 fate.csv 必须是新 fate.csv 的前缀子集）。
  // `heartDemon` 是**活体**上唯一积累的失败史字段（cultivation.js 的
  // applyBreakthroughFailure 每次失败 +HEART_DEMON_ON_FAILURE，且心魔本身
  // 会让下一次突破更难 ⇒ 它同时是「失败过几次」的代理与「还会不会再失败」的
  // 先行指标）。死者不带这一列——necrology 的记录里没有它，留空是诚实态。
  'heartDemon',
]);

/**
 * 确定性选人。
 *
 * ⚠️ 实体表为空时返回 `[]`（**不是**抛错、也不是兜底选人）。调用方
 *    （`runner.collectFateIfDue`）应按「空池 ⇒ 本期不建队」处理，理由见本文件
 *    头部「atDay 是下界」一段。这里之所以不自己重试：选人必须是**纯函数**
 *    （同 world ⇒ 同结果），一旦内含「等到有人为止」的循环，它就不再纯，
 *    「选队不抽 RNG」这条纪律就没法用一个 deepEqual 证明。
 *
 * @param {object} world 凡间 world（只读）
 * @param {object} spec
 * @param {number} [spec.max=32]   队列上限（委托书：至多 32 名）
 * @param {'all'|'cultivators'|'mortals'} [spec.filter='all'] 选取范围
 * @returns {Array<{slot:number, id:number, name:string, level:number}>}
 */
export function selectFateQueue(world, { max = 32, filter = 'all' } = {}) {
  const cap = Math.max(1, Math.min(64, Math.floor(max)));
  let pool = world.entities.filter((e) => e && Number.isFinite(e.id));
  if (filter === 'cultivators') pool = pool.filter((e) => (e.level || 0) > 0);
  if (filter === 'mortals') pool = pool.filter((e) => (e.level || 0) <= 0);
  // 按 id 升序（创建顺序）。id 在 removeEntity 的 swap-pop 下依然稳定。
  pool.sort((a, b) => a.id - b.id);
  if (pool.length <= cap) {
    return pool.map((e, i) => ({ slot: i, id: e.id, name: String(e.name || ''), level: e.level || 0 }));
  }
  // 等距取样：覆盖整个 id 区间，而不是只取最早的 cap 个（那会偏向初代人口）。
  const stride = pool.length / cap;
  const out = [];
  for (let i = 0; i < cap; i += 1) {
    const e = pool[Math.min(pool.length - 1, Math.floor(i * stride))];
    out.push({ slot: i, id: e.id, name: String(e.name || ''), level: e.level || 0 });
  }
  return out;
}

/** 在实体数组里按 id 找（O(n)；队列 ≤ 32，快照级调用，代价可忽略）。 */
function findById(list, id) {
  if (!Array.isArray(list)) return null;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] && list[i].id === id) return list[i];
  }
  return null;
}

/**
 * 采一次队列快照。
 *
 * @param {object} world 凡间 world（只读）
 * @param {Array} queue `selectFateQueue` 的产物（**选中后不再变动**——成员名单
 *    是固定的，这正是「不悄悄移除样本」的兑现：名单是输入，不是每次重算）
 * @param {object} [prev] 上一次采集（用于填 lastAliveDay / everCultivator 等跨样本状态）
 * @returns {{day:number, members:Array<object>}} 每成员一行（与 FATE_COLUMNS 对齐）
 */
export function collectFate(world, queue, prev = null) {
  const day = world.day || 0;
  const prevById = new Map();
  if (prev && Array.isArray(prev.members)) {
    for (const m of prev.members) prevById.set(m.id, m);
  }
  const members = [];
  for (const q of queue) {
    const p = prevById.get(q.id) || null;
    const e = findById(world.entities, q.id);
    if (e) {
      // ── 活着 ──
      members.push({
        slot: q.slot,
        id: q.id,
        name: String(e.name || ''),
        state: 'alive',
        level: e.level || 0,
        // ⚠️ `realmLabel` 收的是**等级**（它内部自己调 realmFor）。
        //    曾经写成 `realmLabel(realmFor(level))` ⇒ 把 realm 对象当等级传进去，
        //    于是整列变成「炼气NaN层」——一个看起来像数据、其实是 NaN 的列。
        realm: (e.level || 0) > 0 ? realmLabel(e.level || 0) : '凡人',
        exp: Math.round((e.exp || 0) * 100) / 100,
        hp: Math.round(e.hp || 0),
        maxHp: Math.round(e.maxHp || 0),
        age: Math.floor(e.age || 0),
        lifespan: Math.floor(e.lifespan || 0),
        faction: e.faction || 0,
        village: e.village || 0,
        soulId: e.soulId == null ? '' : e.soulId,
        incarnation: e.incarnation || 0,
        root: (e.root && e.root.rootName) || '',
        died: '',
        cause: '',
        fate: '',
        // 跨样本记忆：活着见到过的最高境界、是否曾经是修士
        maxLevelSeen: Math.max(p ? p.maxLevelSeen || 0 : 0, e.level || 0),
        everCultivator: Boolean(p && p.everCultivator) || (e.level || 0) > 0,
        lastAliveDay: day,
        // 心魔：突破失败的可证残留（死者不带，necrology 里没有这个字段）
        heartDemon: Math.round((e.heartDemon || 0) * 100) / 100,
      });
      continue;
    }
    // ── 不在实体表里：查名册（id 稳定键）──
    const d = findById(world.dead, q.id);
    if (d) {
      members.push({
        slot: q.slot,
        id: q.id,
        name: String(d.name || q.name || ''),
        state: d.fate === 'ascended' ? 'ascended' : 'dead',
        level: d.level || 0,
        realm: (d.level || 0) > 0 ? realmLabel(d.level || 0) : '凡人',
        exp: '',
        hp: '',
        maxHp: '',
        age: d.age || 0,
        lifespan: '',
        faction: '',
        village: '',
        soulId: '',
        incarnation: '',
        root: d.rootName || '',
        died: d.died || 0,
        cause: d.cause || '',
        fate: d.fate || '',
        soulRoute: d.soulRoute == null ? '' : d.soulRoute,
        maxLevelSeen: Math.max(p ? p.maxLevelSeen || 0 : 0, d.level || 0),
        everCultivator: Boolean(p && p.everCultivator) || (d.level || 0) > 0,
        lastAliveDay: p ? p.lastAliveDay : '',
        heartDemon: '',   // necrology 没有这个字段 ⇒ 不可得，留空（不是 0）
      });
      continue;
    }
    // ── 实体表与名册都没有：被 trimNecrology 淘汰（或 id 段不符）⇒ 如实记 unavailable ──
    members.push({
      slot: q.slot,
      id: q.id,
      name: String((p && p.name) || q.name || ''),
      state: 'unavailable',
      level: '',
      realm: '',
      exp: '',
      hp: '',
      maxHp: '',
      age: '',
      lifespan: '',
      faction: '',
      village: '',
      soulId: '',
      incarnation: '',
      root: '',
      died: p && p.state !== 'alive' ? p.died : '',
      cause: '',
      fate: '',
      maxLevelSeen: p ? p.maxLevelSeen || 0 : 0,
      everCultivator: Boolean(p && p.everCultivator),
      lastAliveDay: p ? p.lastAliveDay : '',
      heartDemon: '',   // 名册淘汰 ⇒ 所有活体读数终止，心魔同样不可得
      note: 'necrology-trimmed-or-absent',
    });
  }
  return { day, members };
}

/** 队列成员的一行摘要（供 summary / 报告用，不进 CSV）。 */
export function fateQueueSummary(fateSnapshots) {
  if (!fateSnapshots.length) return null;
  const last = fateSnapshots[fateSnapshots.length - 1];
  const counts = { alive: 0, dead: 0, ascended: 0, unavailable: 0 };
  for (const m of last.members) {
    if (counts[m.state] === undefined) counts.unavailable += 1;
    else counts[m.state] += 1;
  }
  const alive = last.members.filter((m) => m.state === 'alive');
  return {
    day: last.day,
    memberCount: last.members.length,
    counts,
      aliveMaxLevel: alive.reduce((mx, m) => Math.max(mx, Number(m.maxLevelSeen) || 0), 0),
      aliveMeanAge: alive.length
        ? Math.round(alive.reduce((s, m) => s + (Number(m.age) || 0), 0) / alive.length)
        : null,
      // 心魔峰值：失败史的代理指标（只统计活体带这一列的样本）
      maxHeartDemon: last.members.reduce((mx, m) => Math.max(mx, Number(m.heartDemon) || 0), 0),
      everCultivatorCount: last.members.filter((m) => m.everCultivator).length,
      columns: FATE_COLUMNS,
  };
}
