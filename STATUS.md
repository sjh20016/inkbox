# Project Status

## Current Truth · 2026-10-08

本文件是时间线与证据索引，不是当前状态的裁决来源；旧章节保留其记录日期和阶段范围。当前事实以 GitHub `main` `1cd8d36` 为准，M2-C2E 已合并。

| 日期 / 标识 | 记录 | 证据 / 说明 |
| --- | --- | --- |
| 2026-10-08 · main `1cd8d36` | M2-C2E 已合并：地形拓扑、湿域 / 岸线 / 世界外缘、三种地貌与严格 seed、雕刻事务、渐进访问及完整预生成世界 | [C2E readiness](./M2C2E_READINESS.md)、[实现报告](./M2C2E_IMPLEMENTATION_REPORT.md) |
| 2026-10-08 · CI `37749151683` | Heavy Gate passed；Fast Gate failed only at the historical C2D water-topology length assertion | 整理分支完整本地 Fast / Heavy Gate、build、package audit 全通过；公开 run 仍保留原始结果，Browser Smoke 因 Edge CDP 失败未到断言 |
| 2026-10-08 · PR #1 | 角色视觉草稿：head `30da87d`，base `codex/m2-c2d1-painterly-reconciliation` / `3a98fb2`；较当前 main 16 ahead / 6 behind，存在核心文件重叠 | 独立整合决策待办；不代表 main 当前状态 |

更早阶段条目是阶段快照。它们出现的“当前真相”、分支和门禁结论只对各自记录时点有效，不应覆盖本索引顶部的基线。

---

2026-10-08 当前阶段：**M2-C2D.1 本机工程验收完成，最终美术待人工裁决**。指定分支 `codex/m2-c2d1-painterly-reconciliation` 从 WIP `daf78c0` 续作；完整十二镜四轮 GPU 零正向预算、CPU、六层/GPU 契约、历史对照与原套件 600/6000 soak 通过。用户已授权完成后上传该分支，远端 CI 以最新对应提交为准。没有合并 main，未把旧 C2B/C2C 的 Actions 作为本阶段证明。入口：[就绪](./M2C2D1_READINESS.md)、[视觉](./M2C2D1_VISUAL_ACCEPTANCE.md)、[性能](./M2C2D1_PERFORMANCE_REPORT.md)。

以下 2026-10-06 段落为历史阶段记录。

2026-10-06 当前真相：**C2B Pass 1 的已封板基线为 main `e0a851c`**，第一代正式资产生产体系成立；Push CI [37224093479](https://github.com/sjh20016/inkbox/actions/runs/37224093479)、手动 Windows Browser / C2B 矩阵与 soak [37224107941](https://github.com/sjh20016/inkbox/actions/runs/37224107941)、800 年 Nightly [37233858438](https://github.com/sjh20016/inkbox/actions/runs/37233858438) 均成功。它们是 C2B 基线证据，不代表 C2C 远端封板。**M2-C2C Meaningful Geography 已本地完成，远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行**；验收证据见下方。历史 C2B 资产报告：[性能](./M2C2B_PERFORMANCE_REPORT.md)、[视觉](./M2C2B_VISUAL_ACCEPTANCE.md)、[就绪](./M2C2B_READINESS.md)。

## 2026-10-06 · M2-C2C Meaningful Geography（本地完成）

工程已并入main；c67a0ee首次Push Heavy通过、Fast在旧dirty分类失败，426412d恢复原heightChanged派发并为生产Site/Leyline单独重验type准入。旧Bridge36断言、新C2C8组及完整Fast26命令通过，独立审查和case1/4两对GPU复验通过。原23对/Soak与修复复验分开记录来源，最终远端门禁以本轮main Actions为准，详见[就绪报告](./M2C2C_READINESS.md)。

已完成实现与本地验收：既有四类 Site、Leyline、Upper qi、Nether yin 与持久 Rift / 瞬时 FX 进入 Render3D 地理表现；六个开关独立，派生缓存归 Stage，未增改模拟、World 语义或存档字段。自然 Formation 8/4 阵点分别贴地，四家族均通过约 90px 正常视角生产几何与真实点击验收。

六开关为 `sites` / `leylines` / `upperQi` / `netherYin` / `rifts` / `riftFx`。正式生产开启时使用当前真实资产与字段，关闭 production 或资产/footprint 不适合时保留旧标记回退；原 `assets=off` 基线继续有效。七个委托命令均已接线，具体职责和独立复跑入口见 [测试索引](./tests/README.md)。

正式矩阵中的真实 900 日历史 R8 前后对照通过：441 个前景地表 GL 采样点中 87 点变化，RGB 总差 133。它证明真实场变化可见，不声称关联某个鬼魂的消失。

当前手动 `.github/workflows/c2c-browser.yml` 验当前 C2C 和两个关键祖先；`.github/workflows/ci.yml` 的完整历史 Browser 回归与旧 Node 门禁保留。C2B 历史三次成功 run 的证据身份不变，远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行。

本地纯度门禁完成：11 种模式各推进 600 日，11 条 RNG 流及完整 World / advanceState / 49 save keys 一致；full-state SHA `4b37e9605591ef48e986833513a5f633da7ef28bc080f326dc884efe44abb498`。该结果与 GPU 验收分别记录，均不替代远端 CI。

本地验收全部通过：完整 23 对 GPU off/on 矩阵通过，四类真实 Site 在约 90px 正常视角的生产几何与 CDP 点击通过；600 生命周期实际 update / render 各 600 次，6000 产品 RAF 帧及两个关键祖先 Browser 通过。干净克隆 ccac961 独立 npm ci 与 16 项安装 / CPU / 旧资产 / build 命令通过。6000 帧分为 20 × 300 帧，200 段检查均保持 114 geometry / 10 texture / 16 program。M2-B 祖先的 Upper / Nether / boundary 分别有 173 / 235 / 91 个可见几何命中，visible geometry === hit；C2B sample 三档真实 GLB 点击通过。运行包为 333 文件，目录约 8.8MB、ZIP 约 2.7MB；compact acceptance summary 保持不超过 256KiB。8 张正常 Golden 共 7206282 bytes，选择 case 1 / 3 / 4 / 5 / 6 / 8 / 12 / 14，位于开发路径 reports/release/render3d-m2c2c/golden/，不进入 runtime。 远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行。额外 d9ca78b 干净克隆 cold 复验与 8 项坏缓存拒绝检查通过；自动生成 / 重建后 save、World / advance / history SHA 与原 23 对矩阵一致。case 1 / 4 诊断保持 World / advance / camera，Formation105 38/96 前景三角且真实点击成功、error 0；diagnosticComplete=true、pass=false 保留诊断身份，不替代完整矩阵。证据入口：[就绪](./M2C2C_READINESS.md)、[工程与24项答复](./M2C2C_MEANINGFUL_GEOGRAPHY_REPORT.md)、[性能](./M2C2C_PERFORMANCE_REPORT.md)、[视觉](./M2C2C_VISUAL_ACCEPTANCE.md)；全量本机结果位于开发路径 reports/local/m2c2c/。

范围继续限于 World 已有语义，不新增 World 事实、城市、道路或浮岛拓扑。250 年 R2 端点研究显示局部流量与占据 Pearson 相关 0.8904、top-24 平均重合 64.17%，不支持 runtime 道路地景化。R2 报告在开发路径 `research/MOVEMENT_TRACE_REPORT.md`（研究目录不进入运行包）。

后续优先研究既有宗门 / 灵脉空间锚点；Upper 仙门需要真实语义，R1 群体动画只留 Lab。幽冥城市、上界宫城、浮岛拓扑及 Gameplay G 均未授权。

## 2026-10-04 · C2A.1 / C2B0 三界视觉基线（历史）

当时的 C2A.1 / C2B0 封板内容：运行包瘦身、2–4 屋顶簇 HLOD、真实产品 RAF 密林测量。三界由 stage-local 深冻结 Profile 派发，3D 默认 v1、legacy 可切换；24 对 / 48 张新截图、真实裂缝破口 / 拾取 / Region、600 日六模式完整 World 与 11 RNG，以及 600 + 6000 帧 / 21 次 GC 峰值门禁通过。资源数保持 53 geometry / 7 texture / 13 program；未改模拟、生成器或存档。其后第一代正式资产体系已由 C2B Pass 1 投产并远端封板，详见顶部当前真相与 [C2B READINESS](./M2C2B_READINESS.md)。下文是更早阶段历史。

## 2026-10-03 · M2-C2A 实体 LOD 与密度预算

已接入 Tree / Character / Building 三档真实几何、统一屏幕像素迟滞、可见对象优先预算和凡间聚落 HLOD 原型。现有 GLB 角色与施工前本地修改保留，模拟/世界生成没有改动。核心8组、最终浏览器15项和600+6000帧耐久通过；六模式600日完整World与RNG一致。Golden / Dense总面数减少53.45% /59.16%，总览draws保持12。详见 [实施报告](./M2C2A_LOD_REPORT.md)、[性能报告](./M2C2A_PERFORMANCE_REPORT.md)、[视觉验收](./M2C2A_VISUAL_ACCEPTANCE.md)。允许单家族受控试产，大量扩产仍需新家族及多设备预算。资产家族、群体动画、完整 HLOD 与 Trace Field 尚未扩产。下方 M2-C 及更早记录保留为当时事实。

## 2026-10-03 · M2-C 写意渲染基线

M2-B 的视界工程已完成；M2-C 接入单一 ArtPass、只读高度/类型纹理、颜料地形、稀疏结构墨、共享民居/树/Mini 修士母版与开发调参。三界高程、Mask、拾取和模拟边界保持。实际门禁、Edge 图像、性能和后续范围由 [M2-C 工程报告](./M2C_EXPRESSIVE_INK_REPORT.md) 与 [ROADMAP](./ROADMAP.md) 收口。

用户新增 `美术素材/配色参考` 和实验建筑素材，允许后续调整；参考索引已登记。完整家族、动画、几何 LOD/HLOD 和 Trace Field 未施工。下面的 2026-09-30 索引保留为历史记录。

## 2026-09-30 · 历史状态索引（历史）

> 2026-09-30 收口：顶部是当前状态索引；下方日期章节保存当时事实，旧阶段的“当前 / 下一阶段”、测试数和禁令不适用于新任务。
> 接手看 HANDOFF / ROADMAP；规则看 THREE_REALMS / VIEW_CONTRACT；本文件不承担当前施工授权。

- 当前活跃版本：Inkbox 1.0.0（`src/inkbox`）
- 当前入口：`inkbox.html`（3D 立体沙盘：`inkbox.html?renderer=3d`）；`npm run dev` 从 `http://127.0.0.1:4180/` 启动
- 当时阶段：**Render3D M2-A 架构原型已完成**（2026-09-30）。一个 Host 管理三界 Stage，共享相机与视界状态，提供按位面拾取、只读 FX、Mask 与矩形 Slab 探针。13 组架构不变量、12 套发布门禁与 Edge 浏览器验收通过；交付证据和局限见 `Render3D M2-A 架构原型工程报告.md`。
- 当时收口包：**M2-A final cleanup**；只处理文档 / 记忆一致性、工作区归属、CI 和 checkpoint，M2-A 功能封板。
- **上一阶段（已完成）**：Render3D M1.1D 工程加固；更早的 M1 实体可见化见各阶段报告。
- 当时下一阶段：Render3D M2-B；其后续工程已完成，现况见本文件顶部及 [ROADMAP](./ROADMAP.md)。
- **正式完成**：D6-2 三界生态 **A–F** · D6-3 跨界生态 **A–E** · D7 观察与表现层 **A–G 封板** · D8 视界 2.0 **A–F** · **Render3D M0**（地形 / 水体 / 植被 / 相机 / Raycast / 地形雕刻，`npm run test:render3d`）· **Render3D M1**（实体 / 聚落 / 宗门山门 / 法宝地点灵脉标记 / 3D 选中环，`npm run test:render3d:m1`）· **Render3D M1.1D**（工程加固，`npm run test:render3d:bridge` + `npm run test:vendor`）。
- **WIP / 暂缓**：**D8-G「跨界追迹」**——纯逻辑地基（`ui/realmTrace.js` + `sim/watch.js` 的 `netherGhostOf`）已保存并由 `test:view` V9 钉住，**追迹 UI 未做**；本阶段不继续扩建 Canvas 版 D8-G。
- **接手先读 `HANDOFF.md`**；阶段看 `ROADMAP.md`，目录与模块边界看 `ARCHITECTURE.md`，视界规则看 `VIEW_CONTRACT.md` v2。
- 三界规则唯一成文处：`THREE_REALMS.md`（事实核对日期 2026-09-27 · D6-2 A–F · D6-3 A–E · D7-A/B/C/D/E/F/G）
- 主线与 checkpoint：`main` 唯一活跃；tag `render3d-m0` 为 M0 快照，`render3d-m2a` 指向 `f274def`，不重写已发布历史。
- **活跃资产**：`剧情文案素材/` 已入 Git 并随包；`美术素材/` 已入 Git，尚未被 Render3D 消费，不在 dist。
- **历史参考**：Git 中的旧 V3/V4 源码，以及当前 `scripts/_*.mjs` 一次性研究探针；旧 `src/main.js` / demo 不在本工作树，根 index / game 页面是跳转入口。
- ⚠️ **本文件里的 commit hash 只写发布仓库可达的**。本工作区的完整开发史**不对外发布**，
  本地施工提交（如 D7 七包各自的提交）在别人克隆的仓库里解析不了 ⇒ 这里一律改用**阶段描述**。

---

## Render3D M2-A 与 final cleanup（2026-09-30）

- 截至 2026-09-30 的 M2-A 功能基线：发布仓库 `f274def`；Host / 三界 Group Stage / 统一视界状态 / 位面拾取 / FX 只读探针 / 世界 Mask / 矩形 Slab 已交付。当时 M2 整体、M2-B 与 D8-G UI 尚未完成；M2-B 后续已完成，现况见顶部当前真相。
- 本地验收：13 组架构不变量、600 日三路等价、12 套门禁；Edge 160 点拾取零错误、11 项生命周期 / UI 检查。证据与原型局限见 `Render3D M2-A 架构原型工程报告.md` 和 `reports/release/render3d-m2a/`。
- [M2-A CI run 36651925371](https://github.com/sjh20016/inkbox/actions/runs/36651925371)：`f274def` Fast / Heavy 成功。push 的 Browser Smoke 按设计 skipped；不能把本机 JSON 当该 runner 的浏览器复验。
- [Nightly run 36636327689](https://github.com/sjh20016/inkbox/actions/runs/36636327689)：schedule 实跑成功，源码是 **`b9f9f12`**；记录成立，但不是 M2-A HEAD 的 Nightly 证据。
- final cleanup：BACKLOG、HANDOFF、STATUS 收口；VIEW_CONTRACT v2 用世界 Region 描述 V1–V11；ARCHITECTURE 说明模块与 Git / dist 归属。本地记忆改为正式文档索引，重复旧笔记和诊断输出经校验备份后清除。
- 门禁收口：Fast Gate 加 `test:vendor`；手动 Windows Browser Smoke 顺序复验 `test:browser` 与 `test:render3d:m2a:browser`，runner 输出独立上传 artifact，不改本机硬件基线。
- **cleanup 远端实跑成功**：源码 `727f36a` 的 [push CI 36670103840](https://github.com/sjh20016/inkbox/actions/runs/36670103840) 与 [手动 CI 36670107531](https://github.com/sjh20016/inkbox/actions/runs/36670107531) 均 success；手动的 Fast / Heavy / Browser 三个 job 全绿。Canvas **144 / 0**，M2-A 两界各 **80 点 / 零错误**。runner 为 Microsoft Basic Render Driver 软件光栅，属于功能复验，不替代 Intel UHD 730 性能基线。
- 远端浏览器证据：artifact `inkbox-browser-36670107531-1`（34 文件，截图 / JSON / 日志），SHA256 `22541bf3aaa46202d8b4e19af28b453dcb4a784286603c4b2d7d5c54fe5c6400`。首次手动复验停在页面挂载；改由 `inkbox-browser-smoke.mjs` 同宿主管服务器 / 两套原测试，并保留启动诊断后复验成功，未修改原浏览器断言。
- checkpoint：`render3d-m2a` → `f274def`；cleanup 单独提交，不拆改原聚合历史。后续按可验证的架构 / 边界 / Layer / 测试 / 文档变更分包。

## 历史记录（以下按当时阶段理解）

## Render3D M0.5 → M1「工程收束 + 3D 世界实体可见化」（2026-09-28）

委托书：`坐天观井 · 下一阶段工程委托书.md`。唯一战略目标：**保留现有模拟世界作为唯一真相，
让 Three.js 从「地形技术原型」成长为「可以实际观察世界的沙盘」**。

- **M0.5 工程收束**：工作树审计（确认 D8-G 只有地基、无换行符 churn）· 单独封存 D8-G 语义修改
  （`wip(d8-g): preserve cross-realm trace groundwork`）· 修正 README / HANDOFF / STATUS 文档真相 ·
  建立阶段基线（core 67 文件 246 边 · view 111 · presentation 127 · render3d 19 组 · build 108 files 全绿）。
- **M1-A EntityLayer**：`render3d/entities/deriveEntities.js`（纯派生）+ `entities/EntityLayer.js`（InstancedMesh）。
- **M1-B SettlementLayer**：`render3d/settlements/SettlementLayer.js`（村落 / 屋舍 / 宗门山门）。
- **M1-C WorldMarkerLayer**：`render3d/markers/WorldMarkerLayer.js`（无主法宝 / 地点 / 灵脉 / 裂缝）。
- **M1-D 选中提示与工具保真**：`render3d/SelectionMarker.js` + 复用 `inspectAt()` 与 `cameraRig.focusOn()`。
- **M1-E / M1-F**：LOD 与性能纪律、Render Bridge 纪律（渲染器自持快照，不给 `World` 加 dirty）。
- **测试**：`scripts/inkbox-render3d-m1.mjs`（`npm run test:render3d:m1`，**36 项 / 0 红**）+ 浏览器探针 `scripts/_m1-viewshot.mjs`（场景 A–F 全过）。
- **收尾实测**：core **72 文件 / 262 边** · view 111 · presentation 127 · render3d 19 组 · render3d:m1 36 · **build 113 files**；
  全图 draw call **9**（M0 基线 3 ⇒ +6）· zoom=5 近景 **21** · **2832 实体全图仅 6** · 运行期**零控制台报错**。

---

## Render3D M1.1D「Development Hardening」（2026-09-28）

委托书：`Render3D M1.1D 工程任务清单.md`。**工程加固阶段，不新增任何玩法**（上界 / 幽冥 3D、3D 视界、
D8-G UI、新建筑、新交互、AI 行为、概率调整**全禁**）。只做五件事：仓库真相统一 · 分层 CI · dirty 分类 ·
性能基线重测 · Three.js vendor 治理。工程报告：`Render3D M1.1D 工程报告.md`。

- **D1 仓库真相统一**：README / HANDOFF / STATUS / BACKLOG 对齐 `main` 为唯一活跃主线；
  `BACKLOG.md` 整文件重划四区（P0 / P1 `#1`–`#7` / P2 `#8`–`#13` / P2-b `#14`–`#21` / ICEBOX `#22`–`#30`）
  并新增「已关闭编号」表；删掉全部**远端无法解析**的本地施工 hash（`f91ffd0` + D7 七包六个 hash）。
- **D3 分层 CI**：`.github/workflows/ci.yml`（**Fast Gate** + **Heavy Gate** 并行，`browser-smoke` 手动触发、
  `windows-latest`）+ 新建 `.github/workflows/nightly.yml`（smoke + 800 年长跑）。**无 `|| true`、不删测试。**
  ✅ **2026-09-29 推送 `main` 后自动触发并全绿**：Fast Gate 11 步 success · Heavy Gate 7 步 success ·
  Browser Smoke 按设计 skipped（run `36513752590` · 5.0 分钟）⇒「能运行」已从本地 YAML 合法性升级为**远端真绿**。
- **D2 分支与版本基线**：确认 `3856cee3e60f…` 仍在远端 `refs/heads/codex/render3d-m0` ⇒ 在发布仓库建
  annotated tag **`render3d-m0`**（指向它）并推送成功。**未做任何历史重写。**
- **发布同步（2026-09-29）**：发布仓库 `main` `447fa54` → **`43bbb79`**（含 M1.1D 全部内容）。
  `node_modules/three/*` 出库、`vendor/three/**` 入库、`.github/workflows/` 入库。⚠️ 本机 `github.com:443` 不通
  ⇒ 推送走 `api.github.com` 的 **Git Data API**，远端 SHA 与本地逐字一致。
- **D4 dirty 分类**：`WorldRenderBridge.changes()` 从「单 region」升级为 `{any, height, water, type, veg}`；
  新增纯函数 `mergeRegion(a, b)`；各 Layer 按**真实依赖**响应（Terrain ← height+type；Water ← height+water；
  Veg ← height+veg+type；Entity / Settlement / Marker / SelectionMarker ← **只有 height**）；
  新增逐层 CPU profiling（`bridgeScanMs` / `terrainUpdateMs` / `waterUpdateMs` / `vegetationUpdateMs` /
  `entityUpdateMs` / `settlementUpdateMs` / `markerUpdateMs` / `layerUpdateMs`）。
  **不给 `World` 加任何 renderer dirty 字段。**
- **D5 性能基线**：新建零依赖 CDP 性能脚本 `scripts/inkbox-render3d-perf.mjs` → `reports/render3d/perf-baseline.json`；
  自动记录 GPU 渲染器 / WebGL 版本 / 视口 / DPR / **Three.js 实际加载 URL**，并如实标注软件光栅器。
- **D6 vendor 治理**：Three.js 运行时从 `node_modules` 迁到仓库内 **`vendor/three/`**（5 文件 / 2.07 MB，含 MIT 许可证）；
  `inkbox.html` importmap 改指 `./vendor/three/...`；**npm `three` 依赖保留**给 node 测试。
- **测试**：新增 `scripts/inkbox-render3d-bridge.mjs`（`npm run test:render3d:bridge`，**36 项 / 0 红**）+
  `scripts/inkbox-vendor-check.mjs`（`npm run test:vendor`，**13 项 / 0 红**）；M0 19 组 / M1 36 项继续全绿。
- **收尾实测**：core **72 文件 / 262 边** · regression 22 · three-realms **151 ✓** · view 111 ✓ ·
  presentation 127 ✓ · save-equivalence 全绿 · render3d:bridge 36 ✓ · vendor 13 ✓ · **build 136 files**。
  ⚠️ 性能读数采自**软件光栅器**，只作相对数据（见 `Render3D M1.1D 工程报告.md`）。

---

## D7「观察与表现层」（2026-09-27）

规划见 `D7「观察与表现层」早期规划已完成.md`，A–G 七包严格按序。**核心验收**：表现层不写世界、不抽 RNG、不进存档——
删掉 `render/fxLayer.js`，模拟结果**逐字不变**。

- **A 零红基线**：关闭此前记录的干预分类、`worldEventState`/`worldEvents` 合法映射、负寿命哨兵、人物卡点击竞态与 tar 盘符路径问题。
- **B transient 运行事件通道**：`core/runtimeEvents.js`——WeakMap 队列、cap 256、**不进存档**、每帧 drain。
- **C Camera 2.0**：一次性 `focusOn` 补间 + 玩家输入立即接管 + 落点墨环（`render/overlayLayer.js`）。
- **D FX 层 1.0**：`render/fxLayer.js` 消费 B 的事件 → 短命特效；发射口 `sim/presentation.js`。
- **E 记挂系统 1.0**：`sim/watch.js`——玩家的观察者状态（`world.watch`），不挂实体、不抽 RNG、不进人口守恒。
- **F 关系与战争可视化**：`render/relationGraph.js`（一跳关系图，纯 SVG）+ `render/overlayLayer.js` 的 `drawWarLines`。
- **G 测试 / 文档 / 交接**：`scripts/inkbox-presentation.mjs`（86 项）· `npm run test:d7` · `HANDOFF.md`。

> ⚠️ A–G 各包在本工作区各有一个**独立施工提交**，但那些 hash 属**未发布的本地开发史**
> ⇒ 本文件不列它们（在别人克隆的仓库里解析不了）。发布仓库里 D7 整体是**一个阶段提交**。

---

## D8「视界 2.0 · 穿透式跨界观察」（2026-09-27）

规划见 `D8视界 2.0 · 穿透式跨界观察早期规划完成至F部分.md`，A–H 八包**严格按序**（**不能把 E 提前到 C 前**，否则每种跨界事件各画各的，最后五套小特效）。
一句话目标：把「裁一块另一界地图出来看」的视界，升级成一扇**活着的窗**——另一界的事件在窗里演、跨界过程看得见、窗内人物/鬼修/物品可点开追踪，而**整个系统仍只负责观察，不改变三界模拟**。
**核心验收**：**表现可以错过，历史不能错过**。**硬指标**：D8 完成时 `main.js` **不得比 D7 baseline 更大**。

- **A D7 封板 + 视界契约固化**（本包）：同步文档漂移（HANDOFF / STATUS / THREE_REALMS / BACKLOG 统一到 D7 A–G ✅）；
  新增 **`VIEW_CONTRACT.md`**（「视界是什么 / 什么不许做」唯一成文处，11 条冻结规则 V1–V11）；
  新增 **`npm run test:view`**（`scripts/inkbox-view.mjs`，先 **33 项**钉旧行为，D8-B 后 **42 项**）——证明 D8 从一个稳定的 D7 快照出发。
  视界代码住在 DOM 绑定的 `main.js`（node 里 import 不进来），所以该脚本走**两条腿**：
  ① 源码结构断言（去注释后**全树检索**函数体，D8-B 搬家不该让它变红）；② 纯模块运行时断言（`ui/tools.js` 几何 / `worldgen` / `save` / `rifts`）。
  钉住：`viewUpper→upper` · `viewNether→nether` · 同坐标 · `selection` 单值不进存档 · 切走工具/退化划选两条关闭路径 ·
  观察路径够不到跨界转移链路 · 划开视界只开缝不转移人口 · 观察不抽任何 RNG。
  `npm run build` 文件数 **80 → 82**（+`VIEW_CONTRACT.md`、+`scripts/inkbox-view.mjs`）。
- **B 视界模块抽离**（本包）：把视界从 `main.js` 拔成三层——
  **`ui/realmView.js`**（纯状态 / 几何，**零 import**：`VIEW_TOOL_PLANE` / `isViewTool` / `viewPlaneForTool` / `planeLabel` /
  `pointInRegion` / `regionContains` / `ghostsInRegion`）+ **`render/realmViewLayer.js`**（只画，**不 import `sim/*`**：
  `drawRealmView` / `drawRiftBorder` / `drawSelectHint`）+ `main.js` 只留接线。
  `main.js` **3084 → 2792 行**（−292），`render()` 只剩 `if (this.selection) drawRealmView(...)`——
  **D8 硬指标「完成时 `main.js` 不得比 D7 baseline 更大」达标**。
  `npm run test:view` 加 **V6 模块边界组**（钉「纯函数不在 main.js」「realmViewLayer 不碰 sim」「main.js 行数 ≤ D7 baseline」），
  **33 → 42 项**。`npm run build` 文件数 **82 → 84**（+两个源模块，走 `DIRECTORIES` 递归自动入包）。
- **C 多位面 Presentation Stage**（本包）：新增 **`render/presentationStage.js`**——一帧 `ingestWorlds(world)`
  收齐三界（凡间 / 上界 / 幽冥）事件、`update(dt)` 走真实秒、`drawPlane(plane, …)` 按位面画。
  **`render/fxLayer.js` 改造成 plane-aware**：FX 项自带 `plane`，删掉 D7 的 `if (plane !== 'mortal') continue;`，
  `drawFx(…, plane='mortal')` 按位面过滤——**一个系统，不做三份 FX 类**。
  `main.js` 只留 `this.stage.ingestWorlds(world).update(dt)` 与 `this.stage.drawPlane('mortal', …)`
  （**不再自己写三遍 `drainRuntimeEvents`**）；`render/realmViewLayer.js` 在自己的 `ctx.clip()` 内、
  实体之上画**目标位面**的 FX（`stage` 用鸭子类型传入 ⇒ 该模块仍**零 import**）。
  `npm run test:presentation` **86 → 105 项**（新增 [7b] 多位面组：三界不串 / drain 一次全空 /
  暂停照播 / 倍速不改实时时长 / 不进存档 / 不抽 RNG / **关视界时消费上界幽冥事件不改世界** / 模块边界）。
  ⚠️ 顺手修掉一个**测试工具缺陷**：`inkbox-presentation.mjs` 的 `stripComments` 原先是朴素正则
  （`/\*[\s\S]*?\*\//g`），会被**行注释里的 `` `sim/*` ``** 骗到、把中间代码一并删掉 ⇒ 换成**逐字符状态机**
  （与 `inkbox-view.mjs` / `inkbox-three-realms.mjs` 同款，保留行号）。
  `npm run build` 文件数 **84 → 85**（+`presentationStage.js`）。
- **D 窗内内容补全**（本包）：`render/realmViewLayer.js` 加 **`REALM_VIEW_PROFILE`**——「这一界在窗里该画什么」的
  按位面查的表（上界画宗门 / 法宝，幽冥画鬼 / 幽冥物品 / 阴气、**不画宗门**）。`drawRealmView` 只读它分流，
  加第三界只需补一行表。新增两个只读绘制：
  **`drawGroundArtifacts`**（D6-3 C 包落地的幽冥物品此前**地图上一个都看不见**——`drawEntities` 只画 `entities`；
  现在画成「极小的墨点 + 一圈冷光」，`ARTIFACT_MARK_MIN_ZOOM = 1.6` 以上才显，**不是 RPG 宝箱**，tier ≥ 4 多一枚金心）；
  **`drawRealmYin`**（把已有的 `veg`（阴气 / 荒芜）在窗里**轻轻加深一点**——**不加彩色 heatmap**，只铺很低 alpha 的
  局部雾墨；`veg` 本就「离冥河越近越浓」⇒ 雾自然聚在冥河两岸。`YIN_STEP = 6` / `YIN_BUDGET = 1400` 封顶）。
  **本包零 `main.js` 改动**（`drawRealmView` 早已收到 `plane.plane`）、**零新文件**。
  `npm run test:view` 加 **V7 位面画像组**，**42 → 60 项**：运行时 import 断言画像形状 / 只装 boolean / 冻结；
  用 stub ctx/cam/world **真跑**两个新函数，断言**确定性 / 缩放门控 / 只读世界（JSON 前后逐字相同）**；
  另加两条结构性保证「绘制层通篇不向 `world.*` 赋值」「绘制层零 import」。
  ⚠️ **只读**：本包不改任何幽冥生态数值（`REALM_VIEW_PROFILE` 每项都是 boolean，测试当场钉它）。
  `npm run build` 文件数 **85 → 85**（无新文件）。
- **E 跨界动作「在两边发生」**（本包）：把**六类跨界**（凡→上人 / 上→凡法宝 / 上→凡灵植 / 凡→上法宝 /
  凡→幽人 / 幽→凡鬼 / 幽→凡物 / 幽→凡夺舍附身）接到 **`rift-cross`** 表现事件——玩家终于能看见
  「有人正穿过去」，而不是「人突然少了」或「编年史多了一行」。
  形状只在 **`sim/presentation.js` 的 `emitRiftCross(world, spec)`** 定义一次（**不新造任何跨界概率**）。
  **一次跨界发两条事件**：离开端（`phase:'depart'`，画在**源**位面）+ 到达端（`phase:'arrive'`，画在**目标**位面）——
  于是「玩家此时正在看目标位面的视界」时，**窗内直接播到达 FX**（`presentationStage.drawPlane` 早已按 `event.plane` 路由）。
  **`render/fxLayer.js`** 新增 **`drawRiftCross`**：`depart` = 墨影**向内收缩**（收敛线段），
  `arrive` = 墨点**向外散开**（扩散环 + 散点）；`kind` 决定冷墨（鬼 / 夺舍）或墨色（人 / 物），
  人再补一小圈残影、物补一个小光点；**无 `phase` 的旧事件退回通用冲击环**（不改变老表现）。
  ⚠️⚠️ **只在转移成功之后发**（蓝图原文：「**成功以后发。** 不是"开始尝试"就发」）——发射点全部排在
  各效果函数**最后一个 `return false` 之后**；落点失败 / cap 满 / 目标不存在时**一个事件都不发**。
  ⚠️ **夺舍是唯一只发一端的**（`sides:'depart'`）：到达端已有 D7 的 `'possession'`（冷墨双重轮廓，
  正是蓝图对夺舍到达端的要求），再补 arrive 会在同一格叠两套 FX。
  **本包零 `main.js` 改动**（`stage` 接线 D8-C 已铺好）、**零新源文件**。
  `npm run test:presentation` 加 **[14] 跨界组**，**105 → 127 项**（形状 / 两侧 / `sides` / 非法静默 /
  不改世界 / 两端画法不同 / 确定性 / 源码结构）；`npm run test:three-realms` 加 **F13**，**144 → 151 项**
  （源码结构「发射点排在最后一个 `return false` 之后」+ 运行时「失败 0 条 / 成功恰好 2 条」）。
  RESEARCH 视觉探针 `scripts/_d8e-crossshot.mjs`（不进 build / 不进测试链）用**页面内动态 `import()`**
  复用同一模块实例发事件，截图确认「凡间主画布上的离开端收缩星芒 + 幽冥窗内的到达端扩散环」**同时可见**。
  `npm run build` 文件数 **85 → 85**（无新源文件）。
- **F 穿透检视「点击窗里的东西」**（本包）：视界工具的手势分**两支**——
  **拖动 = 重画视界 / 短点击 = 窗内检视**（位移 < `VIEW_CLICK_PX`(6px) **且**抬起点仍在已开的窗内）。
  新增 **`ui/realmInspector.js`**（**只读**纯模块，与 `ui/realmView.js` 同款）：
  `pickRealmSubject(realmWorld, plane, x, y)` 挑「窗内最近的一件东西」（上界只挑人；幽冥**先鬼后物**）+
  `realmInspectRows(picked, ctx)` 摊成卡片行。支持三张卡：
  **上界人物**（姓名 / 境界 / 年龄 / 仙门 / 来路 / 凡间来历 / 凡间宗门；
  记挂对象飞升而来 ⇒ **★ 天道旧识**，靠 `arrivedLog.fromKey === watch[].key` 匹配，**绝不新建 upper watch**）、
  **幽冥鬼魂**（类别 / 鬼修阶位 / 积怨 / 滞留年数 / 前世快照 / 来路——`ghostOf.route === null` 判「自裂缝跌入」）、
  **幽冥物品**（携带功法 / 来源——带 `technique` = 幽冥自生）。
  `main.js` 新增 **`inspectRealmAt()`**（复用 `#inkInspect` 面板与 `.inspect-*` 样式，**语义不复用**）
  + **`isRealmInspectClick()`**（分派判据，**排在 `commitSelection` 之前**）。
  ⚠️ **不复用凡间 `inspectAt()`**（记挂 / 传记 / 关系图 / 家世全是凡间专有，硬塞会造出一串 `if plane === ...`）；
  ⚠️ **不写 `this.selected`**（那字段让 `render()` 在**凡间**画高亮环，塞幽冥坐标会画错地方）；
  ⚠️ **窗内无任何按钮**（不改属性 / 传功 / 记挂幽冥鬼 / 施神力 / 操控上界单位）——「D8 仍然是观察」是结构性的。
  提示语改为「拖动重划视界 · 单击窗内事物查看」。**「点一下关窗」这条出口保留**（改由「窗外单击」触发）。
  `npm run test:view` 加 **V8 穿透检视组**，**60 → 94 项**（阈值区间 / 挑拣优先级 / 三张卡的行 /
  ★ 天道旧识不建 watch / 只读 JSON 逐字不变 / 源码「不复用 inspectAt、不写 selected、分派排在 commit 之前」）。
  RESEARCH 交互探针 `scripts/_d8f-inspectshot.mjs`（不进 build / 不进测试链）用**真实指针事件**验证
  「窗内单击人物 ⇒ 弹卡」「窗内空白 ⇒ 说无可检视之物且**不关窗**」「窗内拖动 ⇒ 重画」「窗外单击 ⇒ 收窗」。
  ⚠️ **D8 硬指标**：`main.js` **2795 → 2889 行**，仍 < D7 baseline **3084**，达标。
  `npm run build` 文件数 **85 → 86**（+`ui/realmInspector.js`）。

---

## LAST COMPLETED

- **工程包 A — 三界设计状态固化（2026-09-24）**：新增 `THREE_REALMS.md`（MORTAL / UPPER /
  NETHER / TIME / COORDINATES / VIEW / RIFT 七节 + 阶段边界禁止事项；**READOUT 一节由 E 包补上，现为八节**）；
  改写 `BACKLOG.md` 为 D6-2 六包清单。
- **工程包 B — 裂隙目标位面化（2026-09-24）**：修掉「打开幽冥视界会偷偷执行上界漏物/吸人」的静默故障。
- **工程包 C — 上界空间生态（2026-09-24）**：上界实体**不再定格在出生点**。
  低频目标选择 + 简单移动 + `upperWalkable` 检查；不做寻路，不 `new Life(upper)`。
- **工程包 D — 幽冥最低生态（2026-09-24）**：幽冥鬼魂 / 鬼修**不再定格在落点**。
  普通鬼魂沿冥河窄带活动（D1）+ 鬼修分档活动范围（D2）+ 阴气 `veg` **影响**积怨增速（D3）+
  消散地点轻量留痕（D4）+ 高阶鬼修空间吸引（D5）。**零 rng**；不做鬼城 / 鬼宗 / 寻路。
- **工程包 E — 三界统一生态读数（2026-09-24）**：上界 / 幽冥在**现有**「三界」面板行上**追加**同一口径的
  生态账本（`生态 生 N · 亡 M`，幽冥多 `逐 K`）——**不新增区、不新增 CSS 类、不动原有子串**。
  口径抽成**纯函数**（`upperEcoStats` / `netherEcoStats`），面板与测试都调它。
- **工程包 F — 三界生态不变量回归（2026-09-24）**：新增 `scripts/inkbox-three-realms.mjs`
  （**7 节 61 条**断言），把前五包之间的**跨包契约**钉成可判定的回归。**不改任何生产逻辑**
  （唯一源码改动是把 `DECAY_TRACE_VEG` 从 `const` 改成 `export const`，理由见该处注释）。
- **D6-3 工程包 A — 裂隙跨界框架 + 凡人跌入幽冥（2026-09-24）**：解冻幽冥缝，但**不接回上界链路**
  ——给它**自己的通道**（`stepNetherRift`）与**自己的流**（`netherRiftRngFor`，派生键 `0x4e524654` = `'NRFT'`）。
  「上界链路不可达」的保证方式从**一行 `continue`** 换成**函数边界**（前者能被顺手删掉，后者不能）。
  效果 = `fallIntoNether`：半径内 `isPerson` 且 `level < 40` 的活人里取境界最高的一个，
  **先落成幽冥实体再把人 `splice` 出凡间**，法宝先 `scatterArtifacts` 留在原地，落成**鬼修**并带
  `mortal:<id>` 身份快照；**零 rng**（抽签只在 `stepNetherRift`）。回归脚本升到 **8 节 77 条**（新增 F8）。
- **D6-3 工程包 B — 鬼进入凡间（2026-09-26）**：同一条幽冥缝的**反方向**（幽 → 凡）——缝口的鬼魂爬进凡间，
  在凡间飘荡一段日子再自行消散。**两个效果各抽各的签**（`stepNetherRift` 里两个独立 `if`，**不是** `else if`），
  第二条流 = `mortalHauntRngFor`（派生键 `0x4841554e` = `'HAUN'`）。
  效果 = `climbOutToMortal`：候选 = 幽冥里 `sp === ghost` 且**离缝口最近**（半径内）的一只，
  **先落成、再移除**（撞上限 ⇒ 保留幽冥那一份，绝不凭空蒸发），**零 rng**。
  ⭐⭐ **承重判决**：鬼住 `world.wraiths`（独立容器）+ `stepMortalWraiths`（独立 tick），**绝不进 `world.entities`**
  ——凡间与上界共用 `cultivation.stepEntity`，其觉醒豁免名单只有 `beast` / `spirit`，`ghost` 不在其中，
  鬼若进 `world.entities` 会被掷觉醒骰（`awaken()` 给 `level=1` + 灵根 + 重算寿元）或被修炼 → 飞升
  → **上界凭空多一个鬼**，且不报错、污染上界人口账。用**函数边界**隔离（不是加一行守卫）。
  记账落 `nether.popLog.climbedOut`（**第三条离开路径**）⇒ 幽冥守恒式扩成 **`鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出`**。
  回归脚本升到 **9 节 94 条**（新增 F9）。
- **D6-3 工程包 C — 幽冥物品泄漏（2026-09-26）**：幽冥有物品，而物品**两个方向**都走，
  再加第三条来源（幽冥自生）。**三个独立 `if`**（人跌入 / 鬼爬出 / 物品漏出，**不是** `else if`），
  第三条流 = `netherItemRngFor`（派生键 `0x4e49544d` = `'NITM'`）。
  · 来源① **跌入者随身带下去**（`moveArtifactsToNether`，改掉 A 包的 `scatterArtifacts` 行为）；
  · 来源② **幽冥自生**（`stepNetherItems`，**零 rng** 的 `hash32` + `hashStep` 确定性哈希流）；
  · 去向③ **经缝漏回凡间地上**（`leakNetherItem` → `toGround`，**落地等捡**，**零 rng**）。
  ⭐ **容器与记账全部复用 ⇒ 零存档结构改动**：物品池复用 `nether.artifacts`（`serializeWorld`
  整数组写）；四条流水落 `nether.popLog`（属 `NETHER_ONLY_KEYS` **整对象**序列化，可安全加键）：
  `itemsSpawned / itemsFellIn / itemsLeakedOut / itemsDecayed` ⇒ 守恒式
  `alive === spawned + fellIn − leakedOut − decayed`；凡间侧对账落 `artifactLog.netherIn / netherOut`
  （与上界的 `riftIn / riftOut` **分列四键**）。
  ⚠️⚠️ **两个新踩的坑**：① `hash32`（FNV-1a）对「前缀相同、只差末尾数字」的短串有**极强高位偏置**
  （实测全落 0.70–0.74 ⇒ 概率阈值恒真、`NETHER_ITEM_CHANCE` 形同不存在、10 个判定点只出 1 件，
  **不报错**）⇒ 必须先过一遍 `hashStep` 再当均匀分布用；② **法宝 id 跨世界必须重赋**（铁律三）——
  id 是**世界内**编号，不重赋会让「凡间第 5 件」与「幽冥第 5 件」同号，`claimGroundArtifact`
  按 id 线性查找会命中**先出现的那一件**（不报错）。
  另造幽冥名池（`NETHER_ARTIFACT_NAMES` 8 名 / `NETHER_TECHNIQUES` 6 名，**避开**「鬼/魂/莲/符」
  考古定名、与凡间名池**零重名**）；幽冥法宝**携带一门功法**（`a.technique`，凡人拾到即习得，
  上限 `TECHNIQUE_CAP = 3`）。
  回归脚本升到 **10 节 119 条**（新增 F10 · 26 条）。
- **D6-3 工程包 D — 跨位面夺舍（2026-09-26）**：A/B/C 跨的是**人 / 鬼 / 东西**，D 包让**鬼修的元神**
  跨界，住进凡间活人的身体。判据不再是「谁离缝口最近」，而是**鬼修的阶**——两条完全不同的路：
  · **低阶鬼修**（怨灵及以下，`level ≤ POSSESS_TIER_MAX_LEVEL` = **20**）⇒ **真夺舍**（`possessMortal`），
    鬼修**从幽冥消失**（`splice`）；· **高阶鬼修**（厉鬼及以上 ≥ 21）⇒ **只暂时附身**（`hauntMortal`），
    鬼修**留在幽冥**、凡人被驱使一段日子。动机 = 「继续修仙的执念」（用户裁决）。
  **第四条流** = `netherPossessRngFor`（派生键 `0x4e505358` = `'NPSX'`）；`stepNetherRift` 里现在是
  **四个独立 `if`**（**不是** `else if`）；触发概率 `POSSESS_CHANCE_PER_PERIOD = 0.01`。
  成功率用**积怨 `ghostRancor`** 替代 `mind`，再乘「执念 / 魂虚」词条加成（派生、不入档）。
  **不良状态**新字段 `possessionScar`（**新实体列 row[68]**，行总长 68 → 69）；**行为锁**在
  `sim/life.js` 的 `stepEntity` 状态机**之前**接管（与「入魔」同位置，`return false` 绕过 `findEnemy`）。
  记账落 `nether.popLog.possessedOut`（**第四条离开路径**）⇒ 守恒式扩成
  **`鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺`**；凡间 `world.possessionLog` 五键
  （`succeeded / failed / suspected / crossPlane / haunted`）。**三个效果函数全部零 `rng`**。
  ⚠️ 上界 / 幽冥 payload **刻意 `delete payload.possessionLog`**（与 `soulLog` 同款）——
  **这一条此前漏删**，D 包补齐（见 CONTRACT 22）。
  回归脚本升到 **11 节 134 条**（新增 F11 · 15 条）。
- **D6-3 工程包 E — 回归扩展（2026-09-26）**：**不改任何生产逻辑**，把 A–D 四条跨界通道钉进
  **长跑体检**与**回归**。本包补的是**一个洞**：在它之前，`scripts/inkbox-longrun.mjs`
  **从来没有建过 `world.nether`** ⇒ `openRifts(..., 'nether')` 整条被第 0 步拒掉
  ⇒ D6-3 的四条通道**一次都没在长跑里跑过**。
  · **longrun**：主循环前挂 `generateNetherWorld`（`deriveNetherSeed(SEED)`，不抽主流）；
    视界开着时**每年补开** 6 条幽冥缝（`NETHER_RIFT_SITES`）；新增一节 **10 条**断言
    （幽冥生态守恒 / 幽冥物品守恒 / 鬼影两端 / 跨书三对 / A·B·C 存在性 / 幽冥缝开出来）；
    **凡间法宝守恒式再扩一档**（`造物 + riftIn + netherIn === 在世 + 碎 + 朽 + riftOut + netherOut`）。
  · **three-realms**：新增 **F12（10 条）** ⇒ **十二节 144 条**。F8–F11 各测**一条通道**；
    F12 问「四条通道挂在**同一条缝**上时，四本账会不会串」。
  · ⭐⭐ **两条承重结论**（后来人动三界前必须知道）：
    ① **幽冥缝口必须落在「凡间可站 ∩ 幽冥河带」的交集格上**——`openRifts` 只把矩形**周长**格
      当候选，而鬼 / 物品只落在河带格（`netherBankTiles`）；站点错位 ⇒ C/D **结构性饿死**
      （实测：±10 矩形站点 10 条缝跑 300 年 C=18 但 **D 恒 0**；重叠格站点半径 3.63 格内有
      26 河带格 + 42 凡人）。⇒ longrun 用 **1×1 区域**精确落点。
    ② **1×1 区域 ⇒ `sites.length === 1` ⇒ `openRifts` 的洗牌循环不执行 ⇒ 消费裂隙流 0 次**
      ⇒ 上界缝位置与「不开幽冥缝」时**逐字相同**。这是 longrun 敢「常年开幽冥缝」的唯一依据
      （F12⑥ 用同种子双世界比对钉）。
  · **判据口径**：A / B / C 判存在性（`≥ 1`）；**D 不判存在性**——它在真实长跑里几乎不触发
    （800 年 6 站点：跌入 30 / 爬出 123 / 漏物 10 / **夺舍 0 · 附身 3**）。D 的**存在性**由隔离世界
    钉（F11 真夺舍 7 / 附身 10 · F12 四支同缝 7 次），长跑只钉它的**账本耦合**
    `possessedOut === possessionLog.crossPlane`。⚠️ 硬写 `D ≥ 1` 会是一条**永远红**的断言。

## CHANGED

- 工程包 A/B：`THREE_REALMS.md`（新）、`BACKLOG.md`、`README.md`、`world/planes.js`、`sim/rifts.js`、
  `sim/netherLife.js`、`main.js`、`io/save.js`、`scripts/inkbox-{smoke,save-equiv,longrun,playtest,package}.mjs`
- 工程包 C：**只动一个源文件** —— `src/inkbox/sim/upperLife.js`
  （新增 `UPPER_SPATIAL_SEED_KEY` 等常量、构造器里的 `this.spatialRng`、`step()` 末尾的第 8 步、
  `stepSpatial` / `pickSpatialTarget` / `spatialTargetValid` / `moveSpatially` / `spatialCanStep` 五个方法）
  + `scripts/inkbox-smoke.mjs` 新增 5v 组（10 条断言）
  ⚠️ **C 包没有改 `io/save.js`**：移动状态用的 `x/y/tx/ty/timer/state` 早就是实体列
  （row[2]/[3]/[12]/[13]/[11]/[10]），不需要新增存档字段。
- 工程包 D：**只动一个源文件** —— `src/inkbox/sim/netherLife.js`
  （抽出 `nearRiverAt`（让落点窄带与活动范围共用判据）· 新增 `hashStep` ·
  五个空间行为函数 `activityRadiusOf` / `netherCanStep` / `netherSpatialTargetValid` /
  `pickNetherSpatialTarget` / `moveNetherSpatially` / `leaveDecayTrace` / `stepNetherSpatial` ·
  `stepNether` 第 3 步加环境系数、第 1/2 步加消散留痕、末尾加第五步 ·
  **新增三个只读导出**：`netherBankTiles` / `pickNetherSpatialTarget` / `NETHER_BANK_RADIUS` / `NETHER_TIER_REACH`）
  + `scripts/inkbox-smoke.mjs` 新增 5w 组（21 条断言）。
  ⚠️ **D 包也没有改 `io/save.js`**：`x/y/tx/ty/timer/state/anim/face` 早就是实体列；
  D4 留痕写的是**进档**的 `nether.veg`（读档不重算），同样零存档改动。
- 工程包 E：**改两个源文件 + 两处测试** ——
  ① `src/inkbox/world/planes.js`：新增导出 `upperEcoStats(upper)`（只读汇总，**不改任何状态**）；
  ② `src/inkbox/sim/netherLife.js`：新增导出 `netherEcoStats(nether)`（同上，复用 `netherGhostStats`）；
  ③ `src/inkbox/main.js`：`refreshUpperRealm` / `refreshNetherRealm` 各**追加**一段生态栏
  （**追加**而非改写：playtest 10e 用 `includes('生灵 N')` 等子串对账）；
  ④ `scripts/inkbox-smoke.mjs` 新增 5x 组（**11** 条断言）· `scripts/inkbox-playtest.mjs` 10e 新增 3 条对账断言。
  ⚠️ **E 包同样没有改 `io/save.js`**：两界账本（`upper.popLog` / `nether.popLog`）早就在档里，
  本包只**读**它们；没有新增任何持久化状态。
- 工程包 F：**新增一个测试脚本** —— `scripts/inkbox-three-realms.mjs`（F1–F7 七节，61 条）·
  `package.json` 加两条入口（`test:three-realms` / `inkbox:realms`）·
  `scripts/inkbox-package.mjs` 打包清单补登 `scripts/inkbox-three-realms.mjs`（随包出货，见 TESTED 的 build 行）·
  `src/inkbox/sim/netherLife.js` 把 `DECAY_TRACE_VEG` 改成导出（**只为测试能引用**，
  免得测试写死 `0.03` 而腐烂——与 `NETHER_BANK_RADIUS` 同款理由）。
  ⚠️ **F 包没有改任何生产逻辑**：它是回归，不是功能。
  F1 时间（唯一推进入口 / 三界 day 恒等 / 节拍 / 裂缝累加器跨开关存活）·
  F2 世界身份（plane / 种子派生异或自逆 / 两两不同 / 同尺寸 / **落点判据不可互相顶替**）·
  F3 id 空间（三段不相交 / 不撞号 / 跨界引用带世界限定符 / 快照引用切断）·
  F4 上界闭环（人口守恒 / 无飞升出口 / 不跑凡间系统 / 两本死亡账一致）·
  F5 幽冥闭环（守恒 / 逐出分流 / 魂五路 / 六级现算 / 魂池不搬家 / 零 rng）·
  F6 存读档（三界 plane+seed / 裂缝 10 键 / `targetPlane` 与老档兜底 / 阴气留痕量化界 / 人口账本七键）·
  F7 裂隙目标（**nether 缝消费裂隙随机流 0 次** + 上界缝必须消费的对照 / 生命周期照常 / 无幽冥位面如实报拒）。
- **D6-3 工程包 A（2026-09-24）**：`sim/rifts.js` 新增 `NETHRIFT_SEED_KEY` / `netherRiftRngFor` /
  `fallIntoNether` / `stepNetherRift`，`stepRifts` 第 3 步由「nether 在抽签前 `continue`」改为**分流**；
  `sim/netherLife.js` 的 `ensureNetherPopLog` 加 `fellIn: 0`（`ghostBorn` 的子计数）；
  `world/worldgenNether.js` 的 `resetNetherSystems` 显式归零 `popLog.fellIn`；
  `sim/reincarnation.js` 的 `ghostSnapshot` 由内部函数改为 `export`（**零行为变化**，只为让 `rifts.js` 复用身份快照的唯一形状真源）。
  `scripts/inkbox-smoke.mjs` 5q⑫/⑬ 按新契约改写 + 新增 5q⑭（7 条）；
  `scripts/inkbox-three-realms.mjs` F7 加 6 条 + 新增 F8（9 条）⇒ **8 节 77 条**。
- **D6-3 工程包 B（2026-09-26）**：
  · **新建** `src/inkbox/sim/wraiths.js`（凡间鬼影的独立容器 + 独立 tick + 独立流；
    头注释记着「为什么鬼不能进 `world.entities`」的完整事实链）——导出 `MORTALHAUNT_SEED_KEY` /
    `mortalHauntRngFor` / `ensureWraiths` / `ensureWraithLog` / `spawnWraith` / `restoreWraiths` /
    `stepMortalWraiths` / `wraithStats` / 常量（`WRAITH_CAP` 120 / `WRAITH_DISSOLVE_DAYS` 1080 /
    `WRAITH_PERIOD_DAYS` 10 / 漫游与重选区间 / `WRAITH_TEMPLATE` 22 键）。
  · `src/inkbox/sim/rifts.js`：加 `import { spawnWraith, mortalHauntRngFor }` ·
    `WRAITH_CLIMB_CHANCE_PER_PERIOD`（0.05）· `climbOutToMortal`（导出以便测试直调）·
    `stepNetherRift(world, rift, r, nrng, hrng)` 改双独立 `if` · `stepRifts` 里取 `hrng` 并传入。
  · `src/inkbox/sim/netherLife.js`：`ensureNetherPopLog` 加 `climbedOut: 0`（初值 + 兜底 + 长注释）·
    `netherEcoStats` 返回加 `climbedOut` 且 `conserved` 改成 `alive === born − died − evicted − climbedOut`。
  · `src/inkbox/world/worldgenNether.js`：`resetNetherSystems` 显式归零 `popLog.climbedOut`。
  · `src/inkbox/world/World.js`：构造器加 `this.wraiths = []` / `this.wraithLog = { dissolved: 0 }`。
  · `src/inkbox/io/save.js`：凡间 payload 加 `wraiths`（22 字段逐字段显式）+ `wraithLog`（单键）·
    `serializeUpperWorld` / `serializeNetherWorld` 各加 `delete payload.wraiths / wraithLog` ·
    `restoreWorldState` 调 `restoreWraiths` + 兜底 `wraithLog` · import `restoreWraiths` ·
    版本历史加「v11 内追加（**不升版本号**）」段（`SAVE_VERSION` 仍 11）。
  · `src/inkbox/sim/advance.js`：`ADVANCE_PERIODS.wraith = 10` · `createAdvanceState` 加 `wraith: 0` ·
    `fired` 加 `wraith: false` · 新增节流块（**不挂 `deps.riftActive`**，见该处注释）·
    头注释补 `stepMortalWraiths` 那条流。
  · `src/inkbox/sim/biography.js`：`KIND_TAG` 加 `'rift-out': 'person'`（与 `'rift-lost'` 同组）。
  · `src/inkbox/render/unitsLayer.js`：新增 `drawWraiths(ctx, camera, world, time)`（冷灰蓝半透明）。
  · `src/inkbox/main.js`：主渲染链 `drawEntities` 后**追加**一次 `drawWraiths` · 凡间统计加 `#inkStatWraiths`
    （`wraithStats(world).alive`）· `inspectAt` 追加「近处鬼影 N 只」行 · 幽冥面板行追加 `· 出 N` ·
    import `wraithStats`。
  · `inkbox.html`：世界统计格加 `<div class="stat"><span>鬼影</span><b id="inkStatWraiths">0</b></div>`
    （复用 `.stat`，**不新增 CSS 类**）。
  · `scripts/inkbox-smoke.mjs`：新增 5q⑮（**17** 条断言）+ import `climbOutToMortal` / wraiths 模块。
  · `scripts/inkbox-three-realms.mjs`：新增 **F9（17 条）** ⇒ **9 节 94 条**；import B 包符号 + `MERCY_SEED_KEY`。
  · `scripts/inkbox-save-equiv.mjs`：加 `WRAITHS_FIXTURE`（存档前灌两只鬼）+ 4 条鬼影检查 ·
    老档兼容加 `wraiths/wraithLog` 兜底 2 条 · `worldKeys` 加 `wraiths/wraithLog` ·
    `UPPER_NOT_SAVED` 注册 `wraiths/wraithLog` · `upperForbidden` 加 `wraiths/wraithLog` ·
    `NETHER_FORBIDDEN_KEYS` 加 `wraiths/wraithLog`。
  · `scripts/inkbox-playtest.mjs`：10e 幽冥守恒式正则加 `· 出 (\d+)`，判据改成 `鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出`，
    并加 `climbedOut` 直接对账。
  ⚠️ **B 包改 `io/save.js`**（不像 C/D/E）：新增了**两个世界级键**，所以四处齐全（写 / 两处 delete / 读兜底）
  + save-equiv 的键集与豁免表都要跟上。
- **D6-3 工程包 C**：**改 8 个生产文件**（无新建文件；**复用 `nether.artifacts` ⇒ 零存档结构改动**）——
  · `src/inkbox/core/lore.js`：新增两个冻结词池 `NETHER_ARTIFACT_NAMES`（8 名，带 `slots`）/
    `NETHER_TECHNIQUES`（6 名，带 `note`），放在 `SPECIAL_UNITS` 之前，附 §5.6 命名纪律长注释。
  · `src/inkbox/sim/netherLife.js`（**改动最多，约 +190 行**）：`ensureNetherPopLog` 加四条
    `items*` 初值与兜底 · 新增 `NETHER_ITEM_CAP`(120) / `NETHER_ITEM_PERIOD_DAYS`(30) /
    `NETHER_ITEM_CHANCE`(0.55) / `NETHER_ITEM_TIER`(1) / `NETHER_ITEM_QUALITY`(2) ·
    新增 `spawnNetherItem`（形状与 `forgeArtifact` **逐字段同形** + `technique`，落点复用
    `bankCandidates`）· 新增 `export stepNetherItems` / `export trimNetherItems` / `export netherItemStats` ·
    `stepNether` 末尾加第 6 步。
  · `src/inkbox/sim/rifts.js`：import `trimNetherItems` · 新增 `NETHER_ITEM_LEAK_CHANCE_PER_PERIOD`(0.02) ·
    `NETHERITEM_SEED_KEY` + `netherItemRngFor` · 新增 `moveArtifactsToNether`（**重赋 id**，
    落点用**人的落点**）· `fallIntoNether` 第 3 步由 `scatterArtifacts` 改为 `moveArtifactsToNether`
    + 第 4 步记 `itemsFellIn` / `trimNetherItems` / `artifactLog.netherOut` ·
    新增 `export leakNetherItem`（**零 rng**，候选 = 半径内**离缝口最近**的一件 → `findMortalSpot`
    → **重赋凡间 id** → `toGround` → 记两端账 + `rift-in`）· `stepNetherRift` 签名加 `irng` 与**第三个独立 `if`** ·
    `stepRifts` 里取 `irng` 并传入。
  · `src/inkbox/sim/artifacts.js`：import `NETHER_TECHNIQUES` · 新增 `export TECHNIQUE_CAP`(3) +
    `NETHER_TECHNIQUE_BY_NAME` + `grantTechnique`（查池子对象 / 查上限 / 去重）·
    `giveTo` 末尾加 `if (a.technique) grantTechnique(...)`（**在收下之后**，被拒不白送）·
    `describeArtifact` 加 `·载<功法>`。
  · `src/inkbox/io/save.js`：import `NETHER_TECHNIQUES` · `MANUAL_BY_NAME` 扩成
    `[...MANUALS, ...NETHER_TECHNIQUES]` · 两处 `artifactLog` 默认值加 `netherIn: 0, netherOut: 0`。
    ⚠️ **没改 `serializeNetherWorld` / `serializeUpperWorld`**：`artifacts` 走 `serializeWorld`
    通用路径自动往返；上界的 `artifacts` **恒空** ⇒ 不需要 `delete`（不触发「写侧 delete ≠ 豁免表注册」那个故障类）。
  · `src/inkbox/world/worldgenNether.js`：`resetNetherSystems` 末尾加四条 `popLog.items* = 0` +
    `world.artifacts.length = 0; world.nextArtifactId = 1;`。
  · `src/inkbox/sim/biography.js`：`KIND_TAG` 加 `'rift-in': 'cultivation'`（与 `'artifact'` 同组——
    它是**一件东西**跨界，不是某个人，故不与 `'rift-lost'` / `'rift-out'` 同归 `person`）。
  · `src/inkbox/main.js`：import `netherItemStats` · `refreshNetherRealm` 幽冥行**行尾追加** `· 物 N`。
  · `scripts/inkbox-smoke.mjs`：5q⑭⑤ 与 5g 守恒律按新契约改写（法宝去向 / 扩成四条跨位面流的等式）
    + 新增 **5q⑯（41 条断言）** + import C 包符号。
  · `scripts/inkbox-three-realms.mjs`：新增 **F10（26 条）** ⇒ **十节 119 条**；import C 包符号。
  · `scripts/inkbox-save-equiv.mjs`：加 `NETHER_ITEMS_FIXTURE`（存档前灌两件幽冥物品，一件带
    `technique` 一件不带）+ 6b 节新增 **⑧ 幽冥物品（5 条）** · ⑨ 老档降级加 2 条
    （物品池是空数组 / 四条流水就位且为 0）· 夹具同时写 `artifactLog.netherIn/netherOut`。
- **D6-3 工程包 D**：**改 10 个生产文件**（无新建文件；`sim/possession.js` 早已存在，D 包在其中加跨位面段）——
  · `src/inkbox/sim/possession.js`：新增 D 包整段——`POSSESS_TIER_MAX_LEVEL`(20) / `CROSS_POSSESS_CAP`(8) /
    `HAUNT_DAYS`(360) / `RANCOR_FULL`(300) / `OBSESSION_RATE`(0.06) / `HOLLOW_SOUL_RATE`(0.06) /
    `OBSESSION_BOOST`(1.6) / `HOLLOW_SOUL_BOOST`(1.4) / `CROSS_POSSESS_KIND`('possess-cross') / `HAUNT_KIND`('haunt') ·
    `normalizeRancor` / `crossPlanePossessionChance` / `isObsessed` / `isHollowSoul` / `isControlled(entity,day)` /
    `crossPossessedCount` / `pickGhostAtRift` / `pickCrossTarget` / `keyGreater` / `hashRoll` /
    `crossPlanePossession` / `possessMortal` / `hauntMortal`；`ensurePossessionLog` 初值扩成五键；
    `possessionStats` 加 `crossPlane` / `haunted`。
  · `src/inkbox/sim/rifts.js`：加 `import { crossPlanePossession }` · `NETHER_POSSESS_SEED_KEY`(0x4e505358) +
    `netherPossessRngFor` · `POSSESS_CHANCE_PER_PERIOD`(0.01) · `stepNetherRift` 签名加 `prng` 与**第四个独立 `if`** ·
    `stepRifts` 里取 `prng` 并传入。
  · `src/inkbox/sim/netherLife.js`：`ensureNetherPopLog` 加 `possessedOut: 0`（初值 + 兜底 + 长注释）·
    `netherEcoStats` 返回加 `possessedOut` 且 `conserved` 改成 `alive === born − died − evicted − climbedOut − possessedOut` ·
    `GHOST_TEMPLATE` 加 `possessionScar: null`。
  · `src/inkbox/sim/cultivation.js`：`initEntity` 在 `entity.possessedBy = null;` 后加 `entity.possessionScar = null;`。
  · `src/inkbox/sim/life.js`：import `isControlled` · 新增纯哈希工具 `possessionWanderRoll` ·
    `stepEntity` 内**状态机之前**插入行为锁（`state='possessed'` + 自己漫游 + `return false`）。
  · `src/inkbox/sim/biography.js`：`KIND_TAG` 加 `'possess-cross': 'nether'` 与 `'haunt': 'nether'` ·
    `MILESTONE_KINDS` 加 `'possess-cross'`（**不加 `haunt`**——附身不传 `actors`）。
  · `src/inkbox/world/World.js`：构造器加 `this.possessionLog = { succeeded, failed, suspected, crossPlane, haunted }`。
  · `src/inkbox/world/worldgenNether.js`：`resetNetherSystems` 加 `possessionLog.crossPlane/haunted = 0` + `popLog.possessedOut = 0`。
  · `src/inkbox/io/save.js`：实体写侧 row[68] `possessionScar`（+ 长注释）· 读侧逐键兜底 ·
    `restoreLegacyEntity` 补 `possessionScar: null` · `serializeWorld` 的 `possessionLog` 写侧**逐键显式 5 键** ·
    `restoreWorldState` 读侧**逐键兜底 5 键** · `serializeUpperWorld` / `serializeNetherWorld`
    各加 `delete payload.possessionLog;`（**此前漏删**）。
  · `src/inkbox/main.js`：import `isControlled` · `refreshNetherRealm` 生态行追加 `· 夺 N` ·
    `inspectAt` 新增「附身」行（`possLine`）。
  · `scripts/inkbox-smoke.mjs`：新增 **5q⑰（~25 条断言）** + `NON_LITERAL` 豁免表加
    `CROSS_POSSESS_KIND` / `HAUNT_KIND`（否则 5l 判「死映射 + 未豁免」两条假红）+ 5x 两条守恒式升五路径 + import D 包符号。
  · `scripts/inkbox-three-realms.mjs`：新增 **F11（15 条）** ⇒ **十一节 134 条**；import D 包符号 + `initEntity`。
  · `scripts/inkbox-save-equiv.mjs`：`ENTITY_COLUMNS` 68 → **69** · `UPPER_EXEMPT` 注册 `possessionLog` ·
    `upperForbidden` 夺舍段加 `crossPlane/haunted` 恒零断言 · `NETHER_FORBIDDEN_KEYS` 加 `possessionLog`（六 → **七键**）·
    夺舍账本两处 `diffFields` 3 → **5 键** · 夹具 `raw.possessionLog` 五键 · v5 老档 `possessionLog` 五键全零 ·
    新增 `possessionScar` 列断言（`row[68]` 往返）· v5 老档 `possessionScar === null`。
  · `scripts/inkbox-playtest.mjs`：10e 幽冥守恒式正则加 `· 夺 (\d+)`，判据改成
    `鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺`，并加 `possessedOut` 直接对账。
  ⚠️ **D 包改 `io/save.js`**：新增了一个**实体列**（`row[68]`）⇒ 四处齐全（写 / 读 / 老档兜底 / `ENTITY_COLUMNS`），
  且 `possessionLog` 从他界 payload `delete` 后必须同步 save-equiv 三处注册（`UPPER_EXEMPT` /
  `NETHER_FORBIDDEN_KEYS` / 正向 `zero` 断言）——**「写侧 delete」与「豁免表注册」是同一个改动的两半**。
- **D6-3 工程包 E**：**只改两个测试脚本，零生产代码改动**（这是「回归扩展」的定义）——
  · `scripts/inkbox-longrun.mjs`：+4 处 import（`generateNetherWorld` / `netherEcoStats` /
    `netherItemStats` / `wraithStats`）· 主循环前挂 `world.nether` · 新增 `NETHER_RIFT_SITES`（6 个
    1×1 站点，带「为什么是点不是矩形」的长注释）· 新增 `netherOpenedByPlayer` 累加器 ·
    视界开着时每年补开幽冥缝 · **法宝守恒式扩成含幽冥两向** · 新增「三界跨界生态（D6-3 A–D）」一节
    （**10 条**断言 + 两行读数）· 报告「裂缝」行**分位面拆开**印活跃数（上界 / 幽冥）。
  · `scripts/inkbox-three-realms.mjs`：+1 处 import（`artifactStats`）· 新增 **F12（10 条）**
    ⇒ **十二节 144 条** · 文件头注释补 F12 定位。
  ⚠️ **E 包没有改 `io/save.js`**（没有新增任何持久化状态）· **没有改 `src/` 任何文件**。
  ⚠️ 施工期两条**假红**（都是判据 / 记账写错，不是代码错）：① F12 手工 `ghostBorn += 10`
  与 `spawnNetherGhost` 的**自动记账**重复计 4 ⇒ 守恒式被本组自己搞红；② F12⑤ 忘了
  `wraith: false` ——`mortalHauntRngFor` **不只**被 `stepNetherRift` 消费，
  `stepMortalWraiths`（每 10 日一拍）也用它（`wraiths.js:333`）。

## CONTRACT（本轮新增、不能破坏的规则）

1. **裂隙必带 `targetPlane: 'upper' | 'nether'`**，且必须进存档；老档缺键一律兜 `'upper'`。
2. **落点判据单源**：上界 = `planes.upperWalkable`，幽冥 = `planes.netherWalkable`。
   不许另写一套地形阈值。
3. **硬不变量**：打开幽冥视界**绝不会**偷偷执行上界转移。nether 缝的 `stepRifts` 分支
   **排在漏物抽签之前** ⇒ 上界链路结构上不可达（判据用 `=== 'nether'`，老档无键的缝继续走上界逻辑）。
   ⚠️ **D6-3 A 更新了保证方式**（见第 15 条）：那条 `continue` 变成了**分流**，
   「不可达」现在由**函数边界**保证，不再是「那一行还在不在」。
4. ~~本阶段**冻结幽冥跨界**：nether rift 只允许创建 / 成长 / 闭合 / 显示 / 保存。~~
   ⚠️ **已被 D6-3 A / B 取代**（第 15 / 18 条）：幽冥缝现在有**两个**跨界效果
   （凡人跌入幽冥 + 鬼爬入凡间）。
   **夺舍 / 附身**已由 D6-3 工程包 D 实装，**幽冥物品泄漏**已由工程包 C 实装；本条保留为跨界通道隔离规则的历史说明。
5. 裂隙记录键集恰好 **10 个**：`age, closedDay, crossed, id, leaked, openedDay, strength, targetPlane, x, y`。
6. **上界空间行为**：低频（`timer` 归零才重选目标）· 简单移动（直线 + 子步化 + 单轴滑墙）·
   **不做寻路 / A\*** · 不 `new Life(upper)` · 不照搬凡间那七种行为动机。
7. **空间行为消费 `upperLife.rng` 的次数恒为 0**（它走自己的 `spatialRng`）。
   ⚠️ 但它会通过「位置 → `world.qi[所在格]` → 修炼速度」**间接**改变上界世界线——
   这是**刻意的生态耦合**，不是 bug。**别把它当扰动去「修」。**
8. **幽冥空间行为**：低频（`timer` 归零才重选目标，25–70 游戏日）· 简单移动（直线 + 子步化 + 单轴滑墙）·
   **不做寻路 / A\***。**活动范围**判据单源 = `nearRiverAt`（D 包把它从 `bankCandidates` 的内联循环抽出，
   落点窄带与活动范围共用）：普通鬼魂 = `NETHER_BANK_RADIUS`（4）⇒ 只在窄带；
   鬼修 = `4 + ghostTierOf(level) × NETHER_TIER_REACH`（3）⇒ 游魂 4 → 鬼帝 19。
   鬼将及以上是「吸引源」，低阶实体目标偏向最近的吸引源（**不做鬼城**）。
9. **幽冥空间行为零 `rng`**：它**没有**独立流（`stepNether` 是纯函数、没地方挂流；
   挂上去就被序列化器看见，违反铁律二）⇒ 采样走 `hashStep` 推进的确定性哈希流，
   种子 = `hash32(entityId : day)`。⚠️ **验证手法与 C 包不同**（幽冥没有 `this.rng` 可拦）：
   ① 同种子跑两遍轨迹**逐字一致**；② 源码**不 import 任何 rng 生成器**。
   ⚠️ ② **只扫 `import` 行**——铁律一的注释里就有 `mulberry32` 字面量，grep 全文会假红。
10. **阴气（`veg`）影响积怨，不是决定**：系数 = `RANCOR_ENV_MIN + (RANCOR_ENV_MAX − RANCOR_ENV_MIN) × veg`
    = `0.6 + 0.8 × veg` ⇒ **[0.6, 1.4]**。下界 **0.6 > 0** 是承重的：
    「离开最佳格就永远不能升级」**结构上不成立**。⚠️ 不得把下界调成 0（那就把「影响」改成了「决定」）。
11. **消散留痕**：消散（对账 / 到期）时把**所在格** `veg` 抬 `DECAY_TRACE_VEG`（0.03，加性 clamp 到 1）。
    **上限逐出不留痕**（那不是「消散」）。⚠️ 增量必须**远大于**量化步长 1/65535，
    否则会被 `encodeQuantized` 抹平 ⇒ 「内存可见、存档消失」的静默故障。
12. **生态读数口径单源**：`upperEcoStats`（`world/planes.js`）/ `netherEcoStats`（`sim/netherLife.js`），
    返回**同名字段** `born / died / alive`（幽冥另有 `evicted`，D6-3 B 起另有 `climbedOut`）。面板与测试**都调它**——
    各写一份就是第二个真相。守恒式：上界 `生灵 === 生 − 亡`；幽冥
    **`鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出`**（`出` = 自幽冥缝爬入凡间的鬼，D6-3 B 新增的第三条离开路径）。
    ⚠️ **「逐」「出」都是两界规则差别，不是口径不统一**：幽冥有**三条**离开路径（消散 + 上限逐出 + 爬入凡间），
    上界只有一条（陨落）。把逐出 / 爬出并进「亡」= 把「被清出去」「走了」说成「死了」。
13. **面板只在现有行上追加**：不新增区 / 不新增 CSS 类 / **不改动原有子串**——
    playtest 10e 用 `includes('生灵 N')` 之类的**子串**对账，改写会悄悄改掉那条断言的契约。
    ⚠️ D6-3 B 在幽冥行**行尾追加** `· 出 N`，并同步改了 playtest 10e 的**正则与守恒式**
    （`鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出`）——这是**契约变更**（多了一条离开路径），
    不是「把红改绿」。凡间侧新增一格 `#inkStatWraiths`（复用 `.stat`，无新类名）。
14. **三界不变量的回归入口 = `scripts/inkbox-three-realms.mjs`**（`npm run test:three-realms`）。
    它把 F1–F9 九组跨包契约钉成可判定断言。**动了三界任何一处，先跑它**。
    ⚠️ 其中 F7 的「nether 缝不消费裂隙随机流」用的是**随机流位置**判据（数抽签次数），
    并配一条「上界缝**必须**消费」的对照——**不要**把它改写成「跑 N 拍没漏东西」：
    后者在「结构正确」与「运气好」下长得一模一样（假绿工厂）。
15. **幽冥缝走自己的通道 + 自己的流**（D6-3 A，取代第 3/4 条）：
    · 通道 = `stepNetherRift`（`sim/rifts.js`）——它及其下游**够不到** `arriveUpper` /
      `leakFromUpper` / `leakToUpper`。「不可达」由**函数边界**保证（F7⑨ 用**源码结构**钉它）。
    · 流 = `netherRiftRngFor(world)`，派生键 `0x4e524654`（`'NRFT'`）——与裂隙流 / 上界 / 幽冥
      **两两不同**（F7 逐对断言）⇒ **玩家多开一条幽冥视界不会移动上界缝的抽签序列**。
    · 判据仍是 `=== 'nether'`（**不是** `!== 'upper'`）：老档 / 手工构造的缝没有 `targetPlane`
      （`undefined`），它们的历史语义是上界缝，必须继续走上界逻辑。
16. **凡人跌入幽冥**（`fallIntoNether`，导出以便测试直调）：
    · 候选 = 半径内 `isPerson` 且 `level < RIFT_CROSS_MAX_LEVEL`（40）的活人，取**境界最高**的一个。
      判据用 `>=` 排除高修为（写成 `>` 会静默放过化神期）。
    · **先落成幽冥实体、再把人 `splice` 出凡间**（顺序承重：反过来会让人凭空蒸发）。
      撞 `LIMITS.maxEntities` ⇒ 返回 `false` 且**凡间毫发无伤**。
    · 法宝先 `scatterArtifacts` 留在凡间地上（防「随人蒸发」）；`world.nether` 不存在时整条跳过。
    · 落成**鬼修**（`level ≥ 1`）或鬼魂，带 `mortal:<id>` 身份快照（`route` 传 `null`——
      他不是走魂路去的，硬塞五路之一会让名册说谎）。
    · **本函数零 `rng`**：判定节奏的抽签在 `stepNetherRift`，**选谁不抽签**（F8⑤ 钉源码结构）。
17. **幽冥方向的记账落 `nether.popLog.fellIn`**（`ghostBorn` 的**子计数** ⇒ 守恒式
    `鬼魂 + 鬼修 === 生 − 亡 − 逐` 一个字都不用改）。
    ⚠️ **不要**往 `world.riftLog` 加键：那是 `save.js` 里**逐键显式序列化的 5 键**
    （`opened/closed/leaked/crossed/lost`），加键会读档丢失 + save-equiv 键集判据变红。
    `nether.popLog` 属 `NETHER_ONLY_KEYS` **整对象**序列化 ⇒ 可以安全加键（F8③ 判存读档往返）。
18. **鬼爬入凡间 = 同一条幽冥缝的反方向**（D6-3 B）：
    · **两个效果各抽各的签**：`stepNetherRift` 里是两个**独立** `if`（**不是** `else if`），
      第二支走**第二条流** `mortalHauntRngFor`（派生键 `0x4841554e` = `'HAUN'`）。
      ⚠️ 六条独立流（rift / netherRift / wraith / upper / nether / mercy）**两两不同**（F9⑦ 逐对钉）。
    · 效果 = `climbOutToMortal`（导出以便测试直调）：候选 = 幽冥里 `sp === ghost` 且
      **离缝口最近**（半径内）的一只（平手保留先遇到的 ⇒ 顺序稳定可复现）；
      **先落成、再移除**（`spawnWraith` 撞上限返回 `null` ⇒ **保留幽冥那一份**，绝不凭空蒸发）；
      **零 `rng`**（谁爬出来由空间距离决定）。
    · ⭐⭐ **鬼住 `world.wraiths`（独立容器）+ `stepMortalWraiths`（独立 tick），
      **绝不进 `world.entities`**。理由（**查证过的事实**）：凡间与上界共用
      `cultivation.stepEntity`，其「凡人试着觉醒」段的豁免名单只有 `beast` / `spirit`，
      `ghost` **不在其中** ⇒ 鬼若进 `world.entities`：① 普通鬼魂被掷觉醒骰 → `awaken()` 给
      `level=1` + 灵根 + **寿元被 `lifespanForEntity` 重算**；② 鬼修按 `world.qi[格]` 修炼
      → 突破 → 40 级起**天雷飞升** → 上界凭空多一个鬼。两条都**不报错**并污染上界人口账。
      ⇒ 用**函数边界**隔离（**不**往 `stepCultivation` 里塞 `sp === 'ghost'` 的守卫——
      一行守卫能被顺手删掉，函数边界不能）。F9⑥ 用**源码结构**钉它
      （`sim/wraiths.js` 去注释后**代码**里不出现 `world.entities` / `addEntity`）。
    · **身份带世界限定符**：爬出来的鬼**保留幽冥 id**（`NETHER_ID_BASE` = 2_000_000 段），
      不重赋凡间号 ⇒ 与 `world.entities` 结构上不相交（F9② 钉）。
    · **消散判据是 `world.day >= dissolveDay`**，**不是** `age >= lifespan`：鬼不在
      `world.entities` 里，`stepCultivation` 不给它累加 `age`，拿 lifespan 判会**永不消散**。
    · **记账落 `nether.popLog.climbedOut`**（第三条离开路径，独立于 `ghostDied` / `evicted`）⇒
      守恒式扩成 `鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出`。
      ⚠️ **不要**往 `world.riftLog` 加键（那是 `save.js` 逐键显式序列化的 5 键）。
    · **凡间侧账本 `world.wraithLog` 只有 `dissolved` 一键**；「累计来过」=
      `wraiths.length + dissolved` **现算**（铁律二）。不变量：
      **`wraithStats.total === nether.popLog.climbedOut`**（同一批鬼的两端记账，F9① 交叉核对）。
    · **两个 key 进存档**（`wraiths` 22 字段逐字段显式 / `wraithLog`）；上界与幽冥 payload
      **刻意不含**（缝开在凡间、鬼爬进凡间）。读侧形状由 `WRAITH_TEMPLATE` 单源定义（`restoreWraiths`）。
    · **凡间 tick 周期 10 日，不挂 `deps.riftActive`**：鬼一旦爬出来就是凡间世界里的一只实体，
      飘不飘与玩家开不开视界无关（挂上去会造成「关掉视界 ⇒ 满地图的鬼集体定住、永不消散」）。
19. **幽冥物品泄漏 = 同一条幽冥缝的第三支 + 幽冥自生**（D6-3 C）：
    · **三个效果各抽各的签**：`stepNetherRift` 里是**三个独立 `if`**（**不是** `else if`），
      第三支走**第三条流** `netherItemRngFor`（派生键 `0x4e49544d` = `'NITM'`）。
      ⚠️ **七条独立流**（rift / netherRift / wraith / item / upper / nether / mercy）**两两不同**（F10⑦ 逐对钉）。
    · **来源① 跌入者随身带下去**：`fallIntoNether` 第 3 步 `moveArtifactsToNether`
      （**改掉了 A 包的 `scatterArtifacts` 行为**），落点用**人的落点**、`ownerId = 0`。
    · **来源② 幽冥自生**：`stepNetherItems`（`stepNether` 第 6 步）。⚠️⚠️ **必须先过一遍 `hashStep`**
      再当均匀分布用：`hash32`（FNV-1a）对「前缀相同、只差末尾数字」的短串有**极强高位偏置**
      （实测全落 0.70–0.74 ⇒ 概率阈值恒真、`NETHER_ITEM_CHANCE` 形同不存在、10 个判定点只出 1 件，**不报错**）。
      凡间 `stepArtifacts` 用 `rng()` 没有这个问题——这是**幽冥专有**的坑。
    · **去向③ 经缝漏回凡间地上**：`leakNetherItem`（导出以便测试直调）：候选 = 半径内
      **离缝口最近**的一件（平手保留先遇到的）；**先找落点、再动手**（`findMortalSpot` 找不到 ⇒ 整次放弃，
      物品留在幽冥）；**先落成、再移除**；**零 `rng`**（F10⑥ 钉源码结构）。
    · ⚠️⚠️ **铁律三：法宝 id 跨世界必须重赋**。id 是**世界内**编号（每个 `World` 的
      `nextArtifactId` 各自从 1 起）。不重赋 ⇒ 「凡间第 5 件」与「幽冥第 5 件」同号，
      日后 `claimGroundArtifact` 按 id 线性查找会命中**先出现的那一件**（**不报错**）。
      ⇒ 凡 → 幽（`moveArtifactsToNether`）与幽 → 凡（`leakNetherItem`）**各自重赋**。
      ⚠️ `save.js` 的 `nextArtifactId` 兜底循环**只扫** `world.artifacts` + `entity.artifacts`
      （**不扫** `nether.artifacts`）⇒ `nether.nextArtifactId` 必须自己进档。
    · **容器与记账全部复用 ⇒ 零存档结构改动**：物品池复用 **`nether.artifacts`**
      （`serializeWorld` 把 `artifacts` **整数组**写）；四条流水落 **`nether.popLog`**
      （属 `NETHER_ONLY_KEYS` **整对象**序列化 ⇒ 可安全加键）：
      `itemsSpawned / itemsFellIn / itemsLeakedOut / itemsDecayed`。
      ⚠️ **不要**往 `world.riftLog` 加键（逐键显式序列化的 5 键）。
    · **守恒式**：`nether.artifacts.length === itemsSpawned + itemsFellIn − itemsLeakedOut − itemsDecayed`
      （`netherItemStats().conserved`）。凡间侧对账落 **`artifactLog.netherIn`（幽 → 凡流入）/
      `netherOut`（凡 → 幽流出）**，与上界那两个（`riftIn` / `riftOut`）**分列四键**；
      凡间守恒律随之扩成 **`造出 + 流入(riftIn + netherIn) === 在世 + 碎 + 朽 + 流出(riftOut + netherOut)`**。
      ⚠️ `netherIn` / `netherOut` 与既有 `riftIn` / `riftOut` **同款**：`World` 构造器**不带**它们，
      跨位面事件发生时才惰性添加（`save.js` 的默认值只在 `artifactLog` **整个缺失**时生效）。
    · **池满裁剪单源**：`trimNetherItems` 朽掉**躺得最久**（`lostDay` 最小）的一件 + `itemsDecayed += 1`。
      **自生与跌入共用这一处**（两处各写一份会分叉，而分叉的后果是「守恒式对不上，但每处看代码都对」）。
      ⚠️ **顺序**：`stepNetherItems` **先判上限、再抽哈希**（池满不该动哈希流，
      否则「池满」这件事会静默改变哈希序列）。
    · **幽冥名池另造新名**（§5.6）：`NETHER_ARTIFACT_NAMES` / `NETHER_TECHNIQUES`（都在 `core/lore.js`）。
      **不含**「鬼 / 魂 / 莲 / 符」（考古定名：幽冥三物 / 鬼修六级 / 魂分五路——**不得另造同义词**），
      与**凡间**名池（`ARTIFACT_NAMES` / `MANUALS`）**零重名**。
    · **幽冥法宝携带一门功法**（`a.technique = {name, note}`，是幽冥物品的**身份标记**——
      凡间炼出的法宝没有这一字段）。凡人拾到即习得（`giveTo` → `grantTechnique`），
      上限 `TECHNIQUE_CAP = 3`、已会不重复推、栏满**不推功法但法宝照收**（不白送也不拒收）。
      ⚠️ 推的必须是**名池里的对象**（键集 `{name,note}`）——现场拼 `{name,note}` 会让 save-equiv 的
      键集并集比对红（读档靠 `save.js` 的 `MANUAL_BY_NAME` 还原同一个对象）⇒
      `MANUAL_BY_NAME` 已扩成 `[...MANUALS, ...NETHER_TECHNIQUES]`。
    · **编年史**：`KIND_TAG` 新增 `'rift-in' → 'cultivation'`（与 `'artifact'` 同组）。
20. **自生标定**：`NETHER_ITEM_CAP = 120` · `NETHER_ITEM_PERIOD_DAYS = 30`（与幽冥 10 日节拍错开）·
    `NETHER_ITEM_CHANCE = 0.55` · 品阶 / 品质**固定档**（宝品 / 精良，不掷档——幽冥的东西是
    「沉下来的」，不是按主人境界炼出来的）· 泄漏 `NETHER_ITEM_LEAK_CHANCE_PER_PERIOD = 0.02`。
    ⚠️ 两个概率常量都必须在 `(0,1)`：写 0 ⇒ 该系统静默死掉；> 1 ⇒ 瞬间漏满凡间（都不报错）。
21. **凡间实体守恒式判据（测试写法）**：幽冥物品跑满一生时，「凡间实体没被搅动」要写成
    **`w.entities.length + fellIn 增量 === 原数`**，**不是**「实体数不变」——凡间是 `scatter: true`
    撒过人的，缝口附近**可能**恰好站着一个活人，他会走 A 包**合法地**跌进去。
    写「不变」会让这条断言**取决于地形与种子**（今天绿、换种子红，而红的理由与物品系统无关）。
    这条纪律适用于所有「某个系统不该碰凡人列表」的断言。
22. **跨位面夺舍 = 同一条幽冥缝的第四支，且按「鬼修的阶」分两条路**（D6-3 D）：
    · **四个效果各抽各的签**：`stepNetherRift` 里是**四个独立 `if`**（**不是** `else if`），
      第四支走**第四条流** `netherPossessRngFor`（派生键 `0x4e505358` = `'NPSX'`）。
      ⚠️ **八条独立流**（rift / netherRift / wraith / item / possess / upper / nether / mercy）**两两不同**（F11⑦ 逐对钉）。
      F11⑥ 用**源码结构**钉「不是 `else if`」（`if` 恰好 4 个、`else` 一次不出现）。
    · **阶位分界（用户裁决 · 承重）**：`level ≤ POSSESS_TIER_MAX_LEVEL`（**20**，怨灵及以下）
      ⇒ **真夺舍**（`possessMortal`），鬼修**从幽冥消失**；`level ≥ 21`（厉鬼及以上）
      ⇒ **只暂时附身**（`hauntMortal`），鬼修**留在幽冥**。⚠️ 判据写成 `<= 20`（**含** 20）——
      怨灵正好是真夺舍那一档（F11/smoke 用 `level 20` vs `level 21` 两两对照钉它）。
    · **真夺舍五步（顺序承重）**：① `crossPossessedCount ≥ CROSS_POSSESS_CAP`（8）⇒ 收手；
      ② 成功率 = `crossPlanePossessionChance(阶, normalizeRancor(积怨), 容器阶, 道心)` × boost
      （`isObsessed` × 1.6 · `isHollowSoul` × 1.4），clamp `[0.05, 0.95]`，**走确定性哈希**（过 `mulberry32`）；
      ③ 凡人容器 `awaken`（`level > 0` 时 no-op）；④ 名字加 `·异`（只加一次）+ `possessedBy` **快照**（无 id）+
      `possessionScar{mode:'possess', until:-1}`（**永久**）；⑤ **先落成再 `splice` 移除鬼修**
      （反过来会让人「既没得到元神、鬼修又没了」）⇒ `possessedOut += 1` + `crossPlane += 1` +
      `milestone('possess-cross', target)`（进大事账本 + 受害者个人日志）。
    · **附身**：`possessionScar{mode:'haunt', until: day + HAUNT_DAYS}`（360）· 鬼**留幽冥** ·
      `haunted += 1` · `record('haunt')`（**不传 `actors`** ⇒ 不写个人日志）；不覆盖更晚的 `until`。
    · **成功率用积怨 `ghostRancor` 替代 `mind`**（鬼修没有道心）；`normalizeRancor` 把 [0, 300] 归一到 [0, 100]。
    · **行为锁在 `sim/life.js` 的 `stepEntity` 状态机之前**（与「入魔」同位置，`return false` 绕过
      `findEnemy` / `planNext`）；`isControlled(entity, day)` **只认附身**（`mode==='haunt' && until>day`）——
      真夺舍的 `until=-1` 恒假 ⇒ 被真夺舍者**照常行动**（它已是一个修士）。漫游走 `possessionWanderRoll`（纯哈希、零主流消费）。
    · **不良状态 `possessionScar` 是实体列 row[68]**（行总长 **68 → 69**；列**只能追加行尾**）·
      存**快照对象**（无 id，铁律三）· 老档（68 列）读侧逐键兜底成 `null`。
    · **特殊词条是派生、不入档**（铁律二）：`isObsessed`（执念）/ `isHollowSoul`（魂虚），
      `hashRoll` 现算、缺 id ⇒ false。⚠️ 频率必须落在率附近（`hash32` 直接当均匀数会全落 0.70–0.74 ⇒ 词条恒真/恒假、**不报错**）。
    · **记账**：幽冥 `nether.popLog.possessedOut`（**第四条离开路径**）⇒ 守恒式扩成
      **`鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺`**；凡间 `world.possessionLog` 五键。
      ⚠️ **不要**往 `world.riftLog` 加键（逐键显式序列化的 5 键）。
    · **三个效果函数全部零 `rng`**（`crossPlanePossession` / `possessMortal` / `hauntMortal`）；
      判定节奏的抽签只在 `stepNetherRift`（F11⑤ 用源码结构钉）。
23. **`possessionLog` 是他界 payload 的 `delete` 键**（D6-3 D 补齐，与 `soulLog` 同款）：
    `serializeUpperWorld` / `serializeNetherWorld` 各自 `delete payload.possessionLog;`
    ——那两界不跑 `stepPossession`（跨位面夺舍是鬼修自幽冥缝夺舍**凡间活人**的子账），恒零、刻意不存。
    ⚠️⚠️ **这一条此前漏删**（D6-3 D 施工时发现）。项目成文规则 =「某界不跑的账本 ⇒ worldgen 里归零 +
    该界 payload 里 `delete`」；`possessionLog` 在 `resetUpperSystems` / `resetNetherSystems` 都被归零，
    却只在凡间存 —— 补 `delete` 后必须**同步 save-equiv 三处注册**（`UPPER_EXEMPT` / `NETHER_FORBIDDEN_KEYS` /
    正向 `zero` 断言），否则 save-equiv 红，且红得很像「产品 bug」。
24. **新增常量式 `kind` 必须登记进 smoke 的 `NON_LITERAL` 豁免表**（D6-3 D 踩到）：
    `CROSS_POSSESS_KIND` / `HAUNT_KIND` 走模块级常量（同 `RECORD_KIND`），第二参不是字符串字面量 ⇒
    smoke 5l 的 kind 审计会同时判「**死映射**」（它们在 `KIND_TAG` 里但扫不到写入方）与「**未豁免**」两条假红。
    ⇒ 新 kind 用常量写时，**三处一起改**：`biography.js` 的 `KIND_TAG` + `MILESTONE_KINDS`（若传 `actors`）+
    `scripts/inkbox-smoke.mjs` 的 `NON_LITERAL`。
25. **面板读数扩展的守恒式必须两端同步**（D6-3 D）：`netherEcoStats.conserved`、`main.js` 生态行、
    playtest 10e 的**正则 + 算式**、smoke 5x 的两条守恒式——四处都在写「`鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺`」。
    漏改任一处 ⇒ 要么读数对不上（玩家看得见），要么断言只在「夺舍发生时」才红（更难查）。
26. **幽冥缝的站点必须落在「凡间可站 ∩ 幽冥河带」的交集格上，且用 1×1 区域开**（D6-3 E · 承重）：
    · `openRifts` 只把**矩形周长**上的格当候选缝口；幽冥缝口还必须**同时**满足
      `world.isWalkable` **且** `netherWalkable`。而幽冥的鬼 / 物品**只落在河带格**
      （`netherBankTiles` = 幽冥可站 ∩ 近河 ≤ `NETHER_BANK_RADIUS`）⇒ 缝口必须在**交集**里，
      缝半径（峰值 ~5.7 格）才够得着鬼与物品。站点错位 ⇒ **C / D 结构性饿死**（不报错，只是恒 0）。
    · **1×1 区域 ⇒ `sites.length === 1` ⇒ `openRifts` 的洗牌循环
      `for (i = sites.length - 1; i > 0; i -= 1)` 不执行 ⇒ 消费裂隙流 0 次** ⇒ 上界缝位置与
      「不开幽冥缝」时**逐字相同**。⚠️ 这是「不扰动随机流」落成**可数形态**的唯一依据；
      别把站点改回矩形（那会开始消费裂隙流，上界缝位置随之漂移，而**不会有任何断言变红**）。
      F12⑥ 用**同种子双世界比对**钉它。
    · **长跑判据口径**：A / B / C 判**存在性**（`≥ 1`）；**D 不判存在性**——它在真实长跑里
      几乎不触发（`pickGhostAtRift` 要「缝口半径内有鬼修」**且**「半径内有凡人」，同时成立极罕见）。
      D 的**存在性**由隔离世界钉（F11 / F12）；长跑只钉它的**账本耦合**
      `possessedOut === possessionLog.crossPlane`。⚠️ 硬写 `D ≥ 1` 是一条**永远红**的断言——
      和永远绿的断言一样有害（它训练人去忽略它）。
    · **凡间法宝守恒式含幽冥两向**：`造出 + (riftIn + netherIn) === 在世 + 碎 + 朽 + (riftOut + netherOut)`
      （`netherIn` = 幽冥 → 凡间流入，`netherOut` = 凡 → 幽流出；与上界的 `riftIn` / `riftOut` **分列四键**）。

## TESTED

- 工程包 A/B：smoke 418 ✓ / 1 红（`intervention` 漏配 `KIND_TAG`）·
  save-equiv **154 ✓ / 3 红**（当时记的数；E 包复核后确认应为「155 条断言 · 3 红」，
  详见 E 段的 diff 说明）。
- 工程包 C：`node --check` ✓ · `npm run test:core` ✓（42 文件 / 188 边 · core · startup）·
  **smoke 428 ✓ / 1 红**（418 基线 + 5v 新增 10 条，**全部通过**；红项仍是同一条既有基线）·
  局部 300 年长跑体检 ✓（medium preset：实体 16 · 非可通行格 0 · 非有限坐标 0 ·
  守恒式 12+14−10=16 ✓ · 耗时 92ms）。
  5v 关键读数：60 年开局 12 人 **12/12 移动** · 单拍位移 **8.000 格**（= 上限）·
  `stepSpatial` 消费 `this.rng` **0 次**（对照 spatialRng 11192 次）·
  修士落高灵气侧 **100%** vs 凡人 **45.9%** · 关掉 `stepSpatial` 后 60 年 **0 人移动**（反向对照）·
  移动状态跨存档**逐字往返**。
- 工程包 D：`node --check` ✓ · `npm run test:core` ✓（42 文件 / 188 边 · core · startup）·
  **smoke 449 ✓ / 1 红**（428 基线 + 5w 新增 21 条，**全部通过**；红项仍是同一条既有基线）。
  5w 关键读数：窄带 3486 格与**独立朴素扫描双向一致**（抽 `nearRiverAt` 语义不变）·
  60 年 12 只普通鬼魂 **12/12 移动**、**0 出窄带**、**0 站不住** ·
  鬼帝（reach 19）**离开窄带 1461 拍** · 单拍位移 **4.000 格**（上限 6）·
  同种子两遍轨迹**逐字一致**（零 rng）· D3 **0.3889 vs 0.1667**（= 0.2778×1.4 / ×0.6，精确匹配公式）·
  D4 留痕 **+0.03000**、对照格不变、存档往返 0.5 → 0.5000076 ·
  D5 目标到吸引源平均距离 **6.382 → 3.143** · 5u⑦ 复现 level **29/31/31/21/31**（全 > 1，未被 D3 压红）。
  ⚠️ 施工期发现 `spawnNetherGhost` 的 `decayYears < 0` 哨兵（`-1e9`）与注释「永不消散」**相反**
  （判据 `day >= ghostDecayDay` 恒真 ⇒ 立即消散）；生产路径不传该参数 ⇒ 无玩家可见后果，已记 BACKLOG `#20`。
- 工程包 E：`node --check` ✓（`main.js` / `planes.js` / `netherLife.js` / `inkbox-playtest.mjs`）·
  `npm run test:core` ✓（import-check **42 文件 / 189 边** · core · startup）·
  **smoke 460 ✓ / 1 红**（449 基线 + 5x 新增 **11** 条，**全部通过**；红项仍是同一条既有基线 `intervention`）。
  5x 关键读数：上界**故障注入**（四项 3/5/7/11 + died 4 ⇒ 生 26 / 现存 22）·
  上界**真实 300 年**守恒 `12 === 21 − 9`（seeded 12 + born 9 − died 9）·
  幽冥故障注入（9/5/2 ⇒ 现存 2）· 幽冥隔离世界 `生 35 / 亡 30 / 逐 0 / 现存 5` ·
  **逐出分流**：塞到上限之上跑一拍 ⇒ `逐 0 → 20`、`亡 0 → 0`、现存 400（= 上限）· 两界读数同名字段。
  playtest 10e 新增 3 条（上界守恒 / 幽冥守恒 / 统一口径），判据**只从 DOM 反读**，
  已用离线正/反例验证（正例全绿、反例必红）；⚠️ playtest 本体**未跑**（见下）。
- 工程包 E：**save-equiv 152 ✓ / 3 红**（共 155 条断言）。3 条红**同一根因**
  （`worldEventState` vs `worldEvents`，见 `BACKLOG.md` P3），**无新增红**。
  ⚠️ 与 A/B 记录的「154 ✓ / 3 红」对不上的原因已查清：**逐条 diff 2026-09-23 14:26 的日志**
  证明总断言数只多不少（154 → 155，B 包加了 1 条裂缝 `targetPlane` 键检查），
  差的 3 条是那 3 条**从绿翻红**；而它们在 09-23 日志里**还是绿的**
  （payload 顶层 45 键 → 现 46 键，多出的正是 `worldEvents`）⇒ 是 **D6-1 世界事件序列化**引入的，
  不是 A/B/C/D/E 引入的。已回填 `BACKLOG.md`。
- 工程包 F：`node --check` ✓ · `npm run test:core` ✓（42 文件 / 189 边）·
  **`npm run test:three-realms` 61 ✓ / 0 红**（新增脚本，七节全绿）。F 关键读数：
  · F1 全仓「游戏日 +=」**只有一处**（`advance.js:103`）· 三界 `day` 恒等（108000 = 300 年）·
    上界/幽冥节拍 **100/100**（= 1000÷10）· 裂缝累加器**跨开关存活**（关窗 60 日不丢）。
  · F2 三种子两两不同 · 异或自逆 · 两套落点判据在幽冥图上**分叉 37.5%**（不可互相顶替）。
  · F3 三段 id 交集 **0** · 跨界快照引用字段全切断 + **反向对照（原实体未动）**。
  · F4 守恒 `33 === 12 + 34 + 12 + 0 − 25` · `ascended` 恒空 · 两本死亡账一致（25 = 25）。
  · F5 逐出分流 `逐 0→20 / 亡 0→0` · 魂池别名**同一引用** · 幽冥模块 2 条 import 无 rng。
  · F6 裂缝 10 键 · `targetPlane` 往返 + 老档兜 `upper` · 阴气留痕误差 **7.629e-6 ≤ 0.5/65535**。
  · F7 **nether 缝消费裂隙流 0 次**（对照：上界缝 1 次）· nether 缝 age 照常 +30。
  ⚠️ F 施工期三条**假红**（都是判据写错，不是代码错）：① 把「跨界快照切断」套到**全部**上界实体
  （本土始祖线**本来就**有 `clan`/`artifacts`）⇒ 改成**直接调 `arriveUpper` 在落地那一刻判**；
  ② 把 `upper.dead` 当成「凡间系统泄漏」（那是上界**自己的**逝者名录）⇒ 移出名单，改钉
  「`deadLog.total` === `popLog.died`」；③ 阴气留痕断言写成**逐位相等**（`veg` 走量化，
  最大误差 0.5/65535）⇒ 改成**可推导的量化界** + 「远小于一次留痕增量」。
  ⇒ **教训：写断言前先确认「这个字段在这条时间线上本来会是什么」**，
  拿 300 年后的世界状态去判「落地那一刻的契约」必然假红。

### D6-2 六包齐 · 全套验收（2026-09-24 · 清单第十四节）

| 测试 | 结果 | 说明 |
| --- | --- | --- |
| `npm run test:core` | ✓ | 42 文件 / 189 边 · core · startup |
| `npm run test:three-realms` | **61 ✓ / 0 红** | F 包新增脚本（七节） |
| `npm run test:smoke` | **460 ✓ / 1 红** | 红项 = 既有基线 `intervention`（漏配 `KIND_TAG`） |
| `npm run test:save-equivalence` | **152 ✓ / 3 红** | 3 红同一根因（`worldEventState` vs `worldEvents`，D6-1 引入）；**F 后复跑逐条一致** |
| playtest（`--url=…:4180/inkbox.html`） | **143 通过 / 0 失败** | 含 10e 新增 3 条（上界守恒 / 幽冥守恒 / 统一口径），**全部绿** |
| longrun（800 年 · medium） | **79 ✓ / 0 红** | 结论「世界是活的 ✓」 |
| `npm run build`（打包） | ✓ | **70 files**；包内含 `scripts/inkbox-three-realms.mjs` / `THREE_REALMS.md` / 导出的 `DECAY_TRACE_VEG` |

- playtest 关键读数（10e 段）：上界「生灵 12 · 宗门 0 · 飞升上来 0 · 生态 生 12 · 亡 0」·
  幽冥「鬼魂 120 · 鬼修 0 · 生态 生 263 · 亡 143 · 逐 0」·
  两条守恒式（上界 `生灵 === 生 − 亡`、幽冥 `鬼魂 + 鬼修 === 生 − 亡 − 逐`）**从 DOM 反读**均成立 ·
  三界读数同词同序（`生态 生 … 亡 …`）。
- longrun 关键读数（800 年）：上界守恒 `246 = 12 + 323 + 91 + 924 − 1104`（有本土化生 91 · 陨落 1104 ⇒ 不是只增不减）·
  仙门 8 家 · 飞升者 39 在位（共到 323）· 裂缝 `opened 120 === closed 99 + 活跃 21` ·
  门槛咬合（裂隙上界 === 天雷下界 = 40）· 魂路「滞留幽冥」1762 / 「鬼修」241 两条通道都活着。
- ⚠️ **smoke / save-equiv 的红项都是既有基线，与 A/B/C/D/E/F 无因果**（已在 `BACKLOG.md` P3 登记）。
- ⚠️ 打包在本机 Bash 环境需把 `System32` 提前（否则 Git Bash 的 GNU tar 把盘符当远程主机，见 `BACKLOG.md` P3）；
  普通 cmd/PowerShell 用 System32 的 bsdtar 无此问题。

### D6-3 工程包 A 验收（2026-09-24）

| 测试 | 结果 | 说明 |
| --- | --- | --- |
| `node --check`（改动的 6 个文件） | ✓ | 语法过 |
| `npm run test:core` | ✓ | import-check **42 文件 / 191 边**（A 前 189，+2 来自 `rifts.js` 新 import）· core · startup |
| `npm run test:three-realms` | **77 ✓ / 0 红** | 八节（F 包 61 条 + F7 新 6 条 + F8 新 9 条，另 1 条为 F7① 改写） |
| `npm run test:smoke` | **471 ✓ / 1 红** | 460 基线 + 5q⑫/⑭ 新增 **11** 条，**全部通过**；红项仍是同一条既有基线 `intervention` |
| `npm run test:save-equivalence` | **152 ✓ / 3 红** | 与 D6-2 基线**逐条一致**（3 红仍是 `worldEventState` vs `worldEvents`，D6-1 引入）⇒ A 包**无新增红** |
| `npm run test:regression`（干预） | **17 项 OK** | `Inkbox intervention regression OK · 17 项` |

- 5q⑫/⑭ 关键读数：nether 缝推进 200 拍**裂隙流未前进**（`0.3635…` vs `0.3635…`）而
  **幽冥流已前进**（`0.3510…` vs `0.8965…`）· 两条流派生键 `0x72696674` / `0x4e524654` ·
  上界缝抽签次数「只有上界缝 1 次 / 再加一条幽冥缝 1 次」（**互不干扰**）·
  5q⑬ 守恒 `凡间 0 + 幽冥新增 1 === 1`、上界 `entities 12→12 / artifacts 0→0 / arrived 0→0` ·
  5q⑭ 落成鬼修 + `mortal:999999` 快照 · 化神期（`level === 40`）**不进候选** ·
  跌入者法宝**留在凡间地上**（`0→1`）。
- F8 关键读数（`test:three-realms`）：8 个固定种子**跌入 6 人 / 8 世界**（非空性守卫成立）·
  守恒逐世界成立 · 上界三个口径逐世界零变化 · `fellIn === 跌入实体数 ≤ ghostBorn` ·
  化神期对照跌入 **0** 人 · 存读档后 `fellIn === 1` 且幽冥实体数不变 ·
  **反向对照**：上界缝跑满一生 `fellIn` 恒 0、幽冥实体数不变 ·
  源码结构：`stepNetherRift`(87 字符) / `fallIntoNether`(2049 字符) 函数体里**没有**上界那三个名字。
- ⚠️ **施工期踩到一条新故障类**（已记 `BACKLOG.md` P3）：第一版 smoke 5q⑫ 用了 `RIFT_SEED_KEY`
  却漏了 import ⇒ `ReferenceError` **直接中断整个 smoke**（跑到第 352 条崩，后面 100+ 条一条没跑），
  而日志尾部**看起来像**「只红了 1 条既有基线」。`node --check` **抓不到**未定义标识符。
  ⇒ 看 smoke 日志**先确认结尾是「全部通过 / N 项未通过」而不是堆栈**。
- ⚠️ 另一条：`openRifts` **自己会消费裂隙流**（洗牌候选站点）⇒「绝对位置计数」在跑过 `openRifts`
  的世界里不可用（第一版探针两条判据都读 `-1`）；改用**同种子双世界比对**（一个跑 / 一个不跑，比下一签）。
- 临时探针 `scripts/_tmp-d63a.mjs`（15/15 全绿）**已删**——断言已折进 smoke 5q⑭ 与回归 F7/F8。

### D6-3 工程包 B 验收（2026-09-26）

| 测试 | 结果 | 说明 |
| --- | --- | --- |
| `node --check`（改动的 12 个文件） | ✓ | 语法全过 |
| `npm run test:core` | ✓ | import-check **43 文件 / 197 边**（A 后 42/191，+1 文件 `wraiths.js` / +6 边）· core · startup |
| `npm run test:three-realms` | **94 ✓ / 0 红** | 九节（A 后 77 条 + 新增 F9 17 条） |
| `npm run test:smoke` | **488 ✓ / 1 红** | A 后 471 基线 + 5q⑮ 新增 **17** 条，**全部通过**；红项仍是同一条既有基线 `intervention` |
| `npm run test:save-equivalence` | **158 ✓ / 3 红** | A 后 152 基线 + 新增 **6** 条；3 红仍是 `worldEventState` vs `worldEvents`（D6-1 引入）⇒ **无新增红** |
| `npm run test:regression`（干预） | **17 项 OK** | `Inkbox intervention regression OK · 17 项` |
| playtest（`--url=…:4180/inkbox.html`） | **143 通过 / 0 失败** | 10e 幽冥守恒式**改判据后仍绿**（`鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出`） |
| `npm run build`（打包） | ✓ | **71 files**（A 后 70，+1 = `sim/wraiths.js`） |

- F9 关键读数（`test:three-realms`）：8 个固定种子**爬出 48 只 / 8 世界**（非空性守卫成立）·
  守恒 `此刻在凡间 + 已消散 === climbedOut` 逐世界成立 · **凡间 `world.entities` 逐世界零变化** ·
  上界三个口径逐世界零变化 · 直接调 `climbOutToMortal` 落进 `world.wraiths`（`entities 0→0`）·
  **保留幽冥 id**（`id=2000000` ≥ 基址）· 编年史 `rift-out` · 到期消散 `alive 0 / 本拍 1 / 累计 1` ·
  存读档 22 字段逐字段往返 · **源码结构：`wraiths.js` 代码里 `world.entities` 0 次 / `addEntity` 0 次** ·
  `stepMortalWraiths` 函数体 `entities` 0 次 · `climbOutToMortal` 零 rng ·
  **六条流派生键两两不同**（`rift=0x72696674 · netherRift=0x4e524654 · wraith=0x4841554e ·
  upper=0x55505052 · nether=0x4e455452 · mercy=0x4d455243`）·
  **反向对照**：上界缝跑满一生 `climbedOut` 恒 0 / `wraiths` 恒空。
- smoke 5q⑮ 关键读数：`climbOutToMortal` 送出鬼（幽冥 `1→0`、鬼影 `1`）·
  **`entities 0→0`（不变）** · `wraithStats.total === climbedOut`（`1 vs 1`）· 编年史 `rift-out` ·
  半径外不动 / 无幽冥跳过 / **取最近的那只**（不是境界最高）/ 撞上限 `WRAITH_CAP` 时**保留幽冥那一份** ·
  到期消散 + 消散后守恒仍成立 · `ensureWraithLog` 幂等 · 概率常量 `0.05 ∈ (0,1)` · 流键 `0x4841554e` · 寿数 1080。
- playtest 10e 关键读数：上界「生灵 12 · 生态 生 12 · 亡 0」·
  幽冥「鬼魂 120 · 鬼修 0 · 生态 生 260 · 亡 140 · 逐 0 · **出 0**」·
  两条守恒式（含新增「出」）**从 DOM 反读**均成立 · 三界读数同词同序。
- 临时探针 `scripts/_tmp-d63b.mjs`（20/20 全绿）**已删**——断言已折进 smoke 5q⑮ 与回归 F9。
- ⚠️ **施工期一条新故障类**（已记 `BACKLOG.md` P3）：`save-equiv` 的**上界「漏写」检查**把
  `wraiths` / `wraithLog` 报成「漏写」（它们被 `serializeUpperWorld` 显式 delete 了）
  ⇒ 必须同步补进 `UPPER_NOT_SAVED` 豁免表。**新增凡间专属键时，「写侧 delete」与「豁免表注册」
  是同一个改动的两半**——只做前者会让 save-equiv 红，且红得很像「产品 bug」。

### D6-3 工程包 C 验收（2026-09-26）

| 测试 | 结果 | 说明 |
| --- | --- | --- |
| `node --check`（改动的 8 个文件） | ✓ | 语法全过 |
| `npm run test:core` | ✓ | import-check **43 文件 / 199 边**（B 后 197，+2 边来自 `netherLife.js` / `rifts.js` 新 import）· core · startup |
| `npm run test:three-realms` | **119 ✓ / 0 红** | 十节（B 后 94 条 + 新增 F10 **26** 条） |
| `npm run test:smoke` | **530 ✓ / 1 红** | B 后 488 基线 + C 新增 **42** 条（5q⑯ **41** + 5q⑭⑤ 改写 +1），**全部通过**；红项仍是同一条既有基线 `intervention` |
| `npm run test:save-equivalence` | **165 ✓ / 3 红** | B 后 158 基线 + 新增 **7** 条；3 红仍是 `worldEventState` vs `worldEvents`（D6-1 引入）⇒ **无新增红** |
| `npm run test:regression`（干预） | **17 项 OK** | `Inkbox intervention regression OK · 17 项` |
| playtest（`--url=…:4180/inkbox.html`） | **143 通过 / 0 失败** | 全程无运行时报错；幽冥行尾追加 `· 物 N`（在 `· 出 N` 之后）后 10e 正则仍匹配 |
| `npm run build`（打包） | ✓ | **71 files**（无新建文件） |

- F10 关键读数（`test:three-realms`）：8 个固定种子**自生 429 件 / 8 世界**、**漏出 22 件**（非空性守卫成立）·
  守恒 `alive === spawned + fellIn − leakedOut − decayed` 逐世界成立 ·
  两端记账恒等（幽冥 `itemsLeakedOut` === 凡间 `artifactLog.netherIn`）· id 重赋（77 → 5）·
  编年史 `rift-in`（归 `cultivation`）· `netherOut += 2` · **七条流派生键两两不同** ·
  反向对照：上界缝跑满一生 `itemsLeakedOut` 恒 0 / 幽冥物品池不变。
- smoke 5q⑯ 关键读数：跑 3000 天**自生 60 件且守恒** · **区分力**（100 个判定点出 60 件——钉 `hash32` 高位偏置）·
  自生法宝与 `forgeArtifact` **逐键同形**（只多 `technique`）· 同种子两遍轨迹**逐字一致**（纯哈希，不是流）·
  跌入者带物（`幽冥 0→1` / `itemsFellIn=2` / **id 重赋 1,2** / 落点 = 人的落点）·
  `leakNetherItem` 漏回凡间（**id 重赋 77 → 5** / `nextArtifactId → 6` / 保留 `technique` / `rift-in`）·
  习得功法（进 `techniques` / 推的是**名池对象** `{name,note}` / 去重 / **栏满不推功法但法宝照收**）·
  池满 `trimNetherItems` 压回上限（170 → 120 / `decayed=50` / **池满抑制自生**）·
  四条跨界流键两两不同（rift / nrift / haun / nitm）· 名池合规（**不含**鬼/魂/莲/符 · 与凡间零重名）。
- save-equiv 关键读数：两件幽冥物品 **19 键逐字段往返** · `technique` 往返 · `nextArtifactId > max id`（3 > 2）·
  四条流水 `3/1/1/1` 往返 · 守恒 `2 vs 2` · 老档降级（物品池空数组 / 四条流水就位且为 0）。
- 临时探针 `scripts/_tmp-d63c.mjs`（28/28）与 `scripts/_tmp-d63c2.mjs`（41/41，5q⑯ 预演）**已删**。
- ⚠️ **施工期两条新故障类**（已记 `BACKLOG.md` P3）：① `hash32`（FNV-1a）对「前缀相同、只差末尾数字」
  的短串有极强高位偏置（全落 0.70–0.74 ⇒ 概率阈值恒真、不报错）⇒ 拿哈希当均匀分布用**必须先过 `hashStep`**；
  ② 判据写成「凡间实体数不变」应改**守恒式**（凡间撒过人，缝口附近可能恰好站一个活人）——F10② 自纠。

### D6-3 工程包 D 验收（2026-09-26）

| 测试 | 结果 | 说明 |
| --- | --- | --- |
| `node --check`（改动的 10 个文件 + 4 个测试脚本） | ✓ | 语法全过 |
| `npm run test:core` | ✓ | import-check **43 文件 / 203 边**（C 后 199，+4 边来自 `rifts.js` / `life.js` / `main.js` 新 import）· core · startup |
| `npm run test:three-realms` | **134 ✓ / 0 红** | 十一节（C 后 119 条 + 新增 F11 **15** 条） |
| `npm run test:smoke` | **561 ✓ / 1 红** | C 后 530 基线 + D 新增 **31** 条（5q⑰ ~25 + 5x 守恒式升五路径 + import/豁免），**全部通过**；红项仍是同一条既有基线 `intervention` |
| `npm run test:save-equivalence` | **168 ✓ / 3 红** | C 后 165 基线 + 新增 **3** 条；3 红仍是 `worldEventState` vs `worldEvents`（D6-1 引入）⇒ **无新增红** |
| `npm run test:regression`（干预） | **17 项 OK** | `Inkbox intervention regression OK · 17 项` |
| playtest（`--url=…:4180/inkbox.html`） | **143 通过 / 0 失败** | 10e 幽冥守恒式**改判据后仍绿**（`鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺`）；全程无运行时报错 |
| `npm run build`（打包） | ✓（**71 files**） | 无新建文件（`sim/possession.js` 早已存在）⇒ 与 C 后同为 71 |

- F11 关键读数（`test:three-realms`）：8 个固定种子**真夺舍 7 次 / 附身 10 次**（非空性守卫成立）·
  守恒 `鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺` 逐世界成立 · **凡间减员全部记在 `fellIn`** ·
  上界三个口径逐世界零变化 · `crossPlanePossession` / `possessMortal` / `hauntMortal` **三个函数体零 rng** ·
  `stepNetherRift` **四支齐全且 `else` 一次不出现** · `if (` 恰好 **4** 个 ·
  **八条流派生键两两不同**（`possess=0x4e505358`）· `netherPossessRngFor` 同一实例 ·
  **反向对照**：上界缝跑满一生 `possessedOut` / `crossPlane` / `haunted` 恒 0 · 概率常量 `0.01 ∈ (0,1)` ·
  存读档 `possessedOut` / `crossPlane` / `haunted` / `possessionScar` 四样都留得住。
- smoke 5q⑰ 关键读数：真夺舍（落 `possessionScar{mode:possess,until:-1}` / 点化 `sp=cultivator` / 名字 `·异` /
  鬼修**从幽冥消失** / 两条账 `possessedOut=1` + `crossPlane=1` / `possess-cross` 进大事账本 / 受害者个人日志一笔 /
  **不锁行动**）· 附身（`mode=haunt` `until=day+360` / 鬼**留幽冥** / `haunted=1` / 锁生效且到期自动解除 /
  正被附身者不再被选）· 阶位分界 `20` 真夺舍 vs `21` 只附身 · cap 到顶不再夺舍 · 词条频率 `0.063` / `0.052`
  （期望 0.06，钉「哈希先过 finalizer」）· `normalizeRancor` 四界 · 跨位面成功率与 `possessionChance` 逐位相等 ·
  `possessionScar` row[68] 往返 · `haunted` 子账往返。
- save-equiv 关键读数：`ENTITY_COLUMNS` **69** · `possessionScar` 列 `row[68]` 往返 ·
  v5 老档 `possessionScar === null` / `possessionLog` **五字段全零** · 夺舍账本 `diffFields` **5 键** ·
  `NETHER_FORBIDDEN_KEYS` **七键** · `UPPER_EXEMPT` 注册 `possessionLog` ·
  上界不跑凡间专属系统 **31 项 × 2 侧** · 幽冥块里没有凡间专属的七个键 **40 键**。
- ⚠️ **施工期两条新故障类**（已记 `BACKLOG.md` P3）：① **常量式 `kind` 撞 smoke 5l 双红**
  （死映射 + 未豁免，都是假红）⇒ 必须同步补 `NON_LITERAL`；
  ② **`initEntity` 在 `sim/cultivation.js` 而不是 `core/cultivation.js`**（两个同名文件）——
  F11 首跑 `SyntaxError: does not provide an export named 'initEntity'`，**立刻中断整个回归**
  （`node --check` 抓不到「导错文件」）。
- ⚠️ **本机 `spawnSync` 被环境拦截（EBUSY，所有 exe 一律失败）** ⇒ `npm run build` 的 tar 步骤跑不完
  （copy 步骤已完成，`dist/…-1.0.0/` 恰好 71 files）；本次用 System32 的 `bsdtar` 手工补上 `.zip`
  （84 entries = 71 文件 + 13 目录）。**这是环境限制，不是产品问题**。

### D6-3 工程包 E 验收（2026-09-26）

> E 包**零生产代码改动**——只改两个测试脚本（`scripts/inkbox-longrun.mjs` / `scripts/inkbox-three-realms.mjs`），
> 把 A–D 引入的跨包契约钉进长跑与回归。因此所有红项都应与 D 包基线**逐条一致**。

| 测试 | 结果 | 说明 |
| --- | --- | --- |
| `node --check`（改动的 2 个测试脚本） | ✓ | 语法全过 |
| `npm run test:core` | ✓ | import-check **43 文件 / 203 边**（与 D 后一致，E 不动 `src/`）· core · startup |
| `npm run test:regression`（干预） | **17 项 OK** | `Inkbox intervention regression OK · 17 项` |
| `npm run test:three-realms` | **144 ✓ / 0 红** | **十二节**（D 后 134 条 + 新增 F12 **10** 条） |
| `npm run test:save-equivalence` | **185 ✓ / 3 红**（共 188 条） | 3 红仍是 `worldEventState` vs `worldEvents`（D6-1 引入）⇒ **无新增红**。⚠️ 断言总数随世界演化内容浮动（同脚本历史读数 155 → 171 → 188），不是 E 包引入 |
| `npm run test:simulation`（smoke） | **561 ✓ / 1 红** | 与 D 后基线**逐条一致**；红项仍是既有基线 `intervention`（漏配 `KIND_TAG`，`main.js` 一处） |
| playtest（`--url=…:4180/inkbox.html`） | **143 通过 / 0 失败** | 与 D 后基线一致。⚠️ 第 2 次跑出现过 1 条**竞态假红**（`点一个人能摊开「他的一生」`：`取坐标 → 点击` 之间右栏重渲染 ⇒ 点击落空；第 3 次重跑绿，读数 `992 字 · 已弹出`）。已记 `BACKLOG.md` P3 |
| longrun（**800 年** · medium · **挂三界**） | **89 ✓ / 0 红** | 结论「世界是活的 ✓」；D 后基线 79 ✓ ⇒ E 新增 **10** 条 |
| `npm run build`（打包） | ✓（**71 files**） | 无新建文件（E 只改已有测试脚本）⇒ 与 D 后同为 71 |

**E 包关键读数（longrun 800 年 · 新增「三界跨界生态」一节 10 条断言）**：
- 幽冥缝累计开 **36** 道（活跃 **6**）· 跌入 **30** · 爬出 **123** · 漏物 **10** · 夺舍 **0**（附身 3）。
- 幽冥名册 400（自生 5793 / 亡 5057 / 逐 213）· 幽冥物品 120 件（自生 130 / 朽 20）· 凡间鬼影 0 只（已消散 123）。
- **法宝守恒含幽冥两向：`1489 + 1 + 10 = 899 + 581 + 0 + 0 + 20`（差 0 件）**。
- 裂缝 `活跃 27（上界 21 / 幽冥 6）`——报告行已按 `targetPlane` 分位面拆开。
- ⏱️ 耗时 **1650695ms（27.5 分）**，D 后基线 1136834ms（18.9 分）——因为基线**从不建幽冥**，
  `stepNether` 从没跑过。**这是 E 包引入的真实工作量，不是性能退化**。
- 新增的 5 条**跨书对账**（幽冥 `itemsLeakedOut` === 凡间 `artifactLog.netherIn`、
  `itemsFellIn` === `netherOut`、`possessedOut` === `possessionLog.crossPlane`、
  鬼影账本 `wraithStats.total` === 幽冥 `climbedOut`）**全部成立**——这是三界「同一批东西两端记账」的硬证据。
- 通道 A/B/C 判**存在性**（`≥1`）；**通道 D（夺舍）不判存在性**（真实长跑里几乎不触发，见下）。

**E 包关键读数（`test:three-realms` · 新增 F12 十条）**：
- 端到端 8 种子 × 200 个裂隙周期：四支同缝读数 `跌入 11 / 爬出 32 / 漏物 22 / 夺舍 7 / 附身 0`。
- 五条守恒式（幽冥生态 / 幽冥物品 / 鬼影两端 / 两条跨书物品对账）**逐世界成立**；
  上界三个口径逐世界零变化；`w.entities.length + fellIn === mEnt`（凡间减员全记在 `fellIn`）。
- 四支独立流**各被消费恰好 `pass` 次**（`pass 60/60`：`netherRift` / `wraith` / `item` / `possess` 全 true）。
- **1×1 开缝不消费裂隙流**：A 世界开一道 1×1 nether 缝后，下一签 `0.8958954561967403` 与未开缝的 B 世界**逐位相同**。
- **反向对照**：上界缝跑满一生，四支账本恒 0。
- 源码结构：`fallIntoNether` / `climbOutToMortal` / `leakNetherItem` **函数体零 rng**。

**E 包判据口径决策（来自四个临时探针实测，探针已删）**：
- 探针实测（10 站点 300 年 → A=30 / B=133 / C=18 / **D=0（附身 1）**；单站点 120 年 → A=3 / B=6 / C=3 / **D=0**）
  证明：**A/B/C 在真实长跑里稳定触发，D（跨位面夺舍）几乎不触发**。
- ⇒ 长跑只判 A/B/C 的**存在性**与 D 的**账本耦合**（`possessedOut === crossPlane`），
  **不判 D 的存在性**；D 的存在性交给隔离世界（F11 / F12，8 种子得 7 次真夺舍）。
- ⚠️ 站点选择有硬约束：`openRifts` 只把**矩形周长**格当候选缝口，且 nether 缝口要求
  `isWalkable` **且** `netherWalkable` 同时成立（= 落在「凡间可站 ∩ 幽冥河带」的交集格）。
  实测河带 5073 格中仅 **2549 格**凡间也可站（50.2%）⇒ 站点必须选在交集格上，否则开不出缝。
  longrun 用 6 个散布站点 `[[127,45],[192,30],[66,46],[101,100],[189,101],[261,101]]`。
- ⚠️ **1×1 区域是刻意的**：`openRifts` 洗牌循环 `for (i = sites.length - 1; i > 0; i -= 1)`
  在 `sites.length === 1` 时**不执行** ⇒ 消费裂隙流 **0 次** ⇒ 挂幽冥缝**不会移动上界裂缝的世界线**。
  这是 F7⑨ 的几何版证据（F7⑨ 从函数边界钉，F12⑥ 从「下一签逐位相同」钉）。

**E 包施工期两条假红（都是测试侧写错，不是产品问题）**：
- ① `stockRift` 手工 `log.ghostBorn += 10`，但 `spawnNetherGhost` **自己已经记了** `ghostBorn`
  （`netherLife.js:667`）⇒ 重复计 4 ⇒ 生态守恒 false。**修法**：改成 `+= 6`（只补 6 只手推的鬼修）。
  ⇒ **教训：往账本里塞东西前，先确认被调函数是否已经自己记过账。**
- ② 四支流「各消费 `pass` 次」判据红：`mortalHauntRngFor` **不只**被 `stepNetherRift` 消费，
  `stepMortalWraiths`（每 10 日一拍，`wraiths.js:333`）也用它 ⇒ 消费次数多于 pass 数。
  **修法**：该段 `runWorld(..., { nether: false, wraith: false })`（两个消费者都要冻结）。
  ⇒ **教训：判「某条流的消费次数」前，先 grep 出这条流的全部消费者。**
