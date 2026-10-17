# 仓库开发工作流与 RG-P1 审计

**RG-P2 · 2026-10-17 补充：**本页除这条补充外记录 RG-P1 当时的盘点结果，不作为当前删除清单。RG-P2 从 PR #18 叠加分支执行：旧根目录阶段报告、委托书与 160 份 release 证据已改从 [清理前固定提交](https://github.com/sjh20016/inkbox/tree/e1e55039bb56efda7a307513ede07a9fab3bf534) 追溯；当前工作树的 reports/ 默认忽略，发布包不再携带 release JSON。新增工作以 AGENTS、README 和实际 CI 为准，不误将本页旧“待授权任务”当作现行状态。


核查日期：2026-10-16（Asia/Shanghai）。正式 main 基线为 `e1e55039bb56efda7a307513ede07a9fab3bf534`，[G1 PR #2](https://github.com/sjh20016/inkbox/pull/2) 已于 2026-10-12 合并，正式产品为 M2-C2E + G1。

[Draft PR #12](https://github.com/sjh20016/inkbox/pull/12) HEAD `74934a8b1360af9007c69935d5becdf8f9809872`：Canvas / Three 的 P1 玩家闭环 READY，G2 性能仍 BLOCKED，尚未合入 main；#12 已继承 #10，不重复合并。G3 #17 PCC Observer 成本超限，A1-1 BLOCKED，未进入 A1-2。B2 数值研究为无共同 Git 祖先的独立实验，不是正式产品参数。

接手先核对远端 SHA / PR / Actions，再阅读 [开发工作流与审计](../../docs/development/REPOSITORY_WORKFLOW.md)、[路线图](../../ROADMAP.md)、[未完成事项](../../BACKLOG.md)、[测试入口](../../tests/README.md)。从任务指定基线建隔离 worktree；不覆盖现有研究工作区和未提交材料。G1 契约见 [集成报告](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/G1_INTEGRATION_REPORT.md)。

风险：H2/H3/G3 Fast Gate 失败，Heavy 通过不能覆盖失败；P1 READY 不代表 G2 性能封板。STATUS 与下方旧日期交接仅作历史证据，不是当前施工授权；不执行旧交接中的工作区改名 / 恢复指令。

## 核查方法与差异

先只读核查 Git / GitHub REST / Actions jobs / 对应源报告，阅读 package.json、workflows、tests/README、打包器与 .gitignore，再做文档整理。委托书主要 SHA 均未变化。本地初始 #11 / #12 remote-tracking 陈旧，fetch refspec 仅覆盖部分分支；显式获取全部 heads 后按实际远端审计，未改 fetch 配置或 prune。gh 未安装，使用 Git 与公开 GitHub REST API。

核查命令：git ls-remote --heads origin、git for-each-ref、git merge-base、git merge-base --is-ancestor；REST pulls?state=all&per_page=100、各 SHA 的 actions/runs?head_sha=... 与具体 run 的 jobs。下面 CI 选择该分支当前 SHA 最近 run，没有用旧成功覆盖当前失败。

## 分支与当前 SHA 的 CI

19 个现存远端分支如下。除 B 外，所有非 main 分支的 merge-base 均为 main 完整基线 SHA，main 为其祖先，研究 HEAD 均未成为 main 祖先。main 最新 run 是 Nightly，不等于候选已合并。

| 分支 | 真实 HEAD | PR / 分类 | 当前 SHA 最近 run |
| --- | --- | --- | --- |
| `B数值系统` | `bcb9582371e369b8e64a78a862c1fbeceb13b9e0` | 独立 B2（无共同祖先） | [failure](https://github.com/sjh20016/inkbox/actions/runs/38707410416) |
| `analysis/g2-h2-runtime-hydrology-attribution-luna` | `a5ea45bb7e87af65c1001abf6a023e615266688d` | 性能归因研究（无 PR） | [failure](https://github.com/sjh20016/inkbox/actions/runs/38838415870) |
| `analysis/g2-p03-attribution-correction` | `259b72a19fb927747bc2259efe5e1c8aa1c04939` | 性能归因研究（无 PR） | [success](https://github.com/sjh20016/inkbox/actions/runs/38762807651) |
| `audit/g2-p03-vegetation-hardening-luna` | `4960f88d6256d63a82c0172bb052c62ae5acb1f3` | [#13](https://github.com/sjh20016/inkbox/pull/13) 性能研究 | [failure](https://github.com/sjh20016/inkbox/actions/runs/38829392875) |
| `codex/g2-h21-evidence-closure-luna` | `8831d5ecae72146c51efc8157c7eb2d8e308c5d4` | [#14](https://github.com/sjh20016/inkbox/pull/14) 性能研究 | [failure](https://github.com/sjh20016/inkbox/actions/runs/38847570490) |
| `codex/g2-h3-terrain-color-pilot-luna` | `bfabe00e3c0865721e5c426c4915a1f879498714` | [#15](https://github.com/sjh20016/inkbox/pull/15) 性能研究 | [failure](https://github.com/sjh20016/inkbox/actions/runs/38849649608) |
| `codex/g2-p0-performance-ecology` | `e071e832e78857fc9de84cf6af2ca78764717330` | [#9](https://github.com/sjh20016/inkbox/pull/9) 性能研究 | [success](https://github.com/sjh20016/inkbox/actions/runs/38599788214) |
| `codex/g2-p02-performance-resolution` | `2ebadd87435f168cf0fa581acbee78e6be19406f` | [#11](https://github.com/sjh20016/inkbox/pull/11) 性能研究 | [success](https://github.com/sjh20016/inkbox/actions/runs/38734604767) |
| `codex/g2-p03-vegetation-pilot` | `901844493b86969a2237c41ccc62e32a98dbdc27` | 性能归因研究（无 PR） | [failure](https://github.com/sjh20016/inkbox/actions/runs/38762835157) |
| `codex/g2-p1-integration-validation` | `74934a8b1360af9007c69935d5becdf8f9809872` | [#12](https://github.com/sjh20016/inkbox/pull/12) 产品功能候选 | [success](https://github.com/sjh20016/inkbox/actions/runs/38734606309) |
| `codex/g2-performance-finalization` | `9a04236950c9f458382f4c2b4b0ed1b1f9cbe353` | [#7](https://github.com/sjh20016/inkbox/pull/7) 性能研究 | [success](https://github.com/sjh20016/inkbox/actions/runs/38518146375) |
| `codex/g2.1-combat-hardening-integration` | `b9ee2dfae24619b43e8a739ce704b2268e657387` | [#4](https://github.com/sjh20016/inkbox/pull/4) 产品功能候选 | [success](https://github.com/sjh20016/inkbox/actions/runs/38330676693) |
| `codex/g2.2-combat-observation-runtime` | `9cbd0d83948bd0ca91df613af2dba1a1688cf9f3` | [#5](https://github.com/sjh20016/inkbox/pull/5) 产品功能候选 | [success](https://github.com/sjh20016/inkbox/actions/runs/38357913743) |
| `codex/g2.3-real-environment-aftermath` | `7c244a7d1afcb9f73a6bbc7e20c11c6e75d93c54` | [#6](https://github.com/sjh20016/inkbox/pull/6) 产品功能候选 | [success](https://github.com/sjh20016/inkbox/actions/runs/38426847526) |
| `codex/g3-perf-a1-0-evidence` | `d5107fc4c3a82e0c0ef083a2dbac2a103cf03420` | [#16](https://github.com/sjh20016/inkbox/pull/16) 阻塞实验 / 证据 | [failure](https://github.com/sjh20016/inkbox/actions/runs/38869875798) |
| `codex/g3-perf-a1-1-pcc-observe` | `8a9ae898204615722c7e90eb03e1d53f1e885608` | [#17](https://github.com/sjh20016/inkbox/pull/17) 阻塞实验 / 证据 | [failure](https://github.com/sjh20016/inkbox/actions/runs/38870117569) |
| `feat/g1-g2-player-experience-web` | `33f91c6630015214ebf012db8dc0f0cccb547594` | [#10](https://github.com/sjh20016/inkbox/pull/10) 已被 #12 继承 | [success](https://github.com/sjh20016/inkbox/actions/runs/38592703416) |
| `integrate/g2-release-candidate` | `9a04236950c9f458382f4c2b4b0ed1b1f9cbe353` | [#8](https://github.com/sjh20016/inkbox/pull/8) 产品功能候选 | [success](https://github.com/sjh20016/inkbox/actions/runs/38518209847) |
| `main` | `e1e55039bb56efda7a307513ede07a9fab3bf534` | 正式主线 | [success](https://github.com/sjh20016/inkbox/actions/runs/38806124933) |

原本地命名分支中，analysis/g2-hydro-gate-attribution HEAD 6f7d939542dfbefcf7067e06223a44de1ca3e0ef 仅本地存在，main 为其祖先；其余原本地命名分支 HEAD 与对应远端一致。原主工作区 detached 在 #12 SHA，原 worktree / 未跟踪材料 / 备份均保留。治理 worktree 从核查后 origin/main 建 chore/repo-governance-pass1，不属于产品或研究候选。

## 全部 PR 状态与依赖

| PR | 状态 / Draft | HEAD | base（实际依赖） | 分类 |
| --- | --- | --- | --- | --- |
| [#1](https://github.com/sjh20016/inkbox/pull/1) | closed / yes | `30da87dae38650779c5995690a8a82791e492170` | `codex/m2-c2d1-painterly-reconciliation` | 历史证据（关闭未合并） |
| [#2](https://github.com/sjh20016/inkbox/pull/2) | merged / no | `a462632430898271e4c911c2955ff6835b9dbad2` | `main` | 正式已合并 |
| [#3](https://github.com/sjh20016/inkbox/pull/3) | closed / yes | `286706dc37ab2e2551054961d7df9c33c74a6e2d` | `integrate/g1-gameplay-shell` | 历史证据（关闭未合并） |
| [#4](https://github.com/sjh20016/inkbox/pull/4) | open / yes | `b9ee2dfae24619b43e8a739ce704b2268e657387` | `main` | 产品功能候选 |
| [#5](https://github.com/sjh20016/inkbox/pull/5) | open / yes | `9cbd0d83948bd0ca91df613af2dba1a1688cf9f3` | `codex/g2.1-combat-hardening-integration` | 产品功能候选 |
| [#6](https://github.com/sjh20016/inkbox/pull/6) | open / yes | `7c244a7d1afcb9f73a6bbc7e20c11c6e75d93c54` | `codex/g2.2-combat-observation-runtime` | 产品功能候选 |
| [#7](https://github.com/sjh20016/inkbox/pull/7) | open / yes | `9a04236950c9f458382f4c2b4b0ed1b1f9cbe353` | `codex/g2.3-real-environment-aftermath` | 性能研究 |
| [#8](https://github.com/sjh20016/inkbox/pull/8) | open / yes | `9a04236950c9f458382f4c2b4b0ed1b1f9cbe353` | `main` | 产品功能候选 |
| [#9](https://github.com/sjh20016/inkbox/pull/9) | open / yes | `e071e832e78857fc9de84cf6af2ca78764717330` | `integrate/g2-release-candidate` | 性能研究 |
| [#10](https://github.com/sjh20016/inkbox/pull/10) | open / yes | `33f91c6630015214ebf012db8dc0f0cccb547594` | `codex/g2-p0-performance-ecology` | 已被 #12 继承 |
| [#11](https://github.com/sjh20016/inkbox/pull/11) | open / yes | `2ebadd87435f168cf0fa581acbee78e6be19406f` | `codex/g2-p0-performance-ecology` | 性能研究 |
| [#12](https://github.com/sjh20016/inkbox/pull/12) | open / yes | `74934a8b1360af9007c69935d5becdf8f9809872` | `codex/g2-p02-performance-resolution` | 产品功能候选 |
| [#13](https://github.com/sjh20016/inkbox/pull/13) | open / yes | `4960f88d6256d63a82c0172bb052c62ae5acb1f3` | `codex/g2-p03-vegetation-pilot` | 性能研究 |
| [#14](https://github.com/sjh20016/inkbox/pull/14) | open / yes | `8831d5ecae72146c51efc8157c7eb2d8e308c5d4` | `analysis/g2-h2-runtime-hydrology-attribution-luna` | 性能研究 |
| [#15](https://github.com/sjh20016/inkbox/pull/15) | open / yes | `bfabe00e3c0865721e5c426c4915a1f879498714` | `audit/g2-p03-vegetation-hardening-luna` | 性能研究 |
| [#16](https://github.com/sjh20016/inkbox/pull/16) | open / yes | `d5107fc4c3a82e0c0ef083a2dbac2a103cf03420` | `codex/g2-h3-terrain-color-pilot-luna` | 阻塞实验 / 证据 |
| [#17](https://github.com/sjh20016/inkbox/pull/17) | open / yes | `8a9ae898204615722c7e90eb03e1d53f1e885608` | `codex/g3-perf-a1-0-evidence` | 阻塞实验 / 证据 |

Git 验证 #10 HEAD 33f91c6 为 #12 HEAD 74934a8 的祖先，不能重复合并 UI；#7 与 #8 同 HEAD。建议按 #8 → #9 → #11 → #12 产品候选链审查，不把堆叠 PR 各自重放至 main。#13 → #15 → #16 → #17 是研究链；#14 从 H2 归因分叉，是另一证据线，不能按编号直接合流。

[P1 固定版本报告](https://github.com/sjh20016/inkbox/blob/74934a8b1360af9007c69935d5becdf8f9809872/G2_P1_INTEGRATION_VALIDATION_REPORT.md) 记录实测代码 1a36e1b，viewport 与实际闭环各 10/10，最终交付提交承载该报告；报告 SHA 不能当成所有测量源码 SHA。READY 仅 P1 集成；P2 Native/Controlled 性能长尾仍失败，Canvas 前台窗口归属证据无效，旧玩家档样本缺失。#13 / #15 局部收益不证明整帧封板。

[G3 固定版本报告](https://github.com/sjh20016/inkbox/blob/8a9ae898204615722c7e90eb03e1d53f1e885608/reports/analysis/g3/a1-1/G3_PERF_A1_1_PCC_OBSERVE_REPORT.md)：分类 P50 19.42 / 19.89 ms，超过 3 ms 停止线，仅运行 60 步，未运行 600 步或 A1-2；正确性探针通过不能抵消成本失败。

Actions jobs 实读：#14 run 38847570490、#15 run 38849649608、#16 run 38869875798、#17 run 38870117569 均 Fast FAIL / Heavy PASS / 手动 Browser 与 P1 Edge skipped。失败 step 都是“G2-P0.2 浏览器进程归属与清理一致性”，根因未复现，留给独立修复；不在治理中改源码、断言或预算。

## B2 历史与实验基线

B HEAD bcb9582371e369b8e64a78a862c1fbeceb13b9e0；git merge-base origin/main origin/B数值系统 退出 1，确认无共同祖先。[B2 研究报告](https://github.com/sjh20016/inkbox/blob/bcb9582371e369b8e64a78a862c1fbeceb13b9e0/B2_RESEARCH_REPORT.md) 自述语义基线 G2-P0 e071e832，这是实验输入说明，不能替代 Git 祖先证据；旧 E: 路径 / research/b2 分支不代表当前工作区入口。该树具备 package-lock、实验 CLI / jobs / 自检、baseline / migration 文档。本轮仅阅读，没有运行实验或确认跨机器可复现。

## 文档与文件规模

整理前 README / HANDOFF / tests/README 仍称 G1-R 独立未合并，ROADMAP 仍以 C2E 为当前。整理后四个主入口统一 main 已含 G1、P1 READY / G2 PERF BLOCKED、G3 BLOCKED、B2 独立。旧 HANDOFF 与 tests/README 按日期保留，ARCHITECTURE 只加状态优先级。STATUS.md 不在授权白名单，保持 2026-10-08 快照，仅当历史索引；旧 G1_RUNTIME_HANDOFF 的待集成说明同理。

基线 git ls-tree -r -l origin/main：958 文件 / 134679578 bytes；根 Markdown 66 份 / 596292 bytes；tracked reports 160 文件 / 87627443 bytes。不计 node_modules、忽略输出、其他 worktree。git count-objects -vH 观察 pack 204.07 MiB、loose 11.96 MiB，这是本地含研究历史的共享对象库，不能当作当前树或远端 Git 历史大小；不运行 gc / prune。

## 开发、测试与打包

各任务独立 worktree，推荐 Node 24 / npm ci，npm run dev 默认 4180。Canvas 默认，Three 用 ?renderer=3d。多工作区不同端口 / 输出目录，GPU 串行；只清理能证明为本任务创建的服务器 / 浏览器。保留原工作区所有已有文件和进程。

按 [测试分级](../../tests/README.md) 选择本地成本：文档做 diff / 链接 / 状态 / 必要包审计；UI 做定向交互与必要双 renderer 分辨率；模拟 / 保存做 Fast、相关 Heavy、RNG / 保存等价；3D 性能做契约与对应 GPU 预算；正式集成保留既有完整发布门禁。分级不改变 CI、预算或断言，未来研究不因列入计划就获授权。

打包器使用显式 FILES / DIRECTORIES，六个修改的既有文档均在清单，新 AGENTS 与本文不进运行包。现有打包器将包外相对链接转换为开发资料说明，写入“开发资料清单.md”；本轮不改打包脚本或清单。须 build / test:package 核查包内链接与该转换。

## 下一轮候选（仅计划，未执行）

| 候选 | 收益 | 风险 / 依赖 | 单独授权 | 未来验收 |
| --- | --- | --- | --- | --- |
| M2 报告迁 docs/archive | 缩短根目录 | 先枚举根文档 / 历史引用 / 打包 FILES / archive fallback；避免悬空与证据丢失 | 是，移动历史证据与打包另批 | 迁移映射、原内容哈希、链接、build / package 无缺失 |
| reports/release 去重 / Golden | 降低树体积 | 内容哈希与引用清单先行；保留阶段 compact summary 和代表 Golden，既有“最多8张”策略不能机械套用删除旧证据 | 是，删除 / 移动另批 | manifest + 哈希映射、可追溯证据、包审计 |
| G2 PR 合流 / 关闭 / 归档 | 清晰候选链 | #12 已含 #10；性能和 CI 先解阻，逐 unique commit 核对依赖 | 是，合并 / PR 状态 / 分支另批 | 无重复 UI、最终候选全门禁、人工审查后操作 |
| H2/H3/G3 CI 修复 | 恢复可信门禁 | 独立 Linux 复现 ownership / cleanup 失败，不降断言；G3 成本仍 BLOCKED | 是，源码 / CI 超出本轮范围 | 原失败定向通过与对应 Fast / Heavy、浏览器归属不回归 |
| B2 可复现环境 | 重跑实验 | 独立固定 bcb9582，记录 Node/V8、lock、语义基线、job/seed/tunables/digest；不合并无共同历史 | 是，独立研究任务 | npm ci、自检、10y smoke、CSV/digest 与旧结果差异解释 |
| CI 成本优化 / main 保护 | 降等待、防误合流 | 先量化 job 时长与失败率，评估依赖缓存；保护规则需管理权限 | 是，workflow / 设置另批 | 覆盖不减、发布义务保留、规则实读与失败阻断证明 |

## 交付、清理与回滚

本轮 1–3 个聚焦提交，最终 push 一次并创建 Draft PR，不合并 main。最终 HEAD、实际命令 / 退出码及自动触发 CI 记录于 PR 描述，避免提交内自引用 SHA。仅清理本任务的可再生输出；工作区保留干净治理分支与用户材料。回滚可关闭 / 放弃治理 Draft，main 不受影响；若将来获批合入，用正常 git revert，不 reset 或强推。

下一位接手先刷新本页日期快照；产品从最新 main 隔离施工，G2 按 #12 及上游阻塞报告接手，G3 / B2 单独立项。历史迁移、分支删除、PR 关闭与设置修改尚未授权。
