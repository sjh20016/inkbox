# M2-C · ArtPass Profile

2026-10-04：正式3D默认已改为 `realm-style-v1`，以 Stage.plane 读取 [三界单源](./REALM_STYLE_PROFILE_SPEC.md)；`art=legacy` 保留旧 pilot。下表记录仍保留的历史通用调参，v1 的三界固定参数不可用这些滑条覆盖。

历史运行入口：`inkbox.html?renderer=3d&art=pilot`。`art=baseline` 回到原 M2-B 材质；`art=pigment` 为 S1；`art=ink` 为 S1+S2；`art=pilot` 增加三类母版；`art=low` 降低纸纹与飞白。正式默认界面不添加调参面板。

开发调参：加 `&artdebug=1`，展开「Art · 写意调试」，可实时修改并导出 JSON。参数定义唯一来源为 `src/inkbox/render3d/art/ArtPassProfile.js`。数字是艺术判断的起点，不是图像指标的优化目标。

| 参数 | 含义 |
|---|---|
| paperColor | 宣纸底色 |
| pigmentDensity | 颜料吸收浓度 |
| pigmentSaturation | 颜料保留色相的程度 |
| terrainBoundaryStrength | 类型分界的淡墨 |
| structuralInkStrength | 高程曲率、沟谷与坡折产生的结构墨 |
| silhouetteInkStrength | 与观察方向有关的轮廓墨，独立于结构墨 |
| inkDensity | 世界空间低频分布控制落墨留白 |
| dryBrushStrength | 世界空间稳定飞白 |
| distanceFade | 按投影信息尺寸减少浓度和细节 |
| paperGrainStrength | 极弱屏幕空间纸粒 |

`host.setArtProfile(nameOrOverrides)` 与 `host.art.setProfile(...)` 是同一入口。覆盖参数有限值检查和范围收敛后冻结；不接受任意 shader 或 World 字段。`enabled` / `pilots` 可以用于对照。导出的 profile 是开发资产，不是世界存档。

## 材质与数据

高度纹理是 RGBA Float32：R 为 `world.height`，G 为同一 Stage 的最终 `elevation.node`。分类纹理是 RGBA Uint8，R 储存原始 terrain ID，NearestFilter；warp 只扭曲取样坐标，不混合 ID。采用 RGBA 是因为项目固定 Three r186 的局部纹理上传按 4 分量计算。

坡度/有符号曲率在世界空间取邻域高度。结构墨经 slope、curvature、低频 noise、距离和 profile 联合控制，飞白不依赖帧时间。类型色先作为颜料吸收量映到纸色，不通过全屏 LUT 统一三界。材质各自读取所属世界，不新建每界 Fog。

## 当前 S3 状态

产品路径无 RenderTarget / Depth Outline 合成依赖。S0.5 在真实 Intel UHD730 / Edge154 验证 full/half、MSAA4、DepthTexture、resize、色彩与深度回读均通过，结果见 PERFORMANCE_REPORT。兼容性通过不等于持续 GPU 成本已测定；S3继续关闭。关闭后处理时 S1/S2 与实体母版仍完整成立。

## 参考包适配

Sonnet 包基于 M2-A，当前源码没有其 ArtPass。复用的是它「统一纸色/低色度/少量笔墨/开关对照」的意图，承接 M2-B 的 ElevationField、RegionGeometry、RealmBoundaryLayer。未安装包内旧 RegionMask3D、RimField 或 SkirtLayer，以免出现第二套高程/遮罩/界缘。
