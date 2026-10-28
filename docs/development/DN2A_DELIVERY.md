# D-N2A「叠狱成形」交付记录

2026-10-29。开工与交付前均重新 fetch：`main@bd62ade03c56908ce5942f7100d6b5cb2bc38934`；D-N1 [PR #56](https://github.com/sjh20016/inkbox/pull/56) 仍为未合并 Draft，HEAD `0c5c3b67f026313227d68b15a4e9762216b00af7`。本分支 `feature/d-n2a-nether-strata` 从此 D-N1 HEAD 建立，PR base 为 `feature/d-n1-nether-landscape`，不自动合 main。实现文件的 SHA-256 与实测来源见 [验收数据](./dn2a/acceptance.json)；最终 Git HEAD 与 CI 以交付 Draft PR 为准。

## 实际交付与入口

- [叠狱展厅](../../research/nether-strata/index.html)：四种画幅、无符号整数种子（含 0）、D-N1 / D-N2A 地貌对照、独立崖壁开关、D-N1 brush / 叠狱 / 简洁线稿、三处地标、远中近镜头、更新/提交/RAF P95、draws、三角面与几何/纹理读数。
- `world/netherStrataCandidate.js`：独立 `dn2a-strata-1` 候选；`generateNetherStrataCandidate({preset,seed})` 返回真实 World，`getNetherStrataMetadata(world)` 返回冻结的构图家族与真实地貌样点。元数据只在 WeakMap，不写存档。
- `render3d/nether/NetherCliffLayer.js`：单 draw、共面真实坡面几何，三族笔触、Region 裁剪和完整 Stage 生命周期。表面块面由真实高度与叠狱材质负责，几何层添加断续层理/稀疏裂隙，避免不连续的灰色外壳产生三角缺口。
- `ShanhaiStyle.js` 的显式 `strata` 变体：骨白台面、灰墨岩体、低处积墨，关闭密集顺坡皴笔与反壳轮廓；保留长崖缘/主脊结构线。正式默认仍为 D-N1 brush。

```sh
npm ci
npm run dev -- --port 4262
# http://127.0.0.1:4262/research/nether-strata/index.html
npm run test:dn2a
npm run test:dn2a:browser
```

可用 URL 参数 `?seed=42&size=expanse&version=strata&ink=brush&cliffs=off` 固定对照。浏览器脚本默认端口 4261，可设 `INKBOX_URL` / `INKBOX_REPORT_DIR`；`--smoke` 只跑页面与三个地标，`--skip-perf` 只跑功能。

## 三种地貌如何形成

**断狱台地**：低幅底噪上叠加三组不规则多边形抬升区；种子扰动的 9 顶点轮廓包含凹角，并经低频域扭曲打破规则边缘。以多边形有符号距离控制窄过渡，不做全图等高量化。不同抬升量形成高/中/低层，台内保留低幅起伏与大块留白。

**墨骨绝壁**：台地窄边缘与方向性断层共同制造落差，局部裂谷将其切断。真实高程最高约 1.24，最低约 .06，经原 `ElevationField` 映射约 -9～56，处于既有地形包围盒内。主崖地标由真实高差扫描选在上沿。崖壁层筛选连续陡坡 quad、过滤孤立小段，复用 `quadIndices` 与格点高程；优先较大落差，单批上限 19,000 三角形。没有另造垂直外壳、地下地面、拾取公式或 Marching Cubes。

**无间深渊**：在高台内部切入 8 顶点的不规则深陷区，并用开放裂缝接向外部低谷；河道沿真实低处穿过，局部保留次级台面。深处用现有材质低高程积墨和阴雾弱化细节，未加全屏体积雾。深渊巡境提高俯角，以观察入口、内壁与下层空间。

三种内部构图家族为断崖横列、裂谷纵贯、台地错落。种子哈希控制轮廓扰动、域扭曲、方位、台地位置及黄泉局部曲折。四邻黄泉保持单连通；台地不改变真实湿域判据。`height/water/type/veg/moist/temp/riverBase/qi/over` 只在新建候选内部填充和重算，语义沿用 D-N1（veg 为阴气）；无实体生成或运行期随机抽签。

## 代码边界与技术取舍

复用 D-N1 的真实 World / Render3DHost / PlaneStage / CameraRig / TerrainMesh / ElevationField / TerrainLineArt / 黄泉与阴雾。空的隐藏凡间 World 只提供既有 Host 的位面所有权；没有第二套 Three 地形引擎或世界时钟。

共享修改仅为：`PlaneStage.js` 的显式 opt-in、Region/高程脏变更/释放接线；`ShanhaiStyle.js` 的新变体；`PigmentTerrainMaterial.js` 的默认 0 参数与条件着色；CI 增加 `test:dn2a`；打包显式加入三文件展厅和三个测试脚本；README/HANDOFF/测试入口链接。`TerrainLineArt.js`、高程数学、三角拓扑与拾取源码均未改。

`World.js`、`advance.js`、`save.js`、`main.js`、`worldgenNether.js`、正式人口/鬼修/身份/存档协议均未改。正式 Stage 不主动分配崖壁层；只有展厅调用 `setNetherStrataEnabled(true)`。候选不调用保存或模拟推进。旧档继续旧生成器；高台超过 1 的候选高程尤其不能直接走现有产品量化保存路径。

崖壁保持与原地面三角形完全共面，用 polygon offset 处理覆盖，raycast 为空。单 draw、无新增纹理；按实际坡面和高低差派生层状/破碎/深渊参数。横层理和裂隙锚定世界坐标，使用导数抗锯齿、按画面尺度渐淡。普通帧不找断层或重建拓扑；只在生成、高程剖面/地形或 Region identity 改变时重建，停用期间延迟重建。资源归 Stage，换 World/退出释放。

已核对委托书的参考项目：[THREE.Terrain（MIT）](https://github.com/IceCreamYou/THREE.Terrain)、[Mapgen4（Apache-2.0）](https://github.com/redblobgames/mapgen4)、[FastNoiseLite（MIT）](https://github.com/Auburn/FastNoiseLite)、[d3-contour（ISC）](https://github.com/d3/d3-contour)、[Simplify.js（BSD-2-Clause）](https://github.com/mourner/simplify-js)。本轮借鉴区域距离场/域扭曲的思路，相关小型哈希、距离计算及几何筛选自行编写，未复制/移植这些项目源码，未新增依赖。选择格网共面方案避免等值线外壳与权威拾取发生冲突，因此未引入 Contour/Simplify 的源码或运行库。

## 真实浏览器验收

最终 `reports/local/dn2a/final/acceptance.json`：**12/12 通过，运行/资源错误 0**。Edge 156.0.4314.50 / AMD Radeon 610M / ANGLE D3D11 / DPR 1。Browser 插件未提供，沿用仓库独占 Edge/CDP 流程；最初受沙箱限制的启动失败保留在工具记录，后续在授权执行环境完成。功能包括页面身份/非空/WebGL、三处原生巡境、崖壁开关不改世界/不重复重建、同机位三档笔墨、四种画幅、种子 0、1440×900 / 768×900 / 430×900、重复 Host 替换资源有界、退出资源释放。自有浏览器进程与临时 profile 清理完成。

随后补齐展厅自身的右键平移绑定（正式游戏由外层控制器接管该手势，独立展厅直接复用 OrbitControls），`--controls-only` 原生右拖/中拖/滚轮检查通过、错误 0。该次只有输入绑定变动，渲染/生成源码与性能捕获的 SHA-256 相同；当前 `finalSource`、控制证据与捕获时 `source` 均保留在验收数据，未混称为同一次运行。全景截图同步采用这次最终原生输入版页面。

截图均为原生浏览器 JPEG；九张精简证据约 1.1 MB，无概念图或后期拼图。其余截图、初版对比、原始数据与命令日志留在 ignored `reports/local/dn2a/`，不进入运行包。

| 画面 | 真实截图 |
| --- | --- |
| D-N1 全图，种子 20260914 | [基线](./dn2a/dn1-full-20260914.jpg) |
| D-N2A 全图，种子 20260914 / 42 | [裂谷纵贯](./dn2a/strata-full-20260914.jpg) / [台地错落](./dn2a/strata-full-42.jpg) |
| 三处地貌 | [断狱台地](./dn2a/strata-plateau.jpg) / [墨骨绝壁](./dn2a/strata-cliff.jpg) / [无间深渊](./dn2a/strata-abyss.jpg) |
| 同一机位笔墨对照 | [D-N1 brush](./dn2a/same-camera-brush.jpg) / [叠狱](./dn2a/same-camera-strata.jpg) |
| 512×320 全景 | [广境](./dn2a/strata-expanse.jpg) |

## 同机成本

相同种子 20260914、画幅、相机参数（数据逐项验证一致）、DPR 和景物选项。每画幅顺序 **A/B/C/D/D/C/B/A**，每窗预热至少 120 RAF、采样 120 RAF；下表为两窗 P95 的范围。A=D-N1 地貌+brush；B=叠狱地貌+brush；C=B+崖壁；D=完整叠狱笔墨+崖壁。B/C 的差值隔离崖壁成本；D 同时减少皴笔与反壳轮廓，不能把它与 A 的差别全归功于几何层。

| 画幅/模式 | 更新 CPU P95 ms | 提交 CPU P95 ms | RAF P95 ms | draws | 三角形 | 几何/纹理 |
| --- | --- | --- | --- | --- | --- | --- |
| 288×180 A | .7–1.0 | .7–.8 | 16.8 | 69 | 231090 | 26/7 |
| 288×180 B | .8–1.0 | .7–.9 | 16.8–22.2 | 62 | 246886 | 26/7 |
| 288×180 C | .8–.9 | .7–1.0 | 16.8–22.3 | 63 | 254592 | 27/7 |
| 288×180 D | .8 | .6–.7 | 16.8 | 62 | 136676 | 27/7 |
| 512×320 A | 1.6 | .6 | 22.3 | 56 | 680506 | 24/7 |
| 512×320 B | 1.5 | .6 | 27.8–27.9 | 56 | 718084 | 24/7 |
| 512×320 C | 1.4–1.6 | .6 | 27.8 | 57 | 731724 | 25/7 |
| 512×320 D | 1.5–1.7 | .6 | 22.3 | 56 | 378714 | 25/7 |

16 个采样窗的 >50 ms 间隔均为 0。新增崖壁为 **1 draw / 1 BufferGeometry / 0 Texture**；该种子中卷 7706 面、广卷 13640 面，三个规定种子的广卷为 13358–15934 面。几何属性有界在 19000×3×32 字节以内（约 1.74 MiB，不计临时 CPU 构建数组）。空闲帧新增全图扫描/拓扑重建为 0，由定向测试钉住。

这是有限的只读展厅样本，不代表整体游戏性能封板、稳定 60 FPS 或跨设备结论；没有 GPU timer query 执行时间，CPU 提交不冒称 GPU 耗时。未重新跑 800 年数值研究、600/6000 帧 GPU 耐久或多设备矩阵。

## 测试与当前局限

本地退出码 0：`test:core`、`test:render3d`、`test:r1`、`test:three-realms`、`test:save-equivalence`、`test:dn1`、`check:ui`、`test:dn2a`、`test:dn2a:browser`、`build`、`test:package`。长回归在未变更的模拟/保存源码上运行，之后只改候选渲染；Fast/Heavy 未删减，新增 D-N2A Fast 门禁。远端 CI 状态以本 Draft 当前 HEAD 为准，不用 D-N1 的历史成功代替本次结果。

候选测试覆盖四画幅 × 七种子（0/1/42/20260914/有符号边界/0xffffffff）、全部生成字段确定性、有限高度、三层面积、主崖高差、深渊入口、四邻黄泉与陆地碎片、9×6 低频高度差、禁用 Math.random 的生成；几何测试覆盖合法非退化面、实际中/广卷预算、Region 内外、CPU 高程与网格三角形一致、停用/重启、闲帧、换 World/Stage 释放。

美术上已经从 D-N1 连续山脊变为高台/大片陡壁/开放深陷。保守高度场近景仍有格网折面，切缝交会可能残留较薄岩脊；结构线偶有锯齿，雾中的深渊底部偏灰，不能当作最终美术封板。本轮修正过圆角台面和覆盖层三角缺色，最终以连续地形块面加稀疏几何笔触收束，未用额外系统掩盖上述限制。

## D-N2B 承接与完整回退

D-N2B 可复用候选入口、冻结元数据、Stage 的 `setNetherStrataEnabled()`、Region/高程脏变更和资源释放。当前重建是事件触发的有界整批，未来正式编辑才按实际需要接统一 G-EDIT 脏区。正式接纳前必须决定高程范围/生成版本/量化保存与 `water/riverBase` 恢复策略；本轮未解决或偷偷修改这些协议。

既有 `netherWalkable()` 不看崖坡高差，因此候选极陡坡仍沿原通行规则；若正式玩法需要崖壁阻隔，应在后续单独裁决。没有十八套模拟、第二层可行走地面、洞穴或新增历史实体；资产正式接入留待后续。

运行时可关崖壁、切回 brush，或在展厅选择 D-N1，旧编辑试卷保留独立入口。完全放弃本候选可直接使用基线 `0c5c3b6`；若已经接纳提交，按正常 Git revert 撤销本分支增量即可。无正式档迁移或模拟数据需要回滚，不覆盖其他候选工作树。
