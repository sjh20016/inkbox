# 墨界美术包 · Inkbox Art Pass

给「水墨沙盒 · 坐天观井」Render3D 的**美术层**：水墨着色、界缘墨墙（两界高差的视觉语言）、宣纸与雾、窗外世界还原。
基于你上传的 **M2-A final cleanup** 快照（`render3d-m2a`）。

**默认关闭。** 不加开关时游戏与 M2-A **逐位一致**（既有全部门禁一行未改、全部通过）。

---

## 五分钟安装

需要 Node ≥ 18（你的仓库本来就要）。

```bash
# 1) 解压本包，进入目录
# 2) 先检查（不改任何文件）
node install.mjs <你的 inkbox 仓库根目录> --check

# 3) 安装
node install.mjs <你的 inkbox 仓库根目录>

# 4) 启动并打开
cd <你的仓库> && npm run dev
#   http://127.0.0.1:4180/inkbox.html?renderer=3d&art=ink
```

进游戏后，3D 调试工具栏最右边有个 **「墨界：开 / 关」** 按钮，可随时切换对比。
要看界缘墙：点工具栏的 **「上界 Mask」/「幽冥 Mask」**。

**回滚：** `node install.mjs <仓库> --revert`（按 `.art-pack-backup/` 还原被改的文件，并删除新增文件）。

安装器的安全设计：先**全量校验**每一处补丁的锚点在目标文件中恰好出现一次，任何一处不符就**一个文件都不改**并告诉你哪里不符；自动适配 CRLF / LF。
如果你的仓库在 M2-A 之后又改过相关文件导致校验失败，把输出交给 AI，让它读 `AI_EXECUTION_PLAN.md` 按"意图"手工接入。

---

## 包里有什么

```
install.mjs                  安装器（--check / --revert）
patches.json                 41 处锚点补丁（12 个现有文件）
files/                       原样复制进仓库的新增文件
  src/inkbox/render3d/art/   美术层代码（8 个模块）
  assets/art/                素材（程序生成的 PNG + manifest.json）
  tools/gen_art_assets.py    素材生成器（改参数重跑即可换风格）
  tools/art_screenshot.py    无头浏览器截图（Playwright）
  scripts/inkbox-render3d-art.mjs          12 组不变量测试
  scripts/inkbox-art-skirt-prototype.mjs   界缘可行性测量
  scripts/inkbox-art-seal-calibration.mjs  两界落差 / 镇压标定
docs/
  Render3D-M2-B-工程规划书.md   完整规划（含剩余工作包、风险、玩法）
  screens/                      前后对比截图（真实渲染）
AI_EXECUTION_PLAN.md         给 AI 执行的工作令
```

### 美术层代码（`src/inkbox/render3d/art/`）

| 模块 | 职责 |
| --- | --- |
| `artConfig.js` | **唯一调参处**：纸色、每界垂直档、墙高、肩部宽度、色阶、雾 |
| `ArtPass.js` | 编排者：挂在 `Render3DHost` 上，开 / 关窗、墙的节流重算、场景级改动 |
| `ElevationField.js` | 每个位面"最终高程"的唯一来源（垂直档 + 肩部） |
| `RegionMask3D.js` | 把窗口区域一次算成整数表：quad 内外、边界边、到边界距离 |
| `RimField.js` | 墙高 / 墙顶 / 肩部的纯数值核心 |
| `SkirtLayer.js` | 界缘：墙几何 + 墨墙着色器 + 裂缝开口 + 云气 |
| `inkColor.js` | 地形顶点色水墨化：色阶映射、量化、陡坡"皴"加深 |
| `ArtAssets.js` | 素材加载；缺失时退回程序占位，不报错 |

### 对既有文件的改动（共 12 个，全部向后兼容）

`TerrainMesh`、`EntityLayer`、`WaterLayer`、`VegetationLayer`、`SettlementLayer`、`SelectionMarker`、`ThreeFxProbe`、`PlaneStage`、`Render3DHost`、`Render3DAdapter`、`scripts/inkbox-package.mjs`、`package.json`。
每处都是"加一个可选参数 / 钩子，缺省走原路径"。不动 `sim/`、`world/`、`io/`、存档 schema、任何概率常量、任何随机流。

---

## 调参（只改 `artConfig.js`）

| 想要 | 改什么 |
| --- | --- |
| 墙更高 / 更矮 | `SKIRT.hMin`（下限）、`SKIRT.hCap`（软饱和上限） |
| 上界更"悬"、幽冥更"沉" | `ART_PLANES.upper.datum`（+）、`nether.datum`（−）；`relief` 压缩目标界自身起伏 |
| 墙边与地形过渡更缓 / 更陡 | `SKIRT.shoulder`（格数） |
| 地形更灰 / 保留更多原色 | `INK_PALETTE.<界>.chroma`（0 = 纯水墨，1 = 原色） |
| 明暗层次 | `INK_PALETTE.<界>.bands`（量化档数）、`cun`（陡坡加深强度） |
| 雾 | `FOG.near / far`（按默认机位标定，改相机要同步） |
| 纸色 | `PAPER` |

素材换风格：改 `tools/gen_art_assets.py` 后 `python3 tools/gen_art_assets.py`，或直接用同名同尺寸的手绘 PNG 替换 `assets/art/` 里的文件（规格见规划书 §9）。

---

## 验证过什么

| 项 | 方式 | 结果 |
| --- | --- | --- |
| 既有门禁（import / core / startup / runtime-events / view / presentation / render3d M0·M1·bridge·M2-A） | 安装到干净树后运行 | 全部通过，**一行测试未改** |
| 新增 12 组不变量 | `npm run test:render3d:art` | 通过 |
| `npm run build` | 打包 | 通过，`assets/art` 随包出货 |
| 真实渲染 | 无头 Chromium + WebGL2（SwiftShader） | 凡间 / 上界窗 / 幽冥窗 / 真实裂缝开口 / 运行时开关，控制台零报错 |

## 没验证的（请你知道）

- **没有在真实 GPU 上量过帧率**。我的环境是 CPU 软渲染（美术开 / 关都约 8 FPS，不能据此得出性能结论）。请用 `test:render3d:perf` 与 `RenderDebug` 面板在你的机器上对比；规划书 §7 写了怎么量。
- **着色器没在 ANGLE / D3D11 / Metal 上验证**。出问题时关掉 `?art` 即回到 M2-A；规划书 §8 R1 有回退方案。
- **没有调过多个种子的观感**。参数是在 1 张种子上定的。
- **没跑** `test:render3d:perf`、`:m2a:browser`、`:m2a:release`（需要真实 GPU / `reports/` 证据文件）。
- **你的 163 张 PNG 我没见到**，所以没有接入任何现有素材。

## 已知限制

- 窗开着时，**标记（含裂缝环）、选中环、FxProbe 仍被隐藏**（M2-A 行为未变，见规划书 B1.1）。
- 窗开着时雕刻仍被禁用（M2-A 行为未变）。
- 3D 里仍然没有真正的划窗手势：调试按钮直接给 `selection` 赋值，**不会开缝**（规划书 B4）。
- 实体仍是方块、树仍是 16×24 像素树，没有重绘（规划书 AP.2）。
- `Vegetation / Settlement / WorldMarker / BrushOverlay / Slab` 仍用全局 `surfaceElevation`；目前只在凡间使用，所以安全（规划书 B0.2）。

## 素材许可

全部由程序生成，无外部图片、字体或第三方素材。
