// Inkbox 多位面表现舞台（D8-C）—— 三界 transient 事件 → 按位面分发的 FX
//
// ───────────────────────────────────────────────────────────────────────
// 它治什么病
// ───────────────────────────────────────────────────────────────────────
//
// D7 的表现管线**只认凡间**：`main.js` 每帧只 `drainRuntimeEvents(world)`，
// 而 `fxLayer.ingestRuntimeEvents` 里一句 `if (plane !== 'mortal') continue;`
// 把上界 / 幽冥的事件全丢了。D8 要把视界升级成一扇**活着的窗**——那一界此刻
// 正在发生的事（渡劫雷、开缝、夺舍…）必须在窗里演出来。
//
// 最直觉的做法是在 `main.js` 里写三遍：
//     drainRuntimeEvents(world);
//     drainRuntimeEvents(world.upper);
//     drainRuntimeEvents(world.nether);
// —— 这正是本仓库反复踩的「多一界改 N 处、漏一处不报错」的坑（见
// `world/planes.js` 头注释：第三界又会回到「加一界改 N 处」）。于是把
// 「收三界队列 → 按位面路由 → 更新 → 画指定位面」收进**这一个**舞台对象。
//
// ───────────────────────────────────────────────────────────────────────
// 它不是什么（三条铁律，与整个 D7/D8 表现层一致）
// ───────────────────────────────────────────────────────────────────────
//   1. **不是新的模拟系统**：它只读 transient 事件队列，不写任何世界状态、
//      不进存档（事件队列住在 `core/runtimeEvents.js` 的 WeakMap 里，序列化器
//      看不见它，读档后为空）。
//   2. **不抽任何 RNG**：视觉抖动仍在 `fxLayer.js` 里走确定性哈希
//      （`visualHash`），所以同一件事每次画出来一样，浏览器截图也稳定。
//   3. **不新增三界生态**：事件类型仍由 `core/runtimeEvents.js` 登记，
//      本模块**一个都不加**。
//
// ⚠️ **本模块不 import `sim/*`**（`npm run test:presentation` 钉它）。
//    这条不是洁癖——「关视界时上界 / 幽冥事件即使被消费，也不得改变世界」
//    是 D8-C 的硬验收，而**够不到 sim 就不可能改它**，比任何注释都硬。
//
// ⚠️ **一个系统，按 plane 过滤**——**不做三份 FX 类**（蓝图 §D8-C 逐字）。
//    三个位面共用同一份 `fxLayer` 绘制代码，唯一的分流就是 `item.plane`。

import { createFxState, drawFx, ingestRuntimeEvents, updateFx } from './fxLayer.js';
import { drainRuntimeEvents } from '../core/runtimeEvents.js';

/** 三界位面名（与 `core/runtimeEvents.js` 的 `PLANES`、`world.plane` 一致）。 */
export const STAGE_PLANES = Object.freeze(['mortal', 'upper', 'nether']);

function readonlyCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(readonlyCopy));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, readonlyCopy(nested)])));
  }
  return value;
}

/**
 * 多位面表现舞台。
 *
 * 用法（`main.js`）：
 * ```js
 * this.stage = new PresentationStage();
 * // 每帧：
 * this.stage.ingestWorlds(world).update(dt);
 * // 主画布：
 * this.stage.drawPlane('mortal', ctx, this.camera, world);
 * // 视界窗内（裁剪已由 `drawRealmView` 布好）：
 * this.stage.drawPlane(plane.plane, ctx, this.camera, plane.world);
 * ```
 */
export class PresentationStage {
  constructor() {
    /** FX 状态（`fxLayer.createFxState()` 的产物：`{ items: [] }`）。 */
    this.fx = createFxState();
  }

  /**
   * 收齐三界本帧积累的 transient 事件（凡间 + `world.upper` + `world.nether`）。
   *
   * ⚠️ **每帧都要收**：每个队列有 256 上限（`RUNTIME_EVENT_CAP`），攒着会被顶掉。
   * ⚠️ 只**抽干队列**、转成 FX；不写任何世界字段——所以「视界关着也在收」
   *    不会改变模拟（`表现可以错过，历史不能错过`）。
   *
   * @param {object} world 凡间根世界（其 `.upper` / `.nether` 是子世界引用）
   * @returns {this}
   */
  ingestWorlds(world) {
    if (!world) return this;
    this.ingestWorld(world);
    if (world.upper) this.ingestWorld(world.upper);
    if (world.nether) this.ingestWorld(world.nether);
    return this;
  }

  /**
   * 抽干**单个** world 的事件队列并转成 FX（事件自带 plane，取自该 world 的
   * `plane` 字段）。子世界缺失时静默跳过——无头测试里 `world.upper` /
   * `world.nether` 常是 `undefined`。
   */
  ingestWorld(world) {
    if (!world) return this;
    ingestRuntimeEvents(this.fx, drainRuntimeEvents(world), world);
    return this;
  }

  /**
   * 推进所有 FX 的寿命（**真实秒** dt）。
   * ⚠️ 与游戏倍速 / 暂停**无关**：暂停世界时 FX 照常播完，拉到「飞」速也不会缩成一帧。
   * 零 RNG。
   */
  update(dt) {
    updateFx(this.fx, dt);
    return this;
  }

  /** Read-only, plane-filtered copy of the already ingested presentation state. */
  snapshotPlane(plane) {
    const items = this.fx.items.filter(item => item.plane === plane).map(readonlyCopy);
    return Object.freeze({ plane, items: Object.freeze(items) });
  }

  /**
   * 画**指定一位面**的 FX。FX 项自带 `plane`，这里按它过滤——三界同时有事件不会串。
   *
   * @param {'mortal'|'upper'|'nether'} plane 画哪一界
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} camera 相机（`tileScreen`）
   * @param {object} world  用哪一界的地形投影（凡间传 `world`，视界里传目标界）
   * @returns {this}
   */
  drawPlane(plane, ctx, camera, world) {
    drawFx(ctx, camera, world, this.fx, plane);
    return this;
  }
}
