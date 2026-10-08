# Repository Cleanup Report · 2026-10-08

## 结论

**YES WITH KNOWN ISSUES**：以 `origin/main` 为基线的整理分支已完成全套本地 Fast Gate、Heavy Gate、构建与 package audit；工作区生成物已清理，分支提交后状态干净。

### 已知事项

1. GitHub `main` 上最新公开 CI 仍是 run [37749151683](https://github.com/sjh20016/inkbox/actions/runs/37749151683)，Fast Gate 保留旧 C2D 水拓扑断言导致的失败。修复在本整理分支，尚未合并，因此不能宣称远端 main 已恢复。
2. 手动 Browser Smoke 的 HTTP 预检全部返回 200，但本机 Edge CDP 在 `Page.enable` 超时，随后 WebSocket 断连；没有到达浏览器断言。真实浏览器 / GPU 验收仍待可用的 CDP 环境重跑。
3. C2E 最终美术裁决和最大图 / DPR 2 性能预算仍是后续事项。
4. 旧本地 checkout 保留 43 项先前未提交变动和两个 `.blend1` Blender 恢复文件；本轮没有改写、暂存或删除它们。

## 整理前状态

- 施工前重新 fetch，基线为 `origin/main` `1cd8d36d5cc4796359376dbd57151b53d7ad64a9`，M2-C2E 已进入 main。远端最新 CI 的 Heavy Gate 通过、Fast Gate 在 `test:render3d:m2c2d` 失败。
- 用户原 checkout 位于 `D:\worldxxxxx\坐天观井inkbox`，分支 `codex/m2-c2d1-painterly-reconciliation`、HEAD `3a98fb2`，比 main 早 6 个提交；有 43 项未提交状态（6 修改、32 删除、5 未跟踪）。这些较早进度和文件归属不明的变动全部保留。
- 为隔离旧进度，从 `origin/main` 建立 `D:\worldxxxxx\inkbox-repository-consolidation`，本地分支 `codex/repository-consolidation`。
- 仓库基线 1,078 个跟踪文件；`reports/release/` 307 个文件。原 checkout 工作树约 7,042 MiB（含 Git 数据）；Git 仓库约 165 MiB，Git pack 约 157.6 MiB。

## 整理内容

### 文档

- 更新 `HANDOFF.md`、`ROADMAP.md`、`BACKLOG.md`、`STATUS.md`、`ARCHITECTURE.md` 和 `tests/README.md` 顶部的 Current Truth：以 `main` / M2-C2E 为准，标出当前入口、真实遗留和旧阶段历史边界。
- 说明人物卡 Draft PR #1 仍基于旧 C2D.1 分支、相对 main 为 16 ahead / 6 behind、与 CI / package / Render3D 文件有重叠；只留整合交通标志，未改动 PR、人物卡分支或其 base。
- 新增 [`REPOSITORY_AUDIT.md`](./REPOSITORY_AUDIT.md)，记录仓库、脚本、忽略输出、大文件和分支审计。

### CI 兼容修复

- 旧 C2D 测试把“当时 topology 不变”错误写成了跨未来阶段的永久不变量。C2E 已实现湿域裁切、岸线和水体外围几何，因此在现拓扑下旧断言比较到 36,852 与 17,766 个 index 项并失败。
- 将断言改为保护仍成立的行为：profile 切换不替换或改写 `World.water`，保留 World / Region 方向 / mesh 身份；切回 legacy 后恢复原材质和 legacy geometry/index。C2E 自己的几何门禁继续检查湿域裁切和岸线行为。
- 没有删除或跳过 C2D 测试，没有更改模拟、地形数据、随机数或玩家行为。

### 根目录与 ignore

- 将全仓无引用且不进入 package allow-list 的 `5.26早期原型.html` 移至 `archive/early-prototypes/5.26早期原型.html`，不删除。
- `.gitignore` 新增最小规则 `*.blend1`，覆盖 Blender 自动旧版本备份。其余 reports/local、dist、依赖、日志、浏览器缓存、AI 工作目录和 local backup 规则原已覆盖，没有重复添加。
- 未删除脚本：package 的 85 个 scripts 指向 78 个文件，CI / package 入口未发现缺失；历史阶段验收脚本作为 oracle 保留。

### 本地 reports / dist

在用户原 checkout 中，先确认 `reports/local/m2c2d1` 和 `dist` 是工作区内的可再生目录，并验证指标摘要与筛选 Golden 已保留，再移除：

| 路径 | 整理前 | 操作 | 整理后 |
| --- | ---: | --- | ---: |
| `reports/local/` | 478 个文件，约 2,468 MiB | 删除 `m2c2d1/` 的 470 个原始探针文件，约 2,451 MiB | 8 个文件，约 16.8 MiB；保留 `m2c2c/` 与小型 `m2c2d/` |
| `dist/` | 8,478 个文件，约 516 MiB | 清除打包输出及 29 个残留 staging 目录 | 不存在；build / package audit 已先通过 |

净释放约 2,967 MiB（2.90 GiB）；按原始总量减去已测量目录，原 checkout 约从 7,042 MiB 降至 4,075 MiB。`reports/release/` 的验收摘要、筛选 Golden 和跟踪日志保留。M2-C2D.1 指标、来源文件 SHA 和验收信息仍在 `reports/release/render3d-m2c2d1/summary/acceptance-summary.json`；8 张精选 Golden 也继续跟踪。

本次新建验证 worktree 中由验证生成的 `dist/`、`reports/ci/`、`reports/local/` 和其他临时 Render3D 报告亦已删除；`node_modules/` 保留作为可再生成依赖缓存。

## 保留但可在单独授权后评估

- `.local-backups/`：约 1,443.6 MiB，包含旧 checkout、Git pack 与恢复文件。
- `.workbuddy-ai/`：约 1,274.4 MiB，包含 Blender 安装包和工具链。
- `美术素材/范式素材参考/`：约 451.4 MiB，本地参考素材。
- 旧 checkout 的 43 项源码、报告、删除集和未跟踪文件仍由原工作区保有；两份 `.blend1` 恢复数据未删除。

这些内容均不进入整理提交或发布包。原 checkout 的未提交状态保持 43 项不变；它不是本轮的干净开发入口。

## 大文件与 Git 历史

- 跟踪树中 26 个文件大于 1 MiB，无文件大于 5 MiB / 20 MiB。最大项为 `cultivator_master.blend`（约 3.57 MiB）、`three.core.js`（约 1.39 MiB）和角色预览图。
- `.git` 约 165 MiB，Git pack 约 157.6 MiB。未过滤、重打包、强推或重写历史；长期历史体积问题只记录为未来单独评估项。

## 分支与人物卡

- 整理分支从 `origin/main@1cd8d36` 创建；它只包含仓库卫生、文档和测试契约调整，不改变 main 历史。
- 旧 `codex/m2-c2d1-painterly-reconciliation@3a98fb2` 已是 main 的祖先，没有独有提交；main 领先 6 个提交。
- Draft PR [#1](https://github.com/sjh20016/inkbox/pull/1) 的 head 为 `30da87d`，base 是旧 C2D.1 分支。它比 main 领先 16、落后 6；冲突热点包括 `.github/workflows/ci.yml`、`package.json`、`scripts/inkbox-package.mjs`、`src/inkbox/main.js` 与 `Render3DAdapter.js`。本轮没有合并、变基、关闭或删除 PR / 分支。
- 后续整合前需重新检查 C2E map access、PlanePicker / access geometry、渐进锁区、角色点击、World 替换、死亡 / 飞升与人物卡生命周期。

## 验证结果

- `npm ci`：通过，0 vulnerabilities。
- Fast Gate 通用门禁：`test:vendor`、`test:core`、`test:view`、`test:presentation`、`test:qol` 全通过。
- Fast Gate Render3D CPU 门禁：从 M0、M1、bridge、M2-A / B、C2A / C2A.1、C2B0 / C2B / C2B.1、C2C 到 C2D / C2D.1 全通过；C2E 几何与 generation 门禁也通过。C2D 定向脚本 13/13，C2D.1 CPU 契约 6/6。
- Heavy Gate：`test:regression`、`test:three-realms`、`test:save-equivalence` 全通过。
- `npm run build` 和 `npm run test:package` 通过。打包审计检查 387 个发布文件、78 个脚本目标、99 份 Markdown 文档链接及 2 个结构化加载的 GLB。
- 曾按原始 main 状态运行 C2D 测试并复现失败：`水面三角形拓扑不得改变`，36,852 ≠ 17,766。改为保护长期 World / Region / mesh 与 legacy 几何契约后重新运行，通过 13/13。
- 可选 Browser Smoke：六套均因本机 Edge CDP 启动 / 连接失败退出；HTTP 预检 `/inkbox.html`、`main.js` 和 Three.js 均为 200。该项没有作为通过计入。

## 当前 main 的下一位开发者

从 GitHub `main` 当前提交继续开发；当前阶段为 M2-C2E。接手先读 `HANDOFF.md`、`ROADMAP.md`、`BACKLOG.md` 与 [`REPOSITORY_AUDIT.md`](./REPOSITORY_AUDIT.md)。公开 Fast Gate 修复须通过该整理分支集成后，再由新 CI run 确认；人物卡 PR 仍单独评审。最大图 / DPR 2 的性能边界和最终美术效果待评估，不预设功能改造。

## 提交清单与最终状态

1. `254206a chore(repo): clean workspace and archive historical artifacts`
2. `6775efe test: reconcile historical C2D water contract with C2E geometry`
3. `docs: reconcile repository truth after M2-C2E`（本报告所在提交）

整理 worktree 位于 `D:\worldxxxxx\inkbox-repository-consolidation`，基于 `codex/repository-consolidation`；提交后 `git status` clean。原 `D:\worldxxxxx\坐天观井inkbox` 仍保留其早期分支及 43 项未提交变动，只有确认可再生的 `reports/local/m2c2d1` 和 `dist` 被移除。
