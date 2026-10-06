# ROADMAP · 坐天观井 Inkbox

2026-10-06 当前真相：**M2-C2C Meaningful Geography 本地验收完成，远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行。**完整 23 对 GPU、600/6000 帧 Soak、两关键祖先与干净克隆验证通过。C2B Pass 1 的 main `e0a851c` 及三个成功 Actions run 仍只属于历史远端基线，见 [STATUS](./STATUS.md)。

> 当前阶段和下一轮方向的唯一短表。接手看 HANDOFF，目录 / 模块看 ARCHITECTURE，未完事项看 BACKLOG，历史看 STATUS。
> 更新：2026-10-06。历史阶段完成情况与当前门禁证据以 STATUS 和阶段报告为准。

## 阶段表

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| M2-C2B Pass 1 | 四种建筑、角色 / 鬼魂 / 法宝、自然装饰、完整矩阵与耐久 | **远端封板完成**；第一代正式资产生产体系成立 |
| D6-2 / D6-3 | 三界最低生态 A–F / 跨界生态 A–E | 已完成 |
| D7 | 观察与表现层 A–G | 已封板 |
| D8 | 视界 2.0 A–F | 已完成；D8-G 追迹 UI 暂缓，逻辑地基保留 |
| M0 / M1 | 凡间立体沙盘 / 世界实体可见化 | 已完成 |
| M1.1D | 工程加固、dirty 分类、CI、vendor | 已完成 |
| M2-A | Host + 三个 Group Stage、共享坐标 / 状态、Mask / 矩形 Slab 原型 | 已完成并封板，checkpoint `render3d-m2a` → `f274def` |
| M2-A final cleanup | 文档与记忆一致性、工作区归属、vendor / 浏览器门禁 | 已完成 |
| M2-B | 完整视界与界缘：ElevationField / RegionGeometry / 完整 Layer Mask / RealmBoundary + Strata / 3D 划窗 / Rift Breach / FX | **已完成**，见 [工程报告](./Render3D%20M2-B%20工程报告.md) |
| M2-C | 写意地形 S1/S2、三个实例母版、视觉场景与性能证据 | 已接入；范围/局限见 [工程报告](./M2C_EXPRESSIVE_INK_REPORT.md) |
| M2-C2A | 三档实体 LOD、密度预算、身份/Region/纯度验证 | 工程封板；凡间 HLOD 仅原型，验收见 [报告](./M2C2A_LOD_REPORT.md) |
| M2-C2A.1 | 包瘦身、真实房屋 HLOD、密林产品帧测量 | 已通过，见 [封板报告](./M2C2A1_CLOSEOUT_REPORT.md) |
| M2-C2B0 | stage-local 三界视觉、全部随机流纯度与资源耐久 | 已完成并终验通过；见 [READINESS](./M2C2B0_READINESS.md) |
| M2-C2B | 第一代正式资产生产 | **已完成**，见 [Pass 1 就绪报告](./M2C2B_READINESS.md) |
| M2-C2C Meaningful Geography | 呈现已有 Site、Leyline、Upper qi、Nether yin 与 Rift 语义 | **本地完成**；23 对 GPU、600/6000 Soak、两关键祖先与干净克隆通过；远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行 |
| 后续候选 | 优先真实宗门 / 灵脉空间归属；R1 群体动画只留 Lab | 需后续授权；R2 不授权 runtime 道路，Gameplay G 未授权 |
| Gameplay G · 镇 / 泄 | 模拟派生封印量影响幽冥裂缝 | 未开始；**未授权** |

M2-A 成果与局限见 [工程报告](./Render3D%20M2-A%20架构原型工程报告.md)。Host / Stage 已交付，不能按旧 BACKLOG 或历史记忆重造。
main 是唯一活跃主线；旧 checkpoint 只用于定位历史。根目录运行 / 测试 / 打包，不另同步一个发布工作区。

## M2-B 历史交付记录

五包：**B0** 表现基础统一（ElevationField / RegionGeometry / 3D sculpt 派生量审计）·
**B1** 完整 Region Mask（窗外凡间不再变秃）· **B2** RealmBoundary + Raw/Strata ·
**B3** 正式 3D 划窗（复用 `commitSelection`）· **B4** Rift Breach / Plane inspect / FX 收口。

- 架构单源：**高程** = `ElevationField`（每个 PlaneStage 一份）·
  **区域** = `RegionGeometry`（只从 `RegionMask` 派生）· **输入** = `Sandbox.commitSelection`。
- 垂直表现两种模式：`raw`（工程基线）与 `strata`（上界 +datum / 幽冥 −datum + shoulder）。
  调试开关 `?boundary=strata`；正式 UI 不并列。
- 界缘零缝隙是**构造保证**：墙上端与目标地形顶点读同一个 `elevation.node()`，
  测试用 float32 逐顶点比对钉死。
- Rift 仍是 **World 的持久对象**；界缘只读取交叠结果做破口，**不持有** `world.rifts`。
- 自动化：`npm run test:render3d:m2b`（70 组，含 T0–T10 及关窗恢复 Raw 回归）·
  浏览器证据：`npm run test:render3d:m2b:browser` → `reports/release/render3d-m2b/`。

M2-B 交付了完整 Layer Mask、界缘、正式划窗、Rift breach 与检视反馈。该阶段当时未接入的三界生产资产和自然表现，后续分别在 C2B Pass 1 与当前 C2C 范围处理；M2-B 报告中的限制描述仅代表当时基线。

## 当前 M2-C2C 范围

按 `Inkbox_M2-C2B1_M2-C2C_Meaningful_Geography_工程开发委托书_v1.md`，本阶段只把已有 World 事实呈现为空间地景：凡界 Site / Leyline、上界 `qi`、幽冥 `veg` 与既有 Rift / presentation events。不得扩展 World 语义之外的上界文明、幽冥城市或浮空岛拓扑，也不得为视觉新增玩法或模拟字段。Gameplay G（封印量影响裂缝）仍未授权，若另行立项需审计随机流。

已实现六个独立表现开关 `sites` / `leylines` / `upperQi` / `netherYin` / `rifts` / `riftFx`，只读当前 World，Stage 持有派生缓存。自然 Formation 8/4 阵点分别贴地；四类真实 Site 的约 90px 正常生产几何与点击通过。11 模式各推进 600 日，World / advanceState / 49 save keys 与 11 RNG 一致，full SHA `4b37e9605591ef48e986833513a5f633da7ef28bc080f326dc884efe44abb498`。完整 23 对 GPU off/on 矩阵通过，四类真实 Site 在约 90px 正常视角的生产几何与 CDP 点击通过；600 生命周期实际 update / render 各 600 次，6000 产品 RAF 帧及两个关键祖先 Browser 通过。干净克隆 ccac961 独立 npm ci 与 16 项安装 / CPU / 旧资产 / build 命令通过。

当前交付入口：[就绪与门禁状态](./M2C2C_READINESS.md)、[工程报告与24项答复](./M2C2C_MEANINGFUL_GEOGRAPHY_REPORT.md)、[性能](./M2C2C_PERFORMANCE_REPORT.md)、[视觉验收](./M2C2C_VISUAL_ACCEPTANCE.md)。运行命令见 [测试索引](./tests/README.md)。Ignored 详细结果位于 `reports/local/m2c2c/`；不能把这些本地结果或旧 C2B Actions 当作 C2C 远端成功。

产品生产开启时用正式 GLB / 真实字段；`geography=off` 或 `assets=off` 保留旧基线，Site / Leyline / Rift 不能生产时诚实回退。七命令为 `test:render3d:m2c2c`、`:sites`、`:fields`、`:rifts`、`:purity`、`:browser`、`:soak`，完整写法见测试索引。手动 [c2c-browser.yml](./.github/workflows/c2c-browser.yml) 验当前阶段和 M2-B / C2B sample 两个关键祖先；[ci.yml](./.github/workflows/ci.yml) 保留完整历史 Browser 回归，普通 push 不启动 GPU。远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行，C2B e0a851c 的三个成功 run 仍只属于历史基线。

## 验收证据的范围

- M2-B 本地：自动化 69 组（`reports/release/render3d-m2b/m2b-results.json`）·
  真实 GPU 浏览器证据 17 张 + 拾取 / 性能 JSON（`m2b-browser-evidence.json`）·
  3D sculpt 审计原始输出（`sculpt-audit.log`）。
- 浏览器拾取（§75）：Upper **172** / Nether **237** / 界缘 **89** 采样，
  `visibleGeometryWins: true`。
- M2-A 本地：13 组架构测试、12 套发布门禁、Edge 160 点拾取、11 项生命周期 / UI 检查；原始记录在 reports/release/render3d-m2a。
- [M2-A CI 36651925371](https://github.com/sjh20016/inkbox/actions/runs/36651925371)：f274def 的 Fast / Heavy Gate 成功；该次 push 的 Browser Smoke 按设计 skipped。
- [Nightly 36636327689](https://github.com/sjh20016/inkbox/actions/runs/36636327689)：schedule 实跑成功，源码 b9f9f12；它不构成 f274def 的 Nightly 证明。
- cleanup 远端复验已通过：[手动 CI 36670107531](https://github.com/sjh20016/inkbox/actions/runs/36670107531) 的 Fast / Heavy / Browser 全绿，源码 727f36a；具体统计与 artifact 身份只在 STATUS 记录。本地硬件基线不会被 runner 软件光栅读数替换。
- M2-C2B Pass 1 的 main `e0a851c` 封板基线远端证据：Push [37224093479](https://github.com/sjh20016/inkbox/actions/runs/37224093479)、手动 Browser / C2B 矩阵与 soak [37224107941](https://github.com/sjh20016/inkbox/actions/runs/37224107941)、800 年 Nightly [37233858438](https://github.com/sjh20016/inkbox/actions/runs/37233858438)，均 success；只证明该 C2B 基线。

⚠️ **性能读数不可跨机器比较**：M2-A 基线是 Intel UHD 730，M2-B 证据采自
AMD Radeon 610M（真实硬件，非软件光栅）。驻留、可见、实际更新成本看各阶段工程报告。
