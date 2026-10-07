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

`?artDebug=base|coast|mass|structure|atmosphere|final` 仅在 localhost / loopback / file 开发环境生效，发布域名锁定 final。切换只更新 uniform，不重建 World、材质或纹理。默认 final 不调色。

新增 framebuffer diagnostics：2×2 线性明度下采样，3×3 局部对比与高频残差、Sobel 边缘密度、低频能量。它们描述碎面与层级，不作为美术评分。Safety Gate 只检测灾难；艺术接受状态始终保留人工判断。

Step2 已按“只修 coast → 输出 01～04 → 人工确认后再继续”执行。用户确认保留岸线修复并按委托顺序继续。确认之前未改变 mass、Water 或 Boundary 的正式视觉策略。
