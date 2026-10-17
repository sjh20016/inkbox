# 卜算子 · 模型与运行时接入说明（T2）

> 资产：`assets/characters/busanzi/`　运行时：`src/inkbox/render3d/busanzi/`
> 本轮来源：`buzuanzi.zip`（解压自 `资产/_extracted/buzuanzi/buzuanzi/`）
> 校验：`node scripts/inkbox-busanzi-check.mjs`、`node scripts/inkbox-busanzi-browser.mjs`

## 1. 来源与哈希（可追溯）

| 项 | 值 |
| --- | --- |
| 来源 ZIP | `buzuanzi.zip` |
| ZIP SHA256 | `8C92A7F67B68EC7DD3EC70F2462980FF5C6EBD85F564AEE8C3ECCA8FF3606657` |
| 原始 GLB | `buzuanzi.glb`（316,528 B） |
| 原始 GLB SHA256 | `F90F400D60B3B16BCD3D67F4619D915D54657F2571C55F0BDA2970076257A554` |
| 原始调色板 | `Textures/buzuanzi_palette.png`（149 B，20×1 RGBA） |
| 原始调色板 SHA256 | `394FDDB1C5A40CDFE1A0595BF9D698C7760E9B6E37435E65F436918074D48597` |
| 原始 manifest SHA256 | `77778B8E7B59F975A7D3F3795A6ADA23A3B3F96EAE9E658942A0C4B97F55C1D6` |

落地文件（字节未改，只搬位置）：

| 仓库路径 | 说明 |
| --- | --- |
| `mesh/busanzi.glb` | 与原始 GLB 逐字节一致（GLB 自包含：图集内嵌） |
| `materials/busanzi_palette_20.png` | 与原始调色板逐字节一致（同时用于结构校验的“外部 ↔ 内嵌”比对） |
| `materials/busanzi_portrait.png` | **由本仓库浏览器脚本从真实模型渲染**的透明底肖像（456×576），面板入口使用 |
| `data/busanzi_manifest.json` | 运行期清单（调色板/骨骼/网格/动画/来源）；`scripts/inkbox-busanzi-check.mjs` 与库都读它 |
| `preview/` | 看板 / 游戏内 Viewer / 肖像截图（**不进运行包**，仅验收证据） |
| `docs/BUSANZI_MODEL_SPEC.md` | 本文件 |

重生成资产：解压包内 `tools/build_buzuanzi.py`（只依赖 numpy/Pillow，无随机数）；
**本仓库不依赖它运行时**。重生成后替换 `mesh/busanzi.glb` 前先跑结构校验，确认
38 骨 / 前 16 骨与修士库一致 / 1534 面 / 20 色 UV 未被改动。

## 2. 模型规格（实测，不是作者自报）

| 项 | 数值 |
| --- | --- |
| 三角形 | **1534** = 身体 714 + 头发 182 + 符纸 50 + 饰物与铃 330 + 伞 258 |
| 网格节点 | 5 个 `SkinnedMesh`：`buzuanzi_body` / `buzuanzi_hair` / `buzuanzi_talisman` / `buzuanzi_accessories` / `buzuanzi_umbrella`；根节点沿用 `cultivator_rig` |
| 骨骼 | **38** = 修士库共享 16 骨（root/pelvis/spine/head/四肢…）+ 22 根附加骨（符纸 3、铃 3、头发 6、衣摆 6、袖片 2、红内袖 1、伞 1） |
| 蒙皮 | 全部刚体蒙皮：每顶点 1 根骨、权重 1（与修士库一致） |
| 材质 | 1 个材质 + 1 张 20×1 调色板（GLB 内嵌 PNG），采样器 **最近邻**、`CLAMP_TO_EDGE` |
| 调色板 | 20 色；UV = `(index + 0.5) / 20`，v = 0.5。0–11 与修士库 12 色相同，12–19 为符纸枯黄/铜铃/灰白/鲜赭红/淡灰/深泥褐/铜高光/符纸暗边 |
| 动画 | `Idle`、`Walk`、`Wind`；各 **70 通道**（48 身体 + 22 附加骨旋转），时长 **1.375 s**（=33/24，24fps，STEP 步进风格） |
| 关键帧 | 身体通道多为 2 帧（沿用修士库），附加骨各 33 帧。`Idle`/`Walk` 的 48 个身体通道与仓库内修士库 GLB **逐字节一致**（目标/插值/关键帧数据）；`Wind` 的 16 骨身体通道 = `Idle`，只有 22 根附加骨在动 |

### 为什么不能并入 `CharacterLibrary`

1. 修士库的 palette 校验是 **8–12 色**（12 格宗门图集，UV `/12`），卜算子图集是 **20 格**（UV `/20`）；
2. 修士库是“模块化组合 + 摊平 geometry 交给 InstancedMesh 的静态批次”，卜算子是一具固定角色，
   必须保留 `SkinnedMesh + Skeleton` 交给 `AnimationMixer`；
3. 修士库一个世界成百上千实例，卜算子永远只有一具。

⇒ 单写 `BusanziLibrary`（见 `src/inkbox/render3d/busanzi/BusanziLibrary.js`）。

## 3. 运行时接入

### 3.1 `BusanziLibrary.js`（加载 / 材质 / 动画片段）

- `loadBusanziLibrary()`：fetch `data/busanzi_manifest.json` + `GLTFLoader.loadAsync(mesh/busanzi.glb)`；
- 构造时校验（不满足就抛错，由调用方兜底）：调色板 20 色、5 个节点都是 SkinnedMesh、
  skin 属性齐全、共享单材质单贴图、38 骨且与 manifest 同名同序、每个片段的 70 通道、
  每个网格的 UV 都落在 `(i+.5)/20` 色格中心、面数与 manifest 一致；
- 用 `MeshLambertMaterial({ map: 内嵌图集, flatShading: true })` 替换 GLB 原材质
  （与修士模型同一套写意水墨观感），贴图强制 `NearestFilter`、关 mipmap；
- 暴露 `scene` / `animations` / `clip(name)` / `mesh(id)` / `skeleton` / `getBounds()` / `metrics()` / `dispose()`；
- `dispose()` 释放：几何、材质、内嵌贴图（含 `ImageBitmap.close()`）、清空引用；**幂等**。

### 3.2 `BusanziViewer.js`（独立模态小窗）

- 独立 `THREE.WebGLRenderer` + `OrbitControls` + `AnimationMixer`，DOM 覆盖层样式自包含；
- 按钮 **Idle / Walk / Wind**（`crossFadeTo` 0.22–0.24 s）；「风起」是**可演示的风起**：
  播 Wind，约 **2.75 s** 后自动淡回 Idle。仓库没有风力事实，因此**不伪造天气/风级机制**；
- 首开按需加载（第一次点开才 import three / 拉 GLB）；加载失败只在小窗内报错 + 一条提示，
  游戏照常跑（不抛到帧循环、不阻断 Canvas）；
- 关闭路径：✕ 按钮 / 点遮罩 / **Esc（捕获阶段先吃掉，不传给游戏的 Escape 分层）**；
- 关闭时销毁：mixer（`stopAllAction`/`uncacheRoot`）、灯光与接触阴影的几何/材质/贴图、
  `renderer.dispose()` + `forceContextLoss()`、library 全量 dispose、DOM 移除；
- 换世界 / 读档 / 导入 / `pagehide` 都走同一条关闭路径。

### 3.3 `BusanziViewerHost.js`（游戏侧懒加载门面）

- `main.js` 启动时**只** import 这一小段（无 three）；第一次 `open()`/`play()` 才动态
  `import('./BusanziViewer.js')`；
- 实例挂在 `window.inkbox.busanziViewer`：
  - `open()` → `Promise<boolean>`
  - `play('Idle'|'Walk'|'Wind')` → `Promise<name|false>`（必要时自动 open）
  - `close()`、`state`（`{opened, loading, ready, activeClip, error, clips}`）、`metrics()`
- `window.inkbox.busanziViewerReady`：可等待状态（`await` 得 true/false；从未打开返回 false，
  **不会**因此触发加载）。

### 3.4 游戏界面接线（最小改动）

| 文件 | 改动 |
| --- | --- |
| `inkbox.html` | `#inkBusanzi` 标题下、亲缘 meter 左侧新增肖像入口 `#inkBusanziPortrait`（真实模型渲染 PNG）+ 相关 CSS；折叠时 `.busanzi-bodyrow` 收起 |
| `src/inkbox/ui/railPanels.js` | 新增 `bindBusanziPortraitPanel(sb)`：点击走 `sb.openBusanziViewer()`；PNG 缺失时隐藏入口。原 `refreshBusanziPanel` / `bindBusanziTogglePanel` / `syncBusanziCollapsedPanel` 语义未改 |
| `src/inkbox/main.js` | import 门面；构造器建 `this.busanziViewer`；`bindEvents()` 里绑肖像；新增 `openBusanziViewer()` / `closeBusanziViewer()` / `busanziViewerReady`；`newWorld` / 读档 / 导入三处换世界时关闭小窗 |
| `busanzi-lab.html` + `src/inkbox/render3d/busanziLab.js` | 资产看板：真实 GLB、三动画切换、调色板条、`window.busanziLab = { ready, errors, clips, play(name), metrics(), probe(), capturePortrait() }` |

Canvas 与 `?renderer=3d` 两种模式都能从面板打开 Viewer；Viewer 用自己的 WebGL 上下文，
关闭即销毁，不碰主 renderer 的上下文与资源。**世界模拟 / 存档字段零改动**（打开/关闭只读 world）。

## 4. 肖像与截图（可复现）

```powershell
node scripts/inkbox-busanzi-check.mjs                  # 结构验收（GLB/PNG 字节）
node scripts/inkbox-busanzi-browser.mjs                # 真实浏览器：看板 + 游戏 Canvas/Three
BUSANZI_WRITE_PORTRAIT=1 node scripts/inkbox-busanzi-browser.mjs   # 强制重渲面板肖像 PNG
```

- `materials/busanzi_portrait.png`：由 `busanziLab.js` 的 `capturePortrait()` 用**同一具模型**、
  独立透明底 renderer 渲染（456×576，Idle 第 0.6 s 姿态）；不是手绘立绘，也不是截图裁切。
- `preview/`：`lab_idle/walk/wind.png`（看板三动画）、`portrait_bust.png`、`portrait_full.png`、
  `portrait_wind_peak.png`、`viewer_idle/walk/wind.png`（游戏内小窗）、`viewer_in_3d.png`、
  `game_3d_after_viewer.png`。
- `data/structural_validation.json` / `data/runtime_validation.json`：两次验收的实测摘要。

## 5. 验收覆盖（脚本断言摘要）

结构（`inkbox-busanzi-check.mjs`）：

- 38 骨且与 manifest 同名同序；前 16 骨与仓库内修士库同名同序、**前 16 个 inverseBindMatrices 逐字节一致**；
- `Idle`/`Walk` 48 个身体通道（目标/插值/关键帧）与修士库**逐字节一致**；
- `Wind` 48 个身体通道 = `Idle`；22 根附加骨在每个片段里都有 STEP 旋转通道；
- 3 个片段：名称、1.375 s、70 通道、STEP 插值、四元数单位化、时间单调；
- 5 个网格：面数 714/182/50/330/258 = **1534**、索引/法线/单骨刚性权重、UV 全落 20 色格中心且 v=0.5；
- 单材质 + 单贴图 + 内嵌 PNG；外部 `materials/` 调色板与内嵌图集逐字节一致，PNG 像素与 manifest 色表逐格一致；
- manifest 与 GLB 实测一致；来源 zip / GLB / 调色板 sha256 写进 manifest；
- 用合成骨架跑真实 `BusanziLibrary` 构造 / `clip()` / 拒绝 12 色 / `dispose()` 幂等。

浏览器（`inkbox-busanzi-browser.mjs`，Edge + CDP + 真实 GPU）：

- 看板：真实 `busanzi.glb` + manifest 加载、38 骨 / 1534 面 / 20 色最近邻、三动画依次播放且 mixer 在跑、截图；
- **风起可见**：`talisman_1` / `hair_back_1` / `hem_f` / `sleeve_flap_l` 的世界四元数相对 Idle
  明显改变（实测 ~0.13 / 0.81 / 0.66 / 0.63 rad），身体骨 `l_upperleg`/`spine` 不变；
- 游戏 Canvas：面板显示、肖像 PNG 可加载、点击开 Viewer、Idle/Walk/Wind、风起 2.75 s 自动回 Idle、
  Esc 关闭并移除 DOM、`ready()` 关闭后为 false、**开关前后 world 快照完全不变**、
  折叠/展开仍可用、换世界自动关闭；
- 游戏 Three：3D 模式下同样打开/关闭 Viewer，主 renderer 上下文不丢、几何/贴图计数不累积、无控制台报错。

## 6. 已知限制（如实记录）

- 动画是 24fps **STEP 步进**烘焙（资产风格），风起时符纸/发丝会有一格一格的顿挫感；
- 风起时侧发、衣摆可能与袖子轻微穿插；伞跟手走，个别姿态伞杆可能穿身（资产 README 已注明）；
- 调色板颜色以 three.js Lambert + 看板光照为准，与资产作者预览渲染器会有明暗差异；
- 嘴/鼻/眼是作者按“符纸遮面、风大时略露”设计的，本仓库不做二次改脸；
- 没有真实天气/风力系统，因此「风起」只是按钮触发的演示姿态，不写天气状态、不进存档。
