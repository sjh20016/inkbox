# G1 正式集成验收

2026-10-09 · 分支 `integrate/g1-gameplay-shell`，目标 `main`。主轴未修改。

- BASE_SHA：`fc612ac9470b48aaaa3291b7fc39a9e0bdf87fff`
- Runtime：`65bd61419df566d71b62e6a082e18a7c7c3ed90e`
- Presentation：`e66b1f6c69ed6b240ad34207538ef087fa4437b7`
- 完整合流提交：`79c9133`、`0d85f36`；验证代码：`732a94b`。
- 原工作区的历史文档整理及未提交委托书保留；隔离 worktree 完成实施。未合入 B 数值分支。

## 正式行为

Canvas 和 Three PlanePicker 的真实人物身份进入同一 G1 controller。正式 `createCharacterCardView` 显示命簿、修行、改命、生平；修为、需求、速度及百分比来自模拟。记挂、寻踪、传记、关系和三种敕令经正式命令入口，成功置脏/刷新，失败显示真实原因。

权限由 Runtime 派生；支持记挂容量与故人撤销、跨界状态、真实定位与锁区重检。展示仅收到冻结值快照；换选、关卡及读档销毁旧监听。生平显示残卷边界，记挂近况接可靠死亡/飞升名录，避免日志截断遗漏后仍标已读。

`g1/worldRuntime.js` 单向映射地图 stage 0–3 到 40/60/80/100%，创世信息取真实 seed、地貌及幅员，旧档按全境/旧地貌显示。请求开拓重新检查世界及阶段，再走原扩图/缓存/未保存护栏。左下引导可收起、重开并在换世界后保留会话选择，帮助可关闭和重开。

## 验证

| 检查 | 结果 |
| --- | --- |
| CI Fast 对应全部 31 项、本轮修复后定向重验 | 通过 |
| regression / three-realms / save-equivalence / G1 longrun | 通过 |
| G1 runtime / host / map / web / integration | 20 / 6 / 6 / 61 / 9，通过 |
| 真实 Edge 完整交互 | 9/9，通过 |
| build / test:package | 通过；CSS、源码和新测试随包 |
| 独立审查 | 记挂近况 P2 已修复并复查关闭，无剩余发现 |

命令：`npm run test:g1`、`test:g1:longrun`、`test:g1:browser`，以及现有 Fast/Heavy 和 `npm run build`、`npm run test:package`。逐项退出码与环境见 [compact 指标](reports/release/g1-integration/summary/g1-integration.json)。

Edge 154.0.4258.62，1440×1000，Intel UHD Graphics 730 / D3D11，驱动 32.0.101.7088。页面身份、非空画面、无错误覆盖、console/runtime 无错误、截图和实际交互均通过。Tabbit diagnose 退出 69，按委托书使用仓库 Edge CDP 驱动；本阶段不作性能达标声明。

真实闭环覆盖：同名重叠人按 ID 选择 → 四卷 → 记挂/三敕令 → 修为与真实日志更新 → 传记/关系 → 存读档/文件导入 → 旧按钮拒绝；幽冥窗口 Canvas/3D 选择；Seed 0/群山/渐进 40→60% → 未保存保护 → 引导与帮助重开 → Canvas/3D 切换。

初次 QoL 门禁因旧手写卡路径断言失败，已更新为正式组件回调并加强权限检查，116 项通过；浏览器脚本曾重复切换引导导致预期状态不符，修正操作顺序后全部通过。未删测试或降低断言。

## 代表截图与交付边界

[Canvas 敕令](reports/release/g1-integration/golden/canvas-edicts.png)、[真实地图成长与引导收起](reports/release/g1-integration/golden/canvas-world-progress.png)、[3D 幽冥人物](reports/release/g1-integration/golden/3d-nether.png)。

本地门禁成立；远端 CI 与 PR 状态以对应 GitHub 链接为准。G2.1 必须从这条集成分支的验证结果继续，不直接合 main。移动端和其他浏览器未在本轮验收。
