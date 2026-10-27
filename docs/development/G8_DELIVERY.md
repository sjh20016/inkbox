# G8 · 岁序与生息 交付说明

> 历史恢复说明：本文从聊天中恢复，因果数据及 Fast/Heavy 结论属于原会话记录，并非本次重跑结果。本次仅确认 `test:g8`、`test:g7` 和修改文件语法检查通过；G8-A+B+C 的最终 800 年长测未确认，未创建 PR。

基线：`main@4cf7f9fcda3a4ae77bf0e1ef2c20174bc591a2a7`。分支：`fix/g8-runtime-and-demography`。
与 Draft PR #51 无文件级冲突：`package.json` / `ci.yml` / `scripts/inkbox-package.mjs` 的插入点均远离 #51 的 hunk；
不改 `render3d/*`、`VisualScenarios.js`、`tests/README.md`。

## 架构判断

- **G8-A 是真实缺陷，不是测试口径问题。** 存档只存世界本体；凡间主流、战争流、上界主流/空间流、
  六条按世界懒建的独立流（mercy / rift / netherRift / netherItem / netherPossess / haunt）、
  推进时钟累加器、玩家工具流、Life/UpperLife 的冷却与建村累加器、以及 30 日边界的领土缓存
  （`_terrArea/_terrBorder/_terrBorderAt/_terrContested`，战争与冲突会读）都不在存档里。
  读档后世界线必然分叉。另有两处会话泄漏：换世界时推进时钟与玩家工具流不重置。
- **G8-B 的主因是 S0 遗留的单向漏斗，不是 C1 寿命/生育参数。** nightly 首次失败出现在 S0（`aad75c8`）
  合入当天，早于 C1（`f870453`）。S0 删除了推进路径上的 `stepVegetation` 再生，但
  `Life.stepEntity` 的「进食减 veg」仍在。植被只减不增 → 分村落点（肥力 ≥ 0.34）耗尽 →
  `maybeSplitVillage` 找不到地 → 村落只灭不生 → 总容量与人口下降。
- **上界凡人断代是独立问题。** `maybeBornMortals` 每 25 年调用 750 次，全部卡在「成年凡人 < 2」；
  上界凡人只靠裂隙偶尔带上去（400 年内 2 人）。这不是 G8-B 的同一根因，本分支不制造人口，
  只记录证据（见「残余风险」）。

## G8-A：随机流与运行期检查点

| 文件 | 职责 |
| --- | --- |
| `core/noise.js` | `rngStream(seed)`：与 `mulberry32` 同算法同序列，附不可枚举 `getState/setState`；`mulberry32` 不动 |
| `sim/worldStreams.js` | 按世界懒建独立流的统一登记表；`captureWorldStreams/restoreWorldStreams`（未用先挂起，首用时套用） |
| `sim/life.js` / `sim/upperLife.js` | `captureRuntime/restoreRuntime`：主流、战争流、空间流、各冷却、建村累加器 |
| `sim/runtimeState.js` | `RUNTIME_STATE_VERSION=1` 检查点；严格校验；要求 `day` 一致；恢复领土缓存 |
| `io/save.js` | 可选顶层 `runtime` 键（`SAVE_VERSION` 不变）；`savedRuntimeOf(world)` → `ok / absent / corrupt` |
| `main.js` | 换世界重置会话运行期；保存/导出时取检查点；读档/导入后套用，旧档或损坏档给玩家附注 |

随机流影响：零新增抽签，零顺序改变（50 年探针逐字节与「仅消融进食写 veg 的 main」一致）。
存档影响：新增约 0.5 KB；旧档照常读取，只是从读档处重新起算随机与时钟。

## G8-B：进食不再永久削减植被

`life.js` 进食分支保留回血与携带，删除对 `world.veg` 的写入（及随之的 terrain 通知）。
这与 S0 的玩家说明一致：「草木不再随机生长……这些期限使用游戏时间」——植被只由落笔与到期事件改写。
零 RNG、零存档 schema 变化、性能略好（少了逐餐的 terrain 通知）。万灵兽群啃食是 W0.1 的独立设计，未改。

### 因果证据（seed 20260914 · medium · STEP 3 · 与 nightly 同裂隙时间表）

`scripts/inkbox-g8-demography-probe.mjs`（只读包裹计数，不抽签）：

| 年 | main：人 / 村 / 平均 veg / 肥地占比 | 消融进食写 veg：人 / 村 / veg / 肥地 |
| --- | --- | --- |
| 25 | 242 / 13 / 0.111 / 18% | 266 / 13 / 0.423 / 61% |
| 50 | 327 / 12 / 0.067 / 2.3% | 433 / 21 / 0.415 / 61% |
| 100 | 360 / 10 / 0.060 / 1.7% | 839 / 37 / 0.408 / 60% |
| 200 | 314 / 8 / 0.058 / 1.3% | 1364 / 50 / 0.406 / 59% |
| 300 | 179 / 6 / 0.058 / 0.4% | 1362 / 47（软上限 `POP_SOFT_CAP=1400` 封顶） |

main 上出生从不是瓶颈：村内出生闸门几乎全是容量满（`pop ≥ 10+10·level`），配对失败每 25 年 0–16 人；
分村资格每 25 年数千次、期望 6–10 次、实际 0–3 次，失败原因是落点肥力 < 0.34。
再同时消融万灵兽群啃食，曲线同样在 150–200 年封顶，说明主因是凡间进食，兽群啃食是次要项。

第二种子（seed 7，200 年）复现：main 人口 174→202→129、村 5→3、肥地 29%→0.6%；修复后 208→528（y100）→1197（y200）、村 8→48、肥地 63%→60%。

## G8-C：长测暴露的法宝 id 撞号（上界 → 凡间）

人口恢复后，800 年长测只剩「法宝归属两份记录互相吻合」一项红。根因：上界 `forgeArtifact` 用
`upper.nextArtifactId` 从 1 编号，`leakUpperArtifact` 把上界无主法宝原样推进 `world.artifacts`，
不重赋 id；其余三个跨界方向（凡→上、凡→冥、冥→凡）都重赋。凡间法宝一多就撞号（main 上法宝稀少、几乎碰不到）。
修复：落地前取 `world.nextArtifactId`。零抽签；只在第一次上界漏物之后改变后续法宝编号。
逐年插桩的长测副本在第 641 年首次抓到：id 121 同时在地上与实体 8381 手中。
`scripts/inkbox-g8-rift-artifacts.mjs` 在 main 上复现撞号（`1,2,3,4,5,6,4`），修复后通过。

## nightly 800 年体检（seed 20260914）

| | main@4cf7f9f | G8-A+B | G8-A+B+C |
| --- | --- | --- | --- |
| 未通过 | 10 / 88 | 1 / 88 | 未完成确认 |
| 第 800 年生灵 / 村 | 40 / 2 | 1400 / 43 | |
| 上界凡人 | 0（累计吸上 4、生育 0） | 59（累计吸上 24、生育 288、入道 76） | |


main 的 10 项：没有一家把地图吃干（一家占 95%）、宗门接壤、灵脉有得争、六阶都有人走到、修士不是孤例、
家世记在出生那一刻、交手记录、上界有凡人活着、上界凡人能繁衍、上界凡人能踏入修行。前 7 项是凡间
人口塌缩的直接后果；后 3 项是「凡间人少 → 裂隙吸上去的凡人少」的下游，人口恢复后自然转绿，未改上界参数。

## 测试

- `npm run test:g8`（Fast，约 12 秒）：`inkbox-g8-runtime.mjs`（61 项）、`inkbox-g8-demography.mjs`（4 项，
  main 上失败：12 年 7790 格植被被改写）、`inkbox-g8-rift-artifacts.mjs`（main 上失败）。
- 全部 Fast + Heavy 本地通过（含 `test:three-realms`、`test:save-equivalence`、`test:g1:longrun`、`build`）。
- `render3d:m2c2b:sample` 的 GOLDEN_A 计数 104+6 → 95+7：只消融进食写 veg 的 main 得出同样计数，G8-A 单独不改变。

## 残余风险

- 长测耗时随人口上升：本地 2 核约 79 分钟（main 约 25 分钟），仍远低于 nightly 240 分钟超时。
- 万灵兽群仍会永久啃食植被（W0.1 设计，未改）；800 年内平均植被 0.427→0.406，不足以触发分村门槛。
- 上界凡人供给仍完全依赖裂隙；`upperLife.js` 中「凡人寿元 ≈11.7 年」的注释在 C1 后已过时（未改行为）。
- 旧存档没有 `runtime` 块：可读，但从读档处重新起算随机与时钟，玩家会看到附注。
