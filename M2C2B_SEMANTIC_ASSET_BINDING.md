# M2-C2B Pass1 资产语义绑定审计

审计依据：原始 main @ 508c271 的 World/derive 语义；当前本地与远端 main 均为 a8bf11d。期间修改 CI、Edge 验收探针与侧栏无变化内容的 DOM 复用；World、模拟与 3D 资产运行代码未变。本地 Edge 600-frame lifecycle / 6000-frame soak、24 组配对 / 48 张截图矩阵及干净 clone 构建已通过。远端 a8bf11d 的 Fast / Heavy 和当前 HEAD 的 Nightly 已通过。手动 CI 37192969664 attempt 1 的 Browser runner 与 GitHub 失联，矩阵结果和 soak 未完成；检查注释已保存，现仅重跑失败的 Browser job，attempt 2 的 Fast / Heavy / Browser、六套 Edge 矩阵及 600/6000 帧资源耐久全部通过，artifact JSON 已核对，Package 0 已封板于 a8bf11d。用户已授权本委托书范围内已完成本地验收、可查看差异的提交推送 origin/main 并运行 CI。所有模型均来自项目原创实验资产。P 只表示已有可合法绑定的事实，不表示本轮全部投产。正式接线顺序仍服从委托书。

接入状态：本审计落盘时，新环境资产尚未进入 runtime 或玩家 package。表中的“计划进入”分别表示 runtime 候选和 package 候选，两者都必须通过后续技术样本与完整验收门禁。既有角色库保留原运行包，L 模块仍禁止根据移动状态或 realm 自动激活。

P=Production-safe；D=Decorative-only；L=Style Lab；X=本轮禁止正式接入。小屋/院落按 B2 明确授权，仅作为同一个真实 HOUSE 的轮廓，不增加家庭阶层、用途或独立附属屋舍。

| asset id / 来源名 | 状态 | 原文件 | World 语义来源 | realm | identity owner | pick policy | LOD policy | HLOD policy | palette role | runtime / package | 确定性派生 | 未来新语义需要 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mortal.house.base / bld_house | P | 美术素材/实验建筑资产/建筑/bld_house.glb | village.houses 候选＋当前 world.struct 为 HOUSE | mortal | 村落＋屋舍坐标 | house/terrain | 正式 LOD0 / 人工 LOD1 / 极简 LOD2 | 现有 2–4 屋顶簇；settlement owner | RealmStyleProfile 建筑/对应事实槽 | 计划进入，须逐包过门禁 | 允许，只读现有事实＋stable hash | 否 |
| mortal.house.hall / bld_hall | P | 美术素材/实验建筑资产/建筑/bld_hall.glb | village.houses 候选＋当前 world.struct 为 HALL | mortal | 村落＋屋舍坐标 | house/terrain | 正式 LOD0 / 人工 LOD1 / 极简 LOD2 | 现有 2–4 屋顶簇；settlement owner | RealmStyleProfile 建筑/对应事实槽 | 计划进入，须逐包过门禁 | 允许，只读现有事实＋stable hash | 否 |
| lab.tower / bld_tower | L | 美术素材/实验建筑资产/建筑/bld_tower.glb | STRUCT.TOWER 枚举未证明当前有真实塔 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，实际塔结构 |
| lab.gate / bld_gate | L | 美术素材/实验建筑资产/建筑/bld_gate.glb | faction capital 是锚点，不证明独立门楼 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，门楼/入口事实 |
| lab.wall / bld_wall | L | 美术素材/实验建筑资产/建筑/bld_wall.glb | STRUCT.WALL 枚举未证明当前有真实墙 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，实际墙结构 |
| mortal.struct.ruin / bld_ruin | P | 美术素材/实验建筑资产/建筑/bld_ruin.glb | world.struct / STRUCT.RUIN，实际破坏后结构格 | mortal | terrain cell | terrain | 本轮不接线 | 不新增 | RealmStyleProfile 建筑/对应事实槽 | 否 | 允许，只读现有事实＋stable hash | 否，仅待后续接线 |
| lab.altar / bld_altar | L | 美术素材/实验建筑资产/建筑/bld_altar.glb | 没有祭坛地点/用途事实 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，祭坛地点 |
| lab.bridge / bld_bridge | X | 美术素材/实验建筑资产/建筑/bld_bridge.glb | 没有桥梁或跨水通行拓扑 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，桥梁拓扑 |
| mortal.site.cave / terr_cave | P | 美术素材/实验建筑资产/地形/terr_cave.glb | sites[].kind === cave | mortal | site.id | site/terrain | 本轮不接线 | 不新增 | RealmStyleProfile 建筑/对应事实槽 | 否 | 允许，只读现有事实＋stable hash | 否，仅待后续接线 |
| environment.arch / terr_arch | D | 美术素材/实验建筑资产/地形/terr_arch.glb | 只读真实地形附着的自然岩体 | upper/nether | 无 | none | 本轮不接线 | none；密度/屏幕预算 | RealmStyleProfile 岩石/纸/矿物槽 | 否 | 允许，只读现有事实＋stable hash | 作为地点需要新语义 |
| environment.pillar / terr_pillar | D | 美术素材/实验建筑资产/地形/terr_pillar.glb | 真实 height/slope/type＋稳定 hash | upper/nether | 无 | none | 低模 / 简化 / 远距关闭 | none；密度/屏幕预算 | RealmStyleProfile 岩石/纸/矿物槽 | 计划进入，须逐包过门禁 | 允许，只读现有事实＋stable hash | 作为石林地点需要新语义 |
| environment.cliff / terr_cliff | D | 美术素材/实验建筑资产/地形/terr_cliff.glb | 真实 height/slope/type＋稳定 hash | upper/nether | 无 | none | 低模 / 简化 / 远距关闭 | none；密度/屏幕预算 | RealmStyleProfile 岩石/纸/矿物槽 | 计划进入，须逐包过门禁 | 允许，只读现有事实＋stable hash | 作为独立断崖身份需要新语义 |
| environment.rock / terr_rock | D | 美术素材/实验建筑资产/地形/terr_rock.glb | 真实 height/slope/type＋稳定 hash | upper/nether | 无 | none | 低模 / 简化 / 远距关闭 | none；密度/屏幕预算 | RealmStyleProfile 岩石/纸/矿物槽 | 计划进入，须逐包过门禁 | 允许，只读现有事实＋stable hash | 作为实体/地点需要新语义 |
| environment.terrace / terr_terrace | D | 美术素材/实验建筑资产/地形/terr_terrace.glb | 只允许贴地岩台，不是云台/可走新地形 | upper | 无 | none | 低模 / 简化 / 远距关闭 | none；密度/屏幕预算 | RealmStyleProfile 岩石/纸/矿物槽 | 计划进入，须逐包过门禁 | 允许，只读现有事实＋stable hash | 正式云台需要 topology/site |
| lab.stairs / terr_stairs | X | 美术素材/实验建筑资产/地形/terr_stairs.glb | 高程不是可通行台阶/路线事实 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，真实路径 |
| environment.slab / terr_slab | D | 美术素材/实验建筑资产/地形/terr_slab.glb | 只允许贴地石片，不是祭台/新地面 | upper/nether | 无 | none | 低模 / 简化 / 远距关闭 | none；密度/屏幕预算 | RealmStyleProfile 岩石/纸/矿物槽 | 计划进入，须逐包过门禁 | 允许，只读现有事实＋stable hash | 作为地点需要新语义 |
| mortal.house.courtyard / bld_manor | P | 美术素材/实验建筑资产/宗门宅院/bld_manor.glb | 同一真实 HOUSE 的院落轮廓；不推断富户身份 | mortal | 村落＋屋舍坐标 | house/terrain | 正式 LOD0 / 人工 LOD1 / 极简 LOD2 | 现有 2–4 屋顶簇；settlement owner | RealmStyleProfile 建筑/对应事实槽 | 计划进入，须逐包过门禁 | 允许，只读现有事实＋stable hash | 否 |
| lab.dorm / bld_dorm | L | 美术素材/实验建筑资产/宗门宅院/bld_dorm.glb | 有宗门/弟子，不证明宿舍建筑 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，房屋用途 |
| lab.alchemy-building / bld_alchemy | L | 美术素材/实验建筑资产/宗门宅院/bld_alchemy.glb | 人物 alchemy path 不证明丹房地点 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，建筑用途 |
| lab.scripture-building / bld_scripture | L | 美术素材/实验建筑资产/宗门宅院/bld_scripture.glb | 没有藏经阁地点 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，地点用途 |
| lab.forge / bld_forge | L | 美术素材/实验建筑资产/宗门宅院/bld_forge.glb | 有法宝，不证明炼器建筑 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，建筑用途 |
| lab.beastpen / bld_beastpen | L | 美术素材/实验建筑资产/宗门宅院/bld_beastpen.glb | 有灵兽，不证明兽棚地点 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，建筑用途 |
| mortal.house.small / bld_hut | P | 美术素材/实验建筑资产/宗门宅院/bld_hut.glb | 同一真实 HOUSE 的小屋轮廓；不推断贫富/职业 | mortal | 村落＋屋舍坐标 | house/terrain | 正式 LOD0 / 人工 LOD1 / 极简 LOD2 | 现有 2–4 屋顶簇；settlement owner | RealmStyleProfile 建筑/对应事实槽 | 计划进入，须逐包过门禁 | 允许，只读现有事实＋stable hash | 否 |
| lab.sectruin / bld_sectruin | L | 美术素材/实验建筑资产/废址/bld_sectruin.glb | 通用 ruin site 不证明曾属于宗门 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，宗门遗址子类型 |
| mortal.site.ruin / bld_relic | P | 美术素材/实验建筑资产/废址/bld_relic.glb | sites[].kind === ruin | mortal | site.id | site/terrain | 本轮不接线 | 不新增 | RealmStyleProfile 建筑/对应事实槽 | 否 | 允许，只读现有事实＋stable hash | 否，仅待后续接线 |
| lab.spiritfield / terr_spiritfield | L | 美术素材/实验建筑资产/特殊地形/terr_spiritfield.glb | 肥力/灵气不是灵田身份 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，灵田事实 |
| mortal.terrain.road / terr_ancientroad | P | 美术素材/实验建筑资产/特殊地形/terr_ancientroad.glb | 实际 OVER.ROAD / TERRAIN.ROAD，不宣称古迹 | mortal | terrain cell | terrain | 本轮不接线 | 不新增 | RealmStyleProfile 建筑/对应事实槽 | 否 | 允许，只读现有事实＋stable hash | 否，仅待后续接线 |
| mortal.terrain.mountain-road / terr_mountainpath | P | 美术素材/实验建筑资产/特殊地形/terr_mountainpath.glb | 实际 ROAD＋现有高程/坡度；不生成新路 | mortal | terrain cell | terrain | 本轮不接线 | 不新增 | RealmStyleProfile 建筑/对应事实槽 | 否 | 允许，只读现有事实＋stable hash | 否，仅待后续接线 |
| lab.plankwalk / terr_plankwalk | X | 美术素材/实验建筑资产/特殊地形/terr_plankwalk.glb | 没有栈桥/木道通行事实 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，通行拓扑 |
| lab.spring / terr_spring | L | 美术素材/实验建筑资产/特殊地形/terr_spring.glb | 水文不是灵泉/泉眼身份 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，泉眼事实 |
| lab.lightning-scar / terr_blast | L | 美术素材/实验建筑资产/特殊地形/terr_blast.glb | fire/terrain 不证明雷击历史 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，事件痕迹 |
| lab.battlefield / terr_battlefield | L | 美术素材/实验建筑资产/特殊地形/terr_battlefield.glb | 战争系统不证明古战场 site | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，地点/事件痕迹 |
| mortal.site.formation / terr_array | P | 美术素材/实验建筑资产/特殊地形/terr_array.glb | sites[].kind === formation | mortal | site.id | site/terrain | 本轮不接线 | 不新增 | RealmStyleProfile 建筑/对应事实槽 | 否 | 允许，只读现有事实＋stable hash | 否，仅待后续接线 |
| lab.lair / terr_lair | L | 美术素材/实验建筑资产/特殊地形/terr_lair.glb | 兽类实体不证明巢穴地点 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，巢穴身份 |
| lab.immortalcave / terr_immortalcave | L | 美术素材/实验建筑资产/特殊地形/terr_immortalcave.glb | 普通 cave site 不证明仙人洞府 | Lab only | 无 | none | 本轮不接线 | 不新增 | 源色板，仅实验 | 否 | 仅 Lab；不可派生到 World | 是，具体洞府身份 |

共 35 件：P 10 / D 6 / L 16 / X 3。本轮候选正式接线为三种 HOUSE 轮廓＋真实 HALL；D 六件中仅 rock/cliff/pillar/terrace/slab 候选进入。其余 P 保留合法绑定的审计结果，本轮不扩成第二批地点家族。

D 的造型也必须通过语义检查：当前 terr_terrace 的对称台阶、terr_slab 的横梁以及 terr_rock 的规则底座容易读成人工台基。本轮投产前需简化/去除这些建筑线索，改为不规则岩层；terrace/slab 只允许在真实缓坡上低矮贴地，不可形成可走新平台、祭台或云台。pillar 可保留天然柱状岩的主轮廓，顶面与块体需避免碑柱/仪式轴线读法。运行 manifest 应记录源件与实际简化方式，不能仅改名称宣称语义安全。

语义证据：config.js 的 STRUCT/OVER/TERRAIN；sim/life.js 的 villages[].houses[].type 写入、真实 ruin site；sim/sites.js 的 cave/formation；sim/terrain.js 的 ROAD overlay；SettlementLayer.deriveSettlements。house 没有持久 houseId，稳定视觉键使用 village.id＋原 house.x/y，禁止使用易变 sourceIndex。village.level 只表示聚落等级；faction.capitalX/Y 不证明独立 gate/wall/tower。

所有 HOUSE 变体必须归一到原屋舍 footprint，尤其 courtyard 不可盖住邻屋。门楼/厢房/院墙是该单实例几何，不能拆成额外 identity。HALL 仅映射真实 STRUCT.HALL。

当前 deriveSettlements 将 HOUSE/HALL 统一输出为 type=house，只用建造时的 houses[].type 调整尺寸。这个 type 是快照：地震会把当前 world.struct 改成 RUIN，陨石会清空结构格，两条路径都不更新 houses 列表。因此正式接线以 village.houses 提供候选坐标与村庄归属，再读取当前 world.struct[world.idx(h.x,h.y)] 判断结构是否仍为 HOUSE/HALL。仅当前 HOUSE/HALL 可进入正式屋舍资产；已毁/清空格不借旧记录恢复建筑。瞬态 render record 保留原 x/y、建造快照和当前 structType，不得按体量、聚落等级或数组索引反推宗祠身份。这不增加 World/save 字段。地面无主法宝来自 world.artifacts，持有中的法宝仍属于 entity.artifacts，两者不可混为同一拾取对象。

存续证据：sim/life.js 的建造同时写 struct 与 houses；sim/powers.js 的 earthquake 写 STRUCT.RUIN、陨石清 struct；stepVillages/abandon 仅在整村废弃时移除村庄，没有单屋 houses 重同步路径。正式资产统计必须另记历史候选数、当前存续 HOUSE/HALL 数和已毁/清空数，不能把语义过滤带来的几何减少冒充 LOD 性能收益。

自然内容覆盖证据（只读 CPU、未运行 GPU）：实际 VisualScenarios 的 GOLDEN_A 有 Upper 12 个实体、Nether 0 个实体与 24 件地面法宝；NETHER_STYLE_A 严格按 7200×3 日推进后有 Upper 12 个实体、Nether 120 个普通 ghost＋1 个 ghostCultivator 与 120 件地面法宝。Upper 两场景合并覆盖 basic/alchemist/elder，均未覆盖 sect_disciple；不得声称不存在的分支已做自然场景验收。凡间/Upper 真实 height 范围为 0–1，Nether 约 0.25–0.7，装饰规则须读取各界真实高程/坡度而非共用不适用的高山阈值。完整审计位于 ignored reports/m2c2b/pass1/b0/realm-natural-content-audit.json。

## 既有角色模块

同一个 cultivator_library.glb / body / rig 继续复用。节点均为已有模块，runtime/package 随原库保留；L 标记表示目前没有合法 World role 自动激活该模块，并不拆删既有角色库。

既有 Presentation role `elder` 按真实 level>=20 选择高阶外形；这不是 `faction.elders` 职务声明，也不新增长老成员关系。Upper 只扩展同一真实实体的三界颜色，不凭 realm 新造 role、职业或宗门身份。

| asset id / 原 node | 状态 | World/Presentation 来源 | realm | identity owner / pick | LOD / HLOD | palette | runtime / package | 确定性派生 / 新语义 |
|---|---|---|---|---|---|---|---|---|
| cultivator.body_base / cultivator_body_base | P | 真实 level>0 entity / ghostCultivator | 按真实所属 plane；ghost 模块仅 ghostCultivator | 真实 entity.id / entity | 模块化 LOD0 / 原角色 LOD1/2；无 HLOD | RealmStyleProfile atlas12 语义槽 | 原库保留 / 是 | 只读身份映射；L 自动启用须先有真实 role |
| cultivator.hair_base / cultivator_hair_base | P | basic/sect_disciple/alchemist 的既有 role | 按真实所属 plane；ghost 模块仅 ghostCultivator | 真实 entity.id / entity | 模块化 LOD0 / 原角色 LOD1/2；无 HLOD | RealmStyleProfile atlas12 语义槽 | 原库保留 / 是 | 只读身份映射；L 自动启用须先有真实 role |
| cultivator.hair_elder / cultivator_hair_elder | P | 真实 level>=20 的 elder role | 按真实所属 plane；ghost 模块仅 ghostCultivator | 真实 entity.id / entity | 模块化 LOD0 / 原角色 LOD1/2；无 HLOD | RealmStyleProfile atlas12 语义槽 | 原库保留 / 是 | 只读身份映射；L 自动启用须先有真实 role |
| cultivator.elder_mantle / cultivator_elder_mantle | P | 真实 elder role 的 robe | 按真实所属 plane；ghost 模块仅 ghostCultivator | 真实 entity.id / entity | 模块化 LOD0 / 原角色 LOD1/2；无 HLOD | RealmStyleProfile atlas12 语义槽 | 原库保留 / 是 | 只读身份映射；L 自动启用须先有真实 role |
| cultivator.hair_ghost / cultivator_hair_ghost | P | 真实 soulKind=ghostCultivator | 按真实所属 plane；ghost 模块仅 ghostCultivator | 真实 entity.id / entity | 模块化 LOD0 / 原角色 LOD1/2；无 HLOD | RealmStyleProfile atlas12 语义槽 | 原库保留 / 是 | 只读身份映射；L 自动启用须先有真实 role |
| cultivator.ghost_torn_hem / cultivator_ghost_torn_hem | P | 真实 ghostCultivator 的 robe | 按真实所属 plane；ghost 模块仅 ghostCultivator | 真实 entity.id / entity | 模块化 LOD0 / 原角色 LOD1/2；无 HLOD | RealmStyleProfile atlas12 语义槽 | 原库保留 / 是 | 只读身份映射；L 自动启用须先有真实 role |
| cultivator.sword_simple / cultivator_sword_simple | P | 真实 sect_disciple/elder role | 按真实所属 plane；ghost 模块仅 ghostCultivator | 真实 entity.id / entity | 模块化 LOD0 / 原角色 LOD1/2；无 HLOD | RealmStyleProfile atlas12 语义槽 | 原库保留 / 是 | 只读身份映射；L 自动启用须先有真实 role |
| cultivator.sect_token / cultivator_sect_token | P | 真实 faction>0 的 sect_disciple role | 按真实所属 plane；ghost 模块仅 ghostCultivator | 真实 entity.id / entity | 模块化 LOD0 / 原角色 LOD1/2；无 HLOD | RealmStyleProfile atlas12 语义槽 | 原库保留 / 是 | 只读身份映射；L 自动启用须先有真实 role |
| cultivator.alchemy_tag / cultivator_alchemy_tag | P | 真实 dao.path.key=alchemy | 按真实所属 plane；ghost 模块仅 ghostCultivator | 真实 entity.id / entity | 模块化 LOD0 / 原角色 LOD1/2；无 HLOD | RealmStyleProfile atlas12 语义槽 | 原库保留 / 是 | 只读身份映射；L 自动启用须先有真实 role |
| cultivator.soul_lamp / cultivator_soul_lamp | P | 既有 ghostCultivator role 的 prop；不是普通鬼或通用法宝 | 按真实所属 plane；ghost 模块仅 ghostCultivator | 真实 entity.id / entity | 模块化 LOD0 / 原角色 LOD1/2；无 HLOD | RealmStyleProfile atlas12 语义槽 | 原库保留 / 是 | 只读身份映射；L 自动启用须先有真实 role |
| cultivator.pack_traveler / cultivator_pack_traveler | L | wanderer 只为现有 Lab 预设；state=wander 不代表身份 | 按真实所属 plane；ghost 模块仅 ghostCultivator | 真实 entity.id / entity | 模块化 LOD0 / 原角色 LOD1/2；无 HLOD | RealmStyleProfile atlas12 语义槽 | 原库保留 / 是 | 只读身份映射；L 自动启用须先有真实 role |
| cultivator.gourd_small / cultivator_gourd_small | L | 同上，不根据移动状态随机装备 | 按真实所属 plane；ghost 模块仅 ghostCultivator | 真实 entity.id / entity | 模块化 LOD0 / 原角色 LOD1/2；无 HLOD | RealmStyleProfile atlas12 语义槽 | 原库保留 / 是 | 只读身份映射；L 自动启用须先有真实 role |

模块原文件为 assets/characters/cultivator/mesh/cultivator_library.glb；配置为 data/cultivator_manifest.json，装配经 characterAppearanceOf / CharacterLibrary.resolveAppearance / CharacterBatch。每个 body 与附件命中都回到同一真实 entity.id，不能新增令牌拥有关系或 profession 字段。

Upper 外观只投影真实 Upper entities，复用现有 body/rig；普通 ghost 的低成本轮廓家族绑定真实 soulKind=ghost，并与 ghostCultivator 分开。地面 artifact 只绑定 world.artifacts[].id，不能将通用法宝假称为魂灯。所有 D 资产无 identity、无 picker、无碰撞、无 save，使用同一 Stage 的 ElevationField/RegionGeometry，并可关闭。
