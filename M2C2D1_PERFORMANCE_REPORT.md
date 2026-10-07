# M2-C2D.1 性能与纯度报告

2026-10-07。目标为每镜 `candidate GPU median <= 同机 C2D`，不设正向差值豁免；希望追回 0.3～0.8ms。CPU submission 和 RAF interval 不充作 GPU 时间。

## 初次失败与改进依据

首次完整候选使用片元阶段四方向 manual bilinear broad：每次 bilinear 四读，新增 broad 十六读，连同 fine 五读约为每片元二十一高度读。Safety 通过，预算失败；其中 Mortal coast 7.402→9.343ms、settlement 12.023→13.672ms、Upper overview 8.077→11.190ms。它们是同机分时单次观察，未作为最终预算通过证据。

复用 UV / texel 坐标后，部分镜头仍超预算，且 GPU 波动明显。没有删弃负面数据或调高门槛。进一步把 broad 梯度移到现有共享网格顶点，片元保留五次精确高度读；代价结构成为约 `5F + 16V`，V 为实际顶点执行次数，不能直接假设等于唯一顶点数。

未增加 attribute、纹理、RenderTarget、pass、后处理或模拟缓存。四方向连续 bilinear 与 2.5 格半径保留，传递未归一化梯度，在片元中得到法线和坡度。连续性和实际网格插值单独验证；性能收益不能代替视觉检查。

## 最终计时方法

Edge / Windows / ANGLE，同一进程、同一自然 World、同一固定相机，12 镜逐项计时。每镜预先固定四轮，顺序交替 AB / BA / AB / BA（相邻镜反转初始顺序）；A 是精确历史 C2D shader / profile，B 是正式 candidate。每次切换 await 完成，48 RAF 暖机，再执行原有 120 产品帧计时器（其内部还有既有 12 RAF 暖机）。所有有效轮都保留，错误不通过性能重试抹去。

每个 style 的最终 median 定义为四轮 GPU median 的中央两数均值；p95 是四轮 p95 的最大值，明确不是 pooled p95；max 取四轮最大值，valid / invalid / skipped 查询数相加。预算逐镜比较两个汇总 median，不能以全镜平均掩盖单镜失败。

每个 style 最后一轮计时后就地采集自己的 framebuffer metrics 和正常产品截图；不是给旧图片拼接新性能数据。报告同时记录全部轮顺序、World / advance / camera、draw / triangles、资源和 GL 错误。代码来源 SHA 与测量来源分别记录。

最终逐镜数字和预算状态将在 `reports/release/render3d-m2c2d1/summary/acceptance-summary.json` 中封存；完整四轮数据保留在本地。当前文档不得据尚未完成的最终复测声明通过。

## 必需纯度与生命周期

保留原 CPU、C2D 和 C2C 门禁。复用既有 C2C 600 生命周期 + 6000 产品 RAF soak，不复制新套件。验 World / advance / save / RNG、几何 / texture / program 不增长、错误为零。

开发 A/B hot switch 还检查历史 shader 编译、原地往返 RGBA 一致、快队列顺序、异步资产调色重放、World 替换后的临时材质释放和发布域名锁定。WorldMarker 的回退 Rift 调色也跟随历史 profile，不混入最新参数。

完整终验结果见[就绪报告](./M2C2D1_READINESS.md)。本地证据不等同于远端 Actions 成功。
