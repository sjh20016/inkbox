# 万象目录来源

`designCatalog.js` 完整保存父目录 `命簿V02_内容目录.json` 的原始对象，包括原 schema、基线、设计状态、说明、限制和已有 ID。只转换为 ESM 导出，不改原内容。

`experienceTraits.js` 按《坐天观井_经历池V01_机制与落地规格.md》第6节的18项表格重建；原始 experience_content.json 未提供。ID 是本次实现分配的稳定 ID，非声称来自缺失数据包。效果条件、治疗与退出约束保留为定义，是否执行由模拟接线决定。

`daoSeeds.js` 按《坐天观井_命簿V02_UI与机制调整方案.md》第11节完整九祖表重建，均为同阶，使用规范名号。性格与杂趣仅收录该文件第9节明示的示例，不伪造额外原设计。

`catalog.js` 导出只读数组与 ID 查询，不持有世界状态、不使用随机数。`effects` 为无条件数值偏移，`conditionalEffects` 必须由消费者验证具体事实后应用；未知轴不能映射成普通战力。原文仍由 `effectText`/`effect` 保留。根品质、五行通道、变异示例各自独立，23种旧根继续由既有目录管理。

目录的 `implementation: C`、`implemented: false`、空 `consumerRefs` 表示目录本身不证明已接线；完整 A/B 状态须由集成模块给出实际消费者、存档与验证证据。原始 JSON 的实现标识另外完整保留在 `SOURCE_DESIGN` 中。

验证：`node scripts/inkbox-wx-content.mjs`。
