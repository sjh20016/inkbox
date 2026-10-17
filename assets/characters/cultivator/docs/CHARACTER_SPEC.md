# 《坐天观井》Mini 修士生产规范 v1

本目录属于 Presentation / Asset Layer。角色是模拟状态的视觉投影；禁止资产加载、换装、动画或显示状态决定模拟、RNG、存档或世界规则。先读本规范，再打开 `../source/cultivator_master.blend`。参考源文件的实测拆解见 [REFERENCE_AUDIT.md](REFERENCE_AUDIT.md)。

> **当前 runtime 资产（2026-10-17，v2 重建版）**：`../mesh/cultivator_library.glb` 已替换为外部 `cultivator_rebuild` 产线的 legacy-cells 重做版（SHA256 `d31c4af5…3DBAA7`，旧库回退文件 `../mesh/cultivator_library_prev.glb`）。新资产不是本仓库 Blender 产线的输出，来源、实测面数、色格语义、预算拆分依据、回退与重新生成步骤见 [CULTIVATOR_REBUILD_INTEGRATION.md](CULTIVATOR_REBUILD_INTEGRATION.md)；下文 §人体与复杂度 / §生产与导出 已按 v2 实测更新。

## 资产版本与来源

| 项目 | 值 |
|---|---|
| 当前 runtime GLB | `mesh/cultivator_library.glb`，SHA256 `d31c4af5…3DBAA7` |
| 回退 GLB | `mesh/cultivator_library_prev.glb`（v1 Blender 产线），SHA256 `a9326d49…BFD10F`，随运行包发布 |
| 来源压缩包 | `cultivator_rebuild.zip`，SHA256 `a8065f87…1B82F`；交付文件 `cultivator_library_legacycells.glb` |
| 生成方式 | 资产包 `tools/rebuild_library.py --legacy-cells`（numpy、确定性、无随机数），保留 v1 骨架/动画/节点名/12 模块挂点与 12×1 调色板 |
| 机器可读 provenance / rollback | `../data/cultivator_manifest.json` 的 `asset_sha256`、`provenance`、`rollback`、`limits.silhouette` |
| 实测证据 | `../data/structural_validation.json`（结构/面数/UV/预算）、`../data/runtime_validation.json`（真实 Edge）、`../data/material_validation.json` |

`source/*.blend` 与 `scripts/build-cultivator-assets.py` 记录的是 v1 Blender 产线，**不是**当前 GLB 的可编辑源；要改新模型须导入 GLB 或回到作者的 Python 重建产线。构建脚本已加覆盖保护，默认拒绝覆盖已接受的 runtime GLB。

## 人体与复杂度

| 项目 | 固定标准 |
|---|---|
| 比例 | 所有身份共用同一身体；v2 实测网格包络：身体 Y 0–2.10，含发型最高 2.40（v1 为 2.28）。设计仍按约 2.3 头身（重建包说明）；不得改成长老高挑、丹修矮胖等职业比例。 |
| 基础预算 | 普通修士 = 共享身体 + 基础发型 = 342 + 86 = **428** triangles（v2 实测，仍在 250–450）；包含袍、袖、手鞋与两只眼睛。附件单列计数。v2 附件预算：单件 ≤ 100、单角色附件合计 ≤ 200、全装 ≤ 650；拆分依据与实测表见 [CULTIVATOR_REBUILD_INTEGRATION.md](CULTIVATOR_REBUILD_INTEGRATION.md) §5。导出后的实际指标在 `../data/structural_validation.json`。 |
| 面部 | 仅两只块状眼睛，无鼻子、嘴唇、牙齿、眉毛或复杂表情。 |
| 手脚 | 块状手，无手指；块状鞋；短腿部分被袍遮挡。 |
| 衣服 | 一层短外袍、简单斜交领、腰带、大块宽袖。禁止多层裙摆、飘带、刺绣、护甲。 |
| 头发 | 一个主体发壳、一个发髻、至多 2–3 块刘海；初版仅 base / elder / ghost。v2 新增独立发冠/发带色格 cell 10（不随身份换色）；禁止发片堆叠。 |
| 着色 | Flat normals；12 色共享 atlas；运行时单 Lambert 材质。无传统角色纹理、法线贴图或独立角色 PBR 材质。v2 每个三角形只落单一色格（校验脚本逐三角断言）。 |

共享人体各部位合并在 `cultivator_body_base` 的一个 primitive 中，骨骼权重保留 head / arm / hand / leg / foot 的语义；袍袖也是这一共享网格的一部分。这使普通身体只需一次实例绘制。六个身份禁止各自复制成不同的身体几何或骨架。

## 坐标与 Rig

Blender 使用米单位、Z 向上、面向 -Y；Root 在地面原点，鞋底 Z=0。GLB 导出为 glTF 标准的 Y 向上、面向 +Z。运行时一个单位等于一个视觉世界格单位，人物落点取实际地形高度。不得用隐藏高度偏移修补坏 Pivot。

16 根骨骼：`root → pelvis → spine → head`，两侧各 `upperarm → lowerarm → hand` 与 `upperleg → lowerleg → foot`。实际小写名使用 `l_` / `r_` 前缀，例如 `l_upperarm`。袖子绑定现有手臂骨，不加布料、发丝或法器动态骨。所有蒙皮模块引用同一骨架。

| Socket | 父骨 | Blender 休止位置 | glTF 休止位置 |
|---|---|---|---|
| socket_hair | head | (0, 0, 2.12) | (0, 2.12, 0) |
| socket_back | spine | (0, 0.27, 1.17) | (0, 1.17, -0.27) |
| socket_waist | pelvis | (0.28, 0, 0.83) | (0.28, 0.83, 0) |
| socket_weapon | r_hand | (0.62, -0.05, 0.72) | (0.62, 0.72, 0.05) |

单库 GLB 的模块按角色休止位置对齐。Three.js 加载器将 node.matrixWorld 烘入几何一次，再用同一角色实例矩阵放置身体与附件；不要再次叠加 socket translation。单独导出的模块也保留该标准坐标。更换附件应通过模块槽和上述 socket 语义，不能按截图手调不同职业的身体比例。

v2 重建版对 Rig 做了独立字节级复验：节点名/TRS、16 `skin.joints`、`inverseBindMatrices`、Idle/Walk 两条动画的 channels 与采样器数据、内嵌 12×1 调色板均与 v1 完全一致，因此 socket 与动画接口无需调整（见 [CULTIVATOR_REBUILD_INTEGRATION.md](CULTIVATOR_REBUILD_INTEGRATION.md) §2）。

原生资产含 `Idle` / `Walk` 实际骨骼动画；后续 `Run` / `Attack` / `Cast` / `Death` / `Meditate` 沿用这个 Rig。初版群体绘制使用休止姿态的实例几何，不为每 NPC 建 AnimationMixer 或 SkinnedMesh。动画导出与大群动画驱动是两个接口，不要宣称群体已逐骨播放动画。

## 组合纪律

六个身份和模块槽见 [MODULE_MATRIX.md](MODULE_MATRIX.md)。每人只有一个主要识别点。Hair 恰好 1；Weapon / Prop / Tag 各 0–1，三者最多占两个槽；Back 0–1，小包属于 back，葫芦属于 prop。初版 hairband 固定 0，没有单独飘带模块。普通修士没有任何附件。

角色语义示例：

```js
{ body: 'cultivator', role: 'sect_disciple', hair: 'base',
  factionColor: 5, weapon: 'sword_01', prop: null, tag: 'sect_token', state: null }
```

这是应用侧语义。实际 `cultivator_manifest.json` 将其映射到小写模块 ID，模拟代码不存 GLB 文件名。运行时 `CharacterLibrary.resolveAppearance(role, overrides)` 检查共享 body、模块槽、数量上限和丹修二选一；未知角色或非法配置明确报错。`CharacterBatch.write(records)` 接收世界空间坐标和配置，所有真实几何实例保留源实体拾取映射。

宗门色按共享 palette index 变化，禁止重新导出每宗门模型。角色状态后续走 shader / outline / FX；本版预留 state 语义，不把受伤、附身或入魔写成新身体。模拟移动状态 `wander` 不能自动变成游修职业；实际无职业资料的人维持普通身份。游修组合可由明确的 Presentation 配置使用。

## 生产与导出

v1 产线（`scripts/build-cultivator-assets.py`，Blender）只对应 2026-10 的初版资产；**当前 runtime 资产来自外部 `cultivator_rebuild` Python 重建产线**，没有对应的 `.blend` 源。两条产线的边界、完整重新生成步骤和覆盖保护见 [CULTIVATOR_REBUILD_INTEGRATION.md](CULTIVATOR_REBUILD_INTEGRATION.md) §8。

1. **当前资产（v2）重新生成**：以被接受的 GLB 为基准，用资产包 `tools/rebuild_library.py 输出.glb --legacy-cells` 生成，再用 `tools/check_glb.py 基准.glb 输出.glb` 做新旧结构校验；覆盖 `mesh/cultivator_library.glb` 前先把旧文件保存为 `mesh/cultivator_library_prev.glb`。
2. **必须同步 manifest**：覆盖后 `node scripts/inkbox-characters-check.mjs` 会因 `asset_sha256` / 实测 triangles 不一致而失败——按脚本实测输出更新 `../data/cultivator_manifest.json` 的 `asset_sha256`、`provenance`、各模块 `triangles`，结构性变化（新色格/新模块）还要更新 `palette.legacy_cells` 与文档。
3. **v1 Blender 产线仅作历史/对照**：`--phase gray` 创建基础灰模、Rig、socket、指标和三视图；`--phase material` 创建基础身体/发型、共享 palette 与 basic 配置；`--phase full` 完整生产。`--phase material|full` 现在默认拒绝覆盖已接受的 runtime GLB/manifest，除非 manifest 证明当前文件是本产线自己的输出，或显式传 `--replace-existing`（会替换外部重建美术并丢失 provenance，需同时更新文档）。
4. 任何产线导出都要求：应用缩放、三角化、flat normals、保留 UV/蒙皮/骨骼、稳定名称、一 primitive 一材质、嵌入 12×1 palette。`mesh/cultivator_library.glb` 为运行时唯一角色库，`mesh/cultivator_library_prev.glb` 只作回退，不被运行时加载。
5. 校验：`npm run test:characters`（= `node scripts/inkbox-characters-check.mjs`，结构/面数/UV 色格/provenance/预算）→ `npm run test:characters:browser`（真实 Edge 的 6/20/50/300 规模、拾取、游戏集成与生命周期，重写 `data/*validation.json` 与 `preview/` 截图）。基础实际面数以导出的索引 accessor 为准，不以作者或脚本上报数字为准。

所有资源用小写英文，如 `cultivator_hair_elder`、`cultivator_prop_gourd_01`。禁止 Cube.017、final2、新建、复制等临时名。精确生成命令、来源 SHA256、实测表与发布结果见 [CULTIVATOR_REBUILD_INTEGRATION.md](CULTIVATOR_REBUILD_INTEGRATION.md)。

## LOD 与扩展

本版交付 LOD0，不声称已有完整 LOD；v2 重建版同样只有 LOD0 几何。后续 LOD1 应合并发式、简化袖子和 props；LOD2 仅保留头、身体、主色；极远处可切到 billboard、sprite、point 或现有 Canvas 代理。状态不改变这些结构。不要在所有距离坚持完整角色几何。

新增身份优先组合现有模块与主色；新增模块先说明唯一识别点、socket、面数、palette UV 和槽类型。任何增加身体比例、独立材质、独立 Rig 或三个附件槽同时堆叠的方案均不兼容本标准。真实游戏尺度测试比近距离细节更有优先级。
