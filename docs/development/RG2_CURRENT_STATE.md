# RG2 · 当前仓库状态与候选处置表

审计时间：2026-10-28。**审计基线**：`main@5746e4e541a6ebf78aca201507d8e7bd8febf1fe`（E2-Lite 合流提交），不是未来工作分支的固定基线。开工重新 fetch。仓库：`sjh20016/inkbox`。

## 已核实的主线

- 10 月 27 日，G8 #52、G8-M1 #53、E2-Lite #54 已正式合并；W0.1/T0 先前由 WT-I1 正式合入。
- 对应 `main@5746e4e` 的 Inkbox CI Fast/Heavy 均为 success（[CI 40529711776](https://github.com/sjh20016/inkbox/actions/runs/40529711776)）；定时 [Nightly 40590168504](https://github.com/sjh20016/inkbox/actions/runs/40590168504) 的 800 年长测与 Smoke 两步骤均成功。该夜测不代表 GPU 性能通过；Browser Smoke 仍按配置跳过自动执行。
- 此次清点 57 个远端分支、17 个开放 PR、3 个开放 Issue。数目是时点快照，不能作为后续自动关闭/删除名单。
- GitHub `main` 未启用 branch protection，仓库规则集为空。修改保护设置需独立授权与合流工具兼容性检查。

## 四个仍有独立价值的候选（均未并入正式主线）

| PR | 当前处理 | 必须遵守的边界 |
| --- | --- | --- |
| [#30 G6 血仇](https://github.com/sjh20016/inkbox/pull/30) | 活跃玩法候选，保持 Draft | 旧基线，重新核对 `sim/life.js`、`relations.js` 与 E2 观察链；不直接整分支合并 |
| [#37 山海遗迹](https://github.com/sjh20016/inkbox/pull/37) | 独立资产展厅，保持 Draft | 资产均在 `research/shanhai-ruins-v01/`，按视觉与性能预算选择性引入 |
| [#39 万象拾趣](https://github.com/sjh20016/inkbox/pull/39) | 部分接线候选 | P1 遗物传闻/P2 故城旧事待新主干复核；P3 旧约未 import，不得称已可玩 |
| [#51 R3D-S1](https://github.com/sjh20016/inkbox/pull/51) | CONDITIONAL 性能实验，保持 Draft | 近景获益但远景开销增加；默认 off。与 G8 在 `tests/README.md` 存在实际冲突 |

审计时四候选相对 main 的落后提交数分别为 #30 116、#37 91、#39 74、#51 19。这不是冲突数量；合入前必须以最新 Git merge-base/实际 diff 为准。

## 十三个历史开放研究/来源 PR

[#4](https://github.com/sjh20016/inkbox/pull/4)、[#5](https://github.com/sjh20016/inkbox/pull/5)、[#6](https://github.com/sjh20016/inkbox/pull/6)、[#8](https://github.com/sjh20016/inkbox/pull/8)、[#9](https://github.com/sjh20016/inkbox/pull/9)、[#11](https://github.com/sjh20016/inkbox/pull/11)、[#12](https://github.com/sjh20016/inkbox/pull/12)、[#13](https://github.com/sjh20016/inkbox/pull/13)、[#14](https://github.com/sjh20016/inkbox/pull/14)、[#15](https://github.com/sjh20016/inkbox/pull/15)、[#16](https://github.com/sjh20016/inkbox/pull/16)、[#17](https://github.com/sjh20016/inkbox/pull/17)、[#19](https://github.com/sjh20016/inkbox/pull/19)。

这些 PR 分别承载 G2 功能来源、性能失败证据、H2/H3 与 G3 PCC 成本实验；**保持历史证据身份，不因显示 open 自动判定为待合并代码**。正式 G2/G5 功能已通过之后的产品 PR 接纳，不得重放旧整分支。G3 成本裁决 BLOCKED，不能为清零列表而合并。若以后关闭 PR，应逐个说明“被何正式提交取代/保留什么实验结果/是否有独有变更”；关闭与删除分支是不同操作。本轮不进行这些状态修改。

## 三个开放 Issue 的新旧事实

- [#49](https://github.com/sjh20016/inkbox/issues/49)：原先新档缺 RNG 游标和四低频时钟的主体问题已由 G8 运行期恢复机制处理；旧档**无法反推**从未保存的历史游标。正式更新 Issue 状态前需复核验收范围与尚未完成的边界，不可沿用旧“完全未修”的措辞。
- [#47](https://github.com/sjh20016/inkbox/issues/47)：G8 修复人口生态，并在一个固定种子 800 年样本中生灵 1400；这不证明所有种子、所有出生闸门已经健康。继续保留多种子长期平衡问题。
- [#48](https://github.com/sjh20016/inkbox/issues/48)：G8 固定种子上界后期出现凡人生息，但历史“成年门槛吸收态”不能凭单次样本判定消失。继续保留专项验证。

## RG2 操作纪律

本轮治理只修文档“当前真相”、建立候选归类与原型接入契约。不删除旧报告和经哈希核验的 G8 长测证据、不修改正式模拟/存档/渲染或 Fast/Heavy、不合并候选 PR、不关闭 Issue/PR、不删除分支、不修改主干保护。未来每次集成先从最新 main 建分支，重新评估候选唯一变更与兼容性。
