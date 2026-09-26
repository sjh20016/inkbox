// 水墨沙盒 · 世界数据结构
//
// 世界的全部状态都压在这些 TypedArray 上：
//   height  高程 0..1      water  水深（>=0，水面 = height + water）
//   temp    气温 0..1      moist  湿度 0..1
//   veg     植被 0..1      fire   火势 0..1
//   type    地表类型       over   人工/灾害覆盖层
//   struct  建筑层         owner  势力归属
//   flow    汇流量（生成期算河流用）
// 生灵与聚落是轻量对象数组，数量有上限。

import { SEA_LEVEL, LIMITS, TERRAIN_INFO, reliefScaleFor } from '../core/config.js';
import { realmIndexFor, REALMS } from '../core/cultivation.js';
import { recordLifeEvent } from '../sim/biography.js';

/**
 * 「世界大事」账本的容量。
 *
 * ⚠️ 它与 `chronicle` 的 400 条是**两本不同的账**，别混：
 *   · `chronicle` 是**滚动窗口**，什么都记（立村、探灵脉、归顺），几年就被冲掉；
 *   · `milestones` 只记玩家真会回头看的那几件（大境界突破 / 飞升 / 开宗 /
 *     覆灭 / 分裂 / 大战爆发 / 夺舍 / 开缝 / 高境界陨落），窗口长得多。
 *
 * 600 条 × 平均 ~3 件/年 ≈ 200 年，够玩家「快进几十年再看一眼」。
 * ⚠️ 它是**滚动窗口，不是只增不减的累计账本**——所以「这个世界从没发生过 X」
 *    这类存在性断言**不许**拿它当依据（故障类 4）；要那种结论得另立计数器。
 */
export const MILESTONE_CAP = 600;

export class World {
  constructor(w, h, seed = 1) {
    this.w = w | 0;
    this.h = h | 0;
    this.size = this.w * this.h;
    this.seed = seed >>> 0;
    /** 立体视图每单位高程抬升多少格 */
    this.reliefScale = reliefScaleFor(this.h);

    this.height = new Float32Array(this.size);
    this.water = new Float32Array(this.size);
    this.temp = new Float32Array(this.size);
    this.moist = new Float32Array(this.size);
    this.veg = new Float32Array(this.size);
    this.fire = new Float32Array(this.size);
    this.flow = new Float32Array(this.size);
    /** 河道基流：河流格的最低水深，保证水系长年不断流 */
    this.riverBase = new Float32Array(this.size);
    /**
     * 灵气浓度 0..1。修士往灵气浓的地方走、宗门为灵脉开战，都读这一层。
     * 与 type 一样是「推导」出来的（见 terrain.js 的 qiAt），不是独立状态。
     */
    this.qi = new Float32Array(this.size);
    this.type = new Uint8Array(this.size);
    this.over = new Uint8Array(this.size);
    this.struct = new Uint8Array(this.size);
    this.owner = new Uint8Array(this.size);

    this.entities = [];
    this.villages = [];
    /** 宗门（沿用原来的 factions 数组，语义升级为「宗门」） */
    this.factions = [];
    /** 灵脉节点：宗门争夺的对象，也是灵气的高地 */
    this.leylines = [];
    /** 地图上的地点：秘境 / 洞府 / 古阵 / 遗迹 / 禁地 */
    this.sites = [];
    /**
     * **无主**的法宝——躺在地上等人捡的那些（见 sim/artifacts.js）。
     *
     * ⚠️ 在手的法宝**不在这里**，它们在各自持有者的 `entity.artifacts` 上。
     * 一件法宝要么在某个人身上，要么在这里，**不会同时出现在两处**——
     * 这条不变量是长测与冒烟测试都在守的东西（`没有法宝同时在两处`）。
     * 之所以不做「世界级登记表 + 实体存 id」：那样每次算战力都要查一次表，
     * 而 combatPower 是每 tick 攻防双方各调一次的热路径。
     * 代价是「世界上一共造出过多少件」得靠 `artifactLog` 的累计计数，
     * 不能靠 `artifacts.length` 数出来。
     */
    this.artifacts = [];
    /** 法宝累计账本。单调递增，只用于读数与长测判据 */
    this.artifactLog = {
      forged: 0, found: 0, inherited: 0, broken: 0, spirit: 0, spiritLost: 0, decayed: 0, left: 0,
    };
    /** 飞升记录：谁在何时去了哪里 */
    this.ascended = [];
    /**
     * **世家**（见 sim/family.js）。
     *
     * 转世让一个人活得比一世长，法宝让一件东西活得比人长，
     * 世家让一个姓氏活得比所有人都长。这是真实状态，必须进存档——
     * 「谁开的族、传到第几代、声望多少、家学是什么、什么时候断的」
     * 都没法从地形或人口里反推出来。
     *
     * 反过来，「现在还剩几个人、有没有绝」是**现算**的（每次普查一次遍历），
     * 和村庄人口、灵气层同一个做法：存下来迟早会和世界的真实状态对不上。
     */
    this.clans = [];
    this.nextClanId = 1;
    /** 世家累计账本。单调递增，只用于读数与长测判据 */
    this.clanLog = { founded: 0, ended: 0 };
    /** 上一次立族的游戏日。用来把「十年一判」的节奏钉住 */
    this.lastClanFoundDay = -1e9;
    /**
     * 待转世的神魂。修士死后神魂入「幽冥」——沙盒是单图，没有幽冥位面，
     * 所以它就是这里一个带上限的数组（见 sim/reincarnation.js）。
     * **这是真实状态，不是推导量**：读档时丢了它，那些排着队等转世的神魂
     * 就凭空消失了，而且此后两条世界线会走出不同的转世次数。
     */
    this.souls = [];

    /**
     * 魂路累计账本（见 sim/reincarnation.js 的「魂分五路」）。
     * 单调递增，只用于读数与长测判据。
     *
     * **为什么非要有它**：五路里有**三路**（`ghost` 成鬼修 / `wraith` 怨魂化 /
     * `gone` 魂火散尽）根本**不进魂池**——它们不是「排队等转世」的魂。
     * 于是这三条路在 `world.souls` 里**永远看不见**：只数魂池的话，
     * 「这条路从来没通过」与「通过很多、只是都不进池子」在读数上**一模一样**。
     * 理由与 `warLog`（:106）、`possessionLog`（:119）、`deadLog`（:136）、
     * `riftLog`（:165）**完全相同**——这是第五处，不是重复造轮子。
     *
     * ⚠️ 键名就是 06 册的考古定名（`natural/linger/ghost/wraith/gone`），
     *    **不得擅改或另造同义词**（`剧情文案素材/00_文案使用说明:229-239`）。
     *
     * **必须进存档**：它反推不出来，丢了之后两条世界线的读数就对不上。
     *
     * ⚠️ **记账位置是承重的**：`soulLog[route] += 1` 记在 `enterNether` 的
     *    **两道抽签闸门之前**（`tier <= 0` 早退之后、`rng()` 抽签之前）。
     *    2026-09-21 之前它写在闸门**之后**，于是只记「抽签中选者」——
     *    覆盖率仅 **1.86%**（9389 次判路 → 175 条），而文档却称它是「唯一的读数」。
     *    **一个计数放在任何闸门之后，量到的就是那道闸门，不是现象本身。**
     *
     * 可现算的交叉校验：`natural + linger >= nextSoulId - 1`
     * ——只有这两路会把魂推进池子，而 `nextSoulId` 也只在那里自增。
     * 是 `>=` 而非 `===`：账本记的是**判路全量**，入池只是它的**子集**。
     */
    this.soulLog = { natural: 0, linger: 0, ghost: 0, wraith: 0, gone: 0 };

    /**
     * 大战（见 sim/war.js）。沙盒此前只有「宗门摩擦」——一战定胜负。
     * 这一层补的是跨数年、多参与方、带特殊结局的大规模战争。
     *
     * **这是真实状态，必须进存档**：predawn 的进行中大战带着参战名单、
     * 已打了几阵、攒了多少紧张度，全是反推不出来的。
     * 而战力、接壤表、参与方强弱一律**现算**（territory.js 的规矩）。
     */
    this.wars = [];
    this.nextWarId = 1;
    /** 大战累计账本。单调递增，只用于读数与长测判据 */
    this.warLog = { declared: 0, resolved: 0, destroyed: 0, casualties: 0 };

    /**
     * 夺舍累计账本（见 sim/possession.js）。单调递增，只用于读数与长测判据。
     *
     * 为什么非要有它：`possessionStats` 数的是**此刻在世**身上还带着夺舍印记的人。
     * 一个人被夺舍之后又活了几百年、或者干脆死了，这个读数就归零——
     * 于是「夺舍从来没触发过」与「触发过、但那些人都没了」在长测里长得一模一样。
     * 这个项目已经为同一个理由造过两样东西：`nextSoulId`（「累计造出多少神魂」）
     * 与 `warLog.declared`（「累计宣战几场」）。这里是第三处，不是重复造轮子。
     *
     * **必须进存档**：它反推不出来，丢了之后两条世界线的读数就对不上了。
     */
    this.possessionLog = {
      succeeded: 0, failed: 0, suspected: 0,
      // D6-3 工程包 D 追加：跨位面夺舍的两个子账（幽冥鬼修 → 凡间活人）。
      // `crossPlane` = 真夺舍次数；`haunted` = 暂时附身次数。与上面三键同属
      // 「只增不减」的累计账本，形状必须与 `save.js` 的写 / 读侧**逐键一致**。
      crossPlane: 0, haunted: 0,
    };

    /**
     * 逝者名录（见 sim/necrology.js）。
     *
     * `world.entities` 只装活人——`life.js` 的清理循环把死者与飞升者就地压掉，
     * 于是「一个人死了，他的一生就再也翻不出来了」。这一块给每个离世的人
     * 留一份**不可失效的快照**（宗门/世家/村名一律存字符串，不存 id），
     * 并且能凭它重新编译出完整传记。
     *
     * **两者都必须进存档**：
     *   · `dead` 是真实状态，反推不出来；
     *   · `deadLog` 是累计账本（`dead.length` 会被淘汰裁剪、会变小），
     *     不存的话「从来没死过人」与「死过很多、都被淘汰了」读数一模一样——
     *     同 `nextSoulId` / `warLog.declared` / `possessionLog` 的理由。
     */
    this.dead = [];
    this.deadLog = { total: 0, ascended: 0, evicted: 0 };

    /**
     * 空间裂缝（见 reports/design/upperworld.md §4，生成逻辑在 sim/rifts.js）。
     *
     * **为什么账本不是可选项**：单条裂缝闭合后会被从 `rifts` 里**剔除**，
     * 于是「从来没裂过缝」与「裂过很多、全闭合了」在读数上长得**一模一样**——
     * `world.rifts.length` 是快照（会变小、会归零），`riftLog` 是账本（单调递增）。
     * 理由与 `warLog`（:106）、`possessionLog`（:119）、`deadLog`（:136）**完全相同**，
     * 长测判据一律用账本，不用快照。
     *
     * 每条裂缝是纯数据、**没有任何 id 引用**（铁律三）：
     * `{ id, x, y, strength, openedDay, closedDay, leaked, crossed }`，
     * `closedDay === -1` 表示还开着。半径与峰值日**刻意不存**——
     * 它们是 `openedDay` 加公式的推导量（铁律二：能现算的一律现算），
     * 半径由 `rifts.js` 的 `riftRadiusAt(rift)` 现算（**只读 `rift.age`**，
     * 不是 `world.day` —— 签名只有一个参数）。
     *
     * ⚠️ 裂缝开在**凡间**（规格 §4.2：用户原话是「上界视界和**下界**的边缘」），
     *    所以这三个字段进的是**凡间** payload，**不要**放进 `serializeUpperWorld`。
     *
     * ⚠️ `World` 也被上界实例复用（上界也是一个 `World`），所以这三个字段
     *    在上界实例上也会存在、但**恒空**。这是**刻意的**——不加 `plane` 判断，
     *    是为了让「凡间实例一定有三个字段」这条不变量不因构造路径不同而变脆
     *    （上界不跑裂缝系统，由 `worldgenUpper.resetUpperSystems` 的语义保证，
     *    而不是靠构造器少挂几个字段）。
     */
    this.rifts = [];
    this.nextRiftId = 1;
    this.riftLog = { opened: 0, closed: 0, leaked: 0, crossed: 0, lost: 0 };

    /**
     * 凡间鬼影（D6-3 工程包 B）：自幽冥缝爬入凡间的鬼的**独立容器**。
     *
     * ⚠️⚠️ 鬼**绝不能**放进 `world.entities`。凡间与上界共用
     *    `cultivation.stepEntity`（`life.js:26` / `upperLife.js:54` 都是别名导入），
     *    其「凡人试着觉醒」段的豁免名单只有 `beast` / `spirit`，`ghost` 不在其中：
     *    ① 普通鬼魂（level 0）会被掷觉醒骰 → `awaken()` 给 level=1 + 灵根 +
     *       寿元被 `lifespanForEntity` 重算 ⇒ 变成「`sp:'ghost'` 却 `level:1`」的怪物；
     *    ② 鬼修（level ≥1）按 `world.qi[所在格]` 修炼 → 突破 → 40 级起天雷飞升
     *       → 上界凭空多一个鬼（`world.plane !== 'upper'` 分流拦不住，凡间是 `'mortal'`）。
     *    两条都**不报错**并污染上界人口账。⇒ 独立容器 + 独立 tick `stepMortalWraiths`
     *    是**函数边界**（比一行守卫强，见 D6-3 A 包判决）。
     *
     * ⚠️ 与 `rifts` 同理：上界实例（也是 `World`）也会挂这两个字段、但**恒空**，
     *    由 `worldgenUpper.resetUpperSystems` 的语义保证，不靠构造器少挂字段。
     */
    this.wraiths = [];
    this.wraithLog = { dissolved: 0 };

    this.day = 0;
    this.year = 0;
    this.nextEntityId = 1;
    this.nextVillageId = 1;
    this.nextFactionId = 1;
    this.nextSiteId = 1;
    this.nextLeylineId = 1;
    this.nextSoulId = 1;
    this.nextArtifactId = 1;

    /** 当前位面。沙盒是单图，位面主要作为叙事背景与飞升去处 */
    this.plane = 'mortal';

    /** 生成期或工具投放的待生成生灵，由生灵系统在下一个 tick 消化 */
    this.pendingSpawns = [];

    /** 每次地形被改写（玩家笔刷或自然模拟）自增，渲染层据此判断是否需要重绘 */
    this.revision = 1;
    this.terrainDirty = true;
    this.chronicle = [];
    /**
     * 世界大事账本（见 `milestone()`）。**只记「值得回头看一眼」的事件**，
     * 与 `chronicle` 的 400 条滚动窗口分开——否则玩家快进几十年之后，
     * 满屏都是「某村归入某宗门」，真正的大事早被顶出去了。
     *
     * ⚠️ 存档接线与 `chronicle` **逐字相同**（`serializeWorld` 里照抄一行、
     *    `restoreWorldState` 里照抄一行），因为两者都是「凡间/上界/幽冥三张图
     *    各自都有、都照常存」的普通世界级字段——不删、不豁免。
     */
    this.milestones = [];
    /**
     * WorldEvents 的可存档快照。运行时控制器仍挂在 Life 上；这里只保存计时器、
     * 活动灾祸和已结束事件，避免换 Life 或读档时灾祸静默消失。
     */
    this.worldEventState = null;

    /**
     * 卜算子（天道引路人）的状态。
     *
     * 只存三件小事：见过没有、亲手拨动过几次、见证过哪几个里程碑。
     * 「亲缘」本身是推导量（见 sim/busanzi.js），不在这里记账——
     * 存推导量迟早会和世界真实状态对不上。
     */
    this.busanzi = { met: false, acts: 0, milestones: [], peakPop: 0, tier: 0 };
  }

  idx(x, y) {
    return y * this.w + x;
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  clampX(x) {
    return x < 0 ? 0 : x >= this.w ? this.w - 1 : x;
  }

  clampY(y) {
    return y < 0 ? 0 : y >= this.h ? this.h - 1 : y;
  }

  at(x, y) {
    return this.idx(this.clampX(x), this.clampY(y));
  }

  /** 水面高度（无水深时等于地面高程） */
  surface(i) {
    return this.height[i] + this.water[i];
  }

  isWater(i) {
    return this.water[i] > 0.0015;
  }

  typeOf(i) {
    return this.type[i];
  }

  infoOf(i) {
    return TERRAIN_INFO[this.type[i]] || TERRAIN_INFO[0];
  }

  isWalkable(i) {
    const info = this.infoOf(i);
    if (!info.walk) return false;
    return this.fire[i] < 0.55;
  }

  isBuildable(i) {
    const info = this.infoOf(i);
    if (!info.build) return false;
    return this.struct[i] === 0 && this.fire[i] < 0.25;
  }

  fertility(i) {
    const info = this.infoOf(i);
    if (!info.fertility) return 0;
    const vegBonus = 0.35 + this.veg[i] * 0.65;
    const waterBonus = this.water[i] > 0 && this.water[i] < 0.02 ? 0.85 : 1;
    return info.fertility * vegBonus * waterBonus;
  }

  touch() {
    this.revision += 1;
    this.terrainDirty = true;
  }

  addEntity(entity) {
    if (this.entities.length >= LIMITS.maxEntities) return null;
    entity.id = this.nextEntityId;
    this.nextEntityId += 1;
    // ── 飞升者来历的**唯一漏斗**（v8 内追加）──────────────
    // `fromMortal` / `fromSect` 是上界副本实体的来源快照（`planes.arriveUpper` 落）。
    // 实体的创建路径有好几条（`sim/life.js` 的 spawn、`sim/cultivation.js` 的
    // initEntity、`sim/upperLife.js` 的 maybeBorn、`worldgenUpper.js` 的 makeSeedEntity），
    // 一条条去补必然漏一处——本项目已经栽过好几次「漏了一处，不报错」。
    // 所以在这里归一：活对象**天生带这两个键**，与 `restoreEntity` 读档后的形状一致。
    //
    // 为什么键必须一致：`scripts/inkbox-save-equiv.mjs:140` 的判据取键集**并集**，
    // 「活对象缺键、读档后有键」与反向都会红。缺键就是「只在一侧存在的字段」。
    //
    // ⚠️ `planes.arriveUpper` 是 `upper.entities.push(copy)` 直接 push（它要自己指定
    //    `UPPER_ID_BASE` 段的 id），**绕过这里**——那一处由它自己显式设值，不归本漏斗管。
    if (entity.fromMortal === undefined) entity.fromMortal = false;
    if (entity.fromSect === undefined) entity.fromSect = null;
    this.entities.push(entity);
    return entity;
  }

  removeEntity(entity) {
    const list = this.entities;
    for (let i = 0; i < list.length; i += 1) {
      if (list[i] === entity) {
        list[i] = list[list.length - 1];
        list.pop();
        return true;
      }
    }
    return false;
  }

  villageById(id) {
    for (let i = 0; i < this.villages.length; i += 1) {
      if (this.villages[i].id === id) return this.villages[i];
    }
    return null;
  }

  factionById(id) {
    for (let i = 0; i < this.factions.length; i += 1) {
      if (this.factions[i].id === id) return this.factions[i];
    }
    return null;
  }

  /** 宗门的同义别名——沙盒里 faction 就是宗门 */
  sectById(id) {
    return this.factionById(id);
  }

  qiAt(i) {
    return this.qi[i];
  }

  leylineById(id) {
    for (let i = 0; i < this.leylines.length; i += 1) {
      if (this.leylines[i].id === id) return this.leylines[i];
    }
    return null;
  }

  siteById(id) {
    for (let i = 0; i < this.sites.length; i += 1) {
      if (this.sites[i].id === id) return this.sites[i];
    }
    return null;
  }

  clanById(id) {
    for (let i = 0; i < this.clans.length; i += 1) {
      if (this.clans[i].id === id) return this.clans[i];
    }
    return null;
  }

  warById(id) {
    for (let i = 0; i < this.wars.length; i += 1) {
      if (this.wars[i].id === id) return this.wars[i];
    }
    return null;
  }

  /** 找出半径内的所有地点，按距离由近及远 */
  sitesNear(x, y, radius) {
    const out = [];
    const r2 = radius * radius;
    for (let i = 0; i < this.sites.length; i += 1) {
      const s = this.sites[i];
      const dx = s.x - x;
      const dy = s.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) out.push({ site: s, dist: Math.sqrt(d2) });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }

  addLeyline(leyline) {
    const entry = {
      radius: 7,
      strength: 0.35,
      element: null,
      owner: 0,
      discovered: false,
      ...leyline,
    };
    entry.id = this.nextLeylineId;
    this.nextLeylineId += 1;
    this.leylines.push(entry);
    return entry;
  }

  /**
   * 落下一处地点。**这是所有地点的唯一入口**，所以形状归一放在这里——
   * 放在调用点上没有用：`addSite` 有 6 个调用点，漏一个就重新长出一份坏数据
   * （`cultivation.js:657` 漏了 `visits`，就是这么漏的）。
   *
   * `age` / `visits` 是**累加器**（`sites.js` 里 `+=`），归一成有限数：
   *   · `age`    —— `sites.js:188` 的 `site.age += dtDays`，被「地点随年岁淡去」读；
   *   · `visits` —— `sites.js:197` 的 `site.visits += 1`，被 `:203`
   *                 「秘境探空即闭合」读。
   * 漏传时是 `undefined`，`undefined + 1 = NaN`，而 **`NaN` 参与的比较恒为 false**
   * （`NaN >= 2` 是 false）→ 那条闭合规则永不触发，且不报错、不崩溃。
   * 更阴的是 `JSON.stringify(NaN)` 会**静默写成 `null`**：一直跑是 `NaN`、
   * 存读档后是 `null`，于是 `null + 1 = 1`——同一条世界线在存档前后行为不同。
   * 用 `Number.isFinite` 而不是 `|| 0`：后者会把合法的 `0` 也当成缺省。
   *
   * ⚠️ `opened` **刻意不动**：它在主线（`daoLegacySystem.js:162/164/207`、
   * `SiteIconRenderer.js:142/145/165`、`worldLifePanel.js:136`、
   * `interventionSystem.js:201`）是承重字段，而 inkbox 侧只抄了字段没抄读者。
   * 删掉就把「洞府开启机制移植时没接上」这个证据一起抹掉了，见 INKBOX.md §八。
   */
  addSite(site) {
    const entry = { ...site };
    entry.age = Number.isFinite(entry.age) ? entry.age : 0;
    entry.visits = Number.isFinite(entry.visits) ? entry.visits : 0;
    entry.id = this.nextSiteId;
    this.nextSiteId += 1;
    this.sites.push(entry);
    return entry;
  }

  removeSite(site) {
    const idx = this.sites.indexOf(site);
    if (idx >= 0) {
      this.sites.splice(idx, 1);
      return true;
    }
    return false;
  }

  recordAscension(entity, planeKey) {
    this.ascended.push({
      day: this.day,
      name: entity.name,
      daoTitle: entity.daoTitle || null,
      level: entity.level,
      plane: planeKey,
    });
    if (this.ascended.length > 120) this.ascended.splice(0, this.ascended.length - 120);
  }

  record(text, kind = 'world', actors = null) {
    this.chronicle.push({ day: this.day, year: Math.floor(this.day / 360), text, kind });
    if (this.chronicle.length > 400) this.chronicle.splice(0, this.chronicle.length - 400);
    // ── 人物个人事件流（见 sim/biography.js）────────────────
    // 同一条事，除了进世界的编年史，也记到**当事人**身上。
    //
    // 为什么要在这里分流、而不是让传记模块去编年史里按名字反查：
    // 编年史是 400 条的滚动窗口（上面那一行就是），千年尺度下早期的经历
    // 必然被顶出去；而且按 `entity.name` 反查是**重名即错**——
    // 不会报错，只会把别人的事迹安到另一个人头上。
    //
    // 传了 `actors` 的调用点才写；不传就是纯世界事件（洪水、灵脉、妖潮），
    // 那些本来就不属于任何一个人。`recordLifeEvent` 自己会去重、会按重要性
    // 淘汰、会把上限压在 32 条，所以这里不必再做任何节流。
    if (actors) {
      const list = Array.isArray(actors) ? actors : [actors];
      for (let i = 0; i < list.length; i += 1) {
        if (list[i]) recordLifeEvent(this, list[i], kind, text);
      }
    }
  }

  /**
   * 记一件**世界大事**：写编年史 **+** 记进 `milestones` 那本长窗口账本。
   *
   * 与 `record()` 的唯一区别就是多记一本。**凡是「玩家快进几十年之后还想看见」
   * 的事件，一律走这里**；日常琐事继续走 `record()`。
   *
   * 为什么不做成「`record()` 里按 `kind` 自动判定」：`kind` 太粗——
   * `'sect'` 既包含「开宗立派」也包含「某村归入某宗门」，
   * `'war'` 既包含「两宗开战」也包含「夺走一道灵脉」。
   * 靠 kind 过滤必然把一半的噪音放进来，或者把一半的大事漏掉；
   * 而这两种错都不会报错。所以判据放在**调用点**——那儿才知道事情的分量。
   *
   * ⚠️ 本方法**一次 `rng()` 都不调**：它只搬运已经写好的文本，
   *    所以把某个调用点从 `record` 换成 `milestone` **不会移动任何随机流**
   *    （这一点很重要，否则一次「让事件更可见」的改动会把几百年的世界整个挪位）。
   */
  milestone(text, kind = 'world', actors = null) {
    this.record(text, kind, actors);
    this.milestones.push({ day: this.day, year: Math.floor(this.day / 360), text, kind });
    if (this.milestones.length > MILESTONE_CAP) {
      this.milestones.splice(0, this.milestones.length - MILESTONE_CAP);
    }
  }

  stats() {
    let land = 0;
    let water = 0;
    let forest = 0;
    let peak = 0;
    for (let i = 0; i < this.size; i += 1) {
      if (this.isWater(i)) {
        water += 1;
        continue;
      }
      land += 1;
      if (this.height[i] > peak) peak = this.height[i];
      const info = TERRAIN_INFO[this.type[i]];
      if (info && (this.type[i] === 7 || this.type[i] === 8)) forest += 1;
    }
    return {
      land,
      water,
      forest,
      peak,
      entities: this.entities.length,
      villages: this.villages.length,
      factions: this.factions.length,
      leylines: this.leylines.length,
      sites: this.sites.length,
      ascended: this.ascended.length,
      seaLevel: SEA_LEVEL,
    };
  }

  /**
   * 修仙侧统计：境界分布、修士人数、飞升数。
   * 每帧调一次全量遍历太贵，交给调用方按需取（HUD 每 0.25 秒一次）。
   */
  cultivationStats() {
    // 长度跟 REALMS 走，别写死 6：main.js 渲染时用的是 `i < REALMS.length`，
    // 两处口径必须一致。写死 6 时上界大乘（realm 下标 6）会 `byRealm[6] += 1`
    // 把数组撑到 7，但一个没有大乘的世界仍是长度 6，HUD 两处对不上。
    const byRealm = new Array(REALMS.length).fill(0);
    let cultivators = 0;
    let mortals = 0;
    let highest = 0;
    let peakName = null;
    for (let i = 0; i < this.entities.length; i += 1) {
      const e = this.entities[i];
      if (e.sp === 'beast' || e.sp === 'spirit') continue;
      // ⚠️ 判据只能是 `!e.level`（= level 0 / undefined），**不能写 `<= 1`**。
      //    `level` 是 1-based：`cultivation.js:158` 凡人 level = 0，
      //    `:257` 觉醒即 level = 1，而 `realmLabel(1)` = 「炼气」。
      //    写成 `<= 1` 会把**炼气一层判成凡人**，于是右栏「修士 N」少算，
      //    而检视面板（main.js:1014 `level >= 1`）与史册标签
      //    （main.js:1651 `level > 0`）都算修士 ⇒ 三处口径当着玩家的面对不上。
      //    这是故障类 #9（口径混淆）：代价不是数字错，是结论错。
      if (!e.level) {
        mortals += 1;
        continue;
      }
      cultivators += 1;
      const realm = realmIndexFor(e.level);
      byRealm[realm] += 1;
      if (e.level > highest) {
        highest = e.level;
        peakName = e.name;
      }
    }
    return { byRealm, cultivators, mortals, highest, peakName };
  }
}
