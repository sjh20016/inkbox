# M2-C · 可扩展实体表现契约

模拟实体不是 Object3D。World 是事实源，Render3D 的派生记录、颜色、LOD、实例槽和 GPU 资源不进入 World 或存档，不抽模拟随机流。

| 类别 | 近景 | 中景 | 远景（后续） |
|---|---|---|---|
| Character | Mini 3D；动画接口预留 | 同类合并几何 InstancedMesh | impostor / sprite / point |
| Building | 墙、顶、门、基座 | 共享 geometry/material 的实例批次 | settlement HLOD / roof mass |
| Tree | 树干 + 2–4 个实心树冠 | 共享低模实例 | cross-card / point / ink mass |

本轮只生产一套 Base 修士、民居、树，不新增实体品种、动画系统或完整 HLOD。距离目前依据正交相机投影像素尺寸减少对比度、飞白与轮廓信息；这不等于几何 LOD 或可承诺无限实体规模。

## 批处理与身份

- Geometry 和 Material 按母版或语义类别共享；30 个同类对象不产生 30 个 draw calls。
- EntityLayer 保持原来的类别批次；`mesh.userData.renderEntities[instanceId]` 是筛选后的拾取身份映射。
- 房屋复用已有 `village.houses` / 聚落中心 / 宗门位置；不在画面中伪造道路、农田或洞府事实。
- 植被继续由 `deriveVegetation` 派生，归属只走 Stage 的 `RegionGeometry`；高度只走该 Stage 的 `ElevationField`。
- 同类实例容量不足必须暴露 overflow；后续扩容按块分配，不在逐帧中创建/释放对象。
- 模型朝向、颜色、材质和实例槽是渲染状态，不得写回人物对象。关闭 ArtPass 恢复旧表现，重新打开复用已分配资源。

## 信息预算

普通实体遵循「一个主体 + 一个身份特征」。本轮修士用简头、发髻、道袍、宽袖、腰带和鞋，不加武器或背包。房屋用纸白墙与墨顶；树使用真实体积而非透明叶片。统一有限颜色字典使用 vertex color，不为单体分配纹理。

## 痕迹与临时特效

**永久世界痕迹禁止以独立 Mesh / Decal 对象累积。** 足迹、战斗残留、灵气残留、污染和磨损若将来有模拟事实，应进入 Field / Texture / Grid accumulation，再由渲染器转换成画面。此轮不新建痕迹玩法。

短命 FX 使用有界 Pool，仍由既有 Presentation snapshot 提供事实。不得另 drain runtime events，不因观察与否补写历史。禁止持续 new → remove → dispose 抖动资源。

## 资源责任

Host 只持有美术编排器；Stage 的 Layer 拥有自己的缓存几何、材质与纹理。Host 换 World 时释放整套旧 Stage；Layer dispose 同时释放基础与美术缓存。Material clone 只能按固定母版发生，不能随实体数量增长。
