# WX-E0 M0 基线与复现证据

## 基线身份

- 候选分支：`perf/wx-e0-raincoat-first`，本工作区 HEAD `c4b169d707704b614344345dfb1cac8fe96d50a9`，tree `f88ff3d44da0bf860026e8416ec0ad7f8fdc171a`。
- 基线源码来自固定 SHA 的 `git archive`，只读放在 `reports/local/wx-e0/baseline-source/`。以下基线测试与性能脚本均从此快照运行；主线线程的后续修改不会覆盖此源。
- 运行环境：Node `v24.11.1`，Windows_NT `10.0.26200` x64，AMD Ryzen 9 8940HX with Radeon Graphics。
- 本轮由主代理使用 GitHub connector 重新读取 PR #60–#64 metadata，并读取各 head 的最新 workflow run 与 jobs；五层均为 Draft、未合并，Fast/Heavy 成功，Browser Smoke skipped。WX-E0 是以 #62 为基底的平行候选，不基于 #64。

| 层 | 准确 HEAD | PR base | 最新 workflow run | Fast / Heavy | Browser Smoke |
|---|---|---|---|---|---|
| #60 V0.2-B | `b50623b18bdb2407a4efd1b837df3683a8305255` | `main` | [42131712765](https://github.com/sjh20016/inkbox/actions/runs/42131712765) | success / success | skipped |
| #61 WX-C | `eb99cf5d0c719ba6727d90d157c2e09274ecd013` | `feature/wanxiang-suming-v02-alpha` (#60) | [42170004386](https://github.com/sjh20016/inkbox/actions/runs/42170004386) | success / success | skipped |
| #62 WX-D | `c4b169d707704b614344345dfb1cac8fe96d50a9` | `feature/wx-c-wanxiang-shengyuan` (#61) | [42245388790](https://github.com/sjh20016/inkbox/actions/runs/42245388790) | success / success | skipped |
| #63 WX-S1 | `f88fb2acf53062252c36772cbe0c0a9aae41c372` | `feature/wx-d-yinyuan-chengju` (#62) | [42354753692](https://github.com/sjh20016/inkbox/actions/runs/42354753692) | success / success | skipped |
| #64 WX-S1.1 | `e1b5abb60215b75523112fc67c6f7aba3b85d3f3` | `feature/wx-s1-mingtu-shizhang` (#63) | [42367101351](https://github.com/sjh20016/inkbox/actions/runs/42367101351) | success / success | skipped |

## 基线验证

所有入口均按 `reports/local/wx-e0/baseline-source/package.json` 定义的脚本列表逐个执行，工作目录仍是本隔离仓库，以便依赖解析到本机 `node_modules`。日志和准确退出码：

| 等价入口 | 退出码 | 记录 |
|---|---:|---|
| `npm run test:core` | 0 | `reports/local/wx-e0/baseline/test-core.log` |
| `npm run test:g8` | 0 | `reports/local/wx-e0/baseline/test-g8.log` |
| `npm run test:wanxiang:b` | 0 | `reports/local/wx-e0/baseline/test-wanxiang-b.log` |
| `npm run test:wanxiang:c` | 0 | `reports/local/wx-e0/baseline/test-wanxiang-c.log` |
| `npm run test:wanxiang:d` | 0 | `reports/local/wx-e0/baseline/test-wanxiang-d.log` |

结果汇总：`reports/local/wx-e0/baseline/test-exit-codes.json`。可复现命令是在仓库根目录执行 `node reports/local/wx-e0/baseline-source/scripts/<入口脚本>`；每组脚本清单见同名日志头和基线 `package.json`。这些通过只证明固定基线的既有测试，不是 E0 改动后的验收。

## 自然检查点

复用了 WX-D `inkbox-wxd` 已有原生自然存档，未重建、未推进。存档清单记录源绝对路径、目标路径、字节数和 SHA-256：`reports/local/wx-e0/checkpoints/manifest.json`。副本位于 `reports/local/wx-e0/checkpoints/`：

| 检查点 | 世界日 | 大小 | SHA-256 |
|---|---:|---:|---|
| `20260914-100y-save.json` | 36000 | 2,826,671 B | `08404e6fa62c4cba154bfe03b0b116cd9eb7e835bd2cd1e69b800fc87b92ad18` |
| `20260914-400y-save.json` | 144000 | 10,073,655 B | `d204519759a222d3fac8d5847d9f025329c9a1fa83a20e3835dfbd7ef59666bd` |

## 已知成本路径与资格证据

- `advanceWorld` 对 `Life.step` 周围调用现有 `startWorkMetric` / `endWorkMetric`。`sim/workMetrics.js` 使用 `WeakMap`；未启用时计时入口返回 `null`，计数入口不写入。`enableWorkMetrics` 是明确 opt-in，快照只复制该世界的记录。
- `sim/life.js:771` 在 `if (e.wanxiang)` 下调用 `stepSkillResources(e,dtDays)`，该守卫不要求修为等级。技能执行入口 `wanxiang/skills.js` 的 `canUseSkill` 另有 `e.level > 0` 限制；需区分 profile 存在与正式技能消费者资格，不能简单按 `sp` 类型拦截。
- `wanxiang/skills.js:20-24` 的 `combatState` 首次构建时求一次 `manaCapacity(e)`，随后 clamp 再求一次。`stepSkillResources` 又会在恢复上限时读取容量。去重候选属于 S 类，但必须验证动态 capacity、存档形状及完整 RNG/世界快照。
- `sim/life.js:1007-1018`（基线文件行号）在修士机缘签通过后调用 `world.sitesNear(x,y,30)`，只在排序结果首项不是 `formation` 时寻访；`World.js:462` 的 `sitesNear` 扫描整个 `sites` 并排序所有半径内项目。空洞府是否有真实内容应复用 `sim/sites.js:27-33` 的 `siteContentState` / `siteHasContent` 规则。本轮计划新增独立 `sim/siteSearch.js`，不改 `World.js.sitesNear` 的通用语义，也不增加全路由可达性判断；筛出有内容的候选不等于保证路线可达。
- 调用关系：`advanceWorld → Life.step → stepEntity → stepSkillResources → combatState/manaCapacity`；技能动作继续进入 `readEffects`。寻访路径：`Life.step → planNext → rng roll → sitesNear → seek`。

## S/B 初步边界

- S：opt-in 指标扩展、纯读诊断、`combatState` 重复容量求值的无损合并；需在同源同步长下验证完整 `serializeWorld + captureRuntimeState` 和登记 RNG 等价。
- B：普通非修士不再维护无资格技能资源；寻访仅按真实内容筛除空候选。两项都可能改变 profile/未来行动或 RNG 消费，应独立对照、保持各自版本可重放，并检查人口、修士成长、资源、地点寿命/结算等不变量。寻访筛选不额外承诺地图路由可达性。未批准的世界线变化不得包装为逐位无损。

## 基线成熟性能

复用 `scripts/inkbox-wx-d-perf.mjs`，对各自原档恢复后跑 30 游戏日（每 3 日一步），每档 1 次预热加 4 次相同恢复试验；相同档案各次完整世界和 RNG digest 相同。不是 GPU/FPS 测量，也不是改前后速度提升结论。

| 世界 | 命令结果 | 四轮 wall ms | 四轮 CPU ms | Life wall ms 范围 |
|---|---:|---|---|---|
| 100 年 | exit 0 | 166.2, 172.0, 167.6, 197.4 | 219, 173, 172, 328 | 159.3–189.2 |
| 400 年 | exit 0 | 1390.4, 1537.4, 1341.3, 1292.8 | 1453, 1594, 1358, 1515 | 1252.2–1515.1 |

预热已从表格中剔除。逐轮计量、保存大小、检查点 SHA 与完整 digest 见 `reports/local/wx-e0/baseline/perf-100y.json` 和 `perf-400y.json`。100 年保存为 2,830,085 B；400 年保存为 10,081,009 B。该脚本过程计量包含计时采样开销，解读应以同脚本前后配对为准。

复现：

```powershell
node reports/local/wx-e0/baseline-source/scripts/inkbox-wx-d-perf.mjs --save=reports/local/wx-e0/checkpoints/20260914-100y-save.json --days=30 --out=reports/local/wx-e0/baseline/perf-100y.json
node reports/local/wx-e0/baseline-source/scripts/inkbox-wx-d-perf.mjs --save=reports/local/wx-e0/checkpoints/20260914-400y-save.json --days=30 --out=reports/local/wx-e0/baseline/perf-400y.json
```

本次未运行浏览器、硬件 GPU、800 年长局；以上记录只覆盖 M0 指定的 Fast 子集及两份自然档 30 日恢复测量。

