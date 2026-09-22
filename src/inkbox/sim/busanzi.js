// 卜算子：天道引路人。
//
// 原作里他是玩家（天道）的引路人，半文半白带市井痞气，自称「小爷我」。
// 台词、亲缘阶梯、自称全部照搬 src/data/busanziDialogues.js，一字未改。
//
// 迁移到沙盒后要解决一个问题：**他的声音被淹掉了。**
// 台词本来就走 world.record(..., 'busanzi') 进编年史，可编年史一屏只显示四十条，
// 而世界每几秒就产出突破、天劫、因果、秘境……卜算子那句「看好了，这一劫不是
// 小爷我给的，是他自己攒的」转眼就翻过去了。玩家根本读不到。
//
// 所以这里不做新台词，只做两件事：
//   1. 把已经记在编年史里的卜算子台词**单独拎出来**，给一块不会被冲走的地方；
//   2. 给他一条「亲缘」进度——你在井边待得越久、亲手拨动得越多，他跟你越熟。
//
// 第 1 条刻意不新增状态：台词已经在编年史里了，再从编年史里筛出来就行。
// 只有「亲缘」是真的状态（要存档）。这和这个项目一贯的「推导量不做增量记账」是一致的。

import { BUSANZI, busanziLine } from '../core/lore.js';

/** 亲缘阶梯的门槛。与 BUSANZI.affinityTiers 一一对应。 */
export const AFFINITY_STEPS = [0, 16, 48, 100, 180];

/** 每多少游戏年，静观之缘长一点 */
const YEARS_PER_AFFINITY = 20;

/** 每落一笔神力长一点亲缘；但只计前 N 次——免得玩家狂点刷满 */
export const ACT_AFFINITY_CAP = 30;

/**
 * 里程碑。每个只在第一次达成时结算，并让卜算子说一句话。
 *
 * 这些都是「世界开始有戏了」的瞬间：玩家一个人对着空山按半天神力，
 * 也需要有人告诉他「刚才那一下，让这个世界多了一样东西」。
 */
const MILESTONES = [
  { key: 'firstVillage', value: 4, line: '有人搭起第一间屋子了。山河一旦有人住，就不再只是山河。' },
  { key: 'firstSect', value: 8, line: '第一个山门立起来了。你看，散修也会自己抱团。' },
  { key: 'firstSite', value: 4, line: '地图上有地方可探了。埋着的，总有人会去翻。' },
  { key: 'firstAscend', value: 10, line: '头一个飞升的走了。小爷我在这井边蹲了这么久，头一回见有人真爬出去。' },
  { key: 'firstTribulation', value: 6, line: '有人开始渡劫了。往后这雷声只会越来越密，你听惯了就好。' },
  { key: 'firstWar', value: 8, line: '两个门派打起来了。你造的灵脉，开始有人拿命去争了。' },
  { key: 'firstDoom', value: 0, line: '离为火，为明，也为分离。世道越黑，越该留一盏灯。至于灯是谁点的——天机不可泄露。' },
];

/** 灾祸类神力：用这些的时候卜算子会念叨两句 */
const HARSH_TOOLS = new Set([
  'burn', 'lava', 'lightning', 'meteor', 'quake', 'flood', 'plague', 'crisis', 'erase',
  'tribulation', 'forbidden', 'drain',
]);

/** 创造类神力 */
const KIND_TOOLS = new Set([
  'raise', 'forest', 'fertile', 'road', 'human', 'cultivator', 'spirit',
  'root', 'leyline', 'secret', 'cave', 'manual', 'ascend', 'found',
]);

/**
 * 让卜算子说一句，并且**避免复读**。他所有的话都必须走这里。
 *
 * 为什么需要：原作词池是按「场合」分的，`tribulation` 这一类**只有一句**
 * （「看好了，这一劫不是小爷我给的，是他自己攒的。」）。
 * 而突破在后期每几秒就发生一次，按 25% 概率触发的话，
 * 编年史里会连着一整排一模一样的话——他就从「引路人」变成坏掉的唱片了。
 *
 * 规则：挑出来的句子若在**他自己最近 minGap 句**里已经说过，这次就不说。
 * 只有一个句子的词池于是自动变成「很久才说一次」——那反而更像一句被记住的话。
 *
 * ⚠️ 去重是拿他自己的 log 比的，不是拿编年史比的。
 * 拿编年史比会失效：编年史是 400 条的滚动窗口，而突破/因果/秘境每几秒就产出一条，
 * 二十八条的空窗在后期只要十几秒就填满了，等于没有去重。实测过，见文件头注释。
 */
export function speak(world, rng, key, prefix = '', minGap = 12) {
  const line = busanziLine(rng, key);
  if (!line) return null;
  const text = prefix ? `${prefix}${line}` : line;
  const log = ensureLog(world);
  const from = Math.max(0, log.length - minGap);
  for (let i = log.length - 1; i >= from; i -= 1) {
    if (log[i].text === text) return null;
  }
  pushLine(world, text);
  return text;
}

/**
 * 卜算子自己的说话记录。
 *
 * 为什么不直接从 chronicle 里筛（那是更省事的写法，也确实先那么写过）：
 * chronicle 是**世界的编年史**，400 条封顶的滚动窗口，记录的是突破、天劫、因果、秘境……
 * 一场两百年的局里它会被填满好几轮，卜算子早期说的话（包括他登场那三句）
 * 会被后来那些条目顶出去。于是玩家读到的永远是最近那句，读不到他的来路。
 *
 * 他这些话不是「史实」，是**玩家跟他的对话**，该有自己的地方存着。
 * 40 条上限，全是短句，体积可以忽略。
 */
const LOG_CAP = 40;

function ensureLog(world) {
  if (!world.busanzi) world.busanzi = newBusanziState();
  if (!Array.isArray(world.busanzi.log)) world.busanzi.log = [];
  return world.busanzi.log;
}

/** 同时写进世界编年史（他确实是这世界的一部分）和他自己的 log */
function pushLine(world, text) {
  world.record(text, 'busanzi');
  const log = ensureLog(world);
  log.push({ day: world.day, year: world.year, text });
  if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
  return text;
}

/**
 * 世界初开时他先说的话。只在第一次见面时说。
 *
 * 说两句还是三句，取决于 `BUSANZI.lines.boot` 有多长——这里不写死条数。
 * 但**一定会多一句自我介绍**，理由见下。
 */
export function greetOnBoot(world, rng) {
  if (!world.busanzi) world.busanzi = newBusanziState();
  if (world.busanzi.met) return [];
  world.busanzi.met = true;
  const out = [];
  const boot = BUSANZI.lines.boot;
  for (let i = 0; i < boot.length; i += 1) {
    pushLine(world, boot[i]);
    out.push(boot[i]);
  }
  // ── 自我介绍 ──────────────────────────────────────────────
  // `BUSANZI.selfIntro`（「你可以当我是你给自己留的『说明书』……」）从迁移那天起
  // 就躺在 `core/lore.js` 里，但**全仓零读者**（故障类 1：字段存在 ≠ 生效）。
  //
  // 代价是实打实的：`lines.boot` 那三句只说了「你醒了」「那是你的世界」，
  // 没有一句交代**他是谁、他在这儿干什么**。而他是画面左下角那块会一直陪着玩家的浮条
  // ——新玩家看着一个自称「小爷我」的陌生人，不知道这人是引导、是旁白、还是个彩蛋。
  //
  // 排在 boot **之后**，不插在中间：前几句是「他先认出你」，认完了才该自报家门。
  // ⚠️ 不要把它并进 `BUSANZI.lines.boot` 数组——那个数组是照搬原作的原文，
  //    本文件头注释承诺过「一字未改」。
  if (BUSANZI.selfIntro) {
    pushLine(world, BUSANZI.selfIntro);
    out.push(BUSANZI.selfIntro);
  }
  return out;
}

export function newBusanziState() {
  return { met: false, acts: 0, milestones: [], peakPop: 0, tier: 0, log: [] };
}

/**
 * 亲缘值。**全部是推导量**，不单独记账：
 * 待了多少年 + 亲手拨了多少次 + 见证过几个里程碑。
 *
 * 这样存档只需要存 acts / milestones / met 三个小字段，
 * 而且「亲缘」永远不可能和「世界真实状态」对不上。
 */
export function busanziAffinity(world) {
  const b = world.busanzi;
  if (!b) return 0;
  const years = Math.floor(world.year / YEARS_PER_AFFINITY);
  const acts = Math.min(b.acts || 0, ACT_AFFINITY_CAP);
  let milestone = 0;
  for (let i = 0; i < MILESTONES.length; i += 1) {
    if ((b.milestones || []).includes(MILESTONES[i].key)) milestone += MILESTONES[i].value;
  }
  return years + acts + milestone;
}

/** 当前亲缘阶梯下标 0..4 */
export function busanziTierIndex(world) {
  const value = busanziAffinity(world);
  let tier = 0;
  for (let i = 0; i < AFFINITY_STEPS.length; i += 1) {
    if (value >= AFFINITY_STEPS[i]) tier = i;
  }
  return tier;
}

export function busanziTierName(world) {
  return BUSANZI.affinityTiers[busanziTierIndex(world)] || BUSANZI.affinityTiers[0];
}

/** 距离下一阶还差多少；已满级返回 null */
export function busanziNextStep(world) {
  const value = busanziAffinity(world);
  const tier = busanziTierIndex(world);
  if (tier >= AFFINITY_STEPS.length - 1) return null;
  return { value, need: AFFINITY_STEPS[tier + 1], toGo: AFFINITY_STEPS[tier + 1] - value };
}

/**
 * 卜算子最近说过的几句话。
 *
 * 读他自己的 log，不读编年史——编年史是滚动窗口，会把他的话顶掉（见 speak 的注释）。
 */
export function busanziRecent(world, n = 4) {
  const log = ensureLog(world);
  return log.slice(-n);
}

/**
 * 落笔之后让卜算子说点什么，顺便记一次「亲手拨动」。
 *
 * 刻意不是每次都说话——他每次都开口就变成弹幕了。
 * 灾祸类神力有较大概率念叨，创造类小概率，这样「他盯着你」的感觉才在。
 *
 * 去重窗口给得比模拟事件那边小（4 而不是 12）：他面对玩家时的词池只有
 * 五句 watch + 一句 reproach，窗口开大就会「说完六句之后彻底闭嘴」——
 * 玩家连按两百次，他只在头几下吱过声。这里靠**概率**节流，靠小窗口只挡「立刻重复」。
 */
export function reactToTool(world, rng, toolId) {
  if (!world.busanzi) world.busanzi = newBusanziState();
  if (world.busanzi.acts < ACT_AFFINITY_CAP) world.busanzi.acts += 1;

  const harsh = HARSH_TOOLS.has(toolId);
  const kind = KIND_TOOLS.has(toolId);
  if (!harsh && !kind) return null;

  const chance = harsh ? 0.45 : 0.22;
  if (rng() >= chance) return null;

  // 灾祸类偶尔改用那句「天道不是不会看走眼」——他也不是一味叫好
  const pool = harsh && rng() < 0.3 ? 'reproach' : 'watch';
  return speak(world, rng, pool, '', 4);
}

/**
 * 每 tick 推进：结算里程碑、报亲缘升阶、以及在世道坏下去时留一盏灯。
 * 由 Life.step 调用，这样无头测试也会跑到。
 */
export function tickBusanzi(world, rng) {
  if (!world.busanzi) world.busanzi = newBusanziState();
  const b = world.busanzi;
  const spoken = [];

  const pop = world.entities.length;
  if (pop > (b.peakPop || 0)) b.peakPop = pop;

  // 里程碑：谁先到就记谁，之后不再重复
  const reached = {
    firstVillage: world.villages.length > 0,
    firstSect: world.factions.length > 0,
    firstSite: world.sites.length > 0,
    firstAscend: world.ascended.length > 0,
    firstTribulation: world.chronicle.some((c) => c.kind === 'tribulation'),
    firstWar: world.chronicle.some((c) => c.kind === 'war'),
  };
  for (let i = 0; i < MILESTONES.length; i += 1) {
    const m = MILESTONES[i];
    if (m.key === 'firstDoom') continue;
    if (!reached[m.key]) continue;
    if (b.milestones.includes(m.key)) continue;
    b.milestones.push(m.key);
    pushLine(world, m.line);
    spoken.push(m.line);
  }

  // 世道黑下去：人掉到曾经盛时的两成以下，且确实盛过
  const peak = b.peakPop || 0;
  if (!b.milestones.includes('firstDoom') && peak >= 120 && pop > 0 && pop < peak * 0.2) {
    b.milestones.push('firstDoom');
    const doom = MILESTONES.find((m) => m.key === 'firstDoom');
    pushLine(world, doom.line);
    spoken.push(doom.line);
  }

  // 亲缘升阶
  const tier = busanziTierIndex(world);
  if (tier > (b.tier || 0)) {
    b.tier = tier;
    const name = BUSANZI.affinityTiers[tier];
    const said = speak(world, rng, 'watch', `【${name}】`);
    if (said) spoken.push(said);
  }

  return spoken;
}
