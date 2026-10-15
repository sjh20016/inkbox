# 坐天观井 · Render3D M2-B 工程规划书

日期：2026-10-02。基线：上传压缩包中的 M2-A final cleanup 状态（ROADMAP 记 checkpoint `render3d-m2a` → `f274def`）。
性质：设计与规划文档，**不是施工授权**（ROADMAP 已写明"阶段完成不等于下一阶段已获施工授权"）。

## 0. 怎么读这份文档

| 标记 | 含义 |
| --- | --- |
| 【已核实】 | 我读过对应源码，或用仓库自己的生成器 / 函数在 Node 里跑过 |
| 【设计】 | 我的提议，尚未实现，参数是初值 |
| 【待裁决】 | 需要你拍板，或需要你显式授权才能动 |
| 【未核实】 | 我没有条件验证，写出来是为了让你知道边界 |

**我没读到的：** 压缩包不含 `美术素材/`（文档称有 163 张 PNG），所以 §9 里所有涉及素材接线的内容都是空缺，不做预判。
**我没做的：** 没有在浏览器 / GPU 上跑任何东西。下文的数字分两类：M2-A 报告里的 GPU 实测（Intel UHD 730 / ANGLE D3D11），和我在 Node 里做的几何 / 算法级测量。后者不能当性能结论。
**测量脚本：** `scripts/inkbox-art-skirt-prototype.mjs`、`scripts/inkbox-art-seal-calibration.mjs` 随美术包交付，在仓库根目录直接 `node scripts/…` 运行；它们 import 仓库里的生成器与 `pointInRegion`，不含任何拷贝出来的公式。

> **本文状态：** 第 4 节起是本次补全的部分。第 1–3 节的设计已经由「墨界美术包」落地并在真实浏览器里渲染验证过（见第 4 节），所以规划书和代码现在是同一件事的两个面。

---

## 1. 前提

### 1.1 对上一轮回答的一处更正

上一轮我写过"墙高做有序压缩""用墙高下限加软压缩兜底"。**如果压缩只作用在墙本身，墙会与两侧地形脱开**：墙的两端必须精确落在凡间边缘节点和目标界边缘节点上（M2-A 的 Slab 就是这样做的，同一节点上下端取两界高程），任何只改墙高的处理都会在其中一侧留下缝。

正确做法是本文 §3 的 **D1（垂直档 + 肩部）**：在目标界一侧、离边界 K 格的窄带内，把地形高程平滑地拉向"墙顶"，墙本身保持精确的两端对齐。上一轮的方向（读数走墨色、几何只表达方向与大概量级）不变，实现路径以本文为准。

### 1.2 已核实事实

| # | 事实 | 出处 |
| --- | --- | --- |
| F1 | Mask 谓词是 `pointInRegion(path, x+0.5, y+0.5)`，path 是整数格点。地形按 quad 中心判，实体按所在格中心 `floor(x)+0.5` 判。所以边界**恒为网格边的并集**，墙顶点恰好是网格节点，不需要任何插值 | `ui/realmView.js`、`TerrainMesh.setRegionMask`、`EntityLayer.write` |
| F2 | 三界共用 XZ，Y 各取各的 `visualElevation(height)`，没有垂直偏移。`visualElevation = 38d + 38·max(0,d)²`（d = h − 0.3）。凡间相邻节点 \|dY\| p50/p90/p99 = 0.47 / 2.11 / 5.72 | `VisualElevation.js`；我的测量（200×128） |
| F3 | 两界裸高差：上界 \|gap\| p50/p90/p99 = 10.3 / 34.0 / 49.7；幽冥 10.1 / 24.8 / 39.0。幽冥比凡间高的格子占 65%，与"幽冥在下"相反 | 我的测量（种子 20260929） |
| F4 | **3D 雕刻只写 height 并 `world.touch()`**；Canvas 版 `powers.sculpt` 另外调 `recomputeRect`（重算 type 与 qi）并写 history。3D 路径上是否有别处补做，我没找到 | `render3d/terrain/sculpt.js`、`sim/powers.js:126`、`world/terrain.js:146` |
| F5 | **3D 里的视界窗是绕过 `commitSelection` 直接给 `sandbox.selection` 赋值的**，因此 3D 里划出的窗不会调用 `openRifts`。真正的入口是 `commitSelection(points)`：`normalizeRegion` → `tool.apply` → `openRifts` | `Render3DAdapter.js:104-106`、`main.js:1392-1463` |
| F6 | 进入 3D 时左栏 `.rail.left` 被设为 `inert`，神力工具（雨、灾祸、点化等）在 3D 里不可用；3D 只有自己的四种雕刻 | `Render3DAdapter.setActive` |
| F7 | 雕刻在窗开时整体禁用（`canSculpt` 要求 `!realmPrototype.open`） | `Render3DAdapter.js:132` |
| F8 | **裂隙只在视界开着时推进**（`riftActive: this.riftViewOpen()`，契约 C1.1）。单次开窗最多开 1–4 条缝：`clamp(1, 4, round(perimeter/120))`，位置在选区路径经过的可走格上；同时活跃上限 `RIFT_MAX_ACTIVE = 64` | `sim/advance.js`、`main.js:1902-1910`、`sim/rifts.js:835` |
| F9 | 幽冥缝每 30 日判定四次，**各用独立随机流，每次一次抽签比一个常量**（`nrng/hrng/irng/prng`）。上界缝共用 `riftRngFor`，且第一次抽中之后还有第二次抽签（`upToDown`），流位置随结果变化 | `sim/rifts.js:1889-1899, 2016-2025` |
| F10 | 裂缝半径唯一公式是 `riftRadiusAt`；渲染侧只经 `readers/riftViewModel.js` 读取。单缝峰值半径约 3.995 格（约第 1672 日），闭合约 36 年（12990 日）。注释里给的单缝一生期望：鬼爬出约 20–24 只、幽冥物约 7–10 件、夺舍尝试约 4–5 次 | `sim/rifts.js` 常量注释 |
| F11 | `surfaceElevation` / `visualElevation` 的全局调用点共 11 处：`TerrainMesh`、`WaterLayer`、`VegetationLayer`、`SettlementLayer`、`WorldMarkerLayer`（2 处）、`EntityLayer`、`SelectionMarker`、`BrushOverlay`、`ThreeFxProbe`、`SlabPrototype`（3 处）、`Render3DHost.focusOn` | grep |
| F12 | 窗开时 `RealmView3DPrototype` 把水、植被、聚落、标记、选中环**对所有 Stage（含窗外凡间）隐藏**；`fxProbe` 也整体隐藏 | `RealmView3DPrototype.apply`、`Render3DHost.update` |
| F13 | `PlanePicker` 只射线测试 terrain 与实体实例；植被、聚落、标记不可拾取。`Mesh.raycast` 遵守 `drawRange`，所以拾取的是压缩后的可见 index | `PlanePicker.js` |
| F14 | `TerrainMesh` 的包围盒写死 Y ∈ [−30, 120]。任何垂直偏移使顶点越界后，`frustumCulled` 会误剔除 | `TerrainMesh.gridGeometry` |
| F15 | `WorldRenderBridge.changes()` 每帧对每个**可见** Stage 全量 diff 四层数组，输出四条包围盒脏区。M2-A 实测 scan 约 0.2–0.6 ms | `WorldRenderBridge.js`、M2-A 报告 |
| F16 | Canvas 版视界的接缝语言已经存在：青色 `rgba(122,186,196)` 呼吸描边 + `[7,5]` 流动虚线（`lineDashOffset = -now*9`），只用确定性三角函数，不抽 RNG | `render/realmViewLayer.js:394-440` |
| F17 | 各界灵气分布差异很大：`qi` 中位数 凡间 0.30 / 上界 0.94 / 幽冥 0.22（上限 0.55）。`qi` 是 `applyTile` 里由地形推导出来的，修炼速度读 `world.qi[所在格]` | 我的测量；`sim/cultivation.js:321,369` |

### 1.3 界缘可行性实测（【已核实】，Node 内几何级）

样本：种子 20260929，288×180，17 个区域（1 个 40×30 矩形、1 个 20×20 矩形、14 个随机套索 blob、1 个贴地图边缘的矩形），未推进模拟。

| 指标 | 结果 |
| --- | --- |
| 边界拓扑 | 17/17 为单一闭环，无度 4 节点（棋盘接触）。度 4 情形仍须处理，见 §5.1 |
| 墙边数 / 三角数 | 20×20 矩形 80 边 / 160 三角；40×30 矩形 140 / 280；R≈39 的大套索 388 / 776。最大 404 边 / 808 三角，相对 M2-A 窗开时约 5.2 万三角可忽略 |
| 掩码 + 边界提取耗时 | 288×180 上 1.0–2.6 ms，仅在区域身份变化时发生一次 |
| 裸高差下的墙 | 上界墙高 p10/p50/p90/max ≈ 0/2/16/31；符号错的边缘节点均值 56%（上界）/ 45%（幽冥） |

---

## 2. 阻塞项：这些不解决，M2-B 的核心体验做不出来

**Z1 · 垂直语义缺失（F2/F3）。** 裸高差是噪声，直接封边得到的是高矮乱跳、方向乱翻的墙。这是 M2-B 的核心设计问题，见 §3 D1。

**Z2 · 高程口径散落（F11）。** 11 处直接 import 全局 `surfaceElevation`。只要引入垂直档，漏改一处就会出现"实体悬空或陷进地里"，而且不报错。必须先收口成 Stage 级的 `elevationAt`（B0.1）。

**Z3 · 窗外世界在开窗时变秃（F12）。** 不修，完整视界无从谈起（B1）。

**Z4 · 3D 里没有真正的划窗入口，也没有神力（F5/F6）。** 玩家在 3D 里只能点调试按钮开一个固定矩形窗，且不开缝。"干预 → 环境 → 玩法"这条链在 3D 里目前**断在起点**（B4 + G0）。

**Z5 · 3D 雕刻与模拟侧不等价（F4）。** 若 3D 雕出的山不重算 type / qi，那么"抬山镇幽冥"的因果链（高度 → 落差 → 镇压 → 事件概率）以及颜色、灵气都会与 Canvas 版分叉。这一条**触碰模拟写路径**，需要你授权（G0）。我没有核实是否有间接补算，B0 里先加一条等价性测试来回答它。

---

## 3. 设计决策记录

### D1 · 垂直档 + 肩部（取代"只压缩墙"）【设计，待画面裁决】

每个位面在 profile 里新增垂直档：`datum`（基准偏移）、`relief`（起伏缩放）。上界 `datum = +D`（"天柱"，从凡间升起），幽冥 `datum = −D`（"地井"）。令 `sign = +1`（上界）/ `−1`（幽冥）：

```
M(n)  = 凡间边缘节点真实高程（不动）
T(n)  = sign·D + s·V(h_target(n))          // 目标界 datum 之后
g(n)  = sign·(T(n) − M(n))                 // >0 表示站在叙事正确的一侧
H(n)  = Hmin + Hcap·tanh( max(g,0) / Hcap ) // 墙高：恒 ≥ Hmin，随 g 单调、软饱和
R(n)  = M(n) + sign·H(n)                   // 墙顶 = 目标界边缘节点的最终高程
T'(n) = lerp( R(n), T(n), smoothstep(d(n)/K) )   // 肩部；d = 节点到边界的格距，d ≥ K 时 T' = T
```

要点：

- 凡间一侧**保持真实**，只有目标界在边界 K 格内被"提"向墙顶。窗外的世界不为窗内让步。
- 墙顶 R 跟随凡间边缘的起伏，墙看起来像"从凡间大地上切下来的一块均匀厚的岩芯"，厚度 `H` 才携带信息。
- `H` 对真实落差 `g` 单调，并在 `Hcap` 处软饱和，这给了后面玩法"镇到极限"的边际递减（见 §10）。
- 目标界内部（d ≥ K）不变形，所以窗内景观仍是目标界自己的样子。

**初值与实测（17 个区域，各区域分位数取均值）：**

| 配置 | 参数 | 符号错节点（上界 / 幽冥） | 墙高 p10/p50/p90 上界 | 墙高 p10/p50/p90 幽冥 | 肩部坡度 p90（格） 上界 / 幽冥 |
| --- | --- | --- | --- | --- | --- |
| raw（现状） | D=0, s=1 | 56% / 45% | 0 / 2 / 16 | 3 / 8 / 23 | 5.9 / 2.8 |
| A | D=24, s=0.6, Hmin=6, Hcap=22, K=4 | 22% / 0% | 11 / 19 / 23 | 20 / 24 / 27 | 4.0 / 5.5 |
| **B（建议初值）** | D=30, s=0.6, Hmin=8, Hcap=26, K=5 | 17% / 0% | 16 / 25 / 29 | 26 / 30 / 33 | 2.9 / 4.5 |

参照：凡间自然相邻节点 \|dY\| 的 p90 = 2.1，p99 = 5.7。B 配置的肩部坡度落在自然坡度范围内，A 的幽冥一侧已贴近 p99，所以建议取 B。上界仍有 17% 的边缘节点在"错边"，它们由 `Hmin` 与肩部兜住，不会留下缺口，但该处墙顶是被"提"上去的，需要在画面上确认不突兀。

### D2 · 单一 `RegionMask3D`（一个区域，一张表）

现状是 `TerrainMesh` 与 `EntityLayer` 各自对每个 quad / 实体调 `contains`。B 阶段要新增水、植被、聚落、标记、界缘五个消费者，各算各的迟早会不一致。改成 Host 持有 `WeakMap<RegionMask, RegionMask3D>`，按区域身份缓存（`getRealmViewState` 已保证同一选区身份稳定），一次算出：quad 内外表、边界边、环、节点到边界距离。所有 Layer 只查表，**谓词只存在于一处**。

### D3 · `ElevationField` 是唯一高程来源

每个 Stage 持有一个 `ElevationField`，提供 `node[]`（写进网格的最终 Y）、`base(i)`、`at(x,y)`（保持 a,c,b / b,c,d 三角化与 `Math.fround` 的一致性）。F11 里 11 处调用全部改走 `stage.elevationAt`。一条静态源码扫描测试保证 `render3d/` 中除 `ElevationField.js` 外不再 import `surfaceElevation`。

### D4 · 界缘是独立的 `SkirtLayer`，不并进 Slab

Slab 是 ≤20 格矩形研究探针，按 ROADMAP 保留、不扩。界缘走网格边界，任意套索形状都成立，两者用途不同。

### D5 · 墙的墨色用程序化着色，不依赖 PNG

理由有二：素材我没见到；且墙的信息是**数据驱动**的（厚度、开口），贴图表达不了。用 `MeshLambertMaterial` + `onBeforeCompile`，保留 Three 的光照与雾，不引入自定义渲染管线，也不需要 RenderTarget（ROADMAP 里 RenderTarget 暂缓）。

### D6 · 裂缝是墙的"破口"

活跃裂缝在墙上开口，开口宽度由 `riftRadiusAt` 决定，经 `riftViewModel` 读取。Canvas 版已有的接缝语言（F16）直接继承。

### D7 · 纯渲染与模拟层的界线

B0–B4、AP 全部是**纯渲染 / 输入侧**：不改 `sim/`、`world/`、`io/save.js`、存档 schema、任何概率常量，沿用 M2-A 的 600 日 digest 纯度判据。G 系列才碰模拟，并且每一步都要你显式授权（§10）。

---

## 4. 美术包已落地什么，没落地什么

「墨界美术包」（`inkbox-art-pack.zip`）实现了第 3 节的 D1–D6 的主体。下表是诚实的对账。

| 工作包 | 内容 | 状态 | 说明 |
| --- | --- | --- | --- |
| B0 高程口径收口 | 每个 Stage 持有 `ElevationField`，各 Layer 经 `stage.elevAt` 贴地 | **部分** | 已改：`EntityLayer`、`ThreeFxProbe`、`SelectionMarker`、`Render3DHost.focusOn`。**未改**：`VegetationLayer`、`SettlementLayer`、`WorldMarkerLayer`（2 处）、`BrushOverlay`、`SlabPrototype` 仍直接调全局 `surfaceElevation`。目前安全，因为这些层只存在于凡间 Stage（垂直档 0、无肩部，两种口径逐位相同）；一旦哪个 profile 在上界 / 幽冥启用它们，就会悬空或陷地，且不报错 |
| B1 窗外凡间还原 | 开窗时水、植被、聚落按同一张掩码表过滤后继续显示 | **部分** | 水（drawRange）、植被、聚落已做并有测试。**标记（WorldMarkerLayer）、选中环、FxProbe 在窗开时仍被隐藏**，M2-A 的行为未变 |
| B2 界缘 | 掩码表、墙几何、垂直档、肩部、墨色着色、裂缝开口、云气 | **已做** | 真实浏览器渲染验证（见 `docs/screens/`）；Node 级 12 组不变量 |
| AP 墨色管线 | 水墨顶点色、色调分档材质、宣纸叠层、雾、水面花青 | **已做（第一版）** | 没做：轮廓线、实体 / 植被 / 建筑的重绘、各界独立光照、HUD 统一 |
| B3 | 冥河 / 阴气 / 上界云气；检视反馈；Three FX 穿墙 | 未做 | 见 §5 |
| B4 | 3D 里真正的划窗入口（`commitSelection`） | 未做 | 见 §5 |
| G 系列 | 镇 / 泄玩法 | 未做，且**需要你授权** | 见 §10 |

### 4.1 实现时发现的、第 1 节没写到的事实

| # | 事实 | 后果 |
| --- | --- | --- |
| F18 | `stepHydrology` 里的 `stepErosion` / `stepThermal` 在正常游玩时**持续改写凡间 `height`**（`sim/hydrology.js:154,196`） | 墙若"高程一动就重算"，每帧都会重写目标界网格与全部贴地层。美术包改为：只比较边界节点的 (M, T)，漂移超过 0.12 视觉单位且距上次重算 ≥ 0.4 秒才重算 |
| F19 | `test:render3d:bridge` 用正则钉着源码文本，例如 `selectionMarker?.update(this.world, heightChanged)` | 不能改这一行的调用形状。美术包改为由 Stage 构造后给 `SelectionMarker.elevAt` 注入，既有测试一行未改 |
| F20 | 目标界在关窗后变成不可见，`PlaneStage.update` 不再跑 | 若只靠 `pending` 兜底，关窗后该界网格缓冲里仍是肩部形状（只是看不见）。美术包在 `closeWindow` 里同步还原，测试断言"关窗后每个节点回到 base" |
| F21 | `MeshToonMaterial` 本身不暴露 `flatShading`，但 Three 0.186.1 的程序参数对任意材质读取 `material.flatShading` | 设 `material.flatShading = true` 后，片元导数法线对 Toon 材质同样生效；真实渲染无着色器报错（SwiftShader）。ANGLE / D3D11 上我没验证 |

---

## 5. 剩余工作包（技术细节）

### B0.2 · 高程口径收口的剩余部分

- 给 `VegetationLayer`、`SettlementLayer`、`WorldMarkerLayer`、`SlabPrototype` 都加可选的 `elevAt`（缺省回退全局），由 `PlaneStage` 构造时传入，做法与 `EntityLayer` 相同。
- 新增一条静态扫描测试：`render3d/` 下除 `terrain/VisualElevation.js` 与 `art/ElevationField.js` 外，所有 `surfaceElevation(` 调用点必须在同一函数作用域内带 `elevAt ||` 的回退。判据写成正则不稳，建议用"调用点清单快照"：列出文件名 + 行内文本，清单变化即失败，逼人显式更新。
- **验收：** 把 `PLANE_RENDER_PROFILE.upper.vegetation` 临时打开，植被贴在上界地形上而不是凡间高度。

### B1.1 · 标记与裂缝环

- `WorldMarkerLayer` 的裂缝环按决策 D6 **不做 Mask**，归界缘层：用 `riftViewModel.visibleRift` 的半径，在墙面开口处画一圈沿边界的细线；窗外的凡间标记（人物以外的 marker）用与植被相同的 `cellInside` 过滤。
- 需要读的代码：`WorldMarkerLayer.js` 的 `update` 与第 216、240 行的两处贴地。
- **验收：** 开窗后窗外的 marker 数 = 无窗时窗外 marker 数；窗内为 0。

### B1.2 · 墙的拾取与检视

- `PlanePicker.pick` 把 `SkirtLayer.mesh` 加入射线对象；命中的 `faceIndex >> 1` 就是边序号 k（每条边 2 个三角形，索引顺序已固定），再由 `mask.edges` 还原节点 n。
- 返回 `{ plane: 'boundary', x, y, wallH: rim.wallH[n], breach: breach[n], target }`；`Render3DAdapter` 的读数行与 `sandbox.inspectPlaneAt` 增加"界缘"分支。
- **注意：** `canSculpt` 要求 `hit.plane === 'mortal'`，界缘命中天然不可雕刻，无需额外守卫。

### B3 · 目标界内容补全

- 幽冥的冥河 / 阴气：`PLANE_RENDER_PROFILE.nether` 里 `water`、`vegetation` 目前关闭。要先读 `world.nether` 是否有 `water` 数组与其语义——**我没有核实**，不要照着凡间的水层直接开。
- 上界云气：可复用 `SkirtLayer` 的云气 Points 做目标界内的漂浮层；数据只需 `upper.qi`（中位数 0.94，几乎处处高，直接按 `qi` 做密度会铺满，需要按相对值归一）。
- Three FX 穿墙：`ThreeFxProbe` 已吃 `snapshotPlane`；穿墙是让跨界 arrive / depart 的起点 / 终点落在墙面开口处（用 `breach` 最大的边界节点），而不是新增事件源。

### B4 · 3D 里的真正划窗入口

- 现状（F5）：调试按钮直接给 `sandbox.selection` 赋值，**绕过 `commitSelection`，因此不开缝、不走 `tool.apply`**。
- 做法：在 `Render3DAdapter` 增加"视界工具激活时的拖拽手势"：`pointerdown` 起路径，`pointermove` 累积 `hit.world`（只收 `plane === 'mortal'` 的命中），`pointerup` 调 `sandbox.commitSelection(points)`。
- **需要先确认：** `commitSelection(points)` 期望的坐标系与 `normalizeRegion` 的输入形状（`main.js:1392` 起）。我读了流程但没逐行核对输入单位，**接线前必须读**。面积上限 `VIEW_MAX_AREA_FRAC = 0.4` 与"划选太小"的提示由它内部处理。
- 同时要处理 F6：进入 3D 时左栏被置 `inert`，视界工具按钮点不到，需要在 3D 里提供对应入口。

### AP.2 · 美术第二轮（建议顺序）

1. **实体重绘**：`EntityLayer` 的 Box 实例改成带 `gradientMap` 的 Toon 材质 + 顶面色提亮，先让人物 / 鬼魂融入色阶；再考虑 billboard 立绘。
2. **植被**：`pixelTree` 的 16×24 像素树与水墨冲突。方案：保留 InstancedMesh 与 alphaTest，把 DataTexture 换成程序生成的"墨点松" 贴图（参考 `tools/gen_art_assets.py` 的写法）。
3. **轮廓线**：对陡坡 / 水岸做屏幕空间的法线 / 深度边缘检测需要 RenderTarget，ROADMAP 里暂缓。低成本替代：只对界缘墙与山脊线（`slope` 高处）加 inverted-hull 描边。
4. **每界光照**：当前三界共享场景灯。幽冥可单独降低环境光并加冷色点光；改动要放在 `PlaneStage` 内的 per-stage 灯组（Three 的灯不能按层限制，需用 `layers` 或各 Stage 持有自己的灯并只在可见时加入场景）。
5. **HUD 统一**：DOM 面板已是水墨风；3D 里的"调试工具栏"是原型样式，M2 收尾时用 `--paper` / `--ink` 变量重绘。

---

## 6. 测试矩阵

| 门禁 | 作用 | 结果（安装包后的干净树） |
| --- | --- | --- |
| `inkbox-import-check`、`core-check`、`startup-check`、`runtime-events` | 基础健康 | 通过 |
| `inkbox-view`、`inkbox-presentation` | 视界契约、PresentationStage | 通过 |
| `test:render3d`（M0 19 组）、`:m1`、`:bridge`（36 项）、`:m2a`（13 组） | 既有 Render3D 契约，**一行未改** | 通过 |
| `test:render3d:art`（新增 12 组） | 见下 | 通过 |
| `npm run build` | 打包是否带上 `assets/art` | 通过：188 个文件，`assets/art` 与 `render3d/art` 都在包里 |

**新增 12 组钉住的不变量：** URL 开关；`ElevationField` 默认参数与 `surfaceElevation` 逐位相同（600 个随机点）；美术关闭时无高程场、无雾、无界缘；掩码表与暴力计算一致 + 缓存命中；墙高范围与方向；开窗后墙顶 / 墙脚与两张网格逐位相等；关窗后每个节点回到 base；窗外三层可见且窗内无物；裂缝开口来自 `riftViewModel`（已闭合与他界的缝不开口）；漂移阈值与最小间隔；源码卫生（不 import sim / world、不写世界数组、不用随机数）；`setArt` 运行时开关与 dispose 幂等。

**没有覆盖的：** 像素级视觉回归。`tools/art_screenshot.py` 能在固定种子、固定相机下截图，但我没有做图像比对，建议在你的机器上选定 3 个机位（凡间全图、上界窗、幽冥窗 + 裂缝）存为基线。

**性能门禁 `test:render3d:perf` 与 `:m2a:browser`、`:m2a:release` 我没有跑**：前者需要真实 GPU 与你的浏览器环境，后两者依赖 `reports/` 下的证据文件，我的工作树里没带。

---

## 7. 性能：我知道什么，不知道什么

**已测（Node，几何 / CPU 级）：**

| 项 | 数值 |
| --- | --- |
| 掩码 + 边界提取（288×180） | 0.8–2.6 ms，仅在区域身份变化时发生一次 |
| 墙三角数 | ≤ 808（最大 R≈39 的套索），相对 M2-A 窗开约 5.2 万三角可忽略 |
| 每帧漂移检查 | O(边界节点数) ≤ 几百次浮点比较 |
| 裂缝开口重算 | O(活跃缝数 × 边界节点数) ≤ 64 × ~400，仅在裂缝列表变化时（模拟每 30 日一次） |

**没测：** 真实 GPU 的帧时间。我的渲染环境是无头 Chromium + SwiftShader（CPU 软渲染），美术开 / 关都约 8 FPS，说明瓶颈在软件光栅，**不能据此得出任何性能结论**。

**美术层的增量（可从代码直接读出）：** 开窗时 +2 个 draw call（墙、云气 Points）；+2 个几何、+5 张小纹理（`cun` 256²、`edge` 256×16、`mist` 128²、2 条 128×1 色带，估计合计不到 1 MB 显存）、+1 张 4×1 的 `gradientMap`；地形材质由 Lambert 换成 Toon（片元开销同量级）。DOM 叠层是一层 `mix-blend-mode: multiply` 的合成层，**我推测**它在低端设备上可能不便宜（没有实测），所以是第一个该测的点：先单独关掉它对比帧时间。

**在你的机器上这样量：** 开 `test:render3d:perf` 与 `RenderDebug` 面板，对比"美术关 / 开"下的 frameMs p50 / p95、首次开窗耗时、重复开窗耗时、draw calls、triangles、`gpu.info.memory`。新增代价的预期上限（由代码推出，不是测量值）：draw calls +2、triangles +~1k、textures +6。

---

## 8. 风险登记

| # | 风险 | 级别 | 缓解 |
| --- | --- | --- | --- |
| R1 | 墙着色器未在真实 GPU（ANGLE / D3D11 / Metal）上验证；`isOrthographic`、`dFdx` 在个别驱动上精度不同 | 中 | 回退：`?art` 关；着色器无外部依赖，若报错只影响墙，可换成 `MeshBasicMaterial` + 顶点色 |
| R2 | 雾的 near / far 按默认机位标定；改相机距离会让整张图被雾吞掉或完全无雾 | 低 | 参数在 `artConfig.FOG`；若改 CameraRig 要同步 |
| R3 | `hMin=8 / hCap=26 / D=30 / s=0.6` 是我在一张种子上凭实测与截图定的初值，**不同种子 / 不同地图尺寸的观感没有逐一看过** | 中 | 全部在 `artConfig.js`；`inkbox-art-skirt-prototype.mjs` 可批量出数据 |
| R4 | 美术层与 3D 雕刻的交互：窗开时雕刻被 M2-A 禁用（F7），所以"边雕边看墙变化"今天不成立 | 低（现状）/ 高（G 系列） | G0 前置 |
| R5 | 读档 / 换世界 / 改尺寸发生在窗开着时 | 中 | `setWorld` → `releaseWorld` → `art.detach` 已覆盖，并有 `setArt` 重建测试；**读档时窗开着**的专门用例我没写 |
| R6 | 贴地口径漏改（B0.2 的 6 个调用点） | 中 | 见 B0.2；目前仅凡间层使用，所以不会出错，但是定时炸弹 |
| R7 | 三方版本：Three 0.186.1 已 vendored；`MeshToonMaterial.flatShading` 的行为依赖版本内部实现（F21） | 低 | `test:vendor` 逐字节钉 vendor；升级 Three 时重跑美术截图 |
| R8 | `assets/art/*.png` 的加载在 `file://` 下不可用 | 低 | 本项目本来就必须经 `scripts/inkbox-server.mjs`（ES module + importmap）；缺素材时退回程序生成占位，不报错 |
| R9 | DOM 纸纹叠层 `z-index: 2` 盖在 3D 画布上、低于调试工具栏（4）与读数（3） | 低 | 已在截图里确认不遮挡工具栏 |

---

## 9. 素材规范

全部由 `tools/gen_art_assets.py` 程序生成（numpy + Pillow，固定种子，可复现），**没有任何外部图片或第三方素材**。

| 文件 | 尺寸 | 用途 | 替换指南 |
| --- | --- | --- | --- |
| `paper_grain.png` | 512² 灰度 | DOM 叠层 `multiply` 的宣纸纤维，近白底（均值 ≈ 246） | 换手绘纸纹时保持**近白、可平铺**，否则整张图会变暗 |
| `cun.png` | 256² 灰度 | 墙的"皴"（竖向干笔飞白），R = 墨量 | 竖向可平铺；越黑越重 |
| `edge.png` | 256×16 灰度 | 墙缘墨线的毛边（沿边界方向的一维噪声） | 横向可平铺 |
| `mist_puff.png` | 128² RGBA | 界缘云气 sprite | 用 A 通道，中心不透明、边缘渐隐 |
| `ramp_upper.png`、`ramp_nether.png` | 128×1 | 墙体地层色带：左 = 凡间岩体，右 = 目标界 | 改色最直观的位置 |

**你的 163 张 PNG 我没有见到。** 接入它们之前我需要知道：哪些是实体 / 标记贴面，各自的像素尺寸与锚点，是否带 alpha，有没有版权限制。在此之前不要让 AI 去猜。

---

## 10. 玩法：镇 / 泄（G 系列）

### 10.1 前提：三个必须先解决的缺口

1. **G0 · 3D 干预与模拟不等价（F4、F6）。** 3D 雕刻只写 `height`，不 `recomputeRect`（type 与 qi 不更新）、不写 history 与编年；3D 里神力栏被禁用。"抬山镇幽冥"这条因果链在 3D 里断在第一步。做法：3D 雕刻改为调用 `sim/powers.sculpt`（它负责 `recomputeRect` 与 `history.record`），并经 `createInterventionOutcome` 写编年。**这碰模拟写路径，需要你显式授权。**
2. **G0b · 窗开着时不能雕刻（F7）。** 要让"边雕边看墙变厚"成立，需要允许雕刻**窗外**的凡间。判据：写入节点必须"至少接触一个窗外 quad"（整个 4 邻 quad 都在窗内的节点是被窗挡住的，不能改）。笔刷半径若跨进窗内，只写满足该判据的节点。这与契约"不能隔着窗口改下方凡间"是同向的，但仍属契约措辞的放宽，需你确认。
3. **G0c · 裂隙只在窗开着时推进（F8）。** 这是契约 C1.1。它让"镇 / 泄"变成"观察即介入"：你盯着窗，缝才在长、在漏。这是个很好的设计支点，但也意味着玩家不开窗时 `镇` 的效果不会累积。需要决定：调制在窗关闭期间是否也生效（我的建议：**否**，保持 C1.1）。

### 10.2 机制

**落差派生量【设计】（模拟侧纯函数）：** `seal(rift) = 以裂缝中心为圆心、半径 2 的 5×5 窗内，(凡间 height − 目标界 height) 的均值`。凡间越高、目标界越低，越"镇"。从三张高度图算出，**不新增存档字段**。

**标定（种子 20260929，288×180，凡间可走格 23292 个）：**

| 量 | p5 | p25 | p50 | p75 | p95 |
| --- | --- | --- | --- | --- | --- |
| 幽冥镇压 `M.h − N.h`（原始 height） | −0.278 | −0.131 | −0.024 | 0.112 | 0.294 |
| 上界抬升 `U.h − M.h` | −0.368 | −0.169 | −0.010 | 0.174 | 0.442 |

3D 笔刷单次中心冲量 = 0.035，所以把某处的镇压从 p25 推到 p75 约需 **7 次**满强度点按——"镇"是一件需要几笔才能做成的事，而不是点一下就好。

**阈值调制【设计】（只调阈值，不增减抽签）：** `hrng() < WRAITH_CLIMB_CHANCE · m(seal)`，`m = clamp(1 − 0.6·tanh((seal − s0)/0.15), 0.4, 1.6)`。`s0` 取标定的中位数附近。同形用于 `NETHER_ITEM_LEAK_CHANCE`（方向相反：薄则多漏）、`POSSESS_CHANCE`。

**为什么首期只做幽冥：** 幽冥缝的四个判定各用独立随机流、**每次调用无条件各抽一次**（`sim/rifts.js:1894–1898`），所以改阈值不改流位置。上界缝共用 `riftRngFor`，且抽中后还有第二次抽签 `upToDown`（`:2020–2025`），改阈值会改变后续抽签序列——这是允许的（新基线），但会让"同种子同结果"的比较在上界一侧失去参照。先做幽冥最干净。

**玩家的取舍：**

- **镇**：抬山压在缝上 → 墙墨色变浓、开口收窄，鬼爬出与夺舍概率下降，代价是幽冥物不再漏出。
- **泄**：削低 → 墙变薄，幽冥物与药草落地增多，代价是鬼与夺舍风险同步上升。
- 配合 `hCap` 的软饱和，"镇到极限"有边际递减，防止一劳永逸。

**墨色通道读数：** 墙的**几何**仍由 datum 差决定（形状稳定），**墨色浓度与开口宽度**读 `seal`。这样几何不会因为玩法数值而跳变，玩家用眼睛读到的是"这面墙有多厚实"。

**灵气渗流（候选，未核实）：** 各界 `qi` 中位数 凡间 0.30 / 上界 0.94 / 幽冥 0.22，存在天然梯度。但 `qi` 由 `applyTile` 从地形推导，而 3D 雕刻不重算它（F4），所以这一项依赖 G0。我没有读过 `qi` 在跨界里的实际用途，做之前先核实。

### 10.3 需要你显式授权的清单

| # | 授权内容 | 影响 |
| --- | --- | --- |
| A1 | 修改 `sim/rifts.js` 的三处判定阈值（仅幽冥） | 同种子长局结果与旧版不同；重立 digest 基线 |
| A2 | 新增模拟侧纯函数 `seal()` | 无存档变更 |
| A3 | 3D 雕刻改走 `powers.sculpt` + `createInterventionOutcome` | 3D 与 Canvas 的雕刻结果趋同；编年新增条目 |
| A4 | 放宽"窗开时不能雕刻"为"不能雕刻被窗挡住的节点" | 契约措辞变更 |
| A5 | 神力栏在 3D 里启用（或提供等价入口） | 输入与 UI 变更 |

### 10.4 推荐顺序

`B0.2 → B1.1 → B1.2 → B4`（纯渲染，先把"看得见、点得到、划得出"做完）→ `G0 / A3 / A4 / A5` → `A1 / A2`。**每一步一个独立提交，各自过全部门禁。**
