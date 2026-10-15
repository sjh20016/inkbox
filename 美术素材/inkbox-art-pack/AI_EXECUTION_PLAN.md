# AI 执行方案 · 墨界美术层（给接手的 AI / 开发者）

你拿到的是一份**已经实现并验证过的美术层**，以及它的后续工作令。先读 README.md，再读本文，再读 `docs/Render3D-M2-B-工程规划书.md` 的对应章节。

## 0. 不可违反的规则（来自仓库本身，我读过对应源码）

1. **纯表现层。** 不改 `sim/`、`world/`、`io/save.js`、存档 schema、任何概率常量；不往 `World` 上加任何渲染字段（`test:render3d:bridge` 的 G6 会失败）；不抽任何随机流，美术代码里不许出现 `Math.random`（`test:render3d:art` 会失败）。
2. **既有测试文本不许动。** `test:render3d:bridge` 用正则钉着源码文本，例如 `this.selectionMarker?.update(this.world, heightChanged)`。要改行为，改注入方式而不是改这一行。每次改动后**全部门禁必须原样通过**，不得"为通过而改测试"。
3. **裂缝半径只走 `render3d/readers/riftViewModel.js`**（`visibleRift`），不复制 `riftRadiusAt` 的公式。
4. **谓词只有一处。** 窗内 / 窗外的判据是 `RegionMask3D` 的表（等价于 `pointInRegion(x+0.5, y+0.5)` 对 quad 中心）。不要在任何 Layer 里再写一份。
5. **高程只有一处。** 新代码一律经 `stage.elevAt` / `ElevationField`，不要新增对 `surfaceElevation` 的直接调用。
6. **保留行尾。** 仓库里很多文件是 CRLF（`TerrainMesh.js`、`EntityLayer.js` 等）。改完用 `file` 确认没有混入 LF；`install.mjs` 已自动适配。
7. **剧情文案素材 / HANDOFF.md §4 有约束力**（UI 禁令、考古定名）。任何会出现玩家可见文字的改动，先读它。
8. **每个工作令一个独立提交，各自过全部门禁。**

## 1. 工作令 0 · 安装并验证（必须先做）

```bash
node install.mjs <repo> --check && node install.mjs <repo>
cd <repo>
node scripts/inkbox-import-check.mjs && node scripts/inkbox-core-check.mjs \
  && node scripts/inkbox-startup-check.mjs && node scripts/inkbox-runtime-events.mjs \
  && node scripts/inkbox-view.mjs && node scripts/inkbox-presentation.mjs \
  && npm run test:render3d && npm run test:render3d:m1 && npm run test:render3d:bridge \
  && npm run test:render3d:m2a && npm run test:render3d:art && npm run build
```

**验收：** 全部退出码 0；`npm run build` 输出的包里含 `assets/art/` 与 `src/inkbox/render3d/art/`。
**失败时：** 如果 `--check` 报锚点不符，说明仓库与 M2-A final cleanup 有出入。读 `patches.json`，对每一处 `{file, old, new}`，**按意图**手工接入（`old` 是上下文，`new` 是目标形态），然后以第 0 步的命令序列为验收。

## 2. 工作令 1 · 在你的机器上做一轮视觉调参

```bash
python3 tools/art_screenshot.py "http://127.0.0.1:4180/inkbox.html?renderer=3d&art=ink" out.png \
  "()=>{document.querySelector('[data-probe=\"nether\"]').click(); return 1}"
```

（需要 `pip install playwright && playwright install chromium`。）
对照 `docs/screens/` 的前后对比，只改 `artConfig.js` 与 `assets/art/*`。**至少换 3 个种子**各截凡间 / 上界窗 / 幽冥窗，检查：墙是否总存在且方向正确；墙是否过高压住画面；肩部是否出现尖刺；雾是否吞掉远处。
**验收：** `npm run test:render3d:art` 仍通过；截图存入 `docs/screens/` 作为基线。

## 3. 工作令 2 · B0.2 高程口径收口

**目标：** 给 `VegetationLayer`、`SettlementLayer`、`WorldMarkerLayer`、`SlabPrototype` 增加可选 `elevAt`，由 `PlaneStage` 传入；缺省回退 `surfaceElevation`。做法照 `EntityLayer`。
**验收：** 临时打开 `PLANE_RENDER_PROFILE.upper.vegetation`，上界植被贴在上界地形（不是凡间高度）；`test:render3d:bridge` 的 G1–G7 原样通过。

## 4. 工作令 3 · B1.1 标记与裂缝环

**目标：** 窗开着时，窗外凡间的 marker 继续显示，窗内不显示；裂缝环作为界缘的一部分在墙上画出（决策 D6）。
**读：** `render3d/markers/WorldMarkerLayer.js`（含第 216、240 行的贴地）、`RealmView3DPrototype.apply`。
**验收：** 新增测试：开窗后窗外 marker 数 = 无窗时窗外 marker 数，窗内为 0。

## 5. 工作令 4 · B1.2 墙的拾取与检视

**目标：** 点击墙面返回 `{plane:'boundary', x, y, wallH, breach, target}`，读数行显示"界缘 · 落差 / 缝"。
**做法：** `PlanePicker` 加入 `SkirtLayer.mesh`；`faceIndex >> 1` = 边序号。**验收：** 单测覆盖命中与未命中；`canSculpt` 对界缘命中返回 false。

## 6. 工作令 5 · B4 3D 划窗手势

**先读：** `main.js` 的 `commitSelection(points)`（约第 1392 行起）与 `normalizeRegion`，**确认入参坐标系**，不要凭猜。
**目标：** 在 3D 里提供真正走 `commitSelection` 的划窗手势（因此会开缝）；解决 3D 下左栏 `inert` 导致视界工具点不到的问题。
**验收：** 3D 里划窗后 `world.rifts` 新增 1–4 条（`openRifts` 的行为）；`test:view` 与 `test:render3d:m2a` 原样通过；600 日 digest 纯度测试仍通过。

## 7. 工作令 6+ · 玩法（G 系列）— **先停下来要授权**

规划书 §10 的 A1–A5 是模拟层改动，**没有用户的显式授权不得动手**。拿到授权后按 §10.4 的顺序，每一步独立提交。

## 8. 给 AI 的自检清单（每个工作令结束时）

- [ ] 没有改任何 `sim/`、`world/`、`io/` 文件（除非该工作令已获授权）
- [ ] 没有改任何既有测试的断言或正则
- [ ] `git diff --stat` 里没有意外的整文件改动（CRLF 被转 LF 会表现为整文件 diff）
- [ ] 全部门禁通过，且汇报里写明**哪些没跑以及为什么**
- [ ] 汇报区分"我验证过的"与"我推测的"
