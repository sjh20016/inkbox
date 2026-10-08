# M2-C2E 几何报告

山体棱面问题来自固定三角对角线、高程放大和生成高频峰，并非只由材质决定。v1仍保留历史对角；v2以真实World高度选对角。TerrainMesh与VisualElevation的插值共用topology，ElevationField不另建高度缓存。dirty点更新覆盖相邻quad，实际射线与插值误差受CPU门禁约束。

正式realm-style水面按World.water > .0015的湿域裁切，每个原三角线性求岸点。水顶仍读height+water和同高程变换；同一层包含仅世界外围的湿边垂幕，接回真实地形。原legacy/raw对照继续保留，热切换追补最新World。

新增TerrainSideLayer只生成完整世界最外周的分段不透明侧壁；它不是Slab探针，也不在访问开放边缘生成虚构墙。上沿读Stage.ElevationField，底部只作纸下封口。真实世界侧壁参与普通Picker深度竞争，返回world-edge，拒绝雕刻；onlyPlane仍取地形供世界坐标划窗。

真实界缘保留RegionGeometry节点，height/profile变化在同帧重建。setElevationProfile最后refreshGroundLayers，树、实体、房屋/HLOD、marker、地貌、法宝和选中圈即时贴地；它不重扫Bridge或推进模拟。

CPU十三组覆盖两种对角、逐点射线、湿域变化、外周水帘、Region/热切换、外围墙、同帧树、墙遮挡优先以及profile立即贴地。新增四组覆盖无拓扑变化不重传索引、裁切湿干/拓扑变化、legacy回切与缓存输出；240组动态v1/v2和自定义坐标与原裁切输出逐位一致。旧M2-B70组保留。GPU首轮六个关键镜头已通过；完整终态十二镜与人工程序性检查见 [视觉验收](./M2C2E_VISUAL_ACCEPTANCE.md)。

风险：水域活动索引提交仍O(N)；局部位置更新不等于无限地图优化。玩家可保留极尖/陡的高度命令；本轮不做物理崩塌、搬迁或复杂海岸侵蚀。

WaterLayer缓存所有权/失效/释放见实现报告。性能优化仅重用节点/scratch和条件索引提交，不修改几何公式；Triangle输出顺序和Float32内容有直接参考对照。
