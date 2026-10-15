# G2.1 · 战斗显形恢复与收束

执行日期：2026-10-13。开发分支：`codex/g2.1-combat-hardening-integration`。

功能恢复完成；完整硬件性能预算仍未通过，保留 Draft。用户明确授权在已验证的功能基线上先接入 G2.2，两阶段均不合 main。固定历史像素、单项诊断和受控 CPU 通过不代表原生性能封板。

## 接手与恢复

开工重新获取远端并通过 GitHub 接口核对：PR #2 已合并，PR #3 已关闭且未合并。最新主线 BASE 为 `e1e55039bb56efda7a307513ede07a9fab3bf534`。本地原工作区快进到该主线；未提交文档整理和美术素材保留，原 `feat/luna-qol-pass2` 分支保留。施工在 `.worktrees/g2.1` 独立工作树进行。

G2.1 原交付为 `286706dc37ab2e2551054961d7df9c33c74a6e2d`，原 G1 父基线为 `a462632430898271e4c911c2955ff6835b9dbad2`。该父基线已经是当前 main 的祖先。按原顺序移植七个有效增量，无冲突：

| 原提交 | 恢复提交 | 内容 |
| --- | --- | --- |
| `845417d` | `d6eb661` | 真实 HP 扣减后的表现事件 |
| `b1d16ae` | `9e1571d` | 共享 Canvas Stage |
| `f0f4aa5` | `70915c3` | Three 固定实例池 |
| `b4bbb3a` | `3b5efa2` | 容量与窗口归属审计 |
| `8ef436b` | `6c9025d` | 近接墨痕可读性 |
| `c8aad3c` | `cda4435` | 真实浏览器与完整性能矩阵 |
| `286706d` | `f41021c` | 原始报告与性能失败证据 |

`2891202` 只合入已存在于 main 的方向文档，未重复移植。原 `G2_COMBAT_REPORT.md` 和旧 compact summary 保留原历史结论。

## 恢复门禁

`npm ci` 及以下命令真实退出码全部为 0。日志在 `reports/release/g2.1-hardening/proof/baseline/`，摘要在 `reports/release/g2.1-hardening/summary/recovery.json`。

| 命令 | exit code |
| --- | --- |
| `npm run test:g1` | 0 |
| `npm run test:presentation` | 0 |
| `npm run test:runtime-events` | 0 |
| `npm run test:g2` | 0 |
| `npm run test:save-equivalence` | 0 |
| `npm run build` | 0 |
| `npm run test:package` | 0 |

测试期间产品源码保持恢复版本；最后构建与包审计同时收录正在改进的性能仪器。打包按显式白名单执行，不收录外层或嵌套工作树、依赖、原始性能日志。

## 性能与验收状态

历史交付未通过两个完整 CPU 预算：原生 Canvas 大图 32 人，以及受控 Canvas 大图 2 人。它们仍是历史失败，不能用恢复 CPU 门禁代替性能验收。

本轮独立审查未发现恢复接线中的 P1/P2 功能缺陷。原预算仍为 off P95 × 1.08 + 1.5 ms，采用完整 12 项、每项 off/on/on/off、最坏 P95，所有失败均保留并导致非零退出。

恢复版本的本轮原生完整矩阵已完成 48 次运行，退出码 1。9/12 项通过，Canvas 上界视界 100 人与幽冥视界 2 人的 CPU 预算失败，3D 全图 32 人的 RAF 预算失败。原始结果在 `reports/release/g2.1-hardening/proof/performance-restored-native/`。世界、存档、推进状态、11 条随机流、容量、池身份、资源稳定及进程清理检查均通过。3D RAF 失败单独保留，不归因于 Canvas 地形热点。

恢复版本的受控完整矩阵也完成 48 次运行，退出码 1。11/12 项通过；Canvas 全图 32 人的 CPU 18.2 ms 超过 14.46 ms，保守 CPU 同样失败。所有受控地形输入、重绘帧索引与脏标记一致。独立 Canvas Trace 仅用于归因，测量帧内同线程 GC 区间去重后约 0.294–0.957 ms，未得到足以解释 CPU 长尾的 GC 根因证据；Trace 当次通过不替代完整矩阵的失败。

测量保持固定推进、一次原始 update 与一次原始 render；新增细分地形、HUD、侧栏与测量仪器开销。另以包含外部仪器成本的保守 CPU 值执行相同预算，防止移出测量开销改变验收结论。source emission 在 off/on 两侧均启用，这套矩阵衡量表现增量，不能称为相对 G1 的完整 source hook 成本。

最终冻结产品的 CPU 与正式 Canvas / Three 浏览器复验另记入 [本轮摘要](./reports/release/g2.1-hardening/summary/acceptance-summary.json)，不挪用历史浏览器结果。浏览器使用仓库 Edge / CDP：本任务 Tabbit 提权诊断仍无法连接，已记录 fallback 原因。

冻结后 `test:g1`、`test:g2`、`test:presentation`、`test:runtime-events` 和 `test:g21:terrain` 全部 exit 0；正式 Edge 的 G1 9/9、G2 12/12 通过，G2 使用 Intel UHD Graphics 730 硬件 GPU，运行时与 console errors 为 0。G1 普通沙箱第一次 CDP WebSocket 握手失败、未执行任何检查，提权后原命令通过，两次真实退出码都保留。原始截图和命令日志保留本地，服务端口已清理。

最终 `npm run build` 与 `npm run test:package` 均 exit 0：423 个文件、91 个脚本目标、104 篇 Markdown 链接审计通过。所有 proof 保留本地，Git 只归档 compact 与本阶段 8 张代表截图。

## 最终局部优化与固定像素门禁

本轮仅优化 TerrainLayer 的局部算术与缓冲区写入：混色使用 Number 标量并保留原算序；坡度读取移入陆地分支；宣纸颗粒按原式预计算 16×16 Float64 表；纸底使用同平台字节重解释后的 Uint32 fill。没有地形缓存，不改变世界值、色彩算法、刷新频率、模拟或随机流。

固定历史 RGBA 门禁覆盖三界、三个种子、两种 relief、云雾周期边界、成长阶段 0–3、实际地形数组修改、relief 切换、setWorld 与 cadence，共 324 项。默认 `npm run test:g21:terrain` 不依赖 Git 历史，进入 CI Fast 并随包出货；只有 `--historical` / `--benchmark` 才读取指定历史对象并核对源码 hash。历史 TerrainLayer SHA256 为 `c72a14a82bc5c98319ca485eeb28e74bf38c7aaca1660c365d465fd47f36a86a`；冻结候选为 `812ad914792436521dd2a791868fca7b9d83b2eb3277a0933d2a736f8a4cd3fa`。

## 全部硬件复测保留

每套完整 12 项，每项 off/on/on/off，120 预热帧、90 测量帧，DPR2、Three DPR1.5。CPU 和实际 RAF 预算保持 off 最坏 P95 ×1.08+1.5 ms；表现增量 ≤1.5 ms，每可见位面 draw 增量 ≤3。所有失败导致非零退出，没有选择最好轮次或扩大预算。

| 产品版本与时钟 | 完整通过项 | 原退出码 | 未通过 |
| --- | --- | --- | --- |
| 恢复版本 / native | 9/12 | 1 | Canvas large upper100、nether2 CPU；Three large full32 RAF |
| 恢复版本 / controlled | 11/12 | 1 | Canvas large full32 CPU |
| 标量混色 / native | 8/12 | 1 | Canvas expanse32、expanse100、large full32 和 Three expanse32 CPU；另有原 profile 清理失败 |
| 标量混色 / controlled | 12/12 预算 | 1 | 原 profile 清理失败，整体仍失败 |
| 最终三个小边界优化 / native | 7/12 | 1 | 两项 CPU、四项 RAF，见下表 |
| 最终三个小边界优化 / controlled | 11/12 | 1 | Canvas expanse100 RAF |

最新原生失败的最坏 P95（ms）：

| case | 失败指标 | on P95 | 限值 |
| --- | --- | --- | --- |
| Canvas expanse full32 | CPU / 保守 CPU | 27.3 | 26.556 |
| Canvas expanse full32 | RAF | 32.8 | 19.860 |
| Canvas large upper100 | CPU / 保守 CPU | 17.6 | 15.108 |
| Three expanse full2 | RAF | 49.9 | 37.788 |
| Three large full32 | RAF | 33.3 | 19.860 |
| Three large upper100 | RAF | 33.4 | 19.644 |

最新受控矩阵全部 12 项 raw / 保守 CPU 通过，Canvas expanse full100 RAF 为 33.5 ms，限值 19.752 ms，仍 exit 1。最终两套矩阵的自有 Edge、profile、server 清理均通过；较早标量矩阵的 profile 清理失败与后续精确清理恢复分别保留，未把原 exit 1 改成通过。

六套完整矩阵的每个 case、指标、原退出码、源码与原报告 hash 见 [compact 摘要](./reports/release/g2.1-hardening/summary/acceptance-summary.json)。完整逐帧账、PNG、Trace 和日志保留于本地 `reports/release/g2.1-hardening/proof/`，不随运行包出货。

## 归因边界与清理修复

Node 算术 ABBA 显示标量及三个小改动减少地形算术成本，但 Canvas adapter 排除了驱动上传，只用于诊断。Canvas Trace 的同线程 GC 区间去重后不足以解释原始长尾；独立 profile 确认当次算术为较大成本，仍未证明全部原生失败的根因。单项诊断当次通过不替代完整失败矩阵。

GPU query 已收窄到一次真实 `r.gpu.render`，disjoint 时丢弃全部 pending query；上传字节和 draw calls 独立记录。该 interval 仍是 inclusive WebGL render，不能当 FX shader 的独占成本。较早包围整个 `k.render` 的诊断包含 update / CPU 空闲，原数据保留并标明旧范围。最新独立 Three 诊断 off/on GPU P95 约 12.39–13.03 / 12.87–12.95 ms，固定三批 calls 10→13，当次未复现单侧 RAF 失败；不因此消除完整矩阵风险。

自有进程退出与合法 Temp profile 删除增加有界等待和重试，超时仍失败并保留证据。共享 CDP `browser.close` 的既有同步 taskkill 属于本轮范围之外，因此不声称整条平台清理绝对有界。

## 用户批准的阶段顺序

用户已明确选择先接入 G2.2，并保留 Draft 性能风险。G2.2 在本阶段功能基线上接真实气血、养伤、交手近讯和正式保留历史；区分当前模拟事实、短命表现与可靠历史，不增永久战斗历史、不凭 FX 消失断胜负，不改变战斗、RNG 或存档。G2.1 性能封板仍待完整硬件预算通过。
