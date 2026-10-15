# B2 · 阶段交付 B：B1 实验工具迁移报告（CP1）

> 《坐天观井》B2 · 世界数值与生态动力学研究 · 委托书 §2
> 状态：**CP1 完成**（2026-10-15）· 分支 `research/b2-world-dynamics`
> 基线：上游 `codex/g2-p0-performance-ecology` @ `e071e832`（待合流，见 B2_BASELINE_AUDIT.md）

---

## 1. 逐模块审计结论（A/B/C/D）

按「语义是否仍成立」而非「能否 import」判定。

| 模块 | 标记 | 结论与处置 |
|---|---|---|
| `experiment/world-factory.mjs` | **B（适配后回收）** | 缺省 v2+standard 仍对齐产品；`createMapProgress` 官方入口未变；`generation` 实况回读逻辑原样保留。唯一注意事项：G2 起 `advanceWorld` 会 `updateMapProgress`，故 `progressive:true` 的 **digest 会变**（CSV 不变）——已写入自检新断言 |
| `experiment/runner.mjs` | **B（适配后回收）** | 薄包装 + `withTunables` 作用域结构原样成立；`advanceWorld` 调用签名向后兼容（G2 仅新增返回位 `mapProgress`） |
| `experiment/job-schema.mjs` | **B（适配后回收）** | JOB_SCHEMA_VERSION=3 的全部字段与 `TUNABLE_NAMES` 依赖仍有效；G2 未改世界生成参数集（`WORLD_PRESETS` / worldgen 逐字节相同） |
| `experiment/collectors.mjs` | **B（适配后回收）** | B0.1 列清单追加式纪律保留；`readTelemetry` 只读契约保留；遥测三键在新基线重新插桩后读数正常（见 §3） |
| `experiment/diagnostics.mjs` | **A（直接回收）** | 纯计算，阈值纪律（观测上限而非硬编码）与基线无关 |
| `experiment/stats.mjs` / `digest.mjs` / `report.mjs` | **A（直接回收）** | digest 走 `serializeWorld`（架构未变）；`configSignature` 机制与基线无关 |
| `experiment/equivalence.mjs` | **A（直接回收）** | 「实验路径 ≡ 产品初始化路径」的比对方法有效；产品路径常量（`0xa5a5a5a5` / `mulberry32(12345)`）在 G2 main.js 未变（自检「源码证据」项通过） |
| `experiment/profiles.mjs` | **B（适配后回收）** | 四 profile 契约保留；`legacy-longrun` 夹具坐标仍按 medium 标定（世界尺寸 preset 未变）。**B2 后续将新增 `host-replay` 语义的实验编排**（§3.1 Host-Replay） |
| `src/inkbox/sim/telemetry.js` | **B（重新插桩）** | 文件本身与基线无关可直接回收，但 **5 个挂点因 G2 改签名全部丢失**，已重新插桩（见 §2.2） |
| `src/inkbox/sim/tunables.js` | **B（重新接线）** | 16 参数默认值逐一核对 = 新基线常量；6 个模拟文件的运行时读值已重新接线（见 §2.3） |
| `scripts/inkbox-experiment.mjs`（CLI） | **A（直接回收）** | 跑通（S0/S1 见 CP2） |
| `scripts/inkbox-experiment-selftest.mjs` | **B（适配后回收）** | 109 项；其中 1 项因 **G2 语义变化**需改判据（`progressive`），已按新语义改写而非放水（见 §4） |
| 旧 B1 `experiments/jobs/*.json` | **D（不迁移）** | Job 名与 `experiment` 字段全部带 `b1-` 前缀，B2 一律用 `b2-` 前缀（G9：同名实验不得互相覆盖） |
| 旧 B1 `reports/` 历史 CSV | **C（仅历史文档）** | 旧世界线产物，语义已失效；不与 B2 数据混合统计（G9） |

## 2. 重新插桩 / 接线的确切位置

### 2.1 为什么必须重做

G2 分支与 B 分支自 `fc612ac` 分叉后各自演进：B1 的插桩**从未进入** G2 线。
且 G2 改了三个相关签名（`initEntity` / `awaken` 去掉 `world` 选项、
`sects.js` 恢复字面量系数），所以不能简单 cherry-pick B1 的 diff。

### 2.2 遥测三键（telemetry.js，WeakMap，不进存档）

| 计数器 | 挂点（新基线文件:行） | 备注 |
|---|---|---|
| `births` | `life.js` spawn 成功出口（`created += 1` 之后） | 四条出生入口（初开/繁衍/建村/pendingSpawns）都汇到 `spawn()` |
| `awakens` | `cultivation.js` `awaken()` 唯一成功出口 | `world` 经**新增的可选第三参**回传（默认 `null` = 不记账，向后兼容）；`initEntity(entity, rng, {cultivator, world})`、`cultivate()`、`divine.js` 神力点化、`possession.js` 夺舍觉醒四个调用点已传 |
| `soulEvictions` | `reincarnation.js` `enterNether` 池满 splice 处 | `takeSoul` 的正常取用不记 |

### 2.3 可调参数（tunables.js，16 项，默认值 = 新基线常量）

接线文件：`life.js`（10 项）、`reincarnation.js`（SOUL_CAP）、
`sects.js`（4 项）、`divine.js`（SECT_FOUNDER_MIN_LEVEL 读值）、
`upperLife.js`（UPPER_POP_CAP）、`netherLife.js`（NETHER_SOUL_CAP）。
数值核对表：POP_SOFT_CAP 1400 / BIRTH_PER_CAPITA_DAY 0.00075 / SPLIT_PER_DAY 0.00016 /
WILDLIFE_TARGET 35 / WILDLIFE_POP_CAP 2200 / BEAST_AGGRO_RANGE 5 / SECT_FOUND_MIN_LEVEL 10 /
VILLAGE_ABSORB_RADIUS 9 / FIELD_YIELD_PER_DAY 0.03 / VILLAGE_CAPACITY_BASE 10 /
SOUL_CAP 120 / SECT_CAPACITY_BASE 10 / SECT_FOUNDER_MIN_LEVEL 10 /
SECT_SPIRIT_STONE_RATE 0.02 / SECT_PROVISIONS_RATE 0.03 / UPPER_POP_CAP 300 /
NETHER_SOUL_CAP 400 —— **16/16 逐位相同**。

## 3. 迁移验收（委托书 §2.5 八条 + 门禁 G1–G5）

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 固定种子重复实验相同 digest | ✅ | CLI 两次跑同 Job，fingerprint 一致（S0 `bd4f108c…`，与独立探针互相印证） |
| 2 | 采集开关 On/Off 不改变 World 与随机流 | ✅ | **双树探针**：纯基线树 vs 插桩树，3 seed × 10 年 digest **逐字节相同**（`bd4f108c`/`36088ea2`/`d8293c0e`）；且插桩树遥测读数非零（births 267/322/375、awakens 40/47/57）证明钩子真的在记 |
| 3 | 无参数覆盖 ≡ 正式默认行为 | ✅ | 自检 §B1-5(A)：「零覆盖 runSeed 与 natural runSeed digest 逐字节相同」；更强的双树探针直接对上游基线证明 |
| 4 | 同一输入两次运行输出一致 | ✅ | 自检 109 项含确定性检查 |
| 5 | 不同地形确实传入产品世界生成入口 | ✅ | 自检「三张不同地图 / v1≠v2 / appliedVersion 读世界状态」 |
| 6 | 参数覆盖不泄漏到下一实验 | ✅ | 自检 §B1-5(C) 作用域隔离（含抛错复原） |
| 7 | 实验异常退出不写标称完整结果 | ✅ | `runSeedSafely` + worker/aggregate 契约自检 |
| 8 | 旧 B1 与新 B2 不因同名实验互相覆盖 | ✅ | Job `b2-` 前缀 + `experimentGroup: b2-s*` |

**产品回归（G10）**：`test:core`、`test:regression`、`test:three-realms`、
`test:save-equivalence`、`test:g2p0`（G2-P0 ecology 15/15）在插桩树上全部 exit 0。
（未跑 GPU/浏览器矩阵——B2 不是性能封板任务。）

## 4. 唯一需要适配的语义变化（记录，不是放水）

**`progressive`（地图渐进开放）**：B1 时代它是纯视觉边界（stage 恒 0）。
G2 起 `advanceWorld` 收尾调 `updateMapProgress(world)`，按游戏日 1/3/6 年解锁
⇒ **digest 会变，但 CSV 读数不变**。自检原断言「跑完 stage 仍为 0」按新语义改为：
建世界时 stage=0；推进 720 日后 stage=1（UNLOCK_DAYS 命中数）；CSV 逐 byte 相同。
判据从「digest」迁移到「CSV」的理由与原版一致：mapProgress 不进模拟状态。

## 5. 本轮边界

- 未迁移旧 B1 的 `reports/`、`.migration/`、大批历史报告（D/C 类）。
- `legacy-longrun` profile 已回收但本轮不使用（B2 的自然基线走 natural；
  Host-Replay 单独设计，不与 Natural-Day 混统计）。

**下一检查点**：CP2（S0/S1 冒烟与基础指标，已在同一工作日完成）→ CP3（S2/S3）。
