# 坐天观井 · Inkbox 1.0.0

当前唯一活跃主线是 `src/inkbox`：一张会自行演化的水墨山河，玩家可以改地形、施神力、观察众生修行与灾祸结果。

## 启动

需要 Node.js 18 或更新版本。运行依赖**只有一项**：`three@0.186.1`——供可选的 **Render3D 立体沙盘**使用。
默认 Canvas 主线**不加载** Three.js 模块，所以不带 `?renderer=3d` 时它不参与运行。

浏览器侧的 Three.js 走仓库内的 **`vendor/three/`**（`inkbox.html` 的 importmap 指向它），所以**克隆即可运行、不必 `npm install`**；
`package.json` 里的 `three` 依赖仍然保留，供 node 测试直接 `import * as THREE from 'three'`。两者职责分开，见 `HANDOFF.md` §6b。

```bash
npm run dev
```

随后打开 `http://127.0.0.1:4180/`。Windows 也可以运行 `启动水墨沙盒.bat` 或 `启动游戏.bat`。唯一游戏页面是 [`inkbox.html`](./inkbox.html)；根目录 `index.html` 和 `game.html` 都会转到它。

想进 **3D 立体沙盘**：开 `http://127.0.0.1:4180/inkbox.html?renderer=3d`（可随时切回 Canvas，同一个世界、不重载）。

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
npm run test:d7             # D7 开发者总验收（core + regression + three-realms + save-equivalence + presentation）
npm run test:browser        # 浏览器交互检查，需要本机 Edge 或 Chrome
npm run test:simulation     # 范围较大的旧 smoke，仅按需运行
npm run build               # 生成仅含活跃主线的 dist 项目包
```

测试分类和各旧探针的位置见 [`tests/README.md`](./tests/README.md)。

## 工程状态

- **当前阶段：Render3D M1.1D「Development Hardening」已完成**——工程加固，**不是新玩法**：
  仓库真相统一（四份文档对齐 `main`）· 分层 GitHub Actions 门禁 · `WorldRenderBridge` dirty 分类 ·
  真实性能基线重测 · Three.js 自包含目录从 `node_modules` 迁到 `vendor/`。
  工程报告：[`Render3D M1.1D 工程报告.md`](./Render3D%20M1.1D%20工程报告.md)。
- **正式完成**：D6-2 三界生态 **A–F** · D6-3 跨界生态 **A–E** · D7 观察与表现层 **A–G 封板** ·
  D8 视界 2.0 **A–F** · **Render3D M0**（地形 / 水体 / 植被 / 相机 / Raycast / 地形雕刻）·
  **Render3D M1**（实体 / 聚落 / 宗门山门 / 法宝地点灵脉标记 / 3D 选中环）· **Render3D M1.1D**（工程加固）。
- **下一阶段**：**Render3D M2「三界空间表现架构」——尚未开始**。
  ⚠️ M2 尚未开始，**首先需要设计方案裁决**（三个位面切换还是同时驻留 / 3D 视界实现路径 / 是否共享 `Renderer3D` 生命周期），**不得自行选方案开工**。
- **暂缓**：D8-G「跨界追迹」为 **WIP**——纯逻辑地基（`ui/realmTrace.js` + `sim/watch.js` 的 `netherGhostOf`）已保存并有测试钉住，但**追迹 UI 未做**；本阶段不继续扩建 Canvas 版 D8-G。
- **接手先读**：[`HANDOFF.md`](./HANDOFF.md)（当前版本 / 启动入口 / 契约 / 纪律 / 下一包）。
- 30 秒看懂项目在哪：[`ROADMAP.md`](./ROADMAP.md)
- 三界规则（代码必须遵守的约束表）：[`THREE_REALMS.md`](./THREE_REALMS.md)
- 视界契约（观察层「是什么 / 什么不许做」）：[`VIEW_CONTRACT.md`](./VIEW_CONTRACT.md)
- Render3D M0 技术报告：[`RENDER3D_M0.md`](./RENDER3D_M0.md) · Render3D M1 工程报告：[`Render3D M1 工程报告.md`](./Render3D%20M1%20工程报告.md) · Render3D M1.1D 工程报告：[`Render3D M1.1D 工程报告.md`](./Render3D%20M1.1D%20工程报告.md)
- 当前状态与已知问题：[`STATUS.md`](./STATUS.md)
- 有效待办与暂停研究：[`BACKLOG.md`](./BACKLOG.md)
- 玩家指南：[`PLAYER_GUIDE.md`](./PLAYER_GUIDE.md)

`src/main.js`、`demo/`、`剧情文案素材/`、`scripts/v*` 和旧研究报告是冻结历史材料，不属于当前主线。完整开发仓库把 V4 发布文档与旧入口归档到 `reports/archive/v4-docs/`；干净项目包不会带入这些历史材料。
