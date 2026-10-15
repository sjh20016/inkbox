# 坐天观井 Inkbox G2-P0.2 性能专项收束与集成准备报告

最终证据清单完成时间：2026-10-15T12:13:40.526Z。性能状态：**PERF ATTRIBUTED/BLOCKED（按原矩阵实录）**；ECO：**ECO PASS**。

## 范围与判读

本轮只记录两个分支在最终实测 HEAD 上的性能和集成证据。正式预算未修改：`baseline p95 × 1.08 + 1.5 ms`；每行 Off/On 为两次重复的最坏 P95，不挑最好轮次。Native 与 Controlled、前台与 headless、renderer、case、ABBA run 分开记录。16.7/33.3/50 ms 是绝对流畅性分析参考，不是发布门禁。CPU 与相邻 native interval 的相关性仅作诊断，绝不能解释为 GPU 时间。

基线为 `e071e832e78857fc9de84cf6af2ca78764717330`；实测性能 HEAD `984efdd21bb4b74ba53ab5301f2d63e2a3c6b56e`、P1 HEAD `1a36e1bcc5d20b787bacebc98d30b72df45fc70c`。性能树 src 文件 SHA 与基线一致。测试使用 Edge `155.0.4283.45`、AMD Radeon 610M / driver `32.0.13050.18`、DPR 1、headless viewport 1500×940；P1 覆盖 1500×940、1366×768、1280×720、960×800、680×720 两个 renderer。

## 完整 12 场景矩阵

### Native (exit 1)

| # | Renderer / preset / view / count | CPU off/on/limit (ms) | Conservative CPU off/on/limit | Complete CPU off/on/limit | RAF off/on/limit | Case / task exit |
|---:|---|---|---|---|---|---|
| 0 | canvas expanse full 2 | 16.10 / 12.40 / 18.89 | 16.10 / 12.50 / 18.89 | 16.10 / 12.50 / 18.89 | 11.90 / 11.10 / 14.35 | PASS / 1 |
| 1 | canvas expanse full 32 | 25.60 / 18.20 / 29.15 | 25.60 / 18.20 / 29.15 | 25.60 / 18.30 / 29.15 | 22.30 / 16.70 / 25.58 | PASS / 1 |
| 2 | canvas expanse full 100 | 25.80 / 26.80 / 29.36 | 25.80 / 26.90 / 29.36 | 25.80 / 26.90 / 29.36 | 27.90 / 22.30 / 31.63 | PASS / 1 |
| 3 | canvas large full 32 | 17.80 / 18.80 / 20.72 | 17.90 / 18.90 / 20.83 | 17.90 / 19.00 / 20.83 | 16.70 / 16.80 / 19.54 | PASS / 1 |
| 4 | canvas large upper 100 | 9.50 / 14.20 / 11.76 | 9.50 / 14.20 / 11.76 | 9.50 / 14.20 / 11.76 | 5.70 / 11.20 / 7.66 | FAIL / 1 |
| 5 | canvas large nether 2 | 17.00 / 17.20 / 19.86 | 17.00 / 17.20 / 19.86 | 17.00 / 17.20 / 19.86 | 17.00 / 22.20 / 19.86 | FAIL / 1 |
| 6 | 3d expanse full 2 | 26.10 / 38.70 / 29.69 | 26.20 / 38.80 / 29.80 | 26.20 / 38.90 / 29.80 | 33.50 / 50.10 / 37.68 | FAIL / 1 |
| 7 | 3d expanse full 32 | 33.90 / 31.10 / 38.11 | 33.90 / 31.10 / 38.11 | 33.90 / 31.10 / 38.11 | 44.40 / 39.00 / 49.45 | PASS / 1 |
| 8 | 3d expanse full 100 | 29.50 / 14.00 / 33.36 | 29.50 / 14.10 / 33.36 | 29.60 / 14.10 / 33.47 | 33.50 / 22.40 / 37.68 | PASS / 1 |
| 9 | 3d large full 32 | 8.10 / 7.80 / 10.25 | 8.20 / 7.80 / 10.36 | 8.20 / 7.80 / 10.36 | 22.20 / 16.80 / 25.48 | PASS / 1 |
| 10 | 3d large upper 100 | 10.90 / 9.30 / 13.27 | 10.90 / 9.30 / 13.27 | 10.90 / 9.30 / 13.27 | 16.80 / 16.80 / 19.64 | PASS / 1 |
| 11 | 3d large nether 2 | 9.20 / 8.10 / 11.44 | 9.20 / 8.10 / 11.44 | 9.20 / 8.10 / 11.44 | 16.80 / 16.80 / 19.64 | PASS / 1 |
### Controlled (exit 1)

| # | Renderer / preset / view / count | CPU off/on/limit (ms) | Conservative CPU off/on/limit | Complete CPU off/on/limit | RAF off/on/limit | Case / task exit |
|---:|---|---|---|---|---|---|
| 0 | canvas expanse full 2 | 17.70 / 13.50 / 20.62 | 17.70 / 13.50 / 20.62 | 17.70 / 13.50 / 20.62 | 16.70 / 11.20 / 19.54 | PASS / 1 |
| 1 | canvas expanse full 32 | 20.00 / 14.80 / 23.10 | 20.00 / 14.80 / 23.10 | 20.00 / 14.80 / 23.10 | 22.10 / 11.20 / 25.37 | PASS / 1 |
| 2 | canvas expanse full 100 | 20.40 / 21.00 / 23.53 | 20.40 / 21.00 / 23.53 | 20.50 / 21.00 / 23.64 | 16.80 / 21.90 / 19.64 | FAIL / 1 |
| 3 | canvas large full 32 | 18.00 / 10.70 / 20.94 | 18.00 / 10.70 / 20.94 | 18.00 / 10.80 / 20.94 | 16.70 / 11.10 / 19.54 | PASS / 1 |
| 4 | canvas large upper 100 | 24.50 / 14.40 / 27.96 | 24.50 / 14.40 / 27.96 | 24.50 / 14.40 / 27.96 | 22.70 / 11.20 / 26.02 | PASS / 1 |
| 5 | canvas large nether 2 | 17.30 / 20.80 / 20.18 | 17.30 / 20.80 / 20.18 | 17.40 / 20.80 / 20.29 | 16.70 / 22.30 / 19.54 | FAIL / 1 |
| 6 | 3d expanse full 2 | 19.10 / 22.90 / 22.13 | 19.20 / 23.00 / 22.24 | 19.20 / 23.00 / 22.24 | 33.50 / 22.30 / 37.68 | FAIL / 1 |
| 7 | 3d expanse full 32 | 30.50 / 13.40 / 34.44 | 30.50 / 13.40 / 34.44 | 30.60 / 13.40 / 34.55 | 33.50 / 22.30 / 37.68 | PASS / 1 |
| 8 | 3d expanse full 100 | 17.40 / 43.30 / 20.29 | 17.40 / 43.30 / 20.29 | 17.60 / 43.30 / 20.51 | 28.00 / 50.10 / 31.74 | FAIL / 1 |
| 9 | 3d large full 32 | 26.80 / 20.60 / 30.44 | 26.80 / 20.70 / 30.44 | 26.90 / 20.70 / 30.55 | 28.00 / 27.80 / 31.74 | PASS / 1 |
| 10 | 3d large upper 100 | 27.70 / 9.70 / 31.42 | 27.70 / 9.70 / 31.42 | 27.70 / 9.70 / 31.42 | 33.70 / 16.70 / 37.90 | PASS / 1 |
| 11 | 3d large nether 2 | 20.60 / 32.40 / 23.75 | 20.60 / 32.40 / 23.75 | 20.70 / 32.50 / 23.86 | 27.80 / 44.60 / 31.52 | FAIL / 1 |

## 绝对流畅性观察

以下代表性行保留各自报告、case、mode、run、surface 与时钟身份；离线分析覆盖 136 个独立 run，summary 只保存代表行。有效帧为长帧比例分母；百分位使用线性插值。实际 GPU query 只列有效样本。完整 run 指标和分析 JSON 位于 ignored proof/fluency-analysis，不进入最终 summary 的逐帧账本。

| Report / case | Renderer / scenario | Surface / clock / mode / run | RAF P50/P95/P99/max ms | >16.7 / 33.3 / 50 ms (n valid; %) | Complete CPU P95 / max ms | GPU query valid n / P95 ms |
|---|---|---|---|---|---|---|
| native-matrix #0 | canvas/unspecified full | headless/native/on/run1 | 5.60/11.10/11.81/16.70 | 1/90; 1.1% / 0/90; 0.0% / 0/90; 0.0% | 12.41 / 16.50 | 0 / n/a |
| native-matrix #6 | 3d/unspecified full | headless/native/on/run1 | 22.35/50.10/56.29/61.10 | 65/90; 72.2% / 24/90; 26.7% / 8/90; 8.9% | 38.41 / 45.20 | 0 / n/a |
| controlled-matrix #0 | canvas/unspecified full | headless/controlled/on/run1 | 5.60/11.20/11.21/11.30 | 0/90; 0.0% / 0/90; 0.0% / 0/90; 0.0% | 12.95 / 15.30 | 0 / n/a |
| controlled-matrix #6 | 3d/unspecified full | headless/controlled/on/run1 | 16.70/22.30/34.01/38.90 | 28/90; 31.1% / 3/90; 3.3% / 0/90; 0.0% | 22.32 / 35.00 | 0 / n/a |
| whole-fluency #0 | canvas/normal full | headless/native/on/run1 | 5.60/14.17/28.52/33.50 | 4/90; 4.4% / 1/90; 1.1% / 0/90; 0.0% | 16.84 / 35.70 | 0 / n/a |
| whole-fluency #5 | 3d/normal full | headless/native/on/run1 | 16.70/22.30/22.41/22.50 | 34/90; 37.8% / 0/90; 0.0% / 0/90; 0.0% | 13.62 / 16.60 | 0 / n/a |
| foreground-canvas #2 | canvas/unspecified full | foreground/native/on/run1 | 5.60/22.26/27.71/27.80 | 10/90; 11.1% / 0/90; 0.0% / 0/90; 0.0% | 24.56 / 30.30 | 0 / n/a |
| three-trace #9 | 3d/unspecified full | headless/controlled/on/run1 | 11.10/16.70/16.80/16.80 | 5/90; 5.6% / 0/90; 0.0% / 0/90; 0.0% | 8.83 / 12.90 | 90 / 9.15 |

RAF/native callback interval 只描述显示回调间隔。同步 WebGL submission 是 CPU command-submit 时间；异步 GPU query 只来自仪器给出的有效 timer-query 样本。CPU 与后一帧 interval 的相邻关联是描述性诊断，不能替代 GPU 测量。Three trace case 9 是带 profiler/trace 扰动的诊断：四轮 CPU P95 为 8.7/9.1/10.2/10.1 ms，RAF P95 均 16.7 ms，有效 GPU query P95 为 9.08996/9.16888/9.2784/9.11176 ms（EXT 支持）；它不替代正式门禁，也不代表排他 GPU 成本。

### 普通、高密度与地形变化对照

以下为独立整机诊断的两次 On（ABBA run 1 / 2），逐轮并列，保持相同 headless/native 口径；不据此改变原门禁。

| Renderer / scenario / case | RAF P95 ms (run1 / 2) | 最大帧 ms | >33.3 ms 比例 | 连续 >33.3 ms 最长帧数 | Complete CPU P95 ms |
|---|---|---|---|---|---|
| canvas / normal #0 | 14.17 / 11.10 | 33.50 / 16.70 | 1.11% / 0.00% | 1 / 0 | 16.84 / 11.88 |
| canvas / dense #1 | 16.66 / 13.73 | 22.30 / 33.40 | 0.00% / 1.11% | 0 / 1 | 13.62 / 16.38 |
| canvas / environment #3 | 11.20 / 11.10 | 16.70 / 11.20 | 0.00% / 0.00% | 0 / 0 | 15.45 / 12.49 |
| canvas / environment-changing #4 | 16.70 / 11.26 | 27.90 / 16.70 | 0.00% / 0.00% | 0 / 0 | 18.22 / 15.21 |
| 3d / normal #5 | 22.30 / 39.07 | 22.50 / 50.20 | 0.00% / 8.89% | 0 / 1 | 13.62 / 38.15 |
| 3d / dense #6 | 22.20 / 19.77 | 27.80 / 22.40 | 0.00% / 0.00% | 0 / 0 | 13.85 / 16.36 |
| 3d / environment #8 | 22.26 / 22.35 | 38.90 / 55.60 | 2.22% / 3.33% | 1 / 1 | 15.36 / 21.24 |
| 3d / environment-changing #9 | 16.80 / 19.82 | 22.30 / 33.40 | 0.00% / 1.11% | 0 / 1 | 12.75 / 15.19 |

产品源码未保留本轮性能候选，因此不能宣称实际游玩卡顿已明显减轻。Three 正式 Native case6 仍达最坏 RAF P95 50.1ms，Controlled case8 为50.1ms；普通、高密度与环境变化诊断的轮间差异见表，不能把相对预算通过等同稳定60FPS。完整 P50/P99、16.7/33.3/50ms比例、连续长帧分布和CPU提交统计见摘要及其链接的离线分析；GPU query仅见独立Trace诊断。

## 候选与回滚账本

| 候选 | 结论与证据 |
|---|---|
| 上游植被 342895f | 已由 13cac80/3749343 回滚；本地无原始前后数值，不补造原因或收益。 |
| Canvas d23c899 | 已由 13cac80/3749343 回滚；本地无原始前后数值，不补造原因或收益。 |
| Bridge 94cae10b2d71 | 完整五层扫描的 oracle 差分 127 项及原有 36 项均通过（无差异）；controlled case9 On CPU worst P95 8.90→10.50 ms；case10 On RAF P95 22.20→27.80 ms，后测越过原预算。已撤销；无可靠整体提速结论。 |

最终保留 Bridge 源 SHA-256：5f129c7de32bbde2529f65f9025b27ba5e557e202e04d2831c44061b1a848cb1。候选未并入；数值 B 分支没有 fetch 或合入。性能源身份：984efdd21bb4b74ba53ab5301f2d63e2a3c6b56e；P1 源身份：1a36e1bcc5d20b787bacebc98d30b72df45fc70c。集成 PR #8 保持 Draft；不自动合流，也不改写 main 或历史 PR。

候选假说与文件：植被 `VegetationLayer.js` 复用完全相同的树矩阵，Canvas `terrainLayer.js` 仅复制变化输入快照，Bridge `WorldRenderBridge.js` 改为分层完整扫描以简化热循环。前两项原始前后数值本地缺失，不能证明收益；Bridge 保留直接数组写入检测，其前后源 SHA-256 分别为上列保留源和候选 `94cae10b2d714783d682d7aae07db1690fd66deabffd5e217ea259fa258d8f1f`。

## 集成校验与验证限制

本地定向门禁覆盖 RGBA 324、cache 294、ecology 16、Bridge 36 项；Bridge 候选的 127 项 oracle 差分检查通过（无差异），候选因性能不可靠已撤销。world/save/advanceState 与 11-stream RNG 等价检查通过。
42 条本地 CPU gate manifest 命令 exit 0；45/45 项 G1/G2/G22/G23 浏览器检查、P1 两组各 10 项以及 600/600 生命周期 render 调用和 6000/6000 RAF soak 均通过；生命周期资源失败 0，首 GPU 使用时 geometry 从 28 增至 32（库存内冻结内容）。这些不是远端 CI。G2-P0 与正式 G2.3 的既有摘要分别判定 ECO PASS。早期失败、局部诊断和修复均保留；three-realms 单条日志被 verifier 重复运行覆盖，manifest 原始 161817 ms 仍在，重复通过的 191400 ms 不作为独立验收。旧真实玩家存档样本仍缺。

## 慢帧归因与前台有效性

失败 case 5（Canvas large/nether2）与 case 6（Three expanse/full2）的 16 轮 ABBA 最慢五帧都与真实工作事件同帧：Canvas 每轮 5/5 慢帧均有 terrain rebake，Three 每轮 5/5 均有标记 vegetation buffer upload。它们是相关证据，不是排他因果。Three Native 上传轮帧数为 11/14/12/10；Controlled 每轮固定在 [6,16,26,35,45,55,65,75,84] 九帧。相同排程下 On/Off CPU P95 仍为 case 6 22.9/12.4 ms、case 5 20.8/11.0 ms；Canvas Controlled 四轮 27 次 plane rebake 不变，Native 为 14/15/15/14。Native schedule 差异不能单独解释漂移；不把预算失败归因环境噪声，也不宣称提速。5% 慢帧假说没有被完整证实，实际各事件比例均超过 5%。

前台 Canvas 任务虽四轮 `document.hasFocus()`/visible 都为真且无可信输入，但 OS 开始证据指向 `explorer.exe` 任务栏窗口（top=1019、height=48、owned=false）；结束证据才确认 owned Edge 正常 1500×940 窗口。故 `foregroundVerified=false`，其 RAF P95 27.7 ms 超过原预算 25.584 ms；该数据无效于正式前台验收，也不并入 headless。电源方案为 Balanced，节流状态未知。

### 可核对原始 proof

- `g2-p02-performance-resolution/reports/release/g2p02/proof/final-run/commands.json` — SHA-256 `683894a03c3fdb35715f56ed5a628af874f4e4446d872887aa1518dbce202987`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/final-run/native-matrix/metrics.json` — SHA-256 `43ca3ad8dec98baa8792fb49454794ec7f01f5c0b2cef6bdbf94a7704809149d`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/final-run/controlled-matrix/metrics.json` — SHA-256 `1ff1377d4948ee4b6f2da763bcecff23f1fd388db96af0bca6741e89ba7fb5ed`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/final-run/p1-viewport/p1-browser.json` — SHA-256 `ca97554c022bed71d997de895a7c37a813079cfcfce7b15064a7b6d715c3f9b4`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/final-run/p1-loop/p1-loop-browser.json` — SHA-256 `0554f4b1829396812ca7af6ff73501e9bd3953daa562d782697acea88e9d7170`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/cpu-gates/commands.json` — SHA-256 `688cae18882dfd690b6aff9b1347d34f7a22abb64eeb2dca50445cd760c124e1`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/bridge-before-controlled/metrics.json` — SHA-256 `6269135301d7295acc377f7e16fb4350e4b737ebae609e5d57431b788b5e693c`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/bridge-after-controlled/metrics.json` — SHA-256 `6c3cdd92b9af4fe58c49f42ad8ce9d24800be05eb89eee626e45915079c08cde`
- `g2-p02-performance-resolution/reports/release/g2p0/summary/acceptance-summary.json` — SHA-256 `889976d165b1c32ff40d377609e595f5198e85efad85d8a4ada12b185f199fd9`
- `g2-p02-performance-resolution/reports/release/g2.3-aftermath/summary/acceptance-summary.json` — SHA-256 `d2d5930d4618f76a257966a9f79fc71111dd1b02f8fdbc5f20b47c14624dc11f`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/fluency-analysis/nativematrix/fluency-analysis.json` — SHA-256 `b4ca0020cb48d3191a0185b429215c8f873ddd9aedd8ea7e5115e05ae58bddb7`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/fluency-analysis/controlledmatrix/fluency-analysis.json` — SHA-256 `16ac208933d43c733941048bd98687f840d86e3c56d12be11661d5326280acba`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/final-run/whole-fluency/metrics.json` — SHA-256 `b96c545f02a7b8df8efa3805097799f8aedcaf84f76124036fe8de619e43a1e2`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/fluency-analysis/wholefluency/fluency-analysis.json` — SHA-256 `3285e6c2d105cb2188999e08af545aee9ddc22f0c1e740822d04db0289297f08`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/final-run/foreground-canvas/metrics.json` — SHA-256 `9b6e5f564827ba1483852be2463c5ea15006fc2c6eb898d60e918d9d20b95d88`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/fluency-analysis/foregroundcanvas/fluency-analysis.json` — SHA-256 `b51735aeb8afecb6c4fcfc0244a5b2a174d85172fb8a407cb41c125dc913a70f`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/final-run/three-trace/metrics.json` — SHA-256 `00de7485516598724534c7c7d8ff6b4cdee6fcbed78011e2cdac38ec2bc333ef`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/fluency-analysis/threetrace/fluency-analysis.json` — SHA-256 `50f6d04657b3eb51ef84320335f7b9887bbd8cdd7d38d4a47845c3cf25678bad`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/final-run/g1-browser/g1-browser.json` — SHA-256 `a3fb7dd611b1cf41f08bd188ebc154398b7ea05ce88301c166e2c2a6f91c783b`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/final-run/g2-browser/g2-browser.json` — SHA-256 `9b27c03083e667bef2f9cb27f692a1f14fffe6786f6d2d58ed7fa2a7d3698f6e`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/final-run/g22-browser/g22-browser.json` — SHA-256 `96b91e300506936b37b0223baa0ca36c44d3434d661fd979263c534f604714d5`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/final-run/g23-browser/g23-browser.json` — SHA-256 `1c05d0b3efe34deccfe0dbfa817a578f61d4ddd67e6489386aa39d156054bf1d`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/final-run/g23-render-browser/g23-render-browser.json` — SHA-256 `b9c65e327efec3f7d9ad88f6a4dbfcf31842affac630717dac9862cf9008309e`
- `g2-p02-performance-resolution/reports/release/g2p02/proof/final-run/resource-soak/lifecycle-soak.json` — SHA-256 `f77d8f0c84dacd94a063be946f4fe2c05e132835b9cc06d6f1f868c30df5e3f1`
- `g2-p02-performance-resolution/reports/release/render3d-m2c2b0/summary/lifecycle-soak.json` — SHA-256 `2c2bac3e574d742fb00d00fc562eaf2652f11630a41cf570c00651299e90ed5e`
- `g2-p1-integration-validation/reports/release/render3d-m2c2b0/summary/lifecycle-soak.json` — SHA-256 `2c2bac3e574d742fb00d00fc562eaf2652f11630a41cf570c00651299e90ed5e`

交付 PR：[性能 #11](https://github.com/sjh20016/inkbox/pull/11)，base 为 G2-P0 最终分支；[P1 #12](https://github.com/sjh20016/inkbox/pull/12)，base 为本性能分支。最终交付 HEAD 以两个 PR 的 head SHA 及本报告所在提交为准，PR 描述记录最终 SHA；上述实测 SHA 不随文档提交变更。两者均为 Draft，不建议正式合入 main。

## 运行包

本地 `npm run build` 和 `npm run test:package` 均 exit 0，463 个文件；逐帧数据、Trace、临时 profile 和 release 截图未进入运行包。构建与审计日志 SHA 记录于 compact summary；交付内容仅补报告、摘要与打包元数据后重新打包，不重复 GPU 验收。
