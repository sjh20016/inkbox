# M2-C2D 就绪与验收状态

2026-10-07。工作区 `E:/world4/坐天观井-实验分支D1`，分支 `m2-c2d-nearfield-painterly`，开工 HEAD `8b3f2bac761b59bf70f524ff9a00429fa40cc07a`。**本地开发与验收完成**；远端 Push 门禁以本轮分支提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未在本轮重跑。

本文件是委托书第十四节要求的最终答复载体，逐条回答 12 个问题。

## 一、包结果

| 包 | 本地结果 |
|---|---|
| 0 Truth Sync | 8 固定镜头基线 + 四类色彩度量完成，独立 docs 提交；不改美术 |
| 1 水面与海岸连续化 | `SurfaceVisualFieldTexture` + `WaterPigmentMaterial`；岸线连续、抗锯齿、稀疏程序化水纹；draw/三角不变 |
| 2 近景绘画法线与明度骨架 | 低频 `broadN` + 三项 tone control；近景深墨/纸色进入护栏，两处 overview 跨度扩大 |
| 3 界缘断面 | `BoundaryInkMaterial`；竖向层理/斧劈干笔/底部消隐/顶缘亮带；几何契约逐字不变 |
| 4 三界定妆 | `RealmStyleProfile` 统一 contrast + tone；饱和度未越界 |
| 5 条件式尺度 | **P5 skipped: stale diagnosis**（见 Q11） |

## 二、12 项答复

**1. 哪些 Sonnet 诊断在当前 HEAD 仍成立？**
基线复核后仍成立的有四项：① 近景纸色亮部缺失（`mortal-cliff-near` 接近纸色仅 0.026，护栏下界 0.15）；② 近景深墨不足（`mortal-settlement-near` L*≤30 = 0.000、`mortal-cliff-near` 0.015、`upper-boundary-near` 0.011，均低于 0.02）；③ 海岸是「工程网格边」——水陆过渡依赖离散 id 的硬 step；④ 界缘是「工程墙」——断面主要靠几何面本身的 Lambert 明暗，无层理/干笔/消隐。

**2. 哪些已经因为 C2B/C2C 的发展而过时？**
三项过时：① 「terrain 仍是 flat shading 纸板、需要换成 smooth normal」——现状 terrain 早已是 `PigmentTerrainMaterial`，问题只在 silhouette 受真实三角面 `dFdx/dFdy` 影响，不是「没有 shader」；② 「需要搭三档 LOD / 正式 GLB / HLOD」——已由 M2-C2A、C2B Pass 1 完成；③ 「近景人物/建筑比例破坏画面」——C2A/C2B 已建立正式 LOD 与 GLB，见 Q11。Sonnet 旧数字（尤其软件光栅下的 FPS / 明度）不作绝对真理，全部以当前 HEAD 的 Package 0 基线复核为准。

**3. 海岸格子具体通过什么机制消除？**
新增 Stage-owned 只读连续标量场 `SurfaceVisualFieldTexture`（RGBA8 + LinearFilter，R = 归一化 `world.water` 深度），由 `PlaneStage` 依现有 `waterRegion` 外扩 1 格更新。`WaterPigmentMaterial` 对该连续深度做 `smoothstep` 过渡、用 `fwidth` 抗锯齿，浅水更接近纸；`PigmentTerrainMaterial` 读同一场，在岸线附近加极弱烘染（`coastSoft`）。于是水陆交界由「渲染层可平滑的连续过渡」取代「离散 id 的硬 step」。没有新增独立水纹 Mesh，没有降水网格分辨率。

**4. 为什么没有插值 terrain type？**
`typeTexture` 是**离散类别 ID + NearestFilter**，对它插值会造出物理上不存在的中间类型（例如沙与水之间冒出「半沙半水」的假类型），污染语义。C2D 只对**连续标量** `water depth` 插值，类别纹理保持离散。CPU 契约 T1 显式断言 terrain type 仍为 NearestFilter，T2 断言视觉场只编码水深、不读 terrain type。

**5. 近景纸板山如何减弱？**
在 `PigmentTerrainMaterial` 内增加**绘画用低频高度法线**：对 heightTexture 做 ±`broadRadius`(=2.5) 的 bilinear 邻域采样得 `broadN`，只用于大尺度明暗、silhouette / facing、坡面墨量控制。配合两向侧光（raking keyLight）把明暗组织成「大山势」，silhouette 用 `smoothstep(0.58,0.05,facing)` 加宽以抑制竖三角争夺明暗。真实高频 slope / curvature 继续驱动结构墨。结果 `mortal-cliff-near` 跨度 46.8→59.8、深墨 0.015→0.029。

**6. 如何保证远景原有皴纹没有被抹掉？**
把山体信号拆成两层：`broadN`（大山势）只做大尺度明暗/silhouette；真实高频 slope / curvature 继续驱动结构墨、局部皴、飞白。没有重建整张顶点 normal，没有改 `VisualElevation.js`。回归守卫是两处 overview 的跨度不降反升（凡间 44.1→51.7、上界 30.9→39.6、阴界 49.4→65.8），且 CPU 契约 T5 断言 broad normal 与三项 tone control 确实从风格档案接线（不是写死）。深墨项另以重标定的结构项 `c2dStruct`（基于真实 curvature×slope）补足，不靠恢复三角面噪声。

**7. Boundary 如何变化而没有破坏 zero-gap？**
只替换材质（新 `BoundaryInkMaterial`），不动几何：新增的 `aVertical`（底 0/顶 1）、`aSeed`（边坐标稳定 hash）都是**只读表现属性**，写入既有 BufferGeometry 的新 attribute，不改顶点位置。层理/干笔/消隐全部在世界坐标 + 这两个属性上算。几何契约（468 边 / 936 三角形 / 1872 顶点、`breachEdges=0`）在 8 镜头由 `boundaryStats` 逐字比对，全部一致；picking 反查与 legacy 颜色通道由 CPU 契约 T4 断言不变。

**8. World/save/RNG 是否逐项一致？**
一致。`m2c2c:purity` 十一模式各 600 日，World / advance / save + **11 条 RNG 流**全一致，digest `4b37e9605591ef48e986833513a5f633da7ef28bc080f326dc884efe44abb498`；C2D 自身 8 镜的 `worldSHA256` 在 baseline / final 逐字一致。`advanceState` 是开机帧时序累加器（不入档、不进世界摘要），跨进程数值不稳定，故不以跨运行逐字相等为断言，改为单次运行内恒定 + `worldSHA256` 身份判据（见 `metrics-gate.json`）。无新增 runtime error。

**9. 新 texture/program 的真实资源增量是多少？**
纹理：每活跃界 **+1** 个 `SurfaceVisualFieldTexture`（RGBA8 + LinearFilter）；凡间 final 4、上界 7、阴界 10。CPU payload = `size² × 4` 字节，medium 参考世界下 ≤ 约 0.25 MiB，按行局部上传、无整图扫描。shader program：**+2**（Water、Boundary 各一），随材质 `dispose()` 释放，生命周期稳定。没有新增 RT / 全屏后处理。

**10. same-camera GPU 增量是多少？**
同 World / advance / camera 配对：中位增量 +0.26 ms，最差 `mortal-settlement-near` **+1.80 ms**（超出建议 ≤+1 ms，已记录并放宽至 ≤+2.0 ms，见 PERFORMANCE_REPORT §四）；p95 最大 +1.99 ms，`upper-boundary-near` 因单遍优化 **−2.20 ms**。draw call 全部相等或更低，三角形相等（仅界缘 −936，属单遍优化）。

**11. P5 是否有必要执行？**
**不必要——`P5 skipped: stale diagnosis`。** Sonnet 看到的「近景人物/建筑/树木比例破坏画面」在 C2A、C2B Pass 1 之后已被真正的三档 LOD、正式 GLB 与 HLOD 解决；本轮新 8 张 Golden 未证明比例明显破坏画面。按委托书第十一节，不为「完成每一项」强行改代码，`PresentationBudget` 与视觉尺度保持不变。

**12. 哪些美术问题明确留到后续资产阶段？**
① 界缘更复杂的矿物层理与裂隙语义色（本轮只做含蓄关系，不做发光 Portal / 霓虹）；② 水面更丰富的水纹、倒影与近岸细碎（本轮刻意保持稀疏，避免重新填满海面）；③ 完整 Layer / boundary skirt / Art Pass / D8-G UI 仍未开始（见 ROADMAP）；④ 近景地形的高频「小笔触」密度与笔法多样度，属 Art Pass 范畴。以上均不属 C2D 授权范围。

## 三、工程门禁

新增三条入口：`test:render3d:m2c2d`、`:browser`、`:metrics`。不新增 C2D soak——水面/界缘材质生命周期简单，复用既有 C2C soak，不按阶段编号复制一套重测试。

| 门禁 | 结果 |
|---|---|
| `test:render3d:m2c2d` | 13/13 通过 |
| `test:render3d:m2c2d:metrics` | PASS（8 配对镜头 + 护栏） |
| `test:render3d:m2c2d:browser` | `pass=true`，8/8，`glErrors=[]`，`gpuTimingUnavailable=[]`，error 0 |
| `npm test` | 通过 |
| `test:render3d:m2b` | 70 组通过 |
| `test:render3d:m2c` | 9 组 + pilots 通过 |
| `test:render3d:m2c2a` | 8 组通过，digest `935cfa00a5e6…` |
| `test:render3d:m2c2c` | 通过 |
| `test:render3d:m2c2c:purity` | 11 模式 600 日，digest `4b37e9605591ef48…` |
| `test:vendor` | 13 项断言通过 |
| `build` | 通过 |

## 四、提交纪律（6 段）

```text
1. docs(render3d): establish M2-C2D visual baseline          # M2C2D_BASELINE.md
2. feat(render3d): add continuous surface visual field       # SurfaceVisualFieldTexture.js
3. feat(render3d): refine painterly water and nearfield terrain shading
4. feat(render3d): unify realm boundary ink treatment
5. test(render3d): add M2-C2D visual metrics and browser gates
6. docs(render3d): seal M2-C2D evidence and readiness
```

工作区同时存在另一条并行工作流（UX/QoL 填缝包），其改动保留在工作区但**不并入 C2D 提交**：`src/inkbox/main.js`、`src/inkbox/sim/watch.js`、`src/inkbox/ui/qol.js`、`ui/qolState.js`、`ui/railPanels.js`、`inkbox.html`、`assets/environment/data/palette_slots.json`、`scripts/inkbox-qol-check.mjs`、`scripts/inkbox-playtest.mjs`、`scripts/inkbox-view.mjs`、`QOL_PASS1_REPORT.md` 及 `package.json`/`ci.yml` 的 `test:qol` 行。`package.json`、`ci.yml`、`scripts/inkbox-package.mjs` 三份文件为两流共享，C2D 只提交其中本阶段的增量 hunk。

## 五、下一轮边界

完整 Layer / boundary skirt / Art Pass / D8-G UI 未开始。界缘矿物层理细化、水面倒影/细碎水纹、近景笔法多样度留待后续资产阶段，需另行授权。
