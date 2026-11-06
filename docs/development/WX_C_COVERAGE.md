# WX-C 新增消费者覆盖附表

本表由 `node scripts/inkbox-wx-c-coverage.mjs` 从机器清单生成。仅列本轮新增消费者；原设计与既有手工覆盖矩阵继续保留。B 表示存在下游消费者与定向验证，不表示完整自然人生或全部64卦完成。

| 条目 | 消费轴 | 正式入口 | 定向测试 | 状态 | 限制 |
|---|---|---|---|---|---|
| 大壮 / hex_34 | physical_power | wanxiang/skills.js#chooseSkillAction | wx-c-effects:34 | B | Equipped physical skill; ordinary fallback attacks unchanged |
| 夬 / hex_43 | physical_power | wanxiang/skills.js#chooseSkillAction | wx-c-effects:43 | B | Equipped physical skill; target HP strictly below 30 percent |
| 节 / hex_60 | spell_cost | wanxiang/skills.js#chooseSkillAction | wx-c-effects:60 | B | Every equipped skill actual mana payment (spell, physical, healing); no resource refund |

验证命令：`node scripts/inkbox-wx-c-effects.mjs`。清单驱动已装配技能的真实正反行动与法力支付断言；保存恢复、同日健康/目标/休眠/期限另有定向检查。画像不代替行动测试。
