# 坐天观井 Inkbox G2-P1 集成验证报告

结果：**READY**。判定只基于双 renderer 正式 viewport + 真实交互循环通过、实际退出码 0、owned IPC server、清理完成且浏览器错误为 0。

| 验收面 | 实测 |
|---|---|
| Navigation | exit 0；完成 |
| Viewport | 10/10 checks；exit 0；report pass true |
| 真实交互循环 | 10/10 checks；exit 0；Canvas+3D complete coverage true |
| Battle observation | canvas:2, 3d:2（要求每 renderer 两次） |
| READY 条件 | bothRendererFormalPass=true; actualExitCode0=true; completeRendererCoverage=true; battleObservationMatchesTwice=true; ownedIpcServer=true; cleanupComplete=true; browserErrorsZero=true |

Three 真 UI 测试先选择人物再通过自然推进造成受伤，避免真实宗门遮挡导致错误选取。早期三轮失败和后续修复保留在 raw proof；早先 partial/preselect 单 renderer 通过不作为正式验收。

基线 e071e832e78857fc9de84cf6af2ca78764717330；实测 P1 HEAD 1a36e1bcc5d20b787bacebc98d30b72df45fc70c。Edge 155.0.4283.45、AMD Radeon 610M / driver 32.0.13050.18、DPR 1；Canvas 与 3D 各覆盖 1500x940, 1366x768, 1280x720, 960x800, 680x720。

八张本次 Edge 代表截图（其余原图留在 ignored proof）：

- [3d-1280x720.png](./reports/release/g2p1-integration/golden/3d-1280x720.png) — SHA-256 `b0028e604b96d6b64f54ca82b421caebb2454c5670d98e795584cc3d317d50f1`
- [3d-680x720.png](./reports/release/g2p1-integration/golden/3d-680x720.png) — SHA-256 `4a18ee50e63133e126f0612d0fb2ac155c66402807d2f1b5c880a33fbe0e0c08`
- [3d-loaded-world.png](./reports/release/g2p1-integration/golden/3d-loaded-world.png) — SHA-256 `fca8d68494d1257643efe40448ba3ce0a9696e08f3bf232f3348ef1c451668cb`
- [3d-real-burn-observation.png](./reports/release/g2p1-integration/golden/3d-real-burn-observation.png) — SHA-256 `35c289a8eb2a744846d605d0bae7c04c2a936b01dfc6e5ff9681df1ed9293129`
- [3d-real-injury-watched.png](./reports/release/g2p1-integration/golden/3d-real-injury-watched.png) — SHA-256 `3236dc2a4491874b4d9b08d6eae0dde2f4c9456db2b2777735fa82d15f66e5de`
- [canvas-1280x720.png](./reports/release/g2p1-integration/golden/canvas-1280x720.png) — SHA-256 `e7c0481f068c456e76dc800cd7c9012c3abc518484cd7eb62be3e3e1e6e501bd`
- [canvas-960x800.png](./reports/release/g2p1-integration/golden/canvas-960x800.png) — SHA-256 `b6febb3d4dd640184c6127598a90e5ca80f8c6b8c243ec82eb2089aea0772063`
- [canvas-real-injury-watched.png](./reports/release/g2p1-integration/golden/canvas-real-injury-watched.png) — SHA-256 `123a3a57cece668c4cc96c919ed488b6a982843c9c53cc8057be6248f71bfb93`

READY 仅代表 P1 集成验收。P2 最终 Native/Controlled 矩阵仍有性能长尾失败；前台 Canvas 证据起始 OS 窗口归属无效，不能判作正式前台通过；旧真实玩家存档样本缺失。

源码栈已有正常 merge 990d740 from 33f91c6，后续正常 merge 984；没有改写 main 或历史 PR。交付为 [Draft PR #12](https://github.com/sjh20016/inkbox/pull/12)，base 为 [性能专项 #11](https://github.com/sjh20016/inkbox/pull/11) 的分支。最终交付 HEAD 见 PR head SHA 及本报告所在提交；PR 描述记录最终 SHA。建议先解决上游性能阻塞，再按 #8 → #9 → #11 → P1 集成的依赖顺序审查，#12 承接 #10 有效改动，不重复合入两条 UI 线；本轮不正式合流。

## 运行包

本地 `npm run build` 与 `npm run test:package` 均 exit 0，共471个文件。原始 proof、逐帧数据、Trace和代表截图只保留开发仓库；运行包包含精简摘要和报告，缺省开发图像引用由既有打包策略转换为开发资料说明。交付后仅更新文档与打包元数据，无需重跑GPU矩阵。
