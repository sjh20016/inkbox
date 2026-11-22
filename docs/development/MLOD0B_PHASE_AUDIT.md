# MLOD-0B 阶段与分宗实证

固定 #74 `3772bea8fa7b7ef753770c3a47877e6b461dd3c8`，输入 100 年和 400 年自然 v11/G8 档。脚本在解析前核对字节 SHA；原始报告由 `node scripts/inkbox-mlod0b-red-fixture.mjs` 和 `node scripts/inkbox-mlod0b-phases.mjs` 生成。后者对同源恢复世界各推进 3 日，只有一臂附加诊断观察器，并比较完整 `serializeWorld` 加 runtime JSON 字节，相等。

| 阶段 | 太白剑宗缓存 followers/pop | 太白实体归属重算 | 扶桑院·三缓存 | 扶桑实体归属重算 |
|---|---:|---:|---:|---:|
| 第 144000 日读档后 | 599/72 | 574/69 | 0/0 | 25/3 |
| 下一步清理后、首轮村人口同步后、村庄结算后 | 599/72 | 574/69 | 0/0 | 25/3 |
| 下一次 `stepSects` 人口循环后 | 574/69 | 574/69 | 25/3 | 25/3 |
| 第 144003 日完整推进后 | 574/69 | 574/69 | 25/3 | 25/3 |

源码调用顺序为 `Life.step` 的 pending spawn、个体行为、死者清理、第一次 `syncVillagePops`、`stepVillages`、`stepFounding`、`stepWildlife`、`stepSects`。`stepSects` 开始时为每宗清零缓存，再按实体当前 `faction` 统计 followers 和活着的实际修士 pop；随后 `stepOneSect` 可以通过 `maybeShed` 创建新宗并将至多 24 名追随者改宗。分宗发生于已完成该步统计之后，未在同一步重新统计。第 144000 日父宗 25 个 followers 和 3 个修士的缓存差额与新宗对应差额相抵。此分歧在该步完成后存入 v11，下一次宗门统计时消除。报告将这种缓存标记为 `expected-stale`，按宗门的当前归属查询应使用现算值。这里没有改写缓存或宗门规则。

读档后的阶段观察器通过 WeakMap 附加，只在显式设置时调用。观察回调可以在阶段边界采样实体归属与宗门缓存。由于 `stepSects` 内的分宗会在统计之后再更改归属，单靠 world.day、world.entities.length 或完成步代际无法判断缓存新鲜度。生产读接口应以同一已提交帧的实体派生事实为准，宗门缓存只作为旧规则结算状态对照。附加观察器后两档下一步完整序列化字节与无观察器臂一致，详见 [阶段原始数据](../../reports/mlod0b/phases.json) 和 [首次红灯夹具](../../reports/mlod0b/red-fixture.json)。

`stepVillages` 出生分支的注释称缺双亲仍出生，实际 `Life.spawn` 在 `allowSouls` 为真时拒绝双亲缺失、不在同村、不在实体列表、未在适育年龄，或村中没有活凡人。红灯脚本从 100 年自然档恢复，在一个真实村庄调用 `spawn(..., {allowSouls:true, parents:null})`，返回 0，调用前后完整 world/runtime 捕获字节相等。该矛盾须保留为现状见证，不能改写人口曲线来使注释成立。出生、死亡同日和村庄分裂路径已在阶段日志设采样点；本轮原始两档下一个 3 日步未必触发所有事件，所以仍须专门边界夹具与长程覆盖。

## 120 个合法步的阶段事件

从 100 年精确档连续推进 360 日，`dt=3`，120 个合法提交边界逐步比较附加观察器与无观察器的完整保存状态，均相等。阶段事件日志收集到 23 次自然出生、13 次死亡清理及一次宗门归属变化。首个出生为第 36009 日、实体 1045、村 1；首个死亡清理为第 36012 日、实体 336。每项保存 firstWriter、变更实体的旧/新村宗归属与实体总数。[原始阶段事件](../../reports/mlod0b/phase-events.json)

第 144000 日检查点已经包含分宗之后的真实实体归属。扶桑院·三的 25 个实体 ID 和其中 3 个修士 ID 记录于红灯夹具。这个输入无法倒放到分宗之前，因而 25 人的 firstWriter 是由 `sim/sects.js:maybeShed` 源码与缓存差额归因，未观测该次发生时的调用栈。阶段探针已在后续分宗的前后记录移动 ID，但上述 120 步未再次触发分宗。村庄分裂、跨界及正式 `publishCompleteStep` 点仍待定向夹具验证。此处 `world.generation` 不是 `CommittedViewStore` 的提交 sequence，不用它宣称可见代际。
