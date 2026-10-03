# Inkbox 测试与验证入口

普通 push / PR 运行 Fast / Heavy Gate；浏览器只手动运行，长测属于 Nightly。`npm test` 只代表核心检查通过，不代表全部门禁通过。
CI 定义在 [ci.yml](../.github/workflows/ci.yml) / [nightly.yml](../.github/workflows/nightly.yml)。Node CI 为 24；本地 CDP 浏览器测试需 Node 22+。

| 命令 | 验证内容 | CI 归属 |
| --- | --- | --- |
| `npm test` / `test:core` | 导入图、核心推进、HTTP 启动、transient runtime events | Fast |
| `test:view` | RealmViewState / Region、窗口生命周期、画像、只读检视、跨界事件与追迹地基 | Fast |
| `test:presentation` | FX / 记挂 / 关系 / 战争线、按位面分发与纯度 | Fast |
| `test:render3d` | M0 坐标、高程、拾取、雕刻、确定性 | Fast |
| `test:render3d:m1` | 实体 / 聚落 / 标记、LOD、只读与模拟不受影响 | Fast |
| `test:render3d:bridge` | height / water / type / veg dirty 分类 | Fast |
| `test:render3d:m2a` | Host / Stage 生命周期、Mask / pick、写守卫、单消费者、Slab、600 日三路等价 | Fast |
| `test:vendor` | Three npm / vendor 版本、许可证、字节一致性；检查 LF 策略 | Fast |
| `npm run build` | 按显式清单生成自包含目录与 ZIP | Fast |
| `test:regression` | 干预 / 灾祸 / 存读档 | Heavy |
| `test:three-realms` | 三界身份、时间、随机流、守恒、裂隙和跨界 | Heavy |
| `test:save-equivalence` | 真实保存 / 恢复后的分叉等价；断言总数随内容浮动 | Heavy |
| `test:browser` | Canvas 的真实浏览器交互与存储 | 手动 Browser Smoke，Windows Edge |
| `test:render3d:m2a:browser` | Edge WebGL：13 图、两界各 80 拾取点、存读档 / 缺位面 / Canvas 切换 / 编辑守卫、性能环境 | 手动 Browser Smoke，接在 Canvas 检查后 |
| `test:simulation` / `inkbox:longrun` | 较慢 smoke / 800 年长局；没有 test:longrun 命令 | Nightly，schedule / 手动 |

## 本地复验与证据

先 `npm ci` 安装 Node 测试所用的 Three；只启动浏览器游戏不必安装，importmap 读取 vendor。
`npm run test:render3d:m2a:release` 顺序运行 12 套现有门禁，写实际 exit code、耗时与日志；没有浏览器、旧 smoke 或 800 年长测。
该命令会更新 `reports/release/render3d-m2a/regression-results.json`，保存新证据时须审查差异，不能无意覆盖封板基线。

浏览器先 `npm run dev` 启动 4180，然后另开终端运行测试。M2-A 必须使用 Microsoft Edge；playtest 优先 Edge，也支持 Chrome。
playtest 的 `--port` 指 CDP 调试端口，游戏地址用 `--url`。M2-A 游戏地址可由 INKBOX_URL 配置。

```powershell
# 保留正式基线，重跑结果写本地目录。
$env:INKBOX_REPORT_DIR = 'reports/local/m2a-recheck'
npm run test:render3d:m2a:browser
```

正式封板截图 / JSON 在 [reports/release/render3d-m2a](../reports/release/render3d-m2a/)，对应 [M2-A 工程报告](../Render3D%20M2-A%20架构原型工程报告.md)。
M2-A 本地记录为 view 113、M2-A 13 组、160 点拾取零错误；历史计数只描述对应基线，不充当永久测试规格。

## GitHub 浏览器复验

Actions → Inkbox CI → Run workflow，选择 main。
Windows job 用 `scripts/inkbox-browser-smoke.mjs` 在同一宿主内启动 / 维持 / 释放服务器，顺序执行 Canvas 与 M2-A 原测试脚本，分别记录退出码；第一套失败也继续收集第二套结果。
HTTP 资源先探测，启动失败补存页面 / 网络诊断。输出到 reports/ci 的独立目录，通过 artifact 保存截图、JSON 和日志，成功 / 失败均保留可用证据。
这套远端功能复验不会改 reports/release 的已发布文件，也不把 runner 软件光栅读数当成本机 Intel UHD 730 性能基线。

测试失败须保留失败条件与日志；修复平台问题或真实实现，不删断言、不加 `|| true`、不把 assertion 改 warning。
`spawnSync EBUSY` 等执行权限问题按当次环境处理；不能用手工 ZIP 冒充自动 build 通过。

## 历史研究材料

scripts/_*.mjs 是已入 Git 的 D8 / M1 一次性研究探针，不进 npm 门禁或 dist；不是当前自动化覆盖的证明。
旧 V3/V4 测试与 src/main.js 不在当前工作树；需要参考时查 Git 历史。
其他本地 reports、旧日志与压缩记忆仅供考古；当前判据以维护中的契约、源码和实际命令结果为准。

## M2-C 追加门禁

`npm run test:render3d:m2c`：只读 DataTexture、分类完整性、增量上传、高程/Mask、材质开关缓存/释放、600 日纯度对照与实例母版批处理。既有测试断言保持。

`npm run test:render3d:m2c:browser`：先起4180服务，使用本机 Edge 与仓库 CDP；逐日推进真实快照，8 个视图 × baseline/pigment/ink/pilot 四档、完整 manifest、CPU-visible timing、RT/Depth/MSAA/DPR 技术探针和生命周期验证。默认正式证据写入 `reports/release/render3d-m2c`，重跑可用 `INKBOX_REPORT_DIR` 指向独立目录。软件光栅与不同机器的性能不可直接比较。

`node scripts/inkbox-render3d-m2c-soak.mjs`：在独立 Edge 中连续6000帧检查旋转、Resize、开关缓存、资源平台、完整 World 指纹与 ArtPass 状态。不要与性能采样并发运行。

`python scripts/inkbox-m2c-image-metrics.py reports/release/render3d-m2c`：需要 Pillow/NumPy；六项图像统计仅为诊断，不自动判定画面通过。
