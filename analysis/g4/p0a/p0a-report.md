# G4-P0-A R2.1 实验裁断

**INCONCLUSIVE — S0 未通过；两轮基础设施修正后停止。不能裁定 V3 的真实浏览器性能价值，不建议据此启动 P1。**

主轮 P95/P99：`null/null`；A/A P95 差值：`null`；有效主轮 RAF：`0`。S1、S2、S3 均未执行。浏览器 SystemInfo 显示 AMD 硬件 ANGLE / WebGL enabled；产品上下文的双重 GPU 核验未完成，不能报 GPU 验收通过。这里没有“静海无效”或“静海优化成功”的结论。

基线：开工时 fetch `origin/main`，锁定 `e1e55039bb56efda7a307513ede07a9fab3bf534`，与委托书参考 SHA 相同，无 BASE_DRIFT。独立分支：`analysis/g4-p0a-hydro-ablation`。既有工作区和其他工作树未重置、合并或覆盖。运行器/参考输入与本次证据/报告分成两个提交；提交信息见 `delivery.json` 和分支日志。

## S0 实际检查点

| 检查 | 结果 | 实证与限制 |
|---|---|---|
| 最新 main、独立干净工作树 | PASS | 产品基线 SHA 与六个关键 blob 记录于 `provenance.json` |
| R2 输入可得、算法原样复制 | PASS | ZIP 内 entry 与 reference 字节完全一致，SHA-256 已记录 |
| main 单一 import 改写 | PASS | 仅第 39 行 import URL 改变，磁盘产品文件无改动；HTTP smoke 反向还原字节一致 |
| R2 机械转换 | PASS | 仅替换 env import；剩余正文散列相同；实际响应通过 ESM 语法检查 |
| 浏览器产品启动 | PASS，仅第 3 次尝试 | 页面 ready=complete、visible、world=true、speed=0、Three renderer=true；无页面错误记录 |
| 视口一致性 | FAIL | `VIEWPORT_DRIFT`；请求 1366×768 / DPR 1，未满足运行器的精确相等护栏。失败记录未保存实际尺寸三元组，不能进一步声称具体差了多少 |
| V0 暂停克隆世界 Oracle | NOT_RUN | 在视口护栏之后，未被调度；未证实逐格零差异 |
| V0/V1/V3/V9 真实绑定与调用次数 | NOT_VERIFIED | 未采到正式 probe；调用次数填 null，不能拿 URL 或函数源码冒充执行证据 |
| 规范 T0 跨段一致性 | NOT_VERIFIED | 第 3 次进入初始化但未持久化返回 setup；不能报告跨段摘要一致 |
| 产品 GPU 身份与加速双重判据 | NOT_COMPLETED | 有浏览器 SystemInfo 硬件证据，缺产品 WebGL getter 的留存值 |
| S0 总门槛 | FAIL | 依停止条件不进入 S1 |

`results/s0-checkpoint.json` 保存同一检查点的结构化版本。

## 失败与两轮修正

所有浏览器实验失败均留存；没有删除、替换或重命名某次观测来制造通过结果。最小检查收集器曾因 PowerShell 作用域错误重跑一次清单，原始逐项输出不可得，已在 verification.json 的 collectionNotes 披露；这没有产生浏览器性能轮次。

1. 沙箱环境尝试：独占临时 Edge profile 的 CDP 连接错误。`results/environment-initial-failure.json` 原样保留；随后主机权限下浏览器连接成功。此环境权限尝试没有产生性能数据。
2. `attempt-01`：R2 原文含 `const { H, T } = M`，测试服务器替换 import 时又声明同名 H/T，浏览器报告 `SyntaxError: Identifier 'H' has already been declared`。修正 **1/2**：仅对环境 import 使用别名，再组装 M，算法正文不变；旧服务器字节副本为 `attempt-01/failed-server.mjs.txt`。
3. `attempt-02`：启动等待超时 `PRODUCT_BOOT_BLOCKED`。直接检查既有 `Session.waitFor` / `Session.js` 的合约发现表达式体必须显式 `return`，原运行器漏写，判断恒为 undefined。修正 **2/2**：两处等待体加 return，留存 `attempt-02/failed-runner.mjs.txt` 和当时 page 脚本。该次 pageErrors 为空，但没有可据以宣称产品成功启动的状态快照。
4. `attempt-03`：页面和 Three 已启动，在计时外构造标准世界、执行初始化流程后，精确视口护栏报告 `VIEWPORT_DRIFT`。`failure.json` 保留页面状态。修正额度耗尽，停止；没有第 3 轮修正，也没有继续 A/A 或正式浏览器采样。

各尝试运行器自身以 `ENV_BLOCKED/EXPERIMENT_BLOCKED` 返回。交付层裁断采用 **INCONCLUSIVE / S0_INVALID_REPAIR_LIMIT**：存在可启动的硬件浏览器，但实验基建未通过，因此既不是证明设备无 GPU，也不是对 V3 性能方向的 NO_GO。

## 实验设备与来源

- Windows x64，内核版本 `10.0.26200`；CPU AMD Ryzen 9 8940HX，32 逻辑线程；Node `v24.11.1`。
- 有窗口 Edge `155.0.4283.45`，未加 `--disable-gpu`，使用独占临时 profile，并只清理本任务进程。主机电源方案 GUID `381b4222-f694-41f0-9685-ff5bb260df2e`（平衡）；原 powercfg 输出解码有乱码，原始记录未改写。
- SystemInfo renderer：`ANGLE (AMD, AMD Radeon(TM) 610M (0x0000164E) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.13050.18)`；vendor 为 `Google Inc. (AMD)`；WebGL featureStatus=`enabled`。枚举中另有 RTX 5060 Laptop GPU 和 Basic Render Driver，不能据枚举就把后者或 RTX 说成实际渲染后端。当前设备不是历史 UHD 730 参考机。
- 请求视口 1366×768、DPR 1；实际产品视口未留存，刷新率 `null`。没有把初始页面上的 FPS 标签当作性能样本。
- R2 ZIP SHA-256：`f7f99fdf50e36f590c328d730aad49e507815260e8a40e1a08bd96efe52efe43`。
- R2 variants SHA-256：`22aa5b602a7e151235afafa763eeab1221334eb2b4dbe8ffa0990ee82a36e44b`。
- 浏览器转换 SHA-256：`13fc2bc8a39d5c65ab21e9611fca45e8d1fe49b29cbf525d0dd8d91e86a9aad8`。
- 转换前后 import 之后正文 SHA-256 均为 `2d0bb19456e40ff41dcfa9fb6df363e3359b6012e03e9d949fcd824f8d46a79f`。其余完整 SHA 见来源文件；未用旧 Node 数据填充新观测。

## 主轮、归因与验收

| 计划轮次 | 有效帧数 | RAF P50/P95/P99 ms | >33.3 / >50 / >100 / >200 ms | hydroSteps |
|---|---:|---|---|---|
| A/A V0 / V0 | 0 / 0 | null | null | null |
| ABBA 1 V0 | 0 | null | null | null |
| ABBA 2 V3 | 0 | null | null | null |
| ABBA 3 V3 | 0 | null | null | null |
| ABBA 4 V0 | 0 | null | null | null |
| V1 / V9 短诊断 | 0 / 0 | null | null | null |

两组成对改善：`null/null`。没有可用的水文帧/非水文帧分布；updateMs、renderSubmitMs、hydrologyMs、GPU render time、GPU valid/invalid/skipped、disjoint、drawCalls、triangles、estimatedJsPayloadBytes 均为 `null`。没有把 RAF 称为 CPU 整帧时间，没有把 V9 称为 GPU 空载。

S2 洪水/注水、雕刻、退水曲线：未执行；S3 标准 Canvas、群岛 Three、GPU 诊断：未执行。未提取群岛 fixture，也未用标准图替代。代码中的这些条件分支均为**未验证实现**，不能把源码存在视为实验完成。

绝对体验门槛 `P95≤33.3ms / P99≤50ms / >50ms≤1%`：未评估。既有回归预算 `baseline×1.08+1.5ms`：未评估；当前设备/协议缺匹配的批准基线，二者均不宣称通过。

统计计划固定采用 nearest rank `sorted[ceil(p×N)-1]`、严格大于阈值的百分比、以两个配对轮次的方向和幅度裁断。没有有效 600 帧轮次，也没有置信区间或显著性主张。相邻 RAF 帧不能视为独立实验重复。

## 规则差异与已有 Node 证据

原始 R2 `reference/r2-prior-results/` 是附件先验，没有在这里重跑或重新签发为浏览器结果。其 Node 水文约 `21.23→2.87ms`、下游 Stage 约 `60.99→1.86ms` 的 P50 只能生成假说；43.8MB/步是属性版本和范围推算，不是真实 GPU 上传。原包的大坝场景没有蓄住水，溃坝仍未验证。本次没有重写全套场景或运行 V2。

V3 是整体 RULE_CHANGE：海格固定水位并吸收陆地来水；入海泥沙消失；热力限于陆地局部。沿海回灌、沟渠通海以及现行全图热力的作用都可能改变。已有远岸内陆水量一致性不构成沿海玩法等价或默认规则上线许可。

运行器设计是在每个新文档的产品实例赋值时通过既有 setSpeed 暂停，再确定性创建 expanse / seed 673231 / generation v2，V0 预热 30 步后对 V0/V3 统一调用原包 enterStaticSea。初始化、flushDirty 和缓存准备应排除在正式计时外；但本次连归一化成本/改变格数的返回记录都没有完整留存，不能给出数字。生产 RAF 的 0.16s 周期、最多 3 步、dtDays=4、游戏速度表、RNG 和渲染源码均未改动。

## 证据、检查与最小下一步

`results/manifest.json` 为交付级索引，包含三次失败的压缩结构化原始记录、散列、样本数 0 和状态；各 attempt 子目录保留原 JSON、来源和失败版本。`provenance.json`、`variant-bindings.json` 显式标记未完成核验。原始 JSONL.gz 没有伪造逐帧记录，也没有只交汇总数字。

规定最小检查的逐命令退出码和完整短输出见 `results/verification/verification.json`；HTTP/ESM smoke 与真实浏览器 S0 是不同验收级别。最终检查结果见 `delivery.json`。

最小缺口是一次**另行授权的有限基建修复及 S0 复核**：先保留实际 viewport/DPR 三元组并核对 CDP 视口配置，再做暂停克隆 V0 Oracle、四变体真实绑定、规范 T0 和产品 GPU 证明；这些通过后才能开始原定 A/A。这里不推测视口偏差的具体原因，不再重试，不开展 P1 或残余热点优化。未观察到足以定名的 RESIDUAL_HOTSPOT。

本提交不修改任何产品、渲染、存档、正式规则或既有基线文件；不创建、开启、关闭或合并 PR。结案只说明本次证据不足。
