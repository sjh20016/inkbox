# Inkbox 测试入口与脚本分层

> RG-P3 · 2026-10-17 现行指南。历史阶段细节从 [原测试说明](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/tests/README.md) 查阅。此处只保留当前开发真正要用的入口。

## 基本原则

**本地按修改范围选择最小充分验证，远端现有 CI 完整保留。** `npm test` 只运行核心，不代表所有门禁通过。建议 Node 24 / `npm ci` 对齐 CI。任何改动都不可借此弱化现有断言、跳过必须的发布门禁或掩盖失败。

## 选哪一层

| 变化范围 | 本地应该运行什么 | 何时补充 |
| --- | --- | --- |
| 纯文档 / 文案 / CSS | 受影响内容的静态和交互检查 | 改包清单或文档链接：`npm run build`、`npm run test:package`（先 build） |
| 导入、启动、一般核心 | `npm test` / `npm run test:core` | 入口或页面变化补实际浏览器 |
| G1 人物命簿与交互、视界、表现和 UX | 选择 `test:g1`、`test:view`、`test:presentation`、`test:qol` | 真实交互变化补 `test:g1:browser` 或 `test:browser` |
| 模拟、干预、存读档、RNG、三界 | `test:regression`、`test:save-equivalence`、`test:three-realms` | G1 长时行为补 `test:g1:longrun` |
| 3D / 资产 / WorldRenderBridge | 对应的 `test:render3d`、`test:render3d:bridge`、`test:render3d:m2*`、`test:vendor` | 产品表现或性能实际变化再补相应浏览器、Soak |
| GPU 画质、帧时、生命周期 | 同机同条件的 `*:browser`、`*:soak`、`*:perf`、C2D.1 `*:paired` | GPU 串行，保留完整硬件/采样证据；CPU 和软件光栅不能冒充 GPU 门禁 |
| 长时段生态 | `inkbox:longrun`（800 年）、`test:simulation` | `nightly.yml` 定时/手动；不在普通 CI |

表中的 `test:xxx` 是 `npm run test:xxx` 简写，真正可用命令以 `package.json` 为准。特别注意 `npm test` 不会自动运行 `test:regression`、`test:three-realms` 或 `test:save-equivalence`。

## CI 与手动验收的区别

- [ci.yml](../.github/workflows/ci.yml) 每次 Push / PR 都跑 **Fast Gate + Heavy Gate**，两者都要通过。Fast 包含 `npm run build`，它会执行包审计；Heavy 保留模拟、存档与 G1 长局。
- CI 内的 Windows **Browser Smoke** 仅 `workflow_dispatch` 手动触发；先跑 G1 浏览器，再由 `scripts/inkbox-browser-smoke.mjs` 串行管理 Canvas、M2-A/B/C/C2A/C2B0，附带 C2B0 和 C2B Pass1 的浏览器/耐久检查。
- [c2c-browser.yml](../.github/workflows/c2c-browser.yml) 手动复验真实 GLB、拾取、C2C 23 对镜头及 600/6000 帧；不是普通 Push 硬门槛。
- [nightly.yml](../.github/workflows/nightly.yml) 定时/手动跑 `inkbox:longrun` 和 `test:simulation`。Fast/Heavy 全绿不等于浏览器、GPU、Nightly 已通过。

## scripts/ 文件治理裁决

RG-P3 从 107 个现存脚本、`package.json`、三套 workflow、打包清单及脚本之间的 import/spawn 引用进行核对。

**保留的 85 个 npm 直接脚本目标**：包含自动核心、Heavy、手动 Browser/Soak/性能、打包和开发工具。它们都有显式入口，但并非全部每次 CI 自动执行。

**保留的 14 个间接辅助文件**：CDP 驱动、浏览器组织器、视觉稳定探针、C2C/G1 夹具、环境 GLB 读取、PNG/帧时与 framebuffer 统计，以及三界各 plane/cross/style 实际证明器等。特别是 `inkbox-realm-*-proof.mjs` 被 `inkbox-render3d-m2c2b0-browser.mjs` 调用；`inkbox-render3d-m2c2c-rift-wounds.mjs` 被 Rift 套件调用；`inkbox-render3d-m2c2d1-framebuffer.mjs` 被 C2D.1 引用。没有 npm 直连不代表可以删。

**保留的 4 个手动诊断/研究脚本**：`inkbox-render3d-m2c-soak.mjs`、`inkbox-render3d-m2c2a-audit.mjs`、`inkbox-render3d-m2c2a1-hlod-browser.mjs`、`inkbox-m2c-image-metrics.py`。它们可复验阶段真实问题，手动按需运行；图像指标并非美术通过。

**保留的 3 个非测试开发脚本**：`build-cultivator-assets.py`、`character-blender-runtime.mjs`、`inkbox-launch.mjs`。它们属于资产或启动工具，不应被“历史测试”清理顺手删除。

**退役 1 个已脱离现行执行链的脚本**：`scripts/inkbox-render3d-browser.mjs`，早期 Playwright M0 QA，需要额外安装未锁定的 Playwright；不在 npm、CI 或其他 scripts 的调用链中。M0 CPU 契约及正式 CDP/Edge 浏览器入口仍保留。要恢复旧实现可从 [RG-P3 前的 Git 提交](https://github.com/sjh20016/inkbox/blob/be0941948dafa896fc279a322a53f402e1f60bd4/scripts/inkbox-render3d-browser.mjs) 查看。这不是删掉任一现行的 GPU 门禁。

## 操作边界

- 小型 UI 修复不必在**本地**重复跑 GPU ABBA、6000 帧与 800 年长测；但不要擅自修改远端既有 CI。正式发布 / 集成按原流程全绿验收。
- CDP 浏览器探针通常需 Node 22+、Edge/Chrome、隔离端口和 `INKBOX_REPORT_DIR=reports/local/<task>`。脚本自行起服务器时不要重复启动相同端口；GPU 不并行采样。
- `reports/` 作为忽略目录保存可再生成证据，Git 历史与 Actions artifacts 可考古；不要覆盖历史基准或用旧成功代替当前源码实测。
- 后续任何删除必须先核对 npm、workflows、其他 scripts 的 import/spawn、打包、文档和长期测试意义。若仍有独立价值但当前不常跑，优先标为“手动”，不是直接删除。
