# WX-E0 原生重放与性能证据

## 输入、源码与方法

本轮复用 WX-D 正式自然推进产生的 seed `20260914` 小景存档，原始字节与复制清单见 [M0](WX_E0_BASELINE.md)。100 年为 day36000 / 2,826,671 B / SHA256 `08404e6fa62c4cba154bfe03b0b116cd9eb7e835bd2cd1e69b800fc87b92ad18`；400 年为 day144000 / 10,073,655 B / SHA256 `d204519759a222d3fac8d5847d9f025329c9a1fa83a20e3835dfbd7ef59666bd`。没有将受控人物、站点或奖励写入自然输入。

机器：Windows 10.0.26200 x64，Node v24.11.1，AMD Ryzen 9 8940HX，32 logical CPUs。原生计时与浏览器测试顺序执行。每次独立深克隆检查点，经正式 `deserializeWorld`、`restoreRuntimeState` 恢复；使用原 `advanceWorld`，无替代模拟时钟。原始输入只读，末尾校验未污染。

固定源码阶段：

| 名称 | Git commit | 类别 |
|---|---|---|
| original | `c4b169d707704b614344345dfb1cac8fe96d50a9` | WX-D 原版 |
| metrics | `1cc3c31d0755760b14fdb7b9dd2d11a537fd57bd` | S，只读计量 |
| capacity | `d1ee1ef37f3bd4ac8477d632287d2df0f32af0f3` | S，单次容量求值 |
| eligibility | `397a574d755e010da9ffe24c0a7803dbf7445aac` | B，技能维护资格 |
| candidate | 测量时 HEAD `99edcf667da04f00af550c538a54cf795476e529`；正式消费者为 `e8874e6` 的树 | B，真实机缘候选 |

原生性能 JSON 记录 `dirty:true`：当时有打包清单/工程文档待提交；没有将它标为 clean。JSON 内保存八个相关运行源文件和两份取证脚本的实际 SHA256；最终 `acceptance.json` 将它们与最终交付树逐项核对。固定历史源码由 Git archive 导出，并以 `WX_E0_SOURCE.json` 记录准确 commit/tree、实际文件哈希；加载时拒绝哈希改变的快照。

每个源码预热 30 日一次。关闭 workMetrics 和 effects 计量，按 original/candidate/candidate/original 重复两轮，分别得到四次30日样本；每次10步、dt=3日，共每版本40个步样本。恢复、摘要与序列化在模拟计时之外；CPU 为 `process.cpuUsage`，阶段 wall 计时是包含关系，不能相加当作 CPU。另独立运行各阶段90日、计量 OFF/ON 对照，不用诊断耗时宣传提速。

## 确定性与行为差异

两份自然检查点均通过：

- 每版本计量 OFF/ON 的完整 `serializeWorld + captureRuntimeState` 哈希一致，包括输入实际登记的 RNG、时钟及运行缓存。
- original→metrics→capacity 的完整世界与全部运行态严格一致（90日）；S 类没有采用放宽断言。
- B1 在本次90日窗口的 RNG 与 capacity 相同，但完整世界不同（新生凡人不再自动产生 combat）；这不是旧世界线完全等价承诺。
- B2 与 B1 的完整世界及 RNG 均不同。100年档改变 Life、mercy、wanxiang-experiences、wanxiangBirth、wanxiang-personality 流及部分 territory 运行缓存；400年档改变 Life、经历、出生、mercy 流及部分 territory 缓存。具体前后数值在 JSON 的 `comparisons.runtimeDifferences`。
- original 与最终候选各四次独立30日恢复结果一致；每阶段 OFF/ON 两次90日重放一致。最终候选的90日正式快照再经 JSON 存档，独立恢复两次各续30日，完整世界/RNG一致。这项是保存后同版本确定性，不宣称有损地形序列化与不中断内存世界逐位相同；原有 G8/保存等价断言保留并通过。

输入自然档只含凡间原生运行态，Node 验证不凭空生成上界/幽冥。三界守恒、身份及全部登记流由现有 `test:three-realms`、`test:g8`、Fast/Heavy 另行覆盖。浏览器为了符合正式三界载入合同，给这两份自然凡间档补正式生成的控制上界/幽冥；该部分明确不是自然三界400年样本。

## 节省的实际工作

下表均为90日诊断，C1 两列是同一世界线：

| 世界 | 原技能维护次数 | 旧容量调用 | C1容量调用 | B1跳过无资格维护 | 最终候选维护/容量 | 最终跳过 |
|---|---:|---:|---:|---:|---:|---:|
| 100年 | 15,160 | 30,324 | 15,160 | 50 | 15,100 / 15,100 | 99 |
| 400年 | 40,858 | 81,723 | 40,858 | 124 | 40,740 / 40,740 | 125 |

C1 实际少求值15,164 / 40,865次。旧 combat 初次分配为3次容量求值，已有状态为2次；现在每次维护1次。资格策略保留全部已有 combat/显式技能，所以成熟旧档的大多数凡人仍维护资源；不能将新世界全未分配样本的节省比例外推到成熟档。最终列还包含B2新世界线，不能直接用其差值声称B1独立收益。

最终候选90日诊断的阶段调用次数 / 累计wall ms如下。均为开启诊断的归因，包含计量开销：

| 阶段 | 100年 | 400年 |
|---|---|---|
| Life整体 | 30 / 732.3 | 30 / 4311.9 |
| prepare / entity-loop / post-entity | 各30 / 1.3、670.5、60.3 | 各30 / 3.1、4145.3、163.4 |
| stepEntity | 16,233 / 668.8 | 41,986 / 4139.8 |
| 技能资源 | 15,100 / 10.9 | 40,740 / 33.0 |
| 机缘查询 | 35 / 0.4 | 131 / 2.3 |
| 地点结算 | 30 / 8.5 | 30 / 24.7 |
| readEffects | 67,200；静态57.7 / 动态387.7 | 179,026；静态154.4 / 动态1735.8 |

Life包含entity-loop/post-entity，stepEntity包含技能及选址，post-entity包含地点结算，不能重复加总。effects静态目录编译缓存已预热，命中144,248 / 379,226，未改动态实体效果求值。dt固定桶均为30次×3日（min=max=3）；浏览器小数步长另测。主要剩余成本仍在人物与动态效果路径，寻访去排序不是全局加速结论。

| 世界 | 旧候选查询/半径内排序行 | 最终查询/半径内行/排序行 | 原始最近为沉寂洞府 | 正式地点尝试/成功/失败 |
|---|---|---|---|---|
| 100年 | 32 / 648 | 35 / 805 / **0** | 27 / 35 | 2 / 1 / 1 |
| 400年 | 111 / 4,426 | 131 / 5,318 / **0** | 85 / 131 | 3 / 3 / 0 |

新选择器仍在原有机缘抽签通过后单次扫描 sites，半径30，保留稳定同距顺序，不分配候选数组/排序。复用 `siteHasContent`；阵法不作为此类 seek 目标，秘境/遗址普通奖励仍合法。诊断的“原始最近沉寂”不是最终选择、正式到达或寻宝成功。到达尝试可重复，同一人多次研究不当作独立到达数。100年档实际继承1次；自然窗口没有独占法宝取走或洞府自然到期事件，不编造命中。原物取得和400年精确到期边界由受控测试覆盖。

## 关闭诊断的性能对照

单位 ms；每版本4次30日样本，median采用脚本的 nearest-rank 定义，4样本的P95实际为最大值。

| 世界/版本 | 30日wall median/P95 | CPU median/P95 | 每步wall median/P95 | 序列化 median/P95 |
|---|---|---|---|---|
| 100年 WX-D | 205.2 / 312.4 | 250 / 500 | 19.1 / 40.6 | 43.2 / 50.2 |
| 100年 E0 | 209.5 / 282.3 | 250 / 531 | 21.6 / 34.5 | 50.0 / 63.2 |
| 400年 WX-D | 1384.3 / 1500.9 | 1515 / 1625 | 141.4 / 158.3 | 126.0 / 167.6 |
| 400年 E0 | 1450.2 / 1518.9 | 1577 / 1703 | 142.3 / 171.3 | 121.8 / 143.8 |

最终候选30日wall中位数分别约+2.0%/+4.8%；P95约-9.6%/+1.2%，每步P95约-15.1%/+8.3%。没有观察到本样本持续超过25%的尾部回退，也**没有稳定提速证据**。样本小、包含JIT/GC/系统噪声，且B2会改变实际后续工作；不能把计数减少包装为固定毫秒收益。原生3日/步也不能代表浏览器小数日/帧或硬件GPU性能。

## 人口、生息、资源与生命周期

| 自然90日窗口 | 活实体 | 普通凡人 | 人族修士 | 村庄/宗门 | 死亡名录累计 total | 窗口内出生且末尾仍活的村民 |
|---|---|---|---|---|---|---|
| 100年 WX-D/C1 | 540→540 | 467→468 | 38→38 | 21 / 3 | 504→508 | 4 |
| 100年 E0 | 540→544 | 467→472 | 38→38 | 21 / 3 | 504→508 | 8 |
| 400年 WX-D/C1 | 1399→1400 | 1223→1225 | 138→139 | 44 / 8 | 6770→6776 | 7 |
| 400年 E0 | 1399→1400 | 1223→1225 | 138→139 | 44 / 8 | 6770→6776 | 7 |

活实体含非人；凡人与修士按正式 demographics 和 level区分。`deadLog.total`是正式离世名录累计，`ascended`另记，本窗口分别0/16未变，不能把裁剪到800人的 dead 数组当累计死亡。出生列只计仍存活、`birthOrigin.kind=village` 且出生日晚于起点的个体，不能称作累计出生数。400年档现有自然村生人物和修士仍存在，修士数增加1；本窗口不据此猜测每个晋升者来源，成年/觉醒/晋升因果由既有C1和受控E0夹具另证。

100年候选3宗门累计供给增量33.0833、消耗6.7500、unmet增量0，末尾最小存粮1055.3274；400年8宗门末尾最小存粮415.9275，宗门2招募计数增加1。所有正式资源保持有限非负，未改宗门供养消费者。JSON保留每宗门原始economy初末值（部分初始字段缺失，不据此捏造累计总量）。100年原物总数12，400年113，逐原物ID/归属唯一检查通过。

最终站点分别70（活洞10/沉寂57）和260（活洞33/沉寂204）；沉寂不代表立刻删除，仍按正式自然到期规则。受控夹具在400年界点保留、超过界点清除，所有全局 sitesNear、实际奖励/失败/原物搬运路径沿原消费者。

## 复现与证据位置

本地忽略目录 `reports/local/wx-e0/` 是本机证据，不是 GitHub 下载链接。主报告为 `perf/native-100y.json`、`perf/native-400y.json`；早期3日 `preflight-100y.json` 和5秒浏览器自检不能替代正式验收。

浏览器实际18项各60秒采样（毫秒；各列依次为1×/默认2×/最高20×的frame P95）：

| 世界 | Canvas | Three |
|---|---|---|
| 新世界 | 5.7 / 5.7 / 5.7 | 11.2 / 11.2 / 11.2 |
| 100年 | 33.4 / 33.4 / 38.9 | 27.8 / 22.8 / 38.9 |
| 400年 | 139.2 / 144.8 / 189.3 | 144.7 / 155.8 / 150.3 |

Edge156、1366×768、headless，页面报告visible/focused、未暂停。GL自报AMD Radeon610M，原文在报告。每项都保存update/advanceDays/render/Life的P50/P95/P99、次数和累计wall，RAF另列；render调用墙钟不等于GPU完成耗时。400年Life P95约119.6–163.8ms（Canvas）/134.1–142.9ms（Three），持续长帧，不能宣称实时性能封板，也没有浏览器改前后配对提速结论。

实际压缩槽字符数：新世界518,779–518,787；100年879,259–879,695；400年2,097,003–2,097,115，全部`INKGZ1:`，不能把原始10MB JSON称为localStorage消耗。点击到观测完成的保存约280–502ms，载入约390–545ms；自然100/400年档导入首次可交互约403–547ms，均包含CDP点击/轮询开销。每个速度从同一槽快照重载，slotHash/startDay在报告；UI暂停交互会在采样前产生少量正式时间推进，不将其伪称原始档日的静止画面。

首次完整命令exit1源于Canvas窄屏resize后点击命中变化；18性能项及6存读档项均有观测，视口为5/6。验收工具仅增加可点击性等待，另以viewport-only复测6/6；原失败保留，详见交付记录。后续只改了视口可点击性等待/断言及报告模式，采样段未变，不把复测当作第二套60秒性能数据。

```powershell
npm run profile:wx-e0 -- --save=reports/local/wx-e0/checkpoints/20260914-100y-save.json --out=reports/local/wx-e0/perf/native-100y.json
npm run profile:wx-e0 -- --save=reports/local/wx-e0/checkpoints/20260914-400y-save.json --out=reports/local/wx-e0/perf/native-400y.json
node scripts/inkbox-wx-e0-replay.mjs --source=reports/local/wx-e0/s-capacity-source --compare-source=reports/local/wx-e0/baseline-source --days=90
npm run test:wx-e0:browser
node --input-type=module -e 'process.env.INKBOX_WX_E0_VIEWPORT_ONLY="1"; process.env.INKBOX_WX_E0_REPORT_DIR="reports/local/wx-e0/browser/viewport-repeat"; await import("./scripts/inkbox-wx-e0-browser.mjs");'
```

性能脚本默认需要上述四个固定源码目录。可从对应commit执行 `git archive --format=zip <commit> src scripts vendor tests package.json package-lock.json --output=<snapshot>.zip`，用 `Expand-Archive` 解到指定目录。每目录的 `WX_E0_SOURCE.json` 必须含 `{head,tree,hashes}`，`hashes` 为 `inkbox-wx-e0-replay.mjs` 导出的 `SOURCE_FILES` 中存在文件的**实际字节**SHA256；先用 `git show <head>:src/inkbox/<file>` 按LF规范化逐项核对导出内容，再写manifest，不可将当前树冒充历史SHA。可用 `--original/--metrics/--capacity/--eligibility/--candidate` 显式指定目录；缺少或修改快照会失败。

浏览器正式结果、最终PR/CI及未执行项见 [交付记录](WX_E0_DELIVERY.md) 和本地 `acceptance.json`。本轮不重跑800年全局生态研究，不以90日窗口证明长期平衡。
