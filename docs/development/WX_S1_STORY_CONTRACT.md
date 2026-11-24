# WX-S1 命途拾章 · 事实合同

WX-S1.1 阅读准入补充：[证据、称谓与成本规范](./WX_S11_EVIDENCE_AND_WORDING.md)。后续模板须保留可见首因和最新有证结果、区分当前状态与历史行动、继续核对来源键及本世／跨界身份；单卡24来源、12展示节点，每人物每模拟步新增叙事查询成本0。本包不增加RNG、持久故事状态或正式行动消费者。

施工基线：2026-11-07 重新核实 main `bd62ade`，#60/#61/#62 均为未合并 Draft；WX-D HEAD `c4b169d707704b614344345dfb1cac8fe96d50a9`，其 Fast/Heavy run `42245388790` 成功。本包独立堆叠于 WX-D，不合并主干。

## M0：现有事实与接入对照

| 家族 | 事实源 → 唯一身份 → 提交点 | 候选 → 正式后续消费者 → 展示 | 存档来源 → 清理 |
|---|---|---|---|
| 败后问途 | `experienceLedger.records` 的 `site-failure/success`、`wanxiang.history` 的 `risk-resolved` → 位面、人物 ID、本世及 site ID → `sites.resolveCave` / `experiences.emitCommittedFact` | 失败摘录及未竟观察 → 原有 encounters 的实际行旅、sites 正式结算 → 命簿经历页主动读取 | 既有万象 v11 可选块；records 24 / history 128；旧来源淘汰后明确记录不足 |
| 恩义有回 | `aid-bond`、`healed/gate-aid` 及完成后 `natural-choice` 回执 → actorKey/targetKey/helperKey 与本世 → `daoActivities.act` 实际支付、安装助益后记录 | 有恩待报；有费用的反向正式完成回执才能写回助 → 既有 social/alchemy 任务 → 命簿及对象跳转 | 同上；活关系只能作 C 级状态，不能冒充行动；旧史 `pastLife` 不归入新身体 |
| 旧物寻踪 | `artifact.history[day,kind,who]` → 三界唯一原物 ID → forge/claim/drop/give 正式接口 | 有来源的原物摘录 → 原有 artifacts 所有权/朽坏机制 → 原物旧闻及当前持有人 | 既有 artifacts；history 10；姓名仅作 B 级原文背景，消失无回执时不能断言朽坏 |
| 故城余音 | `village.history` / `settlementRuins.history`，含 settlementId/factionId → 原聚落 ID → damage/aid/archive/recovery | 灾害、援助、荒废及明确恢复条目 → 原有地方韧性 → 地点卡旧闻 | 既有聚落/遗址字段；history 16 / ruins 80；附近同名新村不认作重建继承 |

`entity.log`（32）和编年字符串只作原文背景；不解析姓名并连接全人口。当前状态是 C 级，未发生机会是 D 级。故事必须至少引用一个 A/B 来源。凡费用或具体行动信息已被上游删减，只保留可证的摘要。人物引用还带本世 `incarnation` 与夺舍切点 `identitySince`；到达日无位面标记的账目保守留白。正式逝者快照不保存 Profile；死亡后若来源已失，不声称仍能重建原卡。

## 旧研究复用裁决

已读取 `origin/feat/wanxiang-v01-glm:src/inkbox/sim/relicRumors.js` 与 `oldPacts.js`。复用遗物传闻的零随机、零持久状态、履历时间戳和姓名不连接身份的设计；当前 artifacts 已持有正式履历和地面状态，原创投影，不复制旧消费者或旧分支。当前 `toGround` 只保留现时 `lostDay`，拾取后清除，未保存的过去遗落日不回填；原物消失也没有逐件朽坏回执，显示消散或记录不足。旧约仅凭关系持续判断的 `kept` 不证明履约；S1-E 本轮延后，不接旧存档或关系调度。当前 settlementInspector 的距离小于 2 前身列表只是附近旧址，不升级成重建因果。

## 只读与容量

故事本体不保存；按玩家主动读取时从既有有界历史重建。无模拟钩子、无新增 RNG、无到期队列、无已读表、无自动全局提醒；现有记挂负责重大消息。每个故事来源键稳定；顺序为重要性、相关性降序，再按起日、模板、稳定键升序。人物重要性：已证正式后续 4、终止 2、未证钩子 1；相关性为 A 级回执数加节点数/100，仅选择读物，不影响行动权重。人物最多一条主要观察钩子；全世界投影最多 24 开放、96 已结。同对象同模板 360 日内的来源汇总；主动查看保留来源节点。单卡最多 24 来源/节点、8 关联引用。不存在的来源不会恢复为事实。

UI 显示取证日，主动刷新才重新提取；`paint/render/updateHud/readEffects/Life.step` 不编译故事。Canvas/Three 使用相同投影和身份路由。阅读、刷新与跳转不改变人物、资源、Profile 或任何模拟随机流。

## 新叙事消费的准入表

任何新模板在接线前，必须以普通数据表/文档及测试声明以下内容，缺项不得接入正式模拟：

1. A/B 来源路径与正式完成条件；C/D 信息只能如何措辞。
2. 参与者资格、位面/ID/本世身份与跨界失效条件。
3. 触发仅限正式事件后、有限到期结算或玩家主动查询；禁止每人每帧扫描。
4. 每次候选上界、全局开放上界、冷却与稳定去重键。
5. 是否抽签；若有必须独立流、明确恢复协议，禁止偷抽 Life。
6. 持久状态必要性、保存上界、到期及淘汰策略。
7. 失败、死亡、飞升、消亡、失考出口，不能预设成功。
8. UI 与关注不改变事实或行为资格；正式行动只能走既有消费者。
9. 定向正反例、旧档/身份/幂等/纯度测试、自然样本及查询成本统计。

参考只作机制启发，不复制外部源码或美术：[Wildermyth Event](https://wildermyth.com/wiki/Event)、[Hook](https://wildermyth.com/wiki/Hook)、[LegendsBrowser2](https://github.com/robertjanetzko/LegendsBrowser2)、[ink WritingWithInk](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md)、[Endless Sky missions](https://github.com/endless-sky/endless-sky/wiki/CreatingMissions)、[Wesnoth EventWML](https://wiki.wesnoth.org/EventWML)。
