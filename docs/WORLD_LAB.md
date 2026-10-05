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
| 某个稳定状态是不是靠硬上限维持的？ | `population_plateau` 的 evidence（后段窗口的相对变化 + 变异系数 + `plateauFromYear`） |
| 某个资源是不是悬空变量？ | `monotonic_resource`（只增不减 ⇒ 可能缺 sink） |
| 同一个 seed 接受不同冲击以后会如何分叉？ | 同一 `seed`、不同 `profile` / `years` 的两份产物并排比 |
| 世界受到扰动后多久恢复？恢复以后是否留下历史痕迹？ | `probes.csv`（30 日粒度）+ 世界 digest |
| 不同 seed 是否会产生真正不同的长期结构？ | `summary.json` 的 `aggregate`（跨 seed 的 mean/median/min/max/p10/p90，**不是只给平均**） |

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
npm run test:experiment                     # 工具自检（统计单测 / 采集纯净性 / 确定性）
```

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
| `1` | 有 seed 在模拟中崩溃（**其余 seed 的结果全部保留**） |
| `2` | 配置非法（含未知参数、未知字段、profile/viewPolicy 冲突、输出目录防覆盖拦截） |
| `3` | Job 文件读不了 / 不是合法 JSON |

### 云端兼容性

**Cloud-ready，Cloud-agnostic**：不绑定任何云厂商。

- 只需 Node.js ≥ 18（`package.json` 的 `engines` 已经这么写）；
- **零新增依赖**（只用 Node built-ins + 项目现有模块）；
- 不依赖浏览器 / Canvas / DOM / WebGL / Chrome / CDP；
- 一次进程只跑一个 Job；
- stdout 只有进度 / 种子 / 耗时 / 输出路径 / 致命错误，**绝不把 CSV 打进 stdout**；
- **每完成一个 seed 就落盘**，第 81 / 100 个 seed 崩了，前 80 个一个都不会丢。

---

## 五、怎么定义一次实验

Job 是一个 JSON 对象（`experiments/jobs/*.json`）：

```json
{
  "schemaVersion": 1,
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
| `seeds` | 非负整数数组，**不许重复** |
| `years` | 游戏年 |
| `stepDays` | 每次 `advanceWorld` 推进的游戏日 |
| `snapshotDays` | 快照间隔（游戏日），默认 360 = 1 年 |
| `probeDays` | 探针间隔（游戏日），默认 30 |
| `viewPolicy` | `closed` / `legacy-duty-cycle`，由 profile 钉死 |
| `collect` | （可选）`false` = 关掉全部采集，用于 collector purity 验证 |
| `outputRoot` | （可选）输出根目录 |
| `failFast` | （可选）任一 seed 崩溃即中止 |

**非法输入一律在开跑之前报错、`exit 2`、不静默 fallback**：

- 未知字段（例如把 `stepDays` 写成 `stepdays`）→ 报错；
- 未知命令行参数（例如 `--yearz=300`）→ 报错；
- `natural` + `legacy-duty-cycle` → 报错；
- `seeds` 有重复 → 报错（重复跑同一个 seed 会覆盖前一次输出）；
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
        failure.json       # 只有崩溃的 seed 才有
```

### 为什么产物分两层

`seeds/<seed>/` 是「跑完就冻结」的，顶层是「已完成 seed 的并集，每完成一个就重写」。
第 81 个 seed 崩溃时，前 80 个既在自己的目录里、也在顶层文件里。

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
`commit` / `node` / `collectorVersion`）外，额外记三样：

- `profileSpec` —— profile 的**完整语义快照**。没有它，一份三个月前的 manifest 里的
  `"profile": "natural"` 已经无法证明当时 natural 到底做了什么（fixture 是会改的）。
- `digestScheme` —— 世界指纹的算法（见下）。
- `columns` —— CSV 列清单。没有它，无法判断两份历史 CSV 能不能并排分析。

`commit` 取自 `git rev-parse HEAD`。**取不到就写 `null`，不猜**——
写一个假的或空的字符串会让「同 commit」这个前提变成谎言，
而确定性判据正是建立在它上面。

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
| `population_plateau` | info | **后段**人口几乎不变（只看序列最后 1/3，附 `plateauFromYear` / `plateauYears`） |
| `food_high_floor` | warning | 后段最穷的一成聚落粮仓仍高于**观测上限**的一半 |
| `monotonic_resource` | warning | 宗门灵石 / 储备后段只增不减（`possible_missing_sink`） |
| `concentration` | warning | 宗门人口 HHI 或灵脉头名份额过高 |
| `stalled_flow` | info | 某条累计流水**曾经动过、后段完全不动** |
| `granary_empty` | warning | 探针观测到有聚落粮仓见底 |
| `population_drop` | warning | 探针序列上的显著人口回撤 |
| `sect_stability_swing` | info | 宗门最低稳定度出现相对下探 |
| `cross_realm_flow_absent` | info | 三界跨界流水整段为 0 |
| `conservation_violation` | **critical** | 幽冥守恒式失效 |
| `profile_preset_mismatch` | info | 夹具坐标与预设不匹配（实验条件变了） |

**诊断不抄游戏常量。** 判「粮食是否长期高位」时，上限取**本次实验观测到的**
`foodMax` 最大值，而不是 400——即便 `life.js` 的 clamp 上界改成 800，
诊断也自动跟着走，不会变成一条测错东西的假证据。判「粮仓见底」时用 **0**
（clamp 下界，由数据导出）。判「停滞」时用「曾经动过、后段不再动」的**行为**判据。

**判据窗口要选对，否则量到的不是现象本身。** `population_plateau` 的窗口是
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

## 十一、已知的遥测缺口（诚实记录，不用假数补）

委托书 §10.A：「如果代码目前没有可靠累计 counter，**不要通过两个 snapshot 相减
冒充精确 flow**。记录为 unavailable。」

审计结论：

| 读数 | 可得？ | 来源 / 原因 |
| --- | --- | --- |
| `deaths cumulative` | ✅ | `world.deadLog.total`（`necrology.js` 维护，进存档） |
| `ascensions cumulative` | ✅ | `world.deadLog.ascended` |
| `upper arrivals` | ✅ | `upper.popLog.{arrived, born, died, arrivedThunder}` |
| `souls created` | ✅ | `world.nextSoulId - 1` |
| `births cumulative` | ❌ | 凡间出生没有累计 counter：`life.js` 只往 `world.entities` 里 push，全仓库无 `bornLog` / `birthCount` 写入点 |
| `awakens cumulative` | ❌ | 觉醒没有累计 counter：`inkbox-longrun.mjs` 里的 `mortalAwakened` 是**脚本自己**逐年比对算出的测试夹具，不是模拟里的 counter |
| `soul pool eviction` | ❌ | 魂池满（`SOUL_CAP = 120`）时的逐出**不记账**：`reincarnation.js:569-575` 直接 `splice` 掉一条，没有任何计数器。于是「池子从没满过」与「池子一直在满、一直在丢魂」在 `soulPool` 这一个读数上**同形**。要精确答案需要在模拟侧补一个计数器（属 B1） |

不可得的项**不产出列**，而是作为结构化字段出现在 `summary.json` 的 `telemetry` 段。
理由：一个用 snapshot 相减冒充的假 flow 会让「每年出生 3.7 人」这种读数出现在报告上，
而它连方向都可能是错的（净变化 ≠ 出生数）。

---

## 十二、B0 刻意不做的事

本阶段的原则：**只测量，不重构经济；只建立仪器，不根据一次结果调参。**

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

## 十四、本阶段跑过的实验

见 `reports/inkbox/experiments/` 下各实验目录，以及仓库根目录的
`B0_WORLD_LAB_REPORT.md`（本轮最终报告）。
