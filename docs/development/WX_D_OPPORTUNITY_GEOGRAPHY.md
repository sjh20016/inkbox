# WX-D 机缘地理与地点库存

## 执行规则

每 360 游戏日最多补给一处洞府，人口决定同时存在的未领传承上限。候选仍从有食物的真实聚落附近抽取，但落点必须在地图访问范围内，且至少一名附近存活且达到境界要求的修士从当前位置有正式陆路。供给不创造修士、不授予奖励。四个地图象限按年份轮换起始搜索位置，每象限最多检查四个聚落，每聚落最多 80 个落点，全年最多验证 32 个候选的正式陆路。没有合格落点就不补给，自然隔绝保留。

赴事筛选复用 `planTransitRoute(..., {mode:'land'})` 的可达结果。赴事移动仍由 Life 的陆路移动消费者执行，参与者保存有限转向点；路线超过 96 格或 128 个转向点时不发起任务。水路和御空没有对应的赴事任务消费者，本轮不把它们算作可赴洞府的通道。旧存档中缺少转向点的行程在移动时重新规划。地形编辑后，正式 transit 缓存由原有失效机制处理。

`siteContentState(site)` 返回 `inheritance`、`dragonBone`、`phoenixFeather`、`godFragment`、`artifact` 五项布尔值。`siteHasContent(site)` 为它们的析取。传承耗尽后其他库存仍可开启遭遇和领取；所有库存耗尽的洞府仍保留历史地点，但不再抽取普通访客；`lastLifecycleDay` 使其只在每年结算年龄及自然消亡。原物仍走正式所有权领取，血脉资源仅在正式资格和实际授予成功时扣减库存。

## 统计和成本

`opportunities.counters` 新增 `candidate`、`invalidGeography`、`noRoute`、`budgetBlocked`、`qualified`、`region0` 至 `region3`。`candidate` 是抽取的落点候选，包含随后被水、山、访问范围拒绝者；`invalidGeography` 记录这类拒绝，`noRoute` 记录有效地形上找不到真实修士陆路者；`qualified` 是完成真实修士可达验证并生成洞府的次数。区域计数按落点所选聚落所在象限记录。其他已有 `generated`、`eligible`、`reachable`、`started`、`arrived`、`claimed` 等计数继续保留。可选 `workMetrics` 记录 `sites`、`opportunityRoute` 的墙钟归属与 `opportunityRouteChecks` 次数；默认不启用，也不进入存档。

## 定向验证

`node scripts/inkbox-wx-d-geography.mjs`：边界、阻山、隔河、实际绕行、大量失败落点、传承耗尽后其他库存、v11 库存读档、唯一传承、凤羽与神性碎片实际领取、无传承余藏开放、沉寂旧址年度结算。测试属于受控夹具；自然世界可达率及长期资源消耗由总体验收画像另行统计。


