# M2-C2A · 实体 LOD / HLOD 与密度预算

2026-10-03。工作区已从 origin/main 快进至 `0ae4239`，保留并整合施工前已有的 GLB 修士接线；备份和 stash 保留。本轮没有修改模拟、世界生成、裂隙、经济、角色 AI 或资产家族。审计基线见 [M2C2A_BASELINE](./M2C2A_BASELINE.md)，最终采样与视觉裁决见 [性能报告](./M2C2A_PERFORMANCE_REPORT.md)、[视觉验收](./M2C2A_VISUAL_ACCEPTANCE.md)。

## 已完成

`lod/PresentationBudget.js` 是阈值、迟滞与细节预算单源。ArtPass 使用实际 viewport、正交 zoom 和垂直投影倍率；没有按固定世界距离分档，也没有第二套 Renderer / Region / Elevation。LOD0/1/2 以固定类别批次提交；模型、材质只在 Layer 生命周期内创建和释放。相机改变会重算必要的分配，分配不变则不上传实例矩阵；低于配额时平移不进行全图预算投影。树的拥挤预算用稳定线性可见分区。

| 类别 | 进入 L0 / 离开 L0 像素 | 进入 L2 / 离开 L2 像素 | L0 / L1 细节槽 | 逻辑容量 |
|---|---:|---:|---:|---:|
| Tree | 28 / 24 | 5 / 7 | 1024 / 5000 | 10000 |
| Character | 44 / 38 | 7 / 9 | 256 / 1200 | 3256 |
| Building | 52 / 44 | 9 / 12 | 512 / 2048 | 4608 |
| Settlement | 60 / 50 | 24 / 32 | 96 / 256 | 512 |

投影尺寸取实体水平宽度与竖直高度投影的较大值。HLOD 使用真实聚落包围范围的尺寸，而非代表房屋尺寸。预算拥挤时，屏内对象先取得细节槽；超额对象降为廉价表现，不删除 World 事实。统计同时暴露逻辑数、实际实例数、LOD 分布、triangles、demotions、overflow、capacity 与 HLOD 数量。`lod=off` / baseline 保持全 LOD0 对照，不受细节预算降级。

| 单体类别 | LOD0 triangles | LOD1 | LOD2 |
|---|---:|---:|---:|
| Tree | 80 | 25 | 8 |
| Cultivator | procedural 308；现有 basic GLB 434 | 54 | 20 |
| GLB ghost | 550 | 54 | 20 |
| Human | 12 | 8 | 4 |
| Beast | 12 | 12 | 4 |
| Spirit | 20 | 20 | 4 |
| 普通 wraith | 12 | 8 | 4 |
| Building | body72 + roof8 | 20 | 8 |

Beast / Spirit 的原 L0 已经极简，中档保持同面数，远档进一步降面。简化几何沿用 EntityLayer 的类别高度并归一化脚底，避免切档缩小或漂移。现有 GLB 模块只用于 L0，中远档不再提交这些模块；每个可见模块和简化批次保留真实身份映射。GLB ghost 跨档保持其原库的透明/深度语义，普通 wraith 保持半透明冷墨。单体面数不能替代整场景 GPU 提交统计，实际类别成本在性能报告中单独列出。

## 仅原型

凡间小村 HLOD 合并同村真实房屋为 8-triangle roof mass。村落中心建筑和宗门保留各自表现；真实屋舍数量、坐标、村落数据均不变。成员以及表现包围范围的全部格子必须位于 Region 同侧；跨界村落拒绝合并并恢复单屋批次。近景恢复真实屋舍。上界/幽冥不虚构凡间村落、水体或植被。

HLOD 只是有限 mortal prototype；没有完整城市 HLOD、通用层级树、建筑动画或跨位面聚落生产系统。边缘单屋继续服从既有格中心归属，模型轮廓跨格的局限没有被改写为几何裁切承诺。

## 拾取与已验证

LOD0/1/2 单体角色均通过 `instanceId → renderEntities[] → id/plane` 恢复真实身份；当前 L2 仍一对一，不返回随机群体成员。树各档不参与精确 picker。HLOD 返回 `kind=settlement` 与 `settlementId`，Adapter 使用真实村落检视；普通屋舍沿用地形检视。划窗只 raycast 凡间地形，避免高角色或 HLOD 把路径吸到其中心。

CLI 核心 8 组通过，包含真实活跃人口/房屋、三个 LOD 身份、共享 Region、高程与资源对象复用、真实村落被窗口分割时拒绝 HLOD、HLOD 可见面拾取和只地形划窗。新增空 LOD 批次先产生空包围球、再填入真实角色并拾取的回归，四个 Layer/CharacterBatch 写入或清空实例时失效包围球/包围盒缓存，防止模型可见但射线不命中。旧 CLI 14 项最终通过（M2-C 9 组 + Pilot 合约包含其中），修复前失败记录保留在本地 gates 汇总。

600 个真实游戏日，no-render / baseline / pilot-no-lod / pilot-lod / pilot-camera / pilot-realms 六模式完整 World SHA-256 均为：

`935cfa00a5e67da9bea5b53a7d88efe0521d9d33739721c79547f8878072d486`

每模式随机流调用数均为 182879：Life169051、UpperSpatial12827、Upper1001。每次 renderer 更新前后计数相等；三界最终活跃人口分别93 /12 /30。LOD 状态仅存在表现层，不新增存档字段。浏览器还有独立的完整 World + advanceState 开关指纹对照；最终结果在性能报告与代表摘要中。

审查修复了划窗误拾取、非修士中远档增面、GLB ghost 透明度跳变、离屏对象挤占细节槽与树木不必要排序。最终复核没有残留高价值发现。

最终浏览器15项矩阵、九张真实POI三档图、600帧生命周期与6000帧耐久通过；本机CI Browser Smoke的Canvas / M2-A / M2-B / M2-C / M2-C2A五套退出0，Canvas144条检查通过。旧Canvas矩形用例改为实际闭合套索，保留开窗、坐标和裂缝断言；首次对角线路径被正确拒绝的失败证据仍在本地。包围球修复后的M1、Characters、M2-C+Pilot定向CLI也通过。远端Actions没有在本轮触发。

## 暂未实施、已知局限与下一阶段候选

未扩产资产家族、群体动画、Trace Field、完整 HLOD 或 Gameplay G。当前实测覆盖小/中堂固定世界与现有极简模型；不能把单 GPU 的短采样和有界耐久测试解释为无限实体保证。新增家族应从一套 L0/L1/L2 和固定实例预算开始，继续进行真实场景对照；扩产结论以性能/视觉报告为准。

完整矩阵、运行日志保留 `reports/m2c2a/` 或 Actions artifact。Git / dist 只收代表性截图及 JSON 摘要。Fast Gate 已接入 C2A 核心；手动 Browser Smoke 按 Canvas → M2-A → M2-B → M2-C → M2-C2A 顺序执行，耐久脚本独立执行。
