# M2-C2B Pass1 正式资产生产报告

2026-10-05。运行候选 `7e400a4` 的本地验收已完成；M2-C2B Pass 1 随后在主线 `e0a851c` 远端封板，第一代正式资产生产体系成立。Push CI [37224093479](https://github.com/sjh20016/inkbox/actions/runs/37224093479)、手动 Windows Browser / C2B 矩阵与 soak [37224107941](https://github.com/sjh20016/inkbox/actions/runs/37224107941) 和 800 年 Nightly [37233858438](https://github.com/sjh20016/inkbox/actions/runs/37233858438) 均成功。验收汇总见 [READINESS](./M2C2B_READINESS.md)。

## 正式运行内容

| 家族 | 真实绑定 | LOD0 / LOD1 / LOD2 / HLOD 三角形 |
|---|---|---|
| mortal.house.base | 当前 STRUCT.HOUSE，原屋舍键 | 80 / 30 / 8 / 14 |
| mortal.house.small | 同一 HOUSE 的小屋轮廓 | 128 / 30 / 8 / 14 |
| mortal.house.courtyard | 同一 HOUSE 的院落轮廓，不推断富户 | 188 / 30 / 8 / 14 |
| mortal.house.hall | 当前 STRUCT.HALL，原屋舍键 | 116 / 30 / 8 / 14 |
| nether.ghost.0/.1/.2 | Nether entities，soulKind=ghost | 每种 36 / 16 / 共享 6；无 HLOD |
| nether.artifact.ground | world.nether.artifacts 的真实无主物品 | 20 / 8 / 4；无 HLOD |
| environment.rock/cliff/pillar/terrace/slab | 无身份的地形附着装饰 | 每种 42 / 20 / 6；小于4px关闭 |

四种建筑源自原创 bld_house/hut/manor/hall。五种岩体经过自然化修订，去掉台基、祭坛台阶、横梁和规则碑柱线索。普通鬼魂与中性法宝标记新建于同一库。共 13 个资产 ID、41 个 geometry/node；GLB 168364 bytes。

## 管线和共享

一个 EnvironmentAssetLibrary、一次 GLB 请求、一次128×128环境索引 atlas 请求，三个 Stage 各有一个 EnvironmentMaterial。28个语义色槽由 RealmStyleProfile 决定。人物继续复用既有 body/rig/角色 atlas；实体类 atlas 合计2个，不能把地形高度/类型纹理误算作新增人物 atlas。完整预热场景驻留37个材质引用（包括原有地形、水、标记、LOD、FX），环境家族新增3个 Stage材质，而非每栋屋子新建材质。GPU最终为94 geometry / 8 texture / 14 program。

LOD批次借用库几何与Stage材质。World替换、关闭、异步失败和延迟完成均验证单次释放；实际GLB检查还覆盖索引、UV、法线、非均匀缩放、封口朝向和射线包围盒失效。Node纯度使用真实解码GLB/PNG，只以CPU renderer stub隔离GPU；真实GPU、输入和资源验收由Edge承担。

## 身份与确定性

村庄中心、永久 village.id、seed、原屋舍坐标决定稳定径向分带和成排屋顶方向；等级、人口、邻屋删除、数组顺序和相机都不重分配存续屋舍。当前 world.struct 排除已毁/清空的历史候选。HLOD仍是2–4簇，保留白墙黛瓦、屋顶 family/方向、体量差和间隙，拾取保留 settlement owner及真实成员。

未修改 World/save、模拟RNG、世界生成、Gameplay G或 planes.transfer。gate/wall/tower 仍在Lab；合法的 ruin/cave/road/formation 候选本轮未扩成地点家族。完整35件审计见 [语义表](./M2C2B_SEMANTIC_ASSET_BINDING.md)。

## 发布边界

运行包只带environment mesh/data/materials/docs和已接线代码；源GLB、OBJ/MTL、Blender、contact sheet、preview、实验单体和完整截图矩阵均被包审计排除。候选干净克隆安装、构建、11项实际GLB、9模式纯度和包审计通过。最终目录/ZIP大小由 [就绪报告](./M2C2B_READINESS.md) 记录。
