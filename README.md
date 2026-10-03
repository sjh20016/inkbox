# 坐天观井 · Inkbox 1.0.0

当前唯一活跃主线是 `src/inkbox`：一张会自行演化的水墨山河，玩家可以改地形、施神力、观察众生修行与灾祸结果。

2026-10-03：M2-C 写意渲染基线已接入。3D 默认使用纸色、颜料吸收、稀疏结构墨和一套批处理民居/树/Mini 修士；`?renderer=3d&art=baseline` 可对照原 M2-B，`&artdebug=1` 仅供开发调参。范围、截图和验证见 [M2-C 工程报告](./M2C_EXPRESSIVE_INK_REPORT.md)。

## 启动

需要 Node.js 18 或更新版本。运行依赖**只有一项**：`three@0.186.1`——供可选的 **Render3D 立体沙盘**使用。
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
   两者交界处是一道竖直的「**界缘**」断面。若边界正好压着一条裂缝，那一段会变成青色**破口**。

中键旋转 · 右键平移 · 滚轮缩放。关窗：工具切回「检视」，或在折叠的「调试探针」里点「关窗」。
雕刻只在凡间、且未开窗时可用（工具选「抬山 / 压地 / 平整 / 平滑」后左键拖动，Ctrl+Z 撤销）。

**两种垂直表现的对比**（M2-B 需要人眼裁决的一项）：把地址栏里的 `boundary=strata`
改成 `boundary=raw` 再回车——同一世界、不重载。Raw 下窗内与凡间几乎齐平、界缘断面时有时无；
Strata 下窗口被明确抬起（幽冥压下），四周出现连续断面。取舍依据见
[`Render3D M2-B 工程报告.md`](./Render3D%20M2-B%20工程报告.md) 的 Q5。

⚠️ 顶栏里折叠起来的 **「调试探针」**（固定矩形 Mask / Slab 20×20 / 位面切换）是**研究探针**，
不是玩家功能——正式划窗请用上面的「上界视界 / 幽冥视界」。另：从 M2-B 起，遮罩覆盖
**地形 / 水 / 植被 / 聚落 / 标记全部已有凡间内容**，不再只过滤地形与实体。
熟悉 M2-A 的读者注意，`?renderer=3d&plane=upper` 之类的初始位面参数仍然有效，
但「上界 Mask / 幽冥 Mask」按钮已经折进调试探针，不再是正式入口。

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
npm run test:vendor       # npm Three 与浏览器 vendor 的版本、许可证、逐字节一致性
npm run test:render3d:m2a:release  # 顺序执行 12 套发布门禁并保存实际结果
npm run test:render3d:perf # 浏览器性能探针（本机 Edge/Chrome，记录 GPU 环境）
npm run test:d7             # D7 开发者总验收（core + regression + three-realms + save-equivalence + presentation）
npm run test:browser        # 浏览器交互检查，需要本机 Edge 或 Chrome
npm run test:simulation     # 范围较大的旧 smoke，仅按需运行
npm run build               # 生成仅含活跃主线的 dist 项目包
```

M2-A 浏览器探针：先运行 `npm run dev`（端口 4180），另开终端执行 `npm run test:render3d:m2a:browser`。需要 Node 22+ 和本机 Microsoft Edge。默认输出到 `reports/release/render3d-m2a/`；重跑可用 `INKBOX_REPORT_DIR` 指向本地临时目录，保留已发布的硬件基线。GitHub 手动 Browser Smoke 顺序运行 Canvas 与 M2-A 两套测试，截图 / JSON 存为独立 artifact。

测试分类和各旧探针的位置见 [`tests/README.md`](./tests/README.md)。

## 工程状态

- **Render3D M2-A「Multi-Plane Architecture Prototype」已完成**——一个 Render3D Host 管理三个位面 Stage，复用一个 WebGLRenderer 与 CameraRig；共享视界状态、位面拾取及 Mask / Slab 小型原型。委托书：[`坐天观井 · Render3D M2-A 架构原型工程委托书.md`](./坐天观井%20·%20Render3D%20M2-A%20架构原型工程委托书.md)；验收记录：[`Render3D M2-A 架构原型工程报告.md`](./Render3D%20M2-A%20架构原型工程报告.md)。
- **正式完成**：D6-2 三界生态 **A–F** · D6-3 跨界生态 **A–E** · D7 观察与表现层 **A–G 封板** ·
  D8 视界 2.0 **A–F** · **Render3D M0**（地形 / 水体 / 植被 / 相机 / Raycast / 地形雕刻）·
  **Render3D M1**（实体 / 聚落 / 宗门山门 / 法宝地点灵脉标记 / 3D 选中环）· **Render3D M1.1D**（工程加固）。
- **已完成底座**：M2-B 的完整 Layer Mask、共享高程、Raw/Strata 界缘、3D 划窗、裂缝破口与拾取。
- **本轮**：M2-C 的 S1/S2 写意地形与三个实体母版、可复现场景、开关/资源/纯度验证；性能和验收边界以 [M2-C 工程报告](./M2C_EXPRESSIVE_INK_REPORT.md) 为准。
- **后续**：实体家族、几何 LOD/HLOD、动画和 Trace Field 尚未施工；S3 后处理不进入默认路径。
- **暂缓**：D8-G「跨界追迹」为 **WIP**——纯逻辑地基（`ui/realmTrace.js` + `sim/watch.js` 的 `netherGhostOf`）已保存并有测试钉住，但**追迹 UI 未做**；本阶段不继续扩建 Canvas 版 D8-G。
- **接手先读**：[`HANDOFF.md`](./HANDOFF.md)（当前版本 / 启动入口 / 契约 / 纪律 / 下一包）。
- 30 秒看懂项目在哪：[`ROADMAP.md`](./ROADMAP.md)
- 三界规则（代码必须遵守的约束表）：[`THREE_REALMS.md`](./THREE_REALMS.md)
- 视界契约（观察层「是什么 / 什么不许做」）：[`VIEW_CONTRACT.md`](./VIEW_CONTRACT.md)
- 工作区 / 模块地图与 Git / dist 归属：[`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Render3D M0 技术报告：[`RENDER3D_M0.md`](./RENDER3D_M0.md) · Render3D M1 工程报告：[`Render3D M1 工程报告.md`](./Render3D%20M1%20工程报告.md) · Render3D M1.1D 工程报告：[`Render3D M1.1D 工程报告.md`](./Render3D%20M1.1D%20工程报告.md)
- 当前状态与已知问题：[`STATUS.md`](./STATUS.md)
- 有效待办与暂停研究：[`BACKLOG.md`](./BACKLOG.md)
- 玩家指南：[`PLAYER_GUIDE.md`](./PLAYER_GUIDE.md)

当前工作树没有旧 V3/V4 的 `src/main.js`、demo 或 `scripts/v*`；需要考古时查 Git 历史。根 `index.html` / `game.html` 是跳转到 Inkbox 的入口。`scripts/_*.mjs` 已入 Git，仅保留历史研究参考，不在发布包中。

> ⚠️ **`剧情文案素材/` 不在「历史材料」之列**（2026-09-29 修正）：它是**活跃**的文案资产。
> `00_文案使用说明（AI与开发者必读）.md` 是 [`HANDOFF.md`](./HANDOFF.md) §4 列为**有约束力**的文档
> （UI 禁令 / **考古定名不得擅改** / 机制缺口 → 停走设计流程），`01`–`06` 是它索引的
> 台词 / 编年史 / 墓志 / 世界内文本 / 界面 / 三界预留文案库。**本包随包出货。**

`美术素材/初期素材构思/` 保留早期 163 张 PNG、生成器与说明；`配色参考/`、`实验建筑资产/`、Sonnet 参考包作为后续设计输入。当前运行使用代码生成的实例母版，不加载这些参考素材；约451MB第三方范式整包保留本地。见 [参考资产索引](./美术素材/参考资产索引.md)。
正式 M2-A 截图 / JSON 随 Git 与 dist；其他 reports、本地 MEMORY、备份与安装 / 构建产物不入 Git。具体清单见 ARCHITECTURE。
