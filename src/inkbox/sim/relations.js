// 水墨沙盒 · 关系网
//
// 修仙世界的恩怨比国家之间的恩怨细密得多：师徒、道侣、宿敌、施恩、受恩……
// 这些关系会反过来影响修炼（道侣共鸣、师父传道）、影响突破（心魔幻作故人），
// 也决定宗门内部谁接掌、谁出走。
//
// 关系类型与数值来源：
//   relationshipSystem.js:1-14  12 种关系，score 范围 -100~100
//   masterDiscipleSystem.js:99  拜师条件（拒绝：师敌对 / 已有≥4徒 / 等级差<3 / 跨宗 / 污染≥70）
//   masterDiscipleSystem.js:239 衣钵（关系≥90 且 30 年 8%）
//   masterDiscipleSystem.js:280 出师（弟子≥师 0.7 且 25 年 10%）
//   daoCompanionSystem.js:3-8   道侣感应（突破共鸣 25% / 心悸 40% / 陨落 80%）

import { clamp } from '../core/noise.js';

export const RELATION_TYPES = Object.freeze({
  MENTOR: 'mentor',
  DISCIPLE: 'disciple',
  FORMER_MENTOR: 'former_mentor',
  FORMER_DISCIPLE: 'former_disciple',
  RIVAL: 'rival',
  GRATITUDE: 'gratitude',
  BENEFACTOR: 'benefactor',
  ENMITY: 'enmity',
  COMRADE: 'comrade',
  PEER: 'peer',
  LOVER: 'lover',
  KIN: 'kin',
});

export const RELATION_LABELS = Object.freeze({
  mentor: '师徒',
  disciple: '师徒',
  former_mentor: '旧师',
  former_disciple: '旧徒',
  rival: '宿敌',
  gratitude: '受恩',
  benefactor: '施恩',
  enmity: '仇怨',
  comrade: '同袍',
  peer: '同道',
  lover: '道侣',
  kin: '亲缘',
});

/** 拜师上限与条件 */
export const MAX_DISCIPLES = 4;
export const MIN_LEVEL_GAP = 3;
export const MAX_APPRENTICES_PER_SECT = 20;

export function ensureRelations(entity) {
  if (!entity.relations) entity.relations = new Map();
  return entity.relations;
}

/**
 * 建立/加强一段关系。互相登记（师徒会记成 mentor 与 disciple 两个方向）。
 */
export function addRelation(a, b, type, score) {
  if (!a || !b || a === b) return null;
  const mapA = ensureRelations(a);
  const mapB = ensureRelations(b);
  const entry = mapA.get(b.id) || { type, score: 0, since: a.age || 0 };
  entry.type = type;
  entry.score = clamp(entry.score + score, -100, 100);
  mapA.set(b.id, entry);

  const mirror = mirrorType(type);
  const entryB = mapB.get(a.id) || { type: mirror, score: 0, since: b.age || 0 };
  entryB.type = mirror;
  entryB.score = clamp(entryB.score + score, -100, 100);
  mapB.set(a.id, entryB);
  return entry;
}

function mirrorType(type) {
  switch (type) {
    case RELATION_TYPES.MENTOR: return RELATION_TYPES.DISCIPLE;
    case RELATION_TYPES.DISCIPLE: return RELATION_TYPES.MENTOR;
    case RELATION_TYPES.BENEFACTOR: return RELATION_TYPES.GRATITUDE;
    case RELATION_TYPES.GRATITUDE: return RELATION_TYPES.BENEFACTOR;
    case RELATION_TYPES.FORMER_MENTOR: return RELATION_TYPES.FORMER_DISCIPLE;
    case RELATION_TYPES.FORMER_DISCIPLE: return RELATION_TYPES.FORMER_MENTOR;
    default: return type;
  }
}

export function relationTo(a, b) {
  if (!a || !a.relations || !b) return null;
  return a.relations.get(b.id) || null;
}

export function relationScore(a, b) {
  const r = relationTo(a, b);
  return r ? r.score : 0;
}

export function hasRelationType(a, type) {
  if (!a || !a.relations) return false;
  for (const r of a.relations.values()) {
    if (r.type === type) return true;
  }
  return false;
}

export function countByType(a, type) {
  if (!a || !a.relations) return 0;
  let n = 0;
  for (const r of a.relations.values()) {
    if (r.type === type) n += 1;
  }
  return n;
}

/** 找出某个类型的对象（用于心魔取材、道侣共鸣） */
export function findPartner(world, entity, type) {
  if (!entity.relations) return null;
  for (const [id, rel] of entity.relations) {
    if (rel.type !== type) continue;
    const other = world.entities.find((e) => e.id === id);
    if (other && other.hp > 0) return other;
  }
  return null;
}

/** 心魔取材：优先取逝去的亲人 / 师父 / 道侣 / 宿敌 */
export function heartDemonSubject(world, entity) {
  if (!entity.relations) return null;
  const priority = [
    RELATION_TYPES.KIN, RELATION_TYPES.LOVER,
    RELATION_TYPES.MENTOR, RELATION_TYPES.RIVAL, RELATION_TYPES.ENMITY,
  ];
  for (const type of priority) {
    for (const [id, rel] of entity.relations) {
      if (rel.type !== type) continue;
      const other = world.entities.find((e) => e.id === id);
      if (!other || other.hp <= 0) return { type, id, dead: true };
    }
  }
  return null;
}

// ── 拜师 ─────────────────────────────────────────────────
/**
 * 判定一次拜师。条件照搬 masterDiscipleSystem.js:106。
 * @returns {boolean} 是否成功
 */
export function tryApprentice(world, master, pupil, rng) {
  if (!master || !pupil || master === pupil) return false;
  if ((master.level || 0) < 10) return false;
  if ((pupil.level || 0) <= 0) return false;
  // 已有师徒关系就不再拜
  if (relationTo(pupil, master) && relationTo(pupil, master).type === RELATION_TYPES.MENTOR) return false;
  // 等级差不够
  if ((master.level || 0) - (pupil.level || 0) < MIN_LEVEL_GAP) return false;
  // 师门满了
  if (countByType(master, RELATION_TYPES.DISCIPLE) >= MAX_DISCIPLES) return false;
  // 污染过重者不收
  if ((master.pollution || 0) >= 70 || (pupil.pollution || 0) >= 70) return false;
  // 敌对不收
  const rel = relationTo(master, pupil);
  if (rel && (rel.type === RELATION_TYPES.ENMITY || rel.type === RELATION_TYPES.RIVAL)) return false;

  addRelation(master, pupil, RELATION_TYPES.MENTOR, 50);
  world.record(`【${pupil.name}】拜入【${master.name}】门下。`, 'relation', [pupil, master]);
  return true;
}

/** 衣钵传承：师亡时把功法传给关系最好的弟子 */
export function inheritLegacy(world, master, rng) {
  if (!master.relations || !master.techniques.length) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const [id, rel] of master.relations) {
    if (rel.type !== RELATION_TYPES.DISCIPLE) continue;
    if (rel.score > bestScore) {
      bestScore = rel.score;
      best = world.entities.find((e) => e.id === id);
    }
  }
  if (!best || bestScore < 90) return null;
  const manual = master.techniques[0];
  if (!best.techniques.some((t) => t.name === manual.name)) {
    best.techniques.push(manual);
    world.record(`【${master.name}】临终将《${manual.name}》付与【${best.name}】。`, 'relation', [master, best]);
  }
  return best;
}

/** 出师：弟子境界追近师父后转成旧徒 */
export function graduate(world, master, pupil) {
  const rel = relationTo(master, pupil);
  if (!rel || rel.type !== RELATION_TYPES.DISCIPLE) return false;
  addRelation(master, pupil, RELATION_TYPES.FORMER_DISCIPLE, 0);
  if (master.relations) master.relations.get(pupil.id).type = RELATION_TYPES.FORMER_DISCIPLE;
  if (pupil.relations) pupil.relations.get(master.id).type = RELATION_TYPES.FORMER_MENTOR;
  world.record(`【${pupil.name}】功成出师，别【${master.name}】而去。`, 'relation', [pupil, master]);
  return true;
}

// ── 每步推进 ─────────────────────────────────────────────
export function stepRelations(world, life, dtDays, rng) {
  const yearFrac = dtDays / 360;

  // 拜师：每年约 3% 的落单修士被收编。来源 masterDiscipleSystem.js:377
  // 速率比原作高：沙盒里修士基数小、又散在一整张图上，
  // 照搬原作的稀疏节奏，八百年下来整张关系网只有二十几条。
  if (rng() < yearFrac * 3.0) {
    const masters = world.entities.filter((e) => (e.level || 0) >= 10 && countByType(e, RELATION_TYPES.DISCIPLE) < MAX_DISCIPLES);
    const pupils = world.entities.filter((e) => (e.level || 0) >= 1 && (e.age || 0) < 40 * 360 && !hasRelationType(e, RELATION_TYPES.MENTOR));
    if (masters.length && pupils.length) {
      const master = masters[Math.floor(rng() * masters.length)];
      // 优先收同门或附近的
      let best = null;
      let bestD = Infinity;
      for (const p of pupils) {
        if (p === master) continue;
        const sameSect = master.faction && p.faction === master.faction;
        const d = Math.hypot(p.x - master.x, p.y - master.y) - (sameSect ? 20 : 0);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best && bestD < 24) tryApprentice(world, master, best, rng);
    }
  }

  // 师徒情谊与出师
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (!e.relations || !e.relations.size) continue;
    for (const [id, rel] of e.relations) {
      if (rel.type === RELATION_TYPES.DISCIPLE) {
        rel.score = clamp(rel.score + dtDays * 0.0022, -100, 100);
        if (rel.score >= 95 && rng() < yearFrac * 0.08) {
          const pupil = world.entities.find((o) => o.id === id);
          if (pupil) inheritLegacy(world, e, rng);
        }
        if (rng() < yearFrac * 0.1) {
          const pupil = world.entities.find((o) => o.id === id);
          if (pupil && (pupil.level || 0) >= (e.level || 0) * 0.7) graduate(world, e, pupil);
        }
      } else if (rel.type === RELATION_TYPES.LOVER) {
        // 道侣共鸣：境界相近者修行加速。来源 daoCompanionSystem.js:3-8
        const partner = world.entities.find((o) => o.id === id);
        if (partner && partner.hp > 0 && Math.abs((partner.level || 0) - (e.level || 0)) <= 5) {
          e.exp += dtDays * 0.35;
        }
      }
    }
  }

  // 结成道侣：同门、境界相近、关系够好
  if (rng() < yearFrac * 1.2) {
    const singles = world.entities.filter((e) => (e.level || 0) >= 5 && !hasRelationType(e, RELATION_TYPES.LOVER) && e.hp > 0);
    if (singles.length >= 2) {
      const a = singles[Math.floor(rng() * singles.length)];
      for (let k = 0; k < 8; k += 1) {
        const b = singles[Math.floor(rng() * singles.length)];
        if (b === a) continue;
        if (a.faction && b.faction && a.faction !== b.faction) continue;
        if (Math.abs((a.level || 0) - (b.level || 0)) > 8) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) > 20) continue;
        addRelation(a, b, RELATION_TYPES.LOVER, 60);
        world.record(`【${a.name}】与【${b.name}】结为道侣。`, 'relation', [a, b]);
        break;
      }
    }
  }

  // 结怨：同门之间境界竞争、或敌对宗门相遇
  if (rng() < yearFrac * 2.0) {
    const pool = world.entities.filter((e) => (e.level || 0) >= 3 && e.hp > 0);
    if (pool.length >= 2) {
      const a = pool[Math.floor(rng() * pool.length)];
      const b = pool[Math.floor(rng() * pool.length)];
      if (a !== b && Math.hypot(a.x - b.x, a.y - b.y) < 12) {
        const rel = relationTo(a, b);
        if (!rel || (rel.type !== RELATION_TYPES.MENTOR && rel.type !== RELATION_TYPES.DISCIPLE && rel.type !== RELATION_TYPES.LOVER)) {
          addRelation(a, b, RELATION_TYPES.RIVAL, -30);
        }
      }
    }
  }
}

/** 某人死后，所有指向他的关系都要处理（师徒改旧师、道侣哀恸） */
export function onDeathRelations(world, entity, rng) {
  for (let i = 0; i < world.entities.length; i += 1) {
    const other = world.entities[i];
    if (!other.relations) continue;
    const rel = other.relations.get(entity.id);
    if (!rel) continue;
    if (rel.type === RELATION_TYPES.MENTOR || rel.type === RELATION_TYPES.DISCIPLE) {
      other.relations.delete(entity.id);
      other.mind = clamp((other.mind || 60) - 8, 0, 100);
    } else if (rel.type === RELATION_TYPES.LOVER) {
      other.relations.delete(entity.id);
      other.mind = clamp((other.mind || 60) - 20, 0, 100);
      other.heartDemon = clamp((other.heartDemon || 0) + 10, 0, 100);
      world.record(`【${other.name}】的道侣【${entity.name}】去了。此后他闭关不出。`, 'relation', other);
    } else if (rel.type === RELATION_TYPES.RIVAL || rel.type === RELATION_TYPES.ENMITY) {
      other.relations.delete(entity.id);
    }
  }
  void rng;
}
