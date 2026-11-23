# MLOD-0B 人口语义合同

基线为 #74 `3772bea8fa7b7ef753770c3a47877e6b461dd3c8`。此模块只读取当前 `world.entities`、`world.upper.entities`、`world.nether.entities`，在独立 Map 内建快照。`buildPopulationCensus(world, phase)` 不写入 World、不消耗 RNG。调用方必须带真实阶段标签；返回值记录 worldDay，不能将同日值视为可复用缓存。同日迁村、改宗、死亡和出生都可改变统计而保持 `entities.length` 不变。新的读接口应在已提交边界重新构建，或在缺少完整写通知时回退现值。

## 来源与谓词

| 读数 | 当前旧逻辑 | 影子字段 |
|---|---|---|
| 村 `pop` | `Life.countVillageResident` 对有效村归属、`hp>0`、非 `_ascended`、`age<lifespan` 的全物种 | `villages[id].legacyVillage.pop` |
| 村 `humans` | 同上再限定 `human/cultivator` 物种 | `legacyVillage.humans` |
| 村 `mortals` | 同上人类且 `!(level>0)` | `legacyVillage.mortals` |
| 村 `adults` | 凡人且年龄≥18×360日 | `legacyVillage.adults` |
| 村 `fertile` | 人类且 18×360≤年龄<50×360日，含修士 | `legacyVillage.fertile` |
| `villageSocieties` | 活着的人类；凡人成年及适育另计 | `villages[id].society`，字段为 humans、mortals、mortalAdults、practitioners、fertileMortals |
| 宗 `followers` | `stepSects` 扫有有效宗门归属的实体，包含未清理的死者 | `sects[id].followers` |
| 宗 `pop` | 上一项中实际修炼的人类且存活 | `sects[id].pop` |

宗门 `followers` 的旧实现没有生存过滤，因此在某些阶段可能包括仍在实体数组里的死者。影子保留这一现状用于 L0。`sects[id].storedCache` 原样记录宗门对象里的旧缓存，绝不由影子写回。`compareCensusToLegacy` 在每次调用时比较缓存。村庄只在 `after-first-village-sync` 阶段要求逐项相等。真实分村路径会先迁户并发出 `after-village-split-membership` 探针，然后才调用 `syncVillagePops`；因此该探针的父村和子村缓存差异属于 `expected-stale`。宗门在 `after-sect-census` 要求逐项相等。其他观察点的差异标为 `expected-stale`，须连同下一次清点结果解释；单个标签不能证明差额已经收敛。真实 maybeSplitVillage 夹具验证迁户后父子缓存暂态、同步后收敛。长测的 `after-advance` 观察阶段和判定保持不变。

`byPlane` 的 mortal、upper、nether 三张表各自遍历对应世界实体。`global` 汇总三个实体列表。`unassigned` 对凡间实体统计缺村、缺宗及无效 ID；飞升标记和死者保留在原始实体数与状态分项，不算存活人口。当前界与原生 World 列表是事实来源，旧版跨界转移的中途重叠必须由阶段探针检测；本模块不会修正或吞掉重叠。

## 独立交叉验证

`node scripts/inkbox-mlod0b-census.mjs` 用原始自然 100/400 年 v11/G8 存档恢复，逐村与原有 `villageSocieties()` 返回值和 `hasMortalResidents()` 比较。影子使用独立的一次实体分组管线，未调用被验证的旧计数函数。实际 100 年档为 540 实体、21 村、3 宗；400 年档为 1,399 实体、44 村、8 宗。400 年旧缓存与实体归属有两项差异，太白剑宗 599/72 对 574/69，扶桑院·三 0/0 对 25/3；两宗总量守恒。详细阶段与首写入见 `MLOD0B_PHASE_AUDIT.md`。

`node scripts/inkbox-mlod0b-census-test.mjs` 通过 29 条边界反例，包括物种/修为分离、非人居民、村宗缺失、死者未清理、18/50 岁边界、人数不变的迁村改宗、跨界汇总、顺序稳定与旧缓存不被覆盖。测试保留原口径差异，例如宗门 followers 可包含未清理死者。所有输入字节摘要和自然档分项保存在 `reports/mlod0b/census.json`。

上界 `UpperLife.stepSects` 的宗门 `pop` 清点所有归宗实体，`followers` 恒为 0。影子另在 `upperSects` 保存这一口径及旧缓存，不以凡间修士谓词解释。`world.generation` 是可变地形代际对象，普查输出中的 `worldGeneration` 保守置空，正式发布代际由读接口提供。无效数值输入下，`syncVillagePops` 与 `villageSocieties` 的旧生存判断并不完全一致，影子分别保持两套谓词，`hasMortalResidents` 又要求有限年龄。此类差异已加入边界测试。
