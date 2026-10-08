# 坐天观井 · Inkbox 1.0.0

2026-10-08：M2-C2E 本地工程验收完成：44项CPU、108种子矩阵、14项真实产品GPU、十二镜同机对照和600/6000帧联合耐久通过。最终美术裁决与最大图性能边界见 [本轮就绪报告](./M2C2E_READINESS.md)。开发分支 `codex/m2-c2e-living-terrain`。3D 创建入口提供标准／群山／水泽、有效 seed 0、512×320 和渐进探索；雕刻支持山脊、盆地、Undo／Redo。

2026-10-06：**M2-C2C Meaningful Geography 本地验收完成，远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行。**既有四类 Site、Leyline、Upper qi、Nether yin 与持久 Rift / 瞬时 FX 已接入六个只读表现开关。完整 23 对 GPU off/on 矩阵通过，四类真实 Site 在约 90px 正常视角的生产几何与 CDP 点击通过；600 生命周期实际 update / render 各 600 次，6000 产品 RAF 帧及两个关键祖先 Browser 通过。干净克隆 ccac961 独立 npm ci 与 16 项安装 / CPU / 旧资产 / build 命令通过。 CPU 11 模式 × 600 日、11 RNG 与 49 save keys 一致，full SHA `4b37e9605591ef48e986833513a5f633da7ef28bc080f326dc884efe44abb498`。C2B Pass 1 的远端封板基线仍是 main `e0a851c`：Push CI [37224093479](https://github.com/sjh20016/inkbox/actions/runs/37224093479)、Windows Browser [37224107941](https://github.com/sjh20016/inkbox/actions/runs/37224107941)、800 年 Nightly [37233858438](https://github.com/sjh20016/inkbox/actions/runs/37233858438) 均成功，不能充作 C2C 远端证据。C2C 入口：[就绪](./M2C2C_READINESS.md)、[工程与24项答复](./M2C2C_MEANINGFUL_GEOGRAPHY_REPORT.md)、[性能](./M2C2C_PERFORMANCE_REPORT.md)、[视觉](./M2C2C_VISUAL_ACCEPTANCE.md)。

当前唯一活跃主线是 `src/inkbox`：一张会自行演化的水墨山河，玩家可以改地形、施神力、观察众生修行与灾祸结果。

2026-10-04：M2-C2A.1 与三界视觉基线已接入。3D 默认 `realm-style-v1`：凡界淡彩与暖白墙、幽冥焦墨骨白、上界石青石绿与赭色；`&art=legacy` 可回到原 pilot 对照。聚落远景由真实房屋派生 2–4 个屋顶簇；运行包排除源 `.blend`、preview 和全量视觉证据。交付入口为 [三界验收](./M2C2B0_VISUAL_ACCEPTANCE.md)、[性能报告](./M2C2B0_PERFORMANCE_REPORT.md) 与 [下一阶段条件](./M2C2B0_READINESS.md)。

历史 M2-C：写意渲染基线已接入。3D 默认使用纸色、颜料吸收、稀疏结构墨和一套批处理民居/树/Mini 修士；`?renderer=3d&art=baseline` 可对照原 M2-B，`&artdebug=1` 仅供开发调参。范围、截图和验证见 [M2-C 工程报告](./M2C_EXPRESSIVE_INK_REPORT.md)。

M2-C2A 已接入树、角色、建筑三档几何 LOD、屏幕优先密度预算与凡间聚落 HLOD 原型。3D 默认开启；`&lod=off` 保留完整模型对照。实施、实测与视觉边界分别见 [LOD 报告](./M2C2A_LOD_REPORT.md)、[性能报告](./M2C2A_PERFORMANCE_REPORT.md)、[视觉验收](./M2C2A_VISUAL_ACCEPTANCE.md)。

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
   两者交界处是一道竖直的「**界缘**」断面。若边界正好压着一条裂缝，那一段会变成**破口**（上界青色、幽冥暗朱红；legacy 保留旧色）。

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

## Mini 修士资产

3D 模式从 `assets/characters/cultivator/mesh/cultivator_library.glb` 加载原创低模修士。身体、发型与身份道具共享实例批次；职业和宗门色只是只读视觉投影。

启动服务器后，打开 [`cultivator-lab.html`](./cultivator-lab.html) 可查看六种组合、6/20/50 人固定尺度与300人压力场景。源工程、模块配置、调色图、实测截图和报告均在 [`assets/characters/cultivator`](./assets/characters/cultivator/docs/CHARACTER_SPEC.md)。继续生产前阅读 [`CHARACTER_SPEC.md`](./assets/characters/cultivator/docs/CHARACTER_SPEC.md)，并使用 `source/cultivator_master.blend`。

```bash
npm run test:characters          # GLB真实结构、预算、共享和组合纪律
npm run test:characters:browser  # 本机Edge/Chrome实载、尺度截图和生命周期
```

角色资产随发布包收录；运行游戏不需要安装 Blender。Blender 只用于修改或重建源资产。当前群体采用休止姿态实例绘制；原生 GLB 保留 Idle/Walk，完整群体动画仍是后续工作。几何 LOD 保留现有 GLB 近景与真实身份。

## 当前 C2C 地理表现

工程已并入main。首推c67a0ee暴露的旧dirty分类回归由426412d修复，旧Bridge36断言、新C2C8组与完整Fast26命令通过；修复后的两对GPU诊断及实际Formation105点击通过。最新源码与原23对/Soak的来源分别记录于[就绪报告](./M2C2C_READINESS.md)及compact summary；最终远端门禁查看本轮main Actions。

生产资产开启时，凡界已有 `secret` / `cave` / `formation` / `ruin` 与 Leyline 使用正式 GLB；Formation 的 8/4 阵点按自身地形分别贴地，远档仍共享轮廓。上界读取已有 `qi`，幽冥读取已有 `veg`，通过 Stage 持有的 R8 缓存表现强弱；Rift 地貌读取真实持久裂隙，短命 FX 读取唯一 PresentationStage 的冻结事件快照。地点检视回到当前 World 的真实 id，不另造玩法或存档字段。

六个独立表现开关为 `sites`、`leylines`、`upperQi`、`netherYin`、`rifts`、`riftFx`，由 Host API 控制，不写进 World。产品 3D 默认启用；`&geography=off` 关闭 C2C 表现，`&assets=off` 保留旧资产基线。资产未就绪、关闭或完整 footprint 不适合时，Site / Leyline / Rift 保留既有标记回退，不把回退标记当作正式模型验收。

委托的七个命令已接线（独立 Leyline 定向门禁另见测试索引）：

```bash
npm run test:render3d:m2c2c
npm run test:render3d:m2c2c:sites
npm run test:render3d:m2c2c:fields
npm run test:render3d:m2c2c:rifts
npm run test:render3d:m2c2c:purity
npm run test:render3d:m2c2c:browser
npm run test:render3d:m2c2c:soak
```

2026-10-06 本地验收完成：完整 23 对 GPU off/on 矩阵通过，四类真实 Site 在约 90px 正常视角的生产几何与 CDP 点击通过；600 生命周期实际 update / render 各 600 次，6000 产品 RAF 帧及两个关键祖先 Browser 通过。干净克隆 ccac961 独立 npm ci 与 16 项安装 / CPU / 旧资产 / build 命令通过。手动 [c2c-browser.yml](./.github/workflows/c2c-browser.yml) 验当前阶段和 M2-B / C2B sample 两个关键祖先；[ci.yml](./.github/workflows/ci.yml) 保留完整历史 Browser 回归，普通 push 不启动 GPU。远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行，C2B e0a851c 的三个成功 run 仍只属于历史基线。

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

M2-A 浏览器探针：先运行 `npm run dev`（端口 4180），另开终端执行 `npm run test:render3d:m2a:browser`。需要 Node 22+ 和本机 Microsoft Edge。默认输出到 `reports/release/render3d-m2a/`；重跑可用 `INKBOX_REPORT_DIR` 指向本地临时目录，保留已发布的硬件基线。GitHub 手动 workflow 由 Browser Smoke wrapper 顺序运行 Canvas、M2-A、M2-B、M2-C、M2-C2A、M2-C2B0，随后以独立 steps 运行 C2B0 soak、C2B Pass 1 Browser 矩阵与 C2B Pass 1 soak；截图 / JSON 存为独立 artifact。

测试分类和各旧探针的位置见 [`tests/README.md`](./tests/README.md)。

## 工程状态

- **Render3D M2-A「Multi-Plane Architecture Prototype」已完成**——一个 Render3D Host 管理三个位面 Stage，复用一个 WebGLRenderer 与 CameraRig；共享视界状态、位面拾取及 Mask / Slab 小型原型。委托书：[`坐天观井 · Render3D M2-A 架构原型工程委托书.md`](./坐天观井%20·%20Render3D%20M2-A%20架构原型工程委托书.md)；验收记录：[`Render3D M2-A 架构原型工程报告.md`](./Render3D%20M2-A%20架构原型工程报告.md)。
- **正式完成**：D6-2 三界生态 **A–F** · D6-3 跨界生态 **A–E** · D7 观察与表现层 **A–G 封板** ·
  D8 视界 2.0 **A–F** · **Render3D M0**（地形 / 水体 / 植被 / 相机 / Raycast / 地形雕刻）·
  **Render3D M1**（实体 / 聚落 / 宗门山门 / 法宝地点灵脉标记 / 3D 选中环）· **Render3D M1.1D**（工程加固）。
- **已完成底座**：M2-B 的完整 Layer Mask、共享高程、Raw/Strata 界缘、3D 划窗、裂缝破口与拾取。
- **已完成**：M2-C2B Pass 1 建立第一代正式资产生产体系；验收见 [Pass 1 就绪报告](./M2C2B_READINESS.md)。
- **当前阶段已本地完成**：M2-C2C Meaningful Geography；23 对 GPU 矩阵、600/6000 帧 Soak、两关键祖先与干净克隆验证通过。远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行。只呈现已有 World 事实，详见 [C2C 就绪](./M2C2C_READINESS.md)。
- **后续优先方向**：真实宗门 / 灵脉空间归属；R1 群体动画只留 Lab，R2 研究不授权 runtime 道路。完整 HLOD、Trace Field 与 Gameplay G 需后续授权。
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
M2-A / M2-C 与 C2A 的证据按阶段报告和 ARCHITECTURE 中的清单保存；C2B Pass 1 的完整 Browser / soak 证据保留为 Actions artifact，摘要入口见 [READINESS](./M2C2B_READINESS.md)。本地 MEMORY、备份与安装 / 构建产物不入 Git。具体清单见 ARCHITECTURE。
