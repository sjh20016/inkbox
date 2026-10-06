# 《坐天观井·B线 B0.1 口径补丁》报告

> 上游：`B0_WORLD_LAB_REPORT.md`（B0 最终报告）
> 分支：`B数值系统`（实验分支，见 `BRANCH_NOTICE.md`）
> 运行环境：Node v22.22.2 · win32 x64 · 无浏览器依赖
> 性质：**口径补丁**，不是功能轮。**不改任何平衡参数，不改任何模拟行为。**

---

## 零、一句话结论

B0.1 补了 11 处口径。它**没有**让世界变得不一样：

```
改动前 5 组配置的 world digest  ┐
                                ├──  逐字节完全相同（5/5）
改动后同 5 组配置的 world digest ┘
```

而它**确实**让仪器变得不一样了：同一个世界里，出生、觉醒、魂池逐出、
主随机流抽取次数从「不可得」变成了「可读、单调、可做后段斜率」。

**两件事必须同时成立，缺一不可。**
只有「指纹不变」而没有「计数器非零」，证明是空的——计数器根本没接上也会指纹不变。
只有「计数器非零」而没有「指纹不变」，证明是危险的——计数器接上了但顺手搅乱了世界线。

---

## 一、11 项动作的落地情况

| # | 动作 | 落地 | 证据 |
| --- | --- | --- | --- |
| 1 | 人口口径：civil / wild 分离 | ✅ | 新列 `popCivil`；恒等式 `popTotal = popCivil + popWild` 逐行断言 |
| 2 | 修士占比：`cultivatorShareCivil` | ✅ | 新列；分母只含人（兽 / 灵不进分母），断言「≤ 含野生的那个口径」 |
| 3 | 平台诊断：entity 与 civil 分离 | ✅ | `population_plateau` → `entity_plateau` + `civil_plateau`；两条合成快照断言证明两者可给出相反结论 |
| 4 | 粮食：empty village share / affected population | ✅ | 新列 `foodEmptyShare` / `foodEmptyPopulation`（快照与探针都有） |
| 5 | 粮食诊断：`granary_empty` 降级为观测事实 | ✅ | severity `warning` → `info`；evidence 新增 `notClaimed` 显式声明不断言 famine |
| 6 | telemetry：births / awakens / soul evictions | ✅ | 新模块 `src/inkbox/sim/telemetry.js`（WeakMap）；新列 `popBirthsCum` / `popAwakensCum` / `soulPoolEvictedCum` |
| 7 | RNG：主随机流 draw count | ✅ | `world-factory` 的 `lifeRng` 改为计数闭包；新列 `lifeRngDrawsCum` |
| 8 | years：要求整数 | ✅ | `validateJob` 收紧为**正整数**；`runner.mjs` 删除 `Math.round` 兜底 |
| 9 | provenance：云环境 sourceRevision | ✅ | `sourceRevision()`：git 优先，退回 CI 环境变量，**并记录来源** |
| 10 | cloud：single-seed worker / aggregation contract | ✅ | `worker` 字段 + `--worker=true` / `--aggregate`；**聚合产物 ≡ 单进程产物（逐 byte）** |
| 11 | branch：B0 成果以干净提交回收 | ✅ | `BRANCH_NOTICE.md` 新增「回收口径」节 |

---

## 二、不扰动证明（B0.1 的核心证据）

### 2.1 方法

改动**之前**先钉住 5 组配置的世界指纹（`_b01_before.json`），
改动**之后**用完全相同的 5 组配置重跑（`_b01_digest_probe.mjs`），逐字比对。

5 组配置刻意覆盖了三条插桩路径，而不是随便挑几个 seed：

| case | 配置 | 覆盖的路径 |
| --- | --- | --- |
| A | `natural` / small / seed 31337 / 40 年 | 基础路径 |
| B | `natural` / small / seed 20260914 / 25 年 | 基础路径（换 seed） |
| C | `natural` / medium / seed 7 / 60 年 | **魂池逐出路径**（魂池顶到 120） |
| D | `legacy-longrun` / medium / seed 4242 / 22 年 | **开缝夹具路径**（上界 / 幽冥缝真的开过） |
| E | `natural` / medium / seed 424242 / 80 年 | **魂池逐出路径**（更长的饱和期） |

### 2.2 结果

| case | 改动前 digest | 改动后 digest | 结果 |
| --- | --- | --- | --- |
| A | `5bb2f381ac60b70c…` | `5bb2f381ac60b70c…` | ★ 逐字相同 |
| B | `5c9872770837e20a…` | `5c9872770837e20a…` | ★ 逐字相同 |
| C | `1c65932f3134dad9…` | `1c65932f3134dad9…` | ★ 逐字相同 |
| D | `133409963971c9c7…` | `133409963971c9c7…` | ★ 逐字相同 |
| E | `1c5bb9ab2f069e18…` | `1c5bb9ab2f069e18…` | ★ 逐字相同 |

序列化字节数也逐字相同：2964393 / 2094549 / 6126773 / 3327744 / 8542353。

### 2.3 同一批世界的计数器读数（条件 ②）

| case | 实体 | 魂池 | **逐出** | **出生** | **觉醒** | **主随机流抽取** |
| --- | --- | --- | --- | --- | --- | --- |
| A | 696 | 69 | 0 | 1479 | 346 | 15,383,210 |
| B | 582 | 5 | 0 | 879 | 193 | 7,877,573 |
| C | 1400 | **120** | **94** | 3580 | 871 | 40,573,045 |
| D | 512 | 7 | 0 | 865 | 186 | 7,994,874 |
| E | 1400 | **120** | **674** | 6239 | 1473 | 68,289,968 |

⚠️ **请特别注意「魂池」与「逐出」两列的对齐关系**：

逐出计数器**只在 C 与 E 两个世界里非零**，而那两个世界的魂池读数**正好是 120**
——也就是 `reincarnation.js` 的 `SOUL_CAP`。

这不是巧合，这是**这份补丁最想要的那种自证**：
计数器不是「有个非零的数」，而是**恰好在该触发的那个机制上触发**。
另外三个世界的魂池分别停在 69 / 5 / 7，逐出数全为 0，与「池子没满过」一致。

换句话说：**B0 时代无法区分的那两件事，现在分开了。**
（B0 的审计原话：「池子从没满过」与「池子一直在满、一直在丢魂」
在 `soulPool` 这一个读数上**同形**。）

---

## 三、改动文件清单

### 3.1 新增

| 文件 | 职责 |
| --- | --- |
| `src/inkbox/sim/telemetry.js` | 观测计数器。**WeakMap 挂在 world 之外** ⇒ 不进存档、不改世界键集、结构上不可能改指纹。唯一写入口 `bumpTelemetry`（未知键当场抛错）；采集器只准用只读的 `readTelemetry`（无记录时返回零值副本，**不创建**）。 |

### 3.2 修改 · 模拟侧插桩（**最小侵入**，全部是「多记一笔」）

| 文件 | 改动 |
| --- | --- |
| `src/inkbox/sim/life.js` | `spawn()` 成功处 `bumpTelemetry(world, 'births')`；`initEntity` 传入 `world` |
| `src/inkbox/sim/cultivation.js` | `initEntity` / `awaken` 接受 `{ world }`；`awaken` 返回 true 处 bump `awakens` |
| `src/inkbox/sim/reincarnation.js` | 池满 `splice` 处 bump `soulEvictions` |
| `src/inkbox/sim/divine.js` | 调用 `awaken(e, rng, { world })` |
| `src/inkbox/sim/possession.js` | 调用 `awaken(target, …, { world })` |

⚠️ 这五处**只做 `+= 1`**：不抽签、不读签、不修改任何被模拟逻辑读取的状态。
这正是 §二 那张「指纹逐字相同」表的来源。

### 3.3 修改 · 实验工具

| 文件 | 改动 |
| --- | --- |
| `collectors.mjs` | `COLLECTOR_VERSION` `1.0.0` → `1.1.0`；快照 +9 列 / 探针 +3 列（**一律追加在末尾**）；`foodDistribution` 补空仓数与受影响人口；`telemetryReport()` 从「三项不可得」改写为「已可得」 |
| `diagnostics.mjs` | 平台检测抽成通用 `detectPlateau`，导出两个码 `entity_plateau` / `civil_plateau`；`granary_empty` 降为 `info` 并补规模证据；`stalled_flow` 纳入四个新账本 |
| `job-schema.mjs` | `JOB_SCHEMA_VERSION` `1` → `2`；`years` 收紧为**正整数**；新增 `worker` 字段（要求 `seeds.length === 1`） |
| `runner.mjs` | **删除 `Math.round(config.years)` 兜底**，改为防御性检查（非法值直接抛错） |
| `report.mjs` | 新增 `sourceRevision()` / `manifestExtras()`；`buildManifest` 记 `sourceRevision` + 来源；`createReporter` 支持 worker 模式（**结构上不碰顶层**）；新增 `aggregate()` |
| `world-factory.mjs` | `lifeRng` 包成计数闭包；暴露 `lifeRngDraws` getter |
| `stats.mjs` | 注释同步（`population_plateau` → 两个新码） |
| `inkbox-experiment.mjs` | 新增 `--worker` / `--aggregate`；usage 与退出码说明更新 |
| `inkbox-experiment-selftest.mjs` | **46 → 67 项**（+21 项，全部围绕 B0.1 的新口径） |

### 3.4 修改 · Job 与文档

| 文件 | 改动 |
| --- | --- |
| `experiments/jobs/*.json`（5 个） | `schemaVersion` `1` → `2` |
| `docs/WORLD_LAB.md` | 新增/改写：云实验 worker+聚合、`schemaVersion` 版本历史、溯源字段、诊断拆分与降级、遥测账本、主随机流 draw 计数、B0.1 新增列 |
| `BRANCH_NOTICE.md` | 新增「回收口径」节（成果以干净提交回去，不合并整支） |

---

## 四、验收

```
npm run test:experiment   →  67/67 项通过
npm test（test:core）      →  import 121 文件 / 378 边全通过，core / startup / runtime-events 全通过
npm run test:d7           →  见下
```

新增的 21 项自检（全部为 B0.1 而写，每条都对应上表的一个动作）：

**口径（§1/§2/§4/§6/§7）**
- B0.1 新列全部存在，且**都在列清单末尾**
- 人口口径恒等式逐行成立
- `cultivatorShareCivil` 分母只含人，且 ≤ 含野生的口径
- `foodEmptyShare` 分母是聚落数；无聚落时为 `null` 而不是 0
- 受影响人口不超过世界总人口
- 遥测账本单调不减，且**真的被数到了**（非零）
- telemetry 模块：累加正确 / 未知键抛错 / `read` 返回副本且不创建记录
- ★ 遥测计数器不进世界状态：bump 后 digest 逐字不变
- ★ 主随机流 draw 计数不进世界状态

**诊断（§3/§5）**
- `popTotal` 平台 + `popCivil` 下跌 ⇒ 只报 `entity_plateau`
- `popTotal` 上涨 + `popCivil` 平台 ⇒ 只报 `civil_plateau`
- `granary_empty` 已降级为 `info`，带规模证据，显式声明不断言饥荒
- 停滞流检测纳入了新账本

**契约（§8/§9）**
- `years` 小数被拒绝（含 CLI 字符串形式）
- `worker` 必须恰好一个 seed，且必须是布尔
- `runner` 无 `Math.round` 兜底
- `sourceRevision` 的 revision 与 source 同生同灭
- `manifest` 记录 `sourceRevision` 与来源

**云（§10）**
- worker 模式**一个字节都不碰顶层**（`readdirSync` 结果必须只有 `['seeds']`）
- ★ 聚合产物与单进程产物**逐 byte 相同**（5 个核心文件逐个比）
- 聚合顺序由 Job 决定，不由文件系统决定

---

## 五、B0.1 仍然没做的事（诚实记录）

- ❌ 没有改任何平衡参数、保险丝、灵气规则、三界上限；
- ❌ 没有改任何模拟行为（§二 是证据）；
- ❌ 没有为「修士 vs 凡人」分别记出生 / 死亡 —— 现有计数器不区分物种。
  它不影响 `civil_plateau` 的判读（那个用 `popCivil` 绝对水平 + births 斜率），
  但「修士的出生率 vs 凡人的出生率」这种问题**还答不了**；
- ❌ 没有把 World Health 加进 CI 硬性 pass/fail（委托书 §18 仍然成立）；
- ❌ 没有以任何单个 seed 的结果宣布平衡。

---

## 六、下一步

B0.1 的定位是**让 1000 seed 的云实验不建立在略歪的口径上**。
它完成后，以下三件事才第一次**可问**：

1. **人口平台到底是贴顶还是卡死？** —— 用 `popBirthsCum` 的后段斜率区分
   （贴顶时 births 仍涨、死亡也涨；卡死时 births 后段停止增长）；
2. **凡间社会停了吗，还是只是被兽群掩盖了？** —— 两个平台码对照读；
3. **一批数据是哪版代码跑的？** —— `sourceRevision`，云容器里也答得出。

真正该做什么，要等 1000 seed 跑完、看完分布再说。
**B0.1 不做任何结论。**
