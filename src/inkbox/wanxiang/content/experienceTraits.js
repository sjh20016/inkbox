// Reconstructed from 坐天观井_经历池V01_机制与落地规格.md §6.
// No external experience_content.json was supplied. Values are additive offsets.
const trait = (id, name, category, durationDays, effectText, effects = {}, condition = 'always', exit = '') => ({
  id, name, category, durationDays, effectText, exit, effects: condition === 'always' ? effects : {},
  conditionalEffects: condition === 'always' ? [] : [{ condition, effects }],
  source: '坐天观井_经历池V01_机制与落地规格.md#6', implementation: 'C', implemented: false,
});
export default [
  trait('sword_heart', '剑心初明', 'persistent', null, '剑道时战力+6%，突破率+1个百分点', {combat:.06, breakthrough:.01}, 'sword_path', '改道休眠'),
  trait('breakthrough_echo', '破境余韵', 'state', 360, '修炼速率+5%', {cultivation:.05}, 'always', '最晚首获后720日到期，不叠强度'),
  trait('meridian_damage', '经脉受损', 'state', 720, '气血上限-10%，修炼速率-8%', {hp:-.10,cultivation:-.08}, 'always', '两次有效付费治疗，间隔至少30日'),
  trait('risk_fear', '畏险未平', 'persistent', null, '冒险评分-0.20，退避血线+0.05', {action:-.20,retreat:.05}, 'adventure', '真实探府成功可转险中有定'),
  trait('risk_resolve', '险中有定', 'persistent', null, '冒险评分+0.15', {action:.15}, 'adventure', '替换畏险未平，不新增槽位'),
  trait('tempered_bones', '劫后筋骨', 'persistent', null, '气血上限+6%', {hp:.06}),
  trait('gratitude', '受恩未忘', 'bond', 3600, '合法帮助候选中对恩人评分+0.25', {action:.25}, 'benefactor_candidate', '对方死亡终止，跨界休眠'),
  trait('alchemy_guard', '丹修护关', 'state', 180, '下一次实际突破率+2个百分点', {breakthrough:.02}, 'breakthrough_attempt', '判定开始消费，失败也消耗'),
  trait('sword_review', '剑诀温习', 'state', 720, '剑道时战力+4%', {combat:.04}, 'sword_path'),
  trait('dusty_mind', '道心蒙尘', 'state', 360, '突破率-1.5个百分点', {breakthrough:-.015}),
  trait('pollution_restraint', '浊息自持', 'persistent', null, '基础自然污染增长速率-15%', {pollution:-.15}, 'always', '不抵消一次性污染'),
  trait('wounded_insight', '伤中悟势', 'persistent', null, '战力+4%，气血上限-5%', {combat:.04,hp:-.05}),
  trait('artifact_obsession', '识器成癖', 'persistent', null, '合法法宝目标评分+0.20', {action:.20}, 'legal_artifact_candidate'),
  trait('site_wound', '探府余伤', 'state', 180, '气血上限-6%', {hp:-.06}),
  trait('shared_insight', '同参余悟', 'bond', 720, '与真实援助者同位面8格内修炼速率+4%', {cultivation:.04}, 'helper_near_8', '离开范围休眠，对方死亡终止'),
  trait('demon_sword_resonance', '魔剑共鸣', 'special', null, '持有绑定原剑时战力+12%，污染每日额外+0.0015', {combat:.12,pollutionDaily:.0015}, 'bound_sword_owned', '失剑休眠，不转移至同名剑'),
  trait('seal_vow', '守阙之誓', 'special', null, '突破率+1个百分点；真实锚点6格内气血上限+8%；所得时扣寿720日', {breakthrough:.01}, 'always', '地域气血效果需独立条件；一次性寿元代价不在派生效果重复结算'),
  trait('sword_blight', '剑煞入脉', 'state', null, '气血上限-12%，每日污染额外+0.001', {hp:-.12,pollutionDaily:.001}, 'always', '三次间隔治疗且连续远离原剑90日'),
].map(entry => entry.id === 'seal_vow' ? {...entry, conditionalEffects:[{condition:'anchor_near_6',effects:{hp:.08}}], oneTimeCost:{lifespanDays:720}} : entry);
