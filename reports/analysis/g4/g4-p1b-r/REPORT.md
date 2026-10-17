# G4-P1B-R 完整环境复验与浏览器封板报告

状态：ENV_BLOCKED
日期：2026-10-17
验收分支：verify/g4-p1b-r-environment-browser
受测 P1B 基线 / head：f4c05d825467217a95b3c2f9f271e97e9f2b357d
执行前远端 P1B：f4c05d825467217a95b3c2f9f271e97e9f2b357d
执行前远端 main：e1e55039bb56efda7a307513ede07a9fab3bf534
Checkout: E:/world4/坐天观井-实验分支D1/.worktrees/g4-p1b-hydrology-rules-optin
OS: Windows_NT, Microsoft Windows NT 10.0.19045.0；PowerShell 7.6.5
Node: v24.11.1；npm: 11.6.2

## 裁断

S0 未能取得可复用的完整 checkout，按委托立即停止；本轮没有运行 npm ci、build、package audit、CDP 或产品浏览器验收，也没有用此前 P1B 任务的失败结果替代本轮结果。P1B 源码没有改动，main 和既有 P1B 分支均保持原 SHA。本分支只记录环境阻塞证据。

## S0 取证

原 P1B worktree HEAD 为固定 SHA f4c05d825467217a95b3c2f9f271e97e9f2b357d，开始时 git status --porcelain 为空。它不是完整 checkout：core.sparseCheckout=true、git rev-parse --is-shallow-repository=true、remote.origin.promisor=true；sparse patterns 只有 reports/analysis/g4、scripts、src/inkbox、tests。

以下构建相关路径在 Git 索引中可定位；磁盘状态如下：

- .github/workflows/ci.yml：已物理存在。
- 美术素材/参考资产索引.md：被 git 跟踪，但在工作树中缺失。
- package-lock.json、vendor/three、inkbox.html、src/inkbox/main.js：物理存在。
- src/inkbox/sim/hydrologyRules.js 与 hydrologyStaticSea.js：物理存在。

操作记录：

1. 对现有 partial checkout 执行 git fetch origin，exit 128：GitHub HTTPS 连接被重置。
2. GitHub API 独立核验远端 refs：main 仍为 e1e55039bb56efda7a307513ede07a9fab3bf534，P1B 仍为 f4c05d825467217a95b3c2f9f271e97e9f2b357d。
3. 首次完整 clone，使用系统 Schannel，exit 1：SEC_E_NO_CREDENTIALS。
4. 按该错误进行唯一一次有原因的环境复验，显式切换 OpenSSL，clone 在约 41 秒后 exit 1：Recv failure: Connection was reset。目标目录 .worktrees/g4-p1b-r-full 未留下。
5. 未在原有 dirty 工作区做清理、reset 或覆盖；未启动浏览器或服务进程。

## S1–S3

- npm ci：NOT_RUN，S0 完整 checkout 失败后按停止条件终止。
- npm run build：NOT_RUN。
- npm run test:package：NOT_RUN。
- 包产物内容核对：NOT_RUN。
- CDP 与临时 profile 诊断：NOT_RUN。
- Canvas、Three、真实 RAF、存档交互、B0–B6：NOT_RUN。
- 512×320 expanse：NOT_RUN。
- 浏览器环境仅盘点：Edge 路径 C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe，版本 155.0.4283.45；两个常见 Chrome 安装路径均不存在。未启动浏览器，因此无 CDP 端口、WebSocket、renderer 或清理结论。WebGL 硬件状态未验证。

## 改动与下一步

相对固定 P1B SHA，src/inkbox 无差异；本验收分支只新增本目录下的 REPORT.md 与 summary.json。git diff --check 在提交前核验。没有 PR、合并、产品源码修改或性能结论。

解除 ENV_BLOCKED 的最小条件：在有稳定 GitHub Git HTTPS 访问的环境中，对固定 P1B SHA 建立非 shallow、非 promisor、非 sparse 的完整 checkout；确认美术素材/参考资产索引.md 等构建输入实际落盘后，再从 S1 开始。不要重跑已经通过的 P1B A–H/core/regression/save-equivalence/realms/qol 历史门禁。
