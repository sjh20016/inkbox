# HANDOFF · 坐天观井 Inkbox 交接单

> 事实核对：2026-10-03，M2-C 写意渲染基线。读序：README → 本文 → 当前任务涉及的契约 / 源码。
> 阶段看 ROADMAP，目录和模块责任看 ARCHITECTURE，历史查 STATUS；本地 MEMORY 只作索引。

## 0. 当前状态与范围

M2-B 的完整 Layer Mask、共享 ElevationField / RegionGeometry、界缘、3D 划窗与拾取已完成。M2-C 在同一个 Host/Renderer/Camera、三个 Stage 上增加薄 ArtPass；不改变模拟、存档或视界定义。范围与证据见 [M2-C 工程报告](./M2C_EXPRESSIVE_INK_REPORT.md)。

3D 默认 `art=pilot`，`art=baseline/pigment/ink/low` 用于对照；`artdebug=1` 才出现调参面板。地形 GPU 纹理由既有 height/type dirty 更新；实体仍按原类别实例化，不与 World 对象一一对应。完整资产家族、动画、几何 LOD/HLOD 和 Gameplay G 留到后续授权。

用户允许实验建筑资产自由修改，并指定 `美术素材/配色参考` 为后续颜色参考；使用索引见 [参考资产索引](./美术素材/参考资产索引.md)。范式包用于研究，产品不依赖整套第三方素材。

## 1. 唯一工作区与版本

- 活跃源码：`inkbox.html` + `src/inkbox/**`；`index.html` / `game.html` 是跳转入口。
- 版本：Inkbox `1.0.0`（`package.json` 与 `core/config.js`）。`main` 是唯一活跃主线，工作分支从 main 建立。
- 本工作区直接关联 `sjh20016/inkbox` 的 origin；无需把 dist 复制到另一个“发布工作区”。
- `render3d-m0` / `render3d-m2a` 是历史 checkpoint，不从旧快照继续新功能，不重写已发布历史。
- D6-2 / D6-3、D7 A–G、D8 A–F、M0 / M1 / M1.1D / M2-A 已完成。
  D8-G 只有 `realmTrace` / `netherGhostOf` 逻辑地基，追迹 UI 仍暂缓。

## 2. 启动与依赖

`npm run dev` → `http://127.0.0.1:4180/`；3D 加 `inkbox.html?renderer=3d`，可切回 Canvas，复用同一世界。
运行服务器需要 Node 18+；零依赖 CDP 浏览器测试需要 Node 22+，CI 使用 Node 24。
Three 固定为 `0.186.1`：浏览器 importmap 读 `vendor/three/`，Node 测试读 npm 依赖。修改版本后执行 `npm run vendor:sync` 和 `npm run test:vendor`；vendor 的 LF 策略由 `.gitattributes` 保证。

## 3. 推进、渲染与编辑边界

- `sim/advance.js` 的 `advanceWorld(world, days, deps)` 定义完整世界的游戏日推进；Sandbox 的 `advanceDays` 是游戏侧接线。
  完整世界回归使用这条推进链；隔离子系统测试可直接测试对应函数，不复制一套完整时钟。
- 模拟世界是数据真相。渲染不抽模拟 RNG、不反写实体 / 生态、不把 renderer dirty 或派生量写入存档。
  `WorldRenderBridge` 与各 Layer 自管快照和刷新周期。
- `PresentationStage.ingestWorlds` 是 runtime event 唯一消费口；Canvas 画 `drawPlane`，Three 读取冻结的 `snapshotPlane`，不另 drain。
- Canvas、Three、`riftViewOpen` 共用 `getRealmViewState({selection, toolId})`。Region 始终是世界格坐标，规则见 VIEW_CONTRACT v2。
- 按实际可见地形 / 实例几何拾取，返回 plane；跨界检视只读。斜视的合法前景遮挡保留。
- 地形编辑是显式例外：`terrain/sculpt.js` 只改 height，Adapter 仅在凡间且 Mask / Slab 关闭时允许雕刻和撤销。
- world / 子世界 / 尺寸 / 地形数组身份变化会释放并重建 Stage 集合，保留 GPU 与相机；缺失位面回退凡间。

## 4. 文档责任与冲突处理

| 文档 | 唯一职责 |
| --- | --- |
| [ROADMAP](./ROADMAP.md) | 当前阶段与下一轮设计方向 |
| [ARCHITECTURE](./ARCHITECTURE.md) | 工作区地图、模块边界、仓库 / 发布包归属 |
| [THREE_REALMS](./THREE_REALMS.md) | 三界模拟规则 |
| [VIEW_CONTRACT](./VIEW_CONTRACT.md) | renderer-independent 视界规则 V1–V11 |
| [文案使用说明](./剧情文案素材/00_文案使用说明（AI与开发者必读）.md) | 文案声音、UI 禁令、考古定名与素材接线 |
| [BACKLOG](./BACKLOG.md) | 未完成事项；已完成编号只留关闭记录 |
| [STATUS](./STATUS.md)、各阶段委托书 / 报告 | 按日期保留的历史与证据，不充当当前施工指令 |

用户最新明确指令决定范围；源码与实际执行结果决定“已经做了什么”。若实现与契约冲突，记录差异并处理当前授权范围，不能为通过测试静默改规则。
历史文档里的旧阶段编号、旧禁令、旧计数不覆盖当前契约。本地 `.workbuddy-ai/memory/` 不新增另一套规则，也不作为发布包必读依赖。

## 5. 验证与 CI

| 门禁 | 命令 / 环境 |
| --- | --- |
| Fast Gate（push / PR / 手动） | core、view、presentation、render3d、render3d:m1、render3d:bridge、render3d:m2a、m2b、m2c、vendor、build |
| Heavy Gate（与 Fast 并行） | regression、three-realms、save-equivalence |
| Browser Smoke（仅 workflow_dispatch） | Windows Edge；依次 `test:browser` + `test:render3d:m2a:browser` |
| Nightly（schedule / 手动） | `test:simulation` + `inkbox:longrun`；没有 `test:longrun` 入口 |

命令与用途详见 [tests/README](./tests/README.md)。本地浏览器测试先起 4180；playtest 的 `--port` 是 CDP 端口，游戏地址用 `--url`。
普通 CI 不运行浏览器和 800 年长测，不删测试、不把断言改警告、不加 `|| true`。
M2-A 的本地证据在 `reports/release/render3d-m2a/`；CI 的 `inkbox-browser-smoke.mjs` 自管服务器与两套原测试的生命周期，分别记录退出码；重跑写入独立目录并上传 Actions artifact，不覆盖硬件基线。
M2-C 最新 Edge 复验见 `reports/release/render3d-m2c/browser/`。旧 M2-A oracle 已补齐 M2-B 可见界缘及独立解码，原样本与退出门禁保留，不能通过隐藏界缘或跳过样本来消除偏差。
旧阶段固定断言数与文件数只保留在对应报告；save-equivalence 的断言数量会随内容变化，不能当稳定指标。

## 6. Git、发布包与本地文件

`npm run build` 生成 dist 目录及 ZIP；收录依据 `scripts/inkbox-package.mjs` 的 FILES / DIRECTORIES。
Git 的源码、素材和开发记录范围大于发布包，具体归属见 ARCHITECTURE。尤其注意：

- `剧情文案素材/` 是活跃文案资产，已入 Git 且随包；`美术素材/` 的设计输入见参考索引，产品只加载已接入的代码母版，整套参考包不进运行包。
- `scripts/_*.mjs` 是已入 Git 的历史一次性探针，保留参考，不在 npm / CI / build 门禁中。
- `reports/release/render3d-m2a/` 的正式截图 / JSON 已入 Git 且随包；其他 reports 与 `*.log` 是本地输出。
- `.workbuddy-ai/`、`.local-backups/`、node_modules、dist 不入 Git。备份不能作为源码或发布依赖。

## 7. 开发纪律

不借 cleanup 改模拟、存档、概率或玩法。P2 问题记 BACKLOG，不顺手修。
新模拟随机流、身份与存档纪律以 THREE_REALMS 为准；观测层禁消费模拟 RNG。
测试造世界走真实工厂；聚焦成功不等于目标未被山体遮挡，浏览器断言须等状态就绪。
Windows 出现 `spawnSync EBUSY` 时按当次环境故障诊断并申请所需执行权限，不能宣称自动构建已通过或长期要求手工补 ZIP。
提交按可验证的变更拆分，源码与必要测试一起提交，文档可独立提交；不要把一轮所有资产 / 架构 / 测试压成一个提交。
