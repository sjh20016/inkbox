# ROADMAP · 坐天观井 Inkbox

## 正式产品线

正式基线是 **M2-C2E + G1**，本轮核查 `origin/main` 为 `4852d89c8ad29e59841fa81aa86318b0ad8c54ba`（RG 治理收官）；G1 已由 PR #2 合并。M2-C2E 提供地形拓扑、高程与水岸、版本化地貌和严格 seed、雕刻事务、渐进访问及 512×320 预生成世界。其最大地图性能边界、最终视觉裁决与历史 RNG 游标存档策略仍未决，见 [BACKLOG](./BACKLOG.md)。

## 候选集成线

当前开发分支 `feat/g2-r1-playable-integration` 从上述治理后基线定向迁移既有 G2 / P1 可玩功能，保持 **Draft / PERF BLOCKED**。本轮范围与接续方向见 [G2-R1](./docs/development/G2_R1_PLAYABLE_INTEGRATION.md)；以下旧候选状态保留为来源索引，不表示本分支已合入 main。

G2.1 战斗表现 / 加固（#4）、G2.2 气血与真实交手观察（#5）、G2.3 真实生态灾迹（#6）及 P1 玩家闭环（#12）均在候选栈，未进入正式 main。性能研究 #13 / #15 的植被与地形颜色局部优化，尚未证明整体帧收益；G2 性能仍待封板。

PR #12 候选提交 `74934a8b1360af9007c69935d5becdf8f9809872` 中仅 **G2-P1 闭环 READY**。G2 性能仍 **BLOCKED**，候选整体未合并；此状态不代表 G2 全功能已就绪。报告固定在候选 SHA：[P1 集成验证](https://github.com/sjh20016/inkbox/blob/74934a8b1360af9007c69935d5becdf8f9809872/G2_P1_INTEGRATION_VALIDATION_REPORT.md) · [性能收束](https://github.com/sjh20016/inkbox/blob/74934a8b1360af9007c69935d5becdf8f9809872/G2_PERFORMANCE_FINALIZATION_REPORT.md)。PR #4–17 为 open Draft；#10 是 #12 的祖先，处理候选时不得重复合并。

## 性能研究 G3

PR #17 的 cost 研究为 **BLOCKED**，属于研究结论，不是正式产品承诺，也不自动授权继续实施。新的开发范围须另行明确并授权。

## 独立 B 线

B2 数值研究所在的 B 线为独立实验，和正式产品线没有共同祖先；它不是当前合并候选，不能据此推定可合并或开始产品化。

## 变更边界

本路线图记录已有状态与候选关系，不构成开发授权。新的产品阶段、候选合并、性能实现或 B 线产品化均须另行明确范围与授权。当前待处理事项见 [BACKLOG](./BACKLOG.md)，接手与仓库纪律见 [HANDOFF](./HANDOFF.md) 和 [仓库工作流](./docs/development/REPOSITORY_WORKFLOW.md)。
