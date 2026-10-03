# M2-C2A 真实性基线

2026-10-03，本地已快进到远端 `0ae4239`，并合并施工前已有的 Mini 修士 GLB 接线。原始修改保存在 `.local-backups/pre-m2c2a-20261003-175013/` 与保留的 Git stash；本轮不重写或删除这些资产。

已读取 README、HANDOFF、ROADMAP、ARCHITECTURE、M2-C 工程/性能/实体/ArtPass/视觉契约及实际 Host、Stage、Layer、Pilot、Picker、Region 和 Bridge 源码。本次数据来自新运行的 `scripts/inkbox-render3d-m2c2a-audit.mjs`，原始 JSON/四张截图在 `reports/m2c2a/baseline/`，没有复制旧硬件报告的数字。

环境：Windows / Edge 154 / AMD Radeon 610M / ANGLE D3D11，viewport 1500×940，实际 playfield 1086×797，DPR 1；GPU timer unavailable。提交时间是 CPU `renderer.render()` 时间，rAF 包含产品循环和额外测试提交，120 样本，不能解释为 GPU 时间。

| 世界 overview | 树 | 生灵 / 修士 | 村 / 真房屋 / 派生建筑 | Baseline triangles | Pilot no-LOD triangles | draws |
|---|---:|---:|---:|---:|---:|---:|
| GOLDEN_A，seed 20260930，day1440 | 3371 | 119 / 14 | 6 / 89 / 94 | 124584 | 386420 | 12 / 12 |
| DENSITY_A，seed 20260928，day1800 | 5807 | 146 / 17 | 7 / 133 / 140 | 241758 | 691490 | 12 / 12 |

| 世界 | Tree baseline / pilot | Character baseline / pilot | Building baseline / pilot | pilot rAF median / p95 ms |
|---|---:|---:|---:|---:|
| GOLDEN_A | 13484 / 269680 | 7360 / 7360 | 1880 / 7520 | 16.7 / 22.3 |
| DENSITY_A | 23228 / 464560 | 8958 / 8958 | 2800 / 11200 | 22.3 / 27.8 |

源码实测单体：Pilot Tree 80 tris；procedural cultivator 308 tris；building body72 + roof8 =80 tris。当前浏览器角色使用已存在的模块化 GLB，而不是 procedural cultivator，故角色分项必须按实际模块求和，不能用308乘人数。baseline tree是两张2-triangle card，每树4tris。树事实数不因材质开关改变。

普通观察仅 mortal Stage 可见、更新与提交；上界/幽冥窗使用 mortal outside + target inside，同一 Stage 的各层引用同一 `RegionGeometry`，隐界不更新。Picker遍历实际可见实体模块，`instanceId → mesh.userData.renderEntities → id/plane`；树/建筑目前不直接精确拾取。后续 HLOD 要明确 settlement拾取。

Art profile复用已创建的Pilot几何/材质，只首次按需创建。已有 Vegetation rebuild创建临时Object3D；实体派生与统计有短命CPU分配，但不逐实体创建Mesh；相机更新有Vector3分配。这些不等于每帧GPU资源创建。本轮LOD热路径不得新增几何/材质new/dispose。原有容量：树20000 card槽（实际派生上限10000棵）、实体每类3256、建筑每批4608；原有derive上限保持不变。

审计开关前后完整 world+advanceState SHA-256一致，GL error0，运行错误0。两个样本资源均15 geometry /4 texture /12 program。树占pilot总三角形约69.8%与67.2%，确认应优先解决树。原始audit在LOD实施前已经写盘；后续on/off矩阵仍需同世界同镜头再对照。
