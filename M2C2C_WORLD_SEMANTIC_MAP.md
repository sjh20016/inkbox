# M2-C2C World Semantic Map

基于当前源码快照建立；只记录已有模拟事实及当前 Render3D 接线，不引入 World 字段或新玩法。字段的最终事实源是 World 与模拟代码，表现层派生值不回写 World。

## 语义事实表

| 对象 | 唯一事实源与真实字段 | 生命周期 / 读取路径 | Save 与身份 | 当前表现 / 边界 |
|---|---|---|---|---|
| `secret` | Mortal `world.sites[]` 项。`spawnSecretRealm` 写 `kind/sub/x/y/name/omen/reward/note/age/visits`；`World.addSite` 另分配 `id`。 | `stepSites` 累加 `age`、访问时增加 `visits`；第二次访问后探尽删除；寿命 160 年。创建入口 `sim/sites.js:82-104`，推进/删除 `:184-220`，常量 `:23-28`。 | `io/save.js:474-477` 写 sites/next id，`:1126-1129` 恢复。真实查找入口 `World.siteById(id)`，但现有 3D picker 没有映射到 site id。 | `deriveMarkers` 按 kind 派生 marker。Unknown kind 没有 fallback：`deriveMarkers` 找不到 bucket 后直接 `continue`（`render3d/markers/WorldMarkerLayer.js:85-91`）。 |
| `cave` | `world.sites[]`。`spawnCave` 写 `kind/x/y/name/reward/element/age/visits`；飞升者洞府由 `cultivation.js:914-929` 另建同 kind、带 owner 等字段的 site。 | `stepSites` 累加年龄/访问，尘封或超过 400 年移除；并非独立永久建筑。入口 `sim/sites.js:107-126,184-220`。 | 同上；id 由 `World.addSite` 分配，site 消失时 `removeSite` 从数组 splice（`world/World.js:423-426,494-510`）。 | 真实身份虽进入 marker 派生结果，`PlanePicker` 不命中 sites mesh，也不返回 `siteId`（`render3d/picking/PlanePicker.js:31-67`）。 |
| `formation` | `world.sites[]`。`spawnFormation` 写 `kind/x/y/name/note/age/visits`。 | `stepSites` 推年龄/访问；寿命 120 年后移除。入口 `sim/sites.js:131-148,184-220`。 | 同 Site 保存/恢复路径。 | 现有 marker 是几何符号；picker 缺少真实 site 身份映射。 |
| `ruin` | `world.sites[]`。没有对应 `spawnRuin`：主要由遗蜕 (`sim/life.js:1255-1270`) 或怨魂化 (`sim/reincarnation.js:481-498`) 创建，字段包括 `kind/x/y/name/reward`，可含 `artifactId/owner` 等，具体依创建路径而异。 | 通过同一个 `stepSites` 累加年龄并在 220 年后删除；寿命见 `sim/sites.js:23-28,184-220`。 | 同 Site 保存/恢复路径。 | 同 Site picker 缺口；实现不能假设所有 kind 有同一套 subtype 字段。 |
| `leyline`（凡间与上界分别持有） | 每个 World 自己的 `leylines[]`。`World.addLeyline` 分配 id，缺省为 `radius=7, strength=.35, element=null, owner=0, discovered=false`（`world/World.js:416-421,459-472`）。生成的 leyline 数目标为 `clamp(round(size/9000),3,9)`；受候选、间距、尝试上限影响可少于目标。 | Mortal 由 `worldgen.js:330-412` 生成；Upper 由 `worldgenUpper.js:471-507` 生成。两者生成 radius 均为整数 6–10，strength 均按 `.28 + pick.score*.35 + random()*.1`，但 score 来源不同。凡间实际因生成顺序只按高度打分：`.25 + height*.3 + rawNoise*.2`，阈值 `>.55`（`worldgen.js:344-365`，死代码原因见 `sim/territory.js:341-347`）；上界按 `height + rawNoise*.2`，阈值 `>.62`（`worldgenUpper.js:471-485`）。raw noise 约 `[-1,1]`（`core/noise.js:26-74`）；据 height `[0,1]` 推得生成 strength 理论区间凡间 `(.4725,.6425)`、上界 `(.497,.8)`。 | 写入 `leylines` 数组（`io/save.js:474-475`），通用 World 恢复（`:1126-1127`）；owner、discovered 随数组保存。Id 可由 `World.leylineById` 查找（`world/World.js:416-421`），但 3D picker 不返回 `leylineId`。 | `deriveMarkers` 保留 `id/x/y/strength`（`render3d/markers/WorldMarkerLayer.js:95-100`）。当前表现未按 strength 改观感；`sameList` 比较时忽略 strength（`:115-128`），未来若强度驱动视觉，更新比较也需覆盖此字段。 |
| Upper qi | `world.upper.qi`，World 网格上的 `Float32Array`，不是独立对象。`qiAtUpper` = terrain base × `UPPER_QI_SCALE(1.8)` + 半径内 leyline 的线性衰减 bonus，结果 clamp 到 1（`worldgenUpper.js:122-131,208-233`）。Terrain base 来自 `terrain.js:52-75` 的 `qiAt` 表；全格理论最低约 `.02*1.8=.036`，最高为 1。 | 生成时 `seedUpperLeylines` 后调用 `recomputeUpperQi`（`worldgenUpper.js:891-895`）。修士空间行为读取此网格；`UpperLife.stepSpatial` 每 10 游戏日运行，每实体通常每 20–60 日重选目标；修士在当前位置周围约 21 格内取 24 个可走候选并按 `qi + spatialRng()*0.05` 排序，凡人不偏好 qi。见 `sim/advance.js:59,121-128`、`sim/upperLife.js:101-125,314-408,729-812`。这是局部候选择优漫游，不是全局寻路。 | **不保存 qi 数组。** World 语义注释明确 qi 是依赖 terrain/type 与 leylines 的推导量（`worldgenUpper.js:79-84,227-231`）；save terrain 不含 qi（`io/save.js:290-301`），读档后上界通过 `restoreWorldState(upper,data,recomputeUpperQi)` 重算（`:941,1111-1113`）。故 C0 委托表中 “upper.qi 是否持久=是” 与实际实现不符。 | 不是 Picker 对象；field 只能作为对应 Upper World 的只读 presentation 输入。上界空间行为会改变 entity 所在格，从而间接改变 `cultivation.js:321,369` 读取的 qi 与修炼节奏；行为使用独立 `spatialRng`（`upperLife.js:27-41`）。 |
| Nether yin | `world.nether.veg`，即幽冥 `World.veg` 地形网格；不能按凡间语义解释为植物。生成场离冥河衰减，见 `worldgenNether.js:66,466-496`。 | 鬼/鬼修消散时对当地 `veg` 加 `DECAY_TRACE_VEG=.03`，上限 1（`sim/netherLife.js:217-230,1162-1186`）。这是现有模拟留下的持久空间记忆，不是新 Trace Field。 | Terrain `veg` 量化存档 `io/save.js:295`；幽冥读档解码到 `nether.veg`（`:1074`）。 | 不具独立 Picker 身份；只应在 Nether stage 作为该 world 的只读 field 表现。 |
| Rift | Rift 是凡间 `world.rifts[]` 活跃项，字段 `id/x/y/strength/openedDay/age/closedDay/leaked/crossed/targetPlane`；开缝时 `targetPlane` 是 `upper` 或 `nether`。创建见 `sim/rifts.js:850-892`，字段契约见 `world/World.js:187-211`。 | `age` 随裂隙系统步进累积；闭合后 `stepRifts` 将项从活动数组剔除，累计量进 `riftLog`（`sim/rifts.js:1960-1988`）。 | Save 显式保存十字段，包括 `age/targetPlane`（`io/save.js:514-554`），读档规范化恢复（`:1181-1200`）。Picker 当前不返回 Rift id。 | 唯一半径源是 `sim/rifts.js:556-603` 的 `riftRadiusAt(rift)`；Render3D 通过 `visibleRift` 读取权威公式（`render3d/readers/riftViewModel.js:1-7`），不自行算半径。marker 将 `targetPlane` 用于界缘色彩（`WorldMarkerLayer.js:103-108,181-203`）。持久 Rift 是凡界对象，但 `Render3DHost` 按 targetPlane 将活跃 Rift 送入对应跨界边界表示（`:27-38,221-247`）；marker 层中特意不套 Site/leyline 的 Region inside/outside 过滤（`WorldMarkerLayer.js:160-176`）。 |

## Runtime event 与唯一消费路径

凡间宗门争夺由 `stepSects` 调 `stepTerritory`，每跨 30 游戏日执行 `computeTerritory` 地形成本洪泛并将 claims 写入灵脉 owner（`sim/sects.js:189,450-488`、`sim/territory.js:34,429-529`）。`leylineApproach` 的可触达采样半径为 `ceil((radius || 7) + 8)`，只取可走格（`territory.js:357-376`）；strength 不参与归属评分。上界宗门目前的灵脉归属集合为空（`sim/upperLife.js:906-911`），不能将凡间争夺机制凭空移植到上界。

runtime event 存在 `core/runtimeEvents.js` 的 WeakMap 短队列，不进入 save。通用 payload 顶层允许 `x/y/intensity/subjectId/targetId/data`；事件类型登记见 `core/runtimeEvents.js:7-23`，写入/排队见 `:96-124`，唯一 drain 为 `drainRuntimeEvents`（`:133-138`）。

| Event | 当前真实 payload 与来源 | 语义边界 |
|---|---|---|
| `rift-open` | `openRifts` 只发 `{x,y}`，见 `sim/rifts.js:891-893`；队列层补 `plane/day`（`core/runtimeEvents.js:96-120`）。未显式传 plane 时取发射 world 的 `world.plane`。 | 不带 Rift id、targetPlane、强度或方向；当前创建口传入的是凡间 world，因此此事件 plane 是凡间，不是裂隙目标 realm。它不能独自决定目标界或拖墨方向；表现层需遵守“不猜”。 |
| `rift-cross` | `emitRiftCross` 按源/目标端发事件：顶层 `plane/x/y/subjectId/targetId/day`；`data` 包含 `kind/fromPlane/toPlane/fromX/fromY/toX/toY/fromKey/phase`，见 `sim/presentation.js:103-139`。 | 可据 `fromPlane/toPlane/phase` 表达方向；事件 schema 无 `riftId`，不应假造裂隙身份。夺舍调用通常只发 depart 端，目的端另由 `possession` 表现。 |
| `possession` | 真夺舍或暂时附身均发 `{x,y,subjectId,targetId,data:{mode}}`，见 `sim/possession.js:798-804,849-856`。 | `mode` 区分 `possess/haunt`；同文件随后另发 Nether→Mortal 的 `rift-cross` departure（`:805-813,857-864`）。 |
| `ascension` | `{x,y,subjectId}`，在飞升实体离开数组前发出（`sim/cultivation.js:879-885`）。 | 无 target plane / motion direction 字段；事件本身只证明该刻发生飞升。 |

消费顺序唯一为 `main.js:1986` → `PresentationStage.ingestWorlds` 收集根 world、`world.upper`、`world.nether`（`render/presentationStage.js:83-88`）→ 每界 `ingestWorld` 调 `drainRuntimeEvents` 并送入 FX（`:91-99`）→ `snapshotPlane` 返回只读位面快照（`:113-116`）。Render3D 通过 `Render3DAdapter` 传入 PresentationStage（`render3d/Render3DAdapter.js:305`），`Render3DHost`/`ThreeFxProbe` 只读 `snapshotPlane`（`render3d/Render3DHost.js:252,273`、`render3d/view/ThreeFxProbe.js:10-11,39-40`），不得增加第二处 drain。

## Render3D 接入事实与风险

- 唯一 World landmark 派生入口是 `deriveMarkers(world)`（`render3d/markers/WorldMarkerLayer.js:72-109`）；它已分别按 site kind、leyline、活动 Rift 从当前 World 读取身份与位置。`PlaneStage` 创建与更新该层（`render3d/stage/PlaneStage.js:64,206-214`）。Site family 可沿此层扩展，避免再造第二份 site derive。
- Site/leyline 当前**没有真实 3D Picker 身份映射**：`PlanePicker` 收集 entity/settlement/building/artifact meshes，解析这些对应记录；没有遍历 `stage.markers` 的 sites/leyline mesh，也没有 `siteId/leylineId`（`render3d/picking/PlanePicker.js:31-67`）。即便 marker derive item 有 `id`，该 id 目前没有进入 Picker 结果。
- 本阶段地理语义仅依据当前 World 已有对象与网格。视觉规划中未来的可走浮空岛、幽冥鬼城 / 鬼市、上界大型宫殿不作为本阶段实现依据；不新增这些 World kind、持久状态或拓扑。上界现有 terrain generator 的岛状高程属于已存在地形事实，不等于新增一套浮岛 World object。
- 上界位置漂移使用独立 `spatialRng`，不是 `UpperLife.rng`：空间采样仅消费空间流，但移动会改变修士读取 `world.qi` 的所在格，因而会间接改变修炼和世界线；边界说明见 `sim/upperLife.js:27-41,729-812`。表现开关必须保持对两条模拟流及位置推进无写入。
- 当前未识别 Site kind 会在 `deriveMarkers` 被跳过，不会 fallback 到 marker（`WorldMarkerLayer.js:85-91`）。若未来遵循“未知 kind 诚实 fallback”，应明确作为新接线处理。
- `WorldMarkerLayer` 对 site/leyline 执行 region inside/outside mask；Rift 被明确排除在该过滤外，因其是跨界持久对象（`WorldMarkerLayer.js:160-176,230-247`）。Mortal Site/leyline 不应因同坐标被投射为 Upper/Nether 语义；每个 stage 应只读自己的 World。跨界窗的边界 Rift 列表由 Host 根据 `targetPlane` 选择（`Render3DHost.js:27-38,221-247`）。
- 当前 `sameList` 仅比较 `id/x/y/radius`，不比较 `strength/targetPlane`（`WorldMarkerLayer.js:115-128`）。未来若强度或目标位面影响 marker 视觉，缓存比较也需覆盖这些真实字段，否则原位字段变化会被误判为无变化。

## 源码与运行时差异摘要

1. C0 委托中 upper qi 标记为持久；源码明确它是不入档的推导场，读档时重算。
2. C1.3/C2.3 要求真实 Site/leyline Picker identity；当前 Render3D `PlanePicker` 未接入这些 marker。
3. C1.5 提议未知 Site fallback；现有 `deriveMarkers` 对未知 kind 直接跳过。
4. `rift-open` payload 不含 Rift id、目标位面/方向；`rift-cross` 有跨界两端和 phase，但不含 Rift id；`ascension` 也没有方向字段。
5. Upper qi 的人—地行为是局部低频候选择优漂移，不是全图寻路；凡人上界实体不按 qi 选目标。

## 主要源码锚点

- `src/inkbox/world/World.js`：World 网格/数组与 add/lookup/remove (`:31-65,416-510`)
- `src/inkbox/sim/sites.js`：Site 字段、寿命、生成、访问、删除 (`:23-29,82-220`)
- `src/inkbox/sim/life.js`、`src/inkbox/sim/cultivation.js`、`src/inkbox/sim/reincarnation.js`：Ruin 与飞升洞府额外创建入口
- `src/inkbox/world/worldgen.js`、`src/inkbox/world/worldgenUpper.js`、`src/inkbox/sim/territory.js`、`src/inkbox/sim/sects.js`：Leyline 生成与宗门争夺
- `src/inkbox/io/save.js`：持久字段与读档重算 (`:290-301,474-477,514-554,826-941,995-1074,1126-1200,1384-1387`)
- `src/inkbox/sim/netherLife.js`、`src/inkbox/world/worldgenNether.js`：Nether yin generation 与死亡消散留痕
- `src/inkbox/sim/rifts.js`、`src/inkbox/render3d/readers/riftViewModel.js`：Rift 生命周期与权威半径
- `src/inkbox/core/runtimeEvents.js`、`src/inkbox/sim/presentation.js`、`src/inkbox/render/presentationStage.js`：事件 schema、跨界 payload、唯一队列消费者
- `src/inkbox/render3d/markers/WorldMarkerLayer.js`、`src/inkbox/render3d/picking/PlanePicker.js`、`src/inkbox/render3d/stage/PlaneStage.js`、`src/inkbox/render3d/Render3DHost.js`：现有 marker、Picker、stage 和 Rift 窗口接入

Package 3 的 geography feature gates（`sites/leylines/upperQi/netherYin/rifts/riftFx`）属于表现层开关；无论旧 marker 还是新地景，都应共用上文 `deriveMarkers` 的 World 派生结果，不复制另一份 World 语义推导。开关状态不得进入 World/save/RNG。

本文件为源码静态审计产物；没有修改运行时，也没有在此步骤执行测试。
