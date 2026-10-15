# VIEW_CONTRACT v2 · 世界空间视界契约

> 事实核对：2026-09-30，Render3D M2-A 封板。v2 保留 V1–V11 的规则身份与既有模拟行为，改为跨 renderer 的表述和承重判据。
> 本文定义观察规则；三界模拟规则在 THREE_REALMS，当前阶段在 ROADMAP，模块路径在 ARCHITECTURE。

## 0. 视界的语义

玩家在凡间定义一块**世界空间 Region**，观察目标位面（上界 / 幽冥）同坐标区域。
Region 的 path、bounds、area 都使用世界格坐标；屏幕上的形状只是 renderer 的投影结果，不是另一份区域真相。
视界保持单窗、只读、临时观察状态；正式划选仍调用原有开缝入口，视界开关仍参与既有裂隙推进接线，不新增三界规则。

```text
selection + toolId → getRealmViewState → { open, targetPlane, region }
                                       ├─ Canvas：世界 Region → 屏幕 path → ctx.clip
                                       ├─ Three：世界 Region → terrain / entity mask
                                       └─ riftViewOpen → 原有 riftActive
```

换 renderer 不生成第二份 selection，不另造开关或裂隙时钟。相机旋转、平移与缩放只改变观察投影，不能移动世界 Region。

## 1. 冻结规则 V1–V11

| # | 规则 | 跨 renderer 的承重判据 |
| --- | --- | --- |
| V1 | 一个时刻只允许一个视界窗口 | selection 是单个区域对象；重画替换同一窗口，不累积列表 |
| V2 | 视界是 UI / 观察状态，不进存档 | selection / RegionMask 不写入 world 或 save；换世界 / 读档清空旧选区，切走视界工具关闭 |
| V3 | 上界 / 幽冥共用同一框架 | 工具映射、RealmViewState 和 Region 谓词共用；位面内容由 profile / derive 决定 |
| V4 | 三界坐标对应，地形语义独立 | 三界同尺寸、同格坐标规则；同一 `(x,y)` 在各界对应，不要求高程、地形、生态相同 |
| V5 | 窗内提交目标界内容，凡间内容只属于窗外 | 对同一 Region 使用互补 inside / outside 判据；Canvas 在投影区域裁剪，Three 按几何覆盖并保留正常深度遮挡 |
| V6 | 窗内观察不修改目标界 | 检视 / 点选只读；渲染不写实体 / 生态、不抽模拟 RNG、不改存档 |
| V7 | 正式划开视界仍会产生裂缝 | `commitSelection` → `openRifts`，按 targetPlane 沿用上界 / 幽冥开缝规则；渲染、检视、相机变化不重复开缝 |
| V8 | 观察层不改变裂隙概率和三界生态 | 沿用现有常量与成功 / 失败分支，不新增概率、世界层级或跨界生态 |
| V9 | 合法视界开关保留原有裂隙推进语义 | `riftViewOpen()` 读取共享状态，真实游戏推进仍将它传入 riftActive；不得另建 Three 时钟 |
| V10 | 关闭视界可使短命表现不可见 | transient FX 可过期或错过；不能据此补写模拟事件，也不要求存档恢复 FX |
| V11 | 历史以 world.record / milestone 为准 | runtime event / Presentation / 截图不是历史账本，不因看见或没看见而改历史 |

V8 继续保护 `RIFT_BASE_RADIUS`、`TAU_GROW`、`TAU_CLOSE`、`LEAK_CHANCE`、`WRAITH_CLIMB_CHANCE`、`NETHER_ITEM_LEAK_CHANCE`、`POSSESS_CHANCE` 等既有数值。
M2-A / cleanup 不新增生态、不重写 save / planes.transfer，不扩多视界或正式全图永久另一界模式。
M2-A 的全屏位面选择器是调试观察入口；矩形 Slab 是研究探针，均不代表上述正式模式已交付。

## 2. Region 与生命周期

`getRealmViewState({selection, toolId})` 是 Canvas、Three 与 riftViewOpen 的共同入口。
open 由合法工具映射和 selection 派生；targetPlane 由工具映射给出，关闭时 region 为 null。
RegionMask 复制并冻结 path / bounds / area；WeakMap 复用稳定身份，原地修改这些值会失效重建。
缓存不能把 Region 变成屏幕 polygon，也不能因为每帧调用而无条件重建地形 index。

换 world、子世界、地图尺寸或地形数组身份时，Host 释放旧 Stage 集合并重建，相机和 GPU 保留。
缺失目标界时视觉回退凡间，不能渲染或拾取旧界残留；尺寸 / buffer 不匹配明确拒绝。
视觉 fallback 不另定义一个模拟开关，裂隙状态仍以共享 RealmViewState 为准。

## 3. V5 的几何与拾取判据

Canvas 将世界 path 投影到屏幕后 clip，窗内绘制目标界画像；凡间裂缝是界间接缝，可按已有规则描边，但凡间人物 / 聚落不能作为窗内内容重画。

M2-A Three Mask 对 terrain quad 中心 `(x+0.5, y+0.5)` 使用 RegionMask.contains；目标界保留 inside，凡间保留 outside。
实体按所在格中心使用同一谓词；实例过滤后通过 `mesh.userData.renderEntities` 把 instanceId 映射回实体，不能拿它当原世界数组下标。
拾取只测试实际可见 Stage 的 terrain index / drawRange 和可见实体批次，最近深度胜出。
返回 plane / x / y / worldPoint / stage；命中实体时附 entityId。检视依据实际返回的 plane。

**世界 Region 归属与屏幕像素遮挡是两件事。** 斜视时窗外凡间山体可以挡住目标界，射线返回 mortal 是合法遮挡，不能根据 Region 包围盒强制返回目标界。
实体轮廓跨格边缘不是连续裁剪；M2-A 仍是一格精度的原型，不宣称像素级无泄漏或正式完整视界。

## 4. V6 / V10 的交互与表现判据

Canvas 的正式手势保留：拖动重画；短点击需同时满足小于 VIEW_CLICK_PX（6px）且在已开窗内，才进入只读检视。
窗内空白也有反馈；窗外单击仍可关窗。Three 根据可见几何的 plane 路由既有 realmInspector，不改成跨界写工具。
上界人物、幽冥鬼魂 / 物品卡保持只读；不传功、不记挂幽冥鬼、不施神力、不操控上界单位。

Three 的 raise / lower / flatten / smooth / undo 仅在凡间全屏且 Mask / Slab 关闭时开放。
拖动进入不可编辑状态时中断连续采样，不能隔着另一界窗口改下方凡间高度。
划选导致的既有开缝属于 V7 的显式提交动作，不是表现层可以随意写模拟的许可。

PresentationStage 是三界 runtime event 唯一 ingest / drain 消费口。
Canvas 按位面 drawPlane，Three 读取隔离并冻结的 snapshotPlane；不竞争 drain、不反写 FX、不消费模拟 RNG。
D8 的成功跨界仍按源 depart / 目标 arrive 发事件；失败与 cap 满不发成功 FX。关闭视界不会丢历史账本。
冻结 snapshot 的复制成本列为后续 P2 观察点，本轮不优化。

## 5. M2-A 实现边界

| 能力 | 当前事实 |
| --- | --- |
| 多位面 Host / Stage | 已完成；一个 GPU / Camera，Stage 是 Group |
| 三界调试全屏 | 已有；上界 / 幽冥仅 terrain + entities profile |
| 世界空间 Mask | 已证明地形 + 实体、相机对齐与按深度拾取；未完成完整 Layer 支持 |
| 水 / 植被 / 聚落 / 标记 / 选中反馈 | Mask 打开时相关 Layer 隐藏，不能把较低三角数当完整三界性能优势 |
| 高差边界 | 未做自由 Region 封边；一格离散边缘与侧向缺口是原型局限 |
| Slab | 每边 ≤20 格矩形；拒绝 polygon path，不是 boundary skirt 或自由多边形系统 |
| Three FX / 美术 | 只有小型 FX 探针；未完成完整 FX 移植或 PNG 接线 |

## 6. 谁守这些规则

- `npm run test:view`：共享状态、工具 / 生命周期、位面画像、跨界事件、只读检视与追迹逻辑地基；M2-A 封板记录为 113 项，不把历史 42 项写成当前总数。
- `npm run test:render3d:m2a`：13 组架构不变量；包括 Stage 生命周期、Region / pick、写守卫、单消费者及 600 日三路径等价。
- `npm run test:render3d:m2a:browser`：Edge 同坐标截图、两界各 80 点（内部 / 外部 / 边界）、相机变化、真实存读档、缺位面 / 换世界与编辑守卫。
- `test:three-realms` / `test:save-equivalence`：模拟 / 存档底座；`test:presentation`：表现层纯度、按位面事件与历史边界。

Fast / Heavy Gate 每次 push / PR 运行；两套浏览器检查只在手动 Browser Smoke 中运行，JSON / 截图作为 artifact 保存。
本机实显卡的 [M2-A 基线](./reports/release/render3d-m2a/performance.json) 与 CI runner 的功能复验区分；两者都保留 GPU 标识、首次 / 重复开窗、驻留 / 可见 / 更新成本。
CI 的软件光栅读数不能替代实显卡性能结论。完整本地证据见 [M2-A 工程报告](./Render3D%20M2-A%20架构原型工程报告.md)。

## 7. 后续边界

M2-B 未开始。本轮只升级文档表述与验证接线，不改 V1–V11 的玩家规则、三界概率或存档。
World-space Mask + grid boundary skirt + 逐 Layer Mask 是下一轮设计倾向，Slab 保留研究、RenderTarget 暂缓；施工范围由 ROADMAP 与用户下一轮任务确定。

## 8. M2-C2E 可选访问范围（2026-10-08）

本节补充已完成的M2-B后续状态，上述M2-A时期的“后续边界”保留作历史。渐进探索与RealmMask分别保存/维护：mapProgress只控制访问矩形，不创建或改写视界；唯一开窗提交仍Sandbox.commitSelection。三界内容按访问权限与真实Region指定侧相交，真实界缘仅裁去闭区段。闭区拒绝拾取/编辑/检视/开窗，并限制相机目标。扩图保持World/数组/seed/实体/RealmMask身份，不改变三界概率或模拟。旧档缺进度仍全图开放。
