# Inkbox Backlog

## P0 阻塞

- 暂无。

## P1 当前版本重要

- D6-2 三界生态闭环：让凡界 / 上界 / 幽冥都具备最低限度但**真实运作**的生态循环，
  为 D6-3「视界与跨界生态」打基础。
  施工顺序 **A → B → C → D → E → F**（每个工程包一个独立任务，做完一包就停）。
  - A 三界设计状态固化 → `THREE_REALMS.md`（**已完成 2026-09-24**）
  - B 裂隙目标位面化（**已完成 2026-09-24**）
  - C 上界空间生态（**已完成 2026-09-24**；上界实体不再固定在出生点——
    低频目标选择 + 简单移动 + `upperWalkable` 检查，不做寻路）
  - D 幽冥最低生态（**已完成 2026-09-24**；鬼魂 / 鬼修不再定格在落点——
    普通鬼魂沿冥河窄带活动 + 鬼修分档活动范围 + 阴气 `veg` 影响积怨增速 +
    消散地点轻量留痕 + 高阶鬼修空间吸引；**零 rng**，不做鬼城 / 鬼宗 / 寻路）
  - E 三界统一生态读数（**已完成 2026-09-24**；在现有「三界」面板行上**追加**「生态 生/亡（/逐）」，
    不新增区、不改 CSS 类、不动原有子串；口径单源 `upperEcoStats` / `netherEcoStats`）
  - F 三界生态不变量回归（**已完成 2026-09-24**；新增 `scripts/inkbox-three-realms.mjs`
    （`npm run test:three-realms`），七节 61 条：时间 / 世界身份 / id 空间 / 上界闭环 /
    幽冥闭环 / 存读档 / 裂隙目标。**不改任何生产逻辑**）
  - ⚠️ 已被本阶段**取代**的旧条目：「D6-2 新手与观察层」——观察层由 E 包承接，不再单列。

## P2 后续体验

- 根据 D6-2 测试结果，收敛工具提示和事件阅读路径。
- 继续检查灾祸以外的重要持续事件是否也需要可读的结局记录。

## P3 记下来但本阶段不做（D6-2/D6-3 明确禁止事项）

> 这一节是**备忘录，不是待办**。想到这些内容时记在这里，不要施工。
> ⚠️ **D6-3 解冻了其中四项**：鬼进入凡间 / 凡人跌入幽冥 / 夺舍 / 幽冥物品泄漏
> （凡人跌入幽冥已随 D6-3 工程包 A 出货；鬼进入凡间已随工程包 B 出货；
> **幽冥物品泄漏已随工程包 C 出货**；夺舍仍在「未开工」状态，**不是**可以顺手做的）。
> 下方清单里其余条目**仍然禁止**。

### 既有基线红（2026-09-24 实测 · 与本轮 A/B 改动**无因果** · 未施工）

- **`intervention` 漏配 `KIND_TAG`**：`main.js` 的 D6-1 干预反馈路径
  `world.record(outcome.message, 'intervention')` 用了一个 `KIND_TAG` 里没有的 kind。
  smoke 断言「源码里用到的 kind 全都在 KIND_TAG 里」因此常年红（漏配 1 个：`intervention`）。
  核实：玩家侧无按 kind 筛「干预」的入口 ⇒ **无玩家可见后果**。修法待定（补 `KIND_TAG` 条目，
  还是把该 kind 改成已有类目），需先确认编年史分组语义，故不在 D6-2 顺手改。
- **`worldEventState` / `worldEvents` 键名不匹配**：`World.js:243` 属性名是 `worldEventState`，
  而 `save.js:585` 序列化时写成 `worldEvents` ⇒ save-equiv 三条断言红
  （serialize 漏写 `worldEventState` / payload 凭空多出 `worldEvents`）。
  核实：**不是 A/B 引入的**，但也**不是「D6-2 之前就有的」**——
  2026-09-23 14:26 的 save-equiv 日志里这两条还是**绿的**（payload 顶层 45 键、world 侧 61 键全部有着落）；
  现在 payload 顶层 **46 键**，多出来的正是 `worldEvents`。
  ⇒ 是 **D6-1 世界事件序列化**那一步引入的（`save.js` 新增该键时没在 `World.js` 上同名落地）。
  玩家可见后果：无（读档走 `data.worldEvents`，写档走 `world.worldEventState`，两边自洽）。
  修法待定（`World.js` 属性改名成 `worldEvents`，或 `save.js` 序列化键改名 + 老档兜底），
  会动存档格式 ⇒ 留到专门处理存档契约的包，不在 D6-2 顺手改。

- **`decayYears < 0` 的「永不消散」哨兵与实现相反**（2026-09-24 · 工程包 D 施工时实测）：
  `spawnNetherGhost` 把 `decayYears < 0` 落成 `ghostDecayDay = -1e9`，注释写的是
  「`-1e9` = 永不消散」；但 `stepNether` 第 2 步的判据是 `day >= e.ghostDecayDay`
  ⇒ `0 >= -1e9` **恒真** ⇒ 传负数的鬼魂**立即消散**（与注释相反）。
  核实：生产路径 `reincarnation.js` **不传** `decayYears`（用默认 `GHOST_DECAY_YEARS` /
  `CULTIVATOR_DECAY_YEARS`，都是正数）⇒ **无玩家可见后果**，只有手工造实体的测试 /
  探针会踩。修法待定（把哨兵改成 `+Infinity` 或大正数，并同步注释），
  因会动到 `GHOST_TEMPLATE` 的默认值与「哨兵语义」契约，故不在 D6-2 顺手改。

- **`npm run build` 的 tar 分支在「GNU tar 排在 System32 之前」的 PATH 下会失败**（2026-09-24 · F 包收尾实测）：
  `scripts/inkbox-package.mjs` 的 win32 分支调 `tar.exe -a -c -f <绝对盘符路径> -C <tmp> .`。
  Windows 自带 `C:\Windows\System32\tar.exe`（bsdtar）**原生认盘符**、能跑通；
  但 Git Bash 的 `usr/bin/tar.exe`（GNU tar 1.35）会把 `E:\...` 当成远程主机 ⇒
  `tar: Cannot connect to E: resolve failed`（rc=128）。node 的 `spawnSync('tar.exe')` 按 PATH 取第一个
  ⇒ 在 Bash 工具环境（PortableGit 优先）下必红，在普通 cmd/PowerShell 下正常。
  ⚠️ **不能加 `--force-local` 修**：bsdtar **不支持**该选项（会报 `Option --force-local is not supported`）。
  核实：产物本身没问题——把 System32 提前后打包成功（D6-3 B 时 **71 files**），包内 `scripts/inkbox-three-realms.mjs` /
  `THREE_REALMS.md` / 导出的 `DECAY_TRACE_VEG` 都在。修法待定（改用相对路径 + `cwd`，或探测 tar 种类，
  或改用 node 内置压缩），属**开发者工具链**问题、无玩家可见后果，故不在 D6-2 顺手改。

- **测试脚本里引用未 `import` 的标识符 ⇒ 抛 `ReferenceError` 直接中断，不是红一条**（2026-09-24 · D6-3 A 实测）：
  `scripts/inkbox-smoke.mjs` 的新断言里用了 `RIFT_SEED_KEY`（派生键逐对比较），但那条
  `import` 漏了它 ⇒ 跑到第 352 条时 `ReferenceError: RIFT_SEED_KEY is not defined`，
  **整个 smoke 中断**（后面 100+ 条一条都没跑），而日志尾部看起来像「只红了 1 条既有基线」。
  ⚠️ `node --check` **抓不到**未定义标识符（它只做语法分析）。
  ⇒ 看 smoke 日志时**先确认结尾是「全部通过」/「N 项未通过」而不是堆栈**；
  改完断言后**不要只看 grep 的红计数**。无玩家可见后果（只是测试脚本），已当场修。

- **新增「凡间专属」世界级键时，「写侧 `delete`」与「save-equiv 豁免表注册」是同一个改动的两半**（2026-09-26 · D6-3 B 实测）：
  `serializeUpperWorld` 里显式 `delete payload.wraiths / wraithLog`（上界不跑鬼影），
  但 `scripts/inkbox-save-equiv.mjs` 的 `UPPER_NOT_SAVED` 是一张**需要理由的缺席名单**——
  不注册就会报「上界 serialize 漏写：wraiths wraithLog」。这条红**很像产品 bug**（读档后凭空消失），
  实际只是**豁免表没跟上**。⇒ 新增凡间专属键时，两处一起改：
  ① `serializeUpperWorld` / `serializeNetherWorld` 的 `delete`；
  ② `UPPER_NOT_SAVED`（上界）+ `NETHER_FORBIDDEN_KEYS`（幽冥）+ `upperForbidden`（正面断言上界恒空）。
  同类坑：`worldKeys`（「序列化结果顶层含全部世界级新字段」）也要补键名。
  无玩家可见后果（只是测试），已当场修。

- **`hash32`（FNV-1a）对「前缀相同、只差末尾数字」的短串有极强高位偏置**（2026-09-26 · D6-3 C 实测）：
  实测 `hash32('nether-item:<seed>:0..9') / 2^32` **全部落在 0.70–0.74**，
  于是 `h / 2^32 >= 0.55` **恒真**、`NETHER_ITEM_CHANCE` 形同不存在，
  10 个判定点只出 **1** 件（应为 ~5.5 件）——**不报错**，只是世界悄悄少了一大半东西。
  ⚠️ 这不是 `hash32` 的实现 bug，是「**把哈希当均匀分布用**」这个用法的问题：
  FNV-1a 是**雪崩性很弱**的哈希，相邻输入的输出高位高度相关。
  ⇒ **纪律**：凡是要拿哈希值当 `[0,1)` 均匀数用（判概率阈值、选下标），
  **必须先过一遍 `hashStep`**（murmur3 风格 finalizer，混一次即可消掉偏置；
  实测同一批样本 < 0.55 的有 8/10）。
  已当场修（`stepNetherItems` 里 `h = hashStep(h)` 后再判），并在该处留了长注释。
  ⚠️ 凡间 `stepArtifacts` 用 `rng()` 没有这个问题——这是**幽冥专有**的坑
  （幽冥没有流可挂，只能靠哈希）。将来任何「无流模块」用哈希判概率，都要照这条做。
  无玩家可见后果之外的**数值**后果已消除；作为**故障类**记在这里。

- **测试判据不要写成「实体数不变」——凡间是撒过人的**（2026-09-26 · D6-3 C 施工时自纠）：
  幽冥物品跑满一生时，缝口附近**可能**恰好站着一个活人，他会走 A 包
  `fallIntoNether` **合法地**跌进幽冥。写成「`w.entities.length` 不变」会让这条断言
  **取决于地形与种子**（今天绿、换个种子红，而红的理由与物品系统毫无关系）。
  ⇒ 改成**守恒式** `剩下的 + fellIn 增量 === 原来的`（与种子无关，且它抓的正是
  「这个系统偷偷动了几人列表」这个故障）。C 包的 F10② 已按此写。
  ⚠️ **同类隐患（未施工）**：F9① 的「凡间 `world.entities` 一个数都没动」用的是**同一形状**
  的判据（缝在 (30,30)、凡间撒过人）。它现在绿是因为那 8 个种子里恰无人在缝口半径内——
  属**运气**，不是契约。若将来换种子 / 换 preset 后它红了，**先怀疑这条判据**，
  照 C 包的做法改成守恒式，**不要**去改生产逻辑。属测试健壮性，P3。

- **常量式 `kind` 会同时撞 smoke 5l 的两条假红**（2026-09-26 · D6-3 D 实测）：
  D 包新增两个 kind（`possess-cross` / `haunt`）走**模块级常量**（`CROSS_POSSESS_KIND` / `HAUNT_KIND`，
  与既有 `RECORD_KIND` 同款），第二参不是字符串字面量 ⇒ 5l 的 kind 审计同时判
  「**死映射**」（它们在 `KIND_TAG` 里，但源码扫描取不出名字）与「**未豁免**」两条**假红**——
  两条都不是产品 bug，却长得像「编年史 kind 没登记好」。
  ⇒ **纪律**：新 kind 用常量写时，**三处一起改**：`biography.js` 的 `KIND_TAG` +
  `MILESTONE_KINDS`（若该 kind 传 `actors`）+ `scripts/inkbox-smoke.mjs` 的 `NON_LITERAL` 豁免表。
  ⚠️ 豁免表**只给「静态取不出名字」的调用用**——正则太窄导致的取不出名字要**修正则**，不是加豁免
  （`rift-lost` 当年就是这么被误判的）。

- **两个同名 `cultivation.js`**（2026-09-26 · D6-3 D 实测）：
  `src/inkbox/core/cultivation.js`（`RIFT_CROSS_MAX_LEVEL` 等常量）与
  `src/inkbox/sim/cultivation.js`（`initEntity` / `awaken` / `stepEntity` 等**运行时**）。
  F11 首跑时把 `initEntity` 从 `core/cultivation.js` import ⇒
  `SyntaxError: The requested module … does not provide an export named 'initEntity'`，
  **直接中断整个回归脚本**（`node --check` 抓不到「导错文件」——它只查语法，不解析导入成员）。
  ⇒ 引用 `cultivation` 的符号前先 `grep -n "export .* <符号>"` 两个文件都查一遍。

- **本机 `spawnSync` 被环境拦截（EBUSY）**（2026-09-26 · D6-3 D 打包时实测）：
  `child_process.spawnSync(<任意 exe>)` 一律返回 `EBUSY`（`where.exe` / `cmd.exe` / `node.exe` / `tar.exe` 全试过），
  而 bash 直接跑同一个 exe **正常**。⇒ `npm run build`（`inkbox-package.mjs` 第 89 行 `spawnSync('tar.exe', …)`）
  跑不到最后一步：**copy 步骤已完成**（`dist/…-1.0.0/` 恰好 71 files），只有 `.zip` 生成失败。
  绕过：用 System32 的 `bsdtar` 手工补 zip
  （`tar.exe -a -c -f dist/<name>.zip -C dist/<name> .`）。**属环境限制，不是产品问题**。
  与既有那条「tar 分支依赖 PATH 顺序」的坑**不是同一件事**（那条是 GNU tar 认盘符，这条是 spawn 本身被拦）。

- **playtest 有一条对时序敏感的点击断言（竞态假红）**（2026-09-26 · D6-3 E 验收时实测）：
  `点一个人能摊开「他的一生」（活人传记面板）`（`inkbox-playtest.mjs:1529`）的写法是
  「`scrollIntoView` + `getBoundingClientRect` 取坐标 → `click()`」，中间**没有等重渲染**。
  机器忙时（本机实测空闲内存 0.35 GB）右栏会在取坐标与点击之间重渲染 ⇒ 点击落空 ⇒
  该条判 `未弹出`（但下一条「含固定段」仍绿——因为 `#inkbox` 的 `hidePersonCard()` **只移除 `on` class、不清 textContent**，
  于是残留的旧传记文本让内容判据照常通过，只有 `on` 判据红）。**同一版本三次跑：红 / 红 / 绿**
  （绿时读数 `992 字 · 已弹出`，红时 `228 字 · 未弹出` = 上一次残留）。
  ⇒ **不是产品 bug**（E 包零 `src/` 改动），是测试脚本的竞态脆弱性。
  将来要根治：取坐标前先 `await sleep(0)` 或改成直接 `document.querySelector(...).click()`（不派发真实鼠标）。
  眼下按「重跑即绿」处理。

- **幽冥「邪祟实体 / 仙官鬼差」（用户 2026-09-26 提议 · 本阶段不做）**：
  用户在裁决 C 包「幽冥物品从哪来」时补充：「也可以掉落一些幽冥的邪祟实体和仙官鬼差」。
  ⇒ 那是一整套**新的幽冥实体种类**（各自的行为 / 命名 / 与鬼修六级的关系 / 是否进
  `nether.popLog` 守恒式），属「新大型底层系统」，按开发模式纪律**记 BACKLOG、本包不做**。
  将来要做的话先回答：它们算不算 `鬼魂 / 鬼修` 那两类（决定守恒式要不要扩）、
  命名是否触到考古定名表（§5.6）。

- 幽冥宗门 · 鬼城 · 幽冥战争（幽冥社会系统整套）
- 上界大型政治系统 · 上界完整凡界经济复制
- 第四世界
- 全面轮回重构
- 大规模 AI 行为树 · 复杂寻路（A* 之类）
- 跨界战争 · ~~鬼魂夺舍~~（**D6-3 工程包 D 已解冻**：跨位面夺舍）· 幽冥入侵
- 视界复杂视觉特效 · 裂隙平衡大调
- 多视界同时开启 · 全图永久视界 · 大型 UI 重做
- `world/planes.js` 的 `transfer()` 「架构统一」重写
  （现有 `arriveUpper` / `enterNether` 已稳定运行；真要大量实体往返时，D6-3 再统一）

## ICEBOX 暂停研究

- 暂停长局模拟、随机种子矩阵、极端人口/灾难与性能研究；需要时按需取用现有工具。
- 暂停新世界层、新种族、大型玩法与 AI 行为扩张。
- 原始设计想法与研究记录留在完整开发仓库的归档中；干净项目包不带旧研究材料。
