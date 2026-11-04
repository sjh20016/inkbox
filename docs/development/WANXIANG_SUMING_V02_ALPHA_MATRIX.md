# 万象塑命 V0.2 Alpha 覆盖矩阵

基线：main@bd62ade03c56908ce5942f7100d6b5cb2bc38934。候选：feature/wanxiang-suming-v02-alpha，未宣称合入 main。核对日期：2026-10-29；最终候选验收由交付记录补齐。

A＝真实消费者、可观察结果、存档与定向验证均有证据；B＝仅隔离 Alpha（?wanxiang=1）可用且存在局限；C＝定义存在，目标机制无消费者。传奇/借页还需 wxExperiments=1。三视口功能验收通过，清理超时退出 1。逐项评级按各自的模拟与存档证据给出；B 不等于完整设计已兑现，部分数值接线不能代替完整机制。

来源：父目录委托书、命簿V02_内容目录.json、命簿UI与机制调整方案、经历池机制与落地规格、因缘成局规划。experience_content.json 与原交互原型未提供；18经历由规格第6节重建。

共同证据约定：D＝src/inkbox/wanxiang/catalog.js / content/；E＝src/inkbox/wanxiang/effects.js#readEffects → sim/cultivation.js（修炼/气血/战力/突破）或 sim/life.js（治疗/感知/退避）；P＝src/inkbox/wanxiang/practice.js（真实取得的功法学习）；S＝io/save.js + src/inkbox/wanxiang/saveState.js 的 v11 可选块，按 plane:id 保存 Profile，未知危险字段拒载；U＝ui/g1/presentation/mingpuView.js 与命令 ChangeSet。S 仅说明有保存路径，逐项端到端读档仍待最终集成验收。测试脚本引用说明覆盖入口，不等于脚本逐项完成浏览器验证。

## 体质（18）

| 机制 / ID | 数据定义 | 真实消费者 | UI/编辑 | 存档 | 验证入口 | 状态及残留设计意图 |
|---|---|---|---|---|---|---|
| 混沌道体 / chaos | D.physiques | E修炼×0.65；P元素相性豁免 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；全部道途资格仍受真实取得/境界门槛 |
| 时空道体 / spacetime | D.physiques | 无 travelDuration 消费者 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | C；合法交通减时及迷失风险未实现 |
| 先天道胎 / dao_embryo | D.physiques | P学习、E气血 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；悟性永久+10未完整兑现 |
| 太阳圣体 / solar | D.physiques | damage.js#reduceIncomingDamage 阳息真实技能伤害 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；限已学dual且装配yang技能 |
| 太阴圣体 / lunar | D.physiques | E阴系主修条件修炼 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；受实际阴系功法目录限制 |
| 雷霆战体 / thunder | D.physiques | damage.js#reduceIncomingDamage 引雷技能 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；限真实学会并装配thunder |
| 乙木灵体 / wood | D.physiques | E治疗、P丹修学习 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；完整丹修生产体系未实现 |
| 离火道体 / fire_eater | D.physiques | E火系主修修炼 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；完整吞火风险链未实现 |
| 乾坤剑体 / sword | D.physiques | P剑法学习 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；完整剑道特殊行为未实现 |
| 万法不侵体 / spell_ward | D.physiques | damage.js#reduceIncomingDamage 法伤减免/物伤代价 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；仅类型化伤害入口 |
| 后土圣体 / earth | D.physiques | damage.js#reduceIncomingDamage 减伤 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；陆路行程延长尚无消费者 |
| 万劫不灭体 / undying | D.physiques | 无重创成长消费者 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | C；有效重创、恢复与成长限制待做 |
| 九阴绝脉 / yin_block | D.physiques | E闭塞/贯通修炼；experiences.js付费治疗转阶段 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；两次有效付费治疗且间隔30日，同医者冷却1080日；wx-healing 实测 |
| 九阳绝脉 / yang_block | D.physiques | E闭塞/贯通修炼；experiences.js付费治疗转阶段 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；同上，完整阳系路线待扩 |
| 噬灵体 / devour | D.physiques | damage.js#postCombatHit 转移真实mana | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | B；限同位面活目标，容量18/日限，阵法能量未接 |
| 凡体 / mortal | D.physiques | 无藏奇/诅咒消费者 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | C；无体质不能自动免疫 |
| 因果道体 / causal | D.physiques | 无经历加权/20年支脉消费者 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | C；不重抽既有结果 |
| 劫罚之体 / calamity | D.physiques | 无引劫事务 | U主体质互斥/阶段 | S | inkbox-wx-core / damage / experiences.mjs | C；范围/代价/自身承劫待实现 |

## 本命卦（64）

每行保留原始条件及轴。已接数值仍缺经历机制族相对权重、功法/机缘资格标签消费；familyWeight 不提升稀有预算的设计尚未实现。长期历史条件不靠上下文伪造；无事实记录时保持休眠。

| 卦 / ID | 数据/条件/效果 | 真实消费者及激活 | UI/编辑 | 存档 | 验证入口 | 状态 |
|---|---|---|---|---|---|---|
| ䷀ 乾 / hex_01 | always；修炼速率+3% | E修炼；真实条件成立才激活 | U一世一卦 | S | inkbox-wx-core / content.mjs | B：部分效果 |
| ䷁ 坤 / hex_02 | always；气血上限+4% | E气血；真实条件成立才激活 | U一世一卦 | S | inkbox-wx-core / content.mjs | B：部分效果 |
| ䷂ 屯 / hex_03 | prior_failure_same_gate；同瓶颈曾失败时突破率+1个百分点 | 未激活：缺条件事实 prior_failure_same_gate | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷃ 蒙 / hex_04 | first_manual；第一门功法学习速率+8% | P学习；真实条件成立才激活 | U一世一卦 | S | inkbox-wx-core / content.mjs | B：部分效果 |
| ䷄ 需 / hex_05 | resting_90d；连续静修90日后修炼速率+4% | 未激活：缺条件事实 resting_90d | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷅ 讼 / hex_06 | defending_rival；被真实仇敌先手攻击时战力+3% | 未激活：缺条件事实 defending_rival | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷆ 师 / hex_07 | same_sect_ally_near；同门参战在场时战力+3% | 未激活：缺条件事实 same_sect_ally_near | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷇ 比 / hex_08 | heal_ally；为既有友好对象实际治疗量+6% | 未激活：缺条件事实 heal_ally | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷈ 小畜 / hex_09 | manual_progress_below_half；功法学习前半程速率+6% | P学习；真实条件成立才激活 | U一世一卦 | S | inkbox-wx-core / content.mjs | B：部分效果 |
| ䷉ 履 / hex_10 | hazard_retreat；危险地形退避评分+0.05 | 未激活：缺条件事实 hazard_retreat | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷊ 泰 / hex_11 | mind_above_70；道心高于70时修炼速率+4% | E修炼；真实条件成立才激活 | U一世一卦 | S | inkbox-wx-core / content.mjs | B：部分效果 |
| ䷋ 否 / hex_12 | pollution_above_40；污染超过40时自然道心恢复+8% | 未激活：缺轴消费者 mind_recovery | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷌ 同人 / hex_13 | mentor_near；真实师尊在场时学习速率+8% | 未激活：缺条件事实 mentor_near | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷍ 大有 / hex_14 | named_artifact_owned；持有铭名法宝时器灵蕴养进度+6% | 未激活：缺条件事实 named_artifact_owned | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷎ 谦 / hex_15 | learning_with_stronger；向更高境修士学习时新增心魔-8% | 未激活：缺条件事实 learning_with_stronger | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷏ 豫 / hex_16 | safe_rest；安全静修来源中顿悟条目权重+10% | 未激活：缺条件事实 safe_rest | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷐ 随 / hex_17 | following_real_companion；真实同行途中行程粮耗-4% | 未激活：缺条件事实 following_real_companion | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷑ 蛊 / hex_18 | active_poison；真实解丹毒治疗进度+6% | 未激活：缺条件事实 active_poison | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷒ 临 / hex_19 | heal_junior；为低境修士实际治疗量+8% | 未激活：缺条件事实 heal_junior | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷓ 观 / hex_20 | exploration；探索感知半径+1格 | 未激活：缺条件事实 exploration | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷔ 噬嗑 / hex_21 | enemy_shielded；攻击有真实护盾的目标时战力+4% | 未激活：缺条件事实 enemy_shielded | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷕ 贲 / hex_22 | first_paid_aid；每对人物首次付费援助关系增量+8% | 未激活：缺条件事实 first_paid_aid | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷖ 剥 / hex_23 | hp_below_30；气血低于30%时退避评分+0.08 | Life退避；真实条件成立才激活 | U一世一卦 | S | inkbox-wx-core / content.mjs | B：部分效果 |
| ䷗ 复 / hex_24 | rest_after_defeat；正式败退后的首次有效治疗量+8% | 未激活：缺条件事实 rest_after_defeat | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷘ 无妄 / hex_25 | no_unprovoked_kill_10y；十年无主动无故杀戮时诅咒抵抗+5个百分点 | 未激活：缺条件事实 no_unprovoked_kill_10y | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷙ 大畜 / hex_26 | manual_progress_above_half；功法学习后半程速率+6% | P学习；真实条件成立才激活 | U一世一卦 | S | inkbox-wx-core / content.mjs | B：部分效果 |
| ䷚ 颐 / hex_27 | fed_and_resting；有粮静养时实际治疗量+5% | 未激活：缺条件事实 fed_and_resting | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷛ 大过 / hex_28 | outnumbered；被多个真实敌人围攻时战力+4% | 未激活：缺条件事实 outnumbered | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷜ 坎 / hex_29 | water_hazard；水域灾害伤害-6% | 未激活：缺条件事实 water_hazard | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷝ 离 / hex_30 | fire_skill；火属性术法威力+4% | 未激活：缺条件事实 fire_skill | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷞ 咸 / hex_31 | partner_near；道侣在场时双修实际增量+8% | 未激活：缺条件事实 partner_near | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷟ 恒 / hex_32 | same_manual_10y；连续主修同一功法十年后修炼速率+4% | 未激活：缺条件事实 same_manual_10y | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷠ 遁 / hex_33 | enemy_stronger；敌方境界更高时退避评分+0.06 | 未激活：缺条件事实 enemy_stronger | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷡ 大壮 / hex_34 | hp_above_80；气血高于80%时肉身招式威力+4% | 未激活：缺轴消费者 physical_power | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷢ 晋 / hex_35 | after_major_success_360d；跨大境界成功后一年修炼速率+5% | 未激活：缺条件事实 after_major_success_360d | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷣ 明夷 / hex_36 | hp_below_30；重伤时敌方感知半径对本人减1格 | 未激活：缺轴消费者 detection_against_me | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷤ 家人 / hex_37 | heal_true_kin；为真实亲属实际治疗量+8% | 未激活：缺条件事实 heal_true_kin | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷥ 睽 / hex_38 | different_path_mentor；向异道真实师尊学习时速率+8% | 未激活：缺条件事实 different_path_mentor | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷦ 蹇 / hex_39 | land_detour；有实际绕行路径时绕行粮耗-5% | 未激活：缺条件事实 land_detour | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷧ 解 / hex_40 | active_demon；真实祛心魔行动进度+6% | 未激活：缺条件事实 active_demon | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷨ 损 / hex_41 | paid_resource_study；已经支付资源的研习进度+8% | 未激活：缺条件事实 paid_resource_study | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷩ 益 / hex_42 | aid_without_repayment；无即时回报的真实援助治疗量+6% | 未激活：缺条件事实 aid_without_repayment | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷪ 夬 / hex_43 | enemy_hp_below_30；目标气血低于30%时肉身招式威力+4% | 未激活：缺条件事实 enemy_hp_below_30 | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷫ 姤 / hex_44 | first_real_meeting；首次真实相遇来源中结缘条目权重+10% | 未激活：缺条件事实 first_real_meeting | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷬ 萃 / hex_45 | three_allies_near；至少三名真实友方在场时修炼速率+3% | 未激活：缺条件事实 three_allies_near | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷭ 升 / hex_46 | same_path_manual；主修道途内功法学习速率+6% | 未激活：缺条件事实 same_path_manual | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷮ 困 / hex_47 | low_resources；真实物资匮乏时新增心魔-6% | 未激活：缺条件事实 low_resources | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷯ 井 / hex_48 | at_home_village；在真实所属聚落治疗他人时治疗量+6% | daoActivities 丹修在所属聚落治疗他人；wx-healing 实测 | U一世一卦 | S | inkbox-wx-core / content.mjs | B：部分效果 |
| ䷰ 革 / hex_49 | first_year_after_path_change；正式转道后首年功法学习速率+6% | 未激活：缺条件事实 first_year_after_path_change | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷱ 鼎 / hex_50 | paid_alchemy；真实付料炼丹有效产出期望+4% | 未激活：缺条件事实 paid_alchemy | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷲ 震 / hex_51 | thunder_hit；真实雷劫伤害-4% | 未激活：缺条件事实 thunder_hit | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷳ 艮 / hex_52 | stationary_guard；真实驻守中受到伤害-4% | 未激活：缺条件事实 stationary_guard | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷴ 渐 / hex_53 | same_item_10y；同一器物相伴十年后蕴养进度+8% | 未激活：缺条件事实 same_item_10y | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷵ 归妹 / hex_54 | partner_other_path；异道道侣合法共修增量+8% | 未激活：缺条件事实 partner_other_path | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷶ 丰 / hex_55 | at_ruin；真实遗址内感知半径+1格 | 未激活：缺条件事实 at_ruin | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷷ 旅 / hex_56 | away_from_home；离开所属聚落修炼时速率+3% | E修炼；真实条件成立才激活 | U一世一卦 | S | inkbox-wx-core / content.mjs | B：部分效果 |
| ䷸ 巽 / hex_57 | land_journey；合法陆路行程粮耗-3% | 未激活：缺轴消费者 travel_cost | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷹ 兑 / hex_58 | friendly_company；与真实友方相处时道心自然恢复+6% | 未激活：缺条件事实 friendly_company | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷺ 涣 / hex_59 | after_escape_180d；真实脱战后180日内治疗量+6% | 未激活：缺条件事实 after_escape_180d | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷻ 节 / hex_60 | using_equipped_skill；已装配技能的灵力消耗-4% | 未激活：缺条件事实 using_equipped_skill | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷼ 中孚 / hex_61 | kept_active_vow；履行真实誓约的修持类进度+6% | 未激活：缺条件事实 kept_active_vow | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷽ 小过 / hex_62 | minor_hazard；轻度风险下退避评分+0.04 | 未激活：缺条件事实 minor_hazard | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷾ 既济 / hex_63 | after_successful_trial；成功渡劫后本次法宝磨损-6% | 未激活：缺条件事实 after_successful_trial | U一世一卦 | S | inkbox-wx-core / content.mjs | C |
| ䷿ 未济 / hex_64 | failed_manual_check；真实学习失败后下一段学习进度+6% | 未激活：缺条件事实 failed_manual_check | U一世一卦 | S | inkbox-wx-core / content.mjs | C |

## 血脉与 DNA

| 机制 | 数据定义 | 真实消费者 | UI/编辑 | 存档 | 验证入口 | 状态/限制 |
|---|---|---|---|---|---|---|
| 真龙血脉 / true_dragon | D.bloodlines；九阶 | E战力按grade/purity；encounters龙骨取得/定脉 | U显隐/纯度/稳定 | S | inkbox-wx-core / damage.mjs | B；龙威压制未接 |
| 天凤血脉 / heaven_phoenix | D.bloodlines；九阶 | 无死亡前涅槃拦截 | U显隐/纯度/稳定 | S | inkbox-wx-core / damage.mjs | C；三次本源/50年冷却/虚弱待做 |
| 神王血脉 / god_king | D.bloodlines；九阶 | 无碎片取得与觉醒消费 | U显隐/纯度/稳定 | S | inkbox-wx-core / damage.mjs | C；唯一碎片及残缺传承待做 |
| 修罗战血 / asura | D.bloodlines；九阶 | damage.js#postCombatHit 真实战斗贡献 | U显隐/纯度/稳定 | S | inkbox-wx-core / damage.mjs | B；同目标去重，360日最多3次，短期增益，完整杀孽链待扩 |
| 合法双亲出生 | profile.js/inheritance.js | sim/life.js出生提交 → inheritance.js#inheritBirthProfile | U家系/来源只读 | S | inkbox-wx-integration / core.mjs | B；不绕过人口/粮食/年龄/同村原门槛；最多一显两潜 |
| 血系来源/返祖 | profile.js/inheritance.js | inheritBirthProfile稳定且inheritable血系池 | U家系/来源只读 | S | inkbox-wx-integration / core.mjs | B；双亲来源；品阶小概率+1；并非独立返祖经历 |
| 灵根元素/体质 | profile.js/inheritance.js | inheritBirthProfile rootTemplate/阶段0体质 | U家系/来源只读 | S | inkbox-wx-integration / core.mjs | B；不复制修炼进度；性格遗传未实现 |
| 后天龙血定脉 | profile.js/inheritance.js | encounters.js真实洞府资源消耗与180日门槛 | U家系/来源只读 | S | inkbox-wx-integration / core.mjs | B；初获不可遗传；定脉再耗资源，后代验证待最终集成 |
| 身份迁移 | profile.js/inheritance.js | inheritance.js#migrateProfile及三界迁移接点 | U家系/来源只读 | S | inkbox-wx-integration / core.mjs | B；同世保留；关系清理；转世不得复制旧事实 |

## 经历词条（18）

| 词条 / ID | 数据定义 | 真实消费者/触发 | UI/编辑 | 存档 | 验证入口 | 状态及差距 |
|---|---|---|---|---|---|---|
| 剑心初明 / sword_heart | content/experienceTraits.js | 真实突破成功抽取 → E剑道战力/突破 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B |
| 破境余韵 / breakthrough_echo | content/experienceTraits.js | 真实突破成功抽取 → E修炼/期限 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；重复获得最长720日规则尚需逐项验收 |
| 经脉受损 / meridian_damage | content/experienceTraits.js | 真实突破失败 → E气血/修炼；付费间隔治疗 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B |
| 畏险未平 / risk_fear | content/experienceTraits.js | 真实探府失败 → encounters行动/ Life退避 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B |
| 险中有定 / risk_resolve | content/experienceTraits.js | 同洞府720日内成功替换畏险 → encounters行动 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B |
| 劫后筋骨 / tempered_bones | content/experienceTraits.js | 无真实授予和目标消费者 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | C；气血上限+6% |
| 受恩未忘 / gratitude | content/experienceTraits.js | 真实付费治疗记恩对象 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | C；无帮助候选评分消费者 |
| 丹修护关 / alchemy_guard | content/experienceTraits.js | 无真实授予和目标消费者 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | C；下一次实际突破率+2个百分点 |
| 剑诀温习 / sword_review | content/experienceTraits.js | 无真实授予和目标消费者 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | C；剑道时战力+4% |
| 道心蒙尘 / dusty_mind | content/experienceTraits.js | 无真实授予和目标消费者 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | C；突破率-1.5个百分点 |
| 浊息自持 / pollution_restraint | content/experienceTraits.js | 无真实授予和目标消费者 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | C；基础自然污染增长速率-15% |
| 伤中悟势 / wounded_insight | content/experienceTraits.js | 无真实授予和目标消费者 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | C；战力+4%，气血上限-5% |
| 识器成癖 / artifact_obsession | content/experienceTraits.js | 无真实授予和目标消费者 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | C；合法法宝目标评分+0.20 |
| 探府余伤 / site_wound | content/experienceTraits.js | 真实探府失败 → E气血/期限 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B |
| 同参余悟 / shared_insight | content/experienceTraits.js | 无真实授予和目标消费者 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | C；与真实援助者同位面8格内修炼速率+4% |
| 魔剑共鸣 / demon_sword_resonance | content/experienceTraits.js | legend原物领取 → E战力；绑定原剑 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；污染代价需最终接线核验 |
| 守阙之誓 / seal_vow | content/experienceTraits.js | legend封印扣寿 → E突破/锚点近距气血 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；原物持续封印 |
| 剑煞入脉 / sword_blight | content/experienceTraits.js | legend失败 → E气血 | U经历只读；特殊禁止普通编辑 | S | inkbox-wx-experiences.mjs | B；三次治疗/远离90日退出未实现，污染代价待核验 |

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
| 蜕凡更始真君 / dao_seed_bian_ji | content/daoSeeds.js | 无 | U展示；非任意造物授予 | S | inkbox-wx-experiences.mjs | C；以明确代价将一项体质或血脉转化为另一阶段 |
| 司辰定律道君 / dao_seed_ji_lv | content/daoSeeds.js | 无 | U展示；非任意造物授予 | S | inkbox-wx-experiences.mjs | C；符合既定修持条件时稳定学习和突破的小幅波动 |
| 冲和衡悖天尊 / dao_seed_bei_heng | content/daoSeeds.js | 无 | U展示；非任意造物授予 | S | inkbox-wx-experiences.mjs | C；在有限时间容纳一组明确互斥功法标签 |
| 织命混沌尊主 / dao_seed_ming_wang | content/daoSeeds.js | 无 | U展示；非任意造物授予 | S | inkbox-wx-experiences.mjs | C；将两个真实人物、物件或地点建立可追踪因缘条件 |
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
