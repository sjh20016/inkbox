# M2-C2D.1 开工基线

2026-10-07。开工 HEAD `ef8b43df91c8dff6f01e241301d3d40a4e724d84`，来自 `m2-c2d-nearfield-painterly`；施工分支 `codex/m2-c2d1-painterly-reconciliation`。历史 main 对照为 `8b3f2bac761b59bf70f524ff9a00429fa40cc07a`。

已阅读 C2D 的 BASELINE / VISUAL_ACCEPTANCE / PERFORMANCE_REPORT / READINESS。C2D 现有 PASS 只作为工程证据；其人工美术门禁未通过，本轮不沿用“已经好看”的结论。

## 事实与冻结范围

- 保留 Stage-owned SurfaceVisualField、水面独立材质、界缘独立材质、dirty / Region / World purity。
- 冻结 World、RNG、存档、世界推进、真实 height、VisualElevation、RegionGeometry、Picking identity、C2C 世界语义与正式资产结构。
- 当前 coastSoft 在 `wd=0` 时等于 1，会污染普通干燥内陆，并压低内陆类别边界墨。
- 当前 broad normal 仍使用 `hAt → floor → NearestFilter`，是较远格点差分；massMask 同时混入 fine slope，不能称为真正低频明暗。
- 当前凡间 contrast / massShade / deepInk 及两界 Boundary 视觉结果需要重新审视，尚未在 Step1 改动。

## 新鲜采集

生产 shader 未改动前，在同机 Windows / Edge / ANGLE、1500×940、DPR 1 采集 8 正式镜头与 4 中景。规范自然存档经产品 `#inkImportFile` 导入，相机仍经产品 `VisualScenarios.applyCamera` 设置。新增中景复用对应近景或 overview 的 POI / yaw / polar，仅调整 zoom。

原始证据：`reports/local/m2c2d1/E0-c2d/browser.json` 与 12 PNG。`captureComplete=true`、GL error 0、runtime / console error 0，全部镜头取得真实 GPU timer。Node/V8 版本变化触发规范缓存重新生成；没有拿旧缓存绕过校验。之后所有配对必须使用同一份新鲜存档与相机，历史指标仅作背景。

Step1 加入六种开发分层视图后，`step1-final` 再采 12 镜：每镜 World SHA、camera、全套 framebuffer 指标、draw、triangles 与 E0 逐字一致。单 Edge 同步分层探针进一步验证六模式 World / advance / camera / draw / geometry / textures / programs 恒定，返回 final 的原始 RGBA SHA 完全一致。证据见 `reports/local/m2c2d1/decomposition/decomposition.json`。

## 分层与判断纪律

`?artDebug=base|coast|mass|structure|atmosphere|final` 仅在 localhost / loopback / file 开发环境生效，发布域名锁定 final。保留同一 World、材质对象和纹理；final 与诊断之间翻转编译期 define，并释放旧 GPU program 引用，五种诊断之间只更新 uniform。返回 final 后逐字节恢复正常输出；默认 final 的调试分支由编译器关闭。

新增 framebuffer diagnostics：2×2 线性明度下采样，3×3 局部对比与高频残差、Sobel 边缘密度、低频能量。它们描述碎面与层级，不作为美术评分。Safety Gate 只检测灾难；艺术接受状态始终保留人工判断。

Step2 已按“只修 coast → 输出 01～04 → 人工确认后再继续”执行。用户确认保留岸线修复并按委托顺序继续。确认之前未改变 mass、Water 或 Boundary 的正式视觉策略。

## 本地续作来源（2026-10-07）

按用户指定从 GitHub 更新 `codex/m2-c2d1-painterly-reconciliation`，续作入口为 `daf78c0b28019c70f13a191bc8338936ce5d2f82`，本地工作区 `D:/worldxxxxx/坐天观井inkbox`。该提交为 WIP 快照，不能作为终验通过证据。原工作区的 ignored 分层、消融和阶段截图没有随 Git 传输；上面的阶段目录是历史来源记录，不声称它们在当前机器仍然存在。

当前机器用 Node 24.11.1 / V8 13.6.233.10-node.28 重新生成规范自然存档。凡间 seed 226 / day 72000 的 save SHA256 为 `4464947c57319fa92a2b8524a186576336c3abbaf8d909be445aaf4ab4b71521`；三界 seed 20260923 / day 21600 为 `32354a0100b97c64d253f686a2220c1dca0f97b253a60613eda2d2ab483f4ccc`。源 World 摘要与产品导入后的量化 World 摘要分开记录；各 style 比较同一份产品存档和相机。

续作证据集中在 `reports/local/m2c2d1/resume-20261007/`。`paired`、`paired-zero-weight`、`paired-packed`、`paired-axis`、`paired-debug` 是五次完整十二镜失败计时，四轮全部保留；`gradient-probe` 与 `compile-probe` 是未达标的三镜局部诊断，不具备正式验收资格。没有用新结果覆盖失败。

岸线的旧五读语义通过 60 个 GPU 采样点（含小数、边界和域外钳制）验证，在原 RGBA8 水深纹理的 G/B/A 通道复用邻域，R 深度契约保持不变。高度纹理仍为 Nearest：R 为真实高度，G 为最终 Stage 高程，原空闲 B/A 存储半径 2.5 的未归一化宽域梯度。精准 dirty 高程先更新，再在 ±3 格 halo 只重算 B/A；不改外围 R/G，不新增纹理或 World 缓存。默认每顶点一读，未提供 B/A 或调整半径时仍走连续轴向采样。真实生产网格的 GPU oracle 另验三角插值、小数、边界、半径变化与错误实现负对照。

2026-10-08 的有界着色降本把 Mass 的响应改为宽域梯度平方阈值，中等坡度更柔和；复用既有低频 warp 放置稀疏墨迹，墨迹与类别扰动轻微相关；结构方向复用已经求出的 fine slope。它们是有意的视觉取舍，不宣称与旧候选逐像素等价。`alu-probe` 三镜四轮诊断达标后，执行 `paired-final` 完整十二镜终验；最终来源 SHA、正常八张 Golden、四中景、Safety 和逐镜 GPU 结果由 release summary 封存。最终候选没有新增 World 字段、纹理、几何属性、pass、RenderTarget 或运行依赖。

原本地修改在更新前已备份到 `.local-backups/c2d1-before-update-20261007/`；仅冲突的两份旧 M2B 报告另存 Git stash。用户素材和其它改动未纳入续作提交。

最终 `paired-final-v2` 与 main 的十二镜 Safety、资源和零容差 GPU 门槛全部通过。第一次完整候选已通过性能，但汇总时发现配对报告把隐藏界缘缓存当作可见界缘；原始报告与失败诊断保留，报告修正后完整重测。历史 A/B 的初次失败来自暂停后仍会播放的短命 FX 透明度变化；脚本等待产品 RAF 自然播完后，完整几何断言与三界逐字节往返通过。对应记录均列入 compact summary，没有修改生产模拟或降低断言。
