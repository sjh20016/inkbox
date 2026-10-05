# experiments/jobs —— World Laboratory 的 Job 定义
#
# 每个 `.json` 都是一份可直接执行的实验配置（委托书 §7）：
#
#   node scripts/inkbox-experiment.mjs --job=experiments/jobs/<name>.json
#
# ⚠️ 字段名**必须**与 `scripts/experiment/job-schema.mjs` 的 `JOB_KEYS` 一致；
#    多一个字段、少一个字段、拼错一个字段，都会在开跑**之前**报错并 exit 2
#    （委托书 §7：「不静默 fallback」）。
#
# ⚠️ `viewPolicy` 由 profile 钉死（`natural` ⇒ `closed`，`legacy-longrun` ⇒
#    `legacy-duty-cycle`）。想换视界策略，请**新增一个 profile**
#    （`scripts/experiment/profiles.mjs`），不要拿现有名字拧旋钮——
#    那样会得到一个「没有名字的第三种世界」，而报告上仍写着 natural。
#
# 文件一览：
#   smoke-natural.json             1 seed / 10 年   —— 确认工具能跑
#   short-natural.json             1 seed / 30 年   —— 确认输出结构
#   baseline-natural.json          3 seeds / 300 年 —— 正式自然基线
#   baseline-legacy-longrun.json   1 seed / 300 年  —— 与旧 longrun 的条件对照
#   deep-natural-500y.json         3 seeds / 500 年 —— 资源允许时加深
#
# 输出落在 reports/inkbox/experiments/<experiment>/。
