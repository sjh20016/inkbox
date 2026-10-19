# ROADMAP · 坐天观井 Inkbox

## 正式产品线

2026-10-18 核查 `origin/main` 为 `768b870949ffe6d17e74e8fc8656e5eadf6f6130`，正式产品为 **M2-C2E + G1 + G2-R1 + A1 + G2.4-C**。PR #23、#24、#25 均已按祖先关系合并，战斗、伤势、生态灾迹、真实引燃与角色资产已是正式功能。最大地图性能边界、最终视觉裁决与历史 RNG 游标存档策略仍未决，见 [BACKLOG](./BACKLOG.md)。

## 当前开发：G2.5「破境有相 · 改命布缘」

独立分支 `feat/g2-5-fate-opportunities` 从最新 main 起步，已接通洗髓对长期修炼条件的改变、剑冢/丹阁的不同正式奖励、洞府的一次性功法传承，以及依据正式突破结果的双 renderer 异象。候选以目标 main 的 Draft PR 审阅，不自动合并；试玩与验收入口见 [HANDOFF](./HANDOFF.md) 和 [玩家指南](./PLAYER_GUIDE.md)。

G2 性能继续 **PERF BLOCKED**；主要试玩规格为 200×128 / 288×180。历史候选的功能已由 #23 定向迁入，不重放 #4～#12；#13 / #15 的研究收益不代表整体帧性能通过。

接纳来源与范围见 [G2-R1](./docs/development/G2_R1_PLAYABLE_INTEGRATION.md)、[A1](./docs/development/A1_CREATURE_CHARACTER_ASSETS.md)、[G2.4-C](./docs/development/G2_4_C_ACCEPTANCE.md)；其中 Draft、待合流等文字均属对应交付时快照。当前入口是本路线图与 HANDOFF，已删除的 STATUS 只从固定历史提交读取。

## 性能研究 G3

PR #17 的 cost 研究为 **BLOCKED**，属于研究结论，不是正式产品承诺，也不自动授权继续实施。新的开发范围须另行明确并授权。

## 独立 B 线

B2 数值研究所在的 B 线为独立实验，和正式产品线没有共同祖先；它不是当前合并候选，不能据此推定可合并或开始产品化。

## 变更边界

本路线图记录已有状态与候选关系，不构成开发授权。新的产品阶段、候选合并、性能实现或 B 线产品化均须另行明确范围与授权。当前待处理事项见 [BACKLOG](./BACKLOG.md)，接手与仓库纪律见 [HANDOFF](./HANDOFF.md) 和 [仓库工作流](./docs/development/REPOSITORY_WORKFLOW.md)。
