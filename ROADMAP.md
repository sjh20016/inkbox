# ROADMAP · 坐天观井 Inkbox

> **30 秒版**：项目在哪、下一步是什么。细节不写在这里——历史去 `STATUS.md`，没做的事去 `BACKLOG.md`，
> 规则去 `THREE_REALMS.md` / `VIEW_CONTRACT.md`，接手先读 `HANDOFF.md`。
> 本文件**控制在 100 行以内**，不许长成第二个 STATUS。

## 阶段表

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| D6-2 | 三界生态 **A–F**（凡间 / 上界 / 幽冥最低生态闭环） | ✅ |
| D6-3 | 跨界生态 **A–E**（跌入幽冥 / 鬼爬出 / 物品泄漏 / 夺舍附身） | ✅ |
| D7 | 观察与表现层 **A–G**（相机 / runtime event / FX / 记挂 / 关系图 / 战争线） | ✅ 封板 |
| D8 | 视界 2.0 · 穿透式跨界观察 **A–F**（活着的窗 / 位面画像 / 跨界 FX / 窗内检视） | ✅ |
| D8-G | 跨界追迹 **UI**（纯逻辑地基已保存并有测试钉住，**UI 未做**） | ⏸ 暂缓 |
| M0 | Render3D 立体沙盘：地形 / 水体 / 植被 / 相机 / Raycast / 地形雕刻 | ✅ |
| M1 | Render3D 世界实体可见化：实体 / 聚落 / 宗门 / 法宝地点灵脉 / 3D 选中环 | ✅ |
| M1.1D | Render3D 工程加固：仓库真相 / 分层 CI / dirty 分类 / 性能基线 / vendor 治理 | ✅ **已完成** |
| M2-A | 一个 Host / 三个 Stage / 世界空间 Mask / 矩形 Slab 探针 | ✅ **已完成**，证据见工程报告 |
| M2-B | 根据 M2-A 证据继续视界原型 | ⬜ **未开始** |

> **Render3D M2-A 架构原型已完成。** 交付范围与测量结果见
> [M2-A 工程报告](./Render3D%20M2-A%20架构原型工程报告.md)。M2-B 尚未开始。

## 现在在哪儿

- **活跃主线**：`main`（唯一）。`inkbox.html` + `src/inkbox/**` 是活的；
  冻结的 `index.html` + `src/`（V4.0.0）只作考古。
- **历史快照**：`codex/render3d-m0` 分支 + tag `render3d-m0` = M0 技术原型 checkpoint，
  **只作考古，禁止从它开发新功能**。
- **玩**：`npm run dev` → `http://127.0.0.1:4180/`；3D 立体沙盘加 `?renderer=3d`。
- **版本**：Inkbox `v1.0.0`。

## M2-B 前的裁决

M2-A 按委托书验证一个 WebGLRenderer、一个 CameraRig 与三个 Group Stage。
驻留、可见、实际更新的成本分别记录；三个 Stage 驻留并不等于三倍 draw call。
Mask 目前只组合地形与实体，边界采用世界格中心判定；Slab 限矩形 20×20。
下一阶段须结合截图、拾取和首次开窗数据决定 Mask / Slab / 混合路线。
RenderTarget 扩展口保留，M2-A 不提前实现，也不进入 M2-B 或 D8-G。

## 历史基线（M1.1D 收尾实测；本次结果见 M2-A 报告）

- `npm run test:core` **72 文件 / 262 边** · `test:regression` 22 · `test:three-realms` **151 ✓**
- `test:view` 111 ✓ · `test:presentation` 127 ✓ · `test:save-equivalence` 全绿
- `test:render3d` 19 组 · `test:render3d:m1` 36 ✓ · `test:render3d:bridge` 36 ✓ · `test:vendor` 13 ✓
- `npm run build` ✅ 自包含 **136 文件**（`clone` 即可跑，不必 `npm install`）
- CI：`.github/workflows/ci.yml`（Fast Gate + Heavy Gate 并行）· `nightly.yml`（smoke + 800 年长跑）
  ✅ **已在 `ubuntu-latest` 真跑一次全绿**（2026-09-29 · run `36513752590` · 5.0 分钟）
- ⚠️ 性能读数采自**软件光栅器**，只作相对数据——见 `Render3D M1.1D 工程报告.md`。

## 一句话纪律

**模拟世界是唯一真相，渲染层只是观察者。**
删掉 `render/fxLayer.js` 或整个 `render3d/`，模拟结果逐字不变。
