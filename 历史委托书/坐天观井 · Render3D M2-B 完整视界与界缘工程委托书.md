# 坐天观井 · Render3D M2-B 完整视界与界缘工程委托书

阶段代号：

**Render3D M2-B · Realm Window Integration**

阶段定位：

**把 M2-A 的“多位面技术原型”推进成真正可以由玩家使用的 3D 视界。**

本阶段主力模型：

**GPT-6.1 Sol**

开发方式：

**强模型自主施工 + 契约驱动 + 分阶段提交 + 真实浏览器证据。**

不要每完成一个小函数就停下来等待确认。

在不触发本文“停止条件”的前提下，应主动：

- 阅读源码；
- 建立测试；
- 实施；
- 自检；
- 跑回归；
- 修复本阶段引入的问题；
- 留下工程报告和视觉证据。

但禁止自行扩展到本文明确排除的模拟玩法。

---

# 一、当前基线

当前活跃主线：

```text
main
```

M2-A Runtime checkpoint：

```text
render3d-m2a
→ f274def
```

M2-A final cleanup 已完成。

当前仓库已经成立：

```text
1 × WebGLRenderer
1 × Scene
1 × CameraRig

Render3DHost
├── Mortal PlaneStage
├── Upper PlaneStage
└── Nether PlaneStage
```

并已经拥有：

- 世界空间 `RealmViewState`
- `RegionMask`
- Plane-aware Picking
- Terrain + Entities Mask 原型
- Rectangle Slab Probe
- PresentationStage 单消费者
- 三界 Stage 生命周期
- M2-A 13 组架构测试
- 600 日模拟纯度测试
- 本机真实 GPU 基线
- GitHub Edge Browser Smoke
- `VIEW_CONTRACT v2`
- `ARCHITECTURE.md`
- `render3d-m2a` checkpoint

M2-A 已封板。

**不要重新实现 Host / PlaneStage / RealmViewState。**

---

# 二、M2-B 一句话目标

当前 M2-A 的 3D 视界只是：

```text
Terrain
+
Entities
```

的技术洞口。

M2-B 要把它变成：

> 玩家可以在 3D 沙盘中真实划开一块世界空间 Region，从中观察另一界同坐标区域；窗外凡间保持完整，窗内目标界拥有完整内容，界缘能够稳定表达两个位面的空间断层，并支持检视、裂缝和短命表现。

最终体验应接近：

```text
我仍站在凡间
        ↓
划开山河的一块区域
        ↓
这一块世界被揭开 / 抬起 / 沉下
        ↓
看到同坐标的另一界
        ↓
边缘形成明确的“界缘”
        ↓
已有裂缝可以在界缘形成破口
```

而不是：

```text
切换地图
```

也不是：

```text
屏幕上贴一张另一界图片
```

---

# 三、本阶段最高原则

## P1 · 模拟世界仍是唯一真相

M2-B 不新增：

```text
sealStrength
镇压概率
泄漏倍率
灵气跨界流动
```

等模拟规则。

本阶段只允许：

**表现层与输入层建设。**

---

## P2 · 视觉墙高不是模拟数值

允许存在：

```text
rawGap
visualGap
boundaryVisualDepth
datum
relief
shoulderWidth
```

这些**表现量**。

但禁止把它们解释为：

```text
镇压强度
封印强度
泄漏概率
鬼爬出难度
```

正式玩家 UI 中也暂时不要出现：

> 镇压厚度

这样的机制性文案。

未来如果单独批准 Gameplay 包，再建立独立的模拟派生量。

---

## P3 · 不修改裂缝概率

禁止修改：

```text
LEAK_CHANCE*
WRAITH_CLIMB_CHANCE*
NETHER_ITEM_LEAK_CHANCE*
POSSESS_CHANCE*
RIFT_BASE_RADIUS
TAU_GROW
TAU_CLOSE
```

以及其它三界生态概率。

---

## P4 · 不把视觉参数反写模拟

禁止：

```text
wallHeight
→ 修改 rift chance
```

禁止：

```text
datum
→ 修改 world.height
```

禁止：

```text
visualElevation
→ 修改 qi
```

所有 M2-B 的垂直空间变化均为纯 Render3D 表现。

---

## P5 · 本阶段冻结全局 visualElevation

当前：

```js
visualElevation(height)
```

保持 M2-A 数学形式。

本阶段禁止同时调整它的：

```text
线性项
二次项
整体倍率
```

否则：

datum / relief / shoulder / boundary

多个变量一起变化，无法归因。

全局山体风格调整留给 Art Pass。

---

# 四、M2-B 总体阶段

本阶段分五包：

```text
B0 · 表现基础统一
B1 · 完整 Region Mask
B2 · Realm Boundary / Skirt
B3 · 正式 3D 划窗交互
B4 · 检视 / 裂缝 / FX 收口
```

然后停止。

```text
Art Pass
Gameplay G
```

均不属于本委托书。

---

# 五、B0 · 表现基础统一

目标：

在增加新视觉以前，先解决：

```text
高程入口散落
Region 重复计算
3D sculpt 派生量一致性
```

三个结构问题。

---

# 六、B0.1 · 新建 ElevationField

建议新增：

```text
src/inkbox/render3d/terrain/ElevationField.js
```

每个 PlaneStage 持有一份：

```js
stage.elevation
```

至少提供：

```js
node(x, y)
at(x, y)
baseNode(x, y)
baseAt(x, y)
```

或者同等清晰接口。

---

# 七、ElevationField 第一阶段必须零视觉变化

初始模式：

```text
datum = 0
relief = 1
shoulder = none
```

这时：

```text
ElevationField.at(world,x,y)
```

必须与当前：

```text
surfaceElevation(world,x,y)
```

一致。

需要自动测试验证：

- grid node 一致；
- triangle interpolation 一致；
- `Math.fround` 行为一致；
- 斜面 silhouette 不漂；
- entity / settlement / marker 贴地不变；
- Camera focus 高度不变。

---

# 八、逐步收口 Render3D 的高程读取

当前 Render3D 多处直接：

```js
surfaceElevation(world,x,y)
```

M2-B 应逐步改成：

```js
stage.elevation.at(x,y)
```

重点覆盖：

- Terrain
- Water
- Vegetation
- Entity
- Settlement
- WorldMarker
- SelectionMarker
- BrushOverlay
- ThreeFx
- Host.focusOn
- RealmBoundary
- SlabProbe

允许内部真正的数学实现继续复用：

```text
VisualElevation.js
```

禁止复制插值公式。

---

# 九、建立源码边界测试

最终生产 Render3D Layer 不应该各自：

```js
import { surfaceElevation }
```

建立结构测试。

允许：

```text
ElevationField.js
```

成为 Render3D 的主高程入口。

如 Slab 仍需保留特殊研究路径，也必须有明确注释，不允许无意漏网。

---

# 十、B0.2 · RegionGeometry

现有：

```text
RegionMask
```

继续作为：

**区域逻辑真相。**

M2-B 新增一个 Render3D 专用派生结构。

建议命名：

```text
RegionGeometry
```

或：

```text
RegionMask3D
```

任选其一。

不要两个同时存在。

---

# 十一、RegionGeometry 只从 RegionMask 派生

输入：

```text
RegionMask
```

输出至少包括：

```text
quadInside[]
boundaryEdges[]
boundaryVertices / nodes
insideCells
outsideCells
distanceToBoundary（必要范围内）
```

不重新存：

```text
screen polygon
```

不另造：

```text
3D selection
```

---

# 十二、暂不造通用多窗口缓存系统

V1 规定：

```text
一个时刻只一扇窗
```

所以第一版 Host 只需：

```text
activeRegionGeometry
```

Region identity 变化：

重新构建。

不需要为了“以后可能多窗”建立复杂：

```text
Map
LRU
Resource cache
```

---

# 十三、边界提取不要强依赖闭环追踪

从：

```text
inside cell ↔ outside cell
```

的相邻格直接得到：

```text
oriented boundary edge
```

即可。

SkirtLayer 可以直接消费独立边。

不要为了画墙先实现大型：

```text
polygon tracing
triangulation
GIS topology system
```

---

# 十四、度 4 节点

测试必须专门构造：

```text
□■
■□
```

这类棋盘接触。

RegionGeometry 必须：

- 不崩；
- 不生成 NaN；
- 不错误连接对角区域；
- 边界没有重复 quad。

如果闭环追踪难以处理：

**不要闭环追踪。**

独立有向边即可完成 M2-B。

---

# 十五、B0.3 · 3D Sculpt 一致性审计

这是一个独立正确性检查。

建立测试：

对同一初始 world、同一区域：

使用 Canvas canonical terrain editing path

与：

```text
render3d/terrain/sculpt
```

完成等价的 height 修改。

检查：

```text
height
type
qi
```

以及必要派生量。

---

# 十六、如果确认 3D Sculpt 破坏派生量不变量

允许增加一个**独立 bugfix commit**：

```text
fix(render3d): restore terrain derived-data invariants after sculpt
```

要求：

- 复用 `world/terrain.js` 的 canonical recompute API；
- 不复制 terrain classification；
- 不新增 RNG；
- 不改变 Canvas 规则；
- 不改变三界概率；
- undo 后派生量也正确恢复；
- 有测试证明。

如果修复需要：

```text
改模拟公式
改 save schema
改世界生成规则
```

则停止并只记录问题。

---

# 十七、B0 完成判据

B0 完成后：

视觉应几乎和 M2-A 一样。

如果 B0 就出现明显视觉变化：

说明抽象混入了新表现。

先修正。

---

# 十八、B1 · 完整 Region Mask

当前 M2-A 开窗时：

```text
Water
Vegetation
Settlement
Markers
Selection
Three FX
```

大量 Layer 会整体消失。

M2-B 第一项玩家可见目标：

> **开窗后窗外的凡间不再变秃。**

---

# 十九、统一 Region 判据

所有需要 Region 过滤的 Layer：

只允许查询：

```text
RegionGeometry
```

或其封装 API。

禁止：

Terrain 一套 contains；

Vegetation 一套 bounding box；

Settlement 自己判断 rectangle。

---

# 二十、Mortal 与 Target 使用互补规则

默认：

```text
MortalStage
→ outside

TargetStage
→ inside
```

使用同一张区域表。

这样 V5：

> 窗内只提交目标位面内容

由构造保证。

---

# 二十一、Water Mask

凡间水：

只保留：

```text
outside
```

目标位面的水：

只有该位面 profile 明确拥有该视觉语义时才：

```text
inside
```

不要为了结构对称：

自动给 Upper / Nether 创建凡间式蓝色水。

---

# 二十二、Vegetation Mask

凡间植被：

```text
outside
```

Region 内不显示凡间树木。

实例过滤只在：

```text
Region identity 变化
```

或者真实 veg/type dirty 时重建。

禁止每帧全量重写实例。

---

# 二十三、Settlement Mask

凡间：

村落 / 宗门

只显示 Region 外部分。

对跨边建筑：

M2-B 第一版允许按：

```text
建筑中心格
```

归属。

不要做 Mesh clipping。

记录：

```text
边缘建筑轮廓泄漏
```

给 Art Pass。

---

# 二十四、普通 Marker Mask

法宝地点、site、leylines 等：

根据其世界坐标：

```text
inside / outside
```

决定显示。

但：

**Rift 是特殊情况。**

见 B4。

---

# 二十五、Selection Marker

视界打开以后：

不能继续显示一个含糊的凡间 SelectionMarker。

如果当前检视对象属于：

```text
mortal
```

只在 Mortal 可见区域显示。

如果属于：

```text
upper / nether
```

使用目标位面的只读反馈。

禁止：

点击幽冥鬼后出现凡间操作型选择环。

---

# 二十六、Target Stage 内容不要机械复制 Mortal profile

当前 Upper / Nether 只：

```text
Terrain + Entities
```

B1 只补已有模拟数据中确实存在、且可以只读映射的内容。

禁止为了填满 Layer：

新增：

```text
鬼城
仙城
幽冥宗门
上界政治
```

---

# 二十七、Nether 表现

可以考虑已有：

```text
veg
water
qi
artifacts
```

的只读表现。

但必须先读当前幽冥数据真实语义。

禁止：

```text
veg → 灰色树林
```

这种机械复用。

如果没有可靠语义：

先留空。

---

# 二十八、B1 性能纪律

每补一个 Layer：

单独记录：

```text
instance count
draw calls
triangles
CPU update
Region rebuild
first-open
repeat-open
```

禁止全部接完后才发现：

哪一层突然贵了十倍。

---

# 二十九、B1 验收场景

至少提供：

### A

无视界。

### B

Upper 小窗。

### C

Upper 大窗。

### D

Nether 小窗。

### E

Nether 大窗。

每个都必须确认：

```text
窗外 mortal terrain ✓
窗外 water ✓
窗外 vegetation ✓
窗外 settlement ✓
窗外 markers ✓
窗内无 mortal entity / settlement 泄漏 ✓
```

---

# 三十、B2 · Realm Boundary

新增：

```text
SkirtLayer
```

或：

```text
RealmBoundaryLayer
```

建议后者。

不要扩展：

```text
SlabPrototype
```

Slab 继续作为历史研究探针。

---

# 三十一、Boundary 的职责

RealmBoundaryLayer 只负责：

```text
当前 RealmView Region 的空间断面
```

它不是：

```text
rift manager
```

也不是：

```text
simulation seal
```

---

# 三十二、边界几何

每条 Region boundary edge：

生成一个 quad。

XZ：

完全来自共享世界格网节点。

凡间端：

来自 Mortal ElevationField。

目标界端：

来自 Target ElevationField 的最终 boundary elevation。

---

# 三十三、禁止墙体自身“悬空压缩”

墙上下端必须精确连接：

```text
Mortal edge
Target edge
```

不能把：

```text
真实高度差 40
```

单独绘成：

```text
高度 15 的墙
```

却不调整目标界边缘。

这样必然露缝。

---

# 三十四、垂直视觉试验

本阶段至少保留：

### Mode R · Raw

```text
datum = 0
relief = 1
shoulder = none
```

用于：

工程基线。

### Mode S · Strata

上界：

```text
+datum
```

幽冥：

```text
-datum
```

配合：

```text
relief
shoulder
```

形成：

```text
天柱 / 地井
```

的空间语言。

---

# 三十五、Strata 初始参数

只作为实验初值。

可以从：

```text
D ≈ 30
relief ≈ 0.6
Hmin ≈ 8
Hcap ≈ 26
shoulder K ≈ 5 cells
```

开始。

这些数字：

**不是正式常量。**

必须通过真实浏览器截图调整。

---

# 三十六、Strata 几何关系

设：

```text
M = mortal boundary elevation
T = datum + relief * target base elevation
sign = +1 upper / -1 nether
```

可使用类似：

```text
g = sign * (T - M)

H =
Hmin
+
Hcap * tanh(max(g,0) / Hcap)

R =
M + sign * H
```

边界目标位面的最终高度：

```text
R
```

内部逐渐恢复：

```text
T
```

---

# 三十七、Shoulder

只允许修改：

**目标位面的表现高度。**

凡间地形：

保持真实。

Region 边缘：

目标高度 = R。

距离边缘达到 K：

目标高度恢复 T。

中间使用：

```text
smoothstep
```

过渡。

---

# 三十八、Shoulder 距离

距离定义来自：

```text
RegionGeometry
```

不要每帧重新算。

只在：

```text
Region identity
datum preset
map dimensions
```

变化时更新。

---

# 三十九、重要：不要修改 world.height

Shoulder 是：

```text
ElevationField
```

里的表现映射。

禁止：

```js
targetWorld.height[i] = ...
```

---

# 四十、Abstract 模式

如果 Strata 画面证明：

```text
天柱 / 地井
```

过强或显得过于字面化，

允许实现一个非常小的 Abstract prototype：

- 两界边缘视觉对齐程度更高；
- 用墨、雾、虚空承担空间分层；
- 不强调“物理地下 / 天上”。

只作为比较截图。

不要同时发展三套正式系统。

---

# 四十一、B2 必须产出视觉裁决证据

同一 seed、同一区域、同一 Camera：

输出：

```text
Raw Upper
Strata Upper

Raw Nether
Strata Nether
```

至少：

```text
俯视
45°
低角度
```

三种 Camera。

---

# 四十二、Strata 选择标准

重点判断：

1. 是否一眼读出“另一界”；
2. 是否仍像同坐标区域；
3. 是否遮挡世界主体；
4. 边缘是否过高；
5. shoulder 是否像人工斜坡；
6. 山脉在边缘是否出现奇怪弯折；
7. 上界 / 幽冥是否具有不同方向感；
8. 是否符合低模沙盘，而不是大型峡谷。

---

# 四十三、不得因为数学数据直接宣布 Strata 为唯一正确答案

“上界”与“幽冥”是否需要映射到：

```text
物理 Y 轴上 / 下
```

属于视觉世界观选择。

工程报告必须明确：

```text
Raw 的问题
Strata 的优点
Strata 的代价
```

---

# 四十四、Boundary 材质

M2-B 只做：

**第一版程序化界缘视觉。**

建议：

```text
MeshLambertMaterial
+
onBeforeCompile
```

或者同复杂度方案。

禁止：

- EffectComposer；
- RenderTarget；
- WebGPU；
- TSL 大改；
- 大型 shader pipeline。

---

# 四十五、Boundary 三个视觉通道

### 几何

表达：

```text
空间方向
大概深度
```

### 墨色

表达：

```text
raw gap / visual depth
```

可以使用：

- 墨色浓淡；
- 分段皴纹；
- 留白；
- 云烟遮断。

### 方向

Upper：

顶部轻、向上亮。

Nether：

内部暗、向下沉。

但保持克制。

---

# 四十六、不要在 M2-B 做全局 Ink Shader

以下全部留到 Art Pass：

```text
全场 toon ramp
全场纸纹
全场 outline
全场皴法
SDF 连续 Mask
PNG 大规模接线
```

Boundary 自己可以先有局部水墨语言。

---

# 四十七、B2 视觉量命名

允许内部 debug：

```text
rawGap
visualDepth
datum
relief
boundaryDirection
```

不要正式命名：

```text
sealStrength
镇压值
```

---

# 四十八、B3 · 正式 3D 视界交互

M2-A 工具栏：

```text
上界 Mask
幽冥 Mask
```

只是 debug probe。

M2-B 必须建立真正的：

```text
3D 划窗
```

---

# 四十九、不要新建 commitSelection3D

正式路径必须复用：

```text
Sandbox.commitSelection(points)
```

因为那里已经负责：

- normalize Region；
- selection；
- target plane；
- openRifts；
- 通知；
- V7 语义。

---

# 五十、3D 划选的数据流

建议：

```text
选择“上界视界 / 幽冥视界”
        ↓
在 3D Mortal terrain 上拖动
        ↓
每个 pointer sample 做 mortal terrain raycast
        ↓
得到世界 x/y
        ↓
形成 world-space path
        ↓
pointerup
        ↓
Sandbox.commitSelection(path)
        ↓
RealmViewState
        ↓
Canvas / Three 共用
```

---

# 五十一、3D 划窗不使用屏幕 polygon 作为状态

屏幕鼠标轨迹只用于：

```text
采样
```

最终 Region：

必须由：

```text
world x/y
```

构成。

相机转动后 Region 不漂移。

---

# 五十二、3D 划选时只 raycast Mortal terrain

划窗发生在：

> 玩家所在的凡间。

所以开始/进行一笔新 Region 时：

不要因为鼠标当前穿过旧的目标界：

把 path 写到 Upper / Nether 坐标。

---

# 五十三、B3 暂不开放全部神力工具

Sonnet 已发现：

3D 模式下左侧神力栏目前 inert。

本阶段：

**不要求解决所有 Canvas 干预在 3D 中的交互。**

继续允许：

```text
rain
disaster
enlighten
...
```

在 3D 暂不可用。

M2-B 只补：

```text
视界正式划选
```

以及现有地形编辑正确性。

完整 3D 神力输入另立项。

---

# 五十四、调试按钮保留方式

M2-A：

```text
固定矩形 Mask
Slab 20×20
```

可以继续通过：

```text
debug flag
query parameter
```

保留。

但正式 UI 不应该把它们与玩家功能并列。

---

# 五十五、B4 · Rift 与 Boundary 的关系

这是本阶段必须钉死的语义。

```text
world.rifts
```

是：

**持久的世界对象。**

```text
RealmBoundary
```

是：

**当前视界 Region 的表现对象。**

两者不是同一个东西。

---

# 五十六、禁止“把 Rift 移到 BoundaryLayer”

错误结构：

```text
BoundaryLayer owns rifts
```

正确结构：

```text
World rifts
        ↓
WorldMarker / rift reader

Current RealmBoundary
        ↓
与 active rifts 求视觉交叠
        ↓
出现 breach
```

---

# 五十七、旧裂缝必须继续存在

例：

玩家先开 Region A。

产生裂缝 A1。

之后重新划 Region B。

A1：

依旧存在于：

```text
world.rifts
```

不能因为：

当前 boundary 已经变成 B

而被删除或视觉逻辑遗忘。

---

# 五十八、Boundary Breach

当 active rift：

空间范围与：

```text
current boundary
```

相交时，

BoundaryLayer 可以表现：

```text
裂口
```

宽度与：

```text
riftRadiusAt()
```

关联。

读取必须继续经过：

```text
render3d/readers/riftViewModel.js
```

禁止复制：

rift radius formula。

---

# 五十九、继承 Canvas 裂缝语言

参考已有：

```text
青色微光
呼吸描边
断续流动线
```

Three 不要新造：

```text
红色科幻激光裂缝
```

第一版保持视觉亲缘。

---

# 六十、Breach 只是一种表现

开口不能：

- 修改 rift；
- 修改 radius；
- 让 rift 延寿；
- 改概率；
- 改跨界结果。

---

# 六十一、B4 · Plane-aware Inspect

当前 PlanePicker 已支持：

```text
plane
entityId
world point
```

M2-B 扩展时：

保持：

```text
visible geometry wins
```

不改成：

Region 逻辑强制命中目标界。

---

# 六十二、Boundary Picking

允许 RealmBoundary 可被命中。

建议：

```js
{
  kind: 'realm-boundary',
  targetPlane,
  x,
  y,
  rawGap,
  visualDepth,
  nearbyRifts
}
```

这是表现读数。

---

# 六十三、Boundary Inspector

第一版只展示中性事实：

```text
上界界缘 / 幽冥界缘
此处界差
附近裂缝
裂缝状态
```

不要写：

```text
镇压强度
泄漏概率
鬼魂风险 -30%
```

因为这些机制尚不存在。

---

# 六十四、B4 · Three FX

继续：

```text
PresentationStage
→ snapshotPlane
```

读取。

禁止：

```text
drainRuntimeEvents()
```

---

# 六十五、跨界 FX

已有：

```text
depart
arrive
```

应该分别在：

源 Stage

目标 Stage

表现。

如果事件位置接近 Boundary Breach：

可以让 FX：

视觉上穿过破口。

但只做表现。

---

# 六十六、FX 第一版范围

只需要确保：

```text
rift-open
rift-cross depart
rift-cross arrive
major-death / ascension 等关键短命表现
```

中最适合三界视界的已有事件能够正确显示。

禁止趁机做完整粒子引擎。

---

# 六十七、性能刷新规则

可见 ≠ 更新 ≠ 驻留。

继续明确三者。

建议：

```text
Mortal outside
Target inside
```

两个 Stage 可见。

其它 Stage：

不提交绘制。

---

# 六十八、Bridge 更新

不要因为三 Stage 都驻留：

每帧强制扫描全部三界。

只更新当前需要保持新鲜的 Stage。

但：

切换或开窗时必须刷新到真实当前 world。

---

# 六十九、不要过早引入 PreloadManager

记录：

```text
first-open
repeat-open
```

如果首次 Upper / Nether 仍存在 shader/buffer stall：

报告。

不要自动建立复杂资源预热系统。

只有真实数据证明它是明显体验问题时再立项。

---

# 七十、测试 T0 · B0 identity

`ElevationField` 默认模式：

必须与 M2-A 高程一致。

随机：

```text
1000+ point
```

比较。

包括：

node

三角内部

边缘。

---

# 七十一、测试 T1 · RegionGeometry

覆盖：

- 矩形；
- 自由套索；
- 凹形；
- 贴地图边缘；
- 狭窄走廊；
- 单格颈；
- 棋盘度 4 接触。

断言：

```text
inside + outside = all quads
inside ∩ outside = ∅
boundary edge 不重复
boundary 不越界
```

---

# 七十二、测试 T2 · 完整 Mask

每个 Layer 单独测试：

```text
Mortal outside
Target inside
```

特别验证：

窗外：

Water / Vegetation / Settlement / Marker

不再全部消失。

---

# 七十三、测试 T3 · 同坐标与 Shoulder

同一 `(x,y)`：

XZ 必须完全一致。

只有 Y 允许由：

```text
ElevationField
```

变化。

Camera rotate / pan / zoom：

Region 与 Boundary 不能漂。

---

# 七十四、测试 T4 · 无缝界缘

至少：

```text
矩形
凹形
随机套索
高山边缘
低谷边缘
地图边界
```

检查：

- 墙下端 = mortal edge；
- 墙上端 = target edge；
- 零明显黑缝；
- 零 NaN；
- 零反面消失；
- 不因极端 gap 翻折。

---

# 七十五、测试 T5 · Picking

延续 M2-A browser pick suite。

至少：

```text
Upper 80+
Nether 80+
```

并新增：

Boundary sample。

要求：

```text
visible geometry === returned hit
```

---

# 七十六、测试 T6 · 3D commitSelection

从真实 3D pointer path：

提交视界。

验证：

```text
selection created once
openRifts called once
RealmViewState open
targetPlane correct
```

不得：

一笔拖动产生几十次 rift open。

---

# 七十七、测试 T7 · Rift persistence

开 Region A。

创建裂缝。

关闭 / 重画 Region B。

验证：

```text
A 的 rift 世界对象仍按原规则存在
```

只是不再与当前 Boundary 形成 breach 时：

不显示破口。

---

# 七十八、测试 T8 · Presentation 单消费者

继续断言：

```text
runtime event
↓
PresentationStage ingest exactly once
```

Canvas 与 Three：

只读同一 presentation state。

---

# 七十九、测试 T9 · Sculpt 派生量

如果 B0 审计确认需要 bugfix：

验证：

```text
3D sculpt
→ height
→ type / qi 等派生量保持 canonical
```

undo：

也恢复一致状态。

---

# 八十、测试 T10 · 模拟纯度

继续运行：

```text
600 日
```

至少比较：

### A

无 Render3D。

### B

Render3D Mortal。

### C

开 Upper RealmView。

### D

开 Nether RealmView。

### E

反复重画 RealmView。

如果没有真实玩家模拟操作：

最终 world digest 必须一致。

---

# 八十一、视觉测试矩阵

固定一个 seed。

保存：

```text
01 mortal
02 upper-small
03 upper-large
04 nether-small
05 nether-large

06 upper-oblique
07 nether-oblique

08 upper-low-angle
09 nether-low-angle

10 concave-region
11 map-edge-region

12 boundary-raw-upper
13 boundary-strata-upper
14 boundary-raw-nether
15 boundary-strata-nether

16 active-rift-breach
17 boundary-inspect
```

---

# 八十二、真实性能记录

如果有真实 GPU：

记录：

```text
GPU
WebGL
viewport
DPR
```

以及：

```text
closed
Upper small
Upper large
Nether small
Nether large
```

---

# 八十三、每种状态记录

```text
frame cadence
render submit
bridge scan
Region build
boundary build
terrain update
water update
vegetation update
entity update
settlement update
marker update
draw calls
triangles
instances
GPU memory
first-open
repeat-open
```

---

# 八十四、不要拿 Mask 减少的三角数当性能优化结论

如果某 Layer 尚未实现：

必须明确：

> 未提交该 Layer。

禁止写：

> M2-B 比 M1 快 40%。

除非比较的是功能等价场景。

---

# 八十五、性能结构要求

RegionGeometry：

只在 Region 改变时构建。

Boundary geometry：

只在：

```text
Region
Elevation profile
相关 height dirty
```

变化时重建必要部分。

禁止每帧重建全部 boundary geometry。

---

# 八十六、三角形纪律

Boundary：

每 edge：

约：

```text
2 triangles
```

规模应主要与：

```text
Region perimeter
```

相关。

如果 Boundary 变成：

```text
区域面积 × 大型网格
```

先检查设计是否走偏。

---

# 八十七、提交拆分

建议至少拆成：

### Commit 1

```text
refactor(render3d): centralize stage elevation
```

ElevationField。

---

### Commit 2

```text
refactor(render3d): derive shared region geometry
```

RegionGeometry。

---

### Commit 3

如确认现有 bug：

```text
fix(render3d): preserve terrain derived data after sculpt
```

必须独立。

---

### Commit 4

```text
feat(render3d): mask mortal world layers by realm region
```

Water / Vegetation / Settlement / Marker。

---

### Commit 5

```text
feat(render3d): add realm boundary skirt prototype
```

Skirt / Boundary。

---

### Commit 6

```text
feat(render3d): add staged realm elevation presentation
```

Raw / Strata。

---

### Commit 7

```text
feat(render3d): route 3d realm drawing through commitSelection
```

正式划窗。

---

### Commit 8

```text
feat(render3d): integrate boundary rifts and plane inspection
```

Breach + Inspect。

---

### Commit 9

```text
feat(render3d): integrate plane presentation fx
```

Three FX。

---

### Commit 10

```text
test(render3d): cover m2b realm window invariants
```

自动化。

---

### Commit 11

```text
docs(render3d): record m2b evidence and decisions
```

报告与文档。

不要把整个 M2-B 再压成一个 mega commit。

---

# 八十八、停止条件 S1

如果为了 ElevationField：

需要修改：

```text
world.height
```

停止。

ElevationField 是表现层。

---

# 八十九、停止条件 S2

如果为了 Boundary：

开始写：

```text
polygon triangulation system
mesh boolean
CSG
```

停止。

界缘只需要格网边。

---

# 九十、停止条件 S3

如果为了完整 Mask：

想引：

```text
RenderTarget
Stencil
第二个 Renderer
第二张 Canvas
```

停止。

当前路线优先继续：

```text
world-space geometry mask
```

---

# 九十一、停止条件 S4

如果为了“更漂亮”：

准备修改全局：

```text
visualElevation()
```

停止。

留给 Art Pass。

---

# 九十二、停止条件 S5

如果开始实现：

```text
镇压影响鬼概率
削山提高漏宝
qi 跨界渗流
```

停止。

这是未来 Gameplay 包。

---

# 九十三、停止条件 S6

如果 BoundaryLayer 开始拥有：

```text
world.rifts
```

停止。

Rift 属于 World。

Boundary 只读取相交结果。

---

# 九十四、停止条件 S7

如果要修改：

```text
LEAK_CHANCE
WRAITH_CLIMB
POSSESS
```

等概率：

停止。

M2-B 没有授权。

---

# 九十五、停止条件 S8

如果为了 Three FX：

再次：

```text
drainRuntimeEvents()
```

停止。

唯一消费者仍是 PresentationStage。

---

# 九十六、停止条件 S9

如果 3D 正式划窗：

绕开：

```text
Sandbox.commitSelection
```

自行调用：

```text
openRifts
```

停止。

输入入口必须保持单源。

---

# 九十七、停止条件 S10

如果某个高程 Layer：

因为“临时方便”继续自己：

```text
surfaceElevation(world,...)
```

而 ElevationField 已建立，

先修接口。

不要制造第二套高程真相。

---

# 九十八、本阶段明确不做

禁止：

- 镇 / 泄玩法；
- sealStrength；
- 裂缝概率调制；
- 灵气跨界渗流；
- 新三界生态；
- 鬼城；
- 仙官；
- 第四世界；
- D8-G UI；
- 全部神力的 3D 化；
- 多视界；
- 全图永久另一界模式；
- save schema 改造；
- planes.transfer 重构；
- ECS；
- BVH；
- terrain chunk；
- Worker；
- EffectComposer；
- Bloom；
- WebGPU；
- 大型 shader framework；
- 全局 toon pipeline；
- PNG 全量接线；
- 全局 visualElevation 重调。

---

# 九十九、M2-B 最终完成定义

只有以下全部满足，才允许宣布：

```text
M2-B 完成
```

### Architecture

- ElevationField 成为 Render3D 高程单源。
- RegionGeometry 成为 3D Region 派生单源。
- Host / Stage 架构保持 M2-A 边界。
- 没有新增 renderer/context。

### Full Mask

- 开窗后窗外凡间不再变秃。
- Terrain / Water / Vegetation / Settlement / Marker 等已有凡间内容正确遵守 Region。
- 窗内不会重新提交凡间人物 / 聚落。
- Target 内容按真实位面 profile 显示。

### Boundary

- 自由 Region 可生成界缘。
- 无明显几何裂口。
- 高差极端区域稳定。
- Raw 与 Strata 有真实截图比较。
- 最终视觉选择有报告理由。
- Boundary 几何只负责表现。

### Interaction

- 3D 可以真实拖动划窗。
- pointerup 只调用一次 commitSelection。
- 裂缝继续走 canonical openRifts。
- Camera 变化不会移动 Region。

### Rift

- 世界 Rift 生命周期完全不变。
- Rift 与当前 Boundary 相交时可形成视觉 breach。
- 旧 Region 的裂缝不会因重画窗口被删除。

### Inspection

- Plane-aware pick 正确。
- Boundary 可读。
- 跨界 inspect 仍只读。
- 不出现错误凡间操作入口。

### Presentation

- Three FX 只读 PresentationStage。
- 不增加 runtime event 消费者。
- FX 不影响模拟。

### Purity

- 600 日 digest 对照一致。
- Render3D / RealmView / Boundary 不抽模拟 RNG。
- 不改概率。
- 不改 save。

### Performance

- 完成真实 Layer 后重新记录 GPU 基线。
- first-open / repeat-open 分开。
- 没有 N entity = N draw call 回退。
- Boundary 成本与周长相关。

---

# 一百、工程报告

新增：

```text
Render3D M2-B 工程报告.md
```

必须回答：

## Q1

ElevationField 是否成功消除了高程口径散落？

## Q2

3D sculpt 与 canonical terrain 派生量是否一致？

如果原本不一致：

修了什么？

为什么属于 bugfix，而非玩法修改？

## Q3

完整 Layer Mask 后：

CPU / GPU 成本分别变化多少？

## Q4

RegionGeometry：

不同形状的：

```text
build time
boundary edge count
memory
```

是多少？

## Q5

Raw 与 Strata：

实际画面比较如何？

最终选择什么？

为什么？

## Q6

Shoulder：

是否出现：

```text
人工斜坡
山体弯折
遮挡过强
```

等问题？

## Q7

界缘是否真正解决：

```text
高差漏缝
空间归属不清
另一界看起来只是换色
```

三个问题？

## Q8

正式 3D 划窗是否完全复用：

```text
commitSelection
RealmViewState
openRifts
```

？

## Q9

Rift Breach：

是否只作为表现读取？

有没有任何生命周期 / 概率变化？

## Q10

M2-B 是否仍保持：

```text
simulation is truth
renderer is observation
```

？

---

# 一百零一、最终证据

交付时至少给用户：

1. Mortal 无窗截图；
2. Upper 完整窗截图；
3. Nether 完整窗截图；
4. 窗外有水 / 树 / 村落的证明图；
5. Raw / Strata 对照；
6. 45° Upper；
7. 45° Nether；
8. Low-angle 界缘；
9. 凹 Region；
10. 地图边缘 Region；
11. active rift breach；
12. plane inspect；
13. boundary inspect；
14. 3D 手绘 Region；
15. performance JSON；
16. browser pick JSON；
17. test results；
18. 最终架构图。

---

# 一百零二、完成后停止

M2-B 完成后：

**停止开发。**

不要自行进入：

```text
Art Pass
```

也不要自行进入：

```text
Gameplay G · 镇 / 泄
```

下一轮应根据：

- Raw / Strata 视觉结果；
- 完整 Mask 的实际性能；
- Boundary 体验；
- 已有 163 张美术素材；
- 玩家是否真的能读懂界缘；

再决定。

---

# 一百零三、为未来 Gameplay G 保留的设计记忆

以下只记录，不实现：

未来可以研究：

```text
玩家改变凡间高程
        ↓
计算独立的 simulation-derived seal potential
        ↓
影响幽冥 Rift 某些事件
```

例如：

```text
抬山
→ 镇

削山
→ 泄
```

但如果未来实现：

模拟量必须独立于：

```text
datum
relief
wall visual height
ink density
```

这些表现参数。

关系应是：

```text
simulation seal value
        ↓
presentation mapping
        ↓
墙厚 / 墨色 / 裂口视觉
```

而绝不是：

```text
画出来的墙有多高
        ↓
决定游戏概率
```

另外：

幽冥裂缝当前多条概率拥有固定独立 RNG 流，可以研究阈值调制。

上界裂缝存在条件式第二次 RNG 消费，因此：

**不得假设“只调概率阈值就一定不改变 RNG 流位置”。**

任何未来 Gameplay 包必须重新审计随机流。

---

# 一百零四、最终工作哲学

M2-A 解决的是：

> 三个世界怎样同时存在于一个 3D 架构里？

M2-B 要解决的是：

> 玩家怎样真正看见“世界之间有一层关系”？

不要把本阶段做成：

```text
更多 Mesh
更多 shader
更多特效
```

真正成功的状态是：

玩家只看一眼就理解：

```text
这是凡间。

我划开了这里。

这里仍然是同一个地方。

但下面 / 上面是另一界。

这道边缘不是 UI 框。

它是世界本身被揭开的断面。
```

做到这里，

M2-B 就完成了。