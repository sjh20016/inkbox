# 《坐天观井 Inkbox · M2-C2B.1 收尾 + M2-C2C Meaningful Geography》
## 「有意义的地景」工程开发委托书 v1

**项目**：坐天观井 · Inkbox  
**阶段**：M2-C2B.1 → M2-C2C  
**建议主力模型**：GPT-6.1 Sol  
**施工基线**：`main` @ `e0a851c`  
**上位视觉约束**：`美术素材/三界视觉风格规划_美术方向文档_v1.md`  
**现有生产资产**：`assets/environment/environment_library.glb`、`assets/characters/cultivator/`  
**本阶段主题**：从“资产可生产”进入“世界语义可见”

本阶段一句话目标：

> 不再以“多做几个模型”为主要进度，而是让已经存在于模拟里的地点、资源场、阴气、灵气与跨界事件第一次拥有真实空间形态，让地图开始泄露自己的历史与因果。

---

# 0. 当前真实性基线

开工前必须接受以下事实，不得重做已经封板的工作：

- M2-C2B Pass 1 已完成；
- 当前正式环境库已有 4 个凡界建筑 family、Ghost Family、幽冥地面法宝、Upper/Nether 自然装饰；
- `RealmStyleProfile`、`EnvironmentAssetLibrary`、LOD/HLOD、RegionGeometry、ElevationField、PlaneStage、三界同屏已经是正式生产底座；
- 当前 HEAD 已获得：
  - Push Fast Gate 通过；
  - Push Heavy Gate 通过；
  - Windows Edge Browser Smoke 通过；
  - C2B 21-view Browser Matrix 通过；
  - C2B 600 + 6000 frame soak 通过；
  - Nightly 800 年 longrun 通过；
- M2-C2B 600 日 9 模式 / 11 RNG 流一致；
- 当前运行包约 8 MB 目录、约 2.6 MB ZIP；
- 当前 Git 仓库仍受 `reports/` 大量 PNG 膨胀影响；
- `BACKLOG.md`、`ROADMAP.md`、`STATUS.md` 等部分文字仍保留旧阶段口径。

本轮第一包必须先修正“仓库写着什么”和“主线实际上是什么”之间的偏差。

---

# PART A · M2-C2B.1
# Truth Sync + 生产规范收尾包

该包是 M2-C2C 的强制前置条件。

不得跳过后直接做新地景。

---

# A1. Truth Sync：仓库真相统一

首先读取并同步：

- `README.md`
- `STATUS.md`
- `HANDOFF.md`
- `ROADMAP.md`
- `ARCHITECTURE.md`
- `BACKLOG.md`
- `M2C2B_READINESS.md`
- `M2C2B_ASSET_PRODUCTION_REPORT.md`
- `M2C2B_REALM_CONTENT_REPORT.md`
- `ENTITY_PRESENTATION_CONTRACT.md`
- `tests/README.md`

必须修正以下已过时口径：

- “M2-C2B 远端 CI 待收口”
- “第一套正式资产家族未生产”
- “M2-C2B 尚未封板”
- 旧阶段仍被写成当前主线
- Browser / Nightly 仍写成本地或未验证

Truth Sync 完成后，所有当前状态文档必须统一写成：

> M2-C2B Pass 1 已在当前主线完成远端封板；第一代正式资产生产体系成立；下一阶段为 M2-C2C Meaningful Geography，未授权进一步扩展 World 语义之外的上界文明、幽冥城市或浮空岛拓扑。

必须提交一个单独的：

`docs: sync M2-C2B final truth`

或同等独立 commit。

不得把功能代码混进这个提交。

---

# A2. 生产规范正式化

新增长期上位规范：

`ASSET_PRODUCTION_SPEC.md`

它不是阶段报告，而是以后所有 AI 资产任务都必须先读的生产契约。

至少包含以下内容。

## A2.1 Asset ID 规范

正式资产 ID 使用：

`<realm>.<semantic>.<family>[.<variant>]`

例如：

```text
mortal.house.base
mortal.site.cave
mortal.site.formation
upper.decor.rock
nether.ghost.1
nether.artifact.ground
```

禁止：

- 用文件名直接当 World 语义；
- 用美术名倒推模拟身份；
- 一个视觉 variant 自动产生一个新 World kind。

## A2.2 P / D / L / X 四级资产状态成为长期制度

所有后续资产进入生产前必须分类：

- **P / Production-safe**：有真实 World 事实；
- **D / Decorative-only**：纯表现，无身份、无 picker、无 save；
- **L / Style-Lab only**：只用于概念与截图；
- **X / Blocked**：当前世界语义不允许进入正式世界。

此规则从 M2-C2B 的阶段性审计升级为长期生产规则。

## A2.3 共享几何与批次规范

当前 `EnvironmentBatch` 是固定容量 InstancedMesh。

第二批资产开始后，禁止机械执行：

> 1 asset family × LOD0/1/2/HLOD = 4 个永远独立的大容量 batch

长期规则改为：

### LOD0
允许保留 family 独特轮廓。

### LOD1
优先按 silhouette family 共享 geometry。

### LOD2
优先跨 family 共享远景闭合墨形。

### HLOD
按：
- roof family；
- site silhouette family；
- terrain accent family

共享，而不是每个资产复制一套 HLOD。

需要给 `EnvironmentAssetLibrary` / manifest 增加“多个 asset id 指向同一 node”的正式测试。

目标：

> 新增资产数量可以继续增长，但 GPU buffer 与 draw-call 不按资产数线性增长。

---

# A3. PresentationBudget 语义债收尾

当前：

- `RealmDecorationLayer` 借用 `tree` LOD；
- `RealmArtifactLayer` 借用 `tree` LOD。

本轮正式增加：

```text
decoration
artifact
site
```

三个 PresentationBudget category。

要求：

- 保持统一 projected-pixel 模型；
- 保持 hysteresis；
- 初始阈值以当前实测视觉为基线；
- 不为了“类别独立”随意改变现有观感；
- 增加对应 Node gate；
- `tree` 阈值以后只服务真正 vegetation。

若实测证明 `artifact` 数量极低且没有必要独立 density cap，也仍需有独立 threshold 语义，不得继续假装它是树。

---

# A4. Golden 与 Technical Proof 分家

当前部分 Golden 实际只是工程证明，例如镜头钻进山体只为证明 artifact picker。

从本轮起建立：

```text
reports/.../golden/
reports/.../proof/
reports/.../summary/
```

### Golden
只保存：
- 构图正常；
- 可作为未来 AI 美术参考；
- 体现真实游戏视觉质量；
- 可长期比较的固定视角。

### Proof
保存：
- picker；
- occlusion；
- seam；
- identity；
- stress；
- clipping；
- 技术极端角度。

Proof 默认进入 Actions Artifact / ignored report，不长期全部进 Git。

---

# A5. Git 证据止血规范

当前 `reports/` 已超过 100 MB。

从本轮开始：

每个正式阶段 Git 最多长期保留：

- 1 张总览；
- 1 张近景；
- 1 张关键语义图；
- 1 张跨界图；
- 必要时每界再增加 1 张；
- compact JSON summary。

建议单阶段正式 PNG 控制在约 6–8 张。

完整矩阵进入：
- Actions Artifact；
- 本机 ignored reports；
- 或 release evidence 包。

不重写已有 Git 历史。

从现在开始止血。

---

# A6. Browser Gate 分层规范

当前手动 Browser 回归已经接近 100 分钟。

本轮不要求立刻大改 CI，但要明确两类门禁：

### Current Stage Browser Acceptance
只覆盖当前阶段新契约与关键祖先回归。

### Full Historical Browser Regression
覆盖 Canvas / M2-A / M2-B / M2-C / C2A / C2B0 / C2B / 后续阶段。

后者只在：
- 手动封板；
- Nightly；
- Release candidate

运行。

不要在未来每个小阶段继续无限往一个单 job 里堆历史浏览器矩阵。

---

# A7. C2B.1 完成定义

只有以下全部完成，才能进入 C2C：

- 文档 truth sync 完成；
- M2-C2B 远端封板状态写回主线；
- `ASSET_PRODUCTION_SPEC.md` 建立；
- decoration / artifact / site LOD category 建立；
- Golden / Proof 证据规范落地；
- Git 证据止血规则写入测试 / 工程文档；
- 生产资产共享 LOD/HLOD 节点规则写入契约；
- 所有旧测试继续全绿。

---

# PART B · M2-C2C
# Meaningful Geography · 有意义的地景

---

# 1. 核心设计立场

M2-C2C 不以“多做模型”为目标。

它要解决：

> 玩家能否从地图本身读懂世界正在发生什么。

当前模拟已经真实存在以下空间事实：

## 凡界
- `world.sites`
  - `secret`
  - `cave`
  - `formation`
  - `ruin`
- `world.leylines`
- 聚落 / 宗门 / 法宝 / 裂隙
- 秘境、洞府、阵法拥有真实生命周期和访问结果

## 上界
- 独立 `upper.qi`
- 真实实体
- 修士会低频偏向高灵气位置
- 极简仙门已经存在，但没有正式聚落 / 宫殿语义

## 幽冥
- `nether.veg` 是真实阴气场
- 冥河是空间骨架
- 鬼魂 / 鬼修有真实活动范围
- 高阶鬼修会成为低阶实体的空间吸引源
- 鬼魂消散会真实抬高当地 `veg`

## 三界交界
- 持久 `world.rifts`
- `targetPlane`
- 半径 / 年龄 / 开闭
- 既有短命 runtime/presentation event：
  - `rift-open`
  - `rift-cross`
  - `possession`
  - `ascension`
  - 其它既有事件

所以本轮优先把这些已经存在的事实画出来。

---

# 2. 本轮明确不做

禁止把本轮扩成世界规则大改。

不做：

- 真正可走浮空岛；
- 上界大型宫城；
- 上界完整政治经济；
- 鬼城；
- 鬼市；
- 幽冥宗门；
- 幽冥战争；
- 新道路模拟；
- 新经济系统；
- 第四世界；
- 寻路 / A*；
- 全新 Site kind；
- 为了使用素材新增 World 字段；
- 将视觉热区写回模拟；
- 永久 Rift 污染场；
- 全量复杂骨骼动画；
- 大规模粒子系统。

这些如果被施工模型认为值得做，只写进后续候选，不实施。

---

# 3. C0：World Semantic Map 审计

正式施工前生成：

`M2C2C_WORLD_SEMANTIC_MAP.md`

必须逐项确认：

| 可视对象 | 唯一事实源 | 当前字段 | 生命周期 | Picker 身份 | 是否持久 |
|---|---|---|---|---|---|
| secret | `world.sites` | kind/sub/... | 有 | site id | 是 |
| cave | `world.sites` | kind/element/... | 有 | site id | 是 |
| formation | `world.sites` | kind/name/... | 有 | site id | 是 |
| ruin | `world.sites` | kind/... | 有 | site id | 是 |
| leyline | `world.leylines` | x/y/strength | 现有系统 | leyline id | 是 |
| upper qi | `upper.qi` | grid field | 世界生成/模拟 | 无独立对象 | 是 |
| nether yin | `nether.veg` | grid field | 世界生成+消散留痕 | 无独立对象 | 是 |
| rift | `world.rifts` | id/x/y/target/... | 开/长/闭 | rift id | 是 |
| rift event | presentation/runtime snapshot | event payload | 短命 | 无持久身份 | 否 |

禁止根据文档猜字段。

必须读真实源码和当前 save 路径。

---

# 4. C1：凡界 Site 正式地景家族

这是本阶段第一主交付。

目标：

> 把“地图上的一个 marker”升级为“玩家一眼认得出这是一个地方”的微型地景。

不增加任何 Site 玩法。

---

# 5. C1.1 第一批只做四个真实 kind

正式支持：

- `secret`
- `cave`
- `formation`
- `ruin`

不要一上来把每一种 secret subtype 都做成独立复杂建筑。

第一轮先建立四种强轮廓。

---

# 6. C1.2 微型地景原则

每个 Site 是一个 **Micro Diorama**。

典型占地：

约 2×2 ～ 6×6 世界格视觉范围。

不改变真实 terrain。

组成：

- 1 个主识别物；
- 0–3 个辅助模块；
- 少量 terrain-attached accent。

例如：

### Secret
一个“异象入口”主轮廓。

可根据真实 `sub` 在确认字段存在后使用：
- 剑形；
- 炉形；
- 残阵；
- 战场；
- 废府。

如果 subtype 语义无法稳定证明，则第一版只使用统一 Secret family，不猜。

### Cave
- 崖壁入口；
- 门石；
- 少量岩块。

### Formation
- 低矮石环；
- 4–8 个阵点；
- 极弱地表线。

### Ruin
- 残柱；
- 半截墙；
- 断基座。

重点是：

> 一眼可辨，不是建完整景区。

---

# 7. C1.3 Site 资产必须绑定真实身份

必须保留：

`instanceId -> site id -> current world.sites entry`

点击返回真实 Site。

禁止：

- decorative 入口返回假 site；
- Site 已消失后视觉残留；
- Secret 被探尽关闭后还留着永久建筑；
- Cave 已尘封 / Site 被 remove 后 GPU instance 不更新。

Site 生命周期必须在画面里真实消失。

---

# 8. C1.4 Site LOD 生产规范

建议：

### LOD0
独特主轮廓，约 60–220 tris。

### LOD1
共享 silhouette family，约 20–60 tris。

### LOD2
共享地景符号，约 6–16 tris。

Site 数量通常远低于树和人口，所以不用为单体省到失去身份。

但必须遵循 A2 的共享规则：

- LOD1 尽量共享；
- LOD2 大量共享；
- 不为每个 subtype 创建 3 个长期独立大容量 batch。

---

# 9. C1.5 旧 Marker 的处理

不得出现：

生产 Site 模型 + 原彩色 Marker 永远重叠。

推荐：

- `assets=off` / debug 使用旧 Marker；
- Production Assets 开启时：
  - 真实 Site 使用正式资产；
  - Marker 只保留必要选中 / debug 模式；
  - 找不到生产 asset 的未知 kind 才诚实 fallback marker。

不能复制第二份 site derive。

优先复用现有 `deriveMarkers()` 或将其重命名 / 抽取为单一 `deriveWorldLandmarks()`。

---

# 10. C2：灵脉地景化

`world.leylines` 已经是真实地理与宗门竞争资源。

现在不应该继续只是一枚紫色圈。

目标：

> 玩家不用打开面板，也能看出“这块土地为什么值得争”。

---

# 11. C2.1 灵脉表现原则

灵脉不是建筑。

推荐组成：

- 很薄的地表脉纹；
- 局部石色变化；
- 少量植物 / 岩体 palette accent；
- 低强度环状或脉络视觉；
- 强度来自真实 `leyline.strength`。

禁止：

- 造一座不存在的灵脉塔；
- 自动生成宗门建筑；
- 修改 qi；
- 修改 terrain；
- 修改宗门控制；
- 让视觉层决定谁占领灵脉。

---

# 12. C2.2 灵脉强度可视化

必须保持：

> strength 是强弱，不是颜色类别。

例如：

- 弱灵脉：只有极淡地纹；
- 中等：纹理更连续；
- 强灵脉：少量石青 / 淡金 / 植被差异。

不要做成 RPG 发光柱。

远景只允许成为一个低频色彩 / 地纹锚点。

---

# 13. C2.3 灵脉 Picker

继续返回真实 leyline。

生产地景不能吞掉现有检视能力。

---

# 14. C3：幽冥阴气场可视化

这是本阶段第二个核心。

当前 `nether.veg` 不是植物。

它是阴气。

而且它是真正会被历史改变的持久场：

鬼魂消散地点会提高 `veg`。

因此：

> 这是《坐天观井》最值得被画出来的世界历史之一。

---

# 15. C3.1 不新增 Trace Field

本轮不创建新的幽冥历史字段。

直接读取真实：

`nether.veg`

表现层只做翻译。

---

# 16. C3.2 阴气表现应以“低频构图”为主

不要用：

- 5000 个骷髅；
- 5000 个鬼火；
- 5000 块小石头。

优先：

### Terrain Material
让高 `veg` 区域出现：
- 更深吸墨；
- 更冷的灰绿；
- 更强干笔；
- 局部骨白反差；
- 墨团边缘；
- 少量朱红仍只属于真实 Rift / soul-lamp / identity accent。

### RealmDecoration
高 `veg` 区域允许：
- 更高概率的枯石 / 斜柱；
- 更密但有上限的墨烟；
- 更少纸白。

低 `veg` 区域保持荒、空、纸色更多。

目标：

> 玩家几十年后回来，能看见某些鬼长期聚集过的地方“阴下去了”。

但不新增“阴巢”或“鬼城” World kind。

---

# 17. C3.3 冥河必须继续是空间骨架

阴气可视化必须考虑：

- 冥河邻近；
- `nether.veg`；
- terrain height；
- 当前真实 ghost density 只可作为瞬时观察，不作为持久布局输入。

禁止：

> 因为某帧鬼多，就永久画一座黑城。

---

# 18. C3.4 幽冥构图目标

当前 Nether 已有不错的高频焦墨。

本轮要增加：

- 大暗域；
- 大空域；
- 墨团 vs 负空间；
- 局部视觉重心。

不是继续把整张地图每一格都变得更复杂。

---

# 19. C4：上界灵气地理可视化

上界已有真实 `upper.qi`。

并且修士空间行为会偏向灵气厚处。

所以本轮要让玩家第一次读懂：

> 为什么那些仙人会聚在那座山。

---

# 20. C4.1 高灵气不是新 Site

高 `qi` 区域仍然只是环境属性。

禁止创建：

- `meditationSite`
- `immortalPlatform`
- `holyPeak`

等不存在的 World 对象。

---

# 21. C4.2 上界高灵气表现

可通过：

- 石青 / 石绿层次更清晰；
- 少量赭金矿物边缘；
- 更干净的纸白；
- 更轻的云气 wash；
- terrain-attached 自然石台；
- 少量非交互岩体装饰；
- 适度降低杂乱纹理。

让高灵气区域看起来：

> 清、升、静、聚。

不要做霓虹灵气光柱。

---

# 22. C4.3 上界“人—地关系”证据

新增一个只读分析脚本：

`inkbox-upper-qi-spatial-proof.mjs`

固定 seed / 固定年数，统计：

- upper entity 所在格 qi；
- 全图 walkable qi；
- 修士位置与 qi 分位；
- 一段时间内位置变化。

它不是测试“渲染让修士去高 qi”。

它要证明：

> 模拟本来就在做这件事；画面只是把已有因果显出来。

该脚本不得写 World。

---

# 23. C5：裂隙升级为“世界伤口”

当前 Rift 已有：

- 真实持久对象；
- `targetPlane`；
- 年龄；
- 动态 radius；
- 跨界效果；
- runtime / presentation event。

现在视觉应该从“一个圆环”升级到：

> 三界真正相互渗漏的伤口。

---

# 24. C5.1 持久 Rift 外观

静态 / 持久部分只来自真实 Rift：

- radius；
- age；
- targetPlane；
- World position。

### Upper Rift
倾向：
- 石青；
- 淡金；
- 冷白；
- 极薄矿物色断线。

### Nether Rift
倾向：
- 焦墨；
- 骨白；
- 少量朱红；
- 更破碎的边缘。

不得全屏后处理。

---

# 25. C5.2 短命 Rift FX

只消费已有 Presentation snapshot。

不要自己再次 `drainRuntimeEvents()`。

允许映射：

- `rift-open`
- `rift-cross`
- `possession`
- `ascension`

等已经存在且经过审计的事件。

例如：

### rift-open
极短的界缘裂墨扩张。

### rift-cross
沿真实跨界方向出现一条短命拖墨 / 飞白。

### possession
只在真实 possession event 存在时出现极细朱红断线或魂影收束。

### ascension
只对真实飞升事件做短命上升型纸墨 / 金青 FX。

如 event payload 没有提供某个方向 / subtype：

> 不猜。

只做通用版本。

---

# 26. C5.3 FX 必须池化

禁止：

`event -> new Mesh -> remove -> dispose`

必须：

- fixed pool；
- bounded capacity；
- reuse；
- overflow counter；
- deterministic visual variation only from event immutable data / stable hash；
- 不抽模拟 RNG。

---

# 27. C6：角色“活起来”试验包（条件实施）

该包不是 M2-C2C 核心完成条件。

只有 C1–C5 全部通过性能与纯度门禁后才允许施工。

---

# 28. C6.1 只做 Minimal Motion Readability

优先复用现有：

- Idle；
- Walk；
- `x/y/tx/ty/state/anim/face`；
- 角色 rig。

第一轮只要求：

- 静止：Idle；
- 实际位置在移动：Walk；
- 朝向正确；
- Ghost：极低成本漂浮 / 摆动；
- GhostCultivator：复用正式角色动作。

不得新增模拟状态。

不得把：

`wander`

解释成职业或复杂行为。

---

# 29. C6.2 动画性能红线

禁止把大量角色改成：

> 一人一个独立 SkinnedMesh + 一套独立 Mixer。

如果当前正式批处理架构无法低成本承载群体动画：

只做小规模 Pilot / Lab。

M2-C2C 仍可封板。

不要为了“人物会走路”拆掉已经成立的实体批处理体系。

---

# 30. C7：Movement Trace 研究支线（Research Only）

这是为未来“人走成路”准备的数据实验。

不进入正式运行时。

新增：

`research/inkbox-movement-trace.mjs`

或同类 headless 脚本。

固定 seed，运行例如 200–300 年。

按合理间隔只读采样：

- 凡界实体位置；
- village；
- site；
- leyline；
- sect ownership。

累积 cell traffic heatmap。

输出：

- compact JSON；
- 可选研究 PNG；
- top corridors；
- origin / destination proximity 统计。

研究要回答：

1. 是否自然形成稳定高流量走廊？
2. 村落 ↔ 灵脉是否出现明显路径？
3. 村落 ↔ Site 是否形成可解释流？
4. 高流量区域是否只是人口密度的同义词？
5. 是否值得未来把道路做成持久世界痕迹？

本轮禁止：

- 把 heatmap 写回 World；
- 自动生成道路；
- 修改移动 AI；
- 新增交通经济。

研究失败不影响 M2-C2C 封板。

---

# 31. Region / 三界同屏纪律

C1–C5 全部必须服从现有 `RegionGeometry`。

特别注意：

### Mortal Site / Leyline
打开 Upper / Nether window 时：
- 凡界地景不能漏进目标位面窗口；
- 目标位面不能凭同坐标生成对应 Site。

同坐标不等于同语义。

### Upper qi
只来自 Upper world。

### Nether veg
只来自 Nether world。

### Rift
Rift 是凡界持久对象，但其 Target Realm 的界缘表达必须服从已有 Rift / Boundary 契约。

不得为了方便把三界 Grid Field 混成一张全局 texture。

---

# 32. 数据纹理与材质建议

优先复用 M2-C 已有 GPU 数据纹理思路。

可建立只读：

- `upper.qi` field texture；
- `nether.veg` field texture。

要求：

- World field 是单一真相；
- texture 是只读 presentation cache；
- dirty 只在对应 field 改变时上传；
- 不逐帧整图重建；
- World 更换时正确 dispose；
- 不写回 field。

若当前 Bridge 没有对应 dirty 分类：

先测。

不要为了理论纯洁立刻大改 Bridge。

如字段更新频率足够低，可先用明确、有界的 refresh cadence，并记录技术债。

---

# 33. 性能预算

本轮的风险不是三角形，而是：

- 新的环境批次；
- Site batch；
- field texture；
- Rift FX；
- Decoration density。

因此报告必须分别记录：

- triangles；
- draw calls；
- geometry count；
- texture count；
- program count；
- instance buffer capacity；
- field texture upload count；
- Site count；
- leyline count；
- decoration count；
- FX active / pool overflow；
- CPU update；
- CPU submit；
- GPU time。

---

# 34. Draw Call 目标

当前凡界 overview 约 15 draw calls。

本轮不得因为 Site / Leyline 生产化直接变成几十上百。

建议：

### Mortal overview
目标控制在：

约 15–24 draws 量级。

### Cross-realm
允许更高，但必须解释每层来源。

如果 4 种 Site 各自 LOD0/1/2 全部变成 12 个新长期 batch：

优先检查是否可共享 LOD1 / LOD2。

不要用“数量不多所以没关系”跳过生产规范。

---

# 35. Field Texture 预算

新增 Upper qi / Nether veg texture 时：

- 优先单通道；
- 尺寸与 World grid 一致或经过明确降采样；
- 不使用高精度格式解决不存在的问题；
- 三界总显存增量记录在报告；
- 不为一个 scalar field 创建 RGBA32F。

---

# 36. 模拟纯度门禁

重新跑至少：

1. no render
2. C2B production
3. C2C sites on
4. C2C leyline on
5. C2C upper qi visual on
6. C2C nether yin visual on
7. C2C rift FX on
8. all C2C on
9. Upper window
10. Nether window
11. toggle-cycle

至少 600 日。

比较：

- World SHA；
- advanceState SHA；
- save SHA；
- save keys；
- 11 RNG streams；
- Upper / Nether 独立行为流位置（若现有证据可读）。

表现开关前后必须一致。

---

# 37. 生命周期门禁

至少：

### 600-frame
连续：
- rotate；
- pan；
- zoom；
- Realm window open/close；
- Site/field/FX production toggles；
- LOD；
- realm style。

### 6000-frame soak
覆盖：
- Mortal；
- Upper；
- Nether；
- 两种跨界窗口；
- Rift active；
- Site dense；
- high qi；
- high nether veg；
- FX burst。

记录资源基线与末值。

不得持续增长。

---

# 38. 视觉标准截图矩阵

Git 不保存完整矩阵，只保存代表 Golden。

完整矩阵进入 Artifact。

至少检查：

## Mortal
- overview
- site-secret near
- site-cave near
- site-formation near
- site-ruin near
- leyline mid
- site + village mixed

## Upper
- overview
- high-qi peak
- low-qi comparison
- upper entity + high qi
- cross window

## Nether
- overview
- high-veg region
- low-veg region
- ghost cluster
- old decay-trace region
- cross window

## Rift
- upper rift
- nether rift
- rift-open FX
- rift-cross FX
- breach near

---

# 39. 视觉验收

## Site
必须看起来是世界里的地方，不是 UI 图标立体化。

不允许：
- 彩色发光碑；
- RPG 宝箱式入口；
- 每个 Site 一栋高塔。

## Leyline
必须像“土地有异”，不是“地上插任务标”。

## Upper qi
高 qi 应读成：
- 清；
- 静；
- 矿物色层次；
- 云气；
- 值得停留。

不是：
- 荧光；
- 霓虹；
- 粒子喷泉。

## Nether veg
高阴气应读成：
- 墨沉；
- 空间变重；
- 冷；
- 有历史积累。

不是：
- 全地图变黑；
- 骷髅密度更高；
- 红雾更浓。

## Rift
必须像“世界裂开”。

不是科幻传送门。

---

# 40. 工程施工顺序

严格按以下 Package 执行。

## Package 0 · C2B.1 Truth Sync
只改：
- 文档；
- 状态；
- CI / evidence 说明。

停止条件：
> 仓库所有“当前阶段”描述与真实 HEAD 一致。

## Package 1 · Production Contract Closeout
完成：
- `ASSET_PRODUCTION_SPEC.md`
- shared LOD/HLOD 规则
- PresentationBudget `site / decoration / artifact`
- Golden / Proof 规则
- evidence Git policy

停止条件：
> 现有 C2B 行为与画面无非预期变化。

## Package 2 · C2C Semantic Audit
生成：
`M2C2C_WORLD_SEMANTIC_MAP.md`

不改运行逻辑。

停止条件：
> Site / Leyline / Upper qi / Nether veg / Rift / events 的事实源全部钉死。

## Package 3 · Site Family Pilot
只做一个 `cave` 或 `formation`。

验证：
- EnvironmentAssetLibrary；
- identity；
- Region；
- LOD；
- package；
- lifecycle；
- assets=off fallback。

失败则先修，不扩到四类。

## Package 4 · Full Site Family
扩展：
- secret
- cave
- formation
- ruin

完成 Marker fallback / production path 收口。

## Package 5 · Leyline Geography
将真实灵脉从 Marker 升级为低干预地景。

## Package 6 · Nether Yin Field
接入 `nether.veg` 只读 field presentation。

优先做材质低频构图，再决定是否需要增加 decoration 响应。

## Package 7 · Upper Qi Field
接入 `upper.qi` 只读 field presentation。

同时生成 `upper-qi-spatial-proof`。

## Package 8 · Rift Narrative FX
升级持久 Rift 外观 + 短命 pooled FX。

禁止新增持久污染字段。

## Package 9 · Cross-Realm Acceptance
统一验证：
- Site；
- Leyline；
- qi；
- yin；
- Rift；
- Region；
- picker；
- Stage isolation。

失败则停止。

## Package 10 · Performance + Purity + Soak
完成：
- performance matrix；
- 600 日纯度；
- 600 + 6000 frame；
- clean clone；
- package audit。

## Package 11 · Visual Seal
只保留少量正式 Golden。

生成：
- `M2C2C_MEANINGFUL_GEOGRAPHY_REPORT.md`
- `M2C2C_PERFORMANCE_REPORT.md`
- `M2C2C_VISUAL_ACCEPTANCE.md`
- `M2C2C_READINESS.md`

## Package R1 · Minimal Animation Pilot
仅在 Package 0–11 全绿后实施。

失败或成本不合理：
> 退回 Research / Lab，不阻塞 C2C。

## Package R2 · Movement Trace Research
Headless only。

结果只用于决定下一阶段是否值得做“人走成路”。

---

# 41. 自动化门禁建议

新增：

```bash
npm run test:render3d:m2c2c
npm run test:render3d:m2c2c:sites
npm run test:render3d:m2c2c:fields
npm run test:render3d:m2c2c:rifts
npm run test:render3d:m2c2c:purity
npm run test:render3d:m2c2c:browser
npm run test:render3d:m2c2c:soak
```

Fast Gate 至少包括：

- semantic contract；
- sites；
- fields；
- rifts；
- purity；
- build。

完整 Browser Historical Regression 不需要每个普通 push 自动运行。

---

# 42. 禁止的“聪明扩展”

执行模型尤其不得：

- 看见 `terr_immortalcave` 就新建新洞府系统；
- 看见 `upper_palace` 就随机生成上界宫殿；
- 看见 `nether_city` 就造鬼城；
- 把高 qi 地方自动变成仙门；
- 把高 veg 地方自动变成鬼巢 World object；
- 把灵脉改成资源产出系统；
- 把 Site 改成副本系统；
- 把 Movement Trace 直接变成道路；
- 为 Rift FX 新增持久污染；
- 为动画新增实体状态；
- 为好看改模拟 RNG；
- 为好看改变 Site / Leyline 坐标；
- 为截图删树；
- 为性能减少 World 对象；
- 用全屏后处理假装完成三界地理分化。

---

# 43. 本轮完成定义

M2-C2C 只有满足以下条件才算封板：

### Truth
- C2B.1 truth-sync 完成；
- ROADMAP / STATUS / HANDOFF / README / ARCHITECTURE 一致。

### Production
- 生产规范成为长期契约；
- shared LOD/HLOD 规则成立；
- Site / Decoration / Artifact 有独立 PresentationBudget 语义。

### Mortal
- 4 类真实 Site 有正式地景；
- Leyline 有正式低干预地理表现；
- identity / picker 正确；
- 生命周期正确。

### Upper
- qi 已成为可读地理；
- 不新增假 Site / 宫殿 / 浮岛；
- 修士聚集与 qi 的关系有只读证据。

### Nether
- `veg` 阴气历史可读；
- 构图比 C2B 更有大块墨域 / 空域；
- 不新增鬼城；
- 不新增持久 Trace field。

### Rift
- 持久裂隙更像世界伤口；
- 已有真实事件有短命 pooled FX；
- 不重复 drain event queue。

### Engineering
- Region / picker / Stage isolation 全绿；
- 600 日多模式 digest / RNG 一致；
- 6000 帧资源稳定；
- clean clone / build / package 通过；
- runtime 包无 source / preview / full evidence；
- Git 不再提交整套大图矩阵。

---

# 44. 最终必须回答的 24 个问题

封板报告必须逐项回答：

1. C2B truth-sync 改了哪些过时状态？
2. `ASSET_PRODUCTION_SPEC.md` 是否成为正式上位规则？
3. Site / Decoration / Artifact 是否拥有独立 LOD category？
4. 哪些 LOD1/LOD2/HLOD geometry 已开始跨 family 共享？
5. 四种 Site 分别使用什么真实 World 字段？
6. Site 消失后表现是否同步消失？
7. Site picker 是否返回真实 id？
8. Production Site 比旧 Marker 增加多少 draws / triangles？
9. Leyline 表现是否完全来自 `world.leylines`？
10. Leyline strength 如何影响视觉？
11. Nether 阴气是否只读 `nether.veg`？
12. 鬼消散留痕是否能在视觉上被看见？
13. Nether 是否新增任何模拟字段？
14. Upper qi 是否只读 `upper.qi`？
15. Upper entity 与 qi 的空间关系实测如何？
16. 是否新增任何假上界 Site / 仙台 / 宫殿？
17. Rift 持久视觉读取哪些真实字段？
18. Rift FX 消费哪条现有 presentation event 路径？
19. 是否有任何第二次 drain runtime event？
20. World / advance / save / RNG 是否一致？
21. GPU time / CPU update / draw calls 如何变化？
22. 6000 帧资源是否稳定？
23. Git 与 dist 增量分别是多少？
24. 当前下一阶段最值得做的是道路痕迹、上界仙门空间锚、宗门地理，还是幽冥空间语义扩展？

第 24 项必须基于本轮真实结果裁决，不得预先宣布。

---

# 45. 对下一阶段的预期

如果 M2-C2C 成功，《坐天观井》应第一次出现这样的体验：

玩家不看 UI，也能从地图上读到：

- 这里是一个真实秘境；
- 那里有一条强灵脉；
- 这个山头灵气更厚，所以仙人逐渐聚过去；
- 那段冥河岸几十年死魂不断，土地已经真正阴下去；
- 这条裂隙刚刚发生过跨界事件。

届时地图不再只是“装着模拟的容器”。

地图本身开始成为：

> **模拟历史的可视化记录。**

这才是 M2-C2C 的真正完成标准。
