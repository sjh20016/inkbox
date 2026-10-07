
# 《坐天观井 Inkbox · M2-C2D 近景绘画化与界缘统一工程委托书 v1》

---

## 一、任务身份

**任务名：** M2-C2D · Nearfield Painterly Correction  
**中文名：** 近景绘画化与界缘统一  
**执行模型：** Kimi K3  
**基线：** 从执行时最新 `main` 建立工作分支；当前参考 HEAD 为 `8b3f2bac761b59bf70f524ff9a00429fa40cc07a`。若 main 已前进，以实际 HEAD 为准，并在基线报告里记录 SHA。

建议工作分支：

`m2-c2d-nearfield-painterly`

本阶段不是新美术系统，不是推翻 M2-C，不是重做 M2-C2B 资产，也不是继续 M2-C2C 的 Meaningful Geography。

本阶段唯一总目标是：

> **保住现有远景已经形成的山水画意，让中近景不再因为格子水岸、纸板陡坡、过窄明度、硬质界缘而突然退化成技术原型。**

最终应达到一种连续的尺度体验：

`全图像画 → 中景仍像画 → 近景成为可观察的低模绘画世界`

而不是现在的：

`全图像画 → 中景沙盘 → 近景网格/棋子/工程断面`

---

# 二、开始施工前必须确认的源码事实

不要根据旧 Sonnet 报告重新实现已经存在的系统。施工前必须实际阅读：

`HANDOFF.md`  
`ROADMAP.md`  
`ARTPASS_PROFILE.md`  
`ASSET_PRODUCTION_SPEC.md`  
`M2C2C_READINESS.md`  
`M2C2C_VISUAL_ACCEPTANCE.md`  
`M2C2C_PERFORMANCE_REPORT.md`

以及：

`src/inkbox/render3d/art/PigmentTerrainMaterial.js`  
`src/inkbox/render3d/art/TerrainDataTextures.js`  
`src/inkbox/render3d/art/RealmStyleProfile.js`  
`src/inkbox/render3d/art/ArtPass.js`  
`src/inkbox/render3d/terrain/TerrainMesh.js`  
`src/inkbox/render3d/terrain/VisualElevation.js`  
`src/inkbox/render3d/water/WaterLayer.js`  
`src/inkbox/render3d/boundary/RealmBoundaryLayer.js`  
`src/inkbox/render3d/stage/PlaneStage.js`  
`src/inkbox/render3d/WorldRenderBridge.js`  
`src/inkbox/render3d/lod/PresentationBudget.js`

当前源码已有的机制必须复用，而不是平行复制。

特别钉死以下事实：

| 当前事实 | 本阶段处理 |
|---|---|
| Terrain 正式路径已经是 Pigment Shader | 改良现有 Shader，不另建第二套 |
| typeTexture 是离散 ID + NearestFilter | 禁止把 terrain type 改为线性插值 |
| height/type/water/veg 已有 renderer dirty 分类 | 新视觉缓存接现有 dirty，不向 World 加字段 |
| VisualElevation 是高程单源的重要契约 | **禁止改公式** |
| RegionGeometry 是 Mask 唯一空间判据 | **禁止复制 Region 判据** |
| Terrain、Water、Boundary 拾取/贴地已有契约 | 不以美术修改破坏这些契约 |
| Tree/Character/Building 已有 LOD | 本轮不得重造 LOD 系统 |
| 当前无正式后处理 RT | 本轮继续不引入全屏后处理 |

建立 `M2C2D_BASELINE.md`，记录实际 HEAD、相关源码事实和当前门禁状态后，再开始改代码。

---

# 三、明确不做什么

这部分是硬边界。

本阶段不增加任何模拟机制，不增加道路，不增加宗门空间归属，不增加浮空岛拓扑，不增加幽冥城市，不做 Gameplay G。

不修改：

`World` 数据结构、存档、RNG、世界推进、事件消费、地形真实 height、`visualElevation()`、Region/Mask 语义、Picking 身份。

不得为了截图好看：

删除树、删除人物、移动 Site、挪聚落、改世界 seed、篡改相机到异常角度、缩小山体、降低人口、隐藏真实对象。

不得新增 EffectComposer、SSAO、Bloom、Kuwahara、Depth Outline 或其他全屏美术 Pass。

不得引入新的第三方运行依赖。

不得使用 `Math.random()` 或模拟 RNG 制造美术随机。

不得重做角色、建筑、树木 GLB。

**P1 至 P4 原则上不增加 draw call，也不改变地形三角形拓扑。**

---

# 四、Package 0：Truth Sync 与新 Golden 基线

这是第一包，禁止跳过。

从当前 main 固定一组新 C2D 视觉诊断镜头。优先复用 C2C 当前自然 World 和固定相机系统，不重新造“为了美术特别好看”的世界。

至少得到以下 8 个正常镜头：

1. Mortal overview，作为“现有远景画意不能倒退”的主基准。
2. Mortal coast near，重点看海岸格子、水面和沙带。
3. Mortal cliff near，重点看高差山壁和三角面纸板感。
4. Mortal settlement near，重点看 terrain、树、屋、人同时出现时是否还能成立。
5. Upper overview，保住当前已有的青绿矿物色远景。
6. Upper boundary near，重点检查视界断面。
7. Nether overview。
8. Nether boundary near，重点检查大片死黑和断面。

截图必须来自正常产品渲染和正常世界，不使用 Inspector 技术视角作为 Golden。

同时在 WebGL canvas 范围内记录：

`L* p2 / p98`  
`L* <= 30` 占比  
接近纸色的亮部占比  
平均饱和度

不要先把 Sonnet 的旧数字写成绝对真理。先测 **当前 HEAD**，再把旧诊断作为调整方向。

这一包只建基线、测试和证据，不进行美术修改。

---

# 五、Package 1：水面与海岸连续化

这是本阶段最高优先级。

当前 `WaterLayer` 仍然使用与 Terrain 同规格的整图网格以及简单半透明 `MeshBasicMaterial`。这正是近景水面“浅青格子”和海岸楼梯感的重要来源。[当前 WaterLayer 源码](https://github.com/sjh20016/inkbox/blob/main/src/inkbox/render3d/water/WaterLayer.js?utm_source=chatgpt.com)

### 目标

不改变世界水数据和网格拓扑，把“离散水格”转译成“连续的绘画水面”。

### 推荐实现

新增一个 Stage-owned 的只读表现缓存，例如：

`SurfaceVisualFieldTexture.js`

建议使用 **RGBA Uint8 DataTexture + LinearFilter**。

至少使用 R 通道保存经过有限范围归一化的 `world.water` 深度。其他通道先保留，除非有明确用途。

注意：

**这是对连续标量 water depth 的插值，不是 terrain type 插值。**

由 `PlaneStage` 根据现有 `waterRegion` 更新这个缓存。若取样使用邻域，dirty region 应扩 1 格或实际核半径。

Terrain 和 Water 只借用此纹理，不拥有第二份世界真相。

新增轻量 `WaterPigmentMaterial` 或等价现有材质改造：

- 海面主体向纸色靠拢，只混入极淡花青。
- 浅水更加接近纸。
- 海岸透明度/颜色根据连续 water field 做 `smoothstep`。
- 水陆边缘使用 `fwidth` 或等价抗锯齿方式，不出现硬格边。
- 水纹如果加入，只允许使用世界坐标程序化生成，不增加独立水纹 Mesh。
- 水纹保持稀疏，绝不能重新把海面填满。
- 水仍遵循现有 RegionGeometry。
- 本包不先降低水网格分辨率。

Terrain shader 可以读取同一 visual water field，在岸线附近加入极弱烘染，使沙岸、水岸、陆地不再像三个格子图层叠放。

### P1 过关条件

同一 World / camera 下：

`mortal-coast-near` 的方格水纹和楼梯岸线显著减弱。

海洋仍能识别，但视觉上首先是“留白的水”，而不是半透明蓝塑料板。

draw call 不增加。

地形、水面三角形数不改变。

World/save/RNG 全部不变。

---

# 六、Package 2：近景山体“绘画法线”与明度骨架

不要按照旧建议简单执行“flatShading → smooth normals”。

当前正式 terrain shader 已经从高度纹理计算 slope 和 curvature，只是某些细节，特别是 silhouette，仍直接受到真实三角面 `dFdx/dFdy` 的影响。[当前 PigmentTerrainMaterial](https://github.com/sjh20016/inkbox/blob/main/src/inkbox/render3d/art/PigmentTerrainMaterial.js?utm_source=chatgpt.com)

### 目标

近景不再看到一片片竖直三角形在争夺明暗，同时保住远景现在偶然形成的漂亮竖向皴纹。

### 实现原则

保留真实几何。

不要改 `VisualElevation.js`。

不要重建整张顶点 normal。

在 shader 内增加一个 **绘画用低频高度法线**。

可以基于当前 heightTexture 手工做 bilinear/低频邻域采样。例如：

`filteredHeight(p ± radius)`

再得到 broad slope / broad normal。

这个 normal 只用于：

- 大尺度明暗组织；
- silhouette / facing；
- 必要的坡面墨量控制。

真实高频 slope / curvature 继续用于：

- 结构墨；
- 局部皴；
- 飞白。

也就是说把当前一个尺度的山体信号拆成两层：

`大山势` + `小笔触`

避免两种失败：

全部使用真实面法线 → 纸板窗帘。

全部平滑 → 蜡山。

### 明度重新映射

当前远景最大的不足之一是暗部不足，所以在本包增加有限的 tone controls 到 `RealmStyleProfile`。

不要创建一堆无意义滑块。最多增加几项真正可解释的参数，例如：

`massShadeStrength`  
`deepInkStrength`  
`heightWashStrength`

需要达到：

- 山势的暗部真正进入重墨区域；
- 深色集中在山脊、沟谷、岸线、坡折等结构位置；
- 不把整片山体一起压黑；
- 山脚和谷地通过 atmosphere / paper 回退获得留白；
- 高峰根据位面风格适度回纸色。

最重要的回归要求：

**Mortal overview 和 Upper overview 不得因为近景修复而丢掉现有远景竖纹和整体画意。**

远景竖纹若因 broad normal 被削弱，应通过现有世界锚定 structural ink 恢复，而不是恢复三角面噪声。

---

# 七、Package 3：界缘从“工程墙”变成“世界断面”

当前 `RealmBoundaryLayer` 的几何契约非常好，不要动它。

它已经保证：

顶部 = target elevation  
底部 = mortal elevation  
每条 Region boundary edge 一个 quad  
Picking 可以从 triangle 反查 boundary edge

问题只在材质语言仍然接近 flat-shaded wall。[当前 RealmBoundaryLayer](https://github.com/sjh20016/inkbox/blob/main/src/inkbox/render3d/boundary/RealmBoundaryLayer.js?utm_source=chatgpt.com)

### 目标

玩家打开视界时，应读成：

“这一层世界被揭开了一角。”

而不是：

“地图里出现一堵调试墙。”

### 实现

只替换或增强现有 boundary material。

可以新增：

`BoundaryInkMaterial.js`

使用原有顶点与颜色，额外提供必要的只读表现属性，例如：

`verticalT`：底 0，顶 1  
`edgeSeed`：由边坐标稳定 hash 得到

禁止改变顶部实际顶点。

禁止通过几何随机扰动破坏 zero-gap。

材质里做：

- 世界坐标锚定的竖向层理；
- 斧劈式干笔；
- 底部向 atmosphere / paper 消隐；
- 顶缘附近极窄的纸纤维/矿物亮带；
- 少量不规则墨量变化。

Upper：

石青、石绿、赭、泥金只作含蓄矿物关系，不做发光 Portal。

Nether：

避免大片纯黑。使用深磁青、焦墨、灰银骨线形成层次。Rift 可以保留极少量朱砂或现有裂隙语义色，但不做霓虹。

Rift breach 继续使用已有 breach 判定，只修改视觉表现，不改变 Rift 或 boundary geometry。

### P3 过关条件

Upper / Nether boundary near 中，墙体不再读成单色竖直平板。

Nether 近景不得出现吞掉大面积画面的纯黑无层次区域。

Boundary picking、Region、zero-gap 测试完全保持。

draw call 不增加。

---

# 八、Package 4：三界参数重新定妆

前三包完成之前，不准大规模调 palette。

前三包稳定后，只在 `RealmStyleProfile.js` 中做最后的统一调整。[当前三界色彩单源](https://github.com/sjh20016/inkbox/blob/main/src/inkbox/render3d/art/RealmStyleProfile.js?utm_source=chatgpt.com)

三界方向：

### 凡间

核心是“水墨淡彩 + 人间烟火”。

水和远山大量回纸。

森林灰绿、赭土、白墙、墨瓦仍然存在。

深墨主要负责结构。

不要为了水墨感把村庄和土地全部去色。

### 上界

保持现有矿物色路线，但从“普通青绿地形”往“敦煌式矿物色 + 云白空间”推进。

石青、石绿、赭石、泥金是强调色，不是全屏饱和铺色。

高 qi 可以更加澄明、空灵，但不能发光科技化。

### 幽冥

目标不是黑，而是“深”。

磁青、焦墨、骨白、灰银形成完整值域。

纯黑只能作为极小的最深墨点。

鬼影、界缘、裂隙要能从环境中读出来。

---

# 九、自动视觉指标

Sonnet 的旧测量可以转成起手验收范围，但必须以当前 HEAD 的 Package 0 基线复核。

建议 C2D 固定以下目标：

| 指标 | Mortal / Upper 近景 | Nether 界缘近景 |
|---|---:|---:|
| 接近纸色亮部 | 15%～30% | 不强制同区间 |
| 深墨 L* ≤ 30 | 2%～8% | 可更高 |
| p2～p98 明度跨度 | 目标 ≥50，或较基线显著扩大 | ≥45 |
| 极暗 L* <20 | 尽量极少 | **≤15%** |
| 平均饱和度 | 不高于当前上界明显一档 | 低 |

这些指标不是为了优化数字。

它们是防止出现：

“整个画面洗白了也通过”

或者：

“全屏压黑获得大明度跨度”

的护栏。

另外保留人工审美门禁：

> 自动指标全部通过，不代表视觉封板。最终 8 张 Golden 必须人工确认“远景不退步，近景明显提升”。

---

# 十、性能预算

当前 C2C 在 Intel UHD 730 / Edge 的实际产品基线已经比 Sonnet 当时根据软件光栅截图猜测的情况健康得多。

当前报告里大致是：

- Mortal overview：约 25 draw，约 159k triangles；
- Upper overview：约 10 draw，约 106k triangles；
- Nether overview：约 9 draw，约 106k triangles；
- 跨界窗口：约 28～29 draw，约 254k triangles；
- Rift 近景甚至可到约 40 draw / 480k triangles；
- GPU median 多数仍在个位毫秒，但部分跨界 p95 已接近 16～17ms。[M2-C2C 性能报告](https://github.com/sjh20016/inkbox/blob/main/M2C2C_PERFORMANCE_REPORT.md?utm_source=chatgpt.com)

因此这次**不允许趁机塞全屏后处理**。

P1～P4 预算：

| 项目 | C2D 要求 |
|---|---|
| draw call | 同场景不得因本阶段增加 |
| 三角形 | 不增加 |
| 新 DataTexture | 最多 +1 个主要 Surface visual field |
| visual field CPU payload | medium 建议控制在约 0.25 MiB 内 |
| shader program | 允许 Water / Boundary 替换产生少量新 program，但生命周期必须稳定 |
| GPU median 增量 | 同机同镜头建议 ≤ +1 ms |
| GPU p95 增量 | 建议 ≤ +2 ms |
| CPU 常态帧 | 不增加整图扫描 |

所有比较必须：

**same World + same advance state + same camera + paired before/after**

不得跨机器拿旧 FPS 比。

---

# 十一、Package 5：只允许条件式尺度微调

这一包默认 **不执行**。

原因是 Sonnet 看到的截图里，人物、建筑、树木比例确实有问题，但当前仓库已经在 M2-C2A、C2B Pass 1 后建立了真正的三档 LOD、正式 GLB 和 HLOD。

所以只有新 C2D Golden 仍明确证明“近景人物/建筑比例明显破坏画面”时，才允许：

调整已有 `PresentationBudget` 或现有 layer 中的 visual scale。

不得：

重做角色资产；  
改成纯 Billboard；  
新建另一套 LOD；  
新增角色 World 字段；  
扩大本阶段为资产生产工程。

如果当前 HEAD 已经解决截图时期的问题，应在报告中写：

`P5 skipped: stale diagnosis`

而不是为了“完成委托书每一项”强行改代码。

---

# 十二、必须新增的验收入口

建议新增：

```bash
npm run test:render3d:m2c2d
npm run test:render3d:m2c2d:browser
npm run test:render3d:m2c2d:metrics
```

如果新 texture / material 生命周期足够复杂，再增加：

```bash
npm run test:render3d:m2c2d:soak
```

否则复用现有 C2C soak，不要为了阶段编号复制一套几千行测试。

每包完成后都必须运行相关旧门禁。

最终至少执行：

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

正式浏览器验收：

```bash
npm run test:render3d:m2c2d:browser
npm run test:render3d:m2c2c:browser
npm run test:render3d:m2c2c:soak
```

要求保持：

World SHA 一致。  
advance state 一致。  
save keys 一致。  
11 RNG 一致。  
无新增 runtime error。  
6000 帧后 geometry / texture / program 不增长。

---

# 十三、提交纪律

不要一个 commit 做完全部。

建议顺序：

```text
1. docs(render3d): establish M2-C2D visual baseline
2. feat(render3d): add continuous surface visual field
3. feat(render3d): refine painterly water and nearfield terrain shading
4. feat(render3d): unify realm boundary ink treatment
5. test(render3d): add M2-C2D visual metrics and browser gates
6. docs(render3d): seal M2-C2D evidence and readiness
```

每个代码提交要带对应 targeted tests。

不要为了测试通过修改旧断言含义，不准 `|| true`，不准删旧门禁。

---

# 十四、最终交付物

完成后至少提交：

`M2C2D_BASELINE.md`  
`M2C2D_VISUAL_ACCEPTANCE.md`  
`M2C2D_PERFORMANCE_REPORT.md`  
`M2C2D_READINESS.md`

以及不超过 8 张正式 Golden。

完整 before/after、技术 proof、矩阵和日志继续遵循现有资产规范，放 ignored 本地目录或 Actions artifact，不要把几十张 PNG 塞进 Git。

最终报告必须明确回答：

1. 哪些 Sonnet 诊断在当前 HEAD 仍成立？
2. 哪些已经因为 C2B/C2C 的发展而过时？
3. 海岸格子具体通过什么机制消除？
4. 为什么没有插值 terrain type？
5. 近景纸板山如何减弱？
6. 如何保证远景原有皴纹没有被抹掉？
7. Boundary 如何变化而没有破坏 zero-gap？
8. World/save/RNG 是否逐项一致？
9. 新 texture/program 的真实资源增量是多少？
10. same-camera GPU 增量是多少？
11. P5 是否有必要执行？
12. 哪些美术问题明确留到后续资产阶段？

---

## 十五、遇到这些情况必须停下，不得自行扩大设计

如果实现需要修改 `VisualElevation`，停下报告。

如果需要修改 World 字段才能得到海岸效果，停下报告。

如果需要改变 RegionGeometry 才能做“撕纸边”，停下报告。

如果需要增加 EffectComposer / RenderTarget 才能继续，停下报告。

如果 terrain type 必须变成 LinearFilter，说明方案走错，重新设计。

如果近景改善只能靠删除树、人或聚落，方案失败。

如果 P1/P2 导致远景 Golden 明显倒退，不准继续 P3，先修复尺度适配。

---

我认为这份任务的规模**很适合拿 Kimi K3 试刀**。

原因不是它简单，而是它被我刻意裁成了“已有成熟工程骨架上的视觉局部优化”：数据边界非常清楚，结果高度可视化，每个阶段都有 before/after，而且不需要它同时理解新的模拟机制、世界观设计、资产生产和复杂 Gameplay。

尤其值得注意的是，你现在的项目已经跨过了一个节点：**Sonnet 当初提出的很多“搭架子”工作其实已经完成了。** 当前不应该再委托一个模型“大改水墨渲染”，而应该让它像画师修画一样，一层层处理最碍眼的三块：**水岸、山体尺度、世界断面**。

如果 Kimi K3 能把这三个 Package 做漂亮，而且保持你现在 C2C 那套变态严格的纯度和 GPU 证据，我会把它视为一次非常成功的模型能力测试。它要做的不是造一座新房子，而是把现在已经立住的屋子，从“远看有韵”修到“走近也经得住看”。