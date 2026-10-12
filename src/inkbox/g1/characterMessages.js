// Public messages stay human readable; reason codes remain stable for hosts/tests.
export const CHARACTER_REASONS = Object.freeze({
  'invalid-target':'人物身份无效', 'world-changed':'世界已更换，请重新选择人物',
  'plane-world-changed':'此位面已更换，请重新选择人物', 'missing-plane':'此位面尚不存在',
  'identity-reused':'原人物身份已失效，请重新选择', 'invalid-edict':'未知天道敕令',
  'invalid-selection':'请先选择当前人物', 'not-living-mortal':'只有凡间在世人物可受敕令',
  'locked-area':'此人位于尚未开放的区域', 'not-cultivator':'此人尚未踏入修行',
  'realm-cap':'已达凡间修行上限', 'missing-value':'缺少可靠数值，无法施行敕令',
  'at-cap':'此项数值已达上限', 'missing-history':'当前世界无法记录正式历史',
  'destroyed':'命簿已关闭', 'stale-target':'选择已改变，请重新打开命簿',
  'invalid-or-inaccessible-target':'此人身份无效或位于尚未开放的区域',
  'not-accessible-mortal':'只能新记挂凡间可见的在世人物', 'full':'记挂已满十二人，请先取消一人',
  'duplicate':'此人已在记挂之中', 'cannot-focus':'当前无法定位此人',
  'unavailable-target':'当前没有可展示的人物记录', 'invalid-action':'未知命簿操作',
});
export function characterReason(reason) { return CHARACTER_REASONS[reason] || '当前无法执行此操作'; }
