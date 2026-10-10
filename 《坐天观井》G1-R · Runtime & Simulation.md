# 《坐天观井》G1-R · Runtime & Simulation
## Codex 主力工程开发委托书 v1.0

### 一、任务定位

仓库：`sjh20016/inkbox`

施工分支：`feat/g1-runtime-codex`

当前已知主线基线：`fc612ac9470b48aaaa3291b7fc39a9e0bdf87fff`

任务：完成 G1 活世界第一闭环的运行时、真实数据、模拟干预、身份管理、地图成长规则和测试体系。

**本轮不负责正式人物卡的 DOM 布局与 CSS 视觉。**

它们由独立网页端分支 `feat/g1-presentation-web` 完成。

两边最终统一集成，未经集成验收不得修改 main。

### 二、开工与版本约束

1. Fetch 最新 `main`。
2. 确认没有意外的主线更新。
3. 从双方共同确认的同一个 BASE_SHA 创建本分支。
4. 不从历史 G0 分支直接开发。
5. 不修改 `B数值系统`。
6. 不提前合并网页端分支。
7. 不为等待网页端交付而把大量未验证代码留在工作区。

允许阅读：

`archive/g0-character-fate-web-20261008`

重点参考：

- `heavenEdicts.js`
- `characterCardData.js`
- `characterPanel.js`
- `characterPick.js`
- `inkbox-character-check.mjs`

旧归档只用于复用有效设计，不允许用旧 `main.js` 或 `railPanels.js` 覆盖新代码。

### 三、Codex 专属文件权限

允许修改：

- `src/inkbox/main.js`
- `src/inkbox/ui/railPanels.js`
- `src/inkbox/render3d/Render3DAdapter.js`
- `src/inkbox/render3d/picking/PlanePicker.js`
- `src/inkbox/sim/**`
- `src/inkbox/core/**`
- `src/inkbox/world/**`
- `src/inkbox/ui/worldCreation.js`
- `src/inkbox/g1/**`
- `inkbox.html`
- 必要的资产运行时接线
- `package.json`
- `.github/workflows/**`
- 正式回归测试和工程文档

只有实际需要时才修改旧文件。

**禁止创建、修改或覆盖：**

`src/inkbox/ui/g1/presentation/**`

这个目录完全属于网页端。

### 四、双方统一接口契约

Codex 负责从真实 World 生成标准化的 `G1CharacterViewModel`。

网页端只消费这个模型，不能直接接触 World。

第一版结构：

```js
{
  schemaVersion: 1,

  identity: {
    key: "mortal:123",
    id: 123,
    plane: "mortal",
    status: "alive",
    name: "林某",
    canFocus: true
  },

  header: {
    realm: "炼气四层",
    ageText: "23 岁",
    affiliation: "青云门",
    stateText: "修炼中"
  },

  cultivation: {
    exp: 80,
    required: 128,
    percent: 62.5,
    rateText: "每日修为 0.2",
    stateText: "积累修为"
  },

  overview: [
    { label: "灵根", value: "木灵根" }
  ],

  cultivationRows: [
    { label: "气运", value: "62" }
  ],

  history: [
    { day: 720, kind: "sect", text: "拜入青云门" }
  ],

  relations: [
    { label: "所属宗门", value: "青云门" }
  ],

  edicts: [
    {
      id: "cultivation",
      title: "灌顶",
      description: "增加真实修为",
      enabled: true,
      disabledReason: ""
    }
  ],

  watched: false
}
```

这里的数值仅为接口示例，不是演示时可以代替真实 World 的假数据。

约束：

- `identity.key` 是稳定的当世人物身份。
- 对离世、上界、幽冥、不可考人物使用实际可证明的状态。
- 任何缺失事实都必须明确表达，不猜测。
- `percent` 由真实 `exp / expToNext(level)` 派生。
- `rateText` 由现有修炼速度函数派生。
- 命令按钮的 `enabled` 必须反映真实合法性判定。
- 不允许出现独立维护的 RPG 属性表。
- 不能把 DOM 状态写进 World。

网页端组件接口固定为：

```js
createCharacterCardView(root, { onAction })
```

返回：

```js
{
  render(viewModel),
  destroy()
}
```

网页端操作统一上报：

```js
onAction({
  type: "edict",
  targetKey: "mortal:123",
  edictId: "cultivation"
})
```

允许的动作：

- `close`
- `watch`
- `focus`
- `export`
- `edict`
- `show-relations`

分页切换由网页端内部管理。

Codex 接收到命令后必须重新检查：

- 当前世界身份。
- 当前人物是否仍存在。
- 当前身份是否仍有效。
- 目标是否在可操作范围。
- 敕令是否合法。

**不相信 UI 传来的 enabled 状态。**

### 五、C1 · 人物身份与真实数据

建立或复用明确的人物解析与只读快照。

要求：

1. Canvas 能选中真实人物。
2. 3D 通过已有 PlanePicker 解析实体身份。
3. 密集重叠人物能消歧。
4. 不按姓名查找实体。
5. 不绕过 C2E 地图锁区。
6. 不从幽冥窗口错误选中凡间同格人物。
7. 人物离开、死亡、世界替换后，原选择正确失效。
8. 修为、境界、修炼速度由当前正式模拟计算。
9. 存档重载后能重新解析合法人物。

现有 `PlanePicker` 已提供 `entityId`，优先复用，不重新实现全新三维拾取系统。

### 六、C2 · 三项天道敕令

移植并适配旧 G0.5 有效设计：

**灌顶**：增加下一层需求 25% 的修为，遵守上限，突破仍走真实模拟。

**拨运**：现有 fortune 增加 8，遵守上限。

**定心**：现有 mind 增加 8，遵守上限。

必须使用单一命令入口。

禁止在 UI click handler 中直接进行数值计算和实体修改。

成功敕令：

- 修改真实实体字段。
- 输出 before / after。
- 进入正式历史账本。
- 存档后保持。
- 可重复确定性验证。

失败敕令：

- 不修改 World。
- 不修改 RNG。
- 不留下假日志。
- 给出明确原因。

观察操作与天道干预必须分开测试，不能把刻意改变 World 的敕令误判为观察纯度失败。

### 七、C3 · 记挂与长局观察

直接复用：

`sim/watch.js`

当前记挂上限为 12，保持现有规则。

实现：

- 人物卡记挂入口的命令接线。
- 记挂栏进入对应命簿。
- 当前人物长期更新。
- 死亡、飞升、跨界的身份状态。
- 保存和载入后重建观察界面。
- 快进后提供准确重大事件摘要。

不得建立第二套 WatchManager。

记挂仍是观察者状态，不能给予人物任何属性收益。

转世不得无证据自动继承上一世的记挂身份。

### 八、C4 · 创世与地图进度

现有 `ui/worldCreation.js` 已实现创世及手动扩图基础能力。

本轮主要完善其玩法反馈。

保留：

- Seed 0 合法。
- 现有地形 preset。
- 现有尺寸 preset。
- 40 / 60 / 80 / 100% 地图访问阶段。
- 完整 World 预生成。
- 外围模拟继续运行。

增加轻量、可靠的进度判定。

优先使用现有真实世界事件或玩家观察进度，不新增世界数值体系。

所有解锁条件必须能在正常游戏中达到。

保留手动扩图的开发/兼容路径，避免某个稀有事件让世界永久无法展开。

新增进度元数据时，必须明确保存语义与旧档兼容。

网页端只负责显示扩图信息，所有真实进度判定由 Codex 完成。

### 九、C5 · 有限视觉与资产运行时协调

本阶段只允许在已有资产系统中做有限协调。

优先复用：

- CharacterLibrary
- CharacterBatch
- CharacterLODAssets
- EnvironmentAssetLibrary
- 既有 LOD / HLOD
- 正式资产色板

可以调整材质参数、色板映射、实例视觉表现，使修士、树木、建筑更协调。

不能借此大规模扩产。

不新增第二套人物材质架构。

真实视觉与 GPU 验收由 Codex 承担，网页端不负责证明 Three.js 性能。

如果这部分需要较多美术判断，可以放到 G1 后半段独立完成，不能阻塞人物核心闭环。

### 十、C6 · 先完成可独立验证的 Runtime

Codex 分支未合并网页端之前，必须可以独立测试：

- 人物解析。
- 快照模型。
- 敕令命令。
- 记挂接线。
- 长期模拟。
- 创世和地图成长。
- 存读档。
- 身份生命周期。

不要直接 import 尚不存在的网页端组件，导致 Codex 分支无法独立构建。

可以先保留现有旧人物展示路径，使用 headless controller / mock presenter 验证命令。

正式 `createCharacterCardView` 的 import、样式加载和 UI 替换，留到两个分支汇合时接入。

不要在自己的分支里复制网页端组件作为临时占位文件。

### 十一、测试要求

新增 G1 Runtime 相关测试。

至少覆盖：

- 合法与非法人物 ID。
- 实体死亡和复用身份。
- 3D 可见身份。
- 锁区人物无法操作。
- 修为数值来源。
- 敕令上限。
- 敕令历史。
- 30 年与 100 年长局。
- 观察者不影响模拟 RNG。
- 主动敕令的可重复确定性。
- 新旧存档。
- 地图成长不改变世界生成结果。

完整 Fast / Heavy 门禁必须继续通过。

正式 UI Browser 验收在集成阶段执行。

### 十二、提交和交付

建议分批：

- C1：人物身份 / 快照。
- C2：天道敕令。
- C3：记挂 / 生命周期。
- C4：地图成长。
- C5：有限美术协调。
- C6：Runtime 测试与交接。

完成后：

1. 提交全部已验证修改。
2. Push `feat/g1-runtime-codex`。
3. 确认工作区 clean。
4. 保留该分支，不合并 main。
5. 输出 Runtime HEAD SHA、测试结果和待集成文件清单。

如果有 PR，创建 Draft PR 指向 main，明确标记：

**Do not merge independently.**

### 十三、最终集成责任

两个分支均完成后，由 Codex 承担最终集成。

但只有用户明确发出“开始 G1 集成”指令后才执行。

届时：

1. 从最新 main 建立 `integrate/g1`。
2. 整合 Codex Runtime。
3. 整合网页端 Presentation。
4. 接通 ViewModel 与 Component。
5. 将原人物卡替换为共享 G1 命簿。
6. 接通 CSS、创世与扩图显示。
7. 修复真实接口差异。
8. 运行完整 CPU / Browser / 性能 / Package 验收。
9. 完成百年观命真实试玩。
10. 整理正式文档。

仅当全部核心验收成立时，才允许合并 main。

**G1 Runtime 分支自身成功，不等于整个 G1 已经完成。**

---

## 最终要求

你负责“世界真实发生什么”和“玩家修改世界的正式命令”。

网页端负责“玩家如何看见、理解和操作”。

请严格保护两个职责的边界。

不要为了方便而抢占网页端工作。

目标是让双方可以真正并行开发，而不是最后得到两份互相覆盖的人物卡。