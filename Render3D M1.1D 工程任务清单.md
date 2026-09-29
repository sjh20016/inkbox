# 坐天观井 · Render3D M1.1D 工程任务清单

阶段代号：**M1.1D · Development Hardening**

执行模型建议：**DeepSeek v4.1**

阶段性质：

**非玩法开发。**

**非 M2。**

**非三界 3D 化。**

本阶段只做：

> 仓库真相统一、自动测试接入、Render3D 更新路径细化、性能基线重测，以及少量工程卫生修正。

---

# 〇、D1.3 执行记录（本阶段回填）

本清单 D1.3 要求「全仓搜索 `f91ffd0` 并确认每个 commit 路标可解析」。执行结果：

| 引用 | 可解析性 | 处理 |
| --- | --- | --- |
| `f91ffd0` | ❌ 只存在于本工作区的**未发布**本地施工史（远端 `codex/render3d-m0` / `main` 均无） | **删除引用**：`Render3D M1 工程报告.md` 改为「上一阶段」纯描述；本清单此处仅作搜索目标保留 |
| `38445e9` `83e83d0` `0408290` `663d8ef` `0174305` `22a930e`（D7 七包） | ❌ 同上（未发布） | **删除引用**：`HANDOFF.md` / `STATUS.md` 改为阶段描述 + 发布仓库阶段提交 `dc456fa` |
| `dc456fa` | ✅ 远端 `refs/heads/main` 历史 + tag `D7-complete-observation-and-presentation-foundation` | 保留 |
| `3856cee3e60f9d72d9badba7dbb4f796df1599f0` | ✅ 远端 `refs/heads/codex/render3d-m0` | 保留（D2.2 的 tag 目标） |

结论：**发布仓库（clone 得到的那一份）里不再有任何解析不了的 commit 路标。**
本工作区完整开发史按设计**不对外发布**，因此其内部提交 hash 一律不进文档。

---

# 一、阶段目标

M1 已经证明：

- Render3D 技术路线成立；
- 实体 / 聚落 / 世界标记可以低 draw call 运行；
- 3D 与 Canvas 可以共享同一个世界；
- Render3D 没有污染模拟 RNG；
- Three.js 可以继续作为未来主要观察技术栈。

但是 M1 之后出现五类工程问题：

1. README / HANDOFF / STATUS / BACKLOG 状态不一致。
2. GitHub 仓库仍缺正式 CI 门禁。
3. `WorldRenderBridge` 的 dirty 粒度过粗。
4. M1 性能数据来自软件光栅器，真实性能仍未知。
5. Three.js 自包含方案目前直接跟踪 `node_modules` 文件，长期维护语义不够干净。

M1.1D 的目标就是把这五件事处理干净。

---

# 二、最高优先级纪律

本阶段禁止新增游戏玩法。

禁止：

- 上界 3D；
- 幽冥 3D；
- 3D 视界；
- D8-G UI；
- 战争 3D 动画；
- 雷劫 / 飞升 FX；
- 新建筑；
- 新人物视觉；
- 新交互工具；
- 新世界；
- 新种族；
- AI 行为改动；
- 模拟概率调整。

也禁止借此机会：

- 重构 `save.js`；
- 重构 `rifts.js`；
- 实装 `planes.transfer()`；
- 引入 ECS；
- 引入状态管理库；
- 引入物理引擎；
- 引入 BVH；
- 重写 Render3D。

如果施工过程中发现上述问题，只记录到 BACKLOG。

---

# 三、工程包 D1：仓库真相统一

这是第一步。

在任何源码优化之前完成。

## D1.1 审计四份核心文档

检查：

`README.md`

`HANDOFF.md`

`STATUS.md`

`BACKLOG.md`

以当前 `main` HEAD 为唯一事实来源。

必须统一写清：

### 已完成

- D6-2 三界生态 A-F
- D6-3 跨界生态 A-E
- D7 A-G
- D8 A-F
- Render3D M0
- Render3D M1

### 暂缓

- D8-G 跨界追迹 UI

### 当前阶段

改成：

> Render3D M1.1D · Development Hardening

### 下一正式功能阶段

写成：

> Render3D M2 · 三界空间表现架构，尚未开始。

不得继续把：

“Render3D M1”

写成当前施工阶段。

---

## D1.2 修复 BACKLOG 漂移

当前 BACKLOG 里仍有类似：

> D8 A 完成 · B 待开工

这种过时内容。

全部修正。

重新分四区：

### P0 阻塞

只记录真正会阻塞运行 / 开发的问题。

### P1 当前工程

仅列 M1.1D 本阶段任务。

### P2 后续体验

保留非阻塞体验优化。

### ICEBOX

保留：

- D8-G；
- 三界 3D；
- 复杂 FX；
- 大型政治系统；
- 跨界战争；
- save schema 重构；
- planes transfer 架构统一。

不得把已经完成的功能继续放在 backlog。

---

## D1.3 修复无效 Git hash

全仓搜索：

```text
f91ffd0
```

以及所有文档中的 commit hash。

逐个确认：

```bash
git cat-file -t <sha>
```

或者：

```bash
git show <sha>
```

能够解析。

如果某个 hash 只存在于旧本地施工历史、远端不可达：

删除这个 hash 引用。

改成：

- 当前可达 commit；
- 或直接描述阶段，不写 hash。

目标：

**文档中每一个 commit 路标必须是真实可解析的。**

---

# 四、工程包 D2：分支与版本基线整理

当前分支：

`main`

`codex/render3d-m0`

M0 分支已经完成历史使命。

本阶段不要 merge 它。

## D2.1 明确分支角色

文档中注明：

`main`

= 唯一活跃开发主线。

`codex/render3d-m0`

= Render3D M0 历史技术快照。

禁止后续模型继续从：

`codex/render3d-m0`

开发新功能。

---

## D2.2 创建 M0 checkpoint tag

如果当前权限与工作流允许，建议创建：

```text
render3d-m0
```

指向：

```text
3856cee3e60f9d72d9badba7dbb4f796df1599f0
```

如果不方便实际创建远端 tag：

只记录建议。

不得为了创建 tag 改写 Git 历史。

---

## D2.3 不做历史重写

禁止：

- rebase main；
- squash 已发布提交；
- force push；
- 把 M0 branch 重新 merge 回 main。

M1.1D 必须建立在当前 main 之上。

---

# 五、工程包 D3：GitHub Actions CI

这是本阶段最重要的工程基础设施任务之一。

目标不是：

“每 push 一次跑半小时。”

而是建立分层 CI。

---

## D3.1 新建基础 workflow

建议：

```text
.github/workflows/ci.yml
```

触发：

```text
push
pull_request
workflow_dispatch
```

Node：

建议使用项目当前要求：

```text
Node >= 18
```

优先固定一个现代 LTS。

安装：

```bash
npm ci
```

---

## D3.2 Fast Gate

每次 push / PR 都跑：

```bash
npm run test:core
npm run test:view
npm run test:presentation
npm run test:render3d
npm run test:render3d:m1
npm run build
```

这些是快速工程门禁。

必须全部成功。

---

## D3.3 Heavy Gate

增加一个独立 job：

```bash
npm run test:regression
npm run test:three-realms
npm run test:save-equivalence
```

可以与 Fast Gate 并行。

---

## D3.4 Browser 测试暂不作为普通 CI 硬门槛

当前浏览器探针依赖 Edge / Playwright 环境。

不要为了 CI：

新增大量浏览器依赖；

改变现有游戏运行方式。

如果可以低成本接 GitHub Chromium：

可以建立：

```text
browser-smoke
```

否则：

保留为：

`workflow_dispatch`

手动运行。

---

## D3.5 Longrun 不进入普通 CI

以下不得每次 push 跑：

```text
test:simulation
inkbox:longrun
```

可以建立：

```text
nightly.yml
```

或暂时只记录未来计划。

本阶段最低验收不要求 nightly。

---

## D3.6 CI 失败原则

禁止：

为了 CI 绿而删测试。

禁止：

把失败命令加 `|| true`。

禁止：

把 assertion 转成 warning。

如果 CI 暴露平台差异：

修平台问题。

不得掩盖失败。

---

# 六、工程包 D4：WorldRenderBridge Dirty 分类

这是本阶段唯一值得改的 Render3D 核心逻辑。

当前：

`WorldRenderBridge.changes()`

把：

- height
- water
- type
- veg

全部揉成一个 dirty region。

于是：

water / veg / type 变化也会被当成：

```text
terrainChanged
```

进一步导致：

实体；

建筑；

marker；

全部重新贴地。

M1 尚可接受。

M2 三界后可能变成明显 CPU 浪费。

---

# 七、D4.1 新 dirty 返回结构

将：

```js
changes()
```

从：

```js
{
  x0,
  y0,
  x1,
  y1
}
```

升级为类似：

```js
{
  any,
  height,
  water,
  type,
  veg
}
```

每层：

```js
null
```

或者：

```js
{
  x0,
  y0,
  x1,
  y1
}
```

例如：

```js
{
  any: true,

  height: {
    x0: 10,
    y0: 20,
    x1: 15,
    y1: 24
  },

  water: null,

  type: null,

  veg: null
}
```

如果所有层无变化：

允许返回：

```js
null
```

---

# 八、D4.2 各 Layer 只响应需要的数据

调整 `Renderer3D.update()`。

推荐语义：

### TerrainMesh

响应：

- height
- type

如果只有：

`height`

更新 position。

如果只有：

`type`

更新 color。

如果两者都有：

两者更新。

---

### WaterLayer

响应：

- height
- water

因为水面高度依赖：

```text
height + water
```

---

### VegetationLayer

响应：

- height
- veg
- type

如果当前植被派生确实只依赖其中部分字段，按实际依赖处理。

不要凭感觉全绑。

---

### EntityLayer

只需要：

`heightChanged`

时强制重新贴地。

普通人物 x/y 变化仍由自己的 15 Hz 数据更新负责。

`water`

`type`

`veg`

变化不应单独强制所有人物重写 Y。

---

### SettlementLayer

只响应：

`heightChanged`

强制重新贴地。

---

### WorldMarkerLayer

只响应：

`heightChanged`

强制重新贴地。

marker 自身数据变化仍按原 4 Hz 快照判断。

---

### SelectionMarker

只需要：

`heightChanged`

影响当前选中格时更新高度。

初版也可以：

有任何 height dirty 都更新当前 selection。

成本很低。

---

# 九、D4.3 禁止增加模拟 dirty flag

不得向 `World` 添加：

```text
heightDirty
waterDirty
renderDirty
threeDirty
```

这类字段。

Dirty 状态继续属于：

Render3D 自己。

这是当前架构必须保住的边界。

---

# 十、D4.4 支持 dirty region 合并

如果同一帧中：

多个模块需要一块联合区域，

可以提供一个纯工具：

```js
mergeRegion(a, b)
```

不得重复写四套：

```text
Math.min x0
Math.max x1
```

逻辑。

这个函数必须纯函数。

---

# 十一、D4.5 测试新增

扩展：

`test:render3d`

或者新增：

```text
test:render3d:bridge
```

至少断言：

### Case 1

只改：

`water`

则：

```text
changes.height === null
changes.water !== null
```

### Case 2

只改：

`veg`

不得报：

height dirty。

### Case 3

只改：

`type`

不得触发实体贴地更新。

### Case 4

只改：

`height`

必须：

- Terrain Y 更新；
- Water Y 更新；
- Entity Y 更新；
- Settlement Y 更新；
- Marker Y 更新。

### Case 5

同时改：

height + water

两个 region 都正确。

### Case 6

没有变化：

`changes() === null`

---

# 十二、工程包 D5：性能基线重新测试

M1 当前记录：

large：

2832 entities

6 draw calls

但测试环境是：

```text
Microsoft Basic Render Driver
```

即软件光栅器。

这个数据不能作为 M2 性能依据。

---

## D5.1 自动记录 GPU 信息

更新现有：

`scripts/inkbox-render3d-browser.mjs`

或者 M1 viewshot。

记录：

```text
browser
gpu renderer
vendor
WebGL version
viewport
DPR
map preset
entity count
house count
marker count
draw calls
triangles
FPS
frame time
raycast ms
bridge scan ms
layer update ms
```

输出 JSON。

不要只 console.log。

---

## D5.2 新增 dirty profiling

在性能报告里增加：

```text
bridgeScanMs
terrainUpdateMs
entityUpdateMs
settlementUpdateMs
markerUpdateMs
```

避免只有：

总 frame time。

目标不是极致优化。

目标是知道 CPU 时间花在哪里。

---

## D5.3 真实 GPU 测试口径

如果运行环境存在真实 GPU：

至少测：

small

medium

large

以及：

高人口 large。

每组：

静止 120 帧。

相机移动 120 帧。

人口运行状态 120 帧。

---

## D5.4 如果仍然检测到软件光栅器

不要谎报：

“真实 GPU 60 FPS”。

报告必须明确写：

> 当前仍运行于软件光栅器，性能结论只作为相对数据。

不能把这个任务强行判失败。

因为 CI / 云环境很可能天然没有真实显卡。

---

# 十三、性能判断阈值

本阶段不要因为 FPS 不理想就引入复杂优化。

只判断热点。

如果真实 GPU 上：

普通 large 世界表现稳定，

则：

不引入 BVH。

不分 chunk。

不做复杂 LOD。

如果 CPU profiling 显示：

`WorldRenderBridge` 扫描或实体 update 明显成为主要热点，

只记录：

M2 前优化候选。

不得自行扩写成大规模性能重构。

---

# 十四、工程包 D6：Three.js 自包含目录治理

当前 main 为了：

clone 后直接运行，

强制跟踪了：

```text
node_modules/three/...
```

功能正确。

但长期语义不够清楚。

本包把它整理成明确的 vendor runtime。

---

## D6.1 建议目录

推荐：

```text
vendor/
  three/
    package.json
    LICENSE
    build/
      three.module.js
      three.core.js
    examples/
      jsm/
        controls/
          OrbitControls.js
```

目录版本也可以：

```text
vendor/three-0.186.1/
```

二选一。

不要同时存在两份。

---

## D6.2 修改 import map

`inkbox.html`

把：

```text
./node_modules/three/...
```

改到：

```text
./vendor/three/...
```

保证：

```js
import * as THREE from 'three'
```

以及：

```js
three/addons/
```

继续工作。

---

## D6.3 npm 依赖仍然保留

`package.json` 中：

```json
"three": "0.186.1"
```

不要删。

理由：

Node 测试仍可以正常：

```js
import * as THREE from 'three'
```

而 vendor 目录服务的是：

**自包含浏览器运行包。**

两者职责分开。

---

## D6.4 build 更新

`scripts/inkbox-package.mjs`

改成打包：

```text
vendor/three/**
```

而不是：

```text
node_modules/three/**
```

---

## D6.5 删除 Git 跟踪的 node_modules 文件

完成 vendor 迁移并验证后：

把当前那几个已跟踪：

```text
node_modules/three/*
```

从 Git index 移除。

但：

`.gitignore`

继续保持：

```text
node_modules/
```

不要改成：

“所有 node_modules 都可跟踪”。

---

# 十五、D6.6 vendor 完整性测试

增加一个极轻量测试：

确认：

```text
vendor/three/package.json
vendor/three/LICENSE
vendor/three/build/three.module.js
vendor/three/build/three.core.js
vendor/three/examples/jsm/controls/OrbitControls.js
```

全部存在。

并确认：

`inkbox.html`

importmap 指向 vendor。

---

# 十六、工程包 D7：重新定义工程状态页面

M1.1D 完成后更新：

`README`

`HANDOFF`

`STATUS`

`BACKLOG`

最终统一到：

### 当前阶段

```text
Render3D M1.1D 已完成
```

### 下一阶段

```text
Render3D M2：三界空间表现架构
```

但明确注明：

> M2 尚未开始，首先需要设计方案裁决。

---

# 十七、建议补一个 ROADMAP

如果现有文档已经太散，可以新增非常短的：

```text
ROADMAP.md
```

控制在 100 行以内。

只记录：

```text
D6 三界生态     ✅
D7 玩家观察     ✅
D8 A-F 视界     ✅
D8-G 追迹       ⏸
M0 3D 地形      ✅
M1 世界实体     ✅
M1.1D 工程加固  ✅ / 当前
M2 三界3D架构   未开始
```

不要写细节。

详细历史继续留给 STATUS。

目标是让下一个 AI 用 30 秒知道项目在哪。

---

# 十八、测试矩阵

M1.1D 完成时至少执行：

```bash
npm run test:core
npm run test:regression
npm run test:three-realms
npm run test:save-equivalence
npm run test:presentation
npm run test:view
npm run test:render3d
npm run test:render3d:m1
npm run build
```

Browser：

如果本机环境支持：

```bash
npm run test:browser
```

以及 Render3D browser probe。

---

# 十九、不得修改模拟结果

本阶段非常重要的回归目标：

在相同 seed 下，

M1.1D 前后模拟结果不得因为 Render3D dirty 分类而变化。

必须继续满足：

```text
Render3D 开
```

与：

```text
Render3D 不开
```

推进相同时间后：

模拟世界状态一致。

尤其检查：

- world.day
- entities
- factions
- villages
- rifts
- upper
- nether
- 人口账本
- artifact 账本

---

# 二十、提交拆分建议

不要一个 giant commit。

建议：

### Commit 1

```text
docs: align repository truth after render3d m1
```

内容：

README / HANDOFF / STATUS / BACKLOG / ROADMAP。

---

### Commit 2

```text
ci: add layered github actions gates
```

内容：

GitHub Actions。

---

### Commit 3

```text
perf(render3d): split world bridge dirty regions
```

内容：

WorldRenderBridge + Renderer3D + Layers。

---

### Commit 4

```text
test(render3d): cover classified dirty updates
```

内容：

新增测试和 profiling。

---

### Commit 5

```text
chore: vendor three runtime outside node_modules
```

内容：

vendor + importmap + build。

---

### Commit 6

```text
docs: close render3d m1.1d hardening stage
```

最终文档与工程报告。

---

# 二十一、停止条件

如果某一步出现以下情况：

### 情况 A

Dirty 分类需要修改模拟层。

停止。

设计错了。

RenderBridge 应该自己解决。

### 情况 B

CI 为了跑起来要求重构测试架构。

停止扩范围。

只接当前可运行测试。

### 情况 C

vendor Three 导致 Node 测试 import 失败。

保留 npm dependency。

不要把所有 import 都改成相对 vendor 路径。

### 情况 D

真实性能不好。

只记录热点。

不得立即上：

BVH / chunk / worker / shader rewrite。

### 情况 E

发现 `planes.transfer()` 未实现。

不要碰。

### 情况 F

发现 save.js row schema 风险。

记入 BACKLOG。

不要碰。

---

# 二十二、M1.1D 最终验收标准

只有全部满足，才能宣布 M1.1D 完成。

## 文档

- README 状态正确。
- HANDOFF 状态正确。
- STATUS 状态正确。
- BACKLOG 不再包含已完成任务。
- 不存在远端无法解析的关键 commit 路标。
- main 明确为唯一活跃主线。
- M0 branch 明确为历史 checkpoint。

## CI

- `.github/workflows/ci.yml` 存在。
- Push / PR 可以触发。
- Fast Gate 能运行。
- Heavy Gate 能运行。
- 不用 `|| true` 掩盖错误。

## Render3D

- Dirty 分类区分：
  - height
  - water
  - type
  - veg
- water-only 不再强制实体贴地。
- veg-only 不再强制建筑贴地。
- type-only 不再强制 marker 贴地。
- height 变化仍然保证所有贴地物正确更新。
- 不给 World 新增 renderer dirty 字段。

## Vendor

- 浏览器 Three.js 运行时不再依赖 Git 跟踪的 node_modules。
- vendor 目录中有许可证。
- npm dependency 仍正常。
- build 输出可独立运行。

## 测试

所有常规测试通过。

Render3D M0 / M1 测试继续全绿。

Build 成功。

3D ↔ Canvas 不退化。

模拟确定性不退化。

---

# 二十三、完成后工程报告

新增：

```text
Render3D M1.1D 工程报告.md
```

必须包含：

1. 修改文件。
2. 新增文件。
3. 删除文件。
4. 文档漂移修正列表。
5. CI job 结构。
6. Dirty 分类前后逻辑。
7. Dirty profiling 数据。
8. GPU 信息。
9. small / medium / large 性能数据。
10. node_modules → vendor 迁移结果。
11. 全部测试命令与结果。
12. 已知未解决问题。
13. M2 前仍需裁决的问题。

---

# 二十四、M1.1D 完成后的最终回答

完成后不要继续开发 M2。

只回答：

### 1.

当前仓库是否已经达到：

> “可以安全交给另一个 AI，从 main 开始继续开发”

### 2.

当前 Render3D 是否存在：

> “必须在 M2 前解决的性能阻塞”

### 3.

列出 M2 最需要提前裁决的 3 个架构问题。

重点应包括：

- 三个位面是切换 Scene，还是同时驻留？
- 3D 视界采用 Portal / RenderTarget / 局部第二 Scene，还是先暂缓？
- 三个位面是否共享一个 Renderer3D 生命周期管理器？

**不得自行选择 M2 方案并开始实现。**