# HANDOFF · 坐天观井 Inkbox 交接单

2026-10-08 当前阶段：**M2-C2D.1 本机工程验收完成，最终美术待人工裁决**。指定分支 `codex/m2-c2d1-painterly-reconciliation` 从 WIP `daf78c0` 续作；完整十二镜四轮 GPU 零正向预算、CPU、六层/GPU 契约、历史对照与原套件 600/6000 soak 通过。用户已授权完成后上传该分支，远端 CI 以最新对应提交为准。没有合并 main，未把旧 C2B/C2C 的 Actions 作为本阶段证明。入口：[就绪](./M2C2D1_READINESS.md)、[视觉](./M2C2D1_VISUAL_ACCEPTANCE.md)、[性能](./M2C2D1_PERFORMANCE_REPORT.md)。

以下 2026-10-06 段落为历史阶段记录。

2026-10-06 当前真相：**M2-C2B Pass 1 已在主线 `e0a851c` 远端封板，第一代正式资产生产体系成立。**Push CI [37224093479](https://github.com/sjh20016/inkbox/actions/runs/37224093479)、手动 Windows Browser / C2B 矩阵与 soak [37224107941](https://github.com/sjh20016/inkbox/actions/runs/37224107941)、800 年 Nightly [37233858438](https://github.com/sjh20016/inkbox/actions/runs/37233858438) 均成功。**M2-C2C Meaningful Geography 已本地完成，远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行**；范围限于呈现已有 World 语义，不扩展上界文明、幽冥城市或浮空岛拓扑。入口：[资产](./M2C2B_ASSET_PRODUCTION_REPORT.md)、[性能](./M2C2B_PERFORMANCE_REPORT.md)、[视觉](./M2C2B_VISUAL_ACCEPTANCE.md)、[就绪与20项答复](./M2C2B_READINESS.md)。

> 历史基线：2026-10-04，M2-C2A.1 / M2-C2B0 三界视觉阶段。读序：README → 本文 → 当前任务涉及的契约 / 源码。
> 阶段看 ROADMAP，目录和模块责任看 ARCHITECTURE，历史查 STATUS；本地 MEMORY 只作索引。

长期正式资产规则：[ASSET_PRODUCTION_SPEC](./ASSET_PRODUCTION_SPEC.md)。新增阶段区分正常 Golden、极端 Proof 和完整矩阵；Git 每阶段最多 8 张代表 PNG，完整浏览器证据保留在本机或 Actions artifact。

## 0. 当前状态与范围

工程已并入main。首推c67a0ee的旧dirty分类回归已由426412d修复：heightChanged原派发不变，生产Site/Leyline独立重验type准入；旧Bridge36断言、新C2C8组和完整Fast26命令通过。修复后的两对GPU与实际点击105通过，独立审查通过；compact summary分别保留原23对/Soak和修复源码/复验SHA，最终远端门禁以本轮main Actions为准。

2026-10-06 C2C 实现与本地验收完成：既有四类 Site、Leyline、Upper `qi`、Nether `veg`、持久 Rift 与短命 FX。六个只读开关 `sites` / `leylines` / `upperQi` / `netherYin` / `rifts` / `riftFx` 由 Host 编排；production on 使用正式资源，`geography=off` / `assets=off`、缺资产或完整 footprint 拒绝时保留旧基线与诚实回退。真实 id 必须解析当前 World；不复制半径公式或事件消费口。

本地 11 模式 × 600 日 / 11 RNG / 49 save keys 一致，full SHA `4b37e9605591ef48e986833513a5f633da7ef28bc080f326dc884efe44abb498`。完整 23 对 GPU off/on 矩阵通过，四类真实 Site 在约 90px 正常视角的生产几何与 CDP 点击通过；600 生命周期实际 update / render 各 600 次，6000 产品 RAF 帧及两个关键祖先 Browser 通过。干净克隆 ccac961 独立 npm ci 与 16 项安装 / CPU / 旧资产 / build 命令通过。6000 帧分为 20 × 300 帧，200 段检查均保持 114 geometry / 10 texture / 16 program。M2-B 祖先的 Upper / Nether / boundary 分别有 173 / 235 / 91 个可见几何命中，visible geometry === hit；C2B sample 三档真实 GLB 点击通过。 远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行，C2B 三个历史 Actions 不能作本轮证明。入口：[就绪](./M2C2C_READINESS.md)、[工程与24项答复](./M2C2C_MEANINGFUL_GEOGRAPHY_REPORT.md)、[性能](./M2C2C_PERFORMANCE_REPORT.md)、[视觉](./M2C2C_VISUAL_ACCEPTANCE.md)。运行包为 333 文件，目录约 8.8MB、ZIP 约 2.7MB；compact acceptance summary 保持不超过 256KiB。8 张正常 Golden 共 7206282 bytes，选择 case 1 / 3 / 4 / 5 / 6 / 8 / 12 / 14，位于开发路径 reports/release/render3d-m2c2c/golden/，不进入 runtime。

C2A.1 包清单、真实聚落 HLOD 与密林测量已封板；C2B0 的 24 对截图、600 日全部 11 RNG、600+6000 帧及 21 次 GC 峰值门禁已通过。单源是 [RealmStyleProfile](./src/inkbox/render3d/art/RealmStyleProfile.js)，以 stage.plane 选色。文档入口：[视觉](./M2C2B0_VISUAL_REPORT.md)、[性能](./M2C2B0_PERFORMANCE_REPORT.md)、[终验与就绪条件](./M2C2B0_READINESS.md)。该段只记录 C2B0 当时事实；C2B Pass 1 随后建立了第一代正式资产生产体系。

M2-B 的完整 Layer Mask、共享 ElevationField / RegionGeometry、界缘、3D 划窗与拾取已完成。M2-C 在同一个 Host/Renderer/Camera、三个 Stage 上增加薄 ArtPass；不改变模拟、存档或视界定义。范围与证据见 [M2-C 工程报告](./M2C_EXPRESSIVE_INK_REPORT.md)。

M2-C2A 接入三档真实几何 LOD、迟滞、密度预算与凡间小聚落 HLOD 原型；[实施与验收](./M2C2A_LOD_REPORT.md)、[性能](./M2C2A_PERFORMANCE_REPORT.md)、[视觉](./M2C2A_VISUAL_ACCEPTANCE.md) 保存 C2A 当时证据。3D 默认 `art=realm-style-v1` 且 LOD 开启；`art=legacy` 保留旧 pilot 对照，`lod=off` 保留全 LOD0；`artdebug=1` 才出现调参面板。现有 GLB 近景角色保留。后续资产扩产、完整群体动画、Trace Field 和 Gameplay G 留到后续授权。

历史封板检查：C2A核心8组、旧CLI14项、浏览器矩阵15项、600+6000帧及本机五套Browser Smoke通过。其后 C2B Pass 1 已通过远端封板；详细 Actions 证据见本文顶部与 [M2-C2B 就绪报告](./M2C2B_READINESS.md)。

用户允许实验建筑资产自由修改，并指定 `美术素材/配色参考` 为后续颜色参考；使用索引见 [参考资产索引](./美术素材/参考资产索引.md)。范式包用于研究，产品不依赖整套第三方素材。

Browser / Soak 的 Mortal 输入共同由 `ensureCanonicalMortalCache` 在 GPU 测量前准备：Node seed226 / small / 每次 3 日普通推进到 day72000，生成自然产品存档与 metadata，经产品 importFile 导入。默认缺失或 simulation 源码 / Node-V8 / 保存 SHA 不匹配时重建，显式输入坏校验拒绝；Realms 同样校验完整 simulation 源码 / Node-V8 / 保存 SHA，默认旧 metadata 不匹配时自动重建。独立干净克隆 d9ca78b 的 cold 复验通过：缺 Mortal 缓存时自动自然生成，Realms 旧 metadata 自动重建；新 Mortal / Realms save 与 World / advance / history SHA 均与原完整 23 对矩阵一致。诊断 case 1 / 4 两对的 World / advance / camera 不变，Formation105 约 90px、38/96 前景三角，真实点击返回 105，error 0。报告保留 diagnosticComplete=true、pass=false，表示仅完成诊断，不替代 23 对全矩阵。8 项显式坏 save / source / engine / missing 拒绝检查通过。初次 cold 失败与修复后证据均独立留 proof。

## 1. 唯一工作区与版本

- 活跃源码：`inkbox.html` + `src/inkbox/**`；`index.html` / `game.html` 是跳转入口。
- 版本：Inkbox `1.0.0`（`package.json` 与 `core/config.js`）。`main` 是唯一活跃主线，工作分支从 main 建立。
- 本工作区直接关联 `sjh20016/inkbox` 的 origin；无需把 dist 复制到另一个“发布工作区”。
- `render3d-m0` / `render3d-m2a` 是历史 checkpoint，不从旧快照继续新功能，不重写已发布历史。
- D6-2 / D6-3、D7 A–G、D8 A–F、M0 / M1 / M1.1D / M2-A / M2-B / M2-C / M2-C2A / M2-C2A.1 / M2-C2B0 / M2-C2B Pass 1 已完成。
  D8-G 只有 `realmTrace` / `netherGhostOf` 逻辑地基，追迹 UI 仍暂缓。
- 当前 M2-C2C 已本地完成；下一阶段优先真实宗门 / 灵脉空间归属，R1 只留 Lab，R2 不授权道路；新的 runtime 施工需后续授权。

## 2. 启动与依赖

`npm run dev` → `http://127.0.0.1:4180/`；3D 加 `inkbox.html?renderer=3d`，可切回 Canvas，复用同一世界。
运行服务器需要 Node 18+；零依赖 CDP 浏览器测试需要 Node 22+，CI 使用 Node 24。
Three 固定为 `0.186.1`：浏览器 importmap 读 `vendor/three/`，Node 测试读 npm 依赖。修改版本后执行 `npm run vendor:sync` 和 `npm run test:vendor`；vendor 的 LF 策略由 `.gitattributes` 保证。

## 3. 推进、渲染与编辑边界

- `sim/advance.js` 的 `advanceWorld(world, days, deps)` 定义完整世界的游戏日推进；Sandbox 的 `advanceDays` 是游戏侧接线。
  完整世界回归使用这条推进链；隔离子系统测试可直接测试对应函数，不复制一套完整时钟。
- 模拟世界是数据真相。渲染不抽模拟 RNG、不反写实体 / 生态、不把 renderer dirty 或派生量写入存档。
  `WorldRenderBridge` 与各 Layer 自管快照和刷新周期。
- `PresentationStage.ingestWorlds` 是 runtime event 唯一消费口；Canvas 画 `drawPlane`，Three 读取冻结的 `snapshotPlane`，不另 drain。
- Canvas、Three、`riftViewOpen` 共用 `getRealmViewState({selection, toolId})`。Region 始终是世界格坐标，规则见 VIEW_CONTRACT v2。
- 按实际可见地形 / 实例几何拾取，返回 plane；跨界检视只读。斜视的合法前景遮挡保留。
- 地形编辑是显式例外：`terrain/sculpt.js` 只改 height，Adapter 仅在凡间且 Mask / Slab 关闭时允许雕刻和撤销。
- world / 子世界 / 尺寸 / 地形数组身份变化会释放并重建 Stage 集合，保留 GPU 与相机；缺失位面回退凡间。

## 4. 文档责任与冲突处理

| 文档 | 唯一职责 |
| --- | --- |
| [ROADMAP](./ROADMAP.md) | 当前阶段与下一轮设计方向 |
| [ARCHITECTURE](./ARCHITECTURE.md) | 工作区地图、模块边界、仓库 / 发布包归属 |
| [THREE_REALMS](./THREE_REALMS.md) | 三界模拟规则 |
| [VIEW_CONTRACT](./VIEW_CONTRACT.md) | renderer-independent 视界规则 V1–V11 |
| [文案使用说明](./剧情文案素材/00_文案使用说明（AI与开发者必读）.md) | 文案声音、UI 禁令、考古定名与素材接线 |
| [BACKLOG](./BACKLOG.md) | 未完成事项；已完成编号只留关闭记录 |
| [STATUS](./STATUS.md)、各阶段委托书 / 报告 | 按日期保留的历史与证据，不充当当前施工指令 |

用户最新明确指令决定范围；源码与实际执行结果决定“已经做了什么”。若实现与契约冲突，记录差异并处理当前授权范围，不能为通过测试静默改规则。
历史文档里的旧阶段编号、旧禁令、旧计数不覆盖当前契约。本地 `.workbuddy-ai/memory/` 不新增另一套规则，也不作为发布包必读依赖。

## 5. 验证与 CI

当前七个委托命令如下，Leyline 单独定位还可跑 `npm run test:render3d:m2c2c:leylines`；测试职责与历史入口见 [tests/README](./tests/README.md)。

```bash
npm run test:render3d:m2c2c
npm run test:render3d:m2c2c:sites
npm run test:render3d:m2c2c:fields
npm run test:render3d:m2c2c:rifts
npm run test:render3d:m2c2c:purity
npm run test:render3d:m2c2c:browser
npm run test:render3d:m2c2c:soak
```

Fast 保留全部旧 CPU 门禁并加入当前 C2C CPU 套件；手动 [c2c-browser.yml](./.github/workflows/c2c-browser.yml) 独立运行当前阶段和 M2-B / C2B sample 两个关键祖先。`ci.yml` 的手动 Browser job 保留完整历史回归，Heavy / Nightly 的分层不变。浏览器验收与 Soak 串行执行，不以 CPU submission 或 RAF 间隔冒充 GPU timer 时间。

| 门禁 | 命令 / 环境 |
| --- | --- |
| Fast Gate（push / PR / 手动） | core、view、presentation、render3d、render3d:m1、render3d:bridge、render3d:m2a、m2b、m2c、m2c2a、m2c2b0、vendor、build |
| Heavy Gate（与 Fast 并行） | regression、three-realms、save-equivalence |
| Browser Smoke（仅 workflow_dispatch） | Windows Edge wrapper 顺序跑 Canvas 至 M2-C2B0；后续独立 steps 分别跑 C2B0 soak、C2B Pass 1 Browser 矩阵与 C2B Pass 1 soak |
| Nightly（schedule / 手动） | `test:simulation` + `inkbox:longrun`；没有 `test:longrun` 入口 |

命令与用途详见 [tests/README](./tests/README.md)。本地浏览器测试先起 4180；playtest 的 `--port` 是 CDP 端口，游戏地址用 `--url`。
普通 CI 不运行浏览器和 800 年长测，不删测试、不把断言改警告、不加 `|| true`。
M2-A 的本地证据在 `reports/release/render3d-m2a/`；CI 的 `inkbox-browser-smoke.mjs` 自管服务器与六套测试的生命周期，分别记录退出码；重跑写入独立目录并上传 Actions artifact，不覆盖硬件基线。C2A 代表性证据在 `reports/release/render3d-m2c2a/`，完整本地采样在 `reports/m2c2a/`；soak 单独执行，不与性能采样并发。
M2-C 最新 Edge 复验见 `reports/release/render3d-m2c/browser/`。旧 M2-A oracle 已补齐 M2-B 可见界缘及独立解码，原样本与退出门禁保留，不能通过隐藏界缘或跳过样本来消除偏差。
旧阶段固定断言数与文件数只保留在对应报告；save-equivalence 的断言数量会随内容变化，不能当稳定指标。

## 6. Git、发布包与本地文件

`npm run build` 生成 dist 目录及 ZIP；收录依据 `scripts/inkbox-package.mjs` 的 FILES / DIRECTORIES。
Git 的源码、素材和开发记录范围大于发布包，具体归属见 ARCHITECTURE。尤其注意：

- `剧情文案素材/` 是活跃文案资产，已入 Git 且随包；`美术素材/` 的设计输入见参考索引，产品只加载已接入的代码母版，整套参考包不进运行包。
- `scripts/_*.mjs` 是已入 Git 的历史一次性探针，保留参考，不在 npm / CI / build 门禁中。
- 历史 `reports/release/render3d-m2a/`、`render3d-m2c/` 的证据保留在开发目录，运行包仅收录打包白名单列出的摘要；`render3d-m2c2a/` 只长期保存代表图及摘要，不放重复大矩阵。C2C 的 `research/`、Golden、完整 PNG / JSON / 日志不进 runtime，文档只给开发路径；其他 reports 与 `*.log` 是本地 / Actions 输出。
- `.workbuddy-ai/`、`.local-backups/`、node_modules、dist 不入 Git。备份不能作为源码或发布依赖。

## 7. 开发纪律

不借 cleanup 改模拟、存档、概率或玩法。P2 问题记 BACKLOG，不顺手修。
新模拟随机流、身份与存档纪律以 THREE_REALMS 为准；观测层禁消费模拟 RNG。
测试造世界走真实工厂；聚焦成功不等于目标未被山体遮挡，浏览器断言须等状态就绪。
Windows 出现 `spawnSync EBUSY` 时按当次环境故障诊断并申请所需执行权限，不能宣称自动构建已通过或长期要求手工补 ZIP。
提交按可验证的变更拆分，源码与必要测试一起提交，文档可独立提交；不要把一轮所有资产 / 架构 / 测试压成一个提交。

C2B0 完整证据在忽略目录 `reports/m2c2b0/`；Git 只留 `reports/release/render3d-m2c2b0/summary/` 与 8 张代表 golden。GC/资源耐久与性能计时串行运行。运行包只包含精确白名单，源 `.blend` / `.blend1`、preview 与完整 release evidence 留在开发工作区。
