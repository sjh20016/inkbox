# 万象拾趣 V0.1 · 交付记录（P1 遗物传闻 / P2 故城旧事 / P3 旧约候选）

**分支：** `feat/wanxiang-v01-glm`（隔离 worktree，未合流、未推送）
**基线：** `main` @ `d4faed3`（Merge pull request #38: G7 v1.1 万象归卷）
**日期：** 2026-10-24

---

## 0. 半页现状核查（开工时实测）

| 项 | 实测结果 |
| --- | --- |
| `main` | `d4faed3`（比委托书快照 `dbcd46c` 新：G7 PR #38 已正式合流） |
| PR #38（G7） | **已合并**，不再是施工中的争用源 |
| Sol 6.1 各分支 | `feat/g7-main-integration-sol61` / `c1` / `e0` / `p0-settlement-resilience` / `p0-three-player-experience` 全部**领先 0 提交**（已并净） |
| 开放 PR | #37（山海遗迹，独立美术分支）、#30（G6-P0 血仇，**施工面含 `relations.js`**）、#11–#19（历史性能研究）。本轮未触碰任何一条 |
| 争用文件结论 | G7 合流后 `save.js` / `advance.js` / `main.js` / `artifacts.js` 已稳定，可做**最小**改动；`relations.js` 仍属开放 PR #30，本轮不改 |
| 测试命令 | `npm test`（=core 四件套）、`test:save-equivalence`、`test:regression`、`test:three-realms`、`check:ui`、`profile:c1:cpu`（自带 `--baseline` 对照） |
| 复用的函数 | `ownerLine` / `describeArtifact` / `toGround` / `pushHistory`（artifacts.js）、`settlementInspectCard` / `world.settlementRuins` / `LOCAL_HISTORY_LIMIT`（settlementResilience.js）、`data-inspect-ruin` 按钮链路（main.js 已有） |

---

## 1. 玩法参考表（阶段 A 收束）

许可证纪律：**全部为设计思路学习，零源码复制、零素材搬运**。Inkbox 保持自有《版权说明.md》；未引入任何第三方代码或依赖。

| # | 参考 | 产生趣味的最小规则 | 来源（可核查） | 需要的 Inkbox 事实 | 触发点 | 新持久状态 | 结算成本 | 玩家在哪看到 | 取舍 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Dwarf Fortress 传闻 | 传闻有来源、有时间、会过时 | https://dwarffortresswiki.org/index.php/Rumor | 法宝 `history`、`lostDay`、`ownerId` | 易主/遗落/拾取的既有调用点 | 无（全部现算） | O(履历≤10) | 检视卡「无主之物 / 遗物旧闻」行 | **接纳 → P1** |
| 2 | DF 地点历史/遗痕 | 遗址可循旧主痕迹一路走读 | 同上 wiki（Site/World activation 各节） | `settlementRuins`、`village.history` | 检视卡构建时 | 无 | O( ruins≤80 ) | 遗址卡「原归属宗门 / 曾获援助 / 旧址之上」+ 同宗故城按钮 | **接纳 → P2** |
| 3 | Wildermyth 关系钩子 | 事件由真实关系挑人、密度受限 | https://wildermyth.com/wiki/Event 、/Event_Types | `relations`（mentor/lover） | 拜师 / 结道侣调用点 | 旧约数组（有界 24） | 每 tick 扫≤24 项 | 命簿经历 | **候选 → P3** |
| 4 | Endless Sky 有限状态 | 触发/完成/失败一次定案、幂等 | https://github.com/endless-sky/endless-sky/blob/master/source/ConditionSet.cpp 、/wiki/CreatingMissions | 双方 id、生死、关系现状 | 到期低频结算 | 同上 | O(1)/份 | 同上 | **候选 → P3**（kept/void/estranged 三态已实现） |
| 5 | Wesnoth EventWML/FilterWML | 一次性触发 + 存读档重复触发防护 | https://wiki.wesnoth.org/EventWML 、/FilterWML | — | — | — | — | — | 思路已并入 P3 的 `settledDay` 盖章（幂等）；过滤范式用于目标筛选。不引 DSL |
| 6 | Unciv Unique/Conditionals | 条件+参数+有限效果 | https://github.com/yairm210/Unciv/tree/master/core/src/com/unciv/models/ruleset/unique （`Unique.kt`/`Conditionals.kt`；本轮抓取超时，未逐行核verified，仅按委托书路径定位） | — | — | — | — | — | **只借范式**：P1 全部写成「条件派生纯函数」，不搬规则解释器 |
| 7 | rot.js EventQueue | 小型定时事件队列 | https://github.com/ondras/rot.js/blob/master/src/eventqueue.ts （已核验：`add/get/remove/getEventTime`，MinHeap；仓库级 BSD-3） | — | — | — | — | — | **放弃引入库**：`world.day % SWEEP_PERIOD` + `advanceWorld` 唯一时钟已足够 |
| 8 | RimWorld 事件密度（可选） | 稀有度/冷却压刷屏 | 游戏机制常识（wiki） | — | — | — | — | — | 接纳原则但本轮未新增任何编年史条目，**无需改动** |
| 9 | OpenTTD 限期机会 | 机缘有截止 | 游戏机制常识 | `sites.age`/`SITE_LIFESPAN_YEARS` | — | — | — | — | **放弃**：sites.js 已有寿命与「异象散去」，再做就是平行结算 |
| 10 | 传闻传播网络 | NPC 间传话 | — | — | — | 无上限数据 | — | — | **放弃**：委托书明令禁止，且需知识模型 |
| 11 | 秘境异闻（委托书给出的 P3 替代） | 只读真实到访/奖惩 | 本仓 `sites.js` | `site.artifactId`、`visits` | 检视卡构建时 | 无 | O(1) | 遗蜕卡「遗物 / 遗物线索」行 | **并入 P1**（见 §2） |

---

## 2. 实际完成项

### P1 遗物传闻（完成，已接线）

- **事实层（1 行）**：`artifacts.js` 的 `toGround()` 把「遗落」写进法宝自己的 `history`（kind `'lost'`，日期=遗落日）。履历上限 `HISTORY_CAP=10` 照常兜底；`'lost'` 不在 `TRANSFER_KINDS` 里，`ownerLine` 的历代主人链不受影响；`history` 整组随法宝对象存档，**存档形状零改动**。
- **派生层（新模块 `sim/relicRumors.js`，纯函数、零写入、零 RNG、零新存档键）**：
  - `artifactClueLine(world, a)`：地上的报「第X年遗落于{地貌}，至今已躺 N 年」，躺过七成朽坏年限追加「年岁已久，恐将朽坏」；在手的若曾失落报「据第X年所记，此物曾一度失落人间，后为人所得」——**不虚构失落地点**（履历里没有，现坐标是持宝人的）。
  - `artifactClueRows(world, a)`：来历 / 遗落 / 现状 / 旧闻，供 3D 检视卡。
- **展示层（全部既有只读检视路径）**：
  - `main.js` 凡间检视：无主之物行拼上遗落线索；修士卡对最好的法宝追加「遗物旧闻」行；
  - `ui/realmInspector.js`：3D 拾取的凡间法宝卡补来历/遗落/现状；遗蜕卡按 `site.artifactId` 真实查询地上法宝——**在的报名字与来历，不在的如实说「或已先为人取走，或已朽坏」**（即委托书替代方案「秘境异闻」的最小形态，并入此处，不另立玩法）。
- **身份纪律**：线索模块不读关系网（源码级断言）、不做同名匹配、不派生任何「旧主弟子寻物」剧情。履历里只有名字，名字只是展示字。

### P2 故城旧事（完成，已接线）

`ui/settlementInspector.js` 两处纯派生（卡片构建时现算，零新状态）：

- **同宗故城链**：遗址卡按 `lastFactionId` 找同一位旧主名下、离得最近的 ≤3 处其他废墟，走既有 `data-inspect-ruin` 按钮链（main.js 零新增管线）——故城可以一处处走读。
- **旧址之上**：旧地若已重建新村，如实指认「{新村名} 重建于此（第X年 立村）」；无重建不编。活村卡的「旧址」旧径原样保留（回归保护）。

### P3 人物旧约（候选完成，**未接线**）

`sim/oldPacts.js`：`offerPact`（只认真实双向关系；师徒按镜像判定、道侣同字判定）/ `duePacts` / `settlePact`（kept / void / estranged 三态；`settledDay` 幂等盖章；重复推进、读档重放恒得同一结果；结算只判「人还在不在、关系还在不在」，**不伪装空间行为**）。全程零 RNG。

**未接线的结构性保证**：该文件不被任何游戏路径 import（定向测试做源码级断言，含 `save.js` 无 `pacts` 键）。接线清单见 §7。

---

## 3. 改动文件与原因

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `src/inkbox/sim/relicRumors.js` | 新增（~130 行，纯函数） | P1 线索派生；独立成模块以便 realmInspector 的只读契约 import |
| `src/inkbox/sim/artifacts.js` | `toGround()` +1 行 `pushHistory(a, day, 'lost', null)`（含注释） | P1 事实层：遗落是履历的一部分，此前只有易主入履历 |
| `src/inkbox/main.js` | import +2 处展示（约 8 行） | P1：无主之物行、修士卡遗物旧闻 |
| `src/inkbox/ui/realmInspector.js` | import + 法宝卡线索行 + 遗蜕卡遗物行（约 18 行） | P1：3D 检视同源读数 |
| `src/inkbox/ui/settlementInspector.js` | `sameSectRuins` / `liveSuccessor` + 2 处行（约 30 行） | P2 |
| `src/inkbox/sim/oldPacts.js` | 新增（候选，未接线） | P3 降级形态，委托书明令允许 |
| `scripts/inkbox-wanxiang-check.mjs` | 新增（16 项定向检查） | 功能验收 |
| `scripts/inkbox-wanxiang-browser.mjs` | 新增（5 项玩家验收） | 真实入口验收 |
| `package.json` | +`test:wanxiang` / `test:wanxiang:browser` 两条脚本 | 与仓库既有定向入口同款 |

未触碰：`save.js`、`advance.js`、`World.js`、`relations.js`（PR #30 施工面）、`sites.js`、`settlementResilience.js`、任何 `render3d/` 文件、任何 CI workflow。

---

## 4. 功能验收（`node scripts/inkbox-wanxiang-check.mjs`，16 项全过）

- **成功路径**：`toGround` 写履历（kind/日期正确、主人链不受影响）；地上线索带年份/地貌/躺了多久/朽坏预警；拾取后履历依次 lost→found；P2 遗址卡四要素、同宗链双向可走且异宗不混入、无旧主链为空；P3 兑现/落空/缘尽/幂等。
- **条件不满足**：在手法宝不报地上线索；失落地点履历里没有就不说；P3 无真实关系不立约、亡者不立约；无同宗废墟不编链；旧址未重建不编行。
- **身份失效/读档**：存→读→履历与线索逐字一致、id 不变；同名两位持主按条目如实计数、不相并不误连；线索模块源码级断言不读 `relations`、不写编年史。
- **自然样本**（非夹具）：seed 90125 小景无干预推进 120 年——在世法宝 3 件，其中带「遗落」履历 1 件、换过主人 1 件。**自然世界里真实发生了。**
- **展示零成本断言**：同一 tick 上把全部线索函数对全部法宝跑一遍，与不跑的对照世界 chronicle / day / artifactLog / nextArtifactId **逐字节一致**。

## 5. 性能与门禁验收

| 门禁 | 结果 |
| --- | --- |
| `npm test`（core 四件套） | 通过 |
| `npm run test:save-equivalence` | 通过（读档瞬间结构完整） |
| `npm run test:regression` | 通过（26 项） |
| `npm run test:three-realms` | 通过 |
| `npm run check:ui` | 通过（127 项） |
| `npm run test:wanxiang` | 通过（16 项） |
| `npm run profile:c1:cpu -- --baseline=<d4faed3 工作副本>` | 512×320、240 步 ×3 轮对照：**中位比 0.702**（候选/基线，<1 即无回归；基线与候选的实体/聚落/宗门读数逐轮一致 266/10/2——`lost` 履历未扰动模拟轨迹） |
| rAF 路径 | **零新增工作**：派生只在玩家点击检视时执行；无逐帧扫描、无渲染 Pass 改动、无 Three 改动 |
| 存档增长 | 零新增键；每件法宝最多多占 ≤10 条既有上限内的履历条目 |
| Canvas/Three 实测范围 | **Canvas 实测通过**（真实点击、截图 5 张在 `reports/local/wanxiang/browser/`，已 gitignore）；**Three 未测**，不宣称通过——3D 卡片走同一批纯函数与既有行渲染，风险有限，待 Sol 6.1 浏览器门禁覆盖 |

## 6. 玩家验收（真实入口，5–10 分钟）

**试玩步骤**（Canvas）：

1. `npm run dev` → 打开 `http://127.0.0.1:4180/inkbox.html`（或直接玩一局到 ~70 年后做第 3 步）。
2. 载入自然样本档：报告目录里 `reports/local/wanxiang/browser/wanxiang-natural-save.json`（由 `node scripts/inkbox-wanxiang-browser.mjs` 用正式模拟生成的 72 年无干预世界，非手改数据）→ 底部「导入」→ 选该文件 → 创世菜单点「继续游戏」。
3. **遗物传闻**：镜头移到法宝所在格（验收样本：50,91），点击 → 检视卡「无主之物」行读出 `绝品灵品衣甲　第71年遗落于旷野，至今已躺不足一年`；再次点击 → 卡面逐字一致（确定性）。躺得越久越接近「恐将朽坏」。
4. **故城旧事**：点击地图上的「遗址」墨标（样本：云坳 @(45,90)、梅镇 @(103,24)）→ 卡面读出 现状=遗址 / 原归属宗门 / 荒废之年 / 主要原因 / 曾获援助（若有）/ 旧址之上（若已重建）；若该宗还有其他废墟，卡底出现「旧址 · ○○」按钮，点过去即达下一座故城。
5. 回访：同一格再点一次，读数不变——线索是纯派生，不随时间漂移、不随读档分叉。

自动化版本即 `npm run test:wanxiang:browser`（真实服务器 + 真实 Edge/CDP + 真实文件导入 + 真实画布点击，本轮 5/5 通过）。

## 7. 已知限制与等基线之后的事

- `ownerLine` 只能以**名字**展示历代主人（稳定 ID 链需要扩履历形状，本轮刻意不做）。因此 P1 首版没有「旧主的活弟子在找它」这类行动——那是身份链落地后才允许派生的内容。
- 高频易主的低价值法宝，`HISTORY_CAP=10` 会让早期履历被新条目顶出（有界、如实）。
- 自然样本里的遗址暂无同宗废墟可链（浏览器验收如实跳过该分支；链逻辑由定向测试覆盖）。世界更老时链自然出现。
- **P3 接线清单**（等 Sol 6.1 接纳、PR #30 合流后）：① `save.js` 读写两侧加 `world.pacts`（照 `watch` 的先例，兜底 `[]`）；② 触发点挂 `relations.js` 的拜师/结道侣成功调用点（低概率，勿动 RNG 次数——需在独立种子流或确定性条件下触发）；③ 低频到期结算挂进 `advance.js` 某一拍；④ 结算文本走 `world.record(text, 'relation', [a, b])` 进双方命簿。在此之前 P3 保持候选，不冒称已完成。
- 本轮未改任何 CI workflow；`test:wanxiang*` 是否入 Fast/Heavy 由集成方决定。

## 8. 回滚方式

分支整体放弃即回滚：`git worktree remove ../inkbox-wanxiang && git branch -D feat/wanxiang-v01-glm`（基线 `d4faed3` 未被推送任何提交）。若只回滚单项：P1 事实层是 `artifacts.js` 一行，删掉后线索函数对老档自然退化为「无遗落可报」，不需要数据迁移；存档无新键、无版本变更，改动前后存档互通。

## 9. 交付物清单

- 代码：§3 所列 9 个文件（2 个新 sim 模块、4 处最小接线、2 个测试脚本、2 条 npm 脚本）。
- 文档：本文件（`docs/development/WANXIANG_V01_DELIVERY.md`）。
- 验收产物：`reports/local/wanxiang/browser/`（截图 5 张 + report.json + 自然存档；gitignore 内，不进正式包）。
- 未做：大型调研报告、过程截图、性能专项、任何合流动作。
