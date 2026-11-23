# 跨界与灾祸写入者边界见证

从固定 SHA 的 100 年自然档恢复后，`node scripts/inkbox-mlod0b-ascend-boundary.mjs` 派生三界并将一位原档凡人置于 60 级门槛。隔离夹具只保留此位凡间实体，正式 `advanceWorld(10)` 调用 `Life.stepEntity`、`cultivation.ascend`、`arriveUpper` 和 `Life.step` 清理。被控对象 id 40 在 `stepEntity` 返回时仍留于凡间数组且已标记飞升，上界已有新对象 id 1000012；完整步后凡间原对象已清除，上界只存一份新身份、宗族和归属清空，G8 运行态仍可精确捕获。该探针在实例上暂时包装 `stepEntity` 以见证循环内部边界，因此会触发 E1C 未审计读取退路；它只在隔离脚本运行，不用来证明正常快路性能或完整世界线等价。完整步内另有一个独立的新凡人出生，所以人口总量应按飞升减一、出生加一、上界入境加一解释。上界到达日志记的是上界时钟同步前的日期，不能把它当作凡间提交日。[原始跨界报告](../../reports/mlod0b/ascend-boundary.json)

`node scripts/inkbox-mlod0b-hazard-parity.mjs --dt=3` 从 100/400 年档各建 off、audit、selective 三条独立世界线。受控玩家雷击走正式 `powers.lightning` 和 `History`，实际标死人类并在随后 `Life` 清理中减少存活人口；受控 `grantRoot` 走正式神力写者，实际令凡人转入修士谓词。各条世界线采用同一合法命令和 dt，对拍四种情形的完整 v11 世界、G8 runtime/RNG 哈希和最终人口读取，均相同。该结果证明这两个正式写者与影账观察器相容。所选雷击和点化是受控场景，不声称两个自然存档原本会在该日发生这些事件。脚本还支持相同命令下的 dt=0.1 或 1 复测。[灾祸与点化原始报告](../../reports/mlod0b/hazard-parity.json)
