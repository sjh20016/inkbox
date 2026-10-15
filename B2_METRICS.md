# B2_METRICS · 指标定义、来源、数据等级与解释限制

> 对应委托书阶段交付 C。本文件是 `scripts/experiment/` 采集体系的**唯一口径说明**：
> 每一列写清「它是什么、从哪儿来、单位、缺失时是什么、不能拿去说什么」。
>
> 版本：B2（基线 `codex/g2-p0-performance-ecology` @ `e071e832`）
> 采集器版本：`COLLECTOR_VERSION = 1.1.0`（`scripts/experiment/collectors.mjs`）

---

## 0. 三条总纪律

1. **只用一份世界状态**。所有指标读的都是同一个 `world` 对象（产品序列化后的那份）。
   不存在「第二份世界状态」，也不存在为实验单独维护的镜像账本。
2. **追加式列清单**。任何 CSV 的新列一律加在**末尾**，永不改名、永不删列
   ⇒ 旧 CSV 永远是新 CSV 的前缀子集。插列会让「新旧报告看起来都正常」而实际错位。
3. **四种缺失不是一回事**。`null`（结构上不该有）/ `''`（不可得）/ `0`（真实零值）/
   机制不存在，在 CSV 里**形状不同**，分析时不许互相替代。

---

## 1. 产物清单与代际

| 文件 | 列数 | 生成方 | 采样频率 | 代际 |
|---|---|---|---|---|
| `timeseries.csv` | 131 | `collectors.mjs` → SNAPSHOT_COLUMNS | 年（`snapshotDays`，默认 360 日） | v1.1.0 |
| `probes.csv` | 18 | `collectors.mjs` → PROBE_COLUMNS | 30 日（`probeDays`） | v1.1.0 |
| `fate.csv` | 25 | `fate-queue.mjs` → FATE_COLUMNS（前两列 seed/day 由 report 加） | 年，绑定快照 | **两代** |
| `fire.csv` | 31 | `fire-probe.mjs` → FIRE_COLUMNS | 年 + 事件点 | 一代 |

### fate.csv 的两代（必须会分辨）

- 一代：23 列（`... lastAliveDay, note` 结尾）。
- 二代：25 列（追加 `heartDemon`；并修正了 `realm` 列的标签 bug，见 §5.1）。

判别方法：`summary.json` 的 `fateQueue.columns` 记的是**本次运行实际使用的列清单**。
两代混在一份分析里会让 `heartDemon` 列读到上一代的末尾列——**不报错，只是全错**。
本仓库在跑完正式 B2-2 后已统一为二代；旧一代文件请勿与之合并。

---

## 2. 数据等级（委托书要求逐指标标注）

| 等级 | 含义 | 本项目的主要来源 |
|---|---|---|
| `direct` | 直接读正式 World 状态 | `world.entities` / `villages` / `sects` / `dead` / `over` / `veg` / `fire` / `souls` |
| `derived` | 由 direct 可靠计算 | Gini / HHI / share / p10 / 均值 / 方差 |
| `instrumented` | 经**验证过不扰线**的实验遥测 | `telemetry.js`（WeakMap）+ `lifeRng` 计数闭包 |
| `unavailable` | 当前无法可靠获取 | 见 §6 |

**instrumented 的合法性证明**：B0.1 双树探针（插桩树 vs 纯基线树，3 seed × 10 年
`serializeWorld`  digest 逐字节相同）；B2 又在 300 年 × 3 seed 上复现了一次
（`b2-fate-300y` 与 `b2-baseline-natural-300y` 的 fingerprint 逐字节相同，
同一 Job 只差 `fateQueue` 一个纯采集字段）。

---

## 3. 四级分类总表

### 3.1 存量（stock）

| 指标 | 单位 | 等级 | 来源 |
|---|---|---|---|
| `popTotal` / `popMortals` / `popCultivators` | 人 | direct | `world.entities` 按 level 分 |
| `popWild` | 只 | derived | total − mortals − cultivators |
| `popCivil` | 人 | direct | 红尘计数（`life.js` 的 civil 标记） |
| `villageCount` / `villagePopulation` | 座 / 人 | direct | `world.villages` |
| `sectCount` / `sectPopulation` | 个 / 人 | direct | `world.sects` |
| `sectSpiritStoneTotal` / `sectProvisionsTotal` | 灵石 / 粮草 | direct | sect 库存字段 |
| `leylineTotal` / `leylineControlled` | 道 | direct | `world.leylines` |
| `soulPool` | 魂 | direct | `world.souls.length` |
| `upperPopulation` / `netherGhosts` / `wraithAlive` | 个 | direct | 各自位面实体表 |
| `foodMin/Mean/Max/P10/P90` | 村仓 | direct | 聚落 food |
| `qiMean/Min/Max` | 0–1 | direct | 灵脉网格 |
| `artifactLive` / `artifactOnPeople` / `artifactGround` | 件 | direct | 法宝表 |
| `clanCount` / `clanMembers` | 个 / 人 | direct | 家族表 |

### 3.2 流量（flow）——**只用事件账本**

| 指标 | 单位 | 等级 | 来源 |
|---|---|---|---|
| `popBirthsCum` | 人 | instrumented | `telemetry.births`（`life.js` spawn 成功处） |
| `popAwakensCum` | 人 | instrumented | `telemetry.awakens`（`cultivation.js` awaken 返回 true 处） |
| `popDeathsCum` | 人 | direct | `world.deadLog.total`（necrology 维护，进存档） |
| `popAscendedCum` | 人 | direct | `world.deadLog.ascended` |
| `popEvictedCum` | 条 | direct | `world.deadLog.evicted`（**名册淘汰**，不是死亡） |
| `soulPoolEvictedCum` | 魂 | instrumented | `telemetry.soulEvictions`（池满 splice 处） |
| `upperArrivedCum` / `upperBornCum` / `upperDiedCum` | 个 | direct | `upper.popLog.*` |
| `netherBornCum` / `netherDiedCum` / `netherEvictedCum` | 个 | direct | 幽冥账本 |
| `warDeclaredCum` / `warResolvedCum` / `warDestroyedCum` / `warCasualtiesCum` | 次 / 人 | direct | `war.js` |
| `clanFoundedCum` / `clanEndedCum` | 个 | direct | 家族账本 |
| `artifactForgedCum` | 件 | direct | 法宝账本 |
| `lifeRngDrawsCum` | 次 | instrumented | `world-factory` 的 lifeRng 计数闭包 |

⚠️ `popDeathsCum − popEvictedCum` = `world.dead.length`（不变量，自检钉死）。
⚠️ `popEvictedCum` 是**名册淘汰**：necrology 是有限滚动窗（300 年实测末态约 800 条），
   把「老记录被顶掉」当成「没死过人」是经典误读。

### 3.3 结构（structure）

| 指标 | 等级 | 说明 |
|---|---|---|
| `popCultivatorShare` / `popCultivatorShareCivil` | derived | 修士占比；后者以红尘人口为分母 |
| `realm0Count … realm6Count` | derived | 境界分层（7 阶） |
| `sectPopGini` / `sectPopHHI` | derived | 宗门规模集中度 |
| `leylineTopOwnerShare` / `leylineOwnerGini` | derived | 灵脉控制权集中度 |
| `soulDistinct` / `soulConflicted` / `soulRemembered` | derived | 魂池构成 |
| `soulRoute*` | derived | 魂路分布（自然/徘徊/鬼/怨/散） |
| `popHighestLevel` / `popHighestRealmName` | direct | 全球峰极 |

### 3.4 恢复（recovery）——**必须保存时间序列**

| 指标 | 单位 | 等级 | 来源 |
|---|---|---|---|
| `burning` | 格 | direct | `world.fire[i] > 0.01` |
| `fireSum` | 强度×格 | direct | `world.fire` 求和 |
| `scorched` / `ash` / `lava` / `ruins` | 格 | direct | `world.over` 逐值计数 |
| `vegSum` / `vegInRect` / `vegOutsideRect` | 密度和 | direct | `world.veg` |
| `rectScorched` / `rectAsh` | 格 | direct | 观测窗内覆盖层 |
| `struct` | 格 | direct | `world.struct > 0` |
| `villagesInRect` / `villageHpMin` / `villageHpSum` / `villageFoodSum` | 座 / 点 | direct | `world.villages` |
| `disasterMilestones` / `disasterChronicle` | 条 | direct | 世界自己的事件账本 |
| `overlayCells` | 格 | derived | 非 NONE 覆盖层格数（**宿主 RNG 抽签数的代理**） |

⚠️ 恢复层只能在**宿主真实时间**下完整发生（`decayOverlay` 只在 `main.js` 的
2.5s 时钟里跑）。只推进游戏日 ⇒ 焦土永不转灰烬 ⇒ 「灾后 100 年仍是焦土」是假象。
B2-5 用 `fire-probe.hostReplay()` 逐帧复刻宿主累加器，见 B2_RESEARCH_REPORT §B2-5。

---

## 4. 缺失处理

| 情形 | CSV 写法 | 理由 |
|---|---|---|
| 字段结构上不该有（如死者的 `hp`） | `''` | 空 ≠ 0 |
| 本轮采集未开（如没开 `fateQueue`） | **整个文件不写** | 只有表头的 CSV 像「跑过了没人」 |
| 遥测无记录 | 零值副本 | `readTelemetry` 只读，无记录返回零值，不建条目 |
| 机制不存在（如自然局无跨界的 `riftCrossedCum`） | `0` | **真实零值**：机制在，只是没触发 |
| 尚未实现的机制 | 不建列 | 不许为「将来可能有」预先占列 |

---

## 5. 已知解释限制

### 5.1 `realm` 列曾经全错（已修）

B2-2 一代 `fate.csv` 的 `realm` 列写成「炼气NaN层」：`realmLabel()` 收的是**等级**，
调用点误传了 `realmFor(level)` 的返回对象。二代已改为 `realmLabel(level)` 直传，
并加了自检断言（活体境界列不得含 `NaN`）。你若看到 `NaN` 字样，那是一代文件。

### 5.2 `level` 会下降 —— 这不是 bug

`cultivation.js:applyBreakthroughFailure`：突破失败有 50% 退一层 / 30% 跌回本阶 /
20% 走火入魔。所以命运队列里观察到「46 → 39」是**真实机制**。
分析时不许假设 level 单调递增（`maxLevelSeen` 才是单调的那个）。

### 5.3 死者不带 `heartDemon`

necrology 记录里没有心魔字段 ⇒ 二代 CSV 中死者的 `heartDemon` 为 `''`。
心魔只是**活体**上可证的失败史残留。

### 5.4 necrology 的 `cause` 只有三值

`飞升 / 寿终 / 殁`。⇒ **雷击死在名册里与普通死亡同形**，灾难死亡归因
不能靠名册，必须走三层链（见 B2-5 的 `attributeStrike`）。

---

## 6. `unavailable` 清单（当前无法可靠获取）

| 想知道的 | 为什么不可得 | 影响 |
|---|---|---|
| 分物种（修士/凡人/兽/灵）的**出生与死亡**拆分 | `telemetry.births` 只在 spawn 出口计一次，不记身份类别 | 答不了「修士出生率 vs 凡人出生率」；不影响 cap 判读 |
| 死者 → 新魂的身份继承 | 代码里只有 `soulId`（id 级同魂转世）；姓名映射被委托书禁止 | 队列成员死后记 `unavailable`，不猜 |
| 宗门资源的**消耗/流出** | 未实现（B2-3 的核心发现：只有流入没有流出） | 只能报库存轨迹，不能报周转率 |
| 火灾次生死亡（饥荒/聚落废弃）与雷击直接死亡的拆分 | 名册 cause 三值；需要人口轨迹差作上界 | B2-5 明确分两层报，不合并 |
| 宿主时间下的完整覆盖层恢复曲线（无头环境无法真实等待） | `decayOverlay` 挂墙钟 | 用 `hostReplay` 复刻累加器近似，已在报告中标注为复刻 |

---

## 7. 版本与混合禁令

- `configSignature` 覆盖：profile / preset / viewPolicy / 生成版本与地貌 / 干预 /
  参数覆盖 / **fateQueue** / years / step / snapshot / probe / seeds。
  两个只有队列不同的实验签名不同 ⇒ 不会互相静默覆盖。
- `collector` 语义若变化 ⇒ `COLLECTOR_VERSION` +1，且**禁止**跨版本报告静默混合。
- fate.csv / fire.csv 的代际判据在各自的 `summary.json` 里（`fateQueue.columns` /
  `FIRE_COLUMNS`）。
