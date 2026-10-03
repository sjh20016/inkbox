# Phase 1 · Kenney Mini Characters 源文件审计

本轮目标为原创修仙 Mini 角色系统。参考包保持原样，不把 Kenney 身体换色当作成品，也不把原骨架、动画或网格复制进原创导出。

## 实际来源

`美术素材/范式素材参考/范式素材参考/kenney_mini-characters/`，Mini Characters 1.0。根目录 `License.txt` 为 CC0，包含 OBJ、GLB、FBX、预览图和 `Models/* format/Textures/colormap.png`。未发现 Blender 源文件。

## 来自模型数据的结论

| 项目 | 证据与含义 |
|---|---|
| male-a 几何 | `character-male-a.glb` 的 body/head POSITION accessor 为804/455；索引1350/819，对应450+273=723三角形。OBJ三角面计数一致。female-a为876三角形。不能直接当作250–450三角形的本项目基础体。 |
| 比例 | 同文件Y包络约0–0.6713，head包络约0.3432–0.6713；包含头发的头部约占总高49%，约2.05头身。本项目改为2.35头身。此数值是网格包络，不等同于解剖头高。 |
| 分件 | 2个mesh / 2个primitive，节点名 `body-mesh` 与 `head-mesh`。不是每一件衣物都在GLB中作为可更换节点。身体短，手脚为块状体积，头部和发式合并成大体块；无须复杂五官。 |
| 骨架 | root、leg-left/right、torso、arm-left/right、head，共7个骨节点。2个skin wrapper引用同一组7 joints；POSITION / NORMAL / UV / JOINTS_0 / WEIGHTS_0证明真实蒙皮。重复skin wrapper不等同于两套独立骨架。 |
| 材质 | 一个 `colormap` 材质，引用一张512×512、8706字节的共享色图。同格式目录共用色图。并非每角色一张PBR贴图。 |
| 动作 | male-a有32个实际动画（含static、idle、walk、sprint等）；Overview列12个男女变体×32=384个动画。首轮原创只制作Idle / Walk。 |
| 共享程度 | 同包角色使用相同骨架命名和atlas约定；每个独立GLB内部有自己的mesh资源。不能声称跨GLB已自动共享GPU几何。独立道具可作为Attachment参考。 |
| Pivot | GLB节点层级及统一局部坐标将头/身对齐，角色底部落在Y=0附近。原创规范另行固定脚底Root、米单位、socket局部坐标及应用变换，不能按预览图猜Pivot。 |

本次关键结论来自GLB JSON/accessor、OBJ面计数、PNG头与许可证，预览仅辅助识别轮廓。FBX存在但未解码，不对其内部结构作额外断言。

## 转化为原创系统的决定

1. 重新建立2.35头身、块状手鞋、低面头部、简单交领袍身和宽袖；普通修士没有外挂附件。
2. 共享基础网格、UV语义、16骨简骨架和四类socket。头发3种、剑1种、道具5种；六身份来自组合。
3. 一个12色色图和一个材质；宗门色通过实例palette映射。服装、头发、道具使用大色块，不添加细纹、飘带或精细发片。
4. 共享网格按模块实例化，身份不生成新身体；运行时不为每人建立SkinnedMesh或独立材质。
5. 保留rigged GLB及Idle/Walk供近景/后续动画；大群运行路径使用共享几何与实例数据。

Phase 1已完成。Phase 2先独立验收灰模，灰模通过前不制作六角色或道具。
