# Inkbox Backlog

本文件区分产品阻塞、研究问题、人工裁决和未来优化，不授予实现授权。正式产品基线为 **M2-C2E + G1**（本轮核查 `origin/main` `4852d89c8ad29e59841fa81aa86318b0ad8c54ba`）；G1 已由 PR #2 合并。G2-R1 在独立分支恢复可玩功能，范围见 [本轮交接](./docs/development/G2_R1_PLAYABLE_INTEGRATION.md)，仍保持 Draft 与性能阻塞。

## 产品阻塞

- **M2-C2E 性能边界**：最大地图与密集模拟存在帧耗时长尾，DPR 2 GPU 预算尚未收敛。需基于可复现数据判断产品边界及后续范围。

## 研究

- **H2/H3/G3 CI**：当前 SHA 的 Fast Gate 因浏览器进程归属与清理一致性 step 失败；Heavy PASS 不代表整体验收通过。另立定向复现 / 修复任务，保留断言与失败证据。

- **G2 性能**：PR #12 候选仍为 BLOCKED 且未合并；目前仅 G2-P1 闭环 READY。不得将 G2 全功能记为 READY。固定候选证据见 [P1 验证报告](https://github.com/sjh20016/inkbox/blob/74934a8b1360af9007c69935d5becdf8f9809872/G2_P1_INTEGRATION_VALIDATION_REPORT.md) 和[性能收束报告](https://github.com/sjh20016/inkbox/blob/74934a8b1360af9007c69935d5becdf8f9809872/G2_PERFORMANCE_FINALIZATION_REPORT.md)。
- **G3 cost**：PR #17 研究状态为 BLOCKED，继续研究或实现需单独明确范围。
- **独立 B 线**：与正式产品线没有共同祖先，保持独立研究状态；产品化或合并需要单独裁决。

## 人工裁决

- **最终视觉裁决**：M2-C2E 最终美术效果待审阅。
- **历史 RNG 游标持久化**：是否写入存档尚未决定；存档兼容范围明确前不改格式。

## 未来优化

- M2-C2E 的性能优化方向待测量结果确定，不预设实现方案。
- 其他尚未获批的候选功能、G2/G3 后续工作及 B 线产品化不作为已承诺开发事项。

正式阶段与候选关系见 [ROADMAP](./ROADMAP.md)，交接及流程见 [HANDOFF](./HANDOFF.md) 与 [仓库工作流](./docs/development/REPOSITORY_WORKFLOW.md)。
