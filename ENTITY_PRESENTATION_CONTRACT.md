# M2-C / M2-C2A · 可扩展实体表现契约

模拟实体不是 Object3D。World 是事实源，Render3D 的派生记录、颜色、LOD、实例槽和 GPU 资源不进入 World 或存档，不抽模拟随机流。

| 类别 | LOD0 近景 | LOD1 中景 | LOD2 远景 |
|---|---|---|---|
| Character | 现有 GLB 模块 / procedural 母版 | 简化道袍、类别轮廓固定实例批次 | 闭合低面墨形；仍一对一映射身份 |
| Building | 墙、顶、门、基座，80 tris | 合并墙顶，20 tris | 8-triangle roof mass；凡间小村 HLOD 原型 |
| Tree | 树干 + 实心树冠，80 tris | 25-triangle 树冠轮廓 | 8-triangle 闭合 ink mass |

M2-C2A 增加真实几何 LOD 和密度预算，完整资产家族、动画系统与完整 HLOD 仍未实施。`lod/PresentationBudget.js` 统一投影像素阈值、迟滞和配额；ArtPass 传入当前 viewport / zoom / 垂直投影倍率。材质 fade 与几何降面分别生效，不承诺无限实体规模。

## 批处理与身份

- Geometry 和 Material 按母版或语义类别共享；30 个同类对象不产生 30 个 draw calls。
- EntityLayer 保持原来的类别批次；`mesh.userData.renderEntities[instanceId]` 是筛选后的拾取身份映射。
- LOD0/1/2 的单体角色均可精确拾取；树各档不参与 picker。凡间 HLOD 点击返回 `kind=settlement` 和真实 `settlementId`，普通房屋沿用地形检视。划窗采样只 raycast 凡间地形，不吸附角色或聚落中心。
- 房屋复用已有 `village.houses` / 聚落中心 / 宗门位置；不在画面中伪造道路、农田或洞府事实。
- 植被继续由 `deriveVegetation` 派生，归属只走 Stage 的 `RegionGeometry`；高度只走该 Stage 的 `ElevationField`。
- HLOD 只合并同村真实房屋。成员及整个表现包围范围必须位于 Region 同侧；跨界聚落恢复单屋批次，避免整村漏入另一界。上界/幽冥不新增虚构村落、植被或水体。
- 预算只降低表现细节，不删 World 人口或房屋；配额拥挤时优先镜头内对象。禁用 LOD 的对照保持完整 LOD0。调试统计分别提供逻辑对象数、实际实例数、LOD 分布、三角形、overflow、capacity 与 HLOD 数量。
- 同类实例容量不足必须暴露 overflow；后续扩容按块分配，不在逐帧中创建/释放对象。
- 模型朝向、颜色、材质和实例槽是渲染状态，不得写回人物对象。关闭 ArtPass 恢复旧表现，重新打开复用已分配资源。

## 信息预算

普通实体遵循「一个主体 + 一个身份特征」。本轮修士用简头、发髻、道袍、宽袖、腰带和鞋，不加武器或背包。房屋用纸白墙与墨顶；树使用真实体积而非透明叶片。统一有限颜色字典使用 vertex color，不为单体分配纹理。

## 痕迹与临时特效

**永久世界痕迹禁止以独立 Mesh / Decal 对象累积。** 足迹、战斗残留、灵气残留、污染和磨损若将来有模拟事实，应进入 Field / Texture / Grid accumulation，再由渲染器转换成画面。此轮不新建痕迹玩法。

短命 FX 使用有界 Pool，仍由既有 Presentation snapshot 提供事实。不得另 drain runtime events，不因观察与否补写历史。禁止持续 new → remove → dispose 抖动资源。

## 资源责任

Host 只持有美术编排器；Stage 的 Layer 拥有自己的缓存几何、材质与纹理。Host 换 World 时释放整套旧 Stage；Layer dispose 同时释放基础与美术缓存。Material clone 只能按固定母版发生，不能随实体数量增长。
