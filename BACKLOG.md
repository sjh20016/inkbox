# Inkbox Backlog

2026-10-08 M2-C2E本机工程验收完成。保留后续议题：最大图每日全范围dirty/植被派生长尾、DPR2 GPU预算、历史RNG游标持久化；复杂侵蚀、Chunk Streaming、物理崩塌及自动搬迁仍未授权实现。真实测量见 [性能](./M2C2E_PERFORMANCE_REPORT.md)。

> **本文件只放「还没做」的事。已完成的功能不许留在这里。**
> 分区：**P0 阻塞** · **P1 当前工程** · **P2 后续体验** · **ICEBOX 暂停研究**。
> 每条给一个稳定编号 `#N`；**源码注释引用编号即可**（已关闭的旧编号见文末表）。
> 核对：2026-10-06，M2-C2C 本地完成，远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行；C2B Pass 1 远端封板仅作历史基线。当前阶段 → [`ROADMAP.md`](./ROADMAP.md)；历史 → `STATUS.md`。

## P0 阻塞

- 暂无。

## P1 当前工程

- 暂无已授权的 runtime 施工。C2C 本地验收收口已关闭为 `#33`；远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行；两类状态单独保留，不重开已通过的本地工程。下一阶段优先真实宗门 / 灵脉空间归属，需后续授权；R1 只留 Lab，R2 不授权道路。

已完成范围（不作为待办）：四类 Site、Leyline、Upper qi、Nether veg、持久 Rift / 短命 FX 六开关；production on 用正式资源，off / 不适合时诚实回退。11 模式 × 600 日 / 11 RNG / 49 save keys 一致，SHA `4b37e9605591ef48e986833513a5f633da7ef28bc080f326dc884efe44abb498`；23 对 GPU、600/6000 Soak、两关键祖先、干净克隆与包审计通过。七命令见 [测试索引](./tests/README.md)，最终本地状态见 [C2C READINESS](./M2C2C_READINESS.md)。

开关名称为 `sites` / `leylines` / `upperQi` / `netherYin` / `rifts` / `riftFx`，属于表现状态，不成为 World 或存档字段。

当前手动 `.github/workflows/c2c-browser.yml` 只跑 C2C 和两个关键祖先；原 `.github/workflows/ci.yml` 的完整历史 Browser、Heavy 与 Nightly 分层保留，远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行。R2 研究不足以授权 runtime 道路：开发路径 `research/MOVEMENT_TRACE_REPORT.md` 不随运行包，研究或 Golden 文件不作为产品依赖。

> 上一轮 P1 `#1`–`#7`（**Render3D M1.1D「Development Hardening」**）**已全部完成**——
> 落点见文末「已关闭编号」表；过程与数据见 `Render3D M1.1D 工程报告.md`。
> Render3D M2-A 至 M2-C2C 均已本地完成；远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行，具体证据范围见 [`ROADMAP.md`](./ROADMAP.md)。

## P2 后续体验

- `#8` 根据玩家使用情况，收敛工具提示和事件阅读路径。
- `#9` 检查灾祸以外的重要持续事件是否也需要可读的结局记录。
- `#10` 记挂的「红点」目前只在点标题时整体清读（无通知中心）。若玩家反馈「漏看」，再考虑按人未读标记。
- `#11` `render/overlayLayer.js` 头注释里提到的「记挂目标环」尚未做（记挂已有落点墨环反馈，暂不重复）。
- `#12` 关系图只画「当前选中人物的一跳关系」（按 D7-F 规格，不做全世界社会网络）。
- `#13` 「战争刚开始后几秒」的短暂战线由 `render/fxLayer.js` 的 `war-start` 特效承担；
  overlay 的常驻战争线只在「观察某宗门 / 按 W」时出现（避免蜘蛛网）。
- `#31` **Three FX snapshot 成本**：当前 snapshotPlane 复制并冻结 FX。未来 FX 负载增加时再评估版本化快照或不可变记录；M2-A 事件量低，本轮不优化。
- `#32` **完整视界的冷启动负载**：后续 Layer / FX 扩展保留 first-open / repeat-open 与实际 GPU 标识；当前测量不支持先造 PreloadManager。

### P2-b 工程瑕疵（非阻塞 · 原「P3 小修」）

> 明确**不阻塞**主线的代码卫生问题。修它们要单独开包，**不许顺手改**。

- `#14` **右栏布局继续收敛**：已有分区折叠；整体布局 / 阅读路径是否仍需改进，依玩家反馈单独开包。
- `#15` `inspectAt(x, y)` **没有整数守卫**：传浮点坐标会静默落到别的格。
- `#16` **零读者死数据**：`FIRST_LESSON` / `lineageStory` 全仓无人读。
- `#17` `attack()` **缺 1v1 语义**：多人战斗与单挑走同一条路径。
- `#18` 实体**没有 `bornDay`**：年龄只能从寿元反推。
- `#19` `GROUND_DECAY_YEARS` **从不触发**：地面法宝的衰减路径实际不生效。
- `#20` `decayYears < 0` 的「永不消散」哨兵**与实现相反**：`stepNether` 判据是
  `day >= e.ghostDecayDay` ⇒ `0 >= -1e9` 恒真 ⇒ 传负数的鬼魂**立即消散**（与注释写反）。
  生产路径（`reincarnation.js`）不传该参数 ⇒ 目前无玩家可见后果。

## ICEBOX 暂停研究

> 想到这些内容时记在这里，**不要施工**。需要时先与用户裁决。

- `#22` **D8-G「跨界追迹」UI**：纯逻辑地基（`ui/realmTrace.js` + `sim/watch.js` 的 `netherGhostOf`）
  已保存并由 `test:view` V9 钉住，**UI 未做**；本阶段不扩建 Canvas 版 D8-G。
- `#24` 复杂视界特效 · 多视界同开 · 全图永久另一界模式。
- `#25` 幽冥宗门 / 鬼城 / 幽冥战争 · 上界大型政治经济系统 · 第四世界 · 新种族 · 寻路 / A\*。
- `#26` 跨界战争 / 幽冥入侵。
- `#27` **`save.js` schema 重构**：含 `worldEventState` / `worldEvents` 键名不匹配等历史遗留；
  会动存档格式 ⇒ 必须单独开包。
- `#28` **`planes.transfer()` 架构统一重写**（现有跨界入口继续按需维护，**不要碰**）。
- `#29` ECS · 状态管理库 · 物理引擎 · BVH / chunk / worker / shader rewrite。
- `#30` 长局模拟、随机种子矩阵、极端人口 / 灾难与性能研究（需要时再运行现有探针）。

## 已关闭编号（**不是待办**）

> 当前 C2C 收口编号 `#33` 已关闭；历史编号另有两类来源：① **上一轮 P1**（Render3D M1.1D 的 `#1`–`#7`，本阶段已交付）；
> ② **更早一轮**的 BACKLOG 编号制（早已随文件重写消失），源码里仍能搜到
> `BACKLOG #12` / `BACKLOG #13` / `BACKLOG ⑭` 这类注释——在这里给出落点，
> 免得下一个人以为是待办项。

| 旧编号 | 内容 | 现状 |
| --- | --- | --- |
| `#1` | 仓库真相统一（四份文档对齐 `main`、去漂移、commit 路标可解析） | **已完成**：Render3D M1.1D |
| `#2` | 分支与版本基线（`main` 唯一主线、建 `render3d-m0` tag、不重写历史） | **已完成**：tag `render3d-m0` 已推送 |
| `#3` | 分层 GitHub Actions（Fast / Heavy Gate，browser 与 longrun 不入普通 CI） | **已完成**：`ci.yml` + `nightly.yml` |
| `#4` | `WorldRenderBridge` dirty 分类（height / water / type / veg） | **已完成**：`npm run test:render3d:bridge` |
| `#5` | 性能基线重测（GPU 信息 + 逐层 profiling + JSON） | **已完成**：`npm run test:render3d:perf` |
| `#6` | Three.js vendor 治理（运行时迁出 `node_modules`） | **已完成**：`vendor/three/**` + `npm run test:vendor` |
| `#7` | 收尾文档与工程报告 | **已完成**：`Render3D M1.1D 工程报告.md` |
| `#33` | C2C 本地验收收口 | **已完成**：23 对 GPU、600/6000 Soak、两关键祖先、干净克隆、包审计与四报告；远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行 |
| `#23` | 完整三界视觉层 / 正式 3D 视界 | **已完成**：M2-B 完成完整 Layer Mask、界缘、检视与 FX；后续 Art Pass 与三界视觉底座见 M2-C / C2B0 报告 |
| `#12` | 幽冥 `stepNether` 没接进推进循环 ⇒ 幽冥实体只增不减 | **已修**：统一入口 `sim/advance.js` |
| `#13` | 「游戏日驱动」时钟被各测试各自手抄一份 ⇒ 迟早与真实游戏脱节 | **已修**：`advanceWorld(world, days, deps)` 是唯一定义处 |
| `⑭` | 右栏区太多、太长 | **未修**：现为 `#14`（P2-b） |

## 口径澄清（不是待办，防止误重开）

- **D6-2 三界生态 A–F 已完成**；**D6-3 跨界生态 A–E 已完成**。
- D6-3 工程包 D 已交付**跨位面夺舍 / 附身**——**夺舍不是未开工事项**。
- D7-A 已关闭此前记录的干预分类、`worldEventState` / `worldEvents` 合法映射、负寿命哨兵、
  人物卡点击竞态与 tar 盘符路径问题。
- D7-B runtime event 是不入档的短时表现信号；`world.record()` 仍是唯一历史账本。
- D7-C/D/E/F 已交付：相机一次性 focus 补间 + 落点墨环（C）· FX 层（D）· 记挂系统（E）· 关系图与战争线（F）。
  表现层（`render/fxLayer.js` / `render/overlayLayer.js` / `render/relationGraph.js`）**不写世界、不抽 RNG、不进存档**——
  删掉 `fxLayer.js`，模拟结果逐字不变。
- 「记挂」（D7-E）是**玩家的观察者状态**（`world.watch`），不进三界人口守恒、不影响 AI、不给数值 buff。
- **Render3D M0 / M1 / M1.1D / M2-A / M2-B / M2-C / M2-C2A / C2A.1 / C2B0 / C2B Pass 1 / C2C 已本地完成**；D8-G UI 仍暂缓。
- M1.1D 的性能是软件光栅相对数据；M2-A 基线来自 Intel UHD 730 / ANGLE D3D11。Mask 当前隐藏多种 Layer，不能拿它的较低三角数证明完整视界更快。
