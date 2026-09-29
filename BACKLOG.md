# Inkbox Backlog

> **本文件只放「还没做」的事。已完成的功能不许留在这里。**
> 分区：**P0 阻塞** · **P1 当前工程** · **P2 后续体验** · **ICEBOX 暂停研究**。
> 每条给一个稳定编号 `#N`；**源码注释引用编号即可**（已关闭的旧编号见文末表）。
> 当前阶段去哪 → [`ROADMAP.md`](./ROADMAP.md)；历史 → `STATUS.md`。

## P0 阻塞

- 暂无。

## P1 当前工程

- 暂无。

> 上一轮 P1 `#1`–`#7`（**Render3D M1.1D「Development Hardening」**）**已全部完成**——
> 落点见文末「已关闭编号」表；过程与数据见 `Render3D M1.1D 工程报告.md`。
> 下一阶段 **Render3D M2「三界空间表现架构」尚未开始**，开工前先做设计方案裁决（见 `ROADMAP.md`）。

## P2 后续体验

- `#8` 根据玩家使用情况，收敛工具提示和事件阅读路径。
- `#9` 检查灾祸以外的重要持续事件是否也需要可读的结局记录。
- `#10` 记挂的「红点」目前只在点标题时整体清读（无通知中心）。若玩家反馈「漏看」，再考虑按人未读标记。
- `#11` `render/overlayLayer.js` 头注释里提到的「记挂目标环」尚未做（记挂已有落点墨环反馈，暂不重复）。
- `#12` 关系图只画「当前选中人物的一跳关系」（按 D7-F 规格，不做全世界社会网络）。
- `#13` 「战争刚开始后几秒」的短暂战线由 `render/fxLayer.js` 的 `war-start` 特效承担；
  overlay 的常驻战争线只在「观察某宗门 / 按 W」时出现（避免蜘蛛网）。

### P2-b 工程瑕疵（非阻塞 · 原「P3 小修」）

> 明确**不阻塞**主线的代码卫生问题。修它们要单独开包，**不许顺手改**。

- `#14` **右栏太长**：`inkbox.html` 右栏已有 12 个区，滚到底很累。
- `#15` `inspectAt(x, y)` **没有整数守卫**：传浮点坐标会静默落到别的格。
- `#16` **零读者死数据**：`FIRST_LESSON` / `lineageStory` 全仓无人读。
- `#17` `attack()` **缺 1v1 语义**：多人战斗与单挑走同一条路径。
- `#18` 实体**没有 `bornDay`**：年龄只能从寿元反推。
- `#19` `GROUND_DECAY_YEARS` **从不触发**：地面法宝的衰减路径实际不生效。
- `#20` `decayYears < 0` 的「永不消散」哨兵**与实现相反**：`stepNether` 判据是
  `day >= e.ghostDecayDay` ⇒ `0 >= -1e9` 恒真 ⇒ 传负数的鬼魂**立即消散**（与注释写反）。
  生产路径（`reincarnation.js`）不传该参数 ⇒ 目前无玩家可见后果。
- `#21` 本机 `spawnSync(<任意 exe>)` 被环境拦截（EBUSY）⇒ `npm run build` 的 tar 步要手工补 zip
  （copy 已完成；用 System32 的 bsdtar，**不能加 `--force-local`**）。

## ICEBOX 暂停研究

> 想到这些内容时记在这里，**不要施工**。需要时先与用户裁决。

- `#22` **D8-G「跨界追迹」UI**：纯逻辑地基（`ui/realmTrace.js` + `sim/watch.js` 的 `netherGhostOf`）
  已保存并由 `test:view` V9 钉住，**UI 未做**；本阶段不扩建 Canvas 版 D8-G。
- `#23` **三界 3D**：上界 / 幽冥 3D、3D 视界（属 Render3D M2/M3，M2 尚未开始）。
- `#24` 复杂视界特效 · 多视界同开 · 全图永久另一界模式。
- `#25` 幽冥宗门 / 鬼城 / 幽冥战争 · 上界大型政治经济系统 · 第四世界 · 新种族 · 寻路 / A\*。
- `#26` 跨界战争 / 幽冥入侵。
- `#27` **`save.js` schema 重构**：含 `worldEventState` / `worldEvents` 键名不匹配等历史遗留；
  会动存档格式 ⇒ 必须单独开包。
- `#28` **`planes.transfer()` 架构统一重写**（现有跨界入口继续按需维护，**不要碰**）。
- `#29` ECS · 状态管理库 · 物理引擎 · BVH / chunk / worker / shader rewrite。
- `#30` 长局模拟、随机种子矩阵、极端人口 / 灾难与性能研究（需要时再运行现有探针）。

## 已关闭编号（**不是待办**）

> 两类来源：① **上一轮 P1**（Render3D M1.1D 的 `#1`–`#7`，本阶段已交付）；
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
- **Render3D M0 / M1 / M1.1D 已完成**（M0 地形技术原型 · M1 世界实体可见化 · M1.1D 工程加固）；
  性能数据采自**软件光栅器**，只作相对数据，见 `Render3D M1.1D 工程报告.md`。
