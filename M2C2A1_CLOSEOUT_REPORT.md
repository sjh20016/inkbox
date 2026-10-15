# M2-C2A.1 封板报告

阶段输入为 C2A 提交 `7164850`；A0、A1、A2、A3 分别已提交审计、包清单、聚落 HLOD 和密林探针。A4 已通过：M1（36）、M2B（69）、M2C（9 + pilots）、C2A（8）、新增 HLOD（5）、build、包审计及实际 dist 角色 GLB 检查均为 exit 0。

发布包 A1 从 105,000,189 bytes / 458 files 缩至 7,215,867 bytes / 236 files，ZIP 从 89,745,002 缩至 2,303,963 bytes。可编辑源文件、预览和历史 Git 证据保留；玩家包不携带它们。提交 `79008b9` 的干净克隆安装、build、包审计与实际 dist 角色 GLB 检查均通过。

HLOD 从一个 8-triangle 整村屋顶块改为真实房屋范围内的 2–4 个屋顶簇，每簇 12 triangles，每村 24–48 triangles。一份几何和实例批次承载所有村庄；真实中心建筑纳入 far cluster 身份，近景恢复原建筑。真实 GOLDEN_A 同村 near / mid / legacy far / cluster far 图片已人工查看，settlementId、成员、代表地面高程和 Region 检查通过。

密林探针将真实 DENSITY_A 首 5,000 棵树与 synthetic uniform-grid 5k / 10k 分开。修正为仅观察产品 RAF 后，真实动态 assignment-only median/p95 为 1.2/1.7 ms，静止 update 为 0.5/0.7 ms且零重分配。合成 10k assignment-only 为 2.5/3.2 ms。局部修改移除 N 长度 concat 临时数组，保持可见优先顺序和 LOD 预算；没有可证实的 CPU 加速，不继续扩大优化。CPU matrix write 不代表 GPU transfer；历史双重渲染压力数据仍单独保留。当前 runner 不再额外 render，详细修正见 M2C2A1_FOREST_REPORT.md。

详见 [发布包报告](M2C2A1_PACKAGE_REPORT.md)、[HLOD 报告](M2C2A1_HLOD_REPORT.md)、[密林报告](M2C2A1_FOREST_REPORT.md)。

A4 展开包为 242 files / 7,278,416 bytes，ZIP 2,326,059 bytes。新增检查脚本及封板文档造成的小幅增长有明确清单；源文件、预览和全量截图仍未进入玩家包。runtime GLB 为 145,188 bytes，12 meshes / 1 material / 1 texture，Idle + Walk 动画可用。

A4 浏览器矩阵 15 项通过，console/runtime/GL/shader 均无错误，完整 World + advanceState digest 保持一致；凡界 overview、建筑近景、人物中景及两个跨界窗口的代表图已人工查看。GOLDEN_A / DENSITY_A pilot-lod overview 恢复 A0 的相同负载：179,874 / 282,411 triangles，各 12 draws。实体 LOD0/LOD1 的真实 ID 拾取与 Region 归属通过。全量证据位于忽略目录 `reports/m2c2a1/a4-core/`、`reports/m2c2a1/a4-browser/`。

C2A.1 封板通过，停止进一步重构 LOD，进入三界 Profile 阶段。用户追加的约 200k triangles 性能压力另以真实产品单次绘制诊断：原森林压力脚本同时保留产品 RAF 和额外手动绘制，其 rAF 不等于常规帧率。额外原 C2A CPU 补采虽 World digest 相同，但 LOD 初态不同导致面数不一致，因此只留诊断，不作为同负载前后结论；已完成固定相机和 LOD 进入顺序补采，原 C2A GOLDEN_A / DENSITY_A 分别精确复现 179,874 / 282,411 triangles、12 draws；更新 CPU 与有效 GPU timer 结果见 Forest 报告。原密林 414,037 triangles 的 GPU 中位数约 8.0ms，噪声 hash 替换无稳定收益，因此保留生产材质。

2026-10-04 后续：B0–B6 的三界视觉、全部随机流与资源耐久已通过；旧 M2B 新增关闭/切界 Raw 恢复回归后为70组。C2A.1 不再继续扩大 LOD 重构。当前运行包与 clean clone 终验以 [READINESS](./M2C2B0_READINESS.md) 和其终验摘要为准，A1/A4 数字保留为对应历史阶段快照。
