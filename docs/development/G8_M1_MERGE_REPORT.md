# G8-M1 岁序归一 · 正式合流报告

执行日期：2026-10-27（Asia/Shanghai）。本页记录 G8 正式合流点；后续文档提交沿用该生产源码，最新主干 SHA 以 GitHub main 为准。

## 1. 合流结果

[PR #52](https://github.com/sjh20016/inkbox/pull/52) 已从 Draft 转为 Ready，再通过 GitHub 正常 **Merge Commit** 流程合并，状态为 `merged`。

- 合流前 main：`4cf7f9fcda3a4ae77bf0e1ef2c20174bc591a2a7`。
- 已验收 G8 HEAD：`3bcdcf081f0a03a58a0781e548252383a8d460da`。
- 实际 G8 合并提交：[`06043766d937ac42e8f4a04305e256cf5b9a43ce`](https://github.com/sjh20016/inkbox/commit/06043766d937ac42e8f4a04305e256cf5b9a43ce)，保留两个父提交和六个 G8 来源提交。

执行时两端 SHA 均未偏离委托书。主干 branch protection 为关闭、有效 branch rules 返回空，未要求人工审批；没有修改任何规则或使用 bypass。最新 PR Fast/Heavy 均成功。PR 曾显示 `unstable`，对应较早 Push 自动运行 40475946311 被同分支并发规则取消；较新的 PR 运行 40475950482 完整成功。取消记录没有当作通过证据。合并请求固定预期 HEAD，未强推、删除分支或改写失败历史。

## 2. 合流代码核验

G8 共 43 个变更文件，生产代码、测试/探针、CI/打包接线、文档与归档已分开核对。未混入 R3D-S1 植被空间剔除，未改人口参数或引入个体抽象化。

| 契约 | main 上的对应实现 |
| --- | --- |
| 可快照 RNG 与按 World 独立流 | `src/inkbox/core/noise.js`、`src/inkbox/sim/worldStreams.js` |
| 检查点、四个低频时钟、预检与有限回滚 | `src/inkbox/sim/runtimeState.js`、`life.js`、`upperLife.js` |
| 自动/手动保存、导出同步边界；候选会话恢复/坏新档拒载 | `src/inkbox/main.js`、`src/inkbox/io/save.js`；`autoSave()` 传入 `captureRuntime()` |
| 普通进食不再永久消耗静态植被 | `src/inkbox/sim/life.js` |
| 上界法宝落入凡界重新分配合法 ID | `src/inkbox/sim/rifts.js` |
| 三界流续接、G8 测试与资源 | `rifts.js`、`wraiths.js`；`test:g8` / `test:g8:browser`、Fast 与手动 Browser Smoke、打包显式清单 |

`git diff --quiet 3bcdcf0 0604376` 退出 0：G8 HEAD 与实际合并点的**整个文件树**相同。800 年源码 `c3c6852d8fa1d6ccf0d237c16de232a5bfb2bf1a`、独立 Smoke 修复 `eedb6d7962c24770487ef19644e7f7585efcaf94`、G8 HEAD 和合并点的 `src/inkbox` 树均为 `0b76bc31ec6bc0b53186174fb05591950391ac2f`。运行期契约和历史长局结果没有因合流失配；G8 文档及 `g8c1-evidence/40460801820/` 可从 main 读取。

## 3. 测试证据

| 证据 | SHA / 范围 | 实际结果 |
| --- | --- | --- |
| [G8 最终 PR CI](https://github.com/sjh20016/inkbox/actions/runs/40475950482) | `3bcdcf0` | Fast / Heavy 成功 |
| [G8 合流后的 main CI](https://github.com/sjh20016/inkbox/actions/runs/40489846424) | `0604376` | Fast / Heavy 均完成成功；手动 Browser Smoke 按原设计 skipped |
| [历史 Nightly](https://github.com/sjh20016/inkbox/actions/runs/40460801820) | `c3c6852` | 800 年阶段 85/85；工作流整体 **failure** |
| [独立 Smoke 复验](./g8c1-evidence/40460801820/smoke-followup.json) | `eedb6d7` | 568/568、exit 0；仅修扫描面并补三个回归，原断言/预算保留 |
| [历史 Edge 正式入口验收](./G8_C1_MERGE_ACCEPTANCE.md) | G8-C.1 文档记录 | Edge 156、1366×900、九组通过；本轮复用，未重跑 |

主干 CI 的 Fast 覆盖 `test:g8`、`test:g7`、`test:core`、`build`；Heavy 覆盖 `test:save-equivalence`、`test:three-realms` 及既有长回归，复用这些对应源码结果。本轮本地 Node v24.11.1 的 `npm run build` / `npm run test:package` 均退出 0：545 文件、17 GLB、166 脚本目标、44 份包内 Markdown 链接通过；G8 运行期模块及专项脚本完整随包，开发文档链接由既有打包器登记包外来源。远端收尾 CI 仍按最终提交完整执行，没有因文档变更跳过原门禁。

浏览器原始报告位于被忽略的历史 `reports/local/g8c1/browser/`；本次本地没有取得该原始报告，九组结果按已交付验收文档引用，没有冒充本轮重新执行或独立确认浏览器运行时 SHA。普通 CI 的 Browser Smoke 为既有手动项，自动运行中的 skipped 不代表浏览器通过。

Nightly 原失败为尾随旧 Smoke 把万灵局部 `record(world,u,text)` 当成 Chronicle API，564/565。`eedb6d7` 仅改 `scripts/inkbox-smoke.mjs`，限定真正的 `world.record/milestone` 调用并增加回归；生产源码不变。[原始证据索引](./g8c1-evidence/40460801820/README.md) 保留失败、后续复验和字段缺失。**本轮不重跑 800 年、不主动触发 Nightly、不新增 GPU A/B 或浏览器性能实验。** 下一次正常定时 Nightly 将使用届时默认 main，尚未执行的结果没有标成通过。

## 4. 工程收尾

活跃 README、HANDOFF、ROADMAP、BACKLOG 与测试入口同步 G8 已合流、运行期续跑已实现和人口生态修复；保留历史 C1/E0 诊断的版本背景。测试说明区分 RNG/时钟功能、正式浏览器存读档、生态 Nightly 和真实浏览器性能。`scripts/inkbox-longrun.mjs` 两处旧 11.7 年寿元注释改为当前 62.5 游戏年基础寿元及按实体 `lifespan` 结算的口径；不改实际年龄、寿元、生育概率、软上限或任何行为断言，去除行注释后的脚本文本与 main 相同。基线与入口收尾提交为 `ccbca9d64b7306870228b0ccf12d6b6e7c95e3da`，随后仅补本报告的主干 CI 结果；最终文档提交见本文件 Git 历史。

旧档缺少的历史 RNG 游标不能恢复；正式地形仍有 16 位量化误差。固定种子在第 200–300 年约 1,400 生灵且第 800 年仍持续繁衍，不等于所有种子已证明自然平衡。收尾没有新增证据大包或生产代码重构。

## 5. 成熟世界基线

已建立 [G8_MATURE_WORLD_BASELINE.md](./G8_MATURE_WORLD_BASELINE.md)：固定 seed `20260914`、medium 288×180、360 日/年、STEP=3、每 20 年开视界 5 年，引用 200/300/800 年真实人口采样及原归档。规定暂停近景、正常推进、密集村镇和森林近景四场景，分别统计模拟、渲染和交互成本。

未取得来源完整且可直接加载的 G8 成熟世界存档；统计 JSON/CSV 不能导入为存档，本轮未重新推进几百年或伪造人口。后续取得快照须登记源码 SHA、文件哈希、生成条件、运行期状态和正式导入方式。800 年模拟计时 1,968,625 ms 不代表实时 3D FPS。

## 6. R3D-S1 兼容性登记

[PR #51](https://github.com/sjh20016/inkbox/pull/51) HEAD 仍为 `66f11f6d59bef4c064a5bab514c94537f5ad71b0`，独立、Draft、`CONDITIONAL`、默认关闭。本轮没有合并或修改该分支。

与 G8 的实际文件交集为 `.github/workflows/ci.yml`、`package.json`、`scripts/inkbox-package.mjs`、`tests/README.md`。使用 `git merge-tree --write-tree --name-only 0604376 66f11f6` 只检查 Git 对象，没有变动任何工作树：前三项可自动合并，**`tests/README.md` 有内容冲突**。基于文档收尾提交 `ccbca9d` 再检查，交集与冲突结论相同。后续 S1 必须基于新 main 同步这四项，人工保留 G8 与 S1 两套测试说明，不能用一侧覆盖整个文件。

后续接线须保留 G8 CPU 与正式浏览器入口、Fast/Heavy 全部原门禁、运行期模块与脚本打包清单、RNG/四时钟/UpperLife 检查点、自动/手动保存及坏档拒载、静态植被进食规则、跨界法宝 ID。继续检验 renderer 与 forestCull 切换的模拟只读性和存读档等价，不从开局低人口性能推导成熟世界性能。不得自动启用 forestCull、扩大分区对象或改写 S1 已有远近景成本结论。

## 7. 下一阶段真实边界

- 多种子长期自然平衡、软上限长期占满及世家身份泛化仍待研究，本轮不调人口参数或血缘规则。
- 上界凡人固定长局中较晚才稳定，不新增人口来源。
- 成熟世界真实设备性能、DPR2/跨设备边界及可信存档样本仍待专项取证。
- 旧档无法倒推未保存游标，地形量化和长档配额仍是实际边界。

## 8. 最终裁决与回退

**`MERGED`：G8 已正式进入 main，合流前与合流后的关键 Fast/Heavy 门禁均通过。** 人口长期平衡与成熟世界真实设备性能属于后续独立研究，不阻断本次合流。没有剩余生产代码开发；后续纯文档收尾仍通过正常 PR 和完整既有门禁接纳。

如需回退 G8，走正常 PR 执行 `git revert -m 1 06043766d937ac42e8f4a04305e256cf5b9a43ce` 并恢复完整门禁；文档收尾可单独 revert。不得 reset/强推主干或删除原分支与证据。
