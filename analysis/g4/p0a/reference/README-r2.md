# g4lab — G4-PERF 水文规则实验包（R2）

只读实验：不修改任何产品文件。所有产品模块经 `lib/env.mjs` 从 `INKBOX_ROOT` 导入。

## 准备
```bash
git clone https://github.com/<org>/inkbox.git inkbox && cd inkbox
git checkout e1e55039bb56efda7a307513ede07a9fab3bf534   # 或要测试的 SHA
npm ci                                                   # three 0.186.1（downstream.mjs 需要）
git show bfabe00:scripts/inkbox-g2-h3-archipelago-world.mjs > /tmp/archipelago-fixture.mjs  # 可选：群岛图
export INKBOX_ROOT=$PWD INKBOX_FIXTURE=/tmp/archipelago-fixture.mjs
cd /path/to/g4lab
```
未设置 `INKBOX_FIXTURE` 时只跑标准图（`downstream.mjs`）或报错（指定 archipelago 时）。

## 规范变体名（`lib/variants.mjs`）
| 名称 | 文档别名 | 含义 |
|---|---|---|
| `V0_current` | E0 | main `stepHydrology` |
| `V1_noErosion` | E2 | refill + rivers + water + flush |
| `V2_seaSkipProto` | R1 原型 | 跳过海格但**不固定海面**、会沉积进海、触发全图热力；只用于复现 R1 数据 |
| `V3_staticSeaStrict` | E5 | 严格静海：海面归一化、泥沙进海即消失、陆地局部热力 |
| `V9_hydrologyOff` | 下限 | 完全不跑水文；**不是 E5** |

## 脚本
| 脚本 | 用途 | 示例 |
|---|---|---|
| `oracle.mjs` | V0 vs 候选，6 场景逐格精确对照（water / height / type / qi，分内陆 / 沿海带） | `node oracle.mjs V3_staticSeaStrict standard` |
| `longrun.mjs` | 3000 步漂移 + V3 不变量 | `node longrun.mjs V3_staticSeaStrict archipelago 3000` |
| `seaedits.mjs` | 海上注水 / 抽水 / 洪水 / 抬高海床后的边界归一化 | `node seaedits.mjs` |
| `downstream.mjs` | PlaneStage.update 成本 + **估算**排队字节（Node 无 WebGL，不是 GPU 上传实测） | `STEPS=40 node downstream.mjs` |
| `run-all.sh` | 依次运行全部并写入 `results/` | `bash run-all.sh` |

每个输出的第一行 / 字段 `provenance` 记录 `INKBOX_ROOT` 的 git rev 与关键文件 blob 前缀，用来确认测的是哪个版本。

## 已知限制
- Node 计时只看同批次相对值；不同批次绝对值可漂移 ±40%。
- S4「大坝」场景的坝没有蓄住水（第 50 步已干），溃坝**未被验证**；需要重造场景。
- 浏览器整帧 / GPU 数据不在本包内；H2 原始记录未附带。
- `results/` 为 2026-10-16 在 2 核 Xeon / Node 24.14.1 / main e1e5503 上的运行结果。
