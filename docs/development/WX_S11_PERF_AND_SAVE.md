# WX-S1.1 性能、存档与RNG验收

本包不改 Life.step、stepEntity、advanceWorld、readEffects、save.js、sim/daoActivities.js、sim/sites.js 或 sim/artifacts.js。单个人物每次模拟步新增叙事查询为0；没有新增事件监听、RNG流、故事状态、保存字段或每帧全世界扫描。静态隔离断言进入原S1集成测试，S1.1定向断言加入Fast。

## 同机、同检查点查询

Node v24.11.1，CPU AMD Ryzen 9 8940HX with Radeon Graphics        。复用WX-D原自然100/400年档；人物分别为司徒长问 / 方问衡。每轮预热20次后计时100次主动查询。下面是一轮参考快照，不作为脆弱的绝对毫秒CI门槛；最终HEAD的完整原始统计见本地 `reports/local/wx-s11/perf/acceptance.json` 与PR。

| 世界 | median ms | P95 ms | max ms |
|---|---:|---:|---:|
| 100年 | 0.264 | 0.382 | 1.286 |
| 400年 | 1.131 | 1.496 | 3.064 |

复用原性能脚本新增可选 `--baseline`：在同一个Node进程中，独立深克隆恢复同一检查点，以基线／当前／当前／基线分别预热和读取100次。导出的基线源码固定来自 `f88fb2a`，文件哈希也写入报告，避免把正在修改的共享工作树误当旧版。

| 世界 | 基线两轮平均P95 ms | 当前两轮平均P95 ms | 变化 |
|---|---:|---:|---:|
| 100年 | 0.367 | 0.322 | -12.3% |
| 400年 | 1.300 | 1.323 | 1.8% |

各轮median/P95/max均保留在JSON，未因离群值删样本。早期分时M0和并发回归下的单轮毫秒数有波动；配对比较没有稳定超过25%的P95退化证据，不将Life墙钟抖动解释为故事加速或减速。最大值包含GC／调度等可能来源，未据采样断言具体原因。

节点选择只处理卡内至多24个来源／节点，渲染至多12个节点、24个来源；同日检查亦有固定上界。现有原物三界唯一归属核查仍是主动读取时的库存检查，不能宣称全人口扩张后常数成本。readWorldStories仅供手工研究／导出，不进入HUD/rAF。

## 完整世界与登记RNG

同一100/400年检查点每次先深克隆，再原生恢复Life、推进状态、玩家流和所有登记流。A/B/B/A各推进30日；B每3日主动读取同一人物。不是伪开关，也不改变模拟步长或输入。每轮对serializeWorld + captureRuntimeState整体摘要、runtime摘要分别作严格相等断言，同时记录Life/war/player及runtime.streams全部状态。四轮完整世界和RNG逐位一致。

| 世界 | 完整世界与RNG SHA256 | runtime SHA256 | 存档净增 |
|---|---|---|---:|
| 100年 | `eeea874b94edb3d759b646f6b0982cd9081b34c647348ede820a04da2d9a0456` | `6cfd35f7dabbc2a6c773900833ec6221dbe8d48c2e6bc6fa95942ac2a73b8469` | 0 byte |
| 400年 | `a589fd91d5ca35c4c0c3f8a4a82d4e18701293d4a955dbcb6dcc93715e8d24f3` | `4680209cec6e13d78c95878c23ebe44c6b3b9dd8dbe042d971e71ac444dab8a1` | 0 byte |

四次摘要、各登记流原始状态、输入检查点哈希、100次查询前后全快照相等及inputPreserved断言见JSON。原检查点对象不被查询或推进克隆串扰。没有新增保存键，SAVE_VERSION和v11万象/G8协议不变。原S1集成覆盖旧档、v11、首次建档、身份与跨界，相关Heavy继续保留。

## 重跑

```sh
node --expose-gc scripts/inkbox-wx-s1-perf.mjs --data=reports/local/wx-s1/natural --out=reports/local/wx-s11/perf --baseline=reports/local/wx-s11/baseline-source
```

baseline-source是从基线SHA完整导出的源码目录，至少包含其src树与package.json；可以用独立clone并checkout固定SHA获得。`--baseline`省略时仍执行单版查询、只读纯度及30日ABBA；不会自动生成或改变自然检查点。自然档来源见 [自然验收](./WX_S11_NATURAL_QA.md)。

软件WebGL仅作Three功能验收，不能证明成熟GPU帧率。800年、硬件GPU、WX-E的Life成本治理不在本包封板范围；WX-S2行动和人物旧约也未接入。
