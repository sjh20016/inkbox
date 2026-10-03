# M2-C · 写意渲染基线与可扩展实体试装

2026-10-03，基于 M2-B 运行代码与 Three 0.186.1。范围是一套地形颜料/结构墨材质，加一人、一房、一树的实例母版；世界、三界规则、存档、生成算法、输入语义和 Stage 生命周期保持原契约。

## 工程真相与复用

委托书和 Sonnet 包提到的 ArtPass、RegionMask3D、RimField、SkirtLayer 并未存在于当前运行源码。Sonnet 补丁面向 M2-A，不能直接覆盖 M2-B。当前高程来自 `ElevationField`，区域判定来自 `RegionGeometry`，界缘来自 `RealmBoundaryLayer`，复用这些权威实现。

新 `art/ArtPass.js` 只在同一个 Host 内编排材质参数；不新建 Renderer、Scene、Camera、Stage、事件消费者或模拟时钟。WorldRenderBridge 继续提供原有 dirty 与表现快照。TerrainMesh 保留旧 Lambert `material` 给历史 Slab 探针，实际着色通过 `mesh.material` 切换。

## 十个交付问题

1. **改变了什么？** 地形从逐格填色变为纸底上的稀疏颜料吸收；类型 ID 以 nearest 分类取样，世界空间 warp 打散规则分界。高度邻域导出坡度与有符号曲率，分离山脊、沟谷、坡折和观察方向轮廓。房、树、修士使用同一有限色板和纸墨材质。
2. **复用了哪些旧能力？** 复用 M2-B 高程、区域网格/拾取、三界坐标、界缘、只读桥接、已有实例批次和 Presentation 路径。Sonnet 包只作为纸色、少色、飞白和开关对照的设计参考；没有安装旧重复底座。
3. **哪些实验撤下，为什么？** 未采用旧包的重复高程/遮罩/裙边；不接全屏 LUT、每界 Fog、透明笔刷 PNG。实体早期飞白太碎，改为三维低频稀疏笔痕并降低强度。一次真实 Edge 编译发现 GLSL 保留字 `patch`，已改名；Node 合约通过不能代替 GPU 编译。
4. **为什么更接近写意？** 留白是颜料覆盖率的结果，结构墨来自世界高度而非统一黑描边；大片面没有结构墨。投影尺寸降低远景颜料、飞白和轮廓的信息。纸粒很弱且在屏幕空间，墨和色块固定于世界空间。
5. **房、树、人是否属于同一画面？** 共用纸白、墨、木、土、灰蓝等九色顶点色字典；民居为白墙墨顶，树为树干与三个实心树冠，308 三角修士含发髻、道袍、宽袖、腰带和鞋。最终图像与可见性证据见 VISUAL_ACCEPTANCE；仅有真实 POI 不算绘制成功。
6. **没有后处理是否成立？** 产品路径没有 RenderTarget 合成依赖。baseline / pigment / ink / pilot 全部直接输出；S3 仅有一次性技术探针，本轮不交付 depth outline 或空气透视后处理。
7. **GPU / CPU 成本增加多少？** 使用同一机器、世界、相机的真实 Edge 采样；CPU-visible 提交与 rAF 间隔见 PERFORMANCE_REPORT。没有 GPU timer-query，不能把提交时间称为 GPU 时间。几何成本可精确计数：修士 308 tris、树 80 tris、房屋 80 tris；同类批次数不随实体数量增加。
8. **最大性能风险？** 远景只减少着色信息，仍提交同样的实体几何；三界并见与稠密树木会提高三角数和像素成本。当前实例容量是有界固定批次，并未实现几何 LOD/HLOD；不能据本轮少量母版承诺任意规模。
9. **留到下一阶段？** 动画、实体家族、几何 LOD/HLOD、批次扩容、永久痕迹 Field、实验 GLB 转实例母版和正式 S3。没有制作道路、农业、秘境或 Gameplay G。
10. **是否建议大规模资产生产？** 建议按 ENTITY_PRESENTATION_CONTRACT 先生产小批家族并建立密度/LOD 验证，再扩展数量。当前证明母版与材质路线，不等于完成全规模性能验证。用户的配色规则和实验建筑可自由调整，作为下一阶段生产输入。

## 验证与复现

S0 原有 13 个命令的当前基线见 BASELINE_TEST_COUNTS。M2-C 新增参数边界、纹理布局/dirty、类别取样、同一 mask/elevation、批处理、资源切换/释放、模拟纯度检查。原断言没有放宽。

收口14项命令行门禁（含自动 build）全部通过；600日完整World指纹在无3D、Art关闭、反复调参/开关三种路径一致。独立资源审查覆盖25项基础/美术资源：五轮开关没有提前释放，换世界各释放一次，重复dispose没有重复释放。一次机器内存分配失败在清理隔离测试浏览器后重跑通过；同时修正CDP会话关闭，避免仅结束Edge launcher而遗留测试子进程。

原 Canvas 浏览器回归 144 项通过；M2-A 两界各 80 个拾取样本零偏差，原采样、分类数量、四姿态与退出断言保留；M2-B 拾取上界 173、幽冥 238、界缘 94，门禁通过。旧 M2-A 的独立 oracle 曾漏掉 M2-B 的可见界缘，造成六个假偏差：关闭 Art 和运行 `git archive c159629` 的原源码均复现相同结果。只补齐 oracle 的几何集合及独立边缘解码，并额外严格比对类别、目标界、四端点、距离和交点，没有修改生产 Picker、遮挡规则或跳过样本。原失败、复现和最终结果见 `reports/release/render3d-m2c/browser/`。

`npm run test:render3d:m2c` 运行新合约；`npm run test:render3d:m2c:browser` 用 Microsoft Edge 采集八视图 × 四档材质。截图、单图 manifest、源码 SHA256、完整快照 digest、性能/RenderTarget 证据归档在 `reports/release/render3d-m2c/`。

提交前核对43个 Render3D 文件仍与捕获字节完全一致，32张图的 manifest 与三组完整快照一致，自包含包内40处 npm 脚本引用均可解析。`source-provenance.json` 保存 PNG 哈希及源码原始/规范LF哈希，便于在不同Git换行策略下核对；截图的commit字段保留当时基底，不伪改为后来的提交。

最终Edge采集32张图，浏览器错误0；三界拾取、Resize、360°旋转、缩放与RT/MSAA/depth探针通过。独立6000帧约100秒检查资源、profile和完整World指纹稳定，实际GPU nearest分类与height/type局部上传回读通过。small overview：draw calls保持11，triangles118676→384656；CPU提交均值0.538→0.275ms，计时短且有噪声，不构成GPU提速结论；pilot rAF p95为33.3ms。S3保持关闭。

同一视图的 baseline/pigment/ink/pilot 使用同一个世界快照和镜头。早期 day10/day60 场景没有足够修士/房屋，最终配对证据改用正常每日推进得到的 day1440/day1800；开发场景固定完整随机流，不修改模拟源码或插入实体。

正式默认 `inkbox.html?renderer=3d` 为 pilot；`&art=baseline` 可退回旧材质，`&art=low` 减弱飞白和纸粒。只有 `&artdebug=1` 显示开发参数与导出面板。详情见 ARTPASS_PROFILE、VISUAL_SCENARIO_SPEC、VISUAL_ACCEPTANCE 和 PERFORMANCE_REPORT。

## 交付资产

运行素材为源码生成的极简共享几何/顶点色，无新增运行依赖或单体纹理。用户的 `配色参考/`、`实验建筑资产/`、Sonnet 包与早期素材整理作为开发输入保存；未把约451MB第三方范式包纳入运行或代码交付。用途与授权见 `美术素材/参考资产索引.md`。
