# G2-P0.3 阶段 B · 植被更新降载试点报告

- 委托书：《坐天观井 / Inkbox》G2-P0.3 §九–§十一
- 产品基线：`codex/g2-p1-integration-validation` @ **`74934a8`**
- 试点分支：`codex/g2-p03-vegetation-pilot` @ `.g2-p03b-worktree`
- 环境：Edge · **ANGLE (AMD, AMD Radeon(TM) 610M, D3D11)** · 1500×940 · DPR 2 · Native
- **裁决：`LOCAL_GAIN_PROVEN_FRAME_GAIN_UNPROVEN` · 建议保留候选（KEEP）**
- 正式 G2 门禁状态：**`G2_PERF_BLOCKED`（未重跑完整矩阵、未改预算）**

---

## 1. 修改文件列表

| 文件 | 差异 |
| --- | --- |
| `src/inkbox/render3d/vegetation/VegetationLayer.js` | +21 / −2 |
| `src/inkbox/render3d/stage/PlaneStage.js` | +4 / −1 |

**产品改动共 2 个文件、+25 / −3 行。** 未新增任何状态字段、未改 World / 存档 / RNG /
水文步长 / 补跑上限 / 生态 / 预算公式 / DPR / 画质。

---

## 2. 代码差异摘要

```diff
// PlaneStage.update()：把已经算好的 heightChanged 如实传下去
-      this.vegetation.update(); this.vegetationPending = false; this.treeClock = 0;
+      this.vegetation.update({ heightChanged }); this.vegetationPending = false; this.treeClock = 0;

// VegetationLayer.update()：不再硬编码强制重写
-  update() {
+  update(options = {}) {
     ...
-    this._reassignAndUpload(true);
+    this._reassignAndUpload(options.heightChanged !== false);
   }
```

**关键观察**：`PlaneStage` **本来就已经算好了 `heightChanged`**（来自 bridge 的
`heightRegion !== null`），而且**已经用 `{ heightChanged }` 传给 entities / settlements /
markers / decorations / realmArtifacts / selectionMarker** —— 唯独植被那两处调用没传。
而 `_reassignAndUpload()` **内部本来就有等价判据**（`changed`：逐 cell 比对 LOD 归属），
只是被 `update()` 里硬编码的 `true` 短路了。所以这不是新增机制，而是**把已有的机制接上**。

---

## 3. 为什么可以跳过原重建（等价性论证）

三条**必须同时成立**，缺一不可：

1. **派生属性与 `veg` 无关**：树木的 `x/y/size/rotation` 全部由
   `cellHash(world.seed, cell, salt)` 决定（`deriveVegetation.js:15`）
   ⇒ 只要树的 **cell 集合相同**，派生属性必然逐项相同。
2. **成员变化一定被抓到**：树集合不同（含 `veg` 跨过生存阈值导致的新增/消失）
   ⇒ `_lodByTree` 的**键集合不同** ⇒ `changed = true` ⇒ 照常重写。
   V03/V04/V05 就是专门验证这条的。
3. **贴地高度只随高程变化**：它走 `elevation.at()`，`veg` 变化不会碰它 ——
   由调用方 `heightChanged = false` 明确保证；高程真变了时调用方传 `true`，
   强制重写（V07 验证）。

另外 `setArtProfile()` / `setLODEnabled()` / `setArtView()` 走各自的强制路径，
不经此处，不受影响（V12 验证）。

**向后兼容**：`heightChanged` **默认为 `true`** ⇒ 不传参时行为与改动前**逐字节一致**
（`refreshGroundLayers()` 正是这种调用，它显式声明地面已变）。

---

## 4. 适用与不适用的条件

| 条件 | 行为 |
| --- | --- |
| 高程未变 + 树木 cell 集合未变 + LOD 归属未变 | **跳过**实例重写与上传标记（本试点目标） |
| 高程变化 | 调用方传 `true` ⇒ **强制全量重写**（贴地必须更新） |
| 树木新增 / 消失 / 成员被替换 | `changed = true` ⇒ **照常重写** |
| Region 裁剪变化导致成员变化 | 同上 |
| ArtProfile / LOD 开关 / 相机尺度变化 | 各自强制路径 ⇒ **照常重写** |
| **不适用**：期望节省 `deriveVegetation` | 本轮**未**优化派生（占 update 的约 38%），见 §8 |

---

## 5. Oracle 结果

### 5.1 新增：`scripts/inkbox-g2p03-vegetation-oracle.mjs` — **14 项全过，退出码 0**

判据是**逐实例逐字节**：每个 LOD 的实例数与可见性、`instanceMatrix`/`instanceColor`
的**有效前缀字节**、`userData.renderTrees` 的**身份与顺序**、`_lodByTree` 逐 cell 归属、
`stats`、包围盒/球、以及 mesh/attribute 的**对象身份**（防静默换池）。

同时每个场景记录**候选是否真的跳过了重写** —— 否则等价性可能因「两边都没跳过」而平凡成立。

| 应当跳过（证明测试打到目标路径） | 应当重写（证明判据不漏） |
| --- | --- |
| V01 同世界连续更新 | **V03 树木新增** |
| V02 微扰但成员未变 | **V04 树木消失** |
| V06 容量上限 | **V05 数量相同但成员被替换** |
| V13 三个位面互不污染 | **V07 高程变化 → 贴地必须更新** |
| V15 多轮后资源身份稳定 | **V08 水位跨越生存阈值** |
| | **V09 Region 裁剪变化** |

其余：V12 ArtProfile 变化 · V14 重建图层（等价于重开渲染器）· V16 世界哈希未变。

### 5.2 既有回归：`scripts/inkbox-g2pf-vegetation.mjs` — **11 项 PASS，退出码 0**

含冻结写入器逐行断言、真实 `WebGLAttributes` 上传协议、LOD0/1/2 等价性、
以及「World and simulation facts remain unchanged」。**产品改动没有打破任何既有断言。**
（该文件里的 `baselineSourceHash` 只**记录**冻结基线，不与当前文件断言。）

### 5.3 未覆盖（如实登记）

`V10 相机缩放改 LOD`、`V11 相机移动改可见优先级` 未单独实现 —— 它们需要
`setArtProfile` + `setLODEnabled(true)` + `artView.camera` 的组合，而这三条已由
§5.2 的既有 oracle 覆盖，本轮不重复造第二套。

---

## 6. 同机 ABBA 实测（Baseline → Candidate → Candidate → Baseline）

同一台机器、同一浏览器/GPU/viewport/DPR/seed/正式 fixture、同一测量脚本、
同一 120 暖 + 90 测。基线跑在未改产品的 `74934a8` 工作树，候选跑在试点分支。

原始数据：
`…-baseA1-…json`、`…-candB1-…json`、`…-candB2-…json`、`…-baseA2-…json`

### 6.1 确定性工作量（不受计时噪声影响 ⇒ 可复现证据）

| 指标 | 基线 A1 / A2 | 候选 B1 / B2 | 变化 |
| --- | --- | --- | --- |
| `matrixWriteCount` | 240,000 / 260,000 | **70,000 / 60,000** | **−74.0%** |
| `matrixNeedsUpdateCount` | 24 / 26 | **7 / 6** | **−74.0%** |
| `fullRebuildCalls` | 24 / 26 | **7 / 6** | **−74.0%** |
| `matrixUploadMs` | 88.5 / 133.5 | **35 / 23.5** | **−73.6%** |
| `glUploadBytes` | 28,386,304 / 32,115,776 | 23,066,304 / 20,096,832 | −21.6% |

**两轮候选独立复现同一量级** ⇒ 满足 §B5「在至少一个真实目标场景中，证明全量重建、
矩阵重写或上传工作量确实减少」。

### 6.2 整机时间指标（**不可辨**）

| | 基线 A1 / A2 | 候选 B1 / B2 |
| --- | --- | --- |
| `frameCpuMs` P95 | 19.3 / **25.8** | 20.7 / **17.1** |
| `frameCpuMs` P99 | 24.6 / 45.1 | 31.4 / 21.7 |
| `rawRaf` P95 | 22.3 / **33.4** | 22.3 / 22.3 |
| `>33.3ms` 帧数 | 1 / **9** | 0 / 0 |
| 水文计数 | 0/0 一致 | 0/0 一致 |

- **同臂 A1↔A2 的 `frameP95` 极差 = 6.5 ms**（A2 那轮 `rafP95` 33.4、9 个 >33 ms 帧）
- 候选 B1↔B2 极差 = 3.6 ms
- 基线均值 22.55 ms vs 候选均值 18.90 ms ⇒ 差 3.65 ms，**小于同臂噪声 6.5 ms**

⇒ **整帧 P95 的改善无法与噪声区分。** 按委托书 §B5：

> 如果热点工作量显著减少，但整帧 P95 暂无改善，可以如实报告「局部优化有效，
> 整机收益未证实」，不应直接宣布 PERF PASS。

**本报告即采用此口径。**

原因清楚：优化只影响**发生 update 的那些帧**（90 帧里 6–7 帧真正重写），
节省的 `matrixUploadMs`（约 23–35 ms/90 帧）摊到每帧不到 0.4 ms；而 P95 由
**确实发生 update 的帧**主导，那些帧仍要跑 `deriveVegetation`、投影与 budget 分配。

---

## 7. 实际资源与 buffer 更新变化

- `fullRebuildCalls` 24→7 / 26→6：**全量重建次数减少 74%**（实例矩阵写入
  240k→70k、260k→60k）
- `matrixNeedsUpdateCount` 24→7 / 26→6：**上传标记次数同步减少 74%**
  （不再对没变的批次标记 `needsUpdate` / `addUpdateRange`）
- `glUploadBytes` 减少约 22%（全部 WebGL 缓冲写入，不止植被）
- **无资源泄漏**：V15 断言 6 轮更新后 mesh / `instanceMatrix` / `instanceColor`
  的**对象身份与容量完全不变**，无池漂移

---

## 8. 已知限制

1. **整机收益未证实**（§6.2）。已知本轮优化覆盖不到的两个大头：
   `deriveVegetation` 约占 update 的 38%（~5 ms/次）、投影选 LOD 约 16%、
   budget 分配约 10% —— 它们仍在每次 update 里跑。
2. **`deriveMs` 的归因不稳**：它由「外层总时长 − reassign 分段」反推，
   而外层总时长本身在轮间波动很大（基线 295.7 / 429.4 ms），故不宜单独引用。
3. **单场景**：ABBA 只在 case 6（Three / expanse / full / 2）上做。case 5 为 Canvas
   且阶段 A 已证其轮间波动更大（曾出现 6/12 假失败），不宜作验收场景。
4. **本轮未重跑完整 12×2 矩阵**，因此**不能**据此更新 G2 门禁状态。
5. `glUploadBytes` 是**全部** WebGL 缓冲写入（拦截 `bufferSubData`/`bufferData`），
   未拆分到植被单项。

---

## 9. 是否建议保留候选：**保留（KEEP）**

依据：

- **正确性**：逐实例字节等价 oracle 14/14；既有植被 oracle 11 项 PASS 无回归；
  World / save / RNG 未变（V16 世界哈希一致）；无资源泄漏（V15）；无新增浏览器错误。
- **性能**：确定性工作量减少 **74%**，**两轮候选独立复现** ⇒ 满足 §B5 的性能判据。
- **未触发任何 §B6 回滚条件**：视觉实例等价、World/RNG 一致、LOD/Region/相机切换
  有 oracle 覆盖、无 GPU 资源泄漏、改动在预定范围内（未碰水文/生态/人物模拟）。
- 「整机收益未证实」**不是**回滚条件 —— 委托书明确允许如实报告该状态。

**同时明确：本候选不改变正式 G2 门禁状态。** 门禁仍为 `G2_PERF_BLOCKED`。

---

## 10. 复现命令

```bash
# 等价性 oracle（14 项，退出码 0）
node scripts/inkbox-g2p03-vegetation-oracle.mjs

# 既有植被 oracle 回归（11 项，退出码 0）
node scripts/inkbox-g2pf-vegetation.mjs

# ABBA 采集（在各自工作树内跑，产品基线/候选分别对应）
node scripts/inkbox-g2-hydro-attribution.mjs --mode=gate --cases=6 --tag=baseA1
node scripts/inkbox-g2-hydro-attribution.mjs --mode=gate --cases=6 --tag=candB1

# ABBA 分析 + 生成机器摘要
node scripts/inkbox-g2p03-abba-report.mjs <A1.json> <B1.json> <B2.json> <A2.json>
```
