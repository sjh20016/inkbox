> ⚠️ **B2 迁移注记（2026-10-15）**：本文件随 B1 实验工具迁移到 B2 研究分支
> （基线 `e071e832`，codex/g2-p0-performance-ecology）。迁移动作仅为**重新插桩**
> （telemetry / tunables 的 import 与调用点），16 个参数的默认值已逐一与
> 新基线常量核对，逐位相同。历史章节中的 B1 实验数字仍指旧世界线，**不可**
> 与新基线digest直接对比（ecology/life 等 11 个 sim 文件已变）。
> B2 的新结论以 `docs/B2_RESEARCH_REPORT.md` 为准。

# TUNABLES · 可调参数注册表（B1-5 参数敏感性机制的底座）

> 这个文件回答两个问题：
> ① **有哪些平衡常量可以被实验覆盖**（以及它们的默认值 / 单位 / 已知行为）；
> ② **新增一个可调参数要改哪儿**。
>
> 机制本身在 `src/inkbox/sim/tunables.js`；本文件是它的**使用与维护说明**。

---

## 一、它为什么存在

B1-5 要回答「世界对哪个平衡常量最敏感」。这需要能**在两次运行之间**改变
`POP_SOFT_CAP = 1400`、`SOUL_CAP = 120` 这类常量，但 B0/B1 的边界又**禁止**
「改源码常量跑实验」——那样会让产物的 `sourceRevision` 与实际行为不一致，
且「改完忘记改回来」会**静默**污染后续所有实验。

所以做法是一个**注册表 + 作用域覆盖**：

```
REGISTRY（唯一真相：name → default）        src/inkbox/sim/tunables.js
        │
        ├── 模拟代码读 tunable('POP_SOFT_CAP')   （读数，不是常量）
        │
        └── 实验层 withTunables({...}, fn)       （一次运行内的临时遮蔽）
                    │
                    └── fn 返回/抛错后必然复原     （默认值一个字节没改）
```

**三条不变量**（`npm run test:experiment` 钉死）：

| 编号 | 不变量 | 自检怎么证明 |
| --- | --- | --- |
| §B1-5(A) | **零覆盖 ≡ 默认** | 300 日 world digest 与 natural 逐字节相同 |
| §B1-5(B) | **未知键当场抛错** | `tunable('POP_SOFTCAP')` 抛错；覆盖表里的未知键抛错 |
| §B1-5(C) | **作用域隔离** | 退出 `withTunables`（含抛错 / 嵌套）后读值必复原 |

---

## 二、当前登记的参数

`default` **必须**与该参数在重构前的模块级常量**逐位相同**——改动 `default`
就是改动世界，必须在报告里显式声明并重跑全部基线。

| 参数 | 默认 | 单位 | 来源 | 备注 |
| --- | --- | --- | --- | --- |
| `POP_SOFT_CAP` | 1400 | 人 | `life.js` | 全世界生灵总量「软」上限。**B1-1/B1-3 已证明它表现得像硬约束**（注入 900 人后仍精确回到 1400）。 |
| `BIRTH_PER_CAPITA_DAY` | 0.00075 | births/person/day | `life.js` | 每名村民每天的生育期望。凡人寿元约 4200 天，维持人口需 ≈2.4e-4，取 7.5e-4 留冗余。 |
| `SPLIT_PER_DAY` | 0.00016 | prob/village/day | `life.js` | 满员村子每天分家外迁的概率（约合每 30 年一次）。 |
| `FIELD_YIELD_PER_DAY` | 0.03 | food/tile/day | `life.js` | 每田每天产出。B1-1 观测到粮食长期过剩（`food_high_floor`）。 |
| `VILLAGE_CAPACITY_BASE` | 10 | 人/村 | `life.js` | 村庄人口上限 = `BASE + 等级 × 10`。 |
| `VILLAGE_ABSORB_RADIUS` | 9 | 格 | `life.js` | 村庄吸纳流民与自愈的半径。 |
| `WILDLIFE_TARGET` | 35 | 只 | `life.js` | 荒野灵兽目标存量。 |
| `WILDLIFE_POP_CAP` | 2200 | 只 | `life.js` | 灵兽总量上限。 |
| `BEAST_AGGRO_RANGE` | 5 | 格 | `life.js` | 灵兽领地半径：超出即停止追杀。早先不限距离时九十头灵兽能在四十年内把人口吃干净。 |
| `SECT_FOUND_MIN_LEVEL` | 10 | 级 | `life.js` | 开山立派最低境界（life.js 侧判定）。 |
| `SOUL_CAP` | 120 | 魂 | `reincarnation.js` | 神魂池上限。B1-1/B1-2 观测到长期贴顶并持续逐出（`soul_pool_saturation`）。 |
| `SECT_CAPACITY_BASE` | 10 | 人 | `sects.js` | 宗门容量基数。 |
| `SECT_FOUNDER_MIN_LEVEL` | 10 | 级 | `sects.js` | 开宗立派最低境界（sects.js 侧判定）。 |
| `SECT_SPIRIT_STONE_RATE` | 0.02 | 1/day/收入点 | `sects.js` | `spiritStone += 收入 × dtDays × 此值`。B1-2/B1-3 观测到后段仍单调增长（`possible_missing_sink`）。 |
| `SECT_PROVISIONS_RATE` | 0.03 | 1/day/村 | `sects.js` | `provisions += 村数 × dtDays × 此值`。**纯增长，无消耗**（唯一「消耗」是 starving 的稳定度惩罚，不扣粮草）⇒ 疑为「缺汇」。 |
| `UPPER_POP_CAP` | 300 | 人 | `upperLife.js` | 上界（非凡人）人口上限。 |
| `NETHER_SOUL_CAP` | 400 | 魂 | `netherLife.js` | 幽冥鬼魂总量上限。 |

> ⚠️ 这张表是**手工同步**的（把 `REGISTRY` 的 `note` 摘出来）。
> 权威来源永远是 `src/inkbox/sim/tunables.js`；改动后请顺手更新本表。

---

## 三、怎么用

### 3.1 Job 文件（云端批跑的主入口）

```json
{
  "schemaVersion": 3,
  "experiment": "sens-popcap-1200",
  "profile": "sensitivity",
  "preset": "medium",
  "generationVersion": 2,
  "terrainPreset": "standard",
  "seeds": [20260914, 7, 424242],
  "years": 300,
  "stepDays": 3,
  "snapshotDays": 360,
  "probeDays": 30,
  "viewPolicy": "closed",
  "parameterOverrides": { "POP_SOFT_CAP": 1200 }
}
```

```bash
node scripts/inkbox-experiment.mjs --job=experiments/jobs/sens-popcap-1200.json
```

### 3.2 命令行（试跑）

```bash
node scripts/inkbox-experiment.mjs \
  --profile=sensitivity --seeds=20260914 --years=300 \
  --parameterOverrides='{"POP_SOFT_CAP":1200}'
```

### 3.3 配对口径（Control vs Treatment）

```
Control   = profile natural        （零覆盖；digest 与 B1-1 基线逐字节相同）
Treatment = profile sensitivity    + 非空 parameterOverrides
```

判据是「Treatment − Control」把**被覆盖的那个参数**孤立出来。
「零覆盖 ≡ 默认」这条不变量保证 Control 走的确实是自然线。

---

## 四、新增一个可调参数要改哪儿（检查清单）

1. **`src/inkbox/sim/tunables.js`**：往 `REGISTRY` 加一条
   `名字: { default, unit, note }`。`default` = 那个常量**当前的值**（逐位）。
2. **常量定义处**：把 `const X = 42;` 改成一句读取——
   例如 `const X = () => tunable('X');`，并把所有使用点从 `X` 改成 `X()`。
   ⚠️ 若使用点很多，先确认没有把它当**编译期常量**用的地方（数组长度、默认参数等）。
3. **若该常量原本被 `export`**（如 `reincarnation.js` 的 `SOUL_CAP`）：
   保留 `export const SOUL_CAP = <default>` 作为**默认值**（别处可能 import 它），
   但模拟内部改用 `tunable('SOUL_CAP')`。**不要让 import 方也走 tunable**——
   那会把「读注册表」这件事扩散到调用方，反而漏掉作用域。
4. **跑 `npm run test:experiment`**：至少确认
   ①「注册表默认值 = 重构前的常量」那条仍通过；
   ②「零覆盖 ≡ 默认」的 digest 逐字节相同（这条会抓住**任何**读数被改错的值）。
5. **更新本文的表格**（§二）。
6. ⚠️ **不要**为了「让某个实验好跑」而改 `default`——那违反 B0/B1 边界。
   覆盖是实验层的事，默认值是设计层的事，两者别混。

---

## 五、边界与已知限制

- **只覆盖「读数」，不覆盖「结构」**。注册表能让世界读到不同的数，但不能
  新增资源、改规则、换算法。B0/B1 的「不改模拟规则」依旧成立。
- **覆盖对 `generateWorld` 不生效**（世界生成读的是地形参数，不是这些常量）。
  这没问题：世界地形由 `generationVersion` / `terrainPreset` 控制，与平衡常量正交。
- **本阶段不改任何默认值**。B1-5 的交付物是**候选改动建议**
  （见 `B1_SENSITIVITY_REPORT.md`），改默认值需人工拍板，不在本阶段范畴。
