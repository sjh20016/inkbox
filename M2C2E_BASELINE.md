# M2-C2E 开工基线

2026-10-08。开发分支 `codex/m2-c2e-living-terrain`，原始源码 SHA `3a98fb29a6b3bddf6242e3d25e2d5cbbc41e8f29`，与委托书核对值一致。

E0 在任何产品源码修改前完成原始证据采集。工作区既有历史报告与委托书的目录迁移属于用户工作，原始状态保存在 `reports/local/m2c2e/baseline/initial-worktree.txt`；不回退迁移，不合并 main。

- 修改前 M2-B：70 组通过；C2D.1：6 组通过。
- 同机 Edge/CDP 十二镜固定 Canonical GPU 矩阵通过：实际产品页面、既有自然存档、原种子与相机。完整截图、GPU 标识、帧时间和资源见 `reports/local/m2c2e/baseline/gpu/browser.json`，原始日志 `baseline/browser.log`。
- 保留 C2D.1 的八张正式 Golden 原文件；本轮不重写旧阶段截图。
- Tabbit 稳定 launcher 的 diagnose 两次退出码 1，无 stdout/stderr；采用工程已有 Edge/CDP GPU 套件。默认执行器沙箱初始化失败，命令经自动审批使用 require_escalated。

三层回归：Canonical 保留旧固定 World/视界/相机；Stress 覆盖群山深谷、丘陵、湾岸、盆地、坡地界缘及村水同框；Fuzz 使用至少十二个固定 seed、三类地貌与多幅面，检查有限值、高度界限、索引、水陆分类、确定性及存读档。

失败标准：旧确定性或存档不兼容、网格与贴地/Picker 不一致、越界索引、非有限值、悬浮水/实体、界缘缝隙、编辑或扩图改变错误 World 身份、资源持续增长均为工程失败。自动安全检查不替代最终人工美术裁决。