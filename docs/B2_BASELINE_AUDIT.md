# B2 · 阶段交付 A：基线与调用链审计（CP0）

> 《坐天观井》B2 · 世界数值与生态动力学研究 · 委托书 §1.3
> 状态：**CP0 完成**（2026-10-15）

---

## 1. 远端实况（重新执行，非抄委托书）

| 分支 | 实际 HEAD | 日期 | 说明 |
|---|---|---|---|
| `main` | `e1e55039bb56efda7a307513ede07a9fab3bf534` | 2026-10-12 | **不含任何 G2 工作**（是 `codex/g2-p0-performance-ecology` 的严格祖先，落后 30 个提交） |
| `codex/g2-p0-performance-ecology` | `e071e832e78857fc9de84cf6af2ca78764717330` | 2026-10-14 16:38 | **本轮基线**：含 G2.3 真实火灾/焦土/植被后果 + G2-P0 真实生态修复 |
| `integrate/g2-release-candidate` | `9a04236950c9f458382f4c2b4b0ed1b1f9cbe353` | 2026-10-14 05:40 | G2 集成候选；**不是**含生态修复的最新线（生态修复在其后） |
| `codex/g2.3-real-environment-aftermath` | （G2.3 分支） | 2026-10-14 之前 | 已被 g2-p0 分支包含 |

**结论（对应委托书 §1.2 的抉择）**：G2-P0 尚未并入 main，且集成候选也**不包含**其后的两个生态修复提交（`9be89c0e5`、`e071e832`）。按委托书规则，本轮从
`origin/codex/g2-p0-performance-ecology` @ `e071e832` 建立独立 B2 研究分支，并**显式记录**：

> ⚠️ **上游仍是待合流基线**。G2-P0 报告自述「PERF BLOCKED / ECO PASS，PR #8 继续 Draft，不执行最终合流」。
> 因此 B2 的全部结论绑定生态修复后的模拟，而不绑定 main。

## 2. 网络与取材方式（可复现）

本机出口代理对 `github.com` / `raw.githubusercontent.com` 不可达（CONNECT 502 / TLS 握手失败），
`api.github.com` / `codeload.github.com` / `objects.githubusercontent.com` 可达。
故：

- 分支 SHA / 树 / blob 经 `api.github.com` 获取；
- 基线内容以 `codeload.github.com/sjh20016/inkbox/tar.gz/e071e832…` 整包下载（断点续传）；
- 未使用 `git fetch`（`github.com:443` 不可达），远端跟踪引用为陈旧值，**一切以 API 实况为准**。

## 3. 基线与旧 B1 的 blob 级差异（精确盘点）

以本地 B1 HEAD `18d2b65`（= 远端 `B数值系统` `a370ad72`）对比基线 `e071e832` 的全部 984 / 1033 个 blob：

- 共有路径 524：**477 逐字节相同，47 不同**；
- 仅 B1 有 460（大量历史报告、render3d 截图资产、B 专属实验文件）；
- 仅基线有 509（G1/G2 报告、`reports/release/*` 金样本、G2 脚本组）。

### 3.1 模拟核心差异（决定 B2 必须重新Instrumentation 的关键）

| 文件 | 差异性质 | 对 B2 的影响 |
|---|---|---|
| `sim/advance.js` | 新增 `updateMapProgress(world)` 收尾调用（游戏日驱动的渐进开放时钟） | `progressive:true` 会改 digest（与 B1 结论一致）；`fired` 新增 `mapProgress` 位 |
| `sim/ecology.js` | G2-P0 真实生态修复：水域植被（`water` 参与判定）、火势残值清零、**边界格点火后不再永远燃烧**、`markDirty/flushDirty` 取代 `recomputeRect` | 火/植被世界线与 B1 **不同**（B1 digest 不可直接复用）；RNG 顺序保持「先内部后继边界」 |
| `sim/life.js` | 入口新增 `recordCombatAttempt/emitCombatHit`（G2 战斗观测）；**无 B1 遥测**；常量回退为模块级 `const`（值不变：`POP_SOFT_CAP=1400`、`BIRTH_PER_CAPITA_DAY=0.00075` 等） | telemetry/tunables 两处插桩**全部丢失**，需在新基线重新落实 |
| `sim/cultivation.js` | `awaken(entity, rng)` / `initEntity(...)` **签名去掉 `world`**；新增上界天劫 `emitPresentation` | B0.1 `awakens` 计数原挂在 `awaken` 的 `{world}` 选项上 ⇒ **重新插桩时要换挂点** |
| `sim/reincarnation.js` | 无 `tunable`；`SOUL_CAP` 恢复为普通导出常量 | `soulCapNow()` 钩子消失 |
| `sim/divine.js` | `awaken(e, rng)` 去 world；`SECT_FOUNDER_MIN_LEVEL` 改从 `sects.js` 导入 | — |
| `sim/possession.js` | 夺舍觉醒去 world | — |
| `sim/sects.js` | 入账系数恢复字面量 `0.02` / `0.03`；`SECT_CAPACITY_BASE` / `SECT_FOUNDER_MIN_LEVEL` 恢复导出常量 | B1「粮草缺汇」结论的**代码位置仍在**（`provisions` 只有 `+=` 与稳定度惩罚） |
| `sim/netherLife.js` | `NETHER_SOUL_CAP` 普通常量 | — |
| `sim/upperLife.js` | `UPPER_POP_CAP = 300` 普通常量 | — |
| `sim/presentation.js` | **新增** G2 战斗观测：`combatSources` WeakMap + 计数器 + 采样器 + 可注入 emitter，「try/catch 包住，永不影响模拟」 | **先例**：产品侧已有「WeakMap 瞬态计数器」模式，B2 遥测可循此例（且同样不进存档） |
| `sim/heavenEdicts.js` | **新模块**：天道敕令（灌顶/拨运/定心），`checkHeavenEdict` / `executeHeavenEdict(world, token, edictId)`，走 `characterIdentity.resolveCharacter` | **玩家干预的正规 API** ⇒ B2 Intervention 实验的合法注入点（§7 允许） |
| 其余 9 个 sim 文件（war / rifts / wraiths / artifacts / biography / busanzi / family / worldEvents / necrology / territory / relations / watch / divine 之外的） | 逐字节相同 | — |

### 3.2 世界生成与存档面

- `world/worldgen.js`、`world/worldgenUpper.js`、`world/worldgenNether.js`、`core/config.js`、`core/noise.js`：**与 B1 逐字节相同** ⇒ 世界生成 v2/standard 体系、`WORLD_PRESETS`、种子派生纪律原样成立。
- `world/terrain.js` 相同（`markDirty/flushDirty/recomputeRect`  signature 未变）。
- `ui/worldCreation.js`、`world/mapProgress.js`、`core/runtimeEvents.js`、`main.js`、render 层有差异（G1/G2  presentation / 生态 / 渐进开放接线）。

## 4. 正式调用链与时间语义（§1.3 六问）

### 4.1 游戏日驱动（`advanceWorld`，唯一入口）

| 时钟 | 节拍 | 抽谁的 RNG | 备注 |
|---|---|---|---|
| `life.step` | 每拍 | 凡间主随机流 `mulberry32(world.seed ^ 0xa5a5a5a5)` | 全世界共用一条 |
| `upperLife.step` | 10 日 | 上界自派生流 | 缺 `upperLife` 则跳过 |
| `stepNether` | 10 日 | 零 RNG | 收凡间 world（对账 `world.souls`） |
| `stepRifts` | 30 日 | 裂隙独立流 | **只在 `riftActive`（视界开）时累加**（契约 C1.1） |
| `stepMortalWraiths` | 10 日 | `0x4841554e` 派生流 | **不挂 riftActive**（鬼出缝后是凡间实体） |
| `stepVegetation` | 5 日 | `deps.rng`（调用方给的 ecoRng） | 不传 rng 则整组跳过 |
| `stepFire` | 0.8 日 | 同上 | 同上 |
| `updateMapProgress` | 每拍（幂等） | 无 | **G2 新增**；只写 `world.mapProgress`（进存档，改 digest） |

### 4.2 宿主真实时间驱动（**不在** `advanceWorld` 里，`main.js:update(dt)`）

| 过程 | 触发 | 语义 |
|---|---|---|
| `stepHydrology(world, 4, null)` | 每 0.16 真实秒、每帧最多 3 步、**不累积**（暂停即停） | 水文侵蚀；「无论倍速多快保持稳定步长」 |
| `decayOverlay(world, decayAccum + 2.5×360, this.rng)` | 每 2.5 真实秒 | **消耗 ecoRng**（`mulberry32(12345)`）⇒ Host-Replay 必须同流同序 |

⇒ **Natural-Day 实验（只调 `advanceWorld`）不包含水文与覆盖层衰减**。这正是委托书
§3.1 Host-Replay 与 §B2-5「灾后恢复不能只推游戏日」的机制依据：
焦土层的自然褪色在 `stepVegetation`（veg>0.35 时摘除 SCORCHED，游戏日驱动），
而 `decayOverlay` 的宿主时间衰减是另一条腿。两类实验的数据不得混为一个总体。

### 4.3 World vs Presentation

- 进正式 World：实体 / 聚落 / 宗门 / 地形（height/water/veg/fire/over）/ `mapProgress` / `world.day` 等。
- Presentation only：`sim/presentation.js` 全部计数器（WeakMap，try/catch，不进存档）、render/fxLayer、
  `runtimeEvents`（运行时事件总线，`src/inkbox/core/runtimeEvents.js`，非 World 字段）。
- G2 战斗：`recordCombatAttempt` 在攻击入口计数（含被距离拒绝的尝试），`emitCombatHit` 观测的是
  **真实 Life.attack 的 HP 扣减**，「不是新规则」——B2-5 引用战斗伤亡时以此为准。

### 4.4 RNG 消耗清单（实验纯度依据）

凡间主随机流只有 `Life` 消费；生态火/植被吃 `deps.rng`（实验必须传 ecoRng，`mulberry32(12345)`）；
裂隙 / 鬼影各有派生流；幽冥零 RNG。`decayOverlay` 也吃 ecoRng（宿主时间侧）。
⇒ 采集器若一次都不调用上述任何入口，即不可能改变随机流（B0.1 已验证，B2 复验）。

### 4.5 历史数据持久化边界

- 持久化（进 `serializeWorld`）：`world.deadLog`（necrology，含 `total/evicted` 不变量）、
  `world.soulLog` / 魂池、宗门资源、聚落、`mapProgress`、riftLog、war/clan/artifact 台账等。
- **不持久化**：B0.1 遥测（WeakMap）、G2 presentation 战斗计数（WeakMap）。
  ⇒ Save/Load 后累计值**不保证连续**；报告须标 `unavailable` / `counterReset`，不得补零。

## 5. 本轮研究边界（B2 与 G2-P0 的互不覆盖）

- 不改游戏默认平衡参数、不加新机制、不合并 main、不动存档协议（委托书 §13）。
- G2-P0 正在处理的文件（`render/terrainLayer.js`、`sim/ecology.js`）若发现正确性缺陷：
  只交付复现与补丁建议，避免并行冲突（本基线的 ecology.js 已含其生态修复）。
- 性能 GPU 矩阵不在 B2 范围（委托书 §8 G10 明示）。

## 6. CP0 放行自检

- [x] 远端四分支 SHA 实况取自 API（非委托书旧值）。
- [x] 基线抉择按 §1.2 规则执行并记录待合流状态。
- [x] blob 级差异全量盘点（477/47/460/509）。
- [x] 调用链六问基于基线源码（非 B1 记忆）回答。
- [x] 已知不可比条件：B1 digest 与 B2 不可比（ecology/life 等 11 个 sim 文件世界线不同），
  「不得把旧 B1 digest 不同直接判为失败」同样适用于 B2↔B1 对照（G9）。

**下一检查点**：CP1 —— 以基线内容建立 B2 工作区，按 A/B/C/D 审计迁移十模块，
重新落实 telemetry/tunables 插桩，跑通 CLI + 自检（G1–G10）。
