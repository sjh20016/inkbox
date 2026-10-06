# M2-C2C 视觉验收

2026-10-06。完整23对本地浏览器矩阵、两祖先和耐久门禁通过；本文件以实际GPU、产品点击与地表像素证据验收。

## 配方和实际视角

凡界由Node正常生成 seed226 small，通过普通3日推进达到 day72000，使用产品 importFile 导入普通存档，同时存在四类当前 Site；不移动地点、改地形或删树。Upper/Nether 使用固定 NETHER_STYLE_A medium 的60年普通headless模拟存档，通过同一个产品 importFile 导入。前后原始R8历史来自同一轮自然模拟并独立校验SHA；产品存档沿用既有16-bit场量化，原始历史字节不回写导入后的World。两配方缺省缓存缺失或全部core/world/sim/io源码、Node/V8、存档SHA变化时，在测量前自动按同配方重建；显式缓存校验失败则拒绝。Browser与Soak共享Mortal预检和产品导入。

跨界通过正常 selectTool/commitSelection 打开真实两界窗口与 Rift；短命 cross FX 从普通推进捕获真实深冻结快照。原幽冥事件落在旧窗边缘外，完整足迹规则正确拒绝；现在只为FX通过普通划窗建立覆盖实际事件的专用视窗，取景也用真实事件坐标。新增划窗产生的Rifts如实计入setup，配对前才固定World；快照内容和Region规则没有改动。cross/rift/breach仍使用原视窗。

矩阵保留以下23个 geography off/on 正常配对：凡界 overview、四类 Site、Leyline、Site/village 混合；上界 overview、高/低同海拔 qi、真实entity、高界窗口；幽冥 overview、高/低同海拔 veg、实际ghost cluster、历史留痕、幽冥窗口；两种持久 Rift、两界 Rift-cross FX、breach near。各配对 World SHA、advance SHA和相机必须一致。

Site/Leyline 近景按整对象实际提交 bounds 控制80–100 projected pixels。Formation 多阵点合并构图范围，绝不把单石块放大到90px充当全阵。Picker 逐实际triangle centroid检查前方遮挡，再真实CDP点击返回当前id。开窗时 Mortal Site/Leyline 全footprint遵守自身Region；两界独立场只画各自submitted terrain quads。

## 阵法可见性修复

首轮 Formation105 的144个实际三角质心仅2次先命中阵法，134被地形、8被实体挡住；正常90px构图和World中心正确。CPU随后证实整块取最小角地面造成坡顶埋入。现在8/4阵点分别按自身真实角点贴地，完整父footprint与世界中心不变；自然实例最小顶角clearance +.190881。正式重跑的Formation105正常约90px构图，96个三角质心有38个先命中阵点，并真实点击返回id105；Secret98为37/72、Cave3为62/84、Ruin80为37/84，四类均保持原世界与相机配对。Ruin80由真实当前候选的有限镜头搜索选出，记录所有探针，无改地形/坐标/删树。失败尝试只留ignored proof。

## 幽冥历史证明

记录同一自然模拟的900日正veg增量与前后原始R8字节，固定当前World/advance/camera，临时借旧/新field texture比较真实前景terrain输出；恢复后当前cache字节和upload counters须完全相同。正常old-trace视角仍属正式矩阵，技术局部像素证明留proof，不充当Golden或新World痕迹。

真实样本(236,145)在day18000→18900由 .9581773 增至1，原R8为244→255。此前材质在.90提前饱和，真实三点加权值 .9184314→.9443137 被映成同一墨色；现仅把阴气响应上端延伸到1.0，正式GPU检查的441个实际前景地表样本中87个变化，RGB总差133；恢复后的当前场字节、upload counters、World/advance与camera相同。900日聚合没有关联单个消失的鬼；当前证据的因果边界见工程报告第12项。

## Golden / Proof

正式Golden经原图人工检查保留8张（7206282 bytes），路径为 reports/release/render3d-m2c2c/golden/：Mortal overview、Cave3、Formation105、Ruin80、Leyline2、Upper overview、正常Upper跨界全景、Nether高阴气/冥河。每张在compact summary记录源case、相机、World/advance SHA与图SHA。没有镜头钻山、Inspector异常、技术过度放大或伪造高场值的Golden。

完整46张配对、额外history/proof、计时JSON和失败尝试留reports/local/m2c2c/；远端重跑进入 c2c-browser.yml Actions Artifact。它们不进入runtime包，现有历史图不重写。

## 最终结论

本地视觉与工程验收通过：23对完整矩阵和同World/advance/camera断言、Site/Leyline前景实际triangle ray与CDP点击、87/441历史像素变化、两界实际冻结事件池化输出、两个关键祖先及600＋6000耐久全绿。完整矩阵中的高倍率界缘、old-trace局部和部分被真实界缘遮挡的Rift视角用于技术检查，没有列入Golden。另用原真实Rift在关闭玩家视窗的凡界镜头补拍两种持久伤口，World与相机配对不变；该诊断仍为pass:false/diagnosticComplete，不代替完整23对结论。树木、聚落和高差仍可自然遮挡微型地景，未为了截图移除世界内容。远端Push门禁以本轮main提交的Actions状态为准；手动C2C Browser/Nightly尚未运行，不引用旧C2B远端作本阶段的封板证据。

独立重生成的自然save/World/advance/history与原验收输入完全相同；干净克隆d9ca78b从缺失缓存自动生成，额外概览与Formation两对诊断完成、90px模型及真实105点击通过。初次cold失败和修复后的诊断独立留proof，compact summary记录SHA，不新增Golden或替代23对矩阵。
