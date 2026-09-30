# ROADMAP · 坐天观井 Inkbox

> 当前阶段和下一轮方向的唯一短表。接手看 HANDOFF，目录 / 模块看 ARCHITECTURE，未完事项看 BACKLOG，历史看 STATUS。
> 更新：2026-09-30，M2-A final cleanup。阶段完成不等于下一阶段已获施工授权。

## 阶段表

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| D6-2 / D6-3 | 三界最低生态 A–F / 跨界生态 A–E | 已完成 |
| D7 | 观察与表现层 A–G | 已封板 |
| D8 | 视界 2.0 A–F | 已完成；D8-G 追迹 UI 暂缓，逻辑地基保留 |
| M0 / M1 | 凡间立体沙盘 / 世界实体可见化 | 已完成 |
| M1.1D | 工程加固、dirty 分类、CI、vendor | 已完成 |
| M2-A | Host + 三个 Group Stage、共享坐标 / 状态、Mask / 矩形 Slab 原型 | 已完成并封板，checkpoint `render3d-m2a` → `f274def` |
| M2-A final cleanup | 文档与记忆一致性、工作区归属、vendor / 浏览器门禁 | 本轮收口；不扩 3D 功能 |
| M2-B | 正式三界视界边界与完整 Layer 支持 | 未开始，待设计范围确定 |
| Art Pass | 有视觉身份的三界表现与素材接线 | 未开始；在空间 / Layer 机制稳定后另开包 |

M2-A 成果与局限见 [工程报告](./Render3D%20M2-A%20架构原型工程报告.md)。Host / Stage 已交付，不能按旧 BACKLOG 或历史记忆重造。
main 是唯一活跃主线；旧 checkpoint 只用于定位历史。根目录运行 / 测试 / 打包，不另同步一个发布工作区。

## M2-A final cleanup 的边界

统一 BACKLOG / HANDOFF / STATUS；将 VIEW_CONTRACT 升为世界空间 v2；补齐文档责任与仓库 / dist 地图。
Fast Gate 加 test:vendor；手动 Windows Browser Smoke 顺序跑 Canvas 与 M2-A 两套测试，保存独立 artifact。
删除失效的重复交接内容，压缩归档旧本地记忆与诊断产物，保留源码、素材、正式截图 / JSON 和已发布历史。
给 f274def 建立 render3d-m2a checkpoint。本轮不优化 FX snapshot、首次上传、不扩 Slab，不做 M2-B 或 D8-G UI。

## M2-B 设计倾向（尚未施工）

优先评估 **World-space Mask + grid boundary skirt + 完整 Layer Mask**：

1. 保持现有世界 Region 和互补地形 Mask；扫描 inside / outside 格网边界，评估高差侧壁。
2. 按 Water → Vegetation → Settlement → Marker → Selection / inspect feedback → Three FX 分包验证。
3. 完整空间和 Layer 路径稳定后，再立项三界 Art Pass，逐步消费现有素材。

这是一份设计顺序，不是已经实现的功能。M2-B 委托书须明确视觉判据、实体轮廓边界、拾取、冷 / 重复开窗与各 Layer 成本。
Slab 保留每边 ≤20 格的矩形研究探针，不扩任意 polygon；RenderTarget 暂缓，扩展口保留。
不新增生态、概率、存档字段或第三方框架。Frozen FX snapshot 的复制成本列为 P2，等实际 FX 负载需要时再处理。

## 验收证据的范围

- M2-A 本地：13 组架构测试、12 套发布门禁、Edge 160 点拾取、11 项生命周期 / UI 检查；原始记录在 reports/release/render3d-m2a。
- [M2-A CI 36651925371](https://github.com/sjh20016/inkbox/actions/runs/36651925371)：f274def 的 Fast / Heavy Gate 成功；该次 push 的 Browser Smoke 按设计 skipped。
- [Nightly 36636327689](https://github.com/sjh20016/inkbox/actions/runs/36636327689)：schedule 实跑成功，源码 b9f9f12；它不构成 f274def 的 Nightly 证明。
- cleanup 的远端浏览器复验须看 workflow_dispatch 的实际结果 / artifact；本地硬件基线不会被 runner 读数替换。

当前性能基线来自 Intel UHD 730 / ANGLE D3D11；M1.1D 的软件光栅读数属于旧阶段。驻留、可见、实际更新成本分别看工程报告。
