# WX-S1 命途拾章 Alpha · 交付

基于 WX-D Draft [#62](https://github.com/sjh20016/inkbox/pull/62) 的 `c4b169d707704b614344345dfb1cac8fe96d50a9`，隔离分支 `feature/wx-s1-mingtu-shizhang`。开工重新核实 main `bd62ade`，#60 → #61 → #62 均未合并；本包以 `feature/wx-d-yinyuan-chengju` 为 PR 目标，不合并 main、不强推、不清理其他分支。准确最终 HEAD、源码哈希、Draft PR、CI 和证据清单以 `reports/local/wx-s1/acceptance.json` 及 PR 为准，避免文档自引用 SHA。

## 可玩路径与边界

启动 `npm run dev -- --port=4257`，访问 `inkbox.html?wanxiang=1`（Three 加 `&renderer=3d`）。选择真实人物，展开命簿，在「经历」页点击「因果拾章 · 读取 / 刷新」；地点及原物检视点击「因果拾章 · 旧闻」。卡片包含取证日、起点/后续节点、事实来源和经身份校验的对象跳转。五页命簿不变，无大型剧情页面、强制弹窗或自动干预。

四家族均接入：败后问途读取正式失败和后续再到达结果；恩义有回区分受助、结恩、真正付费回助与目标突破；旧物寻踪只认原物 ID，不由履历姓名认旧主；故城余音只接受有灾损/援助/荒废/恢复的地方史，不把附近新村认成重建后代。后续缺失、人物跨界/死亡、原物或地点消失时诚实留白。

只读投影，不增加存档块、模拟消费者或 RNG；不改变现有 Life / advance / readEffects。全局查询仅供手动证据脚本，正式 UI 只在点击时查询当前对象。每人最多一个主观察钩子，世界投影 24 开放/96 已结；旧来源淘汰后不恢复事实。跨界按正式到达日切分，夺舍按本世换主日切分并作引用身份的一部分；未知对方本世身份的历史链接禁用。

S1-E 旧约、额外行动机会、候补故事池和自动新事提醒延后；复用既有记挂的重大事件提醒。死亡名录没有保存 Profile，故死亡后丢失来源时显示不足，不能从旧测试夹具声称可重建完整生平。现有原物失落/朽坏缺少完整逐件历史回执，只显示现况及消散/失考。没有复制旧 GLM 分支或外部引擎实现。

## 文件与证据

- `wanxiang/storyFacts.js`、`storyPeople.js`、`storyWorld.js`、`storySelection.js`、`storyReading.js`：有限来源、身份、候选、预算及只读投影。
- `ui/storyCardsView.js`、`storyNavigation.js`；命簿 presentation、characterRuntime/sandboxRuntime 与 main 检视点最小接线。
- [事实与准入合同](./WX_S1_STORY_CONTRACT.md)、[自然摘录](./WX_S1_NATURAL_STORIES.md)、[性能/保存](./WX_S1_PERF_AND_SAVE.md)、[实际界面验收](./WX_S1_UI_QA.md)。
- `scripts/inkbox-wx-s1-*.mjs` 可复现专项、自然提取、成熟世界比较及三视口浏览器。

## 验证方法

`npm run test:wanxiang:s1` 覆盖四家族、原生付费消费者、同名与转世、到达/夺舍切点、真实逝者退化、稳定预算/冷却/期限、旧档和 v11、100 次只读、原生观察开关的完整事实与 RNG 等价。保留全部 Fast/Heavy，并把 S1 专项加入 Fast。构建显式包含本轮脚本与文档。

三个固定自然种子的百年原检查点在本机缺失、WX-D CI 无 artifact，因此用原有 WX-D 正式生成脚本补齐一次：

```sh
node scripts/inkbox-wx-d-profile.mjs --seeds=20260914,73101,61003 --years=100 --follow=0 --long=100 --out=reports/local/wx-s1/natural
npm run profile:wanxiang:s1
# 仅有明确成熟性能缺口时，从已有100年checkpoint恢复续跑：
npm run profile:wanxiang:s1 -- --extend=400
npm run profile:wanxiang:s1:perf
npm run test:wanxiang:s1:browser
```

自然检查点的生成代码仍是 WX-D 原正式模拟；本轮没有改动模拟源文件。故事抽取、界面和成本测试必须对本轮实际候选重新执行，源码 SHA 和文件哈希保存在 JSON。受控世界仅验证行为边界，不能当作自然事件；额外生成的浏览器上界/幽冥只是满足产品读档契约，不作自然三界长局证明。软件 WebGL 只证明功能，800 年及硬件 GPU 性能未封板。

回退：保留原 WX-D 存档，停用本候选即可。故事层没有保存迁移或新增世界状态；原正式事实、关系、原物和资源由 WX-D 继续维护。
