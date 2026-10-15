# M2-C2D.1 性能与纯度报告

2026-10-07 开工，2026-10-08 完成本机终验。目标为每镜 `candidate GPU median <= 同机 C2D`，不设正向差值豁免；希望追回 0.3～0.8ms。CPU submission 和 RAF interval 不充作 GPU 时间。

## 初次失败与改进依据

首次完整候选使用片元阶段四方向 manual bilinear broad：每次 bilinear 四读，新增 broad 十六读，连同 fine 五读约为每片元二十一高度读。Safety 通过，预算失败；其中 Mortal coast 7.402→9.343ms、settlement 12.023→13.672ms、Upper overview 8.077→11.190ms。它们是同机分时单次观察，未作为最终预算通过证据。

复用 UV / texel 坐标后，部分镜头仍超预算，且 GPU 波动明显。没有删弃负面数据或调高门槛。进一步把 broad 梯度移到现有共享网格顶点，片元保留五次精确高度读；代价结构成为约 `5F + 16V`，V 为实际顶点执行次数，不能直接假设等于唯一顶点数。

未增加 attribute、纹理、RenderTarget、pass、后处理或模拟缓存。四方向连续 bilinear 与 2.5 格半径保留，传递未归一化梯度，在片元中得到法线和坡度。连续性和实际网格插值单独验证；性能收益不能代替视觉检查。

续作在同一机器保留五次完整十二镜失败记录（`paired`、`paired-zero-weight`、`paired-packed`、`paired-axis`、`paired-debug`），以及两次三镜失败诊断（`gradient-probe`、`compile-probe`）。对照由精确历史 C2D shader / profile 热切换，不能改基线、挑轮次或采用更高的历史耗时。局部探针均明确 `diagnosticOnly=true`、`finalAcceptanceEligible=false`。

最终降本复用既有 RGBA 通道：水深 R 不变，G/B/A 提供三向邻域，岸线从五读减为两读；高度 R/G 不变，B/A 提供半径 2.5 的宽域梯度，默认每顶点一读。真实 dirty 刷新先写精准 R/G，再只在 ±3 格 halo 重算 B/A；type-only 不触发高度上传。通用任意小数 bilinear 与半径不匹配的轴向 fallback 保留。

final shader 在编译期关闭分层调试；final↔debug 在同一材质对象上释放旧 program 引用并重新编译。按委托书§15简化 Mass 的平方坡度响应，减少一次宽域长度计算；Structure 复用已算的坡度和低频噪声，每片元少算一组四次 hash/sin。中等坡度的明暗更弱、稀疏墨斑位置改变，属于可审阅的视觉取舍，并非旧画面的数值等价变换。没有删去连续采样、Structure、Brush、Water 或 Boundary。

## 最终计时方法

Edge / Windows / ANGLE，同一进程、同一自然 World、同一固定相机，12 镜逐项计时。每镜预先固定四轮，顺序交替 AB / BA / AB / BA（相邻镜反转初始顺序）；A 是精确历史 C2D shader / profile，B 是正式 candidate。每次切换 await 完成，48 RAF 暖机，再执行原有 120 产品帧计时器（其内部还有既有 12 RAF 暖机）。所有有效轮都保留，错误不通过性能重试抹去。

每个 style 的最终 median 定义为四轮 GPU median 的中央两数均值；p95 是四轮 p95 的最大值，明确不是 pooled p95；max 取四轮最大值，valid / invalid / skipped 查询数相加。产品计时器按 120 帧调用，内部既有多一次查询，本轮实际每 style / 镜头有效 GPU 查询为 4×121=484，按实数记录。预算逐镜比较两个汇总 median，不能以全镜平均掩盖单镜失败。

每个 style 最后一轮计时后就地采集自己的 framebuffer metrics 和正常产品截图；不是给旧图片拼接新性能数据。报告同时记录全部轮顺序、World / advance / camera、draw / triangles、资源和 GL 错误。代码来源 SHA 与测量来源分别记录。

最终逐镜数字、全部轮次汇总、来源 SHA 与资源数据已封存在 `reports/release/render3d-m2c2d1/summary/acceptance-summary.json`；完整四轮数据保留在本地。

## 必需纯度与生命周期

保留原 CPU、C2D 和 C2C 门禁。复用既有 C2C 600 生命周期 + 6000 产品 RAF soak，不复制新套件。验 World / advance / save / RNG、几何 / texture / program 不增长、错误为零。

开发 A/B hot switch 还检查历史 shader 编译、原地往返 RGBA 一致、快队列顺序、异步资产调色重放、World 替换后的临时材质释放和发布域名锁定。WorldMarker 的回退 Rift 调色也跟随历史 profile，不混入最新参数。

完整终验结果见[就绪报告](./M2C2D1_READINESS.md)。本地证据不等同于远端 Actions 成功。

## 2026-10-08 最终本机结果

完整 `paired-final-v2` 同会话十二镜、固定四轮均通过逐镜零容差预算，改善 0.170～0.669ms；没有以全镜平均覆盖单镜失败。每 style / 镜头为 484 个有效 GPU 查询。

| 视角 | C2D median ms | C2D.1 median ms | 差值 ms |
| --- | ---: | ---: | ---: |
| mortal-overview | 5.613 | 5.360 | -0.253 |
| mortal-coast-near | 6.124 | 5.954 | -0.170 |
| mortal-cliff-near | 10.105 | 9.799 | -0.306 |
| mortal-settlement-near | 12.312 | 11.911 | -0.401 |
| upper-overview | 6.330 | 5.882 | -0.448 |
| upper-boundary-near | 7.555 | 7.299 | -0.256 |
| nether-overview | 5.444 | 5.091 | -0.354 |
| nether-boundary-near | 6.954 | 6.670 | -0.284 |
| mortal-cliff-mid | 9.405 | 9.079 | -0.327 |
| mortal-settlement-mid | 9.139 | 8.873 | -0.266 |
| upper-terrain-mid | 9.713 | 9.044 | -0.669 |
| nether-terrain-mid | 8.394 | 7.822 | -0.572 |

硬件：ANGLE (AMD, AMD Radeon(TM) 610M (0x0000164E) Direct3D11 vs_5_0 ps_5_0, D3D11)；Edge Edg/154.0.4258.62，1500×940，DPR 1。比较采用同一产品导入、同一 World / camera / POI；各帧 World / advance 检查、draw / triangles 和 GPU 资源契约通过，GL / runtime / console error 为零。

最终 9 项 CPU 门禁通过，运行期间 31 个运行源码、验证脚本及 CI 文件 SHA 稳定，八个运行文件仍与最终捕获逐字节匹配。随后修正两处验收脚本：等待短命 FX 自然播完再做精确 A/B；区分可见界缘和隐藏缓存。原始失败保留，完整切换与十二镜四轮已重新通过，原几何断言保留，界缘断言增加。没有改计时阈值或生产源码。

连续采样、真实生产网格插值、半径 fallback、60 点岸线邻域等价、水面和界缘独立 GPU 契约通过；历史 A/B 原地往返与 World 重载通过。原 C2D Browser 复验通过。复用原 C2C 套件的 600 lifecycle + 6000 产品 RAF、20 个测量区块通过，未复制或缩减套件。

本机原始日志、十二镜、分层、消融与失败记录在 `reports/local/m2c2d1/resume-20261007/`。Git 仅保存八张正常 Golden 与不超过 256KiB 的 compact summary；完整计时证据不进运行包。362 文件的构建与发布包审计通过，ZIP 约 2.83MiB。工程通过不代替人工美术判断；上传后远端 CI 以对应分支提交的 Actions 为准。
