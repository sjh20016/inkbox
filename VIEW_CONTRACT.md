# VIEW_CONTRACT · 视界契约（D8 起）

> **这份文件只回答一件事：视界「是什么」，以及什么不许做。**
> 三界规则在 `THREE_REALMS.md`；本文不重复它。实现细节看代码，不写这里。
> 视界规则变化时才改本文；不要写成流水账。
> 事实核对日期：2026-09-27（D8-F 后更新）。**实现现状**：视界已拆成三层——
> `ui/realmView.js`（纯状态 / 几何，**零 import**：`VIEW_TOOL_PLANE` / `isViewTool` / `viewPlaneForTool` /
> `planeLabel` / `pointInRegion` / `regionContains` / `ghostsInRegion` / `VIEW_CLICK_PX`）+
> `render/realmViewLayer.js`（裁剪与绘制，**不 import `sim/*`**：`drawRealmView` / `drawRiftBorder` / `drawSelectHint`）+
> `main.js` 只留接线（`riftViewOpen` / `viewPlane` / `commitSelection` / `inspectRealmAt` / `isRealmInspectClick` /
> `render()` 里的 `if (this.selection) drawRealmView(...)`）。
> **D8-C 起**：窗内的**短命特效**（渡劫雷 / 开缝 / 夺舍…）由 `render/presentationStage.js` 按位面分发——
> 舞台只画**目标位面**那一份（`stage.drawPlane(plane, …)`），且被 `ctx.clip()` 裁在窗内；凡间那一份在主画布。
> D8-B 是一次**搬家**，本文契约不因搬家而变。引用前先重跑 grep，读数会腐烂。
> **D8-D 起**：窗里「画什么」由 `render/realmViewLayer.js` 的 `REALM_VIEW_PROFILE` 按位面决定——
> 上界画宗门 / 法宝，幽冥画鬼 / 幽冥物品 / 阴气、**不画宗门**。新增的 `drawGroundArtifacts`（地面法宝，
> 放大才显）与 `drawRealmYin`（只读 `veg` 的轻微雾墨）**只读**：不写世界、不改生态数值、零 RNG；
> `npm run test:view` 的 V7 组逐条钉它。
> **D8-E 起**：六类跨界（人 / 鬼 / 物 / 灵植 / 夺舍）在**转移成功之后**各发一条 `rift-cross` 表现事件，
> **两侧各一条**——离开端（`phase:'depart'`）发在**源**位面、到达端（`phase:'arrive'`）发在**目标**位面；
> 形状只在 `sim/presentation.js` 的 `emitRiftCross` 定义一次。于是「玩家正看目标位面视界」时窗内直接播到达 FX。
> ⚠️ **不新造任何跨界概率**、**只在成功之后发**（发射点排在每个效果函数最后一个 `return false` 之后）——
> 落点失败 / cap 满时**一个事件都不发**。事件只进 transient 队列（读档后为空）、**不抽 RNG、不写世界**。
> **D8-F 起**：视界工具的手势分**两支**——**拖动 = 重画视界 / 短点击 = 窗内检视**
> （位移 < `VIEW_CLICK_PX`(6px) **且**抬起点仍落在已开的窗内；两条缺一不可）。
> 窗内可点开三样东西：**上界人物 / 幽冥鬼魂 / 幽冥物品**（`ui/realmInspector.js`，**只读**纯模块）。
> ⚠️ **窗内仍然只是观察**：不改属性 · 不传功 · 不记挂幽冥鬼 · 不施神力 · 不操控上界单位——
> 卡片里**没有任何按钮**。⚠️ 「点一下收起视界」这条出口**保留**，改由「**窗外**单击」触发。

---

## 0. 一句话

**视界是一扇「井口」：玩家在凡间划开一片自由形状，从那片形状里看到目标位面（上界 / 幽冥）
同坐标区域的内容。它是观察，不是切换地图；它不改变三界模拟。**

---

## 1. 视界是什么 / 不是什么

**是**：

- 一个**屏幕上的自由多边形窗口**（`this.selection` 的 `path`，`ctx.clip()` 裁剪）。
- 一扇**指向某一界**的窗（`VIEW_TOOL_PLANE`：`viewUpper → upper`、`viewNether → nether`）。
- 一个**副作用**：划开会沿选区边缘开裂缝（`openRifts(world, region, targetPlane)`）。

**不是**：

- 不是「全图另一界模式」——视界**始终是井口**，不是切换地图。
- 不是多窗口——**一个时刻只有一扇窗**。
- 不是可写通道——**窗内观察绝不修改目标位面**。

---

## 2. 冻结规则（十一条 · 改动需显式立项）

| # | 规则 | 判据 / 落点 |
| --- | --- | --- |
| V1 | **一个时刻只允许一个视界窗口** | `this.selection` 是单个对象，不是列表 |
| V2 | **视界窗口是 UI / 观察状态，不进存档** | 挂 `this.selection`，不挂 `world`；换世界 / 读档清空 |
| V3 | **上界 / 幽冥共用同一套视界框架** | 只有一份 `viewPlane()` 分流；加第三界只改 `VIEW_TOOL_PLANE` 一处 |
| V4 | **三界坐标一一对应，但地形语义独立** | 三张地图同尺寸同 `pad`；`(x,y)` 在各界是同一个坐标，但地形/生态各写各的 |
| V5 | **窗内只显示目标位面的内容** | `drawPlaneView` 裁剪后只贴 `plane.world` 的地形/实体；凡间的人与村**不得漏进窗** |
| V6 | **窗内观察不得修改目标位面** | 检视 / 点选路径只读；`render/*` 禁改 entity / rift / watch / artifacts |
| V7 | **划开视界仍会产生裂缝** | `commitSelection` → `openRifts`；「都开缝」但**行为按目标位面分流**（上界缝 vs 幽冥缝） |
| V8 | **D8 不改变任何裂隙概率和三界生态** | 不碰 `RIFT_BASE_RADIUS` / `TAU_GROW` / `TAU_CLOSE` / `LEAK_CHANCE` / `WRAITH_CLIMB_CHANCE` / `NETHER_ITEM_LEAK_CHANCE` / `POSSESS_CHANCE` |
| V9 | **D8 不改变当前裂隙推进语义** | 合法视界打开时 `riftActive`（`riftViewOpen()`）的行为保持原样 |
| V10 | **关闭视界后 transient 表现可丢失** | FX / 落点墨环是短命表现，关了窗就没了——**这不是 bug** |
| V11 | **历史真相仍以 `world.record` / milestone 为准** | 编年史与大事记是唯一历史账本；表现层只是「演出来」 |

### 承重判据（V5 / V6 的具体形态）

- **V5**：`drawPlaneView` 里凡间那条链（`drawRifts(this.world, …)`）**只画裂缝**——
  裂缝是**凡间与目标界的接缝**，本来就长在凡间；凡间的人 / 村子 / 聚落**一个都不画**。
- **V6**：表现层是**纯读**。核心验收——**删掉整个 `render/fxLayer.js`，模拟结果逐字不变**。
  同理，任何窗内交互（D8-F 的检视）都只读快照，不写世界。

---

## 3. 谁来守这些规则

- `scripts/inkbox-view.mjs`（`npm run test:view`，**D8-A 起**）：把上面十一条**逐步**落成断言（**42 项**；D8-A 33 → D8-B 42）。
  - 第一版**只钉旧行为**：`viewUpper → upper` · `viewNether → nether` · 同坐标 · selection 不入档 ·
    切走工具关闭视界 · 上界视界不调幽冥链路（反之亦然）· 单视界 · 关窗后 selection 为 null ·
    **视界不消费模拟 RNG**。
  - ⚠️ 它走**两条腿**：源码结构断言（去注释后**全树检索**函数体 ⇒ D8-B 搬家不该让它变红）
    + 纯模块运行时断言（`ui/tools.js` 几何 / `worldgen` / `save` / `rifts`）。
  - D8-H 扩到 V1–V8 八组（identity / plane presentation / FX purity / cross event truthfulness /
    window clipping / through-view inspect / identity tracing / regression protection）。
- `scripts/inkbox-three-realms.mjs`（`npm run test:three-realms`）：守三界规则（V4 / V8 / V9 的底座）。
- `scripts/inkbox-presentation.mjs`（`npm run test:presentation`）：守表现层纯度（V6 / V10 / V11）。

---

## 4. 明确不做（D8 全阶段硬禁）

**不新增三界生态**：鬼城 · 鬼宗 · 仙官 · 上界政治 · 新物种 · 第四世界 · 跨界战争 · 幽冥入侵。

**不调裂隙数值**：见 V8 的常量清单（除非出现 P0/P1 bug）。

**不改变裂隙推进规则**：不借「视界 2.0」顺手重定义 simulation semantics。

**表现层不许写世界**：`render/*` 禁改 entity / rift / watch / artifacts，禁抽模拟 RNG。

**不做多视界**：仍只有一扇窗（多窗会把裁剪 / 交互 / 事件路由 / 裂缝冻结 / 性能复杂度一次翻倍）。

**不做全图永久另一界模式**：视界仍是井口。

**不做大 UI 改版**：不重做整个右栏。

**不引音频**：音频以后直接订阅 Presentation Stage，等 D8 把跨界事件标准化之后再做更划算。

**不引 React / Vue / Vite / Three.js**：仍零外部依赖。

---

## 5. 与相邻契约的边界

- **`THREE_REALMS.md`**：三界（凡间 / 上界 / 幽冥）规则的唯一成文处。视界**不改**它。
- **`HANDOFF.md`**：现状真源（版本 / 入口 / 测试表 / 下一包）。
- **本文**：视界的「是什么 / 不许做什么」。

三者分工明确，**互不重复**。视界规则只在本文成文。
