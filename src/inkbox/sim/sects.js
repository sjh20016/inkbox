// 水墨沙盒 · 宗门
//
// 沙盒里没有「国家」，只有宗门。宗门拥有聚落、占据灵脉、互相征伐，
// 也会因为后继无人而散伙。
//
// 结构沿用原来的 factions 数组（World 里 faction 就是宗门），
// 这样村落归属、owner 层、外交这些既有逻辑不用推倒重来，
// 只是给每个 faction 补上宗门该有的字段与行为。
//
// 数值来源：
//   sectSystem.js:88-135   normalizeSect 的字段
//   sectSystem.js:9        五宗旨
//   sectSystem.js:296-303  地形加成 sanctum3.2 / vein2.1 / ruin1.4
//   sectSystem.js:381      容量 = 10 + 声望/4
//   sectSystem.js:311      外交阈值 ≤-28 敌对 / ≥26 结盟
//   strategicRegionSystem.js  灵脉争夺与冲突判定

import { FACTION_COLORS, LIMITS } from '../core/config.js';
import {
  SECT_DOCTRINES, SECT_NAMES, generateSectName, narrate, pickFrom,
} from '../core/lore.js';
import { speak } from './busanzi.js';
import { clamp } from '../core/noise.js';
import {
  computeTerritory, crossedBoundary, cellOf, leylineAllowance,
} from './territory.js';

/** 外交阈值。来源 sectSystem.js:311 */
export const RIVAL_THRESHOLD = -28;
export const ALLIED_THRESHOLD = 26;

/** 长老的最低境界。来源 sectSystem.js:350 */
export const ELDER_MIN_LEVEL = 20;

/** 声望上限与容量公式 */
export const SECT_CAPACITY_BASE = 10;

export function sectCapacity(sect) {
  return Math.floor(SECT_CAPACITY_BASE + sect.reputation / 4);
}

/** 开宗立派。founder 若为空则为「无主之地自生」的宗门 */
export function foundSect(world, x, y, founder, rng) {
  if (world.factions.length >= LIMITS.maxFactions) return null;

  const element = founder && founder.root
    ? founder.root.elements[0]
    : pickFrom(rng, ['金', '木', '水', '火', '土']);
  const taken = new Set(world.factions.map((f) => f.name));
  const name = generateSectName(rng, element, taken);
  const doctrine = SECT_DOCTRINES[Math.floor(rng() * SECT_DOCTRINES.length)];
  const palette = FACTION_COLORS[world.factions.length % FACTION_COLORS.length];

  const sect = {
    id: world.nextFactionId,
    name,
    color: palette.color,
    accent: palette.accent,
    element,
    doctrine,

    villages: [],
    pop: 0,
    followers: 0,
    kills: 0,
    war: new Set(),

    // 山门（立派之处）。地盘不在这里存——它是推导量，
    // 每三十天由代价洪泛按地形重算一次，见 sim/territory.js。
    capitalX: x,
    capitalY: y,

    founderId: founder ? founder.id : 0,
    founderName: founder ? founder.name : '无名',
    leaderId: founder ? founder.id : 0,
    leaderName: founder ? founder.name : '无名',
    elders: [],

    reputation: 30,
    stability: 70,
    resources: { spiritStone: 20, heritage: 5, provisions: 30 },
    leylines: [],

    relations: new Map(),
    history: [],
    foundedDay: world.day,
    destroyedDay: -1,
    destroyReason: null,
    lastConflictDay: -1e9,
    claim: null,
  };

  world.nextFactionId += 1;
  world.factions.push(sect);

  if (founder) {
    founder.faction = sect.id;
    founder.foundedSect = sect.id;
  }
  sect.history.push({ day: world.day, text: '开宗' });
  // 开宗立派是「世界从散修变成有门派」的那一步，进大事账本。
  world.milestone(
    narrate(rng, 'sectFound', {
      place: placeOf(world, x, y),
      name,
      founder: sect.founderName,
      doctrine: doctrine.name,
    }),
    'sect',
    founder,
  );
  return sect;
}

/** 用一个像样的地名代替坐标 */
export function placeOf(world, x, y) {
  const i = clamp(Math.floor(y), 0, world.h - 1) * world.w + clamp(Math.floor(x), 0, world.w - 1);
  const h = world.height[i];
  if (h > 0.85) return '雪峰之下';
  if (h > 0.7) return '山南';
  if (h > 0.58) return '乱石岗';
  if (world.riverBase[i] > 0) return '河湾';
  if (world.veg[i] > 0.6) return '林麓';
  if (h < 0.34) return '水滨';
  return '原上';
}

/**
 * 以 (cx,cy) 为中心向外找一格可立山门的地，找不到返回 null。
 *
 * 为什么不能直接用脚下的格子：玩家多半点在村子上，而村子中心有祠堂、
 * 周围是屋舍，`isBuildable` 一律为假；修士自己也会被灵气吸着往山巅走，
 * 而山巅（山 / 峻岭 / 雪峰）同样不可建。所以凡是要「立山门」的地方，
 * 都得先在附近螺旋找一块空地。
 */
export function findBuildableNear(world, cx, cy, maxR) {
  for (let r = 0; r <= maxR; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= world.w - 1 || y >= world.h - 1) continue;
        if (world.isBuildable(world.idx(x, y))) return [x, y];
      }
    }
  }
  return null;
}

// ── 每步推进 ─────────────────────────────────────────────
export function stepSects(world, life, dtDays, rng) {
  const sects = world.factions;

  // ⚠️ 开宗必须排在早退之前。
  // 之前把 maybeFoundSect 放在 `if (!sects.length) return` 后面，于是「没有宗门
  // 就不扫开宗、不扫开宗就永远没有宗门」——四百年下来一个门派都开不出来，
  // 世界从生到灭全是散修。宗门为 0 的时候，恰恰最需要开宗。
  maybeFoundSect(world, life, rng);
  if (!sects.length) return;

  // 人口与资源。
  //
  // `pop` 只数修士（原作里宗门人数指的就是修士），`followers` 才是名下所有活人。
  // 早先把两者混为一谈，于是一个下辖一座村子的门派「人口」就有五十，
  // 而容量公式是 10 + 声望/4（撑死三十几），稳定度必然长期为零。
  for (let i = 0; i < sects.length; i += 1) {
    const s = sects[i];
    s.pop = 0;
    s.followers = 0;
  }
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (!e.faction) continue;
    const s = world.factionById(e.faction);
    if (!s) continue;
    s.followers += 1;
    if ((e.level || 0) > 0) s.pop += 1;
  }

  for (let i = sects.length - 1; i >= 0; i -= 1) {
    const s = sects[i];
    stepOneSect(world, s, dtDays, rng);
    if (s.destroyedDay >= 0) {
      sects.splice(i, 1);
    }
  }

  stepTerritory(world, dtDays);
  stepConflicts(world, rng);
}

/**
 * 开宗立派。
 *
 * 「立村时顺手开宗」这条路其实走不通：村子是在开天辟地头几年立起来的，
 * 那会儿谁也还没到筑基，于是宗门迟迟开不出来——实测八百年只出了一个。
 * 宗门得让散修自己开：每隔二十年看一眼，境界最高、尚无归属的筑基修士，
 * 若山门附近没有别的门派，就让他立宗。
 *
 * 触发用 world.day 的相位判断，不额外记状态，存档读档也不会漂。
 */
const SECT_FOUND_PERIOD_DAYS = 20 * 360;
export const SECT_FOUNDER_MIN_LEVEL = 10;
/** 门史保留的条数上限（开宗、继任、接掌这些大事，不必无限积攒） */
export const SECT_HISTORY_CAP = 32;

/**
 * 宗门在领地之外还能伸手争夺灵脉的距离。
 *
 * ⚠️ 这个常量已经删掉了，连同 `MAX_LEYLINES_PER_SECT`。
 *
 * 它们是为「圆形领地」打的补丁：圆够不着山巅的灵脉，于是把半径外扩 52 格；
 * 外扩之后又怕一家吃干，于是再加一个「每门限两条」。
 * 两个补丁都在治标。现在换成地形感知的代价洪泛（见 sim/territory.js），
 * 「够不够得着」由「翻过那道岭要花多少代价」自己回答，
 * 「能守几道」由门力算（leylineAllowance）。补丁自然消失。
 */

function maybeFoundSect(world, life, rng) {
  if (world.factions.length >= LIMITS.maxFactions) return null;
  if (world.day % SECT_FOUND_PERIOD_DAYS >= 360) return null;

  const candidates = [];
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.faction || !e.root) continue;
    if ((e.level || 0) < SECT_FOUNDER_MIN_LEVEL) continue;
    candidates.push(e);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.level || 0) - (a.level || 0));

  for (let k = 0; k < Math.min(3, candidates.length); k += 1) {
    const founder = candidates[k];
    const tx = Math.floor(founder.x);
    const ty = Math.floor(founder.y);
    if (life.factionNear(tx, ty, 24)) continue;      // 别人山门就在边上，不必另立
    if (!world.isBuildable(life.tileAt(tx, ty))) continue;
    const sect = foundSect(world, tx, ty, founder, rng);
    if (!sect) continue;

    // 山门附近的村子与人，一并归到门下
    for (let m = 0; m < world.villages.length; m += 1) {
      const v = world.villages[m];
      if (v.faction) continue;
      if (Math.hypot(v.x - tx, v.y - ty) > 26) continue;
      v.faction = sect.id;
      if (!sect.villages.includes(v.id)) sect.villages.push(v.id);
      for (let n = 0; n < world.entities.length; n += 1) {
        const o = world.entities[n];
        if (o.village === v.id && !o.faction) o.faction = sect.id;
      }
    }
    return sect;
  }
  return null;
}

function stepOneSect(world, sect, dtDays, rng) {
  const cap = sectCapacity(sect);

  // 资源：灵脉与聚落产出
  let income = sect.villages.length * 0.4;
  for (let k = 0; k < sect.leylines.length; k += 1) {
    const l = world.leylineById(sect.leylines[k]);
    if (l) income += 1.6 * l.strength;
  }
  sect.resources.spiritStone = clamp(sect.resources.spiritStone + income * dtDays * 0.02, 0, 9999);
  sect.resources.provisions = clamp(sect.resources.provisions + sect.villages.length * dtDays * 0.03, 0, 9999);

  // 声望：人多势众则涨，灵脉多则涨，战败则跌
  const want = Math.min(1, sect.pop / Math.max(1, cap));
  sect.reputation = clamp(sect.reputation + (want - 0.45) * dtDays * 0.012, 0, 100);

  // 稳定度：人多而资源少则不稳
  const strain = sect.pop > cap ? (sect.pop - cap) * 0.02 : 0;
  const starving = sect.resources.provisions < sect.pop * 0.3 ? 0.05 : 0;
  sect.stability = clamp(sect.stability - (strain + starving) * dtDays * 0.1 + dtDays * 0.01, 0, 100);

  // 掌门与长老
  refreshLeadership(world, sect);

  // 掌门陨落 → 传承或解散
  if (sect.leaderId && !world.entities.some((e) => e.id === sect.leaderId)) {
    const heir = pickHeir(world, sect);
    if (heir) {
      sect.leaderId = heir.id;
      sect.leaderName = heir.name;
      heir.faction = sect.id;
      sect.history.push({ day: world.day, text: `${heir.name} 继任掌门` });
      world.record(`${sect.name} 掌门之位由 ${heir.name} 继任。`, 'sect', heir);
    } else if (sect.pop <= 1) {
      dissolveSect(world, sect, '后继无人', rng);
      return;
    }
  }

  // 无主之地：弟子足够多且没有掌门时自行立宗
  if (!sect.leaderId && sect.pop >= 2) {
    const candidate = strongestMember(world, sect);
    if (candidate) {
      sect.leaderId = candidate.id;
      sect.leaderName = candidate.name;
    }
  }

  // 声望见底 + 人少 → 散伙
  if (sect.pop < 2 && sect.villages.length === 0 && world.day - sect.foundedDay > 720) {
    dissolveSect(world, sect, '门中无人', rng);
  }

  // 门庭过盛 → 弟子出走
  maybeShed(world, sect, dtDays, rng);

  // 门史封顶。三个写入点（开宗 / 继任 / 接掌）散在各处，逐个加判断容易漏；
  // 放在这里每 tick 都会走到，最稳妥。
  //
  // 位置有讲究：必须在函数**末尾**，不能挪到开头。开头封顶的话，
  // 本 tick 接着 push 的一两条会让条数冲到 34，于是「世界里有多少条」
  // 和「上限是多少」永远对不齐，长测里那条 `history.length <= 32` 的断言
  // 也就只能放宽成 34——把一个本该精确的不变量变成一句含糊话。
  // 放末尾，不变量才是干净的 ≤ SECT_HISTORY_CAP。
  if (sect.history.length > SECT_HISTORY_CAP) {
    sect.history.splice(0, sect.history.length - SECT_HISTORY_CAP);
  }
}

/**
 * 弟子出走。
 *
 * 宗门容量是 10 + 声望/4，撑死不过三十几人；可现实里一个门派常常吸走
 * 一百多号人，于是稳定度一路跌到 0，却什么也不会发生——大而不倒。
 * 这里让它散：人满为患、又压不住场面时，门中会有一位金丹修士带着
 * 一批弟子另立山门。
 *
 * 这也是宗门数量增长的第二个来源。只靠「散修开宗」一条路，
 * 世界会长期只有两三个门派。
 */
const SHED_PER_DAY = 0.0006;

function maybeShed(world, sect, dtDays, rng) {
  if (world.factions.length >= LIMITS.maxFactions) return;
  const cap = sectCapacity(sect);
  if (sect.pop <= cap * 1.4) return;
  if (sect.stability > 45) return;
  if (rng() >= SHED_PER_DAY * dtDays) return;

  // 带头出走的人：门中境界最高、又不是掌门的那位
  let leader = null;
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.faction !== sect.id || e.id === sect.leaderId) continue;
    if ((e.level || 0) < ELDER_MIN_LEVEL) continue;
    if (!leader || (e.level || 0) > (leader.level || 0)) leader = e;
  }
  if (!leader) return;

  // 山门必须落在能站人的地上。
  //
  // ⚠️ 原先直接拿带头出走者脚下的格子当山门，而修士会被灵气吸着往山巅走、
  // 灵脉又在山巅——实测三百年的世界里，有三家宗门把山门立在了「峻岭」上：
  // 那一格连自己都走不出去（四邻全是山），代价洪泛只能罩住孤零零一格，
  // 于是这三家永远长不出势力范围，地图上也永远没有它们的位置。
  const spot = findBuildableNear(world, Math.floor(leader.x), Math.floor(leader.y), 8);
  if (!spot) return;
  const [tx, ty] = spot;

  // 先点人再立宗：否则没人跟去时还要回滚 factions / nextFactionId / founder.faction
  const followers = [];
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.faction !== sect.id || e.id === sect.leaderId || e === leader) continue;
    if (Math.hypot(e.x - tx, e.y - ty) > 16) continue;
    followers.push(e);
    if (followers.length >= 24) break;
  }
  if (followers.length < 3) return;

  const schism = foundSect(world, tx, ty, leader, rng);
  if (!schism) return;
  for (let i = 0; i < followers.length; i += 1) followers[i].faction = schism.id;

  world.milestone(`${schism.name} 自 ${sect.name} 分出，${leader.name} 自立山门。`, 'sect', leader);
  if (rng() < 0.4) speak(world, rng, 'watch');
}

/** 掌门 = 门中境界最高者；长老 = 达到 ELDER_MIN_LEVEL 的成员 */
function refreshLeadership(world, sect) {
  const members = [];
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.faction === sect.id) members.push(e);
  }
  if (!members.length) {
    sect.elders = [];
    return;
  }
  members.sort((a, b) => (b.level || 0) - (a.level || 0));
  sect.elders = members.filter((e) => (e.level || 0) >= ELDER_MIN_LEVEL).map((e) => e.id).slice(0, 8);
  const best = members[0];
  if (best && (!sect.leaderId || (best.level || 0) > 0)) {
    // 境界高出一截就换掌门——修仙界以力为尊
    const current = world.entities.find((e) => e.id === sect.leaderId);
    if (!current || (best.level || 0) >= (current.level || 0) + 3) {
      if (sect.leaderId && sect.leaderId !== best.id) {
        sect.history.push({ day: world.day, text: `${best.name} 接掌` });
      }
      sect.leaderId = best.id;
      sect.leaderName = best.name;
    }
  }
}

function strongestMember(world, sect) {
  let best = null;
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.faction !== sect.id) continue;
    if (!best || (e.level || 0) > (best.level || 0)) best = e;
  }
  return best;
}

function pickHeir(world, sect) {
  const members = [];
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.faction === sect.id) members.push(e);
  }
  if (!members.length) return null;
  members.sort((a, b) => (b.level || 0) - (a.level || 0));
  return members[0];
}

// ── 领地与灵脉 ───────────────────────────────────────────
//
// 地盘不再是圆，而是**地形感知的代价洪泛**（见 sim/territory.js）。
// 每 TERRITORY_PERIOD_DAYS 游戏日重算一次：从各家的山门、名下村子、
// 已镇守的灵脉出发往四周扩张，进一格的代价由地表肥力与坡度决定，
// 水域与山脊直接不可通行——于是地盘自然顺着河谷长、被山脊挡住。
//
// 时机必须是 world.day 的纯函数（crossedBoundary），不能靠「上次算是什么时候」
// 这种计数器：重算会带来收编村子、认领灵脉这些**真实的状态改动**，
// 于是「连续跑」与「存档再读档」两条分叉必须落在同一天重算，否则等价就破了。

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 重算势力图并把结果落到世界上 */
function stepTerritory(world, dtDays) {
  if (!crossedBoundary(world.day, dtDays)) return;

  const terr = computeTerritory(world);

  // 接壤与占地留给 stepConflicts —— 它每 tick 都要跑，
  // 不能每 tick 重算一次势力图（那是 O(格子数 × 门派数)）。
  world._terrArea = terr.area;
  world._terrBorder = terr.border;
  world._terrBorderAt = terr.borderAt;
  world._terrContested = terr.contested;

  applyLeylineClaims(world, terr.claims);
  absorbVillages(world, terr.owner);
}

/**
 * 认领灵脉。
 *
 * 「够不够得着」由代价洪泛算出来（territory.js），这里只负责落账：
 * 换主、记一笔编年史。
 *
 * 「够不着就放手」是**故意的**：门派衰败、或者玩家把山挖断了路，
 * 远方的灵脉就该丢。有了这一条，「地盘萎缩」才真的会疼。
 */
function applyLeylineClaims(world, claims) {
  for (let i = 0; i < world.leylines.length; i += 1) {
    const l = world.leylines[i];
    const want = claims.get(l.id) || 0;
    if (want === l.owner) continue;
    if (l.owner) {
      const prev = world.factionById(l.owner);
      if (prev) prev.leylines = prev.leylines.filter((id) => id !== l.id);
    }
    l.owner = want;
    if (!want) continue;
    const s = world.factionById(want);
    if (!s) continue;
    if (!s.leylines.includes(l.id)) s.leylines.push(l.id);
    if (!l.discovered) {
      l.discovered = true;
      world.record(`${s.name} 在${placeOf(world, l.x, l.y)}探得一道灵脉。`, 'sect', world.entities.find((e) => e.id === s.leaderId));
    }
  }
}

/** 某坐标归谁：先看本格，本格无主就看四邻 */
function ownerAt(world, owner, x, y) {
  const c = cellOf(world, x, y);
  if (owner[c]) return owner[c];
  for (let k = 0; k < 4; k += 1) {
    const n = owner[cellOf(world, x + DIRS4[k][0], y + DIRS4[k][1])];
    if (n) return n;
  }
  return 0;
}

/**
 * 无主的村子会被地盘盖到它头上的宗门收编。
 *
 * 村子与宗门是分开立的（立村不必先有宗门），所以需要这一步把它们接起来。
 * 判据从「落在谁的圆里」换成了「落在谁的格子上」——洪泛的边界本身就沿着
 * 山川走，于是「哪座村子归谁」也跟着地理走，而不是被一道圆弧切过去。
 */
function absorbVillages(world, owner) {
  for (let i = 0; i < world.villages.length; i += 1) {
    const v = world.villages[i];
    if (v.faction) continue;
    const id = ownerAt(world, owner, v.x, v.y);
    if (!id) continue;
    const s = world.factionById(id);
    if (!s) continue;
    v.faction = s.id;
    if (!s.villages.includes(v.id)) s.villages.push(v.id);
    for (let m = 0; m < world.entities.length; m += 1) {
      const e = world.entities[m];
      if (e.village === v.id && !e.faction) e.faction = s.id;
    }
    // 无单一当事人：这条讲的是一个**村落**归附，`v` 是村落对象而非实体，
    // 归附的村民是多人且并非同一个当事人，故不传 actors（详见 record 的第三参约定）。
    world.record(`${v.name} 归入${s.name}门下。`, 'sect');
  }
}

// ── 冲突 ─────────────────────────────────────────────────
function stepConflicts(world, rng) {
  const sects = world.factions;
  // 接壤表与占地表由 stepTerritory 每三十天算好（见 territory.js）。
  // 这一支每 tick 都要跑，绝不能自己重算势力图。
  const area = world._terrArea || new Map();
  const border = world._terrBorder || new Map();
  const borderAt = world._terrBorderAt || new Map();
  // 「两家都伸得着」的灵脉。注意判据是**够得着**，不是**持有**——
  // 一条灵脉只有一个主人，两家的持有清单永远不可能有交集，
  // 原先那句 `a.leylines.some((id) => b.leylines.includes(id))` 恒为假，
  // 于是「抢同一道灵脉会显著加剧敌意」这条规则从来没生效过。
  const contestedSet = world._terrContested || new Set();
  for (let i = 0; i < sects.length; i += 1) {
    const a = sects[i];
    // 有地盘的才谈得上接壤。原先判的是「有没有村子」，
    // 现在直接看洪泛出来的占地格数——一个村子也没占住的门派，
    // 地图上连一片色都没有，自然谈不上跟谁摩擦。
    if (!area.get(a.id)) continue;
    for (let j = i + 1; j < sects.length; j += 1) {
      const b = sects[j];
      if (!area.get(b.id)) continue;

      // 接壤长度代替圆重叠。三十格封顶——再长也不会更恨对方了。
      const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      const overlap = Math.min(1, (border.get(key) || 0) / 30);
      // 起兵处：取接壤格之一；两家还没挨上就退回两座山门的中点
      const at = borderAt.get(key);
      const borderX = at === undefined ? (a.capitalX + b.capitalX) / 2 : (at % world.w) + 0.5;
      const borderY = at === undefined ? (a.capitalY + b.capitalY) / 2 : Math.floor(at / world.w) + 0.5;
      // 手里那道灵脉若还有别人伸得着，就是争端之源
      const contested = a.leylines.some((id) => contestedSet.has(id)) ? 0.5 : 0;

      const score = a.relations.get(b.id) || 0;
      const tension = overlap * 40 + contested * 40 + Math.max(0, -score) * 0.6;

      const atWar = a.war.has(b.id);
      if (!atWar && tension > 48 && rng() < 0.02) {
        a.war.add(b.id);
        b.war.add(a.id);
        a.relations.set(b.id, clamp(score - 25, -100, 100));
        b.relations.set(a.id, clamp((b.relations.get(a.id) || 0) - 25, -100, 100));
        // 起兵的地方取接壤处的一格——比「两个圆心连线的中点」实在得多，
        // 后者常常落在一片谁也不挨着的水面上。
        world.record(
          narrate(rng, 'war', { a: a.name, b: b.name, place: placeOf(world, borderX, borderY) }),
          'war',
          // 双方宗主实体（a / b 是宗门对象，不是实体）。任一方查不到宗主时该侧为
          // undefined，record 会自行过滤，不会硬凑。
          [
            world.entities.find((e) => e.id === a.leaderId),
            world.entities.find((e) => e.id === b.leaderId),
          ],
        );
        continue;
      }

      if (atWar && rng() < 0.03) {
        resolveConflict(world, a, b, rng);
      } else if (!atWar) {
        // 平时关系缓慢回归中立，地缘相近则缓慢恶化
        const drift = (overlap * 6 + contested * 8 - 2) * 0.01;
        a.relations.set(b.id, clamp(score - drift, -100, 100));
        b.relations.set(a.id, clamp((b.relations.get(a.id) || 0) - drift, -100, 100));
      }
    }
  }
}

/**
 * 一场冲突的胜负。来源 strategicRegionSystem.js:299
 *   score = 影响力 + 天命加成 + 助拳 + rand*12
 */
function resolveConflict(world, a, b, rng) {
  const power = (s) => s.reputation * 0.6 + s.pop * 1.4 + s.stability * 0.2 + (s.leylines.length * 8);
  const sa = power(a) + rng() * 12;
  const sb = power(b) + rng() * 12;
  const winner = sa >= sb ? a : b;
  const loser = winner === a ? b : a;

  winner.reputation = clamp(winner.reputation + 6, 0, 100);
  winner.stability = clamp(winner.stability + 3, 0, 100);
  loser.reputation = clamp(loser.reputation - 3, 0, 100);
  loser.stability = clamp(loser.stability - 8, 0, 100);

  // 夺一道灵脉
  if (loser.leylines.length) {
    const taken = loser.leylines[0];
    loser.leylines.shift();
    winner.leylines.push(taken);
    const l = world.leylineById(taken);
    if (l) l.owner = winner.id;
    world.record(`${winner.name} 从 ${loser.name} 手中夺走一道灵脉。`, 'war', [
      world.entities.find((e) => e.id === winner.leaderId),
      world.entities.find((e) => e.id === loser.leaderId),
    ]);
  }

  winner.war.delete(loser.id);
  loser.war.delete(winner.id);
  winner.relations.set(loser.id, clamp((winner.relations.get(loser.id) || 0) - 10, -100, 100));
  loser.relations.set(winner.id, clamp((loser.relations.get(winner.id) || 0) - 30, -100, 100));
  world.record(`${winner.name} 与 ${loser.name} 一战，${loser.name} 退走。`, 'war', [
    world.entities.find((e) => e.id === winner.leaderId),
    world.entities.find((e) => e.id === loser.leaderId),
  ]);

  // 败方若元气大伤，就此散伙
  if (loser.stability < 12 && loser.pop < 4) {
    dissolveSect(world, loser, '战败溃散', rng);
  }
}

/** 散伙：房屋成废墟，门人散去 */
export function dissolveSect(world, sect, reason, rng) {
  if (sect.destroyedDay >= 0) return;
  sect.destroyedDay = world.day;
  sect.destroyReason = reason;

  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if (e.faction === sect.id) {
      e.faction = 0;
      e.foundedSect = 0;
    }
  }
  // 村落失去归属
  for (let k = 0; k < sect.villages.length; k += 1) {
    const v = world.villageById(sect.villages[k]);
    if (v) v.faction = 0;
  }
  // 灵脉放开
  for (let k = 0; k < sect.leylines.length; k += 1) {
    const l = world.leylineById(sect.leylines[k]);
    if (l && l.owner === sect.id) l.owner = 0;
  }
  sect.leylines = [];
  sect.war.clear();

  // 解散前宗主可能仍在世（例如战败溃散），能查到就把当事人记到其传记上；
  // 若宗门因「后继无人」而散，宗主实体早已不在 world.entities，find 返回 undefined，
  // record 会自行过滤，这里不硬凑。
  // 宗门覆灭是**不可逆**的（散了的山门不会再回来），进大事账本。
  world.milestone(`${sect.name} 因${reason}而散。山门犹在，人已不归。`, 'sect', world.entities.find((e) => e.id === sect.leaderId));
  if (rng && rng() < 0.35) speak(world, rng, 'watch');
}

/** 宗门之间是否敌对 / 结盟 */
export function relationOf(world, a, b) {
  if (a.war.has(b.id)) return 'war';
  const score = a.relations.get(b.id) || 0;
  if (score <= RIVAL_THRESHOLD) return 'rival';
  if (score >= ALLIED_THRESHOLD) return 'allied';
  return 'neutral';
}

export { SECT_NAMES, SECT_DOCTRINES };
