# 《坐天观井·B线 B0 世界实验室》最终报告

> 委托书：`《坐天观井·B线 B0 世界实验室开发委托书 v1.0》.md`
> 落地仓库：`E:/world4/坐天观井Bpart数值系统`（由 `坐天观井-实验分支D1` 复制源码后新建的独立仓库）
> 运行环境：Node v22.22.2 · win32 x64 · 无浏览器依赖
> 报告口径：**只描述现象，不调参**（委托书 §22.4）

---

## 一、改动文件清单（每个文件一句职责）

### 1.1 新增 · 实验核心模块 `scripts/experiment/`

| 文件 | 职责 |
| --- | --- |
| `stats.mjs` | 通用**纯**统计函数（mean/median/percentile/gini/HHI/entropy/slope/CV…）。无法定义的结果一律返回 `null`，绝不返回 NaN/Infinity。 |
| `digest.mjs` | 世界指纹。复用存档序列化 `serializeWorld()`，产出 `sha256`（scheme = `serializeWorld/sha256/v1`），**不重造序列化**。 |
| `profiles.mjs` | 两个 profile（`natural` / `legacy-longrun`）的语义定义与旧长测夹具常量；`afterYear` 钩子在此注入开缝动作。 |
| `job-schema.mjs` | Job 校验器。非法输入**明确报错、不静默 fallback**；profile ⟹ viewPolicy 硬绑定。 |
| `world-factory.mjs` | 造世界。复刻 `main.js` 的三界装配与随机流派生方式，**不负责跑实验**。 |
| `collectors.mjs` | 只读采样。两套列清单（snapshot / probe），只 import 只读 stats 入口，**不 import `advance.js` / `life.js`**。 |
| `runner.mjs` | 推进循环。唯一改变世界的一行是 `advanceWorld(world, chunk, deps)`；采样游标「到达或越过即采」。 |
| `diagnostics.mjs` | 自动诊断。全部 `info` / `warning`，唯一 `critical` 是守恒式失效；**不抛异常、不让进程失败**。 |
| `report.mjs` | 输出层。`manifest` / `summary` / `timeseries.csv` / `probes.csv` / `diagnostics.json` / `runtime.json` 的生成与落盘；含防覆盖与逐 seed 落盘。 |

### 1.2 新增 · 入口与自检

| 文件 | 职责 |
| --- | --- |
| `scripts/inkbox-experiment.mjs` | CLI 入口。参数白名单校验、退出码语义、逐 seed 进度、`--overwrite` / `--quiet` / `--failFast`。 |
| `scripts/inkbox-experiment-selftest.mjs` | 46 项自检（统计单测 / Job 校验 / 指纹 / collector purity / 确定性 / 产物形状 / 单 seed 失败不毁整批）。 |

### 1.3 新增 · Job 与文档

| 文件 | 职责 |
| --- | --- |
| `experiments/jobs/smoke-natural.json` | 冒烟：1 seed / 10 年。 |
| `experiments/jobs/short-natural.json` | 短跑：1 seed / 30 年。 |
| `experiments/jobs/baseline-natural.json` | 基线：3 seeds（20260914 / 7 / 424242）/ 300 年。 |
| `experiments/jobs/baseline-legacy-longrun.json` | 旧长测对照：1 seed / 300 年，复刻夹具。 |
| `experiments/jobs/deep-natural-500y.json` | 深跑：3 seeds / 500 年（按 §21 延后执行，文件常备）。 |
| `experiments/jobs/README.md` | Job 目录说明。 |
| `docs/WORLD_LAB.md` | 世界实验室的完整使用文档（十四节）。 |

### 1.4 修改（最小侵入）

| 文件 | 改动 |
| --- | --- |
| `package.json` | 新增三个脚本：`inkbox:experiment` / `inkbox:health` / `test:experiment`。**未并入 `npm test`**（§18）。 |
| `README.md` | 「检查与测试」段末追加「World Laboratory（数值研究，不是测试）」小节。 |

> **gameplay diff = 0**：`src/` 与参考工程 `坐天观井-实验分支D1/src` 经 `diff -r` 校验**无任何差异**。所有改动都落在 `scripts/experiment/`、`scripts/inkbox-experiment*.mjs`、`experiments/`、`docs/`、以及 `package.json` / `README.md` 的**增量**位置。

---

## 二、架构说明

五层职责，单向依赖，越往下越"纯"：

```text
World Factory ──► Runner ──► Collector ──► Reporter
                    │                          ▲
                    └──────────► Diagnostics ──┘
```

| 层 | 做什么 | 不做什么 | 关键约束 |
| --- | --- | --- | --- |
| **World Factory** | 按 `{seed, preset, profile}` 装配凡间 + 上界 + 幽冥，派生四条随机流，产出 `lab` 句柄 | 不跑实验、不采样 | 随机流的**派生方式**必须与 `main.js` 逐字一致（异或自逆的坑） |
| **Runner** | 推进循环：`advanceWorld(world, chunk, deps)`；维护采样游标；调 `profile.afterYear` | 不定义世界规则、不算统计 | 唯一推进入口，**不绕开 `advanceWorld()`** |
| **Collector** | 从只读 stats API 取数，映射成稳定列 | 不改变世界、不消费随机流 | 只 import 只读入口；开关采集**不改 digest** |
| **Diagnostics** | 从序列里找"值得人读"的现象，产出结构化观察 | 不判定好坏、不让进程失败 | 唯一 `critical` 是守恒式失效 |
| **Reporter** | 生成机器可读产物 + 逐 seed 落盘 + 防覆盖 | 不参与模拟 | 核心产物**不含时间戳**，时间戳隔离进 `runtime.json` |

**为什么这样切？** 因为「以后每改一项，都要能知道世界发生了什么」这件事，要求**变量可控、观测可复现**。把"造世界 / 推世界 / 看世界 / 判世界 / 存世界"拆开，任何一层都能被单独替换或对照——例如 `paired control` 只需要换一个 profile，`runner.mjs` 一行都不用改。

---

## 三、确定性证明

确定性有三条独立的证据链，全部通过。

### 3.1 证据链一 · collector purity（§15）

**命题：开关采集，世界线逐字不变。**

做法：同一 `{seed, preset, profile}`，分别以 `collect=true` / `collect=false` 跑，比对 `worldDigest`。

| profile | 预设 / 年数 | digest(collect=on) | digest(collect=off) | 结果 |
| --- | --- | --- | --- | --- |
| `natural` | small / 12 年 | 相同 | 相同 | ✅ 逐字相同 |
| `legacy-longrun` | medium / 22 年 | 相同 | 相同 | ✅ 逐字相同 |

这条链证明：**采集器是纯观察者**——它读只读 stats API，不消费任何随机流、不写任何状态字段。

### 3.2 证据链二 · 端到端逐 byte（§14）

**命题：同配置重复运行，核心产物可逐 byte 比对。**

做法：同一份 Job（`--profile=natural --preset=small --seeds=20260914 --years=12 --step=3 --experiment=det-a`）跑两次，第二次用 `--overwrite` 覆盖同名目录，与备份逐 byte `diff`。

| 产物 | 结果 |
| --- | --- |
| `manifest.json` | ✅ IDENTICAL |
| `summary.json` | ✅ IDENTICAL |
| `timeseries.csv` | ✅ IDENTICAL |
| `probes.csv` | ✅ IDENTICAL |
| `diagnostics.json` | ✅ IDENTICAL |
| `seeds/<seed>/{timeseries,probes,summary,diagnostics,fingerprint}` | ✅ 全部 IDENTICAL |
| `runtime.json` | ⚠️ 允许不同（含墙钟时间 / 主机名 / 内存），且自标 `"deterministic": false` |

> 顺带发现并确认了一件事：把 `--experiment` 从 `det-a` 改成 `det-b` 后，只有 `manifest.json` / `summary.json` 第 3 行的 `experiment` 字段不同——**其余逐 byte 相同**。这说明「差异来自用户提供的配置项，不是来自不确定性」。

### 3.3 证据链三 · 自检固化（§11 / §7 / §14）

`node scripts/inkbox-experiment-selftest.mjs` → **46/46 通过**，其中 §14 段包含：

- 同配置跑两次 ⇒ `timeseries.csv` 逐 byte 相同；
- 同配置跑两次 ⇒ 快照逐字段一致（含浮点）；
- `stepDays` 不同 ⇒ 世界线不同（证明它**确实是**确定性键之一，不是被忽略的参数）；
- `diagnostics` 两次一致。

### 3.4 稳定性说明 · commit 的诚实处理

本仓库**不是 git 仓库**（`git rev-parse HEAD` 失败）。按 §8「取不到写 `null`，不猜」，`manifest.json` 里：

```json
"commit": null,
"commitSource": "git rev-parse HEAD",
"commitAvailable": false
```

同时，`configSignature`（防覆盖用的配置指纹）**刻意不含 commit**——否则「修完 bug 想用同一份 Job 重跑」会被自己的防覆盖检查拦下。

---

## 四、baseline 结果（只描述现象）

> 环境：`medium` 预设（288×180）· `stepDays=3` · snapshot 每年 · probe 每 30 日。
> 命令：`node scripts/inkbox-experiment.mjs --job=experiments/jobs/baseline-natural.json`

### 4.1 三 seed 自然基线（natural / closed）

| 指标（末值） | seed 20260914 | seed 7 | seed 424242 |
| --- | --- | --- | --- |
| world digest（前 12 位） | `4c33734836f1` | `c409da8748d9` | `b9af28d3affe` |
| `popTotal` | 1400 | 1400 | 1400 |
| `popTotal`（全程均值） | 1289.28 | 1268.50 | 1288.77 |
| `popCultivatorShare`（末值） | 0.546 | 0.613 | 0.523 |
| `villageCount` | 75 | 64 | 69 |
| `sectCount` | 10 | 10 | 10 |
| `leylineControlled` | 6 | 3 | 6 |
| `leylineTopOwnerShare` | 0.667 | 1.000 | 0.667 |
| `foodP10` | 400 | 399.958 | 400 |
| `soulPool` | 120 | 120 | 120 |
| `soulCumulativeCreated` | 5250 | 4063 | 5299 |
| `popDeathsCum` | 22811 | — | — |
| `riftCrossedCum` | 0 | 0 | 0 |

**可记录的现象（不调参）：**

1. **人口长期贴顶。** 三 seed 末值**全部 1400**，且 `population_plateau` 诊断给出平台起点：
   - seed 20260914：第 **44** 年起就是 1400，之后 **256** 年没动过（后段相对变化 ≈ 0，CV ≈ 2.7e-4）；
   - seed 424242：第 **43** 年起（后 257 年，CV ≈ 5.9e-4）；
   - seed 7：第 **50** 年起（后 250 年，CV ≈ 3.2e-4）。
2. **粮食长期高位。** 后段最穷一成聚落的粮仓 `foodP10` 贴着**本次观测到的上限 400**（ratio ≈ 1.000）⇒ `food_high_floor`。
3. **宗门资源持续单调上涨。** 后段 `sectSpiritStoneTotal` 只增不减：seed 20260914 从 32966.7 → 52716.4（+19749.7）；seed 424242 从 32285.9 → 47666.9（+15381.0）。`sectProvisionsTotal` 同样（+7451.2 / +4065.2）⇒ `monotonic_resource`（hint `possible_missing_sink`）。
4. **灵脉高度集中。** `leylineTopOwnerShare` 后段均值：seed 7 = **1.000**（一宗独占全部有主灵脉），另两 seed ≈ 0.667。
5. **探针层抓到年度快照看不见的短时粮荒。** `granary_empty`：
   - seed 7：3601 次探针中有 **2222** 次观测到有聚落粮仓见底，首次第 **114** 年；
   - seed 424242：**2338**/3601，首次第 **105** 年。
   > 这正是「两层采样」存在的理由：年度快照上 `foodP10` 稳定在 ~400，而 30 日粒度的探针看见了一闪而过的粮荒。
6. **魂池长期贴顶。** 三 seed 末值 `soulPool` 全部 = **120**（= `SOUL_CAP`）。
7. **跨界流水恒为 0。** `riftCrossedCum = 0`（`natural + closed` 下**预期**，见 §5.4）。
8. **三 seed 的 world digest 互不相同** ⇒ 世界线确实是路径依赖的，不是同一个世界换了标签。

### 4.2 legacy vs natural 对照（同 seed 20260914 / 300 年）

| 指标 | natural | legacy-longrun | 变化 |
| --- | --- | --- | --- |
| world digest | `4c33734836f1` | `6fa93251ada4` | 不同（预期） |
| `popTotal`（末值） | 1400 | 1400 | 持平（都贴顶） |
| `upperPopulation`（末值） | 34 | **101** | ≈ 3.0× |
| `upperPopulation`（均值） | 22.73 | 37.59 | ≈ 1.65× |
| `upperArrivedCum` | 57 | 98 | +72% |
| `upperThunderCum` | 23 | 47 | ≈ 2.0× |
| `ascendedTotal` | 57 | 91 | +60% |
| `riftOpenedCum` | 0 | 63 | 从无到有 |
| `riftLeakedCum` | 0 | 10 | 从无到有 |
| `riftCrossedCum` | 0 | 7 | 从无到有 |
| `riftActive`（末值 / 均值） | 0 / 0 | 27 / 22.67 | 从无到有 |
| `netherClimbedOutCum` | 0 | 20 | 从无到有 |
| `wraithAlive`（均值） | 0 | 0.199 | 从无到有 |
| `netherGhosts`（末值） | 207 | 207 | 持平 |
| `soulPool`（末值） | 120 | 120 | 持平（都贴顶） |
| `foodMin`（末值 / 均值） | 6.347 / 95.40 | **0.000** / 5.56 | legacy 更低 |
| `popDeathsCum` | 22811 | 21213 | -7% |

**可记录的现象（不调参）：**

- **夹具的三项注入（补人口 / 定时开缝 / 视界占空比）确实改变了世界**：上界人口约 3 倍、跨界四支（跌入 / 爬出 / 漏物 / 夺舍）全部从 0 变为非 0。这证明 legacy profile 的夹具**真的在工作**，不是摆设。
- **但"总量级"指标并没有被夹具改写**：`popTotal` 两者都贴顶 1400，`netherGhosts` 末值都是 207，`soulPool` 都贴 `SOUL_CAP`。也就是说，夹具影响的是**跨界流量**，而不是**凡间总量**——这是两条世界线之间一个值得记下的结构性差异。

### 4.3 性能（§17，进 `runtime.json`）

| 实验 | 模拟年 | 墙钟 | 速率 | 峰值 RSS | 完成 |
| --- | --- | --- | --- | --- | --- |
| smoke-natural | 10 | 1.9s | 5.28 y/s | 122.6 MB | 1/1 |
| short-natural | 30 | 12.0s | 2.49 y/s | 154.6 MB | 1/1 |
| baseline-natural | 900 | 1108.6s | 0.81 y/s | 236.0 MB | 3/3 |
| baseline-legacy-longrun | 300 | 452.4s | 0.66 y/s | 226.7 MB | 1/1 |

> `medium` 预设实测 ≈ **0.7–0.9 模拟年 / 秒**；`small` 预设 ≈ **5–6 模拟年 / 秒**。
> `deep-natural-500y`（3 seeds × 500 年）按 §21 明示「不要因为一次长跑花很久而阻塞代码验收」**延后执行**，Job 文件常备可随时跑。

---

## 五、已发现问题（严格分类）

### 5.1 correctness bug

| # | 位置 | 描述 | 状态 |
| --- | --- | --- | --- |
| 1 | **实验工具自身** `diagnostics.mjs` | `population_plateau` 的**判据窗口选错**导致**结构性漏报**：最初拿**整段**算漂移与变异系数，一个「前 50 年从 0 涨到 1400、之后 250 年一动不动」的世界，整段漂移被成长期稀释到 +8.6%（> 1% 阈值）、整段 CV 也被拉高 ⇒ 两条判据都不满足，诊断**不触发**。 | ✅ 已修：改为只看**后段**（`final_third`），并新增 `plateauFromYear` / `plateauYears`。修复后三 seed 全部正确触发（见 §4.1）。 |
| 2 | **游戏本体** | `netherConserved` / `netherItemsConserved` 在全部基线运行中**无一次** `false` ⇒ 无 `conservation_violation`。 | ✅ 未发现 correctness bug。 |

> ⚠️ 说明：#1 是 **B0 工具自身的 bug**，不是游戏 bug。它值得单列，因为它正好印证了本项目的一条老教训——**一个计数放在任何闸门之后，量到的就是那道闸门，不是现象本身**（`World.js` 已记过同款）。判据窗口选错，量到的就不是现象。

### 5.2 health concern（现象，需 B1 判定，**B0 不动**）

| # | 现象 | 观测依据 | 可能方向（仅供 B1 参考，本轮不实施） |
| --- | --- | --- | --- |
| 1 | 人口长期贴顶 | 三 seed 末值全 1400，平台起点在第 43–50 年 | 人口承载压力重构 |
| 2 | 粮食长期高位 | `foodP10` 后段贴观测上限 400 | 粮食腐败 / 储藏成本 |
| 3 | 宗门资源后段单调上涨 | `spiritStone` / `provisions` 只增不减 | 宗门财政 sink |
| 4 | 灵脉高度集中 | `topOwnerShare` 0.667 ~ 1.000 | 霸权控制成本 |
| 5 | 短时粮仓见底 | 探针层 2222 / 2338 次命中 | 粮食缓冲 / 迁徙模型 |
| 6 | 魂池长期贴顶 | `soulPool` = `SOUL_CAP` = 120 | 魂池逐出机制（同时是 telemetry gap，见 §5.3） |

> 诊断的职责是**指出现象**，不是**判定好坏**。「人口贴顶」可能正是 `POP_SOFT_CAP` 的设计意图；「一宗独霸灵脉」是自然霸权还是结构锁死，**需要 paired control 才能判**。**B0 只记录。**

### 5.3 telemetry gap（观测能力缺口）

| # | 缺口 | 原因 | 后果 | 处置 |
| --- | --- | --- | --- | --- |
| 1 | 凡间**出生**累计数不可得 | `life.js` 只往 `world.entities` push，全仓库无 `bornLog` / `birthCount` 写入点 | 「人口贴顶」与「生育链卡死」在单看 `popTotal` 时**同形** | 不通过两个 snapshot 相减冒充精确 flow（§10.A）；待 B1 补计数器 |
| 2 | **觉醒**累计数不可得 | 旧长测里的 `mortalAwakened` 是脚本逐年比对算出的**夹具**，不是模拟里的 counter | 无法区分「觉醒率低」与「觉醒根本没发生」 | 同上 |
| 3 | **魂池逐出**累计数不可得 | `reincarnation.js` 池满（`SOUL_CAP=120`）时直接 `splice` 掉一条，**没有任何计数器** | 「池子从没满过」与「池子一直在满、一直在丢魂」在 `soulPool` 一个读数上同形 | 用 `soulPool` 是否长期贴 120 **间接推断**（是推断，不是精确 flow）；待 B1 补计数器 |

> 这三项已写进 `summary.json` 的 `telemetry` 段，每项都带 `available:false` + `reason` + `policy`——**让缺口本身可见**，而不是悄悄用近似值填上。

### 5.4 experimental limitation（实验条件限制，非 bug）

| # | 限制 | 说明 |
| --- | --- | --- |
| 1 | `natural + closed` 下跨界流水恒 0 | 这是**预期实验条件**（§10.H），不是 bug。`cross_realm_flow_absent` 因此是 `info` 且带 `expected: true`。 |
| 2 | 单 seed 不足以宣布平衡 | 三 seed 的末值虽同为 1400，但 `villageCount`（75/64/69）、`leylineTopOwnerShare`（0.667/1.0/0.667）差异显著 ⇒ 世界线路径依赖。**禁止用单 seed 宣布平衡**（§2）。 |
| 3 | 性能受限 | `medium` 预设 ≈ 0.8 y/s，300 年 × 3 seeds 需 ~18 分钟。长跑必须可中断 + 逐 seed 落盘（已实现）。 |
| 4 | 深跑延后 | `deep-natural-500y` 按 §21 延后，Job 文件常备。 |

---

## 六、下一阶段建议（3~5 条）

> **不直接开始 B1/B2。** 以下只是建议，供决策。

1. **先补三个 telemetry 计数器，再做任何调参。** `births` / `awakens` / `soulPoolEviction` 的缺口会让「人口贴顶」这类核心现象**无法归因**。在补上之前，任何关于人口承载的判断都建立在推断上。这是**成本最低、收益最高**的一步。

2. **用 `paired control` 把「现象」升级成「因果」。** 架构已支持（见 `docs/WORLD_LAB.md` §13）——只需新增一个 profile，在 `afterYear` 里施加扰动，`runner.mjs` 一行都不用改。第一批值得做的对照：同一 seed 前 200 年完全相同，第 200 年注入粮食冲击 / 人口冲击，比较两条世界线。

3. **把「灵脉高度集中」当成第一个 paired control 的靶子。** 当前 `topOwnerShare` 在 0.667 ~ 1.0 之间，但**无法判断**是自然霸权还是结构锁死——这正需要一个 treatment 世界来回答。

4. **在引入任何 sink 之前，先量化"缺失 sink 的规模"。** `monotonic_resource` 已经给出了后段增长率（spiritStone +60%）。建议先用现有工具把这个量在更多 seed 上测准，再决定 sink 的强度——否则容易过度矫正。

5. **保持 `natural` profile 的"绝对纯净"，把它冻结成长期参照。** 所有未来的调参都应表现为「相对 natural 的差异」，而不是「改 natural 本身」。一旦 natural 被污染，所有历史基线就失去了可比性。

---

## 七、验收标准对照（§23 A–K）

| 项 | 要求 | 证据 | 结论 |
| --- | --- | --- | --- |
| A | 不改变正式世界规则（gameplay diff = 0） | `diff -r src` 与参考工程无差异 | ✅ |
| B | 使用真实模拟入口 `advanceWorld()` | `runner.mjs` 唯一改变世界的一行即 `advanceWorld(...)` | ✅ |
| C | headless | 无浏览器依赖；全部通过 Node 运行 | ✅ |
| D | deterministic | §3.1 / §3.2 / §3.3 三条证据链 | ✅ |
| E | collector purity | `natural` 与 `legacy-longrun` 两 profile 各自 collect on/off ⇒ digest 逐字相同 | ✅ |
| F | natural baseline 真实自然 | `natural` 不补人口、不投放资源、不开裂隙、视界恒闭（`fixtures` 全为 `null`） | ✅ |
| G | legacy profile 语义清晰 | profile 名 `legacy-longrun` + `profileSpec` 明示夹具；不统称 `longrun` | ✅ |
| H | 输出机器可读 | `manifest.json` / `summary.json` / `timeseries.csv` / `probes.csv` / `diagnostics.json` | ✅ |
| I | 单 seed 失败不毁整批数据 | `runSeedSafely` + 逐 seed 落盘 + `failure.json`；自检 §16 覆盖 | ✅ |
| J | 原有测试通过 | `npm test` ✅ · `npm run test:three-realms` ✅（全部通过）· `npm run test:experiment` 46/46 ✅ | ✅ |
| K | 不新增不必要依赖 | 仅 Node built-ins + 项目现有模块，`package.json` 无新增依赖 | ✅ |

---

## 八、跑过的实验（§21）

| 实验 | 配置 | 状态 | 产物 |
| --- | --- | --- | --- |
| Smoke | 1 seed / 10 年 | ✅ | `reports/inkbox/experiments/smoke-natural/` |
| Short | 1 seed / 30 年 | ✅ | `reports/inkbox/experiments/short-natural/` |
| Baseline | 3 seeds / 300 年 natural | ✅ | `reports/inkbox/experiments/baseline-natural/` |
| Legacy comparison | seed 20260914 / 300 年 legacy-longrun | ✅ | `reports/inkbox/experiments/baseline-legacy-longrun/` |
| Deep | 3 seeds / 500 年 | ⏸ 按 §21 延后 | Job 常备：`experiments/jobs/deep-natural-500y.json` |

---

## 九、结语

B0 交付的不是"几张图表"，而是一台**可以反复问问题的机器**：

> 以后每修改一项，我们都能够知道它究竟让世界发生了什么。

这台机器现在能：造出**逐字可复现**的世界（`natural` 绝对纯净，`legacy-longrun` 语义明确）；用**两层采样**同时看见长期趋势与短时波动；把"值得人读的现象"自动标记出来而**不冒充判决**；把观测能力的缺口**显式暴露**而不是悄悄填平；并在不重写 `runner.mjs` 的前提下，为 `paired control` / `shock scheduler` / `counterfactual run` 留好了接口。

至于它照出来的那些现象——人口贴顶、粮食过剩、资源单调、灵脉独霸——**B0 只负责让它们显形，不负责裁决**。裁决是 B1 的事。
