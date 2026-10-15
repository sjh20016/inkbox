# M2-C2E 工程实现

2026-10-08。委托书 v1.0；独立分支 `codex/m2-c2e-living-terrain`，开工 SHA `3a98fb29a6b3bddf6242e3d25e2d5cbbc41e8f29`。不合并 main。用户已有的历史文档迁移未纳入本轮提交。

E0 先记录真实源码、存档与十二镜同机 GPU 基线；E1 独立实现并验证后，才接入 E2–E4。调查与原始证据位置见 [调查](./M2C2E_INVESTIGATION.md)、[基线](./M2C2E_BASELINE.md)。

| 阶段 | 实际交付 | 责任文件 |
| --- | --- | --- |
| E1 | 共享自适应三角、水域裁切、真实外围墙与遮挡拾取、同帧贴地 | topology / TerrainMesh / WaterLayer / TerrainSideLayer / ElevationField 路径 / PlaneStage / PlanePicker |
| E2 | 严格 seed（含 0）、标准/群山/水泽、v1兼容、v2生成平滑、512×320 | worldGeneration / worldgen / worldCreation / save / config |
| E3 | 固定距离笔划、一次事务Undo/Redo、水/riverBase闭环、山脊/盆地 | sculpt / Render3DAdapter / main.update |
| E4 | 预生成大世界40/60/80/100%开放、独立访问策略、三界裁剪/相机/输入/存档 | mapProgress / mapAccess / AccessGeometry / Host / Stage / Camera / Canvas |
| E5 | 新CPU44组、108种子矩阵、真实产品GPU、同机对照与耐久入口 | 六个新阶段脚本与创建脚本；已有门禁保留 |

World仍是唯一数据真相；正式写地形只走sculpt与canonical recomputeRect。ElevationField继续统一地形、贴地、拾取与界缘。RegionGeometry仍只派生于真实RealmMask；访问进度的组合对象只用于提交可见内容，不成为第二套视界。WorldRenderBridge保持dirty通道，PresentationStage保持唯一事件消费入口。

3D一笔编辑期间先flush canonical，再暂缓游戏日/水文/decay，不累积补跑，不改变玩家倍速；相机与Presentation继续用真实时间。松手恢复原倍速。生成平滑仅在v2开天执行；加载与玩家雕刻不会偷偷平滑。

新增字段只有可选顶层 `generation` 与 `mapProgress`，不藏入meta。旧档缺字段采用v1/全图开放，解码其真实数组，不按seed重造。旧模拟RNG游标未持久化和Uint16地形量化的既有边界如实保留。

交付/性能状态见 [READINESS](./M2C2E_READINESS.md)、[性能](./M2C2E_PERFORMANCE_REPORT.md)。核心高风险路径经独立只读审查，并用真实运行fixture补齐外壁拾取、同帧贴地与笔划模拟隔离回归。

水面/地形的末期局部优化保留所有派发契约，Water P95由约49ms降至8ms。新缓存由WaterLayer创建和独占持有；初建/world切换/profile变更全量初始化，局部World dirty重采样相邻节点/quad，Region/style变更更新活动索引，legacy回切同步隐藏缓存，Layer.dispose与Host换世界释放；额外约32字节/格（512×320约5MiB/层）。新增缓存13项CPU门禁、240组参考比较及独立审查通过。

发布包继续排除所有release截图/完整本地报告，八张新Golden留在开发Git；运行包携带本阶段精简JSON、源码、测试入口与交付报告。打包读取历史委托书/历史工程汇报中的缺失根目录文档，保持包内历史路径，不移动用户文件。审核新增C2E摘要白名单与256KiB/JSON校验，原禁图与旧断言保留。
