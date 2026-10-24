# HANDOFF · 坐天观井 Inkbox 交接单

## 2026-10-24 · G7 v1.1 万象归卷

E0 #34、C1 #35、立体观世 P0 #36 已依次以 Merge Commit `3f9971a`、`603ccd1`、`12b4f3b` 接入 main；G7 #38 从 P0 独立续作，并接回这三次真实合并历史。G7 修复 Canvas 未确认笔画取消仍落笔、异步保存误清新改动、异步读档覆盖新操作、确认中改槽导致读错档、拒绝施法仍触发卜算子随机反应，以及 Three 正式检视入口缺失。Canvas 保留75ms长按施力与水笔整笔聚合，内部 History 继续服务回滚。

已完成主菜单创世→自然出生→同一人物赐根→真实洪水/抽水→宗门付费援助→活动洪水存读档/到期→回访；三档尺寸、真实触摸取消、长按和异步竞态均有本机浏览器证据。源码 `2fa6b59` Fast/Heavy 已通过，最终合流门禁以 #38 与 main 对应 SHA 的 Actions 为准。完整 Git、命令、证据、已知边界与回退集中见 [G7 交付记录](./docs/development/G7_MAIN_INTEGRATION_DELIVERY.md)。G6 #30 和 Opus `feat/art-shanhai-ruins-v01` 保持独立。下方候选、未合流和 Draft 状态均为当时快照。

## 2026-10-24 · P0 立体观世 · 神力回响施工候选

从 C1 #35 独立续作，已发布 [Draft #36](https://github.com/sjh20016/inkbox/pull/36)。恢复 3D 输入/整界/正式神力，加入有界有限水响应、真实施法表现和可见反馈，收束界缘、卜算子、撤销入口与大事记。58/58 CPU 与已发布 Fast/Heavy 通过；双尺寸真实操作、洪水24项/真实突破/事件回访和五类两轮暂停/×2性能对照已有证据。第13项黑短线已由实际射线定位为灵脉陡坡碎片，按同真实 ID 整条回退既有可拾取圆环，同景 GPU、平地恢复及只读性验证通过；十五项有限验收闭环。保留 Draft 供审阅，最终 Fast/Heavy 以最新 PR 提交为准；具体数字、限制与失败记录见 [P0 交付验收记录](./docs/development/P0_THREE_PLAYER_EXPERIENCE_DELIVERY.md)。main/E0/C1/G6未改，base为C1。

## 2026-10-23 · C1 凡世生息候选

从 [Draft #35](https://github.com/sjh20016/inkbox/pull/35) 的阶段备份 `f8704538` 续作，仍以未合流的 E0 #34 为 base。统一18岁成年、真实双亲出生、转世0级身份、逐级寿元和真实村庄供养；补齐断供后恢复收徒，修复领地洪泛精度导致的重复入堆，并迁移受人口语义影响的旧夹具。已完成三个300年自然样本、和平/断供对照和真实Edge双 renderer 检视；参数、命令退出码、性能限度和旧档边界集中见 [C1交付记录](./docs/development/C1_MORTAL_FOUNDATION_DELIVERY.md)。最终 Fast/Heavy 按该 PR 对应提交的 Actions 核对，保持 Draft，不合并 main 或 G6。

## 2026-10-22 · 地方兴衰与文明韧性 P0

P0 从 `S0@7af2c35` 接通真实聚落损毁、可支付的宗门月度援助、自然恢复、有限地方沿革与可检视遗址；Canvas/Three 共用身份，存档新增字段可选。集成顺序为 [S0 #33](https://github.com/sjh20016/inkbox/pull/33) → [P0 #32](https://github.com/sjh20016/inkbox/pull/32)，G6 #30 独立。准确合流状态看 PR；实现、完整门禁、重复配对性能与回退集中见 [P0 记录](./docs/development/LOCAL_RESILIENCE_P0.md)。

追加三组同条件广境 ×2 配对未复现首轮 RAF 长帧增幅，不启动全面性能研究。正常 100 年样本已记录地方兴衰，300 年以上人口、宗门、魂池与存档增长仍未完成产品验收。

## 2026-10-22 · S0 静态自然

`feat/s0-p0-static-nature` 从重新核查的 `main@2ce4348` 开发。正式运行不再持续水文、侵蚀、随机植被生长或野火扫描；Canvas 与 Three 共用静态水面编辑，火焰、焦土、熔岩和洪水按游戏到期日结算并存档。保留人物、聚落、轮回和三界因果。云雾环合为单个批次，远景树由每棵 16 降至 10 三角形，中景描边停止提交。

同机广卷暂停 draw calls 从 262 降至 24，总三角形减少 60000；短 ×2 样本更新 CPU P95 从 12.2 ms 降至 1.2 ms。这是环境成本的有限样本，不代表高人口或多设备性能封板。交付范围、门禁、交互、残留 P1 与回退见 [S0-P0 交付说明](./docs/development/S0_P0_DELIVERY.md)。下方为历史记录。

## 2026-10-20～21 · R1 山海入世

分支 `integrate/r1-art-ui-release` 从开工时重新 fetch 的 `main@c45f9be` 接纳 V1→V1.3 四个原始提交，未拼造美术历史，也未引入 G6-P0。默认 Three 为 V1.3 三界与幽冥 `line-c`；保留 G5/P1 地形、水面、拾取与植被路径。集成修复包括线刻 BufferAttribute 复用与释放、线刻按实际三角面对齐、关闭风格轮廓不再提交，以及换世界清除装饰背景缓存。

Opus UI 先定向迁移创世/存档菜单与正式人物身份肖像，再按用户补充要求参照本地《玄门秘卷》完整优化美术：印令、符箓、纸卷书架、日晷与摊开的命簿，卜算子采用交付的执伞插画。动作沿用现有创世、存读档、确认与检视处理器，保留 A1 真实三维 Viewer；默认 Canvas 可按需载入同一 Three Adapter。自然笔刷保护底层经典雕刻与 Canvas 语义，未修改模拟、RNG、世界生成或存档 schema。来源、实测、性能限制与交付状态集中见 [R1 集成记录](./docs/development/R1_ART_UI_INTEGRATION.md)；下方旧阶段状态均为历史快照。

本轮完整真实浏览器流程 57 项通过，覆盖五档尺寸、闭合三界视界、自然雕刻/撤销、人物命簿、自然史事与村落、存读档/导入取消和资源热循环。最终性能源码 `d4b8425` 在 AMD 610M / DPR1 的 512×320 正常 ×2 同轮对照 RAF P95 为主线 33.4/33.3 ms、R1 33.4/33.4 ms；山海美术的 GPU 与 CPU 代价仍有增加，大地图长尾、DPR2 和其他硬件边界保留。构建及最终源码 Fast/Heavy 以本轮 PR 运行记录为准。

## 2026-10-19 · P1-I Opus 性能优化集成验收（分支 `perf/p1-g5-longframe-integration`，基线 `f0c6bdf`）

接收 Opus 原始提交 `1d000ee067cc2b5082c7b36d53810f3c562abd92`，其父提交与 P1 开工时的 `main@f0c6bdf79cf98be30b3dc856143fe7191ad28904` 一致。最终保留规则格网地形拾取（不适用时回退 Three 原求交）和大范围高度帧植被错峰（小范围编辑即时更新，持续大范围变化下最多延后 0.6 s）；回退水面索引上传合并。相同 512×320 世界 seed、187 个固定水文步下，4096 间隙合并将索引上传调用从 28117 降至 10440，却把总字节从 681048 增至 111263448（约 163 倍），更新 CPU P50/P95 从 2.103/2.656 ms 增至 2.533/3.706 ms，因此不保留该项。

真实 GPU Edge 155 / AMD Radeon 610M D3D11 A/B 已完成：1366×768、DPR 1、广卷 512×320、seed 20261018、模拟 ×2、每个版本正常推进 30 秒。基线 / 候选 RAF P95 为 27.9/27.8 ms，>50 ms 间隔为 20/14 次，均无 >100 ms 间隔；Long Task 数 / 最大值为 19 / 84 ms 与 14 / 74 ms。**P1 在这一指定 AMD 场景验收通过**；其主要收益是降低地形拾取 CPU 成本，静止鼠标的 A/B 样本不支持宣称整体 FPS 大幅提升。两版本从同种子开始，但测量末推进日数为 218.066/216.530，工作量非严格相等。RAF 间隔含浏览器调度和 GPU，不等于 GPU 提交时间或 CPU 帧耗时；三者不得混为一谈。Intel UHD 730 上 G5 时期约 1.07 s 长帧尚未同条件复测确认消除，DPR 2、其他显卡和长期负载仍未验证，因此不代表项目整体性能问题已解决。测试输出和截图保存在本机忽略目录 `reports/local/p1i-edge/`。详见 [P1 长帧专项](./docs/development/P1_G5_LONGFRAME.md)。

本地代码复验通过 `npm run test:g5`、`test:render3d`、`test:g26`、`test:render3d:m2c2e`、`build`、`test:package`；非门禁 512×320 拾取微基准中位数为 heightfield 0.07 ms、暴力求交 11.78 ms（157.5×），严格功能一致性仍由 G5 门禁检查。真实 Edge 玩家交互复核：512×320 广卷、模拟 ×2 下，多点地形检视、桃坞屋舍与周隐灯拾取、上界与幽冥视界内拾取及窗外凡间拾取均显示对应位面/身份；小幅抬山后撤销、重做按钮状态及高程变化正确。视界取样用内置测试 Mask 固定测试区域，鼠标检视仍在实际 Edge 中完成。交互期间模拟持续推进，页面可操作且控制台无错误/警告；复杂演进世界的界面计数器约 8–12 FPS，此观察不等同于前述 30 秒 A/B。PR #29 最终 HEAD 的 Fast Gate 与 Heavy Gate 均通过；Browser Smoke 按工作流设计跳过。

## 2026-10-19 · G5 GPU 优化已合入 main（PR #28）

PR #28 于 2026-10-19 以 Merge Commit `3dabf8c48e1939f1de9b874e3c674fc84609e005` 合入正式 `main`；第一父为 G2.6 合流提交 `9ec8ec7`，第二父为 G5 交付提交 `0cc49fd`，保留 main → G2.5 → G2.6 → G5 的提交祖先关系。候选从 G2.6 提交 `062ce3b` 起步。默认 3D 地形使用高度纹理位移、纹理整批上传与增量对角索引；CPU 顶点仍准确维护，供拾取和建筑贴地。水面使用固定节点/外缘网格、Float32 高程与水深纹理、三角湿域裁切，保留 Region 同源判据及 CPU/legacy 回退。植被成员资格未变时仅更新实际变化的实例 Y，保留 LOD、颜色与缓存。模拟、水文、生态、角色规则与存档格式未改；未引入写意实验。

同一真实 Tabbit Chromium 153 / Intel UHD 730（ANGLE D3D11）、1366×768、512×320、seed 20261018，沿用附带 G5 `bench.cjs` 的暂停后 30 个水文步与 3 RAF 账本，均值如下。JS/GL 提交耗时不等于 GPU 执行时间。

| 每水文步 | G2.6（062ce3b） | G5（0cc49fd） |
| --- | ---: | ---: |
| bufferSubData 数据 | 39.88 MB | 1.55 MB |
| renderer.update | 100.82 ms | 52.94 ms |
| GL render 提交 | 23.05 ms | 7.27 ms |
| texSubImage2D 调用 | 943.93 | 4.00 |

水面不再每步上传约 23.59 MB 位置及 7.86 MB 索引。代价是增加 Float32 水面纹理传输与干区顶点绘制；少量拓扑及树实例更新的 bufferSubData 调用数增加，不能把缓冲字节下降当成总传输或固定帧率承诺。该段记载 PR #28 合流时的 G5 设备验收状态；后续 P1-I 的 AMD 610M 实测见上节，不反向改写 G5 当时的样本。

针对性回归覆盖高程/拾取、同帧全量与局部上传、CPU 回切、历史美术对照、湿域/外缘、植被水淹与恢复、Region 和释放。浏览器实际验证抬山/撤销/重做、Canvas 注水后返回 3D、上界/幽冥划窗、窗内拾取、关窗及 WASD。修复开窗时旧 hover 签名把 numeric `boundary.edges` 当 WeakMap key 的帧循环异常，并保留失败证据。交付 HEAD `0cc49fd727131d9622b25d9694396bf0a25ba033` 的 [GitHub Actions #39200007595](https://github.com/sjh20016/inkbox/actions/runs/39200007595) Fast Gate 与 Heavy Gate 均通过，Fast 包含 `test:g5` 与构建门禁；Browser Smoke 按工作流设计跳过，真实浏览器验收记录在 PR #28。

运行 `npm run dev` 后打开 `inkbox.html?renderer=3d`；回退 URL 为 `?renderer=3d&terrain=cpu&water=cpu`。`npm run test:g5` 已加入 Fast 与发布包。需要回滚时，对 PR #28 合流提交 `3dabf8c48e1939f1de9b874e3c674fc84609e005` 执行正常 revert。原始浏览器账本、截图与命令退出码留在本任务工作区的 `g5-validation/`，不进运行包。

## 2026-10-18 · G2.6「山河有形 · 众生有动」（开发快照；PR #27 已合入 main）

本节记录 2026-10-18 的开工状态：当时 main 为 `768b870`，G2.5 [Draft #26](https://github.com/sjh20016/inkbox/pull/26) 尚未合并，G2.6 从 `fe3311e` 建立；随后 PR #27 于 2026-10-19 以 Merge Commit `9ec8ec7` 合入 main。已有私有长档与截图仅作本机验收，不进入 Git 或发布包。

已接通 A1～A4：WASD/Shift 相机、静止 hover 的地形交点复用与移动实体独立查询，点击/雕刻保持实时拾取；新建聚落避水，存量房屋连续受淹 12 个模拟日转为真实废墟，Canvas/Three 共用当前结构，历史锚点不再占用有效住房容量。读档保留旧屋与受灾进度，沿用 save v11。玩家直接召修士入口隐藏，内部出生与自然觉醒保留。

A5 在原有地面规则内寻找附近合法平整台地并报告实际落点。B1/B2 默认推广三段平涂、人物 75%/普通屋 76% 的视觉比例，中心地标、模拟坐标、容量与占地不改；会话内 `inkboxG26Style.set('baseline')` 可对照原比例。C1/C2 的正式结算驱动前景笔锋、灵光与雷柱；命中笔锋朝向观察镜头、余韵延长，实际展开范围仍完整通过视界检查，演出不改变模拟时间或 RNG。C3 陡坡机缘保留带正式身份的门印/标记。D1 依据前世引用、死亡日和仍存魂实体提供「查看幽冥魂」，沿实际视界权限过滤，不按姓名匹配。

同一真实 Edge / AMD 610M、1366×768、静止鼠标与全图相机、暂停模拟的各 119 帧间隔样本如下。基线为 `fe3311e`，候选采样源码为 `f1dad38`，显式开启平涂/比例与山体 wash .65；最终默认仅推广平涂/比例，山体 wash 保持关闭。帧间隔含浏览器调度，不能当作纯 GPU 耗时。

| 幅面 | 基线 p50 / p95 | 候选 p50 / p95 |
| --- | --- | --- |
| 288×180 | 5.6 / 11.2 ms | 11.1 / 17.1 ms |
| 512×320 | 22.3 / 27.9 ms | 11.2 / 27.8 ms |

暂停广境中位帧时改善，中境样本回退；该暂停条件未复现玩家截图中的 217 ms。最终源码 `658e283` 的正常推进广境短样本（60 RAF、59 间隔）为基线 **178.1 / 278.3 ms**、候选 **144.8 / 239.3 ms**，确实仍有同量级长帧。候选 60 次 hover 中静态重查 55 次、复用 5 次、动态查询 60 次；几何持续更新限制了复用，不能判定单一瓶颈或承诺固定帧率。基线没有新增分类计数器，记为不可用。

同页 288×180 的三组 60 RAF 材质切换，p50/p95 分别为原比例+wash0 **11.1/22.4 ms**、候选平涂比例+wash0 **11.3/28.2 ms**、候选+wash.65 **11.1/17.1 ms**；短样本不足以解释早期中境回退。额外材质采样曾出现 Shader Error 并回退 Canvas，随后按既有流程复测通过、GL=0，失败原件保留。最终动态样本与所有本轮 owned 浏览器/服务器的清理均已确认；一次早期遗留服务器按确切归属补清。原始结果分别在本机 `reports/g26/attempt-2026-10-18T125931-269Z-style-wash-288-real-edge/` 与 `attempt-2026-10-18T130106-323Z-dynamic-512-real-edge/`。

**此处的 `PERF BLOCKED` 是 2026-10-18 G2.6 验收时的判断。** P1 后续在 AMD 610M 指定场景验收通过，但整体 M2-C2E 边界仍未封板；B3 山体色块保留关闭原型，D2 御剑飞行、全面高峰通行顺延，不绕过凡人地面阻挡。

实机主体使用私有长档做正式导入、WASD/松键/失焦/输入框/Canvas 往返、实际点选、塑形、受淹后果和机缘观察。人物同一镜头的近中远对照分别在本机 `reports/g26/attempt-2026-10-18T102830-337Z-character-only-real-edge/` 与 `attempt-2026-10-18T114232-279Z-real-edge/`。正式破境前景笔锋和默认冷启动在 `attempt-2026-10-18T122453-596Z-fx-visual-real-edge/`；最终正式命中的普通画面对照在 `attempt-2026-10-18T125312-961Z-fx-visual-real-edge/`，该对照仅将已结算的表现时钟定格在 0.20 秒取帧，不伪造结果。自然 90 日观察另存；失败、遮挡与清理失败尝试保留，最终成功证据不覆盖旧失败。截图与完整 JSON 均在 ignored `reports/g26/`，不随 Git 或运行包分发。

定向入口为 `npm run test:g26`。本地 core、G2.5/G2.6、相关 UI/渲染与保存等价通过；缩小房屋后旧测试的固定屋顶点被自然植被遮挡，已改为选择同一真实屋的可见表面，保留房屋/村庄身份及纯地形拾取断言。新命中回归还覆盖笔锋原平面侧对镜头的情况。CI 收口补齐旧雕刻渲染替身的空按键、相机移动与 hover 接口，保留全部静止笔画断言并确认 100 帧零位移相机更新；人物样板射线跟随真实实例变换，聚落样板具备真实结构。共享聚落只读规则原样移至 `world/settlementState.js`，满足表现层不得导入模拟目录的既有边界，未修改算法；实机验收后的产品差异仅为该移动及导入路径。相关 M2-C2E、M2-C 与两项 C2B 纯度检查均重跑通过，Fast 后段其余 15 项也通过。保存等价只保证读档瞬间结构完整，历史 RNG 游标与量化导致的未来轨迹差异仍保留。最终构建、包审计与同一交付 HEAD 的 Fast/Heavy 记录于本轮 Draft PR。回滚采用本分支反向提交或放弃 Draft，不重置 main、不改写历史。

## 2026-10-18 · 正式主线已接纳 G2，转入 G2.5（开发快照；PR #26 已合入 main）

已实时核对 PR #23、#24、#25 均 merged，正式 main 为 `768b870949ffe6d17e74e8fc8656e5eadf6f6130`。G2-R1、A1、G2.4-C 已是正式产品内容；G2 性能仍 **PERF BLOCKED**，主要功能试玩规格为 200×128 / 288×180。当前独立分支 `feat/g2-5-fate-opportunities` 开发「破境有相 · 改命布缘」，完成后提交目标 main 的 Draft，不自动接纳。

独立 B 数值研究、G3 成本研究、历史 RNG 游标持久化与更大地图性能等问题继续保留。当前入口为 README、ROADMAP、BACKLOG 与本段；STATUS 已不存在，仅固定历史链接用于考古。**下方所有历史交接中的 Draft、未合并和待接纳状态均为当时快照，不再代表当前 Git 状态。**

G2.5 本分支已接通：命簿「洗髓」确定性提升普通灵根一品、最高至优，名称/品质/修炼加成一致且不动当前修为；秘境提供随机/剑冢/丹阁主题，洞府固定一份正式功法且领取状态持久化；正式突破结算驱动 Canvas/Three 的分级成功/失败异象。工具显示真实落点并打开地点卡，探索与改命结果沿用正式人物/世界记录。

沿用 save v11：灵根复用实体 row[20]，地点新增字段随已有 sites 保存；旧地点缺主题字段沿用通用奖励，不在读档时补发传承。突破特效仅走瞬时队列，不改随机结果或存档。定向入口 `npm run test:g25` 已加入 Fast，全部既有门禁保留；最终浏览器、保存等价、构建与 Fast/Heavy 以最终交付提交为准。试玩步骤见 [玩家指南](./PLAYER_GUIDE.md)。可选引灵脉、牵缘与遗宝留待后续，不在本轮扩展。回滚采用本分支反向提交或放弃 Draft，不重置 main。

代表性验收使用真实 Edge：Canvas 经实际画布选人/落笔、命簿洗髓与记挂、主题地点卡和官方存读档；Three 在 200×128 / 288×180 全景与近景核对正式突破异象，并切换三界确认 GL 错误为 0。初次 Three 全景阵纹过细，已在 `f13c0e8` 扩大阵纹并保留完整区域过滤；关键成败使用正式 `Life.spawn`、`enterSite`、`attemptBreakthrough` 的受控夹具，30 日自然样本没有强制事件，不代表自然故事发生率或性能通过。截图和含失败尝试的原始输出仅留本地忽略目录 `reports/g25/`，不新增阶段报告。19 组 G2.5 定向检查、相关 G1/UI 与三界回归已通过；发布包和最终提交的 Fast/Heavy 仍须作为交付门禁。

## 2026-10-18 · G2.4-C · 山河回声验收与集成准备

接续 PR #25，修正正式火根修士拥有雷系功法时的真实引燃事实传递，以及 Three 对相邻引燃格的可见区域校验。固定自然样本、零事件浏览器结果、局部回归、三层试合及接纳顺序见 [G2.4-C 验收](./docs/development/G2_4_C_ACCEPTANCE.md)。仅建议 200×128 / 288×180 有限规格功能性候选，最终以该 PR 当前 HEAD 的 Fast/Heavy 为准；保持 Draft 与 **PERF BLOCKED**，不自动合并 main，不提前进入 G2.5。

## 2026-10-18 · G2.4 · 斗法入山河候选

从包含 G2-R1 的 A1 候选 `36e9c3a` 建立 `feat/g2-4-combat-environment`。凡间筑基以上火灵根修士的真实命中可引燃目标附近少量适宜地表，90 日尝试冷却随实体存档保存；火势、焦土与恢复继续由正式生态时钟推进。确认引燃后才写入人物日志、编年史和大事记，史事「查看」与短时交战近讯均可转到有权限的环境观察。A1 资产与双 renderer 保留。规则、试玩与验证见 [G2.4 交付](./docs/development/G2_4_COMBAT_ENVIRONMENT.md)。本分支独立 Draft 交付，不合并 main；G2 仍 **PERF BLOCKED**。

## 2026-10-17 · A1 · 众生入画（修士 / 卜算子 / 山海异兽资产接入候选）

从 G2-R1 候选 `e6fb8c6` 起`feat/a1-creature-character-assets`，把三组原创 3D 资产接进正式游戏：**修士** runtime 换为 `cultivator_rebuild` legacy-cells 版（六身份/12 色/16 骨/模块槽语义不变，旧模型随包 `mesh/cultivator_library_prev.glb` 可回退）；**卜算子** 面板新增真实模型渲染肖像与独立 three.js 三维小窗（Idle / Walk / Wind，风起为可演示效果而非天气机制）；**山海异兽** 13 种统一入库（`assets/creatures/`，每只 8 套动画），其中天狗 / 当康 / 鹿蜀 / 旋龟 4 种以真实模型进入正式世界灵兽表现，其余 9 种为 Lab / 未来秘境候选。世界模拟、存档、RNG、Canvas 与三界视界架构未改；资源加载失败回退旧表现；G2 性能结论不变（仍 PERF BLOCKED，保持 Draft）。范围、验证与回滚见 [A1 交付](./docs/development/A1_CREATURE_CHARACTER_ASSETS.md)；新 Lab 为 `busanzi-lab.html` / `creature-lab.html`。候选提交与远端状态以 [Draft PR #24](https://github.com/sjh20016/inkbox/pull/24)（目标基线 `feat/g2-r1-playable-integration`）为准。

## 2026-10-17 · G2-R1 可玩集成候选

独立新克隆从治理后 main `4852d89` 建立 `feat/g2-r1-playable-integration`，按文件迁移 #12 的 G2.1 / G2.2 / G2.3 / P0 生态及 P1 玩家入口。旧报告、性能仪器和研究实验不回流；RG 文档组织、测试分层、CI 与报告忽略规则保留。范围、启动、验证与回滚见 [本轮交接](./docs/development/G2_R1_PLAYABLE_INTEGRATION.md)。本候选保持 Draft，**PERF BLOCKED**；不自动合入 main。

## 2026-10-17 · RG-P1～P4 仓库治理收官

治理移除跟踪的旧阶段报告、早期委托书及 `reports/release/`，工作树只保留必要文档、生产源码/资产和有效测试；旧文件可从 [治理前 Git 固定提交](https://github.com/sjh20016/inkbox/tree/e1e55039bb56efda7a307513ede07a9fab3bf534) 追溯。`reports/` 默认忽略，运行包不携带历史报告。`tests/README.md` 为当前测试分层入口，`npm run check:ui` 为局部 UI CPU 检查；GitHub Fast/Heavy 仍保留全量契约，手动 Browser/GPU 另行执行。后续产品开发从最新 `main` HEAD 创建分支，先检查真实 PR 和 Actions 状态。旧研究分支不会因为此次治理自动合入或失效。

## 历史交接 · RG-P1 · 2026-10-16

核查日期：2026-10-16（Asia/Shanghai）。正式 main 基线为 `e1e55039bb56efda7a307513ede07a9fab3bf534`，[G1 PR #2](https://github.com/sjh20016/inkbox/pull/2) 已于 2026-10-12 合并，正式产品为 M2-C2E + G1。

[Draft PR #12](https://github.com/sjh20016/inkbox/pull/12) HEAD `74934a8b1360af9007c69935d5becdf8f9809872`：Canvas / Three 的 P1 玩家闭环 READY，G2 性能仍 BLOCKED，尚未合入 main；#12 已继承 #10，不重复合并。G3 #17 PCC Observer 成本超限，A1-1 BLOCKED，未进入 A1-2。B2 数值研究为无共同 Git 祖先的独立实验，不是正式产品参数。

接手先核对远端 SHA / PR / Actions，再阅读 [开发工作流与审计](./docs/development/REPOSITORY_WORKFLOW.md)、[路线图](./ROADMAP.md)、[未完成事项](./BACKLOG.md)、[测试入口](./tests/README.md)。从任务指定基线建隔离 worktree；不覆盖现有研究工作区和未提交材料。G1 契约见 [集成报告](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/G1_INTEGRATION_REPORT.md)。

风险：H2/H3/G3 Fast Gate 失败，Heavy 通过不能覆盖失败；P1 READY 不代表 G2 性能封板。STATUS 与下方旧日期交接仅作历史证据，不是当前施工授权；不执行旧交接中的工作区改名 / 恢复指令。

2026-10-17 RG-P2 的实施记录：进一步清理根目录阶段报告、早期委托书及 `reports/release/`，打包不再依赖历史 JSON；源程序和主要测试不改动，清理前全部文件可从 [main 固定快照](https://github.com/sjh20016/inkbox/tree/e1e55039bb56efda7a307513ede07a9fab3bf534) 读取。以下历史交接描述的“Git 保留 Golden/summary”不再是现行收录规则，新产物默认进 ignored `reports/` 或 Actions artifact。本段为治理施工时的历史快照，是否合入以最新 Git `main` 为准。

---

以下均为历史快照，其中“当前”、未合并与等待集成等措辞仅对当时有效。


## 历史交接 · 2026-10-09 · G1-R Runtime

产品主线仍为 GitHub main。Runtime 分支 `feat/g1-runtime-codex` 从双方共同基线 `fc612ac9470b48aaaa3291b7fc39a9e0bdf87fff` 开工，独立交付人物真实身份、快照、敕令、记挂、地图成长和回归体系。正式人物卡仍归 `feat/g1-presentation-web`；Runtime 沿用旧展示，不修改 Presentation 目录或 B数值系统，不单独合并 main。用户明确发出“开始 G1 集成”后才进入双方集成和正式 UI 验收；C5 视觉协调已按委托书延期。

优先阅读 [G1 Runtime 交接](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/G1_RUNTIME_HANDOFF.md)，其中列明新增文件、ViewModel / controller 契约、地图保存语义和待集成清单。`test:g1` / `test:g1:longrun` 分别加入 Fast / Heavy；`test:g1:browser` 验证已有 Canvas / 3D 宿主和存读档，不能代替正式人物卡或真实 GPU 性能验收。

## 2026-10-08 历史交接

- 当前唯一产品主线：GitHub main。
- 当前实验支线：B数值系统，是独立数值实验；不属于产品 main，其中实验参数不是 main 的正式数值。
- 当前正式阶段：M2-C2E 工程接入完成；后续从 C2E main 基线继续。
- 人物卡：旧 G0/G0.5 实验未合并；PR #1 已关闭，代码由 archive/g0-character-fate-web-20261008 保存，不是当前产品功能。
- 其他 archive tag：render3d-m0 精确指向被收束的 M0 分支 HEAD；历史正式 checkpoint tags 保留。
- 报告策略：保留 M2-C2C、M2-C2D、M2-C2D.1、M2-C2E 的关键摘要与视觉基线；M2-C 保留核心 JSON 与 8 张 pilot 图片及各自 manifest，重复原始门禁和旧浏览器副本不纳入 release。
- 本地部署：先将旧工作区完整改名为同级备份，再从 origin/main fresh clone 到原工作路径；本地专有目录先列明并由用户决定是否恢复。

施工状态和证据索引见 [STATUS](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/STATUS.md)，正式阶段见 [ROADMAP](./ROADMAP.md)，未完成事项见 [BACKLOG](./BACKLOG.md)，模块地图见 [ARCHITECTURE](./ARCHITECTURE.md)。

---

以下旧段落保留为历史阶段记录；其中的当前状态、分支和施工指令以本交接顶部及当前 main 为准。

2026-10-08 当前交接：M2-C2E 委托书 v1.0，本地工程验收完成（44CPU、108种子、14GPU、12固定镜、600/6000耐久），分支 `codex/m2-c2e-living-terrain`。最大图/密集模拟有帧长尾，最终美术由用户裁决。接手先看 [READINESS](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2E_READINESS.md)、[实现](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2E_IMPLEMENTATION_REPORT.md)、[性能](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2E_PERFORMANCE_REPORT.md)。本轮保持用户历史文档目录迁移，不合并 main；下列 C2C/早期门禁是历史记录。

2026-10-08 历史阶段：**M2-C2D.1 本机工程验收完成，最终美术待人工裁决**。指定分支 `codex/m2-c2d1-painterly-reconciliation` 从 WIP `daf78c0` 续作；完整十二镜四轮 GPU 零正向预算、CPU、六层/GPU 契约、历史对照与原套件 600/6000 soak 通过。用户已授权完成后上传该分支，远端 CI 以最新对应提交为准。没有合并 main，未把旧 C2B/C2C 的 Actions 作为本阶段证明。入口：[就绪](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2D1_READINESS.md)、[视觉](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2D1_VISUAL_ACCEPTANCE.md)、[性能](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2D1_PERFORMANCE_REPORT.md)。

以下 2026-10-06 段落为历史阶段记录。

2026-10-06 当前真相：**M2-C2B Pass 1 已在主线 `e0a851c` 远端封板，第一代正式资产生产体系成立。**Push CI [37224093479](https://github.com/sjh20016/inkbox/actions/runs/37224093479)、手动 Windows Browser / C2B 矩阵与 soak [37224107941](https://github.com/sjh20016/inkbox/actions/runs/37224107941)、800 年 Nightly [37233858438](https://github.com/sjh20016/inkbox/actions/runs/37233858438) 均成功。**M2-C2C Meaningful Geography 已本地完成，远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行**；范围限于呈现已有 World 语义，不扩展上界文明、幽冥城市或浮空岛拓扑。入口：[资产](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2B_ASSET_PRODUCTION_REPORT.md)、[性能](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2B_PERFORMANCE_REPORT.md)、[视觉](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2B_VISUAL_ACCEPTANCE.md)、[就绪与20项答复](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2B_READINESS.md)。

> 历史基线：2026-10-04，M2-C2A.1 / M2-C2B0 三界视觉阶段。读序：README → 本文 → 当前任务涉及的契约 / 源码。
> 阶段看 ROADMAP，目录和模块责任看 ARCHITECTURE，历史查 STATUS；本地 MEMORY 只作索引。

长期正式资产规则：[ASSET_PRODUCTION_SPEC](./ASSET_PRODUCTION_SPEC.md)。新增阶段区分正常 Golden、极端 Proof 和完整矩阵；Git 每阶段最多 8 张代表 PNG，完整浏览器证据保留在本机或 Actions artifact。

## 0. 当前状态与范围

工程已并入main。首推c67a0ee的旧dirty分类回归已由426412d修复：heightChanged原派发不变，生产Site/Leyline独立重验type准入；旧Bridge36断言、新C2C8组和完整Fast26命令通过。修复后的两对GPU与实际点击105通过，独立审查通过；compact summary分别保留原23对/Soak和修复源码/复验SHA，最终远端门禁以本轮main Actions为准。

2026-10-06 C2C 实现与本地验收完成：既有四类 Site、Leyline、Upper `qi`、Nether `veg`、持久 Rift 与短命 FX。六个只读开关 `sites` / `leylines` / `upperQi` / `netherYin` / `rifts` / `riftFx` 由 Host 编排；production on 使用正式资源，`geography=off` / `assets=off`、缺资产或完整 footprint 拒绝时保留旧基线与诚实回退。真实 id 必须解析当前 World；不复制半径公式或事件消费口。

本地 11 模式 × 600 日 / 11 RNG / 49 save keys 一致，full SHA `4b37e9605591ef48e986833513a5f633da7ef28bc080f326dc884efe44abb498`。完整 23 对 GPU off/on 矩阵通过，四类真实 Site 在约 90px 正常视角的生产几何与 CDP 点击通过；600 生命周期实际 update / render 各 600 次，6000 产品 RAF 帧及两个关键祖先 Browser 通过。干净克隆 ccac961 独立 npm ci 与 16 项安装 / CPU / 旧资产 / build 命令通过。6000 帧分为 20 × 300 帧，200 段检查均保持 114 geometry / 10 texture / 16 program。M2-B 祖先的 Upper / Nether / boundary 分别有 173 / 235 / 91 个可见几何命中，visible geometry === hit；C2B sample 三档真实 GLB 点击通过。 远端 Push 门禁以本轮 main 提交的 Actions 状态为准，手动 C2C Browser / Nightly 尚未运行，C2B 三个历史 Actions 不能作本轮证明。入口：[就绪](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2C_READINESS.md)、[工程与24项答复](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2C_MEANINGFUL_GEOGRAPHY_REPORT.md)、[性能](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2C_PERFORMANCE_REPORT.md)、[视觉](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2C_VISUAL_ACCEPTANCE.md)。运行包为 333 文件，目录约 8.8MB、ZIP 约 2.7MB；compact acceptance summary 保持不超过 256KiB。8 张正常 Golden 共 7206282 bytes，选择 case 1 / 3 / 4 / 5 / 6 / 8 / 12 / 14，位于开发路径 reports/release/render3d-m2c2c/golden/，不进入 runtime。

C2A.1 包清单、真实聚落 HLOD 与密林测量已封板；C2B0 的 24 对截图、600 日全部 11 RNG、600+6000 帧及 21 次 GC 峰值门禁已通过。单源是 [RealmStyleProfile](./src/inkbox/render3d/art/RealmStyleProfile.js)，以 stage.plane 选色。文档入口：[视觉](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2B0_VISUAL_REPORT.md)、[性能](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2B0_PERFORMANCE_REPORT.md)、[终验与就绪条件](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2B0_READINESS.md)。该段只记录 C2B0 当时事实；C2B Pass 1 随后建立了第一代正式资产生产体系。

M2-B 的完整 Layer Mask、共享 ElevationField / RegionGeometry、界缘、3D 划窗与拾取已完成。M2-C 在同一个 Host/Renderer/Camera、三个 Stage 上增加薄 ArtPass；不改变模拟、存档或视界定义。范围与证据见 [M2-C 工程报告](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C_EXPRESSIVE_INK_REPORT.md)。

M2-C2A 接入三档真实几何 LOD、迟滞、密度预算与凡间小聚落 HLOD 原型；[实施与验收](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2A_LOD_REPORT.md)、[性能](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2A_PERFORMANCE_REPORT.md)、[视觉](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2A_VISUAL_ACCEPTANCE.md) 保存 C2A 当时证据。3D 默认 `art=realm-style-v1` 且 LOD 开启；`art=legacy` 保留旧 pilot 对照，`lod=off` 保留全 LOD0；`artdebug=1` 才出现调参面板。现有 GLB 近景角色保留。后续资产扩产、完整群体动画、Trace Field 和 Gameplay G 留到后续授权。

历史封板检查：C2A核心8组、旧CLI14项、浏览器矩阵15项、600+6000帧及本机五套Browser Smoke通过。其后 C2B Pass 1 已通过远端封板；详细 Actions 证据见本文顶部与 [M2-C2B 就绪报告](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/M2C2B_READINESS.md)。

用户允许实验建筑资产自由修改，并指定 `美术素材/配色参考` 为后续颜色参考；使用索引见 [参考资产索引](./美术素材/参考资产索引.md)。范式包用于研究，产品不依赖整套第三方素材。

Browser / Soak 的 Mortal 输入共同由 `ensureCanonicalMortalCache` 在 GPU 测量前准备：Node seed226 / small / 每次 3 日普通推进到 day72000，生成自然产品存档与 metadata，经产品 importFile 导入。默认缺失或 simulation 源码 / Node-V8 / 保存 SHA 不匹配时重建，显式输入坏校验拒绝；Realms 同样校验完整 simulation 源码 / Node-V8 / 保存 SHA，默认旧 metadata 不匹配时自动重建。独立干净克隆 d9ca78b 的 cold 复验通过：缺 Mortal 缓存时自动自然生成，Realms 旧 metadata 自动重建；新 Mortal / Realms save 与 World / advance / history SHA 均与原完整 23 对矩阵一致。诊断 case 1 / 4 两对的 World / advance / camera 不变，Formation105 约 90px、38/96 前景三角，真实点击返回 105，error 0。报告保留 diagnosticComplete=true、pass=false，表示仅完成诊断，不替代 23 对全矩阵。8 项显式坏 save / source / engine / missing 拒绝检查通过。初次 cold 失败与修复后证据均独立留 proof。

## 1. 唯一工作区与版本

- 活跃源码：`inkbox.html` + `src/inkbox/**`；`index.html` / `game.html` 是跳转入口。
- 版本：Inkbox `1.0.0`（`package.json` 与 `core/config.js`）。`main` 是唯一活跃主线，工作分支从 main 建立。
- 本工作区直接关联 `sjh20016/inkbox` 的 origin；无需把 dist 复制到另一个“发布工作区”。
- `render3d-m0` / `render3d-m2a` 是历史 checkpoint，不从旧快照继续新功能，不重写已发布历史。
- D6-2 / D6-3、D7 A–G、D8 A–F、M0 / M1 / M1.1D / M2-A / M2-B / M2-C / M2-C2A / M2-C2A.1 / M2-C2B0 / M2-C2B Pass 1 已完成。
  D8-G 只有 `realmTrace` / `netherGhostOf` 逻辑地基，追迹 UI 仍暂缓。
- 当前 M2-C2C 已本地完成；下一阶段优先真实宗门 / 灵脉空间归属，R1 只留 Lab，R2 不授权道路；新的 runtime 施工需后续授权。

## 2. 启动与依赖

`npm run dev` → `http://127.0.0.1:4180/`；3D 加 `inkbox.html?renderer=3d`，可切回 Canvas，复用同一世界。
运行服务器需要 Node 18+；零依赖 CDP 浏览器测试需要 Node 22+，CI 使用 Node 24。
Three 固定为 `0.186.1`：浏览器 importmap 读 `vendor/three/`，Node 测试读 npm 依赖。修改版本后执行 `npm run vendor:sync` 和 `npm run test:vendor`；vendor 的 LF 策略由 `.gitattributes` 保证。

## 3. 推进、渲染与编辑边界

- `sim/advance.js` 的 `advanceWorld(world, days, deps)` 定义完整世界的游戏日推进；Sandbox 的 `advanceDays` 是游戏侧接线。
  完整世界回归使用这条推进链；隔离子系统测试可直接测试对应函数，不复制一套完整时钟。
- 模拟世界是数据真相。渲染不抽模拟 RNG、不反写实体 / 生态、不把 renderer dirty 或派生量写入存档。
  `WorldRenderBridge` 与各 Layer 自管快照和刷新周期。
- `PresentationStage.ingestWorlds` 是 runtime event 唯一消费口；Canvas 画 `drawPlane`，Three 读取冻结的 `snapshotPlane`，不另 drain。
- Canvas、Three、`riftViewOpen` 共用 `getRealmViewState({selection, toolId})`。Region 始终是世界格坐标，规则见 VIEW_CONTRACT v2。
- 按实际可见地形 / 实例几何拾取，返回 plane；跨界检视只读。斜视的合法前景遮挡保留。
- 地形编辑是显式例外：`terrain/sculpt.js` 只改 height，Adapter 仅在凡间且 Mask / Slab 关闭时允许雕刻和撤销。
- world / 子世界 / 尺寸 / 地形数组身份变化会释放并重建 Stage 集合，保留 GPU 与相机；缺失位面回退凡间。

## 4. 文档责任与冲突处理

| 文档 | 唯一职责 |
| --- | --- |
| [ROADMAP](./ROADMAP.md) | 当前阶段与下一轮设计方向 |
| [ARCHITECTURE](./ARCHITECTURE.md) | 工作区地图、模块边界、仓库 / 发布包归属 |
| [THREE_REALMS](./THREE_REALMS.md) | 三界模拟规则 |
| [VIEW_CONTRACT](./VIEW_CONTRACT.md) | renderer-independent 视界规则 V1–V11 |
| [文案使用说明](./剧情文案素材/00_文案使用说明（AI与开发者必读）.md) | 文案声音、UI 禁令、考古定名与素材接线 |
| [BACKLOG](./BACKLOG.md) | 未完成事项；已完成编号只留关闭记录 |
| [STATUS](https://github.com/sjh20016/inkbox/blob/e1e55039bb56efda7a307513ede07a9fab3bf534/STATUS.md)、各阶段委托书 / 报告 | 按日期保留的历史与证据，不充当当前施工指令 |

用户最新明确指令决定范围；源码与实际执行结果决定“已经做了什么”。若实现与契约冲突，记录差异并处理当前授权范围，不能为通过测试静默改规则。
历史文档里的旧阶段编号、旧禁令、旧计数不覆盖当前契约。本地 `.workbuddy-ai/memory/` 不新增另一套规则，也不作为发布包必读依赖。

## 5. 验证与 CI

当前七个委托命令如下，Leyline 单独定位还可跑 `npm run test:render3d:m2c2c:leylines`；测试职责与历史入口见 [tests/README](./tests/README.md)。

```bash
npm run test:render3d:m2c2c
npm run test:render3d:m2c2c:sites
npm run test:render3d:m2c2c:fields
npm run test:render3d:m2c2c:rifts
npm run test:render3d:m2c2c:purity
npm run test:render3d:m2c2c:browser
npm run test:render3d:m2c2c:soak
```

Fast 保留全部旧 CPU 门禁并加入当前 C2C CPU 套件；手动 [c2c-browser.yml](./.github/workflows/c2c-browser.yml) 独立运行当前阶段和 M2-B / C2B sample 两个关键祖先。`ci.yml` 的手动 Browser job 保留完整历史回归，Heavy / Nightly 的分层不变。浏览器验收与 Soak 串行执行，不以 CPU submission 或 RAF 间隔冒充 GPU timer 时间。

| 门禁 | 命令 / 环境 |
| --- | --- |
| Fast Gate（push / PR / 手动） | core、view、presentation、render3d、render3d:m1、render3d:bridge、render3d:m2a、m2b、m2c、m2c2a、m2c2b0、vendor、build |
| Heavy Gate（与 Fast 并行） | regression、three-realms、save-equivalence |
| Browser Smoke（仅 workflow_dispatch） | Windows Edge wrapper 顺序跑 Canvas 至 M2-C2B0；后续独立 steps 分别跑 C2B0 soak、C2B Pass 1 Browser 矩阵与 C2B Pass 1 soak |
| Nightly（schedule / 手动） | `test:simulation` + `inkbox:longrun`；没有 `test:longrun` 入口 |

命令与用途详见 [tests/README](./tests/README.md)。本地浏览器测试先起 4180；playtest 的 `--port` 是 CDP 端口，游戏地址用 `--url`。
普通 CI 不运行浏览器和 800 年长测，不删测试、不把断言改警告、不加 `|| true`。
M2-A 的本地证据在 `reports/release/render3d-m2a/`；CI 的 `inkbox-browser-smoke.mjs` 自管服务器与六套测试的生命周期，分别记录退出码；重跑写入独立目录并上传 Actions artifact，不覆盖硬件基线。C2A 代表性证据在 `reports/release/render3d-m2c2a/`，完整本地采样在 `reports/m2c2a/`；soak 单独执行，不与性能采样并发。
M2-C 最新 Edge 复验见 `reports/release/render3d-m2c/browser/`。旧 M2-A oracle 已补齐 M2-B 可见界缘及独立解码，原样本与退出门禁保留，不能通过隐藏界缘或跳过样本来消除偏差。
旧阶段固定断言数与文件数只保留在对应报告；save-equivalence 的断言数量会随内容变化，不能当稳定指标。

## 6. Git、发布包与本地文件

`npm run build` 生成 dist 目录及 ZIP；收录依据 `scripts/inkbox-package.mjs` 的 FILES / DIRECTORIES。
Git 的源码、素材和开发记录范围大于发布包，具体归属见 ARCHITECTURE。尤其注意：

- `剧情文案素材/` 是活跃文案资产，已入 Git 且随包；`美术素材/` 的设计输入见参考索引，产品只加载已接入的代码母版，整套参考包不进运行包。
- `scripts/_*.mjs` 是已入 Git 的历史一次性探针，保留参考，不在 npm / CI / build 门禁中。
- 历史 `reports/release/render3d-m2a/`、`render3d-m2c/` 的证据保留在开发目录，运行包仅收录打包白名单列出的摘要；`render3d-m2c2a/` 只长期保存代表图及摘要，不放重复大矩阵。C2C 的 `research/`、Golden、完整 PNG / JSON / 日志不进 runtime，文档只给开发路径；其他 reports 与 `*.log` 是本地 / Actions 输出。
- `.workbuddy-ai/`、`.local-backups/`、node_modules、dist 不入 Git。备份不能作为源码或发布依赖。

## 7. 开发纪律

不借 cleanup 改模拟、存档、概率或玩法。P2 问题记 BACKLOG，不顺手修。
新模拟随机流、身份与存档纪律以 THREE_REALMS 为准；观测层禁消费模拟 RNG。
测试造世界走真实工厂；聚焦成功不等于目标未被山体遮挡，浏览器断言须等状态就绪。
Windows 出现 `spawnSync EBUSY` 时按当次环境故障诊断并申请所需执行权限，不能宣称自动构建已通过或长期要求手工补 ZIP。
提交按可验证的变更拆分，源码与必要测试一起提交，文档可独立提交；不要把一轮所有资产 / 架构 / 测试压成一个提交。

C2B0 完整证据在忽略目录 `reports/m2c2b0/`；Git 只留 `reports/release/render3d-m2c2b0/summary/` 与 8 张代表 golden。GC/资源耐久与性能计时串行运行。运行包只包含精确白名单，源 `.blend` / `.blend1`、preview 与完整 release evidence 留在开发工作区。
