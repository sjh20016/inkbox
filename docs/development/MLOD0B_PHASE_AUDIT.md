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

144000 日的 #74 档是已完成分宗后的存档状态：太白剑宗缓存与实体派生的 followers/pop 为 599/72 对 574/69，扶桑院·三缓存为 0/0、实体派生为 25/3。扶桑院·三的 25 人包含新宗首领/创始人；这份存档不能倒放，因此它只证明保存的归属及下一次宗门统计重算，不是首次写入的调用栈证据。对应原始对照见 [红灯夹具](../../reports/mlod0b/red-fixture.json)。

另一个定向报告使用相同 400 年真实实体，通过公开 `stepSects(world, life, 3, rng)` 路径，受控满足触发条件并固定 RNG。观察器在正式路径里记录 `before-schism` 和 `after-schism-membership`，`firstWriter` 为 `sim/sects.js:maybeShed`。本次一共把 23 个既有门人 ID 改宗；首领不是这 23 人之一，而由 `foundSect` 单独设置为 child founder/leader，因此新宗共 24 名实体成员。报告同时记录首次步宗门缓存仍是统计后、分宗前的旧值，以及下一次 `stepSects` 后宗门实体派生统计与缓存一致。夹具把原档选出的身份集中到同一地点并受控宗门条件，属于公开写入路径的机制证明，不是自然分宗或第 144000 日历史重放。输入村庄的已有 `village.pop` 差额仍单列，不作为宗门 census 失败。[分宗原始报告](../../reports/mlod0b/schism.json)；独立复测：`node scripts/inkbox-mlod0b-schism.mjs`。可传 `--checkpoint-root="../交付/WX_E_NEXT_20261114-001700/payload/inputs"` 或 `--input-400="D:/path/20260914-400y-save.json"`，脚本会先核对固定 SHA。

浏览器只读检查另在 400 年产品存档的官方 Canvas 和 Three 页面分别运行。暂停后对 realm view 依次选 `viewUpper`、`viewNether`、`inspect`，每一步均重复查询凡界聚落卡片，并哈希 `serializeWorld` 连同 runtime；两 renderer 的三次视图切换均保持同一哈希和同一卡片。`inspect` 的 `targetPlane=null` 表示恢复默认凡界视图。随后短暂推进并再次暂停，确认模拟确有前进，卡片查询仍确定。此项证明观察/显示切界未改写 world/runtime；它不验证飞升、裂隙迁移等跨界交易本身。报告记录固定输入 SHA、Edge/Node 环境及源指纹：[浏览器原始报告](../../reports/mlod0b/browser-realms/report.json)。独立复测需安装 Microsoft Edge，使用 Node.js 与浏览器自动化可用的桌面会话，并在包目录运行：`node scripts/inkbox-mlod0b-browser-realms.mjs --checkpoint-root="../交付/WX_E_NEXT_20261114-001700/payload/inputs"`。只需复测人口语义时可将 `--renderers=canvas` 降为单 renderer；默认命令执行 Canvas 与 Three。

120 步事件日志没有触发自然再分宗这一事实仍成立。现已补充受控公开 `stepSects` 的 writer 路径证明、独立浏览器只读切界证明，以及既有 lifecycle fixture 中 `arriveUpper` 的落地函数验证。它们分别覆盖机制、展示纯度和单函数落地，不等同于真实跨界因果交易、附界人口周期或正式 `publishCompleteStep` 的全链路验证。此处 `world.generation` 不是 `CommittedViewStore` 的提交 sequence，不用它宣称可见代际。
