# Inkbox M0 · 立体沙盘技术报告

## 使用

安装源码依赖：`npm ci`。运行 `npm run dev`，打开 `http://127.0.0.1:4180/inkbox.html?renderer=3d`。
不带参数仍为原有 Canvas。打包产物内包含所需的 Three.js 浏览器模块，解压后可直接运行静态服务器。

沙盘顶部选择检视、抬山、压地、平整、平滑；左键落笔，中键旋转，右键平移，滚轮缩放。
Q/E 每次旋转 45°，F 全图。点击“聚焦选中格”聚焦最后点选位置，玩家相机输入取消聚焦。
Ctrl+Z / “撤销雕刻”撤销最近 12 笔。顶部“切回 Canvas”在同一个 World 上切换，无需重建、读档或重载页面。
幅面、重新开天、读档、存档沿用现有入口。雕刻验收建议先暂停，以便区分人为编辑与自然水文演化。

## 架构与数据边界

- 唯一新增运行依赖：锁定 `three@0.186.1`。未引入 BVH、框架、物理引擎、构建器或额外 FPS 库。
- `src/inkbox/render3d/Render3DAdapter.js` 管理 DOM、输入、同世界切换及旧相机 focus/fit 语义适配。
- `Renderer3D.js` 管理 WebGL 生命周期、场景、图层、轻量诊断与资源释放。
- `WorldRenderBridge.js` 持有只读快照，逐格比较 height/water/type/veg；不借用、清理或修改模拟 dirty 标志。
- Terrain、Water、Vegetation 是派生视图。纯编辑命令 `terrain/sculpt.js` 是此目录唯一正常世界写入入口；撤销仅恢复该笔实际触及的高度格。
- `main.js` 的 M0 接线仅增加 6 行：一个 render 分支和按 URL 动态加载 Adapter。默认 Canvas 不加载 Three.js 模块。
- 原来的 worldgen、World、advance、life、水文、存档格式与 RNG 均未因 M0 重构。

当前工作区还含施工前未提交的 D8 修改。M0 不继续这些功能。旧回归暴露其中 `maybePulseTraceTarget` 方法未实现，工作区调用处已加可选调用保护，避免 Canvas 划选抛错。

## 坐标、高度与网格

`coordinates.js` 是唯一坐标契约：世界整数 x/y 表示格中心，Three X/Z 表示地图平面，Three Y 表示视觉高程。

```text
renderX = worldX - (w - 1) / 2
renderZ = worldY - (h - 1) / 2
cell = clamp(round(renderToWorld(point)), 0..size-1)
d = height - SEA_LEVEL
visualElevation = 38*d + 38*max(0,d)^2
```

SEA_LEVEL 保持 0.3。视觉海平面 Y=0、海床低于 0、高山适度夸张。模拟高程仍是 0..1。
网格拥有 w×h 个共享顶点、2×(w−1)×(h−1) 个三角形，保留真实网格精度；外边缘经过边界格中心。
使用索引 BufferGeometry、MeshLambertMaterial、flatShading 和现有地形类型有限色阶。法线在平面着色路径派生，不做 CPU 全图法线重建。
雕刻按受影响行更新 position/color attribute 范围，不销毁重建 Terrain Geometry。保守包围盒覆盖合法雕刻范围，抬高后拾取不会受旧 bounds 限制。

## 相机与拾取

OrthographicCamera + OrbitControls，360° yaw，polar angle 限制 15°..约 68°，禁止翻到地下。
左键留给沙盘工具。正交 zoom 范围 0.5..18。fit 考虑横竖屏宽高比。
TerrainPicker 使用原生 Raycaster，只命中真实地形，忽略树与水面；水下编辑命中海床格。鼠标、相机矩阵、视口与 position attribute 版本均未变化时复用命中；任一变化立即失效，避免静止悬停持续扫描全图。
笔刷环通过与地形一致的分片三角插值贴合地表；环是编辑提示，允许透过水与植被读出轮廓。

## 雕刻与纯观察

Raise/Lower 使用平滑径向衰减。Flatten 在按下时固定目标高度；Smooth 用同一次 stamp 修改前的 3×3 邻域均值，避免遍历方向偏差。
连续移动按半径的 1/4 插值补点，保持笔迹连续。按住不动每 75 ms 落笔一次。
所有编辑 clamp 到 0..1，仅写 height 并 touch，不推进日期、不写人口、水深、地形类型、植被或其他位面，不抽模拟 RNG。
地形类型暂沿用现有 type；主动雕刻不会立即重新分类气候与生态，这符合本轮 height-only 验收范围。

## 水与树林

WaterLayer 使用现有 `height + water` 推导水面，干格顶点藏在地表之下；透明低饱和色，不建立第二套水文。
海岸由网格插值近似，复杂河湖水面连续性及半透明排序不属于最终美术。
VegetationLayer 用 `hash(seed, cell, salt)` 稳定选择位置、微偏移、大小与旋转，不使用 Math.random 或模拟 RNG。
每树两张交叉像素 Plane，共用程序生成 16×24 DataTexture，NearestFilter、alphaTest、depthWrite；一个 InstancedMesh 批量绘制。
最多 10,000 棵树（20,000 交叉平面实例）。树根用地形三角插值定位。世界变化时至多约每 150 ms 重派生一次树林。

## 性能与验收记录

实测设备：Microsoft Edge 154.0.4258.37 无头 Chromium、Intel UHD Graphics 730 (D3D11)、1500×940、DPR 1。Three.js FPS 在同一绘制请求动画帧下 90 帧平均；另用逐帧变更鼠标位置独立测移动拾取帧时间。指标反映此设备和当前场景，不是所有设备上的承诺。

| 幅面 | 顶点 / 树实例 / 三角形 | 静止均值 FPS | 移动拾取均值 FPS | 原生射线均值 | 桥接扫描均值 | 雕刻+同步 P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 小景 200×128 | 25,600 / 4,670 / 119,772 | 60.0 | 60.0 | 2.7 ms | 0.54 ms | 3.6 ms |
| 中堂 288×180 | 51,840 / 6,775 / 232,592 | 60.0 | 60.0 | 6.0 ms | 0.86 ms | 3.7 ms |
| 长卷 384×240 | 92,160 / 10,000 / 406,148 | 60.0 | 60.0 | 7.4 ms | 0.88 ms | 6.2 ms |

这里“雕刻+同步 P95”包括 24 次笔刷命令、地形/水属性局部更新和提交绘制；CPU Raycast 平均成本独立计时。水和地形各一份整图网格；所有尺寸均为 3 次 draw call。每张地图暂停后 40 帧比较完整 JSON 世界状态，未检出渲染写入。8 个 yaw/pitch 姿态共测试边角、平原、坡地、峰顶、海岸 64 个样本：56 格射线首命中正确、8 格被更靠近镜头的地形遮挡、0 错误命中。精确落在三角形轮廓边缘的浮点退化不作为格内样本；拾取仍遵循真实可见表面。

`reports/render3d/package-browser.log` 是实际发布包运行的 22 项 Edge 检查，`reports/render3d/legacy-browser.log` 的 Canvas 回归通过 144 项。`reports/render3d/unit.log` 的坐标、编辑、确定性、同步、射线缓存等 19 组纯逻辑检查通过。旧模拟测试命令均在分支工作树实际运行，列表与逐项结果如下：

```text
npm test                                      通过（包含 import/core/startup/runtime-events）
npm run test:regression                       通过（22 项）
npm run test:three-realms                     通过（三界生态不变量）
npm run test:save-equivalence                 通过
npm run test:presentation                     通过（127 项）
npm run test:view                             通过（94 项）
npm run test:simulation                       通过（确定性模拟）
npm run test:browser -- --url=http://127.0.0.1:4181/inkbox.html --shots=reports/render3d/legacy 通过（144 项，运行时无错）
npm run test:render3d                         通过（19 组）
npm run build                                 通过（108 文件）
```

浏览器脚本可用已安装 Playwright 运行，设置 `INKBOX_PLAYWRIGHT`、`INKBOX_URL` 可指定依赖路径和静态服务器地址。生成的 small/medium/large/interactive/narrow 页面截图也在 `reports/render3d/`。

## 已知边界与后续建议

- M0 只显示地形、水与像素树林；人物、宗门、建筑、战争、视界及完整 FX 尚未迁入 3D。
- 3D 左侧旧神力栏暂禁用；顶部沙盘工具负责本轮四种编辑。切回 Canvas 后恢复原交互。
- 原生拾取对最大地图仍有毫秒级 CPU 开销；后续应根据实际移动/雕刻性能决定 BVH，而非迁入 Demo 的 Mesh 权威数据模型。
- 整图快照扫描简单可靠，但持续模拟时脏区域可能覆盖整图。仅在 profiling 证明必要时再采用显式变更区域或 chunk。
- 像素树为临时素材，海面为技术验证；视觉方向需用户实际旋转观察后定稿。
- WebGL 初始化失败保留 Canvas；上下文丢失时自动回到 Canvas，恢复后可重新切入。dispose 会释放控制器、监听器、观察器、几何、材质、纹理和 GPU renderer。

## 参考

- [3D-terrain-editor](https://github.com/Ren23447/3D-terrain-editor)：最小交互闭环参考。
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)：拾取加速与雕刻示例参考，未引入依赖。
- [THREE.Terrain](https://github.com/IceCreamYou/THREE.Terrain)：高度场、植被散布及实例化参考。
- [ProceduralTerrains](https://github.com/ZyFou/ProceduralTerrains)：后续分块、LOD 和渲染解耦参考。
- [OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html) / [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)：相机接口。
