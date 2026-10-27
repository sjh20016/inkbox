# G8-C.1 本轮长测数据档案

本目录是可整体复制、离线复核的固定证据集。来源为2026-10-27唯一一次[Nightly 40460801820](https://github.com/sjh20016/inkbox/actions/runs/40460801820)，长测源码`c3c6852d8fa1d6ccf0d237c16de232a5bfb2bf1a`，基线`4cf7f9fcda3a4ae77bf0e1ef2c20174bc591a2a7`。

800年阶段85/85通过，模拟计时1,968,625ms。Nightly整个job原结论为failure：随后旧smoke为564/565，唯一失败是把万灵局部helper参数u/guard当成事件kind的静态扫描假阳性。后续仅修测试扫描器的`eedb6d7962c24770487ef19644e7f7585efcaf94`独立复验568/568通过、278.205秒；没有再次运行800年，生产代码树保持相同。

## 从哪里读

| 文件 | 内容与用途 |
| --- | --- |
| [FULL_RECORD.md](./FULL_RECORD.md) | 全部800年终局报告、宗门榜、账本、关系、编年史细目、全部原始smoke输出及失败 |
| [G8_C1_LONGRUN_DATA.xlsx](./G8_C1_LONGRUN_DATA.xlsx) | 四张表：8个世纪采样、1,218行断言、运行资料、1,609行组合日志；原始失败仍在 |
| [nightly-data.json](./nightly-data.json) | 本次原Nightly的完整结构化数据：配置、环境、8采样、85长测与565旧smoke断言、4诊断、971行原日志记录 |
| [century-samples.csv](./century-samples.csv) | 18列，8次世纪采样，适合绘图、跨任务比较或数据库导入 |
| [all-checks.csv](./all-checks.csv) | 原Nightly650个正式检查，保留通过/失败、实际值说明、阶段和来源行 |
| [diagnostics.csv](./diagnostics.csv) | 4条带勾的裂缝候选池诊断，不混入85项正式验收计数 |
| [all-records.csv](./all-records.csv) | 原job每行输出、阶段、章节、原始UTC时间和行号 |
| [actions-run.json](./actions-run.json)、[actions-jobs.json](./actions-jobs.json) | GitHub API原始run/jobs响应，包括各步骤结论与时间 |
| [job-122044671390.log.gz](./job-122044671390.log.gz) | API完整job日志的无损压缩，保留setup、800年、旧smoke与cleanup的原始字节 |
| [smoke-followup.json](./smoke-followup.json)、[CSV](./smoke-followup-checks.csv)、[日志](./smoke-followup.log.gz) | 修复后独立本机smoke的568项结果、退出码、耗时、环境和原始输出 |
| [FIELD_DICTIONARY.md](./FIELD_DICTIONARY.md)、[口径CSV](./limitations-and-definitions.csv) | 每列含义、计数与累计量区别、采样边界、缺失项及转义规则 |
| [workbook-delivery.json](./workbook-delivery.json) | 工作簿哈希、源JSON哈希、四表规模及21,025个单元格独立回读核对记录 |
| [manifest.json](./manifest.json) | 每个交付文件的字节数、SHA256及原日志解压后的校验值 |

## 条件与版本

云端Node v24.21.0、npm11.19.0，Ubuntu24.04.5 / ubuntu-latest。北京时间14:23启动、14:59结束；精确原始UTC时间见API元数据。默认medium（288×180）、seed20260914、STEP3游戏日、360日/年；视界`(year-1)%20<5`，上界矩形40×30、幽冥为固定单格站点。完整站点、初始散布、额外5组×14人、辅助种子和12个关键源码blob/固定链接保存在`configuration`。

本机smoke复验为Windows10.0.19045、Node v24.11.1、i3-12100、8逻辑CPU。它与云端800年是两个运行环境；勿把两者耗时混为同一性能样本。

## 完整性与复用

- 原Nightly为85个正式长测断言、565个旧smoke检查、4条非断言诊断；后续568项单独保存。不能将不同阶段相加后宣称“一次800年执行了1,218项”。
- JSON/原始gzip为精确保真源；CSV为UTF-8 BOM，含前后空白的字段加引号。公式标记开头的CSV文本前置单引号，避免导入时被求值。
- 工作簿原始时间戳以文本保留纳秒字符串，带显式单引号前缀；XML不支持的ANSI等控制字符显示为`[JSON escaped] `后的可逆JSON转义。精确原字节仍在JSON/gzip。`=`开头的日志文本保持字符串，不是公式。
- 全部工作表已渲染检查；保存后21,025个单元格的值/类型、冻结窗格、四个筛选表和条件规则均独立回读核对。没有声称在Microsoft Excel原生应用中运行过该文件。
- 未采集的逐拍全量世界、终局全实体快照、全部终局RNG游标、云端CPU型号/峰值RSS等明确列为未采集。数据不能支持这些未观察到的结论。
- 归档不依赖GitHub临时下载链接或Actions日志保留期限；下载整个目录即可长期保存。解压gzip后的SHA256与`manifest.rawLogs`核对，所有其它文件按`manifest.files`核对。
- 上层`.gitattributes`对证据关闭Git文本换行转换，仓库存储和不同系统检出的字节均按同一SHA256清单核对。

主合流裁决见[验收记录](../../G8_C1_MERGE_ACCEPTANCE.md)。本目录保留原始失败及修复后的复验，两者都属于本次交付历史。
