# M2-C2D.1 就绪与验收边界

2026-10-08，分支 `codex/m2-c2d1-painterly-reconciliation`，从 WIP `daf78c0` 续作。本机工程、逐镜 GPU 预算与原套件生命周期检查完成，最终美术保持 `human-review-required`；Step2 岸线修复已获此前用户确认。

## 范围

A～I 已实现：六层开发诊断、真实湿干岸线、连续宽域 Mass、稀疏 Structure/Brush、凡间 tone 收束、可读纸色水体、界缘颜色/alpha 消隐、两界色彩收束，以及独立 Safety / Art Diagnostics。World、RNG、save、advance、真实 height、VisualElevation、RegionGeometry、Picking identity、C2C 语义、正式资产结构与水拓扑冻结；无新运行依赖、texture、attribute、RenderTarget、pass 或后处理。

开发环境支持 `artDebug=base|coast|mass|structure|atmosphere|final` 和精确历史 `artStyle=main-style|c2d-style|c2d1-style`。发布域名锁定 final candidate。调试切换复用同一材质，释放旧 program 引用；返回 final 的原始 RGBA 一致。

## 本机验收

| 命令 | 已通过的内容 |
| --- | --- |
| `npm test` | 核心检查 |
| `npm run test:render3d:m2b` | 旧完整视界/界缘 |
| `npm run test:render3d:m2c` | 10 invariant groups 与 pilots |
| `npm run test:render3d:m2c2a` | LOD/HLOD |
| `npm run test:render3d:m2c2c` | 只读语义接线 |
| `npm run test:render3d:m2c2c:purity` | 11 模式 × 600 日、11 RNG、完整状态/存档 |
| `npm run test:vendor` | 版本/许可证/字节 |
| `npm run test:render3d:m2c2d` | 13/13 |
| `npm run test:render3d:m2c2d1` | 6/6 |
| `npm run test:render3d:m2c2d:browser` | 原 C2D Edge 套件 |
| `npm run test:render3d:m2c2d1:paired` | 12 镜 × 4 轮，每镜零正向差值 |
| `node scripts/inkbox-render3d-m2c2d1-decomposition.mjs` | 六层往返、coast/height/water/boundary GPU 契约 |
| `npm run test:render3d:m2c2d1:comparison` | 历史对照、队列、World 重载与资源释放 |
| `npm run test:render3d:m2c2d1:diagnostics` | Safety 通过；人工美术待裁决 |
| `npm run test:render3d:m2c2c:soak` | 原套件 600 lifecycle + 6000 产品 RAF |
| `npm run build / npm run test:package` | 362 文件；构建与包审计通过 |

CPU 日志位于 `resume-20261007/final-checks-complete/`，完整 GPU 计时为 `paired-final-v2/`，main 对照为 `main/`，GPU contracts 为 `final-contracts/`，热切换为 `comparison/`，原套件 soak 为 `soak/`；均以 `reports/local/m2c2d1/` 为前缀。GPU 工作串行，不与其他 GPU/soak 或重 CPU 门禁并发。对应 SHA、逐镜数字和 Safety 见 [compact summary](./reports/release/render3d-m2c2d1/summary/acceptance-summary.json)。

## 交付与边界

Git 交付本轮源码、验证和 CI 接线、五份报告、八张正常 Golden 与 ≤256KiB summary。全量分层、E1/E2/E3 消融、四中景、三个水体补充和失败复测留本地；Golden 不进入运行包。旧机器未随 Git 传输的 ignored 阶段证据仅作为历史，不冒充本机新测。工作树原有用户素材与历史修改已保留，不纳入本轮提交。

用户已授权完成后上传：提交推送到上述 feature 分支，再核对该提交的 Fast/Heavy CI；没有合并 main。最终人工美术不以 Safety 或 GPU 通过替代。真实山体轮廓、岸线几何、固定 04 遮村和复杂透明重叠继续见[后续事项](./M2C2D1_FOLLOWUPS.md)，不扩展上界文明、幽冥城市或世界拓扑。

入口：[开工基线](./M2C2D1_BASELINE.md)、[视觉与十二项答复](./M2C2D1_VISUAL_ACCEPTANCE.md)、[性能](./M2C2D1_PERFORMANCE_REPORT.md)。

发布包显式清单审计通过：362 文件、71 个本地脚本入口、89 份 Markdown 的本地链接、两件 GLB 结构及 atlas 引用有效。八张 Golden、分层截图、完整 JSON、日志和 Blender 源不进入运行包；compact summary 为合法 JSON 且小于 256KiB。ZIP 约 2.83MiB；本地构建和包审计日志保留在 `resume-20261007/build-final.log` 与 `package-audit-final.log`。
