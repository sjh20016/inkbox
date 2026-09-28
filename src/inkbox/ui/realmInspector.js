// 水墨沙盒 · 视界「穿透检视」（D8-F）—— 从另一界的世界对象里挑出窗内之物，摊成卡片行。
//
// ───────────────────────────────────────────────────────────────────────
// 这个模块负责什么
// ───────────────────────────────────────────────────────────────────────
//
// 视界（`ui/realmView.js` / `render/realmViewLayer.js`）是「看」。D8-F 让玩家
// **点开窗里的东西**看它是什么——但**仍然是看**：本模块**只读**，不写世界、
// 不抽 RNG、不进存档。这条契约是**结构性**的：模块里没有任何 `world.xxx =`
// 赋值、没有任何 `rng()` 调用，也没有 import 任何会写的 sim 函数。
//
// ⚠️ **为什么另起一个模块，不复用 `main.js` 的 `inspectAt()`**（蓝图 §D8-F 原话）：
//    凡间检视卡里塞着**凡间专有**的一整套——记挂按钮、人物传记、关系图、
//    家世谱系、地上无主之物、附身/养伤的行为锁解释。直接拿它来检查一只鬼修，
//    会制造一串 `if (plane === 'nether')`，把两套完全不同的语义搅在一起。
//    所以本模块**只服务视界**，行集按位面分派，与凡间那套零重叠。
//
// ⚠️ **本模块 import 的都是纯函数**（`realmLabel` / `ghostTierOf` /
//    `GHOST_TIER_NAMES`），它们的顶层不碰 DOM ⇒ node 能直接 import ⇒
//    `scripts/inkbox-view.mjs` 的 V8 组可以写成**运行时**断言，而不是只扫源码。
//    （`ui/tools.js` 同样 import 了 `sim/*`，所以这不是破例。）
//
// ⚠️ **窗内不许做的事**（蓝图 §D8-F 末段）：改属性 / 传功 / 记挂幽冥鬼 /
//    施神力 / 操控上界单位。本模块只产出**字符串行**，连一个能改状态的接口
//    都不暴露——「D8 仍然是观察」这句话因此不是靠自觉，是靠结构。

import { realmLabel } from '../core/cultivation.js';
import { ghostTierOf, GHOST_TIER_NAMES } from '../sim/netherLife.js';

/** 检视半径（格）：与凡间 `inspectAt` 的「近处」同量级，玩家点在东西附近即可命中。 */
export const REALM_INSPECT_RADIUS = 4;

/** `arrivedLog.via` → 玩家可见的来路（上界人物「怎么来的」）。 */
const VIA_LABEL = Object.freeze({
  rift: '经裂隙而来',
  ascend: '飞升而来',
  thunder: '天雷飞升',
});

/** 境界显示名。**level 0 要说「凡人」**——`realmLabel(0)` 会落进炼气档，是错的。 */
function realmName(level) {
  const lv = Number.isFinite(level) ? level : 0;
  return lv >= 1 ? realmLabel(lv) : '凡人';
}

/** 世界内 id → 名字（宗门 / 仙门）。查不到返回 `null`，**不抛**。 */
function factionName(world, id) {
  if (!world || !Array.isArray(world.factions) || !id) return null;
  const f = world.factions.find((x) => x && x.id === id);
  return (f && f.name) || null;
}

/**
 * 挑出「窗内 `(x, y)` 附近最值得看的一件东西」。
 *
 * 优先级（**位面决定可选类型**）：
 *   · 上界 ⇒ 只挑**人**（V1 范围；蓝图 §D8-F「上界人物」）；
 *   · 幽冥 ⇒ 先挑**鬼魂 / 鬼修**，没有才挑**幽冥物品**。
 *     （鬼是「活的」，物品是「躺着的」；同格时先看活的更符合直觉。）
 * 同类型多个候选取**最近的一个**（`Math.hypot` 距离，稳定可复现）。
 *
 * @param {object} realmWorld 该位面的 world（`this.upper` 或 `this.nether`）
 * @param {'upper'|'nether'} plane
 * @param {number} x
 * @param {number} y
 * @param {number} [radius]
 * @returns {object|null} `{ kind, plane, x, y, subject, world }`；无命中返回 `null`
 */
export function pickRealmSubject(realmWorld, plane, x, y, radius = REALM_INSPECT_RADIUS) {
  if (!realmWorld || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const near = (o) => o && Number.isFinite(o.x) && Number.isFinite(o.y)
    && Math.hypot(o.x - x, o.y - y) <= radius;
  const nearest = (list) => {
    let best = null;
    let bestD = Infinity;
    const arr = Array.isArray(list) ? list : [];
    for (let i = 0; i < arr.length; i += 1) {
      const o = arr[i];
      if (!near(o)) continue;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  };

  if (plane === 'nether') {
    const ghost = nearest(realmWorld.entities);
    if (ghost) return { kind: 'ghost', plane, x, y, subject: ghost, world: realmWorld };
    const item = nearest(realmWorld.artifacts);
    if (item) return { kind: 'artifact', plane, x, y, subject: item, world: realmWorld };
    return null;
  }

  // 上界：只挑人。
  const person = nearest(realmWorld.entities);
  if (person) return { kind: 'person', plane, x, y, subject: person, world: realmWorld };
  return null;
}

/** 上界人物一行集。`arrivedLog` 里按 id 找他的来路快照（跨档可查、永不悬垂）。 */
function personRows(picked, ctx) {
  const e = picked.subject;
  const rows = [['姓名', e.name || '无名']];
  rows.push(['境界', realmName(e.level)]);
  if (Number.isFinite(e.age)) rows.push(['年龄', `${Math.floor(e.age / 360)} 岁`]);
  rows.push(['仙门', factionName(picked.world, e.faction) || '散修']);

  const log = Array.isArray(ctx.arrivedLog) ? ctx.arrivedLog : [];
  let entry = null;
  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (log[i] && log[i].id === e.id) { entry = log[i]; break; }
  }
  const via = entry ? (VIA_LABEL[entry.via] || '自凡间而来') : null;
  rows.push(['来路', e.fromMortal === true ? (via || '自凡间而来') : '上界原生']);
  if (entry && entry.fromKey) rows.push(['凡间来历', String(entry.fromKey)]);
  if (entry && entry.sect) rows.push(['凡间宗门', String(entry.sect)]);

  // ★ 天道旧识：他正是玩家**在凡间记挂过的那个人**飞升上来的。
  // ⚠️ 只**显示**，**绝不**顺手给他建一条 upper watch（蓝图 §D8-F 明令）。
  const watch = Array.isArray(ctx.watch) ? ctx.watch : [];
  if (entry && entry.fromKey && watch.some((w) => w && w.key === entry.fromKey)) {
    rows.push(['旧识', '★ 天道旧识']);
  }
  return rows;
}

/** 幽冥鬼魂 / 鬼修一行集。 */
function ghostRows(picked, ctx) {
  const g = picked.subject;
  const isCultivator = g.soulKind === 'ghostCultivator';
  const rows = [['名字', g.name || '孤魂']];
  rows.push(['类别', isCultivator ? '鬼修' : '普通鬼魂']);
  if (isCultivator) {
    const tier = ghostTierOf(g.level);
    rows.push(['阶位', GHOST_TIER_NAMES[tier] || '游魂']);
  }
  rows.push(['积怨', `${Math.round(g.ghostRancor || 0)}`]);

  const of = g.ghostOf;
  const anchor = (of && Number.isFinite(of.deathDay)) ? of.deathDay : null;
  if (anchor !== null && Number.isFinite(ctx.day)) {
    rows.push(['滞留', `${Math.max(0, Math.floor((ctx.day - anchor) / 360))} 年`]);
  }
  // 前世身份快照（`ghostOf` 全是值，零 id 引用——铁律三）。
  if (of) {
    rows.push(['前世', `${of.name || '无名'} · ${realmName(of.level)}`]);
    if (of.sectName) rows.push(['前世宗门', String(of.sectName)]);
  }
  // 来路：`route === null` ⇒ 他是**从裂缝跌进去的**（没走五路魂路，见
  // `sim/rifts.js` 的 `fallIntoNether` 与 `reincarnation.js` 的 `ghostSnapshot`）。
  // ⚠️ 不能拿 `fromMortal` 判——`spawnNetherGhost` 从不设它。
  const riftFall = Boolean(of) && of.route === null;
  rows.push(['来路', riftFall ? '自裂缝跌入' : '循魂路而来']);
  return rows;
}

/** 幽冥物品一行集。`technique` 非空 = 幽冥自生（唯一标记，见 `artifacts.js`）。 */
function artifactRows(picked) {
  const a = picked.subject;
  const rows = [['名字', a.name || '无名之物']];
  rows.push(['携带功法', (a.technique && a.technique.name) ? a.technique.name : '无']);
  rows.push(['来源', a.technique ? '幽冥自生' : '自凡间跌入带来']);
  return rows;
}

/**
 * 把「挑出来的东西」摊成卡片行（纯格式化）。
 *
 * @param {object|null} picked `pickRealmSubject` 的产物
 * @param {object} [ctx] `{ day, watch, arrivedLog, planeLabel }`
 *   · `day`        凡间 `world.day`（鬼魂「滞留多少年」的锚）；
 *   · `watch`      `world.watch`（判 ★ 天道旧识；**只读**）；
 *   · `arrivedLog` 该位面 world 的来客名录（上界人物来路）；
 *   · `planeLabel` 玩家可见界名（卡片头）。
 * @returns {{head:string, rows:Array}|null} 无命中返回 `null`（由调用方决定怎么提示）
 */
export function realmInspectRows(picked, ctx = {}) {
  if (!picked || !picked.subject) return null;
  const label = ctx.planeLabel || '';
  const head = `${label} · 格 (${picked.x}, ${picked.y})`;
  let rows;
  if (picked.kind === 'person') rows = personRows(picked, ctx);
  else if (picked.kind === 'ghost') rows = ghostRows(picked, ctx);
  else if (picked.kind === 'artifact') rows = artifactRows(picked);
  else rows = [];
  return { head, rows };
}
