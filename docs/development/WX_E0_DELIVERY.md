# WX-E0 · 雨具先行

## 交付与边界

候选分支 `perf/wx-e0-raincoat-first`，基于 WX-D #62 `c4b169d707704b614344345dfb1cac8fe96d50a9`，[Draft PR #65](https://github.com/sjh20016/inkbox/pull/65) base 为 `feature/wx-d-yinyuan-chengju`。与#63/#64平行，不合并main、不关闭或改基原有PR。开工核查的依赖与准确CI见 [M0](WX_E0_BASELINE.md)，后续安全合流与提交分组见 [集成计划](WX_E0_INTEGRATION_PLAN.md)。

| 工作 | 类别 | 实际变化 |
|---|---|---|
| 成本合同、固定inventory及Fast门禁 | 工程合同 | 10项完整成本卡；9个受审源文件哈希；c4的65路径固定清单。新增sim/wanxiang模块必须卡+hash，受控违规、清单污染会红，已登记有限事件会绿 |
| 原生阶段计量 | S | 复用workMetrics WeakMap，默认关；Life/实体/技能/选址/地点计数和固定dt桶；不存档、不产生World属性、不消耗随机数 |
| 技能容量去重 | S | 单次更新只求一次容量，保留旧默认技能、clamp/负值修复/恢复顺序、冷却及动作间隔 |
| 技能维护资格 | B1 | 仅level>0、已有combat或已有显式技能者进入资源维护；空白普通凡人不自动长出修士combat，旧状态保留，觉醒后按原规则建资源 |
| 有效机缘选择器并接入planNext | B2 | 跳过formation及正式内容为空的cave；保留原半径30/抽签门槛/稳定同距顺序，最近有效秘境/遗址可选，不排序候选 |

原来最近为空洞府时仍会 seek 空洞，最近为formation时阻止这次seek；新规则可能选择更远有效目标或回到原fallback，所以是新的世界线。没有修改抽签概率、奖励数值、到达动作、生命/地点自然寿命、全局 `World.sitesNear`、readEffects完整动态求值、个体凡人生活、Save版本或登记RNG协议。没有固定步长/Worker/新剧情循环/全人口索引/新故事持久状态。

B1保守保留旧档凡人的combat/装备维护，不删除历史状态；这限制了成熟世界的即时收益。初始无状态凡人跳过维护是明确规则变化，未来吞噬/资源关联的行为可改变，不能宣称旧档后续世界线逐位兼容。B2只承诺真实内容资格，不承诺路线必达、成功或独占资源仍未被其他人取得；实际到达继续重新验证正式资源。

## 证据结论

自然100/400年档均实际恢复，完成30日关闭诊断的ABBAABBA计时、每阶段90日OFF/ON完整世界/RNG重放以及存档后两次独立续跑。不注入自然事实；受控测试独立覆盖旧档、觉醒、跨界标签、受伤/夺舍、原物唯一、精确400年到期与抽签边界。细节、输入哈希、机器、参数及真实差异见 [重放与性能](WX_E0_REPLAY_AND_PERF.md)。

同一世界线的容量调用从30,324→15,160（100年）及81,723→40,858（400年）。B1额外跳过50/124次无资格维护。关闭诊断的最终候选wall中位数约+2.0%/+4.8%，没有稳定提速证据；本轮交付可核实的少做工作、资格修正和防退化合同，不宣传固定提速百分比。

本地 `npm ci`、core、G8、Alpha、WX-B/C/D、C1、G1、three-realms、save-equivalence、E0专项、build及test:package均已退出0；发布包644文件，报告/自然大档未混入。原有Fast/Heavy完整保留，E0进入Fast。准确交付HEAD的远程结论和job链接以 [PR #65 检查](https://github.com/sjh20016/inkbox/pull/65/checks)、PR说明及本地 `acceptance.json` 为准；不把历史提交成功当最终成功。完整手动Browser Smoke仅workflow_dispatch运行，普通push/PR不会执行它。

## 浏览器与最终状态

5秒Canvas新世界自检已通过实际推进、人物检视、暂停、压缩存读档与自有进程清理；只用于脚本调试。正式矩阵为Canvas/Three × 新世界/100年/400年 × 1×/默认2×/最高20×，每项60秒，固定1366×768；另做1440×900、1024×768、390×844三视口截图与人物/暂停检查。正式运行保留每项实际调用次数、推进时间、frame P50/P95/P99/长帧、update/advance/render/Life累计归因、压缩槽字符数、UI保存/载入耗时、headless/焦点/可见性以及GL自报设备。只有正式mode、真实推进及非空采样才计验收；不能把自检称为验收。

完整逐项观测、失败/阻塞、控制位面标记及自有浏览器/profile/服务器清理在 `browser/report.json` 和最终 `acceptance.json`，收束结论同步 [PR说明](https://github.com/sjh20016/inkbox/pull/65)。截图另由主代理实际查看，不用DOM成功冒充视觉通过。headless RAF并非物理显示器帧率；即使GL自报硬件，也不将此环境数据当作前台硬件GPU封板。原生阶段性能与浏览器采样不并跑。

最终交付HEAD/tree/清洁状态、PR URL、对应Fast/Heavy job链接、每项准确退出码与报告/源码/脚本SHA在本地 `reports/local/wx-e0/acceptance.json`；该目录忽略、不进入发布包，不能当作远程artifact。本文收束后只报告已观察结果，最终CI以PR对应准确SHA为准。

## 后续准入与回退

[成本合同](SIMULATION_COST_CONTRACT.md)要求战斗、幽冥、宗门、师承、故事、天道等每项新机制先写明事实消费者、资格对象、时间精度、最坏成本、查询方式、RNG、缓存失效、数据寿命、失败退出和证据。优先事件/到期结算、有界活跃集、ID局部查询；故事只读投影不得变为每人物每步全量storylet搜索。固定inventory是历史证据，不是65个模块全审计；旧未保护模块内部的新消费者仍需要人工审查。不得自动重写受审hash来掩盖新开销。

计量默认关闭，需要诊断时对世界调用 `enableWorkMetrics(world)`，关闭用 `enableWorkMetrics(world,false)`；effects沿用独立 `measureEffects` 开关。没有运行中玩家偏好、全局诊断状态或存档迁移。普通回退可按 [集成计划](WX_E0_INTEGRATION_PLAN.md) 先revert B2、再B1，保留成立的S/合同；registry需要随实际代码重新审查，不能旧hash覆盖新代码。保留原WX-D检查点，若要求精确继续旧世界线，必须使用原版本而不是声称B兼容。已有真实资源不被“性能清理”删除。

WX-E1优先以实际Life/stepEntity及readEffects动态热点、浏览器小数dt长帧为证据，继续局部减少闲置工作；本轮未做实体级完整effects缓存或常驻人口索引。WX-E2的时钟/渲染解耦需要独立世界线基线与实验入口。800年全局长期平衡、硬件GPU流畅性和万象栈实际合流不在本轮已证范围内。
