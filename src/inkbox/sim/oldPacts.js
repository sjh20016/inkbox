// 水墨沙盒 · 人物旧约（万象拾趣 V0.1 · P3）
//
// ═══════════════════════════════════════════════════════════════════════
// ⚠️⚠️ **候选状态：未接线**（本文件不被任何游戏路径 import）
//
// 这是委托书 §4-P3 的**降级形态**：机制写完、定向测试跟上了，但没有接进
// 正式游戏。理由（交付文档 WANXIANG_V01_DELIVERY.md 有完整版）：
//   · 立约的天然触发点在 `relations.js`（拜师 / 结道侣）——该文件是
//     开放 PR #30（G6-P0 血仇）的施工面，按委托书纪律不碰；
//   · 旧约要跨存读档存在，就得给 `save.js` 加一个世界级数组（先例有：
//     `watch` / `worldEventState`），但本轮的存档接线收益抵不过
//     「Sol 6.1 之后还要再对一次键集」的成本；
//   · 临时运行内存里的旧约会在读档后凭空消失——那是「伪称长期可玩」，
//     委托书明令禁止，所以宁可整块不接。
// 接线时的完整清单见交付文档 §「等基线之后」。在此之前，本模块唯一的
// 消费方是 `scripts/inkbox-wanxiang-check.mjs` 的定向测试。
// ═══════════════════════════════════════════════════════════════════════
//
// ── 机制本体（参考 Wildermyth 的关系钩子 + Endless Sky 的有限状态）────
//
//   两名**有稳定 id、有真实关系**的人立下一个约 → 只记五样东西：
//   双方 id、约定类型、立约日、到期日、（结算后）结果 → 到期后依据
//   **当前**生死与关系结算一次：兑现 / 落空 / 缘尽 →（接线后）在双方
//   命簿各留一条简短经历。
//
// 结构性约束：
//   · 全程**零 rng**——立约由调用点的事件触发，结算只读世界现状判等，
//     同一存档同一时刻结算出同一个结果，读档重推不分叉；
//   · 身份只用 `(plane, id)`，名字只是结算文本里的展示字——
//     重名不会错连，死亡 / 飞升者不在 `world.entities` 里，自然落空；
//   · **不伪装行为**：结算只判「人还在不在、关系还在不在」，
//     没有「当场比剑」「千里赴会」这类没有空间模拟支撑的戏；
//   · 幂等：结算过就再也不是未决状态（`settledDay` 盖章），
//     重复推进、读档恢复、迟到结算都只会得到同一个已结结果。

/** 旧约池上限。接线时 `world.pacts` 以此截断，防止无上限增长 */
export const OLD_PACT_CAP = 24;

/** 首版只认两种真实关系（都有现成的建立事件可挂钩） */
export const OLD_PACT_TYPES = Object.freeze({
  disciple: '出师之约',
  lover: '白首之约',
});

/** 默认履约期限（游戏日）：修仙十年之期 */
export const OLD_PACT_TERM_DAYS = 3600;

/**
 * 一对当事人此刻的关系是否撑得起这份约。
 *
 * ⚠️ 师徒是**双向镜像**的两条登记（`relations.js` 的 addRelation：
 * 师父那边记 mentor、弟子那边记 disciple），所以「出师之约」要求的是
 * 一对镜像，而不是两边同字。道侣无镜像，两边同字。
 */
function relationIntact(a, b, type) {
  const relA = a.relations ? a.relations.get(b.id) : null;
  const relB = b.relations ? b.relations.get(a.id) : null;
  if (!relA || !relB) return false;
  if (type === 'lover') return relA.type === 'lover' && relB.type === 'lover';
  if (type === 'disciple') {
    return (relA.type === 'mentor' && relB.type === 'disciple')
      || (relA.type === 'disciple' && relB.type === 'mentor');
  }
  return false;
}

/**
 * 立下一份旧约。
 *
 * @param {object} world 世界（只读 `world.day`；接线后由调用方把返回值存进 `world.pacts`）
 * @param {object} a 当事人一（必须有稳定 `id`，活着）
 * @param {object} b 当事人二（同上；与 a 不得是同一人）
 * @param {'disciple'|'lover'} type 约定类型——必须对应一条**此刻真实存在**的关系
 * @param {number} [dueDay] 到期日；缺省为立约日 + OLD_PACT_TERM_DAYS
 * @returns {object|null} 立成的旧约；条件不满足返回 null（不是错误）
 */
export function offerPact(world, a, b, type, dueDay = null) {
  if (!world || !Number.isFinite(world.day)) return null;
  if (!OLD_PACT_TYPES[type]) return null;
  if (!a || !b || !a.id || !b.id || a.id === b.id) return null;
  if (!Number.isFinite(a.id) || !Number.isFinite(b.id)) return null;
  if ((a.hp ?? 0) <= 0 || (b.hp ?? 0) <= 0) return null;
  if (!relationIntact(a, b, type)) return null;
  const day = Math.floor(world.day);
  const pact = {
    aId: a.id, aName: a.name || null,
    bId: b.id, bName: b.name || null,
    type,
    madeDay: day,
    dueDay: Number.isFinite(dueDay) ? Math.floor(dueDay) : day + OLD_PACT_TERM_DAYS,
    settledDay: null,
    outcome: null,
  };
  return pact;
}

/** 到期未决的旧约（接线时每 tick 或低频时钟里扫这一小撮；候选态仅供测试用） */
export function duePacts(pacts, world) {
  if (!Array.isArray(pacts) || !world) return [];
  return pacts.filter(p => p && p.settledDay == null
    && Number.isFinite(p.dueDay) && world.day >= p.dueDay);
}

function labelOf(pact, winner) {
  const name = winner === 'a' ? pact.aName : pact.bName;
  const other = winner === 'a' ? pact.bName : pact.aName;
  return name && other ? `${name}与${other}` : '两位旧识';
}

/**
 * 结算一份旧约（**幂等**：已结的永远返回同一个已结结果，不再改动）。
 *
 * @returns {{status:'kept'|'void'|'estranged'|'noop', text:string}}
 *   `kept`     双方都在、关系如旧 → 兑现；
 *   `void`     有一方已不在人世（死亡 / 飞升 / 被移出世界）→ 落空；
 *   `estranged` 双方都在、关系已散 → 落空；
 *   `noop`     本来就已结算过（重复推进 / 读档重放），文本为空。
 *
 * ⚠️ 候选态**只改 pact 自己**（盖章 + 写结果），不碰 world、不碰双方、
 *    不写命簿——「在命簿留经历」是接线动作（`world.record(text, 'relation',
 *    [a, b])`），留给 `save.js` / 触发点接线之后。
 */
export function settlePact(world, pact) {
  if (!pact) return { status: 'noop', text: '' };
  if (pact.settledDay != null) {
    return { status: 'noop', text: pact.outcome || '' };
  }
  if (!world) return { status: 'noop', text: '' };
  const day = Math.floor(world.day);
  const ea = (world.entities || []).find(e => e && e.id === pact.aId) || null;
  const eb = (world.entities || []).find(e => e && e.id === pact.bId) || null;
  let status;
  let text;
  if (!ea || !eb) {
    status = 'void';
    const gone = !ea ? 'a' : 'b';
    text = `${labelOf(pact, gone)}的${OLD_PACT_TYPES[pact.type] || '旧约'}终未践——`;
    text += gone === 'a' ? `${pact.aName || '一方'}已不在人世。` : `${pact.bName || '一方'}已不在人世。`;
  } else {
    const intact = relationIntact(ea, eb, pact.type);
    if (intact) {
      status = 'kept';
      text = `${labelOf(pact, 'a')}的${OLD_PACT_TYPES[pact.type] || '旧约'}如期而践——二人之谊如故。`;
    } else {
      status = 'estranged';
      text = `${labelOf(pact, 'a')}的${OLD_PACT_TYPES[pact.type] || '旧约'}就此作罢——情分已散，无人再提。`;
    }
  }
  pact.settledDay = day;
  pact.outcome = text;
  return { status, text };
}
