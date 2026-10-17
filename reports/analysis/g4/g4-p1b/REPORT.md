# Inkbox G4 P1B 执行报告

状态：ENV_BLOCKED
日期：2026-10-17
分支：feat/g4-p1b-hydrology-rules-optin
施工基线：9801292581e6370ec88d0c600e6aa57fdade123a（远端 P1A）
执行前远端 main：e1e55039bb56efda7a307513ede07a9fab3bf534
P1A 冻结 fixture SHA-256：22aa5b602a7e151235afafa763eeab1221334eb2b4dbe8ffa0990ee82a36e44b

## 结果

实现和 A–H 定向门禁通过；代码尚未达到可发布状态。稀疏工作树缺少构建与文档审计所需的仓库输入，且浏览器 CDP 无法建立连接，因此状态为 ENV_BLOCKED。改动留在独立 P1B 分支，没有创建 PR 或合并。

## A–H 门禁

- A 默认创世为 legacy-v1：PASS。
- B 显式 static-sea-v2 opt-in，并经过 Sandbox.update() 生产调度路径：PASS。
- C v11 与 v7 旧存档缺字段仍按 V0 恢复：PASS。
- D V3 槽位和文件存档的纯文本、gzip 路径：PASS。
- E 9 种无效规则 fail closed；失败时没有存储写入：PASS。
- F 凡间、上界、幽冥三界隔离：PASS。
- G 编辑、暂停、undo 与下一次水文 tick 行为：PASS。
- H newWorld、槽位和文件导入的 World 生命周期：PASS。

V3 存档恢复归一化了 432 格中的 206 格；最大水量变化 7.644295692443848e-06，type 和 qi 变化均为 0，反序列化与准备用时 2.6669 ms。数值说明见同目录 summary.json。

## 验证

- 独立 P1A worktree：node scripts/inkbox-g4-p1a-static-sea.mjs，exit 0；A–F、V0 reverse check 通过，tolerance 0。
- P1B 定向门禁：node scripts/inkbox-g4-p1b-rules.mjs，最终运行 exit 0，P1B_NODE_PASS。
- npm run test:core：exit 0。
- npm run test:regression：exit 0，22 cases。
- npm run test:save-equivalence：首次因 fixture 缺少显式 V0 元数据失败；只给 fixture 补上 legacy-v1 后重跑，exit 0。
- npm run test:three-realms：exit 0。
- npm run test:qol：exit 0，116 assertions。
- npm run build：exit 1。补齐缺失的 CI workflow 后，构建停在稀疏 checkout 未检出的 美术素材/参考资产索引.md。
- npm run test:package：exit 1，稀疏源码树中有 132 个未解析 Markdown 链接；构建未成功生成可审计包。
- S3 Edge/Chromium 短测：BROWSER_BLOCKED。Edge CDP 连接两次均在 scripts/cdp.mjs 建连阶段失败；没有浏览器帧证据，也没有继续重试。

core/regression/save-equivalence/three-realms/qol、build 和 package audit 各按委托规定执行。Node 门禁完整结果保存在 summary.json。

## 已知产品风险

- 手动编辑海面后，静海约束会在下一次水文 tick 才恢复。
- V3 读档时 Uint16 水深量化会产生小幅归一化变化；本次最大水量变化为 7.644295692443848e-06。
- 按 P1A 语义，所有低于 SEA_LEVEL 的封闭低盆也会被视为海。

## 提交与后续

改动按实现/测试和报告/证据拆为两个聚焦提交，并推送到独立分支 feat/g4-p1b-hydrology-rules-optin。没有创建 PR 或合并。解除 ENV_BLOCKED 需要在完整 checkout 中重跑 build、package audit，并在可工作的 Edge/Chromium CDP 环境完成限定 S3 短测。
