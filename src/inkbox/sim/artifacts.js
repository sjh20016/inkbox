// 水墨沙盒 · 法宝
//
// 迁移自原作 equipmentSystem.js（598 行）+ artifactSpiritSystem.js（163 行）。
//
// ── 为什么不是照搬 ──────────────────────────────────────
// 原作那一套是给「管理型」游戏写的：五槽 + 耐久 + 修复 + 宗门库房 + 炼器工坊 +
// 材料账本，玩家要一件件点、一件件修。沙盒里没人会去管库房。
// 但沙盒有一个原作给不了的东西——**时间**。所以这里只留原作的三样设定
// （五槽 / 四阶 / 五品 + 器灵），把重心全压在「这件东西换过几个主人」上：
//
//   · 法宝是**世界的物件**，比它的持有者活得久；
//   · 每一次易主都记进它自己的 `history`，也进编年史；
//   · 相伴够久会长出器灵，器灵有名字、有脾气，而且**会护住这件东西不被毁掉**。
//
// 换句话说：原作问的是「这件装备加多少攻」，沙盒问的是「这把剑上一任主人是谁」。
//
// ── 三轴而不是八轴 ──────────────────────────────────────
// 原作的 slotProfile 有八轴（修炼/突破/渡劫/攻/防/移/心/抗污）。沙盒只留三轴，
// 而且只留**能真的接到代码里**的三轴——多出来的轴就是「定义了但没人读」的死字段，
// 这个坑上一轮刚在 `EQUIP_*` 上踩过一次（零引用）：
//   combat       → cultivation.js 的 combatPower()
//   cultivation  → cultivation.js 的 cultivationRate()
//   tribulation  → cultivation.js 的 attemptBreakthrough() 的成功率
// 三轴之外的原作设定（移动力/心志/抗污）没有对应的模拟机制，留在这里只会变成
// 「看起来迁移完了」的假象，所以**明确不迁**。
//
// ── 与另外几个模块的分工 ────────────────────────────────
//   worldgen/sects  谁在哪儿、谁跟谁抢地盘
//   cultivation     一个人身上发生什么
//   sites           秘境 / 洞府 / 古阵 / 遗蜕
//   本文件          一件东西身上发生什么（炼成 → 易主 → 器灵 → 碎裂）

import {
  EQUIP_SLOTS, EQUIP_TIERS, EQUIP_QUALITIES,
  ARTIFACT_NAMES, ARTIFACT_SPIRITS, NETHER_TECHNIQUES, narrate, pickFrom,
} from '../core/lore.js';
import { clamp } from '../core/noise.js';

// ── 标定 ─────────────────────────────────────────────────

/** 一个人最多同时带几件。原作是五槽各一件（五件），沙盒收紧到三件 */
export const ARTIFACT_CAP = 3;

/** 相伴多少游戏年后器灵初生。原作台词：「法宝相伴五十载后，器灵初生的征兆」 */
export const SPIRIT_BOND_YEARS = 50;

/** 器灵只出在宝品以上、精良以上（tier >= 2 且 quality >= 2） */
export const SPIRIT_MIN_TIER = 2;
export const SPIRIT_MIN_QUALITY = 2;

/**
 * 器灵最多能替主人挡几次碎裂。
 *
 * ⚠️ 这一条不是可有可无的：器灵原本写的是「**永不碎**」，实测 600 年下来
 * 在手 125 件里有 75 件带器灵——因为不碎的东西会一直累积，最后整个世界都是
 * 不碎的旧物，「法宝会磨损」这半条机制就等于不存在了。这是典型的
 * 「一个看起来只是好处的设定，把旁边那条机制悄悄关掉了」。
 * 现在的规矩是：**挡三次，然后它也累了**。第四次就一起散掉。
 */
export const SPIRIT_MAX_SCARS = 3;

/** 无主法宝躺多久朽坏（游戏年）。比地点里 ruin 的 220 年长一点：物比地方久 */
export const GROUND_DECAY_YEARS = 300;

/** 地上最多同时躺几件。超了就朽掉最旧的那件 */
export const GROUND_CAP = 120;

/** 全世界的法宝上限。到顶就不再炼新的——不然八百年下来会攒出几万件 */
export const LIVE_CAP = 900;

export const MAX_DURABILITY = 100;

/** 渡一次劫磨掉多少耐久 */
export const TRIBULATION_WEAR = 7;
/** 杀一个人磨掉多少耐久（只算杀，不算每次挥剑） */
export const KILL_WEAR = 1.2;

/** 器灵初生的判定间隔（游戏日）。与拾取共用同一趟扫描 */
const SWEEP_PERIOD_DAYS = 90;

/**
 * 五槽的三轴侧重。**比例取自原作** equipmentSystem.js:112-118 的 slotProfile，
 * 按「这东西主要是干什么用的」压成三轴：
 *   武器 attack 2 / defense .35        → 战为主，修次之
 *   衣甲 defense 2 / tribulation 1.2   → 渡劫为主
 *   鞋履 movement 2 / cultivation 1.4  → 修为主，三轴都偏低
 *   饰   mind 1.5 / cultivation 1.6    → 修为主
 *   法宝 三轴都在 1.5~1.7              → 全轴都强，但单项都不如专精的
 */
const SLOT_PROFILE = Object.freeze({
  武器: { combat: 1.0, cultivation: 0.5, tribulation: 0.35 },
  衣甲: { combat: 0.5, cultivation: 0.35, tribulation: 1.0 },
  鞋履: { combat: 0.4, cultivation: 0.85, tribulation: 0.55 },
  饰: { combat: 0.3, cultivation: 1.0, tribulation: 0.5 },
  法宝: { combat: 0.85, cultivation: 0.85, tribulation: 1.0 },
});

/** 没有法宝时的返回值。**必须是共享常量**：equipBonus 在热路径上 */
const NO_BONUS = Object.freeze({ combat: 0, cultivation: 0, tribulation: 0 });

/** 器灵按槽位兜底（名字里认不出关键字时用） */
const SLOT_SPIRIT = Object.freeze({
  武器: 'sword_spirit',
  衣甲: 'seal_spirit',
  鞋履: 'zither_spirit',
  饰: 'pearl_spirit',
  法宝: 'mirror_spirit',
});

const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '十一', '十二', '十三', '十四', '十五'];

/** 法宝自己的历史里，哪些 kind 算「易主」 */
const TRANSFER_KINDS = new Set(['forged', 'gained', 'inherited', 'found']);

/** 一件法宝最多记多少条履历。不设上限的话，八百年下来存档会被履历撑爆 */
export const HISTORY_CAP = 10;

/** 一个人最多记几门功法。与 `divine.js:114` / `sites.js:45` 的 `< 3` **同源** */
export const TECHNIQUE_CAP = 3;

/**
 * 幽冥功法名 → **池子里的那个对象**。
 *
 * ⚠️⚠️ **习得时必须推池子里的那个对象，而不是现场拼一个 `{name, note}`**：
 *    `io/save.js` 只存功法**名字**（`:320`），读档靠 `MANUAL_BY_NAME`（`:207`）
 *    还原成**池子里的对象**。运行时推一个临时拼的对象、读档后推池子对象，
 *    两者的键集就分叉了——而 `scripts/inkbox-save-equiv.mjs` 的
 *    `compareEntityFields` 取**键集并集**，会当场红（这正是它存在的意义）。
 *    所以走「按名字取回池子对象」这一条路，与 `sites.js:48` 推 `manual` 同款。
 */
const NETHER_TECHNIQUE_BY_NAME = new Map(NETHER_TECHNIQUES.map((t) => [t.name, t]));

// ── 计算 ─────────────────────────────────────────────────

/**
 * 单件法宝的「核心强度」（未乘槽位侧重）。
 *
 * 标定：`tier * 0.055 + quality * 0.018`，tier 0..3、quality 0..4。
 *   · 一件粗制凡品（tier0/q0）≈ 0，等于没有——世界上多数法宝就是这个样子；
 *   · 一件精良宝品（tier2/q2）≈ 0.146，乘 profile 后约 +5~15%；
 *   · 一件绝品仙品（tier3/q4）≈ 0.237，乘 profile 后约 +8~24%。
 *
 * 为什么是这个量级：`combatPower` 里境界项是 `(1 + level² * 0.045)`
 * 再乘 `(1 + realmIndex * 0.35)`——金丹（level 16）光境界那一项就是 12.5 倍。
 * 法宝只该是**零头**，否则「捡到一把好剑」会盖过「修了三百年」。
 */
export function artifactAxis(a) {
  if (!a) return 0;
  const core = (a.tier || 0) * 0.055 + (a.quality || 0) * 0.018;
  const scarred = 1 - Math.min(0.5, (a.scars || 0) * 0.2);   // 每道裂痕 -20%，最多 -50%
  return core * scarred;
}

/** 单件法宝的三轴加成（**加算系数**：0.2 表示 +20%） */
export function artifactBonusOf(a) {
  const p = SLOT_PROFILE[a.slot] || SLOT_PROFILE.法宝;
  const core = artifactAxis(a);
  return { combat: core * p.combat, cultivation: core * p.cultivation, tribulation: core * p.tribulation };
}

/**
 * 一个修士身上所有法宝的三轴合计。
 *
 * 热路径：`combatPower` 每 tick 会被攻防双方各调一次。所以第一件事是
 * 「身上没有法宝就直接返回共享常量」——世界上绝大多数生灵都走这一支。
 */
export function equipBonus(entity) {
  const list = entity && entity.artifacts;
  if (!list || list.length === 0) return NO_BONUS;
  let combat = 0;
  let cultivation = 0;
  let tribulation = 0;
  for (let i = 0; i < list.length; i += 1) {
    const b = artifactBonusOf(list[i]);
    combat += b.combat;
    cultivation += b.cultivation;
    tribulation += b.tribulation;
  }
  return { combat, cultivation, tribulation };
}

/** 综合强度：用来比大小、排序、决定要不要换掉手上那件 */
export function artifactPower(a) {
  if (!a) return 0;
  const b = artifactBonusOf(a);
  const intact = clamp((a.durability || 0) / Math.max(1, a.maxDurability || MAX_DURABILITY), 0, 1);
  return (b.combat * 3 + b.cultivation + b.tribulation) * 100 * (0.35 + intact * 0.65);
}

/** 「此物已历三主：陆青玄（第12年）→ 沈云（第98年）→ 顾白（第203年）」 */
export function ownerLine(a) {
  const names = [];
  const days = [];
  const hist = a.history || [];
  for (let i = 0; i < hist.length; i += 1) {
    const [day, kind, who] = hist[i];
    if (!who || !TRANSFER_KINDS.has(kind)) continue;
    if (names[names.length - 1] === who) continue;
    names.push(who);
    days.push(day);
  }
  if (names.length <= 1) return { count: names.length, text: '' };
  const label = CN_NUM[names.length] || String(names.length);
  return {
    count: names.length,
    text: `此物已历${label}主：`
      + names.map((n, i) => `${n}（第${Math.floor(days[i] / 360) + 1}年）`).join(' → '),
  };
}

/** 一句话说清一件法宝（面板与编年史共用） */
export function describeArtifact(a) {
  const tier = (EQUIP_TIERS[a.tier] || {}).name || '?';
  const quality = EQUIP_QUALITIES[a.quality] || '?';
  const spirit = a.spirit ? `·${a.spirit.name}「${a.spirit.personality}」` : '';
  // 幽冥法宝（C 包）多一句「载某功法」——它是这件东西**来自幽冥**的唯一标记。
  const tech = (a.technique && a.technique.name) ? `·载${a.technique.name}` : '';
  return `${a.name}（${quality}${tier}${a.slot}${spirit}${tech}）`;
}

// ── 命名 ─────────────────────────────────────────────────

/**
 * 给一件新法宝取名。
 *
 * 凡品/灵品（tier <= 1）用**原作那种拼装名**——「精良灵品武器」。
 * 世界上多数东西本来就该是这么个没有名字的东西，这也让「有名有姓的法宝」显得稀有。
 *
 * 宝品以上（tier >= 2）有 35% 的概率从 ARTIFACT_NAMES 里挑一个说得通的铭名，
 * 且优先挑**当前没被占用**的（forge 不常发生，扫一遍无所谓）。
 * 器灵初生时必定补一个铭名——一件有器灵的东西不该还叫「绝品仙品武器」。
 */
export function artifactName(rng, slot, tier, quality, taken = null) {
  if (tier >= 2) {
    const pool = ARTIFACT_NAMES.filter((n) => n.slots.includes(slot));
    if (pool.length) {
      const free = taken ? pool.filter((n) => !taken.has(n.name)) : pool;
      const pick = free.length ? free : pool;
      return pickFrom(rng, pick).name;
    }
  }
  return `${EQUIP_QUALITIES[quality] || ''}${(EQUIP_TIERS[tier] || {}).name || ''}${slot}`;
}

/**
 * 这件东西有没有「铭名」。
 *
 * 判据是**名字不以品质字开头**——拼装名一定是「精良灵品武器」这样开头的，
 * 而铭名（星坠剑胎、太虚镜残片）不会。这比 `name.length <= 4` 可靠：
 * 「精良仙品法宝」是 6 个字，而「九转丹炉铭牌」也是 6 个字。
 */
export function hasProperName(a) {
  if (!a || !a.name) return false;
  for (let i = 0; i < EQUIP_QUALITIES.length; i += 1) {
    if (a.name.startsWith(EQUIP_QUALITIES[i])) return false;
  }
  return true;
}

/** 当前世界上已被占用的铭名。用于避免「星坠剑胎」同时出现三十把 */
function takenNames(world) {
  const set = new Set();
  const take = (a) => { if (hasProperName(a)) set.add(a.name); };
  for (let i = 0; i < (world.artifacts || []).length; i += 1) take(world.artifacts[i]);
  for (let i = 0; i < world.entities.length; i += 1) {
    const list = world.entities[i].artifacts;
    if (list) for (let k = 0; k < list.length; k += 1) take(list[k]);
  }
  return set;
}

// ── 内部小工具 ───────────────────────────────────────────

function pushHistory(a, day, kind, who) {
  a.history.push([day, kind, who || null]);
  if (a.history.length > HISTORY_CAP) a.history.splice(0, a.history.length - HISTORY_CAP);
}

/**
 * 地名标签。
 *
 * ⚠️ 这里刻意**自己写一份**，而不是从 sites.js 借 `placeLabel`——
 * sites.js 要用本文件的 `grantArtifact`（遗蜕里能捡到法宝），
 * 借过来就成了循环 import。循环 import 在 ESM 里能跑，但一旦有模块级 `const`
 * 参与就会踩 TDZ，是那种「今天没事、明天换个打包器就炸」的坑。
 * 代价只是四行重复，比留一个隐形炸弹便宜。
 */
function spotLabel(world, x, y) {
  const cx = clamp(Math.floor(x), 0, world.w - 1);
  const cy = clamp(Math.floor(y), 0, world.h - 1);
  const i = cy * world.w + cx;
  if (world.height[i] > 0.75) return '山中';
  if (world.veg[i] > 0.6) return '林间';
  if (world.riverBase[i] > 0) return '河畔';
  if (world.water[i] > 0.0015) return '海上';
  return '旷野';
}

/** 体修不修法宝（原作 DAO_PATHS 里体修的注：『不修法宝，只炼肉身』） */
function refusesArtifacts(e) {
  return Boolean(e.dao && e.dao.path && e.dao.path.key === 'body');
}

function canHold(e) {
  if (!e || e.hp <= 0) return false;
  if ((e.level || 0) < 1) return false;
  if (refusesArtifacts(e)) return false;
  return true;
}

function metric(world, key, by = 1) {
  if (!world.artifactLog) return;
  world.artifactLog[key] = (world.artifactLog[key] || 0) + by;
}

// ── 生命周期 ─────────────────────────────────────────────

/**
 * 炼成一件法宝。
 *
 * 品阶沿用原作的 tierRoll：`base = floor(level / 8)`，再按 22% / 7% 各掷一次加阶，
 * clamp 到 0..3（凡/灵/宝/仙）。品质沿用原作 planCraft 的阈值（0.12/0.3/0.6/0.85）。
 */
export function forgeArtifact(world, owner, rng, opts = {}) {
  const level = owner.level || 0;
  if (level < 6) return null;                       // 炼气中期以下，炼不出东西
  if (refusesArtifacts(owner)) return null;
  if (liveArtifactCount(world) >= LIVE_CAP) return null;

  const slot = opts.slot || pickFrom(rng, EQUIP_SLOTS);
  const tier = clamp(
    Math.floor(level / 8) + (rng() < 0.22 ? 1 : 0) + (rng() < 0.07 ? 1 : 0),
    0, EQUIP_TIERS.length - 1,
  );
  const q = rng();
  const quality = q < 0.12 ? 4 : q < 0.3 ? 3 : q < 0.6 ? 2 : q < 0.85 ? 1 : 0;
  // 只有宝品以上才掷铭名，而且要掷中那 35%——于是「有名字」本身就是个筛子
  const named = tier >= 2 && rng() < 0.35;
  const name = named
    ? artifactName(rng, slot, tier, quality, takenNames(world))
    : artifactName(rng, slot, tier, quality);

  const a = {
    id: world.nextArtifactId,
    slot,
    tier,
    quality,
    name,
    durability: MAX_DURABILITY,
    maxDurability: MAX_DURABILITY,
    scars: 0,
    forgedDay: world.day,
    forgedByName: owner.name || null,
    ownerId: owner.id,
    ownerName: owner.name || null,
    heldSince: world.day,
    spirit: null,
    history: [[world.day, 'forged', owner.name || null]],
    lostDay: -1,
    x: owner.x,
    y: owner.y,
  };
  world.nextArtifactId += 1;

  owner.artifacts = owner.artifacts || [];
  if (owner.artifacts.length >= ARTIFACT_CAP) {
    // 手上满了：炼出来就放地上，让别人去捡
    toGround(world, a, owner.x, owner.y);
  } else {
    owner.artifacts.push(a);
  }
  metric(world, 'forged');
  world.record(
    narrate(rng, 'artifactForged', { name: owner.name, place: spotLabel(world, owner.x, owner.y), artifact: a.name }),
    'artifact',
    owner,
  );
  return a;
}

/**
 * 从地上取走**指定的那一件**法宝（遗蜕上的奖励就是走这条路）。
 *
 * 取不到是完全正常的事，**不是错误**：遗蜕立在那儿的时候法宝还躺在地上，
 * 但可能已经先被路过的修士捡走、或者躺够三百年朽掉了。所以这里返回 null
 * 而不是抛错——「进去发现东西没了」本身就是沙盒里该有的故事。
 *
 * @returns {object|null} 取到的那件法宝（调用方要拿它写履历），取不到则 null
 */
export function claimGroundArtifact(world, entity, artifactId, rng, kind = 'found') {
  if (!artifactId) return null;
  const ground = world.artifacts || [];
  for (let i = 0; i < ground.length; i += 1) {
    const a = ground[i];
    if (a.id !== artifactId) continue;
    if (!giveTo(world, entity, a, rng, kind)) return null;
    ground.splice(i, 1);
    metric(world, 'found');
    return a;
  }
  return null;
}

/** 把一件法宝放回地上（无主） */export function toGround(world, a, x, y) {
  a.ownerId = 0;
  a.ownerName = null;
  a.lostDay = world.day;
  a.x = x;
  a.y = y;
  world.artifacts.push(a);
  // 地上满了就朽掉「躺得最久」的那件
  while (world.artifacts.length > GROUND_CAP) {
    let oldest = 0;
    for (let i = 1; i < world.artifacts.length; i += 1) {
      if (world.artifacts[i].lostDay < world.artifacts[oldest].lostDay) oldest = i;
    }
    world.artifacts.splice(oldest, 1);
    metric(world, 'decayed');
  }
  return a;
}

/**
 * 一件**幽冥法宝**（D6-3 工程包 C）携带的功法，交给新主人。
 *
 * 只有幽冥自生的法宝带 `technique`（见 `netherLife.js` 的 `spawnNetherItem`），
 * 凡间炼出的一律没有。所以「捡到一件带功法的法宝」= 「捡到一件幽冥之物」。
 *
 * ⚠️ **推池子里的那个对象**（见 `NETHER_TECHNIQUE_BY_NAME` 的注释）——现场拼
 *    一个同名字段的对象会让运行时与读档后的**键集分叉**，save-equiv 当场红。
 * ⚠️ 上限与 `divine.js` / `sites.js` 的 `< 3` 同源（`TECHNIQUE_CAP`）；已会的不重复推。
 * @returns {boolean} 是否真的习得（已会 / 满了 / 名字不认识 ⇒ false）
 */
function grantTechnique(entity, techName) {
  if (!techName) return false;
  const entry = NETHER_TECHNIQUE_BY_NAME.get(techName);
  if (!entry) return false;                        // 名字不在池子里（老档 / 手改档）
  const list = entity.techniques || (entity.techniques = []);
  if (list.length >= TECHNIQUE_CAP) return false;  // 功法栏满了
  if (list.some((t) => t && t.name === entry.name)) return false;   // 已会
  list.push(entry);
  return true;
}

/**
 * 把一件法宝交到某人手上。
 * @returns {boolean} 是否真的收下了（手上那件更好时会拒绝）
 */
export function giveTo(world, entity, a, rng, kind = 'gained') {
  if (!canHold(entity)) return false;
  entity.artifacts = entity.artifacts || [];
  if (entity.artifacts.length >= ARTIFACT_CAP) {
    // 挑出最弱的那件比一比。新的更弱就干脆不捡——「这把不如我手上的」
    let worst = 0;
    for (let i = 1; i < entity.artifacts.length; i += 1) {
      if (artifactPower(entity.artifacts[i]) < artifactPower(entity.artifacts[worst])) worst = i;
    }
    if (artifactPower(entity.artifacts[worst]) >= artifactPower(a)) return false;
    const dropped = entity.artifacts[worst];
    entity.artifacts.splice(worst, 1);
    toGround(world, dropped, entity.x, entity.y);
  }
  a.ownerId = entity.id;
  a.ownerName = entity.name || null;
  a.heldSince = world.day;
  a.lostDay = -1;
  pushHistory(a, world.day, kind, entity.name || null);
  entity.artifacts.push(a);
  // 幽冥法宝携带的功法：新主人当场习得（凡间法宝没有 `technique`，恒为 no-op）。
  // ⚠️ 放在**收下之后**：被拒（`return false`）时不该白送一门功法。
  if (a.technique) grantTechnique(entity, a.technique.name);
  return true;
}

/**
 * 遗物：人死了，身上的法宝去哪儿。
 *
 * 三种去处：
 *   一、**有器灵** → 它会主动挑下家（器灵认主，不会随便躺在地上）。
 *       够格的弟子/道侣优先，其次同门。
 *   二、**没器灵，但身边有弟子/道侣** → 由他们收起来。
 *       「徒弟收起了师父的剑」是这条路上最该发生的事，所以这里**不要求器灵**；
 *       但同门之间不会自动继承——没器灵的东西，同门凭什么替你收着。
 *   三、**没人要** → 落在地上，等路过的修士捡（`stepArtifacts` 里那趟拾取）。
 *
 * @returns {Array<{artifact: object, heir: object|null}>} 每件法宝的去向。
 *          `heir` 为 null 表示它落在了地上——调用方靠这个分辨
 *          「被人接走了」与「躺在原地等人捡」。
 */
export function dropArtifacts(world, entity, rng) {
  const list = entity.artifacts;
  if (!list || !list.length) return [];
  const moved = [];
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    const heir = findHeir(world, entity, rng, Boolean(a.spirit));
    if (heir && giveTo(world, heir, a, rng, 'inherited')) {
      metric(world, 'inherited');
      moved.push({ artifact: a, heir });
    } else {
      toGround(world, a, entity.x, entity.y);
      moved.push({ artifact: a, heir: null });
    }
  }
  entity.artifacts = [];
  return moved;
}

/** 找最近的接手人。有器灵的还会去找同门，没器灵的只认弟子/道侣 */
function findHeir(world, dead, rng, hasSpirit) {
  const R = 14;
  let mate = null;
  let mateDist = Infinity;
  let kin = null;
  let kinDist = Infinity;
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e === dead || !canHold(e)) continue;
    if ((e.artifacts || []).length >= ARTIFACT_CAP) continue;
    const d = Math.hypot(e.x - dead.x, e.y - dead.y);
    if (d > R) continue;
    const rel = dead.relations ? dead.relations.get(e.id) : null;
    if (rel && (rel.type === 'disciple' || rel.type === 'lover')) {
      if (d < mateDist) { mateDist = d; mate = e; }
    } else if (hasSpirit && e.faction && e.faction === dead.faction) {
      if (d < kinDist) { kinDist = d; kin = e; }
    }
  }
  // 距离越近越可能真的接手
  if (mate) return rng() < 1 - mateDist / R ? mate : null;
  if (kin) return rng() < 1 - kinDist / R ? kin : null;
  return null;
}

/**
 * 磨损。渡劫一次、杀人一次各扣一点，归零就出事。
 *
 * 有器灵的法宝**不会碎**：器灵会护住它，代价是留下一道永久的裂痕
 * （`scars`，每道 -20% 强度，最多 -50%）。这是器灵唯一的、也是最重要的机械收益——
 * 不然「器灵」就只是一段好看的字。
 */
export function wearArtifacts(world, entity, amount, rng) {
  const list = entity.artifacts;
  if (!list || !list.length) return;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const a = list[i];
    a.durability -= amount * (0.6 + rng() * 0.8);
    if (a.durability > 0) continue;
    if (a.spirit && (a.scars || 0) < SPIRIT_MAX_SCARS) {
      // 器灵接住了它。代价是一道永久的裂痕（每道 -20% 强度，最多 -50%）。
      // 裂痕**不写进履历**：履历的格子要留给「易主」。
      // 早先把 scar 也推进去，结果一件东西的履历被同一任主人的五道裂痕占满，
      // `ownerLine` 就再也说不出「它换过几个主人」了——而那正是这块的全部意义。
      a.scars = (a.scars || 0) + 1;
      a.durability = a.maxDurability * 0.3;
      world.record(
        `${a.name}在【${entity.name}】手中裂而未碎——${a.spirit.name}接住了它。`
        + `（第 ${a.scars} 道痕）`,
        'artifact',
        entity,
      );
    } else {
      const hadSpirit = Boolean(a.spirit);
      list.splice(i, 1);
      metric(world, 'broken');
      if (hadSpirit) metric(world, 'spiritLost');
      const rec = ownerLine(a).text;
      world.record(
        narrate(rng, 'artifactBreak', { name: entity.name, artifact: a.name, record: rec })
        + (hadSpirit ? `裂到第四道，${a.spirit.name}也没能再撑住。` : ''),
        'artifact',
        entity,
      );
    }
  }
}

/**
 * 器灵初生。
 *
 * 三个条件都看得见，都能在面板上验：
 *   一、宝品以上（tier >= 2）且精良以上（quality >= 2）——凡品相伴再久也只是把旧刀；
 *   二、当前主人已经带了 50 年（原作台词：「法宝相伴五十载后，器灵初生的征兆」）；
 *   三、还没有器灵。
 *
 * 器灵一醒，这件东西**必定有名有姓**（铭名池里补一个），
 * 并且从此能替主人挡三次碎裂（见 `SPIRIT_MAX_SCARS`）。
 */
function awakenSpirit(world, owner, a, rng) {
  const type = rollSpiritType(rng, a);
  const spirit = {
    id: type.id,
    name: type.name,
    personality: pickFrom(rng, type.personalities),
    memory: type.memory,
    awokenDay: world.day,
  };
  a.spirit = spirit;
  // 器灵一醒，这件东西必定有名有姓。一件有器灵的法宝还叫「绝品仙品武器」，
  // 是说不过去的——而且它接下来会进编年史、会被后人指着说，得有个名字。
  if (!hasProperName(a)) {
    a.name = artifactName(rng, a.slot, a.tier, a.quality, takenNames(world));
  }
  pushHistory(a, world.day, 'spirit', owner.name || null);
  metric(world, 'spirit');
  const held = Math.floor((world.day - a.heldSince) / 360);
  world.record(
    narrate(rng, 'artifactSpirit', {
      name: owner.name,
      artifact: a.name,
      trigger: type.trigger,
      held,
    }),
    'artifact',
    owner,
  );
  // 器灵初生发生在**持宝人手上**（本函数由 `stepArtifacts` 遍历 `e.artifacts` 时调用），
  // 这段自陈是持宝人当场听到的，故把持宝人 `owner` 记为当事人。
  world.record(`${spirit.name}自陈：${spirit.memory}`, 'artifact', owner);
  return spirit;
}

/** 认器灵：先按名字里的关键字（原作的做法），认不出就按槽位兜底 */
export function rollSpiritType(rng, a) {
  const name = a.name || '';
  const hits = ARTIFACT_SPIRITS.filter((s) => s.keywords.some((k) => name.includes(k)));
  if (hits.length) return pickFrom(rng, hits);
  const id = SLOT_SPIRIT[a.slot];
  return ARTIFACT_SPIRITS.find((s) => s.id === id) || ARTIFACT_SPIRITS[0];
}

/**
 * 静默地把身上的法宝全放回地上（一律 `toGround`，**不找人接手**）。
 *
 * ── 历史：它曾经是「神力抹除 / 雷击 / 陨石 / 瘟疫」的补丁 ──────
 * 那四处神力原本是 `world.entities.splice(...)` 把人**直接剪掉**，绕开 `onDeath`，
 * 于是身上的法宝随人一起静默消失。为了堵这个洞，才在这四条路径上补了本函数。
 *
 * ⚠️ **2026-09-21 起，那四处已不再 splice**：powers.js 改为只把 `hp` 置 0，
 * 由 `life.step()` 的清理循环走 `onDeath`（→ `rememberDead` / `recordDeath` /
 * `enterNether` / `dropArtifacts` / 关系清理）。所以那四条路径**不再需要本函数**，
 * 也**不该**再调它——`onDeath` 里的 `dropArtifacts` 是它的超集（多一层
 * 弟子/道侣继承），而两者都会清空 `entity.artifacts`，先 scatter 只会让
 * `dropArtifacts` 空转、白白丢掉继承。
 *
 * 现在**唯一的调用方**是 `rifts.js` 的 `leakToUpper`（跨位面泄漏，那条路径
 * 确实是不走 `onDeath` 的直接移除）。
 *
 * 长测那条「法宝不会凭空消失」（`造出 + 流入 === 在世 + 碎 + 朽 + 流出`）
 * 仍然守着这一类遗漏：它把「新加了一条直接移除路径却忘了处理法宝」变成一个
 * 会变红的断言，而不是一个永远查不出来的偏差。
 *
 * 刻意**不写编年史**：一场瘟疫能带走几百人，一人一条会把编年史刷穿。
 * 东西留在原地就够了，后面自会有人捡。
 *
 * @returns {number} 放下的件数
 */
export function scatterArtifacts(world, entity) {
  const list = entity.artifacts;
  if (!list || !list.length) return 0;
  for (let i = 0; i < list.length; i += 1) toGround(world, list[i], entity.x, entity.y);
  const n = list.length;
  entity.artifacts = [];
  return n;
}

/**
 * 飞升：东西留下。
 *
 * 不处理的话，飞升者的法宝会**随人一起凭空消失**——实体被移出 `entities`，
 * 而法宝是挂在它身上的。这是最典型的那种静默丢失：函数返回得干干净净，
 * 只是世界上少了东西，谁也不会发现。实测 600 年里有 41 件器灵法宝就这么没了
 * （116 件生出器灵，最后活着的只有 75 件，中间那 41 件既没碎、也没朽）。
 *
 * 处理方式也是最合题的一种：**全留在原地**。飞升之地于是成了地图上最值得去
 * 的地方——那里躺着一个飞升者带不走的东西。
 *
 * @returns {number} 留下的件数
 */
export function leaveArtifacts(world, entity, rng) {
  const list = entity.artifacts;
  if (!list || !list.length) return 0;
  const names = [];
  for (let i = 0; i < list.length; i += 1) {
    names.push(list[i].name);
    toGround(world, list[i], entity.x, entity.y);
  }
  entity.artifacts = [];
  metric(world, 'left', list.length);
  world.record(
    `【${entity.name}】飞升，${names.join('、')}留在原地。带不走的，就留给后来人。`,
    'artifact',
    entity,
  );
  return names.length;
}

// ── 每 tick 推进 ─────────────────────────────────────────

/** 世界上现在有多少件法宝（在手的 + 躺地上的） */
export function liveArtifactCount(world) {
  let n = (world.artifacts || []).length;
  const list = world.entities;
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i].artifacts;
    if (a) n += a.length;
  }
  return n;
}

/**
 * 法宝的时钟：器灵初生、地上朽坏、路人拾取。
 *
 * ⚠️ 不要在这里放模块级的累加器来节流。这一趟每 90 游戏日跑一次，判据是
 * `world.day % 90 < dtDays`——**完全由 `world.day` 推出来**，因此读档后
 * 两条世界线仍然同步。写成模块级计数器的话，同一个进程里两个世界会互相
 * 拨快对方的钟，`inkbox-save-equiv` 的「继续演化」那一段会莫名其妙地分叉。
 */
export function stepArtifacts(world, dtDays, rng) {
  if (world.day % SWEEP_PERIOD_DAYS >= dtDays) return;

  const ground = world.artifacts || (world.artifacts = []);

  // 一、器灵初生
  const bondDays = SPIRIT_BOND_YEARS * 360;
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    const list = e.artifacts;
    if (!list || !list.length) continue;
    for (let k = 0; k < list.length; k += 1) {
      const a = list[k];
      if (a.spirit) continue;
      if ((a.tier || 0) < SPIRIT_MIN_TIER) continue;
      if ((a.quality || 0) < SPIRIT_MIN_QUALITY) continue;
      if (world.day - a.heldSince < bondDays) continue;
      awakenSpirit(world, e, a, rng);
    }
  }

  // 二、地上朽坏
  const decayDays = GROUND_DECAY_YEARS * 360;
  for (let i = ground.length - 1; i >= 0; i -= 1) {
    const a = ground[i];
    if (a.lostDay < 0) continue;
    if (world.day - a.lostDay < decayDays) continue;
    ground.splice(i, 1);
    metric(world, 'decayed');
    // 无单一当事人：这是法宝**在地上朽坏**，早已无主，作用域里没有任何实体，
    // 故不传 actors（不要拿 `a`——法宝不是实体）。
    world.record(
      narrate(rng, 'artifactDecay', { artifact: a.name, place: spotLabel(world, a.x, a.y) }),
      'artifact',
    );
  }

  // 三、拾取。一件法宝每次扫描有 12% 的概率被附近的人捡走。
  //
  // 这个数压得比「一次就捡走」低得多，是为了让**「躺在地上」这个状态看得见**：
  // 早期取 0.4 时，实测地上常年是 0 件——人一死东西当场就没了，
  // 「遗蜕里那件法宝」永远已经被先到的人取走，`GROUND_DECAY_YEARS`
  // 那条朽坏规则也成了死代码。取 0.12 时一件东西平均要躺两年多才有人捡，
  // 地图上于是真的会有「无主的旧物」这种状态。
  for (let i = ground.length - 1; i >= 0; i -= 1) {
    const a = ground[i];
    if (rng() > 0.12) continue;
    const taker = findTaker(world, a, rng);
    if (!taker) continue;
    ground.splice(i, 1);
    if (!giveTo(world, taker, a, rng, 'found')) {
      // 收不下就放回去（giveTo 里挑不出更好的那件时会返回 false）
      ground.push(a);
      continue;
    }
    metric(world, 'found');
    const rec = ownerLine(a).text;
    world.record(
      narrate(rng, 'artifactFound', {
        name: taker.name, artifact: a.name,
        place: spotLabel(world, a.x, a.y), record: rec,
      }),
      'artifact',
      taker,
    );
  }
}

function findTaker(world, a, rng) {
  const R = 12;
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (!canHold(e)) continue;
    if ((e.artifacts || []).length >= ARTIFACT_CAP) continue;
    const d = Math.hypot(e.x - a.x, e.y - a.y);
    if (d < R && d < bestDist) { bestDist = d; best = e; }
  }
  if (!best) return null;
  return rng() < 1 - bestDist / R ? best : null;
}

// ── 统计 ─────────────────────────────────────────────────

/** 长测与面板用的读数 */
export function artifactStats(world) {
  let onPeople = 0;
  let spirits = 0;
  let scarred = 0;
  let travelled = 0;      // 换过三手以上
  let best = null;
  let bestPower = 0;
  for (let i = 0; i < world.entities.length; i += 1) {
    const list = world.entities[i].artifacts;
    if (!list) continue;
    for (let k = 0; k < list.length; k += 1) {
      const a = list[k];
      onPeople += 1;
      if (a.spirit) spirits += 1;
      if (a.scars) scarred += 1;
      const owners = ownerLine(a).count;
      if (owners >= 3) travelled += 1;
      const p = artifactPower(a);
      if (p > bestPower) { bestPower = p; best = { a, owner: world.entities[i] }; }
    }
  }
  const ground = (world.artifacts || []).length;
  return {
    onPeople,
    ground,
    live: onPeople + ground,
    spirits,
    scarred,
    travelled,
    best,
    log: world.artifactLog || {},
  };
}

export { SLOT_PROFILE, NO_BONUS };
