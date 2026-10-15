# M2-C2A 性能与稳定性封板

2026-10-03。结果由最终15项浏览器矩阵、600-frame lifecycle、6000-frame soak、600日六模式模拟及旧门禁产生。机器为 ANGLE (AMD, AMD Radeon(TM) 610M (0x0000164E) Direct3D11 vs_5_0 ps_5_0, D3D11)；Edge / Windows，viewport1500×940，DPR1，实际playfield1086×797。源代码指纹：

`b60234ed123b09a832b581c7aa43f7fa42f482ad6789f566b8eeddd3e566d147`

## 测量口径

每项150个样本，切档预热后读Three真实GPU提交triangles/draw calls与各Layer批次统计。每个场景三种模式使用同一真实世界和相机。rAF是包含产品循环和测试额外提交的帧间隔；Layer update、render submit均为CPU计时。**GPU time unavailable**：未发出GPU timer query，不能把CPU提交或rAF写成GPU耗时/FPS承诺。固定矩阵按baseline→pilot-no-lod→pilot-lod顺序采样，短采样受浏览器调度、刷新率与缓存影响，不选择更有利的重复结果。

## 完整对照矩阵

| 场景 | 模式 | triangles | draws | 实际树/角色/建筑槽 | rAF median / p95 ms | CPU update median / p95 ms | CPU submit median / p95 ms |
|---|---|---:|---:|---:|---:|---:|---:|
| GOLDEN_A:WORLD_OVERVIEW | baseline | 124584 | 12 | 6742 / 133 / 188 | 16.60 / 16.90 | 0.60 / 1.20 | 0.20 / 0.30 |
| GOLDEN_A:WORLD_OVERVIEW | pilot-no-lod | 386420 | 12 | 3371 / 133 / 188 | 16.70 / 27.90 | 0.60 / 1.10 | 0.20 / 0.30 |
| GOLDEN_A:WORLD_OVERVIEW | pilot-lod | 179874 | 12 | 3371 / 119 / 94 | 16.70 / 22.40 | 0.50 / 1.00 | 0.10 / 0.20 |
| DENSITY_A:WORLD_OVERVIEW | baseline | 241758 | 12 | 11614 / 163 / 280 | 16.70 / 22.40 | 0.70 / 1.30 | 0.20 / 0.30 |
| DENSITY_A:WORLD_OVERVIEW | pilot-no-lod | 691490 | 12 | 5807 / 163 / 280 | 21.90 / 33.30 | 0.70 / 1.30 | 0.10 / 0.30 |
| DENSITY_A:WORLD_OVERVIEW | pilot-lod | 282411 | 12 | 5807 / 146 / 140 | 16.70 / 22.30 | 0.60 / 1.00 | 0.20 / 0.30 |
| DENSITY_A:forest-stress | baseline | 241758 | 12 | 11614 / 163 / 280 | 16.70 / 27.80 | 0.80 / 1.50 | 0.20 / 0.30 |
| DENSITY_A:forest-stress | pilot-no-lod | 691490 | 12 | 5807 / 163 / 280 | 16.80 / 22.40 | 0.60 / 1.00 | 0.10 / 0.20 |
| DENSITY_A:forest-stress | pilot-lod | 414037 | 13 | 5807 / 146 / 154 | 16.80 / 27.90 | 0.70 / 1.20 | 0.20 / 0.30 |
| DENSITY_A:upper-window | baseline | 213084 | 15 | 9268 / 136 / 244 | 16.70 / 27.80 | 1.20 / 2.50 | 0.20 / 0.30 |
| DENSITY_A:upper-window | pilot-no-lod | 572588 | 15 | 4634 / 136 / 244 | 16.70 / 27.80 | 1.00 / 1.40 | 0.20 / 0.30 |
| DENSITY_A:upper-window | pilot-lod | 244448 | 14 | 4634 / 120 / 122 | 16.70 / 22.30 | 0.90 / 1.40 | 0.20 / 0.30 |
| DENSITY_A:nether-window | baseline | 211348 | 13 | 9268 / 128 / 244 | 16.70 / 22.30 | 1.00 / 1.60 | 0.20 / 0.30 |
| DENSITY_A:nether-window | pilot-no-lod | 570852 | 13 | 4634 / 128 / 244 | 16.70 / 22.40 | 0.90 / 1.60 | 0.10 / 0.30 |
| DENSITY_A:nether-window | pilot-lod | 244368 | 13 | 4634 / 116 / 122 | 12.00 / 16.90 | 0.80 / 1.30 | 0.20 / 0.30 |

## 实际类别成本

以下下降率均以Pilot no-LOD为分母，而非廉价旧baseline。GLB角色按真实模块提交求和。

| 总览 | 类别 | no-LOD triangles | LOD triangles | 下降 |
|---|---|---:|---:|---:|
| GOLDEN_A | trees | 269680 | 76166 | 71.76% |
| GOLDEN_A | characters | 7360 | 964 | 86.90% |
| GOLDEN_A | buildings | 7520 | 884 | 88.24% |
| DENSITY_A | trees | 464560 | 73231 | 84.24% |
| DENSITY_A | characters | 8958 | 1120 | 87.50% |
| DENSITY_A | buildings | 11200 | 1288 | 88.50% |

GOLDEN_A总面数 386420→179874，减少53.45%；draws 12→12。 DENSITY_A总面数 691490→282411，减少59.16%；draws 12→12。 GOLDEN_A通过至少35%的方向性门槛。Forest Stress 的 rAF p95 为22.4→27.9ms，虽几何下降40.1%，这次短采样没有显示帧间隔收益。该差异不能直接归因于GPU耗时，也不能仅归为噪声；后续试产需要更长采样和多设备复验。 总览仍高于原baseline，LOD降低的是新增Pilot几何成本，没有宣称回到旧card成本。

树优先实验在Character/Building施工前通过：Golden Tree269680→76166、总386420→192906；Dense Tree464560→73231、总691490→300161。原始实验摘要见 [tree-gate.json](./reports/release/render3d-m2c2a/tree-gate.json)，真实性基线见 [M2C2A_BASELINE](./M2C2A_BASELINE.md)。

## 实例、LOD和预算

| Pilot LOD场景/位面 | 类别 | L0 / L1 / L2逻辑数 | 批次实例数 | 细节降级数 | overflow / capacity overflow | 逻辑容量 | HLOD |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| GOLDEN_A:WORLD_OVERVIEW / mortal | trees | 0 / 2894 / 477 | 3371 | 0 | 0 / 0 | 10000 | 0 |
| GOLDEN_A:WORLD_OVERVIEW / mortal | characters | 0 / 33 / 86 | 119 | 0 | 0 / 0 | 3256 | 0 |
| GOLDEN_A:WORLD_OVERVIEW / mortal | buildings | 0 / 11 / 83 | 94 | 0 | 0 / 0 | 4608 | 0 |
| DENSITY_A:WORLD_OVERVIEW / mortal | trees | 0 / 1575 / 4232 | 5807 | 0 | 0 / 0 | 10000 | 0 |
| DENSITY_A:WORLD_OVERVIEW / mortal | characters | 0 / 33 / 113 | 146 | 0 | 0 / 0 | 3256 | 0 |
| DENSITY_A:WORLD_OVERVIEW / mortal | buildings | 0 / 14 / 126 | 140 | 0 | 0 / 0 | 4608 | 0 |
| DENSITY_A:forest-stress / mortal | trees | 1024 / 4783 / 0 | 5807 | 3185 | 0 / 0 | 10000 | 0 |
| DENSITY_A:forest-stress / mortal | characters | 33 / 113 / 0 | 146 | 0 | 0 / 0 | 3256 | 0 |
| DENSITY_A:forest-stress / mortal | buildings | 14 / 126 / 0 | 154 | 0 | 0 / 0 | 4608 | 0 |
| DENSITY_A:upper-window / mortal | trees | 0 / 1260 / 3374 | 4634 | 0 | 0 / 0 | 10000 | 0 |
| DENSITY_A:upper-window / mortal | characters | 0 / 26 / 90 | 116 | 0 | 0 / 0 | 3256 | 0 |
| DENSITY_A:upper-window / mortal | buildings | 0 / 12 / 110 | 122 | 0 | 0 / 0 | 4608 | 0 |
| DENSITY_A:upper-window / upper | trees | 0 / 0 / 0 | 0 | 0 | 0 / 0 | 0 | 0 |
| DENSITY_A:upper-window / upper | characters | 0 / 0 / 4 | 4 | 0 | 0 / 0 | 3256 | 0 |
| DENSITY_A:upper-window / upper | buildings | 0 / 0 / 0 | 0 | 0 | 0 / 0 | 0 | 0 |
| DENSITY_A:nether-window / mortal | trees | 0 / 1260 / 3374 | 4634 | 0 | 0 / 0 | 10000 | 0 |
| DENSITY_A:nether-window / mortal | characters | 0 / 26 / 90 | 116 | 0 | 0 / 0 | 3256 | 0 |
| DENSITY_A:nether-window / mortal | buildings | 0 / 12 / 110 | 122 | 0 | 0 / 0 | 4608 | 0 |
| DENSITY_A:nether-window / nether | trees | 0 / 0 / 0 | 0 | 0 | 0 / 0 | 0 | 0 |
| DENSITY_A:nether-window / nether | characters | 0 / 0 / 0 | 0 | 0 | 0 / 0 | 3256 | 0 |
| DENSITY_A:nether-window / nether | buildings | 0 / 0 / 0 | 0 | 0 | 0 / 0 | 0 | 0 |

树/角色单体的逻辑身份数与批次槽数接近；L0 GLB按模块重复提交身份，Layer角色instances统计一人一次，categoryInstances由实际InstancedMesh count求和。建筑的stats.buildings是逻辑房屋数，stats.instances是实际body/roof或合并块提交数。HLOD不删除真实屋舍；计数必须区分逻辑事实与提交槽。容量溢出显式报告；本次真实固定场景没有触及无限扩展承诺。

## 三界与纯度

上界/幽冥窗均真实提交mortal outside + target inside，各层共享本Stage RegionGeometry，所有提交身份/树/建筑/HLOD成员的Region泄漏计数为0。目标界要求实际地形和实体层；其不存在的凡间植被/聚落记为absent零，未伪造第三方内容。窗口draws约束40，三角面不超过Dense mortal no-LOD的2倍，均通过。CLI还将真实村落在窗口内外分割，证明拒绝该村HLOD并恢复单屋。

每一对LOD/profile开关完整World + advanceState SHA一致。600真实模拟日六模式最终SHA全部相同：

`935cfa00a5e67da9bea5b53a7d88efe0521d9d33739721c79547f8878072d486`

每模式RNG调用182879次，Renderer每次更新前后RNG计数不变。六模式覆盖no-render、baseline、pilot-no-lod、pilot-lod、camera及realms；未新增存档字段，未修改sim/worldgen。

## 生命周期与耐久

600帧覆盖缩放、旋转、resize、LOD/profile开关和三界窗口；尺寸恢复、完整World不变、GL error0。6000帧按20个300帧块持续交替上界/幽冥，全部同状态GPU资源与完整指纹断言通过。正式参考在全部profile×LOD×三界×zoom18/4/.5预热后逐状态建立，避免把首次编译或开窗资源误算泄漏。

| 预热状态 | geometry | texture | program |
|---|---:|---:|---:|
| baseline/no-lod/mortal | 36 | 8 | 14 |
| baseline/no-lod/upper | 36 | 8 | 14 |
| baseline/no-lod/nether | 36 | 8 | 14 |
| baseline/lod/mortal | 36 | 8 | 14 |
| baseline/lod/upper | 36 | 8 | 14 |
| baseline/lod/nether | 36 | 8 | 14 |
| pilot/no-lod/mortal | 36 | 8 | 14 |
| pilot/no-lod/upper | 36 | 8 | 14 |
| pilot/no-lod/nether | 36 | 8 | 14 |
| pilot/lod/mortal | 36 | 8 | 14 |
| pilot/lod/upper | 36 | 8 | 14 |
| pilot/lod/nether | 36 | 8 | 14 |

CDP强制GC后JS heap 10953860→11262264字节；DOM nodes变化0，listeners变化0，均在报告容差内。容差为最终heap≤首块1.25倍+8MiB；DOM≤首块+10%+200；listeners≤首块+10%+100。 这些是有界耐久证据，不等于无限帧、无限世界或所有硬件没有泄漏。

## 门禁与下一步

C2A核心8组、旧CLI 14/14通过；最终矩阵15/15、600+6000帧通过，console/runtime/GL error0。本机CI Browser Smoke五套Canvas/M2-A/M2-B/M2-C/M2-C2A均退出0。 GitHub Actions未在本轮推送/触发，不能将本地结果称为远端runner成功。构建命令npm run build退出0，已生成自包含目录及dist/zuotian-guan-jing-inkbox-1.0.0.zip；结果/日志在reports/m2c2a/gates/build.log。

**允许进入M2-C2B一套资产家族的受控试产；暂不批准一次性大量扩产。** 运行时三档批次、迟滞、预算、拾取和模拟边界已建立；大规模生产还需要新家族L0/L1/L2实际模块面数、近中远视觉签收、多设备预算及接近容量上限场景。当前HLOD仅凡间小村原型，坡地聚落使用一个中心高程/屋脊包围质量近似；完整城市、动画与跨界聚落不在本次范围。没有“全面完成LOD/HLOD”或“性能彻底解决”的结论。

代表摘要和截图在 [release](./reports/release/render3d-m2c2a/acceptance-summary.json)；完整矩阵、失败尝试和耐久块留在reports/m2c2a/本地，CI运行留artifact，不全量入Git。
