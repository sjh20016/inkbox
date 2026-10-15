# M2-C2E E0 源码调查

2026-10-08，基线与证据见 [开工基线](./M2C2E_BASELINE.md)。以下结论来自当前真实源码。

| 问题 | 当前责任模块与事实 | 本轮最小修改 |
| --- | --- | --- |
| 外部 seed | main.js newWorld、inkSeedInput 已接入；uint32 后 `|| random` 会吞掉 0；复制当前 seed 已有 | 复用入口，严格整数校验、保留 0、显示实际配置 |
| 随机流 | worldgen 四条 seed 派生 noise；leylines、scatter、Life、Upper/Nether 和模拟子流分开；Renderer 用表现 hash | 生成 v1 保留，v2 参数化且明确存档元数据，零 Renderer RNG |
| 尺寸 | World 构造时 w/h/size 与所有 TypedArray 固定；WorldSetSnapshot 校验三界尺寸/buffer身份 | 预生成完整大 World，开放进度单独可选块；不扩数组 |
| 编辑与派生 | Adapter stamp → sculpt 写 height → recomputeRect 更新 type/qi → markTerrainDirty → Stage；save 直接保存 height | 仍只有 sculpt 写高度，批量 canonical 更新、事务水域与Redo |
| 拖动次数 | pointerdown、每段 ceil(distance/max(.5,radius*.25))、每75ms RAF额外stamp；每stamp重算，GPU按帧合并 | 固定距离采样和批量flush，消除按帧多落笔 |
| 水岸几何 | WaterLayer 全图 quad，湿点 height+water、干点地面下0.08；无水域三角裁切，可能交叠 | World水深同源的三角裁切；水岸交界实际GPU证据 |
| 山体三角 | TerrainMesh 全图固定 a-c-b/b-c-d；VisualElevation 非线性放大高地梯度；flat normals，绘画材质不能改轮廓 | v2天然生成轻度平滑；共用自适应对角/插值；编辑不偷偷平滑 |
| 世界外壁 | 当前只有 SlabPrototype 探针及 RealmBoundaryLayer 视界墙，没有正式外围侧壁 | 新正式分段外壁，读同一ElevationField，与开放遮蔽边区分 |
| 贴地缓存 | Stage heightChanged 更新实体、房屋/HLOD、marker、Site/Leyline、装饰、artifact、selection；树150ms节流暂时旧高度 | 编辑高度及时刷新树；真实GPU拾取及建筑同源检查 |
| Mask/Boundary | RegionGeometry是XY视界，与高度无关；Boundary节点同ElevationField，dirty后Host重建 | 保持零缝契约，检查同帧更新与水墙低角交叠 |
| 大图成本 | Bridge每帧四数组全图diff；网格/纹理O(N)；Region边缘/距离数组O(N)；heightChanged全实体重贴 | 限定支持规模，测完整模拟成本；不做无限地图或ChunkStreaming |

E1 所有权在 render3d terrain/water/Stage/Host 的几何路径；E2 在 worldgen/生成配置及可选存档；E3 在 sculpt/Adapter 的唯一编辑事务；E4 访问状态与三界 RegionMask 分开，以两个谓词相交，拾取、相机和编辑用同一访问边界。

旧存档由 save.js 解码真实数组，不按 seed 重生。新增可选块缺失时采用旧档全图开放和 v1；新字段须同步存档等价登记。PresentationStage 仍是 runtime event 唯一消费入口，三界概率、人口账和模拟时钟不改。