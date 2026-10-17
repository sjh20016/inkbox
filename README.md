# 坐天观井 · Inkbox 1.0.0

本分支为 **G2-R1 可玩集成候选**：从治理后 main `4852d89` 定向恢复 G2 战斗、伤势、灾迹与玩家导航，保持 **PERF BLOCKED / Draft**。迁移范围、试玩与本轮验证见 [G2-R1 交接](./docs/development/G2_R1_PLAYABLE_INTEGRATION.md)；下方正式产品状态描述 main，不代表本候选已合并。

## 正式产品状态（按 main 最新提交核对）

正式产品基线为 **M2-C2E + G1**，G1 已由 PR #2 合并。RG 治理前的历史基线为 `e1e55039bb56efda7a307513ede07a9fab3bf534`；实际开发从 GitHub 当前 `main` HEAD 起步，不把历史 SHA 当作最新主线。

PR #12 候选提交 `74934a8b1360af9007c69935d5becdf8f9809872` 的范围仅为 **G2-P1 闭环 READY**；G2 性能 **BLOCKED**，候选整体未合并，不能把 G2 全功能标为 READY。PR #17 的 G3 cost 研究为 **BLOCKED**。G2/G3 的 PR 是否仍开放以 GitHub 当前状态为准；#10 的有效代码已成为 #12 的祖先，不得重复合并。独立 B 线与产品线没有共同祖先。

导航：[`HANDOFF.md`](./HANDOFF.md) · [`ROADMAP.md`](./ROADMAP.md) · [`BACKLOG.md`](./BACKLOG.md) · [`tests/README.md`](./tests/README.md) · [`docs/development/REPOSITORY_WORKFLOW.md`](./docs/development/REPOSITORY_WORKFLOW.md)。

## 仓库治理 RG-P1～P4（2026-10-17 收官）

RG 治理移除旧阶段报告、委托书与 `reports/release/` 已跟踪输出；历史内容可从 [清理前的 main 快照](https://github.com/sjh20016/inkbox/tree/e1e55039bb56efda7a307513ede07a9fab3bf534) 追溯，不改写 Git 历史。默认将新的测试截图、性能报告与 Golden 保存在被忽略的 `reports/` 或 Actions artifact，不随运行包分发。正式程序、3D 美术资源与核心回归没有在此治理中删除；所有测试入口按 [`tests/README.md`](./tests/README.md) 分层，本地小型 UI 改动可运行 `npm run check:ui`，正式候选仍须 Fast/Heavy 全绿。实际验收看相应源码 SHA 的 CI 与实测，不以治理 PR 历史成功替代新产品验证。

## 启动

需要 Node.js 18 或更新版本。建议使用 Node.js 24 与 `npm ci` 对齐 CI。运行依赖**只有一项**：`three@0.186.1`——供可选的 **Render3D 立体沙盘**使用。
默认 Canvas 主线**不加载** Three.js 模块，所以不带 `?renderer=3d` 时它不参与运行。

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

1. 顶栏工具下拉选「**上界视界**」或「**幽冥视界**」；
2. 在**凡间地形上按住左键拖一圈**（形状随意，可凹可凸），松手；
3. 应看到三件事：**窗外**凡间仍有水 / 树 / 村落；**窗内**变成另一界；
   两者交界处是一道竖直的「**界缘**」断面。若边界正好压着一条裂缝，那一段会变成**破口**（上界青色、幽冥暗朱红；legacy 保留旧色）。

中键旋转 · 右键平移 · 滚轮缩放。关窗：工具切回「检视」，或在折叠的「调试探针」里点「关窗」。
雕刻只在凡间、且未开窗时可用（工具选「抬山 / 压地 / 平整 / 平滑」后左键拖动，Ctrl+Z 撤销）。

**两种垂直表现的对比**（M2-B 需要人眼裁决的一项）：把地址栏里的 `boundary=strata`
改成 `boundary=raw` 再回车——同一世界、不重载。Raw 下窗内与凡间几乎齐平、界缘断面时有时无；
Strata 下窗口被明确抬起（幽冥压下），四周出现连续断面。取舍依据见
[`Render3D M2-B 工程报告.md`](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/Render3D%20M2-B%20%E5%B7%A5%E7%A8%8B%E6%8A%A5%E5%91%8A.md) 的 Q5。

⚠️ 顶栏里折叠起来的 **「调试探针」**（固定矩形 Mask / Slab 20×20 / 位面切换）是**研究探针**，
不是玩家功能——正式划窗请用上面的「上界视界 / 幽冥视界」。另：从 M2-B 起，遮罩覆盖
**地形 / 水 / 植被 / 聚落 / 标记全部已有凡间内容**，不再只过滤地形与实体。
熟悉 M2-A 的读者注意，`?renderer=3d&plane=upper` 之类的初始位面参数仍然有效，
但「上界 Mask / 幽冥 Mask」按钮已经折进调试探针，不再是正式入口。

## Mini 修士资产

3D 模式从 `assets/characters/cultivator/mesh/cultivator_library.glb` 加载原创低模修士。身体、发型与身份道具共享实例批次；职业和宗门色只是只读视觉投影。

启动服务器后，打开 [`cultivator-lab.html`](./cultivator-lab.html) 可查看六种组合、6/20/50 人固定尺度与300人压力场景。源工程、模块配置、调色图、实测截图和报告均在 [`assets/characters/cultivator`](./assets/characters/cultivator/docs/CHARACTER_SPEC.md)。继续生产前阅读 [`CHARACTER_SPEC.md`](./assets/characters/cultivator/docs/CHARACTER_SPEC.md)，并使用 `source/cultivator_master.blend`。

```bash
npm run test:characters          # GLB真实结构、预算、共享和组合纪律
npm run test:characters:browser  # 本机Edge/Chrome实载、尺度截图和生命周期
```

角色资产随发布包收录；运行游戏不需要安装 Blender。Blender 只用于修改或重建源资产。当前群体采用休止姿态实例绘制；原生 GLB 保留 Idle/Walk，完整群体动画仍是后续工作。几何 LOD 保留现有 GLB 近景与真实身份。

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

当前产品与候选状态见本文顶部。M2-C2E 的最大地图性能边界、最终视觉裁决与历史 RNG 游标存档决策见 [BACKLOG](./BACKLOG.md)。G1 行为与契约见 [集成报告](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/G1_INTEGRATION_REPORT.md)，模块职责见 [ARCHITECTURE](./ARCHITECTURE.md)，三界与视界约束见 [THREE_REALMS](./THREE_REALMS.md) / [VIEW_CONTRACT](./VIEW_CONTRACT.md)。

当前工作树没有旧 V3/V4 的 `src/main.js`、demo 或 `scripts/v*`；需要考古时查 Git 历史。根 `index.html` / `game.html` 是跳转到 Inkbox 的入口。旧 `scripts/_*.mjs` 一次性视图探针已移出当前工作树，按需查阅历史提交。

> ⚠️ **`剧情文案素材/` 不在「历史材料」之列**（2026-09-29 修正）：它是**活跃**的文案资产。
> `00_文案使用说明（AI与开发者必读）.md` 是 [`HANDOFF.md`](./HANDOFF.md) §4 列为**有约束力**的文档
> （UI 禁令 / **考古定名不得擅改** / 机制缺口 → 停走设计流程），`01`–`06` 是它索引的
> 台词 / 编年史 / 墓志 / 世界内文本 / 界面 / 三界预留文案库。**本包随包出货。**

`美术素材/初期素材构思/` 保留早期 163 张 PNG、生成器与说明；`配色参考/`、`实验建筑资产/`、Sonnet 参考包作为后续设计输入。当前运行使用代码生成的实例母版，不加载这些参考素材；约451MB第三方范式整包保留本地。见 [参考资产索引](./美术素材/参考资产索引.md)。
M2-A / M2-C 与 C2A 的证据按阶段报告和 ARCHITECTURE 中的清单保存；C2B Pass 1 的完整 Browser / soak 证据保留为 Actions artifact，摘要入口见 [READINESS](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2B_READINESS.md)。本地 MEMORY、备份与安装 / 构建产物不入 Git。具体清单见 ARCHITECTURE。

G1 正式集成开发分支的验证与接口见 [G1_INTEGRATION_REPORT](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/G1_INTEGRATION_REPORT.md)。
