// Exact source snapshot: 命簿V02_内容目录.json. Design definitions, not activation claims.
export default {
  "schema": "inkbox.mingpu.design.v0.2",
  "baseline": "5746e4e541a6ebf78aca201507d8e7bd8febf1fe",
  "status": "DESIGN_NOT_GAME_INTEGRATION",
  "rootTiers": [
    "五灵根·杂灵根",
    "四灵根·假灵根",
    "三灵根·真灵根",
    "双灵根·天才",
    "单灵根·顶尖",
    "天灵根·绝世"
  ],
  "physiques": [
    {
      "id": "chaos",
      "name": "混沌道体",
      "group": "法则",
      "effect": "忽略功法元素排斥，学习兼容全部道途；修炼速率×0.65",
      "consumer": "功法契约；学习与修炼",
      "inheritance": "稳定后可遗传倾向",
      "limit": "功法仍需取得，境界与资源门槛不豁免",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "spacetime",
      "name": "时空道体",
      "group": "法则",
      "effect": "合法行程时间-12%；每次特殊穿行有迷失风险",
      "consumer": "交通与特殊穿行",
      "inheritance": "稳定后可遗传倾向",
      "limit": "不得瞬移越过封闭地图或不可达海陆",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "dao_embryo",
      "name": "先天道胎",
      "group": "法则",
      "effect": "功法学习+25%，悟性+10；气血上限-15%",
      "consumer": "基础属性、功法学习",
      "inheritance": "先天可遗传",
      "limit": "悟性贡献与直接加成同轴合并",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "solar",
      "name": "太阳圣体",
      "group": "五行",
      "effect": "阳系术法+12%，对阴邪目标额外条件收益；寒地修持受限",
      "consumer": "战斗标签、环境",
      "inheritance": "先天可遗传",
      "limit": "阴邪由真实标签判断",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "lunar",
      "name": "太阴圣体",
      "group": "五行",
      "effect": "阴系主修成长+15%；污染过高时反噬风险",
      "consumer": "功法修持、反噬",
      "inheritance": "先天可遗传",
      "limit": "不按现实墙钟判断夜晚",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "thunder",
      "name": "雷霆战体",
      "group": "五行",
      "effect": "雷系攻击+12%；主动引雷时承受额外劫压",
      "consumer": "类型战斗、天劫",
      "inheritance": "先天可遗传",
      "limit": "未实现雷伤读取前不能显示已生效",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "wood",
      "name": "乙木灵体",
      "group": "五行",
      "effect": "真实治疗量+12%，炼丹学习+15%",
      "consumer": "丹修活动、功法学习",
      "inheritance": "先天可遗传",
      "limit": "不能无成本产出丹药",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "fire_eater",
      "name": "离火道体",
      "group": "五行",
      "effect": "火系修持+8%；吞噬真实异火可进化，累计三阶",
      "consumer": "唯一资源消耗、进化",
      "inheritance": "稳定后可遗传初阶",
      "limit": "不遗传已吞异火数量",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "sword",
      "name": "乾坤剑体",
      "group": "剑道",
      "effect": "剑法学习+30%；名剑感知半径+3格",
      "consumer": "学习、空间查询",
      "inheritance": "先天可遗传",
      "limit": "一学即通体现低阶快速入门，高阶仍需修炼",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "spell_ward",
      "name": "万法不侵体",
      "group": "生存",
      "effect": "术法伤害减免25%；肉身伤害承受+15%",
      "consumer": "伤害类型管线",
      "inheritance": "先天可遗传",
      "limit": "不是所有伤害免疫",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "earth",
      "name": "后土圣体",
      "group": "生存",
      "effect": "承伤-15%，合法陆路行程时间+12%",
      "consumer": "伤害、交通",
      "inheritance": "先天可遗传",
      "limit": "不承诺数学意义的同阶无敌",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "undying",
      "name": "万劫不灭体",
      "group": "生存",
      "effect": "有效重创后恢复可永久气血+2%，最多五次",
      "consumer": "伤害事件、恢复里程碑",
      "inheritance": "遗传初始体质",
      "limit": "同伤源一年冷却，不以每次掉血计数",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "yin_block",
      "name": "九阴绝脉",
      "group": "反转",
      "effect": "闭塞时修炼×0.45；通脉后阴系修炼+20%",
      "consumer": "修炼、真实通脉链",
      "inheritance": "可遗传闭塞倾向",
      "limit": "通脉前后的版本互斥",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "yang_block",
      "name": "九阳绝脉",
      "group": "反转",
      "effect": "闭塞时修炼×0.45；通脉后阳系修炼+20%",
      "consumer": "修炼、真实通脉链",
      "inheritance": "可遗传闭塞倾向",
      "limit": "不能同时添加闭塞和通脉版本",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "devour",
      "name": "噬灵体",
      "group": "反转",
      "effect": "灵力储量低；吸取真实敌方或阵法能量转短期施法资源",
      "consumer": "灵力、战斗、阵法",
      "inheritance": "稳定后可遗传倾向",
      "limit": "守恒转移，不偷境界与永久修为",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "mortal",
      "name": "凡体",
      "group": "概念",
      "effect": "初始无附加；完成藏奇分支后可抵抗推演与诅咒",
      "consumer": "推演、诅咒、经历",
      "inheritance": "普通凡体不遗传藏奇结果",
      "limit": "防止人人无体质就自动获得免疫",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "causal",
      "name": "因果道体",
      "group": "概念",
      "effect": "合法因缘条目相对权重+15%；每20年一次支脉抉择资格",
      "consumer": "经历权重、因缘链",
      "inheritance": "不直接遗传能力",
      "limit": "不能重抽已提交结果",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    },
    {
      "id": "calamity",
      "name": "劫罚之体",
      "group": "概念",
      "effect": "可发起有范围和代价的引劫行动；自身也承劫",
      "consumer": "天劫事务",
      "inheritance": "不直接遗传能力",
      "limit": "不是每tick对周围单位无限落雷",
      "exclusiveGroup": "primary_physique",
      "implemented": false
    }
  ],
  "bloodlines": [
    {
      "id": "true_dragon",
      "name": "真龙血脉",
      "effect": "肉身战力按血阶增长，龙威只压制合法低阶妖兽目标",
      "legacy": "龙裔血脉保留原版，真龙作为后续晋升",
      "special": "龙威"
    },
    {
      "id": "heaven_phoenix",
      "name": "天凤血脉",
      "effect": "涅槃在死亡提交前拦截一次合格致命伤，存活后进入虚弱",
      "legacy": "凤凰血脉保留原寿元加成，不直接变成复活",
      "special": "本世累计最多三次、每次消耗一羽本源、50年冷却；奖励累计封顶"
    },
    {
      "id": "god_king",
      "name": "神王血脉",
      "effect": "学习残缺传承资格，肉身增长需实际觉醒",
      "legacy": "新增稳定ID",
      "special": "神性碎片有唯一物件与已用标识"
    },
    {
      "id": "asura",
      "name": "修罗战血",
      "effect": "有效战斗贡献增加短期战意与有限修持",
      "legacy": "不等于血修道途",
      "special": "同目标递减、弱小无威胁目标无成长收益；杀孽仍累积"
    }
  ],
  "bloodGrades": [
    "低级下等",
    "低级中等",
    "低级上等",
    "中级下等",
    "中级中等",
    "中级上等",
    "高级下等",
    "高级中等",
    "高级上等"
  ],
  "hexagrams": [
    {
      "id": "hex_01",
      "kingWenNumber": 1,
      "name": "乾",
      "symbol": "䷀",
      "effect": {
        "axis": "cultivation",
        "condition": "always",
        "value": 0.03
      },
      "family": "奋进",
      "effectText": "修炼速率+3%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:乾",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_02",
      "kingWenNumber": 2,
      "name": "坤",
      "symbol": "䷁",
      "effect": {
        "axis": "maxHp",
        "condition": "always",
        "value": 0.04
      },
      "family": "守成",
      "effectText": "气血上限+4%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:坤",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_03",
      "kingWenNumber": 3,
      "name": "屯",
      "symbol": "䷂",
      "effect": {
        "axis": "breakthrough",
        "condition": "prior_failure_same_gate",
        "value": 0.01
      },
      "family": "逆境",
      "effectText": "同瓶颈曾失败时突破率+1个百分点",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:屯",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_04",
      "kingWenNumber": 4,
      "name": "蒙",
      "symbol": "䷃",
      "effect": {
        "axis": "learning",
        "condition": "first_manual",
        "value": 0.08
      },
      "family": "求道",
      "effectText": "第一门功法学习速率+8%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:蒙",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_05",
      "kingWenNumber": 5,
      "name": "需",
      "symbol": "䷄",
      "effect": {
        "axis": "cultivation",
        "condition": "resting_90d",
        "value": 0.04
      },
      "family": "守成",
      "effectText": "连续静修90日后修炼速率+4%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:需",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_06",
      "kingWenNumber": 6,
      "name": "讼",
      "symbol": "䷅",
      "effect": {
        "axis": "combat",
        "condition": "defending_rival",
        "value": 0.03
      },
      "family": "争锋",
      "effectText": "被真实仇敌先手攻击时战力+3%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:讼",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_07",
      "kingWenNumber": 7,
      "name": "师",
      "symbol": "䷆",
      "effect": {
        "axis": "combat",
        "condition": "same_sect_ally_near",
        "value": 0.03
      },
      "family": "同道",
      "effectText": "同门参战在场时战力+3%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:师",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_08",
      "kingWenNumber": 8,
      "name": "比",
      "symbol": "䷇",
      "effect": {
        "axis": "healing",
        "condition": "heal_ally",
        "value": 0.06
      },
      "family": "同道",
      "effectText": "为既有友好对象实际治疗量+6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:比",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_09",
      "kingWenNumber": 9,
      "name": "小畜",
      "symbol": "䷈",
      "effect": {
        "axis": "learning",
        "condition": "manual_progress_below_half",
        "value": 0.06
      },
      "family": "求道",
      "effectText": "功法学习前半程速率+6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:小畜",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_10",
      "kingWenNumber": 10,
      "name": "履",
      "symbol": "䷉",
      "effect": {
        "axis": "escape",
        "condition": "hazard_retreat",
        "value": 0.05
      },
      "family": "行旅",
      "effectText": "危险地形退避评分+0.05",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:履",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_11",
      "kingWenNumber": 11,
      "name": "泰",
      "symbol": "䷊",
      "effect": {
        "axis": "cultivation",
        "condition": "mind_above_70",
        "value": 0.04
      },
      "family": "守成",
      "effectText": "道心高于70时修炼速率+4%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:泰",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_12",
      "kingWenNumber": 12,
      "name": "否",
      "symbol": "䷋",
      "effect": {
        "axis": "mind_recovery",
        "condition": "pollution_above_40",
        "value": 0.08
      },
      "family": "逆境",
      "effectText": "污染超过40时自然道心恢复+8%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:否",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_13",
      "kingWenNumber": 13,
      "name": "同人",
      "symbol": "䷌",
      "effect": {
        "axis": "learning",
        "condition": "mentor_near",
        "value": 0.08
      },
      "family": "同道",
      "effectText": "真实师尊在场时学习速率+8%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:同人",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_14",
      "kingWenNumber": 14,
      "name": "大有",
      "symbol": "䷍",
      "effect": {
        "axis": "artifact_bond",
        "condition": "named_artifact_owned",
        "value": 0.06
      },
      "family": "器缘",
      "effectText": "持有铭名法宝时器灵蕴养进度+6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:大有",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_15",
      "kingWenNumber": 15,
      "name": "谦",
      "symbol": "䷎",
      "effect": {
        "axis": "demon_gain",
        "condition": "learning_with_stronger",
        "value": -0.08
      },
      "family": "求道",
      "effectText": "向更高境修士学习时新增心魔-8%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:谦",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_16",
      "kingWenNumber": 16,
      "name": "豫",
      "symbol": "䷏",
      "effect": {
        "axis": "insight_weight",
        "condition": "safe_rest",
        "value": 0.1
      },
      "family": "求道",
      "effectText": "安全静修来源中顿悟条目权重+10%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:豫",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_17",
      "kingWenNumber": 17,
      "name": "随",
      "symbol": "䷐",
      "effect": {
        "axis": "travel_cost",
        "condition": "following_real_companion",
        "value": -0.04
      },
      "family": "行旅",
      "effectText": "真实同行途中行程粮耗-4%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:随",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_18",
      "kingWenNumber": 18,
      "name": "蛊",
      "symbol": "䷑",
      "effect": {
        "axis": "purification",
        "condition": "active_poison",
        "value": 0.06
      },
      "family": "疗愈",
      "effectText": "真实解丹毒治疗进度+6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:蛊",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_19",
      "kingWenNumber": 19,
      "name": "临",
      "symbol": "䷒",
      "effect": {
        "axis": "healing",
        "condition": "heal_junior",
        "value": 0.08
      },
      "family": "同道",
      "effectText": "为低境修士实际治疗量+8%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:临",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_20",
      "kingWenNumber": 20,
      "name": "观",
      "symbol": "䷓",
      "effect": {
        "axis": "detect_radius",
        "condition": "exploration",
        "value": 1.0
      },
      "family": "行旅",
      "effectText": "探索感知半径+1格",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:观",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_21",
      "kingWenNumber": 21,
      "name": "噬嗑",
      "symbol": "䷔",
      "effect": {
        "axis": "combat",
        "condition": "enemy_shielded",
        "value": 0.04
      },
      "family": "争锋",
      "effectText": "攻击有真实护盾的目标时战力+4%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:噬嗑",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_22",
      "kingWenNumber": 22,
      "name": "贲",
      "symbol": "䷕",
      "effect": {
        "axis": "bond_gain",
        "condition": "first_paid_aid",
        "value": 0.08
      },
      "family": "同道",
      "effectText": "每对人物首次付费援助关系增量+8%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:贲",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_23",
      "kingWenNumber": 23,
      "name": "剥",
      "symbol": "䷖",
      "effect": {
        "axis": "escape",
        "condition": "hp_below_30",
        "value": 0.08
      },
      "family": "逆境",
      "effectText": "气血低于30%时退避评分+0.08",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:剥",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_24",
      "kingWenNumber": 24,
      "name": "复",
      "symbol": "䷗",
      "effect": {
        "axis": "healing_received",
        "condition": "rest_after_defeat",
        "value": 0.08
      },
      "family": "疗愈",
      "effectText": "正式败退后的首次有效治疗量+8%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:复",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_25",
      "kingWenNumber": 25,
      "name": "无妄",
      "symbol": "䷘",
      "effect": {
        "axis": "curse_resist",
        "condition": "no_unprovoked_kill_10y",
        "value": 0.05
      },
      "family": "守成",
      "effectText": "十年无主动无故杀戮时诅咒抵抗+5个百分点",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:无妄",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_26",
      "kingWenNumber": 26,
      "name": "大畜",
      "symbol": "䷙",
      "effect": {
        "axis": "learning",
        "condition": "manual_progress_above_half",
        "value": 0.06
      },
      "family": "求道",
      "effectText": "功法学习后半程速率+6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:大畜",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_27",
      "kingWenNumber": 27,
      "name": "颐",
      "symbol": "䷚",
      "effect": {
        "axis": "healing_received",
        "condition": "fed_and_resting",
        "value": 0.05
      },
      "family": "疗愈",
      "effectText": "有粮静养时实际治疗量+5%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:颐",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_28",
      "kingWenNumber": 28,
      "name": "大过",
      "symbol": "䷛",
      "effect": {
        "axis": "combat",
        "condition": "outnumbered",
        "value": 0.04
      },
      "family": "逆境",
      "effectText": "被多个真实敌人围攻时战力+4%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:大过",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_29",
      "kingWenNumber": 29,
      "name": "坎",
      "symbol": "䷜",
      "effect": {
        "axis": "damage_taken",
        "condition": "water_hazard",
        "value": -0.06
      },
      "family": "行旅",
      "effectText": "水域灾害伤害-6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:坎",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_30",
      "kingWenNumber": 30,
      "name": "离",
      "symbol": "䷝",
      "effect": {
        "axis": "spell_power",
        "condition": "fire_skill",
        "value": 0.04
      },
      "family": "争锋",
      "effectText": "火属性术法威力+4%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:离",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_31",
      "kingWenNumber": 31,
      "name": "咸",
      "symbol": "䷞",
      "effect": {
        "axis": "companion_resonance",
        "condition": "partner_near",
        "value": 0.08
      },
      "family": "同道",
      "effectText": "道侣在场时双修实际增量+8%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:咸",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_32",
      "kingWenNumber": 32,
      "name": "恒",
      "symbol": "䷟",
      "effect": {
        "axis": "cultivation",
        "condition": "same_manual_10y",
        "value": 0.04
      },
      "family": "守成",
      "effectText": "连续主修同一功法十年后修炼速率+4%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:恒",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_33",
      "kingWenNumber": 33,
      "name": "遁",
      "symbol": "䷠",
      "effect": {
        "axis": "escape",
        "condition": "enemy_stronger",
        "value": 0.06
      },
      "family": "行旅",
      "effectText": "敌方境界更高时退避评分+0.06",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:遁",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_34",
      "kingWenNumber": 34,
      "name": "大壮",
      "symbol": "䷡",
      "effect": {
        "axis": "physical_power",
        "condition": "hp_above_80",
        "value": 0.04
      },
      "family": "争锋",
      "effectText": "气血高于80%时肉身招式威力+4%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:大壮",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_35",
      "kingWenNumber": 35,
      "name": "晋",
      "symbol": "䷢",
      "effect": {
        "axis": "cultivation",
        "condition": "after_major_success_360d",
        "value": 0.05
      },
      "family": "奋进",
      "effectText": "跨大境界成功后一年修炼速率+5%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:晋",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_36",
      "kingWenNumber": 36,
      "name": "明夷",
      "symbol": "䷣",
      "effect": {
        "axis": "detection_against_me",
        "condition": "hp_below_30",
        "value": -1.0
      },
      "family": "逆境",
      "effectText": "重伤时敌方感知半径对本人减1格",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:明夷",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_37",
      "kingWenNumber": 37,
      "name": "家人",
      "symbol": "䷤",
      "effect": {
        "axis": "healing",
        "condition": "heal_true_kin",
        "value": 0.08
      },
      "family": "同道",
      "effectText": "为真实亲属实际治疗量+8%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:家人",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_38",
      "kingWenNumber": 38,
      "name": "睽",
      "symbol": "䷥",
      "effect": {
        "axis": "learning",
        "condition": "different_path_mentor",
        "value": 0.08
      },
      "family": "求道",
      "effectText": "向异道真实师尊学习时速率+8%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:睽",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_39",
      "kingWenNumber": 39,
      "name": "蹇",
      "symbol": "䷦",
      "effect": {
        "axis": "travel_cost",
        "condition": "land_detour",
        "value": -0.05
      },
      "family": "行旅",
      "effectText": "有实际绕行路径时绕行粮耗-5%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:蹇",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_40",
      "kingWenNumber": 40,
      "name": "解",
      "symbol": "䷧",
      "effect": {
        "axis": "purification",
        "condition": "active_demon",
        "value": 0.06
      },
      "family": "疗愈",
      "effectText": "真实祛心魔行动进度+6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:解",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_41",
      "kingWenNumber": 41,
      "name": "损",
      "symbol": "䷨",
      "effect": {
        "axis": "learning",
        "condition": "paid_resource_study",
        "value": 0.08
      },
      "family": "求道",
      "effectText": "已经支付资源的研习进度+8%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:损",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_42",
      "kingWenNumber": 42,
      "name": "益",
      "symbol": "䷩",
      "effect": {
        "axis": "healing",
        "condition": "aid_without_repayment",
        "value": 0.06
      },
      "family": "同道",
      "effectText": "无即时回报的真实援助治疗量+6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:益",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_43",
      "kingWenNumber": 43,
      "name": "夬",
      "symbol": "䷪",
      "effect": {
        "axis": "physical_power",
        "condition": "enemy_hp_below_30",
        "value": 0.04
      },
      "family": "争锋",
      "effectText": "目标气血低于30%时肉身招式威力+4%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:夬",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_44",
      "kingWenNumber": 44,
      "name": "姤",
      "symbol": "䷫",
      "effect": {
        "axis": "encounter_weight",
        "condition": "first_real_meeting",
        "value": 0.1
      },
      "family": "同道",
      "effectText": "首次真实相遇来源中结缘条目权重+10%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:姤",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_45",
      "kingWenNumber": 45,
      "name": "萃",
      "symbol": "䷬",
      "effect": {
        "axis": "cultivation",
        "condition": "three_allies_near",
        "value": 0.03
      },
      "family": "同道",
      "effectText": "至少三名真实友方在场时修炼速率+3%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:萃",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_46",
      "kingWenNumber": 46,
      "name": "升",
      "symbol": "䷭",
      "effect": {
        "axis": "learning",
        "condition": "same_path_manual",
        "value": 0.06
      },
      "family": "求道",
      "effectText": "主修道途内功法学习速率+6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:升",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_47",
      "kingWenNumber": 47,
      "name": "困",
      "symbol": "䷮",
      "effect": {
        "axis": "demon_gain",
        "condition": "low_resources",
        "value": -0.06
      },
      "family": "逆境",
      "effectText": "真实物资匮乏时新增心魔-6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:困",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_48",
      "kingWenNumber": 48,
      "name": "井",
      "symbol": "䷯",
      "effect": {
        "axis": "healing",
        "condition": "at_home_village",
        "value": 0.06
      },
      "family": "疗愈",
      "effectText": "在真实所属聚落治疗他人时治疗量+6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:井",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_49",
      "kingWenNumber": 49,
      "name": "革",
      "symbol": "䷰",
      "effect": {
        "axis": "learning",
        "condition": "first_year_after_path_change",
        "value": 0.06
      },
      "family": "求道",
      "effectText": "正式转道后首年功法学习速率+6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:革",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_50",
      "kingWenNumber": 50,
      "name": "鼎",
      "symbol": "䷱",
      "effect": {
        "axis": "alchemy_yield",
        "condition": "paid_alchemy",
        "value": 0.04
      },
      "family": "疗愈",
      "effectText": "真实付料炼丹有效产出期望+4%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:鼎",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_51",
      "kingWenNumber": 51,
      "name": "震",
      "symbol": "䷲",
      "effect": {
        "axis": "tribulation_damage",
        "condition": "thunder_hit",
        "value": -0.04
      },
      "family": "逆境",
      "effectText": "真实雷劫伤害-4%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:震",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_52",
      "kingWenNumber": 52,
      "name": "艮",
      "symbol": "䷳",
      "effect": {
        "axis": "damage_taken",
        "condition": "stationary_guard",
        "value": -0.04
      },
      "family": "守成",
      "effectText": "真实驻守中受到伤害-4%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:艮",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_53",
      "kingWenNumber": 53,
      "name": "渐",
      "symbol": "䷴",
      "effect": {
        "axis": "artifact_bond",
        "condition": "same_item_10y",
        "value": 0.08
      },
      "family": "器缘",
      "effectText": "同一器物相伴十年后蕴养进度+8%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:渐",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_54",
      "kingWenNumber": 54,
      "name": "归妹",
      "symbol": "䷵",
      "effect": {
        "axis": "companion_resonance",
        "condition": "partner_other_path",
        "value": 0.08
      },
      "family": "同道",
      "effectText": "异道道侣合法共修增量+8%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:归妹",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_55",
      "kingWenNumber": 55,
      "name": "丰",
      "symbol": "䷶",
      "effect": {
        "axis": "detect_radius",
        "condition": "at_ruin",
        "value": 1.0
      },
      "family": "器缘",
      "effectText": "真实遗址内感知半径+1格",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:丰",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_56",
      "kingWenNumber": 56,
      "name": "旅",
      "symbol": "䷷",
      "effect": {
        "axis": "cultivation",
        "condition": "away_from_home",
        "value": 0.03
      },
      "family": "行旅",
      "effectText": "离开所属聚落修炼时速率+3%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:旅",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_57",
      "kingWenNumber": 57,
      "name": "巽",
      "symbol": "䷸",
      "effect": {
        "axis": "travel_cost",
        "condition": "land_journey",
        "value": -0.03
      },
      "family": "行旅",
      "effectText": "合法陆路行程粮耗-3%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:巽",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_58",
      "kingWenNumber": 58,
      "name": "兑",
      "symbol": "䷹",
      "effect": {
        "axis": "mind_recovery",
        "condition": "friendly_company",
        "value": 0.06
      },
      "family": "同道",
      "effectText": "与真实友方相处时道心自然恢复+6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:兑",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_59",
      "kingWenNumber": 59,
      "name": "涣",
      "symbol": "䷺",
      "effect": {
        "axis": "healing_received",
        "condition": "after_escape_180d",
        "value": 0.06
      },
      "family": "疗愈",
      "effectText": "真实脱战后180日内治疗量+6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:涣",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_60",
      "kingWenNumber": 60,
      "name": "节",
      "symbol": "䷻",
      "effect": {
        "axis": "spell_cost",
        "condition": "using_equipped_skill",
        "value": -0.04
      },
      "family": "守成",
      "effectText": "已装配技能的灵力消耗-4%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:节",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_61",
      "kingWenNumber": 61,
      "name": "中孚",
      "symbol": "䷼",
      "effect": {
        "axis": "vow_progress",
        "condition": "kept_active_vow",
        "value": 0.06
      },
      "family": "同道",
      "effectText": "履行真实誓约的修持类进度+6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:中孚",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_62",
      "kingWenNumber": 62,
      "name": "小过",
      "symbol": "䷽",
      "effect": {
        "axis": "escape",
        "condition": "minor_hazard",
        "value": 0.04
      },
      "family": "行旅",
      "effectText": "轻度风险下退避评分+0.04",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:小过",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_63",
      "kingWenNumber": 63,
      "name": "既济",
      "symbol": "䷾",
      "effect": {
        "axis": "artifact_wear",
        "condition": "after_successful_trial",
        "value": -0.06
      },
      "family": "器缘",
      "effectText": "成功渡劫后本次法宝磨损-6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:既济",
      "source": "fictional_game_design"
    },
    {
      "id": "hex_64",
      "kingWenNumber": 64,
      "name": "未济",
      "symbol": "䷿",
      "effect": {
        "axis": "learning",
        "condition": "failed_manual_check",
        "value": 0.06
      },
      "family": "逆境",
      "effectText": "真实学习失败后下一段学习进度+6%",
      "familyWeight": 1.15,
      "activation": "after_consumer_and_condition_implemented",
      "techniqueAccessTag": "hex:未济",
      "source": "fictional_game_design"
    }
  ],
  "hexagramRules": {
    "annualPeriodDays": 7200,
    "nativeLifetime": "one_incarnation",
    "bucketBudgetPreserved": true,
    "maxEntryWeightMultiplier": 1.35,
    "sameFamilyAnnualMultiplier": 1.1,
    "worldSchedule": "seeded_permutation_of_64_per_1280_year_cycle",
    "traditionalBasis": "names and ordering only; all mechanics fictional"
  },
  "categories": {
    "root": 1,
    "physique": 1,
    "activeBloodline": 1,
    "latentBloodlines": 2,
    "natalHexagram": 1,
    "personality": 3,
    "quirk": 4,
    "acquiredExperience": 6,
    "daoSeed": 1,
    "statePresentation": "show 4 critical then expand; underlying states are not discarded",
    "relations": "real edges, never inventory slots"
  },
  "sources": [
    "birth",
    "experience",
    "player",
    "inheritance",
    "manual",
    "artifact",
    "world_omen"
  ],
  "availabilityRule": "Only enable catalog items with implemented consumers; inspectable locked entries may show exact missing module."
};
