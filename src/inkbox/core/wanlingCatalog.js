// Simulation identities, shared by both renderers and the codex. No RNG or DOM.
export const LEGACY_BEAST_FORMS = Object.freeze(['tiangou', 'dangkang', 'lushu', 'xuangui']);
export function stableWanlingHash(seed, id, salt = '') {
  const text = `${seed >>> 0}|${id >>> 0}|${salt}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const entry = (key, name, category, habitat, glyph, role, counter, extra = {}) =>
  Object.freeze({ key, name, category, habitat, glyph, role, counter, model: category === 'beast' || category === 'phenomenon' ? key : null, ...extra });
export const WANLING_CATALOG = Object.freeze([
  entry('dangkang','当康','beast','land','豕','近村丰收，原粮产至多增益15%','迁离村庄后失效'),
  entry('tiangou','天狗','beast','land','犬','守村驱逐狼群与灾兽','可受伤，守护有范围'),
  entry('lushu','鹿蜀','beast','land','鹿','祥瑞助村恢复，可与灵修结缘','离村后增益消失'),
  entry('xuangui','旋龟','beast','shore','龟','沿水岸栖居，为邻村缓解水灾','离岸或离村后失效'),
  entry('chiru','赤鱬','beast','water','鱼','水中灵材，供丹修有限采集','抽干水体会衰弱'),
  entry('jingwei','精卫','beast','shore','鸟','近岸衔石，按正式地形通道缓慢筑岸','仅小尺度浅滩，按日冷却'),
  entry('biyi','比翼鸟','phenomenon','land','双','真实道侣相聚时的只读双鸟现象','非独立生灵，不可投放', { derived: true }),
  entry('jiuweihu','九尾狐','beast','land','狐','近村亲和与低频化形，真实身份始终是狐','外观变化不参与凡人生育或轮回'),
  entry('zheng','狰','beast','highland','狰','地方捕食者，压制狼群','天狗或体修可驱逐，不能跨图追猎'),
  entry('dijiang','帝江','beast','qi','灵','趋近真实灵脉，给附近修士有限共鸣','须在灵脉附近，不永久改灵气'),
  entry('qiongqi','穷奇','beast','land','凶','偏向追猎当地善业者，恶业者可获庇护','天狗、开明与体修可反制'),
  entry('fei','蜚','beast','land','厄','留下有到期恢复的枯痕，压低附近收成','驱离后村庄恢复，枯痕按自然事件恢复'),
  entry('kaiming','开明兽','beast','land','守','守卫真实地点附近，压制局部威胁','仅地方守护，不开启跨界镇泄'),
  entry('deer','鹿群','herd','land','鹿','草食聚群、消耗植被，遇狼逃逸','数量聚合，不是普通敌对灵兽'),
  entry('wolf','狼群','herd','land','狼','追猎鹿群，缺粮才靠近村边','祥瑞守护、音修安抚和体修可驱赶'),
  entry('wood','木魅','spirit','forest','木','依林而生，帮助局部植被恢复','焚林或失林后迁移、衰弱、消散'),
  entry('water','水精','spirit','water','水','依稳定水域而生，有限助益邻村','抽水后衰弱、迁移或消散'),
  entry('stone','石灵','spirit','highland','石','依山体而生，缓解邻村灾损','削山使锚点失效，迁移或消散'),
]);
export const WANLING_BY_KEY = new Map(WANLING_CATALOG.map(e => [e.key,e]));
export function creatureFormOf(world, entity) {
  if (entity?.form && WANLING_BY_KEY.get(entity.form)?.model) return entity.form;
  return LEGACY_BEAST_FORMS[stableWanlingHash(world?.seed || 0, entity?.id || 0, 'species') % LEGACY_BEAST_FORMS.length];
}
