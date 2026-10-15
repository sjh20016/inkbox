// 水墨沙盒 · 世界观、命名池与叙事文本
//
// 词池与文本全部取自原作，不是新编的：
//   src/data/names.js              姓名用字与道号
//   src/systems/sectSystem.js      宗门名池与宗旨
//   src/systems/manualSystem.js    12 本功法
//   src/systems/spiritBeastSystem.js 8 种灵兽
//   src/systems/secretRealmSystem.js 5 类秘境
//   src/systems/immortalCaveSystem.js 5 类洞府 + 8 处地名
//   src/systems/ancientFormationSystem.js 5 种阵法
//   src/systems/forbiddenTechniqueSystem.js 6 种禁术
//   src/systems/bloodlineSystem.js 16 种血脉
//   src/systems/equipmentSystem.js 装备槽位/品阶/品质
//   src/data/worlds.js             位面
//   src/data/narrativeTemplates.js 叙事模板句式
//   src/data/busanziDialogues.js   卜算子台词
//   src/content/guidance/          观井初课

import { ELEMENTS } from './cultivation.js';

// ── 姓名 ─────────────────────────────────────────────────
// 来源 src/data/names.js。原作姓名 = 姓 + NAME_A + NAME_B。
export const SURNAMES = Object.freeze('陆 沈 顾 林 叶 苏 云 萧 秦 楚 江 洛 宁 宋 裴 纪 温 谢 方 许 白 玄 韩 魏 周 唐 孟 司徒 慕容 上官'.split(' '));
export const NAME_A = Object.freeze('青 玄 白 赤 墨 素 重 长 碧 黄 飞 望 太 紫 凌 丹 沧 幽 扶 星 霜 雪 寒 明 夜 归 问 澜 洛 云 霁 远 观 知 怀 清 无 少 令 予 南 北 西 东 景 守 离 照 鹤 羽 逐 隐 眠 砚 惊 迟 斩'.split(' '));
export const NAME_B = Object.freeze('云 夜 泽 霄 渊 问 光 庚 落 泉 廉 舒 微 电 霜 宵 朱 溟 篁 摇 河 尘 秋 川 书 澜 烟 影 心 璇 歌 衡 岳 砚 竹 宁 玄 昭 白 池 眠 岚 止 行 归 生 寒 令 砂 月 斗 笙 雪 灯 玦 央 辰 锋'.split(' '));
export const DAO_TITLES = Object.freeze('青霄 玄夜 白泽 赤霄 墨渊 素问 重光 长庚 碧落 黄泉 飞廉 望舒 太微 紫电 青霜 凌霄 丹朱 沧溟 幽篁 扶摇 寒渊 归尘 问心 星河 霁月 惊鸿 无咎 离火 镇岳 观澜 逐影 守缺 断潮 明烛 孤竹 眠云 照夜 破妄 太虚 知微'.split(' '));

// ── 聚落与宗门 ───────────────────────────────────────────
export const VILLAGE_HEAD = Object.freeze(['青', '白', '墨', '云', '溪', '松', '石', '临', '望', '归', '平', '定', '长', '安', '渡', '桃', '柳', '梅']);
export const VILLAGE_TAIL = Object.freeze(['村', '镇', '坞', '寨', '关', '渡', '坳', '屯', '驿', '堡']);

/** 宗门名池：按五行分。来源 sectSystem.js:1-7 */
export const SECT_NAMES = Object.freeze({
  金: ['太白剑宗', '庚金门', '鸣锋山'],
  木: ['青华谷', '长春宗', '扶桑院'],
  水: ['沧澜阁', '玄水宫', '听潮宗'],
  火: ['焚天殿', '赤霄门', '离火宗'],
  土: ['厚土门', '镇岳宗', '坤元山'],
});

/** 宗门宗旨。来源 sectSystem.js:9 */
export const SECT_DOCTRINES = Object.freeze([
  { key: 'order', name: '守序护道', note: '以规矩立宗，最恨邪修' },
  { key: 'truth', name: '求真问法', note: '不问出身，只问道理' },
  { key: 'world', name: '入世济生', note: '护佑凡人，声望易涨' },
  { key: 'war', name: '争渡尚武', note: '以战养战，好斗' },
  { key: 'seclude', name: '清修避世', note: '闭门不出，不易卷入纷争' },
]);

/** 宗门之外的替代机构。来源 sectSystem.js:12-20 */
export const INSTITUTION_TYPES = Object.freeze([
  { id: 'loose_alliance', label: '散修联盟', minMembers: 2 },
  { id: 'dao_hall', label: '城邦道堂', minMembers: 2 },
  { id: 'cultivator_family', label: '修士世家', minMembers: 2 },
  // ⚠️ `ghost_sect` 有两个必须记住的坑（2026-09-21 核）：
  //  (a) 原作 `src/systems/sectSystem.js:18` 的这条多带一个门槛字段
  //      `requiresGhostCultivator: true`——**移植时把它丢了**。
  //  (b) 本表在沙盒里**零读者**（全仓 grep 只命中此定义与注释）。今天无害，
  //      但谁把 `INSTITUTION_TYPES` 接进机构生成，就会在一个**没有鬼修**的世界里
  //      造出「鬼修宗门」，**而且不报错**（主线正是这么消费的：`sectSystem.js:645`
  //      有 `else if (type.id === 'ghost_sect')` 分支）。
  //  处置：或补回 `requiresGhostCultivator: true`（与主线对齐），或实装鬼修时（8-D）再开闸。
  { id: 'ghost_sect', label: '鬼修宗门', minMembers: 2 },
  { id: 'migrant_sect', label: '外部迁入宗门', minMembers: 3 },
]);

// ── 物件 ─────────────────────────────────────────────────
/** 功法。来源 manualSystem.js:3-16 */
export const MANUALS = Object.freeze([
  { name: '太虚剑诀', kind: 'sword', note: '剑气如虹，一往无前' },
  { name: '九转还魂经', kind: 'life', note: '重伤可续，寿元绵长' },
  { name: '天机推演术', kind: 'divine', note: '推演因果，趋吉避凶' },
  { name: '万象丹经', kind: 'alchemy', note: '丹道总纲' },
  { name: '星辰锻体术', kind: 'body', note: '借星力淬体' },
  { name: '心魔化道经', kind: 'demon', note: '以心魔为薪，险中求进' },
  { name: '破界符法', kind: 'talisman', note: '一符破万法' },
  { name: '五行遁术', kind: 'escape', note: '借五行遁走，保命第一' },
  { name: '雷霆万钧诀', kind: 'thunder', note: '引雷入体，威力绝伦' },
  { name: '阴阳调和术', kind: 'dual', note: '双修之法，可结道侣' },
  { name: '阵法全书', kind: 'formation', note: '阵道百科' },
  { name: '天音密卷', kind: 'sound', note: '音可乱神，亦可安魂' },
]);

/** 灵兽。来源 spiritBeastSystem.js:3-52 */
export const SPIRIT_BEASTS = Object.freeze([
  { name: '青鸾', element: '木', weight: 0.9, note: '青羽如翠，鸣声清越' },
  { name: '白虎', element: '金', weight: 0.75, note: '主杀伐，认主者战意大增' },
  { name: '玄龟', element: '水', weight: 0.9, note: '寿数极长，主守御' },
  { name: '火凤', element: '火', weight: 0.6, note: '浴火而生，可涅槃' },
  { name: '九尾狐', element: '木', weight: 0.65, note: '善惑人心' },
  { name: '麒麟幼兽', element: '土', weight: 0.6, note: '祥瑞之兽，主气运' },
  { name: '应龙', element: '水', weight: 0.6, note: '有翼之龙，可兴云雨' },
  { name: '白泽', element: '土', weight: 0.6, note: '知万物之名，通晓妖异' },
]);

/** 秘境。来源 secretRealmSystem.js:4-40 */
export const SECRET_REALMS = Object.freeze([
  { key: 'sword', name: '剑冢', omen: '夜半剑鸣不绝', reward: '剑意传承', note: '万剑插地，剑气冲霄' },
  { key: 'alchemy', name: '丹阁', omen: '丹香弥谷三日不散', reward: '丹道真解', note: '药炉尚温，主人已去' },
  { key: 'formation', name: '阵眼', omen: '地面浮现残破纹路', reward: '阵道感悟', note: '阵法仍在运转' },
  { key: 'battle', name: '古战场', omen: '风中有金铁交鸣', reward: '战魂洗礼', note: '断戟残旗，无人收殓' },
  { key: 'ruin', name: '仙府废墟', omen: '云气不散如盖', reward: '仙道感悟', note: '曾有人于此飞升' },
]);

/** 洞府类型与地名。来源 immortalCaveSystem.js:3-45 */
export const CAVE_TYPES = Object.freeze([
  { name: '剑仙洞府', reward: '上古剑谱', element: '金' },
  { name: '丹仙洞府', reward: '仙品丹药', element: '火' },
  { name: '阵仙洞府', reward: '上古阵图', element: '土' },
  { name: '符仙洞府', reward: '本命真符', element: '木' },
  { name: '散仙洞府', reward: '诸天游记', element: '水' },
]);

export const CAVE_SITES = Object.freeze([
  '苍梧山', '云梦泽', '昆仑墟', '东海之滨', '北冥冰原', '南荒密林', '西极荒漠', '中州平原',
]);

/** 上古阵法。来源 ancientFormationSystem.js:3-34 */
export const FORMATIONS = Object.freeze([
  { name: '封魔阵', note: '镇着什么东西，别去动它' },
  { name: '聚灵阵', note: '方圆灵气汇聚，修行加速' },
  { name: '幻天阵', note: '入者所见皆是假象' },
  { name: '传送阵', note: '可瞬息千里' },
  { name: '杀阵', note: '踏入者十不存一' },
]);

/** 禁术。来源 forbiddenTechniqueSystem.js:4-11 */
export const FORBIDDEN_TECHNIQUES = Object.freeze([
  { name: '吞魂术', sign: '周身阴气缭绕', note: '夺人神魂以自壮' },
  { name: '血祭大法', sign: '方圆草木枯死', note: '以血为祭，速成而伤天和' },
  { name: '噬灵术', sign: '灵气如漩涡倒吸', note: '吞噬他人修为' },
  { name: '尸炼术', sign: '尸气冲天', note: '驱尸为兵' },
  { name: '诅咒术', sign: '被咒者印痕难消', note: '伤人于无形' },
  { name: '逆命术', sign: '天机紊乱', note: '逆天改命，必遭反噬' },
]);

/**
 * 血脉。来源 bloodlineSystem.js:3-20（16 条，名字与描述一字未改）。
 *
 * ⚠️ **`profile` 这一列是沙盒补的，原作没有。** 原因是实测发现：
 * 沙盒把 `entity.bloodline` 写进实体、存进存档、还在检视面板上显示，
 * 但**全世界没有任何一处公式读过它**——一条觉醒的血脉对战力的影响精确等于 0。
 * 这正是这个项目一直在猎的那种「字段存在 ≠ 字段生效」（上一次是 `equipTier`，
 * 装备加成整整缺席了一个版本）。
 *
 * 接轴的取舍沿用法宝那一轮定下的规矩：**只接沙盒里真的存在的机制**。
 * 原作的触发条件是各不相同的（道侣 / 元素 / 等级 / 污染 / 宗门……），
 * 沙盒把觉醒简化成「觉醒时掷一次」，所以触发条件那半没有迁；
 * 描述里承诺的四样——寿元、气运、战力、修行速度——沙盒全都有对应载体，于是接上。
 *
 * | 轴 | 接到哪 |
 * | --- | --- |
 * | `lifespan`    | `awaken()` / `attemptBreakthrough()` 重算寿元时乘上去 |
 * | `fortune`     | `awaken()` 时加到气运上 |
 * | `combat`      | `combatPower()` |
 * | `cultivation` | `cultivationRate()` |
 *
 * 四档「元素亲和」（朱雀 / 太阴 / 太阳 / 九天雷脉）**明确降级**成 `cultivation`：
 * 沙盒没有元素克制与抗性这两套机制，照着迁过来就是「定义了但没人读」的死字段。
 * 降级写在这里，是为了下一次有人看到「朱雀血脉 +修行速度」时不会以为是写错了。
 *
 * 数值刻意压得很小（最大 +12%）：血脉是**加成**，不该盖过境界——
 * 和法宝那条「加成是零头」是同一个标定原则。而 `chance` 一个都没动：
 * `awaken()` 是按这张表逐条抽签的，改 `chance` 等于改主随机流的走向。
 */
export const BLOODLINES = Object.freeze([
  { name: '凤凰血脉', desc: '涅槃重生之血，寿元微增', chance: 0.03, profile: { lifespan: 0.10 } },
  { name: '龙裔血脉', desc: '远古龙族后裔，肉身强韧', chance: 0.02, profile: { combat: 0.08, lifespan: 0.03 } },
  { name: '麒麟血脉', desc: '祥瑞之血，气运加身', chance: 0.03, profile: { fortune: 12 } },
  { name: '玄武血脉', desc: '防御无双，寿命悠长', chance: 0.02, profile: { lifespan: 0.14, combat: 0.03 } },
  { name: '白虎血脉', desc: '杀伐之气，战力提升', chance: 0.04, profile: { combat: 0.10 } },
  { name: '朱雀血脉', desc: '烈焰之血，火系亲和', chance: 0.03, profile: { cultivation: 0.06 } },
  { name: '天狐血脉', desc: '魅惑众生，智计过人', chance: 0.02, profile: { fortune: 6, cultivation: 0.03 } },
  { name: '混沌血脉', desc: '混沌之力，吞噬万法', chance: 0.03, profile: { cultivation: 0.09 } },
  { name: '星辰血脉', desc: '星辉入体，夜修增速', chance: 0.02, profile: { cultivation: 0.07 } },
  { name: '太阴血脉', desc: '月华之力，冰系亲和', chance: 0.02, profile: { cultivation: 0.04, combat: 0.03 } },
  { name: '太阳血脉', desc: '日炎之力，光系亲和', chance: 0.02, profile: { combat: 0.05, cultivation: 0.03 } },
  { name: '九天雷脉', desc: '雷霆之力，雷系亲和', chance: 0.02, profile: { combat: 0.07 } },
  { name: '万象血脉', desc: '包容万象，可容纳多种元素', chance: 0.03, profile: { cultivation: 0.05, lifespan: 0.04 } },
  { name: '轮回血脉', desc: '前世记忆碎片，修行加速', chance: 0.05, profile: { cultivation: 0.12 } },
  { name: '剑心血脉', desc: '天生剑修，剑意通明', chance: 0.02, profile: { combat: 0.12 } },
  { name: '药王血脉', desc: '丹药亲和，自愈能力', chance: 0.02, profile: { lifespan: 0.08 } },
]);

const BLOODLINE_BY_NAME = new Map(BLOODLINES.map((b) => [b.name, b]));
const NO_BLOODLINE = Object.freeze({});

/** 按名字取血脉（存档里只存名字，还原时靠它查表）。取不到就是没有。 */
export function bloodlineByName(name) {
  return BLOODLINE_BY_NAME.get(name) || null;
}

/** 某条血脉在某个轴上的加成。没有血脉 → 0 */
export function bloodlineProfile(name, axis) {
  const b = BLOODLINE_BY_NAME.get(name);
  if (!b) return 0;
  const p = b.profile || NO_BLOODLINE;
  return p[axis] || 0;
}

/**
 * 世家堂号。**沙盒自拟**，原作没有这一层（原作的 `INSTITUTION_TYPES` 里
 * 「修士世家」只是一类机构名，没有堂号池）。取的都是水墨画里常见的题额语汇，
 * 用来把两个同姓的世家区分开——「陆氏·听涛」与「陆氏·问津」是两家人。
 */
export const CLAN_HALLS = Object.freeze([
  '听涛', '抱朴', '鸣鹤', '守拙', '映雪', '问津', '藏锋', '拾翠',
  '安素', '归真', '漱玉', '望岳', '承露', '执中', '和光', '同尘',
]);

/** 装备。来源 equipmentSystem.js:6-21 */
export const EQUIP_SLOTS = Object.freeze(['武器', '衣甲', '鞋履', '饰', '法宝']);
export const EQUIP_TIERS = Object.freeze([
  { name: '凡品', bonus: 0.02 },
  { name: '灵品', bonus: 0.05 },
  { name: '宝品', bonus: 0.09 },
  { name: '仙品', bonus: 0.15 },
]);
export const EQUIP_QUALITIES = Object.freeze(['粗制', '普通', '精良', '珍品', '绝品']);

/**
 * 法宝铭名。来源 src/data/opportunityChains.js 的 `artifacts` 字段——
 * 原作把「机缘链的产物」写成具体物件名，一共 14 件，沙盒直接拿来做名字池。
 *
 * `slots` 是这件东西**说得通**的槽位。原作没有这张表（它的装备名是
 * `${品质}${品阶}${槽位}` 拼出来的，比如「精良灵品武器」），所以这一列是沙盒加的：
 * 一件法宝的名字得对得上它是什么东西，不能出现「星坠剑胎」被穿在脚上。
 * 槽位没有可用名字时，退回原作那种拼装名（见 sim/artifacts.js 的 `artifactName`）。
 */
export const ARTIFACT_NAMES = Object.freeze([
  { name: '星坠剑胎', slots: ['武器'] },
  { name: '古仙剑匣', slots: ['武器', '法宝'] },
  { name: '劫灰法衣', slots: ['衣甲'] },
  { name: '太虚镜残片', slots: ['饰', '法宝'] },
  { name: '悟道盏', slots: ['饰', '法宝'] },
  { name: '荒兽契骨', slots: ['饰', '衣甲'] },
  { name: '星河洞府钥', slots: ['饰'] },
  { name: '雷纹碑心', slots: ['法宝', '饰'] },
  { name: '九转丹炉铭牌', slots: ['法宝'] },
  { name: '地书残卷', slots: ['法宝'] },
  { name: '寿契木简', slots: ['法宝', '饰'] },
  { name: '蟠桃核', slots: ['饰', '法宝'] },
  { name: '虚门坐标', slots: ['法宝'] },
  { name: '茶祖枯枝', slots: ['饰', '鞋履'] },
]);

/**
 * 器灵。来源 artifactSpiritSystem.js:3-48，六型原样搬来。
 *
 * ⚠️ `keywords` **比原作长**。原作靠法宝名里的字去认器灵（剑/刀→剑灵，炉/鼎→炉灵……），
 * 而原作的法宝名是「精良灵品武器」这种拼装名，根本不含这些字——那张表在原作里
 * 也基本匹配不上。沙盒有了 ARTIFACT_NAMES 这批真名字，就在原表基础上补了几个字
 * （核/骨/盏/碑/简/卷/钥），好让「太虚镜残片」真的能出镜灵、「九转丹炉铭牌」真的能出炉灵。
 * 认不出来时按槽位兜底（见 sim/artifacts.js 的 `rollSpiritType`）。
 */
export const ARTIFACT_SPIRITS = Object.freeze([
  {
    id: 'sword_spirit', name: '剑灵',
    personalities: ['高傲', '冷峻', '好战', '忠诚', '洒脱'],
    keywords: ['剑', '刀'],
    trigger: '剑身震颤，发出清越的剑鸣，一道凛冽的剑意直冲云霄。',
    memory: '曾随前主人征战四方，斩妖除魔，剑下亡魂无数。',
  },
  {
    id: 'furnace_spirit', name: '炉灵',
    personalities: ['温柔', '沉默', '慈祥', '执拗', '博学'],
    keywords: ['炉', '鼎'],
    trigger: '炉火忽然自行燃起，跳动的火焰中浮现出一张模糊的面孔。',
    memory: '曾陪伴历代丹师，见证无数丹药出世，也目睹了无数丹师陨落。',
  },
  {
    id: 'mirror_spirit', name: '镜灵',
    personalities: ['沉默', '神秘', '睿智', '刻薄', '好奇'],
    keywords: ['镜'],
    trigger: '镜面泛起涟漪，倒映出的不再是持镜人的容貌，而是一双深邃的眼睛。',
    memory: '曾照见世间万象，记录过无数修士的因果与命运。',
  },
  {
    id: 'pearl_spirit', name: '珠灵',
    personalities: ['好奇', '温柔', '活泼', '害羞', '善良'],
    keywords: ['珠', '玉', '核', '骨', '盏'],
    trigger: '灵珠忽然发出柔和的光芒，光芒中浮现出一个朦胧的身影，似在好奇地打量着四周。',
    memory: '曾吸纳天地精华，在深海深渊中沉睡万年，见证了沧海桑田。',
  },
  {
    id: 'seal_spirit', name: '印灵',
    personalities: ['高傲', '威严', '沉默', '固执', '正直'],
    keywords: ['印', '符', '碑', '简', '卷', '钥'],
    trigger: '法印自行浮空，印面上浮现出金色符文，一股不可抗拒的威压弥漫开来。',
    memory: '曾镇压过上古大妖，封印过灭世魔头，身上刻满了历代主人的印记。',
  },
  {
    id: 'zither_spirit', name: '琴灵',
    personalities: ['温柔', '忧郁', '洒脱', '好奇', '深情'],
    keywords: ['琴', '笛'],
    trigger: '琴弦无风自动，奏出一段悠扬的旋律，音符在空气中凝结成一只只光蝶，翩翩起舞。',
    memory: '曾陪伴知音，弹奏过无数悲欢离合，每一根琴弦都浸透了情感。',
  },
]);

/** 特殊单位。来源 specialUnitTemplates.js */
/**
 * 幽冥独有法宝的**铭名池**（D6-3 工程包 C）。
 *
 * ── 为什么另开一池，而不是复用 `ARTIFACT_NAMES` ──────────────
 * `ARTIFACT_NAMES` 是**凡间 / 上界**的法宝名（星坠剑胎、太虚镜残片……），
 * 落进幽冥会读起来像「上面掉下来的东西」。C 包要的是**幽冥自己长出来的东西**：
 * 河官的判笔、阴司的秤、冥河沉沙。它们从幽冥缝漏进凡间时，凡人一眼就知道
 * 这不是凡物——这正是「幽冥物品泄漏」这条通道想给玩家的味道。
 *
 * ⚠️⚠️ **命名纪律（`剧情文案素材/00_文案使用说明` §5.6）**：
 *   本池每一个名字都**刻意避开**三张考古定名表，不得与之造同义词——
 *     · 幽冥三物：轮回莲 / 聚阴符 / 驱鬼符（本池不含「莲 / 符」义）；
 *     · 鬼修六级：游魂 / 怨灵 / 厉鬼 / 鬼将 / 鬼王 / 鬼帝（本池不含「鬼 / 魂」字）；
 *     · 魂分五路：自然转世 / 滞留 / 鬼修 / 怨魂化 / 魂火散尽（本池不涉这些义）。
 *   也不要引入「黄泉 / 忘川 / 九幽」这类**冥河的别名**——冥河就是冥河，
 *   多一个别名就是给同一个东西造第二份真相（§5.6 的「不新造中文词」）。
 *   池子里的意象一律取**已有文案里出现过的东西**：河官（G13-08 河官册子）、
 *   阴窟（G15-07）、磷火（G14-02）、冥河沉沙。
 *
 * `slots` 的语义与 `ARTIFACT_NAMES` 逐字相同（这件东西能长成哪些槽位），
 * 由 `sim/artifacts.js` 的选名函数按槽位过滤。**不是每个槽位都有幽冥名**——
 * 池子空时退回凡间拼装名（同 `ARTIFACT_NAMES` 的兜底）。
 */
export const NETHER_ARTIFACT_NAMES = Object.freeze([
  { name: '河官笔', slots: ['法宝', '武器'], note: '掌幽冥账目者所用，笔落即定' },
  { name: '阴司秤', slots: ['法宝'], note: '一头称善，一头称恶，从不偏斜' },
  { name: '引路幡', slots: ['法宝', '衣甲'], note: '引魂渡水，幡指处即路' },
  { name: '冥河沉沙', slots: ['饰', '法宝'], note: '河底沉了千年的沙，握久了手会凉' },
  { name: '幽墨砚', slots: ['法宝', '饰'], note: '研出的墨，写在纸上不褪' },
  { name: '阴山玄铁', slots: ['武器', '衣甲'], note: '阴山之铁，寒而不脆' },
  { name: '磷火灯', slots: ['饰', '法宝'], note: '灯里的火不烧手，只照旧事' },
  { name: '阴窟寒玉', slots: ['饰', '鞋履'], note: '生在阴窟深处，取玉者十去九不回' },
]);

/**
 * 幽冥独有**功法**的铭名池（D6-3 工程包 C）。
 *
 * 与 `NETHER_ARTIFACT_NAMES` 同一条命名纪律（避开幽冥三物 / 鬼修六级 / 魂五路）。
 * 用途：幽冥自生的法宝**携带**一门幽冥功法（`artifact.technique`），
 * 凡人捡到这件法宝即习得（进 `entity.techniques`）——于是「幽冥的功法」
 * 有了一个**真的会生效的载体**（法宝本身走 `equipBonus`，功法进人物的功法栏）。
 *
 * ⚠️ 与 `MANUALS`（凡间十二功法）/ `FORBIDDEN_TECHNIQUES`（六禁术）**逐名不同**：
 * 那两张表是凡间 / 上界的既有词池，本池是幽冥自己的。
 */
export const NETHER_TECHNIQUES = Object.freeze([
  { name: '玄阴诀', note: '引阴气入体，寒而不僵' },
  { name: '阴煞功', note: '以地煞淬骨，久练者不惧寒暑' },
  { name: '幽明录', note: '阴阳两界之事，皆可入录' },
  { name: '引煞术', note: '引四方地煞之力为己用' },
  { name: '冥河炼体诀', note: '借冥河寒水炼形，越炼越冷' },
  { name: '阴窟藏形术', note: '藏形于阴窟，避人耳目' },
]);

export const SPECIAL_UNITS = Object.freeze([
  { name: '搬山犀', note: '行过之处地势微改', maxAge: 720 },
  { name: '吞雷鹏', note: '追着雷雨走', maxAge: 600 },
  { name: '驮城玄龟', note: '背上驮着一座小城', maxAge: 2400 },
  { name: '遗迹巡守傀儡', note: '守着不该被打开的门', maxAge: 99999 },
  { name: '寄魂蜉蝣', note: '朝生暮死，却记得前世', maxAge: 2 },
]);

// ── 位面 ─────────────────────────────────────────────────
// 来源 src/data/worlds.js。沙盒是单图，位面作为「飞升去处」与叙事背景存在。
export const PLANES = Object.freeze([
  { key: 'mortal', name: '凡界·东荒', qi: 1.0, ascendLv: 10, note: '灵气稀薄，却是万物的来处' },
  { key: 'blessed', name: '修行福地', qi: 1.5, ascendLv: 20, note: '灵气渐浓，修士在此小住' },
  { key: 'upper', name: '上界·紫霄', qi: 2.0, ascendLv: 999, note: '去了便不再回来' },
  { key: 'nether', name: '幽冥界', qi: 0, ascendLv: 999, note: '怨魂积压之处' },
  { key: 'chaos', name: '混沌裂隙', qi: 0, ascendLv: 40, note: '蚩的影子在这里' },
]);

// ── 叙事模板 ─────────────────────────────────────────────
// 句式取自 src/data/narrativeTemplates.js，改为沙盒的占位符。
export const NARRATIVE = Object.freeze({
  breakthrough: [
    '【{name}】突破至{realm}，周身灵气如潮汐翻涌，方圆百里的修士皆感应到这一变。',
    '【{name}】于{place}闭关，{realm}成。出关时山风自开一径。',
  ],
  breakthroughFail: [
    '【{name}】渡劫失败，{outcome}。天光收回云里，像什么都没发生过。',
  ],
  tribulation: [
    '【{name}】欲破{realm}，天现「{omen}」——{omenNote}。',
  ],
  death: [
    '【{name}】陨落于{place}，死于【{killer}】之手。那一击的余波，在方圆百里内留下了一道焦痕。',
    '【{name}】在{place}被人所杀，杀他的是【{killer}】。血渗进土里，来年那里草长得格外好。',
    '【{name}】与【{killer}】决战于{place}，三日方休。第四日有人上山，只见两柄剑插在石里，剑柄各搭着一只手，人都凉透了。',
    '【{name}】死于{place}，凶手在逃。他怀里还攥着半块没送出的桂花糕。仇家翻他尸身时，把糕碰掉了，踩了一脚。',
    '【{name}】陨于{place}。死前以剑拄地，立而不倒。追兵围了一夜，天亮才敢上前，敬的是那口没咽下去的气。',
  ],
  deathNatural: [
    '【{name}】在{place}寿终正寝。他走得很安静，像一片叶子落进水里。',
    '【{name}】坐化于{place}，身旁只有一盏将尽的灯。',
    '【{name}】自知大限已至，于{place}闭目端坐。风过处，衣袂动了一下。',
    '【{name}】无疾而终，年{age}。子孙清点遗物，发现他把自己的墓志早在十年前就写好了，压在砚台底下，一个字都没舍得让人改。',
    '【{name}】坐化那日，{place}梅花反季而开。门人说那是祥瑞，扫花的老道说：是他老人家爱干净，让花替他送客。',
    '【{name}】临终唤来弟子，不传道、不留诀，只交代了三件俗事：欠张屠夫的肉钱、檐下的燕子窝、后山没嫁出去的小女儿。',
    '【{name}】于{place}含笑而逝。笑什么无人知晓，替他合眼的弟子说，那笑像是终于想起了一件丢了很多年的东西放在哪。',
  ],
  // 死于灾劫 / 妖兽 / 意外（§3.3）。与 `deathNatural`（真·寿终）分开：
  // 饿死 / 烧死 / 天劫 / 因果 / 秘境 / 战殁（无凶手快照）都落这一池。
  // ⚠️ 不收录 C04-13（「为护{sect}满门…」）：`{sect}` 填不了——实体的
  //    `faction` 存的是 `sect.id`（数字），不是名字，`fillTemplate` 会原样留下
  //    `{sect}`。宁可少一条，不许印出字面占位符。
  deathOther: [
    '【{name}】没于{place}山洪，尸身三日后在下游寻获，手里还攥着半张湿透的符箓。',
    '【{name}】入山采药，遇妖兽，不复出。村里人点着火把找了七夜，只找回一只鞋。',
    '【{name}】闭关时洞府崩塌，与半室丹药一同埋于{place}。百年后有人掘开洞口，丹药还能用，人已成了丹炉旁的一块石。',
    '【{name}】渡水时舟覆而亡。他在陆上修了五十年的仙，最后栽在一条三丈宽的河上。',
  ],
  relation: [
    '【{a}】与【{b}】结下{relation}之缘。命运之线自此相交。',
  ],
  sectFound: [
    '{place}新立宗门【{name}】，{founder}奉「{doctrine}」为门中宗旨。',
  ],
  ascension: [
    '【{name}】于{place}飞升，此后再无人见过他。留下的洞府，成了后来者的机缘。',
  ],
  pollution: [
    '【{name}】污染恶化，蚩的影子在其身后浮现。',
  ],
  heartDemon: [
    '【{name}】闭关时心魔显现，幻作{form}。{formNote}',
  ],
  daoTrail: [
    '【{name}】遇道心试炼，被问「{question}」。{result}',
  ],
  secretRealm: [
    '{place}现异象：{omen}。【{name}】等数人结伴而入。',
  ],
  caveOpen: [
    '{place}一座{cave}出世，{reward}尚在其中。',
  ],
  formation: [
    '{place}地面浮出古阵纹路，似是{formation}。{note}',
  ],
  forbidden: [
    '【{name}】修习{technique}，{sign}。此事传开，正道侧目。',
  ],
  spiritBeast: [
    '【{name}】于{place}遇{beast}，{beast}俯首认主。',
  ],
  war: [
    '【{a}】与【{b}】交兵于{place}。',
  ],
  crisis: [
    '{place}遭{disaster}。{note}',
  ],
  // ── 法宝 ────────────────────────────────────────────────
  // 句式来源：narrativeTemplates.js 的 identity_artifact_grant / life_artifact_refine，
  // 以及 narrativeAdditionsV371.js 里同一批键的市井版。挑的都是**能带出「物比人久」**
  // 那几句——沙盒里法宝是唯一能横跨几百年的东西，叙事得担起这一点。
  artifactForged: [
    '【{name}】于{place}炼成{artifact}。炉火熄时，他对着它看了很久。',
    '{name}炼制法器。炸炉三次后，他对着焦黑的炉灰沉默许久，然后洗了把脸，重新生火——第四次成了{artifact}。',
    '【{name}】在洞府中花了整整一个月，铸成{artifact}。',
  ],
  artifactFound: [
    '一件尘封的法宝{artifact}在{place}重现天日，落入了【{name}】手中。',
    '{name}在{place}得宝{artifact}。他把它供在桌上三天，才舍得带出门——怕磕着。',
    '【{name}】在{place}拾得{artifact}。{record}',
  ],
  artifactInherit: [
    '【{name}】身死，{artifact}落于【{heir}】之手。{record}',
    '【{heir}】收起【{name}】的{artifact}。{record}',
  ],
  artifactLost: [
    '【{name}】陨落，{artifact}坠于{place}，无人拾取。{record}',
  ],
  artifactBreak: [
    '{artifact}碎于【{name}】之手。{record}',
    '【{name}】的{artifact}寸寸迸裂，散作一地星尘。{record}',
  ],
  artifactSpirit: [
    '【{name}】怀中的{artifact}忽然发出异动——{trigger}这是相伴{held}年后，器灵初生的征兆。',
    '【{name}】正在静坐，{artifact}忽然发出一阵异动——{trigger}一股陌生而古老的意识，正在从沉睡中苏醒。',
  ],
  artifactDecay: [
    '{artifact}躺在{place}久了，无人来取，渐渐锈蚀成泥。',
  ],
});

// ── 卜算子 ───────────────────────────────────────────────
// 天道引路人。来源 src/data/busanziDialogues.js 与 src/content/busanzi/。
// 口吻：半文半白 + 市井痞气，自称「小爷我」。
export const BUSANZI = Object.freeze({
  name: '卜算子',
  mark: '☲',
  selfIntro: '你可以当我是你给自己留的「说明书」。你睡太久，忘了很多事。小爷我负责在你犯蠢的时候，往你脑门上拍一巴掌。',
  affinityTiers: ['井外生客', '离卦旧识', '共观山河', '命线相牵', '与天同契'],
  lines: Object.freeze({
    boot: [
      '井中有一线，方才还不在。',
      '我的天，你终于醒了！小爷我在这堆破烂世道里蹲了快一千年……',
      '别慌！对面那片山山水水，还有跑来跑去的小蚂蚁，都是你的世界。',
    ],
    watch: [
      '你看见她了。可看见，不等于知道。',
      '别急着拨它。先看它往哪里去。',
      // ⚠️ 2026-09-23 删除一条，勿复原。原文是
      //    「你没拨。甚好！天道偶尔把手收回袖里，才能知道众生自己的力气有多大。」
      //    它归素材册 01 §3.1「只观不拨（observe）」，语义是「你**没**拨」；
      //    但 `watch` 池的玩家侧唯一触发器是 `sim/busanzi.js:212 reactToTool()`，
      //    而 `main.js:1259-1260` 只在 `isFirst` 时调它——也就是玩家**真的落笔之后**。
      //    ⇒ 玩家刚拨完，卜算子却说「你没拨」，内容与刚发生的事相反。
      //    代码里不存在 `observe` 触发器，这句在这里永远是反的。
      //    删掉只把池长 5→4（`speak()` 按池长取模选句），**不改任何 `rng()` 抽签次数**，
      //    所以世界线不受影响。素材册 01 已同步回改（依据 00 册《九、版本与维护》）。
      '这地方有名字了。山河一旦有名，便是在替众生记账。',
      '名字是世界保存因果的方式。',
    ],
    praise: [
      '我的天，你做到了。小爷我……早说你能行。',
    ],
    reproach: [
      '天道不是不会看走眼。天道只是看错以后，得记住为什么错。',
    ],
    ascension: [
      '又走一个。井口就那么大，谁都想去看看外面。',
    ],
    tribulation: [
      '看好了，这一劫不是小爷我给的，是他自己攒的。',
    ],
    doom: [
      '离为火，为明，也为分离。世道越黑，越该留一盏灯。至于灯是谁点的——天机不可泄露。',
    ],
  }),
});

/**
 * 观井初课：原作的新手引导，改造成沙盒的首启提示。来源 content/guidance/firstObservation.js
 *
 * ⚠️ **2026-09-23 复核：本常量在 `src/` 里零读者**（定义即全部）。
 *    它是一段**首启引导文案**，而沙盒目前**没有任何首启/新手引导界面**
 *    （入口页 `inkbox.html` 只有 神格/世界/势力/大事记/仙道/三界/值得关注/
 *      编年/史册/图例/操作 这些**常驻**区，没有「第一次打开时弹一次」的容器）。
 *
 * **为什么不接上**：接它 = 新做一个首启覆盖层（要状态位、要「看过就不再弹」的
 *    存档字段、要一条跳过路径）。那是**新 UI 组件 + 新存档字段**，
 *    按 9.23 清单 §二（不新增大型底层系统、不自行扩任务）**不在本批范围**。
 *    但它确实是「玩家理解不了这个沙盒在干什么」的第一道缺口，
 *    已记进 BACKLOG（与 §六.3「人物故事可读性」同属可理解性一项）。
 *
 * **为什么不删**：这 5 条是**考古定名过的原作文案**（`firstObservation.js`），
 *    与 PLAYER_GUIDE.md 的「新手三步」同源。删掉就等于把这条线的来源丢了。
 */
export const FIRST_LESSON = Object.freeze([
  { title: '井中有一处变化', text: '地图上有一道很淡的趋向，先看看它落在谁身上。' },
  { title: '先把目光留住', text: '别急着拨它。设为注视，看看这条线往哪里去。' },
  { title: '见证第一处转折', text: '她正向灵气更浓的地方移动。世界会继续运行，你只需要看。' },
  { title: '这一次，你想怎样看？', text: '只观不会改变结果；轻拨只改变倾向；改写以后才会开放。' },
  { title: '变化已经留下回响', text: '人物记住了这件事，地图也留下了痕迹。它会成为以后变化的原因。' },
]);

/** 世界危机。来源 worldCrisisSystem.js:31-52 */
export const CRISES = Object.freeze([
  { key: 'drought', name: '赤地旱岁', note: '河床见底，井里也干了' },
  { key: 'famine', name: '饥岁围城', note: '粮尽，人相食' },
  { key: 'beast', name: '妖潮压城', note: '兽群自山中涌出' },
  { key: 'leyline', name: '地脉覆城', note: '地底龙脉翻覆，城墙裂开' },
]);

// ── 取名 ─────────────────────────────────────────────────
export function pickFrom(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

/**
 * 拆开取名，返回姓与名两半。
 *
 * ⚠️ **抽签次数必须与 `generateName` 逐位相同（三次，顺序也相同）。**
 * 这不是洁癖：`Life.spawn` 每生一个人就调一次，而主随机流是全世界共用的——
 * 在这里多抽或少抽一次，几百年后的世界就会整个漂到别处去。
 * 拆开的用途只有一个：世家子弟要**继承姓氏**，而继承的写法是
 * 「照原样抽完三次，然后把抽出来的姓丢掉、换成父姓」（见 sim/family.js）。
 */
export function generateNameParts(rng) {
  const surname = pickFrom(rng, SURNAMES);
  const given = pickFrom(rng, NAME_A) + pickFrom(rng, NAME_B);
  return { surname, given, full: surname + given };
}

export function generateName(rng) {
  return generateNameParts(rng).full;
}

export function generateDaoTitle(rng) {
  return pickFrom(rng, DAO_TITLES);
}

export function generateVillageName(rng) {
  return pickFrom(rng, VILLAGE_HEAD) + pickFrom(rng, VILLAGE_TAIL);
}

/** 宗门名：按五行取池，撞名时加「·二」「·三」。 */
export function generateSectName(rng, element, taken = new Set()) {
  const pool = SECT_NAMES[element] || SECT_NAMES[ELEMENTS[0]];
  const base = pickFrom(rng, pool);
  if (!taken.has(base)) return base;
  const ordinal = ['', '·二', '·三', '·四', '·五'];
  for (let i = 1; i < ordinal.length; i += 1) {
    if (!taken.has(base + ordinal[i])) return base + ordinal[i];
  }
  return `${base}·${taken.size}`;
}

/** 极简模板渲染：把 {key} 换成 params[key]。 */
export function fillTemplate(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (
    params[key] !== undefined && params[key] !== null ? String(params[key]) : match
  ));
}

export function narrate(rng, key, params) {
  const pool = NARRATIVE[key];
  if (!pool || !pool.length) return '';
  return fillTemplate(pickFrom(rng, pool), params);
}

export function busanziLine(rng, key) {
  const pool = BUSANZI.lines[key];
  if (!pool || !pool.length) return '';
  return pickFrom(rng, pool);
}
