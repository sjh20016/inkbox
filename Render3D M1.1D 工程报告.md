# Render3D M1.1D 工程报告

> **阶段**：Render3D M1.1D「Development Hardening」 · **完成日期**：2026-09-28
> **委托书**：[`Render3D M1.1D 工程任务清单.md`](./Render3D%20M1.1D%20工程任务清单.md)
> **阶段性质**：**工程加固，不是新玩法**。只做五件事：仓库真相统一 · 分层 CI · `WorldRenderBridge`
> dirty 分类 · 性能基线重测 · Three.js vendor 治理。
> **一句话结论**：M1.1D 全部验收项达标；仓库已可安全交接；**不存在必须在 M2 前解决的性能阻塞**；
> M2 的三个架构问题**已列出但未裁决**（本阶段不得自行选方案）。

---

## 1. 修改文件

共 **22** 个（`git diff --stat` 口径）。

| # | 文件 | 改了什么 |
| --- | --- | --- |
| 1 | `.github/workflows/ci.yml` | 从空壳重写为**分层门禁**（Fast Gate / Heavy Gate / 手动 browser-smoke） |
| 2 | `README.md` | 工程状态段整体改写；启动段补 vendor 说明；测试清单补 `test:render3d:bridge` / `test:render3d:perf` / `test:vendor`；链接 M1.1D 报告与 `ROADMAP.md` |
| 3 | `HANDOFF.md` | §0 当前阶段改 M1.1D；§1 新增**分支角色**段与 M1.1D 完成项；D7 六个不可解析 hash 换成发布仓库阶段提交 `dc456fa`；硬禁段改为「本阶段已完成，作为纪律记录保留」；末尾追加「只在开发工作区存在的文件」豁免说明 |
| 4 | `STATUS.md` | 顶部状态块重写；**新增 `## Render3D M1.1D` 章节**；`## NEXT` 段改写；D7 小节删掉六个不可解析 hash；`BACKLOG P3` → `BACKLOG #20` |
| 5 | `BACKLOG.md` | 整文件重划四区（P0 / P1 / P2 / P2-b / ICEBOX）+ 新增「**已关闭编号**」表；P1 清空（`#1`–`#7` 全部完成并落进已关闭表）；`#12` / `#13` / `⑭` 三个旧编号给出落点 |
| 6 | `ROADMAP.md`（新增后微调） | 健康度读数改为实测值（core 72 文件 / 262 边；bridge 36 项） |
| 7 | `inkbox.html` | importmap 改指 `./vendor/three/...`；注释 `BACKLOG ⑭` → `BACKLOG #14` |
| 8 | `package.json` | scripts 新增 `test:render3d:bridge` / `test:render3d:perf` / `test:vendor` / `vendor:sync` |
| 9 | `Render3D M1 工程报告.md` | 删掉不可解析的 `f91ffd0`，改为阶段描述 + 「本报告不写本地施工史 hash」 |
| 10 | `scripts/inkbox-package.mjs` | `FILES` 去掉 5 个 `node_modules/three/*`、补 9 项新文件；`DIRECTORIES = ['src/inkbox', 'vendor/three']` |
| 11 | `scripts/inkbox-render3d-bridge.mjs` | **本阶段新建后又修改**：新增 G8「模拟确定性不退化（三界全开）」两组断言（34 → 36 项） |
| 12 | `scripts/inkbox-render3d.mjs` | M0 测试：dirty 断言改为分类结构；`terrain.update(region, { height:true, type:false })` |
| 13 | `scripts/inkbox-render3d-m1.mjs` | 全部 `{ terrainChanged: true }` → `{ heightChanged: true }`；G8 的 `DIRECTORIES` 断言从**逐字正则**改为**解析数组判成员**（见 §4 第 6 条） |
| 14 | `scripts/inkbox-render3d-browser.mjs` | 文件头补「本机默认跑不了」；environment 扩为 gpu/vendor/webgl/viewport/dpr/threeRuntime；新增 `softwareRasterizer` 与 `notes`；keys 补 7 个 M1.1D profiling 字段；`threeRequests` 判据 `/node_modules/three/` → `/vendor/three/` |
| 15 | `scripts/cdp.mjs` | `launch()` 新增 `gpu = false` 选项（默认 `--disable-gpu`，让读数可比） |
| 16 | `scripts/inkbox-smoke.mjs` | 注释 `见 BACKLOG P3` → `见 BACKLOG #20` |
| 17 | `src/inkbox/render3d/WorldRenderBridge.js` | **本阶段核心**：`changes()` 分类化 + `BRIDGE_LAYERS` + `mergeRegion` |
| 18 | `src/inkbox/render3d/Renderer3D.js` | `update()` 改为分类派发；`markTerrainDirty` 走 `mergeRegion`；写入 `this.profile`；metrics 补 7 个字段 |
| 19 | `src/inkbox/render3d/terrain/TerrainMesh.js` | `update(region, options)` 拆 `writeHeight` / `writeType` |
| 20 | `src/inkbox/render3d/entities/EntityLayer.js` | 判据 `options.terrainChanged` → `options.heightChanged` |
| 21 | `src/inkbox/render3d/settlements/SettlementLayer.js` | 同上 |
| 22 | `src/inkbox/render3d/markers/WorldMarkerLayer.js` | 同上 |
| 23 | `src/inkbox/render3d/SelectionMarker.js` | 新增 `needsPlace`；`update(world, heightChanged)` 加早退守卫 |
| 24 | `src/inkbox/render3d/Render3DAdapter.js` | `[data-debug]` 面板改展示逐层 ms |

> 表内 24 行对应 22 个「修改文件」+ 2 个本阶段新建后又被修改的文件（`ROADMAP.md`、
> `scripts/inkbox-render3d-bridge.mjs`，它们在 `git` 里仍是未跟踪状态）。

## 2. 新增文件

| 文件 | 说明 |
| --- | --- |
| `ROADMAP.md` | 30 秒定位（阶段表 + 现在在哪儿 + M2 三问 + 健康度 + 一句话纪律），控制在 100 行内 |
| `.github/workflows/nightly.yml` | 夜间长测（smoke + 800 年 longrun），`cron 0 18 * * *` + 手动触发 |
| `scripts/inkbox-render3d-bridge.mjs` | dirty 分类回归，**36 项断言 / 0 红** |
| `scripts/inkbox-render3d-perf.mjs` | 零依赖 CDP 性能基线，输出 `reports/render3d/perf-baseline.json` |
| `scripts/inkbox-vendor.mjs` | `vendor:sync`：从 `node_modules/three` 复制 5 个运行时文件到 `vendor/three` |
| `scripts/inkbox-vendor-check.mjs` | vendor 完整性体检，**13 项断言 / 0 红** |
| `vendor/three/package.json` · `LICENSE` · `build/three.module.js` · `build/three.core.js` · `examples/jsm/controls/OrbitControls.js` | Three.js 自包含运行时，**5 文件 / 2.07 MB**，含 MIT 许可证 |
| `.gitattributes` | 钉住 `vendor/three/** text eol=lf`。**为什么必须有**：本机 `core.autocrlf=true`，不给 vendored 运行时钉行尾的话，新克隆会把它们转成 CRLF，而 npm 装的 `node_modules/three/*` 是 LF ⇒ `test:vendor` 的「逐字节相同」断言**在别的机器上假红**（本机不红 ⇒ 典型「本机绿、别人红」） |
| `Render3D M1.1D 工程任务清单.md` | 本阶段委托书（含 `# 〇、D1.3 执行记录` 回填表） |
| `Render3D M1.1D 工程报告.md` | 本文件 |

## 3. 删除文件

**开发工作区：无。**

D6.5 要求「删除 Git 跟踪的 `node_modules` 文件」。在**开发工作区**实测
`git ls-files node_modules/three | wc -l` = **0** —— `.gitignore` 第 2 行早已挡住 `node_modules/`，
这些文件**从来没有进过本工作区的 Git index** ⇒ `git rm --cached` 无事可做。

⚠️ **但这条要求不是空转**：在**发布仓库**（`E:/world4/inkbox`，即 clone 得到的那一份）里，
`447fa54` 当时用 `git add -f` 强制跟踪了**恰好这 5 个** `node_modules/three/*` 文件
（`LICENSE` · `build/three.core.js` · `build/three.module.js` · `examples/jsm/controls/OrbitControls.js` · `package.json`）。
D6 把运行时迁到 `vendor/three/` 之后，这 5 个**必须从发布仓库的 index 里删掉**（`git rm -r --cached`），
否则同一份 Three.js 会以两条路径存在于发布仓库。
⇒ **D6.5 的正确落点是发布仓库，不是开发工作区。**

## 3b. 文档里没有「删除」，但打包清单里有「不再收录」

`scripts/inkbox-package.mjs` 的 `FILES` 里原本列着 5 个 `node_modules/three/*` 路径
（那是 `447fa54` 的产物）。D6 把它们**删掉**，改用 `DIRECTORIES = ['src/inkbox', 'vendor/three']` 递归收录。
效果：`npm run build` 产出的项目包**不含 `node_modules`**（已实测确认）。

## 4. 文档漂移修正列表

| # | 漂移 | 处理 |
| --- | --- | --- |
| 1 | `f91ffd0` 被 `Render3D M1 工程报告.md` 当作路标引用，但它是**未发布**的本地施工提交 ⇒ 别人克隆后解析不了 | 删除引用，改为阶段描述 + 「本报告不写本地施工史的 commit hash」 |
| 2 | D7 七包的六个 hash（`38445e9` `83e83d0` `0408290` `663d8ef` `0174305` `22a930e`）在 `STATUS.md` / `HANDOFF.md` 里当路标 | 全部删除，改为阶段描述 + 发布仓库可达的阶段提交 `dc456fa` |
| 3 | `STATUS.md` 说「当前阶段 = M1.1D 进行中」，`README` / `HANDOFF` / `BACKLOG` 同 | 四份文档统一到「**M1.1D 已完成 / 下一阶段 M2 尚未开始，首先需要设计方案裁决**」 |
| 4 | `BACKLOG.md` 里留着已完成的任务（如「D8 A 完成 · B 待开工」），且「当前工程」与 `ROADMAP` 重复 | 整文件重写：P1 清空、`#1`–`#7` 落进「已关闭编号」表、去掉全部飘移内容 |
| 5 | 源码注释引用 `BACKLOG ⑭` / `BACKLOG P3`，但 BACKLOG 重写后这些编号不存在了 | `inkbox.html` → `BACKLOG #14`；`STATUS.md` / `scripts/inkbox-smoke.mjs` → `BACKLOG #20`；并在 BACKLOG 文末新增「已关闭编号」表给出 `#12` / `#13` / `⑭` 的落点 |
| 6 | `scripts/inkbox-render3d-m1.mjs` 的 G8 断言是**逐字匹配** `DIRECTORIES = ['src/inkbox']` ⇒ D6 多收一个 `vendor/three` 后**假红** | 改为**解析数组判成员**：`entries.includes('src/inkbox')`。⚠️ 这是**契约变更**（数组内容变了），按纪律换契约稳定的不变量（「`src/inkbox` 在里面」），**不是改绿**——丢掉 `src/inkbox` 照样变红 |
| 7 | `scripts/inkbox-render3d-browser.mjs` 判据里写着 `/node_modules/three/` | 改 `/vendor/three/`（D6 之后浏览器不再从 node_modules 取 Three.js） |
| 8 | `STATUS.md` / `HANDOFF.md` 未说明「哪些文件只在开发工作区存在」 | HANDOFF 末尾追加豁免说明：`.workbuddy-ai/memory/**` · `scripts/_*.mjs` · `reports/` 在干净项目包里**没有** |

## 5. CI job 结构

### `.github/workflows/ci.yml`（触发：push / pull_request / workflow_dispatch）

| Job | Runner | 内容 | 触发 |
| --- | --- | --- | --- |
| **Fast Gate** | `ubuntu-latest` · node 24 | `npm ci` → `test:core` → `test:view` → `test:presentation` → `test:render3d` → `test:render3d:m1` → `test:render3d:bridge` → `build` | 每次 push / PR |
| **Heavy Gate** | `ubuntu-latest` · node 24 | `npm ci` → `test:regression` → `test:three-realms` → `test:save-equivalence` | 每次 push / PR（与 Fast Gate **并行**） |
| **Browser Smoke** | `windows-latest` | 起服务器（pwsh，轮询 30s）→ `npm run test:browser`（144 项）→ `if: always()` 停服务器 | **仅 `workflow_dispatch`** |

**铁律（D3.6）**：**无 `|| true`** · **不删测试** · **不把 assertion 降级成 warning**。

**刻意不进普通 CI**：`test:simulation`（smoke，6.5–13 分钟）与 `inkbox:longrun`（800 年）⇒ 见 `nightly.yml`。

### `.github/workflows/nightly.yml`

`schedule: cron '0 18 * * *'` + `workflow_dispatch` · `timeout-minutes: 240` ·
`inkbox:longrun` → `test:simulation`。

### 校验

两个 YAML 用 PyYAML 6.0.3 解析通过（`yaml.safe_load`）。

### ⭐ 首次真实运行（2026-09-29 · 发布仓库 main `43bbb79`）

推送 `main` 后 `ci.yml` **自动触发并跑完**——这是「Fast Gate 能运行 / Heavy Gate 能运行」
从「本地 YAML 合法」升级成**远端真绿**的证据：

| Job | 结论 | 步数 |
| --- | --- | --- |
| **Fast Gate** | ✅ **success** | 11 步全绿（npm ci → core → view → presentation → render3d → render3d:m1 → render3d:bridge → build） |
| **Heavy Gate** | ✅ **success** | 7 步全绿（npm ci → regression → three-realms → save-equivalence） |
| **Browser Smoke（手动）** | ⏭ **skipped** | 按设计（`if: workflow_dispatch` 不满足） |

- run id `36513752590` · 整体 **completed / success** · **5.0 分钟** ·
  <https://github.com/sjh20016/inkbox/actions/runs/36513752590>
- 两个 job **确实并行**（同时起 runner），且 GitHub 识别到 **2 个 active 工作流**
  （`Inkbox CI` + `Inkbox Nightly`）⇒ `workflow` scope 生效、工作流正式入库。

## 6. Dirty 分类前后逻辑

### 前（M1）

`WorldRenderBridge.changes()` 把 `height` / `water` / `type` / `veg` **四层揉成一个 dirty region**：

```js
// 任一格任一字段变了 ⇒ 整个 region 记为脏
if (dHeight || dWater || dType || dVeg) { grow(box, x, y); }
```

⇒ `Renderer3D.update()` 只有一个 `terrainChanged` 布尔，传给所有层。
**后果**：`water` / `veg` / `type` 单独动一下，也会被当成「地形变了」，
于是实体 / 建筑 / marker **全部重新贴地**。M1 人少（80–2832 实体）还糊得过去，
M2 三界之后就是纯浪费。

### 后（M1.1D）

`changes()` 返回**每层各一条脏区**：

```js
{ any: true,
  height: {x0,y0,x1,y1} | null,
  water:  {x0,y0,x1,y1} | null,
  type:   {x0,y0,x1,y1} | null,
  veg:    {x0,y0,x1,y1} | null }
```

四层全 `null` ⇒ **返回 `null`**（不是「整图脏」）。新增纯函数 `mergeRegion(a, b)`
（取并集、不改入参、`null` 语义就是 `null`）。

各 Layer 按**真实依赖**响应（不是「凭感觉全绑」）：

| Layer | 真实依赖 |
| --- | --- |
| `TerrainMesh` | `height`（只写 Y）+ `type`（只写色）——**分两次调** |
| `WaterLayer` | `height` ∨ `water` |
| `VegetationLayer` | `height` ∨ `type` ∨ `veg` |
| `EntityLayer` / `SettlementLayer` / `WorldMarkerLayer` / `SelectionMarker` | **只有 `height`** |

**硬禁遵守**：**不给 `World` 加任何 renderer dirty 字段**。
G6 全仓扫源码（去注释）断言不出现 `heightDirty|waterDirty|typeDirty|vegDirty|renderDirty|threeDirty`。
⚠️ `world.touch()` 里的 `terrainDirty` **不在禁列**——那是 Canvas 地形位图的既有机制（`world/terrain.js`）。

**可数形态（G7）**：「只有水面在变」的 60 帧，旧口径强制重写 **180** 次（60×3），新口径 **0** 次。

## 7. Dirty profiling 数据

`Renderer3D.update()` 现在分段计时并写入 `this.profile`，再汇入 `debug.metrics`：
`bridgeScanMs` / `terrainUpdateMs` / `waterUpdateMs` / `vegetationUpdateMs` / `entityUpdateMs` /
`settlementUpdateMs` / `markerUpdateMs` / `layerUpdateMs`（后者 = 各层之和）。

实测（120 帧均值 · ms）：

| 场景 | 阶段 | 桥扫描 | 地形 | 水 | 植被 | 实体 | 建筑 | 标记 | 各层合计 | `render()` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| small | static | 0.16 | 0.03 | 0.00 | 0.00 | 0.01 | 0.00 | 0.01 | 0.03 | 0.28 |
| small | running | 0.20 | 0.61 | 0.05 | 0.39 | 0.06 | 0.01 | 0.01 | 0.61 | 0.76 |
| medium | running | 0.36 | 1.04 | 0.13 | 0.62 | 0.05 | 0.01 | 0.01 | 1.04 | 0.85 |
| large | running | 0.53 | 2.30 | 0.28 | 1.50 | 0.06 | 0.01 | 0.01 | 2.30 | 0.72 |
| large-heavy | running | 0.57 | 3.87 | 0.43 | 1.88 | 0.85 | 0.00 | 0.01 | 3.87 | 0.91 |

**读法**：**逐层 CPU 时间全部 < 4 ms**。`bridgeScanMs` 在最大世界也只有 0.57 ms ⇒
**瓶颈不在 `WorldRenderBridge` 扫描**，也不在实体 update（2911 实体仅 0.85 ms）。

## 8. GPU 信息

| 项 | 值 |
| --- | --- |
| 浏览器 | `HeadlessChrome/154.0.0.0` · `Edg/154.0.0.0` |
| GPU 渲染器 | `ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)` |
| 厂商 | `Google Inc. (Microsoft)` |
| WebGL | `WebGL 2.0 (OpenGL ES 3.0 Chromium)` |
| 着色语言 | `WebGL GLSL ES 3.00` |
| 最大纹理 | 16384 |
| 视口 / 画布 | 1500×940 / 1086×806 · DPR 1 |
| **Three.js 实际加载 URL** | `http://127.0.0.1:4180/vendor/three/build/three.module.js` |
| **软件光栅器** | `true` |
| 启动参数 | 默认 `--disable-gpu`（`INKBOX_PERF_GPU=1` 可试真显卡，**读数与默认不可比**） |

> ⚠️ **当前仍运行于软件光栅器，性能结论只作为相对数据。**
> 这句话同时写进 `perf-baseline.json` 的 `notes`，脚本也会在 console 里明示。

## 9. small / medium / large 性能数据

`INKBOX_PERF_FRAMES=120` · 每格 120 帧均值 · 软件光栅器。

| 场景 | 阶段 | 实体 | FPS | frameMs | p95 | draws | 三角形 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| small (200×128) | static | 80 | 38.0 | 29.4 | 33.4 | 3 | 119 772 |
| small | moving | 80 | 40.7 | 27.5 | 33.4 | 3 | 119 772 |
| small | running | 80 | 39.3 | 28.5 | 33.4 | 6 | 120 404 |
| medium (288×180) | static | 82 | 25.2 | 42.1 | 50.1 | 3 | 232 592 |
| medium | moving | 82 | 28.8 | 35.6 | 50.0 | 3 | 232 592 |
| medium | running | 82 | 26.6 | 39.0 | 50.1 | 6 | 232 993 |
| large (384×240) | static | 80 | 20.1 | 51.4 | 66.7 | 3 | 406 148 |
| large | moving | 80 | 20.3 | 50.3 | 66.6 | 3 | 406 148 |
| large | running | 80 | 17.9 | 57.8 | 66.7 | 6 | 406 628 |
| large · 高人口 | static | 2911 | 18.5 | 55.0 | 66.7 | 6 | 442 932 |
| large · 高人口 | moving | 2911 | 19.0 | 53.8 | 66.7 | 6 | 442 932 |
| large · 高人口 | running | 2911 | 14.1 | 75.7 | 116.7 | 7 | 441 520 |

**高人口场景怎么造的**：走**真工厂** `life.spawn(x, y, sp, 70, 0)` 造 ≈2832 实体
（`counts.spawned.made` 记录），**不手搓实体对象**——手搓的实体不带真实字段，测不出真问题。

**结论**：
1. **frameMs 与 CPU 层耗时严重脱钩**：large-heavy running 的 `frameMs` 75.7 ms，
   而可测 CPU 合计只有 ≈8.5 ms ⇒ **约 67 ms 花在软件光栅化与浏览器合成上**（`render()` 调用本身只 0.91 ms）。
2. **draw call 随规模几乎不涨**：全图 3（无实体）→ 6（2832 实体）→ 7（2911 实体），
   说明 InstancedMesh 合并生效，**没有「N 个实体 N 个 draw call」的退化**。
3. **三角形数才是软件光栅器的真成本**：119 k → 406 k 三角形，FPS 从 38 掉到 18，
   近似线性 ⇒ 纯**填充率 / 顶点吞吐**问题，与 CPU 派发无关。

**对照（M1 遗留口径）**：M1 报的是 large 2832 实体 6 draw calls，与本次 large-heavy static 的
6 draws / 2832 实体**一致** ⇒ M1.1D 的 dirty 分类**没有引入 draw call 退化**。

## 10. node_modules → vendor 迁移结果

| 项 | 结果 |
| --- | --- |
| vendor 目录 | `vendor/three/`（`package.json` · `LICENSE` · `build/three.module.js` 648K · `build/three.core.js` 1.4M · `examples/jsm/controls/OrbitControls.js` 40K） |
| 体积 / 文件数 | **2.07 MB / 5 文件** |
| 许可证 | **MIT**（`vendor/three/LICENSE`），`inkbox-vendor-check.mjs` 断言它是 MIT 全文 |
| importmap | `{"three":"./vendor/three/build/three.module.js","three/addons/":"./vendor/three/examples/jsm/"}` |
| 内部相对引用 | `three.module.js` 相对引用 `./three.core.js`（**不能改成裸说明符**，否则 importmap 解析不到） |
| OrbitControls | 用裸说明符 `three`（由 importmap 解析到 vendor） |
| npm 依赖 | **保留** `three`（node 测试继续从裸说明符 `three` 导入；符合停止条件 C 的处置） |
| 旧引用清零 | 全仓（去注释）不再有 `node_modules/three` 的**运行时**引用；豁免 `inkbox-vendor.mjs` / `inkbox-vendor-check.mjs` 自身 |
| 版本一致性 | vendor 版本 === npm 依赖版本；两者**逐字节相同** |
| `.gitignore` | 仍挡 `node_modules/`，**不挡** `vendor/` |
| 行尾保真 | `.gitattributes` 钉 `vendor/three/** text eol=lf` ⇒ 任何平台克隆后都与 npm 出货形态逐字节相同（否则 `core.autocrlf=true` 的 Windows 机器会假红） |
| 打包 | `inkbox-package.mjs` 的 `DIRECTORIES` 含 `vendor/three`（**递归**）⇒ 新文件自动入包；`FILES` 里 5 个 `node_modules/three/*` 已删 |
| **实测证据** | 浏览器 `performance.getEntriesByType('resource')` 抓到 `http://127.0.0.1:4180/vendor/three/build/three.module.js` |
| 入口 | `npm run vendor:sync`（同步）· `npm run test:vendor`（体检，13 项） |
| 净效果 | **克隆即可运行，不必 `npm install`** |

## 11. 全部测试命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm run test:core` | ✅ **72 文件 / 262 条相对导入边**，全部解析成功；runtime events 13 checks（cap 256） |
| `npm run test:regression` | ✅ 22 项 |
| `npm run test:three-realms` | ✅ **151 ✓ / 0 红 · 三界生态不变量成立**（含 D8-E 跨界 rift-cross 两条事件） |
| `npm run test:save-equivalence` | ✅ **全部通过 ✓ 读档瞬间结构完整**（生灵数偏差 30 = 混沌放大，非漏存字段） |
| `npm run test:presentation` | ✅ **127 项断言** |
| `npm run test:view` | ✅ **111 项断言** |
| `npm run test:render3d`（M0） | ✅ **19 groups passed** |
| `npm run test:render3d:m1`（M1） | ✅ **36 项断言**（含 G7「模拟不受影响」） |
| `npm run test:render3d:bridge`（**新增**） | ✅ **36 项断言**（G1 mergeRegion · G2 分类 Case 1–6 · G3 快照独立 · G4 各层真值表 · G5 Renderer3D 源码结构 · G6 边界 · G7 可数对比 · **G8 三界全开确定性**） |
| `npm run test:vendor`（**新增**） | ✅ **13 项断言** |
| `npm run test:render3d:perf`（**新增**） | ✅ 采集完成（4 场景 × 3 阶段 × 120 帧）；帧循环活着；无运行时报错；Three.js 确从 vendor 加载 |
| `npm run build` | ✅ 自包含项目包 **125 文件**（`dist/zuotian-guan-jing-inkbox-1.0.0/` + `.zip` 5.3 MB）；含 `vendor/three/**`，**不含 `node_modules`**。⚠️ 本机**必须脱离沙箱**才能跑通（tar 步要 spawn 外部 exe，见 §12 第 3 条）；CI 的 `ubuntu-latest` 无此问题 |

**§十九 模拟确定性（本阶段重点回归）**：
`test:render3d:bridge` 的 **G8** 用同 seed 造两个**三界齐全**的世界（凡间 + 上界 + 幽冥 + 鬼影 + 裂缝，
且幽冥塞了 30 只真鬼魂使比对非空），A 每轮跑「桥扫描 → 分类派发 → 全层更新 → 点选」，
B 完全不碰渲染，各推进 600 日 ⇒ `day` / `entities` / `villages` / `factions` / `artifacts` /
`artifactLog` / `sites` / `leylines` / `rifts` / `riftLog` / `wraiths` / `wraithLog` / `watch` /
`upper`（整段）/ `nether`（整段，含 `popLog` 人口账本）**逐字段相同**。
另有一条**非空性守卫**断言（凡间有生灵 · 上界有人 · 幽冥有鬼 · 有聚落 · 有灵脉 ·
`ghostBorn > 0` · 幽冥法宝账本在动），防止「两边都空」的假绿。

**未跑**：`npm run test:browser`（144 项浏览器交互）与 Render3D browser probe
——**本机环境默认跑不了**（复用本机 Edge/Chrome 的探针在无头环境不可靠）；
已接入 CI 的 `browser-smoke`（手动触发 · `windows-latest`）。

## 12. 已知未解决问题

| # | 问题 | 归属 |
| --- | --- | --- |
| 1 | **性能读数采自软件光栅器**（`Microsoft Basic Render Driver`），**不能当 M2 的绝对依据**；真实 GPU 读数需在有显卡的机器上 `INKBOX_PERF_GPU=1` 重跑 | 环境限制，非代码问题 |
| 2 | `render()` 的 JS 侧耗时只 0.18–0.91 ms，但 `frameMs` 28–76 ms ⇒ **约 2/3 的帧时间在软件光栅化 / 合成**，本机无法进一步归因 | 环境限制 |
| 3 | 本机 `spawnSync(<任意 exe>)` 被环境拦截（EBUSY）⇒ `npm run build` 的 tar 步**只在沙箱外**成功；沙箱内 copy 已完成、tar 抛错。绕法：用 System32 的 bsdtar 手工补 zip（**不能加 `--force-local`**），或直接脱离沙箱跑。CI 的 `ubuntu-latest` 不受影响 | `BACKLOG #21`（P2-b） |
| 4 | 浏览器交互测试（`test:browser` / Render3D browser probe）本机跑不了，只在 CI 手动 job 里可用 | 环境限制 |
| 5 | 64×48 / 600 日窗口里 `factions` / `rifts` / `sites` / 凡间 `artifacts` 可能为 0 ⇒ G8 **刻意不给它们加非空守卫**（加了就是假红），它们仍进 digest 参与逐字比对 | 设计取舍，已写进测试注释 |
| 6 | `ROADMAP.md` 的阶段表里 D8-G 仍标 ⏸；追迹 UI 未做（地基有测试钉住） | 已记录，非本阶段范围 |
| 7 | `save.js` row schema 风险、`planes.transfer()` 未实现 ⇒ **本阶段按停止条件 E/F 明确不碰** | `BACKLOG #27` / `#28`（ICEBOX） |
| 8 | ⚠️ **本地分支名与文档所述不一致**：开发工作区当前 checkout 的分支叫 `codex/render3d-m0`，但它实际含 **M0 + M1 + M1.1D** 全部工作；文档里说的「`codex/render3d-m0` = M0 历史技术快照」指的是**发布仓库**里那个分支（= `3856cee3`，tag `render3d-m0` 指向它）。⇒ 接手开发工作区的人不要被分支名误导。**改名属仓库操作，本阶段不做**（D2.3：不重写历史） | 交接注意项，见 §14 Q1 |

## 13. M2 前仍需裁决的问题

**M2 = 三界空间表现架构**（上界 / 幽冥 3D、3D 视界）。这是**新世界层级级**的改动，
开工前需要用户拍板。以下三条**是问题清单，不是建议方案**；**不得自行选择并开始实现**。

### 13.1 三个位面是**切换 Scene**，还是**同时驻留**？

- 切换：省显存、省 draw call，但每次跨界要重建（地形 / 植被 / 实例缓冲），
  跨界观察会变成「加载」而不是「看见」。
- 同时驻留：跨界无感，但**三倍显存 + 三倍 draw call**；本阶段实测单界 large 已 406 k 三角形、
  large-heavy 442 k ⇒ 三界同时驻留意味着 ~1.3 M 三角形常驻。
- 中间态（如「当前界全精度 + 邻近界低精度」）也需要先定，否则实现会分叉。

### 13.2 3D 视界用 **Portal / RenderTarget / 局部第二 Scene**，还是**先暂缓**？

`VIEW_CONTRACT.md` 的硬约束是「**只观察、不改三界模拟**」——三种实现都能满足，差别在复杂度与表现力：

- Portal（模板/深度门）：窗内即另一界真实场景，最「活」，但与「同时驻留」强耦合。
- RenderTarget 离屏渲染贴面：实现独立、易做 LOD，但窗内**播 FX**（D8-E 的 rift-cross）要额外通路。
- 局部第二 Scene：只重建窗口覆盖的格子，省资源，但边界与相机一致性要专门设计。
- 暂缓：先做三界 3D 的「切换」，视界仍留在 Canvas 层（现状）。

### 13.3 三个位面是否共享一个 `Renderer3D` 生命周期管理器？

- 现在全是**凡间单例**（`render3d/` 各 Layer 都直接读 `world.height/water/veg`）。
  共享一个管理器 ⇒ 要给所有 Layer 引入**位面维度**（`plane` 参数或 `world.plane` 分派），
  改动面覆盖 M0/M1 的**全部**模块。
- 不共享 ⇒ 三套 GPU 上下文 + 三份 `dispose` 纪律；WebGL 上下文数量有硬上限（通常 8–16），
  三界各一套尚可，但若再加上「视界离屏」就会逼近上限。

> ⚠️ 三条都需要**用户裁决**。**本阶段不得自行选择 M2 方案并开始实现。**

---

## 14. 交接结论（委托书 §二十四 三问）

### Q1 当前仓库是否已经达到「可以安全交给另一个 AI，从 main 开始继续开发」？

**分两半回答，不能笼统说「是」：**

| 对象 | 结论 |
| --- | --- |
| **开发工作区**（`E:/world4/坐天观井-实验分支D1`） | ✅ **可以**。6 个提交已落地（`c438a66` → `33f757d`）；四份文档 + `ROADMAP.md` 与 `HEAD` 一致；全部 10 项自动测试 EXIT=0；`npm run build` 产出自包含 125 文件包；无不可解析的 commit 路标。 |
| **发布仓库 `main`**（`E:/world4/inkbox` → GitHub） | ✅ **可以**（2026-09-29 已同步）。`main` = `43bbb79`，含 M1.1D 全部内容：importmap 指 `vendor/three/`、`node_modules/three/*` 已出库、`.github/workflows/` 已入库并由 **CI 真跑一次全绿**（run `36513752590`）。 |

**已执行**（2026-09-29 · 用户要求「推送至 git」后）：

```bash
cd "E:/world4/坐天观井-实验分支D1" && npm run build          # 125 文件
cp -r dist/zuotian-guan-jing-inkbox-1.0.0/. E:/world4/inkbox/   # 全量覆盖（含新 .gitignore，自动去掉 .github/ 忽略块）
git -C E:/world4/inkbox rm -r --cached node_modules/three      # D6.5 的真正落点：不再跟踪那 5 个文件
git -C E:/world4/inkbox add -A && git -C E:/world4/inkbox commit -m "Render3D M1.1D 工程加固（…）"
# 推送：github.com:443 被封 ⇒ 走 api.github.com 的 Git Data API（见下）
```

⚠️ **推送通道不是 `git push`**：本机 `github.com:443` **不通**（直连超时 / 走代理 `CONNECT tunnel failed, 502`），
而 `api.github.com` 通（200 / 0.49 s）。⇒ 用 **Git Data API**（blob → tree → commit → ref）完成推送，
并把 `author` / `committer` 的 name / email / **date** 与 message 的**原始字节**照抄本地提交，
使**远端 SHA 与本地逐字一致**（`43bbb79…`，tree 亦相同）⇒ 以后 `git fetch` 恢复时不会分叉。
推送后核验：125 个 blob（= build 文件数）、16 个新路径齐全、无 `node_modules/`/`reports/`/`dist/` 误传、
抽查 blob 与本地 `git hash-object` 逐字节相同；`git update-ref refs/remotes/origin/main 43bbb79` 对齐跟踪引用。

⇒ **发布仓库 `main` 已是可交接状态，没有任何阻塞交接的问题。**

### Q2 当前 Render3D 是否存在「必须在 M2 前解决的性能阻塞」？

**不存在。** 依据：

- **CPU 侧全部 < 4 ms**：最大世界（2911 实体 / 406 k 三角形）下 `bridgeScanMs` 0.57 ms、
  实体 0.85 ms、地形 3.87 ms、植被 1.88 ms ⇒ **dirty 扫描与派发不是瓶颈**。
- **draw call 不随规模涨**：全图 3 → 6 → 7（2911 实体）⇒ InstancedMesh 合并生效。
- **`frameMs` 与 CPU 严重脱钩**：large-heavy running 75.7 ms 里可测 CPU 只 ≈8.5 ms，
  剩下 ≈67 ms 在**软件光栅化与浏览器合成**（本机 `Microsoft Basic Render Driver`）。
  ⇒ 这是**环境**的墙，不是代码的墙。
- 本阶段唯一真正的优化点（dirty 分类）已落地，效果可数：water-only 的 60 帧从 180 次强制重写降到 **0** 次。

⇒ **M2 可以在现在的 Render3D 上直接开工**（架构裁决完成后）。
⚠️ 唯一保留意见：**真实 GPU 上的读数还没采过**（需有显卡的机器跑 `INKBOX_PERF_GPU=1`）；
本阶段的 FPS 只作相对比较。这不构成阻塞，但**M2 若要定帧预算，应该先补一次真显卡基线**。

### Q3 M2 最需要提前裁决的 3 个架构问题

**（问题清单，不是建议方案；不得自行选择并开始实现）**

1. **三个位面是切换 Scene，还是同时驻留？**
   —— 切换省显存但跨界要重建；同时驻留无感但三倍显存 + 三倍 draw call（本阶段实测单界 large 已 406 k 三角形）。
   中间态（当前界全精度 + 邻近界低精度）也需要先定，否则实现会分叉。
2. **3D 视界用 Portal / RenderTarget / 局部第二 Scene，还是先暂缓？**
   —— `VIEW_CONTRACT.md` 要求「只观察、不改模拟」，三种都能满足；差别在复杂度与
   「窗内能不能播 FX」（D8-E 的 `rift-cross`）。暂缓则视界继续留在 Canvas 层。
3. **三个位面是否共享一个 `Renderer3D` 生命周期管理器？**
   —— 现在全是凡间单例；共享要给 M0/M1 的**全部** Layer 引入位面维度；
   不共享则三套 GPU 上下文 + 三份 dispose 纪律（WebGL 上下文有硬上限，再加视界离屏会逼近上限）。

---

## 附：本阶段纪律执行情况

| 纪律 | 执行 |
| --- | --- |
| 不新增任何玩法 | ✅ 上界 3D / 幽冥 3D / 3D 视界 / D8-G UI / 战争动画 / 雷劫 FX / 新建筑 / 新交互 / AI 行为 / 模拟概率**一律未碰** |
| 不重构 `save.js` / `rifts.js` | ✅ 未碰 |
| 不实装 `planes.transfer()` | ✅ 未碰（停止条件 E） |
| 不引 ECS / 状态库 / 物理引擎 / BVH | ✅ 未引（`package.json` 依赖未增加） |
| 不重写 Render3D | ✅ 只改 `update()` 的派发与各层判据名 |
| 不给 `World` 加 renderer dirty 字段 | ✅ G6 全仓源码断言 |
| 模拟结果不变 | ✅ G8 三界全开 600 日逐字段相同 |
| 不使用 `|| true` 掩盖失败 | ✅ 两个 workflow 内均无 |
