# HANDOFF · 坐天观井 Inkbox 交接单

> **这是接手入口。** 读序：`README → HANDOFF（本文）→ THREE_REALMS.md → 本包相关源码`。
> **不要**一上来吞 8 万字的 `STATUS.md`——那是历史，不是现状。
> 本文只写「现在是什么样、下一步做什么、别踩什么」。控制在 ~150 行，**不许长成 STATUS 2.0**。

---

## 0. ⚠️ 当前状态与下一工程包

> **当前阶段：Render3D M1.1D「Development Hardening」已完成**（工程加固，**不是新玩法**）。
> 委托书：[`Render3D M1.1D 工程任务清单.md`](./Render3D%20M1.1D%20工程任务清单.md)；
> 工程报告：[`Render3D M1.1D 工程报告.md`](./Render3D%20M1.1D%20工程报告.md)。
> 本阶段只做了五件事：仓库真相统一 · 分层 CI 门禁 · `WorldRenderBridge` dirty 分类 · 性能基线重测 · Three.js vendor 治理。
> **上一阶段 Render3D M1（3D 世界实体可见化）已完成并通过验收**，工程报告 `Render3D M1 工程报告.md`。
> 唯一战略目标不变：**保留现有模拟世界作为唯一真相，让 Three.js 从「地形技术原型」成长为「可以实际观察世界的沙盘」。**
> ⚠️ **下一阶段是 Render3D M2「三界空间表现架构」，尚未开始**——M2 尚未开始，**首先需要设计方案裁决**，**不得自行选方案开工**。
> ⚠️ 不要被 `D8视界 2.0 …` 与旧 `STATUS.md` 的 D8 叙事带回 Canvas 路线。
> **D8-G「跨界追迹」仍是 WIP / 暂缓**（地基已保存，UI 未做，本阶段未扩建）。

---

## 1. 当前版本与阶段

- **版本**：`v1.0.0`（`package.json` / `src/inkbox/core/config.js` 的 `APP.version`）。
- **当前阶段**：**Render3D M1.1D「Development Hardening」已完成**。活跃分支 `inkbox.html` + `src/inkbox/**`。
- **分支角色**：`main` = **唯一活跃开发主线**（所有新功能都从它开始）；
  `codex/render3d-m0` = **Render3D M0 历史技术快照**（tag `render3d-m0` 指向它）——
  ⚠️ **禁止从它开发新功能**，只作考古。
- **正式完成**：
  - **D7 观察与表现层 A–G 已封板**（发布仓库阶段提交 `dc456fa`；本工作区完整开发史**不对外发布**，
    所以这里只写**可解析的**路标，不列本地施工提交）。
  - **D8「视界 2.0 · 穿透式跨界观察」A ✅ · B ✅ · C ✅ · D ✅ · E ✅ · F ✅**（视界契约见 `VIEW_CONTRACT.md`）。
  - **Render3D M0 已完成**（地形 / 水体 / 植被 / 相机 / Raycast / 地形雕刻），独立测试 `npm run test:render3d`；技术报告 `RENDER3D_M0.md`。
  - **Render3D M1 已完成**（实体 / 聚落 / 宗门山门 / 法宝地点灵脉标记 / 3D 选中环），独立测试 `npm run test:render3d:m1`（36 项）+ 浏览器探针 `scripts/_m1-viewshot.mjs`（场景 A–F 全过）；工程报告 `Render3D M1 工程报告.md`。
  - **Render3D M1.1D 已完成**（仓库真相 / 分层 CI / dirty 分类 / 性能基线 / vendor 治理），
    独立测试 `npm run test:render3d:bridge`（36 项）+ `npm run test:vendor`（13 项）；工程报告 `Render3D M1.1D 工程报告.md`。
- **WIP / 暂缓**：**D8-G「跨界追迹」**。已保存的纯逻辑地基（有测试钉住，见 §6）：
  `sim/watch.js` 的 `netherGhostOf()`（第二条可靠跨界引用：只认 `ghostOf.route === null` 的「自裂缝跌入」者）·
  `resolveWatch` 的 `nether` 分支（**排在 `dead` 之后**）· `ui/realmTrace.js` 的 `traceTargetOf()` / `crossRealmChain()`。
  ⚠️ **追迹 UI 未做**（`main.js` 的 `maybePulseTraceTarget` 只有带 `?.` 保护的调用点、**没有实现体**）——
  **不得声称 D8-G 已完成**，本阶段也不继续扩建 Canvas 版 D8-G。
- **D8 硬指标**：D8 完成时 `main.js` **不得比 D7 baseline（3084 行）更大**——D8-F 后 **2889 行**；
  叠加 D8-G 地基（+36）后当前 **2925 行**，仍达标。
- **M1.1D 期间执行的硬禁（本阶段已完成，作为纪律记录保留；M2 的边界需另行裁决）**：
  **不新增任何玩法**（上界 / 幽冥 / 3D 视界 / D8-G UI / 新建筑 / 新交互 / AI 改动 / 概率调整全禁）·
  模拟层**禁止重写** · Three.js **只是观察者**（只读、不反写、不抽模拟 RNG）·
  **不得为「架构优雅」扩范围**（不重构 `save.js` / `rifts.js` / Sandbox，不实装 `planes.transfer()`，
  不引 ECS / 状态管理库 / 物理引擎 / BVH，不重写 Render3D）·
  **不给 `World` 加任何 renderer dirty 字段**（dirty 状态永远属于 Render3D 自己）。
  ⚠️ 施工中若发现上述问题，**只记 `BACKLOG.md`**。

## 2. 唯一启动入口

- **玩**：双击 `启动水墨沙盒.bat`，或 `node scripts/inkbox-server.mjs` 后开 `http://localhost:4180/inkbox.html`。
- **活跃分支是 `inkbox.html` + `src/inkbox/**`**。冻结主线 `index.html` + `src/`（V4.0.0）**只作考古来源，别改**。
- 服务器默认端口 **4180**。⚠️ playtest 的 `--port=` 是**浏览器调试端口**（默认 9344），**不是**游戏端口；游戏地址走 `--url=`。

## 3. 世界推进入口（唯一）

- **`sim/advance.js` 的 `advanceWorld(world, days, deps)`** 是全部「游戏日驱动」时钟的唯一定义处
  （`ADVANCE_PERIODS`：upper/nether 10 · rift 按 `RIFT_PERIOD_DAYS` · wraith 10 · eco 5 · fire 0.8）。
- **`main.js` 的 `advanceDays(days, opts)`** 是真实游戏与**全部测试**共用的入口——**测试一律调它**。
- **禁止**在测试里手写 `world.day += 30; life.step(30)`：手抄的时钟列表会腐烂且**不报错**。
- 全仓 `world.day +=` **只剩 `advance.js` 一处**。

## 4. 必读契约

- **`THREE_REALMS.md`**：三界（凡间 / 上界 / 幽冥）规则的**唯一成文处**。动了三界先读它、再跑 `npm run test:three-realms`。
- **`剧情文案素材/00_文案使用说明（AI与开发者必读）.md`**：**有约束力**——UI 禁令 / **考古定名不得擅改** / 机制缺口 → 停走设计流程。
  它是整套文案素材的**总纲与接线手册**，`01`–`06` 册（台词 / 编年史 / 墓志 / 世界内文本 / 界面 / 三界预留）由它索引。
  ⚠️ `core/lore.js`、`sim/reincarnation.js`、`world/World.js`、`scripts/inkbox-smoke.mjs` 共 **5 处注释**
  引用它的**行号**作为**定名出处**（如 `:229-239`）⇒ **必须随包出货**，否则接手者读不到规则、注释悬空。
- **三条铁律**（详见 §5/§6 与 `MEMORY-detail.md`）：
  1. **不额外抽 `Life.rng`**——新系统用 `world.seed` 派生**独立流**。
  2. **能现算的派生量不入档**。
  3. **会失效的实体引用入册解析成快照**；跨世界身份带**世界限定符**（上界 `1_000_000`、幽冥 `2_000_000`）。

## 5. 随机流纪律（改模拟前必读）

- 八条独立流（**两两不同**，由 `three-realms` F7/F9/F10/F11 逐对断言）：
  上界 `^0x55505052`（'UPPR'）· 裂缝 `0x72696674` · 幽冥 `^0x4e455452` · 幽冥缝 `0x4e524654`（'NRFT'）·
  鬼影 `0x4841554e`（'HAUN'）· 幽冥物品 `0x4e49544d`（'NITM'）· 跨位面夺舍 `0x4e505358`（'NPSX'）· mercy `0x4d455243`。
  都挂**模块级 WeakMap**，让序列化器看不见。
- ⚠️ **说「不扰动随机流」必须落成「消费主流次数恒 0」这种可数形态**；说「世界线不变」是**错的**——
  状态耦合照样能改变抽签**时机**（刻意的生态耦合，别修）。
- ⚠️ **哈希当 `[0,1)` 均匀数用必须先过 `hashStep`**：`hash32`（FNV-1a）有**高位偏置**（实测 0.70–0.74），
  直接当概率阈值会恒真且**不报错**。凡间走 `rng()` 无此坑——**幽冥专有**。

## 6. transient 事件纪律（表现层，D7-B/D · D8-C 多位面）

- `core/runtimeEvents.js`：`emitRuntimeEvent(world, type, payload)` → **按 world 分队列**的 WeakMap（**cap 256**）。
  **不进存档、不挂 World、读档后为空**。
- **收队列 / 更新 / 分发全在 `render/presentationStage.js`**（D8-C）：一帧 `stage.ingestWorlds(world)`
  收齐三界（凡间 / 上界 / 幽冥）→ `stage.update(dt)`（真实秒）→ `stage.drawPlane(plane, …)` 按位面画。
  ⚠️ **`main.js` 不自己写三遍 `drainRuntimeEvents`**（那是「加一界改 N 处」）；主画布画 `'mortal'`，
  上界 / 幽冥的 FX 由视界窗在自己的裁剪区里画。
- **表现层绝不反向依赖模拟**：`render/fxLayer.js`、`render/presentationStage.js`、
  `render/overlayLayer.js`、`render/relationGraph.js`、`render/realmViewLayer.js`
  **不 import sim/world**，**不抽任何 RNG**（视觉抖动走确定性哈希）。
- **验收核心**：删掉 `render/fxLayer.js`，模拟结果**逐字不变**；关视界时上界 / 幽冥事件
  **即使被消费也不得改变世界**。
- 模拟侧**只**通过 `sim/presentation.js` 的 `emitPresentation` 发射（它吞坏参数、绝不连累模拟）。
- **D8-E 跨界事件（`rift-cross`）**：形状只在 `sim/presentation.js` 的 **`emitRiftCross`** 定义一次
  （`{ kind, fromPlane, toPlane, phase, fromX, fromY, toX, toY, fromKey }`）。**一次跨界发两条**——
  离开端（`phase:'depart'`，画在源位面）+ 到达端（`phase:'arrive'`，画在目标位面），
  于是「玩家正看目标位面视界」时窗内直接播到达 FX。
  ⚠️⚠️ **只在转移成功之后发**（蓝图原文：「**成功以后发。** 不是"开始尝试"就发」）——
  否则落点失败 / cap 满时会出现「动画说跨界成功了，但模拟实际没发生」（表现层说谎）。
  `test:three-realms` 的 **F13** 用两条判据钉它：①源码结构「发射点排在最后一个 `return false` 之后」；
  ②运行时「失败 0 条 / 成功恰好 2 条（各在自己位面）」。
  ⚠️ **夺舍是唯一只发一端的**（`sides:'depart'`）：到达端已有 D7 的 `'possession'`（冷墨双重轮廓），
  再补 arrive 会在同一格叠两套 FX。
  发射点：cultivation（tribulation/ascension）· rifts（rift-open）· possession · war（war-start）· main（tool-impact）。
- **D8-F 窗内检视（`ui/realmInspector.js`）**：**只读**——模块里没有任何 `world.xxx =` 赋值、
  没有 `rng()` / `Math.random`、不 import `render/*` 或 `main.js`（`test:view` V8 逐条钉它）。
  ⚠️ **不复用凡间 `inspectAt()`**（那里塞着记挂 / 传记 / 关系图 / 家世，全是凡间专有）；
  **不写 `this.selected`**（那字段被 `render()` 用来在**凡间**画高亮环，塞幽冥坐标会画错地方）。
  ⚠️ **★ 天道旧识只显示、不建 upper watch**——靠 `arrivedLog.fromKey === watch[].key` 匹配。
  ⚠️ **短点击 vs 拖动的分派必须排在 `commitSelection` 之前**：检视不是一次划选，
  顺手 `commitSelection` 会走进「退化划选 ⇒ 收起视界」把窗关掉。
  分派判据（`isRealmInspectClick`）**两个条件缺一不可**：位移 < `VIEW_CLICK_PX` **且**落在已开的窗内
  （只看位移 ⇒ 窗外点一下也去检视；只看窗内 ⇒ 窗内拖一大片再也重画不了）。
  ⚠️ 阈值用**屏幕像素**不是格数（缩放到很远时一格只零点几像素）。
- **D8-G 跨界追迹（WIP / 暂缓）**：纯逻辑地基已保存，`test:view` **V9 组（17 条）**钉它：
  `sim/watch.js` 的 **`netherGhostOf(world, key)`** 只认 `ghostOf.route === null` 的鬼
  （跌入者由 `rifts.js` 的 `fallIntoNether` 显式传 `route: null`；正常成鬼的 `route` 永不为 null）——
  **不按名字猜**；`resolveWatch` 的 `nether` 分支**必须排在 `dead` 之后**（否则「死者成鬼」被误报成「跌入幽冥」）；
  `ui/realmTrace.js` 的 `traceTargetOf` / `crossRealmChain` **零 RNG、不 import `sim/*`**
  （「引路，不代替玩家开门」是**结构性**的）。
  ⚠️ **追迹 UI 未做**：`main.js` 的 `maybePulseTraceTarget` 只有**带 `?.` 保护**的调用点、**没有实现体**——
  本阶段不补它（补了就是「增加 Canvas 墨环」，超出本包范围）。

## 6b. Render3D 观察层（M0 / M1）

- **入口**：`inkbox.html?renderer=3d` 动态加载 `src/inkbox/render3d/Render3DAdapter.js`（默认 Canvas **不加载** Three.js）。
  `main.js` 的接线只有一处：`render()` 里 `if (this.render3d?.render(now)) return;`。
- **唯一坐标契约**：`render3d/coordinates.js`。世界整数 x/y = 格中心；Three X/Z = 地图平面；Three Y = 视觉高程。
  `renderX = worldX - (w-1)/2`；高程 `visualElevation(height)`；**贴地**一律走 `surfaceElevation(world, x, y)`（双线性插值）。
  ⚠️ **每层禁止各写一套「中心偏移」**。
- **数据纯度纪律（M0 建立、M1 保持）**：渲染器持有**自己的只读快照**，**不给 `World` 加 `entitiesDirty` 之类的 Three.js 专用状态**。
  地形 diff 仍归 `WorldRenderBridge`（height / water / type / veg）；**动态对象各层自管快照与刷新周期**。
- **`terrain/sculpt.js` 是 `render3d/` 下唯一允许写世界的入口**（纯编辑命令，只写 `height`）。
- ⚠️ 实体物种字段是 **`sp`**（不是 `kind`）；**`level > 0` 才是修士**；坐标是**浮点格中心（+0.5）**；
  裂缝半径**必须调 `sim/rifts.js` 的 `riftRadiusAt(rift)` 现算**（`rift.radius` 字段**不存在**）。
- 本机 `spawnSync` 偶发被环境拦截（EBUSY）⇒ 若 `npm run build` 卡在 tar 步骤，用 System32 的 bsdtar 手工补 zip
  （**不能加 `--force-local`**：Git Bash 的 GNU tar 会把 `E:\…` 当远程主机）。

## 7. 记挂系统规则（D7-E）

- **「记挂」是玩家的观察者状态，不是世界规律**——存 `world.watch`（世界级字段），
  **不挂 `world.entities`、不抽 RNG、不进三界人口守恒、不给任何数值 buff、不影响 AI**。
- key = `mortal:<id>`，**记挂的是「这一世的人」**：转世拿到新 id ⇒ **不自动继承**。
- 上限 `WATCH_CAP = 12`；满了**不静默顶掉别人**（就地提示玩家先取关）。
- 状态机（`sim/watch.js` 的 `resolveWatch`）：在世 / 异魂占身 / 已入上界 / 故人 / 已不可考。
  ⚠️ **飞升靠 `upper.arrivedLog[].fromKey === 'mortal:<id>'` 命中，绝不靠名字猜**（重名即错且不报错）。
- 存档：`World` 构造器 + `serializeWorld` + `serializeUpperWorld`/`serializeNetherWorld` `delete payload.watch`
  + `restoreWorldState` 兜底 `[]` + `reset*Systems` 归零 + save-equiv 四处注册（`UPPER_NOT_SAVED` /
  `upperForbidden` / `NETHER_FORBIDDEN_KEYS` / `worldKeys`）。**上界 / 幽冥恒空**。

## 8. 当前正式测试是否全绿

| 入口 | 结果 |
| --- | --- |
| `npm run test:core`（导入图 / 核心 / 启动 / 运行事件） | ✅ 72 文件 · 262 边 |
| `npm run test:regression` | ✅ 22 项 |
| `npm run test:three-realms`（D6-3 E 起 · D8-E 加 F13 跨界发射组） | ✅ 151 ✓ / 0 红 |
| `npm run test:save-equivalence` | ✅ 全绿 / 0 红 |
| `npm run test:presentation`（D7-C 起 · D8-C 多位面组 · D8-E 跨界组） | ✅ 127 ✓ / 0 红 |
| `npm run test:view`（D8-A 起 · D8-F 穿透检视 · D8-G 追迹地基 V9） | ✅ 111 ✓ / 0 红 |
| `npm run test:render3d`（M0：坐标 / 高程 / 拾取 / 雕刻 / 确定性 / 渲染纯度） | ✅ 19 组 |
| `npm run test:render3d:m1`（M1：数据纯度 / 实体 / 聚落 / 标记 / 坐标 / 模拟不受影响 / build） | ✅ 36 项 / 0 红 |
| `npm run test:simulation`（smoke，~6.5–13 分） | ✅ 全部通过 |
| `npm run test:browser`（playtest，需先起服务器） | ✅ 144 ✓ / 0 红 |
| `npm run test:longrun`（800 年，仅 RC） | ✅ 89 ✓ / 0 红 |
| `npm run build` | ✅ 113 files |

- **一键开发者验收**：`npm run test:d7`（core + regression + three-realms + save-equivalence + presentation）。
  smoke / browser 单独跑（太慢，别塞进每次验收）。
- ⚠️ **save-equiv 断言总数随世界演化内容浮动**（155→171→188→…），**别拿它当回归指标**——只比「红项根因」。
- ⚠️ **两条易踩的假红**：playtest 的 `点一个人能摊开「他的一生」` 有**竞态**（同版本可能红/红/绿，见 `MEMORY.md`）；
  本机空闲内存 <200MB 时 playtest 必卡在 7b 配额段（**不是**代码回归）。

## 9. 禁止顺手施工（本阶段硬禁 + 长期禁令）

- **D8 全阶段**（细则见 `VIEW_CONTRACT.md`）：
  **不新增三界生态**（鬼城 / 鬼宗 / 仙官 / 上界政治 / 新物种 / 第四世界 / 跨界战争 / 幽冥入侵）·
  **不调裂隙数值**（`RIFT_BASE_RADIUS` / `TAU_GROW` / `TAU_CLOSE` / `LEAK_CHANCE` /
  `WRAITH_CLIMB_CHANCE` / `NETHER_ITEM_LEAK_CHANCE` / `POSSESS_CHANCE`，除非 P0/P1 bug）·
  **不改变裂隙推进规则**（合法视界打开时 `riftActive` 的行为保持原样）·
  **表现层不许写世界**（`render/*` 禁改 entity / rift / watch / artifacts，禁抽模拟 RNG）·
  **不做多视界**（仍只有一扇窗）· **不做全图永久另一界模式**（视界仍是「井口」）·
  不做大 UI 改版 · 不引音频 · 不引 React/Vue/Vite/Three.js · 不随机生成轶事。
  ⚠️ 表现层**绝不消费模拟 RNG**：删掉 `render/fxLayer.js`，模拟结果逐字不变。
- **Render3D M1 全阶段**（细则见委托书 §一 / §十一）：
  **模拟层禁止重写**（不改 `advanceWorld` 时间推进 / 概率 / 随机流 / 人口上限 / 宗门村落法宝生成规则）·
  **Three.js 只是观察者**（`world.entities` / `villages` / `factions` / `artifacts` 等仍是唯一真相；**不反写**实体位置 / 宗门数据 / 人口数据；**不抽模拟 RNG**）·
  **禁止复制 Canvas 逻辑**（可参考 `render/unitsLayer.js` 的**视觉语义**，但不得把 `UnitsLayer` 大段复制成 `UnitsLayer3D`；不重写 `inspectAt()` / 传记 / 关系 / 法宝卡；不复制境界判定与裂缝生长公式）·
  **M1 只做凡间 3D**（不做 Three.js 上界 / 幽冥 / 3D 视界 / 三界切换 / D8 视觉效果迁移——留给 M2/M3）·
  **不得为「架构优雅」扩范围**（不重构 `save.js` / `rifts.js` / Sandbox，不改存档格式，不换构建系统，不引 ECS / 状态管理库 / 物理引擎 / 额外第三方渲染库）·
  **性能**：禁止 `entities.map(e => new THREE.Mesh())`、每屋一 Mesh、每人一材质 / 一 geometry、每帧 dispose+new 整层；
  用 `InstancedMesh` + `instanceColor` + 共享 geometry/material，人与建筑分开刷新。
  ⚠️ 发现上述问题**只记 `BACKLOG.md`**，不顺手解决。
- **长期禁令**：幽冥宗门/鬼城/战争 · 上界政治经济复制 · 第四世界 · 全面轮回重构 · 寻路 / A\* ·
  跨界战争 / 幽冥入侵 · 视界特效 · 裂隙大调 · 多视界同开 · `planes.transfer()` 重写。
- **开发模式**（用户 2026-09-22 · 最高优先）：只做玩家**可见 / 可操作 / 可理解**的内容。
  只有 **P0**（不能启动·崩溃·存档损坏·死循环·主操作不可用）与 **P1**（玩法不可达·UI 不可用·明显数据错误·
  主循环中断·严重性能退化）可打断主线；**P2/P3 记 `BACKLOG.md`**，别顺手修。
- **禁自行扩任务**。开工前先与用户确认范围。

## 10. 工程纪律速查（踩过的坑）

- 改 `save.js`：新增**世界级账本**要**四处齐全**（构造器 / serialize / deserialize / reset）**且**
  save-equiv **四处注册**——「写侧 `delete`」与「豁免表注册」是同一改动的两半，只做一半会红得像产品 bug。
- 扫源码判「用了某标识符」前必须**去注释**（注释里常出现被禁字面量，会假红）。
- 同一文件编辑**串行**；改 import / 声明必须 `node --check`。
- ⚠️ `cdp.js(...)` 模板串内部注释**不能出现反引号**（会截断模板串，已踩 4 次）。
- 本机 `spawnSync` 被环境拦截（EBUSY）⇒ `npm run build` 的 tar 步骤需手工用 bsdtar 补 zip。

## 11. Render3D M1 分层架构（新增表现层）

- `render3d/entities/deriveEntities.js`（**纯派生，零 THREE / 零 DOM / 零 RNG**）：`world.entities` + `world.wraiths` → 按视觉类别分组的记录数组。
  类别 `ENTITY_CLASSES = ['human','cultivator','beast','spirit','wraith']`；**判据是 `sp` 与 `level`**（`level > 0` 才是修士）。
- `render3d/entities/EntityLayer.js`：**每类一个 `InstancedMesh`（共 5 个）**，`instanceColor` 上色，高度走 `surfaceElevation`。刷新 15 Hz；`terrainChanged` 时强制重贴地。
- `render3d/settlements/SettlementLayer.js`：**只 2 个 `InstancedMesh`**（墙体盒 + 四边锥屋顶）。屋舍坐标**直接复用 `village.houses` 的 `{x,y,type}`**（整数格）；等级 `levelScale`；`STRUCT.HALL` 放大；等级 ≥2 加中心建筑；宗门用 `capitalX/capitalY` + `f.color/f.accent`。刷新 4 Hz。
- `render3d/markers/WorldMarkerLayer.js`：`artifacts`（八面体）/ `sites`（四类几何）/ `leylines`（环）/ `rifts`（环，半径**必须 `riftRadiusAt()` 现算**）。LOD：法宝 `MARKER_MIN_ZOOM=1.6`、地点 1.05、灵脉 1.3、裂缝恒显。刷新 4 Hz。
- `render3d/SelectionMarker.js`：3D 点选后的贴地选中环（`depthTest:false`、`renderOrder=6`；**不进存档、不写世界**）。
- 每个 Layer **自管快照与刷新频率**，**不给 `World` 加 dirty 字段**。`Renderer3D.update(dt)` 里 `const terrainChanged = !!this.pending` 后依次调四层。
- **实测 draw call**（本机软件光栅器，1500×940）：全图 **9**（M0 基线 3 ⇒ **+6**，达标 <15）；zoom=5 近景 **21**（LOD 放出全部标记网格；契约硬指标「几十以内」达标）；**2832 实体时全图仅 6**。
- 测试：`scripts/inkbox-render3d-m1.mjs`（`npm run test:render3d:m1`，36 项）——数据纯度 / 数量对应 / 增删 / 移动 / 贴地 / LOD / 只读 / 模拟不受影响 / build 含新文件。
- 浏览器探针：`scripts/_m1-viewshot.mjs`（RESEARCH，需先起 4180 + `?renderer=3d`）——场景 A–F 全过。

### ⚠️ 探针侧两条踩坑（都是**探针自己的**，不是产品缺陷）

1. **造内容一律走真工厂**（`life.foundVillage` / `foundSect` / `life.spawn` / `forgeArtifact`+`toGround` / `world.addSite`）。
   手搓假对象（缺 `villages` / `pop` / `leylines` / `resources`）会让 `updateHud` 读 `f.villages.length` 抛 TypeError，
   异常从 `update()` 冒出来 ⇒ **`render()` 与下一帧的 `requestAnimationFrame` 都不执行** ⇒ **帧循环静默死亡**。
   症状极具欺骗性：`debug.metrics` 冻结在最后一次成功渲染的数值上，看起来像「渲染器不更新」。
2. **不能假设「聚焦后点屏幕正中」就命中目标格**。`focusOn` 精确（屏幕正中 = `controls.target`，实测偏差 0 格），
   但 `pick` 是**地面射线**：目标格在凹地、前方隔着更高的脊时，正中会先撞上**遮挡物**（实测偏 22 格，且与 zoom 无关）。
   ⇒ 探针要**像玩家一样换方位角**（`cameraRig.rotate`）再用 `pick` 找落点。
   ⚠️ 另注：`pointerdown` 里有 `cancelFocus()`（**点击会冻结正在飞行的相机**，是刻意设计）⇒ 探针必须 `waitFor` 动画结束，不能用固定 sleep。

---

**交接完。** 有疑问先看 `ROADMAP.md`（30 秒定位）与 `BACKLOG.md`（还没做的事）。

> ⚠️ **只在开发工作区存在的文件**（干净项目包 `dist/` 里**没有**，别去找）：
> `.workbuddy-ai/memory/MEMORY.md`（判决与规则索引）· `.workbuddy-ai/memory/MEMORY-detail.md`（契约全文）·
> `scripts/_*.mjs`（RESEARCH 探针，如 `_m1-viewshot.mjs`）· `reports/`（截图与长测日志）·
> `美术素材/`（163 张 PNG，**从未入 git**）。
>
> ⚠️ **反过来的坑**（2026-09-29 修正）：以前 `剧情文案素材/`、M1 的委托书、D7 / D8 / M0 的阶段规划文档
> 也**只**在开发工作区，而**包内文档却在引用它们** ⇒ 交接时是**悬空引用**（接手的人找不到文件）。
> 现在这些文件已**全部随包出货**（见 `scripts/inkbox-package.mjs` 的 `FILES` / `DIRECTORIES`）。
