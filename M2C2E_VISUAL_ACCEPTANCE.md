# M2-C2E 视觉验收

2026-10-08，程序性几何与真实产品浏览器验收完成；最终主观绘画质量由用户裁决。保留旧C2D.1八张Golden，本阶段新增恰好八张正常产品截图，不是Debug proof替身。

E0开工十二镜、E1六个水/墙/界缘关键镜头、最终final-canonical-r3十二镜已完成。最终12镜同World/camera/GPU/buffer与开工对应，GL错误0。纸色外围墙上沿接真实ElevationField、下沿融入纸色；修复早期黑色厚板观感。湿域水三角和外周水帘有CPU几何及实际GPU证据；普通Picker真实world-edge命中拒绝雕刻，onlyPlane地表路径仍保留。

实际#inkCanvas3D鼠标覆盖山脊、削山、平滑、真实湿干岸边盆地、抬岸清水及近树编辑六个场景；每个都检查before/edited/Undo/Redo、量化save往返与实际geometry version。盆地湿格15065→15369，随后抬岸到15036；近树实例Y与ElevationField误差约1.06e-8。真实产品importFile恢复修改与开放进度，mask/slab/闭区拒绝鼠标写入；最终14/14检查通过。

| 正常Golden | 内容 |
| --- | --- |
| [01-mortal-overview.png](./reports/release/render3d-m2c2e/golden/01-mortal-overview.png) | 旧Canonical凡间全景 |
| [02-mortal-coast.png](./reports/release/render3d-m2c2e/golden/02-mortal-coast.png) | 真实湿域岸线与世界纸色侧壁 |
| [03-upper-boundary.png](./reports/release/render3d-m2c2e/golden/03-upper-boundary.png) | 上界视界坡地切口 |
| [04-nether-boundary.png](./reports/release/render3d-m2c2e/golden/04-nether-boundary.png) | 幽冥视界界缘 |
| [05-ridge-stroke.png](./reports/release/render3d-m2c2e/golden/05-ridge-stroke.png) | seed0群山与真实山脊笔划 |
| [06-wetland-basin.png](./reports/release/render3d-m2c2e/golden/06-wetland-basin.png) | seed1水泽岸边盆地 |
| [07-tree-ground-edit.png](./reports/release/render3d-m2c2e/golden/07-tree-ground-edit.png) | 近树编辑后即时贴地 |
| [08-expanse-full-map.png](./reports/release/render3d-m2c2e/golden/08-expanse-full-map.png) | 512×320群山全开放与1583实际实体 |

八图总计5955608字节；来源与SHA见[精简摘要](./reports/release/render3d-m2c2e/summary/acceptance-summary.json)。其余Canonical、Stress、Fuzz、失败现场和低角度/水幕proof只留本机ignored reports。最后一图是1500人受控密集fixture的全图正常斜视，并非凭空添加的表现模型。

程序性目视检查覆盖最终海岸、上界/幽冥坡地切口、盆地、山脊与512×320全图：无黑板外墙、透明水随机穿墙或明显高度缝。仍保留低多边形节奏、历史v1天然高频峰及玩家主动尖峰，不用视觉平滑偷偷改World。v2生成平滑的作用以108种子统计和正常大图说明，不承诺消灭全部多边形感。

早期失败运行均保留：测试路由/投影/目标清理错误修正后另开目录；真实发现的AccessGeometry与RealmDecoration接线、演化后Undo覆盖水文问题已修复并回归。成功证据来自browser-optimized、soak-optimized和final-canonical-r3，未用失败时旧图作为最终Golden。
