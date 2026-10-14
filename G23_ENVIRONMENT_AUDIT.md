# G2.3 · 正式火灾与地貌审计

日期：2026-10-13。BASE：`9cbd0d83948bd0ca91df613af2dba1a1688cf9f3`，来自 G2.2 的有效开发分支。开工重新核对 main 为 `e1e55039bb56efda7a307513ede07a9fab3bf534`；G2.1 [PR #4](https://github.com/sjh20016/inkbox/pull/4)、G2.2 [PR #5](https://github.com/sjh20016/inkbox/pull/5) 均未合并且仍为 Draft。本轮不拉取、修改或合并 B数值系统。

| 机制 | 实际字段 | 推进周期 | 存档 | Canvas / Three 消费与原缺口 |
| --- | --- | --- | --- | --- |
| 正式焚林 `powers.burnForest` | `fire/veg/over`，局部重算 `type/qi` | 显式工具落笔 | 凡间 terrain 的 `fire/veg/over/type` | Canvas 两处火色；原 Three 无持续火势入口 |
| 雷击、陨石 `powers` | 正式调用 `ignite`；陨石另改高程等 | 显式干预 | 同上 | 不从 `combat-hit.style=fire` 点火 |
| `ecology.stepFire` | `fire/veg/over`，焦土脏格 | 每 0.8 游戏日，`advanceWorld` 原时钟 | 同上 | 原类型重算延迟；原边界格不参与燃烧/熄灭 |
| `ecology.stepVegetation` | `veg`；植被 >0.35 时清除焦土并重算 | 每 5 游戏日，原生态时钟 | 同上 | 两端读真实植被与地形；本轮不改恢复速率 |
| `terrain.decayOverlay` | 焦土→灰烬/无覆盖，灰烬→无覆盖，其他已有衰减 | 宿主每约 2.5 真实秒，以既有 `decayAccum+2.5*360` 输入推进；暂停不积累 | `over/type/veg` | 原非熔岩转变没有标记类型脏格，可能长期残留旧类型 |
| `extinguish`、雨水、洪水等 | `fire` 清零，相关工具另改水/湿度等 | 显式正式函数/工具 | 凡间 fire | Canvas 重画；原 Three 不检测 fire-only 变化 |
| 人物、建筑与行动 | `Life` 读取 fire 结算气血、村落耐久；World 准入读 fire | 原 Life / 建筑推进 | 既有人物、村落字段 | `fire>0.4` 有人物伤害，村中心有耐久影响；行走阈值 0.55，建造阈值 0.25 |
| 上界 / 幽冥 | 使用各自 `veg/over/type`；幽冥 veg 是阴气 | 各自既有模拟 | 子界六个地形层不含 fire | 子界不运行凡间火灾；不可复制凡间火势或把阴气增长叫植被恢复 |

权威状态是现有 World 数组；`type` 根据高程、水、覆盖等分类，`qi` 沿已有公式派生。`OVER` 是分类枚举而非位标志。焦土覆盖、灰烬覆盖可以与活火等独立事实共存；单格覆盖本身仍互斥。

正式活火判定为 `fire>0.01`，蔓延火源至少 0.12，植被增长在 `fire>0.05` 时暂停。Canvas 底图显示阈值是 0.02，放大后的动态火光阈值是 0.18；观察阈值不冒充每个弱火格都在画面上产生明显火光。

已证明的影响来自 `World.isWalkable/isBuildable`、`Life` 的火伤与村落耐久、现有地形肥力表和灵气推导。本轮不宣称存在新的动物避火决策、可居住区规划、永久灾害史或人物起火因果。已有 walkable 准入可影响行动，不能据此把任何一次移动都解释成主动逃火。

施工只修真实断点：火灾与覆盖衰减同步派生类型；补齐边界火格既有燃烧结算；为 Three 增加凡间 fire 的独立脏区与现有地表材质读取。保留概率、恢复速率、模拟时钟和原有随机流，显式点火造成后续世界和随机消耗变化属于真实因果。

接口与本轮验收见 [G2.3 交付报告](./G23_ENVIRONMENT_AFTERMATH_REPORT.md)，下一轮机制边界见 [火法设计](./G23_FUTURE_FIRE_ABILITY_DESIGN.md)。
