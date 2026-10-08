# Repository Audit · 2026-10-08

## 审计边界与真相来源

- 远端已重新 fetch；`origin/main` 当前为 `1cd8d36`（M2-C2E GPU 验收与交接），本报告以此为基线。未依据旧 SHA 推断状态。
- 远端最新 Inkbox CI run 为 [37749151683](https://github.com/sjh20016/inkbox/actions/runs/37749151683)：Heavy Gate 通过，Fast Gate 在 `test:render3d:m2c2d` 失败。C2D 水面材质测试仍把“切换绘画档案不改变拓扑”当成永久约束；M2-C2E 已加入湿域裁切、岸线和水体外围几何。该历史断言应改为保护 World / Region / mesh 不变量及 legacy 几何恢复；C2E 几何门禁继续单独保护新拓扑。
- 本机原 checkout `D:\worldxxxxx\坐天观井inkbox` 在 `codex/m2-c2d1-painterly-reconciliation` / `3a98fb2`，比远端 main 早 6 个提交；原工作树有 43 项未提交变动（6 修改、32 删除、5 未跟踪）。这些源码、历史报告和美术包变动归属未确认，完整保留；整理在独立的 `codex/repository-consolidation` worktree 中进行。

## 当前主线与阶段

- 当前唯一主线：`main`；当前阶段：M2-C2E，已进入 main。
- C2E 交付：自适应地形拓扑与高程、标准 / 山地 / 湿地生成、严格 seed、生成期弱平滑、湿域裁切与岸线、TerrainSide 与水体外围 rim / curtain、连续 TerrainStroke、terrain Undo / Redo、40 / 60 / 80 / 100% 渐进地图访问。512×320 是完整预生成世界的容量实验，不是 chunk streaming。
- 活跃模块：`src/inkbox/main.js`、`src/inkbox/render3d/**`、`src/inkbox/world/**`、`src/inkbox/core/**`、Canvas / Three 共用的 map-access 与输入路径。人物卡仍在独立草稿 PR，不属于 main。
- 入口：`inkbox.html` 是运行入口；`index.html` / `game.html` 是跳转入口。`npm run dev` / `npm start` 调用 `scripts/inkbox-server.mjs`。
- 测试入口以 `package.json` 和 `.github/workflows/ci.yml` 为准；Fast Gate 覆盖 vendor、core、view、presentation、QoL 和各历史 / 当前 Render3D CPU gate；Heavy Gate 覆盖 regression、three realms、save equivalence。真实浏览器 GPU 验收为单独的手动工作流。
- `reports/release/` 是长期阶段证据：307 个已跟踪文件，包含受控 Golden 与摘要；其中 3 个 `.log` 是跟踪的阶段交付证据，保留。`reports/local/`、`dist/`、依赖目录和临时浏览器结果均不进 Git。

## 仓库清点

| 项目 | 数量 / 状态 |
| --- | ---: |
| Git 跟踪文件 | 1,078 |
| 根目录跟踪文件 | 86 |
| `src/` 文件 | 145 |
| `scripts/` 文件 | 107 |
| Markdown 文件 | 76 |
| `reports/release/` 文件 | 307 |
| `package.json` scripts | 85 个；引用 78 个不同脚本文件，未发现缺失 |
| CI / package script 静态引用 | 未发现缺失入口 |

未发现测试、CI 或 package 无引用且可安全删除的一次性脚本。历史阶段验收脚本继续保留为 oracle。当前 `.gitignore` 已覆盖 `reports/local`、`dist`、`node_modules`、日志、临时截图 / 视频 / trace、Playwright 缓存、`.workbuddy-ai`、`.local-backups` 与 zip；本轮只补充 Blender 自动 `.blend1` 备份规则。

### 运行文件、原型与发布包

- 根目录 HTML 中 `inkbox.html`、`index.html`、`game.html`、`cultivator-lab.html` 有运行或测试引用，保留。
- `5.26早期原型.html` 全仓无引用，不属于 package allow-list；归档到 `archive/early-prototypes/5.26早期原型.html`，不删除。
- `scripts/inkbox-package.mjs` 使用显式文件清单；本机 build staging 会写入 `dist/`，仓库 archive、`reports/local/` 和无关参考素材不随包发布。
- 历史模块 / 研究资料留在原目录，不因“看起来旧”而删除或大规模搬动。

### 本机忽略目录与输出

原 checkout 的初始测量：

| 路径 | 文件数 | 大小 | 分类与处理 |
| --- | ---: | ---: | --- |
| `reports/local/` | 478 | 约 2,468 MiB | 其中 `m2c2d1/` 有 470 个文件、约 2,451 MiB；12 镜头四轮 GPU、失败探针和重复配对输出。最终验收指标 / 来源 hash 已在 `reports/release/render3d-m2c2d1/summary/acceptance-summary.json`，8 张筛选 Golden 已跟踪；原始逐帧输出是可再跑的测量产物，不作为长期证据保留。清理 `m2c2d1/`，保留 `m2c2c/` 的 7 个文件（约 16.8 MiB）。 |
| `dist/` | 8,478 | 516 MiB | 29 个残留 `.inkbox-package-*` 暂存目录与可再生 build 结果；清空，build / package audit 完成后不保留产物。 |
| `node_modules/` | 1,264 | 19.5 MiB | 正常依赖缓存，保留；由 `npm ci` 再现。 |
| `.local-backups/` | 12,742 | 1,443.6 MiB | 含多个旧 checkout、Git packs、失败验收 ZIP 和本地方案；属于恢复备份，归属 / 保留价值不明，保留。 |
| `.workbuddy-ai/` | 5,997 | 1,274.4 MiB | 含 Blender 4.5.14 安装 ZIP / 可执行文件 / 运行库；为本地工具链，保留。 |
| `美术素材/范式素材参考/` | 6,719 | 451.4 MiB | 被 `.gitignore` 排除的参考素材；保留在本机，不进入 package。 |

原 checkout 的工作树在清理前约 7,042 MiB（含 `.git`）；`.git` 约 165 MiB，Git pack 合计约 157.6 MiB。忽略目录大于 Git 仓库但不进入提交。清理后体积和最终状态见 [`REPOSITORY_CLEANUP_REPORT.md`](./REPOSITORY_CLEANUP_REPORT.md)。

## 大文件与 Git 历史

- 当前跟踪树中 26 个文件大于 1 MiB；无跟踪文件大于 5 MiB 或 20 MiB。最大文件为角色 master Blender 源 `cultivator_master.blend`（3.57 MiB）、`vendor/three/build/three.core.js`（1.39 MiB）与两张角色预览图（约 1.3 / 1.1 MiB）。历史最大 blob 仍低于 5 MiB，随后主要是受控 release Golden / 截图。
- 3 个较大职责文件：`main.js` 2,440 行（产品接线与主界面生命周期）、`railPanels.js` 1,245 行（侧栏面板组装）、`Render3DAdapter.js` 390 行（Three 接线与输入 / 地形访问守卫）。本轮未发现由文件长度造成的阻塞，不拆分。
- Git pack 为约 157.6 MiB；没有过滤、BFG、强推或历史重写。将来若想降低旧素材历史体积，应另立计划。

## 分支关系与整合交通标志

- `origin/codex/m2-c2d1-painterly-reconciliation` 的 `3a98fb2` 是当前 main 的祖先，main 领先该基线 6 个提交、该旧分支没有独有提交。不要把它当作仍待并入的完整阶段。
- Draft PR [#1](https://github.com/sjh20016/inkbox/pull/1) `codex/g0-character-fate-web` 的 head 为 `30da87d`，base 为旧 C2D.1 分支 / `3a98fb2`。与 main 比较为 PR 领先 16、落后 6；重叠文件为 `.github/workflows/ci.yml`、`package.json`、`scripts/inkbox-package.mjs`、`src/inkbox/main.js`、`src/inkbox/render3d/Render3DAdapter.js`。未来整合还要核查 C2E map access / PlanePicker / access geometry、角色点击 / 渐进锁区、世界替换、死亡 / 飞升及人物卡生命周期。当前仅做交通标志，不操作 PR 或分支。

## 不确定项

- 原 checkout 43 项未提交变动涉及角色验证数据、release 报告 / 日志、一个艺术素材包删除集和若干未跟踪素材 / 文档。本轮不决定这些文件的去留，也不把旧分支迁移到 main。
- `.local-backups/` 是重型恢复点；除非另行确认，不清理其中的历史 checkout / 失败包。
- C2E 后续功能方向仍需明确授权；当前只把已量出的性能边界和待人工视觉审阅列为待办。
