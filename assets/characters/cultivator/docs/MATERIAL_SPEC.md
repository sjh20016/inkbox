# 共享角色材质与调色图

所有修士模块共用 `cultivator_flat_palette` 和 `../materials/cultivator_palette_12.png`。色图仅 **12×1 RGBA**；一张 PNG、一张运行时 Texture、一个角色 Material。GLB 内嵌同一色图，独立 PNG 供 Blender 编辑和外部工具使用，不在运行时重复加载。

| Index | 语义 | sRGB Hex |
|---|---|---|
| 0 | skin / 肤色 | #F4C9AC |
| 1 | paper_white / 纸白 | #ECE6DE |
| 2 | warm_beige / 米色 | #D4BEA8 |
| 3 | ink_black / 墨黑 | #302D32 |
| 4 | blue_gray / 蓝灰 | #8597B0 |
| 5 | sect_blue / 宗门蓝 | #355B91 |
| 6 | earth_brown / 土褐 | #806A5D |
| 7 | dark_red / 暗红 | #8D3A3A |
| 8 | ghost_cyan / 幽青 | #36676A |
| 9 | medicine_yellow / 药黄 | #E8B454 |
| 10 | gray_purple / 灰紫 | #A6A0AB |
| 11 | muted_green / 蕴绿 | #6E7B56 |

每个三角形的三个 UV 都取色块中心 `((index + 0.5) / 12, 0.5)`；Nearest 采样。不要展开成传统高密度 UV，不要在两个色块间插值。Flat normals 保留大几何平面。

当前 runtime 为 2026-10 v2 重建版（legacy cells 版）：内嵌调色板 PNG 与 `../materials/cultivator_palette_12.png` 字节一致（SHA256 `d8eff33c…7a99`，12×1），材质/采样器定义未变。`scripts/inkbox-characters-check.mjs` 会逐三角形断言所有 UV 落在单一色格中心，并把实测色格三角数写入 `../data/structural_validation.json` 的 `moduleUvCells`。

### v2 legacy 色格实测

| 区域 | 色格 | 说明 |
|---|---:|---|
| 外袍、上袖（faction 可换色区） | 5 sect_blue | body 实测 88 三角形；`CharacterLibrary` 只重定向这一格 |
| 交领、腰带、袖口 | 4 blue_gray | body 实测 62 三角形 |
| 裤 | 6 earth_brown | body 实测 32 三角形（v1 语义一致） |
| 眼、靴 | 3 ink_black | body 实测 24 三角形 |
| 肤色（脸、手、耳） | 0 skin | body 实测 136 三角形 |
| 基础发 | 3 ink_black + 发冠/发带 10 gray_purple | body 之外的 hair_base：78 + 8 |
| 长老发 | 1 paper_white + 发带 4 blue_gray | hair_elder：74 + 8 |
| 鬼发 | 3 ink_black + 红梢 7 dark_red | hair_ghost：78 + 16 |

发带是 v2 新增的独立色格（基础发 cell 10），运行时不会按身份换色（游戏只重映射 factionSlot 5）。资产包 README 中的“02 宗门弟子发带 10→5”等六身份重映射属于作者预览配色，本仓库 runtime 未实现逐部件重映射：身份仍由模块组合 + role `paletteIndex` 改外袍主色表达。另：`sect_token` 在 v2 带 12 面 cell 5 区域，因此令牌蓝色部分会随 faction 主色一起变化（v1 令牌无 cell 5）。

共享身体中袍身、上袖的 UV 固定使用 **index 5**，表示可替换的主色区域。它既是宗门蓝色块，也是运行时指定区域的语义标记。`instancePaletteIndex` 只重定向这一 UV 色块；basic、游修、长老、鬼修、丹修的默认主色来自 role 配置。皮肤 index0、眼睛/鞋/黑发 index3、领口/腰带/袖口 index4 均保持原样，不用整体 instanceColor 把人脸一起染色。

宗门色映射到蓝5、红7、绿11、灰10、黑3这五种受控主色，几何不变。具有宗门的高阶修士和丹修同样可以使用宗门主色，白发/丹炉标记继续表达身份；没有宗门时使用职业默认色。所有主色调整只存在于表现数据，不回写实体或存档。

Blender 的最简 Principled 节点仅用于 glTF 标准材质导出：baseColor=atlas、metallic=0、roughness=1；没有额外 PBR 贴图。Three.js 实际使用同一 `MeshLambertMaterial`、flatShading、单 atlas 和 palette shader hook。魂灯也使用这张调色图，本版不增加独立发光材质、透明层或动态光源。

水墨、宣纸、轮廓、受伤/入魔状态应在渲染层追加，不烘焙到人物皮肤和衣服贴图。禁止新增 2K/4K 角色纹理、normal/roughness/metallic map、每人独立材质或为宗门复制 mesh。

`CharacterLibrary` 是 GPU 资源所有者，Host 下的三个 Stage 共用同一个库。每个 batch 独有的实例矩阵和 palette 属性由 batch 释放；库最后释放共享 geometry、material、texture 与 ImageBitmap。外部注入的库由调用者释放，Host 不抢夺其所有权。
