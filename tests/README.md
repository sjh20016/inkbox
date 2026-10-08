# Inkbox 测试与验证入口

## Current Truth · 2026-10-08

当前 CI 基线是 GitHub `main` `1cd8d36`，M2-C2E 已合并。公开 run [37749151683](https://github.com/sjh20016/inkbox/actions/runs/37749151683) 的 Heavy Gate 通过；Fast Gate 仅因历史 C2D 水拓扑长度断言失败。整理分支修正该旧断言后，本机完整 Fast / Heavy Gate、build 和 package audit 均通过；集成后的新 run 才能确认公开门禁恢复。可选 Browser Smoke 在本机 Edge CDP 启动阶段失败，未到应用断言。

C2E 当前入口：`test:render3d:m2c2e` 覆盖地形 / 创建 / Canvas / 雕刻事务 / CPU 访问策略；`test:render3d:m2c2e:generation` 覆盖种子、存档与三界访问纯度；`test:render3d:m2c2e:browser` 覆盖真实产品交互；`test:render3d:m2c2e:soak` 覆盖 GPU 与耐久。44 CPU、108 seed、14 GPU、12 固定镜头及 600/6000 联合耐久证据见 [C2E READINESS](../M2C2E_READINESS.md)。

下方 C2C、C2D 与更早门禁章节均按其标题 / 日期作为历史记录阅读；旧 C2C 的成功结果不描述当前 CI 状态。

2026-10-08 M2-C2E：`npm run test:render3d:m2c2e` 运行44项几何、创建/Canvas、雕刻事务、独立访问 CPU 门禁；`npm run test:render3d:m2c2e:generation` 运行 108 组种子/保存与实际三界开放纯度。Fast Gate 已加入前者。旧断言不删。

`npm run test:render3d:m2c2e:browser` 为真实产品创建、鼠标雕刻、Undo/Redo、importFile读档与扩图；`npm run test:render3d:m2c2e:soak` 为同机实 GPU 的 600/6000 产品 RAF、资源/内存/单笔成本。需要 Node 24 与本机 Edge；不要与任何 GPU 或重型 CPU 测量并发。`INKBOX_REPORT_DIR` 指向独立 ignored 目录。失败 PNG、错误栈和现场状态保留，修复后另开 run 目录；完整本轮解释见 [READINESS](../M2C2E_READINESS.md)。

## M2-C2C 历史阶段（2026-10-06 本地完成）

当前实现既有四类 Site、Leyline、Upper `qi`、Nether `veg`、持久 Rift 与短命 FX 六个独立表现开关 `sites` / `leylines` / `upperQi` / `netherYin` / `rifts` / `riftFx`。production on 验正式 GLB / 当前字段和真实 id；off、缺资产或完整 footprint 拒绝时验旧标记回退，不用 fallback 冒充生产模型。

主线首推c67a0ee的Fast旧dirty门禁失败已由426412d修复：旧Bridge脚本保持与e0逐字节相同，36断言通过；`test:render3d:m2c2c`新增type变化造成生产footprint拒绝/恢复及关闭生产的旧cadence检查，共8组通过。完整Fast集合26命令通过，修复后的case1/4两对GPU诊断完成、Formation105真实点击通过；诊断仍为pass:false。完整23对/Soak保留原运行层471ccbe来源，compact summary另记录最新源码SHA、Fast26命令与两对复验证据，不混合两次计时或跨运行transient advanceState。

| 委托命令 | 验证内容 | CI 归属 |
| --- | --- | --- |
| `npm run test:render3d:m2c2c` | 跨层接线、六开关、Region、旧行为回退与只读边界 | Fast |
| `npm run test:render3d:m2c2c:sites` | 四家族实际 GLB、Formation 8/4 子实例、共享 LOD、完整 footprint、当前身份与生命周期 | Fast |
| `npm run test:render3d:m2c2c:fields` | Upper qi / Nether veg 的 R8 缓存、实际字段绑定、开关与资源生命周期 | Fast |
| `npm run test:render3d:m2c2c:rifts` | 真实持久 Rift 地貌、唯一权威半径、冻结 presentation snapshot 与固定 FX 池 | Fast |
| `npm run test:render3d:m2c2c:purity` | 11 模式各 600 游戏日，完整 World / advanceState / save keys 和全部 11 RNG 流一致 | Fast |
| `npm run test:render3d:m2c2d` / `npm run test:render3d:m2c2d1` | C2D 连续场与 C2D.1 绘画化 shader / 诊断 CPU 契约 | Fast |
| `npm run test:render3d:m2c2c:browser` | 隔离 Edge 的自然世界 23 对 off/on、真实模型前景拾取 / 点击、可见场变化与产品帧测量 | 手动 C2C current-browser |
| `npm run test:render3d:m2c2c:soak` | 全状态预热后 600 lifecycle + 6000 产品 RAF、GPU / heap / DOM / listeners / FX 测量窗口 | 手动 C2C current-browser |

`npm run test:render3d:m2c2c:leylines` 是额外定向入口，钉真实 id / strength / radius、地纹逐段贴地、Region、池容量与关闭回退。旧 Node 门禁保留。本地 11 模式 × 600 日、11 RNG 与 49 save keys 一致，full SHA `4b37e9605591ef48e986833513a5f633da7ef28bc080f326dc884efe44abb498`。完整 23 对 GPU、600/6000 Soak、两个关键祖先与干净克隆全部通过；远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行。

手动 [c2c-browser.yml](../.github/workflows/c2c-browser.yml) 只运行当前 C2C 和 `test:render3d:m2b:browser` / `test:render3d:m2c2b:sample:browser` 两关键祖先；[ci.yml](../.github/workflows/ci.yml) 保留完整历史 Browser 回归，Fast / Heavy 与 [nightly.yml](../.github/workflows/nightly.yml) 的长测分层不变。两套 GPU workflow 都按需手动触发，不随普通 push 启动。

Browser 与 Soak 在 GPU 测量前共同调用 `ensureCanonicalMortalCache`：通过 Node 的 seed226 / small / 每次 3 日普通推进到 day72000，自然生成产品存档与 metadata，再经产品 importFile 导入。默认缓存缺失，或 simulation 源码、Node / V8、保存 SHA 不匹配时重建；显式指定输入校验失败则拒绝，不在浏览器内重新模拟来替代该输入，也不手写 World / Site / 坐标。Browser 的 canonical Realms save / 原始 900 日历史 R8 同样在测量前校验或由普通 Node 配方生成，经产品 importFile 载入；Realms 也校验完整 simulation 源码、Node / V8 与保存 SHA，默认不匹配时重建，显式坏输入拒绝。save 使用原量化规则，历史 R8 是独立只读表现证据，不能解释为某个鬼魂消失的因果记录。

本地 CDP 测试需 Node 22+ 与 Microsoft Edge，CI 为 Node 24；先 `npm ci` 安装 Node 的 Three。C2C Browser / Soak 默认自管服务器，也接受明确受控 `INKBOX_URL`；`INKBOX_REPORT_DIR` 指向独立输出目录。GPU 矩阵、Soak 和祖先顺序运行，不并发采样。完整 PNG / JSON / 日志在开发路径 `reports/local/m2c2c/` 或 Actions artifact，最多 8 张正常 Golden 保存在开发路径 `reports/release/render3d-m2c2c/golden/`，不进入 runtime；`research/` 也不随包，文档不链接这些排除文件。

本轮结果：四类真实 Site 的约 90px 正常生产几何及 CDP 点击通过；441 个历史前景 GL 点中 87 点变化，RGB 总差 133。600 lifecycle 实际 update / render 各 600 次；20 × 300 = 6000 产品帧，200 段检查均为 114 geometry / 10 texture / 16 program。M2-B Upper / Nether / boundary 的 173 / 235 / 91 个可见几何全部命中；sample 三档实际 GLB 点击通过。干净克隆 ccac961 独立 npm ci 与 16 项安装 / CPU / 旧资产 / build 命令通过，包 333 文件，约 8.8MB 目录 / 2.7MB ZIP。8 张 Golden 共 7206282 bytes，compact summary ≤256KiB。独立干净克隆 d9ca78b 的 cold 复验通过：缺 Mortal 缓存时自动自然生成，Realms 旧 metadata 自动重建；新 Mortal / Realms save 与 World / advance / history SHA 均与原完整 23 对矩阵一致。诊断 case 1 / 4 两对的 World / advance / camera 不变，Formation105 约 90px、38/96 前景三角，真实点击返回 105，error 0。报告保留 diagnosticComplete=true、pass=false，表示仅完成诊断，不替代 23 对全矩阵。8 项显式坏 save / source / engine / missing 拒绝检查通过。初次 cold 失败与修复后证据均独立留 proof。当前四报告：[工程与24项答复](../M2C2C_MEANINGFUL_GEOGRAPHY_REPORT.md)、[就绪](../M2C2C_READINESS.md)、[性能](../M2C2C_PERFORMANCE_REPORT.md)、[视觉](../M2C2C_VISUAL_ACCEPTANCE.md)；下方 C2B run 与旧计数仅代表各自历史基线。

## M2-C2D.1 绘画化收束（2026-10-08 本机工程验收完成）

本机完整 12 镜四轮 Edge 配对通过逐镜零正向预算；六层/GPU 契约、历史切换、原套件 600/6000 soak 与九项 CPU 通过，最终人工视觉裁决仍待确认；不得把 Safety Gate、图像统计、诊断 PASS 或单轮截图称为性能通过或绘画验收。C2C 的历史结论保留在上节，C2D.1 不继承 C2C 的 600 lifecycle / 6000 frame soak 结果，也没有以该 soak 代替本阶段配对计时。

| 命令 | 验证内容 | 用途 |
| --- | --- | --- |
| `npm run test:render3d:m2c2d1` | CPU shader / 诊断契约、debug 模式与只读纯度 | Fast Gate |
| `npm run test:render3d:m2c2d1:browser` | Edge 固定 12 镜头图像与 decomposition / shader 诊断；单独不构成配对性能或美术验收 | 手动 Edge |
| `npm run test:render3d:m2c2d1:paired` | 同一 Edge session 的 C2D / candidate 配对 GPU 计时 | 手动 Edge 性能门禁 |
| `npm run test:render3d:m2c2d1:comparison` | main / C2D / C2D.1 的历史 A/B 生命周期与资源诊断 | 手动 Edge 诊断 |
| `npm run test:render3d:m2c2d1:diagnostics` | 已生成证据的 Safety Gate 与图像统计；art acceptance 始终留给人工 | 离线诊断 |

配对性能必须以 Microsoft Edge 在同一次浏览器会话完成全部 12 个固定镜头；每镜头 C2D 与 candidate 各跑 4 轮，轮次按镜头奇偶交错 AB/BA，使用固定预热与每轮 120 个产品采样。预热固定为 48 个外部 RAF 与 12 个现有探针 RAF。保留所有预定义轮次，不重试、不丢弃无效轮次；候选与基线各自以四轮中位数聚合，候选中位数必须在每个镜头都小于或等于 C2D 中位数，容差为 0。p95 取四轮 p95 的最大值，max 取四轮最大值，有效 GPU 样本数跨四轮求和，不用 pooled p95。每个镜头都须达到零正向差值，任何正差、缺失轮次或不可用计时都不能被其他镜头的余量抵消。GPU 计时与其他浏览器 soak / 性能采样串行运行；缺失有效计时为 pending，不能当作通过。

Safety Gate 只检查运行安全、状态稳定和资源契约；`test:render3d:m2c2d1:diagnostics` 不会把 Safety PASS 提升为美术验收，所有图像统计和截图仍需单独人工判断。性能与视觉结论分别记录：本机工程完成，最终美术仍为 human-review-required。终验数字与源码 SHA 见 [C2D.1 就绪](../M2C2D1_READINESS.md)。

## M2-C2B.1 生产契约

`npm run test:render3d:m2c2b1` 验证实际 GLB 共享 node 的单批次与身份、装饰/法宝迟滞兼容，以及 C2C 的 Golden/summary 证据上限。长期规则见 [ASSET_PRODUCTION_SPEC](../ASSET_PRODUCTION_SPEC.md)。当前阶段 Browser 验收与历史全回归分层保留，旧 Node 门禁不删减。

## M2-C2B Pass1

M2-C2B Pass 1 已在主线 `e0a851c` 完成远端封板。Push [37224093479](https://github.com/sjh20016/inkbox/actions/runs/37224093479)、手动 Windows Browser / C2B 矩阵与 soak [37224107941](https://github.com/sjh20016/inkbox/actions/runs/37224107941)、800 年 Nightly [37233858438](https://github.com/sjh20016/inkbox/actions/runs/37233858438) 均成功。实际GLB/atlas：test:render3d:m2c2b:sample（11）；角色/ghost：content（5）；装饰：decorations（7）；法宝：artifacts（4）；实际GLB九模式600日：purity。

Edge串行browser包含HOUSE三件套、真实HALL、角色9项、法宝5项、装饰7对及matrix的21对视角。soak另跑600实际生命周期与6000实际帧，检查GPU、GC heap、DOM、listener、GL/LINK与单次加载。旧C2A/C2B0探针显式assets=off，所有原断言保留；新矩阵明确assets=on。CI Fast运行CPU门禁，手动Browser运行全部原基线和新增生产套件/soak，完整证据只进artifact。

普通 push / PR 运行 Fast / Heavy Gate；浏览器只手动运行，长测属于 Nightly。`npm test` 只代表核心检查通过，不代表全部门禁通过。
CI 定义在 [ci.yml](../.github/workflows/ci.yml) / [nightly.yml](../.github/workflows/nightly.yml)。Node CI 为 24；本地 CDP 浏览器测试需 Node 22+。

| 命令 | 验证内容 | CI 归属 |
| --- | --- | --- |
| `npm test` / `test:core` | 导入图、核心推进、HTTP 启动、transient runtime events | Fast |
| `test:view` | RealmViewState / Region、窗口生命周期、画像、只读检视、跨界事件与追迹地基 | Fast |
| `test:presentation` | FX / 记挂 / 关系 / 战争线、按位面分发与纯度 | Fast |
| `test:render3d` | M0 坐标、高程、拾取、雕刻、确定性 | Fast |
| `test:render3d:m1` | 实体 / 聚落 / 标记、LOD、只读与模拟不受影响 | Fast |
| `test:render3d:bridge` | height / water / type / veg dirty 分类 | Fast |
| `test:render3d:m2a` | Host / Stage 生命周期、Mask / pick、写守卫、单消费者、Slab、600 日三路等价 | Fast |
| `test:render3d:m2b` / `test:render3d:m2c` | 完整视界界缘 / ArtPass 与实例母版 | Fast |
| `test:render3d:m2c2a` | 屏幕LOD/迟滞/密度预算/身份/真实HLOD/Region/600日六模式纯度 | Fast |
| `test:render3d:m2c2b0` | 三界 Profile/HLOD/五变体纯度，600 日六模式完整状态/存档/全部 11 RNG | Fast |
| `test:vendor` | Three npm / vendor 版本、许可证、字节一致性；检查 LF 策略 | Fast |
| `npm run build` | 按显式清单生成自包含目录与 ZIP | Fast |
| `test:regression` | 干预 / 灾祸 / 存读档 | Heavy |
| `test:three-realms` | 三界身份、时间、随机流、守恒、裂隙和跨界 | Heavy |
| `test:save-equivalence` | 真实保存 / 恢复后的分叉等价；断言总数随内容浮动 | Heavy |
| `test:browser` | Canvas 的真实浏览器交互与存储 | 手动 Browser Smoke，Windows Edge |
| `test:render3d:m2a:browser` | Edge WebGL：13 图、两界各 80 拾取点、存读档 / 缺位面 / Canvas 切换 / 编辑守卫、性能环境 | 手动 Browser Smoke，接在 Canvas 检查后 |
| `test:render3d:m2b:browser` / `m2c:browser` / `m2c2a:browser` | M2-B / ArtPass / LOD 浏览器证据 | 手动 Browser Smoke，依次接在 M2-A 后 |
| `test:simulation` / `inkbox:longrun` | 较慢 smoke / 800 年长局；没有 test:longrun 命令 | Nightly，schedule / 手动 |

## 本地复验与证据

先 `npm ci` 安装 Node 测试所用的 Three；只启动浏览器游戏不必安装，importmap 读取 vendor。
`npm run test:render3d:m2a:release` 顺序运行 12 套现有门禁，写实际 exit code、耗时与日志；没有浏览器、旧 smoke 或 800 年长测。
该命令会更新 `reports/release/render3d-m2a/regression-results.json`，保存新证据时须审查差异，不能无意覆盖封板基线。

浏览器先 `npm run dev` 启动 4180，然后另开终端运行测试。M2-A 必须使用 Microsoft Edge；playtest 优先 Edge，也支持 Chrome。
playtest 的 `--port` 指 CDP 调试端口，游戏地址用 `--url`。M2-A 游戏地址可由 INKBOX_URL 配置。

```powershell
# 保留正式基线，重跑结果写本地目录。
$env:INKBOX_REPORT_DIR = 'reports/local/m2a-recheck'
npm run test:render3d:m2a:browser
```

正式封板截图 / JSON 在 [reports/release/render3d-m2a](../reports/release/render3d-m2a/)，对应 [M2-A 工程报告](../Render3D%20M2-A%20架构原型工程报告.md)。
M2-A 本地记录为 view 113、M2-A 13 组、160 点拾取零错误；历史计数只描述对应基线，不充当永久测试规格。

## GitHub 浏览器复验

Actions → Inkbox CI → Run workflow，选择 main。
Windows workflow 先由 `scripts/inkbox-browser-smoke.mjs` 在同一宿主内启动 / 维持 / 释放服务器，顺序执行 Canvas、M2-A、M2-B、M2-C、M2-C2A、M2-C2B0 并分别记录退出码；wrapper 之后，workflow 另以独立 steps 运行 C2B0 soak、C2B Pass 1 Browser 矩阵与 C2B Pass 1 soak。
HTTP 资源先探测，启动失败补存页面 / 网络诊断。输出到 reports/ci 的独立目录，通过 artifact 保存截图、JSON 和日志，成功 / 失败均保留可用证据。
这套远端功能复验不会改 reports/release 的已发布文件，也不把 runner 软件光栅读数当成本机 Intel UHD 730 性能基线。

测试失败须保留失败条件与日志；修复平台问题或真实实现，不删断言、不加 `|| true`、不把 assertion 改 warning。
`spawnSync EBUSY` 等执行权限问题按当次环境处理；不能用手工 ZIP 冒充自动 build 通过。

## 历史研究材料

scripts/_*.mjs 是已入 Git 的 D8 / M1 一次性研究探针，不进 npm 门禁或 dist；不是当前自动化覆盖的证明。
旧 V3/V4 测试与 src/main.js 不在当前工作树；需要参考时查 Git 历史。
其他本地 reports、旧日志与压缩记忆仅供考古；当前判据以维护中的契约、源码和实际命令结果为准。

## M2-C 追加门禁

`npm run test:render3d:m2c`：只读 DataTexture、分类完整性、增量上传、高程/Mask、材质开关缓存/释放、600 日纯度对照与实例母版批处理。既有测试断言保持。

`npm run test:render3d:m2c:browser`：先起4180服务，使用本机 Edge 与仓库 CDP；逐日推进真实快照，8 个视图 × baseline/pigment/ink/pilot 四档、完整 manifest、CPU-visible timing、RT/Depth/MSAA/DPR 技术探针和生命周期验证。默认正式证据写入 `reports/release/render3d-m2c`，重跑可用 `INKBOX_REPORT_DIR` 指向独立目录。软件光栅与不同机器的性能不可直接比较。

`node scripts/inkbox-render3d-m2c-soak.mjs`：在独立 Edge 中连续6000帧检查旋转、Resize、开关缓存、资源平台、完整 World 指纹与 ArtPass 状态。不要与性能采样并发运行。

`python scripts/inkbox-m2c-image-metrics.py reports/release/render3d-m2c`：需要 Pillow/NumPy；六项图像统计仅为诊断，不自动判定画面通过。

## M2-C2A 追加门禁

`npm run test:render3d:m2c2a`：屏幕像素/迟滞、实际几何降面、密度预算、身份、共享Region、真实房屋HLOD/近景恢复/分割回退、HLOD拾取与只地形划窗，以及六模式600个真实游戏日的完整World与活动RNG调用数对照。

`node scripts/inkbox-render3d-m2c2a-audit.mjs`：施工前完整模型审计；`--tree-gate` 是树木第一实验。`npm run test:render3d:m2c2a:browser`：GOLDEN_A、DENSITY_A、真实最密森林POI、上界/幽冥大窗口，各 baseline / pilot-no-lod / pilot-lod；实际批次面数、CPU更新/提交、rAF、Region、GL与shader门禁，加真实角色/树/聚落近中远截图和picker证明。

`npm run test:render3d:m2c2a:soak`：600帧生命周期 +6000帧连续旋转/缩放、Art/LOD/两界切换、资源与World指纹；不要和性能矩阵并发。C2A脚本可自管服务器，也接受 `INKBOX_URL` 根地址或完整 inkbox.html 地址；`INKBOX_REPORT_DIR` 改本地输出目录，`INKBOX_RELEASE_DIR` 可改代表截图目录。

默认完整产物在 `reports/m2c2a/`，Git仅保存 `reports/release/render3d-m2c2a/` 的代表图片与摘要。正式解释见 [LOD报告](../M2C2A_LOD_REPORT.md)、[性能报告](../M2C2A_PERFORMANCE_REPORT.md)、[视觉验收](../M2C2A_VISUAL_ACCEPTANCE.md)。CPU renderer submission 不称GPU时间；未执行timer query时写GPU time unavailable。

## M2-C2B0 三界门禁

`npm run test:render3d:m2c2b0`：3 个核心组 + 6×600 日、full World + advanceState SHA、存档 SHA/49 字段、11 条持久 RNG。六个 WeakMap 流在所有快照之后取八签定位偏移，偏移含开缝 fixture；诊断取签后不再推进。自然短期样本的零消费与零幽冥人口如实记录，浏览器另用自然 21600 日真实鬼修。

`npm run test:render3d:m2c2b0:browser`：自管本地服务器和串行 Edge，Mortal 7 / Nether 4 / Upper 5 / Cross 8 对，共48张新PNG；实际 LINK_STATUS、GL、错误、拾取/Region、HLOD、resize与诊断颜色统计。可用 INKBOX_URL 复用明确受控服务器；输出目录须为空，避免混入旧证据。

`npm run test:render3d:m2c2b0:soak`：20 状态全暖后基线、600 lifecycle 与6000产品RAF，真实鬼修 GLB 的legacy/v1材质、每30帧GPU资源、21次强制GC的heap/DOM/listener峰值、full World摘要。缺失CDP内存数据直接失败。

`npm run test:render3d:m2c2b0:perf`：先起服务器，再用 INKBOX_URL 指向它；固定GOLDEN_A/DENSITY_A和真实密林镜头，包装产品单次 update/render，异步GPU timer有界/剔除disjoint，不以rAF或CPU提交代替GPU时间。与其他GPU测量串行。

新门禁/性能完整输出在忽略目录 reports/m2c2b0；Git仅保留 release/render3d-m2c2b0 的golden/summary，CI大图上传 reports/ci artifact。当前报告只说明本地结果；未push或触发远端Actions。

M2-C2E本轮本机结果：44/44 CPU、108固定种子与120日实际三界/11RNG纯度、browser-optimized14/14、6行24GPU视角、final-canonical-r3十二镜及soak-optimized600/6000采样通过。完整数据与缓存源码SHA在release精简摘要；远端CI本分支未运行。GPU顺序独占，不把6000帧采样块之间的真实操作额外RAF计作连续持笔帧。
