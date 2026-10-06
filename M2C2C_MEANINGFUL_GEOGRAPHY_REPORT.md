# M2-C2C Meaningful Geography 工程报告

2026-10-06。施工基线为 main e0a851c51acc86c98062c42e344ef1f26f6dcf80。
本地工程交付已通过：完整23对GPU矩阵、两个祖先回归、11×600日纯度、600＋6000产品帧、独立干净克隆与包审计。
最终门禁见[READINESS](./M2C2C_READINESS.md)与[compact acceptance summary](./reports/release/render3d-m2c2c/summary/acceptance-summary.json)。远端Push门禁以本轮main提交的Actions状态为准；手动C2C Browser/Nightly尚未执行。

## 交付与范围

本阶段把四类现有 Site、真实灵脉、Upper qi、Nether veg 和现有裂隙事实接入同一个 Host / 三个 PlaneStage。新增六个独立表现开关：sites、leylines、upperQi、netherYin、rifts、riftFx。产品 3D 默认开启，geography=off 可回到既有生产资产对照，assets=off 保留旧几何。

先单独提交 C2B 真相同步和生产契约，再按委托书的 pilot、四类 Site、Leyline、Nether、Upper、Rift、跨界、耐久与视觉顺序施工。世界生成、生态、移动、裂隙规则和存档模块没有功能修改。所有新身份仍由当前 World 查验，所有新派生缓存归 Stage 所有。

资产细节见 [Site](./assets/environment/docs/M2C2C_SITE_FAMILIES.md)、[Leyline](./assets/environment/docs/M2C2C_LEYLINE_GEOGRAPHY.md)、[Field](./assets/environment/docs/M2C2C_FIELDS.md) 与 [Rift](./assets/environment/docs/M2C2C_RIFTS.md)。[语义审计](./M2C2C_WORLD_SEMANTIC_MAP.md) 固定描述 e0a851c 开工基线，不把历史缺口改写为当前状态。

## 24 项封板答复

1. **C2B truth sync。**修正 README、STATUS、HANDOFF、ROADMAP、ARCHITECTURE、BACKLOG、三份 C2B 报告、实体契约和测试索引的“远端待收口”“资产未生产”和旧阶段当前口径。基线 Push [37224093479](https://github.com/sjh20016/inkbox/actions/runs/37224093479)、Windows [37224107941](https://github.com/sjh20016/inkbox/actions/runs/37224107941)、800 年 Nightly [37233858438](https://github.com/sjh20016/inkbox/actions/runs/37233858438) 均 success；证据只支持该基线。

2. **正式上位规则。**[ASSET_PRODUCTION_SPEC](./ASSET_PRODUCTION_SPEC.md) 已独立建立并由资产契约、交接与测试索引引用，规定语义 ID、P/D/L/X、共享节点、资源所有权、证据上限和 Browser 分层。

3. **独立分类预算。**site、decoration、artifact 均有独立 PresentationBudget threshold/category，沿用 projected-pixel 和 hysteresis；后两者初始视觉阈值与旧 tree 相同。对应 Node gate 通过。

4. **共享几何。**Secret/Cave 共享 LOD1 入口；四类 Site 共享 LOD2 六面墨形；Formation LOD0/1 共用一块真实 12tri 石块，按 8/4 阵点装配。Site 总计 7 个唯一几何，没有为四类复制十二套池。既有 ghost far、自然装饰 silhouette 和真实聚落 roof HLOD 共享继续保留。Site 不新增 HLOD 身份。

5. **四种 Site 字段。**均来自唯一 deriveMarkers(world.sites) 的当前 id/x/y/kind。Secret 使用统一异象入口，不按 sub 猜美术；Cave、Formation、Ruin 用 kind 选择轮廓。age、visits、名称等仍由真实检视 reader 显示，不生成新的 World subtype 或 kind。

6. **生命周期。**真实 removeSite、Secret 第二次访问探尽以及四类既有寿命关闭均清空当前实例身份，恢复/刷新沿用现有 marker cadence。未知 kind、地形不适合、容量满和无资产时保留真实 fallback。

7. **当前身份。**每个 Site 子实例携父 Site id/x/y/kind；Picker 校验当前 World 的同 id 和坐标，移除后即拒绝旧几何。正式 GPU 通过项目脚本按实际三角形射线和 CDP 点击检验，结果见视觉验收；CPU raycast 不充当浏览器证明。

8. **Site draws/triangles。**平坦四类 fixture 的详细档为 4 draw、11 物理实例、336 tri；中档 3 draw、7 实例、156 tri；远档 1 draw、4 实例、24 tri。身份仍是 4 个 Site。自然 200 年 World 的 CPU admission 为 45 身份、52 实例、3780 tri、4 draw。实际对旧 Marker 的 GPU 增量见性能配对表。

9. **灵脉事实源。**唯一源为当前 world.leylines 的 id/x/y/strength/radius；不修改 qi、terrain、宗门控制或产出。短纹段保留同一个灵脉 id，真实移除后同步消失。

10. **strength。**同一语义配色中，真实强度改变纹段数、宽度与连贯度，radius 限制范围。每段沿真实 ElevationField 局部切面贴地并向地表最小残差埋入，过水、跨 Region 或全埋段诚实拒绝；没有光柱或灵脉建筑。

11. **阴气。**ScalarFieldTexture 只读 Nether world.veg，按一格一字节量化到 R8；高值加深冷墨，低值保留更多纸色。材质保留原有 type/height/river 骨架，不用鬼密度生成永久布局。

12. **消散留痕。**正常模拟的 Nether 历史采样记录 900 日真实 veg 正增量，固定 World 和相机用旧/新原始 R8 快照比较 shader 输出，随后恢复当前纹理；不回写 World/cache。实际前景地表颜色差异的最终结果见视觉验收。源码审计确认该自然窗口内 veg 的唯一动态写入者是鬼消散；900 日聚合采样没有关联单个消失的鬼及坐标，因此仅证明自然场增量与可见输出，不能宣称直接观察到某个鬼的消散，或整张地图形成新聚落。

13. **Nether 字段。**没有新增模拟字段、城市、阴巢或 Trace field；新增内容只是 Stage 材质缓存和测试证据。

14. **Upper qi。**独立 Upper Stage 的 field 只读 Upper world.qi，单独 R8 纹理和 mode=1；不会借用 Mortal qi 或 Nether veg，也不把高值变成 Site。

15. **人—地关系。**只读 60 年固定 medium 配方观察 12 修士、720 entity-years：walkable qi p10/p50/p90=.684/.936/1，26.40% 格饱和；第 60 年当前位置 75%、目标 91.7% 为 qi=1，目标减当前位置均值 +.0062。年采样端点累计移动均值 1487.39 格、首末位移 39.03 格。六次全 World/advance SHA 只读探针通过。高初始 qi、饱和、单 seed 和年度采样仅支持现有局部采样行为与高 qi 同位，不能证明全图吸引或连续路径。

16. **Upper 语义。**没有新增仙台、宫殿、假 Site、仙门锚或浮岛。独立 field 材质保持纸白、矿物色和有限自然装饰。

17. **持久 Rift。**单一 deriveMarkers/world.rifts 读取 id/x/y/age/targetPlane；radius 仅调用既有 visibleRift/riftRadiusAt。伤口是 14 段断裂边缘，真实关闭/移除/迁移后刷新，未知目标诚实 fallback。Mortal 持久对象沿用已有 Region 例外，目标界缘由 Host/Boundary 的真实 targetPlane 契约处理。

18. **短命事件。**ThreeFxProbe 消费已有 PresentationStage.snapshotPlane(plane)，映射上游 rift-open、rift-cross、possession、ascension 对应的 rift/riftcross/possession/ascension 快照。真实完整 from/to/phase 才决定拖墨方向；缺字段用通用版。

19. **唯一消费口。**main.js 的 PresentationStage.ingestWorlds 仍是唯一 runtime drain 路径。新增 Three/FX 模块没有第二次 drain。池固定 64 events × 4 strokes=256，1 draw/1536 tri 上限，过期清 count，overflow 可读，不按事件创建/销毁 mesh。

20. **模拟纯度。**11 模式各推进 600 日，完整 World、advanceState、save SHA 与 save keys 完全一致，五个直接计数流和六个隐藏流位置一致。CPU fixture 明确使用相同平坦 Site 测试地块；浏览器使用自然 World。共同 full SHA 为 4b37e9605591ef48e986833513a5f633da7ef28bc080f326dc884efe44abb498。

21. **计时和 GPU 成本。**同机同 World/相机配对的产品 RAF CPU update、CPU submit、GPU timer、draw、tri、驻留几何/纹理/program 详见 [性能报告](./M2C2C_PERFORMANCE_REPORT.md)。GPU timer 不可用时记录 unavailable，不从 CPU 或帧率推算 GPU 时间。

22. **6000 帧。**固定资源预热后，以 600 lifecycle 和 20×300 product RAF 检查各视界、LOD、production/style/field 开关、Site dense、高 qi/veg 与真实冻结 Rift 快照 burst。逐状态和逐 30 帧资源、字段上传计数、material refs 及 GC 后 CPU 内存门禁结果见 READINESS。

23. **Git/dist 增量。**以 e0a851c 精确构建包作为基线：300 文件、8175787 bytes、ZIP 2563944 bytes；新包与本轮 Git tree 差分的最终尺寸记录在性能报告。原历史 PNG/提交不重写，新阶段最多 8 张 Golden + compact JSON；全矩阵和 proof ignored / artifact。

24. **下一阶段裁决。**优先考虑已有宗门/灵脉的空间归属与锚点表达，再评估 Upper 仙门的真实 World 锚点设计。250 年 R2 中局部流量与占据相关 .8904、热点重合 64.17%，不足以支持 runtime 道路。Upper 已有高 qi 因果但尚无正式聚落锚，须先定义真实语义；幽冥城市/经济扩展也需另行设计授权。当前不将高场值自动升级为文明。

## 条件研究

R1 留在 Lab 候选：正式 CharacterBatch 剔除 skin attributes，使用共享 InstancedMesh 和静态 LOD；资产虽有 rig/Idle/Walk，运行时没有群体骨骼消费路径。新增每实体 SkinnedMesh/Mixer 会绕开现有批处理，适合另立 GPU pose instancing 试验，未作为本阶段完成条件。

R2 完成独立 250 年 headless 采样，脚本与研究报告（开发仓库路径 research/MOVEMENT_TRACE_REPORT.md）进入开发仓库，149511-byte 全结果留 ignored。五次观察探针通过；采样只统计端点及近邻转移，没有补路径、写 World、生成道路或进入运行包。

## 冷启动复现

独立干净克隆的旧Browser自行推进路径曾生成不同Site分布，Secret/Formation被既有完整footprint规则拒绝。现在Browser与Soak统一在GPU测量前由Node普通配方生成自然产品存档：Mortal seed226/small/3日步长/day72000，Realms既有NETHER_STYLE_A/60年配方。默认缺失或全部core/world/sim/io源码、Node/V8、存档SHA不匹配时重建；显式无效输入拒绝，仍经产品importFile导入。

两配方重新生成的save、完整World、advanceState及900日历史均与完整23对矩阵的原输入逐字节一致；8项显式坏缓存检查通过。干净克隆d9ca78b从缺Mortal缓存自动生成并重建Realms，额外1/4两对GPU完成，Formation105约90px、38/96前景三角及实际点击105通过，World/advance/camera不变、无运行错误。该诊断保持pass:false/diagnosticComplete，只证明冷启动，不替代完整23对矩阵。完整失败及修复证据留ignored，并在compact summary记录SHA。这里不声称长模拟在不同Node/Browser引擎之间逐字节相同。
