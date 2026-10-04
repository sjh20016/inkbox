# 《坐天观井 Inkbox · M2-C2A.1 收尾 + M2-C2B0 三界视觉基线封板》
## 下一阶段工程开发委托书 v1

**阶段代号**：M2-C2A.1 + M2-C2B0  
**阶段主题**：Three Realms Visual Foundation / 三界视觉基础封板  
**推荐主力模型**：GPT-6.1 Sol  
**任务性质**：工程收尾 + 表现层架构 + 三界视觉样板 + 性能/纯度回归  
**施工原则**：先收尾、再立规、后做样板；本轮结束前不进入大规模正式资产家族生产。

---

# 0. 本轮一句话目标

在 M2-C2A 已经建立 LOD/HLOD 与密度预算的基础上，先完成发布包、证据、HLOD 表现和 LOD 热路径的 C2A.1 收尾，然后正式建立“凡界 / 幽冥 / 上界”三套可执行、可复用、可测试的视觉表现 Profile，并用真实游戏世界做三界样板验证。

本轮结束时，应当达到：

> **同一个 Inkbox 技术骨架之上，凡界一眼有人间烟火，幽冥一眼苍劲阴郁，上界一眼具有敦煌矿物色与云端神圣秩序；三者不是换滤镜，而是三套稳定的视觉语法。**

本轮结束后，才允许进入 `M2-C2B · 第一套正式资产家族受控试产`。

---

# 1. 本轮上位约束

## 1.1 必读文件

开工前必须读取并以当前源码核对：

- `README.md`
- `HANDOFF.md`
- `ROADMAP.md`
- `ARCHITECTURE.md`
- `THREE_REALMS.md`
- `VIEW_CONTRACT.md`
- `ENTITY_PRESENTATION_CONTRACT.md`
- `ARTPASS_PROFILE.md`
- `M2C2A_BASELINE.md`
- `M2C2A_LOD_REPORT.md`
- `M2C2A_PERFORMANCE_REPORT.md`
- `M2C2A_VISUAL_ACCEPTANCE.md`
- `M2C_EXPRESSIVE_INK_REPORT.md`
- `三界视觉风格圣经_美术方向文档_v1.md`（若已放入 `美术素材/`，以仓库实际路径为准）

其中：

- **模拟事实**以 World / THREE_REALMS / 当前源码为最高真相；
- **视界规则**以 VIEW_CONTRACT 为最高真相；
- **美术方向**以《三界视觉风格圣经 v1》为最高视觉约束；
- 参考图只允许提取高层视觉规律，不得复制原图构图、角色、纹样、签名、水印或具体作品元素。

若视觉圣经与当前模拟语义冲突，不得为了画面擅改模拟；必须保留视觉方向，记录冲突，采用 presentation-only 方案或把语义扩展留到后续授权。

---

# 2. 当前阶段事实与本轮边界

当前项目已经具备：

- M2-B 三界 Stage、RegionGeometry、ElevationField、界缘与视界；
- M2-C 纸墨地形、PigmentTerrainMaterial、ArtPass 与 Pilot 资产；
- M2-C2A Tree / Character / Building 三档 LOD；
- screen-space LOD、迟滞、密度预算；
- 凡界小聚落 HLOD 原型；
- 身份保持拾取；
- 三界 Region / 模拟纯度 / 生命周期验证。

当前新的主要问题已经从“能不能画”转为：

1. 凡界整体偏苍白，缺少传统中式色彩层次与人间烟火感；
2. 幽冥和凡界仍共享过多同质灰度语言，阴郁、苍劲、强对比不足；
3. 上界尚未形成稳定的敦煌矿物色、云端高山与神圣秩序语言；
4. 当前凡界远景聚落 HLOD 过于接近纯黑大块；
5. Git / dist 中源资产、预览、证据开始膨胀，需要在正式扩产前收紧生产纪律；
6. 密林相机移动时的 LOD 分配 CPU 成本需要一次定向测量，但不得因此提前重构。

---

# 3. 本轮明确不做

本轮不得主动扩张为：

- Gameplay G 或任何裂隙数值调整；
- 三界经济、政治、宗门、AI 行为新系统；
- 世界生成规则重构；
- 正式大规模角色 / 建筑 / 仙兽 / 怪物家族生产；
- 完整城市 HLOD；
- 群体动画系统；
- 骨骼动画大规模接入；
- 第四世界；
- Three.js 大版本升级；
- 全屏统一 LUT / 后处理滤镜作为三界区分的主要手段；
- 为了做浮空岛而伪造新的可行走世界地形；
- 将参考图中的作品、人物、构图、纹饰直接复制进游戏。

如果施工过程中发现上述方向值得做，只记录到 BACKLOG / 下一阶段候选，不顺手扩权。

---

# 4. 阶段总结构

本轮分成两部分：

## Part A · M2-C2A.1 收尾包

目标：把 C2A 从“功能完成”整理为“适合长期扩产的生产底座”。

包含：

- A0 真实性基线与备份；
- A1 发布包与证据减肥；
- A2 聚落 HLOD 视觉修补；
- A3 Dense Forest LOD CPU 定向探针；
- A4 C2A.1 回归与封板。

## Part B · M2-C2B0 三界视觉基线

目标：建立三界 RealmStyleProfile，并做三套真实世界 style proof。

包含：

- B0 三界视觉 Profile 架构；
- B1 凡界“烟火淡彩”样板；
- B2 幽冥“焦墨阴郁”样板；
- B3 上界“敦煌矿物色 / 云端神圣”样板；
- B4 跨界同屏组合；
- B5 浏览器视觉矩阵与性能；
- B6 模拟纯度 / 生命周期；
- B7 文档与阶段收口。

必须按顺序施工。任何步骤未通过自己的停止条件，不进入下一步。

---

# 5. A0 · 开工真实性审计

正式修改前完成一次只读审计，并生成：

`M2C2A1_BASELINE.md`

至少记录：

- 当前 `main` HEAD；
- 当前玩家/开发发布包文件数与体积；
- `assets/characters/cultivator` 中 runtime / source / preview / docs 各自体积；
- Git 当前被长期追踪的 M2-A / M2-C / M2-C2A 证据体积；
- GOLDEN_A / DENSITY_A 当前 pilot-lod triangles / draws；
- Forest Stress 当前 CPU update、rAF、LOD 分配统计；
- 当前凡界 HLOD triangles / 聚落数；
- 三界现有可见 Layer 清单；
- 当前 World digest / RNG 纯度基线。

这一提交不得修改生产代码。

**停止条件**：任何旧报告数字与当前源码不一致时，先修正文档或重新测量，不得沿用历史数字继续施工。

---

# 6. A1 · 发布包与证据减肥

## 6.1 目标

不重写 Git 历史、不删除可编辑源资产，但停止“每新增一个资产家族，dist 和 Git 证据成倍膨胀”的趋势。

## 6.2 发布包规则

当前 `npm run build` 不应递归打包整个角色开发目录。

必须将“玩家运行必需内容”和“开发源资料”分开处理：

### 玩家 / 可运行包应包含

- 实际运行需要的 GLB / runtime manifest / palette；
- 运行源码；
- 必须的 vendor；
- README / HANDOFF / 核心契约和阶段报告；
- 当前构建、测试所需的最小脚本集合。

### 玩家 / 可运行包默认不应包含

- `.blend` 源文件；
- 大量 turnaround / scale / stress 预览 PNG；
- Blender 生产中间文件；
- 全量浏览器截图矩阵；
- 完整 local / CI artifact；
- 重复的历史 release 图像集。

可保留 Markdown 报告和 compact summary JSON，但不要为“接手可读”而把几十 MB 截图一起出货。

## 6.3 实现策略

优先修改 `scripts/inkbox-package.mjs` 的精确清单，不要为了打包方便搬动所有运行路径。

如果确实需要目录重组，可建立：

- `runtime/`
- `source/`
- `preview/`
- `docs/`

但不得在没有必要的情况下制造大规模路径 churn。

## 6.4 新增 package audit

增加一个轻量检查，至少保证：

- dist 中不存在 `.blend`；
- dist 中不存在 `preview/` 全量图；
- dist 中不存在本地 reports / logs；
- 必需 GLB 可以加载；
- build 后所有文档引用不悬空；
- build 可从 clean clone 自动完成。

记录 before / after 体积，不设拍脑袋绝对 MB 目标，但要求出现实质下降。

**停止条件**：如果减肥导致运行资产缺失、测试无法从 dist 执行或文档悬空，先修复再继续。

---

# 7. A2 · 聚落 HLOD 视觉修补

## 7.1 当前问题

当前 8-triangle 单质量 HLOD 在远景容易读成巨大纯黑方块，不像“远处村落”，而像“地图标记”。

## 7.2 目标

保留极低成本，但让远景聚落形成：

> **2～4 个屋顶墨块 + 留白 + 大小节奏**

而不是一个整块黑体。

## 7.3 实现要求

- 仍从真实 settlement / houses 派生；
- 不改变真实房屋数量、位置和 World；
- HLOD 仍返回真实 `settlementId`；
- Region 跨界时仍拒绝错误合并；
- 近景恢复真实房屋；
- 使用已有房屋包围范围分出 2～4 个子簇；
- 子簇高度优先采用对应成员的代表地面高程，而不是整村只取一个中心高程；
- 整个聚落 HLOD 推荐控制在约 20～48 triangles；
- 不为了 HLOD 新增逐村独立材质；
- 颜色必须允许后续 RealmStyleProfile 接管，不能硬编码纯黑。

## 7.4 验收图

至少同一聚落输出：

- near；
- mid；
- far legacy HLOD；
- far new HLOD。

**视觉门槛**：far 图中必须仍然第一眼识别为“屋顶群 / 聚落质量”，而不是一个黑色几何体。

---

# 8. A3 · Dense Forest LOD CPU 定向探针

## 8.1 目的

只回答一个问题：

> 密林中连续旋转 / 平移 / 缩放时，LOD 分配本身是否已经成为新的 CPU 瓶颈？

## 8.2 必须单独记录

- 投影树数量；
- `chooseLOD` 总耗时；
- crowded budget 分区耗时；
- matrix upload 次数；
- allocation / temporary array 情况；
- CPU update median / p95；
- 5k、10k 两档压力场景。

## 8.3 优化授权

只有当真实证据显示该路径成本显著，才允许优化。

优先的小改方向：

- 复用数组；
- 避免 `visible.concat(outside)` 的 N 长度临时数组；
- stable partition 写入预分配缓冲；
- 避免相机微小抖动触发无意义全量更新；
- 保持现有 screen-space 判据、迟滞和细节预算语义不变。

不得因为“理论上 O(N)”就重构为复杂 spatial tree / quadtree。

**建议触发线**：若参考机器上 LOD assignment 自身 p95 低于约 1.5ms，且 10k 压测仍可接受，则只记录，不重构。

---

# 9. A4 · C2A.1 封板门禁

完成 A1～A3 后，必须重新跑：

- `test:render3d:m1`
- `test:render3d:m2b`
- `test:render3d:m2c`
- `test:render3d:m2c2a`
- build / package audit
- 代表浏览器截图

并生成：

`M2C2A1_CLOSEOUT_REPORT.md`

明确记录：

- 发布包缩减结果；
- HLOD 前后；
- forest CPU 结论；
- 是否有必要继续优化 C2A。

若 C2A.1 通过，立即停止继续抠 LOD，转入 Part B。

---

# 10. B0 · 建立三界 RealmStyleProfile

## 10.1 核心原则

三界差异必须来自“位面自己的材质与表现语法”，不能依赖一个全屏滤镜。

原因：视界模式中同一帧会同时出现 mortal outside + target inside。任何全屏统一 LUT / contrast / fog 都会污染另一界。

## 10.2 建议结构

优先在现有 `ArtPass` 下增加一个小型单源，例如：

`render3d/art/RealmStyleProfile.js`

不新建第二个 Renderer、Scene、Region、Elevation 或 ArtPass。

每个 Profile 至少包含：

- paper / background；
- terrain type palette；
- rock / soil / slope ramp；
- water palette（该位面有水语义时）；
- vegetation palette（该位面有植被语义时）；
- building palette；
- entity accent palette；
- boundary / rift accent；
- pigment load；
- ink strength；
- dry-brush / feibai 强度；
- contrast curve；
- fog / atmosphere；
- paper exposure；
- accent color limit。

Profile 只决定视觉，不得包含世界生成概率、生态概率、裂隙概率或玩法参数。

## 10.3 选择规则

Profile 必须由 `stage.plane` 自动选择：

- mortal → MortalStyleV1；
- nether → NetherStyleV1；
- upper → UpperStyleV1。

不得让玩家手动把“幽冥 palette”套到凡界形成状态污染。

## 10.4 可逆对照

施工期保留 debug 对照：

- legacy / realm-style-v1；

默认在视觉验收完成前保持可切换。封板后 v1 才成为默认。

---

# 11. B1 · 凡界样板：“温润烟火淡彩”

## 11.1 凡界目标

凡界必须从当前偏苍白的“纸墨模型展示”变成：

> **有留白、有清气，但村落、树木、水岸与人工痕迹明显有温度、有色相层次的人间世界。**

不是提高一个 saturation slider。

## 11.2 色彩纪律

具体传统色以《三界视觉风格圣经 v1》为准。

工程实现至少做到：

- 地形不同 type 不再几乎同灰；
- 山石保持低彩度；
- 低地、土坡、岸线可有浅赭 / 土黄变化；
- 水体使用青灰 / 石青 / 微绿蓝，不是纯灰；
- 植被至少形成 3 类色相倾向；
- 白墙不使用纯白，瓦不使用死黑；
- 木构、门窗、桥与少量装饰允许赭、朱、青的局部点染；
- 人物色彩比远山更明确，但不得变成彩色玩具。

## 11.3 “烟火气”优先从真实世界结构产生

不得为了氛围伪造玩家可误解为模拟事实的田地、集市或正在活动的人。

优先通过现有真实内容表达：

- 村落房屋；
- 水边聚落；
- 真实人物；
- 道路 / 桥（若现有）；
- 植被与建筑色彩关系；
- 真实 settlement 的 HLOD。

允许做少量非交互 ambient presentation（例如极弱炊烟）只作为实验项；正式接入前必须明确它是 ambience，不参与模拟、检视和存档。

## 11.4 树木

不增加面数堆细节。优先在现有预算内形成 3～5 个 silhouette / tint 变体。

变体必须：

- deterministic；
- 由 id / cell 的稳定 hash 选择；
- 不调用模拟 RNG；
- 继续复用 InstancedMesh；
- 不每棵树一个材质。

## 11.5 凡界验收图

至少保存：

- world overview；
- settlement close / mid / far；
- river or water-edge；
- forest edge；
- character in settlement；
- legacy vs v1 同相机对照。

**人工验收问题**：

1. 缩到 25% 缩略图时，凡界是否仍有明显“人间”而不是“白色沙盘”感？
2. 颜色是否集中在生活结构，而不是整图均匀上色？
3. 山仍然是山水画的骨架，而不是被彩色植被淹没？

---

# 12. B2 · 幽冥样板：“焦墨、枯骨白、朱红点睛”

## 12.1 幽冥目标

幽冥不是“凡界整体变暗”。

必须呈现：

> **墨被压紧、对比变硬、空气变重、边缘更破、少量红色成为危险与异相的视觉针脚。**

## 12.2 表现规则

- 提高结构墨与暗部质量感；
- 加强干笔 / 飞白 / 破边；
- terrain 中间调减少，黑白关系更明确；
- 雾不是奶白雾，偏冷灰 / 墨灰；
- 实体、裂隙、界缘允许更深墨色；
- 红色仅用于少量关键视觉点：眼、印、裂口、魂灯、禁忌标识等已有语义；
- 不把整片地面染红；
- 不用满屏骷髅替代世界设计。

## 12.3 内容纪律

当前目标位面没有可靠语义的 vegetation / settlement / water Layer 时，不得为了画面“好看”直接伪造凡间式生态。

可以在 `VisualScenarios` 或专用 art lab 中做：

- 枯树；
- 断碑；
- 魂灯；
- 黑潭；
- 骨林；

等视觉方向原型，但必须标记为 style probe，不进入主世界事实。

## 12.4 幽冥验收图

至少：

- nether overview；
- near terrain；
- entity / rift close；
- mortal → nether large window；
- legacy vs v1。

**验收问题**：

1. 去掉红色后，幽冥是否仍然成立？若不成立，说明结构墨语言不足。
2. 红色是否小而有力，而不是占据画面？
3. 和凡界放在同一帧时，是否不靠 UI 就能判断哪边是幽冥？

---

# 13. B3 · 上界样板：“敦煌矿物色、云端高山、神圣秩序”

## 13.1 上界目标

上界禁止走“纯白 + 蓝光 + 发光宫殿”的通用仙界路线。

应建立：

> **水墨骨架 + 敦煌壁画矿物色层 + 云海留白 + 高山 / 台地 / 神圣秩序。**

## 13.2 色彩

具体传统 / 敦煌色组以视觉圣经为准，重点包括：

- 石青；
- 石绿；
- 赭石；
- 土黄 / 暖金；
- 象牙 / 壁画白；
- 少量朱砂；
- 温褐 / 岩壁色。

不得变成高饱和糖水配色。

## 13.3 生产路径与“浮空岛”边界

主世界内的地形必须继续尊重真实 `upper` terrain / walkability / picking。

如果当前 World 数据并没有真实“浮空岛”拓扑，则：

- 不得在正式 Stage 中放一个看似可走但世界里不存在的岛；
- 浮空岛、悬殿、飞桥可以先在 `VisualScenarios` / `upper-style-lab` 中做非生产视觉原型；
- 正式世界本轮优先用高山、断崖、云海背景、台地颜色与垂直层次表达上界；
- 真正的可行走浮空岛留待以后得到 world / terrain 语义授权再接入。

## 13.4 云海

允许添加纯表现性的远景 / 背景云海，只要：

- 不参与 picker；
- 不遮挡错误位面；
- 不写 World；
- 不改变 walkability；
- 在 Realm Window 内按 Stage / Region 正确裁切或仅作为目标界背景存在。

## 13.5 上界验收图

至少：

- upper overview；
- highland / cliff；
- entity close；
- cloud / negative-space composition；
- mortal → upper large window；
- upper style lab（若制作浮空岛原型）；
- legacy vs v1。

**验收问题**：

1. 上界是否一眼“神圣 / 古老 / 有壁画矿物色”，而非白蓝仙境？
2. 留白是否足够，让矿物色成为珍贵的色层而非满屏彩色？
3. 与凡界同屏时，是否有明显等级、垂直与秩序感？

---

# 14. B4 · 三界同屏与视界组合

三界 style 不能只在单独截图里成立。

必须验证真实：

- Mortal outside + Upper inside；
- Mortal outside + Nether inside；
- 界缘 / breach；
- 斜视深度遮挡；
- Region 内外实例；
- LOD / HLOD；
- profile 切换。

## 14.1 严禁全屏污染

任何雾、对比、色彩修正，如果不能被 Stage / Region 正确限制，就不能作为正式方案。

优先：

- material uniform；
- stage-local background / atmosphere；
- profile-driven instance color；
- terrain DataTexture / palette；

不优先：

- 全屏 postprocess；
- DOM/CSS overlay 伪造色调；
- 一个统一滤镜把整个画布染色。

## 14.2 界缘颜色

界缘应帮助识别 target realm，但不能成为比世界本身更抢眼的霓虹边框。

凡界 → 幽冥可更冷、更深；凡界 → 上界可偏矿物青 / 暖金，但必须克制。

---

# 15. B5 · 标准视觉矩阵

建立固定 Visual Acceptance Matrix。

至少包含：

## Mortal

- Overview
- Settlement near
- Settlement far / HLOD
- Water edge
- Forest

## Nether

- Overview
- Terrain close
- Entity / Rift
- Large realm window

## Upper

- Overview
- Highland / cliff
- Entity
- Cloud / negative space
- Large realm window

## Cross-realm

- Mortal + Upper 同屏
- Mortal + Nether 同屏
- Boundary / breach

每个关键镜头至少保留：

- legacy；
- realm-style-v1。

全量矩阵存 local / Actions artifact。Git 只长期保留代表性 golden + summary。

---

# 16. 图像指标只能做诊断，不能代替人眼

可以继续使用图像统计，但本阶段禁止“为了过数值而调风格”。

建议记录但不作为单一硬门：

- near-paper ratio；
- mean saturation；
- mid-tone ratio；
- luminance distribution；
- edge density；
- red accent area；
- palette occupancy。

建议诊断方向：

- Mortal：全图仍低到中饱和，但明显高于当前苍白基线；生活区局部色度高于荒野；
- Nether：明暗对比明显高于 Mortal，红色占比保持很低；
- Upper：保留大面积云 / 纸色留白，矿物色形成成组色层而不是平均铺满。

任何自动阈值若与视觉圣经和人眼冲突，以视觉审查为准，并在报告解释。

---

# 17. 性能预算

三界视觉分化不能把刚刚解决的性能问题重新吃回去。

## 17.1 总则

- 不新增逐实体材质；
- 不新增逐实体 Mesh；
- Profile 切换不得频繁 new / dispose；
- deterministic variation 不调用模拟 RNG；
- 优先 uniform / instanceColor / palette texture；
- 不为“更丰富”让远景重新全部走 LOD0。

## 17.2 建议门槛

同机、同世界、同镜头相对 C2A pilot-lod：

- GOLDEN_A overview triangles 增幅建议不超过约 15%；
- mortal overview draw calls 尽量维持十几次量级；
- realm window draw calls 保持远低于 40；
- CPU update p95 不应出现无法解释的显著退化；
- 新 HLOD 的几何增量可接受，但不得通过每房单 draw 实现；
- 6000 帧资源数稳定。

如果 style pass 只改材质 / palette，原则上几何量应几乎不变。

---

# 18. 模拟纯度与存档门禁

必须新增 `test:render3d:m2c2b0`，至少验证：

- RealmStyleProfile 不写 World；
- 不使用模拟 RNG；
- 不新增 save 字段；
- legacy / v1 profile 下完整 World digest 一致；
- camera movement / style toggle 不消费 RNG；
- upper / nether windows 不改变目标界；
- HLOD 改动不改变 settlement / house 数据；
- deterministic tint / silhouette 在相同世界下完全可复现。

建议重复 C2A 的 600 日六模式对照，并增加 style v1：

- no-render；
- legacy；
- mortal style v1；
- nether view v1；
- upper view v1；
- repeated profile / camera / realm toggles。

最终 digest 和 RNG 调用数必须一致。

---

# 19. 浏览器与生命周期门禁

新增：

```bash
npm run test:render3d:m2c2b0
npm run test:render3d:m2c2b0:browser
npm run test:render3d:m2c2b0:soak
```

Browser 至少检查：

- shader compile；
- console/runtime error；
- GL error；
- legacy / v1 切换；
- three realm windows；
- LOD / HLOD；
- picking；
- resize；
- screenshot matrix；
- representative color metrics。

Soak 至少：

- 600 frame lifecycle；
- 6000 frame continuous camera / zoom / profile / realm switch；
- geometry / texture / program 稳定；
- heap / DOM / listener 有界；
- World digest 不变。

远端 CI：

- CLI 核心加入 Fast Gate；
- Browser 继续 workflow_dispatch Windows Edge；
- 大图矩阵进 artifact，不全量入 Git。

---

# 20. Commit 拆分要求

本轮禁止再次把架构、资产、证据、文档塞成一个巨型提交。

推荐至少拆成：

1. `audit: record C2A.1 baseline`
2. `chore(package): trim runtime package and evidence payload`
3. `fix(render3d): refine settlement HLOD mass`
4. `perf(render3d): audit crowded forest LOD assignment`
5. `feat(render3d): add realm style profiles`
6. `feat(art): establish mortal style proof`
7. `feat(art): establish nether style proof`
8. `feat(art): establish upper style proof`
9. `test(render3d): add C2B0 visual and purity gates`
10. `docs(art): seal three-realm visual baseline`

若某一步需要更多提交，可继续拆，但不要反向合并成一个 mega commit。

---

# 21. 交付文档

完成后至少新增：

- `M2C2A1_CLOSEOUT_REPORT.md`
- `REALM_STYLE_PROFILE_SPEC.md`
- `M2C2B0_VISUAL_REPORT.md`
- `M2C2B0_PERFORMANCE_REPORT.md`
- `M2C2B0_VISUAL_ACCEPTANCE.md`
- `M2C2B0_READINESS.md`

同步更新：

- `README.md`
- `HANDOFF.md`
- `ROADMAP.md`
- `ARCHITECTURE.md`
- `STATUS.md`
- `tests/README.md`
- `美术素材/参考资产索引.md`（把《三界视觉风格圣经 v1》登记为后续美术任务必读上位文档）

不得修改视觉圣经的核心方向来迎合当前实现。若实现做不到，报告“当前技术局限”，不要偷偷降低风格目标。

---

# 22. 本轮完成定义

只有以下全部满足，才允许写“阶段完成”。

## C2A.1

- dist 不再携带无关 `.blend` 与大量 preview；
- 证据新增策略收紧；
- HLOD 远景不再读成纯黑方块；
- HLOD / picker / Region 行为不回归；
- forest LOD CPU 有实测结论；
- 不因为理论担忧做过度重构。

## 三界视觉

- 凡界：有传统淡彩层次和明显烟火气，但仍保留水墨留白；
- 幽冥：高对比、焦墨、破边与少量朱红成立，不是凡界暗色滤镜；
- 上界：敦煌矿物色、云端高山与神圣秩序成立，不是白蓝仙境；
- 三界放在同一帧，不看 UI 也能判断所在位面；
- 所有视觉差异都来自 stage-local / material / presentation 机制，不污染其它位面；
- 浮空岛若无世界语义，只存在 style lab，不伪装成正式可走地形。

## 工程

- M0 / M1 / M2-A / M2-B / M2-C / M2-C2A 全绿；
- C2B0 新门禁全绿；
- Fast / Heavy Gate 无新增回归；
- World digest / RNG 一致；
- 无 save 新字段；
- 无持续 GPU / JS 资源增长；
- build 从 clean clone 成功。

---

# 23. 强制停止条件

出现以下任一情况必须停在当前步骤处理，不得继续“顺手完成后面”：

1. 为了上界浮空岛需要改变 walkability / world terrain；
2. 为了幽冥美术需要虚构可检视、可交互但 World 不存在的内容；
3. 三界区分只能靠全屏后处理实现；
4. 新 style 让 Region Window 发生颜色/雾越界；
5. 新 HLOD 破坏真实 settlement identity；
6. deterministic variation 消费模拟 RNG；
7. 性能明显回退却没有测量与解释；
8. 为减 Git 体积需要 rewrite history；
9. 需要复制参考作品具体构图或纹样才能达到效果；
10. 正式资产家族扩产开始挤入本轮范围。

遇到这些情况：记录证据，给出最小可行替代，不扩大任务。

---

# 24. 执行授权

你可以自主：

- 修改 Render3D art / material / presentation 代码；
- 增加 RealmStyleProfile；
- 调整 PigmentTerrainMaterial / PilotMaterial 参数体系；
- 调整树 / 建筑 /角色的 presentation color；
- 改进凡界 HLOD 几何；
- 新增 VisualScenarios / style lab；
- 增加调试 profile 切换；
- 增加测试、浏览器采样、图像指标；
- 修改 package 清单；
- 更新工程文档。

未经额外授权不得：

- 修改模拟数值；
- 修改世界生成；
- 修改裂隙 RNG / 规则；
- 新增可交互世界实体语义；
- 扩写 Gameplay G；
- 正式批量生产资产家族；
- 重写 Git 历史；
- 删除源 `.blend` 只为减仓库。

对于小范围材质、颜色、阈值、HLOD 形状调优，可以依据视觉圣经自主完成，不必逐项请求用户确认。

---

# 25. 最终汇报必须回答的 15 个问题

阶段结束时不要只回复“完成”。必须回答：

1. build / dist 实际从多少缩到多少？哪些内容被排除？
2. HLOD 由什么形状改成什么形状？每聚落实际 triangles 是多少？
3. Forest LOD assignment 的 median / p95 是多少？是否值得继续优化？
4. RealmStyleProfile 的单源在哪里？哪些 Layer 使用它？
5. 凡界相对 legacy 的色彩变化具体落在哪些语义对象上？
6. 凡界是否真正增加烟火感，而不是全局提饱和？
7. 幽冥如何在不用“大量红色 / 骷髅”的情况下成立？
8. 幽冥红色实际承担什么语义？
9. 上界如何体现敦煌矿物色，而不是常规蓝白仙境？
10. 浮空岛目前是正式 World 内容还是 style lab？为什么？
11. 三界同屏是否存在 fog / color bleed？
12. GOLDEN_A / DENSITY_A triangles、draws、CPU update 相对 C2A 如何变化？
13. 600 日 digest / RNG 是否逐字一致？
14. 6000 帧资源是否稳定？
15. 当前是否已经具备进入 `M2-C2B · 第一套正式资产家族受控试产` 的条件？若否，唯一剩余阻塞是什么？

---

# 26. 本轮正确的终点

本轮不是“把三界做完”。

本轮正确终点是：

> **把三界的美术语言变成可执行规则，把 C2A 的生产地基收干净，并用真实游戏证明这三套规则可以同时存在、性能可控、不会污染模拟。**

完成后停止施工，提交 `M2C2B0_READINESS.md`。

下一阶段再开始第一套正式资产家族，并要求所有新资产天然服从：

- 三界视觉圣经；
- RealmStyleProfile；
- LOD0 / LOD1 / LOD2；
- fixed instance budget；
- Region ownership；
- World purity；
- runtime/source/preview 分离；
- 近 / 中 / 远视觉验收。

这时资产扩产才不会重新把项目拖回“每做一个东西，就重新发明一次画风和性能规则”的状态。
