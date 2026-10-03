# M2-C S0.1 当前测试基线

记录时间：2026-10-03（Asia/Shanghai）  
工作区：`E:\world4\坐天观井-实验分支D1`  
口径：本次从当前工作树重新运行命令；所有 13 个命令均以独立退出码记录。详细 stdout/stderr、逐命令状态和机器可读汇总见 [`reports/release/render3d-m2c/baseline-gates/`](reports/release/render3d-m2c/baseline-gates/)。

## 结果

| 检查 | 命令 | 实际计数 / 结果 | 退出码 |
|---|---|---:|---:|
| 核心 | `npm test` | 导入检查：91 个文件、303 条导入边；core 与 startup 检查通过；runtime events：13 项 | 0 |
| View | `npm run test:view` | 113 项断言 | 0 |
| Intervention / regression | `npm run test:regression` | 22 项 | 0 |
| Presentation | `npm run test:presentation` | 127 项断言 | 0 |
| Render3D M0 | `npm run test:render3d` | 19 个 invariant groups | 0 |
| Render3D M1 | `npm run test:render3d:m1` | 36 项断言 | 0 |
| Render3D bridge | `npm run test:render3d:bridge` | 36 项断言 | 0 |
| Render3D M2-A | `npm run test:render3d:m2a` | 13 个 invariant groups | 0 |
| Render3D M2-B | `npm run test:render3d:m2b` | 69 个 invariant groups | 0 |
| Vendor | `npm run test:vendor` | 13 项断言 | 0 |
| Three realms | `npm run test:three-realms` | 151 条通过标记；末尾报告“三界生态不变量成立” | 0 |
| Save equivalence | `npm run test:save-equivalence` | 173 条通过标记；末尾报告“读档瞬间结构完整” | 0 |
| Build | `npm run build` | 成功；生成 v1.0.0、203 个文件 | 0 |

不同脚本使用“断言”“不变量组”或逐条通过标记等不同计数单位，不合并为一个总测试数。日志中没有发现 warning、失败标记或错误输出。

## 未覆盖范围与备注

本基线没有运行浏览器 smoke / UI 自动化；M2-C 主任务由主代理单独执行浏览器验证。该结果只描述上述命令在本机当前工作树的执行情况。

运行前工作树已存在美术素材相关删除；这些文件是用户现状，本次没有恢复或改动。构建命令成功并生成 `dist/zuotian-guan-jing-inkbox-1.0.0` 与 ZIP 包。

## M2-C 收口门禁

最终14项命令行门禁（含自动 build）全部退出0，见 `reports/release/render3d-m2c/gates/gate-results.json`。新增M2-C检查在真实UpperLife推进下比较600日完整World SHA-256；既有断言保持。图形/GPU另走Edge验收，不计入上述命令行计数。

首次并发收口在三界长测中触发机器内存分配失败（Node `Zone Allocation failed`），本地服务器也被终止；未发生断言失败。清理本轮隔离的headless Edge测试树后，三界与存档长测单独重跑通过。首次日志按 `*.allocation-failure.txt` 保留，汇总记录重跑原因和退出码。个别重跑有npm版本更新提示，未升级任何依赖。

## Edge 浏览器收口

| 门禁 | 实际结果 | 退出码 |
|---|---|---:|
| 原 Canvas playtest | 144 项通过、0 项失败 | 0 |
| 原 M2-A 浏览器门禁 | 上界/幽冥各 80 个样本；零偏差、零越屏，分类仍为 32/32/16 | 0 |
| M2-B 浏览器门禁 | 17 张图；上界 173、幽冥 238、界缘 94 次拾取，条件成立 | 0 |
| M2-C 浏览器验收 | 32 张标准图与 manifest；零 shader/runtime 错误；生命周期与 RT/depth/MSAA 探针通过 | 0 |
| M2-C 独立稳定性检查 | 6000 帧；资源/profile/完整 World 指纹稳定；GPU 分类取样及局部上传回读通过 | 0 |

浏览器机器可读汇总见 `reports/release/render3d-m2c/browser/browser-results.json`，M2-C 原始结果见 `evidence.json` 与 `soak-evidence.json`。

发现并记录一处既有测试漂移：M2-A oracle 未纳入 M2-B 的可见界缘。原样 oracle 在 Art 关闭和修改前 `c159629` 源码副本上均出现相同六个偏差（上界4/幽冥2）。补齐独立 Raycaster 的界缘几何与边缘解码后原门禁通过；所有原采样与退出断言保留，新增严格界缘身份/端点/距离/交点比较。生产拾取器没有改动。首次失败日志、诊断与复验全部保留；重复诊断 PNG 保留本地 `reports/m2c/archived-m2a-diagnostics/`，不重复纳入发布包。
