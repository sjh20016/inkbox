# WX-C · 万象生缘 Alpha 交接

开发基线：PR [#60](https://github.com/sjh20016/inkbox/pull/60) 的 `b50623b18bdb2407a4efd1b837df3683a8305255`；main 入场为 `bd62ade03c56908ce5942f7100d6b5cb2bc38934`。独立堆叠分支 `feature/wx-c-wanxiang-shengyuan`，目标 `feature/wanxiang-suming-v02-alpha`，保持 Draft，不合并 main。

交付提交以该分支最终 HEAD 为准。为避免文档自身改变提交哈希，准确40位验收 SHA、PR URL 和 Fast/Heavy run URL 记录在 PR 最终交付说明与本地 `reports/local/wanxiang-c/acceptance.json`；自然报告的 `sha`、浏览器报告的 `source.head`、效果报告的 `provenance.candidate.sha` 必须与该 SHA 相同，且工作区无源码修改。开发中的 `preliminary/` 数据不能代替最终提交证据。

## 实际行为

普通改命现在只编辑命格身份和基础禀赋；开脉、洗状态、血脉显隐和敕赐走显式天道敕改。可信草稿按字段在最新人物上提交，保留同期自然治疗、伤势、恩义、永久成长和道种消费。执行强制绑定真实世界与身体；无绑定、跨世界、死亡、换身体、旧阶段及旧命令重放被拒绝。144次操作后仍能合法提交。见 [权限说明](./WX_C_FATE_AUTHORITY.md)。

经历事实与奖励抽取分离。满冷却表不丢弃已提交事实，正式治疗进度不被经历冷却挡住；近期事实时间戳保留条件资格。关系使用32容量及对象/来源键，过期增益释放容量并留下有界历史；不同帮助者不覆盖。重复畏险恢复不会制造两个险中有定而破坏存档。

凡间每年低频检查真实修士、粮食村落与洞府存量，调用原 `spawnCave` 在合法地点生成有限机缘；补充供给每年最多一处，目标存量随修士变化，全局最多8、每锚点附近最多2。没有创建额外修士或直接发放胜利。原自然世界事件的洞府生成仍保留，故全年总生成可能超过一处。

新人物在 Alpha 初始化或正式出生时由独立可恢复随机流获得一种已有性格，不移动原生 Life 或出生 DNA 的签序。胆小、剑痴、畏险与历险改变真实赴事；恩义与情种改变既有付费照护评分。健康、距离、地图通达、资源、交通和生存规则继续优先。洞府、治疗、护关均复用原正式消费者。

命簿保持五页和既有美术，新增明确敕改表单、中文前后差异、自然/改命/敕改来源及重要命途时刻。原有25卦之外，34大壮、43夬进入真实肉身技能伤害，60节进入全部已装配技能的真实灵力支付；达到28/64有限接线。见 [机器覆盖附表](./WX_C_COVERAGE.md) 及保留设计意图的 [总矩阵](./WANXIANG_SUMING_V02_ALPHA_MATRIX.md)。

## 验证入口及证据

- `npm ci`，Node 24。
- `npm run test:wanxiang`、`npm run test:wanxiang:b`、`npm run test:wanxiang:c`。
- `npm run test:c1`、`npm run test:g8`、`npm run test:core`、`npm run build`、`npm run test:package`。
- 最终候选现有 Fast 与 Heavy 全部保留，Fast 增加 C 定向入口；未删除旧断言或缩减 Heavy。
- `npm run test:wanxiang:c:browser`：Canvas 1366×768、390×844、Three 1366×768，五页、普通改命、预览后受控正式事实、敕改、来源、关闭重开、真实保存加载及人物/地点回访。Browser plugin 不可用且 Tabbit launcher 缺失，按委托的 Edge/CDP 路径执行；软件 WebGL 仅作功能验证。开发轮三视口操作通过，但进程清理超时退出1，该轮不计完整成功；最终复测及清理退出状态在验收清单单列。
- 自然三种子0→100年（含30年截面）与真实100年存档续30年，见 [自然画像](./WX_C_NATURAL_PROFILE.md)。[性能简报](./WX_C_EFFECT_PERF.md) 区分受控效果画像和真实世界 CPU。

受控A/B/C继续由 B paths 覆盖：治疗贯通、失败再赴事和唯一传承、龙血定脉与出生显化。C authority 的D通过真实付费治疗、恩义及一次性道种消费验证并发，突破部分仅位于正式已提交事实边界。C opportunities 的E通过正式筛选、移动、学习、领取、治疗/护关及v11恢复验证性格选择。受控初始人物、地形、伤势和资格不计入自然统计。

## 文件与边界

代码集中于 `wanxiang/{changes,profile,experiences,runtime,saveState,effects,conditions,practice,skills,encounters,opportunities,manualIds,consumerManifest}.js`、既有 `sim/sites.js` / `daoActivities.js`、人物控制器与命簿视图。脚本、CI与显式打包清单同步更新。未新增世界时钟、完整 AI、事件总线或第二份人物事实。

36卦仍无完整消费者，六道种和高阶传奇设计继续保留限制。自然罕见血脉能力、完整三界生态、800年稳定性、全部组合及真实GPU性能未封板。自然关系回助频率仍低；受控流程通过不代表已在每个自然种子发生。机会漏斗的可达率和途中终止仍有明显瓶颈，不能把所有损失都归咎于性格。

## 保存与回退

继续使用v11可选万象块和Profile v1，旧B存档缺少新字段时合法恢复。新供给/性格流由G8运行时块保存。损坏的机会计数块拒载且不部分落地。`enableWanxiang(world,{wxCEnabled:false})` 或保存 `world.wanxiang.wxCEnabled=false` 关闭新供给、新性格赋予及C行为修正，恢复B候选评分，不删除事实/回执；正确性修复与现有自然机制继续保留。

旧B二进制不认识C的可选世界字段，不能把C存档直接降级给B读取；需要代码回退时保留原B存档备份。不要手工删掉资源或命令回执来“兼容”，那会失去防重复资格。WX-C关闭实验与整个代码降级是不同操作。
