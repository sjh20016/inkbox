# 坐天观井 · Render3D M2-A 架构原型工程委托书

> 历史范围说明（2026-09-30）：本文保留对应阶段的原始委托 / 规划。已交付内容以工程报告为证，当前阶段以 ROADMAP / HANDOFF 为准；文内旧“下一阶段”、禁令和计数不能用作新的施工授权。

阶段代号：

**Render3D M2-A · Multi-Plane Architecture Prototype**

阶段性质：

**架构原型。**

**不是完整三界 3D。**

**不是美术升级。**

**不是 D8-G。**

**不是 Portal 特效阶段。**

本阶段只解决：

> 现有 Render3D 如何从“单一凡间 Renderer”升级为“一个渲染宿主可以管理多个位面 Stage”，同时保住现有三界模拟、视界语义、拾取、FX 和只读边界。

---

# 一、背景

当前项目已经完成：

- D6-2 三界生态 A-F；
- D6-3 跨界生态 A-E；
- D7 观察与表现层；
- D8 视界 2.0 A-F；
- Render3D M0；
- Render3D M1；
- Render3D M1.1D。

当前 Three.js 架构已经证明：

- 单个位面可以稳定渲染；
- 地形 / 水 / 植被 / 实体 / 聚落 / 世界标记均已模块化；
- 普通生灵通过 InstancedMesh 渲染；
- Render3D dirty 已拆成：
  - height
  - water
  - type
  - veg
- Renderer3D 自己持有观察快照；
- 模拟层没有 renderer dirty 字段；
- Canvas / Three 可以共享同一份真实世界；
- Three.js 运行时已迁入 `vendor/three/`；
- CI Fast / Heavy Gate 已建立。

当前关键限制：

`Renderer3D`

仍同时承担：

- WebGLRenderer；
- Scene；
- CameraRig；
- WorldRenderBridge；
- Terrain；
- Water；
- Vegetation；
- Entity；
- Settlement；
- Marker；
- Selection；
- 单 world 生命周期。

也就是说：

> “GPU 渲染宿主”和“一个位面的内容舞台”目前仍粘在一起。

M2-A 的第一目标就是拆开它们。

---

# 二、本阶段架构判断

本阶段默认采用以下方向进行原型验证：

```text
Render3DHost
│
├── WebGLRenderer
├── Scene
├── CameraRig
├── PlaneStage[mortal]
├── PlaneStage[upper]
├── PlaneStage[nether]
├── RealmViewState / RegionMask
└── Plane-aware Picking Router
```

注意：

这只是 M2-A 的结构方向。

**本阶段不提前裁决最终 3D 视界采用：**

- Mask；
- Slab；
- RenderTarget。

但 M2-A 必须保证未来三条路径都还能接上。

---

# 三、核心原则

## 原则 1：一个 WebGLRenderer

本阶段禁止：

- 三个位面三个 renderer；
- 三张 canvas 叠加；
- 三个 WebGL context。

只保留：

```text
1 × WebGLRenderer
```

---

## 原则 2：CameraRig 属于 Host，不属于位面

当前：

```js
new CameraRig(canvas, world, coordinates)
```

仍绑定一个 world。

M2-A 要让相机成为：

> “观察三界共同坐标系的相机”

而不是：

> “凡间相机”。

三界地图目前共享相同的：

- w
- h
- 世界格坐标语义

因此 CameraRig 应主要依赖：

```text
world dimensions
coordinates contract
```

而不是持有某个位面的完整 world。

---

## 原则 3：PlaneStage 负责一个 world

每一个 Stage 绑定一个具体 world。

例如：

```text
MortalStage.world = sandbox.world

UpperStage.world = sandbox.world.upper

NetherStage.world = sandbox.world.nether
```

Stage 内部可拥有：

- coordinates
- WorldRenderBridge
- TerrainLayer
- WaterLayer
- VegetationLayer
- EntityLayer
- SettlementLayer
- MarkerLayer

但是否启用某个 Layer，应由位面配置决定。

---

## 原则 4：Layer 尽量不知道 plane

禁止把代码改成：

```js
if (plane === 'mortal') ...
else if (plane === 'upper') ...
else if (plane === 'nether') ...
```

散落在所有 Layer。

目标是：

```text
PlaneStage
  ↓
RenderProfile
  ↓
决定这个位面有哪些 Layer
```

Layer 本身继续只处理：

> “一个 world 应该怎么画”。

---

## 原则 5：视界 Region 是世界空间状态

当前：

```text
selection.path
```

已经是：

```text
[x, y]
```

世界格坐标。

不要重新建立一套屏幕空间 Portal 区域系统。

M2-A 应复用并抽象现有：

- `selection.path`
- `regionContains`
- `pointInRegion`
- `x0/y0/x1/y1`
- `area`

建立：

```text
RealmViewState
```

或：

```text
RegionMask
```

---

# 四、最重要的现有事实

施工前必须明确理解以下事实。

## 4.1 视界不是纯视觉开关

当前：

```js
riftViewOpen()
```

结果会进入：

```js
advanceWorld(... {
  riftActive: this.riftViewOpen()
})
```

因此：

> “视界是否打开”会影响裂缝系统是否推进。

所以 M2-A 禁止出现：

```text
CanvasViewOpen
ThreeViewOpen
```

两套互不相干的状态。

必须存在一个唯一：

```text
RealmViewState
```

Canvas 和 Render3D 都读取它。

---

## 4.2 PresentationStage 已经是唯一事件消费者

当前：

```js
this.stage.ingestWorlds(world).update(dt);
```

发生在：

```text
Sandbox.update()
```

而不是 Canvas render。

之后才：

```js
if (this.render3d?.render(now)) return;
```

因此即使进入 3D：

三界 transient events 仍然已经被：

```text
PresentationStage
```

消费。

M2-A 禁止在 Render3D 中再次：

```js
drainRuntimeEvents()
```

否则会形成双消费者。

---

## 4.3 sculpt 是 Render3D 中唯一明确写世界的边界

当前：

```text
render3d/terrain/sculpt.js
```

会写：

```text
world.height
```

因此以后：

**inspect 可以 plane-aware。**

但：

**terrain write 必须显式限制在哪个位面。**

本阶段默认：

> 地形编辑仍只允许凡间。

禁止无意中允许：

```text
雕刻幽冥
雕刻上界
```

---

# 五、工程包 A1：建立 Render3DHost

新增建议：

```text
src/inkbox/render3d/Render3DHost.js
```

或者把现有：

```text
Renderer3D.js
```

重构成 Host。

命名自行选择，但最终职责必须明确。

Host 负责：

- `THREE.WebGLRenderer`
- 主 Scene
- CameraRig
- resize
- render loop
- PlaneStage 注册
- 当前 active plane
- RealmViewState 接线
- pick 路由
- debug aggregation
- dispose

Host 不负责：

- 解析实体；
- 生成建筑；
- 派生裂缝；
- 判断鬼阶；
- 模拟推进；
- 消费 runtime event。

---

# 六、工程包 A2：建立 PlaneStage

新增：

```text
src/inkbox/render3d/PlaneStage.js
```

建议接口：

```js
new PlaneStage({
  plane,
  world,
  profile,
  coordinates,
})
```

至少支持：

```text
plane
world
root
bridge
profile
visible
update()
setVisible()
setWorld()
dispose()
```

---

# 七、PlaneStage 不直接拥有 THREE.Scene

优先结构：

```js
stage.root = new THREE.Group();
```

然后：

```js
host.scene.add(stage.root);
```

而不是：

```js
stage.scene = new THREE.Scene();
```

理由：

这样未来既可以：

### A

三个 Stage 挂同一个 Scene 做 Mask。

也可以：

### C

只取一个 Stage 的部分内容做 Slab。

也可以：

### B

以后把某 Stage.root 放进独立 Scene 或 RT pass。

本阶段不要提前锁死。

---

# 八、工程包 A3：建立 PLANE_RENDER_PROFILE

新增建议：

```text
src/inkbox/render3d/PlaneRenderProfile.js
```

定义三界的表现组成。

第一版不要追求完整美术。

可以类似：

```js
mortal: {
  terrain: true,
  water: true,
  vegetation: 'mortal',
  entities: 'mortal',
  settlements: true,
  markers: true
}

upper: {
  terrain: true,
  water: false,
  vegetation: false,
  entities: 'upper',
  settlements: false,
  markers: false
}

nether: {
  terrain: true,
  water: false,
  vegetation: 'nether',
  entities: 'nether',
  settlements: false,
  markers: false
}
```

注意：

这只是**第一版技术 profile**。

禁止借本阶段：

- 设计完整上界云海；
- 设计幽冥建筑；
- 新增鬼城；
- 新增仙门经济；
- 新增美术资产。

---

# 九、Profile 应决定 Layer 组合

PlaneStage 初始化时：

```text
profile.terrain
profile.water
profile.vegetation
profile.entities
profile.settlements
profile.markers
```

决定挂哪些表现层。

不要让：

`TerrainMesh`

自己判断：

```js
if (world.plane === ...)
```

---

# 十、工程包 A4：解决 EntityLayer 的位面语义

当前 `EntityLayer` 面向：

- mortal humans
- cultivators
- beasts
- spirits
- mortal wraiths

上界和幽冥的 entity 语义不同。

本阶段禁止硬塞成：

```text
一份巨型 EntityLayer
```

可以采用：

```text
EntityLayer
UpperEntityLayer
NetherEntityLayer
```

或者：

```text
EntityLayer + derive strategy
```

例如：

```js
new EntityLayer({
  derive: deriveUpperEntities
})
```

两者均可。

优先选择：

**保持 Layer 渲染机制统一，派生函数按位面分离。**

---

# 十一、禁止按 ID 范围推断所属位面

例如禁止：

```js
if (entity.id > 100000) plane = 'nether'
```

对象属于哪个 Stage，只由：

```text
它当前在哪个 world/container 中
```

决定。

尤其：

```text
world.wraiths
```

属于凡间表现。

即使它的身份来源于幽冥，也不能因此被画进 NetherStage。

---

# 十二、工程包 A5：共享坐标系统

核验现有：

```text
coordinates.js
```

已经无模块级状态。

M2-A 应继续保持：

```js
createCoordinates(world)
```

纯函数 / 闭包风格。

如果三界尺寸完全相同：

可以由 Host 建一份共享 coordinates contract。

也可以每 Stage 各建一份。

两种都允许。

但必须增加断言：

```text
mortal.w === upper.w === nether.w
mortal.h === upper.h === nether.h
```

如果不一致：

禁止静默继续。

---

# 十三、工程包 A6：CameraRig 去 world 化

当前：

```js
CameraRig(canvas, world, coordinates)
```

会保存：

```js
this.world
```

并在：

```text
fit
resize
focusOn
```

使用。

M2-A 应把它改成：

```text
CameraRig(canvas, dimensions, coordinates)
```

或等价结构。

CameraRig 不应该知道：

```text
world.entities
world.upper
world.nether
world.rifts
```

---

# 十四、focusOn 的新接口

建议：

```js
focusOn(x, y, elevation)
```

或者：

```js
focusOn({
  x,
  y,
  surface
})
```

Host / Stage 决定：

当前聚焦目标位面的：

```text
surfaceElevation
```

CameraRig 只负责：

移动相机。

这样以后点击：

上界人物

幽冥鬼魂

凡间人物

都可以复用同一个 Rig。

---

# 十五、工程包 A7：Plane-aware Picking

当前：

```text
pick()
```

最终只返回：

```text
x
y
```

M2-A 改成：

```js
{
  plane,
  x,
  y,
  worldPoint,
  stage
}
```

至少：

```text
plane
x
y
```

必须存在。

---

# 十六、拾取规则

当前全屏普通 3D：

```text
mortal
```

优先。

未来视界开启后：

如果 pointer 命中 Region 内：

优先尝试：

```text
target plane
```

Region 外：

```text
mortal
```

M2-A 暂时不需要完成完整 3D 视界。

但 Picking API 必须已经支持：

```text
plane
```

否则后续 M2-B/M2-C 会再次重构。

---

# 十七、写操作必须 plane guard

所有地形修改工具：

```text
raise
lower
flatten
smooth
undo
```

必须显式确保：

```text
plane === 'mortal'
```

如果不是：

不调用：

```js
sculpt()
```

不得依靠：

“现在 UI 还不能点到幽冥”

这种偶然条件。

要求结构上阻止。

---

# 十八、工程包 A8：RealmViewState 抽离

当前：

```text
Sandbox.selection
toolId
VIEW_TOOL_PLANE
```

共同定义：

“当前视界”。

M2-A 不要求把整个 UI 重写。

但应建立一个渲染器无关的状态访问层。

例如：

```text
src/inkbox/ui/realmViewState.js
```

或者扩展现有：

```text
ui/realmView.js
```

提供：

```js
getRealmViewState({
  selection,
  toolId
})
```

返回：

```js
{
  open,
  targetPlane,
  region
}
```

---

# 十九、唯一视界状态

Canvas：

读取它。

Render3D：

读取它。

`riftViewOpen()`：

也应逐步改成读取它。

禁止继续维护：

```text
Canvas selection state
Render3D view state
```

两份。

---

# 二十、RegionMask

建立一个 renderer-independent 的：

```text
RegionMask
```

第一版可以只是：

```js
{
  path,
  x0,
  y0,
  x1,
  y1,
  area,

  contains(x, y)
}
```

不要求第一版就做：

GPU texture。

---

# 二十一、RegionMask 必须复用现有世界空间 path

不要把：

```text
selection.path
```

转换成屏幕多边形后保存。

它本来就是：

```text
world cell coordinates
```

这正是我们需要的。

---

# 二十二、工程包 A9：Presentation 单消费者边界

这是 M2-A 的高风险项。

当前：

```text
PresentationStage.ingestWorlds()
```

已经是：

三界 runtime event 的唯一消费口。

M2-A 禁止：

Render3DHost

PlaneStage

ThreeFxLayer

直接调用：

```text
drainRuntimeEvents()
```

---

# 二十三、3D FX 的正确接法

本阶段可以只搭 API。

建议：

```text
PresentationStage
    ↓
plane-aware presentation snapshot
    ↓
Canvas renderer
Three renderer
```

可以：

让现有 `PresentationStage.fx`

被 3D 只读。

或者增加：

```js
getPlaneFx(plane)
```

或者：

```js
snapshotPlane(plane)
```

但必须保证：

> event 只 ingest 一次。

---

# 二十四、M2-A 不要求完整 Three FX

只要求做一个：

```text
ThreeFxProbe
```

验证：

凡间事件

上界事件

幽冥事件

可以按 plane 正确读取。

可以只画：

```text
小环
```

或 debug marker。

禁止本阶段制作：

渡劫大特效

复杂裂隙

粒子系统

后处理。

---

# 二十五、工程包 A10：Render3DHost 生命周期

必须明确支持以下情况。

### 情况 A

新开世界。

旧三个 Stage 全部 dispose。

建立新 Stage。

### 情况 B

读档。

world 对象被替换。

三个 Stage 必须同步换 world。

### 情况 C

地图尺寸变化。

CameraRig：

重新 fit。

Stage：

全部重建必要 geometry。

### 情况 D

缺 upper / nether。

Stage 缺失允许正常运行。

禁止：

因为：

```text
world.nether === undefined
```

导致 Render3D 崩溃。

---

# 二十六、不要用 object identity 作为唯一 world epoch

当前：

```js
if (this.renderer.world !== world)
```

是 M1 足够用的。

M2-A 需要更稳健地考虑：

```text
mortal
upper
nether
dimensions
```

变化。

可以建立：

```text
WorldSetSnapshot
```

或者：

```text
WorldEpoch
```

但：

禁止因此修改存档 schema。

它属于渲染生命周期。

---

# 二十七、资源共享

M2-A 可以共享：

- geometry；
- material definition；
- color cache；
- shader program；
- static palette。

但不要为了“共享”提前建立：

复杂 ResourceManager。

第一版只需：

```text
PlaneStage 能正确 dispose
无重复创建明显的大型静态资源
```

---

# 二十八、工程包 A11：Render Profile 与语义边界

第一版只要求三界明显不同。

## Mortal

继续使用当前 M1 视觉。

## Upper

最低可行版本：

- terrain
- upper entities
- 一个极简位面 tint / palette 差异

不要求：

云海

宫殿

复杂仙门。

## Nether

最低可行版本：

- terrain
- nether entities
- 极简阴气 / palette 差异

不要求：

鬼城

冥河最终表现

高级雾效。

---

# 二十九、不要把 veg 在三界中解释成同一物

尤其注意：

凡间：

```text
veg ≈ vegetation
```

幽冥：

可能承载：

```text
阴气 / 荒芜 / 消散留痕
```

因此：

禁止直接：

```js
new VegetationLayer(nether)
```

然后画一堆灰树。

需要：

```text
profile.vegetation = false
```

或专门的：

```text
NetherGroundAtmosphereLayer
```

但后者可以留到 M2-B。

---

# 三十、工程包 A12：第一版多 Stage 原型

完成 Host / Stage 后，加入 debug 模式。

例如：

```text
?renderer=3d&plane=mortal
?renderer=3d&plane=upper
?renderer=3d&plane=nether
```

或者：

3D 工具栏加：

```text
凡间
上界
幽冥
```

三个临时 debug 按钮。

注意：

这不是最终 UI。

只是验证：

同一个 WebGLRenderer

同一个 CameraRig

可以：

```text
切换 Stage
```

---

# 三十一、Stage 切换不能重建 WebGLRenderer

切换：

mortal → upper → nether

必须：

```text
复用同一个 WebGLRenderer
复用同一个 Camera
```

允许：

```text
Stage 首次 lazy create
```

禁止：

每次切界：

```js
new THREE.WebGLRenderer()
```

---

# 三十二、Stage 切换不得改变模拟

测试：

同 seed。

运行：

```text
A：从不切 Stage
B：每隔 N 秒切 mortal/upper/nether
```

推进相同游戏日数。

最终：

```text
digest 完全一致
```

---

# 三十三、工程包 A13：Mask 原型

M2-A 需要做一个非常小的：

```text
3D Region Mask Prototype
```

目标不是交付最终视界。

只回答：

> 在同一个 Scene / Camera 里，能否把 Region 内显示目标 Stage，Region 外继续显示 MortalStage？

---

# 三十四、Mask 原型限制

只需要支持：

```text
Terrain
Entities
```

两类。

暂时不要求：

Water

Vegetation

Settlement

Marker

FX

完整拾取。

---

# 三十五、Mask 实现允许两种最低方案

### 方案 1

CPU 过滤目标 Stage：

实体只写 region 内。

### 方案 2

地形使用：

格 mask / texture / attribute / index filter

任选一个最低复杂度方案。

禁止：

为了原型直接上：

复杂 stencil portal。

---

# 三十六、Mask 原型必须验证同坐标

在：

```text
mortal
upper
nether
```

同一 `(x,y)` 放 debug marker。

相机：

至少测试：

```text
正俯
45°
低角斜视
不同 yaw
```

确认：

Region 不会随着 camera rotate 漂移。

---

# 三十七、工程包 A14：Slab 可行性探针

本阶段不做完整 Slab。

只做：

**非常小的 geometry probe。**

例如：

矩形 20×20 Region。

生成：

- target terrain patch；
- 四周侧壁。

验证：

```text
高度差是否容易出现裂缝
动态更新是否稳定
是否需要复杂 triangulation
```

---

# 三十八、不要支持自由凹多边形 Slab

M2-A Slab probe 只允许：

```text
矩形
```

或：

```text
非常简单凸区域
```

目的只是决定：

Slab 值不值得进入 M2-B。

不是本阶段做生产版本。

---

# 三十九、A 与 C 的裁决目标

M2-A 完成后必须回答：

### Mask

是否：

```text
简单
稳定
可正确拾取
视觉足够
```

### Slab

是否：

```text
视觉显著更好
且几何复杂度仍可控
```

如果 Slab 需要：

复杂 polygon triangulation

动态边界重建

大量 index patch

才能“不漏光”，

则先放弃。

---

# 四十、工程包 A15：Picking Prototype

Mask 开窗时验证：

### Region 外

返回：

```js
{ plane: 'mortal', ... }
```

### Region 内

优先返回：

```js
{ plane: targetPlane, ... }
```

---

# 四十一、可见即所拾

复用 M0 64 样本思路。

新增：

```text
Region 内 32 点
Region 外 32 点
边缘 16 点
```

验证：

玩家看到的位面

与：

pick 返回的 plane

一致。

不得出现：

> 看见幽冥鬼，点击却检视凡间人物。

---

# 四十二、工程包 A16：Inspect Prototype

本阶段只做：

```text
plane-aware inspect routing
```

不要重做 Inspector UI。

如果：

```text
plane === mortal
```

继续：

```js
sandbox.inspectAt(x, y)
```

如果：

```text
plane === upper / nether
```

复用已有：

```text
realmInspector
```

或者提供一个 adapter。

---

# 四十三、禁止复用凡间 selected

幽冥 / 上界点选：

不得把目标塞进：

```text
this.selected
```

如果它会导致：

凡间高亮环

关系图

记挂

人物操作

误触。

继续保持 D8-F 的：

> 跨界检视只读。

---

# 四十四、工程包 A17：Layer 顺序规范

新增一个轻量：

```text
RENDER_ORDER
```

例如：

```text
terrain
water
vegetation
settlement
entities
markers
selection
realm boundary
fx
debug
```

具体数值自行设计。

目标：

不再让每个模块随便：

```js
renderOrder = 5
renderOrder = 6
```

---

# 四十五、不要现在建立大型材质工厂

可以新增：

```text
shared/materials.js
```

但只在确实出现重复时。

禁止为了：

“未来可扩展”

先造：

20 层 MaterialManager。

---

# 四十六、工程包 A18：sim import 边界审计

当前整个：

```text
render3d/**
```

生产代码中，直接 import：

```text
sim/*
```

的主要已知入口是：

```text
WorldMarkerLayer.js
→ sim/rifts.js
→ riftRadiusAt / riftIsActive
```

M2-A 不要求立即彻底消灭。

但需要建立：

```text
RenderReadModel
```

或：

```text
render3d/readers/
```

的设计方向。

---

# 四十七、最低实施

至少新增一个：

```text
render3d/readers/riftViewModel.js
```

把：

```text
riftRadiusAt
riftIsActive
```

的读取收口进去。

Layer 从：

```text
reader
```

读。

不要让后续：

UpperLayer

NetherLayer

不断直接 import：

```text
sim/*
```

最后 Render3D 变成半个模拟层。

---

# 四十八、禁止复制 sim 公式

虽然要收口 import，

但不能为了：

“render3d 不 import sim”

就复制：

rift radius

ghost tier

river distance

之类公式。

唯一真相仍然在 sim。

ReadModel 只是只读桥。

---

# 四十九、测试包 T1：Host / Stage

新增建议：

```text
scripts/inkbox-render3d-m2a.mjs
```

至少断言：

### T1

Host 只有一个 WebGLRenderer。

### T2

可以注册：

```text
mortal
upper
nether
```

三个 Stage。

### T3

切 Stage 不 new 第二个 Renderer。

### T4

缺 upper / nether 不崩。

### T5

dispose 后：

Stage 全释放。

---

# 五十、测试包 T2：坐标一致性

至少：

### Case A

三界同 `(x,y)`：

```text
render XZ 相同
```

### Case B

不同高程：

```text
Y 不同
XZ 相同
```

这就是：

> 同坐标，不同世界地貌。

---

# 五十一、测试包 T3：纯度

参考现有 G8。

三种场景：

### A

仅 Canvas。

### B

Render3D 只看凡间。

### C

Render3D 在：

mortal → upper → nether

循环切换。

推进：

```text
600 游戏日
```

最终：

```text
关键世界 digest 完全一致
```

---

# 五十二、测试包 T4：视界状态唯一性

断言：

```text
Canvas
Render3D
riftActive
```

读取的是同一个：

```text
RealmViewState
```

或同一计算路径。

禁止三个地方分别判断：

```text
selection + toolId
```

---

# 五十三、测试包 T5：Runtime Event 单消费者

构造：

凡间

上界

幽冥

各一条 runtime event。

运行：

```text
PresentationStage.ingestWorlds()
```

然后：

Canvas FX view

Three FX view

都能读取同一份 presentation state。

同时断言：

再次：

```text
drainRuntimeEvents()
```

没有第二套消费逻辑存在。

---

# 五十四、测试包 T6：写边界

构造：

```text
pick plane = upper
```

然后尝试：

raise。

必须：

```text
world.upper.height 不变
world.height 不变
```

并且：

sculpt 未执行。

Nether 同样。

---

# 五十五、测试包 T7：Mask Prototype

至少验证：

```text
Region 内
Region 外
Region 边缘
```

位面显示正确。

以及：

```text
camera rotate
camera zoom
camera pan
```

之后 Region 仍然钉在世界坐标。

---

# 五十六、测试包 T8：Picking

Mask 模式下：

```text
可见位面 === pick.plane
```

要求：

边缘以现有 Region 判定为唯一真相。

禁止：

render 用一套 polygon

pick 用一套 bounding box。

---

# 五十七、性能探针

M2-A 不追求优化。

只记录：

### 关窗

MortalStage only。

### 小窗

约全图：

```text
3%～5%
```

### 中窗

约：

```text
20%
```

### 大窗

接近现有：

```text
VIEW_MAX_AREA_FRAC 40%
```

---

# 五十八、性能记录

记录：

```text
draw calls
triangles
CPU update
bridge scan
entity update
renderer memory
first-open frame time
repeat-open frame time
```

如果真实 GPU 可用：

记录 GPU 信息。

如果仍软件光栅：

明确标注。

---

# 五十九、首次开窗卡顿

特别记录：

```text
UpperStage 首次出现
NetherStage 首次出现
```

是否存在明显：

shader compile

buffer upload

stall。

如果有：

记录。

本阶段不要马上建立：

复杂 preload manager。

---

# 六十、真实 GPU 余量探针

如果有真实 GPU：

增加：

```text
render repeat ×1
×2
×3
×4
```

同一帧重复绘制，

找到：

60 FPS 或目标帧预算的拐点。

不要再仅凭：

```text
60.0 FPS
```

判断性能余量。

---

# 六十一、本阶段禁止事项

禁止：

- 完整三界美术；
- 上界云海最终版；
- 幽冥冥河最终版；
- Ghost shader；
- Bloom；
- EffectComposer；
- WebGPU；
- TSL；
- BVH；
- terrain chunk；
- worker；
- ECS；
- 物理引擎；
- shader rewrite；
- 完整 stencil portal；
- 多 renderer；
- 多 canvas；
- 第四世界；
- 新生态；
- 新跨界概率；
- D8-G UI；
- save schema 修改；
- `planes.transfer()`；
- `rifts.js` 大重构。

---

# 六十二、代码规模纪律

不要把：

```text
Renderer3D.js
```

改成一个新的巨型类。

M2-A 完成后：

Render3DHost

PlaneStage

RegionMask / RealmViewState

Picking Router

应各自职责明确。

如果：

Renderer3D / Host

开始超过约：

```text
300～400 行
```

先检查是否正在重新造 `main.js` 式巨类。

---

# 六十三、推荐文件结构

可以参考：

```text
src/inkbox/render3d/

  Render3DHost.js
  Render3DAdapter.js

  stage/
    PlaneStage.js
    PlaneRenderProfile.js

  view/
    RegionMask.js
    RealmView3DPrototype.js
    SlabPrototype.js

  picking/
    PlanePicker.js

  readers/
    riftViewModel.js

  terrain/
  water/
  vegetation/
  entities/
  settlements/
  markers/
```

允许调整。

不要为了符合目录表机械搬家。

---

# 六十四、提交拆分建议

### Commit 1

```text
refactor(render3d): split host and plane stage
```

只做：

Host / PlaneStage。

---

### Commit 2

```text
refactor(render3d): detach camera rig from mortal world
```

相机去 world 化。

---

### Commit 3

```text
feat(render3d): add plane render profiles
```

建立三界最小 Stage。

---

### Commit 4

```text
refactor(view): expose shared realm view state and region mask
```

视界唯一状态。

---

### Commit 5

```text
feat(render3d): add plane-aware picking
```

拾取。

---

### Commit 6

```text
refactor(presentation): expose single-consumer plane fx state
```

Presentation 接线。

---

### Commit 7

```text
prototype(render3d): add realm region mask experiment
```

Mask probe。

---

### Commit 8

```text
prototype(render3d): add minimal slab geometry probe
```

Slab probe。

---

### Commit 9

```text
test(render3d): cover m2a multi-plane invariants
```

测试。

---

### Commit 10

```text
docs: report render3d m2a architecture findings
```

报告。

---

# 六十五、停止条件

如果出现以下情况：

## Stop A

为了 PlaneStage 必须修改：

```text
world simulation
```

停止。

架构方向错了。

---

## Stop B

为了 Three FX 想再消费一次：

```text
runtime event queue
```

停止。

必须复用现有 PresentationStage。

---

## Stop C

为了视界想重新存一份屏幕 polygon。

停止。

现有世界空间 Region 已经足够。

---

## Stop D

为了幽冥表现开始写大量：

```text
if (plane === ...)
```

到 Layer。

停止。

应回到 RenderProfile / derive strategy。

---

## Stop E

Slab 原型开始需要：

复杂任意多边形 triangulation

动态 topology 大系统

才能继续。

停止 Slab。

保留 Mask 路线。

---

## Stop F

Mask 必须修改大量 Three 内部 shader 才能工作。

先寻找：

更简单的 geometry / DataTexture / alphaTest 路径。

---

## Stop G

为了多位面打开第二个 WebGLRenderer。

停止。

本阶段明确禁止。

---

# 六十六、M2-A 最终验收

只有以下全部成立，才可宣布完成。

## 架构

- WebGLRenderer 只有一个。
- CameraRig 只有一个。
- 三个位面可以各有 PlaneStage。
- PlaneStage 绑定一个 world。
- Layer 不普遍感知 plane。
- 位面差异集中在 RenderProfile / derive 层。

## 生命周期

- 新开世界正常。
- 读档正常。
- 缺 upper / nether 正常。
- 改地图尺寸正常重建。
- dispose 不泄漏。

## 视界

- Canvas 与 Three 读取同一个 RealmViewState。
- Region 使用世界格坐标。
- Camera rotate 不导致 Region 漂移。
- Mask prototype 能显示另一界同坐标内容。

## Picking

- `pick()` 返回 plane。
- Region 内外路由正确。
- inspect 可以 plane-aware。
- sculpt 明确只能作用凡间。

## Presentation

- runtime event 只 ingest 一次。
- Three 不直接 drain。
- 三界 FX 可以按 plane 被读取。

## 模拟纯度

- Stage 切换不影响 simulation digest。
- Render3D 开关不影响 simulation digest。
- Region 开窗的模拟副作用只来自既有 `riftViewOpen / openRifts` 语义。
- 不新增任何渲染层模拟规则。

## 性能

- 记录关窗 / 小窗 / 中窗 / 大窗。
- 记录首次开窗。
- 没有明显 N entity = N draw call 回退。
- 如果性能不佳，只记录瓶颈，不擅自上大型优化。

---

# 六十七、M2-A 工程报告

新增：

```text
Render3D M2-A 架构原型工程报告.md
```

必须回答以下问题。

## Q1

Host + PlaneStage 是否比当前：

```text
Renderer3D.setWorld()
```

模式更稳定？

## Q2

三个 Stage 同时存在的真实：

- CPU
- draw call
- triangle
- memory

成本分别是什么？

不要写：

“三倍性能”。

必须分开说明：

```text
resident
visible
updated
```

## Q3

Mask prototype 是否：

- 同坐标稳定；
- 相机旋转稳定；
- 边缘可接受；
- picking 正确；
- 性能可接受？

## Q4

Slab probe 是否表现明显优于 Mask？

以及：

它的 geometry 成本是否值得？

## Q5

未来 M2-B 应选择：

```text
Mask 主路径
Slab 主路径
Mask + Slab 混合
```

中的哪种继续原型？

注意：

这里可以给技术建议。

但：

**不要直接开始 M2-B。**

---

# 六十八、M2-A 完成后必须给用户看的证据

不要只写：

```text
已完成
```

必须提供：

### 1

三个位面 Stage debug 截图。

### 2

同坐标三界切换截图。

### 3

Mask 视界截图。

### 4

Slab probe 截图。

### 5

至少一张斜视角 Region 对齐截图。

### 6

performance JSON。

### 7

测试命令与实际结果。

### 8

最终架构图。

---

# 六十九、最终纪律

M2-A 的目标不是：

> “让三界看起来很震撼。”

而是：

> “让未来可以安全地把三界做得很震撼。”

如果本阶段结束时：

代码没有新增多少玩家可见内容，

但已经建立：

```text
一个 Renderer Host
三个 Plane Stage
一个 RealmViewState
一个 RegionMask
一个 Plane-aware Picker
一个 Presentation 事件源
```

并且：

Mask / Slab 两条路线都有真实原型数据，

那么 M2-A 就是成功。

---

# 七十、完成后停止

完成工程报告后停止施工。

不要自行进入：

```text
M2-B
```

下一阶段需要根据：

Mask 原型结果

Slab 原型结果

真实 GPU 数据

以及视觉截图

再决定。

**不要提前下注。**
