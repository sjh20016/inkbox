// 水墨沙盒 · 观测计数器（B0.1 遥测）
//
// ───────────────────────────────────────────────────────────────────────
// 这个文件解决什么
// ───────────────────────────────────────────────────────────────────────
//
// B0 的审计结论里有一条诚实记录的缺口（见 `docs/WORLD_LAB.md` §十一）：
//
//   · `births cumulative`   —— 没有计数器（`life.js` 只往 `world.entities` 里 push）
//   · `awakens cumulative`  —— 没有计数器（旧长测靠脚本逐年比对「去年凡人、
//                               今年 level≥1」冒充，那是夹具不是账本）
//   · `soul pool eviction`  —— 魂池满（`SOUL_CAP = 120`）时直接 `splice`，不记账
//                              ⇒ 「池子从没满过」与「池子一直在满、一直在丢魂」
//                              在 `soulPool` 这一个读数上**同形**
//
// B0.1 把它们补上。补的方式必须满足一条铁律：
//
//   > **加计数器不得改变世界线。**
//
// ───────────────────────────────────────────────────────────────────────
// 为什么是 WeakMap，而不是 `world.birthCount` 这样的字段
// ───────────────────────────────────────────────────────────────────────
//
// 三个具体理由，每一个都会在别处造成一次静默事故：
//
//   ① **不进存档**。`serializeWorld` 是显式字段清单，往 `world` 上加字段而忘了
//      序列化，读档后计数器归零 ⇒ `save-equiv` 的「键集并集」判据当场红
//      （`cultivation.js` 的 `heritageM` / `soulKind` 都因为同一件事被修过）。
//      而**加进**序列化又会改世界指纹——一个纯观测计数器不该动指纹。
//
//   ② **不改世界键集**。本模块把计数放在 `world` **之外**，所以
//      `Object.keys(world)`、`JSON.stringify(serializeWorld(world))` 一个字节都不变。
//      ⇒ 世界指纹（`digest.mjs`）天然看不见计数器，
//        「有计数器」与「没计数器」的两条世界线**必然**逐 byte 相同。
//      这不是「我们小心了」，是**结构上不可能不同**。
//
//   ③ **不抽签、不读签**。`bumpTelemetry` 只做 `+= 1`。它不碰任何 RNG，
//      也不修改任何被模拟逻辑读取的状态 ⇒ 不可能挪动主随机流的相位。
//
// ───────────────────────────────────────────────────────────────────────
// 只读口径（采集器必须走 `readTelemetry`）
// ───────────────────────────────────────────────────────────────────────
//
// `telemetryFor()` 是**惰性初始化**（没有就建一个）——它是给**模拟侧**用的。
// 采集器**绝不许**调它：那会在「采集器开着」的那条线上多写一次注册表，
// 正是 `collectors.mjs` 头注释点名的那个坑（`ensureNetherPopLog` 的同款）。
// 所以采集器只准用 `readTelemetry()`——它在没有记录时返回一份零值副本，
// **不创建**任何条目。

/** 允许的计数器键。**这份清单是唯一真相**：拼错的键会当场抛错，不会静默无效。 */
export const TELEMETRY_KEYS = Object.freeze(['births', 'awakens', 'soulEvictions']);

/**
 * 世界 → 计数器 的注册表。
 *
 * ⚠️ 键是 `world` **对象本身**（弱引用），所以世界被回收时计数器跟着走，
 *    不会泄漏。上界 / 幽冥各自是独立的 `World` 实例，因此各自有独立的一组计数——
 *    本模块只记录**凡间**（调用方传的是凡间 world）。
 */
const REGISTRY = new WeakMap();

function zeroes() {
  return { births: 0, awakens: 0, soulEvictions: 0 };
}

/** 零值读数（只读，供 `readTelemetry` 在无记录时返回）。 */
const ZERO_READING = Object.freeze(zeroes());

/**
 * 取（必要时创建）某个世界的计数器。**模拟侧专用**。
 *
 * ⚠️ 采集器不要调这个——它会创建条目。采集器用 `readTelemetry`。
 *
 * @param {object} world 凡间 world
 * @returns {object|null} 计数器对象（就地自增用）；`world` 非法时返回 `null`
 */
export function telemetryFor(world) {
  if (!world || typeof world !== 'object') return null;
  let t = REGISTRY.get(world);
  if (!t) {
    t = zeroes();
    REGISTRY.set(world, t);
  }
  return t;
}

/**
 * 记一笔。**这是本模块唯一的写入口。**
 *
 * ⚠️ 键必须是 `TELEMETRY_KEYS` 里的三个之一。拼错**当场抛错**而不是静默忽略——
 *    静默忽略会让「加了一个新计数器但从来没涨过」这件事看起来完全正常，
 *    那正是本项目最怕的那类失效（不报错、不崩溃、只是数一直是 0）。
 *
 * @param {object} world 凡间 world（可为 `null`：上界 / 无头路径下安静跳过）
 * @param {'births'|'awakens'|'soulEvictions'} key
 * @param {number} [n=1]
 */
export function bumpTelemetry(world, key, n = 1) {
  if (!world || typeof world !== 'object') return;
  if (!TELEMETRY_KEYS.includes(key)) {
    throw new Error(`bumpTelemetry: 未知计数器键「${key}」；允许：${TELEMETRY_KEYS.join(', ')}`);
  }
  const t = telemetryFor(world);
  t[key] += n;
}

/**
 * 只读读数。**采集器专用。**
 *
 * 与 `telemetryFor` 的关键差别：**没有记录时返回零值副本，绝不创建条目**。
 * 于是「采集器开着」不会给注册表多写一笔——世界线不受影响。
 *
 * @param {object} world
 * @returns {{births: number, awakens: number, soulEvictions: number}}
 */
export function readTelemetry(world) {
  const t = world && typeof world === 'object' ? REGISTRY.get(world) : null;
  if (!t) return { ...ZERO_READING };
  return { births: t.births, awakens: t.awakens, soulEvictions: t.soulEvictions };
}
