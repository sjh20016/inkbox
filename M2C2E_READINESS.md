# M2-C2E 就绪状态

2026-10-08，《坐天观井 · Inkbox》M2-C2E委托书v1.0的工程范围已收口，E0–E5的A类程序/产品路径和B类原型能力完成。最终主观美术裁决留给用户；最大图与密集模拟仍有明确性能边界。开发分支`codex/m2-c2e-living-terrain`，开工`3a98fb29a6b3bddf6242e3d25e2d5cbbc41e8f29`，未合并main，未推送远端或借用旧Actions结论。用户既有历史文档迁移未纳入本轮提交。

## 实际门禁

| 验证 | 结果与证据 |
| --- | --- |
| 本阶段快速CPU | 44/44：geometry13、creation6、sculpt19、expansion6；另有240动态几何参考比较 |
| 固定seed矩阵 | 12seed×3地貌×3尺寸=108通过；v1原始/量化Canonical SHA精确保持 |
| 模拟与存档 | 120日实际三界advanceWorld、完整save（仅排除mapProgress）、advanceState及11随机流一致；save-equiv新可选字段登记，旧断言保留 |
| 历史回归 | Bridge36、M2-B70、M2-A13、M2-C与C2D.1 CPU及相关C2C Fast入口通过；没有删除旧门禁 |
| 真实产品Edge/GPU | browser-optimized 14/14；六个实际鼠标编辑场景、seed、暂停隔离、演化冲突、importFile、扩图、mask/slab/墙/锁区 |
| 同机Canonical | final-canonical-r3十二镜与baseline逐镜World/camera/GPU/buffer一致，GL错误0；保留完整开销增减 |
| 正交性能矩阵 | 6行×4位面×120 RAF=2880采样；标准/群山/水泽，小图/512×320，DPR1/1.5/2，俯视/斜视/低角度 |
| 联合耐久 | 独立600＋6000采样RAF完成，编辑/扩图/视界/相机交错；另记480运行pulse与至少187操作等待RAF |
| 资源与审查 | 预热后15检查点27G/10T/9P、监听器不增；核心事务/访问/缓存独立只读审查通过 |
| 发布包 | 本地npm run build与test:package通过；387文件、78脚本目标、99份Markdown链接审核，无release图片/本地日志 |

机器可读结果、源码/图像SHA与计时在[验收摘要](./reports/release/render3d-m2c2e/summary/acceptance-summary.json)，最多八张新增正常Golden见[视觉验收](./M2C2E_VISUAL_ACCEPTANCE.md)。完整原始证据在本机ignored `reports/local/m2c2e/`，失败报告保留，不混用测量批次。CI Fast已接入新的44项入口，但本分支远端CI尚未运行。

## A与B逐项结论

A类：山体v2自适应拓扑和仅生成期弱平滑、水岸真实裁切、世界外围墙/水帘/界缘重叠、严格seed与三种地貌、连续笔划/一次UndoRedo、canonical派生、各内容层同帧贴地与真实拾取、旧Canonical兼容、真实GPU、可选字段保存和完整八份报告已完成。绘画感是否满意由用户查看正常Golden裁决，程序通过不替代审美结论。

B类全部接入正式入口：山脊/盆地、抬岸清水与低洼补水、预生成完整512×320世界中央40/60/80/100%开放、开放进度存档、大图1500额外实际人物的密集性能测量、编辑/扩图/视界耐久。进度只变访问政策，不改TypedArray、seed或RealmMask，未开放区照常模拟。

## 可玩入口与边界

`npm run dev`，打开`http://127.0.0.1:4180/inkbox.html?renderer=3d`。底栏设置幅面/地貌/seed与渐进探索后重新开天；3D工具栏选择笔刷、半径/强度，拖动为一笔，Undo/Redo或Ctrl+Z/Ctrl+Shift+Z恢复；“拓展地图”逐阶段开放，开发面板可直接开放全图。旧档无generation/mapProgress按v1/全开放解码，不重新生成。

持笔期间游戏日、水文和decay暂缓，镜头/Presentation继续，松手恢复原倍速且不补跑。后续自然演化改变笔划触及格的height/water/riverBase时，旧Undo原子拒绝并清空双栈、给明确提示；不会覆盖新水文或回滚人物时间。

水面热点同机P95约49→8ms，Host约85→40ms；完整耐久全图运行窗口Host P95仍约57–62ms、RAF P95最高133.4ms；DPR2最大图也超60FPS预算。512×320定位为可运行原型，不宣称任意密度或所有机器持续60FPS。缓存额外约5MiB/WaterLayer，heap检查不包含所有GPU/TypedArray内存。

历史save的Uint16量化与模拟RNG游标未持久化边界仍存在；本轮证明同保存payload继续推进可复现、开放无模拟副作用，未宣称未中断与读档轨迹逐位等同。Canonical跨运行advance digest亦不作为证明，捕获内无漂移与独立纯度检查分开记录。

C类复杂侵蚀/新河流生成、无限世界/Chunk Streaming、物理崩塌、全自动搬迁和大型成就树按委托书延期，没有以它们扩大本轮范围。后续性能工作集中在全图dirty和植被派生，见[性能](./M2C2E_PERFORMANCE_REPORT.md)与BACKLOG。

## 复验命令

`npm run test:render3d:m2c2e`；`npm run test:render3d:m2c2e:generation`；`npm run test:render3d:m2c2e:browser`；`npm run test:render3d:m2c2e:soak`；`npm run build`；`npm run test:package`。GPU与重型CPU顺序独占，使用独立`INKBOX_REPORT_DIR`保留每次运行。

发布产物：`dist/zuotian-guan-jing-inkbox-1.0.0/` 与 `dist/zuotian-guan-jing-inkbox-1.0.0.zip`。独立包保持历史文档路径，截图留开发Git，精简摘要约224KiB。最终文档/源SHA/Golden与计账另经独立只读核对通过。
