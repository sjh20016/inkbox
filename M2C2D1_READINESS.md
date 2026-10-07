# M2-C2D.1 就绪与验收边界

2026-10-07，分支 `codex/m2-c2d1-painterly-reconciliation`。

本轮按委托顺序实现 A～I；Step2 已获用户确认，最终美术仍为 `human-review-required`。首轮 GPU 预算失败，已实施共享顶点 continuous broad 优化，完整交错复测与终验正在收口。未把 Safety PASS 当作人工美术通过。

## 范围

只调整 Render3D ArtPass、terrain / water / boundary shader、RealmStyle 和开发诊断。World、RNG、保存、推进、真实 height、VisualElevation、RegionGeometry、Picking identity、C2C 语义、资产结构与水拓扑冻结。无新增运行依赖或全屏后处理。

开发环境可使用 `?artDebug=base|coast|mass|structure|atmosphere|final`，及 `?artStyle=main-style|c2d-style|c2d1-style`。A/B 是同 World / camera 的精确历史材质与 profile 对照；发布域名锁定 final candidate。诊断视图不是玩家设置。

## 终验清单

| 命令 | 状态 |
| --- | --- |
| `npm test` | 本轮通过 |
| `npm run test:render3d:m2b` | 本轮通过 |
| `npm run test:render3d:m2c` | 本轮通过 |
| `npm run test:render3d:m2c2a` | 本轮通过 |
| `npm run test:render3d:m2c2c` | 本轮通过 |
| `npm run test:render3d:m2c2c:purity` | 本轮通过 |
| `npm run test:vendor` | 本轮通过 |
| `npm run build` | 最终包待复验 |
| `npm run test:render3d:m2c2d` | 本轮通过 |
| `npm run test:render3d:m2c2d:browser` | 最终源码待复验 |
| `npm run test:render3d:m2c2d1` | 本轮 6/6 通过 |
| `npm run test:render3d:m2c2d1:browser` | 最终 12 镜及真实 GPU contract 待复验 |
| `npm run test:render3d:m2c2d1:diagnostics` | Safety 已通过；最终 GPU 预算待复测 |
| `npm run test:render3d:m2c2c:soak` | 复用原套件，最终源码待复验 |

详细 CPU 日志在 `reports/local/m2c2d1/final-checks/`。GPU 工作串行执行，计时不与 soak、其它浏览器或重 CPU 门禁并发。

## 交付与下一阶段

只提交本轮源码、脚本、五份报告、八张正常 Golden 和 compact summary；全量分层、消融、中景与失败复测保留本地。工作树已有的 QoL、资产索引、历史资料搬移等用户修改不纳入本轮提交，也不回退。

下一阶段先审八镜与中景，再按[后续事项](./M2C2D1_FOLLOWUPS.md)决定地形几何、岸线几何和实体笔触的独立范围。没有通过本轮授权扩展上界文明、幽冥城市或世界拓扑。

阅读入口：[开工基线](./M2C2D1_BASELINE.md)、[视觉与十二项答复](./M2C2D1_VISUAL_ACCEPTANCE.md)、[性能](./M2C2D1_PERFORMANCE_REPORT.md)。
