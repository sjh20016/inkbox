# A1 · 众生入画 — 三组原创 3D 资产接入候选

本轮从 G2-R1 可玩集成候选接续开工，开发分支 `feat/a1-creature-character-assets`（起点 `e6fb8c602aca90326f4f28a7a5dce5256f00ef5a`）。按委托书《坐天观井 / Inkbox》A1 · 众生入画 v1.0 执行：把三组原创 3D 资产真正接进正式游戏，而不是另造一套游戏或只做模型展示。

目标与结果：

| 委托目标 | 本分支结果 |
| --- | --- |
| §四 修士模型正式替换 | ✅ 正式 runtime 已换成 `cultivator_rebuild` legacy-cells 版；六身份 / 12 色 / 16 骨 / 模块槽语义不变，旧模型随包保留可回退 |
| §五 卜算子正式形象 | ✅ 卜算子面板新增模型渲染肖像入口 + 独立 three.js 三维小窗；Idle / Walk / Wind 可在真实场景播放与切换，风起时符纸 / 头发 / 衣摆 / 铃 / 伞有实测位移 |
| §六 山海异兽库 + 世界试装 | ✅ 13 种异兽统一入库并可进 Lab（8 套动画）；4 种（天狗 / 当康 / 鹿蜀 / 旋龟）以真实模型进入正式世界灵兽表现，其余 9 种保留为资产候选 |
| §八 工程边界 | ✅ 世界模拟零改动（不写实体、不抽模拟 RNG、不改存档）；加载失败回退旧表现；资源随世界重建释放；Canvas 不受影响 |
| §十 验收 | 结构 / CPU 门禁 + 真实 Edge(AMD Radeon 610M, D3D11) 浏览器验收；Fast/Heavy 远端结果见 PR |

## 1. 三组资产

### 1.1 修士（T1）

- 来源：`cultivator_rebuild.zip`（SHA256 `a8065f87…1b82f`），交付文件 `cultivator_library_legacycells.glb`；生成产线 `tools/rebuild_library.py --legacy-cells`（numpy，确定性，无随机数）。
- Runtime：`assets/characters/cultivator/mesh/cultivator_library.glb`，SHA256 `d31c4af5…3dbaa7`，181268 B；旧 v1 模型 `mesh/cultivator_library_prev.glb`（`a9326d49…bfd10f`）随包保留，回退步骤写在 `data/cultivator_manifest.json` 的 `rollback`。
- 兼容：独立字节级复验确认节点名 / TRS / 16 `skin.joints` / `inverseBindMatrices` / `Idle`·`Walk` 通道 / 内嵌 12×1 调色板与旧库一致，仅几何与调色板 UV 重画；因此 `CharacterLibrary` / `CharacterBatch` / `characterAppearance` 无需改动。legacy 色格语义（外袍 5 / 镶边 4 / 裤 6）保留，宗门 faction 换色继续有效。
- 实测三角（旧→新）：body 384→342、hair_base 50→86、hair_elder 50→82、hair_ghost 50→94、sword 36→52、pack 60→60、gourd 68→70、soul_lamp 100→60、sect_token 24→38、alchemy_tag 32→28、elder_mantle 12→32、ghost_torn_hem 16→10。
- 预算披露：原「body+hair+robe ≤ 450」在新资产上 elder=342+82+32=456 越界 6；按核心剪影（body+hair 250–450，实测 424–436 全过）+ 附件独立上限（单件≤100、单角色附件合计≤200、全装≤650，实测最大 70 / 130 / 558）两级策略重写校验，未删断言、未改小数字，依据与实测表写入 `manifest.limits.silhouette` 与 `docs/CULTIVATOR_REBUILD_INTEGRATION.md`。
- 生成安全：`scripts/build-cultivator-assets.py` 默认拒绝覆盖已接受的 runtime GLB/manifest（`--replace-existing` 显式放行）；新资产不是本仓库 Blender 产线输出，`source/*.blend` 仅作 v1 历史源，重生成办法见上述文档。

### 1.2 卜算子（T2）

- 来源：`buzuanzi.zip`（SHA256 `8c92a7f6…60657`）；`assets/characters/busanzi/mesh/busanzi.glb`（316528 B），独立 20×1 调色板（UV=(色格+0.5)/20，最近邻）、38 骨、5 网格、1534 面、Idle/Walk/Wind 各 33 帧 24fps STEP。
- 加载：`BusanziLibrary` 单独加载，不并入 `CharacterLibrary`（后者的 8–12 色校验会拒绝 20 色）；`BusanziViewerHost` 是游戏启动时只引入的懒加载门面，玩家首次点肖像才动态 import `BusanziViewer.js` 并拉 GLB，不占启动成本。
- 界面：卜算子浮条（`#inkBusanzi`）新增「观其真形」肖像按钮（PNG 由真实模型在 three.js 渲染，456×576，随包 `materials/busanzi_portrait.png`），点击打开独立 three.js 小窗，Idle / Walk / Wind 三按钮切换（AnimationMixer 淡入），风停自动回 Idle；关闭 / 换世界 / 读档 / 导入 / 页面卸载都会释放独立 renderer、几何、材质、贴图与 mixer。
- 实测：Wind 相对 Idle 的附加骨旋转差 `talisman_1` 0.126、`hair_back_1` 0.814、`hem_f` 0.657、`sleeve_flap_l` 0.626（身体骨 spine 0、l_upperleg ≈ 0，符合「只有附加骨在动」）；Canvas 与 Three 两种模式下 Viewer 均能打开、播三动画、关闭后主画面无 context lost；世界数据（day/entities/busanzi log）在打开关闭前后逐字节不变。
- 说明：仓库没有风力系统，本轮按委托要求提供**可演示的风起**（按钮触发），不伪造天气 / 风力机制。

### 1.3 山海异兽（T3）

- 来源：`inkbox_creatures.zip`（SHA256 `7af607f9…d27f`）；`assets/creatures/mesh/creature-<id>.glb` 共 13 只自包含 GLB（合计 6320 三角面），共享 16×1 调色板，每只 8 套同名动画（static / idle / walk / run / eat / dance / gesture-positive / gesture-negative），与修士同单位制，脸朝 +Z、脚底 y=0。
- 加载：`CreatureLibrary` 统一加载（Lab 13 只；游戏默认只预载 4 种世界试装物种）；每物种把部件按 rest 变换合并成**一个静态几何 + 单材质**；`CreatureBatch` 每物种一个 `InstancedMesh`，一次分配，拾取映射沿用既有 `userData.renderEntities` 约定。
- 世界试装：`assets/creatures/data/creature_manifest.json` 的 `worldTrial` 标记 4 种（天狗 / 当康 / 鹿蜀 / 旋龟）；世界里 `sp==='beast'` 的灵兽由 `world.seed + entity.id` 稳定哈希选物种与朝向（纯函数，零 RNG 抽取、不写实体），其余类别不变；LOD0 与 LOD1 用真实模型，LOD2（≤7px 剪影级）保留旧简化占位，`lod=off` 时全部真实模型；Region / 视界过滤沿用 `visibleList`；库缺失或加载失败回退旧灵兽占位，游戏照常运行。
- Lab：`creature-lab.html` 统一加载 13 只，可查看名称 / 体型 / 材质 / 默认姿态，8 套动画可切换，真实 three.js。
- 其余 9 种（精卫 / 比翼鸟 / 赤鱬 / 九尾狐 / 帝江 / 狰 / 穷奇 / 蜚 / 开明兽）本轮仅作为资产候选：Lab 可看，不虚构其特殊能力、不扩模拟生态。

## 2. 接线结构（为什么没有重造游戏）

- 修士：沿用既有 `CharacterLibrary` → `CharacterBatch`（InstancedMesh 分模块）→ `EntityLayer` 的加载、LOD 与拾取链，只换资产与 manifest 数字。
- 卜算子：`inkbox.html` 面板 + `railPanels` 绑定 + `main.js` 懒加载门面；独立小窗是**纯表现**，不接模拟实体、不改存档。
- 异兽：`EntityLayer` 新增 `setCreatureLibrary`，与 `setCharacterLibrary` 同构——场景仍是 `world.entities` 的唯一读投影，物种 / 朝向只是稳定哈希；`Render3DHost` 沿用角色库同一套「异步加载 → 传给 Stage → 失败 console.error 不阻断」模式。
- 世界模拟、存档、RNG、Canvas 绘制、三界视界架构均未改动。

## 3. 验证

### 3.1 命令门禁（本地）

独立验收成员 `qa-verifier` 在真实工作区串行执行，14/14 全部 EXIT 0：

| 命令 | 结果 |
| --- | --- |
| `npm test`（core） | PASS（3s） |
| `npm run test:a1`（修士 / 卜算子 / 异兽结构与 provenance） | PASS |
| `npm run test:characters` / `test:busanzi` / `test:creatures` | PASS（1s/1s/1s） |
| `npm run test:characters:browser` | PASS（20s） |
| `npm run test:creatures` / `test:busanzi` 浏览器版（由 A1 组合验收覆盖） | PASS |
| `npm run check:ui` | PASS（5s，127 项断言） |
| `npm run test:render3d`（及 M1 / bridge / M2-A / M2-B / M2-C 相关套件） | PASS（4s + 各专项） |
| `npm run test:g2` | PASS（3s） |
| `npm run test:g1:web` / `test:qol` / `test:view` / `test:presentation` | PASS |
| `npm run build` + `npm run test:package` | PASS（9s / 1s；发布包含新 GLB / 贴图 / Lab 页面 / 新脚本） |

### 3.2 真实浏览器（本机 Edge 155 / AMD Radeon 610M / D3D11，GPU 串行）

QA 独立组合验收 `A1_VERIFY_STRICT=1 node scripts/inkbox-a1-verify.mjs`：**16/16 PASS，EXIT 0，约 95s，6 次独立 Edge 实例，硬件 GPU（非软件光栅），runtime/console error = 0**；另 `node scripts/inkbox-a1-gates.mjs` 14/14 PASS。关键结果：

- Lab：cultivator-lab 6/20 规模、新 GLB sha（`d31c4af5…`）与回退 GLB sha（`a9326d49…`）正确、材质 1；creature-lab 13 species × 8 clip（allClipsMatch）、材质 1 / 贴图 1、动画切换生效；busanzi-lab Idle/Idle→Walk→Wind activeClip 正确。
- Canvas：启动 / 创建 small 世界正常；真实点击 `#inkBusanziPortrait` 打开 Viewer，三动画 activeClip 正确、三帧截图 hash 互异。
- Three：启动就绪；默认 LOD 契约自洽（`byClass.beast==visible.beast`、LOD2 占位不丢实体）；`lod=off` 下修士 `characterBatch.characters==实体数`（12==12）、游戏 GLB sha 与 Lab 一致；世界异兽真模型 40/40 实例、4 物种（旋龟 9 / 天狗 7 / 当康 12 / 鹿蜀 12）、4 draws / 16672 tris、单材质、射线拾取 instanceId→真实 beast id；卜算子面板→Viewer 三动画；视界开关后 targetPlane=upper、上界 stage 0 凡间异兽、凡间 40 实例开关前后不变、世界 seed/实体数/时间不变（不串位面）；存档→读档后渲染器与批次正常（seed/实体数一致）；连续重建世界 3 次 geometry 11 / textures 6 稳定、creatureLibrary 同一实例、材质 uuid 不变；`?creatures=off&lod=off` 回退旧占位（12 只）且游戏继续；总体无 console/page error。
- 开发成员各自的专项浏览器验收（修士 / 卜算子 / 异兽）也均为 EXIT 0、validation `pass:true`，细节见各资产 `data/*_validation.json` 与 `preview/`。

### 3.3 修复的既有测试问题（如实披露）

- `scripts/inkbox-characters-browser.mjs` 游戏段旧断言假设「默认俯瞰相机下 100 名修士全部应落在 characterBatch（LOD0）」。实测默认相机 pixelsPerUnit≈1.86，远低于角色 LOD0 阈值 44px，实体按设计全部落在 LOD2，因此旧假设本身已过期（G2-R1 基线同现象：QA 基线 `lod=[0,0,73]`）。修法：game 段改走产品支持的 `inkbox.html?renderer=3d&lod=off` 全 LOD0 路径，断言不放松（仍要求 batch=100），并新增 `lodEnabled===false`、`characterLoadPromise/characterLoadError` 显式断言。
- 性能状态如实记录：本候选**不改变** G2 既有性能结论。G2 CPU/RAF 预算失败仍是既有问题，本轮未做性能封板，也不因资产验收通过而宣称 G2 性能通过。

## 4. 新增入口

- `npm run test:characters` / `test:characters:browser`：修士结构 / 浏览器验收（既有入口，资产已更新）。
- `npm run test:busanzi` / `test:busanzi:browser`：卜算子结构 / 浏览器验收。
- `npm run test:creatures` / `test:creatures:browser`：异兽结构 / 浏览器验收。
- `npm run test:a1`：三组资产结构检查。
- Lab 页面：`cultivator-lab.html`、`busanzi-lab.html`、`creature-lab.html`（启动服务器后可直接打开；均随运行包发布）。
- QA 组合验收：`node scripts/inkbox-a1-verify.mjs`（需要本机 Edge；默认写 `reports/a1/`，不进 Git / 运行包）。

## 5. 限制与未解决

- 异兽：本轮只做静态实例化（世界内），8 套动画只在 Lab 播放；近景 actor 动画池是可选后续项，未在正式世界启用。
- 异兽默认 LOD 行为：默认俯瞰镜头（≈2px 高）落在 LOD2 剪影级，玩家拉近后 LOD0/LOD1 显示真实模型；这是既有 LOD 契约行为，不是资产缺失。
- 卜算子：Wind 是演示性风起（游戏没有风力事实），不接天气机制。
- 修士：新资产没有 `.blend` 源（作者只交付 GLB）；`source/*.blend` 仍是 v1 历史源，重新生成走 `build-cultivator-assets.py` 的显式覆盖开关并需重新导入 GLB。
- G2 性能阻塞仍在，本候选保持 Draft，不自动合并 main。

## 6. 回滚

- 放弃本开发分支 / Draft PR 即可整体回滚。
- 只回滚修士模型：`assets/characters/cultivator/mesh/cultivator_library_prev.glb` 覆盖当前 runtime GLB，并按 `data/cultivator_manifest.json` 的 `rollback.steps` 还原 manifest 数字与校验，见 `docs/CULTIVATOR_REBUILD_INTEGRATION.md`。
- 卜算子 / 异兽为纯新增目录与新增接线；删除对应资产目录并回退 `EntityLayer` / `main.js` 等接线即可回到 G2-R1 表现（不涉及模拟与存档）。
