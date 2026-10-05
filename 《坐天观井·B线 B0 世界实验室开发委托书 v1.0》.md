# 《坐天观井·B线 B0 世界实验室开发委托书 v1.0》

项目：坐天观井·Inkbox  
仓库：`sjh20016/inkbox`  
开发线：B线 / Living World  
阶段：B0 World Laboratory  
任务性质：研究基础设施、无头模拟、数值实验工具  
本阶段原则：**只测量，不重构经济；只建立仪器，不根据一次结果调参。**

---

# 一、任务背景

《坐天观井》当前已经拥有较丰富的世界对象和长期系统，包括但不限于：

- 凡人、修士、境界、寿元、觉醒；
- 聚落、粮食、建筑、村落分裂；
- 家族、血脉、人物传记；
- 宗门、掌门、长老、声望、稳定度；
- 灵脉、领土、战争；
- 上界；
- 幽冥；
- 魂池、轮回、鬼修、夺舍；
- 裂隙、鬼影及三界跨界行为；
- 法宝；
- 环境生态、植被、野火等。

同时已有：

`scripts/inkbox-longrun.mjs`

用于数百年至千年以上长时段健康检查。

并已有统一游戏日推进入口：

`src/inkbox/sim/advance.js`

其中 `advanceWorld()` 是当前真实模拟世界的统一推进入口。

本项目已经有较完整的 correctness / regression / save-equivalence / three-realms / presentation / browser 测试。

但是目前仍缺少一个独立于这些测试的：

> **数值研究与生态经济实验系统。**

现有 `inkbox-longrun.mjs` 的作用主要是发现“某系统是否静悄悄地死掉”，而 B 线需要进一步回答：

- 为什么一个世界最终变成这样？
- 哪个变量真正拥有因果权力？
- 某种稳定状态是不是靠硬上限维持？
- 某个资源究竟是不是悬空变量？
- 同一个 seed 接受不同冲击以后会如何分叉？
- 世界受到扰动后多久恢复？
- 恢复以后是否留下历史痕迹？
- 不同 seed 是否会产生真正不同的长期结构？

因此本阶段需要建立：

# World Laboratory

作为今后所有生态经济改革的公共实验基础。

---

# 二、本阶段最重要的禁止事项

本阶段禁止：

1. 修改人口、生育、死亡、粮食、灵气、宗门等核心平衡参数；
2. 添加新的正式经济资源；
3. 重写现有宗门经济；
4. 修改 `POP_SOFT_CAP` 等保险丝；
5. 修改灵气消耗规则；
6. 修改魂池、上界、幽冥人口上限；
7. 为了让实验结果“更漂亮”而调整模拟；
8. 在实验脚本中复制一份游戏模拟逻辑；
9. 绕开 `advanceWorld()` 自己实现另一套世界推进；
10. 引入渲染器、Canvas、DOM、Three.js 或浏览器依赖；
11. 将 World Health 指标直接加入 CI 硬性 pass/fail；
12. 以单个 seed 的结果宣布“数值已经平衡”。

若在开发过程中发现明确 gameplay bug：

**记录，建立 issue / report，但原则上不要在本阶段同时修复。**

除非该 bug 会直接导致实验结果无效。

---

# 三、B0 的最终目标

完成后应该能够执行：

```bash
node scripts/inkbox-experiment.mjs \
  --profile=natural \
  --seeds=20260914,7,424242 \
  --years=300 \
  --step=3
```

得到：

```text
reports/inkbox/experiments/<experiment-id>/
    manifest.json
    summary.json
    timeseries.csv
    diagnostics.json
```

并且能够通过 JSON Job 文件启动：

```bash
node scripts/inkbox-experiment.mjs \
  --job=experiments/jobs/baseline-natural.json
```

这一接口将成为未来云端批跑的主要入口。

本阶段不要绑定 AWS、Azure、Cloudflare、腾讯云或任何特定云厂商。

要求：

> **Cloud-ready，Cloud-agnostic。**

即任意能够运行 Node.js 18+ 的容器或云任务系统都能执行。

---

# 四、首先审计现有长测

开始编码之前，完整阅读：

```text
scripts/inkbox-longrun.mjs
src/inkbox/sim/advance.js
src/inkbox/sim/life.js
src/inkbox/sim/cultivation.js
src/inkbox/sim/sects.js
src/inkbox/sim/reincarnation.js
src/inkbox/sim/upperLife.js
src/inkbox/sim/netherLife.js
src/inkbox/sim/rifts.js
src/inkbox/sim/wraiths.js
src/inkbox/sim/war.js
src/inkbox/sim/family.js
src/inkbox/sim/artifacts.js
src/inkbox/sim/possession.js
src/inkbox/world/worldgen.js
src/inkbox/world/worldgenUpper.js
src/inkbox/world/worldgenNether.js
src/inkbox/core/config.js
```

重点确认：

- 当前真实游戏使用哪些随机流；
- 各世界 seed 如何派生；
- 哪些系统由 `advanceWorld()` 推进；
- 哪些系统属于真实时间而非游戏时间；
- 哪些 stats API 是纯读；
- 哪些函数会抽 RNG；
- 哪些 longrun 行为属于模拟本身；
- 哪些 longrun 行为其实属于人为测试夹具。

必须保留现有注释中已经形成的工程知识，尤其是：

> 不允许实验脚本再维护第二份游戏时钟列表。

---

# 五、首先区分两个 baseline

这是本任务的关键要求。

现有 `inkbox-longrun.mjs` 并不是纯自然世界。

它至少存在：

- 额外撒入人口；
- 模拟玩家定期开启视界；
- 主动创建上界 / 幽冥裂隙；
- 固定裂隙站点；
- 明确的视界开启占空比。

这些行为对 regression/liveness 非常有价值，但不能称为“自然世界”。

因此新的实验系统至少定义两个 profile。

## Profile A：natural

要求：

```text
generateWorld(scatter:true)
attach upper
attach nether
不额外补人口
不主动投放资源
不开裂隙
不模拟玩家操作
riftActive = false
```

它表示：

> 没有玩家干预时，世界自身会如何运行。

---

## Profile B：legacy-longrun

尽可能复刻现有：

`scripts/inkbox-longrun.mjs`

包括：

- 当前额外人口 fixture；
- 当前视界开窗策略；
- 当前裂隙开启节奏；
- 当前上界/幽冥裂隙站点；
- 当前生态 RNG 纪律。

目的不是替代旧 longrun。

而是保证：

> 新实验框架可以表达旧测试世界。

若无法逐字复现，应记录差异。

不要把“额外人口但不开裂隙”也叫 `longrun`。

profile 名称必须反映真实语义。

---

# 六、建立实验核心架构

建议形成如下结构。

允许 Codex根据现有代码风格小幅调整文件名，但职责必须分开。

```text
scripts/
  inkbox-experiment.mjs

  experiment/
    world-factory.mjs
    runner.mjs
    collectors.mjs
    profiles.mjs
    diagnostics.mjs
    report.mjs
    job-schema.mjs

experiments/
  jobs/
    baseline-natural.json
    baseline-legacy-longrun.json

reports/
  inkbox/
    experiments/
```

其中：

## world-factory.mjs

职责：

- 根据 seed / preset 创建凡界；
- 建 UpperLife；
- 建 Nether；
- 创建 AdvanceState；
- 创建各自独立 RNG；
- 根据 profile 注入 fixture；
- 不负责运行实验。

---

## runner.mjs

职责：

```text
创建世界
↓
执行 scenario/profile hook
↓
advanceWorld()
↓
定期 probe
↓
定期 snapshot
↓
收集结果
↓
结束
```

必须以：

`advanceWorld()`

作为游戏日推进唯一入口。

---

## collectors.mjs

只读。

不得：

- 抽 RNG；
- 修改 entity；
- 修改 world；
- 调用会改变游戏状态的函数。

---

## profiles.mjs

负责定义：

```text
natural
legacy-longrun
```

后续可以增加：

```text
observer
gardener
tyrant
rift-heavy
```

但 B0 不必实现。

---

## diagnostics.mjs

负责根据时间序列产生“研究提示”。

注意：

这些不是 correctness assertion。

例如：

```text
population_plateau
food_high_floor
resource_monotonic
sect_concentration_high
flow_stalled
cross_realm_flow_absent
```

全部应属于：

`warning / observation`

而非：

`test failed`

---

# 七、实验 Job Schema

云端未来应该直接消费 JSON。

建议：

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

实验系统必须验证配置。

非法输入应：

- 输出明确错误；
- exit code 非 0；
- 不静默 fallback。

---

# 八、Manifest

每次实验必须留下：

```json
{
  "schemaVersion": 1,
  "experiment": "...",
  "profile": "...",
  "preset": "...",
  "seeds": [],
  "years": 300,
  "stepDays": 3,
  "snapshotDays": 360,
  "probeDays": 30,
  "viewPolicy": "...",
  "commit": "...",
  "node": "...",
  "collectorVersion": "..."
}
```

如果当前目录是 Git repository：

获取当前 commit SHA。

如果无法取得：

写 `null`。

不要猜。

### 可重复性注意

核心 manifest / summary 不要写入影响 byte-identical 对比的当前时间戳。

若需要记录：

```text
wall clock runtime
startedAt
hostname
```

请放入独立的：

`runtime.json`

并明确其属于非确定性 metadata。

---

# 九、采样必须分两层

## Snapshot

默认每游戏年一次。

用于观察长期状态。

---

## Probe

建议默认每 30 游戏日一次。

只保存少量轻量指标。

目的：

防止年度 snapshot 漏掉：

- 短期饥荒；
- 人口跌落；
- 粮仓见底；
- 突发污染；
- 短期宗门危机。

不要为了 probe 每 30 日序列化整个世界。

---

# 十、B0 必须采集的指标

第一版不要追求“全宇宙数据仓库”。

优先采集能够回答世界健康问题的指标。

## A. 人口

```text
population.total
population.human
population.cultivator
population.cultivatorShare
population.highestRealm
```

能安全读取则增加：

```text
births cumulative
deaths cumulative
awakens cumulative
```

如果代码目前没有可靠累计 counter：

**不要通过两个 snapshot 相减冒充精确 flow。**

记录为 unavailable。

---

## B. 聚落与粮食

```text
villages.count
villages.population
food.min
food.mean
food.max
food.p10
food.p90
```

至少观察：

- 有没有长期贴近 400；
- 有没有真正的粮荒；
- 粮荒是否影响人口。

---

## C. 修炼生态

```text
cultivators.count
cultivators.realmDistribution
cultivators.highestLevel
qi.mean
qi.min
qi.max
```

B0 暂时不添加新的灵气压力算法。

只测当前系统。

---

## D. 宗门

```text
sects.count
sects.population
sects.populationGini
sects.populationHHI
sects.spiritStone.total
sects.spiritStone.max
sects.provisions.total
sects.provisions.max
sects.stability.mean
sects.reputation.mean
```

灵脉：

```text
leylines.total
leylines.controlled
leylines.topOwnerShare
leylines.gini
```

这里特别重要。

未来要用它判断：

> 一宗长期控制多数灵脉究竟是自然霸权还是结构锁死。

---

## E. 魂与轮回

优先使用现有 `reincarnationStats()` 等只读接口。

注意：

不要把魂池当作“一人一魂人口守恒”。

当前设计中并非所有死者都必须产生永久灵魂。

因此应该观察：

```text
soulPool
route counts
important soul reincarnation
wait / eviction if available
```

而不是错误地要求：

```text
births == reincarnations
```

---

## F. 上界

采集：

```text
population
cultivators
mortals
births/deaths if reliable
arrivals if reliable
realm distribution
```

---

## G. 幽冥

优先使用：

```text
netherEcoStats()
netherItemStats()
```

并保留其现有守恒式。

若守恒式失效：

这属于 correctness failure。

---

## H. 三界跨界

采集：

```text
riftStats
wraithStats
possessionStats
```

以及：

```text
ascension
crossing
leaking
possession
```

如果 profile 是 `natural + viewPolicy=closed`：

裂隙数据为 0 不应该自动报警为 bug。

这是预期实验条件。

---

## I. 战争 / 家族 / 法宝

优先读取现有：

```text
warStats()
clanStats()
artifactStats()
```

第一版只记录宏观数量。

不要大量 dump 实体详情。

---

# 十一、统计函数

实验工具内部实现通用纯函数：

```text
mean
min
max
percentile
gini
HHI
entropy
slope
coefficientOfVariation
```

这些函数必须：

- 无随机性；
- 有单元测试；
- 对空数组有明确行为；
- 不产生 NaN 传播。

---

# 十二、第一批自动诊断

B0 的 diagnostics 只负责发现值得人工阅读的异常。

建议：

### population_plateau

若长期人口几乎不变：

记录。

暂时不要自动判断是好是坏。

### food_high_floor

如果后半程：

```text
food.p10 > 某个相对上限阈值
```

记录粮食可能长期过剩。

不要把 400 复制为隐藏常量。

尽可能从现有状态或序列行为判断。

### monotonic_resource

检测：

```text
spiritStone
provisions
```

长期只增不减。

提示：

`possible_missing_sink`

### concentration

检测：

```text
sect pop HHI
leyline owner concentration
```

### stalled_flow

对于已有累计 flow：

若最终 1/3 时间窗口完全不再变化：

提示。

### conservation_violation

幽冥已有守恒式若失败：

必须标记高严重度。

---

# 十三、输出格式

## timeseries.csv

一行：

```text
seed + simulation day/year
```

列保持稳定。

字段新增可以追加。

不要随意改名。

---

## summary.json

每个 seed 一份 summary。

再提供 aggregate：

```text
mean
median
min
max
p10
p90
```

不要只输出平均值。

不同 seed 的差异本身就是研究对象。

---

## diagnostics.json

格式建议：

```json
[
  {
    "severity": "info",
    "code": "food_high_floor",
    "seed": 20260914,
    "metric": "food.p10",
    "window": "final_third",
    "evidence": {}
  }
]
```

---

# 十四、确定性要求

这是硬性验收。

同一：

```text
commit
seed
profile
preset
years
stepDays
viewPolicy
```

重复执行两次：

核心：

```text
manifest
summary
timeseries
diagnostics
```

必须可比较。

如果无法逐 byte 相同：

必须解释原因并至少保证数值内容逐字段一致。

实验工具不得使用：

```js
Math.random()
```

作为模拟随机源。

必须沿用项目现有确定性 RNG 纪律。

---

# 十五、不得污染真实随机流

Collector / Reporter / Diagnostic：

必须满足：

> 开启或关闭数据收集，不应改变世界线。

建议增加一个验证：

同 seed 跑：

```text
A = collector off
B = collector on
```

最终世界 digest 必须一致。

若当前已有 digest 工具：

直接复用。

不要重新发明第二套世界序列化规则。

---

# 十六、云端执行兼容性

后续计划可能是：

```text
Codex 编写实验
↓
提交 Job JSON
↓
云任务启动 Node
↓
运行数百/数千 seed
↓
上传结果
↓
AI 分析 CSV / JSON
```

因此本轮从第一天就遵循：

### 一次进程可以只执行一个 Job

```bash
node scripts/inkbox-experiment.mjs --job=job.json
```

### 不依赖浏览器

不依赖：

```text
Canvas
DOM
WebGL
Chrome
CDP
```

### stdout 简洁

只输出：

```text
progress
seed
elapsed
output path
fatal error
```

不要把几十 MB CSV 打进 stdout。

### 正确 exit code

成功：

```text
0
```

配置错误 / 模拟崩溃：

非 0。

### 可中断

每完成一个 seed 即写出结果。

如果第 81 / 100 seed 崩溃：

前 80 个不能全部丢失。

---

# 十七、性能记录

记录但暂时不优化：

```text
wall clock runtime
peak RSS if easily available
years/sec
seed count
```

放入：

`runtime.json`

用于未来决定云实例规格。

B0 不要因为“未来可能跑 10000 seed”现在就上 worker_threads 集群。

先保证串行：

正确、可重复、简单。

后续 B0.5 再并行。

---

# 十八、package.json

建议新增：

```json
"inkbox:experiment": "node scripts/inkbox-experiment.mjs",
"inkbox:health": "node scripts/inkbox-experiment.mjs --job=experiments/jobs/baseline-natural.json"
```

不要把 B0 health report 加入：

```text
npm test
```

现阶段：

World Health 是研究工具，不是 release gate。

---

# 十九、README / 文档

新增：

```text
docs/WORLD_LAB.md
```

至少说明：

- World Laboratory 是什么；
- 与 smoke / regression / longrun 的区别；
- natural 与 legacy-longrun 的区别；
- 如何运行；
- 如何定义实验；
- 如何解释报告；
- 为什么 health warning 不等于 bug；
- 为什么单 seed 不足以调数值。

---

# 二十、参考项目

这些项目只用于学习“实验方法 / 系统建模思想”。

不要直接移植许可证不兼容代码。

## 1. Mesa

Repository：

`mesa/mesa`

重点阅读：

```text
mesa/datacollection.py
```

学习：

- model-level reporter；
- agent-level reporter；
- tables；
- 将 simulation 与 data collection 分开；
- experiment scenario / repeated run 的思想。

Inkbox 不需要引入 Python Mesa。

只借鉴架构思想。

---

## 2. NetLogo Models / Sugarscape

Repository：

`NetLogo/models`

重点：

```text
Sample Models/
Social Science/
Economics/
Sugarscape/
Sugarscape 3 Wealth Distribution
```

重点研究：

```text
patch resource stock
max stock
regrowth
agent metabolism
movement
death
Lorenz curve
Gini
```

它对未来 Inkbox：

```text
灵气承载
资源恢复
局部竞争
财富/宗门集中
```

具有较高参考价值。

注意：

只借鉴模型思想。

不要复制许可证有风险的代码。

---

## 3. Thrive

Repository：

`Revolutionary-Games/Thrive`

重点阅读：

```text
simulation_parameters/
src/auto-evo/
```

尤其关注：

```text
population simulation
auto-evo
simulation parameter separation
后台长期模拟与表现层分离
```

Inkbox 当前最大的参考意义不是具体生态公式，而是：

> 如何把后台长期世界模拟当作独立系统研究。

---

## 4. Freeciv

Repository：

`freeciv/freeciv`

重点研究：

```text
food
production
trade
city storage
upkeep
surplus
starvation
```

学习目标：

> 少量资源如何通过明确 source / stock / sink 产生复杂行为。

不要因此在 B0 添加这些机制。

这是后续 B2 经济循环设计参考。

---

# 二十一、B0 完成后必须跑的实验

至少：

## Smoke

```text
1 seed
10 years
```

用于确认工具能跑。

## Short

```text
1 seed
30 years
```

确认输出结构。

## Baseline

```text
3 seeds
300 years
natural
```

## Legacy comparison

```text
seed 20260914
300 years
legacy-longrun
```

最后如果本机资源允许：

```text
3 seeds
500 years
natural
```

但不要因为一次长跑花很久而阻塞代码验收。

---

# 二十二、最终报告要求

任务完成后，Codex必须提交：

## 1. 改动文件清单

每个文件一句职责。

## 2. 架构说明

明确：

```text
World Factory
Runner
Collector
Reporter
Diagnostics
```

如何分工。

## 3. 确定性证明

说明如何验证：

`collector on/off`

不会改变世界线。

## 4. baseline 结果

只描述现象。

不要开始调参。

例如：

```text
人口长期贴顶
粮食长期高位
某资源持续单调上涨
灵脉高度集中
```

可以记录。

但不要自行修改。

## 5. 已发现问题

区分：

```text
correctness bug
health concern
telemetry gap
experimental limitation
```

不要混在一起。

## 6. 下一阶段建议

最多给出：

```text
3~5 个建议
```

不要直接开始 B1/B2。

---

# 二十三、验收标准

任务只有满足以下条件才算完成。

### A. 不改变正式世界规则

本阶段原则上 gameplay diff = 0。

### B. 使用真实模拟入口

必须调用：

`advanceWorld()`。

### C. headless

实验运行不需要浏览器。

### D. deterministic

同配置重复运行结果稳定。

### E. collector purity

是否采集数据不能改变世界 digest。

### F. natural baseline 真实自然

不能暗中：

- 加 70 人；
- 开裂隙；
- 投放资源；
- 模拟天道操作。

### G. legacy profile 语义清晰

不能把不同实验条件统称 `longrun`。

### H. 输出机器可读

至少：

```text
manifest.json
summary.json
timeseries.csv
diagnostics.json
```

### I. 单 seed 失败不毁整批数据

已经完成的 seed 必须保留。

### J. 原有测试通过

至少执行：

```bash
npm test
```

以及与改动直接相关的已有模拟测试。

### K. 不新增不必要依赖

优先仅使用：

```text
Node built-ins
项目现有模块
```

---

# 二十四、这一轮不要解决的问题

以下内容全部放到后续 B1/B2：

```text
人口承载压力重构
灵气 crowding
宗门财政 sink
粮食腐败 / 储藏成本
凡人与修士社会关系
邪修经济
裂隙污染生态
迁徙模型
三界状态耦合
高阶修士退出机制
霸权控制成本
玩家干预经济
```

B0 的任务不是回答这些问题。

B0 的任务是：

> **以后每修改其中一项，我们都能够知道它究竟让世界发生了什么。**

---

# 二十五、为下一阶段预留的接口

架构应能在不重写 runner 的情况下，未来实现：

```text
paired control / treatment
shock scheduler
counterfactual run
parameter sweep
multi-seed batch
causal coupling matrix
cloud distributed runs
```

例如未来应该能表达：

```text
同一个 seed
前 200 年完全相同
第 200 年 Treatment 世界发生粮食冲击
继续跑 300 年
比较两条世界线
```

但本轮只需要：

**架构支持，不需要完整实现。**

---

# 二十六、任务完成的核心哲学

不要把这个工具做成：

> “给设计师看看几条图表。”

要把它做成：

> **《坐天观井》的实验室。**

今后所有关于：

人口、修炼、宗门、战争、灵气、污染、三界、凡人、邪修、经济，

的设计争论，都应该能够逐渐转换成：

```text
假设
↓
实验
↓
数据
↓
解释
↓
修改
↓
重新实验
```

从本阶段开始：

**不再凭一个好看的 seed 调整个世界。**

**不再因为“感觉差不多”就修改长期系统。**

**不再让表现层测试代替世界健康测试。**

先把尺造准，再开始改世界。