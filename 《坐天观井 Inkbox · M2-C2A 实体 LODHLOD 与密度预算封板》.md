# 《坐天观井 Inkbox · M2-C2A 实体 LOD/HLOD 与密度预算封板》
## 工程开发委托书

版本：M2-C2A  
目标分支：`main`  
当前基线：M2-C 已接入的最新主线  
建议主力模型：GPT-6.1 Sol  
任务性质：工程加固 + 3D 性能架构 + 资产生产前置封板

---

# 0. 本轮总目标

当前项目已经完成：

- 三界最低生态与跨界生态
- D7 观察与表现层
- D8 视界 2.0
- M0 / M1 3D 世界与实体表现
- M1.1D 工程加固
- M2-A 多 Stage 架构
- M2-B 完整 Region Mask / 界缘 / 3D 视界
- M2-C 写意地形、纸墨材质、修士 / 建筑 / 树木三个 pilot 母版

M2-C 已证明：

> 低模实体能够以统一的纸墨视觉语言进入 Three.js 3D 世界。

但它尚未证明：

> 大量低模实体能够长期、稳定、可扩展地同时存在于大地图和三界视界中。

当前最明确的风险是：

- Draw Call 控制良好；
- Instancing 路线正确；
- 但开启 Pilot 后，GOLDEN_A overview 三角形约从 **118,676 → 384,656**；
- 短采样 Pilot rAF p95 曾达到 **33.3 ms**；
- 当前所谓 distanceFade 只减少材质信息，并没有真正降低几何成本；
- 树木由二维 cross-card 升级为实体低模树后成为主要几何放大源；
- 未来如果直接加入更多修士、建筑、动物、仙兽、山海经异兽，上述问题会快速放大。

因此：

> 本阶段禁止以“继续增加更多资产”为主要目标。

本轮的唯一核心任务是：

# 建立一套真正可扩展的实体 LOD / HLOD / 密度预算体系，并证明其不会破坏现有三界模拟、视界语义、拾取语义和 M2-C 水墨表现。

完成后，项目才能正式进入大规模资产家族生产阶段。

---

# 1. 本轮原则

## 1.1 不允许重造已有架构

必须继续服从现有单源：

- 高程：`ElevationField`
- Region：`RegionGeometry`
- 三界 Stage：现有 `PlaneStage`
- 渲染器：现有 `Render3DHost`
- 世界事实：`World`
- Presentation：现有 transient presentation 路径
- 界缘：`RealmBoundaryLayer`
- Art 编排：现有 `ArtPass`
- 模拟随机流：现有 RNG 体系

禁止为了 LOD：

- 新建第二套坐标系统；
- 新建第二套 Region 判断；
- 新建第二套实体派生世界；
- 新建另一个 Renderer / Scene；
- 给 World 增加 renderer-only 字段；
- 修改模拟 RNG；
- 将相机距离、LOD 状态写入存档。

LOD 必须是：

> World → 只读派生 → Presentation。

---

# 2. 本轮明确不做

本阶段不得主动实施：

- Gameplay G「镇 / 泄」；
- 裂隙概率和平衡修改；
- 上界政治系统；
- 幽冥宗门 / 鬼城；
- 大规模角色家族；
- 大规模建筑家族；
- 仙兽、山海经怪物正式生产；
- 复杂动画系统；
- 骨骼蒙皮系统；
- 完整昼夜系统；
- 全屏后处理；
- 大规模道路 / 农田系统；
- 新经济系统；
- 第四世界；
- AI 行为树重构；
- Three.js 大版本升级。

如果施工过程中发现这些方向值得做：

> 只记录进入 BACKLOG，不扩任务范围。

---

# 3. 首要审计任务 A0：重新建立真实性基线

正式施工前必须先读取：

- `README.md`
- `HANDOFF.md`
- `ROADMAP.md`
- `ARCHITECTURE.md`
- `M2C_EXPRESSIVE_INK_REPORT.md`
- `PERFORMANCE_REPORT.md`
- `ENTITY_PRESENTATION_CONTRACT.md`
- `ARTPASS_PROFILE.md`
- `VISUAL_ACCEPTANCE.md`

以及实际源码：

- `Render3DHost`
- `PlaneStage`
- `EntityLayer`
- `VegetationLayer`
- `SettlementLayer`
- `TerrainMesh`
- `ArtPass`
- `PilotAssets`
- `PilotMaterial`
- 各种 derive 模块
- Picker
- RegionGeometry
- WorldRenderBridge

禁止仅根据文档假设实现存在。

必须首先重新确认：

1. 当前树木真实实例数；
2. 当前修士、凡人、建筑真实实例数；
3. 三类 Pilot 单体 triangle 数；
4. Baseline / Pilot draw calls；
5. GOLDEN_A / DENSITY_A 的实际 triangles；
6. 当前 Stage 可见性行为；
7. 开启上界 / 幽冥视界时实际提交哪些层；
8. 当前 picker 如何从 `instanceId` 找回世界实体；
9. 当前 Art profile 切换是否复用资源；
10. 是否存在逐帧 new / dispose。

A0 结束后形成：

`M2C2A_BASELINE.md`

任何后续性能结论必须基于这里重新测出的事实，而不是复制旧报告数字。

---

# 4. A1：建立统一的 LOD 决策模型

## 4.1 禁止简单世界距离 LOD

不能仅使用：

```text
distance < 50 → LOD0
distance < 100 → LOD1
else → LOD2
```

因为：

- 当前使用正交相机；
- zoom 会显著改变视觉尺寸；
- 不同实体高度不同；
- 后续相机视角可能继续扩展。

LOD 首选依据应为：

# projected screen size / projected pixels

也就是：

> 这个实体目前在屏幕上到底占多少像素。

现有 `PilotMaterial` 已有 `projectedPixels` 思路，可以复用其方向，但几何 LOD 必须成为真正的 CPU / geometry 选择，而不能只有 shader fade。

---

# 5. A2：建立三层实体表现规范

至少实现三个概念级别：

## LOD0 · 近景

保留当前 Pilot 的主要视觉身份。

例如：

### Character
- 当前修士 Mini 3D；
- 发髻；
- 道袍；
- 宽袖；
- 腰带；
- 鞋。

### Tree
- 实体树干；
- 三维树冠。

### Building
- 墙体；
- 屋顶；
- 门 / 基座等主要轮廓。

LOD0 负责：

> 玩家主动观察时“它是什么”。

---

## LOD1 · 中景

大幅减少三角形。

### Character

可以压缩为：

- 头；
- 主躯干；
- 一个身份轮廓；
- 简化衣摆。

不得保留全部袖子 / 鞋 / 发髻细节。

目标：

> 仍然看出是修士，而不是一个彩色立方体。

### Tree

必须明显低于当前约 80 tris 的 Pilot Tree。

推荐方向：

- 一个低边树干；
- 一个或两个低面数树冠；
- 或合并整体轮廓块。

### Building

保留：

- 墙体体块；
- 单屋顶体块。

删除：

- 门；
- 基座；
- 不重要细分。

---

## LOD2 · 远景

远景的任务不再是“看清模型”。

任务是：

> 让世界保持人口、树林、聚落的存在感和空间密度。

允许：

### Character
- 极简 billboarding glyph；
- cross-card；
- 低面柱体；
- point / ink mark。

### Tree
- cross-card；
- 低面 ink mass；
- 非透明低模 silhouette；
- 其他极低成本实现。

### Building
优先尝试：

- settlement roof mass；
- 低面 village cluster；
- 一组聚落 HLOD；
- 极低面建筑块。

注意：

LOD2 不是“删除对象”。

应尽量保留：

> 远处那里有人 / 有树林 / 有聚落。

---

# 6. A3：必须优先解决树木

本轮第一性能实验必须针对 Vegetation。

原因：

M2-C 当前：

- baseline tree = 交叉 card；
- pilot tree = trunk + 3 solid crowns；
- draw calls 并未增加；
- triangles 却明显增长。

因此首先建立：

```text
Tree LOD0
Tree LOD1
Tree LOD2
```

并完成同一世界 / 同一镜头 / 同一 Art Profile 的：

```text
NO LOD
vs
LOD
```

对照。

不得通过：

- 减少真实世界树木数量；
- 修改 worldgen；
- 偷偷缩小森林；
- 修改 vegetation derive；

来获得性能提升。

必须：

> 世界树的事实数量完全不变，只减少表现成本。

---

# 7. A4：LOD 切换必须稳定

必须防止相机缓慢移动时实体不断：

```text
LOD0 → LOD1 → LOD0 → LOD1
```

产生闪烁。

至少使用一种：

- hysteresis；
- threshold band；
- 状态保持区间；

例如概念：

```text
进入 LOD0：> A px
离开 LOD0：< A - margin

进入 LOD2：< B px
离开 LOD2：> B + margin
```

具体阈值必须通过截图与性能测试确定，不得拍脑袋写死后宣布完成。

LOD 状态属于：

> renderer presentation state。

不得进入 World / save。

---

# 8. A5：Instancing 纪律

即使加入 LOD，也不得退回：

```text
1 entity = 1 THREE.Mesh
```

应维持：

```text
Class × LOD = fixed InstancedMesh batches
```

例如概念：

```text
Character
 ├ LOD0 batch
 ├ LOD1 batch
 └ LOD2 batch
```

树、建筑同理。

允许 draw call 从当前值适度增加。

但禁止：

> 用几百个 draw call 换 triangles 降低。

建议本轮建立正式指标：

- visible draw calls；
- triangles；
- instances；
- LOD0 / 1 / 2 数量；
- overflow；
- batch capacity；
- CPU layer update；
- render submit；
- rAF interval。

调试面板至少能够看到：

```text
Trees: 3412
LOD0: 28
LOD1: 244
LOD2: 3140
```

这样的信息。

---

# 9. A6：聚落 HLOD 原型

在 Tree LOD 稳定之后，制作一个有限的 Settlement HLOD Prototype。

不要求正式完成完整 HLOD 系统。

至少证明：

当一个聚落在屏幕中非常小时，不需要仍然提交：

```text
12 间房 × body + roof
```

可以转为：

```text
Village HLOD mass
```

但必须满足：

- 村庄真实房屋数量不变；
- 世界数据不变；
- 近景恢复真实房屋；
- HLOD 只是 presentation；
- 不改 village / houses；
- Region Mask 仍正确；
- 窗内 / 窗外归属不混乱。

优先只实现 mortal settlement。

禁止趁机重做村庄生成。

---

# 10. Picking 与身份规则

LOD 后必须重新审计拾取。

## LOD0 / LOD1

如果仍是明确实体：

必须尽量保留真实 entity identity。

`instanceId → renderEntities[] → world entity`

这一链不能因为 LOD 重构而失效。

## LOD2

如果已经变成 cluster / ink mass：

允许不提供单体精确拾取。

但必须明确规则，例如：

- 缩放进入 LOD1 后才能选单体；
- 聚落 HLOD 点击返回 settlement；
- 远景树群不参与 picker。

禁止：

> 点击一团远景树，却返回随机某一棵树。

---

# 11. Region / 三界视界兼容

LOD 必须服从现有：

`RegionGeometry`

不得重新调用一套独立 `region.contains()`。

开上界 / 幽冥窗口时必须检查：

- Mortal outside；
- Target inside；
- 边缘实例；
- LOD batch；
- HLOD cluster；

是否全部遵循同一个 Region 归属。

尤其注意：

> HLOD 不得因为 cluster 跨越界缘而把窗外凡间整村漏进窗内。

第一版可以采用：

- cluster center ownership；

但必须把局限记录进契约，并测试。

---

# 12. 性能验收场景

沿用 M2-C 的固定证据思想。

至少建立四组：

## P1 · GOLDEN_A overview

用于一般世界。

## P2 · DENSITY_A overview

用于高密度实体。

## P3 · Forest Stress

专门选择高树木密度区域。

不得修改世界，只选择真实 POI。

## P4 · Realm Window Stress

打开较大的：

- Upper window；
- Nether window。

验证两个 Stage 同时存在时的表现。

---

# 13. 强制对照矩阵

每个测试场景至少记录：

```text
baseline
pilot-no-lod
pilot-lod
```

其中：

`pilot-no-lod`

必须保留用于证明：

> 性能变化来自 LOD，而不是顺便改了别的东西。

必须记录：

| 指标 | Baseline | Pilot no LOD | Pilot LOD |
|---|---:|---:|---:|
| Draw Calls | | | |
| Triangles | | | |
| Instances | | | |
| Tree L0/L1/L2 | | | |
| Character L0/L1/L2 | | | |
| Building L0/L1/L2 | | | |
| rAF median | | | |
| rAF p95 | | | |
| renderer.render median | | | |
| layer update | | | |

不得把 `renderer.render()` CPU submission 时间称为 GPU 时间。

如果没有 timer query：

明确写：

> GPU time unavailable。

---

# 14. 性能目标

不要求为了数字破坏画面。

但至少应达到以下方向性验收：

## 必须满足

### 1.
Pilot LOD overview 的 triangles 必须显著低于现有 Pilot no-LOD。

最低要求：

> 几何成本下降幅度必须足以证明 LOD 有实际意义，而不是 5% 级微调。

建议目标：

> GOLDEN_A overview 总 triangles 至少下降约 35%。

如果视觉允许，争取：

> 下降约 45%～60%。

### 2.
Draw call 不得失控。

建议：

> 一般 mortal overview 保持在十几次量级。

如果达到数十甚至上百 draw calls，视为架构失败。

### 3.
不得修改世界实体数量来制造性能提升。

### 4.
LOD 开关前后 World 完整 fingerprint 必须一致。

### 5.
连续旋转 / zoom 时：

- 不得报 shader error；
- 不得 GL error；
- 不得持续资源增长；
- 不得出现明显 LOD 抖动；
- 不得出现整批实例突然消失。

---

# 15. 稳定性测试

建立至少：

## 600-frame lifecycle

执行：

- rotate；
- zoom；
- resize；
- Upper window；
- Nether window；
- LOD profile switch。

## 6000-frame soak

保持：

- 世界 paused；
- 不断改变相机；
- 周期性开关 LOD；
- 周期性开窗；
- 周期性 profile baseline / pilot。

检查：

```text
geometry count
texture count
program count
world digest
profile state
GL error
```

资源不得随循环持续增长。

---

# 16. 模拟纯度测试

必须增加：

# 600 日模拟对照

至少比较：

```text
No Render3D
Render3D baseline
Pilot no LOD
Pilot LOD
Pilot LOD + camera movement
Pilot LOD + repeated upper/nether view
```

最终完整世界 SHA-256：

> 必须逐字一致。

同时确保：

- LOD 不调用模拟 RNG；
- 不调用 `Math.random()` 决定实体层级；
- 不写 entity；
- 不写 village；
- 不写 terrain；
- 不写 upper/nether；
- 不写 save。

---

# 17. 建议新增统一的 Presentation Budget 层

可以建立类似概念：

```text
PresentationBudget
LODPolicy
VisualBudget
```

具体名字可以根据当前架构调整。

但原则必须是：

> LOD 阈值和预算不要散落在 EntityLayer / VegetationLayer / SettlementLayer 三处各写一套魔法数字。

应有一个集中位置定义：

- projected pixels threshold；
- hysteresis；
- category budget；
- LOD policy；
- debug counters。

不同 Layer 使用同一原则。

允许不同实体拥有自己的阈值。

---

# 18. 不要过早做“万能 LOD 框架”

本轮不是做 Unity / Unreal。

禁止构建：

- 泛型 Entity Component LOD engine；
- 无限资产注册系统；
- 动态插件式资产加载器；
- 大型资源管理框架。

优先：

> 用现有三个真实类别把正确结构跑通。

也就是：

- Tree；
- Character；
- Building。

只有发现真实重复后再抽象。

---

# 19. 美术要求

LOD 不能只看性能。

必须输出标准截图验证：

## Character

近中远三个距离。

确保：

- LOD0 可辨修士；
- LOD1 仍有修士轮廓；
- LOD2 不变成突兀彩色像素。

## Tree

要求：

- 远景形成水墨林块；
- 不是大量独立绿色球；
- 不产生严重 popping。

## Building

要求：

- 远景聚落成为“屋顶 / 墨块群”；
- 近景回到真实房屋。

仍然服从 M2-C 色板：

- paper；
- warm；
- ink；
- blue；
- wood；
- earth；
- red；
- cyan；
- skin。

禁止每个 LOD 重新发明一套配色。

---

# 20. 建议施工顺序

严格按以下顺序：

## Commit 1
Baseline audit + M2C2A baseline report

不改生产代码。

---

## Commit 2
统一 screen-space LOD policy + debug counters

先不更换模型。

证明阈值和 hysteresis 正常。

---

## Commit 3
Tree LOD0 / LOD1 / LOD2

完成第一轮性能证据。

如果 Tree LOD 没有取得显著收益：

> 暂停，不得继续 Character / Building。

先查清原因。

---

## Commit 4
Character LOD

保留 identity 与 picker。

---

## Commit 5
Building LOD + Settlement HLOD prototype

---

## Commit 6
Region / Realm View / Picker 联合回归

---

## Commit 7
600 日模拟纯度 + 6000 frame soak

---

## Commit 8
最终视觉矩阵 + 性能报告 + 文档同步

---

# 21. 自动化门禁

建议新增：

```bash
npm run test:render3d:m2c2a
npm run test:render3d:m2c2a:browser
npm run test:render3d:m2c2a:soak
```

普通 CI Fast Gate 至少加入：

```text
test:render3d:m2c2a
```

Browser 测试仍可保持：

> workflow_dispatch

但本轮建议顺手把原来的 Browser Smoke 从：

```text
Canvas + M2-A
```

扩展为：

```text
Canvas
M2-A
M2-B
M2-C
M2-C2A
```

禁止为了 CI 绿：

- 删除断言；
- 降级 warning；
- `|| true`；
- 跳过失败场景。

---

# 22. Git 证据控制

本轮同时治理证据膨胀。

Git 中只长期保存：

- 代表性 baseline；
- 代表性 no-LOD；
- 代表性 LOD；
- summary JSON；
- 最终性能报告；
- 关键失败样本。

完整数十 / 数百张矩阵：

> 优先存 GitHub Actions artifact。

不要继续每轮把全部重复浏览器证据永久塞入 Git。

目标是：

> 保持可审计，而不是把仓库变成测试录像仓库。

---

# 23. 完成定义

只有以下条件全部成立，本轮才能称为完成。

### 架构

- 没有第二套 World / Region / Elevation；
- LOD 为纯表现；
- screen-space LOD 单源；
- Instancing 保留；
- 无逐实体 Mesh；
- 无逐帧 new/dispose；
- HLOD 不写世界。

### 正确性

- 旧 M0 / M1 / M2-A / M2-B / M2-C 全绿；
- view / presentation 全绿；
- three-realms 全绿；
- save-equivalence 全绿；
- build 全绿；
- LOD picker 身份正确；
- Region Mask 正确。

### 模拟

- 600 日多模式 world digest 一致；
- RNG 不被消费；
- save 无新 renderer 字段。

### 性能

- triangles 显著下降；
- draw calls 保持低量级；
- Dense / Forest Stress 没有明显性能退化；
- 6000 帧资源稳定；
- 无持续内存增长。

### 视觉

- 树在远景仍形成树林；
- 修士中景仍可辨识；
- 聚落远景仍存在；
- LOD 切换无明显闪烁；
- 水墨语言连续；
- 三界视界不因 LOD 出现内容泄漏。

---

# 24. 最终必须交付的文档

完成后生成：

```text
M2C2A_LOD_REPORT.md
M2C2A_PERFORMANCE_REPORT.md
M2C2A_VISUAL_ACCEPTANCE.md
```

并同步：

- `README.md`
- `HANDOFF.md`
- `ROADMAP.md`
- `ARCHITECTURE.md`
- `STATUS.md`
- `tests/README.md`

报告必须明确区分：

```text
已完成
已验证
仅原型
暂未实施
已知局限
下一阶段候选
```

禁止把 Prototype 写成正式完成。

---

# 25. 最终回答必须回答十个问题

任务结束时不要只说“完成”。

必须回答：

1. Tree triangles 实际下降多少？
2. Character triangles 实际下降多少？
3. Building triangles 实际下降多少？
4. GOLDEN_A 总 triangles 从多少到多少？
5. DENSITY_A 总 triangles 从多少到多少？
6. Draw Calls 从多少到多少？
7. rAF median / p95 如何变化？
8. LOD 是否影响 World digest？
9. 开三界视界后是否仍正确？
10. 当前是否已经足以进入“大规模资产家族生产”？

最后一个问题必须根据真实证据回答。

如果仍不适合扩产：

> 明确说明卡在哪里。

不要为了给用户一个漂亮结论而宣布通过。

---

# 26. 执行授权

你可以自主：

- 修改 Render3D presentation 源码；
- 新增 LOD / HLOD presentation 模块；
- 修改 Pilot 几何；
- 调整实例批次；
- 增加 debug 数据；
- 增加自动化测试；
- 增加浏览器证据脚本；
- 修改 CI；
- 更新工程文档；
- 删除本轮产生的冗余测试证据。

但不得未经授权：

- 修改三界模拟规则；
- 修改世界生成；
- 修改裂隙概率；
- 修改经济数值；
- 修改角色 AI；
- 新增 Gameplay G；
- 重构稳定的跨界转移；
- 大规模生产新资产。

---

# 27. 本轮成功后的下一步

如果 M2-C2A 通过：

下一阶段才正式进入：

# M2-C2B · 修仙资产家族生产

届时可以安全展开：

- 普通凡人；
- 修士家族；
- 宗门弟子；
- 游修；
- 丹修；
- 鬼修；
- 上界仙人；
- 民居；
- 集镇；
- 城池；
- 宗门；
- 山门；
- 塔；
- 灵树；
- 灵兽；
- 山海经异兽；

并让所有资产天然服从本轮建立的：

```text
LOD0
LOD1
LOD2
HLOD
Visual Budget
Instancing
Region Mask
Three Realm Presentation
```

换言之：

> M2-C2A 不是做更多东西。

它是在修一条足够宽的路，让以后成千上万的东西可以开进来，而不是堵死在第一片树林里。