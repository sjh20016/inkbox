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
