# Inkbox 开发入口

1. 先读 README.md、HANDOFF.md 顶部、ROADMAP.md、BACKLOG.md。
2. 当前状态以这些入口为准；已清理的 STATUS.md 与阶段报告仅从固定历史提交 e1e55039 读取。
3. 分支与审计见 docs/development/REPOSITORY_WORKFLOW.md。
4. 日期快照会过期，施工前重新核对 Git 与 PR / Actions。
5. main 是唯一正式产品线；G1 已合并。
6. G2-R1 / A1 / G2.4-C 已合并；功能接纳不等于 G2 性能通过，当前转入独立 G2.5 开发。
7. G3 是成本未过的研究，不能当正式功能开发。
8. B 数值系统是独立历史，不普通合并或替换正式参数。
9. 从任务指定已核查基线建隔离 worktree 或克隆。
10. 不覆盖既有修改、未跟踪材料、其他研究 worktree。
11. 合并、关闭 PR、删除分支 / 证据须在当前任务授权内。
12. 不强推、重写历史、批量清理分支或自动合并 main。
13. 唯一活跃产品源码为 src/inkbox。
14. 模块看 ARCHITECTURE.md，接口以源码与对应契约为准。
15. 页面入口 inkbox.html；index.html / game.html 为跳转。
16. 默认 Canvas；Three 用 ?renderer=3d。
17. npm run dev 默认端口 4180。
18. 多工作区使用不同端口、各自拥有的进程。
19. 推荐 Node 24 / npm ci，对齐 CI。
20. 测试以 tests/README.md 与实际 workflow 为准。
21. 文档查差异、链接、状态、白名单和必要包审计。
22. UI 查受影响交互，必要时双 renderer / 关键分辨率。
23. 模拟 / 存档保留 Fast、相关 Heavy、RNG / 保存等价。
24. 3D 性能按对应契约与 GPU 预算验证，GPU 串行。
25. 正式集成保留现有完整发布门禁。
26. npm test 只代表 core，不代表全部门禁。
27. Fast / Heavy 均需通过；失败 / 跳过 / 未完成如实报告。
28. 不删除断言、放宽预算或用旧成功掩盖新失败。
29. 打包是显式清单；文档链接变动后查 build / test:package。
30. 新开发文档不自动入运行包，包外引用由打包器标明。
31. 不擅改 World / Sim / RNG / 保存 / Canvas / Three 行为。
32. 历史材料在 Git 基线 e1e55039；B2 重跑独立授权。
33. 清理仅限本任务可再生输出，保留用途不明的证据。
34. 只清理由本任务创建且归属明确的服务器 / 浏览器。
35. 交付列基线 / HEAD、文件原因、命令退出码与回滚方法。
