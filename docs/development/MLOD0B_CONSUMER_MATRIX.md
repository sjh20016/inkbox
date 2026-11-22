# 人口消费者矩阵 · MLOD-0B.1

本包从远端 #74 的 `3772bea8fa7b7ef753770c3a47877e6b461dd3c8` 单独起分支，对应 `arch/wx-e2ra2-committed-view`。开工时 GitHub 的 #74 为 open、draft、未合并，远端 main 为 `bd62ade03c56908ce5942f7100d6b5cb2bc38934`。Git 祖先检查通过 #68→#72→#73→#74，#75 不是 #74 的祖先。本地研究提交 `f70d3f3f5bad8d144d9fa4a332efb5a4495b8ec4` 的父提交正是 #74；已读取其依赖审计、原生减数证据和首包限制。本次开工的远端 heads 未列出该研究分支。研究代码不构成本包的构建依赖。

在工作树根目录运行 `node scripts/inkbox-mlod0b-source-audit.mjs` 重建[固定树命中及输入清单](../../reports/mlod0b/source-audit.json)。脚本针对官方产品源树列出 101 个文件、862 个匹配行号，下面按实际调用链审计所有者、时期、写入与业务含义。数组/堆的 `pop()` 不表示人口；反过来，仅搜索 pop 会漏掉 `level`、`faction`、成员筛选与序列化行。以下路径以 `src/inkbox/` 为根。RNG 栏区分读取本身和其调用者据此进行的抽签。

| 所有者及入口 | 实际谓词、更新边界、缓存 | 业务后果、RNG、可替代性 | 验证入口或首个反例 |
|---|---|---|---|
| world/World.js 构造、addEntity、ID 查找；sim/entityReadView.js | 每界有各自实体数组和 ID 段。空间桶与 ID 检索来自该数组；同长度原地改宗或换村不保证改变索引版本 | 生命、近邻、查询、装备和命簿都需真实身份。计数不能替代身份查询；E1C 方法身份变化还会切换读取路径 | wx-e1c；等长替换、跨界和相同 ID 的新会话 |
| core/demographics.js | 人指 human/cultivator；修士还须 level>0。成年按有限 age≥6480 日；适育下限含、上限 18000 日不含。hasMortalResidents 还须 hp>0、未飞升、有限年龄且未达寿元 | 无 RNG。它是允许自然出生的必要条件；有根、物种名或两名修士都不足以证明本村有凡人 | c1-birth、g8-demography；零修为 cultivator、50 岁生日 |
| sim/life.js processPendingSpawns、spawn、stepEntity、onDeath | 排队和成功入列不同。自然出生检查两位不同、在世、同村适龄且仍在数组中的人和本村在世凡人；随后受人口上限、落点和魂路限制。实体阶段后稳定压缩死亡和飞升行。生命终止进入死者/物品/关系路径 | 选点、个体推进及出生消耗 Life RNG；不能用统计值选出父母或将意向算作出生。写者为实际增删/归属事务 | red-fixture、phases、c1；拒绝无亲出生时世界及随机游标不动 |
| sim/family.js pickParents、registerBirth、stepFamily；sim/relations.js | 在近邻同村活人候选中选双亲；出生成功写稳定亲缘和出身。年际聚族、继承、师徒使用真实 ID。空间索引里可有当拍死者 | 世界顺序、可达性、年龄及父母身份均影响选择；家世记录不能由人数重造 | c1、wanxiang:s11、save-equivalence；跨村、双修士无凡人 |
| sim/life.js syncVillagePops、countVillageResident | 先清零每村，再扫描当前居民；存活归村异兽也进 village.pop。humans/适育 humans 包含修士，adults 是成年凡人。与经济读者在异常 hp / 寿元输入上的比较形式也有差别 | 不抽签；是 Life 自己的阶段缓存，食品/生育次数依赖它；只有在同步刚完成的同一点才强求与当前实体逐村相同 | census、phases；归村异兽与适育修士 |
| sim/life.js stepVillages、stepFounding、maybeSplitVillage、abandonVillage；sim/divine.js | 归村、脱村、建村、分村逐条改 village，有时同时改 faction；分村有自己的重算，不能以全局人数推断迁户。神力/废村也能改归属 | 选择与落址可抽 RNG；只读扫描不取代村庄和土地写入。缓存失效可在同一天发生多次 | phases、c1-territory；交换两人归属且总人数不变 |
| sim/sectEconomy.js villageSocieties、villageSociety、ownedSupply、sectSupplyStatus | 村经济只扫在世人类，分别算凡人、修士、成年和适育凡人。农田有效、地形、村 hp、粮储、村宗双向归属、现有门人及实付历史分别决定贡赋和招募 | 计算本身无 RNG。面板展示可走已提交只读桥；真实粮食、月供和 recruit 判定仍取该时点。只比较总人数不足以验证供养 | c1-supply、port；「有成年人」但无余粮/耕地，不得从虚账补粮 |
| sim/sectEconomy.js affiliateSectResident、recordSectDisciple、stepSectEconomy；sim/cultivation.js awaken | 民事归附可先于修为，入门仍受供给限制；实际支付先扣村粮再入宗储，按实际门人消耗；觉醒时供养不足可清掉旧归属 | 消费者会写 faction、资源及计数器，修炼/觉醒拥有自己的 RNG 顺序。读接口仅给等价的本阶段输入，绝不替代支付本身 | g8、c1-supply；从零修为到有修为后招募失败 |
| sim/sects.js stepSects、stepOneSect、departWithoutSupply、maybeShed、dissolveSect、absorbVillages | 清点时每个有有效宗门的数组成员计 followers，pop 只计有修为活人；领地附民、退宗、继承、分宗、灭宗可发生在重算后。饥荒离开路径显式减缓存，分宗路径迁成员而不立即重数 | 稳定度、容量、冲突与领导选择读取旧缓存并可抽签。用当前归属立即覆盖缓存等于改玩法；缓存与当前事实分别输出 | red-fixture、phases；144000 日两宗分项相反、合计相同 |
| sim/war.js、sim/territory.js、sim/settlementResilience.js、world/settlementState.js | 战力逐人读等级/装备，还用 sect.pop 与参战者差额兜底；领地影响、扩展半径读缓存；援助/衰败看宗门和村缓存及真实资源 | 战争用独立 warRng，更新边界在宗门步骤之后。按人口查询替代这些复合语义会改变战争结果、援助和村庄存亡 | c1-territory、three-realms；比较缓存在本阶段的合法旧值 |
| sim/reincarnation.js、necrology.js、artifacts.js、powers.js、possession.js、rifts.js | 死亡、夺舍、复生、神力和裂隙分别写活体、死者、魂、装备与流转日志；移出数组不等同自然死亡。魂池条目/鬼影不是活人口 | 魂路拥有独立事实和对应 RNG，按界、按身份追踪。删除真实凡人绕过 onDeath 会漏多个所有者 | g8、three-realms、save-equivalence；死后魂仍在不能占肉身数 |
| world/planes.js transfer/arriveUpper、sim/upperLife.js stepSects、sim/netherLife.js、world/wanlingInfluence.js | 飞升在凡间打标后清出，上界副本重定界内归属；上界宗门 pop 数所有同宗实体，followers 保留 0。幽冥实体、魂路、万灵和鬼影使用不同集合 | 转界期间旧行/新行会短暂重叠；天下活体按完整提交面核对，按界保存来源。不能套用凡间宗门口径或把万灵数作生灵数 | three-realms、buckets；在凡间仍有飞升标记的旧行 |
| sim/advance.js、runtimeState.js、presentation/readView/{committedStore,index,query,commandBridge}.js | 本界 Life 后子界按时钟独立推进。同日命令和完整步可能产生不同提交序号；成功发布才整体替换 frame/query，失败保留前台。world.generation 是地形生成元数据，不能拿来防止同日读旧 | 生产读取只在成功提交代际可复用。命令写权限仍归 CommandBridge；查询既不抽 RNG 也不修改 World | wx-e2ra2、g8；同日迁户、故障、dispose 后换世界 |
| ui/settlementInspector.js、sectSupplyFacts.js、main.js 宗门排行/状态；sim/observeEcho.js、journal.js、ui/observeEchoPanel.js | 检视村落读生活/储粮口径，宗门排行按旧 pop 排并显示 followers；回声展示记录的是当时缓存，部分誓约用该村 pop>0 与 hp 判履约 | 面板纯展示可走 B3；誓约和历史是有时间的世界事实，事后刷新不应颠覆它们 | c1-ui、wx-e2ra2、官方 Canvas/Three 面板冒烟 |
| render/unitsLayer.js、render3d/Render3DAdapter.js、wanxiang/*、sim/transit.js、sites.js | 场景绘制/拾取、行商和遗迹多按实体 ID 选择或定位。窗口可见数、实体数组长度、可领资源资格都不是凡人或修士人口 | 渲染/观察只读；正式交互、故事/旅程结算可能写世界或消耗自己的签序。不能由分桶数生成剧情当事人 | wanxiang:s11、three-realms、渲染切换纯度 |
| io/save.js serializeWorld/deserializeWorld、饱和/有界历史环 | v11 分别写入实体行、村宗缓存、已存谱系、神魂、子界和 G8 运行时。恢复时可能补齐派生字段或量化地形；读取不可顺手「修复」旧缓存 | 新侧车只存在于会话内。对同输入同 dt 比序列化字节；未中断对恢复的历史差异单列，保留原档 | save-equivalence、equiv、longrun；在第 144000 日读档立刻看两宗 |

**输入与复测。** 两份 gzip 存于 `tests/fixtures/mlod0b/`，解压后的 SHA 即委托原档，合计约 1.82 MB 压缩数据。可用 `--input-100=任意路径`、`--input-400=任意路径` 或 `--checkpoint-root=目录` 复核外部副本。相同 400 年文件的不同名字仍然是同一个样本。输入清单同时保存 Life、war、player、具名随机域及位面时钟。世界运行代际由实际发布会话分配，不存在可从原始 JSON 推出的历史会话代际。

**研究债务。** #75 的失败回滚、不可见半步、同 dt 对拍经验仍然有效，生成器不进入此树。保留旧的存档恢复差异、分宗缓存滞后一拍、出生注释与运行行为冲突、三界口径差异。正式聚合权威、玩家存档迁移及收入/出生公式变更均需另案决策。
