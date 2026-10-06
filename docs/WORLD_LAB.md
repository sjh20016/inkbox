# WORLD LAB · 世界实验室

> 这一支和另外三支测试的分工：
> `smoke` / `regression` / `longrun` 回答「**对不对**」，
> **World Lab 回答「为什么」**。
>
> 从 B0 开始，《坐天观井》里关于人口、修炼、宗门、战争、灵气、污染、三界、凡人、
> 邪修、经济的**设计争论，都要先变成一次实验**，而不是一次调参。

---

## 一、它是什么

World Laboratory 是一套**无头（headless）的数值研究工具**：它把世界跑起来、
把世界「长成什么样」按固定口径采样下来、再对采样结果做**只读诊断**。

它**不是**测试。它**没有** pass/fail。它跑完永远返回 0（除非模拟真的崩了）。

它回答的是这一类问题：

| 问题 | 靠什么回答 |
| --- | --- |
| 为什么一个世界最终变成这样？ | `timeseries.csv` 的长期序列 + `diagnostics.json` |
| 某个稳定状态是不是靠硬上限维持的？ | `entity_plateau` / `civil_plateau` 的 evidence（后段窗口的相对变化 + 变异系数 + `plateauFromYear`） |
| 「世界停住了」还是「凡间社会停住了、野兽在填空」？ | 两个平台码**分开读**：`popTotal` 与 `popCivil` 可以给出相反的结论 |
| 人口平台是**贴顶**还是**生育链断了**？ | `popBirthsCum`（B0.1 起可得）的后段斜率——贴顶时仍涨，卡死时停 |
| 某个资源是不是悬空变量？ | `monotonic_resource`（只增不减 ⇒ 可能缺 sink） |
| 同一个 seed 接受不同冲击以后会如何分叉？ | 同一 `seed`、不同 `profile` / `years` 的两份产物并排比 |
| 世界受到扰动后多久恢复？恢复以后是否留下历史痕迹？ | `probes.csv`（30 日粒度）+ 世界 digest |
| 不同 seed 是否会产生真正不同的长期结构？ | `summary.json` 的 `aggregate`（跨 seed 的 mean/median/min/max/p10/p90，**不是只给平均**） |
| 这批 1000 seed 的数据是哪一版代码跑的？ | `manifest.json` 的 `sourceRevision` + `sourceRevisionSource`（B0.1 起云环境也答得出） |

---

## 二、和现有三支测试的区别

| | smoke | regression | longrun | **experiment（本工具）** |
| --- | --- | --- | --- | --- |
| 回答 | 某个函数对不对 | 干预前后变没变 | 世界会不会**静悄悄地死掉** | 世界**为什么**是这样 |
| 输出 | 断言 | 断言 | 断言 + 人读日志 | 机器可读的 CSV / JSON |
| 结论 | pass / fail | pass / fail | pass / fail | **只有 info / warning** |
| 进 `npm test`？ | 是 | 是 | 否 | **否**（委托书 §18 明文） |
| 世界条件 | 最小 | 受控 | **玩家介入的夹具** | 可声明（见下） |

关键差别在最后一行。`inkbox-longrun.mjs` 跑出来的世界**不是自然世界**——它额外撒了
70 个人、每 20 年模拟玩家开一次视界、在固定站点开上界缝与幽冥缝。那些夹具对
liveness 检测**非常必要**（没有它们，裂缝判据永远空转），但它们不能用来回答
「没有玩家干预时世界会怎样」。World Lab 把这个区别**变成了配置**。

---

## 三、两个 profile

### `natural` —— 自然世界

> 没有玩家干预时，世界自身会如何运行。

```
generateWorld(scatter: true)
+ attach upper（含 UpperLife）
+ attach nether
+ 生态（植被 / 野火）用 mulberry32(12345) 照常跑
- 不额外补人口
- 不主动投放资源
- 不开裂隙
- 不模拟玩家操作
- riftActive 恒为 false
```

⚠️ **生态必须跑**。不跑生态会得到一个「植被冻结」的世界：食物永远紧缺、人口卡在
600、聚落 13 座——而真实游戏里人口顶到 1400、聚落 69 座。`inkbox-longrun.mjs`
把这件事记成「踩过的坑（一）」，结论是「拿一个植被冻结的世界去调人口与开宗参数，
等于照着假数据拧旋钮」。本 profile 不重犯它。

### `legacy-longrun` —— 旧长测夹具

> 尽可能逐字复刻 `scripts/inkbox-longrun.mjs` 的实验条件。

```
+ 额外 5 组 × 14 个凡人（mulberry32(4242) 选点）
+ 每 20 年开一次视界，每次 5 年（25% 占空比）
+ 上界缝：3 个 40×30 矩形站点（每次开 1 道）
+ 幽冥缝：6 个 1×1 点站点（视界开着的年份常年补开）
+ 生态同 natural
```

目的不是替代旧长测，而是保证**新实验框架可以表达旧测试世界**——
否则「新框架的结果」与「旧长测的结果」之间就没有可比性。

### ⚠️ 名字必须反映真实语义

委托书 §5 点名禁止的一件事：**不要把「额外人口但不开裂隙」也叫 `longrun`**。

本工具用「**profile 名 ⟹ 完整语义**」来兑现它：

- `natural` **只允许** `viewPolicy: "closed"`；
- `legacy-longrun` **只允许** `viewPolicy: "legacy-duty-cycle"`。

传别的组合会在**开跑之前**报错并 `exit 2`。理由：开视界**就是玩家操作**
（`main.js` 的 `riftViewOpen()` 只在玩家切到上界 / 幽冥视界时为真），
所以 `natural + legacy-duty-cycle` 既不是自然世界、也不是旧长测，
而是一个**没有名字的第三种东西**——而报告上会写着 `natural`。

想跑「世界相同、但玩家一直开着视界」？**新增一个 profile**
（`scripts/experiment/profiles.mjs`，§6 预留的 `observer` / `gardener` / `tyrant` /
`rift-heavy` 就是为此留的位置），而不是拿 `natural` 拧一个旋钮。

---

## 四、怎么跑

### 从命令行

```bash
# 委托书 §3 的目标命令
node scripts/inkbox-experiment.mjs \
  --profile=natural \
  --seeds=20260914,7,424242 \
  --years=300 \
  --step=3
```

### 从 Job 文件（云端批跑的主入口）

```bash
node scripts/inkbox-experiment.mjs --job=experiments/jobs/baseline-natural.json
```

### npm 脚本

```bash
npm run inkbox:experiment -- --profile=natural --seeds=1,2 --years=50
npm run inkbox:health                       # = --job=experiments/jobs/baseline-natural.json
npm run test:experiment                     # 工具自检（统计单测 / 采集纯净性 / 确定性 / B0.1 口径）
```

### 云实验：worker + 聚合（B0.1 §10）

1000 seed 的实验会被切成 N 个进程并行跑。**两条命令，两个阶段**：

```bash
# 阶段 1：每个 worker 跑**一个** seed，只写 seeds/<seed>/，一个字节都不碰顶层
node scripts/inkbox-experiment.mjs --job=experiments/jobs/big.json --seeds=17 --worker=true

# 阶段 2：全部 worker 跑完后，用**同一份 Job** 重建顶层产物
node scripts/inkbox-experiment.mjs --job=experiments/jobs/big.json --aggregate
```

**为什么必须这么分**（这不是性能优化，是正确性）：

- 若 N 个进程都写顶层 `summary.json` / 顶层 CSV，**后写的覆盖先写的，而且不报错**。
  你最后拿到一份「1000 seed」的报告，里面只有最后几个 seed 的数据，
  而聚合统计（均值 / 分位 / 诊断计数）全部建立在一个**静默被截断的集合**上。
- `--worker=true` 要求 `seeds` **恰好一个元素**；多给会在开跑前报错。
- worker 模式下报告器**结构上**只写 `seeds/<seed>/`——连顶层目录都不创建。
  这不是「小心一点」，是让那个数据竞争**做不到**。

**聚合契约**：`--aggregate` 用**同一份 Job**（同一 `seeds` 数组、同一顺序）重建顶层产物，
保证与「同一份 Job 单进程跑完」**逐 byte 相同**。这条是可断言的，也是聚合唯一值得
存在的理由——如果聚合结果与单进程结果不同，那它就不是「同一份实验」，而是另一次实验。

⚠️ 聚合的顺序**由 Job 定义，不由文件系统定义**。按目录名字排序是**字典序**
（`7` > `20260914`），与 `config.seeds` 的数字序不同 ⇒ CSV 行序会变 ⇒ 逐 byte 相同失效。

⚠️ `--aggregate` 与 `--worker=true` **互斥**（一个只写顶层、一个禁止碰顶层）。
同时给会在开跑前报错。

### 现成的 Job

| 文件 | 规模 | 用途 |
| --- | --- | --- |
| `smoke-natural.json` | 1 seed / 10 年 | 确认工具能跑 |
| `short-natural.json` | 1 seed / 30 年 | 确认输出结构 |
| `baseline-natural.json` | 3 seeds / 300 年 | 正式自然基线 |
| `baseline-legacy-longrun.json` | 1 seed / 300 年 | 与旧 longrun 的条件对照 |
| `deep-natural-500y.json` | 3 seeds / 500 年 | 资源允许时加深 |

### 退出码

| 码 | 含义 |
| --- | --- |
| `0` | 全部 seed 跑完 |
| `1` | 有 seed 在模拟中崩溃（**其余 seed 的结果全部保留**）；聚合模式下 = 有 seed 目录缺失或有 failure |
| `2` | 配置非法（含未知参数、未知字段、profile/viewPolicy 冲突、输出目录防覆盖拦截） |
| `3` | Job 文件读不了 / 不是合法 JSON |

### 云端兼容性

**Cloud-ready，Cloud-agnostic**：不绑定任何云厂商。

- 只需 Node.js ≥ 18（`package.json` 的 `engines` 已经这么写）；
- **零新增依赖**（只用 Node built-ins + 项目现有模块）；
- 不依赖浏览器 / Canvas / DOM / WebGL / Chrome / CDP；
- 一次进程只跑一个 Job；
- stdout 只有进度 / 种子 / 耗时 / 输出路径 / 致命错误，**绝不把 CSV 打进 stdout**；
- **每完成一个 seed 就落盘**，第 81 / 100 个 seed 崩了，前 80 个一个都不会丢；
- **多进程并行**：用 `--worker=true` + `--aggregate` 两阶段（见上）；
- **溯源**：容器里没有 `.git` 时，`sourceRevision` 退回 CI 环境变量
  （`WORLD_LAB_SOURCE_REVISION` / `GITHUB_SHA` / `CI_COMMIT_SHA` /
  `VERCEL_GIT_COMMIT_SHA` / `SOURCE_VERSION`），并**同时记录来源**。

⚠️ **云 worker 的显存 / 内存提示**：`worldDigest` 要对整个世界做一次
`JSON.stringify`，`medium` 预设跑 80 年的世界序列化后约 8.5 MB。
**多个重任务并行会撞爆 V8 堆**（实测：两个 80 年 medium 进程同时跑会
`Fatal process out of memory: Zone`）。要么串行，要么给足 `--max-old-space-size`。

---

## 五、怎么定义一次实验

Job 是一个 JSON 对象（`experiments/jobs/*.json`）：

```json
{
  "schemaVersion": 2,
  "experiment": "baseline-natural",
  "profile": "natural",
  "preset": "medium",
  "seeds": [20260914, 7, 424242],
  "years": 300,
  "stepDays": 3,
  "snapshotDays": 360,
  "probeDays": 30,
  "viewPolicy": "closed"
}
```

| 字段 | 含义 |
| --- | --- |
| `experiment` | 实验 id，**同时是输出目录名**。只允许字母 / 数字 / `.` `_` `-`，首字符必须是字母或数字 |
| `profile` | `natural` / `legacy-longrun` |
| `preset` | `small`(200×128) / `medium`(288×180) / `large`(384×240) |
| `seeds` | 非负整数数组，**不许重复**；`worker: true` 时**必须恰好一个** |
| `years` | 游戏年，**必须是正整数**（见下） |
| `stepDays` | 每次 `advanceWorld` 推进的游戏日 |
| `snapshotDays` | 快照间隔（游戏日），默认 360 = 1 年 |
| `probeDays` | 探针间隔（游戏日），默认 30 |
| `viewPolicy` | `closed` / `legacy-duty-cycle`，由 profile 钉死 |
| `collect` | （可选）`false` = 关掉全部采集，用于 collector purity 验证 |
| `outputRoot` | （可选）输出根目录 |
| `failFast` | （可选）任一 seed 崩溃即中止 |
| `worker` | （可选）`true` = 单 seed worker 模式，只写 `seeds/<seed>/` |

### `schemaVersion` 的版本历史

| 版本 | 变更 |
| --- | --- |
| `1` | 初版 |
| `2` | B0.1：`years` 从「正数」收紧为「**正整数**」；新增可选字段 `worker` |

⚠️ **`years` 为什么不再接受小数**（B0.1 §8）：旧版允许 `years: 3.7`，
而 `runner.mjs` 会 `Math.round` 成 4——**报告上写着 4，看起来完全自洽，
你永远查不出自己要的是 3.7**。这是本工具最该禁止的那类静默 fallback。
B0.1 的裁决是「要整数」而不是「真支持小数」，因为小数年在
`Math.floor(day / daysPerYear)` 的年号口径下没有定义明确的意义。

现在 `runner.mjs` 里**没有 `Math.round`**：非法值在开跑前被 `validateJob` 挡住，
运行器只做乘法，并保留一道防御性检查（防止有人绕过校验器直接调 `runSeed`）。

**非法输入一律在开跑之前报错、`exit 2`、不静默 fallback**：

- 未知字段（例如把 `stepDays` 写成 `stepdays`）→ 报错；
- 未知命令行参数（例如 `--yearz=300`）→ 报错；
- `natural` + `legacy-duty-cycle` → 报错；
- `seeds` 有重复 → 报错（重复跑同一个 seed 会覆盖前一次输出）；
- `years` 是小数或非正 → 报错；
- `worker: true` 而 `seeds` 不止一个 → 报错；
- `probeDays > snapshotDays` → 报错。

⚠️ **输出目录防覆盖**：若目标目录里已有一份**配置不同**的结果，
默认**拒绝开跑**（`exit 2`），要求你改 `--experiment=<新名字>` 或显式加 `--overwrite`。
这条拦的是一次 `--years=10` 的试跑把 300 年的正式结果整个盖掉——那种事故**没有任何痕迹**。

---

## 六、输出长什么样

```
reports/inkbox/experiments/<experiment>/
    manifest.json          # 本次实验的完整身份（§8）
    summary.json           # 跨 seed 聚合（mean/median/min/max/p10/p90）
    timeseries.csv         # 年度快照（每个 seed 每年一行）
    probes.csv             # 30 日探针（轻量指标）
    diagnostics.json       # 观察与提示（全是 info / warning）
    runtime.json           # ⚠️ 非确定性 metadata：墙钟、主机名、内存、年/秒
    seeds/<seed>/
        timeseries.csv  probes.csv  summary.json  diagnostics.json  fingerprint.json
        manifest.json      # 该 seed 自己那次的 Job 身份（worker 模式下才有）
        runtime.json       # worker 模式下才有
        failure.json       # 只有崩溃的 seed 才有
```

### 单进程 vs worker 两种产物布局

| | 单进程（默认） | `worker: true` |
| --- | --- | --- |
| 顶层文件 | ✅ 写（每完成一个 seed 重写一次） | ❌ **一个字节都不写** |
| `seeds/<seed>/` | ✅ | ✅ |
| 顶层由谁产出 | 报告器自己 | `--aggregate`（用同一份 Job） |

### 为什么产物分两层

`seeds/<seed>/` 是「跑完就冻结」的，顶层是「已完成 seed 的并集，每完成一个就重写」。
第 81 个 seed 崩溃时，前 80 个既在自己的目录里、也在顶层文件里。

而这个「每完成一个就重写顶层」的机制，正是并行 worker 会踩爆的地方：
N 个进程同时重写同一批顶层文件 ⇒ 后写的覆盖先写的、**且不报错**。
所以 worker 模式把它**关掉**，改由聚合步骤统一产出。

### `timeseries.csv` 与 `probes.csv` 为什么要分开

委托书 §9 要求采样分两层：

- **Snapshot**（默认每游戏年）—— 观察长期状态，采全部指标（含 qi 层、境界分布、灵脉分布）；
- **Probe**（默认每 30 游戏日）—— 只采轻量指标，**不序列化整个世界**。

探针存在的唯一理由：年度快照会**整年整年地跳过**短期事件。一次只持续 40 天的粮荒、
一次人口跌落又回升、一次粮仓见底、一次宗门稳定度崩到 30 又修回来——
这些在每年 1 月 1 日的快照上**完全看不见**，于是报告上会写着「粮食充裕、宗门稳定」，
而玩家那一年其实饿死过人。

两层分成两个文件（而不是一个文件加一列 `sample`），是为了让每一列都**永远有值**——
一个「探针行里全是空格」的 CSV 会让每个分析脚本都要先处理缺失值。

### 列的稳定性

列清单的唯一真相在 `scripts/experiment/collectors.mjs` 的 `SNAPSHOT_COLUMNS` /
`PROBE_COLUMNS`。它是**追加式**的：新增字段一律加在末尾，**永不改名、永不删列**。
改名会让所有历史报告与新报告看起来都正常，只是没法放在一起比——
那是最难发现的一类实验事故。

自检脚本里有一条断言钉死了这件事：**采集器产出的键集合与列清单必须严格一致**
（多一个少一个都算漂）。

---

## 七、怎么解释报告

### `manifest.json` —— 本次实验是什么

除委托书 §8 点名的字段（`schemaVersion` / `experiment` / `profile` / `preset` /
`seeds` / `years` / `stepDays` / `snapshotDays` / `probeDays` / `viewPolicy` /
`commit` / `node` / `collectorVersion`）外，额外记几样：

- `profileSpec` —— profile 的**完整语义快照**。没有它，一份三个月前的 manifest 里的
  `"profile": "natural"` 已经无法证明当时 natural 到底做了什么（fixture 是会改的）。
- `digestScheme` —— 世界指纹的算法（见下）。
- `columns` —— CSV 列清单。没有它，无法判断两份历史 CSV 能不能并排分析。
- `worker` —— 这份产物是 worker 写的还是聚合器写的（B0.1 §10）。

### 溯源：`commit` 与 `sourceRevision`（B0.1 §9）

| 字段 | 语义 |
| --- | --- |
| `commit` | **只有本机 git 仓库才有值**（`git rev-parse HEAD`）。旧报告照读，语义未变 |
| `sourceRevision` | `commit` 的**超集**：git 优先；拿不到时退回 CI 环境变量 |
| `sourceRevisionSource` | 这个值**从哪儿来**（`git rev-parse HEAD` / `env GITHUB_SHA` / …） |
| `sourceRevisionAvailable` | 是否取到 |

**为什么要有它**：云实验容器里通常没有 `.git`（CI 的 checkout 常常只拷工作树）。
于是一份在云上跑出来的 1000 seed 结果，`commit` 会是 `null`——**它无法回答
「这批数据是哪版代码跑的」**，而那正是未来最需要回答的问题。

按优先级尝试的环境变量：`WORLD_LAB_SOURCE_REVISION`（本实验自己的约定，最高）、
`GITHUB_SHA`、`CI_COMMIT_SHA`、`VERCEL_GIT_COMMIT_SHA`、`SOURCE_VERSION`。

⚠️ 但**必须同时记录来源**：不写 `sourceRevisionSource`，
「这是 git SHA」与「这是 CI 塞进来的变量」在 JSON 里长得一模一样，
而两者的可信度差得很远。两个渠道都拿不到时如实写 `null`（委托书 §8：「不要猜」）。

### `summary.json` —— 每个 seed 一份 + 跨 seed 聚合

每个指标给 **8 个读数**（`count` / `mean` / `median` / `min` / `max` / `p10` / `p90` /
`stddev`）加**首末值**，**不是只给平均值**。委托书 §13 的原话：
「不要只输出平均值。不同 seed 的差异本身就是研究对象。」

跨 seed 聚合给**两套**横截面：

- `final` —— 各 seed 的**末值**（「这些世界最后长成了什么样」）；
- `mean` —— 各 seed 的**全程均值**（「这些世界的常态是什么样」）。

两套都要：一个「末值相同但路径完全不同」的世界集合与一个「路径也相同」的集合，
在只给末值时**长得一模一样**——而前者恰恰说明世界对冲击的响应是路径依赖的。

### `diagnostics.json` —— 只是提示

```json
[
  {
    "severity": "info",
    "code": "food_high_floor",
    "seed": 20260914,
    "metric": "food.p10",
    "window": "final_third",
    "evidence": { }
  }
]
```

现有的诊断码：

| code | severity | 看什么 |
| --- | --- | --- |
| `entity_plateau` | info | **后段世界实体总数**（含兽 / 灵）几乎不变（只看序列最后 1/3，附 `plateauFromYear` / `plateauYears`） |
| `civil_plateau` | info | **后段凡间人口**（凡人 + 修士，不含兽 / 灵）几乎不变 |
| `food_high_floor` | warning | 后段最穷的一成聚落粮仓仍高于**观测上限**的一半 |
| `monotonic_resource` | warning | 宗门灵石 / 储备后段只增不减（`possible_missing_sink`） |
| `concentration` | warning | 宗门人口 HHI 或灵脉头名份额过高 |
| `stalled_flow` | info | 某条累计流水**曾经动过、后段完全不动**（含 `popBirthsCum` / `popAwakensCum` / `soulPoolEvictedCum` / `lifeRngDrawsCum`） |
| `granary_empty` | **info** | 探针观测到有聚落粮仓见底——**观测事实，不是饥荒判定**（见下） |
| `population_drop` | warning | 探针序列上的显著人口回撤 |
| `sect_stability_swing` | info | 宗门最低稳定度出现相对下探 |
| `cross_realm_flow_absent` | info | 三界跨界流水整段为 0 |
| `conservation_violation` | **critical** | 幽冥守恒式失效 |
| `profile_preset_mismatch` | info | 夹具坐标与预设不匹配（实验条件变了） |

> 历史码 `population_plateau` 已在 B0.1 拆成 `entity_plateau` + `civil_plateau`。
> 旧报告里的 `population_plateau` 仍然可读（它量的是 `popTotal`，等价于现在的
> `entity_plateau`），新报告不再产出该码。

### 为什么把「人口平台」拆成两个码（B0.1 §3）

`popTotal = popCivil + popWild`，而 `popWild`（兽 + 灵）可以**独立地**暴涨或崩溃。
于是「实体总数平稳」这一条读数会同时覆盖三种**结论相反**的情形：

| `popTotal` | `popCivil` | 真相 |
| --- | --- | --- |
| 平台 | 下跌 | 兽群补上了人的缺口——生态在换血 |
| 平台 | 上涨 | 人在挤走兽——开发 / 扩张 |
| 平台 | 平台 | 整个世界都停住了 |

合成一个码时这三种在报告上**长得一模一样**。拆开之后，`civil_plateau` 回答
「凡间社会停了吗」，`entity_plateau` 回答「这个世界停了吗」。

### 为什么 `granary_empty` 从 warning 降成 info（B0.1 §5）

**「粮仓见底」是一个关于变量的陈述；「饥荒」是一个关于人的陈述。**
从前者推到后者需要一条 B0 尚未验证的因果链。

B0 时代它是 `warning`，措辞里还带着「这正是探针层的用途」这类暗示，
读起来像是「发现了饥荒」。代价不是数字错，而是**结论错**——
读报告的人会把一次粮仓触底直接写进「B0 发现经济脆弱」的结论里，
而实际上什么都没被证明。

现在它是 `info`，evidence 里显式带 `notClaimed` 字段声明不断言 famine，
并**一并给出规模证据**：`maxEmptyVillages` / `maxEmptyShare` / `maxAffectedPopulation`。
理由：同样是「3 座村见底」，在 10 村与 90 村的世界里意义完全不同——
只看村数会把两者印成同一个数。

**诊断不抄游戏常量。** 判「粮食是否长期高位」时，上限取**本次实验观测到的**
`foodMax` 最大值，而不是 400——即便 `life.js` 的 clamp 上界改成 800，
诊断也自动跟着走，不会变成一条测错东西的假证据。判「粮仓见底」时用 **0**
（clamp 下界，由数据导出）。判「停滞」时用「曾经动过、后段不再动」的**行为**判据。

**判据窗口要选对，否则量到的不是现象本身。** `entity_plateau` / `civil_plateau` 的窗口是
**序列的最后 1/3**（`final_third`），不是整段。这一条是修过的：最初的实现拿
**整段**去算漂移与变异系数，结果一个「前 50 年从 0 涨到 1400、之后 250 年
一动不动」的世界，整段漂移被成长期稀释到 +8.6%（> 1% 阈值）、整段变异系数
也被拉高——**两条判据都不满足，诊断不触发**，而那正是最该被看见的现象。
改看后段之后，成长期被排除在窗口之外，平台本身成为唯一的观测对象。
代价是「一直在缓慢增长」的世界不会被报出来——但那本来就不是平台，不该用这个码。
这与本项目 `World.js` 记下的那条教训同款：**一个计数放在任何闸门之后，
量到的就是那道闸门，不是现象本身。**

---

## 八、为什么 health warning 不等于 bug

一条会**无理由变红**的断言，和一条**永远绿**的断言一样有害——它训练人去忽略它。

- 「人口贴顶」可能正是设计意图（有 `POP_SOFT_CAP` 这个保险丝）；
- 「粮食长期过剩」可能是下一阶段要治的病，也可能是有意的缓冲；
- 「一宗独霸灵脉」是自然霸权还是结构锁死，**需要 paired control 才能判**。

诊断的职责是**指出现象**，不是**判定好坏**。所以：

- `diagnostics.json` 里只有 `info` / `warning` / `critical` 三档，**没有 `failed`**；
- 唯一的 `critical` 是**守恒式失效**——那不是「世界不健康」，那是**账本坏了**，
  属于 correctness failure（委托书 §10.G）。它归 `npm run test:three-realms`
  与长测判据去管，World Lab **只记录，不让进程失败**；
- 实验进程的退出码只回答「实验跑完了吗」，不回答「世界对吗」。

把两件事混在一个退出码里，会让「跑完了但世界有问题」与「根本没跑起来」无法区分。

---

## 九、为什么单 seed 不足以调数值

委托书 §2 禁止事项第 12 条：**不要以单个 seed 的结果宣布「数值已经平衡」**。

三个具体理由：

1. **世界生成本身有方差。** `generateWorld` 的地形、灵脉位置、初始聚落落点全部由
   `seed` 决定。不同 seed 的「初始条件」不是同一张地图上换个人，
   而是**完全不同的地理**。一个 seed 上的「人口 1400 稳定」在另一个 seed 上
   可能是「人口 600 卡死」。
2. **路径依赖。** 同一 seed 在第 200 年挨一次粮食冲击，与不挨，会在第 500 年
   分叉到完全不同的状态。单 seed 单次运行无法区分「这个系统的性质」与
   「这一次的历史」。
3. **汇总口径的陷阱。** 只报平均值的报告会**藏掉**最重要的信息：
   如果 3 个 seed 分别是 600 / 1400 / 1400，平均值 1133 看起来「还行」，
   而真相是**三分之一的世界上限锁死**。所以 `summary.json` 的 aggregate
   给的是 mean / median / min / max / p10 / p90 全套。

正确做法：**多 seed + 两套 profile 对照 + 看分布而不是看均值**。

---

## 十、确定性与纯净性怎么保证

### 世界指纹

```
worldDigest = sha256(JSON.stringify(serializeWorld(world)))
```

⚠️ **复用项目已有的世界序列化**（`src/inkbox/io/save.js` 的 `serializeWorld`），
不另造一份字段清单。委托书 §15 明文要求：「若当前已有 digest 工具：直接复用。
不要重新发明第二套世界序列化规则。」

`serializeWorld` 是存档格式，所以它必然覆盖「读档后能不能复原」所需的**全部**状态。
手写一份 `{day, entities, villages, factions, ...}` 的清单会漏掉
`souls` / `soulLog` / `warLog` / `riftLog` / `artifactLog` / `clanLog` /
`possessionLog` / `deadLog` / `chronicle` / `clan` / `relations`——
而**漏掉的那个恰好最可能是实验框架污染的那个**。

### 三条随机流的纪律

| 流 | 派生 | 说明 |
| --- | --- | --- |
| `lifeRng` | `mulberry32(world.seed ^ 0xa5a5a5a5)` | 凡间**主随机流**。与 `main.js:563` / `inkbox-longrun.mjs:100` 逐字相同 |
| `ecoRng` | `mulberry32(12345)` | 植被 / 野火。与 `main.js:434` 的 `this.rng` 逐字相同 |
| 上界 / 幽冥 / 裂隙 / 鬼影 | 各自模块从 `seed` 派生 | 本工具**不预先派生、不代为传递**（先派生再传会**静默**退回原种子） |

实验工具**不得使用 `Math.random()`** 作为模拟随机源。全文没有它。

### 主随机流的 draw 计数（B0.1 §7）

`lifeRng` 是**唯一**「多抽一次、整条世界线就漂走且不可逆」的流。
B0.1 在 `world-factory.mjs` 里把它包成一个**计数闭包**：

```js
const baseLifeRng = mulberry32(world.seed ^ LIFE_RNG_KEY);
let lifeRngDraws = 0;
const lifeRng = function countedLifeRng() {
  lifeRngDraws += 1;
  return baseLifeRng();
};
```

于是 `lifeRngDrawsCum` 这一列回答「这个世界一共吃了多少随机数」，
而它**不进世界状态**：计数器活在闭包里，`serializeWorld` 看不见它，
所以世界指纹逐字不变（自检里有专门一条钉死这件事）。

⚠️ `lab.lifeRngDraws` 是 **getter**。采集器里解构 = 在那一刻取一次当前值；
**不能**把它存成快照再反复用——那会永远读到 0。

### 采集器纯净性（collector purity）

> **开启或关闭数据收集，不应改变世界线。**

验证方式（`npm run test:experiment` 里跑）：

```
A = 同 seed 同配置，collect = false
B = 同 seed 同配置，collect = true
assert A.worldDigest === B.worldDigest
```

⚠️ 这条判据之所以必须存在，是因为「只读」这件事**靠读代码是看不出来的**：
`netherEcoStats(nether)` 内部会调 `ensureNetherPopLog(nether)`，
而那个函数在 `popLog` 缺失时会**新建一个**。这种写不报错、不改变任何读数，
代价在几百年后表现为「两条本该相同的世界线分叉了」。

自检里这条对 `natural` 与 `legacy-longrun` **两个 profile 各跑一次**。
`legacy-longrun` 那一次尤其重要：旧长测的「玩家开缝」是**唯一**会往世界里加实体的夹具，
若采集器恰好在那条路径上抽了一次签，只有它能抓到。

### 重复运行

同一 `commit` / `seed` / `profile` / `preset` / `years` / `stepDays` / `viewPolicy`
重复执行两次，`manifest` / `summary` / `timeseries` / `diagnostics` 必须可比较。

本实现的选择是：**核心产物里不含任何墙钟时间**，所以它们可以**逐 byte 比对**。
一切非确定性 metadata 隔离在 `runtime.json`，并在文件里显式标注 `"deterministic": false`。

---

## 十一、遥测账本（B0.1 起已补齐）

委托书 §10.A：「如果代码目前没有可靠累计 counter，**不要通过两个 snapshot 相减
冒充精确 flow**。记录为 unavailable。」

B0 时代的审计结论是三项不可得。**B0.1 §6 / §7 把它们补上了**：

| 读数 | B0 | B0.1 | 来源 |
| --- | --- | --- | --- |
| `deaths cumulative` | ✅ | ✅ | `world.deadLog.total`（`necrology.js` 维护，进存档） |
| `ascensions cumulative` | ✅ | ✅ | `world.deadLog.ascended` |
| `upper arrivals` | ✅ | ✅ | `upper.popLog.{arrived, born, died, arrivedThunder}` |
| `souls created` | ✅ | ✅ | `world.nextSoulId - 1` |
| `births cumulative` | ❌ | ✅ | `telemetry.births`（`life.js` 的 `spawn` 成功处 bump） |
| `awakens cumulative` | ❌ | ✅ | `telemetry.awakens`（`cultivation.js` 的 `awaken` 返回 true 处 bump） |
| `soul pool eviction` | ❌ | ✅ | `telemetry.soulEvictions`（`reincarnation.js` 池满 splice 处 bump） |
| `lifeRng draws` | ❌ | ✅ | `world-factory` 的 `lifeRng` 计数闭包 |

### 计数器怎么做到「不改变世界线」的

这是 B0.1 最贵的一条约束。做法是把计数放在 `world` **之外**：

```
src/inkbox/sim/telemetry.js
    const REGISTRY = new WeakMap();   // world → { births, awakens, soulEvictions }
```

三个具体好处，每一个都对应一类曾经真实发生过的静默事故：

1. **不进存档**。往 `world` 上加字段而忘了序列化，读档后计数器归零 ⇒
   `save-equiv` 的「键集并集」判据当场红（`cultivation.js` 的 `heritageM` /
   `soulKind` 都因为同一件事被修过）。而**加进**序列化又会改世界指纹——
   一个纯观测计数器不该动指纹。
2. **不改世界键集**。`Object.keys(world)` / `serializeWorld(world)` 一个字节都不变
   ⇒ 世界指纹天然看不见计数器 ⇒「有计数器」与「没计数器」的两条世界线
   **结构上不可能不同**（不是「我们小心了」，是做不到不同）。
3. **不抽签、不读签**。`bumpTelemetry` 只做 `+= 1`，不碰任何 RNG，
   也不修改任何被模拟逻辑读取的状态 ⇒ 不可能挪动主随机流的相位。

**唯一的写入口是 `bumpTelemetry`**，未知键**当场抛错**——静默忽略会让
「加了一个新计数器但从来没涨过」看起来完全正常，那正是本项目最怕的那类失效。

**采集器只准用 `readTelemetry`**：它在无记录时返回一份零值副本，**绝不创建条目**。
（`telemetryFor` 是给模拟侧的惰性初始化；采集器调它会在「采集器开着」的那条线上
多写一次注册表——正是 `collectors.mjs` 头注释点名的那个坑。）

自检里有一条**结构性**证明钉死这件事：`bump` 三个计数器之后，
`worldDigest` 必须逐字不变，且 `world` 上不得出现 `telemetry` 字段。
它比「跑一遍看指纹一样」更强——前者证明的是**机制**，后者只证明了一次观测。

### 还是不可得的

`summary.json` 的 `telemetry` 段仍保留结构化字段。B0.1 之后剩下的缺口是
「**分物种**的出生 / 死亡」（现有计数器不区分凡人 / 修士 / 兽 / 灵）。
它不影响 `civil_plateau` 的判读（那个用 `popCivil` 的绝对水平 + births 斜率），
但「修士的出生率 vs 凡人的出生率」这种问题还答不了。

---

## 十二、B0 / B0.1 刻意不做的事

本阶段的原则：**只测量，不重构经济；只建立仪器，不根据一次结果调参。**

B0.1 补丁同样遵守这条：它只补口径（加列、拆诊断、补计数器、收紧契约），
**没有改任何平衡参数，也没有改任何模拟行为**。它的全部证据是
「插桩前后世界指纹逐字相同」（见 `B01_PATCH_REPORT.md`）。

- ❌ 修改人口 / 生育 / 死亡 / 粮食 / 灵气 / 宗门等核心平衡参数
- ❌ 添加新的正式经济资源
- ❌ 修改 `POP_SOFT_CAP` 等保险丝、灵气消耗规则、三界人口上限
- ❌ 为了让实验结果「更漂亮」而调整模拟
- ❌ 在实验脚本里复制游戏模拟逻辑
- ❌ 绕开 `advanceWorld()` 自己实现另一套世界推进
- ❌ 引入渲染器 / Canvas / DOM / Three.js / 浏览器依赖
- ❌ 把 World Health 指标加入 CI 硬性 pass/fail
- ❌ 以单个 seed 的结果宣布「数值已经平衡」

以下内容全部放到后续 B1 / B2：
人口承载压力重构、灵气 crowding、宗门财政 sink、粮食腐败 / 储藏成本、
凡人与修士社会关系、邪修经济、裂隙污染生态、迁徙模型、三界状态耦合、
高阶修士退出机制、霸权控制成本、玩家干预经济。

**B0 的任务不是回答这些问题。B0 的任务是：以后每修改其中一项，
我们都能够知道它究竟让世界发生了什么。**

---

## 十三、为下一阶段预留的接口

架构应能在**不重写 runner** 的情况下，未来实现：

```
paired control / treatment      # 同一 seed，前 N 年相同，之后 Treatment 世界接受冲击
shock scheduler                 # 在指定游戏日施加扰动
counterfactual run              # 反事实世界线
parameter sweep                 # 参数扫描
multi-seed batch                # 多 seed 批跑（本阶段已支持）
causal coupling matrix          # 因果耦合矩阵
cloud distributed runs          # 云端分布式
```

现在的接口已经支持前两项所需的结构：

- `profiles.mjs` 的 `beforeRun(ctx)` / `viewOpenAt(year)` / `afterYear(ctx, year)`
  是**三个明确的注入点**。一个 `shock scheduler` 只需要新增一个 profile，
  在 `afterYear` 里按年份施加扰动——`runner.mjs` **一行都不用改**。
- `runSeed(config, seed)` 是纯函数式的：同参同果，不读全局状态。
  这让「同一 seed 跑两条世界线再比对」变成两次函数调用 + 一次 digest 比较。
- Job 是纯数据。云端只需要把 Job 分片，每个进程跑一个 Job。

本轮只要求**架构支持**，不要求完整实现。

---

## 十四、B0.1 补丁：新增列与口径

B0.1 是**极小的口径补丁**，不是新功能轮。它不改任何平衡参数、不改模拟逻辑，
只把 B0 里几个「略歪的口径」摆正——以免未来 1000 seed 的云实验
建立在一堆看起来没问题、实际答错问题的读数上。

### 新增的快照列（`timeseries.csv`，一律追加在**末尾**）

| 列 | 口径 |
| --- | --- |
| `popCivil` | `popMortals + popCultivators`。凡间的「人」，**不含兽 / 灵** |
| `popCultivatorShareCivil` | 分母是 `popCivil`（只含人）。与 `popCultivatorShare`（分母 `popTotal`，含兽 / 灵）**两个都要** |
| `foodEmptyCount` | 粮仓见底的聚落**数** |
| `foodEmptyShare` | `foodEmptyCount / villageCount`；无聚落时 `null`（不是 0） |
| `foodEmptyPopulation` | 粮仓见底那些聚落的 **pop 之和** |
| `popBirthsCum` | 累计出生（B0.1 §6） |
| `popAwakensCum` | 累计觉醒（B0.1 §6） |
| `soulPoolEvictedCum` | 累计魂池逐出（B0.1 §6） |
| `lifeRngDrawsCum` | 主随机流累计抽取次数（B0.1 §7） |

### 新增的探针列（`probes.csv`）

`popCivil` / `foodEmptyShare` / `foodEmptyPopulation`。

探针层才是「短时饥荒」唯一看得见的地方，所以粮食的两个新口径**必须**在这里也有一份。

### 两条恒等式（在 CSV 上可核对）

```
popCivil === popMortals + popCultivators
popTotal === popCivil + popWild
```

自检逐行断言这两条。加它们的原因：`world.cultivationStats()` 的 `mortals` /
`cultivators` 把 `beast` / `spirit` **排除在外**，所以若只印那几列，
读报告的人会看到一个对不上的加法（例：`total 80` 而 `48 + 2 = 50`），
然后合理地怀疑是采集器漏数了人。多一列，少一场无谓的排查。

### 为什么新列都堆在最末尾

`SNAPSHOT_COLUMNS` / `PROBE_COLUMNS` 是**追加式**的：新增字段一律加在末尾，
**永不改名、永不删列**。

⚠️ 这不是排版偏好。把新列插进中间会让「**旧 CSV 是新 CSV 的前缀子集**」这件事失效，
而**旧报告与新报告仍然看起来都正常**——那是最难发现的一类实验事故。
代价是人口 / 粮食的恒等式在 CSV 上隔得远了，所以 `collectors.mjs` 里逐条注明了配对方程，
自检里也有一条断言钉死「B0.1 的列必须落在末尾」。

---

## 十五、本阶段跑过的实验

见 `reports/inkbox/experiments/` 下各实验目录，以及仓库根目录的
`B0_WORLD_LAB_REPORT.md`（B0 最终报告）与 `B01_PATCH_REPORT.md`（B0.1 补丁报告）。
