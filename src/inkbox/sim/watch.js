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
// 跨界身份：飞升后凡间实体被移出 `entities`，唯一**可靠**的跨界引用是
// `upper.arrivedLog[].fromKey`（`arriveUpper` 写的 `mortal:<凡间id>`）——
// 与这里的 key 同格式。**没有可靠引用时不许按名字猜**（重名即错，且不报错）。

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
 * 解析一条记挂的当前状态。**纯读、不抛错**（人不存在也返回 `unknown`）。
 *
 * 判据顺序（承重）：
 *   ① 凡间还活着（含被夺舍 ⇒ `possessed`）
 *   ② 上界来客里有可靠引用 ⇒ `ascended`
 *   ③ 逝者名录里有 ⇒ `dead`（飞升者也进名录，所以②必须在③前）
 *   ④ 都没有 ⇒ `unknown`（**不按名字猜**）
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
  return { state: 'unknown', label: '已不可考' };
}

/** 记挂列表的派生视图（面板直接吃它）。 */
export function watchRows(world) {
  return ensureWatch(world).map((entry) => ({ entry, ...resolveWatch(world, entry) }));
}

/** 有没有「未读的重大事件」——标题上的红点。**纯读**。 */
export function watchHasNews(world) {
  const list = ensureWatch(world);
  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i];
    const read = Number.isFinite(entry.lastReadDay) ? entry.lastReadDay : entry.addedDay;
    const r = resolveWatch(world, entry);
    if (r.state === 'alive' && r.entity) {
      const log = Array.isArray(r.entity.log) ? r.entity.log : [];
      for (let j = log.length - 1; j >= 0; j -= 1) {
        const row = log[j];
        if (row && WATCH_MAJOR_KINDS.has(row.kind) && (row.day || 0) > read) return true;
      }
    } else if (r.state === 'dead' && r.dead && (Number(r.dead.died) || 0) > read) {
      return true;
    } else if (r.state === 'ascended' && r.upper && (Number(r.upper.day) || 0) > read) {
      return true;
    }
  }
  return false;
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
