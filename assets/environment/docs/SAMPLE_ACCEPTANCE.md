# M2-C2B Package 2：单屋样板

Package 0 已以 `a8bf11d` 的 CI attempt 2、六个 Edge suite、600 lifecycle / 6000 soak 和 Nightly 封板。Package 1 的 35 项语义审计见根目录 `M2C2B_SEMANTIC_ASSET_BINDING.md`。

本样板只接入当前 `STRUCT.HOUSE`，正式资产开关暂以 `?renderer=3d&assets=on` 启用。HALL、聚落中心和宗门资本锚仍走原表现。尚未扩展 hut/manor/hall、普通鬼、Upper decoration 或 Nether artifact。

实际发行 GLB 的 LOD 三角形为 **80 / 30 / 8**，LOD0 保留源模型九个 UV 语义槽；三个 ASCII 节点共用一份材质和外部索引图集。非均匀归一化及实例缩放均按逆转置处理法线。

验收命令：

```text
npm run test:render3d:m2c2b:sample
npm run test:render3d:m2c2b:sample:browser
npm run test:view
npm run test:core
npm run test:render3d:m2b
npm run test:render3d:m2c2a
npm run test:render3d:m2c2a1:hlod
npm run test:render3d:m2c2b0
npm run build
```

CPU 检查从实际 GLB accessor 和 PNG 像素解码，检查法线/面朝向、图集槽、资源共享、LOD/HLOD、实例移动后拾取、销毁旧屋记录、异步加载/晚到释放、World/advanceState/save 摘要。完整村落通常先进入 HLOD；真实局部视界阻止聚合时，残留屋舍使用单屋 LOD2。

`6601273` 的远端 Fast/Heavy 暴露现有源码注释扫描器对正则字符组内引号的兼容问题：转义正则让其误读后续注释。检视转义已改为同义 `replaceAll` 链，未更改或放松原测试；完整 presentation 127 断言、three-realms、M0/M1/M2-A/M2-C 和 Edge 样板均重新通过。

Edge 使用本机 154 / AMD Radeon 610M / ANGLE D3D11，1500×940 / DPR 1。LOD0 与 LOD1 均通过实际输入点击 GLB 表面，精确打开原始 houseKey 与 villageId 卡片；凡间划窗仍只拾地形。检视不会跳过前方的无 house 身份中心锚选择后面的屋舍。GLB 和 atlas 各请求一次，跨界、切换资产以及替换 World 仍共用同一 Library/geometry/atlas。实际产品 RAF 采样 120 帧；所有 LINK_STATUS 成功、GL error 为 0、控制台和运行异常为空。

Edge 只读阶段完整 World+advanceState 摘要为 `0f9efd918df2e4f26bcf678cffe2ca1593381c9abee209de9e2e8cc747d755f1`，与封板 GOLDEN_A 一致。Node 场景与浏览器启动场景覆盖独立记录，不把两条启动路径的 house/hall 数量假定为相同。

全量 JSON 和两张样板 PNG 存在开发报告 `reports/m2c2b/pass1/sample/`，不进入玩家包。简要验收记录为 `reports/release/render3d-m2c2b-pass1/sample-summary.json`。模型仍恢复原派生建筑尺寸，非均匀伸缩和大号中心锚是后续家族阶段必须复核的视觉事项；此处仅通过单屋接线门禁，不宣称整个 Pass 1 完成。
