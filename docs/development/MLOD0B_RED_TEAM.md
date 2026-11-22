# MLOD-0B 红队反例清单

快速运行入口为 `npm run test:mlod0b`，并已接入 GitHub Actions Fast Gate。当前入口依次执行红队语义夹具、100/400 年只读面板读者对照和 census 专项边界用例。任一断言失败都会返回非零退出码。代码不改人口、出生/觉醒、宗门供养、RNG 或 v11 存档规则。

## 三十项反例状态

“实测”代表运行了源代码/模拟 API 的断言，不代表每项都触发了自然事件。自然世界运行时由固定 SHA 档案复现；语义夹具只验证给定关系的统计结果。

| # | 反例 | 当前覆盖 |
|---:|---|---|
| 1 | `species=cultivator, level=0` | 实测。计作凡人 |
| 2 | `species=human, level>0` | 实测。计作实际修士 |
| 3 | 归村异兽 | 实测。增加 legacy village.pop，不增加人类社会数 |
| 4 | 无村归属 | 实测。不进入任一村 |
| 5 | 只有村/只有宗的独立归属 | 实测。两个维度独立统计 |
| 6 | 清理前已死亡仍留在数组 | 实测。按旧口径仍是 sect follower，非 pop |
| 7 | `hp>0` 但到寿元 | 实测。排除在活人社会外 |
| 8 | 飞升者在凡间/上界的界面切换 | 上界所属实体只计上界 plane；不存在跨数组副本时分别按 plane 统计。自然双端过渡完整事件没有在此快测中触发，见下方未覆盖 |
| 9 | village.pop 与 society.humans | 实测。归村异兽造成合理差额 |
| 10 | fertile humans 与 fertileMortals | 实测。有修为适育人计入前者，不计入后者 |
| 11 | 仅一位可育者 | 实测。真实 `Life.spawn` 因双亲须不同而拒绝重复同一父母 |
| 12 | 双修士但当地没有活凡人 | 实测。`hasMortalResidents` 为 false |
| 13 | 父母分属不同村 | 实测。真实 `Life.spawn` 拒绝 |
| 14 | 注释声称缺双亲仍生 | 实测。带 `allowSouls` 的真实 spawn 入口拒绝无亲出生 |
| 15 | 出生前后同日读数 | 实测。修改实体集合后快照重新读取反映新增对象 |
| 16 | 同日先死后生且总数相同 | 实测。living 不变、total 与 dead 分别正确 |
| 17 | 人数不变只迁村 | 实测。旧快照不变，新扫描反映新村归属 |
| 18 | 人数不变只改宗 | 实测。新扫描按 faction 重分组 |
| 19 | 144000 日两宗 25/3 分流 | 实测真实 400 年自然档；按实体归属与保存缓存分宗核对，阶段时序见阶段报告 |
| 20 | 清除宗门归属 | 实测。清除 faction 后不再算 follower |
| 21 | 同日缓存对不上新归属 | 实测。保留 stored cache 与 current entity facts 分离 |
| 22 | 同日反复读取/暂停旧事实 | 实测三次普查和 audit port 读前后完整捕获相等；UI 半步使用上个完整发布卡片见 port 测试 |
| 23 | v11 恢复只读不抽随机数 | 实测。完整 world/runtime 捕获前后相等 |
| 24 | 新旧快照代际隔离 | 实测。旧快照保持创建时的值，随后读取为新状态 |
| 25 | E1C audited 方法身份 | 实测。读取不替换实例原型或实例方法 |
| 26 | 两宗总数不变但成员互换 | 实测。按宗边际分别比较，可发现仅检查总计漏掉的改变 |
| 27 | 不存在的村/宗 ID | 实测。分别归入 invalidVillage/invalidSect |
| 28 | 跨界时不能在两个快照重复归属 | 夹具实测。将同一对象从凡界数组移动至上界数组，两次读取各自只计一次；自然飞升交易过程未在 30 项 quick fixture 触发 |
| 29 | Canvas/Three 切换/重复读取不写 World | 重复查询与 generation 不变有实测。浏览器 Canvas/Three 交互冒烟另由 port 浏览器报告负责，不能由这个 Node 夹具代替 |
| 30 | 月界、完整分宗 L0 | 月界 advance 加入只读观察前后完整状态相等有实测。真实 144000 日档已处于分宗后，不能重演保存之前那次历史改宗；另以真实 400 年实体、受控条件、确定性 RNG 经公开 `stepSects` 触发 `maybeShed`，观察到 23 个既有门人 ID 改宗，首领由 `foundSect` 单独成为新宗 founder/leader（共 24 名成员），并由下一步宗门 census 对账。受控路径不代表自然重放。 |

## 验证证据

运行 `npm run test:mlod0b` 的退出码为 0。固定 #74 100/400 年 census 测试的 29 个 predicate edge 通过；人口面板 port 对两个档均通过；30 项红队用例通过。结果 JSON 位于忽略目录 `reports/mlod0b/red-team.json`，按本地测试报告路径归档。输入 fixture 的解压 SHA 固定在 [人口审计矩阵](MLOD0B_CONSUMER_MATRIX.md)。

这组快测不等于自然出生、自然分村、飞升交易或分宗事件全部在运行中发生。真实 100 年档 360 日事件探针有 23 次出生、13 次死亡清理及一次宗门归属变化；未触发分村、跨界或再分宗。真实 400 年档第 144000 日的存档已保存分宗结果，所以只能验证归属/缓存分歧和下一步重算，无法声称从未分宗时状态回放见证首次写入。细节见[阶段审计](MLOD0B_PHASE_AUDIT.md)。

长期确定性和浏览器双 renderer 路径另有专门门禁。三个种子 200 年 L0 长跑结果必须来自已冻结产品源指纹；短期夹具不能将其标为通过。

## 生命周期写入者定向夹具

`node tests/mlod0b/lifecycle-writers.mjs` 在真实 100 年档上调用 `Life.maybeSplitVillage`。只控制触发分支的随机值和选定建村位置，居民筛选、`foundVillage`、成员迁户、归属写入及 `syncVillagePops` 都走 #74 原函数。实际迁移的身份 ID、前后 village、父村/子村缓存和观察报告见 `reports/mlod0b/lifecycle-writers.json`。

同一脚本调用 `world/planes.arriveUpper`，验证上界新 ID 段、归属清空、thunder 通道计数和副本没有复用凡间对象。此函数只负责创建上界副本，来源实体的清理由调用者后续完成，因此探针明确记录了调用者清理前的双集合状态。固定档没有 attached upper plane，测试只在档案派生的新上界对象上复现落地函数。测试未调用完整 `cultivation.ascend` 写入链。

`reports/mlod0b/schism.json` 现已补上受控的公开结算路径证据。它对 400 年档已有实体设置可触发的宗门条件，以确定性 RNG 经正式 `stepSects` 调用，在 `before-schism` / `after-schism-membership` 阶段记录 writer 与成员 ID。`maybeShed` 将 23 名 follower 改宗；首领由 `foundSect` 作为新宗 founder/leader 单独归属，不能把成员数误写成“24 名被移动门人”。首次统计后发生改宗，所以同一步 stored sector totals 保留 pre-schism 值；下一次宗门 census 收敛。该夹具不是第 144000 日的自然历史回放，也没有触发原始 120 步内的自然分宗。它保留输入村庄的既有缓存差额，回归断言只针对宗门 census。

浏览器 `[报告](../../reports/mlod0b/browser-realms/report.json)` 在 Canvas 和 Three 真实产品页面检验了 `viewUpper` / `viewNether` / `inspect` 视图切换：凡界聚落卡片可重复读取，world 与 runtime 序列化哈希保持不变，短暂运行后模拟日期前进、暂停后卡片仍可重复读取。此结论针对视图切换和读查询；它不覆盖飞升或裂隙跨界的因果交易。独立复测的输入目录可由 `--checkpoint-root` 显式指定，分宗脚本亦支持 `--input-400` 文件覆盖，并会验证固定 SHA。两项复测命令与环境条件见[阶段审计](MLOD0B_PHASE_AUDIT.md)。
