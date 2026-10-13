# G2.1 战斗显形交付与验收记录

2026-10-12 · `feat/g2-combat-presentation-codex`，PR 暂以 `integrate/g1-gameplay-shell` 为基线。G1 已验收；G2 的正式功能、浏览器和工程检查通过，完整 CPU 性能预算尚未全部通过，保留草稿 PR，暂不封板。

| 版本 | 实际 SHA / 状态 |
| --- | --- |
| 初始主轴 BASE | `fc612ac9470b48aaaa3291b7fc39a9e0bdf87fff` |
| 同步时最新 main | `06e03b8943b7337d0d430cac0e532c321a3ae4b2`，新增方向文档 |
| 已验证 G1 代码 | `5f13f038c37a36529d5aa788164df76555a498fb` |
| G1 最终 head | `a462632430898271e4c911c2955ff6835b9dbad2`，代码同上一行；[PR #2](https://github.com/sjh20016/inkbox/pull/2) Fast / Heavy 均通过 |
| G2 生产代码 | `8ef436b177ef04f314c06c129a30d957eb59ef41`；交付 head 由 G2 PR 及终回复记录 |

事件源 `845417d`、Canvas `b1d16ae`、3D `f0f4aa5`、窗口归属与诊断 `b4bbb3a`、方向文档同步 `2891202`、近距离可辨性 `8ef436b` 分开提交；浏览器 / 性能门禁 `c8aad3c` 与最终证据另行提交。隔离 worktree 开发，原工作区资料移动和未提交文件保留；未合入 B 数值实验，未修改 main。

## 正式接线与边界

`Life.attack()` 在原有减伤和真实 HP 扣减后调用 `emitCombatHit`。越距、零扣血及已死目标不产生命中；属性读取、构造与发射均受异常边界保护。原有伤害、养伤、Mercy、因果、死亡及 RNG 顺序保持。

`combat-hit` 为纯值：plane/day、目标 XY、真实 subjectId/targetId、有限 intensity 和 `data{style,fromX,fromY,tier}`。style 为 blade/fire/thunder，tier 为 low/mid/high。火依真实火灵根，雷依真实雷根名或既有 thunder 功法；通用墨痕只提示攻击。事件没有 entity/World/DOM/Mesh 引用，也不进存档。

源、开关、计数及每日采样位于 WeakMap；每世界每游戏日最多选 24 个定向 pair。选择即收费，满队列或发射失败也不反复构造；采样不抽签，不改变真实攻击冷却。队列总 256、战斗最多 64；战斗不能挤掉重大事件，重大事件满队列先驱逐战斗。

Canvas 与 3D 共用唯一 `PresentationStage.ingestWorlds` 消费器。墨痕 / 火 / 雷寿命为真实秒 .35 / .5 / .7；FX 总 64、战斗 32、单个位面战斗 16；相同 pair/style 合并。接收、入场、合并、丢弃与驱逐均可审计，接收数守恒。Canvas 依真实实体 XY 和原地形投影，按位面、访问范围与屏幕过滤。

`ThreeFxProbe` 只读深冻结 `snapshotPlane`。`ThreeCombatFx` 每个位面构造三个共享 geometry/material/InstancedMesh，合计最多 32 个活动笔触、增加最多 3 draw calls。沿用 PlaneStage 坐标、高程及完整占地归属；近重合命中展开为真实中心的局部墨点，保留方向、深度遮挡和完整裁剪。真实渡劫优先占池，既有雷光尺度保留；旧调试环不承担战斗美术。无逐命中新建 Three 对象。

顶部“战斗墨痕”只关闭战斗表现。换根世界、读档、导入清旧 FX；子世界替换只清对应界。切渲染器保留同一世界的寿命；闭窗清隐藏实例，换 World 与 dispose 释放旧池且幂等。上界、幽冥当前没有个人近战结算，本轮保持这一事实；上界沿既有 UpperLife 瓶颈突破产生真实 tribulation。

## 验证

| 检查 | 结果 |
| --- | --- |
| 命中源、真实 Life / AI、纯度、预算、真实上界渡劫 | 9 组通过 |
| Canvas / Stage 给定事件、真实秒、保护预算、生命周期 | 8 组通过 |
| Three 几何、完整裁剪、近接展开、固定缓冲、资源释放 | 8 组通过 |
| 现有 Fast / Heavy 命令 | 原 35 条最终通过；含独立表现复验共 36 个命令，最终渲染调整另复验四入口 |
| G1 正式浏览器回归 | 9/9 通过 |
| G2 原生硬件浏览器 | 12/12 通过，无 console / runtime / GL 错误 |
| 独立只读审查 | 无剩余功能 P1/P2；5,216 种几何矩阵实际顶点在声明占地内 |
| 原生时钟性能 | 完整 12×4，CPU 11/12、RAF 12/12，真实 exit 1 |
| 同画面受控性能 | 完整 12×4，CPU 11/12、RAF 12/12，真实 exit 1 |
| 正式 build / test:package | 通过；418 文件、90 本地脚本入口、103 文档、两份正式 GLB |
| G2 远端 Fast / Heavy | 以 G2 PR 当前 head 的 Checks 为准；交付终回复给出实际结果 |

命令：`npm run test:g1`、`test:g1:longrun`、`test:g1:browser`、`test:g2`、`test:g2:browser`、`test:g2:performance`，以及现有核心 / 三界 / 保存 / 视图 / QoL / 全部渲染门禁和 build/package。`test:core` 已包含独立 runtime-events 脚本。完整命令、逐轮指标、硬检查、失败及证据 SHA 见 [compact 指标](reports/release/g2-combat/summary/g2-combat.json)。两套性能结果均为 false，未改成 warning 或跳过。原始中间日志与完整测量留在 ignored 本地目录。

浏览器沿正式 `Life.spawn → advanceDays → AI attack`，保留原有 NPC、地图与资产，未注入命中。修士对修士、真实灵兽敌意、三样式、高等级、原生开关、飞速 / 暂停、存读档、三界窗口、真实上界渡劫、切渲染器、换世界及幂等释放均已验证。三种特写保留同一完成的首次接触产品帧，只调整相机并重画既有快照；未延长 TTL，未继续推进模拟。截图 FPS 不作性能结论。

命中区域对关闭指定样式的 RGB 像素差：Canvas 剑 / 火 / 雷 **180 / 171 / 97**；3D **449 / 814 / 279**。3D 实例与真实事件中点误差小于 `0.000004` 世界单位，投影居中。原生 World 替换释放九份新 FX geometry 与九份 material，后续换世界资源不递增。

代表截图共八张：[Canvas 剑](reports/release/g2-combat/golden/canvas-combat-blade.png)、[火](reports/release/g2-combat/golden/canvas-combat-fire.png)、[雷](reports/release/g2-combat/golden/canvas-combat-thunder.png)，[3D 剑](reports/release/g2-combat/golden/3d-combat-blade.png)、[火](reports/release/g2-combat/golden/3d-combat-fire.png)、[雷](reports/release/g2-combat/golden/3d-combat-thunder.png)，[真实灵兽交战](reports/release/g2-combat/golden/beast-combat.png)、[真实上界渡劫](reports/release/g2-combat/golden/upper-tribulation.png)。已人工检查原图。

## 性能口径与实际结果

Windows、Edge **155.0.4283.45**、Node **24.11.1**、Intel UHD Graphics 730，驱动 `32.0.101.7088`，ANGLE D3D11 硬件。设备 DPR2、Canvas DPR2；Three 保留原有 DPR1.5 上限，默认角色、环境资产和功能启用。软件 D3D 的手动 CI 只验证功能。

Canvas / 3D 各六组：512×320 全图 2 / 32 / 100 名交战者；384×240 全图 32、上界窗口 100、幽冥窗口 2。每轮保留既有 76 名 NPC，以正式出生接口安排真实交战者；空地合法邻域与有界重试只安排出生，不改地图或 RNG 函数。窗口组战斗仍发生在凡间，目标界验证观察与裁剪；真实上界渡劫另由浏览器证明。

ABBA 每轮先进行 120 个真实产品预热帧，再测 90 帧，每帧正式推进 .1 游戏日。两套完整矩阵各 4,320 测量帧，均含 172,344 次真实命中、7,200 条发出事件。基准为当前正式 runtime 的 Stage 战斗展示 off；两侧命中源均启用，未将此数字冒充旧 G1 源发射成本。计时包括完整 product update/render 与 Stage ingest/update/draw、ThreeCombat.update；Life.attack 计时含源 hook 的整体调用，不声称源 hook 独立成本。

完整 CPU 与实际 RAF P95 预算保持 off 最大 P95 ×1.08 +1.5 ms；presentation CPU P95 ≤1.5 ms；每可见位面增加 draw calls ≤3。不要求大图稳定 60 FPS。每帧确认相同 mesh/geometry/material 和三批池结构，全部采样帧 GPU geometry/texture/program 数固定。

受控模式固定显示 dt 为 1/60、显示时钟从 1 秒起；正式更新和绘制仍每实际产品帧各调用一次，actual RAF 由原始时间戳计量。四轮地形重绘的帧、输入时钟、dirty 状态和此前 render 时刻严格相同，全部地形、云雾、NPC、资产和默认功能保留。其用途是同画面下增量归因；原生真实秒 / 倍速由浏览器单独验证。

下表为受控完整矩阵，单位 ms；off/on 均取预定义两轮 P95 的最大值。

| 地图 / 视界 / 交战者 | Renderer | CPU off / on | RAF off / on | presentation on P95 | draw 增量 | CPU |
| --- | --- | --- | --- | --- | --- | --- |
| 512 全图 / 2 | Canvas | 18.8 / 22.2 | 16.9 / 17.0 | .2 | — | 失败 |
| 512 全图 / 32 | Canvas | 20.0 / 20.3 | 16.8 / 16.9 | .2 | — | 通过 |
| 512 全图 / 100 | Canvas | 21.7 / 21.5 | 16.8 / 16.8 | .3 | — | 通过 |
| 384 全图 / 32 | Canvas | 12.1 / 12.6 | 16.9 / 16.9 | .2 | — | 通过 |
| 384 上界窗 / 100 | Canvas | 22.9 / 19.0 | 33.7 / 16.9 | .2 | — | 通过 |
| 384 幽冥窗 / 2 | Canvas | 14.2 / 14.3 | 16.8 / 16.9 | .2 | — | 通过 |
| 512 全图 / 2 | 3D | 23.3 / 18.4 | 49.9 / 33.6 | .2 | 1 | 通过 |
| 512 全图 / 32 | 3D | 16.7 / 17.3 | 33.6 / 33.5 | .3 | 3 | 通过 |
| 512 全图 / 100 | 3D | 21.4 / 17.3 | 33.6 / 33.6 | .3 | 3 | 通过 |
| 384 全图 / 32 | 3D | 12.4 / 12.0 | 17.0 / 16.8 | .2 | 3 | 通过 |
| 384 上界窗 / 100 | 3D | 12.1 / 11.9 | 33.5 / 33.5 | .2 | 3 | 通过 |
| 384 幽冥窗 / 2 | 3D | 12.9 / 11.4 | 33.5 / 33.4 | .2 | 1 | 通过 |

每轮 2 / 32 / 100 档有真实命中 **180 / 2,545–2,701 / 7,937–8,000**，发出 **18 / 216 / 216** 条事件；确定性采样与预算阻止其余展示。受控中密 512 Canvas 第一轮 on 接收 216，入场 18、合并 118、预算丢弃 80；密集档入场 24、合并 101、丢弃 91。全矩阵队列峰 24、活动战斗 FX 峰 16，最终积压零。每组四轮 full World、save、advanceState 和全部 11 RNG 流一致；两套矩阵全部 RAF、presentation 成本、caps、pool、资源和 draw 检查通过。

**未通过的边界保留：**

- 原生 512 Canvas / 32：off P95 24.0、on 29.8，预算 27.42，超 2.38 ms。定向原生追踪慢帧 35.8 中地形 30.1、FX .3 ms，另一轮 on P95 19.9 低于 off 22.1。
- 受控 512 Canvas / 2：off 18.8、on 22.2，预算 21.804，超 .396 ms。四轮同样重烘地形 20 次；第一轮 on 慢帧 23.8 中地形 22.7、FX .1 ms；第二轮 on P95 18.5。统计未挑选替换。
- 已录耗时集中在既有地形重绘，但原生侧栏定时器、GC 与驱动提交未完全归因。独立审查未发现重复计时、Canvas 状态污染或可确认的新增核心热点；不能把未归因等同于“纯噪声”，也不能宣布完整 CPU 门禁通过。
- 受控 raw 的 ChildProcess `edgeExited=false` 保留，随后独立 OS 核验确认两个自有 PID 和 profile 均不存在；脚本已补等待退出 / OS 核验，未重跑挑选数据。

最小后续工作：以已保存慢帧继续区分地形和非地形开销，记录原生 UI / GC 对应关系；只对确认的局部热点修复，再跑完整硬件矩阵。当前 G2 功能可运行和审查，但性能尚未全部验收，不转为 ready，不合 main。

## G2.2 接口

值事件、明确预算及只读诊断可供后续设计环境后果；本轮只绘短命墨痕。永久火焚、雷坑、地形破坏须另设计正式环境入口、随机流和存档策略，不直接给每次命中追加永久副作用。
