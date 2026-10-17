# G4-P1A 静海候选报告

日期：2026-10-17
状态：PASS（候选阶段）；规则状态仍为 \`RULE_CHANGE_REVIEW_REQUIRED\`

## 基线与范围

- 仓库：\`sjh20016/inkbox\`
- 候选分支：\`feat/g4-p1a-static-sea-candidate\`
- 基线：\`origin/main\`，提交 \`e1e55039bb56efda7a307513ede07a9fab3bf534\`
- 对照研究分支：\`analysis/g4-p0a-hydro-ablation\`，提交 \`9d4160fed918ece8aa0338bf087fb8aef2c1baed\`
- 冻结 R2 夹具 SHA-256：\`22aa5b602a7e151235afafa763eeab1221334eb2b4dbe8ffa0990ee82a36e44b\`，与委托书一致。
- 只新增本报告及候选模块、fixture、定向脚本。没有改动主循环、既有水文/地形/World/存档/powers/worldgen/config/noise 源文件，也没有改 package 或 lockfile。候选未接入默认 V0。

## 候选行为

\`prepareStaticSea(world)\` 将海面水深归一为 \`Math.fround(SEA_LEVEL - height)\`，只写入不一致的海格并刷新 dirty 状态。

\`stepHydrologyStaticSea(world, dtDays)\` 只接受严格等于 4 的有限步长；执行 R2 的河流维护、水流、以海洋为侵蚀 sink 的陆地侵蚀、受侵蚀 bbox 限制的局部陆地热力、海面归一和 dirty 刷新。返回 \`{ moved, eroded }\`。三个临时缓冲保存在各自 World 上，按 World 尺寸校验并复用，没有跨 World 全局缓存。

## 定向门禁

冻结 R2 Oracle 对 \`height\`、\`water\`、\`type\`、\`qi\` 四层逐格使用 \`Object.is\` 比较，所有场景 tolerance 为 0：

- A：expanse，seed 673231，generationVersion 2，30 步。
- B：small，seed 226，generationVersion 2，60 步。
- C：程序化真实 World 的海岸、海峡、孤立海下洼地，各 12 步。
- D：真实 \`History\` 与 powers，使用 prepare/step 两种恢复入口覆盖海格加水、移水、抬高海床、陆地下挖，共 8 个事件。
- E：small 世界演化 10 步后，使用真实 History 做内陆注水和雕刻，再演化 10 步。
- F：拒绝 10 个无效步长；检查归一幂等、独立/交错 World、重复输入可复现和 World 尺寸变化后的 scratch 重建。

结果：A–F 全部 PASS；四层每次检查均为零差异。海格水深始终有限、非负并等于海面高度差；原海格海床未改变。定向脚本还核对 revision、dirty 状态、真实事件历史和冻结 fixture 摘要。V0 独立子进程成功执行 5 步，输出摘要 \`99f868d832b4c9940df318cafc8d305d84b2a1dede1e8a8c4283162b939a2b5c\`。该摘要没有预置期望值比较，因此只作为运行摘要；未将其单独当作 V0 等价证明。九个受保护源文件另与基线逐字（归一换行）核对一致。

## 项目门禁

| 检查 | 结果 |
|---|---|
| 四个新增 JS/MJS 文件 \`node --check\` | PASS |
| \`node scripts/inkbox-g4-p1a-static-sea.mjs\` | PASS，A–F 零差异 |
| \`npm run test:core\` | PASS |
| \`npm run test:regression\` | PASS，22 项 |
| \`npm run test:save-equivalence\` | PASS，exit 0，读档瞬间结构检查通过 |
| \`git diff --check\` | PASS |

存档等价测试的长时连续与读档分支报告 30 人口差异；测试说明这是量化误差在混沌系统中的放大，不是序列化字段丢失。该 PASS 不意味着长期世界轨迹完全一致。未运行 build/package：本候选未接入产品入口，package/lockfile 未变，本阶段门禁未要求构建发布包。

独立只读审查未发现需要修复的实现缺陷。

## 决策与后续边界

P1A 对冻结 R2 实现通过；不得据此启用新规则。主循环仍使用既有水文模块，\`SAVE_VERSION\` 仍为 11。将此候选接入 V0、改变时间步长、调整公式或宣称性能收益前，仍需完成单独的规则变更审查。当前未做性能基准，因此不报告性能收益。
