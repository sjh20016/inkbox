# M2-C2D 开工真实性基线

2026-10-07。施工工作区 `E:/world4/坐天观井-实验分支D1`，开工 HEAD `8b3f2bac761b59bf70f524ff9a00429fa40cc07a`，分支 `m2-c2d-nearfield-painterly`。本文件是只读测量记录：基线采集时生产源码与开工 HEAD 一致（所有 P1/P2/P3 改动经 `git stash` 暂离工作区后采集），完成本基线提交前不修改生产代码。

## 测量方法

固定 8 镜头，两份 C2C 规范自然世界（凡间 seed 226 / day 72000；三界 seed 20260923 / day 21600）经产品 `#inkImportFile` 导入，不构造临时 fixture。镜头用 `VisualScenarios.applyCamera` 的产品配方，只固定 POI / zoom / polar / yaw，渲染路径与玩家一致（无 inspector 视图）。色彩度量在真实 WebGL 后备缓冲上用 `gl.readPixels` 取 sRGB 字节计算，sRGB→线性后转 L*，每 2 像素抽样。

- 采集脚本：`scripts/inkbox-render3d-m2c2d-browser.mjs`（`INKBOX_C2D_LABEL=baseline`）
- 原始证据：`reports/local/m2c2d/baseline/browser.json`（+ 8 张 PNG + `browser-progress.json`）
- 运行环境：Windows / Edge / ANGLE，viewport 1500×940，DPR 1
- 采集结果：`pass=true`，8/8 镜头，`pendingGlErrors=[]`，`gpuTimingUnavailable=[]`，Edge runtime / console error 0

## 基线指标（L* 单位）

| 镜头 | POI | zoom | L* p2 | L* p98 | 跨度 | L*≤30 | L*<20 | 接近纸色 | 平均饱和 | draws | tris |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mortal-overview | (99.5,63.5) | 1.45 | 46.7 | 90.8 | 44.1 | 0.010 | 0.000 | 0.583 | 0.114 | 25 | 159036 |
| mortal-coast-near | (50,113) | 5 | 21.6 | 90.8 | 69.1 | 0.028 | 0.001 | 0.262 | 0.126 | 32 | 287488 |
| mortal-cliff-near | (142,73) | 5 | 37.6 | 84.4 | 46.8 | 0.015 | 0.001 | 0.026 | 0.127 | 32 | 286258 |
| mortal-settlement-near | (78,16) | 6 | 44.6 | 90.8 | 46.2 | 0.000 | 0.000 | 0.242 | 0.097 | 31 | 292318 |
| upper-overview | (143.5,89.5) | 1.45 | 57.8 | 88.7 | 30.9 | 0.000 | 0.000 | 0.596 | 0.117 | 10 | 106004 |
| upper-boundary-near | (86.5,135) | 3.5 | 32.1 | 90.8 | 58.6 | 0.011 | 0.000 | 0.245 | 0.142 | 30 | 306915 |
| nether-overview | (143.5,89.5) | 1.45 | 34.5 | 83.9 | 49.4 | 0.011 | 0.003 | 0.633 | 0.073 | 9 | 105816 |
| nether-boundary-near | (152.5,45) | 3.5 | 20.8 | 90.8 | 69.9 | 0.047 | 0.018 | 0.063 | 0.104 | 30 | 307321 |

世界身份摘要（`worldSHA256`，前 12 位）：凡间 `c52b086adc76`；三界 overview / upper-boundary `a5895fb168c4` / `0bb6cbcc587f`；nether-boundary `3798831388d5`。8 镜头的完整 `worldSHA256` 与 `advanceStateSHA256` 已逐条记入 `browser.json`，是 final 配对比对的基准。

## 基线诊断（只记录，不改动）

对照 C2D 护栏区间（接近纸色 0.15~0.30、深墨 L*≤30 占比 0.02~0.08、跨度 ≥50、阴界 L*<20 ≤0.15），基线暴露的正是委托书所指的「技术原型感」：

1. **近景纸色亮部缺失**：`mortal-cliff-near` 接近纸色仅 0.026（护栏下界 0.15），崖体是大片中间调，没有「留白 / 高光」把形体从灰面里托出来。
2. **深墨不足**：`mortal-settlement-near` L*≤30 占比 0.000、`mortal-cliff-near` 0.015、`upper-boundary-near` 0.011，均低于 0.02 下界。近景缺少能压住结构的焦墨 / 重墨，明暗层次窄。
3. **明度跨度偏窄**：`upper-overview` 跨度 30.9，是全场最平的一屏，远景本身已有山水画意、不在本轮改动范围，仅作回归守卫。
4. **海岸线为「工程网格边」**：水陆交界依赖离散地形 id 的硬 step，`mortal-coast-near` 跨度虽高（69.1）但过渡是台阶而非渲染层可平滑的岸线（P1 处理对象）。
5. **界缘为「工程墙」**：`upper-boundary-near` / `nether-boundary-near` 的断面在基线里主要靠几何面本身的 Lambert 明暗，没有竖向层理、斧劈干笔、底部溶入纸面（P3 处理对象）。

以上 1~5 项由 P1（水面/岸线连续场）、P2（近景低频绘画法线 + 有限影调控制）、P3（界缘断面墨材质）、P4（统一调色）分别承接；基线本身不做任何美术改动。

## 采集复现

```
INKBOX_C2D_LABEL=baseline node scripts/inkbox-render3d-m2c2d-browser.mjs
INKBOX_C2D_LABEL=final    node scripts/inkbox-render3d-m2c2d-browser.mjs
node scripts/inkbox-render3d-m2c2d-metrics.mjs   # 配对比对，写 reports/local/m2c2d/metrics-gate.json
```

baseline 目录 8 张 PNG 的 `imageSha256` 与完整镜头参数见 `browser.json`；本文件不含二进制证据。
