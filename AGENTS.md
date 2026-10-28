# Inkbox 开发入口（RG2 · 2026-10-28）

> 本页陈述**当前开发规则**。治理取证基线为 `main@5746e4e`；SHA 是历史快照，不是永久施工基线。每次开工必须重新核对 GitHub main、PR、CI 和对应源码。

## 一、正式产品与候选

- 唯一正式产品分支：`main`；唯一活跃源码：`src/inkbox/`；正式页面 `inkbox.html`，默认 Canvas，`?renderer=3d` 启用 Three。
- 当前主线已经包含 G1/G2、R1/S0、E0/C1/P0/G7、W0.1/T0 的 WT-I1 合流、G8 运行期与人口修复、E2-Lite 观井手札及行愿。实际合流状态以 GitHub PR 与最新源码为准。
- 未合流候选：G6 血仇 #30、山海遗迹 #37、万象拾趣 #39、R3D-S1 植被剔除 #51。不得将其当作 main 功能；#51 默认关闭且有远景成本与合并冲突。
- G2/G3 早期开放研究 PR 是历史证据/阻塞实验，不意味着应按原候选重新合并。独立 `B数值系统` 无共同 Git 祖先，不能普通合并或用其参数覆盖主线。
- 详细分类与遗留 Issue：[`RG2_CURRENT_STATE.md`](./docs/development/RG2_CURRENT_STATE.md)。阶段时间线见 `HANDOFF.md`；旧 `REPOSITORY_WORKFLOW.md` 是 10 月 17 日历史审计，不是实时 PR 清单。

## 二、开发边界

1. 开工先核对远端最新 HEAD、工作区已有改动和正在进行的候选；从确定的 main SHA 创建隔离分支/worktree。
2. 先读 `README.md`、`HANDOFF.md` 顶部、`ROADMAP.md`、`BACKLOG.md`、`ARCHITECTURE.md` 和 `tests/README.md`；源码优先于阶段报告。
3. 新玩法原型先遵循 [`FEATURE_EXTENSION_CONTRACT.md`](./docs/development/FEATURE_EXTENSION_CONTRACT.md)，复用已有模拟/观察/存档机制；不要为单个原型新建全局事件总线、第二套时钟或第二个世界事实源。
4. 玩家可编辑词条、人物经历、遗物和奇遇可以独立生产，但正式状态写入、RNG 流、低频节拍、身份与存档迁移由主线集成统一裁决。
5. UI、Canvas、Three 只呈现正式世界事实；不可为了视觉证据或测试结果伪造世界进展。
6. 不擅自变更世界规则、人口数值、随机签序、存档格式、渲染回退选项；不得让实验默认开启。
7. 多工作区分别使用端口和报告目录；GPU 实测串行，只清理归属明确的本任务进程与临时物。

## 三、验证、交付与仓库操作

1. Node 24 / `npm ci`；`npm run dev` 默认端口 4180。`npm test` 仅是核心入口，不是完整门禁。
2. 小改动先做相应定向检查，正式集成必须通过现有 Fast/Heavy；浏览器手动 Smoke、真实 GPU 和 800 年 Nightly 依据改动风险独立验收。参照 `tests/README.md`。
3. 不删除有效断言、不放宽预算、不用旧 SHA 的成功结果替代当前版本；失败、跳过和未测均须明记。
4. 打包使用显式清单；涉及入口或文档链接时核查 `build` / `test:package`。
5. 合并、关闭 PR、删除分支/关键证据、修改主干保护属于独立的有影响操作；需按任务范围逐项确认。禁止强推和重写历史。
6. 每次交付写明基线/HEAD、文件清单、行为边界、实际验收与回退路径。历史资料从 Git 固定提交追溯，不反复搬回根目录。
