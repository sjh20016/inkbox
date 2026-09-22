// 水墨沙盒 · 上界的模拟（阶段二：上界的内容）
//
// 规格：`reports/design/upperworld.md` §7 阶段二。上界要「活」起来——
// 有飞升者进来（`ascend()` → `arriveUpper`，见 world/planes.js）、
// 有本土化生、有陨落、有极简仙门。
//
// ⚠️ **上界不是凡间的缩印**。凡间 `Life`（sim/life.js）跑的是一整套系统
// （战争、转世、夺舍、世家、卜算子、妖潮、法宝推进……），上界只跑六件事：
// 修炼推进、化生、陨落、极简仙门、**凡人繁衍**、**独立炼器**。
// （后两件是「凡人也能在上界活着」与「上界独立炼器路径」两条决定落地时加的，
//   见 `maybeBornMortals` / `maybeForge`；两处都刻意排在 `step()` 的最后，
//   以免打乱既有步骤的随机流。）其余与凡间共用的世界状态
// （`busanzi` / `possessionLog` / `souls` / `clans` / `wars` / `ascended`）
// 由 `generateUpperWorld` 的 `resetUpperSystems` 显式清零
// ——那是「上界不跑这些系统」的机器可读形态，不是注释性的承诺。
//
// ⚠️ **随机流纪律（铁律一）**：本模块**绝不**碰凡间 `Life.rng`，
// 也不碰凡间 `warRng`。自己的一条独立流，从**上界自己的 seed** 派生
// （上界 seed 已经是 `凡间种子 ^ 0x55505052`，这里再异或一个键，
// 两层派生各司其职：上界种子区分「哪张图」，本键区分「哪个系统」）。
// 独立流不入档（既有约定）：重建路径是 `attachUpper()` → `new UpperLife(upper)`，
// 与凡间 `Life` 的重建方式一致；分叉等价由存读档等价测试按同一口径观察。
//
// ⚠️ **时间轴纪律（规格 §6.4）**：上界的 `day` 由 `main.js` 的 `update()`
// 赋值，本模块**不推进** `upper.day`。所有「到期的检查」（立派周期）
// 用自己的累加器记，不读 `upper.day` 做差。

import { SEA_LEVEL, SPECIES, SPECIES_INFO, LIMITS } from '../core/config.js';
import { mulberry32 } from '../core/noise.js';
import { generateNameParts, generateSectName, DAO_TITLES, pickFrom, narrate } from '../core/lore.js';
import { initEntity, stepEntity as stepCultivation } from './cultivation.js';
import { dropArtifacts, stepArtifacts, forgeArtifact, ownerLine } from './artifacts.js';
import { rememberDead } from './necrology.js';
import { recordLifeEvent } from './biography.js';
import { upperWalkable, ensureUpperPopLog } from '../world/planes.js';

/** 上界模拟流的派生键：ASCII 'UPLI'（UPper LIfE）。 */
const UPPER_LIFE_SEED_KEY = 0x55504c49;

/**
 * 化生：每次 `step`（10 游戏日）对每个候选修士掷一次。
 * 0.004/次 × 每年 36 次 ≈ 13% / 年 / 候选——上界开局人口极少
 * （只有飞升者），靠这条腿涨起来；飞升断流后人口会缓慢衰老下降，
 * 这正是规格验收判据要的「不是只增不减」的另一面。
 */
const UPPER_BIRTH_CHANCE = 0.004;

/** 化生的候选人境界下限：合体期（50+）才有「道侣化生」的道行。 */
const UPPER_BIRTH_MIN_LEVEL = 50;

/**
 * 上界**修士**人口软上限：到顶就停止化生（防失控；飞升照常进人，长测里读数看得见）。
 *
 * ⚠️ **语义在本轮被收窄了，而且是显式收窄的**：这个数原本是「上界人口总数」，
 * 因为那时上界**只有修士**（规格 §2.4 原话：「上界没有凡人」）。用户拍板
 * 「凡人也能在上界活着」之后，同一个 `entities.length` 里混进了凡人——
 * 若不改判据，凡人涌进来会把 300 这个额度吃光，**修士化生被挤停**，
 * 而长测里只看总数根本看不出来（`born` 会慢慢掉到 0，但没有任何一条断言会红）。
 * 这正是「字段语义被静默改变」那类坏法，所以这里**显式挡掉**：
 * `maybeBorn()` 改成只数**非凡人**（见那里的 `cultivatorCount`），
 * 凡人另立 `UPPER_MORTAL_CAP`。两个额度互不侵占。
 */
const UPPER_POP_CAP = 300;

/**
 * 上界**凡人**人口软上限（**必须与 `UPPER_POP_CAP` 分开，理由见上**）。
 *
 * 为什么必须有单独一栏、而不是让凡人共用 300：
 *   ① 语义：`UPPER_POP_CAP` 的名字与历史含义都是「上界修士人口」，共用一个数
 *      等于把两种物种的额度混成一锅，谁先到谁先占——先到的凡人会把后来的修士挤掉；
 *   ② 量级：凡人寿元 4200 天（≈11.7 年），比修士短一到两个数量级，繁衍周期也短，
 *      在同一个额度下凡人的**周转速度**远快于修士，实际上会把修士挤成少数。
 * 取 120（**待标定**）：比修士额度小，符合「上界以修士为主、凡人是少数」的设定，
 * 又足够撑起「不是一代而终」的人口曲线。
 */
const UPPER_MORTAL_CAP = 120;

/**
 * 凡人繁衍：每拍（10 游戏日）对一位成年凡人掷一次（**待标定**）。
 *
 * 形状与 `maybeBorn()` 逐字同构：**先均匀抽一位候选人、再掷一次签**——
 * 所以每拍的出生期望 ≈ 本常量（与人口规模无关），人口靠「死亡随规模线性增长」
 * 自动收敛到一个平衡点（凡人寿元 4200 天 ⇒ 每拍死亡率 ≈ 现存/420）。
 * 粗估平衡点 ≈ 420 × 本值；取 0.04 时约 17 人，落在 `UPPER_MORTAL_CAP` 之内。
 *
 * ⚠️ 为什么不是更大的值：凡人**会觉醒**（`stepCultivation` 的 level<=0 分支），
 * 觉醒率实测约 30%/一生。凡人人口越大，「凡人→修士」这条**额外的**修士人口
 * 来源就越强——实测取 0.08 时上界人口在 300 年就冲到 276（`UPPER_POP_CAP` 附近），
 * 取 0.04 时 300 年约 136-157。本路径的目标是「凡人能活着」，不是给上界
 * 再造一个凡间。**拧大之前先看上界总人口那条读数。**
 *
 * ⚠️ **待标定**：这个数是照着上面两条约束拧出来的，实测读数见
 * `scripts/_upperlife2probe.mjs` 的输出（跑 300 年：凡人现存 11-17 人、
 * 出生 > 0、陨落 > 0、从不归零；跨 3 个种子一致）。
 */
const UPPER_MORTAL_BIRTH_CHANCE = 0.04;

/**
 * 凡人「成年」判据：寿元的比例下限。
 *
 * 为什么用寿元比例而不是写死年数：凡人的 `lifespan` 出生时带 ±30% 抖动
 * （`0.7 + rng*0.6`），写死年数会让短寿者在「成年」前就老死。
 * 取 0.2（≈2.3 岁）——比凡间 `family.js:61` 的 `ADULT_FRAC_MIN = 0.22` 略松，
 * 因为上界凡人本来就少，门槛太紧会让「找不到成年候选人」变成常态。
 */
const UPPER_MORTAL_ADULT_FRAC = 0.2;

/**
 * 上界独立炼器的境界门槛：与 `forgeArtifact` 内部的判据**同值**
 * （`artifacts.js:310` 的 `if (level < 6) return null`）。
 *
 * ⚠️ 为什么不直接调 `forgeArtifact` 的返回值判、而要在这里再写一遍：
 * 炼器**要抽签**（`forgeArtifact` 内部连抽 4-5 次），若把不够格的人也放进
 * 候选池，抽完才被内部判 null，等于每次都为「注定炼不出」的人白抽一串签，
 * 白白扰动随机流。所以候选池在**进池前**就按同值筛掉。
 * 两处同值靠这条注释钉住：`artifacts.js` 若改了门槛，这里必须跟着改
 * （`scripts/_upperlife2probe.mjs` 有一条断言盯着「候选池里的人都够格」）。
 */
const UPPER_FORGE_MIN_LEVEL = 6;

/**
 * 上界独立炼器：每拍（10 游戏日）**抽一位**够格的修士掷一次（**待标定**）。
 *
 * 形状是「抽一位 → 掷一次」，**不是**「对每位候选各掷一次」——理由见 `maybeForge()`
 * 体内那段（逐人掷签会把每拍抽签次数挂到人口上，实测把 200 年的化生读数
 * 从 16 掀到 584）。所以本常量是**每拍**的概率，与上界人口无关：
 * 期望约 1/UPPER_FORGE_CHANCE 拍炼出一件。
 *
 * 为什么需要这条路径：`forgeArtifact` 原先只有**一个**调用点——
 * `sim/cultivation.js` 的「突破成功」分支（`cultivation.js:475`）。上界修士境界高
 * （50-69）、突破少，于是上界几乎不产法宝。300 年长测实测：上界地面无主法宝
 * 峰值只有 1 件，而裂缝的「上→下漏法宝」方向在 28311 次判定里 0 次命中——
 * 因为**候选池在结构上恒空**。这叫「结构性饿死」：抽签一直在跑、概率也对，
 * 但池子里永远没东西。补上这条不依赖突破的路径，池子才有输入。
 *
 * 标定目标：让 `upper.artifacts`（地面无主）的**峰值 > 0 且量级在几件到几十件**。
 * 取 0.006/拍（**待标定**，平均约 167 拍 ≈ 4.6 年炼出一件）。实测（seed 20260914 /
 * 7 / 424242，见 `scripts/_upperlife2probe.mjs`）：300 年地面无主峰值 5-19、
 * `artifactLog.forged` 134-207；800 年峰值 22-30、`liveArtifactCount` 407-467
 * （`LIVE_CAP = 900`，不触顶）。**关闭本路径的对照**：800 年地面峰值 5、
 * forged 33、凡人现存 0（一代而终）。
 * 这个数是照着上面的目标拧出来的，不是拍脑袋定的；拧之前先看探针里的
 * 「地面无主峰值」与 `liveArtifactCount` 两个读数。
 * ⚠️ `LIVE_CAP = 900`（按 world 分别计）打满后 `forgeArtifact` 会**静默返回
 * null**（炼器停产、不报错），所以探针里有一条「不触顶」的断言盯着。
 * ⚠️ 调大这个数会**同时**推高 `LIVE_CAP` 占用（法宝给 `equipBonus` 加修炼速度，
 * 又会反过来加快突破炼器）——0.03 时 800 年就把 `LIVE_CAP` 打满了。
 */
const UPPER_FORGE_CHANCE = 0.006;

/** 立派检查周期：与凡间 `SECT_FOUND_PERIOD_DAYS`（20 年）同节奏。 */
const UPPER_FOUND_PERIOD_DAYS = 20 * 360;

/** 立派的境界门槛：上界没有宗门体系前的「散修大能」，合体期（50+）。 */
const UPPER_FOUND_MIN_LEVEL = 50;

/** 上界仙门数上限：极简维护不做兴衰战，用上限兜住规模。 */
const UPPER_SECT_MAX = 8;

/** 上界仙门配色（循环取用）：偏青白金的水墨色，与凡间的土色系区分。 */
const UPPER_SECT_COLORS = Object.freeze([
  ['#7d8fa6', '#c9d6e3'],
  ['#8a7da6', '#d8cfe8'],
  ['#6f9a8f', '#c4e0d8'],
  ['#a68f6f', '#e8dcc4'],
]);

/** 每次立派检查最多立几家：防止一次检查把上限瞬间填满。 */
const UPPER_FOUND_BATCH_MAX = 2;

/**
 * 上界的「凡人」判据：**还没觉醒**（`level <= 0`）的、非兽非精的生灵。
 *
 * ⚠️ 判据刻意与 `cultivation.stepEntity` 的 `level <= 0` 分支**同构**
 * （`cultivation.js:286-296`：`if (sp === 'beast' || sp === 'spirit') return;`
 * 之后才是觉醒）。两处若各自演化，「上界眼里的凡人」与「stepCultivation
 * 眼里的凡人」会分叉——后果是某个生灵一边被这里当凡人、一边被那里当修士，
 * 而**不报错**。所以本函数照抄那个结构，不另立物种名单。
 *
 * ⚠️ 为什么用 `level` 而不是 `sp`：`awaken()` 会把 `sp` 从 `'human'` 改成
 * `'cultivator'`（`cultivation.js:234`），所以 `sp` 只在「觉醒前后」这一个
 * 瞬间有用；真正稳定的信号是 `level`（觉醒即 `level = 1`）。
 * 两个都看，是为了兜住「手工构造的实体只设了其中一个」的测试场景。
 *
 * ⚠️ **导出**（2026-09-19 阶段四）：长测与探针都要按同一个判据数「上界凡人」。
 * 若各写一份，「`sp` 还是 `level` 算凡人」这件事会有两个真源，哪天改一处
 * 就会让长测读数与模拟行为**悄悄分叉**（长测报「凡人 0 人」而模拟里全是凡人）。
 */
export function isUpperMortal(e) {
  if (!e) return false;
  if (e.sp === SPECIES.BEAST || e.sp === SPECIES.SPIRIT) return false;
  return (e.level || 0) <= 0;
}

/**
 * 上界模拟器。
 *
 * 生命周期与凡间 `Life` 一致：`attachUpper()` 里 `new UpperLife(upper)`，
 * 新档、读档、导入三条路径都汇聚在那一个函数，所以随机流的重建点只有一个。
 */
export class UpperLife {
  constructor(upper) {
    this.upper = upper;
    this.rng = mulberry32(((upper.seed || 0) ^ UPPER_LIFE_SEED_KEY) >>> 0);
    this.foundAccum = 0;
    // 人口账本的**唯一**归一入口（形状与兜底都在 `planes.ensureUpperPopLog`）。
    // 为什么放在构造器：新档 / 读档 / 导入三条路径都汇聚在 `attachUpper()` →
    // `new UpperLife(upper)`，所以这里跑一次等价于「所有路径都归一过」。
    // ⚠️ 必须有这一步：`worldgenUpper.resetUpperSystems` 造的是**四键** popLog
    //    （`sucked` 还没加进去，那个文件不在本轮文件域里），只靠
    //    `if (!upper.popLog)` 那种兜底**不会触发**——账本存在但缺键，
    //    于是 `popLog.sucked` 一路是 `undefined`，某天 `+= 1` 变成 NaN。
    ensureUpperPopLog(upper);
  }

  /**
   * 推进上界一个节拍（`main.js` 每 10 游戏日调一次，`dtDays` 为累计天数）。
   *
   * 顺序有讲究：先推进所有实体（这一步可能产生陨落），再统一收殓，
   * 然后才是化生与立派——**收殓必须在化生之前**，否则刚陨落的修士
   * 还能「化生弟子」，人数账会在同一天里既加又减。
   */
  step(dtDays) {
    const upper = this.upper;

    // ── 1. 修炼推进（复用凡间同一份 stepCultivation）────────────
    // `stepCultivation` 内部会累加 `age`、处理寿元与突破；飞升闸门对
    // 上界世界已分流（`cultivation.js`：`world.plane !== 'upper'`），
    // 所以这里不会把上界修士「飞升出上界」。
    // 返回值不判 'ascended'：上界没有飞升出口，那是分流保证的，
    // 若将来分流被误删，smoke 的「上界不飞升」断言会红，不靠这里兜。
    for (let i = 0; i < upper.entities.length; i += 1) {
      stepCultivation(upper, upper.entities[i], dtDays, this.rng);
    }

    // ── 2. 陨落 ─────────────────────────────────────────────
    // 判据与凡间 `Life.step`（life.js:329）逐字同源：`hp <= 0 || age >= lifespan`。
    // 两处判据若各自演化，「上界的人老不死」这种错不会报错，只会让
    // 上界人口曲线与寿元设定慢慢对不上。
    const fallen = [];
    for (let i = 0; i < upper.entities.length; i += 1) {
      const e = upper.entities[i];
      if (e.hp <= 0 || e.age >= e.lifespan) fallen.push(e);
    }
    if (fallen.length) {
      for (let i = 0; i < fallen.length; i += 1) this.bury(fallen[i]);
    }

    // ── 3. 化生（上界本土诞生）────────────────────────────────
    this.maybeBorn();

    // ── 4. 极简仙门 ─────────────────────────────────────────
    this.foundAccum += dtDays;
    if (this.foundAccum >= UPPER_FOUND_PERIOD_DAYS) {
      this.foundAccum = 0;
      this.maybeFoundSects();
    }
    this.stepSects(dtDays);

    // ── 5. 地面法宝的时钟（与凡间 `life.js:358` 同节奏）──────────────
    // **之前漏了**：上界从来没有推进过地面法宝。凡间每拍都调
    // `stepArtifacts(world, dtDays, rng)`（`life.js:358`），上界一次都没有。
    //
    // **现在为什么必须补**：补上 `bury()` 的 `dropArtifacts` 之后，上界陨落者
    // 身上的法宝会**开始落到地上堆积**；而 `LIVE_CAP = 900` 是**按 world 分别计**的
    // （`artifacts.js:650` 的 `liveArtifactCount` 数的是传入的那个 world）。
    // 上界若只堆不消耗，长期会让 `forgeArtifact` 因
    // `liveArtifactCount(upper) >= LIVE_CAP` 而**静默停产**（炼器全部返回 `null`，
    // 不报错——`cultivation.js` 那处 `if (rng() < forgeChance(entity)) forgeArtifact(...)`
    // 的返回值没人判）。拾取与朽坏正是那两件「消耗」。
    //
    // 接线核对（`stepArtifacts` 对 `world` 的依赖，逐项在上界实例上成立）：
    //   · `world.day`               —— 由 `main.js:1074` 赋值（上界共享凡间时间轴）；
    //   · `world.entities` / `world.artifacts` / `world.artifactLog` —— World 构造器照建；
    //   · `world.record`            —— 上界编年史（本文件已在用）；
    //   · `world.height/veg/riverBase/water` —— `spotLabel` 要读（`artifacts.js:272`），
    //                                 上界是完整 World 实例，四层都在。
    // 所以**可以**直接接，不需要适配层。
    //
    // ⚠️ **刻意排在 `step()` 的最末尾**，理由与 `cultivation.js:468-473` 那段
    //    「法宝刻意排在这一段的最后，为了尽量少打乱既有的随机流」完全同一条：
    //    `stepArtifacts` 会抽 `this.rng`（器灵初生 / 拾取 / 朽坏），把它排在最后，
    //    前面既有步骤（修炼 / 化生 / 立派）的抽签次数**一个都不变**，
    //    上界既有的标定尽量少受影响。
    //    ⚠️ 注意它内部的扫描闸门是 `world.day % 90 < dtDays`（`artifacts.js:669`）——
    //    这条**依赖 `world.day`**，不是模块级计数器，所以读档后两条世界线仍然同步
    //    （`artifacts.js:663-667` 那段注释写死了这个约束）。
    stepArtifacts(upper, dtDays, this.rng);

    // ── 6. 凡人繁衍（上界本土的凡人出生）──────────────────────────
    // ⚠️ **刻意排在 `stepArtifacts` 之后、`step()` 的最末尾**，与第 5 步同一条取舍：
    //    本步要抽 `this.rng`，排在最后意味着**第 1-5 步的抽签次数一个都不变**，
    //    上界既有的全部标定（化生率、立派周期、法宝三率）都不受影响。
    //    代价是「本步的读数会受前面所有步的影响」——但它本来就是新增量，
    //    没有既有标定可打乱。契约要求「尽可能靠后」，这里就是能排到的最靠后位置。
    // ⚠️ 语义上它**必须晚于第 2 步的收殓**（同 `maybeBorn` 的理由）：否则本拍刚陨落
    //    的凡人还能「繁衍后代」，人数账会在同一天里既加又减。
    this.maybeBornMortals();

    // ── 7. 上界独立炼器（不依赖突破的炼器路径）────────────────────
    // 同上的随机流取舍：排在最后。理由与标定目标见 `UPPER_FORGE_CHANCE` 的注释。
    this.maybeForge();
  }

  /**
   * 收殓一位陨落者：入逝者名录、**法宝落地/易主**、移出实体表、记两本人口账、写编年史。
   * 顺序不可换（`rememberDead` → `dropArtifacts`），理由见函数体内注释。
   *
   * ⚠️ **魂不进池**：凡间的神魂池（`world.souls`）是凡间转世链路的真实状态，
   * 上界陨落者的魂路（走幽冥还是消散）是 06 册与规格 §8.4 里**尚未拍板**的事，
   * 阶段二不给它编一个去向——`upper.souls` 恒空，smoke 有断言盯着。
   * 幽冥阶段落地时在这里接（届时 `planes.nether.souls` 的别名约定生效）。
   */
  bury(e) {
    const upper = this.upper;
    // 名录形状与凡间完全一致（`rememberDead` 自己维护 `deadLog`），
    // 未来幽冥/名录面板读上界时不需要第二套解析。
    //
    // ⚠️ **`rememberDead` 必须排在 `dropArtifacts` 之前，这一条不能动。**
    // 依据是 `necrology.js:64` 的注释原文：「要读的 `entity.artifacts` 还没被
    // `dropArtifacts` 搬走」——随葬法宝（`record.relics`）是 `rememberDead` 里
    // 从 `entity.artifacts` **现读**的（`necrology.js:301`），而下面的
    // `dropArtifacts` 会把 `entity.artifacts` 清成 `[]`（`artifacts.js:464`）。
    // 顺序反了，上界每个人的随葬法宝**永远是空的**——不报错、不抛异常，
    // 只有几百年后有人翻名录时才发现「怎么谁都没留下东西」。
    rememberDead(upper, e);

    // ── 法宝去向（与凡间 `life.js:757` 同构）──────────────────────
    // 这是一个实测抓到的**静默数据丢失**：`forgeArtifact` 在
    // `cultivation.js:475` 的「突破成功」分支里，而上界也调 `stepCultivation`
    // （本文件 `step()` 第 1 步），所以上界修士**确实**在炼器；但在此之前
    // `bury()` 只有四件事（入册 / 记人口账 / 写编年史 / 移出实体表），
    // 陨落者的法宝被 `removeEntity` 连带丢掉。300 年实测：上界炼出 20 件，
    // 地面只剩 1 件（那 1 件是「手上满了还继续炼」的溢出路径，`artifacts.js:350`）。
    //
    // ⚠️ 随机流用 `this.rng`（`UpperLife` 从 `upper.seed` 派生的**独立流**，
    //    见文件头铁律一）。**绝不能**去拿凡间的 `Life.rng`——那是全世界共用的
    //    主随机流，多抽一次整条凡间世界线就漂走，既有长测标定全部作废。
    //
    // ⚠️ `dropArtifacts` 内部会调 `findHeir`，后者遍历 `world.entities` 并读
    //    `dead.relations`（`artifacts.js:481`）。上界实体的 `relations` **存在**
    //    （`maybeBorn` 建了空 Map，`arriveUpper` 也会给），但本模块**不维护**
    //    关系网（上界不跑师徒/道侣那套）。所以 `findHeir` 几乎必然找不到接手人，
    //    每件法宝都走 `toGround` 落地。**这是预期行为，不是 `findHeir` 坏了**——
    //    别看到「上界法宝全在地上」就去改 `findHeir`。
    //
    // ⚠️ **落地的那批不写编年史**。凡间 `life.js:766-793` 把「躺在地上的法宝」
    //    记进编年史，靠的是**遗蜕**这个叙事载体（`world.addSite({kind:'ruin'})`）。
    //    上界**没有遗蜕系统**（本模块从不 `addSite`，规格也没要求），落地这件事
    //    在上界没有对应的叙事载体，硬记一条「XX 陨落，法宝坠于某地」只是噪声。
    //    这是**刻意的取舍**——**不要顺手给上界加一个遗蜕系统**。
    //    被继承人接走的那批则照凡间同款写一条（见下）；当前上界关系网恒空，
    //    这段通常一条都不写，留着是为了将来上界真有了师徒/道侣不用回来改。
    const dropped = dropArtifacts(upper, e, this.rng);
    for (let i = 0; i < dropped.length; i += 1) {
      const { artifact, heir } = dropped[i];
      if (!heir) continue;
      upper.record(narrate(this.rng, 'artifactInherit', {
        name: e.name, heir: heir.name, artifact: artifact.name, record: ownerLine(artifact).text,
      }), 'artifact', [e, heir]);
    }

    // 人口账：`died` 是**两条腿共用**的一栏（修士与凡人陨落都记这里），
    // 因为长测的人口守恒式 `entities === seeded + arrived + born − died`
    // 要的是「一共少了多少人」，不分物种。
    // ⚠️ 走 `ensureUpperPopLog` 而不是直接 `upper.popLog.died += 1`：
    //    形状只有一处定义（理由见那个函数）。凡人寿元只有修士的几十分之一，
    //    上界从此**经常**有人陨落——`died` 这条路径的调用频率被放大了一个量级，
    //    兜底再散着写就更危险。
    ensureUpperPopLog(upper).died += 1;
    upper.record(`${e.name} 于上界陨落，寿 ${Math.floor(e.age / 360)} 岁。`, 'death', e);
    upper.removeEntity(e);
    upper.touch();
  }

  /**
   * 化生：上界修士「道侣化生」出新一代。
   *
   * 与凡间 `spawn` 的同构点（字段逐项对齐，漏一项就是「读档后形状不一致」那类雷）：
   * `addEntity` 的基础字段 → `initEntity(cultivator: true)` → surname → 个人日志。
   * 差异点：没有双亲/世家（`registerBirth` 不调）、没有神魂（`attachSoul` 不调）、
   * 出生记 `popLog.born` 而不是凡间的村庄账。
   */
  maybeBorn() {
    const upper = this.upper;
    // ⚠️ 五键：`seeded` 是开局人口那本账、`sucked` 是裂缝吸人的分类栏。
    // 兜底漏了任何一个，跑过一次后那个键变 undefined，存读档等价测试会红在
    // 很远的地方。形状与归一现在**只有一处定义**（`ensureUpperPopLog`），
    // 这里调用它而不是再写一份字面量——「三处兜底各自演化」正是这个坑的源头。
    const popLog = ensureUpperPopLog(upper);
    // ⚠️ 上限判据只数**非凡人**（`UPPER_POP_CAP` 的语义在本轮被显式收窄为
    // 「上界修士人口」，理由见那个常量的注释）。凡人有自己的 `UPPER_MORTAL_CAP`。
    // 若这里改回 `upper.entities.length`，凡人会把修士的额度吃光、化生被挤停，
    // 而长测只看总数**看不出来**——`born` 慢慢掉到 0，没有任何断言会红。
    let cultivatorCount = 0;
    for (let i = 0; i < upper.entities.length; i += 1) {
      if (!isUpperMortal(upper.entities[i])) cultivatorCount += 1;
    }
    if (cultivatorCount >= UPPER_POP_CAP) return;

    const candidates = upper.entities.filter((e) => (e.level || 0) >= UPPER_BIRTH_MIN_LEVEL);
    if (!candidates.length) return;
    const parent = candidates[Math.floor(this.rng() * candidates.length)];
    if (this.rng() >= UPPER_BIRTH_CHANCE) return;

    const spot = this.findSpawnSpot(parent);
    if (!spot) return;

    const info = SPECIES_INFO[SPECIES.CULTIVATOR] || SPECIES_INFO.human;
    const parts = generateNameParts(this.rng);
    const entity = upper.addEntity({
      sp: SPECIES.CULTIVATOR,
      x: spot[0] + 0.5,
      y: spot[1] + 0.5,
      vx: 0,
      vy: 0,
      hp: info.hp,
      maxHp: info.hp,
      age: 0,
      lifespan: info.lifespan * (0.7 + this.rng() * 0.6),
      faction: parent.faction || 0,
      village: 0,
      state: 'wander',
      timer: 0,
      tx: spot[0] + 0.5,
      ty: spot[1] + 0.5,
      anim: this.rng() * 6.28,
      face: 1,
      name: parts.full,
      kills: 0,
      carried: 0,
      relations: new Map(),
    });
    if (!entity) return;
    initEntity(entity, this.rng, { cultivator: true });
    entity.surname = parts.surname;
    if (!entity.faction && parent.faction) entity.faction = parent.faction;
    const sect = upper.factions.find((f) => f.id === entity.faction);
    if (sect) sect.pop += 1;

    popLog.born += 1;
    // 个人日志（只进 entity.log，不占编年史窗口——与凡间批量出生同一纪律）。
    recordLifeEvent(
      upper,
      entity,
      'cultivate',
      `${entity.name} 于上界化生，${parent.name} 的道脉得续。`,
    );
    upper.touch();
  }

  /**
   * 凡人繁衍：上界的凡人聚落又添一口。
   *
   * ⚠️ **为什么必须有这一条**：`maybeBorn()` 只对 `level >= UPPER_BIRTH_MIN_LEVEL`
   * （50，合体期）的修士生效，凡人**不在内**。若只有修士那条路，上界凡人
   * 就是**一代而终**——被裂缝吸上来的那一批老死之后，上界再也没有凡人。
   * 「活着」与「存在过」的区别就在这一条上。
   *
   * 形状照 `maybeBorn()` 逐项对齐（同一套字段、同一套 `addEntity` → `initEntity`
   * → 姓名 → `popLog.born` → 个人日志），**差异只有三处**：
   *   ① `sp` 用 `SPECIES.HUMAN`、`initEntity` **不带** `{cultivator:true}`
   *      （凡人出生是 `level 0`、无灵根；灵根要等觉醒才给，见 `stepEntity` 的
   *      level<=0 分支）；
   *   ② `faction` 恒 0（凡人**不进仙门**，不占仙门的 `pop`；`stepSects` 数的是
   *      `e.faction === sect.id`，而仙门 id 从 1 起，所以 0 天然不被算进去）；
   *   ③ 出生记 `popLog.born`（**不是**另立一栏）——长测与存读档等价测试里有一条
   *      人口守恒式 `entities === seeded + arrived + born − died`，凡人出生
   *      若不记 `born`，那条等式当场少算一截。
   *
   * ⚠️ 随机流：只用 `this.rng`（上界从 `upper.seed` 派生的独立流）。**绝不**
   * 碰凡间 `Life.rng`——那是全世界共用的主随机流，多抽一次整条凡间世界线就漂走。
   */
  maybeBornMortals() {
    const upper = this.upper;
    const popLog = ensureUpperPopLog(upper);

    const mortals = [];
    for (let i = 0; i < upper.entities.length; i += 1) {
      const e = upper.entities[i];
      if (isUpperMortal(e)) mortals.push(e);
    }
    if (mortals.length >= UPPER_MORTAL_CAP) return;

    const adults = mortals.filter((e) => e.age >= (e.lifespan || 0) * UPPER_MORTAL_ADULT_FRAC);
    if (!adults.length) return;
    const parent = adults[Math.floor(this.rng() * adults.length)];
    if (this.rng() >= UPPER_MORTAL_BIRTH_CHANCE) return;

    const spot = this.findSpawnSpot(parent);
    if (!spot) return;

    const info = SPECIES_INFO[SPECIES.HUMAN];
    const parts = generateNameParts(this.rng);
    const entity = upper.addEntity({
      sp: SPECIES.HUMAN,
      x: spot[0] + 0.5,
      y: spot[1] + 0.5,
      vx: 0,
      vy: 0,
      hp: info.hp,
      maxHp: info.hp,
      age: 0,
      lifespan: info.lifespan * (0.7 + this.rng() * 0.6),
      faction: 0,
      village: 0,
      state: 'wander',
      timer: 0,
      tx: spot[0] + 0.5,
      ty: spot[1] + 0.5,
      anim: this.rng() * 6.28,
      face: 1,
      name: parts.full,
      kills: 0,
      carried: 0,
      relations: new Map(),
    });
    if (!entity) return;
    // ⚠️ **不带** `{cultivator:true}`：凡人出生就是 `level 0`、`root null`。
    // `initEntity` 会补齐全部惰性字段（`log` / `parentA` / `heritage*` / `artifacts`
    // ……），少这一步就是「活对象缺键、读档后有键」那类存读档分叉。
    initEntity(entity, this.rng);
    entity.surname = parts.surname;

    // ⚠️ 记 `bornMortal`，**不是** `born`：`born` 的历史含义是「**修士化生**」，
    // 长测有一条判据专守它。两者共用一个计数器会让那条判据被凡人出生顶绿
    // （理由详见 `planes.ensureUpperPopLog` 的注释）。
    // 人口守恒式随之变成 `entities === seeded + arrived + born + bornMortal − died`。
    popLog.bornMortal += 1;
    recordLifeEvent(
      upper,
      entity,
      'born',
      `${entity.name} 生于上界，${parent.name} 的血脉得续。`,
    );
    upper.touch();
  }

  /**
   * 上界**独立**的炼器路径：不依赖突破，够格的修士每拍都有一次机会。
   *
   * 为什么必须有这一条（规格与实测依据）：`forgeArtifact` 原先**只有**一个调用点
   * ——`sim/cultivation.js` 的「突破成功」分支。上界修士境界高（50-69）、突破少，
   * 于是上界几乎不产法宝；300 年长测实测上界地面无主法宝峰值只有 1 件，
   * 而裂缝的「上→下漏法宝」方向在 28311 次判定里 **0 次命中**——因为候选池
   * **在结构上恒空**。这叫「结构性饿死」：抽签一直在跑、概率也对，
   * 但池子里永远没东西。
   *
   * 接线核对（`forgeArtifact` 对 `world` 的依赖，逐项在上界实例上成立）：
   *   · `world.day` / `world.record`（写编年史）/ `world.nextArtifactId`
   *     / `world.artifacts` / `world.artifactLog` —— 上界是完整 `World` 实例；
   *   · `liveArtifactCount(world)` —— **按 world 分别计**（`artifacts.js:650`），
   *     上界有自己的 `LIVE_CAP = 900` 额度，与凡间不共享。
   * 所以**可以**直接调，不需要适配层。
   *
   * ⚠️ `LIVE_CAP = 900` 打满后 `forgeArtifact` 会**静默返回 null**（炼器停产、
   *    不报错）。探针里有一条「不触顶」的断言盯着这件事。
   * ⚠️ 候选池按 `UPPER_FORGE_MIN_LEVEL` 在**进池前**筛掉不够格的人，
   *    避免为「注定炼不出」的人白抽一串签（理由见那个常量）。
   * ⚠️ `refusesArtifacts`（体修）没有导出，所以这里**不重复实现那份判据**——
   *    体修进了池子也无害：`forgeArtifact` 内部会返回 `null`，本函数照
   *    `cultivation.js:475` 的同款写法忽略返回值。**不自己判**是因为那会造出
   *    第二份真源（哪天 `refusesArtifacts` 的定义变了，这里会悄悄分叉）。
   */
  maybeForge() {
    const upper = this.upper;
    const candidates = [];
    for (let i = 0; i < upper.entities.length; i += 1) {
      const e = upper.entities[i];
      if ((e.level || 0) >= UPPER_FORGE_MIN_LEVEL) candidates.push(e);
    }
    if (!candidates.length) return;
    // ⚠️ 形状照 `maybeBorn()`：**先均匀抽一位够格的修士、再掷一次签**——
    // 每拍只抽 **2 次** `this.rng`，与人口规模无关。
    //
    // ⚠️ 为什么**不是**「对每位候选各掷一次」（那个写法更直观，但这里刻意不用）：
    // 上界人口会涨到两三百，逐人掷签就是**每拍两三百次**抽取。`this.rng` 是
    // 一条**串行**的流，本步排在 `step()` 最后，所以每拍多抽多少，下一拍的
    // 修炼 / 化生 / 立派就整体错位多少——实测过一次：逐人掷签的写法让 200 年的
    // `popLog.born` 从 16 跳到 584，上界人口轨迹被整个掀翻。那不是「炼器变多了」，
    // 是**把既有的随机流地基换掉了**。抽签次数与人口解耦，才能把扰动钉在每拍 2 次。
    //
    // 代价：炼器总量与人口**无关**（每拍一个固定的小概率），人口越多人均越少。
    // 这是刻意的取舍——本路径的目标是给裂缝「上→下漏法宝」补上**非空的候选池**，
    // 不是让每个人都有一屋子法宝。
    const smith = candidates[Math.floor(this.rng() * candidates.length)];
    // 先掷签再炼：与 `cultivation.js:475` 的 `if (rng() < forgeChance(e)) forgeArtifact(...)`
    // 同款。返回值可能为 `null`（体修 / `LIVE_CAP` 打满），与那里一样不判。
    if (this.rng() >= UPPER_FORGE_CHANCE) return;
    forgeArtifact(upper, smith, this.rng);
  }

  /**
   * 在母体附近找一处可通行格（判定复用 `upperWalkable`，阈值单源）。
   * 随机试 24 次落空就放弃本次化生——找不到落脚点不该硬塞。
   */
  findSpawnSpot(parent) {
    const upper = this.upper;
    const cx = Math.floor(parent.x);
    const cy = Math.floor(parent.y);
    for (let t = 0; t < 24; t += 1) {
      const x = cx + Math.floor(this.rng() * 17) - 8;
      const y = cy + Math.floor(this.rng() * 17) - 8;
      if (x < 0 || y < 0 || x >= upper.w || y >= upper.h) continue;
      const i = y * upper.w + x;
      if (upperWalkable(upper, i)) return [x, y];
    }
    return null;
  }

  /**
   * 立派检查：把达到境界的散修大能立为仙门。
   *
   * faction 对象的字段**逐项对齐** `io/save.js:292` 的序列化形状——
   * 多一字段会被读档丢弃（形状分叉），少一字段读档后就是 undefined
   * （stepSects 里第一次加减就是 NaN）。上界宗门不做凡间那套
   * 收编村庄 / 争灵脉 / 大战：`villages`/`leylines`/`war` 恒空，
   * 规模由 `UPPER_SECT_MAX` 兜住。
   */
  maybeFoundSects() {
    const upper = this.upper;
    // ⚠️ 五键（理由同 `maybeBorn`）：形状与归一收敛在 `ensureUpperPopLog` 一处。
    ensureUpperPopLog(upper);
    if (upper.factions.length >= UPPER_SECT_MAX) return;
    const taken = new Set(upper.factions.map((f) => f.name));
    const founders = upper.entities
      .filter((e) => (e.level || 0) >= UPPER_FOUND_MIN_LEVEL && !e.foundedSect && !e.faction)
      .sort((a, b) => (b.level || 0) - (a.level || 0));
    let founded = 0;
    for (let i = 0; i < founders.length && founded < UPPER_FOUND_BATCH_MAX; i += 1) {
      if (upper.factions.length >= UPPER_SECT_MAX) break;
      const founder = founders[i];
      const element = (founder.root && founder.root.elements[0]) || '金';
      const name = generateSectName(this.rng, element, taken);
      taken.add(name);
      const palette = UPPER_SECT_COLORS[upper.factions.length % UPPER_SECT_COLORS.length];
      const sectId = upper.nextFactionId;
      upper.nextFactionId = sectId + 1;
      const sect = {
        id: sectId,
        name,
        color: palette[0],
        accent: palette[1],
        element,
        doctrine: '上界仙门',
        villages: [],
        pop: 1,
        followers: 0,
        kills: 0,
        reputation: 30,
        stability: 70,
        resources: { spiritStone: 20, heritage: 5, provisions: 30 },
        leylines: [],
        relations: new Map(),
        history: [],
        founderId: founder.id,
        founderName: founder.name,
        leaderId: founder.id,
        leaderName: founder.name,
        elders: [],
        foundedDay: upper.day,
        destroyedDay: -1,
        destroyReason: null,
        lastConflictDay: -1e9,
        claim: null,
        capitalX: Math.floor(founder.x),
        capitalY: Math.floor(founder.y),
        war: new Set(),
      };
      upper.factions.push(sect);
      upper.nextFactionId = Math.max(upper.nextFactionId, sect.id + 1);
      founder.foundedSect = sect.id;
      founder.faction = sect.id;
      if (!founder.daoTitle) founder.daoTitle = pickFrom(this.rng, DAO_TITLES);
      founded += 1;
      upper.record(
        `${founder.daoTitle || founder.name} 于上界开宗立派，号「${name}」。`,
        'sect',
        founder,
      );
    }
    if (founded) upper.touch();
  }

  /**
   * 仙门的极简维护：弟子清点与资源结算。
   *
   * 凡间 `stepOneSect` 读改写 `resources` 与 `stability`/`reputation`；
   * 上界没有村庄、战争与地盘，只保留两条最薄的账：
   * ① `pop` 每拍清点（谁是哪家的弟子以 `entity.faction` 为准，清点即真相，
   *    不另记一份会漂的副本）；② 灵石按宗门山门的灵气微增——上界灵气
   *    普遍高于凡间（`UPPER_QI_SCALE = 1.8`），这就是「仙门殷实」的全部来源。
   * `followers` 保留但恒 0：序列化形状需要它，上界没有「信众」概念。
   */
  stepSects(dtDays) {
    const upper = this.upper;
    if (!upper.factions.length) return;
    for (let i = 0; i < upper.factions.length; i += 1) {
      const sect = upper.factions[i];
      let pop = 0;
      for (let k = 0; k < upper.entities.length; k += 1) {
        if (upper.entities[k].faction === sect.id) pop += 1;
      }
      sect.pop = pop;
      const gi = Math.min(
        upper.qi.length - 1,
        Math.max(0, Math.floor(sect.capitalY) * upper.w + Math.floor(sect.capitalX)),
      );
      sect.resources.spiritStone += upper.qi[gi] * 0.02 * dtDays;
      sect.resources.provisions += 0.01 * dtDays;
      if (sect.history.length === 0 || upper.day - sect.history[sect.history.length - 1].day >= 3600) {
        sect.history.push({ day: upper.day, text: `${sect.name} 门下 ${pop} 人，山门灵气充盈。` });
        if (sect.history.length > 40) sect.history.shift();
      }
    }
  }
}