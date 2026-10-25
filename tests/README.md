# Inkbox 测试入口与脚本分层

`npm run test:w01` 检查真实物种、聚合捕食/袭村与安抚、地灵迁衰、浅滩地形/枯痕到期、十二道途目标与实际代价、实例身份/只读性、旧档兼容及正式推进存读档。加入 Fast，既有 Fast/Heavy 完整保留。`npm run test:w01:browser` 为手动真实 Edge 验收：先启动服务（默认4233，`INKBOX_URL` 可改），导入明确标注的受控正式存档，再通过原生控件投放、检视、存读档和施放地形神力；需要本机浏览器及其自有进程清理权限。夹具不增加修士投放按钮。结果、非空场景性能对照和未验证边界见 [W0.1 记录](../docs/development/W01_WANLING_DELIVERY.md)。

`npm run test:g7` 检查正式 Canvas 拖动的确认/取消、长按力度与水体手势聚合，以及异步保存不清除新编辑、读档固定槽位/保留等待期间的新操作、拒绝神力不消耗玩家工具随机流。它执行正式监听器和 QoL 控制器，加入 Fast；真实菜单、身份、宗门援助与双 renderer 连贯试玩另留浏览器证据。

`npm run test:p0` 复用 P0 的输入/三界、有限水体/洪水归属、真实神力结果与有界三维表现 CPU 检查，加入 Fast。它不替代实际 GPU 试玩或性能对照；已有 P0 场景和硬件边界见 [P0 交付](../docs/development/P0_THREE_PLAYER_EXPERIENCE_DELIVERY.md)。

`npm run test:c1` 集中检查绝对18岁成年、凡人出生与真实双亲、转世身份与0级寿元、真实修炼延寿/折寿、守恒供养与断供恢复收徒，以及均质地形领地洪泛终止性。已加入 Fast。

C1 有限画像为 `npm run profile:c1 -- --run --out=reports/local/c1/profile-final`（三个正常种子各300年及和平队列），另用 `--supply-only --out=reports/local/c1/profile-final` 生成15年断供/洪水/抽水对照及两个真实存档。启动服务器后用 `INKBOX_URL` 指定地址运行 `npm run test:c1:browser`，默认4207；浏览器需要这两个对照存档。`npm run profile:c1:cpu -- --baseline=<E0源码目录>` 是512×320有限CPU对照，需要基线的 `src/` 和 `package.json`，不测GPU。以上手动项不进入 Fast/Heavy；结论及边界见 [C1交付记录](../docs/development/C1_MORTAL_FOUNDATION_DELIVERY.md)。

`npm run test:e0` 定向验证一座聚落的记挂、真实抽水笔录、同名旧址身份、地方史保留边界、撤销和世界存档，以及 Three 一次手势的正式抽水事务。已加入 Fast；Canvas/Three 实际拾取、书架回访、窄屏与浏览器保存仍需单独操作验收。

长局只读画像手动执行 `node scripts/inkbox-e0-profile.mjs --run`，默认三个正常种子各 300 年与一个明确标注的 100 年视界压力样本，输出在 `reports/local/e0/profile/`；不加入 Fast/Heavy。原始 JSON UTF8 字节、JavaScript 码元与浏览器实际压缩槽位分别取证。

`npm run test:s0` 检查静态水域、Canvas/Three 撤销、重叠洪水、环境绝对到期日、大步结算、存档事件还原、云雾批次和远景植被；已加入 Fast。旧生态门禁保留原有战斗、分类、缓存和存档检查，将自然随机生长/蔓延断言迁移为有限事件语义。`test:s0:interactions` 是隔离 Edge 实际交互检查；`test:s0:browser` 是指定种子、GPU、两档幅面的短样本，需先启动服务器（默认 4198，也可设 `INKBOX_URL`）。这两项均为手动入口，不替代完整 Browser Smoke 或耐久测试。结果与限制见 [S0 交付说明](../docs/development/S0_P0_DELIVERY.md)。

`npm run test:r1` 检查线刻缓冲复用/扩容/释放、实际三角面高程一致性、分帧提取与原始结果一致、取消和区域等待帧，以及自然雕刻的正式事务、权限和撤销/重做；已加入 Fast。它是 CPU 契约检查，不能替代真实 GPU 着色器读回、五档尺寸操作、资源循环和同机性能对照；本轮实测与限制见 [R1 记录](../docs/development/R1_ART_UI_INTEGRATION.md)。

`npm run test:g5` 检查 GPU/CPU 高程与拾取版本、回退与历史 shader 切换、同帧全量/局部上传顺序、精确水面湿域与外缘、植被资格及局部贴地；山海林覆盖真实单格编辑的峭壁隐藏/恢复、邻树探针范围及局部矩阵与全量结果等价。已加入 Fast；性能对照沿用 G5 固定种子水文逐步账本，真实 GPU/正常推进仍须单独验收，不解除 PERF BLOCKED。`test:g5` 末尾含 `npm run test:longframe`（地形规则格网求交与暴力法逐项一致、广卷至少快 10 倍）。

> RG-P3 · 2026-10-17 现行指南。历史阶段细节从 [原测试说明](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/tests/README.md) 查阅。此处只保留当前开发真正要用的入口。

## G2.5 定向入口

`npm run test:g26` 检查 3D 连续输入与拾取复用、聚落受淹生命周期及旧档、玩家凡人安全落点、共享平涂/比例、正式突破/命中表现和可靠幽冥魂追踪；加入 Fast，保留既有门禁。视觉与短性能样本使用本机 Edge 串行对照，原始长局资料与截图仅留本地忽略目录；短样本不解除 PERF BLOCKED。

`npm run test:g25` 检查正式洗髓与修炼增益、主题机缘/洞府传承的真实发放及存档、正式突破成功失败到双 renderer 异象的数据通道；加入 Fast，保留既有 Fast/Heavy。界面仍需真实 Canvas/Three 试玩；瞬时异象不进存档，不改变模拟随机。G2-R1、A1、G2.4-C 已于 2026-10-18 合并 main，以下候选新增说明属于原阶段来源。

## G2-R1 候选新增入口

G2.4 使用一个聚焦入口 `npm run test:g24`，覆盖真实攻击到点燃的资格、地表条件、冷却、生态延续、表现开关独立性和存档兼容；已加入 Fast。固定种子夹具只辅助选择可复现的真实施术，不能用表现事件代替 `Life.attack()`。浏览器继续用隔离 Edge/CDP，在 Canvas / Three 串行检查实际火势、焦土、观察定位与存读档；不把功能验收当作性能封板。

本地恢复功能可运行 `npm run test:g2`、`test:g21:terrain`、`test:g22`、`test:g23`、`test:g2p0` 与 `test:p1`（后五项同样使用 `npm run`）。它们覆盖真实战斗、双 renderer 快照、气血 / 养伤、灾迹 / 恢复、生态 / 缓存等价及导航，已加入 Fast；原 Fast / Heavy 全部保留。

`npm run test:browser-tools` 检查隔离 CDP 端点和 IPC 自有服务器。G2 浏览器入口为 `test:g2:browser`、`test:g22:browser`、`test:g23:browser`；`INKBOX_GPU=0` 只作软件光栅功能验证。`npm run test:p1:browser` 依次运行五种分辨率的双 renderer 布局与真实创世→选人→受伤 / 养伤→灾迹恢复→记挂→存读档闭环，要求真实 GPU，本机按需串行执行，不把托管 Windows 软件渲染冒充硬件验收。脚本优先 Edge，可回退本机 Chrome，实际版本和 GPU 以报告 metadata 为准。

本轮不导入性能研究脚本、原始报告或放宽断言。新输出仍在忽略的 `reports/`；CI 新增 G2 功能门禁，不代表既有 G2 性能封板。详细范围见 [G2-R1](../docs/development/G2_R1_PLAYABLE_INTEGRATION.md)。

## RG-P4 · 低成本本地验证和 CI 同分支去重

`npm run check:ui` 是面向**小型人物卡 / 面板 / 文案 / CSS 改动**的轻量 CPU 检查，依次跑 G1 Web、QoL、视界与表现回归。它不测实际屏幕截图、Three 真 GPU，也不包含 Heavy；交互 / 窄屏变化仍需按任务做一次真实浏览器验收，正式集成等待完整 CI。不要用它替代 `npm test` 或声明全套测试通过。

CI 继续保留全部原有 Fast / Heavy 检查项。RG-P4 新增同分支并发分组：Push 和同仓 PR 的自动运行同组，较新的自动 run 取消旧 run；`workflow_dispatch` 使用唯一 run ID，手动 Browser Smoke 不被推送打断。取消的 run 不算通过，只有**当前提交对应且完成成功**的存活 run 才能作为验收证据；如果自动 run 竞争导致 PR 仍显示待验证或取消，须重新触发完整检查，不可直接合并。分组只消除重复执行，不根据文件名跳过 Heavy。

2026-10-17 [RG-P3 PR #21](https://github.com/sjh20016/inkbox/actions/runs/39007908817) 的实际样本：Fast 62 秒，Heavy 391 秒，其中三界 153 秒、存读档等价 130 秒、G1 长局 101 秒；旧 Nightly 样本 800 年 1400 秒、全量 smoke 505 秒。这些是特定 GitHub 托管机实测，不是每台机器固定预算；手动 GPU 不在普通 Fast/Heavy 中。

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
