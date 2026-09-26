// 水墨沙盒 · 凡间的幽冥来客（D6-3 工程包 B）
//
// ───────────────────────────────────────────────────────────────────────
// 这是什么
// ───────────────────────────────────────────────────────────────────────
//
// 幽冥缝是**一扇双向的门**。A 包做了「凡 → 幽」那一半（活人跌进去，
// `rifts.js` 的 `fallIntoNether`）；本模块做「幽 → 凡」那一半：
// 鬼魂从缝里爬出来，在凡间飘荡一段日子，然后自己消散。
//
// ───────────────────────────────────────────────────────────────────────
// ⚠️⚠️ 为什么鬼**不能**直接放进 `world.entities`（本模块存在的全部理由）
// ───────────────────────────────────────────────────────────────────────
//
// 这是本包最承重的判决，理由是**查证过的事实**，不是偏好：
//
// 凡间与上界**共用同一份** `cultivation.stepEntity`（`life.js:26` 与
// `upperLife.js:54` 都是 `stepEntity as stepCultivation` 的别名导入）。
// 它开头有一段「凡人试着觉醒」，豁免名单长这样：
//
//     if (entity.level <= 0) {
//       if (entity.sp === 'beast' || entity.sp === 'spirit') return 'alive';
//       ... if (rng() < chance) { awaken(entity, rng); ... }
//     }
//
// `ghost` **不在豁免名单里**。于是只要鬼进了 `world.entities`：
//
//   · 普通鬼魂（`level 0`）→ 掷**觉醒骰** → `awaken()` 给 `level = 1` +
//     灵根 + `lifespan = lifespanForEntity(...)`（**寿元被重算**，不再是
//     `SPECIES_INFO.ghost` 那 100000 天）⇒ 变成一只「`sp: 'ghost'` 却
//     `level: 1`」的怪物；
//   · 鬼修（`level ≥ 1`）→ 按 `world.qi[所在格]` 修炼 → 突破 → 40 级起
//     **天雷飞升** → 上界凭空多一个鬼（`stepCultivation` 的
//     `world.plane !== 'upper'` 那道分流拦不住它——凡间 plane 是 `'mortal'`）。
//
// 两条都**不报错**，而且会污染上界人口账。
//
// 「那就在 `stepCultivation` 里加一条 `sp === 'ghost'` 的豁免」——**不**。
// 那是往**凡间最核心的修炼函数**里塞一行守卫，而且是一行**可以被顺手删掉**的
// 守卫。A 包已经定过这条纪律：**要用函数边界，不要用一行 continue**。
// 本模块就是那道边界：鬼住在 `world.wraiths`（独立容器），由
// `stepMortalWraiths`（独立 tick）驱动。凡间的一切系统——战斗、修炼、繁衍、
// 建村、夺舍、遗物——都只遍历 `world.entities`，**结构上够不到**这里。
//
// ───────────────────────────────────────────────────────────────────────
// 三条铁律在这里的形态
// ───────────────────────────────────────────────────────────────────────
//
// 1. **不抽 `Life.rng`**：游荡用自己从 `world.seed` 派生的独立流
//    （`mortalHauntRngFor`，派生键 `0x4841554e` = `'HAUN'`），挂在模块级
//    WeakMap 上，序列化器看不见。⚠️ 与裂隙流 / 幽冥缝流 / 上界流 / 幽冥流
//    **两两不同**（回归脚本 F9 逐对钉它）。
// 2. **能现算的派生量不入档**：凡间侧**不存**「累计来过多少只」——
//    它 = `wraiths.length + wraithLog.dissolved`，现算。
//    （`dissolved` 是累计量，推不出来，必须存。）
// 3. **跨世界身份带世界限定符**：爬出来的鬼**保留它在幽冥的 id**
//    （`NETHER_ID_BASE` = 2_000_000 段），不重新赋凡间段的号。
//    这样「它是从幽冥来的」这件事写在 id 里，而且与 `world.entities`
//    （凡间段）结构上不相交。
//
// ───────────────────────────────────────────────────────────────────────
// 与 A 包的分工
// ───────────────────────────────────────────────────────────────────────
//
//   · 「从幽冥出来」这件事发生在**裂缝**上 ⇒ 函数在 `rifts.js`
//     （`climbOutToMortal`，对称于 `fallIntoNether`）。
//   · 「在凡间怎么活着」这件事与裂缝无关 ⇒ 在本模块。
//   依赖方向：`rifts.js → wraiths.js → core/*`，**不成环**。
//   本模块**绝不** import `rifts.js`（那会成环），所以它不知道缝长什么样。

import { SPECIES, SPECIES_INFO } from '../core/config.js';
import { mulberry32 } from '../core/noise.js';

/**
 * 凡间鬼影的独立随机流派生键（`'HAUN'` = haunt，鬼魂作祟 / 游荡）。
 *
 * ⚠️ 必须与下面四条**两两不同**（回归脚本 F9 逐对断言）：
 *   · 裂隙      `0x72696674`（`'rift'`）
 *   · 幽冥缝    `0x4e524654`（`'NRFT'`，D6-3 A）
 *   · 上界      `0x55505052`（`'UPPR'`，`planes.js`）
 *   · 幽冥      `0x4e455452`（`'NETH'`）
 *   · mercy     `0x4d455243`（`'MERC'`）
 */
export const MORTALHAUNT_SEED_KEY = 0x4841554e;

/** 每个 world 专属的流实例（模块级 WeakMap ⇒ 序列化器看不见，铁律一）。 */
const HAUNT_RNG = new WeakMap();

/**
 * 取该 world 的凡间鬼影随机流（惰性建立）。
 * ⚠️ 取实例**不抽签**——与 `riftRngFor` / `netherRiftRngFor` 同款。
 */
export function mortalHauntRngFor(world) {
  if (!world || typeof world !== 'object') return mulberry32(MORTALHAUNT_SEED_KEY >>> 0);
  let rng = HAUNT_RNG.get(world);
  if (!rng) {
    rng = mulberry32(((world.seed || 0) ^ MORTALHAUNT_SEED_KEY) >>> 0);
    HAUNT_RNG.set(world, rng);
  }
  return rng;
}

// ── 标定 ────────────────────────────────────────────────────────────────

/** 凡间同时存在的鬼影上限。撞顶 ⇒ `spawnWraith` 返回 `null`（不落成）。 */
export const WRAITH_CAP = 120;

/** 鬼影在凡间的寿数（游戏日）。3 年——够玩家看见它飘一阵，又不至于长住。 */
export const WRAITH_DISSOLVE_DAYS = 1080;

/** 重选漫游目标的间隔（游戏日）区间。 */
export const WRAITH_RETARGET_MIN = 20;
export const WRAITH_RETARGET_MAX = 55;

/** 漫游半径（格）区间：围绕**当前位置**，所以鬼会在缝口附近打转，不会漂遍全图。 */
export const WRAITH_ROAM_MIN = 3;
export const WRAITH_ROAM_MAX = 9;

/** 凡间侧 tick 的节拍（游戏日）。与 upper / nether 同频，长测好对齐。 */
export const WRAITH_PERIOD_DAYS = 10;

/**
 * 鬼影实体模板。键集是**契约**（`save.js` 逐键显式写，见那里的 `wraiths`）。
 *
 * ⚠️ 刻意**不带**幽冥侧的两个字段：`ghostDecayDay`（消散日，那是 `stepNether`
 *    的管辖）与 `soulBind`（魂池链接，幽冥专属）。凡间用 `dissolveDay`。
 *    照搬过来会让「这只鬼到底归谁管」变成看代码的人要猜的事。
 */
const WRAITH_TEMPLATE = Object.freeze({
  // 基础运动 / 身份（`id` 由 `spawnWraith` 从幽冥侧带过来，**不重赋**）
  id: 0,
  sp: SPECIES.GHOST,
  x: 0,
  y: 0,
  tx: 0,
  ty: 0,
  vx: 0,
  vy: 0,
  hp: SPECIES_INFO.ghost.hp,
  maxHp: SPECIES_INFO.ghost.hp,
  level: 0,
  soulKind: 'ghost',
  ghostOf: null,
  name: '孤魂',
  rancor: 0,
  // 跨界留痕
  fromRiftId: 0,
  climbedDay: 0,
  dissolveDay: 0,
  // 行为
  state: 'wander',
  timer: 0,
  anim: 0,
  face: 1,
});

// ── 容器与账本（老档 / 单世界测试的兜底）──────────────────────────────

/**
 * 取 `world.wraiths`，缺失就地建空数组（照 `ensureRiftState` 的先例）。
 * @returns {Array|null} `world` 不是对象时返回 `null`（调用方据此整条跳过）。
 */
export function ensureWraiths(world) {
  if (!world || typeof world !== 'object') return null;
  if (!Array.isArray(world.wraiths)) world.wraiths = [];
  return world.wraiths;
}

/**
 * 凡间侧的鬼影账本。**只有一个键**：
 *   · `dissolved` —— 累计在凡间消散的鬼影数（累计量，推不出来，必须进档）。
 *
 * ⚠️ 刻意**不存** `arrived`（累计来过多少只）：它 = `wraiths.length +
 *    dissolved`，**现算**（铁律二）。多存一个键就多一个会与事实分叉的真相。
 * ⚠️ 也刻意**不存**「每只鬼的来处细节」——那是实体自己的字段。
 */
export function ensureWraithLog(world) {
  if (!world || typeof world !== 'object') return { dissolved: 0 };
  const log = world.wraithLog;
  if (!log || typeof log !== 'object') { world.wraithLog = { dissolved: 0 }; return world.wraithLog; }
  if (typeof log.dissolved !== 'number') log.dissolved = 0;
  return log;
}

// ── 落成 ────────────────────────────────────────────────────────────────

/**
 * 把一只鬼**落成到凡间**（`world.wraiths`）。
 *
 * ⚠️ **调用方负责「先落成、再移除」**（同 `fallIntoNether` 的顺序承重）：
 *    本函数返回 `null` 时（撞上限 / `world` 不合法），调用方**不得**把幽冥
 *    那一份删掉——否则鬼就凭空蒸发了，而函数返回得干干净净。
 *
 * @param {object} world 凡间 world
 * @param {object} spec `{ id, x, y, level, soulKind, ghostOf, fromRiftId, climbedDay }`
 * @returns {object|null} 落成的鬼影实体
 */
export function spawnWraith(world, spec = {}) {
  const list = ensureWraiths(world);
  if (!list) return null;
  if (list.length >= WRAITH_CAP) return null;      // 撞硬顶：不落成，调用方据此保留幽冥那一份

  const e = structuredClone(WRAITH_TEMPLATE);
  // ⚠️ **保留幽冥侧的 id**（铁律三）：不调 `world.addEntity`（那会赋凡间段的号）。
  //    于是「它是从幽冥来的」这件事写在 id 段里，且与 `world.entities` 不相交。
  e.id = spec.id || 0;
  e.x = spec.x;
  e.y = spec.y;
  e.tx = spec.x;
  e.ty = spec.y;
  e.level = spec.level || 0;
  e.soulKind = spec.soulKind === 'ghostCultivator' ? 'ghostCultivator' : 'ghost';
  e.ghostOf = spec.ghostOf || null;
  e.name = (spec.ghostOf && spec.ghostOf.name) || spec.name || '孤魂';
  e.fromRiftId = spec.fromRiftId || 0;
  e.climbedDay = spec.climbedDay || 0;
  // 消散日的锚点是**爬出来的那一天**（`world.day` 坐标）。与幽冥侧
  // `spawnNetherGhost` 用 `ghostOf.deathDay` 锚定同一个理由：读档后 `world.day`
  // 会继续走，而 `dissolveDay` 是绝对日 ⇒ 两条轴对得上，不会「读一次档续命」。
  e.dissolveDay = e.climbedDay + WRAITH_DISSOLVE_DAYS;
  list.push(e);
  return e;
}

/**
 * 读档还原：把 payload 里的**裸对象数组**重建成鬼影实体，写回 `world.wraiths`。
 *
 * 为什么把这一步放在本模块（而不是在 `io/save.js` 里逐字段展开）：
 * **形状只有一处定义**。`WRAITH_TEMPLATE` 是那份定义，本函数是它唯一的读侧出口——
 * 若在 save.js 里再手抄一份 22 字段的兜底表，往模板加字段时就**必然**漏一处，
 * 而且漏的那一处**不报错**（只是读档后那个字段恒为默认值）。
 *
 * ⚠️ 只收模板里有的键（`for (const k of Object.keys(WRAITH_TEMPLATE))`）：
 *    存档里多出来的野键一律丢弃。这样「world 上的形状」不会随存档内容漂移。
 * ⚠️ 老档 / 手工档缺键 → 保留模板默认值（不是 `undefined`）。
 *
 * @param {object} world 凡间 world
 * @param {Array} raw    `payload.wraiths`（缺失 / 不是数组 ⇒ 清空成空数组）
 * @returns {Array} `world.wraiths`
 */
export function restoreWraiths(world, raw) {
  const list = ensureWraiths(world);
  if (!list) return list;
  list.length = 0;
  if (!Array.isArray(raw)) return list;
  for (let i = 0; i < raw.length; i += 1) {
    const r = raw[i];
    if (!r || typeof r !== 'object') continue;
    const e = structuredClone(WRAITH_TEMPLATE);
    for (const k of Object.keys(WRAITH_TEMPLATE)) {
      if (r[k] !== undefined) e[k] = r[k];
    }
    list.push(e);
  }
  return list;
}

// ── 空间行为 ────────────────────────────────────────────────────────────

/** 这一点能不能站（凡间地形判据）。 */
function wraithCanStand(world, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return false;
  return world.isWalkable(world.idx(tx, ty));
}

/**
 * 挑一个漫游目标：围绕**当前位置**的随机可站格。
 * 找不到就原地（返回当前位置）——不抽额外的签去「努力找」。
 */
function pickHauntTarget(world, e, rng) {
  for (let k = 0; k < 24; k += 1) {
    const ang = rng() * Math.PI * 2;
    const rad = WRAITH_ROAM_MIN + rng() * (WRAITH_ROAM_MAX - WRAITH_ROAM_MIN);
    const tx = Math.floor(e.x + Math.cos(ang) * rad);
    const ty = Math.floor(e.y + Math.sin(ang) * rad);
    if (wraithCanStand(world, tx + 0.5, ty + 0.5)) return { x: tx + 0.5, y: ty + 0.5 };
  }
  return { x: e.x, y: e.y };
}

/**
 * 朝 `tx/ty` 走这一拍能走的距离。
 *
 * ⚠️ **子步化**（每步 ≤ 0.5 格）：一步到位会在高速 / 大 `days` 下**穿过**
 *    不可通行的窄条（山脊 / 河），落点看起来「合法」但路径不合法。
 * ⚠️ **单轴滑墙**：斜着走不通时试单轴，免得鬼卡在墙角抖。
 */
function moveWraith(world, e, days) {
  const speed = SPECIES_INFO.ghost.speed;          // 0.5 格/日
  let budget = speed * days;
  if (!(budget > 0)) return;
  const steps = Math.max(1, Math.ceil(budget / 0.5));
  const per = budget / steps;
  for (let s = 0; s < steps; s += 1) {
    const dx = e.tx - e.x;
    const dy = e.ty - e.y;
    const rem = Math.hypot(dx, dy);
    if (rem < 0.05) break;
    const take = Math.min(per, rem);
    const nx = e.x + (dx / rem) * take;
    const ny = e.y + (dy / rem) * take;
    if (wraithCanStand(world, nx, ny)) { e.x = nx; e.y = ny; } else if (wraithCanStand(world, nx, e.y)) { e.x = nx; } else if (wraithCanStand(world, e.x, ny)) { e.y = ny; } else { break; }   // 三面都不通：等下次重选目标
    budget -= take;
    if (!(budget > 0)) break;
  }
}

// ── 凡间侧 tick ─────────────────────────────────────────────────────────

/**
 * 凡间鬼影的一次推进（低频，每 `WRAITH_PERIOD_DAYS` 日一拍）。
 *
 * 做四件事：**脚下补位 → 到期消散 → 低频重选目标 → 移动**。
 *
 * ⚠️ **本函数不碰 `world.entities`**，一行都不碰——这是「函数边界」那句话的
 *    兑现方式。凡间的战斗 / 修炼 / 繁衍 / 建村 / 夺舍 / 遗物都只看
 *    `world.entities`，所以结构上够不到鬼影。
 * ⚠️ 也**不写编年史**：鬼在凡间的日常游荡不该灌满编年史（滚动窗口会被
 *    「某鬼飘了三格」这类条目挤掉真正的大事）。编年史只在**跨界那一刻**
 *    写一笔（`rifts.js` 的 `climbOutToMortal`），那里是玩家看得懂的事件。
 *
 * @param {object} world 凡间 world
 * @param {number} days 这一拍推进的游戏日数（调用方传累加器的值）
 * @returns {{alive:number, dissolved:number}} 这一拍之后的读数
 */
export function stepMortalWraiths(world, days) {
  const list = ensureWraiths(world);
  if (!list) return { alive: 0, dissolved: 0 };
  if (!list.length) return { alive: 0, dissolved: 0 };

  const rng = mortalHauntRngFor(world);
  const day = world.day || 0;
  const kept = [];
  let dissolved = 0;

  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];

    // ── 1. 到期消散 ───────────────────────────────────────────
    // 判据 `day >= dissolveDay`，**不是**凡间那套 `age >= lifespan`：
    // 鬼影不在 `world.entities` 里，`stepCultivation` 根本不会给它累加 `age`，
    // 拿 `lifespan` 判会**永远不消散**（`age` 恒 0）——一只鬼在凡间永生。
    if (day >= e.dissolveDay) { dissolved += 1; continue; }

    // ── 2. 脚下没地了（被水淹 / 被抬高成山）⇒ 就近补位 ─────────
    // 与 `life.js` 的 `stepEntity` 同款处理。不补的话它会卡在那里永远不动，
    // 而且面板上仍算「活着」——静默的僵尸实体。
    if (!wraithCanStand(world, e.x, e.y)) {
      let moved = false;
      for (let r = 1; r <= 6 && !moved; r += 1) {
        for (let a = 0; a < 8 && !moved; a += 1) {
          const ang = (a / 8) * Math.PI * 2;
          const nx = Math.floor(e.x + Math.cos(ang) * r) + 0.5;
          const ny = Math.floor(e.y + Math.sin(ang) * r) + 0.5;
          if (wraithCanStand(world, nx, ny)) {
            e.x = nx; e.y = ny; e.tx = nx; e.ty = ny; e.timer = 0; moved = true;
          }
        }
      }
      if (!moved) { dissolved += 1; continue; }   // 无处可去：当作消散（不静默留着）
    }

    // ── 3. 低频重选目标 ───────────────────────────────────────
    e.timer -= days;
    if (e.timer <= 0) {
      const t = pickHauntTarget(world, e, rng);
      e.tx = t.x;
      e.ty = t.y;
      e.timer = WRAITH_RETARGET_MIN + rng() * (WRAITH_RETARGET_MAX - WRAITH_RETARGET_MIN);
    }

    // ── 4. 移动 ──────────────────────────────────────────────
    moveWraith(world, e, days);
    e.anim += days * 2.4;
    if (Math.abs(e.tx - e.x) > 0.4) e.face = e.tx > e.x ? 1 : -1;
    kept.push(e);
  }

  world.wraiths = kept;
  if (dissolved) ensureWraithLog(world).dissolved += dissolved;
  return { alive: kept.length, dissolved };
}

/**
 * 凡间鬼影的读数（面板与测试**都调它**——口径单源，同 E 包的规矩）。
 *
 * `total`（累计来过）是**现算**的：`alive + dissolved`（铁律二）。
 * 它与幽冥侧的 `nether.popLog.climbedOut` **必须恒等**——那是同一批鬼的
 * 两端记账，回归脚本 F9 交叉核对它。
 */
export function wraithStats(world) {
  const list = (world && Array.isArray(world.wraiths)) ? world.wraiths : [];
  const log = (world && world.wraithLog) || {};
  const dissolved = typeof log.dissolved === 'number' ? log.dissolved : 0;
  return { alive: list.length, dissolved, total: list.length + dissolved };
}
