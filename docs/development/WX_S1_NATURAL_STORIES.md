# WX-S1 自然拾章样本

取证运行 HEAD：3cd778ab5b843025398b922e767a11a263934705；此时工作树包含待提交修改。精确故事模块、模拟核心哈希及最终候选复跑 SHA 见 reports/local/wx-s1/profile/extraction.json；本文保留生成时快照。
三个样本均由 WX-D 正式小景创世、原生 advanceWorld 三日步长生成的 100 年检查点提取；无注入人物、资源、行动或结局。
读取按玩家主动查询执行，不写回世界，也不抽取随机流。100 次查询后的序列化世界与查询前一致；故事层没有推进/渲染钩子，纯投影存档增长为 0。

| 种子 | 世界日 | 入选卡 | 故事类型 | 未结 / 已结 | 查询 100 次 |
|---|---:|---:|---|---|---:|
| 61003 | 36000 | 65 | grateful-return 33、defeat-return 9、old-object 9、old-settlement 14 | resolved 41、watching 12、interrupted 4、unresolved 8 | 443.1 ms |
| 73101 | 36000 | 42 | grateful-return 14、defeat-return 3、old-object 11、old-settlement 14 | resolved 27、interrupted 6、unresolved 4、watching 5 | 301.8 ms |
| 20260914 | 36000 | 82 | grateful-return 43、old-settlement 16、old-object 12、defeat-return 11 | resolved 34、unresolved 15、interrupted 21、watching 12 | 476.3 ms |

## 自然故事摘录

### 恩义有回（grateful-return，种子 20260914，resolved）
来源键：grateful-return:person:mortal:40:1:native:healed%3Amortal%3A201%3A40%3A23223
起点第 23229 日；最近留存证据第 25965 日。
本世人物：秦少舒（mortal:40 · 第 1 世）
相关身份：mortal:201（mortal:201）
曾受援手；关系尚存只能说明有恩，回助须有真实支付与事务回执。

- 第 23229 日：正式记录：受到 mortal:201 的治疗，正式留有结恩记录（healed:mortal:201:40:23223）
- 第 23478 日：实际回助：付费护关，下一次正式突破可获助益；付出宗门灵石 0.25（repayment:mortal:40:23478:mortal:201:{"amount":0.25,"kind":"sect-spirit-stone","sectId":1}:付费护关，下一次正式突破可获助益）
- 第 23988 日：实际回助：付费护关，下一次正式突破可获助益；付出宗门灵石 0.25（repayment:mortal:40:23988:mortal:201:{"amount":0.25,"kind":"sect-spirit-stone","sectId":1}:付费护关，下一次正式突破可获助益）
- 第 25548 日：实际回助：疗愈142.6气血；付出宗门灵石 0.2（repayment:mortal:40:25548:mortal:201:{"amount":0.2,"kind":"sect-spirit-stone","sectId":1}:疗愈142.6气血）
- 第 25965 日：实际回助：疗愈142.6气血；付出宗门灵石 0.2（repayment:mortal:40:25965:mortal:201:{"amount":0.2,"kind":"sect-spirit-stone","sectId":1}:疗愈142.6气血）

### 败后问途（defeat-return，种子 61003，resolved）
来源键：defeat-return:person:mortal:295:1:native:site%3A65%3A295%3A1%3A35106
起点第 35106 日；最近留存证据第 35361 日。
本世人物：玄霜岳（mortal:295 · 第 1 世）
相关身份：中州平原·剑仙洞府（mortal:65）
一次探府失利之后，后来的选择仍须由实际到达与结果证明。

- 第 35106 日：正式经历记载：探府失败（地点 #65）（site:65:295:1:35106）
- 第 35313 日：正式选择记录：谨慎退避；这不等于再赴洞府（choice:mortal:295:35313:谨慎退避:65）
- 第 35361 日：再次实际探府，成功（地点 #65）（site:65:295:2:35361）

### 旧物寻踪（old-object，种子 61003，resolved）
来源键：old-object:mortal:artifact:1:artifact:1:[7578,"forged","顾少电"]
起点第 7578 日；最近留存证据第 25650 日。
相关身份：雷纹碑心（mortal:1）；顾少电 · 在世（mortal:37 · 第 1 世）
「雷纹碑心」现由顾少电持有；旧主身份仅据原物履历记载。

- 第 7578 日：据履历所记：炼成 · 顾少电（仅为履历姓名）（artifact:1:[7578,"forged","顾少电"]）
- 第 25650 日：据履历所记：器灵 · 顾少电（仅为履历姓名）（artifact:1:[25650,"spirit","顾少电"]）

### 故城余音（old-settlement，种子 61003，resolved）
来源键：old-settlement:mortal:settlement:6:settlement:mortal:6:[7830,"aid","沧澜阁调拨物资援助",2]
起点第 7830 日；最近留存证据第 31905 日。
相关身份：临驿（mortal:6）；沧澜阁（mortal:2）
「临驿」有正式恢复沿革；重建者身份未有记录则留白。

- 第 7830 日：沧澜阁调拨物资援助（settlement:mortal:6:[7830,"aid","沧澜阁调拨物资援助",2]）
- 第 18360 日：赤地旱岁，聚落受损（settlement:mortal:6:[18360,"disaster","赤地旱岁，聚落受损",0]）
- 第 18723 日：赤地旱岁，聚落受损（settlement:mortal:6:[18723,"disaster","赤地旱岁，聚落受损",0]）
- 第 19086 日：赤地旱岁，聚落受损（settlement:mortal:6:[19086,"disaster","赤地旱岁，聚落受损",0]）
- 第 19449 日：赤地旱岁，聚落受损（settlement:mortal:6:[19449,"disaster","赤地旱岁，聚落受损",0]）
- 第 19812 日：赤地旱岁，聚落受损（settlement:mortal:6:[19812,"disaster","赤地旱岁，聚落受损",0]）
- 第 21093 日：聚落灾后恢复（settlement:mortal:6:[21093,"recovered","聚落灾后恢复",0]）
- 第 30240 日：饥岁围城，聚落受损（settlement:mortal:6:[30240,"disaster","饥岁围城，聚落受损",0]）
- 第 30603 日：饥岁围城，聚落受损（settlement:mortal:6:[30603,"disaster","饥岁围城，聚落受损",0]）
- 第 30966 日：饥岁围城，聚落受损（settlement:mortal:6:[30966,"disaster","饥岁围城，聚落受损",0]）
- 第 31905 日：聚落灾后恢复（settlement:mortal:6:[31905,"recovered","聚落灾后恢复",0]）

## 可见来源与候选统计

以下为本轮存档中仍保留且能支持四家族的唯一 A/B 来源，不代表该世界曾发生事件总数。各来源类型、拒绝原因、原始候选与结局分布见 extraction.json。
- 种子 61003 / 第 100 年：可证来源 220；类型 {"healed":57,"paid-reciprocity":51,"site-failure":9,"谨慎退避":1,"site-success":3,"forged":9,"spirit":2,"found":2,"disaster":62,"recovered":17,"aid":5,"abandoned":2}；四家族原始候选 {"grateful-return":36,"defeat-return":9,"old-object":9,"old-settlement":14}；选择去重 0、每人预算拒绝 0、容量拒绝 0。
- 种子 73101 / 第 100 年：可证来源 162；类型 {"healed":17,"paid-reciprocity":26,"site-failure":3,"site-success":1,"谨慎退避":1,"forged":11,"found":6,"disaster":71,"recovered":11,"aid":12,"abandoned":3}；四家族原始候选 {"grateful-return":14,"defeat-return":3,"old-object":11,"old-settlement":14}；选择去重 0、每人预算拒绝 0、容量拒绝 0。
- 种子 20260914 / 第 100 年：可证来源 233；类型 {"healed":54,"paid-reciprocity":47,"site-failure":11,"forged":12,"disaster":78,"aid":22,"recovered":7,"abandoned":2}；四家族原始候选 {"grateful-return":46,"defeat-return":11,"old-object":12,"old-settlement":16}；选择去重 0、每人预算拒绝 0、容量拒绝 0。

## 口径与限制

查询候选统计来自 `storySelection`，原始候选统计独立于展示预算。三种子各有不同的有限留存范围，卡片缺少来源时显示未可考/失考。自然摘录与受控边界测试分开，不以夹具补数。

查询后纯度：三个世界均逐字相同。
