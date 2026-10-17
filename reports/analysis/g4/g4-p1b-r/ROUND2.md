# G4-P1B-R2 构建与真实浏览器验收报告

| 项目 | 值 |
|---|---|
| 状态 | `P1B_REVIEW_READY` |
| 日期 | 2026-10-17 |
| 交付分支 | `verify/g4-p1b-r-environment-browser` |
| 固定产品基线 | `f4c05d825467217a95b3c2f9f271e97e9f2b357d` |
| R1 环境阻塞报告提交 | `a0396d1d3005674898e858bb6199b435a728dcf9` |
核对时 `main`：`e1e55039bb56efda7a307513ede07a9fab3bf534`

## 裁断

固定 P1B 源码可以在完整的包输入上构建并通过包审计。真实发布包页面中的 Canvas 和 Three 均运行了产品自己的 `Sandbox.update()` 与原生 `requestAnimationFrame`；V0 默认规则、V3 显式 opt-in、实际槽位存读档、旧档兼容、规则拒绝、世界替换、暂停与笔刷撤销均通过。未发现产品 bug，本轮没有修改 `src/inkbox`，V3 仍是 opt-in。

因此本轮从 R1 的 `ENV_BLOCKED` 收束为 `P1B_REVIEW_READY`。这代表证据可供人工审阅，不代表批准合并、全局开启 V3 或完成 G2 组合验收。

## 固定 SHA 输入、构建与包审计

工作树仍是 shallow / sparse / promisor checkout；本轮没有把完整 Git 历史当作构建前提。按包清单逐项预检后，从 GitHub 固定 ref `f4c05d8` 的文件 API 补回缺失的 26 个被跟踪输入，并将每个文件的 Git blob SHA 与本地 Git 树中的预期 SHA 对照；26 项全部相符。包清单预检的缺失数为 0，`src/inkbox` 相对固定 SHA 无差异。

| 检查 | 状态 | 证据 |
|---|---|---|
| `npm ci` | PASS，exit 0 | Node `v24.11.1`，npm `11.6.2`；安装 1 个包，审计 2 个包，0 vulnerabilities |
| `npm run build` | PASS，exit 0 | 产物目录 `dist/zuotian-guan-jing-inkbox-1.0.0`，411 个文件；生成 ZIP |
| `npm run test:package` | PASS，exit 0 | 411 文件、2 个 GLB、85 个打包脚本目标、101 份 Markdown 文档通过现有审计 |
| 核心包输入 | PASS | `inkbox.html`、规则 dispatcher、静海实现、导入目标、Three vendor 与审计要求的文档均在包内 |

ZIP：`dist/zuotian-guan-jing-inkbox-1.0.0.zip`，3,138,195 bytes，SHA-256 `b85aab1c634ac4e25e5cb48d6b39fadaa3b90bb9c68932b88acc1c0240149fa6`。包内 `hydrologyRules.js` SHA-256 为 `fd5a301a297d018a1ae782a77ee038313058bc9640748152c582fb239640fea1`；`hydrologyStaticSea.js` SHA-256 为 `47d3f33304597a632d68c571594eabbedf31fce7c216b0a249bd8af9635520a6`，分别与固定输入源码相同。

Git clone/fetch 在本轮仍有连接重置；没有依赖未执行的 GitHub Actions 结果。本地固定输入构建和审计是真实执行结果，CI workflow run 为 `NOT_RUN`。

## 浏览器环境与结果

测试打开的是构建目录中的实际 `inkbox.html`，通过只绑定 loopback 的临时静态服务器提供；临时测试 harness 不进入发布包。使用 Codex in-app browser、1366×768、DPR 1。浏览器版本号未由 in-app browser 接口公开；实际 Three WebGL2 renderer 返回 `ANGLE (Intel, Intel(R) UHD Graphics 730) Direct3D11`。这是功能验收，不是 GPU 性能基准。

Edge CDP 的独立临时 profile 路线曾在首条 `Page.enable` 响应前关闭 WebSocket，启动器清理了其所属临时 profile。随后改用 Codex in-app browser 完成全部产品页面验收。测试只使用该临时 loopback origin 和 `slot1`–`slot4`，不访问常用 Edge profile 或玩家存档。逐场景 JSON：[`canvas-r2.json`](evidence-r2/canvas-r2.json)、[`three-r2.json`](evidence-r2/three-r2.json)。可复现 harness：[HTML harness](../../../../scripts/inkbox-g4-p1b-r2-harness.html)、[loopback test server](../../../../scripts/inkbox-g4-p1b-r2-server.mjs)。

| 场景 | 状态 | 实际结果 |
|---|---|---|
| B0 默认 Canvas | PASS | 默认 `legacy-v1`；观测到真实 RAF 与产品 update 增长，并跨过真实水文步长 |
| B1 Canvas 显式 V3 | PASS | 新建 `static-sea-v2` 世界；11,161 个海格边界误差为 0；真实 RAF 推进 |
| B2 规则与世界生命周期 | PASS | V3 后普通 `newWorld()` 创建新实例并回到 `legacy-v1` |
| B3 存档 | PASS | 产品 UI 将 V0/V3 写入独立槽位并分别读回；缺规则旧档回到 V0；未知规则存档被拒，活跃 V3 World 身份不变。预期的损坏档 `console.error` 已单列，无未捕获异常 |
| B4 暂停与笔刷 | PASS | 暂停期间 `hydroAccum` 保持 `0.1116`，RAF 从 132 增至 158；实际浏览器指针落笔改变高度 `0.90073365 → 0.92673367`，产品撤销按钮还原到 `0.90073365` |
| B5 Three | PASS | WebGL2、凡间舞台、默认 V0 和 V3 均通过；V3 换世界后舞台绑定到新 World，海格边界误差为 0，V0/V3 都在真实 RAF 上推进 |
| B6 expanse | PASS | 同种子 512×320（163,840 格）V0/V3 新建分别约 593/599 ms；70,477 个海格中 0 格需要归一、最大水量差 0；height/type/qi 改变均为 0 |
| 页面错误与资源 | PASS | 两个页面无未捕获异常、无非预期控制台错误、无失败资源请求 |

`normalizationCellCount=0` 是本次测量结果：同种子的 V0 创世水层已满足静海边界，因此 V3 准备过程无需改水；没有将此表述成归一化被跳过。

## 源码、提交与边界

- 产品源相对 `f4c05d8`：无差异；`src/inkbox` 未修改。
- 本轮新增只读验收胶水和证据：Canvas / Three JSON、测试 harness 与 loopback server，以及本报告和 `summary-r2.json`。
- R1 的 `REPORT.md`、`summary.json` 未覆盖；`main`、P1B 功能分支未修改；未开 PR、未合并、未执行 P1C。
- 最终验证分支 SHA 在交付后由 Git ref 返回；本报告不嵌入它自身的内容寻址 SHA。最终 SHA 会随本轮交付一并报告。

## 最终四问

1. **固定 P1B 能否构建完整包？** 能。固定 SHA 的全部包输入均经 Git blob SHA 校验，`npm ci`、build、package audit 均 exit 0；ZIP SHA-256 见上。
2. **V0/V3 是否在真实 Canvas、Three 运行？** 是。Canvas 与 Three 的证据均包含真实产品 RAF/update 计数、规则身份和水文步长；Three 使用 WebGL2/Intel UHD 730 D3D11。实际存读档和换世界也通过。
3. **是否发现并修补产品 bug？** 没有。本轮只有 test harness realm 导入问题，调整 harness 后重跑 Canvas 全场景通过；它不是产品缺陷。最新通过结果仍对应原始 P1B `f4c05d8`。
4. **进入 G4 规则裁决 / G2 组合验收还差什么？** 代码和环境不再是阻塞。最近的必要动作是人工审阅并裁决既有规则风险：暂停编辑海面到下一次 V3 tick 才归一、V3 存档水深量化后的微小恢复变化、以及所有低于 `SEA_LEVEL` 的封闭盆地也按静海处理。规则决定后再以确认的规则基线执行 G2 组合验收；本轮不代替该裁决，也不授权合并。
