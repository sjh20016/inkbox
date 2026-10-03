
# 《坐天观井》M2-C：写意渲染基线与可扩展实体试装
## 工程开发委托书 v1.0

### 一、阶段定位

本阶段不是最终 Art Pass。

不是完整资产生产阶段。

不是 UI 美化阶段。

也不是新玩法开发阶段。

本阶段的唯一主目标是：

> **在不改变模拟世界、不重构现有 Render3D 顶层架构的前提下，建立第一套真正符合《坐天观井》的“写意低模渲染语言”，并证明它能够同时容纳地形、建筑、树木和 Mini 规格修士。**

最终希望得到的视觉公式：

> **极简 Low-poly Geometry  
> + Pixel-constrained Information Budget  
> + World-space Ink / Pigment  
> + Paper-space Presentation  
> + Semantic Distance Reduction**

中文理解为：

**几何负责空间，像素纪律控制信息量，墨负责形体，纸负责统一，距离负责舍弃。**

本阶段结束时，不要求画面已经成为最终版本。

但必须能够回答：

> “这套技术路线值得继续大规模生产资产吗？”

---

# 二、当前工程基线

现有 Render3D 的基础架构不得重新发明。

当前需要继续遵守的核心边界包括：

- 模拟世界仍然是唯一真相源；
- Render3D 只读取世界快照；
- 视觉数据不得写回 World；
- 一个 Host、一个 Renderer / Scene / CameraRig、三个 Stage 的顶层结构不改变；
- `WorldRenderBridge` 的只读桥接结构保持；
- 输入单源与 Presentation event 消费边界保持。deepseek分析

现有 ArtPass、ElevationField、RegionMask3D、RimField、SkirtLayer、InkColor 等已经形成的能力，应视为**现有底座**。

本轮禁止另起一套：

`VisualRenderer2`

`NewArtPass`

`InkWorldRenderer`

之类的并行系统。

如需要新的视觉参数层，应进入现有 ArtPass / Presentation 路径，而不是叠第二套架构。

---

# 三、必须冻结的东西

本轮禁止修改：

- 世界模拟逻辑；
- 三界生态规则；
- 存档 Schema；
- 世界推进结果；
- `Sandbox.commitSelection` 输入语义；
- 三界 Region Mask 的核心定义；
- PlaneStage 顶层生命周期；
- 当前三界世界坐标关系；
- Gameplay G；
- 世界生成算法。

禁止为了美术便利修改模拟事实。

例如：

没有农田模拟，就不能为了画面漂亮凭空声称某一区域是“梯田”。

没有道路事实，就不能把某些视觉线直接定义为真实道路。

表现层只能：

**解释已有事实，不能伪造世界事实。**

---

# 四、本阶段必须避免的错误路线

本轮明确禁止以下方向成为主路径：

### 1. 全屏 LUT 作为三界视觉核心

当前三界可能同时存在于同一画面。

不能用一张全局 LUT 解决区域视觉差异。

---

### 2. 每界独立 Scene Fog

凡间、上界、幽冥可能空间共存。

不得重新把它们假设成“切换场景”。

---

### 3. 人物全部改成 Billboard

Mini 3D 人物是主路径。

Billboard / Sprite / Points 只允许作为未来远景 LOD。

---

### 4. 树全部使用透明公告板

近中景必须保留极简 3D 体积。

透明卡片只能作为远景降级方案。

---

### 5. 大量半透明水墨 PNG

不要把“水墨”等价成：

满世界透明 Brush Plane。

优先：

Shader、Vertex Color、DataTexture、Opaque / AlphaTest。

---

### 6. 复杂中国古建

不得把建筑方向重新带回：

瓦片、斗拱、窗棂、飞檐装饰堆积。

建筑需要的是：

**中国建筑识别符号，而不是建筑学还原。**

---

# 五、视觉原则

以后所有本阶段决策统一遵守以下五条。

### 原则 A：纸比物体重要

不能让整个世界被中间调填满。

视觉上必须允许大片区域接近纸色。

---

### 原则 B：线比明暗重要

不要依赖真实 PBR 光照塑造所有形体。

形体更多通过：

- 墨线；
- 轮廓；
- 浓淡；
- 色块；
- 留白；

建立。

---

### 原则 C：墨只落在重要位置

不是：

有坡度 → 就画皴。

而是：

有视觉结构意义 → 才允许落墨。

---

### 原则 D：远景主动失去信息

不是简单：

4px 轮廓 → 2px → 1px。

应该允许：

完整模型  
→ 简化块面  
→ 淡墨  
→ 轮廓  
→ 墨点  
→ 留白。

---

### 原则 E：颜色承担语义，而不是装饰

大部分世界由：

纸白、墨灰、木褐、极淡水色

组成。

较明显的：

蓝、红、青、金

主要用于：

宗门、功能建筑、特殊状态、灵气、幽冥等信息。

---

# 六、阶段拆分

本轮按照以下七个阶段推进。

禁止跳过验证直接做最终效果。

---

# S0：工程真相确认与视觉基线

## 目标

在任何 Shader 改动之前，固定当前工程状态和视觉基准。

## 第一步必须阅读

至少检查：

- README
- STATUS
- HANDOFF
- ROADMAP
- ARCHITECTURE
- THREE_REALMS
- VIEW_CONTRACT
- Render3D 相关阶段文档
- 当前 ArtPass 文件
- Render3DHost
- PlaneStage
- TerrainMesh
- EntityLayer
- ElevationField
- RegionMask3D
- RimField
- SkirtLayer
- PresentationStage
- 当前测试入口

如果文档和代码不一致：

**以运行代码 + 自动测试事实为优先。**

记录漂移。

不要自行脑补。

---

## S0.1 建立当前测试基线

先运行现有：

```text
npm test
view tests
intervention tests
vendor tests
browser smoke / 当前已有浏览器测试
build
```

不要把历史测试数字硬编码为真相。

记录当前：

```text
BASELINE_TEST_COUNTS.md
```

包括：

- 当前测试数量；
- 当前通过数量；
- 当前已知 warning；
- 当前 build 状态。

---

# S0.2 Visual Scenario Harness

原来的“固定 Seed + 固定 Camera”升级为：

> **Visual Scenario Harness**

必须允许未来扩展：

- 不同世界 Seed；
- 不同地图大小；
- 不同世界年龄；
- 秘境；
- 洞府；
- 古阵；
- 宗门；
- 特殊事件。

但第一版不要把所有未来内容全部实现。

---

## Seed

第一版维护三个 Seed：

### GOLDEN_A

普通、均衡世界。

日常 Art Pass 开发使用。

### TERRAIN_STRESS

高低差明显、山体复杂。

用于墨线和地形验证。

### DENSITY_A

聚落 / 实体相对密集。

用于可读性验证。

---

## Camera Recipe

禁止保存纯绝对 XYZ 作为主要标准。

至少定义：

```text
WORLD_OVERVIEW
REGIONAL
REALM_BOUNDARY
ENTITY_MEDIUM
ENTITY_CLOSE
```

Camera 应优先相对：

- World Bounds；
- Target Bounds；
- POI；
- Realm Boundary；

定义。

---

## Screenshot Manifest

每张标准截图必须保存：

```text
scenario
seed
worldGenVersion
mapSize
worldDay / snapshot
cameraRecipe
viewRealm
artProfile
commit
```

禁止以后出现：

```text
final_fixed_3_new.png
```

这种不可追溯截图。

---

# S0.5：技术探针

这一阶段只回答：

**技术上能不能做。**

不要追求漂亮。

---

## Spike A：DataTexture

验证：

- `world.height` → GPU 数据纹理；
- `world.type` → GPU 数据纹理；
- 高度纹理格式；
- 类型纹理 nearest 采样；
- world-space sampling；
- dirty upload；
- 不同地图尺寸。

重要：

### Terrain type 不允许普通线性插值

分类数据必须保持类别语义。

手绘边界通过：

**扭曲采样坐标**

而不是：

**混合 terrain ID。**

---

## Spike B：RenderTarget

验证当前 Three 版本和目标机器上的：

- Color RenderTarget；
- DepthTexture；
- MSAA；
- `samples = 4`；
- depth sampling；
- framebuffer resolve；
- resize；
- DPR。

如果：

MSAA + DepthTexture

组合不稳定，

必须记录证据。

不要硬绕。

---

## Spike C：Fullscreen Pass

制作最小：

```text
Scene → RT → Fullscreen Triangle → Screen
```

分别测试：

- Full resolution；
- Half resolution。

记录：

平均帧时间；

p95；

相对现有 Renderer 的额外成本。

---

## S3 Gate

只有 S0.5 证明：

后处理开销和兼容性可接受，

才允许进入后面的 S3。

否则：

S3 保持关闭。

项目仍必须依靠 S1/S2 成立。

---

# S1：Pigment Terrain

这是本阶段第一项真正核心功能。

## 目标

把当前：

“每一格都有颜色”

逐渐转换成：

“纸是底，颜料只在需要的位置出现”。

---

## 1. DataTexture 驱动

Terrain Shader 读取：

```text
heightTexture
typeTexture
```

必要时允许增加：

```text
derivedMask
```

但不要生成大量新状态。

所有东西必须是只读视觉派生。

---

## 2. 颜料模型

不再简单定义：

```text
forest = #xxxxxx
water = #xxxxxx
```

改成类似：

```text
paperColor
pigmentColor
pigmentDensity
```

核心思想：

```text
Final Color
=
Paper
×
Pigment
```

由浓度决定显色程度。

---

## 3. 纸色

默认 ArtProfile 可以从：

```text
#f5f2ea
```

附近寻找。

但禁止把该值写成不可修改的设计真理。

进入：

```text
ArtPassProfile
```

调节。

---

## 4. 饱和度

默认世界必须明显降低饱和度。

参考值：

```text
0.05 – 0.10
```

只作为诊断区间。

不是测试必须精确通过的 KPI。

不同 Scenario 可以有不同范围。

---

## 5. 类型边界

terrain type 边界可以：

world-space noise warp

使其从规则格线变成较自然的水色边界。

边缘可略加深。

但必须：

- 可复现；
- seed 固定；
- 不用 Math.random；
- 不闪烁；
- 镜头移动时不游动。

---

# S2：Structural Ink

第二项真正核心功能。

目标不是“给画面描黑边”。

而是：

> **让墨线解释世界结构。**

---

## S2.1 地形结构墨线

使用：

- height gradient；
- slope；
- curvature；
- 邻域高程；
- 必要的 contour / threshold；

识别：

### Ridge

凸脊。

### Valley

沟谷。

### Terrace / Break

高程断层。

---

注意：

`N·V`

只能作为：

**Silhouette Ink**

不能冒充真正山脊。

---

# S2.2 两类 Ink 必须分开

### Structural Ink

来自世界结构。

例如：

山脊；

沟谷；

坡折；

人为整治痕迹。

### Silhouette Ink

来自观察方向。

例如：

人物外轮廓；

屋檐边缘；

树冠边界。

两者参数不能混为一个：

```text
rimStrength
```

---

# S2.3 稀疏落墨

禁止：

每一个坡面都出现皴纹。

必须引入：

```text
inkDensity
```

或等价机制。

至少受：

```text
slope
curvature
world-space low frequency noise
distance
artProfile
```

共同影响。

要允许大片区域：

**完全没有皴。**

---

# S2.4 飞白

允许使用：

world-space dry-brush texture / procedural mask

产生断裂。

但要求：

- 世界空间稳定；
- 不随屏幕漂；
- 不形成重复条纹；
- 不覆盖整个世界。

---

# S2.5：跨实体视觉试装

这是本阶段非常重要的一关。

S1/S2 做完以后：

**禁止继续单独雕琢地形。**

必须立即加入三个最小实体。

---

## 1. 一栋 Base Building

只做：

普通修仙民居。

不要做建筑家族。

视觉复杂度：

```text
墙体
+
屋顶
+
门
+
极简基座
```

即可。

视觉方向：

**纸白墙 + 墨屋顶 + 极少木色。**

禁止：

- 蓝色游戏瓦屋成为视觉主体；
- 复杂木梁；
- 瓦片；
- 窗棂；
- 大量飞檐。

---

## 2. 一棵 Base Tree

结构：

```text
极简树干
+
2–4 个树冠大块
```

近中景：

真实低模 3D。

不要透明叶片作为主实现。

远景 LOD 暂时可不完整实现。

---

## 3. 一个 Base Cultivator

使用已经确定的：

**Kenney Mini Characters 级别复杂度**

但视觉风格完全修仙化。

目标约：

```text
250–450 tris
```

只作为 Target。

不是绝对死线。

基础组成：

```text
头
极简发髻
身体
一体式道袍
宽袖
腰带
腿
鞋
```

不带武器。

不带背包。

不带葫芦。

这是 Base。

---

# S2.6 跨实体统一性验收

把：

```text
Terrain
+
1 Building
+
1 Tree
+
1 Cultivator
```

放到同一个 Scenario。

必须检查：

### 远景

四者是不是像同一个世界。

### 中景

建筑是否过于塑料。

### 近景

Mini 修士是否过分卡通。

### ArtPass

纸、墨、颜料是否把它们真正缝合起来。

---

如果：

地形像中国画，

建筑像 Low-poly Asset Store，

人物像玩具，

则：

**S2 不得通过。**

---

# 七、共享材质策略

这三个 Pilot Asset 优先共享：

```text
Small Palette Atlas
```

目标：

8～12 个颜色区域。

例如：

```text
Paper White
Warm Paper
Ink
Blue Gray
Wood Brown
Earth
Muted Red
Pale Cyan
Skin
```

不要求必须真的制作传统 UV 纹理。

允许：

- palette atlas；
- vertex color；
- small gradient atlas；

组合。

---

禁止：

一个建筑一套材质；

一个人物一套贴图；

一棵树一张 1K texture。

---

# 八、S3：可选合成层

只有 S0.5 Gate 通过后才能做。

S3 不是核心依赖。

必须满足：

> **关闭 S3，《坐天观井》的核心风格仍然成立。**

---

# S3.1 Depth Outline

使用 depth edge detection。

但不得：

所有 Edge 都变成黑线。

必须根据：

```text
depth
screen size
edge magnitude
distance
```

衰减。

远距离应该：

逐渐消失。

---

# S3.2 空气透视

使用 Depth：

降低：

- 对比度；
- 饱和度；
- 墨浓度；

而不是简单套传统白雾。

理想效果：

```text
近：
对象

中：
色块

远：
墨迹

极远：
纸
```

---

# S3.3 Paper

纸纹分成两个概念：

### Screen-space Paper

极弱。

固定在画面。

代表：

**纸。**

### World-space Pigment

跟随世界。

代表：

**墨。**

原则：

> **纸跟镜头，墨跟世界。**

---

# 九、本阶段暂时不做完整实体资产库

不要在这一轮继续制作：

6 种修士；

20 种建筑；

10 种树；

各种山海经妖怪。

只做：

```text
1 人
1 房
1 树
```

证明母语言成立。

资产家族生产放下一阶段。

---

# 十、但必须提前定义 Scalable Entity Presentation Contract

虽然不批量生产资产，

这一轮必须建立：

```text
ENTITY_PRESENTATION_CONTRACT.md
```

明确未来实体不能：

Simulation Entity = Object3D

一一映射。

---

# Character

未来结构至少预留：

```text
Near
Mini 3D / animated

Medium
Instanced / simplified

Far
impostor / sprite / point
```

---

# Building

```text
Near
full simple geometry

Medium
instanced simple building

Far
settlement HLOD / roof mass
```

---

# Tree

```text
Near
simple 3D

Medium
instanced simplified

Far
cross-card / point / ink mass
```

---

# Trace

这一条必须明确写死：

> **永久世界痕迹禁止以独立 Mesh / Decal 对象累积。**

未来：

修士足迹；

战斗痕迹；

灵气残留；

幽冥污染；

道路磨损；

应优先进入：

```text
Field
Texture
Grid accumulation
```

再由 Renderer 转换成表现。

---

# 十一、性能原则

本阶段虽然资产很少，但必须建立未来规范。

---

## Object3D

独立 Object 数量不得随着模拟实体数量线性增长。

---

## Materials

共享。

严禁大量动态 Material clone。

---

## Draw Calls

本阶段新增基础表现不能因为：

30 个同类单位

产生：

30 个 draw calls。

---

## FX

未来临时 FX 使用 Pool。

禁止长期：

```text
new
remove
dispose
new
remove
dispose
```

循环抖动资源。

---

## Traces

不允许对象化长期历史。

---

# 十二、视觉统计工具

保留 Sonnet 提出的图像分析工具。

但是明确：

> **所有视觉指标都是诊断护栏，不是优化目标函数。**

记录：

- near-paper ratio；
- mean saturation；
- mid-tone ratio；
- edge density；
- point-color ratio；
- brightness。

---

禁止：

为了达到：

```text
留白 50%
```

直接把画面调白。

也禁止：

为了：

```text
edge 20%
```

疯狂描线。

---

指标必须结合：

Visual Scenario 截图

人工判断。

---

# 十三、Art Debug Panel

这一轮强烈建议实现：

```text
?artdebug=1
```

至少能够实时控制：

```text
paperColor
pigmentDensity
pigmentSaturation
terrainBoundaryStrength
structuralInkStrength
silhouetteInkStrength
inkDensity
dryBrushStrength
distanceFade
paperGrainStrength
```

如 S3 存在：

```text
outlineStrength
atmosphereStrength
```

---

调试面板：

不得进入正式默认 UI。

允许开发时：

导出当前 Profile JSON。

---

# 十四、三界要求

本阶段重点是建立凡间母语言。

但必须至少 smoke test：

- Mortal；
- Upper window；
- Nether window。

不能因为凡间新 Shader 导致：

上界 Mask 错；

幽冥窗口错；

Skirt 接缝错；

Elevation 错；

Picking 错。

---

本轮：

不要彻底重新设计三界美术。

只验证：

新语言没有破坏现有三界共存。

三界完整 Visual Identity 属于后续 M2-C 深化阶段。

---

# 十五、ArtPass 与 Realm Boundary

现有：

```text
ElevationField
RegionMask3D
RimField
SkirtLayer
```

继续保留。

但新的笔墨语言应逐渐允许未来把：

“界缘墙”

重新解释为：

**墨的空间断层**

而不是必须永远保持：

巨大实体岩壁。

本轮不要彻底重做 Skirt。

只预留：

Ink 参数入口。

---

# 十六、测试要求

所有现有工程门禁：

必须原样通过。

同时新增测试。

至少包括：

### A. DataTexture determinism

同 Seed / Snapshot：

纹理结果一致。

### B. Terrain type integrity

Noise warp 不得产生非法 Terrain type。

### C. World digest

开启/关闭新 ArtPass：

不得改变模拟结果。

### D. Realm Mask

视界区域保持正确。

### E. Resource lifecycle

resize / toggle / reopen：

不得持续产生 GPU 资源。

### F. ArtProfile

切换 profile：

不得写 World。

### G. Screenshot Manifest

Golden 截图拥有完整 metadata。

### H. Asset batching

20～30 个相同 Pilot Entity：

不得退化成一实体一材质 / 一实体一 draw call 的简单实现。

---

# 十七、浏览器人工验证

至少验证：

### T1

凡间 overview。

### T2

复杂山地。

### T3

普通聚落区域。

### T4

建筑 + 树 + 修士同屏。

### T5

近距离 Pilot Asset。

### T6

上界视界。

### T7

幽冥视界。

### T8

连续旋转 Camera。

重点观察：

- world-space 墨纹是否游动；
- paper 是否太明显；
- edge 是否闪烁；
- 像素/色块是否摩尔纹。

### T9

Zoom in/out。

观察：

视觉信息是否能够自然减少。

### T10

长时间运行。

检查：

资源泄漏；

帧率；

ArtPass 状态漂移。

---

# 十八、性能证据

不要继续引用历史的：

“406k triangles @ 60 FPS”

作为当前性能结论。

那只能作为历史参考。

本轮必须重新记录：

```text
Renderer baseline
S1
S1 + S2
S1 + S2 + Pilot assets
S1 + S2 + S3
```

分别记录：

- median frame time；
- p95；
- draw calls；
- triangles；
- visible instance count；
- RenderTarget 分辨率；
- DPR；
- GPU / 浏览器环境。

如果无法准确读取 GPU time：

明确写：

CPU-visible frame timing。

不要伪装成 GPU benchmark。

---

# 十九、S3 性能 Gate

如果开启 S3 后：

- 平均帧时间明显恶化；
- p95 抖动明显；
- UHD 730 级设备无法稳定；
- depth/MSAA 存在兼容问题；

则：

S3 不进入默认路径。

保留为：

```text
experimental / high quality
```

即可。

不要为了后处理漂亮牺牲基础路线。

---

# 二十、质量档位

第一版可预留：

### Low

```text
S1
+
S2 basic
```

### Medium

```text
S1
+
S2
+
lightweight atmosphere
```

### High

```text
S1
+
S2
+
S3
```

但不要在本阶段投入大量时间制作自动画质检测系统。

优先证明视觉语言。

---

# 二十一、交付文档

本轮最终必须交付：

```text
M2C_EXPRESSIVE_INK_REPORT.md
VISUAL_SCENARIO_SPEC.md
ARTPASS_PROFILE.md
ENTITY_PRESENTATION_CONTRACT.md
PERFORMANCE_REPORT.md
VISUAL_ACCEPTANCE.md
```

---

# 二十二、最终截图证据

至少提交：

```text
01_mortal_overview
02_mortal_mountain
03_pilot_entity_medium
04_pilot_entity_close
05_building_tree_character
06_upper_boundary
07_nether_boundary
08_dense_test
```

每张必须附 Manifest。

---

# 二十三、必须提供 Before / After

至少：

### Terrain

旧 Render3D

vs

S1

vs

S1+S2

### Entity scene

旧风格实体

vs

新 Pilot Entity。

如果 S3 实现：

再加入：

S1+S2+S3。

同一个：

Seed；

Camera；

Snapshot；

Viewport。

禁止换镜头制造效果差异。

---

# 二十四、验收标准

这个阶段只有同时满足以下条件才算完成。

## 工程

- 原有测试不回归；
- 模拟 digest 不变；
- 三界视界仍正常；
- Picking 正常；
- Resize 正常；
- 无明显资源泄漏；
- 无第二套 Render3D 架构。

## 视觉

- 地形明显不再是传统彩色 Low-poly Map；
- 纸色真正参与画面；
- 墨线不是简单 Cartoon Outline；
- 大片区域允许不落墨；
- 远景主动减少视觉信息；
- 建筑、树、Mini 修士进入画面以后不明显“跳出来”；
- 不依赖 S3，基础画风仍成立。

## 性能

- Pilot Entity 支持批处理路径；
- 没有明显 Object3D 爆炸趋势；
- 不制造大量独立材质；
- 不依赖昂贵透明层实现核心美术。

---

# 二十五、失败条件

出现以下任意一项，需要暂停并重新判断路线。

### 1

画面只是：

低饱和 + 宣纸 Overlay。

### 2

水墨主要来自透明 PNG。

### 3

所有物体都有统一黑描边。

### 4

没有 S3 后整个画风消失。

### 5

建筑仍明显像 Low-poly 中国小镇 Asset Pack。

### 6

Mini 修士像从完全不同的卡通游戏进入场景。

### 7

为了视觉效果修改 World 数据。

### 8

新系统重新实现现有 ArtPass。

### 9

大量新 Manager / Resolver 出现，却没有明显视觉收益。

### 10

视觉指标漂亮，但截图实际不好看。

---

# 二十六、允许模型自主判断的范围

GPT-6.1 Sol 可以自主：

- 调整 Shader 数学实现；
- 选择合适 DataTexture 格式；
- 调整 Pigment 模型；
- 选择 curvature 算法；
- 选择 dry-brush 实现；
- 调整 ArtProfile 参数；
- 删除视觉效果不好的实验；
- 改进 Pilot Asset；
- 修复与本阶段直接相关的小 Bug。

不需要为每个小参数向用户请示。

---

# 二十七、禁止模型自主扩展的范围

不得自行：

- 重写 Renderer；
- 换 Three.js；
- 加大型外部库；
- 修改 Simulation；
- 制作完整建筑资产包；
- 制作完整修士资产包；
- 开发秘境系统；
- 开发道路系统；
- 开发农业；
- 开发 Gameplay G；
- 重做 UI；
- 重构存档；
- 引入 WebGPU 主路径。

如果认为这些是必要条件：

先写：

```text
BLOCKER_ANALYSIS.md
```

解释证据。

不要直接动手。

---

# 二十八、6.1 Sol 与 DeepSeek 的建议分工

这一轮建议仍然以：

**GPT-6.1 Sol 为主。**

因为最难的问题不是：

“Shader 会不会写。”

而是：

> **哪些信息该留下，哪些信息该删。**

这是判断题。

---

## 6.1 Sol

负责：

- Pre-flight；
- 视觉架构判断；
- DataTexture 路线；
- Pigment 模型；
- Structural Ink；
- Pilot Asset 美术判断；
- S3 是否值得；
- Visual Acceptance；
- 最终收束。

---

## DeepSeek

适合在方向确定后负责：

- 明确 Shader 子任务；
- DataTexture plumbing；
- debug panel；
- screenshot manifest；
- test；
- benchmark；
- 文档；
- batching；
- regression 修复。

---

如果交替开发：

```text
6.1 Sol
完成 S0–S2 原型

↓

用户检查画面

↓

DeepSeek
补齐测试/工具/工程化

↓

6.1 Sol
完成 S2.5 与视觉收束

↓

若 S3 Gate 通过
6.1 Sol 决定是否进入

↓

DeepSeek
做 Release Cleanup
```

这是我目前最推荐的组合。

---

# 二十九、最终完成报告必须回答的 10 个问题

不要只写：

“任务完成。”

最终报告必须明确回答：

1. 新渲染到底改变了什么？
2. 哪些旧 ArtPass 能力复用？
3. 哪些实验被删除，为什么？
4. 当前地形为什么更接近写意而不是低模滤镜？
5. 建筑、树、人是否属于同一个画面？
6. 没有后处理时效果还能否成立？
7. GPU / CPU 成本分别增加多少？
8. 当前最大性能风险是什么？
9. 哪些内容明确留到下一阶段？
10. 是否建议进入大规模实体资产生产？

---

# 三十、这一阶段真正的结束条件

不是：

> “水墨 Shader 做完了。”

也不是：

> “截图很好看。”

真正的结束条件是：

> **我们已经证明：一个非常简单的 3D 世界，通过正确的颜料、墨线、留白与距离规则，可以形成属于《坐天观井》的视觉语言，而且这套语言能承受未来大量建筑、树木和修士。**

一旦这个结论成立，下一阶段才进入真正的：

> **M2-C2 / Scalable Entity Family Production**

也就是开始批量生产：

修士家族；

建筑家族；

树木家族；

宗门标识；

动物 / 灵兽 Archetype；

并正式建立：

Instancing + LOD/HLOD + Trace Field。

这次不要提前跨过去。

现在最值钱的一轮，是先证明：

**那张“纸”，真的能把整个世界接住。**

这份委托书与项目此前已经稳定的三界 Render3D、只读表现层、ArtPass 技术底座和后续大规模实体方向是一致的。