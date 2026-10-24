# 山海遗迹 V0.1 · 金石遗构，四境入画

独立低模资产与浏览器展厅。开工基线为 GitHub 连接器于 2026-10-24 核实的正式 `main@dbcd46c33090e6345ee881e92caf2a7fb5de7de9`；本地同 SHA 创建隔离 worktree 与 `feat/art-shanhai-ruins-v01`。Git 直连在当前环境失败，未将旧开发分支当作 main。所有交付集中在本目录，不接入 G7、正式 World、模拟、存档、环境库或发布清单。

## 启动与使用

在仓库根目录运行：

```sh
npm run dev -- --port 4197
```

打开 [独立展厅](http://127.0.0.1:4197/research/shanhai-ruins-v01/index.html)。使用仓库已提交的 Three.js 与原静态服务器，不需要安装新依赖。更换端口时同步调整 URL。

四类资产独立切换；废墟有残破、荒废两态，祭坛有遗存、枯竭两态。可选择三界配色、三档实际几何或自动 LOD、平涂/三渲二/实体/线刻对比、轮廓与受光。单体、游戏比例、远景、压力观察分别用于造型、比例、缩略识别和实例成本检查；总览与同构图风格对照用于横向判断。拖动旋转、滚轮缩放、预置镜头与重置镜头支持多角度检查。加载/卸载用于检查资源生命周期。

## 资产与接口

| ID | 造型与状态 | 未来可能绑定的真实对象 |
| --- | --- | --- |
| `shanhai.sect.gate` | 仙门山门：悬挑屋脊、窄高门洞与剑形侧碑 | 已存在宗门及其真实驻地 |
| `shanhai.settlement.ruin` | 城镇废墟：缺顶断墙、负空间；残破/荒废 | 已存在聚落、房屋的损毁事实 |
| `shanhai.leyline.altar` | 灵脉祭坛：断环、放射刻纹与中央石台；遗存/枯竭 | 待后续确认的古阵、遗迹或装饰；不代表每条灵脉都有祭坛 |
| `shanhai.nether.remnant` | 幽冥遗址：不连续门框、偏置立石与线刻 | 幽冥装饰候选或未来正式遗址 |

这些 ID 仅属于预览库，不创建宗门、人口、灾害、遗迹身份、法宝或数值增益。参照人物与屋舍是固定比例样例，无世界语义。

`src/geometry.js` 为几何工厂，`src/materials.js` 管理独立语义调色材质，`src/ruinsLibrary.js` 管理缓存、批次与释放；`assets/manifest.json` 记录坐标、包围盒、状态、LOD、语义及未来适配边界。Y-up、地面中心枢轴，朝向与具体尺寸以 manifest 为准。

```js
import * as THREE from '../../vendor/three/build/three.module.js'; // 按调用文件位置调整
import { createRuinsLibrary } from './src/ruinsLibrary.js';
const library = createRuinsLibrary();
const batch = library.createBatch({
  id: 'shanhai.sect.gate', state: 'weathered', lod: 0,
  realm: 'upper', style: 'toon', light: 1, outline: true,
  matrices: [new THREE.Matrix4()],
});
scene.add(batch);
// 批次借用库的几何与材质；先销毁批次，再销毁库。
scene.remove(batch);
batch.userData.dispose();
library.dispose();
```

同状态、LOD 的实例共享合并几何与材质；不在每帧重建建筑。不依赖 PBR 贴图、透明叠层、粒子、全屏描边或实时反射。8×8 UV 语义格与 28 槽映射保留迁移路径；程序化工厂为交付模型源，无需 GLB 才能复用。

| 单个完整组合体 | LOD0 | LOD1 | LOD2 |
| --- | ---: | ---: | ---: |
| 仙门山门 | 192 | 64 | 16 |
| 城镇废墟·残破 | 180 | 76 | 20 |
| 城镇废墟·荒废 | 164 | 72 | 20 |
| 灵脉祭坛·遗存/枯竭 | 188 | 84 | 16 |
| 幽冥遗址 | 148 | 52 | 16 |

每种组合一个 InstancedMesh，共享一个材质；开启轮廓增加一个合并 LineSegments draw。轮廓线缓冲按实例数展开，draw 数固定不代表缓冲字节固定。`library.stats()` 分别报告缓存几何、批次轮廓、实例矩阵字节，并将三者计入总缓冲占用。实例矩阵每个 64 字节；轮廓无贴图。材质按位面/风格/受光惰性缓存，最多 108 个预设组合加一个共享线材质；单批次仅引用一个实体材质。

## 验证

```sh
node research/shanhai-ruins-v01/tools/check-assets.mjs
node research/shanhai-ruins-v01/tools/check-isolation.mjs
```

真实 WebGL 检查入口为 [browser-check.html](http://127.0.0.1:4197/research/shanhai-ruins-v01/tools/browser-check.html)，在一个 renderer 上串行检查资产、状态、LOD、配色、材质、实例与释放。页面明确报告失败，不以 Node 几何检查替代浏览器。

展厅显示的 `renderer.info.render.calls`、`triangles` 和 `lines` 是实际提交统计；几何/纹理计数不是显存字节。CPU 生成、矩阵更新、render 提交和 RAF 间隔分别计量，不等于 GPU 执行时间。1/32/128 是测试实例数，不是正式世界投放预算。本轮不运行全图模拟长跑或宣称正式大地图性能通过。

自动 LOD 使用固定的 LOD0 包围尺寸，45/65 与 130/170 像素滞回区避免在阈值两侧重复切换。四境总览和风格对照共用观察参数；同类压力场景为固定间隔摆放，非真实世界生成。静止画面按需 render，RAF 间隔不能当作持续渲染 FPS。

### 实测结果与视觉证据

2026-10-24，Windows / 应用内 Chromium 156 / WebGL 2 / Intel UHD 730（ANGLE D3D11）/ DPR 1。Tabbit 稳定入口返回注册失效，故使用应用内浏览器；没有将 Node 检查冒充浏览器验收。`check-assets.mjs`、`check-isolation.mjs` 均 exit 0。完整正式游戏 Fast/Heavy 留给现有 CI，本地未运行无关模拟长跑。

真实浏览器通过 648 组状态、LOD、配色、风格及受光渲染；1/32/128 个山门 LOD0 分别为 192/6144/24576 个三角面，开启轮廓均 2 draws。6 次批次资源循环、6 次展厅加载/卸载，以及祭坛两态 × 6 个缩放下的自动 LOD 稳定性通过；完全卸载后 renderer 几何/纹理计数为 0/0。详细有限样本见 [browser-validation.json](./previews/browser-validation.json)。首轮压力测试误将线段计入 triangle 期望值，已改为三角面与线段分别断言并重跑通过，未降低预算。

浏览器真实按钮操作检查了资产切换、损毁/枯竭状态、风格、LOD、镜头、轮廓开关、四种观察模式、128 实例；检查 1536×1024、1366×900、390×844 布局。窄屏风格按钮整行呈现，避免“三渲二”意外换行。模型正面/侧面/背面/顶视已查看，没有发现背面消失或底部悬空；严格侧视时门柱重叠是实际结构投影，斜俯更有辨识度。

每组实际运行截图为 `previews/{gate,ruin,altar,nether}-{normal,game,styles}.jpg`；另有 [四境总览](./previews/overview.jpg)、四方位总览、两种额外状态、[128 实例](./previews/stress-128.jpg) 和 [窄屏](./previews/mobile.jpg)。

设计依据为内置 ImageGen 生成的 [完整界面概念](./previews/design-concept.jpg)，提示见 [design-brief.txt](./previews/design-brief.txt)。已用 `view_image` 对照概念与最新浏览器截图，核对如下：

| 对照点 | 最终处理 |
| --- | --- |
| 布局 | 保留标题横带、四资产导航、左三维画布/右设置栏；桌面辅助统计内部滚动 |
| 色彩 | 保留纸色 #f3efe4、墨色 #303b38、朱色 #a54c36，无材质噪声 |
| 字体层级 | 宋体标题与现代中文控件；增重标题，修正初版过小的主要控件 |
| 文案/导航 | 主标题、四资产类别、四观察模式与概念一致；新增委托要求的状态、受光、资源与总览入口 |
| 模型与空间 | 真实低模取代概念中超过预算的砖石细节；修正首屏过远镜头和祭坛中景丢失立石 |
| 对照与响应式 | 同一相机比例下横向排列四风格，手机上下排列画布/控件，未出现横向溢出 |

有意偏离：概念图的装饰性缩略图省略，几何细节服从 120–240 面近景预算；实际数值替换概念示意数值；额外功能使用已有布局容纳。这是可运行三维资产交付，不以概念图替代模型。幽冥线刻为浅实体、深墨承重块与几何细线组合，不是透明线框或全屏后处理。

已知边界：极远景会丢失雕刻/门匾，线刻细线在小于数像素时会消失；轮廓 CPU 缓冲随实例数增长；仅验证上述 Chromium/GPU，不声称跨浏览器、正式 G7、地形落点或整机性能验收完成。

## 正式接入边界与回退

后续需单独审核世界对象绑定、真实尺度、地形贴地、Region/Mask、拾取身份、固定容量与正式发布预算，再转换或注册到正式环境库。不得直接把展厅样例接入 World。

本轮仅提交独立 Draft PR，未经后续授权不合入 main。放弃该候选不会影响正式游戏；若未来接纳，可正常 revert 本目录的提交，不重写历史。
