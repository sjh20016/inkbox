# Inkbox G3-PERF-A0R 补证实验包（只读，零产品代码修改）

被测：github.com/sjh20016/inkbox @ bfabe00e3c0865721e5c426c4915a1f879498714
（分支 codex/g2-h3-terrain-color-pilot-luna；main.js / PlaneStage 行号与基线 74934a8 相同）
环境：Node v24.14.1 · three 0.186.1 · Amazon Linux 2023 · Xeon 2.90GHz ×2
固定参数：seed 673231 · preset expanse · generationVersion 2 · WARM 30 · 地图 standard / archipelago

## 复现
    git clone https://github.com/sjh20016/inkbox && cd inkbox
    git checkout bfabe00e3c0865721e5c426c4915a1f879498714 && npm ci
    export INKBOX_ROOT=$PWD; mkdir -p out; cd <本包目录>
    OUT=out/census.json        node census.mjs       > out/census.log
    OUT=out/census_rerun.json  node census.mjs       > out/census_rerun.log
    OUT=out/eps_contract.json  node eps_contract.mjs > out/eps_contract.log   # 可选 EPS=… TMAX=12 PLANE=mortal
    OUT=out/water_index.json   node water_index.mjs  > out/water_index.log
    MODE=real     OUT=out/replay_real.json     node replay.mjs > out/replay_real.log
    MODE=typeonly OUT=out/replay_typeonly.json node replay.mjs > out/replay_typeonly.log
    cp census_original_A0.json out/ && DIR=out node verify.mjs   # 期望末行 VERIFY OK

## 判定规则
- 计数、状态哈希链、排队字节：必须逐值一致（确定性模拟，与机器无关）。
- 时间（ms）：仅作参考，跨机器只比较比例与排序。
- verify.mjs 只读 JSON、不导入任何产品模块：独立复算 p50/p95、两次运行一致性、跨脚本哈希链一致性、原始 A0 计数复现。

## 文件
census.mjs 变化格普查+每步状态哈希 · replay.mjs 真实 PlaneStage 回放（real=真实模拟；typeonly=每步只改 1 格 type）
eps_contract.mjs ε 误差契约（凡间强度，T_max 行轮转，着色误差上界）· water_index.mjs 水面索引布局对照
verify.mjs 独立复算 · manifest.json sha256 清单 · *.json 原始逐步统计 · *.log 控制台输出
