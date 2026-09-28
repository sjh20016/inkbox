// 水墨沙盒 · 视界（realm view）的纯状态与几何 —— D8-B 从 `main.js` 拔出来
//
// ───────────────────────────────────────────────────────────────────────
// 这个模块负责什么
// ───────────────────────────────────────────────────────────────────────
//
// 「视界」= 玩家在凡间划开一片自由形状，从那片形状里看**另一界**（上界 / 幽冥）
// 同坐标区域的内容。它是**观察**，不是切换地图（契约见 `VIEW_CONTRACT.md`）。
//
// 本模块只放**不碰 Canvas、不碰 DOM、不碰任何模拟状态**的东西：
//   · 「视界工具 → 它看的那一界」的真源总表；
//   · 点在自由多边形内 / 区域命中测试；
//   · 窗内可见鬼魂计数。
// 绘制在 `render/realmViewLayer.js`；主程序只留一层薄接线。
//
// ⚠️ **为什么要拆出来**（D8-B 的硬指标）：视界逻辑原先全堆在 `main.js`（约 165 KB）。
//    D8 还要往窗里加事件、点选、物品……继续堆下去 `main.js` 会变成谁都不敢碰的一坨。
//    拆成「纯状态 / 纯绘制 / 接线」三层后，主程序只剩
//    `if (this.selection) drawRealmView(...)`。
//
// ⚠️ **本模块零 import**（与 `render/relationGraph.js` 同款）：只有常量与纯函数，
//    不依赖 `sim/*`、不依赖 `render/*`、也不依赖 `ui/tools.js`。
//    于是「视界不许改世界」这条契约是**结构性**成立的——不是靠一句注释保证。
//
// ⚠️ 铁律（`npm run test:view` 逐条钉它）：本模块**不抽任何 RNG**、
//    **不写任何世界字段**、**不进存档**。

// ── 视界工具 → 它看的那一界 ─────────────────────────────────────────
/**
 * **这是「当前在看哪一界」的判据总表**，三处共用它：
 *   · `riftViewOpen()` —— 裂缝冻结判据（契约 C1.1）；
 *   · `commitSelection()` —— 开缝门控**与目标位面**（划选边缘裂开细缝，缝连哪一界）；
 *   · `viewPlane()` —— 贴哪一界的地形。
 *
 * 散着写 `toolId === 'viewUpper'` 会让「加一界」变成「改 N 处、漏一处」，
 * 而漏掉的那处**不报错**（比如裂缝照常开，只是开在没开窗的时候）。
 *
 * ⚠️ **目标位面也必须从这张表来**（D6-2 工程包 B1）：`openRifts` 的第三参
 *    `targetPlane` 与这里**必须是同一个真源**。若在别处另写一句
 *    `tool.id === 'viewNether' ? 'nether' : 'upper'`，那么「加第三界」时这里改了、
 *    那里忘了，幽冥的缝会**静默地**连到上界去——正是要根除的那个语义错误。
 *
 * ⚠️ 它**只**回答「这个工具看哪一界」；「窗口真的开着」还要 `selection` 非空，
 *    那是 `riftViewOpen()` 的第二半，两者不可互相替代。
 */
export const VIEW_TOOL_PLANE = Object.freeze({
  viewUpper: 'upper',
  viewNether: 'nether',
});

/**
 * 视界工具的 id 列表。**从 `VIEW_TOOL_PLANE` 的键派生**——不再另列一份字面量：
 * 两份清单必然分叉，而分叉的后果是「工具能看幽冥，但裂缝按上界开」（不报错）。
 */
export const VIEW_TOOL_IDS = Object.freeze(Object.keys(VIEW_TOOL_PLANE));

/** 视界面积上限（占全图比例）。划满全图会让渲染退化成「全图渲染两遍」。 */
export const VIEW_MAX_AREA_FRAC = 0.4;

/**
 * 「拖动 = 重画视界 / 短点击 = 窗内检视」的位移阈值（屏幕像素）—— D8-F。
 *
 * 视界工具与凡间划选工具**共用同一个 `mode: 'select'` 手势**：按下起一条路径、
 * 抬起提交。D8-F 要在这条手势上再分出一支——**手没怎么动**且**抬起点仍落在
 * 已开的窗内** ⇒ 那不是「重画一片山河」，而是「点窗里的东西看」。
 *
 * ⚠️ 为什么用**屏幕像素**而不是格数：玩家说的是「我点了一下」，手感在屏幕上；
 *    相机缩放到很远时一格只有零点几像素，用格数会把「点一下」判成「拖了半张图」。
 * ⚠️ 阈值取 6（蓝图 §D8-F 给的是 5～7）：低于它算点击，达到它就当拖动。
 *    它是**唯一**落点——`main.js` 与测试都从这里取，别再各写一个数。
 */
export const VIEW_CLICK_PX = 6;

/** 界名（玩家可见文案）。两个界名只在这里出现一次。 */
export const PLANE_LABEL = Object.freeze({ upper: '上界', nether: '幽冥' });

/** 这个工具是不是「视界工具」（能看另一界）。`VIEW_TOOL_PLANE` 的键。 */
export function isViewTool(toolId) {
  return VIEW_TOOL_IDS.includes(toolId);
}

/**
 * 视界工具 → 它看的那一界；不是视界工具 ⇒ `null`。
 * 这是「按当前工具分流到哪一界」的**唯一**落点。
 */
export function viewPlaneForTool(toolId) {
  return VIEW_TOOL_PLANE[toolId] || null;
}

/** 位面 id → 玩家可见界名（`'upper'` → `'上界'`）。未知位面返回 `''`。 */
export function planeLabel(plane) {
  return PLANE_LABEL[plane] || '';
}

/**
 * 射线法：点 `(x, y)` 是否落在闭合多边形 `path`（`[x, y]` 格点数组，首尾不重复）内。
 *
 * 半开区间判定（`(yi > y) !== (yj > y)`）让顶点 / 水平边只被数一次——
 * 否则恰好压在折线上的鬼魂会被算两次，计数凭空多一只。
 */
export function pointInRegion(path, x, y) {
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i, i += 1) {
    const xi = path[i][0];
    const yi = path[i][1];
    const xj = path[j][0];
    const yj = path[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * 区域命中测试：`(x, y)` 是否落在划选区域 `sel` 内。
 *
 * ⚠️ **必须与 `render/realmViewLayer.js` 的裁剪同形状**：那边的窗口是
 *    `ctx.clip()` 走 `sel.path` 那条自由折线，玩家看到的**就是那个形状**。
 *    若这里改用包围盒，套索凹进去的那几块也会被算进来 ⇒「提示行说 7 只、
 *    窗里只看得见 3 只」——读数与画面打架。
 *    `sel.path` 缺失时退回包围盒（与绘制层的矩形兜底同款防御）。
 */
export function regionContains(sel, x, y) {
  if (!sel) return false;
  const path = sel.path;
  if (path && path.length >= 3) return pointInRegion(path, x, y);
  // 兜底：矩形（含端点格，与绘制层的 `ctx.rect` 分支一致）。
  return x >= sel.x0 && x <= sel.x1 + 1 && y >= sel.y0 && y <= sel.y1 + 1;
}

/**
 * 视界窗口里**看得见**的鬼魂数（契约 `reports/d5/BATCH2-DESIGN.md` §七「Feedback」）。
 *
 * 代价 O(鬼魂数 × 顶点数)：鬼魂上限是几十、顶点也是几十，且只在**提交划选那一下**
 * 算一次（不在每帧），完全可以接受。
 *
 * ⚠️ **只对幽冥界计数**：上界没有鬼魂，加了会印出「窗内可见鬼魂 0 只」这种噪音。
 *
 * @param {object} plane `viewPlane()` 的产物（需 `plane` / `world`）
 * @param {object} sel   `normalizeRegion()` 的产物（`path` / `x0..y1`）
 * @returns {number} 窗内鬼魂数（非幽冥界 / 无选区返回 0）
 */
export function ghostsInRegion(plane, sel) {
  if (!plane || plane.plane !== 'nether' || !sel) return 0;
  const list = (plane.world && plane.world.entities) || [];
  let n = 0;
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (e && regionContains(sel, e.x, e.y)) n += 1;
  }
  return n;
}
