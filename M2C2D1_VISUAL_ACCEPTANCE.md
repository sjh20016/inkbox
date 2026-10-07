# M2-C2D.1 近景绘画化纠偏与视觉收束

2026-10-07 开工，2026-10-08 完成本机工程验收。施工分支 `codex/m2-c2d1-painterly-reconciliation`。本轮交付可复查的工程候选；自动 Safety Gate 不代替人工美术封板。Step2 的 01～04 岸线对比已经获得用户确认，其余最终镜头保留人工判断。

## 固定证据与执行顺序

正式矩阵仍为 01 Mortal overview、02 Mortal coast near、03 Mortal cliff near、04 Mortal settlement near、05 Upper overview、06 Upper boundary near、07 Nether overview、08 Nether boundary near。另有四个中景：Mortal cliff / settlement、Upper / Nether terrain。相机、真实 World 和产品导入路径固定；正式 Golden 是正常产品画面，不是 debug 或合成效果图。

依次完成分层诊断、仅岸线修复与人工确认、E1 主线 tone、E2 连续 Mass、E3 稀疏 Structure、水、界缘，最后统一三界参数。没有从岸线阶段跳到全局调色。下表记载原 WIP 的阶段顺序，原机器 ignored 截图未随 Git 传输；它们不作为本机终验证据。当前源码在 `resume-20261007/ablations/E1`、`E2`、`E3` 重做同世界、同相机的 uniform 消融，在 `final-contracts/` 重做六层诊断，在 `supplement/` 重做三个水体补充。当前消融是最终候选的受控对照，不伪称回到原历史阶段源码；全量图不进运行包。

| 阶段 | 本地证据目录 | 判断范围 |
| --- | --- | --- |
| E0 | `E0-c2d` | 开工 C2D，12 镜 |
| Step1 | `step1-final`、`decomposition` | 添加开发诊断后正式结果不变 |
| Step2 | `step2-review` | 仅岸线；用户已确认 |
| E1 | `E1-main-tone-new-coast` | 关闭过强 mass / deep，恢复 main tone，8 镜 |
| E2 | `E2-continuous-mass-ordered`、`step4-probes` | 仅连续 Mass，03 / 04 / 05 / 07 |
| E3 | `E3-structural-deep` | 再开启经过标定的结构墨 |
| Water | `step6-water-readable` | 02 与三个本地补充视角 |
| Boundary | `step7-boundary` | 06 / 08，随后才调整 RealmStyle |
| 顶点优化分层 | `mass-vertex` | 03 / 04 / 05 / 07 及四个中景；不承担性能证据 |

04 固定 POI 是自然世界中房屋数最多的村落，但原相机方向被前景山体遮挡；没有为好看而换掉正式镜头。另加凡间水体、村水同框和反向岸线三个本地检查，检查真实建筑和水的关系，不替代正式矩阵。

## 委托书十二项答复

1. **C2D 为什么显得别扭？** 干燥内陆误吃岸线纸色；所谓 broad 仍跳格，而且 Mass 混入 fine slope；凡间全局 contrast、Mass 和 deep 同时偏强。水太透明，露出水底的结构面片；界缘大面填色抢过地表和实体。它们叠加成碎面、硬反差和厚墙，不能靠再加纹理解决。

2. **Coast 的 bug 是什么？** `1-smoothstep(...,wd)` 在 `wd=0` 时为 1，普通干山和平原也被当作海岸。新 mask 要求中心与四邻域同时存在 wet、dry 和局部深度变化；均匀浅水也不等于岸线。烘染权重从 0.20 降到 0.07。GPU 合成探针中，干平原、干山、均匀浅水和远离岸线的干地开关前后 RGB 差为 0，真实过渡保留非零反应。

3. **旧 broad 为什么不是真正连续场？** 旧 `hAt` 对浮点位置先取整，再读 Nearest texel，扩大差分半径仍会跳格。现在保留精确 `hAt/typeAt` 和纹理 Nearest 契约，另用手写四 texel bilinear；半径 2.5 格。生产高度纹理原空闲 B/A 存储同一连续差分的未归一化梯度，dirty 高程更新后刷新三格 halo；现有共享顶点一读，经 varying 连续插值后才计算法线和宽域坡度响应。无缓存或改半径时保留连续轴向 fallback。它是 C0 连续、逐三角形线性的视觉重建，**不声称与逐片元重新 bilinear 求导数值等价，也不声称一阶导数处处连续**。真实网格插值另有 GPU oracle，不能用退出产品路径的 helper 测试冒充验证。

4. **三层分别负责什么？** Mass 只用 broad normal / broad slope 决定柔和大明暗，不吃 fine slope、curvature 或 noise。Structure 用精确格点的坡折、脊谷、方向和稀疏干笔 mask 承担少量重墨，deep 权重上限 0.22。Brush 保留世界坐标干笔和飞白，承担局部笔触，不决定整座山的黑白。最终 Mass 用梯度平方 smoothstep 减弱中等坡度；稀疏笔触复用低频 warp 噪声，因而位置与类别扰动轻微相关。该取舍减少着色成本，须用正常图判断。

5. **Mortal 撤回哪些参数？** `contrast 1.14→1.03`、`massShade 0.56→0.16`、`deepInk 0.58→0.16`、`heightWash 0.05→0`，坡色强度降到 0.24。屋瓦、人物和小面积异常物保留深色锚点；建筑、人物和植被的既有彩色关系保留。没有以整体漂白掩盖错误岸线或不连续 Mass。

6. **水如何留白而可读？** 主体用纸色向花青混合，深水系数限制在 0.20～0.35；凡间 opacity 为 0.84，浅水较轻，深水仍形成完整负形。最初过低 alpha 的实图暴露水底结构，已修正，不能把它解释成几何遮挡。世界坐标生成长而断续的横纹，随 pixelsPerUnit 在远景关闭、近景轻启。岸边只留弱烘染。水网格拓扑与分辨率未改。

7. **Boundary 为什么退后？** 大面底色向纸与空气混合，Upper `baseStrength/faceOpacity=0.18/0.36`，Nether 为 `0.38/0.50`。信息集中到窄顶缘、少量纵向层理、骨线和裂痕；底部颜色与 alpha 同时消失。保留透明、depthTest，关闭 depthWrite，DoubleSide 单次绘制；专门检查正反面和不透明遮挡。没有新增墙面、发光或全屏后处理。

8. **Upper 保留什么？** 保留石青石绿、赭色、云白和既有矿物 color layer（0.90），保持 05 的方向。高 qi 区域更澄明，矿物场叠色、泥金和类别边界权重降低；不新增云平面、岛屿或文明资产。

9. **Nether 如何深而不黑？** 地形改用磁青中间调、冷灰，yin 整片焦墨混合减弱；contrast 回到 1.16，exposure 0.94。结构仍用深墨，骨白成为少量锚点。Boundary 从实黑大面退到灰色断面、细骨线；真实 yin / Rift / ghost 语义保留，不删除异常物以降低黑色统计。

10. **指标为什么不能封板？** Safety 只阻止极暗、饱和暴涨、整体洗白、span 灾难性退化和资源失控。nearPaper、dark30、span、local contrast、Sobel edge density、高低频能量仅用于 main / C2D / candidate 对照。`artDiagnostics.acceptance=null`、状态 `human-review-required`；既不把 3% 纸色当美术成功，也不把 span 增大当保住皴纹。

11. **GPU 是否追回开销？** 首次逐片元连续 broad 候选未通过预算，UV 去重也未解决全部回归；这些失败保留。最终同 Edge 固定四轮十二镜全部通过，每镜比同机 C2D 快 0.170～0.669ms；见[性能报告](./M2C2D1_PERFORMANCE_REPORT.md)。逐镜零容差，不用平均值、旧历史最大值或单次最低值覆盖失败。

12. **哪些留给下一阶段？** 真实山体面片轮廓、世界外切面的板感、水岸网格局部直线、04 固定相机遮村，以及实体和地形的笔触一致性仍需专门处理。顶点梯度的导数在三角边可能折变，当前不把 C0 连续夸成消除所有三角感。详见[后续事项](./M2C2D1_FOLLOWUPS.md)。

## 视觉结论边界

本轮已经拆清错误岸线、连续山势、结构墨、水的负形和界缘的消隐职责。Mass 分层没有新增格内常量矩形；正式画面仍可见冻结的真实地形面片和实体低模轮廓。这是已收束的可审阅候选，最终是否“像一幅完整的画”仍需用户看正式八镜与中景对比作判断。

正式 Golden、来源 SHA、资源与逐镜指标由 release compact summary 记录；不要把本页或任何自动通过字样解释成用户已批准最终美术。

## 本机最终图像诊断

| 视角 | 近纸色 C2D→候选 | L<30 C2D→候选 | 高频能量 C2D→候选 |
| --- | ---: | ---: | ---: |
| mortal-overview | 0.596→0.644 | 0.013→0.010 | 0.01365→0.00978 |
| mortal-coast-near | 0.264→0.314 | 0.045→0.028 | 0.01341→0.01087 |
| mortal-cliff-near | 0.033→0.045 | 0.030→0.015 | 0.01025→0.00943 |
| mortal-settlement-near | 0.290→0.302 | 0.001→0.000 | 0.00391→0.00350 |
| upper-overview | 0.595→0.602 | 0.000→0.000 | 0.00816→0.00626 |
| upper-boundary-near | 0.232→0.428 | 0.014→0.010 | 0.01922→0.01306 |
| nether-overview | 0.608→0.682 | 0.054→0.000 | 0.00837→0.00503 |
| nether-boundary-near | 0.057→0.153 | 0.105→0.008 | 0.00874→0.00532 |
| mortal-cliff-mid | 0.227→0.284 | 0.039→0.029 | 0.01957→0.01636 |
| mortal-settlement-mid | 0.405→0.417 | 0.026→0.014 | 0.01011→0.00976 |
| upper-terrain-mid | 0.056→0.066 | 0.000→0.000 | 0.01203→0.00941 |
| nether-terrain-mid | 0.050→0.133 | 0.194→0.015 | 0.01196→0.00907 |

这些数值描述差异，不是绘画质量评分。最终八张正常 Golden 在开发目录 `reports/release/render3d-m2c2d1/golden/`，四中景与左右对比 sheet 在本机 `resume-20261007/review/`；冻结的 02 切面与 04 遮村仍如实保留。最终美术 `acceptance=null`，等待用户裁决。
