// 水墨沙盒 · 生灵、聚落与宗门
//
// 这是沙盒的「活」的部分。小人自己觅食、结庐、修行、拜师、结仇、开宗立派；
// 修士在瓶颈处渡劫，被心魔纠缠，最后飞升或坐化。
//
// 玩家的每一次改地形都会真实影响他们——把河填了，村子就会旱死；
// 把山抬高，灵脉就断了；放一把火，整片林子连同村子一起烧。
//
// 生灵坐标使用「格」为单位的浮点数，渲染层再乘缩放。
//
// 分工：
//   cultivation.js  一个人身上发生什么（修为、突破、天劫、心魔）
//   sects.js        宗门（开宗、掌门、灵脉、征伐、散伙）
//   relations.js    师徒 / 道侣 / 宿敌
//   sites.js        秘境 / 洞府 / 古阵
//   worldEvents.js  仙使、丹道大会、禁术、灵兽、灾年
//   本文件          移动、战斗、聚落，以及把上面这些串成一条主循环

import {
  SEA_LEVEL, SPECIES, SPECIES_INFO, LIMITS, TERRAIN, TIME,
} from '../core/config.js';
import { clamp, mulberry32 } from '../core/noise.js';
import { OVER, recomputeRect, markDirty, flushDirty } from '../world/terrain.js';
import { generateNameParts, generateName, generateVillageName, narrate } from '../core/lore.js';
import {
  initEntity, stepEntity as stepCultivation, combatPower, recordDeath, addKarma, MAX_SITES, placeName,
} from './cultivation.js';
import { stepSects, foundSect } from './sects.js';
import { stepRelations, onDeathRelations, RELATION_TYPES } from './relations.js';
import { stepFamily, pickParents, registerBirth } from './family.js';
import { stepWar } from './war.js';
import { tryPossession } from './possession.js';
import { rememberDead } from './necrology.js';
import {
  enterNether, takeDueSoul, attachSoul, stepReincarnation, SOUL_ROUTE_POSSESS,
} from './reincarnation.js';
import { recordLifeEvent } from './biography.js';
import { stepSites } from './sites.js';
import { stepArtifacts, dropArtifacts, wearArtifacts, ownerLine, KILL_WEAR } from './artifacts.js';
import { tickBusanzi } from './busanzi.js';
import { WorldEvents } from './worldEvents.js';

const TERRAIN_SPEED = Object.freeze({
  [TERRAIN.SAND]: 0.82,
  [TERRAIN.GRASS]: 1,
  [TERRAIN.MEADOW]: 1.05,
  [TERRAIN.FOREST]: 0.62,
  [TERRAIN.JUNGLE]: 0.5,
  [TERRAIN.SAVANNA]: 0.92,
  [TERRAIN.DESERT]: 0.7,
  [TERRAIN.TUNDRA]: 0.8,
  [TERRAIN.SWAMP]: 0.45,
  [TERRAIN.ROCK]: 0.5,
  [TERRAIN.FARMLAND]: 1.1,
  [TERRAIN.ROAD]: 1.7,
  [TERRAIN.RUINS]: 0.85,
  [TERRAIN.SCORCHED]: 0.85,
  [TERRAIN.ASH]: 0.9,
});

const BASE_TILES_PER_DAY = 2.1;

/**
 * 每名村民每天的生育期望。凡人寿元约 4200 天，故维持人口需要 1/4200 ≈ 2.4e-4，
 * 取 4e-4 留一倍冗余，抵消战乱、饥荒、以及觉醒后「不再算凡人」的流失。
 */
const BIRTH_PER_CAPITA_DAY = 0.00075;

/** 满员的村子每天分家外迁的概率。约合每 30 年一次 */
const SPLIT_PER_DAY = 0.00016;

/** 荒野灵兽的目标存量与总量上限。灵兽是妖兽/坐骑/认主的来源，不能没有 */
const WILDLIFE_TARGET = 35;
const WILDLIFE_POP_CAP = 2200;

/** 灵兽的领地半径：超出这个距离就不再追杀 */
const BEAST_AGGRO_RANGE = 5;

/** 开山立派的最低境界。筑基（10 级）以下只配做弟子，没资格另立门户 */
const SECT_FOUND_MIN_LEVEL = 10;

/** 村庄吸纳流民与自愈的半径 */
const VILLAGE_ABSORB_RADIUS = 9;

/** 每一亩田每天的产出 */
const FIELD_YIELD_PER_DAY = 0.03;

/** 村庄的人口上限 = BASE + 等级 × 10 */
const VILLAGE_CAPACITY_BASE = 10;

/**
 * 全世界的生灵总量软上限。
 *
 * 村子会一直分家、人口会一直涨，若不设闸门，最后会顶到 maxEntities（3000），
 * 到那时每个村子都被摊薄成两三个人，画面反而更空。留出余量让人口停在
 * 「热闹但不拥挤」的密度上。
 */
const POP_SOFT_CAP = 1400;

/**
 * 「重伤」的血量比例。低于它就脱离战斗、转入撤退。
 *
 * ⚠️ 这个数原本只出现在 `stepEntity` 里一次（`e.hp < e.maxHp * 0.32`），
 * 而那条分支**只在「附近没有敌人」时可达**——所以它其实从来没起过作用
 * （详见 `stepEntity` 里 `canFight` 那段注释与 `INKBOX.md` §29.3 的实测）。
 * 2026-09-21 起它同时是「能不能打」的门槛，于是**两处必须同源**，
 * 否则「重伤还打」与「重伤就撤」两个判据会各自漂移，而那种漂移不报错。
 */
const WOUNDED_HP_FRACTION = 0.32;

/**
 * 「手下留情」：致死一击被救下的概率 ⇒ **致死率 = `1 − MERCY`**。
 *
 * 语义是「角色会受伤，也会死」——大多数致败的一击留人一命（转成重伤），
 * 但**战斗仍然会死人**（`1 − MERCY` 那一部分）。
 * ⚠️ `MERCY = 1` 就是「战斗永不致死」，那是被用户明确否决的取值，别取。
 *
 * ⚠️ 抽签走**独立随机流** `mercyRngFor(world)`，**绝不抽 `this.rng`**（铁律一）：
 * `this.rng` 是全世界共用的主随机流，往里加抽取会把整个世界线往后挪，
 * 于是「开 mercy」与「没开」的长测读数**无法对比**，而且**不报错**。
 */
export const MERCY = 0.85;

/**
 * 「养伤」：**轻伤**（打了一架、血被打到 `WOUNDED_HP_FRACTION` 以下但没死）
 * 之后多久不出战。`180` 天 = 半年（用户指定）。
 */
export const WOUNDED_REST_DAYS = 180;

/**
 * 「养伤」：**重伤**（致死一击被手下留情救下）之后多久不出战。
 * `1080` 天 = 3 年（用户指定）。
 *
 * ⚠️ 这是**行为锁**，不是「回血所需时间」：实测站在有肥力的地上回血
 * `1.225% maxHp/天` ⇒ 从 5% 血回到满血只要 **78 天**。
 * 「重伤养三年」的意思是「重伤之后长期不出山」，不是「血要三年才回满」。
 *
 * ⚠️ 也**不可能**改成「让血真的慢慢回」：饥荒扣血是 `0.035%/天`，
 * 回血速率必须大于它否则**所有人饿死** ⇒ 5%→32% 的物理上限只有 771 天。
 */
export const GRIEVOUS_REST_DAYS = 1080;

/** 「手下留情」随机流的派生键：ASCII `MERC`。与已占用的 upper/rift/nether 键不冲突。 */
export const MERCY_SEED_KEY = 0x4d455243;

/**
 * 每条 world 专属的手下留情随机流。**模块级 `WeakMap`，不挂 `world` 属性。**
 *
 * 为什么不挂 `world.mercyRng`：序列化器拾取的是 world 的**可枚举属性**，
 * 挂上去就得写一条「跳过它」的例外——那是「靠人记得」。挂在模块级 `WeakMap` 上，
 * 序列化器**在结构上就看不见它**。用 `WeakMap` 而不是 `Map`，是为了不阻止 world 被回收。
 */
const MERCY_RNG = new WeakMap();

/**
 * 取该 world 的手下留情随机流。**必须是长活的同一条**——每次重建的话，
 * 每次抽签都拿到同一串数的开头，「随机」这件事在结构上就没了。
 */
export function mercyRngFor(world) {
  let rng = MERCY_RNG.get(world);
  if (!rng) {
    rng = mulberry32(((world.seed || 0) ^ MERCY_SEED_KEY) >>> 0);
    MERCY_RNG.set(world, rng);
  }
  return rng;
}

/**
 * 「避世」的年龄阈值比例：年龄达到寿元的这个比例之后，就进入避世状态。
 *
 * ⚠️⚠️ **当前取值 0.8 使本机制逻辑不可达，而且它不是「把 0.8 调小」就能救的**
 * （2026-09-21 洁净区 STEP=1 实测，`scripts/_seclusionprobe.mjs`，300 年 · medium）。
 * 闸门换算成年龄是：炼气 88 / 筑基 192 / 金丹 496 / 元婴 1200 / 化神 2880 岁，
 * 而实测**修士临死最大年龄**分带是 40 / 103 / 92 / 220 / 188 岁 —— **五个带全部够不到**。
 * 探针 1602 万次「实体·tick」采样里 `isSecluding` 为真 **0 次**；各带达到过的
 * **最大 `age/lifespan`** 是 0.362 / **0.429** / 0.165 / 0.147 / 0.052（全带最大 0.429）。
 * **对照组**：同一次跑里**凡人**（寿元约 11.7 年）的 `isSecluding` 覆盖了 15.7% 的暴露量
 * ⇒ **函数本身没坏，是修士够不到**。它的签名就是「长测读数与落地前逐字相同」。
 *
 * ⚠️ **为什么调小 fraction 也没用**：暴露量按 `age/lifespan` 的分布是
 * `f=0.45` 及以上 **0.00%** · `f=0.30` 及以上 **0.01%** · `f=0.15` 及以上 **0.89%** ·
 * `f=0.10` 及以上 **7.34%** · `f=0.05` 及以上 33.07%。
 * 想让避世**有意义**（覆盖 ≥5% 暴露）就得取 `f ≈ 0.10`，而「年龄到寿元 10% 就避世」
 * 对炼气（寿元 110 年）意味着 **11 岁就避世** —— 那已经不是「寿元将尽者避世」，
 * 而是「**所有人避世**」。**任何让闸门可达的取值都会同时摧毁这条机制的语义。**
 * ⇒ **要救它必须先改年龄分布本身（即降低暴力危险率 `h`），而不是动本常量。**
 *
 * 标定目标与**正确口径**（`P(寿终) ≈ e^{−h·L}`，`h` = 暴力危险率 次/游戏年，`L` = 寿元 年）：
 * **洁净区（STEP=1）**实测 `h·L`：炼气 **39.81** · 筑基 **27.25** · 金丹 **40.26** ·
 * 元婴 **58.33** · 化神 **55.34**。要 1% 寿终需 `h·L ≈ 4.6` ⇒ **需降 5.9–12.7 倍**。
 * ⚠️ 早先写在这里的「炼气 ~36 · 筑基 ~12 · 金丹 ~3 · 元婴 ~6.8」是**污染口径（STEP=3）**
 * 读数，与洁净区**不可比**：元婴从 6.8 变成 58.33，**连排序都翻了**。别再引用。
 *
 * 为什么「避世」能降低末期危险率（一句话）：
 * 寿元将尽者不再接战 ⇒ 命中次数（挨打次数）下降 ⇒ 暴力危险率 `h` 下降。
 * ⚠️ 但这条推理**只在闸门可达时成立**；闸门够不到时，本机制等于不存在。
 *
 * ⚠️ 这是**确定性**判据，只读 `age` / `lifespan`，**绝不抽 `Life.rng`**——
 * 主随机流被冻结，往里加任何抽取都会让所有长测基线**静默**失效。
 */
const SECLUSION_AGE_FRACTION = 0.8;

/**
 * 该生灵是否已「避世」（寿元将尽，不再主动接战）。
 *
 * 纯函数、确定性：只看 `age` 与 `lifespan`，不碰随机流。
 * `lifespan` 缺失时视为「永不避世」（`|| Infinity`），避免把没有寿元概念
 * 的实体（灵兽等）误判进来。
 */
export function isSecluding(e) {
  return (e.age || 0) >= (e.lifespan || Infinity) * SECLUSION_AGE_FRACTION;
}

export class Life {
  constructor(world, rng) {
    this.world = world;
    this.rng = rng;
    this.cellSize = 8;
    this.grid = new Map();
    this.foundingCooldown = 0;
    this.diplomacyCooldown = 0;
    this.yearTickCooldown = 0;
    this.wildCooldown = 0;
    /** 世家普查的节奏（每 360 日一次，见 family.js） */
    this.clanCooldown = 0;
    /**
     * 大战用的**独立随机流**（见 sim/war.js）。
     *
     * 为什么不塞进 `this.rng`：主随机流是全世界共用的一条，`Life` 的每一次
     * 觅食、求偶、突破、渡劫都在上面抽签。大战一次可能抽十几下
     * （每个够格的对子 1 下、宣战 2 下、每阵每个参战者 1 下、结算再几下），
     * 混进去会把整个世界线往后挪——那样「加了大战」和「没加大战」的
     * 长测读数就没法对比了，等于把既有标定全部作废。
     *
     * 从 `world.seed` 派生，所以同一个世界永远是同一条流；
     * 和 `this.rng` 一样**不进存档**（`main.js` 读档时也是照 seed 重建
     * `Life` 的），代价是「跨页面读档」与「接着玩」会分叉——这是这个沙盒
     * 既有且已知的性质，不是这一块引入的。
     */
    this.warRng = mulberry32(((world.seed || 0) ^ 0x776172) >>> 0);
    this.events = new WorldEvents(world, rng);
  }

  name() {
    return generateName(this.rng);
  }

  villageName() {
    return generateVillageName(this.rng);
  }

  // ── 生成 ────────────────────────────────────────────────
  /**
   * 生成生灵。
   *
   * ⚠️ `factionId` 与 `opts.village` 是两个不同的东西：前者决定「属于哪个宗门」，
   * 后者决定「住在哪个村子」。村庄繁衍时两者都要带上——早期只传了 faction，
   * 结果新生儿成了「有宗无家」的游民，`village.pop` 只增不减，繁衍闸门被永久卡死。
   */
  spawn(x, y, species = SPECIES.HUMAN, count = 1, factionId = 0, opts = {}) {
    const world = this.world;
    let created = 0;
    for (let n = 0; n < count; n += 1) {
      const spot = this.findSpawnSpot(x, y, 6);
      if (!spot) break;
      // 转世附魂：只有村庄繁衍才开这个口子（`allowSouls`）。
      // 神力投放的人、野生的灵兽都不该抢神魂——那些不是「投胎」。
      const soul = opts.allowSouls ? takeDueSoul(world) : null;
      // 带神魂降生的必是修士：能排到转世这一步的都是「值得记一笔」的命，
      // 让他回来当凡人，等于把前世灵根与记忆碎片全浪费了。
      const sp = soul ? SPECIES.CULTIVATOR : species;
      const info = SPECIES_INFO[sp] || SPECIES_INFO.human;
      // 取名照旧抽三次（`generateNameParts` 与原来的 `generateName` 逐位同流，
      // 见 core/lore.js 的注释）。拆成「姓 + 名」是为了让世家子弟**继承姓氏**：
      // 抽出来的姓被父姓覆盖——抽签次数一次不多、一次不少。
      const parts = generateNameParts(this.rng);
      const parents = opts.parents || null;
      const surname = (parents && parents[0] && parents[0].surname) || parts.surname;
      const entity = world.addEntity({
        sp,
        x: spot[0] + 0.5,
        y: spot[1] + 0.5,
        vx: 0,
        vy: 0,
        hp: info.hp,
        maxHp: info.hp,
        age: 0,
        lifespan: info.lifespan * (0.7 + this.rng() * 0.6),
        faction: factionId,
        village: opts.village || 0,
        state: 'wander',
        timer: 0,
        tx: spot[0] + 0.5,
        ty: spot[1] + 0.5,
        anim: this.rng() * 6.28,
        face: 1,
        name: surname + parts.given,
        kills: 0,
        carried: 0,
        relations: new Map(),
      });
      // 实体数顶到上限时 addEntity 会返回 null，此时把神魂放回池子，
      // 不能让它凭空消失（一次静默的丢魂，长测里是查不出来的）。
      if (!entity) {
        if (soul) world.souls.push(soul);
        break;
      }
      initEntity(entity, this.rng, { cultivator: sp === SPECIES.CULTIVATOR });
      entity.surname = surname;
      // ── 先天修士也要留一笔 ─────────────────────────────────
      //
      // 上面 `initEntity` 对 `sp === cultivator` 的人是**静默觉醒**的：不写编年史。
      // 这个静默是必要的——世界初开与村庄繁衍都是**批量**出生（实测 100 年降生近千人，
      // 其中约一成「生而有灵根」，见下面繁衍那一段的 `innate`），逐条写进编年史
      // 会把 400 条的滚动窗口当场冲掉。
      //
      // 但**个人日志必须写**。不写的话这一类人的传记会永久空白：实测 100 年的小世界里，
      // 1274 人有 8 位修士终其一生一条记录都没有，而他们恰恰是「生而有灵根」的那批。
      // 传记模块存在的全部意义就是「让一个人的一生被记下来」，
      // 「出生就是修士」这件事不该没有痕迹——那是这个项目最怕的那种静默失效：
      // 不报错、不崩溃，只是有人的人生是空的。
      //
      // ⚠️ 这条**只进个人日志**：`recordLifeEvent` 直接写 `entity.log`，
      // 不经过 `world.record`，所以编年史的窗口预算不受影响。两者别搞混。
      // ⚠️ 它不抽签，所以主随机流一位不动。
      if (sp === SPECIES.CULTIVATOR) {
        recordLifeEvent(world, entity, 'cultivate', soul
          ? `${entity.name} 带着前世的影子降生，落地便已开灵根。`
          : `${entity.name} 生而有灵根，未及修行便已是修士之身。`);
      }
      // ⚠️ 必须排在 initEntity **之后**：附魂要读 level 与 maxHp，
      // 也要在「已经觉醒」的基础上覆盖寿元。顺序反了，转世者会变成
      // 一个寿元只有凡人长短、且永远想不起前世的修士。
      if (soul) attachSoul(world, entity, soul, this.rng);
      // 家世（见 sim/family.js）：双亲、世家、世代、天资快照。
      // 排在最后，是因为「家学」只发给已经觉醒的人，而转世者降生即是修士。
      // 没有双亲也照样生——把出生卡在「有父母」上会直接改掉人口曲线，
      // 而那正是这个世界调了好几轮的参数。
      if (parents && (parents[0] || parents[1])) {
        registerBirth(world, entity, parents);
      }
      created += 1;
    }
    if (created) world.touch();
    return created;
  }

  findSpawnSpot(cx, cy, radius) {
    const world = this.world;
    // 调用方可能传浮点格坐标（工具笔刷传的是 x + 0.5），
    // 必须先取整——否则 idx() 会算出非整数下标，读到 undefined 而永远找不到落点。
    const baseX = Math.floor(cx);
    const baseY = Math.floor(cy);
    const r = Math.floor(radius);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const x = baseX + Math.floor((this.rng() * 2 - 1) * (r + 1));
      const y = baseY + Math.floor((this.rng() * 2 - 1) * (r + 1));
      if (!world.inside(x, y)) continue;
      const i = world.idx(x, y);
      if (!world.isWalkable(i)) continue;
      if (world.struct[i] !== 0) continue;
      return [x, y];
    }
    return null;
  }

  processPendingSpawns() {
    const queue = this.world.pendingSpawns;
    if (!queue.length) return;
    while (queue.length) {
      const job = queue.shift();
      this.spawn(job.x, job.y, job.species || SPECIES.HUMAN, job.count || 1, job.faction || 0, job);
    }
  }

  // ── 空间索引 ────────────────────────────────────────────
  rebuildGrid() {
    const grid = this.grid;
    grid.clear();
    const list = this.world.entities;
    const cs = this.cellSize;
    for (let i = 0; i < list.length; i += 1) {
      const e = list[i];
      const key = (((e.y / cs) | 0) * 4096) + ((e.x / cs) | 0);
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = [];
        grid.set(key, bucket);
      }
      bucket.push(e);
    }
  }

  forEachNear(x, y, radius, fn) {
    const cs = this.cellSize;
    const cx = (x / cs) | 0;
    const cy = (y / cs) | 0;
    const span = Math.max(1, Math.ceil(radius / cs));
    const r2 = radius * radius;
    for (let gy = cy - span; gy <= cy + span; gy += 1) {
      for (let gx = cx - span; gx <= cx + span; gx += 1) {
        const bucket = this.grid.get(gy * 4096 + gx);
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i += 1) {
          const other = bucket[i];
          const dx = other.x - x;
          const dy = other.y - y;
          if (dx * dx + dy * dy <= r2) {
            if (fn(other) === true) return true;
          }
        }
      }
    }
    return false;
  }

  tileAt(x, y) {
    const world = this.world;
    const tx = clamp(Math.floor(x), 0, world.w - 1);
    const ty = clamp(Math.floor(y), 0, world.h - 1);
    return ty * world.w + tx;
  }

  // ── 主循环 ──────────────────────────────────────────────
  step(dtDays) {
    const world = this.world;
    this.processPendingSpawns();
    this.rebuildGrid();

    const list = world.entities;
    let dirtyTerrain = false;

    for (let i = 0; i < list.length; i += 1) {
      const e = list[i];
      if (this.stepEntity(e, dtDays)) dirtyTerrain = true;
    }

    // 清除死者与飞升者。
    // 用「就地压缩」而不是「与末尾交换后 pop」：后者在倒序遍历时会跳过被换到
    // 已访问位置的元素，导致尸体留到下一 tick 才清。
    let w = 0;
    for (let i = 0; i < list.length; i += 1) {
      const e = list[i];
      if (e._ascended) continue;                    // 已登仙，无需再算生死
      if (e.hp <= 0 || e.age >= e.lifespan) {
        this.onDeath(e);
        continue;
      }
      list[w] = e;
      w += 1;
    }
    list.length = w;

    this.syncVillagePops();
    this.stepVillages(dtDays);
    this.stepFounding(dtDays);
    this.stepWildlife(dtDays);
    stepSects(world, this, dtDays, this.rng);
    // 大战（L1）：跨数年、可拉盟友、有特殊结局的大规模战事。
    // ⚠️ 必须排在 `stepSects` **之后**——它读的接壤表
    // （`world._terrBorder` / `_terrBorderAt` / `_terrContested`）是
    // `stepSects → stepTerritory` 每 30 日重算出来的推导量。
    // 用的是独立的 `warRng`，理由见构造函数里那段注释。
    stepWar(world, this.warRng, dtDays);
    stepRelations(world, this, dtDays, this.rng);
    // 世家：立族 / 声望 / 兴衰 / 断绝。每 360 日普查一次（见 sim/family.js），
    // 全部走哈希与确定性排序，**不抽签**——主随机流一点都不动，
    // 世界轨迹才与上一轮可比。
    stepFamily(world, this, dtDays);
    // 转世者想起前世。放在生死清理**之后**：本 tick 刚死的人不该同一 tick 就觉醒。
    stepReincarnation(world, dtDays, this.rng);
    stepSites(world, dtDays, this.rng);
    // 法宝的时钟：器灵初生 / 地上朽坏 / 路人拾取（每 90 日一趟，见 artifacts.js）
    stepArtifacts(world, dtDays, this.rng);
    this.events.step(dtDays);
    // 卜算子：结算里程碑与亲缘升阶。
    // 放在 sim 里而不是 main.js 里，是为了让无头长测也能跑到——
    // 不然「他到底会不会开口」这件事永远只有打开浏览器才知道。
    tickBusanzi(world, this.rng);

    this.yearTickCooldown += dtDays;
    if (this.yearTickCooldown >= 360) {
      this.yearTickCooldown = 0;
      world.year = Math.floor(world.day / TIME.daysPerYear);
    }
    if (dirtyTerrain) world.touch();
  }

  /**
   * 村庄人口一律「现算」，不做增量记账。
   *
   * 之前的写法是出生 +1、死亡 -1，任何一个漏掉的路径（改宗、迁村、飞升）
   * 都会让计数永久偏移，而繁衍闸门恰好依赖这个计数——一旦虚高就再也不生孩子，
   * 整个文明会在两百年内静悄悄地灭绝。现算和灵气层一样，是推导量。
   */
  syncVillagePops() {
    const world = this.world;
    for (let i = 0; i < world.villages.length; i += 1) world.villages[i].pop = 0;
    for (let i = 0; i < world.entities.length; i += 1) {
      const e = world.entities[i];
      if (!e.village) continue;
      const v = world.villageById(e.village);
      if (v) v.pop += 1;
    }
  }

  /** 返回 true 表示改动了地形（需要重算类型） */
  stepEntity(e, dtDays) {
    const world = this.world;
    // ── 本 tick 的寿元快照（**临时字段，不进存档**）──────────────────
    // `diedOfOldAge` 用它把「寿终正寝」与「寿元被砸到 age 以下而死」分开：
    // 若本 tick **开始时** age 还没到（那时的）寿元，而结束时到了，
    // 那这个寿元就是**本 tick 内被改小的**——`applyBreakthroughFailure`
    // 突破失败会把 `lifespan` 按低一档境界**重算**（三个后果档里有两个这么做），
    // 于是 `age >= lifespan` 在同一个 tick 里变成真。
    // 那属于「寿元折损而死」，**不得**判成寿终——否则它会被静默地
    // 算进 `gone` / `natural` 两条魂路，把魂路账本变成假读数。
    // ⚠️ 下划线前缀字段**不进存档**：`save.js` 的实体行是**显式位置数组**
    //    （`entities.map((e) => [ ... ])`），只写列出来的那些列。
    //    而且它每个 tick 开头都被重写，跨存档没有任何意义。
    e._lifespan0 = e.lifespan;
    // ⚠️⚠️ **已经死了就别再动**（2026-09-21 修）。这一句不是多余的防御。
    //
    // `step()` 的顺序是：**先**把每个生灵过一遍 `stepEntity`（:330），
    // **然后**才做死亡清扫（:340 的 `if (e.hp <= 0 || e.age >= e.lifespan)`）。
    // 而 `stepEntity` 后半段有「进食回血」（站在有肥力的地上 `hp += maxHp * …`）。
    // 于是 hp 已经掉到 0 的生灵，会在**同一 tick 里先被治疗、再被清扫**——
    // 清扫看到的是一个 hp > 0 的健康人，**这条命就被无声地救回来了**。
    //
    // 这个洞有两个来源，第二个才是要命的：
    //   1. 神力（`powers.js` 的抹除/雷霆/陨石/瘟疫）把 hp 打到 0 之后不再 splice；
    //   2. **普攻也是**——`attack()` 扣的是**目标**的血，而目标是否会被救回，
    //      取决于它在 `world.entities` 里的**下标先后**：目标排在攻击者**后面**时，
    //      它的回血块跑在致死伤害**之后**，于是**致死一击被治疗抵消**。
    //      也就是说「这一刀杀没杀死」曾经依赖数组顺序，而且**不报错**。
    //
    // 实测（`scripts/_diag_powerdeath.mjs`）：标死 738 个，**436 个被救活**；
    // `eraseLife` 与 `plague` 是 **100% 被救活**（那两处等于没修）。
    //
    // 加了这一句之后，`hp <= 0` 才真正等于「本 tick 必死」：
    // 它不再行动、不再回血，随后由死亡清扫正常走 `onDeath`。
    if (e.hp <= 0) return false;
    const info = SPECIES_INFO[e.sp] || SPECIES_INFO.human;
    e.anim += dtDays * 2.4;

    // 修炼推进（内部会累加 age、处理寿元与突破）
    const status = stepCultivation(world, e, dtDays, this.rng);
    if (status === 'ascended') {
      e._ascended = true;
      return false;
    }
    if (status !== 'alive') return false;

    const here = this.tileAt(e.x, e.y);
    if (!world.isWalkable(here)) {
      // 脚下的地没了（被水淹 / 被抬高成山），立刻寻找最近的可行地
      const escape = this.findSpawnSpot(Math.floor(e.x), Math.floor(e.y), 5);
      if (escape) {
        e.x = escape[0] + 0.5;
        e.y = escape[1] + 0.5;
      } else {
        // 死因标记：脚下的地没了（被水淹 / 被抬高成山）⇒ `deathOther`。
        // 标记会被本 tick 后面更晚的致死点覆盖，只有真死那次会被清扫读到。
        e.diedOf = 'lost';
        e.hp = 0;
        return false;
      }
    }

    // 进食：站在有肥力的地上就回血
    const fert = world.fertility(here);
    if (fert > 0.2 && world.fire[here] < 0.2) {
      const eat = Math.min(1, fert * dtDays * 0.05);
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * eat * 0.35);
      e.carried = Math.min(1, e.carried + eat * (info.diet > 0 ? 0.5 : 0));
      if (world.veg[here] > 0.05) world.veg[here] = Math.max(0, world.veg[here] - eat * 0.35);
    } else {
      // 死因标记：站在无肥力的地上挨饿 ⇒ `deathOther`（不是寿终）。
      e.diedOf = 'famine';
      e.hp -= e.maxHp * dtDays * 0.00035;
    }

    if (world.fire[here] > 0.4) {
      // 死因标记：被烧死 ⇒ `deathOther`。写在这里、排在饥荒之后，
      // 于是「既挨饿又着火」时以火为准（火焰是更直接的致死因由）。
      e.diedOf = 'fire';
      e.hp -= e.maxHp * dtDays * 0.25;
    }

    // 走火入魔：不按常理行事，见谁打谁
    //
    // ⚠️ 入魔者**绕过「避世」**：本分支在下面 `canFight` 之前就 `return`，
    //    所以 `isSecluding(e)` 对入魔者不成立——寿元将尽的修士一旦入魔，
    //    仍会主动打人，也仍会被所有人围杀（`findEnemy` 里「走火入魔者见谁打谁，
    //    所以谁见了都该躲」那段把入魔者判成所有人的敌人）。
    //    **避世只保护「没入魔」的老修士。**
    //
    //    另一半仍然有效：未入魔的避世者，`findEnemy` 会把附近的入魔者
    //    判成敌人 ⇒ `canFight=false` ⇒ 走撤退分支逃跑（逃逸 ×1.35）。
    //    ⚠️ 只有**同级**追不上：`realmBoost`（见 `moveTowards`）随境界上升，
    //    高一大境界的追人者追得上。所以避世躲得掉「别人入魔」，躲不掉「自己入魔」。
    //
    //    实测（`scripts/_diag_cultdeath.mjs`，300 年 · seed 20260914）：
    //    修士横死 **69.5% 与入魔有关**（洁净区 STEP=1，9849 例；STEP=3 口径为 68.0%）
    //    ⇒ 这一条的标定杠杆在 `MAD_DAYS`（sim/cultivation.js:57）与突破失败的入魔档。
    //
    //    ⚠️ 但「调 `SECLUSION_AGE_FRACTION` 也救不了」这个结论，理由**不是**上面那个 69.5%。
    //    **2026-09-22 更正**：本注释此前写的 `hL_eff = hL·[f + (1−f)/k] ≥ hL·f`
    //    （⇒ 降幅上限恒为 `1/f` ⇒ `f ≤ 0.079`）**已作废**——那个公式隐含「年龄在寿命上
    //    **均匀**分布」，而实测（`scripts/_seclusionprobe.mjs`，**1602 万次采样**）全带
    //    `age/lifespan` **最大只有 0.429**；覆盖曲线是
    //    f=0.80→**0.00%** / 0.40→0.00% / 0.20→0.17% / 0.10→**7.34%** / 0.05→33.07%。
    //    公式预测 f=0.10 覆盖 90%，实测 7.34%，**差 12 倍** ⇒ 公式系统性**低估**难度。
    //    正确的理由不是「`k` 不够」，而是「**靶子太小**」：元婴达标需覆盖 **≥92.1%**，
    //    对应 `f ≈ 0.01`（元婴 15 岁就退隐）⇒ 机制语义崩塌，`k` 再大也没用。
    //
    //    ⚠️ 而且避世**本来就砍不掉入魔那一条**（见上：入魔分支绕过本判据）。
    //    能达标的杠杆必须作用在**所有战斗通道共同的下游** —— 见本文件的 `attack()`。
    if (e.madUntil > world.day) {
      e.state = 'mad';
      const victim = this.findAnyNear(e, 10);
      if (victim) {
        e.tx = victim.x;
        e.ty = victim.y;
        this.attack(e, victim, dtDays);
      } else {
        e.timer -= dtDays;
        if (e.timer <= 0) {
          e.timer = 6 + this.rng() * 8;
          e.tx = e.x + (this.rng() * 2 - 1) * 14;
          e.ty = e.y + (this.rng() * 2 - 1) * 14;
        }
      }
      this.moveTowards(e, dtDays, info);
      return false;
    }

    // 状态机
    e.timer -= dtDays;
    const enemy = this.findEnemy(e, 9);
    if (enemy) {
      // 凡人不会空手去和灵兽或修士拼命——掉头就跑。
      // 这条规则是人口稳定的关键：凡人速度 1.0、逃逸时 ×1.35，
      // 灵兽只有 0.85，所以只要肯跑就一定能甩掉。
      // ⚠️ 2026-09-21 修：**重伤也要能撤**。
      //
      // 原判据只看境界（`level >= 1` 就永远 `fight`），于是「重伤撤退」那条分支
      // （下面 `else if (e.hp < e.maxHp * WOUNDED_HP_FRACTION)`）**只在「附近没有敌人」
      // 时才可达**——也就是说它恰恰在最需要它的时候跑不到：修士只要身边有敌人，
      // 就会一路打到死，重伤也不例外。**这是一段永远不起作用的死逻辑。**
      //
      // 后果是**量出来的**，不是推的（300 年普查，`scripts/_oldagecensus.mjs`）：
      //   · 修士（level >= 1）死 9807 人次，**寿终 0 人次**（100% 横死）；
      //   · 临死年龄中位数只有 **5.6 岁**，而炼气寿元就有 110 岁；
      //   · 同一窗口凡人（会逃）是 21756/28447 寿终。
      // 「暴力危险率 × 寿元」：修士 ≈ 25.5 · 凡人 ≈ 1.0 → P(寿终) ≈ e^-25 ≈ 1e-11。
      // 直接后果：`deathRoute` 的 `gone`（魂火散尽，要求「寿终」）与 `natural`
      // 在真实世界里**结构上不可达**（见 `INKBOX.md` §29.3）。
      //
      // 所以让「能不能打」同时取决于血量：低于同一个阈值就转入撤退，
      // 复用下面那条本来就写好的逃跑分支（`pickFleeTarget(e, enemy)` 会**背着**敌人跑）。
      //
      // ⚠️ 这一改**会移动世界线**：撤退分支会抽 `Life.rng`，而以前修士从不走到那里。
      //    既有长测基线必须重跑，不能沿用；改完也要重新实测五路分布。
      //
      // ⚠️ 2026-09-21 续：寿元将尽者「避世」。即便没受伤，只要 `isSecluding(e)`
      //    为真就一律不接战，走下面同一条撤退分支——被攻击时优先逃离。
      //    判据是确定性的（只读 `age` / `lifespan`），**不新增任何 `this.rng` 抽取**；
      //    但它会让这些老修士**改走**撤退分支（那里本来就有抽签），世界线因此移动。
      const secluding = isSecluding(e);
      const canFight = !secluding
        && (e.level || 0) >= 1
        && e.hp >= e.maxHp * WOUNDED_HP_FRACTION;
      if (canFight) {
        e.state = 'fight';
        e.tx = enemy.x;
        e.ty = enemy.y;
        e.timer = 1.2;
        this.attack(e, enemy, dtDays);
      } else {
        e.state = 'flee';
        if (e.timer <= 0) {
          const away = this.pickFleeTarget(e, enemy);
          e.tx = away[0];
          e.ty = away[1];
          e.timer = 5 + this.rng() * 6;
        }
      }
    } else if (e.hp < e.maxHp * WOUNDED_HP_FRACTION) {
      e.state = 'flee';
      if (e.timer <= 0) {
        const away = this.pickFleeTarget(e, null);
        e.tx = away[0];
        e.ty = away[1];
        e.timer = 6 + this.rng() * 6;
      }
    } else if (e.timer <= 0) {
      const plan = this.planNext(e, info);
      e.tx = plan.x;
      e.ty = plan.y;
      e.state = plan.state;
      e.timer = plan.duration;
    }

    this.moveTowards(e, dtDays, info);
    return false;
  }

  planNext(e, info) {
    const world = this.world;
    const village = e.village ? world.villageById(e.village) : null;
    const r = this.rng;

    // 无家可归的凡人会朝最近的村子走。村子之外没有繁衍，
    // 不入村就等于慢性绝后，所以这是他们最该做的事。
    if (!village && info.canBuild && (e.level || 0) <= 0) {
      const near = this.nearestVillage(e.x, e.y, 48);
      if (near) return { x: near.x + 0.5, y: near.y + 0.5, state: 'return', duration: 18 + r() * 16 };
    }

    // 修士优先找灵气厚的地方打坐
    if ((e.level || 0) > 0) {
      const roll = r();
      if (roll < 0.42) {
        // 去最近的秘境 / 洞府碰机缘
        const sites = world.sitesNear(e.x, e.y, 30);
        if (sites.length && sites[0].site.kind !== 'formation') {
          const s = sites[0].site;
          return { x: s.x + 0.5, y: s.y + 0.5, state: 'seek', duration: 20 + r() * 20 };
        }
      }
      if (roll < 0.8) {
        const spot = this.findBestTile(e, 16, (i) => world.qi[i] + (world.struct[i] ? -0.4 : 0));
        if (spot) return { x: spot[0] + 0.5, y: spot[1] + 0.5, state: 'cultivate', duration: 22 + r() * 26 };
      }
    }

    if (village && info.canBuild) {
      const roll = r();
      if (roll < 0.3) {
        // 回家（村里有屋可栖）
        const house = village.houses.length
          ? village.houses[Math.floor(r() * village.houses.length)]
          : { x: village.x, y: village.y };
        return { x: house.x + 0.5, y: house.y + 0.5, state: 'return', duration: 12 + r() * 14 };
      }
      if (roll < 0.58) {
        // 务农：去肥力最高的近处
        const spot = this.findBestTile(e, 12, (i) => world.fertility(i) + (world.struct[i] === 0 ? 0 : -0.4));
        if (spot) return { x: spot[0] + 0.5, y: spot[1] + 0.5, state: 'forage', duration: 14 + r() * 16 };
      }
    }

    const spot = this.findBestTile(e, 14, (i) => world.fertility(i) * 1.2 + r() * 0.3);
    if (spot) return { x: spot[0] + 0.5, y: spot[1] + 0.5, state: 'forage', duration: 10 + r() * 16 };
    return { x: e.x + (r() * 2 - 1) * 8, y: e.y + (r() * 2 - 1) * 8, state: 'wander', duration: 8 + r() * 10 };
  }

  pickFleeTarget(e, threat) {
    const world = this.world;
    // 有明确的威胁时，沿着「背离威胁」的方向逃，而不是随机乱窜
    const baseAngle = threat
      ? Math.atan2(e.y - threat.y, e.x - threat.x)
      : this.rng() * Math.PI * 2;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const angle = baseAngle + (this.rng() * 2 - 1) * 0.7;
      const dist = 10 + this.rng() * 14;
      const x = clamp(e.x + Math.cos(angle) * dist, 1, world.w - 2);
      const y = clamp(e.y + Math.sin(angle) * dist, 1, world.h - 2);
      const i = this.tileAt(x, y);
      if (world.isWalkable(i) && world.fire[i] < 0.2) return [x, y];
    }
    return [e.x, e.y];
  }

  findBestTile(e, radius, score) {
    const world = this.world;
    const cx = Math.floor(e.x);
    const cy = Math.floor(e.y);
    let best = null;
    let bestScore = -Infinity;
    for (let k = 0; k < 26; k += 1) {
      const tx = cx + Math.floor((this.rng() * 2 - 1) * radius);
      const ty = cy + Math.floor((this.rng() * 2 - 1) * radius);
      if (!world.inside(tx, ty)) continue;
      const i = world.idx(tx, ty);
      if (!world.isWalkable(i)) continue;
      const value = score(i);
      if (value > bestScore) {
        bestScore = value;
        best = [tx, ty];
      }
    }
    return best;
  }

  moveTowards(e, dtDays, info) {
    const world = this.world;
    const dx = e.tx - e.x;
    const dy = e.ty - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.35) return;

    const here = this.tileAt(e.x, e.y);
    const terrainSpeed = TERRAIN_SPEED[world.type[here]] ?? 1;
    // 高境界的修士御剑而行，走得更快
    const realmBoost = 1 + Math.min(1.4, (e.level || 0) * 0.026);
    const speed = BASE_TILES_PER_DAY * info.speed * terrainSpeed * realmBoost * (e.state === 'flee' ? 1.35 : 1);
    const stepLen = speed * dtDays;
    if (stepLen <= 0) return;

    // ── 子步化（2026-09-21 修）──────────────────────────────────────
    // 为什么必须拆：`canStep` **只检查终点那一格**（见它自己的实现），
    // 不做路径采样，三个候选点全失败时也只是 `e.timer = 0` 重新规划，
    // **没有任何钳制**。而 `stepLen = speed × dtDays` 会随倍速线性放大
    // （`main.js:1084` 的 `days = baseDaysPerSecond × speed × dt`），
    // 于是 dtDays 一大，实体每步位移就超过 1 格——**可以直接穿过山脊、河流与墙**。
    // 各境界的穿墙起点（60fps，`_diag_speedhazard.mjs` 实测换算）：
    //   凡人 9.5× · 炼气 7.4× · 金丹 4.6× · **化神 3.2×**（境界越高跑得越快，越早穿）。
    //
    // 第二个后果更要紧：交战双方每 tick **直接跨过对方**，接触时间塌掉。
    // 实测命中/游戏年 **1732 → 46（−97%）**、挥空率 **71% → 98%**。
    // 那正是「高倍速下修士反而寿终变多」的**唯一**成因——不是寿命机制，
    // 是坏掉的战斗系统。所以这一改不只是修穿墙，也是把那个伪影拆掉。
    //
    // 拆成 ≤ `MAX_SUBSTEP` 格的小段、逐段 `canStep`，**总位移仍是 `stepLen`**，
    // 所以「每游戏日走多远」不变——倍速只改「看多快」，不改「发生什么」。
    //
    // ⚠️ 本函数**一次 `this.rng` 都不抽**，所以子步化不会扰动主随机流（铁律一）。
    // ⚠️ `MAX_SUBSTEP = 0.5` ⇒ `stepLen <= 0.5` 时 `n === 1`，
    //    此时与改前**逐字等价**：1×（0.05 天/步）与 2×（0.10）的世界线完全不动，
    //    只有 4× 以上才变。这不是巧合，是选 0.5 而不是更小值的原因。
    // ⚠️ 代价：每步多出 `n-1` 次 `canStep`。STEP=3 的粗粒度探针里 n 可达 13–38，
    //    长测会变慢；换来的是一份**能代表浏览器行为**的读数。
    const MAX_SUBSTEP = 0.5;
    const n = Math.max(1, Math.ceil(stepLen / MAX_SUBSTEP));
    const seg = stepLen / n;

    for (let k = 0; k < n; k += 1) {
      // 每段都重算朝向：目标可能在本段内被走到，也可能被地形逼着绕行
      const dxk = e.tx - e.x;
      const dyk = e.ty - e.y;
      const distk = Math.hypot(dxk, dyk);
      if (distk < 0.35) return;
      const ux = dxk / distk;
      const uy = dyk / distk;
      const nx = e.x + ux * seg;
      const ny = e.y + uy * seg;

      if (this.canStep(nx, ny)) {
        e.x = nx;
        e.y = ny;
        if (Math.abs(ux) > 0.05) e.face = ux > 0 ? 1 : -1;
        continue;
      }
      // 撞墙：沿垂直方向绕行（比完整寻路便宜，足够表现「绕路」的感觉）
      const sx = e.x + -uy * seg;
      const sy = e.y + ux * seg;
      if (this.canStep(sx, sy)) {
        e.x = sx;
        e.y = sy;
        continue;
      }
      const sx2 = e.x + uy * seg;
      const sy2 = e.y + -ux * seg;
      if (this.canStep(sx2, sy2)) {
        e.x = sx2;
        e.y = sy2;
        continue;
      }
      // 三个候选点都不通：本 tick 到此为止，下一 tick 重新规划
      e.timer = 0;
      return;
    }
  }

  canStep(x, y) {
    const world = this.world;
    if (x < 1 || y < 1 || x > world.w - 2 || y > world.h - 2) return false;
    const i = this.tileAt(x, y);
    if (!world.isWalkable(i)) return false;
    if (world.struct[i] === 3) return false;
    return true;
  }

  findEnemy(e, radius) {
    // ── 养伤：不出战，也不逃 ──────────────────────────────
    // 「败退」的兑现方式。**必须放在本函数内部、而不是调用点**：
    // 调用点将来可能增加，闸门放在函数里就不会漏。
    // ⚠️ 返回 `null` 而不是「标记一下再走原逻辑」——`null` 会让 `stepEntity`
    //    整个跳过接战分支，于是养伤者不接战、不逃跑、照常觅食修炼。
    //    这也让 `canFight` **一行都不用改**（它只在本函数返回非空时才会被求值）。
    if (e.restUntil > this.world.day) return null;
    let found = null;
    this.forEachNear(e.x, e.y, radius, (other) => {
      if (other === e || other.hp <= 0) return false;
      // 养伤中的人**不是目标**（否则他会被留在原地继续挨打，
      // 而「养伤」就退化成了「站在原地的活靶子」）。
      if (other.restUntil > this.world.day) return false;
      const d = Math.hypot(other.x - e.x, other.y - e.y);
      // 灵兽护食守土，不会跨半张地图追杀凡人。
      // 早先不限距离时，九十头灵兽能把整个人口在四十年内吃干净。
      if (other.sp === SPECIES.BEAST && e.sp !== SPECIES.BEAST) {
        if (d > BEAST_AGGRO_RANGE) return false;
        found = other;
        return true;
      }
      if (e.sp === SPECIES.BEAST && other.sp !== SPECIES.BEAST) {
        if (d > BEAST_AGGRO_RANGE) return false;
        found = other;
        return true;
      }
      // 走火入魔者见谁打谁，所以谁见了都该躲
      if (other.madUntil > this.world.day) {
        found = other;
        return true;
      }
      if (other.faction && e.faction && other.faction !== e.faction) {
        const fa = this.world.factionById(e.faction);
        const fb = this.world.factionById(other.faction);
        if (fa && fb && fa.war && fa.war.has(fb.id)) {
          found = other;
          return true;
        }
      }
      // 私人恩怨：宿敌与仇怨，靠近了就动手
      if (e.relations && e.relations.size) {
        const rel = e.relations.get(other.id);
        if (rel && (rel.type === RELATION_TYPES.RIVAL || rel.type === RELATION_TYPES.ENMITY) && rel.score < -40) {
          found = other;
          return true;
        }
      }
      return false;
    });
    return found;
  }

  /** 走火入魔时不分敌我 */
  findAnyNear(e, radius) {
    // 养伤中：不出战（同 `findEnemy`）。⚠️ 入魔是**独立的第二条接战路径**
    // （它在 `canFight` 之前就 `return`），所以这道闸门**必须单独加一次**。
    if (e.restUntil > this.world.day) return null;
    let found = null;
    this.forEachNear(e.x, e.y, radius, (other) => {
      if (other === e || other.hp <= 0) return false;
      if (other.sp === SPECIES.BEAST) return false;
      if (other.restUntil > this.world.day) return false;
      found = other;
      return true;
    });
    return found;
  }

  attack(e, target, dtDays) {
    const dist = Math.hypot(target.x - e.x, target.y - e.y);
    if (dist > 1.6) return;
    const power = combatPower(e);
    const defense = combatPower(target);
    const damage = power * 3.4 * dtDays * (0.6 + this.rng() * 0.8);
    // ⚠️ 减伤后的伤害**只算一次**存进 `hit`。原代码在下面的致死判定里
    //    **重算了一遍**同一个表达式——两处一旦分叉，击杀记账会静默算错。
    const hit = damage * (10 / (10 + defense * 0.35));
    target.hp -= hit;

    // ── 养伤（轻伤档）：打了一架、被打伤但没死 ⇒ 半年不出战 ──────────
    // ⚠️ 三条守卫缺一不可：
    //    `hp > 0`        —— 已经死了的不走这里（它走下面的致死分支）
    //    `hp < 32%`      —— 只有**真的被打伤**才算「打了一架」
    //    `!(restUntil>day)` —— 不覆盖更长的既有养伤，否则
    //                          「重伤养三年」会被随后一次轻伤改写成半年
    // ⚠️ 只给**被打的那一方**加（赢家没受伤）。
    // ⚠️ 只在 `attack()` 里触发：饥荒 / 秘境 / 天雷扣血不算「打了一架」。
    if (target.hp > 0
      && target.hp < target.maxHp * WOUNDED_HP_FRACTION
      && !(target.restUntil > this.world.day)) {
      target.restUntil = this.world.day + WOUNDED_REST_DAYS;
    }

    if (target.hp <= 0 && target.hp + hit > 0) {
      // ── 手下留情（重伤档）：致死一击有 `MERCY` 的概率留一口气 ────────
      // 抽中 ⇒ 目标留 5% 血、养伤三年、**本次不做任何击杀记账**
      //（不加 `kills` / 不加 faction kills / 不 `addKarma` / 不 `wearArtifacts`）。
      // ⚠️ `MERCY > 0 &&` 是短路：取 0 时**一次签都不抽**，世界线与关掉本机制时逐位相同。
      if (MERCY > 0 && mercyRngFor(this.world)() < MERCY) {
        target.hp = Math.max(1, target.maxHp * 0.05);
        target.restUntil = this.world.day + GRIEVOUS_REST_DAYS;
        return;
      }
      e.kills += 1;
      // ── 凶手快照：让编年史说得出「谁杀的」────────────────────────
      // 为什么必须在这里盖戳，而不是在 `onDeath` 里现查：
      //   致死一击发生在这里（`stepEntity` 循环内），而 `onDeath` 是**另一个循环**
      //   （`step()` 的死亡清扫）里调的，那时拿不到凶手。`necrology.js:53-59`
      //   如实记着这个缺口，并因此让 `recordDeath` 的第 4 个参数**恒传 `null`**。
      //   代价是：`core/lore.js:333-336` 那两行战斗致死文案
      //   「【{name}】陨落于{place}，死于【{killer}】之手。」
      //   **从未被选中过**，每个被打死的修士都走了 `deathNatural` ⇒
      //   编年史对着一个横死的人印「寿终正寝」/「坐化」。这不是缺功能，
      //   是**编年史在说谎**，而文案早就写好了（故障类 8：机制在、从不发生）。
      // ⚠️ 存**快照**不存引用（铁律 3）：`onDeath` 之后凶手自己也可能死掉。
      // ⚠️ 换模板**不扰动主随机流**：`narrate()` 无论走哪个池都只 `pickFrom`
      //    一次（`core/lore.js:522-526`），抽取次数不变。
      // ⚠️ 本字段在同一 `step()` 内被 `onDeath` 消费掉，跨不过 tick，
      //    因此不进存档（已在 `io/save.js` 的 `VOLATILE` 登记并写明理由）。
      target.killedBy = { id: e.id, name: e.name };
      if (e.faction) {
        const f = this.world.factionById(e.faction);
        if (f) f.kills += 1;
      }
      // 杀同门或同族会积因果
      if (target.faction === e.faction) {
        addKarma(this.world, e, 12, '同室操戈');
      } else {
        addKarma(this.world, e, 3, null);
      }
      // 杀人磨法宝。**只算「杀」不算每次挥剑**——按挥剑算的话，
      // 一场混战下来身上的东西全碎了，而玩家只会看到「法宝怎么老没」。
      // 排在这一段最后，是为了不打乱上面那几处既有的随机流。
      wearArtifacts(this.world, e, KILL_WEAR, this.rng);
    }
  }

  onDeath(e) {
    const world = this.world;
    // ── 逝者名录（见 sim/necrology.js）─────────────────────
    // ⚠️ 必须在**最开头**、且在 `onDeathRelations` 之前。三个理由，缺一个就静默地少一段：
    //   ① 关系网还完整——`onDeathRelations` 会把别人指向他的关系清掉，
    //      清完之后再解析，每条亲属都变成「一位姓名失载的旧识」；
    //   ② `entity.artifacts` 还在——下面的 `dropArtifacts` 会把法宝搬走，
    //      那时再入册，随葬法宝永远是空的；
    //   ③ `entity.log` 还没被后续步骤改写。
    // ⚠️ 也必须在 `if ((e.level || 0) > 0)` 之外：凡人也有名字、也有家世，
    //    他们的死同样不该消失。`rememberDead` 是**纯读**，一次 rng 都不抽，
    //    所以把凡人一起收进来不会扰动主随机流。
    //
    // ⚠️ 接住返回值：入册那一刻**还不知道**这条魂归哪一路（路要等下面的
    //    `enterNether` 才判得出来，中间还隔着夺舍）。所以名册先留 `null`，
    //    下面两条互斥的去向各自把那一笔补上：
    //      · 夺舍成功 → 本函数直接写 `'possess'`（他没走幽冥，`enterNether` 不会被调）；
    //      · 否则     → `enterNether` 内部回填（见 necrology.js 的 `markSoulRoute`）。
    //    漏掉任何一条，那个人在名册上都会与「没留下魂的凡人」长得一样。
    const memoRecord = rememberDead(world, e, 'dead');
    // 村庄人口不在这里减——它是每 tick 现算的推导量（见 syncVillagePops）
    if ((e.level || 0) > 0) {
      // `e.killedBy` 是 `attack()` 在**同一 tick 的致死一击处**盖的凶手快照。
      // 没盖到 ⇒ `undefined` ⇒ 传 `null` ⇒ 不走战斗池。
      // `e.diedOf` 是各**致死点**（饿死 / 烧死 / 失所 / 天劫 / 因果 / 秘境 / 战殁）
      // 盖下的**因由**标记，同 tick 易失。`recordDeath` 据此选池：
      //   有 killer ⇒ `death`（战死）；否则 `diedOf` 是灾劫类 ⇒ `deathOther`；
      //   否则（含残留 `undefined`）⇒ `deathNatural`（真·寿终）。
      // ⚠️ 真寿终在 `stepEntity` 的 `age >= lifespan` 分支里**已经记过一次**并置了
      //    `_deathRecorded`，这里那次会被去重挡掉——所以寿终不会被这条 `diedOf`
      //    残留标记带偏（那一处显式传 `null`）。
      // ⚠️ 用 `?? null` 而不是 `|| null`：两者在这里等价（快照是对象或 undefined），
      //    但 `??` 表明「只兜 undefined/null」，不会把未来的 `0`/`''` 误吞。
      recordDeath(world, e, this.rng, e.killedBy ?? null, e.diedOf ?? null);
      // ── 夺舍（见 sim/possession.js）───────────────────────
      // 修士死了，元神不一定散：境界够高的能抢一具还活着的、境界更低的肉身。
      // 这是「转世」的另一半，两者**共用同一条死讯，所以必须互斥**——
      // 沙盒的神魂池有上限（120），不允许一次死亡产出两条命。
      //
      // ⚠️ 两个顺序约束都不能动：
      //   · 必须在 `enterNether` **之前**，并用返回值决定要不要进神魂池
      //     ——这就是「互斥」的全部实现；
      //   · 必须在 `onDeathRelations` **之前**——亲友察觉要读夺舍者
      //     **自己的**关系网，而那一步会把别人指向他的关系清掉
      //     （reincarnation.js 的宿缘为同一件事踩过坑）。
      const possessed = tryPossession(world, e, this.rng);
      // 神魂入幽冥：决定这条命还回不回来（见 sim/reincarnation.js）。
      // ⚠️ 必须排在 onDeathRelations 之前——宿缘是从他**自己的关系网**里抽的，
      // 而那一步会把别人指向他的关系清掉。顺序反了抽出来的宿缘就少一半。
      //
      // ⚠️ 两条去向**必须显式分开写**，不能写成 `if (!possessed) enterNether(...)`
      //    一句了事：那样夺舍者会从名册上**消失**（`soulRoute` 停在 `null`，
      //    与「没留下魂的凡人」逐字相同），玩家看着「他死了」却查不到任何去向。
      //    这是个纯静默的坏法——不报错、不 NaN，只是面板上少一行。
      if (possessed) {
        // 元神夺舍：这条命**没有**走幽冥（`soulLog` 也照规矩不给他记一笔），
        // 所以名册上写的是「他还在，只是换了具身子」，不是五路里的任何一路。
        if (memoRecord) memoRecord.soulRoute = SOUL_ROUTE_POSSESS;
      } else {
        enterNether(world, e, this.rng);
      }

      // ── 遗物 ──────────────────────────────────────────────
      //
      // 这里原来是一句 `reward: e.techniques.length ? e.techniques[0].name : '残破法宝'`——
      // 也就是说「法宝」从来不是一个东西，只是**一个字符串**：写在遗蜕上给人看，
      // 谁也没拿到过它。现在换真家伙：法宝是实体，会落到下一个人手里，
      // 或者躺在地上等路过的修士捡（见 sim/artifacts.js）。
      const dropped = dropArtifacts(world, e, this.rng);
      for (let i = 0; i < dropped.length; i += 1) {
        const { artifact, heir } = dropped[i];
        if (heir) {
          world.record(narrate(this.rng, 'artifactInherit', {
            name: e.name, heir: heir.name, artifact: artifact.name, record: ownerLine(artifact).text,
          }), 'artifact', [e, heir]);
        }
      }
      const onGround = dropped.filter((d) => !d.heir);

      // 遗蜕：高境界者死后留下记号，附近的人可能去探
      if ((e.level || 0) >= 20 && this.rng() < 0.25 && world.sites.length < MAX_SITES) {
        const heirTile = this.findBestTile(e, 8, () => this.rng());
        if (heirTile) {
          // 遗蜕上写什么，取决于他到底留下了什么：地上那件法宝的名字 > 他记得的功法 > 一句空话
          const relic = onGround.length ? onGround[0].artifact : null;
          world.addSite({
            kind: 'ruin',
            x: heirTile[0],
            y: heirTile[1],
            name: `${e.name}遗蜕`,
            reward: relic ? relic.name : (e.techniques.length ? e.techniques[0].name : '残破法宝'),
            // 只记 id，不记对象。有人先一步把法宝捡走、或者它朽坏了，
            // 进来的人就该扑空——`claimGroundArtifact` 会当场发现「东西没了」。
            artifactId: relic ? relic.id : 0,
            age: 0,
            visits: 0,
          });
          for (let i = 0; i < onGround.length; i += 1) {
            world.record(narrate(this.rng, 'artifactLost', {
              name: e.name, artifact: onGround[i].artifact.name,
              place: placeName(world, e), record: ownerLine(onGround[i].artifact).text,
            }), 'artifact', e);
          }
        }
      }
    }
    onDeathRelations(world, e, this.rng);
  }

  // ── 聚落 ────────────────────────────────────────────────
  foundVillage(x, y, factionId) {
    const world = this.world;
    if (world.villages.length >= LIMITS.maxVillages) return null;
    const village = {
      id: world.nextVillageId,
      x,
      y,
      faction: factionId,
      name: generateVillageName(this.rng),
      pop: 0,
      food: 12,
      houses: [],
      fields: 0,
      level: 1,
      hp: 100,
      buildCooldown: 20,
      age: 0,
    };
    world.nextVillageId += 1;
    world.villages.push(village);
    const faction = world.factionById(factionId);
    if (faction) faction.villages.push(village.id);
    // 村落级事件，无单一当事人：村子立起来不等于某个村民身上多了一件事。
    world.record(`${village.name} 立村`, 'settle');
    return village;
  }

  /**
   * 立村与开宗。
   *
   * ⚠️ 这两件事必须解耦。原先的写法是「立村时顺手开宗，开宗失败就不立村」，
   * 结果一：`maxFactions = 10` 一满，新村子就再也立不起来；
   * 结果二：`foundSect` 不挑创始人，于是凡人在开天辟地第二年就开出了十个宗门。
   * 现在的规矩是——村子先立起来（可以暂时无主），宗门另判，且只有筑基以上的
   * 修士才配开山立派。
   */
  stepFounding(dtDays) {
    this.foundingCooldown -= dtDays;
    if (this.foundingCooldown > 0) return;
    this.foundingCooldown = 30;

    const world = this.world;
    const settlers = [];
    for (let i = 0; i < world.entities.length; i += 1) {
      const e = world.entities[i];
      if (e.faction || e.village) continue;
      if (e.sp !== SPECIES.HUMAN && e.sp !== SPECIES.CULTIVATOR) continue;
      if (e.age < 300) continue;
      settlers.push(e);
    }
    if (settlers.length < 3) return;

    for (let i = 0; i < settlers.length; i += 1) {
      const e = settlers[i];
      const tx = Math.floor(e.x);
      const ty = Math.floor(e.y);
      const i0 = this.tileAt(tx, ty);
      if (!world.isBuildable(i0)) continue;
      if (world.fertility(i0) < 0.32) continue;
      if (this.villageNear(tx, ty, 11)) continue;

      const nearbySect = this.factionNear(tx, ty, 26);
      const village = this.foundVillage(tx, ty, nearbySect ? nearbySect.id : 0);
      if (!village) continue;

      let joined = 0;
      this.forEachNear(tx, ty, 14, (other) => {
        if (other.faction || other.village) return false;
        if (other.sp !== SPECIES.HUMAN && other.sp !== SPECIES.CULTIVATOR) return false;
        other.faction = village.faction;
        other.village = village.id;
        other.state = 'return';
        other.timer = 0;
        joined += 1;
        return false;
      });
      e.faction = village.faction;
      e.village = village.id;

      // 宗门：只有筑基以上、且身上没有宗门归属的修士，才在此开山立派
      if (!village.faction) {
        const founder = this.strongestNear(tx, ty, 18);
        if (founder && (founder.level || 0) >= SECT_FOUND_MIN_LEVEL && !founder.faction && founder.root) {
          const sect = foundSect(world, tx, ty, founder, this.rng);
          if (sect) {
            village.faction = sect.id;
            sect.villages.push(village.id);
            for (let k = 0; k < world.entities.length; k += 1) {
              const o = world.entities[k];
              if (o.village === village.id) o.faction = sect.id;
            }
          }
        }
      }
      if (joined + 1 >= 3) break;
    }
  }

  strongestNear(x, y, radius) {
    const world = this.world;
    let best = null;
    this.forEachNear(x, y, radius, (other) => {
      if (!best || (other.level || 0) > (best.level || 0)) best = other;
      return false;
    });
    void world;
    return best;
  }

  villageNear(x, y, radius) {
    const world = this.world;
    for (let i = 0; i < world.villages.length; i += 1) {
      const v = world.villages[i];
      if (Math.hypot(v.x - x, v.y - y) <= radius) return v;
    }
    return null;
  }

  nearestVillage(x, y, radius) {
    const world = this.world;
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < world.villages.length; i += 1) {
      const v = world.villages[i];
      const d = Math.hypot(v.x - x, v.y - y);
      if (d <= radius && d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  factionNear(x, y, radius) {
    const world = this.world;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < world.factions.length; i += 1) {
      const f = world.factions[i];
      const d = Math.hypot(f.capitalX - x, f.capitalY - y);
      if (d <= radius && d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    return best;
  }

  stepVillages(dtDays) {
    const world = this.world;
    for (let vi = world.villages.length - 1; vi >= 0; vi -= 1) {
      const village = world.villages[vi];
      village.age += dtDays;
      const cx = Math.floor(village.x);
      const cy = Math.floor(village.y);
      const center = this.tileAt(cx, cy);

      // 村子被毁：中心不可居 → 废弃。
      //
      // ⚠️ 这里只判「能不能走 + 有没有火」，不能判 isBuildable：
      // 第一座房子（祠堂）就盖在村子正中心，而 isBuildable 要求 struct === 0，
      // 于是村子一盖房就把自己判成废墟，hp 一路掉到底、整座村凭空消失。
      if (!world.isWalkable(center) || world.fire[center] > 0.4) {
        village.hp -= dtDays * 0.35;
        if (village.hp <= 0) {
          this.abandonVillage(village);
          world.villages.splice(vi, 1);
          continue;
        }
      } else if (village.hp < 100) {
        // 自愈：村子不是一次受灾就永久残废的
        village.hp = Math.min(100, village.hp + dtDays * 0.06);
      }

      // 吸纳流民。
      // 这一步是人口能否接续的关键：村子之外的人不生育，而世界开天辟地时
      // 那一百多号人若迟迟进不了村，就会整批自然老死、无人接班
      // （实测开局 117 人在十五年内掉到 11 人）。
      this.forEachNear(village.x, village.y, VILLAGE_ABSORB_RADIUS, (e) => {
        if (e.village) return false;
        if (e.sp !== SPECIES.HUMAN && e.sp !== SPECIES.CULTIVATOR) return false;
        e.village = village.id;
        if (!e.faction) e.faction = village.faction;
        return false;
      });

      // 领地：把村周边可耕之地标记为田，形成水墨里的「田垄」
      if (this.rng() < dtDays * 0.06) {
        const spot = this.findVillageTile(village, 5, (i) => world.isBuildable(i) && world.fertility(i) > 0.42);
        if (spot) {
          const i = world.idx(spot[0], spot[1]);
          if (world.over[i] === OVER.NONE) {
            world.over[i] = OVER.FARMLAND;
            recomputeRect(world, spot[0], spot[1], spot[0], spot[1]);
            village.fields += 1;
          }
        }
      }

      // 收成 = 人口耕作 + 田亩产出。
      //
      // ⚠️ 不能只看「村中心那一格的肥力」：村民天天在那附近啃食，植被被啃到零，
      // 肥力从 0.72 掉到 0.25，于是村子越住越穷，粮产跌破 20 的繁衍线，
      // 人口再也长不起来（实测卡在每村二十人上下）。田亩是村子的家底，
      // 只要开出来就一直有产出，这才撑得住繁衍与开枝散叶。
      const yieldPerDay = village.pop * 0.010 * (0.6 + world.fertility(center))
        + village.fields * FIELD_YIELD_PER_DAY;
      village.food += yieldPerDay * dtDays;
      village.food -= village.pop * dtDays * 0.0085;
      village.food = clamp(village.food, 0, 400);

      // 建造
      village.buildCooldown -= dtDays;
      if (village.buildCooldown <= 0) {
        village.buildCooldown = 30 + this.rng() * 40;
        const capacity = 3 + village.level * 4;
        if (village.food > 14 && village.houses.length < capacity) {
          // 第一座房子就落在村子正中心——那是祠堂，也是村子存在的凭据。
          // 其余房屋随机散布在村周。
          const first = village.houses.length === 0;
          const spot = first
            ? (world.isBuildable(center) ? [cx, cy] : this.findVillageTile(village, 6, (i) => world.isBuildable(i)))
            : this.findVillageTile(village, 6, (i) => world.isBuildable(i));
          if (spot) {
            const i = world.idx(spot[0], spot[1]);
            world.struct[i] = first ? 2 : 1;
            village.houses.push({ x: spot[0], y: spot[1], type: world.struct[i] });
            village.food -= 8;
            world.touch();
          }
        } else if (village.level < 4 && village.houses.length >= capacity && village.food > 40) {
          // ⚠️ 必须判断 level < 4：否则升到顶之后每次冷却都会重复「扩为王都」，
          // 编年史会被同一句话刷满（实测 800 年刷出 377 条）。
          village.level += 1;
          village.food -= 30;
          // 村落级事件，无单一当事人：升格的是聚落，不是某个村民。
          world.record(`${village.name} 扩为${['', '村落', '集镇', '城池', '王都'][village.level]}`, 'settle');
        }
      }

      // 繁衍：按人口算，而不是按村算。
      // 按村算的话 38 人的村和 3 人的村生得一样多，长期必然负增长而灭绝。
      // 凡人寿元约 4200 天，所以每人每天约需 1/4200 的生育率才能维持人口；
      // 取 4e-4 留出约一倍冗余，抵消战乱、饥荒与觉醒流失。
      const capacity = VILLAGE_CAPACITY_BASE + village.level * 10;
      const roomLeft = world.entities.length < POP_SOFT_CAP;
      if (roomLeft && village.pop < capacity && village.food > 20 && village.pop > 0) {
        const expected = village.pop * BIRTH_PER_CAPITA_DAY * dtDays;
        const births = Math.floor(expected) + (this.rng() < expected % 1 ? 1 : 0);
        if (births > 0) {
          const innate = this.rng() < 0.1;
          // 双亲：从村里挑一对成年人。**完全确定，不抽签**（见 sim/family.js）——
          // 挑在这里而不是在 spawn 里，是因为「谁生的」得在孩子落地那一刻就定下来。
          // 挑不到双亲也照样生：把出生卡在「有父母」上会直接改掉人口曲线。
          const parents = pickParents(this, village);
          const spawned = this.spawn(
            cx, cy, innate ? SPECIES.CULTIVATOR : SPECIES.HUMAN, births,
            village.faction, { village: village.id, allowSouls: true, parents },
          );
          village.food -= 5 * spawned;
        }
      }

      // 满员且富足 → 分家另立新村。这是世界从十一座村子长成一片的途径
      this.maybeSplitVillage(village, dtDays);
    }
  }

  /**
   * 分家：村子住满且粮足，就派出一批人另择空地立村。
   * 没有这一步，村子数量会在开天辟地那几年就定死（实测永远停在 11 座）。
   */
  maybeSplitVillage(village, dtDays) {
    const world = this.world;
    if (world.villages.length >= LIMITS.maxVillages) return;
    if (world.entities.length >= POP_SOFT_CAP) return;
    const capacity = VILLAGE_CAPACITY_BASE + village.level * 10;
    if (village.pop < capacity - 4 || village.food < 60) return;
    if (this.rng() >= dtDays * SPLIT_PER_DAY) return;

    const spot = this.findSplitSpot(village);
    if (!spot) return;

    // 先点人再立村：否则没人跟去时还要回滚 villages / nextVillageId / faction.villages，
    // 一旦漏掉一处就会留下一个永远空着的村子。
    const migrants = [];
    this.forEachNear(village.x, village.y, 14, (e) => {
      if (e.village !== village.id) return false;
      if (migrants.length >= 4) return true;
      migrants.push(e);
      return false;
    });
    if (migrants.length < 2) return;

    let factionId = village.faction;
    const sect = this.factionNear(spot[0], spot[1], 26);
    if (sect) factionId = sect.id;

    const child = this.foundVillage(spot[0], spot[1], factionId);
    if (!child) return;

    for (let i = 0; i < migrants.length; i += 1) {
      const e = migrants[i];
      e.village = child.id;
      e.faction = factionId;
      e.state = 'return';
      e.timer = 0;
    }
    village.food -= 40;
    // 村落级事件，无单一当事人：分出去的是整支人马，落不到一个具体的人头上。
    world.record(`${child.name} 自${village.name}分出，另立门户。`, 'settle');
  }

  /** 找一处离本村够远、可耕、不在别人地盘上的空地 */
  findSplitSpot(village) {
    const world = this.world;
    const r = this.rng;
    for (let k = 0; k < 60; k += 1) {
      const angle = r() * Math.PI * 2;
      const dist = 16 + r() * 18;
      const x = Math.floor(village.x + Math.cos(angle) * dist);
      const y = Math.floor(village.y + Math.sin(angle) * dist);
      if (!world.inside(x, y)) continue;
      const i = world.idx(x, y);
      if (!world.isBuildable(i)) continue;
      if (world.fertility(i) < 0.34) continue;
      if (this.villageNear(x, y, 13)) continue;
      return [x, y];
    }
    return null;
  }

  findVillageTile(village, radius, predicate) {
    const world = this.world;
    for (let k = 0; k < 40; k += 1) {
      const x = Math.floor(village.x + (this.rng() * 2 - 1) * radius);
      const y = Math.floor(village.y + (this.rng() * 2 - 1) * radius);
      if (!world.inside(x, y)) continue;
      const i = world.idx(x, y);
      if (predicate(i)) return [x, y];
    }
    return null;
  }

  // ── 荒野生灵 ────────────────────────────────────────────
  /**
   * 灵兽与山精。
   *
   * 这些生灵原本一条都没有——世界生成只撒了凡人，于是「妖兽袭村」「灵兽认主」
   * 「御兽」相关的逻辑全是死代码。它们在山林里自行繁衍，被修士屠戮殆尽后
   * 也会慢慢从深山重新回来，所以设一个目标存量做补给。
   */
  stepWildlife(dtDays) {
    const world = this.world;
    if (world.entities.length >= WILDLIFE_POP_CAP) return;
    this.wildCooldown -= dtDays;
    if (this.wildCooldown > 0) return;
    this.wildCooldown = 90;

    let wild = 0;
    for (let i = 0; i < world.entities.length; i += 1) {
      const sp = world.entities[i].sp;
      if (sp === SPECIES.BEAST || sp === SPECIES.SPIRIT) wild += 1;
    }
    if (wild >= WILDLIFE_TARGET) return;

    const spot = this.findWildSpot();
    if (!spot) return;
    const spirit = this.rng() < 0.35;
    this.spawn(spot[0], spot[1], spirit ? SPECIES.SPIRIT : SPECIES.BEAST,
      spirit ? 1 : 2 + Math.floor(this.rng() * 3));
  }

  /** 找一处远离人烟的深山老林 */
  findWildSpot() {
    const world = this.world;
    for (let k = 0; k < 50; k += 1) {
      const x = 2 + Math.floor(this.rng() * (world.w - 4));
      const y = 2 + Math.floor(this.rng() * (world.h - 4));
      const i = world.idx(x, y);
      const t = world.type[i];
      if (t !== TERRAIN.FOREST && t !== TERRAIN.JUNGLE
        && t !== TERRAIN.MOUNTAIN && t !== TERRAIN.ROCK) continue;
      if (!world.isWalkable(i)) continue;
      if (this.villageNear(x, y, 14)) continue;
      return [x, y];
    }
    return null;
  }

  abandonVillage(village) {
    const world = this.world;
    for (let i = 0; i < village.houses.length; i += 1) {
      const h = village.houses[i];
      const idx = world.idx(h.x, h.y);
      world.struct[idx] = 5;
      world.over[idx] = OVER.RUINS;
      markDirty(world, idx);
    }
    for (let i = 0; i < world.entities.length; i += 1) {
      const e = world.entities[i];
      if (e.village === village.id) {
        e.village = 0;
        e.state = 'wander';
        e.timer = 0;
      }
    }
    const faction = world.factionById(village.faction);
    if (faction) {
      faction.villages = faction.villages.filter((id) => id !== village.id);
    }
    // 村落级事件，无单一当事人：村子没了，没有活人可承接这条记录。
    world.record(`${village.name} 荒废`, 'settle');
    world.touch();
  }
}

export { SEA_LEVEL };
