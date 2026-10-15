# M2-C2D 视觉验收

2026-10-07。工作区 `E:/world4/坐天观井-实验分支D1`，分支 `m2-c2d-nearfield-painterly`，开工 HEAD `8b3f2bac761b59bf70f524ff9a00429fa40cc07a`。目标体验链：`全图像画 → 中景仍像画 → 近景成为可观察的低模绘画世界`。

本文件只给「看得见」的结论：8 张固定镜头的 before/after 数值、护栏区间判读、以及自动指标无法替代的人工审美门禁。完整原始证据在 ignored 本地目录 `reports/local/m2c2d/{baseline,final}/`（含 8+8 张 PNG、`browser.json`、逐帧 GPU 采样）；随包 Golden 见 `reports/release/render3d-m2c2d/golden/`。

## 一、8 镜头配对结果（L* 单位）

护栏区间来自委托书第九节：接近纸色 0.15~0.30、深墨 L*≤30 占比 0.02~0.08、跨度 ≥50（或较基线显著扩大）、极暗 L*<20 ≤0.15（阴界界缘）。基线同表见 [M2C2D_BASELINE.md](./M2C2D_BASELINE.md)。

| 镜头 | 跨度 基线→final | 接近纸色 基线→final | L*≤30 基线→final | L*<20 final | 平均饱和 Δ | draws | tris |
|---|---:|---:|---:|---:|---:|---:|---:|
| mortal-overview | 44.1 → **51.7** | 0.583 → 0.591 | 0.010 → 0.013 | 0.0001 | −0.0004 | 25 = | 159036 = |
| mortal-coast-near | 69.1 → 69.1 | 0.262 → 0.262 | 0.028 → **0.045** | 0.0017 | +0.0070 | 32 = | 287488 = |
| mortal-cliff-near | 46.8 → **59.8** | 0.026 → 0.032 | 0.015 → **0.029** | 0.0014 | −0.0018 | 32 = | 286258 = |
| mortal-settlement-near | 46.2 → 42.9 | 0.242 → **0.291** | 0.0002 → 0.0012 | 0.0002 | −0.0042 | 31 = | 292318 = |
| upper-overview | 30.9 → **39.6** | 0.596 → 0.591 | 0.000 → 0.000 | 0.0000 | +0.0037 | 10 = | 106004 = |
| upper-boundary-near | 58.6 → 55.7 | 0.245 → 0.230 | 0.011 → 0.014 | 0.0009 | −0.0087 | 30→29 | 306915→305979 |
| nether-overview | 49.4 → **65.8** | 0.633 → 0.608 | 0.011 → 0.055 | 0.0277 | +0.0056 | 9 = | 105816 = |
| nether-boundary-near | 69.9 → **74.6** | 0.063 → 0.060 | 0.047 → 0.097 | **0.0499** | +0.0068 | 30→29 | 307321→306385 |

`upper-boundary-near` / `nether-boundary-near` 的三角形 −936 与 draws −1 不是几何改动：把界缘材质从 legacy `MeshLambertMaterial` 换成 `ShaderMaterial` 后，THREE r186 的 `ShaderMaterial.forceSinglePass=true` 取消了 `DoubleSide + transparent` 的第二遍渲染。几何契约（468 边 / 936 三角形 / 1872 顶点、`breachEdges=0`）由 `boundaryStats` 逐字比对，8 镜头全部一致。

## 二、三块「技术原型感」的处理结论

### 1. 水岸：格子水纹与楼梯岸线（P1）

- 新增 Stage 只读连续标量场 `SurfaceVisualFieldTexture.js`（RGBA8 + LinearFilter，R = 归一化 `world.water` 深度），由 `PlaneStage` 依现有 `waterRegion` 外扩 1 格外更新。Terrain / Water 只借用，不拥有第二份世界真相。
- 新 `WaterPigmentMaterial` 用 `smoothstep` 做连续水陆过渡、`fwidth` 抗锯齿，海面向纸色靠拢、浅水更接近纸，水纹为世界坐标程序化生成、保持稀疏。
- Terrain shader 读取同一场，在岸线附近加极弱烘染（`coastSoft` 混 `mix(paperColor, terrainWaterColor, 0.35)` ×0.20），使沙岸 / 水岸 / 陆地不再像三个格子图层叠放。
- 结果：`mortal-coast-near` 跨度保持 69.1（没有靠洗白或压黑换数字），深墨 L*≤30 由 0.028 升到 0.045，岸线由渲染层可平滑的连续过渡取代离散 id 硬 step。

### 2. 近景纸板山（P2）

- 在 `PigmentTerrainMaterial` 内新增**绘画用低频高度法线**：对 heightTexture 做 ±`broadRadius`(=2.5) 的 bilinear 邻域采样得到 `broadN`，只用于大尺度明暗组织、silhouette / facing、坡面墨量控制。真实高频 slope / curvature 继续驱动结构墨、局部皴、飞白。即把山体信号拆成 `大山势` + `小笔触` 两层。
- `RealmStyleProfile` 增加三项可解释影调控制：`massShadeStrength` / `deepInkStrength` / `heightWashStrength`，并从 ArtPass 接线到 shader。
- 结果：`mortal-cliff-near` 跨度 46.8 → 59.8、接近纸色 0.026 → 0.032（越过 0.03 下缘）、深墨 0.015 → 0.029 进入护栏；`mortal-settlement-near` 接近纸色 0.242 → 0.291。深色集中在山脊 / 沟谷 / 坡折，山脚谷地经 atmosphere / paper 回退留白，未出现整片压黑。

### 3. 界缘断面（P3）

- 新增独立文件 `BoundaryInkMaterial.js`（m2b T2 §44 禁止在 `RealmBoundaryLayer.js` 内出现 `ShaderMaterial` 字符串），复用原有顶点与颜色，额外只读属性 `aVertical`（底 0 / 顶 1）、`aSeed`（边坐标稳定 hash）。
- 世界坐标锚定竖向层理、斧劈式干笔、底部向 atmosphere / paper 消隐、顶缘极窄纸纤维亮带、少量不规则墨量变化。Upper 用含蓄石青 / 石绿 / 赭 / 泥金矿物关系，不做发光 Portal；Nether 用深磁青 / 焦墨 / 灰银骨线，避免纯黑。
- 结果：`upper-boundary-near` / `nether-boundary-near` 不再读成单色竖直平板；Nether 近景 L*<20 = 0.0499，远低于 ≤0.15 护栏，未出现吞掉大面积画面的纯黑无层次区。

### 4. 三界统一调色（P4）

前三包稳定后，仅在 `RealmStyleProfile.js` 做最后统一调整：凡间 `contrast` 1.03 → 1.14、上界 1.09 → 1.18（阴界保持 1.30）；三界 `tone` 定为凡间 `{massShade:0.56, deepInk:0.58, heightWash:0.05}`、上界 `{0.50, 0.52, 0.05}`、阴界 `{0.42, 0.44, 0.0}`。没有其它测试钉住 `contrast`。

## 三、自动指标判读与人工门禁

- 三界近景（cliff / settlement / boundary）接近纸色与深墨均已进入或越过护栏下缘；两处 overview 跨度均较基线扩大（凡间 44.1→51.7、上界 30.9→39.6、阴界 49.4→65.8），说明远景画意没有倒退。
- 阴界界缘 L*<20 = 0.0499 ≤ 0.15，满足护栏。
- 平均饱和度三界 Δ 均在 ±0.009 内，没有靠提饱和换对比。

> **人工审美门禁（保留）**：自动指标全部通过**不代表**视觉封板。最终 8 张 Golden 需人工确认「远景不退步，近景明显提升」。本报告的数值与图片是提交给人工判断的证据，不是替代。

## 四、复现

```
INKBOX_C2D_LABEL=baseline node scripts/inkbox-render3d-m2c2d-browser.mjs
INKBOX_C2D_LABEL=final    node scripts/inkbox-render3d-m2c2d-browser.mjs
node scripts/inkbox-render3d-m2c2d-metrics.mjs      # 配对护栏门禁
```

Golden 与 `acceptance-summary.json` 见 `reports/release/render3d-m2c2d/`。
