# G4-P0-A R2.1 真实浏览器实验报告

**最终裁断：GO_P1_REVIEW。** 在本机 AMD Radeon 610M 硬件加速 Edge 中，标准大图 Three 主轮的两组成对 V0→V3 RAF P95 分别降低 27.9 ms 和 33.3 ms，中位改善 30.6 ms；A/A P95 差值为 0.1 ms。V3 的 P99 和 `>50 ms` 比例均未恶化。S2 权威注水/雕刻事件通过，按门槛触发的 S3 Canvas、群岛 Three 和 GPU 诊断也完成。该结论只建议另开 P1 设计评审，不授权编码、合并或切换默认水文规则。

## 基线、环境与注入真实性

- 产品基线是执行时最新的 `origin/main`：`e1e55039bb56efda7a307513ede07a9fab3bf534`；实验工作树从该基线创建。正式采样时的 runner HEAD 为 `e045c1f1ba217ca90ab9e1c2e1e894f146a272b0`。之后的 `515a2edd4789c4cd3e8c6ab3c0ee80dcacb31add` 只修正 baseline / runner 元数据标记及 S2 完成后的状态标签，不改采样或计时逻辑。远端 `main` 在开测前复核仍为该 SHA。
- Windows `10.0.26200` x64，AMD Ryzen 9 8940HX（32 逻辑线程），有窗口 Edge `155.0.4283.45`，Node `v24.11.1`。请求和实测 CSS 视口、visual viewport、CDP layout viewport 均为 `1366×768`、DPR `1`；45 份 viewport 检查全部通过。Three 活动画布 backing 为 `952×625`，CSS rect 为 `952×625.5`。
- 实际产品 WebGL2 renderer 为 `ANGLE (AMD Radeon(TM) 610M, Direct3D11)`；SystemInfo WebGL 为 enabled，产品与系统双重硬件判据 PASS，WebGL timer query 扩展可用。机器上虽枚举到 RTX 5060 Laptop GPU，但本实验实际使用的是 AMD 610M。未使用无头模式或禁用 GPU。刷新率未可靠读取，记为 null；电源模式保留在 provenance 原始记录中。
- 附件 ZIP SHA-256：`f7f99fdf50e36f590c328d730aad49e507815260e8a40e1a08bd96efe52efe43`；R2 variants SHA-256：`22aa5b602a7e151235afafa763eeab1221334eb2b4dbe8ffa0990ee82a36e44b`。浏览器转换 SHA-256：`13fc2bc8a39d5c65ab21e9611fca45e8d1fe49b29cbf525d0dd8d91e86a9aad8`；转换前后算法正文 SHA-256 相同：`2d0bb19456e40ff41dcfa9fb6df363e3359b6012e03e9d949fcd824f8d46a79f`。
- 本地只读测试服务器仅将 `main.js` 第 39 行 hydrology import 路由到代理；主文件原始 SHA-256 为 `2fec345c01204259ded904f026ac9223575b0bacc064e7ced8073e216d9447a4`，服务响应 SHA-256、代理源码/响应 SHA-256 及单行 diff 见 `results/formal-02/provenance.json`。V0 暂停克隆 Oracle 10 步、`dtDays=4`、容差 0；`height/water/type/qi` 四层差异均为 0。实际绑定指纹为 V0 `0c8ad05b`、V1 `7595ba28`、V3 `0aa2d3f0`、V9 `5c07877d`；真实产品世界调用数与水文计数相符，V3 归一化调用与水文调用一致，无代理错误。
- 每段使用 seed `673231`、generation v2、相同确定性 T0；水文预热 30 步、共享一次归一化、dirty/cache 准备均在测量外。标准大图为 `expanse`；速度由产品 `TIME.speeds` 查找实际 `mult=2` 项后设置；三种规则的 renderer、镜头、分辨率、DPR 和轮次顺序固定。生产源码、游戏规则、渲染、存档文件均未修改。

## S0—S3 状态

| 阶段 | 结果 | 证据 |
|---|---|---|
| S0 环境与自检 | PASS | GPU/视口、V0 原生直连一致性、暂停克隆 Oracle、T0、变体指纹和实际调用计数均通过；正式 native V0 描述样本 120 帧 |
| S1 主判别 | PASS | A/A 与固定 ABBA 均通过；600 帧/段；两组成对 P95 改善超过 10 ms，配对中位数超过 20 ms，P99 与 `>50 ms` 门槛通过 |
| S2 事件归因 | PASS | V0/V3 各 600 帧；权威 `powers.addWater` 与 `powers.sculpt` 均真实改变世界；无产品或页面错误 |
| S3 扩展确认 | PASS | Canvas 和群岛 Three 各一对 600 帧；V0/V3 GPU 查询诊断各 300 帧，300 个查询均有效、无 disjoint、跳过或未完成结果 |

`formal-02/manifest.json` 中的 21 个 run 全部 PASS，共保留 8,616 条实测帧：正式 S1–S3 及短诊断 8,400 帧、原生 V0 描述 120 帧、S0 绑定 smoke 96 帧。短诊断和 S0 smoke 不并入主 ABBA。每条压缩 JSONL 和解压内容均由 stats 工具重新校验 SHA-256 与样本数。

## S1 主结果

A/A 为 V0/V0，各采 120 帧预热加 600 帧测量。P95 为 `44.5 / 44.6 ms`，差值 `0.1 ms`，低于 3 ms 噪声上限；无需重试。

| ABBA 顺序 | 变体 | 帧数 | RAF P50 / P95 / P99 (ms) | `>33.3 / >50 / >100 / >200 ms` | 含水文步帧 |
|---|---|---:|---|---|---:|
| 1 | V0_current | 600 | 5.6 / 39.1 / 50.1 | 6.17% / 2.00% / 0% / 0% | 37 |
| 2 | V3_staticSeaStrict | 600 | 5.6 / 11.2 / 14.2 | 0% / 0% / 0% / 0% | 29 |
| 3 | V3_staticSeaStrict | 600 | 5.6 / 11.2 / 16.7 | 0% / 0% / 0% / 0% | 29 |
| 4 | V0_current | 600 | 5.6 / 44.5 / 55.6 | 6.00% / 3.33% / 0% / 0% | 36 |

按既定配对顺序，V0−V3 的 P95 改善为 `27.9 ms` 与 `33.3 ms`，配对中位数 `30.6 ms`；最差一段 V3 P95 为 `11.2 ms`。两组 V3 P99 分别比配对 V0 低 `35.9 ms` 和 `38.9 ms`；`>50 ms` 帧比例也分别下降 2.00 和 3.33 个百分点。V3 两段满足绝对观察目标 P95≤33.3 ms、P99≤50 ms、`>50 ms≤1%`；V0 两段均未满足前两项且 `>50 ms` 超过 1%。这组结果满足 R2.1 的 `GO_P1_REVIEW` 门槛。

RAF 间隔是相邻 `requestAnimationFrame` 时间戳差，不是整帧 CPU 时间。按同帧产品水文计数分组后，V0 两段的 `>33.3 ms` 长间隔落在零水文步帧；V0 的零水文步帧 RAF P95 为约 `44.4/44.5 ms`，V3 为 `11.2/11.2 ms`。因此，不能把全部 RAF 改善简单归因于水文调用本身。适配器在实际含水文步的帧上测得 hydrology P95：V0 `10.9/12.8 ms`，V3 `1.8/2.7 ms`，显示水文 CPU 单步确有明显降低。

## S2 事件和退水记录

两个变体均在实测水文步 15 通过 `powers.addWater` 注入 `0.10` 水量、半径 6；同一 21 格远岸点的 441 格摘要由水量 `0` 增至 `3.17986`、湿格数从 `0` 增至 `97`。水文步 25 通过 `powers.sculpt` 以 `+0.026`、半径 5 抬升局部地形；高程摘要从 `161.85070` 增至 `162.34647`。调用路径、触发步数、参数及前后摘要均写在各自 JSONL completion 记录中。

注水后水量摘要在步 20/25/30 依次为 `2.45131 / 1.75897 / 1.12370`；V0 另外记录到步 35 为 `0.56767`。两组事件轮各 600 帧，RAF P95 为 V0 `44.5 ms`、V3 `16.6 ms`。V3 在固定 600 帧结束时达到测量步 32，因此退水曲线只报告到实际记录的步 30；未补造步 35 数据。

第一轮 `formal-01` 被完整保留，但未纳入最终判定：旧脚本把雕刻安排在步 35，V3 在 600 帧内只达到步 32，因此其 V3 事件有效性检查正确地失败。失败 raw 证明注水已发生、没有产品异常。根据该实测窗口限制，将权威雕刻触发点固定为步 25，保持 120+600 RAF 不变后完整重跑全部阶段；修复理由见 `results/formal-01/s2-event-diagnosis.json`。这不是删帧或选择性排除失败样本。

## S3 扩展结果与性能归因

| 场景 | V0 P50/P95/P99 (ms) | V3 P50/P95/P99 (ms) | V0→V3 RAF P95 |
|---|---|---|---:|
| Canvas 标准图，各 600 帧 | 5.6 / 16.8 / 27.8 | 5.6 / 11.2 / 16.7 | −5.6 ms |
| Three 群岛，各 600 帧 | 5.6 / 44.6 / 61.2 | 11.1 / 11.2 / 16.8 | −33.4 ms |

硬件 WebGL timer query 诊断单独采 300 帧/变体，不与 S1 混池。V0/V3 的 GPU 时间 P50/P95/P99 分别为 `7.52/16.61/19.40 ms` 与 `6.64/7.61/8.00 ms`。查询各 300 个有效，无 invalid、skipped、unresolved 或 disjoint。相同诊断中的产品 `renderSubmitMs` P95 为 `36.3/9.7 ms`，Stage update P95 为 `25.6/8.9 ms`，Stage render P95 为 `8.7/0.9 ms`；这些额外包装诊断可能扰动计时，只作分项支持，不与主轮合并。整体证据支持水文 CPU、Dirty/Stage 更新和 GPU 渲染工作都下降，但不能精确把 S1 RAF 改善拆成互斥的因果份额。

Node R2 先验数据仍只是算法级先验，不当作本次浏览器结果。`V9_hydrologyOff` 仍走正常产品更新/渲染，不是 GPU 空载。没有与该设备、协议匹配的已批准性能回归基线，所以 `baseline×1.08+1.5ms` 评价为 null；不声称该项通过。600 帧相邻样本不是独立实验重复，本报告依赖 A/A 门槛和两组固定配对幅度，不把帧数当作显著性或置信区间。

## 规则边界与交付

V3 `staticSeaStrict` 是整体 `RULE_CHANGE`，不是语义等价优化：静海吸收陆地来水、入海泥沙与热力传播会改变；本次只证明在列出的标准图及补充场景中有性能价值，不裁定沿海玩法是否可接受，也不授权默认规则上线。下一步仅是独立 P1 设计/产品评审，不能由本结果直接开工。

- 正式命令：`node scripts/inkbox-g4-p0a-run.mjs --suite=all '--r2-zip=G4-PERF-天地有度-R2.zip' --out=analysis/g4/p0a/results/formal-02`。
- 最终有效样本及 provenance：`analysis/g4/p0a/results/formal-02/`；最初 S0-R 与失败轮次保留于 `results/s0r-recovery-*/`、`results/attempt-*/`、`results/formal-01/`。
- 测试修复提交：事件触发窗 `e045c1f1ba217ca90ab9e1c2e1e894f146a272b0`；纯元数据修复 `515a2edd4789c4cd3e8c6ab3c0ee80dcacb31add`。证据与本报告单独提交，最终证据提交 SHA 由分支 HEAD 确认；`delivery.json` 将其标识为本交付提交。
- `node --check`、`npm run test:core`、适配器 smoke、正式 S0—S3 和 stats 原始记录复核均通过。`results/formal-02/verification.json` 保存最终检查索引。
- 受保护产品目录相对 BASE 无差异；没有创建 PR、合并、修改产品规则或进入 P1。此前启动失败、S0-R 诊断、`formal-01` 事件触发失败和最终 `formal-02` 成功结果全部留存。
