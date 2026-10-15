# M2-C2B Pass1 视觉验收

本地21对性能/归属矩阵、三种HOUSE近/中/远、真实HALL、9项Upper/ghost/ghostCultivator点击、5项地面法宝、7组装饰窗口均通过。长期Git每界只保留4张代表图，总计12张 / 10549080 bytes；全矩阵与soak日志留在ignored reports/CI artifact，golden不进玩家ZIP。

## 图像与裁决

凡界：三个屋顶/体量轮廓和真实宗祠构成村落节奏；温木/赭顶只局部出现，白墙黛瓦一致，远景屋顶簇保留纸白和间隙。上界：已有矿物山体与低谷洗染保持大留白，自然岩层增加近景空间层次；没有随机宫殿和新岛面。幽冥：焦墨骨白与更硬的轮廓成立，普通尖收鬼魂与带发型/魂灯的鬼修可分，地面法宝独立保留实际身份，朱红集中在真实魂灯和裂隙。

- [mortal-overview](./reports/release/render3d-m2c2b-pass1/golden/mortal-overview.png)
- [mortal-near](./reports/release/render3d-m2c2b-pass1/golden/mortal-near.png)
- [mortal-hlod](./reports/release/render3d-m2c2b-pass1/golden/mortal-hlod.png)
- [mortal-cross](./reports/release/render3d-m2c2b-pass1/golden/mortal-cross.png)
- [upper-overview](./reports/release/render3d-m2c2b-pass1/golden/upper-overview.png)
- [upper-highland](./reports/release/render3d-m2c2b-pass1/golden/upper-highland.png)
- [upper-entity](./reports/release/render3d-m2c2b-pass1/golden/upper-entity.png)
- [upper-cross](./reports/release/render3d-m2c2b-pass1/golden/upper-cross.png)
- [nether-overview](./reports/release/render3d-m2c2b-pass1/golden/nether-overview.png)
- [nether-ghost-cultivator](./reports/release/render3d-m2c2b-pass1/golden/nether-ghost-cultivator.png)
- [nether-artifact](./reports/release/render3d-m2c2b-pass1/golden/nether-artifact.png)
- [nether-cross](./reports/release/render3d-m2c2b-pass1/golden/nether-cross.png)

## 真实视觉边界

单屋仍按中心高程贴地，未做四角基础/地形整平，陡坡上可能出现悬边或埋边。小屋有意低矮：level1约2.075高，现有角色含发型最高约2.28；不能声称所有房屋都比人高。角色使用既有休止姿态实例，完整群体骨骼动画未实施。高山近景仍保留基线的陡峭地形与较强墨纹，个别观察角度会遮挡真实实体，点击验收另有最前方实际三角面证明。

普通单屋/实体/法宝的中心格归属不会裁剪跨边半个模型；装饰使用完整占地，HLOD拒绝混侧聚合。画面目标在本轮成立，但本次仅有本机AMD集成GPU实测和CI软件渲染器复验，第二批扩产需要另加目标设备预算。
