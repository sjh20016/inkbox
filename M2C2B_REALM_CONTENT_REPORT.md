# M2-C2B 三界内容 Pass1

## 凡界

HOUSE三种正式轮廓加真实HALL，共四种建筑family。暖白墙、黛瓦、温木和小屋浅赭顶由Stage色槽派发；院落/宗祠的源红金被中性木色替换，不制造阶层与宗门身份。运行自然GOLDEN_A有83 HOUSE与6 HALL；独立CPU配方为83与5，两种Sandbox初始化配方不同，不混作同一世界。

## 上界

已有真实实体复用修士body/rig，由level、faction、dao.path派发basic/alchemist/elder/sect_disciple。自然证据覆盖basic/alchemist/elder；这些场景没有真实sect_disciple，不能声称已做该分支的自然人口验收。

新增自然rock/cliff/pillar及低矮terrace/slab，布局只读真实height、slope、type、plane和seed。云端/留白沿用既有低谷洗染；本轮没有独立云平面、浮空岛、宫殿或新可走地形。容量256、屏幕160、近档64；布局不随相机重生成。

## 幽冥

自然NETHER_STYLE_A在21600日有120普通ghost、1真实ghostCultivator、120件地面法宝。普通ghost使用三种不透明尖收轮廓、共享固定批次；ghostCultivator沿用真实角色body、鬼发、冷灰衣、骨白肤和魂灯，少量朱红只来自这个已有语义。没有为普通ghost加魂灯、骷髅或独立透明骨骼。

地面法宝使用中性几何，只显示实际id/x/y/name/slot/tier/quality；不从名字猜武器造型。检视卡保留原形制、品阶、品质、功法与来源。幽冥自然rock/cliff/pillar容量192、屏幕96、近档40；没有鬼城、祭坛、幽冥宗门或红雾滤镜。

## 同屏和归属

一个Host/Renderer/Scene/Camera，三个原有PlaneStage，共用RegionGeometry和ElevationField。装饰的旋转保守占地覆盖每个格必须归属该Stage，边界失败即不提交；基座读取中心和四角最低高程，不造新地面。装饰不参加picker、碰撞、存档或身份。

实体/法宝/单屋沿用中心格归属，HLOD整簇及真实成员都必须在同侧，跨界簇回退单屋LOD2。21对视角保持同一完整World和相机；正常开窗/裂隙自然推进的模拟变化先记录，再进入纯表现成对测量。最大界缘误差为 1.827e-6，在Float32误差内；采样身份错配为0，Stage色板不被另一界污染。
