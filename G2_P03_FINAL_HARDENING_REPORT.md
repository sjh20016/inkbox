# G2-P0.3 Final Hardening Report

生成时间：2026-10-16 00:17:13 UTC  
状态截止：2026-10-16 00:17:13 UTC  
裁决：HARDENED_READY  
正式 G2 门禁：G2_PERF_BLOCKED

## 范围与同步

仓库为 sjh20016/inkbox。本地隔离工作树位于 .worktrees/g2-p03-final-local，起点是远端 codex/g2-p03-vegetation-pilot 的最新 HEAD 901844493b86969a2237c41ccc62e32a98dbdc27；测试前再次比较远端，结果 identical。产品基线 codex/g2-p1-integration-validation 为 74934a8b1360af9007c69935d5becdf8f9809872。诊断分支 analysis/g2-p03-attribution-correction 当时 HEAD 为 259b72a19fb927747bc2259efe5e1c8aa1c04939。

本地只基于 P0.3 植被候选分支建立审计工作树，没有导入 B 数值系统分支或改动其文件。原工作区的既有未提交内容未触碰。

## 源码审计与修复

### 候选引入问题：树木顺序改变未触发实例重写

VegetationLayer 先前只比较 cell → LOD 映射。真实派生路径在合格树数从 10,000 增至 10,001 时会切换排序方式；被容量截断后成员集合和 LOD 可以不变，但列表顺序会变。原判据因此可能跳过上传，让 GPU 实例顺序、renderTrees 与拾取身份脱节。

现在按两个 Map.entries() 的顺序逐项比较 cell 和 LOD。长度、成员/LOD 或次序改变都会重写；完全相同的列表仍保留候选的跳过路径。没有使用成员数或哈希代替身份顺序，也没有恢复成无条件全量重写。

V06 使用真实 deriveVegetation 和图层上传代码构造 9,999、10,000、10,001 个合格候选。派生输出数为 9,999、10,000、10,000；10,000→10,001 的场景成员集相同、顺序变化，候选现在触发重写。另覆盖容量内成员替换。逐实例矩阵/颜色、renderTrees、拾取身份和 LOD 与强制参考重建相符。

### 已修复的 water-only Stage 预存缺陷

原 PlaneStage 仅在 height、type、veg 或待处理 Region 更新时排入植被重建，漏掉单独的 waterRegion。水位能改变派生树木资格，但 Stage 不会通知 VegetationLayer。这是候选起点已有的通知缺口，不是排序改动引入的行为；本轮按授权范围在 PlaneStage 增加 waterRegion 触发，并扩展 Bridge 断言。

V08 从 World 经 WorldRenderBridge 和 PlaneStage 到 VegetationLayer，保持 height、veg、type 不变，仅让 water 跨过 0.0015 阈值。水位升高时真实树木/拾取目标移除，反向恢复时成员和实例恢复，隐藏后重显也会重建。没有留下已知未修复的 P0.3 正确性问题。

## Oracle 与模拟不变量

- V06：9,999 / 10,000 / 10,001 边界、容量上限、顺序变化、成员替换。
- V07：保存修改前成员与实例，真实修改世界高程并检查目标实例重新贴地；成员集合保持，矩阵高度与计算地表高度相符，候选与完整重建一致。
- V08：World → Bridge → PlaneStage → Vegetation 的 water-only 阈值往返、反向恢复和重显。
- V16：同种子两个正式 World 推进 5 日；序列化存档约 189,774 字节并做 save-load-save 对照。渲染更新不改 World、advanceState 或存档事实。RNG 是闭包，无法直接读取内部状态；因此没有声称检查了隐藏状态，而是对照渲染更新后的后续 16 个 Life 与 ecology/fire RNG 输出，结果匹配。

植被 oracle 14/14 通过。既有 g2pf 属性/上传范围检查 11/11 通过，确认首次完整缓冲创建、pending update range 合并及消耗后只提交有效前缀；世界事实不变。

## Edge 与实际 GPU 验证

Edge 155.0.4283.45，1440×1000，WebGL 2，GPU 启动路径开启；检测未使用 SwiftShader/llvmpipe。完整凡间画面为 200×128 世界，地形绘制索引 151,638/151,638（全图 25,273 个格面），4,966 棵树可见。

新增最终浏览器检查 7/7 通过：

1. 水位只改 water、跨阈值移除并恢复同一真实实例和地面拾取。
2. 高程变化使实例矩阵重新贴地。
3. 鼠标滚轮缩放和右键拖动平移。
4. Region 内 / 外 / 反转后，成员身份、每格矩阵/颜色和拾取映射恢复；Region 路径的 LOD 带有滞回，检查验证当前 LOD 的 renderTrees 映射正确，并逐格比较实际矩阵/颜色。
5. 六轮 Region 重建期间 GPU 资源计数稳定：6 geometries、4 textures、5 programs。
6. renderer 销毁触发植被拥有资源的 dispose 事件：4 geometry、2 material、1 texture。
7. renderer 重建回到相同的 GPU 资源平台，WebGL error 为 0。

water-only 更新期间实际记录到 6 次 bufferSubData、5,463,576 bytes；instanceMatrix 和 instanceColor 更新版本递增。该字节数是期间所有 WebGL 缓冲提交总和，不是植被独占上传量。

另运行现有 G23 Edge 浏览器检查，6 项全部通过：真实 UI 路由切换 upper/nether、Three 子地形拾取、凡间视界裁切、世界替换与销毁、重复 RAF/替换后稳定资源计数，以及无陈旧观察回调。Edge 临时 profile、浏览器子进程和本地服务器均已清理。

## 既有性能证据与正式状态

本轮没有重跑同机 ABBA 或整机帧测试。沿用阶段 B 的已有记录，并严格区分：

| 指标 | 已有结果 | 解释 |
| --- | --- | --- |
| 矩阵写入量 | baseline 240k/260k；candidate 70k/60k，约减少 74% | 确定性 CPU 工作量 |
| instance needsUpdate 次数 | 24/26 → 7/6，约减少 74% | 上传标记次数 |
| 全量重建调用 | 24/26 → 7/6，约减少 74% | 完整重建次数 |
| matrixUploadMs | 88.5/133.5 ms → 35/23.5 ms，约减少 73.6% | 既有候选采样，不等同整帧时间 |
| glUploadBytes | 28,386,304/32,115,776 → 23,066,304/20,096,832，总量约减少 28.7% | 所有 WebGL buffer 的提交，非植被独占 |
| 整帧 P95 | baseline 19.3/25.8 ms；candidate 20.7/17.1 ms | 差异小于同臂噪声，FRAME_GAIN_UNPROVEN |

因此保留局部植被降载候选，但正式状态仍为 G2_PERF_BLOCKED；这不是 G2 PERF PASS。本轮没有更改性能预算、画质、世界尺寸、树木容量或模拟/RNG/存档代码。

## 验证命令

| 命令 | 结果 |
| --- | --- |
| node scripts/inkbox-render3d-bridge.mjs | exit 0；36 项通过 |
| node scripts/inkbox-g2p03-vegetation-oracle.mjs | exit 0；14/14 |
| node scripts/inkbox-g2pf-vegetation.mjs | exit 0；11 项通过 |
| node scripts/inkbox-g2p03-final-browser.mjs | exit 0；7/7，Edge + WebGL 2 |
| node scripts/inkbox-g23-render-browser.mjs | pass=true；6 项通过，清理完成 |
| git diff --check | exit 0 |

浏览器原始运行 JSON 写入被 .gitignore 忽略的本地证据目录；提交的 g2p03-final-summary.json 保存可复核摘要和被测源码 SHA-256。浏览器截图放在系统临时目录，不作为产品资源提交。

## 版本身份

测试执行时 Git HEAD 为候选起点 901844493b86969a2237c41ccc62e32a98dbdc27，实际执行源码由随附摘要中的 SHA-256 标识。候选与诊断分支在本报告截止时间的远端 HEAD 见“范围与同步”。实现提交和 Draft PR 创建后，将把实际 SHA 与 PR URL 补入本节和机器摘要。

建议裁决：HARDENED_READY。含义仅为候选正确性证据已补足，可进入后续集成审查；正式 G2 性能门禁仍为 G2_PERF_BLOCKED。


