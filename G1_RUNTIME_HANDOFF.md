# G1-R Runtime & Simulation 交接

本分支从共同基线 `fc612ac9470b48aaaa3291b7fc39a9e0bdf87fff` 创建，施工分支为 `feat/g1-runtime-codex`。本轮交付真实人物解析、只读模型、正式敕令、记挂接线、地图成长与独立回归；保留旧人物展示路径。正式人物卡及样式由 `feat/g1-presentation-web` 交付，本分支不导入尚未存在的组件，不修改 `src/inkbox/ui/g1/presentation/**`、`B数值系统`，不合并 main。

## 运行时边界

| 文件 | 责任 |
| --- | --- |
| `src/inkbox/g1/characterIdentity.js` | 严格解析 `plane:id`，绑定 World、源位面和实体引用，校验真实生命周期证明 |
| `src/inkbox/g1/characterRuntime.js` | 深冻结的 schemaVersion 1 ViewModel、headless controller、保留事件摘要 |
| `src/inkbox/g1/characterMessages.js` | 失败原因的中文反馈 |
| `src/inkbox/sim/heavenEdicts.js` | 唯一敕令判定和执行入口 |
| `src/inkbox/g1/sandboxRuntime.js` | 当前 Sandbox 与命令效果接线、旧 DOM 回调失效、Canvas 重叠人物消歧 |
| `src/inkbox/main.js` / `ui/railPanels.js` | 旧展示路径消费模型和命令；3D 消费已有 PlanePicker 的真实 entityId |
| `src/inkbox/world/mapProgress.js` / `sim/advance.js` / `ui/worldCreation.js` | 正式世界日驱动的地图解锁、纯读进度反馈和已有手动扩图 |

`buildCharacterViewModel(world, keyOrToken)` 返回数据快照或 null，不含 World / entity 引用。接口保留委托书的全部字段。缺失的数值用 null，缺失事实明确为不可考。额外字段 `identity.currentPlane` 区分当世身份来源与当前已证明位置；`cultivation.rate` 保留正式速度数值；`historyCoverage` 说明人物日志只保留最近 32 条。境界、需求、修炼速度分别复用正式的 `realmLabel`、`expToNext`、`cultivationRate`，没有第二套属性或收益系统。

人物键严格使用位面和正安全整数 ID，不按姓名解析。选择 token 只在 UI runtime 保存，绑定世界和原始对象；换世界、同 ID 对象替换、原选择失效后旧命令被拒绝。可靠上界来客、逝者名录、幽冥来历允许对应生命周期转换；福地飞升记录只证明已飞升，不能据此猜测上界位置。转世不自动继承上一世记挂身份。活人定位与敕令均受根世界 C2E 访问边界约束。

## Presentation 集成接口

`createCharacterController({ getWorld, onChange, presenter })` 提供：

- `select("mortal:123")` 或 `select({ plane, entityId })`：返回 `{ ok, token, viewModel, ... }`。
- `current()` / `viewModel()`：读取当前快照；`refresh()`：重新解析身份并发布快照。
- `handleAction({ type, targetKey, edictId? })`：动作仅为 close / watch / focus / export / edict / show-relations。
- `close()` / `reset()` / `destroy()`：清理当前选择与 presenter 生命周期。

命令返回 `{ ok, reason?, message, viewModel, before?, after?, effect? }`。focus、export、show-relations 产生宿主消费的 effect；正式 ViewModel 不传实体对象给网页端。Sandbox 宿主为每次打开绑定 token 和 revision，旧 DOM 闭包不能操作重新打开的同一个人物。

集成时接入 `createCharacterCardView(root, { onAction })` 的 `render(viewModel)` / `destroy()`，由 Runtime 宿主消费命令和效果。当前 `ui/railPanels.js` 仅沿用旧面板展示，不是待合并的正式人物组件。集成需同步替换 `main.js` 的 presenter 接线、加载网页端 CSS、核对追加字段以及创世 / 扩图信息展示。

## 敕令与记挂

灌顶增加正式下一层需求的 25%，最多填至该层需求，人物境界上限仍由正式模拟控制；敕令不直接突破。拨运和定心分别增加 fortune / mind 8，最多 100。执行前重新检查世界、token、实体、访问边界、活人修士身份和上限。成功修改真实字段，返回 before / after，并由 World.record 写入正式天道干预历史。失败不修改 World、日志或 RNG。

记挂直接复用 `sim/watch.js`，上限仍为 12。记挂栏打开命簿前保存上次阅读日，再读取重大事件摘要并标记已读；长期更新只重建快照。摘要使用保留的正式事件和可靠生命周期名录，明确 `coverage.complete: false`，不能称为完整一生。观察不会获得属性收益或消耗模拟 RNG。敕令和记挂接入现有未保存状态提示，已有存档 schema 保存实际字段与 watch 数据。

## 地图成长与存档

开启渐进访问后，40 / 60 / 80 / 100% 表示既有访问阶段；完整 World 仍在创世时生成，外围三界模拟不停止。正式世界日到达 360 / 1080 / 2160（1 / 3 / 6 年）后，在成功的 advanceWorld 末尾推进阶段。暂停不增长；跨多阶段快进可一次解锁到对应阶段；手动扩图后的阶段不会回退。

不新增进度元数据，继续保存 `mapProgress: { version: 1, stage }`。无 mapProgress 的旧档保持全部开放；有阶段的旧档读取时保留原阶段，在下次推进后按已有 world.day 补齐。纯读 `mapProgressSummary` 不写世界。Seed 0、原有地形 / 尺寸 preset 和手动扩图路径保持可用。

## 回归与证据

- `npm run test:g1`：身份与 VM、正式敕令、存读档、生命周期、宿主效果、Canvas 消歧 / 高程 / 位面窗、真实 PlanePicker 几何、地图成长与生成 / RNG 等价。
- `npm run test:g1:longrun`：正式 advanceWorld 的 30 年与 100 年观察对照，比较完整存档及模拟 RNG；敕令后 30 年重复运行确定性与无敕令对照。
- `npm run test:g1:browser`：六项实际宿主检查，覆盖 Canvas 重叠人物选择、按钮命令、产品存读档、幽冥窗口，以及已有 PlanePicker 可见实例的实际鼠标 → main.inspectPlaneSubject → Runtime 路径。初始人物不足时仅用正式 Life.spawn / spawnNetherGhost 补充测试参与者，使用既有资产和相机，没有伪造人物卡数据或拾取结果。
- 现有 Fast / Heavy 门禁保持全部命令，并分别增加 G1 定向回归和长局。
- `npm run build` / `npm run test:package`：正式便携包和包内容审计。

本轮验证全部通过：本地完整 Fast 的 31 条命令（含构建）、Heavy 四项、包审计；最终 Runtime 20 组、宿主 6 组、地图 6 组；浏览器六项工程接线及截图复核均通过。最终数据修复后再执行 G1 / core / view / QoL / build / package / G1 longrun 定向复验，全部 exit 0。30 / 100 年观察对照的完整 World（只排除观察 watch 状态）和模拟 RNG 等价；主动敕令后 30 年重复轨迹一致且确实区别于无干预对照。独立审查确认福地飞升、跨界死亡记录替换和幽冥事实展示三处问题已修复。

压缩记录见 [验证摘要](reports/release/g1-runtime/summary/g1-runtime-validation.json)，代表截图见 [敕令](reports/release/g1-runtime/golden/canvas-edicts.png) 和 [幽冥真实身份](reports/release/g1-runtime/golden/3d-nether.png)。本轮可重建日志位于 `reports/g1-runtime-validation/`，不覆盖历史封板证据。

完整可重建的本轮命令日志与浏览器截图保存在 `reports/g1-runtime-validation/`；筛选的正式摘要和代表截图保存在 `reports/release/g1-runtime/`。浏览器环境为 Edge 154、1440×1000、软件 Microsoft Basic Render Driver / D3D11，只证明渲染和交互接线，不声称真实 GPU 性能。Tabbit 诊断 exit 69，未能取得路由，工程验证使用仓库已有 Edge CDP。浏览器检查仅验当前宿主接线，正式人物卡 Browser / 性能 / Package 集成验收仍待用户明确指令。

## 待后续集成

用户发出“开始 G1 集成”后，再从最新 main 建立 `integrate/g1`，接入双方分支、正式人物组件和样式，完成真实百年观命试玩及完整 CPU / Browser / 性能 / Package 验收。本分支单独完成不代表整个 G1 完成。

C5 材质 / 色板 / 实例视觉协调依照委托书延期至 G1 后半段；本轮未改变正式资产库、人物材质体系或 LOD / HLOD。实际 Three.js 视觉与 GPU 验收在相应资产修改及最终集成时执行，不能用 CPU mock 或软件渲染帧率代替。

保留本分支，禁止单独合并 main。若建立 PR，必须为 Draft，标明 **Do not merge independently.**
