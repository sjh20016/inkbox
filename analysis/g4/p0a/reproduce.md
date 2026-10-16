# G4-P0-A R2.1 复现

本分支包含测试脚本、R2 算法原样副本、逐帧压缩 JSONL、失败轮次及裁断报告。正式有效结果位于 `analysis/g4/p0a/results/formal-02/`；`formal-01/` 是保留的事件触发点失败记录，不能与有效数据混算。

## 环境与附件

使用 Node 22+（已验证 Node `v24.11.1`）和已安装 Edge/Chrome。运行前确保浏览器可由宿主启动，且当前用户可连接本机 127.0.0.1 CDP。无需安装 Playwright、Puppeteer、打包器或其他新依赖。

```powershell
git -c core.autocrlf=false clone --branch analysis/g4-p0a-hydro-ablation https://github.com/sjh20016/inkbox.git inkbox-g4
Set-Location inkbox-g4
npm ci
git fetch origin
git status --short --branch
git merge-base HEAD origin/main
```

从用户委托附件中取出嵌套的 `G4-PERF-天地有度-R2.zip`，放在仓库根目录或 OS temp；输入 SHA-256 必须为：

```text
f7f99fdf50e36f590c328d730aad49e507815260e8a40e1a08bd96efe52efe43
```

不把 ZIP 放入发布目录；仓库 `.gitignore` 已忽略它。运行器会自行验证 ZIP 内 `G4-PERF-R2/g4lab/lib/variants.mjs` 与 `analysis/g4/p0a/reference/variants-r2.mjs` 的字节一致。不得手工改写 R2 变体。

## 运行正式顺序

先执行规定的最小静态、core 和 adapter 检查：

```powershell
Get-ChildItem scripts/inkbox-g4-p0a-*.mjs | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
npm run test:core
node scripts/inkbox-g4-p0a-smoke.mjs
```

完整的 S0 → A/A → ABBA → V1/V9 → S2 → 条件 S3 命令如下。每次使用新的 `--out` 目录，运行器拒绝覆盖已存在的 manifest：

```powershell
node scripts/inkbox-g4-p0a-run.mjs --suite=all '--r2-zip=G4-PERF-天地有度-R2.zip' --out=analysis/g4/p0a/results/reproduction-01
```

正式运行会先校验 `origin/main` 可读，记录 `baselineSHA=git merge-base HEAD origin/main`、远端跟踪 SHA 和 runner HEAD。若 `origin/main` 已移动，先检查六个受保护的模拟/渲染文件与浏览器适配边界；若产品导入、主循环或规则已漂移，不要用旧 adapter 强行继续。

默认由 Edge/Chrome 有窗口运行，不加 `--headless`。脚本精确要求 CSS viewport `1366×768`、DPR `1`，通过启动缩放参数与 CDP 共同设置，并将页面、visual viewport、CDP layout、实际 canvas 逐次存档；它不会放宽视口阈值。硬件加速判据需要产品 WebGL2 renderer 和浏览器 SystemInfo 同时支持；软件渲染结果不能获得 `GO_P1_REVIEW`。

## 复核产物

主 manifest 与 provenance 位于 `analysis/g4/p0a/results/reproduction-01/`。先运行汇总器：

```powershell
node scripts/inkbox-g4-p0a-stats.mjs --out=analysis/g4/p0a/results/reproduction-01
```

它会重新计算每份压缩文件 SHA、解压内容 SHA、帧数和分位数。可独立复核单条记录：

```powershell
node --input-type=module -e 'import fs from "node:fs"; import {gunzipSync} from "node:zlib"; const raw=gunzipSync(fs.readFileSync("analysis/g4/p0a/results/reproduction-01/s1-abba-1.jsonl.gz")).toString("utf8"); for(const line of raw.trim().split("\n")){console.log(JSON.parse(line));}'
```

最终裁断以 `manifest.json` 的阶段状态、A/A、ABBA 配对、S2 事件有效性和报告门槛为准，不以命令退出码单独判断。相邻 RAF 帧不是独立重复；GPU timer query 属于独立诊断，不与 S1 主轮混池。`GO_P1_REVIEW` 只意味着可另行评审 P1，不授权实施。

本次实际有效目录为 `results/formal-02/`，状态 `GO_P1_REVIEW`；逐帧输入/输出散列、设备信息、45 次 viewport 检查、V0 Oracle、绑定指纹、Canvas/群岛 fixture 与 GPU 查询都在该目录。S2 旧步 35 触发点的完整失败数据留在 `results/formal-01/`，其诊断解释为什么雕刻点固定到步 25；失败样本没有删除。更早原委托启动失败、S0-R 修复尝试及其原始版本也都保留在各自 `attempt-*`、`s0r-recovery-*` 目录。

最终报告在 `analysis/g4/p0a/p0a-report.md`。受保护产品路径相对 BASE SHA 无改动；不运行 P1 代码，不创建或合并 PR。
