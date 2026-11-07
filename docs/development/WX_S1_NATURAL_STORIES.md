# WX-S1 自然拾章样本

提取源码 SHA：c4b169d707704b614344345dfb1cac8fe96d50a9。报告记录故事模块与模拟核心文件哈希。
三个样本均由 WX-D 正式小景创世、原生 advanceWorld 三日步长生成的 100 年检查点提取；无注入人物、资源、行动或结局。
读取按玩家主动查询执行，不写回世界，也不抽取随机流。100 次查询后的序列化世界与查询前一致；故事层没有推进/渲染钩子，纯投影存档增长为 0。

| 种子 | 世界日 | 入选卡 | 故事类型 | 未结 / 已结 | 查询 100 次 |
|---|---:|---:|---|---|---:|
| 61003 | 36000 | 65 | old-object 9、old-settlement 14、grateful-return 33、defeat-return 9 | resolved 40、watching 12、unresolved 9、interrupted 4 | 452.7 ms |
| 73101 | 36000 | 42 | old-object 11、old-settlement 14、grateful-return 14、defeat-return 3 | resolved 27、interrupted 6、unresolved 4、watching 5 | 291.7 ms |
| 20260914 | 36000 | 82 | old-settlement 16、grateful-return 43、old-object 12、defeat-return 11 | unresolved 16、interrupted 20、resolved 34、watching 12 | 474.5 ms |

## 自然故事摘录

### 恩义有回（grateful-return，种子 61003，resolved）
来源键：grateful-return:person:mortal:160:1:native:healed%3Amortal%3A96%3A160%3A18873
起点第 18888 日；最近留存证据第 21294 日。
曾受援手；关系尚存只能说明有恩，回助须有真实支付与事务回执。

- 第 18888 日：正式记录：受到 mortal:96 的治疗，正式留有结恩记录（undefined）
- 第 21294 日：实际回助：付费护关，下一次正式突破可获助益；付出宗门灵石 0.25（undefined）

### 败后问途（defeat-return，种子 61003，resolved）
来源键：defeat-return:person:mortal:305:1:native:site%3A56%3A305%3A1%3A31848
起点第 31848 日；最近留存证据第 32295 日。
一次探府失利之后，后来的选择仍须由实际到达与结果证明。

- 第 31848 日：正式经历记载：探府失败（地点 #56）（undefined）
- 第 32295 日：再次实际探府，成功（地点 #56）（undefined）

### 旧物寻踪（old-object，种子 61003，resolved）
来源键：old-object:mortal:artifact:1:artifact:1:[7578,"forged","顾少电"]
起点第 7578 日；最近留存证据第 25650 日。
「雷纹碑心」现由顾少电持有；旧主身份仅据原物履历记载。

- 第 7578 日：据履历所记：炼成 · 顾少电（仅为履历姓名）（undefined）
- 第 25650 日：据履历所记：器灵 · 顾少电（仅为履历姓名）（undefined）

## 口径与限制

查询候选统计来自 `storySelection`；来源事实总量来自 `storyReading.stats.facts`。三种子各有不同的有限留存范围，卡片展示缺少来源时会保留未可考/失考。若完整自然连续故事不足三条，报告按实际抽取数量列出，不以夹具补数。

查询后纯度：三个世界均逐字相同。
