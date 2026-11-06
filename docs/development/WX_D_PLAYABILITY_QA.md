# WX-D 可玩性检查

- 命簿经历呈现自然选择的原因、对象、代价及结果；地点检视对机缘洞府显示尚有机缘或资源已尽，不列出隐藏奖励。
- `node scripts/inkbox-wx-d-ui.mjs`：CPU 文案检查通过。
- `node scripts/inkbox-wx-d-browser.mjs`：未通过。隔离 Edge/CDP 启动与 profile 清理失败，系统 Get-CimInstance 无法访问 CIM 资源；五页、保存和人物地点回访尚未完成浏览器验证。
- 浏览器脚本复用 WX-C 受控流程，目标为 Canvas 桌面及窄屏、Three 桌面；软件 WebGL 不代表真实 GPU 性能。自然事件、真实 GPU 性能均未由此验证。

补充：人物快照按正式身份解析关系对象，因缘页列出来源、期限、休眠与最近付费互动，经历页显示行动原因和双方身份。`node scripts/inkbox-g1-runtime.mjs` 20 组通过；D 脚本语法检查通过。浏览器脚本只检查实际世界中已结算的付费互动和沉寂洞府，样本缺失时标记跳过并使验收不通过；当前尚未接入成熟存档，不能据此声称 D 场景通过。
