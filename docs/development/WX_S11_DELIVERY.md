# WX-S1.1 拾章校勘 · 交付

2026-11-07开工重新读取GitHub：父PR [#63](https://github.com/sjh20016/inkbox/pull/63)仍为未合并Draft，HEAD精确为 `f88fb2acf53062252c36772cbe0c0a9aae41c372`，base仍为 `feature/wx-d-yinyuan-chengju`；main为 `bd62ade03c56908ce5942f7100d6b5cb2bc38934`。没有用委托书旧快照代替远端核验。

隔离clone工作分支 `feature/wx-s11-story-proofreading`，PR必须指向 `feature/wx-s1-mingtu-shizhang`，保持Draft，不合并main、不改其他候选。最终HEAD及Fast/Heavy的准确run URL与结论记录在PR和本地 `reports/local/wx-s11/acceptance.json`，避免文档自引用SHA或把父PR成功冒充本轮成功。

## 四项修复

| 故障复现 | 实现与修复后行为 | 反例 |
|---|---|---|
| 受控16节点中第16条正式恢复存在，UI只显示到第12条 | 纯节点选择保留首因、最初有证危机、最新关键A/B及末证，余位取最近节点，仍最多12条；24来源建卡上界同样保留首尾。折叠数可核对 | 第15条恢复、第16条再灾仍待证；无evidenceKey或日期不符不构造占位结局 |
| 7次付费回助只读到最早4次 | 正式日期／稳定来源键排序去重，保留首次及最新三次，lastEvidenceDay随最新真实付款更新 | 零支付、空结果、换主后帮助不冒充报答；护关不写成突破成功 |
| 铸成与器灵、当前持有被通用“已有回响”混淆为寻回 | 原物专用outcome与标签区分来历、辗转、失落后取得、当前现址与归属失考 | 当前地面位置不倒填旧遗落；只有found无lost不写失而复得，不猜原主寻找 |
| 历史施助者在正文显示mortal:201等技术键 | 主文案用旧日施助者及身份留白，完整键移至来源详情；缺本世证明继续禁跳 | 不借同名、同ID或当前身体姓名认旧人；死亡／飞升／夺舍不撤销此前已证付款 |

同日正式有序历史的sourceOrder只在读侧使用；跨来源或无正式顺序则说明先后未可考。详情由16条扩至既有24上界，能够核对展示末证。文本使用textContent。禁用按钮理由与长键可换行；来源summary进入抽屉焦点顺序，Space不泄漏给全局暂停快捷键。没有新全屏系统、动画、模型、Three Pass或剧情行动。

## 文件范围

- `src/inkbox/wanxiang/storyFacts.js`：有界证据及纯节点选择；`storyPeople.js`：最新付费回助与称谓；`storyWorld.js`：原物语义、地方史正式顺序。
- `src/inkbox/ui/storyCardsView.js`、`ui/g1/presentation/characterCard.css`：末证／折叠／24条来源、原物标签及阅读键盘行为。
- `scripts/inkbox-wx-s11-proofreading.mjs`：新增受控反例；原people专项只更新预期称谓，未删除身份断言。原browser/perf脚本分别增加S1.1入口与可复用同机基线对照。
- `package.json`、`.github/workflows/ci.yml`、`tests/README.md`、打包显式清单：加入S1.1确定性门禁及文档，保留全部原Fast/Heavy。
- [证据与阅读准入](./WX_S11_EVIDENCE_AND_WORDING.md)、[自然事实](./WX_S11_NATURAL_QA.md)、[性能与保存](./WX_S11_PERF_AND_SAVE.md)，并回链原S1事实合同。

`storyReading`、身份／导航路由及模拟消费者不改；Life、advance、effects、save、daoActivities、sites、artifacts等正式消费者和G8协议均与基线相同。没有新故事保存块、RNG或模拟事件钩子。

## 验收与复现

M0精确基线由git archive独立导出，原people/world/integration/ui四专项通过，故障复现JSON单列为受控数据。自然验证复用WX-D四份既有检查点；未为本包重做百年模拟。三种子百年A/B来源233/162/220，四百年1498；入选82/42/65/120。四百年缺失败起因不补造败后故事。具体日期、稳定键、折叠数和来源哈希见自然文档及本地profile。

```sh
npm ci
npm run test:wanxiang:s1
npm run test:wanxiang:s11
node scripts/inkbox-wx-s1-profile.mjs --out=reports/local/wx-s11/profile --write-doc=0
node --expose-gc scripts/inkbox-wx-s1-perf.mjs --out=reports/local/wx-s11/perf --baseline=reports/local/wx-s11/baseline-source
npm run test:wanxiang:s11:browser
npm run build
npm run test:package
```

本地还执行core、Wanxiang Alpha/B/C/D、G1及相关Heavy（regression、three-realms、save-equivalence、g1:longrun），准确命令退出码在 `local-checks.json`。CI独立记录Fast/Heavy；手动Browser Smoke与专项本地浏览器是不同门禁，未运行的手动Smoke不得标通过。

浏览器复用仓库自有Edge/CDP与IPC服务器：Canvas 1366×768、Canvas 390×844、实际Three 1366×768；自然百年导入、人物主动读取、原物／地点旧闻、正式存读档、来源核对、受控16节点尾声、身份切换与世界替换拒跳、键盘、HUD快照和进程清理均有断言。报告包含实际HEAD、源码／脚本／检查点哈希、Edg/156.0.4314.58、截图和清理证据。Browser插件不可用且Tabbit启动器缺失，按用户指定的仓库脚本验收；Windows进程核验需沙箱外运行。软件WebGL仅证明功能。早期驱动定位／按键与面板清理失败不作为通过，最终结果以acceptance为准。

所有巨大检查点、截图、JSON和运行日志位于被忽略的 `reports/local/wx-s11/`，不混入正式游戏包或PR。没有把本地路径冒充远端下载URL；本轮不上传证据压缩包。

## 限制与回滚

有界历史仍会淘汰事实；死亡快照无Profile时不能重建完整传记，未知旧施助者不能定位。当前正式原物接口未保存可靠lost回执，未来若要可靠遗失／归还事实，须在正式提交点另立工单并独立做存档验收。本包不接人物旧约、WX-S2正式剧情行动、800年或成熟硬件GPU验收，不代替WX-E性能治理。

停止使用本候选或从父分支检出即可回退；已提交版本可普通revert本包提交，无需保存迁移。旧档与正式世界事实没有本包新增状态。对WX-E没有新的模拟入口、保存协议或消费者耦合，阅读成本仍只发生在玩家主动查询。
