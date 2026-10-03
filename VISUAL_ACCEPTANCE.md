# M2-C · 视觉与浏览器验收

最终证据目录：`reports/release/render3d-m2c/`。每个视图四档：baseline 为旧材质，pigment 为 S1，ink 为 S1+S2，pilot 为 S1+S2+母版。每张 PNG 配同名 JSON，固定种子、完整随机流、世界年龄、相机、viewport 和快照。

## 截图矩阵

| 视图 | 验收内容 |
|---|---|
| 01_mortal_overview | 纸底参与留白；远景仍可辨地貌与水色 |
| 02_mortal_mountain | 结构墨来自山脊/沟谷/坡折；不是每个三角面描边 |
| 03_pilot_entity_medium | 真实修士的道袍与轮廓在中景可辨 |
| 04_pilot_entity_close | 发髻、宽袖、腰带、鞋；飞白不形成密集亮点 |
| 05_building_tree_character | 真实民居、实体与低模树在同一纸墨场景可辨 |
| 06_upper_boundary | 原有上界窗口和界缘，纸色统一，区域拾取正确 |
| 07_nether_boundary | 原有幽冥窗口和界缘，保留少量语义色 |
| 08_dense_test | 同类批处理，密集对象不增加独立材质/Draw call |

## 验收口径

图像指标只诊断 near-paper、平均饱和度、中间调、边缘、点睛色和亮度，不为达比例把画面调白。结果由 `scripts/inkbox-m2c-image-metrics.py` 生成；固定 playfield 裁剪仍可能含少量产品覆盖层，不能当纯场景像素精确测量。

真实 GPU 编译、Entity ID 的投影拾取、三界 visible-region 拾取、Resize、连续旋转、缩放、材质开关和资源稳定性以浏览器 evidence 为准。Node 的材料合约只检查结构与数据，不能证明 GLSL 编译或模型实际入画。

## 已修正的问题与范围

最初 day10/day60 配方缺少修士和房屋，改用正常每日推进的成熟世界。最初各场景没有重置 Sandbox 随机流，使同 seed/day 快照受场景顺序影响；最终配方固定随机流并记录快照 digest。实体早期飞白过密已降为稀疏低频纹；一次 GLSL 保留字错误导致实体未绘制，已修复并重新采样。

本轮不声称完整远景几何 LOD、动画、大规模资产族或 S3 后处理已经完成。默认关闭 S3；实时参数面板仅为开发入口。

最终八个pilot视图均已逐图审阅；32张对照图和manifest齐全。03/04真实修士id34、05真实修士id13，完整opaque场景求最近交点，五个身体投影点全部可见，并与普通Picker实体身份一致。近景可辨发髻、头、道袍轮廓和鞋，同框视图保留真实民居与实心低模树。没有移动任何世界对象或隐藏遮挡层来伪造可见性。

既有 Canvas、M2-A、M2-B 浏览器回归也通过。M2-A oracle 对 M2-B 界缘的遗漏已修正，原样采样和全部退出断言保留；修正前的六例偏差可在修改前源码复现。原失败与最终结果均有记录，没有把失败覆盖为通过。详见 BASELINE_TEST_COUNTS。

地形已由彩色格面转为纸底薄色与稀疏结构墨；树、白墙墨顶和修士使用同一色板。上界界缘仍保留M2-B厚重深色切面，后续需继续减墨与视觉深化；本轮不是最终Art Pass。

Edge154 / Intel UHD730：32张图采集退出0，shader/runtime错误0；三界拾取没有不可见位面错配，600帧旋转/缩放/Resize/开关和资源门禁通过。独立6000帧检查约100秒，World完整指纹不变，资源与profile稳定，GPU分类取样和局部上传回读通过。详见 `evidence.json`、`soak-evidence.json` 与 PERFORMANCE_REPORT。

固定裁剪下凡间overview诊断：baseline→pilot 的near-paper为0.057→0.559、mean saturation0.204→0.046、mid-tone0.370→0.169、edge density0.109→0.044、point-color0.266→约0、brightness0.630→0.854。近景和同框的中间调仍分别约0.733与0.528，说明不同场景不能套同一留白目标。数字描述最终截图，不作为通过阈值或下一轮调参目标。

建议继续小批实体家族生产与LOD/HLOD验证。当前近景统一性和共享批处理路线成立；稠密overview的短采样pilot rAF p95达到33.3ms，尚不支持无条件60FPS或任意规模扩展。失败、过时与缺少真实对象的早期截图保留本地，不列入最终通过矩阵。
