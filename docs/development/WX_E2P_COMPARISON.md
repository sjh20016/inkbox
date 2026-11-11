# WX-E2P · 岁序分流隔离原型比较

基线：`#65 cda97516d4a20e258af103cd395ddff67644b793`。本分支只增加 `research/wx-e2p/` 与本报告；正式 `main.js`、`Life.step`、`advanceWorld`、默认时间规则和 v11 存档格式未改。生成的源码镜像放在忽略目录 `reports/local/wx-e2p/mirror/`。`build.mjs` 以 #65 Git blob 的 LF 规范形态审核 `sim/life.js` SHA-256 `0d285f62b4a7d670085f6526970181fac3f4225bd6a7a84c5b55010f5048e4da`、`sim/advance.js` SHA-256 `1335246407f3bc829522800a25cd3beaa8f88c3b9d405565b518e7f9ecc2b2d0`；仅校验前把 CRLF/CR 归一为 LF，生成镜像仍使用检出的原始字节。当前 Windows 原始 SHA-256 分别为 `27b0974d922043163a7f59133e733e14b138521687e2ed091126c230e2874d8c` 和 `09191e3b5e2340fad35014f88033d469d98b88fd8cbed04eab94d6a4f6d719b1`，两种哈希都写入忽略的 `source-hashes.json`。受控纯 LF #65 副本通过构建，追加一行注释后明确拒绝；本机重建后的镜像 `life.js`/`advance.js` SHA-256 仍为 `633dfd81b6c499d5a3dab2723ec6408eab0b01f37562b4605693944071c1ba66` / `7e10b4ff6e502acd5e04bc9029a992a5280e63a530c5dfd00f709b5ee8d44b32`，与修复前逐字节相同。因此先前世界/浏览器测量的运行代码未变。实验以同一固定 `dt=0.1` 比较执行方式；固定步长相对正式浏览器变步长属于 L2，未在此证明可正式启用。

## 可复现命令

```sh
npm ci
node research/wx-e2p/build.mjs
node research/wx-e2p/check.mjs
node research/wx-e2p/worker-check.mjs
node research/wx-e2p/renderer-check.mjs
```

浏览器命令使用本仓库隔离 Edge/CDP 和自有本地服务，默认每组 10 秒，`WXE2P_DURATION_MS` 可改。两份自然凡间检查点需放在 `reports/local/wx-e2p/checkpoints/20260914-{100,400}y-save.json`。本机输入 SHA-256 分别为 `08404e6fa62c4cba154bfe03b0b116cd9eb7e835bd2cd1e69b800fc87b92ad18` 与 `d204519759a222d3fac8d5847d9f025329c9a1fa83a20e3835dfbd7ef59666bd`；来源为 WX-E0 自然检查点，非生成的控制三界历史。

## 事务与语义

P1 将受审源码复制到实验镜像，在 `Life.step` 的准备、逐实体、死亡清扫与收尾之间让出，并由实验版 `advanceWorldSlices` 包住全部剩余时钟。每一步先从**已提交世界**序列化恢复独立草稿；只有迭代器完成才替换提交世界。`snapshot()` 与取消只读已提交世界。暂停冻结新推进及草稿继续；恢复后继续，取消丢弃草稿。单个不可让出的 `stepEntity` 和收尾仍可超时，另计最大阶段时间。

P2 Worker 内调用原生同步 `advanceWorld`，主线程只接收已完成消息及只读摘要，保存由 Worker 的提交世界生成。协议携带 `sessionId`、`seq`、`worldId`、提交日期；旧会话通过终止 Worker 隔离，实验 `command` 明确拒绝非支持的神力操作。正式命簿、神力、存读档 UI 与三界操作尚未迁移。实验展示的完整发布需序列化与反序列化，成本纳入浏览器测量。

`check.mjs` 对新世界、自然 100 年、自然 400 年与**受控三界**各连续执行 `[0.1, 0.1, 0.1]` 日步，同步参照**不在步间重新读档**：12 个完成边界的完整 `serializeWorld`、G8 runtime/RNG 哈希逐步相等，且让出时的 `snapshot()` 哈希保持上次提交值。受控三界使用正式生成函数和 seed 61003，预置上界/幽冥时钟为 9.95 日以跨越 10 日边界；它不是自然三界历史。P1 故障注入在真实逐实体让出后抛错，重试、检视和存档仍只读旧提交世界。结果在 `reports/local/wx-e2p/check.json`，逐步含完整 runtime/RNG 对象、双方世界与 runtime SHA-256、首个差异字段（本次均空）。

`worker-correctness-final.json` 为真实 Edge Worker 的自然 100/400 年和受控三界连续 `[0.1, 0.1, 0.1]` 对拍，同步参照不在步间重新读档：9 个完成边界的完整世界及 runtime 哈希逐步相等，保存前后、暂停、无效天数、旧会话拒绝、取消均通过断言。报告逐步保留完整 runtime/RNG 对象、双方世界与 runtime SHA-256；第三步完整世界哈希依次为 100 年 `61e40c56…`、400 年 `255f3361…`、受控三界 `9ec74489…`。测试故意在 Worker 已把内部日期加 0.1 后抛错：对外 `committedDay` 保持 36000，检视/保存/推进拒绝，较新 session 读档恢复，旧 session 拒绝，dispose 成功。该组不是完整 UI 迁移，也不证明固定步长相对现有变步长的生态等价。首次 Worker 浏览器对拍因测试把未深拷贝的基准对象继续推进导致 `beforeEqual=false`，原始失败保留在 `worker-correctness-failed-assertion.json`；修复基准对象后重跑退出 0。

## 浏览器实测

`reports/local/wx-e2p/browser/matrix.json` 是**无实际 renderer 的调度器试验**，其 `renderer` 字段仅为重复场景标签，不能作为 Canvas/Three 验收。早期 `setInterval` 调度在主线程堵塞时少提交目标日数，已在后续实际 renderer 脚本改为按绝对墙钟算目标并报告未发送积压。该原始 JSON 保留失败事实，不用于最终性能判定。

实际官方 Canvas/Three 桥接初次结果见 `reports/local/wx-e2p/browser/renderer-matrix-exploratory.json`，因缺源码/环境哈希仅作探索证据。最终采样见 `renderer-matrix-final.json`：采样时 `HEAD=355eff72e5f1f8182c0ce43746bde1f371d34b74`、tree `07e4ce9c`、工作树有四个研究脚本/文档改动，Node `v24.11.1`、Windows、AMD Ryzen 9 8940HX。报告内逐文件记录源码/脚本和 400 年检查点 SHA-256；正式 `Life`/`advance` 哈希仍为文首所列，研究 Worker 哈希 `5d70b20d09f61db3676e1d0cf59a22a3da007397d6b3f8713ab89dd325ee75e5`。浏览器具体版本未写入该报告，不能由别的运行反填。

Edge headless、1366×768，实际 Three 的 `render3d.active=true`；硬件 GPU 状态未取证。正式游戏时钟暂停；研究驱动仅在完整提交后把反序列化世界发布给正式 renderer。每秒尝试一次发布，包含全量 Worker 消息、反序列化、图层重绑和刷新成本；这不是完整产品接线。每组设定最短 8 秒，CDP 点击/等待和主线程阻塞使实际样本约 11.9–28.0 秒。同步 400 年 2× 两种 renderer 的初次 CDP CPU profile 分别在同目录 `sync-400y-canvas-2x.cpuprofile`（232,150 字节）和 `sync-400y-3d-2x.cpuprofile`（440,889 字节），属于探索轮，不冒充最终源码的 profile。

| 正式 renderer / 倍速 | 同步完成日 / 帧 P95 | P1 完成日 / 帧 P95 | Worker 完成日 / 帧 P95 | Worker 输入点击 |
|---|---:|---:|---:|---|
| Canvas 2× | 7.5 / 300 ms | 0.6 / 316.6 ms | 未完成该组 | 检视第 4 次超 10 秒无回执 |
| Canvas 20× | 4.8 / 433.2 ms | 0.3 / 350 ms | 12.3 / 300 ms | 5 次点击 P95 1177 ms |
| Three 2× | 5.5 / 499.9 ms | 0.7 / 366.7 ms | 未完成该组 | 检视超 10 秒无回执 |
| Three 20× | 3.4 / 633.3 ms | 0 / 616.7 ms | 4.6 / 600 ms | 5 次点击 P95 1870 ms |

目标日按**实际墙钟**算，减去完成日得到总积压；其中另列未发送日，未把页面卡顿遗漏的日数当作已推进。Canvas 20× Worker 目标 969.3 日、完成 12.3 日、未发送 955.4 日；Three 20× Worker 目标 1145.4 日、完成 4.6 日、未发送 1140.7 日。P1 的已发送步积压也保留。每组结束即取消未完成实验，未暗中追赶。最终成功的 Worker 20× 两组发布 P95 为 218.7/277.9 ms，接收消息量约 106.8/114.4 MB，五次点击 P95 为 1177/1870 ms，独立 Worker inspect RPC P95 为 2002/1837 ms。Canvas 20× 与 Three 20× 的 >50ms 帧数 39/52；`performance.memory` 主线程峰值约 442/566 MB，仅为该浏览器接口的读数，不含 Worker 总内存。完整存档 `structuredClone` 的三次样本 P50 在 400 年场景约 45–107 ms。每组的精确时长、帧 P99、实际提交日、输入样本、消息量和复制/发布成本均以 JSON 原值为准。

两组 Worker 2× 在真实点击检视时超 10 秒无可见回执，不能补填其帧/吞吐指标。另一次限定 Canvas 2× 诊断在 `renderer-worker-2x-diagnostic2.json` 复现：已发送 32.2 日、完成约 18.3 日，点击处理器登记待回执 seq 256，Worker 无 JS 错误或拒绝消息，事件仍在处理较早的 seq ≤241。说明点击命中但消息队列饥饿；完整 UI 实现仍需解决命令优先级与有界队列。初次无源码 provenance 的探索结果保留；最初沙箱 Edge/CIM 启动失败的进程/配置目录归属与清理未能核实，原始工具错误文本见会话记录，不能声称该次已清理。后来成功运行的 final/diagnostic 报告各自记录 owned cleanup 完成。没有清理身份不明的进程。

P1 每个 0.1 日都复制完整成熟世界，虽然单步事务等价，实际吞吐和长帧明显不合格。Worker 的完整世界/RNG 单步等价已通过；其实际 renderer 发布成本、无界积压与 2× 输入饥饿使其也不合格。两者均未达到建议的 400 年场景无 >50ms 长帧目标。

当前路线：**两者均不得进入正式 E2**。P1 需消除每步全量复制且证明不可让出阶段有界；Worker 需解决吞吐、积压、命令饥饿、全量快照成本以及正式 UI/命令迁移。回退为不运行研究入口；正式产品文件没有修改。
