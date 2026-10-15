# G2-P0.3 · 阶段 A：性能证据勘误与真实瓶颈确认报告

- 委托书：《坐天观井 / Inkbox》G2-P0.3（性能证据勘误、真实瓶颈确认与植被更新降载试点）
- 产品基线：`codex/g2-p1-integration-validation` @ **`74934a8`**（= PR #12 head；远端分支 ref `72d95b3` 经 `git rev-list --left-right --count` 判定为其**祖先**，故不换基线）
- 取证分支：`analysis/g2-p03-attribution-correction`，独立 worktree `.g2-p03a-worktree`
- 环境：Microsoft Edge · **ANGLE (AMD, AMD Radeon(TM) 610M, D3D11 vs_5_0)** · 1500×940 · DPR 2 · Native 时钟
- **产品源码改动：0 处。既有脚本改动：0 处。**（相对基线仅 3 个新增文件、875 行插入）

---

## 0. 结论一览

| 项 | 结果 |
| --- | --- |
| 水文计数器 | **PASS**（A2 11 项单测 + 双路逐帧一致） |
| G2 门禁水文归因 | **CONFIRMED（水文不执行）** |
| G2 植被上传触发源 | **CONFIRMED**（`veg` 通道 + 0.15 s 节流器） |
| A/A 稳定性 | **COMPLETE**（4 批 × 4 轮，含门禁同构判据模拟） |
| 非暂停水文瓶颈 | **SUPPORTED**（直接因果，非相关） |
| 植被优化 | **NOT_STARTED**（见 §7 裁决） |
| 正式 G2 状态 | **BLOCKED（不变）** |

---

## 1. H1 旧版错误说明（勘误）

上一轮（G2-DIAG-H1）的取证脚本用下式判断水文是否执行：

```js
const delta = post.hydroAccum - pre.hydroAccum;
if (!paused && delta > 0) { /* 计算水文步数 */ }
```

**判据错误。** 产品里 `hydroAccum` 只有两种写入（`src/inkbox/main.js:2093/2096`）：

```js
this.hydroAccum += dt;                 // 增量 ≈ +dt
this.hydroAccum -= 0.16;               // 每一次都是一次 stepHydrology()
```

水文**真的执行一步时累加器是下降的**，`delta` 为负 ⇒ 那个 `delta > 0` 把**补水帧整段漏掉**。
上一轮 live 运行出现 `hydroBlocks=252` 而 `hydroSteps=0`，正是该 bug 的表现
（块执行了 252 次，却一次都没数出来）。

该错误**不影响** H1 关于「门禁不执行水文」的结论（那个结论来自 `paused` 恒真 + 零调用，
且当时用的是导出法），但它使**运行时**的水文计数完全不可信——本轮已重做。

---

## 2. 计数器修复证明

### 2.1 双路独立证据（`scripts/inkbox-g2-hydro-counter.mjs`）

| 路 | 做法 | 为什么可信 |
| --- | --- | --- |
| **直接法** | 在**实例字段** `hydroAccum` 上装存取器，拦截每一次写入；「减 0.16 的次数」即 `stepHydrology()` 的直接调用次数 | 产品只在水文块内写它；不改产品文件、不改控制流/参数/返回值 |
| **推导法** | `steps = round((accumBefore + dt - accumAfter) / 0.16)`，并校验残差 ≤ 1e-9、步数 ∈ [0,3] | 用产品自己的算术反推 |

两路共用**同一份实现**：页面侧源码由 `hydroAccessorSource()` 生成，不存在两套实现分叉。

**实测 `otherWrites = 0`**（全部门禁/live 运行）⇒ 产品里除 `+dt` 与 `-0.16` 外**没有别的写入者**，
存取器判据成立。

### 2.2 单测（`scripts/inkbox-g2-hydro-attribution-check.mjs`，11 项，退出码 0）

A2-1 未达阈值 0 步 · **A2-2 `0.15+1/60` 跨阈值 1 步，并显式断言旧判据在此帧漏报** ·
A2-3 `0.02+1/60` 0 步 · **A2-4 `dt` 被截断到 0.12 必须按截断后的值算**（用原始 RAF 间隔会多算，
且被残差校验拒绝）· A2-5 暂停 0 步不累加、暂停却动累加器判 INVALID ·
A2-6 Controlled 固定 1/60 连续 12 帧逐帧自洽 · A2-7 多步积压与 3 步上限，装作 4 步被拒 ·
A2-8 两路冲突 ⇒ 失败 · 附加 3 项（见 §2.3）。

### 2.3 一个只有正对照才能暴露的 bug（本轮抓到并修复）

把 `inferHydroSteps` 注入页面时，它的**模块级常量不会跟着走**：

```
ReferenceError: HYDRO_PERIOD_S is not defined
    at inferHydroSteps   ← k.frame 的 RAF 回调里
```

门禁口径下 `paused` 恒真、函数在 `if (paused)` 处 early-return，**碰不到那几个常量**，
所以**永远不报错**；只有非暂停路径才走到 `consumed / HYDRO_PERIOD_S`。
更糟的是它炸在 RAF 回调里，而 `frame()` 是在 `update()` **之后**才
`requestAnimationFrame` ⇒ 整个游戏循环停摆（A7 首跑表现为 `waitFrames` 超时）。

**修法**：常量与函数一并注入。**并补一条反例单测**：在隔离作用域里把注入形态真跑一遍，
paused 与非 paused 两条路径都必须过。没有这条正对照，此 bug 会一直藏着。

---

## 3. 正式 G2 门禁是否执行水文 —— **不执行，一次都没有**

### 3.1 静态

| 项 | 证据 | 位置 |
| --- | --- | --- |
| 水文唯一调用点 | `stepHydrology(world, 4, null)` | `src/inkbox/main.js:2098` |
| 暂停判据 | `const paused = this.speedIndex === 0 \|\| editingTerrain;` | `src/inkbox/main.js:2077` |
| 水文块只在此块内 | `if (!paused) { this.hydroAccum += dt; while (...) { … stepHydrology(…) } }` | `src/inkbox/main.js:2092-2100` |
| 门禁强制暂停 ① | `k.speedIndex=0;` | `scripts/inkbox-g2-performance.mjs:58` |
| 门禁强制暂停 ② | setter 劫持 `set(k){…;k.speedIndex=0;}` | 同文件:115 |
| `newWorld()` / `scenarioSetup()` 不改速度 | 无 `setSpeed` / `speedIndex=` | `main.js:379-418`、`inkbox-g2pf-config.mjs:31-44` |
| 门禁逐帧推进的是**游戏日** | `this.advanceDays(STEP)`，`STEP=.1` | `inkbox-g2-performance.mjs:81, 17` |
| 其它 `stepHydrology` 调用者 | 仅 `inkbox-smoke.mjs`（长测）与一个单测 harness | 全仓检索 |

### 3.2 动态 —— **用正式门禁自己的 `setup()` / `measure()`**

`setup()` 与 `measure()` 从门禁**文件文本里原样抽取**后求值使用（不能直接 import：
该文件顶层有副作用）。抽取段 SHA-256 `043d85fc…`，常数 `FRAMES=90 / WARM=120 / STEP=0.1 / SEED=673231`
取自门禁自身常量行。执行顺序严格为
**建独立页面 → setup → 正式战斗 fixture → scenarioSetup → measure**。

原始数据：`reports/analysis/g2-p03/attribution-gate-cases6-native.json`

| 观测量 | 实测 |
| --- | --- |
| 相位 | 1 + **warmup 120** + **measured 90** + settlement 1 + snapshots 1 |
| 战斗 fixture | `count=2, pairs=1, seed=673231, originalEntitiesRetained=true`（未删 NPC） |
| **水文直接法** | **0** |
| **水文推导法** | **0** |
| 两路不一致帧 | **0 / 213** |
| `paused` | 恒真（90/90） |
| `otherWrites` | 0 |
| `frameCpuMs` P50/P95/P99 | 2.3 / 21.4 / 25.5 ms |
| `updateCpuMs` P95 | **1.2 ms** |
| `renderCpuMs` P95 | **20.7 ms** |

⇒ **正式 G2 门禁的性能阻塞与水文无关。** Astra 的 §1.1 / §E3 / §E4 / §5-P1 归因**不成立**。

---

## 4. 真实 G2 fixture 的植被触发源（A6）

原始数据同上文件。四类**直接**证据（不靠时间相关性）：

| 证据 | 来源 | 实测 |
| --- | --- | --- |
| 脏通道 | `WorldRenderBridge.changes()` 返回值 | `veg` **90/90 帧**；`height`/`type`/`water` **0** |
| 生灵进食 | `Life.prototype.step` 注入标志 | `lifeStepped` **90/90 帧** |
| 生态/火势 | `advanceDays()` 的**返回值 `fired`** | fire 10、eco 2、upper 1、nether 1、wraith 1 |
| 真实 GPU 上传 | 拦截 `bufferSubData`/`bufferData` | **162 次 / 24,656,832 字节**（90 帧） |

植被更新 **22 次**，`treeCount` 恒为 10000，**唯一成员签名仅 7 个**。

**触发链（每一环都有直接证据）**：

```
每帧 advanceDays(0.1)  →  life.step() 吃草写 world.veg（sim/life.js:679）
                       →  stepFire（0.8 日 ≈ 8 帧）/ stepVegetation（5 日）
                       →  bridge 的 veg 通道**每帧**为真（90/90）
                       →  PlaneStage.vegetationPending = true（81/90）
                       →  treeClock >= 0.15 节流器 ⇒ 每 ~9-10 帧一次完整重建
```

**分类**：`LIFE_VEG_CHANGE` = **CONFIRMED**（`lifeStepped` 90/90 与 `veg` 脏 90/90 逐帧吻合）；
`ECOLOGY_CHANGE` / `FIRE_CHANGE` = 有产品自证但不构成每帧驱动（fire 10 次 / eco 2 次）；
`HEIGHT_CHANGE` / `WATER_CHANGE` = 门禁口径下**为 0**；`REGION_CHANGE` / `LOD_CHANGE` = 未观测到。

**与水文的关系**：**无**。水文 0 次调用，而周期上传照常出现。

---

## 5. A/A 对照（§A5）

方法：**完全相同**的源码 / 种子 / fixture / 每轮独立页面 / 120 暖 + 90 测 / 画质与 DPR；
判据按**门禁自身形式**穷举 4 轮的 12 种有序分组（组内取最差 P95，判 `OnWorst ≤ OffWorst×1.08 + 1.5`）。

| 批次 | 各轮 `frameCpuMs` P95 (ms) | 极差 | 判为回退 | 最小余量 |
| --- | --- | --- | --- | --- |
| case 6 Off4（第 1 批） | 19.8 / 20.1 / 16.4 / 17.6 | 22.6% | 0/12 | +0.408 |
| case 6 Off4（第 2 批） | 22.8 / 21.3 / 18.8 / 19.0 | 21.3% | **2/12** | **−0.78** |
| case 6 On4 | 21.8 / 19.3 / 22.1 / 18.3 | 20.8% | 0/12 | +0.244 |
| case 5 Off4（第 1 批） | 7.9 / 7.6 / 7.5 / 7.7 | 5.3% | 0/12 | +1.808 |
| case 5 Off4（第 2 批） | 8.6 / 7.9 / **12.5** / 8.1 | **58.2%** | **6/12** | **−2.252** |
| case 5 On4 | 12.7 / 12.5 / **20.6** / 12.7 | **64.8%** | **6/12** | **−5.384** |

**回答 §A5 六问：**

1. **同配置 CPU P95 相差多少**：case 6 为 3.8–4.0 ms（20.8–21.3%）；case 5 为 0.4–8.1 ms（5.3–64.8%）。
2. **同配置 RAF P95 相差多少**：离群轮必然出现在 RAF 上——case 5 的 `rawRaf` P95 在 5.7 / 11.1 / 22.2 ms 之间跳，
   case 6 在 16.8 / 22.2 / 27.8 ms 之间跳。**显示节拍本身在轮间变化，不是工作量变化。**
3. **是否出现不同的渲染工作分布**：是（P95 与长帧比例在轮间漂移）。
4. **植被重建是否落在不同测量帧**：是（同配置下更新次数 21–23 波动，帧号序列不同）。
5. **哪些慢帧与植被重建同帧**：仅能判定 `CORRELATED_ONLY`——本报告的逐帧数据同时记录了
   `bridge`/`fired`/`lifeStepped`/`glBytes`，可逐帧复核，但未证明「植被重建导致该帧慢」。
6. **真实 G2 战斗 FX 的附加影响**：On4 与 Off4 的 P95 分布**重叠且不可区分**
   （case 6：On 18.3–22.1 vs Off 16.4–22.8），在当前噪声下**测不出 FX 增量**。

**结论：6 个批次里 3 个出现假失败。** 门禁的余量（≈1.08×+1.5 ≈ 2.1 ms @ 20 ms）**低于它自己的噪声底**。
case 5 两次一批稳一批不稳 ⇒ 波动是**间歇性**的，这正是三份历史报告里「失败集合每轮漂移」的来源。

---

## 6. 非暂停水文性能（A7）

方法：正式公开入口 `setSpeed(2)`，**不注入任何 `advanceDays`**，120 暖 + 180 测 × 2 轮。
原始数据：`reports/analysis/g2-p03/attribution-live-L1-L2-native.json`

| 场景 | 水文步（直接/推导） | 含水文步帧 → **后一帧** `simDt` P50/P95 | 无水文步帧 → 后一帧 | 后一帧 >33 ms |
| --- | --- | --- | --- | --- |
| **L1 Canvas** 512×320 ×2 轮 | 8/8、9/9 | 22.3 / 27.9 ms | 5.6 / 11.1 ms | **0/8、0/9** |
| **L2 Three** 512×320 ×2 轮 | 20/20、20/20 | **72.4 / 89.1–94.6 ms** | 5.6 / 27.8 ms | **20/20、20/20** |

两路计数**逐帧一致**（`inconsistent = 0`），`paused` 帧数为 0，`otherWrites = 0`。

**分层判断（委托书要求把三类分开）**：

1. **水文计算本身**：单步直接耗时 P50 ≈ 0 ms、P95 ≤ 0.1 ms（由存取器在写入瞬间计时）。
   这**不等于**水文便宜——它量的是「两次累加器写入之间的间隔」，不含同帧内后续的
   派生与提交；真正的成本在下一层。
2. **水文完成后的下游更新**：L2 的 `height`/`type`/`water` 脏通道**恰好出现在 20/20 个水文步帧**
   （`veg` 另有 183/183 帧，与水文本无关）。这是**一一对应**，属直接因果。
3. **两者叠加造成长帧**：L2 含水文步帧的**后一帧** P50 **72.4 ms**、>33 ms 命中 **20/20**；
   无水文帧仅 3/162。⇒ **`RUNTIME_HYDRO_CHAIN_SUPPORTED`**

**⚠️ 与门禁归因严格区分**：这是**正常游玩**的运行时风险，**不是**原 G2 门禁的直接归因
（门禁 `paused` 恒真、水文 0 次）。委托书 §1.1 要求区分的正是这两件事。

**未采集**：`canvasRebakeMs`、`threeTerrainMs`、`threeWaterMs`、`threeVegetationMs` 的**分项**耗时
（未逐函数计时，属 `null`，不估算填充）；`waterChangedCells` 等逐格变化数同理。

---

## 7. §8 完成门槛逐项核验

| # | 门槛 | 状态 | 证据 |
| --- | --- | --- | --- |
| 1 | 水文计数器单元测试全部通过 | ✅ | `node scripts/inkbox-g2-hydro-attribution-check.mjs` → 退出码 **0**，11 项 |
| 2 | 直接计数与独立算术推导一致 | ✅ | 门禁 213 帧、live 750 帧，`inconsistent = 0` |
| 3 | 原始 RAF 与模拟 dt 已分离 | ✅ | 五类时间口径分列；`main.js:1923` 截断点已确认 |
| 4 | 原 G2 fixture 已真实复用 | ✅ | 抽取源 SHA-256 `043d85fc…`；`combatFixtureExpression` + `scenarioSetup` |
| 5 | Case 6 植被触发来源可信记录 | ✅ | §4：脏通道 + `fired` + `lifeStepped` + GL 字节 |
| 6 | Case 5/6 A/A 已完成 | ✅ | §5：Off4 ×2 批 + On4，含门禁同构判据模拟 |
| 7 | 非暂停 Canvas/Three 可独立复算 | ✅ | §6，离线脚本重算 |
| 8 | 原始 JSON 与报告统计一致 | ✅ | 全部统计由 `--recalc` 从原始数组重算 |
| 9 | 产品源码未改变 | ✅ | `git status --porcelain -- src inkbox.html` 为空；3 新增 / 0 修改 |
| 10 | 测试脚本不存在已知计数错误 | ✅ | 已修 2 处（`delta>0`；常量未注入）并各配单测/正对照 |

**阶段 A = `A_PASS`。**

---

## 8. 阶段 B 裁决：**不启动**

§9 规定的候选是「成员/位置/属性等价时跳过全量实例重写与 GPU 上传」。
A6 已经证明**冗余确实存在**（22 次完整重建只有 7 个唯一成员签名、24.7 MB 上传），
但其**可测收益被 §5 的噪声底挡住**：

- 该优化只作用于 **Three 场景**，而 case 6 的 A/A 最小余量仅 **0.244–0.408 ms**；
- 候选若要「稳定复现」，其 P95 改善必须显著大于噪声（经验上 ≥ 2–3× 噪声底 ⇒ 目标 ≥ 1–2 ms）；
- 而植被全量重建的**总 CPU 贡献尚未单独计量**（本轮未做逐函数计时，
  `renderCpuMs` P95 20.7 ms 中植被占多少是**未知**）——在不知道收益上界的情况下贸然实现，
  正是委托书 §15 禁止的「无证据的优化」。

**因此本轮不创建 `codex/g2-p03-vegetation-pilot` 的任何产品修改。**
建议的下一步见 §9。

---

## 9. 建议下一轮（供委托方裁决）

1. **先给植被更新单独计时**（在 `VegetationLayer.update()` 外层补一个**测试侧**计时，
   不改产品），得到它在 `renderCpuMs` 中的占比 ⇒ 才知道候选的收益上界。
2. **把验收阈值设在噪声底之上**：case 6 目标 ≥ 1.5 ms 且需两轮候选都复现；
   case 5 因其波动更大（可达 5 ms），不宜作为验收场景。
3. **门禁口径问题独立立项**：A/A 已证明同代码会被判回退（3/6 批次），
   这属于**测量系统**问题，与 FX 优化无关；但它决定后续所有性能工作能否被可信度量。

---

## 10. 可独立复算的原始数据与命令

| 内容 | 路径 |
| --- | --- |
| 门禁口径（正式 fixture + 正式 setup/measure） | `reports/analysis/g2-p03/attribution-gate-cases6-native.json` |
| A/A Off4 | `reports/analysis/g2-p03/attribution-aa-cases6-5-offoffoffoff-native.json` |
| A/A On4 | `reports/analysis/g2-p03/attribution-aa-cases6-5-on4-native.json` |
| A7 非暂停 L1/L2 | `reports/analysis/g2-p03/attribution-live-L1-L2-native.json` |
| 机器可读摘要 | `reports/analysis/g2-p03/attribution-summary.json` |

```bash
# 计数器自测（11 项）
node scripts/inkbox-g2-hydro-attribution-check.mjs

# 从原始 JSON 独立重算全部统计（P50/P95/P99、长帧比例、水文分组、A/A 离散）
node scripts/inkbox-g2-hydro-attribution-check.mjs --recalc=reports/analysis/g2-p03/<file>.json

# 重新采集
node scripts/inkbox-g2-hydro-attribution.mjs --mode=gate --cases=6
node scripts/inkbox-g2-hydro-attribution.mjs --mode=aa   --cases=6,5 --arms=off,off,off,off
node scripts/inkbox-g2-hydro-attribution.mjs --mode=live --live=L1,L2 --rounds=2 --warm=120 --frames=180
```

**两处仍需注意的测量限制（不掩饰）**：

- **`hydroDirectMs` 的语义**：由存取器在写入瞬间计时，量的是「两次累加器写入之间的间隔」，
  包含少量循环开销，**不含**同帧内后续的下游派生与 GPU 提交。不得把它当作水文总成本。
- **GPU 字节为「全部 WebGL 缓冲写入」**（拦截 `bufferSubData`/`bufferData`），
  不止植被；分项归因未做。
