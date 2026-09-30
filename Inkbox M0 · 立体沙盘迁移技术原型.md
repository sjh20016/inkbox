# Inkbox M0 · 立体沙盘迁移技术原型

> 历史范围说明（2026-09-30）：本文保留对应阶段的原始委托 / 规划。已交付内容以工程报告为证，当前阶段以 ROADMAP / HANDOFF 为准；文内旧“下一阶段”、禁令和计数不能用作新的施工授权。

## 一、任务定位

当前项目《坐天观井 / Inkbox》已经完成 D7 观察与表现层基建，但尚未进入 D8。

本轮暂停原 D8“视界 2.0”开发，开启独立迁移技术阶段：

**M0 · 立体沙盘迁移技术原型**

本轮不是把游戏全面改造成 3D，也不是制作完整美术。

目标是验证：

> 能否在不重写现有模拟的前提下，把当前二维高度场世界渲染成可旋转、可缩放、可编辑的低模 3D 沙盘，并让现有 `world.height[] / water[] / type[] / veg[]` 继续作为唯一世界真相。

如果 M0 成功，后续再进入正式 Renderer Migration。

如果 M0 的性能、交互或画面方向不成立，应能直接放弃本分支，而不伤害现有 Canvas 主线。

---

# 二、最高级架构原则

必须始终遵守：

```text
Simulation 仍然是二维网格
Renderer 可以是三维
```

即：

```text
Inkbox World
├─ height[]
├─ water[]
├─ type[]
├─ veg[]
├─ qi[]
├─ entities[]
├─ factions[]
└─ 现有全部模拟状态

        ↓ 只读/明确编辑命令

WorldRenderBridge

        ↓

Three.js Renderer
```

绝对禁止形成：

```text
Three.js Mesh
    ↓
成为真实世界状态
    ↓
反向推导 world
```

正确关系永远是：

```text
world.height[]
    ↓
Terrain Mesh
```

玩家编辑地形：

```text
Mouse
↓
Raycast
↓
得到世界 x/y
↓
修改 world.height[]
↓
Renderer 同步受影响顶点
```

Mesh 是世界的表现，不是世界本身。

---

# 三、本轮依赖政策

允许项目第一次引入：

```text
three
```

作为专用渲染依赖。

不要因此把项目迁移到 React、Vue、Babylon、Unity 风格架构。

不要为了 Three.js 重写整个项目构建系统。

本轮默认只引入 `three`。

`three-mesh-bvh` 属于**条件依赖**：

只有在实际 profiling 证明原生 Three.js Raycaster 对最大地图形成明显交互瓶颈以后才允许引入。

不要因为参考项目使用 BVH 就提前增加复杂度。

特别注意：

不要照 three-mesh-bvh 的 sculpt demo 直接修改 Mesh 顶点作为权威状态。

Inkbox 已经拥有 `world.height[]`。

BVH 最多负责：

```text
高速 Raycast / 空间查询
```

而不是负责世界地形数据。

---

# 四、分支与安全策略

从当前迁移分支继续开独立工作分支，例如：

```text
feature/render3d-m0
```

不得删除旧 Canvas Renderer。

不得让 3D Renderer 成为默认路径。

建议以开发开关启用：

```text
?renderer=3d
```

或等价的开发模式开关。

默认仍使用现有 Renderer。

同一个世界必须能够：

```text
Canvas Renderer
或
3D Renderer
```

进行显示。

切换 Renderer 本身不得改变模拟。

---

# 五、P0 · 第一块硬骨头：建立 Render3D 模块边界

新建独立目录，例如：

```text
src/inkbox/render3d/
```

建议结构：

```text
render3d/
  Renderer3D.js
  WorldRenderBridge.js
  CameraRig.js
  coordinates.js

  terrain/
    TerrainMesh.js
    TerrainPicker.js
    VisualElevation.js

  water/
    WaterLayer.js

  vegetation/
    VegetationLayer.js

  debug/
    RenderDebug.js
```

名称可以调整，但职责必须保持清晰。

## main.js 边界

`main.js` 不允许知道：

```text
BufferGeometry
ShaderMaterial
WebGL buffer
BVH tree
InstancedMesh
GPU attribute layout
```

主程序只应该看到类似：

```js
renderer3d.setWorld(world)
renderer3d.update(dt)
renderer3d.render()
renderer3d.markTerrainDirty(region)
renderer3d.resize(...)
renderer3d.dispose()
```

禁止把一大批 Three.js 初始化和 Raycast 逻辑直接塞进 `main.js`。

### 验收

M0 完成后，`main.js` 不应因为 3D 迁移暴涨数百行。

---

# 六、P0 · 第二块硬骨头：坐标契约

必须先建立单一坐标转换真源。

建议：

```text
Inkbox x → Three X
Inkbox y → Three Z
视觉高度 → Three Y
```

推荐将世界中心平移到 Three.js 原点附近，例如：

```text
renderX = worldX - world.w / 2
renderZ = worldY - world.h / 2
```

具体实现可调整。

但必须集中在：

```text
coordinates.js
```

或等价模块。

至少提供：

```text
worldToRender(x, y, elevation)
renderToWorld(x, z)
cellToRender(x, y)
renderPointToCell(point)
```

禁止 Terrain、Raycast、人物、植被各写一套坐标换算。

## 测试

必须覆盖：

```text
四角
地图中心
小景
中堂
长卷
世界 → render → 世界往返
边界 clamp
```

误差不能导致邻格错位。

---

# 七、P0 · 第三块硬骨头：视觉高度系统

禁止修改 `world.height[]` 的意义。

现有：

```text
height ≈ 0..1
SEA_LEVEL = 0.3
```

继续保持。

新增纯表现函数：

```text
visualElevation(height)
```

或：

```text
elevationFor(world, index)
```

用于把模拟高程映射成更夸张的视觉高度。

第一版可以线性。

随后允许做轻微非线性，让高山比丘陵更明显。

例如概念：

```text
海床 → 明显下沉
海平面 → Y = 0
丘陵 → 小幅抬升
山地 → 明显抬升
高峰 → 强烈拔高
```

但不允许为了画面修改：

```text
SEA_LEVEL
气候阈值
植被阈值
雪线模拟判据
水文规则
```

视觉高度属于 Renderer。

模拟高度属于 World。

---

# 八、P0 · 第四块硬骨头：真实 Inkbox 高度场 → Terrain Mesh

不要生成一张独立测试噪声地图。

必须读取一个**真实 Inkbox World**。

使用：

```text
world.height[]
world.type[]
world.w
world.h
```

建立 Terrain Mesh。

第一版不要先做复杂 Chunk/LOD。

先验证一整张地图 Mesh 是否可行。

当前最大世界约：

```text
384 × 240
```

数量级足够先做整图技术验证。

## Mesh 要求

地形视觉目标：

```text
Low Poly
Flat Shading
有限色阶
清楚的大形
```

不是写实 PBR。

第一版优先使用：

```text
MeshStandardMaterial / MeshLambertMaterial
flatShading
vertex color / 简单 palette
```

不要先写复杂 Shader。

## 三角面

保持现有世界网格和视觉网格尽可能直接对应。

不要为了“低模”把 384×240 世界压缩成 64×40。

低模感首先来自：

```text
flat shading
有限色阶
低频纹理
```

而不是破坏坐标精度。

---

# 九、P0 · 第五块硬骨头：Orthographic 沙盘 Camera

默认使用：

```text
OrthographicCamera
```

不是 PerspectiveCamera。

设计目标：

> 世界仍然是一张地图，只是变成立体沙盘。

摄像机支持：

```text
360° yaw
有限 pitch
pan
zoom
fit world
focus point
```

建议限制：

```text
禁止 roll
禁止钻入地下
禁止翻到世界底部
pitch 保持在适合沙盘观察的范围
```

输入建议：

```text
左键：游戏 / 编辑
右键拖动：平移
滚轮：缩放
中键拖动 或 Alt+右键：旋转
Q/E：固定角度旋转
```

具体键位可结合现有 UI 调整。

但左键不能被 OrbitControls 长期霸占，因为左键是 Inkbox 最重要的游戏输入。

## Camera 2.0 兼容思想

D7 已有：

```text
focusOn
```

当前 Canvas Camera 不要求直接复用实现。

但新 CameraRig 必须保留同等上层能力：

```text
focusOn(x,y,...)
fit()
cancelFocus()
```

让未来记挂、人物跳转、事件镜头仍能调用统一语义。

---

# 十、P0 · 第六块硬骨头：Raycast → 精确世界格

这是本轮最高优先级之一。

流程：

```text
鼠标屏幕坐标
↓
Three Raycaster
↓
Terrain Mesh hit
↓
Three 世界坐标
↓
renderToWorld()
↓
Inkbox x/y
```

需要实现：

```text
hover cell
brush center
click inspect target
```

至少调试显示：

```text
当前 world x
当前 world y
当前 height
当前 terrain type
```

## 验收方式

人工检查至少：

```text
平原
陡坡
山顶
海岸
地图四角
旋转 0°
旋转约 90°
旋转约 180°
旋转约 270°
高俯视
低俯视
```

鼠标命中不得出现明显漂移。

这是决定新路线能不能继续的核心 Gate。

---

# 十一、P0 · 第七块硬骨头：3D 地形编辑必须反写 world.height[]

第一版至少实现：

```text
Raise
Lower
Flatten
Smooth
```

注意：

编辑目标必须是：

```text
world.height[]
```

不是：

```text
geometry.position
```

## 推荐编辑流程

```text
Raycast hit
↓
world x/y
↓
查找 brush radius 内网格格点
↓
计算 falloff
↓
修改 world.height[]
↓
通知 TerrainMesh 更新对应顶点
```

Raise：

```text
height += strength × falloff
```

Lower：

```text
height -= strength × falloff
```

Flatten：

鼠标按下时记录目标高度：

```text
targetHeight
```

之后：

```text
height = lerp(height, targetHeight, strength × falloff)
```

Smooth：

使用邻域高度均值作为目标。

必须 clamp 到现有合法高度区间。

## Brush

必须有可视化笔刷环。

笔刷应贴合地表。

鼠标连续拖动不能形成明显断点。

可以参考 sculpt demo 的连续 stroke 插值思想。

## 模拟纪律

编辑时可以：

```text
world.touch()
terrain dirty
```

但不得：

```text
偷偷抽 RNG
改变人口
推进日期
修改别的世界
```

---

# 十二、局部 Mesh 更新策略

第一版优先简单正确。

修改 `world.height[]` 后：

```text
只更新受影响 position attribute
```

不要每次笔刷都销毁并重建完整 Geometry。

如果 flat shading 路线不需要 CPU 全图重新计算 normals，则不要做无意义的全图 normal rebuild。

先 profiling。

只有出现明显性能问题，再引入：

```text
TerrainChunk
```

建议未来 chunk 尺寸：

```text
约 24～32 格
```

但 **M0 不以“必须完成 chunk”为验收条件**。

如果最大地图整 Mesh 已经流畅，先不要优化。

---

# 十三、P0 · 第八块硬骨头：双 Renderer 共存

必须能够验证：

```text
同样的 world
Canvas 能画
Three.js 也能画
```

3D Renderer 选择不得：

```text
改变 RNG
改变 world.day
改变实体行为
改变 save 数据
```

建议在暂停状态下：

1. 创建世界。
2. 记录核心状态摘要。
3. 让 3D Renderer update/render 多帧。
4. 再记录摘要。
5. 两者必须一致。

除非玩家主动使用 sculpt 工具，否则 Render3D 必须是纯观察者。

---

# 十四、P1 · 最小水体验证

只做最简单的水体。

不要开发写实水。

第一版目标：

```text
海面存在
能清楚看到岛屿高差
海床真实位于水面下方
```

可以先使用：

```text
简单平面 / 极简 Water Mesh
有限透明度
低饱和色
```

必须保持：

```text
world.height = 海床
world.water = 水
```

现有水文仍是真相。

不要复制 GitHub Demo 的独立 Water Simulation。

不要重新建立第二套水文。

湖泊、河流的复杂局部水面可以留到后续。

---

# 十五、P1 · 最小“像素低模”视觉验证

本轮不制作正式美术。

只验证：

> Low Poly 地形 + 像素环境能否协调。

第一版至少做到：

```text
flat shaded terrain
有限色阶
低饱和 palette
```

可以为不同 terrain type 使用明显但克制的色块。

不要追求现代 PBR。

不要引写实纹理包。

---

# 十六、P1 · 像素树林技术验证

读取：

```text
world.veg[]
```

以确定性方式派生树林。

不要消费模拟 RNG。

可以使用：

```text
hash(seed, cell)
```

决定：

```text
树的位置微偏移
树种
尺寸微差
翻转
```

第一版目标：

```text
约 3,000～10,000 棵树
```

具体数量根据地图和 veg 自适应。

树木建议采用：

```text
crossed billboard
```

即两张交叉 Plane。

使用临时程序生成像素树贴图亦可。

不要求正式素材。

纹理使用像素友好过滤：

```text
NearestFilter
```

透明树木优先：

```text
alphaTest
depthWrite
```

尽量避免大规模半透明 blending。

如果大量重复对象造成 draw call 压力，使用：

```text
InstancedMesh
```

或等价批处理。

## 验收

旋转 Camera 360°：

树林不能全部“纸片消失”。

远近关系和地形遮挡必须正确。

---

# 十七、性能观察

本轮不要为了数字提前过度优化。

但必须加入轻量 debug 数据：

```text
FPS
frame time
draw calls
triangles
terrain vertices
tree instances
raycast time（如可测）
terrain update time
```

可以使用：

```text
renderer.info
performance.now()
```

不要为了显示 FPS 再引一个第三方库。

至少分别记录：

```text
small
medium
large
```

三种地图结果。

报告真实测试环境和数据。

不要编造“60 FPS”。

---

# 十八、three-mesh-bvh 引入条件

只有满足以下情况之一，才允许添加：

```text
three-mesh-bvh
```

例如：

```text
最大地图 hover raycast 明显卡顿
连续 sculpt 时 Raycast 成为主要 CPU 瓶颈
profiling 明确表明 mesh intersection 成本过高
```

如果加入：

只用来提升：

```text
Raycast
spatial query
```

不要把它的 sculpt 数据模型搬进 Inkbox。

Inkbox sculpt 的权威修改对象仍然是：

```text
world.height[]
```

---

# 十九、禁止事项

本轮禁止：

## 不做真正 3D Simulation

不要给人物新增自由：

```text
z / y altitude
```

不要建立三维寻路。

不要做：

```text
飞行高度模拟
多层 NavMesh
XYZ 战争
XYZ 宗门领地
```

人物仍然只有世界：

```text
x/y
```

渲染高度从地形派生。

---

## 不做浮空岛

浮空岛是后续阶段。

M0 只证明 Ground Surface。

---

## 不做 D8 视界

不要实现：

```text
3D 上界窗口
3D 幽冥窗口
Stencil Realm View
RenderTarget Realm View
```

这些等 Renderer 稳定后再做。

---

## 不迁人物系统

不要迁完整：

```text
人物
宗门
战争
裂隙
FX
```

本轮像素树足够证明 billboard pipeline。

---

## 不做复杂水

不要实现：

```text
反射
折射
SSR
真实波浪
水下 caustics
动态海洋模拟
```

---

## 不做完整像素美术

只做风格技术验证。

---

## 不重构 World

禁止借迁移之机重写：

```text
World
Life
advance
save
three-realms
war
cultivation
rifts
```

---

## 不删除 Canvas Renderer

必须保留回退路径。

---

## 不大规模重写 main.js

如果发现集成需要大量代码，应增加 Adapter / Bridge，而不是继续扩大 Sandbox/Main 巨类。

---

# 二十、需要重点回归的旧系统

虽然 M0 不应修改这些系统，但最终必须跑旧测试确认没有被迁移污染。

至少：

```text
npm test
npm run test:regression
npm run test:three-realms
npm run test:save-equivalence
npm run test:presentation
```

如当前项目实际 script 名有所变化，以 package.json 最新定义为准。

完成候选还应执行现有：

```text
simulation
browser/playtest
build
```

若 Browser 测试因为新 Renderer 入口产生变化：

旧 Canvas 默认路径必须继续通过。

不能为了让 M0 通过而删除旧 browser assertions。

---

# 二十一、新增 M0 测试

建议增加一个小型测试：

```text
scripts/inkbox-render3d.mjs
```

不要再制造几百 KB 超级 smoke。

主要测试纯逻辑：

### R3D-1 · Coordinate contract

世界与 Render 坐标往返。

### R3D-2 · Visual elevation

SEA_LEVEL 对应正确基准高度。

视觉函数不修改原始 height。

### R3D-3 · Terrain edit

Raise / Lower / Flatten / Smooth：

```text
只改半径范围
不出界
没有 NaN
不修改 water/type/entities
```

### R3D-4 · Determinism

相同输入得到相同 height 编辑结果。

### R3D-5 · Render purity

未执行编辑命令时：

```text
Renderer 不写 world
不推进时间
不消费 simulation RNG
```

### R3D-6 · Vegetation derivation

同：

```text
seed + veg
```

必须生成完全相同的视觉植被分布。

---

# 二十二、M0 成功 Gate

M0 只有同时满足以下条件才算值得进入正式迁移：

## Gate A · 世界复用成立

真实 Inkbox 世界能直接生成 3D Terrain。

不是另造一份测试世界。

---

## Gate B · Camera 成立

Orthographic Camera 可以：

```text
旋转
平移
缩放
fit
focus
```

而且世界仍然具有清晰的“沙盘地图感”。

---

## Gate C · Picking 成立

Camera 在多个角度下：

```text
鼠标 → 世界格
```

准确可靠。

---

## Gate D · Editing 成立

玩家能直接在 3D 地表：

```text
抬山
压地
平整
平滑
```

而真正被修改的是：

```text
world.height[]
```

---

## Gate E · Legacy 安全

选择 3D Renderer 不改变：

```text
世界演化
RNG
存档
三界生态
```

---

## Gate F · 视觉方向成立

至少看到：

```text
低模高差
海面/海床
像素树林
```

同时存在时没有严重画风冲突。

---

## Gate G · 性能没有结构性失败

在当前开发机上：

```text
medium 地图
large 地图
```

至少达到可交互状态。

如果存在瓶颈，报告必须能明确归因于：

```text
mesh
raycast
vegetation
water
draw calls
```

中的哪一项。

---

# 二十三、完成本轮以后不要继续扩需求

当以上 Gate 完成：

停止。

不要顺手开始：

```text
建筑
人物
宗门
浮空岛
三界
渡劫
D8
```

先提交 M0 技术报告。

---

# 二十四、最终交付物

必须输出：

## 1. 可运行 M0

真实 Inkbox 世界的 3D Renderer 模式。

## 2. 保留旧 Renderer

原有 Canvas 路径仍可用。

## 3. 技术报告

建议：

```text
RENDER3D_M0.md
```

至少说明：

```text
采用的架构
Three.js 版本
是否使用 BVH
世界 ↔ Render 坐标契约
视觉高度算法
Terrain Mesh 结构
Raycast 方案
Sculpt 方案
水体方案
植被方案
性能实测
现有系统改动列表
已知问题
后续迁移建议
```

## 4. 测试结果

列出所有实际执行命令和结果。

不要只写：

```text
tests passed
```

## 5. Git 提交

优先拆成逻辑提交，例如：

```text
feat(render3d): establish 3d renderer and coordinate bridge
feat(render3d): add orthographic camera and terrain picking
feat(render3d): add heightfield sculpting
feat(render3d): add water and pixel vegetation proof
test(render3d): add migration invariants
docs(render3d): document M0 findings
```

无需死守这些名称，但不要一个巨大提交吞掉全部工作。

---

# 二十五、参考项目

施工前重点研究以下项目，但不要整项目复制：

```text
Ren23447/3D-terrain-editor
```

重点看：

```text
Three.js 编辑器最小实现
Orbit camera
Raise / Lower / Flatten
对象与地形交互
```

```text
gkjohnson/three-mesh-bvh
```

重点看：

```text
accelerated raycast
sculpt example
连续笔刷采样
局部 refit
```

但 Inkbox 不照抄其“Mesh 顶点是雕刻真相”的模型。

```text
IceCreamYou/THREE.Terrain
```

重点看：

```text
height field → Three mesh
sculpt controller
heightmap 操作
terrain helpers
vegetation / instancing 思路
```

不要将它作为 Inkbox 的新 world generator。

```text
ZyFou/ProceduralTerrains
```

重点看：

```text
terrain engine 与 UI 分离
tile/chunk
LOD
paint architecture
water architecture
performance instrumentation
```

它远比 M0 复杂，只用于长期架构参考。

---

# 二十六、开发判断原则

遇到复杂选择时，按以下优先级：

```text
保护现有模拟
>
保持坐标单源
>
确保编辑准确
>
保证 Renderer 可替换
>
性能优化
>
视觉美化
```

出现冲突时宁可：

```text
画面暂时朴素
```

也不要：

```text
为了视觉效果破坏 world 数据语义
```

---

# 最终验收一句话

本轮成功标准不是：

> “做出了一个漂亮的 Three.js Demo。”

而是：

> **“同一个 Inkbox 世界不改变任何模拟规则，就能变成一个可以旋转、观察、准确拾取和直接塑造山河的低模像素沙盘。”**

如果这一句成立，M0 才成功。
