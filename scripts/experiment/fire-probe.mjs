// World Laboratory · 火灾生态探针（B2-5）
//
// ───────────────────────────────────────────────────────────────────────
// 这个模块回答什么
// ───────────────────────────────────────────────────────────────────────
//
// 委托书 §B2-5 要的是「真实火灾的因果」：烧了多少、烧多久、恢复成什么样、
// 对人口聚落有什么**可验证**的影响。三条硬纪律各对应一种常见的造假写法：
//
// ① **只用正式能力点火**。干预一律走 `powers.js` 的 `lightning()`——它内部
//    调 `ignite()`、按半径标记生灵、把事件写进世界自己的里程碑。不自己往
//    `world.fire[]` 里写值：那是「看起来点了火」，但没有事件、没有归因链、
//    没有 undo 语义，产出的是**一次不属于这个游戏的火灾**。
//
// ② **死亡归因不许一把抓**。`lightning()` 会把人标记为 hp=0（由 life.step 的
//    清理循环走 onDeath 正常管线）。necrology 的 `cause` 只有
//    `飞升 / 寿终 / 殁` 三值 ⇒ **雷击死在名册里与普通死亡同形**。
//    所以归因链只能是： strike 时刻「被标记 hp=0 的人数」+ 世界自己的
//    disaster 里程碑 + 干预组与对照组此后的**人口轨迹差**（上界）。
//    轨迹差里包含火灾的次级效应（烧掉聚落粮仓 → 饥荒），那**不是**雷击死亡，
//    必须分开报。本模块的 `attributeStrike()` 就是把这三层分开的唯一入口。
//
// ③ **宿主真实时间是另一类实验**。`decayOverlay` 只在 `main.js` 的宿主
//    时钟里跑（每 2.5s 一次），而且**按覆盖层格子数抽 ecoRng**——火灾改变
//    覆盖层格子数 ⇒ 改变抽签次数。只推进游戏日等于跳过整条恢复层。
//    `hostReplay()` 逐帧复刻 main.js 的累加器，把它变成可断言的。
//
// 本模块**只读 world**，唯一例外是 `strike()`（那是干预本身，不是采集）。

import { SEA_LEVEL, TERRAIN, LIMITS } from '../../src/inkbox/core/config.js';
import { OVER } from '../../src/inkbox/world/terrain.js';
import { lightning, History } from '../../src/inkbox/sim/powers.js';
import { stepHydrology } from '../../src/inkbox/sim/hydrology.js';
import { decayOverlay } from '../../src/inkbox/sim/ecology.js';

/** 探针列清单（**追加式纪律**：新列加末尾，永不改名删列）。 */
export const FIRE_COLUMNS = Object.freeze([
  'group', 'seed', 'day', 'year', 'phase',
  'burning', 'fireSum', 'scorched', 'ash', 'lava', 'ruins',
  'vegSum', 'vegInRect', 'vegOutsideRect', 'rectScorched', 'rectAsh',
  'struct', 'villageCount', 'popTotal', 'entitiesInRect',
  'overlayCells', 'ecoRngDrawsCum',
  // ── 世界自己的灾难事件账本（两本，口径不同）────────────────────
  // `milestones` 是长窗口（MILESTONE_CAP），`chronicle` 是 400 条滚动窗
  //   ⇒ 后者只可能是**下界**。两本都记，因为「有伤亡的事故」走 milestone、
  //   「四下无人烟」的走 record（只在 chronicle 里）——只读一本必然漏一类。
  'disasterMilestones', 'disasterChronicle',
  // ── 聚落受损（闪电的 `damageVillages` 直接改 v.hp / v.food）────────
  // `v.hp` 归零 ⇒ 聚落消失（sites.js 的清理），所以最小值比均值更有信息量。
  // 全部只读；受损瞬间的数值由 `strike()` 返回的 world 自述文本交叉印证。
  'villagesInRect', 'villageHpMin', 'villageHpSum', 'villageFoodSum',
]);

/** 视为「在烧」的火线阈值。取自 stepFire 自己的判定：`f <= 0.01` 即熄。 */
const BURNING_MIN = 0.01;

/**
 * 确定性选取雷击落点。
 *
 * ⚠️ **不抽 RNG**（否则选点本身就会扰动世界线，而两组就再也对不上）。
 *    两个模式都用「最大目标值 → 同值取最小索引」这条纯规则：
 *      · `veg`        全图植被最密的陆格（研究「一场大火能烧多大」）；
 *      · `crowded-veg` 高植被陆格中、半径 8 内生灵最多的那一格
 *                      （研究「火与人的相互作用」，默认）。
 *
 * @returns {{x:number, y:number, i:number, veg:number, nearby:number}|null}
 */
export function pickStrikePoint(world, { mode = 'crowded-veg', minVeg = 0.5, radius = 8 } = {}) {
  const { w, h, veg, height, water, type, entities } = world;
  const r2 = radius * radius;
  let best = null;
  for (let i = 0; i < world.size; i += 1) {
    if (height[i] < SEA_LEVEL + 0.004) continue;
    if (water[i] > 0.02) continue;
    const t = type[i];
    if (t === TERRAIN.ROCK || t === TERRAIN.MOUNTAIN || t === TERRAIN.PEAK
      || t === TERRAIN.SNOW || t === TERRAIN.LAVA) continue;
    if (veg[i] < minVeg) continue;
    let nearby = 0;
    if (mode === 'crowded-veg') {
      const x = i % w;
      const y = (i - x) / w;
      for (const e of entities) {
        if ((e.x - x) ** 2 + (e.y - y) ** 2 <= r2) nearby += 1;
      }
    } else {
      nearby = veg[i];
    }
    if (!best || nearby > best.nearby) best = { x: i % w, y: Math.floor(i / w), i, veg: veg[i], nearby };
  }
  return best;
}

/** 矩形区域（探针用）。落点半径 3 的点火会蔓延，故矩形取半径 × 4 的观测窗。 */
export function strikeRect(point, { pad = 12 } = {}) {
  return { x0: point.x - pad, y0: point.y - pad, x1: point.x + pad, y1: point.y + pad };
}

function countInRect(world, rect, field, pred) {
  const { w } = world;
  let n = 0;
  const x0 = Math.max(0, rect.x0);
  const y0 = Math.max(0, rect.y0);
  const x1 = Math.min(world.w - 1, rect.x1);
  const y1 = Math.min(world.h - 1, rect.y1);
  const arr = world[field];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const v = arr[y * w + x];
      if (pred(v)) n += 1;
    }
  }
  return n;
}

function sumInRect(world, rect, field) {
  const { w } = world;
  let s = 0;
  const x0 = Math.max(0, rect.x0);
  const y0 = Math.max(0, rect.y0);
  const x1 = Math.min(world.w - 1, rect.x1);
  const y1 = Math.min(world.h - 1, rect.y1);
  const arr = world[field];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) s += arr[y * w + x];
  }
  return s;
}

/**
 * 采一次火灾生态读数。**只读**。
 *
 * @param {object} world
 * @param {object} [ctx] `{ group, seed, phase, rect, ecoDraws }`
 *   `rect` 由 `strikeRect` 产出；对照组也传**同一个** rect（落点由同 seed 决定，
 *   两组逐格相同），这样 vegInRect 在两组间可直接对比。
 */
export function fireProbe(world, ctx = {}) {
  const rect = ctx.rect || null;
  let burning = 0;
  let fireSum = 0;
  for (let i = 0; i < world.size; i += 1) {
    const f = world.fire[i];
    if (f > BURNING_MIN) burning += 1;
    fireSum += f;
  }
  let overlayCells = 0;
  for (let i = 0; i < world.size; i += 1) {
    if (world.over[i] !== OVER.NONE) overlayCells += 1;
  }
  const row = {
    group: ctx.group || '',
    seed: ctx.seed == null ? '' : ctx.seed,
    day: world.day || 0,
    year: Math.floor((world.day || 0) / 360),
    phase: ctx.phase || 'run',
    burning,
    fireSum: Math.round(fireSum * 1000) / 1000,
    scorched: countInRect(world, fullRect(world), 'over', (v) => v === OVER.SCORCHED),
    ash: countInRect(world, fullRect(world), 'over', (v) => v === OVER.ASH),
    lava: countInRect(world, fullRect(world), 'over', (v) => v === OVER.LAVA),
    ruins: countInRect(world, fullRect(world), 'over', (v) => v === OVER.RUINS),
    vegSum: sumInRect(world, fullRect(world), 'veg'),
    vegInRect: rect ? sumInRect(world, rect, 'veg') : '',
    vegOutsideRect: rect
      ? Math.round((sumInRect(world, fullRect(world), 'veg') - sumInRect(world, rect, 'veg')) * 1000) / 1000
      : '',
    rectScorched: rect ? countInRect(world, rect, 'over', (v) => v === OVER.SCORCHED) : '',
    rectAsh: rect ? countInRect(world, rect, 'over', (v) => v === OVER.ASH) : '',
    struct: countInRect(world, fullRect(world), 'struct', (v) => v > 0),
    villageCount: (world.villages || []).length,
    popTotal: (world.entities || []).length,
    entitiesInRect: rect ? entitiesInRect(world, rect) : '',
    overlayCells,
    // ecoRng 抽签累计：宿主回放会按覆盖层格子数抽签 ⇒ 这一列是
    // 「宿主时间吃掉了多少随机数」的直接证据，也是 Host-Replay 存在的原因。
    ecoRngDrawsCum: ctx.ecoDraws ? ctx.ecoDraws() : '',
    // 世界自己的灾难事件条数（powers.js 的 disasterMilestone 写的）
    disasterMilestones: countKind(world.milestones),
    disasterChronicle: countKind(world.chronicle),
    // 聚落受损
    villagesInRect: villageStats(world, rect).count,
    villageHpMin: villageStats(world, rect).hpMin,
    villageHpSum: villageStats(world, rect).hpSum,
    villageFoodSum: villageStats(world, rect).foodSum,
  };
  return row;
}

/** 聚落聚合读数。`rect` 为 null 时统计全部聚落（对照组与干预组同口径）。 */
function villageStats(world, rect) {
  const list = world.villages || [];
  let count = 0;
  let hpMin = null;
  let hpSum = 0;
  let foodSum = 0;
  for (const v of list) {
    if (rect && !(v.x >= rect.x0 && v.x <= rect.x1 && v.y >= rect.y0 && v.y <= rect.y1)) continue;
    count += 1;
    hpSum += Number(v.hp) || 0;
    foodSum += Number(v.food) || 0;
    const hp = Number(v.hp) || 0;
    hpMin = hpMin === null ? hp : Math.min(hpMin, hp);
  }
  return { count, hpMin: hpMin === null ? '' : Math.round(hpMin), hpSum: Math.round(hpSum), foodSum: Math.round(foodSum) };
}

/** 数一本账本里 kind === 'disaster' 的条数。**
 *
 * ⚠️ 读 `world.milestones` / `world.chronicle`（**不是** `world.log`——那个键
 *    不存在，早先按它取会永远得到空值，而空值与「没有灾难」在 CSV 里同形）。
 */
function countKind(list) {
  if (!Array.isArray(list)) return '';
  let n = 0;
  for (const row of list) {
    if (row && row.kind === 'disaster') n += 1;
  }
  return n;
}

function fullRect(world) {
  return { x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 };
}

function entitiesInRect(world, rect) {
  let n = 0;
  for (const e of world.entities || []) {
    if (e.x >= rect.x0 && e.x <= rect.x1 && e.y >= rect.y0 && e.y <= rect.y1) n += 1;
  }
  return n;
}

/**
 * 施加一次**正式**雷击（B2-5 的唯一干预入口）。
 *
 * ⚠️ 走 `powers.js` 的 `lightning()`，与产品 pointerdown → applyTool 同一条路：
 *    先 `history.begin()`（撤销栈），再点火、标记生灵、写里程碑。自己写
 *    `world.fire[]` 是「假装点了火」——没有事件、没有归因、没有 undo。
 *
 * @returns {{text:string, markedDead:number, entitiesBefore:number, point:object}}
 *   `markedDead` = 打击半径内被这一击标为 hp=0 的人数（**已标记**，不是「已移除」，
 *   移除要等下一个 life.step 的清理循环——与 lightning() 返回文案同口径）。
 */
export function strike(world, point, { radius = 4 } = {}) {
  const history = new History();
  history.begin();
  const before = (world.entities || []).map((e) => e.id);
  const text = lightning(world, point.x, point.y, history);
  let markedDead = 0;
  const r2 = radius * radius;
  for (const e of world.entities || []) {
    if ((e.x - point.x) ** 2 + (e.y - point.y) ** 2 > r2) continue;
    if (e.hp <= 0) markedDead += 1;
  }
  return {
    text,
    markedDead,
    entitiesBefore: before.length,
    point: { x: point.x, y: point.y },
  };
}

/**
 * 三层归因链（委托书：「不能在没有事件归因链时全部计入灾害死亡」）。
 *
 * @param {object} strikeInfo `strike()` 的返回
 * @param {object} controlAfter 对照组同一 day 的 fireProbe 行
 * @param {object} treatAfter   干预组同一 day 的 fireProbe 行
 * @returns {{directMarked:number, populationDelta:number, verdict:string}}
 *   · `directMarked`  —— 这一击**直接标记**死亡的人数（唯一可算「雷击死亡」的量）；
 *   · `populationDelta` —— 干预组 − 对照组的人口差（**上界**，含火灾的次级效应：
 *     聚落受损 / 粮荒 / 后续出生下降，不许全算成雷击死亡）；
 *   · `verdict`       —— 人话结论，写进报告。
 */
export function attributeStrike(strikeInfo, controlAfter, treatAfter) {
  const directMarked = strikeInfo ? strikeInfo.markedDead : 0;
  const populationDelta = (treatAfter ? Number(treatAfter.popTotal) : 0)
    - (controlAfter ? Number(controlAfter.popTotal) : 0);
  let verdict;
  if (directMarked === 0 && populationDelta === 0) {
    verdict = '该次雷击无可归因伤亡：打击半径内无生灵被打到，此后人口轨迹与对照组一致。';
  } else if (directMarked === 0 && populationDelta !== 0) {
    verdict = `该次雷击无直接伤亡，但此后人口与对照组相差 ${populationDelta}——`
      + '这段差距来自火灾的次级效应（栖所 / 粮草 / 聚落），不计入灾害直接死亡。';
  } else {
    verdict = `该次雷击直接标记 ${directMarked} 人；此后人口差 ${populationDelta} 为次级效应上界。`;
  }
  return { directMarked, populationDelta, verdict };
}

/**
 * 宿主真实时间回放（Host-Replay）：逐帧复刻 `main.js` 的 `update(dt)`。
 *
 * 为什么必须是「一类独立的实验」而不是「多推进几天」：
 *   · `stepHydrology(world, 4, null)` 每 0.16s 宿主秒一次（每帧最多 3 步）；
 *   · `decayOverlay(world, accum + 900, this.rng)` 每 2.5s 一次，**按覆盖层
 *     格子数抽 ecoRng** ⇒ 火灾后覆盖层变多 ⇒ 抽签变多 ⇒ 世界线偏离纯游戏日推进。
 * 只推进游戏日会让「焦土 → 灰烬 → 褪去」整条恢复链一次都不发生，于是报告上写
 * 「灾后 100 年仍是焦土」——而真实玩家看到的早就长回来草了。
 *
 * ⚠️ `rng` 必须是**同一个** ecoRng 实例（与 advanceWorld 共用），否则复刻出的
 *    宿主时间和真正跑过的不是一条线。`dt` 默认 1/60（60fps），与 main.js 的
 *    `update(1/60)` 同口径。
 *
 * @returns {{frames:number, hydroCalls:number, decayCalls:number}}
 */
export function hostReplay(world, rng, seconds, { dt = 1 / 60 } = {}) {
  let hydroAccum = 0;
  let decayAccum = 0;
  let hydroCalls = 0;
  let decayCalls = 0;
  const frames = Math.max(0, Math.round(seconds / dt));
  for (let f = 0; f < frames; f += 1) {
    hydroAccum += dt;
    let hydroSteps = 0;
    while (hydroAccum >= 0.16 && hydroSteps < 3) {
      hydroAccum -= 0.16;
      hydroSteps += 1;
      stepHydrology(world, 4, null);
      hydroCalls += 1;
    }
    decayAccum += dt;
    if (decayAccum >= 2.5) {
      decayOverlay(world, decayAccum + 2.5 * 360, rng);
      decayAccum = 0;
      decayCalls += 1;
    }
  }
  return { frames, hydroCalls, decayCalls };
}

/** 给任意 rng 函数套一层计数器（**不改变取值与顺序**，只是外包一个读数）。 */
export function countingRng(rng) {
  let draws = 0;
  const wrapped = () => {
    draws += 1;
    return rng();
  };
  wrapped.draws = () => draws;
  return wrapped;
}

/** LIMITS.maxEntities 的只读再导出（探针注释里引用，避免各处 import config）。 */
export const MAX_ENTITIES = LIMITS.maxEntities;
