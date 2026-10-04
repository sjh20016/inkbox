# M2-C2A.1 A1 发布包与证据收口报告

基线为 `6193681`。本报告记录发布包清单收紧、包内审计及运行包门禁。源资产仍留在工作区和版本库，发布包只带实际运行所需文件。

## 清单变化

- 角色运行内容仅复制 `mesh/`、`data/`、`materials/`；`docs/` 保留约 15 KB 规范文档。`source/` 和 `preview/` 不进入运行包，源 `.blend` / `.blend1` 不删除。
- 不再递归复制历史 release 目录；只复制 M2-A performance、C2A acceptance 与 tree gate 三份 compact JSON。截图矩阵、日志和其他本地 reports 不进入包。
- Markdown 指向包外开发资料时，打包阶段将链接转为“开发资料，运行包不附带”的明确文字，并生成 `开发资料清单.md` 列出来源文档与原路径。清单保留历史 `assets/characters/cultivator/docs/COMPLETION_REPORT.md` 名称；当前 README 应指向已随包提供的 `CHARACTER_SPEC.md`。
- 运行包中的 `test:characters` 使用 `--runtime-only`，仍检查 GLB 结构、manifest、模块、材质、骨骼动画和实例批处理；源工作区命令默认继续检查可编辑 Blender master。运行包不提供源资产生产验收。
- `.gitignore` 将未来新增 release 证据限定在明确的 `golden/` 与 `summary/` 子目录。已有跟踪证据不因 ignore 规则而删除或改写。

## 审计和验证

`scripts/inkbox-package-audit.mjs` 检查禁止扩展名和目录、release 图像、GLB 二进制块与 JSON、角色 runtime 资产引用、根 `package.json` 本地脚本、包内 Markdown 本地链接以及 clean-clone 构建输入。构建脚本在打 ZIP 前对实际 staging 目录运行审计。

| 指标 | A0 基线 | A1 结果 |
| --- | ---: | ---: |
| 发布目录体积 | 105,000,189 bytes | 7,215,867 bytes（减少 93.1%） |
| ZIP 体积 | 89,745,002 bytes | 2,303,963 bytes（减少 97.4%） |
| 包内文件数 | 458 | 236 |
| audit | — | staging 与实际复制输出均通过：禁项、1 个 GLB、34 个本地脚本目标、53 份 Markdown 链接 |
| dist 运行门禁 | — | core、Render3D M1 / M2-B / M2-C / M2-C2A、characters runtime-only 均通过 |
| 包内再次 build | — | `npm run build` 从运行包目录执行成功，staging 与复制输出复审通过 |

dist 依赖通过 `npm ci --ignore-scripts` 安装；测试输出指向工作区 `reports/m2c2a1/package-tests/`。完整 clean-clone build 将在本轮其余阶段提交合并后由主代理执行；本报告记录的 build / audit 是当前工作区结果。
