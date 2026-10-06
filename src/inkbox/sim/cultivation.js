// 水墨沙盒 · 修士的一生
//
// 一个生灵从凡人开始：在某块灵气够厚的地上觉醒灵根，踏入修行；
// 之后靠打坐积累修为、在瓶颈处渡劫、被心魔纠缠、被因果反噬，
// 最后要么寿终正寝，要么飞升离世，要么走火入魔死在半路。
//
// 这个模块只负责「一个人身上发生什么」，宗门与地图事件在 sects.js / sites.js。

import {
  REALMS, realmFor, realmLabel, lifespanFor, expToNext, isBottleneck, ceilingFor,
  breakthroughChance, rollSpiritRoot, rollOmen, resolveHeartDemon, resolveDaoTrial,
  heartDemonChance, HEART_DEMON_THRESHOLD, HEART_DEMON_COOLDOWN_DAYS, HEART_DEMON_ON_FAILURE,
  HEART_DEMON_FORMS, DAO_PATHS, DAO_AWAKEN_INTERVAL_DAYS, DAO_TRIAL_MIN_LEVEL,
  DAO_TRIAL_MAX_PER_LIFE, DAO_TRIAL_COOLDOWN_DAYS, DAO_TRIAL_TRIGGERS,
  DAO_TRIALS, KARMA_EVENT_THRESHOLD, POLLUTION_ASCEND_LIMIT,
  BREAKTHROUGH_LIFE_DAYS, KARMA_MIN, KARMA_MAX, realmIndexFor,
  THUNDER_ASCEND_MIN_LEVEL,
} from '../core/cultivation.js';
import { NEVER_DECAY_DAY } from '../core/config.js';
import { BLOODLINES, narrate, pickFrom, DAO_TITLES, bloodlineProfile } from '../core/lore.js';
import {
  equipBonus as equipBonusOf, forgeArtifact, dropArtifacts, wearArtifacts, leaveArtifacts,
  TRIBULATION_WEAR,
} from './artifacts.js';
import { applyHeritage } from './family.js';
import { speak } from './busanzi.js';
// 表现事件发射口（D7-D）：只入 transient 队列，不写世界、不抽 RNG。
// 这里发的是「天雷落下」「某人飞升」——让模拟里的戏剧性第一次真的发生在画面上。
import { emitPresentation } from './presentation.js';
// 逝者名录（见 sim/necrology.js）。⚠️ 这里与 necrology.js 之间有一条 import 环：
// 本文件的 `ascend()` 要在 `leaveArtifacts` **之前**把飞升者入册（否则随葬法宝永远是空的），
// 而 necrology.js 要用本文件的 `placeName`。ESM 的环在这里安全——两边都只在
// 函数体内使用对方的导出，没有模块顶层的求值依赖。
import { rememberDead } from './necrology.js';
import { clamp } from '../core/noise.js';
import { arriveUpper } from '../world/planes.js';
// B0.1 观测计数器（只自增，不抽签、不改状态、不进存档）。见 sim/telemetry.js。
import { bumpTelemetry } from './telemetry.js';

/** 修行基础速率：每天积累多少修为（再乘灵气与灵根） */
export const BASE_EXP_PER_DAY = 1.2;

/**
 * 凡人觉醒灵根的基准概率（每天），实际还要乘当地灵气。
 *
 * 标定依据：凡人寿元约 4200 天，所以「一生中觉醒的概率」≈ 1-(1-p·k)^4200，
 * 其中 k ≈ 1.6（灵气与气运的乘积）。取 1.5e-5 时约有 8% 的人一生中觉醒——
 * 一个村子三四十人，出两三个修士，正是「一村出一两个」该有的样子。
 *
 * 别把这个值调大：修士寿元是凡人的十倍（炼气期就有 110 年），
 * 觉醒率一高，凡人在人口里就会被迅速稀释掉，世界只剩下飞来飞去的修士。
 * 早先取 8e-5 时，活人里七成六都是修士。
 */
export const AWAKEN_BASE = 0.00004;

/** 心魔自然消散速率（每天）。久不触发的心魔会自己淡去 */
export const HEART_DEMON_DECAY_PER_DAY = 0.012;

/** 突破失败后保留的修为比例 */
export const FAIL_EXP_KEEP = 0.55;

/** 走火入魔持续的游戏天数 */
export const MAD_DAYS = 90;

/** 地图上地点数量的上限，防止机缘被无限堆叠 */
export const MAX_SITES = 260;

/**
 * 飞升门槛 = 合体大圆满。
 *
 * ⚠️ 刻意偏离原作：原作是多位面阶梯，凡界 ascendLv=10（筑基就能去福地），
 * 因为上面还有「修行福地」「上界·紫霄」接着。沙盒只有一张图，照搬会让
 * 所有人刚筑基就消失，金丹以上永远看不到。所以改成「修到头了才走」，
 * 让飞升重新变成一件一个时代才出一两位的事。
 *
 * ⚠️ 这个数**刻意写成字面量、不从境界上限常量派生**（今天两者恰好都是 60，
 * 所以行为不变）。一旦写成从它派生，飞升线就和「凡间修炼上限」绑成了一根绳：
 * 下一轮做「三界并存」要把上界境界接在凡间之上、抬高那个上限时，飞升线会
 * 跟着一起变大，而凡间的人恰好只能修到那个上限——于是**凡间再也没有任何人
 * 能达到飞升线**，上界永远等不到人。不报错、不崩溃、断言全绿。
 * 凡间的天花板与「什么时候离开凡间」是两件事，必须分开写。
 * （这条注释也刻意不写那个常量的名字：本文件有一条静态断言要求它 0 命中。）
 */
export const ASCEND_LEVEL = 60;

// ── 天雷飞升（阶段四 · 跨界门槛）────────────────────────────
/**
 * 化神期修士每次「修为圆满」时引动天雷的概率。
 *
 * 天雷飞升是一条**概率性、有风险**的通道：过了进上界，没过按寻常渡劫的
 * 失败后果处置（外加小概率当场殒命，见 `THUNDER_DEATH_CHANCE`）。
 * 它存在的意义是给 40~59 级的修士一条**主动跨界**的路——
 * 60 级（合体大圆满）仍走 `ASCEND_LEVEL` 的必然飞升，那条不用冒险。
 *
 * ⚠️ **待标定**（保守占位值）。它是「每次修为圆满」的触发率，不是「一生一次」：
 * 修士从 40 级爬到 60 级要经历几十次修为圆满（每次突破失败还会重新攒修为），
 * 所以一生中至少遇到一次天雷的概率远高于这个数（实测见 `scripts/_thunderprobe.mjs`
 * 与长测报告）。取值要让它成为「少数人的机遇」而不是「人人必经」。
 */
export const THUNDER_ASCEND_CHANCE = 0.01;

/**
 * 天雷比寻常渡劫更凶：成功率上的**额外惩罚**（在 `breakthroughChance` 之上再扣）。
 *
 * ⚠️ 为什么复用 `breakthroughChance` 而不是另写一套公式：天雷就是一次
 * 「更凶险的渡劫」，法宝的 `tribulation` 轴、心魔、污染、因果、气运这些项
 * 本来就该一起生效。另写一套会让两个系统的成败判据**分叉**——
 * 分叉不报错，只是同一个修士在两条路上得到两个不同的成功率，静默地漂。
 * 所以这里只加一个「更严」的修正项，公式本体一字不动。
 * ⚠️ **待标定**。
 */
export const THUNDER_CHANCE_PENALTY = 0.1;

/**
 * 天雷失败后**当场殒命**的概率（否则走寻常渡劫的失败分支）。
 *
 * 主代理的决定：天雷不致命就没味道，但全致死会破坏凡间人口基线。
 * ⚠️ **待标定**（占位 0.3）。致死走的是既有的死亡处理（`hp = 0` →
 * `life.js` 的清理循环 → `onDeath`），**不在这里自己 splice**——
 * 自己动手会漏掉逝者名录 / 死讯 / 夺舍 / 神魂入幽冥 / 遗物那一整条链。
 */
export const THUNDER_DEATH_CHANCE = 0.3;

/** 天雷失败的额外心魔惩罚（在寻常渡劫失败的 +15 之上再加）。**待标定** */
export const THUNDER_HEART_DEMON_PENALTY = 10;

/** 修士的基础数值随境界成长 */
export function combatPower(entity) {
  const level = entity.level || 0;
  if (level <= 0) return 1;
  const realm = realmFor(level);
  const daoBonus = entity.dao ? 1 + (entity.dao.stage + 1) * 0.18 : 1;
  // 法宝加成。这里原来写的是 `1 + (entity.equipTier || 0) * 0.06`——
  // 而 `equipTier` **从来没有人写过**（initEntity 给 0，全世界没有任何一处自增），
  // 所以那一项恒等于 1，装备加成整整缺席了。现在换成真·法宝（sim/artifacts.js）。
  const equipBonus = 1 + equipBonusOf(entity).combat;
  // 血脉的「战力」轴（剑心 / 白虎 / 龙裔 / 九天雷脉……）。
  // 这一列以前**没有任何读者**，见 core/lore.js 里 BLOODLINES 的注释。
  const bloodBonus = 1 + bloodlineProfile(entity.bloodline, 'combat');
  return (1 + level * level * 0.045) * daoBonus * equipBonus * bloodBonus
    * (1 + realmIndexFor(level) * 0.35);
}

export function maxHpFor(entity) {
  const level = entity.level || 0;
  const base = entity.sp === 'cultivator' ? 220 : 100;
  return Math.round(base * (1 + level * 0.55));
}

/**
 * 某境界的基础寿元 × 血脉的「寿元」轴。
 *
 * ⚠️ **每次重算寿元都必须走这里。** `attemptBreakthrough` 里原本有三处
 * 直接写 `lifespanFor(level) * 360`（成功、倒退一层、跌落本阶）——
 * 只要漏掉任何一处，那个人突破一次就把血脉给的寿元加成抹掉了，
 * 而且不会有任何报错。`awaken()` 里那一处同理。
 */
export function lifespanForEntity(entity, level) {
  return Math.round(lifespanFor(level) * 360 * (1 + bloodlineProfile(entity.bloodline, 'lifespan')));
}

/** 给一个新生成的实体补齐修炼字段 */
export function initEntity(entity, rng, { cultivator = false, world = null } = {}) {
  entity.level = 0;
  entity.exp = 0;
  entity.root = null;
  entity.dao = null;
  entity.karma = 0;
  entity.fortune = 30 + Math.floor(rng() * 50);
  entity.heartDemon = 0;
  entity.mind = 60 + Math.floor(rng() * 30);
  entity.pollution = 0;
  entity.daoTitle = null;
  entity.bloodline = null;
  entity.techniques = [];
  entity.beast = null;
  // 法宝：**对象数组**，不是 id 列表（见 sim/artifacts.js 头注释里对存储方式的说明）
  entity.artifacts = [];
  entity.madUntil = -1;
  // 养伤截止日（游戏日）。**必须给初值**：`save.js` 会把它写进实体行，
  // 若活体没有这个键而读档后有，save-equiv 的「键集并集」判据当场红。
  // 用 `-1e9` 而不是 `0`：`0 > world.day` 在 `world.day === 0` 那天为假，
  // 但 `-1e9` 在任何一天都为假——「从没养过伤」要的是一个恒假的哨兵。
  entity.restUntil = -1e9;
  entity.trialCount = 0;
  entity.lastTrialDay = -1e9;
  entity.lastDemonDay = -1e9;
  entity.lastKarmaDay = -1e9;
  entity.lastAwakenTry = 0;
  entity.foundedSect = 0;
  // ── 惰性字段一律在这里给出初值 ──────────────────────────
  // 下面这五个原本是「用到才建」的：`forbidden` 要等修了禁术才有、
  // `lastBeastDay` 要等第一次妖潮才有、`incarnation`/`soulId`/`pastLife`
  // 要等神魂投进来才有。于是新生的实体身上**根本没有这些键**，
  // 而 `restoreEntity` 每次都会把它们建出来——同一个世界，两种形状。
  //
  // 目前读它们的代码都带了兜底（`|| -1e9`、`!e.forbidden`），所以行为上看不出差别。
  // 但「读档后才存在的键」是一颗定时炸弹：哪天有人写一句
  // `world.day - e.lastBeastDay`（不带兜底），新世界里得到 NaN（比较恒假）、
  // 读档后得到真数字，于是同一个存档在「接着玩」与「读回来再玩」
  // 两条路上走出不同的历史——而这两条路本来必须等价。
  // 是 `inkbox-save-equiv` 里「没有只在一侧存在的字段」这条判据把它揪出来的。
  entity.lastBeastDay = -1e9;
  entity.forbidden = null;
  entity.incarnation = 1;
  entity.soulId = null;
  entity.pastLife = null;
  /**
   * 个人事件流（见 sim/biography.js）。**必须在这里给成 `[]` 而不是留 undefined**——
   * 理由和上面那五个一模一样：`restoreEntity` 每次都会把它建出来，
   * 新实体身上没有就成了「只在一侧存在的字段」。
   * 沙盒原来只有一本 400 条的滚动编年史，传记若从那里按名字反查，
   * 重名即错、而且千年尺度下早期经历必然被顶掉。
   */
  entity.log = [];
  /**
   * 夺舍印记（见 sim/possession.js）。存的是**快照对象**
   * `{ name, level, faction, day }`，不是 id——夺舍者会从 `world.entities`
   * 移除，存 id 从第一秒就是悬垂引用（主线就是这么坏的）。
   */
  entity.possessedBy = null;
  /**
   * 不良状态印记（见 sim/possession.js，D6-3 工程包 D）。存的是**快照对象**
   * `{ ghostName, ghostLevel, day, until, mode }`：
   *   · `mode: 'possess'` + `until: -1` —— 被鬼修**真夺舍**（永久印记）；
   *   · `mode: 'haunt'`   + `until > day` —— 被高阶鬼修**暂时附身**（到期自动解除，
   *     `life.js` 的行为锁读 `until`）。
   * ⚠️ 同样给初值：`save.js` 会把它写进实体行（row[68]），活体没有这个键而
   *    读档后有，save-equiv 的「键集并集」判据当场红（同 `restUntil` / `possessedBy`）。
   */
  entity.possessionScar = null;
  /**
   * 元婴脱壳记账（见 sim/war.js）。一生只能触发一次，所以必须记下来；
   * 不存的话读档后同一个人可以反复脱壳，重伤永远死不了。
   */
  entity.nascentEscapeUsed = false;
  // ── 家世（见 sim/family.js）─────────────────────────────
  // 双亲只在**村庄繁衍**这条路记（神力投放的人是「撒下来的」，没有家世）。
  // 沙盒没有性别字段，所以记的是双亲两位，不叫父母（理由见 family.js 头注释）。
  entity.surname = null;
  entity.parentA = 0;
  entity.parentB = 0;
  /** 世家 id。0 = 无世家（散修或凡人） */
  entity.clan = 0;
  /** 在世家里的世代，始祖为 1。0 = 不在世家谱上 */
  entity.gen = 0;
  /**
   * 家世带来的天资与血脉。**出生时写、觉醒时读**——
   * 不能等到觉醒再去查父母：那时父母多半已经死了，而「死了就查不到」
   * 会让家世在第二代就断掉。所以这里存的是父母天资的**快照**。
   *   heritageQ：双亲里较高的灵根品质（-1 = 双亲都还没觉醒）
   *   heritageB：双亲里先有的那条血脉名（null = 无）
   *   heritageM：世家的家学（家传功法名）。**这一列曾经漏在 initEntity 外面**，
   *             于是 572/600 个实体身上根本没有这个键，存档写 null、读回也是 null，
   *             逐字段比对才抓出来（`undefined !== null`）。漏的后果不是崩溃，
   *             是「家学只传给立族那一刻在场的人」——后面出生的人永远拿不到。
   */
  entity.heritageQ = -1;
  entity.heritageB = null;
  entity.heritageM = null;
  // ── 幽冥鬼魂（契约 reports/d5/BATCH2-DESIGN.md §三；save.js 实体行 row[63..66]）──
  // 凡间与上界的实体**不是**鬼魂，这四格取稳定默认值（`soulKind: null`）。
  // ⚠️ **必须给初值**：`save.js` 的 `restoreEntity` 会把这四列建出来，若活体没有
  //    这些键，save-equiv 的「键集并集」判据当场红
  //    （实测：`只活在读档后：soulKind×634 ghostOf×634 ghostRancor×634 ghostDecayDay×634`）。
  //    与上面 `restUntil` / `log` / `heritageM` 是同一类坑，理由见那几段注释。
  // ⚠️ 键集必须与 `sim/netherLife.js` 的 `GHOST_TEMPLATE` 完全一致——那边是幽冥
  //    鬼魂的模板，这四格在那里是真实取值（`ghostRancor` 积怨 / `ghostDecayDay` 消散日），
  //    在凡间 / 上界只是占位。该模板的注释也点名「本模板键集必须与 initEntity 产物一致」。
  // ⚠️ `soulBind`（列 67 的「魂池链接」）与上面那行 `entity.soulId = null`
  //    （「这一世由哪个神魂**转来**」= 来源）**不是一回事**——2026-09-23 起拆成两个属性。
  entity.soulKind = null;
  entity.ghostOf = null;
  entity.ghostRancor = 0;
  entity.ghostDecayDay = NEVER_DECAY_DAY;
  entity.soulBind = null;
  // ⚠️ `world` 只用于 B0.1 的觉醒计数（`awaken` 里 `+= 1`），**不参与任何判定**。
  //    不传（上界 / 无头路径）就是「不记账」，而不是「记到别的世界头上」。
  if (cultivator) awaken(entity, rng, { silent: true, world });
  return entity;
}

/**
 * 觉醒灵根，凡人 → 修士。
 * 原作里灵根不是「选择」出来的，是天赋；这里保留这个意思。
 */
export function awaken(entity, rng, { silent = false, world = null } = {}) {
  if (entity.level > 0) return false;
  const root = rollSpiritRoot(rng);
  entity.root = root;
  entity.level = 1;
  entity.exp = 0;
  entity.maxHp = maxHpFor(entity);
  entity.hp = entity.maxHp;
  // 寿元不在这里定：血脉要等下面掷完（以及家世继承）才知道，见 lifespanForEntity
  // 血脉：低概率伴随觉醒。原作里各血脉触发条件各不相同（道侣、元素、
  // 等级、污染……），沙盒简化成「觉醒时掷一次」，所以把概率放大到能看见。
  for (let i = 0; i < BLOODLINES.length; i += 1) {
    const b = BLOODLINES[i];
    if (rng() < b.chance * 1.2) {
      entity.bloodline = b.name;
      break;
    }
  }
  // 家世传承：父母的天资与家传血脉（见 sim/family.js）。
  // ⚠️ 这一段**一次签都不抽**——灵根品质直接抬到双亲的下限，家传血脉无条件继承。
  // 在上面那圈之外多抽一次，全世界的主随机流就错位了（理由见 family.js 头注释）。
  applyHeritage(entity);
  // 血脉的加成。**这一列在这之前是只写不读的**——名字写进实体、存进存档、
  // 在检视面板上显示，但没有任何公式读过它，所以一条觉醒的血脉对战力的影响
  // 精确等于 0（见 core/lore.js 里 BLOODLINES 的注释）。
  // 现在接上「气运」与「寿元」两轴，另两轴在 combatPower / cultivationRate 里。
  entity.fortune = clamp(entity.fortune + bloodlineProfile(entity.bloodline, 'fortune'), 0, 100);
  entity.lifespan = lifespanForEntity(entity, 1);
  if (entity.sp === 'human') entity.sp = 'cultivator';
  if (!silent) {
    entity._justAwakened = true;
  }
  // ── B0.1 · 觉醒记账 ────────────────────────────────────────
  //
  // 位置刻意选在**唯一成功出口**（`level > 0` 的早退在函数开头就返回了 false）：
  // 四条觉醒入口（自然觉醒 / 生而有灵根 / 神力点化 / 夺舍者觉醒）全都汇到这里，
  // 所以一处插桩就够，不必在四个调用点各写一遍——那种写法只要漏一处，
  // 计数就会**静默偏小**，而偏小的计数看起来跟正常数据一模一样。
  //
  // ⚠️ `world` 缺省为 `null`（上界 / 无头路径）：此时**不记账**，安静跳过。
  //    上界的觉醒由 `upperLife.js` 自己走，不该混进凡间的 `awakens` 里。
  // ⚠️ 只做 `+= 1`：不抽签、不读签、不写 world ⇒ 世界指纹一个字节不变。
  bumpTelemetry(world, 'awakens');
  return true;
}

// ── 修为积累 ─────────────────────────────────────────────
export function cultivationRate(world, entity) {
  const tile = clamp(Math.floor(entity.y), 0, world.h - 1) * world.w + clamp(Math.floor(entity.x), 0, world.w - 1);
  const qi = world.qi[tile] || 0.3;
  const rootBonus = entity.root ? entity.root.bonus : 0;
  const quality = entity.root ? entity.root.quality : 0;
  const daoBonus = entity.dao ? 1 + (entity.dao.stage + 1) * 0.15 : 1;
  const mindFactor = 0.55 + (entity.mind / 100) * 0.6;
  const pollutionFactor = 1 - Math.min(0.5, entity.pollution * 0.005);
  const madFactor = entity.madUntil > world.day ? 0 : 1;
  // 法宝的「修炼」轴：佩剑的人打坐快一点，佩法宝的人更快一点
  const equipFactor = 1 + equipBonusOf(entity).cultivation;
  // 血脉的「修行」轴。四档「元素亲和」也降级落到这里，见 core/lore.js
  const bloodFactor = 1 + bloodlineProfile(entity.bloodline, 'cultivation');
  return BASE_EXP_PER_DAY
    * (0.35 + qi * 1.35)
    * (1 + rootBonus + quality * 0.06)
    * daoBonus
    * mindFactor
    * pollutionFactor
    * madFactor
    * equipFactor
    * bloodFactor;
}

/**
 * 推进一个实体的修炼。
 * @returns {'alive'|'dead'|'ascended'}
 */
export function stepEntity(world, entity, dtDays, rng) {
  entity.age += dtDays;

  // 走火入魔：期间不修行，见谁打谁
  if (entity.madUntil > world.day) {
    entity.state = 'mad';
    return 'alive';
  }

  // 寿元耗尽
  // ⚠️ 第 5 参**显式传 `null`**（真·寿终 ⇒ `deathNatural`），**不要**改成读
  //    `entity.diedOf`：那是易失标记，可能残留着此人早年饿过 / 烧过的旧因由，
  //    会把「寿终正寝」误印成「没于山洪」。
  if (entity.age >= entity.lifespan) {
    recordDeath(world, entity, rng, null, null);
    return 'dead';
  }

  // 凡人：试着觉醒
  if (entity.level <= 0) {
    if (entity.sp === 'beast' || entity.sp === 'spirit') return 'alive';
    const tile = clamp(Math.floor(entity.y), 0, world.h - 1) * world.w + clamp(Math.floor(entity.x), 0, world.w - 1);
    const qi = world.qi[tile] || 0.3;
    const chance = AWAKEN_BASE * (0.2 + qi * 2.2) * (1 + entity.fortune / 200) * dtDays;
    if (rng() < chance) {
      awaken(entity, rng, { world });
      world.record(`${entity.name} 于${placeName(world, entity)}觉醒${entity.root.rootName}`, 'awaken', entity);
    }
    return 'alive';
  }

  // ── 修士 ────────────────────────────────────────────────
  const rate = cultivationRate(world, entity);
  entity.exp += rate * dtDays;

  // 道途觉醒（世界每 30 天判定一次，这里用个人冷却近似）
  if (!entity.dao && world.day - entity.lastAwakenTry >= DAO_AWAKEN_INTERVAL_DAYS) {
    entity.lastAwakenTry = world.day;
    tryAwakenDao(world, entity, rng);
  }

  // 道途进阶
  if (entity.dao) {
    const path = entity.dao.path;
    const next = path.thresholds[entity.dao.stage + 1];
    if (next !== undefined && entity.dao.progress >= next) {
      entity.dao.stage += 1;
      world.record(`${entity.name} 的${path.name}修为进境，成「${path.stages[entity.dao.stage]}」`, 'cultivate', entity);
    }
  }

  // 心魔
  stepHeartDemon(world, entity, dtDays, rng);

  // 因果报应（每年一次）
  if (world.day - entity.lastKarmaDay >= 360) {
    entity.lastKarmaDay = world.day;
    stepKarma(world, entity, rng);
  }

  // 道心试炼
  stepDaoTrial(world, entity, rng);

  // 心境缓慢回复，心魔也跟着淡去——否则渡劫失败的 +15 会只增不减，
  // 活了几百年的修士个个心魔缠身。
  entity.mind = clamp(entity.mind + dtDays * 0.004, 0, 100);
  entity.heartDemon = clamp(entity.heartDemon - HEART_DEMON_DECAY_PER_DAY * dtDays, 0, 100);
  // 污染缓慢累积（邪修更快）
  const polluteRate = entity.dao && entity.dao.path.evil ? 0.0022 : 0.0004;
  entity.pollution = clamp(entity.pollution + polluteRate * dtDays, 0, 100);

  // 突破
  const need = expToNext(entity.level);

  // ── 天雷飞升（阶段四 · 跨界门槛）────────────────────────────
  // 化神期（40）起、合体期（< 60）的修士，修为圆满时可能引动天雷——
  // 一次**有风险**的渡劫：过了就跨界进上界（走既有 `ascend()`），
  // 没过按寻常渡劫的失败后果处置（外加小概率致死）。
  //
  // ⚠️ **必须排在 `attemptBreakthrough` 之前**。天雷命中就不再走突破；
  //    排在后面的话，`attemptBreakthrough` 会先把修为用掉（成功则升级、
  //    失败则压修为），天雷永远轮不到——而且不报错，只是这条通道静默不存在。
  // ⚠️ 上界（`world.plane === 'upper'`）不触发：上界已有分流，且上界没有
  //    飞升出口（`ascend()` 的去处就是上界）。
  // ⚠️ 60 级（`ASCEND_LEVEL`）不触发：那是**必然飞升**，走下面那条闸门，
  //    不用冒险。两条路的判据都在这里显式写出来，避免重叠 / 死区。
  // ⚠️ 条件里的 `entity.level < ASCEND_LEVEL` 与裂隙那侧的
  //    `RIFT_CROSS_MAX_LEVEL`（core/cultivation.js）同值咬合：
  //    裂隙吸走 40 级以下，天雷接管 40 级及以上，两者不重叠、无死区。
  if (world.plane !== 'upper'
    && entity.level >= THUNDER_ASCEND_MIN_LEVEL
    && entity.level < ASCEND_LEVEL
    && entity.exp >= need
    && rng() < THUNDER_ASCEND_CHANCE) {
    return stepThunderAscend(world, entity, rng);
  }

  // 天花板**按世界取**：凡间 = 60（同时也是飞升门槛），上界 = 表里最高一级
  // （大乘大圆满）。上界修士到此才被允许继续往上升；凡间修士到 60 就停，
  // 交给下面的飞升闸门。两处判据必须同源，否则行为取决于谁先命中，静默地漂。
  // ⚠️ 不写回 `ASCEND_LEVEL`：那是**凡间专属**的飞升门槛（模块常量、不分世界），
  // 上界读到它会永远停在 60。也不写境界上限常量全名——本文件有一条静态断言
  // 要求那个名字 0 命中（`core/` 的 `ceilingFor` 才是本文件的唯一入口）。
  if (entity.exp >= need && entity.level < ceilingFor(world.plane)) {
    return attemptBreakthrough(world, entity, rng);
  }

  // 飞升
  // ⚠️ 只在**凡间**触发（`world.plane !== 'upper'`）。上界跑同一份
  // `stepCultivation`（阶段二 `UpperLife` 复用），若不加这条分流，
  // 上界修士到 60 级会调 `ascend()` 被「飞升出上界」——上界没有
  // 更高的去处，那是一个静默的人口漏洞（INKBOX §九.14 的读者之一）。
  if (world.plane !== 'upper' && entity.level >= ASCEND_LEVEL && entity.pollution < POLLUTION_ASCEND_LIMIT) {
    return ascend(world, entity, rng);
  }

  return 'alive';
}

function tryAwakenDao(world, entity, rng) {
  if (!entity.root || entity.root.quality < 1) return;
  for (let i = 0; i < DAO_PATHS.length; i += 1) {
    const path = DAO_PATHS[i];
    if (rng() < path.chance * 0.5) {
      entity.dao = { path, stage: 0, progress: 0 };
      world.record(`${entity.name} 走上${path.name}之路`, 'dao', entity);
      return;
    }
  }
}

// ── 突破与天劫 ───────────────────────────────────────────
/**
 * 突破。
 *
 * 与小境界（炼气三层→四层）的日常晋升相比，跨大境界的瓶颈才是真正的关卡。
 * 原作对两者用同一个公式，沙盒里给小境界一个加成，否则「炼气二层突破失败」
 * 会频繁发生、把编年史刷满，也让人感觉修行寸步难行。
 * 只有瓶颈处的成败才写进编年史。
 */
export const MINOR_BREAKTHROUGH_BONUS = 0.25;

/**
 * 跨大境界时炼出一件法宝的概率。
 *
 * 「炼器」在原作里是个可以随时点的按钮（`planCraft`），沙盒没有按钮，
 * 于是把它挂到「跨大境界」这个节点上：**境界够了才炼得出东西**，
 * 而且一次突破只可能炼一件。器修（DAO_PATHS 的 artifact）三倍。
 *
 * 数值不高（筑基 6.6%、元婴 10.5%），因为法宝要稀有才值得记住它的名字；
 * 八百年下来累计造出的件数进长测的读数，不合适再调。
 */
export function forgeChance(entity) {
  const level = entity.level || 0;
  const base = 0.06 + level * 0.0015;
  const dao = entity.dao && entity.dao.path && entity.dao.path.key === 'artifact' ? 3 : 1;
  return base * dao;
}

export function attemptBreakthrough(world, entity, rng) {
  const bottleneck = isBottleneck(entity.level);
  const targetLevel = entity.level + 1;
  let omen = null;
  let omenBonus = bottleneck ? 0 : MINOR_BREAKTHROUGH_BONUS;

  if (bottleneck) {
    omen = rollOmen(rng);
    omenBonus = omen.bonus;
    world.record(
      narrate(rng, 'tribulation', {
        name: entity.name,
        realm: realmLabel(targetLevel),
        omen: omen.name,
        omenNote: omen.note,
      }),
      'tribulation',
      entity,
    );
    entity._lastOmen = omen;
    // 走 speak 而不是直接 record：tribulation 词池只有一句，直录会复读成唱片
    if (rng() < 0.25) speak(world, rng, 'tribulation');
  }

  const chance = breakthroughChance({
    level: entity.level,
    quality: entity.root ? entity.root.quality : 0,
    karma: entity.karma,
    fortune: entity.fortune,
    heartDemon: entity.heartDemon,
    omenBonus,
    pollution: entity.pollution,
    // 法宝的「渡劫」轴：原作里这一轴就是装备对渡劫生还的影响
    equipBonus: equipBonusOf(entity).tribulation,
  });

  if (rng() < chance) {
    entity.level = targetLevel;
    entity.exp = 0;
    entity.maxHp = maxHpFor(entity);
    entity.hp = entity.maxHp;
    const before = realmIndexFor(entity.level - 1);
    const after = realmIndexFor(entity.level);
    // 跨大境界或大圆满：寿元按新境界重算（含血脉加成，别漏）
    entity.lifespan = lifespanForEntity(entity, entity.level);
    if (after > before) {
      entity.lifespan += BREAKTHROUGH_LIFE_DAYS;
      entity.mind = clamp(entity.mind + 6, 0, 100);
    }
    entity.fortune = clamp(entity.fortune + 1.5, 0, 100);
    entity.pollution = clamp(entity.pollution - 1, 0, 100);

    if (after > before) {
      // ⚠️ 只有**元婴以上**的跨境界突破才进大事账本（`NOTABLE_BREAKTHROUGH_LEVEL`）。
      // 筑基→金丹走 `record`：实测 60 年里有 134 起金丹以上突破，大半是它，
      // 全塞进大事记会把「开宗」「飞升」冲走。
      // 两条支路都只调一次 `narrate`（下面这一句），所以**随机流一位不动**。
      const breakthroughText = narrate(rng, 'breakthrough', {
        name: entity.name,
        realm: realmLabel(entity.level),
        place: placeName(world, entity),
      });
      if (entity.level >= NOTABLE_BREAKTHROUGH_LEVEL) {
        world.milestone(breakthroughText, 'breakthrough', entity);
      } else {
        world.record(breakthroughText, 'breakthrough', entity);
      }
      // 道心试炼：突破大境界时可能触发
      if (rng() < DAO_TRIAL_TRIGGERS[0].chance) {
        runDaoTrial(world, entity, rng, 'breakthrough');
      }
      // ── 法宝（刻意排在这一段的**最后**）──
      //
      // 排最后是为了尽量少打乱既有的随机流：`wearArtifacts` 与 `forgeArtifact`
      // 只在「这个人身上有法宝」时才抽签，所以**没有法宝的人走的还是原来那条流**。
      // 这一点对调参很重要——它意味着这次改动不会把整个世界的地基掀掉，
      // 受影响的只有「已经有法宝的那一小撮人」，量级是可比的。
      wearArtifacts(world, entity, TRIBULATION_WEAR, rng);
      if (rng() < forgeChance(entity)) forgeArtifact(world, entity, rng);
    }
    return 'alive';
  }

  // 失败
  const outcome = applyBreakthroughFailure(world, entity, rng);
  if (bottleneck) {
    world.record(
      narrate(rng, 'breakthroughFail', { name: entity.name, outcome }),
      'tribulation',
      entity,
    );
  }
  return 'alive';
}

/**
 * 突破失败的后果：境界倒退一层 / 修为尽失跌落本阶 / 走火入魔。
 *
 * 抽成独立函数是为了让「天雷飞升失败」（`stepThunderAscend`）与寻常渡劫失败
 * **共用同一套后果**——各写一份迟早分叉，而分叉不报错，只会让两条路的惩罚
 * 悄悄不同。抽取时逐行照搬，随机流一位不动（先 `rng()` 掷后果档，
 * 调用方再决定要不要用 `narrate` 写编年史）。
 *
 * @returns {string} 后果标签，供调用方写编年史
 */
function applyBreakthroughFailure(world, entity, rng) {
  entity.exp = Math.floor(entity.exp * FAIL_EXP_KEEP);
  entity.heartDemon = clamp(entity.heartDemon + HEART_DEMON_ON_FAILURE, 0, 100);
  entity.mind = clamp(entity.mind - 8, 0, 100);
  entity.fortune = clamp(entity.fortune - 2, 0, 100);

  const roll = rng();
  let outcome;
  if (roll < 0.5) {
    entity.level = Math.max(1, entity.level - 1);
    entity.hp = entity.maxHp * 0.2;
    entity.lifespan = lifespanForEntity(entity, entity.level);
    outcome = '境界倒退一层';
  } else if (roll < 0.8) {
    entity.level = realmFor(entity.level).min;
    entity.lifespan = lifespanForEntity(entity, entity.level);
    outcome = '修为尽失，跌落本阶';
  } else {
    entity.madUntil = world.day + MAD_DAYS;
    outcome = '走火入魔';
  }
  // 必须在「境界变动之后」再压修为：倒退会让需求变小，
  // 若按旧需求钳制，压完仍可能越线，照样会立刻重抽。
  entity.exp = Math.min(entity.exp, expToNext(entity.level) - 1);
  return outcome;
}

/**
 * 天雷飞升：化神期及以上、合体期以下的修士，修为圆满时引动天雷。
 *
 * 判定入口在 `stepEntity`（**排在 `attemptBreakthrough` 之前**）。
 * 成功 → 走既有 `ascend()` 进上界；失败 → 寻常渡劫的失败后果 + 小概率致死。
 */
export function stepThunderAscend(world, entity, rng) {
  // 天雷已至：无论成败都写一笔。kind 用新登记的 `'thunder-ascend'`——
  // 这条通道与寻常天劫（kind `'tribulation'`）在编年史里必须分得开，
  // 否则玩家在「修行」筛选里看不出「他是被天雷送走的」。
  const omen = rollOmen(rng);
  world.record(
    `【${entity.name}】于${placeName(world, entity)}引动天雷，欲以此破界飞升——天现「${omen.name}」，${omen.note}`,
    'thunder-ascend',
    entity,
  );
  // 表现层：天雷落下（FX 画一条折线）。**只发事件**——不改模拟、不抽 rng。
  emitPresentation(world, 'tribulation', {
    x: Math.floor(entity.x),
    y: Math.floor(entity.y),
    subjectId: entity.id,
    intensity: 1,
  });

  // 成功率与寻常渡劫**同源**（含法宝 tribulation 轴 / 心魔 / 污染 / 因果 / 气运），
  // 只加一个天雷专属的惩罚项。理由见 `THUNDER_CHANCE_PENALTY` 的注释。
  const chance = breakthroughChance({
    level: entity.level,
    quality: entity.root ? entity.root.quality : 0,
    karma: entity.karma,
    fortune: entity.fortune,
    heartDemon: entity.heartDemon,
    omenBonus: omen.bonus,
    pollution: entity.pollution,
    equipBonus: equipBonusOf(entity).tribulation,
  }) - THUNDER_CHANCE_PENALTY;

  if (rng() < Math.max(0.05, chance)) {
    // 通过 → 跨界进上界。走既有 `ascend()`（去处标签 / 编年史 / 逝者名录 /
    // 法宝留下 / 遗泽洞府 / 进上界），**不自己写一份**。
    // ⚠️ `forceUpper: true` 是本次最关键的一处：天雷飞升者的 level 在 40~59，
    //    `ascend()` 默认按 `level >= ASCEND_LEVEL` 判去处会给他 `blessed`
    //    （**不进上界**）——那样「天雷飞升」名不副实：人从凡间消失了，
    //    上界却没多一个人，而且不报错。理由详见 `ascend()` 的参数注释。
    // ⚠️ `via: 'thunder'` 与 `forceUpper` 是**两件不同的事**，别合并：
    //    · `forceUpper` 决定**去哪**（上界，而不是福地）——丢了它，人从凡间
    //      消失、上界却不多人；
    //    · `via` 决定**账怎么记**（上界 `popLog.arrivedThunder` 加一）——丢了它，
    //      人照样进上界，只是长测再也判不出「天雷这条通道还活着」，
    //      而且**不报错**（通道照跑，账上永远是 0）。
    //    两个都丢不了，所以两个都显式写出来。
    return ascend(world, entity, rng, { forceUpper: true, via: 'thunder' });
  }

  // 失败：小概率当场殒命
  if (rng() < THUNDER_DEATH_CHANCE) {
    // 死因标记：天雷劈死。取 `'narrated'` 而不是 `'thunder'`——本分支**自己**
    // 已经写过一条死讯（下面那句 `雷火焚身，形神俱灭。`），若再让清扫里的
    // `recordDeath` 记一条 `kind:'death'`，同一次死亡就有两条编年史。
    // `'narrated'` 让 `recordDeath` 直接 return，只留现场这一条。
    entity.diedOf = 'narrated';
    entity.hp = 0;
    // 「引动天雷」与「渡劫未成」都留在编年史里就够了（40 级以上每几年就有人试，
    // 全进大事账本会把账本灌满）；唯独**当场殒命**要进——形神俱灭是不可逆的。
    world.milestone(
      `【${entity.name}】渡天雷飞升，雷火焚身，形神俱灭。`,
      'thunder-ascend',
      entity,
    );
    // 返回 'dead' → `life.js` 的 `stepEntity` 立刻返回（**不进食**，否则
    // 脚下的肥力会把 hp 从 0 补回来），随后清理循环见 `hp <= 0` 调 `onDeath`。
    // **不在这里 splice**：自己动手会漏掉逝者名录 / 死讯 / 夺舍 / 神魂 / 遗物。
    return 'dead';
  }

  // 非致死：走与寻常渡劫同一套失败后果，再补一层心魔重罚
  const outcome = applyBreakthroughFailure(world, entity, rng);
  entity.heartDemon = clamp(entity.heartDemon + THUNDER_HEART_DEMON_PENALTY, 0, 100);
  world.record(
    `【${entity.name}】天雷飞升未成，${outcome}。`,
    'thunder-ascend',
    entity,
  );
  return 'alive';
}

// ── 心魔 ─────────────────────────────────────────────────
function stepHeartDemon(world, entity, dtDays, rng) {
  if (entity.heartDemon < HEART_DEMON_THRESHOLD) return;
  if (world.day - entity.lastDemonDay < HEART_DEMON_COOLDOWN_DAYS) return;
  if (rng() >= heartDemonChance(entity.heartDemon) * dtDays * 0.02) return;
  entity.lastDemonDay = world.day;

  const form = HEART_DEMON_FORMS[Math.floor(rng() * HEART_DEMON_FORMS.length)];
  const result = resolveHeartDemon(entity.level, entity.heartDemon, rng);
  if (result.win) {
    entity.heartDemon = clamp(entity.heartDemon - (15 + rng() * 25), 0, 100);
    entity.mind = clamp(entity.mind + 5, 0, 100);
    entity.exp += entity.level * 8;
    world.record(`【${entity.name}】勘破心魔（幻作${form.name}），心境更坚。`, 'cultivate', entity);
  } else {
    entity.heartDemon = clamp(entity.heartDemon + 5, 0, 100);
    entity.mind = clamp(entity.mind - 15, 0, 100);
    world.record(
      narrate(rng, 'heartDemon', { name: entity.name, form: form.name, formNote: form.note }),
      'cultivate',
      entity,
    );
  }
}

// ── 因果 ─────────────────────────────────────────────────
/**
 * 因果报应，每年一判。
 *
 * 报应该照常发生（该回血回血、该掉血掉血），但只有因果缠得够深才写进编年史：
 * 世界里的打打杀杀天天都在积因果，若每次报应都记一笔，
 * 编年史会被「业障临头，旧日因果来讨」刷掉四分之一（实测 400 条里占 85 条）。
 */
export const KARMA_RECORD_THRESHOLD = 45;

function stepKarma(world, entity, rng) {
  if (Math.abs(entity.karma) < KARMA_EVENT_THRESHOLD) return;
  if (rng() > 0.22) return;
  const notable = Math.abs(entity.karma) >= KARMA_RECORD_THRESHOLD;
  if (entity.karma < 0) {
    // 积德得报
    entity.hp = entity.maxHp;
    entity.fortune = clamp(entity.fortune + 4, 0, 100);
    // 与突破同一道天花板（按世界取）：到了**本世界**的天花板就不再给修为，
    // 否则「善果」会把一个已经该飞升（凡间 60）或已经修到头（上界大乘大圆满）
    // 的人继续往上堆，堆出来的等级没有任何读者。
    if (entity.level < ceilingFor(world.plane) && rng() < 0.3) {
      entity.exp += expToNext(entity.level) * 0.5;
    }
    if (notable) world.record(`【${entity.name}】昔年善果成熟，冥冥中自有回护。`, 'karma', entity);
  } else {
    // 作恶遭报
    // 死因标记：业障讨命。若这一下真把人打空，清扫里 `recordDeath` 会据此走
    // `deathOther`（而不是印成「寿终正寝」）。⚠️ 本处**不改**上面那条 `kind:'karma'`
    // 的善果/业障记录——那是「因果事件」本身，与「死亡」是两件事，各记一条不是重复。
    entity.diedOf = 'karma';
    entity.hp -= entity.maxHp * 0.2;
    entity.fortune = clamp(entity.fortune - 3, 0, 100);
    entity.pollution = clamp(entity.pollution + 4, 0, 100);
    if (notable) world.record(`【${entity.name}】业障临头，旧日因果来讨。`, 'karma', entity);
  }
}

/** 因果变动统一走这里，顺便钳制范围 */
export function addKarma(world, entity, delta, reason) {
  if (!entity) return;
  entity.karma = clamp(entity.karma + delta, KARMA_MIN, KARMA_MAX);
  if (reason && Math.abs(delta) >= 4) {
    world.record(`【${entity.name}】${reason}（因果 ${entity.karma > 0 ? '+' : ''}${Math.round(entity.karma)}）`, 'karma', entity);
  }
}

// ── 道心试炼 ─────────────────────────────────────────────
function stepDaoTrial(world, entity, rng) {
  if (entity.level < DAO_TRIAL_MIN_LEVEL) return;
  if (entity.trialCount >= DAO_TRIAL_MAX_PER_LIFE) return;
  if (world.day - entity.lastTrialDay < DAO_TRIAL_COOLDOWN_DAYS) return;
  // 天地大劫 / 修行百年 两类触发
  const centurial = entity.age > 0 && Math.floor(entity.age / (360 * 100)) > Math.floor((entity.age - 1) / (360 * 100));
  const calamity = rng() < DAO_TRIAL_TRIGGERS[2].chance * 0.0008;
  if (!centurial && !calamity) return;
  runDaoTrial(world, entity, rng, centurial ? 'century' : 'calamity');
}

function runDaoTrial(world, entity, rng, triggerKey) {
  entity.trialCount += 1;
  entity.lastTrialDay = world.day;
  const trial = DAO_TRIALS[Math.floor(rng() * DAO_TRIALS.length)];
  const result = resolveDaoTrial(entity.level, entity.heartDemon, rng);
  let text;
  if (result.tier === 'firm') {
    entity.mind = clamp(entity.mind + 12, 0, 100);
    entity.exp += entity.level * 10;
    if (!entity.daoTitle) {
      entity.daoTitle = DAO_TITLES[Math.floor(rng() * DAO_TITLES.length)];
      text = `道心坚定，得道号「${entity.daoTitle}」。`;
    } else {
      text = '道心坚定，如磐石不动。';
    }
  } else if (result.tier === 'shift') {
    entity.mind = clamp(entity.mind + 5, 0, 100);
    entity.exp += entity.level * 5;
    text = '道心蜕变，更上一层。';
  } else {
    const gain = 10 + rng() * 20;
    entity.heartDemon = clamp(entity.heartDemon + gain, 0, 100);
    entity.mind = clamp(entity.mind - 10, 0, 100);
    text = `道心动摇，心魔 +${Math.round(gain)}。`;
  }
  const trigger = DAO_TRIAL_TRIGGERS.find((t) => t.key === triggerKey);
  world.record(
    narrate(rng, 'daoTrail', {
      name: entity.name,
      question: trial.question,
      result: `${text}（因${trigger ? trigger.label : '缘法'}）`,
    }),
    'daotrial',
    entity,
  );
}

// ── 飞升 ─────────────────────────────────────────────────
/**
 * 飞升：把一位修士从凡间送走（去处标签 / 编年史 / 逝者名录 / 法宝留下 /
 * 遗泽洞府 / 进上界）。
 *
 * @param {object} [opts]
 * @param {boolean} [opts.forceUpper=false] 强制把去处判成 `'upper'`（进上界）。
 *   **只有天雷飞升（`stepThunderAscend`）会传 true**。
 *   ⚠️ 为什么需要这个开关：下面的去处判据按 `entity.level >= ASCEND_LEVEL`（60）
 *   来分「上界 / 福地」。而天雷飞升者的 level 在 **40~59**，按这条判据会落到
 *   `blessed`（**不进上界**）——于是「天雷飞升」这条通道名不副实：人从凡间
 *   消失了、名录里也记了，上界却没多一个人，而且不报错、不崩溃。
 *   ⚠️ 为什么不干脆把默认判据改成「凡是被天雷送走的一律 upper」：`ascend()`
 *   还有第三个调用方 `divine.js` 的玩家点化飞升，它挑的也是 50~59 级的人，
 *   按 06 册「凡间之巅是合体」本就该去福地。改默认值会把它一起改掉。
 *   所以用**显式参数**而不是改默认——两件事各按各的规矩走。
 * @param {string} [opts.via] 转移**通道**标签，只透传给 `arriveUpper` 做分类记账。
 *   `'thunder'` = 天雷飞升（`stepThunderAscend` 传）；缺省 = 寻常飞升。
 *   ⚠️ 它**不是**可以省掉的装饰：上界 `popLog.arrivedThunder` 靠它才认得人，
 *   而长测判「天雷通道还活着」的唯一信号就是那个计数。省掉它 → 通道照跑、
 *   人照样进上界，只是**账上永远是 0**，长测红在一个和这里毫无关系的地方。
 *   ⚠️ 为什么不能在上界侧用 `entity.level` 反推：天雷飞升者（40~59）与
 *   「玩家点化飞升」者（`divine.js`，50~59）**境界完全重叠**，且后者去福地、
 *   压根不进上界。反推不出来，只能由调用方显式声明。
 */
export function ascend(world, entity, rng, { forceUpper = false, via = null } = {}) {
  // 去处标签与**转移判据**必须同源（都用 `ASCEND_LEVEL`）：
  // 自然飞升（`stepCultivation` 的闸门）只发生在 60 级，所以能走到这里的
  // 60 级者去上界；玩家点化（`divine.js` 的 `ascendChosen`）挑的是境界最高者，
  // 可能是 50~59 级——按 06 册「凡间之巅是合体」，点化走 blessed，不接引上界。
  // 旧写法 `>= 50` 会让名录里标着 upper 的人实际从未到过上界。
  // 天雷飞升（40~59 级）是**第三条路**，它要进上界，靠上面的 `forceUpper` 显式指定。
  const plane = forceUpper || entity.level >= ASCEND_LEVEL ? 'upper' : 'blessed';
  world.recordAscension(entity, plane);
  // 表现层：飞升（FX 从人物位置拉一缕墨气向上）。只发事件，不改模拟。
  // ⚠️ 放在 `leaveArtifacts` / 移出 `entities` **之前**——那时 `entity.x/y` 还在原处。
  emitPresentation(world, 'ascension', {
    x: Math.floor(entity.x),
    y: Math.floor(entity.y),
    subjectId: entity.id,
  });
  // 飞升是这个世界里**最不可逆**的一步（人走了就再不回来），必须进大事账本。
  world.milestone(
    narrate(rng, 'ascension', { name: entity.name, place: placeName(world, entity) }),
    'ascend',
    entity,
  );
  if (rng() < 0.6) speak(world, rng, 'ascension');

  // ── 逝者名录（见 sim/necrology.js）───────────────────────
  // 飞升者**不会**走 `life.js` 的 `onDeath`（清理循环里 `if (e._ascended) continue;`
  // 直接跳过），所以必须在这里单独入册。
  //
  // ⚠️ 顺序：必须排在下面 `leaveArtifacts` **之前**。飞升时法宝会留在原地、
  // `entity.artifacts` 被清成 `[]`——排到后面的话「随葬法宝」永远是空的，
  // 而且不报错，只是每一份飞升者的传记都少一行。
  // ⚠️ 为什么放在 `ascend()` 里、而不是调用方 `life.js` 的 `e._ascended = true` 附近：
  //   ① 调用方那时 `ascend()` 已经跑完，法宝早就没了；
  //   ② `divine.js` 的 `ascendChosen()`（玩家点化飞升）也会直接调 `ascend()`，
  //      放在这里才能把「天意飞升」与「点化飞升」两条路一起覆盖——
  //      漏掉后者的后果是「玩家亲手送走的那个人，名录里查不到」。
  // `rememberDead` 是纯读，一次 rng 都不抽，不会扰动主随机流。
  rememberDead(world, entity, 'ascended');

  // 法宝留下。⚠️ 必须在这里做：调用方随后会把 `_ascended` 的实体从
  // `world.entities` 里剔掉，挂在它身上的法宝就再也找不回来了。
  leaveArtifacts(world, entity, rng);

  // 遗泽：飞升者在原地留下一座洞府，成为后人的机缘。
  // 加个上限——早先「飞升者未真正离世」的 bug 曾让同一个人的洞府堆到上千座。
  if (world.sites.length < MAX_SITES) {
    const x = clamp(Math.floor(entity.x), 1, world.w - 2);
    const y = clamp(Math.floor(entity.y), 1, world.h - 2);
    world.addSite({
      kind: 'cave',
      x,
      y,
      name: `${entity.daoTitle || entity.name}洞府`,
      owner: entity.daoTitle || entity.name,
      element: entity.root ? entity.root.elements[0] : null,
      reward: entity.techniques[0] || null,
      age: 0,
      opened: false,
    });
  }

  // ── 阶段二：自然飞升者进入上界（快照复制）────────────────
  // 放在最后：此时 `leaveArtifacts` 已把法宝留在凡间（副本不该带法宝）、
  // 遗泽洞府已建、逝者名录已入册——快照拿到的就是「一位刚了却凡尘的修士」。
  // 两条路都覆盖：`stepCultivation` 的天意飞升与 `divine.js` 的点化都最终
  // 走进本函数（与上面 `rememberDead` 同一条接线理由）。
  // ⚠️ 测试造的世界可能没有 `world.upper`（阶段一 §九.13 的教训）：
  // 没挂上界时只记账不转移，**不能**在这里就地生成一张——生成是
  // `attachUpper` 的职责，各写一份迟早生成出两张对不上的上界。
  if (plane === 'upper' && world.upper) {
    // 第三个参数是**凡间** world：`arriveUpper` 要拿它把 `entity.faction`
    // 解析成宗门名字符串（`fromSect`）。不传的话上界拿到的来历里没有宗门名。
    // 第四个参数是**通道标签**：天雷飞升传 `'thunder'`，上界据此把
    // `popLog.arrivedThunder` 加一（长测判「这条通道还活着」的唯一信号）。
    // 寻常飞升传 null → `arriveUpper` 走缺省判定（修士即 `'ascend'`）。
    arriveUpper(world.upper, entity, world, via ? { via } : {});
  }
  return 'ascended';
}

// ── 记录 ─────────────────────────────────────────────────
/**
 * 写一条死亡编年史。
 *
 * 第 5 参 `cause` 决定走哪个池（`core/lore.js` 的 NARRATIVE）：
 *   · `killer` 存在                 ⇒ `'death'`（战死 / 被杀，印得出凶手）
 *   · `cause === 'narrated'`        ⇒ **直接 return，不记账**——现场（天雷）已经
 *                                      自己写过一条死讯，再写就是「同一次死亡记两条」
 *   · `cause` ∈ DEATH_OTHER_CAUSES  ⇒ `'deathOther'`（灾劫 / 妖兽 / 意外）
 *   · 其余（含 `null`）             ⇒ `'deathNatural'`（**真·寿终**走这条）
 *
 * ⚠️ 调用点必须**显式**传 `cause`，不要在这里现读 `entity.diedOf`：`diedOf` 是
 *    「致死点写、清扫时读」的易失标记，会被**本 tick 的下一个致死点覆盖**
 *    （如：先 `stepKarma` 写 `'karma'`，随后进食分支又写 `'famine'`）。真寿终
 *    （`stepEntity` 里 `age >= lifespan`）一律传 `null`，才不会被残留标记带偏。
 *
 * ⚠️ `_deathRecorded` 去重：寿终实体在 `stepEntity` 的 `age >= lifespan` 分支里
 *    已被记过一次，而 `life.step()` 的死亡清扫又会对**同一个实体**再调一次
 *    `onDeath` ⇒ 会记第二条。本标记挡掉第二条，保证「一次死亡恰好一条编年史」。
 *    它同 `killedBy` 一样是**同 tick 内写、同 tick 内读**的易失字段，不进存档
 *    （已在 `scripts/inkbox-save-equiv.mjs` 的 VOLATILE 登记）。
 *
 * ⚠️ 换池**不扰动主随机流**：`narrate()` 无论走哪个池都只 `pickFrom` 一次
 *    （`core/lore.js`），所以只要一次死亡仍只调一次 `narrate`，抽样次数就不变。
 */
const DEATH_OTHER_CAUSES = new Set(['famine', 'fire', 'lost', 'thunder', 'karma', 'site', 'war']);

/**
 * 「值得进大事账本」的境界门槛。
 *
 * ⚠️ **两个门槛，故意不同**——它们回答的是两个不同的问题：
 *
 *   · `NOTABLE_BREAKTHROUGH_LEVEL = 30`（元婴）——回答「**谁正在崛起**」。
 *     实测 60 年（中堂 · seed 20260914）：金丹以上的跨境界突破有 134 起，
 *     其中大半是筑基→金丹。金丹在这套寿元表里活得久（620 年），
 *     世界跑到第 60 年就有 38 个——它够不上「世界级人物」。
 *     卡在元婴，60 年只剩约 56 起（0.9 起/年），大事记的 12 个格子
 *     才装得下「开宗 / 大战 / 飞升」这些真稀客。
 *
 *   · `NOTABLE_DEATH_LEVEL = 20`（金丹）——回答「**谁陨落了**」。
 *     死比活值得记：一个金丹真人的死讯在 60 年里只有 6 起，
 *     而且每一起都是不可逆的。门槛压到筑基就会一年几十条，把版面冲掉。
 *
 * 低于门槛的**照旧进 `record()`**（编年史 400 条滚动窗口），
 * 只是不占大事记的版面——**信息没有丢，只是不抢镜**。
 */
const NOTABLE_BREAKTHROUGH_LEVEL = 30;
const NOTABLE_DEATH_LEVEL = 20;

export function recordDeath(world, entity, rng, killer, cause = null) {
  if (entity.level <= 0) return;
  if (entity._deathRecorded) return;
  const place = placeName(world, entity);
  let key = 'deathNatural';
  if (killer) {
    key = 'death';
  } else if (cause === 'narrated') {
    return;                       // 现场已自记一条死讯，本函数不再记账
  } else if (cause && DEATH_OTHER_CAUSES.has(cause)) {
    key = 'deathOther';
  }
  entity._deathRecorded = true;
  // ⚠️ `narrate` 只许调**一次**（它抽 rng）。所以先算出文本，再决定写进哪本账——
  //    写成两个分支各调一次 `narrate` 的话，金丹以上的人会多抽一次签，
  //    几百年的世界会整个漂位（而且不报错）。
  const deathText = narrate(rng, key, {
    name: entity.name,
    place,
    age: Math.round(entity.age),
    killer: killer ? killer.name : undefined,
  });
  // 金丹（level 20）以上陨落进大事账本——编年史那 400 条滚动窗口几年就把它冲掉，
  // 而「那个金丹真人是怎么没的」恰恰是玩家回头看时最想找的东西之一。
  // 炼气/筑基的死讯继续走 `record`：它们一年能出几十上百条，进大事账本会把真大事淹掉。
  if (entity.level >= NOTABLE_DEATH_LEVEL) world.milestone(deathText, 'death', entity);
  else world.record(deathText, 'death', entity);
}

/** 用附近的地形给一个「地名」，让叙事读起来像那么回事 */
export function placeName(world, entity) {
  const x = clamp(Math.floor(entity.x), 0, world.w - 1);
  const y = clamp(Math.floor(entity.y), 0, world.h - 1);
  const i = y * world.w + x;
  const h = world.height[i];
  const water = world.water[i];
  const veg = world.veg[i];
  if (water > 0.05) return '海上';
  if (h > 0.85) return '雪峰之巅';
  if (h > 0.72) return '山巅';
  if (h > 0.6) return '乱石坡';
  if (veg > 0.7) return '密林深处';
  if (veg > 0.35) return '林间';
  if (world.riverBase[i] > 0) return '河畔';
  if (h < 0.34) return '水边沙洲';
  return '旷野';
}

export { REALMS, realmFor, realmLabel, lifespanFor, expToNext, isBottleneck, pickFrom };
