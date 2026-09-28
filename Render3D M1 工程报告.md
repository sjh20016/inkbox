# Render3D M1 工程报告 · 3D 世界实体可见化

- **阶段**：Render3D M0.5 → **M1**
- **委托书**：`坐天观井 · 下一阶段工程委托书.md`
- **执行模型署名**：DeepSeek v4.1
- **完成日期**：2026-09-28
- **唯一战略目标**：保留现有模拟世界作为唯一真相，让 Three.js 从「地形技术原型」成长为「可以实际观察世界的沙盘」。

---

## 一、修改文件列表

| 文件 | 改动 |
| --- | --- |
| `src/inkbox/render3d/Renderer3D.js` | 导入四个新层；`setWorld` 创建 `entities` / `settlements` / `markers` / `selectionMarker`；`update(dt)` 计算 `terrainChanged` 后依次刷新四层 + `markers.setZoom(camera.zoom)` + `selectionMarker.update`；新增 `setSelection(x,y)`；`render()` 上报 `entityInstances` / `houseInstances` / `markerInstances`；`releaseWorld()` 四层 `dispose` |
| `src/inkbox/render3d/Render3DAdapter.js` | 面板标题 `山河沙盘 · M0` → `山河沙盘 · M1`；`pointerdown` 后调 `renderer.setSelection(hit.x, hit.y)`；换世界时 `setSelection(null, null)`；诊断文本追加实体 / 建筑 / 标记实例数 |
| `package.json` | 新增 `"test:render3d:m1": "node scripts/inkbox-render3d-m1.mjs"` |
| `HANDOFF.md` | §0 改为「M1 已完成 · 下一阶段由用户裁决」；§1 补 M1 正式完成；§8 测试表更新为实测值；§11 由计划稿改为**实测稿**并补两条探针踩坑 |
| `STATUS.md` | 顶部阶段改为 M1 已完成；M1 小节补收尾实测读数 |
| `Render3D M1 工程报告.md` | 本文件（新增） |

> M0.5 阶段的文档真相修正（README / HANDOFF / STATUS）已在前一提交 `f91ffd0` 落地，不在本阶段改动内。

## 二、新增文件列表

| 文件 | 行数 | 性质 |
| --- | --- | --- |
| `src/inkbox/render3d/entities/deriveEntities.js` | 149 | 纯派生（零 THREE / 零 DOM / 零 RNG） |
| `src/inkbox/render3d/entities/EntityLayer.js` | 162 | 渲染层 |
| `src/inkbox/render3d/settlements/SettlementLayer.js` | 213 | 渲染层（含 `deriveSettlements` 纯函数） |
| `src/inkbox/render3d/markers/WorldMarkerLayer.js` | 273 | 渲染层（含 `deriveMarkers` 纯函数） |
| `src/inkbox/render3d/SelectionMarker.js` | 51 | 渲染层（纯表现） |
| `scripts/inkbox-render3d-m1.mjs` | 497 | M1 自动测试（36 项断言） |
| `scripts/_m1-viewshot.mjs` | 417 | 浏览器探针（RESEARCH，不进 build、不进测试链） |

**新增第三方依赖：零。** 运行依赖仍只有 `three@0.186.1` 一项；默认 Canvas 主线不加载 Three.js（靠 `?renderer=3d` 动态 import）。

## 三、每个 Layer 的职责

| Layer | 读什么 | 画什么 | 刷新 |
| --- | --- | --- | --- |
| **`deriveEntities` + `EntityLayer`** | `world.entities`（+ `world.wraiths`） | 按 5 个视觉类别（`human` / `cultivator` / `beast` / `spirit` / `wraith`）各一个 `InstancedMesh`；`instanceColor` 上色（修士用宗门色或境界色，其余用物种色）；贴地走 `surfaceElevation` | 15 Hz |
| **`SettlementLayer`** | `world.villages` / `village.houses` / `world.factions` | **只 2 个 `InstancedMesh`**（墙体盒 + 四边锥屋顶）；屋舍坐标直接复用 `houses` 的 `{x,y,type}`；`levelScale(level)`；`STRUCT.HALL` 放大；等级 ≥2 加中心建筑；宗门用 `capitalX/capitalY` + 宗门配色 | 4 Hz |
| **`WorldMarkerLayer`** | `world.artifacts` / `world.sites` / `world.leylines` / `world.rifts` | 法宝=八面体、地点=四类几何（secret/cave/formation/ruin）、灵脉=环、裂缝=环（半径 **`riftRadiusAt()` 现算**）；按 `camera.zoom` 做 LOD | 4 Hz |
| **`SelectionMarker`** | 3D 点选的格 | 贴地选中环（`depthTest:false`、`renderOrder=6`） | 每帧 |

**共同纪律**：每层持有**自己的只读快照**，自管刷新周期与去重（`sameEntities` / `sameSettlements` / `sameMarkers`）；**不给 `World` 加任何 Three.js 专用 dirty 字段**；`terrainChanged` 时强制重贴地。

## 四、新增 draw call 数量

本机 GPU 是 **软件光栅器**（`ANGLE (Microsoft, Microsoft Basic Render Driver, D3D11)`），读数只能作相对比较。

| 视角 | 总 draw call | 相对 M0 基线（地形/水/植被 = 3）的增量 |
| --- | --- | --- |
| 全图（`fit`，zoom=1） | **9** | **+6** ✅（契约「尽量 < 15」） |
| 近景（zoom=5） | **21** | +18 ⚠️（LOD 放出全部标记网格；契约硬指标「几十以内」✅） |
| 高人口世界（2832 实体，全图） | **6** | +3 ✅ |

**为什么近景会到 21**：LOD 在 zoom≥1.05/1.3/1.6 时分别放出地点 / 灵脉 / 法宝三类网格（共 7 个标记网格），加上实体 5 + 聚落 2 + 选中环 1。这是**设计使然**，不是漏优化。契约里「< 15 额外 draw calls」那句的主语是「**普通全图观察时**」，全图 +6 达标；近景的硬指标是「几十以内」，21 达标。

## 五、最大测试世界读数

### 世界 A（默认 288×180，探针用真工厂造的内容）

- entities **170**（human 109 / cultivator 16 / beast 29 / spirit 16 / wraith 0）
- house **4**（+ 聚落中心 0 + 宗门山门 1 = 建筑实例 **5**）
- marker **16**（法宝 6 / 地点 4 / 灵脉 6 / 裂缝 0）
- draw calls **9**（全图）· triangles 235,308
- FPS **25.9** · frame time **38.68 ms**

### 世界 B（large 384×240，高人口压力）

- entities **2832**（human 2202 / beast 280 / spirit 350 / cultivator 0→1）
- house **0** · marker **5**（灵脉）
- draw calls **6**（推进 30 日后 7）· triangles 442,932
- FPS **13.1** · frame time **76.32 ms**

> ⚠️ FPS / frame time **不代表真实显卡表现**：本机没有 GPU 加速（软件光栅器），M0 阶段在同一台机器上的读数也在这个量级。要拿真实性能数字必须在有独显的机器上重跑。

## 六、测试命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm run test:render3d`（M0 回归） | ✅ **19 组全过** |
| `npm run test:render3d:m1`（M1 新增） | ✅ **36 项 / 0 红** |
| `npm run test:core`（导入图 / 核心 / 启动 / 运行事件） | ✅ **72 文件 / 262 边**（M0.5 基线 67 / 246，+5 文件 +16 边） |
| `npm run test:view` | ✅ **111 项 / 0 红** |
| `npm run test:presentation` | ✅ **127 项 / 0 红** |
| `npm run build` | ✅ **113 files**（M0.5 基线 108，+5 新模块） |
| 浏览器探针 `node scripts/_m1-viewshot.mjs`（场景 A–F） | ✅ **全部通过** · 运行期**零控制台报错** |

### M1 自动测试（`test:render3d:m1`）覆盖组

G1 数据纯度（三档预设建层 + 24 帧 update 后 world digest 不变、update 幂等）· G2 EntityLayer（数量 / 分类 / 增删 / 移动 / 贴地）· G3 SettlementLayer（真实 house 坐标 / 等级只读 / 宗门山门 / 配色）· G4 标记层（法宝增删 / site kind / 灵脉 / **裂缝半径现算** / LOD）· G5 坐标契约（三往返 + 共用同一 `coordinates` 实例）· G6 确定性与纯度（乱序同结果 / 源码零 `Math.random` 零模拟 `rng(`）· G7 模拟不受影响（同 seed 两世界推进 600 日逐字段相同）· G8 构建（新模块自动入包）。

### 浏览器探针（场景 A–F）逐条结论

| 场景 | 结论 |
| --- | --- |
| **A 普通世界** | 地形 / 水 / 植被 / 人物 / 聚落 / 宗门同时在场景里；实例数=实体数（170=170）；建筑数=屋舍+中心+宗门（5=4+0+1）；全图 9 draws |
| **B 高人口世界** | 2832 实体 → **仅 6 draws**；实例数=实体数；推进 30 日后人物位置确实变化；帧循环存活 |
| **C 点击聚落** | 面板显示 `聚落 渡寨 · 村落 / 人口 0 / 势力 太白剑宗` —— **复用 `inspectAt()` 成功** |
| **D 点击修士群** | 面板显示 `修士 陆赤落 · 元婴 32 重 / 灵根 火主杂灵根（中）` |
| **E 雕刻** | 地形高度 0.6512 → 1.0000；实体实例 **ΣY 1147.92 → 1589.87**（跟着抬高，没沉入地下） |
| **F 3D ↔ Canvas ×10** | canvas 数不变（2→2）；世界同一份（day / 高度 / 实体数全同）；`scene.children` 稳定在 10 |

## 七、未完成项目

- **D8-G「跨界追迹」UI 未做**（地基已保存并由 `test:view` V9 钉住，本阶段按委托书要求不扩建）。
- **M1 只做凡间 3D**：上界 / 幽冥 / 3D 视界 / 三界切换 / D8 视觉效果迁移**未做**（委托书划给 M2/M3）。
- **裂缝在 3D 中是最简环**（委托书 §M1-C4 把它列为「暂时作为增强项」）。
- **无文字标签 / 图例**：实体与标记靠**颜色 + 几何**区分，屏幕上没有「什么颜色是什么」的说明。委托书的完成标准写的是「能辨认」，颜色区分做到了，但玩家第一次进来需要自己摸索。
- 长期未修项未动（`planes.transfer()` 仍抛错 · 无 `bornDay` · 零读者死数据等，见 `BACKLOG.md`）。

## 八、当前已知性能风险

1. **本机无 GPU 加速**：所有 FPS / frame time 读数来自软件光栅器（FPS 13–26）。**真实显卡表现未知**，必须在有独显的机器上重测才能下性能结论。
2. **近景 draw call 到 21**（LOD 放出全部标记网格）。绝对量级仍很小（远低于「几百 / 几千」的红线），但若 M2 再叠加三界标记，这个数会乘上去。
3. **实体刷新 15 Hz 是固定频率**，与实体数无关：2832 实体时每 66 ms 重写一次全部实例矩阵。若 M2 要提高人口上限，这里会成为热点（当前 `LIMITS.maxEntities = 3000`，`EntityLayer` 容量 3256）。
4. **`world.wraiths` 在本机实测恒为 0**（无裂隙穿越时幽冥本来就没有鬼），`wraith` 类网格因此从未在真实数据下渲染过——只有 node 测试的构造数据覆盖过它。

## 九、下一阶段建议（**不得自行开始**）

1. **在有独显的机器上重跑 M0 + M1 的性能读数**，把「软件光栅器 13 FPS」换成真实数字，再决定是否需要 LOD 2.0。
2. **M2 候选：三界 3D 化**（上界 / 幽冥的 `Renderer3D` 复用 + 位面切换）。M1 的分层结构（纯派生 + InstancedMesh + 自持快照）就是为这个准备的。
3. **给 3D 加一层极简图例 / 悬浮读数**（把颜色语义显式化），补上「辨认」的最后一步。
4. 若继续沿 3D 走，建议先做**一次真实 GPU 上的性能剖析**，再谈 D8 视觉效果迁移。

---

## 最终判断

> **当前 Three.js 是否已经达到「可以作为主要观察视图继续开发」的程度？**

**结论：达到了「可以继续开发」的程度，但还不足以「替代 Canvas 成为主要视图」。**

判断依据**全部来自实测**，不是代码量：

**支持「可以继续开发」的证据**——
1. **结构上是真的观察者**：数据纯度组（G1）证明建层 + 24 帧刷新后 world digest 逐字不变；G7 证明同 seed 两世界推进 600 日后地形 / 时间 / 人口 / 聚落逐字段相同；G6 证明渲染层源码零 `Math.random`、零模拟 `rng(`。
2. **该看见的都看得见**：探针 A 里实体 170=170、建筑 5=4+0+1，类别分布 human/cultivator/beast/spirit 全部正确；C/D 证明点击地面**完整复用** `inspectAt()`，面板如实吐出聚落名 / 人口 / 势力 / 修士境界 / 灵根。
3. **性能有余量**：全图 9 draws、2832 实体 6 draws，离「几百 / 几千」的红线极远。
4. **稳定**：3D ↔ Canvas 反复 10 次，canvas 数不变、世界是同一份、`scene.children` 不涨；整个探针**零控制台报错**。
5. **工具链没退化**：雕刻后实体 ΣY 跟着抬高 442 单位（不沉入地下），M0 的 19 组测试仍全过。

**还不足以「替代」的原因**——
1. **只覆盖凡间**。上界 / 幽冥 / 视界在 3D 里完全不存在，而这三样正是这个项目当前的核心玩法。
2. **性能读数不可信**。本机是软件光栅器，13–26 FPS 说明不了任何事；没有真实 GPU 的读数，就不能说「3D 已经够快」。
3. **视觉语言太薄**。没有文字、没有图例、没有悬浮提示；「能辨认」目前靠玩家自己记住颜色。

**所以**：M1 建立的是一副**可信、稳定、有余量、且经过验证的观察骨架**——足以支撑继续往 3D 走；但要成为主要视图，还差「三界覆盖 + 真实 GPU 性能验证 + 一层图例」这三步。
