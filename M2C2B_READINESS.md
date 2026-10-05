# M2-C2B Pass1 就绪与20项答复

2026-10-05。M2-C2B Pass 1 的 Packages 0–10 已在当前主线 `e0a851c` 完成远端封板，第一代正式资产生产体系成立。运行候选 `7e400a4` 的干净克隆安装 / 构建 / 实际 GLB / 九模式纯度 / 包审计通过；同一主线的 Push CI [37224093479](https://github.com/sjh20016/inkbox/actions/runs/37224093479)、手动 Windows Browser / C2B 矩阵与 soak [37224107941](https://github.com/sjh20016/inkbox/actions/runs/37224107941)、800 年 Nightly [37233858438](https://github.com/sjh20016/inkbox/actions/runs/37233858438) 均成功。

3D默认production assets开启；assets=off回到旧几何，art=legacy切旧配色，decorations=off仅关闭自然装饰，lod=off保留近档。历史基线探针显式assets=off，正式生产矩阵显式on；原断言和场景完整保留。

## 20项最终答复

1. 实验正式投产：bld_house/hut/manor/hall；既有修士模块继续复用。另有生成的三种普通ghost与中性地面法宝。
2. 仅装饰：自然化的rock/cliff/pillar/terrace/slab；没有身份、碰撞或拾取。arch本轮未投产。
3. 留Lab：bld_tower、bld_gate、bld_wall、bld_altar、bld_dorm、bld_alchemy、bld_scripture、bld_forge、bld_beastpen、bld_sectruin、terr_spiritfield、terr_spring、terr_blast、terr_battlefield、terr_lair、terr_immortalcave、cultivator_pack_traveler、cultivator_gourd_small。其余合法P候选ruin/cave/road/formation也没有在本轮接线。
4. 明确禁止：bld_bridge、terr_stairs、terr_plankwalk；也禁止没有World事实的浮空岛、宫殿、鬼城/幽冥组织。
5. 凡界正式建筑四种family：三种HOUSE轮廓＋真实HALL。
6. 同村variant deterministic；seed/village ID/永久中心/原坐标稳定，0模拟RNG。
7. 建筑LOD0 80/128/188/116；LOD1各30；LOD2各8；HLOD每簇14。ghost36/16/共享6；矿物42/20/6；法宝20/8/4。
8. HLOD保留settlement identity、真实成员、屋顶方向与同侧ownership；跨边回退单屋。
9. 每Host环境库加载一次；World替换/开关不重载，实际Network证据1 GLB+1环境atlas。
10. 实体atlas两个（原角色＋环境）；环境材质三份Stage-local、并复用角色body/rig材质。完整预热Scene驻留37材质引用；GPU textures8/programs14，包含原地形与标记资源。
11. 三界普通总览draws7–15；凡界12→15，跨界大窗22–23，真实裂隙近景33。
12. GOLDEN_A triangles179874→179934（+0.033%）。
13. DENSITY_A triangles282411→282397（-0.005%）。
14. Upper新增真实实体正式外观；纯表现五种自然岩层，复用原低谷洗染；无新地点或拓扑。
15. Nether真实ghost/ghostCultivator/地面法宝正式表现与精确检视；纯表现暗色岩体；无鬼城。
16. 未新增World/save字段，未改模拟、世界生成、Gameplay G或transfer。
17. 九模式600日World/advanceState/save SHA、save key set与11 RNG完全一致。完整SHA d5f6099af6c462cf3dfed5948cee63c0827192b3359f5640910598d015583e45。5直接流182879次，6隐藏流定位238次。
18. 6000实际帧GPU资源94/8/14不变，600生命周期实际update/render各600；GC heap峰值18553232 bytes，DOM与监听器首尾差0，GL/LINK与浏览器错误0。
19. 冻结a8基线：258 files / 7520162 bytes，ZIP 2404862 bytes。运行候选（未加最终报告）293 files / 8297843 bytes，ZIP 2554587 bytes；增加777681 / 149725 bytes。最终封板包精确增量见 [最终包度量](./reports/release/render3d-m2c2b-pass1/package-final-summary.json)，该开发证据与代表图都不进ZIP。
20. Pass 1 建立了第一代正式资产生产体系。下一阶段为已授权的 M2-C2C Meaningful Geography，先表现已有 World 语义；本轮不授权扩展 World 语义之外的上界文明、幽冥城市或浮空岛拓扑。新增资产按独立语义审计、预算与设备复验执行。

## 证据入口

[资产生产](./M2C2B_ASSET_PRODUCTION_REPORT.md) · [三界内容](./M2C2B_REALM_CONTENT_REPORT.md) · [性能](./M2C2B_PERFORMANCE_REPORT.md) · [视觉](./M2C2B_VISUAL_ACCEPTANCE.md) · [语义审计](./M2C2B_SEMANTIC_ASSET_BINDING.md)。本轮已授权的提交推送与CI持续生效。

