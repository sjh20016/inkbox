# Inkbox 正式资产生产契约

2026-10-05。本契约承接 M2-C2B Pass 1（主线 `e0a851c`），适用于随后阶段的正式资产。美术上界为 `美术素材/三界视觉风格规划_美术方向文档_v1.md`；实际 World 能力与本阶段委托书约束优先于该文档的远期设想。

## 身份与命名

assetId 格式为 `<realm>.<semantic>.<family>[.<variant>]`，例如 `mortal.site.cave`、`nether.artifact.ground`。assetId 是呈现资源标识，不是 World kind 或实体身份。既有 `environment.*` ID 是兼容别名；不得借资源命名新增模拟对象。

| 分类 | 定义 | Picker / 存档 |
| --- | --- | --- |
| P | 对应当前 World 中可验证的真实实体、地点、建筑、灵脉或裂隙 | 解析当前真实身份；存档仍只保存既有 World 数据 |
| D | 地形附着的石、崖、层台等自然装饰 | 没有 entity/site 身份；无独立拾取项与存档字段 |
| L | Lab、试装或研究对象 | 不进入正式生产与默认世界 |
| X | 当前 World 没有语义来源的城市、浮岛、经济等设想 | 阻塞；不得以美术生产代替模拟设计 |

同一 Site 的主体与辅助石块共用 siteId；辅助模型不能产生多个新身份。实时查询必须验证对象仍在 World 中。真实身份被移除时，其实例及可解析的旧选择一并失效。无法映射、assets=off 或调试模式保留诚实的既有标记回退。

## Geometry、LOD 与共享

正式资产经 `EnvironmentAssetLibrary` 加载 `assets/environment/mesh/environment_library.glb` 与同目录契约索引，借用 Host 所有的 geometry / atlas 和 Stage 所有的 material。Layer 不得处置借用资源。换 World、重复开窗及 dispose 必须维持固定容量并正确释放自己的批次。

| 等级 | 生产规则 |
| --- | --- |
| LOD0 | 独立识别主体，按语义塑形；Site 主体目标 60–220 triangles |
| LOD1 | 同剪影家族可共享；Site 目标 20–60 triangles |
| LOD2 | 大范围共享闭合墨块；Site 目标 6–16 triangles |
| HLOD | 屋顶簇、Site 簇与地形强调家族按实测需要分批，不能凭空合成对象 |

多个 assetId 可以引用同一个 GLB node。manifest 明确该引用；Library 只解码一次，EnvironmentBatch 按 node 合并实例，而不是按 ID 复制 geometry 或 draw。共享模块必须同时通过真实 GLB 解码、引用同一性、批次数量和生命周期门禁。不要机械地为每个 assetId 复制三套网格。

所有生产网格应有向外法线、闭合低模质量、有限坐标、单位底座包围盒、正缩放、语义 atlas UV。不透明墨块优先；不采用每对象材质、透明城池、发光科技环或动画骨骼批次替代静态 instancing。

## 预算

`PresentationBudget.js` 明确分列 tree、character、building、settlement、decoration、artifact、site。类别名称独立于其初始数值。C2B.1 的 decoration / artifact 阈值保留原 tree 的 28/24/5/7，避免改变既有视觉。Decoration 仍执行原 upper 256/160/64、nether 192/96/40 局部容量；Site 与 Artifact 使用各自容量和实例计数。LOD 仅改变细节，不能删除真实 World 对象或改变模拟。

## 证据生产与门禁层级

每阶段证据放在 `reports/release/<stage>/`，目录职责如下：

| 目录 | 内容 | Git |
| --- | --- | --- |
| `golden/` | 正常构图、正常相机与真实可复现世界的代表 PNG | 每阶段最多 8 张，通常 6–8 张 |
| `summary/` | 小型 JSON：版本、条件、门禁、指标、SHA、失败原因 | 可以提交；单文件最多 256 KiB |
| `proof/`、`matrix/`、日志及源图 | 极端拾取、遮挡、窗口边缘、生命周期、完整正反矩阵、debug 视图 | 忽略；本机或 Actions artifact |

旧 Git 证据属于历史，不重写、不迁移、不删除。新阶段的 summary 不得链接成包后无法访问的本机临时同步文件。完整证据缺失时不能将少数 Golden 冒充矩阵全绿。

Browser 的 Current Stage Acceptance 包含当前功能矩阵、关键祖先回归、600 帧 lifecycle 与 6000 实际帧 soak；Full Historical Regression 保留在手动、Nightly 或 RC 中。Node Fast / Heavy 原门禁继续保留；不得删断言、吞退出码或以 CPU mock 冒充 GPU/browser 实测。新增阶段无需把百分钟历史 Browser 全部堆入普通 push。

## 三界与纯度

凡间 Site / leyline / rift 来自现有集合；上界 qi 来自上界 qi（读档由 terrain / leyline 重算），幽冥阴气来自现有 nether.veg。低频场只能改变颜料、明暗、形状强调，不能改变 height/type/World/save。

FX 只消费既有 PresentationStage 冻结 snapshot，禁止第二次 drainRuntimeEvents。固定 mesh 池、固定容量和 overflow 计数；外观随机仅用不可变 ID、坐标、事件种子与稳定 hash，禁止模拟 RNG。所有新资源遵守同一 Stage 坐标、Region、高程与跨界隔离。

正式验收先有独立只读语义地图，再做一个真实 Site pilot 并通过资产、身份、Region、LOD、包审计与回退门禁；之后才扩展四类 Site、灵脉、双界场和 Rift FX。最终以 World/advance/save SHA、11 RNG、真实 Browser、生命周期、干净包与完整证据裁决。
