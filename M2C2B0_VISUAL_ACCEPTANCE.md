# M2-C2B0 三界视觉验收

2026-10-04，B5 视觉与 B6 纯度/耐久已通过。最终工程门禁与 clean clone 状态见 [READINESS](./M2C2B0_READINESS.md)。方向依据为 [三界视觉风格圣经 v1](./美术素材/三界视觉风格规划_美术方向文档_v1.md)，未修改其核心方向。

| 范围 | 实际证明 | 裁决 |
| --- | --- | --- |
| Mortal | 7 对 overview、聚落 near/mid/far、真实水边、林地、真实角色；暖墙、墨瓦、青绿水和五种树色/轮廓 | 淡彩烟火成立；保持留白，未用全局饱和滤镜 |
| Nether | 4 对总览、地形、自然鬼修与大窗口；真实 ghostCultivator #2000213 的 LOD0 GLB/拾取 | 焦墨、飞白、骨白成立；真实魂灯玻璃与 Rift 承担少量红色 |
| Upper | 5 对总览、真实高程坡折、真实修士、低谷留白和大窗口 | 石青/石绿/赭色分组成立；不制造白蓝仙境或假浮空岛 |
| Cross | 8 对，两界各 overview、真实 breach near/far/oblique | 面数/draw/LOD 和相机一致；无 Scene Fog；窗外保持凡界风格 |

主代理实际查看新的 Mortal/Nether/Upper 总览、凡界近景聚落及跨界破口，复核 Mortal/Upper 的 legacy 对照。B1–B4 已查看真实水边/林地/人物、鬼修/魂灯、上界坡折/留白及斜视界缘。截图来自产品 RAF，未额外调用 Host.render。

正式矩阵为 `reports/m2c2b0/b5-matrix-final/matrix.json`，24 对 / 48 张新 PNG；全量本地输出被 Git 忽略，CI 输出进 artifact。Git 保留 [紧凑摘要](./reports/release/render3d-m2c2b0/summary/visual-matrix.json) 与 4 对代表 golden，详见 [视觉报告](./M2C2B0_VISUAL_REPORT.md)。颜色统计只是诊断，不作为替代人眼的阈值。

跨界两界各有 528 条界缘边段、40 条真实破口边段，6336 次 Float32 接缝比较零误差。Region 内外实际实例与 HLOD 成员归属、实际深度拾取和远景聚落 ID 通过；没有靠隐藏界缘消除遮挡。关闭窗口/切换目标恢复旧界 Raw 派生高程，避免下一次 standalone 带入旧 Strata。

正常 UI commitSelection 按既有规则开真实 Rift，会合法改变凡界 World。所有风格/相机/纯视图对照均在该动作之后取完整摘要再比较；不会把开窗前后不同的 World 当作纯度失败或隐藏此变化。目标界观察仍只读。

当前技术边界：上界/幽冥仅有可靠的地形、实体、只读选择与 FX 语义；不添加假树林、村落或水层。上界低谷淡洗依附真实地形，纸色负空间属于表现背景，没有独立云实体、悬浮岛拓扑或新可走地面。人物近景保留真实地形的合法遮挡。正式资产家族尚未生产。

600 日六模式 full World + advanceState / save SHA 与 11 RNG 一致；600 lifecycle + 6000 受测帧、20 状态全暖及 21 次强制 GC 峰值通过。几何/纹理/program 数维持 53/7/13。详细 [纯度](./reports/release/render3d-m2c2b0/summary/purity.json) 与 [耐久](./reports/release/render3d-m2c2b0/summary/lifecycle-soak.json) 证据保留。
