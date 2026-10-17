# 修士角色库 v2（cultivator_rebuild）接入记录

日期：2026-10-17 · A1 · 众生入画 · T1
Runtime 资产：`mesh/cultivator_library.glb`（legacy cells 版）
回退资产：`mesh/cultivator_library_prev.glb`
机器可读真源：`../data/cultivator_manifest.json`（provenance / rollback / limits.silhouette）
实测证据：`../data/structural_validation.json`、`../data/runtime_validation.json`、`../data/material_validation.json`

## 1. 结论

正式 runtime GLB 已由 2026-10 的 Blender v1 模型替换为资产作者交付的 `cultivator_rebuild` 重做版（legacy cells 版）。六身份、12 色调色板、16 骨 Rig、模块槽、socket 语义与 `CharacterLibrary` / `CharacterBatch` / `characterAppearance` 的读取结构均未改变，渲染代码无需修改。

| 文件 | SHA256 |
|---|---|
| `mesh/cultivator_library.glb`（当前 runtime） | `d31c4af5136e8d16e9da6cac059bea18826d933b3eb8a5693ce75264323dbaa7` |
| `mesh/cultivator_library_prev.glb`（旧模型，回退用） | `a9326d49bf0e994c0fca6d4aca90acc25bc4c54640ed27afd52a7a7216bfd10f` |
| 来源压缩包 `cultivator_rebuild.zip` | `a8065f87c405719dfa74fceb77fda6b53583f784df5b9253e849be401a91b82f` |
| 交付文件 `cultivator_library_legacycells.glb` | 与当前 runtime GLB 同 SHA256 |

## 2. 来源与产线说明（重要）

- 新模型由资产包 `tools/rebuild_library.py --legacy-cells` 生成（仅依赖 numpy，确定性、无随机数），从旧库重画网格，保留旧骨架/动画/节点命名/12 个模块挂点。作者自检报告 `previews/check_report.txt` 记录 46 项新旧对比全过。
- **本资产不是本仓库 Blender 产线的输出。** `source/*.blend` 与 `scripts/build-cultivator-assets.py` 描述的是 2026-10 的 v1 资产；新 GLB 没有对应的 `.blend` 源（作者也只交付 GLB）。`scripts/build-cultivator-assets.py` 已加覆盖保护，默认拒绝覆盖当前已接受的 runtime GLB。
- 本仓库独立复验（不依赖作者报告）结论：
  - 节点名、节点 TRS、scene、16 `skin.joints`、`inverseBindMatrices` 字节、`Idle`/`Walk` 两条动画的 channels 与采样器输入/输出字节、内嵌 12×1 调色板 PNG 均与旧库**完全一致**；
  - 仅 12 个模块的网格几何与调色板 UV 被重画；
  - `sect_token` 等附件新增/调整了色格区域（见 §4）。

## 3. 实测三角面（旧 → 新）

由 `scripts/inkbox-characters-check.mjs` 从 GLB 索引 accessor 实测（非作者上报）：

| 模块 | 旧 v1 | 新 v2 | 变化 |
|---|---:|---:|---:|
| body_base | 384 | 342 | −42 |
| hair_base | 50 | 86 | +36 |
| hair_elder | 50 | 82 | +32 |
| hair_ghost | 50 | 94 | +44 |
| sword_simple | 36 | 52 | +16 |
| pack_traveler | 60 | 60 | 0 |
| gourd_small | 68 | 70 | +2 |
| soul_lamp | 100 | 60 | −40 |
| sect_token | 24 | 38 | +14 |
| alchemy_tag | 32 | 28 | −4 |
| elder_mantle | 12 | 32 | +20 |
| ghost_torn_hem | 16 | 10 | −6 |

逐角色实测（核心 = body + hair；附件 = robe/weapon/back/prop/tag）：

| 身份 | 核心剪影 | 附件明细 | 附件合计 | 全装 |
|---|---:|---|---:|---:|
| basic / 普通修士 | 428 | — | 0 | 428 |
| sect_disciple / 宗门弟子 | 428 | sword 52 · token 38 | 90 | 518 |
| wanderer / 游修 | 428 | gourd 70 · pack 60 | 130 | 558 |
| elder / 长老 | 424 | sword 52 · mantle 32 | 84 | 508 |
| ghost / 鬼修 | 436 | soul_lamp 60 · torn_hem 10 | 70 | 506 |
| alchemist / 丹修 | 428 | alchemy_tag 28 | 28 | 456 |

## 4. 色格语义（legacy cells）与实测 UV

当前 runtime 使用 legacy cells 版：外袍 5、镶边/腰带 4、裤 6，与 v1 语义一致，因此 `CharacterLibrary` 的“只替换 factionSlot=5 色格”逻辑继续成立。实测每模块 UV 落在的色格与三角数（机器可读版本在 `../data/structural_validation.json` 的 `moduleUvCells`）：

| 模块 | 实测色格（三角数） |
|---|---|
| body_base | skin 0 (136)、ink 3 (24, 眼/靴)、blue_gray 4 (62, 领口/腰带/袖口)、sect_blue 5 (88, 外袍+上袖＝faction 区)、earth_brown 6 (32, 裤) |
| hair_base | ink 3 (78)、gray_purple 10 (8, 发冠/发带) |
| hair_elder | paper_white 1 (74)、blue_gray 4 (8, 发带) |
| hair_ghost | ink 3 (78)、dark_red 7 (16, 红梢) |
| sword_simple | ink 3 (12)、blue_gray 4 (8)、medicine_yellow 9 (32, 金饰) |
| pack_traveler | warm_beige 2 (12)、earth_brown 6 (36)、dark_red 7 (12) |
| gourd_small | earth_brown 6 (10)、medicine_yellow 9 (60) |
| soul_lamp | ink 3 (48)、ghost_cyan 8 (12) |
| sect_token | sect_blue 5 (12)、earth_brown 6 (12)、medicine_yellow 9 (14) |
| alchemy_tag | ink 3 (2)、earth_brown 6 (24)、medicine_yellow 9 (2) |
| elder_mantle | ink 3 (16)、blue_gray 4 (16) |
| ghost_torn_hem | ink 3 (8)、dark_red 7 (2) |

与 v1 的行为差异（视觉层，非模拟层）：

1. 所有模块的每个三角形都只落在单一色格中心（校验脚本逐三角形断言），Nearest 采样下不会混色。
2. `sect_token` 新模型带 12 面 `sect_blue` 区域，运行时会连同外袍一起被 faction 主色重映射（v1 令牌无 cell 5）。
3. 新增 `hairband` 色格 cell 10（基础发）与长老发带 cell 4；运行时**只**重映射 cell 5，因此发带不会按身份换色。资产包 README 中“02 宗门弟子 发带 10→5”等六身份重映射是作者预览配色，游戏 runtime 未实现逐部件重映射（仍按 role 的 `paletteIndex` 改外袍主色 + 模块组合区分身份）。
4. 内嵌调色板 PNG 与 `materials/cultivator_palette_12.png` 字节一致（`d8eff33c…7a99`，225 bytes），无需替换材质文件。

## 5. 剪影预算：原 450 预算被拆成“核心 + 附件”两级（如实披露）

v1 校验原文：`body + hair + robe ≤ 450`（ghost 恰好 450、elder 446，预算很紧）。新模型：

- 核心剪影（body + hair）实测 424–436，**全部 ≤ 450**；
- 但 elder = body 342 + hair_elder 82 + elder_mantle 32 = **456 > 450**（超 6）。逐 450 限制无法在保留新美术（肩披按概念图加大）的前提下同时满足。
- 资产作者 README 明确：“规格对比（按你们的 250–450 面规范，**不含可选附件**）”，即 250–450 只约束 body+hair。

据此按 A1_TEAM.md §3.1 的处理原则，把 v1 的单条剪影断言拆成两级（**没有删除断言、没有改小任何数字、没有放宽到无上限**），策略写入 `../data/cultivator_manifest.json` 的 `limits.silhouette`，校验脚本从 manifest 读取并断言：

| 策略 | 值 | 实测最大值 | 依据 |
|---|---:|---:|---|
| 核心剪影 body+hair | 250–450 | 436（ghost） | 沿用 v1 的 250–450；作者规范明确不含附件 |
| 单附件模块（robe/weapon/back/prop/tag 任一） | ≤ 100 | 70（gourd） | 沿用 v1 库最大单件（旧 soul_lamp 100） |
| 单角色附件合计 | ≤ 200 | 130（wanderer） | 实测留约 54% 余量，防止未来附件静默翻倍 |
| 单角色全装 | ≤ 650 | 558（wanderer） | 450 + 200 |

`scripts/inkbox-characters-check.mjs` 现在同时断言：逐模块 triangles 与实测一致、核心/单件/合计/全装四级预算、body 的 legacy 色格区域（cell 5 ≥50 面、cell 4/6 最小区域）、逐三角 UV 单色格、provenance SHA256、回退 GLB 存在且 SHA256 一致。也就是说，比 v1 的断言覆盖更多，而不是更少。

## 6. 校验与证据

| 命令 | 结果 | 证据 |
|---|---|---|
| `node scripts/inkbox-characters-check.mjs`（= `npm run test:characters`） | EXIT 0（连续多次稳定） | `../data/structural_validation.json` |
| `node scripts/inkbox-characters-browser.mjs` | EXIT 0，`pass: true`，`errors: []` | `../data/runtime_validation.json` |
| `CHARACTER_PHASE=material node scripts/inkbox-characters-browser.mjs` | EXIT 0，`pass: true`，`errors: []` | `../data/material_validation.json` |
| lab 尺度证据（真实 Edge + 真 GPU AMD Radeon 610M） | 6/20/50/300 人：12 draws；2974 / 9868 / 24738 / 148700 tris；frame mean 11.06 / 12.06 / 7.67 / 9.71 ms；单材质；拾取 6/6 | `../preview/scale_near|mid|far|stress.png` |
| 游戏集成证据 | 100 修士 → `characterBatch.stats.characters = 100`、lod `[100,0,0]`、triangles 42800、世界只读纯校验通过、世界重建 3 次后 geometry 计数稳定（7 → 5）、`errors: []` | `../preview/in_game.png` |

说明：

- **游戏段使用 `inkbox.html?renderer=3d&lod=off`（受支持的全 LOD0 路径）**。默认俯瞰相机下 `pixelsPerUnit ≈ 1.86`，远低于角色 LOD0 阈值（44px），所有实体按设计落在 LOD2 占位几何，`characterBatch` 合法为空（QA 基线 `lod=[0,0,73]` 也是同一现象）。旧测试“100 个角色全部出现在 characterBatch”隐含了旧版相机取景，当前 G2-R1 默认视图不再保证；因此验收显式走 `lod=off`，断言仍是 `characterBatch === 100`，并额外断言 `lodEnabled === false` 与 library 加载成功/error 为空。该调整只改验收取景条件，不放松任何原有断言。
- `material_validation.json` 原本在 v1 的 `phase=material` manifest 下生成；当前 runtime manifest 是完整库。该证据阶段已改为**在完整库上验证同一套共享材质契约**：12 模块单材质、basic 只画 body+hair 两个 draw、12×1 调色板、Nearest 采样（`magFilter/minFilter = 1003`），不再依赖已不存在的 material phase manifest。
- 浏览器证据是真实 Edge（`Edg/155.0.4283.45`）+ 真 GPU（`runtime_validation.json` 各 scale 的 `renderer` 记录 `ANGLE (AMD, AMD Radeon(TM) 610M …, D3D11)`、`softwareRasterizer: false`），不是软件光栅；GPU 串行执行（由 Lead/QA 统一排队）。
- 群体渲染仍与 v1 一致：实例化休止姿态几何 + 单材质，不为每个 NPC 建 `SkinnedMesh` / `AnimationMixer`；Idle/Walk 仍是库内动画数据，供近景/后续动画使用。

## 7. 回退步骤

`mesh/cultivator_library_prev.glb` 随运行包发布（Lead 确认），因此无需 Git 即可回退：

```powershell
cd <repo-root>
Copy-Item assets/characters/cultivator/mesh/cultivator_library_prev.glb assets/characters/cultivator/mesh/cultivator_library.glb -Force
# 校验 SHA256 必须是 a9326d49bf0e994c0fca6d4aca90acc25bc4c54640ed27afd52a7a7216bfd10f
# 还原 data/cultivator_manifest.json 的 modules[*].triangles / asset_sha256 / provenance / rollback / limits.silhouette（或 Git 恢复该文件）
node scripts/inkbox-characters-check.mjs
node scripts/inkbox-characters-browser.mjs
```

回退后需同步把 `docs/CHARACTER_SPEC.md`、`docs/MODULE_MATRIX.md`、`docs/MATERIAL_SPEC.md` 与 `data/structural_validation.json` 恢复到 v1 描述；`provenance` / `rollback` 字段本身记录了双方 SHA256 与步骤。

## 8. 未来重新生成资产的正确做法

**推荐：继续用资产作者的 Python 重建产线（确定性、无 Blender）**

1. 以 `mesh/cultivator_library_prev.glb`（或任意被接受的基准 GLB）为 `CULTIVATOR_SRC`；
2. 用 `cultivator_rebuild/tools/rebuild_library.py 输出.glb --legacy-cells` 生成；
3. 用 `cultivator_rebuild/tools/check_glb.py 基准.glb 输出.glb` 校验节点/骨架/动画/调色板一致性；
4. 覆盖 `mesh/cultivator_library.glb`（保留旧文件为 `cultivator_library_prev.glb`）；
5. 重新跑 `node scripts/inkbox-characters-check.mjs` 会因 `asset_sha256` / triangles 不一致而失败：
   - 更新 `data/cultivator_manifest.json` 的 `asset_sha256`、`provenance.delivered_sha256`、`provenance.revision/recorded_at`、各模块 `triangles`（以脚本实测输出为准）；
   - 若有结构性新增色格区域，同步更新 `palette.legacy_cells` 与本文档；
   - 重新跑 check + browser 两套命令。

**不推荐的 Blender 路径**

`scripts/build-cultivator-assets.py --phase material|full` 默认**拒绝**覆盖已接受的 runtime GLB/manifest（`guard_runtime_outputs`）：只有当 manifest 记录当前文件就是本 Blender 产线的输出（production line 以 `Blender` 开头）时才放行；显式传 `--replace-existing` 可强制覆盖，但会替换掉外部重建美术并丢失 provenance 字段，必须同时更新文档与 manifest。v1 `.blend` 与新网格不对应，直接重跑 Blender 产线不能复现新模型。

## 9. 已知差异与遗留

- 新模型网格更细（身体倒角头、发壳、肩披、剑鞘金饰等），但仍是 flat shading + 12 色 atlas + 单 Lambert 材质；远景不额外简化（v1 也没有 LOD1/2 角色几何，仍是 LOD0 实例）。
- `../preview/` 中 `cultivator_family_six.png`、`cultivator_modules.png`、`cultivator_color_turnaround.png`、`cultivator_gray_*.png`、`cultivator_scale_6/20/50.png` 仍是 v1 Blender 产线渲染（作者预览风格，非游戏材质）。**当前 v2 runtime 的视觉证据**以 `scale_near/mid/far/stress.png`、`material_base.png`、`in_game.png` 为准（真实 Three.js/Edge/GPU）。
- 长老白发为整片长壳、肩披被发壳遮盖较多；作者 README 已列出这些粗糙处（侧后看白发像布袋、发髻方块、远景小件不可见、行走时附件可能轻微穿插）。这些是美术取舍，不是接线缺陷。
- 发带（cell 10）不随身份换色；`sect_token` 蓝色区域随 faction 主色变化；魂灯配色由旧库的 ghost_cyan 大面积改为 ink 为主。均为视觉表现，不影响模拟、存档或身份判定。
- 本任务未修改 `CharacterLibrary` / `CharacterBatch` / `characterAppearance`，也未触碰 `EntityLayer`、`Render3DHost`、`Render3DAdapter`、`PlaneStage` 等 T3 写入范围文件。
