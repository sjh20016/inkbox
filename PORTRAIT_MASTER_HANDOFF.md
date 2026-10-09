# G2-P 手绘母版交接说明

## 交付定位

本工程的 PSD 是可编辑的美术源文件，游戏运行时消费的是从固定槽位导出的透明 PNG 与 `assets/portraits/inkbox-face-v1/manifest.json`。请先阅读 [资产契约](PORTRAIT_MASTER_ASSET_CONTRACT.md)；不要把 PSD 中的预留子层当成已实现的运行时功能。

标准尺寸为 PSD 1024×1024、导出 PNG 512×512 RGBA、逻辑画布 `0 0 100 100`。所有槽位使用完整画布和同一原点，不裁边。衣领仍在 PSD `02_robe` 内绘制并随完整衣身组合导出为 `robe`；`collar` 是造型字段，不是独立运行时槽位。

## 作者建议绘制顺序

1. `04_face`：先完善基础脸型变体，确保脸部位置、下颌与颈部基准清楚。
2. `06_eyes`：优先重绘左右眼子组，保留可分别编辑的眼白、眼线、瞳仁、瞳孔和高光。v1 导出时将所选双眼合成为一个 `eyes` PNG。
3. `07_brows`：分别调整左右眉型，并按锚点检查眉眼关系。
4. `12_frontHair`：逐个增加前发变体，确认遮挡眉眼的效果；不要为每款发型重定位五官。
5. `01_backHair`：增加后发变体，并检查其与脸、耳朵、衣身的叠放。
6. 再补鼻、嘴、耳、颈、衣身/交领、饰物、背景与状态纹样。

先做一个完整默认外貌，再一次只切换一个变体组检查组合；候选层应独立开关，不能把备选形状一起导出。轻伤、衰老、鬼魂化、入魔等放在对应状态子组，不修改基础肤色和基础脸部像素。

## 资源映射约定

Manifest v1 的 `slots` 将槽位与稳定 ID 映射到包内相对 PNG 路径。已有脸型、眼型、眉型、嘴型、发型和服饰 ID 见 `src/inkbox/ui/g2/portraits/v2/portraitSchema.js`；不要复用旧 ID 表示新形状。状态覆盖可使用 `skinMarks` 或 `effects` 下的稳定效果名，但应牢记 v1 是槽位级整图替换。

工具入口：

```bash
node tools/portrait-master/generate-master.mjs
node tools/portrait-master/export.mjs
python tools/portrait-master/check-master.py
```

工作顺序为：仅在有意重建时运行生成器 → 在 Photoshop 中编辑并保存 → 运行导出器到示例包 → 校验 PSD、图层、尺寸、透明度与导出结果。生成器默认拒绝覆盖 PSD/预览，除非显式传 `--force`；导出器默认只写入 `examples/master-demo/`。任何工具输出异常时先保留源文件并修正层名/可见态，不要覆盖已有正式手绘资源。

导出的正式资源放在 `assets/portraits/inkbox-face-v1/`，PSD、锚点和预览等源文件放在 `assets/portraits/source/`。每次新增素材只新增或明确更新目标 Manifest 项；发布后保持 ID 语义稳定。

## 状态和功能边界

运行时的 `portraitState` 是由宿主提供的表现状态，包括年龄阶段、伤势等级、疤痕、鬼魂状态、污染等级、功法类型及有限表情值。它与遗传 `genome` 分开。素材不会自行触发状态，PSD 也不保存人物的模拟事实。

当前引擎按固定 16 槽顺序绘制，Manifest v1 支持单个槽位整 PNG 替换及缺失资源回退。状态解析可产生 `skinMarks`/`effects` 效果项，但整张覆盖不等于局部混合。单独瞳孔染色、单侧异变、多个局部状态同时无损合成、任意前后景插层、复杂附身/转世身份表现，都需要后续明确的运行时数据、槽位或 Manifest 扩展。

## 当前验收记录（2026-10-09）

- PSD：`assets/portraits/source/inkbox_face_master_v1.psd`，9,620,584 bytes；8BPS v1、1024×1024、RGB/8，嵌入 sRGB IEC61966-2.1。
- 结构：16 个一级运行时槽位组、141 个图层组、115 个栅格层，其中 114 层含独立非透明像素。
- 独立读取：`psd-tools` 成功重新读取并验证图层、ICC、尺寸、锚点及导出结果。
- Photoshop：用已安装 Photoshop 打开、原生保存到副本、重新打开并导出 PNG；元数据保持 1024×1024 RGB/8、sRGB、138 组/97 栅格层。该 PNG 对母版预览比较均值/最大通道差为 0.011/1。
- 导出：28 张全画布透明 PNG 均为 512×512；眼/眉边界框处于共同坐标系；Manifest 示例路径与 ID 检查通过。
- 合成：母版预览与 PSD 合成缓存差异为 0/0；运行时槽位 PNG 重组差异均值/最大通道差为 0.182/38；对照图在 `research/g2-portrait-preview/inkbox-face-master-composite-comparison.png`。
- 变式：9 组状态/外貌组合；256/128/64/48 像素缩放预览；“卜算子”封面与风起掀角为隐藏 PSD 试验层，未列入 Manifest v1。
- G2-P 现有校验：`node scripts/inkbox-g2-portrait-check.mjs` 通过 123 项断言（DOM stub）。

复测命令与安装方式见 `tools/portrait-master/README.md`。若在其他平台没有安装图形编辑器，应将 GUI 兼容标为未验证；独立解析器成功不替代 Photoshop/Krita 实测。

## 讨论方向落地

当前默认示例保留无遮挡的标准绘制母版。卜算子符纸只作独立隐藏层，两个状态预览验证前景遮挡与风起时五官透出。她的故事身份和环境风力不写入 `genome`；现有 `ornament` 随机 ID 不能直接复用或扩充来实现剧情指定。若要在正式游戏使用，需要先建立明确的剧情外观覆盖输入与风力状态入口，再新增兼容运行时资源映射。

本轮优先验证长期生产方法、统一锚点、分层遮挡、PS/运行时合成对照；没有试图一次性画完所有年龄、鬼化、入魔、功法或角/鳞片素材。PSD/游戏资源包保持解耦，新增空组只表示美术预留。
