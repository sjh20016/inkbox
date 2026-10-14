# G2-P0 性能与真实生态交付 · 2026-10-14

**PERF BLOCKED / ECO PASS。** Native 完整矩阵 **10/12、exit 1**，Controlled 完整矩阵 **10/12、exit 1**。修复真实生态缺陷并降低部分 Canvas 地形计算成本，但不满足解除整体性能阻塞的条件。建议 PR #8 继续 Draft，单独审查本轮增量，不执行最终合流。

## 工程身份与范围

- BASE_SHA：`9a04236950c9f458382f4c2b4b0ed1b1f9cbe353`，已从远端确认的 `integrate/g2-release-candidate`。
- 实现 HEAD_SHA：`823a38c978e4735b5d22362a26dab740077e6afa`；15 个实现文件的 Git blob SHA 与规范化 SHA256 见 compact summary，文档/证据提交在其后。
- 施工分支：`codex/g2-p0-performance-ecology`；目标增量 PR 的 base 为集成候选。最终 HEAD_SHA 由本轮 PR 的 `head.sha` 和 PR 正文固定记录；本报告属于文档提交，不将自己的提交 SHA 嵌入自身。
- 测量时 Git HEAD 为 BASE，测试的是工作区修改；下列两份产品文件的 SHA256 在全部最终 CPU、硬件矩阵、浏览器和耐久运行中保持一致。上传后实现 commit 与这些文件逐字匹配（Git 行尾规范化另行记录）。
- main 接手时为 `e1e55039bb56efda7a307513ede07a9fab3bf534`。PR #4 → #5 → #6 → #7 → #8 均为 Open Draft；具体 head/base 在 compact summary 中记录。没有改写它们或并入 B 分支。
- 原工作区的委托书与既有 `.g23-worktree` 保留；本轮在 `.g2-p0-worktree` 完成。

| 产品文件 | 实际测试工作文件 SHA256 |
|---|---|
| `src/inkbox/render/terrainLayer.js` | `326b5fd6c6cc99ad0068791161781aafdc724624e862cbbe4f903184549948e2` |
| `src/inkbox/sim/ecology.js` | `30c743d5b5c4160a684100a97fb81dac6886e793113b173a6525ce0e372cd0c0` |

| 实现 commit | 内容 | 文件 |
|---|---|---|
| [0015f0df6f47](https://github.com/sjh20016/inkbox/commit/0015f0df6f47ec88d6b3e3a5f7de634027ea3fa4) | perf(g2): add focused foreground attribution and reliable CDP cleanup | scripts/cdp.mjs, scripts/_m1-viewshot.mjs, scripts/inkbox-g2-performance.mjs, scripts/inkbox-g2p0-environment.mjs |
| [a26fdcfb1b7a](https://github.com/sjh20016/inkbox/commit/a26fdcfb1b7a4243800d0fdd03899dc7011a4560) | perf(g2): cache verified static terrain color prefix | src/inkbox/render/terrainLayer.js, scripts/inkbox-g2p0-terrain-cache.mjs |
| [9be89c0e5d62](https://github.com/sjh20016/inkbox/commit/9be89c0e5d62ee5928a539d96028ee36585b411e) | fix(g23): correct authority ecology updates and protect real consequences | src/inkbox/sim/ecology.js, scripts/inkbox-g2p0-ecology.mjs |
| [823a38c978e4](https://github.com/sjh20016/inkbox/commit/823a38c978e4735b5d22362a26dab740077e6afa) | test(g2p0): wire targeted gates and clean release artifacts | .github/workflows/ci.yml, .gitignore, package.json, scripts/inkbox-package.mjs, scripts/inkbox-package-audit.mjs, README.md, HANDOFF.md |

修改范围：Canvas 静态陆地颜色缓存及其失效回归；正式 ecology 通知、水域植被、焦土派生刷新与火势残值；Edge 前台取证、同步快照和可信输入污染记录；自有 Temp profile 的有界清理与失败退出码；`test:g2p0`、CI Fast、发布白名单、README/HANDOFF、报告和两份精简 JSON。旧 M1 探针只保留已有非零退出码，避免覆盖共享 CDP 清理失败。

## 环境与测量契约

Node `v24.11.1`，npm `11.6.2`，Edge `155.0.4283.45`，Three `0.186.1`。实际渲染器是 **AMD Radeon 610M / ANGLE D3D11**，驱动 `32.0.13050.18`；系统另列出 RTX 5060 Laptop GPU，但没有切换设备。**历史 Intel H 环境在本机不可复现**，本轮 H 是当前 AMD 硬件无头 Edge，不能直接解释为历史 Intel 的进步或退步。

正式 viewport 1500×940，Canvas DPR 2、Three DPR 1.5；seed 673231；完整 12 场景分别执行 Native 与 Controlled。每轮 120 warm + 90 measured，顺序 Off/On/On/Off，双方均保留正式模拟、来源、角色、全部三界与默认资产。所有相对预算仍为 **On 最不利 P95 ≤ Off 最不利 P95 × 1.08 + 1.5ms**；保留 addon、调用数、池身份、资源、World/save/advance/11 RNG、错误与清理断言。Trace 与诊断不代替发布验收。

最终 F 串行对照记录 Windows 前台 HWND/PID、独立且逐字匹配的 Temp profile、可见非最小化窗口、文档逐帧焦点/可见性和可信输入事件。两端均验证为自有 Edge；四轮每轮 90 帧均 focused/visible，输入数为 0，World/save/advance/11 RNG 一致。显示器逻辑边界 1707×1067、工作区 1707×1019；电源方案为平衡。实际刷新率、像素遮挡及有效节流仍未知，不能据此宣称没有节能或合成等待。

先前 PID 父子链判断失败、其他全屏程序占前台、浏览器工作与 F 重叠，以及真实画布点击污染的运行均保留。点击会走正式抬山工具与 reactToTool 的主随机流；用户停止点击/连点后重复的权威快照一致。该证据支持输入污染解释，旧未记录输入的那次漂移不被改写为已证明的产品随机 bug。

## 成本归因与有限优化

Canvas 独立 Trace 的地形算术 P95，四轮从 **60.9 / 54 / 76 / 75.5ms** 变为 **37.9 / 28.9 / 26.7 / 28.6ms**；putImageData P95 仍约 **0.2–0.6ms**。Profiler 的主要叶样本落在 TerrainLayer.render / mixCellRgb，修复后缓存准备仍有成本。这证明地形颜色计算是可优化的 CPU 成本；Trace 改变执行节奏，不能把这些数值视作无扰动发布收益。

有限优化仅缓存云雾前的静态 LAND 颜色前缀，保存 Float64 计算结果；每次原有重绘仍扫描输入，height/water 变化失效邻域，其余颜色输入失效本格，palette、relief、World、访问边界变化均正确处理。水面、动画云雾、灵气、火势、去饱和与最终提交照旧；不写 World、不抽模拟 RNG，不改变重绘 cadence。原 324 组 RGBA 金样本未重生成，全部通过；新增 294 个实时失效/冷渲染对比通过。缓存在第一次实际绘制时才分配，每个 512×320 位面额外约 7.2 MiB，Three 只构造 TerrainLayer 时不会分配这组缓存。

Three Controlled case9 独立 Trace：四轮 WorldRenderBridge 扫描 P95 **5.2 / 4.6 / 7.5 / 7.7ms**，植被更新 **31.5 / 33.6 / 32.9 / 29.9ms**，同步 WebGL 提交 **3.1 / 4.5 / 3.4 / 3.2ms**；有效 GPU query P95 **11.727 / 11.814 / 11.240 / 10.741ms**，每轮 90 个有效样本、无 disjoint。包含区间不能相加；GPU query 包含命令间隔，不是专属 shader/FX 成本。保留现有植被逻辑，没有为了全绿降低刷新频率或增加模拟预算。

RAF 本行是到达当前回调的间隔，当前 CPU 可能影响下一回调；不能把本行二者简单相减后全部归入 GPU。本轮证据显示地形算术、桥扫描/植被、真实 GPU 区间和环境长尾同时存在，仍未将全部 RAF 超限归入单一原因。

### 优化前后关键场景

下表逐轮保留所有样本，单位 ms。H 前/后是隔离的原模拟与缓存候选（后者曾为 eager 分配候选，最终改为 lazy；热缓存结果只作诊断），F 是匹配仪器的原产品与最终产品。各自 ABBA 的最终预算使用两轮最不利 P95，不选择最快一轮。完整预算及原始数据 SHA256 见 [compact summary](reports/release/g2p0/summary/acceptance-summary.json)。

| 运行 | 场景与 ABBA 轮次 | CPU P50 / P95 | 完整 wrapper P95 | RAF P50 / P95 |
|---|---|---:|---:|---:|
| baseline-h-native | full100 1-off | 7.6 / 84.8 | 84.9 | 13.1 / 91.1 |
| baseline-h-native | full100 2-on | 6.1 / 57.2 | 57.2 | 12.6 / 59.7 |
| baseline-h-native | full100 3-on | 5.7 / 54 | 54 | 12.6 / 56.1 |
| baseline-h-native | full100 4-off | 2.6 / 30.2 | 30.2 | 12.9 / 27.3 |
| baseline-h-native | upper100 1-off | 4.9 / 34 | 34 | 11.2 / 33.7 |
| baseline-h-native | upper100 2-on | 7.6 / 56.2 | 56.4 | 16.9 / 58 |
| baseline-h-native | upper100 3-on | 7.5 / 64 | 64.1 | 16.7 / 66.9 |
| baseline-h-native | upper100 4-off | 5.6 / 48.7 | 48.8 | 11.2 / 50 |
| baseline-h-native | full2 1-off | 1.7 / 62.2 | 62.2 | 5.6 / 61.1 |
| baseline-h-native | full2 2-on | 1.9 / 51.5 | 51.6 | 5.6 / 50 |
| baseline-h-native | full2 3-on | 2.4 / 64.7 | 64.8 | 5.6 / 66.8 |
| baseline-h-native | full2 4-off | 1.1 / 19 | 19 | 5.6 / 16.7 |
| cache-h-native | full100 1-off | 2.6 / 18.4 | 18.4 | 5.6 / 22.2 |
| cache-h-native | full100 2-on | 3 / 24.8 | 24.9 | 5.6 / 22.4 |
| cache-h-native | full100 3-on | 2 / 14.4 | 14.4 | 5.6 / 11.1 |
| cache-h-native | full100 4-off | 2 / 13.3 | 13.3 | 5.6 / 11.1 |
| cache-h-native | upper100 1-off | 2.5 / 12 | 12 | 5.6 / 11.2 |
| cache-h-native | upper100 2-on | 2.4 / 12 | 12 | 5.6 / 11.3 |
| cache-h-native | upper100 3-on | 2.3 / 10.6 | 10.7 | 5.6 / 11.1 |
| cache-h-native | upper100 4-off | 2.6 / 14.5 | 14.5 | 5.6 / 16.2 |
| cache-h-native | full2 1-off | 0.9 / 12.4 | 12.4 | 5.6 / 11.1 |
| cache-h-native | full2 2-on | 1.4 / 27.8 | 27.9 | 5.6 / 27.8 |
| cache-h-native | full2 3-on | 1.1 / 12.7 | 12.7 | 5.6 / 11.2 |
| cache-h-native | full2 4-off | 1.3 / 15.3 | 15.3 | 5.6 / 11.2 |
| quiet-confirmed-baseline-f | full100 1-off | 5.7 / 50.8 | 50.9 | 11.9 / 53.3 |
| quiet-confirmed-baseline-f | full100 2-on | 5.7 / 49.4 | 49.4 | 12.2 / 50.3 |
| quiet-confirmed-baseline-f | full100 3-on | 6.3 / 53.1 | 53.1 | 12.5 / 51.2 |
| quiet-confirmed-baseline-f | full100 4-off | 7.2 / 55.1 | 55.1 | 12.2 / 58.9 |
| quiet-confirmed-final-f | full100 1-off | 5.6 / 48.1 | 48.1 | 11.9 / 47.6 |
| quiet-confirmed-final-f | full100 2-on | 6.3 / 47.9 | 47.9 | 11.9 / 53.3 |
| quiet-confirmed-final-f | full100 3-on | 5.3 / 37.6 | 37.7 | 13.4 / 41.9 |
| quiet-confirmed-final-f | full100 4-off | 6.4 / 48.3 | 48.3 | 12.1 / 47.2 |

F 原产品 Off/On CPU 最不利 P95 为 55.1/53.1ms；最终产品为 48.3/47.9ms。最终 F CPU 与 wrapper 预算通过，**RAF 53.3ms > 52.908ms，exit 1**。P50 改善有限，时序仍波动，不宣称稳定 60fps。

### 最终完整硬件矩阵

每格为 Off P95 / On P95 / 上限（ms）；实际比较使用未舍入数值。Native 与 Controlled 各 12 场景、48 次运行，均无选择子集、无 Trace、无诊断模式。完整矩阵之后只改证据采样/清理脚本，产品源码保持不变；最终 F 与 Three Trace 使用最后采样代码。矩阵正确性、池/资源、错误与清理检查均通过，下面的性能失败保持非零退出。

| 模式 | 场景 | CPU | 完整 wrapper | RAF | 结果 |
|---|---|---:|---:|---:|---|
| Native | Canvas 512×320 full2 | 28.9 / 34.9 / 32.712 | 29 / 35 / 32.82 | 32.8 / 35.4 / 36.924 | FAIL |
| Native | Canvas 512×320 full32 | 37.3 / 50.5 / 41.784 | 37.3 / 50.6 / 41.784 | 44.2 / 57.3 / 49.236 | FAIL |
| Native | Canvas 512×320 full100 | 55.8 / 60.9 / 61.764 | 55.9 / 61.1 / 61.872 | 64.8 / 69.7 / 71.484 | PASS |
| Native | Canvas 384×240 full32 | 35.8 / 35.3 / 40.164 | 35.9 / 35.4 / 40.272 | 37.5 / 36.5 / 42 | PASS |
| Native | Canvas 384×240 upper100 | 39.2 / 43.2 / 43.836 | 39.2 / 43.4 / 43.836 | 42.5 / 46.9 / 47.4 | PASS |
| Native | Canvas 384×240 nether2 | 31.2 / 17.8 / 35.196 | 31.2 / 17.9 / 35.196 | 34.2 / 23.9 / 38.436 | PASS |
| Native | Three 512×320 full2 | 85.5 / 78.6 / 93.84 | 85.6 / 78.6 / 93.948 | 90.8 / 80.3 / 99.564 | PASS |
| Native | Three 512×320 full32 | 72.7 / 50.5 / 80.016 | 72.7 / 50.8 / 80.016 | 73.5 / 55.9 / 80.88 | PASS |
| Native | Three 512×320 full100 | 57.1 / 62.9 / 63.168 | 57.2 / 63 / 63.276 | 57.6 / 61.5 / 63.708 | PASS |
| Native | Three 384×240 full32 | 39.4 / 37.2 / 44.052 | 39.4 / 37.3 / 44.052 | 45.5 / 45.8 / 50.64 | PASS |
| Native | Three 384×240 upper100 | 44.6 / 44 / 49.668 | 44.7 / 44 / 49.776 | 49.1 / 48.5 / 54.528 | PASS |
| Native | Three 384×240 nether2 | 51.2 / 45.5 / 56.796 | 51.5 / 45.7 / 57.12 | 54.6 / 50.8 / 60.468 | PASS |
| Controlled | Canvas 512×320 full2 | 58 / 37 / 64.14 | 58 / 37.2 / 64.14 | 56.3 / 40.9 / 62.304 | PASS |
| Controlled | Canvas 512×320 full32 | 73.2 / 77.3 / 80.556 | 73.2 / 77.4 / 80.556 | 77.8 / 78 / 85.524 | PASS |
| Controlled | Canvas 512×320 full100 | 56.7 / 60.1 / 62.736 | 56.8 / 60.2 / 62.844 | 59.6 / 60.3 / 65.868 | PASS |
| Controlled | Canvas 384×240 full32 | 42.2 / 30.4 / 47.076 | 42.3 / 30.5 / 47.184 | 42.2 / 37.3 / 47.076 | PASS |
| Controlled | Canvas 384×240 upper100 | 48.8 / 37.4 / 54.204 | 49 / 37.5 / 54.42 | 48.8 / 41.7 / 54.204 | PASS |
| Controlled | Canvas 384×240 nether2 | 48.2 / 40.5 / 53.556 | 48.3 / 40.6 / 53.664 | 49.7 / 45.9 / 55.176 | PASS |
| Controlled | Three 512×320 full2 | 89.2 / 56.7 / 97.836 | 89.4 / 56.9 / 98.052 | 93.8 / 63.9 / 102.804 | PASS |
| Controlled | Three 512×320 full32 | 74.5 / 64.4 / 81.96 | 74.6 / 64.5 / 82.068 | 81.3 / 71 / 89.304 | PASS |
| Controlled | Three 512×320 full100 | 67.6 / 71.3 / 74.508 | 67.8 / 71.4 / 74.724 | 74.3 / 77.5 / 81.744 | PASS |
| Controlled | Three 384×240 full32 | 40.7 / 53.9 / 45.456 | 40.8 / 54.1 / 45.564 | 46.3 / 57 / 51.504 | FAIL |
| Controlled | Three 384×240 upper100 | 42 / 45.8 / 46.86 | 42 / 45.9 / 46.86 | 44 / 56.2 / 49.02 | FAIL |
| Controlled | Three 384×240 nether2 | 41.9 / 43 / 46.752 | 41.9 / 43 / 46.752 | 46.8 / 47 / 52.044 | PASS |

Native 最大 CPU/RAF 达 138.7/139.1ms，Controlled 达 146.6/158ms。相对预算通过的场景仍包含绝对长帧，不能据此宣称该硬件实时稳定。

## 真实生态结果

修复前独立短局五项失败（exit 1），原日志为本地 `proof/ecology-pre-fix.txt`；修复后 16 项真实 World 因果检查通过，完整轨迹见 [ecology.json](reports/release/g2p0/summary/ecology.json)。

| 缺陷/既有机制 | 处理与权威效果 |
|---|---|
| 高程较高的有水格仍可生草 | 正式 stepVegetation 同样使用现有 water > .0015 判断，清除水格植被，不改变速率 |
| 海岸/岩地植被变动未通知 | 记录真实变化并 world.touch，使观察/派生消费得到新版本 |
| 焦土恢复每格重算邻域 | 使用已有 markDirty/flushDirty，仅刷新实际改格的 type 与 qi；没有引入新脏系统 |
| 0 < fire ≤ .01 残留永久停滞 | 在原活动阈值下清零权威残值，并保护同一火步刚传播到该格的新火；不新增传播或 RNG 调用 |
| 火边界、湿地/燃料、Life 与村落、时钟 | 保持正式既有机制，用边角/1×1、湿干地、生命损伤与建村准入回归证明 |

正式 fire 每 .8 游戏日、vegetation 每 5 游戏日；main 的 overlay 衰减每 2.5 真实秒，调用形状为 decayAccum + 900。它们是独立时钟。长局使用 500 次 .8 游戏日与合成 .05 真实秒输入，每 50 次调用 decayOverlay(902.5)；这是 CPU 因果复验，**不是实际 RAF 或帧率测试**。

固定种子真实森林 + Life.spawn/foundVillage：初始植被 .850606 → 0 → .2153；真实活跃火最多 5 格，20 游戏日时灭火；焦土/灰烬经过既有恢复链，400 日时覆盖层为 NONE、type 为 7、qi 为 .52。村落 HP 100 → 97.264 → 100，最终 22 个实体、1 村存活。相同输入完整重放逐值相同；观察和 Three bridge 只读不改变 World/RNG，凡间生态未污染上界/幽冥。

当前 schema 存读档及合成 legacy-v1 兼容通过，未改 schema 或固定数组布局。扫描原工作区与既有 G2.3 worktree 的报告目录未找到真实历史玩家档样本；因此真实旧档验证不可用，不把合成档写成真实旧档。

Canvas 与 Three 的正式工具/恢复/视界切换已经分别通过 G2.3 浏览器 10 项与渲染浏览器 6 项，真实 World 改动与绘制消费同时验证，不用截图替代生态因果。

## 实际回归与原始失败

以下均为本机运行。上传后 CI 是否执行/通过由 PR checks 提供，不能将本地运行当作 CI。

| 命令 | exit | 耗时 |
|---|---:|---:|
| `npm run test:core` | 0 | 5.671s |
| `npm run test:regression` | 0 | 1.4s |
| `npm run test:three-realms` | 0 | 196.462s |
| `npm run test:save-equivalence` | 0 | 214.544s |
| `npm run test:presentation` | 0 | 1.867s |
| `npm run test:view` | 0 | 3.249s |
| `npm run test:g1` | 0 | 8.128s |
| `npm run test:g2` | 0 | 4.104s |
| `npm run test:g22` | 0 | 3.639s |
| `npm run test:g23` | 0 | 2.768s |
| `npm run test:g21:terrain` | 0 | 7.158s |
| `npm run test:render3d:bridge` | 0 | 2.235s |
| `npm run test:g2pf:instrumentation` | 0 | 1.365s |
| `npm run test:g2pf:vegetation` | 0 | 2.075s |
| `npm run test:g2p0` | 0 | 2.303s |
| `npm run test:vendor` | 0 | 1.163s |
| `node scripts/inkbox-g22-browser.mjs` | 0 | 11.354s |
| `node scripts/inkbox-g23-browser.mjs` | 0 | 22.858s |
| `node scripts/inkbox-g23-render-browser.mjs` | 0 | 30.903s |
| `node scripts/inkbox-g2-browser.mjs` | 0 | 28.022s |
| `node scripts/inkbox-g2-performance.mjs`（case9、Controlled、Trace 诊断） | 0 | 103.644s |
| `npm run test:g2pf:instrumentation` | 0 | 0.972s |
| `npm run test:g2p0` | 0 | 1.863s |
| `npm run test:g23:browser` | 0 | 57.274s |
| `cleanup-failure-probe` | 1 | 3.384s |
| `npm run build` | 0 | 8.725s |
| `npm run test:package` | 0 | 0.691s |

关键规模：presentation 127 项、view 123 项、历史 RGBA 324、新缓存 294、新生态长局 16；G2.3 原有 CPU 分组 8 + 11 + 6。其余按各正式脚本原始结论记录，没有虚构统一总数。

cleanup-failure-probe 是本地模拟自有 profile 被锁的负向检查，**预期 exit 1**；实际观察到 1，并在恢复真实删除函数后移除该检查刚创建的自有目录。它验证清理失败不能以成功退出，避免 close() 抛错中断调用者其余 finally 清理；不是一次实际生态失败。

本机浏览器累计通过 G1 9 + G2 12 + G2.2 8 + G2.3 10 + G2.3-render 6 = **45 项**。G2 刀光 ROI 早期两次为 0 像素；独立默认 framebuffer 诊断与最后原正式脚本分别通过，未改 shader、资产、TTL 或 4 像素门槛，原失败保留为波动风险，不能将一次通过解释为已定位修复。G2.2/G2.3 早期功能通过但 profile 未清掉，exit 1；有界自有 profile 清理后串行命令均 exit 0。

600 生命周期 + 6000 RAF 的现有整机耐久 exit 0，真实火灾、人物/近讯/环境观察均参与；资源失败为空，首用的预建 geometry 身份账本通过，listener 111 → 111，GPU geometry 28 → 33 为五个预建资源首次提交，程序/texture 有界。附加 warm/expiry/setup 帧和 GC 后 heap 增量记录在本地原报告；这不是 Native 性能验收，也不意味着新增 TypedArray 缓存没有内存成本。

全部大 Trace/Profile/逐帧 JSON、截图、第一次失败与诊断脚本在本地忽略目录 `reports/release/g2p0/proof`。Git/包仅保留本报告、必要可复现脚本和 compact summary + ecology 两份白名单 JSON；compact summary ≤256 KiB，含原始文件 SHA256。不会打包 proof、临时源码或工作树。

## 剩余阻塞与合流建议

性能仍有正式超限与绝对长帧，历史 Intel 环境无法在本机复现。最低下一步是在原 Intel 硬件或固定低负载硬件按原预算复核完整矩阵，并分别跟踪 Canvas 算术、Three 植被与主线程/合成边界；不从当前数据推出单一 GPU 原因。

保留 3D 首次短命刀光像素检查的波动风险和真实旧档样本缺失。新增静态缓存有明确外部内存成本，后续硬件验证应继续观察资源与内存。

**建议：生态修复可独立评审，PR #8 保持 Draft。** 本轮增量 PR 对准集成候选；不自动合并 main、不关闭历史 PR，不把当前性能状态标记为 PASS。
