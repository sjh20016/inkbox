# MLOD-0B 人口读取接口裁决

`populationReadPort.js` 提供 legacy、audit、census 三种模式。生产默认 legacy，继续在 `sectEconomy.villageSocieties` 上扫描真实实体。`audit` 对照独立普查并返回旧口径，`census` 仅在每个村的五项供养人口口径相等时使用新值，差异即回退旧值。供养决策消费者只支持显式隔离调用 `villageSocieties(world, 'census')`，正式调用仍走旧模式。

聚落面板通过 `setPopulationUiReadMode(world, mode)` 选择模式。`CommittedViewStore.publish` 在本会话显式启用 audit 或 census 后的合法发布时，原子生成冻结的聚落检视卡快照及两种人口口径。随后只读查询从最后一次完整发布的卡片取得数据。相同游戏日内改村、改宗、死亡与出生均在下一次发布时重建；模拟中途读、发布失败和故障后读取得前一个卡片。模式存于 WeakMap，不进入 v11 存档，翻页不调用 RNG。额外普查与卡片构造仅发生在启用的会话。默认 legacy 发布跳过快照构造，切回 legacy 时释放缓存。

`node tests/mlod0b/population-port.mjs` 使用固定 SHA 的 100/400 年档验证全村五项计数、旧卡片行、同日迁村、已提交世代与步内隔离。Canvas/Three 现场由 `node scripts/inkbox-mlod0b-browser.mjs --checkpoint-root=...` 复测，输出 `reports/mlod0b/browser/report.json`。

正式出生与宗门招募还没有通过新读接口。MLOD-1A 使用它驱动规则前须通过阶段探针、逐提交 L0、故障回退和供养边界测试。
