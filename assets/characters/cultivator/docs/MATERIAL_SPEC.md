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

共享身体中袍身、上袖的 UV 固定使用 **index 5**，表示可替换的主色区域。它既是宗门蓝色块，也是运行时指定区域的语义标记。`instancePaletteIndex` 只重定向这一 UV 色块；basic、游修、长老、鬼修、丹修的默认主色来自 role 配置。皮肤 index0、眼睛/鞋/黑发 index3、领口/腰带/袖口 index4 均保持原样，不用整体 instanceColor 把人脸一起染色。

宗门色映射到蓝5、红7、绿11、灰10、黑3这五种受控主色，几何不变。具有宗门的高阶修士和丹修同样可以使用宗门主色，白发/丹炉标记继续表达身份；没有宗门时使用职业默认色。所有主色调整只存在于表现数据，不回写实体或存档。

Blender 的最简 Principled 节点仅用于 glTF 标准材质导出：baseColor=atlas、metallic=0、roughness=1；没有额外 PBR 贴图。Three.js 实际使用同一 `MeshLambertMaterial`、flatShading、单 atlas 和 palette shader hook。魂灯也使用这张调色图，本版不增加独立发光材质、透明层或动态光源。

水墨、宣纸、轮廓、受伤/入魔状态应在渲染层追加，不烘焙到人物皮肤和衣服贴图。禁止新增 2K/4K 角色纹理、normal/roughness/metallic map、每人独立材质或为宗门复制 mesh。

`CharacterLibrary` 是 GPU 资源所有者，Host 下的三个 Stage 共用同一个库。每个 batch 独有的实例矩阵和 palette 属性由 batch 释放；库最后释放共享 geometry、material、texture 与 ImageBitmap。外部注入的库由调用者释放，Host 不抢夺其所有权。
