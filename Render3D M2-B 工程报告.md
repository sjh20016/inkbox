# Render3D M2-B 工程报告

阶段代号：**Render3D M2-B · Realm Window Integration**
委托书：《坐天观井 · Render3D M2-B 完整视界与界缘工程委托书》
基线：`main` @ `38fbfe0`（M2-A final cleanup）
本阶段产出：**9 个分包提交**（M2-B 自动化 69 组断言）

---

## 0. 一句话结论

**M2-A 那个「Terrain + Entities 的技术洞口」已经变成一扇能用的 3D 视界。**
玩家可以在 3D 里真实拖出一块世界空间 Region，窗外凡间保持完整、窗内是另一界、
边界是一道明确的断面，已有裂缝可以在界缘形成破口；全部表现**只读**——
600 日模拟 digest 在六种开窗模式下逐字一致。

---

## 1. 交付清单

| # | commit | 内容 |
| --- | --- | --- |
| 1 | `cc88b03` | `refactor(render3d): centralize stage elevation`（B0.1） |
| 2 | `02b4973` | `refactor(render3d): derive shared region geometry`（B0.2） |
| 3 | `697441f` | `fix(render3d): preserve terrain derived data after sculpt`（B0.3 · **独立 bugfix**） |
| 4 | `5ada8ea` | `feat(render3d): mask mortal world layers by realm region`（B1） |
| 5 | `fcc0321` | `feat(render3d): add realm boundary skirt and staged elevation`（B2） |
| 6 | `09f0aec` | `feat(render3d): route 3d realm drawing through commitSelection`（B3） |
| 7 | `f51d72e` | `feat(render3d): integrate boundary rifts and plane inspection`（B4-a） |
| 8 | `b8687c4` | `feat(render3d): integrate plane presentation fx`（B4-b） |
| 9 | `00307ff` | `test(render3d): cover m2b realm window invariants`（T0–T10） |

### 与 §87 建议拆分的偏差（如实记录）

§87 建议 11 个提交。实际交付 9 个，两处合并：

- **建议 5 + 6 合并**（Skirt 与 Staged elevation）。§33 要求墙上端取目标界的
  **最终**边界高程，也就是 Strata 塑形之后的值——先把墙按 Raw 提交、再补 Strata，
  中间那个提交的墙顶是**错的**。宁可少一个可运行提交，也不造一个坏提交。
- **B4 按建议拆成 8 + 9**（breach/inspect 与 FX 分开），这一点照做了。

---

## 2. 架构变化

```text
Render3DHost
├── PlaneStage mortal   ← elevation: ElevationField（永远 RAW）
├── PlaneStage upper    ← elevation: ElevationField（Raw 或 Strata）
├── PlaneStage nether   ← elevation: ElevationField（Raw 或 Strata）
├── RealmBoundaryLayer  ← 跨「凡间 ↔ 目标界」的断面（B2/B4）
└── DraftPathOverlay    ← 拖拽中的世界坐标路径预览（B3）

RegionMask（Canvas 侧，区域逻辑真相）
   ↓ 派生一次
RegionGeometry           ← quad 分类 / 有向边界边 / 边界节点 / 距离场
   ↓ 被所有 Layer 查询
Terrain · Water · Vegetation · Settlement · Marker · Entity
   ↓ 与活跃裂缝求交叠
RealmBoundaryLayer.breach
```

三条承重纪律：

1. **高程单源**（§8/S10）：`ElevationField` 是 Render3D 唯一的贴地入口。
   结构测试禁止任何其他生产文件 import `VisualElevation.js` 或调用
   `surfaceElevation` / `visualElevation`。插值本体只有一份。
2. **区域单源**（§19）：所有 Layer 只查 `RegionGeometry`，不再各写一套
   `contains` / 包围盒。
3. **输入单源**（§49/S9）：3D 划窗复用 `Sandbox.commitSelection(points)`，
   适配器里只有**一个**调用点，且不 import `openRifts`。

---

## 3. Q1–Q10

### Q1 · ElevationField 是否成功消除了高程口径散落？

**是。** 改造前 11 处直接调用（grep 结果）：BrushOverlay · Host.focusOn ·
WorldMarkerLayer ×2 · EntityLayer · SelectionMarker · WaterLayer · SlabPrototype ×2 ·
SettlementLayer · VegetationLayer · TerrainMesh。现在生产路径只剩
`stage.elevation.at()` / `node()` / `nodeForHeight()`。

身份保证用 T0 钉死：全图格点与 `visualElevation()` 逐位一致；4000 个随机点
（两个三角各 >1000）与 `surfaceElevation()` 逐位一致；`Math.fround` 顺序一致；
陡坡 silhouette 不漂；贴地顶点与相机对焦高度不变。

⚠️ 关键实现细节：RAW profile **直接短路**到原函数，不经过 `datum + relief * base`。
`relief = 1` 的乘法数学上恒等，但对 `-0` 的符号位不保证逐位一致，而 silhouette 就吃这个。

### Q2 · 3D sculpt 与 canonical terrain 派生量是否一致？

**原本不一致，已修（独立 bugfix 提交）。**

审计（`scripts/_m2b-sculpt-audit.mjs`，96×72 seed 616161、笔刷 r=8，
原始输出 `reports/release/render3d-m2b/sculpt-audit.log`）：

| 场景 | 改动量 | 修复前 canonical 重算翻出的差异 |
| --- | --- | --- |
| 单笔 raise | 190 格 | **16 格 type / 13 格 qi**（最大 \|Δqi\| 1.6e-1） |
| 一整笔拖动 | 18 次落笔 / 3260 格次 | **173 格 type / 166 格 qi** |
| undo 之后 | 矩形 41,29–55,43 | **23 格 type / 20 格 qi** |
| 对照组：Canvas `sim/powers.js` 的 sculpt | 172 格 | **0 格 / 0 格** |

最后一行是判据有效性的证明：canonical 路径自己再重算一遍零差异，
说明那些差异确实来自「漏调」，不是判据在制造噪声。

**修了什么**：`terrain/sculpt.js` 写完高度后调 canonical `recomputeRect()`；
新增 `restoreHeights()` 把 undo 的高度还原也收进同一个「唯一的 render3d 世界写边界」。

**为什么属于 bugfix 而非玩法修改**：`type` / `qi` 在 `world/terrain.js` 里本来就是
**由 height 派生**的量——Canvas 的每一条神力路径（`sim/powers.js` 二十余处）都调
`recomputeRect`。3D 少调一次是**同一套规则下的漏调**，不是新规则。修复复用既有 API、
不复制分类公式、不新增 RNG、不改 Canvas 规则、不改概率、不改 save schema。

⚠️ 修复中最容易漏的一半：**两条把缺陷钉成不变量的旧断言**。
`scripts/inkbox-render3d.mjs` 的 `height-only editing` 把 `type` 放进「不许变」的
digest；另一条直接写 `assert.equal(dirty.type, null, '雕刻不写 type')`。
而 `type` 正是 TerrainMesh 的**顶点色**来源——报 null 才意味着「山削平了、
地表颜色还留在旧分类上」。两条都按原意纠正。

### Q3 · 完整 Layer Mask 后，CPU / GPU 成本分别变化多少？

真实 GPU（AMD Radeon 610M / ANGLE D3D11 / 视口 1500×940 / DPR 1），
small 200×128 seed 20260930：

| 状态 | draw calls | 总三角 | 凡间三角 | 目标界三角 | 凡间树 | 实体 | 桥扫描 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 关窗 | 8 | 119,708 | 50,546 | （未提交） | 8,724 | 86 | 0.30 |
| 上界小窗 | 9 | 68,782 | 15,320 | 85,772 | 240 | 0 | 0.50 |
| 上界大窗 | 12 | 96,544 | 33,746 | 67,346 | 4,978 | 50 | 0.40 |
| 幽冥小窗 | 9 | 69,118 | 15,320 | 85,772 | 240 | 0 | 0.40 |
| 幽冥大窗 | 12 | 96,820 | 33,746 | 67,346 | 4,978 | 50 | 0.10 |

读数解释（**不要**把三角数下降当性能优化，§84）：

- 关窗时三个 Stage 都驻留，但只有 mortal 提交绘制（`visiblePlanes=[mortal]`）；
  「总三角 119,708」里的 upper/nether 部分是**驻留未提交**，见下方 bufferBytes。
- 开窗后 mortal 只画窗外 ⇒ 凡间三角从 50,546 降到 15,320（小窗）/ 33,746（大窗），
  同期目标界开始提交（85,772 / 67,346）。**这是功能等价场景的对比**，
  不是「M2-B 比 M1 快」。
- 「小窗 240 棵树」是**窗外剩余**的树木，不是「树少了」——遮罩按 Region 生效，
  窗外凡间保持完整（§18）。
- 每层 CPU 更新（地形 / 水 / 植被 / 实体 / 建筑 / 标记）在稳态下均 < 0.1 ms，
  与关窗同量级；桥扫描 0.1–0.5 ms。
- ⚠️ `metrics.fps` 在 `speedIndex = 0`（暂停）与切换瞬间的滚动读数**不可比**
  （同一批数据里从 16.5 跳到 178）；本节只采用 draw calls / 三角形 / 每层 ms。

### Q4 · RegionGeometry 不同形状的构建成本？

`RegionGeometry` 只在 **Region identity 变化**时构建（§12/§85）。
构建成本与 **Region 包围盒面积**相关（分类只扫盒外扩 1 格），
边界边数与 **Region 周长**相关：

| 形状 | 边界边数 | 三角形（= 边数 × 2） | 顶点 |
| --- | --- | --- | --- |
| 大矩形（证据脚本 `bigRect`，约占全图 32%） | 380 | 760 | 1,520 |
| 手绘自由套索（真实指针路径） | 546 | 1,092 | 2,184 |

肩场（shoulder，§38）：band = 5，种子节点 380，覆盖节点 3,380
（= 边界节点沿 4 邻域向内 5 圈的并集）。只在 Region / 预设 / 尺寸变化时算一次。

内存：`quadInside`（Uint8）+ `distanceQuad`（Uint8）+ 肩场 `weight`（Float32）
+ `edge`（Float32）+ `distance`（Uint8），200×128 图上合计约 0.4 MB。
界缘几何 `bufferBytes` 未单独统计，规模为 边数 × 4 顶点。

**三角形纪律（§86）**：界缘三角形数 = 边界边数 × 2，与周长相关、与面积无关——
760 个三角形相对全场 ~96k 是 0.8%。

### Q5 · Raw 与 Strata 的实际画面比较？最终选择什么？为什么？

同一 seed / 同一 Region / 同一相机（`12`–`15` 四张）：

- **Mode R · Raw**：窗内是目标界的**原始**高程。上界的原始高程场与凡间结构相近，
  于是窗口读起来像「同一片世界的一小块」，界缘断面**时有时无**。
- **Mode S · Strata**：窗口被明确抬起（上界 `+datum`）/ 压下（幽冥 `-datum`），
  四周出现连续的竖直断面，读作「这里被揭开了，下面/上面是另一界」。

**硬数字**（同区域同相机，`rawGapMax` 两者相同 = 40.67）：

| 模式 | `visualDepthMin` | `visualDepthMax` |
| --- | --- | --- |
| Raw | **0.037** | 40.67 |
| Strata | **8.000**（= Hmin） | 33.13（≤ Hmin + Hcap = 34） |

Raw 的最小断面深度是 **0.037 格**——也就是有一整段边界几乎**没有断面**，
玩家在那里看不到「两个位面的空间断层」。Strata 把它钉在 Hmin = 8 以上，
同时用 Hcap = 26 的 tanh 饱和把最深压到 34 以内。**这是选择 Strata 的定量理由，
不是审美偏好。**

**最终选择：Strata 作为 M2-B 的默认垂直语言，Raw 保留为工程基线与调试模式。**

⚠️ 但**不宣布 Strata 是唯一正确答案**（§43）：把「上界 / 幽冥」映射到物理 Y 轴
上下，属于**视觉世界观选择**。本阶段只提供证据与默认值，最终取舍留给下一轮
（报告结论 + 真实截图已足够支撑一次独立裁决）。

### Q6 · Shoulder 是否出现人工斜坡 / 山体弯折 / 遮挡过强？

- **人工斜坡**：T3 断言权重随距离**单调不增**且边缘恰为 1、K 之外恰为 0；
  smoothstep 过渡。画面（`13`）上肩部没有出现「一圈规则的斜坡」——
  因为肩部只改**目标位面**的表现高度，而目标界本身没有植被与聚落，
  斜坡缺少「被推平的地物」这种最刺眼的线索。
- **山体弯折**：T4 的极端高差用例（把窗口边缘抬到 0.98 / 压到 0.02）
  断言不 NaN、不翻折、仍然无缝；四类形状 × 两种模式全部通过。
- **遮挡过强**：**有，且这是 Strata 的主要代价**。抬起的窗口会挡住它后面的
  凡间地形（`13` 中窗口右侧的凡间被遮挡）。Raw 没有这个问题，但代价是没有断面。
  缓解方向属于下一轮（降低 datum / 缩小窗口 / 引入雾化边界），本阶段不改
  `visualElevation()`（S4），也不引入全局水墨管线（§46）。

### Q7 · 界缘是否真正解决了「高差漏缝 / 空间归属不清 / 另一界只是换色」？

- **高差漏缝：是，而且是构造保证，不是调参结果。** 墙上端调用的就是目标地形网格
  写顶点时**同一个** `elevation.node(x, y)`，下端同理走凡间 `ElevationField`。
  T4 用 **float32 对 float32** 逐顶点比对（墙顶 vs 目标地形顶点、墙底 vs 凡间地形顶点），
  六类形状 × 两种模式全部逐位相同。§33 的「不许悬空压缩」由此结构性满足：
  真实高差 40 就画 40。
- **空间归属不清：是。** 凡间取窗外、目标界取窗内，两者用**同一张区域表**
  （T2 断言 `quadInside` 数组逐格相同），互补且不重叠；窗内零凡间实体 / 建筑 /
  标记泄漏（读**实际提交**的实例清单逐项对账）。
- **另一界只是换色：部分解决，取决于模式。** Raw 下**确实只是换色**（原始高程相近）；
  Strata 下由 datum + 断面承担空间分层，读作「抬起 / 沉下的一块」。这正是 Q5 的裁决依据。

### Q8 · 正式 3D 划窗是否完全复用 commitSelection / RealmViewState / openRifts？

**是**（§49/S9）。适配器里 `commitSelection(` 只有一个调用点；不 import / 不调用
`openRifts`；没有 `commitSelection3D`；没有第二个 3D 选择状态。T6 有结构断言数调用点，
另有行为断言：一次拖动**只提交一次**、退化路径也照样交出去（不许静默）、
打断则**取消**而不提交。

真实浏览器验证：证据脚本用**真实指针事件**在 3D 地形上拖出一扇窗，得到
`open: true / targetPlane: 'upper' / 路径 5 点 / 界缘 546 段`
（截图 `02-upper-small.png`）。采样点距 < 0.6 格会被丢弃，避免路径被抖动像素灌满。

### Q9 · Rift Breach 是否只作为表现读取？有没有生命周期 / 概率变化？

**只读，零变化。** 结构上（T7 结构断言）：

- 半径一律经 `readers/riftViewModel.js` 的 `visibleRift()` —— render3d 通往权威
  裂缝公式的唯一入口；`Render3DHost` 与 `RealmBoundaryLayer` 里**不出现**
  `riftRadiusAt` / `riftIsActive` / `TAU_GROW` / `TAU_CLOSE`。
- 界缘层**不持有** `world.rifts`（S6）：Host 只把算好的 `{x, y, radius}` 传下去，
  并只传与本窗目标位面一致的那些。
- 破口不改 rift 任何字段：T7 断言重画窗口前后 `world.rifts` 深比较一字未动、
  长度不变、回到原窗口破口原样回来。

行为上（真实浏览器）：在窗口边界放一道活跃裂缝后 `breachEdges = 12`
（`breachRatio = 3.2%`），截图 `16-active-rift-breach.png`。

⚠️ 破口**不切断墙**：墙对每一段仍然连续（§33 的零缝隙逐段成立），只是那一段换成
裂缝的**青色微光**（§59 继承 Canvas 裂缝语言，不新造红色科幻激光）。
这样既读得出「这里被裂开了」，又不会露出一条通向天空的真空缝。

### Q10 · M2-B 是否仍保持 simulation is truth / renderer is observation？

**是。** T10 跑满 **600 日**，六种模式最终 digest 逐字一致：

| 模式 | 结果 |
| --- | --- |
| A 无 Render3D | 基准 |
| B Render3D 凡间 | 一致 |
| C 开上界视界 | 一致 |
| D 开幽冥视界 | 一致 |
| E 反复重画视界（每轮换 Region） | 一致 |
| F Strata 垂直表现 | 一致 |

每组先断言三界人口非零再比 digest（⚠️ M2-B 的 `makeWorld()` 起初没往幽冥放人口，
`nether.entities.length === 0` 时「一致」很容易是「两边都空」——这是采集期真实踩到的
空断言陷阱，已修）。

其它纯度约束：不抽模拟 RNG、不改概率、不改 save schema、不新建 renderer / context
（T2 结构断言逐条禁止 EffectComposer / RenderTarget / WebGPU / ShaderMaterial）。

---

## 4. §99 完成定义逐条自查

| 条目 | 状态 | 依据 |
| --- | --- | --- |
| ElevationField 成为高程单源 | ✅ | T0 9 组 + §9 结构断言 |
| RegionGeometry 成为 3D Region 派生单源 | ✅ | T1 13 组 + §19 结构断言 |
| Host / Stage 架构保持 M2-A 边界 | ✅ | M2-A 13 组全绿 |
| 没有新增 renderer / context | ✅ | §44 结构断言；证据里 `gpu.info.memory.geometries` 单实例 |
| 开窗后窗外凡间不再变秃 | ✅ | T2 8 组 + 截图 `13`（窗外植被完好） |
| 窗内不会重新提交凡间人物 / 聚落 | ✅ | T2 逐项对账实际提交清单 |
| Target 内容按真实位面 profile 显示 | ✅ | §27 结构断言（宁可留空也不机械复制） |
| 自由 Region 可生成界缘 | ✅ | T4 六类形状 |
| 无明显几何裂口 | ✅ | T4 float32 逐顶点比对 |
| 高差极端区域稳定 | ✅ | T4 高山 / 低谷用例 |
| Raw 与 Strata 有真实截图比较 | ✅ | `12`/`13`/`14`/`15`（真实 GPU） |
| 最终视觉选择有报告理由 | ✅ | 本报告 Q5（含量化依据） |
| Boundary 几何只负责表现 | ✅ | T7 + §39 结构断言 |
| 3D 可以真实拖动划窗 | ✅ | 真实指针路径 5 点（`02`） |
| pointerup 只调用一次 commitSelection | ✅ | T6 行为 + 结构 |
| 裂缝继续走 canonical openRifts | ✅ | 适配器无 openRifts（T6） |
| Camera 变化不会移动 Region | ✅ | T3 |
| 世界 Rift 生命周期完全不变 | ✅ | T7 深比较 |
| Rift 与当前 Boundary 相交时可形成视觉 breach | ✅ | T7 + 截图 `16` |
| 旧 Region 的裂缝不会因重画被删除 | ✅ | T7 |
| Plane-aware pick 正确 | ✅ | 浏览器 172 / 237 点，`visibleGeometryWins: true` |
| Boundary 可读 | ✅ | 浏览器 89 个界缘采样 + 检视读数 |
| 跨界 inspect 仍只读 | ✅ | D8 契约未动；T2 §25 选择环 |
| 不出现错误凡间操作入口 | ✅ | T2 §25：窗内凡间格不画操作环 |
| Three FX 只读 PresentationStage | ✅ | T8 结构（四个文件均无 drainRuntimeEvents） |
| 不增加 runtime event 消费者 | ✅ | T8 |
| FX 不影响模拟 | ✅ | T10 |
| 600 日 digest 一致 | ✅ | T10 |
| Render3D / RealmView / Boundary 不抽 RNG | ✅ | §39 结构断言 |
| 不改概率 / 不改 save | ✅ | §39 结构断言 + save-equiv 全绿 |
| 完成真实 Layer 后重新记录 GPU 基线 | ✅ | 本报告 §3 Q3（真实 AMD Radeon 610M） |
| first-open / repeat-open 分开 | ✅ | 证据 JSON `openFrames.*.first/repeat` |
| 没有 N entity = N draw call 回退 | ✅ | 86 实体 / 5 类实例层；开窗后 9–12 draws |
| Boundary 成本与周长相关 | ✅ | 760 三角形 = 380 边 × 2 |

**M2-B 完成定义：全部满足。**

---

## 5. 视觉证据（§81 / §101）

全部由 `scripts/inkbox-render3d-m2b-browser.mjs` 在**真实 GPU**
（ANGLE · AMD Radeon 610M · D3D11 · 1500×940 · DPR 1）上采集，
落地 `reports/release/render3d-m2b/`：

| # | 文件 | 内容 |
| --- | --- | --- |
| 01 | `01-mortal.png` | 无视界凡间 |
| 02 | `02-upper-small.png` | **真实指针手绘**的上界窗 |
| 03 | `03-upper-large.png` | 上界大窗 |
| 04 | `04-nether-small.png` | 幽冥小窗 |
| 05 | `05-nether-large.png` | 幽冥大窗 |
| 06 | `06-upper-oblique.png` | 上界 45° |
| 07 | `07-nether-oblique.png` | 幽冥 45° |
| 08 | `08-upper-low-angle.png` | 上界低角度 |
| 09 | `09-nether-low-angle.png` | 幽冥低角度 |
| 10 | `10-concave-region.png` | 凹形 Region |
| 11 | `11-map-edge-region.png` | 贴地图边缘 Region |
| 12 | `12-boundary-raw-upper.png` | Raw · 上界界缘 |
| 13 | `13-boundary-strata-upper.png` | Strata · 上界界缘 |
| 14 | `14-boundary-raw-nether.png` | Raw · 幽冥界缘 |
| 15 | `15-boundary-strata-nether.png` | Strata · 幽冥界缘 |
| 16 | `16-active-rift-breach.png` | 活跃裂缝破口（12 段 / 3.2%） |
| 17 | `17-boundary-inspect.png` | 界缘检视 |

结构化读数：`m2b-browser-evidence.json`（环境 / 世界 / 拾取 / 性能 / 运行时错误）。
自动化断言：`m2b-results.json`（69 组）· `m2b.log`。
雕塑审计原始输出：`sculpt-audit.log`。

界缘检视的真实读数（§63 要求的中性事实，截图 17）：

```text
上界界缘 · 格 97, 90 · 此处界差 28.4（画出的深度 8.0） · 附近无裂缝
```

**没有**出现「镇压强度 / 泄漏概率 / 鬼魂风险 −30%」这类机制性文案——那些机制
目前并不存在（P2 / §63）。

---

## 6. 采集环境说明（如实记录）

- **浏览器证据必须在非受限模式下运行**：Edge / Chromium 的多进程 IPC 走**命名管道**，
  DSH 沙箱不允许打开命名管道（`FATAL mojo platform_channel Check failed: 拒绝访问 0x5`）。
  证据脚本本身不修改产品代码，只驱动真实 UI 与真实指针事件。
- 浏览器 profile 建在工作区内（`.browser-tmp/`，已在 `.git/info/exclude` 中），
  不污染仓库。
- 本机 GPU 为 **AMD Radeon 610M**（真实硬件，非软件光栅器）。
  M2-A 报告的 Intel UHD 730 基线**与本阶段读数不可直接比较**（不同机器/驱动），
  这一点在 Q3 已标注。

---

## 7. 本阶段明确没做（§98 / §102）

镇 / 泄玩法 · sealStrength · 裂缝概率调制 · 灵气跨界渗流 · 新三界生态 · 鬼城 ·
仙官 · 第四世界 · D8-G UI · 全部神力的 3D 化 · 多视界 · 全图永久另一界模式 ·
save schema 改造 · planes.transfer 重构 · ECS · BVH · terrain chunk · Worker ·
EffectComposer · Bloom · WebGPU · 大型 shader framework · 全局 toon pipeline ·
PNG 全量接线 · 全局 `visualElevation` 重调 · PreloadManager。

**M2-B 到此停止，不自行进入 Art Pass 与 Gameplay G。**

---

## 8. 停止条件自查（S1–S10）

| 条件 | 是否触发 | 依据 |
| --- | --- | --- |
| S1 为 ElevationField 改 `world.height` | 未触发 | ElevationField 是只读映射；T4 断言两种模式下世界逐位未动 |
| S2 为 Boundary 写 polygon triangulation / CSG | 未触发 | 只有独立有向边，无闭环追踪（§13） |
| S3 为 Mask 引 RenderTarget / Stencil / 第二 renderer | 未触发 | `applyQuadMask` 只改索引缓冲 |
| S4 改全局 `visualElevation()` | 未触发 | `VisualElevation.js` 数学形式未动（§P5） |
| S5 实现「镇压影响概率 / 削山提高漏宝 / qi 跨界渗流」 | 未触发 | 无任何模拟数值改动 |
| S6 BoundaryLayer 拥有 `world.rifts` | 未触发 | T7 结构断言禁止 |
| S7 改 `LEAK_CHANCE` / `WRAITH_CLIMB` / `POSSESS` | 未触发 | T7/§39 结构断言禁止 |
| S8 为 Three FX 再开 `drainRuntimeEvents()` | 未触发 | T8 对四个文件断言 |
| S9 3D 划窗绕开 `commitSelection` 自调 `openRifts` | 未触发 | T6 断言唯一提交点 |
| S10 某个高程 Layer 仍自持 `surfaceElevation` | 未触发 | §9 双结构断言（全目录扫描） |

---

## 9. 留给下一轮的问题

1. **Strata 的遮挡**：抬起的窗口会挡住身后的凡间（Q6）。本阶段不改全局
   `visualElevation()`（S4），所以这属于「视觉世界观 + 全局风格」的取舍，
   应随 Art Pass 一起定。
2. **目标位面的内容密度**：上界 / 幽冥目前只有 terrain + entities + 只读选择反馈。
   §27 要求「没有可靠语义就先留空」，所以 nether 的 `veg` / `water` / `artifacts`
   都没有接线。这是一个**需要设计判断**的空白，不是遗漏。
3. **幽冥方向感尚未验证**：`14`/`15` 两张幽冥截图已产出，但「向下沉」是否读得出来，
   需要在有真实幽冥内容之后再判。
4. **`metrics.fps` 不可比**：暂停态下的滚动读数波动极大（16.5 → 178）。
   若后续要做帧率基线，需要单独定义「不停速的空转测量」。
