// Inkbox 「记挂」· 玩家观察者状态（D7-E）
//
// 玩家指着一个人说：「这个人，我想继续看。」
//
// ⚠️ 这是**玩家的观察状态**，不属于世界规律——所以它存在 `world.watch`（一个独立的
//    观察者列表），**绝不挂到 `world.entities` 上**，也**不参与任何模拟判定**：
//    不给 buff、不影响 AI、不进三界人口守恒、不抽 RNG。
//
// ⚠️ 记挂的是「**这一世的人**」，不是灵魂。key 用凡间实体 id（`mortal:<id>`）：
//    转世会拿到新的 id ⇒ **不自动继承**记挂。
//
// 跨界身份：人离开凡间后，本模块只认**两条可靠**的跨界引用，都不按名字猜
// （重名即错，且不报错）：
//   · 飞升 / 被裂缝吸上 ⇒ `upper.arrivedLog[].fromKey`（`arriveUpper` 写的
//     `mortal:<凡间id>`）；
//   · 跌入幽冥 ⇒ 幽冥那只鬼的 `ghostOf.ref`（`ghostSnapshot` 写的 `mortal:<凡间id>`，
//     **且 `ghostOf.route === null`** 以区分「跌进去的」与「死后成鬼的」）。
// 两条与这里的 key **同格式**（`mortal:<凡间id>`）。查不到就如实说「已不可考」。

import { findEntity } from './biography.js';
import { findDead } from './necrology.js';

/** 记挂上限。满了要玩家先取关一个，**不静默顶掉**。 */
export const WATCH_CAP = 12;

/**
 * 会点亮「记挂」标题红点的重大事件 kind（第一版只认这几类，照 D7 规划）。
 * 与 `world.record(..., actors)` 写进 `entity.log` 的 kind 同命名空间。
 */
export const WATCH_MAJOR_KINDS = new Set([
  'breakthrough', 'sect', 'war', 'tribulation', 'thunder-ascend',
  'ascend', 'possess-cross', 'death',
]);

/** 取（或惰性建）观察者列表。 */
export function ensureWatch(world) {
  if (!world) return [];
  if (!Array.isArray(world.watch)) world.watch = [];
  return world.watch;
}

/** 「这一世」的稳定键。 */
export function watchKeyOf(entity) {
  return entity && Number.isFinite(entity.id) ? `mortal:${entity.id}` : null;
}

export function isWatched(world, entity) {
  const key = watchKeyOf(entity);
  if (!key) return false;
  return ensureWatch(world).some((w) => w.key === key);
}

/**
 * 记挂一个人。
 * @returns {{ok:boolean, reason?:string}} `duplicate` = 已在列表；`full` = 到上限。
 */
export function addWatch(world, entity, day) {
  const key = watchKeyOf(entity);
  if (!key || !world) return { ok: false, reason: 'invalid' };
  const list = ensureWatch(world);
  if (list.some((w) => w.key === key)) return { ok: false, reason: 'duplicate' };
  if (list.length >= WATCH_CAP) return { ok: false, reason: 'full' };
  const d = Math.max(0, Math.floor(Number(day) || 0));
  list.push({
    key,
    name: entity.name || '无名',
    addedDay: d,
    lastKnownPlane: 'mortal',
    lastKnownId: entity.id,
    lastReadDay: d,
  });
  return { ok: true };
}

/** 取关（按 key）。返回是否真的移除了。 */
export function removeWatch(world, key) {
  const list = ensureWatch(world);
  const at = list.findIndex((w) => w.key === key);
  if (at < 0) return false;
  list.splice(at, 1);
  return true;
}

/** 切换记挂。已记挂 ⇒ 取关；未记挂 ⇒ 记挂（可能因满而失败）。 */
export function toggleWatch(world, entity, day) {
  const key = watchKeyOf(entity);
  if (key && isWatched(world, entity)) {
    return { ok: true, watched: false, removed: removeWatch(world, key) };
  }
  const res = addWatch(world, entity, day);
  return { ...res, watched: res.ok };
}

/** 在上界来客名录里按「凡间来历」查一条（唯一可靠的跨界引用）。 */
export function upperArrivalOf(world, key) {
  const log = world && world.upper && Array.isArray(world.upper.arrivedLog)
    ? world.upper.arrivedLog
    : null;
  if (!log) return null;
  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (log[i] && log[i].fromKey === key) return log[i];
  }
  return null;
}

/**
 * 在幽冥实体里按「前世身份」查一只鬼（D8-G 的另一条可靠跨界引用）。
 *
 * 可靠引用是 `ghostOf.ref`——`ghostSnapshot` 写的 `mortal:<凡间id>`，与本模块的
 * `watchKeyOf` **同格式**（理由同 `upperArrivalOf`：跨界只认 id，不认名字）。
 *
 * ⚠️ **还必须 `ghostOf.route === null`**：那只鬼必须是**从裂缝跌进去的**，
 *    而不是「正常死亡后按五路成鬼」。判据来源是 `sim/rifts.js` 的
 *    `fallIntoNether` 显式传 `route: null`（「没走魂路」），而正常死亡的鬼
 *    在 `reincarnation.js` 里 `route` 恒为 `SOUL_ROUTES` 五值之一（**永不为 null**）。
 *    不加这一条，一个「死了、成鬼、`deadLog` 记录又被 800 上限淘汰掉」的旧人
 *    会被误判成「已落幽冥」——而那是**谎话**（他并没跌进去）。**不猜**是这里的底线。
 *
 * @param {object} world 凡间 world（挂 `.nether` 的那个）
 * @param {string} key   `mortal:<凡间id>`
 * @returns {object|null} 那只鬼（含 `x`/`y`/`ghostOf`）；查不到返回 `null`
 */
export function netherGhostOf(world, key) {
  const list = world && world.nether && Array.isArray(world.nether.entities)
    ? world.nether.entities
    : null;
  if (!list) return null;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const e = list[i];
    if (e && e.ghostOf && e.ghostOf.ref === key && e.ghostOf.route === null) return e;
  }
  return null;
}

/**
 * 解析一条记挂的当前状态。**纯读、不抛错**（人不存在也返回 `unknown`）。
 *
 * 判据顺序（承重）：
 *   ① 凡间还活着（含被夺舍 ⇒ `possessed`）
 *   ② 上界来客里有可靠引用 ⇒ `ascended`
 *   ③ 逝者名录里有 ⇒ `dead`（飞升者也进名录，所以②必须在③前）
 *   ④ 幽冥里有「跌进去的」那只鬼 ⇒ `nether`（D8-G）
 *   ⑤ 都没有 ⇒ `unknown`（**不按名字猜**）
 *
 * ⚠️ **④ 必须在 ③ 之后**：正常死亡（含成鬼）的人先进 `deadLog`，应当在③就被
 *    认成「故人」；而「跌入幽冥」**不写 `deadLog`**（`fallIntoNether` 只写编年史），
 *    所以跌入者到不了③，只在④命中。顺序反过来会把「死者成鬼」误报成「跌入幽冥」。
 * ⚠️ ④ 只认 `route === null` 的鬼（见 `netherGhostOf`）——**不按名字猜**。
 */
export function resolveWatch(world, entry) {
  if (!world || !entry) return { state: 'unknown', label: '已不可考' };
  const alive = findEntity(world, entry.lastKnownId);
  if (alive) {
    if (alive.possessionScar && alive.possessionScar.mode === 'possess') {
      return { state: 'possessed', label: '异魂占身', entity: alive };
    }
    return { state: 'alive', label: '在世', entity: alive };
  }
  const upper = upperArrivalOf(world, entry.key);
  if (upper) return { state: 'ascended', label: '已入上界', upperId: upper.id, upper };
  const dead = findDead(world, entry.lastKnownId);
  if (dead) {
    const year = Math.floor((Number(dead.died) || 0) / 360) + 1;
    return { state: 'dead', label: `故人 · 故于仙历 ${year} 年`, dead };
  }
  const ghost = netherGhostOf(world, entry.key);
  if (ghost) return { state: 'nether', label: '已落幽冥', netherId: ghost.id, ghost };
  return { state: 'unknown', label: '已不可考' };
}

/** 记挂列表的派生视图（面板直接吃它）。 */
export function watchRows(world) {
  return ensureWatch(world).map((entry) => ({ entry, ...resolveWatch(world, entry) }));
}

/**
 * 一条记挂**自上次读过以来**有没有新消息。**纯读、不写世界**。
 *
 * 这是「红点亮不亮」与「标题上那个数字是几」的**唯一**判据：
 * `watchHasNews` 与 `watchNewsCount` 都从它派生——
 * 两处各写一遍的话，红点亮了而数字是 0（或反过来）是迟早的事，
 * 而且那种不一致**不报错**，玩家只会觉得这一块坏了。
 */
function watchEntryHasNews(world, entry) {
  const read = Number.isFinite(entry.lastReadDay) ? entry.lastReadDay : entry.addedDay;
  const r = resolveWatch(world, entry);
  if (r.state === 'alive' && r.entity) {
    const log = Array.isArray(r.entity.log) ? r.entity.log : [];
    for (let j = log.length - 1; j >= 0; j -= 1) {
      const row = log[j];
      if (row && WATCH_MAJOR_KINDS.has(row.kind) && (row.day || 0) > read) return true;
    }
    return false;
  }
  if (r.state === 'dead' && r.dead) return (Number(r.dead.died) || 0) > read;
  if (r.state === 'ascended' && r.upper) return (Number(r.upper.day) || 0) > read;
  if (r.state === 'nether' && r.ghost) {
    // 「跌入幽冥」那一刻也算一条大事（锚是 `ghostOf.deathDay` = 跌落那天）。
    // 没有它，记挂的人掉进幽冥后红点不亮，玩家不会知道「他去哪了」。
    const fell = r.ghost.ghostOf && Number.isFinite(r.ghost.ghostOf.deathDay)
      ? r.ghost.ghostOf.deathDay
      : 0;
    return fell > read;
  }
  return false;
}

/** 有没有「未读的重大事件」——标题上的红点。**纯读**。 */
export function watchHasNews(world) {
  return watchNewsCount(world) > 0;
}

/**
 * **按人**数一数「有未读消息」的记挂有几个（Q14：标题上印 `记挂 · 3`）。
 *
 * ⚠️ 它数的是**人**，不是事件条数：一个人这期间突破了三次，仍然只算 1。
 *    印成事件条数的话，那个数字会比列表行数还大，玩家会以为列表被截断了。
 * ⚠️ 纯读、不抽 RNG、不写 `lastReadDay`（标已读是 `markWatchRead` 的事）。
 */
export function watchNewsCount(world) {
  const list = ensureWatch(world);
  let n = 0;
  for (let i = 0; i < list.length; i += 1) {
    if (watchEntryHasNews(world, list[i])) n += 1;
  }
  return n;
}

/** 把一条记挂标记为已读。 */
export function markWatchRead(world, key, day) {
  const entry = ensureWatch(world).find((w) => w.key === key);
  if (!entry) return false;
  entry.lastReadDay = Math.max(0, Math.floor(Number(day) || 0));
  return true;
}

/** 把全部记挂标记为已读（打开面板时用）。 */
export function markAllWatchRead(world, day) {
  const d = Math.max(0, Math.floor(Number(day) || 0));
  ensureWatch(world).forEach((w) => { w.lastReadDay = d; });
}
