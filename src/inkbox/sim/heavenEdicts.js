// Character-G0.5: small, deterministic, targeted edits to existing simulation axes.
// This module never uses the RNG. Intentional interventions DO alter world evolution.
import { expToNext } from '../core/cultivation.js';
import { findEntity } from './biography.js';

export const HEAVEN_EDICTS = Object.freeze([
  { id: 'cultivation', name: '灌顶', axis: 'exp', description: '赐予下一层所需修为的 25%；圆满之后由真实突破流程判定' },
  { id: 'fortune', name: '拨运', axis: 'fortune', description: '将气运提高 8，影响现有觉醒与突破判定' },
  { id: 'mind', name: '定心', axis: 'mind', description: '将道心提高 8，影响现有修炼速度' },
]);

export function applyHeavenEdict(world, { targetId, action } = {}) {
  if (!world || !Number.isSafeInteger(targetId) || !HEAVEN_EDICTS.some(e => e.id === action))
    return { ok: false, reason: '未知的目标或敕令' };
  const target = findEntity(world, targetId);
  if (!target || !(target.hp > 0)) return { ok: false, reason: '此人已不在凡间' };
  if (target.sp !== 'human' && target.sp !== 'cultivator')
    return { ok: false, reason: '此敕令仅针对凡人或修士' };
  let axis, after, before;
  if (action === 'cultivation') {
    if (!(target.level > 0) || !target.root) return { ok: false, reason: '尚未启灵，无法灌顶' };
    const need = expToNext(target.level);
    if (target.level >= 60) return { ok: false, reason: '此界已至修为上限' };
    axis = 'exp';
    before = Number.isFinite(target.exp) ? target.exp : 0;
    after = Math.min(need, before + Math.max(1, Math.round(need * .25)));
  } else {
    axis = action === 'fortune' ? 'fortune' : 'mind';
    before = Number.isFinite(target[axis]) ? target[axis] : 0;
    after = Math.min(100, before + 8);
  }
  if (!(after > before)) return { ok: false, reason: '此项已至当前上限，没有改变' };
  target[axis] = after;
  const name = HEAVEN_EDICTS.find(e => e.id === action).name;
  const label = { exp: '修为', fortune: '气运', mind: '道心' }[axis];
  // world.record() also appends this named event to entity.log and persists it.
  const note = '【天道敕令】' + target.name + '受' + name + '，' + label
    + '由 ' + Number(before.toFixed(2)) + ' 变为 ' + Number(after.toFixed(2)) + '。';
  world.record(note, 'intervention', target);
  return { ok: true, id: target.id, axis, before, after, name, note };
}
