# WX-E0 与 WX-B/C/D、WX-S1/S1.1 集成计划

## 分支关系

WX-E0 基于 WX-D #62 的固定基线 `c4b169d707704b614344345dfb1cac8fe96d50a9`，与 #63 WX-S1、#64 WX-S1.1 平行；不得将 WX-E0 叠到 #64，也不改变任何现有 PR 的 base、分支或状态。主代理本轮通过 GitHub connector 重新读取 #60–#64 metadata 和各 head 最新 workflow run/jobs，确认五层均为 Draft、未合并，Fast/Heavy success，Browser Smoke skipped。精确 SHA/base/run 见 [M0 基线表](./WX_E0_BASELINE.md#基线身份)。main 为 `bd62ade03c56908ce5942f7100d6b5cb2bc38934`。

## 预期重叠与处理顺序

已执行只读命令 `git -C ..\inkbox-wxs11 diff --name-only c4b169d707704b614344345dfb1cac8fe96d50a9 e1b5abb60215b75523112fc67c6f7aba3b85d3f3`。固定基线到 #64 的实际改动路径如下：

`.github/workflows/ci.yml`、`README.md`、`docs/development/FEATURE_EXTENSION_CONTRACT.md`、`docs/development/WX_S1_STORY_CONTRACT.md`、`docs/development/WX_S1_DELIVERY.md`、`docs/development/WX_S1_NATURAL_STORIES.md`、`docs/development/WX_S1_PERF_AND_SAVE.md`、`docs/development/WX_S1_UI_QA.md`、`docs/development/WX_S11_DELIVERY.md`、`docs/development/WX_S11_EVIDENCE_AND_WORDING.md`、`docs/development/WX_S11_NATURAL_QA.md`、`docs/development/WX_S11_PERF_AND_SAVE.md`、`package.json`、`scripts/inkbox-package.mjs`、`scripts/inkbox-wx-s1-browser.mjs`、`scripts/inkbox-wx-s1-integration.mjs`、`scripts/inkbox-wx-s1-people.mjs`、`scripts/inkbox-wx-s1-perf.mjs`、`scripts/inkbox-wx-s1-profile.mjs`、`scripts/inkbox-wx-s1-ui.mjs`、`scripts/inkbox-wx-s1-world.mjs`、`scripts/inkbox-wx-s11-proofreading.mjs`、`src/inkbox/g1/characterRuntime.js`、`src/inkbox/g1/sandboxRuntime.js`、`src/inkbox/main.js`、`src/inkbox/ui/g1/presentation/characterCard.css`、`src/inkbox/ui/g1/presentation/mingpuView.js`、`src/inkbox/ui/storyCardsView.js`、`src/inkbox/ui/storyNavigation.js`、`src/inkbox/wanxiang/storyFacts.js`、`src/inkbox/wanxiang/storyPeople.js`、`src/inkbox/wanxiang/storyReading.js`、`src/inkbox/wanxiang/storySelection.js`、`src/inkbox/wanxiang/storyWorld.js`、`tests/README.md`。

`FEATURE_EXTENSION_CONTRACT.md` 的改动来自 #63：新增 S1 故事消费准入表链接；#64 另加的是 `WX_S1_STORY_CONTRACT.md` 与 S1.1 证据/文案规范，本轮 diff 中 #64 没有再次修改 `FEATURE_EXTENSION_CONTRACT.md`。故此路径确有 #63 重叠，需保留叙事准入条款并以 E0 合同补足通用消费者成本卡。当前实现计划新增 `src/inkbox/sim/siteSearch.js`，不修改 `World.js.sitesNear`；候选仅按真实内容筛除空洞府，不引入新的路由可达性判断。其他 E0 热路径与故事模块的交叉仍需在最终合流 diff 中核查，不能仅凭文件名推断冲突。

重叠判断以本节列出的实际路径为准，不把未改文件称为已冲突。`ci.yml`、`package.json`、`FEATURE_EXTENSION_CONTRACT.md` 与 package 脚本有明确路径重叠，需逐块整合。E0 计划新增的 `sim/siteSearch.js` 不是 `World.js` 修改；对其他 E0 文件的未来交叉以最终合流 diff 为准。

## 各层关键状态、保存责任与回滚

| 层 | 关键正式状态/职责 | 保存责任 | 已记录回滚方式 |
|---|---|---|---|
| #60 V0.2-B | 命途/体质/血脉/卦象与正式消费者 | 具体持久字段清单本轮未逐字段核验；合流时检查 #60 最终保存 diff | #60交付记录建议撤回本轮B提交并恢复原Alpha树；降级前备份可能由新回执字段产生的档案 |
| #61 WX-C | 命改权限、经历事实/回执、关系与机会 | 交付记录：v11可选万象块/Profile v1；新供给/性格运行流由G8 runtime block保存 | `wxCEnabled=false` 可停用新供给/性格及C行为修正并保留事实；代码降级到B前保留B档备份 |
| #62 WX-D | 有界任务、赴事路线、洞府生命周期与机会计数 | 交付记录：v11/Profile v1；`wanling.jobs`、转向点、`lastLifecycleDay`、机会计数；诊断只在WeakMap | 停用Alpha停止新增行为；整版回退保留WX-C档并切回#61 |
| #63 WX-S1 | 故事只读投影、来源/身份校验及主动读取UI | 交付记录：无故事存档块、新RNG或模拟消费者 | 停用候选/正常revert；无新增迁移，保留WX-D原档 |
| #64 WX-S1.1 | 证据末项、节点折叠和文字/原物语义校勘 | 交付记录：不改save或正式模拟消费者，无新故事保存状态 | 正常revert #64；无保存迁移，保留S1/D原档 |

#60确切持久字段及旧版本对新存档的可降级能力仍需在对应合流diff核对；本表不承诺旧程序能读取新档。

建议合流顺序：

1. 先确定 #60→#62 的基础版本已合并或明确使用其 Draft 目标；只集成已被选中的唯一增量，不重放整条候选分支。
2. 逐文件先接入成本合同与 Fast CI 入口，再接入 S 类计量和容量求值变更。
3. 单独审阅普通凡人技能资格的 B 类行为边界，再单独审阅机缘候选选择器及其 RNG/世界线变化。
4. 对比 #63/#64 的故事 UI 和人口/经历消费者：故事读取不得接入每步技能更新或寻访路径；合流后重跑 `test:core`、`test:g8`、`test:wanxiang:b/c/d`、E0 相关定向测试与 Fast/Heavy。
5. 如果 #63/#64 已改变上述共享文件，按最新真实树人工挑拣，不 cherry-pick 覆盖整个文件。最后分别复跑存读档、世界/RNG 等价或行为差异重放、成熟世界性能；已在旧候选通过的证据不替代合流版本验收。

## 风险分类与裁决

| 区域 | 主要冲突/风险 | 集成要求 |
|---|---|---|
| `ci.yml` / `package.json` | 多分支 Fast/Heavy 命令、任务依赖和包清单都可能同时改 | 合并脚本段和 workflow job，确保每项测试只在正确门禁运行，验证 build/package 清单 |
| `FEATURE_EXTENSION_CONTRACT.md` | #63 已加入 WX-S1 故事消费者准入表链接；#64 扩写 `WX_S1_STORY_CONTRACT.md` 与证据规范；E0 增加通用成本卡 | 保留故事特定身份/证据要求，在该页补通用成本准入 |
| `life.js` / `skills.js` | E0 针对资格、容量与 seek；后续支线也可能触及人物生命周期 | 由单一集成者串行处理；S/B 各自独立审查、测试、提交 |
| `sim/siteSearch.js` / `sites.js` | 独立过滤器复用洞府真实内容规则；奖励和寿命仍归正式 sites 消费者 | 不改 `World.js.sitesNear`；仅筛真实内容，不声称路线可达；验证奖励结算、地点生命周期和 RNG |
| `main.js` / Character UI | #63/#64 增加只读故事按钮与身份导航 | 确认故事 UI 不调用模拟工作，不因 E0 的测量启用而自动出现 |
| 保存、运行时状态、随机流 | B 类资格/目标选择可能改变后续 RNG 和新世界线 | S 类必须完整等价；B 类按版本确定性重放，明确记录差异来源，不宣称旧存档世界线逐位兼容 |

## 证据与退出条件

本机 M0 报告、测试日志、固定 SHA 源码快照、自然检查点副本及哈希都在 `reports/local/wx-e0/`（忽略目录，不是远程 artifact）。主代理本轮已通过 connector 核实的五层 PR metadata、最新 workflow run/jobs 与状态见 M0 表；未来集成前仍需重新核对其是否变化。Browser Smoke 在这些 workflow 中为 skipped，不把基线性能脚本称为 GPU 验收。

若 B 类更改破坏修士来源、凡人生活、寿元、资源结算、正式到达或洞府消亡边界，应回退相应行为增量，保留成立的合同与只读计量。最终验收清单应记录实际 PR/HEAD、CI、未运行项、回退方式与准确检查点；本计划不预填未来 PR URL 或 SHA。

