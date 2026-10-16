# G4-P0-A R2.1 实验裁断

**INCONCLUSIVE — 原始 R2.1 S0 曾按两轮修正停止条件中止；后续获单独授权的 S0-R 基建 smoke 已通过。正式 S0、A/A、ABBA 与 S1–S3 未完成，不能裁定 V3 的真实浏览器性能价值，不建议据此启动 P1。**

正式主轮 P95/P99：`null/null`；A/A P95 差值：`null`；有效主轮 RAF：`0`。S1、S2、S3 均未执行。S0-R 的 4×24 帧只用于验证真实 RAF 采样链路，虽保留描述统计，也不计入性能结论。S0-R 的浏览器 SystemInfo 与产品 WebGL 双重核验均确认 AMD Radeon 610M 硬件后端；这不能替代正式主轮验收。这里没有“静海无效”或“静海优化成功”的结论。

基线：开工时 fetch `origin/main`，锁定 `e1e55039bb56efda7a307513ede07a9fab3bf534`，与委托书参考 SHA 相同，无 BASE_DRIFT。独立分支：`analysis/g4-p0a-hydro-ablation`。既有工作区和其他工作树未重置、合并或覆盖。运行器/参考输入与本次证据/报告分成两个提交；提交信息见 `delivery.json` 和分支日志。

## S0-R 基础设施修复复核

S0-R 是原任务结束后的独立、限界复核授权；它不重置原 R2.1 的两轮修正记录，也不运行 A/A、ABBA 或正式 S1。结果目录为 `results/s0r-recovery-06/`，其总裁断仍为 `INCONCLUSIVE`，阶段 `S0R=PASS`；正式 `S0` 和 `S1`–`S3` 均标为 `NOT_RUN`。

| 检查 | 结果 | 实证 |
|---|---|---|
| 视口请求前置核验 | PASS | 11 份空白页/产品页快照全部通过；`innerWidth/innerHeight=1366×768`、DPR=`1`、visual viewport 与 CDP CSS layout/visual viewport 均精确一致。具体值见 `viewport-preflight.json` 和 `viewport-checks.json` |
| 原视口差异定位 | 已解释并修正 | 未固定浏览器设备缩放时，页面 DPR 为 `1.0000000298023224`；CDP CSS 视口仍为 `1366×768`，主机屏幕为 `1707×1067 @ 1.5`。仅增加 CDP screenWidth/Height 未改变 DPR。增加 `--force-device-scale-factor=1` 后，页面与 CDP 屏幕信息均报告 DPR=`1`；阈值保持精确相等，没有放宽 |
| 产品页面 document-start 与画布 | PASS | document-start 读数为 `1366×768 / DPR 1`；就绪后画布与 CDP 再核验。Three 活动画布 backing=`952×625`，CSS rect=`952×625.5`，均原样记录；尺寸不是整个窗口尺寸，因为画布位于产品中间工作区 |
| 就绪等待诊断 | PASS | 10 个产品/渲染器等待检查通过，均保留最后状态、尝试次数和页面错误；没有页面异常或资源加载错误 |
| V0 暂停克隆 Oracle | PASS | 10 步、`dtDays=4`、容差 0；`height/water/type/qi` 四层逐格差异均为 0 |
| 四变体实际绑定 | PASS | V0/V1/V3/V9 指纹分别为 `0c8ad05b / 7595ba28 / 0aa2d3f0 / 5c07877d`；产品世界调用数与真实水文计数一致，真实世界身份为 true，`lastDtDays=4`，无代理错误；V3 `v3Steps` 等于其水文调用数 |
| 真实 RAF 小样本 | PASS（仅链路） | 四变体各 12 帧预热、24 帧采样，共 96 条原始测量帧；每帧按产品 `lastTime`、实际 `dt` 和累积器复算，`hydroCadenceMatch` 全通过、无帧超过 3 步。压缩原始记录及解压内容 SHA、样本数和统计已重新读取核对 |
| GPU 身份 | PASS（仅 S0-R） | Edge `155.0.4283.45`、Windows x64、Ryzen 9 8940HX；SystemInfo WebGL=`enabled`，产品 WebGL2 renderer=`ANGLE (AMD Radeon(TM) 610M, D3D11)`，硬件判据 PASS。设备枚举中的 RTX 5060 不是本轮实际 renderer |

S0-R 没有执行正式 S0 中的原生 V0 direct 描述样本，所以没有把它标成正式 `S0_PASS`。4×24 帧产生的 P95/P99 是 smoke 数据，样本过短且轮次顺序不满足正式 A/A/ABBA 设计，不用于 GO/NO-GO 判别。可复核的等待、视口、绑定、Oracle 与原始帧证据都在上述结果目录。

S0-R 的启动/修复尝试也全部保留：`s0r-recovery-01` 是临时附件路径不可见；`-02` 是沙箱本机 CDP 连接失败；`-03` 暴露诊断器自身的变量遮蔽错误并据此修正；`-04/-05` 保存 DPR 精确差异及 screen-info 交叉证据；`-06` 在固定设备缩放后通过。各目录中的失败清单没有覆盖或删除。浏览器真实 GPU 下的 S0-R 通过不改变整体 INCONCLUSIVE 裁断。

## 原始 R2.1 S0 检查点（Attempt 01–03）

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

以下是原始 R2.1 阶段的失败与两次修正；所有记录都保留，没有删除、替换或重命名某次观测来制造通过结果。S0-R 后续失败与成功尝试另见上一节及 `results/s0r-recovery-*/`，不改写这段历史。

1. 沙箱环境尝试：独占临时 Edge profile 的 CDP 连接错误。`results/environment-initial-failure.json` 原样保留；随后主机权限下浏览器连接成功。此环境权限尝试没有产生性能数据。
2. `attempt-01`：R2 原文含 `const { H, T } = M`，测试服务器替换 import 时又声明同名 H/T，浏览器报告 `SyntaxError: Identifier 'H' has already been declared`。修正 **1/2**：仅对环境 import 使用别名，再组装 M，算法正文不变；旧服务器字节副本为 `attempt-01/failed-server.mjs.txt`。
3. `attempt-02`：启动等待超时 `PRODUCT_BOOT_BLOCKED`。直接检查既有 `Session.waitFor` / `Session.js` 的合约发现表达式体必须显式 `return`，原运行器漏写，判断恒为 undefined。修正 **2/2**：两处等待体加 return，留存 `attempt-02/failed-runner.mjs.txt` 和当时 page 脚本。该次 pageErrors 为空，但没有可据以宣称产品成功启动的状态快照。
4. `attempt-03`：页面和 Three 已启动，在计时外构造标准世界、执行初始化流程后，精确视口护栏报告 `VIEWPORT_DRIFT`。`failure.json` 保留页面状态。修正额度耗尽，停止；没有第 3 轮修正，也没有继续 A/A 或正式浏览器采样。

原始尝试运行器自身以 `ENV_BLOCKED/EXPERIMENT_BLOCKED` 返回。原 R2.1 阶段当时的裁断为 **INCONCLUSIVE / S0_INVALID_REPAIR_LIMIT**。后经单独授权，S0-R 已通过并证明本机 AMD 硬件浏览器可用于该小型测试链路；正式 S0 原生路径与 S1 性能采样仍未执行，因此整体裁断仍是 **INCONCLUSIVE**，不是对 V3 的 NO-GO。

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
