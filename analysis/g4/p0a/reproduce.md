# 复核 G4-P0-A R2.1

本次裁断为 INCONCLUSIVE：S0 在两轮修正后仍因视口护栏失败停止。没有有效 A/A、ABBA 或逐帧性能结果。先复核已归档证据；重新执行不会得到已验证的性能跑分承诺，也不授权继续修复或 P1。运行器的 S1–S3 路径尚未经过实际运行验证。

## 获取交付与安装既有依赖

Windows PowerShell，Node 22+（本次为 24.11.1，需要内置 WebSocket），已安装 Edge/Chrome：

```powershell
git -c core.autocrlf=false clone --branch analysis/g4-p0a-hydro-ablation https://github.com/sjh20016/inkbox.git inkbox-g4
Set-Location inkbox-g4
npm ci
```

不安装 Puppeteer、Playwright 或其他依赖。服务器只监听 127.0.0.1，不使用用户现有浏览器 profile。不需要任何模型私有目录。

clone 时显式关闭自动换行转换，以保持附件原样副本及已记录 SHA-256 的字节一致。不要对 reference 文件另做格式化或换行转换。

从附件将原 `G4-PERF-天地有度-R2.zip` 放在 OS temp 或仓库根（`.zip` 已被原 gitignore 忽略），勿把 ZIP 放入发布目录。算法原样副本和勘误已随分支提供。运行器直接检查 ZIP 内 `G4-PERF-R2/g4lab/lib/variants.mjs` 与副本的字节一致性，不接受自写变体。

## 先复核已有原始记录

```powershell
node scripts/inkbox-g4-p0a-stats.mjs --out=analysis/g4/p0a/results
Get-Content analysis/g4/p0a/results/s0-checkpoint.json
Get-Content analysis/g4/p0a/results/attempt-03/failure.json
Get-Content analysis/g4/p0a/results/verification/verification.json
```

stats 命令验证每个压缩文件的 SHA-256、解压后内容 SHA-256、帧数与可用统计。这里三条记录的 samples 都应为 0，summary 为 null；它们是原始启动失败记录，不能据此计算性能分位数。

独立检查一份压缩原始记录：

```powershell
node --input-type=module -e 'import fs from "node:fs"; import {gunzipSync} from "node:zlib"; const raw=gunzipSync(fs.readFileSync("analysis/g4/p0a/results/startup-attempt-03.jsonl.gz")).toString("utf8"); for(const line of raw.trim().split("\n")){console.log(JSON.parse(line));}'
```

最小规定检查：

```powershell
Get-ChildItem scripts/inkbox-g4-p0a-*.mjs | ForEach-Object { node --check $_.FullName }
npm run test:core
node scripts/inkbox-g4-p0a-smoke.mjs
```

最后一条只检查 localhost 响应、语法、唯一 import 替换与 native 原字节，不代表浏览器 S0 已通过。失败版本以 `.mjs.txt` 保存，只供阅读，不应拿来执行。

## 运行入口和停止行为

一条完整条件流水线命令（应使用新的 out 目录，已有 manifest 时拒绝覆盖）：

```powershell
node scripts/inkbox-g4-p0a-run.mjs --suite=all '--r2-zip=G4-PERF-天地有度-R2.zip' --out=analysis/g4/p0a/results/reproduction-01
```

仅 S0：

```powershell
node scripts/inkbox-g4-p0a-run.mjs --suite=smoke '--r2-zip=G4-PERF-天地有度-R2.zip' --out=analysis/g4/p0a/results/smoke-reproduction-01
```

支持参数只有 `--suite=all|smoke`、`--r2-zip=<path>`、`--out=<fresh path>`、`--browser=<installed executable>`、`--headless`。本次使用有窗口模式，未传 headless。请在能连接本机 CDP 的宿主环境运行；本次沙箱 CDP 失败也已保留，不能把权限失败写成算法失败。输出应放 `analysis/g4/p0a/` 或 OS temp，勿放正式产品目录。

`all` 的设计顺序为 S0 → A/A（超限最多完整重测一次）→ 固定 ABBA → V1/V9 短诊断 → S2 → 满足明显收益条件时 S3。任一关键失败会停止后续阶段。退出码 0 表示 S0_PASS、GO_P1_REVIEW 或 NO_GO 之一，仍须阅读 manifest；其他裁断退出码为 2（部分宿主 wrapper 实际返回 1，以 JSON 裁断和错误记录为准）。**本任务已耗尽两轮修正额度；手动重复启动不重置额度。**

每段计划 120 RAF 预热、600 正式间隔；短诊断 300。分位数为 nearest rank，阈值比率用严格大于；主轮与 GPU/CPU 包裹诊断不混池。代码没有修改产品 RAF 循环；唯一服务器响应改写是 hydrology import。参数与测量计划存在不表示它们已经执行成功。

## 对照基线与范围

本次产品 BASE_SHA 为 `e1e55039bb56efda7a307513ede07a9fab3bf534`。交付分支的后续提交仅新增白名单文件；运行器也记录执行时 HEAD 和六个产品 blob，可与根 provenance 对照。若要做新的最新主线实验，应先 fetch 并按委托书检查 BASE_DRIFT；本交付不能对未来 main 自动保证适配。

```powershell
git diff --name-status e1e55039bb56efda7a307513ede07a9fab3bf534...HEAD
git status --short
```

差异应仅为 `scripts/inkbox-g4-p0a-*.mjs` 与 `analysis/g4/p0a/**`。没有 PR、合并、产品规则开关或存档迁移步骤。
