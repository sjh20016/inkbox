# 坐天观井 Inkbox · UX/QoL 玩家体验填缝包 v1 · 交付报告（QOL_PASS1）

日期：2026-10-07　｜　分支：main（工作区 `E:/world4/坐天观井-实验分支D1`）
范围：`Q1–Q42`（4 个 Pass）　｜　基线 `main.js` 上限 3084 行

---

## 一、一句话结论

42 项全部落地：**40 项写码，2 项核查后确认「已满足 / 机制齐全」**（Q20 / Q41，均补了断言钉住）。
施工中发现并修掉 **3 个真 bug**——它们的共同点是**判定函数都写对了、只是没人调用**，
纯逻辑测试全绿也照样漏，只有真浏览器跑一遍才现形（详见第四节）。
`main.js` 2541 行（距上限还有 543 行），**未改模拟规则、未改 RNG 流、未动存档 schema**。

---

## 二、完成的 Q

**Pass A · 摩擦清除**：Q1 Escape 分层关闭（`ESCAPE_ORDER` 六层，一次只退一层）· Q2 输入框快捷键保护（含 `isContentEditable`）· Q3 非法操作必须说明原因 · Q4 工具不可用同步 disabled · Q5 当前工具状态行 · Q6 时间速度文字状态 · Q7 撤销状态完整化 · Q8 「关闭视界」按钮 · Q31 `?` 快捷键帮助 · Q32 tooltip 带快捷键 · Q35 检视整数守卫 · Q41 滚轮只在地图缩放 · Q42 拖动/点击阈值复用 `VIEW_CLICK_PX`

**Pass B · 信息互联**：Q9 列表人物可点击 · Q10 宗门/地点成入口 · Q11 Toast 可点击定位 · Q12 检视面板统一操作条 · Q13 最近看过（≤5 条、重复上浮）· Q17 编年史回到最新 · Q18 新记录不抢滚动位置 · Q19 重大事件「查看」入口 · Q36 stale 实体安全降级 · Q37 面板显示所在界

**Pass C · 沙盒连续性**：Q14 记挂标题未读数 · Q15 记挂对象不无声消失 · Q16 记挂动作明确反馈 · Q20 持续事件结局核查 · Q27 空列表空状态 · Q28 长列表折叠 · Q29 折叠偏好记忆 · Q30 收起全部

**Pass D · 存档安全**：Q21 未保存保护 · Q22 存档统一反馈 · Q23 导入失败不破坏当前世界 · Q24 存档槽轻量信息 · Q25 容量预警 · Q26 有意义的导出文件名 · Q33 帮助常驻入口 · Q34 世界信息极简入口 · Q38 防双击重复命令 · Q39 按钮 busy 态 · Q40 destructive 文案统一

### 跳过的 / 降级的

| 项 | 处理 | 理由 |
|---|---|---|
| **Q19「查看」按钮** | 代码就位，**运行时恒不出现**（保持纯文字） | `world.record()` 只写 `{day, year, text, kind}`，**没有坐标也没有 id**，无处可跳。规格明令「无定位信息则保持纯文字」。分支留着，将来事件源带上坐标即自动生效。 |
| **Q20** | **核查结论：机制齐全**，未改码 | `stepCrises()` 三个出口（聚落没了 / 期限失效 / 熬到头）全部收敛到 `finishCrisis()`，后者写 `status` + `endedDay` + `resolved` 并从 `activeCrises` 移除。已补 3 条断言钉住。 |
| **Q41** | **核查结论：结构上已满足**，未改码 | `.main` 是三列网格（左栏｜stage｜右栏），画布只占中间列，滚轮监听器只挂 `#inkCanvas`——右栏上滚的事件链**走不到**画布。已补端到端断言（含反证）。 |

---

## 三、修改文件

| 文件 | 性质 | 说明 |
|---|---|---|
| `src/inkbox/ui/qolState.js` | **新增** 573 行 | 零 import 纯逻辑：Escape 分层 / 偏好白名单 / 折叠 / 最近看过 / dirty 判定 / 槽位与文件名 / 容量与错误文案 / 状态文案。不碰 DOM、不抽 RNG。 |
| `src/inkbox/ui/qol.js` | **新增** 521 行 | DOM 侧控制器。`main.js` 只跟它说话，不直接 import `qolState.js`。 |
| `src/inkbox/ui/railPanels.js` | **新增** 1300 行 | 右栏面板从 `main.js` 抽出（长列表 / 编年史 / 记挂 / 史册 / 槽位 / 折叠）。 |
| `src/inkbox/main.js` | 改 | 删死代码约 206 行 + 34 个死 import；面板改一行委托；接入 QoL 控制器。2541 行。 |
| `src/inkbox/sim/watch.js` | 改 | 抽出 `watchEntryHasNews` 单一判据，`watchHasNews` / `watchNewsCount` 同源（Q14 红点与数字不许各算一遍）。**纯读，不写世界。** |
| `inkbox.html` | 改 | 新增 20 个静态元素 + 对应 CSS（帮助层 / 确认条 / 世界信息 / 状态行 / 空状态 / 折叠按钮 / 收起全部）。 |
| `scripts/inkbox-qol-check.mjs` | **新增** 730 行 | `npm run test:qol`，116 项断言（纯模块 + 源码结构 + 接线 + 纯度门禁）。 |
| `scripts/inkbox-playtest.mjs` | 改 | 新增「11c. QoL 填缝包」段 50 项真浏览器断言；补 `Escape` / `?` 两个按键；两处旧断言重锚。 |
| `scripts/inkbox-view.mjs` | 改 | `selectTool` 的关闭路径断言重锚到 `closeRealmView`。 |
| `package.json` | 改 | `test:qol` |
| `.github/workflows/ci.yml` | 改 | Fast Gate 接入 `test:qol` |

---

## 四、施工中发现的 3 个真 bug（本轮最值钱的部分）

三个都是**同一类病：判定函数写对了，只是没人调用它**。纯逻辑测试全绿，`node --check` 全绿，
只有真浏览器跑一遍才现形——正是本项目最忌的「静默失效」。

**① Q21 未保存保护是空的。** `applyTool()`（玩家雕刻地形 / 施放神力的**唯一入口**）
从不置 dirty；`markDirty` 只在 `newWorld` / `undo` 里各响一次。
后果：**存档 → 雕了半天 → 点「重新开天」→ 改动静默消失**，确认条根本不出现。
→ 在 `applyTool` 补置脏（`terrain` / `intervention`）；`world.watch` 增删（Q16 那条）同理补 `watch`。
→ 刻意**不**发 `advance`：时间流逝是这个世界持续在做的事，算进去会让确认条几乎每次都弹，玩家学会闭眼点掉，保护反而失效。

**② 「最近看过」（Q13）整局都不会出现。** `showPersonCardPanel` 记了 `noteRecent`，
但 `refreshRecentPanel` **不在** 那个 2.5 秒定时器里（它只刷编年史/卜算子/名录/大事记/活人榜/三界/记挂），
也没人就地重画——数据记下了，面板永远空的，不报错。
→ 在 `showPersonCardPanel` 末尾补 `sb.refreshRecent?.()`。

**③ 撤销按钮画完一笔还是灰的。** `history.end()` 提交入栈那一刻没人调 `syncUndoState()`；
而拖拽中那次 `markDirty` 跑在**提交之前**，那时栈还是空的，据此把按钮锁成「没有可撤销的操作」，
一直锁到下一次存档。
→ 在 `history.end()` 之后补 `this.qol.syncUndoState()`。

**顺带修掉的 2 处：**
- **`sectionKey` 把装饰箭头 `▾` 算进了键** ⇒ 键变成「世界▾」，于是 `CORE_SECTION_TITLES.includes('世界')`
  **永不命中**，「收起全部」把核心区「世界」也一起折了——正是 Q30 明令要避免的「界面看着像坏了」。
  用克隆节点摘掉 `.chev` 再取文本。
- **编年史折叠标签按 12 算、实际显示 20**（多报 8 条）⇒ `foldState()` 加 `limit` 参数，
  编年史传 `CHRONICLE_PANEL_LIMIT`。

**这 5 处全部补了「接线」结构断言**，并逐条**实证了断言的敏感度**
（删掉那行 / 把事件名拼错 → 断言确实变红），不是写完就算。

---

## 五、测试结果

| 套件 | 结果 |
|---|---|
| `test:core`（import / core / startup / runtime-events） | ✅ |
| `test:qol` | ✅ **116** 项断言 |
| `test:view` | ✅ **123** 项 |
| `test:presentation` | ✅ **127** 项 |
| `test:three-realms` | ✅ 全部通过 |
| `test:save-equivalence` | ✅ 读档瞬间结构完整 |
| `test:browser`（真 Edge + CDP） | ✅ **196 通过 · 0 失败 · 零运行时报错** |

`test:browser` 新增「11c. QoL 填缝包」段覆盖：Q1 分层（含「一层都没开时 Escape 零副作用」）·
Q2 输入框保护（**含反证**）· Q5 工具状态三形态 · Q7/Q32 撤销按钮 · Q8 关闭视界 ·
Q13 最近看过 · Q14 未读格式 · Q21 未保存保护（**含「确认条出现时世界还没被换掉」**）·
Q28 折叠（**把「另有 N 条」当算术题验**）· Q29 偏好白名单 · Q30 收起全部 · Q31/Q33 帮助 ·
Q34 世界信息 · Q39 忙碌态不卡死 · Q41 滚轮（**含反证**）。

---

## 六、边界自查

| 问 | 答 |
|---|---|
| 新增 localStorage 键？ | **是，2 个**：`inkbox-ui-prefs-v1`（UI 习惯，白名单只放 `collapsed`/`helpSeen`/`folds`）、`inkbox-slotmeta-v1`（存档槽摘要）。旧键 `inkbox.sec` 只读迁移，不再写。 |
| 改正式 save keys？ | **否**。`saveKey` 仍为 `inkbox_sandbox_v1`，`SAVE_VERSION` 仍为 11，`io/save.js` **未改动**。 |
| 改 World / RNG？ | **否**。结构性证明已入 `test:qol`：`sim/**`·`world/**`·`core/**` 共 38 个文件**没有一个** import QoL UI 模块；`qolState.js` 零 import / 无 DOM / 无 RNG；`qol.js`·`railPanels.js` 零 `world.<x> =` 赋值；`watchNewsCount` 调两遍世界 JSON 逐字不变。 |
| 新增依赖？ | 否。 |
| 大规模视觉改版？ | 否。只加了状态行 / 帮助层 / 确认条这类功能件。 |

---

## 七、尚存摩擦（留给下一轮）

1. **Q19 的「查看」仍不可用**——不是 UI 缺，是**记录数据缺**：`world.record()` 不带坐标/id。
   要真能跳，得先让事件源写定位（属模拟侧改动，超出本包边界）。
2. **`DIRTY_EVENTS` 里 `advance` / `load` / `import` 三个词仍未发出**。前者是刻意的（见第四节①），
   后两者由 `resetDirty()` 覆盖。白名单本身保留，作为将来接线时的词汇表。
3. **折叠偏好键在本次修复前写成过 `世界▾` 这种带箭头的形式**——同版本内无已发布用户，
   不影响；但若将来再改标题里的装饰字符，偏好会集体失配（已注释说明）。
4. **`test:browser` 不在 CI 里**（需要本机 Edge + 本地服务器），所以 11c 那 50 条
   靠人工/发布前跑。`test:qol` 已进 CI，把纯逻辑与接线都挡住了。
5. 工作区里另有**与本包无关的 M2-C2D 在制改动**（`render3d/**`、`assets/**`、`.gitignore`、
   `scripts/inkbox-package.mjs` 等）。本轮**没有碰它们**，提交时需按路径精确挑选。

---

## 八、提交

按委托书的 5-commit 策略（A/B/C/D/test）。**待确认**：因改动集中在同一批文件、且工作区
混有无关的 M2-C2D 在制改动，5 段难以干净拆分——见交付说明中的提问。
