# 坐天观井 · Inkbox 1.0.0

R1「山海入世」在 G5/P1 主线上接入 Opus V1→V1.3 原始美术历史：Three 默认使用低饱和三界、浮岛云层、幽冥立体线刻与自然雕刻。界面依照本地 Opus《玄门秘卷》原型，以印令、符箓、纸卷书架和摊开的命簿呈现正式游戏；创世菜单、稳定人物肖像和执伞卜算子插画接入现有处理器。启动后先显示山河菜单，可继续、创世或选择真实存档；菜单开启时暂停模拟。操作见 [玩家指引](./PLAYER_GUIDE.md)，来源、验收与保留边界见 [R1 集成记录](./docs/development/R1_ART_UI_INTEGRATION.md)。

截至 2026-10-19 的 P0 合流中，G2.5 PR #26、G2.6 PR #27、G5 PR #28 已按依赖顺序通过 Merge Commit 接纳。对应合流提交为 `59cd08d`、`9ec8ec7`、`3dabf8c`，保留 main → G2.5 → G2.6 → G5 的 Git 祖先关系。

正式主线现包含 G2.5 洗髓、主题机缘与突破异象，G2.6 WASD/视界操作、聚落水灾与众生表现，以及 G5 GPU 地形、水面与植被更新优化。P1（PR #29）接纳规则格网地形拾取与大范围高度变化时的植被重建错峰；水面索引合并因总上传字节和更新 CPU 变差而回退。G5 默认使用 GPU 路径，3D CPU 对照/回退 URL 为 `?renderer=3d&terrain=cpu&water=cpu`；定向检查为 `npm run test:g5`，测量与限制见 [HANDOFF](./HANDOFF.md)。

**P1 指定场景已验收**：AMD Radeon 610M、Edge 155、广卷 512×320、DPR 1、模拟 ×2 的真实 GPU 浏览器对照中，基线/候选 RAF P95 为 27.9/27.8 ms，超过 50 ms 的 RAF 间隔为 20/14 次，均无超过 100 ms 的间隔。P1 的主要收益是降低地形拾取 CPU 成本；静止鼠标的 A/B 样本不能证明整体 FPS 大幅提升。Intel UHD 730 上 G5 时期约 1.07 s 的长帧尚未通过同条件复测确认消除；DPR 2、其他显卡与更长期负载仍未验证。两版本模拟推进量并非严格一致；GPU 提交时间、CPU 帧耗时和 RAF 间隔是不同指标。因此这项通过仅覆盖已测场景，不能据此宣称项目整体性能问题已经解决。详见 [P1 长帧专项](./docs/development/P1_G5_LONGFRAME.md)。

## 正式产品状态（按 main 最新提交核对）

**本分支 E2-Lite「观井有痕」候选**：右栏「手札」串起焚林、降灾、赐灵根与原抽水回声；可从真实人物/聚落卡立下两种只读行愿，并随 v11 存档回访。只交付独立 Draft PR，不自动进入 main。操作和验收见 [E2-Lite 交付说明](./docs/development/E2_LITE_DELIVERY.md)。

**G8-M1「岁序归一」已完成正式合流**：PR #52 以合并提交 `06043766d937ac42e8f4a04305e256cf5b9a43ce` 接纳运行期 RNG 与时钟续跑、人口生态及跨界法宝修复。新档可恢复已保存的游标；旧档无法倒推出历史游标，地形仍为 16 位有损量化。固定种子 800 年终局 1400 生灵是单次样本，长期平衡及真实成熟世界性能仍待研究。见 [G8 合流记录](./docs/development/G8_M1_MERGE_REPORT.md) 与 [成熟世界基线](./docs/development/G8_MATURE_WORLD_BASELINE.md)。

**WT-I1「万象同卷 · 众生可置」集成**：W0.1 #41 与 T0 #40 在同一正式游戏共存；左侧「生灵 → 万灵」直接选择类别和形态，Canvas/Three 与右侧图录同步。修士冷却后复行，交通独占远行移动权，生态与持粮行程共同存档。来源、验收与实际合流状态见 [WT-I1 交付记录](./docs/development/WTI1_INTEGRATION_DELIVERY.md)。下方候选描述保留来源阶段的历史范围，main 以集成 PR 状态为准。

**W0.1 来源 #41**：17类可投放生灵、真实道侣派生比翼、聚合捕食、地灵迁衰、十二道途及双renderer图录由WT-I1完整收纳。逐单位档位与保留边界见 [W0.1交付记录](./docs/development/W01_WANLING_DELIVERY.md)。

G7 v1.1 按依赖顺序接纳 **E0 #34 → C1 #35 → 立体观世 P0 #36**：聚落记挂与真实干预、自然双亲出生与宗门供养、原生 3D 神力及有限水响应进入同一主线。G7 #38 补齐取消笔画、存读档并发保护和原生检视入口。合流与验收见 [G7 交付记录](./docs/development/G7_MAIN_INTEGRATION_DELIVERY.md)。S0 静态自然继续保留；G6 #30 与独立山海遗迹美术分支仍未接入。

正式产品基线为 **M2-C2E + G1 + G2-R1 + A1 + G2.4-C + G2.5 + G2.6 + G5 + P1 + R1 + S0 + 地方韧性 + E0 + C1 + 立体观世 P0 + G7 + WT-I1 + G8**。R1 从 `c45f9be` 起步；2026-10-19 的 G5 合流提交为 `3dabf8c`；RG 治理前的历史基线为 `e1e55039bb56efda7a307513ede07a9fab3bf534`。后续实际开发始终从开工时重新核对的 GitHub 最新 `main` HEAD 起步。

G2/G5 功能接纳不代表性能预算封板。PR #26～#28 已进入主线；PR #12、#4～17 等旧候选只作来源与研究索引，不重复合并已迁入主线的功能。G3 cost 仍为 **BLOCKED**，独立 B 线与产品线没有共同祖先。

导航：[`HANDOFF.md`](./HANDOFF.md) · [`ROADMAP.md`](./ROADMAP.md) · [`BACKLOG.md`](./BACKLOG.md) · [`tests/README.md`](./tests/README.md) · [`docs/development/REPOSITORY_WORKFLOW.md`](./docs/development/REPOSITORY_WORKFLOW.md)。

**T0 来源 #40**：真实运粮与修士远行由WT-I1完整收纳；普通游戏书架可派遣，`inkbox.html?scenario=t0` 保留明确标注的受控初始场景。规则与边界见 [T0交付记录](./docs/development/T0_TRANSIT_DELIVERY.md)。

## 仓库治理 RG-P1～P4（2026-10-17 收官）

RG 治理移除旧阶段报告、委托书与 `reports/release/` 已跟踪输出；历史内容可从 [清理前的 main 快照](https://github.com/sjh20016/inkbox/tree/e1e55039bb56efda7a307513ede07a9fab3bf534) 追溯，不改写 Git 历史。默认将新的测试截图、性能报告与 Golden 保存在被忽略的 `reports/` 或 Actions artifact，不随运行包分发。正式程序、3D 美术资源与核心回归没有在此治理中删除；所有测试入口按 [`tests/README.md`](./tests/README.md) 分层，本地小型 UI 改动可运行 `npm run check:ui`，正式候选仍须 Fast/Heavy 全绿。实际验收看相应源码 SHA 的 CI 与实测，不以治理 PR 历史成功替代新产品验证。

## 启动

需要 Node.js 18 或更新版本。建议使用 Node.js 24 与 `npm ci` 对齐 CI。运行依赖**只有一项**：`three@0.186.1`——供可选的 **Render3D 立体沙盘**使用。
默认 Canvas 主线**不提前加载** Three.js 模块；点击「立体沙盘」或使用 `?renderer=3d` 时按需载入，并保留当前世界。

浏览器侧的 Three.js 走仓库内的 **`vendor/three/`**（`inkbox.html` 的 importmap 指向它），所以**克隆即可运行、不必 `npm install`**；
`package.json` 里的 `three` 依赖仍然保留，供 node 测试直接 `import * as THREE from 'three'`。两者职责分开，见 `HANDOFF.md` §6b。

```bash
npm run dev
```

随后打开 `http://127.0.0.1:4180/`。唯一游戏页面是 [`inkbox.html`](./inkbox.html)；根目录 `index.html` 和 `game.html` 都会转到它。

Windows 上直接双击 **`启动水墨沙盒.bat`** 即可：它会检查 Node、**等服务器真的就绪再开浏览器**，
并且**服务器已经在跑时直接复用**（不会像旧版那样报端口占用然后闪退）。双击后可选模式：

| 序号 | 模式 | 打开的地址 |
| --- | --- | --- |
| 1 | 凡间水墨（Canvas 主线 · 完整游戏） | `inkbox.html` |
| 2 | 3D 立体沙盘（Render3D） | `inkbox.html?renderer=3d` |
| 3 | 3D 沙盘 + **Strata 界缘试验** | `inkbox.html?renderer=3d&boundary=strata` |
| 4 | 只起服务器（自己挑页面） | 打印地址，不自动开浏览器 |

也可以直接指定模式：`启动水墨沙盒.bat 3`；换端口：`启动水墨沙盒.bat 2 4181`。
`启动3D立体沙盘.bat` 是「选 2」的一键版，`启动游戏.bat` 等同双击主启动器，
`快速自测.bat` 跑核心检查 + M2-B 视界套件并给出结论。

## 试玩：3D 里划一扇窗（M2-B 的核心动作）

1. 在「**观察**」符匣选「**上界视界**」或「**幽冥视界**」；顶栏三界按钮用于直接切换完整位面；
2. 合上符匣，在**凡间地形上按住左键拖一个闭合区域**（可凹可凸），松手；
3. 应看到三件事：**窗外**凡间仍有水 / 树 / 村落；**窗内**变成另一界；
   两者交界处是一道竖直的「**界缘**」断面。若边界正好压着一条裂缝，那一段会变成**破口**（上界青色、幽冥暗朱红；legacy 保留旧色）。

WASD 平移 · Shift 加速 · 中键/QE 旋转 · 滚轮缩放 · F 全图。关窗：工具切回「检视」，或在折叠的「调试探针」里点「关窗」。
雕刻只在凡间、且未开窗时可用，工具选「抬山 / 沉陆 / 平整 / 平滑」后左键拖动。取消未提交笔画会保留原世界；已提交的操作没有玩家撤销/重做入口。

**两种垂直表现的对比**（M2-B 需要人眼裁决的一项）：把地址栏里的 `boundary=strata`
改成 `boundary=raw` 再回车——同一世界、不重载。Raw 下窗内与凡间几乎齐平、界缘断面时有时无；
Strata 下窗口被明确抬起（幽冥压下），四周出现连续断面。取舍依据见
[`Render3D M2-B 工程报告.md`](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/Render3D%20M2-B%20%E5%B7%A5%E7%A8%8B%E6%8A%A5%E5%91%8A.md) 的 Q5。

⚠️ 三维原生工具中折叠的 **「调试探针」**（固定矩形 Mask / Slab 20×20 / 位面切换）是**研究探针**，
不是玩家功能——正式划窗请用上面的「上界视界 / 幽冥视界」。另：从 M2-B 起，遮罩覆盖
**地形 / 水 / 植被 / 聚落 / 标记全部已有凡间内容**，不再只过滤地形与实体。
熟悉 M2-A 的读者注意，`?renderer=3d&plane=upper` 之类的初始位面参数仍然有效，
但「上界 Mask / 幽冥 Mask」按钮已经折进调试探针，不再是正式入口。

## A1 · 众生入画：修士 / 卜算子 / 山海异兽

A1 轮把三组原创 3D 资产接进了正式游戏（详见 [A1 交付文档](./docs/development/A1_CREATURE_CHARACTER_ASSETS.md)）：

- **修士**：3D 模式从 `assets/characters/cultivator/mesh/cultivator_library.glb` 加载 2026-10 重做版（legacy cells 版，保留旧色格 / 16 骨 / Idle·Walk 语义）；旧模型以 `mesh/cultivator_library_prev.glb` 随包保留可回退。六身份、宗门色、LOD、拾取与实例化路径不变。
- **卜算子**：山河右下的「观其真形」肖像入口采用本地交付的执伞插画，SVG 与原模型渲染 PNG 随包保留。点开仍是 A1 的独立 three.js 三维小窗，Idle / Walk / 风起（Wind）三动画可切换；关闭 / 换世界 / 读档释放独立 renderer。没有风力事实，因此只提供可演示的风起，不伪造天气机制。
- **山海异兽**：`assets/creatures/` 收录 13 种《山海经》异兽 GLB（每只 8 套动画，共享 16×1 调色板，与修士同单位制）。W0.1 已全部接入正式图录，12 种可投放，比翼鸟由真实道侣关系派生。真实物种由模拟层 `form` 持有；旧档四种试装外形按原哈希兼容回填。世界只按实际出现的形态加载模型，图录预览单只按需加载；LOD2 保留低成本代表影。

启动服务器后可打开三个资产 Lab：

| Lab | 内容 |
| --- | --- |
| [`cultivator-lab.html`](./cultivator-lab.html) | 修士六身份、6/20/50 人固定尺度、300 人压力场景 |
| [`busanzi-lab.html`](./busanzi-lab.html) | 卜算子 38 骨 / 5 网格 / 1534 面、Idle / Walk / Wind 三动画 |
| [`creature-lab.html`](./creature-lab.html) | 13 种异兽统一加载、体型 / 材质 / 默认姿态与 8 套动画 |

```bash
npm run test:characters          # 修士 GLB 真实结构 / 预算 / provenance / 组合纪律
npm run test:busanzi             # 卜算子 GLB 结构（38 骨 / 3 clip / 20 色调色板 / 面数）
npm run test:creatures           # 13 种异兽 GLB 结构 + manifest + 合并几何 + 世界接线契约
npm run test:a1                  # 以上三组结构检查
npm run test:characters:browser  # 本机 Edge/Chrome 实载、尺度截图和生命周期
npm run test:busanzi:browser     # 真实 three.js：三动画 / 风起位移 / 游戏面板→Viewer
npm run test:creatures:browser   # 真实 WebGL：13 只 Lab + 世界试装 + 资源生命周期
```

资产随发布包收录；运行游戏不需要安装 Blender。修士群体仍是休止姿态实例绘制（原生 GLB 保留 Idle/Walk），卜算子与 Lab 内异兽是真实骨骼 / 部件动画；异兽在正式世界内是静态实例化，近景动画池是后续可选工作。


## 检查与测试

```bash
npm test                    # 快速 Inkbox 核心检查、入口 HTTP 检查
npm run test:regression     # 四类干预、灾祸生命周期与存读档回归
npm run test:three-realms   # 三界生态不变量回归（时间 / 世界身份 / id 空间 / 上界 / 幽冥 / 存读档 / 裂隙 / 跨界）
npm run test:save-equivalence  # 存读档分叉等价
npm run test:presentation   # 表现层回归（D7-C 起：相机补间 / 落点墨环 / FX / 记挂 / 关系图 / 战争线）
npm run test:view           # 视界回归（D8-A 起：视界身份 / 生命周期 / 纯度 / 模块边界 / 位面画像 / 穿透检视 / 跨界追迹地基）
npm run test:render3d       # Render3D M0（坐标 / 高程 / 拾取 / 雕刻 / 确定性 / 渲染纯度）
npm run test:render3d:m1    # Render3D M1（实体 / 聚落 / 标记层：数量对应、贴地、只读、模拟不受影响）
npm run test:render3d:bridge # Render3D M1.1D（dirty 分类：height / water / type / veg 分层派发）
npm run test:render3d:m2a  # Render3D M2-A（多 Stage / 掩码 / 拾取 / 纯度等架构不变量）
npm run test:render3d:m2c2a # 屏幕LOD/密度预算/真实HLOD/拾取/Region/600日六模式纯度
npm run test:render3d:m2c2a:browser # Edge固定场景三档对照与真实POI近中远景
npm run test:render3d:m2c2a:soak # 600帧生命周期与6000帧资源耐久
npm run test:render3d:m2c2c # C2C Sites / Leyline / Field / Rift / 纯度 CPU 门禁
npm run test:render3d:m2c2c:browser # 本机 Edge 正式 23 对 geography off/on 矩阵
npm run test:render3d:m2c2c:soak # 600 lifecycle + 6000 产品 RAF 耐久
npm run test:vendor       # npm Three 与浏览器 vendor 的版本、许可证、逐字节一致性
npm run test:render3d:m2a:release  # 顺序执行 12 套发布门禁并保存实际结果
npm run test:render3d:perf # 浏览器性能探针（本机 Edge/Chrome，记录 GPU 环境）
npm run test:d7             # D7 开发者总验收（core + regression + three-realms + save-equivalence + presentation）
npm run test:browser        # 浏览器交互检查，需要本机 Edge 或 Chrome
npm run test:simulation     # 范围较大的旧 smoke，仅按需运行
npm run build               # 生成仅含活跃主线的 dist 项目包
```

M2-A 浏览器探针：先运行 `npm run dev`（端口 4180），另开终端执行 `npm run test:render3d:m2a:browser`。该探针需要 Node 22+ 和本机 Microsoft Edge。默认输出到 `reports/release/render3d-m2a/`；重跑可用 `INKBOX_REPORT_DIR` 指向本地临时目录，保留已发布的硬件基线。GitHub 手动 workflow 由 Browser Smoke wrapper 顺序运行 Canvas、M2-A、M2-B、M2-C、M2-C2A、M2-C2B0，随后以独立 steps 运行 C2B0 soak、C2B Pass 1 Browser 矩阵与 C2B Pass 1 soak；截图 / JSON 存为独立 artifact。

测试分类和各旧探针的位置见 [`tests/README.md`](./tests/README.md)。

## 工程状态

当前产品与候选状态见本文顶部。M2-C2E 的最大地图性能边界、最终视觉裁决与长期人口和存档边界见 [BACKLOG](./BACKLOG.md)。G1 行为与契约见 [集成报告](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/G1_INTEGRATION_REPORT.md)，模块职责见 [ARCHITECTURE](./ARCHITECTURE.md)，三界与视界约束见 [THREE_REALMS](./THREE_REALMS.md) / [VIEW_CONTRACT](./VIEW_CONTRACT.md)。

当前工作树没有旧 V3/V4 的 `src/main.js`、demo 或 `scripts/v*`；需要考古时查 Git 历史。根 `index.html` / `game.html` 是跳转到 Inkbox 的入口。旧 `scripts/_*.mjs` 一次性视图探针已移出当前工作树，按需查阅历史提交。

> ⚠️ **`剧情文案素材/` 不在「历史材料」之列**（2026-09-29 修正）：它是**活跃**的文案资产。
> `00_文案使用说明（AI与开发者必读）.md` 是 [`HANDOFF.md`](./HANDOFF.md) §4 列为**有约束力**的文档
> （UI 禁令 / **考古定名不得擅改** / 机制缺口 → 停走设计流程），`01`–`06` 是它索引的
> 台词 / 编年史 / 墓志 / 世界内文本 / 界面 / 三界预留文案库。**本包随包出货。**

`美术素材/初期素材构思/` 保留早期 163 张 PNG、生成器与说明；`配色参考/`、`实验建筑资产/`、Sonnet 参考包作为后续设计输入。当前运行使用代码生成的实例母版，不加载这些参考素材；约451MB第三方范式整包保留本地。见 [参考资产索引](./美术素材/参考资产索引.md)。
M2-A / M2-C 与 C2A 的证据按阶段报告和 ARCHITECTURE 中的清单保存；C2B Pass 1 的完整 Browser / soak 证据保留为 Actions artifact，摘要入口见 [READINESS](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2B_READINESS.md)。本地 MEMORY、备份与安装 / 构建产物不入 Git。具体清单见 ARCHITECTURE。

G1 正式集成开发分支的验证与接口见 [G1_INTEGRATION_REPORT](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/G1_INTEGRATION_REPORT.md)。
