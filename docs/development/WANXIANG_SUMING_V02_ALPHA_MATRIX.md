# 万象塑命 V0.2 / V0.2-B / WX-C 覆盖矩阵

WX-C 从 PR #60 的 b50623b 独立堆叠开发；新增权限、自然机缘与三卦消费者详见 [WX-C交付](./WX_C_DELIVERY.md) 和 [机器清单附表](./WX_C_COVERAGE.md)。当前普通改命仅编辑命格身份，体质阶段与血脉不再自由嵌套编辑；表中旧 U/阶段描述应结合 [权限规则](./WX_C_FATE_AUTHORITY.md) 阅读。

基线：main@bd62ade03c56908ce5942f7100d6b5cb2bc38934。候选：feature/wanxiang-suming-v02-alpha，未宣称合入 main。WX-B 核对日期：2026-11-06。继承 PR #60@ae1892b（与本地 f112adc 源码树相同），最终 SHA/CI 由 WX_B_DELIVERY 补齐。

A＝真实消费者、可观察结果、存档与定向验证均有证据；B＝仅隔离 Alpha（?wanxiang=1）可用且存在局限；C＝定义存在，目标机制无消费者。传奇/借页还需 wxExperiments=1。Alpha 历史三视口功能通过但清理超时；WX-B 最终浏览器状态见 WX_B_DELIVERY。逐项评级按各自的模拟与存档证据给出；B 不等于完整设计已兑现，部分数值接线不能代替完整机制。

来源：父目录委托书、命簿V02_内容目录.json、命簿UI与机制调整方案、经历池机制与落地规格、因缘成局规划。experience_content.json 与原交互原型未提供；18经历由规格第6节重建。

共同证据约定：D＝src/inkbox/wanxiang/catalog.js / content/；E＝src/inkbox/wanxiang/effects.js#readEffects → sim/cultivation.js（修炼/气血/战力/突破）或 sim/life.js（治疗/感知/退避）；P＝src/inkbox/wanxiang/practice.js（真实取得的功法学习）；S＝io/save.js + src/inkbox/wanxiang/saveState.js 的 v11 可选块，按 plane:id 保存 Profile，未知危险字段拒载；U＝ui/g1/presentation/mingpuView.js 与命令 ChangeSet。S 仅说明有保存路径，逐项端到端读档仍待最终集成验收。测试脚本引用说明覆盖入口，不等于脚本逐项完成浏览器验证。

## 体质（18）

| 机制 / ID | 数据定义 | 真实消费者 | UI/编辑 | 存档 | 验证入口 | 状态及残留设计意图 |
|---|---|---|---|---|---|---|
| 混沌道体 / chaos | D.physiques | E修炼×0.65；P元素相性豁免 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；全部道途资格仍受真实取得/境界门槛 |
| 时空道体 / spacetime | D.physiques | sim/transit 合法交通减时×0.88；有界迷失 | U主体质互斥/阶段 | S | wx-b-blood / transit / hex / paths，正反与存档 | B；不绕过道路/海路/跨界权限，1/16确定性行程风险及1日延误，状态随交通保存 |
| 先天道胎 / dao_embryo | D.physiques | P学习、E气血；stepBody 本世一次永久悟性+10 | U主体质互斥/阶段 | S | wx-b-blood / transit / hex / paths，正反与存档 | B；独立 bodyLedger 防编辑重领，完整道胎特殊机缘仍有限 |
| 太阳圣体 / solar | D.physiques | damage.js#reduceIncomingDamage 阳息真实技能伤害 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；限已学dual且装配yang技能 |
| 太阴圣体 / lunar | D.physiques | E阴系主修条件修炼 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；受实际阴系功法目录限制 |
| 雷霆战体 / thunder | D.physiques | damage.js#reduceIncomingDamage 引雷技能 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；限真实学会并装配thunder |
| 乙木灵体 / wood | D.physiques | E治疗、P丹修学习 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；完整丹修生产体系未实现 |
| 离火道体 / fire_eater | D.physiques | E火系修炼；stepBody 吞真实地火补mana并损血 | U主体质互斥/阶段 | S | wx-b-blood / transit / hex / paths，正反与存档 | B；每30日一次、真实火量守恒、低血/容量限制，非完整火法系统 |
| 乾坤剑体 / sword | D.physiques | P剑法学习 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；完整剑道特殊行为未实现 |
| 万法不侵体 / spell_ward | D.physiques | damage.js#reduceIncomingDamage 法伤减免/物伤代价 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；仅类型化伤害入口 |
| 后土圣体 / earth | D.physiques | damage类型减伤；sim/transit 陆路代价×1.12 | U主体质互斥/阶段 | S | wx-b-blood / transit / hex / paths，正反与存档 | B；正式交通成本，海路不受影响 |
| 万劫不灭体 / undying | D.physiques | Life.attack 重创事实 → stepBody恢复 → maxHpFor累计成长 | U主体质互斥/阶段 | S | wx-b-blood / transit / hex / paths，正反与存档 | B；强敌从半血以上打至20%以下且存活，次日恢复90%，每次2%、本世5次、同威胁年冷却 |
| 九阴绝脉 / yin_block | D.physiques | E闭塞/贯通修炼；experiences.js付费治疗转阶段 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；两次有效付费治疗且间隔30日，同医者冷却1080日；wx-healing 实测 |
| 九阳绝脉 / yang_block | D.physiques | E闭塞/贯通修炼；experiences.js付费治疗转阶段 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；同上，完整阳系路线待扩 |
| 噬灵体 / devour | D.physiques | damage.js#postCombatHit 转移真实mana | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；限同位面活目标，容量18/日限，阵法能量未接 |
| 凡体 / mortal | D.physiques | stepBody 两处实际探府成功后激活；possession有限魂扰抵抗 | U主体质互斥/阶段 | S | wx-b-blood / transit / hex / paths，正反与存档 | B；仅显式凡体藏奇12%夺舍抵抗，完整诅咒与推演未实现；无体质不获免疫 |
| 因果道体 / causal | D.physiques | experiences 合法候选相对权重；20年一次稀有重创分支引导 | U主体质互斥/阶段 | S | wx-b-blood / transit / hex / paths，正反与存档 | B；不提高稀有预算，不重抽旧事实；NPC自动有限抉择，非玩家剧情选择 |
| 劫罚之体 / calamity | D.physiques | Life.attack → invokeCalamity → 原生sendTribulation | U主体质互斥/阶段 | S | wx-b-blood / transit / hex / paths，正反与存档 | B；真实强敌3格内、耗20exp及结算后20%气血、360日冷却；自身同受天劫风险 |

## 本命卦（64）

WX-B 复核为 25 项具备受支持条件和实际数值入口。hex41 缺真实付费研习证据保留 C。数字表示代码消费者覆盖，逐卦自然出现和成熟世界组合仍需实测。

| 机制 | 条件与原效果 | 真实消费者 | UI | 存档 | 验证 | 状态 |
|---|---|---|---|---|---|---|
| ䷀ 乾 / hex_01 | always；修炼速率+3% | sim/cultivation.cultivationRate | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷁ 坤 / hex_02 | always；气血上限+4% | sim/cultivation.maxHpFor | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷂ 屯 / hex_03 | prior_failure_same_gate；同瓶颈曾失败时突破率+1个百分点 | breakthrough | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷃ 蒙 / hex_04 | first_manual；第一门功法学习速率+8% | practice.learningEligibility → sites/artifacts.learnPractice | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷄ 需 / hex_05 | resting_90d；连续静修90日后修炼速率+4% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷅ 讼 / hex_06 | defending_rival；被真实仇敌先手攻击时战力+3% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷆ 师 / hex_07 | same_sect_ally_near；同门参战在场时战力+3% | sim/cultivation.combatPower → Life.attack | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷇ 比 / hex_08 | heal_ally；为既有友好对象实际治疗量+6% | daoActivities 丹修实际加血 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷈ 小畜 / hex_09 | manual_progress_below_half；功法学习前半程速率+6% | practice.learningEligibility → sites/artifacts.learnPractice | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷉ 履 / hex_10 | hazard_retreat；危险地形退避评分+0.05 | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷊ 泰 / hex_11 | mind_above_70；道心高于70时修炼速率+4% | sim/cultivation.cultivationRate | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷋ 否 / hex_12 | pollution_above_40；污染超过40时自然道心恢复+8% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷌ 同人 / hex_13 | mentor_near；真实师尊在场时学习速率+8% | practice.learningEligibility → sites/artifacts.learnPractice | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷍ 大有 / hex_14 | named_artifact_owned；持有铭名法宝时器灵蕴养进度+6% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷎ 谦 / hex_15 | learning_with_stronger；向更高境修士学习时新增心魔-8% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷏ 豫 / hex_16 | safe_rest；安全静修来源中顿悟条目权重+10% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷐ 随 / hex_17 | following_real_companion；真实同行途中行程粮耗-4% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷑ 蛊 / hex_18 | active_poison；真实解丹毒治疗进度+6% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷒ 临 / hex_19 | heal_junior；为低境修士实际治疗量+8% | daoActivities 丹修实际加血 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷓ 观 / hex_20 | exploration；探索感知半径+1格 | Life.findEnemy 感知 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷔ 噬嗑 / hex_21 | enemy_shielded；攻击有真实护盾的目标时战力+4% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷕ 贲 / hex_22 | first_paid_aid；每对人物首次付费援助关系增量+8% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷖ 剥 / hex_23 | hp_below_30；气血低于30%时退避评分+0.08 | Life 正式退避血线 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷗ 复 / hex_24 | rest_after_defeat；正式败退后的首次有效治疗量+8% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷘ 无妄 / hex_25 | no_unprovoked_kill_10y；十年无主动无故杀戮时诅咒抵抗+5个百分点 | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷙ 大畜 / hex_26 | manual_progress_above_half；功法学习后半程速率+6% | practice.learningEligibility → sites/artifacts.learnPractice | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷚ 颐 / hex_27 | fed_and_resting；有粮静养时实际治疗量+5% | Life 进食 / daoActivities 受疗 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷛ 大过 / hex_28 | outnumbered；被多个真实敌人围攻时战力+4% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷜ 坎 / hex_29 | water_hazard；水域灾害伤害-6% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷝ 离 / hex_30 | fire_skill；火属性术法威力+4% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷞ 咸 / hex_31 | partner_near；道侣在场时双修实际增量+8% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷟ 恒 / hex_32 | same_manual_10y；连续主修同一功法十年后修炼速率+4% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷠ 遁 / hex_33 | enemy_stronger；敌方境界更高时退避评分+0.06 | Life 正式退避血线 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷡ 大壮 / hex_34 | hp_above_80；气血高于80%时肉身招式威力+4% | skills.chooseSkillAction → 实际肉身技能伤害 | U，当前条件成立才激活 | S | wx-c-effects 清单驱动正反/真实行动/存档；逐卦自然触发率未计 | B；已装配技能消费者；普通攻击回退不变 |
| ䷢ 晋 / hex_35 | after_major_success_360d；跨大境界成功后一年修炼速率+5% | sim/cultivation.cultivationRate | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷣ 明夷 / hex_36 | hp_below_30；重伤时敌方感知半径对本人减1格 | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷤ 家人 / hex_37 | heal_true_kin；为真实亲属实际治疗量+8% | daoActivities 丹修实际加血 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷥ 睽 / hex_38 | different_path_mentor；向异道真实师尊学习时速率+8% | practice.learningEligibility → sites/artifacts.learnPractice | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷦ 蹇 / hex_39 | land_detour；有实际绕行路径时绕行粮耗-5% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷧ 解 / hex_40 | active_demon；真实祛心魔行动进度+6% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷨ 损 / hex_41 | paid_resource_study；已经支付资源的研习进度+8% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷩ 益 / hex_42 | aid_without_repayment；无即时回报的真实援助治疗量+6% | daoActivities 丹修实际加血 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷪ 夬 / hex_43 | enemy_hp_below_30；目标气血低于30%时肉身招式威力+4% | skills.chooseSkillAction → 实际肉身技能伤害 | U，当前条件成立才激活 | S | wx-c-effects 清单驱动正反/真实行动/存档；逐卦自然触发率未计 | B；已装配技能消费者；普通攻击回退不变 |
| ䷫ 姤 / hex_44 | first_real_meeting；首次真实相遇来源中结缘条目权重+10% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷬ 萃 / hex_45 | three_allies_near；至少三名真实友方在场时修炼速率+3% | sim/cultivation.cultivationRate | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷭ 升 / hex_46 | same_path_manual；主修道途内功法学习速率+6% | practice.learningEligibility → sites/artifacts.learnPractice | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷮ 困 / hex_47 | low_resources；真实物资匮乏时新增心魔-6% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷯ 井 / hex_48 | at_home_village；在真实所属聚落治疗他人时治疗量+6% | daoActivities 丹修实际加血 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷰ 革 / hex_49 | first_year_after_path_change；正式转道后首年功法学习速率+6% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷱ 鼎 / hex_50 | paid_alchemy；真实付料炼丹有效产出期望+4% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷲ 震 / hex_51 | thunder_hit；真实雷劫伤害-4% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷳ 艮 / hex_52 | stationary_guard；真实驻守中受到伤害-4% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷴ 渐 / hex_53 | same_item_10y；同一器物相伴十年后蕴养进度+8% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷵ 归妹 / hex_54 | partner_other_path；异道道侣合法共修增量+8% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷶ 丰 / hex_55 | at_ruin；真实遗址内感知半径+1格 | Life.findEnemy 感知 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷷ 旅 / hex_56 | away_from_home；离开所属聚落修炼时速率+3% | sim/cultivation.cultivationRate | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷸ 巽 / hex_57 | land_journey；合法陆路行程粮耗-3% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷹ 兑 / hex_58 | friendly_company；与真实友方相处时道心自然恢复+6% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷺ 涣 / hex_59 | after_escape_180d；真实脱战后180日内治疗量+6% | Life 进食 / daoActivities 受疗 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | B；真实数值入口，个别条件仍需组合试玩 |
| ䷻ 节 / hex_60 | using_equipped_skill；已装配技能的灵力消耗-4% | skills.chooseSkillAction → 实际装配技能灵力支付 | U，当前条件成立才激活 | S | wx-c-effects 清单驱动正反/真实行动/存档；逐卦自然触发率未计 | B；已装配技能消费者；普通攻击回退不变 |
| ䷼ 中孚 / hex_61 | kept_active_vow；履行真实誓约的修持类进度+6% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷽ 小过 / hex_62 | minor_hazard；轻度风险下退避评分+0.04 | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷾ 既济 / hex_63 | after_successful_trial；成功渡劫后本次法宝磨损-6% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |
| ䷿ 未济 / hex_64 | failed_manual_check；真实学习失败后下一段学习进度+6% | 缺真实条件或轴消费者 | U，当前条件成立才激活 | S | wx-b-hex 正反/预算/存档；逐卦成熟世界未测 | C；保留原设计，尚无完整接线 |

## 血脉与 DNA

| 机制 | 数据定义 | 真实消费者 | UI/编辑 | 存档 | 验证入口 | 状态/限制 |
|---|---|---|---|---|---|---|
| 真龙血脉 / true_dragon | D.bloodlines；九阶 | 龙骨真实取得/再次耗骨定脉；有限兽类龙威减伤；后代潜隐显化 | U显隐/纯度/稳定 | S | wx-b-blood / damage / paths | B；兽类距离6格且不越境；出生潜隐，境界3无显血时显化；返祖剧情仍有限 |
| 天凤血脉 / heaven_phoenix | D.bloodlines；九阶 | Life战斗/火灾正式致死前tryPhoenix | U显隐/纯度/稳定 | S | wx-b-blood / damage / paths | B；真实本源羽、本世3次、50年冷却、360日虚弱；寿终/抹除拒绝；其他环境未接 |
| 神王血脉 / god_king | D.bloodlines；九阶 | 真实洞府神性碎片 + 高阶自有法宝耗20耐久绑定 → 法术+8% | U显隐/纯度/稳定 | S | wx-b-blood / damage / paths | B；失去原物或耐久耗尽停效，不自动授全部神技 |
| 修罗战血 / asura | D.bloodlines；九阶 | 真实强敌贡献 → 限期增益与污染+0.5 | U显隐/纯度/稳定 | S | wx-b-blood / damage / paths | B；同目标去重，360日最多3次，30日效果；完整杀孽叙事仍有限 |
| 合法双亲出生 | profile.js/inheritance.js | sim/life.js出生提交 → inheritance.js#inheritBirthProfile | U家系/来源只读 | S | inkbox-wx-integration / core.mjs | B；不绕过人口/粮食/年龄/同村原门槛；最多一显两潜 |
| 血系来源/返祖 | profile.js/inheritance.js | inheritBirthProfile稳定且inheritable血系池 | U家系/来源只读 | S | inkbox-wx-integration / core.mjs | B；双亲来源；品阶小概率+1；并非独立返祖经历 |
| 灵根元素/体质 | profile.js/inheritance.js | inheritBirthProfile rootTemplate/阶段0体质 | U家系/来源只读 | S | inkbox-wx-integration / core.mjs | B；不复制修炼进度；性格遗传未实现 |
| 后天龙血定脉 | profile.js/inheritance.js | encounters.js真实洞府资源消耗与180日门槛 | U家系/来源只读 | S | inkbox-wx-integration / core.mjs | B；初获不可遗传；定脉再耗资源，wx-b-paths原生出生/显化与存档通过 |
| 身份迁移 | profile.js/inheritance.js | inheritance.js#migrateProfile及三界迁移接点 | U家系/来源只读 | S | inkbox-wx-integration / core.mjs | B；同世迁移保留关系并跨界休眠；转世仅魂属道种/回执/有界历史，肉身DNA独立；wx-b-lifecycle通过 |

## 经历词条（18）

| 词条 / ID | 数据定义 | 真实消费者/触发 | UI/编辑 | 存档 | 验证入口 | 状态及差距 |
|---|---|---|---|---|---|---|
| 剑心初明 / sword_heart | content/experienceTraits.js | 真实突破成功抽取 → E剑道战力/突破 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B |
| 破境余韵 / breakthrough_echo | content/experienceTraits.js | 真实突破成功抽取 → E修炼/期限 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；重复获得最长720日规则尚需逐项验收 |
| 经脉受损 / meridian_damage | content/experienceTraits.js | 真实突破失败 → E气血/修炼；付费间隔治疗 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B |
| 畏险未平 / risk_fear | content/experienceTraits.js | 真实探府失败 → encounters行动/ Life退避 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B |
| 险中有定 / risk_resolve | content/experienceTraits.js | 同洞府720日内成功替换畏险 → encounters行动 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B |
| 劫后筋骨 / tempered_bones | content/experienceTraits.js | 真实强敌战斗胜利 → 稀有档 → 气血+6% | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；已接真实事件与消费者，逐条长期组合未测 |
| 受恩未忘 / gratitude | content/experienceTraits.js | 真实付费疗伤 → 恩义对象 → 后续丹修合法帮助评分+25% | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；已接真实事件与消费者，逐条长期组合未测 |
| 丹修护关 / alchemy_guard | content/experienceTraits.js | 真实付费丹修护关 → 突破判定前一次消费，成功失败皆耗 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；已接真实事件与消费者，逐条长期组合未测 |
| 剑诀温习 / sword_review | content/experienceTraits.js | 正式取得剑法 → 稀有档温习 → 剑道战力+4% | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；已接真实事件与消费者，逐条长期组合未测 |
| 道心蒙尘 / dusty_mind | content/experienceTraits.js | 突破失败稀有档 → 360日突破-1.5个百分点 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；已接真实事件与消费者，逐条长期组合未测 |
| 浊息自持 / pollution_restraint | content/experienceTraits.js | 高污染且真实敌对重创 → 稀有档 → 自然污染增长-15% | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；已接真实事件与消费者，逐条长期组合未测 |
| 伤中悟势 / wounded_insight | content/experienceTraits.js | 敌对重创 → 稀有档 → 战力+4% / 气血-5% | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；已接真实事件与消费者，逐条长期组合未测 |
| 识器成癖 / artifact_obsession | content/experienceTraits.js | 正式原物领取 → 稀有档 → 合法更强器物候选评分+20% | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；已接真实事件与消费者，逐条长期组合未测 |
| 探府余伤 / site_wound | content/experienceTraits.js | 真实探府失败 → E气血/期限 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B |
| 同参余悟 / shared_insight | content/experienceTraits.js | 实际帮助者同位面8格 → 720日内修炼+4% | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；已接真实事件与消费者，逐条长期组合未测 |
| 魔剑共鸣 / demon_sword_resonance | content/experienceTraits.js | legend原物领取 → E战力；绑定原剑 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；持原剑持续污染，原物丢失停增益，wx-b-encounters验证 |
| 守阙之誓 / seal_vow | content/experienceTraits.js | legend封印扣寿 → E突破/锚点近距气血 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；原物持续封印 |
| 剑煞入脉 / sword_blight | content/experienceTraits.js | legend失败 → E气血 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；3次实际付费治疗间隔30日且远离90日解除；持续污染已接，wx-b-encounters验证 |

## 传奇终点

仅 wxExperiments=1。自动寻找真实无主 weapon + site，真实移动到达后选择，工作90/180日；world.wanxiang.legend 为唯一状态事实。

| 终点 | 真实消费者/结果 | UI/编辑 | 存档 | 验证入口 | 状态及限制 |
|---|---|---|---|---|---|
| sealed | legend.js#stepLegend/#stepLegendTravel；扣寿2年；seal_vow；artifactRestriction锁定原物 | 终态观察；NPC自动选择，非完整交互剧情 | S world.legend | inkbox-wx-experiences.mjs | B；单条全局传奇，无全终点浏览器证据 |
| drawn | legend.js#stepLegend/#stepLegendTravel；canonical claim原剑；demon_sword_resonance | 终态观察；NPC自动选择，非完整交互剧情 | S world.legend | inkbox-wx-experiences.mjs | B；单条全局传奇，无全终点浏览器证据 |
| failed | legend.js#stepLegend/#stepLegendTravel；失败剑煞/扣血或领取失败；无第二次抽奖 | 终态观察；NPC自动选择，非完整交互剧情 | S world.legend | inkbox-wx-experiences.mjs | B；单条全局传奇，无全终点浏览器证据 |
| left | legend.js#stepLegend/#stepLegendTravel；主动离开/超时/容量不足；不发奖励 | 终态观察；NPC自动选择，非完整交互剧情 | S world.legend | inkbox-wx-experiences.mjs | B；单条全局传奇，无全终点浏览器证据 |
| interrupted | legend.js#stepLegend/#stepLegendTravel；死亡/原物失效/低血量或既有交通冲突停止 | 终态观察；NPC自动选择，非完整交互剧情 | S world.legend | inkbox-wx-experiences.mjs | B；单条全局传奇，无全终点浏览器证据 |

## 九祖（同阶）

| 道种 / ID | 数据定义 | 真实消费者 | UI/编辑 | 存档 | 验证入口 | 状态/残留 |
|---|---|---|---|---|---|---|
| 琅嬛开卷道祖 / dao_seed_juan_shu | content/daoSeeds.js | daoSeeds.js借页/归页 → sim/cultivation.js +5% | U展示；非任意造物授予 | S | inkbox-wx-experiences.mjs | B；需附近活人真实功法、扣10exp、180日、唯一借主锁；不是永久学习 |
| 酆都轮终元君 / dao_seed_zhong_lun | content/daoSeeds.js | 无 | U展示；非任意造物授予 | S | inkbox-wx-experiences.mjs | C；一次合法致命伤延缓，限时完成真实条件 |
| 业镜照影大帝 / dao_seed_ying_jian | content/daoSeeds.js | 无 | U展示；非任意造物授予 | S | inkbox-wx-experiences.mjs | C；对一个即将选择的合法行动展示风险区间，或解锁镜影试炼 |
| 蜕凡更始真君 / dao_seed_bian_ji | content/daoSeeds.js | stepDaoSeeds：真实付费治疗后30日，90%HP，耗20exp及20%HP贯通绝脉 | U展示；非任意造物授予 | S | wx-b-seeds / lifecycle | B；每魂一次、独立spent回执防编辑/读档重领；其他体质转换未做 |
| 司辰定律道君 / dao_seed_ji_lv | content/daoSeeds.js | 无 | U展示；非任意造物授予 | S | inkbox-wx-experiences.mjs | C；符合既定修持条件时稳定学习和突破的小幅波动 |
| 冲和衡悖天尊 / dao_seed_bei_heng | content/daoSeeds.js | 无 | U展示；非任意造物授予 | S | inkbox-wx-experiences.mjs | C；在有限时间容纳一组明确互斥功法标签 |
| 织命混沌尊主 / dao_seed_ming_wang | content/daoSeeds.js | stepDaoSeeds：真实恩义对象同界2格重伤，耗10exp及自身20%HP治疗10% | U展示；非任意造物授予 | S | wx-b-seeds / hex / lifecycle | B；每魂一次、休眠关系不生效；更广物件/地点因缘未做 |
| 天视观外帝君 / dao_seed_guan_wai | content/daoSeeds.js | 无 | U展示；非任意造物授予 | S | inkbox-wx-experiences.mjs | C；玩家显式垂注使观外线索获得资格，人物可生畏或趋近 |
| 太虚梦心道尊 / dao_seed_meng_xin | content/daoSeeds.js | 无 | U展示；非任意造物授予 | S | inkbox-wx-experiences.mjs | C；在真实闭关或濒死来源上开启述道分支，改变主修理解或人格 |

## UI 与横向契约

| 机制 | 定义/消费者 | UI/编辑 | 存档 | 验证 | 状态及限制 |
|---|---|---|---|---|---|
| 五页命簿 | mingpuView.js / g1/characterRuntime.js | U | S | inkbox-wx-ui / integration.mjs；浏览器范围见交付记录 | A（五页与体质编辑路径）；桌面/窄屏/Three 实际提交和读档已验 |
| ChangeSet草稿/预览/提交 | changes.js；命令重新校验/幂等/revision | U | S | inkbox-wx-ui / integration.mjs；浏览器范围见交付记录 | B（界面/基础路径）；预览只读；完整所有字段差异与重复提交浏览器待验 |
| 六档灵根/基础属性 | profile.js；native cultivation/hp/learning/perception hooks | U | S | inkbox-wx-ui / integration.mjs；浏览器范围见交付记录 | B（界面/基础路径）；旧23变异保留；天灵根须资格；50中性默认；根倍率不重复 |
| 20年世界运纪 | runtime.js#updateWorldEpoch；7200日唯一时钟 | U | S | inkbox-wx-ui / integration.mjs；浏览器范围见交付记录 | B（界面/基础路径）；仅稳定运纪展示，世界运纪增益消费未完整实现 |
| 功法主辅修/技能 | practice.js/skills.js → 原生学习/战斗 | U | S | inkbox-wx-ui / integration.mjs；浏览器范围见交付记录 | B（界面/基础路径）；有限装备/冷却/mana，技能内容及路线仍有限 |
| 三件法宝 | 原生 artifacts 唯一归属/装备入口 | U | S | inkbox-wx-ui / integration.mjs；浏览器范围见交付记录 | B（界面/基础路径）；不另建复制背包；特殊绑定需同原物ID |
| 性格/杂趣 | catalog.js示例/命簿显示 | U | S | inkbox-wx-ui / integration.mjs；浏览器范围见交付记录 | C；行为评分与观外线索多数仅定义；不因显示宣称生效 |

验证快照和下一轮问题见 [交付记录](./WANXIANG_SUMING_V02_DELIVERY.md)。维护时只有消费者、事实条件、保存与正反验证同时齐备才升级；不要从 catalog.implementation 自动生成完成率。

## WX-B 验证与自然发生边界

18种体质均有有限代表性消费者，4条血脉可执行，WX-C 为28卦接线、36卦保留C；18经历具有授予/消费路径，3/9道种有实验闭环。以上为有限机制覆盖，评级保留B；不等于所有原始设计已实现。25卦表驱动正反条件测试见 wx-b-hex；另有正式Life步骤的遁卦强敌退避对照：35%气血无卦接战、遇强敌遁卦退避、同境仍接战。其余24项不是逐项完整下游流程或成熟世界自然故事实测。

自然出生仅小概率生成木、道胎、剑体及四血脉；其他体质多经合法改命或受控测试取得。新机制随Profile保存在v11可选块；历史数组有界，终生代价独立回执保留。界面只读显示来源/阶段/休眠，具体特殊能力须正式行动判定。自然与成熟证据见 [WX_B_PROFILE](./WX_B_PROFILE.md)，验收及缺口见 [WX_B_DELIVERY](./WX_B_DELIVERY.md)。

排队转世魂的幽冥鬼影是观察代理，不复制可执行Profile；魂属道种/回执唯一保存在魂池，避免两端重复消费。非排队鬼修与怨魂保留独立魂属Profile。前世关系永久休眠供追溯，不直接给新身体援助加成；现世亲缘仍由新出生DNA确定。

### WX-D 社会意向增量

| 卦 | 消费轴 | 条件 | 边界 |
| --- | --- | --- | --- |
| 师 / hex_07 | aidIntent | 付费帮助候选同宗 | 仅候选排序 |
| 同人 / hex_13 | aidIntent | 付费帮助候选为师徒 | 仅候选排序 |
| 临 / hex_19 | aidIntent | 付费帮助候选低境 | 仅候选排序 |

`inkbox-wx-d-destiny.mjs` 通过真实活动选择器验证激活与休眠的候选排序差异，并验证条件和 JSON 往返；付费结算由社会行为测试覆盖。
