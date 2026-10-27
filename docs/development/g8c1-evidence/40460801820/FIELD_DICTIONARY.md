# 字段、来源与统计口径

这是同一种子的一次确定性实验，不是多种子统计或置信区间。全部时间参数为游戏日/游戏年；耗时为墙钟计时。原日志时间戳为UTC，供字节与行号定位，面向阅读的开始/结束时间另按UTC+8展示。

## 世纪采样18列

| 字段 | 单位 / 来源 |
| --- | --- |
| year | 已推进游戏年，100、200…800；每年360日 |
| population | `world.entities.length`，包含其它物种，不能用凡人+修士强行凑总数 |
| villages | `world.villages.length`，沿用Nightly数组计数口径 |
| mortals / cultivators | `world.cultivationStats()`的凡人/修士计数 |
| sects | `world.factions.length`，宗门数；终局各宗门规模另见完整原报告 |
| clans / clanMembers | `clanStats(world).clans / members`，世家数和族人规模 |
| upper.population | 上界`entities.length` |
| upper.mortals | 上界符合`isUpperMortal`判据的此刻人数 |
| upper.bornMortal | 上界`popLog.bornMortal`累计凡人生育；不是修士化生`popLog.born` |
| upper.awakened | 既有Nightly逐年观察：上一年还是凡人，今年仍在且level>=1的累计转变；没有声称捕捉同一年内发生又消失的所有转变 |
| artifacts.live / held / ground | `artifactStats(world)`的凡间在世/在手/地面法宝数，完整三界账本另见断言与原报告 |
| idIssues | 年度边界观察到的问题记录数，最多保留10条；本轮全为0。逐位面同一集合覆盖地面和实体持有法宝；不同位面仍是独立ID空间 |
| sourceLine | 原API job日志的1起行号，非清洗后Markdown行号 |
| timestamp | 对应G8_SAMPLE日志的原始UTC字符串，保留小数精度 |

## JSON结构与检查

`configuration`固定种子、尺寸、步长、时间表、裂隙站点、初始输入、命令及源码blob。`environment`保留setup输出与已知缺口。`workflow`是原run及步骤状态，整体failure原样保留。

`acceptance`是脚本原样输出的G8_ACCEPTANCE区块；`samples`保留每条G8_SAMPLE及来源行/时间，二者已逐字段交叉核对。`checks`有650条正式检查：85条longrun和565条smoke；`diagnostics`另存4条有勾号但不属于验收数组的候选池诊断。

检查列`passed`为布尔量。`detail`是断言当时输出的实际计数、守恒等式及边界，未把它改写成预计值。`phase`区分longrun、smoke及独立smoke_followup；每个阶段的`sequence`只在该来源内有意义，定位优先使用文件名+sourceLine。`raw`与原日志文字一致。

原smoke第288个检查失败，来源第645行，内容是动态kind豁免审计的u/guard假阳性。修复后568项结果在独立文件中，没有覆盖旧值。原样本的原始job日志共971行；工作簿加上独立复验后共1,609行，其中包含空行、命令、环境与清理输出，不能将行数解释为模拟事件数。

`records.section`是限定阶段的实际标题识别标签，供检索；原始事实始终由text、timestamp、jobId和line定位。setup阶段不会把Ubuntu版本号当章节。`records.text`保留原文，CSV兼容的前导/尾随空白已加引号；工作簿的XML控制字符与时间戳转义见README和workbook-delivery.json。

## 时长与性能

800年`elapsedMs=1968625`为原脚本模拟计时。job时间包含checkout、安装与后续smoke；后续独立smoke的278.2046621秒来自本机单独计时。三个时长有不同边界，不能直接互换。

名义推进日数288000、名义advance调用96000由固定参数计算，不是新增硬件计数器。连续水文按既有Nightly约定未执行。没有GPU/FPS、逐帧时延、峰值内存、云端CPU型号或多种子方差数据；缺失不能按0解释。

## 精度与保真源

JSON和gzip日志保存原字符串/原始字节。CSV为便于常见工具导入的文本表示；以`=`、`+`、`-`、`@`开头的文本加单引号，不能当作游戏数值变化。工作簿保留数值与布尔类型；UTC原字符串以前置单引号防止Excel自动转换并丢小数精度。ANSI ESC等XML不允许字符以前缀`[JSON escaped] `加JSON字符串转义表示，原字节仍可从gzip或JSON取回。

`manifest.json`不包含自身哈希，包含其余每个文件的字节数和SHA256；`rawLogs`另列gzip解压后的原始长度与SHA256。`workbook-delivery.json`保存工作簿对应源JSON哈希。需要核验或做后续研究时，以这些固定文件为输入，不依赖已经过期的Actions下载地址。
