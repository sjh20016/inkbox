# M2-C2B0 就绪条件与终验

2026-10-04：C2A.1、三界视觉、600 日纯度与资源耐久已验收；最终 Fast 核心、Heavy、发布包与冻结提交的 clean clone 检查均通过，本阶段完成，具备第一套正式资产家族受控试产条件。精确提交、包字节数与命令结果由 [终验摘要](./reports/release/render3d-m2c2b0/summary/final-gates.json) 记录；正式资产家族尚未生产。

| 门禁 | 证据与当前结果 |
| --- | --- |
| C2A.1 包清单/HLOD/Forest | [封板报告](./M2C2A1_CLOSEOUT_REPORT.md)；源 `.blend` / preview / 全量证据不入包，真实屋顶簇与身份保留 |
| 三界视觉矩阵 | [验收](./M2C2B0_VISUAL_ACCEPTANCE.md)；24 对/48 PNG，通过实际画面、shader/GL/Region/picker/resize 检查 |
| 固定负载性能 | [性能报告](./M2C2B0_PERFORMANCE_REPORT.md)；GOLDEN_A 179874/12、DENSITY_A 282411/12，CPU p95 0.5/0.6 ms |
| 全部随机流与存档 | [纯度摘要](./reports/release/render3d-m2c2b0/summary/purity.json)；6×600 日、11 流、World/state/save SHA 一致，0 新表现字段 |
| 生命周期与资源 | [耐久摘要](./reports/release/render3d-m2c2b0/summary/lifecycle-soak.json)；600+6000 受测帧，53 geometry / 7 texture / 13 program，21 次 GC 峰值有界 |
| 默认风格 | 新浏览器启动 v1、legacy 切换/恢复、暂停后 World 稳定与 GL=0，通过 |
| 最终 Fast/Heavy | 本地全通过（Fast 核心13套含复用的新CLI，Heavy3套），完整日志在 `reports/m2c2b0/final-gates/` |
| 发布包/最终提交 clean clone | 冻结提交 clean clone 的 npm ci、build、package audit、runtime GLB 均通过；后续仅文档终验记录另封提交，精确快照见摘要 |

下一阶段范围限一套正式资产家族的受控试产：先确定唯一已有 World 语义的家族，接入共享 atlas/material 与实例批次，再检查比例、锚点、真实 identity、LOD/HLOD、同屏信息量和目标设备预算。本轮没有开始家族扩产，也不自动授权 Gameplay G 或新的世界语义。

当前上界没有浮空岛 World 语义，因此本轮没有正式浮空岛或 style lab 岛；地形淡洗不能充当可交互云岛。幽冥没有可靠的村落/树/水语义，保持现有真实地形与实体。视觉方向以 [上位文档](./美术素材/三界视觉风格规划_美术方向文档_v1.md) 为准，技术局限如实保留。

本地结果与远端 Actions 分开记录。CI 已增加 C2B0 CLI Fast Gate、Windows Edge 手动矩阵与 soak、artifact 路径；本轮未 push、未触发远端 CI。
