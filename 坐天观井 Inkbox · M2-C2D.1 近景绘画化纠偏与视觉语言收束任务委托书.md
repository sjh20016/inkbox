

# 《坐天观井 Inkbox · M2-C2D.1 近景绘画化纠偏与视觉语言收束任务委托书》

## 0. 任务定位

任务代号：

`M2-C2D.1 · Painterly Reconciliation`

建议分支：

`m2-c2d1-painterly-reconciliation`

基线来源：

当前 `m2-c2d-nearfield-painterly`

当前参考 HEAD：

`ef8b43df91c8dff6f01e241301d3d40a4e724d84`

原始 main 基线：

`8b3f2bac761b59bf70f524ff9a00429fa40cc07a`

本阶段不是推翻 C2D，也不是新一轮大规模美术系统建设。

核心任务只有一句：

> **保留 C2D 已经证明有效的工程基础，撤回视觉上过度加工或逻辑错误的部分，把“远景有画意、近景像世界”重新统一起来。**

目前 C2D 工程验收可认为成立，但**人工美术门禁未通过**。

因此：

**任何现有 PASS、Golden、metric 结论都只能视为工程证据，不能视为美术封板。**

---

# 1. 本轮必须接受的现状判断

开始修改之前，请实际阅读并确认：

`M2C2D_BASELINE.md`  
`M2C2D_VISUAL_ACCEPTANCE.md`  
`M2C2D_PERFORMANCE_REPORT.md`  
`M2C2D_READINESS.md`

重点源码：

```text
src/inkbox/render3d/art/PigmentTerrainMaterial.js
src/inkbox/render3d/art/SurfaceVisualFieldTexture.js
src/inkbox/render3d/art/RealmStyleProfile.js
src/inkbox/render3d/art/ArtPass.js

src/inkbox/render3d/water/WaterLayer.js
src/inkbox/render3d/water/WaterPigmentMaterial.js

src/inkbox/render3d/boundary/RealmBoundaryLayer.js
src/inkbox/render3d/boundary/BoundaryInkMaterial.js

src/inkbox/render3d/terrain/TerrainMesh.js
src/inkbox/render3d/art/TerrainDataTextures.js

scripts/inkbox-render3d-m2c2d-browser.mjs
scripts/inkbox-render3d-m2c2d-metrics.mjs
```

必须先确认下面这些判断：

| 项目 | 当前结论 |
|---|---|
| SurfaceVisualField 架构 | 保留 |
| Water Shader 独立化 | 保留 |
| Boundary Shader 独立化 | 保留 |
| dirty / Region / World purity | 保留 |
| `VisualElevation()` | 冻结 |
| terrain type NearestFilter | 冻结 |
| C2D 当前 tone 参数 | **重新审视，不视为正确** |
| 当前 coastSoft 算法 | **有逻辑问题，必须修** |
| 当前 broad normal | **并未真正低频化，必须重做** |
| 当前 Boundary 视觉结果 | **未过人工审美门禁** |
| 当前 metrics gate | **只能证明“不灾难”，不能证明“好看”** |

---

# 2. 硬性原则

本阶段禁止扩大到模拟层。

不得修改：

- World 数据结构
- RNG
- 存档
- 世界推进
- 地形真实 height
- `VisualElevation.js`
- RegionGeometry
- Picking identity
- C2C Meaningful Geography 的世界语义
- 已有角色 / 建筑 / 植被正式资产结构

不得新增：

- EffectComposer
- SSAO
- Bloom
- Kuwahara
- 全屏 watercolor filter
- 新 RenderTarget
- 新后处理框架
- 新第三方 runtime dependency

本阶段允许新增的东西主要只能是：

- shader 内的小型采样与视觉函数；
- Art debug / A-B 开关；
- 必要的自动视觉诊断；
- RealmStyle 参数微调；
- 极少量 shader uniform。

本轮的原则是：

> **删耦合、减效果、统一层级，不是继续加功能。**

---

# 3. Package A：建立真正可用的视觉拆解模式

这是 Sol 6.1 第一件事。

当前最大问题是 terrain shader 中多层效果叠在一起，很难判断画面到底是谁造成的。

请给 Art Pass 增加**仅开发环境使用**的视觉拆解模式。

不进入玩家 UI，不写 World，不影响存档。

建议支持：

```text
?artDebug=base
?artDebug=coast
?artDebug=mass
?artDebug=structure
?artDebug=atmosphere
?artDebug=final
```

或者使用等价内部接口。

必须能独立查看：

1. 基础 pigment / terrain palette
2. water + coast field
3. broad mass shading
4. high-frequency structural ink
5. atmosphere / paper wash
6. final composite

目的不是方便以后“调更多参数”，而是防止再次出现：

> 一个结果不好看，却不知道是 coast、mass、structure 还是 atmosphere 在作怪。

### 验收

相同 World、相同 Camera 下可以输出上述 debug 视图。

所有 debug 模式：

- World SHA 不变；
- draw 不增加；
- 关闭 debug 后正式结果与正常 final 完全一致。

---

# 4. Package B：修复错误的 Coast Mask

这是本轮第一个真正的视觉修复。

当前：

```glsl
coastSoft = 1.0 - smoothstep(..., wd);
```

导致：

`wd == 0`

的普通内陆也被当成 coastline。

这必须彻底修正。

## B1. Coast 的正确语义

Coast 不等于：

```text
waterDepth 接近 0
```

而应该接近：

```text
水深场在局部发生 wet ↔ dry 过渡
```

也就是**水陆交界带**。

推荐方案一：

在 shader 采样中心与四邻域的 water depth：

```text
center
left
right
up
down
```

构造：

```text
wetness
neighbourWetness
waterGradient
```

然后：

```text
dry-side coast =
    center 基本为 dry
    且邻域至少存在 wet

wet-side coast =
    center 为浅水
    且邻域存在 dry

coastMask =
    drySide + wetSide
```

也可以直接基于：

```text
length(grad waterDepth)
```

形成连续 coastline。

## B2. 禁止条件

以下区域必须保证：

```text
远离水域的普通山地 coastMask ≈ 0
普通平原 coastMask ≈ 0
村落中央 coastMask ≈ 0
```

只有：

```text
河岸
湖岸
海岸
湿地边缘
```

可以明显出现。

## B3. Terrain 烘染

当前：

```glsl
color = mix(..., coastSoft * 0.20)
```

强度偏大。

修正后先从：

```text
0.04～0.10
```

区间起步。

要求：

岸线可以被感觉到，但不应该让玩家直接看见“一条 shader 效果带”。

### 验收镜头

重点：

- 01 mortal overview
- 02 mortal coast near
- 03 mortal cliff near
- 04 mortal settlement near

尤其要求：

**03 山体和 04 村落远离水面的区域不得再被花青 / 纸色 coast wash 污染。**

---

# 5. Package C：重做真正的“绘画低频法线”

这是本轮技术核心。

当前所谓 broad normal 依旧通过带 `floor()` 的 `hAt()` 读取离散 texel，因此只是：

> 更大格距的 nearest finite difference

不是连续低频场。

## C1. Height Sampling 必须拆成两套

现有：

```glsl
hAt()
```

继续承担精确格点语义。

新增一套真正的视觉采样：

```text
sampleHeightContinuous()
sampleHeightBroad()
```

不得改变 typeTexture。

### 推荐实现

在 shader 内手写 bilinear：

1. 取得浮点格坐标；
2. floor 得四个 texel；
3. 分别通过现有精确 height texture 读取；
4. `mix(mix())` 手动双线性。

不要修改整个 `heightTexture` 的 filter mode，避免影响现有精确高程契约。

即：

```text
精确高程：
nearest / texel semantics

绘画高程：
manual bilinear
```

## C2. Broad field 不能只“采得更远”

推荐：

```text
broadRadius ≈ 2～4 cells
```

但每个 broad sample 本身是连续 bilinear。

如果性能允许，可以取 cross 5 tap：

```text
center
left
right
up
down
```

不要立刻做 9/16 tap 高斯。

## C3. 大山势不得重新依赖高频 slope

当前：

```glsl
massMask = smoothstep(... slope + broad slope ...)
```

需要拆开。

定义：

```text
broadSlope
fineSlope
```

### 大山势：

只依赖：

```text
broadNormal
broadSlope
height
```

### 小笔触：

依赖：

```text
fineSlope
curvature
dry noise
structural ink
```

禁止：

```text
fineSlope 大比例控制 mass shading
```

否则又会出现格子色块。

---

# 6. Package D：重新建立“三层山体语言”

这一包不是增加特效，而是重新规定每层职责。

Terrain 应明确拆成：

### 第一层：Mass

回答：

> 这座山的大体积朝哪边受光？

特征：

- 非常低频；
- 面积大；
- 对比柔；
- 只决定山势。

不得出现：

格子、碎斑、密集纹理。

### 第二层：Structure

回答：

> 山脊、沟谷、坡折在哪里？

特征：

- 稀疏；
- 有方向；
- 比 Mass 更深；
- 占画面面积小。

建议 `deepInkStrength` 主要作用在 Structure，而不是全局暗部。

### 第三层：Brush

回答：

> 这张画的“笔”在哪里？

特征：

- 干笔；
- 飞白；
- 局部纹理；
- 世界坐标锚定。

Brush 绝不能承担山体大明暗。

---

# 7. Package E：恢复凡间的色彩层级

C2D 当前 Mortal：

```text
contrast = 1.14
massShade = 0.56
deepInk = 0.58
```

这个组合过强。

请不要直接调出一个新的“最佳数字”。

先做一次消融实验。

至少生成：

```text
E0 = C2D 当前
E1 = main tone + 新 coast
E2 = main tone + 新 coast + 新 broad mass
E3 = E2 + structural deep ink
E4 = 最终 candidate
```

固定相机截图对比。

推荐最终方向：

- `massShade` 显著弱于现在；
- `deepInk` 保留，但只服务结构；
- `contrast` 尽量回落接近 main；
- Mortal 不追求强烈黑白对比；
- 允许建筑屋顶与人物成为近景真正的深色锚点。

非常重要：

> 地形不能和建筑争“最黑”。

凡间中景/近景应该形成：

```text
纸与水     最轻
平原/林地  中轻
山体       中灰
结构皴     少量重墨
瓦、人、异常物  最深的小面积锚点
```

现在 C2D 有些镜头把山体本身压得太重。

---

# 8. Package F：重新设计 Water 的“留白但可读”

Water Shader 架构保留，但视觉策略需要修。

目标不是：

“把水画得更透明。”

而是：

> **让水成为负形。**

## F1. 水的三个信息源

水必须至少依靠：

1. 主体纸色；
2. 岸边一圈非常淡的花青 / 烘染；
3. 稀疏但方向明确的水纹。

因此深水颜色不能再淡到与背景纸完全失去区分。

推荐调整：

```text
deep water:
paper → 花青混合系数约 0.20～0.35

alpha:
浅水较轻
深水保持足够大形
```

不要让最终 composited color 和背景只差几个 RGB。

## F2. Ripple

当前 noise ripple 方向性不足。

建议改为具有“横向水纹”感觉的 world-space pattern。

不必真的模拟波。

可以用：

```text
world x/z
+ low frequency warp
+ sparse threshold
```

形成长而断续的横线。

要求：

- 远景几乎消失；
- 中景若隐若现；
- 近景帮助确认“这里是水”。

## F3. 暂不动水几何

本轮不调整水网格拓扑和分辨率。

如果 shader 修正后仍发现 shoreline triangle geometry 明显穿帮，记录进：

`M2C2D1_FOLLOWUPS.md`

不要扩大当前范围。

---

# 9. Package G：Boundary 改成“消失的断面”，不是“更漂亮的墙”

这是本轮第二个美术核心。

当前 BoundaryInkMaterial 的工程设计可以保留。

但视觉原则必须反过来：

> **Boundary 的目标不是让断面成为主角，而是让断面尽量退后，只留下“世界被揭开”的证据。**

## G1. 大面积基底

Upper：

大面积向：

```text
paper / atmosphere
```

退。

不要使用大片黄褐实体填充。

允许：

```text
极淡石青
极淡赭石
少量泥金边
```

但都必须是次级信息。

Nether：

不能再形成连续深黑横带。

基底用：

```text
磁青灰
焦墨灰
冷灰
```

只有极少数骨线进入真正深墨。

## G2. 顶缘必须成为主信息

Boundary 视觉主信息优先级：

```text
1. 顶部裂开的缘
2. 局部纵向层理
3. 底部消失
4. 大面积面色
```

现在顺序接近反的。

### 顶缘建议

可以强化：

```text
窄纸纤维边
极弱矿物亮边
轻微墨断续
```

但不要 glow。

## G3. Bottom Fade

当前 bottom fade 只是在颜色层面混 atmosphere。

应改为：

```text
颜色 + alpha
```

共同消隐。

允许 Boundary 本身保持 transparent。

底部应该真正“融掉”，而不是只是从深灰变成浅灰。

注意仍需保持 depth / overlap 可控，不允许穿帮。

## G4. Nether

重点降低：

```text
continuous dark area
```

而提高：

```text
bone line readability
```

目标不是减少黑色总量，而是：

**把黑色从面变成线和裂痕。**

---

# 10. Package H：顺便补齐三界的“视觉角色分工”

这一部分属于你说的“顺便处理相关内容”，但限定为参数/Shader 层，不扩大到新资产。

## Mortal

关键词：

```text
水墨淡彩
烟火
空气
纸白
```

不能：

```text
全灰
全淡
全青
```

允许村落成为最有色彩的信息区域。

## Upper

目前 05 的方向是值得保留的。

这次不要大改。

只处理：

- 减少细碎蓝绿噪点；
- 高 qi 区域更澄明；
- 山体 Mass 更统一；
- 泥金只做小面积结构强调。

目标：

```text
敦煌矿物色 + 云白
```

而不是：

```text
高饱和青绿山水
```

## Nether

核心：

```text
深而不黑
冷而不脏
骨线比黑面重要
```

减少大片实黑。

增加：

- 灰银结构；
- 磁青中间调；
- 纸白 / 骨白少量锚点。

---

# 11. Package I：修正视觉 Metrics，防止“数字 PASS、画面失败”

这次一定要做。

当前 metrics gate 有两个问题：

### 问题 1

原目标：

```text
近景亮部约 15～30%
```

后来 gate 放宽成：

```text
nearPaper >= 3%
```

这只能检测“有没有一点纸色”。

不能作为审美成功门槛。

### 问题 2

`L* span` 增大不能证明“皴纹保住了”。

一张黑白硬切图片也可以 span 很大。

## I1. Metrics 改成两层

### Safety Gate

负责自动阻止灾难：

- 极暗占比过高；
- 饱和度暴涨；
- 整体洗白；
- span 大幅退化；
- draw / GPU 失控。

### Art Diagnostics

只记录，不直接 PASS/FAIL：

- nearPaper
- dark30
- span
- local contrast
- edge density
- high-frequency luminance energy

最后两项建议新增。

可以对 WebGL framebuffer 做简单 downsample 分析：

```text
highFreqEnergy =
mean(abs(pixel - 3x3 neighbour average))

edgeDensity =
Sobel magnitude > threshold 的比例
```

不需要 OCR，不需要 AI vision。

这两个值能帮助判断：

> 近景是不是又出现了大量格子/碎面噪声。

但不要给它们一个“全场统一最佳值”。

只做：

```text
main
C2D
C2D.1 candidate
```

三者对比。

---

# 12. 新的人工 Golden Matrix

不再只用 8 张最终图。

本轮建议：

### 8 张正式 Golden

仍然：

1. Mortal overview
2. Mortal coast near
3. Mortal cliff near
4. Mortal settlement near
5. Upper overview
6. Upper boundary near
7. Nether overview
8. Nether boundary near

### 额外 4 张仅本地审美检查

9. Mortal mid zoom cliff  
10. Mortal mid zoom settlement  
11. Upper mid zoom terrain  
12. Nether mid zoom terrain

原因：

现在最危险的地方不是最大 zoom，而是：

> 从 overview 切进 near 的过渡区。

必须确认视觉语言不会在某个 zoom 突然换人格。

这 4 张不一定进 Git Golden，但应进本地 before/after sheet。

---

# 13. 强制执行顺序

Sol 6.1 不允许一口气全部修改。

必须严格按这个顺序：

### Step 1
建立 Art Debug / 分层视图。

不调色。

### Step 2
只修 coast mask。

输出 01～04。

人工确认后再继续。

### Step 3
关闭当前 P2 mass shading，恢复接近 main。

生成一次完整 8 镜。

### Step 4
实现真正 continuous broad normal。

只开启 Mass，不开新 deep structure。

输出：

03 / 04 / 05 / 07。

### Step 5
加入重新标定后的 Structure。

再输出上述 4 镜。

### Step 6
修 Water。

重点 02。

### Step 7
修 Boundary。

重点 06 / 08。

### Step 8
最后才统一 RealmStyle。

禁止从 Step 2 直接跳 Step 8。

---

# 14. 每一步都必须有“止损条件”

## Coast

如果 03/04 远离水域的颜色仍随 water field 明显变化：

**停止，说明 mask 仍错。**

## Broad Normal

如果 03 中仍出现大量网格大小的矩形灰白块：

**停止，不准靠 contrast 掩盖。**

## Mass

如果地形成为近景最深的大面积对象：

**停止，massShade 过强。**

## Water

如果 02 里无法一眼判断哪里是水：

**停止，留白过度。**

## Upper Boundary

如果 06 第一眼仍然像“米黄色墙 / 悬崖板”：

**停止，Boundary base 太实。**

## Nether Boundary

如果 08 仍存在连续大片 L*<20 黑墙：

**停止，不要继续加 silver line 装饰。**

---

# 15. 性能预算

当前 C2D 最重 `mortal-settlement-near` GPU median 已经比 main 多约 `+1.8 ms`。

C2D.1 不允许继续增长。

目标：

```text
最终 C2D.1 GPU median
<= 当前 C2D
```

最好追回：

```text
0.3～0.8 ms
```

特别关注 broad normal。

允许优化方式：

- 减少重复 height taps；
- 共用采样结果；
- `broadSlope` 从已有 broad samples 得到；
- 避免同一片元再次读取等价邻域；
- debug mode 编译期/分支关闭。

禁止：

为了性能重新破坏连续 broad sampling。

如果必须二选一：

> 宁可把 Mass 做得更弱、更简单，也不要重新回到离散纸板。

---

# 16. 测试与纯度门禁

必须保持原有：

```bash
npm test
npm run test:render3d:m2b
npm run test:render3d:m2c
npm run test:render3d:m2c2a
npm run test:render3d:m2c2c
npm run test:render3d:m2c2c:purity
npm run test:vendor
npm run build
```

继续保留：

```bash
npm run test:render3d:m2c2d
npm run test:render3d:m2c2d:browser
```

新增：

```bash
npm run test:render3d:m2c2d1
npm run test:render3d:m2c2d1:browser
npm run test:render3d:m2c2d1:diagnostics
```

不得新复制一整套 soak。

最终仍复用：

```bash
npm run test:render3d:m2c2c:soak
```

要求：

```text
geometry 不增长
texture 不增长
program 不增长
World SHA 不变
save 不变
RNG 不变
runtime error = 0
GL error = 0
```

---

# 17. 建议提交顺序

```text
1. test(render3d): add C2D.1 art decomposition diagnostics
2. fix(render3d): restrict coast wash to real shoreline transitions
3. fix(render3d): separate continuous broad terrain mass from fine structure
4. refine(render3d): rebalance mortal water and terrain tonal hierarchy
5. refine(render3d): dissolve realm boundary mass into painterly section cues
6. refine(render3d): reconcile upper and nether tonal roles
7. test(render3d): harden C2D.1 visual diagnostics and paired evidence
8. docs(render3d): seal C2D.1 visual reconciliation
```

不要一个 commit 把三界全改完。

---

# 18. 最终交付文档

至少：

```text
M2C2D1_BASELINE.md
M2C2D1_VISUAL_ACCEPTANCE.md
M2C2D1_PERFORMANCE_REPORT.md
M2C2D1_READINESS.md
M2C2D1_FOLLOWUPS.md
```

其中 `VISUAL_ACCEPTANCE` 必须回答：

1. 当前 C2D 为什么看起来奇怪？
2. coast mask 的逻辑 bug 是什么？
3. 原 broad normal 为什么不是真正低频法线？
4. Mass / Structure / Brush 现在分别负责什么？
5. Mortal 哪些参数被撤回？
6. 水如何实现“留白但仍然是水”？
7. Boundary 为什么不再是一堵实体墙？
8. Upper 哪些 C2D 成果被保留？
9. Nether 如何减少黑面而保留“深”？
10. 自动指标为什么不再被当成美术封板？
11. GPU 是否追回部分 C2D 开销？
12. 哪些问题仍明确留到下一阶段？

---

# 19. 我特别建议 Sol 6.1 顺手补的两个小工具

这两个东西价值很高，而且不会让阶段膨胀。

第一是一个开发期 **Art A/B hot switch**：

```text
main-style
c2d-style
c2d1-style
```

同一个 World / camera 原地切。

不是重建世界。

这会极大减少“记忆比较”的误差。

第二个是一个非常简单的 **visual frequency diagnostic**。

统计：

```text
低频明暗能量
高频明暗能量
边缘密度
```

不作为美术评分器，只作为：

> “这一轮是不是又把近景弄碎了？”

的报警器。

以后你继续迭代 Art Pass，这两个工具都会非常值钱。

---

最后我会给 Sol 6.1 一条总原则，建议你原样放在委托书最前面：

> **不要试图把 C2D 做得“更水墨”。先把它做得“更像一幅完整的画”。任何新效果都必须回答它属于 Mass、Structure、Brush、Water、Boundary 中的哪一层。如果无法回答，就不要加入。**

这次最理想的成果不是截图突然华丽很多，而是你再打开 01～08 时，会出现一种很朴素的感觉：

**“对，这下不别扭了。”**

到那个时候，再进入真正的 Art Pass 打磨，才有意义。