# 《坐天观井》Mini 修士生产规范 v1

本目录属于 Presentation / Asset Layer。角色是模拟状态的视觉投影；禁止资产加载、换装、动画或显示状态决定模拟、RNG、存档或世界规则。先读本规范，再打开 `../source/cultivator_master.blend`。参考源文件的实测拆解见 [REFERENCE_AUDIT.md](REFERENCE_AUDIT.md)。

## 人体与复杂度

| 项目 | 固定标准 |
|---|---|
| 比例 | 所有身份共用同一身体；解剖头高 0.92，角色含髻高度 2.28。含髻约 2.48 头身，不含髻约 2.31 头身。不得改成长老高挑、丹修矮胖等职业比例。 |
| 基础预算 | 普通修士 = 共享身体 + 基础发型，250–450 triangles；包含袍、袖、手鞋与两只眼睛。附件单列计数。导出后的实际指标在 `../data/structural_validation.json`。 |
| 面部 | 仅两只块状眼睛，无鼻子、嘴唇、牙齿、眉毛或复杂表情。 |
| 手脚 | 块状手，无手指；块状鞋；短腿部分被袍遮挡。 |
| 衣服 | 一层短外袍、简单斜交领、腰带、大块宽袖。禁止多层裙摆、飘带、刺绣、护甲。 |
| 头发 | 一个主体发块、一个发髻、至多 2–3 块刘海；初版仅 base / elder / ghost。禁止发片堆叠。 |
| 着色 | Flat normals；12 色共享 atlas；运行时单 Lambert 材质。无传统角色纹理、法线贴图或独立角色 PBR 材质。 |

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

1. 修改 `scripts/build-cultivator-assets.py` 的可重复几何和模块定义；Blender 中也可编辑，但必须回写生产脚本以免重建丢失。
2. `--phase gray` 仅创建基础灰模、Rig、socket、指标和三视图。检查全身、前侧后、脚底和预算后才进入 `--phase material`。
3. `--phase material` 创建基础身体/基础发型、共享 palette 和 basic 配置，必须在 Three.js 显示成功后进入完整生产阶段。
4. 完整生产维护同一 master 中的共享原型、六个组合、6/20/50 测试和 export collections；组装应链接同一 mesh datablock，不复制身体数据。实测 master 组织以完成报告为准。
5. 导出 glTF 2.0 GLB：应用缩放、三角化、flat normals、保留 UV/蒙皮/骨骼、稳定名称、一 primitive 一材质、嵌入 palette。`mesh/cultivator_library.glb` 为运行时唯一角色库。
6. 同步 manifest 的模块 node / slot / triangles 和六 role 配置；运行 `npm run test:characters`，然后 `npm run test:characters:browser` 保存尺度证据。基础实际面数以导出的索引 accessor 为准。

所有资源用小写英文，如 `cultivator_hair_elder`、`cultivator_prop_gourd_01`。禁止 Cube.017、final2、新建、复制等临时名。精确 Blender 运行命令、完整阶段参数和发布结果见完成报告。

## LOD 与扩展

本版交付 LOD0，不声称已有完整 LOD。后续 LOD1 应合并发式、简化袖子和 props；LOD2 仅保留头、身体、主色；极远处可切到 billboard、sprite、point 或现有 Canvas 代理。状态不改变这些结构。不要在所有距离坚持完整角色几何。

新增身份优先组合现有模块与主色；新增模块先说明唯一识别点、socket、面数、palette UV 和槽类型。任何增加身体比例、独立材质、独立 Rig 或三个附件槽同时堆叠的方案均不兼容本标准。真实游戏尺度测试比近距离细节更有优先级。
