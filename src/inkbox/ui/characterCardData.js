// Character-G0: a single readonly view of the actual simulation fields.
// No parallel RPG stats, cached state, invented effects, or RNG.
import { expToNext, realmLabel, ceilingFor } from '../core/cultivation.js';
import { cultivationRate, combatPower } from '../sim/cultivation.js';
import { displayName, sectNameOf } from '../sim/biography.js';

const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
export function characterSnapshot(world, e) {
  if (!world || !e) return null;
  const level = Math.max(0, Math.floor(finite(e.level)));
  const awakened = level > 0 && Boolean(e.root);
  const capped = level >= ceilingFor(world.plane || 'mortal');
  const target = awakened ? expToNext(level) : 0;
  const exp = Math.max(0, finite(e.exp));
  const percent = target > 0 ? Math.min(100, exp / target * 100) : 0;
  const age = Math.max(0, finite(e.age)), lifespan = Math.max(0, finite(e.lifespan));
  const rate = awakened && !capped ? Math.max(0, finite(cultivationRate(world, e))) : 0;
  let state = '行走世间';
  if (e.possessionScar?.until > world.day) state = '遭异魂附身';
  else if (e.madUntil > world.day) state = '走火入魔';
  else if (e.restUntil > world.day) state = '养伤';
  else if (awakened && capped) state = '此界圆满';
  else if (awakened && percent >= 100) state = '修为已满，待冲关';
  else if (awakened) state = '修炼中';
  else if (e.sp === 'human') state = '尚未启灵';

  const traits = [];
  const add = (name, axis, type = '实效') => { if (name) traits.push({ name: String(name), axis, type }); };
  if (e.root) add(e.root.rootName || '灵根', '修行速度、突破品质');
  if (e.bloodline) add(e.bloodline, '战力 / 修行 / 寿元等实际血脉轴');
  if (e.dao?.path?.name) add(e.dao.path.name, '道途修炼与战力');
  if (e.forbidden) add('禁术：' + e.forbidden, '已有禁术及污染效果');
  if ((e.incarnation || 1) > 1) add('转世之身', '前世身份记录', '叙事');
  if (e.parentA || e.parentB) add('有家世', '现有世系记录', '叙事');
  if (e.possessedBy) add('夺舍遗痕', '真实夺舍记录', '经历');
  if (e.possessionScar) add('异魂附身', '附身状态', '经历');
  return {
    id: e.id, name: displayName(e), originalName: e.name || '', title: e.daoTitle || '',
    realm: awakened ? realmLabel(level) : '凡人', level, awakened, capped, exp, target, percent, rate,
    ageYears: Math.floor(age / 360), lifespanYears: Math.max(0, Math.floor(lifespan / 360)),
    remainingYears: Math.max(0, Math.ceil((lifespan - age) / 360)),
    hp: finite(e.hp), maxHp: finite(e.maxHp), combat: finite(combatPower(e)),
    fortune: finite(e.fortune), mind: finite(e.mind), heartDemon: finite(e.heartDemon),
    pollution: finite(e.pollution), karma: finite(e.karma),
    faction: sectNameOf(world, e), root: e.root?.rootName || '未觉醒',
    rootQuality: e.root && Number.isFinite(e.root.quality) ? ['劣','中','良','优','天'][e.root.quality] || '?' : '',
    dao: e.dao?.path?.name || '未入道', daoStage: e.dao?.stage,
    techniques: (e.techniques || []).map(t => t?.name).filter(Boolean),
    bloodline: e.bloodline || '无', forbidden: e.forbidden || '',
    artifacts: (e.artifacts || []).map(a => a?.name).filter(Boolean),
    incarnation: e.incarnation || 1, parentA: e.parentA || 0, parentB: e.parentB || 0,
    clan: e.clan || 0, kills: e.kills || 0, traits, state,
    logs: (e.log || []).slice(-24).reverse().map(r => ({ day: finite(r.day, 0), kind: r.kind || '', text: r.text || '' })),
  };
}
