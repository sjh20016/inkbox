// Inkbox 表现事件的**模拟侧发射口**（D7-D）。
//
// 为什么要有这一层：模拟模块只应「描述发生了什么」，不该知道表现层怎么演。
// 把「发射一个 transient 表现事件」收成一个动词，避免各 sim 文件各自
// `import { emitRuntimeEvent }` 并各自拼参数（那是第二个真相的温床）。
//
// ⚠️ 发射**绝不允许**改变模拟：
//   · 不写世界状态、不进存档——事件存在 `core/runtimeEvents.js` 的 WeakMap 队列里，
//     序列化器看不见它（读档后为空）；
//   · 不抽任何 RNG；
//   · 参数只放「位置 / 主体 id / 少量数值」，**不放** DOM / Canvas / 时间戳 / 对象引用。
//
// 用法：`emitPresentation(world, 'tribulation', { x, y, subjectId: entity.id })`
//
// ⚠️ 这一层**吞掉异常**（返回 null），是刻意的：发射点埋在模拟深处，
//    一个表现层的参数错误**绝不能**让 800 年的长跑崩掉。真出问题会在
//    表现层测试（`scripts/inkbox-presentation.mjs` 直接测本函数）暴露，
//    而不是在这里抛出去连累模拟。

import { emitRuntimeEvent } from '../core/runtimeEvents.js';

/**
 * 发一个短命表现事件。**纯副作用在表现队列上**，与模拟状态无关。
 * @param {object} world 世界对象（事件按 world 分队列）
 * @param {string} type `core/runtimeEvents.js` 里登记过的类型之一
 * @param {object} [payload] 可选 `{ plane, day, x, y, subjectId, targetId, intensity, data }`
 * @returns {object|null} 事件快照；参数非法时为 null（见文件头「吞掉异常」）
 */
export function emitPresentation(world, type, payload = {}) {
  if (!world || typeof world !== 'object') return null;
  try {
    return emitRuntimeEvent(world, type, payload);
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════
// D8-E：跨界动作「在两边发生」——统一的 `rift-cross` 发射口
// ══════════════════════════════════════════════════════════════════
//
// 六类跨界（人 / 鬼 / 物 / 灵植 / 夺舍）各自埋在 `rifts.js` / `possession.js`
// 的深处，若每处自己拼一个 `emitPresentation(world, 'rift-cross', {...})`，
// 就是文件头警告的那件事：**同一个形状被抄六遍**，改一处必漏五处（第二个真相的温床）。
// 所以形状**只在这里定义一次**，各成功点只填「谁、从哪、到哪」。
//
// ⚠️⚠️ **只在转移真正成功之后调用。** 蓝图原文：
//     「**成功以后发。** 不是"开始尝试"就发。」
//     否则落点失败 / cap 满 / 目标不存在时会出现「动画说跨界成功了，但模拟
//     实际没发生」——那是典型「表现层说谎」。各调用点的插入位置因此都在
//     `return true` 之前、而在所有失败分支（`return false`）之后。
//
// ⚠️ **本函数零副作用、零 RNG、不写世界**：它只往 transient 队列推事件
//     （WeakMap，序列化器看不见）。删掉它，模拟结果逐字不变。
//
// ── 为什么一次发**两条**事件（depart + arrive）──────────────────
// `render/presentationStage.js` 按 `event.plane` 把 FX 路由到对应画面：
// 凡间 → 主画布，上界 / 幽冥 → 视界窗。**一条事件只画一个位面**。
// 要兑现蓝图那句「凡间一个人从裂缝边消失，而幽冥窗口同坐标处出现一团鬼影」，
// 就得**两侧各发一条**：离开端发在源位面、到达端发在目标位面。
// 于是「玩家此时正在看目标位面的视界」时，窗内直接播出到达 FX。

/** `rift-cross` 的 `data.kind` 取值（跨界主体的类别）。 */
export const RIFT_CROSS_KINDS = Object.freeze([
  'person',     // 活人（凡 → 上 / 凡 → 幽）
  'ghost',      // 鬼魂 / 鬼修（幽 → 凡）
  'artifact',   // 法宝（上 → 凡 / 凡 → 上 / 幽 → 凡）
  'herb',       // 灵植（上 → 凡）
  'possession', // 夺舍 / 附身（幽 → 凡，跨的是**元神**）
]);

/** `rift-cross` 的 `data.phase` 取值（这一条事件画的是哪一端）。 */
export const RIFT_CROSS_PHASES = Object.freeze(['depart', 'arrive']);

const RIFT_CROSS_KIND_SET = new Set(RIFT_CROSS_KINDS);
const RIFT_CROSS_PLANES = new Set(['mortal', 'upper', 'nether']);

/**
 * 发一次跨界表现事件（离开端 + 到达端各一条）。
 *
 * @param {object} world 凡间根世界（事件队列挂在它身上；`plane` 由参数显式给出，
 *   所以**不需要**调用方分辨「该发给 `world.upper` 还是 `world.nether`」——
 *   `presentationStage.ingestWorlds` 每帧把三界队列都收干，按 `event.plane` 路由）。
 * @param {object} spec
 *   @param {'person'|'ghost'|'artifact'|'herb'|'possession'} spec.kind 跨界主体类别
 *   @param {'mortal'|'upper'|'nether'} spec.fromPlane 源位面
 *   @param {'mortal'|'upper'|'nether'} spec.toPlane   目标位面（必须 ≠ `fromPlane`）
 *   @param {number} spec.fromX 离开端坐标（源位面格坐标）
 *   @param {number} spec.fromY
 *   @param {number} spec.toX   到达端坐标（目标位面格坐标）
 *   @param {number} spec.toY
 *   @param {string} [spec.fromKey] 离开端的**稳定身份 key**（如 `mortal:123`）。
 *     蓝图：不要依赖名字做身份；人物能带 `mortal:<id>` 的就带稳定 key。
 *   @param {string|number} [spec.subjectId] 主体 id（FX 视觉种子用；可为空）
 *   @param {string|number} [spec.targetId]  目标 id（如夺舍的容器；可为空）
 *   @param {number} [spec.day] 省略时取 `world.day`
 *   @param {'both'|'depart'|'arrive'} [spec.sides='both'] 只发哪一端。
 *     默认两侧都发；**夺舍**例外——它的到达端已由 D7 的 `'possession'` 事件
 *     演（冷墨双重轮廓，正是蓝图要求的「凡间目标身上出现 D7 的冷墨双重轮廓」），
 *     所以只补「离开端」（幽冥侧鬼影淡去），免得同一格画两套。
 * @returns {object[]} 成功入队的事件快照（非法参数时为空数组，**不抛**）
 */
export function emitRiftCross(world, spec = {}) {
  if (!world || typeof world !== 'object') return [];
  const {
    kind, fromPlane, toPlane,
    fromX, fromY, toX, toY,
    fromKey = null, subjectId = null, targetId = null,
    day, sides = 'both',
  } = spec;

  // 参数非法一律**静默不发射**（返回空数组）——本函数埋在各转移函数的成功路径上，
  // 一个表现层的参数错误绝不能连累模拟（同 `emitPresentation` 的「吞掉异常」）。
  if (!RIFT_CROSS_KIND_SET.has(kind)) return [];
  if (!RIFT_CROSS_PLANES.has(fromPlane) || !RIFT_CROSS_PLANES.has(toPlane)) return [];
  if (fromPlane === toPlane) return [];                 // 跨界必须跨位面
  if (![fromX, fromY, toX, toY].every((v) => typeof v === 'number' && Number.isFinite(v))) return [];
  if (sides !== 'both' && sides !== 'depart' && sides !== 'arrive') return [];

  // `data` 是**一条**事件的完整描述：两端坐标 + 方向 + 类别 + 稳定 key。
  // 顶层的 `x` / `y` 只是「这一条画在哪一格」的锚点（= 该端的坐标），
  // 与 `data` 里的两端坐标不是冗余——FX 只按顶层坐标落笔，`data` 供将来的
  // 检视器 / 追迹（D8-F / G）读全貌。
  const base = { kind, fromPlane, toPlane, fromX, fromY, toX, toY, fromKey };
  const out = [];
  if (sides === 'both' || sides === 'depart') {
    out.push(emitPresentation(world, 'rift-cross', {
      plane: fromPlane, x: fromX, y: fromY, subjectId, targetId, day,
      data: { ...base, phase: 'depart' },
    }));
  }
  if (sides === 'both' || sides === 'arrive') {
    out.push(emitPresentation(world, 'rift-cross', {
      plane: toPlane, x: toX, y: toY, subjectId, targetId, day,
      data: { ...base, phase: 'arrive' },
    }));
  }
  return out.filter((e) => e !== null);
}
