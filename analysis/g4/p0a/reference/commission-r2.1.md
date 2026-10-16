# 《坐天观井 / Inkbox》G4-P0-A · 真实浏览器水文归因与静海判别
## Codex 独立执行委托书 R2.1（2026-10-16）

> **任务性质：限界实验，不是产品改造。** 执行对象：Codex（建议较高推理档，重心放在实验可信度和边界检查，而非遍历式重构）。仓库：`sjh20016/inkbox`。建议分支：`analysis/g4-p0a-hydro-ablation`。候选方案：Opus R2 的 `V3_staticSeaStrict`。**结束条件：提交可复核的归因结论，绝不自行转入 P1。**

## 0. 本委托的单一目标与决定权限

在**实际浏览器产品 RAF** 中判定：将现行水文 `V0_current` 替换为 Opus R2 的严格静海 `V3_staticSeaStrict`，能否实质改善《坐天观井》标准大图的卡顿，并阐明改善来自水文 CPU、Dirty/Stage 更新还是 GPU 工作减少。

本次不是寻找全仓所有瓶颈，不优化地形、植被、渲染器，不修改游戏规则，不迁移游戏时钟，不增存档字段。最终仅给出 `GO_P1_REVIEW` / `NO_GO` / `INCONCLUSIVE` / `ENV_BLOCKED` 之一；`GO_P1_REVIEW` 表示**建议另开 P1 设计及审批**，不授权编码 P1-A、合并或改默认玩法。

研究假说（尚非事实）：R2 Node 实验中 V0→V3 水文 P50 为约 `21.23→2.87 ms`，Node 下游 Stage P50 约 `60.99→1.86 ms`；这**不等于**真实 GPU 或浏览器 RAF 的改善。V3 属于整体 `RULE_CHANGE`；不能用它与 V0 在沿海玩法的差异充当错误，也不能将其说成无语义变化的等价优化。

## 1. 输入、基线与锁定

1. 执行前在自己的 checkout 运行 `git status --short`、`git fetch origin`、`git rev-parse origin/main`，记录 `BASE_SHA`。本委托写作时核实的 main 是 `e1e55039bb56efda7a307513ede07a9fab3bf534`，**只作为参考，不得硬编码成最新基线**。若主线已移动，检查 `hydrology.js`、`terrain.js`、`main.js`、`PlaneStage.js`、`WorldRenderBridge.js` 及浏览器测试基建的变化；若水文导入/主循环/规则已经变化，标 `BASE_DRIFT` 停止，不用旧适配器强行测新代码。
2. 从干净工作树新建上述独立分支。用户未提交改动、其他 agent 分支、open PR 一概不重置、不覆盖、不合并。不能得到干净工作树时，另建干净 `git worktree`。
3. 输入附件为同包的 `G4-PERF-天地有度-R2.zip`，其中 `g4lab/lib/variants.mjs` 和 `g4lab/lib/env.mjs` 是实验依据；取出后计算 ZIP 与 `variants.mjs` 的 **SHA-256**，写入 `analysis/g4/p0a/provenance.json`。先阅读其 `docs/05...第一阶段开发任务委托书.md`、`docs/07...勘误与修订说明（R2）.md`、`g4lab/README.md`，但以**本 R2.1 委托**的范围和有效性门槛为准。若附件未出现在 Codex 工作空间、无法获取变体源，停止并以 `ENV_BLOCKED` 结案（原因标记 `INPUT_BLOCKED`），**不得自行编造 V3 算法**。
4. 既有资源优先复用：`scripts/cdp.mjs`、`scripts/inkbox-product-frame-timing.mjs`、`scripts/inkbox-render3d-m2c2d1-browser.mjs` 的相应量测/显卡核验方法，以及 `scripts/inkbox-server.mjs` 的本地服务约定。不得因便利安装 Puppeteer、Playwright、打包器或新增 `package.json` 依赖。

## 2. 文件白名单与不可越界事项

**允许新增/修改**（尽量只新增）：

- `scripts/inkbox-g4-p0a-*.mjs`（唯一实验入口、测试服务器适配、采样/核验、汇总脚本）；
- `analysis/g4/p0a/**`（R2 算法原样副本、来源摘要、JSONL/JSONL.gz 原始数据、结果索引、简短报告）；
- 本任务专用临时文件只能放 OS temp 或 Git 忽略的测试临时目录，不得进入正式产品发布目录。

**严禁修改**：`src/inkbox/**`、`inkbox.html`、`index.html`、`package.json`、`package-lock.json`、所有渲染与存档/模拟规则文件、现有性能基线数据、历史报告及其他分支；不修改默认海洋、水文、地貌、时钟、RNG，不提交用户的本地存档或个人路径。禁止改 `gitignore` 来掩饰临时文件。不得开启/关闭/合并任何 PR。

如果浏览器实验确实无法在以上白名单内成立，则先展示失败证据与最小偏离提案，**不要直接破例动产品源码**。

## 3. 实验注入设计（必须解决 R2 的 Node/Browser 不兼容）

**禁止**尝试在 DevTools 里给 `window.stepHydrology` 或 ES Module 静态 import 重新赋值：`main.js` 实际使用 `import { stepHydrology } from './sim/hydrology.js'`，这种 monkey-patch 不会可靠替换绑定。也禁止把含 `node:fs`、`child_process`、路径环境变量的 R2 `env.mjs` 直接喂给浏览器。

推荐方案为**只读测试服务器的单点请求改写**，不是更改仓库中的源码：

1. 独立 localhost 服务把仓库文件照常静态提供；仅当请求 `src/inkbox/main.js` 时，从磁盘读取该文件、**严格匹配恰好一次**原始 `./sim/hydrology.js` 静态导入，再把该导入的 URL 改到 `/__g4__/hydrology-entry.mjs`。其他 import/源码字节不变。匹配 0 次或多次、import 结构变化都应 fail closed；记录原始/响应 SHA-256 和唯一 diff。不要改变产品 RAF 更新循环中的任何行。
2. `/__g4__/hydrology-entry.mjs` 对浏览器输出签名兼容的 `stepHydrology(world,dtDays,opts)`：`V0_current` 原样委托生产 `stepHydrology`；`V1_noErosion`、`V3_staticSeaStrict` 调 R2 变体；`V9_hydrologyOff` 仅作理论下限。变体名必须严格使用 R2 规范名称，**不运行 `V2_seaSkipProto`**。
3. 从 R2 `g4lab/lib/variants.mjs` 原封复制到 `analysis/g4/p0a/reference/variants-r2.mjs`；构造浏览器版时，**只允许机械替换顶部对 `./env.mjs` 的 import**，注入从仓库原生 ES Modules 获取的 `H/T/noise/SEA_LEVEL`。其他函数体、顺序、常量一字不改。构建脚本应断言原始导入恰好一次、剩余正文散列一致，产出 source SHA-256 和浏览器转换 SHA-256。不能因为 V3 算法有瑕疵就在 P0 里顺手修复它。
4. 保留原来的 `0.16 s` 水文累计周期、单帧最多 3 步、`dtDays=4`、速度档、RNG 和渲染路径。代理若收到与预期不符的 `dtDays`，必须记录并中止有效性判定（不要默默固定为 4）。`V0_current` 应先做原生直接路径与测试路由路径的一致性自检，以避免“优化”只是替换测量基础设施。
5. `/__g4__/` 仅绑定 `127.0.0.1`，不得开放到公网，不向游戏注入有副作用的调试全局变量。只可公开只读诊断对象（例如 `window.__g4Probe`），至少包含 `variant`、`adapterSHA`、`hydroStepCount`、`hydroTotalMs`、逐帧水文步数。每次运行打印实证：**实际选中变体、调用次数、真实世界实例、V3 归一化次数**。不允许仅凭 URL 查询参数推断已成功切换。
6. `enterStaticSea()` 的一次性归一化、`flushDirty`、缓存准备必须在正式计时窗之外进行；记录初始化成本和归一化改变的格数，不隐藏语义差异。为公平归因，将 V0 和 V3 的**初始同一份世界状态**应用同样一次归一化作为主 AB 的 `T0`；另保留一条未经归一化的“原生 V0”短样本以说明产品现状。不可把不同地图、不同发展阶段的运行结果凑成 AB。

## 4. 先做正确性与注入护栏，不在无效实验上浪费 GPU 时间

- `node --check` 检查所有新增 JS；测试服务器不得返回 `node:` 导入，不存在页面 import 404、循环 import 或浏览器运行异常。
- 变体启动后在**暂停状态下的克隆世界**执行固定 `N` 个水文步（建议 N=10，明确相同 `dtDays=4`），核对 `V0_current` 代理与直接调用原函数在 `height/water/type/qi` 的逐格值一致；浮点允许的容差为 **0**，不应修改原函数调用顺序。不得用两个不同 RAF 时间窗口直接比较字节哈希来代替该 Oracle。
- R2 已提供的 `oracle.mjs`、`seaedits.mjs`、`longrun.mjs` 是**算法级先验**，只需要复跑适配基线所需的最小核验并引用完整已有数据；如果变体文件或仓库 Blob 与附件记录不一致，要补充解释或停止。不要为 P0 重写整个大坝、水文/存档长测套件。
- 固定 seed `673231`，标准世界使用 `WORLD_PRESETS.expanse`、generation v2；群岛使用 R2 指定的 fixture（若从 `bfabe00` 提取则须记录来源 SHA）。一次运行内 `renderer`、分辨率、DPR、镜头位置/LOD、世界 seed、游戏速度和事件输入脚本恒定。
- 确认 `V0`、`V1`、`V3`、`V9` 的**实际算法绑定指纹不同**，水文调用次数分别符合固定模拟步长预期（调用次数可以相同，不能据此判定变体未生效）；通过行为摘要、选用函数/适配器指纹、V3 归一化调用等交叉验证；`V9` 禁用水文**并不自动意味着产品不会重画**，它只能当下限参考，不能直接叫作“GPU 空载”。
- V3 是规则变更：不要要求沿海/通海结果与 V0 逐格相同。正确性门槛仅限“实验按定义执行，没有脚本/注入缺陷”，不据此授权玩法规则上线。

## 5. 测量设备与统一指标

**首要可验收环境**：真实硬件加速 Edge/Chrome（优先过去的 UHD 730 参考环境），开启产品默认的正常渲染路径。记录 OS、浏览器完整版本、CPU、显卡 vendor/renderer、GPU 加速判据、电源模式、是否无头、窗口大小、设备像素比、刷新率（若能可靠获取）、Git SHA、变体 SHA。使用软件渲染 SwiftShader、禁用 GPU、远程无硬件上下文或无法确认 GPU 加速时，**可收 CPU/RAF 探索数据，但不能宣称真实 GPU 结论，也不能判定 GO**。

测量需严格区分：

1. **RAF 帧间隔**（`requestAnimationFrame` 时间戳差）：P50/P95/P99；`>33.3`、`>50`、`>100`、`>200 ms` 比率。不得把它直接称为整帧 CPU 耗时。
2. **产品 CPU 阶段**：`updateMs`、`renderSubmitMs`、`hydrologyMs`。用既有性能探针思路包裹原始调用且转发恰好一次；若找不到稳定的包裹点，不制造猜测值；至少保留 RAF + 水文代理真实计时。
3. **水文相关性**：每帧 0/1/2/3 次 hydro step、各类帧耗时分布；区分非水文帧，记录抽样中 hydroStep 总数及变化格/Dirty 数（只有能够低扰动、正确读取时才收集）。
4. **GPU**：如 WebGL2 `EXT_disjoint_timer_query_webgl2` 可用，单独诊断轮报告 valid/invalid/skipped、GPU render time、显式 `disjoint` 标志。`drawCalls/triangles` 只能说明提交结构；统计 `bufferData/bufferSubData/texImage*` 的**JS→WebGL API 入参估算字节**必须标注 `estimatedJsPayloadBytes`，绝非“实际 GPU 上传字节”。GPU 不可测填 `null` 并说明，严禁凭 Node 的 43.8 MB 估算伪称真实数据。
5. 低扰动 RAF 主轮与高扰动分解/GL 诊断轮**分开测**，不得混在同一统计池。页面异常、WebGL context lost、后台标签降速或启动失败需要记录原始证据，不允许删去“不好看”的轮次。

每轮至少保留：逐帧时间戳和阶段耗时（不可取到的细项须标记 null 和原因）、实际变体/地图/渲染器、事件标签、GPU 有效性标志、所有失败与缺失；统计方法、分位数定义和样本数固定。短样本的 P99 仅作描述，不得以其作为单独显著性证明。

## 6. 严格有界的实验顺序（先最有价值的证据）

### S0 · 环境和自检（必须先过）

核实 git 基线、文件白名单、测试服务器变体映射、相同世界初态、V0 代理同函数等价、V3 启用证据和 GPU 类型。每个检查给 PASS/FAIL。失败不能进入浏览器 AB。存储所需内陆/海岸差异限制说明，不擅自重造玩法。

### S1 · 主判别：标准大图 × Three × 无人工事件（必须优先）

- 世界标准 expanse，seed `673231`，统一固定镜头、分辨率优先 `1366×768`、DPR 固定；x2 速度（若实查速度表标签不同，以实际倍数为准）；不开调试画层、不移动镜头、不操作面板。保持正常模拟和水文运行，此处“无事件”仅指不施加测试脚本洪水/雕刻。
- 以同一经过 V0 预热的规范 `T0` 世界快照初始化每段；无法可靠恢复时，用确定性创建+严格核对 `T0` 全关键层摘要的替代方案。每段独立重建/重载场景，**不得让上段运行改变下段的初态**；V3 的首次归一化排除计时。另记录这一排除处理可能对实际切换成本的影响。
- 先做 `A/A = V0/V0` 两段，分别预热 **120 RAF** + 测量 **600 RAF**，比较两段 P95 差值，目标 `≤3 ms`。有超限时只允许排查固定环境并完整重测**一次**，不得选择性剔除某轮或反复试到通过。仍未达标 → 正式状态 `INCONCLUSIVE`，原因 `INCONCLUSIVE_NOISE`。
- 再做 `ABBA = V0/V3/V3/V0`（4 段，每段 120+600 RAF）；同一浏览器/设备会话，段间重建初态；保留**各段原始数据**，分别算两组成对差，不只给拼接后的单个 P95。对照顺序不得根据结果更改。
- 最后各做 `V1_noErosion`、`V9_hydrologyOff` 各一次**短诊断轮**（可用 120+300 RAF），帮助区分侵蚀/水文贡献；它们不进入主 ABBA，也不充当产品候选。

### S2 · 真实事件归因（S1 有效后执行）

在标准 Three 上增加**一个**固定可复播的事件脚本：至少包含能真实修改世界的内陆注水/洪水事件与局部地形雕刻各一次，操作必须通过项目现有权威 `powers`/玩家调用路径或可信的测试等价入口。每个事件绑定明确逻辑步/触发条件、入参、执行前后水量/高程摘要。不要只写“已点击”。V0/V3 各测一轮 120+600 RAF，记录事件段 P95、洪水退水曲线和差异；这些是性能及规则差异证据，**不要求沿海规则等价**。事件无法可靠复播则判为 `EVENT_BLOCKED`，不以虚构事件填表。

### S3 · 扩展确认（满足 S1 有明显收益和有效环境后才跑）

选择标准 Canvas 与群岛 Three 两个补充场景，各做一次最小 `V0/V3` 配对，每段 120+600 RAF，保持地图/镜头/事件输入相同；群岛 fixture 缺失不能偷偷拿标准图顶替。若 S1 已明确不改善，直接 STOP 并分析原因，**不要展开整套分辨率 × 渲染器 × 相机矩阵**。真实 GPU 阶段诊断仅在有硬件和可用扩展时执行一个有限轮次；不重跑旧 M2-C2E 全套 GPU/视觉验收。

## 7. 结果有效性与门槛（用门槛决定下一步，不改门槛迎合数据）

- **有效性前提**：一致 `BASE_SHA`；R2 算法指纹可验；V0 adapter Oracle 等价；AB 初始世界一致；真实变体执行计数正确；主轮 600 条有效 RAF；A/A P95 差值 `≤3ms`；浏览器硬件加速判据明确；无未解释掉帧、后台降速/上下文丢失。任何关键条件不满足，则不允许报 `GO_P1_REVIEW`。
- **`GO_P1_REVIEW`**：在真实硬件 S1 两个配对中 V3 对 V0 的 P95 都改善 `≥10ms`，并且**配对改善的中位数 `≥20ms`，或 V3 最差一段 P95 `≤33.3ms`**；P99 不高于对应 V0 轮次超过 `max(3ms, V0_P99×10%)`，且 `>50ms` 帧比例不增加超过 **1 个百分点**（任一超限均须标 `INCONCLUSIVE` 并解释）；S2 未观察到未预期崩溃或测试错误。报告中同步披露 V3 的玩法规则差异，结果只批准“可申请 P1”，**不是 P1 自动开工**。
- **`NO_GO`**：A/A、硬件、初态、执行自检均有效，但 V3 主轮 P95 改善持续 `<5ms`，且 V9 下限诊断也没有显著改善，或真实阶段分析显示水文并非主要卡顿来源。若 V3 改善很小但 V9 大幅改善，应标 `INCONCLUSIVE` 并指出 V3 规则/实现仍存优化空间，而不是武断关闭所有水文方向。
- **`INCONCLUSIVE`**：介于以上阈值、结果随轮次反转、A/A 噪声偏高、P99 显著恶化、事件不可比较、变体/场景污染、数据不全等。要报告*还差哪一个最小证据*，但不在本任务自动多轮扩展实验。
- **`ENV_BLOCKED`**：实际设备或 GPU/浏览器缺失，无法得到合格真实性能结论；可交付适配器+有限 CPU 探针及明确欠缺项，不可写“通过”。

绝对体验目标 `P95≤33.3ms`、`P99≤50ms`、`>50ms≤1%` 作为独立观察，不覆盖当前既有回归预算（例如 `baseline×1.08+1.5ms`）；两类标准并列展示。统计改善与因果主张应带置信说明：600 帧的相邻样本不独立，不能把每一帧视为独立实验重复。以**成对轮次方向和幅度**为主，区间估计若无法可靠计算应说明，不假装显著性。

## 8. 交付物与提交规范

1. `scripts/inkbox-g4-p0a-*.mjs`：一条可重跑的命令（如 `node scripts/inkbox-g4-p0a-run.mjs --suite=smoke|primary|events|confirm --out=...`），支持无 GPU 情况下明确返回 blocked 状态。子参数以实际完成的脚本为准，不为满足示例捏造不存在的命令。
2. `analysis/g4/p0a/provenance.json`：仓库 SHA、附件 SHA-256、原始算法 SHA-256、转换后 SHA-256、主程序唯一 import diff、浏览器版本和设备元信息；另外存 `variant-bindings.json` 含变体/调用计数证明。
3. `analysis/g4/p0a/results/`：压缩的逐帧原始 JSONL (`*.jsonl.gz`) 或等效结构化原始数据，`manifest.json` 含每轮文件/散列/样本数/成功或失败状态。不要提交浏览器 profile、超大 trace 或无关截图；若数据超出仓库合理体积，需保留小型原始关键字段并在报告说明完整数据的本地绝对路径与不可公开的原因，**不允许仅提交汇总数字而丢弃全部原始证据**。
4. `analysis/g4/p0a/p0a-report.md`：首页必须给出 `GO_P1_REVIEW / NO_GO / INCONCLUSIVE / ENV_BLOCKED`、主轮 P95/P99、A/A 差值、主轮浏览器 GPU 真伪、是否建议 P1。正文包括每轮样本数、RAF > 阈值比例、水文帧与非水文帧、CPU/GPU 分解（缺失填 null）、事件结果、Node 与 GPU 的证据级别区别、已知规则差异、失败日志及最小下一步。
5. `analysis/g4/p0a/reproduce.md`：从 `git clone`、`npm ci`、放置 R2 附件、运行到复核一份原始记录的完整说明；不可写只能在模型私有目录中运行的硬编码路径。
6. 最小检查结果：`node --check` 对新增脚本、`npm run test:core`、实验 adapter smoke；若触及任何被禁产品文件，应视为违规，即使测试通过也不能交付“合格”。额外完整 `test:d7`、GPU M2-C2E、全部 GUI/窄屏测试**不在本包默认范围内**。
7. 使用**独立提交**存放运行器与数据/报告，给出提交 SHA、`git diff --name-status BASE_SHA...HEAD`、`git status --short`，说明没有触碰产品文件。**本任务不创建 PR，不合并**。最终回复要包含准确运行命令、证据路径、SHA、结论和阻塞项。

## 9. 执行纪律与停止条件

- 依序执行 `S0 → S1 → S2 → S3（条件触发）`，不得提前并行铺开全套测量。S0 结束和 S1 主轮结束各写一次简短检查点（结果存文件并继续，不要求用户实时批准）；如果触发阻断，保存证据后立即结束。
- 注入层 bug 最多 **两轮明确定位的修正**；每次修正要重新跑 V0 自检及 A/A，且保留失败版本和原因。超过上限视为 `INCONCLUSIVE/ENV_BLOCKED`，不要无限消耗 Codex 额度调基建。
- 对非目标热点只记一条带证据的 `RESIDUAL_HOTSPOT`，不修改代码；禁止顺手做 Terrain A2、Worker、全局活跃集、性能仪表盘、地质时钟、存档升级、UI 美化。
- 不把 R2 的沿海玩法差异改成“性能测试 bug”，不允许为跑出漂亮结果而弱化水文规则、跳过运行的权威步、改变输入、隐藏失败轮次。
- **成功交付是“可信的决定”而不是“V3 赢了”。** 即便结论为 `NO_GO` 或 `ENV_BLOCKED`，只要自检、原始证据与报告清晰可复核，仍视为正确完成本委托。不能为了显得完成任务而宣称已实施 P1。

## 10. Codex 最终答复模板

```text
G4-P0-A 完成状态：GO_P1_REVIEW / NO_GO / INCONCLUSIVE / ENV_BLOCKED
BASE_SHA / HEAD_SHA：...
环境：OS / Edge或Chrome版本 / GPU vendor+renderer / 硬件加速判据 / 分辨率 / DPR
注入真实性：R2 SHA256 ... / Browser Adapter SHA256 ... / V0 Oracle ... / V3 调用次数 ...
A/A：P95 ... vs ...，Δ ... ms（门槛 3 ms）
主 ABBA（分别四行）：V0 / V3 / V3 / V0 的 P50/P95/P99、>50 ms、hydroSteps
配对改善：pair1 ... ms、pair2 ... ms；RAF / CPU / GPU 哪一段受益
事件/Canvas/群岛：完成情况或未执行原因
规则差异与可信度：...
验收分级与下阶段建议：...（不自动开工 P1）
产物：脚本、原始证据、报告路径；commit SHA；工作树状态
未完成或环境限制：...
```

**授权边界再确认：只执行 G4-P0-A 归因与判别；不修改游戏产品源码，不切换默认水文规则，不扩张到 P1。**
