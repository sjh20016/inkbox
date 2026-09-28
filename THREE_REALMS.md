# 三界设计状态（THREE_REALMS.md）

> **这份文档不是设定集，是约束表。**
> 它只写「代码必须遵守的三界规则」，供不同模型轮换开发时当长期记忆锚。
> 三界规则发生变化时才改这里；不要把它写成流水账，不要往里塞开发日志。
>
> 当前工程阶段：**D7 观察与表现层 A–G 已封板；D8 视界 2.0（穿透式跨界观察）A–F 完成 · G 待开工**。
> 事实核对日期：2026-09-27（D6-2 A–F · D6-3 A–E · D7 A–G）。引用前先重跑一遍 grep，读数会腐烂。
>
> ⚠️ **实现细节一律看代码，不写在这里**：字段清单、常量标定、踩坑记录都在各自模块
> 的头注释里（`sim/upperLife.js` / `sim/netherLife.js` / `sim/rifts.js` / `world/planes.js`）。
> 本文只回答一个问题：**这一界「是什么」，以及「不做什么」。**

---

## MORTAL —— 凡界

**是什么**：主世界。唯一的完整生态，也是三界里唯一跑「社会」的那一界。
入口 `worldgen.generateWorld`，主循环 `sim/life.js` 的 `Life`。

**主要生命循环**（全部在 `Life.step` 里驱动）：

| 循环 | 模块 |
|---|---|
| 人口 · 聚落 · 觅食 · 求偶 | `sim/life.js` |
| 修炼 · 觉醒 · 突破 · 天劫 · 飞升 | `sim/cultivation.js` |
| 宗门 · 收编村庄 · 争灵脉 | `sim/sects.js` · `sim/territory.js` |
| 世家（姓氏比人活得久） | `sim/family.js` |
| 战争（摩擦与大战） | `sim/war.js` |
| 生态（植被 / 野火） | `sim/ecology.js` |
| 法宝（炼制 / 拾取 / 朽坏） | `sim/artifacts.js` |
| 死亡 · 逝者名录 | `sim/necrology.js` |
| 神魂 · 转世 · 夺舍 · 魂分五路 | `sim/reincarnation.js` · `sim/possession.js` |
| 世界事件 · 灾祸 | `sim/worldEvents.js` |
| 水文（按真实时间，不按游戏日） | `sim/hydrology.js` |
| 卜算子（天道引路人） | `sim/busanzi.js` |
| 空间裂缝（**开在凡间**） | `sim/rifts.js` |

**只属于凡界的系统**（上界与幽冥**一律不跑**，见下两节的「禁止照搬」）：
水文 / 转世与魂池 / 夺舍 / 世家 / 卜算子 / 聚落 / 宗门战争 / 妖潮 / 裂缝。

**D6-2 阶段立场：凡界不扩张。** 只保证不被改坏；这是已完成阶段的边界记录。

---

## UPPER —— 上界

**是什么**：飞升者的去处，也是被裂缝卷上去的凡人的落脚地。
独立 `World`（`worldgenUpper.generateUpperWorld`）、**独立 seed**、独立地图、独立人口。
主循环 `sim/upperLife.js` 的 `UpperLife`。

**独立 seed**：`deriveUpperSeed(凡间种子) = 凡间种子 ^ 0x55505052`（'UPPR'）。
唯一派生处是 `world/planes.js`；**调用方一律传凡间种子**（异或自逆，传派生值会退回凡间种子且不报错）。

**人口来源**（四条，`upper.popLog` 分栏记账）：

| 来源 | 字段 | 通道 |
|---|---|---|
| 开局播种 | `seeded` | `worldgenUpper.seedUpperPopulation`（12 人） |
| 飞升 | `arrived`（+ `arrivedThunder` 分类） | `cultivation.ascend` → `planes.arriveUpper` |
| 裂缝卷上来 | `arrived`（+ `sucked` 分类） | `rifts.leakToUpper` → `planes.arriveUpper` |
| 本土出生 | `born`（修士化生）/ `bornMortal`（凡人繁衍） | `UpperLife.maybeBorn` / `maybeBornMortals` |

⚠️ `sucked` / `arrivedThunder` 是 `arrived` 的**子集**（只做分类），不是替代项——
人口守恒式 `entities === seeded + arrived + born + bornMortal − died` 只出现 `arrived`。

**人口去向**：只有 `died`（`UpperLife.bury`）。上界**没有**飞升出口（`cultivation` 已按 `world.plane` 分流）。

**允许运行的系统**（就这几件，别再加）：
修炼推进（复用凡间 `stepCultivation`）· 陨落 · 修士化生 · 凡人繁衍 · 极简仙门（立派 + 弟子清点）·
独立炼器（不依赖突破）· 地面法宝时钟（拾取 / 朽坏）· **空间行为**（D6-2 工程包 C，**已实装**）。

**空间行为**（`UpperLife.stepSpatial`）：上界实体**不再定格在出生点**。
规则就这几条，**别加动机**（不做觅食 / 务农 / 追敌 / 逃命那一套）：

- **低频目标选择**：`timer` 归零（每 20–60 游戏日，即每 2–6 拍）才重选一次目标。
  目标在当前位置周围的方形半径内采样 `upperWalkable` 格；**修士按 `upper.qi` 判分**
  （往灵气厚处走），凡人纯随机。
- **简单移动**：直线走 + 子步化（每段 ≤ 0.5 格、逐段判可通行）；走不通先试单轴滑墙，
  两条单轴都不通就放弃本拍、下一拍重选目标。**没有**多步前瞻 / 寻路 / A*。
- **可通行判据单源** = `planes.upperWalkable`（与生成侧 / 飞升落点 / 裂隙过滤同一把尺子）。
- **随机流**：空间行为走**自己的**独立流（`upper.seed ^ 'UPSB'`），
  **消费 `upperLife.rng` 的次数恒为 0**。
  ⚠️ 但移动会通过「位置 → `world.qi[所在格]` → 修炼速度」**间接**改变上界世界线——
  这是**刻意的生态耦合**（修士往灵气厚处走 ⇒ 修得更快），不是要规避的扰动。
  凡间世界线**完全不受影响**（两界随机流本来就分家）。
- **移动状态**（`x/y/tx/ty/timer/state`）全是**既有实体列**，本包**没有**新增存档字段。

**明确禁止照搬的凡界系统**：
战争 / 世家 / 夺舍 / 转世与魂池（`upper.souls` 恒空）/ 卜算子 / 聚落（`villages` 恒空）/
裂缝（裂缝属于**凡间**，见 RIFT 节）/ 妖潮 / 水文 / **寻路（A* 之类）** / **凡间那七种行为动机**。
这些在 `worldgenUpper.resetUpperSystems` 里被显式归零——那是机器可读的承诺，不是注释。

⚠️ **禁止 `new Life(upper)`**。上界由 `UpperLife` 维护，随机流从 `upper.seed` 派生。

---

## NETHER —— 幽冥

**是什么**：死者的去处与滞留地。独立 `World`（`worldgenNether.generateNetherWorld`）、
**独立 seed**、独立地图、独立人口。tick 是 `sim/netherLife.js` 的 `stepNether`（**函数，不是类**）。

**独立 seed**：`deriveNetherSeed(凡间种子) = 凡间种子 ^ 0x4e455452`（'NETR'）。
⚠️ 必须与 `UPPER_SEED_KEY` 不同——同种子会让两张地形图「巧合地」逐格相同，且不报错。

**空间骨架是冥河**。离冥河越近，阴气越浓；远处是荒芜。

**⚠️ 阴气存在 `veg` 层**（不是 `qi` 层）。
`nether.veg[i]`：0 = 荒芜，1 = 阴气浓厚。幽冥**没有**自己的灵气公式，`qi` 走凡间那套 `qiAt`。
读到「阴气」时一律读 `veg`——这是 D6-2 工程包 D 的环境输入。

**鬼魂来源**：凡间死亡 → `reincarnation.enterNether` 判魂路 → 落 `spawnNetherGhost`。
魂分五路（考古定名，**不得擅改**）：`natural` 自然转世 · `linger` 滞留幽冥 · `ghost` 鬼修 ·
`wraith` 怨魂化 · `gone` 魂火散尽。其中后三路**不进魂池**。

**鬼修来源**：`spawnNetherGhost({ kind: 'ghostCultivator' })`，起步 `level = 1`（游魂）。
六级由 `level` **现算**（`ghostTierOf`），**不存阶字段**：
游魂 / 怨灵 / 厉鬼 / 鬼将 / 鬼王 / 鬼帝（考古定名，**不得擅改**）。

**消散规则**（三条路径，`stepNether` 按此顺序执行）：

| 路径 | 判据 | 记账 |
|---|---|---|
| 对账消散 | 绑魂的普通鬼魂，其魂一离开凡间魂池即散 | `ghostDied` |
| 到期消散 | `world.day >= ghostDecayDay` | `ghostDied` |
| 上限逐出 | 实体数 > `NETHER_SOUL_CAP`（400），先逐最老的普通鬼魂 | **只记 `evicted`** |

⚠️ 守恒式是 `entities === ghostBorn − ghostDied − evicted`。
`cultivatorBorn` 是 `ghostBorn` 的子集，`evicted` **不是** `ghostDied` 的子集。

**空间行为**（D6-2 工程包 D，**已实装**）：鬼魂 / 鬼修**不再定格在落点**。
- **低频目标选择**：`timer` 归零才重选目标，间隔 25–70 游戏日；
  **简单移动**：直线 + 子步（≤ 0.5 格）+ 单轴滑墙。**不做寻路 / A\***。
- **活动范围**（判据单源 = `nearRiverAt`，与落点窄带共用同一把尺子）：
  · **普通鬼魂** = `NETHER_BANK_RADIUS`（4 格）⇒ **只在河边窄带活动**（D1）；
  · **鬼修** = `4 + ghostTierOf(level) × NETHER_TIER_REACH`（3）⇒ 游魂 4 → 鬼帝 19，
    **阶越高越能远离冥河**（D2）。
- **高阶鬼修空间吸引**（D5）：鬼将及以上（`ghostTierOf ≥ 3`）成为「吸引源」，
  **低阶**实体（普通鬼魂 + 阶位更低者）的目标评分偏向**最近的吸引源**。
  ⚠️ 这是**移动方向的偏好**，不是「鬼城」——不建结构、不改实体、不产生新状态。
- ⚠️ **幽冥空间行为零 `rng`**（铁律一）。目标采样走 `hashStep` 推进的**确定性哈希流**，
  种子 = `hash32(entityId : day)`。幽冥**没有**第二条随机流可用：`stepNether` 是纯函数，
  没地方挂流（挂上去就被序列化器看见，违反铁律二）。
- ⚠️ 移动**不新增存档字段**：用的 `x / y / tx / ty / timer / state / anim / face`
  早就是实体列（与工程包 C 同一条结论）。

**环境规则**（D3，工程包 D 已实装）：阴气（`veg`）**影响**鬼修积怨增速——**影响，不是决定**。
积怨增速系数 = `RANCOR_ENV_MIN + (RANCOR_ENV_MAX − RANCOR_ENV_MIN) × veg` = `0.6 + 0.8 × veg`。
- ⚠️ 系数**下界 0.6 > 0** ⇒ 「离开最佳格就永远不能升级」**结构上不成立**：
  基础积怨独立于环境存在。谁把下界调成 0，谁就把「影响」改成了「决定」，当场违反本节。
- 系数区间取 **[0.6, 1.4]**（不是 [0, 1]）是**刻意**的：环境是**加成 / 减益**，不是开关。
- 鬼修会移动（见上），所以它读到的是**当前位置**的 `veg`——这正是「环境参与成长」的含义。

**消散留痕**（D4，工程包 D 已实装）：鬼魂**消散**（对账 / 到期）时，把**消散地点**所在格的
`veg` 抬 `DECAY_TRACE_VEG`（0.03，加性、clamp 到 1）。**上限逐出不留痕**——那不是「消散」，
位置没有意义。
- ⚠️ `veg` **进档**且 `deserializeNetherWorld` **不重算**它（只走 `recomputeQi`）⇒ 留痕
  **零存档改动**。量化步长 1/65535 ≈ 1.5e-5 远细于 0.03，**存得住**。
- ⚠️ 这是**刻意的生态耦合**（同工程包 C 的「位置 → 灵气 → 修炼」）：留痕抬高 `veg`
  ⇒ D3 的系数变大 ⇒ 后来者在同一格积怨更快。不是要规避的扰动，是「鬼魂聚集地阴气渐重」。

**明确禁止照搬的凡界系统**：
宗门 / 鬼城 / 幽冥战争 / 世家 / 灵脉 / 转世魂池（**魂池不搬家**，`nether.souls` 只是
凡间 `world.souls` 的别名，游戏里恒空）/ 修炼突破（鬼修走**积怨**，不走灵根）/ 夺舍 / 聚落 /
**寻路（A\* 之类）**。`worldgenNether.resetNetherSystems` 把它们显式归零。

⚠️ **禁止在幽冥抽任何 `rng`**（`netherLife` 铁律一）。落点与数值全部走纯哈希 / 确定性算术——
抽签会移动凡间主随机流，把既有标定全部作废。**空间行为也守这条**（见上）。

---

## TIME —— 三界共享同一时间轴

**唯一时间源是凡间 `world.day`。**

- `upper.day` / `nether.day` 由 `sim/advance.js` 的 `advanceWorld` **赋值**，**不自己推进**；
- 唯一入口是 `advanceWorld(world, days, deps)`，节拍表 `ADVANCE_PERIODS`
  （upper 10 · nether 10 · rift 30 · **wraith 10**（D6-3 B）· eco 5 · fire 0.8 游戏日）；
- 真实游戏与**全部测试**都调 `main.js` 的 `advanceDays(days, opts)`——**测试不许自己抄时钟列表**
  （漏掉一个时钟不报错，只让读数静静失真）。

不变量：推进凡间 N 天后 `mortal.day === upper.day === nether.day`。

---

## COORDINATES —— 三界同尺寸，坐标可对应

三界是**同尺寸**的独立地图（同一 preset 的 `w` / `h` / `size`），
所以 `(x, y)` 在三界之间**可以直接对应**——这是视界贴图、裂缝落点、跨位面转移的共同依据。

⚠️ 但「同坐标」**不等于**「同语义」：三界各自的地形 / 可通行判据 / 内容都不同。
跨位面转移**必须在目标世界的 id 空间里重新登记**（见 `world/planes.js` 的 id 段常量）。

**id 段**（铁律三：跨世界身份必须带世界限定符）：

| 位面 | id 段起点 | 常量 |
|---|---|---|
| 凡间 | 1 | — |
| 上界 | 1 000 000 | `UPPER_ID_BASE` |
| 幽冥 | 2 000 000 | `NETHER_ID_BASE` |

不变量：三界实体 id 集合**两两交集为空**。

---

## VIEW —— 视界只负责观察对应坐标

视界是**画中画**：在凡间划出一块自由形状，窗里贴**同一块坐标区域**的另一界。

- `viewUpper` → 上界；`viewNether` → 幽冥。判据总表在 `ui/realmView.js` 的 `VIEW_TOOL_PLANE`
  （`VIEW_TOOL_IDS` 由它的键派生；D8-B 从 `main.js` 搬来）。
- 视界**窗口本身**只读：不改世界、不抽 rng、不产生任何跨位面效果。
  ⚠️ **但「开视界」这个动作不是只读的**（D6-2 B 起）：它在划选区域的边缘**开出裂缝**
  （`openRifts`，会消费裂隙流洗牌候选站点），而裂缝随后会演化并产生跨位面效果
  ——这是**实打实的副作用**（smoke 里那条「上界视界工具仍 `readonly:false`」钉的就是它）。
  别把「窗里画的是只读快照」推广成「开窗没有副作用」。
- 视界窗口本身是 **UI 状态，不进存档**。
- 窗里画的是那一界的**地形 + 人与宗门**（`drawPlaneView`）。

⚠️ 加第三界时只改 `VIEW_TOOL_PLANE` 一处——散着写 `toolId === 'viewXxx'` 会让
「加一界」变成「改 N 处、漏一处」，而漏掉那处**不报错**。

---

## READOUT —— 三界统一生态读数

「三界」面板（右栏 `#inkUpperMeta` / `#inkNetherMeta` 两行）报**同一口径**的生态账本，
回答同一个问题：**这一界的人 / 鬼，是「生」出来的多还是「亡」掉的多，账平不平。**

| | 行上原有 | 本包追加（工程包 E） | 守恒式 |
|---|---|---|---|
| 上界 | 生灵 / 宗门 / 飞升上来 | `生态 生 N · 亡 M` | `生灵 === 生 − 亡` |
| 幽冥 | 魂池 / 累计 / 已归来 / 鬼魂 / 鬼修 / 最高 | `生态 生 N · 亡 M · 逐 K` | `鬼魂 + 鬼修 === 生 − 亡 − 逐` |

- **口径单源**：`upperEcoStats`（`world/planes.js`）/ `netherEcoStats`（`sim/netherLife.js`）。
  两者返回**同名字段** `born / died / alive`（外加幽冥的 `evicted`），面板与测试**都调它**
  ——各写一份就是第二个真相。
- **「生」的定义**：上界 = `seeded + arrived + born + bornMortal`（四种来源之和）；
  幽冥 = `ghostBorn`。「亡」两界都是累计陨落 / 消散。
- ⚠️ **幽冥多一栏「逐」是两界的规则差别，不是口径不统一**：幽冥有**两条**离开路径
  （消散 + 上限逐出），上界只有一条（陨落）。把逐出并进「亡」= 把「被清出去」说成「死了」。
- ⚠️ **只在现有面板行上追加**：不新增区、不新增 CSS 类、**不改动原有子串**——
  playtest 10e 用 `includes('生灵 N')` 之类的**子串**对账，改写会悄悄改掉那条断言的契约。
- ⚠️ 两界的「此刻活着几个」（`entities.length` / `鬼魂 + 鬼修`）与「累计来过几个」（`生`）
  是**两件事**，两个都报：只报一个的话「上来过 1 个」与「此刻 13 个」谁都会读错。

---

## RIFT —— 裂隙必须知道连接目标位面

裂缝是**玩家开视界这个动作的副作用**：划选区域的边缘（两界的接缝）上裂开细缝。
裂缝**属于凡间**（`world.rifts` / `world.riftLog`），因为它开在凡间的边缘。

**每条裂缝必须记录 `targetPlane`**（`'upper'` | `'nether'`）：

- 这是**世界状态，必须进存档**。裂缝可能持续几十年，玩家关掉视界以后，
  它仍然必须知道自己原本连接哪里。
- 老档（本契约之前）没有这个键 → 兜底 `'upper'`（诚实缺省：那时只有上界裂缝）。

**行为按目标位面分流**：

| | `upper` 裂缝 | `nether` 裂缝 |
|---|---|---|
| 位置判定 | 凡间格可通行 **且** 上界对应格可通行 | 凡间格可通行 **且** 幽冥对应格可通行 |
| 创建 / 成长 / 闭合 / 显示 / 保存 | ✅ | ✅ |
| 跨位面效果 | ✅ 上界逻辑（漏物 / 吸人） | ✅ **凡人跌入幽冥**（D6-3 A）· **鬼爬入凡间**（D6-3 B）· **幽冥物品漏入凡间**（D6-3 C）· **鬼修夺舍 / 附身凡人**（D6-3 D） |

**落点判据单源**：上界用 `planes.upperWalkable`，幽冥用 `planes.netherWalkable`。
**不许另写一套地形阈值**——落点判定与生成侧一旦分叉，东西会落进云海 / 冥河里，而且不报错。

⚠️⚠️ **硬不变量：打开幽冥视界绝不会偷偷执行上界转移。**
nether 裂缝**绝不调用** `arriveUpper` / `leakFromUpper` / `leakToUpper`。

### D6-3 A · 幽冥缝的通道与流（保证方式变了，判据没松）

D6-2 靠**一行 `continue`**（在抽签之前返回）冻结幽冥缝。D6-3 解冻它时，那一行
变成**分流**——**不是**把它接回上界那条链路（那正是 D6-2 要防的语义错位：
`viewNether` 与 `viewUpper` 共用 `openRifts`，接回去就会让幽冥缝去执行凡间 ↔ **上界**
的漏物 / 吸人，而且不报错）。

- **自己的通道**：`stepNetherRift`（`sim/rifts.js`）。它及其下游**够不到**上界那三个函数
  ——「不可达」现在由**函数边界**保证。一行守卫可以被顺手删掉，函数边界不能。
- **自己的流**：`netherRiftRngFor(world)`，派生键 `0x4e524654`（`'NRFT'`）。
  与裂隙流 `0x72696674`（`'rift'`）、上界 `0x55505052`（`'UPPR'`，`planes.js`）、
  幽冥 `0x4e455452`（`'NETH'`）**两两不同**。
  ⇒ **玩家多开一条幽冥视界，不会移动上界缝的抽签序列。**
- **效果 = 凡人跌入幽冥**（`fallIntoNether`，导出以便测试直调）：
  半径内 `isPerson` 且 `level < RIFT_CROSS_MAX_LEVEL`（40）的活人里取境界最高的一个；
  **先落成幽冥实体、再把人 `splice` 出凡间**（反过来会让人凭空蒸发）；
  身上的法宝**跟着人进幽冥**（D6-3 C 改了 A 包的 `scatterArtifacts` 行为，见下）；
  落成的是**鬼修**（`level ≥ 1`）或鬼魂，
  带 `mortal:<id>` 身份快照（`route` 传 `null`——他不是走魂路去的，硬塞五路之一会让名册说谎）。
- **本函数零 `rng`**：判定节奏的抽签在 `stepNetherRift`，**选谁不抽签**。
- ⚠️ **记账落 `nether.popLog.fellIn`**（`ghostBorn` 的**子计数** ⇒ 守恒式不用改）。
  **不要**往 `world.riftLog` 加键：那是 `save.js` 里**逐键显式序列化的 5 键**
  （`opened/closed/leaked/crossed/lost`），加键会读档丢失。
- 老档 / 手工构造的缝没有 `targetPlane`（`undefined`）⇒ 判据必须是 `=== 'nether'`，
  **不是** `!== 'upper'`——后者会把它们静默改道到幽冥通道。

跨位面夺舍 / 附身已由 D6-3 工程包 D 实装；本段只记录当时的阶段边界，不代表它仍待开发。
（鬼进入凡间已随工程包 B 落地、幽冥物品泄漏已随工程包 C 落地，见下；
幽冥宗门 / 鬼城 / 幽冥战争 / 跨界战争 / 幽冥入侵 **仍然禁止**，见下方「明确不做」。）

### D6-3 B · 鬼爬入凡间（幽 → 凡；同一条缝的另一半）

A 包做了「凡 → 幽」（活人跌进去），B 包做**反方向**：缝口的鬼魂爬进凡间，
在凡间飘荡一段日子再**自行消散**。判定节奏与 A 包同源（都在 `stepNetherRift`
里抽签），但**两个效果各抽各的签**（两个独立 `if`，**不是** `else if`）：

- **第二条流**：`mortalHauntRngFor(world)`，派生键 `0x4841554e`（`'HAUN'`）。
  与裂隙 / 幽冥缝 / 上界 / 幽冥 / mercy **六条两两不同**（F9 逐对钉）。
- **效果 = 鬼爬入凡间**（`climbOutToMortal`，导出以便测试直调）：
  候选 = 幽冥里 `sp === ghost` **且离缝口最近**（半径内）的那一只；
  **先落成、再移除**（`spawnWraith` 撞上限返回 `null` ⇒ **保留幽冥那一份**，
  绝不凭空蒸发）；**本函数零 `rng`**（谁爬出来由空间距离决定，平手保留先遇到的）。
- ⭐⭐ **鬼住 `world.wraiths`（独立容器）+ `stepMortalWraiths`（独立 tick），
  绝不进 `world.entities`**。这是 B 包最承重的判决，理由是**查证过的事实**：
  凡间与上界共用 `cultivation.stepEntity`，其「凡人试着觉醒」段的豁免名单只有
  `beast` / `spirit`，`ghost` **不在其中** ⇒ 鬼若进 `world.entities`：
  ① 普通鬼魂被掷觉醒骰 → `awaken()` 给 `level=1` + 灵根 + **寿元被重算**；
  ② 鬼修按 `world.qi[格]` 修炼 → 突破 → 40 级起**天雷飞升** → 上界凭空多一个鬼。
  两条都**不报错**并污染上界人口账。⇒ 用**函数边界**隔离（不是往 `stepCultivation`
  里塞一行 `sp === 'ghost'` 的守卫——一行守卫能被顺手删掉）。
- **身份带世界限定符**：爬出来的鬼**保留它在幽冥的 id**（`NETHER_ID_BASE` 段），
  不重赋凡间号 ⇒ 「从幽冥来的」写在 id 里，且与 `world.entities` 结构上不相交。
- **记账落 `nether.popLog.climbedOut`**（**第三条离开路径**，独立于 `ghostDied`
  （消散）与 `evicted`（上限逐出））⇒ 幽冥守恒式扩成
  **`鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出`**（`netherEcoStats.conserved` 与面板同步改）。
  **不要**往 `world.riftLog` 加键（那是 `save.js` 逐键显式序列化的 5 键）。
- **凡间侧账本** `world.wraithLog` 只有 `dissolved` 一键（累计消散）；
  「累计来过多少」= `wraiths.length + dissolved` **现算**（铁律二，不入档）。
  ⇒ 不变量：`wraithStats.total === nether.popLog.climbedOut`（同一批鬼的两端记账）。
- **不进编年史日常**：鬼在凡间飘荡不写编年史（会把真正的大事挤出滚动窗口）；
  只在**跨界那一刻**写一笔 `'rift-out'`（`KIND_TAG` 归 `person`，与 `'rift-lost'`
  是同一组对照事件的两半）。
- **两个 key 必须进存档**：`wraiths`（22 字段逐字段显式）/ `wraithLog`；
  上界与幽冥 payload **刻意不含**它们（缝开在凡间、鬼爬进凡间）。
  读侧形状由 `sim/wraiths.js` 的 `WRAITH_TEMPLATE` 单源定义（`restoreWraiths`）。
- **触发概率**：`WRAITH_CLIMB_CHANCE_PER_PERIOD = 0.05`（每 30 日一拍）；
  **凡间侧 tick** 周期 `WRAITH_PERIOD_DAYS = 10`（挂在 `advance.js` 的 `wraith`），
  ⚠️ **不挂 `deps.riftActive`**——鬼一旦爬出来就是凡间世界里的一只实体，飘不飘
  与玩家开不开视界无关（挂上去会造成「关掉视界 ⇒ 满地图的鬼集体定住、永不消散」）。

### D6-3 C · 幽冥物品泄漏（东西跨界，两个方向都走 + 幽冥自生）

A 包做「人」凡 → 幽、B 包做「鬼」幽 → 凡，C 包做**东西**：幽冥有物品，而物品
**两个方向**都走，再加上第三条来源（幽冥自生）。

**来源 / 去向（三条）**

| | 方向 | 落点 | 触发 |
|---|---|---|---|
| ① 跌入者随身带下去 | 凡 → 幽 | 跟着**人的落点** | A 包的 `fallIntoNether` 第 3 步 |
| ② 幽冥自生 | —（在幽冥内） | 冥河窄带（复用 `bankCandidates`） | `stepNetherItems`（零 rng，哈希流） |
| ③ 经缝漏回凡间 | 幽 → 凡 | 凡间可站格（`findMortalSpot`），**落地等捡** | `leakNetherItem`（零 rng，空间距离） |

**容器与记账（复用，零存档结构改动）**

- 物品池复用 **`nether.artifacts`**（`World` 构造器早就给了每个实例一个 `artifacts = []`，
  `serializeWorld` 又把它**整数组**写进存档）⇒ **不动 `save.js` 的结构**就自动往返。
- 四条流水落 **`nether.popLog`**（属 `NETHER_ONLY_KEYS` **整对象**序列化 ⇒ 可安全加键）：
  `itemsSpawned` / `itemsFellIn` / `itemsLeakedOut` / `itemsDecayed`。
  守恒式：**`nether.artifacts.length === itemsSpawned + itemsFellIn − itemsLeakedOut − itemsDecayed`**
  （`netherItemStats().conserved`）。
- 凡间侧对账落 **`world.artifactLog.netherIn`（幽 → 凡流入）/ `netherOut`（凡 → 幽流出）**，
  与上界那两个（`riftIn` / `riftOut`）**分列四键**。凡间守恒律随之扩成
  **`造出 + 流入(riftIn + netherIn) === 在世 + 碎 + 朽 + 流出(riftOut + netherOut)`**。
- ⚠️ **不要**往 `world.riftLog` 加键（那是 `save.js` 逐键显式序列化的 5 键）。

**第三条流**

- `netherItemRngFor(world)`，派生键 **`0x4e49544d`（`'NITM'`）**。与裂隙 / 幽冥缝 /
  凡间鬼影 / 上界 / 幽冥 / mercy **七条两两不同**（F10 逐对钉）。
- ⚠️ `stepNetherRift` 里是**三个独立 `if`**（人跌入 / 鬼爬出 / 物品漏出），
  **不是 `else if`**——写成 `else if` 会让后两支的抽签被前一支的条件吃掉，
  三条流重新耦合，「互不干扰」当场失效（而且不报错）。

**⚠️⚠️ 自生的「随机」是确定性哈希，不是流**

幽冥**没有第二条流可挂**（`stepNether` 是纯函数、零 `rng`），所以自生走
`hash32`（FNV-1a）+ `hashStep`（murmur3 finalizer）。
**必须先过一遍 `hashStep` 再当均匀分布用**：`hash32` 对「前缀相同、只差末尾数字」的
短串有**极强的高位偏置**（实测 `hash32('nether-item:<seed>:0..9')/2^32` 全落在
0.70–0.74 ⇒ 概率阈值恒真、`NETHER_ITEM_CHANCE` 形同不存在、10 个判定点只出 1 件），
而**不报错**。凡间 `stepArtifacts` 用 `rng()` 没有这个问题——这是幽冥专有的坑。

**⚠️⚠️ 铁律三：法宝 id 跨世界必须重赋**

法宝 id 是**世界内**编号（每个 `World` 的 `nextArtifactId` 各自从 1 起）。
跨世界不重赋 ⇒ 「凡间第 5 件」与「幽冥第 5 件」同号，日后 `claimGroundArtifact`
按 id 线性查找会命中**先出现的那一件**（**不报错**）。
⇒ `moveArtifactsToNether`（凡 → 幽）与 `leakNetherItem`（幽 → 凡）**各自重赋**。
⚠️ `save.js` 的 `nextArtifactId` 兜底循环只扫 `world.artifacts` + `entity.artifacts`
（不扫 `nether.artifacts`）——所以 `nether.nextArtifactId` 必须自己进档。

**幽冥名池（§5.6 命名纪律）**

- 新增两个词池在 `core/lore.js`：`NETHER_ARTIFACT_NAMES`（8 名，带 `slots`）/
  `NETHER_TECHNIQUES`（6 名，带 `note`）。
- **刻意避开**考古定名：不含「鬼 / 魂 / 莲 / 符」（幽冥三物 = 轮回莲 / 聚阴符 / 驱鬼符；
  鬼修六级 = 游魂 / 怨灵 / 厉鬼 / 鬼将 / 鬼王 / 鬼帝；魂分五路）——**定名不得另造同义词**。
- 与**凡间**名池（`ARTIFACT_NAMES` / `MANUALS`）**零重名**。
- 幽冥法宝携带一门功法（`a.technique = {name, note}`）：它是幽冥物品的**身份标记**
  （凡间炼出的法宝没有这一字段）。凡人拾到即习得（`giveTo` → `grantTechnique`），
  上限 `TECHNIQUE_CAP = 3`、已会不重复推。
  ⚠️ 推的必须是**名池里的对象**（键集 `{name,note}`）——现场拼 `{name,note}` 会让
  `save-equiv` 的键集并集比对红（读档靠 `save.js` 的 `MANUAL_BY_NAME` 还原同一个对象）。
  ⇒ `MANUAL_BY_NAME` 已扩成 `[...MANUALS, ...NETHER_TECHNIQUES]`。

**自生标定**：`NETHER_ITEM_CAP = 120` · `NETHER_ITEM_PERIOD_DAYS = 30`（与幽冥 10 日
节拍错开）· `NETHER_ITEM_CHANCE = 0.55` · 品阶 / 品质固定档（宝品 / 精良）·
泄漏 `NETHER_ITEM_LEAK_CHANCE_PER_PERIOD = 0.02`。
池满 ⇒ `trimNetherItems` 朽掉**躺得最久**（`lostDay` 最小）的一件并 `itemsDecayed += 1`
（自生与跌入**共用**这一处裁剪，免得两处各写一份而分叉）。
⚠️ **顺序**：先判上限、再抽哈希（池满不该动哈希流，否则「池满」这件事会静默改变哈希序列）。

**编年史**：`KIND_TAG` 新增 `'rift-in' → 'cultivation'`（与 `'artifact'` 同组）。
它是**一件东西**跨界，不是某个人——所以不与 `'rift-lost'` / `'rift-out'`
（那两个落在具体的**存在**身上、归 `person`）混为一谈。

### D6-3 D · 跨位面夺舍（鬼修 → 凡间活人）

A/B/C 三包跨的都是**人 / 鬼 / 东西**；D 包让**鬼修的元神**跨界，住进凡间活人的身体。
判据不再是「谁离缝口最近」，而是**鬼修的阶**——低阶与高阶走**两条完全不同的路**。

**阶位分界（用户裁决 · 承重）**

| 鬼修阶 | 判据 | 做什么 | 鬼修去向 |
|---|---|---|---|
| 怨灵及以下（游魂 / 怨灵） | `level ≤ POSSESS_TIER_MAX_LEVEL`（**20**） | **真夺舍**：元神住进肉身 | **从幽冥消失**（`splice`） |
| 厉鬼及以上（厉鬼 / 鬼将 / 鬼王 / 鬼帝） | `level ≥ 21` | **只暂时附身**：驱使，不夺舍 | **留在幽冥** |

- 动机是「**继续修仙的执念**」：低阶鬼修不甘心，要借一具凡人的身体重修。
- ⚠️ 分界写成 `<= 20`（含 20）而不是 `< 20`：怨灵**正好**是真夺舍那一档（F11/smoke 5q⑰ 用
  `level 20` vs `level 21` 两两对照钉它——写成 `<` 会让怨灵静默掉进「只附身」）。
- 「控制夺舍数量，不能让夺舍者过多」（用户裁决）⇒ `CROSS_POSSESS_CAP = 8`：
  在世被跨位面夺舍者到顶就**不再真夺舍**（`crossPossessedCount` 只数 `mode='possess'`，
  **附身不算**——附身的鬼留在幽冥，不是「夺舍者」）。

**第四条流**

- `netherPossessRngFor(world)`，派生键 **`0x4e505358`（`'NPSX'`）**。与裂隙 / 幽冥缝 /
  凡间鬼影 / 幽冥物品 / 上界 / 幽冥 / mercy **八条两两不同**（F11 逐对钉）。
- ⚠️ `stepNetherRift` 里现在是**四个独立 `if`**（人跌入 / 鬼爬出 / 物品漏出 / 鬼修夺舍），
  **不是 `else if`**——写成 `else if` 会让后几支的抽签被前一支的条件吃掉，几条流重新耦合，
  「互不干扰」当场失效（**而且不报错**）。F11⑥ 用**源码结构**钉它（`if` 恰好 4 个、`else` 一次不出现）。
- 触发概率 `POSSESS_CHANCE_PER_PERIOD = 0.01`（每 30 日一拍）。

**真夺舍 `possessMortal`（零 `rng`）**

- **先落成、再移除**：先写凡人印记，再 `nether.entities.splice` 把鬼修拿掉
  ——反过来会让人「既没得到元神、鬼修又没了」。
- 成功率 = `crossPlanePossessionChance(鬼修阶, normalizeRancor(积怨), 容器阶, 道心)` ×
  `boost`（`isObsessed(鬼修)` × 1.6 · `isHollowSoul(容器)` × 1.4），clamp 到 `[0.05, 0.95]`。
  ⚠️ 用**积怨 `ghostRancor`** 替代 `mind`（鬼修没有道心）。
- 成不成走**确定性哈希**（`hashRoll`，**过 `mulberry32` finalizer**——`hash32` 有高位偏置，
  见 C 包的坑）。失败记 `possessionLog.failed` + 一笔 `record`，**返回 false、肉身毫发无伤**。
- 成功：① 凡人容器**点化**成修士（`awaken`，`level > 0` 时是 no-op）；
  ② 名字加 `·异`（只加一次，防「张三·异·异」）；
  ③ `possessedBy` = **快照**（无 id，永不悬垂）；
  ④ `possessionScar = { mode:'possess', until:-1 }`（**永久**）；
  ⑤ 继承境界（`floor(level × (0.2 + roll × 0.2))`，只写 `level`）；
  ⑥ `possessedOut += 1`（幽冥）+ `crossPlane += 1`（凡间）；
  ⑦ `world.milestone(..., 'possess-cross', target)`（进大事账本 + 受害者个人日志）。

**附身 `hauntMortal`（零 `rng`）**

- 鬼修**留在幽冥**（不 `splice`——它本就能在幽冥走动）；凡人被**驱使**一段日子。
- `possessionScar = { mode:'haunt', until: day + HAUNT_DAYS }`（`HAUNT_DAYS = 360`）。
- 不覆盖更晚的 `until`（正在被附身者不再被选为容器，`pickCrossTarget` 的 `isControlled` 过滤）。
- `haunted += 1`；编年史 `record(..., 'haunt')`（**不传 `actors`** ⇒ 不写个人日志，
  附身不是「这个人身上的大事」）。

**行为锁（凡间侧 · `sim/life.js`）**

- `isControlled(entity, day)` = `possessionScar.mode === 'haunt'` **且** `until > day`
  ——**只认附身**：真夺舍的 `until = -1` 恒假 ⇒ 被真夺舍者**照常行动**（它已是一个修士）。
- 在 `stepEntity` 的**状态机之前**接管：`state='possessed'` + 自己漫游（`possessionWanderRoll`，
  纯哈希、零主流消费）+ `return false` ⇒ 绕过 `findEnemy` 与 `planNext`（与「入魔」同位置）。
- 到期**自动解除**：`until` 一过，`isControlled` 自然为假，闸门失效（不需要清理动作）。

**不良状态字段（`possessionScar` · 新实体列 row[68]）**

- 存**快照对象** `{ ghostName, ghostLevel, day, until, mode }`（**无 id**，铁律三）。
- 实体行总长 **68 → 69**（列**只能追加行尾**——中间插列会顶歪 `row[N]`）。
- 老档（68 列）这一格是 `undefined` ⇒ 读侧逐键兜底成 `null`。

**特殊词条（派生，不入档 · 铁律二）**

- 鬼修侧 `isObsessed`（「执念」，`OBSESSION_RATE = 0.06` / `OBSESSION_BOOST = 1.6`）；
  凡人侧 `isHollowSoul`（「魂虚」，`HOLLOW_SOUL_RATE = 0.06` / `HOLLOW_SOUL_BOOST = 1.4`）。
- 都是 `hashRoll` **现算**（不入档）；缺 id / null ⇒ `false`（不抛错）。
- ⚠️ 频率必须落在率附近：`hash32` 直接当均匀数用会**全落 0.70–0.74** ⇒ 词条恒真/恒假、
  加成形同不存在、**不报错**。⇒ 判定走 `mulberry32(hashString(...))`（过 finalizer）。

**记账与守恒**

- 幽冥 `nether.popLog.possessedOut`（**第四条离开路径**）⇒ 守恒式扩成
  **`鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺`**（`netherEcoStats.conserved`、面板、playtest 10e 同步改）。
- 凡间 `world.possessionLog` 五键：`succeeded / failed / suspected / crossPlane / haunted`。
  ⚠️ 上界与幽冥 payload **刻意 `delete`** 它（那两界不跑 `stepPossession`，恒零）——
  与 `soulLog` 同款。**不要**往 `world.riftLog` 加键（那是逐键显式序列化的 5 键）。
- **三个效果函数全部零 `rng`**（判定节奏的抽签只在 `stepNetherRift`）；F11 用源码结构钉。

**明确不做**：鬼魂夺舍（只有**鬼修**能夺舍——鬼魂没元神去夺）· 夺舍凡人以外的目标 ·
夺舍后继承完整记忆 / 法宝 · 幽冥宗门 / 鬼城。

### D6-3 E · 回归扩展（把 A–D 的四条跨界通道钉进长跑）

E 包**不改任何生产逻辑**——它是把 A–D 新引入的跨包契约钉进**长跑体检**与**回归**。
但它留下了两条**承重结论**（后来人动三界前必须知道）：

**① 幽冥缝的站点必须落在「凡间可站 ∩ 幽冥河带」的格上，否则 C/D 结构性饿死**

- `openRifts` 只把**矩形周长**上的格当候选缝口，而幽冥缝口还必须**同时**满足
  `world.isWalkable`（凡间可站）**且** `netherWalkable`（幽冥可站）。
- 而幽冥的鬼 / 物品**只落在河带格**（`netherBankTiles` = 幽冥可站 ∩ 近河 ≤ `NETHER_BANK_RADIUS` 4）。
  ⇒ 缝口必须落在这个**交集**里，缝半径（峰值 ~5.7 格）才够得着鬼与物品。
- 实测（临时几何探针）：河带 5073 格中**有 2549 格凡间也可站**；把缝口放在重叠格上，
  峰值半径 3.63 格内**有 26 个河带格 + 42 个凡人**。反之用 ±10 的矩形站点（周长离中心 ~10 格），
  半径内几乎无河带格 ⇒ 10 条缝跑 300 年，C=18 但 **D 恒 0**。
- ⇒ longrun 的 `NETHER_RIFT_SITES` 用**1×1 区域**精确落点（见下）。

**② 1×1 区域开缝 ⇒ 消费裂隙随机流 0 次（「不扰动随机流」的可数形态）**

- `openRifts` 用 `riftRngFor(world)` **洗牌候选站点**（与上界缝**共用同一条流**）。
- 但 1×1 区域 ⇒ `cols = rows = 1` ⇒ 候选格恰好一个 ⇒ 洗牌循环
  `for (i = sites.length - 1; i > 0; i -= 1)` **不执行** ⇒ **一次签都不抽**。
- ⇒ 上界缝的位置与「不开幽冥缝」时**逐字相同**。这是 longrun 敢「常年开幽冥缝」的**唯一**依据。
  F12⑥ 用**同种子双世界比对**钉它（一个开 1×1 幽冥缝 / 一个不开，比下一个裂隙流值**逐位相同**）。

**③ 四条跨界通道在真实长跑里的触发量级（判据口径的依据）**

| 通道 | 3 条缝 × 120 年（短跑） | 10 条缝 × 300 年（探针） | longrun 800 年（6 站点） |
|---|---|---|---|
| A 凡人跌入 | 3 | 30 | 见 `STATUS.md` TESTED |
| B 鬼爬进凡间 | 6 | 133 | 同上 |
| C 物品漏进凡间 | 3 | 18 | 同上 |
| D 鬼修夺舍 / 附身 | **0** | **0**（附身 1） | 同上 |

- ⇒ **A / B / C 判存在性（`≥ 1`）**；**D 不判存在性**——它在真实长跑里几乎不触发
  （`pickGhostAtRift` 要「缝口半径内有鬼修」**且**「半径内有凡人」，两者同时成立的时刻极少）。
- D 的**存在性**由隔离世界钉（F11 真夺舍 7 次 / 附身 10 次 · F12 四支同缝 7 次）；
  长跑只钉它的**账本耦合** `possessedOut === possessionLog.crossPlane`。
  ⚠️ 硬写 `D ≥ 1` 会是一条**永远红**的断言——和永远绿的断言一样有害（它训练人去忽略它）。

**④ 长跑新增的守恒 / 对账式（`scripts/inkbox-longrun.mjs`）**

- 幽冥生态 `鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺`（跨包契约 12 的五路径版）。
- 幽冥物品 `在世 === 自生 + 跌入 − 漏出 − 朽`。
- 鬼影两端 `wraiths.length + wraithLog.dissolved === nether.popLog.climbedOut`。
- 跨书三对：`itemsLeakedOut ↔ artifactLog.netherIn` · `itemsFellIn ↔ artifactLog.netherOut` ·
  `possessedOut ↔ possessionLog.crossPlane`。
- 凡间法宝守恒**再扩一档**：`造出 + (riftIn + netherIn) === 在世 + 碎 + 朽 + (riftOut + netherOut)`
  ——幽冥那两条跨位面法宝通道与上界那两条**分列四键**。

**⑤ 回归新增 F12（`scripts/inkbox-three-realms.mjs` · 第十**二**节）**

F8–F11 各测**一条通道**；F12 问的是「四条通道挂在**同一条缝**上时，四本账会不会串」。
十条断言：四支同缝共存（非空性守卫）· 五条守恒 / 对账式同时成立 · 上界零变化 ·
凡间减员全记 `fellIn` · **四支流各被消费恰好 pass 次**（行为侧的「不是 `else if`」判据）·
1×1 开缝不消费裂隙流 · 反向对照（上界缝四支恒 0）· 三支效果函数零 `rng`。

⚠️ F12⑤ 的**前提**：必须同时 `wraith: false` 冻结凡间鬼影 tick——第二条流
`mortalHauntRngFor` **不只**被 `stepNetherRift` 消费，`stepMortalWraiths`（每 10 日一拍）也用它
（`wraiths.js:333`）。不冻结它，这条流的消费次数就**多于** pass 数（实测：只有 `wraith` 那一支否）。

---

## 阶段边界（D6-2 / D6-3 完成 · D7 观察与表现层 A–G 完成 · D8 视界 2.0 A–F 完成）

D6-2 做了一件事：**先让门后的两个世界真正活起来**（上界空间生态 + 幽冥最低生态）。
D6-3 接着做了：**视界与跨界生态**（A 裂隙跨界框架 + 凡人跌入幽冥 → B 鬼进入凡间 →
C 幽冥物品泄漏 → D 跨位面夺舍 → E 回归扩展），A–E 均已完成。

D7 是**观察与表现层**（A 零红基线 → B transient 运行事件通道 → C Camera 2.0 →
D FX 层 → E 记挂系统 → F 关系图与战争线 → G 测试/文档/交接）。⚠️ **D7 不新增任何三界生态、
不改任何三界数值**：它的产物全在表现层（`render/fxLayer.js` · `render/overlayLayer.js` ·
`render/relationGraph.js`）与**玩家的观察者状态**（`sim/watch.js` 的 `world.watch`）。
表现层**不写世界、不抽 RNG、不进存档**——删掉 `render/fxLayer.js`，模拟结果逐字不变；
「记挂」不进三界人口守恒、不影响 AI、不给数值 buff。**三界规则不因 D7 改变**。
D7 A–G **已全部完成并封板**（测试读数见 `HANDOFF.md` §8）。

D8 是**视界 2.0 · 穿透式跨界观察**（A D7 封板 + 视界契约固化 → B 视界模块抽离 →
C 多位面 Presentation Stage → D 窗内内容补全 → E 跨界事件可视化 → F 穿透检视 →
G 跨界追迹 → H 总回归）。⚠️ **D8 只提升可观察性，不改变三界模拟规则**：
不新增三界生态 · 不调裂隙数值 · 不改变裂隙推进语义 · 表现层不写世界 · 不做多视界 ·
不做全图永久另一界模式。视界「是什么、什么不许做」的正式契约在 **`VIEW_CONTRACT.md`**。
**A / B / C / D / E / F 包已完成**：A = D7 封板 + `VIEW_CONTRACT.md` + `npm run test:view`（只钉旧行为，证明 D8 从稳定快照出发）；
B = 视界模块抽离（`ui/realmView.js` + `render/realmViewLayer.js`）；C = 多位面表现舞台（`render/presentationStage.js`，
三界 transient 事件按位面路由，`fxLayer` 变 plane-aware，窗内画目标位面 FX）；
D = 窗内内容补全（`render/realmViewLayer.js` 加 `REALM_VIEW_PROFILE` 位面画像 + `drawGroundArtifacts` 地面法宝 +
`drawRealmYin` 幽冥阴气——**只读**，不改任何生态数值、不改 `main.js`）；
E = 跨界动作「在两边发生」（六类跨界在**成功之后**各发一条 `rift-cross`，**两侧各一条**——离开端在源位面、
到达端在目标位面；形状只在 `sim/presentation.js` 的 `emitRiftCross` 定义一次，**不新造任何跨界概率**；
`render/fxLayer.js` 加 `drawRiftCross`：`depart` 向内收缩 / `arrive` 向外散开——**只读、零 RNG、不改 `main.js`**）；
F = 穿透检视（视界工具手势分两支——**拖动重画视界 / 短点击窗内检视**；新增**只读**纯模块 `ui/realmInspector.js`
（上界人物 / 幽冥鬼魂 / 幽冥物品三张卡）；`main.js` 加 `inspectRealmAt` + `isRealmInspectClick`——
**不复用**凡间 `inspectAt`、**不写** `this.selected`、窗内**无任何按钮**）。
`main.js` **3084 → 2889 行**（仍 < D7 baseline）。
⚠️ 视界仍是**只观察**：`selection` 是 UI 状态（不进存档）· 观察路径够不到任何跨界转移链路 ·
「划开视界」的合法副作用**只有开缝**（`openRifts`），不转移三界人口 ·
**窗内检视也不改任何东西**（不写世界、不抽 RNG、不新建 upper watch、不给任何操作入口）。
⚠️ **跨界事件也一个字都不改模拟**：它只往 transient 队列推（`core/runtimeEvents.js` 的 WeakMap，读档后为空），
**不抽任何 RNG**（八条独立流一条都不动）——删掉整个表现层，三界模拟结果逐字不变。

**这一节的全部规则由 `scripts/inkbox-three-realms.mjs` 自动守**（`npm run test:three-realms`，
**十三节**：时间 / 世界身份 / id 空间 / 上界闭环 / 幽冥闭环 / 存读档 / 裂隙目标 /
凡人跌入幽冥 / 鬼进入凡间 / 幽冥物品泄漏 / 跨位面夺舍 / 三界跨界生态联合 / 跨界发射「成功才发」）。动了三界任何一处，**先跑它**——
它是「本文件不是一纸空文」的兑现方式。

**明确不做**（想到就记 BACKLOG，不施工）：
幽冥宗门 · 鬼城 · 幽冥战争 · 上界大型政治系统 · 上界完整凡界经济复制 · 第四世界 ·
全面轮回重构 · 大规模 AI 行为树 · 复杂寻路 · 跨界战争 · 幽冥入侵 ·
视界复杂视觉特效 · 裂隙平衡大调 · 多视界同时开启 · 全图永久视界 · 大型 UI 重做 ·
`planes.transfer()` 的「架构统一」重写（现有 `arriveUpper` / `enterNether` 已稳定运行，别动）。
