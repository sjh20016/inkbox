# G4-P1B 接线契约（S0）

日期：2026-10-17
分支：`feat/g4-p1b-hydrology-rules-optin`
施工基线：`9801292581e6370ec88d0c600e6aa57fdade123a`（远端 P1A）
核验的远端 main：`e1e55039bb56efda7a307513ede07a9fab3bf534`
环境：Windows PowerShell、Node.js v24.11.1、npm 11.6.2；工作树独立且起始 clean。

## 规则身份

凡间 `World.hydrologyRules` 是唯一持久规则身份：

- `legacy-v1`：正式现行水文，也是所有常规创世和旧存档缺字段的语义。
- `static-sea-v2`：只允许在新建凡间世界时显式 opt-in；读此标识的存档时恢复候选规则。
- 字段缺失仅在兼容旧存档时按 `legacy-v1` 处理。显式 `null`、空字符串、错误大小写、非字符串及未知标识必须 fail closed，不能静默回退或替换当前世界。
- 上界和幽冥不继承、不保存该标识，也不运行 V3 水文。

## 创世、运行与加载边界

- `src/inkbox/ui/worldCreation.js:44-54` 的 `creationOptions(overrides)` 重新构造创世参数；实验字段必须由此显式白名单传递。
- `src/inkbox/main.js:375-390` 的 `newWorld()` 创建后，须在首次 TerrainLayer/Stage/Camera 消费前只初始化凡间规则；未显式传入规则的新世界固定为 V0。
- 面板事件 `main.js:998-1002`、启动创世 `main.js:363`、随机开天 `main.js:1180-1184` 均通过既有新世界路径；它们没有显式 opt-in 时不得进入 V3。
- 槽位读取 `main.js:1042-1064`、文件导入 `main.js:1133-1149` 必须先在候选 World 上验证规则和完成必要恢复，再替换活 World。失败须保留当前活世界与原槽位内容。
- 固定水文 tick 位于 `main.js:2067-2079`：只将原调用换为唯一规则 dispatcher；保留真实时间 `0.16`、每 RAF 最多 3 步、`dtDays=4`、暂停与 3D stroke 守卫、`dirty` 及原有累积节拍。规则身份不可全局化。
- 凡间存档根对象显式写 `hydrologyRules`。v1–v11 旧档字段缺失时仍为 V0，且不静海归一化。未知规则在创建/替换候选 World 前拒绝。凡间 V3 恢复所有地形层、灵脉、类型与 qi 后、首个渲染或水文 tick 前执行一次 P1A 初始化。保持 `SAVE_VERSION=11`，除非发现必须升级 schema 的证据；此时停止并报告。
- `serializeUpperWorld` / `serializeNetherWorld` 从子界 payload 明确删除凡间专属规则标识。

## 不变量与边界

1. 默认产品、普通创世、随机开天和无字段旧存档继续调用原 `stepHydrology(world, 4)`；V0 地形、水位、RNG、日历与更新时间行为不变。
2. V3 仅通过显式新世界参数 opt-in；不加 UI/URL/全局开关，不提供存量 V0 热切换，不自动迁移或覆盖玩家旧档。
3. V3 水文初始化只复用 P1A 冻结 `prepareStaticSea` / `stepHydrologyStaticSea`，不改公式、顺序或冻结 Oracle。
4. History/笔刷事务不改写。暂停编辑 V3 海域不会立即归一；不暂停后下个真实 V3 tick 归一。暂停编辑并存档，重读 V3 时会在首次消费前归一，可能因 Uint16 水深量化而轻微改变海面水层。报告必须记录受影响格数、最大改变量、type/qi 变化与耗时；不得声称 Float32 水层按位相等。读档前 History.undo 仍按现有事务工作，读档本身保持既有 clear 行为。
5. 所有低于 `SEA_LEVEL` 的格子按 P1A 语义视为静海，不判断外海连通性；封闭低盆可能被填至海平面，作为未决产品风险记录。
6. 新测试必须覆盖 A–H 固定组，并至少走一次生产 `update()` 真实分发。预算：主定向脚本一次，只有同范围修正时复验一次；历史 core、regression、save-equivalence、three-realms、qol 各一次。由于改动主程序静态导入图，还需 `npm run build` 和 `npm run test:package` 各一次。真实浏览器仅做限定 S3 短测，不用 Node 计时替代 GPU。

## 基线与冻结门禁证据

P1A 独立工作树位于 `.worktrees/g4-p1a-remote-verified`，HEAD 为上述 P1A SHA。为绕过本机 `core.autocrlf=true` 对工作树物理字节的转换，只在该独立树对冻结文件执行 `git -c core.autocrlf=false checkout HEAD -- scripts/fixtures/g4-p1a/variants-r2.mjs`；文件恢复为委托要求的原始 SHA-256 `22aa5b602a7e151235afafa763eeab1221334eb2b4dbe8ffa0990ee82a36e44b`，Git 状态仍 clean。随后执行：

```text
node scripts/inkbox-g4-p1a-static-sea.mjs
exit code: 0
result: PASS A–F; V0 reverse check PASS; exact tolerance 0
```

P1A 源码保护断言保持原样；P1A 门禁只在该独立、未修改的 SHA 工作树执行。
