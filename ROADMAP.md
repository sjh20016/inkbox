# ROADMAP · 坐天观井 Inkbox

> 当前阶段和下一轮方向的唯一短表。接手看 HANDOFF，目录 / 模块看 ARCHITECTURE，未完事项看 BACKLOG，历史看 STATUS。
> 更新：2026-10-04，C2A.1 / C2B0 三界视觉基线。阶段完成不等于下一阶段已获施工授权。

## 阶段表

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
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
| M2-C2B | 第一套正式资产家族受控试产 | 未生产；就绪条件见 [READINESS](./M2C2B0_READINESS.md) |
| M2-C2 后续 | 群体动画、完整 HLOD、Trace Field、三界视觉深化 | 未实施 |
| Gameplay G · 镇 / 泄 | 模拟派生封印量影响幽冥裂缝 | 未开始；**未授权** |

M2-A 成果与局限见 [工程报告](./Render3D%20M2-A%20架构原型工程报告.md)。Host / Stage 已交付，不能按旧 BACKLOG 或历史记忆重造。
main 是唯一活跃主线；旧 checkpoint 只用于定位历史。根目录运行 / 测试 / 打包，不另同步一个发布工作区。

## M2-B 交付与边界

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

**M2-B 未做的**：目标位面只补了 terrain + entities + 只读选择反馈——上界 / 幽冥的
`veg` / `water` / `artifacts` 因为**没有可靠语义而刻意留空**（委托书 §27）。
Strata 抬起的窗口会遮挡身后凡间，缓解方向随 Art Pass 一起定。

## 下一轮候选（均未授权）

M2-C2B 与 Gameplay G（模拟派生封印量 → 裂缝阈值调制）需要确定新一轮施工范围。
用户已允许实验建筑素材调整、参考配色包；这不自动授权新增世界玩法。Gameplay G 若立项，必须重新审计随机流——
上界裂缝存在条件式第二次 RNG 消费，**不得假设「只调概率阈值就一定不改变 RNG 流位置」**。

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

⚠️ **性能读数不可跨机器比较**：M2-A 基线是 Intel UHD 730，M2-B 证据采自
AMD Radeon 610M（真实硬件，非软件光栅）。驻留、可见、实际更新成本看各阶段工程报告。
