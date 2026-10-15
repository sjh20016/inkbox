# M2-C2A.1 开工真实性基线

2026-10-04。施工工作区 `D:\worldxxxxx\坐天观井inkbox`，开工 main HEAD `7164850ba28dccdecbb1d3db0e4aeaa0637db82c`。本文件是只读审计记录；完成本次基线提交前不修改生产代码。

用户已有美术参考目录移动、委托书和视觉规划资料、两个 Blender backup 文件。它们保持原状；开工 diff、未跟踪文件清单、status、HEAD 已记录到 `.local-backups/m2c2a1-start-20261004/`，原 Git HEAD 可恢复全部已追踪生产源码。

## 发布包与资产（当前文件实测）

| 对象 | 文件数 | bytes |
|---|---:|---:|
| 玩家目录 dist/zuotian-guan-jing-inkbox-1.0.0 | 458 | 105000189 |
| 玩家 ZIP | 1 | 89745002 |
| cultivator runtime: mesh + data + materials | 8 | 162850 |
| cultivator source（含本地 .blend1） | 5 | 9368615 |
| cultivator preview | 14 | 9250868 |
| cultivator docs | 4 | 15519 |
| Git 已追踪 M2-A release 证据 | 19 | 8939603 |
| Git 已追踪 M2-C release 证据 | 177 | 60748973 |
| Git 已追踪 C2A release 证据 | 16 | 9695206 |

三期长期追踪证据共 79382685 bytes。dist 总目录 539817867 bytes 包含五个旧 staging，不能当作玩家包体积。仓库没有 runtime/ 子目录；运行资产就在 mesh/data/materials，不为命名重排路径。

## 当前架构与视觉语义

已阅读并核对委托书指定 README / HANDOFF / ROADMAP / ARCHITECTURE / THREE_REALMS / VIEW_CONTRACT / ENTITY_PRESENTATION_CONTRACT / ARTPASS_PROFILE / C2A 四份基线报告 / M2-C 工程报告。视觉圣经实际路径为 `美术素材/三界视觉风格规划_美术方向文档_v1.md`，不会改其方向来迎合实现。

| Stage | 当前 Layer |
|---|---|
| mortal | terrain、water、vegetation、entities、settlements、markers、selection、只读 FX probe |
| nether | terrain、真实 entities、readonly selection、只读 FX probe |
| upper | terrain、真实 entities、readonly selection、只读 FX probe |

目标界没有可靠的 vegetation / water / settlement 语义，本轮不补虚构可交互内容。单一 Host / Scene / Camera / ArtPass；高程来自已有 ElevationField，所有 Layer 共用本 Stage 的 RegionGeometry；凡界 outside、目标界 inside。渲染不写 World、不消费模拟 RNG、不加 save 字段。当前远景 HLOD 是一个 8-triangle roof mass，整村单中心高程，拾取返回真实 settlementId；真实 overview 的聚落尚未触发 HLOD。

## 实测状态

浏览器首轮未取得样本：沙箱内 CDP `Page.enable` 超时，失败证据在 `reports/m2c2a/a0-baseline/browser/browser-matrix.json`。隔离临时浏览器在授权的沙箱外执行后恢复；不会修改用户个人浏览器配置。当前测量为 Windows / Edge 154 / ANGLE AMD Radeon 610M D3D11，viewport 1500×940、playfield 1086×797、DPR 1，120 样本。无 GPU timer，CPU submit 和 rAF 不能称为 GPU 耗时。

| 当前真实 overview | no-LOD triangles | pilot-LOD triangles / draws | LOD rAF median / p95 ms | CPU submit median / p95 ms | HLOD 村数 |
|---|---:|---:|---:|---:|---:|
| GOLDEN_A（seed20260930/day1440） | 386420 | 179874 / 12 | 11.2 / 16.8 | 0.1 / 0.2 | 0 |
| DENSITY_A（seed20260928/day1800） | 691490 | 282411 / 12 | 16.7 / 22.3 | 0.1 / 0.3 | 0 |

源证据 `reports/m2c2a/a0-baseline/browser-audit/audit.json`。完整 world + advanceState 的开关指纹分别为 GOLDEN_A `0f9efd918df2e4f26bcf678cffe2ca1593381c9abee209de9e2e8cc747d755f1`、DENSITY_A `62e4c87937af73ca8d68f5b0d420450c0d64544b0a5068d76edb8fab1e778b74`；GL / runtime error 0。当前总面数、LOD分布和历史报告一致；帧间隔不同是新的短采样结果，不替换历史记录。

当前 CLI C2A 8 组通过。600 日六模式的完整 World digest 均为 `935cfa00a5e67da9bea5b53a7d88efe0521d9d33739721c79547f8878072d486`，RNG 182879（life169051 / upperSpatial12827 / upper1001）。这是独立小型模拟 fixture，与两份大世界浏览器 digest 的范围不同。证据 `reports/m2c2a/a0-baseline/core/core-results.json`。

A3 尚无独立 chooseLOD / crowded partition / upload 探针；现有 CPU update 或 lodUpdateMs 不能冒充 chooseLOD 耗时。先记录此字段缺口，A3 在本基线通过后增加定向探针。

真实 DENSITY_A Forest Stress：5807 棵树，16×16 最密区域 140 棵（POI199.5,39.5）；LOD 1024/4783/0，demotions1685、overflow0，树201495 tris，整帧414037 tris/13 draws。静止压力视角 CPU update median/p95 0.50/0.90ms、rAF11.2/22.3ms、CPU submit0.10/0.30ms；它不是连续移动 chooseLOD 的耗时，移动分项留到 A3。

zoom0.5 的凡界远景：真实7村/133屋，HLOD7实例、每村8 tris、合计56 tris；建筑层含中心建筑112 tris/14实例。完整世界 digest 未变，errors0。源证据 `reports/m2c2a/a0-baseline/forest-probe.json`。基线已有当前实测数据，A0通过；生产代码仍与开工HEAD一致。
