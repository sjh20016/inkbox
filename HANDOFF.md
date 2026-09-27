# HANDOFF · 坐天观井 Inkbox 交接单

> **这是接手入口。** 读序：`README → HANDOFF（本文）→ THREE_REALMS.md → 本包相关源码`。
> **不要**一上来吞 8 万字的 `STATUS.md`——那是历史，不是现状。
> 本文只写「现在是什么样、下一步做什么、别踩什么」。控制在 ~150 行，**不许长成 STATUS 2.0**。

---

## 1. 当前版本与阶段

- **版本**：`v1.0.0`（`package.json` / `src/inkbox/core/config.js` 的 `APP.version`）。
- **当前阶段**：**D7「观察与表现层」基建**（规划见 `D7「观察与表现层」.md`，A–G 七包**严格按序**）。
- **进度**：**A ✅ · B ✅ · C ✅ · D ✅ · E ✅ · F ✅ · G ←（本包，收尾）**。
  - A 零红基线（`38445e9`）· B transient 运行事件通道（`83e83d0`）
  - C Camera 2.0 一次性 focus 补间 + 落点墨环（`0408290`）
  - D FX 层 1.0 + E 记挂系统 1.0（`663d8ef`）
  - F 关系图 + 战争线（本包）· G 测试/文档/交接（本包）
- **下一包**：D7 之后的规划**尚未拍板**。BACKLOG 里 P2/P3 排着；**开工前先与用户确认方向**。

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
- **`剧情文案素材/00_文案使用说明….md`**：有约束力——UI 禁令 / **考古定名不得擅改** / 机制缺口 → 停走设计流程。
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

## 6. transient 事件纪律（表现层，D7-B/D）

- `core/runtimeEvents.js`：`emitRuntimeEvent(world, type, payload)` → WeakMap 队列（**cap 256**）。
  **不进存档、不挂 World、读档后为空**。表现层每帧 `drainRuntimeEvents`。
- **表现层绝不反向依赖模拟**：`render/fxLayer.js`、`render/overlayLayer.js`、`render/relationGraph.js`
  **零 import sim/world**，**不抽任何 RNG**（视觉抖动走确定性哈希）。
- **验收核心**：删掉 `render/fxLayer.js`，模拟结果**逐字不变**。
- 模拟侧**只**通过 `sim/presentation.js` 的 `emitPresentation` 发射（它吞坏参数、绝不连累模拟）。
  发射点：cultivation（tribulation/ascension）· rifts（rift-open）· possession · war（war-start）· main（tool-impact）。

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
| `npm run test:core`（导入图 / 核心 / 启动 / 运行事件） | ✅ 49 文件 · 217 边 |
| `npm run test:regression` | ✅ 22 项 |
| `npm run test:three-realms` | ✅ 144✓ / 0 红 |
| `npm run test:save-equivalence` | ✅ 全绿 / 0 红 |
| `npm run test:presentation`（D7-C 起） | ✅ 86 ✓ / 0 红 |
| `npm run test:simulation`（smoke，~6.5–13 分） | ✅ 全部通过 |
| `npm run test:browser`（playtest，需先起服务器） | ✅ 143 ✓ / 0 红 |
| `npm run test:longrun`（800 年，仅 RC） | ✅ 89 ✓ / 0 红 |
| `npm run build` | ✅ 71 files |

- **一键开发者验收**：`npm run test:d7`（core + regression + three-realms + save-equivalence + presentation）。
  smoke / browser 单独跑（太慢，别塞进每次验收）。
- ⚠️ **save-equiv 断言总数随世界演化内容浮动**（155→171→188→…），**别拿它当回归指标**——只比「红项根因」。
- ⚠️ **两条易踩的假红**：playtest 的 `点一个人能摊开「他的一生」` 有**竞态**（同版本可能红/红/绿，见 `MEMORY.md`）；
  本机空闲内存 <200MB 时 playtest 必卡在 7b 配额段（**不是**代码回归）。

## 9. 禁止顺手施工（本阶段硬禁 + 长期禁令）

- **D7 全阶段**：不新增三界生态 · 不改数值平衡 · 表现层不得消费模拟 RNG · 不大改 `main.js` ·
  不改存档格式（加法除外）· 不引 React/Vue/Vite/Three.js · 不随机生成轶事 · 无音频。
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

---

**交接完。** 有疑问先看 `MEMORY.md`（判决与规则索引）与 `MEMORY-detail.md`（契约全文）。
