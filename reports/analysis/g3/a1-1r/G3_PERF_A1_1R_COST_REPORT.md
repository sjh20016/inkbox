# G3-PERF-A1.1R · PCC 分类成本裁决

基线：`8a9ae898204615722c7e90eb03e1d53f1e885608`（A1-1，PR #17）。本轮只调查分类成本、三种观察模式及观察器生命周期，不实施 A1-2、不改变渲染消费者、World、模拟、随机流、保存格式或性能预算，不合并 main。

## 消费者职责裁决

保留真正的着色输出计算在现有渲染消费者中是合理方向。PCC 应提供五字段精确变化列表、几何 / 拓扑规则事件与依赖失效信息，而不是再次复制材质输出。

源码依据：

- `src/inkbox/render3d/art/TerrainDataTextures.js` 已拥有高度纹理 R（raw height）、G（stage elevation）及 B/A（半径 2.5 的宽域梯度），通过既有 height / type / fire dirty 路径更新；梯度足迹扩展 3 格。
- `src/inkbox/render3d/art/PigmentTerrainMaterial.js` 在真实 vertex / fragment shader 中计算 broad gradient、structure、mass、deep 等输出。它还消费相机、材质 profile、噪声、type / field 等输入；动态 broadRadius 范围为 2–4。
- `src/inkbox/render3d/terrain/TerrainMesh.js` 和 `stage/PlaneStage.js` 继续消费原 dirty regions，本轮不改消费方式。

A1-1 的 CPU `shadeAt` 是固定半径 / 常量的影子诊断，缺少完整材质与相机输入，并非 GPU 输出 oracle。轻量模式的失效集合只能针对当前参考核验证；不能据此宣称任意 profile / 半径 / 相机的真实 GPU 等价。未来消费者接线时，应由消费者声明其输入与 kernel 依赖，并处理材质配置、视界、world 替换等非字段失效。当前只提供可读取的必要信息，不授权实施稀疏 renderer 或省略现有 dirty 更新。

## 计时与内存口径

本机通过 Node os API 获取实际环境；不沿用旧报告的 CPU / OS。完整原始分类器作为冻结参考，在同机重新测量。分项 profiler 另行测量，成本裁决使用关闭分项 profiler 的样本，避免将计时开销解释为算法成本。Oracle、断言、hash、拷贝和日志均在计时窗外。

TypedArray retained capacity 与累计分配是不同口径；Node heapUsed、external、arrayBuffers 和 GC 前后差值另记。关闭 / dispose 的零容量表示对象不再持有新增缓冲，不保证 OS RSS 或 V8 external 立即归零。

## 证据与结论

**裁决：A1_1R_COST_ADJUDICATED_BLOCKED。** 完整影子与轻量规则均未通过既有 3 ms 分类成本停止线；本轮裁决和故障修复已完成，但 G3 / G2 性能 BLOCKED 不变，不进入 A1-2。精确列表可作为后续最小输入的研究起点，不能据此称整帧预算通过。

本机：AMD Ryzen 9 8940HX with Radeon Graphics，32 logical CPUs，Windows 10.0.26200，Node v24.11.1。与旧 A1-1 的 i3 环境不同，故冻结原版在同机重新计时，不能直接把旧 19 ms 与本轮相除。两张 512×320 图，seed 673231，scatter=true，generationVersion=2，standard + 相同 archipelago fixture；正式世界先 30 个水文步，再连续 60 步，每步 hydrology(4,null)。每个独立进程在另一个世界预热同模式 Bridge / 分类器 8 帧，三轮交错顺序；全部 30 个关闭 profiler 的预定运行与 6 个独立 profiler 运行均保留。

### 关闭分项 profiler 的成本

P50 是三轮各自 60 帧 P50 的中位数；P95 是三轮 P95 的最大值，不拼接样本后重新算分位数。所有数值单位 ms，构造成本不在帧窗口。

| 地图 | 模式 | 分类 P50 | 分类 P95 | Bridge + 分类 P50 | 构造 P50 |
| --- | --- | ---: | ---: | ---: | ---: |
| standard | off | — | — | 1.511 | 0.002 |
| standard | reference | 18.576 | 26.832 | 22.142 | 31.695 |
| standard | exact | 0.014 | 0.069 | 3.486 | 0.032 |
| standard | rules | 8.704 | 21.258 | 11.957 | 5.748 |
| standard | shadow | 22.015 | 37.849 | 25.752 | 31.974 |
| archipelago | off | — | — | 1.544 | 0.002 |
| archipelago | reference | 24.063 | 36.494 | 28.456 | 31.819 |
| archipelago | exact | 0.022 | 0.074 | 4.010 | 0.032 |
| archipelago | rules | 10.547 | 21.438 | 14.652 | 11.237 |
| archipelago | shadow | 24.637 | 47.577 | 29.976 | 30.428 |

exact 的“分类”仅为统计对象开销，精确列表实际生成在 Bridge scan 内，不能把约 0.02 ms 解释为完整列表成本。原 dirty scan 无 observer 的总 P50 为 1.51 / 1.54 ms；开启精确列表后总成本明显上升。rules 已完全不运行 shadeAt，但仍约 8.70 / 10.55 ms，因此不能把所有超额成本归因于着色。shadow 相对同机原版也不能宣称稳定加速。

### 分项诊断（profiler 开启）

下表为独立 profiler run 的 60 帧**算术平均**，以便核对各项之和；它是带计时扰动的实测归因，不能当作未打点算法的精确绝对分解。纯 shadeAt 与判定 / 同步已分离，队列与强制处理的高程 / 依赖登记分别归入对应项，分项不重复相加。

| 地图 / 模式 | elevation | topology | shadeDependencies | shadeAt | tmax | other | 分类均值 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| standard / exact | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.013 | 0.013 |
| standard / rules | 9.330 | 2.438 | 4.029 | 0.000 | 8.445 | 2.250 | 26.491 |
| standard / shadow | 10.826 | 3.420 | 5.171 | 13.498 | 13.600 | 7.775 | 54.290 |
| archipelago / exact | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.014 | 0.014 |
| archipelago / rules | 12.446 | 3.533 | 4.696 | 0.000 | 11.165 | 3.447 | 35.287 |
| archipelago / shadow | 10.856 | 2.910 | 4.221 | 13.475 | 13.026 | 7.621 | 52.108 |

**计时扰动不能忽略。** 细粒度入队 / 清队计时引入了大量时钟调用；以下同一口径的总 P50 显示影响很大，故停止线裁决只使用 profiler 关闭的数据。分项可定位工作分布，但本轮不声称无打点的队列固有成本就等于表中的 tmax 值；不能直接将带打点成本外推到产品。

| 地图 / 模式 | profiler 关：总 P50 | profiler 开：总 P50 |
| --- | ---: | ---: |
| standard / exact | 3.486 | 3.700 |
| standard / rules | 11.957 | 25.687 |
| standard / shadow | 25.752 | 59.452 |
| archipelago / exact | 4.010 | 3.817 |
| archipelago / rules | 14.652 | 39.093 |
| archipelago / shadow | 29.976 | 51.372 |

### 内存

下表为三轮中的最大 retained typed capacity（MiB）；累计 allocatedBytes 及 heapUsed / external / arrayBuffers 的初始化、帧后 GC、dispose 后值均逐运行保存在 JSON。它们包含测试 / World 的进程总量，不把所有 heap 差值归因给 PCC。

| 地图 / 模式 | PCC 自有容量 MiB | Bridge 新增列表 MiB | PCC 累计分配 bytes | 关闭后自有 / 列表容量 |
| --- | ---: | ---: | ---: | ---: |
| standard / exact | 0.00 | 1.78 | 0 | 0 / 0 |
| standard / rules | 9.92 | 1.78 | 13099780 | 0 / 0 |
| standard / shadow | 19.63 | 1.78 | 22962948 | 0 / 0 |
| archipelago / exact | 0.00 | 1.53 | 0 | 0 / 0 |
| archipelago / rules | 9.95 | 1.53 | 13157124 | 0 / 0 |
| archipelago / shadow | 19.95 | 1.53 | 23642884 | 0 / 0 |

rules 省去两套 Float64 着色缓存（512×320 时共 10 MiB），但仍持有几何 / 深度 / 依赖 / 截止队列状态；总容量差也受队列扩容影响，不能仅按删掉的数组计算。exact 的零 PCC 缓存不意味着零列表缓冲。

### 正确性与模式差异

全部六组 scene / round 对照中，五字段逐步指纹、末态序列化保存 SHA 与完整 legacy dirty 区域一致。冻结 reference 与 shadow 的逐帧精确 / 已呈现着色、几何 / 水面 / 深度缓存指纹及分类计数严格一致。rules 的静态湿干、深度带、type、拓扑和植被 / 树资格事件与参考一致。

**rules 不是原版呈现策略的逐帧替代。** 原版 shade、geo、water 共用一个 forceAt 截止时间；移除 shade 队列会改变几何的首次到期点。两张图的每一轮均有 47 / 60 帧 geo 或 waterGeo 候选数不同（从零基帧 13 起），详见 rulesGeometryTiming。保留该差异为裁决证据，不把相关 equality 断言失败隐藏成“全部等价”。独立小图验证 rules 自身 EPS 超限立即同步、同水文步多 RAF 不计龄、正常 12 步内同步与跳步同步通过。

当前 rules 仅供观察和研究，不消费 renderer，也没有由此减少正式 dirty 更新；即便其成本未来低于停止线，仍需单独裁决这种时序变化、真实消费者足迹和发布门禁。

数据见 [精简成本与内存结果](./pcc-cost-summary.json)（220467 bytes）和 [定向检查](./pcc-cost-checks.json)。精简结果保留各运行统计、轨迹指纹、等价判定与完整 raw 报告 SHA；原始逐帧结果与所有 36 个子运行文件保存在本地 ignored reports/local/g3-a11r。

正式测量时仓库 HEAD 为 8b291a5bb25e80d2e9231520132f90d87081072e，workingTreeDirty=true：仅 harness 的最终验证边界 / 摘要写出仍待提交；三个核心源码自 8fcc476d451fcb67ef85f9fe412fe1eec40fafc1 起未改。JSON 记录五个运行文件的实际 SHA-256；最终交付提交保存同一份测量 harness。不要将父 SHA 误写为全部已提交测量脚本。


分项是互不重叠的诊断区间：

- `elevation`：高度 / 水面高程变换及几何阈值判断（包括强制到期时的高程计算），扣除队列调用。
- `topology`：受影响 quad 的旧 / 新对角拓扑判断。
- `shadeDependencies`：着色邻域登记，包括强制同步触发的邻域登记。
- `shadeAt`：仅批量 `shadeAt` 输出计算，误差比较与影子同步不计在此项。
- `tmax`：入队 / 清队及到期队列管理，扣除高程和邻域登记，不重复计入其他项。
- `other`：水深、资格判断、着色误差比较 / 同步、统计与计时残差。

队列与强制处理内部的细粒度时钟也有成本；profiler-on 的分项是带测量扰动的归因结果，不当作 profiler-off 的固有成本。单独报告 profiler 开关的整体差异，不从无计时样本中伪造精确分项。所有预定样本保留，无预算调整或丢弃慢帧。

`rules.stats.dependencyIndices` 是当前帧的同步借用视图，下一次观察会复用缓冲；如需跨帧保留必须自行复制。释放保证 PCC / Bridge 自身不再持有新增数组，无法使外部已保留的视图失效。

## 正确性、故障与释放

`--checks-only` 已通过：13 个定向帧、39 组 profiler 开关一致性检查，逐字段独立枚举 oracle、World 序列化不变、完整影子对冻结参考的精确 / 已呈现着色数组一致。轻量规则对照参考 `exactShade` 输入变化的输出差异做保守覆盖；不要求它复制 `presentedShade` 的 T_max 延迟。

观察器故障通过 `PlaneStage.pcc.error` / `failureCount` 对外暴露，当帧 stats 置空；Bridge 在 finally 提交快照并保留 dirty 返回，因此原渲染消费者继续消费失败帧。半更新 PCC 被丢弃，下一帧从当前 World 重建，不把坏影子当成有效状态。定向用例证明失败帧 renderer buffers 与 off 一致、下一帧恢复。

反复切模式、关闭、隐藏 / 显示、换 World、dispose 均检查了生命周期。关闭和换 World 会释放 Bridge 新增精确列表 / cellMask，PCC 自有 TypedArray 容量归零。原有 renderer 快照仍保留用于原路径；本轮不将需要的传统快照误删为“残留”。

## 复现与范围

在本分支隔离工作区用 Node 24 与 `npm ci`：

```powershell
node --expose-gc scripts/inkbox-g3-pcc-cost.mjs --checks-only
node --expose-gc scripts/inkbox-g3-pcc-cost.mjs --benchmark
```

benchmark 内部严格串行，不与其他 CPU / GPU 负载并行；默认只运行本次 60 步裁决，不触发 A1-2、600 步、GPU 或长局。原始完整采样在 ignored `reports/local/g3-a11r/`；本目录保留可复查的结果与验证摘要。冻结参考文件的算法体与基线原文件一致，只调整了导入路径与行尾。

旧 A1-1 的原始脚本也运行过，22 个 direct assertions 通过（exit 0）；其中附带的旧 quick benchmark 不作为本轮三模式成本裁决依据。初版新 harness 的变量引用错误及 delayed presentedShade 对照口径冲突在正式采样前已发现、修复；失败输出保留在本地证据中，没有用失败运行的计时数据计算本轮结论。首轮正式聚合的 round 字符串错误修复后，第二轮发现 rules 共享截止策略的真实时序差异；最终按明确的模式契约完整重跑 30 + 6 个预定子运行并 exit 0，没有按计时快慢筛选样本。

这里只验证 Node 端规则 / read-only 观察器及现有 CPU renderer buffers。未运行浏览器 GPU、完整材质视觉等价、完整 Fast / Heavy、600/6000 耐久或模拟长局；本轮不是 renderer 集成验收，不能把 CPU 成本与旧性能总门禁混为一谈。


## 验证记录

- npm ci：exit 0，Node 24.11.1 / npm 11.6.2。
- node --check（Bridge / PCC / Stage / harness）：exit 0。
- node --expose-gc scripts/inkbox-g3-pcc-cost.mjs --checks-only：exit 0（13 帧 / 39 profiler parity + rules 独立 EPS / T_max + Stage 故障与生命周期）。
- 三个标准图 child smoke（off / rules / shadow）：各 exit 0。
- node --expose-gc scripts/inkbox-g3-pcc-cost.mjs --benchmark：最终 exit 0；30 成本运行 + 6 独立 profiler 运行。先前失败的两次聚合日志分别保留。
- npm run build / npm run test:package：均 exit 0；472 文件、112 本地脚本目标、113 包内 Markdown。
- git -c core.whitespace=cr-at-eol diff --check：exit 0；Bridge / Stage 基线就是 CRLF，保留既有行尾，不做整文件换行重写。
- World / Sim / RNG / 保存、terrain / art / water 消费源码、workflow / package 文件差异检查：无修改；PlaneStage 仅修改 PCC 观察器接线，原 dirty 消费部分不变。

回滚可放弃本研究 Draft PR（尚未合并 main），或正常 revert 本分支三个交付提交。不强推、不重写既有研究历史。本轮不是通过成本门槛的产品候选。
