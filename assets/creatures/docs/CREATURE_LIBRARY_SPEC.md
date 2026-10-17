# 山海异兽资产库规格（A1 · 众生入画 T3）

本文是 **13 种《山海经》异兽资产**在 Inkbox 中的正式规格说明：资产从哪来、GLB
长什么样、运行时怎么加载与批处理、世界里怎么试装、失败怎么回退、怎么验收。

- 资产源包：`inkbox_creatures(1).zip` → 解压目录
  `资产/_extracted/inkbox_creatures/inkbox_creatures/`
  （`glb/creature-*.glb`、`manifest.json`、`Textures/creature_palette.png`、`previews/`、
  `tools/check_creatures.py` / `check_report.txt`）
- 入库位置：`assets/creatures/`
- 规格作者：资产包 README（原包内）+ 本轮实测（`scripts/inkbox-creatures-check.mjs`）
- 最后实测：2026-10-17，21981 项结构断言全过（见 `data/structure_validation.json`）

## 1. 目录

```
assets/creatures/
├── mesh/creature-<id>.glb        # 13 个独立 GLB（自包含：几何 + 内嵌调色板 PNG）
├── materials/creature_palette.png # 16×1 调色板，与 GLB 内嵌图逐字节相同
├── data/creature_manifest.json    # 唯一权威清单（id/中文名/出处/体型/高度/节点/动画/试装标记/每文件 sha256）
├── data/structure_validation.json  # 结构检查实测输出（可再生）
├── docs/CREATURE_LIBRARY_SPEC.md  # 本文
└── preview/                       # 资产预览图（contact / anim_strips / scale_lineup，不进运行包）
```

运行时代码：

```
src/inkbox/render3d/
├── creatures/CreatureLibrary.js   # 统一加载 + 部件按 rest 变换合并成单静态几何 + 共享材质
├── creatures/CreatureBatch.js     # 每物种一个 InstancedMesh；write/stats/拾取映射/dispose
├── creatures/creatureSpecies.js   # seed+id 稳定哈希选物种与朝向（纯函数，零 RNG）
├── creaturesLab.js                # 资产库 Lab 场景（13 只 / 8 套动画）
└── entities/EntityLayer.js        # 世界接线：cls==='beast' 且库存在时画真实模型
creature-lab.html                  # Lab 页面
scripts/inkbox-creatures-check.mjs # 结构 + 运行时契约检查（Node，无浏览器）
scripts/inkbox-creatures-browser.mjs # 真实 WebGL 验收（lab + 游戏内世界试装）
```

## 2. 物种清单（实测）

`✅` = 默认世界试装 4 种（`manifest.worldTrial`，顺序为
`tiangou / dangkang / lushu / xuangui`）。其余 9 种先作为资产候选：Lab 可看，
本轮不强行塞进正式世界。

| 中文名 | id | 档 | 高度（×修士=2.125） | 包围盒（宽×高×深） | 三角形 | 部件 | 脚底 y | 试装 | 出处 |
|---|---|---|---|---|---|---|---|---|---|
| 精卫 | `jingwei` | 小 | 0.584（0.27×修士） | 0.59 × 0.58 × 0.66 | 508 | 7 | 0 | — | 《北山经》发鸠之山 |
| 比翼鸟 | `biyi` | 小 | 0.571（0.27×修士） | 0.95 × 0.57 × 0.60 | 492 | 9 | 0 | — | 《海外南经》《西山经》 |
| 赤鱬 | `chiru` | 小 | 0.58（0.27×修士） | 0.58 × 0.48 × 0.69 | 272 | 4 | 0.098 | — | 《南山经》青丘之山 |
| 旋龟 | `xuangui` | 小 | 0.462（0.22×修士） | 0.53 × 0.46 × 1.10 | 400 | 9 | 0 | ✅ | 《南山经》杻阳之山 |
| 天狗 | `tiangou` | 小 | 0.858（0.4×修士） | 0.49 × 0.86 × 1.11 | 352 | 7 | 0 | ✅ | 《西山经》阴山 |
| 当康 | `dangkang` | 小 | 1.178（0.55×修士） | 0.81 × 1.18 × 1.07 | 380 | 6 | 0 | ✅ | 《东山经》钦山 |
| 九尾狐 | `jiuweihu` | 中 | 1.633（0.77×修士） | 1.78 × 1.63 × 1.83 | 456 | 14 | 0 | — | 《南山经》青丘之山 |
| 鹿蜀 | `lushu` | 中 | 2.12（1×修士） | 1.03 × 2.12 × 3.12 | 504 | 7 | 0 | ✅ | 《南山经》杻阳之山 |
| 帝江 | `dijiang` | 中 | 1.504（0.71×修士） | 2.02 × 1.50 × 1.10 | 512 | 11 | 0 | — | 《西山经》天山 |
| 狰 | `zheng` | 中 | 2.184（1.03×修士） | 1.51 × 2.18 × 2.44 | 442 | 10 | 0 | — | 《西山经》章莪之山 |
| 穷奇 | `qiongqi` | 大 | 2.797（1.32×修士） | 6.88 × 2.80 × 4.13 | 752 | 8 | 0 | — | 《海内北经》 |
| 蜚 | `fei` | 大 | 3.532（1.66×修士） | 2.84 × 3.53 × 6.73 | 576 | 9 | 0 | — | 《东山经》太山 |
| 开明兽 | `kaiming` | 巨 | 5.954（2.8×修士） | 4.76 × 5.95 × 9.57 | 674 | 15 | 0 | — | 《海内西经》 |

合计 6320 三角形。**单位制**：与修士库同一单位，修士模型高 2.125；相对体型已烘进
几何，世界里 `scale=1`，不再二次缩放。**朝向**：脸朝 +Z，左 = +X，脚底 y=0
（赤鱬是无腿鱼，原资产设计上略悬空 0.098；其余为 0）。

## 3. GLB 结构（实测契约）

每只 GLB 自包含（`buffers[0].uri === undefined`）：

- 单场景单根：`Scene → <id> → root → body → 部件（头/尾/翼/腿/…）`。
  **无骨骼、无 skin**：纯刚体部件层级，`root` / `body` 之下全部是 Mesh 节点。
- 每只 **一个材质**（`creature_flat_palette`，`doubleSided: true`，
  `pbrMetallicRoughness.baseColorTexture` 指向唯一的 16×1 调色板）+ **一张内嵌 PNG 贴图**。
  内嵌图与 `materials/creature_palette.png` **逐字节相同**（sha256
  `00F4CDE4…B1A8F`）。
- 每个部件一个 primitive：`POSITION / NORMAL / TEXCOORD_0`，三角形模式，索引完整；
  法线为单位面法线（平面着色），UV x 精确落在 16 个色格中心、y=0.5。
- 三角形数：272–752，**manifest 数字为实测值**（`inkbox-creatures-check.mjs` 不抄作者自报）。
- 脚底：有腿的物种 `min(y)≈0`；赤鱬 0.098（原资产语义）。世界高度一律
  `elevation.at(x,y) + lift`，不用固定 Y。

## 4. 动画（8 套，同名同序，LINEAR）

`static / idle / walk / run / eat / dance / gesture-positive / gesture-negative`。

- 每套动画通道数 = `(root + 部件) × T/R/S`，即 `(节点数 − 1) × 3`；
  物种组节点本身不被动画。
- 全部 LINEAR；四元数已单位化。时长：`static 0.1s / idle 1.0s / walk 0.5s /
  run 0.25s / eat 0.5s / dance 0.5s / gesture-positive 0.25s / gesture-negative 0.25s`。
- **世界批处理不播动画**（静态合并几何，动画只留给 Lab）。原因：世界灵兽是实例化
  批处理，逐实例 AnimationMixer 成本远超本轮收益；契约要求静态批处理优先。

## 5. 加载与合并（CreatureLibrary）

`loadCreatureLibrary({ ids, keepRigs, ... })`：

- `ids=null` → manifest 全部 13 只（Lab）；世界中 `Render3DHost` 只传
  `DEFAULT_WORLD_TRIAL_IDS`（4 种），避免为展示 13 只多付加载与显存。
- 每物种：遍历 GLB 场景所有 Mesh 部件，按**节点 rest 世界矩阵**（TRS 累乘，
  不含动画）把 `geometry.clone()` 变换到同一空间，`toNonIndexed` 后
  `mergeGeometries` 成**一个静态几何**；随后释放原 GLB 场景的几何/材质/贴图
  （`keepRigs: false`）。
- 全局共享 **1 个材质**（`MeshLambertMaterial`，`map` = 16×1 调色板，
  `NearestFilter`、`flatShading: true`、`side: DoubleSide`）与 **1 张贴图**。
- `keepRigs: true` 时额外保留原层级场景与 clip（Lab 用 AnimationMixer）；
  共享材质同样替换进 rig 场景。
- 元数据保留：`id / name_zh / size_class / source / quote / height / size /
  triangles / parts / feet_y / nodes / clips / worldTrial`；合并几何的
  `boundingBox/Sphere` 重新计算。
- `dispose()` 释放所有合并几何、rig 源几何、材质、内外贴图；可重复调用。
- 单只 GLB 失败：记录 `library.errors` 并跳过；**一只都加载不到**才抛错。
  Host 捕获后保留 `creatureLoadError`、控制台 `console.error`，世界退回旧灵兽占位，
  游戏继续运行。

## 6. 世界试装（CreatureBatch + EntityLayer）

- `CreatureBatch(library, { capacity })`：每物种一个 `InstancedMesh`（共享合并几何 +
  共享材质），一次分配容量（默认 1024/物种，世界常态约 35 头灵兽）。
- `write(records)`：记录 `{ species, x, y, z, rotationY?, scale?, source }`；
  `stats = { creatures, instances, drawCalls, triangles, overflow }`，
  `meshes.get(id).userData.renderEntities[instanceId]` 与 `PlanePicker` 现有拾取
  约定一致（`renderEntities[instanceId].id/x/y/identityContainer`）。
  容量满时只计 `overflow`、丢表现不丢实体。
- **EntityLayer 接线**：
  - `setCreatureLibrary(library)`（可空）；`null`/`disposed` → 完全回退旧
    `EntityLayer` 灵兽 Box 占位（`placeholderMeshes.beast` 重新挂回 group）。
  - `cls === 'beast'` 且有库时用真实模型；human/cultivator/spirit/wraith 路径不变。
  - **物种**：`creatureSpeciesFor(world.seed, entity.id, library.worldSpecies)`，
    FNV-1a 哈希（`creatureSpecies.js`），**不新增 RNG 抽取、不写实体**。
  - **朝向**：`creatureFacingFor(world.seed, entity.id)` 稳定角度，不伪造移动/战斗语义。
  - **LOD**：LOD0 与 LOD1 都用真实模型；只有 LOD2（≤7px 剪影级）保留既有简化
    占位几何；`?lod=off`（`setLODEnabled(false)`）时 beast 全部用真实模型。
    理由：委托书要求「玩家在世界运行时确实能看到不同造型的灵兽活动」。LOD2 是
    全图全景（整张小地图铺满屏幕、单只约 7px）时的剪影档；玩家拉近观察（zoom≈2.5
    起，LOD1）就能看到真实异兽，近景为 LOD0。真实模型单只仅 272–752 tris，
    常态约 35 头灵兽，静态 InstancedMesh 的成本远低于「每只一个 Mesh」，
    LOD0+1 共用真实模型是合理的视觉/预算取舍；只有 LOD2 才退回剪影占位。
  - 视界/区域：沿用 `visibleList(derived, cls)` 与 `RegionGeometry`，只在凡间
    Stage 的 `entities` 层内绘制，不会画到其它位面。
  - 资源：世界重建只重建 Stage 的 `CreatureBatch` 包装；合并几何/材质归 Host 的
    `CreatureLibrary`，重建/切换不重复加载、不泄漏；Host dispose 时统一释放。
  - `stats.creatures` 暴露当前真实模型实例数，`stats.byClass.beast` 含真实模型，
    `submittedTriangles()` 计入合并几何三角形。

## 7. 默认世界试装组合

`tiangou 天狗（0.4×修士）/ dangkang 当康（0.55×）/ lushu 鹿蜀（1×）/
xuangui 旋龟（0.22×）`——四种体型、四种动物轮廓，适合「普通灵兽」定位。
其余 9 种（含 2.8×修士的开明兽、穷奇、蜚等大型/稀有物种）保留为未来秘境、
世界事件、特殊生物候选；**本轮不在模拟/记录/UI 中虚构它们的特殊能力**。

世界里的灵兽（`sim/life.js`，`sp==='beast'`）只是换成上述真实造型，身份、移动、
战斗、生成、存档字段一个字节都不改。

## 8. Lab（creature-lab.html）

- 统一加载 13 只（真实 three.js + 同一 GLTFLoader/CreatureLibrary），列表可切换；
  默认列队展示 13 只并用真实包围盒自动取景。
- 选中后可查看：中文名、id、出处、体型档、高度（含 ×修士）、包围盒、三角形、
  部件数、动画套数、材质说明；可播放 8 套动画（每只独立 AnimationMixer）；
  「默认姿态」回 rest pose。
- 稳定 API：`window.creatureLab = { ready, errors, species:[{id,name_zh,height,...}],
  select(id), play(clip), metrics() }`；`pagehide` 释放库/动画/渲染器。
- `metrics()` 返回 species/rigs/currentClip/drawCalls/triangles/materialCount=1/
  textureCount=1/allClipsMatch 等，供浏览器脚本断言。

## 9. 验收

```powershell
cd D:\worldxxxxx\坐天观井第二纪元\inkbox
node scripts/inkbox-creatures-check.mjs        # 结构 + 运行时契约（Node，退出码 0）
node scripts/inkbox-creatures-browser.mjs      # 真实 WebGL：lab 13 只/动画 + 游戏内世界试装
```

- 结构检查直接读 GLB 二进制：节点/材质/贴图/UV/法线/索引/动画通道/脚底/三角数、
  manifest 一致性、调色板 PNG 尺寸与 sha256；再用 three 的合成场景验证
  `CreatureLibrary` 合并、`CreatureBatch` 容量/拾取/dispose、`EntityLayer`
  LOD0/LOD1-2/LOD off/Region/回退/世界只读、稳定哈希分布、源码无 `Math.random`。
- 浏览器检查断言：lab 13 只加载、8 套 clip 名称同序、切换动画后姿态确实变化、
  metrics 资源计数；`inkbox.html?renderer=3d` 建小世界后：
  - 默认 LOD 开启时，默认全景镜头（ppu≈2.7）beast 落 LOD2 剪影但仍计入实体统计
    （不丢实体）；相机拉近到 LOD1（zoom 2.5，ppu≈6.6）和 LOD0（zoom 12，ppu≈31.9）
    时 creatureBatch 按物种分布 ≥1、至少 3 种出现；
  - `inkbox.html?renderer=3d&lod=off` 默认镜头即全真模型；
  - 落地 y 与地表插值一致（实测 dy<1e-6）、朝向为纯 Y 旋转、拾取映射回实体 id；
  - 世界重建 3 次后 geometry/texture 计数稳定、库/材质身份不变；
  - `?creatures=off` 回退旧灵兽占位且不报错。
  截图落 `assets/creatures/preview/`。
- 证据：`data/structure_validation.json`、`data/runtime_validation.json`（浏览器脚本生成）。

### 最近一次真实 WebGL 验收（2026-10-17，Edge + AMD Radeon 610M，真实 GPU）

- Lab：13 只全部加载（13 个 GLB + 外置调色板 PNG），列队 116 draws / 6320 tris，
  共享材质 1 / 贴图 1，13 个 AnimationMixer × 8 套 clip 名称与顺序全同；
  walk → gesture-positive 的骨节点姿态实测发生变化；`errors=[]`。
- 游戏 LOD 开启（small 200×128 世界 + 24 头灵兽，1440×900 画布）：
  默认镜头 ppu≈2.66 → `lod=[0,0,24]`（24 只 LOD2 剪影，实体统计 24/24 不丢）；
  zoom 2.5 → `lod=[0,24,0]`，4 种物种真实模型分布
  `{xuangui:12, tiangou:4, dangkang:5, lushu:3}`；zoom 12 → `lod=[24,0,0]`；
  落地误差 max 6e-8，全部纯 Y 朝向，拾取 8 次采样全部映射回世界实体 id。
- LOD 关闭（`?renderer=3d&lod=off`）：默认镜头 24/24 全真模型，4 种物种。
- 世界重建 3 次：geometry 13→11、texture 5→5，`creatureLibrary` 与材质 uuid 不变，
  旧 Stage 的 batch 全部释放。
- 回退（`?creatures=off&lod=off`）：8 头灵兽全部回到旧占位几何，无控制台错误。
- 截图：`preview/creature_lab_lineup.png`、`preview/creature_lab_animation.png`、
  `preview/creature_world_default_lod.png`（默认 LOD2）、`preview/creature_world_lod1.png`、
  `preview/creature_world.png`（近景 LOD0 鹿蜀）、`preview/creature_world_lod_off.png`。

## 10. 已知取舍

- 世界内**静态模型**（不播 8 套动画）；动画只在 Lab。世界批处理优先实例化成本。
- LOD 开启时 **LOD0/LOD1 都是真实模型**，只有 LOD2（≤7px 剪影级）退回旧简化占位。
  实测 200×128 世界在 1440×900 画布的全景默认镜头 ppu≈2.7，灵兽落 LOD2（约 7px）；
  正常拉近一档（zoom 2.5，ppu≈6.6）即进入 LOD1 真模型，近景 zoom 12 为 LOD0。
  即：**看全图时用剪影占位，玩家拉近观察/操作时看到真实异兽**；`?lod=off` 时默认
  镜头即全真模型。
- 赤鱬脚底 0.098 为原资产语义（无腿鱼略悬空），世界摆放照旧。
- 穷奇/蜚/开明兽包围盒进深较大（尾巴/九头），未用于碰撞或选取范围，仅表现。
