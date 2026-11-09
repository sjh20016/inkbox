# WX-E2P · 岁序分流隔离原型比较

基线：`#65 cda97516d4a20e258af103cd395ddff67644b793`。本分支只增加 `research/wx-e2p/` 与本报告；正式 `main.js`、`Life.step`、`advanceWorld`、默认时间规则和 v11 存档格式未改。生成的源码镜像放在忽略目录 `reports/local/wx-e2p/mirror/`，由 `build.mjs` 审核原始 `sim/life.js` SHA-256 `27b0974d922043163a7f59133e733e14b138521687e2ed091126c230e2874d8c`、`sim/advance.js` SHA-256 `09191e3b5e2340fad35014f88033d469d98b88fd8cbed04eab94d6a4f6d719b1` 后生成。实验以同一固定 `dt=0.1` 比较执行方式；固定步长相对正式浏览器变步长属于 L2，未在此证明可正式启用。

## 可复现命令

```sh
npm ci
node research/wx-e2p/build.mjs
node research/wx-e2p/check.mjs
node research/wx-e2p/browser-check.mjs
node research/wx-e2p/renderer-check.mjs
```

浏览器命令使用本仓库隔离 Edge/CDP 和自有本地服务，默认每组 10 秒，`WXE2P_DURATION_MS` 可改。两份自然凡间检查点需放在 `reports/local/wx-e2p/checkpoints/20260914-{100,400}y-save.json`。本机输入 SHA-256 分别为 `08404e6fa62c4cba154bfe03b0b116cd9eb7e835bd2cd1e69b800fc87b92ad18` 与 `d204519759a222d3fac8d5847d9f025329c9a1fa83a20e3835dfbd7ef59666bd`；来源为 WX-E0 自然检查点，非生成的控制三界历史。

## 事务与语义

P1 将受审源码复制到实验镜像，在 `Life.step` 的准备、逐实体、死亡清扫与收尾之间让出，并由实验版 `advanceWorldSlices` 包住全部剩余时钟。每一步先从**已提交世界**序列化恢复独立草稿；只有迭代器完成才替换提交世界。`snapshot()` 与取消只读已提交世界。暂停冻结新推进及草稿继续；恢复后继续，取消丢弃草稿。单个不可让出的 `stepEntity` 和收尾仍可超时，另计最大阶段时间。

P2 Worker 内调用原生同步 `advanceWorld`，主线程只接收已完成消息及只读摘要，保存由 Worker 的提交世界生成。协议携带 `sessionId`、`seq`、`worldId`、提交日期；旧会话通过终止 Worker 隔离，实验 `command` 明确拒绝非支持的神力操作。正式命簿、神力、存读档 UI 与三界操作尚未迁移。实验展示的完整发布需序列化与反序列化，成本纳入浏览器测量。

`check.mjs` 对新世界、100 年、400 年各执行一个相同的 `0.1` 日步：同步与 P1 的完整 `serializeWorld`、G8 runtime/RNG 深度相等，且让出时的 `snapshot()` 哈希保持旧提交值。结果在 `reports/local/wx-e2p/check.json`。**Worker 的完整世界/RNG 等价仍须浏览器单独对拍**；目前不得写成 L0 已通过。

## 浏览器实测

`reports/local/wx-e2p/browser/matrix.json` 是**无实际 renderer 的调度器试验**，其 `renderer` 字段仅为重复场景标签，不能作为 Canvas/Three 验收。早期 `setInterval` 调度在主线程堵塞时少提交目标日数，已在后续实际 renderer 脚本改为按绝对墙钟算目标并报告未发送积压。该原始 JSON 保留失败事实，不用于最终性能判定。

实际官方 Canvas/Three 桥接结果见 `reports/local/wx-e2p/browser/renderer-matrix.json`。Edge headless、1366×768、软件渲染，单组约 10 秒；Three `render3d.active=true`。正式游戏时钟暂停；研究驱动仅在完整提交后把反序列化世界发布给正式 renderer。每秒尝试一次发布，包含读取、反序列化、图层重绑和刷新成本；这不是完整产品接线。同步 400 年 2× 两种 renderer 的 CDP CPU profile 分别在同目录 `sync-400y-canvas-2x.cpuprofile`（232,150 字节）和 `sync-400y-3d-2x.cpuprofile`（440,889 字节）。

| 正式 renderer / 倍速 | 同步完成日 / 帧 P95 | P1 完成日 / 帧 P95 | Worker 完成日 / 帧 P95 | Worker 目标日 / 积压日 |
|---|---:|---:|---:|---:|
| Canvas 2× | 3.9 / 400 ms | 0.4 / 333 ms | 5.9 / 66.7 ms | 62.0 / 56.1 |
| Canvas 20× | 5.4 / 383 ms | 0.5 / 350 ms | 6.2 / 66.6 ms | 616.1 / 609.9 |
| Three 2× | 2.5 / 633 ms | 0.2 / 500 ms | 4.4 / 66.7 ms | 61.6 / 57.2 |
| Three 20× | 3.4 / 583 ms | 0.2 / 500 ms | 4.1 / 66.7 ms | 615.2 / 611.1 |

目标日按**实际墙钟**算，减去完成日得到总积压；其中另列未发送日，未把页面卡顿遗漏的日数当作已推进。每组结束即取消未完成实验，未暗中追赶积压。Worker 2× 主线程帧 P99 为 Canvas 383.4 ms、Three 600 ms，>50 ms 间隔分别 31/27 次。一次完整提交发布的 P95 为 Canvas 249.2 ms、Three 249.7 ms；约每秒一次完整 Worker 存档消息产生 45.8 MB/38.1 MB 通信，证明全量快照不能按帧发布。报告还记录每组的帧 P50/P99、>50ms 数量、消息字节和 `unsentDays`。输入响应 p95、峰值内存与硬件 GPU 均未测，不能标作通过。首轮过量追赶的 Canvas 结果曾产生 12.3 秒帧，失败事实保留于测试日志；随后每轮最多提交一个 0.1 日步，积压显式计入。

P1 每个 0.1 日都复制约 10 MB 成熟世界，调度器试验中 400 年样本 2× 仅完成约 2.5 日/10 秒，帧 P95 约 233 ms。它虽保住事务与单步等价，但成本和长帧明显不合格。Worker 在无 renderer 试验中约完成 12 日/10 秒，帧 P95 约 16.8 ms，但实际 renderer 发布成本使其 P95 与 P99 均超标，积压持续增长。两者均未达到建议的 400 年场景无 >50ms 长帧目标。

当前路线：**两者均不得进入正式 E2**。P1 需消除每步全量复制且证明不可让出阶段有界；Worker 需解决吞吐、积压、完整世界/RNG 浏览器对拍以及正式 UI/命令迁移。回退为不运行研究入口；正式产品文件没有修改。
